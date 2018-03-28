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
 function($0, $1, $2) { window.MbedJSHal.sht31.init($0, $1, $2); },
 function($0) { return window.MbedJSHal.sht31.read_temperature($0); },
 function($0) { return window.MbedJSHal.sht31.read_humidity($0); },
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

STATICTOP = STATIC_BASE + 14416;
/* global initializers */  __ATINIT__.push({ func: function() { __GLOBAL__sub_I_main_cpp() } });


memoryInitializer = "temperature.js.mem";





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
 sp = STACKTOP; //@line 3586
 STACKTOP = STACKTOP + 16 | 0; //@line 3587
 $1 = sp; //@line 3588
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 3595
   $7 = $6 >>> 3; //@line 3596
   $8 = HEAP32[3193] | 0; //@line 3597
   $9 = $8 >>> $7; //@line 3598
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 3604
    $16 = 12812 + ($14 << 1 << 2) | 0; //@line 3606
    $17 = $16 + 8 | 0; //@line 3607
    $18 = HEAP32[$17 >> 2] | 0; //@line 3608
    $19 = $18 + 8 | 0; //@line 3609
    $20 = HEAP32[$19 >> 2] | 0; //@line 3610
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[3193] = $8 & ~(1 << $14); //@line 3617
     } else {
      if ((HEAP32[3197] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 3622
      }
      $27 = $20 + 12 | 0; //@line 3625
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 3629
       HEAP32[$17 >> 2] = $20; //@line 3630
       break;
      } else {
       _abort(); //@line 3633
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 3638
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 3641
    $34 = $18 + $30 + 4 | 0; //@line 3643
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 3646
    $$0 = $19; //@line 3647
    STACKTOP = sp; //@line 3648
    return $$0 | 0; //@line 3648
   }
   $37 = HEAP32[3195] | 0; //@line 3650
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 3656
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 3659
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 3662
     $49 = $47 >>> 12 & 16; //@line 3664
     $50 = $47 >>> $49; //@line 3665
     $52 = $50 >>> 5 & 8; //@line 3667
     $54 = $50 >>> $52; //@line 3669
     $56 = $54 >>> 2 & 4; //@line 3671
     $58 = $54 >>> $56; //@line 3673
     $60 = $58 >>> 1 & 2; //@line 3675
     $62 = $58 >>> $60; //@line 3677
     $64 = $62 >>> 1 & 1; //@line 3679
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 3682
     $69 = 12812 + ($67 << 1 << 2) | 0; //@line 3684
     $70 = $69 + 8 | 0; //@line 3685
     $71 = HEAP32[$70 >> 2] | 0; //@line 3686
     $72 = $71 + 8 | 0; //@line 3687
     $73 = HEAP32[$72 >> 2] | 0; //@line 3688
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 3694
       HEAP32[3193] = $77; //@line 3695
       $98 = $77; //@line 3696
      } else {
       if ((HEAP32[3197] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 3701
       }
       $80 = $73 + 12 | 0; //@line 3704
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 3708
        HEAP32[$70 >> 2] = $73; //@line 3709
        $98 = $8; //@line 3710
        break;
       } else {
        _abort(); //@line 3713
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 3718
     $84 = $83 - $6 | 0; //@line 3719
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 3722
     $87 = $71 + $6 | 0; //@line 3723
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 3726
     HEAP32[$71 + $83 >> 2] = $84; //@line 3728
     if ($37 | 0) {
      $92 = HEAP32[3198] | 0; //@line 3731
      $93 = $37 >>> 3; //@line 3732
      $95 = 12812 + ($93 << 1 << 2) | 0; //@line 3734
      $96 = 1 << $93; //@line 3735
      if (!($98 & $96)) {
       HEAP32[3193] = $98 | $96; //@line 3740
       $$0199 = $95; //@line 3742
       $$pre$phiZ2D = $95 + 8 | 0; //@line 3742
      } else {
       $101 = $95 + 8 | 0; //@line 3744
       $102 = HEAP32[$101 >> 2] | 0; //@line 3745
       if ((HEAP32[3197] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 3749
       } else {
        $$0199 = $102; //@line 3752
        $$pre$phiZ2D = $101; //@line 3752
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 3755
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 3757
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 3759
      HEAP32[$92 + 12 >> 2] = $95; //@line 3761
     }
     HEAP32[3195] = $84; //@line 3763
     HEAP32[3198] = $87; //@line 3764
     $$0 = $72; //@line 3765
     STACKTOP = sp; //@line 3766
     return $$0 | 0; //@line 3766
    }
    $108 = HEAP32[3194] | 0; //@line 3768
    if (!$108) {
     $$0197 = $6; //@line 3771
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 3775
     $114 = $112 >>> 12 & 16; //@line 3777
     $115 = $112 >>> $114; //@line 3778
     $117 = $115 >>> 5 & 8; //@line 3780
     $119 = $115 >>> $117; //@line 3782
     $121 = $119 >>> 2 & 4; //@line 3784
     $123 = $119 >>> $121; //@line 3786
     $125 = $123 >>> 1 & 2; //@line 3788
     $127 = $123 >>> $125; //@line 3790
     $129 = $127 >>> 1 & 1; //@line 3792
     $134 = HEAP32[13076 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 3797
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 3801
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 3807
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 3810
      $$0193$lcssa$i = $138; //@line 3810
     } else {
      $$01926$i = $134; //@line 3812
      $$01935$i = $138; //@line 3812
      $146 = $143; //@line 3812
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 3817
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 3818
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 3819
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 3820
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 3826
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 3829
        $$0193$lcssa$i = $$$0193$i; //@line 3829
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 3832
        $$01935$i = $$$0193$i; //@line 3832
       }
      }
     }
     $157 = HEAP32[3197] | 0; //@line 3836
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 3839
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 3842
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 3845
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 3849
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 3851
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 3855
       $176 = HEAP32[$175 >> 2] | 0; //@line 3856
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 3859
        $179 = HEAP32[$178 >> 2] | 0; //@line 3860
        if (!$179) {
         $$3$i = 0; //@line 3863
         break;
        } else {
         $$1196$i = $179; //@line 3866
         $$1198$i = $178; //@line 3866
        }
       } else {
        $$1196$i = $176; //@line 3869
        $$1198$i = $175; //@line 3869
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 3872
        $182 = HEAP32[$181 >> 2] | 0; //@line 3873
        if ($182 | 0) {
         $$1196$i = $182; //@line 3876
         $$1198$i = $181; //@line 3876
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 3879
        $185 = HEAP32[$184 >> 2] | 0; //@line 3880
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 3885
         $$1198$i = $184; //@line 3885
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 3890
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 3893
        $$3$i = $$1196$i; //@line 3894
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 3899
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 3902
       }
       $169 = $167 + 12 | 0; //@line 3905
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 3909
       }
       $172 = $164 + 8 | 0; //@line 3912
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 3916
        HEAP32[$172 >> 2] = $167; //@line 3917
        $$3$i = $164; //@line 3918
        break;
       } else {
        _abort(); //@line 3921
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 3930
       $191 = 13076 + ($190 << 2) | 0; //@line 3931
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 3936
         if (!$$3$i) {
          HEAP32[3194] = $108 & ~(1 << $190); //@line 3942
          break L73;
         }
        } else {
         if ((HEAP32[3197] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 3949
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 3957
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[3197] | 0; //@line 3967
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 3970
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 3974
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 3976
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 3982
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 3986
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 3988
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 3994
       if ($214 | 0) {
        if ((HEAP32[3197] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 4000
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 4004
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 4006
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 4014
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 4017
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 4019
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 4022
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 4026
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 4029
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 4031
      if ($37 | 0) {
       $234 = HEAP32[3198] | 0; //@line 4034
       $235 = $37 >>> 3; //@line 4035
       $237 = 12812 + ($235 << 1 << 2) | 0; //@line 4037
       $238 = 1 << $235; //@line 4038
       if (!($8 & $238)) {
        HEAP32[3193] = $8 | $238; //@line 4043
        $$0189$i = $237; //@line 4045
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 4045
       } else {
        $242 = $237 + 8 | 0; //@line 4047
        $243 = HEAP32[$242 >> 2] | 0; //@line 4048
        if ((HEAP32[3197] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 4052
        } else {
         $$0189$i = $243; //@line 4055
         $$pre$phi$iZ2D = $242; //@line 4055
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 4058
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 4060
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 4062
       HEAP32[$234 + 12 >> 2] = $237; //@line 4064
      }
      HEAP32[3195] = $$0193$lcssa$i; //@line 4066
      HEAP32[3198] = $159; //@line 4067
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 4070
     STACKTOP = sp; //@line 4071
     return $$0 | 0; //@line 4071
    }
   } else {
    $$0197 = $6; //@line 4074
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 4079
   } else {
    $251 = $0 + 11 | 0; //@line 4081
    $252 = $251 & -8; //@line 4082
    $253 = HEAP32[3194] | 0; //@line 4083
    if (!$253) {
     $$0197 = $252; //@line 4086
    } else {
     $255 = 0 - $252 | 0; //@line 4088
     $256 = $251 >>> 8; //@line 4089
     if (!$256) {
      $$0358$i = 0; //@line 4092
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 4096
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 4100
       $262 = $256 << $261; //@line 4101
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 4104
       $267 = $262 << $265; //@line 4106
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 4109
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 4114
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 4120
      }
     }
     $282 = HEAP32[13076 + ($$0358$i << 2) >> 2] | 0; //@line 4124
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 4128
       $$3$i203 = 0; //@line 4128
       $$3350$i = $255; //@line 4128
       label = 81; //@line 4129
      } else {
       $$0342$i = 0; //@line 4136
       $$0347$i = $255; //@line 4136
       $$0353$i = $282; //@line 4136
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 4136
       $$0362$i = 0; //@line 4136
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 4141
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 4146
          $$435113$i = 0; //@line 4146
          $$435712$i = $$0353$i; //@line 4146
          label = 85; //@line 4147
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 4150
          $$1348$i = $292; //@line 4150
         }
        } else {
         $$1343$i = $$0342$i; //@line 4153
         $$1348$i = $$0347$i; //@line 4153
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 4156
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 4159
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 4163
        $302 = ($$0353$i | 0) == 0; //@line 4164
        if ($302) {
         $$2355$i = $$1363$i; //@line 4169
         $$3$i203 = $$1343$i; //@line 4169
         $$3350$i = $$1348$i; //@line 4169
         label = 81; //@line 4170
         break;
        } else {
         $$0342$i = $$1343$i; //@line 4173
         $$0347$i = $$1348$i; //@line 4173
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 4173
         $$0362$i = $$1363$i; //@line 4173
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 4183
       $309 = $253 & ($306 | 0 - $306); //@line 4186
       if (!$309) {
        $$0197 = $252; //@line 4189
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 4194
       $315 = $313 >>> 12 & 16; //@line 4196
       $316 = $313 >>> $315; //@line 4197
       $318 = $316 >>> 5 & 8; //@line 4199
       $320 = $316 >>> $318; //@line 4201
       $322 = $320 >>> 2 & 4; //@line 4203
       $324 = $320 >>> $322; //@line 4205
       $326 = $324 >>> 1 & 2; //@line 4207
       $328 = $324 >>> $326; //@line 4209
       $330 = $328 >>> 1 & 1; //@line 4211
       $$4$ph$i = 0; //@line 4217
       $$4357$ph$i = HEAP32[13076 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 4217
      } else {
       $$4$ph$i = $$3$i203; //@line 4219
       $$4357$ph$i = $$2355$i; //@line 4219
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 4223
       $$4351$lcssa$i = $$3350$i; //@line 4223
      } else {
       $$414$i = $$4$ph$i; //@line 4225
       $$435113$i = $$3350$i; //@line 4225
       $$435712$i = $$4357$ph$i; //@line 4225
       label = 85; //@line 4226
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 4231
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 4235
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 4236
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 4237
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 4238
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4244
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 4247
        $$4351$lcssa$i = $$$4351$i; //@line 4247
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 4250
        $$435113$i = $$$4351$i; //@line 4250
        label = 85; //@line 4251
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 4257
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[3195] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[3197] | 0; //@line 4263
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 4266
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 4269
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 4272
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 4276
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 4278
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 4282
         $371 = HEAP32[$370 >> 2] | 0; //@line 4283
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 4286
          $374 = HEAP32[$373 >> 2] | 0; //@line 4287
          if (!$374) {
           $$3372$i = 0; //@line 4290
           break;
          } else {
           $$1370$i = $374; //@line 4293
           $$1374$i = $373; //@line 4293
          }
         } else {
          $$1370$i = $371; //@line 4296
          $$1374$i = $370; //@line 4296
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 4299
          $377 = HEAP32[$376 >> 2] | 0; //@line 4300
          if ($377 | 0) {
           $$1370$i = $377; //@line 4303
           $$1374$i = $376; //@line 4303
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 4306
          $380 = HEAP32[$379 >> 2] | 0; //@line 4307
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 4312
           $$1374$i = $379; //@line 4312
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 4317
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 4320
          $$3372$i = $$1370$i; //@line 4321
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 4326
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 4329
         }
         $364 = $362 + 12 | 0; //@line 4332
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 4336
         }
         $367 = $359 + 8 | 0; //@line 4339
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 4343
          HEAP32[$367 >> 2] = $362; //@line 4344
          $$3372$i = $359; //@line 4345
          break;
         } else {
          _abort(); //@line 4348
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 4356
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 4359
         $386 = 13076 + ($385 << 2) | 0; //@line 4360
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 4365
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 4370
            HEAP32[3194] = $391; //@line 4371
            $475 = $391; //@line 4372
            break L164;
           }
          } else {
           if ((HEAP32[3197] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 4379
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 4387
            if (!$$3372$i) {
             $475 = $253; //@line 4390
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[3197] | 0; //@line 4398
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 4401
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 4405
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 4407
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 4413
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 4417
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 4419
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 4425
         if (!$409) {
          $475 = $253; //@line 4428
         } else {
          if ((HEAP32[3197] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 4433
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 4437
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 4439
           $475 = $253; //@line 4440
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 4449
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 4452
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 4454
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 4457
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 4461
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 4464
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 4466
         $428 = $$4351$lcssa$i >>> 3; //@line 4467
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 12812 + ($428 << 1 << 2) | 0; //@line 4471
          $432 = HEAP32[3193] | 0; //@line 4472
          $433 = 1 << $428; //@line 4473
          if (!($432 & $433)) {
           HEAP32[3193] = $432 | $433; //@line 4478
           $$0368$i = $431; //@line 4480
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 4480
          } else {
           $437 = $431 + 8 | 0; //@line 4482
           $438 = HEAP32[$437 >> 2] | 0; //@line 4483
           if ((HEAP32[3197] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 4487
           } else {
            $$0368$i = $438; //@line 4490
            $$pre$phi$i211Z2D = $437; //@line 4490
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 4493
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 4495
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 4497
          HEAP32[$354 + 12 >> 2] = $431; //@line 4499
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 4502
         if (!$444) {
          $$0361$i = 0; //@line 4505
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 4509
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 4513
           $450 = $444 << $449; //@line 4514
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 4517
           $455 = $450 << $453; //@line 4519
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 4522
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 4527
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 4533
          }
         }
         $469 = 13076 + ($$0361$i << 2) | 0; //@line 4536
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 4538
         $471 = $354 + 16 | 0; //@line 4539
         HEAP32[$471 + 4 >> 2] = 0; //@line 4541
         HEAP32[$471 >> 2] = 0; //@line 4542
         $473 = 1 << $$0361$i; //@line 4543
         if (!($475 & $473)) {
          HEAP32[3194] = $475 | $473; //@line 4548
          HEAP32[$469 >> 2] = $354; //@line 4549
          HEAP32[$354 + 24 >> 2] = $469; //@line 4551
          HEAP32[$354 + 12 >> 2] = $354; //@line 4553
          HEAP32[$354 + 8 >> 2] = $354; //@line 4555
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 4564
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 4564
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 4571
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 4575
          $494 = HEAP32[$492 >> 2] | 0; //@line 4577
          if (!$494) {
           label = 136; //@line 4580
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 4583
           $$0345$i = $494; //@line 4583
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[3197] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 4590
          } else {
           HEAP32[$492 >> 2] = $354; //@line 4593
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 4595
           HEAP32[$354 + 12 >> 2] = $354; //@line 4597
           HEAP32[$354 + 8 >> 2] = $354; //@line 4599
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 4604
          $502 = HEAP32[$501 >> 2] | 0; //@line 4605
          $503 = HEAP32[3197] | 0; //@line 4606
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 4612
           HEAP32[$501 >> 2] = $354; //@line 4613
           HEAP32[$354 + 8 >> 2] = $502; //@line 4615
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 4617
           HEAP32[$354 + 24 >> 2] = 0; //@line 4619
           break;
          } else {
           _abort(); //@line 4622
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 4629
       STACKTOP = sp; //@line 4630
       return $$0 | 0; //@line 4630
      } else {
       $$0197 = $252; //@line 4632
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[3195] | 0; //@line 4639
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 4642
  $515 = HEAP32[3198] | 0; //@line 4643
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 4646
   HEAP32[3198] = $517; //@line 4647
   HEAP32[3195] = $514; //@line 4648
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 4651
   HEAP32[$515 + $512 >> 2] = $514; //@line 4653
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 4656
  } else {
   HEAP32[3195] = 0; //@line 4658
   HEAP32[3198] = 0; //@line 4659
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 4662
   $526 = $515 + $512 + 4 | 0; //@line 4664
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 4667
  }
  $$0 = $515 + 8 | 0; //@line 4670
  STACKTOP = sp; //@line 4671
  return $$0 | 0; //@line 4671
 }
 $530 = HEAP32[3196] | 0; //@line 4673
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 4676
  HEAP32[3196] = $532; //@line 4677
  $533 = HEAP32[3199] | 0; //@line 4678
  $534 = $533 + $$0197 | 0; //@line 4679
  HEAP32[3199] = $534; //@line 4680
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 4683
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 4686
  $$0 = $533 + 8 | 0; //@line 4688
  STACKTOP = sp; //@line 4689
  return $$0 | 0; //@line 4689
 }
 if (!(HEAP32[3311] | 0)) {
  HEAP32[3313] = 4096; //@line 4694
  HEAP32[3312] = 4096; //@line 4695
  HEAP32[3314] = -1; //@line 4696
  HEAP32[3315] = -1; //@line 4697
  HEAP32[3316] = 0; //@line 4698
  HEAP32[3304] = 0; //@line 4699
  HEAP32[3311] = $1 & -16 ^ 1431655768; //@line 4703
  $548 = 4096; //@line 4704
 } else {
  $548 = HEAP32[3313] | 0; //@line 4707
 }
 $545 = $$0197 + 48 | 0; //@line 4709
 $546 = $$0197 + 47 | 0; //@line 4710
 $547 = $548 + $546 | 0; //@line 4711
 $549 = 0 - $548 | 0; //@line 4712
 $550 = $547 & $549; //@line 4713
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 4716
  STACKTOP = sp; //@line 4717
  return $$0 | 0; //@line 4717
 }
 $552 = HEAP32[3303] | 0; //@line 4719
 if ($552 | 0) {
  $554 = HEAP32[3301] | 0; //@line 4722
  $555 = $554 + $550 | 0; //@line 4723
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 4728
   STACKTOP = sp; //@line 4729
   return $$0 | 0; //@line 4729
  }
 }
 L244 : do {
  if (!(HEAP32[3304] & 4)) {
   $561 = HEAP32[3199] | 0; //@line 4737
   L246 : do {
    if (!$561) {
     label = 163; //@line 4741
    } else {
     $$0$i$i = 13220; //@line 4743
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 4745
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 4748
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 4757
      if (!$570) {
       label = 163; //@line 4760
       break L246;
      } else {
       $$0$i$i = $570; //@line 4763
      }
     }
     $595 = $547 - $530 & $549; //@line 4767
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 4770
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 4778
       } else {
        $$723947$i = $595; //@line 4780
        $$748$i = $597; //@line 4780
        label = 180; //@line 4781
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 4785
       $$2253$ph$i = $595; //@line 4785
       label = 171; //@line 4786
      }
     } else {
      $$2234243136$i = 0; //@line 4789
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 4795
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 4798
     } else {
      $574 = $572; //@line 4800
      $575 = HEAP32[3312] | 0; //@line 4801
      $576 = $575 + -1 | 0; //@line 4802
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 4810
      $584 = HEAP32[3301] | 0; //@line 4811
      $585 = $$$i + $584 | 0; //@line 4812
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[3303] | 0; //@line 4817
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 4824
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 4828
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 4831
        $$748$i = $572; //@line 4831
        label = 180; //@line 4832
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 4835
        $$2253$ph$i = $$$i; //@line 4835
        label = 171; //@line 4836
       }
      } else {
       $$2234243136$i = 0; //@line 4839
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 4846
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 4855
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 4858
       $$748$i = $$2247$ph$i; //@line 4858
       label = 180; //@line 4859
       break L244;
      }
     }
     $607 = HEAP32[3313] | 0; //@line 4863
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 4867
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 4870
      $$748$i = $$2247$ph$i; //@line 4870
      label = 180; //@line 4871
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 4877
      $$2234243136$i = 0; //@line 4878
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 4882
      $$748$i = $$2247$ph$i; //@line 4882
      label = 180; //@line 4883
      break L244;
     }
    }
   } while (0);
   HEAP32[3304] = HEAP32[3304] | 4; //@line 4890
   $$4236$i = $$2234243136$i; //@line 4891
   label = 178; //@line 4892
  } else {
   $$4236$i = 0; //@line 4894
   label = 178; //@line 4895
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 4901
   $621 = _sbrk(0) | 0; //@line 4902
   $627 = $621 - $620 | 0; //@line 4910
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 4912
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 4920
    $$748$i = $620; //@line 4920
    label = 180; //@line 4921
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[3301] | 0) + $$723947$i | 0; //@line 4927
  HEAP32[3301] = $633; //@line 4928
  if ($633 >>> 0 > (HEAP32[3302] | 0) >>> 0) {
   HEAP32[3302] = $633; //@line 4932
  }
  $636 = HEAP32[3199] | 0; //@line 4934
  do {
   if (!$636) {
    $638 = HEAP32[3197] | 0; //@line 4938
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[3197] = $$748$i; //@line 4943
    }
    HEAP32[3305] = $$748$i; //@line 4945
    HEAP32[3306] = $$723947$i; //@line 4946
    HEAP32[3308] = 0; //@line 4947
    HEAP32[3202] = HEAP32[3311]; //@line 4949
    HEAP32[3201] = -1; //@line 4950
    HEAP32[3206] = 12812; //@line 4951
    HEAP32[3205] = 12812; //@line 4952
    HEAP32[3208] = 12820; //@line 4953
    HEAP32[3207] = 12820; //@line 4954
    HEAP32[3210] = 12828; //@line 4955
    HEAP32[3209] = 12828; //@line 4956
    HEAP32[3212] = 12836; //@line 4957
    HEAP32[3211] = 12836; //@line 4958
    HEAP32[3214] = 12844; //@line 4959
    HEAP32[3213] = 12844; //@line 4960
    HEAP32[3216] = 12852; //@line 4961
    HEAP32[3215] = 12852; //@line 4962
    HEAP32[3218] = 12860; //@line 4963
    HEAP32[3217] = 12860; //@line 4964
    HEAP32[3220] = 12868; //@line 4965
    HEAP32[3219] = 12868; //@line 4966
    HEAP32[3222] = 12876; //@line 4967
    HEAP32[3221] = 12876; //@line 4968
    HEAP32[3224] = 12884; //@line 4969
    HEAP32[3223] = 12884; //@line 4970
    HEAP32[3226] = 12892; //@line 4971
    HEAP32[3225] = 12892; //@line 4972
    HEAP32[3228] = 12900; //@line 4973
    HEAP32[3227] = 12900; //@line 4974
    HEAP32[3230] = 12908; //@line 4975
    HEAP32[3229] = 12908; //@line 4976
    HEAP32[3232] = 12916; //@line 4977
    HEAP32[3231] = 12916; //@line 4978
    HEAP32[3234] = 12924; //@line 4979
    HEAP32[3233] = 12924; //@line 4980
    HEAP32[3236] = 12932; //@line 4981
    HEAP32[3235] = 12932; //@line 4982
    HEAP32[3238] = 12940; //@line 4983
    HEAP32[3237] = 12940; //@line 4984
    HEAP32[3240] = 12948; //@line 4985
    HEAP32[3239] = 12948; //@line 4986
    HEAP32[3242] = 12956; //@line 4987
    HEAP32[3241] = 12956; //@line 4988
    HEAP32[3244] = 12964; //@line 4989
    HEAP32[3243] = 12964; //@line 4990
    HEAP32[3246] = 12972; //@line 4991
    HEAP32[3245] = 12972; //@line 4992
    HEAP32[3248] = 12980; //@line 4993
    HEAP32[3247] = 12980; //@line 4994
    HEAP32[3250] = 12988; //@line 4995
    HEAP32[3249] = 12988; //@line 4996
    HEAP32[3252] = 12996; //@line 4997
    HEAP32[3251] = 12996; //@line 4998
    HEAP32[3254] = 13004; //@line 4999
    HEAP32[3253] = 13004; //@line 5000
    HEAP32[3256] = 13012; //@line 5001
    HEAP32[3255] = 13012; //@line 5002
    HEAP32[3258] = 13020; //@line 5003
    HEAP32[3257] = 13020; //@line 5004
    HEAP32[3260] = 13028; //@line 5005
    HEAP32[3259] = 13028; //@line 5006
    HEAP32[3262] = 13036; //@line 5007
    HEAP32[3261] = 13036; //@line 5008
    HEAP32[3264] = 13044; //@line 5009
    HEAP32[3263] = 13044; //@line 5010
    HEAP32[3266] = 13052; //@line 5011
    HEAP32[3265] = 13052; //@line 5012
    HEAP32[3268] = 13060; //@line 5013
    HEAP32[3267] = 13060; //@line 5014
    $642 = $$723947$i + -40 | 0; //@line 5015
    $644 = $$748$i + 8 | 0; //@line 5017
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 5022
    $650 = $$748$i + $649 | 0; //@line 5023
    $651 = $642 - $649 | 0; //@line 5024
    HEAP32[3199] = $650; //@line 5025
    HEAP32[3196] = $651; //@line 5026
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 5029
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 5032
    HEAP32[3200] = HEAP32[3315]; //@line 5034
   } else {
    $$024367$i = 13220; //@line 5036
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 5038
     $658 = $$024367$i + 4 | 0; //@line 5039
     $659 = HEAP32[$658 >> 2] | 0; //@line 5040
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 5044
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 5048
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 5053
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 5067
       $673 = (HEAP32[3196] | 0) + $$723947$i | 0; //@line 5069
       $675 = $636 + 8 | 0; //@line 5071
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 5076
       $681 = $636 + $680 | 0; //@line 5077
       $682 = $673 - $680 | 0; //@line 5078
       HEAP32[3199] = $681; //@line 5079
       HEAP32[3196] = $682; //@line 5080
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 5083
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 5086
       HEAP32[3200] = HEAP32[3315]; //@line 5088
       break;
      }
     }
    }
    $688 = HEAP32[3197] | 0; //@line 5093
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[3197] = $$748$i; //@line 5096
     $753 = $$748$i; //@line 5097
    } else {
     $753 = $688; //@line 5099
    }
    $690 = $$748$i + $$723947$i | 0; //@line 5101
    $$124466$i = 13220; //@line 5102
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 5107
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 5111
     if (!$694) {
      $$0$i$i$i = 13220; //@line 5114
      break;
     } else {
      $$124466$i = $694; //@line 5117
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 5126
      $700 = $$124466$i + 4 | 0; //@line 5127
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 5130
      $704 = $$748$i + 8 | 0; //@line 5132
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 5138
      $712 = $690 + 8 | 0; //@line 5140
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 5146
      $722 = $710 + $$0197 | 0; //@line 5150
      $723 = $718 - $710 - $$0197 | 0; //@line 5151
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 5154
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[3196] | 0) + $723 | 0; //@line 5159
        HEAP32[3196] = $728; //@line 5160
        HEAP32[3199] = $722; //@line 5161
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 5164
       } else {
        if ((HEAP32[3198] | 0) == ($718 | 0)) {
         $734 = (HEAP32[3195] | 0) + $723 | 0; //@line 5170
         HEAP32[3195] = $734; //@line 5171
         HEAP32[3198] = $722; //@line 5172
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 5175
         HEAP32[$722 + $734 >> 2] = $734; //@line 5177
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 5181
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 5185
         $743 = $739 >>> 3; //@line 5186
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 5191
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 5193
           $750 = 12812 + ($743 << 1 << 2) | 0; //@line 5195
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 5201
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 5210
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[3193] = HEAP32[3193] & ~(1 << $743); //@line 5220
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 5227
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 5231
             }
             $764 = $748 + 8 | 0; //@line 5234
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 5238
              break;
             }
             _abort(); //@line 5241
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 5246
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 5247
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 5250
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 5252
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 5256
             $783 = $782 + 4 | 0; //@line 5257
             $784 = HEAP32[$783 >> 2] | 0; //@line 5258
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 5261
              if (!$786) {
               $$3$i$i = 0; //@line 5264
               break;
              } else {
               $$1291$i$i = $786; //@line 5267
               $$1293$i$i = $782; //@line 5267
              }
             } else {
              $$1291$i$i = $784; //@line 5270
              $$1293$i$i = $783; //@line 5270
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 5273
              $789 = HEAP32[$788 >> 2] | 0; //@line 5274
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 5277
               $$1293$i$i = $788; //@line 5277
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 5280
              $792 = HEAP32[$791 >> 2] | 0; //@line 5281
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 5286
               $$1293$i$i = $791; //@line 5286
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 5291
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 5294
              $$3$i$i = $$1291$i$i; //@line 5295
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 5300
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 5303
             }
             $776 = $774 + 12 | 0; //@line 5306
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 5310
             }
             $779 = $771 + 8 | 0; //@line 5313
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 5317
              HEAP32[$779 >> 2] = $774; //@line 5318
              $$3$i$i = $771; //@line 5319
              break;
             } else {
              _abort(); //@line 5322
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 5332
           $798 = 13076 + ($797 << 2) | 0; //@line 5333
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 5338
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[3194] = HEAP32[3194] & ~(1 << $797); //@line 5347
             break L311;
            } else {
             if ((HEAP32[3197] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 5353
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 5361
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[3197] | 0; //@line 5371
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 5374
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 5378
           $815 = $718 + 16 | 0; //@line 5379
           $816 = HEAP32[$815 >> 2] | 0; //@line 5380
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 5386
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 5390
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 5392
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 5398
           if (!$822) {
            break;
           }
           if ((HEAP32[3197] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 5406
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 5410
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 5412
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 5419
         $$0287$i$i = $742 + $723 | 0; //@line 5419
        } else {
         $$0$i17$i = $718; //@line 5421
         $$0287$i$i = $723; //@line 5421
        }
        $830 = $$0$i17$i + 4 | 0; //@line 5423
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 5426
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 5429
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 5431
        $836 = $$0287$i$i >>> 3; //@line 5432
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 12812 + ($836 << 1 << 2) | 0; //@line 5436
         $840 = HEAP32[3193] | 0; //@line 5437
         $841 = 1 << $836; //@line 5438
         do {
          if (!($840 & $841)) {
           HEAP32[3193] = $840 | $841; //@line 5444
           $$0295$i$i = $839; //@line 5446
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 5446
          } else {
           $845 = $839 + 8 | 0; //@line 5448
           $846 = HEAP32[$845 >> 2] | 0; //@line 5449
           if ((HEAP32[3197] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 5453
            $$pre$phi$i19$iZ2D = $845; //@line 5453
            break;
           }
           _abort(); //@line 5456
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 5460
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 5462
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 5464
         HEAP32[$722 + 12 >> 2] = $839; //@line 5466
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 5469
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 5473
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 5477
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 5482
          $858 = $852 << $857; //@line 5483
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 5486
          $863 = $858 << $861; //@line 5488
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 5491
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 5496
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 5502
         }
        } while (0);
        $877 = 13076 + ($$0296$i$i << 2) | 0; //@line 5505
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 5507
        $879 = $722 + 16 | 0; //@line 5508
        HEAP32[$879 + 4 >> 2] = 0; //@line 5510
        HEAP32[$879 >> 2] = 0; //@line 5511
        $881 = HEAP32[3194] | 0; //@line 5512
        $882 = 1 << $$0296$i$i; //@line 5513
        if (!($881 & $882)) {
         HEAP32[3194] = $881 | $882; //@line 5518
         HEAP32[$877 >> 2] = $722; //@line 5519
         HEAP32[$722 + 24 >> 2] = $877; //@line 5521
         HEAP32[$722 + 12 >> 2] = $722; //@line 5523
         HEAP32[$722 + 8 >> 2] = $722; //@line 5525
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 5534
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 5534
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 5541
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 5545
         $902 = HEAP32[$900 >> 2] | 0; //@line 5547
         if (!$902) {
          label = 260; //@line 5550
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 5553
          $$0289$i$i = $902; //@line 5553
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[3197] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 5560
         } else {
          HEAP32[$900 >> 2] = $722; //@line 5563
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 5565
          HEAP32[$722 + 12 >> 2] = $722; //@line 5567
          HEAP32[$722 + 8 >> 2] = $722; //@line 5569
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 5574
         $910 = HEAP32[$909 >> 2] | 0; //@line 5575
         $911 = HEAP32[3197] | 0; //@line 5576
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 5582
          HEAP32[$909 >> 2] = $722; //@line 5583
          HEAP32[$722 + 8 >> 2] = $910; //@line 5585
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 5587
          HEAP32[$722 + 24 >> 2] = 0; //@line 5589
          break;
         } else {
          _abort(); //@line 5592
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 5599
      STACKTOP = sp; //@line 5600
      return $$0 | 0; //@line 5600
     } else {
      $$0$i$i$i = 13220; //@line 5602
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 5606
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 5611
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 5619
    }
    $927 = $923 + -47 | 0; //@line 5621
    $929 = $927 + 8 | 0; //@line 5623
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 5629
    $936 = $636 + 16 | 0; //@line 5630
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 5632
    $939 = $938 + 8 | 0; //@line 5633
    $940 = $938 + 24 | 0; //@line 5634
    $941 = $$723947$i + -40 | 0; //@line 5635
    $943 = $$748$i + 8 | 0; //@line 5637
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 5642
    $949 = $$748$i + $948 | 0; //@line 5643
    $950 = $941 - $948 | 0; //@line 5644
    HEAP32[3199] = $949; //@line 5645
    HEAP32[3196] = $950; //@line 5646
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 5649
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 5652
    HEAP32[3200] = HEAP32[3315]; //@line 5654
    $956 = $938 + 4 | 0; //@line 5655
    HEAP32[$956 >> 2] = 27; //@line 5656
    HEAP32[$939 >> 2] = HEAP32[3305]; //@line 5657
    HEAP32[$939 + 4 >> 2] = HEAP32[3306]; //@line 5657
    HEAP32[$939 + 8 >> 2] = HEAP32[3307]; //@line 5657
    HEAP32[$939 + 12 >> 2] = HEAP32[3308]; //@line 5657
    HEAP32[3305] = $$748$i; //@line 5658
    HEAP32[3306] = $$723947$i; //@line 5659
    HEAP32[3308] = 0; //@line 5660
    HEAP32[3307] = $939; //@line 5661
    $958 = $940; //@line 5662
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 5664
     HEAP32[$958 >> 2] = 7; //@line 5665
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 5678
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 5681
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 5684
     HEAP32[$938 >> 2] = $964; //@line 5685
     $969 = $964 >>> 3; //@line 5686
     if ($964 >>> 0 < 256) {
      $972 = 12812 + ($969 << 1 << 2) | 0; //@line 5690
      $973 = HEAP32[3193] | 0; //@line 5691
      $974 = 1 << $969; //@line 5692
      if (!($973 & $974)) {
       HEAP32[3193] = $973 | $974; //@line 5697
       $$0211$i$i = $972; //@line 5699
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 5699
      } else {
       $978 = $972 + 8 | 0; //@line 5701
       $979 = HEAP32[$978 >> 2] | 0; //@line 5702
       if ((HEAP32[3197] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 5706
       } else {
        $$0211$i$i = $979; //@line 5709
        $$pre$phi$i$iZ2D = $978; //@line 5709
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 5712
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 5714
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 5716
      HEAP32[$636 + 12 >> 2] = $972; //@line 5718
      break;
     }
     $985 = $964 >>> 8; //@line 5721
     if (!$985) {
      $$0212$i$i = 0; //@line 5724
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 5728
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 5732
       $991 = $985 << $990; //@line 5733
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 5736
       $996 = $991 << $994; //@line 5738
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 5741
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 5746
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 5752
      }
     }
     $1010 = 13076 + ($$0212$i$i << 2) | 0; //@line 5755
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 5757
     HEAP32[$636 + 20 >> 2] = 0; //@line 5759
     HEAP32[$936 >> 2] = 0; //@line 5760
     $1013 = HEAP32[3194] | 0; //@line 5761
     $1014 = 1 << $$0212$i$i; //@line 5762
     if (!($1013 & $1014)) {
      HEAP32[3194] = $1013 | $1014; //@line 5767
      HEAP32[$1010 >> 2] = $636; //@line 5768
      HEAP32[$636 + 24 >> 2] = $1010; //@line 5770
      HEAP32[$636 + 12 >> 2] = $636; //@line 5772
      HEAP32[$636 + 8 >> 2] = $636; //@line 5774
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 5783
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 5783
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 5790
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 5794
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 5796
      if (!$1034) {
       label = 286; //@line 5799
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 5802
       $$0207$i$i = $1034; //@line 5802
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[3197] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 5809
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 5812
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 5814
       HEAP32[$636 + 12 >> 2] = $636; //@line 5816
       HEAP32[$636 + 8 >> 2] = $636; //@line 5818
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 5823
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 5824
      $1043 = HEAP32[3197] | 0; //@line 5825
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 5831
       HEAP32[$1041 >> 2] = $636; //@line 5832
       HEAP32[$636 + 8 >> 2] = $1042; //@line 5834
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 5836
       HEAP32[$636 + 24 >> 2] = 0; //@line 5838
       break;
      } else {
       _abort(); //@line 5841
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[3196] | 0; //@line 5848
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 5851
   HEAP32[3196] = $1054; //@line 5852
   $1055 = HEAP32[3199] | 0; //@line 5853
   $1056 = $1055 + $$0197 | 0; //@line 5854
   HEAP32[3199] = $1056; //@line 5855
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 5858
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 5861
   $$0 = $1055 + 8 | 0; //@line 5863
   STACKTOP = sp; //@line 5864
   return $$0 | 0; //@line 5864
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 5868
 $$0 = 0; //@line 5869
 STACKTOP = sp; //@line 5870
 return $$0 | 0; //@line 5870
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9922
 STACKTOP = STACKTOP + 560 | 0; //@line 9923
 $6 = sp + 8 | 0; //@line 9924
 $7 = sp; //@line 9925
 $8 = sp + 524 | 0; //@line 9926
 $9 = $8; //@line 9927
 $10 = sp + 512 | 0; //@line 9928
 HEAP32[$7 >> 2] = 0; //@line 9929
 $11 = $10 + 12 | 0; //@line 9930
 ___DOUBLE_BITS_677($1) | 0; //@line 9931
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 9936
  $$0520 = 1; //@line 9936
  $$0521 = 6024; //@line 9936
 } else {
  $$0471 = $1; //@line 9947
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 9947
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 6025 : 6030 : 6027; //@line 9947
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 9949
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 9958
   $31 = $$0520 + 3 | 0; //@line 9963
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 9965
   _out_670($0, $$0521, $$0520); //@line 9966
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 6051 : 6055 : $27 ? 6043 : 6047, 3); //@line 9967
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 9969
   $$sink560 = $31; //@line 9970
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 9973
   $36 = $35 != 0.0; //@line 9974
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 9978
   }
   $39 = $5 | 32; //@line 9980
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 9983
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 9986
    $44 = $$0520 | 2; //@line 9987
    $46 = 12 - $3 | 0; //@line 9989
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 9994
     } else {
      $$0509585 = 8.0; //@line 9996
      $$1508586 = $46; //@line 9996
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 9998
       $$0509585 = $$0509585 * 16.0; //@line 9999
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 10014
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 10019
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 10024
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 10027
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 10030
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 10033
     HEAP8[$68 >> 0] = 48; //@line 10034
     $$0511 = $68; //@line 10035
    } else {
     $$0511 = $66; //@line 10037
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 10044
    $76 = $$0511 + -2 | 0; //@line 10047
    HEAP8[$76 >> 0] = $5 + 15; //@line 10048
    $77 = ($3 | 0) < 1; //@line 10049
    $79 = ($4 & 8 | 0) == 0; //@line 10051
    $$0523 = $8; //@line 10052
    $$2473 = $$1472; //@line 10052
    while (1) {
     $80 = ~~$$2473; //@line 10054
     $86 = $$0523 + 1 | 0; //@line 10060
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[6059 + $80 >> 0]; //@line 10061
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 10064
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 10073
      } else {
       HEAP8[$86 >> 0] = 46; //@line 10076
       $$1524 = $$0523 + 2 | 0; //@line 10077
      }
     } else {
      $$1524 = $86; //@line 10080
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 10084
     }
    }
    $$pre693 = $$1524; //@line 10090
    if (!$3) {
     label = 24; //@line 10092
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 10100
      $$sink = $3 + 2 | 0; //@line 10100
     } else {
      label = 24; //@line 10102
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 10106
     $$pre$phi691Z2D = $101; //@line 10107
     $$sink = $101; //@line 10107
    }
    $104 = $11 - $76 | 0; //@line 10111
    $106 = $104 + $44 + $$sink | 0; //@line 10113
    _pad_676($0, 32, $2, $106, $4); //@line 10114
    _out_670($0, $$0521$, $44); //@line 10115
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 10117
    _out_670($0, $8, $$pre$phi691Z2D); //@line 10118
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 10120
    _out_670($0, $76, $104); //@line 10121
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 10123
    $$sink560 = $106; //@line 10124
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 10128
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 10132
    HEAP32[$7 >> 2] = $113; //@line 10133
    $$3 = $35 * 268435456.0; //@line 10134
    $$pr = $113; //@line 10134
   } else {
    $$3 = $35; //@line 10137
    $$pr = HEAP32[$7 >> 2] | 0; //@line 10137
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 10141
   $$0498 = $$561; //@line 10142
   $$4 = $$3; //@line 10142
   do {
    $116 = ~~$$4 >>> 0; //@line 10144
    HEAP32[$$0498 >> 2] = $116; //@line 10145
    $$0498 = $$0498 + 4 | 0; //@line 10146
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 10149
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 10159
    $$1499662 = $$0498; //@line 10159
    $124 = $$pr; //@line 10159
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 10162
     $$0488655 = $$1499662 + -4 | 0; //@line 10163
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 10166
     } else {
      $$0488657 = $$0488655; //@line 10168
      $$0497656 = 0; //@line 10168
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 10171
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 10173
       $131 = tempRet0; //@line 10174
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 10175
       HEAP32[$$0488657 >> 2] = $132; //@line 10177
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 10178
       $$0488657 = $$0488657 + -4 | 0; //@line 10180
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 10190
      } else {
       $138 = $$1482663 + -4 | 0; //@line 10192
       HEAP32[$138 >> 2] = $$0497656; //@line 10193
       $$2483$ph = $138; //@line 10194
      }
     }
     $$2500 = $$1499662; //@line 10197
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 10203
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 10207
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 10213
     HEAP32[$7 >> 2] = $144; //@line 10214
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 10217
      $$1499662 = $$2500; //@line 10217
      $124 = $144; //@line 10217
     } else {
      $$1482$lcssa = $$2483$ph; //@line 10219
      $$1499$lcssa = $$2500; //@line 10219
      $$pr566 = $144; //@line 10219
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 10224
    $$1499$lcssa = $$0498; //@line 10224
    $$pr566 = $$pr; //@line 10224
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 10230
    $150 = ($39 | 0) == 102; //@line 10231
    $$3484650 = $$1482$lcssa; //@line 10232
    $$3501649 = $$1499$lcssa; //@line 10232
    $152 = $$pr566; //@line 10232
    while (1) {
     $151 = 0 - $152 | 0; //@line 10234
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 10236
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 10240
      $161 = 1e9 >>> $154; //@line 10241
      $$0487644 = 0; //@line 10242
      $$1489643 = $$3484650; //@line 10242
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 10244
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 10248
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 10249
       $$1489643 = $$1489643 + 4 | 0; //@line 10250
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 10261
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 10264
       $$4502 = $$3501649; //@line 10264
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 10267
       $$$3484700 = $$$3484; //@line 10268
       $$4502 = $$3501649 + 4 | 0; //@line 10268
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 10275
      $$4502 = $$3501649; //@line 10275
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 10277
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 10284
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 10286
     HEAP32[$7 >> 2] = $152; //@line 10287
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 10292
      $$3501$lcssa = $$$4502; //@line 10292
      break;
     } else {
      $$3484650 = $$$3484700; //@line 10290
      $$3501649 = $$$4502; //@line 10290
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 10297
    $$3501$lcssa = $$1499$lcssa; //@line 10297
   }
   $185 = $$561; //@line 10300
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 10305
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 10306
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 10309
    } else {
     $$0514639 = $189; //@line 10311
     $$0530638 = 10; //@line 10311
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 10313
      $193 = $$0514639 + 1 | 0; //@line 10314
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 10317
       break;
      } else {
       $$0514639 = $193; //@line 10320
      }
     }
    }
   } else {
    $$1515 = 0; //@line 10325
   }
   $198 = ($39 | 0) == 103; //@line 10330
   $199 = ($$540 | 0) != 0; //@line 10331
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 10334
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 10343
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 10346
    $213 = ($209 | 0) % 9 | 0; //@line 10347
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 10350
     $$1531632 = 10; //@line 10350
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 10353
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 10356
       $$1531632 = $215; //@line 10356
      } else {
       $$1531$lcssa = $215; //@line 10358
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 10363
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 10365
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 10366
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 10369
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 10372
     $$4518 = $$1515; //@line 10372
     $$8 = $$3484$lcssa; //@line 10372
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 10377
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 10378
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 10383
     if (!$$0520) {
      $$1467 = $$$564; //@line 10386
      $$1469 = $$543; //@line 10386
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 10389
      $$1467 = $230 ? -$$$564 : $$$564; //@line 10394
      $$1469 = $230 ? -$$543 : $$543; //@line 10394
     }
     $233 = $217 - $218 | 0; //@line 10396
     HEAP32[$212 >> 2] = $233; //@line 10397
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 10401
      HEAP32[$212 >> 2] = $236; //@line 10402
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 10405
       $$sink547625 = $212; //@line 10405
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 10407
        HEAP32[$$sink547625 >> 2] = 0; //@line 10408
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 10411
         HEAP32[$240 >> 2] = 0; //@line 10412
         $$6 = $240; //@line 10413
        } else {
         $$6 = $$5486626; //@line 10415
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 10418
        HEAP32[$238 >> 2] = $242; //@line 10419
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 10422
         $$sink547625 = $238; //@line 10422
        } else {
         $$5486$lcssa = $$6; //@line 10424
         $$sink547$lcssa = $238; //@line 10424
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 10429
       $$sink547$lcssa = $212; //@line 10429
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 10434
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 10435
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 10438
       $$4518 = $247; //@line 10438
       $$8 = $$5486$lcssa; //@line 10438
      } else {
       $$2516621 = $247; //@line 10440
       $$2532620 = 10; //@line 10440
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 10442
        $251 = $$2516621 + 1 | 0; //@line 10443
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 10446
         $$4518 = $251; //@line 10446
         $$8 = $$5486$lcssa; //@line 10446
         break;
        } else {
         $$2516621 = $251; //@line 10449
        }
       }
      }
     } else {
      $$4492 = $212; //@line 10454
      $$4518 = $$1515; //@line 10454
      $$8 = $$3484$lcssa; //@line 10454
     }
    }
    $253 = $$4492 + 4 | 0; //@line 10457
    $$5519$ph = $$4518; //@line 10460
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 10460
    $$9$ph = $$8; //@line 10460
   } else {
    $$5519$ph = $$1515; //@line 10462
    $$7505$ph = $$3501$lcssa; //@line 10462
    $$9$ph = $$3484$lcssa; //@line 10462
   }
   $$7505 = $$7505$ph; //@line 10464
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 10468
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 10471
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 10475
    } else {
     $$lcssa675 = 1; //@line 10477
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 10481
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 10486
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 10494
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 10494
     } else {
      $$0479 = $5 + -2 | 0; //@line 10498
      $$2476 = $$540$ + -1 | 0; //@line 10498
     }
     $267 = $4 & 8; //@line 10500
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 10505
       if (!$270) {
        $$2529 = 9; //@line 10508
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 10513
         $$3533616 = 10; //@line 10513
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 10515
          $275 = $$1528617 + 1 | 0; //@line 10516
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 10522
           break;
          } else {
           $$1528617 = $275; //@line 10520
          }
         }
        } else {
         $$2529 = 0; //@line 10527
        }
       }
      } else {
       $$2529 = 9; //@line 10531
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 10539
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 10541
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 10543
       $$1480 = $$0479; //@line 10546
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 10546
       $$pre$phi698Z2D = 0; //@line 10546
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 10550
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 10552
       $$1480 = $$0479; //@line 10555
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 10555
       $$pre$phi698Z2D = 0; //@line 10555
       break;
      }
     } else {
      $$1480 = $$0479; //@line 10559
      $$3477 = $$2476; //@line 10559
      $$pre$phi698Z2D = $267; //@line 10559
     }
    } else {
     $$1480 = $5; //@line 10563
     $$3477 = $$540; //@line 10563
     $$pre$phi698Z2D = $4 & 8; //@line 10563
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 10566
   $294 = ($292 | 0) != 0 & 1; //@line 10568
   $296 = ($$1480 | 32 | 0) == 102; //@line 10570
   if ($296) {
    $$2513 = 0; //@line 10574
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 10574
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 10577
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 10580
    $304 = $11; //@line 10581
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 10586
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 10588
      HEAP8[$308 >> 0] = 48; //@line 10589
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 10594
      } else {
       $$1512$lcssa = $308; //@line 10596
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 10601
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 10608
    $318 = $$1512$lcssa + -2 | 0; //@line 10610
    HEAP8[$318 >> 0] = $$1480; //@line 10611
    $$2513 = $318; //@line 10614
    $$pn = $304 - $318 | 0; //@line 10614
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 10619
   _pad_676($0, 32, $2, $323, $4); //@line 10620
   _out_670($0, $$0521, $$0520); //@line 10621
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 10623
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 10626
    $326 = $8 + 9 | 0; //@line 10627
    $327 = $326; //@line 10628
    $328 = $8 + 8 | 0; //@line 10629
    $$5493600 = $$0496$$9; //@line 10630
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 10633
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 10638
       $$1465 = $328; //@line 10639
      } else {
       $$1465 = $330; //@line 10641
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 10648
       $$0464597 = $330; //@line 10649
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 10651
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 10654
        } else {
         $$1465 = $335; //@line 10656
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 10661
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 10666
     $$5493600 = $$5493600 + 4 | 0; //@line 10667
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 6075, 1); //@line 10677
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 10683
     $$6494592 = $$5493600; //@line 10683
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 10686
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 10691
       $$0463587 = $347; //@line 10692
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 10694
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 10697
        } else {
         $$0463$lcssa = $351; //@line 10699
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 10704
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 10708
      $$6494592 = $$6494592 + 4 | 0; //@line 10709
      $356 = $$4478593 + -9 | 0; //@line 10710
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 10717
       break;
      } else {
       $$4478593 = $356; //@line 10715
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 10722
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 10725
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 10728
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 10731
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 10732
     $365 = $363; //@line 10733
     $366 = 0 - $9 | 0; //@line 10734
     $367 = $8 + 8 | 0; //@line 10735
     $$5605 = $$3477; //@line 10736
     $$7495604 = $$9$ph; //@line 10736
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 10739
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 10742
       $$0 = $367; //@line 10743
      } else {
       $$0 = $369; //@line 10745
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 10750
        _out_670($0, $$0, 1); //@line 10751
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 10755
         break;
        }
        _out_670($0, 6075, 1); //@line 10758
        $$2 = $375; //@line 10759
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 10763
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 10768
        $$1601 = $$0; //@line 10769
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 10771
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 10774
         } else {
          $$2 = $373; //@line 10776
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 10783
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 10786
      $381 = $$5605 - $378 | 0; //@line 10787
      $$7495604 = $$7495604 + 4 | 0; //@line 10788
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 10795
       break;
      } else {
       $$5605 = $381; //@line 10793
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 10800
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 10803
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 10807
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 10810
   $$sink560 = $323; //@line 10811
  }
 } while (0);
 STACKTOP = sp; //@line 10816
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 10816
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 8494
 STACKTOP = STACKTOP + 64 | 0; //@line 8495
 $5 = sp + 16 | 0; //@line 8496
 $6 = sp; //@line 8497
 $7 = sp + 24 | 0; //@line 8498
 $8 = sp + 8 | 0; //@line 8499
 $9 = sp + 20 | 0; //@line 8500
 HEAP32[$5 >> 2] = $1; //@line 8501
 $10 = ($0 | 0) != 0; //@line 8502
 $11 = $7 + 40 | 0; //@line 8503
 $12 = $11; //@line 8504
 $13 = $7 + 39 | 0; //@line 8505
 $14 = $8 + 4 | 0; //@line 8506
 $$0243 = 0; //@line 8507
 $$0247 = 0; //@line 8507
 $$0269 = 0; //@line 8507
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 8516
     $$1248 = -1; //@line 8517
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 8521
     break;
    }
   } else {
    $$1248 = $$0247; //@line 8525
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 8528
  $21 = HEAP8[$20 >> 0] | 0; //@line 8529
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 8532
   break;
  } else {
   $23 = $21; //@line 8535
   $25 = $20; //@line 8535
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 8540
     $27 = $25; //@line 8540
     label = 9; //@line 8541
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 8546
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 8553
   HEAP32[$5 >> 2] = $24; //@line 8554
   $23 = HEAP8[$24 >> 0] | 0; //@line 8556
   $25 = $24; //@line 8556
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 8561
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 8566
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 8569
     $27 = $27 + 2 | 0; //@line 8570
     HEAP32[$5 >> 2] = $27; //@line 8571
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 8578
      break;
     } else {
      $$0249303 = $30; //@line 8575
      label = 9; //@line 8576
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 8586
  if ($10) {
   _out_670($0, $20, $36); //@line 8588
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 8592
   $$0247 = $$1248; //@line 8592
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 8600
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 8601
  if ($43) {
   $$0253 = -1; //@line 8603
   $$1270 = $$0269; //@line 8603
   $$sink = 1; //@line 8603
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 8613
    $$1270 = 1; //@line 8613
    $$sink = 3; //@line 8613
   } else {
    $$0253 = -1; //@line 8615
    $$1270 = $$0269; //@line 8615
    $$sink = 1; //@line 8615
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 8618
  HEAP32[$5 >> 2] = $51; //@line 8619
  $52 = HEAP8[$51 >> 0] | 0; //@line 8620
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 8622
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 8629
   $$lcssa291 = $52; //@line 8629
   $$lcssa292 = $51; //@line 8629
  } else {
   $$0262309 = 0; //@line 8631
   $60 = $52; //@line 8631
   $65 = $51; //@line 8631
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 8636
    $64 = $65 + 1 | 0; //@line 8637
    HEAP32[$5 >> 2] = $64; //@line 8638
    $66 = HEAP8[$64 >> 0] | 0; //@line 8639
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 8641
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 8648
     $$lcssa291 = $66; //@line 8648
     $$lcssa292 = $64; //@line 8648
     break;
    } else {
     $$0262309 = $63; //@line 8651
     $60 = $66; //@line 8651
     $65 = $64; //@line 8651
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 8663
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 8665
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 8670
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 8675
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 8687
     $$2271 = 1; //@line 8687
     $storemerge274 = $79 + 3 | 0; //@line 8687
    } else {
     label = 23; //@line 8689
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 8693
    if ($$1270 | 0) {
     $$0 = -1; //@line 8696
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8711
     $106 = HEAP32[$105 >> 2] | 0; //@line 8712
     HEAP32[$2 >> 2] = $105 + 4; //@line 8714
     $363 = $106; //@line 8715
    } else {
     $363 = 0; //@line 8717
    }
    $$0259 = $363; //@line 8721
    $$2271 = 0; //@line 8721
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 8721
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 8723
   $109 = ($$0259 | 0) < 0; //@line 8724
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 8729
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 8729
   $$3272 = $$2271; //@line 8729
   $115 = $storemerge274; //@line 8729
  } else {
   $112 = _getint_671($5) | 0; //@line 8731
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 8734
    break;
   }
   $$1260 = $112; //@line 8738
   $$1263 = $$0262$lcssa; //@line 8738
   $$3272 = $$1270; //@line 8738
   $115 = HEAP32[$5 >> 2] | 0; //@line 8738
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 8749
     $156 = _getint_671($5) | 0; //@line 8750
     $$0254 = $156; //@line 8752
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 8752
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 8761
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 8766
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 8771
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 8778
      $144 = $125 + 4 | 0; //@line 8782
      HEAP32[$5 >> 2] = $144; //@line 8783
      $$0254 = $140; //@line 8784
      $$pre345 = $144; //@line 8784
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 8790
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8805
     $152 = HEAP32[$151 >> 2] | 0; //@line 8806
     HEAP32[$2 >> 2] = $151 + 4; //@line 8808
     $364 = $152; //@line 8809
    } else {
     $364 = 0; //@line 8811
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 8814
    HEAP32[$5 >> 2] = $154; //@line 8815
    $$0254 = $364; //@line 8816
    $$pre345 = $154; //@line 8816
   } else {
    $$0254 = -1; //@line 8818
    $$pre345 = $115; //@line 8818
   }
  } while (0);
  $$0252 = 0; //@line 8821
  $158 = $$pre345; //@line 8821
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 8828
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 8831
   HEAP32[$5 >> 2] = $158; //@line 8832
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (5543 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 8837
   $168 = $167 & 255; //@line 8838
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 8842
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 8849
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 8853
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 8857
     break L1;
    } else {
     label = 50; //@line 8860
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 8865
     $176 = $3 + ($$0253 << 3) | 0; //@line 8867
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 8872
     $182 = $6; //@line 8873
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 8875
     HEAP32[$182 + 4 >> 2] = $181; //@line 8878
     label = 50; //@line 8879
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 8883
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 8886
    $187 = HEAP32[$5 >> 2] | 0; //@line 8888
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 8892
   if ($10) {
    $187 = $158; //@line 8894
   } else {
    $$0243 = 0; //@line 8896
    $$0247 = $$1248; //@line 8896
    $$0269 = $$3272; //@line 8896
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 8902
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 8908
  $196 = $$1263 & -65537; //@line 8911
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 8912
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 8920
       $$0243 = 0; //@line 8921
       $$0247 = $$1248; //@line 8921
       $$0269 = $$3272; //@line 8921
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 8927
       $$0243 = 0; //@line 8928
       $$0247 = $$1248; //@line 8928
       $$0269 = $$3272; //@line 8928
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 8936
       HEAP32[$208 >> 2] = $$1248; //@line 8938
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 8941
       $$0243 = 0; //@line 8942
       $$0247 = $$1248; //@line 8942
       $$0269 = $$3272; //@line 8942
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 8949
       $$0243 = 0; //@line 8950
       $$0247 = $$1248; //@line 8950
       $$0269 = $$3272; //@line 8950
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 8957
       $$0243 = 0; //@line 8958
       $$0247 = $$1248; //@line 8958
       $$0269 = $$3272; //@line 8958
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 8964
       $$0243 = 0; //@line 8965
       $$0247 = $$1248; //@line 8965
       $$0269 = $$3272; //@line 8965
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 8973
       HEAP32[$220 >> 2] = $$1248; //@line 8975
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 8978
       $$0243 = 0; //@line 8979
       $$0247 = $$1248; //@line 8979
       $$0269 = $$3272; //@line 8979
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 8984
       $$0247 = $$1248; //@line 8984
       $$0269 = $$3272; //@line 8984
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 8994
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 8994
     $$3265 = $$1263$ | 8; //@line 8994
     label = 62; //@line 8995
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 8999
     $$1255 = $$0254; //@line 8999
     $$3265 = $$1263$; //@line 8999
     label = 62; //@line 9000
     break;
    }
   case 111:
    {
     $242 = $6; //@line 9004
     $244 = HEAP32[$242 >> 2] | 0; //@line 9006
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 9009
     $248 = _fmt_o($244, $247, $11) | 0; //@line 9010
     $252 = $12 - $248 | 0; //@line 9014
     $$0228 = $248; //@line 9019
     $$1233 = 0; //@line 9019
     $$1238 = 6007; //@line 9019
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 9019
     $$4266 = $$1263$; //@line 9019
     $281 = $244; //@line 9019
     $283 = $247; //@line 9019
     label = 68; //@line 9020
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 9024
     $258 = HEAP32[$256 >> 2] | 0; //@line 9026
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 9029
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 9032
      $264 = tempRet0; //@line 9033
      $265 = $6; //@line 9034
      HEAP32[$265 >> 2] = $263; //@line 9036
      HEAP32[$265 + 4 >> 2] = $264; //@line 9039
      $$0232 = 1; //@line 9040
      $$0237 = 6007; //@line 9040
      $275 = $263; //@line 9040
      $276 = $264; //@line 9040
      label = 67; //@line 9041
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 9053
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 6007 : 6009 : 6008; //@line 9053
      $275 = $258; //@line 9053
      $276 = $261; //@line 9053
      label = 67; //@line 9054
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 9060
     $$0232 = 0; //@line 9066
     $$0237 = 6007; //@line 9066
     $275 = HEAP32[$197 >> 2] | 0; //@line 9066
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 9066
     label = 67; //@line 9067
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 9078
     $$2 = $13; //@line 9079
     $$2234 = 0; //@line 9079
     $$2239 = 6007; //@line 9079
     $$2251 = $11; //@line 9079
     $$5 = 1; //@line 9079
     $$6268 = $196; //@line 9079
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 9086
     label = 72; //@line 9087
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 9091
     $$1 = $302 | 0 ? $302 : 6017; //@line 9094
     label = 72; //@line 9095
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 9105
     HEAP32[$14 >> 2] = 0; //@line 9106
     HEAP32[$6 >> 2] = $8; //@line 9107
     $$4258354 = -1; //@line 9108
     $365 = $8; //@line 9108
     label = 76; //@line 9109
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 9113
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 9116
      $$0240$lcssa356 = 0; //@line 9117
      label = 85; //@line 9118
     } else {
      $$4258354 = $$0254; //@line 9120
      $365 = $$pre348; //@line 9120
      label = 76; //@line 9121
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 9128
     $$0247 = $$1248; //@line 9128
     $$0269 = $$3272; //@line 9128
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 9133
     $$2234 = 0; //@line 9133
     $$2239 = 6007; //@line 9133
     $$2251 = $11; //@line 9133
     $$5 = $$0254; //@line 9133
     $$6268 = $$1263$; //@line 9133
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 9139
    $227 = $6; //@line 9140
    $229 = HEAP32[$227 >> 2] | 0; //@line 9142
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 9145
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 9147
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 9153
    $$0228 = $234; //@line 9158
    $$1233 = $or$cond278 ? 0 : 2; //@line 9158
    $$1238 = $or$cond278 ? 6007 : 6007 + ($$1236 >> 4) | 0; //@line 9158
    $$2256 = $$1255; //@line 9158
    $$4266 = $$3265; //@line 9158
    $281 = $229; //@line 9158
    $283 = $232; //@line 9158
    label = 68; //@line 9159
   } else if ((label | 0) == 67) {
    label = 0; //@line 9162
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 9164
    $$1233 = $$0232; //@line 9164
    $$1238 = $$0237; //@line 9164
    $$2256 = $$0254; //@line 9164
    $$4266 = $$1263$; //@line 9164
    $281 = $275; //@line 9164
    $283 = $276; //@line 9164
    label = 68; //@line 9165
   } else if ((label | 0) == 72) {
    label = 0; //@line 9168
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 9169
    $306 = ($305 | 0) == 0; //@line 9170
    $$2 = $$1; //@line 9177
    $$2234 = 0; //@line 9177
    $$2239 = 6007; //@line 9177
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 9177
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 9177
    $$6268 = $196; //@line 9177
   } else if ((label | 0) == 76) {
    label = 0; //@line 9180
    $$0229316 = $365; //@line 9181
    $$0240315 = 0; //@line 9181
    $$1244314 = 0; //@line 9181
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 9183
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 9186
      $$2245 = $$1244314; //@line 9186
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 9189
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 9195
      $$2245 = $320; //@line 9195
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 9199
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 9202
      $$0240315 = $325; //@line 9202
      $$1244314 = $320; //@line 9202
     } else {
      $$0240$lcssa = $325; //@line 9204
      $$2245 = $320; //@line 9204
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 9210
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 9213
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 9216
     label = 85; //@line 9217
    } else {
     $$1230327 = $365; //@line 9219
     $$1241326 = 0; //@line 9219
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 9221
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9224
       label = 85; //@line 9225
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 9228
      $$1241326 = $331 + $$1241326 | 0; //@line 9229
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9232
       label = 85; //@line 9233
       break L97;
      }
      _out_670($0, $9, $331); //@line 9237
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9242
       label = 85; //@line 9243
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 9240
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 9251
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 9257
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 9259
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 9264
   $$2 = $or$cond ? $$0228 : $11; //@line 9269
   $$2234 = $$1233; //@line 9269
   $$2239 = $$1238; //@line 9269
   $$2251 = $11; //@line 9269
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 9269
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 9269
  } else if ((label | 0) == 85) {
   label = 0; //@line 9272
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 9274
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 9277
   $$0247 = $$1248; //@line 9277
   $$0269 = $$3272; //@line 9277
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 9282
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 9284
  $345 = $$$5 + $$2234 | 0; //@line 9285
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 9287
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 9288
  _out_670($0, $$2239, $$2234); //@line 9289
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 9291
  _pad_676($0, 48, $$$5, $343, 0); //@line 9292
  _out_670($0, $$2, $343); //@line 9293
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 9295
  $$0243 = $$2261; //@line 9296
  $$0247 = $$1248; //@line 9296
  $$0269 = $$3272; //@line 9296
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 9304
    } else {
     $$2242302 = 1; //@line 9306
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 9309
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 9312
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 9316
      $356 = $$2242302 + 1 | 0; //@line 9317
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 9320
      } else {
       $$2242$lcssa = $356; //@line 9322
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 9328
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 9334
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 9340
       } else {
        $$0 = 1; //@line 9342
        break;
       }
      }
     } else {
      $$0 = 1; //@line 9347
     }
    }
   } else {
    $$0 = $$1248; //@line 9351
   }
  }
 } while (0);
 STACKTOP = sp; //@line 9355
 return $$0 | 0; //@line 9355
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 5897
 $3 = HEAP32[3197] | 0; //@line 5898
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 5901
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 5905
 $7 = $6 & 3; //@line 5906
 if (($7 | 0) == 1) {
  _abort(); //@line 5909
 }
 $9 = $6 & -8; //@line 5912
 $10 = $2 + $9 | 0; //@line 5913
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 5918
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 5924
   $17 = $13 + $9 | 0; //@line 5925
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 5928
   }
   if ((HEAP32[3198] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 5934
    $106 = HEAP32[$105 >> 2] | 0; //@line 5935
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 5939
     $$1382 = $17; //@line 5939
     $114 = $16; //@line 5939
     break;
    }
    HEAP32[3195] = $17; //@line 5942
    HEAP32[$105 >> 2] = $106 & -2; //@line 5944
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 5947
    HEAP32[$16 + $17 >> 2] = $17; //@line 5949
    return;
   }
   $21 = $13 >>> 3; //@line 5952
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 5956
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 5958
    $28 = 12812 + ($21 << 1 << 2) | 0; //@line 5960
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 5965
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 5972
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[3193] = HEAP32[3193] & ~(1 << $21); //@line 5982
     $$1 = $16; //@line 5983
     $$1382 = $17; //@line 5983
     $114 = $16; //@line 5983
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 5989
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 5993
     }
     $41 = $26 + 8 | 0; //@line 5996
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 6000
     } else {
      _abort(); //@line 6002
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 6007
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 6008
    $$1 = $16; //@line 6009
    $$1382 = $17; //@line 6009
    $114 = $16; //@line 6009
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 6013
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 6015
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 6019
     $60 = $59 + 4 | 0; //@line 6020
     $61 = HEAP32[$60 >> 2] | 0; //@line 6021
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 6024
      if (!$63) {
       $$3 = 0; //@line 6027
       break;
      } else {
       $$1387 = $63; //@line 6030
       $$1390 = $59; //@line 6030
      }
     } else {
      $$1387 = $61; //@line 6033
      $$1390 = $60; //@line 6033
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 6036
      $66 = HEAP32[$65 >> 2] | 0; //@line 6037
      if ($66 | 0) {
       $$1387 = $66; //@line 6040
       $$1390 = $65; //@line 6040
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 6043
      $69 = HEAP32[$68 >> 2] | 0; //@line 6044
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 6049
       $$1390 = $68; //@line 6049
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 6054
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 6057
      $$3 = $$1387; //@line 6058
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 6063
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 6066
     }
     $53 = $51 + 12 | 0; //@line 6069
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 6073
     }
     $56 = $48 + 8 | 0; //@line 6076
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 6080
      HEAP32[$56 >> 2] = $51; //@line 6081
      $$3 = $48; //@line 6082
      break;
     } else {
      _abort(); //@line 6085
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 6092
    $$1382 = $17; //@line 6092
    $114 = $16; //@line 6092
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 6095
    $75 = 13076 + ($74 << 2) | 0; //@line 6096
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 6101
      if (!$$3) {
       HEAP32[3194] = HEAP32[3194] & ~(1 << $74); //@line 6108
       $$1 = $16; //@line 6109
       $$1382 = $17; //@line 6109
       $114 = $16; //@line 6109
       break L10;
      }
     } else {
      if ((HEAP32[3197] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 6116
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 6124
       if (!$$3) {
        $$1 = $16; //@line 6127
        $$1382 = $17; //@line 6127
        $114 = $16; //@line 6127
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[3197] | 0; //@line 6135
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 6138
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 6142
    $92 = $16 + 16 | 0; //@line 6143
    $93 = HEAP32[$92 >> 2] | 0; //@line 6144
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 6150
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 6154
       HEAP32[$93 + 24 >> 2] = $$3; //@line 6156
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 6162
    if (!$99) {
     $$1 = $16; //@line 6165
     $$1382 = $17; //@line 6165
     $114 = $16; //@line 6165
    } else {
     if ((HEAP32[3197] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 6170
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 6174
      HEAP32[$99 + 24 >> 2] = $$3; //@line 6176
      $$1 = $16; //@line 6177
      $$1382 = $17; //@line 6177
      $114 = $16; //@line 6177
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 6183
   $$1382 = $9; //@line 6183
   $114 = $2; //@line 6183
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 6188
 }
 $115 = $10 + 4 | 0; //@line 6191
 $116 = HEAP32[$115 >> 2] | 0; //@line 6192
 if (!($116 & 1)) {
  _abort(); //@line 6196
 }
 if (!($116 & 2)) {
  if ((HEAP32[3199] | 0) == ($10 | 0)) {
   $124 = (HEAP32[3196] | 0) + $$1382 | 0; //@line 6206
   HEAP32[3196] = $124; //@line 6207
   HEAP32[3199] = $$1; //@line 6208
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 6211
   if (($$1 | 0) != (HEAP32[3198] | 0)) {
    return;
   }
   HEAP32[3198] = 0; //@line 6217
   HEAP32[3195] = 0; //@line 6218
   return;
  }
  if ((HEAP32[3198] | 0) == ($10 | 0)) {
   $132 = (HEAP32[3195] | 0) + $$1382 | 0; //@line 6225
   HEAP32[3195] = $132; //@line 6226
   HEAP32[3198] = $114; //@line 6227
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 6230
   HEAP32[$114 + $132 >> 2] = $132; //@line 6232
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 6236
  $138 = $116 >>> 3; //@line 6237
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 6242
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 6244
    $145 = 12812 + ($138 << 1 << 2) | 0; //@line 6246
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[3197] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 6252
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 6259
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[3193] = HEAP32[3193] & ~(1 << $138); //@line 6269
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 6275
    } else {
     if ((HEAP32[3197] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 6280
     }
     $160 = $143 + 8 | 0; //@line 6283
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 6287
     } else {
      _abort(); //@line 6289
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 6294
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 6295
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 6298
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 6300
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 6304
      $180 = $179 + 4 | 0; //@line 6305
      $181 = HEAP32[$180 >> 2] | 0; //@line 6306
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 6309
       if (!$183) {
        $$3400 = 0; //@line 6312
        break;
       } else {
        $$1398 = $183; //@line 6315
        $$1402 = $179; //@line 6315
       }
      } else {
       $$1398 = $181; //@line 6318
       $$1402 = $180; //@line 6318
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 6321
       $186 = HEAP32[$185 >> 2] | 0; //@line 6322
       if ($186 | 0) {
        $$1398 = $186; //@line 6325
        $$1402 = $185; //@line 6325
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 6328
       $189 = HEAP32[$188 >> 2] | 0; //@line 6329
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 6334
        $$1402 = $188; //@line 6334
       }
      }
      if ((HEAP32[3197] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 6340
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 6343
       $$3400 = $$1398; //@line 6344
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 6349
      if ((HEAP32[3197] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 6353
      }
      $173 = $170 + 12 | 0; //@line 6356
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 6360
      }
      $176 = $167 + 8 | 0; //@line 6363
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 6367
       HEAP32[$176 >> 2] = $170; //@line 6368
       $$3400 = $167; //@line 6369
       break;
      } else {
       _abort(); //@line 6372
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 6380
     $196 = 13076 + ($195 << 2) | 0; //@line 6381
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 6386
       if (!$$3400) {
        HEAP32[3194] = HEAP32[3194] & ~(1 << $195); //@line 6393
        break L108;
       }
      } else {
       if ((HEAP32[3197] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 6400
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 6408
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[3197] | 0; //@line 6418
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 6421
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 6425
     $213 = $10 + 16 | 0; //@line 6426
     $214 = HEAP32[$213 >> 2] | 0; //@line 6427
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 6433
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 6437
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 6439
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 6445
     if ($220 | 0) {
      if ((HEAP32[3197] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 6451
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 6455
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 6457
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 6466
  HEAP32[$114 + $137 >> 2] = $137; //@line 6468
  if (($$1 | 0) == (HEAP32[3198] | 0)) {
   HEAP32[3195] = $137; //@line 6472
   return;
  } else {
   $$2 = $137; //@line 6475
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 6479
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 6482
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 6484
  $$2 = $$1382; //@line 6485
 }
 $235 = $$2 >>> 3; //@line 6487
 if ($$2 >>> 0 < 256) {
  $238 = 12812 + ($235 << 1 << 2) | 0; //@line 6491
  $239 = HEAP32[3193] | 0; //@line 6492
  $240 = 1 << $235; //@line 6493
  if (!($239 & $240)) {
   HEAP32[3193] = $239 | $240; //@line 6498
   $$0403 = $238; //@line 6500
   $$pre$phiZ2D = $238 + 8 | 0; //@line 6500
  } else {
   $244 = $238 + 8 | 0; //@line 6502
   $245 = HEAP32[$244 >> 2] | 0; //@line 6503
   if ((HEAP32[3197] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 6507
   } else {
    $$0403 = $245; //@line 6510
    $$pre$phiZ2D = $244; //@line 6510
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 6513
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 6515
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 6517
  HEAP32[$$1 + 12 >> 2] = $238; //@line 6519
  return;
 }
 $251 = $$2 >>> 8; //@line 6522
 if (!$251) {
  $$0396 = 0; //@line 6525
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 6529
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 6533
   $257 = $251 << $256; //@line 6534
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 6537
   $262 = $257 << $260; //@line 6539
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 6542
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 6547
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 6553
  }
 }
 $276 = 13076 + ($$0396 << 2) | 0; //@line 6556
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 6558
 HEAP32[$$1 + 20 >> 2] = 0; //@line 6561
 HEAP32[$$1 + 16 >> 2] = 0; //@line 6562
 $280 = HEAP32[3194] | 0; //@line 6563
 $281 = 1 << $$0396; //@line 6564
 do {
  if (!($280 & $281)) {
   HEAP32[3194] = $280 | $281; //@line 6570
   HEAP32[$276 >> 2] = $$1; //@line 6571
   HEAP32[$$1 + 24 >> 2] = $276; //@line 6573
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 6575
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 6577
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 6585
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 6585
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 6592
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 6596
    $301 = HEAP32[$299 >> 2] | 0; //@line 6598
    if (!$301) {
     label = 121; //@line 6601
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 6604
     $$0384 = $301; //@line 6604
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[3197] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 6611
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 6614
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 6616
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 6618
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 6620
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 6625
    $309 = HEAP32[$308 >> 2] | 0; //@line 6626
    $310 = HEAP32[3197] | 0; //@line 6627
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 6633
     HEAP32[$308 >> 2] = $$1; //@line 6634
     HEAP32[$$1 + 8 >> 2] = $309; //@line 6636
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 6638
     HEAP32[$$1 + 24 >> 2] = 0; //@line 6640
     break;
    } else {
     _abort(); //@line 6643
    }
   }
  }
 } while (0);
 $319 = (HEAP32[3201] | 0) + -1 | 0; //@line 6650
 HEAP32[3201] = $319; //@line 6651
 if (!$319) {
  $$0212$in$i = 13228; //@line 6654
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 6659
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 6665
  }
 }
 HEAP32[3201] = -1; //@line 6668
 return;
}
function __ZN6C128329characterEiii__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $31 = 0, $33 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $56 = 0, $57 = 0, $6 = 0, $62 = 0, $64 = 0, $65 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 14213
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14217
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14219
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14221
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 14223
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 14225
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 14227
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 14229
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 14231
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 14233
 $22 = HEAP8[$0 + 44 >> 0] | 0; //@line 14235
 $24 = HEAP8[$0 + 45 >> 0] | 0; //@line 14237
 $26 = HEAP32[$0 + 48 >> 2] | 0; //@line 14239
 $28 = HEAP32[$0 + 52 >> 2] | 0; //@line 14241
 if ((HEAP32[$0 + 4 >> 2] | 0) >>> 0 > (HEAP32[___async_retval >> 2] | 0) >>> 0) {
  HEAP32[$4 >> 2] = 0; //@line 14246
  $31 = $10 + 64 | 0; //@line 14247
  $33 = (HEAP32[$31 >> 2] | 0) + $8 | 0; //@line 14249
  HEAP32[$31 >> 2] = $33; //@line 14250
  $36 = HEAP32[(HEAP32[$26 >> 2] | 0) + 128 >> 2] | 0; //@line 14253
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(60) | 0; //@line 14254
  $37 = FUNCTION_TABLE_ii[$36 & 31]($10) | 0; //@line 14255
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 39; //@line 14258
   $38 = $ReallocAsyncCtx2 + 4 | 0; //@line 14259
   HEAP32[$38 >> 2] = $28; //@line 14260
   $39 = $ReallocAsyncCtx2 + 8 | 0; //@line 14261
   HEAP32[$39 >> 2] = $33; //@line 14262
   $40 = $ReallocAsyncCtx2 + 12 | 0; //@line 14263
   HEAP32[$40 >> 2] = $18; //@line 14264
   $41 = $ReallocAsyncCtx2 + 16 | 0; //@line 14265
   HEAP32[$41 >> 2] = $20; //@line 14266
   $42 = $ReallocAsyncCtx2 + 20 | 0; //@line 14267
   HEAP8[$42 >> 0] = $22; //@line 14268
   $43 = $ReallocAsyncCtx2 + 24 | 0; //@line 14269
   HEAP32[$43 >> 2] = $31; //@line 14270
   $44 = $ReallocAsyncCtx2 + 28 | 0; //@line 14271
   HEAP32[$44 >> 2] = $4; //@line 14272
   $45 = $ReallocAsyncCtx2 + 32 | 0; //@line 14273
   HEAP8[$45 >> 0] = $24; //@line 14274
   $46 = $ReallocAsyncCtx2 + 36 | 0; //@line 14275
   HEAP32[$46 >> 2] = $10; //@line 14276
   $47 = $ReallocAsyncCtx2 + 40 | 0; //@line 14277
   HEAP32[$47 >> 2] = $12; //@line 14278
   $48 = $ReallocAsyncCtx2 + 44 | 0; //@line 14279
   HEAP32[$48 >> 2] = $14; //@line 14280
   $49 = $ReallocAsyncCtx2 + 48 | 0; //@line 14281
   HEAP32[$49 >> 2] = $16; //@line 14282
   $50 = $ReallocAsyncCtx2 + 52 | 0; //@line 14283
   HEAP32[$50 >> 2] = $6; //@line 14284
   $51 = $ReallocAsyncCtx2 + 56 | 0; //@line 14285
   HEAP32[$51 >> 2] = $8; //@line 14286
   sp = STACKTOP; //@line 14287
   return;
  }
  HEAP32[___async_retval >> 2] = $37; //@line 14291
  ___async_unwind = 0; //@line 14292
  HEAP32[$ReallocAsyncCtx2 >> 2] = 39; //@line 14293
  $38 = $ReallocAsyncCtx2 + 4 | 0; //@line 14294
  HEAP32[$38 >> 2] = $28; //@line 14295
  $39 = $ReallocAsyncCtx2 + 8 | 0; //@line 14296
  HEAP32[$39 >> 2] = $33; //@line 14297
  $40 = $ReallocAsyncCtx2 + 12 | 0; //@line 14298
  HEAP32[$40 >> 2] = $18; //@line 14299
  $41 = $ReallocAsyncCtx2 + 16 | 0; //@line 14300
  HEAP32[$41 >> 2] = $20; //@line 14301
  $42 = $ReallocAsyncCtx2 + 20 | 0; //@line 14302
  HEAP8[$42 >> 0] = $22; //@line 14303
  $43 = $ReallocAsyncCtx2 + 24 | 0; //@line 14304
  HEAP32[$43 >> 2] = $31; //@line 14305
  $44 = $ReallocAsyncCtx2 + 28 | 0; //@line 14306
  HEAP32[$44 >> 2] = $4; //@line 14307
  $45 = $ReallocAsyncCtx2 + 32 | 0; //@line 14308
  HEAP8[$45 >> 0] = $24; //@line 14309
  $46 = $ReallocAsyncCtx2 + 36 | 0; //@line 14310
  HEAP32[$46 >> 2] = $10; //@line 14311
  $47 = $ReallocAsyncCtx2 + 40 | 0; //@line 14312
  HEAP32[$47 >> 2] = $12; //@line 14313
  $48 = $ReallocAsyncCtx2 + 44 | 0; //@line 14314
  HEAP32[$48 >> 2] = $14; //@line 14315
  $49 = $ReallocAsyncCtx2 + 48 | 0; //@line 14316
  HEAP32[$49 >> 2] = $16; //@line 14317
  $50 = $ReallocAsyncCtx2 + 52 | 0; //@line 14318
  HEAP32[$50 >> 2] = $6; //@line 14319
  $51 = $ReallocAsyncCtx2 + 56 | 0; //@line 14320
  HEAP32[$51 >> 2] = $8; //@line 14321
  sp = STACKTOP; //@line 14322
  return;
 }
 $56 = (HEAP32[$28 >> 2] | 0) + ((Math_imul($18 + -32 | 0, $20) | 0) + 4) | 0; //@line 14329
 $57 = HEAP8[$56 >> 0] | 0; //@line 14330
 if ($22 << 24 >> 24) {
  if ($24 << 24 >> 24) {
   $62 = (0 >>> 3 & 31) + 1 | 0; //@line 14337
   $64 = 1 << 0; //@line 14339
   $65 = 0 + $12 | 0; //@line 14340
   $75 = HEAP32[(HEAP32[$10 >> 2] | 0) + 120 >> 2] | 0; //@line 14350
   $76 = 0 + $16 | 0; //@line 14351
   if (!($64 & (HEAPU8[$56 + ($62 + 0) >> 0] | 0))) {
    $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 14353
    FUNCTION_TABLE_viiii[$75 & 7]($10, $76, $65, 0); //@line 14354
    if (___async) {
     HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 14357
     $92 = $ReallocAsyncCtx4 + 4 | 0; //@line 14358
     HEAP32[$92 >> 2] = 0; //@line 14359
     $93 = $ReallocAsyncCtx4 + 8 | 0; //@line 14360
     HEAP32[$93 >> 2] = $6; //@line 14361
     $94 = $ReallocAsyncCtx4 + 12 | 0; //@line 14362
     HEAP32[$94 >> 2] = 0; //@line 14363
     $95 = $ReallocAsyncCtx4 + 16 | 0; //@line 14364
     HEAP32[$95 >> 2] = $8; //@line 14365
     $96 = $ReallocAsyncCtx4 + 20 | 0; //@line 14366
     HEAP32[$96 >> 2] = $14; //@line 14367
     $97 = $ReallocAsyncCtx4 + 24 | 0; //@line 14368
     HEAP32[$97 >> 2] = $62; //@line 14369
     $98 = $ReallocAsyncCtx4 + 28 | 0; //@line 14370
     HEAP32[$98 >> 2] = $56; //@line 14371
     $99 = $ReallocAsyncCtx4 + 32 | 0; //@line 14372
     HEAP32[$99 >> 2] = $64; //@line 14373
     $100 = $ReallocAsyncCtx4 + 36 | 0; //@line 14374
     HEAP32[$100 >> 2] = $10; //@line 14375
     $101 = $ReallocAsyncCtx4 + 40 | 0; //@line 14376
     HEAP32[$101 >> 2] = $16; //@line 14377
     $102 = $ReallocAsyncCtx4 + 44 | 0; //@line 14378
     HEAP32[$102 >> 2] = $10; //@line 14379
     $103 = $ReallocAsyncCtx4 + 48 | 0; //@line 14380
     HEAP32[$103 >> 2] = $65; //@line 14381
     $104 = $ReallocAsyncCtx4 + 52 | 0; //@line 14382
     HEAP8[$104 >> 0] = $57; //@line 14383
     $105 = $ReallocAsyncCtx4 + 56 | 0; //@line 14384
     HEAP32[$105 >> 2] = $4; //@line 14385
     $106 = $ReallocAsyncCtx4 + 60 | 0; //@line 14386
     HEAP32[$106 >> 2] = $12; //@line 14387
     sp = STACKTOP; //@line 14388
     return;
    }
    ___async_unwind = 0; //@line 14391
    HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 14392
    $92 = $ReallocAsyncCtx4 + 4 | 0; //@line 14393
    HEAP32[$92 >> 2] = 0; //@line 14394
    $93 = $ReallocAsyncCtx4 + 8 | 0; //@line 14395
    HEAP32[$93 >> 2] = $6; //@line 14396
    $94 = $ReallocAsyncCtx4 + 12 | 0; //@line 14397
    HEAP32[$94 >> 2] = 0; //@line 14398
    $95 = $ReallocAsyncCtx4 + 16 | 0; //@line 14399
    HEAP32[$95 >> 2] = $8; //@line 14400
    $96 = $ReallocAsyncCtx4 + 20 | 0; //@line 14401
    HEAP32[$96 >> 2] = $14; //@line 14402
    $97 = $ReallocAsyncCtx4 + 24 | 0; //@line 14403
    HEAP32[$97 >> 2] = $62; //@line 14404
    $98 = $ReallocAsyncCtx4 + 28 | 0; //@line 14405
    HEAP32[$98 >> 2] = $56; //@line 14406
    $99 = $ReallocAsyncCtx4 + 32 | 0; //@line 14407
    HEAP32[$99 >> 2] = $64; //@line 14408
    $100 = $ReallocAsyncCtx4 + 36 | 0; //@line 14409
    HEAP32[$100 >> 2] = $10; //@line 14410
    $101 = $ReallocAsyncCtx4 + 40 | 0; //@line 14411
    HEAP32[$101 >> 2] = $16; //@line 14412
    $102 = $ReallocAsyncCtx4 + 44 | 0; //@line 14413
    HEAP32[$102 >> 2] = $10; //@line 14414
    $103 = $ReallocAsyncCtx4 + 48 | 0; //@line 14415
    HEAP32[$103 >> 2] = $65; //@line 14416
    $104 = $ReallocAsyncCtx4 + 52 | 0; //@line 14417
    HEAP8[$104 >> 0] = $57; //@line 14418
    $105 = $ReallocAsyncCtx4 + 56 | 0; //@line 14419
    HEAP32[$105 >> 2] = $4; //@line 14420
    $106 = $ReallocAsyncCtx4 + 60 | 0; //@line 14421
    HEAP32[$106 >> 2] = $12; //@line 14422
    sp = STACKTOP; //@line 14423
    return;
   } else {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 14426
    FUNCTION_TABLE_viiii[$75 & 7]($10, $76, $65, 1); //@line 14427
    if (___async) {
     HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 14430
     $77 = $ReallocAsyncCtx3 + 4 | 0; //@line 14431
     HEAP32[$77 >> 2] = 0; //@line 14432
     $78 = $ReallocAsyncCtx3 + 8 | 0; //@line 14433
     HEAP32[$78 >> 2] = $6; //@line 14434
     $79 = $ReallocAsyncCtx3 + 12 | 0; //@line 14435
     HEAP32[$79 >> 2] = 0; //@line 14436
     $80 = $ReallocAsyncCtx3 + 16 | 0; //@line 14437
     HEAP32[$80 >> 2] = $8; //@line 14438
     $81 = $ReallocAsyncCtx3 + 20 | 0; //@line 14439
     HEAP32[$81 >> 2] = $14; //@line 14440
     $82 = $ReallocAsyncCtx3 + 24 | 0; //@line 14441
     HEAP32[$82 >> 2] = $62; //@line 14442
     $83 = $ReallocAsyncCtx3 + 28 | 0; //@line 14443
     HEAP32[$83 >> 2] = $56; //@line 14444
     $84 = $ReallocAsyncCtx3 + 32 | 0; //@line 14445
     HEAP32[$84 >> 2] = $64; //@line 14446
     $85 = $ReallocAsyncCtx3 + 36 | 0; //@line 14447
     HEAP32[$85 >> 2] = $10; //@line 14448
     $86 = $ReallocAsyncCtx3 + 40 | 0; //@line 14449
     HEAP32[$86 >> 2] = $16; //@line 14450
     $87 = $ReallocAsyncCtx3 + 44 | 0; //@line 14451
     HEAP32[$87 >> 2] = $10; //@line 14452
     $88 = $ReallocAsyncCtx3 + 48 | 0; //@line 14453
     HEAP32[$88 >> 2] = $65; //@line 14454
     $89 = $ReallocAsyncCtx3 + 52 | 0; //@line 14455
     HEAP8[$89 >> 0] = $57; //@line 14456
     $90 = $ReallocAsyncCtx3 + 56 | 0; //@line 14457
     HEAP32[$90 >> 2] = $4; //@line 14458
     $91 = $ReallocAsyncCtx3 + 60 | 0; //@line 14459
     HEAP32[$91 >> 2] = $12; //@line 14460
     sp = STACKTOP; //@line 14461
     return;
    }
    ___async_unwind = 0; //@line 14464
    HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 14465
    $77 = $ReallocAsyncCtx3 + 4 | 0; //@line 14466
    HEAP32[$77 >> 2] = 0; //@line 14467
    $78 = $ReallocAsyncCtx3 + 8 | 0; //@line 14468
    HEAP32[$78 >> 2] = $6; //@line 14469
    $79 = $ReallocAsyncCtx3 + 12 | 0; //@line 14470
    HEAP32[$79 >> 2] = 0; //@line 14471
    $80 = $ReallocAsyncCtx3 + 16 | 0; //@line 14472
    HEAP32[$80 >> 2] = $8; //@line 14473
    $81 = $ReallocAsyncCtx3 + 20 | 0; //@line 14474
    HEAP32[$81 >> 2] = $14; //@line 14475
    $82 = $ReallocAsyncCtx3 + 24 | 0; //@line 14476
    HEAP32[$82 >> 2] = $62; //@line 14477
    $83 = $ReallocAsyncCtx3 + 28 | 0; //@line 14478
    HEAP32[$83 >> 2] = $56; //@line 14479
    $84 = $ReallocAsyncCtx3 + 32 | 0; //@line 14480
    HEAP32[$84 >> 2] = $64; //@line 14481
    $85 = $ReallocAsyncCtx3 + 36 | 0; //@line 14482
    HEAP32[$85 >> 2] = $10; //@line 14483
    $86 = $ReallocAsyncCtx3 + 40 | 0; //@line 14484
    HEAP32[$86 >> 2] = $16; //@line 14485
    $87 = $ReallocAsyncCtx3 + 44 | 0; //@line 14486
    HEAP32[$87 >> 2] = $10; //@line 14487
    $88 = $ReallocAsyncCtx3 + 48 | 0; //@line 14488
    HEAP32[$88 >> 2] = $65; //@line 14489
    $89 = $ReallocAsyncCtx3 + 52 | 0; //@line 14490
    HEAP8[$89 >> 0] = $57; //@line 14491
    $90 = $ReallocAsyncCtx3 + 56 | 0; //@line 14492
    HEAP32[$90 >> 2] = $4; //@line 14493
    $91 = $ReallocAsyncCtx3 + 60 | 0; //@line 14494
    HEAP32[$91 >> 2] = $12; //@line 14495
    sp = STACKTOP; //@line 14496
    return;
   }
  }
 }
 HEAP32[$4 >> 2] = (HEAP32[$4 >> 2] | 0) + ($57 & 255); //@line 14504
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12871
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12877
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 12886
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 12891
      $19 = $1 + 44 | 0; //@line 12892
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 12901
      $26 = $1 + 52 | 0; //@line 12902
      $27 = $1 + 53 | 0; //@line 12903
      $28 = $1 + 54 | 0; //@line 12904
      $29 = $0 + 8 | 0; //@line 12905
      $30 = $1 + 24 | 0; //@line 12906
      $$081$off0 = 0; //@line 12907
      $$084 = $0 + 16 | 0; //@line 12907
      $$085$off0 = 0; //@line 12907
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 12911
        label = 20; //@line 12912
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 12915
       HEAP8[$27 >> 0] = 0; //@line 12916
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 12917
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 12918
       if (___async) {
        label = 12; //@line 12921
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 12924
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 12928
        label = 20; //@line 12929
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 12936
         $$186$off0 = $$085$off0; //@line 12936
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 12945
           label = 20; //@line 12946
           break L10;
          } else {
           $$182$off0 = 1; //@line 12949
           $$186$off0 = $$085$off0; //@line 12949
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 12956
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 12963
          break L10;
         } else {
          $$182$off0 = 1; //@line 12966
          $$186$off0 = 1; //@line 12966
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 12971
       $$084 = $$084 + 8 | 0; //@line 12971
       $$085$off0 = $$186$off0; //@line 12971
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 179; //@line 12974
       HEAP32[$AsyncCtx15 + 4 >> 2] = $25; //@line 12976
       HEAP32[$AsyncCtx15 + 8 >> 2] = $26; //@line 12978
       HEAP32[$AsyncCtx15 + 12 >> 2] = $27; //@line 12980
       HEAP32[$AsyncCtx15 + 16 >> 2] = $1; //@line 12982
       HEAP32[$AsyncCtx15 + 20 >> 2] = $2; //@line 12984
       HEAP8[$AsyncCtx15 + 24 >> 0] = $4 & 1; //@line 12987
       HEAP32[$AsyncCtx15 + 28 >> 2] = $30; //@line 12989
       HEAP32[$AsyncCtx15 + 32 >> 2] = $19; //@line 12991
       HEAP32[$AsyncCtx15 + 36 >> 2] = $28; //@line 12993
       HEAP32[$AsyncCtx15 + 40 >> 2] = $29; //@line 12995
       HEAP8[$AsyncCtx15 + 44 >> 0] = $$081$off0 & 1; //@line 12998
       HEAP8[$AsyncCtx15 + 45 >> 0] = $$085$off0 & 1; //@line 13001
       HEAP32[$AsyncCtx15 + 48 >> 2] = $$084; //@line 13003
       HEAP32[$AsyncCtx15 + 52 >> 2] = $13; //@line 13005
       sp = STACKTOP; //@line 13006
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 13012
         $61 = $1 + 40 | 0; //@line 13013
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 13016
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 13024
           if ($$283$off0) {
            label = 25; //@line 13026
            break;
           } else {
            $69 = 4; //@line 13029
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 13036
        } else {
         $69 = 4; //@line 13038
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 13043
      }
      HEAP32[$19 >> 2] = $69; //@line 13045
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 13054
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 13059
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 13060
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 13061
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 13062
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 180; //@line 13065
    HEAP32[$AsyncCtx11 + 4 >> 2] = $1; //@line 13067
    HEAP32[$AsyncCtx11 + 8 >> 2] = $2; //@line 13069
    HEAP32[$AsyncCtx11 + 12 >> 2] = $3; //@line 13071
    HEAP8[$AsyncCtx11 + 16 >> 0] = $4 & 1; //@line 13074
    HEAP32[$AsyncCtx11 + 20 >> 2] = $73; //@line 13076
    HEAP32[$AsyncCtx11 + 24 >> 2] = $0; //@line 13078
    HEAP32[$AsyncCtx11 + 28 >> 2] = $72; //@line 13080
    sp = STACKTOP; //@line 13081
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 13084
   $81 = $0 + 24 | 0; //@line 13085
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 13089
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 13093
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 13100
       $$2 = $81; //@line 13101
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 13113
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 13114
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 13119
        $136 = $$2 + 8 | 0; //@line 13120
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 13123
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 183; //@line 13128
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 13130
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 13132
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 13134
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 13136
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 13138
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 13140
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 13142
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 13145
       sp = STACKTOP; //@line 13146
       return;
      }
      $104 = $1 + 24 | 0; //@line 13149
      $105 = $1 + 54 | 0; //@line 13150
      $$1 = $81; //@line 13151
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 13167
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 13168
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13173
       $122 = $$1 + 8 | 0; //@line 13174
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 13177
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 182; //@line 13182
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 13184
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 13186
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 13188
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 13190
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 13192
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 13194
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 13196
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 13198
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 13201
      sp = STACKTOP; //@line 13202
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 13206
    $$0 = $81; //@line 13207
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 13214
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 13215
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 13220
     $100 = $$0 + 8 | 0; //@line 13221
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 13224
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 181; //@line 13229
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 13231
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 13233
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 13235
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 13237
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 13239
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 13241
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 13244
    sp = STACKTOP; //@line 13245
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
 $n_sroa_0_0_extract_trunc = $a$0; //@line 4984
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 4985
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 4986
 $d_sroa_0_0_extract_trunc = $b$0; //@line 4987
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 4988
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 4989
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 4991
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 4994
    HEAP32[$rem + 4 >> 2] = 0; //@line 4995
   }
   $_0$1 = 0; //@line 4997
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 4998
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 4999
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 5002
    $_0$0 = 0; //@line 5003
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5004
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 5006
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 5007
   $_0$1 = 0; //@line 5008
   $_0$0 = 0; //@line 5009
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5010
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 5013
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 5018
     HEAP32[$rem + 4 >> 2] = 0; //@line 5019
    }
    $_0$1 = 0; //@line 5021
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 5022
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5023
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 5027
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 5028
    }
    $_0$1 = 0; //@line 5030
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 5031
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5032
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 5034
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 5037
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 5038
    }
    $_0$1 = 0; //@line 5040
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 5041
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5042
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 5045
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 5047
    $58 = 31 - $51 | 0; //@line 5048
    $sr_1_ph = $57; //@line 5049
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 5050
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 5051
    $q_sroa_0_1_ph = 0; //@line 5052
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 5053
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 5057
    $_0$0 = 0; //@line 5058
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5059
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 5061
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 5062
   $_0$1 = 0; //@line 5063
   $_0$0 = 0; //@line 5064
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5065
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 5069
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 5071
     $126 = 31 - $119 | 0; //@line 5072
     $130 = $119 - 31 >> 31; //@line 5073
     $sr_1_ph = $125; //@line 5074
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 5075
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 5076
     $q_sroa_0_1_ph = 0; //@line 5077
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 5078
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 5082
     $_0$0 = 0; //@line 5083
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5084
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 5086
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 5087
    $_0$1 = 0; //@line 5088
    $_0$0 = 0; //@line 5089
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5090
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 5092
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 5095
    $89 = 64 - $88 | 0; //@line 5096
    $91 = 32 - $88 | 0; //@line 5097
    $92 = $91 >> 31; //@line 5098
    $95 = $88 - 32 | 0; //@line 5099
    $105 = $95 >> 31; //@line 5100
    $sr_1_ph = $88; //@line 5101
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 5102
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 5103
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 5104
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 5105
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 5109
    HEAP32[$rem + 4 >> 2] = 0; //@line 5110
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 5113
    $_0$0 = $a$0 | 0 | 0; //@line 5114
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5115
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 5117
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 5118
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 5119
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5120
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 5125
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 5126
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 5127
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 5128
  $carry_0_lcssa$1 = 0; //@line 5129
  $carry_0_lcssa$0 = 0; //@line 5130
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 5132
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 5133
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 5134
  $137$1 = tempRet0; //@line 5135
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 5136
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 5137
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 5138
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 5139
  $sr_1202 = $sr_1_ph; //@line 5140
  $carry_0203 = 0; //@line 5141
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 5143
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 5144
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 5145
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 5146
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 5147
   $150$1 = tempRet0; //@line 5148
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 5149
   $carry_0203 = $151$0 & 1; //@line 5150
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 5152
   $r_sroa_1_1200 = tempRet0; //@line 5153
   $sr_1202 = $sr_1202 - 1 | 0; //@line 5154
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 5166
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 5167
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 5168
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 5169
  $carry_0_lcssa$1 = 0; //@line 5170
  $carry_0_lcssa$0 = $carry_0203; //@line 5171
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 5173
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 5174
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 5177
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 5178
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 5180
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 5181
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5182
}
function __ZN6C128329characterEiii__async_cb_20($0) {
 $0 = $0 | 0;
 var $$04142$us = 0, $$043$us$reg2mem$0 = 0, $$reg2mem$0 = 0, $$reg2mem17$0 = 0, $$reg2mem21$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $4 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 229
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 233
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 235
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 237
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 239
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 241
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 243
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 245
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 247
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 249
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 251
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 253
 $26 = HEAP8[$0 + 52 >> 0] | 0; //@line 255
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 257
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 259
 $79 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 260
 do {
  if (($79 | 0) == ($4 | 0)) {
   $32 = $6 + 1 | 0; //@line 264
   if (($32 | 0) != ($8 | 0)) {
    $$04142$us = 0; //@line 273
    $$043$us$reg2mem$0 = $32; //@line 273
    $$reg2mem$0 = ($32 >>> 3 & 31) + 1 | 0; //@line 273
    $$reg2mem17$0 = 1 << ($32 & 7); //@line 273
    $$reg2mem21$0 = $32 + $30 | 0; //@line 273
    break;
   }
   HEAP32[$28 >> 2] = (HEAP32[$28 >> 2] | 0) + ($26 & 255); //@line 279
   return;
  } else {
   $$04142$us = $79; //@line 282
   $$043$us$reg2mem$0 = $6; //@line 282
   $$reg2mem$0 = $12; //@line 282
   $$reg2mem17$0 = $16; //@line 282
   $$reg2mem21$0 = $24; //@line 282
  }
 } while (0);
 $44 = ($$reg2mem17$0 & (HEAPU8[$14 + ($$reg2mem$0 + (Math_imul($$04142$us, $10) | 0)) >> 0] | 0) | 0) == 0; //@line 291
 $47 = HEAP32[(HEAP32[$18 >> 2] | 0) + 120 >> 2] | 0; //@line 294
 $48 = $$04142$us + $20 | 0; //@line 295
 if ($44) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 297
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 0); //@line 298
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 301
   $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 302
   HEAP32[$64 >> 2] = $$04142$us; //@line 303
   $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 304
   HEAP32[$65 >> 2] = $4; //@line 305
   $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 306
   HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 307
   $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 308
   HEAP32[$67 >> 2] = $8; //@line 309
   $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 310
   HEAP32[$68 >> 2] = $10; //@line 311
   $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 312
   HEAP32[$69 >> 2] = $$reg2mem$0; //@line 313
   $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 314
   HEAP32[$70 >> 2] = $14; //@line 315
   $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 316
   HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 317
   $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 318
   HEAP32[$72 >> 2] = $18; //@line 319
   $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 320
   HEAP32[$73 >> 2] = $20; //@line 321
   $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 322
   HEAP32[$74 >> 2] = $22; //@line 323
   $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 324
   HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 325
   $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 326
   HEAP8[$76 >> 0] = $26; //@line 327
   $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 328
   HEAP32[$77 >> 2] = $28; //@line 329
   $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 330
   HEAP32[$78 >> 2] = $30; //@line 331
   sp = STACKTOP; //@line 332
   return;
  }
  ___async_unwind = 0; //@line 335
  HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 336
  $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 337
  HEAP32[$64 >> 2] = $$04142$us; //@line 338
  $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 339
  HEAP32[$65 >> 2] = $4; //@line 340
  $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 341
  HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 342
  $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 343
  HEAP32[$67 >> 2] = $8; //@line 344
  $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 345
  HEAP32[$68 >> 2] = $10; //@line 346
  $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 347
  HEAP32[$69 >> 2] = $$reg2mem$0; //@line 348
  $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 349
  HEAP32[$70 >> 2] = $14; //@line 350
  $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 351
  HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 352
  $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 353
  HEAP32[$72 >> 2] = $18; //@line 354
  $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 355
  HEAP32[$73 >> 2] = $20; //@line 356
  $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 357
  HEAP32[$74 >> 2] = $22; //@line 358
  $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 359
  HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 360
  $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 361
  HEAP8[$76 >> 0] = $26; //@line 362
  $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 363
  HEAP32[$77 >> 2] = $28; //@line 364
  $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 365
  HEAP32[$78 >> 2] = $30; //@line 366
  sp = STACKTOP; //@line 367
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 370
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 1); //@line 371
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 374
   $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 375
   HEAP32[$49 >> 2] = $$04142$us; //@line 376
   $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 377
   HEAP32[$50 >> 2] = $4; //@line 378
   $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 379
   HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 380
   $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 381
   HEAP32[$52 >> 2] = $8; //@line 382
   $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 383
   HEAP32[$53 >> 2] = $10; //@line 384
   $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 385
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 386
   $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 387
   HEAP32[$55 >> 2] = $14; //@line 388
   $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 389
   HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 390
   $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 391
   HEAP32[$57 >> 2] = $18; //@line 392
   $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 393
   HEAP32[$58 >> 2] = $20; //@line 394
   $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 395
   HEAP32[$59 >> 2] = $22; //@line 396
   $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 397
   HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 398
   $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 399
   HEAP8[$61 >> 0] = $26; //@line 400
   $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 401
   HEAP32[$62 >> 2] = $28; //@line 402
   $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 403
   HEAP32[$63 >> 2] = $30; //@line 404
   sp = STACKTOP; //@line 405
   return;
  }
  ___async_unwind = 0; //@line 408
  HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 409
  $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 410
  HEAP32[$49 >> 2] = $$04142$us; //@line 411
  $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 412
  HEAP32[$50 >> 2] = $4; //@line 413
  $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 414
  HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 415
  $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 416
  HEAP32[$52 >> 2] = $8; //@line 417
  $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 418
  HEAP32[$53 >> 2] = $10; //@line 419
  $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 420
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 421
  $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 422
  HEAP32[$55 >> 2] = $14; //@line 423
  $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 424
  HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 425
  $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 426
  HEAP32[$57 >> 2] = $18; //@line 427
  $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 428
  HEAP32[$58 >> 2] = $20; //@line 429
  $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 430
  HEAP32[$59 >> 2] = $22; //@line 431
  $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 432
  HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 433
  $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 434
  HEAP8[$61 >> 0] = $26; //@line 435
  $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 436
  HEAP32[$62 >> 2] = $28; //@line 437
  $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 438
  HEAP32[$63 >> 2] = $30; //@line 439
  sp = STACKTOP; //@line 440
  return;
 }
}
function __ZN6C128329characterEiii__async_cb_18($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $39 = 0, $40 = 0, $45 = 0, $47 = 0, $48 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 14514
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14520
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14522
 $10 = HEAP8[$0 + 20 >> 0] | 0; //@line 14524
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 14528
 $16 = HEAP8[$0 + 32 >> 0] | 0; //@line 14530
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 14532
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 14534
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 14536
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 14538
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 14540
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 14542
 $30 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 14545
 if ((HEAP32[$0 + 8 >> 2] | 0) >>> 0 >= ((HEAP32[___async_retval >> 2] | 0) - (HEAPU8[$30 + 2 >> 0] | 0) | 0) >>> 0) {
  HEAP32[HEAP32[$0 + 24 >> 2] >> 2] = 0; //@line 14552
 }
 $39 = $30 + ((Math_imul($6 + -32 | 0, $8) | 0) + 4) | 0; //@line 14557
 $40 = HEAP8[$39 >> 0] | 0; //@line 14558
 if ($10 << 24 >> 24) {
  if ($16 << 24 >> 24) {
   $45 = (0 >>> 3 & 31) + 1 | 0; //@line 14565
   $47 = 1 << 0; //@line 14567
   $48 = 0 + $20 | 0; //@line 14568
   $58 = HEAP32[(HEAP32[$18 >> 2] | 0) + 120 >> 2] | 0; //@line 14578
   $59 = 0 + $24 | 0; //@line 14579
   if (!($47 & (HEAPU8[$39 + ($45 + 0) >> 0] | 0))) {
    $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 14581
    FUNCTION_TABLE_viiii[$58 & 7]($18, $59, $48, 0); //@line 14582
    if (___async) {
     HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 14585
     $75 = $ReallocAsyncCtx4 + 4 | 0; //@line 14586
     HEAP32[$75 >> 2] = 0; //@line 14587
     $76 = $ReallocAsyncCtx4 + 8 | 0; //@line 14588
     HEAP32[$76 >> 2] = $26; //@line 14589
     $77 = $ReallocAsyncCtx4 + 12 | 0; //@line 14590
     HEAP32[$77 >> 2] = 0; //@line 14591
     $78 = $ReallocAsyncCtx4 + 16 | 0; //@line 14592
     HEAP32[$78 >> 2] = $28; //@line 14593
     $79 = $ReallocAsyncCtx4 + 20 | 0; //@line 14594
     HEAP32[$79 >> 2] = $22; //@line 14595
     $80 = $ReallocAsyncCtx4 + 24 | 0; //@line 14596
     HEAP32[$80 >> 2] = $45; //@line 14597
     $81 = $ReallocAsyncCtx4 + 28 | 0; //@line 14598
     HEAP32[$81 >> 2] = $39; //@line 14599
     $82 = $ReallocAsyncCtx4 + 32 | 0; //@line 14600
     HEAP32[$82 >> 2] = $47; //@line 14601
     $83 = $ReallocAsyncCtx4 + 36 | 0; //@line 14602
     HEAP32[$83 >> 2] = $18; //@line 14603
     $84 = $ReallocAsyncCtx4 + 40 | 0; //@line 14604
     HEAP32[$84 >> 2] = $24; //@line 14605
     $85 = $ReallocAsyncCtx4 + 44 | 0; //@line 14606
     HEAP32[$85 >> 2] = $18; //@line 14607
     $86 = $ReallocAsyncCtx4 + 48 | 0; //@line 14608
     HEAP32[$86 >> 2] = $48; //@line 14609
     $87 = $ReallocAsyncCtx4 + 52 | 0; //@line 14610
     HEAP8[$87 >> 0] = $40; //@line 14611
     $88 = $ReallocAsyncCtx4 + 56 | 0; //@line 14612
     HEAP32[$88 >> 2] = $14; //@line 14613
     $89 = $ReallocAsyncCtx4 + 60 | 0; //@line 14614
     HEAP32[$89 >> 2] = $20; //@line 14615
     sp = STACKTOP; //@line 14616
     return;
    }
    ___async_unwind = 0; //@line 14619
    HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 14620
    $75 = $ReallocAsyncCtx4 + 4 | 0; //@line 14621
    HEAP32[$75 >> 2] = 0; //@line 14622
    $76 = $ReallocAsyncCtx4 + 8 | 0; //@line 14623
    HEAP32[$76 >> 2] = $26; //@line 14624
    $77 = $ReallocAsyncCtx4 + 12 | 0; //@line 14625
    HEAP32[$77 >> 2] = 0; //@line 14626
    $78 = $ReallocAsyncCtx4 + 16 | 0; //@line 14627
    HEAP32[$78 >> 2] = $28; //@line 14628
    $79 = $ReallocAsyncCtx4 + 20 | 0; //@line 14629
    HEAP32[$79 >> 2] = $22; //@line 14630
    $80 = $ReallocAsyncCtx4 + 24 | 0; //@line 14631
    HEAP32[$80 >> 2] = $45; //@line 14632
    $81 = $ReallocAsyncCtx4 + 28 | 0; //@line 14633
    HEAP32[$81 >> 2] = $39; //@line 14634
    $82 = $ReallocAsyncCtx4 + 32 | 0; //@line 14635
    HEAP32[$82 >> 2] = $47; //@line 14636
    $83 = $ReallocAsyncCtx4 + 36 | 0; //@line 14637
    HEAP32[$83 >> 2] = $18; //@line 14638
    $84 = $ReallocAsyncCtx4 + 40 | 0; //@line 14639
    HEAP32[$84 >> 2] = $24; //@line 14640
    $85 = $ReallocAsyncCtx4 + 44 | 0; //@line 14641
    HEAP32[$85 >> 2] = $18; //@line 14642
    $86 = $ReallocAsyncCtx4 + 48 | 0; //@line 14643
    HEAP32[$86 >> 2] = $48; //@line 14644
    $87 = $ReallocAsyncCtx4 + 52 | 0; //@line 14645
    HEAP8[$87 >> 0] = $40; //@line 14646
    $88 = $ReallocAsyncCtx4 + 56 | 0; //@line 14647
    HEAP32[$88 >> 2] = $14; //@line 14648
    $89 = $ReallocAsyncCtx4 + 60 | 0; //@line 14649
    HEAP32[$89 >> 2] = $20; //@line 14650
    sp = STACKTOP; //@line 14651
    return;
   } else {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 14654
    FUNCTION_TABLE_viiii[$58 & 7]($18, $59, $48, 1); //@line 14655
    if (___async) {
     HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 14658
     $60 = $ReallocAsyncCtx3 + 4 | 0; //@line 14659
     HEAP32[$60 >> 2] = 0; //@line 14660
     $61 = $ReallocAsyncCtx3 + 8 | 0; //@line 14661
     HEAP32[$61 >> 2] = $26; //@line 14662
     $62 = $ReallocAsyncCtx3 + 12 | 0; //@line 14663
     HEAP32[$62 >> 2] = 0; //@line 14664
     $63 = $ReallocAsyncCtx3 + 16 | 0; //@line 14665
     HEAP32[$63 >> 2] = $28; //@line 14666
     $64 = $ReallocAsyncCtx3 + 20 | 0; //@line 14667
     HEAP32[$64 >> 2] = $22; //@line 14668
     $65 = $ReallocAsyncCtx3 + 24 | 0; //@line 14669
     HEAP32[$65 >> 2] = $45; //@line 14670
     $66 = $ReallocAsyncCtx3 + 28 | 0; //@line 14671
     HEAP32[$66 >> 2] = $39; //@line 14672
     $67 = $ReallocAsyncCtx3 + 32 | 0; //@line 14673
     HEAP32[$67 >> 2] = $47; //@line 14674
     $68 = $ReallocAsyncCtx3 + 36 | 0; //@line 14675
     HEAP32[$68 >> 2] = $18; //@line 14676
     $69 = $ReallocAsyncCtx3 + 40 | 0; //@line 14677
     HEAP32[$69 >> 2] = $24; //@line 14678
     $70 = $ReallocAsyncCtx3 + 44 | 0; //@line 14679
     HEAP32[$70 >> 2] = $18; //@line 14680
     $71 = $ReallocAsyncCtx3 + 48 | 0; //@line 14681
     HEAP32[$71 >> 2] = $48; //@line 14682
     $72 = $ReallocAsyncCtx3 + 52 | 0; //@line 14683
     HEAP8[$72 >> 0] = $40; //@line 14684
     $73 = $ReallocAsyncCtx3 + 56 | 0; //@line 14685
     HEAP32[$73 >> 2] = $14; //@line 14686
     $74 = $ReallocAsyncCtx3 + 60 | 0; //@line 14687
     HEAP32[$74 >> 2] = $20; //@line 14688
     sp = STACKTOP; //@line 14689
     return;
    }
    ___async_unwind = 0; //@line 14692
    HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 14693
    $60 = $ReallocAsyncCtx3 + 4 | 0; //@line 14694
    HEAP32[$60 >> 2] = 0; //@line 14695
    $61 = $ReallocAsyncCtx3 + 8 | 0; //@line 14696
    HEAP32[$61 >> 2] = $26; //@line 14697
    $62 = $ReallocAsyncCtx3 + 12 | 0; //@line 14698
    HEAP32[$62 >> 2] = 0; //@line 14699
    $63 = $ReallocAsyncCtx3 + 16 | 0; //@line 14700
    HEAP32[$63 >> 2] = $28; //@line 14701
    $64 = $ReallocAsyncCtx3 + 20 | 0; //@line 14702
    HEAP32[$64 >> 2] = $22; //@line 14703
    $65 = $ReallocAsyncCtx3 + 24 | 0; //@line 14704
    HEAP32[$65 >> 2] = $45; //@line 14705
    $66 = $ReallocAsyncCtx3 + 28 | 0; //@line 14706
    HEAP32[$66 >> 2] = $39; //@line 14707
    $67 = $ReallocAsyncCtx3 + 32 | 0; //@line 14708
    HEAP32[$67 >> 2] = $47; //@line 14709
    $68 = $ReallocAsyncCtx3 + 36 | 0; //@line 14710
    HEAP32[$68 >> 2] = $18; //@line 14711
    $69 = $ReallocAsyncCtx3 + 40 | 0; //@line 14712
    HEAP32[$69 >> 2] = $24; //@line 14713
    $70 = $ReallocAsyncCtx3 + 44 | 0; //@line 14714
    HEAP32[$70 >> 2] = $18; //@line 14715
    $71 = $ReallocAsyncCtx3 + 48 | 0; //@line 14716
    HEAP32[$71 >> 2] = $48; //@line 14717
    $72 = $ReallocAsyncCtx3 + 52 | 0; //@line 14718
    HEAP8[$72 >> 0] = $40; //@line 14719
    $73 = $ReallocAsyncCtx3 + 56 | 0; //@line 14720
    HEAP32[$73 >> 2] = $14; //@line 14721
    $74 = $ReallocAsyncCtx3 + 60 | 0; //@line 14722
    HEAP32[$74 >> 2] = $20; //@line 14723
    sp = STACKTOP; //@line 14724
    return;
   }
  }
 }
 HEAP32[$14 >> 2] = (HEAP32[$14 >> 2] | 0) + ($40 & 255); //@line 14732
 return;
}
function __ZN6C128329characterEiii__async_cb_19($0) {
 $0 = $0 | 0;
 var $$04142$us = 0, $$043$us$reg2mem$0 = 0, $$reg2mem$0 = 0, $$reg2mem17$0 = 0, $$reg2mem21$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $4 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 7
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 15
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 17
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 19
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 21
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 23
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 25
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 27
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 29
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 31
 $26 = HEAP8[$0 + 52 >> 0] | 0; //@line 33
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 35
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 37
 $79 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 38
 do {
  if (($79 | 0) == ($4 | 0)) {
   $32 = $6 + 1 | 0; //@line 42
   if (($32 | 0) != ($8 | 0)) {
    $$04142$us = 0; //@line 51
    $$043$us$reg2mem$0 = $32; //@line 51
    $$reg2mem$0 = ($32 >>> 3 & 31) + 1 | 0; //@line 51
    $$reg2mem17$0 = 1 << ($32 & 7); //@line 51
    $$reg2mem21$0 = $32 + $30 | 0; //@line 51
    break;
   }
   HEAP32[$28 >> 2] = (HEAP32[$28 >> 2] | 0) + ($26 & 255); //@line 57
   return;
  } else {
   $$04142$us = $79; //@line 60
   $$043$us$reg2mem$0 = $6; //@line 60
   $$reg2mem$0 = $12; //@line 60
   $$reg2mem17$0 = $16; //@line 60
   $$reg2mem21$0 = $24; //@line 60
  }
 } while (0);
 $44 = ($$reg2mem17$0 & (HEAPU8[$14 + ($$reg2mem$0 + (Math_imul($$04142$us, $10) | 0)) >> 0] | 0) | 0) == 0; //@line 69
 $47 = HEAP32[(HEAP32[$18 >> 2] | 0) + 120 >> 2] | 0; //@line 72
 $48 = $$04142$us + $20 | 0; //@line 73
 if ($44) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 75
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 0); //@line 76
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 79
   $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 80
   HEAP32[$64 >> 2] = $$04142$us; //@line 81
   $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 82
   HEAP32[$65 >> 2] = $4; //@line 83
   $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 84
   HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 85
   $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 86
   HEAP32[$67 >> 2] = $8; //@line 87
   $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 88
   HEAP32[$68 >> 2] = $10; //@line 89
   $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 90
   HEAP32[$69 >> 2] = $$reg2mem$0; //@line 91
   $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 92
   HEAP32[$70 >> 2] = $14; //@line 93
   $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 94
   HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 95
   $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 96
   HEAP32[$72 >> 2] = $18; //@line 97
   $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 98
   HEAP32[$73 >> 2] = $20; //@line 99
   $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 100
   HEAP32[$74 >> 2] = $22; //@line 101
   $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 102
   HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 103
   $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 104
   HEAP8[$76 >> 0] = $26; //@line 105
   $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 106
   HEAP32[$77 >> 2] = $28; //@line 107
   $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 108
   HEAP32[$78 >> 2] = $30; //@line 109
   sp = STACKTOP; //@line 110
   return;
  }
  ___async_unwind = 0; //@line 113
  HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 114
  $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 115
  HEAP32[$64 >> 2] = $$04142$us; //@line 116
  $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 117
  HEAP32[$65 >> 2] = $4; //@line 118
  $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 119
  HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 120
  $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 121
  HEAP32[$67 >> 2] = $8; //@line 122
  $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 123
  HEAP32[$68 >> 2] = $10; //@line 124
  $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 125
  HEAP32[$69 >> 2] = $$reg2mem$0; //@line 126
  $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 127
  HEAP32[$70 >> 2] = $14; //@line 128
  $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 129
  HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 130
  $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 131
  HEAP32[$72 >> 2] = $18; //@line 132
  $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 133
  HEAP32[$73 >> 2] = $20; //@line 134
  $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 135
  HEAP32[$74 >> 2] = $22; //@line 136
  $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 137
  HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 138
  $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 139
  HEAP8[$76 >> 0] = $26; //@line 140
  $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 141
  HEAP32[$77 >> 2] = $28; //@line 142
  $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 143
  HEAP32[$78 >> 2] = $30; //@line 144
  sp = STACKTOP; //@line 145
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 148
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 1); //@line 149
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 152
   $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 153
   HEAP32[$49 >> 2] = $$04142$us; //@line 154
   $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 155
   HEAP32[$50 >> 2] = $4; //@line 156
   $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 157
   HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 158
   $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 159
   HEAP32[$52 >> 2] = $8; //@line 160
   $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 161
   HEAP32[$53 >> 2] = $10; //@line 162
   $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 163
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 164
   $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 165
   HEAP32[$55 >> 2] = $14; //@line 166
   $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 167
   HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 168
   $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 169
   HEAP32[$57 >> 2] = $18; //@line 170
   $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 171
   HEAP32[$58 >> 2] = $20; //@line 172
   $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 173
   HEAP32[$59 >> 2] = $22; //@line 174
   $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 175
   HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 176
   $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 177
   HEAP8[$61 >> 0] = $26; //@line 178
   $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 179
   HEAP32[$62 >> 2] = $28; //@line 180
   $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 181
   HEAP32[$63 >> 2] = $30; //@line 182
   sp = STACKTOP; //@line 183
   return;
  }
  ___async_unwind = 0; //@line 186
  HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 187
  $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 188
  HEAP32[$49 >> 2] = $$04142$us; //@line 189
  $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 190
  HEAP32[$50 >> 2] = $4; //@line 191
  $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 192
  HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 193
  $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 194
  HEAP32[$52 >> 2] = $8; //@line 195
  $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 196
  HEAP32[$53 >> 2] = $10; //@line 197
  $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 198
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 199
  $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 200
  HEAP32[$55 >> 2] = $14; //@line 201
  $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 202
  HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 203
  $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 204
  HEAP32[$57 >> 2] = $18; //@line 205
  $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 206
  HEAP32[$58 >> 2] = $20; //@line 207
  $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 208
  HEAP32[$59 >> 2] = $22; //@line 209
  $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 210
  HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 211
  $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 212
  HEAP8[$61 >> 0] = $26; //@line 213
  $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 214
  HEAP32[$62 >> 2] = $28; //@line 215
  $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 216
  HEAP32[$63 >> 2] = $30; //@line 217
  sp = STACKTOP; //@line 218
  return;
 }
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2878
 STACKTOP = STACKTOP + 32 | 0; //@line 2879
 $0 = sp; //@line 2880
 _gpio_init_out($0, 50); //@line 2881
 while (1) {
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2884
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2885
  _wait_ms(150); //@line 2886
  if (___async) {
   label = 3; //@line 2889
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 2892
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2894
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2895
  _wait_ms(150); //@line 2896
  if (___async) {
   label = 5; //@line 2899
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 2902
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2904
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2905
  _wait_ms(150); //@line 2906
  if (___async) {
   label = 7; //@line 2909
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 2912
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2914
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2915
  _wait_ms(150); //@line 2916
  if (___async) {
   label = 9; //@line 2919
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 2922
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2924
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2925
  _wait_ms(150); //@line 2926
  if (___async) {
   label = 11; //@line 2929
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 2932
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2934
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2935
  _wait_ms(150); //@line 2936
  if (___async) {
   label = 13; //@line 2939
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 2942
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2944
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2945
  _wait_ms(150); //@line 2946
  if (___async) {
   label = 15; //@line 2949
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 2952
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2954
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2955
  _wait_ms(150); //@line 2956
  if (___async) {
   label = 17; //@line 2959
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 2962
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2964
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2965
  _wait_ms(400); //@line 2966
  if (___async) {
   label = 19; //@line 2969
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 2972
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2974
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2975
  _wait_ms(400); //@line 2976
  if (___async) {
   label = 21; //@line 2979
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 2982
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2984
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2985
  _wait_ms(400); //@line 2986
  if (___async) {
   label = 23; //@line 2989
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 2992
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2994
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2995
  _wait_ms(400); //@line 2996
  if (___async) {
   label = 25; //@line 2999
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 3002
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 3004
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3005
  _wait_ms(400); //@line 3006
  if (___async) {
   label = 27; //@line 3009
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 3012
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 3014
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3015
  _wait_ms(400); //@line 3016
  if (___async) {
   label = 29; //@line 3019
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 3022
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 3024
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3025
  _wait_ms(400); //@line 3026
  if (___async) {
   label = 31; //@line 3029
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3032
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 3034
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3035
  _wait_ms(400); //@line 3036
  if (___async) {
   label = 33; //@line 3039
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3042
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 114; //@line 3046
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 3048
   sp = STACKTOP; //@line 3049
   STACKTOP = sp; //@line 3050
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 115; //@line 3054
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 3056
   sp = STACKTOP; //@line 3057
   STACKTOP = sp; //@line 3058
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 116; //@line 3062
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 3064
   sp = STACKTOP; //@line 3065
   STACKTOP = sp; //@line 3066
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 117; //@line 3070
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 3072
   sp = STACKTOP; //@line 3073
   STACKTOP = sp; //@line 3074
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 118; //@line 3078
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 3080
   sp = STACKTOP; //@line 3081
   STACKTOP = sp; //@line 3082
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 119; //@line 3086
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 3088
   sp = STACKTOP; //@line 3089
   STACKTOP = sp; //@line 3090
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 120; //@line 3094
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 3096
   sp = STACKTOP; //@line 3097
   STACKTOP = sp; //@line 3098
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 121; //@line 3102
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 3104
   sp = STACKTOP; //@line 3105
   STACKTOP = sp; //@line 3106
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 122; //@line 3110
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 3112
   sp = STACKTOP; //@line 3113
   STACKTOP = sp; //@line 3114
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 123; //@line 3118
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 3120
   sp = STACKTOP; //@line 3121
   STACKTOP = sp; //@line 3122
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 124; //@line 3126
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 3128
   sp = STACKTOP; //@line 3129
   STACKTOP = sp; //@line 3130
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 125; //@line 3134
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 3136
   sp = STACKTOP; //@line 3137
   STACKTOP = sp; //@line 3138
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 126; //@line 3142
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 3144
   sp = STACKTOP; //@line 3145
   STACKTOP = sp; //@line 3146
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 127; //@line 3150
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 3152
   sp = STACKTOP; //@line 3153
   STACKTOP = sp; //@line 3154
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 128; //@line 3158
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 3160
   sp = STACKTOP; //@line 3161
   STACKTOP = sp; //@line 3162
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 129; //@line 3166
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3168
   sp = STACKTOP; //@line 3169
   STACKTOP = sp; //@line 3170
   return;
  }
 }
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
 $AsyncCtx = _emscripten_alloc_async_context(56, sp) | 0; //@line 299
 $24 = FUNCTION_TABLE_ii[$23 & 31]($0) | 0; //@line 300
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 38; //@line 303
  HEAP32[$AsyncCtx + 4 >> 2] = $20; //@line 305
  HEAP32[$AsyncCtx + 8 >> 2] = $18; //@line 307
  HEAP32[$AsyncCtx + 12 >> 2] = $11; //@line 309
  HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 311
  HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 313
  HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 315
  HEAP32[$AsyncCtx + 28 >> 2] = $17; //@line 317
  HEAP32[$AsyncCtx + 32 >> 2] = $1; //@line 319
  HEAP32[$AsyncCtx + 36 >> 2] = $3; //@line 321
  HEAP32[$AsyncCtx + 40 >> 2] = $8; //@line 323
  HEAP8[$AsyncCtx + 44 >> 0] = $13; //@line 325
  HEAP8[$AsyncCtx + 45 >> 0] = $10; //@line 327
  HEAP32[$AsyncCtx + 48 >> 2] = $0; //@line 329
  HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 331
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
function _freopen($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$pre = 0, $15 = 0, $27 = 0, $29 = 0, $3 = 0, $30 = 0, $32 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx14 = 0, $AsyncCtx18 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11294
 STACKTOP = STACKTOP + 32 | 0; //@line 11295
 $vararg_buffer3 = sp + 16 | 0; //@line 11296
 $vararg_buffer = sp; //@line 11297
 $3 = ___fmodeflags($1) | 0; //@line 11298
 if ((HEAP32[$2 + 76 >> 2] | 0) > -1) {
  $15 = ___lockfile($2) | 0; //@line 11304
 } else {
  $15 = 0; //@line 11306
 }
 $AsyncCtx = _emscripten_alloc_async_context(40, sp) | 0; //@line 11308
 _fflush($2) | 0; //@line 11309
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 154; //@line 11312
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 11314
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 11316
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 11318
  HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 11320
  HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer3; //@line 11322
  HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 11324
  HEAP32[$AsyncCtx + 28 >> 2] = $15; //@line 11326
  HEAP32[$AsyncCtx + 32 >> 2] = $vararg_buffer; //@line 11328
  HEAP32[$AsyncCtx + 36 >> 2] = $vararg_buffer; //@line 11330
  sp = STACKTOP; //@line 11331
  STACKTOP = sp; //@line 11332
  return 0; //@line 11332
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 11334
 do {
  if (!$0) {
   $$pre = $2 + 60 | 0; //@line 11340
   if ($3 & 524288 | 0) {
    HEAP32[$vararg_buffer >> 2] = HEAP32[$$pre >> 2]; //@line 11343
    HEAP32[$vararg_buffer + 4 >> 2] = 2; //@line 11345
    HEAP32[$vararg_buffer + 8 >> 2] = 1; //@line 11347
    ___syscall221(221, $vararg_buffer | 0) | 0; //@line 11348
   }
   HEAP32[$vararg_buffer3 >> 2] = HEAP32[$$pre >> 2]; //@line 11352
   HEAP32[$vararg_buffer3 + 4 >> 2] = 4; //@line 11354
   HEAP32[$vararg_buffer3 + 8 >> 2] = $3 & -524481; //@line 11356
   if ((___syscall_ret(___syscall221(221, $vararg_buffer3 | 0) | 0) | 0) < 0) {
    label = 21; //@line 11361
   } else {
    label = 16; //@line 11363
   }
  } else {
   $27 = _fopen($0, $1) | 0; //@line 11366
   if (!$27) {
    label = 21; //@line 11369
   } else {
    $29 = $27 + 60 | 0; //@line 11371
    $30 = HEAP32[$29 >> 2] | 0; //@line 11372
    $32 = HEAP32[$2 + 60 >> 2] | 0; //@line 11374
    if (($30 | 0) == ($32 | 0)) {
     HEAP32[$29 >> 2] = -1; //@line 11377
    } else {
     if ((___dup3($30, $32, $3 & 524288) | 0) < 0) {
      $AsyncCtx14 = _emscripten_alloc_async_context(8, sp) | 0; //@line 11383
      _fclose($27) | 0; //@line 11384
      if (___async) {
       HEAP32[$AsyncCtx14 >> 2] = 156; //@line 11387
       HEAP32[$AsyncCtx14 + 4 >> 2] = $2; //@line 11389
       sp = STACKTOP; //@line 11390
       STACKTOP = sp; //@line 11391
       return 0; //@line 11391
      } else {
       _emscripten_free_async_context($AsyncCtx14 | 0); //@line 11393
       label = 21; //@line 11394
       break;
      }
     }
    }
    HEAP32[$2 >> 2] = HEAP32[$2 >> 2] & 1 | HEAP32[$27 >> 2]; //@line 11403
    HEAP32[$2 + 32 >> 2] = HEAP32[$27 + 32 >> 2]; //@line 11407
    HEAP32[$2 + 36 >> 2] = HEAP32[$27 + 36 >> 2]; //@line 11411
    HEAP32[$2 + 40 >> 2] = HEAP32[$27 + 40 >> 2]; //@line 11415
    HEAP32[$2 + 12 >> 2] = HEAP32[$27 + 12 >> 2]; //@line 11419
    $AsyncCtx18 = _emscripten_alloc_async_context(12, sp) | 0; //@line 11420
    _fclose($27) | 0; //@line 11421
    if (___async) {
     HEAP32[$AsyncCtx18 >> 2] = 155; //@line 11424
     HEAP32[$AsyncCtx18 + 4 >> 2] = $15; //@line 11426
     HEAP32[$AsyncCtx18 + 8 >> 2] = $2; //@line 11428
     sp = STACKTOP; //@line 11429
     STACKTOP = sp; //@line 11430
     return 0; //@line 11430
    } else {
     _emscripten_free_async_context($AsyncCtx18 | 0); //@line 11432
     label = 16; //@line 11433
     break;
    }
   }
  }
 } while (0);
 do {
  if ((label | 0) == 16) {
   if (!$15) {
    $$0 = $2; //@line 11443
   } else {
    ___unlockfile($2); //@line 11445
    $$0 = $2; //@line 11446
   }
  } else if ((label | 0) == 21) {
   $AsyncCtx10 = _emscripten_alloc_async_context(8, sp) | 0; //@line 11450
   _fclose($2) | 0; //@line 11451
   if (___async) {
    HEAP32[$AsyncCtx10 >> 2] = 157; //@line 11454
    HEAP32[$AsyncCtx10 + 4 >> 2] = $2; //@line 11456
    sp = STACKTOP; //@line 11457
    STACKTOP = sp; //@line 11458
    return 0; //@line 11458
   } else {
    _emscripten_free_async_context($AsyncCtx10 | 0); //@line 11460
    $$0 = 0; //@line 11461
    break;
   }
  }
 } while (0);
 STACKTOP = sp; //@line 11466
 return $$0 | 0; //@line 11466
}
function __ZN4mbed6Stream6printfEPKcz($0, $1, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $varargs = $varargs | 0;
 var $$09 = 0, $13 = 0, $2 = 0, $22 = 0, $3 = 0, $30 = 0, $36 = 0, $39 = 0, $48 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx12 = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 2706
 STACKTOP = STACKTOP + 4112 | 0; //@line 2707
 $2 = sp; //@line 2708
 $3 = sp + 16 | 0; //@line 2709
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 80 >> 2] | 0; //@line 2712
 $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 2713
 FUNCTION_TABLE_vi[$6 & 255]($0); //@line 2714
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 108; //@line 2717
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 2719
  HEAP32[$AsyncCtx + 8 >> 2] = $varargs; //@line 2721
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 2723
  HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 2725
  HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 2727
  HEAP32[$AsyncCtx + 24 >> 2] = $0; //@line 2729
  sp = STACKTOP; //@line 2730
  STACKTOP = sp; //@line 2731
  return 0; //@line 2731
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2733
 HEAP32[$2 >> 2] = $varargs; //@line 2734
 _memset($3 | 0, 0, 4096) | 0; //@line 2735
 $AsyncCtx12 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2736
 $13 = _vsprintf($3, $1, $2) | 0; //@line 2737
 if (___async) {
  HEAP32[$AsyncCtx12 >> 2] = 109; //@line 2740
  HEAP32[$AsyncCtx12 + 4 >> 2] = $0; //@line 2742
  HEAP32[$AsyncCtx12 + 8 >> 2] = $0; //@line 2744
  HEAP32[$AsyncCtx12 + 12 >> 2] = $3; //@line 2746
  HEAP32[$AsyncCtx12 + 16 >> 2] = $2; //@line 2748
  HEAP32[$AsyncCtx12 + 20 >> 2] = $3; //@line 2750
  sp = STACKTOP; //@line 2751
  STACKTOP = sp; //@line 2752
  return 0; //@line 2752
 }
 _emscripten_free_async_context($AsyncCtx12 | 0); //@line 2754
 L7 : do {
  if (($13 | 0) > 0) {
   $$09 = 0; //@line 2758
   while (1) {
    $36 = HEAP32[(HEAP32[$0 >> 2] | 0) + 68 >> 2] | 0; //@line 2762
    $39 = HEAP8[$3 + $$09 >> 0] | 0; //@line 2765
    $AsyncCtx9 = _emscripten_alloc_async_context(36, sp) | 0; //@line 2766
    FUNCTION_TABLE_iii[$36 & 7]($0, $39) | 0; //@line 2767
    if (___async) {
     break;
    }
    _emscripten_free_async_context($AsyncCtx9 | 0); //@line 2772
    $48 = $$09 + 1 | 0; //@line 2773
    if (($48 | 0) == ($13 | 0)) {
     break L7;
    } else {
     $$09 = $48; //@line 2778
    }
   }
   HEAP32[$AsyncCtx9 >> 2] = 112; //@line 2781
   HEAP32[$AsyncCtx9 + 4 >> 2] = $$09; //@line 2783
   HEAP32[$AsyncCtx9 + 8 >> 2] = $13; //@line 2785
   HEAP32[$AsyncCtx9 + 12 >> 2] = $0; //@line 2787
   HEAP32[$AsyncCtx9 + 16 >> 2] = $0; //@line 2789
   HEAP32[$AsyncCtx9 + 20 >> 2] = $0; //@line 2791
   HEAP32[$AsyncCtx9 + 24 >> 2] = $3; //@line 2793
   HEAP32[$AsyncCtx9 + 28 >> 2] = $3; //@line 2795
   HEAP32[$AsyncCtx9 + 32 >> 2] = $2; //@line 2797
   sp = STACKTOP; //@line 2798
   STACKTOP = sp; //@line 2799
   return 0; //@line 2799
  }
 } while (0);
 $22 = HEAP32[(HEAP32[$0 >> 2] | 0) + 76 >> 2] | 0; //@line 2804
 $AsyncCtx2 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2805
 FUNCTION_TABLE_vi[$22 & 255]($0); //@line 2806
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 110; //@line 2809
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 2811
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 2813
  HEAP32[$AsyncCtx2 + 12 >> 2] = $3; //@line 2815
  HEAP32[$AsyncCtx2 + 16 >> 2] = $2; //@line 2817
  HEAP32[$AsyncCtx2 + 20 >> 2] = $13; //@line 2819
  sp = STACKTOP; //@line 2820
  STACKTOP = sp; //@line 2821
  return 0; //@line 2821
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2823
 $30 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 2826
 $AsyncCtx5 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2827
 FUNCTION_TABLE_vi[$30 & 255]($0); //@line 2828
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 111; //@line 2831
  HEAP32[$AsyncCtx5 + 4 >> 2] = $3; //@line 2833
  HEAP32[$AsyncCtx5 + 8 >> 2] = $2; //@line 2835
  HEAP32[$AsyncCtx5 + 12 >> 2] = $13; //@line 2837
  sp = STACKTOP; //@line 2838
  STACKTOP = sp; //@line 2839
  return 0; //@line 2839
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 2841
  STACKTOP = sp; //@line 2842
  return $13 | 0; //@line 2842
 }
 return 0; //@line 2844
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_58($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2876
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2878
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2880
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2882
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2884
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2886
 $12 = HEAP8[$0 + 24 >> 0] & 1; //@line 2889
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2891
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2893
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2895
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2897
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 2900
 $24 = HEAP8[$0 + 45 >> 0] & 1; //@line 2903
 $26 = HEAP32[$0 + 48 >> 2] | 0; //@line 2905
 $28 = HEAP32[$0 + 52 >> 2] | 0; //@line 2907
 L2 : do {
  if (!(HEAP8[$18 >> 0] | 0)) {
   do {
    if (!(HEAP8[$6 >> 0] | 0)) {
     $$182$off0 = $22; //@line 2916
     $$186$off0 = $24; //@line 2916
    } else {
     if (!(HEAP8[$4 >> 0] | 0)) {
      if (!(HEAP32[$20 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $24; //@line 2925
       $$283$off0 = 1; //@line 2925
       label = 13; //@line 2926
       break L2;
      } else {
       $$182$off0 = 1; //@line 2929
       $$186$off0 = $24; //@line 2929
       break;
      }
     }
     if ((HEAP32[$14 >> 2] | 0) == 1) {
      label = 18; //@line 2936
      break L2;
     }
     if (!(HEAP32[$20 >> 2] & 2)) {
      label = 18; //@line 2943
      break L2;
     } else {
      $$182$off0 = 1; //@line 2946
      $$186$off0 = 1; //@line 2946
     }
    }
   } while (0);
   $30 = $26 + 8 | 0; //@line 2950
   if ($30 >>> 0 < $2 >>> 0) {
    HEAP8[$4 >> 0] = 0; //@line 2953
    HEAP8[$6 >> 0] = 0; //@line 2954
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 2955
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $8, $10, $10, 1, $12); //@line 2956
    if (!___async) {
     ___async_unwind = 0; //@line 2959
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 179; //@line 2961
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 2963
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 2965
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 2967
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 2969
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 2971
    HEAP8[$ReallocAsyncCtx5 + 24 >> 0] = $12 & 1; //@line 2974
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 2976
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $16; //@line 2978
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $18; //@line 2980
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $20; //@line 2982
    HEAP8[$ReallocAsyncCtx5 + 44 >> 0] = $$182$off0 & 1; //@line 2985
    HEAP8[$ReallocAsyncCtx5 + 45 >> 0] = $$186$off0 & 1; //@line 2988
    HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $30; //@line 2990
    HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $28; //@line 2992
    sp = STACKTOP; //@line 2993
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 2996
    $$283$off0 = $$182$off0; //@line 2996
    label = 13; //@line 2997
   }
  } else {
   $$085$off0$reg2mem$0 = $24; //@line 3000
   $$283$off0 = $22; //@line 3000
   label = 13; //@line 3001
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$28 >> 2] = $10; //@line 3007
    $59 = $8 + 40 | 0; //@line 3008
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 3011
    if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$14 >> 2] | 0) == 2) {
      HEAP8[$18 >> 0] = 1; //@line 3019
      if ($$283$off0) {
       label = 18; //@line 3021
       break;
      } else {
       $67 = 4; //@line 3024
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 3031
   } else {
    $67 = 4; //@line 3033
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 3038
 }
 HEAP32[$16 >> 2] = $67; //@line 3040
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_47($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $27 = 0, $29 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1922
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1926
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1928
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1930
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1932
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1934
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1936
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1938
 $29 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 1939
 if (($29 | 0) == ($4 | 0)) {
  $19 = HEAP32[(HEAP32[$6 >> 2] | 0) + 76 >> 2] | 0; //@line 1944
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 1945
  FUNCTION_TABLE_vi[$19 & 255]($8); //@line 1946
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 110; //@line 1949
   $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 1950
   HEAP32[$20 >> 2] = $6; //@line 1951
   $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 1952
   HEAP32[$21 >> 2] = $8; //@line 1953
   $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 1954
   HEAP32[$22 >> 2] = $14; //@line 1955
   $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 1956
   HEAP32[$23 >> 2] = $16; //@line 1957
   $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 1958
   HEAP32[$24 >> 2] = $4; //@line 1959
   sp = STACKTOP; //@line 1960
   return;
  }
  ___async_unwind = 0; //@line 1963
  HEAP32[$ReallocAsyncCtx2 >> 2] = 110; //@line 1964
  $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 1965
  HEAP32[$20 >> 2] = $6; //@line 1966
  $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 1967
  HEAP32[$21 >> 2] = $8; //@line 1968
  $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 1969
  HEAP32[$22 >> 2] = $14; //@line 1970
  $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 1971
  HEAP32[$23 >> 2] = $16; //@line 1972
  $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 1973
  HEAP32[$24 >> 2] = $4; //@line 1974
  sp = STACKTOP; //@line 1975
  return;
 } else {
  $27 = HEAP32[(HEAP32[$10 >> 2] | 0) + 68 >> 2] | 0; //@line 1980
  $31 = HEAP8[$12 + $29 >> 0] | 0; //@line 1983
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(36) | 0; //@line 1984
  FUNCTION_TABLE_iii[$27 & 7]($8, $31) | 0; //@line 1985
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 112; //@line 1988
   $32 = $ReallocAsyncCtx4 + 4 | 0; //@line 1989
   HEAP32[$32 >> 2] = $29; //@line 1990
   $33 = $ReallocAsyncCtx4 + 8 | 0; //@line 1991
   HEAP32[$33 >> 2] = $4; //@line 1992
   $34 = $ReallocAsyncCtx4 + 12 | 0; //@line 1993
   HEAP32[$34 >> 2] = $6; //@line 1994
   $35 = $ReallocAsyncCtx4 + 16 | 0; //@line 1995
   HEAP32[$35 >> 2] = $8; //@line 1996
   $36 = $ReallocAsyncCtx4 + 20 | 0; //@line 1997
   HEAP32[$36 >> 2] = $10; //@line 1998
   $37 = $ReallocAsyncCtx4 + 24 | 0; //@line 1999
   HEAP32[$37 >> 2] = $12; //@line 2000
   $38 = $ReallocAsyncCtx4 + 28 | 0; //@line 2001
   HEAP32[$38 >> 2] = $14; //@line 2002
   $39 = $ReallocAsyncCtx4 + 32 | 0; //@line 2003
   HEAP32[$39 >> 2] = $16; //@line 2004
   sp = STACKTOP; //@line 2005
   return;
  }
  ___async_unwind = 0; //@line 2008
  HEAP32[$ReallocAsyncCtx4 >> 2] = 112; //@line 2009
  $32 = $ReallocAsyncCtx4 + 4 | 0; //@line 2010
  HEAP32[$32 >> 2] = $29; //@line 2011
  $33 = $ReallocAsyncCtx4 + 8 | 0; //@line 2012
  HEAP32[$33 >> 2] = $4; //@line 2013
  $34 = $ReallocAsyncCtx4 + 12 | 0; //@line 2014
  HEAP32[$34 >> 2] = $6; //@line 2015
  $35 = $ReallocAsyncCtx4 + 16 | 0; //@line 2016
  HEAP32[$35 >> 2] = $8; //@line 2017
  $36 = $ReallocAsyncCtx4 + 20 | 0; //@line 2018
  HEAP32[$36 >> 2] = $10; //@line 2019
  $37 = $ReallocAsyncCtx4 + 24 | 0; //@line 2020
  HEAP32[$37 >> 2] = $12; //@line 2021
  $38 = $ReallocAsyncCtx4 + 28 | 0; //@line 2022
  HEAP32[$38 >> 2] = $14; //@line 2023
  $39 = $ReallocAsyncCtx4 + 32 | 0; //@line 2024
  HEAP32[$39 >> 2] = $16; //@line 2025
  sp = STACKTOP; //@line 2026
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
 sp = STACKTOP; //@line 12709
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 12714
 } else {
  $9 = $1 + 52 | 0; //@line 12716
  $10 = HEAP8[$9 >> 0] | 0; //@line 12717
  $11 = $1 + 53 | 0; //@line 12718
  $12 = HEAP8[$11 >> 0] | 0; //@line 12719
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 12722
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 12723
  HEAP8[$9 >> 0] = 0; //@line 12724
  HEAP8[$11 >> 0] = 0; //@line 12725
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 12726
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 12727
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 177; //@line 12730
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 12732
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 12734
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 12736
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 12738
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 12740
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 12742
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 12744
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 12746
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 12748
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 12750
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 12753
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 12755
   sp = STACKTOP; //@line 12756
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12759
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 12764
    $32 = $0 + 8 | 0; //@line 12765
    $33 = $1 + 54 | 0; //@line 12766
    $$0 = $0 + 24 | 0; //@line 12767
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
     HEAP8[$9 >> 0] = 0; //@line 12800
     HEAP8[$11 >> 0] = 0; //@line 12801
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 12802
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 12803
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 12808
     $62 = $$0 + 8 | 0; //@line 12809
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 12812
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 178; //@line 12817
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 12819
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 12821
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 12823
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 12825
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 12827
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 12829
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 12831
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 12833
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 12835
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 12837
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 12839
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 12841
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 12843
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 12846
    sp = STACKTOP; //@line 12847
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 12851
  HEAP8[$11 >> 0] = $12; //@line 12852
 }
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_57($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2720
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2722
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2724
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2726
 $8 = HEAP8[$0 + 16 >> 0] & 1; //@line 2729
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2731
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2733
 $15 = $12 + 24 | 0; //@line 2736
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$12 + 8 >> 2] | 0; //@line 2741
   if (!($18 & 2)) {
    $21 = $2 + 36 | 0; //@line 2745
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $2 + 54 | 0; //@line 2752
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 2763
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 2764
      if (!___async) {
       ___async_unwind = 0; //@line 2767
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 183; //@line 2769
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 2771
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $10; //@line 2773
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 2775
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 2777
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $2; //@line 2779
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $4; //@line 2781
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $6; //@line 2783
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $8 & 1; //@line 2786
      sp = STACKTOP; //@line 2787
      return;
     }
     $36 = $2 + 24 | 0; //@line 2790
     $37 = $2 + 54 | 0; //@line 2791
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 2806
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 2807
     if (!___async) {
      ___async_unwind = 0; //@line 2810
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 182; //@line 2812
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 2814
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $10; //@line 2816
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 2818
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 2820
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 2822
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $2; //@line 2824
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $4; //@line 2826
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $6; //@line 2828
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $8 & 1; //@line 2831
     sp = STACKTOP; //@line 2832
     return;
    }
   }
   $24 = $2 + 54 | 0; //@line 2836
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 2840
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 2841
    if (!___async) {
     ___async_unwind = 0; //@line 2844
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 181; //@line 2846
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 2848
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $10; //@line 2850
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 2852
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $2; //@line 2854
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $4; //@line 2856
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $6; //@line 2858
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $8 & 1; //@line 2861
    sp = STACKTOP; //@line 2862
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9439
      $10 = HEAP32[$9 >> 2] | 0; //@line 9440
      HEAP32[$2 >> 2] = $9 + 4; //@line 9442
      HEAP32[$0 >> 2] = $10; //@line 9443
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9459
      $17 = HEAP32[$16 >> 2] | 0; //@line 9460
      HEAP32[$2 >> 2] = $16 + 4; //@line 9462
      $20 = $0; //@line 9465
      HEAP32[$20 >> 2] = $17; //@line 9467
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 9470
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9486
      $30 = HEAP32[$29 >> 2] | 0; //@line 9487
      HEAP32[$2 >> 2] = $29 + 4; //@line 9489
      $31 = $0; //@line 9490
      HEAP32[$31 >> 2] = $30; //@line 9492
      HEAP32[$31 + 4 >> 2] = 0; //@line 9495
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9511
      $41 = $40; //@line 9512
      $43 = HEAP32[$41 >> 2] | 0; //@line 9514
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 9517
      HEAP32[$2 >> 2] = $40 + 8; //@line 9519
      $47 = $0; //@line 9520
      HEAP32[$47 >> 2] = $43; //@line 9522
      HEAP32[$47 + 4 >> 2] = $46; //@line 9525
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9541
      $57 = HEAP32[$56 >> 2] | 0; //@line 9542
      HEAP32[$2 >> 2] = $56 + 4; //@line 9544
      $59 = ($57 & 65535) << 16 >> 16; //@line 9546
      $62 = $0; //@line 9549
      HEAP32[$62 >> 2] = $59; //@line 9551
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 9554
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9570
      $72 = HEAP32[$71 >> 2] | 0; //@line 9571
      HEAP32[$2 >> 2] = $71 + 4; //@line 9573
      $73 = $0; //@line 9575
      HEAP32[$73 >> 2] = $72 & 65535; //@line 9577
      HEAP32[$73 + 4 >> 2] = 0; //@line 9580
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9596
      $83 = HEAP32[$82 >> 2] | 0; //@line 9597
      HEAP32[$2 >> 2] = $82 + 4; //@line 9599
      $85 = ($83 & 255) << 24 >> 24; //@line 9601
      $88 = $0; //@line 9604
      HEAP32[$88 >> 2] = $85; //@line 9606
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 9609
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9625
      $98 = HEAP32[$97 >> 2] | 0; //@line 9626
      HEAP32[$2 >> 2] = $97 + 4; //@line 9628
      $99 = $0; //@line 9630
      HEAP32[$99 >> 2] = $98 & 255; //@line 9632
      HEAP32[$99 + 4 >> 2] = 0; //@line 9635
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9651
      $109 = +HEAPF64[$108 >> 3]; //@line 9652
      HEAP32[$2 >> 2] = $108 + 8; //@line 9654
      HEAPF64[$0 >> 3] = $109; //@line 9655
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9671
      $116 = +HEAPF64[$115 >> 3]; //@line 9672
      HEAP32[$2 >> 2] = $115 + 8; //@line 9674
      HEAPF64[$0 >> 3] = $116; //@line 9675
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
function __ZN4mbed6Stream6printfEPKcz__async_cb_48($0) {
 $0 = $0 | 0;
 var $10 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 2034
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2036
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2038
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2040
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2042
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2044
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2046
 if (($AsyncRetVal | 0) <= 0) {
  $15 = HEAP32[(HEAP32[$4 >> 2] | 0) + 76 >> 2] | 0; //@line 2051
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 2052
  FUNCTION_TABLE_vi[$15 & 255]($2); //@line 2053
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 110; //@line 2056
   $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 2057
   HEAP32[$16 >> 2] = $4; //@line 2058
   $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 2059
   HEAP32[$17 >> 2] = $2; //@line 2060
   $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 2061
   HEAP32[$18 >> 2] = $6; //@line 2062
   $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 2063
   HEAP32[$19 >> 2] = $8; //@line 2064
   $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 2065
   HEAP32[$20 >> 2] = $AsyncRetVal; //@line 2066
   sp = STACKTOP; //@line 2067
   return;
  }
  ___async_unwind = 0; //@line 2070
  HEAP32[$ReallocAsyncCtx2 >> 2] = 110; //@line 2071
  $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 2072
  HEAP32[$16 >> 2] = $4; //@line 2073
  $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 2074
  HEAP32[$17 >> 2] = $2; //@line 2075
  $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 2076
  HEAP32[$18 >> 2] = $6; //@line 2077
  $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 2078
  HEAP32[$19 >> 2] = $8; //@line 2079
  $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 2080
  HEAP32[$20 >> 2] = $AsyncRetVal; //@line 2081
  sp = STACKTOP; //@line 2082
  return;
 }
 $23 = HEAP32[(HEAP32[$2 >> 2] | 0) + 68 >> 2] | 0; //@line 2087
 $25 = HEAP8[$10 >> 0] | 0; //@line 2089
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(36) | 0; //@line 2090
 FUNCTION_TABLE_iii[$23 & 7]($2, $25) | 0; //@line 2091
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 112; //@line 2094
  $26 = $ReallocAsyncCtx4 + 4 | 0; //@line 2095
  HEAP32[$26 >> 2] = 0; //@line 2096
  $27 = $ReallocAsyncCtx4 + 8 | 0; //@line 2097
  HEAP32[$27 >> 2] = $AsyncRetVal; //@line 2098
  $28 = $ReallocAsyncCtx4 + 12 | 0; //@line 2099
  HEAP32[$28 >> 2] = $4; //@line 2100
  $29 = $ReallocAsyncCtx4 + 16 | 0; //@line 2101
  HEAP32[$29 >> 2] = $2; //@line 2102
  $30 = $ReallocAsyncCtx4 + 20 | 0; //@line 2103
  HEAP32[$30 >> 2] = $2; //@line 2104
  $31 = $ReallocAsyncCtx4 + 24 | 0; //@line 2105
  HEAP32[$31 >> 2] = $10; //@line 2106
  $32 = $ReallocAsyncCtx4 + 28 | 0; //@line 2107
  HEAP32[$32 >> 2] = $6; //@line 2108
  $33 = $ReallocAsyncCtx4 + 32 | 0; //@line 2109
  HEAP32[$33 >> 2] = $8; //@line 2110
  sp = STACKTOP; //@line 2111
  return;
 }
 ___async_unwind = 0; //@line 2114
 HEAP32[$ReallocAsyncCtx4 >> 2] = 112; //@line 2115
 $26 = $ReallocAsyncCtx4 + 4 | 0; //@line 2116
 HEAP32[$26 >> 2] = 0; //@line 2117
 $27 = $ReallocAsyncCtx4 + 8 | 0; //@line 2118
 HEAP32[$27 >> 2] = $AsyncRetVal; //@line 2119
 $28 = $ReallocAsyncCtx4 + 12 | 0; //@line 2120
 HEAP32[$28 >> 2] = $4; //@line 2121
 $29 = $ReallocAsyncCtx4 + 16 | 0; //@line 2122
 HEAP32[$29 >> 2] = $2; //@line 2123
 $30 = $ReallocAsyncCtx4 + 20 | 0; //@line 2124
 HEAP32[$30 >> 2] = $2; //@line 2125
 $31 = $ReallocAsyncCtx4 + 24 | 0; //@line 2126
 HEAP32[$31 >> 2] = $10; //@line 2127
 $32 = $ReallocAsyncCtx4 + 28 | 0; //@line 2128
 HEAP32[$32 >> 2] = $6; //@line 2129
 $33 = $ReallocAsyncCtx4 + 32 | 0; //@line 2130
 HEAP32[$33 >> 2] = $8; //@line 2131
 sp = STACKTOP; //@line 2132
 return;
}
function __ZN11TextDisplay3clsEv($0) {
 $0 = $0 | 0;
 var $$03 = 0, $13 = 0, $14 = 0, $24 = 0, $27 = 0, $28 = 0, $3 = 0, $35 = 0, $36 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx12 = 0, $AsyncCtx16 = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1547
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 108 >> 2] | 0; //@line 1550
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1551
 FUNCTION_TABLE_viii[$3 & 3]($0, 0, 0); //@line 1552
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 70; //@line 1555
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1557
  sp = STACKTOP; //@line 1558
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1561
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 1564
 $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1565
 $8 = FUNCTION_TABLE_ii[$7 & 31]($0) | 0; //@line 1566
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 71; //@line 1569
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 1571
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1573
  sp = STACKTOP; //@line 1574
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1577
 $13 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 1580
 $AsyncCtx5 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1581
 $14 = FUNCTION_TABLE_ii[$13 & 31]($0) | 0; //@line 1582
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 72; //@line 1585
  HEAP32[$AsyncCtx5 + 4 >> 2] = $8; //@line 1587
  HEAP32[$AsyncCtx5 + 8 >> 2] = $0; //@line 1589
  HEAP32[$AsyncCtx5 + 12 >> 2] = $0; //@line 1591
  sp = STACKTOP; //@line 1592
  return;
 }
 _emscripten_free_async_context($AsyncCtx5 | 0); //@line 1595
 if ((Math_imul($14, $8) | 0) <= 0) {
  return;
 }
 $$03 = 0; //@line 1601
 while (1) {
  $AsyncCtx16 = _emscripten_alloc_async_context(20, sp) | 0; //@line 1603
  __ZN4mbed6Stream4putcEi($0, 32) | 0; //@line 1604
  if (___async) {
   label = 11; //@line 1607
   break;
  }
  _emscripten_free_async_context($AsyncCtx16 | 0); //@line 1610
  $24 = $$03 + 1 | 0; //@line 1611
  $27 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 1614
  $AsyncCtx9 = _emscripten_alloc_async_context(20, sp) | 0; //@line 1615
  $28 = FUNCTION_TABLE_ii[$27 & 31]($0) | 0; //@line 1616
  if (___async) {
   label = 13; //@line 1619
   break;
  }
  _emscripten_free_async_context($AsyncCtx9 | 0); //@line 1622
  $35 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 1625
  $AsyncCtx12 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1626
  $36 = FUNCTION_TABLE_ii[$35 & 31]($0) | 0; //@line 1627
  if (___async) {
   label = 15; //@line 1630
   break;
  }
  _emscripten_free_async_context($AsyncCtx12 | 0); //@line 1633
  if (($24 | 0) < (Math_imul($36, $28) | 0)) {
   $$03 = $24; //@line 1637
  } else {
   label = 9; //@line 1639
   break;
  }
 }
 if ((label | 0) == 9) {
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx16 >> 2] = 73; //@line 1647
  HEAP32[$AsyncCtx16 + 4 >> 2] = $$03; //@line 1649
  HEAP32[$AsyncCtx16 + 8 >> 2] = $0; //@line 1651
  HEAP32[$AsyncCtx16 + 12 >> 2] = $0; //@line 1653
  HEAP32[$AsyncCtx16 + 16 >> 2] = $0; //@line 1655
  sp = STACKTOP; //@line 1656
  return;
 } else if ((label | 0) == 13) {
  HEAP32[$AsyncCtx9 >> 2] = 74; //@line 1660
  HEAP32[$AsyncCtx9 + 4 >> 2] = $0; //@line 1662
  HEAP32[$AsyncCtx9 + 8 >> 2] = $0; //@line 1664
  HEAP32[$AsyncCtx9 + 12 >> 2] = $24; //@line 1666
  HEAP32[$AsyncCtx9 + 16 >> 2] = $0; //@line 1668
  sp = STACKTOP; //@line 1669
  return;
 } else if ((label | 0) == 15) {
  HEAP32[$AsyncCtx12 >> 2] = 75; //@line 1673
  HEAP32[$AsyncCtx12 + 4 >> 2] = $28; //@line 1675
  HEAP32[$AsyncCtx12 + 8 >> 2] = $24; //@line 1677
  HEAP32[$AsyncCtx12 + 12 >> 2] = $0; //@line 1679
  HEAP32[$AsyncCtx12 + 16 >> 2] = $0; //@line 1681
  HEAP32[$AsyncCtx12 + 20 >> 2] = $0; //@line 1683
  sp = STACKTOP; //@line 1684
  return;
 }
}
function __ZN11TextDisplay5_putcEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $11 = 0, $12 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $25 = 0, $31 = 0, $32 = 0, $35 = 0, $36 = 0, $45 = 0, $46 = 0, $49 = 0, $5 = 0, $50 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 1363
 _emscripten_asm_const_ii(2, $1 | 0) | 0; //@line 1364
 if (($1 | 0) == 10) {
  HEAP16[$0 + 24 >> 1] = 0; //@line 1368
  $5 = $0 + 26 | 0; //@line 1369
  $7 = (HEAP16[$5 >> 1] | 0) + 1 << 16 >> 16; //@line 1371
  HEAP16[$5 >> 1] = $7; //@line 1372
  $8 = $7 & 65535; //@line 1373
  $11 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 1376
  $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1377
  $12 = FUNCTION_TABLE_ii[$11 & 31]($0) | 0; //@line 1378
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 64; //@line 1381
   HEAP32[$AsyncCtx + 4 >> 2] = $8; //@line 1383
   HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 1385
   HEAP32[$AsyncCtx + 12 >> 2] = $5; //@line 1387
   sp = STACKTOP; //@line 1388
   return 0; //@line 1389
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1391
  if (($12 | 0) > ($8 | 0)) {
   return $1 | 0; //@line 1394
  }
  HEAP16[$5 >> 1] = 0; //@line 1396
  return $1 | 0; //@line 1397
 }
 $19 = HEAP32[(HEAP32[$0 >> 2] | 0) + 88 >> 2] | 0; //@line 1401
 $20 = $0 + 24 | 0; //@line 1402
 $22 = HEAPU16[$20 >> 1] | 0; //@line 1404
 $23 = $0 + 26 | 0; //@line 1405
 $25 = HEAPU16[$23 >> 1] | 0; //@line 1407
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 1408
 FUNCTION_TABLE_viiii[$19 & 7]($0, $22, $25, $1); //@line 1409
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 65; //@line 1412
  HEAP32[$AsyncCtx3 + 4 >> 2] = $20; //@line 1414
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 1416
  HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 1418
  HEAP32[$AsyncCtx3 + 16 >> 2] = $23; //@line 1420
  sp = STACKTOP; //@line 1421
  return 0; //@line 1422
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1424
 $31 = (HEAP16[$20 >> 1] | 0) + 1 << 16 >> 16; //@line 1426
 HEAP16[$20 >> 1] = $31; //@line 1427
 $32 = $31 & 65535; //@line 1428
 $35 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 1431
 $AsyncCtx6 = _emscripten_alloc_async_context(28, sp) | 0; //@line 1432
 $36 = FUNCTION_TABLE_ii[$35 & 31]($0) | 0; //@line 1433
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 66; //@line 1436
  HEAP32[$AsyncCtx6 + 4 >> 2] = $32; //@line 1438
  HEAP32[$AsyncCtx6 + 8 >> 2] = $1; //@line 1440
  HEAP32[$AsyncCtx6 + 12 >> 2] = $20; //@line 1442
  HEAP32[$AsyncCtx6 + 16 >> 2] = $23; //@line 1444
  HEAP32[$AsyncCtx6 + 20 >> 2] = $0; //@line 1446
  HEAP32[$AsyncCtx6 + 24 >> 2] = $0; //@line 1448
  sp = STACKTOP; //@line 1449
  return 0; //@line 1450
 }
 _emscripten_free_async_context($AsyncCtx6 | 0); //@line 1452
 if (($36 | 0) > ($32 | 0)) {
  return $1 | 0; //@line 1455
 }
 HEAP16[$20 >> 1] = 0; //@line 1457
 $45 = (HEAP16[$23 >> 1] | 0) + 1 << 16 >> 16; //@line 1459
 HEAP16[$23 >> 1] = $45; //@line 1460
 $46 = $45 & 65535; //@line 1461
 $49 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 1464
 $AsyncCtx10 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1465
 $50 = FUNCTION_TABLE_ii[$49 & 31]($0) | 0; //@line 1466
 if (___async) {
  HEAP32[$AsyncCtx10 >> 2] = 67; //@line 1469
  HEAP32[$AsyncCtx10 + 4 >> 2] = $46; //@line 1471
  HEAP32[$AsyncCtx10 + 8 >> 2] = $1; //@line 1473
  HEAP32[$AsyncCtx10 + 12 >> 2] = $23; //@line 1475
  sp = STACKTOP; //@line 1476
  return 0; //@line 1477
 }
 _emscripten_free_async_context($AsyncCtx10 | 0); //@line 1479
 if (($50 | 0) > ($46 | 0)) {
  return $1 | 0; //@line 1482
 }
 HEAP16[$23 >> 1] = 0; //@line 1484
 return $1 | 0; //@line 1485
}
function _vfprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $$0 = 0, $$1 = 0, $13 = 0, $14 = 0, $19 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $28 = 0, $29 = 0, $3 = 0, $32 = 0, $4 = 0, $43 = 0, $5 = 0, $51 = 0, $6 = 0, $AsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 8339
 STACKTOP = STACKTOP + 224 | 0; //@line 8340
 $3 = sp + 120 | 0; //@line 8341
 $4 = sp + 80 | 0; //@line 8342
 $5 = sp; //@line 8343
 $6 = sp + 136 | 0; //@line 8344
 dest = $4; //@line 8345
 stop = dest + 40 | 0; //@line 8345
 do {
  HEAP32[dest >> 2] = 0; //@line 8345
  dest = dest + 4 | 0; //@line 8345
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 8347
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 8351
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 8358
  } else {
   $43 = 0; //@line 8360
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 8362
  $14 = $13 & 32; //@line 8363
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 8369
  }
  $19 = $0 + 48 | 0; //@line 8371
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 8376
    $24 = HEAP32[$23 >> 2] | 0; //@line 8377
    HEAP32[$23 >> 2] = $6; //@line 8378
    $25 = $0 + 28 | 0; //@line 8379
    HEAP32[$25 >> 2] = $6; //@line 8380
    $26 = $0 + 20 | 0; //@line 8381
    HEAP32[$26 >> 2] = $6; //@line 8382
    HEAP32[$19 >> 2] = 80; //@line 8383
    $28 = $0 + 16 | 0; //@line 8385
    HEAP32[$28 >> 2] = $6 + 80; //@line 8386
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 8387
    if (!$24) {
     $$1 = $29; //@line 8390
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 8393
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 8394
     FUNCTION_TABLE_iiii[$32 & 15]($0, 0, 0) | 0; //@line 8395
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 150; //@line 8398
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 8400
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 8402
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 8404
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 8406
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 8408
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 8410
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 8412
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 8414
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 8416
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 8418
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 8420
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 8422
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 8424
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 8426
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 8428
      sp = STACKTOP; //@line 8429
      STACKTOP = sp; //@line 8430
      return 0; //@line 8430
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 8432
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 8435
      HEAP32[$23 >> 2] = $24; //@line 8436
      HEAP32[$19 >> 2] = 0; //@line 8437
      HEAP32[$28 >> 2] = 0; //@line 8438
      HEAP32[$25 >> 2] = 0; //@line 8439
      HEAP32[$26 >> 2] = 0; //@line 8440
      $$1 = $$; //@line 8441
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 8447
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 8450
  HEAP32[$0 >> 2] = $51 | $14; //@line 8455
  if ($43 | 0) {
   ___unlockfile($0); //@line 8458
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 8460
 }
 STACKTOP = sp; //@line 8462
 return $$0 | 0; //@line 8462
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12244
 STACKTOP = STACKTOP + 64 | 0; //@line 12245
 $4 = sp; //@line 12246
 $5 = HEAP32[$0 >> 2] | 0; //@line 12247
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 12250
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 12252
 HEAP32[$4 >> 2] = $2; //@line 12253
 HEAP32[$4 + 4 >> 2] = $0; //@line 12255
 HEAP32[$4 + 8 >> 2] = $1; //@line 12257
 HEAP32[$4 + 12 >> 2] = $3; //@line 12259
 $14 = $4 + 16 | 0; //@line 12260
 $15 = $4 + 20 | 0; //@line 12261
 $16 = $4 + 24 | 0; //@line 12262
 $17 = $4 + 28 | 0; //@line 12263
 $18 = $4 + 32 | 0; //@line 12264
 $19 = $4 + 40 | 0; //@line 12265
 dest = $14; //@line 12266
 stop = dest + 36 | 0; //@line 12266
 do {
  HEAP32[dest >> 2] = 0; //@line 12266
  dest = dest + 4 | 0; //@line 12266
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 12266
 HEAP8[$14 + 38 >> 0] = 0; //@line 12266
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 12271
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 12274
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 12275
   FUNCTION_TABLE_viiiiii[$24 & 7]($10, $4, $8, $8, 1, 0); //@line 12276
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 169; //@line 12279
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 12281
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 12283
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 12285
    sp = STACKTOP; //@line 12286
    STACKTOP = sp; //@line 12287
    return 0; //@line 12287
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12289
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 12293
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 12297
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 12300
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 12301
   FUNCTION_TABLE_viiiii[$33 & 7]($10, $4, $8, 1, 0); //@line 12302
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 170; //@line 12305
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 12307
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 12309
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 12311
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 12313
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 12315
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 12317
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 12319
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 12321
    sp = STACKTOP; //@line 12322
    STACKTOP = sp; //@line 12323
    return 0; //@line 12323
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12325
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 12339
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 12347
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 12363
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 12368
  }
 } while (0);
 STACKTOP = sp; //@line 12371
 return $$0 | 0; //@line 12371
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 8211
 $7 = ($2 | 0) != 0; //@line 8215
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 8219
   $$03555 = $0; //@line 8220
   $$03654 = $2; //@line 8220
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 8225
     $$036$lcssa64 = $$03654; //@line 8225
     label = 6; //@line 8226
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 8229
    $12 = $$03654 + -1 | 0; //@line 8230
    $16 = ($12 | 0) != 0; //@line 8234
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 8237
     $$03654 = $12; //@line 8237
    } else {
     $$035$lcssa = $11; //@line 8239
     $$036$lcssa = $12; //@line 8239
     $$lcssa = $16; //@line 8239
     label = 5; //@line 8240
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 8245
   $$036$lcssa = $2; //@line 8245
   $$lcssa = $7; //@line 8245
   label = 5; //@line 8246
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 8251
   $$036$lcssa64 = $$036$lcssa; //@line 8251
   label = 6; //@line 8252
  } else {
   $$2 = $$035$lcssa; //@line 8254
   $$3 = 0; //@line 8254
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 8260
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 8263
    $$3 = $$036$lcssa64; //@line 8263
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 8265
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 8269
      $$13745 = $$036$lcssa64; //@line 8269
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 8272
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 8281
       $30 = $$13745 + -4 | 0; //@line 8282
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 8285
        $$13745 = $30; //@line 8285
       } else {
        $$0$lcssa = $29; //@line 8287
        $$137$lcssa = $30; //@line 8287
        label = 11; //@line 8288
        break L11;
       }
      }
      $$140 = $$046; //@line 8292
      $$23839 = $$13745; //@line 8292
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 8294
      $$137$lcssa = $$036$lcssa64; //@line 8294
      label = 11; //@line 8295
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 8301
      $$3 = 0; //@line 8301
      break;
     } else {
      $$140 = $$0$lcssa; //@line 8304
      $$23839 = $$137$lcssa; //@line 8304
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 8311
      $$3 = $$23839; //@line 8311
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 8314
     $$23839 = $$23839 + -1 | 0; //@line 8315
     if (!$$23839) {
      $$2 = $35; //@line 8318
      $$3 = 0; //@line 8318
      break;
     } else {
      $$140 = $35; //@line 8321
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 8329
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 7982
 do {
  if (!$0) {
   do {
    if (!(HEAP32[319] | 0)) {
     $34 = 0; //@line 7990
    } else {
     $12 = HEAP32[319] | 0; //@line 7992
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7993
     $13 = _fflush($12) | 0; //@line 7994
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 146; //@line 7997
      sp = STACKTOP; //@line 7998
      return 0; //@line 7999
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 8001
      $34 = $13; //@line 8002
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 8008
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 8012
    } else {
     $$02327 = $$02325; //@line 8014
     $$02426 = $34; //@line 8014
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 8021
      } else {
       $28 = 0; //@line 8023
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8031
       $25 = ___fflush_unlocked($$02327) | 0; //@line 8032
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 8037
       $$1 = $25 | $$02426; //@line 8039
      } else {
       $$1 = $$02426; //@line 8041
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 8045
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 8048
      if (!$$023) {
       $$024$lcssa = $$1; //@line 8051
       break L9;
      } else {
       $$02327 = $$023; //@line 8054
       $$02426 = $$1; //@line 8054
      }
     }
     HEAP32[$AsyncCtx >> 2] = 147; //@line 8057
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 8059
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 8061
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 8063
     sp = STACKTOP; //@line 8064
     return 0; //@line 8065
    }
   } while (0);
   ___ofl_unlock(); //@line 8068
   $$0 = $$024$lcssa; //@line 8069
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 8075
    $5 = ___fflush_unlocked($0) | 0; //@line 8076
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 144; //@line 8079
     sp = STACKTOP; //@line 8080
     return 0; //@line 8081
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 8083
     $$0 = $5; //@line 8084
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 8089
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 8090
   $7 = ___fflush_unlocked($0) | 0; //@line 8091
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 145; //@line 8094
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 8097
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 8099
    sp = STACKTOP; //@line 8100
    return 0; //@line 8101
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8103
   if ($phitmp) {
    $$0 = $7; //@line 8105
   } else {
    ___unlockfile($0); //@line 8107
    $$0 = $7; //@line 8108
   }
  }
 } while (0);
 return $$0 | 0; //@line 8112
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12426
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12432
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 12438
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 12441
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12442
    FUNCTION_TABLE_viiiii[$53 & 7]($50, $1, $2, $3, $4); //@line 12443
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 173; //@line 12446
     sp = STACKTOP; //@line 12447
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12450
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 12458
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 12463
     $19 = $1 + 44 | 0; //@line 12464
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 12470
     HEAP8[$22 >> 0] = 0; //@line 12471
     $23 = $1 + 53 | 0; //@line 12472
     HEAP8[$23 >> 0] = 0; //@line 12473
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 12475
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 12478
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 12479
     FUNCTION_TABLE_viiiiii[$28 & 7]($25, $1, $2, $2, 1, $4); //@line 12480
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 172; //@line 12483
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 12485
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 12487
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 12489
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 12491
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 12493
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 12495
      sp = STACKTOP; //@line 12496
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 12499
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 12503
      label = 13; //@line 12504
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 12509
       label = 13; //@line 12510
      } else {
       $$037$off039 = 3; //@line 12512
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 12516
      $39 = $1 + 40 | 0; //@line 12517
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 12520
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 12530
        $$037$off039 = $$037$off038; //@line 12531
       } else {
        $$037$off039 = $$037$off038; //@line 12533
       }
      } else {
       $$037$off039 = $$037$off038; //@line 12536
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 12539
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 12546
   }
  }
 } while (0);
 return;
}
function __ZN4mbed6Stream4readEPvj__async_cb_73($0) {
 $0 = $0 | 0;
 var $$016$lcssa = 0, $10 = 0, $12 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4173
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4175
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4177
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4179
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4181
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4183
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4185
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4187
 if (($AsyncRetVal | 0) == -1) {
  $$016$lcssa = $4; //@line 4190
 } else {
  $20 = $4 + 1 | 0; //@line 4193
  HEAP8[$4 >> 0] = $AsyncRetVal; //@line 4194
  if (($20 | 0) == ($6 | 0)) {
   $$016$lcssa = $6; //@line 4197
  } else {
   $16 = HEAP32[(HEAP32[$12 >> 2] | 0) + 72 >> 2] | 0; //@line 4201
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 4202
   $17 = FUNCTION_TABLE_ii[$16 & 31]($10) | 0; //@line 4203
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 4206
    $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 4207
    HEAP32[$18 >> 2] = $2; //@line 4208
    $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 4209
    HEAP32[$19 >> 2] = $20; //@line 4210
    $21 = $ReallocAsyncCtx2 + 12 | 0; //@line 4211
    HEAP32[$21 >> 2] = $6; //@line 4212
    $22 = $ReallocAsyncCtx2 + 16 | 0; //@line 4213
    HEAP32[$22 >> 2] = $8; //@line 4214
    $23 = $ReallocAsyncCtx2 + 20 | 0; //@line 4215
    HEAP32[$23 >> 2] = $10; //@line 4216
    $24 = $ReallocAsyncCtx2 + 24 | 0; //@line 4217
    HEAP32[$24 >> 2] = $12; //@line 4218
    sp = STACKTOP; //@line 4219
    return;
   }
   HEAP32[___async_retval >> 2] = $17; //@line 4223
   ___async_unwind = 0; //@line 4224
   HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 4225
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 4226
   HEAP32[$18 >> 2] = $2; //@line 4227
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 4228
   HEAP32[$19 >> 2] = $20; //@line 4229
   $21 = $ReallocAsyncCtx2 + 12 | 0; //@line 4230
   HEAP32[$21 >> 2] = $6; //@line 4231
   $22 = $ReallocAsyncCtx2 + 16 | 0; //@line 4232
   HEAP32[$22 >> 2] = $8; //@line 4233
   $23 = $ReallocAsyncCtx2 + 20 | 0; //@line 4234
   HEAP32[$23 >> 2] = $10; //@line 4235
   $24 = $ReallocAsyncCtx2 + 24 | 0; //@line 4236
   HEAP32[$24 >> 2] = $12; //@line 4237
   sp = STACKTOP; //@line 4238
   return;
  }
 }
 $31 = HEAP32[(HEAP32[$8 >> 2] | 0) + 84 >> 2] | 0; //@line 4244
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 4245
 FUNCTION_TABLE_vi[$31 & 255]($10); //@line 4246
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 96; //@line 4249
  $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 4250
  HEAP32[$32 >> 2] = $$016$lcssa; //@line 4251
  $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 4252
  HEAP32[$33 >> 2] = $2; //@line 4253
  sp = STACKTOP; //@line 4254
  return;
 }
 ___async_unwind = 0; //@line 4257
 HEAP32[$ReallocAsyncCtx3 >> 2] = 96; //@line 4258
 $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 4259
 HEAP32[$32 >> 2] = $$016$lcssa; //@line 4260
 $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 4261
 HEAP32[$33 >> 2] = $2; //@line 4262
 sp = STACKTOP; //@line 4263
 return;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $12 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $29 = 0, $3 = 0, $36 = 0, $39 = 0, $40 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx14 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 11738
 STACKTOP = STACKTOP + 48 | 0; //@line 11739
 $vararg_buffer10 = sp + 32 | 0; //@line 11740
 $vararg_buffer7 = sp + 24 | 0; //@line 11741
 $vararg_buffer3 = sp + 16 | 0; //@line 11742
 $vararg_buffer = sp; //@line 11743
 $0 = sp + 36 | 0; //@line 11744
 $1 = ___cxa_get_globals_fast() | 0; //@line 11745
 if ($1 | 0) {
  $3 = HEAP32[$1 >> 2] | 0; //@line 11748
  if ($3 | 0) {
   $7 = $3 + 48 | 0; //@line 11753
   $9 = HEAP32[$7 >> 2] | 0; //@line 11755
   $12 = HEAP32[$7 + 4 >> 2] | 0; //@line 11758
   if (!(($9 & -256 | 0) == 1126902528 & ($12 | 0) == 1129074247)) {
    HEAP32[$vararg_buffer7 >> 2] = 8105; //@line 11764
    _abort_message(8055, $vararg_buffer7); //@line 11765
   }
   if (($9 | 0) == 1126902529 & ($12 | 0) == 1129074247) {
    $22 = HEAP32[$3 + 44 >> 2] | 0; //@line 11774
   } else {
    $22 = $3 + 80 | 0; //@line 11776
   }
   HEAP32[$0 >> 2] = $22; //@line 11778
   $23 = HEAP32[$3 >> 2] | 0; //@line 11779
   $25 = HEAP32[$23 + 4 >> 2] | 0; //@line 11781
   $28 = HEAP32[(HEAP32[52] | 0) + 16 >> 2] | 0; //@line 11784
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 11785
   $29 = FUNCTION_TABLE_iiii[$28 & 15](208, $23, $0) | 0; //@line 11786
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 163; //@line 11789
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 11791
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 11793
    HEAP32[$AsyncCtx + 12 >> 2] = $25; //@line 11795
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 11797
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 11799
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 11801
    sp = STACKTOP; //@line 11802
    STACKTOP = sp; //@line 11803
    return;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 11805
   if (!$29) {
    HEAP32[$vararg_buffer3 >> 2] = 8105; //@line 11807
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 11809
    _abort_message(8014, $vararg_buffer3); //@line 11810
   }
   $36 = HEAP32[$0 >> 2] | 0; //@line 11813
   $39 = HEAP32[(HEAP32[$36 >> 2] | 0) + 8 >> 2] | 0; //@line 11816
   $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 11817
   $40 = FUNCTION_TABLE_ii[$39 & 31]($36) | 0; //@line 11818
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 164; //@line 11821
    HEAP32[$AsyncCtx14 + 4 >> 2] = $vararg_buffer; //@line 11823
    HEAP32[$AsyncCtx14 + 8 >> 2] = $25; //@line 11825
    HEAP32[$AsyncCtx14 + 12 >> 2] = $vararg_buffer; //@line 11827
    sp = STACKTOP; //@line 11828
    STACKTOP = sp; //@line 11829
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 11831
    HEAP32[$vararg_buffer >> 2] = 8105; //@line 11832
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 11834
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 11836
    _abort_message(7969, $vararg_buffer); //@line 11837
   }
  }
 }
 _abort_message(8093, $vararg_buffer10); //@line 11842
}
function __ZN4mbed6Stream5writeEPKvj__async_cb_75($0) {
 $0 = $0 | 0;
 var $$1 = 0, $10 = 0, $12 = 0, $17 = 0, $18 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4492
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4494
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4496
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4498
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4500
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4502
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4504
 if ((HEAP32[___async_retval >> 2] | 0) == -1) {
  $$1 = $2; //@line 4509
 } else {
  if (($2 | 0) == ($4 | 0)) {
   $$1 = $4; //@line 4513
  } else {
   $17 = HEAP32[(HEAP32[$12 >> 2] | 0) + 68 >> 2] | 0; //@line 4517
   $18 = $2 + 1 | 0; //@line 4518
   $20 = HEAP8[$2 >> 0] | 0; //@line 4520
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 4521
   $21 = FUNCTION_TABLE_iii[$17 & 7]($8, $20) | 0; //@line 4522
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 98; //@line 4525
    $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 4526
    HEAP32[$22 >> 2] = $18; //@line 4527
    $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 4528
    HEAP32[$23 >> 2] = $4; //@line 4529
    $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 4530
    HEAP32[$24 >> 2] = $6; //@line 4531
    $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 4532
    HEAP32[$25 >> 2] = $8; //@line 4533
    $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 4534
    HEAP32[$26 >> 2] = $10; //@line 4535
    $27 = $ReallocAsyncCtx2 + 24 | 0; //@line 4536
    HEAP32[$27 >> 2] = $12; //@line 4537
    sp = STACKTOP; //@line 4538
    return;
   }
   HEAP32[___async_retval >> 2] = $21; //@line 4542
   ___async_unwind = 0; //@line 4543
   HEAP32[$ReallocAsyncCtx2 >> 2] = 98; //@line 4544
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 4545
   HEAP32[$22 >> 2] = $18; //@line 4546
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 4547
   HEAP32[$23 >> 2] = $4; //@line 4548
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 4549
   HEAP32[$24 >> 2] = $6; //@line 4550
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 4551
   HEAP32[$25 >> 2] = $8; //@line 4552
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 4553
   HEAP32[$26 >> 2] = $10; //@line 4554
   $27 = $ReallocAsyncCtx2 + 24 | 0; //@line 4555
   HEAP32[$27 >> 2] = $12; //@line 4556
   sp = STACKTOP; //@line 4557
   return;
  }
 }
 $32 = HEAP32[(HEAP32[$6 >> 2] | 0) + 84 >> 2] | 0; //@line 4563
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 4564
 FUNCTION_TABLE_vi[$32 & 255]($8); //@line 4565
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 99; //@line 4568
  $33 = $ReallocAsyncCtx3 + 4 | 0; //@line 4569
  HEAP32[$33 >> 2] = $$1; //@line 4570
  $34 = $ReallocAsyncCtx3 + 8 | 0; //@line 4571
  HEAP32[$34 >> 2] = $10; //@line 4572
  sp = STACKTOP; //@line 4573
  return;
 }
 ___async_unwind = 0; //@line 4576
 HEAP32[$ReallocAsyncCtx3 >> 2] = 99; //@line 4577
 $33 = $ReallocAsyncCtx3 + 4 | 0; //@line 4578
 HEAP32[$33 >> 2] = $$1; //@line 4579
 $34 = $ReallocAsyncCtx3 + 8 | 0; //@line 4580
 HEAP32[$34 >> 2] = $10; //@line 4581
 sp = STACKTOP; //@line 4582
 return;
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6693
 STACKTOP = STACKTOP + 48 | 0; //@line 6694
 $vararg_buffer3 = sp + 16 | 0; //@line 6695
 $vararg_buffer = sp; //@line 6696
 $3 = sp + 32 | 0; //@line 6697
 $4 = $0 + 28 | 0; //@line 6698
 $5 = HEAP32[$4 >> 2] | 0; //@line 6699
 HEAP32[$3 >> 2] = $5; //@line 6700
 $7 = $0 + 20 | 0; //@line 6702
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 6704
 HEAP32[$3 + 4 >> 2] = $9; //@line 6705
 HEAP32[$3 + 8 >> 2] = $1; //@line 6707
 HEAP32[$3 + 12 >> 2] = $2; //@line 6709
 $12 = $9 + $2 | 0; //@line 6710
 $13 = $0 + 60 | 0; //@line 6711
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 6714
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 6716
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 6718
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 6720
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 6724
  } else {
   $$04756 = 2; //@line 6726
   $$04855 = $12; //@line 6726
   $$04954 = $3; //@line 6726
   $27 = $17; //@line 6726
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 6732
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 6734
    $38 = $27 >>> 0 > $37 >>> 0; //@line 6735
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 6737
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 6739
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 6741
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 6744
    $44 = $$150 + 4 | 0; //@line 6745
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 6748
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 6751
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 6753
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 6755
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 6757
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 6760
     break L1;
    } else {
     $$04756 = $$1; //@line 6763
     $$04954 = $$150; //@line 6763
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 6767
   HEAP32[$4 >> 2] = 0; //@line 6768
   HEAP32[$7 >> 2] = 0; //@line 6769
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 6772
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 6775
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 6780
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 6786
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 6791
  $25 = $20; //@line 6792
  HEAP32[$4 >> 2] = $25; //@line 6793
  HEAP32[$7 >> 2] = $25; //@line 6794
  $$051 = $2; //@line 6795
 }
 STACKTOP = sp; //@line 6797
 return $$051 | 0; //@line 6797
}
function __ZN4mbed6Stream5writeEPKvj__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $26 = 0, $27 = 0, $28 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4406
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4408
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4410
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4412
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4414
 if (($4 | 0) == ($6 | 0)) {
  $26 = HEAP32[(HEAP32[$8 >> 2] | 0) + 84 >> 2] | 0; //@line 4419
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 4420
  FUNCTION_TABLE_vi[$26 & 255]($2); //@line 4421
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 99; //@line 4424
   $27 = $ReallocAsyncCtx3 + 4 | 0; //@line 4425
   HEAP32[$27 >> 2] = $6; //@line 4426
   $28 = $ReallocAsyncCtx3 + 8 | 0; //@line 4427
   HEAP32[$28 >> 2] = $4; //@line 4428
   sp = STACKTOP; //@line 4429
   return;
  }
  ___async_unwind = 0; //@line 4432
  HEAP32[$ReallocAsyncCtx3 >> 2] = 99; //@line 4433
  $27 = $ReallocAsyncCtx3 + 4 | 0; //@line 4434
  HEAP32[$27 >> 2] = $6; //@line 4435
  $28 = $ReallocAsyncCtx3 + 8 | 0; //@line 4436
  HEAP32[$28 >> 2] = $4; //@line 4437
  sp = STACKTOP; //@line 4438
  return;
 } else {
  $12 = HEAP32[(HEAP32[$2 >> 2] | 0) + 68 >> 2] | 0; //@line 4443
  $13 = $4 + 1 | 0; //@line 4444
  $15 = HEAP8[$4 >> 0] | 0; //@line 4446
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 4447
  $16 = FUNCTION_TABLE_iii[$12 & 7]($2, $15) | 0; //@line 4448
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 98; //@line 4451
   $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 4452
   HEAP32[$17 >> 2] = $13; //@line 4453
   $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 4454
   HEAP32[$18 >> 2] = $6; //@line 4455
   $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 4456
   HEAP32[$19 >> 2] = $8; //@line 4457
   $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 4458
   HEAP32[$20 >> 2] = $2; //@line 4459
   $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 4460
   HEAP32[$21 >> 2] = $4; //@line 4461
   $22 = $ReallocAsyncCtx2 + 24 | 0; //@line 4462
   HEAP32[$22 >> 2] = $2; //@line 4463
   sp = STACKTOP; //@line 4464
   return;
  }
  HEAP32[___async_retval >> 2] = $16; //@line 4468
  ___async_unwind = 0; //@line 4469
  HEAP32[$ReallocAsyncCtx2 >> 2] = 98; //@line 4470
  $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 4471
  HEAP32[$17 >> 2] = $13; //@line 4472
  $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 4473
  HEAP32[$18 >> 2] = $6; //@line 4474
  $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 4475
  HEAP32[$19 >> 2] = $8; //@line 4476
  $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 4477
  HEAP32[$20 >> 2] = $2; //@line 4478
  $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 4479
  HEAP32[$21 >> 2] = $4; //@line 4480
  $22 = $ReallocAsyncCtx2 + 24 | 0; //@line 4481
  HEAP32[$22 >> 2] = $2; //@line 4482
  sp = STACKTOP; //@line 4483
  return;
 }
}
function _freopen__async_cb($0) {
 $0 = $0 | 0;
 var $$pre = 0, $12 = 0, $14 = 0, $16 = 0, $2 = 0, $28 = 0, $30 = 0, $31 = 0, $33 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1523
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1525
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1527
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1529
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1531
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1535
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1537
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1539
 if (!$2) {
  $$pre = $12 + 60 | 0; //@line 1546
  if ($6 & 524288 | 0) {
   HEAP32[$16 >> 2] = HEAP32[$$pre >> 2]; //@line 1549
   HEAP32[$16 + 4 >> 2] = 2; //@line 1551
   HEAP32[$16 + 8 >> 2] = 1; //@line 1553
   ___syscall221(221, $16 | 0) | 0; //@line 1554
  }
  HEAP32[$8 >> 2] = HEAP32[$$pre >> 2]; //@line 1558
  HEAP32[$8 + 4 >> 2] = 4; //@line 1560
  HEAP32[$8 + 8 >> 2] = $6 & -524481; //@line 1562
  if ((___syscall_ret(___syscall221(221, $8 | 0) | 0) | 0) >= 0) {
   if ($14 | 0) {
    ___unlockfile($12); //@line 1569
   }
   HEAP32[___async_retval >> 2] = $12; //@line 1572
   return;
  }
 } else {
  $28 = _fopen($2, $4) | 0; //@line 1576
  if ($28 | 0) {
   $30 = $28 + 60 | 0; //@line 1579
   $31 = HEAP32[$30 >> 2] | 0; //@line 1580
   $33 = HEAP32[$12 + 60 >> 2] | 0; //@line 1582
   if (($31 | 0) == ($33 | 0)) {
    HEAP32[$30 >> 2] = -1; //@line 1585
   } else {
    if ((___dup3($31, $33, $6 & 524288) | 0) < 0) {
     $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 1591
     _fclose($28) | 0; //@line 1592
     if (!___async) {
      ___async_unwind = 0; //@line 1595
     }
     HEAP32[$ReallocAsyncCtx3 >> 2] = 156; //@line 1597
     HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $12; //@line 1599
     sp = STACKTOP; //@line 1600
     return;
    }
   }
   HEAP32[$12 >> 2] = HEAP32[$12 >> 2] & 1 | HEAP32[$28 >> 2]; //@line 1608
   HEAP32[$12 + 32 >> 2] = HEAP32[$28 + 32 >> 2]; //@line 1612
   HEAP32[$12 + 36 >> 2] = HEAP32[$28 + 36 >> 2]; //@line 1616
   HEAP32[$12 + 40 >> 2] = HEAP32[$28 + 40 >> 2]; //@line 1620
   HEAP32[$12 + 12 >> 2] = HEAP32[$28 + 12 >> 2]; //@line 1624
   $ReallocAsyncCtx4 = _emscripten_realloc_async_context(12) | 0; //@line 1625
   _fclose($28) | 0; //@line 1626
   if (!___async) {
    ___async_unwind = 0; //@line 1629
   }
   HEAP32[$ReallocAsyncCtx4 >> 2] = 155; //@line 1631
   HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $14; //@line 1633
   HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $12; //@line 1635
   sp = STACKTOP; //@line 1636
   return;
  }
 }
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 1640
 _fclose($12) | 0; //@line 1641
 if (!___async) {
  ___async_unwind = 0; //@line 1644
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 157; //@line 1646
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $12; //@line 1648
 sp = STACKTOP; //@line 1649
 return;
}
function __ZN4mbed6Stream4readEPvj__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $25 = 0, $26 = 0, $27 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4088
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4090
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4094
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4096
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4098
 if (!(HEAP32[$0 + 8 >> 2] | 0)) {
  $25 = HEAP32[(HEAP32[$10 >> 2] | 0) + 84 >> 2] | 0; //@line 4103
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 4104
  FUNCTION_TABLE_vi[$25 & 255]($2); //@line 4105
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 96; //@line 4108
   $26 = $ReallocAsyncCtx3 + 4 | 0; //@line 4109
   HEAP32[$26 >> 2] = $6; //@line 4110
   $27 = $ReallocAsyncCtx3 + 8 | 0; //@line 4111
   HEAP32[$27 >> 2] = $6; //@line 4112
   sp = STACKTOP; //@line 4113
   return;
  }
  ___async_unwind = 0; //@line 4116
  HEAP32[$ReallocAsyncCtx3 >> 2] = 96; //@line 4117
  $26 = $ReallocAsyncCtx3 + 4 | 0; //@line 4118
  HEAP32[$26 >> 2] = $6; //@line 4119
  $27 = $ReallocAsyncCtx3 + 8 | 0; //@line 4120
  HEAP32[$27 >> 2] = $6; //@line 4121
  sp = STACKTOP; //@line 4122
  return;
 } else {
  $14 = HEAP32[(HEAP32[$2 >> 2] | 0) + 72 >> 2] | 0; //@line 4127
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 4128
  $15 = FUNCTION_TABLE_ii[$14 & 31]($2) | 0; //@line 4129
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 4132
   $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 4133
   HEAP32[$16 >> 2] = $6; //@line 4134
   $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 4135
   HEAP32[$17 >> 2] = $6; //@line 4136
   $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 4137
   HEAP32[$18 >> 2] = $8; //@line 4138
   $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 4139
   HEAP32[$19 >> 2] = $10; //@line 4140
   $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 4141
   HEAP32[$20 >> 2] = $2; //@line 4142
   $21 = $ReallocAsyncCtx2 + 24 | 0; //@line 4143
   HEAP32[$21 >> 2] = $2; //@line 4144
   sp = STACKTOP; //@line 4145
   return;
  }
  HEAP32[___async_retval >> 2] = $15; //@line 4149
  ___async_unwind = 0; //@line 4150
  HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 4151
  $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 4152
  HEAP32[$16 >> 2] = $6; //@line 4153
  $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 4154
  HEAP32[$17 >> 2] = $6; //@line 4155
  $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 4156
  HEAP32[$18 >> 2] = $8; //@line 4157
  $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 4158
  HEAP32[$19 >> 2] = $10; //@line 4159
  $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 4160
  HEAP32[$20 >> 2] = $2; //@line 4161
  $21 = $ReallocAsyncCtx2 + 24 | 0; //@line 4162
  HEAP32[$21 >> 2] = $2; //@line 4163
  sp = STACKTOP; //@line 4164
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_63($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3421
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3425
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3427
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 3429
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3431
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 3433
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3435
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3437
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3439
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 3441
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 3444
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 3446
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 3450
   $27 = $6 + 24 | 0; //@line 3451
   $28 = $4 + 8 | 0; //@line 3452
   $29 = $6 + 54 | 0; //@line 3453
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
    HEAP8[$10 >> 0] = 0; //@line 3483
    HEAP8[$14 >> 0] = 0; //@line 3484
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 3485
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 3486
    if (!___async) {
     ___async_unwind = 0; //@line 3489
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 178; //@line 3491
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 3493
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 3495
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 3497
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 3499
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 3501
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 3503
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 3505
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 3507
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 3509
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 3511
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 3513
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 3515
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 3517
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 3520
    sp = STACKTOP; //@line 3521
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 3526
 HEAP8[$14 >> 0] = $12; //@line 3527
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3305
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3309
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3311
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 3313
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3315
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 3317
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3319
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3321
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3323
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 3325
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 3327
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 3329
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 3331
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 3334
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 3335
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
    HEAP8[$10 >> 0] = 0; //@line 3368
    HEAP8[$14 >> 0] = 0; //@line 3369
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 3370
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 3371
    if (!___async) {
     ___async_unwind = 0; //@line 3374
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 178; //@line 3376
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 3378
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 3380
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 3382
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 3384
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 3386
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 3388
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 3390
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 3392
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 3394
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 3396
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 3398
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 3400
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 3402
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 3405
    sp = STACKTOP; //@line 3406
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 3411
 HEAP8[$14 >> 0] = $12; //@line 3412
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 5290
 }
 ret = dest | 0; //@line 5293
 dest_end = dest + num | 0; //@line 5294
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 5298
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 5299
   dest = dest + 1 | 0; //@line 5300
   src = src + 1 | 0; //@line 5301
   num = num - 1 | 0; //@line 5302
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 5304
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 5305
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 5307
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 5308
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 5309
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 5310
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 5311
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 5312
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 5313
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 5314
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 5315
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 5316
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 5317
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 5318
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 5319
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 5320
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 5321
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 5322
   dest = dest + 64 | 0; //@line 5323
   src = src + 64 | 0; //@line 5324
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 5327
   dest = dest + 4 | 0; //@line 5328
   src = src + 4 | 0; //@line 5329
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 5333
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 5335
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 5336
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 5337
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 5338
   dest = dest + 4 | 0; //@line 5339
   src = src + 4 | 0; //@line 5340
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 5345
  dest = dest + 1 | 0; //@line 5346
  src = src + 1 | 0; //@line 5347
 }
 return ret | 0; //@line 5349
}
function ___fdopen($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $19 = 0, $2 = 0, $24 = 0, $29 = 0, $31 = 0, $8 = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 7637
 STACKTOP = STACKTOP + 64 | 0; //@line 7638
 $vararg_buffer12 = sp + 40 | 0; //@line 7639
 $vararg_buffer7 = sp + 24 | 0; //@line 7640
 $vararg_buffer3 = sp + 16 | 0; //@line 7641
 $vararg_buffer = sp; //@line 7642
 $2 = sp + 56 | 0; //@line 7643
 if (!(_strchr(5539, HEAP8[$1 >> 0] | 0) | 0)) {
  HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 7650
  $$0 = 0; //@line 7651
 } else {
  $8 = _malloc(1156) | 0; //@line 7653
  if (!$8) {
   $$0 = 0; //@line 7656
  } else {
   _memset($8 | 0, 0, 124) | 0; //@line 7658
   if (!(_strchr($1, 43) | 0)) {
    HEAP32[$8 >> 2] = (HEAP8[$1 >> 0] | 0) == 114 ? 8 : 4; //@line 7665
   }
   if (_strchr($1, 101) | 0) {
    HEAP32[$vararg_buffer >> 2] = $0; //@line 7670
    HEAP32[$vararg_buffer + 4 >> 2] = 2; //@line 7672
    HEAP32[$vararg_buffer + 8 >> 2] = 1; //@line 7674
    ___syscall221(221, $vararg_buffer | 0) | 0; //@line 7675
   }
   if ((HEAP8[$1 >> 0] | 0) == 97) {
    HEAP32[$vararg_buffer3 >> 2] = $0; //@line 7680
    HEAP32[$vararg_buffer3 + 4 >> 2] = 3; //@line 7682
    $19 = ___syscall221(221, $vararg_buffer3 | 0) | 0; //@line 7683
    if (!($19 & 1024)) {
     HEAP32[$vararg_buffer7 >> 2] = $0; //@line 7688
     HEAP32[$vararg_buffer7 + 4 >> 2] = 4; //@line 7690
     HEAP32[$vararg_buffer7 + 8 >> 2] = $19 | 1024; //@line 7692
     ___syscall221(221, $vararg_buffer7 | 0) | 0; //@line 7693
    }
    $24 = HEAP32[$8 >> 2] | 128; //@line 7696
    HEAP32[$8 >> 2] = $24; //@line 7697
    $31 = $24; //@line 7698
   } else {
    $31 = HEAP32[$8 >> 2] | 0; //@line 7701
   }
   HEAP32[$8 + 60 >> 2] = $0; //@line 7704
   HEAP32[$8 + 44 >> 2] = $8 + 132; //@line 7707
   HEAP32[$8 + 48 >> 2] = 1024; //@line 7709
   $29 = $8 + 75 | 0; //@line 7710
   HEAP8[$29 >> 0] = -1; //@line 7711
   if (!($31 & 8)) {
    HEAP32[$vararg_buffer12 >> 2] = $0; //@line 7716
    HEAP32[$vararg_buffer12 + 4 >> 2] = 21523; //@line 7718
    HEAP32[$vararg_buffer12 + 8 >> 2] = $2; //@line 7720
    if (!(___syscall54(54, $vararg_buffer12 | 0) | 0)) {
     HEAP8[$29 >> 0] = 10; //@line 7724
    }
   }
   HEAP32[$8 + 32 >> 2] = 10; //@line 7728
   HEAP32[$8 + 36 >> 2] = 5; //@line 7730
   HEAP32[$8 + 40 >> 2] = 6; //@line 7732
   HEAP32[$8 + 12 >> 2] = 19; //@line 7734
   if (!(HEAP32[3318] | 0)) {
    HEAP32[$8 + 76 >> 2] = -1; //@line 7739
   }
   ___ofl_add($8) | 0; //@line 7741
   $$0 = $8; //@line 7742
  }
 }
 STACKTOP = sp; //@line 7745
 return $$0 | 0; //@line 7745
}
function __ZN4mbed6Stream4readEPvj($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$016$lcssa = 0, $$01617 = 0, $15 = 0, $16 = 0, $25 = 0, $29 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 2284
 $3 = $1 + $2 | 0; //@line 2285
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 80 >> 2] | 0; //@line 2288
 $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 2289
 FUNCTION_TABLE_vi[$6 & 255]($0); //@line 2290
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 94; //@line 2293
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2295
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 2297
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 2299
  HEAP32[$AsyncCtx + 16 >> 2] = $3; //@line 2301
  HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 2303
  sp = STACKTOP; //@line 2304
  return 0; //@line 2305
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2307
 L4 : do {
  if (!$2) {
   $$016$lcssa = $1; //@line 2311
  } else {
   $$01617 = $1; //@line 2313
   while (1) {
    $15 = HEAP32[(HEAP32[$0 >> 2] | 0) + 72 >> 2] | 0; //@line 2317
    $AsyncCtx2 = _emscripten_alloc_async_context(28, sp) | 0; //@line 2318
    $16 = FUNCTION_TABLE_ii[$15 & 31]($0) | 0; //@line 2319
    if (___async) {
     break;
    }
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2324
    if (($16 | 0) == -1) {
     $$016$lcssa = $$01617; //@line 2327
     break L4;
    }
    $25 = $$01617 + 1 | 0; //@line 2331
    HEAP8[$$01617 >> 0] = $16; //@line 2332
    if (($25 | 0) == ($3 | 0)) {
     $$016$lcssa = $3; //@line 2335
     break L4;
    } else {
     $$01617 = $25; //@line 2338
    }
   }
   HEAP32[$AsyncCtx2 >> 2] = 95; //@line 2341
   HEAP32[$AsyncCtx2 + 4 >> 2] = $1; //@line 2343
   HEAP32[$AsyncCtx2 + 8 >> 2] = $$01617; //@line 2345
   HEAP32[$AsyncCtx2 + 12 >> 2] = $3; //@line 2347
   HEAP32[$AsyncCtx2 + 16 >> 2] = $0; //@line 2349
   HEAP32[$AsyncCtx2 + 20 >> 2] = $0; //@line 2351
   HEAP32[$AsyncCtx2 + 24 >> 2] = $0; //@line 2353
   sp = STACKTOP; //@line 2354
   return 0; //@line 2355
  }
 } while (0);
 $29 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 2360
 $AsyncCtx5 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2361
 FUNCTION_TABLE_vi[$29 & 255]($0); //@line 2362
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 96; //@line 2365
  HEAP32[$AsyncCtx5 + 4 >> 2] = $$016$lcssa; //@line 2367
  HEAP32[$AsyncCtx5 + 8 >> 2] = $1; //@line 2369
  sp = STACKTOP; //@line 2370
  return 0; //@line 2371
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 2373
  return $$016$lcssa - $1 | 0; //@line 2377
 }
 return 0; //@line 2379
}
function __ZN4mbed6Stream5writeEPKvj($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$1 = 0, $14 = 0, $15 = 0, $17 = 0, $18 = 0, $28 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2388
 $3 = $1 + $2 | 0; //@line 2389
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 80 >> 2] | 0; //@line 2392
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 2393
 FUNCTION_TABLE_vi[$6 & 255]($0); //@line 2394
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 97; //@line 2397
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2399
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 2401
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 2403
  HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 2405
  sp = STACKTOP; //@line 2406
  return 0; //@line 2407
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2409
 $$0 = $1; //@line 2410
 while (1) {
  if (($$0 | 0) == ($3 | 0)) {
   $$1 = $3; //@line 2414
   break;
  }
  $14 = HEAP32[(HEAP32[$0 >> 2] | 0) + 68 >> 2] | 0; //@line 2419
  $15 = $$0 + 1 | 0; //@line 2420
  $17 = HEAP8[$$0 >> 0] | 0; //@line 2422
  $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 2423
  $18 = FUNCTION_TABLE_iii[$14 & 7]($0, $17) | 0; //@line 2424
  if (___async) {
   label = 6; //@line 2427
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2430
  if (($18 | 0) == -1) {
   $$1 = $15; //@line 2433
   break;
  } else {
   $$0 = $15; //@line 2436
  }
 }
 if ((label | 0) == 6) {
  HEAP32[$AsyncCtx3 >> 2] = 98; //@line 2440
  HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 2442
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 2444
  HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 2446
  HEAP32[$AsyncCtx3 + 16 >> 2] = $0; //@line 2448
  HEAP32[$AsyncCtx3 + 20 >> 2] = $1; //@line 2450
  HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 2452
  sp = STACKTOP; //@line 2453
  return 0; //@line 2454
 }
 $28 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 2458
 $AsyncCtx7 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2459
 FUNCTION_TABLE_vi[$28 & 255]($0); //@line 2460
 if (___async) {
  HEAP32[$AsyncCtx7 >> 2] = 99; //@line 2463
  HEAP32[$AsyncCtx7 + 4 >> 2] = $$1; //@line 2465
  HEAP32[$AsyncCtx7 + 8 >> 2] = $1; //@line 2467
  sp = STACKTOP; //@line 2468
  return 0; //@line 2469
 } else {
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2471
  return $$1 - $1 | 0; //@line 2475
 }
 return 0; //@line 2477
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13259
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 13265
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 13269
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 13270
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 13271
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 13272
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 184; //@line 13275
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 13277
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 13279
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 13281
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 13283
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 13285
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 13287
    sp = STACKTOP; //@line 13288
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13291
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 13295
    $$0 = $0 + 24 | 0; //@line 13296
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 13298
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 13299
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 13304
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 13310
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 13313
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 185; //@line 13318
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 13320
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 13322
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 13324
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 13326
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 13328
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 13330
    sp = STACKTOP; //@line 13331
    return;
   }
  }
 } while (0);
 return;
}
function __ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb_80($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $25 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4786
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4790
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4792
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4794
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4796
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4798
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4800
 $16 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 4801
 if (($16 | 0) == ($4 | 0)) {
  return;
 }
 $25 = HEAPU16[((128 >>> ($16 & 7) & HEAP8[$6 + ($16 >> 3) >> 0] | 0) == 0 ? $8 : $10) >> 1] | 0; //@line 4816
 $28 = HEAP32[(HEAP32[$12 >> 2] | 0) + 136 >> 2] | 0; //@line 4819
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(32) | 0; //@line 4820
 FUNCTION_TABLE_vii[$28 & 7]($14, $25); //@line 4821
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 60; //@line 4824
  $29 = $ReallocAsyncCtx2 + 4 | 0; //@line 4825
  HEAP32[$29 >> 2] = $16; //@line 4826
  $30 = $ReallocAsyncCtx2 + 8 | 0; //@line 4827
  HEAP32[$30 >> 2] = $4; //@line 4828
  $31 = $ReallocAsyncCtx2 + 12 | 0; //@line 4829
  HEAP32[$31 >> 2] = $6; //@line 4830
  $32 = $ReallocAsyncCtx2 + 16 | 0; //@line 4831
  HEAP32[$32 >> 2] = $8; //@line 4832
  $33 = $ReallocAsyncCtx2 + 20 | 0; //@line 4833
  HEAP32[$33 >> 2] = $10; //@line 4834
  $34 = $ReallocAsyncCtx2 + 24 | 0; //@line 4835
  HEAP32[$34 >> 2] = $12; //@line 4836
  $35 = $ReallocAsyncCtx2 + 28 | 0; //@line 4837
  HEAP32[$35 >> 2] = $14; //@line 4838
  sp = STACKTOP; //@line 4839
  return;
 }
 ___async_unwind = 0; //@line 4842
 HEAP32[$ReallocAsyncCtx2 >> 2] = 60; //@line 4843
 $29 = $ReallocAsyncCtx2 + 4 | 0; //@line 4844
 HEAP32[$29 >> 2] = $16; //@line 4845
 $30 = $ReallocAsyncCtx2 + 8 | 0; //@line 4846
 HEAP32[$30 >> 2] = $4; //@line 4847
 $31 = $ReallocAsyncCtx2 + 12 | 0; //@line 4848
 HEAP32[$31 >> 2] = $6; //@line 4849
 $32 = $ReallocAsyncCtx2 + 16 | 0; //@line 4850
 HEAP32[$32 >> 2] = $8; //@line 4851
 $33 = $ReallocAsyncCtx2 + 20 | 0; //@line 4852
 HEAP32[$33 >> 2] = $10; //@line 4853
 $34 = $ReallocAsyncCtx2 + 24 | 0; //@line 4854
 HEAP32[$34 >> 2] = $12; //@line 4855
 $35 = $ReallocAsyncCtx2 + 28 | 0; //@line 4856
 HEAP32[$35 >> 2] = $14; //@line 4857
 sp = STACKTOP; //@line 4858
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 11927
 STACKTOP = STACKTOP + 64 | 0; //@line 11928
 $3 = sp; //@line 11929
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 11932
 } else {
  if (!$1) {
   $$2 = 0; //@line 11936
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 11938
   $6 = ___dynamic_cast($1, 232, 216, 0) | 0; //@line 11939
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 167; //@line 11942
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 11944
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 11946
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 11948
    sp = STACKTOP; //@line 11949
    STACKTOP = sp; //@line 11950
    return 0; //@line 11950
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11952
   if (!$6) {
    $$2 = 0; //@line 11955
   } else {
    dest = $3 + 4 | 0; //@line 11958
    stop = dest + 52 | 0; //@line 11958
    do {
     HEAP32[dest >> 2] = 0; //@line 11958
     dest = dest + 4 | 0; //@line 11958
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 11959
    HEAP32[$3 + 8 >> 2] = $0; //@line 11961
    HEAP32[$3 + 12 >> 2] = -1; //@line 11963
    HEAP32[$3 + 48 >> 2] = 1; //@line 11965
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 11968
    $18 = HEAP32[$2 >> 2] | 0; //@line 11969
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 11970
    FUNCTION_TABLE_viiii[$17 & 7]($6, $3, $18, 1); //@line 11971
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 168; //@line 11974
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 11976
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 11978
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 11980
     sp = STACKTOP; //@line 11981
     STACKTOP = sp; //@line 11982
     return 0; //@line 11982
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 11984
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 11991
     $$0 = 1; //@line 11992
    } else {
     $$0 = 0; //@line 11994
    }
    $$2 = $$0; //@line 11996
   }
  }
 }
 STACKTOP = sp; //@line 12000
 return $$2 | 0; //@line 12000
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 11084
 STACKTOP = STACKTOP + 128 | 0; //@line 11085
 $4 = sp + 124 | 0; //@line 11086
 $5 = sp; //@line 11087
 dest = $5; //@line 11088
 src = 1524; //@line 11088
 stop = dest + 124 | 0; //@line 11088
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 11088
  dest = dest + 4 | 0; //@line 11088
  src = src + 4 | 0; //@line 11088
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 11094
   $$015 = 1; //@line 11094
   label = 4; //@line 11095
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 11098
   $$0 = -1; //@line 11099
  }
 } else {
  $$014 = $0; //@line 11102
  $$015 = $1; //@line 11102
  label = 4; //@line 11103
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 11107
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 11109
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 11111
  $14 = $5 + 20 | 0; //@line 11112
  HEAP32[$14 >> 2] = $$014; //@line 11113
  HEAP32[$5 + 44 >> 2] = $$014; //@line 11115
  $16 = $$014 + $$$015 | 0; //@line 11116
  $17 = $5 + 16 | 0; //@line 11117
  HEAP32[$17 >> 2] = $16; //@line 11118
  HEAP32[$5 + 28 >> 2] = $16; //@line 11120
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 11121
  $19 = _vfprintf($5, $2, $3) | 0; //@line 11122
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 151; //@line 11125
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 11127
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 11129
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 11131
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 11133
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 11135
   sp = STACKTOP; //@line 11136
   STACKTOP = sp; //@line 11137
   return 0; //@line 11137
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11139
  if (!$$$015) {
   $$0 = $19; //@line 11142
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 11144
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 11149
   $$0 = $19; //@line 11150
  }
 }
 STACKTOP = sp; //@line 11153
 return $$0 | 0; //@line 11153
}
function __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_43($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $17 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1726
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1728
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1730
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1732
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1734
 HEAP32[$2 >> 2] = 328; //@line 1735
 HEAP32[$2 + 4 >> 2] = 488; //@line 1737
 $10 = $2 + 4172 | 0; //@line 1738
 HEAP32[$10 >> 2] = $4; //@line 1739
 $11 = $2 + 4176 | 0; //@line 1740
 HEAP32[$11 >> 2] = $6; //@line 1741
 $12 = $2 + 4180 | 0; //@line 1742
 HEAP32[$12 >> 2] = $8; //@line 1743
 _emscripten_asm_const_iiii(1, $4 | 0, $6 | 0, $8 | 0) | 0; //@line 1744
 HEAP32[$2 + 56 >> 2] = 1; //@line 1746
 HEAP32[$2 + 52 >> 2] = 0; //@line 1748
 HEAP32[$2 + 60 >> 2] = 0; //@line 1750
 $17 = $2 + 68 | 0; //@line 1751
 _memset($17 | 0, 0, 4096) | 0; //@line 1752
 $20 = HEAP32[(HEAP32[$2 >> 2] | 0) + 108 >> 2] | 0; //@line 1755
 $ReallocAsyncCtx = _emscripten_realloc_async_context(24) | 0; //@line 1756
 FUNCTION_TABLE_viii[$20 & 3]($2, 0, 0); //@line 1757
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 47; //@line 1760
  $21 = $ReallocAsyncCtx + 4 | 0; //@line 1761
  HEAP32[$21 >> 2] = $2; //@line 1762
  $22 = $ReallocAsyncCtx + 8 | 0; //@line 1763
  HEAP32[$22 >> 2] = $10; //@line 1764
  $23 = $ReallocAsyncCtx + 12 | 0; //@line 1765
  HEAP32[$23 >> 2] = $11; //@line 1766
  $24 = $ReallocAsyncCtx + 16 | 0; //@line 1767
  HEAP32[$24 >> 2] = $12; //@line 1768
  $25 = $ReallocAsyncCtx + 20 | 0; //@line 1769
  HEAP32[$25 >> 2] = $17; //@line 1770
  sp = STACKTOP; //@line 1771
  return;
 }
 ___async_unwind = 0; //@line 1774
 HEAP32[$ReallocAsyncCtx >> 2] = 47; //@line 1775
 $21 = $ReallocAsyncCtx + 4 | 0; //@line 1776
 HEAP32[$21 >> 2] = $2; //@line 1777
 $22 = $ReallocAsyncCtx + 8 | 0; //@line 1778
 HEAP32[$22 >> 2] = $10; //@line 1779
 $23 = $ReallocAsyncCtx + 12 | 0; //@line 1780
 HEAP32[$23 >> 2] = $11; //@line 1781
 $24 = $ReallocAsyncCtx + 16 | 0; //@line 1782
 HEAP32[$24 >> 2] = $12; //@line 1783
 $25 = $ReallocAsyncCtx + 20 | 0; //@line 1784
 HEAP32[$25 >> 2] = $17; //@line 1785
 sp = STACKTOP; //@line 1786
 return;
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11510
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 11515
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 11520
  } else {
   $20 = $0 & 255; //@line 11522
   $21 = $0 & 255; //@line 11523
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 11529
   } else {
    $26 = $1 + 20 | 0; //@line 11531
    $27 = HEAP32[$26 >> 2] | 0; //@line 11532
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 11538
     HEAP8[$27 >> 0] = $20; //@line 11539
     $34 = $21; //@line 11540
    } else {
     label = 12; //@line 11542
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 11547
     $32 = ___overflow($1, $0) | 0; //@line 11548
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 159; //@line 11551
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 11553
      sp = STACKTOP; //@line 11554
      return 0; //@line 11555
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 11557
      $34 = $32; //@line 11558
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 11563
   $$0 = $34; //@line 11564
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 11569
   $8 = $0 & 255; //@line 11570
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 11576
    $14 = HEAP32[$13 >> 2] | 0; //@line 11577
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 11583
     HEAP8[$14 >> 0] = $7; //@line 11584
     $$0 = $8; //@line 11585
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 11589
   $19 = ___overflow($1, $0) | 0; //@line 11590
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 158; //@line 11593
    sp = STACKTOP; //@line 11594
    return 0; //@line 11595
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11597
    $$0 = $19; //@line 11598
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 11603
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 7415
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 7418
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 7421
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 7424
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 7430
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 7439
     $24 = $13 >>> 2; //@line 7440
     $$090 = 0; //@line 7441
     $$094 = $7; //@line 7441
     while (1) {
      $25 = $$094 >>> 1; //@line 7443
      $26 = $$090 + $25 | 0; //@line 7444
      $27 = $26 << 1; //@line 7445
      $28 = $27 + $23 | 0; //@line 7446
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 7449
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 7453
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 7459
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 7467
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 7471
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 7477
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 7482
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 7485
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 7485
      }
     }
     $46 = $27 + $24 | 0; //@line 7488
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 7491
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 7495
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 7507
     } else {
      $$4 = 0; //@line 7509
     }
    } else {
     $$4 = 0; //@line 7512
    }
   } else {
    $$4 = 0; //@line 7515
   }
  } else {
   $$4 = 0; //@line 7518
  }
 } while (0);
 return $$4 | 0; //@line 7521
}
function __ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb($0) {
 $0 = $0 | 0;
 var $11 = 0, $12 = 0, $22 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4710
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4716
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4718
 $9 = Math_imul(HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 4719
 if (($9 | 0) <= 0) {
  return;
 }
 $11 = $6 + 28 | 0; //@line 4724
 $12 = $6 + 30 | 0; //@line 4725
 $22 = HEAPU16[((128 >>> 0 & HEAP8[$8 + 0 >> 0] | 0) == 0 ? $12 : $11) >> 1] | 0; //@line 4736
 $25 = HEAP32[(HEAP32[$6 >> 2] | 0) + 136 >> 2] | 0; //@line 4739
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(32) | 0; //@line 4740
 FUNCTION_TABLE_vii[$25 & 7]($6, $22); //@line 4741
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 60; //@line 4744
  $26 = $ReallocAsyncCtx2 + 4 | 0; //@line 4745
  HEAP32[$26 >> 2] = 0; //@line 4746
  $27 = $ReallocAsyncCtx2 + 8 | 0; //@line 4747
  HEAP32[$27 >> 2] = $9; //@line 4748
  $28 = $ReallocAsyncCtx2 + 12 | 0; //@line 4749
  HEAP32[$28 >> 2] = $8; //@line 4750
  $29 = $ReallocAsyncCtx2 + 16 | 0; //@line 4751
  HEAP32[$29 >> 2] = $12; //@line 4752
  $30 = $ReallocAsyncCtx2 + 20 | 0; //@line 4753
  HEAP32[$30 >> 2] = $11; //@line 4754
  $31 = $ReallocAsyncCtx2 + 24 | 0; //@line 4755
  HEAP32[$31 >> 2] = $6; //@line 4756
  $32 = $ReallocAsyncCtx2 + 28 | 0; //@line 4757
  HEAP32[$32 >> 2] = $6; //@line 4758
  sp = STACKTOP; //@line 4759
  return;
 }
 ___async_unwind = 0; //@line 4762
 HEAP32[$ReallocAsyncCtx2 >> 2] = 60; //@line 4763
 $26 = $ReallocAsyncCtx2 + 4 | 0; //@line 4764
 HEAP32[$26 >> 2] = 0; //@line 4765
 $27 = $ReallocAsyncCtx2 + 8 | 0; //@line 4766
 HEAP32[$27 >> 2] = $9; //@line 4767
 $28 = $ReallocAsyncCtx2 + 12 | 0; //@line 4768
 HEAP32[$28 >> 2] = $8; //@line 4769
 $29 = $ReallocAsyncCtx2 + 16 | 0; //@line 4770
 HEAP32[$29 >> 2] = $12; //@line 4771
 $30 = $ReallocAsyncCtx2 + 20 | 0; //@line 4772
 HEAP32[$30 >> 2] = $11; //@line 4773
 $31 = $ReallocAsyncCtx2 + 24 | 0; //@line 4774
 HEAP32[$31 >> 2] = $6; //@line 4775
 $32 = $ReallocAsyncCtx2 + 28 | 0; //@line 4776
 HEAP32[$32 >> 2] = $6; //@line 4777
 sp = STACKTOP; //@line 4778
 return;
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8118
 $1 = $0 + 20 | 0; //@line 8119
 $3 = $0 + 28 | 0; //@line 8121
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 8127
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8128
   FUNCTION_TABLE_iiii[$7 & 15]($0, 0, 0) | 0; //@line 8129
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 148; //@line 8132
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 8134
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 8136
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 8138
    sp = STACKTOP; //@line 8139
    return 0; //@line 8140
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 8142
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 8146
     break;
    } else {
     label = 5; //@line 8149
     break;
    }
   }
  } else {
   label = 5; //@line 8154
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 8158
  $14 = HEAP32[$13 >> 2] | 0; //@line 8159
  $15 = $0 + 8 | 0; //@line 8160
  $16 = HEAP32[$15 >> 2] | 0; //@line 8161
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 8169
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 8170
    FUNCTION_TABLE_iiii[$22 & 15]($0, $14 - $16 | 0, 1) | 0; //@line 8171
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 149; //@line 8174
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 8176
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 8178
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 8180
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 8182
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 8184
     sp = STACKTOP; //@line 8185
     return 0; //@line 8186
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8188
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 8194
  HEAP32[$3 >> 2] = 0; //@line 8195
  HEAP32[$1 >> 2] = 0; //@line 8196
  HEAP32[$15 >> 2] = 0; //@line 8197
  HEAP32[$13 >> 2] = 0; //@line 8198
  $$0 = 0; //@line 8199
 }
 return $$0 | 0; //@line 8201
}
function __ZN4mbed8FileBaseD0Ev($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $1 = 0, $12 = 0, $17 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 1940
 HEAP32[$0 >> 2] = 824; //@line 1941
 $1 = HEAP32[2137] | 0; //@line 1942
 do {
  if (!$1) {
   HEAP32[2137] = 8552; //@line 1946
  } else {
   if (($1 | 0) != 8552) {
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1950
    _mbed_assert_internal(5291, 5311, 93); //@line 1951
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 82; //@line 1954
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1956
     sp = STACKTOP; //@line 1957
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1960
     break;
    }
   }
  }
 } while (0);
 do {
  if (HEAP32[$0 + 8 >> 2] | 0) {
   $8 = HEAP32[2136] | 0; //@line 1971
   if (($8 | 0) == ($0 | 0)) {
    HEAP32[2136] = HEAP32[$0 + 4 >> 2]; //@line 1976
    break;
   } else {
    $$0$i = $8; //@line 1979
   }
   do {
    $12 = $$0$i + 4 | 0; //@line 1982
    $$0$i = HEAP32[$12 >> 2] | 0; //@line 1983
   } while (($$0$i | 0) != ($0 | 0));
   HEAP32[$12 >> 2] = HEAP32[$0 + 4 >> 2]; //@line 1993
  }
 } while (0);
 $17 = HEAP32[2137] | 0; //@line 1996
 do {
  if (!$17) {
   HEAP32[2137] = 8552; //@line 2000
  } else {
   if (($17 | 0) != 8552) {
    $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2004
    _mbed_assert_internal(5291, 5311, 93); //@line 2005
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 83; //@line 2008
     HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2010
     sp = STACKTOP; //@line 2011
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx | 0); //@line 2014
     break;
    }
   }
  }
 } while (0);
 if (HEAP32[$0 + 12 >> 2] | 0) {
  __ZdlPv($0); //@line 2024
  return;
 }
 $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2028
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($0 + -4 | 0); //@line 2029
 if (___async) {
  HEAP32[$AsyncCtx7 >> 2] = 84; //@line 2032
  HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 2034
  sp = STACKTOP; //@line 2035
  return;
 }
 _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2038
 __ZdlPv($0); //@line 2039
 return;
}
function __ZN4mbed6Stream4putcEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $15 = 0, $16 = 0, $21 = 0, $4 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 2628
 $4 = HEAP32[(HEAP32[$0 >> 2] | 0) + 80 >> 2] | 0; //@line 2631
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 2632
 FUNCTION_TABLE_vi[$4 & 255]($0); //@line 2633
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 104; //@line 2636
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2638
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 2640
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 2642
  sp = STACKTOP; //@line 2643
  return 0; //@line 2644
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2646
 $9 = HEAP32[$0 + 20 >> 2] | 0; //@line 2648
 $AsyncCtx9 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2649
 _fflush($9) | 0; //@line 2650
 if (___async) {
  HEAP32[$AsyncCtx9 >> 2] = 105; //@line 2653
  HEAP32[$AsyncCtx9 + 4 >> 2] = $0; //@line 2655
  HEAP32[$AsyncCtx9 + 8 >> 2] = $1; //@line 2657
  HEAP32[$AsyncCtx9 + 12 >> 2] = $0; //@line 2659
  sp = STACKTOP; //@line 2660
  return 0; //@line 2661
 }
 _emscripten_free_async_context($AsyncCtx9 | 0); //@line 2663
 $15 = HEAP32[(HEAP32[$0 >> 2] | 0) + 68 >> 2] | 0; //@line 2666
 $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2667
 $16 = FUNCTION_TABLE_iii[$15 & 7]($0, $1) | 0; //@line 2668
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 106; //@line 2671
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 2673
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 2675
  sp = STACKTOP; //@line 2676
  return 0; //@line 2677
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2679
 $21 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 2682
 $AsyncCtx5 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2683
 FUNCTION_TABLE_vi[$21 & 255]($0); //@line 2684
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 107; //@line 2687
  HEAP32[$AsyncCtx5 + 4 >> 2] = $16; //@line 2689
  sp = STACKTOP; //@line 2690
  return 0; //@line 2691
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 2693
  return $16 | 0; //@line 2694
 }
 return 0; //@line 2696
}
function __ZN15GraphicsDisplay7blitbitEiiiiPKc($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$019 = 0, $13 = 0, $15 = 0, $16 = 0, $26 = 0, $29 = 0, $37 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1204
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 1207
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 1208
 FUNCTION_TABLE_viiiii[$8 & 7]($0, $1, $2, $3, $4); //@line 1209
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 59; //@line 1212
  HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 1214
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 1216
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 1218
  HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 1220
  sp = STACKTOP; //@line 1221
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1224
 $13 = Math_imul($4, $3) | 0; //@line 1225
 if (($13 | 0) <= 0) {
  return;
 }
 $15 = $0 + 28 | 0; //@line 1230
 $16 = $0 + 30 | 0; //@line 1231
 $$019 = 0; //@line 1232
 while (1) {
  $26 = HEAPU16[((128 >>> ($$019 & 7) & HEAP8[$5 + ($$019 >> 3) >> 0] | 0) == 0 ? $16 : $15) >> 1] | 0; //@line 1244
  $29 = HEAP32[(HEAP32[$0 >> 2] | 0) + 136 >> 2] | 0; //@line 1247
  $AsyncCtx3 = _emscripten_alloc_async_context(32, sp) | 0; //@line 1248
  FUNCTION_TABLE_vii[$29 & 7]($0, $26); //@line 1249
  if (___async) {
   label = 7; //@line 1252
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1255
  $37 = $$019 + 1 | 0; //@line 1256
  if (($37 | 0) == ($13 | 0)) {
   label = 5; //@line 1259
   break;
  } else {
   $$019 = $37; //@line 1262
  }
 }
 if ((label | 0) == 5) {
  return;
 } else if ((label | 0) == 7) {
  HEAP32[$AsyncCtx3 >> 2] = 60; //@line 1269
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$019; //@line 1271
  HEAP32[$AsyncCtx3 + 8 >> 2] = $13; //@line 1273
  HEAP32[$AsyncCtx3 + 12 >> 2] = $5; //@line 1275
  HEAP32[$AsyncCtx3 + 16 >> 2] = $16; //@line 1277
  HEAP32[$AsyncCtx3 + 20 >> 2] = $15; //@line 1279
  HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 1281
  HEAP32[$AsyncCtx3 + 28 >> 2] = $0; //@line 1283
  sp = STACKTOP; //@line 1284
  return;
 }
}
function _fclose($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $15 = 0, $21 = 0, $25 = 0, $27 = 0, $28 = 0, $33 = 0, $35 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 7884
 if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
  $25 = ___lockfile($0) | 0; //@line 7890
 } else {
  $25 = 0; //@line 7892
 }
 ___unlist_locked_file($0); //@line 7894
 $7 = (HEAP32[$0 >> 2] & 1 | 0) != 0; //@line 7897
 if (!$7) {
  $8 = ___ofl_lock() | 0; //@line 7899
  $10 = HEAP32[$0 + 52 >> 2] | 0; //@line 7901
  $$pre = $0 + 56 | 0; //@line 7904
  if ($10 | 0) {
   HEAP32[$10 + 56 >> 2] = HEAP32[$$pre >> 2]; //@line 7908
  }
  $15 = HEAP32[$$pre >> 2] | 0; //@line 7910
  if ($15 | 0) {
   HEAP32[$15 + 52 >> 2] = $10; //@line 7915
  }
  if ((HEAP32[$8 >> 2] | 0) == ($0 | 0)) {
   HEAP32[$8 >> 2] = $15; //@line 7920
  }
  ___ofl_unlock(); //@line 7922
 }
 $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 7924
 $21 = _fflush($0) | 0; //@line 7925
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 142; //@line 7928
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 7930
  HEAP8[$AsyncCtx3 + 8 >> 0] = $7 & 1; //@line 7933
  HEAP32[$AsyncCtx3 + 12 >> 2] = $25; //@line 7935
  sp = STACKTOP; //@line 7936
  return 0; //@line 7937
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7939
 $27 = HEAP32[$0 + 12 >> 2] | 0; //@line 7941
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 7942
 $28 = FUNCTION_TABLE_ii[$27 & 31]($0) | 0; //@line 7943
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 143; //@line 7946
  HEAP32[$AsyncCtx + 4 >> 2] = $21; //@line 7948
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 7950
  HEAP8[$AsyncCtx + 12 >> 0] = $7 & 1; //@line 7953
  HEAP32[$AsyncCtx + 16 >> 2] = $25; //@line 7955
  sp = STACKTOP; //@line 7956
  return 0; //@line 7957
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 7959
 $33 = $28 | $21; //@line 7960
 $35 = HEAP32[$0 + 92 >> 2] | 0; //@line 7962
 if ($35 | 0) {
  _free($35); //@line 7965
 }
 if ($7) {
  if ($25 | 0) {
   ___unlockfile($0); //@line 7970
  }
 } else {
  _free($0); //@line 7973
 }
 return $33 | 0; //@line 7975
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
  HEAP32[$0 + 48 >> 2] = 1942; //@line 804
  _emscripten_asm_const_iiiii(0, HEAP32[$12 >> 2] | 0, HEAP32[$13 >> 2] | 0, HEAP32[$14 >> 2] | 0, $19 | 0) | 0; //@line 808
  return;
 }
}
function __ZN4mbed8FileBaseD2Ev($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $12 = 0, $17 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 1838
 HEAP32[$0 >> 2] = 824; //@line 1839
 $1 = HEAP32[2137] | 0; //@line 1840
 do {
  if (!$1) {
   HEAP32[2137] = 8552; //@line 1844
  } else {
   if (($1 | 0) != 8552) {
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1848
    _mbed_assert_internal(5291, 5311, 93); //@line 1849
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 79; //@line 1852
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1854
     sp = STACKTOP; //@line 1855
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1858
     break;
    }
   }
  }
 } while (0);
 do {
  if (HEAP32[$0 + 8 >> 2] | 0) {
   $8 = HEAP32[2136] | 0; //@line 1869
   if (($8 | 0) == ($0 | 0)) {
    HEAP32[2136] = HEAP32[$0 + 4 >> 2]; //@line 1874
    break;
   } else {
    $$0 = $8; //@line 1877
   }
   do {
    $12 = $$0 + 4 | 0; //@line 1880
    $$0 = HEAP32[$12 >> 2] | 0; //@line 1881
   } while (($$0 | 0) != ($0 | 0));
   HEAP32[$12 >> 2] = HEAP32[$0 + 4 >> 2]; //@line 1891
  }
 } while (0);
 $17 = HEAP32[2137] | 0; //@line 1894
 do {
  if (!$17) {
   HEAP32[2137] = 8552; //@line 1898
  } else {
   if (($17 | 0) != 8552) {
    $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1902
    _mbed_assert_internal(5291, 5311, 93); //@line 1903
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 80; //@line 1906
     HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1908
     sp = STACKTOP; //@line 1909
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx | 0); //@line 1912
     break;
    }
   }
  }
 } while (0);
 if (HEAP32[$0 + 12 >> 2] | 0) {
  return;
 }
 $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1925
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($0 + -4 | 0); //@line 1926
 if (___async) {
  HEAP32[$AsyncCtx7 >> 2] = 81; //@line 1929
  sp = STACKTOP; //@line 1930
  return;
 }
 _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1933
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
 $2 = $1 & 255; //@line 7784
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 7790
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 7796
   } else {
    $7 = $1 & 255; //@line 7798
    $$03039 = $0; //@line 7799
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 7801
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 7806
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 7809
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 7814
      break;
     } else {
      $$03039 = $13; //@line 7817
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 7821
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 7822
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 7830
     $25 = $18; //@line 7830
     while (1) {
      $24 = $25 ^ $17; //@line 7832
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 7839
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 7842
      $25 = HEAP32[$31 >> 2] | 0; //@line 7843
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 7852
       break;
      } else {
       $$02936 = $31; //@line 7850
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 7857
    }
   } while (0);
   $38 = $1 & 255; //@line 7860
   $$1 = $$029$lcssa; //@line 7861
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 7863
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 7869
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 7872
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 7877
}
function _main() {
 var $4 = 0.0, $5 = 0.0, $AsyncCtx = 0, $AsyncCtx6 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, sp = 0;
 sp = STACKTOP; //@line 3468
 STACKTOP = STACKTOP + 16 | 0; //@line 3469
 $vararg_buffer1 = sp + 8 | 0; //@line 3470
 $vararg_buffer = sp; //@line 3471
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 3472
 _puts(5403) | 0; //@line 3473
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 139; //@line 3476
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 3478
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 3480
  HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer1; //@line 3482
  HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer1; //@line 3484
  sp = STACKTOP; //@line 3485
  STACKTOP = sp; //@line 3486
  return 0; //@line 3486
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3488
 while (1) {
  __ZN6C128323clsEv(8564); //@line 3490
  $4 = +__ZN5Sht3115readTemperatureEv(13361); //@line 3491
  $5 = +__ZN5Sht3112readHumidityEv(13361); //@line 3492
  __ZN6C128326locateEii(8564, 3, 3); //@line 3493
  HEAPF64[$vararg_buffer >> 3] = $4; //@line 3495
  __ZN4mbed6Stream6printfEPKcz(8564, 5467, $vararg_buffer) | 0; //@line 3496
  __ZN6C128326locateEii(8564, 3, 13); //@line 3497
  HEAPF64[$vararg_buffer1 >> 3] = $5; //@line 3499
  __ZN4mbed6Stream6printfEPKcz(8564, 5487, $vararg_buffer1) | 0; //@line 3500
  _emscripten_asm_const_iii(6, HEAP32[3187] | 0, $4 > 25.0 | 0) | 0; //@line 3504
  $AsyncCtx6 = _emscripten_alloc_async_context(20, sp) | 0; //@line 3505
  _wait(.5); //@line 3506
  if (___async) {
   break;
  }
  _emscripten_free_async_context($AsyncCtx6 | 0); //@line 3511
 }
 HEAP32[$AsyncCtx6 >> 2] = 140; //@line 3513
 HEAP32[$AsyncCtx6 + 4 >> 2] = $vararg_buffer; //@line 3515
 HEAP32[$AsyncCtx6 + 8 >> 2] = $vararg_buffer; //@line 3517
 HEAP32[$AsyncCtx6 + 12 >> 2] = $vararg_buffer1; //@line 3519
 HEAP32[$AsyncCtx6 + 16 >> 2] = $vararg_buffer1; //@line 3521
 sp = STACKTOP; //@line 3522
 STACKTOP = sp; //@line 3523
 return 0; //@line 3523
}
function _main__async_cb_1($0) {
 $0 = $0 | 0;
 var $10 = 0.0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $9 = 0.0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13637
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13639
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13641
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13643
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13645
 __ZN6C128323clsEv(8564); //@line 13646
 $9 = +__ZN5Sht3115readTemperatureEv(13361); //@line 13647
 $10 = +__ZN5Sht3112readHumidityEv(13361); //@line 13648
 __ZN6C128326locateEii(8564, 3, 3); //@line 13649
 HEAPF64[$2 >> 3] = $9; //@line 13651
 __ZN4mbed6Stream6printfEPKcz(8564, 5467, $2) | 0; //@line 13652
 __ZN6C128326locateEii(8564, 3, 13); //@line 13653
 HEAPF64[$6 >> 3] = $10; //@line 13655
 __ZN4mbed6Stream6printfEPKcz(8564, 5487, $6) | 0; //@line 13656
 _emscripten_asm_const_iii(6, HEAP32[3187] | 0, $9 > 25.0 | 0) | 0; //@line 13660
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(20) | 0; //@line 13661
 _wait(.5); //@line 13662
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 140; //@line 13665
  $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 13666
  HEAP32[$16 >> 2] = $2; //@line 13667
  $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 13668
  HEAP32[$17 >> 2] = $4; //@line 13669
  $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 13670
  HEAP32[$18 >> 2] = $6; //@line 13671
  $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 13672
  HEAP32[$19 >> 2] = $8; //@line 13673
  sp = STACKTOP; //@line 13674
  return;
 }
 ___async_unwind = 0; //@line 13677
 HEAP32[$ReallocAsyncCtx2 >> 2] = 140; //@line 13678
 $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 13679
 HEAP32[$16 >> 2] = $2; //@line 13680
 $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 13681
 HEAP32[$17 >> 2] = $4; //@line 13682
 $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 13683
 HEAP32[$18 >> 2] = $6; //@line 13684
 $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 13685
 HEAP32[$19 >> 2] = $8; //@line 13686
 sp = STACKTOP; //@line 13687
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0.0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $9 = 0.0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13580
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13582
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13584
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13586
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13588
 __ZN6C128323clsEv(8564); //@line 13589
 $9 = +__ZN5Sht3115readTemperatureEv(13361); //@line 13590
 $10 = +__ZN5Sht3112readHumidityEv(13361); //@line 13591
 __ZN6C128326locateEii(8564, 3, 3); //@line 13592
 HEAPF64[$2 >> 3] = $9; //@line 13594
 __ZN4mbed6Stream6printfEPKcz(8564, 5467, $2) | 0; //@line 13595
 __ZN6C128326locateEii(8564, 3, 13); //@line 13596
 HEAPF64[$6 >> 3] = $10; //@line 13598
 __ZN4mbed6Stream6printfEPKcz(8564, 5487, $6) | 0; //@line 13599
 _emscripten_asm_const_iii(6, HEAP32[3187] | 0, $9 > 25.0 | 0) | 0; //@line 13603
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(20) | 0; //@line 13604
 _wait(.5); //@line 13605
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 140; //@line 13608
  $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 13609
  HEAP32[$16 >> 2] = $2; //@line 13610
  $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 13611
  HEAP32[$17 >> 2] = $4; //@line 13612
  $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 13613
  HEAP32[$18 >> 2] = $6; //@line 13614
  $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 13615
  HEAP32[$19 >> 2] = $8; //@line 13616
  sp = STACKTOP; //@line 13617
  return;
 }
 ___async_unwind = 0; //@line 13620
 HEAP32[$ReallocAsyncCtx2 >> 2] = 140; //@line 13621
 $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 13622
 HEAP32[$16 >> 2] = $2; //@line 13623
 $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 13624
 HEAP32[$17 >> 2] = $4; //@line 13625
 $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 13626
 HEAP32[$18 >> 2] = $6; //@line 13627
 $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 13628
 HEAP32[$19 >> 2] = $8; //@line 13629
 sp = STACKTOP; //@line 13630
 return;
}
function __ZN4mbed8FileBaseD0Ev__async_cb_28($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $10 = 0, $15 = 0, $18 = 0, $2 = 0, $23 = 0, $6 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 903
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 905
 do {
  if (HEAP32[$2 + 8 >> 2] | 0) {
   $6 = HEAP32[2136] | 0; //@line 911
   if (($6 | 0) == ($2 | 0)) {
    HEAP32[2136] = HEAP32[$2 + 4 >> 2]; //@line 916
    break;
   } else {
    $$0$i = $6; //@line 919
   }
   do {
    $10 = $$0$i + 4 | 0; //@line 922
    $$0$i = HEAP32[$10 >> 2] | 0; //@line 923
   } while (($$0$i | 0) != ($2 | 0));
   HEAP32[$10 >> 2] = HEAP32[$2 + 4 >> 2]; //@line 933
  }
 } while (0);
 $15 = HEAP32[2137] | 0; //@line 936
 if (!$15) {
  HEAP32[2137] = 8552; //@line 939
 } else {
  if (($15 | 0) != 8552) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 943
   _mbed_assert_internal(5291, 5311, 93); //@line 944
   if (___async) {
    HEAP32[$ReallocAsyncCtx >> 2] = 83; //@line 947
    $18 = $ReallocAsyncCtx + 4 | 0; //@line 948
    HEAP32[$18 >> 2] = $2; //@line 949
    sp = STACKTOP; //@line 950
    return;
   }
   ___async_unwind = 0; //@line 953
   HEAP32[$ReallocAsyncCtx >> 2] = 83; //@line 954
   $18 = $ReallocAsyncCtx + 4 | 0; //@line 955
   HEAP32[$18 >> 2] = $2; //@line 956
   sp = STACKTOP; //@line 957
   return;
  }
 }
 if (HEAP32[$2 + 12 >> 2] | 0) {
  __ZdlPv($2); //@line 965
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 969
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 970
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 84; //@line 973
  $23 = $ReallocAsyncCtx3 + 4 | 0; //@line 974
  HEAP32[$23 >> 2] = $2; //@line 975
  sp = STACKTOP; //@line 976
  return;
 }
 ___async_unwind = 0; //@line 979
 HEAP32[$ReallocAsyncCtx3 >> 2] = 84; //@line 980
 $23 = $ReallocAsyncCtx3 + 4 | 0; //@line 981
 HEAP32[$23 >> 2] = $2; //@line 982
 sp = STACKTOP; //@line 983
 return;
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 7306
 $4 = HEAP32[$3 >> 2] | 0; //@line 7307
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 7314
   label = 5; //@line 7315
  } else {
   $$1 = 0; //@line 7317
  }
 } else {
  $12 = $4; //@line 7321
  label = 5; //@line 7322
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 7326
   $10 = HEAP32[$9 >> 2] | 0; //@line 7327
   $14 = $10; //@line 7330
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 15]($2, $0, $1) | 0; //@line 7335
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 7343
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 7347
       $$141 = $0; //@line 7347
       $$143 = $1; //@line 7347
       $31 = $14; //@line 7347
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 7350
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 7357
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 15]($2, $0, $$038) | 0; //@line 7362
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 7365
      break L5;
     }
     $$139 = $$038; //@line 7371
     $$141 = $0 + $$038 | 0; //@line 7371
     $$143 = $1 - $$038 | 0; //@line 7371
     $31 = HEAP32[$9 >> 2] | 0; //@line 7371
    } else {
     $$139 = 0; //@line 7373
     $$141 = $0; //@line 7373
     $$143 = $1; //@line 7373
     $31 = $14; //@line 7373
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 7376
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 7379
   $$1 = $$139 + $$143 | 0; //@line 7381
  }
 } while (0);
 return $$1 | 0; //@line 7384
}
function __ZN15GraphicsDisplay4blitEiiiiPKi($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$011 = 0, $13 = 0, $17 = 0, $19 = 0, $25 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1125
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 1128
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 1129
 FUNCTION_TABLE_viiiii[$8 & 7]($0, $1, $2, $3, $4); //@line 1130
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 57; //@line 1133
  HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 1135
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 1137
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 1139
  HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 1141
  sp = STACKTOP; //@line 1142
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1145
 $13 = Math_imul($4, $3) | 0; //@line 1146
 if (($13 | 0) <= 0) {
  return;
 }
 $$011 = 0; //@line 1151
 while (1) {
  $17 = HEAP32[(HEAP32[$0 >> 2] | 0) + 136 >> 2] | 0; //@line 1155
  $19 = HEAP32[$5 + ($$011 << 2) >> 2] | 0; //@line 1157
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1158
  FUNCTION_TABLE_vii[$17 & 7]($0, $19); //@line 1159
  if (___async) {
   label = 7; //@line 1162
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1165
  $25 = $$011 + 1 | 0; //@line 1166
  if (($25 | 0) == ($13 | 0)) {
   label = 5; //@line 1169
   break;
  } else {
   $$011 = $25; //@line 1172
  }
 }
 if ((label | 0) == 5) {
  return;
 } else if ((label | 0) == 7) {
  HEAP32[$AsyncCtx3 >> 2] = 58; //@line 1179
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$011; //@line 1181
  HEAP32[$AsyncCtx3 + 8 >> 2] = $13; //@line 1183
  HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 1185
  HEAP32[$AsyncCtx3 + 16 >> 2] = $5; //@line 1187
  HEAP32[$AsyncCtx3 + 20 >> 2] = $0; //@line 1189
  sp = STACKTOP; //@line 1190
  return;
 }
}
function __ZN15GraphicsDisplay4blitEiiiiPKi__async_cb_53($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2383
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2387
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2389
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2391
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2393
 $15 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 2394
 if (($15 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 136 >> 2] | 0; //@line 2401
 $16 = HEAP32[$8 + ($15 << 2) >> 2] | 0; //@line 2403
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 2404
 FUNCTION_TABLE_vii[$13 & 7]($10, $16); //@line 2405
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 58; //@line 2408
  $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 2409
  HEAP32[$17 >> 2] = $15; //@line 2410
  $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 2411
  HEAP32[$18 >> 2] = $4; //@line 2412
  $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 2413
  HEAP32[$19 >> 2] = $6; //@line 2414
  $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 2415
  HEAP32[$20 >> 2] = $8; //@line 2416
  $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 2417
  HEAP32[$21 >> 2] = $10; //@line 2418
  sp = STACKTOP; //@line 2419
  return;
 }
 ___async_unwind = 0; //@line 2422
 HEAP32[$ReallocAsyncCtx2 >> 2] = 58; //@line 2423
 $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 2424
 HEAP32[$17 >> 2] = $15; //@line 2425
 $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 2426
 HEAP32[$18 >> 2] = $4; //@line 2427
 $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 2428
 HEAP32[$19 >> 2] = $6; //@line 2429
 $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 2430
 HEAP32[$20 >> 2] = $8; //@line 2431
 $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 2432
 HEAP32[$21 >> 2] = $10; //@line 2433
 sp = STACKTOP; //@line 2434
 return;
}
function __ZN4mbed6StreamC2EPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 2568
 STACKTOP = STACKTOP + 16 | 0; //@line 2569
 $vararg_buffer = sp; //@line 2570
 HEAP32[$0 >> 2] = 840; //@line 2571
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 2573
 __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE($0 + 4 | 0, $1, 0); //@line 2574
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 102; //@line 2577
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2579
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 2581
  HEAP32[$AsyncCtx3 + 12 >> 2] = $vararg_buffer; //@line 2583
  HEAP32[$AsyncCtx3 + 16 >> 2] = $vararg_buffer; //@line 2585
  sp = STACKTOP; //@line 2586
  STACKTOP = sp; //@line 2587
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2589
 HEAP32[$0 >> 2] = 916; //@line 2590
 HEAP32[$0 + 4 >> 2] = 1012; //@line 2592
 $8 = $0 + 20 | 0; //@line 2593
 HEAP32[$8 >> 2] = 0; //@line 2594
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 2595
 $9 = __ZN4mbed6fdopenEPNS_10FileHandleEPKc($0, 5079) | 0; //@line 2596
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 103; //@line 2599
  HEAP32[$AsyncCtx + 4 >> 2] = $8; //@line 2601
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 2603
  HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer; //@line 2605
  sp = STACKTOP; //@line 2606
  STACKTOP = sp; //@line 2607
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2609
 HEAP32[$8 >> 2] = $9; //@line 2610
 if (!$9) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[(___errno_location() | 0) >> 2]; //@line 2615
  _error(5082, $vararg_buffer); //@line 2616
  STACKTOP = sp; //@line 2617
  return;
 } else {
  __ZN4mbed26mbed_set_unbuffered_streamEP8_IO_FILE($9); //@line 2619
  STACKTOP = sp; //@line 2620
  return;
 }
}
function __ZN15GraphicsDisplay4fillEiiiii($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$010 = 0, $13 = 0, $17 = 0, $23 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1049
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 1052
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 1053
 FUNCTION_TABLE_viiiii[$8 & 7]($0, $1, $2, $3, $4); //@line 1054
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 55; //@line 1057
  HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 1059
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 1061
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 1063
  HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 1065
  sp = STACKTOP; //@line 1066
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1069
 $13 = Math_imul($4, $3) | 0; //@line 1070
 if (($13 | 0) <= 0) {
  return;
 }
 $$010 = 0; //@line 1075
 while (1) {
  $17 = HEAP32[(HEAP32[$0 >> 2] | 0) + 136 >> 2] | 0; //@line 1079
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1080
  FUNCTION_TABLE_vii[$17 & 7]($0, $5); //@line 1081
  if (___async) {
   label = 7; //@line 1084
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1087
  $23 = $$010 + 1 | 0; //@line 1088
  if (($23 | 0) == ($13 | 0)) {
   label = 5; //@line 1091
   break;
  } else {
   $$010 = $23; //@line 1094
  }
 }
 if ((label | 0) == 5) {
  return;
 } else if ((label | 0) == 7) {
  HEAP32[$AsyncCtx3 >> 2] = 56; //@line 1101
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$010; //@line 1103
  HEAP32[$AsyncCtx3 + 8 >> 2] = $13; //@line 1105
  HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 1107
  HEAP32[$AsyncCtx3 + 16 >> 2] = $0; //@line 1109
  HEAP32[$AsyncCtx3 + 20 >> 2] = $5; //@line 1111
  sp = STACKTOP; //@line 1112
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_55($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2591
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2595
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2597
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2599
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2601
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2603
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2605
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2607
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 2610
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 2611
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 2627
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 2628
    if (!___async) {
     ___async_unwind = 0; //@line 2631
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 182; //@line 2633
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 2635
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 2637
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 2639
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 2641
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 2643
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 2645
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 2647
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 2649
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 2652
    sp = STACKTOP; //@line 2653
    return;
   }
  }
 } while (0);
 return;
}
function __ZN11TextDisplayC2EPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $12 = 0, $13 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 1749
 STACKTOP = STACKTOP + 16 | 0; //@line 1750
 $vararg_buffer = sp; //@line 1751
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 1752
 __ZN4mbed6StreamC2EPKc($0, $1); //@line 1753
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 77; //@line 1756
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1758
  HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 1760
  HEAP32[$AsyncCtx3 + 12 >> 2] = $vararg_buffer; //@line 1762
  HEAP32[$AsyncCtx3 + 16 >> 2] = $vararg_buffer; //@line 1764
  sp = STACKTOP; //@line 1765
  STACKTOP = sp; //@line 1766
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1768
 HEAP32[$0 >> 2] = 680; //@line 1769
 HEAP32[$0 + 4 >> 2] = 808; //@line 1771
 HEAP16[$0 + 26 >> 1] = 0; //@line 1773
 HEAP16[$0 + 24 >> 1] = 0; //@line 1775
 if (!$1) {
  HEAP32[$0 + 32 >> 2] = 0; //@line 1779
  STACKTOP = sp; //@line 1780
  return;
 }
 $12 = (_strlen($1) | 0) + 2 | 0; //@line 1783
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 1784
 $13 = __Znaj($12) | 0; //@line 1785
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 78; //@line 1788
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1790
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 1792
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 1794
  HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer; //@line 1796
  sp = STACKTOP; //@line 1797
  STACKTOP = sp; //@line 1798
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1800
 HEAP32[$0 + 32 >> 2] = $13; //@line 1802
 HEAP32[$vararg_buffer >> 2] = $1; //@line 1803
 _sprintf($13, 4707, $vararg_buffer) | 0; //@line 1804
 STACKTOP = sp; //@line 1805
 return;
}
function __ZN4mbed10FileHandle4sizeEv($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $17 = 0, $3 = 0, $4 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 2180
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 2183
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 2184
 $4 = FUNCTION_TABLE_iiii[$3 & 15]($0, 0, 1) | 0; //@line 2185
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 89; //@line 2188
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2190
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 2192
  sp = STACKTOP; //@line 2193
  return 0; //@line 2194
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2196
 if (($4 | 0) < 0) {
  $$0 = $4; //@line 2199
  return $$0 | 0; //@line 2200
 }
 $10 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 2204
 $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2205
 $11 = FUNCTION_TABLE_iiii[$10 & 15]($0, 0, 2) | 0; //@line 2206
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 90; //@line 2209
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2211
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 2213
  HEAP32[$AsyncCtx3 + 12 >> 2] = $4; //@line 2215
  sp = STACKTOP; //@line 2216
  return 0; //@line 2217
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2219
 $17 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 2222
 $AsyncCtx6 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2223
 FUNCTION_TABLE_iiii[$17 & 15]($0, $4, 0) | 0; //@line 2224
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 91; //@line 2227
  HEAP32[$AsyncCtx6 + 4 >> 2] = $11; //@line 2229
  sp = STACKTOP; //@line 2230
  return 0; //@line 2231
 }
 _emscripten_free_async_context($AsyncCtx6 | 0); //@line 2233
 $$0 = $11; //@line 2234
 return $$0 | 0; //@line 2235
}
function __ZN11TextDisplay5_putcEi__async_cb_50($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $16 = 0, $17 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 2203
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2207
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2209
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2211
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2213
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2215
 if ((HEAP32[___async_retval >> 2] | 0) > (HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP32[___async_retval >> 2] = $4; //@line 2221
  return;
 }
 HEAP16[$6 >> 1] = 0; //@line 2224
 $16 = (HEAP16[$8 >> 1] | 0) + 1 << 16 >> 16; //@line 2226
 HEAP16[$8 >> 1] = $16; //@line 2227
 $17 = $16 & 65535; //@line 2228
 $20 = HEAP32[(HEAP32[$10 >> 2] | 0) + 92 >> 2] | 0; //@line 2231
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 2232
 $21 = FUNCTION_TABLE_ii[$20 & 31]($12) | 0; //@line 2233
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 67; //@line 2236
  $22 = $ReallocAsyncCtx4 + 4 | 0; //@line 2237
  HEAP32[$22 >> 2] = $17; //@line 2238
  $23 = $ReallocAsyncCtx4 + 8 | 0; //@line 2239
  HEAP32[$23 >> 2] = $4; //@line 2240
  $24 = $ReallocAsyncCtx4 + 12 | 0; //@line 2241
  HEAP32[$24 >> 2] = $8; //@line 2242
  sp = STACKTOP; //@line 2243
  return;
 }
 HEAP32[___async_retval >> 2] = $21; //@line 2247
 ___async_unwind = 0; //@line 2248
 HEAP32[$ReallocAsyncCtx4 >> 2] = 67; //@line 2249
 $22 = $ReallocAsyncCtx4 + 4 | 0; //@line 2250
 HEAP32[$22 >> 2] = $17; //@line 2251
 $23 = $ReallocAsyncCtx4 + 8 | 0; //@line 2252
 HEAP32[$23 >> 2] = $4; //@line 2253
 $24 = $ReallocAsyncCtx4 + 12 | 0; //@line 2254
 HEAP32[$24 >> 2] = $8; //@line 2255
 sp = STACKTOP; //@line 2256
 return;
}
function __ZN4mbed8FileBaseD2Ev__async_cb_24($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $15 = 0, $18 = 0, $2 = 0, $6 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 645
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 647
 do {
  if (HEAP32[$2 + 8 >> 2] | 0) {
   $6 = HEAP32[2136] | 0; //@line 653
   if (($6 | 0) == ($2 | 0)) {
    HEAP32[2136] = HEAP32[$2 + 4 >> 2]; //@line 658
    break;
   } else {
    $$0 = $6; //@line 661
   }
   do {
    $10 = $$0 + 4 | 0; //@line 664
    $$0 = HEAP32[$10 >> 2] | 0; //@line 665
   } while (($$0 | 0) != ($2 | 0));
   HEAP32[$10 >> 2] = HEAP32[$2 + 4 >> 2]; //@line 675
  }
 } while (0);
 $15 = HEAP32[2137] | 0; //@line 678
 if (!$15) {
  HEAP32[2137] = 8552; //@line 681
 } else {
  if (($15 | 0) != 8552) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 685
   _mbed_assert_internal(5291, 5311, 93); //@line 686
   if (___async) {
    HEAP32[$ReallocAsyncCtx >> 2] = 80; //@line 689
    $18 = $ReallocAsyncCtx + 4 | 0; //@line 690
    HEAP32[$18 >> 2] = $2; //@line 691
    sp = STACKTOP; //@line 692
    return;
   }
   ___async_unwind = 0; //@line 695
   HEAP32[$ReallocAsyncCtx >> 2] = 80; //@line 696
   $18 = $ReallocAsyncCtx + 4 | 0; //@line 697
   HEAP32[$18 >> 2] = $2; //@line 698
   sp = STACKTOP; //@line 699
   return;
  }
 }
 if (HEAP32[$2 + 12 >> 2] | 0) {
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 710
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 711
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 81; //@line 714
  sp = STACKTOP; //@line 715
  return;
 }
 ___async_unwind = 0; //@line 718
 HEAP32[$ReallocAsyncCtx3 >> 2] = 81; //@line 719
 sp = STACKTOP; //@line 720
 return;
}
function __ZN11TextDisplayC2EPKc__async_cb_66($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3703
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3705
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3707
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3709
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3711
 HEAP32[$2 >> 2] = 680; //@line 3712
 HEAP32[$2 + 4 >> 2] = 808; //@line 3714
 HEAP16[$2 + 26 >> 1] = 0; //@line 3716
 HEAP16[$2 + 24 >> 1] = 0; //@line 3718
 if (!$4) {
  HEAP32[$2 + 32 >> 2] = 0; //@line 3722
  return;
 }
 $15 = (_strlen($4) | 0) + 2 | 0; //@line 3726
 $ReallocAsyncCtx = _emscripten_realloc_async_context(20) | 0; //@line 3727
 $16 = __Znaj($15) | 0; //@line 3728
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 78; //@line 3731
  $17 = $ReallocAsyncCtx + 4 | 0; //@line 3732
  HEAP32[$17 >> 2] = $2; //@line 3733
  $18 = $ReallocAsyncCtx + 8 | 0; //@line 3734
  HEAP32[$18 >> 2] = $6; //@line 3735
  $19 = $ReallocAsyncCtx + 12 | 0; //@line 3736
  HEAP32[$19 >> 2] = $4; //@line 3737
  $20 = $ReallocAsyncCtx + 16 | 0; //@line 3738
  HEAP32[$20 >> 2] = $8; //@line 3739
  sp = STACKTOP; //@line 3740
  return;
 }
 HEAP32[___async_retval >> 2] = $16; //@line 3744
 ___async_unwind = 0; //@line 3745
 HEAP32[$ReallocAsyncCtx >> 2] = 78; //@line 3746
 $17 = $ReallocAsyncCtx + 4 | 0; //@line 3747
 HEAP32[$17 >> 2] = $2; //@line 3748
 $18 = $ReallocAsyncCtx + 8 | 0; //@line 3749
 HEAP32[$18 >> 2] = $6; //@line 3750
 $19 = $ReallocAsyncCtx + 12 | 0; //@line 3751
 HEAP32[$19 >> 2] = $4; //@line 3752
 $20 = $ReallocAsyncCtx + 16 | 0; //@line 3753
 HEAP32[$20 >> 2] = $8; //@line 3754
 sp = STACKTOP; //@line 3755
 return;
}
function ___dup3($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$sink = 0, $5 = 0, $6 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 11223
 STACKTOP = STACKTOP + 48 | 0; //@line 11224
 $vararg_buffer7 = sp + 24 | 0; //@line 11225
 $vararg_buffer3 = sp + 16 | 0; //@line 11226
 $vararg_buffer = sp; //@line 11227
 L1 : do {
  if (($0 | 0) == ($1 | 0)) {
   $$sink = -22; //@line 11231
  } else {
   $5 = ($2 & 524288 | 0) != 0; //@line 11234
   L3 : do {
    if ($5) {
     while (1) {
      HEAP32[$vararg_buffer >> 2] = $0; //@line 11238
      HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 11240
      HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 11242
      $6 = ___syscall330(330, $vararg_buffer | 0) | 0; //@line 11243
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
        $$sink = $6; //@line 11253
        break L1;
       }
      }
     }
    }
   } while (0);
   do {
    HEAP32[$vararg_buffer3 >> 2] = $0; //@line 11261
    HEAP32[$vararg_buffer3 + 4 >> 2] = $1; //@line 11263
    $7 = ___syscall63(63, $vararg_buffer3 | 0) | 0; //@line 11264
   } while (($7 | 0) == -16);
   if ($5) {
    HEAP32[$vararg_buffer7 >> 2] = $1; //@line 11271
    HEAP32[$vararg_buffer7 + 4 >> 2] = 2; //@line 11273
    HEAP32[$vararg_buffer7 + 8 >> 2] = 1; //@line 11275
    ___syscall221(221, $vararg_buffer7 | 0) | 0; //@line 11276
    $$sink = $7; //@line 11277
   } else {
    $$sink = $7; //@line 11279
   }
  }
 } while (0);
 $9 = ___syscall_ret($$sink) | 0; //@line 11283
 STACKTOP = sp; //@line 11284
 return $9 | 0; //@line 11284
}
function _fflush__async_cb_33($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1127
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1129
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 1131
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 1135
  } else {
   $$02327 = $$02325; //@line 1137
   $$02426 = $AsyncRetVal; //@line 1137
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 1144
    } else {
     $16 = 0; //@line 1146
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 1158
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 1161
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 1164
     break L3;
    } else {
     $$02327 = $$023; //@line 1167
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 1170
   $13 = ___fflush_unlocked($$02327) | 0; //@line 1171
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 1175
    ___async_unwind = 0; //@line 1176
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 147; //@line 1178
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 1180
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 1182
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 1184
   sp = STACKTOP; //@line 1185
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 1189
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 1191
 return;
}
function ___stdio_read($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$cast = 0, $11 = 0, $18 = 0, $24 = 0, $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 6865
 STACKTOP = STACKTOP + 32 | 0; //@line 6866
 $vararg_buffer = sp; //@line 6867
 $3 = sp + 16 | 0; //@line 6868
 HEAP32[$3 >> 2] = $1; //@line 6869
 $4 = $3 + 4 | 0; //@line 6870
 $5 = $0 + 48 | 0; //@line 6871
 $6 = HEAP32[$5 >> 2] | 0; //@line 6872
 HEAP32[$4 >> 2] = $2 - (($6 | 0) != 0 & 1); //@line 6876
 $11 = $0 + 44 | 0; //@line 6878
 HEAP32[$3 + 8 >> 2] = HEAP32[$11 >> 2]; //@line 6880
 HEAP32[$3 + 12 >> 2] = $6; //@line 6882
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 6886
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 6888
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 6890
 $18 = ___syscall_ret(___syscall145(145, $vararg_buffer | 0) | 0) | 0; //@line 6892
 if (($18 | 0) < 1) {
  HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | $18 & 48 ^ 16; //@line 6899
  $$0 = $18; //@line 6900
 } else {
  $24 = HEAP32[$4 >> 2] | 0; //@line 6902
  if ($18 >>> 0 > $24 >>> 0) {
   $27 = HEAP32[$11 >> 2] | 0; //@line 6906
   $28 = $0 + 4 | 0; //@line 6907
   HEAP32[$28 >> 2] = $27; //@line 6908
   $$cast = $27; //@line 6909
   HEAP32[$0 + 8 >> 2] = $$cast + ($18 - $24); //@line 6912
   if (!(HEAP32[$5 >> 2] | 0)) {
    $$0 = $2; //@line 6916
   } else {
    HEAP32[$28 >> 2] = $$cast + 1; //@line 6919
    HEAP8[$1 + ($2 + -1) >> 0] = HEAP8[$$cast >> 0] | 0; //@line 6923
    $$0 = $2; //@line 6924
   }
  } else {
   $$0 = $18; //@line 6927
  }
 }
 STACKTOP = sp; //@line 6930
 return $$0 | 0; //@line 6930
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7192
 STACKTOP = STACKTOP + 16 | 0; //@line 7193
 $2 = sp; //@line 7194
 $3 = $1 & 255; //@line 7195
 HEAP8[$2 >> 0] = $3; //@line 7196
 $4 = $0 + 16 | 0; //@line 7197
 $5 = HEAP32[$4 >> 2] | 0; //@line 7198
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 7205
   label = 4; //@line 7206
  } else {
   $$0 = -1; //@line 7208
  }
 } else {
  $12 = $5; //@line 7211
  label = 4; //@line 7212
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 7216
   $10 = HEAP32[$9 >> 2] | 0; //@line 7217
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 7220
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 7227
     HEAP8[$10 >> 0] = $3; //@line 7228
     $$0 = $13; //@line 7229
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 7234
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7235
   $21 = FUNCTION_TABLE_iiii[$20 & 15]($0, $2, 1) | 0; //@line 7236
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 141; //@line 7239
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 7241
    sp = STACKTOP; //@line 7242
    STACKTOP = sp; //@line 7243
    return 0; //@line 7243
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 7245
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 7250
   } else {
    $$0 = -1; //@line 7252
   }
  }
 } while (0);
 STACKTOP = sp; //@line 7256
 return $$0 | 0; //@line 7256
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 5354
 value = value & 255; //@line 5356
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 5359
   ptr = ptr + 1 | 0; //@line 5360
  }
  aligned_end = end & -4 | 0; //@line 5363
  block_aligned_end = aligned_end - 64 | 0; //@line 5364
  value4 = value | value << 8 | value << 16 | value << 24; //@line 5365
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 5368
   HEAP32[ptr + 4 >> 2] = value4; //@line 5369
   HEAP32[ptr + 8 >> 2] = value4; //@line 5370
   HEAP32[ptr + 12 >> 2] = value4; //@line 5371
   HEAP32[ptr + 16 >> 2] = value4; //@line 5372
   HEAP32[ptr + 20 >> 2] = value4; //@line 5373
   HEAP32[ptr + 24 >> 2] = value4; //@line 5374
   HEAP32[ptr + 28 >> 2] = value4; //@line 5375
   HEAP32[ptr + 32 >> 2] = value4; //@line 5376
   HEAP32[ptr + 36 >> 2] = value4; //@line 5377
   HEAP32[ptr + 40 >> 2] = value4; //@line 5378
   HEAP32[ptr + 44 >> 2] = value4; //@line 5379
   HEAP32[ptr + 48 >> 2] = value4; //@line 5380
   HEAP32[ptr + 52 >> 2] = value4; //@line 5381
   HEAP32[ptr + 56 >> 2] = value4; //@line 5382
   HEAP32[ptr + 60 >> 2] = value4; //@line 5383
   ptr = ptr + 64 | 0; //@line 5384
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 5388
   ptr = ptr + 4 | 0; //@line 5389
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 5394
  ptr = ptr + 1 | 0; //@line 5395
 }
 return end - num | 0; //@line 5397
}
function __ZN15GraphicsDisplay3clsEv($0) {
 $0 = $0 | 0;
 var $1 = 0, $12 = 0, $13 = 0, $19 = 0, $3 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 900
 $1 = HEAP32[$0 >> 2] | 0; //@line 901
 $3 = HEAP32[$1 + 140 >> 2] | 0; //@line 903
 $5 = HEAP32[$1 + 124 >> 2] | 0; //@line 905
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 906
 $6 = FUNCTION_TABLE_ii[$5 & 31]($0) | 0; //@line 907
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 51; //@line 910
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 912
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 914
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 916
  sp = STACKTOP; //@line 917
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 920
 $12 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 923
 $AsyncCtx2 = _emscripten_alloc_async_context(16, sp) | 0; //@line 924
 $13 = FUNCTION_TABLE_ii[$12 & 31]($0) | 0; //@line 925
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 52; //@line 928
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 930
  HEAP32[$AsyncCtx2 + 8 >> 2] = $6; //@line 932
  HEAP32[$AsyncCtx2 + 12 >> 2] = $3; //@line 934
  sp = STACKTOP; //@line 935
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 938
 $19 = HEAPU16[$0 + 30 >> 1] | 0; //@line 941
 $AsyncCtx5 = _emscripten_alloc_async_context(4, sp) | 0; //@line 942
 FUNCTION_TABLE_viiiiii[$3 & 7]($0, 0, 0, $6, $13, $19); //@line 943
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 53; //@line 946
  sp = STACKTOP; //@line 947
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 950
  return;
 }
}
function __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2047
 HEAP32[$0 >> 2] = 824; //@line 2048
 $3 = $0 + 4 | 0; //@line 2049
 HEAP32[$3 >> 2] = 0; //@line 2050
 HEAP32[$0 + 8 >> 2] = $1; //@line 2052
 HEAP32[$0 + 12 >> 2] = $2; //@line 2054
 $6 = HEAP32[2137] | 0; //@line 2055
 do {
  if (!$6) {
   HEAP32[2137] = 8552; //@line 2059
  } else {
   if (($6 | 0) != 8552) {
    $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2063
    _mbed_assert_internal(5291, 5311, 93); //@line 2064
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 85; //@line 2067
     HEAP32[$AsyncCtx3 + 4 >> 2] = $1; //@line 2069
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 2071
     HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 2073
     sp = STACKTOP; //@line 2074
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2077
     break;
    }
   }
  }
 } while (0);
 if (!$1) {
  HEAP32[$3 >> 2] = 0; //@line 2085
 } else {
  HEAP32[$3 >> 2] = HEAP32[2136]; //@line 2088
  HEAP32[2136] = $0; //@line 2089
 }
 $14 = HEAP32[2137] | 0; //@line 2091
 if (!$14) {
  HEAP32[2137] = 8552; //@line 2094
  return;
 }
 if (($14 | 0) == 8552) {
  return;
 }
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2101
 _mbed_assert_internal(5291, 5311, 93); //@line 2102
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 86; //@line 2105
  sp = STACKTOP; //@line 2106
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2109
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2528
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2532
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2534
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2536
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2538
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2540
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2542
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 2545
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 2546
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 2555
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 2556
    if (!___async) {
     ___async_unwind = 0; //@line 2559
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 183; //@line 2561
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 2563
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 2565
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 2567
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 2569
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 2571
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 2573
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 2575
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 2578
    sp = STACKTOP; //@line 2579
    return;
   }
  }
 }
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 14123
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14125
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14127
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14129
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 14134
  } else {
   $9 = $4 + 4 | 0; //@line 14136
   $10 = HEAP32[$9 >> 2] | 0; //@line 14137
   $11 = $4 + 8 | 0; //@line 14138
   $12 = HEAP32[$11 >> 2] | 0; //@line 14139
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 14143
    HEAP32[$6 >> 2] = 0; //@line 14144
    HEAP32[$2 >> 2] = 0; //@line 14145
    HEAP32[$11 >> 2] = 0; //@line 14146
    HEAP32[$9 >> 2] = 0; //@line 14147
    $$0 = 0; //@line 14148
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 14155
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 14156
   FUNCTION_TABLE_iiii[$18 & 15]($4, $10 - $12 | 0, 1) | 0; //@line 14157
   if (!___async) {
    ___async_unwind = 0; //@line 14160
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 149; //@line 14162
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 14164
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 14166
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 14168
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 14170
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 14172
   sp = STACKTOP; //@line 14173
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 14178
 return;
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1028
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 1038
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 1038
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 1038
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 1042
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 1045
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 1048
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 1056
  } else {
   $20 = 0; //@line 1058
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 1068
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 1072
  HEAP32[___async_retval >> 2] = $$1; //@line 1074
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 1077
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 1078
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 1082
  ___async_unwind = 0; //@line 1083
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 147; //@line 1085
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 1087
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 1089
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 1091
 sp = STACKTOP; //@line 1092
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 10890
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 10895
    $$0 = 1; //@line 10896
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 10909
     $$0 = 1; //@line 10910
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 10914
     $$0 = -1; //@line 10915
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 10925
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 10929
    $$0 = 2; //@line 10930
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 10942
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 10948
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 10952
    $$0 = 3; //@line 10953
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 10963
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 10969
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 10975
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 10979
    $$0 = 4; //@line 10980
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 10984
    $$0 = -1; //@line 10985
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 10990
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_54($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 2467
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2469
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2471
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2473
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2475
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 2480
  return;
 }
 dest = $2 + 4 | 0; //@line 2484
 stop = dest + 52 | 0; //@line 2484
 do {
  HEAP32[dest >> 2] = 0; //@line 2484
  dest = dest + 4 | 0; //@line 2484
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 2485
 HEAP32[$2 + 8 >> 2] = $4; //@line 2487
 HEAP32[$2 + 12 >> 2] = -1; //@line 2489
 HEAP32[$2 + 48 >> 2] = 1; //@line 2491
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 2494
 $16 = HEAP32[$6 >> 2] | 0; //@line 2495
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 2496
 FUNCTION_TABLE_viiii[$15 & 7]($AsyncRetVal, $2, $16, 1); //@line 2497
 if (!___async) {
  ___async_unwind = 0; //@line 2500
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 168; //@line 2502
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 2504
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 2506
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 2508
 sp = STACKTOP; //@line 2509
 return;
}
function __ZN4mbed10FileHandle4sizeEv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 447
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 449
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 451
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 453
 if (($AsyncRetVal | 0) < 0) {
  HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 457
  return;
 }
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 16 >> 2] | 0; //@line 462
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 463
 $10 = FUNCTION_TABLE_iiii[$9 & 15]($4, 0, 2) | 0; //@line 464
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 90; //@line 467
  $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 468
  HEAP32[$11 >> 2] = $2; //@line 469
  $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 470
  HEAP32[$12 >> 2] = $4; //@line 471
  $13 = $ReallocAsyncCtx2 + 12 | 0; //@line 472
  HEAP32[$13 >> 2] = $AsyncRetVal; //@line 473
  sp = STACKTOP; //@line 474
  return;
 }
 HEAP32[___async_retval >> 2] = $10; //@line 478
 ___async_unwind = 0; //@line 479
 HEAP32[$ReallocAsyncCtx2 >> 2] = 90; //@line 480
 $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 481
 HEAP32[$11 >> 2] = $2; //@line 482
 $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 483
 HEAP32[$12 >> 2] = $4; //@line 484
 $13 = $ReallocAsyncCtx2 + 12 | 0; //@line 485
 HEAP32[$13 >> 2] = $AsyncRetVal; //@line 486
 sp = STACKTOP; //@line 487
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_56($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2664
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2668
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2670
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2672
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2674
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2676
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 2679
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 2680
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 2686
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 2687
   if (!___async) {
    ___async_unwind = 0; //@line 2690
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 181; //@line 2692
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 2694
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 2696
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 2698
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 2700
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 2702
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 2704
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 2707
   sp = STACKTOP; //@line 2708
   return;
  }
 }
 return;
}
function __ZN4mbed6StreamC2EPKc__async_cb_62($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3221
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3225
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3227
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3229
 HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = 916; //@line 3230
 HEAP32[$4 + 4 >> 2] = 1012; //@line 3232
 $10 = $4 + 20 | 0; //@line 3233
 HEAP32[$10 >> 2] = 0; //@line 3234
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 3235
 $11 = __ZN4mbed6fdopenEPNS_10FileHandleEPKc($4, 5079) | 0; //@line 3236
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 103; //@line 3239
  $12 = $ReallocAsyncCtx + 4 | 0; //@line 3240
  HEAP32[$12 >> 2] = $10; //@line 3241
  $13 = $ReallocAsyncCtx + 8 | 0; //@line 3242
  HEAP32[$13 >> 2] = $6; //@line 3243
  $14 = $ReallocAsyncCtx + 12 | 0; //@line 3244
  HEAP32[$14 >> 2] = $8; //@line 3245
  sp = STACKTOP; //@line 3246
  return;
 }
 HEAP32[___async_retval >> 2] = $11; //@line 3250
 ___async_unwind = 0; //@line 3251
 HEAP32[$ReallocAsyncCtx >> 2] = 103; //@line 3252
 $12 = $ReallocAsyncCtx + 4 | 0; //@line 3253
 HEAP32[$12 >> 2] = $10; //@line 3254
 $13 = $ReallocAsyncCtx + 8 | 0; //@line 3255
 HEAP32[$13 >> 2] = $6; //@line 3256
 $14 = $ReallocAsyncCtx + 12 | 0; //@line 3257
 HEAP32[$14 >> 2] = $8; //@line 3258
 sp = STACKTOP; //@line 3259
 return;
}
function _fopen($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $11 = 0, $15 = 0, $7 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_buffer8 = 0, sp = 0;
 sp = STACKTOP; //@line 7538
 STACKTOP = STACKTOP + 48 | 0; //@line 7539
 $vararg_buffer8 = sp + 32 | 0; //@line 7540
 $vararg_buffer3 = sp + 16 | 0; //@line 7541
 $vararg_buffer = sp; //@line 7542
 if (!(_strchr(5539, HEAP8[$1 >> 0] | 0) | 0)) {
  HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 7549
  $$0 = 0; //@line 7550
 } else {
  $7 = ___fmodeflags($1) | 0; //@line 7552
  HEAP32[$vararg_buffer >> 2] = $0; //@line 7555
  HEAP32[$vararg_buffer + 4 >> 2] = $7 | 32768; //@line 7557
  HEAP32[$vararg_buffer + 8 >> 2] = 438; //@line 7559
  $11 = ___syscall_ret(___syscall5(5, $vararg_buffer | 0) | 0) | 0; //@line 7561
  if (($11 | 0) < 0) {
   $$0 = 0; //@line 7564
  } else {
   if ($7 & 524288 | 0) {
    HEAP32[$vararg_buffer3 >> 2] = $11; //@line 7569
    HEAP32[$vararg_buffer3 + 4 >> 2] = 2; //@line 7571
    HEAP32[$vararg_buffer3 + 8 >> 2] = 1; //@line 7573
    ___syscall221(221, $vararg_buffer3 | 0) | 0; //@line 7574
   }
   $15 = ___fdopen($11, $1) | 0; //@line 7576
   if (!$15) {
    HEAP32[$vararg_buffer8 >> 2] = $11; //@line 7579
    ___syscall6(6, $vararg_buffer8 | 0) | 0; //@line 7580
    $$0 = 0; //@line 7581
   } else {
    $$0 = $15; //@line 7583
   }
  }
 }
 STACKTOP = sp; //@line 7587
 return $$0 | 0; //@line 7587
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 9774
  $8 = $0; //@line 9774
  $9 = $1; //@line 9774
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 9776
   $$0914 = $$0914 + -1 | 0; //@line 9780
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 9781
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 9782
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 9790
   }
  }
  $$010$lcssa$off0 = $8; //@line 9795
  $$09$lcssa = $$0914; //@line 9795
 } else {
  $$010$lcssa$off0 = $0; //@line 9797
  $$09$lcssa = $2; //@line 9797
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 9801
 } else {
  $$012 = $$010$lcssa$off0; //@line 9803
  $$111 = $$09$lcssa; //@line 9803
  while (1) {
   $26 = $$111 + -1 | 0; //@line 9808
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 9809
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 9813
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 9816
    $$111 = $26; //@line 9816
   }
  }
 }
 return $$1$lcssa | 0; //@line 9820
}
function __ZN4mbed17remove_filehandleEPNS_10FileHandleE($0) {
 $0 = $0 | 0;
 var $1 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3283
 $1 = HEAP32[2139] | 0; //@line 3284
 do {
  if (!$1) {
   HEAP32[2139] = 8560; //@line 3288
  } else {
   if (($1 | 0) != 8560) {
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3292
    _mbed_assert_internal(5291, 5311, 93); //@line 3293
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 132; //@line 3296
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 3298
     sp = STACKTOP; //@line 3299
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3302
     break;
    }
   }
  }
 } while (0);
 if ((HEAP32[443] | 0) == ($0 | 0)) {
  HEAP32[443] = 0; //@line 3311
 }
 if ((HEAP32[444] | 0) == ($0 | 0)) {
  HEAP32[444] = 0; //@line 3316
 }
 if ((HEAP32[445] | 0) == ($0 | 0)) {
  HEAP32[445] = 0; //@line 3321
 }
 $8 = HEAP32[2139] | 0; //@line 3323
 if (!$8) {
  HEAP32[2139] = 8560; //@line 3326
  return;
 }
 if (($8 | 0) == 8560) {
  return;
 }
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3333
 _mbed_assert_internal(5291, 5311, 93); //@line 3334
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 133; //@line 3337
  sp = STACKTOP; //@line 3338
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3341
 return;
}
function __ZN11TextDisplay5claimEP8_IO_FILE($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $12 = 0, $13 = 0, $3 = 0, $6 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1497
 $3 = HEAP32[$0 + 32 >> 2] | 0; //@line 1499
 if (!$3) {
  _fwrite(4564, 85, 1, HEAP32[255] | 0) | 0; //@line 1503
  $$0 = 0; //@line 1504
  return $$0 | 0; //@line 1505
 }
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1507
 $6 = _freopen($3, 4650, $1) | 0; //@line 1508
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 68; //@line 1511
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1513
  sp = STACKTOP; //@line 1514
  return 0; //@line 1515
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1517
 if (!$6) {
  $$0 = 0; //@line 1520
  return $$0 | 0; //@line 1521
 }
 $9 = HEAP32[287] | 0; //@line 1523
 $12 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 1526
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1527
 $13 = FUNCTION_TABLE_ii[$12 & 31]($0) | 0; //@line 1528
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 69; //@line 1531
  HEAP32[$AsyncCtx + 4 >> 2] = $9; //@line 1533
  sp = STACKTOP; //@line 1534
  return 0; //@line 1535
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1537
 _setvbuf($9, 0, 1, $13) | 0; //@line 1538
 $$0 = 1; //@line 1539
 return $$0 | 0; //@line 1540
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1288
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1290
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1294
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1296
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1298
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1300
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 1304
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 1307
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 1308
   if (!___async) {
    ___async_unwind = 0; //@line 1311
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 185; //@line 1313
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 1315
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 1317
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 1319
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 1321
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 1323
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 1325
   sp = STACKTOP; //@line 1326
   return;
  }
 }
 return;
}
function __ZN4mbed6fdopenEPNS_10FileHandleEPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0$$sroa_idx = 0, $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3378
 STACKTOP = STACKTOP + 16 | 0; //@line 3379
 $2 = sp; //@line 3380
 HEAP8[$2 >> 0] = 58; //@line 3381
 $$0$$sroa_idx = $2 + 1 | 0; //@line 3382
 HEAP8[$$0$$sroa_idx >> 0] = $0; //@line 3383
 HEAP8[$$0$$sroa_idx + 1 >> 0] = $0 >> 8; //@line 3383
 HEAP8[$$0$$sroa_idx + 2 >> 0] = $0 >> 16; //@line 3383
 HEAP8[$$0$$sroa_idx + 3 >> 0] = $0 >> 24; //@line 3383
 $3 = _fopen($2, $1) | 0; //@line 3384
 if (!$3) {
  STACKTOP = sp; //@line 3387
  return $3 | 0; //@line 3387
 }
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 28 >> 2] | 0; //@line 3391
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 3392
 $8 = FUNCTION_TABLE_ii[$7 & 31]($0) | 0; //@line 3393
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 135; //@line 3396
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 3398
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 3400
  sp = STACKTOP; //@line 3401
  STACKTOP = sp; //@line 3402
  return 0; //@line 3402
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3404
 if (!$8) {
  STACKTOP = sp; //@line 3407
  return $3 | 0; //@line 3407
 }
 _setbuf($3, 0); //@line 3409
 STACKTOP = sp; //@line 3410
 return $3 | 0; //@line 3410
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 7020
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 7025
   label = 4; //@line 7026
  } else {
   $$01519 = $0; //@line 7028
   $23 = $1; //@line 7028
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 7033
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 7036
    $23 = $6; //@line 7037
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 7041
     label = 4; //@line 7042
     break;
    } else {
     $$01519 = $6; //@line 7045
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 7051
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 7053
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 7061
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 7069
  } else {
   $$pn = $$0; //@line 7071
   while (1) {
    $19 = $$pn + 1 | 0; //@line 7073
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 7077
     break;
    } else {
     $$pn = $19; //@line 7080
    }
   }
  }
  $$sink = $$1$lcssa; //@line 7085
 }
 return $$sink - $1 | 0; //@line 7088
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 12174
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 12181
   $10 = $1 + 16 | 0; //@line 12182
   $11 = HEAP32[$10 >> 2] | 0; //@line 12183
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 12186
    HEAP32[$1 + 24 >> 2] = $4; //@line 12188
    HEAP32[$1 + 36 >> 2] = 1; //@line 12190
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 12200
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 12205
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 12208
    HEAP8[$1 + 54 >> 0] = 1; //@line 12210
    break;
   }
   $21 = $1 + 24 | 0; //@line 12213
   $22 = HEAP32[$21 >> 2] | 0; //@line 12214
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 12217
    $28 = $4; //@line 12218
   } else {
    $28 = $22; //@line 12220
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 12229
   }
  }
 } while (0);
 return;
}
function __ZN15GraphicsDisplay4putpEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $10 = 0, $15 = 0, $22 = 0, $4 = 0, $5 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 989
 $4 = HEAP32[(HEAP32[$0 >> 2] | 0) + 120 >> 2] | 0; //@line 992
 $5 = $0 + 36 | 0; //@line 993
 $7 = HEAP16[$5 >> 1] | 0; //@line 995
 $8 = $0 + 38 | 0; //@line 996
 $10 = HEAP16[$8 >> 1] | 0; //@line 998
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 999
 FUNCTION_TABLE_viiii[$4 & 7]($0, $7, $10, $1); //@line 1000
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 54; //@line 1003
  HEAP32[$AsyncCtx + 4 >> 2] = $5; //@line 1005
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 1007
  HEAP32[$AsyncCtx + 12 >> 2] = $8; //@line 1009
  sp = STACKTOP; //@line 1010
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1013
 $15 = (HEAP16[$5 >> 1] | 0) + 1 << 16 >> 16; //@line 1015
 HEAP16[$5 >> 1] = $15; //@line 1016
 if ($15 << 16 >> 16 <= (HEAP16[$0 + 42 >> 1] | 0)) {
  return;
 }
 HEAP16[$5 >> 1] = HEAP16[$0 + 40 >> 1] | 0; //@line 1025
 $22 = (HEAP16[$8 >> 1] | 0) + 1 << 16 >> 16; //@line 1027
 HEAP16[$8 >> 1] = $22; //@line 1028
 if ($22 << 16 >> 16 <= (HEAP16[$0 + 46 >> 1] | 0)) {
  return;
 }
 HEAP16[$8 >> 1] = HEAP16[$0 + 44 >> 1] | 0; //@line 1037
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11609
 $1 = HEAP32[287] | 0; //@line 11610
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 11616
 } else {
  $19 = 0; //@line 11618
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 11624
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 11630
    $12 = HEAP32[$11 >> 2] | 0; //@line 11631
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 11637
     HEAP8[$12 >> 0] = 10; //@line 11638
     $22 = 0; //@line 11639
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 11643
   $17 = ___overflow($1, 10) | 0; //@line 11644
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 160; //@line 11647
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 11649
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 11651
    sp = STACKTOP; //@line 11652
    return 0; //@line 11653
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 11655
    $22 = $17 >> 31; //@line 11657
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 11664
 }
 return $22 | 0; //@line 11666
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_35($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1336
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1342
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1344
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1346
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1348
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 1353
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 1355
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 1356
 if (!___async) {
  ___async_unwind = 0; //@line 1359
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 185; //@line 1361
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 1363
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 1365
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 1367
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 1369
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 1371
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 1373
 sp = STACKTOP; //@line 1374
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12033
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 12042
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 12047
      HEAP32[$13 >> 2] = $2; //@line 12048
      $19 = $1 + 40 | 0; //@line 12049
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 12052
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 12062
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 12066
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 12073
    }
   }
  }
 } while (0);
 return;
}
function __ZN11TextDisplay5_putcEi__async_cb_49($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $15 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2159
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2161
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2163
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2165
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2167
 $10 = (HEAP16[$2 >> 1] | 0) + 1 << 16 >> 16; //@line 2169
 HEAP16[$2 >> 1] = $10; //@line 2170
 $14 = HEAP32[(HEAP32[$4 >> 2] | 0) + 96 >> 2] | 0; //@line 2174
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(28) | 0; //@line 2175
 $15 = FUNCTION_TABLE_ii[$14 & 31]($4) | 0; //@line 2176
 if (!___async) {
  HEAP32[___async_retval >> 2] = $15; //@line 2180
  ___async_unwind = 0; //@line 2181
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 66; //@line 2183
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $10 & 65535; //@line 2185
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $6; //@line 2187
 HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $2; //@line 2189
 HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 2191
 HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $4; //@line 2193
 HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $4; //@line 2195
 sp = STACKTOP; //@line 2196
 return;
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3618
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3620
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3622
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3624
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 3626
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 3628
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 8105; //@line 3633
  HEAP32[$4 + 4 >> 2] = $6; //@line 3635
  _abort_message(8014, $4); //@line 3636
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 3639
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 3642
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 3643
 $16 = FUNCTION_TABLE_ii[$15 & 31]($12) | 0; //@line 3644
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 3648
  ___async_unwind = 0; //@line 3649
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 164; //@line 3651
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 3653
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 3655
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 3657
 sp = STACKTOP; //@line 3658
 return;
}
function ___strerror_l($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $7 = 0, label = 0, $$113$looptemp = 0;
 $$016 = 0; //@line 11010
 while (1) {
  if ((HEAPU8[6077 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 11017
   break;
  }
  $7 = $$016 + 1 | 0; //@line 11020
  if (($7 | 0) == 87) {
   $$01214 = 6165; //@line 11023
   $$115 = 87; //@line 11023
   label = 5; //@line 11024
   break;
  } else {
   $$016 = $7; //@line 11027
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 6165; //@line 11033
  } else {
   $$01214 = 6165; //@line 11035
   $$115 = $$016; //@line 11035
   label = 5; //@line 11036
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 11041
   $$113 = $$01214; //@line 11042
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 11046
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 11053
   if (!$$115) {
    $$012$lcssa = $$113; //@line 11056
    break;
   } else {
    $$01214 = $$113; //@line 11059
    label = 5; //@line 11060
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 11067
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 540
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 542
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 544
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 548
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 552
  label = 4; //@line 553
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 558
   label = 4; //@line 559
  } else {
   $$037$off039 = 3; //@line 561
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 565
  $17 = $8 + 40 | 0; //@line 566
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 569
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 579
    $$037$off039 = $$037$off038; //@line 580
   } else {
    $$037$off039 = $$037$off038; //@line 582
   }
  } else {
   $$037$off039 = $$037$off038; //@line 585
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 588
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb_61($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3136
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3138
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3140
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3142
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 68 >> 2] | 0; //@line 3145
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 3146
 $10 = FUNCTION_TABLE_iii[$9 & 7]($2, $4) | 0; //@line 3147
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 106; //@line 3150
  $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 3151
  HEAP32[$11 >> 2] = $6; //@line 3152
  $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 3153
  HEAP32[$12 >> 2] = $2; //@line 3154
  sp = STACKTOP; //@line 3155
  return;
 }
 HEAP32[___async_retval >> 2] = $10; //@line 3159
 ___async_unwind = 0; //@line 3160
 HEAP32[$ReallocAsyncCtx2 >> 2] = 106; //@line 3161
 $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 3162
 HEAP32[$11 >> 2] = $6; //@line 3163
 $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 3164
 HEAP32[$12 >> 2] = $2; //@line 3165
 sp = STACKTOP; //@line 3166
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_70($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 3961
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3963
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3965
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3967
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3969
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3971
 $12 = HEAP32[(HEAP32[$2 >> 2] | 0) + 92 >> 2] | 0; //@line 3974
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(24) | 0; //@line 3975
 $13 = FUNCTION_TABLE_ii[$12 & 31]($4) | 0; //@line 3976
 if (!___async) {
  HEAP32[___async_retval >> 2] = $13; //@line 3980
  ___async_unwind = 0; //@line 3981
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 75; //@line 3983
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $AsyncRetVal; //@line 3985
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $6; //@line 3987
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $8; //@line 3989
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $2; //@line 3991
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $4; //@line 3993
 sp = STACKTOP; //@line 3994
 return;
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3233
 $2 = $0 + 12 | 0; //@line 3235
 $3 = HEAP32[$2 >> 2] | 0; //@line 3236
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 3240
   _mbed_assert_internal(5202, 5207, 528); //@line 3241
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 130; //@line 3244
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 3246
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 3248
    sp = STACKTOP; //@line 3249
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 3252
    $8 = HEAP32[$2 >> 2] | 0; //@line 3254
    break;
   }
  } else {
   $8 = $3; //@line 3258
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 3261
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3263
 FUNCTION_TABLE_vi[$7 & 255]($0); //@line 3264
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 131; //@line 3267
  sp = STACKTOP; //@line 3268
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3271
  return;
 }
}
function __ZN4mbed6Stream6printfEPKcz__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 1833
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1835
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1839
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1841
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1843
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1845
 HEAP32[$2 >> 2] = HEAP32[$0 + 8 >> 2]; //@line 1846
 _memset($6 | 0, 0, 4096) | 0; //@line 1847
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(24) | 0; //@line 1848
 $13 = _vsprintf($6, $8, $2) | 0; //@line 1849
 if (!___async) {
  HEAP32[___async_retval >> 2] = $13; //@line 1853
  ___async_unwind = 0; //@line 1854
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 109; //@line 1856
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $10; //@line 1858
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $12; //@line 1860
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 1862
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $2; //@line 1864
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $6; //@line 1866
 sp = STACKTOP; //@line 1867
 return;
}
function __ZN15GraphicsDisplay4fillEiiiii__async_cb_64($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $15 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3575
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3579
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3581
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3583
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3585
 $15 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 3586
 if (($15 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 136 >> 2] | 0; //@line 3593
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 3594
 FUNCTION_TABLE_vii[$13 & 7]($8, $10); //@line 3595
 if (!___async) {
  ___async_unwind = 0; //@line 3598
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 56; //@line 3600
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 3602
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 3604
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 3606
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 3608
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 3610
 sp = STACKTOP; //@line 3611
 return;
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 10841
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 10841
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 10842
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 10843
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 10852
    $$016 = $9; //@line 10855
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 10855
   } else {
    $$016 = $0; //@line 10857
    $storemerge = 0; //@line 10857
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 10859
   $$0 = $$016; //@line 10860
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 10864
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 10870
   HEAP32[tempDoublePtr >> 2] = $2; //@line 10873
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 10873
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 10874
  }
 }
 return +$$0;
}
function __ZN15GraphicsDisplay4blitEiiiiPKi__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $14 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2341
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2347
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2349
 $9 = Math_imul(HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 2350
 if (($9 | 0) <= 0) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 136 >> 2] | 0; //@line 2357
 $14 = HEAP32[$8 >> 2] | 0; //@line 2358
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 2359
 FUNCTION_TABLE_vii[$13 & 7]($6, $14); //@line 2360
 if (!___async) {
  ___async_unwind = 0; //@line 2363
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 58; //@line 2365
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = 0; //@line 2367
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $9; //@line 2369
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 2371
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 2373
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $6; //@line 2375
 sp = STACKTOP; //@line 2376
 return;
}
function __ZN15GraphicsDisplayC2EPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1316
 $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1317
 __ZN11TextDisplayC2EPKc($0, $1); //@line 1318
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 62; //@line 1321
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1323
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 1325
  sp = STACKTOP; //@line 1326
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1329
 HEAP32[$0 >> 2] = 504; //@line 1330
 HEAP32[$0 + 4 >> 2] = 664; //@line 1332
 __ZN11TextDisplay10foregroundEt($0, -1); //@line 1333
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 116 >> 2] | 0; //@line 1336
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1337
 FUNCTION_TABLE_vii[$7 & 7]($0, 0); //@line 1338
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 63; //@line 1341
  sp = STACKTOP; //@line 1342
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1345
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
 sp = STACKTOP; //@line 12389
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 12395
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 12398
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 12401
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 12402
   FUNCTION_TABLE_viiiiii[$13 & 7]($10, $1, $2, $3, $4, $5); //@line 12403
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 171; //@line 12406
    sp = STACKTOP; //@line 12407
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12410
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
 sp = STACKTOP; //@line 11866
 STACKTOP = STACKTOP + 16 | 0; //@line 11867
 $1 = sp; //@line 11868
 HEAP32[$1 >> 2] = $varargs; //@line 11869
 $2 = HEAP32[255] | 0; //@line 11870
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 11871
 _vfprintf($2, $0, $1) | 0; //@line 11872
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 165; //@line 11875
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 11877
  sp = STACKTOP; //@line 11878
  STACKTOP = sp; //@line 11879
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 11881
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 11882
 _fputc(10, $2) | 0; //@line 11883
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 166; //@line 11886
  sp = STACKTOP; //@line 11887
  STACKTOP = sp; //@line 11888
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 11890
  _abort(); //@line 11891
 }
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1207
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1215
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1217
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1219
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1221
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1223
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1225
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1227
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 1238
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 1239
 HEAP32[$10 >> 2] = 0; //@line 1240
 HEAP32[$12 >> 2] = 0; //@line 1241
 HEAP32[$14 >> 2] = 0; //@line 1242
 HEAP32[$2 >> 2] = 0; //@line 1243
 $33 = HEAP32[$16 >> 2] | 0; //@line 1244
 HEAP32[$16 >> 2] = $33 | $18; //@line 1249
 if ($20 | 0) {
  ___unlockfile($22); //@line 1252
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 1255
 return;
}
function __ZN11TextDisplay3clsEv__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3862
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3864
 $5 = HEAP32[(HEAP32[$2 >> 2] | 0) + 96 >> 2] | 0; //@line 3867
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 3868
 $6 = FUNCTION_TABLE_ii[$5 & 31]($2) | 0; //@line 3869
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 71; //@line 3872
  $7 = $ReallocAsyncCtx2 + 4 | 0; //@line 3873
  HEAP32[$7 >> 2] = $2; //@line 3874
  $8 = $ReallocAsyncCtx2 + 8 | 0; //@line 3875
  HEAP32[$8 >> 2] = $2; //@line 3876
  sp = STACKTOP; //@line 3877
  return;
 }
 HEAP32[___async_retval >> 2] = $6; //@line 3881
 ___async_unwind = 0; //@line 3882
 HEAP32[$ReallocAsyncCtx2 >> 2] = 71; //@line 3883
 $7 = $ReallocAsyncCtx2 + 4 | 0; //@line 3884
 HEAP32[$7 >> 2] = $2; //@line 3885
 $8 = $ReallocAsyncCtx2 + 8 | 0; //@line 3886
 HEAP32[$8 >> 2] = $2; //@line 3887
 sp = STACKTOP; //@line 3888
 return;
}
function __ZN11TextDisplay5claimEP8_IO_FILE__async_cb_77($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $5 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4617
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4619
 if (!(HEAP32[___async_retval >> 2] | 0)) {
  HEAP8[___async_retval >> 0] = 0; //@line 4626
  return;
 }
 $5 = HEAP32[287] | 0; //@line 4629
 $8 = HEAP32[(HEAP32[$2 >> 2] | 0) + 96 >> 2] | 0; //@line 4632
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 4633
 $9 = FUNCTION_TABLE_ii[$8 & 31]($2) | 0; //@line 4634
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 69; //@line 4637
  $10 = $ReallocAsyncCtx + 4 | 0; //@line 4638
  HEAP32[$10 >> 2] = $5; //@line 4639
  sp = STACKTOP; //@line 4640
  return;
 }
 HEAP32[___async_retval >> 2] = $9; //@line 4644
 ___async_unwind = 0; //@line 4645
 HEAP32[$ReallocAsyncCtx >> 2] = 69; //@line 4646
 $10 = $ReallocAsyncCtx + 4 | 0; //@line 4647
 HEAP32[$10 >> 2] = $5; //@line 4648
 sp = STACKTOP; //@line 4649
 return;
}
function __ZN15GraphicsDisplay4fillEiiiii__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3534
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3540
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3542
 $9 = Math_imul(HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 3543
 if (($9 | 0) <= 0) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 136 >> 2] | 0; //@line 3550
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 3551
 FUNCTION_TABLE_vii[$13 & 7]($6, $8); //@line 3552
 if (!___async) {
  ___async_unwind = 0; //@line 3555
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 56; //@line 3557
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = 0; //@line 3559
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $9; //@line 3561
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 3563
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $6; //@line 3565
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $8; //@line 3567
 sp = STACKTOP; //@line 3568
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_72($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $4 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4041
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4045
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4047
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4049
 $9 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 4050
 $12 = HEAP32[(HEAP32[$4 >> 2] | 0) + 96 >> 2] | 0; //@line 4053
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 4054
 $13 = FUNCTION_TABLE_ii[$12 & 31]($6) | 0; //@line 4055
 if (!___async) {
  HEAP32[___async_retval >> 2] = $13; //@line 4059
  ___async_unwind = 0; //@line 4060
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 74; //@line 4062
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $4; //@line 4064
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $6; //@line 4066
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $9; //@line 4068
 HEAP32[$ReallocAsyncCtx4 + 16 >> 2] = $8; //@line 4070
 sp = STACKTOP; //@line 4071
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
 sp = STACKTOP; //@line 13388
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 13390
 $8 = $7 >> 8; //@line 13391
 if (!($7 & 1)) {
  $$0 = $8; //@line 13395
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 13400
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 13402
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 13405
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13410
 FUNCTION_TABLE_viiiiii[$17 & 7]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 13411
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 187; //@line 13414
  sp = STACKTOP; //@line 13415
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13418
  return;
 }
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13478
 STACKTOP = STACKTOP + 16 | 0; //@line 13479
 $3 = sp; //@line 13480
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 13482
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 13485
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 13486
 $8 = FUNCTION_TABLE_iiii[$7 & 15]($0, $1, $3) | 0; //@line 13487
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 189; //@line 13490
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 13492
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 13494
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 13496
  sp = STACKTOP; //@line 13497
  STACKTOP = sp; //@line 13498
  return 0; //@line 13498
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 13500
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 13504
 }
 STACKTOP = sp; //@line 13506
 return $8 & 1 | 0; //@line 13506
}
function __Znwj($0) {
 $0 = $0 | 0;
 var $$ = 0, $$lcssa = 0, $2 = 0, $4 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11671
 $$ = ($0 | 0) == 0 ? 1 : $0; //@line 11673
 while (1) {
  $2 = _malloc($$) | 0; //@line 11675
  if ($2 | 0) {
   $$lcssa = $2; //@line 11678
   label = 7; //@line 11679
   break;
  }
  $4 = __ZSt15get_new_handlerv() | 0; //@line 11682
  if (!$4) {
   $$lcssa = 0; //@line 11685
   label = 7; //@line 11686
   break;
  }
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 11689
  FUNCTION_TABLE_v[$4 & 3](); //@line 11690
  if (___async) {
   label = 5; //@line 11693
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11696
 }
 if ((label | 0) == 5) {
  HEAP32[$AsyncCtx >> 2] = 161; //@line 11699
  HEAP32[$AsyncCtx + 4 >> 2] = $$; //@line 11701
  sp = STACKTOP; //@line 11702
  return 0; //@line 11703
 } else if ((label | 0) == 7) {
  return $$lcssa | 0; //@line 11706
 }
 return 0; //@line 11708
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12558
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 12564
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 12567
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 12570
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 12571
   FUNCTION_TABLE_viiii[$11 & 7]($8, $1, $2, $3); //@line 12572
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 174; //@line 12575
    sp = STACKTOP; //@line 12576
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12579
    break;
   }
  }
 } while (0);
 return;
}
function __ZN4mbed10FileHandle4sizeEv__async_cb_21($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 493
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 497
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 499
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 501
 $10 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 16 >> 2] | 0; //@line 504
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 505
 FUNCTION_TABLE_iiii[$10 & 15]($4, $6, 0) | 0; //@line 506
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 91; //@line 509
  $11 = $ReallocAsyncCtx3 + 4 | 0; //@line 510
  HEAP32[$11 >> 2] = $AsyncRetVal; //@line 511
  sp = STACKTOP; //@line 512
  return;
 }
 ___async_unwind = 0; //@line 515
 HEAP32[$ReallocAsyncCtx3 >> 2] = 91; //@line 516
 $11 = $ReallocAsyncCtx3 + 4 | 0; //@line 517
 HEAP32[$11 >> 2] = $AsyncRetVal; //@line 518
 sp = STACKTOP; //@line 519
 return;
}
function _fclose__async_cb_26($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 782
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 784
 $4 = HEAP8[$0 + 8 >> 0] & 1; //@line 787
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 789
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 791
 $9 = HEAP32[$2 + 12 >> 2] | 0; //@line 793
 $ReallocAsyncCtx = _emscripten_realloc_async_context(20) | 0; //@line 794
 $10 = FUNCTION_TABLE_ii[$9 & 31]($2) | 0; //@line 795
 if (!___async) {
  HEAP32[___async_retval >> 2] = $10; //@line 799
  ___async_unwind = 0; //@line 800
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 143; //@line 802
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $AsyncRetVal; //@line 804
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $2; //@line 806
 HEAP8[$ReallocAsyncCtx + 12 >> 0] = $4 & 1; //@line 809
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 811
 sp = STACKTOP; //@line 812
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $13 = 0, $16 = 0, $6 = 0, $7 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13430
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 13432
 $7 = $6 >> 8; //@line 13433
 if (!($6 & 1)) {
  $$0 = $7; //@line 13437
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 13442
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 13444
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 13447
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13452
 FUNCTION_TABLE_viiiii[$16 & 7]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 13453
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 188; //@line 13456
  sp = STACKTOP; //@line 13457
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13460
  return;
 }
}
function __ZThn4_N4mbed6StreamD1Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $4 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2526
 $1 = $0 + -4 | 0; //@line 2527
 HEAP32[$1 >> 2] = 916; //@line 2528
 $2 = $1 + 4 | 0; //@line 2529
 HEAP32[$2 >> 2] = 1012; //@line 2530
 $4 = HEAP32[$1 + 20 >> 2] | 0; //@line 2532
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2533
 _fclose($4) | 0; //@line 2534
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 100; //@line 2537
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 2539
  sp = STACKTOP; //@line 2540
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2543
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2544
 __ZN4mbed8FileBaseD2Ev($2); //@line 2545
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 101; //@line 2548
  sp = STACKTOP; //@line 2549
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2552
  return;
 }
}
function __ZN11TextDisplay3clsEv__async_cb_71($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 4001
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4005
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4007
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4009
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4011
 if (($4 | 0) >= (Math_imul(HEAP32[___async_retval >> 2] | 0, HEAP32[$0 + 4 >> 2] | 0) | 0)) {
  return;
 }
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 4019
 __ZN4mbed6Stream4putcEi($6, 32) | 0; //@line 4020
 if (!___async) {
  ___async_unwind = 0; //@line 4023
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 73; //@line 4025
 HEAP32[$ReallocAsyncCtx6 + 4 >> 2] = $4; //@line 4027
 HEAP32[$ReallocAsyncCtx6 + 8 >> 2] = $8; //@line 4029
 HEAP32[$ReallocAsyncCtx6 + 12 >> 2] = $10; //@line 4031
 HEAP32[$ReallocAsyncCtx6 + 16 >> 2] = $6; //@line 4033
 sp = STACKTOP; //@line 4034
 return;
}
function ___dynamic_cast__async_cb_67($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3801
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3803
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3805
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3811
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 3826
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 3842
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 3847
    break;
   }
  default:
   {
    $$0 = 0; //@line 3851
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 3856
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13345
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 13347
 $6 = $5 >> 8; //@line 13348
 if (!($5 & 1)) {
  $$0 = $6; //@line 13352
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 13357
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 13359
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 13362
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13367
 FUNCTION_TABLE_viiii[$15 & 7]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 13368
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 186; //@line 13371
  sp = STACKTOP; //@line 13372
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13375
  return;
 }
}
function __ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb_81($0) {
 $0 = $0 | 0;
 var $2 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4903
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4905
 if ((HEAP32[443] | 0) == ($2 | 0)) {
  HEAP32[443] = 0; //@line 4909
 }
 if ((HEAP32[444] | 0) == ($2 | 0)) {
  HEAP32[444] = 0; //@line 4914
 }
 if ((HEAP32[445] | 0) == ($2 | 0)) {
  HEAP32[445] = 0; //@line 4919
 }
 $6 = HEAP32[2139] | 0; //@line 4921
 if (!$6) {
  HEAP32[2139] = 8560; //@line 4924
  return;
 }
 if (($6 | 0) == 8560) {
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 4931
 _mbed_assert_internal(5291, 5311, 93); //@line 4932
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 133; //@line 4935
  sp = STACKTOP; //@line 4936
  return;
 }
 ___async_unwind = 0; //@line 4939
 HEAP32[$ReallocAsyncCtx >> 2] = 133; //@line 4940
 sp = STACKTOP; //@line 4941
 return;
}
function __ZN15GraphicsDisplay3clsEv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1453
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1457
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1459
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1461
 $10 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 128 >> 2] | 0; //@line 1464
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 1465
 $11 = FUNCTION_TABLE_ii[$10 & 31]($4) | 0; //@line 1466
 if (!___async) {
  HEAP32[___async_retval >> 2] = $11; //@line 1470
  ___async_unwind = 0; //@line 1471
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 52; //@line 1473
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 1475
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $AsyncRetVal; //@line 1477
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 1479
 sp = STACKTOP; //@line 1480
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb_59($0) {
 $0 = $0 | 0;
 var $4 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3096
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3100
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3102
 $8 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 84 >> 2] | 0; //@line 3105
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 3106
 FUNCTION_TABLE_vi[$8 & 255]($4); //@line 3107
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 107; //@line 3110
  $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 3111
  HEAP32[$9 >> 2] = $AsyncRetVal; //@line 3112
  sp = STACKTOP; //@line 3113
  return;
 }
 ___async_unwind = 0; //@line 3116
 HEAP32[$ReallocAsyncCtx3 >> 2] = 107; //@line 3117
 $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 3118
 HEAP32[$9 >> 2] = $AsyncRetVal; //@line 3119
 sp = STACKTOP; //@line 3120
 return;
}
function __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb_27($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 830
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 834
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 836
 if (!(HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP32[$4 >> 2] = 0; //@line 839
 } else {
  HEAP32[$4 >> 2] = HEAP32[2136]; //@line 842
  HEAP32[2136] = $6; //@line 843
 }
 $9 = HEAP32[2137] | 0; //@line 845
 if (!$9) {
  HEAP32[2137] = 8552; //@line 848
  return;
 }
 if (($9 | 0) == 8552) {
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 855
 _mbed_assert_internal(5291, 5311, 93); //@line 856
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 86; //@line 859
  sp = STACKTOP; //@line 860
  return;
 }
 ___async_unwind = 0; //@line 863
 HEAP32[$ReallocAsyncCtx >> 2] = 86; //@line 864
 sp = STACKTOP; //@line 865
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_68($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3894
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3896
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3898
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3900
 $8 = HEAP32[(HEAP32[$2 >> 2] | 0) + 92 >> 2] | 0; //@line 3903
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 3904
 $9 = FUNCTION_TABLE_ii[$8 & 31]($4) | 0; //@line 3905
 if (!___async) {
  HEAP32[___async_retval >> 2] = $9; //@line 3909
  ___async_unwind = 0; //@line 3910
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 72; //@line 3912
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $AsyncRetVal; //@line 3914
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 3916
 HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $2; //@line 3918
 sp = STACKTOP; //@line 3919
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_45($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1873
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1877
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1879
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1881
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1883
 $13 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 84 >> 2] | 0; //@line 1886
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 1887
 FUNCTION_TABLE_vi[$13 & 255]($4); //@line 1888
 if (!___async) {
  ___async_unwind = 0; //@line 1891
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 111; //@line 1893
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $6; //@line 1895
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $8; //@line 1897
 HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $10; //@line 1899
 sp = STACKTOP; //@line 1900
 return;
}
function __ZN4mbed6StreamD2Ev($0) {
 $0 = $0 | 0;
 var $3 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2240
 HEAP32[$0 >> 2] = 916; //@line 2241
 HEAP32[$0 + 4 >> 2] = 1012; //@line 2243
 $3 = HEAP32[$0 + 20 >> 2] | 0; //@line 2245
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2246
 _fclose($3) | 0; //@line 2247
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 92; //@line 2250
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2252
  sp = STACKTOP; //@line 2253
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2256
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2258
 __ZN4mbed8FileBaseD2Ev($0 + 4 | 0); //@line 2259
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 93; //@line 2262
  sp = STACKTOP; //@line 2263
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2266
  return;
 }
}
function __ZN11TextDisplay3clsEv__async_cb_69($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 3925
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3929
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3931
 if ((Math_imul(HEAP32[___async_retval >> 2] | 0, HEAP32[$0 + 4 >> 2] | 0) | 0) <= 0) {
  return;
 }
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 3939
 __ZN4mbed6Stream4putcEi($4, 32) | 0; //@line 3940
 if (!___async) {
  ___async_unwind = 0; //@line 3943
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 73; //@line 3945
 HEAP32[$ReallocAsyncCtx6 + 4 >> 2] = 0; //@line 3947
 HEAP32[$ReallocAsyncCtx6 + 8 >> 2] = $6; //@line 3949
 HEAP32[$ReallocAsyncCtx6 + 12 >> 2] = $4; //@line 3951
 HEAP32[$ReallocAsyncCtx6 + 16 >> 2] = $4; //@line 3953
 sp = STACKTOP; //@line 3954
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 12111
 $5 = HEAP32[$4 >> 2] | 0; //@line 12112
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 12116
   HEAP32[$1 + 24 >> 2] = $3; //@line 12118
   HEAP32[$1 + 36 >> 2] = 1; //@line 12120
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 12124
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 12127
    HEAP32[$1 + 24 >> 2] = 2; //@line 12129
    HEAP8[$1 + 54 >> 0] = 1; //@line 12131
    break;
   }
   $10 = $1 + 24 | 0; //@line 12134
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 12138
   }
  }
 } while (0);
 return;
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 9839
 STACKTOP = STACKTOP + 256 | 0; //@line 9840
 $5 = sp; //@line 9841
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 9847
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 9851
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 9854
   $$011 = $9; //@line 9855
   do {
    _out_670($0, $5, 256); //@line 9857
    $$011 = $$011 + -256 | 0; //@line 9858
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 9867
  } else {
   $$0$lcssa = $9; //@line 9869
  }
  _out_670($0, $5, $$0$lcssa); //@line 9871
 }
 STACKTOP = sp; //@line 9873
 return;
}
function __ZN15GraphicsDisplay3clsEv__async_cb_38($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1486
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1488
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1490
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1492
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1494
 $10 = HEAPU16[$2 + 30 >> 1] | 0; //@line 1497
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 1498
 FUNCTION_TABLE_viiiiii[$6 & 7]($2, 0, 0, $4, $AsyncRetVal, $10); //@line 1499
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 53; //@line 1502
  sp = STACKTOP; //@line 1503
  return;
 }
 ___async_unwind = 0; //@line 1506
 HEAP32[$ReallocAsyncCtx3 >> 2] = 53; //@line 1507
 sp = STACKTOP; //@line 1508
 return;
}
function __ZN15GraphicsDisplayC2EPKc__async_cb_37($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1419
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1421
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1423
 HEAP32[$2 >> 2] = 504; //@line 1424
 HEAP32[$2 + 4 >> 2] = 664; //@line 1426
 __ZN11TextDisplay10foregroundEt($4, -1); //@line 1427
 $8 = HEAP32[(HEAP32[$2 >> 2] | 0) + 116 >> 2] | 0; //@line 1430
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 1431
 FUNCTION_TABLE_vii[$8 & 7]($4, 0); //@line 1432
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 63; //@line 1435
  sp = STACKTOP; //@line 1436
  return;
 }
 ___async_unwind = 0; //@line 1439
 HEAP32[$ReallocAsyncCtx >> 2] = 63; //@line 1440
 sp = STACKTOP; //@line 1441
 return;
}
function __ZN4mbed8FileBaseD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $7 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 871
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 873
 if (HEAP32[$2 + 12 >> 2] | 0) {
  __ZdlPv($2); //@line 878
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 882
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 883
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 84; //@line 886
  $7 = $ReallocAsyncCtx3 + 4 | 0; //@line 887
  HEAP32[$7 >> 2] = $2; //@line 888
  sp = STACKTOP; //@line 889
  return;
 }
 ___async_unwind = 0; //@line 892
 HEAP32[$ReallocAsyncCtx3 >> 2] = 84; //@line 893
 $7 = $ReallocAsyncCtx3 + 4 | 0; //@line 894
 HEAP32[$7 >> 2] = $2; //@line 895
 sp = STACKTOP; //@line 896
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 6804
 STACKTOP = STACKTOP + 32 | 0; //@line 6805
 $vararg_buffer = sp; //@line 6806
 $3 = sp + 20 | 0; //@line 6807
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 6811
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 6813
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 6815
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 6817
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 6819
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 6824
  $10 = -1; //@line 6825
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 6828
 }
 STACKTOP = sp; //@line 6830
 return $10 | 0; //@line 6830
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 2851
 STACKTOP = STACKTOP + 16 | 0; //@line 2852
 $vararg_buffer = sp; //@line 2853
 HEAP32[$vararg_buffer >> 2] = $0; //@line 2854
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 2856
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 2858
 _mbed_error_printf(5113, $vararg_buffer); //@line 2859
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2860
 _mbed_die(); //@line 2861
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 113; //@line 2864
  sp = STACKTOP; //@line 2865
  STACKTOP = sp; //@line 2866
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2868
  STACKTOP = sp; //@line 2869
  return;
 }
}
function __Znwj__async_cb($0) {
 $0 = $0 | 0;
 var $$lcssa = 0, $2 = 0, $3 = 0, $5 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4864
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4866
 $3 = _malloc($2) | 0; //@line 4867
 if (!$3) {
  $5 = __ZSt15get_new_handlerv() | 0; //@line 4870
  if (!$5) {
   $$lcssa = 0; //@line 4873
  } else {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 4875
   FUNCTION_TABLE_v[$5 & 3](); //@line 4876
   if (!___async) {
    ___async_unwind = 0; //@line 4879
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 161; //@line 4881
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 4883
   sp = STACKTOP; //@line 4884
   return;
  }
 } else {
  $$lcssa = $3; //@line 4888
 }
 HEAP32[___async_retval >> 2] = $$lcssa; //@line 4891
 return;
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 6985
 $3 = HEAP8[$1 >> 0] | 0; //@line 6986
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 6991
  $$lcssa8 = $2; //@line 6991
 } else {
  $$011 = $1; //@line 6993
  $$0710 = $0; //@line 6993
  do {
   $$0710 = $$0710 + 1 | 0; //@line 6995
   $$011 = $$011 + 1 | 0; //@line 6996
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 6997
   $9 = HEAP8[$$011 >> 0] | 0; //@line 6998
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 7003
  $$lcssa8 = $8; //@line 7003
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 7013
}
function _mbed_die__async_cb_15($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 14067
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14069
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 14071
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 14072
 _wait_ms(150); //@line 14073
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 116; //@line 14076
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 14077
  HEAP32[$4 >> 2] = $2; //@line 14078
  sp = STACKTOP; //@line 14079
  return;
 }
 ___async_unwind = 0; //@line 14082
 HEAP32[$ReallocAsyncCtx14 >> 2] = 116; //@line 14083
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 14084
 HEAP32[$4 >> 2] = $2; //@line 14085
 sp = STACKTOP; //@line 14086
 return;
}
function _mbed_die__async_cb_14($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 14042
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14044
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 14046
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 14047
 _wait_ms(150); //@line 14048
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 117; //@line 14051
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 14052
  HEAP32[$4 >> 2] = $2; //@line 14053
  sp = STACKTOP; //@line 14054
  return;
 }
 ___async_unwind = 0; //@line 14057
 HEAP32[$ReallocAsyncCtx13 >> 2] = 117; //@line 14058
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 14059
 HEAP32[$4 >> 2] = $2; //@line 14060
 sp = STACKTOP; //@line 14061
 return;
}
function _mbed_die__async_cb_13($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 14017
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14019
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 14021
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 14022
 _wait_ms(150); //@line 14023
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 118; //@line 14026
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 14027
  HEAP32[$4 >> 2] = $2; //@line 14028
  sp = STACKTOP; //@line 14029
  return;
 }
 ___async_unwind = 0; //@line 14032
 HEAP32[$ReallocAsyncCtx12 >> 2] = 118; //@line 14033
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 14034
 HEAP32[$4 >> 2] = $2; //@line 14035
 sp = STACKTOP; //@line 14036
 return;
}
function _mbed_die__async_cb_12($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 13992
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13994
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13996
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 13997
 _wait_ms(150); //@line 13998
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 119; //@line 14001
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 14002
  HEAP32[$4 >> 2] = $2; //@line 14003
  sp = STACKTOP; //@line 14004
  return;
 }
 ___async_unwind = 0; //@line 14007
 HEAP32[$ReallocAsyncCtx11 >> 2] = 119; //@line 14008
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 14009
 HEAP32[$4 >> 2] = $2; //@line 14010
 sp = STACKTOP; //@line 14011
 return;
}
function _mbed_die__async_cb_11($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 13967
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13969
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13971
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 13972
 _wait_ms(150); //@line 13973
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 120; //@line 13976
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 13977
  HEAP32[$4 >> 2] = $2; //@line 13978
  sp = STACKTOP; //@line 13979
  return;
 }
 ___async_unwind = 0; //@line 13982
 HEAP32[$ReallocAsyncCtx10 >> 2] = 120; //@line 13983
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 13984
 HEAP32[$4 >> 2] = $2; //@line 13985
 sp = STACKTOP; //@line 13986
 return;
}
function _mbed_die__async_cb_10($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 13942
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13944
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13946
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 13947
 _wait_ms(150); //@line 13948
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 121; //@line 13951
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 13952
  HEAP32[$4 >> 2] = $2; //@line 13953
  sp = STACKTOP; //@line 13954
  return;
 }
 ___async_unwind = 0; //@line 13957
 HEAP32[$ReallocAsyncCtx9 >> 2] = 121; //@line 13958
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 13959
 HEAP32[$4 >> 2] = $2; //@line 13960
 sp = STACKTOP; //@line 13961
 return;
}
function _mbed_die__async_cb_9($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 13917
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13919
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13921
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 13922
 _wait_ms(400); //@line 13923
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 122; //@line 13926
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 13927
  HEAP32[$4 >> 2] = $2; //@line 13928
  sp = STACKTOP; //@line 13929
  return;
 }
 ___async_unwind = 0; //@line 13932
 HEAP32[$ReallocAsyncCtx8 >> 2] = 122; //@line 13933
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 13934
 HEAP32[$4 >> 2] = $2; //@line 13935
 sp = STACKTOP; //@line 13936
 return;
}
function _mbed_die__async_cb_8($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 13892
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13894
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13896
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 13897
 _wait_ms(400); //@line 13898
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 123; //@line 13901
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 13902
  HEAP32[$4 >> 2] = $2; //@line 13903
  sp = STACKTOP; //@line 13904
  return;
 }
 ___async_unwind = 0; //@line 13907
 HEAP32[$ReallocAsyncCtx7 >> 2] = 123; //@line 13908
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 13909
 HEAP32[$4 >> 2] = $2; //@line 13910
 sp = STACKTOP; //@line 13911
 return;
}
function _mbed_die__async_cb_7($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 13867
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13869
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13871
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 13872
 _wait_ms(400); //@line 13873
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 124; //@line 13876
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 13877
  HEAP32[$4 >> 2] = $2; //@line 13878
  sp = STACKTOP; //@line 13879
  return;
 }
 ___async_unwind = 0; //@line 13882
 HEAP32[$ReallocAsyncCtx6 >> 2] = 124; //@line 13883
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 13884
 HEAP32[$4 >> 2] = $2; //@line 13885
 sp = STACKTOP; //@line 13886
 return;
}
function _mbed_die__async_cb_6($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 13842
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13844
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13846
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 13847
 _wait_ms(400); //@line 13848
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 125; //@line 13851
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 13852
  HEAP32[$4 >> 2] = $2; //@line 13853
  sp = STACKTOP; //@line 13854
  return;
 }
 ___async_unwind = 0; //@line 13857
 HEAP32[$ReallocAsyncCtx5 >> 2] = 125; //@line 13858
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 13859
 HEAP32[$4 >> 2] = $2; //@line 13860
 sp = STACKTOP; //@line 13861
 return;
}
function _mbed_die__async_cb_5($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 13817
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13819
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13821
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 13822
 _wait_ms(400); //@line 13823
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 126; //@line 13826
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 13827
  HEAP32[$4 >> 2] = $2; //@line 13828
  sp = STACKTOP; //@line 13829
  return;
 }
 ___async_unwind = 0; //@line 13832
 HEAP32[$ReallocAsyncCtx4 >> 2] = 126; //@line 13833
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 13834
 HEAP32[$4 >> 2] = $2; //@line 13835
 sp = STACKTOP; //@line 13836
 return;
}
function _mbed_die__async_cb_4($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13792
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13794
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13796
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 13797
 _wait_ms(400); //@line 13798
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 127; //@line 13801
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 13802
  HEAP32[$4 >> 2] = $2; //@line 13803
  sp = STACKTOP; //@line 13804
  return;
 }
 ___async_unwind = 0; //@line 13807
 HEAP32[$ReallocAsyncCtx3 >> 2] = 127; //@line 13808
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 13809
 HEAP32[$4 >> 2] = $2; //@line 13810
 sp = STACKTOP; //@line 13811
 return;
}
function _mbed_die__async_cb_3($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13767
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13769
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13771
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 13772
 _wait_ms(400); //@line 13773
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 128; //@line 13776
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 13777
  HEAP32[$4 >> 2] = $2; //@line 13778
  sp = STACKTOP; //@line 13779
  return;
 }
 ___async_unwind = 0; //@line 13782
 HEAP32[$ReallocAsyncCtx2 >> 2] = 128; //@line 13783
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 13784
 HEAP32[$4 >> 2] = $2; //@line 13785
 sp = STACKTOP; //@line 13786
 return;
}
function _mbed_die__async_cb_2($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13742
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13744
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13746
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 13747
 _wait_ms(400); //@line 13748
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 129; //@line 13751
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 13752
  HEAP32[$4 >> 2] = $2; //@line 13753
  sp = STACKTOP; //@line 13754
  return;
 }
 ___async_unwind = 0; //@line 13757
 HEAP32[$ReallocAsyncCtx >> 2] = 129; //@line 13758
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 13759
 HEAP32[$4 >> 2] = $2; //@line 13760
 sp = STACKTOP; //@line 13761
 return;
}
function _sprintf($0, $1, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $varargs = $varargs | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11180
 STACKTOP = STACKTOP + 16 | 0; //@line 11181
 $2 = sp; //@line 11182
 HEAP32[$2 >> 2] = $varargs; //@line 11183
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 11184
 $3 = _vsprintf($0, $1, $2) | 0; //@line 11185
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 152; //@line 11188
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 11190
  sp = STACKTOP; //@line 11191
  STACKTOP = sp; //@line 11192
  return 0; //@line 11192
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11194
  STACKTOP = sp; //@line 11195
  return $3 | 0; //@line 11195
 }
 return 0; //@line 11197
}
function __ZN4mbed6Stream4putcEi__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 3068
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3070
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3072
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3074
 $8 = HEAP32[$2 + 20 >> 2] | 0; //@line 3076
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 3077
 _fflush($8) | 0; //@line 3078
 if (!___async) {
  ___async_unwind = 0; //@line 3081
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 105; //@line 3083
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $2; //@line 3085
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $4; //@line 3087
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $6; //@line 3089
 sp = STACKTOP; //@line 3090
 return;
}
function __GLOBAL__sub_I_main_cpp() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3449
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3450
 __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc(8564, 9, 7, 8, 6, 18, 5399); //@line 3451
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 138; //@line 3454
  sp = STACKTOP; //@line 3455
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3458
  __ZN5Sht31C2E7PinNameS0_(13361, 10, 11); //@line 3459
  HEAP32[3187] = 0; //@line 3460
  HEAP32[3188] = 0; //@line 3460
  HEAP32[3189] = 0; //@line 3460
  HEAP32[3190] = 0; //@line 3460
  HEAP32[3191] = 0; //@line 3460
  HEAP32[3192] = 0; //@line 3460
  _gpio_init_out(12748, 50); //@line 3461
  return;
 }
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 5405
 newDynamicTop = oldDynamicTop + increment | 0; //@line 5406
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 5410
  ___setErrNo(12); //@line 5411
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 5415
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 5419
   ___setErrNo(12); //@line 5420
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 5424
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 12661
 STACKTOP = STACKTOP + 16 | 0; //@line 12662
 $vararg_buffer = sp; //@line 12663
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 12664
 FUNCTION_TABLE_v[$0 & 3](); //@line 12665
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 176; //@line 12668
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 12670
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 12672
  sp = STACKTOP; //@line 12673
  STACKTOP = sp; //@line 12674
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 12676
  _abort_message(8396, $vararg_buffer); //@line 12677
 }
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 7108
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 7110
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 7116
  $11 = ___fwritex($0, $4, $3) | 0; //@line 7117
  if ($phitmp) {
   $13 = $11; //@line 7119
  } else {
   ___unlockfile($3); //@line 7121
   $13 = $11; //@line 7122
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 7126
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 7130
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 7133
 }
 return $15 | 0; //@line 7135
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 9700
 } else {
  $$056 = $2; //@line 9702
  $15 = $1; //@line 9702
  $8 = $0; //@line 9702
  while (1) {
   $14 = $$056 + -1 | 0; //@line 9710
   HEAP8[$14 >> 0] = HEAPU8[6059 + ($8 & 15) >> 0] | 0 | $3; //@line 9711
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 9712
   $15 = tempRet0; //@line 9713
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 9718
    break;
   } else {
    $$056 = $14; //@line 9721
   }
  }
 }
 return $$05$lcssa | 0; //@line 9725
}
function __ZSt9terminatev() {
 var $0 = 0, $16 = 0, $17 = 0, $2 = 0, $5 = 0, sp = 0;
 sp = STACKTOP; //@line 12626
 $0 = ___cxa_get_globals_fast() | 0; //@line 12627
 if ($0 | 0) {
  $2 = HEAP32[$0 >> 2] | 0; //@line 12630
  if ($2 | 0) {
   $5 = $2 + 48 | 0; //@line 12634
   if ((HEAP32[$5 >> 2] & -256 | 0) == 1126902528 ? (HEAP32[$5 + 4 >> 2] | 0) == 1129074247 : 0) {
    $16 = HEAP32[$2 + 12 >> 2] | 0; //@line 12646
    _emscripten_alloc_async_context(4, sp) | 0; //@line 12647
    __ZSt11__terminatePFvvE($16); //@line 12648
   }
  }
 }
 $17 = __ZSt13get_terminatev() | 0; //@line 12653
 _emscripten_alloc_async_context(4, sp) | 0; //@line 12654
 __ZSt11__terminatePFvvE($17); //@line 12655
}
function __ZN15GraphicsDisplay4putpEi__async_cb($0) {
 $0 = $0 | 0;
 var $15 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3268
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3270
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3272
 $8 = (HEAP16[$2 >> 1] | 0) + 1 << 16 >> 16; //@line 3274
 HEAP16[$2 >> 1] = $8; //@line 3275
 if ($8 << 16 >> 16 <= (HEAP16[$4 + 42 >> 1] | 0)) {
  return;
 }
 HEAP16[$2 >> 1] = HEAP16[$4 + 40 >> 1] | 0; //@line 3284
 $15 = (HEAP16[$6 >> 1] | 0) + 1 << 16 >> 16; //@line 3286
 HEAP16[$6 >> 1] = $15; //@line 3287
 if ($15 << 16 >> 16 <= (HEAP16[$4 + 46 >> 1] | 0)) {
  return;
 }
 HEAP16[$6 >> 1] = HEAP16[$4 + 44 >> 1] | 0; //@line 3296
 return;
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 6937
 STACKTOP = STACKTOP + 32 | 0; //@line 6938
 $vararg_buffer = sp; //@line 6939
 HEAP32[$0 + 36 >> 2] = 5; //@line 6942
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 6950
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 6952
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 6954
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 6959
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 6962
 STACKTOP = sp; //@line 6963
 return $14 | 0; //@line 6963
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 7263
 $3 = HEAP8[$1 >> 0] | 0; //@line 7265
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 7269
 $7 = HEAP32[$0 >> 2] | 0; //@line 7270
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 7275
  HEAP32[$0 + 4 >> 2] = 0; //@line 7277
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 7279
  HEAP32[$0 + 28 >> 2] = $14; //@line 7281
  HEAP32[$0 + 20 >> 2] = $14; //@line 7283
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 7289
  $$0 = 0; //@line 7290
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 7293
  $$0 = -1; //@line 7294
 }
 return $$0 | 0; //@line 7296
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
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 9737
 } else {
  $$06 = $2; //@line 9739
  $11 = $1; //@line 9739
  $7 = $0; //@line 9739
  while (1) {
   $10 = $$06 + -1 | 0; //@line 9744
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 9745
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 9746
   $11 = tempRet0; //@line 9747
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 9752
    break;
   } else {
    $$06 = $10; //@line 9755
   }
  }
 }
 return $$0$lcssa | 0; //@line 9759
}
function ___fmodeflags($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$0$ = 0, $$2 = 0, $$2$ = 0, $$4 = 0, $2 = 0, $3 = 0, $6 = 0, $9 = 0;
 $2 = (_strchr($0, 43) | 0) == 0; //@line 7607
 $3 = HEAP8[$0 >> 0] | 0; //@line 7608
 $$0 = $2 ? $3 << 24 >> 24 != 114 & 1 : 2; //@line 7611
 $6 = (_strchr($0, 120) | 0) == 0; //@line 7613
 $$0$ = $6 ? $$0 : $$0 | 128; //@line 7615
 $9 = (_strchr($0, 101) | 0) == 0; //@line 7617
 $$2 = $9 ? $$0$ : $$0$ | 524288; //@line 7619
 $$2$ = $3 << 24 >> 24 == 114 ? $$2 : $$2 | 64; //@line 7622
 $$4 = $3 << 24 >> 24 == 119 ? $$2$ | 512 : $$2$; //@line 7625
 return ($3 << 24 >> 24 == 97 ? $$4 | 1024 : $$4) | 0; //@line 7629
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13511
 do {
  if (!$0) {
   $3 = 0; //@line 13515
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13517
   $2 = ___dynamic_cast($0, 232, 288, 0) | 0; //@line 13518
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 190; //@line 13521
    sp = STACKTOP; //@line 13522
    return 0; //@line 13523
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 13525
    $3 = ($2 | 0) != 0 & 1; //@line 13528
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 13533
}
function _invoke_ticker__async_cb_44($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1798
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 1804
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 1805
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 1806
 FUNCTION_TABLE_vi[$5 & 255]($6); //@line 1807
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 131; //@line 1810
  sp = STACKTOP; //@line 1811
  return;
 }
 ___async_unwind = 0; //@line 1814
 HEAP32[$ReallocAsyncCtx >> 2] = 131; //@line 1815
 sp = STACKTOP; //@line 1816
 return;
}
function __ZN4mbed8FileBaseD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 618
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 620
 if (HEAP32[$2 + 12 >> 2] | 0) {
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 628
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 629
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 81; //@line 632
  sp = STACKTOP; //@line 633
  return;
 }
 ___async_unwind = 0; //@line 636
 HEAP32[$ReallocAsyncCtx3 >> 2] = 81; //@line 637
 sp = STACKTOP; //@line 638
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 9381
 } else {
  $$04 = 0; //@line 9383
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 9386
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 9390
   $12 = $7 + 1 | 0; //@line 9391
   HEAP32[$0 >> 2] = $12; //@line 9392
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 9398
    break;
   } else {
    $$04 = $11; //@line 9401
   }
  }
 }
 return $$0$lcssa | 0; //@line 9405
}
function __ZN15GraphicsDisplay9characterEiii($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 834
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 148 >> 2] | 0; //@line 837
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 842
 FUNCTION_TABLE_viiiiii[$6 & 7]($0, $1 << 3, $2 << 3, 8, 8, 3770 + ($3 + -31 << 3) | 0); //@line 843
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 48; //@line 846
  sp = STACKTOP; //@line 847
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 850
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
function __ZN4mbed10FileHandle4tellEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2140
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 2143
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2144
 $4 = FUNCTION_TABLE_iiii[$3 & 15]($0, 0, 1) | 0; //@line 2145
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 87; //@line 2148
  sp = STACKTOP; //@line 2149
  return 0; //@line 2150
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2152
  return $4 | 0; //@line 2153
 }
 return 0; //@line 2155
}
function __ZN15GraphicsDisplay7columnsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 878
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 124 >> 2] | 0; //@line 881
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 882
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 883
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 50; //@line 886
  sp = STACKTOP; //@line 887
  return 0; //@line 888
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 890
  return ($4 | 0) / 8 | 0 | 0; //@line 892
 }
 return 0; //@line 894
}
function __ZN15GraphicsDisplay4rowsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 857
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 860
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 861
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 862
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 49; //@line 865
  sp = STACKTOP; //@line 866
  return 0; //@line 867
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 869
  return ($4 | 0) / 8 | 0 | 0; //@line 871
 }
 return 0; //@line 873
}
function _mbed_die__async_cb_16($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 14092
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14094
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 14096
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 14097
 _wait_ms(150); //@line 14098
 if (!___async) {
  ___async_unwind = 0; //@line 14101
 }
 HEAP32[$ReallocAsyncCtx15 >> 2] = 115; //@line 14103
 HEAP32[$ReallocAsyncCtx15 + 4 >> 2] = $2; //@line 14105
 sp = STACKTOP; //@line 14106
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 13722
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13724
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13726
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 13727
 _wait_ms(150); //@line 13728
 if (!___async) {
  ___async_unwind = 0; //@line 13731
 }
 HEAP32[$ReallocAsyncCtx16 >> 2] = 114; //@line 13733
 HEAP32[$ReallocAsyncCtx16 + 4 >> 2] = $2; //@line 13735
 sp = STACKTOP; //@line 13736
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
function ___fflush_unlocked__async_cb_17($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14188
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14190
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14192
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 14194
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 14196
 HEAP32[$4 >> 2] = 0; //@line 14197
 HEAP32[$6 >> 2] = 0; //@line 14198
 HEAP32[$8 >> 2] = 0; //@line 14199
 HEAP32[$10 >> 2] = 0; //@line 14200
 HEAP32[___async_retval >> 2] = 0; //@line 14202
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
function _fclose__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 751
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 754
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 756
 $10 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 759
 $12 = HEAP32[$4 + 92 >> 2] | 0; //@line 761
 if ($12 | 0) {
  _free($12); //@line 764
 }
 if ($6) {
  if ($8 | 0) {
   ___unlockfile($4); //@line 769
  }
 } else {
  _free($4); //@line 772
 }
 HEAP32[___async_retval >> 2] = $10; //@line 775
 return;
}
function __ZN4mbed6StreamD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1261
 $3 = (HEAP32[$0 + 4 >> 2] | 0) + 4 | 0; //@line 1264
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 1265
 __ZN4mbed8FileBaseD2Ev($3); //@line 1266
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 93; //@line 1269
  sp = STACKTOP; //@line 1270
  return;
 }
 ___async_unwind = 0; //@line 1273
 HEAP32[$ReallocAsyncCtx2 >> 2] = 93; //@line 1274
 sp = STACKTOP; //@line 1275
 return;
}
function __ZN6C128325_putcEi__async_cb($0) {
 $0 = $0 | 0;
 var $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2288
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2290
 if ((HEAP32[$0 + 8 >> 2] | 0) >>> 0 < ((HEAP32[___async_retval >> 2] | 0) - (HEAPU8[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 2 >> 0] | 0) | 0) >>> 0) {
  $16 = ___async_retval; //@line 2300
  HEAP32[$16 >> 2] = $6; //@line 2301
  return;
 }
 HEAP32[$8 >> 2] = 0; //@line 2304
 $16 = ___async_retval; //@line 2305
 HEAP32[$16 >> 2] = $6; //@line 2306
 return;
}
function __ZThn4_N4mbed6StreamD1Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4678
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4680
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 4681
 __ZN4mbed8FileBaseD2Ev($2); //@line 4682
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 101; //@line 4685
  sp = STACKTOP; //@line 4686
  return;
 }
 ___async_unwind = 0; //@line 4689
 HEAP32[$ReallocAsyncCtx2 >> 2] = 101; //@line 4690
 sp = STACKTOP; //@line 4691
 return;
}
function __ZN6C128325_putcEi__async_cb_52($0) {
 $0 = $0 | 0;
 var $16 = 0, $2 = 0, $4 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2314
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2316
 if (!(HEAP32[$2 + 4168 >> 2] | 0)) {
  $16 = ___async_retval; //@line 2321
  HEAP32[$16 >> 2] = $4; //@line 2322
  return;
 }
 _emscripten_asm_const_iiiii(0, HEAP32[$2 + 4172 >> 2] | 0, HEAP32[$2 + 4176 >> 2] | 0, HEAP32[$2 + 4180 >> 2] | 0, $2 + 68 | 0) | 0; //@line 2332
 $16 = ___async_retval; //@line 2333
 HEAP32[$16 >> 2] = $4; //@line 2334
 return;
}
function _vsprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11204
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11205
 $3 = _vsnprintf($0, 2147483647, $1, $2) | 0; //@line 11206
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 153; //@line 11209
  sp = STACKTOP; //@line 11210
  return 0; //@line 11211
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11213
  return $3 | 0; //@line 11214
 }
 return 0; //@line 11216
}
function ___unlist_locked_file($0) {
 $0 = $0 | 0;
 var $$pre = 0, $$sink = 0, $10 = 0, $5 = 0;
 if (HEAP32[$0 + 68 >> 2] | 0) {
  $5 = HEAP32[$0 + 116 >> 2] | 0; //@line 7146
  $$pre = $0 + 112 | 0; //@line 7149
  if ($5 | 0) {
   HEAP32[$5 + 112 >> 2] = HEAP32[$$pre >> 2]; //@line 7153
  }
  $10 = HEAP32[$$pre >> 2] | 0; //@line 7155
  if (!$10) {
   $$sink = (___pthread_self_699() | 0) + 232 | 0; //@line 7160
  } else {
   $$sink = $10 + 116 | 0; //@line 7163
  }
  HEAP32[$$sink >> 2] = $5; //@line 7165
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
function __ZN4mbed6StreamC2EPKc__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0, $AsyncRetVal = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3200
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3204
 HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = $AsyncRetVal; //@line 3205
 if (!$AsyncRetVal) {
  HEAP32[$4 >> 2] = HEAP32[(___errno_location() | 0) >> 2]; //@line 3210
  _error(5082, $4); //@line 3211
  return;
 } else {
  __ZN4mbed26mbed_set_unbuffered_streamEP8_IO_FILE($AsyncRetVal); //@line 3214
  return;
 }
}
function __ZN4mbed10FileHandle6rewindEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2160
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 2163
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2164
 FUNCTION_TABLE_iiii[$3 & 15]($0, 0, 0) | 0; //@line 2165
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 88; //@line 2168
  sp = STACKTOP; //@line 2169
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2172
  return;
 }
}
function _emscripten_async_resume() {
 ___async = 0; //@line 5256
 ___async_unwind = 1; //@line 5257
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 5263
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 5267
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 5271
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 5273
 }
}
function __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1707
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1709
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1711
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1713
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 48 >> 2] = 1942; //@line 1715
 _emscripten_asm_const_iiiii(0, HEAP32[$4 >> 2] | 0, HEAP32[$6 >> 2] | 0, HEAP32[$8 >> 2] | 0, $10 | 0) | 0; //@line 1719
 return;
}
function __ZN15GraphicsDisplay6windowEiiii($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $5 = 0, $7 = 0;
 $5 = $1 & 65535; //@line 962
 HEAP16[$0 + 36 >> 1] = $5; //@line 964
 $7 = $2 & 65535; //@line 965
 HEAP16[$0 + 38 >> 1] = $7; //@line 967
 HEAP16[$0 + 40 >> 1] = $5; //@line 969
 HEAP16[$0 + 42 >> 1] = $1 + 65535 + $3; //@line 974
 HEAP16[$0 + 44 >> 1] = $7; //@line 976
 HEAP16[$0 + 46 >> 1] = $2 + 65535 + $4; //@line 981
 return;
}
function _freopen__async_cb_41($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1663
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1665
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 1666
 _fclose($2) | 0; //@line 1667
 if (!___async) {
  ___async_unwind = 0; //@line 1670
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 157; //@line 1672
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 1674
 sp = STACKTOP; //@line 1675
 return;
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 5199
 STACKTOP = STACKTOP + 16 | 0; //@line 5200
 $rem = __stackBase__ | 0; //@line 5201
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 5202
 STACKTOP = __stackBase__; //@line 5203
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 5204
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 4969
 if ((ret | 0) < 8) return ret | 0; //@line 4970
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 4971
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 4972
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 4973
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 4974
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 4975
}
function __Znaj($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11713
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11714
 $1 = __Znwj($0) | 0; //@line 11715
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 162; //@line 11718
  sp = STACKTOP; //@line 11719
  return 0; //@line 11720
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11722
  return $1 | 0; //@line 11723
 }
 return 0; //@line 11725
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
 sp = STACKTOP; //@line 3347
 do {
  if ($0 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3351
   _mbed_die(); //@line 3352
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 134; //@line 3355
    sp = STACKTOP; //@line 3356
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 3359
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
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 12015
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
 $5 = $0 + 20 | 0; //@line 11163
 $6 = HEAP32[$5 >> 2] | 0; //@line 11164
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 11165
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 11167
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 11169
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 11172
 return $2 | 0; //@line 11173
}
function __ZL25default_terminate_handlerv__async_cb_65($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3666
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3668
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3670
 HEAP32[$2 >> 2] = 8105; //@line 3671
 HEAP32[$2 + 4 >> 2] = $4; //@line 3673
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 3675
 _abort_message(7969, $2); //@line 3676
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4655
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4657
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 4658
 _fputc(10, $2) | 0; //@line 4659
 if (!___async) {
  ___async_unwind = 0; //@line 4662
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 166; //@line 4664
 sp = STACKTOP; //@line 4665
 return;
}
function _setvbuf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $4 = 0;
 $4 = $0 + 75 | 0; //@line 11485
 HEAP8[$4 >> 0] = -1; //@line 11486
 switch ($2 | 0) {
 case 2:
  {
   HEAP32[$0 + 48 >> 2] = 0; //@line 11490
   break;
  }
 case 1:
  {
   HEAP8[$4 >> 0] = 10; //@line 11494
   break;
  }
 default:
  {}
 }
 HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 64; //@line 11502
 return 0; //@line 11503
}
function __ZN11TextDisplayC2EPKc__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $AsyncRetVal = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3686
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3688
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3692
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 32 >> 2] = $AsyncRetVal; //@line 3694
 HEAP32[$4 >> 2] = $6; //@line 3695
 _sprintf($AsyncRetVal, 4707, $4) | 0; //@line 3696
 return;
}
function __ZThn4_N15GraphicsDisplayD1Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1291
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1293
 __ZN4mbed6StreamD2Ev($0 + -4 | 0); //@line 1294
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 61; //@line 1297
  sp = STACKTOP; //@line 1298
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1301
  return;
 }
}
function __ZThn4_N11TextDisplayD1Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1723
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1725
 __ZN4mbed6StreamD2Ev($0 + -4 | 0); //@line 1726
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 76; //@line 1729
  sp = STACKTOP; //@line 1730
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1733
  return;
 }
}
function _wait($0) {
 $0 = +$0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3415
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3419
 _emscripten_sleep((~~($0 * 1.0e6) | 0) / 1e3 | 0 | 0); //@line 3420
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 136; //@line 3423
  sp = STACKTOP; //@line 3424
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3427
  return;
 }
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4313
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 4316
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 4321
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 4324
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2442
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 2453
  $$0 = 1; //@line 2454
 } else {
  $$0 = 0; //@line 2456
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 2460
 return;
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 6674
 STACKTOP = STACKTOP + 16 | 0; //@line 6675
 $vararg_buffer = sp; //@line 6676
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 6680
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 6682
 STACKTOP = sp; //@line 6683
 return $5 | 0; //@line 6683
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
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 12091
 }
 return;
}
function _error($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var sp = 0;
 sp = STACKTOP; //@line 3193
 STACKTOP = STACKTOP + 16 | 0; //@line 3194
 if (!(HEAP8[13360] | 0)) {
  HEAP8[13360] = 1; //@line 3199
  HEAP32[sp >> 2] = $varargs; //@line 3200
  _emscripten_alloc_async_context(4, sp) | 0; //@line 3201
  _exit(1); //@line 3202
 } else {
  STACKTOP = sp; //@line 3205
  return;
 }
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3434
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3435
 _emscripten_sleep($0 | 0); //@line 3436
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 137; //@line 3439
  sp = STACKTOP; //@line 3440
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3443
  return;
 }
}
function ___cxa_get_globals_fast() {
 var $3 = 0, sp = 0;
 sp = STACKTOP; //@line 11847
 STACKTOP = STACKTOP + 16 | 0; //@line 11848
 if (!(_pthread_once(13348, 3) | 0)) {
  $3 = _pthread_getspecific(HEAP32[3338] | 0) | 0; //@line 11854
  STACKTOP = sp; //@line 11855
  return $3 | 0; //@line 11855
 } else {
  _abort_message(8244, sp); //@line 11857
 }
 return 0; //@line 11860
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 12155
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 12159
  }
 }
 return;
}
function __GLOBAL__sub_I_main_cpp__async_cb($0) {
 $0 = $0 | 0;
 __ZN5Sht31C2E7PinNameS0_(13361, 10, 11); //@line 4387
 HEAP32[3187] = 0; //@line 4388
 HEAP32[3188] = 0; //@line 4388
 HEAP32[3189] = 0; //@line 4388
 HEAP32[3190] = 0; //@line 4388
 HEAP32[3191] = 0; //@line 4388
 HEAP32[3192] = 0; //@line 4388
 _gpio_init_out(12748, 50); //@line 4389
 return;
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 5233
 HEAP32[new_frame + 4 >> 2] = sp; //@line 5235
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 5237
 ___async_cur_frame = new_frame; //@line 5238
 return ___async_cur_frame + 8 | 0; //@line 5239
}
function ___ofl_add($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0;
 $1 = ___ofl_lock() | 0; //@line 7751
 HEAP32[$0 + 56 >> 2] = HEAP32[$1 >> 2]; //@line 7754
 $4 = HEAP32[$1 >> 2] | 0; //@line 7755
 if ($4 | 0) {
  HEAP32[$4 + 52 >> 2] = $0; //@line 7759
 }
 HEAP32[$1 >> 2] = $0; //@line 7761
 ___ofl_unlock(); //@line 7762
 return $0 | 0; //@line 7763
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 12609
 STACKTOP = STACKTOP + 16 | 0; //@line 12610
 _free($0); //@line 12612
 if (!(_pthread_setspecific(HEAP32[3338] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 12617
  return;
 } else {
  _abort_message(8343, sp); //@line 12619
 }
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 3055
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 3059
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 3062
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 5222
  return low << bits; //@line 5223
 }
 tempRet0 = low << bits - 32; //@line 5225
 return 0; //@line 5226
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 5211
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 5212
 }
 tempRet0 = 0; //@line 5214
 return high >>> bits - 32 | 0; //@line 5215
}
function __ZN11TextDisplay5_putcEi__async_cb_51($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2266
 if ((HEAP32[___async_retval >> 2] | 0) <= (HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP16[HEAP32[$0 + 12 >> 2] >> 1] = 0; //@line 2273
 }
 HEAP32[___async_retval >> 2] = $4; //@line 2276
 return;
}
function __ZN11TextDisplay5_putcEi__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2142
 if ((HEAP32[___async_retval >> 2] | 0) <= (HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP16[HEAP32[$0 + 12 >> 2] >> 1] = 0; //@line 2149
 }
 HEAP32[___async_retval >> 2] = $4; //@line 2152
 return;
}
function _fflush__async_cb_31($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1105
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 1107
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 1110
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var sp = 0;
 sp = STACKTOP; //@line 12594
 STACKTOP = STACKTOP + 16 | 0; //@line 12595
 if (!(_pthread_key_create(13352, 175) | 0)) {
  STACKTOP = sp; //@line 12600
  return;
 } else {
  _abort_message(8293, sp); //@line 12602
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
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 4349
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 4352
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 4355
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 13711
 } else {
  $$0 = -1; //@line 13713
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 13716
 return;
}
function __ZN4mbed6fdopenEPNS_10FileHandleEPKc__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3176
 if (HEAP32[___async_retval >> 2] | 0) {
  _setbuf($4, 0); //@line 3181
 }
 HEAP32[___async_retval >> 2] = $4; //@line 3184
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 7393
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 7399
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 7403
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 7](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 5494
}
function _fputc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1394
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 1395
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 1397
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 10822
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 10822
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 10824
 return $1 | 0; //@line 10825
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 3213
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 3219
 _emscripten_asm_const_iii(7, $0 | 0, $1 | 0) | 0; //@line 3220
 return;
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 6840
  $$0 = -1; //@line 6841
 } else {
  $$0 = $0; //@line 6843
 }
 return $$0 | 0; //@line 6845
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 4962
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 4963
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 4964
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
function _freopen__async_cb_42($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1685
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile($4); //@line 1688
 }
 HEAP32[___async_retval >> 2] = $4; //@line 1691
 return;
}
function __ZN6C128327columnsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / (HEAPU8[(HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 48 >> 2] | 0) + 1 >> 0] | 0 | 0) | 0; //@line 612
 return;
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 4954
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 4956
}
function __ZN6C128324rowsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / (HEAPU8[(HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 48 >> 2] | 0) + 2 >> 0] | 0 | 0) | 0; //@line 13573
 return;
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 7](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 5487
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
 _setvbuf(HEAP32[$0 + 4 >> 2] | 0, 0, 1, HEAP32[___async_retval >> 2] | 0) | 0; //@line 4608
 HEAP8[___async_retval >> 0] = 1; //@line 4611
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
 FUNCTION_TABLE_viiii[index & 7](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 5480
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
 $2 = ___strchrnul($0, $1) | 0; //@line 7594
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 7599
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 9882
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 9885
 }
 return $$0 | 0; //@line 9887
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 15](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 5445
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 stackRestore(___async_cur_frame | 0); //@line 5245
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 5246
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 5191
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 7095
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 7099
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 3787
 return;
}
function __ZN11TextDisplay6locateEii($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 HEAP16[$0 + 24 >> 1] = $1; //@line 1696
 HEAP16[$0 + 26 >> 1] = $2; //@line 1699
 return;
}
function __ZN4mbed6Stream5writeEPKvj__async_cb_76($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[$0 + 4 >> 2] | 0) - (HEAP32[$0 + 8 >> 2] | 0); //@line 4597
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 5251
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 5252
}
function __ZN4mbed6Stream4readEPvj__async_cb_74($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[$0 + 4 >> 2] | 0) - (HEAP32[$0 + 8 >> 2] | 0); //@line 4278
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
 FUNCTION_TABLE_viii[index & 3](a1 | 0, a2 | 0, a3 | 0); //@line 5473
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 20
 STACK_MAX = stackMax; //@line 21
}
function __ZN5Sht31C2E7PinNameS0_($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 _emscripten_asm_const_iiii(3, $0 | 0, $1 | 0, $2 | 0) | 0; //@line 1813
 return;
}
function __ZN15GraphicsDisplay7columnsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / 8 | 0; //@line 13555
 return;
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 12694
 __ZdlPv($0); //@line 12695
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 12377
 __ZdlPv($0); //@line 12378
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 7529
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 7531
}
function __ZN15GraphicsDisplay4rowsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / 8 | 0; //@line 1015
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 11905
 __ZdlPv($0); //@line 11906
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
  ___fwritex($1, $2, $0) | 0; //@line 9367
 }
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 2521
 return;
}
function dynCall_iii(index, a1, a2) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 return FUNCTION_TABLE_iii[index & 7](a1 | 0, a2 | 0) | 0; //@line 5438
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 12102
}
function __ZSt15get_new_handlerv() {
 var $0 = 0;
 $0 = HEAP32[3339] | 0; //@line 13467
 HEAP32[3339] = $0 + 0; //@line 13469
 return $0 | 0; //@line 13471
}
function __ZN4mbed10FileHandle5lseekEii__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 4081
 return;
}
function __ZN4mbed10FileHandle5fsyncEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 4399
 return;
}
function __ZN4mbed10FileHandle4flenEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 14116
 return;
}
function __ZSt13get_terminatev() {
 var $0 = 0;
 $0 = HEAP32[412] | 0; //@line 12684
 HEAP32[412] = $0 + 0; //@line 12686
 return $0 | 0; //@line 12688
}
function __ZN4mbed10FileHandle4tellEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1384
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
 FUNCTION_TABLE_vii[index & 7](a1 | 0, a2 | 0); //@line 5466
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_46($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 12 >> 2]; //@line 1914
 return;
}
function b9(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 abort(9); //@line 5528
}
function __ZN4mbed10FileHandle4sizeEv__async_cb_22($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 529
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 5278
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_23($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb_60($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 3130
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 9830
}
function _fflush__async_cb_32($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1120
 return;
}
function _vsprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 4294
 return;
}
function _fputc__async_cb_36($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1407
 return;
}
function _sprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 4380
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 31](a1 | 0) | 0; //@line 5431
}
function __Znaj__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1826
 return;
}
function __ZN11TextDisplay10foregroundEt($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP16[$0 + 28 >> 1] = $1; //@line 1708
 return;
}
function __ZN11TextDisplay10backgroundEt($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP16[$0 + 30 >> 1] = $1; //@line 1717
 return;
}
function b8(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 abort(8); //@line 5525
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(8396, HEAP32[$0 + 4 >> 2] | 0); //@line 13696
}
function _setbuf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 _setvbuf($0, $1, $1 | 0 ? 0 : 2, 1024) | 0; //@line 11475
 return;
}
function __ZN5Sht3115readTemperatureEv($0) {
 $0 = $0 | 0;
 return +(+(_emscripten_asm_const_ii(4, $0 | 0) | 0) / 100.0);
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 255](a1 | 0); //@line 5459
}
function __ZN4mbed8FileBaseD0Ev__async_cb_29($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 992
 return;
}
function __ZN5Sht3112readHumidityEv($0) {
 $0 = $0 | 0;
 return +(+(_emscripten_asm_const_ii(5, $0 | 0) | 0) / 100.0);
}
function __ZN4mbed26mbed_set_unbuffered_streamEP8_IO_FILE($0) {
 $0 = $0 | 0;
 _setbuf($0, 0); //@line 3371
 return;
}
function b2(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 abort(2); //@line 5504
 return 0; //@line 5504
}
function __ZThn4_N6C12832D0Ev__async_cb($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 741
 return;
}
function __ZN4mbed6Stream4seekEii($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return 0; //@line 2485
}
function __ZN6C12832D0Ev__async_cb($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 3770
 return;
}
function b7(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 abort(7); //@line 5522
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 11075
}
function _freopen__async_cb_40($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 1657
 return;
}
function __ZN4mbed10FileHandle5sigioENS_8CallbackIFvvEEE($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
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
 abort(1); //@line 5501
 return 0; //@line 5501
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
 FUNCTION_TABLE_v[index & 3](); //@line 5452
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
 abort(6); //@line 5519
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 6972
}
function __ZThn4_N15GraphicsDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 1309
}
function __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZThn4_N11TextDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 1741
}
function __ZN4mbed10FileHandle6isattyEv($0) {
 $0 = $0 | 0;
 return 0; //@line 2135
}
function __ZN15GraphicsDisplay9characterEiii__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___ofl_lock() {
 ___lock(13336); //@line 7768
 return 13344; //@line 7769
}
function __ZThn4_N4mbed6StreamD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 2560
}
function __ZN4mbed11NonCopyableINS_10FileHandleEED2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed10FileHandleD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 2122
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
 return 0; //@line 2129
}
function __ZN15GraphicsDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 825
}
function _abort_message__async_cb_78($0) {
 $0 = $0 | 0;
 _abort(); //@line 4672
}
function setTempRet0(value) {
 value = value | 0;
 tempRet0 = value; //@line 38
}
function b0(p0) {
 p0 = p0 | 0;
 abort(0); //@line 5498
 return 0; //@line 5498
}
function _frexpl($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 return +(+_frexp($0, $1));
}
function ___cxa_pure_virtual__wrapper() {
 ___cxa_pure_virtual(); //@line 5510
}
function __ZThn4_N15GraphicsDisplayD1Ev__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Stream6isattyEv($0) {
 $0 = $0 | 0;
 return 0; //@line 2503
}
function __ZN4mbed10FileHandle6rewindEv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN15GraphicsDisplay3clsEv__async_cb_39($0) {
 $0 = $0 | 0;
 return;
}
function __ZN11TextDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 1353
}
function __ZN4mbed6StreamD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 2274
}
function __ZN4mbed6Stream5closeEv($0) {
 $0 = $0 | 0;
 return 0; //@line 2491
}
function _mbed_error_vfprintf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return;
}
function __ZThn4_N4mbed6StreamD1Ev__async_cb_79($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Stream4tellEv($0) {
 $0 = $0 | 0;
 return 0; //@line 2509
}
function __ZN4mbed6Stream4syncEv($0) {
 $0 = $0 | 0;
 return 0; //@line 2497
}
function __ZN4mbed6Stream4sizeEv($0) {
 $0 = $0 | 0;
 return 0; //@line 2521
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 10996
}
function __ZN15GraphicsDisplayC2EPKc__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 11002
}
function ___pthread_self_699() {
 return _pthread_self() | 0; //@line 7179
}
function __ZThn4_N11TextDisplayD1Ev__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b5(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 abort(5); //@line 5516
}
function __ZN4mbed8FileBaseD2Ev__async_cb_25($0) {
 $0 = $0 | 0;
 return;
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 15
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 11731
 return;
}
function __ZN4mbed6StreamD2Ev__async_cb_34($0) {
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
 ___unlock(13336); //@line 7774
 return;
}
function __ZN11TextDisplay5_getcEv($0) {
 $0 = $0 | 0;
 return -1;
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 6856
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 7185
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
 return 13332; //@line 6850
}
function __ZSt9terminatev__async_cb_30($0) {
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
 abort(4); //@line 5513
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
 return 1280; //@line 6977
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
 abort(3); //@line 5507
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_ii = [b0,__ZN4mbed6Stream5closeEv,__ZN4mbed6Stream4syncEv,__ZN4mbed6Stream6isattyEv,__ZN4mbed6Stream4tellEv,__ZN4mbed6Stream4sizeEv,__ZN4mbed10FileHandle5fsyncEv,__ZN4mbed10FileHandle4flenEv,__ZN11TextDisplay5_getcEv,__ZN6C128324rowsEv,__ZN6C128327columnsEv,__ZN6C128325widthEv,__ZN6C128326heightEv,__ZN15GraphicsDisplay4rowsEv,__ZN15GraphicsDisplay7columnsEv,__ZN4mbed10FileHandle4syncEv,__ZN4mbed10FileHandle6isattyEv,__ZN4mbed10FileHandle4tellEv,__ZN4mbed10FileHandle4sizeEv,___stdio_close,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0];
var FUNCTION_TABLE_iii = [b1,__ZN4mbed10FileHandle12set_blockingEb,__ZNK4mbed10FileHandle4pollEs,__ZN6C128325_putcEi,__ZN11TextDisplay5claimEP8_IO_FILE,__ZN11TextDisplay5_putcEi,b1,b1];
var FUNCTION_TABLE_iiii = [b2,__ZN4mbed6Stream4readEPvj,__ZN4mbed6Stream5writeEPKvj,__ZN4mbed6Stream4seekEii,__ZN4mbed10FileHandle5lseekEii,___stdio_write,___stdio_seek,___stdout_write,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,___stdio_read,b2,b2,b2,b2,b2];
var FUNCTION_TABLE_v = [b3,___cxa_pure_virtual__wrapper,__ZL25default_terminate_handlerv,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev];
var FUNCTION_TABLE_vi = [b4,__ZN4mbed6StreamD2Ev,__ZN6C12832D0Ev,__ZN4mbed6Stream6rewindEv,__ZN6C128326_flushEv,__ZN4mbed6Stream4lockEv,__ZN4mbed6Stream6unlockEv,__ZN6C128323clsEv,__ZThn4_N6C12832D1Ev,__ZThn4_N6C12832D0Ev,__ZN15GraphicsDisplayD0Ev,__ZN15GraphicsDisplay3clsEv,__ZThn4_N15GraphicsDisplayD1Ev,__ZThn4_N15GraphicsDisplayD0Ev,__ZN11TextDisplayD0Ev,__ZN11TextDisplay3clsEv,__ZThn4_N11TextDisplayD1Ev,__ZThn4_N11TextDisplayD0Ev,__ZN4mbed8FileBaseD2Ev,__ZN4mbed8FileBaseD0Ev,__ZN4mbed11NonCopyableINS_10FileHandleEED2Ev,__ZN4mbed10FileHandleD0Ev,__ZN4mbed10FileHandle6rewindEv,__ZN4mbed6StreamD0Ev,__ZThn4_N4mbed6StreamD1Ev,__ZThn4_N4mbed6StreamD0Ev,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev
,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN6C12832D0Ev__async_cb,__ZN4mbed10FileHandle5lseekEii__async_cb,__ZN4mbed10FileHandle5fsyncEv__async_cb,__ZN4mbed10FileHandle4flenEv__async_cb,__ZN6C128325_putcEi__async_cb,__ZN6C128325_putcEi__async_cb_52,__ZN6C128329characterEiii__async_cb,__ZN6C128329characterEiii__async_cb_18,__ZN6C128329characterEiii__async_cb_19,__ZN6C128329characterEiii__async_cb_20,__ZN6C128324rowsEv__async_cb,__ZN6C128327columnsEv__async_cb,__ZThn4_N6C12832D1Ev__async_cb,__ZThn4_N6C12832D0Ev__async_cb,__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_43,__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb,__ZN15GraphicsDisplay9characterEiii__async_cb,__ZN15GraphicsDisplay4rowsEv__async_cb,__ZN15GraphicsDisplay7columnsEv__async_cb,__ZN15GraphicsDisplay3clsEv__async_cb,__ZN15GraphicsDisplay3clsEv__async_cb_38,__ZN15GraphicsDisplay3clsEv__async_cb_39,__ZN15GraphicsDisplay4putpEi__async_cb,__ZN15GraphicsDisplay4fillEiiiii__async_cb,__ZN15GraphicsDisplay4fillEiiiii__async_cb_64,__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb,__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb_53
,__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb,__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb_80,__ZThn4_N15GraphicsDisplayD1Ev__async_cb,__ZN15GraphicsDisplayC2EPKc__async_cb_37,__ZN15GraphicsDisplayC2EPKc__async_cb,__ZN11TextDisplay5_putcEi__async_cb,__ZN11TextDisplay5_putcEi__async_cb_49,__ZN11TextDisplay5_putcEi__async_cb_50,__ZN11TextDisplay5_putcEi__async_cb_51,__ZN11TextDisplay5claimEP8_IO_FILE__async_cb_77,__ZN11TextDisplay5claimEP8_IO_FILE__async_cb,__ZN11TextDisplay3clsEv__async_cb,__ZN11TextDisplay3clsEv__async_cb_68,__ZN11TextDisplay3clsEv__async_cb_69,__ZN11TextDisplay3clsEv__async_cb_72,__ZN11TextDisplay3clsEv__async_cb_70,__ZN11TextDisplay3clsEv__async_cb_71,__ZThn4_N11TextDisplayD1Ev__async_cb,__ZN11TextDisplayC2EPKc__async_cb_66,__ZN11TextDisplayC2EPKc__async_cb,__ZN4mbed8FileBaseD2Ev__async_cb_24,__ZN4mbed8FileBaseD2Ev__async_cb,__ZN4mbed8FileBaseD2Ev__async_cb_25,__ZN4mbed8FileBaseD0Ev__async_cb_28,__ZN4mbed8FileBaseD0Ev__async_cb,__ZN4mbed8FileBaseD0Ev__async_cb_29,__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb_27,__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb,__ZN4mbed10FileHandle4tellEv__async_cb,__ZN4mbed10FileHandle6rewindEv__async_cb
,__ZN4mbed10FileHandle4sizeEv__async_cb,__ZN4mbed10FileHandle4sizeEv__async_cb_21,__ZN4mbed10FileHandle4sizeEv__async_cb_22,__ZN4mbed6StreamD2Ev__async_cb,__ZN4mbed6StreamD2Ev__async_cb_34,__ZN4mbed6Stream4readEPvj__async_cb,__ZN4mbed6Stream4readEPvj__async_cb_73,__ZN4mbed6Stream4readEPvj__async_cb_74,__ZN4mbed6Stream5writeEPKvj__async_cb,__ZN4mbed6Stream5writeEPKvj__async_cb_75,__ZN4mbed6Stream5writeEPKvj__async_cb_76,__ZThn4_N4mbed6StreamD1Ev__async_cb,__ZThn4_N4mbed6StreamD1Ev__async_cb_79,__ZN4mbed6StreamC2EPKc__async_cb_62,__ZN4mbed6StreamC2EPKc__async_cb,__ZN4mbed6Stream4putcEi__async_cb,__ZN4mbed6Stream4putcEi__async_cb_61,__ZN4mbed6Stream4putcEi__async_cb_59,__ZN4mbed6Stream4putcEi__async_cb_60,__ZN4mbed6Stream6printfEPKcz__async_cb,__ZN4mbed6Stream6printfEPKcz__async_cb_48,__ZN4mbed6Stream6printfEPKcz__async_cb_45,__ZN4mbed6Stream6printfEPKcz__async_cb_46,__ZN4mbed6Stream6printfEPKcz__async_cb_47,_mbed_assert_internal__async_cb,_mbed_die__async_cb_16,_mbed_die__async_cb_15,_mbed_die__async_cb_14,_mbed_die__async_cb_13,_mbed_die__async_cb_12
,_mbed_die__async_cb_11,_mbed_die__async_cb_10,_mbed_die__async_cb_9,_mbed_die__async_cb_8,_mbed_die__async_cb_7,_mbed_die__async_cb_6,_mbed_die__async_cb_5,_mbed_die__async_cb_4,_mbed_die__async_cb_3,_mbed_die__async_cb_2,_mbed_die__async_cb,_invoke_ticker__async_cb_44,_invoke_ticker__async_cb,__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb_81,__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb,_exit__async_cb,__ZN4mbed6fdopenEPNS_10FileHandleEPKc__async_cb,_wait__async_cb,_wait_ms__async_cb,__GLOBAL__sub_I_main_cpp__async_cb,_main__async_cb,_main__async_cb_1,___overflow__async_cb,_fclose__async_cb_26,_fclose__async_cb,_fflush__async_cb_32,_fflush__async_cb_31,_fflush__async_cb_33,_fflush__async_cb,___fflush_unlocked__async_cb
,___fflush_unlocked__async_cb_17,_vfprintf__async_cb,_vsnprintf__async_cb,_sprintf__async_cb,_vsprintf__async_cb,_freopen__async_cb,_freopen__async_cb_42,_freopen__async_cb_41,_freopen__async_cb_40,_fputc__async_cb_36,_fputc__async_cb,_puts__async_cb,__Znwj__async_cb,__Znaj__async_cb,__ZL25default_terminate_handlerv__async_cb,__ZL25default_terminate_handlerv__async_cb_65,_abort_message__async_cb,_abort_message__async_cb_78,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_54,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_67,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_23,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_63,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb
,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_58,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_57,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_56,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_55,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_35,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
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






//# sourceMappingURL=temperature.js.map
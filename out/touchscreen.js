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

var ASM_CONSTS = [function($0) { window.MbedJSHal.ST7789H2.writeReg($0); },
 function() { window.MbedJSHal.ST7789H2.readData(); },
 function() { window.MbedJSHal.ST7789H2.init(); },
 function($0, $1, $2) { window.MbedJSHal.ST7789H2.drawPixel($0, $1, $2); },
 function() { return window.MbedJSHal.ST7789H2.getTouchX(); },
 function() { return window.MbedJSHal.ST7789H2.getTouchY(); },
 function($0, $1) { MbedJSHal.gpio.write($0, $1); },
 function($0, $1) { MbedJSHal.gpio.init_out($0, $1, 0); }];

function _emscripten_asm_const_iii(code, a0, a1) {
  return ASM_CONSTS[code](a0, a1);
}

function _emscripten_asm_const_i(code) {
  return ASM_CONSTS[code]();
}

function _emscripten_asm_const_iiii(code, a0, a1, a2) {
  return ASM_CONSTS[code](a0, a1, a2);
}

function _emscripten_asm_const_ii(code, a0) {
  return ASM_CONSTS[code](a0);
}




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 13648;
/* global initializers */  __ATINIT__.push();


memoryInitializer = "touchscreen.js.mem";





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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_vi": invoke_vi, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "_abort": _abort, "_emscripten_asm_const_i": _emscripten_asm_const_i, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_asm_const_iiii": _emscripten_asm_const_iiii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
  var _emscripten_asm_const_i=env._emscripten_asm_const_i;
  var _emscripten_asm_const_ii=env._emscripten_asm_const_ii;
  var _emscripten_asm_const_iii=env._emscripten_asm_const_iii;
  var _emscripten_asm_const_iiii=env._emscripten_asm_const_iiii;
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
 sp = STACKTOP; //@line 1417
 STACKTOP = STACKTOP + 16 | 0; //@line 1418
 $1 = sp; //@line 1419
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 1426
   $7 = $6 >>> 3; //@line 1427
   $8 = HEAP32[3020] | 0; //@line 1428
   $9 = $8 >>> $7; //@line 1429
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 1435
    $16 = 12120 + ($14 << 1 << 2) | 0; //@line 1437
    $17 = $16 + 8 | 0; //@line 1438
    $18 = HEAP32[$17 >> 2] | 0; //@line 1439
    $19 = $18 + 8 | 0; //@line 1440
    $20 = HEAP32[$19 >> 2] | 0; //@line 1441
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[3020] = $8 & ~(1 << $14); //@line 1448
     } else {
      if ((HEAP32[3024] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 1453
      }
      $27 = $20 + 12 | 0; //@line 1456
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 1460
       HEAP32[$17 >> 2] = $20; //@line 1461
       break;
      } else {
       _abort(); //@line 1464
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 1469
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 1472
    $34 = $18 + $30 + 4 | 0; //@line 1474
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 1477
    $$0 = $19; //@line 1478
    STACKTOP = sp; //@line 1479
    return $$0 | 0; //@line 1479
   }
   $37 = HEAP32[3022] | 0; //@line 1481
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 1487
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 1490
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 1493
     $49 = $47 >>> 12 & 16; //@line 1495
     $50 = $47 >>> $49; //@line 1496
     $52 = $50 >>> 5 & 8; //@line 1498
     $54 = $50 >>> $52; //@line 1500
     $56 = $54 >>> 2 & 4; //@line 1502
     $58 = $54 >>> $56; //@line 1504
     $60 = $58 >>> 1 & 2; //@line 1506
     $62 = $58 >>> $60; //@line 1508
     $64 = $62 >>> 1 & 1; //@line 1510
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 1513
     $69 = 12120 + ($67 << 1 << 2) | 0; //@line 1515
     $70 = $69 + 8 | 0; //@line 1516
     $71 = HEAP32[$70 >> 2] | 0; //@line 1517
     $72 = $71 + 8 | 0; //@line 1518
     $73 = HEAP32[$72 >> 2] | 0; //@line 1519
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 1525
       HEAP32[3020] = $77; //@line 1526
       $98 = $77; //@line 1527
      } else {
       if ((HEAP32[3024] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 1532
       }
       $80 = $73 + 12 | 0; //@line 1535
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 1539
        HEAP32[$70 >> 2] = $73; //@line 1540
        $98 = $8; //@line 1541
        break;
       } else {
        _abort(); //@line 1544
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 1549
     $84 = $83 - $6 | 0; //@line 1550
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 1553
     $87 = $71 + $6 | 0; //@line 1554
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 1557
     HEAP32[$71 + $83 >> 2] = $84; //@line 1559
     if ($37 | 0) {
      $92 = HEAP32[3025] | 0; //@line 1562
      $93 = $37 >>> 3; //@line 1563
      $95 = 12120 + ($93 << 1 << 2) | 0; //@line 1565
      $96 = 1 << $93; //@line 1566
      if (!($98 & $96)) {
       HEAP32[3020] = $98 | $96; //@line 1571
       $$0199 = $95; //@line 1573
       $$pre$phiZ2D = $95 + 8 | 0; //@line 1573
      } else {
       $101 = $95 + 8 | 0; //@line 1575
       $102 = HEAP32[$101 >> 2] | 0; //@line 1576
       if ((HEAP32[3024] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 1580
       } else {
        $$0199 = $102; //@line 1583
        $$pre$phiZ2D = $101; //@line 1583
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 1586
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 1588
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 1590
      HEAP32[$92 + 12 >> 2] = $95; //@line 1592
     }
     HEAP32[3022] = $84; //@line 1594
     HEAP32[3025] = $87; //@line 1595
     $$0 = $72; //@line 1596
     STACKTOP = sp; //@line 1597
     return $$0 | 0; //@line 1597
    }
    $108 = HEAP32[3021] | 0; //@line 1599
    if (!$108) {
     $$0197 = $6; //@line 1602
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 1606
     $114 = $112 >>> 12 & 16; //@line 1608
     $115 = $112 >>> $114; //@line 1609
     $117 = $115 >>> 5 & 8; //@line 1611
     $119 = $115 >>> $117; //@line 1613
     $121 = $119 >>> 2 & 4; //@line 1615
     $123 = $119 >>> $121; //@line 1617
     $125 = $123 >>> 1 & 2; //@line 1619
     $127 = $123 >>> $125; //@line 1621
     $129 = $127 >>> 1 & 1; //@line 1623
     $134 = HEAP32[12384 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 1628
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 1632
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1638
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 1641
      $$0193$lcssa$i = $138; //@line 1641
     } else {
      $$01926$i = $134; //@line 1643
      $$01935$i = $138; //@line 1643
      $146 = $143; //@line 1643
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 1648
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 1649
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 1650
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 1651
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1657
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 1660
        $$0193$lcssa$i = $$$0193$i; //@line 1660
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 1663
        $$01935$i = $$$0193$i; //@line 1663
       }
      }
     }
     $157 = HEAP32[3024] | 0; //@line 1667
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 1670
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 1673
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 1676
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 1680
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 1682
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 1686
       $176 = HEAP32[$175 >> 2] | 0; //@line 1687
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 1690
        $179 = HEAP32[$178 >> 2] | 0; //@line 1691
        if (!$179) {
         $$3$i = 0; //@line 1694
         break;
        } else {
         $$1196$i = $179; //@line 1697
         $$1198$i = $178; //@line 1697
        }
       } else {
        $$1196$i = $176; //@line 1700
        $$1198$i = $175; //@line 1700
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 1703
        $182 = HEAP32[$181 >> 2] | 0; //@line 1704
        if ($182 | 0) {
         $$1196$i = $182; //@line 1707
         $$1198$i = $181; //@line 1707
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 1710
        $185 = HEAP32[$184 >> 2] | 0; //@line 1711
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 1716
         $$1198$i = $184; //@line 1716
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 1721
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 1724
        $$3$i = $$1196$i; //@line 1725
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 1730
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 1733
       }
       $169 = $167 + 12 | 0; //@line 1736
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 1740
       }
       $172 = $164 + 8 | 0; //@line 1743
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 1747
        HEAP32[$172 >> 2] = $167; //@line 1748
        $$3$i = $164; //@line 1749
        break;
       } else {
        _abort(); //@line 1752
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 1761
       $191 = 12384 + ($190 << 2) | 0; //@line 1762
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 1767
         if (!$$3$i) {
          HEAP32[3021] = $108 & ~(1 << $190); //@line 1773
          break L73;
         }
        } else {
         if ((HEAP32[3024] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 1780
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 1788
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[3024] | 0; //@line 1798
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 1801
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 1805
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 1807
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 1813
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 1817
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 1819
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 1825
       if ($214 | 0) {
        if ((HEAP32[3024] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 1831
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 1835
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 1837
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 1845
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 1848
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 1850
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 1853
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 1857
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 1860
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 1862
      if ($37 | 0) {
       $234 = HEAP32[3025] | 0; //@line 1865
       $235 = $37 >>> 3; //@line 1866
       $237 = 12120 + ($235 << 1 << 2) | 0; //@line 1868
       $238 = 1 << $235; //@line 1869
       if (!($8 & $238)) {
        HEAP32[3020] = $8 | $238; //@line 1874
        $$0189$i = $237; //@line 1876
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 1876
       } else {
        $242 = $237 + 8 | 0; //@line 1878
        $243 = HEAP32[$242 >> 2] | 0; //@line 1879
        if ((HEAP32[3024] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 1883
        } else {
         $$0189$i = $243; //@line 1886
         $$pre$phi$iZ2D = $242; //@line 1886
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 1889
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 1891
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 1893
       HEAP32[$234 + 12 >> 2] = $237; //@line 1895
      }
      HEAP32[3022] = $$0193$lcssa$i; //@line 1897
      HEAP32[3025] = $159; //@line 1898
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 1901
     STACKTOP = sp; //@line 1902
     return $$0 | 0; //@line 1902
    }
   } else {
    $$0197 = $6; //@line 1905
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 1910
   } else {
    $251 = $0 + 11 | 0; //@line 1912
    $252 = $251 & -8; //@line 1913
    $253 = HEAP32[3021] | 0; //@line 1914
    if (!$253) {
     $$0197 = $252; //@line 1917
    } else {
     $255 = 0 - $252 | 0; //@line 1919
     $256 = $251 >>> 8; //@line 1920
     if (!$256) {
      $$0358$i = 0; //@line 1923
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 1927
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 1931
       $262 = $256 << $261; //@line 1932
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 1935
       $267 = $262 << $265; //@line 1937
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 1940
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 1945
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 1951
      }
     }
     $282 = HEAP32[12384 + ($$0358$i << 2) >> 2] | 0; //@line 1955
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 1959
       $$3$i203 = 0; //@line 1959
       $$3350$i = $255; //@line 1959
       label = 81; //@line 1960
      } else {
       $$0342$i = 0; //@line 1967
       $$0347$i = $255; //@line 1967
       $$0353$i = $282; //@line 1967
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 1967
       $$0362$i = 0; //@line 1967
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 1972
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 1977
          $$435113$i = 0; //@line 1977
          $$435712$i = $$0353$i; //@line 1977
          label = 85; //@line 1978
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 1981
          $$1348$i = $292; //@line 1981
         }
        } else {
         $$1343$i = $$0342$i; //@line 1984
         $$1348$i = $$0347$i; //@line 1984
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 1987
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 1990
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 1994
        $302 = ($$0353$i | 0) == 0; //@line 1995
        if ($302) {
         $$2355$i = $$1363$i; //@line 2000
         $$3$i203 = $$1343$i; //@line 2000
         $$3350$i = $$1348$i; //@line 2000
         label = 81; //@line 2001
         break;
        } else {
         $$0342$i = $$1343$i; //@line 2004
         $$0347$i = $$1348$i; //@line 2004
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 2004
         $$0362$i = $$1363$i; //@line 2004
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 2014
       $309 = $253 & ($306 | 0 - $306); //@line 2017
       if (!$309) {
        $$0197 = $252; //@line 2020
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 2025
       $315 = $313 >>> 12 & 16; //@line 2027
       $316 = $313 >>> $315; //@line 2028
       $318 = $316 >>> 5 & 8; //@line 2030
       $320 = $316 >>> $318; //@line 2032
       $322 = $320 >>> 2 & 4; //@line 2034
       $324 = $320 >>> $322; //@line 2036
       $326 = $324 >>> 1 & 2; //@line 2038
       $328 = $324 >>> $326; //@line 2040
       $330 = $328 >>> 1 & 1; //@line 2042
       $$4$ph$i = 0; //@line 2048
       $$4357$ph$i = HEAP32[12384 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 2048
      } else {
       $$4$ph$i = $$3$i203; //@line 2050
       $$4357$ph$i = $$2355$i; //@line 2050
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 2054
       $$4351$lcssa$i = $$3350$i; //@line 2054
      } else {
       $$414$i = $$4$ph$i; //@line 2056
       $$435113$i = $$3350$i; //@line 2056
       $$435712$i = $$4357$ph$i; //@line 2056
       label = 85; //@line 2057
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 2062
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 2066
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 2067
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 2068
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 2069
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2075
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 2078
        $$4351$lcssa$i = $$$4351$i; //@line 2078
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 2081
        $$435113$i = $$$4351$i; //@line 2081
        label = 85; //@line 2082
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 2088
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[3022] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[3024] | 0; //@line 2094
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 2097
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 2100
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 2103
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 2107
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 2109
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 2113
         $371 = HEAP32[$370 >> 2] | 0; //@line 2114
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 2117
          $374 = HEAP32[$373 >> 2] | 0; //@line 2118
          if (!$374) {
           $$3372$i = 0; //@line 2121
           break;
          } else {
           $$1370$i = $374; //@line 2124
           $$1374$i = $373; //@line 2124
          }
         } else {
          $$1370$i = $371; //@line 2127
          $$1374$i = $370; //@line 2127
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 2130
          $377 = HEAP32[$376 >> 2] | 0; //@line 2131
          if ($377 | 0) {
           $$1370$i = $377; //@line 2134
           $$1374$i = $376; //@line 2134
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 2137
          $380 = HEAP32[$379 >> 2] | 0; //@line 2138
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 2143
           $$1374$i = $379; //@line 2143
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 2148
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 2151
          $$3372$i = $$1370$i; //@line 2152
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 2157
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 2160
         }
         $364 = $362 + 12 | 0; //@line 2163
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 2167
         }
         $367 = $359 + 8 | 0; //@line 2170
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 2174
          HEAP32[$367 >> 2] = $362; //@line 2175
          $$3372$i = $359; //@line 2176
          break;
         } else {
          _abort(); //@line 2179
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 2187
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 2190
         $386 = 12384 + ($385 << 2) | 0; //@line 2191
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 2196
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 2201
            HEAP32[3021] = $391; //@line 2202
            $475 = $391; //@line 2203
            break L164;
           }
          } else {
           if ((HEAP32[3024] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 2210
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 2218
            if (!$$3372$i) {
             $475 = $253; //@line 2221
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[3024] | 0; //@line 2229
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 2232
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 2236
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 2238
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 2244
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 2248
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 2250
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 2256
         if (!$409) {
          $475 = $253; //@line 2259
         } else {
          if ((HEAP32[3024] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 2264
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 2268
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 2270
           $475 = $253; //@line 2271
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 2280
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 2283
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 2285
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 2288
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 2292
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 2295
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 2297
         $428 = $$4351$lcssa$i >>> 3; //@line 2298
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 12120 + ($428 << 1 << 2) | 0; //@line 2302
          $432 = HEAP32[3020] | 0; //@line 2303
          $433 = 1 << $428; //@line 2304
          if (!($432 & $433)) {
           HEAP32[3020] = $432 | $433; //@line 2309
           $$0368$i = $431; //@line 2311
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 2311
          } else {
           $437 = $431 + 8 | 0; //@line 2313
           $438 = HEAP32[$437 >> 2] | 0; //@line 2314
           if ((HEAP32[3024] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 2318
           } else {
            $$0368$i = $438; //@line 2321
            $$pre$phi$i211Z2D = $437; //@line 2321
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 2324
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 2326
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 2328
          HEAP32[$354 + 12 >> 2] = $431; //@line 2330
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 2333
         if (!$444) {
          $$0361$i = 0; //@line 2336
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 2340
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 2344
           $450 = $444 << $449; //@line 2345
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 2348
           $455 = $450 << $453; //@line 2350
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 2353
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 2358
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 2364
          }
         }
         $469 = 12384 + ($$0361$i << 2) | 0; //@line 2367
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 2369
         $471 = $354 + 16 | 0; //@line 2370
         HEAP32[$471 + 4 >> 2] = 0; //@line 2372
         HEAP32[$471 >> 2] = 0; //@line 2373
         $473 = 1 << $$0361$i; //@line 2374
         if (!($475 & $473)) {
          HEAP32[3021] = $475 | $473; //@line 2379
          HEAP32[$469 >> 2] = $354; //@line 2380
          HEAP32[$354 + 24 >> 2] = $469; //@line 2382
          HEAP32[$354 + 12 >> 2] = $354; //@line 2384
          HEAP32[$354 + 8 >> 2] = $354; //@line 2386
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 2395
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 2395
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 2402
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 2406
          $494 = HEAP32[$492 >> 2] | 0; //@line 2408
          if (!$494) {
           label = 136; //@line 2411
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 2414
           $$0345$i = $494; //@line 2414
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[3024] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 2421
          } else {
           HEAP32[$492 >> 2] = $354; //@line 2424
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 2426
           HEAP32[$354 + 12 >> 2] = $354; //@line 2428
           HEAP32[$354 + 8 >> 2] = $354; //@line 2430
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 2435
          $502 = HEAP32[$501 >> 2] | 0; //@line 2436
          $503 = HEAP32[3024] | 0; //@line 2437
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 2443
           HEAP32[$501 >> 2] = $354; //@line 2444
           HEAP32[$354 + 8 >> 2] = $502; //@line 2446
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 2448
           HEAP32[$354 + 24 >> 2] = 0; //@line 2450
           break;
          } else {
           _abort(); //@line 2453
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 2460
       STACKTOP = sp; //@line 2461
       return $$0 | 0; //@line 2461
      } else {
       $$0197 = $252; //@line 2463
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[3022] | 0; //@line 2470
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 2473
  $515 = HEAP32[3025] | 0; //@line 2474
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 2477
   HEAP32[3025] = $517; //@line 2478
   HEAP32[3022] = $514; //@line 2479
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 2482
   HEAP32[$515 + $512 >> 2] = $514; //@line 2484
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 2487
  } else {
   HEAP32[3022] = 0; //@line 2489
   HEAP32[3025] = 0; //@line 2490
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 2493
   $526 = $515 + $512 + 4 | 0; //@line 2495
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 2498
  }
  $$0 = $515 + 8 | 0; //@line 2501
  STACKTOP = sp; //@line 2502
  return $$0 | 0; //@line 2502
 }
 $530 = HEAP32[3023] | 0; //@line 2504
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 2507
  HEAP32[3023] = $532; //@line 2508
  $533 = HEAP32[3026] | 0; //@line 2509
  $534 = $533 + $$0197 | 0; //@line 2510
  HEAP32[3026] = $534; //@line 2511
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 2514
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 2517
  $$0 = $533 + 8 | 0; //@line 2519
  STACKTOP = sp; //@line 2520
  return $$0 | 0; //@line 2520
 }
 if (!(HEAP32[3138] | 0)) {
  HEAP32[3140] = 4096; //@line 2525
  HEAP32[3139] = 4096; //@line 2526
  HEAP32[3141] = -1; //@line 2527
  HEAP32[3142] = -1; //@line 2528
  HEAP32[3143] = 0; //@line 2529
  HEAP32[3131] = 0; //@line 2530
  HEAP32[3138] = $1 & -16 ^ 1431655768; //@line 2534
  $548 = 4096; //@line 2535
 } else {
  $548 = HEAP32[3140] | 0; //@line 2538
 }
 $545 = $$0197 + 48 | 0; //@line 2540
 $546 = $$0197 + 47 | 0; //@line 2541
 $547 = $548 + $546 | 0; //@line 2542
 $549 = 0 - $548 | 0; //@line 2543
 $550 = $547 & $549; //@line 2544
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 2547
  STACKTOP = sp; //@line 2548
  return $$0 | 0; //@line 2548
 }
 $552 = HEAP32[3130] | 0; //@line 2550
 if ($552 | 0) {
  $554 = HEAP32[3128] | 0; //@line 2553
  $555 = $554 + $550 | 0; //@line 2554
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 2559
   STACKTOP = sp; //@line 2560
   return $$0 | 0; //@line 2560
  }
 }
 L244 : do {
  if (!(HEAP32[3131] & 4)) {
   $561 = HEAP32[3026] | 0; //@line 2568
   L246 : do {
    if (!$561) {
     label = 163; //@line 2572
    } else {
     $$0$i$i = 12528; //@line 2574
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 2576
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 2579
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 2588
      if (!$570) {
       label = 163; //@line 2591
       break L246;
      } else {
       $$0$i$i = $570; //@line 2594
      }
     }
     $595 = $547 - $530 & $549; //@line 2598
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 2601
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 2609
       } else {
        $$723947$i = $595; //@line 2611
        $$748$i = $597; //@line 2611
        label = 180; //@line 2612
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 2616
       $$2253$ph$i = $595; //@line 2616
       label = 171; //@line 2617
      }
     } else {
      $$2234243136$i = 0; //@line 2620
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 2626
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 2629
     } else {
      $574 = $572; //@line 2631
      $575 = HEAP32[3139] | 0; //@line 2632
      $576 = $575 + -1 | 0; //@line 2633
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 2641
      $584 = HEAP32[3128] | 0; //@line 2642
      $585 = $$$i + $584 | 0; //@line 2643
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[3130] | 0; //@line 2648
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 2655
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 2659
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 2662
        $$748$i = $572; //@line 2662
        label = 180; //@line 2663
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 2666
        $$2253$ph$i = $$$i; //@line 2666
        label = 171; //@line 2667
       }
      } else {
       $$2234243136$i = 0; //@line 2670
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 2677
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 2686
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 2689
       $$748$i = $$2247$ph$i; //@line 2689
       label = 180; //@line 2690
       break L244;
      }
     }
     $607 = HEAP32[3140] | 0; //@line 2694
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 2698
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 2701
      $$748$i = $$2247$ph$i; //@line 2701
      label = 180; //@line 2702
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 2708
      $$2234243136$i = 0; //@line 2709
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 2713
      $$748$i = $$2247$ph$i; //@line 2713
      label = 180; //@line 2714
      break L244;
     }
    }
   } while (0);
   HEAP32[3131] = HEAP32[3131] | 4; //@line 2721
   $$4236$i = $$2234243136$i; //@line 2722
   label = 178; //@line 2723
  } else {
   $$4236$i = 0; //@line 2725
   label = 178; //@line 2726
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 2732
   $621 = _sbrk(0) | 0; //@line 2733
   $627 = $621 - $620 | 0; //@line 2741
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 2743
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 2751
    $$748$i = $620; //@line 2751
    label = 180; //@line 2752
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[3128] | 0) + $$723947$i | 0; //@line 2758
  HEAP32[3128] = $633; //@line 2759
  if ($633 >>> 0 > (HEAP32[3129] | 0) >>> 0) {
   HEAP32[3129] = $633; //@line 2763
  }
  $636 = HEAP32[3026] | 0; //@line 2765
  do {
   if (!$636) {
    $638 = HEAP32[3024] | 0; //@line 2769
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[3024] = $$748$i; //@line 2774
    }
    HEAP32[3132] = $$748$i; //@line 2776
    HEAP32[3133] = $$723947$i; //@line 2777
    HEAP32[3135] = 0; //@line 2778
    HEAP32[3029] = HEAP32[3138]; //@line 2780
    HEAP32[3028] = -1; //@line 2781
    HEAP32[3033] = 12120; //@line 2782
    HEAP32[3032] = 12120; //@line 2783
    HEAP32[3035] = 12128; //@line 2784
    HEAP32[3034] = 12128; //@line 2785
    HEAP32[3037] = 12136; //@line 2786
    HEAP32[3036] = 12136; //@line 2787
    HEAP32[3039] = 12144; //@line 2788
    HEAP32[3038] = 12144; //@line 2789
    HEAP32[3041] = 12152; //@line 2790
    HEAP32[3040] = 12152; //@line 2791
    HEAP32[3043] = 12160; //@line 2792
    HEAP32[3042] = 12160; //@line 2793
    HEAP32[3045] = 12168; //@line 2794
    HEAP32[3044] = 12168; //@line 2795
    HEAP32[3047] = 12176; //@line 2796
    HEAP32[3046] = 12176; //@line 2797
    HEAP32[3049] = 12184; //@line 2798
    HEAP32[3048] = 12184; //@line 2799
    HEAP32[3051] = 12192; //@line 2800
    HEAP32[3050] = 12192; //@line 2801
    HEAP32[3053] = 12200; //@line 2802
    HEAP32[3052] = 12200; //@line 2803
    HEAP32[3055] = 12208; //@line 2804
    HEAP32[3054] = 12208; //@line 2805
    HEAP32[3057] = 12216; //@line 2806
    HEAP32[3056] = 12216; //@line 2807
    HEAP32[3059] = 12224; //@line 2808
    HEAP32[3058] = 12224; //@line 2809
    HEAP32[3061] = 12232; //@line 2810
    HEAP32[3060] = 12232; //@line 2811
    HEAP32[3063] = 12240; //@line 2812
    HEAP32[3062] = 12240; //@line 2813
    HEAP32[3065] = 12248; //@line 2814
    HEAP32[3064] = 12248; //@line 2815
    HEAP32[3067] = 12256; //@line 2816
    HEAP32[3066] = 12256; //@line 2817
    HEAP32[3069] = 12264; //@line 2818
    HEAP32[3068] = 12264; //@line 2819
    HEAP32[3071] = 12272; //@line 2820
    HEAP32[3070] = 12272; //@line 2821
    HEAP32[3073] = 12280; //@line 2822
    HEAP32[3072] = 12280; //@line 2823
    HEAP32[3075] = 12288; //@line 2824
    HEAP32[3074] = 12288; //@line 2825
    HEAP32[3077] = 12296; //@line 2826
    HEAP32[3076] = 12296; //@line 2827
    HEAP32[3079] = 12304; //@line 2828
    HEAP32[3078] = 12304; //@line 2829
    HEAP32[3081] = 12312; //@line 2830
    HEAP32[3080] = 12312; //@line 2831
    HEAP32[3083] = 12320; //@line 2832
    HEAP32[3082] = 12320; //@line 2833
    HEAP32[3085] = 12328; //@line 2834
    HEAP32[3084] = 12328; //@line 2835
    HEAP32[3087] = 12336; //@line 2836
    HEAP32[3086] = 12336; //@line 2837
    HEAP32[3089] = 12344; //@line 2838
    HEAP32[3088] = 12344; //@line 2839
    HEAP32[3091] = 12352; //@line 2840
    HEAP32[3090] = 12352; //@line 2841
    HEAP32[3093] = 12360; //@line 2842
    HEAP32[3092] = 12360; //@line 2843
    HEAP32[3095] = 12368; //@line 2844
    HEAP32[3094] = 12368; //@line 2845
    $642 = $$723947$i + -40 | 0; //@line 2846
    $644 = $$748$i + 8 | 0; //@line 2848
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 2853
    $650 = $$748$i + $649 | 0; //@line 2854
    $651 = $642 - $649 | 0; //@line 2855
    HEAP32[3026] = $650; //@line 2856
    HEAP32[3023] = $651; //@line 2857
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 2860
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 2863
    HEAP32[3027] = HEAP32[3142]; //@line 2865
   } else {
    $$024367$i = 12528; //@line 2867
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 2869
     $658 = $$024367$i + 4 | 0; //@line 2870
     $659 = HEAP32[$658 >> 2] | 0; //@line 2871
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 2875
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 2879
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 2884
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 2898
       $673 = (HEAP32[3023] | 0) + $$723947$i | 0; //@line 2900
       $675 = $636 + 8 | 0; //@line 2902
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 2907
       $681 = $636 + $680 | 0; //@line 2908
       $682 = $673 - $680 | 0; //@line 2909
       HEAP32[3026] = $681; //@line 2910
       HEAP32[3023] = $682; //@line 2911
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 2914
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 2917
       HEAP32[3027] = HEAP32[3142]; //@line 2919
       break;
      }
     }
    }
    $688 = HEAP32[3024] | 0; //@line 2924
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[3024] = $$748$i; //@line 2927
     $753 = $$748$i; //@line 2928
    } else {
     $753 = $688; //@line 2930
    }
    $690 = $$748$i + $$723947$i | 0; //@line 2932
    $$124466$i = 12528; //@line 2933
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 2938
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 2942
     if (!$694) {
      $$0$i$i$i = 12528; //@line 2945
      break;
     } else {
      $$124466$i = $694; //@line 2948
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 2957
      $700 = $$124466$i + 4 | 0; //@line 2958
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 2961
      $704 = $$748$i + 8 | 0; //@line 2963
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 2969
      $712 = $690 + 8 | 0; //@line 2971
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 2977
      $722 = $710 + $$0197 | 0; //@line 2981
      $723 = $718 - $710 - $$0197 | 0; //@line 2982
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 2985
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[3023] | 0) + $723 | 0; //@line 2990
        HEAP32[3023] = $728; //@line 2991
        HEAP32[3026] = $722; //@line 2992
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 2995
       } else {
        if ((HEAP32[3025] | 0) == ($718 | 0)) {
         $734 = (HEAP32[3022] | 0) + $723 | 0; //@line 3001
         HEAP32[3022] = $734; //@line 3002
         HEAP32[3025] = $722; //@line 3003
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 3006
         HEAP32[$722 + $734 >> 2] = $734; //@line 3008
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 3012
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 3016
         $743 = $739 >>> 3; //@line 3017
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 3022
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 3024
           $750 = 12120 + ($743 << 1 << 2) | 0; //@line 3026
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 3032
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 3041
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[3020] = HEAP32[3020] & ~(1 << $743); //@line 3051
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 3058
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 3062
             }
             $764 = $748 + 8 | 0; //@line 3065
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 3069
              break;
             }
             _abort(); //@line 3072
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 3077
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 3078
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 3081
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 3083
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 3087
             $783 = $782 + 4 | 0; //@line 3088
             $784 = HEAP32[$783 >> 2] | 0; //@line 3089
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 3092
              if (!$786) {
               $$3$i$i = 0; //@line 3095
               break;
              } else {
               $$1291$i$i = $786; //@line 3098
               $$1293$i$i = $782; //@line 3098
              }
             } else {
              $$1291$i$i = $784; //@line 3101
              $$1293$i$i = $783; //@line 3101
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 3104
              $789 = HEAP32[$788 >> 2] | 0; //@line 3105
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 3108
               $$1293$i$i = $788; //@line 3108
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 3111
              $792 = HEAP32[$791 >> 2] | 0; //@line 3112
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 3117
               $$1293$i$i = $791; //@line 3117
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 3122
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 3125
              $$3$i$i = $$1291$i$i; //@line 3126
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 3131
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 3134
             }
             $776 = $774 + 12 | 0; //@line 3137
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 3141
             }
             $779 = $771 + 8 | 0; //@line 3144
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 3148
              HEAP32[$779 >> 2] = $774; //@line 3149
              $$3$i$i = $771; //@line 3150
              break;
             } else {
              _abort(); //@line 3153
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 3163
           $798 = 12384 + ($797 << 2) | 0; //@line 3164
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 3169
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[3021] = HEAP32[3021] & ~(1 << $797); //@line 3178
             break L311;
            } else {
             if ((HEAP32[3024] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 3184
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 3192
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[3024] | 0; //@line 3202
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 3205
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 3209
           $815 = $718 + 16 | 0; //@line 3210
           $816 = HEAP32[$815 >> 2] | 0; //@line 3211
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 3217
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 3221
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 3223
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 3229
           if (!$822) {
            break;
           }
           if ((HEAP32[3024] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 3237
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 3241
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 3243
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 3250
         $$0287$i$i = $742 + $723 | 0; //@line 3250
        } else {
         $$0$i17$i = $718; //@line 3252
         $$0287$i$i = $723; //@line 3252
        }
        $830 = $$0$i17$i + 4 | 0; //@line 3254
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 3257
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 3260
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 3262
        $836 = $$0287$i$i >>> 3; //@line 3263
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 12120 + ($836 << 1 << 2) | 0; //@line 3267
         $840 = HEAP32[3020] | 0; //@line 3268
         $841 = 1 << $836; //@line 3269
         do {
          if (!($840 & $841)) {
           HEAP32[3020] = $840 | $841; //@line 3275
           $$0295$i$i = $839; //@line 3277
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 3277
          } else {
           $845 = $839 + 8 | 0; //@line 3279
           $846 = HEAP32[$845 >> 2] | 0; //@line 3280
           if ((HEAP32[3024] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 3284
            $$pre$phi$i19$iZ2D = $845; //@line 3284
            break;
           }
           _abort(); //@line 3287
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 3291
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 3293
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 3295
         HEAP32[$722 + 12 >> 2] = $839; //@line 3297
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 3300
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 3304
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 3308
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 3313
          $858 = $852 << $857; //@line 3314
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 3317
          $863 = $858 << $861; //@line 3319
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 3322
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 3327
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 3333
         }
        } while (0);
        $877 = 12384 + ($$0296$i$i << 2) | 0; //@line 3336
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 3338
        $879 = $722 + 16 | 0; //@line 3339
        HEAP32[$879 + 4 >> 2] = 0; //@line 3341
        HEAP32[$879 >> 2] = 0; //@line 3342
        $881 = HEAP32[3021] | 0; //@line 3343
        $882 = 1 << $$0296$i$i; //@line 3344
        if (!($881 & $882)) {
         HEAP32[3021] = $881 | $882; //@line 3349
         HEAP32[$877 >> 2] = $722; //@line 3350
         HEAP32[$722 + 24 >> 2] = $877; //@line 3352
         HEAP32[$722 + 12 >> 2] = $722; //@line 3354
         HEAP32[$722 + 8 >> 2] = $722; //@line 3356
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 3365
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 3365
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 3372
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 3376
         $902 = HEAP32[$900 >> 2] | 0; //@line 3378
         if (!$902) {
          label = 260; //@line 3381
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 3384
          $$0289$i$i = $902; //@line 3384
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[3024] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 3391
         } else {
          HEAP32[$900 >> 2] = $722; //@line 3394
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 3396
          HEAP32[$722 + 12 >> 2] = $722; //@line 3398
          HEAP32[$722 + 8 >> 2] = $722; //@line 3400
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 3405
         $910 = HEAP32[$909 >> 2] | 0; //@line 3406
         $911 = HEAP32[3024] | 0; //@line 3407
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 3413
          HEAP32[$909 >> 2] = $722; //@line 3414
          HEAP32[$722 + 8 >> 2] = $910; //@line 3416
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 3418
          HEAP32[$722 + 24 >> 2] = 0; //@line 3420
          break;
         } else {
          _abort(); //@line 3423
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 3430
      STACKTOP = sp; //@line 3431
      return $$0 | 0; //@line 3431
     } else {
      $$0$i$i$i = 12528; //@line 3433
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 3437
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 3442
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 3450
    }
    $927 = $923 + -47 | 0; //@line 3452
    $929 = $927 + 8 | 0; //@line 3454
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 3460
    $936 = $636 + 16 | 0; //@line 3461
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 3463
    $939 = $938 + 8 | 0; //@line 3464
    $940 = $938 + 24 | 0; //@line 3465
    $941 = $$723947$i + -40 | 0; //@line 3466
    $943 = $$748$i + 8 | 0; //@line 3468
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 3473
    $949 = $$748$i + $948 | 0; //@line 3474
    $950 = $941 - $948 | 0; //@line 3475
    HEAP32[3026] = $949; //@line 3476
    HEAP32[3023] = $950; //@line 3477
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 3480
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 3483
    HEAP32[3027] = HEAP32[3142]; //@line 3485
    $956 = $938 + 4 | 0; //@line 3486
    HEAP32[$956 >> 2] = 27; //@line 3487
    HEAP32[$939 >> 2] = HEAP32[3132]; //@line 3488
    HEAP32[$939 + 4 >> 2] = HEAP32[3133]; //@line 3488
    HEAP32[$939 + 8 >> 2] = HEAP32[3134]; //@line 3488
    HEAP32[$939 + 12 >> 2] = HEAP32[3135]; //@line 3488
    HEAP32[3132] = $$748$i; //@line 3489
    HEAP32[3133] = $$723947$i; //@line 3490
    HEAP32[3135] = 0; //@line 3491
    HEAP32[3134] = $939; //@line 3492
    $958 = $940; //@line 3493
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 3495
     HEAP32[$958 >> 2] = 7; //@line 3496
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 3509
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 3512
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 3515
     HEAP32[$938 >> 2] = $964; //@line 3516
     $969 = $964 >>> 3; //@line 3517
     if ($964 >>> 0 < 256) {
      $972 = 12120 + ($969 << 1 << 2) | 0; //@line 3521
      $973 = HEAP32[3020] | 0; //@line 3522
      $974 = 1 << $969; //@line 3523
      if (!($973 & $974)) {
       HEAP32[3020] = $973 | $974; //@line 3528
       $$0211$i$i = $972; //@line 3530
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 3530
      } else {
       $978 = $972 + 8 | 0; //@line 3532
       $979 = HEAP32[$978 >> 2] | 0; //@line 3533
       if ((HEAP32[3024] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 3537
       } else {
        $$0211$i$i = $979; //@line 3540
        $$pre$phi$i$iZ2D = $978; //@line 3540
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 3543
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 3545
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 3547
      HEAP32[$636 + 12 >> 2] = $972; //@line 3549
      break;
     }
     $985 = $964 >>> 8; //@line 3552
     if (!$985) {
      $$0212$i$i = 0; //@line 3555
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 3559
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 3563
       $991 = $985 << $990; //@line 3564
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 3567
       $996 = $991 << $994; //@line 3569
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 3572
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 3577
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 3583
      }
     }
     $1010 = 12384 + ($$0212$i$i << 2) | 0; //@line 3586
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 3588
     HEAP32[$636 + 20 >> 2] = 0; //@line 3590
     HEAP32[$936 >> 2] = 0; //@line 3591
     $1013 = HEAP32[3021] | 0; //@line 3592
     $1014 = 1 << $$0212$i$i; //@line 3593
     if (!($1013 & $1014)) {
      HEAP32[3021] = $1013 | $1014; //@line 3598
      HEAP32[$1010 >> 2] = $636; //@line 3599
      HEAP32[$636 + 24 >> 2] = $1010; //@line 3601
      HEAP32[$636 + 12 >> 2] = $636; //@line 3603
      HEAP32[$636 + 8 >> 2] = $636; //@line 3605
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 3614
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 3614
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 3621
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 3625
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 3627
      if (!$1034) {
       label = 286; //@line 3630
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 3633
       $$0207$i$i = $1034; //@line 3633
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[3024] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 3640
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 3643
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 3645
       HEAP32[$636 + 12 >> 2] = $636; //@line 3647
       HEAP32[$636 + 8 >> 2] = $636; //@line 3649
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 3654
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 3655
      $1043 = HEAP32[3024] | 0; //@line 3656
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 3662
       HEAP32[$1041 >> 2] = $636; //@line 3663
       HEAP32[$636 + 8 >> 2] = $1042; //@line 3665
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 3667
       HEAP32[$636 + 24 >> 2] = 0; //@line 3669
       break;
      } else {
       _abort(); //@line 3672
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[3023] | 0; //@line 3679
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 3682
   HEAP32[3023] = $1054; //@line 3683
   $1055 = HEAP32[3026] | 0; //@line 3684
   $1056 = $1055 + $$0197 | 0; //@line 3685
   HEAP32[3026] = $1056; //@line 3686
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 3689
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 3692
   $$0 = $1055 + 8 | 0; //@line 3694
   STACKTOP = sp; //@line 3695
   return $$0 | 0; //@line 3695
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 3699
 $$0 = 0; //@line 3700
 STACKTOP = sp; //@line 3701
 return $$0 | 0; //@line 3701
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 3728
 $3 = HEAP32[3024] | 0; //@line 3729
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 3732
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 3736
 $7 = $6 & 3; //@line 3737
 if (($7 | 0) == 1) {
  _abort(); //@line 3740
 }
 $9 = $6 & -8; //@line 3743
 $10 = $2 + $9 | 0; //@line 3744
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 3749
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 3755
   $17 = $13 + $9 | 0; //@line 3756
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 3759
   }
   if ((HEAP32[3025] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 3765
    $106 = HEAP32[$105 >> 2] | 0; //@line 3766
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 3770
     $$1382 = $17; //@line 3770
     $114 = $16; //@line 3770
     break;
    }
    HEAP32[3022] = $17; //@line 3773
    HEAP32[$105 >> 2] = $106 & -2; //@line 3775
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 3778
    HEAP32[$16 + $17 >> 2] = $17; //@line 3780
    return;
   }
   $21 = $13 >>> 3; //@line 3783
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 3787
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 3789
    $28 = 12120 + ($21 << 1 << 2) | 0; //@line 3791
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 3796
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 3803
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[3020] = HEAP32[3020] & ~(1 << $21); //@line 3813
     $$1 = $16; //@line 3814
     $$1382 = $17; //@line 3814
     $114 = $16; //@line 3814
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 3820
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 3824
     }
     $41 = $26 + 8 | 0; //@line 3827
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 3831
     } else {
      _abort(); //@line 3833
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 3838
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 3839
    $$1 = $16; //@line 3840
    $$1382 = $17; //@line 3840
    $114 = $16; //@line 3840
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 3844
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 3846
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 3850
     $60 = $59 + 4 | 0; //@line 3851
     $61 = HEAP32[$60 >> 2] | 0; //@line 3852
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 3855
      if (!$63) {
       $$3 = 0; //@line 3858
       break;
      } else {
       $$1387 = $63; //@line 3861
       $$1390 = $59; //@line 3861
      }
     } else {
      $$1387 = $61; //@line 3864
      $$1390 = $60; //@line 3864
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 3867
      $66 = HEAP32[$65 >> 2] | 0; //@line 3868
      if ($66 | 0) {
       $$1387 = $66; //@line 3871
       $$1390 = $65; //@line 3871
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 3874
      $69 = HEAP32[$68 >> 2] | 0; //@line 3875
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 3880
       $$1390 = $68; //@line 3880
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 3885
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 3888
      $$3 = $$1387; //@line 3889
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 3894
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 3897
     }
     $53 = $51 + 12 | 0; //@line 3900
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 3904
     }
     $56 = $48 + 8 | 0; //@line 3907
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 3911
      HEAP32[$56 >> 2] = $51; //@line 3912
      $$3 = $48; //@line 3913
      break;
     } else {
      _abort(); //@line 3916
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 3923
    $$1382 = $17; //@line 3923
    $114 = $16; //@line 3923
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 3926
    $75 = 12384 + ($74 << 2) | 0; //@line 3927
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 3932
      if (!$$3) {
       HEAP32[3021] = HEAP32[3021] & ~(1 << $74); //@line 3939
       $$1 = $16; //@line 3940
       $$1382 = $17; //@line 3940
       $114 = $16; //@line 3940
       break L10;
      }
     } else {
      if ((HEAP32[3024] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 3947
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 3955
       if (!$$3) {
        $$1 = $16; //@line 3958
        $$1382 = $17; //@line 3958
        $114 = $16; //@line 3958
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[3024] | 0; //@line 3966
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 3969
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 3973
    $92 = $16 + 16 | 0; //@line 3974
    $93 = HEAP32[$92 >> 2] | 0; //@line 3975
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 3981
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 3985
       HEAP32[$93 + 24 >> 2] = $$3; //@line 3987
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 3993
    if (!$99) {
     $$1 = $16; //@line 3996
     $$1382 = $17; //@line 3996
     $114 = $16; //@line 3996
    } else {
     if ((HEAP32[3024] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 4001
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 4005
      HEAP32[$99 + 24 >> 2] = $$3; //@line 4007
      $$1 = $16; //@line 4008
      $$1382 = $17; //@line 4008
      $114 = $16; //@line 4008
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 4014
   $$1382 = $9; //@line 4014
   $114 = $2; //@line 4014
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 4019
 }
 $115 = $10 + 4 | 0; //@line 4022
 $116 = HEAP32[$115 >> 2] | 0; //@line 4023
 if (!($116 & 1)) {
  _abort(); //@line 4027
 }
 if (!($116 & 2)) {
  if ((HEAP32[3026] | 0) == ($10 | 0)) {
   $124 = (HEAP32[3023] | 0) + $$1382 | 0; //@line 4037
   HEAP32[3023] = $124; //@line 4038
   HEAP32[3026] = $$1; //@line 4039
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 4042
   if (($$1 | 0) != (HEAP32[3025] | 0)) {
    return;
   }
   HEAP32[3025] = 0; //@line 4048
   HEAP32[3022] = 0; //@line 4049
   return;
  }
  if ((HEAP32[3025] | 0) == ($10 | 0)) {
   $132 = (HEAP32[3022] | 0) + $$1382 | 0; //@line 4056
   HEAP32[3022] = $132; //@line 4057
   HEAP32[3025] = $114; //@line 4058
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 4061
   HEAP32[$114 + $132 >> 2] = $132; //@line 4063
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 4067
  $138 = $116 >>> 3; //@line 4068
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 4073
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 4075
    $145 = 12120 + ($138 << 1 << 2) | 0; //@line 4077
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[3024] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 4083
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 4090
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[3020] = HEAP32[3020] & ~(1 << $138); //@line 4100
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 4106
    } else {
     if ((HEAP32[3024] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 4111
     }
     $160 = $143 + 8 | 0; //@line 4114
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 4118
     } else {
      _abort(); //@line 4120
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 4125
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 4126
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 4129
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 4131
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 4135
      $180 = $179 + 4 | 0; //@line 4136
      $181 = HEAP32[$180 >> 2] | 0; //@line 4137
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 4140
       if (!$183) {
        $$3400 = 0; //@line 4143
        break;
       } else {
        $$1398 = $183; //@line 4146
        $$1402 = $179; //@line 4146
       }
      } else {
       $$1398 = $181; //@line 4149
       $$1402 = $180; //@line 4149
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 4152
       $186 = HEAP32[$185 >> 2] | 0; //@line 4153
       if ($186 | 0) {
        $$1398 = $186; //@line 4156
        $$1402 = $185; //@line 4156
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 4159
       $189 = HEAP32[$188 >> 2] | 0; //@line 4160
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 4165
        $$1402 = $188; //@line 4165
       }
      }
      if ((HEAP32[3024] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 4171
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 4174
       $$3400 = $$1398; //@line 4175
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 4180
      if ((HEAP32[3024] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 4184
      }
      $173 = $170 + 12 | 0; //@line 4187
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 4191
      }
      $176 = $167 + 8 | 0; //@line 4194
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 4198
       HEAP32[$176 >> 2] = $170; //@line 4199
       $$3400 = $167; //@line 4200
       break;
      } else {
       _abort(); //@line 4203
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 4211
     $196 = 12384 + ($195 << 2) | 0; //@line 4212
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 4217
       if (!$$3400) {
        HEAP32[3021] = HEAP32[3021] & ~(1 << $195); //@line 4224
        break L108;
       }
      } else {
       if ((HEAP32[3024] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 4231
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 4239
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[3024] | 0; //@line 4249
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 4252
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 4256
     $213 = $10 + 16 | 0; //@line 4257
     $214 = HEAP32[$213 >> 2] | 0; //@line 4258
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 4264
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 4268
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 4270
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 4276
     if ($220 | 0) {
      if ((HEAP32[3024] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 4282
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 4286
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 4288
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 4297
  HEAP32[$114 + $137 >> 2] = $137; //@line 4299
  if (($$1 | 0) == (HEAP32[3025] | 0)) {
   HEAP32[3022] = $137; //@line 4303
   return;
  } else {
   $$2 = $137; //@line 4306
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 4310
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 4313
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 4315
  $$2 = $$1382; //@line 4316
 }
 $235 = $$2 >>> 3; //@line 4318
 if ($$2 >>> 0 < 256) {
  $238 = 12120 + ($235 << 1 << 2) | 0; //@line 4322
  $239 = HEAP32[3020] | 0; //@line 4323
  $240 = 1 << $235; //@line 4324
  if (!($239 & $240)) {
   HEAP32[3020] = $239 | $240; //@line 4329
   $$0403 = $238; //@line 4331
   $$pre$phiZ2D = $238 + 8 | 0; //@line 4331
  } else {
   $244 = $238 + 8 | 0; //@line 4333
   $245 = HEAP32[$244 >> 2] | 0; //@line 4334
   if ((HEAP32[3024] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 4338
   } else {
    $$0403 = $245; //@line 4341
    $$pre$phiZ2D = $244; //@line 4341
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 4344
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 4346
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 4348
  HEAP32[$$1 + 12 >> 2] = $238; //@line 4350
  return;
 }
 $251 = $$2 >>> 8; //@line 4353
 if (!$251) {
  $$0396 = 0; //@line 4356
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 4360
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 4364
   $257 = $251 << $256; //@line 4365
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 4368
   $262 = $257 << $260; //@line 4370
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 4373
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 4378
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 4384
  }
 }
 $276 = 12384 + ($$0396 << 2) | 0; //@line 4387
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 4389
 HEAP32[$$1 + 20 >> 2] = 0; //@line 4392
 HEAP32[$$1 + 16 >> 2] = 0; //@line 4393
 $280 = HEAP32[3021] | 0; //@line 4394
 $281 = 1 << $$0396; //@line 4395
 do {
  if (!($280 & $281)) {
   HEAP32[3021] = $280 | $281; //@line 4401
   HEAP32[$276 >> 2] = $$1; //@line 4402
   HEAP32[$$1 + 24 >> 2] = $276; //@line 4404
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 4406
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 4408
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 4416
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 4416
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 4423
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 4427
    $301 = HEAP32[$299 >> 2] | 0; //@line 4429
    if (!$301) {
     label = 121; //@line 4432
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 4435
     $$0384 = $301; //@line 4435
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[3024] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 4442
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 4445
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 4447
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 4449
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 4451
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 4456
    $309 = HEAP32[$308 >> 2] | 0; //@line 4457
    $310 = HEAP32[3024] | 0; //@line 4458
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 4464
     HEAP32[$308 >> 2] = $$1; //@line 4465
     HEAP32[$$1 + 8 >> 2] = $309; //@line 4467
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 4469
     HEAP32[$$1 + 24 >> 2] = 0; //@line 4471
     break;
    } else {
     _abort(); //@line 4474
    }
   }
  }
 } while (0);
 $319 = (HEAP32[3028] | 0) + -1 | 0; //@line 4481
 HEAP32[3028] = $319; //@line 4482
 if (!$319) {
  $$0212$in$i = 12536; //@line 4485
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 4490
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 4496
  }
 }
 HEAP32[3028] = -1; //@line 4499
 return;
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 881
 STACKTOP = STACKTOP + 32 | 0; //@line 882
 $0 = sp; //@line 883
 _gpio_init_out($0, 50); //@line 884
 while (1) {
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 887
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 888
  _wait_ms(150); //@line 889
  if (___async) {
   label = 3; //@line 892
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 895
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 897
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 898
  _wait_ms(150); //@line 899
  if (___async) {
   label = 5; //@line 902
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 905
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 907
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 908
  _wait_ms(150); //@line 909
  if (___async) {
   label = 7; //@line 912
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 915
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 917
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 918
  _wait_ms(150); //@line 919
  if (___async) {
   label = 9; //@line 922
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 925
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 927
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 928
  _wait_ms(150); //@line 929
  if (___async) {
   label = 11; //@line 932
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 935
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 937
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 938
  _wait_ms(150); //@line 939
  if (___async) {
   label = 13; //@line 942
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 945
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 947
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 948
  _wait_ms(150); //@line 949
  if (___async) {
   label = 15; //@line 952
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 955
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 957
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 958
  _wait_ms(150); //@line 959
  if (___async) {
   label = 17; //@line 962
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 965
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 967
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 968
  _wait_ms(400); //@line 969
  if (___async) {
   label = 19; //@line 972
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 975
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 977
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 978
  _wait_ms(400); //@line 979
  if (___async) {
   label = 21; //@line 982
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 985
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 987
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 988
  _wait_ms(400); //@line 989
  if (___async) {
   label = 23; //@line 992
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 995
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 997
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 998
  _wait_ms(400); //@line 999
  if (___async) {
   label = 25; //@line 1002
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1005
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1007
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1008
  _wait_ms(400); //@line 1009
  if (___async) {
   label = 27; //@line 1012
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1015
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1017
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1018
  _wait_ms(400); //@line 1019
  if (___async) {
   label = 29; //@line 1022
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1025
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1027
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1028
  _wait_ms(400); //@line 1029
  if (___async) {
   label = 31; //@line 1032
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1035
  _emscripten_asm_const_iii(6, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1037
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1038
  _wait_ms(400); //@line 1039
  if (___async) {
   label = 33; //@line 1042
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1045
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 8; //@line 1049
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 1051
   sp = STACKTOP; //@line 1052
   STACKTOP = sp; //@line 1053
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 9; //@line 1057
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 1059
   sp = STACKTOP; //@line 1060
   STACKTOP = sp; //@line 1061
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 10; //@line 1065
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 1067
   sp = STACKTOP; //@line 1068
   STACKTOP = sp; //@line 1069
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 11; //@line 1073
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 1075
   sp = STACKTOP; //@line 1076
   STACKTOP = sp; //@line 1077
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 12; //@line 1081
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 1083
   sp = STACKTOP; //@line 1084
   STACKTOP = sp; //@line 1085
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 13; //@line 1089
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 1091
   sp = STACKTOP; //@line 1092
   STACKTOP = sp; //@line 1093
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 14; //@line 1097
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 1099
   sp = STACKTOP; //@line 1100
   STACKTOP = sp; //@line 1101
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 15; //@line 1105
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 1107
   sp = STACKTOP; //@line 1108
   STACKTOP = sp; //@line 1109
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 16; //@line 1113
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 1115
   sp = STACKTOP; //@line 1116
   STACKTOP = sp; //@line 1117
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 17; //@line 1121
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 1123
   sp = STACKTOP; //@line 1124
   STACKTOP = sp; //@line 1125
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 18; //@line 1129
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 1131
   sp = STACKTOP; //@line 1132
   STACKTOP = sp; //@line 1133
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 19; //@line 1137
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 1139
   sp = STACKTOP; //@line 1140
   STACKTOP = sp; //@line 1141
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 20; //@line 1145
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 1147
   sp = STACKTOP; //@line 1148
   STACKTOP = sp; //@line 1149
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 21; //@line 1153
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 1155
   sp = STACKTOP; //@line 1156
   STACKTOP = sp; //@line 1157
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 22; //@line 1161
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1163
   sp = STACKTOP; //@line 1164
   STACKTOP = sp; //@line 1165
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 23; //@line 1169
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1171
   sp = STACKTOP; //@line 1172
   STACKTOP = sp; //@line 1173
   return;
  }
 }
}
function _BSP_LCD_DisplayChar($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$03641$i$us = 0, $$03641$i$us5 = 0, $$03641$us$i$us = 0, $$03740$i$us = 0, $$03740$i$us6 = 0, $$03740$us$i$us = 0, $$03839$i$us = 0, $$03839$i$us10 = 0, $$03839$us$i$us = 0, $10 = 0, $12 = 0, $13 = 0, $15 = 0, $17 = 0, $23 = 0, $26 = 0, $27 = 0, $3 = 0, $31 = 0, $32 = 0, $37 = 0, $50 = 0, $57 = 0, $58 = 0, $63 = 0, $76 = 0, $8 = 0, $88 = 0, $89 = 0, $9 = 0, $94 = 0;
 $3 = HEAP32[3147] | 0; //@line 290
 $8 = HEAP16[$3 + 6 >> 1] | 0; //@line 295
 $9 = $8 & 65535; //@line 296
 $10 = Math_imul(($2 & 255) + -32 | 0, $9) | 0; //@line 297
 $12 = HEAP16[$3 + 4 >> 1] | 0; //@line 299
 $13 = $12 & 65535; //@line 300
 $15 = ($13 + 7 | 0) >>> 3; //@line 302
 $17 = (HEAP32[$3 >> 2] | 0) + (Math_imul($10, $15) | 0) | 0; //@line 304
 if (!($8 << 16 >> 16)) {
  return;
 }
 $23 = $12 << 16 >> 16 != 0; //@line 314
 $26 = $13 + -1 + (($12 + 7 & 248) - $13 & 255) | 0; //@line 317
 $27 = $0 & 65535; //@line 318
 switch ($15 & 16383) {
 case 1:
  {
   if ($23) {
    $$03641$us$i$us = $1; //@line 323
    $$03740$us$i$us = 0; //@line 323
   } else {
    return;
   }
   while (1) {
    $31 = HEAPU8[$17 + (Math_imul($$03740$us$i$us, $15) | 0) >> 0] | 0; //@line 331
    $32 = $$03641$us$i$us & 65535; //@line 332
    $$03839$us$i$us = 0; //@line 333
    do {
     $37 = $$03839$us$i$us + $27 | 0; //@line 339
     if (!(1 << $26 - $$03839$us$i$us & $31)) {
      _emscripten_asm_const_iiii(3, $37 & 65535 | 0, $32 | 0, HEAP32[3146] & 65535 | 0) | 0; //@line 344
     } else {
      _emscripten_asm_const_iiii(3, $37 & 65535 | 0, $32 | 0, HEAP32[3145] & 65535 | 0) | 0; //@line 349
     }
     $$03839$us$i$us = $$03839$us$i$us + 1 | 0; //@line 351
    } while (($$03839$us$i$us | 0) != ($13 | 0));
    $$03740$us$i$us = $$03740$us$i$us + 1 | 0; //@line 360
    if (($$03740$us$i$us | 0) == ($9 | 0)) {
     break;
    } else {
     $$03641$us$i$us = $$03641$us$i$us + 1 << 16 >> 16; //@line 365
    }
   }
   return;
  }
 case 2:
  {
   $$03641$i$us = $1; //@line 372
   $$03740$i$us = 0; //@line 372
   while (1) {
    $50 = $17 + (Math_imul($$03740$i$us, $15) | 0) | 0; //@line 375
    $57 = (HEAPU8[$50 >> 0] | 0) << 8 | (HEAPU8[$50 + 1 >> 0] | 0); //@line 382
    if ($23) {
     $58 = $$03641$i$us & 65535; //@line 384
     $$03839$i$us = 0; //@line 385
     do {
      $63 = $$03839$i$us + $27 | 0; //@line 391
      if (!(1 << $26 - $$03839$i$us & $57)) {
       _emscripten_asm_const_iiii(3, $63 & 65535 | 0, $58 | 0, HEAP32[3146] & 65535 | 0) | 0; //@line 396
      } else {
       _emscripten_asm_const_iiii(3, $63 & 65535 | 0, $58 | 0, HEAP32[3145] & 65535 | 0) | 0; //@line 401
      }
      $$03839$i$us = $$03839$i$us + 1 | 0; //@line 403
     } while (($$03839$i$us | 0) != ($13 | 0));
    }
    $$03740$i$us = $$03740$i$us + 1 | 0; //@line 413
    if (($$03740$i$us | 0) == ($9 | 0)) {
     break;
    } else {
     $$03641$i$us = $$03641$i$us + 1 << 16 >> 16; //@line 418
    }
   }
   return;
  }
 default:
  {
   if ($23) {
    $$03641$i$us5 = $1; //@line 426
    $$03740$i$us6 = 0; //@line 426
   } else {
    return;
   }
   while (1) {
    $76 = $17 + (Math_imul($$03740$i$us6, $15) | 0) | 0; //@line 432
    $88 = (HEAPU8[$76 + 1 >> 0] | 0) << 8 | (HEAPU8[$76 >> 0] | 0) << 16 | (HEAPU8[$76 + 2 >> 0] | 0); //@line 444
    $89 = $$03641$i$us5 & 65535; //@line 445
    $$03839$i$us10 = 0; //@line 446
    do {
     $94 = $$03839$i$us10 + $27 | 0; //@line 452
     if (!(1 << $26 - $$03839$i$us10 & $88)) {
      _emscripten_asm_const_iiii(3, $94 & 65535 | 0, $89 | 0, HEAP32[3146] & 65535 | 0) | 0; //@line 457
     } else {
      _emscripten_asm_const_iiii(3, $94 & 65535 | 0, $89 | 0, HEAP32[3145] & 65535 | 0) | 0; //@line 462
     }
     $$03839$i$us10 = $$03839$i$us10 + 1 | 0; //@line 464
    } while (($$03839$i$us10 | 0) != ($13 | 0));
    $$03740$i$us6 = $$03740$i$us6 + 1 | 0; //@line 473
    if (($$03740$i$us6 | 0) == ($9 | 0)) {
     break;
    } else {
     $$03641$i$us5 = $$03641$i$us5 + 1 << 16 >> 16; //@line 478
    }
   }
   return;
  }
 }
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 5474
 STACKTOP = STACKTOP + 64 | 0; //@line 5475
 $4 = sp; //@line 5476
 $5 = HEAP32[$0 >> 2] | 0; //@line 5477
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 5480
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 5482
 HEAP32[$4 >> 2] = $2; //@line 5483
 HEAP32[$4 + 4 >> 2] = $0; //@line 5485
 HEAP32[$4 + 8 >> 2] = $1; //@line 5487
 HEAP32[$4 + 12 >> 2] = $3; //@line 5489
 $14 = $4 + 16 | 0; //@line 5490
 $15 = $4 + 20 | 0; //@line 5491
 $16 = $4 + 24 | 0; //@line 5492
 $17 = $4 + 28 | 0; //@line 5493
 $18 = $4 + 32 | 0; //@line 5494
 $19 = $4 + 40 | 0; //@line 5495
 dest = $14; //@line 5496
 stop = dest + 36 | 0; //@line 5496
 do {
  HEAP32[dest >> 2] = 0; //@line 5496
  dest = dest + 4 | 0; //@line 5496
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 5496
 HEAP8[$14 + 38 >> 0] = 0; //@line 5496
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 5501
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 5504
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 5505
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 5506
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 35; //@line 5509
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 5511
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 5513
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 5515
    sp = STACKTOP; //@line 5516
    STACKTOP = sp; //@line 5517
    return 0; //@line 5517
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5519
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 5523
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 5527
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 5530
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 5531
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 5532
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 36; //@line 5535
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 5537
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 5539
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 5541
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 5543
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 5545
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 5547
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 5549
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 5551
    sp = STACKTOP; //@line 5552
    STACKTOP = sp; //@line 5553
    return 0; //@line 5553
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5555
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 5569
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 5577
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 5593
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 5598
  }
 } while (0);
 STACKTOP = sp; //@line 5601
 return $$0 | 0; //@line 5601
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5656
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 5662
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 5668
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 5671
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5672
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 5673
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 39; //@line 5676
     sp = STACKTOP; //@line 5677
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5680
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 5688
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 5693
     $19 = $1 + 44 | 0; //@line 5694
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 5700
     HEAP8[$22 >> 0] = 0; //@line 5701
     $23 = $1 + 53 | 0; //@line 5702
     HEAP8[$23 >> 0] = 0; //@line 5703
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 5705
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 5708
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 5709
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 5710
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 38; //@line 5713
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 5715
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 5717
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 5719
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 5721
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 5723
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 5725
      sp = STACKTOP; //@line 5726
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 5729
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 5733
      label = 13; //@line 5734
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 5739
       label = 13; //@line 5740
      } else {
       $$037$off039 = 3; //@line 5742
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 5746
      $39 = $1 + 40 | 0; //@line 5747
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 5750
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 5760
        $$037$off039 = $$037$off038; //@line 5761
       } else {
        $$037$off039 = $$037$off038; //@line 5763
       }
      } else {
       $$037$off039 = $$037$off038; //@line 5766
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 5769
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 5776
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
 sp = STACKTOP; //@line 4524
 STACKTOP = STACKTOP + 48 | 0; //@line 4525
 $vararg_buffer3 = sp + 16 | 0; //@line 4526
 $vararg_buffer = sp; //@line 4527
 $3 = sp + 32 | 0; //@line 4528
 $4 = $0 + 28 | 0; //@line 4529
 $5 = HEAP32[$4 >> 2] | 0; //@line 4530
 HEAP32[$3 >> 2] = $5; //@line 4531
 $7 = $0 + 20 | 0; //@line 4533
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 4535
 HEAP32[$3 + 4 >> 2] = $9; //@line 4536
 HEAP32[$3 + 8 >> 2] = $1; //@line 4538
 HEAP32[$3 + 12 >> 2] = $2; //@line 4540
 $12 = $9 + $2 | 0; //@line 4541
 $13 = $0 + 60 | 0; //@line 4542
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 4545
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 4547
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 4549
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 4551
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 4555
  } else {
   $$04756 = 2; //@line 4557
   $$04855 = $12; //@line 4557
   $$04954 = $3; //@line 4557
   $27 = $17; //@line 4557
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 4563
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 4565
    $38 = $27 >>> 0 > $37 >>> 0; //@line 4566
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 4568
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 4570
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 4572
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 4575
    $44 = $$150 + 4 | 0; //@line 4576
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 4579
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 4582
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 4584
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 4586
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 4588
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 4591
     break L1;
    } else {
     $$04756 = $$1; //@line 4594
     $$04954 = $$150; //@line 4594
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 4598
   HEAP32[$4 >> 2] = 0; //@line 4599
   HEAP32[$7 >> 2] = 0; //@line 4600
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 4603
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 4606
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 4611
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 4617
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 4622
  $25 = $20; //@line 4623
  HEAP32[$4 >> 2] = $25; //@line 4624
  HEAP32[$7 >> 2] = $25; //@line 4625
  $$051 = $2; //@line 4626
 }
 STACKTOP = sp; //@line 4628
 return $$051 | 0; //@line 4628
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 6830
 }
 ret = dest | 0; //@line 6833
 dest_end = dest + num | 0; //@line 6834
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 6838
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 6839
   dest = dest + 1 | 0; //@line 6840
   src = src + 1 | 0; //@line 6841
   num = num - 1 | 0; //@line 6842
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 6844
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 6845
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 6847
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 6848
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 6849
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 6850
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 6851
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 6852
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 6853
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 6854
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 6855
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 6856
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 6857
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 6858
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 6859
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 6860
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 6861
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 6862
   dest = dest + 64 | 0; //@line 6863
   src = src + 64 | 0; //@line 6864
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 6867
   dest = dest + 4 | 0; //@line 6868
   src = src + 4 | 0; //@line 6869
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 6873
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 6875
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 6876
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 6877
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 6878
   dest = dest + 4 | 0; //@line 6879
   src = src + 4 | 0; //@line 6880
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 6885
  dest = dest + 1 | 0; //@line 6886
  src = src + 1 | 0; //@line 6887
 }
 return ret | 0; //@line 6889
}
function _BSP_LCD_FillCircle($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$04157 = 0, $$04256 = 0, $$058 = 0, $$07$i = 0, $$07$i45 = 0, $$07$i49 = 0, $$07$i53 = 0, $$1 = 0, $$pn = 0, $11 = 0, $12 = 0, $14 = 0, $17 = 0, $25 = 0, $3 = 0, $33 = 0, $34 = 0, $36 = 0, $39 = 0, $47 = 0, $8 = 0, $9 = 0;
 $3 = $2 & 65535; //@line 682
 HEAP32[3145] = HEAP32[3145] & 65535; //@line 687
 $8 = $0 & 65535; //@line 688
 $9 = $1 & 65535; //@line 689
 $$04157 = 0; //@line 690
 $$04256 = 3 - ($3 << 1) | 0; //@line 690
 $$058 = $3; //@line 690
 while (1) {
  if ($$058 | 0) {
   $11 = $8 - $$058 | 0; //@line 694
   $12 = $$058 << 1; //@line 695
   $14 = $12 & 65534; //@line 697
   if (($12 & 65535) << 16 >> 16) {
    $17 = $$04157 + $9 & 65535; //@line 701
    $$07$i = 0; //@line 702
    do {
     _emscripten_asm_const_iiii(3, $$07$i + $11 & 65535 | 0, $17 | 0, HEAP32[3145] & 65535 | 0) | 0; //@line 708
     $$07$i = $$07$i + 1 | 0; //@line 709
    } while (($$07$i | 0) != ($14 | 0));
    $25 = $9 - $$04157 & 65535; //@line 718
    $$07$i45 = 0; //@line 719
    do {
     _emscripten_asm_const_iiii(3, $$07$i45 + $11 & 65535 | 0, $25 | 0, HEAP32[3145] & 65535 | 0) | 0; //@line 725
     $$07$i45 = $$07$i45 + 1 | 0; //@line 726
    } while (($$07$i45 | 0) != ($14 | 0));
   }
  }
  if ($$04157 | 0) {
   $33 = $8 - $$04157 | 0; //@line 738
   $34 = $$04157 << 1; //@line 739
   $36 = $34 & 65534; //@line 741
   if (($34 & 65535) << 16 >> 16) {
    $39 = $9 - $$058 & 65535; //@line 745
    $$07$i49 = 0; //@line 746
    do {
     _emscripten_asm_const_iiii(3, $$07$i49 + $33 & 65535 | 0, $39 | 0, HEAP32[3145] & 65535 | 0) | 0; //@line 752
     $$07$i49 = $$07$i49 + 1 | 0; //@line 753
    } while (($$07$i49 | 0) != ($36 | 0));
    $47 = $$058 + $9 & 65535; //@line 762
    $$07$i53 = 0; //@line 763
    do {
     _emscripten_asm_const_iiii(3, $$07$i53 + $33 & 65535 | 0, $47 | 0, HEAP32[3145] & 65535 | 0) | 0; //@line 769
     $$07$i53 = $$07$i53 + 1 | 0; //@line 770
    } while (($$07$i53 | 0) != ($36 | 0));
   }
  }
  if (($$04256 | 0) < 0) {
   $$1 = $$058; //@line 784
   $$pn = ($$04157 << 2) + 6 | 0; //@line 784
  } else {
   $$1 = $$058 + -1 | 0; //@line 790
   $$pn = ($$04157 - $$058 << 2) + 10 | 0; //@line 790
  }
  $$04157 = $$04157 + 1 | 0; //@line 793
  if ($$04157 >>> 0 > $$1 >>> 0) {
   break;
  } else {
   $$04256 = $$pn + $$04256 | 0; //@line 798
   $$058 = $$1; //@line 798
  }
 }
 HEAP32[3145] = HEAP32[3145] & 65535; //@line 803
 _BSP_LCD_DrawCircle($0, $1, $2); //@line 804
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 5157
 STACKTOP = STACKTOP + 64 | 0; //@line 5158
 $3 = sp; //@line 5159
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 5162
 } else {
  if (!$1) {
   $$2 = 0; //@line 5166
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 5168
   $6 = ___dynamic_cast($1, 24, 8, 0) | 0; //@line 5169
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 33; //@line 5172
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 5174
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 5176
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 5178
    sp = STACKTOP; //@line 5179
    STACKTOP = sp; //@line 5180
    return 0; //@line 5180
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5182
   if (!$6) {
    $$2 = 0; //@line 5185
   } else {
    dest = $3 + 4 | 0; //@line 5188
    stop = dest + 52 | 0; //@line 5188
    do {
     HEAP32[dest >> 2] = 0; //@line 5188
     dest = dest + 4 | 0; //@line 5188
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 5189
    HEAP32[$3 + 8 >> 2] = $0; //@line 5191
    HEAP32[$3 + 12 >> 2] = -1; //@line 5193
    HEAP32[$3 + 48 >> 2] = 1; //@line 5195
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 5198
    $18 = HEAP32[$2 >> 2] | 0; //@line 5199
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 5200
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 5201
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 34; //@line 5204
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 5206
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 5208
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 5210
     sp = STACKTOP; //@line 5211
     STACKTOP = sp; //@line 5212
     return 0; //@line 5212
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5214
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 5221
     $$0 = 1; //@line 5222
    } else {
     $$0 = 0; //@line 5224
    }
    $$2 = $$0; //@line 5226
   }
  }
 }
 STACKTOP = sp; //@line 5230
 return $$2 | 0; //@line 5230
}
function _main() {
 var $1 = 0, $10 = 0, $11 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1276
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1277
 _puts(11837) | 0; //@line 1278
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 27; //@line 1281
  sp = STACKTOP; //@line 1282
  return 0; //@line 1283
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1285
 _BSP_LCD_Init() | 0; //@line 1286
 $1 = (_BSP_LCD_GetXSize() | 0) & 65535; //@line 1288
 do {
  if ((_BSP_TS_Init($1, (_BSP_LCD_GetYSize() | 0) & 65535) | 0) << 24 >> 24 == 1) {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1295
   _puts(11857) | 0; //@line 1296
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 28; //@line 1299
    sp = STACKTOP; //@line 1300
    return 0; //@line 1301
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 1303
    break;
   }
  }
 } while (0);
 _BSP_LCD_Clear(-1); //@line 1308
 _BSP_LCD_SetTextColor(2016); //@line 1309
 _BSP_LCD_FillRect(0, 0, (_BSP_LCD_GetXSize() | 0) & 65535, 40); //@line 1312
 _BSP_LCD_SetTextColor(0); //@line 1313
 _BSP_LCD_SetBackColor(2016); //@line 1314
 _BSP_LCD_SetFont(104); //@line 1315
 _BSP_LCD_DisplayStringAt(0, 15, 11875, 1); //@line 1316
 while (1) {
  $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1318
  _BSP_TS_GetState(12592) | 0; //@line 1319
  if (___async) {
   label = 9; //@line 1322
   break;
  }
  _emscripten_free_async_context($AsyncCtx10 | 0); //@line 1325
  if (!(HEAP8[12592] | 0)) {
   continue;
  }
  $10 = HEAP16[6297] | 0; //@line 1331
  $11 = HEAP16[6299] | 0; //@line 1332
  _BSP_LCD_SetTextColor(-2048); //@line 1333
  _BSP_LCD_FillCircle($10, $11, 5); //@line 1334
  $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1335
  _wait_ms(10); //@line 1336
  if (___async) {
   label = 12; //@line 1339
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1342
 }
 if ((label | 0) == 9) {
  HEAP32[$AsyncCtx10 >> 2] = 29; //@line 1345
  sp = STACKTOP; //@line 1346
  return 0; //@line 1347
 } else if ((label | 0) == 12) {
  HEAP32[$AsyncCtx7 >> 2] = 30; //@line 1350
  sp = STACKTOP; //@line 1351
  return 0; //@line 1352
 }
 return 0; //@line 1354
}
function _BSP_LCD_DisplayStringAt($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$030$lcssa = 0, $$03037 = 0, $$03136 = 0, $$032 = 0, $$03334 = 0, $$038 = 0, $$135 = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $28 = 0, $29 = 0, $47 = 0, $49 = 0, $54 = 0, $7 = 0;
 if (!(HEAP8[$2 >> 0] | 0)) {
  $$030$lcssa = 0; //@line 498
 } else {
  $$03037 = 0; //@line 500
  $$038 = $2; //@line 500
  while (1) {
   $$038 = $$038 + 1 | 0; //@line 502
   $7 = $$03037 + 1 | 0; //@line 503
   if (!(HEAP8[$$038 >> 0] | 0)) {
    $$030$lcssa = $7; //@line 507
    break;
   } else {
    $$03037 = $7; //@line 510
   }
  }
 }
 $10 = _ST7789H2_GetLcdPixelWidth() | 0; //@line 514
 $13 = HEAP16[(HEAP32[3147] | 0) + 4 >> 1] | 0; //@line 517
 $14 = $13 & 65535; //@line 518
 $15 = (($10 & 65535) / ($13 & 65535) | 0) & 65535; //@line 520
 switch ($3 | 0) {
 case 1:
  {
   $$032 = ((Math_imul($15 - $$030$lcssa | 0, $14) | 0) >>> 1) + ($0 & 65535) & 65535; //@line 529
   break;
  }
 case 2:
  {
   $$032 = (Math_imul($15 - $$030$lcssa | 0, $14) | 0) - ($0 & 65535) & 65535; //@line 538
   break;
  }
 default:
  {
   $$032 = $0; //@line 542
  }
 }
 $28 = (HEAP8[$2 >> 0] | 0) != 0; //@line 546
 $29 = _ST7789H2_GetLcdPixelWidth() | 0; //@line 547
 if (!($28 & ($29 & 65535) >= (HEAPU16[(HEAP32[3147] | 0) + 4 >> 1] | 0))) {
  return;
 }
 $$03136 = 0; //@line 558
 $$03334 = $2; //@line 558
 $$135 = $$032 << 16 >> 16 > 1 ? $$032 : 1; //@line 558
 do {
  _BSP_LCD_DisplayChar($$135, $1, HEAP8[$$03334 >> 0] | 0); //@line 561
  $$135 = (HEAPU16[(HEAP32[3147] | 0) + 4 >> 1] | 0) + ($$135 & 65535) & 65535; //@line 568
  $$03334 = $$03334 + 1 | 0; //@line 569
  $$03136 = $$03136 + 1 << 16 >> 16; //@line 570
  $47 = (HEAP8[$$03334 >> 0] | 0) != 0; //@line 572
  $49 = (_ST7789H2_GetLcdPixelWidth() | 0) & 65535; //@line 574
  $54 = HEAPU16[(HEAP32[3147] | 0) + 4 >> 1] | 0; //@line 579
 } while ($47 & ($49 - (Math_imul($54, $$03136 & 65535) | 0) & 65535) >>> 0 >= $54 >>> 0);
 return;
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 4975
 $4 = HEAP32[$3 >> 2] | 0; //@line 4976
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 4983
   label = 5; //@line 4984
  } else {
   $$1 = 0; //@line 4986
  }
 } else {
  $12 = $4; //@line 4990
  label = 5; //@line 4991
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 4995
   $10 = HEAP32[$9 >> 2] | 0; //@line 4996
   $14 = $10; //@line 4999
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 5004
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 5012
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 5016
       $$141 = $0; //@line 5016
       $$143 = $1; //@line 5016
       $31 = $14; //@line 5016
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 5019
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 5026
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 5031
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 5034
      break L5;
     }
     $$139 = $$038; //@line 5040
     $$141 = $0 + $$038 | 0; //@line 5040
     $$143 = $1 - $$038 | 0; //@line 5040
     $31 = HEAP32[$9 >> 2] | 0; //@line 5040
    } else {
     $$139 = 0; //@line 5042
     $$141 = $0; //@line 5042
     $$143 = $1; //@line 5042
     $31 = $14; //@line 5042
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 5045
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 5048
   $$1 = $$139 + $$143 | 0; //@line 5050
  }
 } while (0);
 return $$1 | 0; //@line 5053
}
function _BSP_LCD_DrawCircle($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$04852 = 0, $$04951 = 0, $$053 = 0, $$1 = 0, $$pn = 0, $11 = 0, $12 = 0, $17 = 0, $23 = 0, $24 = 0, $29 = 0, $3 = 0, $34 = 0, $42 = 0, $6 = 0, $7 = 0;
 $3 = $2 & 65535; //@line 602
 $6 = $0 & 65535; //@line 605
 $7 = $1 & 65535; //@line 606
 $$04852 = 0; //@line 607
 $$04951 = 3 - ($3 << 1) | 0; //@line 607
 $$053 = $3; //@line 607
 while (1) {
  $11 = $$04852 + $6 & 65535; //@line 612
  $12 = $7 - $$053 & 65535; //@line 613
  _emscripten_asm_const_iiii(3, $11 | 0, $12 | 0, HEAP32[3145] & 65535 | 0) | 0; //@line 615
  $17 = $6 - $$04852 & 65535; //@line 618
  _emscripten_asm_const_iiii(3, $17 | 0, $12 | 0, HEAP32[3145] & 65535 | 0) | 0; //@line 620
  $23 = $$053 + $6 & 65535; //@line 624
  $24 = $7 - $$04852 & 65535; //@line 625
  _emscripten_asm_const_iiii(3, $23 | 0, $24 | 0, HEAP32[3145] & 65535 | 0) | 0; //@line 627
  $29 = $6 - $$053 & 65535; //@line 630
  _emscripten_asm_const_iiii(3, $29 | 0, $24 | 0, HEAP32[3145] & 65535 | 0) | 0; //@line 632
  $34 = $$053 + $7 & 65535; //@line 635
  _emscripten_asm_const_iiii(3, $11 | 0, $34 | 0, HEAP32[3145] & 65535 | 0) | 0; //@line 637
  _emscripten_asm_const_iiii(3, $17 | 0, $34 | 0, HEAP32[3145] & 65535 | 0) | 0; //@line 640
  $42 = $$04852 + $7 & 65535; //@line 643
  _emscripten_asm_const_iiii(3, $23 | 0, $42 | 0, HEAP32[3145] & 65535 | 0) | 0; //@line 645
  _emscripten_asm_const_iiii(3, $29 | 0, $42 | 0, HEAP32[3145] & 65535 | 0) | 0; //@line 648
  HEAP32[3147] = 96; //@line 649
  if (($$04951 | 0) < 0) {
   $$1 = $$053; //@line 654
   $$pn = ($$04852 << 2) + 6 | 0; //@line 654
  } else {
   $$1 = $$053 + -1 | 0; //@line 660
   $$pn = ($$04852 - $$053 << 2) + 10 | 0; //@line 660
  }
  $$04852 = $$04852 + 1 | 0; //@line 663
  if ($$04852 >>> 0 > $$1 >>> 0) {
   break;
  } else {
   $$04951 = $$pn + $$04951 | 0; //@line 668
   $$053 = $$1; //@line 668
  }
 }
 return;
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4861
 STACKTOP = STACKTOP + 16 | 0; //@line 4862
 $2 = sp; //@line 4863
 $3 = $1 & 255; //@line 4864
 HEAP8[$2 >> 0] = $3; //@line 4865
 $4 = $0 + 16 | 0; //@line 4866
 $5 = HEAP32[$4 >> 2] | 0; //@line 4867
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 4874
   label = 4; //@line 4875
  } else {
   $$0 = -1; //@line 4877
  }
 } else {
  $12 = $5; //@line 4880
  label = 4; //@line 4881
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 4885
   $10 = HEAP32[$9 >> 2] | 0; //@line 4886
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 4889
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 4896
     HEAP8[$10 >> 0] = $3; //@line 4897
     $$0 = $13; //@line 4898
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 4903
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 4904
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 4905
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 31; //@line 4908
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 4910
    sp = STACKTOP; //@line 4911
    STACKTOP = sp; //@line 4912
    return 0; //@line 4912
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 4914
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 4919
   } else {
    $$0 = -1; //@line 4921
   }
  }
 } while (0);
 STACKTOP = sp; //@line 4925
 return $$0 | 0; //@line 4925
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 6894
 value = value & 255; //@line 6896
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 6899
   ptr = ptr + 1 | 0; //@line 6900
  }
  aligned_end = end & -4 | 0; //@line 6903
  block_aligned_end = aligned_end - 64 | 0; //@line 6904
  value4 = value | value << 8 | value << 16 | value << 24; //@line 6905
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 6908
   HEAP32[ptr + 4 >> 2] = value4; //@line 6909
   HEAP32[ptr + 8 >> 2] = value4; //@line 6910
   HEAP32[ptr + 12 >> 2] = value4; //@line 6911
   HEAP32[ptr + 16 >> 2] = value4; //@line 6912
   HEAP32[ptr + 20 >> 2] = value4; //@line 6913
   HEAP32[ptr + 24 >> 2] = value4; //@line 6914
   HEAP32[ptr + 28 >> 2] = value4; //@line 6915
   HEAP32[ptr + 32 >> 2] = value4; //@line 6916
   HEAP32[ptr + 36 >> 2] = value4; //@line 6917
   HEAP32[ptr + 40 >> 2] = value4; //@line 6918
   HEAP32[ptr + 44 >> 2] = value4; //@line 6919
   HEAP32[ptr + 48 >> 2] = value4; //@line 6920
   HEAP32[ptr + 52 >> 2] = value4; //@line 6921
   HEAP32[ptr + 56 >> 2] = value4; //@line 6922
   HEAP32[ptr + 60 >> 2] = value4; //@line 6923
   ptr = ptr + 64 | 0; //@line 6924
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 6928
   ptr = ptr + 4 | 0; //@line 6929
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 6934
  ptr = ptr + 1 | 0; //@line 6935
 }
 return end - num | 0; //@line 6937
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_2($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 6052
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6054
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6056
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6058
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6060
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 6065
  return;
 }
 dest = $2 + 4 | 0; //@line 6069
 stop = dest + 52 | 0; //@line 6069
 do {
  HEAP32[dest >> 2] = 0; //@line 6069
  dest = dest + 4 | 0; //@line 6069
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 6070
 HEAP32[$2 + 8 >> 2] = $4; //@line 6072
 HEAP32[$2 + 12 >> 2] = -1; //@line 6074
 HEAP32[$2 + 48 >> 2] = 1; //@line 6076
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 6079
 $16 = HEAP32[$6 >> 2] | 0; //@line 6080
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 6081
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 6082
 if (!___async) {
  ___async_unwind = 0; //@line 6085
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 34; //@line 6087
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 6089
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 6091
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 6093
 sp = STACKTOP; //@line 6094
 return;
}
function _main__async_cb_19($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 6644
 _BSP_LCD_Init() | 0; //@line 6645
 $2 = (_BSP_LCD_GetXSize() | 0) & 65535; //@line 6647
 if ((_BSP_TS_Init($2, (_BSP_LCD_GetYSize() | 0) & 65535) | 0) << 24 >> 24 == 1) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 6653
  _puts(11857) | 0; //@line 6654
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 6657
   sp = STACKTOP; //@line 6658
   return;
  }
  ___async_unwind = 0; //@line 6661
  HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 6662
  sp = STACKTOP; //@line 6663
  return;
 }
 _BSP_LCD_Clear(-1); //@line 6666
 _BSP_LCD_SetTextColor(2016); //@line 6667
 _BSP_LCD_FillRect(0, 0, (_BSP_LCD_GetXSize() | 0) & 65535, 40); //@line 6670
 _BSP_LCD_SetTextColor(0); //@line 6671
 _BSP_LCD_SetBackColor(2016); //@line 6672
 _BSP_LCD_SetFont(104); //@line 6673
 _BSP_LCD_DisplayStringAt(0, 15, 11875, 1); //@line 6674
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 6675
 _BSP_TS_GetState(12592) | 0; //@line 6676
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 6679
  sp = STACKTOP; //@line 6680
  return;
 }
 ___async_unwind = 0; //@line 6683
 HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 6684
 sp = STACKTOP; //@line 6685
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 4727
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 4732
   label = 4; //@line 4733
  } else {
   $$01519 = $0; //@line 4735
   $23 = $1; //@line 4735
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 4740
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 4743
    $23 = $6; //@line 4744
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 4748
     label = 4; //@line 4749
     break;
    } else {
     $$01519 = $6; //@line 4752
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 4758
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 4760
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 4768
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 4776
  } else {
   $$pn = $$0; //@line 4778
   while (1) {
    $19 = $$pn + 1 | 0; //@line 4780
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 4784
     break;
    } else {
     $$pn = $19; //@line 4787
    }
   }
  }
  $$sink = $$1$lcssa; //@line 4792
 }
 return $$sink - $1 | 0; //@line 4795
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 5404
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 5411
   $10 = $1 + 16 | 0; //@line 5412
   $11 = HEAP32[$10 >> 2] | 0; //@line 5413
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 5416
    HEAP32[$1 + 24 >> 2] = $4; //@line 5418
    HEAP32[$1 + 36 >> 2] = 1; //@line 5420
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 5430
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 5435
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 5438
    HEAP8[$1 + 54 >> 0] = 1; //@line 5440
    break;
   }
   $21 = $1 + 24 | 0; //@line 5443
   $22 = HEAP32[$21 >> 2] | 0; //@line 5444
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 5447
    $28 = $4; //@line 5448
   } else {
    $28 = $22; //@line 5450
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 5459
   }
  }
 } while (0);
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5059
 $1 = HEAP32[30] | 0; //@line 5060
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 5066
 } else {
  $19 = 0; //@line 5068
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 5074
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 5080
    $12 = HEAP32[$11 >> 2] | 0; //@line 5081
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 5087
     HEAP8[$12 >> 0] = 10; //@line 5088
     $22 = 0; //@line 5089
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 5093
   $17 = ___overflow($1, 10) | 0; //@line 5094
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 32; //@line 5097
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 5099
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 5101
    sp = STACKTOP; //@line 5102
    return 0; //@line 5103
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5105
    $22 = $17 >> 31; //@line 5107
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 5114
 }
 return $22 | 0; //@line 5116
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 5263
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 5272
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 5277
      HEAP32[$13 >> 2] = $2; //@line 5278
      $19 = $1 + 40 | 0; //@line 5279
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 5282
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 5292
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 5296
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 5303
    }
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5940
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5942
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5944
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5948
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 5952
  label = 4; //@line 5953
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 5958
   label = 4; //@line 5959
  } else {
   $$037$off039 = 3; //@line 5961
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 5965
  $17 = $8 + 40 | 0; //@line 5966
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 5969
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 5979
    $$037$off039 = $$037$off038; //@line 5980
   } else {
    $$037$off039 = $$037$off038; //@line 5982
   }
  } else {
   $$037$off039 = $$037$off038; //@line 5985
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 5988
 return;
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1210
 $2 = $0 + 12 | 0; //@line 1212
 $3 = HEAP32[$2 >> 2] | 0; //@line 1213
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1217
   _mbed_assert_internal(11748, 11753, 528); //@line 1218
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 24; //@line 1221
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 1223
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1225
    sp = STACKTOP; //@line 1226
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1229
    $8 = HEAP32[$2 >> 2] | 0; //@line 1231
    break;
   }
  } else {
   $8 = $3; //@line 1235
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 1238
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1240
 FUNCTION_TABLE_vi[$7 & 63]($0); //@line 1241
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 25; //@line 1244
  sp = STACKTOP; //@line 1245
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1248
  return;
 }
}
function _main__async_cb_21($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 6705
 if (!(HEAP8[12592] | 0)) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 6709
  _BSP_TS_GetState(12592) | 0; //@line 6710
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 6713
   sp = STACKTOP; //@line 6714
   return;
  }
  ___async_unwind = 0; //@line 6717
  HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 6718
  sp = STACKTOP; //@line 6719
  return;
 } else {
  $3 = HEAP16[6297] | 0; //@line 6722
  $4 = HEAP16[6299] | 0; //@line 6723
  _BSP_LCD_SetTextColor(-2048); //@line 6724
  _BSP_LCD_FillCircle($3, $4, 5); //@line 6725
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 6726
  _wait_ms(10); //@line 6727
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 6730
   sp = STACKTOP; //@line 6731
   return;
  }
  ___async_unwind = 0; //@line 6734
  HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 6735
  sp = STACKTOP; //@line 6736
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
 sp = STACKTOP; //@line 5619
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 5625
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 5628
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 5631
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 5632
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 5633
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 37; //@line 5636
    sp = STACKTOP; //@line 5637
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5640
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
 sp = STACKTOP; //@line 5788
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 5794
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 5797
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 5800
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 5801
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 5802
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 40; //@line 5805
    sp = STACKTOP; //@line 5806
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5809
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
 sp = STACKTOP; //@line 5827
 STACKTOP = STACKTOP + 16 | 0; //@line 5828
 $3 = sp; //@line 5829
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 5831
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 5834
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 5835
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 5836
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 41; //@line 5839
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 5841
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 5843
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 5845
  sp = STACKTOP; //@line 5846
  STACKTOP = sp; //@line 5847
  return 0; //@line 5847
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 5849
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 5853
 }
 STACKTOP = sp; //@line 5855
 return $8 & 1 | 0; //@line 5855
}
function ___dynamic_cast__async_cb_3($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6131
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6133
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6135
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 6141
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 6156
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 6172
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 6177
    break;
   }
  default:
   {
    $$0 = 0; //@line 6181
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 6186
 return;
}
function _BSP_LCD_Clear($0) {
 $0 = $0 | 0;
 var $$011 = 0, $$07$i = 0, $1 = 0, $14 = 0, $3 = 0, $4 = 0, $6 = 0, $7 = 0;
 $1 = HEAP32[3145] | 0; //@line 187
 HEAP32[3145] = $0 & 65535; //@line 189
 $3 = _ST7789H2_GetLcdPixelHeight() | 0; //@line 190
 $4 = $3 & 65535; //@line 191
 if (!($3 << 16 >> 16)) {
  $14 = $1 & 65535; //@line 194
  HEAP32[3145] = $14; //@line 195
  return;
 } else {
  $$011 = 0; //@line 198
 }
 do {
  $6 = _ST7789H2_GetLcdPixelWidth() | 0; //@line 201
  $7 = $6 & 65535; //@line 202
  if ($6 << 16 >> 16) {
   $$07$i = 0; //@line 205
   do {
    _emscripten_asm_const_iiii(3, $$07$i | 0, $$011 | 0, HEAP32[3145] & 65535 | 0) | 0; //@line 209
    $$07$i = $$07$i + 1 | 0; //@line 210
   } while (($$07$i | 0) != ($7 | 0));
  }
  $$011 = $$011 + 1 | 0; //@line 219
 } while (($$011 | 0) != ($4 | 0));
 $14 = $1 & 65535; //@line 227
 HEAP32[3145] = $14; //@line 228
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 5341
 $5 = HEAP32[$4 >> 2] | 0; //@line 5342
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 5346
   HEAP32[$1 + 24 >> 2] = $3; //@line 5348
   HEAP32[$1 + 36 >> 2] = 1; //@line 5350
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 5354
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 5357
    HEAP32[$1 + 24 >> 2] = 2; //@line 5359
    HEAP8[$1 + 54 >> 0] = 1; //@line 5361
    break;
   }
   $10 = $1 + 24 | 0; //@line 5364
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 5368
   }
  }
 } while (0);
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 6618
 _BSP_LCD_Clear(-1); //@line 6619
 _BSP_LCD_SetTextColor(2016); //@line 6620
 _BSP_LCD_FillRect(0, 0, (_BSP_LCD_GetXSize() | 0) & 65535, 40); //@line 6623
 _BSP_LCD_SetTextColor(0); //@line 6624
 _BSP_LCD_SetBackColor(2016); //@line 6625
 _BSP_LCD_SetFont(104); //@line 6626
 _BSP_LCD_DisplayStringAt(0, 15, 11875, 1); //@line 6627
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 6628
 _BSP_TS_GetState(12592) | 0; //@line 6629
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 6632
  sp = STACKTOP; //@line 6633
  return;
 }
 ___async_unwind = 0; //@line 6636
 HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 6637
 sp = STACKTOP; //@line 6638
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4635
 STACKTOP = STACKTOP + 32 | 0; //@line 4636
 $vararg_buffer = sp; //@line 4637
 $3 = sp + 20 | 0; //@line 4638
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 4642
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 4644
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 4646
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 4648
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 4650
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 4655
  $10 = -1; //@line 4656
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 4659
 }
 STACKTOP = sp; //@line 4661
 return $10 | 0; //@line 4661
}
function _BSP_LCD_FillRect($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $$04 = 0, $$07$i = 0, $6 = 0, $8 = 0, $9 = 0;
 HEAP32[3145] = HEAP32[3145] & 65535; //@line 241
 $6 = $2 & 65535; //@line 242
 $8 = $0 & 65535; //@line 244
 if (!($2 << 16 >> 16)) {
  return;
 } else {
  $$0 = $3; //@line 248
  $$04 = $1; //@line 248
 }
 while (1) {
  $9 = $$04 & 65535; //@line 251
  $$07$i = 0; //@line 252
  do {
   _emscripten_asm_const_iiii(3, $$07$i + $8 & 65535 | 0, $9 | 0, HEAP32[3145] & 65535 | 0) | 0; //@line 258
   $$07$i = $$07$i + 1 | 0; //@line 259
  } while (($$07$i | 0) != ($6 | 0));
  if (!($$0 << 16 >> 16)) {
   break;
  } else {
   $$0 = $$0 + -1 << 16 >> 16; //@line 273
   $$04 = $$04 + 1 << 16 >> 16; //@line 273
  }
 }
 return;
}
function _BSP_TS_GetState($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 818
 $1 = _emscripten_asm_const_i(4) | 0; //@line 819
 $2 = _emscripten_asm_const_i(5) | 0; //@line 820
 $3 = ($1 | 0) != -1; //@line 821
 $4 = ($2 | 0) != -1; //@line 822
 HEAP8[$0 >> 0] = $3 & $4 & 1; //@line 825
 if ($3) {
  HEAP16[$0 + 2 >> 1] = $1; //@line 829
 }
 if ($4) {
  HEAP16[$0 + 6 >> 1] = $2; //@line 834
 }
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 836
 _wait_ms(1); //@line 837
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 6; //@line 840
  sp = STACKTOP; //@line 841
  return 0; //@line 842
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 844
  return 0; //@line 845
 }
 return 0; //@line 847
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 854
 STACKTOP = STACKTOP + 16 | 0; //@line 855
 $vararg_buffer = sp; //@line 856
 HEAP32[$vararg_buffer >> 2] = $0; //@line 857
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 859
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 861
 _mbed_error_printf(11625, $vararg_buffer); //@line 862
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 863
 _mbed_die(); //@line 864
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 7; //@line 867
  sp = STACKTOP; //@line 868
  STACKTOP = sp; //@line 869
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 871
  STACKTOP = sp; //@line 872
  return;
 }
}
function _mbed_die__async_cb_17($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 6542
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6544
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 6546
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 6547
 _wait_ms(150); //@line 6548
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 10; //@line 6551
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 6552
  HEAP32[$4 >> 2] = $2; //@line 6553
  sp = STACKTOP; //@line 6554
  return;
 }
 ___async_unwind = 0; //@line 6557
 HEAP32[$ReallocAsyncCtx14 >> 2] = 10; //@line 6558
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 6559
 HEAP32[$4 >> 2] = $2; //@line 6560
 sp = STACKTOP; //@line 6561
 return;
}
function _mbed_die__async_cb_16($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 6517
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6519
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 6521
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 6522
 _wait_ms(150); //@line 6523
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 11; //@line 6526
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 6527
  HEAP32[$4 >> 2] = $2; //@line 6528
  sp = STACKTOP; //@line 6529
  return;
 }
 ___async_unwind = 0; //@line 6532
 HEAP32[$ReallocAsyncCtx13 >> 2] = 11; //@line 6533
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 6534
 HEAP32[$4 >> 2] = $2; //@line 6535
 sp = STACKTOP; //@line 6536
 return;
}
function _mbed_die__async_cb_15($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 6492
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6494
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 6496
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 6497
 _wait_ms(150); //@line 6498
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 12; //@line 6501
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 6502
  HEAP32[$4 >> 2] = $2; //@line 6503
  sp = STACKTOP; //@line 6504
  return;
 }
 ___async_unwind = 0; //@line 6507
 HEAP32[$ReallocAsyncCtx12 >> 2] = 12; //@line 6508
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 6509
 HEAP32[$4 >> 2] = $2; //@line 6510
 sp = STACKTOP; //@line 6511
 return;
}
function _mbed_die__async_cb_14($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 6467
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6469
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 6471
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 6472
 _wait_ms(150); //@line 6473
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 13; //@line 6476
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 6477
  HEAP32[$4 >> 2] = $2; //@line 6478
  sp = STACKTOP; //@line 6479
  return;
 }
 ___async_unwind = 0; //@line 6482
 HEAP32[$ReallocAsyncCtx11 >> 2] = 13; //@line 6483
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 6484
 HEAP32[$4 >> 2] = $2; //@line 6485
 sp = STACKTOP; //@line 6486
 return;
}
function _mbed_die__async_cb_13($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 6442
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6444
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 6446
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 6447
 _wait_ms(150); //@line 6448
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 14; //@line 6451
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 6452
  HEAP32[$4 >> 2] = $2; //@line 6453
  sp = STACKTOP; //@line 6454
  return;
 }
 ___async_unwind = 0; //@line 6457
 HEAP32[$ReallocAsyncCtx10 >> 2] = 14; //@line 6458
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 6459
 HEAP32[$4 >> 2] = $2; //@line 6460
 sp = STACKTOP; //@line 6461
 return;
}
function _mbed_die__async_cb_18($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 6567
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6569
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 6571
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 6572
 _wait_ms(150); //@line 6573
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 9; //@line 6576
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 6577
  HEAP32[$4 >> 2] = $2; //@line 6578
  sp = STACKTOP; //@line 6579
  return;
 }
 ___async_unwind = 0; //@line 6582
 HEAP32[$ReallocAsyncCtx15 >> 2] = 9; //@line 6583
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 6584
 HEAP32[$4 >> 2] = $2; //@line 6585
 sp = STACKTOP; //@line 6586
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 6192
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6194
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 6196
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 6197
 _wait_ms(150); //@line 6198
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 8; //@line 6201
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 6202
  HEAP32[$4 >> 2] = $2; //@line 6203
  sp = STACKTOP; //@line 6204
  return;
 }
 ___async_unwind = 0; //@line 6207
 HEAP32[$ReallocAsyncCtx16 >> 2] = 8; //@line 6208
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 6209
 HEAP32[$4 >> 2] = $2; //@line 6210
 sp = STACKTOP; //@line 6211
 return;
}
function _mbed_die__async_cb_12($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 6417
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6419
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 6421
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 6422
 _wait_ms(150); //@line 6423
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 15; //@line 6426
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 6427
  HEAP32[$4 >> 2] = $2; //@line 6428
  sp = STACKTOP; //@line 6429
  return;
 }
 ___async_unwind = 0; //@line 6432
 HEAP32[$ReallocAsyncCtx9 >> 2] = 15; //@line 6433
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 6434
 HEAP32[$4 >> 2] = $2; //@line 6435
 sp = STACKTOP; //@line 6436
 return;
}
function _mbed_die__async_cb_11($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 6392
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6394
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 6396
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 6397
 _wait_ms(400); //@line 6398
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 16; //@line 6401
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 6402
  HEAP32[$4 >> 2] = $2; //@line 6403
  sp = STACKTOP; //@line 6404
  return;
 }
 ___async_unwind = 0; //@line 6407
 HEAP32[$ReallocAsyncCtx8 >> 2] = 16; //@line 6408
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 6409
 HEAP32[$4 >> 2] = $2; //@line 6410
 sp = STACKTOP; //@line 6411
 return;
}
function _mbed_die__async_cb_10($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 6367
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6369
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 6371
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 6372
 _wait_ms(400); //@line 6373
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 17; //@line 6376
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 6377
  HEAP32[$4 >> 2] = $2; //@line 6378
  sp = STACKTOP; //@line 6379
  return;
 }
 ___async_unwind = 0; //@line 6382
 HEAP32[$ReallocAsyncCtx7 >> 2] = 17; //@line 6383
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 6384
 HEAP32[$4 >> 2] = $2; //@line 6385
 sp = STACKTOP; //@line 6386
 return;
}
function _mbed_die__async_cb_9($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 6342
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6344
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 6346
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 6347
 _wait_ms(400); //@line 6348
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 18; //@line 6351
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 6352
  HEAP32[$4 >> 2] = $2; //@line 6353
  sp = STACKTOP; //@line 6354
  return;
 }
 ___async_unwind = 0; //@line 6357
 HEAP32[$ReallocAsyncCtx6 >> 2] = 18; //@line 6358
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 6359
 HEAP32[$4 >> 2] = $2; //@line 6360
 sp = STACKTOP; //@line 6361
 return;
}
function _mbed_die__async_cb_8($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 6317
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6319
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 6321
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 6322
 _wait_ms(400); //@line 6323
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 19; //@line 6326
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 6327
  HEAP32[$4 >> 2] = $2; //@line 6328
  sp = STACKTOP; //@line 6329
  return;
 }
 ___async_unwind = 0; //@line 6332
 HEAP32[$ReallocAsyncCtx5 >> 2] = 19; //@line 6333
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 6334
 HEAP32[$4 >> 2] = $2; //@line 6335
 sp = STACKTOP; //@line 6336
 return;
}
function _mbed_die__async_cb_7($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 6292
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6294
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 6296
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 6297
 _wait_ms(400); //@line 6298
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 20; //@line 6301
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 6302
  HEAP32[$4 >> 2] = $2; //@line 6303
  sp = STACKTOP; //@line 6304
  return;
 }
 ___async_unwind = 0; //@line 6307
 HEAP32[$ReallocAsyncCtx4 >> 2] = 20; //@line 6308
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 6309
 HEAP32[$4 >> 2] = $2; //@line 6310
 sp = STACKTOP; //@line 6311
 return;
}
function _mbed_die__async_cb_6($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 6267
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6269
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 6271
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 6272
 _wait_ms(400); //@line 6273
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 21; //@line 6276
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 6277
  HEAP32[$4 >> 2] = $2; //@line 6278
  sp = STACKTOP; //@line 6279
  return;
 }
 ___async_unwind = 0; //@line 6282
 HEAP32[$ReallocAsyncCtx3 >> 2] = 21; //@line 6283
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 6284
 HEAP32[$4 >> 2] = $2; //@line 6285
 sp = STACKTOP; //@line 6286
 return;
}
function _mbed_die__async_cb_5($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6242
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6244
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 6246
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 6247
 _wait_ms(400); //@line 6248
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 22; //@line 6251
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 6252
  HEAP32[$4 >> 2] = $2; //@line 6253
  sp = STACKTOP; //@line 6254
  return;
 }
 ___async_unwind = 0; //@line 6257
 HEAP32[$ReallocAsyncCtx2 >> 2] = 22; //@line 6258
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 6259
 HEAP32[$4 >> 2] = $2; //@line 6260
 sp = STACKTOP; //@line 6261
 return;
}
function _mbed_die__async_cb_4($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6217
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6219
 _emscripten_asm_const_iii(6, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 6221
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 6222
 _wait_ms(400); //@line 6223
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 23; //@line 6226
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 6227
  HEAP32[$4 >> 2] = $2; //@line 6228
  sp = STACKTOP; //@line 6229
  return;
 }
 ___async_unwind = 0; //@line 6232
 HEAP32[$ReallocAsyncCtx >> 2] = 23; //@line 6233
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 6234
 HEAP32[$4 >> 2] = $2; //@line 6235
 sp = STACKTOP; //@line 6236
 return;
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 6945
 newDynamicTop = oldDynamicTop + increment | 0; //@line 6946
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 6950
  ___setErrNo(12); //@line 6951
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 6955
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 6959
   ___setErrNo(12); //@line 6960
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 6964
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 4815
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 4817
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 4823
  $11 = ___fwritex($0, $4, $3) | 0; //@line 4824
  if ($phitmp) {
   $13 = $11; //@line 4826
  } else {
   ___unlockfile($3); //@line 4828
   $13 = $11; //@line 4829
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 4833
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 4837
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 4840
 }
 return $15 | 0; //@line 4842
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4694
 STACKTOP = STACKTOP + 32 | 0; //@line 4695
 $vararg_buffer = sp; //@line 4696
 HEAP32[$0 + 36 >> 2] = 4; //@line 4699
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 4707
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 4709
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 4711
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 4716
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 4719
 STACKTOP = sp; //@line 4720
 return $14 | 0; //@line 4720
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 4932
 $3 = HEAP8[$1 >> 0] | 0; //@line 4934
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 4938
 $7 = HEAP32[$0 >> 2] | 0; //@line 4939
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 4944
  HEAP32[$0 + 4 >> 2] = 0; //@line 4946
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 4948
  HEAP32[$0 + 28 >> 2] = $14; //@line 4950
  HEAP32[$0 + 20 >> 2] = $14; //@line 4952
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 4958
  $$0 = 0; //@line 4959
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 4962
  $$0 = -1; //@line 4963
 }
 return $$0 | 0; //@line 4965
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5860
 do {
  if (!$0) {
   $3 = 0; //@line 5864
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 5866
   $2 = ___dynamic_cast($0, 24, 80, 0) | 0; //@line 5867
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 42; //@line 5870
    sp = STACKTOP; //@line 5871
    return 0; //@line 5872
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5874
    $3 = ($2 | 0) != 0 & 1; //@line 5877
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 5882
}
function _invoke_ticker__async_cb_22($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6749
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 6755
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 6756
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 6757
 FUNCTION_TABLE_vi[$5 & 63]($6); //@line 6758
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 25; //@line 6761
  sp = STACKTOP; //@line 6762
  return;
 }
 ___async_unwind = 0; //@line 6765
 HEAP32[$ReallocAsyncCtx >> 2] = 25; //@line 6766
 sp = STACKTOP; //@line 6767
 return;
}
function _ft6x06_Init($0) {
 $0 = $0 | 0;
 var $$05$i6$ph = 0, $1 = 0, $2 = 0, $5 = 0;
 $1 = $0 & 65535; //@line 48
 $2 = HEAP8[12602] | 0; //@line 49
 do {
  if (($2 & 255 | 0) != ($1 | 0)) {
   $5 = HEAP8[12603] | 0; //@line 54
   if (($5 & 255 | 0) != ($1 | 0)) {
    if (!($2 << 24 >> 24)) {
     $$05$i6$ph = 0; //@line 60
    } else {
     if (!($5 << 24 >> 24)) {
      $$05$i6$ph = 1; //@line 64
     } else {
      break;
     }
    }
    HEAP8[12602 + $$05$i6$ph >> 0] = $0; //@line 71
   }
  }
 } while (0);
 return;
}
function _emscripten_async_resume() {
 ___async = 0; //@line 6800
 ___async_unwind = 1; //@line 6801
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 6807
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 6811
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 6815
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 6817
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
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 5245
 }
 return;
}
function _BSP_LCD_Init() {
 var $$0$i = 0;
 HEAP32[3146] = 65535; //@line 126
 HEAP32[3147] = 112; //@line 127
 HEAP32[3145] = 0; //@line 128
 _BSP_LCD_MspInit(); //@line 129
 if ((_ST7789H2_ReadID() | 0) << 16 >> 16 != 133) {
  $$0$i = 1; //@line 133
  return $$0$i | 0; //@line 134
 }
 _emscripten_asm_const_i(2) | 0; //@line 136
 HEAP32[3147] = 96; //@line 137
 $$0$i = 0; //@line 138
 return $$0$i | 0; //@line 139
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6027
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 6038
  $$0 = 1; //@line 6039
 } else {
  $$0 = 0; //@line 6041
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 6045
 return;
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4505
 STACKTOP = STACKTOP + 16 | 0; //@line 4506
 $vararg_buffer = sp; //@line 4507
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 4511
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 4513
 STACKTOP = sp; //@line 4514
 return $5 | 0; //@line 4514
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 5321
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1260
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1261
 _emscripten_sleep($0 | 0); //@line 1262
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 26; //@line 1265
  sp = STACKTOP; //@line 1266
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1269
  return;
 }
}
function runPostSets() {}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 6777
 HEAP32[new_frame + 4 >> 2] = sp; //@line 6779
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 6781
 ___async_cur_frame = new_frame; //@line 6782
 return ___async_cur_frame + 8 | 0; //@line 6783
}
function _main__async_cb_20($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 6691
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 6692
 _BSP_TS_GetState(12592) | 0; //@line 6693
 if (!___async) {
  ___async_unwind = 0; //@line 6696
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 6698
 sp = STACKTOP; //@line 6699
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 5385
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 5389
  }
 }
 return;
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 5902
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 5906
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 5909
 return;
}
function _puts__async_cb($0) {
 $0 = $0 | 0;
 var $$lobit = 0;
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 6013
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 6016
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 6019
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 5924
 } else {
  $$0 = -1; //@line 5926
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 5929
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
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 7006
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 1190
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 1196
 _emscripten_asm_const_iii(7, $0 | 0, $1 | 0) | 0; //@line 1197
 return;
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 4671
  $$0 = -1; //@line 4672
 } else {
  $$0 = $0; //@line 4674
 }
 return $$0 | 0; //@line 4676
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 6999
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 6992
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
 stackRestore(___async_cur_frame | 0); //@line 6789
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 6790
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 6978
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 4802
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 4806
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 6117
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 6795
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 6796
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 20
 STACK_MAX = stackMax; //@line 21
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 5607
 __ZdlPv($0); //@line 5608
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 5135
 __ZdlPv($0); //@line 5136
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
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 6604
 return;
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 5332
}
function _ST7789H2_ReadID() {
 _LCD_IO_WriteReg(4); //@line 92
 _LCD_IO_ReadData() | 0; //@line 93
 return (_LCD_IO_ReadData() | 0) & 255 | 0; //@line 96
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
 abort(5); //@line 7025
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_1($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 6971
}
function b4(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 abort(4); //@line 7022
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 63](a1 | 0); //@line 6985
}
function b1(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 abort(1); //@line 7013
 return 0; //@line 7013
}
function _LCD_IO_WriteReg($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_ii(0, $0 & 255 | 0) | 0; //@line 113
 return;
}
function _BSP_TS_Init($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 _ft6x06_Init(0); //@line 812
 return 0; //@line 813
}
function _BSP_TS_GetState__async_cb($0) {
 $0 = $0 | 0;
 HEAP8[___async_retval >> 0] = 0; //@line 6612
 return;
}
function b3(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 abort(3); //@line 7019
}
function _BSP_LCD_SetTextColor($0) {
 $0 = $0 | 0;
 HEAP32[3145] = $0 & 65535; //@line 172
 return;
}
function _BSP_LCD_SetBackColor($0) {
 $0 = $0 | 0;
 HEAP32[3146] = $0 & 65535; //@line 180
 return;
}
function _BSP_LCD_GetYSize() {
 return (_ST7789H2_GetLcdPixelHeight() | 0) & 65535 | 0; //@line 165
}
function _BSP_LCD_GetXSize() {
 return (_ST7789H2_GetLcdPixelWidth() | 0) & 65535 | 0; //@line 158
}
function _LCD_IO_ReadData() {
 return (_emscripten_asm_const_i(1) | 0) & 65535 | 0; //@line 121
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 return;
}
function _BSP_LCD_SetFont($0) {
 $0 = $0 | 0;
 HEAP32[3147] = $0; //@line 150
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
function b0(p0) {
 p0 = p0 | 0;
 abort(0); //@line 7010
 return 0; //@line 7010
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 15
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 5122
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
function _ST7789H2_GetLcdPixelHeight() {
 return 240; //@line 106
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 4687
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 4854
}
function _ST7789H2_GetLcdPixelWidth() {
 return 240; //@line 101
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___errno_location() {
 return 12576; //@line 4681
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
function b2(p0) {
 p0 = p0 | 0;
 abort(2); //@line 7016
}
function _core_util_critical_section_enter() {
 return;
}
function _ft6x06_TS_Start($0) {
 $0 = $0 | 0;
 return;
}
function _ft6x06_Reset($0) {
 $0 = $0 | 0;
 return;
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 25
}
function _BSP_LCD_MspInit() {
 return;
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_ii = [b0,___stdio_close];
var FUNCTION_TABLE_iiii = [b1,___stdout_write,___stdio_seek,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,___stdio_write,b1,b1,b1];
var FUNCTION_TABLE_vi = [b2,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,_BSP_TS_GetState__async_cb,_mbed_assert_internal__async_cb,_mbed_die__async_cb_18,_mbed_die__async_cb_17,_mbed_die__async_cb_16,_mbed_die__async_cb_15,_mbed_die__async_cb_14,_mbed_die__async_cb_13,_mbed_die__async_cb_12,_mbed_die__async_cb_11,_mbed_die__async_cb_10,_mbed_die__async_cb_9,_mbed_die__async_cb_8,_mbed_die__async_cb_7,_mbed_die__async_cb_6,_mbed_die__async_cb_5,_mbed_die__async_cb_4,_mbed_die__async_cb,_invoke_ticker__async_cb_22,_invoke_ticker__async_cb,_wait_ms__async_cb,_main__async_cb_19,_main__async_cb
,_main__async_cb_21,_main__async_cb_20,___overflow__async_cb,_puts__async_cb,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_2,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_3,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_1,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2];
var FUNCTION_TABLE_viiii = [b3,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b3];
var FUNCTION_TABLE_viiiii = [b4,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b4];
var FUNCTION_TABLE_viiiiii = [b5,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b5];

  return { ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _invoke_ticker: _invoke_ticker, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, dynCall_vi: dynCall_vi, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

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






//# sourceMappingURL=touchscreen.js.map
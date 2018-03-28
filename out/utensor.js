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

STATICTOP = STATIC_BASE + 1088;
/* global initializers */  __ATINIT__.push();


memoryInitializer = "utensor.js.mem";





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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "invoke_iiii": invoke_iiii, "invoke_vi": invoke_vi, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "___setErrNo": ___setErrNo, "_abort": _abort, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
  var invoke_vi=env.invoke_vi;
  var invoke_viiii=env.invoke_viiii;
  var invoke_viiiii=env.invoke_viiiii;
  var invoke_viiiiii=env.invoke_viiiiii;
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
 sp = STACKTOP; //@line 529
 STACKTOP = STACKTOP + 16 | 0; //@line 530
 $1 = sp; //@line 531
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 538
   $7 = $6 >>> 3; //@line 539
   $8 = HEAP32[144] | 0; //@line 540
   $9 = $8 >>> $7; //@line 541
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 547
    $16 = 616 + ($14 << 1 << 2) | 0; //@line 549
    $17 = $16 + 8 | 0; //@line 550
    $18 = HEAP32[$17 >> 2] | 0; //@line 551
    $19 = $18 + 8 | 0; //@line 552
    $20 = HEAP32[$19 >> 2] | 0; //@line 553
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[144] = $8 & ~(1 << $14); //@line 560
     } else {
      if ((HEAP32[148] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 565
      }
      $27 = $20 + 12 | 0; //@line 568
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 572
       HEAP32[$17 >> 2] = $20; //@line 573
       break;
      } else {
       _abort(); //@line 576
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 581
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 584
    $34 = $18 + $30 + 4 | 0; //@line 586
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 589
    $$0 = $19; //@line 590
    STACKTOP = sp; //@line 591
    return $$0 | 0; //@line 591
   }
   $37 = HEAP32[146] | 0; //@line 593
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 599
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 602
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 605
     $49 = $47 >>> 12 & 16; //@line 607
     $50 = $47 >>> $49; //@line 608
     $52 = $50 >>> 5 & 8; //@line 610
     $54 = $50 >>> $52; //@line 612
     $56 = $54 >>> 2 & 4; //@line 614
     $58 = $54 >>> $56; //@line 616
     $60 = $58 >>> 1 & 2; //@line 618
     $62 = $58 >>> $60; //@line 620
     $64 = $62 >>> 1 & 1; //@line 622
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 625
     $69 = 616 + ($67 << 1 << 2) | 0; //@line 627
     $70 = $69 + 8 | 0; //@line 628
     $71 = HEAP32[$70 >> 2] | 0; //@line 629
     $72 = $71 + 8 | 0; //@line 630
     $73 = HEAP32[$72 >> 2] | 0; //@line 631
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 637
       HEAP32[144] = $77; //@line 638
       $98 = $77; //@line 639
      } else {
       if ((HEAP32[148] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 644
       }
       $80 = $73 + 12 | 0; //@line 647
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 651
        HEAP32[$70 >> 2] = $73; //@line 652
        $98 = $8; //@line 653
        break;
       } else {
        _abort(); //@line 656
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 661
     $84 = $83 - $6 | 0; //@line 662
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 665
     $87 = $71 + $6 | 0; //@line 666
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 669
     HEAP32[$71 + $83 >> 2] = $84; //@line 671
     if ($37 | 0) {
      $92 = HEAP32[149] | 0; //@line 674
      $93 = $37 >>> 3; //@line 675
      $95 = 616 + ($93 << 1 << 2) | 0; //@line 677
      $96 = 1 << $93; //@line 678
      if (!($98 & $96)) {
       HEAP32[144] = $98 | $96; //@line 683
       $$0199 = $95; //@line 685
       $$pre$phiZ2D = $95 + 8 | 0; //@line 685
      } else {
       $101 = $95 + 8 | 0; //@line 687
       $102 = HEAP32[$101 >> 2] | 0; //@line 688
       if ((HEAP32[148] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 692
       } else {
        $$0199 = $102; //@line 695
        $$pre$phiZ2D = $101; //@line 695
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 698
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 700
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 702
      HEAP32[$92 + 12 >> 2] = $95; //@line 704
     }
     HEAP32[146] = $84; //@line 706
     HEAP32[149] = $87; //@line 707
     $$0 = $72; //@line 708
     STACKTOP = sp; //@line 709
     return $$0 | 0; //@line 709
    }
    $108 = HEAP32[145] | 0; //@line 711
    if (!$108) {
     $$0197 = $6; //@line 714
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 718
     $114 = $112 >>> 12 & 16; //@line 720
     $115 = $112 >>> $114; //@line 721
     $117 = $115 >>> 5 & 8; //@line 723
     $119 = $115 >>> $117; //@line 725
     $121 = $119 >>> 2 & 4; //@line 727
     $123 = $119 >>> $121; //@line 729
     $125 = $123 >>> 1 & 2; //@line 731
     $127 = $123 >>> $125; //@line 733
     $129 = $127 >>> 1 & 1; //@line 735
     $134 = HEAP32[880 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 740
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 744
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 750
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 753
      $$0193$lcssa$i = $138; //@line 753
     } else {
      $$01926$i = $134; //@line 755
      $$01935$i = $138; //@line 755
      $146 = $143; //@line 755
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 760
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 761
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 762
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 763
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 769
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 772
        $$0193$lcssa$i = $$$0193$i; //@line 772
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 775
        $$01935$i = $$$0193$i; //@line 775
       }
      }
     }
     $157 = HEAP32[148] | 0; //@line 779
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 782
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 785
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 788
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 792
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 794
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 798
       $176 = HEAP32[$175 >> 2] | 0; //@line 799
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 802
        $179 = HEAP32[$178 >> 2] | 0; //@line 803
        if (!$179) {
         $$3$i = 0; //@line 806
         break;
        } else {
         $$1196$i = $179; //@line 809
         $$1198$i = $178; //@line 809
        }
       } else {
        $$1196$i = $176; //@line 812
        $$1198$i = $175; //@line 812
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 815
        $182 = HEAP32[$181 >> 2] | 0; //@line 816
        if ($182 | 0) {
         $$1196$i = $182; //@line 819
         $$1198$i = $181; //@line 819
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 822
        $185 = HEAP32[$184 >> 2] | 0; //@line 823
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 828
         $$1198$i = $184; //@line 828
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 833
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 836
        $$3$i = $$1196$i; //@line 837
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 842
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 845
       }
       $169 = $167 + 12 | 0; //@line 848
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 852
       }
       $172 = $164 + 8 | 0; //@line 855
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 859
        HEAP32[$172 >> 2] = $167; //@line 860
        $$3$i = $164; //@line 861
        break;
       } else {
        _abort(); //@line 864
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 873
       $191 = 880 + ($190 << 2) | 0; //@line 874
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 879
         if (!$$3$i) {
          HEAP32[145] = $108 & ~(1 << $190); //@line 885
          break L73;
         }
        } else {
         if ((HEAP32[148] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 892
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 900
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[148] | 0; //@line 910
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 913
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 917
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 919
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 925
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 929
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 931
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 937
       if ($214 | 0) {
        if ((HEAP32[148] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 943
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 947
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 949
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 957
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 960
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 962
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 965
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 969
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 972
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 974
      if ($37 | 0) {
       $234 = HEAP32[149] | 0; //@line 977
       $235 = $37 >>> 3; //@line 978
       $237 = 616 + ($235 << 1 << 2) | 0; //@line 980
       $238 = 1 << $235; //@line 981
       if (!($8 & $238)) {
        HEAP32[144] = $8 | $238; //@line 986
        $$0189$i = $237; //@line 988
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 988
       } else {
        $242 = $237 + 8 | 0; //@line 990
        $243 = HEAP32[$242 >> 2] | 0; //@line 991
        if ((HEAP32[148] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 995
        } else {
         $$0189$i = $243; //@line 998
         $$pre$phi$iZ2D = $242; //@line 998
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 1001
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 1003
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 1005
       HEAP32[$234 + 12 >> 2] = $237; //@line 1007
      }
      HEAP32[146] = $$0193$lcssa$i; //@line 1009
      HEAP32[149] = $159; //@line 1010
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 1013
     STACKTOP = sp; //@line 1014
     return $$0 | 0; //@line 1014
    }
   } else {
    $$0197 = $6; //@line 1017
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 1022
   } else {
    $251 = $0 + 11 | 0; //@line 1024
    $252 = $251 & -8; //@line 1025
    $253 = HEAP32[145] | 0; //@line 1026
    if (!$253) {
     $$0197 = $252; //@line 1029
    } else {
     $255 = 0 - $252 | 0; //@line 1031
     $256 = $251 >>> 8; //@line 1032
     if (!$256) {
      $$0358$i = 0; //@line 1035
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 1039
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 1043
       $262 = $256 << $261; //@line 1044
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 1047
       $267 = $262 << $265; //@line 1049
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 1052
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 1057
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 1063
      }
     }
     $282 = HEAP32[880 + ($$0358$i << 2) >> 2] | 0; //@line 1067
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 1071
       $$3$i203 = 0; //@line 1071
       $$3350$i = $255; //@line 1071
       label = 81; //@line 1072
      } else {
       $$0342$i = 0; //@line 1079
       $$0347$i = $255; //@line 1079
       $$0353$i = $282; //@line 1079
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 1079
       $$0362$i = 0; //@line 1079
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 1084
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 1089
          $$435113$i = 0; //@line 1089
          $$435712$i = $$0353$i; //@line 1089
          label = 85; //@line 1090
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 1093
          $$1348$i = $292; //@line 1093
         }
        } else {
         $$1343$i = $$0342$i; //@line 1096
         $$1348$i = $$0347$i; //@line 1096
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 1099
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 1102
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 1106
        $302 = ($$0353$i | 0) == 0; //@line 1107
        if ($302) {
         $$2355$i = $$1363$i; //@line 1112
         $$3$i203 = $$1343$i; //@line 1112
         $$3350$i = $$1348$i; //@line 1112
         label = 81; //@line 1113
         break;
        } else {
         $$0342$i = $$1343$i; //@line 1116
         $$0347$i = $$1348$i; //@line 1116
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 1116
         $$0362$i = $$1363$i; //@line 1116
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 1126
       $309 = $253 & ($306 | 0 - $306); //@line 1129
       if (!$309) {
        $$0197 = $252; //@line 1132
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 1137
       $315 = $313 >>> 12 & 16; //@line 1139
       $316 = $313 >>> $315; //@line 1140
       $318 = $316 >>> 5 & 8; //@line 1142
       $320 = $316 >>> $318; //@line 1144
       $322 = $320 >>> 2 & 4; //@line 1146
       $324 = $320 >>> $322; //@line 1148
       $326 = $324 >>> 1 & 2; //@line 1150
       $328 = $324 >>> $326; //@line 1152
       $330 = $328 >>> 1 & 1; //@line 1154
       $$4$ph$i = 0; //@line 1160
       $$4357$ph$i = HEAP32[880 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 1160
      } else {
       $$4$ph$i = $$3$i203; //@line 1162
       $$4357$ph$i = $$2355$i; //@line 1162
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 1166
       $$4351$lcssa$i = $$3350$i; //@line 1166
      } else {
       $$414$i = $$4$ph$i; //@line 1168
       $$435113$i = $$3350$i; //@line 1168
       $$435712$i = $$4357$ph$i; //@line 1168
       label = 85; //@line 1169
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 1174
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 1178
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 1179
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 1180
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 1181
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1187
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 1190
        $$4351$lcssa$i = $$$4351$i; //@line 1190
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 1193
        $$435113$i = $$$4351$i; //@line 1193
        label = 85; //@line 1194
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 1200
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[146] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[148] | 0; //@line 1206
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 1209
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 1212
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 1215
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 1219
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 1221
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 1225
         $371 = HEAP32[$370 >> 2] | 0; //@line 1226
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 1229
          $374 = HEAP32[$373 >> 2] | 0; //@line 1230
          if (!$374) {
           $$3372$i = 0; //@line 1233
           break;
          } else {
           $$1370$i = $374; //@line 1236
           $$1374$i = $373; //@line 1236
          }
         } else {
          $$1370$i = $371; //@line 1239
          $$1374$i = $370; //@line 1239
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 1242
          $377 = HEAP32[$376 >> 2] | 0; //@line 1243
          if ($377 | 0) {
           $$1370$i = $377; //@line 1246
           $$1374$i = $376; //@line 1246
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 1249
          $380 = HEAP32[$379 >> 2] | 0; //@line 1250
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 1255
           $$1374$i = $379; //@line 1255
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 1260
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 1263
          $$3372$i = $$1370$i; //@line 1264
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 1269
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 1272
         }
         $364 = $362 + 12 | 0; //@line 1275
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 1279
         }
         $367 = $359 + 8 | 0; //@line 1282
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 1286
          HEAP32[$367 >> 2] = $362; //@line 1287
          $$3372$i = $359; //@line 1288
          break;
         } else {
          _abort(); //@line 1291
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 1299
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 1302
         $386 = 880 + ($385 << 2) | 0; //@line 1303
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 1308
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 1313
            HEAP32[145] = $391; //@line 1314
            $475 = $391; //@line 1315
            break L164;
           }
          } else {
           if ((HEAP32[148] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 1322
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 1330
            if (!$$3372$i) {
             $475 = $253; //@line 1333
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[148] | 0; //@line 1341
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 1344
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 1348
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 1350
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 1356
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 1360
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 1362
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 1368
         if (!$409) {
          $475 = $253; //@line 1371
         } else {
          if ((HEAP32[148] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 1376
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 1380
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 1382
           $475 = $253; //@line 1383
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 1392
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 1395
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 1397
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 1400
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 1404
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 1407
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 1409
         $428 = $$4351$lcssa$i >>> 3; //@line 1410
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 616 + ($428 << 1 << 2) | 0; //@line 1414
          $432 = HEAP32[144] | 0; //@line 1415
          $433 = 1 << $428; //@line 1416
          if (!($432 & $433)) {
           HEAP32[144] = $432 | $433; //@line 1421
           $$0368$i = $431; //@line 1423
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 1423
          } else {
           $437 = $431 + 8 | 0; //@line 1425
           $438 = HEAP32[$437 >> 2] | 0; //@line 1426
           if ((HEAP32[148] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 1430
           } else {
            $$0368$i = $438; //@line 1433
            $$pre$phi$i211Z2D = $437; //@line 1433
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 1436
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 1438
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 1440
          HEAP32[$354 + 12 >> 2] = $431; //@line 1442
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 1445
         if (!$444) {
          $$0361$i = 0; //@line 1448
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 1452
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 1456
           $450 = $444 << $449; //@line 1457
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 1460
           $455 = $450 << $453; //@line 1462
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 1465
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 1470
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 1476
          }
         }
         $469 = 880 + ($$0361$i << 2) | 0; //@line 1479
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 1481
         $471 = $354 + 16 | 0; //@line 1482
         HEAP32[$471 + 4 >> 2] = 0; //@line 1484
         HEAP32[$471 >> 2] = 0; //@line 1485
         $473 = 1 << $$0361$i; //@line 1486
         if (!($475 & $473)) {
          HEAP32[145] = $475 | $473; //@line 1491
          HEAP32[$469 >> 2] = $354; //@line 1492
          HEAP32[$354 + 24 >> 2] = $469; //@line 1494
          HEAP32[$354 + 12 >> 2] = $354; //@line 1496
          HEAP32[$354 + 8 >> 2] = $354; //@line 1498
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 1507
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 1507
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 1514
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 1518
          $494 = HEAP32[$492 >> 2] | 0; //@line 1520
          if (!$494) {
           label = 136; //@line 1523
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 1526
           $$0345$i = $494; //@line 1526
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[148] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 1533
          } else {
           HEAP32[$492 >> 2] = $354; //@line 1536
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 1538
           HEAP32[$354 + 12 >> 2] = $354; //@line 1540
           HEAP32[$354 + 8 >> 2] = $354; //@line 1542
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 1547
          $502 = HEAP32[$501 >> 2] | 0; //@line 1548
          $503 = HEAP32[148] | 0; //@line 1549
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 1555
           HEAP32[$501 >> 2] = $354; //@line 1556
           HEAP32[$354 + 8 >> 2] = $502; //@line 1558
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 1560
           HEAP32[$354 + 24 >> 2] = 0; //@line 1562
           break;
          } else {
           _abort(); //@line 1565
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 1572
       STACKTOP = sp; //@line 1573
       return $$0 | 0; //@line 1573
      } else {
       $$0197 = $252; //@line 1575
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[146] | 0; //@line 1582
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 1585
  $515 = HEAP32[149] | 0; //@line 1586
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 1589
   HEAP32[149] = $517; //@line 1590
   HEAP32[146] = $514; //@line 1591
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 1594
   HEAP32[$515 + $512 >> 2] = $514; //@line 1596
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 1599
  } else {
   HEAP32[146] = 0; //@line 1601
   HEAP32[149] = 0; //@line 1602
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 1605
   $526 = $515 + $512 + 4 | 0; //@line 1607
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 1610
  }
  $$0 = $515 + 8 | 0; //@line 1613
  STACKTOP = sp; //@line 1614
  return $$0 | 0; //@line 1614
 }
 $530 = HEAP32[147] | 0; //@line 1616
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 1619
  HEAP32[147] = $532; //@line 1620
  $533 = HEAP32[150] | 0; //@line 1621
  $534 = $533 + $$0197 | 0; //@line 1622
  HEAP32[150] = $534; //@line 1623
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 1626
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 1629
  $$0 = $533 + 8 | 0; //@line 1631
  STACKTOP = sp; //@line 1632
  return $$0 | 0; //@line 1632
 }
 if (!(HEAP32[262] | 0)) {
  HEAP32[264] = 4096; //@line 1637
  HEAP32[263] = 4096; //@line 1638
  HEAP32[265] = -1; //@line 1639
  HEAP32[266] = -1; //@line 1640
  HEAP32[267] = 0; //@line 1641
  HEAP32[255] = 0; //@line 1642
  HEAP32[262] = $1 & -16 ^ 1431655768; //@line 1646
  $548 = 4096; //@line 1647
 } else {
  $548 = HEAP32[264] | 0; //@line 1650
 }
 $545 = $$0197 + 48 | 0; //@line 1652
 $546 = $$0197 + 47 | 0; //@line 1653
 $547 = $548 + $546 | 0; //@line 1654
 $549 = 0 - $548 | 0; //@line 1655
 $550 = $547 & $549; //@line 1656
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 1659
  STACKTOP = sp; //@line 1660
  return $$0 | 0; //@line 1660
 }
 $552 = HEAP32[254] | 0; //@line 1662
 if ($552 | 0) {
  $554 = HEAP32[252] | 0; //@line 1665
  $555 = $554 + $550 | 0; //@line 1666
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 1671
   STACKTOP = sp; //@line 1672
   return $$0 | 0; //@line 1672
  }
 }
 L244 : do {
  if (!(HEAP32[255] & 4)) {
   $561 = HEAP32[150] | 0; //@line 1680
   L246 : do {
    if (!$561) {
     label = 163; //@line 1684
    } else {
     $$0$i$i = 1024; //@line 1686
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 1688
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 1691
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 1700
      if (!$570) {
       label = 163; //@line 1703
       break L246;
      } else {
       $$0$i$i = $570; //@line 1706
      }
     }
     $595 = $547 - $530 & $549; //@line 1710
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 1713
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 1721
       } else {
        $$723947$i = $595; //@line 1723
        $$748$i = $597; //@line 1723
        label = 180; //@line 1724
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 1728
       $$2253$ph$i = $595; //@line 1728
       label = 171; //@line 1729
      }
     } else {
      $$2234243136$i = 0; //@line 1732
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 1738
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 1741
     } else {
      $574 = $572; //@line 1743
      $575 = HEAP32[263] | 0; //@line 1744
      $576 = $575 + -1 | 0; //@line 1745
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 1753
      $584 = HEAP32[252] | 0; //@line 1754
      $585 = $$$i + $584 | 0; //@line 1755
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[254] | 0; //@line 1760
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 1767
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 1771
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 1774
        $$748$i = $572; //@line 1774
        label = 180; //@line 1775
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 1778
        $$2253$ph$i = $$$i; //@line 1778
        label = 171; //@line 1779
       }
      } else {
       $$2234243136$i = 0; //@line 1782
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 1789
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 1798
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 1801
       $$748$i = $$2247$ph$i; //@line 1801
       label = 180; //@line 1802
       break L244;
      }
     }
     $607 = HEAP32[264] | 0; //@line 1806
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 1810
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 1813
      $$748$i = $$2247$ph$i; //@line 1813
      label = 180; //@line 1814
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 1820
      $$2234243136$i = 0; //@line 1821
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 1825
      $$748$i = $$2247$ph$i; //@line 1825
      label = 180; //@line 1826
      break L244;
     }
    }
   } while (0);
   HEAP32[255] = HEAP32[255] | 4; //@line 1833
   $$4236$i = $$2234243136$i; //@line 1834
   label = 178; //@line 1835
  } else {
   $$4236$i = 0; //@line 1837
   label = 178; //@line 1838
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 1844
   $621 = _sbrk(0) | 0; //@line 1845
   $627 = $621 - $620 | 0; //@line 1853
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 1855
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 1863
    $$748$i = $620; //@line 1863
    label = 180; //@line 1864
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[252] | 0) + $$723947$i | 0; //@line 1870
  HEAP32[252] = $633; //@line 1871
  if ($633 >>> 0 > (HEAP32[253] | 0) >>> 0) {
   HEAP32[253] = $633; //@line 1875
  }
  $636 = HEAP32[150] | 0; //@line 1877
  do {
   if (!$636) {
    $638 = HEAP32[148] | 0; //@line 1881
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[148] = $$748$i; //@line 1886
    }
    HEAP32[256] = $$748$i; //@line 1888
    HEAP32[257] = $$723947$i; //@line 1889
    HEAP32[259] = 0; //@line 1890
    HEAP32[153] = HEAP32[262]; //@line 1892
    HEAP32[152] = -1; //@line 1893
    HEAP32[157] = 616; //@line 1894
    HEAP32[156] = 616; //@line 1895
    HEAP32[159] = 624; //@line 1896
    HEAP32[158] = 624; //@line 1897
    HEAP32[161] = 632; //@line 1898
    HEAP32[160] = 632; //@line 1899
    HEAP32[163] = 640; //@line 1900
    HEAP32[162] = 640; //@line 1901
    HEAP32[165] = 648; //@line 1902
    HEAP32[164] = 648; //@line 1903
    HEAP32[167] = 656; //@line 1904
    HEAP32[166] = 656; //@line 1905
    HEAP32[169] = 664; //@line 1906
    HEAP32[168] = 664; //@line 1907
    HEAP32[171] = 672; //@line 1908
    HEAP32[170] = 672; //@line 1909
    HEAP32[173] = 680; //@line 1910
    HEAP32[172] = 680; //@line 1911
    HEAP32[175] = 688; //@line 1912
    HEAP32[174] = 688; //@line 1913
    HEAP32[177] = 696; //@line 1914
    HEAP32[176] = 696; //@line 1915
    HEAP32[179] = 704; //@line 1916
    HEAP32[178] = 704; //@line 1917
    HEAP32[181] = 712; //@line 1918
    HEAP32[180] = 712; //@line 1919
    HEAP32[183] = 720; //@line 1920
    HEAP32[182] = 720; //@line 1921
    HEAP32[185] = 728; //@line 1922
    HEAP32[184] = 728; //@line 1923
    HEAP32[187] = 736; //@line 1924
    HEAP32[186] = 736; //@line 1925
    HEAP32[189] = 744; //@line 1926
    HEAP32[188] = 744; //@line 1927
    HEAP32[191] = 752; //@line 1928
    HEAP32[190] = 752; //@line 1929
    HEAP32[193] = 760; //@line 1930
    HEAP32[192] = 760; //@line 1931
    HEAP32[195] = 768; //@line 1932
    HEAP32[194] = 768; //@line 1933
    HEAP32[197] = 776; //@line 1934
    HEAP32[196] = 776; //@line 1935
    HEAP32[199] = 784; //@line 1936
    HEAP32[198] = 784; //@line 1937
    HEAP32[201] = 792; //@line 1938
    HEAP32[200] = 792; //@line 1939
    HEAP32[203] = 800; //@line 1940
    HEAP32[202] = 800; //@line 1941
    HEAP32[205] = 808; //@line 1942
    HEAP32[204] = 808; //@line 1943
    HEAP32[207] = 816; //@line 1944
    HEAP32[206] = 816; //@line 1945
    HEAP32[209] = 824; //@line 1946
    HEAP32[208] = 824; //@line 1947
    HEAP32[211] = 832; //@line 1948
    HEAP32[210] = 832; //@line 1949
    HEAP32[213] = 840; //@line 1950
    HEAP32[212] = 840; //@line 1951
    HEAP32[215] = 848; //@line 1952
    HEAP32[214] = 848; //@line 1953
    HEAP32[217] = 856; //@line 1954
    HEAP32[216] = 856; //@line 1955
    HEAP32[219] = 864; //@line 1956
    HEAP32[218] = 864; //@line 1957
    $642 = $$723947$i + -40 | 0; //@line 1958
    $644 = $$748$i + 8 | 0; //@line 1960
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 1965
    $650 = $$748$i + $649 | 0; //@line 1966
    $651 = $642 - $649 | 0; //@line 1967
    HEAP32[150] = $650; //@line 1968
    HEAP32[147] = $651; //@line 1969
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 1972
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 1975
    HEAP32[151] = HEAP32[266]; //@line 1977
   } else {
    $$024367$i = 1024; //@line 1979
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 1981
     $658 = $$024367$i + 4 | 0; //@line 1982
     $659 = HEAP32[$658 >> 2] | 0; //@line 1983
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 1987
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 1991
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 1996
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 2010
       $673 = (HEAP32[147] | 0) + $$723947$i | 0; //@line 2012
       $675 = $636 + 8 | 0; //@line 2014
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 2019
       $681 = $636 + $680 | 0; //@line 2020
       $682 = $673 - $680 | 0; //@line 2021
       HEAP32[150] = $681; //@line 2022
       HEAP32[147] = $682; //@line 2023
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 2026
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 2029
       HEAP32[151] = HEAP32[266]; //@line 2031
       break;
      }
     }
    }
    $688 = HEAP32[148] | 0; //@line 2036
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[148] = $$748$i; //@line 2039
     $753 = $$748$i; //@line 2040
    } else {
     $753 = $688; //@line 2042
    }
    $690 = $$748$i + $$723947$i | 0; //@line 2044
    $$124466$i = 1024; //@line 2045
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 2050
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 2054
     if (!$694) {
      $$0$i$i$i = 1024; //@line 2057
      break;
     } else {
      $$124466$i = $694; //@line 2060
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 2069
      $700 = $$124466$i + 4 | 0; //@line 2070
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 2073
      $704 = $$748$i + 8 | 0; //@line 2075
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 2081
      $712 = $690 + 8 | 0; //@line 2083
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 2089
      $722 = $710 + $$0197 | 0; //@line 2093
      $723 = $718 - $710 - $$0197 | 0; //@line 2094
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 2097
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[147] | 0) + $723 | 0; //@line 2102
        HEAP32[147] = $728; //@line 2103
        HEAP32[150] = $722; //@line 2104
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 2107
       } else {
        if ((HEAP32[149] | 0) == ($718 | 0)) {
         $734 = (HEAP32[146] | 0) + $723 | 0; //@line 2113
         HEAP32[146] = $734; //@line 2114
         HEAP32[149] = $722; //@line 2115
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 2118
         HEAP32[$722 + $734 >> 2] = $734; //@line 2120
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 2124
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 2128
         $743 = $739 >>> 3; //@line 2129
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 2134
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 2136
           $750 = 616 + ($743 << 1 << 2) | 0; //@line 2138
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 2144
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 2153
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[144] = HEAP32[144] & ~(1 << $743); //@line 2163
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 2170
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 2174
             }
             $764 = $748 + 8 | 0; //@line 2177
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 2181
              break;
             }
             _abort(); //@line 2184
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 2189
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 2190
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 2193
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 2195
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 2199
             $783 = $782 + 4 | 0; //@line 2200
             $784 = HEAP32[$783 >> 2] | 0; //@line 2201
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 2204
              if (!$786) {
               $$3$i$i = 0; //@line 2207
               break;
              } else {
               $$1291$i$i = $786; //@line 2210
               $$1293$i$i = $782; //@line 2210
              }
             } else {
              $$1291$i$i = $784; //@line 2213
              $$1293$i$i = $783; //@line 2213
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 2216
              $789 = HEAP32[$788 >> 2] | 0; //@line 2217
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 2220
               $$1293$i$i = $788; //@line 2220
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 2223
              $792 = HEAP32[$791 >> 2] | 0; //@line 2224
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 2229
               $$1293$i$i = $791; //@line 2229
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 2234
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 2237
              $$3$i$i = $$1291$i$i; //@line 2238
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 2243
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 2246
             }
             $776 = $774 + 12 | 0; //@line 2249
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 2253
             }
             $779 = $771 + 8 | 0; //@line 2256
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 2260
              HEAP32[$779 >> 2] = $774; //@line 2261
              $$3$i$i = $771; //@line 2262
              break;
             } else {
              _abort(); //@line 2265
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 2275
           $798 = 880 + ($797 << 2) | 0; //@line 2276
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 2281
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[145] = HEAP32[145] & ~(1 << $797); //@line 2290
             break L311;
            } else {
             if ((HEAP32[148] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 2296
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 2304
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[148] | 0; //@line 2314
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 2317
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 2321
           $815 = $718 + 16 | 0; //@line 2322
           $816 = HEAP32[$815 >> 2] | 0; //@line 2323
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 2329
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 2333
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 2335
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 2341
           if (!$822) {
            break;
           }
           if ((HEAP32[148] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 2349
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 2353
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 2355
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 2362
         $$0287$i$i = $742 + $723 | 0; //@line 2362
        } else {
         $$0$i17$i = $718; //@line 2364
         $$0287$i$i = $723; //@line 2364
        }
        $830 = $$0$i17$i + 4 | 0; //@line 2366
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 2369
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 2372
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 2374
        $836 = $$0287$i$i >>> 3; //@line 2375
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 616 + ($836 << 1 << 2) | 0; //@line 2379
         $840 = HEAP32[144] | 0; //@line 2380
         $841 = 1 << $836; //@line 2381
         do {
          if (!($840 & $841)) {
           HEAP32[144] = $840 | $841; //@line 2387
           $$0295$i$i = $839; //@line 2389
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 2389
          } else {
           $845 = $839 + 8 | 0; //@line 2391
           $846 = HEAP32[$845 >> 2] | 0; //@line 2392
           if ((HEAP32[148] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 2396
            $$pre$phi$i19$iZ2D = $845; //@line 2396
            break;
           }
           _abort(); //@line 2399
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 2403
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 2405
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 2407
         HEAP32[$722 + 12 >> 2] = $839; //@line 2409
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 2412
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 2416
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 2420
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 2425
          $858 = $852 << $857; //@line 2426
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 2429
          $863 = $858 << $861; //@line 2431
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 2434
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 2439
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 2445
         }
        } while (0);
        $877 = 880 + ($$0296$i$i << 2) | 0; //@line 2448
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 2450
        $879 = $722 + 16 | 0; //@line 2451
        HEAP32[$879 + 4 >> 2] = 0; //@line 2453
        HEAP32[$879 >> 2] = 0; //@line 2454
        $881 = HEAP32[145] | 0; //@line 2455
        $882 = 1 << $$0296$i$i; //@line 2456
        if (!($881 & $882)) {
         HEAP32[145] = $881 | $882; //@line 2461
         HEAP32[$877 >> 2] = $722; //@line 2462
         HEAP32[$722 + 24 >> 2] = $877; //@line 2464
         HEAP32[$722 + 12 >> 2] = $722; //@line 2466
         HEAP32[$722 + 8 >> 2] = $722; //@line 2468
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 2477
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 2477
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 2484
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 2488
         $902 = HEAP32[$900 >> 2] | 0; //@line 2490
         if (!$902) {
          label = 260; //@line 2493
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 2496
          $$0289$i$i = $902; //@line 2496
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[148] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 2503
         } else {
          HEAP32[$900 >> 2] = $722; //@line 2506
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 2508
          HEAP32[$722 + 12 >> 2] = $722; //@line 2510
          HEAP32[$722 + 8 >> 2] = $722; //@line 2512
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 2517
         $910 = HEAP32[$909 >> 2] | 0; //@line 2518
         $911 = HEAP32[148] | 0; //@line 2519
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 2525
          HEAP32[$909 >> 2] = $722; //@line 2526
          HEAP32[$722 + 8 >> 2] = $910; //@line 2528
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 2530
          HEAP32[$722 + 24 >> 2] = 0; //@line 2532
          break;
         } else {
          _abort(); //@line 2535
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 2542
      STACKTOP = sp; //@line 2543
      return $$0 | 0; //@line 2543
     } else {
      $$0$i$i$i = 1024; //@line 2545
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 2549
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 2554
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 2562
    }
    $927 = $923 + -47 | 0; //@line 2564
    $929 = $927 + 8 | 0; //@line 2566
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 2572
    $936 = $636 + 16 | 0; //@line 2573
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 2575
    $939 = $938 + 8 | 0; //@line 2576
    $940 = $938 + 24 | 0; //@line 2577
    $941 = $$723947$i + -40 | 0; //@line 2578
    $943 = $$748$i + 8 | 0; //@line 2580
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 2585
    $949 = $$748$i + $948 | 0; //@line 2586
    $950 = $941 - $948 | 0; //@line 2587
    HEAP32[150] = $949; //@line 2588
    HEAP32[147] = $950; //@line 2589
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 2592
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 2595
    HEAP32[151] = HEAP32[266]; //@line 2597
    $956 = $938 + 4 | 0; //@line 2598
    HEAP32[$956 >> 2] = 27; //@line 2599
    HEAP32[$939 >> 2] = HEAP32[256]; //@line 2600
    HEAP32[$939 + 4 >> 2] = HEAP32[257]; //@line 2600
    HEAP32[$939 + 8 >> 2] = HEAP32[258]; //@line 2600
    HEAP32[$939 + 12 >> 2] = HEAP32[259]; //@line 2600
    HEAP32[256] = $$748$i; //@line 2601
    HEAP32[257] = $$723947$i; //@line 2602
    HEAP32[259] = 0; //@line 2603
    HEAP32[258] = $939; //@line 2604
    $958 = $940; //@line 2605
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 2607
     HEAP32[$958 >> 2] = 7; //@line 2608
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 2621
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 2624
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 2627
     HEAP32[$938 >> 2] = $964; //@line 2628
     $969 = $964 >>> 3; //@line 2629
     if ($964 >>> 0 < 256) {
      $972 = 616 + ($969 << 1 << 2) | 0; //@line 2633
      $973 = HEAP32[144] | 0; //@line 2634
      $974 = 1 << $969; //@line 2635
      if (!($973 & $974)) {
       HEAP32[144] = $973 | $974; //@line 2640
       $$0211$i$i = $972; //@line 2642
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 2642
      } else {
       $978 = $972 + 8 | 0; //@line 2644
       $979 = HEAP32[$978 >> 2] | 0; //@line 2645
       if ((HEAP32[148] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 2649
       } else {
        $$0211$i$i = $979; //@line 2652
        $$pre$phi$i$iZ2D = $978; //@line 2652
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 2655
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 2657
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 2659
      HEAP32[$636 + 12 >> 2] = $972; //@line 2661
      break;
     }
     $985 = $964 >>> 8; //@line 2664
     if (!$985) {
      $$0212$i$i = 0; //@line 2667
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 2671
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 2675
       $991 = $985 << $990; //@line 2676
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 2679
       $996 = $991 << $994; //@line 2681
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 2684
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 2689
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 2695
      }
     }
     $1010 = 880 + ($$0212$i$i << 2) | 0; //@line 2698
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 2700
     HEAP32[$636 + 20 >> 2] = 0; //@line 2702
     HEAP32[$936 >> 2] = 0; //@line 2703
     $1013 = HEAP32[145] | 0; //@line 2704
     $1014 = 1 << $$0212$i$i; //@line 2705
     if (!($1013 & $1014)) {
      HEAP32[145] = $1013 | $1014; //@line 2710
      HEAP32[$1010 >> 2] = $636; //@line 2711
      HEAP32[$636 + 24 >> 2] = $1010; //@line 2713
      HEAP32[$636 + 12 >> 2] = $636; //@line 2715
      HEAP32[$636 + 8 >> 2] = $636; //@line 2717
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 2726
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 2726
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 2733
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 2737
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 2739
      if (!$1034) {
       label = 286; //@line 2742
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 2745
       $$0207$i$i = $1034; //@line 2745
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[148] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 2752
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 2755
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 2757
       HEAP32[$636 + 12 >> 2] = $636; //@line 2759
       HEAP32[$636 + 8 >> 2] = $636; //@line 2761
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 2766
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 2767
      $1043 = HEAP32[148] | 0; //@line 2768
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 2774
       HEAP32[$1041 >> 2] = $636; //@line 2775
       HEAP32[$636 + 8 >> 2] = $1042; //@line 2777
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 2779
       HEAP32[$636 + 24 >> 2] = 0; //@line 2781
       break;
      } else {
       _abort(); //@line 2784
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[147] | 0; //@line 2791
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 2794
   HEAP32[147] = $1054; //@line 2795
   $1055 = HEAP32[150] | 0; //@line 2796
   $1056 = $1055 + $$0197 | 0; //@line 2797
   HEAP32[150] = $1056; //@line 2798
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 2801
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 2804
   $$0 = $1055 + 8 | 0; //@line 2806
   STACKTOP = sp; //@line 2807
   return $$0 | 0; //@line 2807
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 2811
 $$0 = 0; //@line 2812
 STACKTOP = sp; //@line 2813
 return $$0 | 0; //@line 2813
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 2840
 $3 = HEAP32[148] | 0; //@line 2841
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 2844
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 2848
 $7 = $6 & 3; //@line 2849
 if (($7 | 0) == 1) {
  _abort(); //@line 2852
 }
 $9 = $6 & -8; //@line 2855
 $10 = $2 + $9 | 0; //@line 2856
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 2861
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 2867
   $17 = $13 + $9 | 0; //@line 2868
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 2871
   }
   if ((HEAP32[149] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 2877
    $106 = HEAP32[$105 >> 2] | 0; //@line 2878
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 2882
     $$1382 = $17; //@line 2882
     $114 = $16; //@line 2882
     break;
    }
    HEAP32[146] = $17; //@line 2885
    HEAP32[$105 >> 2] = $106 & -2; //@line 2887
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 2890
    HEAP32[$16 + $17 >> 2] = $17; //@line 2892
    return;
   }
   $21 = $13 >>> 3; //@line 2895
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 2899
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 2901
    $28 = 616 + ($21 << 1 << 2) | 0; //@line 2903
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 2908
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 2915
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[144] = HEAP32[144] & ~(1 << $21); //@line 2925
     $$1 = $16; //@line 2926
     $$1382 = $17; //@line 2926
     $114 = $16; //@line 2926
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 2932
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 2936
     }
     $41 = $26 + 8 | 0; //@line 2939
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 2943
     } else {
      _abort(); //@line 2945
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 2950
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 2951
    $$1 = $16; //@line 2952
    $$1382 = $17; //@line 2952
    $114 = $16; //@line 2952
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 2956
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 2958
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 2962
     $60 = $59 + 4 | 0; //@line 2963
     $61 = HEAP32[$60 >> 2] | 0; //@line 2964
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 2967
      if (!$63) {
       $$3 = 0; //@line 2970
       break;
      } else {
       $$1387 = $63; //@line 2973
       $$1390 = $59; //@line 2973
      }
     } else {
      $$1387 = $61; //@line 2976
      $$1390 = $60; //@line 2976
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 2979
      $66 = HEAP32[$65 >> 2] | 0; //@line 2980
      if ($66 | 0) {
       $$1387 = $66; //@line 2983
       $$1390 = $65; //@line 2983
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 2986
      $69 = HEAP32[$68 >> 2] | 0; //@line 2987
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 2992
       $$1390 = $68; //@line 2992
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 2997
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 3000
      $$3 = $$1387; //@line 3001
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 3006
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 3009
     }
     $53 = $51 + 12 | 0; //@line 3012
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 3016
     }
     $56 = $48 + 8 | 0; //@line 3019
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 3023
      HEAP32[$56 >> 2] = $51; //@line 3024
      $$3 = $48; //@line 3025
      break;
     } else {
      _abort(); //@line 3028
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 3035
    $$1382 = $17; //@line 3035
    $114 = $16; //@line 3035
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 3038
    $75 = 880 + ($74 << 2) | 0; //@line 3039
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 3044
      if (!$$3) {
       HEAP32[145] = HEAP32[145] & ~(1 << $74); //@line 3051
       $$1 = $16; //@line 3052
       $$1382 = $17; //@line 3052
       $114 = $16; //@line 3052
       break L10;
      }
     } else {
      if ((HEAP32[148] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 3059
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 3067
       if (!$$3) {
        $$1 = $16; //@line 3070
        $$1382 = $17; //@line 3070
        $114 = $16; //@line 3070
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[148] | 0; //@line 3078
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 3081
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 3085
    $92 = $16 + 16 | 0; //@line 3086
    $93 = HEAP32[$92 >> 2] | 0; //@line 3087
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 3093
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 3097
       HEAP32[$93 + 24 >> 2] = $$3; //@line 3099
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 3105
    if (!$99) {
     $$1 = $16; //@line 3108
     $$1382 = $17; //@line 3108
     $114 = $16; //@line 3108
    } else {
     if ((HEAP32[148] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 3113
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 3117
      HEAP32[$99 + 24 >> 2] = $$3; //@line 3119
      $$1 = $16; //@line 3120
      $$1382 = $17; //@line 3120
      $114 = $16; //@line 3120
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 3126
   $$1382 = $9; //@line 3126
   $114 = $2; //@line 3126
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 3131
 }
 $115 = $10 + 4 | 0; //@line 3134
 $116 = HEAP32[$115 >> 2] | 0; //@line 3135
 if (!($116 & 1)) {
  _abort(); //@line 3139
 }
 if (!($116 & 2)) {
  if ((HEAP32[150] | 0) == ($10 | 0)) {
   $124 = (HEAP32[147] | 0) + $$1382 | 0; //@line 3149
   HEAP32[147] = $124; //@line 3150
   HEAP32[150] = $$1; //@line 3151
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 3154
   if (($$1 | 0) != (HEAP32[149] | 0)) {
    return;
   }
   HEAP32[149] = 0; //@line 3160
   HEAP32[146] = 0; //@line 3161
   return;
  }
  if ((HEAP32[149] | 0) == ($10 | 0)) {
   $132 = (HEAP32[146] | 0) + $$1382 | 0; //@line 3168
   HEAP32[146] = $132; //@line 3169
   HEAP32[149] = $114; //@line 3170
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 3173
   HEAP32[$114 + $132 >> 2] = $132; //@line 3175
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 3179
  $138 = $116 >>> 3; //@line 3180
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 3185
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 3187
    $145 = 616 + ($138 << 1 << 2) | 0; //@line 3189
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[148] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 3195
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 3202
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[144] = HEAP32[144] & ~(1 << $138); //@line 3212
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 3218
    } else {
     if ((HEAP32[148] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 3223
     }
     $160 = $143 + 8 | 0; //@line 3226
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 3230
     } else {
      _abort(); //@line 3232
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 3237
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 3238
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 3241
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 3243
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 3247
      $180 = $179 + 4 | 0; //@line 3248
      $181 = HEAP32[$180 >> 2] | 0; //@line 3249
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 3252
       if (!$183) {
        $$3400 = 0; //@line 3255
        break;
       } else {
        $$1398 = $183; //@line 3258
        $$1402 = $179; //@line 3258
       }
      } else {
       $$1398 = $181; //@line 3261
       $$1402 = $180; //@line 3261
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 3264
       $186 = HEAP32[$185 >> 2] | 0; //@line 3265
       if ($186 | 0) {
        $$1398 = $186; //@line 3268
        $$1402 = $185; //@line 3268
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 3271
       $189 = HEAP32[$188 >> 2] | 0; //@line 3272
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 3277
        $$1402 = $188; //@line 3277
       }
      }
      if ((HEAP32[148] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 3283
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 3286
       $$3400 = $$1398; //@line 3287
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 3292
      if ((HEAP32[148] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 3296
      }
      $173 = $170 + 12 | 0; //@line 3299
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 3303
      }
      $176 = $167 + 8 | 0; //@line 3306
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 3310
       HEAP32[$176 >> 2] = $170; //@line 3311
       $$3400 = $167; //@line 3312
       break;
      } else {
       _abort(); //@line 3315
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 3323
     $196 = 880 + ($195 << 2) | 0; //@line 3324
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 3329
       if (!$$3400) {
        HEAP32[145] = HEAP32[145] & ~(1 << $195); //@line 3336
        break L108;
       }
      } else {
       if ((HEAP32[148] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 3343
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 3351
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[148] | 0; //@line 3361
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 3364
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 3368
     $213 = $10 + 16 | 0; //@line 3369
     $214 = HEAP32[$213 >> 2] | 0; //@line 3370
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 3376
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 3380
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 3382
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 3388
     if ($220 | 0) {
      if ((HEAP32[148] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 3394
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 3398
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 3400
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 3409
  HEAP32[$114 + $137 >> 2] = $137; //@line 3411
  if (($$1 | 0) == (HEAP32[149] | 0)) {
   HEAP32[146] = $137; //@line 3415
   return;
  } else {
   $$2 = $137; //@line 3418
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 3422
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 3425
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 3427
  $$2 = $$1382; //@line 3428
 }
 $235 = $$2 >>> 3; //@line 3430
 if ($$2 >>> 0 < 256) {
  $238 = 616 + ($235 << 1 << 2) | 0; //@line 3434
  $239 = HEAP32[144] | 0; //@line 3435
  $240 = 1 << $235; //@line 3436
  if (!($239 & $240)) {
   HEAP32[144] = $239 | $240; //@line 3441
   $$0403 = $238; //@line 3443
   $$pre$phiZ2D = $238 + 8 | 0; //@line 3443
  } else {
   $244 = $238 + 8 | 0; //@line 3445
   $245 = HEAP32[$244 >> 2] | 0; //@line 3446
   if ((HEAP32[148] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 3450
   } else {
    $$0403 = $245; //@line 3453
    $$pre$phiZ2D = $244; //@line 3453
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 3456
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 3458
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 3460
  HEAP32[$$1 + 12 >> 2] = $238; //@line 3462
  return;
 }
 $251 = $$2 >>> 8; //@line 3465
 if (!$251) {
  $$0396 = 0; //@line 3468
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 3472
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 3476
   $257 = $251 << $256; //@line 3477
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 3480
   $262 = $257 << $260; //@line 3482
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 3485
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 3490
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 3496
  }
 }
 $276 = 880 + ($$0396 << 2) | 0; //@line 3499
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 3501
 HEAP32[$$1 + 20 >> 2] = 0; //@line 3504
 HEAP32[$$1 + 16 >> 2] = 0; //@line 3505
 $280 = HEAP32[145] | 0; //@line 3506
 $281 = 1 << $$0396; //@line 3507
 do {
  if (!($280 & $281)) {
   HEAP32[145] = $280 | $281; //@line 3513
   HEAP32[$276 >> 2] = $$1; //@line 3514
   HEAP32[$$1 + 24 >> 2] = $276; //@line 3516
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 3518
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 3520
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 3528
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 3528
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 3535
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 3539
    $301 = HEAP32[$299 >> 2] | 0; //@line 3541
    if (!$301) {
     label = 121; //@line 3544
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 3547
     $$0384 = $301; //@line 3547
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[148] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 3554
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 3557
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 3559
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 3561
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 3563
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 3568
    $309 = HEAP32[$308 >> 2] | 0; //@line 3569
    $310 = HEAP32[148] | 0; //@line 3570
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 3576
     HEAP32[$308 >> 2] = $$1; //@line 3577
     HEAP32[$$1 + 8 >> 2] = $309; //@line 3579
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 3581
     HEAP32[$$1 + 24 >> 2] = 0; //@line 3583
     break;
    } else {
     _abort(); //@line 3586
    }
   }
  }
 } while (0);
 $319 = (HEAP32[152] | 0) + -1 | 0; //@line 3593
 HEAP32[152] = $319; //@line 3594
 if (!$319) {
  $$0212$in$i = 1032; //@line 3597
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 3602
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 3608
  }
 }
 HEAP32[152] = -1; //@line 3611
 return;
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
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 3975
 STACKTOP = STACKTOP + 64 | 0; //@line 3976
 $4 = sp; //@line 3977
 $5 = HEAP32[$0 >> 2] | 0; //@line 3978
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 3981
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 3983
 HEAP32[$4 >> 2] = $2; //@line 3984
 HEAP32[$4 + 4 >> 2] = $0; //@line 3986
 HEAP32[$4 + 8 >> 2] = $1; //@line 3988
 HEAP32[$4 + 12 >> 2] = $3; //@line 3990
 $14 = $4 + 16 | 0; //@line 3991
 $15 = $4 + 20 | 0; //@line 3992
 $16 = $4 + 24 | 0; //@line 3993
 $17 = $4 + 28 | 0; //@line 3994
 $18 = $4 + 32 | 0; //@line 3995
 $19 = $4 + 40 | 0; //@line 3996
 dest = $14; //@line 3997
 stop = dest + 36 | 0; //@line 3997
 do {
  HEAP32[dest >> 2] = 0; //@line 3997
  dest = dest + 4 | 0; //@line 3997
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 3997
 HEAP8[$14 + 38 >> 0] = 0; //@line 3997
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 4002
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 4005
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 4006
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 4007
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 28; //@line 4010
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 4012
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 4014
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 4016
    sp = STACKTOP; //@line 4017
    STACKTOP = sp; //@line 4018
    return 0; //@line 4018
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 4020
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 4024
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 4028
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 4031
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 4032
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 4033
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 29; //@line 4036
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 4038
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 4040
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 4042
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 4044
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 4046
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 4048
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 4050
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 4052
    sp = STACKTOP; //@line 4053
    STACKTOP = sp; //@line 4054
    return 0; //@line 4054
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4056
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 4070
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 4078
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 4094
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 4099
  }
 } while (0);
 STACKTOP = sp; //@line 4102
 return $$0 | 0; //@line 4102
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4157
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 4163
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 4169
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 4172
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 4173
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 4174
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 32; //@line 4177
     sp = STACKTOP; //@line 4178
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4181
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 4189
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 4194
     $19 = $1 + 44 | 0; //@line 4195
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 4201
     HEAP8[$22 >> 0] = 0; //@line 4202
     $23 = $1 + 53 | 0; //@line 4203
     HEAP8[$23 >> 0] = 0; //@line 4204
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 4206
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 4209
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 4210
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 4211
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 31; //@line 4214
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 4216
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 4218
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 4220
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 4222
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 4224
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 4226
      sp = STACKTOP; //@line 4227
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 4230
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 4234
      label = 13; //@line 4235
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 4240
       label = 13; //@line 4241
      } else {
       $$037$off039 = 3; //@line 4243
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 4247
      $39 = $1 + 40 | 0; //@line 4248
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 4251
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 4261
        $$037$off039 = $$037$off038; //@line 4262
       } else {
        $$037$off039 = $$037$off038; //@line 4264
       }
      } else {
       $$037$off039 = $$037$off038; //@line 4267
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 4270
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 4277
   }
  }
 } while (0);
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 5159
 }
 ret = dest | 0; //@line 5162
 dest_end = dest + num | 0; //@line 5163
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 5167
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 5168
   dest = dest + 1 | 0; //@line 5169
   src = src + 1 | 0; //@line 5170
   num = num - 1 | 0; //@line 5171
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 5173
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 5174
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 5176
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 5177
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 5178
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 5179
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 5180
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 5181
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 5182
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 5183
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 5184
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 5185
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 5186
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 5187
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 5188
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 5189
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 5190
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 5191
   dest = dest + 64 | 0; //@line 5192
   src = src + 64 | 0; //@line 5193
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 5196
   dest = dest + 4 | 0; //@line 5197
   src = src + 4 | 0; //@line 5198
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 5202
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 5204
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 5205
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 5206
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 5207
   dest = dest + 4 | 0; //@line 5208
   src = src + 4 | 0; //@line 5209
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 5214
  dest = dest + 1 | 0; //@line 5215
  src = src + 1 | 0; //@line 5216
 }
 return ret | 0; //@line 5218
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 3658
 STACKTOP = STACKTOP + 64 | 0; //@line 3659
 $3 = sp; //@line 3660
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 3663
 } else {
  if (!$1) {
   $$2 = 0; //@line 3667
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3669
   $6 = ___dynamic_cast($1, 24, 8, 0) | 0; //@line 3670
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 26; //@line 3673
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 3675
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 3677
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 3679
    sp = STACKTOP; //@line 3680
    STACKTOP = sp; //@line 3681
    return 0; //@line 3681
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3683
   if (!$6) {
    $$2 = 0; //@line 3686
   } else {
    dest = $3 + 4 | 0; //@line 3689
    stop = dest + 52 | 0; //@line 3689
    do {
     HEAP32[dest >> 2] = 0; //@line 3689
     dest = dest + 4 | 0; //@line 3689
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 3690
    HEAP32[$3 + 8 >> 2] = $0; //@line 3692
    HEAP32[$3 + 12 >> 2] = -1; //@line 3694
    HEAP32[$3 + 48 >> 2] = 1; //@line 3696
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 3699
    $18 = HEAP32[$2 >> 2] | 0; //@line 3700
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 3701
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 3702
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 27; //@line 3705
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 3707
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 3709
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 3711
     sp = STACKTOP; //@line 3712
     STACKTOP = sp; //@line 3713
     return 0; //@line 3713
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 3715
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 3722
     $$0 = 1; //@line 3723
    } else {
     $$0 = 0; //@line 3725
    }
    $$2 = $$0; //@line 3727
   }
  }
 }
 STACKTOP = sp; //@line 3731
 return $$2 | 0; //@line 3731
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 5223
 value = value & 255; //@line 5225
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 5228
   ptr = ptr + 1 | 0; //@line 5229
  }
  aligned_end = end & -4 | 0; //@line 5232
  block_aligned_end = aligned_end - 64 | 0; //@line 5233
  value4 = value | value << 8 | value << 16 | value << 24; //@line 5234
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 5237
   HEAP32[ptr + 4 >> 2] = value4; //@line 5238
   HEAP32[ptr + 8 >> 2] = value4; //@line 5239
   HEAP32[ptr + 12 >> 2] = value4; //@line 5240
   HEAP32[ptr + 16 >> 2] = value4; //@line 5241
   HEAP32[ptr + 20 >> 2] = value4; //@line 5242
   HEAP32[ptr + 24 >> 2] = value4; //@line 5243
   HEAP32[ptr + 28 >> 2] = value4; //@line 5244
   HEAP32[ptr + 32 >> 2] = value4; //@line 5245
   HEAP32[ptr + 36 >> 2] = value4; //@line 5246
   HEAP32[ptr + 40 >> 2] = value4; //@line 5247
   HEAP32[ptr + 44 >> 2] = value4; //@line 5248
   HEAP32[ptr + 48 >> 2] = value4; //@line 5249
   HEAP32[ptr + 52 >> 2] = value4; //@line 5250
   HEAP32[ptr + 56 >> 2] = value4; //@line 5251
   HEAP32[ptr + 60 >> 2] = value4; //@line 5252
   ptr = ptr + 64 | 0; //@line 5253
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 5257
   ptr = ptr + 4 | 0; //@line 5258
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 5263
  ptr = ptr + 1 | 0; //@line 5264
 }
 return end - num | 0; //@line 5266
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_19($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 5030
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5032
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5034
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5036
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5038
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 5043
  return;
 }
 dest = $2 + 4 | 0; //@line 5047
 stop = dest + 52 | 0; //@line 5047
 do {
  HEAP32[dest >> 2] = 0; //@line 5047
  dest = dest + 4 | 0; //@line 5047
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 5048
 HEAP32[$2 + 8 >> 2] = $4; //@line 5050
 HEAP32[$2 + 12 >> 2] = -1; //@line 5052
 HEAP32[$2 + 48 >> 2] = 1; //@line 5054
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 5057
 $16 = HEAP32[$6 >> 2] | 0; //@line 5058
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 5059
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 5060
 if (!___async) {
  ___async_unwind = 0; //@line 5063
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 5065
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 5067
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 5069
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 5071
 sp = STACKTOP; //@line 5072
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 3905
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 3912
   $10 = $1 + 16 | 0; //@line 3913
   $11 = HEAP32[$10 >> 2] | 0; //@line 3914
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 3917
    HEAP32[$1 + 24 >> 2] = $4; //@line 3919
    HEAP32[$1 + 36 >> 2] = 1; //@line 3921
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 3931
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 3936
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 3939
    HEAP8[$1 + 54 >> 0] = 1; //@line 3941
    break;
   }
   $21 = $1 + 24 | 0; //@line 3944
   $22 = HEAP32[$21 >> 2] | 0; //@line 3945
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 3948
    $28 = $4; //@line 3949
   } else {
    $28 = $22; //@line 3951
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 3960
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 3764
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 3773
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 3778
      HEAP32[$13 >> 2] = $2; //@line 3779
      $19 = $1 + 40 | 0; //@line 3780
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 3783
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 3793
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 3797
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 3804
    }
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4943
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4945
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4947
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4951
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 4955
  label = 4; //@line 4956
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 4961
   label = 4; //@line 4962
  } else {
   $$037$off039 = 3; //@line 4964
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 4968
  $17 = $8 + 40 | 0; //@line 4969
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 4972
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 4982
    $$037$off039 = $$037$off038; //@line 4983
   } else {
    $$037$off039 = $$037$off038; //@line 4985
   }
  } else {
   $$037$off039 = $$037$off038; //@line 4988
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 4991
 return;
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
   _mbed_assert_internal(299, 304, 528); //@line 413
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
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $10 = 0, $13 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4120
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 4126
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 4129
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 4132
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4133
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 4134
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 30; //@line 4137
    sp = STACKTOP; //@line 4138
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 4141
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
 sp = STACKTOP; //@line 4289
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 4295
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 4298
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 4301
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4302
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 4303
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 33; //@line 4306
    sp = STACKTOP; //@line 4307
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 4310
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
 sp = STACKTOP; //@line 4328
 STACKTOP = STACKTOP + 16 | 0; //@line 4329
 $3 = sp; //@line 4330
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 4332
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 4335
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 4336
 $8 = FUNCTION_TABLE_iiii[$7 & 1]($0, $1, $3) | 0; //@line 4337
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 34; //@line 4340
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 4342
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 4344
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 4346
  sp = STACKTOP; //@line 4347
  STACKTOP = sp; //@line 4348
  return 0; //@line 4348
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 4350
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 4354
 }
 STACKTOP = sp; //@line 4356
 return $8 & 1 | 0; //@line 4356
}
function ___dynamic_cast__async_cb_16($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4819
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4821
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4823
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4829
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 4844
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 4860
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 4865
    break;
   }
  default:
   {
    $$0 = 0; //@line 4869
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 4874
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 3842
 $5 = HEAP32[$4 >> 2] | 0; //@line 3843
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 3847
   HEAP32[$1 + 24 >> 2] = $3; //@line 3849
   HEAP32[$1 + 36 >> 2] = 1; //@line 3851
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 3855
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 3858
    HEAP32[$1 + 24 >> 2] = 2; //@line 3860
    HEAP8[$1 + 54 >> 0] = 1; //@line 3862
    break;
   }
   $10 = $1 + 24 | 0; //@line 3865
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 3869
   }
  }
 } while (0);
 return;
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
 _mbed_error_printf(176, $vararg_buffer); //@line 57
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
 sp = STACKTOP; //@line 4719
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4721
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 4723
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 4724
 _wait_ms(150); //@line 4725
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 10; //@line 4728
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 4729
  HEAP32[$4 >> 2] = $2; //@line 4730
  sp = STACKTOP; //@line 4731
  return;
 }
 ___async_unwind = 0; //@line 4734
 HEAP32[$ReallocAsyncCtx13 >> 2] = 10; //@line 4735
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 4736
 HEAP32[$4 >> 2] = $2; //@line 4737
 sp = STACKTOP; //@line 4738
 return;
}
function _mbed_die__async_cb_12($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 4694
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4696
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 4698
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 4699
 _wait_ms(150); //@line 4700
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 11; //@line 4703
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 4704
  HEAP32[$4 >> 2] = $2; //@line 4705
  sp = STACKTOP; //@line 4706
  return;
 }
 ___async_unwind = 0; //@line 4709
 HEAP32[$ReallocAsyncCtx12 >> 2] = 11; //@line 4710
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 4711
 HEAP32[$4 >> 2] = $2; //@line 4712
 sp = STACKTOP; //@line 4713
 return;
}
function _mbed_die__async_cb_11($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 4669
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4671
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 4673
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 4674
 _wait_ms(150); //@line 4675
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 12; //@line 4678
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 4679
  HEAP32[$4 >> 2] = $2; //@line 4680
  sp = STACKTOP; //@line 4681
  return;
 }
 ___async_unwind = 0; //@line 4684
 HEAP32[$ReallocAsyncCtx11 >> 2] = 12; //@line 4685
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 4686
 HEAP32[$4 >> 2] = $2; //@line 4687
 sp = STACKTOP; //@line 4688
 return;
}
function _mbed_die__async_cb_10($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 4644
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4646
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 4648
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 4649
 _wait_ms(150); //@line 4650
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 13; //@line 4653
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 4654
  HEAP32[$4 >> 2] = $2; //@line 4655
  sp = STACKTOP; //@line 4656
  return;
 }
 ___async_unwind = 0; //@line 4659
 HEAP32[$ReallocAsyncCtx10 >> 2] = 13; //@line 4660
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 4661
 HEAP32[$4 >> 2] = $2; //@line 4662
 sp = STACKTOP; //@line 4663
 return;
}
function _mbed_die__async_cb_15($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 4769
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4771
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 4773
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 4774
 _wait_ms(150); //@line 4775
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 8; //@line 4778
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 4779
  HEAP32[$4 >> 2] = $2; //@line 4780
  sp = STACKTOP; //@line 4781
  return;
 }
 ___async_unwind = 0; //@line 4784
 HEAP32[$ReallocAsyncCtx15 >> 2] = 8; //@line 4785
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 4786
 HEAP32[$4 >> 2] = $2; //@line 4787
 sp = STACKTOP; //@line 4788
 return;
}
function _mbed_die__async_cb_14($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 4744
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4746
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 4748
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 4749
 _wait_ms(150); //@line 4750
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 9; //@line 4753
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 4754
  HEAP32[$4 >> 2] = $2; //@line 4755
  sp = STACKTOP; //@line 4756
  return;
 }
 ___async_unwind = 0; //@line 4759
 HEAP32[$ReallocAsyncCtx14 >> 2] = 9; //@line 4760
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 4761
 HEAP32[$4 >> 2] = $2; //@line 4762
 sp = STACKTOP; //@line 4763
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 4394
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4396
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 4398
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 4399
 _wait_ms(150); //@line 4400
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 7; //@line 4403
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 4404
  HEAP32[$4 >> 2] = $2; //@line 4405
  sp = STACKTOP; //@line 4406
  return;
 }
 ___async_unwind = 0; //@line 4409
 HEAP32[$ReallocAsyncCtx16 >> 2] = 7; //@line 4410
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 4411
 HEAP32[$4 >> 2] = $2; //@line 4412
 sp = STACKTOP; //@line 4413
 return;
}
function _mbed_die__async_cb_9($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 4619
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4621
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 4623
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 4624
 _wait_ms(150); //@line 4625
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 14; //@line 4628
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 4629
  HEAP32[$4 >> 2] = $2; //@line 4630
  sp = STACKTOP; //@line 4631
  return;
 }
 ___async_unwind = 0; //@line 4634
 HEAP32[$ReallocAsyncCtx9 >> 2] = 14; //@line 4635
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 4636
 HEAP32[$4 >> 2] = $2; //@line 4637
 sp = STACKTOP; //@line 4638
 return;
}
function _mbed_die__async_cb_8($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 4594
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4596
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 4598
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 4599
 _wait_ms(400); //@line 4600
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 15; //@line 4603
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 4604
  HEAP32[$4 >> 2] = $2; //@line 4605
  sp = STACKTOP; //@line 4606
  return;
 }
 ___async_unwind = 0; //@line 4609
 HEAP32[$ReallocAsyncCtx8 >> 2] = 15; //@line 4610
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 4611
 HEAP32[$4 >> 2] = $2; //@line 4612
 sp = STACKTOP; //@line 4613
 return;
}
function _mbed_die__async_cb_7($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 4569
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4571
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 4573
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 4574
 _wait_ms(400); //@line 4575
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 16; //@line 4578
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 4579
  HEAP32[$4 >> 2] = $2; //@line 4580
  sp = STACKTOP; //@line 4581
  return;
 }
 ___async_unwind = 0; //@line 4584
 HEAP32[$ReallocAsyncCtx7 >> 2] = 16; //@line 4585
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 4586
 HEAP32[$4 >> 2] = $2; //@line 4587
 sp = STACKTOP; //@line 4588
 return;
}
function _mbed_die__async_cb_6($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 4544
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4546
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 4548
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 4549
 _wait_ms(400); //@line 4550
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 17; //@line 4553
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 4554
  HEAP32[$4 >> 2] = $2; //@line 4555
  sp = STACKTOP; //@line 4556
  return;
 }
 ___async_unwind = 0; //@line 4559
 HEAP32[$ReallocAsyncCtx6 >> 2] = 17; //@line 4560
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 4561
 HEAP32[$4 >> 2] = $2; //@line 4562
 sp = STACKTOP; //@line 4563
 return;
}
function _mbed_die__async_cb_5($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 4519
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4521
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 4523
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 4524
 _wait_ms(400); //@line 4525
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 18; //@line 4528
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 4529
  HEAP32[$4 >> 2] = $2; //@line 4530
  sp = STACKTOP; //@line 4531
  return;
 }
 ___async_unwind = 0; //@line 4534
 HEAP32[$ReallocAsyncCtx5 >> 2] = 18; //@line 4535
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 4536
 HEAP32[$4 >> 2] = $2; //@line 4537
 sp = STACKTOP; //@line 4538
 return;
}
function _mbed_die__async_cb_4($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4494
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4496
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 4498
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 4499
 _wait_ms(400); //@line 4500
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 19; //@line 4503
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 4504
  HEAP32[$4 >> 2] = $2; //@line 4505
  sp = STACKTOP; //@line 4506
  return;
 }
 ___async_unwind = 0; //@line 4509
 HEAP32[$ReallocAsyncCtx4 >> 2] = 19; //@line 4510
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 4511
 HEAP32[$4 >> 2] = $2; //@line 4512
 sp = STACKTOP; //@line 4513
 return;
}
function _mbed_die__async_cb_3($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4469
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4471
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 4473
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 4474
 _wait_ms(400); //@line 4475
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 20; //@line 4478
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 4479
  HEAP32[$4 >> 2] = $2; //@line 4480
  sp = STACKTOP; //@line 4481
  return;
 }
 ___async_unwind = 0; //@line 4484
 HEAP32[$ReallocAsyncCtx3 >> 2] = 20; //@line 4485
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 4486
 HEAP32[$4 >> 2] = $2; //@line 4487
 sp = STACKTOP; //@line 4488
 return;
}
function _mbed_die__async_cb_2($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4444
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4446
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 4448
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 4449
 _wait_ms(400); //@line 4450
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 21; //@line 4453
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 4454
  HEAP32[$4 >> 2] = $2; //@line 4455
  sp = STACKTOP; //@line 4456
  return;
 }
 ___async_unwind = 0; //@line 4459
 HEAP32[$ReallocAsyncCtx2 >> 2] = 21; //@line 4460
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 4461
 HEAP32[$4 >> 2] = $2; //@line 4462
 sp = STACKTOP; //@line 4463
 return;
}
function _mbed_die__async_cb_1($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4419
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4421
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 4423
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 4424
 _wait_ms(400); //@line 4425
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 22; //@line 4428
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 4429
  HEAP32[$4 >> 2] = $2; //@line 4430
  sp = STACKTOP; //@line 4431
  return;
 }
 ___async_unwind = 0; //@line 4434
 HEAP32[$ReallocAsyncCtx >> 2] = 22; //@line 4435
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 4436
 HEAP32[$4 >> 2] = $2; //@line 4437
 sp = STACKTOP; //@line 4438
 return;
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 5274
 newDynamicTop = oldDynamicTop + increment | 0; //@line 5275
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 5279
  ___setErrNo(12); //@line 5280
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 5284
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 5288
   ___setErrNo(12); //@line 5289
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 5293
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4361
 do {
  if (!$0) {
   $3 = 0; //@line 4365
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4367
   $2 = ___dynamic_cast($0, 24, 80, 0) | 0; //@line 4368
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 35; //@line 4371
    sp = STACKTOP; //@line 4372
    return 0; //@line 4373
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 4375
    $3 = ($2 | 0) != 0 & 1; //@line 4378
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 4383
}
function _invoke_ticker__async_cb_17($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4892
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 4898
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 4899
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 4900
 FUNCTION_TABLE_vi[$5 & 63]($6); //@line 4901
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 24; //@line 4904
  sp = STACKTOP; //@line 4905
  return;
 }
 ___async_unwind = 0; //@line 4908
 HEAP32[$ReallocAsyncCtx >> 2] = 24; //@line 4909
 sp = STACKTOP; //@line 4910
 return;
}
function _emscripten_async_resume() {
 ___async = 0; //@line 5129
 ___async_unwind = 1; //@line 5130
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 5136
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 5140
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 5144
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 5146
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
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 3746
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5005
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 5016
  $$0 = 1; //@line 5017
 } else {
  $$0 = 0; //@line 5019
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 5023
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 3822
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
function runPostSets() {}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 5106
 HEAP32[new_frame + 4 >> 2] = sp; //@line 5108
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 5110
 ___async_cur_frame = new_frame; //@line 5111
 return ___async_cur_frame + 8 | 0; //@line 5112
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 3886
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 3890
  }
 }
 return;
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 4925
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 4929
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 4932
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
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 5328
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
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 5321
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 5314
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
 stackRestore(___async_cur_frame | 0); //@line 5118
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 5119
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 1](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 5300
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 4805
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 5124
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 5125
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 20
 STACK_MAX = stackMax; //@line 21
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 4108
 __ZdlPv($0); //@line 4109
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 3636
 __ZdlPv($0); //@line 3637
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
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 5084
 return;
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 3833
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b4(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 abort(4); //@line 5344
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_18($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b3(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 abort(3); //@line 5341
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 63](a1 | 0); //@line 5307
}
function b0(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 abort(0); //@line 5332
 return 0; //@line 5332
}
function b2(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 abort(2); //@line 5338
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
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 15
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 3623
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
 return 1072; //@line 3617
}
function _wait_ms__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function stackSave() {
 return STACKTOP | 0; //@line 11
}
function b1(p0) {
 p0 = p0 | 0;
 abort(1); //@line 5335
}
function _core_util_critical_section_enter() {
 return;
}
function setAsync() {
 ___async = 1; //@line 25
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_iiii = [b0,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv];
var FUNCTION_TABLE_vi = [b1,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,_mbed_assert_internal__async_cb,_mbed_die__async_cb_15,_mbed_die__async_cb_14,_mbed_die__async_cb_13,_mbed_die__async_cb_12,_mbed_die__async_cb_11,_mbed_die__async_cb_10,_mbed_die__async_cb_9,_mbed_die__async_cb_8,_mbed_die__async_cb_7,_mbed_die__async_cb_6,_mbed_die__async_cb_5,_mbed_die__async_cb_4,_mbed_die__async_cb_3,_mbed_die__async_cb_2,_mbed_die__async_cb_1,_mbed_die__async_cb,_invoke_ticker__async_cb_17,_invoke_ticker__async_cb,_wait_ms__async_cb,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_19,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb
,___dynamic_cast__async_cb_16,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_18,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1,b1,b1];
var FUNCTION_TABLE_viiii = [b2,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b2];
var FUNCTION_TABLE_viiiii = [b3,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b3];
var FUNCTION_TABLE_viiiiii = [b4,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b4];

  return { ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _invoke_ticker: _invoke_ticker, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_iiii: dynCall_iiii, dynCall_vi: dynCall_vi, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
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


Module["noExitRuntime"] = true;

run();

// {{POST_RUN_ADDITIONS}}





// {{MODULE_ADDITIONS}}






//# sourceMappingURL=utensor.js.map
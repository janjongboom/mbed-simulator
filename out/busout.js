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
    Module['printErr']('node.js exiting due to unhandled promise rejection');
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
else {
  // Unreachable because SHELL is dependent on the others
  throw new Error('unknown runtime environment');
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

// stack management, and other functionality that is provided by the compiled code,
// should not be used before it is ready
stackSave = stackRestore = stackAlloc = setTempRet0 = getTempRet0 = function() {
  abort('cannot use the stack before compiled code is ready to run, and has provided stack access');
};

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
  if (typeof sig === 'undefined') {
    Module.printErr('Warning: addFunction: Provide a wasm function signature ' +
                    'string as a second argument');
  }
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
    assert(args.length == sig.length-1);
    assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
    return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
  } else {
    assert(sig.length == 1);
    assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
    return Module['dynCall_' + sig].call(null, ptr);
  }
}


function getCompilerSetting(name) {
  throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for getCompilerSetting or emscripten_get_compiler_setting to work';
}

var Runtime = {
  // FIXME backwards compatibility layer for ports. Support some Runtime.*
  //       for now, fix it there, then remove it from here. That way we
  //       can minimize any period of breakage.
  dynCall: dynCall, // for SDL2 port
  // helpful errors
  getTempRet0: function() { abort('getTempRet0() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
  staticAlloc: function() { abort('staticAlloc() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
  stackAlloc: function() { abort('stackAlloc() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
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
  assert(returnType !== 'array', 'Return type should not be "array".');
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
    assert(type, 'Must know what type to store in allocate!');

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
    assert(ptr + i < TOTAL_MEMORY);
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
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
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
  assert(ptr % 2 == 0, 'Pointer passed to UTF16ToString must be aligned to two bytes!');
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
  assert(outPtr % 2 == 0, 'Pointer passed to stringToUTF16 must be aligned to two bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
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
  assert(ptr % 4 == 0, 'Pointer passed to UTF32ToString must be aligned to four bytes!');
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
  assert(outPtr % 4 == 0, 'Pointer passed to stringToUTF32 must be aligned to four bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
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
  warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
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


// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  assert((STACK_MAX & 3) == 0);
  HEAPU32[(STACK_MAX >> 2)-1] = 0x02135467;
  HEAPU32[(STACK_MAX >> 2)-2] = 0x89BACDFE;
}

function checkStackCookie() {
  if (HEAPU32[(STACK_MAX >> 2)-1] != 0x02135467 || HEAPU32[(STACK_MAX >> 2)-2] != 0x89BACDFE) {
    abort('Stack overflow! Stack cookie has been overwritten, expected hex dwords 0x89BACDFE and 0x02135467, but received 0x' + HEAPU32[(STACK_MAX >> 2)-2].toString(16) + ' ' + HEAPU32[(STACK_MAX >> 2)-1].toString(16));
  }
  // Also test the global address 0 for integrity. This check is not compatible with SAFE_SPLIT_MEMORY though, since that mode already tests all address 0 accesses on its own.
  if (HEAP32[0] !== 0x63736d65 /* 'emsc' */) throw 'Runtime error: The application has corrupted its heap memory area (address zero)!';
}

function abortStackOverflow(allocSize) {
  abort('Stack overflow! Attempted to allocate ' + allocSize + ' bytes on the stack, but stack has only ' + (STACK_MAX - stackSave() + allocSize) + ' bytes available!');
}

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
// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && Int32Array.prototype.subarray !== undefined && Int32Array.prototype.set !== undefined,
       'JS engine does not provide full typed array support');



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
  assert(buffer.byteLength === TOTAL_MEMORY, 'provided buffer should be ' + TOTAL_MEMORY + ' bytes, but it is ' + buffer.byteLength);
} else {
  // Use a WebAssembly memory where available
  {
    buffer = new ArrayBuffer(TOTAL_MEMORY);
  }
  assert(buffer.byteLength === TOTAL_MEMORY);
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
  checkStackCookie();
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  checkStackCookie();
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  checkStackCookie();
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  checkStackCookie();
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
  assert(array.length >= 0, 'writeArrayToMemory array must have a length (should be an array or typed array)')
  HEAP8.set(array, buffer);
}

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
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

assert(Math['imul'] && Math['fround'] && Math['clz32'] && Math['trunc'], 'this is a legacy browser, build with LEGACY_VM_SUPPORT');

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
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval !== 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function() {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            Module.printErr('still waiting on run dependencies:');
          }
          Module.printErr('dependency: ' + dep);
        }
        if (shown) {
          Module.printErr('(end of list)');
        }
      }, 10000);
    }
  } else {
    Module.printErr('warning: run dependency added without ID');
  }
}

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    Module.printErr('warning: run dependency removed without ID');
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



var /* show errors on likely calls to FS when it was not included */ FS = {
  error: function() {
    abort('Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with  -s FORCE_FILESYSTEM=1');
  },
  init: function() { FS.error() },
  createDataFile: function() { FS.error() },
  createPreloadedFile: function() { FS.error() },
  createLazyFile: function() { FS.error() },
  open: function() { FS.error() },
  mkdev: function() { FS.error() },
  registerDevice: function() { FS.error() },
  analyzePath: function() { FS.error() },
  loadFilesFromDB: function() { FS.error() },

  ErrnoError: function ErrnoError() { FS.error() },
};
Module['FS_createDataFile'] = FS.createDataFile;
Module['FS_createPreloadedFile'] = FS.createPreloadedFile;



// Prefix of data URIs emitted by SINGLE_FILE and related options.
var dataURIPrefix = 'data:application/octet-stream;base64,';

// Indicates whether filename is a base64 data URI.
function isDataURI(filename) {
  return String.prototype.startsWith ?
      filename.startsWith(dataURIPrefix) :
      filename.indexOf(dataURIPrefix) === 0;
}





// === Body ===

var ASM_CONSTS = [function() { console.log('rx_frame', Date.now()); },
 function() { return Date.now(); },
 function($0, $1) { MbedJSHal.gpio.write($0, $1); },
 function($0, $1) { MbedJSHal.gpio.init_out($0, $1, 0); }];

function _emscripten_asm_const_iii(code, a0, a1) {
  return ASM_CONSTS[code](a0, a1);
}

function _emscripten_asm_const_i(code) {
  return ASM_CONSTS[code]();
}




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 5840;
/* global initializers */  __ATINIT__.push({ func: function() { __GLOBAL__sub_I_main_cpp() } });


memoryInitializer = "busout.js.mem";





/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

assert(tempDoublePtr % 8 == 0);

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

  function ___lock() {}

  
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
        console.error('emscripten_set_main_loop_timing: Cannot set timing mode for main loop since a main loop does not exist! Call emscripten_set_main_loop first to set one up.');
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
  
        checkStackCookie();
  
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
          assert(typeof url == 'string', 'createObjectURL must return a url as a string');
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
            assert(typeof url == 'string', 'createObjectURL must return a url as a string');
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
          // If this assert lands, it's likely because the browser doesn't support scrollX or pageXOffset
          // and we have no viable fallback.
          assert((typeof scrollX !== 'undefined') && (typeof scrollY !== 'undefined'), 'Unable to retrieve scroll position, mouse positions likely broken.');
  
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
      else Module.printErr('failed to set errno from JS');
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

assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");

var ASSERTIONS = true;

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



var debug_table_i = ["0"];
var debug_table_ii = ["0", "___stdio_close"];
var debug_table_iiii = ["0", "___stdout_write", "___stdio_seek", "_sn_write", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv", "___stdio_write", "0", "0"];
var debug_table_v = ["0"];
var debug_table_vi = ["0", "__ZN4mbed6BusOutD2Ev", "__ZN4mbed6BusOutD0Ev", "__ZN4mbed6BusOut4lockEv", "__ZN4mbed6BusOut6unlockEv", "_mbed_trace_default_print", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "__ZN10__cxxabiv121__vmi_class_type_infoD0Ev", "__ZN4mbed6BusOutC2E7PinNameS1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1___async_cb", "__ZN4mbed6BusOut5writeEi__async_cb", "__ZN4mbed6BusOut5writeEi__async_cb_61", "__ZN4mbed6BusOutaSEi__async_cb", "_mbed_trace_default_print__async_cb", "_mbed_tracef__async_cb", "_mbed_vtracef__async_cb", "_mbed_vtracef__async_cb_14", "_mbed_vtracef__async_cb_4", "_mbed_vtracef__async_cb_5", "_mbed_vtracef__async_cb_6", "_mbed_vtracef__async_cb_13", "_mbed_vtracef__async_cb_7", "_mbed_vtracef__async_cb_12", "_mbed_vtracef__async_cb_8", "_mbed_vtracef__async_cb_9", "_mbed_vtracef__async_cb_10", "_mbed_vtracef__async_cb_11", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_29", "_mbed_die__async_cb_28", "_mbed_die__async_cb_27", "_mbed_die__async_cb_26", "_mbed_die__async_cb_25", "_mbed_die__async_cb_24", "_mbed_die__async_cb_23", "_mbed_die__async_cb_22", "_mbed_die__async_cb_21", "_mbed_die__async_cb_20", "_mbed_die__async_cb_19", "_mbed_die__async_cb_18", "_mbed_die__async_cb_17", "_mbed_die__async_cb_16", "_mbed_die__async_cb_15", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_vfprintf__async_cb", "_mbed_error_vfprintf__async_cb_76", "_mbed_error_vfprintf__async_cb_75", "_serial_putc__async_cb_74", "_serial_putc__async_cb", "_invoke_ticker__async_cb_69", "_invoke_ticker__async_cb", "_wait__async_cb", "_wait_ms__async_cb", "__GLOBAL__sub_I_main_cpp__async_cb", "_main__async_cb_44", "_main__async_cb_60", "_main__async_cb_43", "_main__async_cb_59", "_main__async_cb_42", "_main__async_cb_58", "_main__async_cb_41", "_main__async_cb_57", "_main__async_cb_40", "_main__async_cb_56", "_main__async_cb_39", "_main__async_cb_55", "_main__async_cb_38", "_main__async_cb_54", "_main__async_cb_37", "_main__async_cb_53", "_main__async_cb_36", "_main__async_cb_52", "_main__async_cb_35", "_main__async_cb_51", "_main__async_cb_34", "_main__async_cb_50", "_main__async_cb_33", "_main__async_cb_49", "_main__async_cb_32", "_main__async_cb_48", "_main__async_cb_31", "_main__async_cb_47", "_main__async_cb_30", "_main__async_cb_46", "_main__async_cb", "_main__async_cb_45", "_putc__async_cb_73", "_putc__async_cb", "___overflow__async_cb", "_fflush__async_cb_2", "_fflush__async_cb_1", "_fflush__async_cb_3", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_63", "_vfprintf__async_cb", "_snprintf__async_cb", "_vsnprintf__async_cb", "_puts__async_cb", "__Znwj__async_cb", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_68", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_62", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_71", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_70", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_67", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_66", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_65", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_64", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_72", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0"];
var debug_table_viiii = ["0", "__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi"];
var debug_table_viiiii = ["0", "__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib"];
var debug_table_viiiiii = ["0", "__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib"];
function nullFunc_i(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'i'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  "); abort(x) }

function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: i: " + debug_table_i[x] + "  iiii: " + debug_table_iiii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  "); abort(x) }

function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  viiii: " + debug_table_viiii[x] + "  vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  "); abort(x) }

function nullFunc_v(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  i: " + debug_table_i[x] + "  ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  i: " + debug_table_i[x] + "  ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_viiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  "); abort(x) }

function nullFunc_viiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viiii: " + debug_table_viiii[x] + "  vi: " + debug_table_vi[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  "); abort(x) }

function nullFunc_viiiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  "); abort(x) }

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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_i": nullFunc_i, "nullFunc_ii": nullFunc_ii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_v": nullFunc_v, "nullFunc_vi": nullFunc_vi, "nullFunc_viiii": nullFunc_viiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "invoke_i": invoke_i, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "___gxx_personality_v0": ___gxx_personality_v0, "___lock": ___lock, "___resumeException": ___resumeException, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___unlock": ___unlock, "_abort": _abort, "_emscripten_asm_const_i": _emscripten_asm_const_i, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
  var abortStackOverflow=env.abortStackOverflow;
  var nullFunc_i=env.nullFunc_i;
  var nullFunc_ii=env.nullFunc_ii;
  var nullFunc_iiii=env.nullFunc_iiii;
  var nullFunc_v=env.nullFunc_v;
  var nullFunc_vi=env.nullFunc_vi;
  var nullFunc_viiii=env.nullFunc_viiii;
  var nullFunc_viiiii=env.nullFunc_viiiii;
  var nullFunc_viiiiii=env.nullFunc_viiiiii;
  var invoke_i=env.invoke_i;
  var invoke_ii=env.invoke_ii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_v=env.invoke_v;
  var invoke_vi=env.invoke_vi;
  var invoke_viiii=env.invoke_viiii;
  var invoke_viiiii=env.invoke_viiiii;
  var invoke_viiiiii=env.invoke_viiiiii;
  var __ZSt18uncaught_exceptionv=env.__ZSt18uncaught_exceptionv;
  var ___cxa_find_matching_catch=env.___cxa_find_matching_catch;
  var ___gxx_personality_v0=env.___gxx_personality_v0;
  var ___lock=env.___lock;
  var ___resumeException=env.___resumeException;
  var ___setErrNo=env.___setErrNo;
  var ___syscall140=env.___syscall140;
  var ___syscall146=env.___syscall146;
  var ___syscall54=env.___syscall54;
  var ___syscall6=env.___syscall6;
  var ___unlock=env.___unlock;
  var _abort=env._abort;
  var _emscripten_asm_const_i=env._emscripten_asm_const_i;
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
 sp = STACKTOP; //@line 2448
 STACKTOP = STACKTOP + 16 | 0; //@line 2449
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2449
 $1 = sp; //@line 2450
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 2457
   $7 = $6 >>> 3; //@line 2458
   $8 = HEAP32[1056] | 0; //@line 2459
   $9 = $8 >>> $7; //@line 2460
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 2466
    $16 = 4264 + ($14 << 1 << 2) | 0; //@line 2468
    $17 = $16 + 8 | 0; //@line 2469
    $18 = HEAP32[$17 >> 2] | 0; //@line 2470
    $19 = $18 + 8 | 0; //@line 2471
    $20 = HEAP32[$19 >> 2] | 0; //@line 2472
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1056] = $8 & ~(1 << $14); //@line 2479
     } else {
      if ((HEAP32[1060] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 2484
      }
      $27 = $20 + 12 | 0; //@line 2487
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 2491
       HEAP32[$17 >> 2] = $20; //@line 2492
       break;
      } else {
       _abort(); //@line 2495
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 2500
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 2503
    $34 = $18 + $30 + 4 | 0; //@line 2505
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 2508
    $$0 = $19; //@line 2509
    STACKTOP = sp; //@line 2510
    return $$0 | 0; //@line 2510
   }
   $37 = HEAP32[1058] | 0; //@line 2512
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 2518
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 2521
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 2524
     $49 = $47 >>> 12 & 16; //@line 2526
     $50 = $47 >>> $49; //@line 2527
     $52 = $50 >>> 5 & 8; //@line 2529
     $54 = $50 >>> $52; //@line 2531
     $56 = $54 >>> 2 & 4; //@line 2533
     $58 = $54 >>> $56; //@line 2535
     $60 = $58 >>> 1 & 2; //@line 2537
     $62 = $58 >>> $60; //@line 2539
     $64 = $62 >>> 1 & 1; //@line 2541
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 2544
     $69 = 4264 + ($67 << 1 << 2) | 0; //@line 2546
     $70 = $69 + 8 | 0; //@line 2547
     $71 = HEAP32[$70 >> 2] | 0; //@line 2548
     $72 = $71 + 8 | 0; //@line 2549
     $73 = HEAP32[$72 >> 2] | 0; //@line 2550
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 2556
       HEAP32[1056] = $77; //@line 2557
       $98 = $77; //@line 2558
      } else {
       if ((HEAP32[1060] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 2563
       }
       $80 = $73 + 12 | 0; //@line 2566
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 2570
        HEAP32[$70 >> 2] = $73; //@line 2571
        $98 = $8; //@line 2572
        break;
       } else {
        _abort(); //@line 2575
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 2580
     $84 = $83 - $6 | 0; //@line 2581
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 2584
     $87 = $71 + $6 | 0; //@line 2585
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 2588
     HEAP32[$71 + $83 >> 2] = $84; //@line 2590
     if ($37 | 0) {
      $92 = HEAP32[1061] | 0; //@line 2593
      $93 = $37 >>> 3; //@line 2594
      $95 = 4264 + ($93 << 1 << 2) | 0; //@line 2596
      $96 = 1 << $93; //@line 2597
      if (!($98 & $96)) {
       HEAP32[1056] = $98 | $96; //@line 2602
       $$0199 = $95; //@line 2604
       $$pre$phiZ2D = $95 + 8 | 0; //@line 2604
      } else {
       $101 = $95 + 8 | 0; //@line 2606
       $102 = HEAP32[$101 >> 2] | 0; //@line 2607
       if ((HEAP32[1060] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 2611
       } else {
        $$0199 = $102; //@line 2614
        $$pre$phiZ2D = $101; //@line 2614
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 2617
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 2619
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 2621
      HEAP32[$92 + 12 >> 2] = $95; //@line 2623
     }
     HEAP32[1058] = $84; //@line 2625
     HEAP32[1061] = $87; //@line 2626
     $$0 = $72; //@line 2627
     STACKTOP = sp; //@line 2628
     return $$0 | 0; //@line 2628
    }
    $108 = HEAP32[1057] | 0; //@line 2630
    if (!$108) {
     $$0197 = $6; //@line 2633
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 2637
     $114 = $112 >>> 12 & 16; //@line 2639
     $115 = $112 >>> $114; //@line 2640
     $117 = $115 >>> 5 & 8; //@line 2642
     $119 = $115 >>> $117; //@line 2644
     $121 = $119 >>> 2 & 4; //@line 2646
     $123 = $119 >>> $121; //@line 2648
     $125 = $123 >>> 1 & 2; //@line 2650
     $127 = $123 >>> $125; //@line 2652
     $129 = $127 >>> 1 & 1; //@line 2654
     $134 = HEAP32[4528 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 2659
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 2663
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2669
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 2672
      $$0193$lcssa$i = $138; //@line 2672
     } else {
      $$01926$i = $134; //@line 2674
      $$01935$i = $138; //@line 2674
      $146 = $143; //@line 2674
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 2679
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 2680
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 2681
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 2682
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2688
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 2691
        $$0193$lcssa$i = $$$0193$i; //@line 2691
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 2694
        $$01935$i = $$$0193$i; //@line 2694
       }
      }
     }
     $157 = HEAP32[1060] | 0; //@line 2698
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 2701
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 2704
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 2707
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 2711
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 2713
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 2717
       $176 = HEAP32[$175 >> 2] | 0; //@line 2718
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 2721
        $179 = HEAP32[$178 >> 2] | 0; //@line 2722
        if (!$179) {
         $$3$i = 0; //@line 2725
         break;
        } else {
         $$1196$i = $179; //@line 2728
         $$1198$i = $178; //@line 2728
        }
       } else {
        $$1196$i = $176; //@line 2731
        $$1198$i = $175; //@line 2731
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 2734
        $182 = HEAP32[$181 >> 2] | 0; //@line 2735
        if ($182 | 0) {
         $$1196$i = $182; //@line 2738
         $$1198$i = $181; //@line 2738
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 2741
        $185 = HEAP32[$184 >> 2] | 0; //@line 2742
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 2747
         $$1198$i = $184; //@line 2747
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 2752
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 2755
        $$3$i = $$1196$i; //@line 2756
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 2761
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 2764
       }
       $169 = $167 + 12 | 0; //@line 2767
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 2771
       }
       $172 = $164 + 8 | 0; //@line 2774
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 2778
        HEAP32[$172 >> 2] = $167; //@line 2779
        $$3$i = $164; //@line 2780
        break;
       } else {
        _abort(); //@line 2783
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 2792
       $191 = 4528 + ($190 << 2) | 0; //@line 2793
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 2798
         if (!$$3$i) {
          HEAP32[1057] = $108 & ~(1 << $190); //@line 2804
          break L73;
         }
        } else {
         if ((HEAP32[1060] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 2811
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 2819
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1060] | 0; //@line 2829
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 2832
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 2836
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 2838
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 2844
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 2848
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 2850
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 2856
       if ($214 | 0) {
        if ((HEAP32[1060] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 2862
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 2866
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 2868
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 2876
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 2879
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 2881
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 2884
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 2888
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 2891
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 2893
      if ($37 | 0) {
       $234 = HEAP32[1061] | 0; //@line 2896
       $235 = $37 >>> 3; //@line 2897
       $237 = 4264 + ($235 << 1 << 2) | 0; //@line 2899
       $238 = 1 << $235; //@line 2900
       if (!($8 & $238)) {
        HEAP32[1056] = $8 | $238; //@line 2905
        $$0189$i = $237; //@line 2907
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 2907
       } else {
        $242 = $237 + 8 | 0; //@line 2909
        $243 = HEAP32[$242 >> 2] | 0; //@line 2910
        if ((HEAP32[1060] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 2914
        } else {
         $$0189$i = $243; //@line 2917
         $$pre$phi$iZ2D = $242; //@line 2917
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 2920
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 2922
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 2924
       HEAP32[$234 + 12 >> 2] = $237; //@line 2926
      }
      HEAP32[1058] = $$0193$lcssa$i; //@line 2928
      HEAP32[1061] = $159; //@line 2929
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 2932
     STACKTOP = sp; //@line 2933
     return $$0 | 0; //@line 2933
    }
   } else {
    $$0197 = $6; //@line 2936
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 2941
   } else {
    $251 = $0 + 11 | 0; //@line 2943
    $252 = $251 & -8; //@line 2944
    $253 = HEAP32[1057] | 0; //@line 2945
    if (!$253) {
     $$0197 = $252; //@line 2948
    } else {
     $255 = 0 - $252 | 0; //@line 2950
     $256 = $251 >>> 8; //@line 2951
     if (!$256) {
      $$0358$i = 0; //@line 2954
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 2958
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 2962
       $262 = $256 << $261; //@line 2963
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 2966
       $267 = $262 << $265; //@line 2968
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 2971
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 2976
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 2982
      }
     }
     $282 = HEAP32[4528 + ($$0358$i << 2) >> 2] | 0; //@line 2986
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 2990
       $$3$i203 = 0; //@line 2990
       $$3350$i = $255; //@line 2990
       label = 81; //@line 2991
      } else {
       $$0342$i = 0; //@line 2998
       $$0347$i = $255; //@line 2998
       $$0353$i = $282; //@line 2998
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 2998
       $$0362$i = 0; //@line 2998
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 3003
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 3008
          $$435113$i = 0; //@line 3008
          $$435712$i = $$0353$i; //@line 3008
          label = 85; //@line 3009
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 3012
          $$1348$i = $292; //@line 3012
         }
        } else {
         $$1343$i = $$0342$i; //@line 3015
         $$1348$i = $$0347$i; //@line 3015
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 3018
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 3021
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 3025
        $302 = ($$0353$i | 0) == 0; //@line 3026
        if ($302) {
         $$2355$i = $$1363$i; //@line 3031
         $$3$i203 = $$1343$i; //@line 3031
         $$3350$i = $$1348$i; //@line 3031
         label = 81; //@line 3032
         break;
        } else {
         $$0342$i = $$1343$i; //@line 3035
         $$0347$i = $$1348$i; //@line 3035
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 3035
         $$0362$i = $$1363$i; //@line 3035
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 3045
       $309 = $253 & ($306 | 0 - $306); //@line 3048
       if (!$309) {
        $$0197 = $252; //@line 3051
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 3056
       $315 = $313 >>> 12 & 16; //@line 3058
       $316 = $313 >>> $315; //@line 3059
       $318 = $316 >>> 5 & 8; //@line 3061
       $320 = $316 >>> $318; //@line 3063
       $322 = $320 >>> 2 & 4; //@line 3065
       $324 = $320 >>> $322; //@line 3067
       $326 = $324 >>> 1 & 2; //@line 3069
       $328 = $324 >>> $326; //@line 3071
       $330 = $328 >>> 1 & 1; //@line 3073
       $$4$ph$i = 0; //@line 3079
       $$4357$ph$i = HEAP32[4528 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 3079
      } else {
       $$4$ph$i = $$3$i203; //@line 3081
       $$4357$ph$i = $$2355$i; //@line 3081
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 3085
       $$4351$lcssa$i = $$3350$i; //@line 3085
      } else {
       $$414$i = $$4$ph$i; //@line 3087
       $$435113$i = $$3350$i; //@line 3087
       $$435712$i = $$4357$ph$i; //@line 3087
       label = 85; //@line 3088
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 3093
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 3097
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 3098
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 3099
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 3100
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 3106
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 3109
        $$4351$lcssa$i = $$$4351$i; //@line 3109
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 3112
        $$435113$i = $$$4351$i; //@line 3112
        label = 85; //@line 3113
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 3119
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1058] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1060] | 0; //@line 3125
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 3128
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 3131
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 3134
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 3138
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 3140
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 3144
         $371 = HEAP32[$370 >> 2] | 0; //@line 3145
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 3148
          $374 = HEAP32[$373 >> 2] | 0; //@line 3149
          if (!$374) {
           $$3372$i = 0; //@line 3152
           break;
          } else {
           $$1370$i = $374; //@line 3155
           $$1374$i = $373; //@line 3155
          }
         } else {
          $$1370$i = $371; //@line 3158
          $$1374$i = $370; //@line 3158
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 3161
          $377 = HEAP32[$376 >> 2] | 0; //@line 3162
          if ($377 | 0) {
           $$1370$i = $377; //@line 3165
           $$1374$i = $376; //@line 3165
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 3168
          $380 = HEAP32[$379 >> 2] | 0; //@line 3169
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 3174
           $$1374$i = $379; //@line 3174
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 3179
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 3182
          $$3372$i = $$1370$i; //@line 3183
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 3188
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 3191
         }
         $364 = $362 + 12 | 0; //@line 3194
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 3198
         }
         $367 = $359 + 8 | 0; //@line 3201
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 3205
          HEAP32[$367 >> 2] = $362; //@line 3206
          $$3372$i = $359; //@line 3207
          break;
         } else {
          _abort(); //@line 3210
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 3218
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 3221
         $386 = 4528 + ($385 << 2) | 0; //@line 3222
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 3227
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 3232
            HEAP32[1057] = $391; //@line 3233
            $475 = $391; //@line 3234
            break L164;
           }
          } else {
           if ((HEAP32[1060] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 3241
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 3249
            if (!$$3372$i) {
             $475 = $253; //@line 3252
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1060] | 0; //@line 3260
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 3263
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 3267
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 3269
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 3275
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 3279
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 3281
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 3287
         if (!$409) {
          $475 = $253; //@line 3290
         } else {
          if ((HEAP32[1060] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 3295
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 3299
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 3301
           $475 = $253; //@line 3302
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 3311
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 3314
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 3316
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 3319
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 3323
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 3326
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 3328
         $428 = $$4351$lcssa$i >>> 3; //@line 3329
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 4264 + ($428 << 1 << 2) | 0; //@line 3333
          $432 = HEAP32[1056] | 0; //@line 3334
          $433 = 1 << $428; //@line 3335
          if (!($432 & $433)) {
           HEAP32[1056] = $432 | $433; //@line 3340
           $$0368$i = $431; //@line 3342
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 3342
          } else {
           $437 = $431 + 8 | 0; //@line 3344
           $438 = HEAP32[$437 >> 2] | 0; //@line 3345
           if ((HEAP32[1060] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 3349
           } else {
            $$0368$i = $438; //@line 3352
            $$pre$phi$i211Z2D = $437; //@line 3352
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 3355
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 3357
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 3359
          HEAP32[$354 + 12 >> 2] = $431; //@line 3361
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 3364
         if (!$444) {
          $$0361$i = 0; //@line 3367
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 3371
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 3375
           $450 = $444 << $449; //@line 3376
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 3379
           $455 = $450 << $453; //@line 3381
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 3384
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 3389
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 3395
          }
         }
         $469 = 4528 + ($$0361$i << 2) | 0; //@line 3398
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 3400
         $471 = $354 + 16 | 0; //@line 3401
         HEAP32[$471 + 4 >> 2] = 0; //@line 3403
         HEAP32[$471 >> 2] = 0; //@line 3404
         $473 = 1 << $$0361$i; //@line 3405
         if (!($475 & $473)) {
          HEAP32[1057] = $475 | $473; //@line 3410
          HEAP32[$469 >> 2] = $354; //@line 3411
          HEAP32[$354 + 24 >> 2] = $469; //@line 3413
          HEAP32[$354 + 12 >> 2] = $354; //@line 3415
          HEAP32[$354 + 8 >> 2] = $354; //@line 3417
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 3426
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 3426
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 3433
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 3437
          $494 = HEAP32[$492 >> 2] | 0; //@line 3439
          if (!$494) {
           label = 136; //@line 3442
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 3445
           $$0345$i = $494; //@line 3445
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1060] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 3452
          } else {
           HEAP32[$492 >> 2] = $354; //@line 3455
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 3457
           HEAP32[$354 + 12 >> 2] = $354; //@line 3459
           HEAP32[$354 + 8 >> 2] = $354; //@line 3461
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 3466
          $502 = HEAP32[$501 >> 2] | 0; //@line 3467
          $503 = HEAP32[1060] | 0; //@line 3468
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 3474
           HEAP32[$501 >> 2] = $354; //@line 3475
           HEAP32[$354 + 8 >> 2] = $502; //@line 3477
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 3479
           HEAP32[$354 + 24 >> 2] = 0; //@line 3481
           break;
          } else {
           _abort(); //@line 3484
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 3491
       STACKTOP = sp; //@line 3492
       return $$0 | 0; //@line 3492
      } else {
       $$0197 = $252; //@line 3494
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1058] | 0; //@line 3501
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 3504
  $515 = HEAP32[1061] | 0; //@line 3505
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 3508
   HEAP32[1061] = $517; //@line 3509
   HEAP32[1058] = $514; //@line 3510
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 3513
   HEAP32[$515 + $512 >> 2] = $514; //@line 3515
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 3518
  } else {
   HEAP32[1058] = 0; //@line 3520
   HEAP32[1061] = 0; //@line 3521
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 3524
   $526 = $515 + $512 + 4 | 0; //@line 3526
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 3529
  }
  $$0 = $515 + 8 | 0; //@line 3532
  STACKTOP = sp; //@line 3533
  return $$0 | 0; //@line 3533
 }
 $530 = HEAP32[1059] | 0; //@line 3535
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 3538
  HEAP32[1059] = $532; //@line 3539
  $533 = HEAP32[1062] | 0; //@line 3540
  $534 = $533 + $$0197 | 0; //@line 3541
  HEAP32[1062] = $534; //@line 3542
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 3545
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 3548
  $$0 = $533 + 8 | 0; //@line 3550
  STACKTOP = sp; //@line 3551
  return $$0 | 0; //@line 3551
 }
 if (!(HEAP32[1174] | 0)) {
  HEAP32[1176] = 4096; //@line 3556
  HEAP32[1175] = 4096; //@line 3557
  HEAP32[1177] = -1; //@line 3558
  HEAP32[1178] = -1; //@line 3559
  HEAP32[1179] = 0; //@line 3560
  HEAP32[1167] = 0; //@line 3561
  HEAP32[1174] = $1 & -16 ^ 1431655768; //@line 3565
  $548 = 4096; //@line 3566
 } else {
  $548 = HEAP32[1176] | 0; //@line 3569
 }
 $545 = $$0197 + 48 | 0; //@line 3571
 $546 = $$0197 + 47 | 0; //@line 3572
 $547 = $548 + $546 | 0; //@line 3573
 $549 = 0 - $548 | 0; //@line 3574
 $550 = $547 & $549; //@line 3575
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 3578
  STACKTOP = sp; //@line 3579
  return $$0 | 0; //@line 3579
 }
 $552 = HEAP32[1166] | 0; //@line 3581
 if ($552 | 0) {
  $554 = HEAP32[1164] | 0; //@line 3584
  $555 = $554 + $550 | 0; //@line 3585
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 3590
   STACKTOP = sp; //@line 3591
   return $$0 | 0; //@line 3591
  }
 }
 L244 : do {
  if (!(HEAP32[1167] & 4)) {
   $561 = HEAP32[1062] | 0; //@line 3599
   L246 : do {
    if (!$561) {
     label = 163; //@line 3603
    } else {
     $$0$i$i = 4672; //@line 3605
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 3607
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 3610
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 3619
      if (!$570) {
       label = 163; //@line 3622
       break L246;
      } else {
       $$0$i$i = $570; //@line 3625
      }
     }
     $595 = $547 - $530 & $549; //@line 3629
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 3632
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 3640
       } else {
        $$723947$i = $595; //@line 3642
        $$748$i = $597; //@line 3642
        label = 180; //@line 3643
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 3647
       $$2253$ph$i = $595; //@line 3647
       label = 171; //@line 3648
      }
     } else {
      $$2234243136$i = 0; //@line 3651
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 3657
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 3660
     } else {
      $574 = $572; //@line 3662
      $575 = HEAP32[1175] | 0; //@line 3663
      $576 = $575 + -1 | 0; //@line 3664
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 3672
      $584 = HEAP32[1164] | 0; //@line 3673
      $585 = $$$i + $584 | 0; //@line 3674
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1166] | 0; //@line 3679
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 3686
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 3690
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 3693
        $$748$i = $572; //@line 3693
        label = 180; //@line 3694
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 3697
        $$2253$ph$i = $$$i; //@line 3697
        label = 171; //@line 3698
       }
      } else {
       $$2234243136$i = 0; //@line 3701
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 3708
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 3717
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 3720
       $$748$i = $$2247$ph$i; //@line 3720
       label = 180; //@line 3721
       break L244;
      }
     }
     $607 = HEAP32[1176] | 0; //@line 3725
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 3729
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 3732
      $$748$i = $$2247$ph$i; //@line 3732
      label = 180; //@line 3733
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 3739
      $$2234243136$i = 0; //@line 3740
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 3744
      $$748$i = $$2247$ph$i; //@line 3744
      label = 180; //@line 3745
      break L244;
     }
    }
   } while (0);
   HEAP32[1167] = HEAP32[1167] | 4; //@line 3752
   $$4236$i = $$2234243136$i; //@line 3753
   label = 178; //@line 3754
  } else {
   $$4236$i = 0; //@line 3756
   label = 178; //@line 3757
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 3763
   $621 = _sbrk(0) | 0; //@line 3764
   $627 = $621 - $620 | 0; //@line 3772
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 3774
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 3782
    $$748$i = $620; //@line 3782
    label = 180; //@line 3783
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1164] | 0) + $$723947$i | 0; //@line 3789
  HEAP32[1164] = $633; //@line 3790
  if ($633 >>> 0 > (HEAP32[1165] | 0) >>> 0) {
   HEAP32[1165] = $633; //@line 3794
  }
  $636 = HEAP32[1062] | 0; //@line 3796
  do {
   if (!$636) {
    $638 = HEAP32[1060] | 0; //@line 3800
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1060] = $$748$i; //@line 3805
    }
    HEAP32[1168] = $$748$i; //@line 3807
    HEAP32[1169] = $$723947$i; //@line 3808
    HEAP32[1171] = 0; //@line 3809
    HEAP32[1065] = HEAP32[1174]; //@line 3811
    HEAP32[1064] = -1; //@line 3812
    HEAP32[1069] = 4264; //@line 3813
    HEAP32[1068] = 4264; //@line 3814
    HEAP32[1071] = 4272; //@line 3815
    HEAP32[1070] = 4272; //@line 3816
    HEAP32[1073] = 4280; //@line 3817
    HEAP32[1072] = 4280; //@line 3818
    HEAP32[1075] = 4288; //@line 3819
    HEAP32[1074] = 4288; //@line 3820
    HEAP32[1077] = 4296; //@line 3821
    HEAP32[1076] = 4296; //@line 3822
    HEAP32[1079] = 4304; //@line 3823
    HEAP32[1078] = 4304; //@line 3824
    HEAP32[1081] = 4312; //@line 3825
    HEAP32[1080] = 4312; //@line 3826
    HEAP32[1083] = 4320; //@line 3827
    HEAP32[1082] = 4320; //@line 3828
    HEAP32[1085] = 4328; //@line 3829
    HEAP32[1084] = 4328; //@line 3830
    HEAP32[1087] = 4336; //@line 3831
    HEAP32[1086] = 4336; //@line 3832
    HEAP32[1089] = 4344; //@line 3833
    HEAP32[1088] = 4344; //@line 3834
    HEAP32[1091] = 4352; //@line 3835
    HEAP32[1090] = 4352; //@line 3836
    HEAP32[1093] = 4360; //@line 3837
    HEAP32[1092] = 4360; //@line 3838
    HEAP32[1095] = 4368; //@line 3839
    HEAP32[1094] = 4368; //@line 3840
    HEAP32[1097] = 4376; //@line 3841
    HEAP32[1096] = 4376; //@line 3842
    HEAP32[1099] = 4384; //@line 3843
    HEAP32[1098] = 4384; //@line 3844
    HEAP32[1101] = 4392; //@line 3845
    HEAP32[1100] = 4392; //@line 3846
    HEAP32[1103] = 4400; //@line 3847
    HEAP32[1102] = 4400; //@line 3848
    HEAP32[1105] = 4408; //@line 3849
    HEAP32[1104] = 4408; //@line 3850
    HEAP32[1107] = 4416; //@line 3851
    HEAP32[1106] = 4416; //@line 3852
    HEAP32[1109] = 4424; //@line 3853
    HEAP32[1108] = 4424; //@line 3854
    HEAP32[1111] = 4432; //@line 3855
    HEAP32[1110] = 4432; //@line 3856
    HEAP32[1113] = 4440; //@line 3857
    HEAP32[1112] = 4440; //@line 3858
    HEAP32[1115] = 4448; //@line 3859
    HEAP32[1114] = 4448; //@line 3860
    HEAP32[1117] = 4456; //@line 3861
    HEAP32[1116] = 4456; //@line 3862
    HEAP32[1119] = 4464; //@line 3863
    HEAP32[1118] = 4464; //@line 3864
    HEAP32[1121] = 4472; //@line 3865
    HEAP32[1120] = 4472; //@line 3866
    HEAP32[1123] = 4480; //@line 3867
    HEAP32[1122] = 4480; //@line 3868
    HEAP32[1125] = 4488; //@line 3869
    HEAP32[1124] = 4488; //@line 3870
    HEAP32[1127] = 4496; //@line 3871
    HEAP32[1126] = 4496; //@line 3872
    HEAP32[1129] = 4504; //@line 3873
    HEAP32[1128] = 4504; //@line 3874
    HEAP32[1131] = 4512; //@line 3875
    HEAP32[1130] = 4512; //@line 3876
    $642 = $$723947$i + -40 | 0; //@line 3877
    $644 = $$748$i + 8 | 0; //@line 3879
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 3884
    $650 = $$748$i + $649 | 0; //@line 3885
    $651 = $642 - $649 | 0; //@line 3886
    HEAP32[1062] = $650; //@line 3887
    HEAP32[1059] = $651; //@line 3888
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 3891
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 3894
    HEAP32[1063] = HEAP32[1178]; //@line 3896
   } else {
    $$024367$i = 4672; //@line 3898
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 3900
     $658 = $$024367$i + 4 | 0; //@line 3901
     $659 = HEAP32[$658 >> 2] | 0; //@line 3902
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 3906
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 3910
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 3915
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 3929
       $673 = (HEAP32[1059] | 0) + $$723947$i | 0; //@line 3931
       $675 = $636 + 8 | 0; //@line 3933
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 3938
       $681 = $636 + $680 | 0; //@line 3939
       $682 = $673 - $680 | 0; //@line 3940
       HEAP32[1062] = $681; //@line 3941
       HEAP32[1059] = $682; //@line 3942
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 3945
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 3948
       HEAP32[1063] = HEAP32[1178]; //@line 3950
       break;
      }
     }
    }
    $688 = HEAP32[1060] | 0; //@line 3955
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1060] = $$748$i; //@line 3958
     $753 = $$748$i; //@line 3959
    } else {
     $753 = $688; //@line 3961
    }
    $690 = $$748$i + $$723947$i | 0; //@line 3963
    $$124466$i = 4672; //@line 3964
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 3969
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 3973
     if (!$694) {
      $$0$i$i$i = 4672; //@line 3976
      break;
     } else {
      $$124466$i = $694; //@line 3979
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 3988
      $700 = $$124466$i + 4 | 0; //@line 3989
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 3992
      $704 = $$748$i + 8 | 0; //@line 3994
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 4000
      $712 = $690 + 8 | 0; //@line 4002
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 4008
      $722 = $710 + $$0197 | 0; //@line 4012
      $723 = $718 - $710 - $$0197 | 0; //@line 4013
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 4016
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1059] | 0) + $723 | 0; //@line 4021
        HEAP32[1059] = $728; //@line 4022
        HEAP32[1062] = $722; //@line 4023
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 4026
       } else {
        if ((HEAP32[1061] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1058] | 0) + $723 | 0; //@line 4032
         HEAP32[1058] = $734; //@line 4033
         HEAP32[1061] = $722; //@line 4034
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 4037
         HEAP32[$722 + $734 >> 2] = $734; //@line 4039
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 4043
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 4047
         $743 = $739 >>> 3; //@line 4048
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 4053
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 4055
           $750 = 4264 + ($743 << 1 << 2) | 0; //@line 4057
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 4063
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 4072
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1056] = HEAP32[1056] & ~(1 << $743); //@line 4082
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 4089
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 4093
             }
             $764 = $748 + 8 | 0; //@line 4096
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 4100
              break;
             }
             _abort(); //@line 4103
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 4108
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 4109
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 4112
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 4114
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 4118
             $783 = $782 + 4 | 0; //@line 4119
             $784 = HEAP32[$783 >> 2] | 0; //@line 4120
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 4123
              if (!$786) {
               $$3$i$i = 0; //@line 4126
               break;
              } else {
               $$1291$i$i = $786; //@line 4129
               $$1293$i$i = $782; //@line 4129
              }
             } else {
              $$1291$i$i = $784; //@line 4132
              $$1293$i$i = $783; //@line 4132
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 4135
              $789 = HEAP32[$788 >> 2] | 0; //@line 4136
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 4139
               $$1293$i$i = $788; //@line 4139
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 4142
              $792 = HEAP32[$791 >> 2] | 0; //@line 4143
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 4148
               $$1293$i$i = $791; //@line 4148
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 4153
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 4156
              $$3$i$i = $$1291$i$i; //@line 4157
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 4162
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 4165
             }
             $776 = $774 + 12 | 0; //@line 4168
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 4172
             }
             $779 = $771 + 8 | 0; //@line 4175
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 4179
              HEAP32[$779 >> 2] = $774; //@line 4180
              $$3$i$i = $771; //@line 4181
              break;
             } else {
              _abort(); //@line 4184
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 4194
           $798 = 4528 + ($797 << 2) | 0; //@line 4195
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 4200
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1057] = HEAP32[1057] & ~(1 << $797); //@line 4209
             break L311;
            } else {
             if ((HEAP32[1060] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 4215
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 4223
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1060] | 0; //@line 4233
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 4236
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 4240
           $815 = $718 + 16 | 0; //@line 4241
           $816 = HEAP32[$815 >> 2] | 0; //@line 4242
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 4248
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 4252
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 4254
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 4260
           if (!$822) {
            break;
           }
           if ((HEAP32[1060] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 4268
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 4272
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 4274
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 4281
         $$0287$i$i = $742 + $723 | 0; //@line 4281
        } else {
         $$0$i17$i = $718; //@line 4283
         $$0287$i$i = $723; //@line 4283
        }
        $830 = $$0$i17$i + 4 | 0; //@line 4285
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 4288
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 4291
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 4293
        $836 = $$0287$i$i >>> 3; //@line 4294
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 4264 + ($836 << 1 << 2) | 0; //@line 4298
         $840 = HEAP32[1056] | 0; //@line 4299
         $841 = 1 << $836; //@line 4300
         do {
          if (!($840 & $841)) {
           HEAP32[1056] = $840 | $841; //@line 4306
           $$0295$i$i = $839; //@line 4308
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 4308
          } else {
           $845 = $839 + 8 | 0; //@line 4310
           $846 = HEAP32[$845 >> 2] | 0; //@line 4311
           if ((HEAP32[1060] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 4315
            $$pre$phi$i19$iZ2D = $845; //@line 4315
            break;
           }
           _abort(); //@line 4318
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 4322
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 4324
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 4326
         HEAP32[$722 + 12 >> 2] = $839; //@line 4328
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 4331
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 4335
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 4339
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 4344
          $858 = $852 << $857; //@line 4345
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 4348
          $863 = $858 << $861; //@line 4350
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 4353
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 4358
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 4364
         }
        } while (0);
        $877 = 4528 + ($$0296$i$i << 2) | 0; //@line 4367
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 4369
        $879 = $722 + 16 | 0; //@line 4370
        HEAP32[$879 + 4 >> 2] = 0; //@line 4372
        HEAP32[$879 >> 2] = 0; //@line 4373
        $881 = HEAP32[1057] | 0; //@line 4374
        $882 = 1 << $$0296$i$i; //@line 4375
        if (!($881 & $882)) {
         HEAP32[1057] = $881 | $882; //@line 4380
         HEAP32[$877 >> 2] = $722; //@line 4381
         HEAP32[$722 + 24 >> 2] = $877; //@line 4383
         HEAP32[$722 + 12 >> 2] = $722; //@line 4385
         HEAP32[$722 + 8 >> 2] = $722; //@line 4387
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 4396
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 4396
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 4403
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 4407
         $902 = HEAP32[$900 >> 2] | 0; //@line 4409
         if (!$902) {
          label = 260; //@line 4412
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 4415
          $$0289$i$i = $902; //@line 4415
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1060] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 4422
         } else {
          HEAP32[$900 >> 2] = $722; //@line 4425
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 4427
          HEAP32[$722 + 12 >> 2] = $722; //@line 4429
          HEAP32[$722 + 8 >> 2] = $722; //@line 4431
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 4436
         $910 = HEAP32[$909 >> 2] | 0; //@line 4437
         $911 = HEAP32[1060] | 0; //@line 4438
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 4444
          HEAP32[$909 >> 2] = $722; //@line 4445
          HEAP32[$722 + 8 >> 2] = $910; //@line 4447
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 4449
          HEAP32[$722 + 24 >> 2] = 0; //@line 4451
          break;
         } else {
          _abort(); //@line 4454
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 4461
      STACKTOP = sp; //@line 4462
      return $$0 | 0; //@line 4462
     } else {
      $$0$i$i$i = 4672; //@line 4464
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 4468
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 4473
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 4481
    }
    $927 = $923 + -47 | 0; //@line 4483
    $929 = $927 + 8 | 0; //@line 4485
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 4491
    $936 = $636 + 16 | 0; //@line 4492
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 4494
    $939 = $938 + 8 | 0; //@line 4495
    $940 = $938 + 24 | 0; //@line 4496
    $941 = $$723947$i + -40 | 0; //@line 4497
    $943 = $$748$i + 8 | 0; //@line 4499
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 4504
    $949 = $$748$i + $948 | 0; //@line 4505
    $950 = $941 - $948 | 0; //@line 4506
    HEAP32[1062] = $949; //@line 4507
    HEAP32[1059] = $950; //@line 4508
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 4511
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 4514
    HEAP32[1063] = HEAP32[1178]; //@line 4516
    $956 = $938 + 4 | 0; //@line 4517
    HEAP32[$956 >> 2] = 27; //@line 4518
    HEAP32[$939 >> 2] = HEAP32[1168]; //@line 4519
    HEAP32[$939 + 4 >> 2] = HEAP32[1169]; //@line 4519
    HEAP32[$939 + 8 >> 2] = HEAP32[1170]; //@line 4519
    HEAP32[$939 + 12 >> 2] = HEAP32[1171]; //@line 4519
    HEAP32[1168] = $$748$i; //@line 4520
    HEAP32[1169] = $$723947$i; //@line 4521
    HEAP32[1171] = 0; //@line 4522
    HEAP32[1170] = $939; //@line 4523
    $958 = $940; //@line 4524
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 4526
     HEAP32[$958 >> 2] = 7; //@line 4527
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 4540
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 4543
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 4546
     HEAP32[$938 >> 2] = $964; //@line 4547
     $969 = $964 >>> 3; //@line 4548
     if ($964 >>> 0 < 256) {
      $972 = 4264 + ($969 << 1 << 2) | 0; //@line 4552
      $973 = HEAP32[1056] | 0; //@line 4553
      $974 = 1 << $969; //@line 4554
      if (!($973 & $974)) {
       HEAP32[1056] = $973 | $974; //@line 4559
       $$0211$i$i = $972; //@line 4561
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 4561
      } else {
       $978 = $972 + 8 | 0; //@line 4563
       $979 = HEAP32[$978 >> 2] | 0; //@line 4564
       if ((HEAP32[1060] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 4568
       } else {
        $$0211$i$i = $979; //@line 4571
        $$pre$phi$i$iZ2D = $978; //@line 4571
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 4574
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 4576
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 4578
      HEAP32[$636 + 12 >> 2] = $972; //@line 4580
      break;
     }
     $985 = $964 >>> 8; //@line 4583
     if (!$985) {
      $$0212$i$i = 0; //@line 4586
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 4590
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 4594
       $991 = $985 << $990; //@line 4595
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 4598
       $996 = $991 << $994; //@line 4600
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 4603
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 4608
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 4614
      }
     }
     $1010 = 4528 + ($$0212$i$i << 2) | 0; //@line 4617
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 4619
     HEAP32[$636 + 20 >> 2] = 0; //@line 4621
     HEAP32[$936 >> 2] = 0; //@line 4622
     $1013 = HEAP32[1057] | 0; //@line 4623
     $1014 = 1 << $$0212$i$i; //@line 4624
     if (!($1013 & $1014)) {
      HEAP32[1057] = $1013 | $1014; //@line 4629
      HEAP32[$1010 >> 2] = $636; //@line 4630
      HEAP32[$636 + 24 >> 2] = $1010; //@line 4632
      HEAP32[$636 + 12 >> 2] = $636; //@line 4634
      HEAP32[$636 + 8 >> 2] = $636; //@line 4636
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 4645
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 4645
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 4652
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 4656
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 4658
      if (!$1034) {
       label = 286; //@line 4661
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 4664
       $$0207$i$i = $1034; //@line 4664
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1060] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 4671
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 4674
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 4676
       HEAP32[$636 + 12 >> 2] = $636; //@line 4678
       HEAP32[$636 + 8 >> 2] = $636; //@line 4680
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 4685
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 4686
      $1043 = HEAP32[1060] | 0; //@line 4687
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 4693
       HEAP32[$1041 >> 2] = $636; //@line 4694
       HEAP32[$636 + 8 >> 2] = $1042; //@line 4696
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 4698
       HEAP32[$636 + 24 >> 2] = 0; //@line 4700
       break;
      } else {
       _abort(); //@line 4703
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1059] | 0; //@line 4710
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 4713
   HEAP32[1059] = $1054; //@line 4714
   $1055 = HEAP32[1062] | 0; //@line 4715
   $1056 = $1055 + $$0197 | 0; //@line 4716
   HEAP32[1062] = $1056; //@line 4717
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 4720
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 4723
   $$0 = $1055 + 8 | 0; //@line 4725
   STACKTOP = sp; //@line 4726
   return $$0 | 0; //@line 4726
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 4730
 $$0 = 0; //@line 4731
 STACKTOP = sp; //@line 4732
 return $$0 | 0; //@line 4732
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8454
 STACKTOP = STACKTOP + 560 | 0; //@line 8455
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 8455
 $6 = sp + 8 | 0; //@line 8456
 $7 = sp; //@line 8457
 $8 = sp + 524 | 0; //@line 8458
 $9 = $8; //@line 8459
 $10 = sp + 512 | 0; //@line 8460
 HEAP32[$7 >> 2] = 0; //@line 8461
 $11 = $10 + 12 | 0; //@line 8462
 ___DOUBLE_BITS_677($1) | 0; //@line 8463
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 8468
  $$0520 = 1; //@line 8468
  $$0521 = 1962; //@line 8468
 } else {
  $$0471 = $1; //@line 8479
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 8479
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 1963 : 1968 : 1965; //@line 8479
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 8481
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 8490
   $31 = $$0520 + 3 | 0; //@line 8495
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 8497
   _out_670($0, $$0521, $$0520); //@line 8498
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 1989 : 1993 : $27 ? 1981 : 1985, 3); //@line 8499
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 8501
   $$sink560 = $31; //@line 8502
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 8505
   $36 = $35 != 0.0; //@line 8506
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 8510
   }
   $39 = $5 | 32; //@line 8512
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 8515
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 8518
    $44 = $$0520 | 2; //@line 8519
    $46 = 12 - $3 | 0; //@line 8521
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 8526
     } else {
      $$0509585 = 8.0; //@line 8528
      $$1508586 = $46; //@line 8528
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 8530
       $$0509585 = $$0509585 * 16.0; //@line 8531
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 8546
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 8551
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 8556
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 8559
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 8562
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 8565
     HEAP8[$68 >> 0] = 48; //@line 8566
     $$0511 = $68; //@line 8567
    } else {
     $$0511 = $66; //@line 8569
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 8576
    $76 = $$0511 + -2 | 0; //@line 8579
    HEAP8[$76 >> 0] = $5 + 15; //@line 8580
    $77 = ($3 | 0) < 1; //@line 8581
    $79 = ($4 & 8 | 0) == 0; //@line 8583
    $$0523 = $8; //@line 8584
    $$2473 = $$1472; //@line 8584
    while (1) {
     $80 = ~~$$2473; //@line 8586
     $86 = $$0523 + 1 | 0; //@line 8592
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[1997 + $80 >> 0]; //@line 8593
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 8596
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 8605
      } else {
       HEAP8[$86 >> 0] = 46; //@line 8608
       $$1524 = $$0523 + 2 | 0; //@line 8609
      }
     } else {
      $$1524 = $86; //@line 8612
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 8616
     }
    }
    $$pre693 = $$1524; //@line 8622
    if (!$3) {
     label = 24; //@line 8624
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 8632
      $$sink = $3 + 2 | 0; //@line 8632
     } else {
      label = 24; //@line 8634
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 8638
     $$pre$phi691Z2D = $101; //@line 8639
     $$sink = $101; //@line 8639
    }
    $104 = $11 - $76 | 0; //@line 8643
    $106 = $104 + $44 + $$sink | 0; //@line 8645
    _pad_676($0, 32, $2, $106, $4); //@line 8646
    _out_670($0, $$0521$, $44); //@line 8647
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 8649
    _out_670($0, $8, $$pre$phi691Z2D); //@line 8650
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 8652
    _out_670($0, $76, $104); //@line 8653
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 8655
    $$sink560 = $106; //@line 8656
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 8660
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 8664
    HEAP32[$7 >> 2] = $113; //@line 8665
    $$3 = $35 * 268435456.0; //@line 8666
    $$pr = $113; //@line 8666
   } else {
    $$3 = $35; //@line 8669
    $$pr = HEAP32[$7 >> 2] | 0; //@line 8669
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 8673
   $$0498 = $$561; //@line 8674
   $$4 = $$3; //@line 8674
   do {
    $116 = ~~$$4 >>> 0; //@line 8676
    HEAP32[$$0498 >> 2] = $116; //@line 8677
    $$0498 = $$0498 + 4 | 0; //@line 8678
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 8681
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 8691
    $$1499662 = $$0498; //@line 8691
    $124 = $$pr; //@line 8691
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 8694
     $$0488655 = $$1499662 + -4 | 0; //@line 8695
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 8698
     } else {
      $$0488657 = $$0488655; //@line 8700
      $$0497656 = 0; //@line 8700
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 8703
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 8705
       $131 = tempRet0; //@line 8706
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 8707
       HEAP32[$$0488657 >> 2] = $132; //@line 8709
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 8710
       $$0488657 = $$0488657 + -4 | 0; //@line 8712
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 8722
      } else {
       $138 = $$1482663 + -4 | 0; //@line 8724
       HEAP32[$138 >> 2] = $$0497656; //@line 8725
       $$2483$ph = $138; //@line 8726
      }
     }
     $$2500 = $$1499662; //@line 8729
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 8735
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 8739
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 8745
     HEAP32[$7 >> 2] = $144; //@line 8746
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 8749
      $$1499662 = $$2500; //@line 8749
      $124 = $144; //@line 8749
     } else {
      $$1482$lcssa = $$2483$ph; //@line 8751
      $$1499$lcssa = $$2500; //@line 8751
      $$pr566 = $144; //@line 8751
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 8756
    $$1499$lcssa = $$0498; //@line 8756
    $$pr566 = $$pr; //@line 8756
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 8762
    $150 = ($39 | 0) == 102; //@line 8763
    $$3484650 = $$1482$lcssa; //@line 8764
    $$3501649 = $$1499$lcssa; //@line 8764
    $152 = $$pr566; //@line 8764
    while (1) {
     $151 = 0 - $152 | 0; //@line 8766
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 8768
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 8772
      $161 = 1e9 >>> $154; //@line 8773
      $$0487644 = 0; //@line 8774
      $$1489643 = $$3484650; //@line 8774
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 8776
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 8780
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 8781
       $$1489643 = $$1489643 + 4 | 0; //@line 8782
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 8793
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 8796
       $$4502 = $$3501649; //@line 8796
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 8799
       $$$3484700 = $$$3484; //@line 8800
       $$4502 = $$3501649 + 4 | 0; //@line 8800
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 8807
      $$4502 = $$3501649; //@line 8807
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 8809
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 8816
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 8818
     HEAP32[$7 >> 2] = $152; //@line 8819
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 8824
      $$3501$lcssa = $$$4502; //@line 8824
      break;
     } else {
      $$3484650 = $$$3484700; //@line 8822
      $$3501649 = $$$4502; //@line 8822
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 8829
    $$3501$lcssa = $$1499$lcssa; //@line 8829
   }
   $185 = $$561; //@line 8832
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 8837
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 8838
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 8841
    } else {
     $$0514639 = $189; //@line 8843
     $$0530638 = 10; //@line 8843
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 8845
      $193 = $$0514639 + 1 | 0; //@line 8846
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 8849
       break;
      } else {
       $$0514639 = $193; //@line 8852
      }
     }
    }
   } else {
    $$1515 = 0; //@line 8857
   }
   $198 = ($39 | 0) == 103; //@line 8862
   $199 = ($$540 | 0) != 0; //@line 8863
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 8866
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 8875
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 8878
    $213 = ($209 | 0) % 9 | 0; //@line 8879
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 8882
     $$1531632 = 10; //@line 8882
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 8885
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 8888
       $$1531632 = $215; //@line 8888
      } else {
       $$1531$lcssa = $215; //@line 8890
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 8895
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 8897
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 8898
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 8901
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 8904
     $$4518 = $$1515; //@line 8904
     $$8 = $$3484$lcssa; //@line 8904
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 8909
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 8910
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 8915
     if (!$$0520) {
      $$1467 = $$$564; //@line 8918
      $$1469 = $$543; //@line 8918
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 8921
      $$1467 = $230 ? -$$$564 : $$$564; //@line 8926
      $$1469 = $230 ? -$$543 : $$543; //@line 8926
     }
     $233 = $217 - $218 | 0; //@line 8928
     HEAP32[$212 >> 2] = $233; //@line 8929
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 8933
      HEAP32[$212 >> 2] = $236; //@line 8934
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 8937
       $$sink547625 = $212; //@line 8937
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 8939
        HEAP32[$$sink547625 >> 2] = 0; //@line 8940
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 8943
         HEAP32[$240 >> 2] = 0; //@line 8944
         $$6 = $240; //@line 8945
        } else {
         $$6 = $$5486626; //@line 8947
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 8950
        HEAP32[$238 >> 2] = $242; //@line 8951
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 8954
         $$sink547625 = $238; //@line 8954
        } else {
         $$5486$lcssa = $$6; //@line 8956
         $$sink547$lcssa = $238; //@line 8956
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 8961
       $$sink547$lcssa = $212; //@line 8961
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 8966
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 8967
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 8970
       $$4518 = $247; //@line 8970
       $$8 = $$5486$lcssa; //@line 8970
      } else {
       $$2516621 = $247; //@line 8972
       $$2532620 = 10; //@line 8972
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 8974
        $251 = $$2516621 + 1 | 0; //@line 8975
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 8978
         $$4518 = $251; //@line 8978
         $$8 = $$5486$lcssa; //@line 8978
         break;
        } else {
         $$2516621 = $251; //@line 8981
        }
       }
      }
     } else {
      $$4492 = $212; //@line 8986
      $$4518 = $$1515; //@line 8986
      $$8 = $$3484$lcssa; //@line 8986
     }
    }
    $253 = $$4492 + 4 | 0; //@line 8989
    $$5519$ph = $$4518; //@line 8992
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 8992
    $$9$ph = $$8; //@line 8992
   } else {
    $$5519$ph = $$1515; //@line 8994
    $$7505$ph = $$3501$lcssa; //@line 8994
    $$9$ph = $$3484$lcssa; //@line 8994
   }
   $$7505 = $$7505$ph; //@line 8996
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 9000
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 9003
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 9007
    } else {
     $$lcssa675 = 1; //@line 9009
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 9013
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 9018
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 9026
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 9026
     } else {
      $$0479 = $5 + -2 | 0; //@line 9030
      $$2476 = $$540$ + -1 | 0; //@line 9030
     }
     $267 = $4 & 8; //@line 9032
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 9037
       if (!$270) {
        $$2529 = 9; //@line 9040
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 9045
         $$3533616 = 10; //@line 9045
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 9047
          $275 = $$1528617 + 1 | 0; //@line 9048
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 9054
           break;
          } else {
           $$1528617 = $275; //@line 9052
          }
         }
        } else {
         $$2529 = 0; //@line 9059
        }
       }
      } else {
       $$2529 = 9; //@line 9063
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 9071
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 9073
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 9075
       $$1480 = $$0479; //@line 9078
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 9078
       $$pre$phi698Z2D = 0; //@line 9078
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 9082
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 9084
       $$1480 = $$0479; //@line 9087
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 9087
       $$pre$phi698Z2D = 0; //@line 9087
       break;
      }
     } else {
      $$1480 = $$0479; //@line 9091
      $$3477 = $$2476; //@line 9091
      $$pre$phi698Z2D = $267; //@line 9091
     }
    } else {
     $$1480 = $5; //@line 9095
     $$3477 = $$540; //@line 9095
     $$pre$phi698Z2D = $4 & 8; //@line 9095
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 9098
   $294 = ($292 | 0) != 0 & 1; //@line 9100
   $296 = ($$1480 | 32 | 0) == 102; //@line 9102
   if ($296) {
    $$2513 = 0; //@line 9106
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 9106
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 9109
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 9112
    $304 = $11; //@line 9113
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 9118
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 9120
      HEAP8[$308 >> 0] = 48; //@line 9121
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 9126
      } else {
       $$1512$lcssa = $308; //@line 9128
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 9133
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 9140
    $318 = $$1512$lcssa + -2 | 0; //@line 9142
    HEAP8[$318 >> 0] = $$1480; //@line 9143
    $$2513 = $318; //@line 9146
    $$pn = $304 - $318 | 0; //@line 9146
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 9151
   _pad_676($0, 32, $2, $323, $4); //@line 9152
   _out_670($0, $$0521, $$0520); //@line 9153
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 9155
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 9158
    $326 = $8 + 9 | 0; //@line 9159
    $327 = $326; //@line 9160
    $328 = $8 + 8 | 0; //@line 9161
    $$5493600 = $$0496$$9; //@line 9162
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 9165
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 9170
       $$1465 = $328; //@line 9171
      } else {
       $$1465 = $330; //@line 9173
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 9180
       $$0464597 = $330; //@line 9181
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 9183
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 9186
        } else {
         $$1465 = $335; //@line 9188
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 9193
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 9198
     $$5493600 = $$5493600 + 4 | 0; //@line 9199
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 2013, 1); //@line 9209
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 9215
     $$6494592 = $$5493600; //@line 9215
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 9218
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 9223
       $$0463587 = $347; //@line 9224
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 9226
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 9229
        } else {
         $$0463$lcssa = $351; //@line 9231
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 9236
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 9240
      $$6494592 = $$6494592 + 4 | 0; //@line 9241
      $356 = $$4478593 + -9 | 0; //@line 9242
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 9249
       break;
      } else {
       $$4478593 = $356; //@line 9247
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 9254
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 9257
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 9260
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 9263
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 9264
     $365 = $363; //@line 9265
     $366 = 0 - $9 | 0; //@line 9266
     $367 = $8 + 8 | 0; //@line 9267
     $$5605 = $$3477; //@line 9268
     $$7495604 = $$9$ph; //@line 9268
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 9271
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 9274
       $$0 = $367; //@line 9275
      } else {
       $$0 = $369; //@line 9277
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 9282
        _out_670($0, $$0, 1); //@line 9283
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 9287
         break;
        }
        _out_670($0, 2013, 1); //@line 9290
        $$2 = $375; //@line 9291
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 9295
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 9300
        $$1601 = $$0; //@line 9301
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 9303
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 9306
         } else {
          $$2 = $373; //@line 9308
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 9315
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 9318
      $381 = $$5605 - $378 | 0; //@line 9319
      $$7495604 = $$7495604 + 4 | 0; //@line 9320
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 9327
       break;
      } else {
       $$5605 = $381; //@line 9325
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 9332
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 9335
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 9339
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 9342
   $$sink560 = $323; //@line 9343
  }
 } while (0);
 STACKTOP = sp; //@line 9348
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 9348
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 7026
 STACKTOP = STACKTOP + 64 | 0; //@line 7027
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 7027
 $5 = sp + 16 | 0; //@line 7028
 $6 = sp; //@line 7029
 $7 = sp + 24 | 0; //@line 7030
 $8 = sp + 8 | 0; //@line 7031
 $9 = sp + 20 | 0; //@line 7032
 HEAP32[$5 >> 2] = $1; //@line 7033
 $10 = ($0 | 0) != 0; //@line 7034
 $11 = $7 + 40 | 0; //@line 7035
 $12 = $11; //@line 7036
 $13 = $7 + 39 | 0; //@line 7037
 $14 = $8 + 4 | 0; //@line 7038
 $$0243 = 0; //@line 7039
 $$0247 = 0; //@line 7039
 $$0269 = 0; //@line 7039
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 7048
     $$1248 = -1; //@line 7049
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 7053
     break;
    }
   } else {
    $$1248 = $$0247; //@line 7057
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 7060
  $21 = HEAP8[$20 >> 0] | 0; //@line 7061
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 7064
   break;
  } else {
   $23 = $21; //@line 7067
   $25 = $20; //@line 7067
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 7072
     $27 = $25; //@line 7072
     label = 9; //@line 7073
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 7078
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 7085
   HEAP32[$5 >> 2] = $24; //@line 7086
   $23 = HEAP8[$24 >> 0] | 0; //@line 7088
   $25 = $24; //@line 7088
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 7093
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 7098
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 7101
     $27 = $27 + 2 | 0; //@line 7102
     HEAP32[$5 >> 2] = $27; //@line 7103
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 7110
      break;
     } else {
      $$0249303 = $30; //@line 7107
      label = 9; //@line 7108
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 7118
  if ($10) {
   _out_670($0, $20, $36); //@line 7120
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 7124
   $$0247 = $$1248; //@line 7124
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 7132
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 7133
  if ($43) {
   $$0253 = -1; //@line 7135
   $$1270 = $$0269; //@line 7135
   $$sink = 1; //@line 7135
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 7145
    $$1270 = 1; //@line 7145
    $$sink = 3; //@line 7145
   } else {
    $$0253 = -1; //@line 7147
    $$1270 = $$0269; //@line 7147
    $$sink = 1; //@line 7147
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 7150
  HEAP32[$5 >> 2] = $51; //@line 7151
  $52 = HEAP8[$51 >> 0] | 0; //@line 7152
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 7154
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 7161
   $$lcssa291 = $52; //@line 7161
   $$lcssa292 = $51; //@line 7161
  } else {
   $$0262309 = 0; //@line 7163
   $60 = $52; //@line 7163
   $65 = $51; //@line 7163
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 7168
    $64 = $65 + 1 | 0; //@line 7169
    HEAP32[$5 >> 2] = $64; //@line 7170
    $66 = HEAP8[$64 >> 0] | 0; //@line 7171
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 7173
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 7180
     $$lcssa291 = $66; //@line 7180
     $$lcssa292 = $64; //@line 7180
     break;
    } else {
     $$0262309 = $63; //@line 7183
     $60 = $66; //@line 7183
     $65 = $64; //@line 7183
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 7195
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 7197
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 7202
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 7207
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 7219
     $$2271 = 1; //@line 7219
     $storemerge274 = $79 + 3 | 0; //@line 7219
    } else {
     label = 23; //@line 7221
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 7225
    if ($$1270 | 0) {
     $$0 = -1; //@line 7228
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7243
     $106 = HEAP32[$105 >> 2] | 0; //@line 7244
     HEAP32[$2 >> 2] = $105 + 4; //@line 7246
     $363 = $106; //@line 7247
    } else {
     $363 = 0; //@line 7249
    }
    $$0259 = $363; //@line 7253
    $$2271 = 0; //@line 7253
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 7253
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 7255
   $109 = ($$0259 | 0) < 0; //@line 7256
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 7261
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 7261
   $$3272 = $$2271; //@line 7261
   $115 = $storemerge274; //@line 7261
  } else {
   $112 = _getint_671($5) | 0; //@line 7263
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 7266
    break;
   }
   $$1260 = $112; //@line 7270
   $$1263 = $$0262$lcssa; //@line 7270
   $$3272 = $$1270; //@line 7270
   $115 = HEAP32[$5 >> 2] | 0; //@line 7270
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 7281
     $156 = _getint_671($5) | 0; //@line 7282
     $$0254 = $156; //@line 7284
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 7284
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 7293
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 7298
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 7303
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 7310
      $144 = $125 + 4 | 0; //@line 7314
      HEAP32[$5 >> 2] = $144; //@line 7315
      $$0254 = $140; //@line 7316
      $$pre345 = $144; //@line 7316
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 7322
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7337
     $152 = HEAP32[$151 >> 2] | 0; //@line 7338
     HEAP32[$2 >> 2] = $151 + 4; //@line 7340
     $364 = $152; //@line 7341
    } else {
     $364 = 0; //@line 7343
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 7346
    HEAP32[$5 >> 2] = $154; //@line 7347
    $$0254 = $364; //@line 7348
    $$pre345 = $154; //@line 7348
   } else {
    $$0254 = -1; //@line 7350
    $$pre345 = $115; //@line 7350
   }
  } while (0);
  $$0252 = 0; //@line 7353
  $158 = $$pre345; //@line 7353
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 7360
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 7363
   HEAP32[$5 >> 2] = $158; //@line 7364
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (1481 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 7369
   $168 = $167 & 255; //@line 7370
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 7374
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 7381
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 7385
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 7389
     break L1;
    } else {
     label = 50; //@line 7392
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 7397
     $176 = $3 + ($$0253 << 3) | 0; //@line 7399
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 7404
     $182 = $6; //@line 7405
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 7407
     HEAP32[$182 + 4 >> 2] = $181; //@line 7410
     label = 50; //@line 7411
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 7415
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 7418
    $187 = HEAP32[$5 >> 2] | 0; //@line 7420
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 7424
   if ($10) {
    $187 = $158; //@line 7426
   } else {
    $$0243 = 0; //@line 7428
    $$0247 = $$1248; //@line 7428
    $$0269 = $$3272; //@line 7428
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 7434
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 7440
  $196 = $$1263 & -65537; //@line 7443
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 7444
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7452
       $$0243 = 0; //@line 7453
       $$0247 = $$1248; //@line 7453
       $$0269 = $$3272; //@line 7453
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7459
       $$0243 = 0; //@line 7460
       $$0247 = $$1248; //@line 7460
       $$0269 = $$3272; //@line 7460
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 7468
       HEAP32[$208 >> 2] = $$1248; //@line 7470
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 7473
       $$0243 = 0; //@line 7474
       $$0247 = $$1248; //@line 7474
       $$0269 = $$3272; //@line 7474
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 7481
       $$0243 = 0; //@line 7482
       $$0247 = $$1248; //@line 7482
       $$0269 = $$3272; //@line 7482
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 7489
       $$0243 = 0; //@line 7490
       $$0247 = $$1248; //@line 7490
       $$0269 = $$3272; //@line 7490
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7496
       $$0243 = 0; //@line 7497
       $$0247 = $$1248; //@line 7497
       $$0269 = $$3272; //@line 7497
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 7505
       HEAP32[$220 >> 2] = $$1248; //@line 7507
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 7510
       $$0243 = 0; //@line 7511
       $$0247 = $$1248; //@line 7511
       $$0269 = $$3272; //@line 7511
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 7516
       $$0247 = $$1248; //@line 7516
       $$0269 = $$3272; //@line 7516
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 7526
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 7526
     $$3265 = $$1263$ | 8; //@line 7526
     label = 62; //@line 7527
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 7531
     $$1255 = $$0254; //@line 7531
     $$3265 = $$1263$; //@line 7531
     label = 62; //@line 7532
     break;
    }
   case 111:
    {
     $242 = $6; //@line 7536
     $244 = HEAP32[$242 >> 2] | 0; //@line 7538
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 7541
     $248 = _fmt_o($244, $247, $11) | 0; //@line 7542
     $252 = $12 - $248 | 0; //@line 7546
     $$0228 = $248; //@line 7551
     $$1233 = 0; //@line 7551
     $$1238 = 1945; //@line 7551
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 7551
     $$4266 = $$1263$; //@line 7551
     $281 = $244; //@line 7551
     $283 = $247; //@line 7551
     label = 68; //@line 7552
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 7556
     $258 = HEAP32[$256 >> 2] | 0; //@line 7558
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 7561
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 7564
      $264 = tempRet0; //@line 7565
      $265 = $6; //@line 7566
      HEAP32[$265 >> 2] = $263; //@line 7568
      HEAP32[$265 + 4 >> 2] = $264; //@line 7571
      $$0232 = 1; //@line 7572
      $$0237 = 1945; //@line 7572
      $275 = $263; //@line 7572
      $276 = $264; //@line 7572
      label = 67; //@line 7573
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 7585
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 1945 : 1947 : 1946; //@line 7585
      $275 = $258; //@line 7585
      $276 = $261; //@line 7585
      label = 67; //@line 7586
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 7592
     $$0232 = 0; //@line 7598
     $$0237 = 1945; //@line 7598
     $275 = HEAP32[$197 >> 2] | 0; //@line 7598
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 7598
     label = 67; //@line 7599
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 7610
     $$2 = $13; //@line 7611
     $$2234 = 0; //@line 7611
     $$2239 = 1945; //@line 7611
     $$2251 = $11; //@line 7611
     $$5 = 1; //@line 7611
     $$6268 = $196; //@line 7611
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 7618
     label = 72; //@line 7619
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 7623
     $$1 = $302 | 0 ? $302 : 1955; //@line 7626
     label = 72; //@line 7627
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 7637
     HEAP32[$14 >> 2] = 0; //@line 7638
     HEAP32[$6 >> 2] = $8; //@line 7639
     $$4258354 = -1; //@line 7640
     $365 = $8; //@line 7640
     label = 76; //@line 7641
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 7645
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 7648
      $$0240$lcssa356 = 0; //@line 7649
      label = 85; //@line 7650
     } else {
      $$4258354 = $$0254; //@line 7652
      $365 = $$pre348; //@line 7652
      label = 76; //@line 7653
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 7660
     $$0247 = $$1248; //@line 7660
     $$0269 = $$3272; //@line 7660
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 7665
     $$2234 = 0; //@line 7665
     $$2239 = 1945; //@line 7665
     $$2251 = $11; //@line 7665
     $$5 = $$0254; //@line 7665
     $$6268 = $$1263$; //@line 7665
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 7671
    $227 = $6; //@line 7672
    $229 = HEAP32[$227 >> 2] | 0; //@line 7674
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 7677
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 7679
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 7685
    $$0228 = $234; //@line 7690
    $$1233 = $or$cond278 ? 0 : 2; //@line 7690
    $$1238 = $or$cond278 ? 1945 : 1945 + ($$1236 >> 4) | 0; //@line 7690
    $$2256 = $$1255; //@line 7690
    $$4266 = $$3265; //@line 7690
    $281 = $229; //@line 7690
    $283 = $232; //@line 7690
    label = 68; //@line 7691
   } else if ((label | 0) == 67) {
    label = 0; //@line 7694
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 7696
    $$1233 = $$0232; //@line 7696
    $$1238 = $$0237; //@line 7696
    $$2256 = $$0254; //@line 7696
    $$4266 = $$1263$; //@line 7696
    $281 = $275; //@line 7696
    $283 = $276; //@line 7696
    label = 68; //@line 7697
   } else if ((label | 0) == 72) {
    label = 0; //@line 7700
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 7701
    $306 = ($305 | 0) == 0; //@line 7702
    $$2 = $$1; //@line 7709
    $$2234 = 0; //@line 7709
    $$2239 = 1945; //@line 7709
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 7709
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 7709
    $$6268 = $196; //@line 7709
   } else if ((label | 0) == 76) {
    label = 0; //@line 7712
    $$0229316 = $365; //@line 7713
    $$0240315 = 0; //@line 7713
    $$1244314 = 0; //@line 7713
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 7715
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 7718
      $$2245 = $$1244314; //@line 7718
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 7721
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 7727
      $$2245 = $320; //@line 7727
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 7731
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 7734
      $$0240315 = $325; //@line 7734
      $$1244314 = $320; //@line 7734
     } else {
      $$0240$lcssa = $325; //@line 7736
      $$2245 = $320; //@line 7736
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 7742
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 7745
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 7748
     label = 85; //@line 7749
    } else {
     $$1230327 = $365; //@line 7751
     $$1241326 = 0; //@line 7751
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 7753
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7756
       label = 85; //@line 7757
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 7760
      $$1241326 = $331 + $$1241326 | 0; //@line 7761
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7764
       label = 85; //@line 7765
       break L97;
      }
      _out_670($0, $9, $331); //@line 7769
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7774
       label = 85; //@line 7775
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 7772
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 7783
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 7789
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 7791
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 7796
   $$2 = $or$cond ? $$0228 : $11; //@line 7801
   $$2234 = $$1233; //@line 7801
   $$2239 = $$1238; //@line 7801
   $$2251 = $11; //@line 7801
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 7801
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 7801
  } else if ((label | 0) == 85) {
   label = 0; //@line 7804
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 7806
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 7809
   $$0247 = $$1248; //@line 7809
   $$0269 = $$3272; //@line 7809
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 7814
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 7816
  $345 = $$$5 + $$2234 | 0; //@line 7817
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 7819
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 7820
  _out_670($0, $$2239, $$2234); //@line 7821
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 7823
  _pad_676($0, 48, $$$5, $343, 0); //@line 7824
  _out_670($0, $$2, $343); //@line 7825
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 7827
  $$0243 = $$2261; //@line 7828
  $$0247 = $$1248; //@line 7828
  $$0269 = $$3272; //@line 7828
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 7836
    } else {
     $$2242302 = 1; //@line 7838
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 7841
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 7844
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 7848
      $356 = $$2242302 + 1 | 0; //@line 7849
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 7852
      } else {
       $$2242$lcssa = $356; //@line 7854
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 7860
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 7866
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 7872
       } else {
        $$0 = 1; //@line 7874
        break;
       }
      }
     } else {
      $$0 = 1; //@line 7879
     }
    }
   } else {
    $$0 = $$1248; //@line 7883
   }
  }
 } while (0);
 STACKTOP = sp; //@line 7887
 return $$0 | 0; //@line 7887
}
function _mbed_vtracef($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$0199 = 0, $$1$off0 = 0, $$10 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$13 = 0, $$18 = 0, $$3 = 0, $$3147 = 0, $$3147168 = 0, $$3154 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$6 = 0, $$6150 = 0, $$9 = 0, $$lobit = 0, $$pre = 0, $$sink = 0, $125 = 0, $126 = 0, $151 = 0, $157 = 0, $168 = 0, $169 = 0, $171 = 0, $181 = 0, $182 = 0, $184 = 0, $186 = 0, $194 = 0, $201 = 0, $202 = 0, $204 = 0, $206 = 0, $209 = 0, $34 = 0, $38 = 0, $4 = 0, $43 = 0, $5 = 0, $54 = 0, $55 = 0, $59 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $69 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $76 = 0, $78 = 0, $82 = 0, $89 = 0, $95 = 0, $AsyncCtx = 0, $AsyncCtx27 = 0, $AsyncCtx30 = 0, $AsyncCtx34 = 0, $AsyncCtx38 = 0, $AsyncCtx42 = 0, $AsyncCtx45 = 0, $AsyncCtx49 = 0, $AsyncCtx52 = 0, $AsyncCtx56 = 0, $AsyncCtx60 = 0, $AsyncCtx64 = 0, $extract$t159 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer12 = 0, $vararg_buffer15 = 0, $vararg_buffer18 = 0, $vararg_buffer20 = 0, $vararg_buffer23 = 0, $vararg_buffer3 = 0, $vararg_buffer6 = 0, $vararg_buffer9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 640
 STACKTOP = STACKTOP + 96 | 0; //@line 641
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(96); //@line 641
 $vararg_buffer23 = sp + 72 | 0; //@line 642
 $vararg_buffer20 = sp + 64 | 0; //@line 643
 $vararg_buffer18 = sp + 56 | 0; //@line 644
 $vararg_buffer15 = sp + 48 | 0; //@line 645
 $vararg_buffer12 = sp + 40 | 0; //@line 646
 $vararg_buffer9 = sp + 32 | 0; //@line 647
 $vararg_buffer6 = sp + 24 | 0; //@line 648
 $vararg_buffer3 = sp + 16 | 0; //@line 649
 $vararg_buffer1 = sp + 8 | 0; //@line 650
 $vararg_buffer = sp; //@line 651
 $4 = sp + 80 | 0; //@line 652
 $5 = HEAP32[55] | 0; //@line 653
 do {
  if ($5 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(104, sp) | 0; //@line 657
   FUNCTION_TABLE_v[$5 & 0](); //@line 658
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 18; //@line 661
    HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 663
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 665
    HEAP32[$AsyncCtx + 12 >> 2] = $2; //@line 667
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 669
    HEAP32[$AsyncCtx + 20 >> 2] = $3; //@line 671
    HEAP8[$AsyncCtx + 24 >> 0] = $0; //@line 673
    HEAP32[$AsyncCtx + 28 >> 2] = $vararg_buffer23; //@line 675
    HEAP32[$AsyncCtx + 32 >> 2] = $vararg_buffer23; //@line 677
    HEAP32[$AsyncCtx + 36 >> 2] = $vararg_buffer12; //@line 679
    HEAP32[$AsyncCtx + 40 >> 2] = $vararg_buffer12; //@line 681
    HEAP32[$AsyncCtx + 44 >> 2] = $vararg_buffer9; //@line 683
    HEAP32[$AsyncCtx + 48 >> 2] = $vararg_buffer9; //@line 685
    HEAP32[$AsyncCtx + 52 >> 2] = $vararg_buffer6; //@line 687
    HEAP32[$AsyncCtx + 56 >> 2] = $vararg_buffer6; //@line 689
    HEAP32[$AsyncCtx + 60 >> 2] = $vararg_buffer20; //@line 691
    HEAP32[$AsyncCtx + 64 >> 2] = $vararg_buffer20; //@line 693
    HEAP32[$AsyncCtx + 68 >> 2] = $vararg_buffer18; //@line 695
    HEAP32[$AsyncCtx + 72 >> 2] = $vararg_buffer18; //@line 697
    HEAP32[$AsyncCtx + 76 >> 2] = $vararg_buffer15; //@line 699
    HEAP32[$AsyncCtx + 80 >> 2] = $vararg_buffer15; //@line 701
    HEAP32[$AsyncCtx + 84 >> 2] = $vararg_buffer3; //@line 703
    HEAP32[$AsyncCtx + 88 >> 2] = $vararg_buffer3; //@line 705
    HEAP32[$AsyncCtx + 92 >> 2] = $vararg_buffer1; //@line 707
    HEAP32[$AsyncCtx + 96 >> 2] = $vararg_buffer1; //@line 709
    HEAP32[$AsyncCtx + 100 >> 2] = $4; //@line 711
    sp = STACKTOP; //@line 712
    STACKTOP = sp; //@line 713
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 715
    HEAP32[57] = (HEAP32[57] | 0) + 1; //@line 718
    break;
   }
  }
 } while (0);
 $34 = HEAP32[46] | 0; //@line 723
 do {
  if ($34 | 0) {
   HEAP8[$34 >> 0] = 0; //@line 727
   do {
    if ($0 << 24 >> 24 > -1 & ($1 | 0) != 0) {
     $38 = HEAP32[43] | 0; //@line 733
     if (HEAP8[$38 >> 0] | 0) {
      if (_strstr($38, $1) | 0) {
       $$0$i = 1; //@line 740
       break;
      }
     }
     $43 = HEAP32[44] | 0; //@line 744
     if (!(HEAP8[$43 >> 0] | 0)) {
      label = 11; //@line 748
     } else {
      if (!(_strstr($43, $1) | 0)) {
       $$0$i = 1; //@line 753
      } else {
       label = 11; //@line 755
      }
     }
    } else {
     label = 11; //@line 759
    }
   } while (0);
   if ((label | 0) == 11) {
    $$0$i = 0; //@line 763
   }
   if (!((HEAP32[53] | 0) != 0 & ((($1 | 0) == 0 | (($2 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[50] = HEAP32[48]; //@line 775
    break;
   }
   $54 = HEAPU8[168] | 0; //@line 779
   $55 = $0 & 255; //@line 780
   if ($55 & 31 & $54 | 0) {
    $59 = $54 & 64; //@line 785
    $$lobit = $59 >>> 6; //@line 786
    $60 = $$lobit & 255; //@line 787
    $64 = ($54 & 32 | 0) == 0; //@line 791
    $65 = HEAP32[47] | 0; //@line 792
    $66 = HEAP32[46] | 0; //@line 793
    $67 = $0 << 24 >> 24 == 1; //@line 794
    do {
     if ($67 | ($54 & 128 | 0) != 0) {
      $AsyncCtx64 = _emscripten_alloc_async_context(8, sp) | 0; //@line 798
      _vsnprintf($66, $65, $2, $3) | 0; //@line 799
      if (___async) {
       HEAP32[$AsyncCtx64 >> 2] = 19; //@line 802
       HEAP8[$AsyncCtx64 + 4 >> 0] = $67 & 1; //@line 805
       sp = STACKTOP; //@line 806
       STACKTOP = sp; //@line 807
       return;
      }
      _emscripten_free_async_context($AsyncCtx64 | 0); //@line 809
      $69 = HEAP32[54] | 0; //@line 810
      if (!($67 & ($69 | 0) != 0)) {
       $73 = HEAP32[53] | 0; //@line 814
       $74 = HEAP32[46] | 0; //@line 815
       $AsyncCtx34 = _emscripten_alloc_async_context(4, sp) | 0; //@line 816
       FUNCTION_TABLE_vi[$73 & 127]($74); //@line 817
       if (___async) {
        HEAP32[$AsyncCtx34 >> 2] = 22; //@line 820
        sp = STACKTOP; //@line 821
        STACKTOP = sp; //@line 822
        return;
       } else {
        _emscripten_free_async_context($AsyncCtx34 | 0); //@line 824
        break;
       }
      }
      $71 = HEAP32[46] | 0; //@line 828
      $AsyncCtx27 = _emscripten_alloc_async_context(4, sp) | 0; //@line 829
      FUNCTION_TABLE_vi[$69 & 127]($71); //@line 830
      if (___async) {
       HEAP32[$AsyncCtx27 >> 2] = 20; //@line 833
       sp = STACKTOP; //@line 834
       STACKTOP = sp; //@line 835
       return;
      }
      _emscripten_free_async_context($AsyncCtx27 | 0); //@line 837
      $72 = HEAP32[54] | 0; //@line 838
      $AsyncCtx30 = _emscripten_alloc_async_context(4, sp) | 0; //@line 839
      FUNCTION_TABLE_vi[$72 & 127](1154); //@line 840
      if (___async) {
       HEAP32[$AsyncCtx30 >> 2] = 21; //@line 843
       sp = STACKTOP; //@line 844
       STACKTOP = sp; //@line 845
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx30 | 0); //@line 847
       break;
      }
     } else {
      if (!$59) {
       $$1$off0 = ($$lobit | 0) != 0; //@line 854
       $$1143 = $66; //@line 854
       $$1145 = $65; //@line 854
       $$3154 = 0; //@line 854
       label = 38; //@line 855
      } else {
       if ($64) {
        $$0142 = $66; //@line 858
        $$0144 = $65; //@line 858
       } else {
        $76 = _snprintf($66, $65, 1156, $vararg_buffer) | 0; //@line 860
        $$ = ($76 | 0) >= ($65 | 0) ? 0 : $76; //@line 862
        $78 = ($$ | 0) > 0; //@line 863
        $$0142 = $78 ? $66 + $$ | 0 : $66; //@line 868
        $$0144 = $65 - ($78 ? $$ : 0) | 0; //@line 868
       }
       if (($$0144 | 0) > 0) {
        $82 = $55 + -2 | 0; //@line 872
        switch ($82 >>> 1 | $82 << 31 | 0) {
        case 0:
         {
          $$sink = 1174; //@line 878
          label = 35; //@line 879
          break;
         }
        case 1:
         {
          $$sink = 1180; //@line 883
          label = 35; //@line 884
          break;
         }
        case 3:
         {
          $$sink = 1168; //@line 888
          label = 35; //@line 889
          break;
         }
        case 7:
         {
          $$sink = 1162; //@line 893
          label = 35; //@line 894
          break;
         }
        default:
         {
          $$0141 = 0; //@line 898
          $$1152 = 0; //@line 898
         }
        }
        if ((label | 0) == 35) {
         HEAP32[$vararg_buffer1 >> 2] = $$sink; //@line 902
         $$0141 = $60 & 1; //@line 905
         $$1152 = _snprintf($$0142, $$0144, 1186, $vararg_buffer1) | 0; //@line 905
        }
        $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 908
        $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 910
        if (($$1152$ | 0) > 0) {
         $89 = $$0141 << 24 >> 24 == 0; //@line 912
         $$1$off0 = $extract$t159; //@line 917
         $$1143 = $89 ? $$0142 : $$0142 + $$1152$ | 0; //@line 917
         $$1145 = $$0144 - ($89 ? 0 : $$1152$) | 0; //@line 917
         $$3154 = $$1152; //@line 917
         label = 38; //@line 918
        } else {
         $$1$off0 = $extract$t159; //@line 920
         $$1143 = $$0142; //@line 920
         $$1145 = $$0144; //@line 920
         $$3154 = $$1152$; //@line 920
         label = 38; //@line 921
        }
       }
      }
      L54 : do {
       if ((label | 0) == 38) {
        do {
         if (($$1145 | 0) > 0 & (HEAP32[51] | 0) != 0) {
          HEAP32[$4 >> 2] = HEAP32[$3 >> 2]; //@line 934
          $AsyncCtx60 = _emscripten_alloc_async_context(104, sp) | 0; //@line 935
          $95 = _vsnprintf(0, 0, $2, $4) | 0; //@line 936
          if (___async) {
           HEAP32[$AsyncCtx60 >> 2] = 23; //@line 939
           HEAP32[$AsyncCtx60 + 4 >> 2] = $$3154; //@line 941
           HEAP32[$AsyncCtx60 + 8 >> 2] = $vararg_buffer20; //@line 943
           HEAP32[$AsyncCtx60 + 12 >> 2] = $vararg_buffer20; //@line 945
           HEAP8[$AsyncCtx60 + 16 >> 0] = $$1$off0 & 1; //@line 948
           HEAP32[$AsyncCtx60 + 20 >> 2] = $vararg_buffer23; //@line 950
           HEAP32[$AsyncCtx60 + 24 >> 2] = $vararg_buffer23; //@line 952
           HEAP32[$AsyncCtx60 + 28 >> 2] = $vararg_buffer12; //@line 954
           HEAP32[$AsyncCtx60 + 32 >> 2] = $1; //@line 956
           HEAP32[$AsyncCtx60 + 36 >> 2] = $vararg_buffer12; //@line 958
           HEAP32[$AsyncCtx60 + 40 >> 2] = $vararg_buffer9; //@line 960
           HEAP32[$AsyncCtx60 + 44 >> 2] = $vararg_buffer9; //@line 962
           HEAP32[$AsyncCtx60 + 48 >> 2] = $vararg_buffer6; //@line 964
           HEAP32[$AsyncCtx60 + 52 >> 2] = $vararg_buffer6; //@line 966
           HEAP32[$AsyncCtx60 + 56 >> 2] = $$1143; //@line 968
           HEAP32[$AsyncCtx60 + 60 >> 2] = $$1145; //@line 970
           HEAP32[$AsyncCtx60 + 64 >> 2] = $55; //@line 972
           HEAP32[$AsyncCtx60 + 68 >> 2] = $2; //@line 974
           HEAP32[$AsyncCtx60 + 72 >> 2] = $3; //@line 976
           HEAP32[$AsyncCtx60 + 76 >> 2] = $vararg_buffer18; //@line 978
           HEAP32[$AsyncCtx60 + 80 >> 2] = $vararg_buffer18; //@line 980
           HEAP32[$AsyncCtx60 + 84 >> 2] = $vararg_buffer15; //@line 982
           HEAP32[$AsyncCtx60 + 88 >> 2] = $vararg_buffer15; //@line 984
           HEAP32[$AsyncCtx60 + 92 >> 2] = $vararg_buffer3; //@line 986
           HEAP32[$AsyncCtx60 + 96 >> 2] = $vararg_buffer3; //@line 988
           HEAP32[$AsyncCtx60 + 100 >> 2] = $4; //@line 990
           sp = STACKTOP; //@line 991
           STACKTOP = sp; //@line 992
           return;
          }
          _emscripten_free_async_context($AsyncCtx60 | 0); //@line 994
          $125 = HEAP32[51] | 0; //@line 999
          $AsyncCtx38 = _emscripten_alloc_async_context(100, sp) | 0; //@line 1000
          $126 = FUNCTION_TABLE_ii[$125 & 1](($$3154 | 0 ? 4 : 0) + $$3154 + $95 | 0) | 0; //@line 1001
          if (___async) {
           HEAP32[$AsyncCtx38 >> 2] = 24; //@line 1004
           HEAP8[$AsyncCtx38 + 4 >> 0] = $$1$off0 & 1; //@line 1007
           HEAP32[$AsyncCtx38 + 8 >> 2] = $vararg_buffer23; //@line 1009
           HEAP32[$AsyncCtx38 + 12 >> 2] = $vararg_buffer23; //@line 1011
           HEAP32[$AsyncCtx38 + 16 >> 2] = $vararg_buffer12; //@line 1013
           HEAP32[$AsyncCtx38 + 20 >> 2] = $1; //@line 1015
           HEAP32[$AsyncCtx38 + 24 >> 2] = $vararg_buffer12; //@line 1017
           HEAP32[$AsyncCtx38 + 28 >> 2] = $vararg_buffer9; //@line 1019
           HEAP32[$AsyncCtx38 + 32 >> 2] = $vararg_buffer9; //@line 1021
           HEAP32[$AsyncCtx38 + 36 >> 2] = $vararg_buffer6; //@line 1023
           HEAP32[$AsyncCtx38 + 40 >> 2] = $vararg_buffer6; //@line 1025
           HEAP32[$AsyncCtx38 + 44 >> 2] = $$1143; //@line 1027
           HEAP32[$AsyncCtx38 + 48 >> 2] = $$1145; //@line 1029
           HEAP32[$AsyncCtx38 + 52 >> 2] = $55; //@line 1031
           HEAP32[$AsyncCtx38 + 56 >> 2] = $vararg_buffer20; //@line 1033
           HEAP32[$AsyncCtx38 + 60 >> 2] = $vararg_buffer20; //@line 1035
           HEAP32[$AsyncCtx38 + 64 >> 2] = $2; //@line 1037
           HEAP32[$AsyncCtx38 + 68 >> 2] = $3; //@line 1039
           HEAP32[$AsyncCtx38 + 72 >> 2] = $vararg_buffer18; //@line 1041
           HEAP32[$AsyncCtx38 + 76 >> 2] = $vararg_buffer18; //@line 1043
           HEAP32[$AsyncCtx38 + 80 >> 2] = $vararg_buffer15; //@line 1045
           HEAP32[$AsyncCtx38 + 84 >> 2] = $vararg_buffer15; //@line 1047
           HEAP32[$AsyncCtx38 + 88 >> 2] = $vararg_buffer3; //@line 1049
           HEAP32[$AsyncCtx38 + 92 >> 2] = $vararg_buffer3; //@line 1051
           HEAP32[$AsyncCtx38 + 96 >> 2] = $4; //@line 1053
           sp = STACKTOP; //@line 1054
           STACKTOP = sp; //@line 1055
           return;
          } else {
           _emscripten_free_async_context($AsyncCtx38 | 0); //@line 1057
           HEAP32[$vararg_buffer3 >> 2] = $126; //@line 1058
           $151 = _snprintf($$1143, $$1145, 1186, $vararg_buffer3) | 0; //@line 1059
           $$10 = ($151 | 0) >= ($$1145 | 0) ? 0 : $151; //@line 1061
           if (($$10 | 0) > 0) {
            $$3 = $$1143 + $$10 | 0; //@line 1066
            $$3147 = $$1145 - $$10 | 0; //@line 1066
            label = 44; //@line 1067
            break;
           } else {
            $$3147168 = $$1145; //@line 1070
            $$3169 = $$1143; //@line 1070
            break;
           }
          }
         } else {
          $$3 = $$1143; //@line 1075
          $$3147 = $$1145; //@line 1075
          label = 44; //@line 1076
         }
        } while (0);
        if ((label | 0) == 44) {
         if (($$3147 | 0) > 0) {
          $$3147168 = $$3147; //@line 1082
          $$3169 = $$3; //@line 1082
         } else {
          break;
         }
        }
        $157 = $55 + -2 | 0; //@line 1087
        switch ($157 >>> 1 | $157 << 31 | 0) {
        case 0:
         {
          HEAP32[$vararg_buffer6 >> 2] = $1; //@line 1093
          $$5156 = _snprintf($$3169, $$3147168, 1189, $vararg_buffer6) | 0; //@line 1095
          break;
         }
        case 1:
         {
          HEAP32[$vararg_buffer9 >> 2] = $1; //@line 1099
          $$5156 = _snprintf($$3169, $$3147168, 1204, $vararg_buffer9) | 0; //@line 1101
          break;
         }
        case 3:
         {
          HEAP32[$vararg_buffer12 >> 2] = $1; //@line 1105
          $$5156 = _snprintf($$3169, $$3147168, 1219, $vararg_buffer12) | 0; //@line 1107
          break;
         }
        case 7:
         {
          HEAP32[$vararg_buffer15 >> 2] = $1; //@line 1111
          $$5156 = _snprintf($$3169, $$3147168, 1234, $vararg_buffer15) | 0; //@line 1113
          break;
         }
        default:
         {
          $$5156 = _snprintf($$3169, $$3147168, 1249, $vararg_buffer18) | 0; //@line 1118
         }
        }
        $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 1122
        $168 = $$3169 + $$5156$ | 0; //@line 1124
        $169 = $$3147168 - $$5156$ | 0; //@line 1125
        if (($$5156$ | 0) > 0 & ($169 | 0) > 0) {
         $AsyncCtx56 = _emscripten_alloc_async_context(32, sp) | 0; //@line 1129
         $171 = _vsnprintf($168, $169, $2, $3) | 0; //@line 1130
         if (___async) {
          HEAP32[$AsyncCtx56 >> 2] = 25; //@line 1133
          HEAP32[$AsyncCtx56 + 4 >> 2] = $vararg_buffer20; //@line 1135
          HEAP32[$AsyncCtx56 + 8 >> 2] = $vararg_buffer20; //@line 1137
          HEAP8[$AsyncCtx56 + 12 >> 0] = $$1$off0 & 1; //@line 1140
          HEAP32[$AsyncCtx56 + 16 >> 2] = $vararg_buffer23; //@line 1142
          HEAP32[$AsyncCtx56 + 20 >> 2] = $vararg_buffer23; //@line 1144
          HEAP32[$AsyncCtx56 + 24 >> 2] = $169; //@line 1146
          HEAP32[$AsyncCtx56 + 28 >> 2] = $168; //@line 1148
          sp = STACKTOP; //@line 1149
          STACKTOP = sp; //@line 1150
          return;
         }
         _emscripten_free_async_context($AsyncCtx56 | 0); //@line 1152
         $$13 = ($171 | 0) >= ($169 | 0) ? 0 : $171; //@line 1154
         $181 = $168 + $$13 | 0; //@line 1156
         $182 = $169 - $$13 | 0; //@line 1157
         if (($$13 | 0) > 0) {
          $184 = HEAP32[52] | 0; //@line 1160
          do {
           if (($182 | 0) > 0 & ($184 | 0) != 0) {
            $AsyncCtx42 = _emscripten_alloc_async_context(32, sp) | 0; //@line 1165
            $186 = FUNCTION_TABLE_i[$184 & 0]() | 0; //@line 1166
            if (___async) {
             HEAP32[$AsyncCtx42 >> 2] = 26; //@line 1169
             HEAP32[$AsyncCtx42 + 4 >> 2] = $vararg_buffer20; //@line 1171
             HEAP32[$AsyncCtx42 + 8 >> 2] = $181; //@line 1173
             HEAP32[$AsyncCtx42 + 12 >> 2] = $182; //@line 1175
             HEAP32[$AsyncCtx42 + 16 >> 2] = $vararg_buffer20; //@line 1177
             HEAP8[$AsyncCtx42 + 20 >> 0] = $$1$off0 & 1; //@line 1180
             HEAP32[$AsyncCtx42 + 24 >> 2] = $vararg_buffer23; //@line 1182
             HEAP32[$AsyncCtx42 + 28 >> 2] = $vararg_buffer23; //@line 1184
             sp = STACKTOP; //@line 1185
             STACKTOP = sp; //@line 1186
             return;
            } else {
             _emscripten_free_async_context($AsyncCtx42 | 0); //@line 1188
             HEAP32[$vararg_buffer20 >> 2] = $186; //@line 1189
             $194 = _snprintf($181, $182, 1186, $vararg_buffer20) | 0; //@line 1190
             $$18 = ($194 | 0) >= ($182 | 0) ? 0 : $194; //@line 1192
             if (($$18 | 0) > 0) {
              $$6 = $181 + $$18 | 0; //@line 1197
              $$6150 = $182 - $$18 | 0; //@line 1197
              $$9 = $$18; //@line 1197
              break;
             } else {
              break L54;
             }
            }
           } else {
            $$6 = $181; //@line 1204
            $$6150 = $182; //@line 1204
            $$9 = $$13; //@line 1204
           }
          } while (0);
          if (!(($$9 | 0) < 1 | ($$6150 | 0) < 1 | $$1$off0 ^ 1)) {
           _snprintf($$6, $$6150, 1264, $vararg_buffer23) | 0; //@line 1213
          }
         }
        }
       }
      } while (0);
      $201 = HEAP32[53] | 0; //@line 1219
      $202 = HEAP32[46] | 0; //@line 1220
      $AsyncCtx45 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1221
      FUNCTION_TABLE_vi[$201 & 127]($202); //@line 1222
      if (___async) {
       HEAP32[$AsyncCtx45 >> 2] = 27; //@line 1225
       sp = STACKTOP; //@line 1226
       STACKTOP = sp; //@line 1227
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx45 | 0); //@line 1229
       break;
      }
     }
    } while (0);
    HEAP32[50] = HEAP32[48]; //@line 1235
   }
  }
 } while (0);
 $204 = HEAP32[56] | 0; //@line 1239
 if (!$204) {
  STACKTOP = sp; //@line 1242
  return;
 }
 $206 = HEAP32[57] | 0; //@line 1244
 HEAP32[57] = 0; //@line 1245
 $AsyncCtx49 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1246
 FUNCTION_TABLE_v[$204 & 0](); //@line 1247
 if (___async) {
  HEAP32[$AsyncCtx49 >> 2] = 28; //@line 1250
  HEAP32[$AsyncCtx49 + 4 >> 2] = $206; //@line 1252
  sp = STACKTOP; //@line 1253
  STACKTOP = sp; //@line 1254
  return;
 }
 _emscripten_free_async_context($AsyncCtx49 | 0); //@line 1256
 if (($206 | 0) > 1) {
  $$0199 = $206; //@line 1259
 } else {
  STACKTOP = sp; //@line 1261
  return;
 }
 while (1) {
  $209 = $$0199 + -1 | 0; //@line 1264
  $$pre = HEAP32[56] | 0; //@line 1265
  $AsyncCtx52 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1266
  FUNCTION_TABLE_v[$$pre & 0](); //@line 1267
  if (___async) {
   label = 70; //@line 1270
   break;
  }
  _emscripten_free_async_context($AsyncCtx52 | 0); //@line 1273
  if (($$0199 | 0) > 2) {
   $$0199 = $209; //@line 1276
  } else {
   label = 72; //@line 1278
   break;
  }
 }
 if ((label | 0) == 70) {
  HEAP32[$AsyncCtx52 >> 2] = 29; //@line 1283
  HEAP32[$AsyncCtx52 + 4 >> 2] = $$0199; //@line 1285
  HEAP32[$AsyncCtx52 + 8 >> 2] = $209; //@line 1287
  sp = STACKTOP; //@line 1288
  STACKTOP = sp; //@line 1289
  return;
 } else if ((label | 0) == 72) {
  STACKTOP = sp; //@line 1292
  return;
 }
}
function _mbed_vtracef__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$1$off0 = 0, $$1$off0$expand_i1_val = 0, $$1$off0$expand_i1_val18 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$3154 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $$lobit = 0, $$sink = 0, $10 = 0, $102 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $136 = 0, $14 = 0, $147 = 0, $148 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $163 = 0, $164 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $50 = 0, $53 = 0, $57 = 0, $6 = 0, $62 = 0, $73 = 0, $74 = 0, $78 = 0, $79 = 0, $8 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $89 = 0, $91 = 0, $95 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx11 = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx7 = 0, $ReallocAsyncCtx8 = 0, $extract$t159 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12216
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12218
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12222
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12224
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12226
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 12228
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12230
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12232
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 12234
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 12236
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 12238
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 12240
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 12242
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 12244
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 12246
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 12248
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 12250
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 12252
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 12254
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 12256
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 12258
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 12260
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 12262
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 12266
 HEAP32[57] = (HEAP32[57] | 0) + 1; //@line 12269
 $53 = HEAP32[46] | 0; //@line 12270
 do {
  if ($53 | 0) {
   HEAP8[$53 >> 0] = 0; //@line 12274
   do {
    if ($12 << 24 >> 24 > -1 & ($8 | 0) != 0) {
     $57 = HEAP32[43] | 0; //@line 12280
     if (HEAP8[$57 >> 0] | 0) {
      if (_strstr($57, $8) | 0) {
       $$0$i = 1; //@line 12287
       break;
      }
     }
     $62 = HEAP32[44] | 0; //@line 12291
     if (!(HEAP8[$62 >> 0] | 0)) {
      label = 9; //@line 12295
     } else {
      if (!(_strstr($62, $8) | 0)) {
       $$0$i = 1; //@line 12300
      } else {
       label = 9; //@line 12302
      }
     }
    } else {
     label = 9; //@line 12306
    }
   } while (0);
   if ((label | 0) == 9) {
    $$0$i = 0; //@line 12310
   }
   if (!((HEAP32[53] | 0) != 0 & ((($8 | 0) == 0 | (($6 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[50] = HEAP32[48]; //@line 12322
    break;
   }
   $73 = HEAPU8[168] | 0; //@line 12326
   $74 = $12 & 255; //@line 12327
   if ($74 & 31 & $73 | 0) {
    $78 = $73 & 64; //@line 12332
    $$lobit = $78 >>> 6; //@line 12333
    $79 = $$lobit & 255; //@line 12334
    $83 = ($73 & 32 | 0) == 0; //@line 12338
    $84 = HEAP32[47] | 0; //@line 12339
    $85 = HEAP32[46] | 0; //@line 12340
    $86 = $12 << 24 >> 24 == 1; //@line 12341
    if ($86 | ($73 & 128 | 0) != 0) {
     $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 12344
     _vsnprintf($85, $84, $6, $10) | 0; //@line 12345
     if (___async) {
      HEAP32[$ReallocAsyncCtx12 >> 2] = 19; //@line 12348
      $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 12349
      $$expand_i1_val = $86 & 1; //@line 12350
      HEAP8[$87 >> 0] = $$expand_i1_val; //@line 12351
      sp = STACKTOP; //@line 12352
      return;
     }
     ___async_unwind = 0; //@line 12355
     HEAP32[$ReallocAsyncCtx12 >> 2] = 19; //@line 12356
     $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 12357
     $$expand_i1_val = $86 & 1; //@line 12358
     HEAP8[$87 >> 0] = $$expand_i1_val; //@line 12359
     sp = STACKTOP; //@line 12360
     return;
    }
    if (!$78) {
     $$1$off0 = ($$lobit | 0) != 0; //@line 12366
     $$1143 = $85; //@line 12366
     $$1145 = $84; //@line 12366
     $$3154 = 0; //@line 12366
     label = 28; //@line 12367
    } else {
     if ($83) {
      $$0142 = $85; //@line 12370
      $$0144 = $84; //@line 12370
     } else {
      $89 = _snprintf($85, $84, 1156, $2) | 0; //@line 12372
      $$ = ($89 | 0) >= ($84 | 0) ? 0 : $89; //@line 12374
      $91 = ($$ | 0) > 0; //@line 12375
      $$0142 = $91 ? $85 + $$ | 0 : $85; //@line 12380
      $$0144 = $84 - ($91 ? $$ : 0) | 0; //@line 12380
     }
     if (($$0144 | 0) > 0) {
      $95 = $74 + -2 | 0; //@line 12384
      switch ($95 >>> 1 | $95 << 31 | 0) {
      case 0:
       {
        $$sink = 1174; //@line 12390
        label = 25; //@line 12391
        break;
       }
      case 1:
       {
        $$sink = 1180; //@line 12395
        label = 25; //@line 12396
        break;
       }
      case 3:
       {
        $$sink = 1168; //@line 12400
        label = 25; //@line 12401
        break;
       }
      case 7:
       {
        $$sink = 1162; //@line 12405
        label = 25; //@line 12406
        break;
       }
      default:
       {
        $$0141 = 0; //@line 12410
        $$1152 = 0; //@line 12410
       }
      }
      if ((label | 0) == 25) {
       HEAP32[$46 >> 2] = $$sink; //@line 12414
       $$0141 = $79 & 1; //@line 12417
       $$1152 = _snprintf($$0142, $$0144, 1186, $46) | 0; //@line 12417
      }
      $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 12420
      $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 12422
      if (($$1152$ | 0) > 0) {
       $102 = $$0141 << 24 >> 24 == 0; //@line 12424
       $$1$off0 = $extract$t159; //@line 12429
       $$1143 = $102 ? $$0142 : $$0142 + $$1152$ | 0; //@line 12429
       $$1145 = $$0144 - ($102 ? 0 : $$1152$) | 0; //@line 12429
       $$3154 = $$1152; //@line 12429
       label = 28; //@line 12430
      } else {
       $$1$off0 = $extract$t159; //@line 12432
       $$1143 = $$0142; //@line 12432
       $$1145 = $$0144; //@line 12432
       $$3154 = $$1152$; //@line 12432
       label = 28; //@line 12433
      }
     }
    }
    if ((label | 0) == 28) {
     if (($$1145 | 0) > 0 & (HEAP32[51] | 0) != 0) {
      HEAP32[$50 >> 2] = HEAP32[$10 >> 2]; //@line 12444
      $ReallocAsyncCtx11 = _emscripten_realloc_async_context(104) | 0; //@line 12445
      $108 = _vsnprintf(0, 0, $6, $50) | 0; //@line 12446
      if (___async) {
       HEAP32[$ReallocAsyncCtx11 >> 2] = 23; //@line 12449
       $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 12450
       HEAP32[$109 >> 2] = $$3154; //@line 12451
       $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 12452
       HEAP32[$110 >> 2] = $30; //@line 12453
       $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 12454
       HEAP32[$111 >> 2] = $32; //@line 12455
       $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 12456
       $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 12457
       HEAP8[$112 >> 0] = $$1$off0$expand_i1_val; //@line 12458
       $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 12459
       HEAP32[$113 >> 2] = $14; //@line 12460
       $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 12461
       HEAP32[$114 >> 2] = $16; //@line 12462
       $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 12463
       HEAP32[$115 >> 2] = $18; //@line 12464
       $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 12465
       HEAP32[$116 >> 2] = $8; //@line 12466
       $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 12467
       HEAP32[$117 >> 2] = $20; //@line 12468
       $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 12469
       HEAP32[$118 >> 2] = $22; //@line 12470
       $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 12471
       HEAP32[$119 >> 2] = $24; //@line 12472
       $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 12473
       HEAP32[$120 >> 2] = $26; //@line 12474
       $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 12475
       HEAP32[$121 >> 2] = $28; //@line 12476
       $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 12477
       HEAP32[$122 >> 2] = $$1143; //@line 12478
       $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 12479
       HEAP32[$123 >> 2] = $$1145; //@line 12480
       $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 12481
       HEAP32[$124 >> 2] = $74; //@line 12482
       $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 12483
       HEAP32[$125 >> 2] = $6; //@line 12484
       $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 12485
       HEAP32[$126 >> 2] = $10; //@line 12486
       $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 12487
       HEAP32[$127 >> 2] = $34; //@line 12488
       $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 12489
       HEAP32[$128 >> 2] = $36; //@line 12490
       $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 12491
       HEAP32[$129 >> 2] = $38; //@line 12492
       $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 12493
       HEAP32[$130 >> 2] = $40; //@line 12494
       $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 12495
       HEAP32[$131 >> 2] = $42; //@line 12496
       $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 12497
       HEAP32[$132 >> 2] = $44; //@line 12498
       $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 12499
       HEAP32[$133 >> 2] = $50; //@line 12500
       sp = STACKTOP; //@line 12501
       return;
      }
      HEAP32[___async_retval >> 2] = $108; //@line 12505
      ___async_unwind = 0; //@line 12506
      HEAP32[$ReallocAsyncCtx11 >> 2] = 23; //@line 12507
      $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 12508
      HEAP32[$109 >> 2] = $$3154; //@line 12509
      $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 12510
      HEAP32[$110 >> 2] = $30; //@line 12511
      $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 12512
      HEAP32[$111 >> 2] = $32; //@line 12513
      $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 12514
      $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 12515
      HEAP8[$112 >> 0] = $$1$off0$expand_i1_val; //@line 12516
      $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 12517
      HEAP32[$113 >> 2] = $14; //@line 12518
      $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 12519
      HEAP32[$114 >> 2] = $16; //@line 12520
      $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 12521
      HEAP32[$115 >> 2] = $18; //@line 12522
      $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 12523
      HEAP32[$116 >> 2] = $8; //@line 12524
      $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 12525
      HEAP32[$117 >> 2] = $20; //@line 12526
      $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 12527
      HEAP32[$118 >> 2] = $22; //@line 12528
      $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 12529
      HEAP32[$119 >> 2] = $24; //@line 12530
      $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 12531
      HEAP32[$120 >> 2] = $26; //@line 12532
      $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 12533
      HEAP32[$121 >> 2] = $28; //@line 12534
      $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 12535
      HEAP32[$122 >> 2] = $$1143; //@line 12536
      $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 12537
      HEAP32[$123 >> 2] = $$1145; //@line 12538
      $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 12539
      HEAP32[$124 >> 2] = $74; //@line 12540
      $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 12541
      HEAP32[$125 >> 2] = $6; //@line 12542
      $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 12543
      HEAP32[$126 >> 2] = $10; //@line 12544
      $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 12545
      HEAP32[$127 >> 2] = $34; //@line 12546
      $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 12547
      HEAP32[$128 >> 2] = $36; //@line 12548
      $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 12549
      HEAP32[$129 >> 2] = $38; //@line 12550
      $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 12551
      HEAP32[$130 >> 2] = $40; //@line 12552
      $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 12553
      HEAP32[$131 >> 2] = $42; //@line 12554
      $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 12555
      HEAP32[$132 >> 2] = $44; //@line 12556
      $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 12557
      HEAP32[$133 >> 2] = $50; //@line 12558
      sp = STACKTOP; //@line 12559
      return;
     }
     if (($$1145 | 0) > 0) {
      $136 = $74 + -2 | 0; //@line 12564
      switch ($136 >>> 1 | $136 << 31 | 0) {
      case 0:
       {
        HEAP32[$26 >> 2] = $8; //@line 12570
        $$5156 = _snprintf($$1143, $$1145, 1189, $26) | 0; //@line 12572
        break;
       }
      case 1:
       {
        HEAP32[$22 >> 2] = $8; //@line 12576
        $$5156 = _snprintf($$1143, $$1145, 1204, $22) | 0; //@line 12578
        break;
       }
      case 3:
       {
        HEAP32[$18 >> 2] = $8; //@line 12582
        $$5156 = _snprintf($$1143, $$1145, 1219, $18) | 0; //@line 12584
        break;
       }
      case 7:
       {
        HEAP32[$38 >> 2] = $8; //@line 12588
        $$5156 = _snprintf($$1143, $$1145, 1234, $38) | 0; //@line 12590
        break;
       }
      default:
       {
        $$5156 = _snprintf($$1143, $$1145, 1249, $34) | 0; //@line 12595
       }
      }
      $$5156$ = ($$5156 | 0) < ($$1145 | 0) ? $$5156 : 0; //@line 12599
      $147 = $$1143 + $$5156$ | 0; //@line 12601
      $148 = $$1145 - $$5156$ | 0; //@line 12602
      if (($$5156$ | 0) > 0 & ($148 | 0) > 0) {
       $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 12606
       $150 = _vsnprintf($147, $148, $6, $10) | 0; //@line 12607
       if (___async) {
        HEAP32[$ReallocAsyncCtx10 >> 2] = 25; //@line 12610
        $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 12611
        HEAP32[$151 >> 2] = $30; //@line 12612
        $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 12613
        HEAP32[$152 >> 2] = $32; //@line 12614
        $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 12615
        $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 12616
        HEAP8[$153 >> 0] = $$1$off0$expand_i1_val18; //@line 12617
        $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 12618
        HEAP32[$154 >> 2] = $14; //@line 12619
        $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 12620
        HEAP32[$155 >> 2] = $16; //@line 12621
        $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 12622
        HEAP32[$156 >> 2] = $148; //@line 12623
        $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 12624
        HEAP32[$157 >> 2] = $147; //@line 12625
        sp = STACKTOP; //@line 12626
        return;
       }
       HEAP32[___async_retval >> 2] = $150; //@line 12630
       ___async_unwind = 0; //@line 12631
       HEAP32[$ReallocAsyncCtx10 >> 2] = 25; //@line 12632
       $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 12633
       HEAP32[$151 >> 2] = $30; //@line 12634
       $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 12635
       HEAP32[$152 >> 2] = $32; //@line 12636
       $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 12637
       $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 12638
       HEAP8[$153 >> 0] = $$1$off0$expand_i1_val18; //@line 12639
       $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 12640
       HEAP32[$154 >> 2] = $14; //@line 12641
       $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 12642
       HEAP32[$155 >> 2] = $16; //@line 12643
       $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 12644
       HEAP32[$156 >> 2] = $148; //@line 12645
       $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 12646
       HEAP32[$157 >> 2] = $147; //@line 12647
       sp = STACKTOP; //@line 12648
       return;
      }
     }
    }
    $159 = HEAP32[53] | 0; //@line 12653
    $160 = HEAP32[46] | 0; //@line 12654
    $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 12655
    FUNCTION_TABLE_vi[$159 & 127]($160); //@line 12656
    if (___async) {
     HEAP32[$ReallocAsyncCtx7 >> 2] = 27; //@line 12659
     sp = STACKTOP; //@line 12660
     return;
    }
    ___async_unwind = 0; //@line 12663
    HEAP32[$ReallocAsyncCtx7 >> 2] = 27; //@line 12664
    sp = STACKTOP; //@line 12665
    return;
   }
  }
 } while (0);
 $161 = HEAP32[56] | 0; //@line 12670
 if (!$161) {
  return;
 }
 $163 = HEAP32[57] | 0; //@line 12675
 HEAP32[57] = 0; //@line 12676
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 12677
 FUNCTION_TABLE_v[$161 & 0](); //@line 12678
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 28; //@line 12681
  $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 12682
  HEAP32[$164 >> 2] = $163; //@line 12683
  sp = STACKTOP; //@line 12684
  return;
 }
 ___async_unwind = 0; //@line 12687
 HEAP32[$ReallocAsyncCtx8 >> 2] = 28; //@line 12688
 $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 12689
 HEAP32[$164 >> 2] = $163; //@line 12690
 sp = STACKTOP; //@line 12691
 return;
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 4759
 $3 = HEAP32[1060] | 0; //@line 4760
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 4763
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 4767
 $7 = $6 & 3; //@line 4768
 if (($7 | 0) == 1) {
  _abort(); //@line 4771
 }
 $9 = $6 & -8; //@line 4774
 $10 = $2 + $9 | 0; //@line 4775
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 4780
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 4786
   $17 = $13 + $9 | 0; //@line 4787
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 4790
   }
   if ((HEAP32[1061] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 4796
    $106 = HEAP32[$105 >> 2] | 0; //@line 4797
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 4801
     $$1382 = $17; //@line 4801
     $114 = $16; //@line 4801
     break;
    }
    HEAP32[1058] = $17; //@line 4804
    HEAP32[$105 >> 2] = $106 & -2; //@line 4806
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 4809
    HEAP32[$16 + $17 >> 2] = $17; //@line 4811
    return;
   }
   $21 = $13 >>> 3; //@line 4814
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 4818
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 4820
    $28 = 4264 + ($21 << 1 << 2) | 0; //@line 4822
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 4827
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 4834
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1056] = HEAP32[1056] & ~(1 << $21); //@line 4844
     $$1 = $16; //@line 4845
     $$1382 = $17; //@line 4845
     $114 = $16; //@line 4845
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 4851
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 4855
     }
     $41 = $26 + 8 | 0; //@line 4858
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 4862
     } else {
      _abort(); //@line 4864
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 4869
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 4870
    $$1 = $16; //@line 4871
    $$1382 = $17; //@line 4871
    $114 = $16; //@line 4871
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 4875
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 4877
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 4881
     $60 = $59 + 4 | 0; //@line 4882
     $61 = HEAP32[$60 >> 2] | 0; //@line 4883
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 4886
      if (!$63) {
       $$3 = 0; //@line 4889
       break;
      } else {
       $$1387 = $63; //@line 4892
       $$1390 = $59; //@line 4892
      }
     } else {
      $$1387 = $61; //@line 4895
      $$1390 = $60; //@line 4895
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 4898
      $66 = HEAP32[$65 >> 2] | 0; //@line 4899
      if ($66 | 0) {
       $$1387 = $66; //@line 4902
       $$1390 = $65; //@line 4902
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 4905
      $69 = HEAP32[$68 >> 2] | 0; //@line 4906
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 4911
       $$1390 = $68; //@line 4911
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 4916
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 4919
      $$3 = $$1387; //@line 4920
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 4925
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 4928
     }
     $53 = $51 + 12 | 0; //@line 4931
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 4935
     }
     $56 = $48 + 8 | 0; //@line 4938
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 4942
      HEAP32[$56 >> 2] = $51; //@line 4943
      $$3 = $48; //@line 4944
      break;
     } else {
      _abort(); //@line 4947
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 4954
    $$1382 = $17; //@line 4954
    $114 = $16; //@line 4954
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 4957
    $75 = 4528 + ($74 << 2) | 0; //@line 4958
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 4963
      if (!$$3) {
       HEAP32[1057] = HEAP32[1057] & ~(1 << $74); //@line 4970
       $$1 = $16; //@line 4971
       $$1382 = $17; //@line 4971
       $114 = $16; //@line 4971
       break L10;
      }
     } else {
      if ((HEAP32[1060] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 4978
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 4986
       if (!$$3) {
        $$1 = $16; //@line 4989
        $$1382 = $17; //@line 4989
        $114 = $16; //@line 4989
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1060] | 0; //@line 4997
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 5000
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 5004
    $92 = $16 + 16 | 0; //@line 5005
    $93 = HEAP32[$92 >> 2] | 0; //@line 5006
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 5012
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 5016
       HEAP32[$93 + 24 >> 2] = $$3; //@line 5018
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 5024
    if (!$99) {
     $$1 = $16; //@line 5027
     $$1382 = $17; //@line 5027
     $114 = $16; //@line 5027
    } else {
     if ((HEAP32[1060] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 5032
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 5036
      HEAP32[$99 + 24 >> 2] = $$3; //@line 5038
      $$1 = $16; //@line 5039
      $$1382 = $17; //@line 5039
      $114 = $16; //@line 5039
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 5045
   $$1382 = $9; //@line 5045
   $114 = $2; //@line 5045
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 5050
 }
 $115 = $10 + 4 | 0; //@line 5053
 $116 = HEAP32[$115 >> 2] | 0; //@line 5054
 if (!($116 & 1)) {
  _abort(); //@line 5058
 }
 if (!($116 & 2)) {
  if ((HEAP32[1062] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1059] | 0) + $$1382 | 0; //@line 5068
   HEAP32[1059] = $124; //@line 5069
   HEAP32[1062] = $$1; //@line 5070
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 5073
   if (($$1 | 0) != (HEAP32[1061] | 0)) {
    return;
   }
   HEAP32[1061] = 0; //@line 5079
   HEAP32[1058] = 0; //@line 5080
   return;
  }
  if ((HEAP32[1061] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1058] | 0) + $$1382 | 0; //@line 5087
   HEAP32[1058] = $132; //@line 5088
   HEAP32[1061] = $114; //@line 5089
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 5092
   HEAP32[$114 + $132 >> 2] = $132; //@line 5094
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 5098
  $138 = $116 >>> 3; //@line 5099
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 5104
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 5106
    $145 = 4264 + ($138 << 1 << 2) | 0; //@line 5108
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1060] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 5114
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 5121
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1056] = HEAP32[1056] & ~(1 << $138); //@line 5131
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 5137
    } else {
     if ((HEAP32[1060] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 5142
     }
     $160 = $143 + 8 | 0; //@line 5145
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 5149
     } else {
      _abort(); //@line 5151
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 5156
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 5157
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 5160
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 5162
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 5166
      $180 = $179 + 4 | 0; //@line 5167
      $181 = HEAP32[$180 >> 2] | 0; //@line 5168
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 5171
       if (!$183) {
        $$3400 = 0; //@line 5174
        break;
       } else {
        $$1398 = $183; //@line 5177
        $$1402 = $179; //@line 5177
       }
      } else {
       $$1398 = $181; //@line 5180
       $$1402 = $180; //@line 5180
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 5183
       $186 = HEAP32[$185 >> 2] | 0; //@line 5184
       if ($186 | 0) {
        $$1398 = $186; //@line 5187
        $$1402 = $185; //@line 5187
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 5190
       $189 = HEAP32[$188 >> 2] | 0; //@line 5191
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 5196
        $$1402 = $188; //@line 5196
       }
      }
      if ((HEAP32[1060] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 5202
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 5205
       $$3400 = $$1398; //@line 5206
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 5211
      if ((HEAP32[1060] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 5215
      }
      $173 = $170 + 12 | 0; //@line 5218
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 5222
      }
      $176 = $167 + 8 | 0; //@line 5225
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 5229
       HEAP32[$176 >> 2] = $170; //@line 5230
       $$3400 = $167; //@line 5231
       break;
      } else {
       _abort(); //@line 5234
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 5242
     $196 = 4528 + ($195 << 2) | 0; //@line 5243
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 5248
       if (!$$3400) {
        HEAP32[1057] = HEAP32[1057] & ~(1 << $195); //@line 5255
        break L108;
       }
      } else {
       if ((HEAP32[1060] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 5262
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 5270
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1060] | 0; //@line 5280
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 5283
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 5287
     $213 = $10 + 16 | 0; //@line 5288
     $214 = HEAP32[$213 >> 2] | 0; //@line 5289
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 5295
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 5299
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 5301
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 5307
     if ($220 | 0) {
      if ((HEAP32[1060] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 5313
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 5317
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 5319
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 5328
  HEAP32[$114 + $137 >> 2] = $137; //@line 5330
  if (($$1 | 0) == (HEAP32[1061] | 0)) {
   HEAP32[1058] = $137; //@line 5334
   return;
  } else {
   $$2 = $137; //@line 5337
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 5341
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 5344
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 5346
  $$2 = $$1382; //@line 5347
 }
 $235 = $$2 >>> 3; //@line 5349
 if ($$2 >>> 0 < 256) {
  $238 = 4264 + ($235 << 1 << 2) | 0; //@line 5353
  $239 = HEAP32[1056] | 0; //@line 5354
  $240 = 1 << $235; //@line 5355
  if (!($239 & $240)) {
   HEAP32[1056] = $239 | $240; //@line 5360
   $$0403 = $238; //@line 5362
   $$pre$phiZ2D = $238 + 8 | 0; //@line 5362
  } else {
   $244 = $238 + 8 | 0; //@line 5364
   $245 = HEAP32[$244 >> 2] | 0; //@line 5365
   if ((HEAP32[1060] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 5369
   } else {
    $$0403 = $245; //@line 5372
    $$pre$phiZ2D = $244; //@line 5372
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 5375
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 5377
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 5379
  HEAP32[$$1 + 12 >> 2] = $238; //@line 5381
  return;
 }
 $251 = $$2 >>> 8; //@line 5384
 if (!$251) {
  $$0396 = 0; //@line 5387
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 5391
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 5395
   $257 = $251 << $256; //@line 5396
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 5399
   $262 = $257 << $260; //@line 5401
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 5404
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 5409
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 5415
  }
 }
 $276 = 4528 + ($$0396 << 2) | 0; //@line 5418
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 5420
 HEAP32[$$1 + 20 >> 2] = 0; //@line 5423
 HEAP32[$$1 + 16 >> 2] = 0; //@line 5424
 $280 = HEAP32[1057] | 0; //@line 5425
 $281 = 1 << $$0396; //@line 5426
 do {
  if (!($280 & $281)) {
   HEAP32[1057] = $280 | $281; //@line 5432
   HEAP32[$276 >> 2] = $$1; //@line 5433
   HEAP32[$$1 + 24 >> 2] = $276; //@line 5435
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 5437
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 5439
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 5447
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 5447
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 5454
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 5458
    $301 = HEAP32[$299 >> 2] | 0; //@line 5460
    if (!$301) {
     label = 121; //@line 5463
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 5466
     $$0384 = $301; //@line 5466
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1060] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 5473
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 5476
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 5478
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 5480
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 5482
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 5487
    $309 = HEAP32[$308 >> 2] | 0; //@line 5488
    $310 = HEAP32[1060] | 0; //@line 5489
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 5495
     HEAP32[$308 >> 2] = $$1; //@line 5496
     HEAP32[$$1 + 8 >> 2] = $309; //@line 5498
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 5500
     HEAP32[$$1 + 24 >> 2] = 0; //@line 5502
     break;
    } else {
     _abort(); //@line 5505
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1064] | 0) + -1 | 0; //@line 5512
 HEAP32[1064] = $319; //@line 5513
 if (!$319) {
  $$0212$in$i = 4680; //@line 5516
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 5521
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 5527
  }
 }
 HEAP32[1064] = -1; //@line 5530
 return;
}
function _main() {
 var $AsyncCtx = 0, $AsyncCtx101 = 0, $AsyncCtx104 = 0, $AsyncCtx107 = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx62 = 0, $AsyncCtx65 = 0, $AsyncCtx68 = 0, $AsyncCtx7 = 0, $AsyncCtx71 = 0, $AsyncCtx74 = 0, $AsyncCtx77 = 0, $AsyncCtx80 = 0, $AsyncCtx83 = 0, $AsyncCtx86 = 0, $AsyncCtx89 = 0, $AsyncCtx92 = 0, $AsyncCtx95 = 0, $AsyncCtx98 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1932
 while (1) {
  $AsyncCtx59 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1934
  __ZN4mbed6BusOutaSEi(4148, 0) | 0; //@line 1935
  if (___async) {
   label = 3; //@line 1938
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 1941
  $AsyncCtx107 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1942
  _wait(.25); //@line 1943
  if (___async) {
   label = 5; //@line 1946
   break;
  }
  _emscripten_free_async_context($AsyncCtx107 | 0); //@line 1949
  $AsyncCtx55 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1950
  __ZN4mbed6BusOutaSEi(4148, 1) | 0; //@line 1951
  if (___async) {
   label = 7; //@line 1954
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 1957
  $AsyncCtx104 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1958
  _wait(.25); //@line 1959
  if (___async) {
   label = 9; //@line 1962
   break;
  }
  _emscripten_free_async_context($AsyncCtx104 | 0); //@line 1965
  $AsyncCtx51 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1966
  __ZN4mbed6BusOutaSEi(4148, 2) | 0; //@line 1967
  if (___async) {
   label = 11; //@line 1970
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 1973
  $AsyncCtx101 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1974
  _wait(.25); //@line 1975
  if (___async) {
   label = 13; //@line 1978
   break;
  }
  _emscripten_free_async_context($AsyncCtx101 | 0); //@line 1981
  $AsyncCtx47 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1982
  __ZN4mbed6BusOutaSEi(4148, 3) | 0; //@line 1983
  if (___async) {
   label = 15; //@line 1986
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 1989
  $AsyncCtx98 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1990
  _wait(.25); //@line 1991
  if (___async) {
   label = 17; //@line 1994
   break;
  }
  _emscripten_free_async_context($AsyncCtx98 | 0); //@line 1997
  $AsyncCtx43 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1998
  __ZN4mbed6BusOutaSEi(4148, 4) | 0; //@line 1999
  if (___async) {
   label = 19; //@line 2002
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 2005
  $AsyncCtx95 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2006
  _wait(.25); //@line 2007
  if (___async) {
   label = 21; //@line 2010
   break;
  }
  _emscripten_free_async_context($AsyncCtx95 | 0); //@line 2013
  $AsyncCtx39 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2014
  __ZN4mbed6BusOutaSEi(4148, 5) | 0; //@line 2015
  if (___async) {
   label = 23; //@line 2018
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 2021
  $AsyncCtx92 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2022
  _wait(.25); //@line 2023
  if (___async) {
   label = 25; //@line 2026
   break;
  }
  _emscripten_free_async_context($AsyncCtx92 | 0); //@line 2029
  $AsyncCtx35 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2030
  __ZN4mbed6BusOutaSEi(4148, 6) | 0; //@line 2031
  if (___async) {
   label = 27; //@line 2034
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 2037
  $AsyncCtx89 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2038
  _wait(.25); //@line 2039
  if (___async) {
   label = 29; //@line 2042
   break;
  }
  _emscripten_free_async_context($AsyncCtx89 | 0); //@line 2045
  $AsyncCtx31 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2046
  __ZN4mbed6BusOutaSEi(4148, 7) | 0; //@line 2047
  if (___async) {
   label = 31; //@line 2050
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 2053
  $AsyncCtx86 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2054
  _wait(.25); //@line 2055
  if (___async) {
   label = 33; //@line 2058
   break;
  }
  _emscripten_free_async_context($AsyncCtx86 | 0); //@line 2061
  $AsyncCtx27 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2062
  __ZN4mbed6BusOutaSEi(4148, 8) | 0; //@line 2063
  if (___async) {
   label = 35; //@line 2066
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 2069
  $AsyncCtx83 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2070
  _wait(.25); //@line 2071
  if (___async) {
   label = 37; //@line 2074
   break;
  }
  _emscripten_free_async_context($AsyncCtx83 | 0); //@line 2077
  $AsyncCtx23 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2078
  __ZN4mbed6BusOutaSEi(4148, 9) | 0; //@line 2079
  if (___async) {
   label = 39; //@line 2082
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 2085
  $AsyncCtx80 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2086
  _wait(.25); //@line 2087
  if (___async) {
   label = 41; //@line 2090
   break;
  }
  _emscripten_free_async_context($AsyncCtx80 | 0); //@line 2093
  $AsyncCtx19 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2094
  __ZN4mbed6BusOutaSEi(4148, 10) | 0; //@line 2095
  if (___async) {
   label = 43; //@line 2098
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 2101
  $AsyncCtx77 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2102
  _wait(.25); //@line 2103
  if (___async) {
   label = 45; //@line 2106
   break;
  }
  _emscripten_free_async_context($AsyncCtx77 | 0); //@line 2109
  $AsyncCtx15 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2110
  __ZN4mbed6BusOutaSEi(4148, 11) | 0; //@line 2111
  if (___async) {
   label = 47; //@line 2114
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 2117
  $AsyncCtx74 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2118
  _wait(.25); //@line 2119
  if (___async) {
   label = 49; //@line 2122
   break;
  }
  _emscripten_free_async_context($AsyncCtx74 | 0); //@line 2125
  $AsyncCtx11 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2126
  __ZN4mbed6BusOutaSEi(4148, 12) | 0; //@line 2127
  if (___async) {
   label = 51; //@line 2130
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 2133
  $AsyncCtx71 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2134
  _wait(.25); //@line 2135
  if (___async) {
   label = 53; //@line 2138
   break;
  }
  _emscripten_free_async_context($AsyncCtx71 | 0); //@line 2141
  $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2142
  __ZN4mbed6BusOutaSEi(4148, 13) | 0; //@line 2143
  if (___async) {
   label = 55; //@line 2146
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2149
  $AsyncCtx68 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2150
  _wait(.25); //@line 2151
  if (___async) {
   label = 57; //@line 2154
   break;
  }
  _emscripten_free_async_context($AsyncCtx68 | 0); //@line 2157
  $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2158
  __ZN4mbed6BusOutaSEi(4148, 14) | 0; //@line 2159
  if (___async) {
   label = 59; //@line 2162
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2165
  $AsyncCtx65 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2166
  _wait(.25); //@line 2167
  if (___async) {
   label = 61; //@line 2170
   break;
  }
  _emscripten_free_async_context($AsyncCtx65 | 0); //@line 2173
  $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2174
  __ZN4mbed6BusOutaSEi(4148, 15) | 0; //@line 2175
  if (___async) {
   label = 63; //@line 2178
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2181
  $AsyncCtx62 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2182
  _wait(.25); //@line 2183
  if (___async) {
   label = 65; //@line 2186
   break;
  }
  _emscripten_free_async_context($AsyncCtx62 | 0); //@line 2189
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 58; //@line 2193
   sp = STACKTOP; //@line 2194
   return 0; //@line 2195
  }
 case 5:
  {
   HEAP32[$AsyncCtx107 >> 2] = 59; //@line 2199
   sp = STACKTOP; //@line 2200
   return 0; //@line 2201
  }
 case 7:
  {
   HEAP32[$AsyncCtx55 >> 2] = 60; //@line 2205
   sp = STACKTOP; //@line 2206
   return 0; //@line 2207
  }
 case 9:
  {
   HEAP32[$AsyncCtx104 >> 2] = 61; //@line 2211
   sp = STACKTOP; //@line 2212
   return 0; //@line 2213
  }
 case 11:
  {
   HEAP32[$AsyncCtx51 >> 2] = 62; //@line 2217
   sp = STACKTOP; //@line 2218
   return 0; //@line 2219
  }
 case 13:
  {
   HEAP32[$AsyncCtx101 >> 2] = 63; //@line 2223
   sp = STACKTOP; //@line 2224
   return 0; //@line 2225
  }
 case 15:
  {
   HEAP32[$AsyncCtx47 >> 2] = 64; //@line 2229
   sp = STACKTOP; //@line 2230
   return 0; //@line 2231
  }
 case 17:
  {
   HEAP32[$AsyncCtx98 >> 2] = 65; //@line 2235
   sp = STACKTOP; //@line 2236
   return 0; //@line 2237
  }
 case 19:
  {
   HEAP32[$AsyncCtx43 >> 2] = 66; //@line 2241
   sp = STACKTOP; //@line 2242
   return 0; //@line 2243
  }
 case 21:
  {
   HEAP32[$AsyncCtx95 >> 2] = 67; //@line 2247
   sp = STACKTOP; //@line 2248
   return 0; //@line 2249
  }
 case 23:
  {
   HEAP32[$AsyncCtx39 >> 2] = 68; //@line 2253
   sp = STACKTOP; //@line 2254
   return 0; //@line 2255
  }
 case 25:
  {
   HEAP32[$AsyncCtx92 >> 2] = 69; //@line 2259
   sp = STACKTOP; //@line 2260
   return 0; //@line 2261
  }
 case 27:
  {
   HEAP32[$AsyncCtx35 >> 2] = 70; //@line 2265
   sp = STACKTOP; //@line 2266
   return 0; //@line 2267
  }
 case 29:
  {
   HEAP32[$AsyncCtx89 >> 2] = 71; //@line 2271
   sp = STACKTOP; //@line 2272
   return 0; //@line 2273
  }
 case 31:
  {
   HEAP32[$AsyncCtx31 >> 2] = 72; //@line 2277
   sp = STACKTOP; //@line 2278
   return 0; //@line 2279
  }
 case 33:
  {
   HEAP32[$AsyncCtx86 >> 2] = 73; //@line 2283
   sp = STACKTOP; //@line 2284
   return 0; //@line 2285
  }
 case 35:
  {
   HEAP32[$AsyncCtx27 >> 2] = 74; //@line 2289
   sp = STACKTOP; //@line 2290
   return 0; //@line 2291
  }
 case 37:
  {
   HEAP32[$AsyncCtx83 >> 2] = 75; //@line 2295
   sp = STACKTOP; //@line 2296
   return 0; //@line 2297
  }
 case 39:
  {
   HEAP32[$AsyncCtx23 >> 2] = 76; //@line 2301
   sp = STACKTOP; //@line 2302
   return 0; //@line 2303
  }
 case 41:
  {
   HEAP32[$AsyncCtx80 >> 2] = 77; //@line 2307
   sp = STACKTOP; //@line 2308
   return 0; //@line 2309
  }
 case 43:
  {
   HEAP32[$AsyncCtx19 >> 2] = 78; //@line 2313
   sp = STACKTOP; //@line 2314
   return 0; //@line 2315
  }
 case 45:
  {
   HEAP32[$AsyncCtx77 >> 2] = 79; //@line 2319
   sp = STACKTOP; //@line 2320
   return 0; //@line 2321
  }
 case 47:
  {
   HEAP32[$AsyncCtx15 >> 2] = 80; //@line 2325
   sp = STACKTOP; //@line 2326
   return 0; //@line 2327
  }
 case 49:
  {
   HEAP32[$AsyncCtx74 >> 2] = 81; //@line 2331
   sp = STACKTOP; //@line 2332
   return 0; //@line 2333
  }
 case 51:
  {
   HEAP32[$AsyncCtx11 >> 2] = 82; //@line 2337
   sp = STACKTOP; //@line 2338
   return 0; //@line 2339
  }
 case 53:
  {
   HEAP32[$AsyncCtx71 >> 2] = 83; //@line 2343
   sp = STACKTOP; //@line 2344
   return 0; //@line 2345
  }
 case 55:
  {
   HEAP32[$AsyncCtx7 >> 2] = 84; //@line 2349
   sp = STACKTOP; //@line 2350
   return 0; //@line 2351
  }
 case 57:
  {
   HEAP32[$AsyncCtx68 >> 2] = 85; //@line 2355
   sp = STACKTOP; //@line 2356
   return 0; //@line 2357
  }
 case 59:
  {
   HEAP32[$AsyncCtx3 >> 2] = 86; //@line 2361
   sp = STACKTOP; //@line 2362
   return 0; //@line 2363
  }
 case 61:
  {
   HEAP32[$AsyncCtx65 >> 2] = 87; //@line 2367
   sp = STACKTOP; //@line 2368
   return 0; //@line 2369
  }
 case 63:
  {
   HEAP32[$AsyncCtx >> 2] = 88; //@line 2373
   sp = STACKTOP; //@line 2374
   return 0; //@line 2375
  }
 case 65:
  {
   HEAP32[$AsyncCtx62 >> 2] = 89; //@line 2379
   sp = STACKTOP; //@line 2380
   return 0; //@line 2381
  }
 }
 return 0; //@line 2385
}
function _twoway_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0166 = 0, $$0168 = 0, $$0169 = 0, $$0169$be = 0, $$0170 = 0, $$0175$ph$ph$lcssa216 = 0, $$0175$ph$ph$lcssa216328 = 0, $$0175$ph$ph254 = 0, $$0179242 = 0, $$0183$ph197$ph253 = 0, $$0183$ph197248 = 0, $$0183$ph260 = 0, $$0185$ph$lcssa = 0, $$0185$ph$lcssa327 = 0, $$0185$ph259 = 0, $$0187219$ph325326 = 0, $$0187263 = 0, $$1176$$0175 = 0, $$1176$ph$ph$lcssa208 = 0, $$1176$ph$ph233 = 0, $$1180222 = 0, $$1184$ph193$ph232 = 0, $$1184$ph193227 = 0, $$1184$ph239 = 0, $$1186$$0185 = 0, $$1186$ph$lcssa = 0, $$1186$ph238 = 0, $$2181$sink = 0, $$3 = 0, $$3173 = 0, $$3178 = 0, $$3182221 = 0, $$4 = 0, $$pr = 0, $10 = 0, $105 = 0, $111 = 0, $113 = 0, $118 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $14 = 0, $2 = 0, $23 = 0, $25 = 0, $27 = 0, $3 = 0, $32 = 0, $34 = 0, $37 = 0, $4 = 0, $41 = 0, $45 = 0, $50 = 0, $52 = 0, $53 = 0, $56 = 0, $60 = 0, $68 = 0, $70 = 0, $74 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $83 = 0, $86 = 0, $93 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9870
 STACKTOP = STACKTOP + 1056 | 0; //@line 9871
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(1056); //@line 9871
 $2 = sp + 1024 | 0; //@line 9872
 $3 = sp; //@line 9873
 HEAP32[$2 >> 2] = 0; //@line 9874
 HEAP32[$2 + 4 >> 2] = 0; //@line 9874
 HEAP32[$2 + 8 >> 2] = 0; //@line 9874
 HEAP32[$2 + 12 >> 2] = 0; //@line 9874
 HEAP32[$2 + 16 >> 2] = 0; //@line 9874
 HEAP32[$2 + 20 >> 2] = 0; //@line 9874
 HEAP32[$2 + 24 >> 2] = 0; //@line 9874
 HEAP32[$2 + 28 >> 2] = 0; //@line 9874
 $4 = HEAP8[$1 >> 0] | 0; //@line 9875
 L1 : do {
  if (!($4 << 24 >> 24)) {
   $$0175$ph$ph$lcssa216328 = 1; //@line 9879
   $$0185$ph$lcssa327 = -1; //@line 9879
   $$0187219$ph325326 = 0; //@line 9879
   $$1176$ph$ph$lcssa208 = 1; //@line 9879
   $$1186$ph$lcssa = -1; //@line 9879
   label = 26; //@line 9880
  } else {
   $$0187263 = 0; //@line 9882
   $10 = $4; //@line 9882
   do {
    if (!(HEAP8[$0 + $$0187263 >> 0] | 0)) {
     $$3 = 0; //@line 9888
     break L1;
    }
    $14 = $2 + ((($10 & 255) >>> 5 & 255) << 2) | 0; //@line 9896
    HEAP32[$14 >> 2] = HEAP32[$14 >> 2] | 1 << ($10 & 31); //@line 9899
    $$0187263 = $$0187263 + 1 | 0; //@line 9900
    HEAP32[$3 + (($10 & 255) << 2) >> 2] = $$0187263; //@line 9903
    $10 = HEAP8[$1 + $$0187263 >> 0] | 0; //@line 9905
   } while ($10 << 24 >> 24 != 0);
   $23 = $$0187263 >>> 0 > 1; //@line 9913
   if ($23) {
    $$0183$ph260 = 0; //@line 9915
    $$0185$ph259 = -1; //@line 9915
    $130 = 1; //@line 9915
    L6 : while (1) {
     $$0175$ph$ph254 = 1; //@line 9917
     $$0183$ph197$ph253 = $$0183$ph260; //@line 9917
     $131 = $130; //@line 9917
     while (1) {
      $$0183$ph197248 = $$0183$ph197$ph253; //@line 9919
      $132 = $131; //@line 9919
      L10 : while (1) {
       $$0179242 = 1; //@line 9921
       $25 = $132; //@line 9921
       while (1) {
        $32 = HEAP8[$1 + ($$0179242 + $$0185$ph259) >> 0] | 0; //@line 9925
        $34 = HEAP8[$1 + $25 >> 0] | 0; //@line 9927
        if ($32 << 24 >> 24 != $34 << 24 >> 24) {
         break L10;
        }
        if (($$0179242 | 0) == ($$0175$ph$ph254 | 0)) {
         break;
        }
        $$0179242 = $$0179242 + 1 | 0; //@line 9933
        $27 = $$0179242 + $$0183$ph197248 | 0; //@line 9937
        if ($27 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 9942
         $$0185$ph$lcssa = $$0185$ph259; //@line 9942
         break L6;
        } else {
         $25 = $27; //@line 9940
        }
       }
       $37 = $$0175$ph$ph254 + $$0183$ph197248 | 0; //@line 9946
       $132 = $37 + 1 | 0; //@line 9947
       if ($132 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 9952
        $$0185$ph$lcssa = $$0185$ph259; //@line 9952
        break L6;
       } else {
        $$0183$ph197248 = $37; //@line 9950
       }
      }
      $41 = $25 - $$0185$ph259 | 0; //@line 9957
      if (($32 & 255) <= ($34 & 255)) {
       break;
      }
      $131 = $25 + 1 | 0; //@line 9961
      if ($131 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216 = $41; //@line 9966
       $$0185$ph$lcssa = $$0185$ph259; //@line 9966
       break L6;
      } else {
       $$0175$ph$ph254 = $41; //@line 9964
       $$0183$ph197$ph253 = $25; //@line 9964
      }
     }
     $130 = $$0183$ph197248 + 2 | 0; //@line 9971
     if ($130 >>> 0 >= $$0187263 >>> 0) {
      $$0175$ph$ph$lcssa216 = 1; //@line 9976
      $$0185$ph$lcssa = $$0183$ph197248; //@line 9976
      break;
     } else {
      $$0183$ph260 = $$0183$ph197248 + 1 | 0; //@line 9974
      $$0185$ph259 = $$0183$ph197248; //@line 9974
     }
    }
    if ($23) {
     $$1184$ph239 = 0; //@line 9981
     $$1186$ph238 = -1; //@line 9981
     $133 = 1; //@line 9981
     while (1) {
      $$1176$ph$ph233 = 1; //@line 9983
      $$1184$ph193$ph232 = $$1184$ph239; //@line 9983
      $135 = $133; //@line 9983
      while (1) {
       $$1184$ph193227 = $$1184$ph193$ph232; //@line 9985
       $134 = $135; //@line 9985
       L25 : while (1) {
        $$1180222 = 1; //@line 9987
        $52 = $134; //@line 9987
        while (1) {
         $50 = HEAP8[$1 + ($$1180222 + $$1186$ph238) >> 0] | 0; //@line 9991
         $53 = HEAP8[$1 + $52 >> 0] | 0; //@line 9993
         if ($50 << 24 >> 24 != $53 << 24 >> 24) {
          break L25;
         }
         if (($$1180222 | 0) == ($$1176$ph$ph233 | 0)) {
          break;
         }
         $$1180222 = $$1180222 + 1 | 0; //@line 9999
         $45 = $$1180222 + $$1184$ph193227 | 0; //@line 10003
         if ($45 >>> 0 >= $$0187263 >>> 0) {
          $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 10008
          $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 10008
          $$0187219$ph325326 = $$0187263; //@line 10008
          $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 10008
          $$1186$ph$lcssa = $$1186$ph238; //@line 10008
          label = 26; //@line 10009
          break L1;
         } else {
          $52 = $45; //@line 10006
         }
        }
        $56 = $$1176$ph$ph233 + $$1184$ph193227 | 0; //@line 10013
        $134 = $56 + 1 | 0; //@line 10014
        if ($134 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 10019
         $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 10019
         $$0187219$ph325326 = $$0187263; //@line 10019
         $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 10019
         $$1186$ph$lcssa = $$1186$ph238; //@line 10019
         label = 26; //@line 10020
         break L1;
        } else {
         $$1184$ph193227 = $56; //@line 10017
        }
       }
       $60 = $52 - $$1186$ph238 | 0; //@line 10025
       if (($50 & 255) >= ($53 & 255)) {
        break;
       }
       $135 = $52 + 1 | 0; //@line 10029
       if ($135 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 10034
        $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 10034
        $$0187219$ph325326 = $$0187263; //@line 10034
        $$1176$ph$ph$lcssa208 = $60; //@line 10034
        $$1186$ph$lcssa = $$1186$ph238; //@line 10034
        label = 26; //@line 10035
        break L1;
       } else {
        $$1176$ph$ph233 = $60; //@line 10032
        $$1184$ph193$ph232 = $52; //@line 10032
       }
      }
      $133 = $$1184$ph193227 + 2 | 0; //@line 10040
      if ($133 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 10045
       $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 10045
       $$0187219$ph325326 = $$0187263; //@line 10045
       $$1176$ph$ph$lcssa208 = 1; //@line 10045
       $$1186$ph$lcssa = $$1184$ph193227; //@line 10045
       label = 26; //@line 10046
       break;
      } else {
       $$1184$ph239 = $$1184$ph193227 + 1 | 0; //@line 10043
       $$1186$ph238 = $$1184$ph193227; //@line 10043
      }
     }
    } else {
     $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 10051
     $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 10051
     $$0187219$ph325326 = $$0187263; //@line 10051
     $$1176$ph$ph$lcssa208 = 1; //@line 10051
     $$1186$ph$lcssa = -1; //@line 10051
     label = 26; //@line 10052
    }
   } else {
    $$0175$ph$ph$lcssa216328 = 1; //@line 10055
    $$0185$ph$lcssa327 = -1; //@line 10055
    $$0187219$ph325326 = $$0187263; //@line 10055
    $$1176$ph$ph$lcssa208 = 1; //@line 10055
    $$1186$ph$lcssa = -1; //@line 10055
    label = 26; //@line 10056
   }
  }
 } while (0);
 L35 : do {
  if ((label | 0) == 26) {
   $68 = ($$1186$ph$lcssa + 1 | 0) >>> 0 > ($$0185$ph$lcssa327 + 1 | 0) >>> 0; //@line 10064
   $$1176$$0175 = $68 ? $$1176$ph$ph$lcssa208 : $$0175$ph$ph$lcssa216328; //@line 10065
   $$1186$$0185 = $68 ? $$1186$ph$lcssa : $$0185$ph$lcssa327; //@line 10066
   $70 = $$1186$$0185 + 1 | 0; //@line 10068
   if (!(_memcmp($1, $1 + $$1176$$0175 | 0, $70) | 0)) {
    $$0168 = $$0187219$ph325326 - $$1176$$0175 | 0; //@line 10073
    $$3178 = $$1176$$0175; //@line 10073
   } else {
    $74 = $$0187219$ph325326 - $$1186$$0185 + -1 | 0; //@line 10076
    $$0168 = 0; //@line 10080
    $$3178 = ($$1186$$0185 >>> 0 > $74 >>> 0 ? $$1186$$0185 : $74) + 1 | 0; //@line 10080
   }
   $78 = $$0187219$ph325326 | 63; //@line 10082
   $79 = $$0187219$ph325326 + -1 | 0; //@line 10083
   $80 = ($$0168 | 0) != 0; //@line 10084
   $81 = $$0187219$ph325326 - $$3178 | 0; //@line 10085
   $$0166 = $0; //@line 10086
   $$0169 = 0; //@line 10086
   $$0170 = $0; //@line 10086
   while (1) {
    $83 = $$0166; //@line 10089
    do {
     if (($$0170 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
      $86 = _memchr($$0170, 0, $78) | 0; //@line 10094
      if (!$86) {
       $$3173 = $$0170 + $78 | 0; //@line 10098
       break;
      } else {
       if (($86 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
        $$3 = 0; //@line 10105
        break L35;
       } else {
        $$3173 = $86; //@line 10108
        break;
       }
      }
     } else {
      $$3173 = $$0170; //@line 10113
     }
    } while (0);
    $93 = HEAP8[$$0166 + $79 >> 0] | 0; //@line 10117
    L49 : do {
     if (!(1 << ($93 & 31) & HEAP32[$2 + ((($93 & 255) >>> 5 & 255) << 2) >> 2])) {
      $$0169$be = 0; //@line 10129
      $$2181$sink = $$0187219$ph325326; //@line 10129
     } else {
      $105 = $$0187219$ph325326 - (HEAP32[$3 + (($93 & 255) << 2) >> 2] | 0) | 0; //@line 10134
      if ($105 | 0) {
       $$0169$be = 0; //@line 10142
       $$2181$sink = $80 & ($$0169 | 0) != 0 & $105 >>> 0 < $$3178 >>> 0 ? $81 : $105; //@line 10142
       break;
      }
      $111 = $70 >>> 0 > $$0169 >>> 0 ? $70 : $$0169; //@line 10146
      $113 = HEAP8[$1 + $111 >> 0] | 0; //@line 10148
      L54 : do {
       if (!($113 << 24 >> 24)) {
        $$4 = $70; //@line 10152
       } else {
        $$3182221 = $111; //@line 10154
        $$pr = $113; //@line 10154
        while (1) {
         if ($$pr << 24 >> 24 != (HEAP8[$$0166 + $$3182221 >> 0] | 0)) {
          break;
         }
         $118 = $$3182221 + 1 | 0; //@line 10162
         $$pr = HEAP8[$1 + $118 >> 0] | 0; //@line 10164
         if (!($$pr << 24 >> 24)) {
          $$4 = $70; //@line 10167
          break L54;
         } else {
          $$3182221 = $118; //@line 10170
         }
        }
        $$0169$be = 0; //@line 10174
        $$2181$sink = $$3182221 - $$1186$$0185 | 0; //@line 10174
        break L49;
       }
      } while (0);
      while (1) {
       if ($$4 >>> 0 <= $$0169 >>> 0) {
        $$3 = $$0166; //@line 10181
        break L35;
       }
       $$4 = $$4 + -1 | 0; //@line 10184
       if ((HEAP8[$1 + $$4 >> 0] | 0) != (HEAP8[$$0166 + $$4 >> 0] | 0)) {
        $$0169$be = $$0168; //@line 10193
        $$2181$sink = $$3178; //@line 10193
        break;
       }
      }
     }
    } while (0);
    $$0166 = $$0166 + $$2181$sink | 0; //@line 10200
    $$0169 = $$0169$be; //@line 10200
    $$0170 = $$3173; //@line 10200
   }
  }
 } while (0);
 STACKTOP = sp; //@line 10204
 return $$3 | 0; //@line 10204
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11357
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 11363
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 11372
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 11377
      $19 = $1 + 44 | 0; //@line 11378
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 11387
      $26 = $1 + 52 | 0; //@line 11388
      $27 = $1 + 53 | 0; //@line 11389
      $28 = $1 + 54 | 0; //@line 11390
      $29 = $0 + 8 | 0; //@line 11391
      $30 = $1 + 24 | 0; //@line 11392
      $$081$off0 = 0; //@line 11393
      $$084 = $0 + 16 | 0; //@line 11393
      $$085$off0 = 0; //@line 11393
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 11397
        label = 20; //@line 11398
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 11401
       HEAP8[$27 >> 0] = 0; //@line 11402
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 11403
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 11404
       if (___async) {
        label = 12; //@line 11407
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 11410
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 11414
        label = 20; //@line 11415
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 11422
         $$186$off0 = $$085$off0; //@line 11422
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 11431
           label = 20; //@line 11432
           break L10;
          } else {
           $$182$off0 = 1; //@line 11435
           $$186$off0 = $$085$off0; //@line 11435
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 11442
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 11449
          break L10;
         } else {
          $$182$off0 = 1; //@line 11452
          $$186$off0 = 1; //@line 11452
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 11457
       $$084 = $$084 + 8 | 0; //@line 11457
       $$085$off0 = $$186$off0; //@line 11457
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 114; //@line 11460
       HEAP32[$AsyncCtx15 + 4 >> 2] = $26; //@line 11462
       HEAP32[$AsyncCtx15 + 8 >> 2] = $30; //@line 11464
       HEAP32[$AsyncCtx15 + 12 >> 2] = $29; //@line 11466
       HEAP32[$AsyncCtx15 + 16 >> 2] = $28; //@line 11468
       HEAP32[$AsyncCtx15 + 20 >> 2] = $25; //@line 11470
       HEAP32[$AsyncCtx15 + 24 >> 2] = $27; //@line 11472
       HEAP32[$AsyncCtx15 + 28 >> 2] = $1; //@line 11474
       HEAP32[$AsyncCtx15 + 32 >> 2] = $2; //@line 11476
       HEAP8[$AsyncCtx15 + 36 >> 0] = $4 & 1; //@line 11479
       HEAP32[$AsyncCtx15 + 40 >> 2] = $19; //@line 11481
       HEAP8[$AsyncCtx15 + 44 >> 0] = $$081$off0 & 1; //@line 11484
       HEAP8[$AsyncCtx15 + 45 >> 0] = $$085$off0 & 1; //@line 11487
       HEAP32[$AsyncCtx15 + 48 >> 2] = $$084; //@line 11489
       HEAP32[$AsyncCtx15 + 52 >> 2] = $13; //@line 11491
       sp = STACKTOP; //@line 11492
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 11498
         $61 = $1 + 40 | 0; //@line 11499
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 11502
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 11510
           if ($$283$off0) {
            label = 25; //@line 11512
            break;
           } else {
            $69 = 4; //@line 11515
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 11522
        } else {
         $69 = 4; //@line 11524
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 11529
      }
      HEAP32[$19 >> 2] = $69; //@line 11531
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 11540
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 11545
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 11546
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 11547
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 11548
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 115; //@line 11551
    HEAP32[$AsyncCtx11 + 4 >> 2] = $1; //@line 11553
    HEAP32[$AsyncCtx11 + 8 >> 2] = $2; //@line 11555
    HEAP32[$AsyncCtx11 + 12 >> 2] = $3; //@line 11557
    HEAP8[$AsyncCtx11 + 16 >> 0] = $4 & 1; //@line 11560
    HEAP32[$AsyncCtx11 + 20 >> 2] = $73; //@line 11562
    HEAP32[$AsyncCtx11 + 24 >> 2] = $0; //@line 11564
    HEAP32[$AsyncCtx11 + 28 >> 2] = $72; //@line 11566
    sp = STACKTOP; //@line 11567
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 11570
   $81 = $0 + 24 | 0; //@line 11571
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 11575
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 11579
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 11586
       $$2 = $81; //@line 11587
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 11599
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 11600
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 11605
        $136 = $$2 + 8 | 0; //@line 11606
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 11609
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 118; //@line 11614
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 11616
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 11618
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 11620
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 11622
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 11624
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 11626
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 11628
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 11631
       sp = STACKTOP; //@line 11632
       return;
      }
      $104 = $1 + 24 | 0; //@line 11635
      $105 = $1 + 54 | 0; //@line 11636
      $$1 = $81; //@line 11637
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 11653
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 11654
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11659
       $122 = $$1 + 8 | 0; //@line 11660
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 11663
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 117; //@line 11668
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 11670
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 11672
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 11674
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 11676
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 11678
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 11680
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 11682
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 11684
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 11687
      sp = STACKTOP; //@line 11688
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 11692
    $$0 = $81; //@line 11693
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 11700
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 11701
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 11706
     $100 = $$0 + 8 | 0; //@line 11707
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 11710
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 116; //@line 11715
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 11717
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 11719
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 11721
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 11723
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 11725
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 11727
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 11730
    sp = STACKTOP; //@line 11731
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
 $n_sroa_0_0_extract_trunc = $a$0; //@line 1871
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 1872
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 1873
 $d_sroa_0_0_extract_trunc = $b$0; //@line 1874
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 1875
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 1876
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 1878
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 1881
    HEAP32[$rem + 4 >> 2] = 0; //@line 1882
   }
   $_0$1 = 0; //@line 1884
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 1885
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1886
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 1889
    $_0$0 = 0; //@line 1890
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1891
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 1893
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 1894
   $_0$1 = 0; //@line 1895
   $_0$0 = 0; //@line 1896
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1897
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 1900
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 1905
     HEAP32[$rem + 4 >> 2] = 0; //@line 1906
    }
    $_0$1 = 0; //@line 1908
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 1909
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1910
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 1914
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 1915
    }
    $_0$1 = 0; //@line 1917
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 1918
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1919
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 1921
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 1924
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 1925
    }
    $_0$1 = 0; //@line 1927
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 1928
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1929
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 1932
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 1934
    $58 = 31 - $51 | 0; //@line 1935
    $sr_1_ph = $57; //@line 1936
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 1937
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 1938
    $q_sroa_0_1_ph = 0; //@line 1939
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 1940
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 1944
    $_0$0 = 0; //@line 1945
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1946
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 1948
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 1949
   $_0$1 = 0; //@line 1950
   $_0$0 = 0; //@line 1951
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1952
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 1956
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 1958
     $126 = 31 - $119 | 0; //@line 1959
     $130 = $119 - 31 >> 31; //@line 1960
     $sr_1_ph = $125; //@line 1961
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 1962
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 1963
     $q_sroa_0_1_ph = 0; //@line 1964
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 1965
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 1969
     $_0$0 = 0; //@line 1970
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1971
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 1973
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 1974
    $_0$1 = 0; //@line 1975
    $_0$0 = 0; //@line 1976
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1977
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 1979
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 1982
    $89 = 64 - $88 | 0; //@line 1983
    $91 = 32 - $88 | 0; //@line 1984
    $92 = $91 >> 31; //@line 1985
    $95 = $88 - 32 | 0; //@line 1986
    $105 = $95 >> 31; //@line 1987
    $sr_1_ph = $88; //@line 1988
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 1989
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 1990
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 1991
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 1992
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 1996
    HEAP32[$rem + 4 >> 2] = 0; //@line 1997
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 2000
    $_0$0 = $a$0 | 0 | 0; //@line 2001
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 2002
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 2004
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 2005
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 2006
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 2007
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 2012
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 2013
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 2014
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 2015
  $carry_0_lcssa$1 = 0; //@line 2016
  $carry_0_lcssa$0 = 0; //@line 2017
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 2019
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 2020
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 2021
  $137$1 = tempRet0; //@line 2022
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 2023
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 2024
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 2025
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 2026
  $sr_1202 = $sr_1_ph; //@line 2027
  $carry_0203 = 0; //@line 2028
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 2030
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 2031
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 2032
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 2033
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 2034
   $150$1 = tempRet0; //@line 2035
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 2036
   $carry_0203 = $151$0 & 1; //@line 2037
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 2039
   $r_sroa_1_1200 = tempRet0; //@line 2040
   $sr_1202 = $sr_1202 - 1 | 0; //@line 2041
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 2053
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 2054
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 2055
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 2056
  $carry_0_lcssa$1 = 0; //@line 2057
  $carry_0_lcssa$0 = $carry_0203; //@line 2058
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 2060
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 2061
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 2064
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 2065
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 2067
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 2068
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 2069
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1327
 STACKTOP = STACKTOP + 32 | 0; //@line 1328
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 1328
 $0 = sp; //@line 1329
 _gpio_init_out($0, 50); //@line 1330
 while (1) {
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1333
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1334
  _wait_ms(150); //@line 1335
  if (___async) {
   label = 3; //@line 1338
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 1341
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1343
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1344
  _wait_ms(150); //@line 1345
  if (___async) {
   label = 5; //@line 1348
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 1351
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1353
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1354
  _wait_ms(150); //@line 1355
  if (___async) {
   label = 7; //@line 1358
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 1361
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1363
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1364
  _wait_ms(150); //@line 1365
  if (___async) {
   label = 9; //@line 1368
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 1371
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1373
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1374
  _wait_ms(150); //@line 1375
  if (___async) {
   label = 11; //@line 1378
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 1381
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1383
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1384
  _wait_ms(150); //@line 1385
  if (___async) {
   label = 13; //@line 1388
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 1391
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1393
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1394
  _wait_ms(150); //@line 1395
  if (___async) {
   label = 15; //@line 1398
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 1401
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1403
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1404
  _wait_ms(150); //@line 1405
  if (___async) {
   label = 17; //@line 1408
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 1411
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1413
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1414
  _wait_ms(400); //@line 1415
  if (___async) {
   label = 19; //@line 1418
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 1421
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1423
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1424
  _wait_ms(400); //@line 1425
  if (___async) {
   label = 21; //@line 1428
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 1431
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1433
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1434
  _wait_ms(400); //@line 1435
  if (___async) {
   label = 23; //@line 1438
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 1441
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1443
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1444
  _wait_ms(400); //@line 1445
  if (___async) {
   label = 25; //@line 1448
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1451
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1453
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1454
  _wait_ms(400); //@line 1455
  if (___async) {
   label = 27; //@line 1458
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1461
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1463
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1464
  _wait_ms(400); //@line 1465
  if (___async) {
   label = 29; //@line 1468
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1471
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1473
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1474
  _wait_ms(400); //@line 1475
  if (___async) {
   label = 31; //@line 1478
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1481
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1483
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1484
  _wait_ms(400); //@line 1485
  if (___async) {
   label = 33; //@line 1488
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1491
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 31; //@line 1495
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 1497
   sp = STACKTOP; //@line 1498
   STACKTOP = sp; //@line 1499
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 32; //@line 1503
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 1505
   sp = STACKTOP; //@line 1506
   STACKTOP = sp; //@line 1507
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 33; //@line 1511
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 1513
   sp = STACKTOP; //@line 1514
   STACKTOP = sp; //@line 1515
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 34; //@line 1519
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 1521
   sp = STACKTOP; //@line 1522
   STACKTOP = sp; //@line 1523
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 35; //@line 1527
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 1529
   sp = STACKTOP; //@line 1530
   STACKTOP = sp; //@line 1531
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 36; //@line 1535
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 1537
   sp = STACKTOP; //@line 1538
   STACKTOP = sp; //@line 1539
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 37; //@line 1543
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 1545
   sp = STACKTOP; //@line 1546
   STACKTOP = sp; //@line 1547
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 38; //@line 1551
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 1553
   sp = STACKTOP; //@line 1554
   STACKTOP = sp; //@line 1555
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 39; //@line 1559
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 1561
   sp = STACKTOP; //@line 1562
   STACKTOP = sp; //@line 1563
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 40; //@line 1567
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 1569
   sp = STACKTOP; //@line 1570
   STACKTOP = sp; //@line 1571
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 41; //@line 1575
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 1577
   sp = STACKTOP; //@line 1578
   STACKTOP = sp; //@line 1579
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 42; //@line 1583
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 1585
   sp = STACKTOP; //@line 1586
   STACKTOP = sp; //@line 1587
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 43; //@line 1591
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 1593
   sp = STACKTOP; //@line 1594
   STACKTOP = sp; //@line 1595
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 44; //@line 1599
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 1601
   sp = STACKTOP; //@line 1602
   STACKTOP = sp; //@line 1603
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 45; //@line 1607
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1609
   sp = STACKTOP; //@line 1610
   STACKTOP = sp; //@line 1611
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 46; //@line 1615
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1617
   sp = STACKTOP; //@line 1618
   STACKTOP = sp; //@line 1619
   return;
  }
 }
}
function _mbed_vtracef__async_cb_7($0) {
 $0 = $0 | 0;
 var $$10 = 0, $$3147168 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $10 = 0, $14 = 0, $18 = 0, $2 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $4 = 0, $40 = 0, $44 = 0, $50 = 0, $53 = 0, $54 = 0, $56 = 0, $6 = 0, $67 = 0, $68 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12779
 $2 = HEAP8[$0 + 4 >> 0] & 1; //@line 12782
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12784
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12786
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12788
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12790
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12794
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 12798
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 12802
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 12804
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 12806
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 12808
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 12810
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 12812
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 12814
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 12816
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 12820
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 12824
 HEAP32[$44 >> 2] = HEAP32[___async_retval >> 2]; //@line 12831
 $50 = _snprintf($22, $24, 1186, $44) | 0; //@line 12832
 $$10 = ($50 | 0) >= ($24 | 0) ? 0 : $50; //@line 12834
 $53 = $22 + $$10 | 0; //@line 12836
 $54 = $24 - $$10 | 0; //@line 12837
 if (($$10 | 0) > 0) {
  if (($54 | 0) > 0) {
   $$3147168 = $54; //@line 12841
   $$3169 = $53; //@line 12841
   label = 4; //@line 12842
  }
 } else {
  $$3147168 = $24; //@line 12845
  $$3169 = $22; //@line 12845
  label = 4; //@line 12846
 }
 if ((label | 0) == 4) {
  $56 = $26 + -2 | 0; //@line 12849
  switch ($56 >>> 1 | $56 << 31 | 0) {
  case 0:
   {
    HEAP32[$18 >> 2] = $10; //@line 12855
    $$5156 = _snprintf($$3169, $$3147168, 1189, $18) | 0; //@line 12857
    break;
   }
  case 1:
   {
    HEAP32[$14 >> 2] = $10; //@line 12861
    $$5156 = _snprintf($$3169, $$3147168, 1204, $14) | 0; //@line 12863
    break;
   }
  case 3:
   {
    HEAP32[$8 >> 2] = $10; //@line 12867
    $$5156 = _snprintf($$3169, $$3147168, 1219, $8) | 0; //@line 12869
    break;
   }
  case 7:
   {
    HEAP32[$40 >> 2] = $10; //@line 12873
    $$5156 = _snprintf($$3169, $$3147168, 1234, $40) | 0; //@line 12875
    break;
   }
  default:
   {
    $$5156 = _snprintf($$3169, $$3147168, 1249, $36) | 0; //@line 12880
   }
  }
  $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 12884
  $67 = $$3169 + $$5156$ | 0; //@line 12886
  $68 = $$3147168 - $$5156$ | 0; //@line 12887
  if (($$5156$ | 0) > 0 & ($68 | 0) > 0) {
   $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 12891
   $70 = _vsnprintf($67, $68, $32, $34) | 0; //@line 12892
   if (___async) {
    HEAP32[$ReallocAsyncCtx10 >> 2] = 25; //@line 12895
    $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 12896
    HEAP32[$71 >> 2] = $28; //@line 12897
    $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 12898
    HEAP32[$72 >> 2] = $30; //@line 12899
    $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 12900
    $$expand_i1_val = $2 & 1; //@line 12901
    HEAP8[$73 >> 0] = $$expand_i1_val; //@line 12902
    $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 12903
    HEAP32[$74 >> 2] = $4; //@line 12904
    $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 12905
    HEAP32[$75 >> 2] = $6; //@line 12906
    $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 12907
    HEAP32[$76 >> 2] = $68; //@line 12908
    $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 12909
    HEAP32[$77 >> 2] = $67; //@line 12910
    sp = STACKTOP; //@line 12911
    return;
   }
   HEAP32[___async_retval >> 2] = $70; //@line 12915
   ___async_unwind = 0; //@line 12916
   HEAP32[$ReallocAsyncCtx10 >> 2] = 25; //@line 12917
   $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 12918
   HEAP32[$71 >> 2] = $28; //@line 12919
   $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 12920
   HEAP32[$72 >> 2] = $30; //@line 12921
   $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 12922
   $$expand_i1_val = $2 & 1; //@line 12923
   HEAP8[$73 >> 0] = $$expand_i1_val; //@line 12924
   $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 12925
   HEAP32[$74 >> 2] = $4; //@line 12926
   $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 12927
   HEAP32[$75 >> 2] = $6; //@line 12928
   $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 12929
   HEAP32[$76 >> 2] = $68; //@line 12930
   $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 12931
   HEAP32[$77 >> 2] = $67; //@line 12932
   sp = STACKTOP; //@line 12933
   return;
  }
 }
 $79 = HEAP32[53] | 0; //@line 12937
 $80 = HEAP32[46] | 0; //@line 12938
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 12939
 FUNCTION_TABLE_vi[$79 & 127]($80); //@line 12940
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 27; //@line 12943
  sp = STACKTOP; //@line 12944
  return;
 }
 ___async_unwind = 0; //@line 12947
 HEAP32[$ReallocAsyncCtx7 >> 2] = 27; //@line 12948
 sp = STACKTOP; //@line 12949
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_67($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 723
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 725
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 727
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 729
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 731
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 733
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 735
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 737
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 739
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 742
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 744
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 747
 $24 = HEAP8[$0 + 45 >> 0] & 1; //@line 750
 $26 = HEAP32[$0 + 48 >> 2] | 0; //@line 752
 $28 = HEAP32[$0 + 52 >> 2] | 0; //@line 754
 L2 : do {
  if (!(HEAP8[$8 >> 0] | 0)) {
   do {
    if (!(HEAP8[$12 >> 0] | 0)) {
     $$182$off0 = $22; //@line 763
     $$186$off0 = $24; //@line 763
    } else {
     if (!(HEAP8[$2 >> 0] | 0)) {
      if (!(HEAP32[$6 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $24; //@line 772
       $$283$off0 = 1; //@line 772
       label = 13; //@line 773
       break L2;
      } else {
       $$182$off0 = 1; //@line 776
       $$186$off0 = $24; //@line 776
       break;
      }
     }
     if ((HEAP32[$4 >> 2] | 0) == 1) {
      label = 18; //@line 783
      break L2;
     }
     if (!(HEAP32[$6 >> 2] & 2)) {
      label = 18; //@line 790
      break L2;
     } else {
      $$182$off0 = 1; //@line 793
      $$186$off0 = 1; //@line 793
     }
    }
   } while (0);
   $30 = $26 + 8 | 0; //@line 797
   if ($30 >>> 0 < $10 >>> 0) {
    HEAP8[$2 >> 0] = 0; //@line 800
    HEAP8[$12 >> 0] = 0; //@line 801
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 802
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $14, $16, $16, 1, $18); //@line 803
    if (!___async) {
     ___async_unwind = 0; //@line 806
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 114; //@line 808
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 810
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 812
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 814
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 816
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 818
    HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $12; //@line 820
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 822
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $16; //@line 824
    HEAP8[$ReallocAsyncCtx5 + 36 >> 0] = $18 & 1; //@line 827
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $20; //@line 829
    HEAP8[$ReallocAsyncCtx5 + 44 >> 0] = $$182$off0 & 1; //@line 832
    HEAP8[$ReallocAsyncCtx5 + 45 >> 0] = $$186$off0 & 1; //@line 835
    HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $30; //@line 837
    HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $28; //@line 839
    sp = STACKTOP; //@line 840
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 843
    $$283$off0 = $$182$off0; //@line 843
    label = 13; //@line 844
   }
  } else {
   $$085$off0$reg2mem$0 = $24; //@line 847
   $$283$off0 = $22; //@line 847
   label = 13; //@line 848
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$28 >> 2] = $16; //@line 854
    $59 = $14 + 40 | 0; //@line 855
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 858
    if ((HEAP32[$14 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$4 >> 2] | 0) == 2) {
      HEAP8[$8 >> 0] = 1; //@line 866
      if ($$283$off0) {
       label = 18; //@line 868
       break;
      } else {
       $67 = 4; //@line 871
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 878
   } else {
    $67 = 4; //@line 880
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 885
 }
 HEAP32[$20 >> 2] = $67; //@line 887
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
 sp = STACKTOP; //@line 11195
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 11200
 } else {
  $9 = $1 + 52 | 0; //@line 11202
  $10 = HEAP8[$9 >> 0] | 0; //@line 11203
  $11 = $1 + 53 | 0; //@line 11204
  $12 = HEAP8[$11 >> 0] | 0; //@line 11205
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 11208
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 11209
  HEAP8[$9 >> 0] = 0; //@line 11210
  HEAP8[$11 >> 0] = 0; //@line 11211
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 11212
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 11213
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 112; //@line 11216
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 11218
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 11220
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 11222
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 11224
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 11226
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 11228
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 11230
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 11232
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 11234
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 11236
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 11239
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 11241
   sp = STACKTOP; //@line 11242
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11245
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 11250
    $32 = $0 + 8 | 0; //@line 11251
    $33 = $1 + 54 | 0; //@line 11252
    $$0 = $0 + 24 | 0; //@line 11253
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
     HEAP8[$9 >> 0] = 0; //@line 11286
     HEAP8[$11 >> 0] = 0; //@line 11287
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 11288
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 11289
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 11294
     $62 = $$0 + 8 | 0; //@line 11295
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 11298
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 113; //@line 11303
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 11305
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 11307
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 11309
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 11311
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 11313
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 11315
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 11317
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 11319
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 11321
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 11323
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 11325
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 11327
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 11329
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 11332
    sp = STACKTOP; //@line 11333
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 11337
  HEAP8[$11 >> 0] = $12; //@line 11338
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7971
      $10 = HEAP32[$9 >> 2] | 0; //@line 7972
      HEAP32[$2 >> 2] = $9 + 4; //@line 7974
      HEAP32[$0 >> 2] = $10; //@line 7975
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7991
      $17 = HEAP32[$16 >> 2] | 0; //@line 7992
      HEAP32[$2 >> 2] = $16 + 4; //@line 7994
      $20 = $0; //@line 7997
      HEAP32[$20 >> 2] = $17; //@line 7999
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 8002
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8018
      $30 = HEAP32[$29 >> 2] | 0; //@line 8019
      HEAP32[$2 >> 2] = $29 + 4; //@line 8021
      $31 = $0; //@line 8022
      HEAP32[$31 >> 2] = $30; //@line 8024
      HEAP32[$31 + 4 >> 2] = 0; //@line 8027
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 8043
      $41 = $40; //@line 8044
      $43 = HEAP32[$41 >> 2] | 0; //@line 8046
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 8049
      HEAP32[$2 >> 2] = $40 + 8; //@line 8051
      $47 = $0; //@line 8052
      HEAP32[$47 >> 2] = $43; //@line 8054
      HEAP32[$47 + 4 >> 2] = $46; //@line 8057
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8073
      $57 = HEAP32[$56 >> 2] | 0; //@line 8074
      HEAP32[$2 >> 2] = $56 + 4; //@line 8076
      $59 = ($57 & 65535) << 16 >> 16; //@line 8078
      $62 = $0; //@line 8081
      HEAP32[$62 >> 2] = $59; //@line 8083
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 8086
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8102
      $72 = HEAP32[$71 >> 2] | 0; //@line 8103
      HEAP32[$2 >> 2] = $71 + 4; //@line 8105
      $73 = $0; //@line 8107
      HEAP32[$73 >> 2] = $72 & 65535; //@line 8109
      HEAP32[$73 + 4 >> 2] = 0; //@line 8112
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8128
      $83 = HEAP32[$82 >> 2] | 0; //@line 8129
      HEAP32[$2 >> 2] = $82 + 4; //@line 8131
      $85 = ($83 & 255) << 24 >> 24; //@line 8133
      $88 = $0; //@line 8136
      HEAP32[$88 >> 2] = $85; //@line 8138
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 8141
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8157
      $98 = HEAP32[$97 >> 2] | 0; //@line 8158
      HEAP32[$2 >> 2] = $97 + 4; //@line 8160
      $99 = $0; //@line 8162
      HEAP32[$99 >> 2] = $98 & 255; //@line 8164
      HEAP32[$99 + 4 >> 2] = 0; //@line 8167
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 8183
      $109 = +HEAPF64[$108 >> 3]; //@line 8184
      HEAP32[$2 >> 2] = $108 + 8; //@line 8186
      HEAPF64[$0 >> 3] = $109; //@line 8187
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 8203
      $116 = +HEAPF64[$115 >> 3]; //@line 8204
      HEAP32[$2 >> 2] = $115 + 8; //@line 8206
      HEAPF64[$0 >> 3] = $116; //@line 8207
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
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_66($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 567
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 569
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 571
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 573
 $8 = HEAP8[$0 + 16 >> 0] & 1; //@line 576
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 578
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 580
 $15 = $12 + 24 | 0; //@line 583
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$12 + 8 >> 2] | 0; //@line 588
   if (!($18 & 2)) {
    $21 = $2 + 36 | 0; //@line 592
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $2 + 54 | 0; //@line 599
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 610
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 611
      if (!___async) {
       ___async_unwind = 0; //@line 614
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 118; //@line 616
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 618
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $10; //@line 620
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 622
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 624
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $2; //@line 626
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $4; //@line 628
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $6; //@line 630
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $8 & 1; //@line 633
      sp = STACKTOP; //@line 634
      return;
     }
     $36 = $2 + 24 | 0; //@line 637
     $37 = $2 + 54 | 0; //@line 638
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 653
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 654
     if (!___async) {
      ___async_unwind = 0; //@line 657
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 117; //@line 659
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 661
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $10; //@line 663
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 665
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 667
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 669
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $2; //@line 671
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $4; //@line 673
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $6; //@line 675
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $8 & 1; //@line 678
     sp = STACKTOP; //@line 679
     return;
    }
   }
   $24 = $2 + 54 | 0; //@line 683
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 687
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 688
    if (!___async) {
     ___async_unwind = 0; //@line 691
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 116; //@line 693
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 695
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $10; //@line 697
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 699
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $2; //@line 701
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $4; //@line 703
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $6; //@line 705
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $8 & 1; //@line 708
    sp = STACKTOP; //@line 709
    return;
   }
  }
 } while (0);
 return;
}
function _vfprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $$0 = 0, $$1 = 0, $13 = 0, $14 = 0, $19 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $28 = 0, $29 = 0, $3 = 0, $32 = 0, $4 = 0, $43 = 0, $5 = 0, $51 = 0, $6 = 0, $AsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 6871
 STACKTOP = STACKTOP + 224 | 0; //@line 6872
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 6872
 $3 = sp + 120 | 0; //@line 6873
 $4 = sp + 80 | 0; //@line 6874
 $5 = sp; //@line 6875
 $6 = sp + 136 | 0; //@line 6876
 dest = $4; //@line 6877
 stop = dest + 40 | 0; //@line 6877
 do {
  HEAP32[dest >> 2] = 0; //@line 6877
  dest = dest + 4 | 0; //@line 6877
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 6879
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 6883
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 6890
  } else {
   $43 = 0; //@line 6892
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 6894
  $14 = $13 & 32; //@line 6895
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 6901
  }
  $19 = $0 + 48 | 0; //@line 6903
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 6908
    $24 = HEAP32[$23 >> 2] | 0; //@line 6909
    HEAP32[$23 >> 2] = $6; //@line 6910
    $25 = $0 + 28 | 0; //@line 6911
    HEAP32[$25 >> 2] = $6; //@line 6912
    $26 = $0 + 20 | 0; //@line 6913
    HEAP32[$26 >> 2] = $6; //@line 6914
    HEAP32[$19 >> 2] = 80; //@line 6915
    $28 = $0 + 16 | 0; //@line 6917
    HEAP32[$28 >> 2] = $6 + 80; //@line 6918
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6919
    if (!$24) {
     $$1 = $29; //@line 6922
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 6925
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 6926
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 6927
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 99; //@line 6930
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 6932
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 6934
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 6936
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 6938
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 6940
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 6942
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 6944
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 6946
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 6948
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 6950
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 6952
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 6954
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 6956
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 6958
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 6960
      sp = STACKTOP; //@line 6961
      STACKTOP = sp; //@line 6962
      return 0; //@line 6962
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 6964
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 6967
      HEAP32[$23 >> 2] = $24; //@line 6968
      HEAP32[$19 >> 2] = 0; //@line 6969
      HEAP32[$28 >> 2] = 0; //@line 6970
      HEAP32[$25 >> 2] = 0; //@line 6971
      HEAP32[$26 >> 2] = 0; //@line 6972
      $$1 = $$; //@line 6973
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6979
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 6982
  HEAP32[$0 >> 2] = $51 | $14; //@line 6987
  if ($43 | 0) {
   ___unlockfile($0); //@line 6990
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 6992
 }
 STACKTOP = sp; //@line 6994
 return $$0 | 0; //@line 6994
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 10828
 STACKTOP = STACKTOP + 64 | 0; //@line 10829
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 10829
 $4 = sp; //@line 10830
 $5 = HEAP32[$0 >> 2] | 0; //@line 10831
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 10834
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 10836
 HEAP32[$4 >> 2] = $2; //@line 10837
 HEAP32[$4 + 4 >> 2] = $0; //@line 10839
 HEAP32[$4 + 8 >> 2] = $1; //@line 10841
 HEAP32[$4 + 12 >> 2] = $3; //@line 10843
 $14 = $4 + 16 | 0; //@line 10844
 $15 = $4 + 20 | 0; //@line 10845
 $16 = $4 + 24 | 0; //@line 10846
 $17 = $4 + 28 | 0; //@line 10847
 $18 = $4 + 32 | 0; //@line 10848
 $19 = $4 + 40 | 0; //@line 10849
 dest = $14; //@line 10850
 stop = dest + 36 | 0; //@line 10850
 do {
  HEAP32[dest >> 2] = 0; //@line 10850
  dest = dest + 4 | 0; //@line 10850
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 10850
 HEAP8[$14 + 38 >> 0] = 0; //@line 10850
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 10855
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10858
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10859
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 10860
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 106; //@line 10863
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 10865
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 10867
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 10869
    sp = STACKTOP; //@line 10870
    STACKTOP = sp; //@line 10871
    return 0; //@line 10871
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10873
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 10877
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 10881
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 10884
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 10885
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 10886
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 107; //@line 10889
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 10891
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 10893
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 10895
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 10897
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 10899
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 10901
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 10903
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 10905
    sp = STACKTOP; //@line 10906
    STACKTOP = sp; //@line 10907
    return 0; //@line 10907
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10909
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 10923
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 10931
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 10947
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 10952
  }
 } while (0);
 STACKTOP = sp; //@line 10955
 return $$0 | 0; //@line 10955
}
function __ZN4mbed6BusOut5writeEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $105 = 0, $14 = 0, $20 = 0, $26 = 0, $32 = 0, $38 = 0, $4 = 0, $44 = 0, $50 = 0, $56 = 0, $62 = 0, $68 = 0, $74 = 0, $80 = 0, $86 = 0, $9 = 0, $92 = 0, $98 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 383
 $4 = HEAP32[(HEAP32[$0 >> 2] | 0) + 8 >> 2] | 0; //@line 386
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 387
 FUNCTION_TABLE_vi[$4 & 127]($0); //@line 388
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 13; //@line 391
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 393
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 395
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 397
  sp = STACKTOP; //@line 398
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 401
 $9 = HEAP32[$0 + 4 >> 2] | 0; //@line 403
 if ($9 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$9 >> 2] | 0, $1 & 1 | 0) | 0; //@line 408
 }
 $14 = HEAP32[$0 + 8 >> 2] | 0; //@line 411
 if ($14 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$14 >> 2] | 0, $1 >>> 1 & 1 | 0) | 0; //@line 417
 }
 $20 = HEAP32[$0 + 12 >> 2] | 0; //@line 420
 if ($20 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$20 >> 2] | 0, $1 >>> 2 & 1 | 0) | 0; //@line 426
 }
 $26 = HEAP32[$0 + 16 >> 2] | 0; //@line 429
 if ($26 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$26 >> 2] | 0, $1 >>> 3 & 1 | 0) | 0; //@line 435
 }
 $32 = HEAP32[$0 + 20 >> 2] | 0; //@line 438
 if ($32 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$32 >> 2] | 0, $1 >>> 4 & 1 | 0) | 0; //@line 444
 }
 $38 = HEAP32[$0 + 24 >> 2] | 0; //@line 447
 if ($38 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$38 >> 2] | 0, $1 >>> 5 & 1 | 0) | 0; //@line 453
 }
 $44 = HEAP32[$0 + 28 >> 2] | 0; //@line 456
 if ($44 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$44 >> 2] | 0, $1 >>> 6 & 1 | 0) | 0; //@line 462
 }
 $50 = HEAP32[$0 + 32 >> 2] | 0; //@line 465
 if ($50 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$50 >> 2] | 0, $1 >>> 7 & 1 | 0) | 0; //@line 471
 }
 $56 = HEAP32[$0 + 36 >> 2] | 0; //@line 474
 if ($56 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$56 >> 2] | 0, $1 >>> 8 & 1 | 0) | 0; //@line 480
 }
 $62 = HEAP32[$0 + 40 >> 2] | 0; //@line 483
 if ($62 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$62 >> 2] | 0, $1 >>> 9 & 1 | 0) | 0; //@line 489
 }
 $68 = HEAP32[$0 + 44 >> 2] | 0; //@line 492
 if ($68 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$68 >> 2] | 0, $1 >>> 10 & 1 | 0) | 0; //@line 498
 }
 $74 = HEAP32[$0 + 48 >> 2] | 0; //@line 501
 if ($74 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$74 >> 2] | 0, $1 >>> 11 & 1 | 0) | 0; //@line 507
 }
 $80 = HEAP32[$0 + 52 >> 2] | 0; //@line 510
 if ($80 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$80 >> 2] | 0, $1 >>> 12 & 1 | 0) | 0; //@line 516
 }
 $86 = HEAP32[$0 + 56 >> 2] | 0; //@line 519
 if ($86 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$86 >> 2] | 0, $1 >>> 13 & 1 | 0) | 0; //@line 525
 }
 $92 = HEAP32[$0 + 60 >> 2] | 0; //@line 528
 if ($92 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$92 >> 2] | 0, $1 >>> 14 & 1 | 0) | 0; //@line 534
 }
 $98 = HEAP32[$0 + 64 >> 2] | 0; //@line 537
 if ($98 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$98 >> 2] | 0, $1 >>> 15 & 1 | 0) | 0; //@line 543
 }
 $105 = HEAP32[(HEAP32[$0 >> 2] | 0) + 12 >> 2] | 0; //@line 547
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 548
 FUNCTION_TABLE_vi[$105 & 127]($0); //@line 549
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 14; //@line 552
  sp = STACKTOP; //@line 553
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 556
  return;
 }
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 6743
 $7 = ($2 | 0) != 0; //@line 6747
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 6751
   $$03555 = $0; //@line 6752
   $$03654 = $2; //@line 6752
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 6757
     $$036$lcssa64 = $$03654; //@line 6757
     label = 6; //@line 6758
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 6761
    $12 = $$03654 + -1 | 0; //@line 6762
    $16 = ($12 | 0) != 0; //@line 6766
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 6769
     $$03654 = $12; //@line 6769
    } else {
     $$035$lcssa = $11; //@line 6771
     $$036$lcssa = $12; //@line 6771
     $$lcssa = $16; //@line 6771
     label = 5; //@line 6772
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 6777
   $$036$lcssa = $2; //@line 6777
   $$lcssa = $7; //@line 6777
   label = 5; //@line 6778
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 6783
   $$036$lcssa64 = $$036$lcssa; //@line 6783
   label = 6; //@line 6784
  } else {
   $$2 = $$035$lcssa; //@line 6786
   $$3 = 0; //@line 6786
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 6792
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 6795
    $$3 = $$036$lcssa64; //@line 6795
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 6797
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 6801
      $$13745 = $$036$lcssa64; //@line 6801
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 6804
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 6813
       $30 = $$13745 + -4 | 0; //@line 6814
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 6817
        $$13745 = $30; //@line 6817
       } else {
        $$0$lcssa = $29; //@line 6819
        $$137$lcssa = $30; //@line 6819
        label = 11; //@line 6820
        break L11;
       }
      }
      $$140 = $$046; //@line 6824
      $$23839 = $$13745; //@line 6824
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 6826
      $$137$lcssa = $$036$lcssa64; //@line 6826
      label = 11; //@line 6827
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 6833
      $$3 = 0; //@line 6833
      break;
     } else {
      $$140 = $$0$lcssa; //@line 6836
      $$23839 = $$137$lcssa; //@line 6836
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 6843
      $$3 = $$23839; //@line 6843
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 6846
     $$23839 = $$23839 + -1 | 0; //@line 6847
     if (!$$23839) {
      $$2 = $35; //@line 6850
      $$3 = 0; //@line 6850
      break;
     } else {
      $$140 = $35; //@line 6853
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 6861
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 6514
 do {
  if (!$0) {
   do {
    if (!(HEAP32[90] | 0)) {
     $34 = 0; //@line 6522
    } else {
     $12 = HEAP32[90] | 0; //@line 6524
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 6525
     $13 = _fflush($12) | 0; //@line 6526
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 95; //@line 6529
      sp = STACKTOP; //@line 6530
      return 0; //@line 6531
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 6533
      $34 = $13; //@line 6534
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 6540
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 6544
    } else {
     $$02327 = $$02325; //@line 6546
     $$02426 = $34; //@line 6546
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 6553
      } else {
       $28 = 0; //@line 6555
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 6563
       $25 = ___fflush_unlocked($$02327) | 0; //@line 6564
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 6569
       $$1 = $25 | $$02426; //@line 6571
      } else {
       $$1 = $$02426; //@line 6573
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 6577
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 6580
      if (!$$023) {
       $$024$lcssa = $$1; //@line 6583
       break L9;
      } else {
       $$02327 = $$023; //@line 6586
       $$02426 = $$1; //@line 6586
      }
     }
     HEAP32[$AsyncCtx >> 2] = 96; //@line 6589
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 6591
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 6593
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 6595
     sp = STACKTOP; //@line 6596
     return 0; //@line 6597
    }
   } while (0);
   ___ofl_unlock(); //@line 6600
   $$0 = $$024$lcssa; //@line 6601
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 6607
    $5 = ___fflush_unlocked($0) | 0; //@line 6608
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 93; //@line 6611
     sp = STACKTOP; //@line 6612
     return 0; //@line 6613
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 6615
     $$0 = $5; //@line 6616
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 6621
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 6622
   $7 = ___fflush_unlocked($0) | 0; //@line 6623
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 94; //@line 6626
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 6629
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 6631
    sp = STACKTOP; //@line 6632
    return 0; //@line 6633
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6635
   if ($phitmp) {
    $$0 = $7; //@line 6637
   } else {
    ___unlockfile($0); //@line 6639
    $$0 = $7; //@line 6640
   }
  }
 } while (0);
 return $$0 | 0; //@line 6644
}
function _mbed_vtracef__async_cb_12($0) {
 $0 = $0 | 0;
 var $$13 = 0, $$expand_i1_val = 0, $10 = 0, $12 = 0, $18 = 0, $19 = 0, $2 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 13109
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13111
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13113
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 13116
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13118
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13120
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13122
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13126
 $$13 = ($AsyncRetVal | 0) >= ($12 | 0) ? 0 : $AsyncRetVal; //@line 13128
 $18 = (HEAP32[$0 + 28 >> 2] | 0) + $$13 | 0; //@line 13130
 $19 = $12 - $$13 | 0; //@line 13131
 do {
  if (($$13 | 0) > 0) {
   $21 = HEAP32[52] | 0; //@line 13135
   if (!(($19 | 0) > 0 & ($21 | 0) != 0)) {
    if (($$13 | 0) < 1 | ($19 | 0) < 1 | $6 ^ 1) {
     break;
    }
    _snprintf($18, $19, 1264, $8) | 0; //@line 13147
    break;
   }
   $ReallocAsyncCtx6 = _emscripten_realloc_async_context(32) | 0; //@line 13150
   $23 = FUNCTION_TABLE_i[$21 & 0]() | 0; //@line 13151
   if (___async) {
    HEAP32[$ReallocAsyncCtx6 >> 2] = 26; //@line 13154
    $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 13155
    HEAP32[$24 >> 2] = $2; //@line 13156
    $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 13157
    HEAP32[$25 >> 2] = $18; //@line 13158
    $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 13159
    HEAP32[$26 >> 2] = $19; //@line 13160
    $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 13161
    HEAP32[$27 >> 2] = $4; //@line 13162
    $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 13163
    $$expand_i1_val = $6 & 1; //@line 13164
    HEAP8[$28 >> 0] = $$expand_i1_val; //@line 13165
    $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 13166
    HEAP32[$29 >> 2] = $8; //@line 13167
    $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 13168
    HEAP32[$30 >> 2] = $10; //@line 13169
    sp = STACKTOP; //@line 13170
    return;
   }
   HEAP32[___async_retval >> 2] = $23; //@line 13174
   ___async_unwind = 0; //@line 13175
   HEAP32[$ReallocAsyncCtx6 >> 2] = 26; //@line 13176
   $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 13177
   HEAP32[$24 >> 2] = $2; //@line 13178
   $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 13179
   HEAP32[$25 >> 2] = $18; //@line 13180
   $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 13181
   HEAP32[$26 >> 2] = $19; //@line 13182
   $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 13183
   HEAP32[$27 >> 2] = $4; //@line 13184
   $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 13185
   $$expand_i1_val = $6 & 1; //@line 13186
   HEAP8[$28 >> 0] = $$expand_i1_val; //@line 13187
   $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 13188
   HEAP32[$29 >> 2] = $8; //@line 13189
   $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 13190
   HEAP32[$30 >> 2] = $10; //@line 13191
   sp = STACKTOP; //@line 13192
   return;
  }
 } while (0);
 $34 = HEAP32[53] | 0; //@line 13196
 $35 = HEAP32[46] | 0; //@line 13197
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 13198
 FUNCTION_TABLE_vi[$34 & 127]($35); //@line 13199
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 27; //@line 13202
  sp = STACKTOP; //@line 13203
  return;
 }
 ___async_unwind = 0; //@line 13206
 HEAP32[$ReallocAsyncCtx7 >> 2] = 27; //@line 13207
 sp = STACKTOP; //@line 13208
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11010
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 11016
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 11022
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 11025
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 11026
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 11027
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 110; //@line 11030
     sp = STACKTOP; //@line 11031
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11034
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 11042
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 11047
     $19 = $1 + 44 | 0; //@line 11048
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 11054
     HEAP8[$22 >> 0] = 0; //@line 11055
     $23 = $1 + 53 | 0; //@line 11056
     HEAP8[$23 >> 0] = 0; //@line 11057
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 11059
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 11062
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 11063
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 11064
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 109; //@line 11067
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 11069
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 11071
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 11073
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 11075
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 11077
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 11079
      sp = STACKTOP; //@line 11080
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 11083
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 11087
      label = 13; //@line 11088
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 11093
       label = 13; //@line 11094
      } else {
       $$037$off039 = 3; //@line 11096
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 11100
      $39 = $1 + 40 | 0; //@line 11101
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 11104
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 11114
        $$037$off039 = $$037$off038; //@line 11115
       } else {
        $$037$off039 = $$037$off038; //@line 11117
       }
      } else {
       $$037$off039 = $$037$off038; //@line 11120
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 11123
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 11130
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_13($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 13218
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13220
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13222
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13224
 $8 = HEAP8[$0 + 16 >> 0] & 1; //@line 13227
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13229
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13231
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 13233
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 13235
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 13237
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 13239
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 13241
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 13243
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 13245
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 13247
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 13249
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 13251
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 13253
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 13255
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 13257
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 13259
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 13261
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 13263
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 13265
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 13267
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 13269
 $55 = ($2 | 0 ? 4 : 0) + $2 + (HEAP32[___async_retval >> 2] | 0) | 0; //@line 13275
 $56 = HEAP32[51] | 0; //@line 13276
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(100) | 0; //@line 13277
 $57 = FUNCTION_TABLE_ii[$56 & 1]($55) | 0; //@line 13278
 if (!___async) {
  HEAP32[___async_retval >> 2] = $57; //@line 13282
  ___async_unwind = 0; //@line 13283
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 24; //@line 13285
 HEAP8[$ReallocAsyncCtx5 + 4 >> 0] = $8 & 1; //@line 13288
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $10; //@line 13290
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $12; //@line 13292
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $14; //@line 13294
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $16; //@line 13296
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $18; //@line 13298
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $20; //@line 13300
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $22; //@line 13302
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $24; //@line 13304
 HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $26; //@line 13306
 HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $28; //@line 13308
 HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $30; //@line 13310
 HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $32; //@line 13312
 HEAP32[$ReallocAsyncCtx5 + 56 >> 2] = $4; //@line 13314
 HEAP32[$ReallocAsyncCtx5 + 60 >> 2] = $6; //@line 13316
 HEAP32[$ReallocAsyncCtx5 + 64 >> 2] = $34; //@line 13318
 HEAP32[$ReallocAsyncCtx5 + 68 >> 2] = $36; //@line 13320
 HEAP32[$ReallocAsyncCtx5 + 72 >> 2] = $38; //@line 13322
 HEAP32[$ReallocAsyncCtx5 + 76 >> 2] = $40; //@line 13324
 HEAP32[$ReallocAsyncCtx5 + 80 >> 2] = $42; //@line 13326
 HEAP32[$ReallocAsyncCtx5 + 84 >> 2] = $44; //@line 13328
 HEAP32[$ReallocAsyncCtx5 + 88 >> 2] = $46; //@line 13330
 HEAP32[$ReallocAsyncCtx5 + 92 >> 2] = $48; //@line 13332
 HEAP32[$ReallocAsyncCtx5 + 96 >> 2] = $50; //@line 13334
 sp = STACKTOP; //@line 13335
 return;
}
function __ZN4mbed6BusOutC2E7PinNameS1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1___async_cb($0) {
 $0 = $0 | 0;
 var $$02932$reg2mem$0 = 0, $$pre = 0, $10 = 0, $12 = 0, $14 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13416
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13418
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13420
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13422
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13424
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13426
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13428
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 13430
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13432
 HEAP32[$AsyncRetVal >> 2] = 0; //@line 13433
 HEAP32[$AsyncRetVal + 4 >> 2] = 0; //@line 13433
 HEAP32[$AsyncRetVal + 8 >> 2] = 0; //@line 13433
 HEAP32[$AsyncRetVal + 12 >> 2] = 0; //@line 13433
 HEAP32[$AsyncRetVal + 16 >> 2] = 0; //@line 13433
 HEAP32[$AsyncRetVal + 20 >> 2] = 0; //@line 13433
 _gpio_init_out($AsyncRetVal, $2); //@line 13434
 HEAP32[$4 + 4 + ($6 << 2) >> 2] = $AsyncRetVal; //@line 13436
 HEAP32[$8 >> 2] = HEAP32[$8 >> 2] | 1 << $6; //@line 13440
 $$02932$reg2mem$0 = $6; //@line 13441
 while (1) {
  $18 = $$02932$reg2mem$0 + 1 | 0; //@line 13443
  if (($$02932$reg2mem$0 | 0) >= 15) {
   label = 2; //@line 13446
   break;
  }
  $$pre = HEAP32[$10 + ($18 << 2) >> 2] | 0; //@line 13450
  if (($$pre | 0) != -1) {
   break;
  }
  HEAP32[$4 + 4 + ($18 << 2) >> 2] = 0; //@line 13456
  $$02932$reg2mem$0 = $18; //@line 13457
 }
 if ((label | 0) == 2) {
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(32) | 0; //@line 13462
 $19 = __Znwj(24) | 0; //@line 13463
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 12; //@line 13466
  $20 = $ReallocAsyncCtx + 4 | 0; //@line 13467
  HEAP32[$20 >> 2] = $$pre; //@line 13468
  $21 = $ReallocAsyncCtx + 8 | 0; //@line 13469
  HEAP32[$21 >> 2] = $4; //@line 13470
  $22 = $ReallocAsyncCtx + 12 | 0; //@line 13471
  HEAP32[$22 >> 2] = $18; //@line 13472
  $23 = $ReallocAsyncCtx + 16 | 0; //@line 13473
  HEAP32[$23 >> 2] = $8; //@line 13474
  $24 = $ReallocAsyncCtx + 20 | 0; //@line 13475
  HEAP32[$24 >> 2] = $10; //@line 13476
  $25 = $ReallocAsyncCtx + 24 | 0; //@line 13477
  HEAP32[$25 >> 2] = $12; //@line 13478
  $26 = $ReallocAsyncCtx + 28 | 0; //@line 13479
  HEAP32[$26 >> 2] = $14; //@line 13480
  sp = STACKTOP; //@line 13481
  return;
 }
 HEAP32[___async_retval >> 2] = $19; //@line 13485
 ___async_unwind = 0; //@line 13486
 HEAP32[$ReallocAsyncCtx >> 2] = 12; //@line 13487
 $20 = $ReallocAsyncCtx + 4 | 0; //@line 13488
 HEAP32[$20 >> 2] = $$pre; //@line 13489
 $21 = $ReallocAsyncCtx + 8 | 0; //@line 13490
 HEAP32[$21 >> 2] = $4; //@line 13491
 $22 = $ReallocAsyncCtx + 12 | 0; //@line 13492
 HEAP32[$22 >> 2] = $18; //@line 13493
 $23 = $ReallocAsyncCtx + 16 | 0; //@line 13494
 HEAP32[$23 >> 2] = $8; //@line 13495
 $24 = $ReallocAsyncCtx + 20 | 0; //@line 13496
 HEAP32[$24 >> 2] = $10; //@line 13497
 $25 = $ReallocAsyncCtx + 24 | 0; //@line 13498
 HEAP32[$25 >> 2] = $12; //@line 13499
 $26 = $ReallocAsyncCtx + 28 | 0; //@line 13500
 HEAP32[$26 >> 2] = $14; //@line 13501
 sp = STACKTOP; //@line 13502
 return;
}
function __ZN4mbed6BusOut5writeEi__async_cb($0) {
 $0 = $0 | 0;
 var $104 = 0, $13 = 0, $19 = 0, $2 = 0, $25 = 0, $31 = 0, $37 = 0, $4 = 0, $43 = 0, $49 = 0, $55 = 0, $6 = 0, $61 = 0, $67 = 0, $73 = 0, $79 = 0, $8 = 0, $85 = 0, $91 = 0, $97 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 15
 $8 = HEAP32[$2 + 4 >> 2] | 0; //@line 17
 if ($8 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$8 >> 2] | 0, $4 & 1 | 0) | 0; //@line 22
 }
 $13 = HEAP32[$2 + 8 >> 2] | 0; //@line 25
 if ($13 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$13 >> 2] | 0, $4 >>> 1 & 1 | 0) | 0; //@line 31
 }
 $19 = HEAP32[$2 + 12 >> 2] | 0; //@line 34
 if ($19 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$19 >> 2] | 0, $4 >>> 2 & 1 | 0) | 0; //@line 40
 }
 $25 = HEAP32[$2 + 16 >> 2] | 0; //@line 43
 if ($25 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$25 >> 2] | 0, $4 >>> 3 & 1 | 0) | 0; //@line 49
 }
 $31 = HEAP32[$2 + 20 >> 2] | 0; //@line 52
 if ($31 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$31 >> 2] | 0, $4 >>> 4 & 1 | 0) | 0; //@line 58
 }
 $37 = HEAP32[$2 + 24 >> 2] | 0; //@line 61
 if ($37 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$37 >> 2] | 0, $4 >>> 5 & 1 | 0) | 0; //@line 67
 }
 $43 = HEAP32[$2 + 28 >> 2] | 0; //@line 70
 if ($43 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$43 >> 2] | 0, $4 >>> 6 & 1 | 0) | 0; //@line 76
 }
 $49 = HEAP32[$2 + 32 >> 2] | 0; //@line 79
 if ($49 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$49 >> 2] | 0, $4 >>> 7 & 1 | 0) | 0; //@line 85
 }
 $55 = HEAP32[$2 + 36 >> 2] | 0; //@line 88
 if ($55 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$55 >> 2] | 0, $4 >>> 8 & 1 | 0) | 0; //@line 94
 }
 $61 = HEAP32[$2 + 40 >> 2] | 0; //@line 97
 if ($61 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$61 >> 2] | 0, $4 >>> 9 & 1 | 0) | 0; //@line 103
 }
 $67 = HEAP32[$2 + 44 >> 2] | 0; //@line 106
 if ($67 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$67 >> 2] | 0, $4 >>> 10 & 1 | 0) | 0; //@line 112
 }
 $73 = HEAP32[$2 + 48 >> 2] | 0; //@line 115
 if ($73 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$73 >> 2] | 0, $4 >>> 11 & 1 | 0) | 0; //@line 121
 }
 $79 = HEAP32[$2 + 52 >> 2] | 0; //@line 124
 if ($79 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$79 >> 2] | 0, $4 >>> 12 & 1 | 0) | 0; //@line 130
 }
 $85 = HEAP32[$2 + 56 >> 2] | 0; //@line 133
 if ($85 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$85 >> 2] | 0, $4 >>> 13 & 1 | 0) | 0; //@line 139
 }
 $91 = HEAP32[$2 + 60 >> 2] | 0; //@line 142
 if ($91 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$91 >> 2] | 0, $4 >>> 14 & 1 | 0) | 0; //@line 148
 }
 $97 = HEAP32[$2 + 64 >> 2] | 0; //@line 151
 if ($97 | 0) {
  _emscripten_asm_const_iii(2, HEAP32[$97 >> 2] | 0, $4 >>> 15 & 1 | 0) | 0; //@line 157
 }
 $104 = HEAP32[(HEAP32[$6 >> 2] | 0) + 12 >> 2] | 0; //@line 161
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 162
 FUNCTION_TABLE_vi[$104 & 127]($2); //@line 163
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 14; //@line 166
  sp = STACKTOP; //@line 167
  return;
 }
 ___async_unwind = 0; //@line 170
 HEAP32[$ReallocAsyncCtx2 >> 2] = 14; //@line 171
 sp = STACKTOP; //@line 172
 return;
}
function _mbed_error_vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1613
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1615
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1617
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1619
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[1034] | 0)) {
  _serial_init(4140, 2, 3); //@line 1627
 }
 $9 = HEAP8[$4 >> 0] | 0; //@line 1629
 if (0 == 13 | $9 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 1635
  _serial_putc(4140, $9 << 24 >> 24); //@line 1636
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 50; //@line 1639
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 1640
   HEAP32[$18 >> 2] = 0; //@line 1641
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 1642
   HEAP32[$19 >> 2] = $AsyncRetVal; //@line 1643
   $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 1644
   HEAP32[$20 >> 2] = $2; //@line 1645
   $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 1646
   HEAP8[$21 >> 0] = $9; //@line 1647
   $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 1648
   HEAP32[$22 >> 2] = $4; //@line 1649
   sp = STACKTOP; //@line 1650
   return;
  }
  ___async_unwind = 0; //@line 1653
  HEAP32[$ReallocAsyncCtx2 >> 2] = 50; //@line 1654
  $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 1655
  HEAP32[$18 >> 2] = 0; //@line 1656
  $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 1657
  HEAP32[$19 >> 2] = $AsyncRetVal; //@line 1658
  $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 1659
  HEAP32[$20 >> 2] = $2; //@line 1660
  $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 1661
  HEAP8[$21 >> 0] = $9; //@line 1662
  $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 1663
  HEAP32[$22 >> 2] = $4; //@line 1664
  sp = STACKTOP; //@line 1665
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 1668
  _serial_putc(4140, 13); //@line 1669
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 49; //@line 1672
   $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 1673
   HEAP8[$12 >> 0] = $9; //@line 1674
   $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 1675
   HEAP32[$13 >> 2] = 0; //@line 1676
   $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 1677
   HEAP32[$14 >> 2] = $AsyncRetVal; //@line 1678
   $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 1679
   HEAP32[$15 >> 2] = $2; //@line 1680
   $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 1681
   HEAP32[$16 >> 2] = $4; //@line 1682
   sp = STACKTOP; //@line 1683
   return;
  }
  ___async_unwind = 0; //@line 1686
  HEAP32[$ReallocAsyncCtx3 >> 2] = 49; //@line 1687
  $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 1688
  HEAP8[$12 >> 0] = $9; //@line 1689
  $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 1690
  HEAP32[$13 >> 2] = 0; //@line 1691
  $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 1692
  HEAP32[$14 >> 2] = $AsyncRetVal; //@line 1693
  $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 1694
  HEAP32[$15 >> 2] = $2; //@line 1695
  $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 1696
  HEAP32[$16 >> 2] = $4; //@line 1697
  sp = STACKTOP; //@line 1698
  return;
 }
}
function _mbed_error_vfprintf__async_cb_75($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1706
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1710
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1712
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1716
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 1717
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP8[$10 + $12 >> 0] | 0; //@line 1723
 if ((HEAP8[$0 + 16 >> 0] | 0) == 13 | $13 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 1729
  _serial_putc(4140, $13 << 24 >> 24); //@line 1730
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 50; //@line 1733
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 1734
   HEAP32[$22 >> 2] = $12; //@line 1735
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 1736
   HEAP32[$23 >> 2] = $4; //@line 1737
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 1738
   HEAP32[$24 >> 2] = $6; //@line 1739
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 1740
   HEAP8[$25 >> 0] = $13; //@line 1741
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 1742
   HEAP32[$26 >> 2] = $10; //@line 1743
   sp = STACKTOP; //@line 1744
   return;
  }
  ___async_unwind = 0; //@line 1747
  HEAP32[$ReallocAsyncCtx2 >> 2] = 50; //@line 1748
  $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 1749
  HEAP32[$22 >> 2] = $12; //@line 1750
  $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 1751
  HEAP32[$23 >> 2] = $4; //@line 1752
  $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 1753
  HEAP32[$24 >> 2] = $6; //@line 1754
  $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 1755
  HEAP8[$25 >> 0] = $13; //@line 1756
  $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 1757
  HEAP32[$26 >> 2] = $10; //@line 1758
  sp = STACKTOP; //@line 1759
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 1762
  _serial_putc(4140, 13); //@line 1763
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 49; //@line 1766
   $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 1767
   HEAP8[$16 >> 0] = $13; //@line 1768
   $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 1769
   HEAP32[$17 >> 2] = $12; //@line 1770
   $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 1771
   HEAP32[$18 >> 2] = $4; //@line 1772
   $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 1773
   HEAP32[$19 >> 2] = $6; //@line 1774
   $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 1775
   HEAP32[$20 >> 2] = $10; //@line 1776
   sp = STACKTOP; //@line 1777
   return;
  }
  ___async_unwind = 0; //@line 1780
  HEAP32[$ReallocAsyncCtx3 >> 2] = 49; //@line 1781
  $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 1782
  HEAP8[$16 >> 0] = $13; //@line 1783
  $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 1784
  HEAP32[$17 >> 2] = $12; //@line 1785
  $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 1786
  HEAP32[$18 >> 2] = $4; //@line 1787
  $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 1788
  HEAP32[$19 >> 2] = $6; //@line 1789
  $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 1790
  HEAP32[$20 >> 2] = $10; //@line 1791
  sp = STACKTOP; //@line 1792
  return;
 }
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5555
 STACKTOP = STACKTOP + 48 | 0; //@line 5556
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 5556
 $vararg_buffer3 = sp + 16 | 0; //@line 5557
 $vararg_buffer = sp; //@line 5558
 $3 = sp + 32 | 0; //@line 5559
 $4 = $0 + 28 | 0; //@line 5560
 $5 = HEAP32[$4 >> 2] | 0; //@line 5561
 HEAP32[$3 >> 2] = $5; //@line 5562
 $7 = $0 + 20 | 0; //@line 5564
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 5566
 HEAP32[$3 + 4 >> 2] = $9; //@line 5567
 HEAP32[$3 + 8 >> 2] = $1; //@line 5569
 HEAP32[$3 + 12 >> 2] = $2; //@line 5571
 $12 = $9 + $2 | 0; //@line 5572
 $13 = $0 + 60 | 0; //@line 5573
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 5576
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 5578
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 5580
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 5582
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 5586
  } else {
   $$04756 = 2; //@line 5588
   $$04855 = $12; //@line 5588
   $$04954 = $3; //@line 5588
   $27 = $17; //@line 5588
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 5594
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 5596
    $38 = $27 >>> 0 > $37 >>> 0; //@line 5597
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 5599
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 5601
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 5603
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 5606
    $44 = $$150 + 4 | 0; //@line 5607
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 5610
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 5613
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 5615
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 5617
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 5619
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 5622
     break L1;
    } else {
     $$04756 = $$1; //@line 5625
     $$04954 = $$150; //@line 5625
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 5629
   HEAP32[$4 >> 2] = 0; //@line 5630
   HEAP32[$7 >> 2] = 0; //@line 5631
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 5634
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 5637
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 5642
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 5648
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 5653
  $25 = $20; //@line 5654
  HEAP32[$4 >> 2] = $25; //@line 5655
  HEAP32[$7 >> 2] = $25; //@line 5656
  $$051 = $2; //@line 5657
 }
 STACKTOP = sp; //@line 5659
 return $$051 | 0; //@line 5659
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
 sp = STACKTOP; //@line 279
 STACKTOP = STACKTOP + 64 | 0; //@line 280
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 280
 $17 = sp; //@line 281
 HEAP32[$0 >> 2] = 152; //@line 282
 HEAP32[$17 >> 2] = $1; //@line 283
 HEAP32[$17 + 4 >> 2] = $2; //@line 285
 HEAP32[$17 + 8 >> 2] = $3; //@line 287
 HEAP32[$17 + 12 >> 2] = $4; //@line 289
 HEAP32[$17 + 16 >> 2] = $5; //@line 291
 HEAP32[$17 + 20 >> 2] = $6; //@line 293
 HEAP32[$17 + 24 >> 2] = $7; //@line 295
 HEAP32[$17 + 28 >> 2] = $8; //@line 297
 HEAP32[$17 + 32 >> 2] = $9; //@line 299
 HEAP32[$17 + 36 >> 2] = $10; //@line 301
 HEAP32[$17 + 40 >> 2] = $11; //@line 303
 HEAP32[$17 + 44 >> 2] = $12; //@line 305
 HEAP32[$17 + 48 >> 2] = $13; //@line 307
 HEAP32[$17 + 52 >> 2] = $14; //@line 309
 HEAP32[$17 + 56 >> 2] = $15; //@line 311
 HEAP32[$17 + 60 >> 2] = $16; //@line 313
 $33 = $0 + 68 | 0; //@line 314
 HEAP32[$33 >> 2] = 0; //@line 315
 $$02932 = 0; //@line 316
 $35 = $1; //@line 316
 while (1) {
  if (($35 | 0) == -1) {
   HEAP32[$0 + 4 + ($$02932 << 2) >> 2] = 0; //@line 321
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(32, sp) | 0; //@line 323
   $37 = __Znwj(24) | 0; //@line 324
   if (___async) {
    label = 6; //@line 327
    break;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 330
   HEAP32[$37 >> 2] = 0; //@line 331
   HEAP32[$37 + 4 >> 2] = 0; //@line 331
   HEAP32[$37 + 8 >> 2] = 0; //@line 331
   HEAP32[$37 + 12 >> 2] = 0; //@line 331
   HEAP32[$37 + 16 >> 2] = 0; //@line 331
   HEAP32[$37 + 20 >> 2] = 0; //@line 331
   _gpio_init_out($37, $35); //@line 332
   HEAP32[$0 + 4 + ($$02932 << 2) >> 2] = $37; //@line 334
   HEAP32[$33 >> 2] = HEAP32[$33 >> 2] | 1 << $$02932; //@line 338
  }
  $49 = $$02932 + 1 | 0; //@line 340
  if (($$02932 | 0) >= 15) {
   label = 2; //@line 343
   break;
  }
  $$02932 = $49; //@line 348
  $35 = HEAP32[$17 + ($49 << 2) >> 2] | 0; //@line 348
 }
 if ((label | 0) == 2) {
  STACKTOP = sp; //@line 351
  return;
 } else if ((label | 0) == 6) {
  HEAP32[$AsyncCtx >> 2] = 12; //@line 354
  HEAP32[$AsyncCtx + 4 >> 2] = $35; //@line 356
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 358
  HEAP32[$AsyncCtx + 12 >> 2] = $$02932; //@line 360
  HEAP32[$AsyncCtx + 16 >> 2] = $33; //@line 362
  HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 364
  HEAP32[$AsyncCtx + 24 >> 2] = $17; //@line 366
  HEAP32[$AsyncCtx + 28 >> 2] = $1; //@line 368
  sp = STACKTOP; //@line 369
  STACKTOP = sp; //@line 370
  return;
 }
}
function _mbed_error_vfprintf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$01213 = 0, $$014 = 0, $2 = 0, $24 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0, $$01213$looptemp = 0;
 sp = STACKTOP; //@line 1651
 STACKTOP = STACKTOP + 128 | 0; //@line 1652
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 1652
 $2 = sp; //@line 1653
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1654
 $3 = _vsnprintf($2, 128, $0, $1) | 0; //@line 1655
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 48; //@line 1658
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 1660
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 1662
  sp = STACKTOP; //@line 1663
  STACKTOP = sp; //@line 1664
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1666
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 1669
  return;
 }
 if (!(HEAP32[1034] | 0)) {
  _serial_init(4140, 2, 3); //@line 1674
  $$01213 = 0; //@line 1675
  $$014 = 0; //@line 1675
 } else {
  $$01213 = 0; //@line 1677
  $$014 = 0; //@line 1677
 }
 while (1) {
  $$01213$looptemp = $$01213;
  $$01213 = HEAP8[$2 + $$014 >> 0] | 0; //@line 1681
  if (!($$01213$looptemp << 24 >> 24 == 13 | $$01213 << 24 >> 24 != 10)) {
   $AsyncCtx7 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1686
   _serial_putc(4140, 13); //@line 1687
   if (___async) {
    label = 8; //@line 1690
    break;
   }
   _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1693
  }
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1696
  _serial_putc(4140, $$01213 << 24 >> 24); //@line 1697
  if (___async) {
   label = 11; //@line 1700
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1703
  $24 = $$014 + 1 | 0; //@line 1704
  if (($24 | 0) == ($3 | 0)) {
   label = 13; //@line 1707
   break;
  } else {
   $$014 = $24; //@line 1710
  }
 }
 if ((label | 0) == 8) {
  HEAP32[$AsyncCtx7 >> 2] = 49; //@line 1714
  HEAP8[$AsyncCtx7 + 4 >> 0] = $$01213; //@line 1716
  HEAP32[$AsyncCtx7 + 8 >> 2] = $$014; //@line 1718
  HEAP32[$AsyncCtx7 + 12 >> 2] = $3; //@line 1720
  HEAP32[$AsyncCtx7 + 16 >> 2] = $2; //@line 1722
  HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 1724
  sp = STACKTOP; //@line 1725
  STACKTOP = sp; //@line 1726
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx3 >> 2] = 50; //@line 1729
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$014; //@line 1731
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 1733
  HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 1735
  HEAP8[$AsyncCtx3 + 16 >> 0] = $$01213; //@line 1737
  HEAP32[$AsyncCtx3 + 20 >> 2] = $2; //@line 1739
  sp = STACKTOP; //@line 1740
  STACKTOP = sp; //@line 1741
  return;
 } else if ((label | 0) == 13) {
  STACKTOP = sp; //@line 1744
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_70($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1197
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1201
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1203
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 1205
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1207
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 1209
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1211
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1213
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1215
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1217
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 1220
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1222
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 1226
   $27 = $6 + 24 | 0; //@line 1227
   $28 = $4 + 8 | 0; //@line 1228
   $29 = $6 + 54 | 0; //@line 1229
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
    HEAP8[$10 >> 0] = 0; //@line 1259
    HEAP8[$14 >> 0] = 0; //@line 1260
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 1261
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 1262
    if (!___async) {
     ___async_unwind = 0; //@line 1265
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 113; //@line 1267
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 1269
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 1271
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 1273
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 1275
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 1277
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 1279
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 1281
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 1283
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 1285
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 1287
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 1289
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 1291
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 1293
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 1296
    sp = STACKTOP; //@line 1297
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 1302
 HEAP8[$14 >> 0] = $12; //@line 1303
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1081
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1085
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1087
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 1089
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1091
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 1093
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1095
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1097
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1099
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1101
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1103
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1105
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 1107
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 1110
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 1111
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
    HEAP8[$10 >> 0] = 0; //@line 1144
    HEAP8[$14 >> 0] = 0; //@line 1145
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 1146
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 1147
    if (!___async) {
     ___async_unwind = 0; //@line 1150
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 113; //@line 1152
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 1154
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 1156
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 1158
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 1160
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 1162
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 1164
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 1166
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 1168
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 1170
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 1172
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 1174
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 1176
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 1178
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 1181
    sp = STACKTOP; //@line 1182
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 1187
 HEAP8[$14 >> 0] = $12; //@line 1188
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 2178
 }
 ret = dest | 0; //@line 2181
 dest_end = dest + num | 0; //@line 2182
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 2186
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 2187
   dest = dest + 1 | 0; //@line 2188
   src = src + 1 | 0; //@line 2189
   num = num - 1 | 0; //@line 2190
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 2192
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 2193
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 2195
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 2196
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 2197
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 2198
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 2199
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 2200
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 2201
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 2202
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 2203
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 2204
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 2205
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 2206
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 2207
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 2208
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 2209
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 2210
   dest = dest + 64 | 0; //@line 2211
   src = src + 64 | 0; //@line 2212
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 2215
   dest = dest + 4 | 0; //@line 2216
   src = src + 4 | 0; //@line 2217
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 2221
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 2223
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 2224
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 2225
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 2226
   dest = dest + 4 | 0; //@line 2227
   src = src + 4 | 0; //@line 2228
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 2233
  dest = dest + 1 | 0; //@line 2234
  src = src + 1 | 0; //@line 2235
 }
 return ret | 0; //@line 2237
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 10511
 STACKTOP = STACKTOP + 64 | 0; //@line 10512
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 10512
 $3 = sp; //@line 10513
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 10516
 } else {
  if (!$1) {
   $$2 = 0; //@line 10520
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 10522
   $6 = ___dynamic_cast($1, 56, 40, 0) | 0; //@line 10523
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 104; //@line 10526
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 10528
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 10530
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 10532
    sp = STACKTOP; //@line 10533
    STACKTOP = sp; //@line 10534
    return 0; //@line 10534
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10536
   if (!$6) {
    $$2 = 0; //@line 10539
   } else {
    dest = $3 + 4 | 0; //@line 10542
    stop = dest + 52 | 0; //@line 10542
    do {
     HEAP32[dest >> 2] = 0; //@line 10542
     dest = dest + 4 | 0; //@line 10542
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 10543
    HEAP32[$3 + 8 >> 2] = $0; //@line 10545
    HEAP32[$3 + 12 >> 2] = -1; //@line 10547
    HEAP32[$3 + 48 >> 2] = 1; //@line 10549
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 10552
    $18 = HEAP32[$2 >> 2] | 0; //@line 10553
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10554
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 10555
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 105; //@line 10558
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 10560
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10562
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 10564
     sp = STACKTOP; //@line 10565
     STACKTOP = sp; //@line 10566
     return 0; //@line 10566
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10568
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 10575
     $$0 = 1; //@line 10576
    } else {
     $$0 = 0; //@line 10578
    }
    $$2 = $$0; //@line 10580
   }
  }
 }
 STACKTOP = sp; //@line 10584
 return $$2 | 0; //@line 10584
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 10276
 STACKTOP = STACKTOP + 128 | 0; //@line 10277
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 10277
 $4 = sp + 124 | 0; //@line 10278
 $5 = sp; //@line 10279
 dest = $5; //@line 10280
 src = 608; //@line 10280
 stop = dest + 124 | 0; //@line 10280
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 10280
  dest = dest + 4 | 0; //@line 10280
  src = src + 4 | 0; //@line 10280
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 10286
   $$015 = 1; //@line 10286
   label = 4; //@line 10287
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 10290
   $$0 = -1; //@line 10291
  }
 } else {
  $$014 = $0; //@line 10294
  $$015 = $1; //@line 10294
  label = 4; //@line 10295
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 10299
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 10301
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 10303
  $14 = $5 + 20 | 0; //@line 10304
  HEAP32[$14 >> 2] = $$014; //@line 10305
  HEAP32[$5 + 44 >> 2] = $$014; //@line 10307
  $16 = $$014 + $$$015 | 0; //@line 10308
  $17 = $5 + 16 | 0; //@line 10309
  HEAP32[$17 >> 2] = $16; //@line 10310
  HEAP32[$5 + 28 >> 2] = $16; //@line 10312
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 10313
  $19 = _vfprintf($5, $2, $3) | 0; //@line 10314
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 101; //@line 10317
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 10319
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 10321
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 10323
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 10325
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 10327
   sp = STACKTOP; //@line 10328
   STACKTOP = sp; //@line 10329
   return 0; //@line 10329
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 10331
  if (!$$$015) {
   $$0 = $19; //@line 10334
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 10336
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 10341
   $$0 = $19; //@line 10342
  }
 }
 STACKTOP = sp; //@line 10345
 return $$0 | 0; //@line 10345
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11745
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 11751
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 11755
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 11756
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 11757
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 11758
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 119; //@line 11761
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 11763
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 11765
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 11767
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 11769
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 11771
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 11773
    sp = STACKTOP; //@line 11774
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11777
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 11781
    $$0 = $0 + 24 | 0; //@line 11782
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 11784
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 11785
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 11790
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 11796
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 11799
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 120; //@line 11804
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 11806
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 11808
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 11810
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 11812
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 11814
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 11816
    sp = STACKTOP; //@line 11817
    return;
   }
  }
 } while (0);
 return;
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 6265
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 6268
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 6271
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 6274
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 6280
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 6289
     $24 = $13 >>> 2; //@line 6290
     $$090 = 0; //@line 6291
     $$094 = $7; //@line 6291
     while (1) {
      $25 = $$094 >>> 1; //@line 6293
      $26 = $$090 + $25 | 0; //@line 6294
      $27 = $26 << 1; //@line 6295
      $28 = $27 + $23 | 0; //@line 6296
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 6299
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 6303
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 6309
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 6317
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 6321
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 6327
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 6332
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 6335
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 6335
      }
     }
     $46 = $27 + $24 | 0; //@line 6338
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 6341
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 6345
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 6357
     } else {
      $$4 = 0; //@line 6359
     }
    } else {
     $$4 = 0; //@line 6362
    }
   } else {
    $$4 = 0; //@line 6365
   }
  } else {
   $$4 = 0; //@line 6368
  }
 } while (0);
 return $$4 | 0; //@line 6371
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5930
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 5935
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 5940
  } else {
   $20 = $0 & 255; //@line 5942
   $21 = $0 & 255; //@line 5943
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 5949
   } else {
    $26 = $1 + 20 | 0; //@line 5951
    $27 = HEAP32[$26 >> 2] | 0; //@line 5952
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 5958
     HEAP8[$27 >> 0] = $20; //@line 5959
     $34 = $21; //@line 5960
    } else {
     label = 12; //@line 5962
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 5967
     $32 = ___overflow($1, $0) | 0; //@line 5968
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 91; //@line 5971
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 5973
      sp = STACKTOP; //@line 5974
      return 0; //@line 5975
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 5977
      $34 = $32; //@line 5978
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 5983
   $$0 = $34; //@line 5984
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 5989
   $8 = $0 & 255; //@line 5990
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 5996
    $14 = HEAP32[$13 >> 2] | 0; //@line 5997
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 6003
     HEAP8[$14 >> 0] = $7; //@line 6004
     $$0 = $8; //@line 6005
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 6009
   $19 = ___overflow($1, $0) | 0; //@line 6010
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 90; //@line 6013
    sp = STACKTOP; //@line 6014
    return 0; //@line 6015
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6017
    $$0 = $19; //@line 6018
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 6023
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6650
 $1 = $0 + 20 | 0; //@line 6651
 $3 = $0 + 28 | 0; //@line 6653
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 6659
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 6660
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 6661
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 97; //@line 6664
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 6666
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 6668
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 6670
    sp = STACKTOP; //@line 6671
    return 0; //@line 6672
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 6674
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 6678
     break;
    } else {
     label = 5; //@line 6681
     break;
    }
   }
  } else {
   label = 5; //@line 6686
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 6690
  $14 = HEAP32[$13 >> 2] | 0; //@line 6691
  $15 = $0 + 8 | 0; //@line 6692
  $16 = HEAP32[$15 >> 2] | 0; //@line 6693
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 6701
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 6702
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 6703
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 98; //@line 6706
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 6708
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 6710
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 6712
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 6714
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 6716
     sp = STACKTOP; //@line 6717
     return 0; //@line 6718
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6720
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 6726
  HEAP32[$3 >> 2] = 0; //@line 6727
  HEAP32[$1 >> 2] = 0; //@line 6728
  HEAP32[$15 >> 2] = 0; //@line 6729
  HEAP32[$13 >> 2] = 0; //@line 6730
  $$0 = 0; //@line 6731
 }
 return $$0 | 0; //@line 6733
}
function __ZN16SX1276_LoRaRadio8rx_frameEPhjjhh($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $10 = 0, $13 = 0, $16 = 0, $6 = 0, $7 = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer4 = 0, $vararg_buffer8 = 0, sp = 0;
 sp = STACKTOP; //@line 68
 STACKTOP = STACKTOP + 48 | 0; //@line 69
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 69
 $vararg_buffer12 = sp + 32 | 0; //@line 70
 $vararg_buffer8 = sp + 24 | 0; //@line 71
 $vararg_buffer4 = sp + 16 | 0; //@line 72
 $vararg_buffer = sp; //@line 73
 $6 = $4 & 255; //@line 74
 $7 = $5 & 255; //@line 75
 HEAP32[$vararg_buffer >> 2] = $2; //@line 76
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 78
 HEAP32[$vararg_buffer + 8 >> 2] = $6; //@line 80
 HEAP32[$vararg_buffer + 12 >> 2] = $7; //@line 82
 _mbed_tracef(16, 852, 880, $vararg_buffer); //@line 83
 _emscripten_asm_const_i(0) | 0; //@line 84
 $10 = HEAP32[$0 + 752 >> 2] | 0; //@line 86
 if (($10 | 0) != ($6 | 0)) {
  HEAP32[$vararg_buffer4 >> 2] = $10; //@line 89
  HEAP32[$vararg_buffer4 + 4 >> 2] = $6; //@line 91
  _mbed_tracef(16, 852, 962, $vararg_buffer4); //@line 92
  STACKTOP = sp; //@line 93
  return;
 }
 $13 = HEAP32[$0 + 756 >> 2] | 0; //@line 96
 if (($13 | 0) != ($7 | 0)) {
  HEAP32[$vararg_buffer8 >> 2] = $13; //@line 99
  HEAP32[$vararg_buffer8 + 4 >> 2] = $7; //@line 101
  _mbed_tracef(16, 852, 1009, $vararg_buffer8); //@line 102
  STACKTOP = sp; //@line 103
  return;
 }
 $16 = HEAP32[$0 + 692 >> 2] | 0; //@line 106
 if (($16 | 0) == ($3 | 0)) {
  _memcpy($0 + 792 | 0, $1 | 0, $2 | 0) | 0; //@line 110
  HEAP8[$0 + 782 >> 0] = $2; //@line 113
  HEAP8[$0 + 781 >> 0] = -35; //@line 115
  HEAP8[$0 + 780 >> 0] = -5; //@line 117
  HEAP8[$0 + 783 >> 0] = 1; //@line 119
  HEAP32[$0 + 784 >> 2] = _emscripten_asm_const_i(1) | 0; //@line 122
  STACKTOP = sp; //@line 123
  return;
 } else {
  HEAP32[$vararg_buffer12 >> 2] = $16; //@line 125
  HEAP32[$vararg_buffer12 + 4 >> 2] = $3; //@line 127
  _mbed_tracef(16, 852, 1056, $vararg_buffer12); //@line 128
  STACKTOP = sp; //@line 129
  return;
 }
}
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 6414
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 6420
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 6426
   } else {
    $7 = $1 & 255; //@line 6428
    $$03039 = $0; //@line 6429
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 6431
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 6436
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 6439
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 6444
      break;
     } else {
      $$03039 = $13; //@line 6447
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 6451
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 6452
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 6460
     $25 = $18; //@line 6460
     while (1) {
      $24 = $25 ^ $17; //@line 6462
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 6469
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 6472
      $25 = HEAP32[$31 >> 2] | 0; //@line 6473
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 6482
       break;
      } else {
       $$02936 = $31; //@line 6480
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 6487
    }
   } while (0);
   $38 = $1 & 255; //@line 6490
   $$1 = $$029$lcssa; //@line 6491
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 6493
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 6499
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 6502
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 6507
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 6156
 $4 = HEAP32[$3 >> 2] | 0; //@line 6157
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 6164
   label = 5; //@line 6165
  } else {
   $$1 = 0; //@line 6167
  }
 } else {
  $12 = $4; //@line 6171
  label = 5; //@line 6172
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 6176
   $10 = HEAP32[$9 >> 2] | 0; //@line 6177
   $14 = $10; //@line 6180
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 6185
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 6193
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 6197
       $$141 = $0; //@line 6197
       $$143 = $1; //@line 6197
       $31 = $14; //@line 6197
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 6200
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 6207
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 6212
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 6215
      break L5;
     }
     $$139 = $$038; //@line 6221
     $$141 = $0 + $$038 | 0; //@line 6221
     $$143 = $1 - $$038 | 0; //@line 6221
     $31 = HEAP32[$9 >> 2] | 0; //@line 6221
    } else {
     $$139 = 0; //@line 6223
     $$141 = $0; //@line 6223
     $$143 = $1; //@line 6223
     $31 = $14; //@line 6223
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 6226
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 6229
   $$1 = $$139 + $$143 | 0; //@line 6231
  }
 } while (0);
 return $$1 | 0; //@line 6234
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_64($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 438
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 442
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 444
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 446
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 448
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 450
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 452
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 454
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 457
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 458
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 474
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 475
    if (!___async) {
     ___async_unwind = 0; //@line 478
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 117; //@line 480
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 482
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 484
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 486
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 488
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 490
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 492
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 494
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 496
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 499
    sp = STACKTOP; //@line 500
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
 sp = STACKTOP; //@line 6042
 STACKTOP = STACKTOP + 16 | 0; //@line 6043
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 6043
 $2 = sp; //@line 6044
 $3 = $1 & 255; //@line 6045
 HEAP8[$2 >> 0] = $3; //@line 6046
 $4 = $0 + 16 | 0; //@line 6047
 $5 = HEAP32[$4 >> 2] | 0; //@line 6048
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 6055
   label = 4; //@line 6056
  } else {
   $$0 = -1; //@line 6058
  }
 } else {
  $12 = $5; //@line 6061
  label = 4; //@line 6062
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 6066
   $10 = HEAP32[$9 >> 2] | 0; //@line 6067
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 6070
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 6077
     HEAP8[$10 >> 0] = $3; //@line 6078
     $$0 = $13; //@line 6079
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 6084
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 6085
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 6086
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 92; //@line 6089
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 6091
    sp = STACKTOP; //@line 6092
    STACKTOP = sp; //@line 6093
    return 0; //@line 6093
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 6095
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 6100
   } else {
    $$0 = -1; //@line 6102
   }
  }
 } while (0);
 STACKTOP = sp; //@line 6106
 return $$0 | 0; //@line 6106
}
function __ZN4mbed6BusOutD2Ev($0) {
 $0 = $0 | 0;
 var $11 = 0, $14 = 0, $17 = 0, $2 = 0, $20 = 0, $23 = 0, $26 = 0, $29 = 0, $32 = 0, $35 = 0, $38 = 0, $41 = 0, $44 = 0, $47 = 0, $5 = 0, $8 = 0;
 HEAP32[$0 >> 2] = 152; //@line 138
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 140
 if ($2 | 0) {
  __ZdlPv($2); //@line 143
 }
 $5 = HEAP32[$0 + 8 >> 2] | 0; //@line 146
 if ($5 | 0) {
  __ZdlPv($5); //@line 149
 }
 $8 = HEAP32[$0 + 12 >> 2] | 0; //@line 152
 if ($8 | 0) {
  __ZdlPv($8); //@line 155
 }
 $11 = HEAP32[$0 + 16 >> 2] | 0; //@line 158
 if ($11 | 0) {
  __ZdlPv($11); //@line 161
 }
 $14 = HEAP32[$0 + 20 >> 2] | 0; //@line 164
 if ($14 | 0) {
  __ZdlPv($14); //@line 167
 }
 $17 = HEAP32[$0 + 24 >> 2] | 0; //@line 170
 if ($17 | 0) {
  __ZdlPv($17); //@line 173
 }
 $20 = HEAP32[$0 + 28 >> 2] | 0; //@line 176
 if ($20 | 0) {
  __ZdlPv($20); //@line 179
 }
 $23 = HEAP32[$0 + 32 >> 2] | 0; //@line 182
 if ($23 | 0) {
  __ZdlPv($23); //@line 185
 }
 $26 = HEAP32[$0 + 36 >> 2] | 0; //@line 188
 if ($26 | 0) {
  __ZdlPv($26); //@line 191
 }
 $29 = HEAP32[$0 + 40 >> 2] | 0; //@line 194
 if ($29 | 0) {
  __ZdlPv($29); //@line 197
 }
 $32 = HEAP32[$0 + 44 >> 2] | 0; //@line 200
 if ($32 | 0) {
  __ZdlPv($32); //@line 203
 }
 $35 = HEAP32[$0 + 48 >> 2] | 0; //@line 206
 if ($35 | 0) {
  __ZdlPv($35); //@line 209
 }
 $38 = HEAP32[$0 + 52 >> 2] | 0; //@line 212
 if ($38 | 0) {
  __ZdlPv($38); //@line 215
 }
 $41 = HEAP32[$0 + 56 >> 2] | 0; //@line 218
 if ($41 | 0) {
  __ZdlPv($41); //@line 221
 }
 $44 = HEAP32[$0 + 60 >> 2] | 0; //@line 224
 if ($44 | 0) {
  __ZdlPv($44); //@line 227
 }
 $47 = HEAP32[$0 + 64 >> 2] | 0; //@line 230
 if (!$47) {
  return;
 }
 __ZdlPv($47); //@line 235
 return;
}
function _fflush__async_cb_3($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12130
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12132
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 12134
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 12138
  } else {
   $$02327 = $$02325; //@line 12140
   $$02426 = $AsyncRetVal; //@line 12140
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 12147
    } else {
     $16 = 0; //@line 12149
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 12161
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 12164
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 12167
     break L3;
    } else {
     $$02327 = $$023; //@line 12170
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 12173
   $13 = ___fflush_unlocked($$02327) | 0; //@line 12174
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 12178
    ___async_unwind = 0; //@line 12179
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 96; //@line 12181
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 12183
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 12185
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 12187
   sp = STACKTOP; //@line 12188
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 12192
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 12194
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 2242
 value = value & 255; //@line 2244
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 2247
   ptr = ptr + 1 | 0; //@line 2248
  }
  aligned_end = end & -4 | 0; //@line 2251
  block_aligned_end = aligned_end - 64 | 0; //@line 2252
  value4 = value | value << 8 | value << 16 | value << 24; //@line 2253
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 2256
   HEAP32[ptr + 4 >> 2] = value4; //@line 2257
   HEAP32[ptr + 8 >> 2] = value4; //@line 2258
   HEAP32[ptr + 12 >> 2] = value4; //@line 2259
   HEAP32[ptr + 16 >> 2] = value4; //@line 2260
   HEAP32[ptr + 20 >> 2] = value4; //@line 2261
   HEAP32[ptr + 24 >> 2] = value4; //@line 2262
   HEAP32[ptr + 28 >> 2] = value4; //@line 2263
   HEAP32[ptr + 32 >> 2] = value4; //@line 2264
   HEAP32[ptr + 36 >> 2] = value4; //@line 2265
   HEAP32[ptr + 40 >> 2] = value4; //@line 2266
   HEAP32[ptr + 44 >> 2] = value4; //@line 2267
   HEAP32[ptr + 48 >> 2] = value4; //@line 2268
   HEAP32[ptr + 52 >> 2] = value4; //@line 2269
   HEAP32[ptr + 56 >> 2] = value4; //@line 2270
   HEAP32[ptr + 60 >> 2] = value4; //@line 2271
   ptr = ptr + 64 | 0; //@line 2272
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 2276
   ptr = ptr + 4 | 0; //@line 2277
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 2282
  ptr = ptr + 1 | 0; //@line 2283
 }
 return end - num | 0; //@line 2285
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12031
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 12041
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 12041
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 12041
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 12045
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 12048
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 12051
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 12059
  } else {
   $20 = 0; //@line 12061
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 12071
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 12075
  HEAP32[___async_retval >> 2] = $$1; //@line 12077
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 12080
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 12081
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 12085
  ___async_unwind = 0; //@line 12086
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 96; //@line 12088
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 12090
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 12092
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 12094
 sp = STACKTOP; //@line 12095
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 375
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 379
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 381
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 383
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 385
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 387
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 389
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 392
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 393
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 402
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 403
    if (!___async) {
     ___async_unwind = 0; //@line 406
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 118; //@line 408
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 410
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 412
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 414
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 416
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 418
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 420
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 422
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 425
    sp = STACKTOP; //@line 426
    return;
   }
  }
 }
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 271
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 273
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 275
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 277
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 282
  } else {
   $9 = $4 + 4 | 0; //@line 284
   $10 = HEAP32[$9 >> 2] | 0; //@line 285
   $11 = $4 + 8 | 0; //@line 286
   $12 = HEAP32[$11 >> 2] | 0; //@line 287
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 291
    HEAP32[$6 >> 2] = 0; //@line 292
    HEAP32[$2 >> 2] = 0; //@line 293
    HEAP32[$11 >> 2] = 0; //@line 294
    HEAP32[$9 >> 2] = 0; //@line 295
    $$0 = 0; //@line 296
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 303
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 304
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 305
   if (!___async) {
    ___async_unwind = 0; //@line 308
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 98; //@line 310
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 312
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 314
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 316
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 318
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 320
   sp = STACKTOP; //@line 321
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 326
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 9422
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 9427
    $$0 = 1; //@line 9428
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 9441
     $$0 = 1; //@line 9442
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 9446
     $$0 = -1; //@line 9447
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 9457
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 9461
    $$0 = 2; //@line 9462
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 9474
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 9480
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 9484
    $$0 = 3; //@line 9485
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 9495
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 9501
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 9507
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 9511
    $$0 = 4; //@line 9512
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 9516
    $$0 = -1; //@line 9517
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 9522
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_68($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 946
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 948
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 950
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 952
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 954
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 959
  return;
 }
 dest = $2 + 4 | 0; //@line 963
 stop = dest + 52 | 0; //@line 963
 do {
  HEAP32[dest >> 2] = 0; //@line 963
  dest = dest + 4 | 0; //@line 963
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 964
 HEAP32[$2 + 8 >> 2] = $4; //@line 966
 HEAP32[$2 + 12 >> 2] = -1; //@line 968
 HEAP32[$2 + 48 >> 2] = 1; //@line 970
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 973
 $16 = HEAP32[$6 >> 2] | 0; //@line 974
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 975
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 976
 if (!___async) {
  ___async_unwind = 0; //@line 979
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 105; //@line 981
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 983
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 985
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 987
 sp = STACKTOP; //@line 988
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_65($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 511
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 515
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 517
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 519
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 521
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 523
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 526
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 527
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 533
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 534
   if (!___async) {
    ___async_unwind = 0; //@line 537
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 116; //@line 539
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 541
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 543
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 545
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 547
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 549
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 551
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 554
   sp = STACKTOP; //@line 555
   return;
  }
 }
 return;
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 8306
  $8 = $0; //@line 8306
  $9 = $1; //@line 8306
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 8308
   $$0914 = $$0914 + -1 | 0; //@line 8312
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 8313
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 8314
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 8322
   }
  }
  $$010$lcssa$off0 = $8; //@line 8327
  $$09$lcssa = $$0914; //@line 8327
 } else {
  $$010$lcssa$off0 = $0; //@line 8329
  $$09$lcssa = $2; //@line 8329
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 8333
 } else {
  $$012 = $$010$lcssa$off0; //@line 8335
  $$111 = $$09$lcssa; //@line 8335
  while (1) {
   $26 = $$111 + -1 | 0; //@line 8340
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 8341
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 8345
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 8348
    $$111 = $26; //@line 8348
   }
  }
 }
 return $$1$lcssa | 0; //@line 8352
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1400
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1402
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1406
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1408
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1410
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1412
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 1416
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 1419
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 1420
   if (!___async) {
    ___async_unwind = 0; //@line 1423
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 120; //@line 1425
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 1427
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 1429
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 1431
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 1433
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 1435
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 1437
   sp = STACKTOP; //@line 1438
   return;
  }
 }
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 5808
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 5813
   label = 4; //@line 5814
  } else {
   $$01519 = $0; //@line 5816
   $23 = $1; //@line 5816
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 5821
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 5824
    $23 = $6; //@line 5825
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 5829
     label = 4; //@line 5830
     break;
    } else {
     $$01519 = $6; //@line 5833
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 5839
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 5841
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 5849
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 5857
  } else {
   $$pn = $$0; //@line 5859
   while (1) {
    $19 = $$pn + 1 | 0; //@line 5861
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 5865
     break;
    } else {
     $$pn = $19; //@line 5868
    }
   }
  }
  $$sink = $$1$lcssa; //@line 5873
 }
 return $$sink - $1 | 0; //@line 5876
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 10758
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 10765
   $10 = $1 + 16 | 0; //@line 10766
   $11 = HEAP32[$10 >> 2] | 0; //@line 10767
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 10770
    HEAP32[$1 + 24 >> 2] = $4; //@line 10772
    HEAP32[$1 + 36 >> 2] = 1; //@line 10774
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 10784
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 10789
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 10792
    HEAP8[$1 + 54 >> 0] = 1; //@line 10794
    break;
   }
   $21 = $1 + 24 | 0; //@line 10797
   $22 = HEAP32[$21 >> 2] | 0; //@line 10798
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 10801
    $28 = $4; //@line 10802
   } else {
    $28 = $22; //@line 10804
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 10813
   }
  }
 } while (0);
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10371
 $1 = HEAP32[58] | 0; //@line 10372
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 10378
 } else {
  $19 = 0; //@line 10380
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 10386
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 10392
    $12 = HEAP32[$11 >> 2] | 0; //@line 10393
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 10399
     HEAP8[$12 >> 0] = 10; //@line 10400
     $22 = 0; //@line 10401
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 10405
   $17 = ___overflow($1, 10) | 0; //@line 10406
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 102; //@line 10409
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 10411
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 10413
    sp = STACKTOP; //@line 10414
    return 0; //@line 10415
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10417
    $22 = $17 >> 31; //@line 10419
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 10426
 }
 return $22 | 0; //@line 10428
}
function _mbed_vtracef__async_cb_8($0) {
 $0 = $0 | 0;
 var $$18 = 0, $10 = 0, $12 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 12956
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12958
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12960
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12962
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 12967
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12969
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 12974
 $16 = _snprintf($4, $6, 1186, $2) | 0; //@line 12975
 $$18 = ($16 | 0) >= ($6 | 0) ? 0 : $16; //@line 12977
 $19 = $4 + $$18 | 0; //@line 12979
 $20 = $6 - $$18 | 0; //@line 12980
 if (($$18 | 0) > 0) {
  if (!(($$18 | 0) < 1 | ($20 | 0) < 1 | $10 ^ 1)) {
   _snprintf($19, $20, 1264, $12) | 0; //@line 12988
  }
 }
 $23 = HEAP32[53] | 0; //@line 12991
 $24 = HEAP32[46] | 0; //@line 12992
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 12993
 FUNCTION_TABLE_vi[$23 & 127]($24); //@line 12994
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 27; //@line 12997
  sp = STACKTOP; //@line 12998
  return;
 }
 ___async_unwind = 0; //@line 13001
 HEAP32[$ReallocAsyncCtx7 >> 2] = 27; //@line 13002
 sp = STACKTOP; //@line 13003
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_72($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1448
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1454
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1456
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1458
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1460
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 1465
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 1467
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 1468
 if (!___async) {
  ___async_unwind = 0; //@line 1471
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 120; //@line 1473
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 1475
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 1477
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 1479
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 1481
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 1483
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 1485
 sp = STACKTOP; //@line 1486
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10617
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 10626
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 10631
      HEAP32[$13 >> 2] = $2; //@line 10632
      $19 = $1 + 40 | 0; //@line 10633
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 10636
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 10646
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 10650
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 10657
    }
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1339
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1341
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1343
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1347
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 1351
  label = 4; //@line 1352
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 1357
   label = 4; //@line 1358
  } else {
   $$037$off039 = 3; //@line 1360
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 1364
  $17 = $8 + 40 | 0; //@line 1365
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 1368
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 1378
    $$037$off039 = $$037$off038; //@line 1379
   } else {
    $$037$off039 = $$037$off038; //@line 1381
   }
  } else {
   $$037$off039 = $$037$off038; //@line 1384
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 1387
 return;
}
function ___strerror_l($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $7 = 0, label = 0, $$113$looptemp = 0;
 $$016 = 0; //@line 9542
 while (1) {
  if ((HEAPU8[2015 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 9549
   break;
  }
  $7 = $$016 + 1 | 0; //@line 9552
  if (($7 | 0) == 87) {
   $$01214 = 2103; //@line 9555
   $$115 = 87; //@line 9555
   label = 5; //@line 9556
   break;
  } else {
   $$016 = $7; //@line 9559
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 2103; //@line 9565
  } else {
   $$01214 = 2103; //@line 9567
   $$115 = $$016; //@line 9567
   label = 5; //@line 9568
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 9573
   $$113 = $$01214; //@line 9574
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 9578
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 9585
   if (!$$115) {
    $$012$lcssa = $$113; //@line 9588
    break;
   } else {
    $$01214 = $$113; //@line 9591
    label = 5; //@line 9592
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 9599
}
function _strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $2 = 0, $5 = 0;
 $2 = HEAP8[$1 >> 0] | 0; //@line 9615
 do {
  if (!($2 << 24 >> 24)) {
   $$0 = $0; //@line 9619
  } else {
   $5 = _strchr($0, $2 << 24 >> 24) | 0; //@line 9622
   if (!$5) {
    $$0 = 0; //@line 9625
   } else {
    if (!(HEAP8[$1 + 1 >> 0] | 0)) {
     $$0 = $5; //@line 9631
    } else {
     if (!(HEAP8[$5 + 1 >> 0] | 0)) {
      $$0 = 0; //@line 9637
     } else {
      if (!(HEAP8[$1 + 2 >> 0] | 0)) {
       $$0 = _twobyte_strstr($5, $1) | 0; //@line 9644
       break;
      }
      if (!(HEAP8[$5 + 2 >> 0] | 0)) {
       $$0 = 0; //@line 9651
      } else {
       if (!(HEAP8[$1 + 3 >> 0] | 0)) {
        $$0 = _threebyte_strstr($5, $1) | 0; //@line 9658
        break;
       }
       if (!(HEAP8[$5 + 3 >> 0] | 0)) {
        $$0 = 0; //@line 9665
       } else {
        if (!(HEAP8[$1 + 4 >> 0] | 0)) {
         $$0 = _fourbyte_strstr($5, $1) | 0; //@line 9672
         break;
        } else {
         $$0 = _twoway_strstr($5, $1) | 0; //@line 9676
         break;
        }
       }
      }
     }
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 9686
}
function _mbed_vtracef__async_cb_14($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 13341
 $3 = HEAP32[54] | 0; //@line 13345
 if (HEAP8[$0 + 4 >> 0] & 1 & ($3 | 0) != 0) {
  $5 = HEAP32[46] | 0; //@line 13349
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 13350
  FUNCTION_TABLE_vi[$3 & 127]($5); //@line 13351
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 20; //@line 13354
   sp = STACKTOP; //@line 13355
   return;
  }
  ___async_unwind = 0; //@line 13358
  HEAP32[$ReallocAsyncCtx2 >> 2] = 20; //@line 13359
  sp = STACKTOP; //@line 13360
  return;
 } else {
  $6 = HEAP32[53] | 0; //@line 13363
  $7 = HEAP32[46] | 0; //@line 13364
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 13365
  FUNCTION_TABLE_vi[$6 & 127]($7); //@line 13366
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 22; //@line 13369
   sp = STACKTOP; //@line 13370
   return;
  }
  ___async_unwind = 0; //@line 13373
  HEAP32[$ReallocAsyncCtx4 >> 2] = 22; //@line 13374
  sp = STACKTOP; //@line 13375
  return;
 }
}
function _fourbyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$lcssa = 0, $$sink21$lcssa = 0, $$sink2123 = 0, $18 = 0, $32 = 0, $33 = 0, $35 = 0, $39 = 0, $40 = 0, $41 = 0;
 $18 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8 | (HEAPU8[$1 + 3 >> 0] | 0); //@line 9811
 $32 = $0 + 3 | 0; //@line 9825
 $33 = HEAP8[$32 >> 0] | 0; //@line 9826
 $35 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | (HEAPU8[$0 + 2 >> 0] | 0) << 8 | $33 & 255; //@line 9828
 if ($33 << 24 >> 24 == 0 | ($35 | 0) == ($18 | 0)) {
  $$lcssa = $33; //@line 9833
  $$sink21$lcssa = $32; //@line 9833
 } else {
  $$sink2123 = $32; //@line 9835
  $39 = $35; //@line 9835
  while (1) {
   $40 = $$sink2123 + 1 | 0; //@line 9838
   $41 = HEAP8[$40 >> 0] | 0; //@line 9839
   $39 = $39 << 8 | $41 & 255; //@line 9841
   if ($41 << 24 >> 24 == 0 | ($39 | 0) == ($18 | 0)) {
    $$lcssa = $41; //@line 9846
    $$sink21$lcssa = $40; //@line 9846
    break;
   } else {
    $$sink2123 = $40; //@line 9849
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$sink21$lcssa + -3 | 0 : 0) | 0; //@line 9856
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1825
 $2 = $0 + 12 | 0; //@line 1827
 $3 = HEAP32[$2 >> 2] | 0; //@line 1828
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1832
   _mbed_assert_internal(1392, 1397, 528); //@line 1833
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 53; //@line 1836
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 1838
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1840
    sp = STACKTOP; //@line 1841
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1844
    $8 = HEAP32[$2 >> 2] | 0; //@line 1846
    break;
   }
  } else {
   $8 = $3; //@line 1850
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 1853
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1855
 FUNCTION_TABLE_vi[$7 & 127]($0); //@line 1856
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 54; //@line 1859
  sp = STACKTOP; //@line 1860
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1863
  return;
 }
}
function _threebyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$016$lcssa = 0, $$01618 = 0, $$019 = 0, $$lcssa = 0, $14 = 0, $23 = 0, $24 = 0, $27 = 0, $30 = 0, $31 = 0;
 $14 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8; //@line 9745
 $23 = $0 + 2 | 0; //@line 9754
 $24 = HEAP8[$23 >> 0] | 0; //@line 9755
 $27 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | ($24 & 255) << 8; //@line 9758
 if (($27 | 0) == ($14 | 0) | $24 << 24 >> 24 == 0) {
  $$016$lcssa = $23; //@line 9763
  $$lcssa = $24; //@line 9763
 } else {
  $$01618 = $23; //@line 9765
  $$019 = $27; //@line 9765
  while (1) {
   $30 = $$01618 + 1 | 0; //@line 9767
   $31 = HEAP8[$30 >> 0] | 0; //@line 9768
   $$019 = ($$019 | $31 & 255) << 8; //@line 9771
   if (($$019 | 0) == ($14 | 0) | $31 << 24 >> 24 == 0) {
    $$016$lcssa = $30; //@line 9776
    $$lcssa = $31; //@line 9776
    break;
   } else {
    $$01618 = $30; //@line 9779
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$016$lcssa + -2 | 0 : 0) | 0; //@line 9786
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11964
 STACKTOP = STACKTOP + 16 | 0; //@line 11965
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11965
 $3 = sp; //@line 11966
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 11968
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 11971
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 11972
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 11973
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 124; //@line 11976
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 11978
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 11980
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 11982
  sp = STACKTOP; //@line 11983
  STACKTOP = sp; //@line 11984
  return 0; //@line 11984
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 11986
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 11990
 }
 STACKTOP = sp; //@line 11992
 return $8 & 1 | 0; //@line 11992
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 9373
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 9373
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 9374
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 9375
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 9384
    $$016 = $9; //@line 9387
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 9387
   } else {
    $$016 = $0; //@line 9389
    $storemerge = 0; //@line 9389
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 9391
   $$0 = $$016; //@line 9392
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 9396
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 9402
   HEAP32[tempDoublePtr >> 2] = $2; //@line 9405
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 9405
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 9406
  }
 }
 return +$$0;
}
function _mbed_vtracef__async_cb_11($0) {
 $0 = $0 | 0;
 var $$pre = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 13072
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13076
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 2) {
  return;
 }
 $5 = $4 + -1 | 0; //@line 13081
 $$pre = HEAP32[56] | 0; //@line 13082
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 13083
 FUNCTION_TABLE_v[$$pre & 0](); //@line 13084
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 29; //@line 13087
  $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 13088
  HEAP32[$6 >> 2] = $4; //@line 13089
  $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 13090
  HEAP32[$7 >> 2] = $5; //@line 13091
  sp = STACKTOP; //@line 13092
  return;
 }
 ___async_unwind = 0; //@line 13095
 HEAP32[$ReallocAsyncCtx9 >> 2] = 29; //@line 13096
 $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 13097
 HEAP32[$6 >> 2] = $4; //@line 13098
 $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 13099
 HEAP32[$7 >> 2] = $5; //@line 13100
 sp = STACKTOP; //@line 13101
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
 sp = STACKTOP; //@line 10973
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10979
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 10982
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10985
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10986
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 10987
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 108; //@line 10990
    sp = STACKTOP; //@line 10991
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10994
    break;
   }
  }
 } while (0);
 return;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1502
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1510
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1512
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1514
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1516
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1518
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1520
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1522
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 1533
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 1534
 HEAP32[$10 >> 2] = 0; //@line 1535
 HEAP32[$12 >> 2] = 0; //@line 1536
 HEAP32[$14 >> 2] = 0; //@line 1537
 HEAP32[$2 >> 2] = 0; //@line 1538
 $33 = HEAP32[$16 >> 2] | 0; //@line 1539
 HEAP32[$16 >> 2] = $33 | $18; //@line 1544
 if ($20 | 0) {
  ___unlockfile($22); //@line 1547
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 1550
 return;
}
function _mbed_vtracef__async_cb_10($0) {
 $0 = $0 | 0;
 var $$pre = 0, $2 = 0, $4 = 0, $5 = 0, $6 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 13039
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13041
 if (($2 | 0) <= 1) {
  return;
 }
 $4 = $2 + -1 | 0; //@line 13046
 $$pre = HEAP32[56] | 0; //@line 13047
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 13048
 FUNCTION_TABLE_v[$$pre & 0](); //@line 13049
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 29; //@line 13052
  $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 13053
  HEAP32[$5 >> 2] = $2; //@line 13054
  $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 13055
  HEAP32[$6 >> 2] = $4; //@line 13056
  sp = STACKTOP; //@line 13057
  return;
 }
 ___async_unwind = 0; //@line 13060
 HEAP32[$ReallocAsyncCtx9 >> 2] = 29; //@line 13061
 $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 13062
 HEAP32[$5 >> 2] = $2; //@line 13063
 $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 13064
 HEAP32[$6 >> 2] = $4; //@line 13065
 sp = STACKTOP; //@line 13066
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
 sp = STACKTOP; //@line 11874
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 11876
 $8 = $7 >> 8; //@line 11877
 if (!($7 & 1)) {
  $$0 = $8; //@line 11881
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 11886
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 11888
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 11891
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11896
 FUNCTION_TABLE_viiiiii[$17 & 3]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 11897
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 122; //@line 11900
  sp = STACKTOP; //@line 11901
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11904
  return;
 }
}
function __Znwj($0) {
 $0 = $0 | 0;
 var $$ = 0, $$lcssa = 0, $2 = 0, $4 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10433
 $$ = ($0 | 0) == 0 ? 1 : $0; //@line 10435
 while (1) {
  $2 = _malloc($$) | 0; //@line 10437
  if ($2 | 0) {
   $$lcssa = $2; //@line 10440
   label = 7; //@line 10441
   break;
  }
  $4 = __ZSt15get_new_handlerv() | 0; //@line 10444
  if (!$4) {
   $$lcssa = 0; //@line 10447
   label = 7; //@line 10448
   break;
  }
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 10451
  FUNCTION_TABLE_v[$4 & 0](); //@line 10452
  if (___async) {
   label = 5; //@line 10455
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 10458
 }
 if ((label | 0) == 5) {
  HEAP32[$AsyncCtx >> 2] = 103; //@line 10461
  HEAP32[$AsyncCtx + 4 >> 2] = $$; //@line 10463
  sp = STACKTOP; //@line 10464
  return 0; //@line 10465
 } else if ((label | 0) == 7) {
  return $$lcssa | 0; //@line 10468
 }
 return 0; //@line 10470
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11142
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 11148
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 11151
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 11154
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11155
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 11156
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 111; //@line 11159
    sp = STACKTOP; //@line 11160
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 11163
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
 sp = STACKTOP; //@line 11916
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 11918
 $7 = $6 >> 8; //@line 11919
 if (!($6 & 1)) {
  $$0 = $7; //@line 11923
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 11928
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 11930
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 11933
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11938
 FUNCTION_TABLE_viiiii[$16 & 3]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 11939
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 123; //@line 11942
  sp = STACKTOP; //@line 11943
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11946
  return;
 }
}
function _mbed_error_vfprintf__async_cb_76($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1799
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 1801
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1803
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1805
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1807
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1809
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 1811
 _serial_putc(4140, $2 << 24 >> 24); //@line 1812
 if (!___async) {
  ___async_unwind = 0; //@line 1815
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 50; //@line 1817
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 1819
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 1821
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $8; //@line 1823
 HEAP8[$ReallocAsyncCtx2 + 16 >> 0] = $2; //@line 1825
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 1827
 sp = STACKTOP; //@line 1828
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11831
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 11833
 $6 = $5 >> 8; //@line 11834
 if (!($5 & 1)) {
  $$0 = $6; //@line 11838
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 11843
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 11845
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 11848
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11853
 FUNCTION_TABLE_viiii[$15 & 3]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 11854
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 121; //@line 11857
  sp = STACKTOP; //@line 11858
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11861
  return;
 }
}
function ___dynamic_cast__async_cb_62($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 209
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 211
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 213
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 219
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 234
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 250
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 255
    break;
   }
  default:
   {
    $$0 = 0; //@line 259
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 264
 return;
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 8371
 STACKTOP = STACKTOP + 256 | 0; //@line 8372
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 8372
 $5 = sp; //@line 8373
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 8379
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 8383
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 8386
   $$011 = $9; //@line 8387
   do {
    _out_670($0, $5, 256); //@line 8389
    $$011 = $$011 + -256 | 0; //@line 8390
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 8399
  } else {
   $$0$lcssa = $9; //@line 8401
  }
  _out_670($0, $5, $$0$lcssa); //@line 8403
 }
 STACKTOP = sp; //@line 8405
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5666
 STACKTOP = STACKTOP + 32 | 0; //@line 5667
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 5667
 $vararg_buffer = sp; //@line 5668
 $3 = sp + 20 | 0; //@line 5669
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 5673
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 5675
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 5677
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 5679
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 5681
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 5686
  $10 = -1; //@line 5687
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 5690
 }
 STACKTOP = sp; //@line 5692
 return $10 | 0; //@line 5692
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 1300
 STACKTOP = STACKTOP + 16 | 0; //@line 1301
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1301
 $vararg_buffer = sp; //@line 1302
 HEAP32[$vararg_buffer >> 2] = $0; //@line 1303
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 1305
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 1307
 _mbed_error_printf(1269, $vararg_buffer); //@line 1308
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1309
 _mbed_die(); //@line 1310
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 30; //@line 1313
  sp = STACKTOP; //@line 1314
  STACKTOP = sp; //@line 1315
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1317
  STACKTOP = sp; //@line 1318
  return;
 }
}
function _snprintf($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10250
 STACKTOP = STACKTOP + 16 | 0; //@line 10251
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10251
 $3 = sp; //@line 10252
 HEAP32[$3 >> 2] = $varargs; //@line 10253
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 10254
 $4 = _vsnprintf($0, $1, $2, $3) | 0; //@line 10255
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 100; //@line 10258
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 10260
  sp = STACKTOP; //@line 10261
  STACKTOP = sp; //@line 10262
  return 0; //@line 10262
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 10264
  STACKTOP = sp; //@line 10265
  return $4 | 0; //@line 10265
 }
 return 0; //@line 10267
}
function _mbed_vtracef__async_cb_9($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 13009
 HEAP32[50] = HEAP32[48]; //@line 13011
 $2 = HEAP32[56] | 0; //@line 13012
 if (!$2) {
  return;
 }
 $4 = HEAP32[57] | 0; //@line 13017
 HEAP32[57] = 0; //@line 13018
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 13019
 FUNCTION_TABLE_v[$2 & 0](); //@line 13020
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 28; //@line 13023
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 13024
  HEAP32[$5 >> 2] = $4; //@line 13025
  sp = STACKTOP; //@line 13026
  return;
 }
 ___async_unwind = 0; //@line 13029
 HEAP32[$ReallocAsyncCtx8 >> 2] = 28; //@line 13030
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 13031
 HEAP32[$5 >> 2] = $4; //@line 13032
 sp = STACKTOP; //@line 13033
 return;
}
function _mbed_vtracef__async_cb_6($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 12745
 HEAP32[50] = HEAP32[48]; //@line 12747
 $2 = HEAP32[56] | 0; //@line 12748
 if (!$2) {
  return;
 }
 $4 = HEAP32[57] | 0; //@line 12753
 HEAP32[57] = 0; //@line 12754
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 12755
 FUNCTION_TABLE_v[$2 & 0](); //@line 12756
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 28; //@line 12759
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 12760
  HEAP32[$5 >> 2] = $4; //@line 12761
  sp = STACKTOP; //@line 12762
  return;
 }
 ___async_unwind = 0; //@line 12765
 HEAP32[$ReallocAsyncCtx8 >> 2] = 28; //@line 12766
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 12767
 HEAP32[$5 >> 2] = $4; //@line 12768
 sp = STACKTOP; //@line 12769
 return;
}
function _mbed_vtracef__async_cb_5($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 12715
 HEAP32[50] = HEAP32[48]; //@line 12717
 $2 = HEAP32[56] | 0; //@line 12718
 if (!$2) {
  return;
 }
 $4 = HEAP32[57] | 0; //@line 12723
 HEAP32[57] = 0; //@line 12724
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 12725
 FUNCTION_TABLE_v[$2 & 0](); //@line 12726
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 28; //@line 12729
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 12730
  HEAP32[$5 >> 2] = $4; //@line 12731
  sp = STACKTOP; //@line 12732
  return;
 }
 ___async_unwind = 0; //@line 12735
 HEAP32[$ReallocAsyncCtx8 >> 2] = 28; //@line 12736
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 12737
 HEAP32[$5 >> 2] = $4; //@line 12738
 sp = STACKTOP; //@line 12739
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 10695
 $5 = HEAP32[$4 >> 2] | 0; //@line 10696
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 10700
   HEAP32[$1 + 24 >> 2] = $3; //@line 10702
   HEAP32[$1 + 36 >> 2] = 1; //@line 10704
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 10708
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 10711
    HEAP32[$1 + 24 >> 2] = 2; //@line 10713
    HEAP8[$1 + 54 >> 0] = 1; //@line 10715
    break;
   }
   $10 = $1 + 24 | 0; //@line 10718
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 10722
   }
  }
 } while (0);
 return;
}
function __Znwj__async_cb($0) {
 $0 = $0 | 0;
 var $$lcssa = 0, $2 = 0, $3 = 0, $5 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13382
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13384
 $3 = _malloc($2) | 0; //@line 13385
 if (!$3) {
  $5 = __ZSt15get_new_handlerv() | 0; //@line 13388
  if (!$5) {
   $$lcssa = 0; //@line 13391
  } else {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 13393
   FUNCTION_TABLE_v[$5 & 0](); //@line 13394
   if (!___async) {
    ___async_unwind = 0; //@line 13397
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 103; //@line 13399
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 13401
   sp = STACKTOP; //@line 13402
   return;
  }
 } else {
  $$lcssa = $3; //@line 13406
 }
 HEAP32[___async_retval >> 2] = $$lcssa; //@line 13409
 return;
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 5773
 $3 = HEAP8[$1 >> 0] | 0; //@line 5774
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 5779
  $$lcssa8 = $2; //@line 5779
 } else {
  $$011 = $1; //@line 5781
  $$0710 = $0; //@line 5781
  do {
   $$0710 = $$0710 + 1 | 0; //@line 5783
   $$011 = $$011 + 1 | 0; //@line 5784
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 5785
   $9 = HEAP8[$$011 >> 0] | 0; //@line 5786
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 5791
  $$lcssa8 = $8; //@line 5791
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 5801
}
function _memcmp($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $14 = 0, $4 = 0, $5 = 0;
 L1 : do {
  if (!$2) {
   $14 = 0; //@line 10215
  } else {
   $$01318 = $0; //@line 10217
   $$01417 = $2; //@line 10217
   $$019 = $1; //@line 10217
   while (1) {
    $4 = HEAP8[$$01318 >> 0] | 0; //@line 10219
    $5 = HEAP8[$$019 >> 0] | 0; //@line 10220
    if ($4 << 24 >> 24 != $5 << 24 >> 24) {
     break;
    }
    $$01417 = $$01417 + -1 | 0; //@line 10225
    if (!$$01417) {
     $14 = 0; //@line 10230
     break L1;
    } else {
     $$01318 = $$01318 + 1 | 0; //@line 10233
     $$019 = $$019 + 1 | 0; //@line 10233
    }
   }
   $14 = ($4 & 255) - ($5 & 255) | 0; //@line 10239
  }
 } while (0);
 return $14 | 0; //@line 10242
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1797
 $2 = HEAP32[58] | 0; //@line 1798
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1799
 _putc($1, $2) | 0; //@line 1800
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 51; //@line 1803
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 1805
  sp = STACKTOP; //@line 1806
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1809
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1810
 _fflush($2) | 0; //@line 1811
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 52; //@line 1814
  sp = STACKTOP; //@line 1815
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1818
  return;
 }
}
function _mbed_die__async_cb_29($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 13883
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13885
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13887
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 13888
 _wait_ms(150); //@line 13889
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 32; //@line 13892
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 13893
  HEAP32[$4 >> 2] = $2; //@line 13894
  sp = STACKTOP; //@line 13895
  return;
 }
 ___async_unwind = 0; //@line 13898
 HEAP32[$ReallocAsyncCtx15 >> 2] = 32; //@line 13899
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 13900
 HEAP32[$4 >> 2] = $2; //@line 13901
 sp = STACKTOP; //@line 13902
 return;
}
function _mbed_die__async_cb_28($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 13858
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13860
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13862
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 13863
 _wait_ms(150); //@line 13864
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 33; //@line 13867
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 13868
  HEAP32[$4 >> 2] = $2; //@line 13869
  sp = STACKTOP; //@line 13870
  return;
 }
 ___async_unwind = 0; //@line 13873
 HEAP32[$ReallocAsyncCtx14 >> 2] = 33; //@line 13874
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 13875
 HEAP32[$4 >> 2] = $2; //@line 13876
 sp = STACKTOP; //@line 13877
 return;
}
function _mbed_die__async_cb_27($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 13833
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13835
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13837
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 13838
 _wait_ms(150); //@line 13839
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 34; //@line 13842
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 13843
  HEAP32[$4 >> 2] = $2; //@line 13844
  sp = STACKTOP; //@line 13845
  return;
 }
 ___async_unwind = 0; //@line 13848
 HEAP32[$ReallocAsyncCtx13 >> 2] = 34; //@line 13849
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 13850
 HEAP32[$4 >> 2] = $2; //@line 13851
 sp = STACKTOP; //@line 13852
 return;
}
function _mbed_die__async_cb_26($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 13808
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13810
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13812
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 13813
 _wait_ms(150); //@line 13814
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 35; //@line 13817
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 13818
  HEAP32[$4 >> 2] = $2; //@line 13819
  sp = STACKTOP; //@line 13820
  return;
 }
 ___async_unwind = 0; //@line 13823
 HEAP32[$ReallocAsyncCtx12 >> 2] = 35; //@line 13824
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 13825
 HEAP32[$4 >> 2] = $2; //@line 13826
 sp = STACKTOP; //@line 13827
 return;
}
function _mbed_die__async_cb_25($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 13783
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13785
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13787
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 13788
 _wait_ms(150); //@line 13789
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 36; //@line 13792
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 13793
  HEAP32[$4 >> 2] = $2; //@line 13794
  sp = STACKTOP; //@line 13795
  return;
 }
 ___async_unwind = 0; //@line 13798
 HEAP32[$ReallocAsyncCtx11 >> 2] = 36; //@line 13799
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 13800
 HEAP32[$4 >> 2] = $2; //@line 13801
 sp = STACKTOP; //@line 13802
 return;
}
function _mbed_die__async_cb_24($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 13758
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13760
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13762
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 13763
 _wait_ms(150); //@line 13764
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 37; //@line 13767
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 13768
  HEAP32[$4 >> 2] = $2; //@line 13769
  sp = STACKTOP; //@line 13770
  return;
 }
 ___async_unwind = 0; //@line 13773
 HEAP32[$ReallocAsyncCtx10 >> 2] = 37; //@line 13774
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 13775
 HEAP32[$4 >> 2] = $2; //@line 13776
 sp = STACKTOP; //@line 13777
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 13508
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13510
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13512
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 13513
 _wait_ms(150); //@line 13514
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 31; //@line 13517
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 13518
  HEAP32[$4 >> 2] = $2; //@line 13519
  sp = STACKTOP; //@line 13520
  return;
 }
 ___async_unwind = 0; //@line 13523
 HEAP32[$ReallocAsyncCtx16 >> 2] = 31; //@line 13524
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 13525
 HEAP32[$4 >> 2] = $2; //@line 13526
 sp = STACKTOP; //@line 13527
 return;
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5725
 STACKTOP = STACKTOP + 32 | 0; //@line 5726
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 5726
 $vararg_buffer = sp; //@line 5727
 HEAP32[$0 + 36 >> 2] = 5; //@line 5730
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 5738
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 5740
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 5742
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 5747
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 5750
 STACKTOP = sp; //@line 5751
 return $14 | 0; //@line 5751
}
function _mbed_die__async_cb_23($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 13733
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13735
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13737
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 13738
 _wait_ms(150); //@line 13739
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 38; //@line 13742
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 13743
  HEAP32[$4 >> 2] = $2; //@line 13744
  sp = STACKTOP; //@line 13745
  return;
 }
 ___async_unwind = 0; //@line 13748
 HEAP32[$ReallocAsyncCtx9 >> 2] = 38; //@line 13749
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 13750
 HEAP32[$4 >> 2] = $2; //@line 13751
 sp = STACKTOP; //@line 13752
 return;
}
function _mbed_die__async_cb_22($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 13708
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13710
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13712
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 13713
 _wait_ms(400); //@line 13714
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 39; //@line 13717
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 13718
  HEAP32[$4 >> 2] = $2; //@line 13719
  sp = STACKTOP; //@line 13720
  return;
 }
 ___async_unwind = 0; //@line 13723
 HEAP32[$ReallocAsyncCtx8 >> 2] = 39; //@line 13724
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 13725
 HEAP32[$4 >> 2] = $2; //@line 13726
 sp = STACKTOP; //@line 13727
 return;
}
function _mbed_die__async_cb_21($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 13683
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13685
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13687
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 13688
 _wait_ms(400); //@line 13689
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 40; //@line 13692
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 13693
  HEAP32[$4 >> 2] = $2; //@line 13694
  sp = STACKTOP; //@line 13695
  return;
 }
 ___async_unwind = 0; //@line 13698
 HEAP32[$ReallocAsyncCtx7 >> 2] = 40; //@line 13699
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 13700
 HEAP32[$4 >> 2] = $2; //@line 13701
 sp = STACKTOP; //@line 13702
 return;
}
function _mbed_die__async_cb_20($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 13658
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13660
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13662
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 13663
 _wait_ms(400); //@line 13664
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 41; //@line 13667
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 13668
  HEAP32[$4 >> 2] = $2; //@line 13669
  sp = STACKTOP; //@line 13670
  return;
 }
 ___async_unwind = 0; //@line 13673
 HEAP32[$ReallocAsyncCtx6 >> 2] = 41; //@line 13674
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 13675
 HEAP32[$4 >> 2] = $2; //@line 13676
 sp = STACKTOP; //@line 13677
 return;
}
function _mbed_die__async_cb_19($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 13633
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13635
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13637
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 13638
 _wait_ms(400); //@line 13639
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 42; //@line 13642
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 13643
  HEAP32[$4 >> 2] = $2; //@line 13644
  sp = STACKTOP; //@line 13645
  return;
 }
 ___async_unwind = 0; //@line 13648
 HEAP32[$ReallocAsyncCtx5 >> 2] = 42; //@line 13649
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 13650
 HEAP32[$4 >> 2] = $2; //@line 13651
 sp = STACKTOP; //@line 13652
 return;
}
function _mbed_die__async_cb_18($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 13608
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13610
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13612
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 13613
 _wait_ms(400); //@line 13614
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 43; //@line 13617
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 13618
  HEAP32[$4 >> 2] = $2; //@line 13619
  sp = STACKTOP; //@line 13620
  return;
 }
 ___async_unwind = 0; //@line 13623
 HEAP32[$ReallocAsyncCtx4 >> 2] = 43; //@line 13624
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 13625
 HEAP32[$4 >> 2] = $2; //@line 13626
 sp = STACKTOP; //@line 13627
 return;
}
function _mbed_die__async_cb_17($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13583
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13585
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13587
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 13588
 _wait_ms(400); //@line 13589
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 44; //@line 13592
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 13593
  HEAP32[$4 >> 2] = $2; //@line 13594
  sp = STACKTOP; //@line 13595
  return;
 }
 ___async_unwind = 0; //@line 13598
 HEAP32[$ReallocAsyncCtx3 >> 2] = 44; //@line 13599
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 13600
 HEAP32[$4 >> 2] = $2; //@line 13601
 sp = STACKTOP; //@line 13602
 return;
}
function _mbed_die__async_cb_16($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13558
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13560
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13562
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 13563
 _wait_ms(400); //@line 13564
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 45; //@line 13567
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 13568
  HEAP32[$4 >> 2] = $2; //@line 13569
  sp = STACKTOP; //@line 13570
  return;
 }
 ___async_unwind = 0; //@line 13573
 HEAP32[$ReallocAsyncCtx2 >> 2] = 45; //@line 13574
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 13575
 HEAP32[$4 >> 2] = $2; //@line 13576
 sp = STACKTOP; //@line 13577
 return;
}
function _mbed_die__async_cb_15($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13533
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13535
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13537
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 13538
 _wait_ms(400); //@line 13539
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 46; //@line 13542
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 13543
  HEAP32[$4 >> 2] = $2; //@line 13544
  sp = STACKTOP; //@line 13545
  return;
 }
 ___async_unwind = 0; //@line 13548
 HEAP32[$ReallocAsyncCtx >> 2] = 46; //@line 13549
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 13550
 HEAP32[$4 >> 2] = $2; //@line 13551
 sp = STACKTOP; //@line 13552
 return;
}
function _mbed_tracef($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 602
 STACKTOP = STACKTOP + 16 | 0; //@line 603
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 603
 $3 = sp; //@line 604
 HEAP32[$3 >> 2] = $varargs; //@line 605
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 606
 _mbed_vtracef($0, $1, $2, $3); //@line 607
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 17; //@line 610
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 612
  sp = STACKTOP; //@line 613
  STACKTOP = sp; //@line 614
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 616
  STACKTOP = sp; //@line 617
  return;
 }
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1628
 STACKTOP = STACKTOP + 16 | 0; //@line 1629
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1629
 $1 = sp; //@line 1630
 HEAP32[$1 >> 2] = $varargs; //@line 1631
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1632
 _mbed_error_vfprintf($0, $1); //@line 1633
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 47; //@line 1636
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 1638
  sp = STACKTOP; //@line 1639
  STACKTOP = sp; //@line 1640
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1642
  STACKTOP = sp; //@line 1643
  return;
 }
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 2293
 newDynamicTop = oldDynamicTop + increment | 0; //@line 2294
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 2298
  ___setErrNo(12); //@line 2299
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 2303
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 2307
   ___setErrNo(12); //@line 2308
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 2312
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 5896
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 5898
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 5904
  $11 = ___fwritex($0, $4, $3) | 0; //@line 5905
  if ($phitmp) {
   $13 = $11; //@line 5907
  } else {
   ___unlockfile($3); //@line 5909
   $13 = $11; //@line 5910
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 5914
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 5918
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 5921
 }
 return $15 | 0; //@line 5923
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 8232
 } else {
  $$056 = $2; //@line 8234
  $15 = $1; //@line 8234
  $8 = $0; //@line 8234
  while (1) {
   $14 = $$056 + -1 | 0; //@line 8242
   HEAP8[$14 >> 0] = HEAPU8[1997 + ($8 & 15) >> 0] | 0 | $3; //@line 8243
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 8244
   $15 = tempRet0; //@line 8245
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 8250
    break;
   } else {
    $$056 = $14; //@line 8253
   }
  }
 }
 return $$05$lcssa | 0; //@line 8257
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 6113
 $3 = HEAP8[$1 >> 0] | 0; //@line 6115
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 6119
 $7 = HEAP32[$0 >> 2] | 0; //@line 6120
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 6125
  HEAP32[$0 + 4 >> 2] = 0; //@line 6127
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 6129
  HEAP32[$0 + 28 >> 2] = $14; //@line 6131
  HEAP32[$0 + 20 >> 2] = $14; //@line 6133
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 6139
  $$0 = 0; //@line 6140
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 6143
  $$0 = -1; //@line 6144
 }
 return $$0 | 0; //@line 6146
}
function _twobyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$sink$in = 0, $$sink17$sink = 0, $11 = 0, $12 = 0, $8 = 0;
 $8 = (HEAPU8[$1 >> 0] | 0) << 8 | (HEAPU8[$1 + 1 >> 0] | 0); //@line 9700
 $$sink$in = HEAPU8[$0 >> 0] | 0; //@line 9703
 $$sink17$sink = $0; //@line 9703
 while (1) {
  $11 = $$sink17$sink + 1 | 0; //@line 9705
  $12 = HEAP8[$11 >> 0] | 0; //@line 9706
  if (!($12 << 24 >> 24)) {
   break;
  }
  $$sink$in = $$sink$in << 8 & 65280 | $12 & 255; //@line 9714
  if (($$sink$in | 0) == ($8 | 0)) {
   break;
  } else {
   $$sink17$sink = $11; //@line 9719
  }
 }
 return ($12 << 24 >> 24 ? $$sink17$sink : 0) | 0; //@line 9724
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 8269
 } else {
  $$06 = $2; //@line 8271
  $11 = $1; //@line 8271
  $7 = $0; //@line 8271
  while (1) {
   $10 = $$06 + -1 | 0; //@line 8276
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 8277
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 8278
   $11 = tempRet0; //@line 8279
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 8284
    break;
   } else {
    $$06 = $10; //@line 8287
   }
  }
 }
 return $$0$lcssa | 0; //@line 8291
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11997
 do {
  if (!$0) {
   $3 = 0; //@line 12001
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 12003
   $2 = ___dynamic_cast($0, 56, 112, 0) | 0; //@line 12004
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 125; //@line 12007
    sp = STACKTOP; //@line 12008
    return 0; //@line 12009
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12011
    $3 = ($2 | 0) != 0 & 1; //@line 12014
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 12019
}
function _invoke_ticker__async_cb_69($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1030
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 1036
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 1037
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 1038
 FUNCTION_TABLE_vi[$5 & 127]($6); //@line 1039
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 54; //@line 1042
  sp = STACKTOP; //@line 1043
  return;
 }
 ___async_unwind = 0; //@line 1046
 HEAP32[$ReallocAsyncCtx >> 2] = 54; //@line 1047
 sp = STACKTOP; //@line 1048
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 7913
 } else {
  $$04 = 0; //@line 7915
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 7918
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 7922
   $12 = $7 + 1 | 0; //@line 7923
   HEAP32[$0 >> 2] = $12; //@line 7924
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 7930
    break;
   } else {
    $$04 = $11; //@line 7933
   }
  }
 }
 return $$0$lcssa | 0; //@line 7937
}
function _mbed_vtracef__async_cb_4($0) {
 $0 = $0 | 0;
 var $1 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 12697
 $1 = HEAP32[54] | 0; //@line 12698
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 12699
 FUNCTION_TABLE_vi[$1 & 127](1154); //@line 12700
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 21; //@line 12703
  sp = STACKTOP; //@line 12704
  return;
 }
 ___async_unwind = 0; //@line 12707
 HEAP32[$ReallocAsyncCtx3 >> 2] = 21; //@line 12708
 sp = STACKTOP; //@line 12709
 return;
}
function ___fflush_unlocked__async_cb_63($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 336
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 338
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 340
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 342
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 344
 HEAP32[$4 >> 2] = 0; //@line 345
 HEAP32[$6 >> 2] = 0; //@line 346
 HEAP32[$8 >> 2] = 0; //@line 347
 HEAP32[$10 >> 2] = 0; //@line 348
 HEAP32[___async_retval >> 2] = 0; //@line 350
 return;
}
function __ZN4mbed6BusOutaSEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 564
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 565
 __ZN4mbed6BusOut5writeEi($0, $1); //@line 566
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 15; //@line 569
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 571
  sp = STACKTOP; //@line 572
  return 0; //@line 573
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 575
  return $0 | 0; //@line 576
 }
 return 0; //@line 578
}
function _serial_putc__async_cb_74($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1585
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1587
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 1588
 _fflush($2) | 0; //@line 1589
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 52; //@line 1592
  sp = STACKTOP; //@line 1593
  return;
 }
 ___async_unwind = 0; //@line 1596
 HEAP32[$ReallocAsyncCtx >> 2] = 52; //@line 1597
 sp = STACKTOP; //@line 1598
 return;
}
function __GLOBAL__sub_I_main_cpp() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1914
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1915
 __ZN4mbed6BusOutC2E7PinNameS1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_(4148, 50, 52, 53, 55, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1); //@line 1916
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 57; //@line 1919
  sp = STACKTOP; //@line 1920
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1923
  return;
 }
}
function _emscripten_async_resume() {
 ___async = 0; //@line 2144
 ___async_unwind = 1; //@line 2145
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 2151
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 2155
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 2159
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 2161
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5536
 STACKTOP = STACKTOP + 16 | 0; //@line 5537
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 5537
 $vararg_buffer = sp; //@line 5538
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 5542
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 5544
 STACKTOP = sp; //@line 5545
 return $5 | 0; //@line 5545
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 2086
 STACKTOP = STACKTOP + 16 | 0; //@line 2087
 $rem = __stackBase__ | 0; //@line 2088
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 2089
 STACKTOP = __stackBase__; //@line 2090
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 2091
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 1856
 if ((ret | 0) < 8) return ret | 0; //@line 1857
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 1858
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 1859
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 1860
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 1861
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 1862
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10599
 }
 return;
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 10355
 $6 = HEAP32[$5 >> 2] | 0; //@line 10356
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 10357
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 10359
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 10361
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 10364
 return $2 | 0; //@line 10365
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1007
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 1010
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 1015
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 1018
 return;
}
function _wait($0) {
 $0 = +$0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1880
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1884
 _emscripten_sleep((~~($0 * 1.0e6) | 0) / 1e3 | 0 | 0); //@line 1885
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 55; //@line 1888
  sp = STACKTOP; //@line 1889
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1892
  return;
 }
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 921
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 932
  $$0 = 1; //@line 933
 } else {
  $$0 = 0; //@line 935
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 939
 return;
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 1776
 HEAP32[$0 >> 2] = $1; //@line 1777
 HEAP32[1034] = 1; //@line 1778
 $4 = $0; //@line 1779
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 1784
 $10 = 4140; //@line 1785
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 1787
 HEAP32[$10 + 4 >> 2] = $9; //@line 1790
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 10675
 }
 return;
}
function _main__async_cb_60($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 14342
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(4) | 0; //@line 14343
 __ZN4mbed6BusOutaSEi(4148, 1) | 0; //@line 14344
 if (!___async) {
  ___async_unwind = 0; //@line 14347
 }
 HEAP32[$ReallocAsyncCtx15 >> 2] = 60; //@line 14349
 sp = STACKTOP; //@line 14350
 return;
}
function _main__async_cb_59($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 14328
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(4) | 0; //@line 14329
 __ZN4mbed6BusOutaSEi(4148, 2) | 0; //@line 14330
 if (!___async) {
  ___async_unwind = 0; //@line 14333
 }
 HEAP32[$ReallocAsyncCtx14 >> 2] = 62; //@line 14335
 sp = STACKTOP; //@line 14336
 return;
}
function _main__async_cb_58($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 14314
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(4) | 0; //@line 14315
 __ZN4mbed6BusOutaSEi(4148, 3) | 0; //@line 14316
 if (!___async) {
  ___async_unwind = 0; //@line 14319
 }
 HEAP32[$ReallocAsyncCtx13 >> 2] = 64; //@line 14321
 sp = STACKTOP; //@line 14322
 return;
}
function _main__async_cb_57($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 14300
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(4) | 0; //@line 14301
 __ZN4mbed6BusOutaSEi(4148, 4) | 0; //@line 14302
 if (!___async) {
  ___async_unwind = 0; //@line 14305
 }
 HEAP32[$ReallocAsyncCtx12 >> 2] = 66; //@line 14307
 sp = STACKTOP; //@line 14308
 return;
}
function _main__async_cb_56($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 14286
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(4) | 0; //@line 14287
 __ZN4mbed6BusOutaSEi(4148, 5) | 0; //@line 14288
 if (!___async) {
  ___async_unwind = 0; //@line 14291
 }
 HEAP32[$ReallocAsyncCtx11 >> 2] = 68; //@line 14293
 sp = STACKTOP; //@line 14294
 return;
}
function _main__async_cb_55($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 14272
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(4) | 0; //@line 14273
 __ZN4mbed6BusOutaSEi(4148, 6) | 0; //@line 14274
 if (!___async) {
  ___async_unwind = 0; //@line 14277
 }
 HEAP32[$ReallocAsyncCtx10 >> 2] = 70; //@line 14279
 sp = STACKTOP; //@line 14280
 return;
}
function _main__async_cb_45($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 14132
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(4) | 0; //@line 14133
 __ZN4mbed6BusOutaSEi(4148, 0) | 0; //@line 14134
 if (!___async) {
  ___async_unwind = 0; //@line 14137
 }
 HEAP32[$ReallocAsyncCtx16 >> 2] = 58; //@line 14139
 sp = STACKTOP; //@line 14140
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1899
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1900
 _emscripten_sleep($0 | 0); //@line 1901
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 56; //@line 1904
  sp = STACKTOP; //@line 1905
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1908
  return;
 }
}
function _mbed_trace_default_print($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 583
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 584
 _puts($0) | 0; //@line 585
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 16; //@line 588
  sp = STACKTOP; //@line 589
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 592
  return;
 }
}
function _main__async_cb_51($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 14216
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(4) | 0; //@line 14217
 __ZN4mbed6BusOutaSEi(4148, 10) | 0; //@line 14218
 if (!___async) {
  ___async_unwind = 0; //@line 14221
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 78; //@line 14223
 sp = STACKTOP; //@line 14224
 return;
}
function _main__async_cb_50($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 14202
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(4) | 0; //@line 14203
 __ZN4mbed6BusOutaSEi(4148, 11) | 0; //@line 14204
 if (!___async) {
  ___async_unwind = 0; //@line 14207
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 80; //@line 14209
 sp = STACKTOP; //@line 14210
 return;
}
function _main__async_cb_49($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 14188
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 14189
 __ZN4mbed6BusOutaSEi(4148, 12) | 0; //@line 14190
 if (!___async) {
  ___async_unwind = 0; //@line 14193
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 82; //@line 14195
 sp = STACKTOP; //@line 14196
 return;
}
function _main__async_cb_48($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 14174
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 14175
 __ZN4mbed6BusOutaSEi(4148, 13) | 0; //@line 14176
 if (!___async) {
  ___async_unwind = 0; //@line 14179
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 84; //@line 14181
 sp = STACKTOP; //@line 14182
 return;
}
function _main__async_cb_47($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 14160
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 14161
 __ZN4mbed6BusOutaSEi(4148, 14) | 0; //@line 14162
 if (!___async) {
  ___async_unwind = 0; //@line 14165
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 86; //@line 14167
 sp = STACKTOP; //@line 14168
 return;
}
function _main__async_cb_54($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 14258
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(4) | 0; //@line 14259
 __ZN4mbed6BusOutaSEi(4148, 7) | 0; //@line 14260
 if (!___async) {
  ___async_unwind = 0; //@line 14263
 }
 HEAP32[$ReallocAsyncCtx9 >> 2] = 72; //@line 14265
 sp = STACKTOP; //@line 14266
 return;
}
function _main__async_cb_53($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 14244
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(4) | 0; //@line 14245
 __ZN4mbed6BusOutaSEi(4148, 8) | 0; //@line 14246
 if (!___async) {
  ___async_unwind = 0; //@line 14249
 }
 HEAP32[$ReallocAsyncCtx8 >> 2] = 74; //@line 14251
 sp = STACKTOP; //@line 14252
 return;
}
function _main__async_cb_52($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 14230
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 14231
 __ZN4mbed6BusOutaSEi(4148, 9) | 0; //@line 14232
 if (!___async) {
  ___async_unwind = 0; //@line 14235
 }
 HEAP32[$ReallocAsyncCtx7 >> 2] = 76; //@line 14237
 sp = STACKTOP; //@line 14238
 return;
}
function _main__async_cb_46($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14146
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 14147
 __ZN4mbed6BusOutaSEi(4148, 15) | 0; //@line 14148
 if (!___async) {
  ___async_unwind = 0; //@line 14151
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 88; //@line 14153
 sp = STACKTOP; //@line 14154
 return;
}
function _main__async_cb_44($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx32 = 0, sp = 0;
 sp = STACKTOP; //@line 14118
 $ReallocAsyncCtx32 = _emscripten_realloc_async_context(4) | 0; //@line 14119
 _wait(.25); //@line 14120
 if (!___async) {
  ___async_unwind = 0; //@line 14123
 }
 HEAP32[$ReallocAsyncCtx32 >> 2] = 59; //@line 14125
 sp = STACKTOP; //@line 14126
 return;
}
function _main__async_cb_43($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx31 = 0, sp = 0;
 sp = STACKTOP; //@line 14104
 $ReallocAsyncCtx31 = _emscripten_realloc_async_context(4) | 0; //@line 14105
 _wait(.25); //@line 14106
 if (!___async) {
  ___async_unwind = 0; //@line 14109
 }
 HEAP32[$ReallocAsyncCtx31 >> 2] = 61; //@line 14111
 sp = STACKTOP; //@line 14112
 return;
}
function _main__async_cb_42($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx30 = 0, sp = 0;
 sp = STACKTOP; //@line 14090
 $ReallocAsyncCtx30 = _emscripten_realloc_async_context(4) | 0; //@line 14091
 _wait(.25); //@line 14092
 if (!___async) {
  ___async_unwind = 0; //@line 14095
 }
 HEAP32[$ReallocAsyncCtx30 >> 2] = 63; //@line 14097
 sp = STACKTOP; //@line 14098
 return;
}
function _main__async_cb_41($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx29 = 0, sp = 0;
 sp = STACKTOP; //@line 14076
 $ReallocAsyncCtx29 = _emscripten_realloc_async_context(4) | 0; //@line 14077
 _wait(.25); //@line 14078
 if (!___async) {
  ___async_unwind = 0; //@line 14081
 }
 HEAP32[$ReallocAsyncCtx29 >> 2] = 65; //@line 14083
 sp = STACKTOP; //@line 14084
 return;
}
function _main__async_cb_40($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx28 = 0, sp = 0;
 sp = STACKTOP; //@line 14062
 $ReallocAsyncCtx28 = _emscripten_realloc_async_context(4) | 0; //@line 14063
 _wait(.25); //@line 14064
 if (!___async) {
  ___async_unwind = 0; //@line 14067
 }
 HEAP32[$ReallocAsyncCtx28 >> 2] = 67; //@line 14069
 sp = STACKTOP; //@line 14070
 return;
}
function _main__async_cb_39($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx27 = 0, sp = 0;
 sp = STACKTOP; //@line 14048
 $ReallocAsyncCtx27 = _emscripten_realloc_async_context(4) | 0; //@line 14049
 _wait(.25); //@line 14050
 if (!___async) {
  ___async_unwind = 0; //@line 14053
 }
 HEAP32[$ReallocAsyncCtx27 >> 2] = 69; //@line 14055
 sp = STACKTOP; //@line 14056
 return;
}
function _main__async_cb_38($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx26 = 0, sp = 0;
 sp = STACKTOP; //@line 14034
 $ReallocAsyncCtx26 = _emscripten_realloc_async_context(4) | 0; //@line 14035
 _wait(.25); //@line 14036
 if (!___async) {
  ___async_unwind = 0; //@line 14039
 }
 HEAP32[$ReallocAsyncCtx26 >> 2] = 71; //@line 14041
 sp = STACKTOP; //@line 14042
 return;
}
function _main__async_cb_37($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx25 = 0, sp = 0;
 sp = STACKTOP; //@line 14020
 $ReallocAsyncCtx25 = _emscripten_realloc_async_context(4) | 0; //@line 14021
 _wait(.25); //@line 14022
 if (!___async) {
  ___async_unwind = 0; //@line 14025
 }
 HEAP32[$ReallocAsyncCtx25 >> 2] = 73; //@line 14027
 sp = STACKTOP; //@line 14028
 return;
}
function _main__async_cb_36($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx24 = 0, sp = 0;
 sp = STACKTOP; //@line 14006
 $ReallocAsyncCtx24 = _emscripten_realloc_async_context(4) | 0; //@line 14007
 _wait(.25); //@line 14008
 if (!___async) {
  ___async_unwind = 0; //@line 14011
 }
 HEAP32[$ReallocAsyncCtx24 >> 2] = 75; //@line 14013
 sp = STACKTOP; //@line 14014
 return;
}
function _main__async_cb_35($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx23 = 0, sp = 0;
 sp = STACKTOP; //@line 13992
 $ReallocAsyncCtx23 = _emscripten_realloc_async_context(4) | 0; //@line 13993
 _wait(.25); //@line 13994
 if (!___async) {
  ___async_unwind = 0; //@line 13997
 }
 HEAP32[$ReallocAsyncCtx23 >> 2] = 77; //@line 13999
 sp = STACKTOP; //@line 14000
 return;
}
function _main__async_cb_34($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx22 = 0, sp = 0;
 sp = STACKTOP; //@line 13978
 $ReallocAsyncCtx22 = _emscripten_realloc_async_context(4) | 0; //@line 13979
 _wait(.25); //@line 13980
 if (!___async) {
  ___async_unwind = 0; //@line 13983
 }
 HEAP32[$ReallocAsyncCtx22 >> 2] = 79; //@line 13985
 sp = STACKTOP; //@line 13986
 return;
}
function _main__async_cb_33($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx21 = 0, sp = 0;
 sp = STACKTOP; //@line 13964
 $ReallocAsyncCtx21 = _emscripten_realloc_async_context(4) | 0; //@line 13965
 _wait(.25); //@line 13966
 if (!___async) {
  ___async_unwind = 0; //@line 13969
 }
 HEAP32[$ReallocAsyncCtx21 >> 2] = 81; //@line 13971
 sp = STACKTOP; //@line 13972
 return;
}
function _main__async_cb_32($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx20 = 0, sp = 0;
 sp = STACKTOP; //@line 13950
 $ReallocAsyncCtx20 = _emscripten_realloc_async_context(4) | 0; //@line 13951
 _wait(.25); //@line 13952
 if (!___async) {
  ___async_unwind = 0; //@line 13955
 }
 HEAP32[$ReallocAsyncCtx20 >> 2] = 83; //@line 13957
 sp = STACKTOP; //@line 13958
 return;
}
function _main__async_cb_31($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx19 = 0, sp = 0;
 sp = STACKTOP; //@line 13936
 $ReallocAsyncCtx19 = _emscripten_realloc_async_context(4) | 0; //@line 13937
 _wait(.25); //@line 13938
 if (!___async) {
  ___async_unwind = 0; //@line 13941
 }
 HEAP32[$ReallocAsyncCtx19 >> 2] = 85; //@line 13943
 sp = STACKTOP; //@line 13944
 return;
}
function _main__async_cb_30($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx18 = 0, sp = 0;
 sp = STACKTOP; //@line 13922
 $ReallocAsyncCtx18 = _emscripten_realloc_async_context(4) | 0; //@line 13923
 _wait(.25); //@line 13924
 if (!___async) {
  ___async_unwind = 0; //@line 13927
 }
 HEAP32[$ReallocAsyncCtx18 >> 2] = 87; //@line 13929
 sp = STACKTOP; //@line 13930
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx17 = 0, sp = 0;
 sp = STACKTOP; //@line 13908
 $ReallocAsyncCtx17 = _emscripten_realloc_async_context(4) | 0; //@line 13909
 _wait(.25); //@line 13910
 if (!___async) {
  ___async_unwind = 0; //@line 13913
 }
 HEAP32[$ReallocAsyncCtx17 >> 2] = 89; //@line 13915
 sp = STACKTOP; //@line 13916
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 10739
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 10743
  }
 }
 return;
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 2120
 HEAP32[new_frame + 4 >> 2] = sp; //@line 2122
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 2124
 ___async_cur_frame = new_frame; //@line 2125
 return ___async_cur_frame + 8 | 0; //@line 2126
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 14365
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 14369
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 14372
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 2109
  return low << bits; //@line 2110
 }
 tempRet0 = low << bits - 32; //@line 2112
 return 0; //@line 2113
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 2098
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 2099
 }
 tempRet0 = 0; //@line 2101
 return high >>> bits - 32 | 0; //@line 2102
}
function _fflush__async_cb_1($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12108
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 12110
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 12113
 return;
}
function stackAlloc(size) {
 size = size | 0;
 var ret = 0;
 ret = STACKTOP; //@line 4
 STACKTOP = STACKTOP + size | 0; //@line 5
 STACKTOP = STACKTOP + 15 & -16; //@line 6
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(size | 0); //@line 7
 return ret | 0; //@line 9
}
function _puts__async_cb($0) {
 $0 = $0 | 0;
 var $$lobit = 0;
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 1316
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 1319
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 1322
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 902
 } else {
  $$0 = -1; //@line 904
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 907
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 6243
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 6249
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 6253
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 2368
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 2132
 stackRestore(___async_cur_frame | 0); //@line 2133
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 2134
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1560
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 1561
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 1563
 return;
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 1752
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 1758
 _emscripten_asm_const_iii(3, $0 | 0, $1 | 0) | 0; //@line 1759
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 9354
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 9354
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 9356
 return $1 | 0; //@line 9357
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 5702
  $$0 = -1; //@line 5703
 } else {
  $$0 = $0; //@line 5705
 }
 return $$0 | 0; //@line 5707
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 1849
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 1850
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 1851
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 1841
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 1843
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 2361
}
function _handle_lora_downlink($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 __ZN16SX1276_LoRaRadio8rx_frameEPhjjhh($0, $1, $2, $3, $4, $5); //@line 56
 return;
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 2354
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 6388
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 6393
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 8414
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 8417
 }
 return $$0 | 0; //@line 8419
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 2333
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 2078
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 5883
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 5887
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 195
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 2139
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 2140
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 11180
 __ZdlPv($0); //@line 11181
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 10961
 __ZdlPv($0); //@line 10962
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 6379
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 6381
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 10489
 __ZdlPv($0); //@line 10490
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 14396
 return;
}
function setThrew(threw, value) {
 threw = threw | 0;
 value = value | 0;
 if (!__THREW__) {
  __THREW__ = threw; //@line 32
  threwValue = value; //@line 33
 }
}
function _out_670($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 if (!(HEAP32[$0 >> 2] & 32)) {
  ___fwritex($1, $2, $0) | 0; //@line 7899
 }
 return;
}
function b19(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 2405
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 10686
}
function __ZSt15get_new_handlerv() {
 var $0 = 0;
 $0 = HEAP32[1200] | 0; //@line 11953
 HEAP32[1200] = $0 + 0; //@line 11955
 return $0 | 0; //@line 11957
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 2166
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_71($0) {
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
function b17(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 2402
}
function __ZN4mbed6BusOutaSEi__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 1058
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 8362
}
function _fflush__async_cb_2($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 12123
 return;
}
function _snprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 368
 return;
}
function _putc__async_cb_73($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1573
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 2326
}
function b7(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 2384
 return 0; //@line 2384
}
function b6(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 2381
 return 0; //@line 2381
}
function b5(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 2378
 return 0; //@line 2378
}
function __ZN4mbed6BusOutD0Ev($0) {
 $0 = $0 | 0;
 __ZN4mbed6BusOutD2Ev($0); //@line 242
 __ZdlPv($0); //@line 243
 return;
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 127](a1 | 0); //@line 2347
}
function b15(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 2399
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 9607
}
function dynCall_i(index) {
 index = index | 0;
 return FUNCTION_TABLE_i[index & 0]() | 0; //@line 2319
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 0](); //@line 2340
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 5760
}
function b3(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 2375
 return 0; //@line 2375
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($0) {
 $0 = $0 | 0;
 return;
}
function ___ofl_lock() {
 ___lock(4788); //@line 6398
 return 4796; //@line 6399
}
function setTempRet0(value) {
 value = value | 0;
 tempRet0 = value; //@line 39
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
function __ZN4mbed6BusOut5writeEi__async_cb_61($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 9528
}
function _mbed_trace_default_print__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 9534
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 16
}
function __GLOBAL__sub_I_main_cpp__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 10476
 return;
}
function _mbed_assert_internal__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b1() {
 nullFunc_i(0); //@line 2372
 return 0; //@line 2372
}
function _handle_interrupt_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
}
function _mbed_error_printf__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___ofl_unlock() {
 ___unlock(4788); //@line 6404
 return;
}
function b13(p0) {
 p0 = p0 | 0;
 nullFunc_vi(127); //@line 2396
}
function b12(p0) {
 p0 = p0 | 0;
 nullFunc_vi(126); //@line 2393
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 5718
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 6035
}
function __ZN4mbed6BusOut6unlockEv($0) {
 $0 = $0 | 0;
 return;
}
function b11(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 2390
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6BusOut4lockEv($0) {
 $0 = $0 | 0;
 return;
}
function _serial_putc__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _mbed_tracef__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZNSt9type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function getTempRet0() {
 return tempRet0 | 0; //@line 42
}
function ___errno_location() {
 return 4784; //@line 5712
}
function _wait_ms__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function stackSave() {
 return STACKTOP | 0; //@line 12
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
 return 364; //@line 5765
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 26
}
function b9() {
 nullFunc_v(0); //@line 2387
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_i = [b1];
var FUNCTION_TABLE_ii = [b3,___stdio_close];
var FUNCTION_TABLE_iiii = [b5,___stdout_write,___stdio_seek,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,___stdio_write,b6,b7];
var FUNCTION_TABLE_v = [b9];
var FUNCTION_TABLE_vi = [b11,__ZN4mbed6BusOutD2Ev,__ZN4mbed6BusOutD0Ev,__ZN4mbed6BusOut4lockEv,__ZN4mbed6BusOut6unlockEv,_mbed_trace_default_print,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed6BusOutC2E7PinNameS1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1___async_cb,__ZN4mbed6BusOut5writeEi__async_cb,__ZN4mbed6BusOut5writeEi__async_cb_61,__ZN4mbed6BusOutaSEi__async_cb,_mbed_trace_default_print__async_cb,_mbed_tracef__async_cb,_mbed_vtracef__async_cb,_mbed_vtracef__async_cb_14,_mbed_vtracef__async_cb_4,_mbed_vtracef__async_cb_5,_mbed_vtracef__async_cb_6,_mbed_vtracef__async_cb_13,_mbed_vtracef__async_cb_7,_mbed_vtracef__async_cb_12,_mbed_vtracef__async_cb_8,_mbed_vtracef__async_cb_9,_mbed_vtracef__async_cb_10
,_mbed_vtracef__async_cb_11,_mbed_assert_internal__async_cb,_mbed_die__async_cb_29,_mbed_die__async_cb_28,_mbed_die__async_cb_27,_mbed_die__async_cb_26,_mbed_die__async_cb_25,_mbed_die__async_cb_24,_mbed_die__async_cb_23,_mbed_die__async_cb_22,_mbed_die__async_cb_21,_mbed_die__async_cb_20,_mbed_die__async_cb_19,_mbed_die__async_cb_18,_mbed_die__async_cb_17,_mbed_die__async_cb_16,_mbed_die__async_cb_15,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_vfprintf__async_cb,_mbed_error_vfprintf__async_cb_76,_mbed_error_vfprintf__async_cb_75,_serial_putc__async_cb_74,_serial_putc__async_cb,_invoke_ticker__async_cb_69,_invoke_ticker__async_cb,_wait__async_cb,_wait_ms__async_cb,__GLOBAL__sub_I_main_cpp__async_cb,_main__async_cb_44
,_main__async_cb_60,_main__async_cb_43,_main__async_cb_59,_main__async_cb_42,_main__async_cb_58,_main__async_cb_41,_main__async_cb_57,_main__async_cb_40,_main__async_cb_56,_main__async_cb_39,_main__async_cb_55,_main__async_cb_38,_main__async_cb_54,_main__async_cb_37,_main__async_cb_53,_main__async_cb_36,_main__async_cb_52,_main__async_cb_35,_main__async_cb_51,_main__async_cb_34,_main__async_cb_50,_main__async_cb_33,_main__async_cb_49,_main__async_cb_32,_main__async_cb_48,_main__async_cb_31,_main__async_cb_47,_main__async_cb_30,_main__async_cb_46,_main__async_cb
,_main__async_cb_45,_putc__async_cb_73,_putc__async_cb,___overflow__async_cb,_fflush__async_cb_2,_fflush__async_cb_1,_fflush__async_cb_3,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_63,_vfprintf__async_cb,_snprintf__async_cb,_vsnprintf__async_cb,_puts__async_cb,__Znwj__async_cb,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_68,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_62,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_71,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_70,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_67,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_66,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_65,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_64,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb
,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_72,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b12,b13];
var FUNCTION_TABLE_viiii = [b15,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi];
var FUNCTION_TABLE_viiiii = [b17,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib];
var FUNCTION_TABLE_viiiiii = [b19,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib];

  return { __GLOBAL__sub_I_main_cpp: __GLOBAL__sub_I_main_cpp, ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _fflush: _fflush, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _handle_lora_downlink: _handle_lora_downlink, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _invoke_ticker: _invoke_ticker, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_i: dynCall_i, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

var real___GLOBAL__sub_I_main_cpp = asm["__GLOBAL__sub_I_main_cpp"]; asm["__GLOBAL__sub_I_main_cpp"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real___GLOBAL__sub_I_main_cpp.apply(null, arguments);
};

var real____cxa_can_catch = asm["___cxa_can_catch"]; asm["___cxa_can_catch"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____cxa_can_catch.apply(null, arguments);
};

var real____cxa_is_pointer_type = asm["___cxa_is_pointer_type"]; asm["___cxa_is_pointer_type"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____cxa_is_pointer_type.apply(null, arguments);
};

var real____errno_location = asm["___errno_location"]; asm["___errno_location"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____errno_location.apply(null, arguments);
};

var real____udivdi3 = asm["___udivdi3"]; asm["___udivdi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____udivdi3.apply(null, arguments);
};

var real____uremdi3 = asm["___uremdi3"]; asm["___uremdi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____uremdi3.apply(null, arguments);
};

var real__bitshift64Lshr = asm["_bitshift64Lshr"]; asm["_bitshift64Lshr"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__bitshift64Lshr.apply(null, arguments);
};

var real__bitshift64Shl = asm["_bitshift64Shl"]; asm["_bitshift64Shl"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__bitshift64Shl.apply(null, arguments);
};

var real__emscripten_alloc_async_context = asm["_emscripten_alloc_async_context"]; asm["_emscripten_alloc_async_context"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__emscripten_alloc_async_context.apply(null, arguments);
};

var real__emscripten_async_resume = asm["_emscripten_async_resume"]; asm["_emscripten_async_resume"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__emscripten_async_resume.apply(null, arguments);
};

var real__emscripten_free_async_context = asm["_emscripten_free_async_context"]; asm["_emscripten_free_async_context"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__emscripten_free_async_context.apply(null, arguments);
};

var real__emscripten_realloc_async_context = asm["_emscripten_realloc_async_context"]; asm["_emscripten_realloc_async_context"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__emscripten_realloc_async_context.apply(null, arguments);
};

var real__fflush = asm["_fflush"]; asm["_fflush"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__fflush.apply(null, arguments);
};

var real__free = asm["_free"]; asm["_free"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__free.apply(null, arguments);
};

var real__handle_interrupt_in = asm["_handle_interrupt_in"]; asm["_handle_interrupt_in"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__handle_interrupt_in.apply(null, arguments);
};

var real__handle_lora_downlink = asm["_handle_lora_downlink"]; asm["_handle_lora_downlink"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__handle_lora_downlink.apply(null, arguments);
};

var real__i64Add = asm["_i64Add"]; asm["_i64Add"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__i64Add.apply(null, arguments);
};

var real__i64Subtract = asm["_i64Subtract"]; asm["_i64Subtract"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__i64Subtract.apply(null, arguments);
};

var real__invoke_ticker = asm["_invoke_ticker"]; asm["_invoke_ticker"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__invoke_ticker.apply(null, arguments);
};

var real__llvm_bswap_i32 = asm["_llvm_bswap_i32"]; asm["_llvm_bswap_i32"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__llvm_bswap_i32.apply(null, arguments);
};

var real__main = asm["_main"]; asm["_main"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__main.apply(null, arguments);
};

var real__malloc = asm["_malloc"]; asm["_malloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__malloc.apply(null, arguments);
};

var real__sbrk = asm["_sbrk"]; asm["_sbrk"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__sbrk.apply(null, arguments);
};

var real_establishStackSpace = asm["establishStackSpace"]; asm["establishStackSpace"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_establishStackSpace.apply(null, arguments);
};

var real_getTempRet0 = asm["getTempRet0"]; asm["getTempRet0"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_getTempRet0.apply(null, arguments);
};

var real_setAsync = asm["setAsync"]; asm["setAsync"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setAsync.apply(null, arguments);
};

var real_setTempRet0 = asm["setTempRet0"]; asm["setTempRet0"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setTempRet0.apply(null, arguments);
};

var real_setThrew = asm["setThrew"]; asm["setThrew"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setThrew.apply(null, arguments);
};

var real_stackAlloc = asm["stackAlloc"]; asm["stackAlloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackAlloc.apply(null, arguments);
};

var real_stackRestore = asm["stackRestore"]; asm["stackRestore"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackRestore.apply(null, arguments);
};

var real_stackSave = asm["stackSave"]; asm["stackSave"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackSave.apply(null, arguments);
};
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
var _fflush = Module["_fflush"] = asm["_fflush"];
var _free = Module["_free"] = asm["_free"];
var _handle_interrupt_in = Module["_handle_interrupt_in"] = asm["_handle_interrupt_in"];
var _handle_lora_downlink = Module["_handle_lora_downlink"] = asm["_handle_lora_downlink"];
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
var dynCall_viiii = Module["dynCall_viiii"] = asm["dynCall_viiii"];
var dynCall_viiiii = Module["dynCall_viiiii"] = asm["dynCall_viiiii"];
var dynCall_viiiiii = Module["dynCall_viiiiii"] = asm["dynCall_viiiiii"];
;



// === Auto-generated postamble setup entry stuff ===

Module['asm'] = asm;

if (!Module["intArrayFromString"]) Module["intArrayFromString"] = function() { abort("'intArrayFromString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["intArrayToString"]) Module["intArrayToString"] = function() { abort("'intArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["ccall"]) Module["ccall"] = function() { abort("'ccall' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["cwrap"]) Module["cwrap"] = function() { abort("'cwrap' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["setValue"]) Module["setValue"] = function() { abort("'setValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getValue"]) Module["getValue"] = function() { abort("'getValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["allocate"]) Module["allocate"] = function() { abort("'allocate' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getMemory"]) Module["getMemory"] = function() { abort("'getMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["Pointer_stringify"]) Module["Pointer_stringify"] = function() { abort("'Pointer_stringify' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["AsciiToString"]) Module["AsciiToString"] = function() { abort("'AsciiToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToAscii"]) Module["stringToAscii"] = function() { abort("'stringToAscii' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF8ArrayToString"]) Module["UTF8ArrayToString"] = function() { abort("'UTF8ArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF8ToString"]) Module["UTF8ToString"] = function() { abort("'UTF8ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF8Array"]) Module["stringToUTF8Array"] = function() { abort("'stringToUTF8Array' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF8"]) Module["stringToUTF8"] = function() { abort("'stringToUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF8"]) Module["lengthBytesUTF8"] = function() { abort("'lengthBytesUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF16ToString"]) Module["UTF16ToString"] = function() { abort("'UTF16ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF16"]) Module["stringToUTF16"] = function() { abort("'stringToUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF16"]) Module["lengthBytesUTF16"] = function() { abort("'lengthBytesUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF32ToString"]) Module["UTF32ToString"] = function() { abort("'UTF32ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF32"]) Module["stringToUTF32"] = function() { abort("'stringToUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF32"]) Module["lengthBytesUTF32"] = function() { abort("'lengthBytesUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["allocateUTF8"]) Module["allocateUTF8"] = function() { abort("'allocateUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stackTrace"]) Module["stackTrace"] = function() { abort("'stackTrace' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPreRun"]) Module["addOnPreRun"] = function() { abort("'addOnPreRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnInit"]) Module["addOnInit"] = function() { abort("'addOnInit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPreMain"]) Module["addOnPreMain"] = function() { abort("'addOnPreMain' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnExit"]) Module["addOnExit"] = function() { abort("'addOnExit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPostRun"]) Module["addOnPostRun"] = function() { abort("'addOnPostRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeStringToMemory"]) Module["writeStringToMemory"] = function() { abort("'writeStringToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeArrayToMemory"]) Module["writeArrayToMemory"] = function() { abort("'writeArrayToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeAsciiToMemory"]) Module["writeAsciiToMemory"] = function() { abort("'writeAsciiToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addRunDependency"]) Module["addRunDependency"] = function() { abort("'addRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["removeRunDependency"]) Module["removeRunDependency"] = function() { abort("'removeRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS"]) Module["FS"] = function() { abort("'FS' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["FS_createFolder"]) Module["FS_createFolder"] = function() { abort("'FS_createFolder' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createPath"]) Module["FS_createPath"] = function() { abort("'FS_createPath' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createDataFile"]) Module["FS_createDataFile"] = function() { abort("'FS_createDataFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createPreloadedFile"]) Module["FS_createPreloadedFile"] = function() { abort("'FS_createPreloadedFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createLazyFile"]) Module["FS_createLazyFile"] = function() { abort("'FS_createLazyFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createLink"]) Module["FS_createLink"] = function() { abort("'FS_createLink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createDevice"]) Module["FS_createDevice"] = function() { abort("'FS_createDevice' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_unlink"]) Module["FS_unlink"] = function() { abort("'FS_unlink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["GL"]) Module["GL"] = function() { abort("'GL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["staticAlloc"]) Module["staticAlloc"] = function() { abort("'staticAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["dynamicAlloc"]) Module["dynamicAlloc"] = function() { abort("'dynamicAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["warnOnce"]) Module["warnOnce"] = function() { abort("'warnOnce' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["loadDynamicLibrary"]) Module["loadDynamicLibrary"] = function() { abort("'loadDynamicLibrary' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["loadWebAssemblyModule"]) Module["loadWebAssemblyModule"] = function() { abort("'loadWebAssemblyModule' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getLEB"]) Module["getLEB"] = function() { abort("'getLEB' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getFunctionTables"]) Module["getFunctionTables"] = function() { abort("'getFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["alignFunctionTables"]) Module["alignFunctionTables"] = function() { abort("'alignFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["registerFunctions"]) Module["registerFunctions"] = function() { abort("'registerFunctions' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addFunction"]) Module["addFunction"] = function() { abort("'addFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["removeFunction"]) Module["removeFunction"] = function() { abort("'removeFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getFuncWrapper"]) Module["getFuncWrapper"] = function() { abort("'getFuncWrapper' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["prettyPrint"]) Module["prettyPrint"] = function() { abort("'prettyPrint' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["makeBigInt"]) Module["makeBigInt"] = function() { abort("'makeBigInt' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["dynCall"]) Module["dynCall"] = function() { abort("'dynCall' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getCompilerSetting"]) Module["getCompilerSetting"] = function() { abort("'getCompilerSetting' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };if (!Module["ALLOC_NORMAL"]) Object.defineProperty(Module, "ALLOC_NORMAL", { get: function() { abort("'ALLOC_NORMAL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_STACK"]) Object.defineProperty(Module, "ALLOC_STACK", { get: function() { abort("'ALLOC_STACK' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_STATIC"]) Object.defineProperty(Module, "ALLOC_STATIC", { get: function() { abort("'ALLOC_STATIC' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_DYNAMIC"]) Object.defineProperty(Module, "ALLOC_DYNAMIC", { get: function() { abort("'ALLOC_DYNAMIC' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_NONE"]) Object.defineProperty(Module, "ALLOC_NONE", { get: function() { abort("'ALLOC_NONE' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });

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
      for (var i = 0; i < data.length; i++) {
        assert(HEAPU8[GLOBAL_BASE + i] === 0, "area for memory initializer should not have been touched before it's loaded");
      }
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
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on __ATMAIN__)');
  assert(__ATPRERUN__.length == 0, 'cannot call main when preRun functions remain to be called');

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

  writeStackCookie();

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
  checkStackCookie();
}
Module['run'] = run;

function checkUnflushedContent() {
  // Compiler settings do not allow exiting the runtime, so flushing
  // the streams is not possible. but in ASSERTIONS mode we check
  // if there was something to flush, and if so tell the user they
  // should request that the runtime be exitable.
  // Normally we would not even include flush() at all, but in ASSERTIONS
  // builds we do so just for this check, and here we see if there is any
  // content to flush, that is, we check if there would have been
  // something a non-ASSERTIONS build would have not seen.
  // How we flush the streams depends on whether we are in NO_FILESYSTEM
  // mode (which has its own special function for this; otherwise, all
  // the code is inside libc)
  var print = Module['print'];
  var printErr = Module['printErr'];
  var has = false;
  Module['print'] = Module['printErr'] = function(x) {
    has = true;
  }
  try { // it doesn't matter if it fails
    var flush = flush_NO_FILESYSTEM;
    if (flush) flush(0);
  } catch(e) {}
  Module['print'] = print;
  Module['printErr'] = printErr;
  if (has) {
    warnOnce('stdio streams had content in them that was not flushed. you should set NO_EXIT_RUNTIME to 0 (see the FAQ), or make sure to emit a newline when you printf etc.');
  }
}

function exit(status, implicit) {
  checkUnflushedContent();

  // if this is just main exit-ing implicitly, and the status is 0, then we
  // don't need to do anything here and can just leave. if the status is
  // non-zero, though, then we need to report it.
  // (we may have warned about this earlier, if a situation justifies doing so)
  if (implicit && Module['noExitRuntime'] && status === 0) {
    return;
  }

  if (Module['noExitRuntime']) {
    // if exit() was called, we may warn the user if the runtime isn't actually being shut down
    if (!implicit) {
      Module.printErr('exit(' + status + ') called, but NO_EXIT_RUNTIME is set, so halting execution but not exiting the runtime or preventing further async execution (build with NO_EXIT_RUNTIME=0, if you want a true shutdown)');
    }
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

  var extra = '';
  var output = 'abort(' + what + ') at ' + stackTrace() + extra;
  if (abortDecorators) {
    abortDecorators.forEach(function(decorator) {
      output = decorator(output, what);
    });
  }
  throw output;
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
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

var ASM_CONSTS = [function() { return Date.now(); },
 function($0, $1) { MbedJSHal.gpio.write($0, $1); },
 function($0, $1) { MbedJSHal.gpio.init_out($0, $1, 0); }];

function _emscripten_asm_const_iii(code, a0, a1) {
  return ASM_CONSTS[code](a0, a1);
}

function _emscripten_asm_const_i(code) {
  return ASM_CONSTS[code]();
}




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 5808;
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
var debug_table_vi = ["0", "__ZN4mbed6BusOutD2Ev", "__ZN4mbed6BusOutD0Ev", "__ZN4mbed6BusOut4lockEv", "__ZN4mbed6BusOut6unlockEv", "_mbed_trace_default_print", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "__ZN10__cxxabiv121__vmi_class_type_infoD0Ev", "__ZN4mbed6BusOutC2E7PinNameS1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1___async_cb", "__ZN4mbed6BusOut5writeEi__async_cb", "__ZN4mbed6BusOut5writeEi__async_cb_61", "__ZN4mbed6BusOutaSEi__async_cb", "_mbed_trace_default_print__async_cb", "_mbed_tracef__async_cb", "_mbed_vtracef__async_cb", "_mbed_vtracef__async_cb_60", "_mbed_vtracef__async_cb_50", "_mbed_vtracef__async_cb_51", "_mbed_vtracef__async_cb_52", "_mbed_vtracef__async_cb_59", "_mbed_vtracef__async_cb_53", "_mbed_vtracef__async_cb_58", "_mbed_vtracef__async_cb_54", "_mbed_vtracef__async_cb_55", "_mbed_vtracef__async_cb_56", "_mbed_vtracef__async_cb_57", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_46", "_mbed_die__async_cb_45", "_mbed_die__async_cb_44", "_mbed_die__async_cb_43", "_mbed_die__async_cb_42", "_mbed_die__async_cb_41", "_mbed_die__async_cb_40", "_mbed_die__async_cb_39", "_mbed_die__async_cb_38", "_mbed_die__async_cb_37", "_mbed_die__async_cb_36", "_mbed_die__async_cb_35", "_mbed_die__async_cb_34", "_mbed_die__async_cb_33", "_mbed_die__async_cb_32", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_vfprintf__async_cb", "_mbed_error_vfprintf__async_cb_66", "_mbed_error_vfprintf__async_cb_65", "_serial_putc__async_cb_76", "_serial_putc__async_cb", "_invoke_ticker__async_cb_64", "_invoke_ticker__async_cb", "_wait__async_cb", "_wait_ms__async_cb", "__GLOBAL__sub_I_main_cpp__async_cb", "_main__async_cb_15", "_main__async_cb_31", "_main__async_cb_14", "_main__async_cb_30", "_main__async_cb_13", "_main__async_cb_29", "_main__async_cb_12", "_main__async_cb_28", "_main__async_cb_11", "_main__async_cb_27", "_main__async_cb_10", "_main__async_cb_26", "_main__async_cb_9", "_main__async_cb_25", "_main__async_cb_8", "_main__async_cb_24", "_main__async_cb_7", "_main__async_cb_23", "_main__async_cb_6", "_main__async_cb_22", "_main__async_cb_5", "_main__async_cb_21", "_main__async_cb_4", "_main__async_cb_20", "_main__async_cb_3", "_main__async_cb_19", "_main__async_cb_2", "_main__async_cb_18", "_main__async_cb_1", "_main__async_cb_17", "_main__async_cb", "_main__async_cb_16", "_putc__async_cb_72", "_putc__async_cb", "___overflow__async_cb", "_fflush__async_cb_48", "_fflush__async_cb_47", "_fflush__async_cb_49", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_62", "_vfprintf__async_cb", "_snprintf__async_cb", "_vsnprintf__async_cb", "_puts__async_cb", "__Znwj__async_cb", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_75", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_63", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_73", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_74", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_70", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_69", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_68", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_67", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_71", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0"];
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
 sp = STACKTOP; //@line 2447
 STACKTOP = STACKTOP + 16 | 0; //@line 2448
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2448
 $1 = sp; //@line 2449
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 2456
   $7 = $6 >>> 3; //@line 2457
   $8 = HEAP32[1046] | 0; //@line 2458
   $9 = $8 >>> $7; //@line 2459
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 2465
    $16 = 4224 + ($14 << 1 << 2) | 0; //@line 2467
    $17 = $16 + 8 | 0; //@line 2468
    $18 = HEAP32[$17 >> 2] | 0; //@line 2469
    $19 = $18 + 8 | 0; //@line 2470
    $20 = HEAP32[$19 >> 2] | 0; //@line 2471
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1046] = $8 & ~(1 << $14); //@line 2478
     } else {
      if ((HEAP32[1050] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 2483
      }
      $27 = $20 + 12 | 0; //@line 2486
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 2490
       HEAP32[$17 >> 2] = $20; //@line 2491
       break;
      } else {
       _abort(); //@line 2494
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 2499
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 2502
    $34 = $18 + $30 + 4 | 0; //@line 2504
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 2507
    $$0 = $19; //@line 2508
    STACKTOP = sp; //@line 2509
    return $$0 | 0; //@line 2509
   }
   $37 = HEAP32[1048] | 0; //@line 2511
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 2517
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 2520
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 2523
     $49 = $47 >>> 12 & 16; //@line 2525
     $50 = $47 >>> $49; //@line 2526
     $52 = $50 >>> 5 & 8; //@line 2528
     $54 = $50 >>> $52; //@line 2530
     $56 = $54 >>> 2 & 4; //@line 2532
     $58 = $54 >>> $56; //@line 2534
     $60 = $58 >>> 1 & 2; //@line 2536
     $62 = $58 >>> $60; //@line 2538
     $64 = $62 >>> 1 & 1; //@line 2540
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 2543
     $69 = 4224 + ($67 << 1 << 2) | 0; //@line 2545
     $70 = $69 + 8 | 0; //@line 2546
     $71 = HEAP32[$70 >> 2] | 0; //@line 2547
     $72 = $71 + 8 | 0; //@line 2548
     $73 = HEAP32[$72 >> 2] | 0; //@line 2549
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 2555
       HEAP32[1046] = $77; //@line 2556
       $98 = $77; //@line 2557
      } else {
       if ((HEAP32[1050] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 2562
       }
       $80 = $73 + 12 | 0; //@line 2565
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 2569
        HEAP32[$70 >> 2] = $73; //@line 2570
        $98 = $8; //@line 2571
        break;
       } else {
        _abort(); //@line 2574
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 2579
     $84 = $83 - $6 | 0; //@line 2580
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 2583
     $87 = $71 + $6 | 0; //@line 2584
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 2587
     HEAP32[$71 + $83 >> 2] = $84; //@line 2589
     if ($37 | 0) {
      $92 = HEAP32[1051] | 0; //@line 2592
      $93 = $37 >>> 3; //@line 2593
      $95 = 4224 + ($93 << 1 << 2) | 0; //@line 2595
      $96 = 1 << $93; //@line 2596
      if (!($98 & $96)) {
       HEAP32[1046] = $98 | $96; //@line 2601
       $$0199 = $95; //@line 2603
       $$pre$phiZ2D = $95 + 8 | 0; //@line 2603
      } else {
       $101 = $95 + 8 | 0; //@line 2605
       $102 = HEAP32[$101 >> 2] | 0; //@line 2606
       if ((HEAP32[1050] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 2610
       } else {
        $$0199 = $102; //@line 2613
        $$pre$phiZ2D = $101; //@line 2613
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 2616
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 2618
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 2620
      HEAP32[$92 + 12 >> 2] = $95; //@line 2622
     }
     HEAP32[1048] = $84; //@line 2624
     HEAP32[1051] = $87; //@line 2625
     $$0 = $72; //@line 2626
     STACKTOP = sp; //@line 2627
     return $$0 | 0; //@line 2627
    }
    $108 = HEAP32[1047] | 0; //@line 2629
    if (!$108) {
     $$0197 = $6; //@line 2632
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 2636
     $114 = $112 >>> 12 & 16; //@line 2638
     $115 = $112 >>> $114; //@line 2639
     $117 = $115 >>> 5 & 8; //@line 2641
     $119 = $115 >>> $117; //@line 2643
     $121 = $119 >>> 2 & 4; //@line 2645
     $123 = $119 >>> $121; //@line 2647
     $125 = $123 >>> 1 & 2; //@line 2649
     $127 = $123 >>> $125; //@line 2651
     $129 = $127 >>> 1 & 1; //@line 2653
     $134 = HEAP32[4488 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 2658
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 2662
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2668
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 2671
      $$0193$lcssa$i = $138; //@line 2671
     } else {
      $$01926$i = $134; //@line 2673
      $$01935$i = $138; //@line 2673
      $146 = $143; //@line 2673
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 2678
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 2679
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 2680
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 2681
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2687
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 2690
        $$0193$lcssa$i = $$$0193$i; //@line 2690
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 2693
        $$01935$i = $$$0193$i; //@line 2693
       }
      }
     }
     $157 = HEAP32[1050] | 0; //@line 2697
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 2700
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 2703
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 2706
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 2710
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 2712
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 2716
       $176 = HEAP32[$175 >> 2] | 0; //@line 2717
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 2720
        $179 = HEAP32[$178 >> 2] | 0; //@line 2721
        if (!$179) {
         $$3$i = 0; //@line 2724
         break;
        } else {
         $$1196$i = $179; //@line 2727
         $$1198$i = $178; //@line 2727
        }
       } else {
        $$1196$i = $176; //@line 2730
        $$1198$i = $175; //@line 2730
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 2733
        $182 = HEAP32[$181 >> 2] | 0; //@line 2734
        if ($182 | 0) {
         $$1196$i = $182; //@line 2737
         $$1198$i = $181; //@line 2737
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 2740
        $185 = HEAP32[$184 >> 2] | 0; //@line 2741
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 2746
         $$1198$i = $184; //@line 2746
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 2751
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 2754
        $$3$i = $$1196$i; //@line 2755
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 2760
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 2763
       }
       $169 = $167 + 12 | 0; //@line 2766
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 2770
       }
       $172 = $164 + 8 | 0; //@line 2773
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 2777
        HEAP32[$172 >> 2] = $167; //@line 2778
        $$3$i = $164; //@line 2779
        break;
       } else {
        _abort(); //@line 2782
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 2791
       $191 = 4488 + ($190 << 2) | 0; //@line 2792
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 2797
         if (!$$3$i) {
          HEAP32[1047] = $108 & ~(1 << $190); //@line 2803
          break L73;
         }
        } else {
         if ((HEAP32[1050] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 2810
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 2818
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1050] | 0; //@line 2828
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 2831
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 2835
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 2837
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 2843
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 2847
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 2849
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 2855
       if ($214 | 0) {
        if ((HEAP32[1050] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 2861
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 2865
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 2867
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 2875
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 2878
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 2880
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 2883
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 2887
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 2890
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 2892
      if ($37 | 0) {
       $234 = HEAP32[1051] | 0; //@line 2895
       $235 = $37 >>> 3; //@line 2896
       $237 = 4224 + ($235 << 1 << 2) | 0; //@line 2898
       $238 = 1 << $235; //@line 2899
       if (!($8 & $238)) {
        HEAP32[1046] = $8 | $238; //@line 2904
        $$0189$i = $237; //@line 2906
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 2906
       } else {
        $242 = $237 + 8 | 0; //@line 2908
        $243 = HEAP32[$242 >> 2] | 0; //@line 2909
        if ((HEAP32[1050] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 2913
        } else {
         $$0189$i = $243; //@line 2916
         $$pre$phi$iZ2D = $242; //@line 2916
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 2919
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 2921
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 2923
       HEAP32[$234 + 12 >> 2] = $237; //@line 2925
      }
      HEAP32[1048] = $$0193$lcssa$i; //@line 2927
      HEAP32[1051] = $159; //@line 2928
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 2931
     STACKTOP = sp; //@line 2932
     return $$0 | 0; //@line 2932
    }
   } else {
    $$0197 = $6; //@line 2935
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 2940
   } else {
    $251 = $0 + 11 | 0; //@line 2942
    $252 = $251 & -8; //@line 2943
    $253 = HEAP32[1047] | 0; //@line 2944
    if (!$253) {
     $$0197 = $252; //@line 2947
    } else {
     $255 = 0 - $252 | 0; //@line 2949
     $256 = $251 >>> 8; //@line 2950
     if (!$256) {
      $$0358$i = 0; //@line 2953
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 2957
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 2961
       $262 = $256 << $261; //@line 2962
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 2965
       $267 = $262 << $265; //@line 2967
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 2970
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 2975
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 2981
      }
     }
     $282 = HEAP32[4488 + ($$0358$i << 2) >> 2] | 0; //@line 2985
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 2989
       $$3$i203 = 0; //@line 2989
       $$3350$i = $255; //@line 2989
       label = 81; //@line 2990
      } else {
       $$0342$i = 0; //@line 2997
       $$0347$i = $255; //@line 2997
       $$0353$i = $282; //@line 2997
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 2997
       $$0362$i = 0; //@line 2997
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 3002
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 3007
          $$435113$i = 0; //@line 3007
          $$435712$i = $$0353$i; //@line 3007
          label = 85; //@line 3008
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 3011
          $$1348$i = $292; //@line 3011
         }
        } else {
         $$1343$i = $$0342$i; //@line 3014
         $$1348$i = $$0347$i; //@line 3014
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 3017
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 3020
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 3024
        $302 = ($$0353$i | 0) == 0; //@line 3025
        if ($302) {
         $$2355$i = $$1363$i; //@line 3030
         $$3$i203 = $$1343$i; //@line 3030
         $$3350$i = $$1348$i; //@line 3030
         label = 81; //@line 3031
         break;
        } else {
         $$0342$i = $$1343$i; //@line 3034
         $$0347$i = $$1348$i; //@line 3034
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 3034
         $$0362$i = $$1363$i; //@line 3034
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 3044
       $309 = $253 & ($306 | 0 - $306); //@line 3047
       if (!$309) {
        $$0197 = $252; //@line 3050
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 3055
       $315 = $313 >>> 12 & 16; //@line 3057
       $316 = $313 >>> $315; //@line 3058
       $318 = $316 >>> 5 & 8; //@line 3060
       $320 = $316 >>> $318; //@line 3062
       $322 = $320 >>> 2 & 4; //@line 3064
       $324 = $320 >>> $322; //@line 3066
       $326 = $324 >>> 1 & 2; //@line 3068
       $328 = $324 >>> $326; //@line 3070
       $330 = $328 >>> 1 & 1; //@line 3072
       $$4$ph$i = 0; //@line 3078
       $$4357$ph$i = HEAP32[4488 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 3078
      } else {
       $$4$ph$i = $$3$i203; //@line 3080
       $$4357$ph$i = $$2355$i; //@line 3080
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 3084
       $$4351$lcssa$i = $$3350$i; //@line 3084
      } else {
       $$414$i = $$4$ph$i; //@line 3086
       $$435113$i = $$3350$i; //@line 3086
       $$435712$i = $$4357$ph$i; //@line 3086
       label = 85; //@line 3087
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 3092
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 3096
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 3097
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 3098
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 3099
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 3105
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 3108
        $$4351$lcssa$i = $$$4351$i; //@line 3108
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 3111
        $$435113$i = $$$4351$i; //@line 3111
        label = 85; //@line 3112
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 3118
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1048] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1050] | 0; //@line 3124
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 3127
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 3130
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 3133
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 3137
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 3139
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 3143
         $371 = HEAP32[$370 >> 2] | 0; //@line 3144
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 3147
          $374 = HEAP32[$373 >> 2] | 0; //@line 3148
          if (!$374) {
           $$3372$i = 0; //@line 3151
           break;
          } else {
           $$1370$i = $374; //@line 3154
           $$1374$i = $373; //@line 3154
          }
         } else {
          $$1370$i = $371; //@line 3157
          $$1374$i = $370; //@line 3157
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 3160
          $377 = HEAP32[$376 >> 2] | 0; //@line 3161
          if ($377 | 0) {
           $$1370$i = $377; //@line 3164
           $$1374$i = $376; //@line 3164
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 3167
          $380 = HEAP32[$379 >> 2] | 0; //@line 3168
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 3173
           $$1374$i = $379; //@line 3173
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 3178
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 3181
          $$3372$i = $$1370$i; //@line 3182
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 3187
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 3190
         }
         $364 = $362 + 12 | 0; //@line 3193
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 3197
         }
         $367 = $359 + 8 | 0; //@line 3200
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 3204
          HEAP32[$367 >> 2] = $362; //@line 3205
          $$3372$i = $359; //@line 3206
          break;
         } else {
          _abort(); //@line 3209
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 3217
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 3220
         $386 = 4488 + ($385 << 2) | 0; //@line 3221
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 3226
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 3231
            HEAP32[1047] = $391; //@line 3232
            $475 = $391; //@line 3233
            break L164;
           }
          } else {
           if ((HEAP32[1050] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 3240
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 3248
            if (!$$3372$i) {
             $475 = $253; //@line 3251
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1050] | 0; //@line 3259
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 3262
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 3266
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 3268
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 3274
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 3278
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 3280
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 3286
         if (!$409) {
          $475 = $253; //@line 3289
         } else {
          if ((HEAP32[1050] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 3294
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 3298
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 3300
           $475 = $253; //@line 3301
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 3310
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 3313
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 3315
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 3318
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 3322
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 3325
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 3327
         $428 = $$4351$lcssa$i >>> 3; //@line 3328
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 4224 + ($428 << 1 << 2) | 0; //@line 3332
          $432 = HEAP32[1046] | 0; //@line 3333
          $433 = 1 << $428; //@line 3334
          if (!($432 & $433)) {
           HEAP32[1046] = $432 | $433; //@line 3339
           $$0368$i = $431; //@line 3341
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 3341
          } else {
           $437 = $431 + 8 | 0; //@line 3343
           $438 = HEAP32[$437 >> 2] | 0; //@line 3344
           if ((HEAP32[1050] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 3348
           } else {
            $$0368$i = $438; //@line 3351
            $$pre$phi$i211Z2D = $437; //@line 3351
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 3354
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 3356
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 3358
          HEAP32[$354 + 12 >> 2] = $431; //@line 3360
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 3363
         if (!$444) {
          $$0361$i = 0; //@line 3366
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 3370
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 3374
           $450 = $444 << $449; //@line 3375
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 3378
           $455 = $450 << $453; //@line 3380
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 3383
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 3388
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 3394
          }
         }
         $469 = 4488 + ($$0361$i << 2) | 0; //@line 3397
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 3399
         $471 = $354 + 16 | 0; //@line 3400
         HEAP32[$471 + 4 >> 2] = 0; //@line 3402
         HEAP32[$471 >> 2] = 0; //@line 3403
         $473 = 1 << $$0361$i; //@line 3404
         if (!($475 & $473)) {
          HEAP32[1047] = $475 | $473; //@line 3409
          HEAP32[$469 >> 2] = $354; //@line 3410
          HEAP32[$354 + 24 >> 2] = $469; //@line 3412
          HEAP32[$354 + 12 >> 2] = $354; //@line 3414
          HEAP32[$354 + 8 >> 2] = $354; //@line 3416
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 3425
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 3425
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 3432
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 3436
          $494 = HEAP32[$492 >> 2] | 0; //@line 3438
          if (!$494) {
           label = 136; //@line 3441
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 3444
           $$0345$i = $494; //@line 3444
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1050] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 3451
          } else {
           HEAP32[$492 >> 2] = $354; //@line 3454
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 3456
           HEAP32[$354 + 12 >> 2] = $354; //@line 3458
           HEAP32[$354 + 8 >> 2] = $354; //@line 3460
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 3465
          $502 = HEAP32[$501 >> 2] | 0; //@line 3466
          $503 = HEAP32[1050] | 0; //@line 3467
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 3473
           HEAP32[$501 >> 2] = $354; //@line 3474
           HEAP32[$354 + 8 >> 2] = $502; //@line 3476
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 3478
           HEAP32[$354 + 24 >> 2] = 0; //@line 3480
           break;
          } else {
           _abort(); //@line 3483
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 3490
       STACKTOP = sp; //@line 3491
       return $$0 | 0; //@line 3491
      } else {
       $$0197 = $252; //@line 3493
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1048] | 0; //@line 3500
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 3503
  $515 = HEAP32[1051] | 0; //@line 3504
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 3507
   HEAP32[1051] = $517; //@line 3508
   HEAP32[1048] = $514; //@line 3509
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 3512
   HEAP32[$515 + $512 >> 2] = $514; //@line 3514
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 3517
  } else {
   HEAP32[1048] = 0; //@line 3519
   HEAP32[1051] = 0; //@line 3520
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 3523
   $526 = $515 + $512 + 4 | 0; //@line 3525
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 3528
  }
  $$0 = $515 + 8 | 0; //@line 3531
  STACKTOP = sp; //@line 3532
  return $$0 | 0; //@line 3532
 }
 $530 = HEAP32[1049] | 0; //@line 3534
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 3537
  HEAP32[1049] = $532; //@line 3538
  $533 = HEAP32[1052] | 0; //@line 3539
  $534 = $533 + $$0197 | 0; //@line 3540
  HEAP32[1052] = $534; //@line 3541
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 3544
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 3547
  $$0 = $533 + 8 | 0; //@line 3549
  STACKTOP = sp; //@line 3550
  return $$0 | 0; //@line 3550
 }
 if (!(HEAP32[1164] | 0)) {
  HEAP32[1166] = 4096; //@line 3555
  HEAP32[1165] = 4096; //@line 3556
  HEAP32[1167] = -1; //@line 3557
  HEAP32[1168] = -1; //@line 3558
  HEAP32[1169] = 0; //@line 3559
  HEAP32[1157] = 0; //@line 3560
  HEAP32[1164] = $1 & -16 ^ 1431655768; //@line 3564
  $548 = 4096; //@line 3565
 } else {
  $548 = HEAP32[1166] | 0; //@line 3568
 }
 $545 = $$0197 + 48 | 0; //@line 3570
 $546 = $$0197 + 47 | 0; //@line 3571
 $547 = $548 + $546 | 0; //@line 3572
 $549 = 0 - $548 | 0; //@line 3573
 $550 = $547 & $549; //@line 3574
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 3577
  STACKTOP = sp; //@line 3578
  return $$0 | 0; //@line 3578
 }
 $552 = HEAP32[1156] | 0; //@line 3580
 if ($552 | 0) {
  $554 = HEAP32[1154] | 0; //@line 3583
  $555 = $554 + $550 | 0; //@line 3584
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 3589
   STACKTOP = sp; //@line 3590
   return $$0 | 0; //@line 3590
  }
 }
 L244 : do {
  if (!(HEAP32[1157] & 4)) {
   $561 = HEAP32[1052] | 0; //@line 3598
   L246 : do {
    if (!$561) {
     label = 163; //@line 3602
    } else {
     $$0$i$i = 4632; //@line 3604
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 3606
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 3609
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 3618
      if (!$570) {
       label = 163; //@line 3621
       break L246;
      } else {
       $$0$i$i = $570; //@line 3624
      }
     }
     $595 = $547 - $530 & $549; //@line 3628
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 3631
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 3639
       } else {
        $$723947$i = $595; //@line 3641
        $$748$i = $597; //@line 3641
        label = 180; //@line 3642
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 3646
       $$2253$ph$i = $595; //@line 3646
       label = 171; //@line 3647
      }
     } else {
      $$2234243136$i = 0; //@line 3650
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 3656
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 3659
     } else {
      $574 = $572; //@line 3661
      $575 = HEAP32[1165] | 0; //@line 3662
      $576 = $575 + -1 | 0; //@line 3663
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 3671
      $584 = HEAP32[1154] | 0; //@line 3672
      $585 = $$$i + $584 | 0; //@line 3673
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1156] | 0; //@line 3678
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 3685
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 3689
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 3692
        $$748$i = $572; //@line 3692
        label = 180; //@line 3693
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 3696
        $$2253$ph$i = $$$i; //@line 3696
        label = 171; //@line 3697
       }
      } else {
       $$2234243136$i = 0; //@line 3700
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 3707
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 3716
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 3719
       $$748$i = $$2247$ph$i; //@line 3719
       label = 180; //@line 3720
       break L244;
      }
     }
     $607 = HEAP32[1166] | 0; //@line 3724
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 3728
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 3731
      $$748$i = $$2247$ph$i; //@line 3731
      label = 180; //@line 3732
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 3738
      $$2234243136$i = 0; //@line 3739
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 3743
      $$748$i = $$2247$ph$i; //@line 3743
      label = 180; //@line 3744
      break L244;
     }
    }
   } while (0);
   HEAP32[1157] = HEAP32[1157] | 4; //@line 3751
   $$4236$i = $$2234243136$i; //@line 3752
   label = 178; //@line 3753
  } else {
   $$4236$i = 0; //@line 3755
   label = 178; //@line 3756
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 3762
   $621 = _sbrk(0) | 0; //@line 3763
   $627 = $621 - $620 | 0; //@line 3771
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 3773
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 3781
    $$748$i = $620; //@line 3781
    label = 180; //@line 3782
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1154] | 0) + $$723947$i | 0; //@line 3788
  HEAP32[1154] = $633; //@line 3789
  if ($633 >>> 0 > (HEAP32[1155] | 0) >>> 0) {
   HEAP32[1155] = $633; //@line 3793
  }
  $636 = HEAP32[1052] | 0; //@line 3795
  do {
   if (!$636) {
    $638 = HEAP32[1050] | 0; //@line 3799
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1050] = $$748$i; //@line 3804
    }
    HEAP32[1158] = $$748$i; //@line 3806
    HEAP32[1159] = $$723947$i; //@line 3807
    HEAP32[1161] = 0; //@line 3808
    HEAP32[1055] = HEAP32[1164]; //@line 3810
    HEAP32[1054] = -1; //@line 3811
    HEAP32[1059] = 4224; //@line 3812
    HEAP32[1058] = 4224; //@line 3813
    HEAP32[1061] = 4232; //@line 3814
    HEAP32[1060] = 4232; //@line 3815
    HEAP32[1063] = 4240; //@line 3816
    HEAP32[1062] = 4240; //@line 3817
    HEAP32[1065] = 4248; //@line 3818
    HEAP32[1064] = 4248; //@line 3819
    HEAP32[1067] = 4256; //@line 3820
    HEAP32[1066] = 4256; //@line 3821
    HEAP32[1069] = 4264; //@line 3822
    HEAP32[1068] = 4264; //@line 3823
    HEAP32[1071] = 4272; //@line 3824
    HEAP32[1070] = 4272; //@line 3825
    HEAP32[1073] = 4280; //@line 3826
    HEAP32[1072] = 4280; //@line 3827
    HEAP32[1075] = 4288; //@line 3828
    HEAP32[1074] = 4288; //@line 3829
    HEAP32[1077] = 4296; //@line 3830
    HEAP32[1076] = 4296; //@line 3831
    HEAP32[1079] = 4304; //@line 3832
    HEAP32[1078] = 4304; //@line 3833
    HEAP32[1081] = 4312; //@line 3834
    HEAP32[1080] = 4312; //@line 3835
    HEAP32[1083] = 4320; //@line 3836
    HEAP32[1082] = 4320; //@line 3837
    HEAP32[1085] = 4328; //@line 3838
    HEAP32[1084] = 4328; //@line 3839
    HEAP32[1087] = 4336; //@line 3840
    HEAP32[1086] = 4336; //@line 3841
    HEAP32[1089] = 4344; //@line 3842
    HEAP32[1088] = 4344; //@line 3843
    HEAP32[1091] = 4352; //@line 3844
    HEAP32[1090] = 4352; //@line 3845
    HEAP32[1093] = 4360; //@line 3846
    HEAP32[1092] = 4360; //@line 3847
    HEAP32[1095] = 4368; //@line 3848
    HEAP32[1094] = 4368; //@line 3849
    HEAP32[1097] = 4376; //@line 3850
    HEAP32[1096] = 4376; //@line 3851
    HEAP32[1099] = 4384; //@line 3852
    HEAP32[1098] = 4384; //@line 3853
    HEAP32[1101] = 4392; //@line 3854
    HEAP32[1100] = 4392; //@line 3855
    HEAP32[1103] = 4400; //@line 3856
    HEAP32[1102] = 4400; //@line 3857
    HEAP32[1105] = 4408; //@line 3858
    HEAP32[1104] = 4408; //@line 3859
    HEAP32[1107] = 4416; //@line 3860
    HEAP32[1106] = 4416; //@line 3861
    HEAP32[1109] = 4424; //@line 3862
    HEAP32[1108] = 4424; //@line 3863
    HEAP32[1111] = 4432; //@line 3864
    HEAP32[1110] = 4432; //@line 3865
    HEAP32[1113] = 4440; //@line 3866
    HEAP32[1112] = 4440; //@line 3867
    HEAP32[1115] = 4448; //@line 3868
    HEAP32[1114] = 4448; //@line 3869
    HEAP32[1117] = 4456; //@line 3870
    HEAP32[1116] = 4456; //@line 3871
    HEAP32[1119] = 4464; //@line 3872
    HEAP32[1118] = 4464; //@line 3873
    HEAP32[1121] = 4472; //@line 3874
    HEAP32[1120] = 4472; //@line 3875
    $642 = $$723947$i + -40 | 0; //@line 3876
    $644 = $$748$i + 8 | 0; //@line 3878
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 3883
    $650 = $$748$i + $649 | 0; //@line 3884
    $651 = $642 - $649 | 0; //@line 3885
    HEAP32[1052] = $650; //@line 3886
    HEAP32[1049] = $651; //@line 3887
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 3890
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 3893
    HEAP32[1053] = HEAP32[1168]; //@line 3895
   } else {
    $$024367$i = 4632; //@line 3897
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 3899
     $658 = $$024367$i + 4 | 0; //@line 3900
     $659 = HEAP32[$658 >> 2] | 0; //@line 3901
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 3905
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 3909
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 3914
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 3928
       $673 = (HEAP32[1049] | 0) + $$723947$i | 0; //@line 3930
       $675 = $636 + 8 | 0; //@line 3932
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 3937
       $681 = $636 + $680 | 0; //@line 3938
       $682 = $673 - $680 | 0; //@line 3939
       HEAP32[1052] = $681; //@line 3940
       HEAP32[1049] = $682; //@line 3941
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 3944
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 3947
       HEAP32[1053] = HEAP32[1168]; //@line 3949
       break;
      }
     }
    }
    $688 = HEAP32[1050] | 0; //@line 3954
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1050] = $$748$i; //@line 3957
     $753 = $$748$i; //@line 3958
    } else {
     $753 = $688; //@line 3960
    }
    $690 = $$748$i + $$723947$i | 0; //@line 3962
    $$124466$i = 4632; //@line 3963
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 3968
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 3972
     if (!$694) {
      $$0$i$i$i = 4632; //@line 3975
      break;
     } else {
      $$124466$i = $694; //@line 3978
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 3987
      $700 = $$124466$i + 4 | 0; //@line 3988
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 3991
      $704 = $$748$i + 8 | 0; //@line 3993
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 3999
      $712 = $690 + 8 | 0; //@line 4001
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 4007
      $722 = $710 + $$0197 | 0; //@line 4011
      $723 = $718 - $710 - $$0197 | 0; //@line 4012
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 4015
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1049] | 0) + $723 | 0; //@line 4020
        HEAP32[1049] = $728; //@line 4021
        HEAP32[1052] = $722; //@line 4022
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 4025
       } else {
        if ((HEAP32[1051] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1048] | 0) + $723 | 0; //@line 4031
         HEAP32[1048] = $734; //@line 4032
         HEAP32[1051] = $722; //@line 4033
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 4036
         HEAP32[$722 + $734 >> 2] = $734; //@line 4038
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 4042
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 4046
         $743 = $739 >>> 3; //@line 4047
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 4052
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 4054
           $750 = 4224 + ($743 << 1 << 2) | 0; //@line 4056
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 4062
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 4071
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1046] = HEAP32[1046] & ~(1 << $743); //@line 4081
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 4088
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 4092
             }
             $764 = $748 + 8 | 0; //@line 4095
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 4099
              break;
             }
             _abort(); //@line 4102
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 4107
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 4108
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 4111
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 4113
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 4117
             $783 = $782 + 4 | 0; //@line 4118
             $784 = HEAP32[$783 >> 2] | 0; //@line 4119
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 4122
              if (!$786) {
               $$3$i$i = 0; //@line 4125
               break;
              } else {
               $$1291$i$i = $786; //@line 4128
               $$1293$i$i = $782; //@line 4128
              }
             } else {
              $$1291$i$i = $784; //@line 4131
              $$1293$i$i = $783; //@line 4131
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 4134
              $789 = HEAP32[$788 >> 2] | 0; //@line 4135
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 4138
               $$1293$i$i = $788; //@line 4138
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 4141
              $792 = HEAP32[$791 >> 2] | 0; //@line 4142
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 4147
               $$1293$i$i = $791; //@line 4147
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 4152
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 4155
              $$3$i$i = $$1291$i$i; //@line 4156
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 4161
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 4164
             }
             $776 = $774 + 12 | 0; //@line 4167
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 4171
             }
             $779 = $771 + 8 | 0; //@line 4174
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 4178
              HEAP32[$779 >> 2] = $774; //@line 4179
              $$3$i$i = $771; //@line 4180
              break;
             } else {
              _abort(); //@line 4183
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 4193
           $798 = 4488 + ($797 << 2) | 0; //@line 4194
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 4199
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1047] = HEAP32[1047] & ~(1 << $797); //@line 4208
             break L311;
            } else {
             if ((HEAP32[1050] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 4214
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 4222
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1050] | 0; //@line 4232
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 4235
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 4239
           $815 = $718 + 16 | 0; //@line 4240
           $816 = HEAP32[$815 >> 2] | 0; //@line 4241
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 4247
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 4251
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 4253
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 4259
           if (!$822) {
            break;
           }
           if ((HEAP32[1050] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 4267
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 4271
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 4273
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 4280
         $$0287$i$i = $742 + $723 | 0; //@line 4280
        } else {
         $$0$i17$i = $718; //@line 4282
         $$0287$i$i = $723; //@line 4282
        }
        $830 = $$0$i17$i + 4 | 0; //@line 4284
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 4287
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 4290
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 4292
        $836 = $$0287$i$i >>> 3; //@line 4293
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 4224 + ($836 << 1 << 2) | 0; //@line 4297
         $840 = HEAP32[1046] | 0; //@line 4298
         $841 = 1 << $836; //@line 4299
         do {
          if (!($840 & $841)) {
           HEAP32[1046] = $840 | $841; //@line 4305
           $$0295$i$i = $839; //@line 4307
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 4307
          } else {
           $845 = $839 + 8 | 0; //@line 4309
           $846 = HEAP32[$845 >> 2] | 0; //@line 4310
           if ((HEAP32[1050] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 4314
            $$pre$phi$i19$iZ2D = $845; //@line 4314
            break;
           }
           _abort(); //@line 4317
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 4321
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 4323
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 4325
         HEAP32[$722 + 12 >> 2] = $839; //@line 4327
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 4330
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 4334
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 4338
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 4343
          $858 = $852 << $857; //@line 4344
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 4347
          $863 = $858 << $861; //@line 4349
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 4352
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 4357
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 4363
         }
        } while (0);
        $877 = 4488 + ($$0296$i$i << 2) | 0; //@line 4366
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 4368
        $879 = $722 + 16 | 0; //@line 4369
        HEAP32[$879 + 4 >> 2] = 0; //@line 4371
        HEAP32[$879 >> 2] = 0; //@line 4372
        $881 = HEAP32[1047] | 0; //@line 4373
        $882 = 1 << $$0296$i$i; //@line 4374
        if (!($881 & $882)) {
         HEAP32[1047] = $881 | $882; //@line 4379
         HEAP32[$877 >> 2] = $722; //@line 4380
         HEAP32[$722 + 24 >> 2] = $877; //@line 4382
         HEAP32[$722 + 12 >> 2] = $722; //@line 4384
         HEAP32[$722 + 8 >> 2] = $722; //@line 4386
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 4395
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 4395
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 4402
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 4406
         $902 = HEAP32[$900 >> 2] | 0; //@line 4408
         if (!$902) {
          label = 260; //@line 4411
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 4414
          $$0289$i$i = $902; //@line 4414
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1050] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 4421
         } else {
          HEAP32[$900 >> 2] = $722; //@line 4424
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 4426
          HEAP32[$722 + 12 >> 2] = $722; //@line 4428
          HEAP32[$722 + 8 >> 2] = $722; //@line 4430
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 4435
         $910 = HEAP32[$909 >> 2] | 0; //@line 4436
         $911 = HEAP32[1050] | 0; //@line 4437
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 4443
          HEAP32[$909 >> 2] = $722; //@line 4444
          HEAP32[$722 + 8 >> 2] = $910; //@line 4446
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 4448
          HEAP32[$722 + 24 >> 2] = 0; //@line 4450
          break;
         } else {
          _abort(); //@line 4453
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 4460
      STACKTOP = sp; //@line 4461
      return $$0 | 0; //@line 4461
     } else {
      $$0$i$i$i = 4632; //@line 4463
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 4467
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 4472
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 4480
    }
    $927 = $923 + -47 | 0; //@line 4482
    $929 = $927 + 8 | 0; //@line 4484
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 4490
    $936 = $636 + 16 | 0; //@line 4491
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 4493
    $939 = $938 + 8 | 0; //@line 4494
    $940 = $938 + 24 | 0; //@line 4495
    $941 = $$723947$i + -40 | 0; //@line 4496
    $943 = $$748$i + 8 | 0; //@line 4498
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 4503
    $949 = $$748$i + $948 | 0; //@line 4504
    $950 = $941 - $948 | 0; //@line 4505
    HEAP32[1052] = $949; //@line 4506
    HEAP32[1049] = $950; //@line 4507
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 4510
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 4513
    HEAP32[1053] = HEAP32[1168]; //@line 4515
    $956 = $938 + 4 | 0; //@line 4516
    HEAP32[$956 >> 2] = 27; //@line 4517
    HEAP32[$939 >> 2] = HEAP32[1158]; //@line 4518
    HEAP32[$939 + 4 >> 2] = HEAP32[1159]; //@line 4518
    HEAP32[$939 + 8 >> 2] = HEAP32[1160]; //@line 4518
    HEAP32[$939 + 12 >> 2] = HEAP32[1161]; //@line 4518
    HEAP32[1158] = $$748$i; //@line 4519
    HEAP32[1159] = $$723947$i; //@line 4520
    HEAP32[1161] = 0; //@line 4521
    HEAP32[1160] = $939; //@line 4522
    $958 = $940; //@line 4523
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 4525
     HEAP32[$958 >> 2] = 7; //@line 4526
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 4539
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 4542
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 4545
     HEAP32[$938 >> 2] = $964; //@line 4546
     $969 = $964 >>> 3; //@line 4547
     if ($964 >>> 0 < 256) {
      $972 = 4224 + ($969 << 1 << 2) | 0; //@line 4551
      $973 = HEAP32[1046] | 0; //@line 4552
      $974 = 1 << $969; //@line 4553
      if (!($973 & $974)) {
       HEAP32[1046] = $973 | $974; //@line 4558
       $$0211$i$i = $972; //@line 4560
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 4560
      } else {
       $978 = $972 + 8 | 0; //@line 4562
       $979 = HEAP32[$978 >> 2] | 0; //@line 4563
       if ((HEAP32[1050] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 4567
       } else {
        $$0211$i$i = $979; //@line 4570
        $$pre$phi$i$iZ2D = $978; //@line 4570
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 4573
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 4575
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 4577
      HEAP32[$636 + 12 >> 2] = $972; //@line 4579
      break;
     }
     $985 = $964 >>> 8; //@line 4582
     if (!$985) {
      $$0212$i$i = 0; //@line 4585
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 4589
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 4593
       $991 = $985 << $990; //@line 4594
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 4597
       $996 = $991 << $994; //@line 4599
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 4602
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 4607
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 4613
      }
     }
     $1010 = 4488 + ($$0212$i$i << 2) | 0; //@line 4616
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 4618
     HEAP32[$636 + 20 >> 2] = 0; //@line 4620
     HEAP32[$936 >> 2] = 0; //@line 4621
     $1013 = HEAP32[1047] | 0; //@line 4622
     $1014 = 1 << $$0212$i$i; //@line 4623
     if (!($1013 & $1014)) {
      HEAP32[1047] = $1013 | $1014; //@line 4628
      HEAP32[$1010 >> 2] = $636; //@line 4629
      HEAP32[$636 + 24 >> 2] = $1010; //@line 4631
      HEAP32[$636 + 12 >> 2] = $636; //@line 4633
      HEAP32[$636 + 8 >> 2] = $636; //@line 4635
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 4644
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 4644
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 4651
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 4655
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 4657
      if (!$1034) {
       label = 286; //@line 4660
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 4663
       $$0207$i$i = $1034; //@line 4663
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1050] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 4670
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 4673
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 4675
       HEAP32[$636 + 12 >> 2] = $636; //@line 4677
       HEAP32[$636 + 8 >> 2] = $636; //@line 4679
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 4684
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 4685
      $1043 = HEAP32[1050] | 0; //@line 4686
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 4692
       HEAP32[$1041 >> 2] = $636; //@line 4693
       HEAP32[$636 + 8 >> 2] = $1042; //@line 4695
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 4697
       HEAP32[$636 + 24 >> 2] = 0; //@line 4699
       break;
      } else {
       _abort(); //@line 4702
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1049] | 0; //@line 4709
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 4712
   HEAP32[1049] = $1054; //@line 4713
   $1055 = HEAP32[1052] | 0; //@line 4714
   $1056 = $1055 + $$0197 | 0; //@line 4715
   HEAP32[1052] = $1056; //@line 4716
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 4719
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 4722
   $$0 = $1055 + 8 | 0; //@line 4724
   STACKTOP = sp; //@line 4725
   return $$0 | 0; //@line 4725
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 4729
 $$0 = 0; //@line 4730
 STACKTOP = sp; //@line 4731
 return $$0 | 0; //@line 4731
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8453
 STACKTOP = STACKTOP + 560 | 0; //@line 8454
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 8454
 $6 = sp + 8 | 0; //@line 8455
 $7 = sp; //@line 8456
 $8 = sp + 524 | 0; //@line 8457
 $9 = $8; //@line 8458
 $10 = sp + 512 | 0; //@line 8459
 HEAP32[$7 >> 2] = 0; //@line 8460
 $11 = $10 + 12 | 0; //@line 8461
 ___DOUBLE_BITS_677($1) | 0; //@line 8462
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 8467
  $$0520 = 1; //@line 8467
  $$0521 = 1921; //@line 8467
 } else {
  $$0471 = $1; //@line 8478
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 8478
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 1922 : 1927 : 1924; //@line 8478
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 8480
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 8489
   $31 = $$0520 + 3 | 0; //@line 8494
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 8496
   _out_670($0, $$0521, $$0520); //@line 8497
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 1948 : 1952 : $27 ? 1940 : 1944, 3); //@line 8498
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 8500
   $$sink560 = $31; //@line 8501
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 8504
   $36 = $35 != 0.0; //@line 8505
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 8509
   }
   $39 = $5 | 32; //@line 8511
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 8514
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 8517
    $44 = $$0520 | 2; //@line 8518
    $46 = 12 - $3 | 0; //@line 8520
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 8525
     } else {
      $$0509585 = 8.0; //@line 8527
      $$1508586 = $46; //@line 8527
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 8529
       $$0509585 = $$0509585 * 16.0; //@line 8530
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 8545
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 8550
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 8555
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 8558
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 8561
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 8564
     HEAP8[$68 >> 0] = 48; //@line 8565
     $$0511 = $68; //@line 8566
    } else {
     $$0511 = $66; //@line 8568
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 8575
    $76 = $$0511 + -2 | 0; //@line 8578
    HEAP8[$76 >> 0] = $5 + 15; //@line 8579
    $77 = ($3 | 0) < 1; //@line 8580
    $79 = ($4 & 8 | 0) == 0; //@line 8582
    $$0523 = $8; //@line 8583
    $$2473 = $$1472; //@line 8583
    while (1) {
     $80 = ~~$$2473; //@line 8585
     $86 = $$0523 + 1 | 0; //@line 8591
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[1956 + $80 >> 0]; //@line 8592
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 8595
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 8604
      } else {
       HEAP8[$86 >> 0] = 46; //@line 8607
       $$1524 = $$0523 + 2 | 0; //@line 8608
      }
     } else {
      $$1524 = $86; //@line 8611
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 8615
     }
    }
    $$pre693 = $$1524; //@line 8621
    if (!$3) {
     label = 24; //@line 8623
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 8631
      $$sink = $3 + 2 | 0; //@line 8631
     } else {
      label = 24; //@line 8633
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 8637
     $$pre$phi691Z2D = $101; //@line 8638
     $$sink = $101; //@line 8638
    }
    $104 = $11 - $76 | 0; //@line 8642
    $106 = $104 + $44 + $$sink | 0; //@line 8644
    _pad_676($0, 32, $2, $106, $4); //@line 8645
    _out_670($0, $$0521$, $44); //@line 8646
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 8648
    _out_670($0, $8, $$pre$phi691Z2D); //@line 8649
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 8651
    _out_670($0, $76, $104); //@line 8652
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 8654
    $$sink560 = $106; //@line 8655
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 8659
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 8663
    HEAP32[$7 >> 2] = $113; //@line 8664
    $$3 = $35 * 268435456.0; //@line 8665
    $$pr = $113; //@line 8665
   } else {
    $$3 = $35; //@line 8668
    $$pr = HEAP32[$7 >> 2] | 0; //@line 8668
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 8672
   $$0498 = $$561; //@line 8673
   $$4 = $$3; //@line 8673
   do {
    $116 = ~~$$4 >>> 0; //@line 8675
    HEAP32[$$0498 >> 2] = $116; //@line 8676
    $$0498 = $$0498 + 4 | 0; //@line 8677
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 8680
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 8690
    $$1499662 = $$0498; //@line 8690
    $124 = $$pr; //@line 8690
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 8693
     $$0488655 = $$1499662 + -4 | 0; //@line 8694
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 8697
     } else {
      $$0488657 = $$0488655; //@line 8699
      $$0497656 = 0; //@line 8699
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 8702
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 8704
       $131 = tempRet0; //@line 8705
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 8706
       HEAP32[$$0488657 >> 2] = $132; //@line 8708
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 8709
       $$0488657 = $$0488657 + -4 | 0; //@line 8711
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 8721
      } else {
       $138 = $$1482663 + -4 | 0; //@line 8723
       HEAP32[$138 >> 2] = $$0497656; //@line 8724
       $$2483$ph = $138; //@line 8725
      }
     }
     $$2500 = $$1499662; //@line 8728
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 8734
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 8738
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 8744
     HEAP32[$7 >> 2] = $144; //@line 8745
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 8748
      $$1499662 = $$2500; //@line 8748
      $124 = $144; //@line 8748
     } else {
      $$1482$lcssa = $$2483$ph; //@line 8750
      $$1499$lcssa = $$2500; //@line 8750
      $$pr566 = $144; //@line 8750
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 8755
    $$1499$lcssa = $$0498; //@line 8755
    $$pr566 = $$pr; //@line 8755
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 8761
    $150 = ($39 | 0) == 102; //@line 8762
    $$3484650 = $$1482$lcssa; //@line 8763
    $$3501649 = $$1499$lcssa; //@line 8763
    $152 = $$pr566; //@line 8763
    while (1) {
     $151 = 0 - $152 | 0; //@line 8765
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 8767
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 8771
      $161 = 1e9 >>> $154; //@line 8772
      $$0487644 = 0; //@line 8773
      $$1489643 = $$3484650; //@line 8773
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 8775
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 8779
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 8780
       $$1489643 = $$1489643 + 4 | 0; //@line 8781
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 8792
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 8795
       $$4502 = $$3501649; //@line 8795
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 8798
       $$$3484700 = $$$3484; //@line 8799
       $$4502 = $$3501649 + 4 | 0; //@line 8799
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 8806
      $$4502 = $$3501649; //@line 8806
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 8808
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 8815
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 8817
     HEAP32[$7 >> 2] = $152; //@line 8818
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 8823
      $$3501$lcssa = $$$4502; //@line 8823
      break;
     } else {
      $$3484650 = $$$3484700; //@line 8821
      $$3501649 = $$$4502; //@line 8821
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 8828
    $$3501$lcssa = $$1499$lcssa; //@line 8828
   }
   $185 = $$561; //@line 8831
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 8836
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 8837
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 8840
    } else {
     $$0514639 = $189; //@line 8842
     $$0530638 = 10; //@line 8842
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 8844
      $193 = $$0514639 + 1 | 0; //@line 8845
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 8848
       break;
      } else {
       $$0514639 = $193; //@line 8851
      }
     }
    }
   } else {
    $$1515 = 0; //@line 8856
   }
   $198 = ($39 | 0) == 103; //@line 8861
   $199 = ($$540 | 0) != 0; //@line 8862
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 8865
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 8874
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 8877
    $213 = ($209 | 0) % 9 | 0; //@line 8878
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 8881
     $$1531632 = 10; //@line 8881
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 8884
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 8887
       $$1531632 = $215; //@line 8887
      } else {
       $$1531$lcssa = $215; //@line 8889
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 8894
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 8896
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 8897
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 8900
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 8903
     $$4518 = $$1515; //@line 8903
     $$8 = $$3484$lcssa; //@line 8903
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 8908
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 8909
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 8914
     if (!$$0520) {
      $$1467 = $$$564; //@line 8917
      $$1469 = $$543; //@line 8917
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 8920
      $$1467 = $230 ? -$$$564 : $$$564; //@line 8925
      $$1469 = $230 ? -$$543 : $$543; //@line 8925
     }
     $233 = $217 - $218 | 0; //@line 8927
     HEAP32[$212 >> 2] = $233; //@line 8928
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 8932
      HEAP32[$212 >> 2] = $236; //@line 8933
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 8936
       $$sink547625 = $212; //@line 8936
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 8938
        HEAP32[$$sink547625 >> 2] = 0; //@line 8939
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 8942
         HEAP32[$240 >> 2] = 0; //@line 8943
         $$6 = $240; //@line 8944
        } else {
         $$6 = $$5486626; //@line 8946
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 8949
        HEAP32[$238 >> 2] = $242; //@line 8950
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 8953
         $$sink547625 = $238; //@line 8953
        } else {
         $$5486$lcssa = $$6; //@line 8955
         $$sink547$lcssa = $238; //@line 8955
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 8960
       $$sink547$lcssa = $212; //@line 8960
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 8965
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 8966
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 8969
       $$4518 = $247; //@line 8969
       $$8 = $$5486$lcssa; //@line 8969
      } else {
       $$2516621 = $247; //@line 8971
       $$2532620 = 10; //@line 8971
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 8973
        $251 = $$2516621 + 1 | 0; //@line 8974
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 8977
         $$4518 = $251; //@line 8977
         $$8 = $$5486$lcssa; //@line 8977
         break;
        } else {
         $$2516621 = $251; //@line 8980
        }
       }
      }
     } else {
      $$4492 = $212; //@line 8985
      $$4518 = $$1515; //@line 8985
      $$8 = $$3484$lcssa; //@line 8985
     }
    }
    $253 = $$4492 + 4 | 0; //@line 8988
    $$5519$ph = $$4518; //@line 8991
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 8991
    $$9$ph = $$8; //@line 8991
   } else {
    $$5519$ph = $$1515; //@line 8993
    $$7505$ph = $$3501$lcssa; //@line 8993
    $$9$ph = $$3484$lcssa; //@line 8993
   }
   $$7505 = $$7505$ph; //@line 8995
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 8999
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 9002
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 9006
    } else {
     $$lcssa675 = 1; //@line 9008
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 9012
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 9017
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 9025
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 9025
     } else {
      $$0479 = $5 + -2 | 0; //@line 9029
      $$2476 = $$540$ + -1 | 0; //@line 9029
     }
     $267 = $4 & 8; //@line 9031
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 9036
       if (!$270) {
        $$2529 = 9; //@line 9039
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 9044
         $$3533616 = 10; //@line 9044
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 9046
          $275 = $$1528617 + 1 | 0; //@line 9047
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 9053
           break;
          } else {
           $$1528617 = $275; //@line 9051
          }
         }
        } else {
         $$2529 = 0; //@line 9058
        }
       }
      } else {
       $$2529 = 9; //@line 9062
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 9070
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 9072
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 9074
       $$1480 = $$0479; //@line 9077
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 9077
       $$pre$phi698Z2D = 0; //@line 9077
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 9081
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 9083
       $$1480 = $$0479; //@line 9086
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 9086
       $$pre$phi698Z2D = 0; //@line 9086
       break;
      }
     } else {
      $$1480 = $$0479; //@line 9090
      $$3477 = $$2476; //@line 9090
      $$pre$phi698Z2D = $267; //@line 9090
     }
    } else {
     $$1480 = $5; //@line 9094
     $$3477 = $$540; //@line 9094
     $$pre$phi698Z2D = $4 & 8; //@line 9094
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 9097
   $294 = ($292 | 0) != 0 & 1; //@line 9099
   $296 = ($$1480 | 32 | 0) == 102; //@line 9101
   if ($296) {
    $$2513 = 0; //@line 9105
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 9105
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 9108
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 9111
    $304 = $11; //@line 9112
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 9117
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 9119
      HEAP8[$308 >> 0] = 48; //@line 9120
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 9125
      } else {
       $$1512$lcssa = $308; //@line 9127
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 9132
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 9139
    $318 = $$1512$lcssa + -2 | 0; //@line 9141
    HEAP8[$318 >> 0] = $$1480; //@line 9142
    $$2513 = $318; //@line 9145
    $$pn = $304 - $318 | 0; //@line 9145
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 9150
   _pad_676($0, 32, $2, $323, $4); //@line 9151
   _out_670($0, $$0521, $$0520); //@line 9152
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 9154
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 9157
    $326 = $8 + 9 | 0; //@line 9158
    $327 = $326; //@line 9159
    $328 = $8 + 8 | 0; //@line 9160
    $$5493600 = $$0496$$9; //@line 9161
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 9164
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 9169
       $$1465 = $328; //@line 9170
      } else {
       $$1465 = $330; //@line 9172
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 9179
       $$0464597 = $330; //@line 9180
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 9182
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 9185
        } else {
         $$1465 = $335; //@line 9187
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 9192
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 9197
     $$5493600 = $$5493600 + 4 | 0; //@line 9198
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 1972, 1); //@line 9208
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 9214
     $$6494592 = $$5493600; //@line 9214
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 9217
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 9222
       $$0463587 = $347; //@line 9223
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 9225
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 9228
        } else {
         $$0463$lcssa = $351; //@line 9230
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 9235
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 9239
      $$6494592 = $$6494592 + 4 | 0; //@line 9240
      $356 = $$4478593 + -9 | 0; //@line 9241
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 9248
       break;
      } else {
       $$4478593 = $356; //@line 9246
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 9253
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 9256
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 9259
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 9262
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 9263
     $365 = $363; //@line 9264
     $366 = 0 - $9 | 0; //@line 9265
     $367 = $8 + 8 | 0; //@line 9266
     $$5605 = $$3477; //@line 9267
     $$7495604 = $$9$ph; //@line 9267
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 9270
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 9273
       $$0 = $367; //@line 9274
      } else {
       $$0 = $369; //@line 9276
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 9281
        _out_670($0, $$0, 1); //@line 9282
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 9286
         break;
        }
        _out_670($0, 1972, 1); //@line 9289
        $$2 = $375; //@line 9290
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 9294
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 9299
        $$1601 = $$0; //@line 9300
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 9302
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 9305
         } else {
          $$2 = $373; //@line 9307
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 9314
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 9317
      $381 = $$5605 - $378 | 0; //@line 9318
      $$7495604 = $$7495604 + 4 | 0; //@line 9319
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 9326
       break;
      } else {
       $$5605 = $381; //@line 9324
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 9331
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 9334
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 9338
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 9341
   $$sink560 = $323; //@line 9342
  }
 } while (0);
 STACKTOP = sp; //@line 9347
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 9347
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 7025
 STACKTOP = STACKTOP + 64 | 0; //@line 7026
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 7026
 $5 = sp + 16 | 0; //@line 7027
 $6 = sp; //@line 7028
 $7 = sp + 24 | 0; //@line 7029
 $8 = sp + 8 | 0; //@line 7030
 $9 = sp + 20 | 0; //@line 7031
 HEAP32[$5 >> 2] = $1; //@line 7032
 $10 = ($0 | 0) != 0; //@line 7033
 $11 = $7 + 40 | 0; //@line 7034
 $12 = $11; //@line 7035
 $13 = $7 + 39 | 0; //@line 7036
 $14 = $8 + 4 | 0; //@line 7037
 $$0243 = 0; //@line 7038
 $$0247 = 0; //@line 7038
 $$0269 = 0; //@line 7038
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 7047
     $$1248 = -1; //@line 7048
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 7052
     break;
    }
   } else {
    $$1248 = $$0247; //@line 7056
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 7059
  $21 = HEAP8[$20 >> 0] | 0; //@line 7060
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 7063
   break;
  } else {
   $23 = $21; //@line 7066
   $25 = $20; //@line 7066
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 7071
     $27 = $25; //@line 7071
     label = 9; //@line 7072
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 7077
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 7084
   HEAP32[$5 >> 2] = $24; //@line 7085
   $23 = HEAP8[$24 >> 0] | 0; //@line 7087
   $25 = $24; //@line 7087
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 7092
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 7097
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 7100
     $27 = $27 + 2 | 0; //@line 7101
     HEAP32[$5 >> 2] = $27; //@line 7102
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 7109
      break;
     } else {
      $$0249303 = $30; //@line 7106
      label = 9; //@line 7107
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 7117
  if ($10) {
   _out_670($0, $20, $36); //@line 7119
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 7123
   $$0247 = $$1248; //@line 7123
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 7131
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 7132
  if ($43) {
   $$0253 = -1; //@line 7134
   $$1270 = $$0269; //@line 7134
   $$sink = 1; //@line 7134
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 7144
    $$1270 = 1; //@line 7144
    $$sink = 3; //@line 7144
   } else {
    $$0253 = -1; //@line 7146
    $$1270 = $$0269; //@line 7146
    $$sink = 1; //@line 7146
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 7149
  HEAP32[$5 >> 2] = $51; //@line 7150
  $52 = HEAP8[$51 >> 0] | 0; //@line 7151
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 7153
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 7160
   $$lcssa291 = $52; //@line 7160
   $$lcssa292 = $51; //@line 7160
  } else {
   $$0262309 = 0; //@line 7162
   $60 = $52; //@line 7162
   $65 = $51; //@line 7162
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 7167
    $64 = $65 + 1 | 0; //@line 7168
    HEAP32[$5 >> 2] = $64; //@line 7169
    $66 = HEAP8[$64 >> 0] | 0; //@line 7170
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 7172
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 7179
     $$lcssa291 = $66; //@line 7179
     $$lcssa292 = $64; //@line 7179
     break;
    } else {
     $$0262309 = $63; //@line 7182
     $60 = $66; //@line 7182
     $65 = $64; //@line 7182
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 7194
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 7196
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 7201
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 7206
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 7218
     $$2271 = 1; //@line 7218
     $storemerge274 = $79 + 3 | 0; //@line 7218
    } else {
     label = 23; //@line 7220
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 7224
    if ($$1270 | 0) {
     $$0 = -1; //@line 7227
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7242
     $106 = HEAP32[$105 >> 2] | 0; //@line 7243
     HEAP32[$2 >> 2] = $105 + 4; //@line 7245
     $363 = $106; //@line 7246
    } else {
     $363 = 0; //@line 7248
    }
    $$0259 = $363; //@line 7252
    $$2271 = 0; //@line 7252
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 7252
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 7254
   $109 = ($$0259 | 0) < 0; //@line 7255
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 7260
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 7260
   $$3272 = $$2271; //@line 7260
   $115 = $storemerge274; //@line 7260
  } else {
   $112 = _getint_671($5) | 0; //@line 7262
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 7265
    break;
   }
   $$1260 = $112; //@line 7269
   $$1263 = $$0262$lcssa; //@line 7269
   $$3272 = $$1270; //@line 7269
   $115 = HEAP32[$5 >> 2] | 0; //@line 7269
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 7280
     $156 = _getint_671($5) | 0; //@line 7281
     $$0254 = $156; //@line 7283
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 7283
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 7292
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 7297
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 7302
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 7309
      $144 = $125 + 4 | 0; //@line 7313
      HEAP32[$5 >> 2] = $144; //@line 7314
      $$0254 = $140; //@line 7315
      $$pre345 = $144; //@line 7315
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 7321
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7336
     $152 = HEAP32[$151 >> 2] | 0; //@line 7337
     HEAP32[$2 >> 2] = $151 + 4; //@line 7339
     $364 = $152; //@line 7340
    } else {
     $364 = 0; //@line 7342
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 7345
    HEAP32[$5 >> 2] = $154; //@line 7346
    $$0254 = $364; //@line 7347
    $$pre345 = $154; //@line 7347
   } else {
    $$0254 = -1; //@line 7349
    $$pre345 = $115; //@line 7349
   }
  } while (0);
  $$0252 = 0; //@line 7352
  $158 = $$pre345; //@line 7352
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 7359
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 7362
   HEAP32[$5 >> 2] = $158; //@line 7363
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (1440 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 7368
   $168 = $167 & 255; //@line 7369
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 7373
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 7380
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 7384
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 7388
     break L1;
    } else {
     label = 50; //@line 7391
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 7396
     $176 = $3 + ($$0253 << 3) | 0; //@line 7398
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 7403
     $182 = $6; //@line 7404
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 7406
     HEAP32[$182 + 4 >> 2] = $181; //@line 7409
     label = 50; //@line 7410
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 7414
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 7417
    $187 = HEAP32[$5 >> 2] | 0; //@line 7419
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 7423
   if ($10) {
    $187 = $158; //@line 7425
   } else {
    $$0243 = 0; //@line 7427
    $$0247 = $$1248; //@line 7427
    $$0269 = $$3272; //@line 7427
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 7433
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 7439
  $196 = $$1263 & -65537; //@line 7442
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 7443
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7451
       $$0243 = 0; //@line 7452
       $$0247 = $$1248; //@line 7452
       $$0269 = $$3272; //@line 7452
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7458
       $$0243 = 0; //@line 7459
       $$0247 = $$1248; //@line 7459
       $$0269 = $$3272; //@line 7459
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 7467
       HEAP32[$208 >> 2] = $$1248; //@line 7469
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 7472
       $$0243 = 0; //@line 7473
       $$0247 = $$1248; //@line 7473
       $$0269 = $$3272; //@line 7473
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 7480
       $$0243 = 0; //@line 7481
       $$0247 = $$1248; //@line 7481
       $$0269 = $$3272; //@line 7481
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 7488
       $$0243 = 0; //@line 7489
       $$0247 = $$1248; //@line 7489
       $$0269 = $$3272; //@line 7489
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7495
       $$0243 = 0; //@line 7496
       $$0247 = $$1248; //@line 7496
       $$0269 = $$3272; //@line 7496
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 7504
       HEAP32[$220 >> 2] = $$1248; //@line 7506
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 7509
       $$0243 = 0; //@line 7510
       $$0247 = $$1248; //@line 7510
       $$0269 = $$3272; //@line 7510
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 7515
       $$0247 = $$1248; //@line 7515
       $$0269 = $$3272; //@line 7515
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 7525
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 7525
     $$3265 = $$1263$ | 8; //@line 7525
     label = 62; //@line 7526
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 7530
     $$1255 = $$0254; //@line 7530
     $$3265 = $$1263$; //@line 7530
     label = 62; //@line 7531
     break;
    }
   case 111:
    {
     $242 = $6; //@line 7535
     $244 = HEAP32[$242 >> 2] | 0; //@line 7537
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 7540
     $248 = _fmt_o($244, $247, $11) | 0; //@line 7541
     $252 = $12 - $248 | 0; //@line 7545
     $$0228 = $248; //@line 7550
     $$1233 = 0; //@line 7550
     $$1238 = 1904; //@line 7550
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 7550
     $$4266 = $$1263$; //@line 7550
     $281 = $244; //@line 7550
     $283 = $247; //@line 7550
     label = 68; //@line 7551
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 7555
     $258 = HEAP32[$256 >> 2] | 0; //@line 7557
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 7560
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 7563
      $264 = tempRet0; //@line 7564
      $265 = $6; //@line 7565
      HEAP32[$265 >> 2] = $263; //@line 7567
      HEAP32[$265 + 4 >> 2] = $264; //@line 7570
      $$0232 = 1; //@line 7571
      $$0237 = 1904; //@line 7571
      $275 = $263; //@line 7571
      $276 = $264; //@line 7571
      label = 67; //@line 7572
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 7584
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 1904 : 1906 : 1905; //@line 7584
      $275 = $258; //@line 7584
      $276 = $261; //@line 7584
      label = 67; //@line 7585
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 7591
     $$0232 = 0; //@line 7597
     $$0237 = 1904; //@line 7597
     $275 = HEAP32[$197 >> 2] | 0; //@line 7597
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 7597
     label = 67; //@line 7598
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 7609
     $$2 = $13; //@line 7610
     $$2234 = 0; //@line 7610
     $$2239 = 1904; //@line 7610
     $$2251 = $11; //@line 7610
     $$5 = 1; //@line 7610
     $$6268 = $196; //@line 7610
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 7617
     label = 72; //@line 7618
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 7622
     $$1 = $302 | 0 ? $302 : 1914; //@line 7625
     label = 72; //@line 7626
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 7636
     HEAP32[$14 >> 2] = 0; //@line 7637
     HEAP32[$6 >> 2] = $8; //@line 7638
     $$4258354 = -1; //@line 7639
     $365 = $8; //@line 7639
     label = 76; //@line 7640
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 7644
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 7647
      $$0240$lcssa356 = 0; //@line 7648
      label = 85; //@line 7649
     } else {
      $$4258354 = $$0254; //@line 7651
      $365 = $$pre348; //@line 7651
      label = 76; //@line 7652
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 7659
     $$0247 = $$1248; //@line 7659
     $$0269 = $$3272; //@line 7659
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 7664
     $$2234 = 0; //@line 7664
     $$2239 = 1904; //@line 7664
     $$2251 = $11; //@line 7664
     $$5 = $$0254; //@line 7664
     $$6268 = $$1263$; //@line 7664
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 7670
    $227 = $6; //@line 7671
    $229 = HEAP32[$227 >> 2] | 0; //@line 7673
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 7676
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 7678
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 7684
    $$0228 = $234; //@line 7689
    $$1233 = $or$cond278 ? 0 : 2; //@line 7689
    $$1238 = $or$cond278 ? 1904 : 1904 + ($$1236 >> 4) | 0; //@line 7689
    $$2256 = $$1255; //@line 7689
    $$4266 = $$3265; //@line 7689
    $281 = $229; //@line 7689
    $283 = $232; //@line 7689
    label = 68; //@line 7690
   } else if ((label | 0) == 67) {
    label = 0; //@line 7693
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 7695
    $$1233 = $$0232; //@line 7695
    $$1238 = $$0237; //@line 7695
    $$2256 = $$0254; //@line 7695
    $$4266 = $$1263$; //@line 7695
    $281 = $275; //@line 7695
    $283 = $276; //@line 7695
    label = 68; //@line 7696
   } else if ((label | 0) == 72) {
    label = 0; //@line 7699
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 7700
    $306 = ($305 | 0) == 0; //@line 7701
    $$2 = $$1; //@line 7708
    $$2234 = 0; //@line 7708
    $$2239 = 1904; //@line 7708
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 7708
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 7708
    $$6268 = $196; //@line 7708
   } else if ((label | 0) == 76) {
    label = 0; //@line 7711
    $$0229316 = $365; //@line 7712
    $$0240315 = 0; //@line 7712
    $$1244314 = 0; //@line 7712
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 7714
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 7717
      $$2245 = $$1244314; //@line 7717
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 7720
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 7726
      $$2245 = $320; //@line 7726
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 7730
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 7733
      $$0240315 = $325; //@line 7733
      $$1244314 = $320; //@line 7733
     } else {
      $$0240$lcssa = $325; //@line 7735
      $$2245 = $320; //@line 7735
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 7741
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 7744
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 7747
     label = 85; //@line 7748
    } else {
     $$1230327 = $365; //@line 7750
     $$1241326 = 0; //@line 7750
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 7752
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7755
       label = 85; //@line 7756
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 7759
      $$1241326 = $331 + $$1241326 | 0; //@line 7760
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7763
       label = 85; //@line 7764
       break L97;
      }
      _out_670($0, $9, $331); //@line 7768
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7773
       label = 85; //@line 7774
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 7771
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 7782
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 7788
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 7790
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 7795
   $$2 = $or$cond ? $$0228 : $11; //@line 7800
   $$2234 = $$1233; //@line 7800
   $$2239 = $$1238; //@line 7800
   $$2251 = $11; //@line 7800
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 7800
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 7800
  } else if ((label | 0) == 85) {
   label = 0; //@line 7803
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 7805
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 7808
   $$0247 = $$1248; //@line 7808
   $$0269 = $$3272; //@line 7808
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 7813
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 7815
  $345 = $$$5 + $$2234 | 0; //@line 7816
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 7818
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 7819
  _out_670($0, $$2239, $$2234); //@line 7820
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 7822
  _pad_676($0, 48, $$$5, $343, 0); //@line 7823
  _out_670($0, $$2, $343); //@line 7824
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 7826
  $$0243 = $$2261; //@line 7827
  $$0247 = $$1248; //@line 7827
  $$0269 = $$3272; //@line 7827
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 7835
    } else {
     $$2242302 = 1; //@line 7837
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 7840
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 7843
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 7847
      $356 = $$2242302 + 1 | 0; //@line 7848
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 7851
      } else {
       $$2242$lcssa = $356; //@line 7853
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 7859
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 7865
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 7871
       } else {
        $$0 = 1; //@line 7873
        break;
       }
      }
     } else {
      $$0 = 1; //@line 7878
     }
    }
   } else {
    $$0 = $$1248; //@line 7882
   }
  }
 } while (0);
 STACKTOP = sp; //@line 7886
 return $$0 | 0; //@line 7886
}
function _mbed_vtracef($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$0199 = 0, $$1$off0 = 0, $$10 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$13 = 0, $$18 = 0, $$3 = 0, $$3147 = 0, $$3147168 = 0, $$3154 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$6 = 0, $$6150 = 0, $$9 = 0, $$lobit = 0, $$pre = 0, $$sink = 0, $125 = 0, $126 = 0, $151 = 0, $157 = 0, $168 = 0, $169 = 0, $171 = 0, $181 = 0, $182 = 0, $184 = 0, $186 = 0, $194 = 0, $201 = 0, $202 = 0, $204 = 0, $206 = 0, $209 = 0, $34 = 0, $38 = 0, $4 = 0, $43 = 0, $5 = 0, $54 = 0, $55 = 0, $59 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $69 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $76 = 0, $78 = 0, $82 = 0, $89 = 0, $95 = 0, $AsyncCtx = 0, $AsyncCtx27 = 0, $AsyncCtx30 = 0, $AsyncCtx34 = 0, $AsyncCtx38 = 0, $AsyncCtx42 = 0, $AsyncCtx45 = 0, $AsyncCtx49 = 0, $AsyncCtx52 = 0, $AsyncCtx56 = 0, $AsyncCtx60 = 0, $AsyncCtx64 = 0, $extract$t159 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer12 = 0, $vararg_buffer15 = 0, $vararg_buffer18 = 0, $vararg_buffer20 = 0, $vararg_buffer23 = 0, $vararg_buffer3 = 0, $vararg_buffer6 = 0, $vararg_buffer9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 639
 STACKTOP = STACKTOP + 96 | 0; //@line 640
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(96); //@line 640
 $vararg_buffer23 = sp + 72 | 0; //@line 641
 $vararg_buffer20 = sp + 64 | 0; //@line 642
 $vararg_buffer18 = sp + 56 | 0; //@line 643
 $vararg_buffer15 = sp + 48 | 0; //@line 644
 $vararg_buffer12 = sp + 40 | 0; //@line 645
 $vararg_buffer9 = sp + 32 | 0; //@line 646
 $vararg_buffer6 = sp + 24 | 0; //@line 647
 $vararg_buffer3 = sp + 16 | 0; //@line 648
 $vararg_buffer1 = sp + 8 | 0; //@line 649
 $vararg_buffer = sp; //@line 650
 $4 = sp + 80 | 0; //@line 651
 $5 = HEAP32[55] | 0; //@line 652
 do {
  if ($5 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(104, sp) | 0; //@line 656
   FUNCTION_TABLE_v[$5 & 0](); //@line 657
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 18; //@line 660
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 662
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 664
    HEAP8[$AsyncCtx + 12 >> 0] = $0; //@line 666
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer23; //@line 668
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer23; //@line 670
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer20; //@line 672
    HEAP32[$AsyncCtx + 28 >> 2] = $vararg_buffer20; //@line 674
    HEAP32[$AsyncCtx + 32 >> 2] = $vararg_buffer3; //@line 676
    HEAP32[$AsyncCtx + 36 >> 2] = $vararg_buffer3; //@line 678
    HEAP32[$AsyncCtx + 40 >> 2] = $3; //@line 680
    HEAP32[$AsyncCtx + 44 >> 2] = $vararg_buffer; //@line 682
    HEAP32[$AsyncCtx + 48 >> 2] = $vararg_buffer; //@line 684
    HEAP32[$AsyncCtx + 52 >> 2] = $vararg_buffer1; //@line 686
    HEAP32[$AsyncCtx + 56 >> 2] = $vararg_buffer1; //@line 688
    HEAP32[$AsyncCtx + 60 >> 2] = $4; //@line 690
    HEAP32[$AsyncCtx + 64 >> 2] = $vararg_buffer9; //@line 692
    HEAP32[$AsyncCtx + 68 >> 2] = $vararg_buffer9; //@line 694
    HEAP32[$AsyncCtx + 72 >> 2] = $vararg_buffer6; //@line 696
    HEAP32[$AsyncCtx + 76 >> 2] = $vararg_buffer6; //@line 698
    HEAP32[$AsyncCtx + 80 >> 2] = $vararg_buffer15; //@line 700
    HEAP32[$AsyncCtx + 84 >> 2] = $vararg_buffer15; //@line 702
    HEAP32[$AsyncCtx + 88 >> 2] = $vararg_buffer12; //@line 704
    HEAP32[$AsyncCtx + 92 >> 2] = $vararg_buffer12; //@line 706
    HEAP32[$AsyncCtx + 96 >> 2] = $vararg_buffer18; //@line 708
    HEAP32[$AsyncCtx + 100 >> 2] = $vararg_buffer18; //@line 710
    sp = STACKTOP; //@line 711
    STACKTOP = sp; //@line 712
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 714
    HEAP32[57] = (HEAP32[57] | 0) + 1; //@line 717
    break;
   }
  }
 } while (0);
 $34 = HEAP32[46] | 0; //@line 722
 do {
  if ($34 | 0) {
   HEAP8[$34 >> 0] = 0; //@line 726
   do {
    if ($0 << 24 >> 24 > -1 & ($1 | 0) != 0) {
     $38 = HEAP32[43] | 0; //@line 732
     if (HEAP8[$38 >> 0] | 0) {
      if (_strstr($38, $1) | 0) {
       $$0$i = 1; //@line 739
       break;
      }
     }
     $43 = HEAP32[44] | 0; //@line 743
     if (!(HEAP8[$43 >> 0] | 0)) {
      label = 11; //@line 747
     } else {
      if (!(_strstr($43, $1) | 0)) {
       $$0$i = 1; //@line 752
      } else {
       label = 11; //@line 754
      }
     }
    } else {
     label = 11; //@line 758
    }
   } while (0);
   if ((label | 0) == 11) {
    $$0$i = 0; //@line 762
   }
   if (!((HEAP32[53] | 0) != 0 & ((($1 | 0) == 0 | (($2 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[50] = HEAP32[48]; //@line 774
    break;
   }
   $54 = HEAPU8[168] | 0; //@line 778
   $55 = $0 & 255; //@line 779
   if ($55 & 31 & $54 | 0) {
    $59 = $54 & 64; //@line 784
    $$lobit = $59 >>> 6; //@line 785
    $60 = $$lobit & 255; //@line 786
    $64 = ($54 & 32 | 0) == 0; //@line 790
    $65 = HEAP32[47] | 0; //@line 791
    $66 = HEAP32[46] | 0; //@line 792
    $67 = $0 << 24 >> 24 == 1; //@line 793
    do {
     if ($67 | ($54 & 128 | 0) != 0) {
      $AsyncCtx64 = _emscripten_alloc_async_context(8, sp) | 0; //@line 797
      _vsnprintf($66, $65, $2, $3) | 0; //@line 798
      if (___async) {
       HEAP32[$AsyncCtx64 >> 2] = 19; //@line 801
       HEAP8[$AsyncCtx64 + 4 >> 0] = $67 & 1; //@line 804
       sp = STACKTOP; //@line 805
       STACKTOP = sp; //@line 806
       return;
      }
      _emscripten_free_async_context($AsyncCtx64 | 0); //@line 808
      $69 = HEAP32[54] | 0; //@line 809
      if (!($67 & ($69 | 0) != 0)) {
       $73 = HEAP32[53] | 0; //@line 813
       $74 = HEAP32[46] | 0; //@line 814
       $AsyncCtx34 = _emscripten_alloc_async_context(4, sp) | 0; //@line 815
       FUNCTION_TABLE_vi[$73 & 127]($74); //@line 816
       if (___async) {
        HEAP32[$AsyncCtx34 >> 2] = 22; //@line 819
        sp = STACKTOP; //@line 820
        STACKTOP = sp; //@line 821
        return;
       } else {
        _emscripten_free_async_context($AsyncCtx34 | 0); //@line 823
        break;
       }
      }
      $71 = HEAP32[46] | 0; //@line 827
      $AsyncCtx27 = _emscripten_alloc_async_context(4, sp) | 0; //@line 828
      FUNCTION_TABLE_vi[$69 & 127]($71); //@line 829
      if (___async) {
       HEAP32[$AsyncCtx27 >> 2] = 20; //@line 832
       sp = STACKTOP; //@line 833
       STACKTOP = sp; //@line 834
       return;
      }
      _emscripten_free_async_context($AsyncCtx27 | 0); //@line 836
      $72 = HEAP32[54] | 0; //@line 837
      $AsyncCtx30 = _emscripten_alloc_async_context(4, sp) | 0; //@line 838
      FUNCTION_TABLE_vi[$72 & 127](1113); //@line 839
      if (___async) {
       HEAP32[$AsyncCtx30 >> 2] = 21; //@line 842
       sp = STACKTOP; //@line 843
       STACKTOP = sp; //@line 844
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx30 | 0); //@line 846
       break;
      }
     } else {
      if (!$59) {
       $$1$off0 = ($$lobit | 0) != 0; //@line 853
       $$1143 = $66; //@line 853
       $$1145 = $65; //@line 853
       $$3154 = 0; //@line 853
       label = 38; //@line 854
      } else {
       if ($64) {
        $$0142 = $66; //@line 857
        $$0144 = $65; //@line 857
       } else {
        $76 = _snprintf($66, $65, 1115, $vararg_buffer) | 0; //@line 859
        $$ = ($76 | 0) >= ($65 | 0) ? 0 : $76; //@line 861
        $78 = ($$ | 0) > 0; //@line 862
        $$0142 = $78 ? $66 + $$ | 0 : $66; //@line 867
        $$0144 = $65 - ($78 ? $$ : 0) | 0; //@line 867
       }
       if (($$0144 | 0) > 0) {
        $82 = $55 + -2 | 0; //@line 871
        switch ($82 >>> 1 | $82 << 31 | 0) {
        case 0:
         {
          $$sink = 1133; //@line 877
          label = 35; //@line 878
          break;
         }
        case 1:
         {
          $$sink = 1139; //@line 882
          label = 35; //@line 883
          break;
         }
        case 3:
         {
          $$sink = 1127; //@line 887
          label = 35; //@line 888
          break;
         }
        case 7:
         {
          $$sink = 1121; //@line 892
          label = 35; //@line 893
          break;
         }
        default:
         {
          $$0141 = 0; //@line 897
          $$1152 = 0; //@line 897
         }
        }
        if ((label | 0) == 35) {
         HEAP32[$vararg_buffer1 >> 2] = $$sink; //@line 901
         $$0141 = $60 & 1; //@line 904
         $$1152 = _snprintf($$0142, $$0144, 1145, $vararg_buffer1) | 0; //@line 904
        }
        $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 907
        $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 909
        if (($$1152$ | 0) > 0) {
         $89 = $$0141 << 24 >> 24 == 0; //@line 911
         $$1$off0 = $extract$t159; //@line 916
         $$1143 = $89 ? $$0142 : $$0142 + $$1152$ | 0; //@line 916
         $$1145 = $$0144 - ($89 ? 0 : $$1152$) | 0; //@line 916
         $$3154 = $$1152; //@line 916
         label = 38; //@line 917
        } else {
         $$1$off0 = $extract$t159; //@line 919
         $$1143 = $$0142; //@line 919
         $$1145 = $$0144; //@line 919
         $$3154 = $$1152$; //@line 919
         label = 38; //@line 920
        }
       }
      }
      L54 : do {
       if ((label | 0) == 38) {
        do {
         if (($$1145 | 0) > 0 & (HEAP32[51] | 0) != 0) {
          HEAP32[$4 >> 2] = HEAP32[$3 >> 2]; //@line 933
          $AsyncCtx60 = _emscripten_alloc_async_context(104, sp) | 0; //@line 934
          $95 = _vsnprintf(0, 0, $2, $4) | 0; //@line 935
          if (___async) {
           HEAP32[$AsyncCtx60 >> 2] = 23; //@line 938
           HEAP32[$AsyncCtx60 + 4 >> 2] = $vararg_buffer23; //@line 940
           HEAP32[$AsyncCtx60 + 8 >> 2] = $vararg_buffer23; //@line 942
           HEAP32[$AsyncCtx60 + 12 >> 2] = $vararg_buffer20; //@line 944
           HEAP32[$AsyncCtx60 + 16 >> 2] = $vararg_buffer20; //@line 946
           HEAP32[$AsyncCtx60 + 20 >> 2] = $vararg_buffer3; //@line 948
           HEAP32[$AsyncCtx60 + 24 >> 2] = $$1143; //@line 950
           HEAP32[$AsyncCtx60 + 28 >> 2] = $$1145; //@line 952
           HEAP32[$AsyncCtx60 + 32 >> 2] = $vararg_buffer3; //@line 954
           HEAP32[$AsyncCtx60 + 36 >> 2] = $4; //@line 956
           HEAP32[$AsyncCtx60 + 40 >> 2] = $55; //@line 958
           HEAP32[$AsyncCtx60 + 44 >> 2] = $vararg_buffer9; //@line 960
           HEAP32[$AsyncCtx60 + 48 >> 2] = $1; //@line 962
           HEAP32[$AsyncCtx60 + 52 >> 2] = $vararg_buffer9; //@line 964
           HEAP32[$AsyncCtx60 + 56 >> 2] = $vararg_buffer6; //@line 966
           HEAP32[$AsyncCtx60 + 60 >> 2] = $vararg_buffer6; //@line 968
           HEAP32[$AsyncCtx60 + 64 >> 2] = $vararg_buffer15; //@line 970
           HEAP32[$AsyncCtx60 + 68 >> 2] = $vararg_buffer15; //@line 972
           HEAP32[$AsyncCtx60 + 72 >> 2] = $vararg_buffer12; //@line 974
           HEAP32[$AsyncCtx60 + 76 >> 2] = $vararg_buffer12; //@line 976
           HEAP32[$AsyncCtx60 + 80 >> 2] = $vararg_buffer18; //@line 978
           HEAP32[$AsyncCtx60 + 84 >> 2] = $vararg_buffer18; //@line 980
           HEAP32[$AsyncCtx60 + 88 >> 2] = $2; //@line 982
           HEAP32[$AsyncCtx60 + 92 >> 2] = $3; //@line 984
           HEAP8[$AsyncCtx60 + 96 >> 0] = $$1$off0 & 1; //@line 987
           HEAP32[$AsyncCtx60 + 100 >> 2] = $$3154; //@line 989
           sp = STACKTOP; //@line 990
           STACKTOP = sp; //@line 991
           return;
          }
          _emscripten_free_async_context($AsyncCtx60 | 0); //@line 993
          $125 = HEAP32[51] | 0; //@line 998
          $AsyncCtx38 = _emscripten_alloc_async_context(100, sp) | 0; //@line 999
          $126 = FUNCTION_TABLE_ii[$125 & 1](($$3154 | 0 ? 4 : 0) + $$3154 + $95 | 0) | 0; //@line 1000
          if (___async) {
           HEAP32[$AsyncCtx38 >> 2] = 24; //@line 1003
           HEAP32[$AsyncCtx38 + 4 >> 2] = $vararg_buffer23; //@line 1005
           HEAP32[$AsyncCtx38 + 8 >> 2] = $vararg_buffer23; //@line 1007
           HEAP32[$AsyncCtx38 + 12 >> 2] = $vararg_buffer20; //@line 1009
           HEAP32[$AsyncCtx38 + 16 >> 2] = $vararg_buffer20; //@line 1011
           HEAP32[$AsyncCtx38 + 20 >> 2] = $vararg_buffer3; //@line 1013
           HEAP32[$AsyncCtx38 + 24 >> 2] = $$1143; //@line 1015
           HEAP32[$AsyncCtx38 + 28 >> 2] = $$1145; //@line 1017
           HEAP32[$AsyncCtx38 + 32 >> 2] = $vararg_buffer3; //@line 1019
           HEAP32[$AsyncCtx38 + 36 >> 2] = $4; //@line 1021
           HEAP32[$AsyncCtx38 + 40 >> 2] = $55; //@line 1023
           HEAP32[$AsyncCtx38 + 44 >> 2] = $vararg_buffer9; //@line 1025
           HEAP32[$AsyncCtx38 + 48 >> 2] = $1; //@line 1027
           HEAP32[$AsyncCtx38 + 52 >> 2] = $vararg_buffer9; //@line 1029
           HEAP32[$AsyncCtx38 + 56 >> 2] = $vararg_buffer6; //@line 1031
           HEAP32[$AsyncCtx38 + 60 >> 2] = $vararg_buffer6; //@line 1033
           HEAP32[$AsyncCtx38 + 64 >> 2] = $vararg_buffer15; //@line 1035
           HEAP32[$AsyncCtx38 + 68 >> 2] = $vararg_buffer15; //@line 1037
           HEAP32[$AsyncCtx38 + 72 >> 2] = $vararg_buffer12; //@line 1039
           HEAP32[$AsyncCtx38 + 76 >> 2] = $vararg_buffer12; //@line 1041
           HEAP32[$AsyncCtx38 + 80 >> 2] = $vararg_buffer18; //@line 1043
           HEAP32[$AsyncCtx38 + 84 >> 2] = $vararg_buffer18; //@line 1045
           HEAP32[$AsyncCtx38 + 88 >> 2] = $2; //@line 1047
           HEAP32[$AsyncCtx38 + 92 >> 2] = $3; //@line 1049
           HEAP8[$AsyncCtx38 + 96 >> 0] = $$1$off0 & 1; //@line 1052
           sp = STACKTOP; //@line 1053
           STACKTOP = sp; //@line 1054
           return;
          } else {
           _emscripten_free_async_context($AsyncCtx38 | 0); //@line 1056
           HEAP32[$vararg_buffer3 >> 2] = $126; //@line 1057
           $151 = _snprintf($$1143, $$1145, 1145, $vararg_buffer3) | 0; //@line 1058
           $$10 = ($151 | 0) >= ($$1145 | 0) ? 0 : $151; //@line 1060
           if (($$10 | 0) > 0) {
            $$3 = $$1143 + $$10 | 0; //@line 1065
            $$3147 = $$1145 - $$10 | 0; //@line 1065
            label = 44; //@line 1066
            break;
           } else {
            $$3147168 = $$1145; //@line 1069
            $$3169 = $$1143; //@line 1069
            break;
           }
          }
         } else {
          $$3 = $$1143; //@line 1074
          $$3147 = $$1145; //@line 1074
          label = 44; //@line 1075
         }
        } while (0);
        if ((label | 0) == 44) {
         if (($$3147 | 0) > 0) {
          $$3147168 = $$3147; //@line 1081
          $$3169 = $$3; //@line 1081
         } else {
          break;
         }
        }
        $157 = $55 + -2 | 0; //@line 1086
        switch ($157 >>> 1 | $157 << 31 | 0) {
        case 0:
         {
          HEAP32[$vararg_buffer6 >> 2] = $1; //@line 1092
          $$5156 = _snprintf($$3169, $$3147168, 1148, $vararg_buffer6) | 0; //@line 1094
          break;
         }
        case 1:
         {
          HEAP32[$vararg_buffer9 >> 2] = $1; //@line 1098
          $$5156 = _snprintf($$3169, $$3147168, 1163, $vararg_buffer9) | 0; //@line 1100
          break;
         }
        case 3:
         {
          HEAP32[$vararg_buffer12 >> 2] = $1; //@line 1104
          $$5156 = _snprintf($$3169, $$3147168, 1178, $vararg_buffer12) | 0; //@line 1106
          break;
         }
        case 7:
         {
          HEAP32[$vararg_buffer15 >> 2] = $1; //@line 1110
          $$5156 = _snprintf($$3169, $$3147168, 1193, $vararg_buffer15) | 0; //@line 1112
          break;
         }
        default:
         {
          $$5156 = _snprintf($$3169, $$3147168, 1208, $vararg_buffer18) | 0; //@line 1117
         }
        }
        $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 1121
        $168 = $$3169 + $$5156$ | 0; //@line 1123
        $169 = $$3147168 - $$5156$ | 0; //@line 1124
        if (($$5156$ | 0) > 0 & ($169 | 0) > 0) {
         $AsyncCtx56 = _emscripten_alloc_async_context(32, sp) | 0; //@line 1128
         $171 = _vsnprintf($168, $169, $2, $3) | 0; //@line 1129
         if (___async) {
          HEAP32[$AsyncCtx56 >> 2] = 25; //@line 1132
          HEAP32[$AsyncCtx56 + 4 >> 2] = $vararg_buffer23; //@line 1134
          HEAP32[$AsyncCtx56 + 8 >> 2] = $vararg_buffer23; //@line 1136
          HEAP32[$AsyncCtx56 + 12 >> 2] = $vararg_buffer20; //@line 1138
          HEAP32[$AsyncCtx56 + 16 >> 2] = $vararg_buffer20; //@line 1140
          HEAP32[$AsyncCtx56 + 20 >> 2] = $169; //@line 1142
          HEAP32[$AsyncCtx56 + 24 >> 2] = $168; //@line 1144
          HEAP8[$AsyncCtx56 + 28 >> 0] = $$1$off0 & 1; //@line 1147
          sp = STACKTOP; //@line 1148
          STACKTOP = sp; //@line 1149
          return;
         }
         _emscripten_free_async_context($AsyncCtx56 | 0); //@line 1151
         $$13 = ($171 | 0) >= ($169 | 0) ? 0 : $171; //@line 1153
         $181 = $168 + $$13 | 0; //@line 1155
         $182 = $169 - $$13 | 0; //@line 1156
         if (($$13 | 0) > 0) {
          $184 = HEAP32[52] | 0; //@line 1159
          do {
           if (($182 | 0) > 0 & ($184 | 0) != 0) {
            $AsyncCtx42 = _emscripten_alloc_async_context(32, sp) | 0; //@line 1164
            $186 = FUNCTION_TABLE_i[$184 & 0]() | 0; //@line 1165
            if (___async) {
             HEAP32[$AsyncCtx42 >> 2] = 26; //@line 1168
             HEAP32[$AsyncCtx42 + 4 >> 2] = $vararg_buffer20; //@line 1170
             HEAP32[$AsyncCtx42 + 8 >> 2] = $181; //@line 1172
             HEAP32[$AsyncCtx42 + 12 >> 2] = $182; //@line 1174
             HEAP32[$AsyncCtx42 + 16 >> 2] = $vararg_buffer20; //@line 1176
             HEAP8[$AsyncCtx42 + 20 >> 0] = $$1$off0 & 1; //@line 1179
             HEAP32[$AsyncCtx42 + 24 >> 2] = $vararg_buffer23; //@line 1181
             HEAP32[$AsyncCtx42 + 28 >> 2] = $vararg_buffer23; //@line 1183
             sp = STACKTOP; //@line 1184
             STACKTOP = sp; //@line 1185
             return;
            } else {
             _emscripten_free_async_context($AsyncCtx42 | 0); //@line 1187
             HEAP32[$vararg_buffer20 >> 2] = $186; //@line 1188
             $194 = _snprintf($181, $182, 1145, $vararg_buffer20) | 0; //@line 1189
             $$18 = ($194 | 0) >= ($182 | 0) ? 0 : $194; //@line 1191
             if (($$18 | 0) > 0) {
              $$6 = $181 + $$18 | 0; //@line 1196
              $$6150 = $182 - $$18 | 0; //@line 1196
              $$9 = $$18; //@line 1196
              break;
             } else {
              break L54;
             }
            }
           } else {
            $$6 = $181; //@line 1203
            $$6150 = $182; //@line 1203
            $$9 = $$13; //@line 1203
           }
          } while (0);
          if (!(($$9 | 0) < 1 | ($$6150 | 0) < 1 | $$1$off0 ^ 1)) {
           _snprintf($$6, $$6150, 1223, $vararg_buffer23) | 0; //@line 1212
          }
         }
        }
       }
      } while (0);
      $201 = HEAP32[53] | 0; //@line 1218
      $202 = HEAP32[46] | 0; //@line 1219
      $AsyncCtx45 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1220
      FUNCTION_TABLE_vi[$201 & 127]($202); //@line 1221
      if (___async) {
       HEAP32[$AsyncCtx45 >> 2] = 27; //@line 1224
       sp = STACKTOP; //@line 1225
       STACKTOP = sp; //@line 1226
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx45 | 0); //@line 1228
       break;
      }
     }
    } while (0);
    HEAP32[50] = HEAP32[48]; //@line 1234
   }
  }
 } while (0);
 $204 = HEAP32[56] | 0; //@line 1238
 if (!$204) {
  STACKTOP = sp; //@line 1241
  return;
 }
 $206 = HEAP32[57] | 0; //@line 1243
 HEAP32[57] = 0; //@line 1244
 $AsyncCtx49 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1245
 FUNCTION_TABLE_v[$204 & 0](); //@line 1246
 if (___async) {
  HEAP32[$AsyncCtx49 >> 2] = 28; //@line 1249
  HEAP32[$AsyncCtx49 + 4 >> 2] = $206; //@line 1251
  sp = STACKTOP; //@line 1252
  STACKTOP = sp; //@line 1253
  return;
 }
 _emscripten_free_async_context($AsyncCtx49 | 0); //@line 1255
 if (($206 | 0) > 1) {
  $$0199 = $206; //@line 1258
 } else {
  STACKTOP = sp; //@line 1260
  return;
 }
 while (1) {
  $209 = $$0199 + -1 | 0; //@line 1263
  $$pre = HEAP32[56] | 0; //@line 1264
  $AsyncCtx52 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1265
  FUNCTION_TABLE_v[$$pre & 0](); //@line 1266
  if (___async) {
   label = 70; //@line 1269
   break;
  }
  _emscripten_free_async_context($AsyncCtx52 | 0); //@line 1272
  if (($$0199 | 0) > 2) {
   $$0199 = $209; //@line 1275
  } else {
   label = 72; //@line 1277
   break;
  }
 }
 if ((label | 0) == 70) {
  HEAP32[$AsyncCtx52 >> 2] = 29; //@line 1282
  HEAP32[$AsyncCtx52 + 4 >> 2] = $$0199; //@line 1284
  HEAP32[$AsyncCtx52 + 8 >> 2] = $209; //@line 1286
  sp = STACKTOP; //@line 1287
  STACKTOP = sp; //@line 1288
  return;
 } else if ((label | 0) == 72) {
  STACKTOP = sp; //@line 1291
  return;
 }
}
function _mbed_vtracef__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$1$off0 = 0, $$1$off0$expand_i1_val = 0, $$1$off0$expand_i1_val18 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$3154 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $$lobit = 0, $$sink = 0, $10 = 0, $102 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $136 = 0, $14 = 0, $147 = 0, $148 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $163 = 0, $164 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $26 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $57 = 0, $6 = 0, $62 = 0, $73 = 0, $74 = 0, $78 = 0, $79 = 0, $8 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $89 = 0, $91 = 0, $95 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx11 = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx7 = 0, $ReallocAsyncCtx8 = 0, $extract$t159 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13118
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13120
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13122
 $6 = HEAP8[$0 + 12 >> 0] | 0; //@line 13124
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13126
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13128
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13130
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 13132
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 13134
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 13136
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 13138
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 13140
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 13144
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 13148
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 13150
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 13152
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 13154
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 13156
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 13158
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 13160
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 13162
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 13164
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 13166
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 13168
 HEAP32[57] = (HEAP32[57] | 0) + 1; //@line 13171
 $53 = HEAP32[46] | 0; //@line 13172
 do {
  if ($53 | 0) {
   HEAP8[$53 >> 0] = 0; //@line 13176
   do {
    if ($6 << 24 >> 24 > -1 & ($4 | 0) != 0) {
     $57 = HEAP32[43] | 0; //@line 13182
     if (HEAP8[$57 >> 0] | 0) {
      if (_strstr($57, $4) | 0) {
       $$0$i = 1; //@line 13189
       break;
      }
     }
     $62 = HEAP32[44] | 0; //@line 13193
     if (!(HEAP8[$62 >> 0] | 0)) {
      label = 9; //@line 13197
     } else {
      if (!(_strstr($62, $4) | 0)) {
       $$0$i = 1; //@line 13202
      } else {
       label = 9; //@line 13204
      }
     }
    } else {
     label = 9; //@line 13208
    }
   } while (0);
   if ((label | 0) == 9) {
    $$0$i = 0; //@line 13212
   }
   if (!((HEAP32[53] | 0) != 0 & ((($4 | 0) == 0 | (($2 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[50] = HEAP32[48]; //@line 13224
    break;
   }
   $73 = HEAPU8[168] | 0; //@line 13228
   $74 = $6 & 255; //@line 13229
   if ($74 & 31 & $73 | 0) {
    $78 = $73 & 64; //@line 13234
    $$lobit = $78 >>> 6; //@line 13235
    $79 = $$lobit & 255; //@line 13236
    $83 = ($73 & 32 | 0) == 0; //@line 13240
    $84 = HEAP32[47] | 0; //@line 13241
    $85 = HEAP32[46] | 0; //@line 13242
    $86 = $6 << 24 >> 24 == 1; //@line 13243
    if ($86 | ($73 & 128 | 0) != 0) {
     $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 13246
     _vsnprintf($85, $84, $2, $20) | 0; //@line 13247
     if (___async) {
      HEAP32[$ReallocAsyncCtx12 >> 2] = 19; //@line 13250
      $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 13251
      $$expand_i1_val = $86 & 1; //@line 13252
      HEAP8[$87 >> 0] = $$expand_i1_val; //@line 13253
      sp = STACKTOP; //@line 13254
      return;
     }
     ___async_unwind = 0; //@line 13257
     HEAP32[$ReallocAsyncCtx12 >> 2] = 19; //@line 13258
     $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 13259
     $$expand_i1_val = $86 & 1; //@line 13260
     HEAP8[$87 >> 0] = $$expand_i1_val; //@line 13261
     sp = STACKTOP; //@line 13262
     return;
    }
    if (!$78) {
     $$1$off0 = ($$lobit | 0) != 0; //@line 13268
     $$1143 = $85; //@line 13268
     $$1145 = $84; //@line 13268
     $$3154 = 0; //@line 13268
     label = 28; //@line 13269
    } else {
     if ($83) {
      $$0142 = $85; //@line 13272
      $$0144 = $84; //@line 13272
     } else {
      $89 = _snprintf($85, $84, 1115, $22) | 0; //@line 13274
      $$ = ($89 | 0) >= ($84 | 0) ? 0 : $89; //@line 13276
      $91 = ($$ | 0) > 0; //@line 13277
      $$0142 = $91 ? $85 + $$ | 0 : $85; //@line 13282
      $$0144 = $84 - ($91 ? $$ : 0) | 0; //@line 13282
     }
     if (($$0144 | 0) > 0) {
      $95 = $74 + -2 | 0; //@line 13286
      switch ($95 >>> 1 | $95 << 31 | 0) {
      case 0:
       {
        $$sink = 1133; //@line 13292
        label = 25; //@line 13293
        break;
       }
      case 1:
       {
        $$sink = 1139; //@line 13297
        label = 25; //@line 13298
        break;
       }
      case 3:
       {
        $$sink = 1127; //@line 13302
        label = 25; //@line 13303
        break;
       }
      case 7:
       {
        $$sink = 1121; //@line 13307
        label = 25; //@line 13308
        break;
       }
      default:
       {
        $$0141 = 0; //@line 13312
        $$1152 = 0; //@line 13312
       }
      }
      if ((label | 0) == 25) {
       HEAP32[$26 >> 2] = $$sink; //@line 13316
       $$0141 = $79 & 1; //@line 13319
       $$1152 = _snprintf($$0142, $$0144, 1145, $26) | 0; //@line 13319
      }
      $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 13322
      $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 13324
      if (($$1152$ | 0) > 0) {
       $102 = $$0141 << 24 >> 24 == 0; //@line 13326
       $$1$off0 = $extract$t159; //@line 13331
       $$1143 = $102 ? $$0142 : $$0142 + $$1152$ | 0; //@line 13331
       $$1145 = $$0144 - ($102 ? 0 : $$1152$) | 0; //@line 13331
       $$3154 = $$1152; //@line 13331
       label = 28; //@line 13332
      } else {
       $$1$off0 = $extract$t159; //@line 13334
       $$1143 = $$0142; //@line 13334
       $$1145 = $$0144; //@line 13334
       $$3154 = $$1152$; //@line 13334
       label = 28; //@line 13335
      }
     }
    }
    if ((label | 0) == 28) {
     if (($$1145 | 0) > 0 & (HEAP32[51] | 0) != 0) {
      HEAP32[$30 >> 2] = HEAP32[$20 >> 2]; //@line 13346
      $ReallocAsyncCtx11 = _emscripten_realloc_async_context(104) | 0; //@line 13347
      $108 = _vsnprintf(0, 0, $2, $30) | 0; //@line 13348
      if (___async) {
       HEAP32[$ReallocAsyncCtx11 >> 2] = 23; //@line 13351
       $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 13352
       HEAP32[$109 >> 2] = $8; //@line 13353
       $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 13354
       HEAP32[$110 >> 2] = $10; //@line 13355
       $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 13356
       HEAP32[$111 >> 2] = $12; //@line 13357
       $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 13358
       HEAP32[$112 >> 2] = $14; //@line 13359
       $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 13360
       HEAP32[$113 >> 2] = $16; //@line 13361
       $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 13362
       HEAP32[$114 >> 2] = $$1143; //@line 13363
       $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 13364
       HEAP32[$115 >> 2] = $$1145; //@line 13365
       $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 13366
       HEAP32[$116 >> 2] = $18; //@line 13367
       $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 13368
       HEAP32[$117 >> 2] = $30; //@line 13369
       $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 13370
       HEAP32[$118 >> 2] = $74; //@line 13371
       $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 13372
       HEAP32[$119 >> 2] = $32; //@line 13373
       $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 13374
       HEAP32[$120 >> 2] = $4; //@line 13375
       $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 13376
       HEAP32[$121 >> 2] = $34; //@line 13377
       $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 13378
       HEAP32[$122 >> 2] = $36; //@line 13379
       $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 13380
       HEAP32[$123 >> 2] = $38; //@line 13381
       $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 13382
       HEAP32[$124 >> 2] = $40; //@line 13383
       $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 13384
       HEAP32[$125 >> 2] = $42; //@line 13385
       $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 13386
       HEAP32[$126 >> 2] = $44; //@line 13387
       $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 13388
       HEAP32[$127 >> 2] = $46; //@line 13389
       $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 13390
       HEAP32[$128 >> 2] = $48; //@line 13391
       $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 13392
       HEAP32[$129 >> 2] = $50; //@line 13393
       $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 13394
       HEAP32[$130 >> 2] = $2; //@line 13395
       $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 13396
       HEAP32[$131 >> 2] = $20; //@line 13397
       $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 13398
       $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 13399
       HEAP8[$132 >> 0] = $$1$off0$expand_i1_val; //@line 13400
       $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 13401
       HEAP32[$133 >> 2] = $$3154; //@line 13402
       sp = STACKTOP; //@line 13403
       return;
      }
      HEAP32[___async_retval >> 2] = $108; //@line 13407
      ___async_unwind = 0; //@line 13408
      HEAP32[$ReallocAsyncCtx11 >> 2] = 23; //@line 13409
      $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 13410
      HEAP32[$109 >> 2] = $8; //@line 13411
      $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 13412
      HEAP32[$110 >> 2] = $10; //@line 13413
      $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 13414
      HEAP32[$111 >> 2] = $12; //@line 13415
      $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 13416
      HEAP32[$112 >> 2] = $14; //@line 13417
      $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 13418
      HEAP32[$113 >> 2] = $16; //@line 13419
      $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 13420
      HEAP32[$114 >> 2] = $$1143; //@line 13421
      $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 13422
      HEAP32[$115 >> 2] = $$1145; //@line 13423
      $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 13424
      HEAP32[$116 >> 2] = $18; //@line 13425
      $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 13426
      HEAP32[$117 >> 2] = $30; //@line 13427
      $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 13428
      HEAP32[$118 >> 2] = $74; //@line 13429
      $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 13430
      HEAP32[$119 >> 2] = $32; //@line 13431
      $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 13432
      HEAP32[$120 >> 2] = $4; //@line 13433
      $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 13434
      HEAP32[$121 >> 2] = $34; //@line 13435
      $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 13436
      HEAP32[$122 >> 2] = $36; //@line 13437
      $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 13438
      HEAP32[$123 >> 2] = $38; //@line 13439
      $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 13440
      HEAP32[$124 >> 2] = $40; //@line 13441
      $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 13442
      HEAP32[$125 >> 2] = $42; //@line 13443
      $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 13444
      HEAP32[$126 >> 2] = $44; //@line 13445
      $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 13446
      HEAP32[$127 >> 2] = $46; //@line 13447
      $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 13448
      HEAP32[$128 >> 2] = $48; //@line 13449
      $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 13450
      HEAP32[$129 >> 2] = $50; //@line 13451
      $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 13452
      HEAP32[$130 >> 2] = $2; //@line 13453
      $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 13454
      HEAP32[$131 >> 2] = $20; //@line 13455
      $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 13456
      $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 13457
      HEAP8[$132 >> 0] = $$1$off0$expand_i1_val; //@line 13458
      $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 13459
      HEAP32[$133 >> 2] = $$3154; //@line 13460
      sp = STACKTOP; //@line 13461
      return;
     }
     if (($$1145 | 0) > 0) {
      $136 = $74 + -2 | 0; //@line 13466
      switch ($136 >>> 1 | $136 << 31 | 0) {
      case 0:
       {
        HEAP32[$36 >> 2] = $4; //@line 13472
        $$5156 = _snprintf($$1143, $$1145, 1148, $36) | 0; //@line 13474
        break;
       }
      case 1:
       {
        HEAP32[$32 >> 2] = $4; //@line 13478
        $$5156 = _snprintf($$1143, $$1145, 1163, $32) | 0; //@line 13480
        break;
       }
      case 3:
       {
        HEAP32[$44 >> 2] = $4; //@line 13484
        $$5156 = _snprintf($$1143, $$1145, 1178, $44) | 0; //@line 13486
        break;
       }
      case 7:
       {
        HEAP32[$40 >> 2] = $4; //@line 13490
        $$5156 = _snprintf($$1143, $$1145, 1193, $40) | 0; //@line 13492
        break;
       }
      default:
       {
        $$5156 = _snprintf($$1143, $$1145, 1208, $48) | 0; //@line 13497
       }
      }
      $$5156$ = ($$5156 | 0) < ($$1145 | 0) ? $$5156 : 0; //@line 13501
      $147 = $$1143 + $$5156$ | 0; //@line 13503
      $148 = $$1145 - $$5156$ | 0; //@line 13504
      if (($$5156$ | 0) > 0 & ($148 | 0) > 0) {
       $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 13508
       $150 = _vsnprintf($147, $148, $2, $20) | 0; //@line 13509
       if (___async) {
        HEAP32[$ReallocAsyncCtx10 >> 2] = 25; //@line 13512
        $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 13513
        HEAP32[$151 >> 2] = $8; //@line 13514
        $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 13515
        HEAP32[$152 >> 2] = $10; //@line 13516
        $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 13517
        HEAP32[$153 >> 2] = $12; //@line 13518
        $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 13519
        HEAP32[$154 >> 2] = $14; //@line 13520
        $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 13521
        HEAP32[$155 >> 2] = $148; //@line 13522
        $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 13523
        HEAP32[$156 >> 2] = $147; //@line 13524
        $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 13525
        $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 13526
        HEAP8[$157 >> 0] = $$1$off0$expand_i1_val18; //@line 13527
        sp = STACKTOP; //@line 13528
        return;
       }
       HEAP32[___async_retval >> 2] = $150; //@line 13532
       ___async_unwind = 0; //@line 13533
       HEAP32[$ReallocAsyncCtx10 >> 2] = 25; //@line 13534
       $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 13535
       HEAP32[$151 >> 2] = $8; //@line 13536
       $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 13537
       HEAP32[$152 >> 2] = $10; //@line 13538
       $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 13539
       HEAP32[$153 >> 2] = $12; //@line 13540
       $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 13541
       HEAP32[$154 >> 2] = $14; //@line 13542
       $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 13543
       HEAP32[$155 >> 2] = $148; //@line 13544
       $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 13545
       HEAP32[$156 >> 2] = $147; //@line 13546
       $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 13547
       $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 13548
       HEAP8[$157 >> 0] = $$1$off0$expand_i1_val18; //@line 13549
       sp = STACKTOP; //@line 13550
       return;
      }
     }
    }
    $159 = HEAP32[53] | 0; //@line 13555
    $160 = HEAP32[46] | 0; //@line 13556
    $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 13557
    FUNCTION_TABLE_vi[$159 & 127]($160); //@line 13558
    if (___async) {
     HEAP32[$ReallocAsyncCtx7 >> 2] = 27; //@line 13561
     sp = STACKTOP; //@line 13562
     return;
    }
    ___async_unwind = 0; //@line 13565
    HEAP32[$ReallocAsyncCtx7 >> 2] = 27; //@line 13566
    sp = STACKTOP; //@line 13567
    return;
   }
  }
 } while (0);
 $161 = HEAP32[56] | 0; //@line 13572
 if (!$161) {
  return;
 }
 $163 = HEAP32[57] | 0; //@line 13577
 HEAP32[57] = 0; //@line 13578
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 13579
 FUNCTION_TABLE_v[$161 & 0](); //@line 13580
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 28; //@line 13583
  $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 13584
  HEAP32[$164 >> 2] = $163; //@line 13585
  sp = STACKTOP; //@line 13586
  return;
 }
 ___async_unwind = 0; //@line 13589
 HEAP32[$ReallocAsyncCtx8 >> 2] = 28; //@line 13590
 $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 13591
 HEAP32[$164 >> 2] = $163; //@line 13592
 sp = STACKTOP; //@line 13593
 return;
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 4758
 $3 = HEAP32[1050] | 0; //@line 4759
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 4762
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 4766
 $7 = $6 & 3; //@line 4767
 if (($7 | 0) == 1) {
  _abort(); //@line 4770
 }
 $9 = $6 & -8; //@line 4773
 $10 = $2 + $9 | 0; //@line 4774
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 4779
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 4785
   $17 = $13 + $9 | 0; //@line 4786
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 4789
   }
   if ((HEAP32[1051] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 4795
    $106 = HEAP32[$105 >> 2] | 0; //@line 4796
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 4800
     $$1382 = $17; //@line 4800
     $114 = $16; //@line 4800
     break;
    }
    HEAP32[1048] = $17; //@line 4803
    HEAP32[$105 >> 2] = $106 & -2; //@line 4805
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 4808
    HEAP32[$16 + $17 >> 2] = $17; //@line 4810
    return;
   }
   $21 = $13 >>> 3; //@line 4813
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 4817
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 4819
    $28 = 4224 + ($21 << 1 << 2) | 0; //@line 4821
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 4826
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 4833
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1046] = HEAP32[1046] & ~(1 << $21); //@line 4843
     $$1 = $16; //@line 4844
     $$1382 = $17; //@line 4844
     $114 = $16; //@line 4844
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 4850
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 4854
     }
     $41 = $26 + 8 | 0; //@line 4857
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 4861
     } else {
      _abort(); //@line 4863
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 4868
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 4869
    $$1 = $16; //@line 4870
    $$1382 = $17; //@line 4870
    $114 = $16; //@line 4870
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 4874
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 4876
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 4880
     $60 = $59 + 4 | 0; //@line 4881
     $61 = HEAP32[$60 >> 2] | 0; //@line 4882
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 4885
      if (!$63) {
       $$3 = 0; //@line 4888
       break;
      } else {
       $$1387 = $63; //@line 4891
       $$1390 = $59; //@line 4891
      }
     } else {
      $$1387 = $61; //@line 4894
      $$1390 = $60; //@line 4894
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 4897
      $66 = HEAP32[$65 >> 2] | 0; //@line 4898
      if ($66 | 0) {
       $$1387 = $66; //@line 4901
       $$1390 = $65; //@line 4901
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 4904
      $69 = HEAP32[$68 >> 2] | 0; //@line 4905
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 4910
       $$1390 = $68; //@line 4910
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 4915
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 4918
      $$3 = $$1387; //@line 4919
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 4924
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 4927
     }
     $53 = $51 + 12 | 0; //@line 4930
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 4934
     }
     $56 = $48 + 8 | 0; //@line 4937
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 4941
      HEAP32[$56 >> 2] = $51; //@line 4942
      $$3 = $48; //@line 4943
      break;
     } else {
      _abort(); //@line 4946
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 4953
    $$1382 = $17; //@line 4953
    $114 = $16; //@line 4953
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 4956
    $75 = 4488 + ($74 << 2) | 0; //@line 4957
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 4962
      if (!$$3) {
       HEAP32[1047] = HEAP32[1047] & ~(1 << $74); //@line 4969
       $$1 = $16; //@line 4970
       $$1382 = $17; //@line 4970
       $114 = $16; //@line 4970
       break L10;
      }
     } else {
      if ((HEAP32[1050] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 4977
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 4985
       if (!$$3) {
        $$1 = $16; //@line 4988
        $$1382 = $17; //@line 4988
        $114 = $16; //@line 4988
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1050] | 0; //@line 4996
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 4999
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 5003
    $92 = $16 + 16 | 0; //@line 5004
    $93 = HEAP32[$92 >> 2] | 0; //@line 5005
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 5011
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 5015
       HEAP32[$93 + 24 >> 2] = $$3; //@line 5017
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 5023
    if (!$99) {
     $$1 = $16; //@line 5026
     $$1382 = $17; //@line 5026
     $114 = $16; //@line 5026
    } else {
     if ((HEAP32[1050] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 5031
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 5035
      HEAP32[$99 + 24 >> 2] = $$3; //@line 5037
      $$1 = $16; //@line 5038
      $$1382 = $17; //@line 5038
      $114 = $16; //@line 5038
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 5044
   $$1382 = $9; //@line 5044
   $114 = $2; //@line 5044
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 5049
 }
 $115 = $10 + 4 | 0; //@line 5052
 $116 = HEAP32[$115 >> 2] | 0; //@line 5053
 if (!($116 & 1)) {
  _abort(); //@line 5057
 }
 if (!($116 & 2)) {
  if ((HEAP32[1052] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1049] | 0) + $$1382 | 0; //@line 5067
   HEAP32[1049] = $124; //@line 5068
   HEAP32[1052] = $$1; //@line 5069
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 5072
   if (($$1 | 0) != (HEAP32[1051] | 0)) {
    return;
   }
   HEAP32[1051] = 0; //@line 5078
   HEAP32[1048] = 0; //@line 5079
   return;
  }
  if ((HEAP32[1051] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1048] | 0) + $$1382 | 0; //@line 5086
   HEAP32[1048] = $132; //@line 5087
   HEAP32[1051] = $114; //@line 5088
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 5091
   HEAP32[$114 + $132 >> 2] = $132; //@line 5093
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 5097
  $138 = $116 >>> 3; //@line 5098
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 5103
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 5105
    $145 = 4224 + ($138 << 1 << 2) | 0; //@line 5107
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1050] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 5113
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 5120
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1046] = HEAP32[1046] & ~(1 << $138); //@line 5130
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 5136
    } else {
     if ((HEAP32[1050] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 5141
     }
     $160 = $143 + 8 | 0; //@line 5144
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 5148
     } else {
      _abort(); //@line 5150
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 5155
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 5156
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 5159
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 5161
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 5165
      $180 = $179 + 4 | 0; //@line 5166
      $181 = HEAP32[$180 >> 2] | 0; //@line 5167
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 5170
       if (!$183) {
        $$3400 = 0; //@line 5173
        break;
       } else {
        $$1398 = $183; //@line 5176
        $$1402 = $179; //@line 5176
       }
      } else {
       $$1398 = $181; //@line 5179
       $$1402 = $180; //@line 5179
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 5182
       $186 = HEAP32[$185 >> 2] | 0; //@line 5183
       if ($186 | 0) {
        $$1398 = $186; //@line 5186
        $$1402 = $185; //@line 5186
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 5189
       $189 = HEAP32[$188 >> 2] | 0; //@line 5190
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 5195
        $$1402 = $188; //@line 5195
       }
      }
      if ((HEAP32[1050] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 5201
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 5204
       $$3400 = $$1398; //@line 5205
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 5210
      if ((HEAP32[1050] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 5214
      }
      $173 = $170 + 12 | 0; //@line 5217
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 5221
      }
      $176 = $167 + 8 | 0; //@line 5224
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 5228
       HEAP32[$176 >> 2] = $170; //@line 5229
       $$3400 = $167; //@line 5230
       break;
      } else {
       _abort(); //@line 5233
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 5241
     $196 = 4488 + ($195 << 2) | 0; //@line 5242
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 5247
       if (!$$3400) {
        HEAP32[1047] = HEAP32[1047] & ~(1 << $195); //@line 5254
        break L108;
       }
      } else {
       if ((HEAP32[1050] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 5261
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 5269
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1050] | 0; //@line 5279
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 5282
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 5286
     $213 = $10 + 16 | 0; //@line 5287
     $214 = HEAP32[$213 >> 2] | 0; //@line 5288
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 5294
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 5298
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 5300
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 5306
     if ($220 | 0) {
      if ((HEAP32[1050] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 5312
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 5316
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 5318
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 5327
  HEAP32[$114 + $137 >> 2] = $137; //@line 5329
  if (($$1 | 0) == (HEAP32[1051] | 0)) {
   HEAP32[1048] = $137; //@line 5333
   return;
  } else {
   $$2 = $137; //@line 5336
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 5340
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 5343
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 5345
  $$2 = $$1382; //@line 5346
 }
 $235 = $$2 >>> 3; //@line 5348
 if ($$2 >>> 0 < 256) {
  $238 = 4224 + ($235 << 1 << 2) | 0; //@line 5352
  $239 = HEAP32[1046] | 0; //@line 5353
  $240 = 1 << $235; //@line 5354
  if (!($239 & $240)) {
   HEAP32[1046] = $239 | $240; //@line 5359
   $$0403 = $238; //@line 5361
   $$pre$phiZ2D = $238 + 8 | 0; //@line 5361
  } else {
   $244 = $238 + 8 | 0; //@line 5363
   $245 = HEAP32[$244 >> 2] | 0; //@line 5364
   if ((HEAP32[1050] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 5368
   } else {
    $$0403 = $245; //@line 5371
    $$pre$phiZ2D = $244; //@line 5371
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 5374
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 5376
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 5378
  HEAP32[$$1 + 12 >> 2] = $238; //@line 5380
  return;
 }
 $251 = $$2 >>> 8; //@line 5383
 if (!$251) {
  $$0396 = 0; //@line 5386
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 5390
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 5394
   $257 = $251 << $256; //@line 5395
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 5398
   $262 = $257 << $260; //@line 5400
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 5403
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 5408
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 5414
  }
 }
 $276 = 4488 + ($$0396 << 2) | 0; //@line 5417
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 5419
 HEAP32[$$1 + 20 >> 2] = 0; //@line 5422
 HEAP32[$$1 + 16 >> 2] = 0; //@line 5423
 $280 = HEAP32[1047] | 0; //@line 5424
 $281 = 1 << $$0396; //@line 5425
 do {
  if (!($280 & $281)) {
   HEAP32[1047] = $280 | $281; //@line 5431
   HEAP32[$276 >> 2] = $$1; //@line 5432
   HEAP32[$$1 + 24 >> 2] = $276; //@line 5434
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 5436
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 5438
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 5446
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 5446
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 5453
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 5457
    $301 = HEAP32[$299 >> 2] | 0; //@line 5459
    if (!$301) {
     label = 121; //@line 5462
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 5465
     $$0384 = $301; //@line 5465
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1050] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 5472
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 5475
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 5477
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 5479
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 5481
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 5486
    $309 = HEAP32[$308 >> 2] | 0; //@line 5487
    $310 = HEAP32[1050] | 0; //@line 5488
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 5494
     HEAP32[$308 >> 2] = $$1; //@line 5495
     HEAP32[$$1 + 8 >> 2] = $309; //@line 5497
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 5499
     HEAP32[$$1 + 24 >> 2] = 0; //@line 5501
     break;
    } else {
     _abort(); //@line 5504
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1054] | 0) + -1 | 0; //@line 5511
 HEAP32[1054] = $319; //@line 5512
 if (!$319) {
  $$0212$in$i = 4640; //@line 5515
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 5520
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 5526
  }
 }
 HEAP32[1054] = -1; //@line 5529
 return;
}
function _main() {
 var $AsyncCtx = 0, $AsyncCtx101 = 0, $AsyncCtx104 = 0, $AsyncCtx107 = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx62 = 0, $AsyncCtx65 = 0, $AsyncCtx68 = 0, $AsyncCtx7 = 0, $AsyncCtx71 = 0, $AsyncCtx74 = 0, $AsyncCtx77 = 0, $AsyncCtx80 = 0, $AsyncCtx83 = 0, $AsyncCtx86 = 0, $AsyncCtx89 = 0, $AsyncCtx92 = 0, $AsyncCtx95 = 0, $AsyncCtx98 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1931
 while (1) {
  $AsyncCtx59 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1933
  __ZN4mbed6BusOutaSEi(4108, 0) | 0; //@line 1934
  if (___async) {
   label = 3; //@line 1937
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 1940
  $AsyncCtx107 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1941
  _wait(.25); //@line 1942
  if (___async) {
   label = 5; //@line 1945
   break;
  }
  _emscripten_free_async_context($AsyncCtx107 | 0); //@line 1948
  $AsyncCtx55 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1949
  __ZN4mbed6BusOutaSEi(4108, 1) | 0; //@line 1950
  if (___async) {
   label = 7; //@line 1953
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 1956
  $AsyncCtx104 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1957
  _wait(.25); //@line 1958
  if (___async) {
   label = 9; //@line 1961
   break;
  }
  _emscripten_free_async_context($AsyncCtx104 | 0); //@line 1964
  $AsyncCtx51 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1965
  __ZN4mbed6BusOutaSEi(4108, 2) | 0; //@line 1966
  if (___async) {
   label = 11; //@line 1969
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 1972
  $AsyncCtx101 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1973
  _wait(.25); //@line 1974
  if (___async) {
   label = 13; //@line 1977
   break;
  }
  _emscripten_free_async_context($AsyncCtx101 | 0); //@line 1980
  $AsyncCtx47 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1981
  __ZN4mbed6BusOutaSEi(4108, 3) | 0; //@line 1982
  if (___async) {
   label = 15; //@line 1985
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 1988
  $AsyncCtx98 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1989
  _wait(.25); //@line 1990
  if (___async) {
   label = 17; //@line 1993
   break;
  }
  _emscripten_free_async_context($AsyncCtx98 | 0); //@line 1996
  $AsyncCtx43 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1997
  __ZN4mbed6BusOutaSEi(4108, 4) | 0; //@line 1998
  if (___async) {
   label = 19; //@line 2001
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 2004
  $AsyncCtx95 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2005
  _wait(.25); //@line 2006
  if (___async) {
   label = 21; //@line 2009
   break;
  }
  _emscripten_free_async_context($AsyncCtx95 | 0); //@line 2012
  $AsyncCtx39 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2013
  __ZN4mbed6BusOutaSEi(4108, 5) | 0; //@line 2014
  if (___async) {
   label = 23; //@line 2017
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 2020
  $AsyncCtx92 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2021
  _wait(.25); //@line 2022
  if (___async) {
   label = 25; //@line 2025
   break;
  }
  _emscripten_free_async_context($AsyncCtx92 | 0); //@line 2028
  $AsyncCtx35 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2029
  __ZN4mbed6BusOutaSEi(4108, 6) | 0; //@line 2030
  if (___async) {
   label = 27; //@line 2033
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 2036
  $AsyncCtx89 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2037
  _wait(.25); //@line 2038
  if (___async) {
   label = 29; //@line 2041
   break;
  }
  _emscripten_free_async_context($AsyncCtx89 | 0); //@line 2044
  $AsyncCtx31 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2045
  __ZN4mbed6BusOutaSEi(4108, 7) | 0; //@line 2046
  if (___async) {
   label = 31; //@line 2049
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 2052
  $AsyncCtx86 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2053
  _wait(.25); //@line 2054
  if (___async) {
   label = 33; //@line 2057
   break;
  }
  _emscripten_free_async_context($AsyncCtx86 | 0); //@line 2060
  $AsyncCtx27 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2061
  __ZN4mbed6BusOutaSEi(4108, 8) | 0; //@line 2062
  if (___async) {
   label = 35; //@line 2065
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 2068
  $AsyncCtx83 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2069
  _wait(.25); //@line 2070
  if (___async) {
   label = 37; //@line 2073
   break;
  }
  _emscripten_free_async_context($AsyncCtx83 | 0); //@line 2076
  $AsyncCtx23 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2077
  __ZN4mbed6BusOutaSEi(4108, 9) | 0; //@line 2078
  if (___async) {
   label = 39; //@line 2081
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 2084
  $AsyncCtx80 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2085
  _wait(.25); //@line 2086
  if (___async) {
   label = 41; //@line 2089
   break;
  }
  _emscripten_free_async_context($AsyncCtx80 | 0); //@line 2092
  $AsyncCtx19 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2093
  __ZN4mbed6BusOutaSEi(4108, 10) | 0; //@line 2094
  if (___async) {
   label = 43; //@line 2097
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 2100
  $AsyncCtx77 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2101
  _wait(.25); //@line 2102
  if (___async) {
   label = 45; //@line 2105
   break;
  }
  _emscripten_free_async_context($AsyncCtx77 | 0); //@line 2108
  $AsyncCtx15 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2109
  __ZN4mbed6BusOutaSEi(4108, 11) | 0; //@line 2110
  if (___async) {
   label = 47; //@line 2113
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 2116
  $AsyncCtx74 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2117
  _wait(.25); //@line 2118
  if (___async) {
   label = 49; //@line 2121
   break;
  }
  _emscripten_free_async_context($AsyncCtx74 | 0); //@line 2124
  $AsyncCtx11 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2125
  __ZN4mbed6BusOutaSEi(4108, 12) | 0; //@line 2126
  if (___async) {
   label = 51; //@line 2129
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 2132
  $AsyncCtx71 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2133
  _wait(.25); //@line 2134
  if (___async) {
   label = 53; //@line 2137
   break;
  }
  _emscripten_free_async_context($AsyncCtx71 | 0); //@line 2140
  $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2141
  __ZN4mbed6BusOutaSEi(4108, 13) | 0; //@line 2142
  if (___async) {
   label = 55; //@line 2145
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2148
  $AsyncCtx68 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2149
  _wait(.25); //@line 2150
  if (___async) {
   label = 57; //@line 2153
   break;
  }
  _emscripten_free_async_context($AsyncCtx68 | 0); //@line 2156
  $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2157
  __ZN4mbed6BusOutaSEi(4108, 14) | 0; //@line 2158
  if (___async) {
   label = 59; //@line 2161
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2164
  $AsyncCtx65 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2165
  _wait(.25); //@line 2166
  if (___async) {
   label = 61; //@line 2169
   break;
  }
  _emscripten_free_async_context($AsyncCtx65 | 0); //@line 2172
  $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2173
  __ZN4mbed6BusOutaSEi(4108, 15) | 0; //@line 2174
  if (___async) {
   label = 63; //@line 2177
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2180
  $AsyncCtx62 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2181
  _wait(.25); //@line 2182
  if (___async) {
   label = 65; //@line 2185
   break;
  }
  _emscripten_free_async_context($AsyncCtx62 | 0); //@line 2188
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 58; //@line 2192
   sp = STACKTOP; //@line 2193
   return 0; //@line 2194
  }
 case 5:
  {
   HEAP32[$AsyncCtx107 >> 2] = 59; //@line 2198
   sp = STACKTOP; //@line 2199
   return 0; //@line 2200
  }
 case 7:
  {
   HEAP32[$AsyncCtx55 >> 2] = 60; //@line 2204
   sp = STACKTOP; //@line 2205
   return 0; //@line 2206
  }
 case 9:
  {
   HEAP32[$AsyncCtx104 >> 2] = 61; //@line 2210
   sp = STACKTOP; //@line 2211
   return 0; //@line 2212
  }
 case 11:
  {
   HEAP32[$AsyncCtx51 >> 2] = 62; //@line 2216
   sp = STACKTOP; //@line 2217
   return 0; //@line 2218
  }
 case 13:
  {
   HEAP32[$AsyncCtx101 >> 2] = 63; //@line 2222
   sp = STACKTOP; //@line 2223
   return 0; //@line 2224
  }
 case 15:
  {
   HEAP32[$AsyncCtx47 >> 2] = 64; //@line 2228
   sp = STACKTOP; //@line 2229
   return 0; //@line 2230
  }
 case 17:
  {
   HEAP32[$AsyncCtx98 >> 2] = 65; //@line 2234
   sp = STACKTOP; //@line 2235
   return 0; //@line 2236
  }
 case 19:
  {
   HEAP32[$AsyncCtx43 >> 2] = 66; //@line 2240
   sp = STACKTOP; //@line 2241
   return 0; //@line 2242
  }
 case 21:
  {
   HEAP32[$AsyncCtx95 >> 2] = 67; //@line 2246
   sp = STACKTOP; //@line 2247
   return 0; //@line 2248
  }
 case 23:
  {
   HEAP32[$AsyncCtx39 >> 2] = 68; //@line 2252
   sp = STACKTOP; //@line 2253
   return 0; //@line 2254
  }
 case 25:
  {
   HEAP32[$AsyncCtx92 >> 2] = 69; //@line 2258
   sp = STACKTOP; //@line 2259
   return 0; //@line 2260
  }
 case 27:
  {
   HEAP32[$AsyncCtx35 >> 2] = 70; //@line 2264
   sp = STACKTOP; //@line 2265
   return 0; //@line 2266
  }
 case 29:
  {
   HEAP32[$AsyncCtx89 >> 2] = 71; //@line 2270
   sp = STACKTOP; //@line 2271
   return 0; //@line 2272
  }
 case 31:
  {
   HEAP32[$AsyncCtx31 >> 2] = 72; //@line 2276
   sp = STACKTOP; //@line 2277
   return 0; //@line 2278
  }
 case 33:
  {
   HEAP32[$AsyncCtx86 >> 2] = 73; //@line 2282
   sp = STACKTOP; //@line 2283
   return 0; //@line 2284
  }
 case 35:
  {
   HEAP32[$AsyncCtx27 >> 2] = 74; //@line 2288
   sp = STACKTOP; //@line 2289
   return 0; //@line 2290
  }
 case 37:
  {
   HEAP32[$AsyncCtx83 >> 2] = 75; //@line 2294
   sp = STACKTOP; //@line 2295
   return 0; //@line 2296
  }
 case 39:
  {
   HEAP32[$AsyncCtx23 >> 2] = 76; //@line 2300
   sp = STACKTOP; //@line 2301
   return 0; //@line 2302
  }
 case 41:
  {
   HEAP32[$AsyncCtx80 >> 2] = 77; //@line 2306
   sp = STACKTOP; //@line 2307
   return 0; //@line 2308
  }
 case 43:
  {
   HEAP32[$AsyncCtx19 >> 2] = 78; //@line 2312
   sp = STACKTOP; //@line 2313
   return 0; //@line 2314
  }
 case 45:
  {
   HEAP32[$AsyncCtx77 >> 2] = 79; //@line 2318
   sp = STACKTOP; //@line 2319
   return 0; //@line 2320
  }
 case 47:
  {
   HEAP32[$AsyncCtx15 >> 2] = 80; //@line 2324
   sp = STACKTOP; //@line 2325
   return 0; //@line 2326
  }
 case 49:
  {
   HEAP32[$AsyncCtx74 >> 2] = 81; //@line 2330
   sp = STACKTOP; //@line 2331
   return 0; //@line 2332
  }
 case 51:
  {
   HEAP32[$AsyncCtx11 >> 2] = 82; //@line 2336
   sp = STACKTOP; //@line 2337
   return 0; //@line 2338
  }
 case 53:
  {
   HEAP32[$AsyncCtx71 >> 2] = 83; //@line 2342
   sp = STACKTOP; //@line 2343
   return 0; //@line 2344
  }
 case 55:
  {
   HEAP32[$AsyncCtx7 >> 2] = 84; //@line 2348
   sp = STACKTOP; //@line 2349
   return 0; //@line 2350
  }
 case 57:
  {
   HEAP32[$AsyncCtx68 >> 2] = 85; //@line 2354
   sp = STACKTOP; //@line 2355
   return 0; //@line 2356
  }
 case 59:
  {
   HEAP32[$AsyncCtx3 >> 2] = 86; //@line 2360
   sp = STACKTOP; //@line 2361
   return 0; //@line 2362
  }
 case 61:
  {
   HEAP32[$AsyncCtx65 >> 2] = 87; //@line 2366
   sp = STACKTOP; //@line 2367
   return 0; //@line 2368
  }
 case 63:
  {
   HEAP32[$AsyncCtx >> 2] = 88; //@line 2372
   sp = STACKTOP; //@line 2373
   return 0; //@line 2374
  }
 case 65:
  {
   HEAP32[$AsyncCtx62 >> 2] = 89; //@line 2378
   sp = STACKTOP; //@line 2379
   return 0; //@line 2380
  }
 }
 return 0; //@line 2384
}
function _twoway_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0166 = 0, $$0168 = 0, $$0169 = 0, $$0169$be = 0, $$0170 = 0, $$0175$ph$ph$lcssa216 = 0, $$0175$ph$ph$lcssa216328 = 0, $$0175$ph$ph254 = 0, $$0179242 = 0, $$0183$ph197$ph253 = 0, $$0183$ph197248 = 0, $$0183$ph260 = 0, $$0185$ph$lcssa = 0, $$0185$ph$lcssa327 = 0, $$0185$ph259 = 0, $$0187219$ph325326 = 0, $$0187263 = 0, $$1176$$0175 = 0, $$1176$ph$ph$lcssa208 = 0, $$1176$ph$ph233 = 0, $$1180222 = 0, $$1184$ph193$ph232 = 0, $$1184$ph193227 = 0, $$1184$ph239 = 0, $$1186$$0185 = 0, $$1186$ph$lcssa = 0, $$1186$ph238 = 0, $$2181$sink = 0, $$3 = 0, $$3173 = 0, $$3178 = 0, $$3182221 = 0, $$4 = 0, $$pr = 0, $10 = 0, $105 = 0, $111 = 0, $113 = 0, $118 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $14 = 0, $2 = 0, $23 = 0, $25 = 0, $27 = 0, $3 = 0, $32 = 0, $34 = 0, $37 = 0, $4 = 0, $41 = 0, $45 = 0, $50 = 0, $52 = 0, $53 = 0, $56 = 0, $60 = 0, $68 = 0, $70 = 0, $74 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $83 = 0, $86 = 0, $93 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9869
 STACKTOP = STACKTOP + 1056 | 0; //@line 9870
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(1056); //@line 9870
 $2 = sp + 1024 | 0; //@line 9871
 $3 = sp; //@line 9872
 HEAP32[$2 >> 2] = 0; //@line 9873
 HEAP32[$2 + 4 >> 2] = 0; //@line 9873
 HEAP32[$2 + 8 >> 2] = 0; //@line 9873
 HEAP32[$2 + 12 >> 2] = 0; //@line 9873
 HEAP32[$2 + 16 >> 2] = 0; //@line 9873
 HEAP32[$2 + 20 >> 2] = 0; //@line 9873
 HEAP32[$2 + 24 >> 2] = 0; //@line 9873
 HEAP32[$2 + 28 >> 2] = 0; //@line 9873
 $4 = HEAP8[$1 >> 0] | 0; //@line 9874
 L1 : do {
  if (!($4 << 24 >> 24)) {
   $$0175$ph$ph$lcssa216328 = 1; //@line 9878
   $$0185$ph$lcssa327 = -1; //@line 9878
   $$0187219$ph325326 = 0; //@line 9878
   $$1176$ph$ph$lcssa208 = 1; //@line 9878
   $$1186$ph$lcssa = -1; //@line 9878
   label = 26; //@line 9879
  } else {
   $$0187263 = 0; //@line 9881
   $10 = $4; //@line 9881
   do {
    if (!(HEAP8[$0 + $$0187263 >> 0] | 0)) {
     $$3 = 0; //@line 9887
     break L1;
    }
    $14 = $2 + ((($10 & 255) >>> 5 & 255) << 2) | 0; //@line 9895
    HEAP32[$14 >> 2] = HEAP32[$14 >> 2] | 1 << ($10 & 31); //@line 9898
    $$0187263 = $$0187263 + 1 | 0; //@line 9899
    HEAP32[$3 + (($10 & 255) << 2) >> 2] = $$0187263; //@line 9902
    $10 = HEAP8[$1 + $$0187263 >> 0] | 0; //@line 9904
   } while ($10 << 24 >> 24 != 0);
   $23 = $$0187263 >>> 0 > 1; //@line 9912
   if ($23) {
    $$0183$ph260 = 0; //@line 9914
    $$0185$ph259 = -1; //@line 9914
    $130 = 1; //@line 9914
    L6 : while (1) {
     $$0175$ph$ph254 = 1; //@line 9916
     $$0183$ph197$ph253 = $$0183$ph260; //@line 9916
     $131 = $130; //@line 9916
     while (1) {
      $$0183$ph197248 = $$0183$ph197$ph253; //@line 9918
      $132 = $131; //@line 9918
      L10 : while (1) {
       $$0179242 = 1; //@line 9920
       $25 = $132; //@line 9920
       while (1) {
        $32 = HEAP8[$1 + ($$0179242 + $$0185$ph259) >> 0] | 0; //@line 9924
        $34 = HEAP8[$1 + $25 >> 0] | 0; //@line 9926
        if ($32 << 24 >> 24 != $34 << 24 >> 24) {
         break L10;
        }
        if (($$0179242 | 0) == ($$0175$ph$ph254 | 0)) {
         break;
        }
        $$0179242 = $$0179242 + 1 | 0; //@line 9932
        $27 = $$0179242 + $$0183$ph197248 | 0; //@line 9936
        if ($27 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 9941
         $$0185$ph$lcssa = $$0185$ph259; //@line 9941
         break L6;
        } else {
         $25 = $27; //@line 9939
        }
       }
       $37 = $$0175$ph$ph254 + $$0183$ph197248 | 0; //@line 9945
       $132 = $37 + 1 | 0; //@line 9946
       if ($132 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 9951
        $$0185$ph$lcssa = $$0185$ph259; //@line 9951
        break L6;
       } else {
        $$0183$ph197248 = $37; //@line 9949
       }
      }
      $41 = $25 - $$0185$ph259 | 0; //@line 9956
      if (($32 & 255) <= ($34 & 255)) {
       break;
      }
      $131 = $25 + 1 | 0; //@line 9960
      if ($131 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216 = $41; //@line 9965
       $$0185$ph$lcssa = $$0185$ph259; //@line 9965
       break L6;
      } else {
       $$0175$ph$ph254 = $41; //@line 9963
       $$0183$ph197$ph253 = $25; //@line 9963
      }
     }
     $130 = $$0183$ph197248 + 2 | 0; //@line 9970
     if ($130 >>> 0 >= $$0187263 >>> 0) {
      $$0175$ph$ph$lcssa216 = 1; //@line 9975
      $$0185$ph$lcssa = $$0183$ph197248; //@line 9975
      break;
     } else {
      $$0183$ph260 = $$0183$ph197248 + 1 | 0; //@line 9973
      $$0185$ph259 = $$0183$ph197248; //@line 9973
     }
    }
    if ($23) {
     $$1184$ph239 = 0; //@line 9980
     $$1186$ph238 = -1; //@line 9980
     $133 = 1; //@line 9980
     while (1) {
      $$1176$ph$ph233 = 1; //@line 9982
      $$1184$ph193$ph232 = $$1184$ph239; //@line 9982
      $135 = $133; //@line 9982
      while (1) {
       $$1184$ph193227 = $$1184$ph193$ph232; //@line 9984
       $134 = $135; //@line 9984
       L25 : while (1) {
        $$1180222 = 1; //@line 9986
        $52 = $134; //@line 9986
        while (1) {
         $50 = HEAP8[$1 + ($$1180222 + $$1186$ph238) >> 0] | 0; //@line 9990
         $53 = HEAP8[$1 + $52 >> 0] | 0; //@line 9992
         if ($50 << 24 >> 24 != $53 << 24 >> 24) {
          break L25;
         }
         if (($$1180222 | 0) == ($$1176$ph$ph233 | 0)) {
          break;
         }
         $$1180222 = $$1180222 + 1 | 0; //@line 9998
         $45 = $$1180222 + $$1184$ph193227 | 0; //@line 10002
         if ($45 >>> 0 >= $$0187263 >>> 0) {
          $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 10007
          $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 10007
          $$0187219$ph325326 = $$0187263; //@line 10007
          $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 10007
          $$1186$ph$lcssa = $$1186$ph238; //@line 10007
          label = 26; //@line 10008
          break L1;
         } else {
          $52 = $45; //@line 10005
         }
        }
        $56 = $$1176$ph$ph233 + $$1184$ph193227 | 0; //@line 10012
        $134 = $56 + 1 | 0; //@line 10013
        if ($134 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 10018
         $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 10018
         $$0187219$ph325326 = $$0187263; //@line 10018
         $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 10018
         $$1186$ph$lcssa = $$1186$ph238; //@line 10018
         label = 26; //@line 10019
         break L1;
        } else {
         $$1184$ph193227 = $56; //@line 10016
        }
       }
       $60 = $52 - $$1186$ph238 | 0; //@line 10024
       if (($50 & 255) >= ($53 & 255)) {
        break;
       }
       $135 = $52 + 1 | 0; //@line 10028
       if ($135 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 10033
        $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 10033
        $$0187219$ph325326 = $$0187263; //@line 10033
        $$1176$ph$ph$lcssa208 = $60; //@line 10033
        $$1186$ph$lcssa = $$1186$ph238; //@line 10033
        label = 26; //@line 10034
        break L1;
       } else {
        $$1176$ph$ph233 = $60; //@line 10031
        $$1184$ph193$ph232 = $52; //@line 10031
       }
      }
      $133 = $$1184$ph193227 + 2 | 0; //@line 10039
      if ($133 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 10044
       $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 10044
       $$0187219$ph325326 = $$0187263; //@line 10044
       $$1176$ph$ph$lcssa208 = 1; //@line 10044
       $$1186$ph$lcssa = $$1184$ph193227; //@line 10044
       label = 26; //@line 10045
       break;
      } else {
       $$1184$ph239 = $$1184$ph193227 + 1 | 0; //@line 10042
       $$1186$ph238 = $$1184$ph193227; //@line 10042
      }
     }
    } else {
     $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 10050
     $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 10050
     $$0187219$ph325326 = $$0187263; //@line 10050
     $$1176$ph$ph$lcssa208 = 1; //@line 10050
     $$1186$ph$lcssa = -1; //@line 10050
     label = 26; //@line 10051
    }
   } else {
    $$0175$ph$ph$lcssa216328 = 1; //@line 10054
    $$0185$ph$lcssa327 = -1; //@line 10054
    $$0187219$ph325326 = $$0187263; //@line 10054
    $$1176$ph$ph$lcssa208 = 1; //@line 10054
    $$1186$ph$lcssa = -1; //@line 10054
    label = 26; //@line 10055
   }
  }
 } while (0);
 L35 : do {
  if ((label | 0) == 26) {
   $68 = ($$1186$ph$lcssa + 1 | 0) >>> 0 > ($$0185$ph$lcssa327 + 1 | 0) >>> 0; //@line 10063
   $$1176$$0175 = $68 ? $$1176$ph$ph$lcssa208 : $$0175$ph$ph$lcssa216328; //@line 10064
   $$1186$$0185 = $68 ? $$1186$ph$lcssa : $$0185$ph$lcssa327; //@line 10065
   $70 = $$1186$$0185 + 1 | 0; //@line 10067
   if (!(_memcmp($1, $1 + $$1176$$0175 | 0, $70) | 0)) {
    $$0168 = $$0187219$ph325326 - $$1176$$0175 | 0; //@line 10072
    $$3178 = $$1176$$0175; //@line 10072
   } else {
    $74 = $$0187219$ph325326 - $$1186$$0185 + -1 | 0; //@line 10075
    $$0168 = 0; //@line 10079
    $$3178 = ($$1186$$0185 >>> 0 > $74 >>> 0 ? $$1186$$0185 : $74) + 1 | 0; //@line 10079
   }
   $78 = $$0187219$ph325326 | 63; //@line 10081
   $79 = $$0187219$ph325326 + -1 | 0; //@line 10082
   $80 = ($$0168 | 0) != 0; //@line 10083
   $81 = $$0187219$ph325326 - $$3178 | 0; //@line 10084
   $$0166 = $0; //@line 10085
   $$0169 = 0; //@line 10085
   $$0170 = $0; //@line 10085
   while (1) {
    $83 = $$0166; //@line 10088
    do {
     if (($$0170 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
      $86 = _memchr($$0170, 0, $78) | 0; //@line 10093
      if (!$86) {
       $$3173 = $$0170 + $78 | 0; //@line 10097
       break;
      } else {
       if (($86 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
        $$3 = 0; //@line 10104
        break L35;
       } else {
        $$3173 = $86; //@line 10107
        break;
       }
      }
     } else {
      $$3173 = $$0170; //@line 10112
     }
    } while (0);
    $93 = HEAP8[$$0166 + $79 >> 0] | 0; //@line 10116
    L49 : do {
     if (!(1 << ($93 & 31) & HEAP32[$2 + ((($93 & 255) >>> 5 & 255) << 2) >> 2])) {
      $$0169$be = 0; //@line 10128
      $$2181$sink = $$0187219$ph325326; //@line 10128
     } else {
      $105 = $$0187219$ph325326 - (HEAP32[$3 + (($93 & 255) << 2) >> 2] | 0) | 0; //@line 10133
      if ($105 | 0) {
       $$0169$be = 0; //@line 10141
       $$2181$sink = $80 & ($$0169 | 0) != 0 & $105 >>> 0 < $$3178 >>> 0 ? $81 : $105; //@line 10141
       break;
      }
      $111 = $70 >>> 0 > $$0169 >>> 0 ? $70 : $$0169; //@line 10145
      $113 = HEAP8[$1 + $111 >> 0] | 0; //@line 10147
      L54 : do {
       if (!($113 << 24 >> 24)) {
        $$4 = $70; //@line 10151
       } else {
        $$3182221 = $111; //@line 10153
        $$pr = $113; //@line 10153
        while (1) {
         if ($$pr << 24 >> 24 != (HEAP8[$$0166 + $$3182221 >> 0] | 0)) {
          break;
         }
         $118 = $$3182221 + 1 | 0; //@line 10161
         $$pr = HEAP8[$1 + $118 >> 0] | 0; //@line 10163
         if (!($$pr << 24 >> 24)) {
          $$4 = $70; //@line 10166
          break L54;
         } else {
          $$3182221 = $118; //@line 10169
         }
        }
        $$0169$be = 0; //@line 10173
        $$2181$sink = $$3182221 - $$1186$$0185 | 0; //@line 10173
        break L49;
       }
      } while (0);
      while (1) {
       if ($$4 >>> 0 <= $$0169 >>> 0) {
        $$3 = $$0166; //@line 10180
        break L35;
       }
       $$4 = $$4 + -1 | 0; //@line 10183
       if ((HEAP8[$1 + $$4 >> 0] | 0) != (HEAP8[$$0166 + $$4 >> 0] | 0)) {
        $$0169$be = $$0168; //@line 10192
        $$2181$sink = $$3178; //@line 10192
        break;
       }
      }
     }
    } while (0);
    $$0166 = $$0166 + $$2181$sink | 0; //@line 10199
    $$0169 = $$0169$be; //@line 10199
    $$0170 = $$3173; //@line 10199
   }
  }
 } while (0);
 STACKTOP = sp; //@line 10203
 return $$3 | 0; //@line 10203
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11356
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 11362
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 11371
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 11376
      $19 = $1 + 44 | 0; //@line 11377
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 11386
      $26 = $1 + 52 | 0; //@line 11387
      $27 = $1 + 53 | 0; //@line 11388
      $28 = $1 + 54 | 0; //@line 11389
      $29 = $0 + 8 | 0; //@line 11390
      $30 = $1 + 24 | 0; //@line 11391
      $$081$off0 = 0; //@line 11392
      $$084 = $0 + 16 | 0; //@line 11392
      $$085$off0 = 0; //@line 11392
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 11396
        label = 20; //@line 11397
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 11400
       HEAP8[$27 >> 0] = 0; //@line 11401
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 11402
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 11403
       if (___async) {
        label = 12; //@line 11406
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 11409
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 11413
        label = 20; //@line 11414
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 11421
         $$186$off0 = $$085$off0; //@line 11421
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 11430
           label = 20; //@line 11431
           break L10;
          } else {
           $$182$off0 = 1; //@line 11434
           $$186$off0 = $$085$off0; //@line 11434
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 11441
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 11448
          break L10;
         } else {
          $$182$off0 = 1; //@line 11451
          $$186$off0 = 1; //@line 11451
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 11456
       $$084 = $$084 + 8 | 0; //@line 11456
       $$085$off0 = $$186$off0; //@line 11456
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 114; //@line 11459
       HEAP32[$AsyncCtx15 + 4 >> 2] = $30; //@line 11461
       HEAP32[$AsyncCtx15 + 8 >> 2] = $26; //@line 11463
       HEAP32[$AsyncCtx15 + 12 >> 2] = $27; //@line 11465
       HEAP32[$AsyncCtx15 + 16 >> 2] = $28; //@line 11467
       HEAP32[$AsyncCtx15 + 20 >> 2] = $1; //@line 11469
       HEAP32[$AsyncCtx15 + 24 >> 2] = $2; //@line 11471
       HEAP8[$AsyncCtx15 + 28 >> 0] = $4 & 1; //@line 11474
       HEAP32[$AsyncCtx15 + 32 >> 2] = $25; //@line 11476
       HEAP32[$AsyncCtx15 + 36 >> 2] = $19; //@line 11478
       HEAP32[$AsyncCtx15 + 40 >> 2] = $29; //@line 11480
       HEAP8[$AsyncCtx15 + 44 >> 0] = $$085$off0 & 1; //@line 11483
       HEAP8[$AsyncCtx15 + 45 >> 0] = $$081$off0 & 1; //@line 11486
       HEAP32[$AsyncCtx15 + 48 >> 2] = $$084; //@line 11488
       HEAP32[$AsyncCtx15 + 52 >> 2] = $13; //@line 11490
       sp = STACKTOP; //@line 11491
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 11497
         $61 = $1 + 40 | 0; //@line 11498
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 11501
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 11509
           if ($$283$off0) {
            label = 25; //@line 11511
            break;
           } else {
            $69 = 4; //@line 11514
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 11521
        } else {
         $69 = 4; //@line 11523
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 11528
      }
      HEAP32[$19 >> 2] = $69; //@line 11530
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 11539
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 11544
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 11545
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 11546
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 11547
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 115; //@line 11550
    HEAP32[$AsyncCtx11 + 4 >> 2] = $1; //@line 11552
    HEAP32[$AsyncCtx11 + 8 >> 2] = $2; //@line 11554
    HEAP32[$AsyncCtx11 + 12 >> 2] = $3; //@line 11556
    HEAP8[$AsyncCtx11 + 16 >> 0] = $4 & 1; //@line 11559
    HEAP32[$AsyncCtx11 + 20 >> 2] = $73; //@line 11561
    HEAP32[$AsyncCtx11 + 24 >> 2] = $0; //@line 11563
    HEAP32[$AsyncCtx11 + 28 >> 2] = $72; //@line 11565
    sp = STACKTOP; //@line 11566
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 11569
   $81 = $0 + 24 | 0; //@line 11570
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 11574
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 11578
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 11585
       $$2 = $81; //@line 11586
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 11598
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 11599
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 11604
        $136 = $$2 + 8 | 0; //@line 11605
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 11608
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 118; //@line 11613
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 11615
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 11617
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 11619
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 11621
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 11623
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 11625
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 11627
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 11630
       sp = STACKTOP; //@line 11631
       return;
      }
      $104 = $1 + 24 | 0; //@line 11634
      $105 = $1 + 54 | 0; //@line 11635
      $$1 = $81; //@line 11636
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 11652
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 11653
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11658
       $122 = $$1 + 8 | 0; //@line 11659
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 11662
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 117; //@line 11667
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 11669
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 11671
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 11673
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 11675
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 11677
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 11679
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 11681
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 11683
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 11686
      sp = STACKTOP; //@line 11687
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 11691
    $$0 = $81; //@line 11692
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 11699
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 11700
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 11705
     $100 = $$0 + 8 | 0; //@line 11706
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 11709
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 116; //@line 11714
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 11716
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 11718
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 11720
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 11722
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 11724
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 11726
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 11729
    sp = STACKTOP; //@line 11730
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
 $n_sroa_0_0_extract_trunc = $a$0; //@line 1950
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 1951
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 1952
 $d_sroa_0_0_extract_trunc = $b$0; //@line 1953
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 1954
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 1955
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 1957
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 1960
    HEAP32[$rem + 4 >> 2] = 0; //@line 1961
   }
   $_0$1 = 0; //@line 1963
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 1964
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1965
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 1968
    $_0$0 = 0; //@line 1969
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1970
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 1972
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 1973
   $_0$1 = 0; //@line 1974
   $_0$0 = 0; //@line 1975
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1976
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 1979
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 1984
     HEAP32[$rem + 4 >> 2] = 0; //@line 1985
    }
    $_0$1 = 0; //@line 1987
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 1988
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1989
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 1993
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 1994
    }
    $_0$1 = 0; //@line 1996
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 1997
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1998
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 2000
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 2003
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 2004
    }
    $_0$1 = 0; //@line 2006
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 2007
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 2008
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 2011
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 2013
    $58 = 31 - $51 | 0; //@line 2014
    $sr_1_ph = $57; //@line 2015
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 2016
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 2017
    $q_sroa_0_1_ph = 0; //@line 2018
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 2019
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 2023
    $_0$0 = 0; //@line 2024
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 2025
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 2027
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 2028
   $_0$1 = 0; //@line 2029
   $_0$0 = 0; //@line 2030
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 2031
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 2035
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 2037
     $126 = 31 - $119 | 0; //@line 2038
     $130 = $119 - 31 >> 31; //@line 2039
     $sr_1_ph = $125; //@line 2040
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 2041
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 2042
     $q_sroa_0_1_ph = 0; //@line 2043
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 2044
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 2048
     $_0$0 = 0; //@line 2049
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 2050
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 2052
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 2053
    $_0$1 = 0; //@line 2054
    $_0$0 = 0; //@line 2055
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 2056
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 2058
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 2061
    $89 = 64 - $88 | 0; //@line 2062
    $91 = 32 - $88 | 0; //@line 2063
    $92 = $91 >> 31; //@line 2064
    $95 = $88 - 32 | 0; //@line 2065
    $105 = $95 >> 31; //@line 2066
    $sr_1_ph = $88; //@line 2067
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 2068
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 2069
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 2070
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 2071
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 2075
    HEAP32[$rem + 4 >> 2] = 0; //@line 2076
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 2079
    $_0$0 = $a$0 | 0 | 0; //@line 2080
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 2081
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 2083
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 2084
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 2085
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 2086
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 2091
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 2092
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 2093
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 2094
  $carry_0_lcssa$1 = 0; //@line 2095
  $carry_0_lcssa$0 = 0; //@line 2096
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 2098
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 2099
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 2100
  $137$1 = tempRet0; //@line 2101
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 2102
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 2103
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 2104
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 2105
  $sr_1202 = $sr_1_ph; //@line 2106
  $carry_0203 = 0; //@line 2107
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 2109
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 2110
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 2111
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 2112
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 2113
   $150$1 = tempRet0; //@line 2114
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 2115
   $carry_0203 = $151$0 & 1; //@line 2116
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 2118
   $r_sroa_1_1200 = tempRet0; //@line 2119
   $sr_1202 = $sr_1202 - 1 | 0; //@line 2120
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 2132
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 2133
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 2134
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 2135
  $carry_0_lcssa$1 = 0; //@line 2136
  $carry_0_lcssa$0 = $carry_0203; //@line 2137
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 2139
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 2140
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 2143
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 2144
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 2146
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 2147
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 2148
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1326
 STACKTOP = STACKTOP + 32 | 0; //@line 1327
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 1327
 $0 = sp; //@line 1328
 _gpio_init_out($0, 50); //@line 1329
 while (1) {
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1332
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1333
  _wait_ms(150); //@line 1334
  if (___async) {
   label = 3; //@line 1337
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 1340
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1342
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1343
  _wait_ms(150); //@line 1344
  if (___async) {
   label = 5; //@line 1347
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 1350
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1352
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1353
  _wait_ms(150); //@line 1354
  if (___async) {
   label = 7; //@line 1357
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 1360
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1362
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1363
  _wait_ms(150); //@line 1364
  if (___async) {
   label = 9; //@line 1367
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 1370
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1372
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1373
  _wait_ms(150); //@line 1374
  if (___async) {
   label = 11; //@line 1377
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 1380
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1382
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1383
  _wait_ms(150); //@line 1384
  if (___async) {
   label = 13; //@line 1387
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 1390
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1392
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1393
  _wait_ms(150); //@line 1394
  if (___async) {
   label = 15; //@line 1397
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 1400
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1402
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1403
  _wait_ms(150); //@line 1404
  if (___async) {
   label = 17; //@line 1407
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 1410
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1412
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1413
  _wait_ms(400); //@line 1414
  if (___async) {
   label = 19; //@line 1417
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 1420
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1422
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1423
  _wait_ms(400); //@line 1424
  if (___async) {
   label = 21; //@line 1427
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 1430
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1432
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1433
  _wait_ms(400); //@line 1434
  if (___async) {
   label = 23; //@line 1437
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 1440
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1442
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1443
  _wait_ms(400); //@line 1444
  if (___async) {
   label = 25; //@line 1447
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1450
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1452
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1453
  _wait_ms(400); //@line 1454
  if (___async) {
   label = 27; //@line 1457
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1460
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1462
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1463
  _wait_ms(400); //@line 1464
  if (___async) {
   label = 29; //@line 1467
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1470
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1472
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1473
  _wait_ms(400); //@line 1474
  if (___async) {
   label = 31; //@line 1477
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1480
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1482
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1483
  _wait_ms(400); //@line 1484
  if (___async) {
   label = 33; //@line 1487
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1490
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 31; //@line 1494
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 1496
   sp = STACKTOP; //@line 1497
   STACKTOP = sp; //@line 1498
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 32; //@line 1502
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 1504
   sp = STACKTOP; //@line 1505
   STACKTOP = sp; //@line 1506
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 33; //@line 1510
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 1512
   sp = STACKTOP; //@line 1513
   STACKTOP = sp; //@line 1514
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 34; //@line 1518
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 1520
   sp = STACKTOP; //@line 1521
   STACKTOP = sp; //@line 1522
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 35; //@line 1526
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 1528
   sp = STACKTOP; //@line 1529
   STACKTOP = sp; //@line 1530
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 36; //@line 1534
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 1536
   sp = STACKTOP; //@line 1537
   STACKTOP = sp; //@line 1538
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 37; //@line 1542
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 1544
   sp = STACKTOP; //@line 1545
   STACKTOP = sp; //@line 1546
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 38; //@line 1550
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 1552
   sp = STACKTOP; //@line 1553
   STACKTOP = sp; //@line 1554
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 39; //@line 1558
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 1560
   sp = STACKTOP; //@line 1561
   STACKTOP = sp; //@line 1562
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 40; //@line 1566
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 1568
   sp = STACKTOP; //@line 1569
   STACKTOP = sp; //@line 1570
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 41; //@line 1574
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 1576
   sp = STACKTOP; //@line 1577
   STACKTOP = sp; //@line 1578
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 42; //@line 1582
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 1584
   sp = STACKTOP; //@line 1585
   STACKTOP = sp; //@line 1586
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 43; //@line 1590
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 1592
   sp = STACKTOP; //@line 1593
   STACKTOP = sp; //@line 1594
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 44; //@line 1598
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 1600
   sp = STACKTOP; //@line 1601
   STACKTOP = sp; //@line 1602
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 45; //@line 1606
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1608
   sp = STACKTOP; //@line 1609
   STACKTOP = sp; //@line 1610
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 46; //@line 1614
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1616
   sp = STACKTOP; //@line 1617
   STACKTOP = sp; //@line 1618
   return;
  }
 }
}
function _mbed_vtracef__async_cb_53($0) {
 $0 = $0 | 0;
 var $$10 = 0, $$3147168 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $10 = 0, $12 = 0, $14 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $28 = 0, $32 = 0, $36 = 0, $4 = 0, $40 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $54 = 0, $56 = 0, $6 = 0, $67 = 0, $68 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13681
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13683
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13685
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13687
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13689
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13691
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13693
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 13695
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 13701
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 13703
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 13705
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 13709
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 13713
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 13717
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 13721
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 13725
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 13727
 $48 = HEAP8[$0 + 96 >> 0] & 1; //@line 13730
 HEAP32[$10 >> 2] = HEAP32[___async_retval >> 2]; //@line 13733
 $50 = _snprintf($12, $14, 1145, $10) | 0; //@line 13734
 $$10 = ($50 | 0) >= ($14 | 0) ? 0 : $50; //@line 13736
 $53 = $12 + $$10 | 0; //@line 13738
 $54 = $14 - $$10 | 0; //@line 13739
 if (($$10 | 0) > 0) {
  if (($54 | 0) > 0) {
   $$3147168 = $54; //@line 13743
   $$3169 = $53; //@line 13743
   label = 4; //@line 13744
  }
 } else {
  $$3147168 = $14; //@line 13747
  $$3169 = $12; //@line 13747
  label = 4; //@line 13748
 }
 if ((label | 0) == 4) {
  $56 = $20 + -2 | 0; //@line 13751
  switch ($56 >>> 1 | $56 << 31 | 0) {
  case 0:
   {
    HEAP32[$28 >> 2] = $24; //@line 13757
    $$5156 = _snprintf($$3169, $$3147168, 1148, $28) | 0; //@line 13759
    break;
   }
  case 1:
   {
    HEAP32[$22 >> 2] = $24; //@line 13763
    $$5156 = _snprintf($$3169, $$3147168, 1163, $22) | 0; //@line 13765
    break;
   }
  case 3:
   {
    HEAP32[$36 >> 2] = $24; //@line 13769
    $$5156 = _snprintf($$3169, $$3147168, 1178, $36) | 0; //@line 13771
    break;
   }
  case 7:
   {
    HEAP32[$32 >> 2] = $24; //@line 13775
    $$5156 = _snprintf($$3169, $$3147168, 1193, $32) | 0; //@line 13777
    break;
   }
  default:
   {
    $$5156 = _snprintf($$3169, $$3147168, 1208, $40) | 0; //@line 13782
   }
  }
  $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 13786
  $67 = $$3169 + $$5156$ | 0; //@line 13788
  $68 = $$3147168 - $$5156$ | 0; //@line 13789
  if (($$5156$ | 0) > 0 & ($68 | 0) > 0) {
   $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 13793
   $70 = _vsnprintf($67, $68, $44, $46) | 0; //@line 13794
   if (___async) {
    HEAP32[$ReallocAsyncCtx10 >> 2] = 25; //@line 13797
    $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 13798
    HEAP32[$71 >> 2] = $2; //@line 13799
    $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 13800
    HEAP32[$72 >> 2] = $4; //@line 13801
    $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 13802
    HEAP32[$73 >> 2] = $6; //@line 13803
    $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 13804
    HEAP32[$74 >> 2] = $8; //@line 13805
    $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 13806
    HEAP32[$75 >> 2] = $68; //@line 13807
    $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 13808
    HEAP32[$76 >> 2] = $67; //@line 13809
    $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 13810
    $$expand_i1_val = $48 & 1; //@line 13811
    HEAP8[$77 >> 0] = $$expand_i1_val; //@line 13812
    sp = STACKTOP; //@line 13813
    return;
   }
   HEAP32[___async_retval >> 2] = $70; //@line 13817
   ___async_unwind = 0; //@line 13818
   HEAP32[$ReallocAsyncCtx10 >> 2] = 25; //@line 13819
   $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 13820
   HEAP32[$71 >> 2] = $2; //@line 13821
   $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 13822
   HEAP32[$72 >> 2] = $4; //@line 13823
   $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 13824
   HEAP32[$73 >> 2] = $6; //@line 13825
   $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 13826
   HEAP32[$74 >> 2] = $8; //@line 13827
   $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 13828
   HEAP32[$75 >> 2] = $68; //@line 13829
   $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 13830
   HEAP32[$76 >> 2] = $67; //@line 13831
   $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 13832
   $$expand_i1_val = $48 & 1; //@line 13833
   HEAP8[$77 >> 0] = $$expand_i1_val; //@line 13834
   sp = STACKTOP; //@line 13835
   return;
  }
 }
 $79 = HEAP32[53] | 0; //@line 13839
 $80 = HEAP32[46] | 0; //@line 13840
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 13841
 FUNCTION_TABLE_vi[$79 & 127]($80); //@line 13842
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 27; //@line 13845
  sp = STACKTOP; //@line 13846
  return;
 }
 ___async_unwind = 0; //@line 13849
 HEAP32[$ReallocAsyncCtx7 >> 2] = 27; //@line 13850
 sp = STACKTOP; //@line 13851
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_70($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1054
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1056
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1058
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1060
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1062
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1064
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1066
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 1069
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1071
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1073
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1075
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 1078
 $24 = HEAP8[$0 + 45 >> 0] & 1; //@line 1081
 $26 = HEAP32[$0 + 48 >> 2] | 0; //@line 1083
 $28 = HEAP32[$0 + 52 >> 2] | 0; //@line 1085
 L2 : do {
  if (!(HEAP8[$8 >> 0] | 0)) {
   do {
    if (!(HEAP8[$6 >> 0] | 0)) {
     $$182$off0 = $24; //@line 1094
     $$186$off0 = $22; //@line 1094
    } else {
     if (!(HEAP8[$4 >> 0] | 0)) {
      if (!(HEAP32[$20 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $22; //@line 1103
       $$283$off0 = 1; //@line 1103
       label = 13; //@line 1104
       break L2;
      } else {
       $$182$off0 = 1; //@line 1107
       $$186$off0 = $22; //@line 1107
       break;
      }
     }
     if ((HEAP32[$2 >> 2] | 0) == 1) {
      label = 18; //@line 1114
      break L2;
     }
     if (!(HEAP32[$20 >> 2] & 2)) {
      label = 18; //@line 1121
      break L2;
     } else {
      $$182$off0 = 1; //@line 1124
      $$186$off0 = 1; //@line 1124
     }
    }
   } while (0);
   $30 = $26 + 8 | 0; //@line 1128
   if ($30 >>> 0 < $16 >>> 0) {
    HEAP8[$4 >> 0] = 0; //@line 1131
    HEAP8[$6 >> 0] = 0; //@line 1132
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 1133
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $10, $12, $12, 1, $14); //@line 1134
    if (!___async) {
     ___async_unwind = 0; //@line 1137
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 114; //@line 1139
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 1141
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 1143
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 1145
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 1147
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 1149
    HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $12; //@line 1151
    HEAP8[$ReallocAsyncCtx5 + 28 >> 0] = $14 & 1; //@line 1154
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $16; //@line 1156
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $18; //@line 1158
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $20; //@line 1160
    HEAP8[$ReallocAsyncCtx5 + 44 >> 0] = $$186$off0 & 1; //@line 1163
    HEAP8[$ReallocAsyncCtx5 + 45 >> 0] = $$182$off0 & 1; //@line 1166
    HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $30; //@line 1168
    HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $28; //@line 1170
    sp = STACKTOP; //@line 1171
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 1174
    $$283$off0 = $$182$off0; //@line 1174
    label = 13; //@line 1175
   }
  } else {
   $$085$off0$reg2mem$0 = $22; //@line 1178
   $$283$off0 = $24; //@line 1178
   label = 13; //@line 1179
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$28 >> 2] = $12; //@line 1185
    $59 = $10 + 40 | 0; //@line 1186
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 1189
    if ((HEAP32[$10 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$2 >> 2] | 0) == 2) {
      HEAP8[$8 >> 0] = 1; //@line 1197
      if ($$283$off0) {
       label = 18; //@line 1199
       break;
      } else {
       $67 = 4; //@line 1202
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 1209
   } else {
    $67 = 4; //@line 1211
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 1216
 }
 HEAP32[$18 >> 2] = $67; //@line 1218
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
 sp = STACKTOP; //@line 11194
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 11199
 } else {
  $9 = $1 + 52 | 0; //@line 11201
  $10 = HEAP8[$9 >> 0] | 0; //@line 11202
  $11 = $1 + 53 | 0; //@line 11203
  $12 = HEAP8[$11 >> 0] | 0; //@line 11204
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 11207
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 11208
  HEAP8[$9 >> 0] = 0; //@line 11209
  HEAP8[$11 >> 0] = 0; //@line 11210
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 11211
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 11212
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 112; //@line 11215
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 11217
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 11219
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 11221
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 11223
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 11225
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 11227
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 11229
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 11231
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 11233
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 11235
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 11238
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 11240
   sp = STACKTOP; //@line 11241
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11244
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 11249
    $32 = $0 + 8 | 0; //@line 11250
    $33 = $1 + 54 | 0; //@line 11251
    $$0 = $0 + 24 | 0; //@line 11252
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
     HEAP8[$9 >> 0] = 0; //@line 11285
     HEAP8[$11 >> 0] = 0; //@line 11286
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 11287
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 11288
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 11293
     $62 = $$0 + 8 | 0; //@line 11294
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 11297
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 113; //@line 11302
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 11304
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 11306
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 11308
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 11310
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 11312
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 11314
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 11316
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 11318
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 11320
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 11322
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 11324
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 11326
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 11328
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 11331
    sp = STACKTOP; //@line 11332
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 11336
  HEAP8[$11 >> 0] = $12; //@line 11337
 }
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_69($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 898
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 900
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 902
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 904
 $8 = HEAP8[$0 + 16 >> 0] & 1; //@line 907
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 909
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 911
 $15 = $12 + 24 | 0; //@line 914
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$12 + 8 >> 2] | 0; //@line 919
   if (!($18 & 2)) {
    $21 = $2 + 36 | 0; //@line 923
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $2 + 54 | 0; //@line 930
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 941
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 942
      if (!___async) {
       ___async_unwind = 0; //@line 945
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 118; //@line 947
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 949
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $10; //@line 951
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 953
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 955
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $2; //@line 957
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $4; //@line 959
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $6; //@line 961
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $8 & 1; //@line 964
      sp = STACKTOP; //@line 965
      return;
     }
     $36 = $2 + 24 | 0; //@line 968
     $37 = $2 + 54 | 0; //@line 969
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 984
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 985
     if (!___async) {
      ___async_unwind = 0; //@line 988
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 117; //@line 990
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 992
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $10; //@line 994
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 996
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 998
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 1000
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $2; //@line 1002
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $4; //@line 1004
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $6; //@line 1006
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $8 & 1; //@line 1009
     sp = STACKTOP; //@line 1010
     return;
    }
   }
   $24 = $2 + 54 | 0; //@line 1014
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 1018
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 1019
    if (!___async) {
     ___async_unwind = 0; //@line 1022
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 116; //@line 1024
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 1026
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $10; //@line 1028
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 1030
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $2; //@line 1032
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $4; //@line 1034
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $6; //@line 1036
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $8 & 1; //@line 1039
    sp = STACKTOP; //@line 1040
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7970
      $10 = HEAP32[$9 >> 2] | 0; //@line 7971
      HEAP32[$2 >> 2] = $9 + 4; //@line 7973
      HEAP32[$0 >> 2] = $10; //@line 7974
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7990
      $17 = HEAP32[$16 >> 2] | 0; //@line 7991
      HEAP32[$2 >> 2] = $16 + 4; //@line 7993
      $20 = $0; //@line 7996
      HEAP32[$20 >> 2] = $17; //@line 7998
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 8001
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8017
      $30 = HEAP32[$29 >> 2] | 0; //@line 8018
      HEAP32[$2 >> 2] = $29 + 4; //@line 8020
      $31 = $0; //@line 8021
      HEAP32[$31 >> 2] = $30; //@line 8023
      HEAP32[$31 + 4 >> 2] = 0; //@line 8026
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 8042
      $41 = $40; //@line 8043
      $43 = HEAP32[$41 >> 2] | 0; //@line 8045
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 8048
      HEAP32[$2 >> 2] = $40 + 8; //@line 8050
      $47 = $0; //@line 8051
      HEAP32[$47 >> 2] = $43; //@line 8053
      HEAP32[$47 + 4 >> 2] = $46; //@line 8056
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8072
      $57 = HEAP32[$56 >> 2] | 0; //@line 8073
      HEAP32[$2 >> 2] = $56 + 4; //@line 8075
      $59 = ($57 & 65535) << 16 >> 16; //@line 8077
      $62 = $0; //@line 8080
      HEAP32[$62 >> 2] = $59; //@line 8082
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 8085
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8101
      $72 = HEAP32[$71 >> 2] | 0; //@line 8102
      HEAP32[$2 >> 2] = $71 + 4; //@line 8104
      $73 = $0; //@line 8106
      HEAP32[$73 >> 2] = $72 & 65535; //@line 8108
      HEAP32[$73 + 4 >> 2] = 0; //@line 8111
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8127
      $83 = HEAP32[$82 >> 2] | 0; //@line 8128
      HEAP32[$2 >> 2] = $82 + 4; //@line 8130
      $85 = ($83 & 255) << 24 >> 24; //@line 8132
      $88 = $0; //@line 8135
      HEAP32[$88 >> 2] = $85; //@line 8137
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 8140
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8156
      $98 = HEAP32[$97 >> 2] | 0; //@line 8157
      HEAP32[$2 >> 2] = $97 + 4; //@line 8159
      $99 = $0; //@line 8161
      HEAP32[$99 >> 2] = $98 & 255; //@line 8163
      HEAP32[$99 + 4 >> 2] = 0; //@line 8166
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 8182
      $109 = +HEAPF64[$108 >> 3]; //@line 8183
      HEAP32[$2 >> 2] = $108 + 8; //@line 8185
      HEAPF64[$0 >> 3] = $109; //@line 8186
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 8202
      $116 = +HEAPF64[$115 >> 3]; //@line 8203
      HEAP32[$2 >> 2] = $115 + 8; //@line 8205
      HEAPF64[$0 >> 3] = $116; //@line 8206
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
 sp = STACKTOP; //@line 6870
 STACKTOP = STACKTOP + 224 | 0; //@line 6871
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 6871
 $3 = sp + 120 | 0; //@line 6872
 $4 = sp + 80 | 0; //@line 6873
 $5 = sp; //@line 6874
 $6 = sp + 136 | 0; //@line 6875
 dest = $4; //@line 6876
 stop = dest + 40 | 0; //@line 6876
 do {
  HEAP32[dest >> 2] = 0; //@line 6876
  dest = dest + 4 | 0; //@line 6876
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 6878
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 6882
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 6889
  } else {
   $43 = 0; //@line 6891
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 6893
  $14 = $13 & 32; //@line 6894
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 6900
  }
  $19 = $0 + 48 | 0; //@line 6902
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 6907
    $24 = HEAP32[$23 >> 2] | 0; //@line 6908
    HEAP32[$23 >> 2] = $6; //@line 6909
    $25 = $0 + 28 | 0; //@line 6910
    HEAP32[$25 >> 2] = $6; //@line 6911
    $26 = $0 + 20 | 0; //@line 6912
    HEAP32[$26 >> 2] = $6; //@line 6913
    HEAP32[$19 >> 2] = 80; //@line 6914
    $28 = $0 + 16 | 0; //@line 6916
    HEAP32[$28 >> 2] = $6 + 80; //@line 6917
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6918
    if (!$24) {
     $$1 = $29; //@line 6921
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 6924
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 6925
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 6926
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 99; //@line 6929
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 6931
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 6933
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 6935
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 6937
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 6939
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 6941
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 6943
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 6945
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 6947
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 6949
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 6951
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 6953
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 6955
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 6957
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 6959
      sp = STACKTOP; //@line 6960
      STACKTOP = sp; //@line 6961
      return 0; //@line 6961
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 6963
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 6966
      HEAP32[$23 >> 2] = $24; //@line 6967
      HEAP32[$19 >> 2] = 0; //@line 6968
      HEAP32[$28 >> 2] = 0; //@line 6969
      HEAP32[$25 >> 2] = 0; //@line 6970
      HEAP32[$26 >> 2] = 0; //@line 6971
      $$1 = $$; //@line 6972
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6978
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 6981
  HEAP32[$0 >> 2] = $51 | $14; //@line 6986
  if ($43 | 0) {
   ___unlockfile($0); //@line 6989
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 6991
 }
 STACKTOP = sp; //@line 6993
 return $$0 | 0; //@line 6993
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 10827
 STACKTOP = STACKTOP + 64 | 0; //@line 10828
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 10828
 $4 = sp; //@line 10829
 $5 = HEAP32[$0 >> 2] | 0; //@line 10830
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 10833
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 10835
 HEAP32[$4 >> 2] = $2; //@line 10836
 HEAP32[$4 + 4 >> 2] = $0; //@line 10838
 HEAP32[$4 + 8 >> 2] = $1; //@line 10840
 HEAP32[$4 + 12 >> 2] = $3; //@line 10842
 $14 = $4 + 16 | 0; //@line 10843
 $15 = $4 + 20 | 0; //@line 10844
 $16 = $4 + 24 | 0; //@line 10845
 $17 = $4 + 28 | 0; //@line 10846
 $18 = $4 + 32 | 0; //@line 10847
 $19 = $4 + 40 | 0; //@line 10848
 dest = $14; //@line 10849
 stop = dest + 36 | 0; //@line 10849
 do {
  HEAP32[dest >> 2] = 0; //@line 10849
  dest = dest + 4 | 0; //@line 10849
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 10849
 HEAP8[$14 + 38 >> 0] = 0; //@line 10849
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 10854
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10857
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10858
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 10859
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 106; //@line 10862
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 10864
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 10866
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 10868
    sp = STACKTOP; //@line 10869
    STACKTOP = sp; //@line 10870
    return 0; //@line 10870
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10872
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 10876
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 10880
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 10883
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 10884
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 10885
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 107; //@line 10888
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 10890
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 10892
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 10894
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 10896
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 10898
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 10900
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 10902
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 10904
    sp = STACKTOP; //@line 10905
    STACKTOP = sp; //@line 10906
    return 0; //@line 10906
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10908
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 10922
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 10930
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 10946
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 10951
  }
 } while (0);
 STACKTOP = sp; //@line 10954
 return $$0 | 0; //@line 10954
}
function __ZN4mbed6BusOut5writeEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $105 = 0, $14 = 0, $20 = 0, $26 = 0, $32 = 0, $38 = 0, $4 = 0, $44 = 0, $50 = 0, $56 = 0, $62 = 0, $68 = 0, $74 = 0, $80 = 0, $86 = 0, $9 = 0, $92 = 0, $98 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 382
 $4 = HEAP32[(HEAP32[$0 >> 2] | 0) + 8 >> 2] | 0; //@line 385
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 386
 FUNCTION_TABLE_vi[$4 & 127]($0); //@line 387
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 13; //@line 390
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 392
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 394
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 396
  sp = STACKTOP; //@line 397
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 400
 $9 = HEAP32[$0 + 4 >> 2] | 0; //@line 402
 if ($9 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$9 >> 2] | 0, $1 & 1 | 0) | 0; //@line 407
 }
 $14 = HEAP32[$0 + 8 >> 2] | 0; //@line 410
 if ($14 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$14 >> 2] | 0, $1 >>> 1 & 1 | 0) | 0; //@line 416
 }
 $20 = HEAP32[$0 + 12 >> 2] | 0; //@line 419
 if ($20 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$20 >> 2] | 0, $1 >>> 2 & 1 | 0) | 0; //@line 425
 }
 $26 = HEAP32[$0 + 16 >> 2] | 0; //@line 428
 if ($26 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$26 >> 2] | 0, $1 >>> 3 & 1 | 0) | 0; //@line 434
 }
 $32 = HEAP32[$0 + 20 >> 2] | 0; //@line 437
 if ($32 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$32 >> 2] | 0, $1 >>> 4 & 1 | 0) | 0; //@line 443
 }
 $38 = HEAP32[$0 + 24 >> 2] | 0; //@line 446
 if ($38 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$38 >> 2] | 0, $1 >>> 5 & 1 | 0) | 0; //@line 452
 }
 $44 = HEAP32[$0 + 28 >> 2] | 0; //@line 455
 if ($44 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$44 >> 2] | 0, $1 >>> 6 & 1 | 0) | 0; //@line 461
 }
 $50 = HEAP32[$0 + 32 >> 2] | 0; //@line 464
 if ($50 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$50 >> 2] | 0, $1 >>> 7 & 1 | 0) | 0; //@line 470
 }
 $56 = HEAP32[$0 + 36 >> 2] | 0; //@line 473
 if ($56 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$56 >> 2] | 0, $1 >>> 8 & 1 | 0) | 0; //@line 479
 }
 $62 = HEAP32[$0 + 40 >> 2] | 0; //@line 482
 if ($62 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$62 >> 2] | 0, $1 >>> 9 & 1 | 0) | 0; //@line 488
 }
 $68 = HEAP32[$0 + 44 >> 2] | 0; //@line 491
 if ($68 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$68 >> 2] | 0, $1 >>> 10 & 1 | 0) | 0; //@line 497
 }
 $74 = HEAP32[$0 + 48 >> 2] | 0; //@line 500
 if ($74 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$74 >> 2] | 0, $1 >>> 11 & 1 | 0) | 0; //@line 506
 }
 $80 = HEAP32[$0 + 52 >> 2] | 0; //@line 509
 if ($80 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$80 >> 2] | 0, $1 >>> 12 & 1 | 0) | 0; //@line 515
 }
 $86 = HEAP32[$0 + 56 >> 2] | 0; //@line 518
 if ($86 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$86 >> 2] | 0, $1 >>> 13 & 1 | 0) | 0; //@line 524
 }
 $92 = HEAP32[$0 + 60 >> 2] | 0; //@line 527
 if ($92 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$92 >> 2] | 0, $1 >>> 14 & 1 | 0) | 0; //@line 533
 }
 $98 = HEAP32[$0 + 64 >> 2] | 0; //@line 536
 if ($98 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$98 >> 2] | 0, $1 >>> 15 & 1 | 0) | 0; //@line 542
 }
 $105 = HEAP32[(HEAP32[$0 >> 2] | 0) + 12 >> 2] | 0; //@line 546
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 547
 FUNCTION_TABLE_vi[$105 & 127]($0); //@line 548
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 14; //@line 551
  sp = STACKTOP; //@line 552
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 555
  return;
 }
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 6742
 $7 = ($2 | 0) != 0; //@line 6746
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 6750
   $$03555 = $0; //@line 6751
   $$03654 = $2; //@line 6751
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 6756
     $$036$lcssa64 = $$03654; //@line 6756
     label = 6; //@line 6757
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 6760
    $12 = $$03654 + -1 | 0; //@line 6761
    $16 = ($12 | 0) != 0; //@line 6765
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 6768
     $$03654 = $12; //@line 6768
    } else {
     $$035$lcssa = $11; //@line 6770
     $$036$lcssa = $12; //@line 6770
     $$lcssa = $16; //@line 6770
     label = 5; //@line 6771
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 6776
   $$036$lcssa = $2; //@line 6776
   $$lcssa = $7; //@line 6776
   label = 5; //@line 6777
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 6782
   $$036$lcssa64 = $$036$lcssa; //@line 6782
   label = 6; //@line 6783
  } else {
   $$2 = $$035$lcssa; //@line 6785
   $$3 = 0; //@line 6785
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 6791
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 6794
    $$3 = $$036$lcssa64; //@line 6794
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 6796
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 6800
      $$13745 = $$036$lcssa64; //@line 6800
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 6803
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 6812
       $30 = $$13745 + -4 | 0; //@line 6813
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 6816
        $$13745 = $30; //@line 6816
       } else {
        $$0$lcssa = $29; //@line 6818
        $$137$lcssa = $30; //@line 6818
        label = 11; //@line 6819
        break L11;
       }
      }
      $$140 = $$046; //@line 6823
      $$23839 = $$13745; //@line 6823
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 6825
      $$137$lcssa = $$036$lcssa64; //@line 6825
      label = 11; //@line 6826
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 6832
      $$3 = 0; //@line 6832
      break;
     } else {
      $$140 = $$0$lcssa; //@line 6835
      $$23839 = $$137$lcssa; //@line 6835
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 6842
      $$3 = $$23839; //@line 6842
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 6845
     $$23839 = $$23839 + -1 | 0; //@line 6846
     if (!$$23839) {
      $$2 = $35; //@line 6849
      $$3 = 0; //@line 6849
      break;
     } else {
      $$140 = $35; //@line 6852
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 6860
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 6513
 do {
  if (!$0) {
   do {
    if (!(HEAP32[90] | 0)) {
     $34 = 0; //@line 6521
    } else {
     $12 = HEAP32[90] | 0; //@line 6523
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 6524
     $13 = _fflush($12) | 0; //@line 6525
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 95; //@line 6528
      sp = STACKTOP; //@line 6529
      return 0; //@line 6530
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 6532
      $34 = $13; //@line 6533
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 6539
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 6543
    } else {
     $$02327 = $$02325; //@line 6545
     $$02426 = $34; //@line 6545
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 6552
      } else {
       $28 = 0; //@line 6554
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 6562
       $25 = ___fflush_unlocked($$02327) | 0; //@line 6563
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 6568
       $$1 = $25 | $$02426; //@line 6570
      } else {
       $$1 = $$02426; //@line 6572
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 6576
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 6579
      if (!$$023) {
       $$024$lcssa = $$1; //@line 6582
       break L9;
      } else {
       $$02327 = $$023; //@line 6585
       $$02426 = $$1; //@line 6585
      }
     }
     HEAP32[$AsyncCtx >> 2] = 96; //@line 6588
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 6590
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 6592
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 6594
     sp = STACKTOP; //@line 6595
     return 0; //@line 6596
    }
   } while (0);
   ___ofl_unlock(); //@line 6599
   $$0 = $$024$lcssa; //@line 6600
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 6606
    $5 = ___fflush_unlocked($0) | 0; //@line 6607
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 93; //@line 6610
     sp = STACKTOP; //@line 6611
     return 0; //@line 6612
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 6614
     $$0 = $5; //@line 6615
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 6620
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 6621
   $7 = ___fflush_unlocked($0) | 0; //@line 6622
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 94; //@line 6625
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 6628
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 6630
    sp = STACKTOP; //@line 6631
    return 0; //@line 6632
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6634
   if ($phitmp) {
    $$0 = $7; //@line 6636
   } else {
    ___unlockfile($0); //@line 6638
    $$0 = $7; //@line 6639
   }
  }
 } while (0);
 return $$0 | 0; //@line 6643
}
function _mbed_vtracef__async_cb_58($0) {
 $0 = $0 | 0;
 var $$13 = 0, $$expand_i1_val = 0, $10 = 0, $14 = 0, $18 = 0, $19 = 0, $2 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 14011
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14013
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14015
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14017
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14019
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 14021
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 14026
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 14028
 $$13 = ($AsyncRetVal | 0) >= ($10 | 0) ? 0 : $AsyncRetVal; //@line 14030
 $18 = (HEAP32[$0 + 24 >> 2] | 0) + $$13 | 0; //@line 14032
 $19 = $10 - $$13 | 0; //@line 14033
 do {
  if (($$13 | 0) > 0) {
   $21 = HEAP32[52] | 0; //@line 14037
   if (!(($19 | 0) > 0 & ($21 | 0) != 0)) {
    if (($$13 | 0) < 1 | ($19 | 0) < 1 | $14 ^ 1) {
     break;
    }
    _snprintf($18, $19, 1223, $2) | 0; //@line 14049
    break;
   }
   $ReallocAsyncCtx6 = _emscripten_realloc_async_context(32) | 0; //@line 14052
   $23 = FUNCTION_TABLE_i[$21 & 0]() | 0; //@line 14053
   if (___async) {
    HEAP32[$ReallocAsyncCtx6 >> 2] = 26; //@line 14056
    $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 14057
    HEAP32[$24 >> 2] = $6; //@line 14058
    $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 14059
    HEAP32[$25 >> 2] = $18; //@line 14060
    $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 14061
    HEAP32[$26 >> 2] = $19; //@line 14062
    $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 14063
    HEAP32[$27 >> 2] = $8; //@line 14064
    $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 14065
    $$expand_i1_val = $14 & 1; //@line 14066
    HEAP8[$28 >> 0] = $$expand_i1_val; //@line 14067
    $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 14068
    HEAP32[$29 >> 2] = $2; //@line 14069
    $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 14070
    HEAP32[$30 >> 2] = $4; //@line 14071
    sp = STACKTOP; //@line 14072
    return;
   }
   HEAP32[___async_retval >> 2] = $23; //@line 14076
   ___async_unwind = 0; //@line 14077
   HEAP32[$ReallocAsyncCtx6 >> 2] = 26; //@line 14078
   $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 14079
   HEAP32[$24 >> 2] = $6; //@line 14080
   $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 14081
   HEAP32[$25 >> 2] = $18; //@line 14082
   $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 14083
   HEAP32[$26 >> 2] = $19; //@line 14084
   $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 14085
   HEAP32[$27 >> 2] = $8; //@line 14086
   $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 14087
   $$expand_i1_val = $14 & 1; //@line 14088
   HEAP8[$28 >> 0] = $$expand_i1_val; //@line 14089
   $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 14090
   HEAP32[$29 >> 2] = $2; //@line 14091
   $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 14092
   HEAP32[$30 >> 2] = $4; //@line 14093
   sp = STACKTOP; //@line 14094
   return;
  }
 } while (0);
 $34 = HEAP32[53] | 0; //@line 14098
 $35 = HEAP32[46] | 0; //@line 14099
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 14100
 FUNCTION_TABLE_vi[$34 & 127]($35); //@line 14101
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 27; //@line 14104
  sp = STACKTOP; //@line 14105
  return;
 }
 ___async_unwind = 0; //@line 14108
 HEAP32[$ReallocAsyncCtx7 >> 2] = 27; //@line 14109
 sp = STACKTOP; //@line 14110
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11009
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 11015
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 11021
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 11024
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 11025
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 11026
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 110; //@line 11029
     sp = STACKTOP; //@line 11030
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11033
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 11041
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 11046
     $19 = $1 + 44 | 0; //@line 11047
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 11053
     HEAP8[$22 >> 0] = 0; //@line 11054
     $23 = $1 + 53 | 0; //@line 11055
     HEAP8[$23 >> 0] = 0; //@line 11056
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 11058
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 11061
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 11062
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 11063
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 109; //@line 11066
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 11068
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 11070
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 11072
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 11074
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 11076
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 11078
      sp = STACKTOP; //@line 11079
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 11082
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 11086
      label = 13; //@line 11087
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 11092
       label = 13; //@line 11093
      } else {
       $$037$off039 = 3; //@line 11095
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 11099
      $39 = $1 + 40 | 0; //@line 11100
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 11103
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 11113
        $$037$off039 = $$037$off038; //@line 11114
       } else {
        $$037$off039 = $$037$off038; //@line 11116
       }
      } else {
       $$037$off039 = $$037$off038; //@line 11119
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 11122
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 11129
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_59($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 14120
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14122
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14124
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14126
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14128
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 14130
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 14132
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 14134
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 14136
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 14138
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 14140
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 14142
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 14144
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 14146
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 14148
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 14150
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 14152
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 14154
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 14156
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 14158
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 14160
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 14162
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 14164
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 14166
 $48 = HEAP8[$0 + 96 >> 0] & 1; //@line 14169
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 14171
 $55 = ($50 | 0 ? 4 : 0) + $50 + (HEAP32[___async_retval >> 2] | 0) | 0; //@line 14177
 $56 = HEAP32[51] | 0; //@line 14178
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(100) | 0; //@line 14179
 $57 = FUNCTION_TABLE_ii[$56 & 1]($55) | 0; //@line 14180
 if (!___async) {
  HEAP32[___async_retval >> 2] = $57; //@line 14184
  ___async_unwind = 0; //@line 14185
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 24; //@line 14187
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 14189
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 14191
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 14193
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 14195
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 14197
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $12; //@line 14199
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 14201
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $16; //@line 14203
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $18; //@line 14205
 HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $20; //@line 14207
 HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $22; //@line 14209
 HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $24; //@line 14211
 HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $26; //@line 14213
 HEAP32[$ReallocAsyncCtx5 + 56 >> 2] = $28; //@line 14215
 HEAP32[$ReallocAsyncCtx5 + 60 >> 2] = $30; //@line 14217
 HEAP32[$ReallocAsyncCtx5 + 64 >> 2] = $32; //@line 14219
 HEAP32[$ReallocAsyncCtx5 + 68 >> 2] = $34; //@line 14221
 HEAP32[$ReallocAsyncCtx5 + 72 >> 2] = $36; //@line 14223
 HEAP32[$ReallocAsyncCtx5 + 76 >> 2] = $38; //@line 14225
 HEAP32[$ReallocAsyncCtx5 + 80 >> 2] = $40; //@line 14227
 HEAP32[$ReallocAsyncCtx5 + 84 >> 2] = $42; //@line 14229
 HEAP32[$ReallocAsyncCtx5 + 88 >> 2] = $44; //@line 14231
 HEAP32[$ReallocAsyncCtx5 + 92 >> 2] = $46; //@line 14233
 HEAP8[$ReallocAsyncCtx5 + 96 >> 0] = $48 & 1; //@line 14236
 sp = STACKTOP; //@line 14237
 return;
}
function __ZN4mbed6BusOut5writeEi__async_cb($0) {
 $0 = $0 | 0;
 var $104 = 0, $13 = 0, $19 = 0, $2 = 0, $25 = 0, $31 = 0, $37 = 0, $4 = 0, $43 = 0, $49 = 0, $55 = 0, $6 = 0, $61 = 0, $67 = 0, $73 = 0, $79 = 0, $8 = 0, $85 = 0, $91 = 0, $97 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 15
 $8 = HEAP32[$4 + 4 >> 2] | 0; //@line 17
 if ($8 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$8 >> 2] | 0, $2 & 1 | 0) | 0; //@line 22
 }
 $13 = HEAP32[$4 + 8 >> 2] | 0; //@line 25
 if ($13 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$13 >> 2] | 0, $2 >>> 1 & 1 | 0) | 0; //@line 31
 }
 $19 = HEAP32[$4 + 12 >> 2] | 0; //@line 34
 if ($19 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$19 >> 2] | 0, $2 >>> 2 & 1 | 0) | 0; //@line 40
 }
 $25 = HEAP32[$4 + 16 >> 2] | 0; //@line 43
 if ($25 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$25 >> 2] | 0, $2 >>> 3 & 1 | 0) | 0; //@line 49
 }
 $31 = HEAP32[$4 + 20 >> 2] | 0; //@line 52
 if ($31 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$31 >> 2] | 0, $2 >>> 4 & 1 | 0) | 0; //@line 58
 }
 $37 = HEAP32[$4 + 24 >> 2] | 0; //@line 61
 if ($37 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$37 >> 2] | 0, $2 >>> 5 & 1 | 0) | 0; //@line 67
 }
 $43 = HEAP32[$4 + 28 >> 2] | 0; //@line 70
 if ($43 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$43 >> 2] | 0, $2 >>> 6 & 1 | 0) | 0; //@line 76
 }
 $49 = HEAP32[$4 + 32 >> 2] | 0; //@line 79
 if ($49 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$49 >> 2] | 0, $2 >>> 7 & 1 | 0) | 0; //@line 85
 }
 $55 = HEAP32[$4 + 36 >> 2] | 0; //@line 88
 if ($55 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$55 >> 2] | 0, $2 >>> 8 & 1 | 0) | 0; //@line 94
 }
 $61 = HEAP32[$4 + 40 >> 2] | 0; //@line 97
 if ($61 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$61 >> 2] | 0, $2 >>> 9 & 1 | 0) | 0; //@line 103
 }
 $67 = HEAP32[$4 + 44 >> 2] | 0; //@line 106
 if ($67 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$67 >> 2] | 0, $2 >>> 10 & 1 | 0) | 0; //@line 112
 }
 $73 = HEAP32[$4 + 48 >> 2] | 0; //@line 115
 if ($73 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$73 >> 2] | 0, $2 >>> 11 & 1 | 0) | 0; //@line 121
 }
 $79 = HEAP32[$4 + 52 >> 2] | 0; //@line 124
 if ($79 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$79 >> 2] | 0, $2 >>> 12 & 1 | 0) | 0; //@line 130
 }
 $85 = HEAP32[$4 + 56 >> 2] | 0; //@line 133
 if ($85 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$85 >> 2] | 0, $2 >>> 13 & 1 | 0) | 0; //@line 139
 }
 $91 = HEAP32[$4 + 60 >> 2] | 0; //@line 142
 if ($91 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$91 >> 2] | 0, $2 >>> 14 & 1 | 0) | 0; //@line 148
 }
 $97 = HEAP32[$4 + 64 >> 2] | 0; //@line 151
 if ($97 | 0) {
  _emscripten_asm_const_iii(1, HEAP32[$97 >> 2] | 0, $2 >>> 15 & 1 | 0) | 0; //@line 157
 }
 $104 = HEAP32[(HEAP32[$6 >> 2] | 0) + 12 >> 2] | 0; //@line 161
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 162
 FUNCTION_TABLE_vi[$104 & 127]($4); //@line 163
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
function __ZN4mbed6BusOutC2E7PinNameS1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1___async_cb($0) {
 $0 = $0 | 0;
 var $$02932$reg2mem$0 = 0, $$pre = 0, $10 = 0, $12 = 0, $14 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1673
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1675
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1677
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1679
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1681
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1683
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1685
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1687
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1689
 HEAP32[$AsyncRetVal >> 2] = 0; //@line 1690
 HEAP32[$AsyncRetVal + 4 >> 2] = 0; //@line 1690
 HEAP32[$AsyncRetVal + 8 >> 2] = 0; //@line 1690
 HEAP32[$AsyncRetVal + 12 >> 2] = 0; //@line 1690
 HEAP32[$AsyncRetVal + 16 >> 2] = 0; //@line 1690
 HEAP32[$AsyncRetVal + 20 >> 2] = 0; //@line 1690
 _gpio_init_out($AsyncRetVal, $2); //@line 1691
 HEAP32[$4 + 4 + ($6 << 2) >> 2] = $AsyncRetVal; //@line 1693
 HEAP32[$8 >> 2] = HEAP32[$8 >> 2] | 1 << $6; //@line 1697
 $$02932$reg2mem$0 = $6; //@line 1698
 while (1) {
  $18 = $$02932$reg2mem$0 + 1 | 0; //@line 1700
  if (($$02932$reg2mem$0 | 0) >= 15) {
   label = 2; //@line 1703
   break;
  }
  $$pre = HEAP32[$10 + ($18 << 2) >> 2] | 0; //@line 1707
  if (($$pre | 0) != -1) {
   break;
  }
  HEAP32[$4 + 4 + ($18 << 2) >> 2] = 0; //@line 1713
  $$02932$reg2mem$0 = $18; //@line 1714
 }
 if ((label | 0) == 2) {
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(32) | 0; //@line 1719
 $19 = __Znwj(24) | 0; //@line 1720
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 12; //@line 1723
  $20 = $ReallocAsyncCtx + 4 | 0; //@line 1724
  HEAP32[$20 >> 2] = $$pre; //@line 1725
  $21 = $ReallocAsyncCtx + 8 | 0; //@line 1726
  HEAP32[$21 >> 2] = $4; //@line 1727
  $22 = $ReallocAsyncCtx + 12 | 0; //@line 1728
  HEAP32[$22 >> 2] = $18; //@line 1729
  $23 = $ReallocAsyncCtx + 16 | 0; //@line 1730
  HEAP32[$23 >> 2] = $8; //@line 1731
  $24 = $ReallocAsyncCtx + 20 | 0; //@line 1732
  HEAP32[$24 >> 2] = $10; //@line 1733
  $25 = $ReallocAsyncCtx + 24 | 0; //@line 1734
  HEAP32[$25 >> 2] = $12; //@line 1735
  $26 = $ReallocAsyncCtx + 28 | 0; //@line 1736
  HEAP32[$26 >> 2] = $14; //@line 1737
  sp = STACKTOP; //@line 1738
  return;
 }
 HEAP32[___async_retval >> 2] = $19; //@line 1742
 ___async_unwind = 0; //@line 1743
 HEAP32[$ReallocAsyncCtx >> 2] = 12; //@line 1744
 $20 = $ReallocAsyncCtx + 4 | 0; //@line 1745
 HEAP32[$20 >> 2] = $$pre; //@line 1746
 $21 = $ReallocAsyncCtx + 8 | 0; //@line 1747
 HEAP32[$21 >> 2] = $4; //@line 1748
 $22 = $ReallocAsyncCtx + 12 | 0; //@line 1749
 HEAP32[$22 >> 2] = $18; //@line 1750
 $23 = $ReallocAsyncCtx + 16 | 0; //@line 1751
 HEAP32[$23 >> 2] = $8; //@line 1752
 $24 = $ReallocAsyncCtx + 20 | 0; //@line 1753
 HEAP32[$24 >> 2] = $10; //@line 1754
 $25 = $ReallocAsyncCtx + 24 | 0; //@line 1755
 HEAP32[$25 >> 2] = $12; //@line 1756
 $26 = $ReallocAsyncCtx + 28 | 0; //@line 1757
 HEAP32[$26 >> 2] = $14; //@line 1758
 sp = STACKTOP; //@line 1759
 return;
}
function _mbed_error_vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 484
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 486
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 488
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 490
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[1024] | 0)) {
  _serial_init(4100, 2, 3); //@line 498
 }
 $9 = HEAP8[$4 >> 0] | 0; //@line 500
 if (0 == 13 | $9 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 506
  _serial_putc(4100, $9 << 24 >> 24); //@line 507
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 50; //@line 510
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 511
   HEAP32[$18 >> 2] = 0; //@line 512
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 513
   HEAP32[$19 >> 2] = $AsyncRetVal; //@line 514
   $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 515
   HEAP32[$20 >> 2] = $2; //@line 516
   $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 517
   HEAP8[$21 >> 0] = $9; //@line 518
   $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 519
   HEAP32[$22 >> 2] = $4; //@line 520
   sp = STACKTOP; //@line 521
   return;
  }
  ___async_unwind = 0; //@line 524
  HEAP32[$ReallocAsyncCtx2 >> 2] = 50; //@line 525
  $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 526
  HEAP32[$18 >> 2] = 0; //@line 527
  $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 528
  HEAP32[$19 >> 2] = $AsyncRetVal; //@line 529
  $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 530
  HEAP32[$20 >> 2] = $2; //@line 531
  $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 532
  HEAP8[$21 >> 0] = $9; //@line 533
  $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 534
  HEAP32[$22 >> 2] = $4; //@line 535
  sp = STACKTOP; //@line 536
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 539
  _serial_putc(4100, 13); //@line 540
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 49; //@line 543
   $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 544
   HEAP8[$12 >> 0] = $9; //@line 545
   $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 546
   HEAP32[$13 >> 2] = 0; //@line 547
   $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 548
   HEAP32[$14 >> 2] = $AsyncRetVal; //@line 549
   $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 550
   HEAP32[$15 >> 2] = $2; //@line 551
   $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 552
   HEAP32[$16 >> 2] = $4; //@line 553
   sp = STACKTOP; //@line 554
   return;
  }
  ___async_unwind = 0; //@line 557
  HEAP32[$ReallocAsyncCtx3 >> 2] = 49; //@line 558
  $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 559
  HEAP8[$12 >> 0] = $9; //@line 560
  $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 561
  HEAP32[$13 >> 2] = 0; //@line 562
  $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 563
  HEAP32[$14 >> 2] = $AsyncRetVal; //@line 564
  $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 565
  HEAP32[$15 >> 2] = $2; //@line 566
  $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 567
  HEAP32[$16 >> 2] = $4; //@line 568
  sp = STACKTOP; //@line 569
  return;
 }
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5554
 STACKTOP = STACKTOP + 48 | 0; //@line 5555
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 5555
 $vararg_buffer3 = sp + 16 | 0; //@line 5556
 $vararg_buffer = sp; //@line 5557
 $3 = sp + 32 | 0; //@line 5558
 $4 = $0 + 28 | 0; //@line 5559
 $5 = HEAP32[$4 >> 2] | 0; //@line 5560
 HEAP32[$3 >> 2] = $5; //@line 5561
 $7 = $0 + 20 | 0; //@line 5563
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 5565
 HEAP32[$3 + 4 >> 2] = $9; //@line 5566
 HEAP32[$3 + 8 >> 2] = $1; //@line 5568
 HEAP32[$3 + 12 >> 2] = $2; //@line 5570
 $12 = $9 + $2 | 0; //@line 5571
 $13 = $0 + 60 | 0; //@line 5572
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 5575
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 5577
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 5579
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 5581
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 5585
  } else {
   $$04756 = 2; //@line 5587
   $$04855 = $12; //@line 5587
   $$04954 = $3; //@line 5587
   $27 = $17; //@line 5587
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 5593
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 5595
    $38 = $27 >>> 0 > $37 >>> 0; //@line 5596
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 5598
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 5600
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 5602
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 5605
    $44 = $$150 + 4 | 0; //@line 5606
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 5609
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 5612
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 5614
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 5616
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 5618
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 5621
     break L1;
    } else {
     $$04756 = $$1; //@line 5624
     $$04954 = $$150; //@line 5624
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 5628
   HEAP32[$4 >> 2] = 0; //@line 5629
   HEAP32[$7 >> 2] = 0; //@line 5630
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 5633
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 5636
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 5641
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 5647
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 5652
  $25 = $20; //@line 5653
  HEAP32[$4 >> 2] = $25; //@line 5654
  HEAP32[$7 >> 2] = $25; //@line 5655
  $$051 = $2; //@line 5656
 }
 STACKTOP = sp; //@line 5658
 return $$051 | 0; //@line 5658
}
function _mbed_error_vfprintf__async_cb_65($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 577
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 581
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 583
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 587
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 588
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP8[$10 + $12 >> 0] | 0; //@line 594
 if ((HEAP8[$0 + 16 >> 0] | 0) == 13 | $13 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 600
  _serial_putc(4100, $13 << 24 >> 24); //@line 601
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 50; //@line 604
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 605
   HEAP32[$22 >> 2] = $12; //@line 606
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 607
   HEAP32[$23 >> 2] = $4; //@line 608
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 609
   HEAP32[$24 >> 2] = $6; //@line 610
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 611
   HEAP8[$25 >> 0] = $13; //@line 612
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 613
   HEAP32[$26 >> 2] = $10; //@line 614
   sp = STACKTOP; //@line 615
   return;
  }
  ___async_unwind = 0; //@line 618
  HEAP32[$ReallocAsyncCtx2 >> 2] = 50; //@line 619
  $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 620
  HEAP32[$22 >> 2] = $12; //@line 621
  $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 622
  HEAP32[$23 >> 2] = $4; //@line 623
  $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 624
  HEAP32[$24 >> 2] = $6; //@line 625
  $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 626
  HEAP8[$25 >> 0] = $13; //@line 627
  $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 628
  HEAP32[$26 >> 2] = $10; //@line 629
  sp = STACKTOP; //@line 630
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 633
  _serial_putc(4100, 13); //@line 634
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 49; //@line 637
   $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 638
   HEAP8[$16 >> 0] = $13; //@line 639
   $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 640
   HEAP32[$17 >> 2] = $12; //@line 641
   $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 642
   HEAP32[$18 >> 2] = $4; //@line 643
   $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 644
   HEAP32[$19 >> 2] = $6; //@line 645
   $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 646
   HEAP32[$20 >> 2] = $10; //@line 647
   sp = STACKTOP; //@line 648
   return;
  }
  ___async_unwind = 0; //@line 651
  HEAP32[$ReallocAsyncCtx3 >> 2] = 49; //@line 652
  $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 653
  HEAP8[$16 >> 0] = $13; //@line 654
  $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 655
  HEAP32[$17 >> 2] = $12; //@line 656
  $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 657
  HEAP32[$18 >> 2] = $4; //@line 658
  $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 659
  HEAP32[$19 >> 2] = $6; //@line 660
  $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 661
  HEAP32[$20 >> 2] = $10; //@line 662
  sp = STACKTOP; //@line 663
  return;
 }
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
 sp = STACKTOP; //@line 278
 STACKTOP = STACKTOP + 64 | 0; //@line 279
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 279
 $17 = sp; //@line 280
 HEAP32[$0 >> 2] = 152; //@line 281
 HEAP32[$17 >> 2] = $1; //@line 282
 HEAP32[$17 + 4 >> 2] = $2; //@line 284
 HEAP32[$17 + 8 >> 2] = $3; //@line 286
 HEAP32[$17 + 12 >> 2] = $4; //@line 288
 HEAP32[$17 + 16 >> 2] = $5; //@line 290
 HEAP32[$17 + 20 >> 2] = $6; //@line 292
 HEAP32[$17 + 24 >> 2] = $7; //@line 294
 HEAP32[$17 + 28 >> 2] = $8; //@line 296
 HEAP32[$17 + 32 >> 2] = $9; //@line 298
 HEAP32[$17 + 36 >> 2] = $10; //@line 300
 HEAP32[$17 + 40 >> 2] = $11; //@line 302
 HEAP32[$17 + 44 >> 2] = $12; //@line 304
 HEAP32[$17 + 48 >> 2] = $13; //@line 306
 HEAP32[$17 + 52 >> 2] = $14; //@line 308
 HEAP32[$17 + 56 >> 2] = $15; //@line 310
 HEAP32[$17 + 60 >> 2] = $16; //@line 312
 $33 = $0 + 68 | 0; //@line 313
 HEAP32[$33 >> 2] = 0; //@line 314
 $$02932 = 0; //@line 315
 $35 = $1; //@line 315
 while (1) {
  if (($35 | 0) == -1) {
   HEAP32[$0 + 4 + ($$02932 << 2) >> 2] = 0; //@line 320
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(32, sp) | 0; //@line 322
   $37 = __Znwj(24) | 0; //@line 323
   if (___async) {
    label = 6; //@line 326
    break;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 329
   HEAP32[$37 >> 2] = 0; //@line 330
   HEAP32[$37 + 4 >> 2] = 0; //@line 330
   HEAP32[$37 + 8 >> 2] = 0; //@line 330
   HEAP32[$37 + 12 >> 2] = 0; //@line 330
   HEAP32[$37 + 16 >> 2] = 0; //@line 330
   HEAP32[$37 + 20 >> 2] = 0; //@line 330
   _gpio_init_out($37, $35); //@line 331
   HEAP32[$0 + 4 + ($$02932 << 2) >> 2] = $37; //@line 333
   HEAP32[$33 >> 2] = HEAP32[$33 >> 2] | 1 << $$02932; //@line 337
  }
  $49 = $$02932 + 1 | 0; //@line 339
  if (($$02932 | 0) >= 15) {
   label = 2; //@line 342
   break;
  }
  $$02932 = $49; //@line 347
  $35 = HEAP32[$17 + ($49 << 2) >> 2] | 0; //@line 347
 }
 if ((label | 0) == 2) {
  STACKTOP = sp; //@line 350
  return;
 } else if ((label | 0) == 6) {
  HEAP32[$AsyncCtx >> 2] = 12; //@line 353
  HEAP32[$AsyncCtx + 4 >> 2] = $35; //@line 355
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 357
  HEAP32[$AsyncCtx + 12 >> 2] = $$02932; //@line 359
  HEAP32[$AsyncCtx + 16 >> 2] = $33; //@line 361
  HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 363
  HEAP32[$AsyncCtx + 24 >> 2] = $17; //@line 365
  HEAP32[$AsyncCtx + 28 >> 2] = $1; //@line 367
  sp = STACKTOP; //@line 368
  STACKTOP = sp; //@line 369
  return;
 }
}
function _mbed_error_vfprintf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$01213 = 0, $$014 = 0, $2 = 0, $24 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0, $$01213$looptemp = 0;
 sp = STACKTOP; //@line 1650
 STACKTOP = STACKTOP + 128 | 0; //@line 1651
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 1651
 $2 = sp; //@line 1652
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1653
 $3 = _vsnprintf($2, 128, $0, $1) | 0; //@line 1654
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 48; //@line 1657
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 1659
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 1661
  sp = STACKTOP; //@line 1662
  STACKTOP = sp; //@line 1663
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1665
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 1668
  return;
 }
 if (!(HEAP32[1024] | 0)) {
  _serial_init(4100, 2, 3); //@line 1673
  $$01213 = 0; //@line 1674
  $$014 = 0; //@line 1674
 } else {
  $$01213 = 0; //@line 1676
  $$014 = 0; //@line 1676
 }
 while (1) {
  $$01213$looptemp = $$01213;
  $$01213 = HEAP8[$2 + $$014 >> 0] | 0; //@line 1680
  if (!($$01213$looptemp << 24 >> 24 == 13 | $$01213 << 24 >> 24 != 10)) {
   $AsyncCtx7 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1685
   _serial_putc(4100, 13); //@line 1686
   if (___async) {
    label = 8; //@line 1689
    break;
   }
   _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1692
  }
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1695
  _serial_putc(4100, $$01213 << 24 >> 24); //@line 1696
  if (___async) {
   label = 11; //@line 1699
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1702
  $24 = $$014 + 1 | 0; //@line 1703
  if (($24 | 0) == ($3 | 0)) {
   label = 13; //@line 1706
   break;
  } else {
   $$014 = $24; //@line 1709
  }
 }
 if ((label | 0) == 8) {
  HEAP32[$AsyncCtx7 >> 2] = 49; //@line 1713
  HEAP8[$AsyncCtx7 + 4 >> 0] = $$01213; //@line 1715
  HEAP32[$AsyncCtx7 + 8 >> 2] = $$014; //@line 1717
  HEAP32[$AsyncCtx7 + 12 >> 2] = $3; //@line 1719
  HEAP32[$AsyncCtx7 + 16 >> 2] = $2; //@line 1721
  HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 1723
  sp = STACKTOP; //@line 1724
  STACKTOP = sp; //@line 1725
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx3 >> 2] = 50; //@line 1728
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$014; //@line 1730
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 1732
  HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 1734
  HEAP8[$AsyncCtx3 + 16 >> 0] = $$01213; //@line 1736
  HEAP32[$AsyncCtx3 + 20 >> 2] = $2; //@line 1738
  sp = STACKTOP; //@line 1739
  STACKTOP = sp; //@line 1740
  return;
 } else if ((label | 0) == 13) {
  STACKTOP = sp; //@line 1743
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_74($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1560
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1564
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1566
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 1568
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1570
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 1572
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1574
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1576
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1578
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1580
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 1583
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1585
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 1589
   $27 = $6 + 24 | 0; //@line 1590
   $28 = $4 + 8 | 0; //@line 1591
   $29 = $6 + 54 | 0; //@line 1592
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
    HEAP8[$10 >> 0] = 0; //@line 1622
    HEAP8[$14 >> 0] = 0; //@line 1623
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 1624
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 1625
    if (!___async) {
     ___async_unwind = 0; //@line 1628
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 113; //@line 1630
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 1632
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 1634
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 1636
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 1638
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 1640
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 1642
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 1644
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 1646
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 1648
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 1650
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 1652
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 1654
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 1656
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 1659
    sp = STACKTOP; //@line 1660
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 1665
 HEAP8[$14 >> 0] = $12; //@line 1666
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1444
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1448
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1450
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 1452
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1454
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 1456
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1458
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1460
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1462
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1464
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1466
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1468
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 1470
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 1473
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 1474
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
    HEAP8[$10 >> 0] = 0; //@line 1507
    HEAP8[$14 >> 0] = 0; //@line 1508
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 1509
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 1510
    if (!___async) {
     ___async_unwind = 0; //@line 1513
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 113; //@line 1515
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 1517
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 1519
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 1521
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 1523
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 1525
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 1527
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 1529
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 1531
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 1533
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 1535
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 1537
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 1539
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 1541
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 1544
    sp = STACKTOP; //@line 1545
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 1550
 HEAP8[$14 >> 0] = $12; //@line 1551
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 2257
 }
 ret = dest | 0; //@line 2260
 dest_end = dest + num | 0; //@line 2261
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 2265
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 2266
   dest = dest + 1 | 0; //@line 2267
   src = src + 1 | 0; //@line 2268
   num = num - 1 | 0; //@line 2269
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 2271
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 2272
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 2274
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 2275
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 2276
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 2277
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 2278
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 2279
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 2280
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 2281
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 2282
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 2283
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 2284
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 2285
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 2286
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 2287
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 2288
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 2289
   dest = dest + 64 | 0; //@line 2290
   src = src + 64 | 0; //@line 2291
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 2294
   dest = dest + 4 | 0; //@line 2295
   src = src + 4 | 0; //@line 2296
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 2300
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 2302
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 2303
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 2304
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 2305
   dest = dest + 4 | 0; //@line 2306
   src = src + 4 | 0; //@line 2307
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 2312
  dest = dest + 1 | 0; //@line 2313
  src = src + 1 | 0; //@line 2314
 }
 return ret | 0; //@line 2316
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 10510
 STACKTOP = STACKTOP + 64 | 0; //@line 10511
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 10511
 $3 = sp; //@line 10512
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 10515
 } else {
  if (!$1) {
   $$2 = 0; //@line 10519
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 10521
   $6 = ___dynamic_cast($1, 56, 40, 0) | 0; //@line 10522
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 104; //@line 10525
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 10527
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 10529
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 10531
    sp = STACKTOP; //@line 10532
    STACKTOP = sp; //@line 10533
    return 0; //@line 10533
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10535
   if (!$6) {
    $$2 = 0; //@line 10538
   } else {
    dest = $3 + 4 | 0; //@line 10541
    stop = dest + 52 | 0; //@line 10541
    do {
     HEAP32[dest >> 2] = 0; //@line 10541
     dest = dest + 4 | 0; //@line 10541
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 10542
    HEAP32[$3 + 8 >> 2] = $0; //@line 10544
    HEAP32[$3 + 12 >> 2] = -1; //@line 10546
    HEAP32[$3 + 48 >> 2] = 1; //@line 10548
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 10551
    $18 = HEAP32[$2 >> 2] | 0; //@line 10552
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10553
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 10554
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 105; //@line 10557
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 10559
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10561
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 10563
     sp = STACKTOP; //@line 10564
     STACKTOP = sp; //@line 10565
     return 0; //@line 10565
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10567
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 10574
     $$0 = 1; //@line 10575
    } else {
     $$0 = 0; //@line 10577
    }
    $$2 = $$0; //@line 10579
   }
  }
 }
 STACKTOP = sp; //@line 10583
 return $$2 | 0; //@line 10583
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 10275
 STACKTOP = STACKTOP + 128 | 0; //@line 10276
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 10276
 $4 = sp + 124 | 0; //@line 10277
 $5 = sp; //@line 10278
 dest = $5; //@line 10279
 src = 608; //@line 10279
 stop = dest + 124 | 0; //@line 10279
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 10279
  dest = dest + 4 | 0; //@line 10279
  src = src + 4 | 0; //@line 10279
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 10285
   $$015 = 1; //@line 10285
   label = 4; //@line 10286
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 10289
   $$0 = -1; //@line 10290
  }
 } else {
  $$014 = $0; //@line 10293
  $$015 = $1; //@line 10293
  label = 4; //@line 10294
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 10298
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 10300
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 10302
  $14 = $5 + 20 | 0; //@line 10303
  HEAP32[$14 >> 2] = $$014; //@line 10304
  HEAP32[$5 + 44 >> 2] = $$014; //@line 10306
  $16 = $$014 + $$$015 | 0; //@line 10307
  $17 = $5 + 16 | 0; //@line 10308
  HEAP32[$17 >> 2] = $16; //@line 10309
  HEAP32[$5 + 28 >> 2] = $16; //@line 10311
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 10312
  $19 = _vfprintf($5, $2, $3) | 0; //@line 10313
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 101; //@line 10316
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 10318
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 10320
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 10322
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 10324
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 10326
   sp = STACKTOP; //@line 10327
   STACKTOP = sp; //@line 10328
   return 0; //@line 10328
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 10330
  if (!$$$015) {
   $$0 = $19; //@line 10333
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 10335
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 10340
   $$0 = $19; //@line 10341
  }
 }
 STACKTOP = sp; //@line 10344
 return $$0 | 0; //@line 10344
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11744
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 11750
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 11754
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 11755
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 11756
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 11757
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 119; //@line 11760
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 11762
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 11764
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 11766
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 11768
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 11770
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 11772
    sp = STACKTOP; //@line 11773
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11776
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 11780
    $$0 = $0 + 24 | 0; //@line 11781
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 11783
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 11784
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 11789
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 11795
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 11798
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 120; //@line 11803
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 11805
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 11807
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 11809
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 11811
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 11813
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 11815
    sp = STACKTOP; //@line 11816
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
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 6264
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 6267
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 6270
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 6273
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 6279
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 6288
     $24 = $13 >>> 2; //@line 6289
     $$090 = 0; //@line 6290
     $$094 = $7; //@line 6290
     while (1) {
      $25 = $$094 >>> 1; //@line 6292
      $26 = $$090 + $25 | 0; //@line 6293
      $27 = $26 << 1; //@line 6294
      $28 = $27 + $23 | 0; //@line 6295
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 6298
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 6302
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 6308
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 6316
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 6320
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 6326
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 6331
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 6334
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 6334
      }
     }
     $46 = $27 + $24 | 0; //@line 6337
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 6340
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 6344
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 6356
     } else {
      $$4 = 0; //@line 6358
     }
    } else {
     $$4 = 0; //@line 6361
    }
   } else {
    $$4 = 0; //@line 6364
   }
  } else {
   $$4 = 0; //@line 6367
  }
 } while (0);
 return $$4 | 0; //@line 6370
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5929
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 5934
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 5939
  } else {
   $20 = $0 & 255; //@line 5941
   $21 = $0 & 255; //@line 5942
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 5948
   } else {
    $26 = $1 + 20 | 0; //@line 5950
    $27 = HEAP32[$26 >> 2] | 0; //@line 5951
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 5957
     HEAP8[$27 >> 0] = $20; //@line 5958
     $34 = $21; //@line 5959
    } else {
     label = 12; //@line 5961
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 5966
     $32 = ___overflow($1, $0) | 0; //@line 5967
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 91; //@line 5970
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 5972
      sp = STACKTOP; //@line 5973
      return 0; //@line 5974
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 5976
      $34 = $32; //@line 5977
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 5982
   $$0 = $34; //@line 5983
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 5988
   $8 = $0 & 255; //@line 5989
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 5995
    $14 = HEAP32[$13 >> 2] | 0; //@line 5996
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 6002
     HEAP8[$14 >> 0] = $7; //@line 6003
     $$0 = $8; //@line 6004
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 6008
   $19 = ___overflow($1, $0) | 0; //@line 6009
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 90; //@line 6012
    sp = STACKTOP; //@line 6013
    return 0; //@line 6014
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6016
    $$0 = $19; //@line 6017
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 6022
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6649
 $1 = $0 + 20 | 0; //@line 6650
 $3 = $0 + 28 | 0; //@line 6652
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 6658
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 6659
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 6660
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 97; //@line 6663
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 6665
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 6667
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 6669
    sp = STACKTOP; //@line 6670
    return 0; //@line 6671
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 6673
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 6677
     break;
    } else {
     label = 5; //@line 6680
     break;
    }
   }
  } else {
   label = 5; //@line 6685
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 6689
  $14 = HEAP32[$13 >> 2] | 0; //@line 6690
  $15 = $0 + 8 | 0; //@line 6691
  $16 = HEAP32[$15 >> 2] | 0; //@line 6692
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 6700
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 6701
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 6702
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 98; //@line 6705
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 6707
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 6709
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 6711
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 6713
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 6715
     sp = STACKTOP; //@line 6716
     return 0; //@line 6717
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6719
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 6725
  HEAP32[$3 >> 2] = 0; //@line 6726
  HEAP32[$1 >> 2] = 0; //@line 6727
  HEAP32[$15 >> 2] = 0; //@line 6728
  HEAP32[$13 >> 2] = 0; //@line 6729
  $$0 = 0; //@line 6730
 }
 return $$0 | 0; //@line 6732
}
function __ZN16SX1276_LoRaRadio8rx_frameEPhjjhh($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $12 = 0, $15 = 0, $6 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer4 = 0, $vararg_buffer8 = 0, sp = 0;
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
 _mbed_tracef(16, 875, 880, $vararg_buffer); //@line 83
 $9 = HEAP32[$0 + 752 >> 2] | 0; //@line 85
 if (($9 | 0) != ($6 | 0)) {
  HEAP32[$vararg_buffer4 >> 2] = $9; //@line 88
  HEAP32[$vararg_buffer4 + 4 >> 2] = $6; //@line 90
  _mbed_tracef(16, 875, 921, $vararg_buffer4); //@line 91
  STACKTOP = sp; //@line 92
  return;
 }
 $12 = HEAP32[$0 + 756 >> 2] | 0; //@line 95
 if (($12 | 0) != ($7 | 0)) {
  HEAP32[$vararg_buffer8 >> 2] = $12; //@line 98
  HEAP32[$vararg_buffer8 + 4 >> 2] = $7; //@line 100
  _mbed_tracef(16, 875, 968, $vararg_buffer8); //@line 101
  STACKTOP = sp; //@line 102
  return;
 }
 $15 = HEAP32[$0 + 692 >> 2] | 0; //@line 105
 if (($15 | 0) == ($3 | 0)) {
  _memcpy($0 + 792 | 0, $1 | 0, $2 | 0) | 0; //@line 109
  HEAP8[$0 + 782 >> 0] = $2; //@line 112
  HEAP8[$0 + 781 >> 0] = -35; //@line 114
  HEAP8[$0 + 780 >> 0] = -5; //@line 116
  HEAP8[$0 + 783 >> 0] = 1; //@line 118
  HEAP32[$0 + 784 >> 2] = _emscripten_asm_const_i(0) | 0; //@line 121
  STACKTOP = sp; //@line 122
  return;
 } else {
  HEAP32[$vararg_buffer12 >> 2] = $15; //@line 124
  HEAP32[$vararg_buffer12 + 4 >> 2] = $3; //@line 126
  _mbed_tracef(16, 875, 1015, $vararg_buffer12); //@line 127
  STACKTOP = sp; //@line 128
  return;
 }
}
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 6413
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 6419
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 6425
   } else {
    $7 = $1 & 255; //@line 6427
    $$03039 = $0; //@line 6428
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 6430
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 6435
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 6438
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 6443
      break;
     } else {
      $$03039 = $13; //@line 6446
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 6450
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 6451
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 6459
     $25 = $18; //@line 6459
     while (1) {
      $24 = $25 ^ $17; //@line 6461
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 6468
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 6471
      $25 = HEAP32[$31 >> 2] | 0; //@line 6472
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 6481
       break;
      } else {
       $$02936 = $31; //@line 6479
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 6486
    }
   } while (0);
   $38 = $1 & 255; //@line 6489
   $$1 = $$029$lcssa; //@line 6490
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 6492
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 6498
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 6501
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 6506
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 6155
 $4 = HEAP32[$3 >> 2] | 0; //@line 6156
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 6163
   label = 5; //@line 6164
  } else {
   $$1 = 0; //@line 6166
  }
 } else {
  $12 = $4; //@line 6170
  label = 5; //@line 6171
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 6175
   $10 = HEAP32[$9 >> 2] | 0; //@line 6176
   $14 = $10; //@line 6179
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 6184
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 6192
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 6196
       $$141 = $0; //@line 6196
       $$143 = $1; //@line 6196
       $31 = $14; //@line 6196
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 6199
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 6206
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 6211
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 6214
      break L5;
     }
     $$139 = $$038; //@line 6220
     $$141 = $0 + $$038 | 0; //@line 6220
     $$143 = $1 - $$038 | 0; //@line 6220
     $31 = HEAP32[$9 >> 2] | 0; //@line 6220
    } else {
     $$139 = 0; //@line 6222
     $$141 = $0; //@line 6222
     $$143 = $1; //@line 6222
     $31 = $14; //@line 6222
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 6225
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 6228
   $$1 = $$139 + $$143 | 0; //@line 6230
  }
 } while (0);
 return $$1 | 0; //@line 6233
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_67($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 769
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 773
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 775
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 777
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 779
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 781
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 783
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 785
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 788
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 789
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 805
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 806
    if (!___async) {
     ___async_unwind = 0; //@line 809
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 117; //@line 811
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 813
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 815
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 817
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 819
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 821
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 823
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 825
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 827
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 830
    sp = STACKTOP; //@line 831
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
 sp = STACKTOP; //@line 6041
 STACKTOP = STACKTOP + 16 | 0; //@line 6042
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 6042
 $2 = sp; //@line 6043
 $3 = $1 & 255; //@line 6044
 HEAP8[$2 >> 0] = $3; //@line 6045
 $4 = $0 + 16 | 0; //@line 6046
 $5 = HEAP32[$4 >> 2] | 0; //@line 6047
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 6054
   label = 4; //@line 6055
  } else {
   $$0 = -1; //@line 6057
  }
 } else {
  $12 = $5; //@line 6060
  label = 4; //@line 6061
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 6065
   $10 = HEAP32[$9 >> 2] | 0; //@line 6066
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 6069
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 6076
     HEAP8[$10 >> 0] = $3; //@line 6077
     $$0 = $13; //@line 6078
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 6083
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 6084
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 6085
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 92; //@line 6088
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 6090
    sp = STACKTOP; //@line 6091
    STACKTOP = sp; //@line 6092
    return 0; //@line 6092
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 6094
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 6099
   } else {
    $$0 = -1; //@line 6101
   }
  }
 } while (0);
 STACKTOP = sp; //@line 6105
 return $$0 | 0; //@line 6105
}
function __ZN4mbed6BusOutD2Ev($0) {
 $0 = $0 | 0;
 var $11 = 0, $14 = 0, $17 = 0, $2 = 0, $20 = 0, $23 = 0, $26 = 0, $29 = 0, $32 = 0, $35 = 0, $38 = 0, $41 = 0, $44 = 0, $47 = 0, $5 = 0, $8 = 0;
 HEAP32[$0 >> 2] = 152; //@line 137
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 139
 if ($2 | 0) {
  __ZdlPv($2); //@line 142
 }
 $5 = HEAP32[$0 + 8 >> 2] | 0; //@line 145
 if ($5 | 0) {
  __ZdlPv($5); //@line 148
 }
 $8 = HEAP32[$0 + 12 >> 2] | 0; //@line 151
 if ($8 | 0) {
  __ZdlPv($8); //@line 154
 }
 $11 = HEAP32[$0 + 16 >> 2] | 0; //@line 157
 if ($11 | 0) {
  __ZdlPv($11); //@line 160
 }
 $14 = HEAP32[$0 + 20 >> 2] | 0; //@line 163
 if ($14 | 0) {
  __ZdlPv($14); //@line 166
 }
 $17 = HEAP32[$0 + 24 >> 2] | 0; //@line 169
 if ($17 | 0) {
  __ZdlPv($17); //@line 172
 }
 $20 = HEAP32[$0 + 28 >> 2] | 0; //@line 175
 if ($20 | 0) {
  __ZdlPv($20); //@line 178
 }
 $23 = HEAP32[$0 + 32 >> 2] | 0; //@line 181
 if ($23 | 0) {
  __ZdlPv($23); //@line 184
 }
 $26 = HEAP32[$0 + 36 >> 2] | 0; //@line 187
 if ($26 | 0) {
  __ZdlPv($26); //@line 190
 }
 $29 = HEAP32[$0 + 40 >> 2] | 0; //@line 193
 if ($29 | 0) {
  __ZdlPv($29); //@line 196
 }
 $32 = HEAP32[$0 + 44 >> 2] | 0; //@line 199
 if ($32 | 0) {
  __ZdlPv($32); //@line 202
 }
 $35 = HEAP32[$0 + 48 >> 2] | 0; //@line 205
 if ($35 | 0) {
  __ZdlPv($35); //@line 208
 }
 $38 = HEAP32[$0 + 52 >> 2] | 0; //@line 211
 if ($38 | 0) {
  __ZdlPv($38); //@line 214
 }
 $41 = HEAP32[$0 + 56 >> 2] | 0; //@line 217
 if ($41 | 0) {
  __ZdlPv($41); //@line 220
 }
 $44 = HEAP32[$0 + 60 >> 2] | 0; //@line 223
 if ($44 | 0) {
  __ZdlPv($44); //@line 226
 }
 $47 = HEAP32[$0 + 64 >> 2] | 0; //@line 229
 if (!$47) {
  return;
 }
 __ZdlPv($47); //@line 234
 return;
}
function _fflush__async_cb_49($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13038
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13040
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 13042
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 13046
  } else {
   $$02327 = $$02325; //@line 13048
   $$02426 = $AsyncRetVal; //@line 13048
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 13055
    } else {
     $16 = 0; //@line 13057
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 13069
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 13072
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 13075
     break L3;
    } else {
     $$02327 = $$023; //@line 13078
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 13081
   $13 = ___fflush_unlocked($$02327) | 0; //@line 13082
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 13086
    ___async_unwind = 0; //@line 13087
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 96; //@line 13089
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 13091
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 13093
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 13095
   sp = STACKTOP; //@line 13096
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 13100
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 13102
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 2321
 value = value & 255; //@line 2323
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 2326
   ptr = ptr + 1 | 0; //@line 2327
  }
  aligned_end = end & -4 | 0; //@line 2330
  block_aligned_end = aligned_end - 64 | 0; //@line 2331
  value4 = value | value << 8 | value << 16 | value << 24; //@line 2332
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 2335
   HEAP32[ptr + 4 >> 2] = value4; //@line 2336
   HEAP32[ptr + 8 >> 2] = value4; //@line 2337
   HEAP32[ptr + 12 >> 2] = value4; //@line 2338
   HEAP32[ptr + 16 >> 2] = value4; //@line 2339
   HEAP32[ptr + 20 >> 2] = value4; //@line 2340
   HEAP32[ptr + 24 >> 2] = value4; //@line 2341
   HEAP32[ptr + 28 >> 2] = value4; //@line 2342
   HEAP32[ptr + 32 >> 2] = value4; //@line 2343
   HEAP32[ptr + 36 >> 2] = value4; //@line 2344
   HEAP32[ptr + 40 >> 2] = value4; //@line 2345
   HEAP32[ptr + 44 >> 2] = value4; //@line 2346
   HEAP32[ptr + 48 >> 2] = value4; //@line 2347
   HEAP32[ptr + 52 >> 2] = value4; //@line 2348
   HEAP32[ptr + 56 >> 2] = value4; //@line 2349
   HEAP32[ptr + 60 >> 2] = value4; //@line 2350
   ptr = ptr + 64 | 0; //@line 2351
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 2355
   ptr = ptr + 4 | 0; //@line 2356
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 2361
  ptr = ptr + 1 | 0; //@line 2362
 }
 return end - num | 0; //@line 2364
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12939
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 12949
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 12949
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 12949
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 12953
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 12956
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 12959
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 12967
  } else {
   $20 = 0; //@line 12969
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 12979
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 12983
  HEAP32[___async_retval >> 2] = $$1; //@line 12985
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 12988
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 12989
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 12993
  ___async_unwind = 0; //@line 12994
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 96; //@line 12996
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 12998
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 13000
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 13002
 sp = STACKTOP; //@line 13003
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 706
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 710
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 712
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 714
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 716
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 718
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 720
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 723
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 724
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 733
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 734
    if (!___async) {
     ___async_unwind = 0; //@line 737
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 118; //@line 739
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 741
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 743
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 745
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 747
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 749
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 751
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 753
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 756
    sp = STACKTOP; //@line 757
    return;
   }
  }
 }
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 185
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 187
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 189
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 191
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 196
  } else {
   $9 = $4 + 4 | 0; //@line 198
   $10 = HEAP32[$9 >> 2] | 0; //@line 199
   $11 = $4 + 8 | 0; //@line 200
   $12 = HEAP32[$11 >> 2] | 0; //@line 201
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 205
    HEAP32[$6 >> 2] = 0; //@line 206
    HEAP32[$2 >> 2] = 0; //@line 207
    HEAP32[$11 >> 2] = 0; //@line 208
    HEAP32[$9 >> 2] = 0; //@line 209
    $$0 = 0; //@line 210
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 217
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 218
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 219
   if (!___async) {
    ___async_unwind = 0; //@line 222
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 98; //@line 224
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 226
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 228
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 230
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 232
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 234
   sp = STACKTOP; //@line 235
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 240
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 9421
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 9426
    $$0 = 1; //@line 9427
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 9440
     $$0 = 1; //@line 9441
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 9445
     $$0 = -1; //@line 9446
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 9456
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 9460
    $$0 = 2; //@line 9461
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 9473
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 9479
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 9483
    $$0 = 3; //@line 9484
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 9494
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 9500
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 9506
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 9510
    $$0 = 4; //@line 9511
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 9515
    $$0 = -1; //@line 9516
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 9521
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_75($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 1810
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1812
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1814
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1816
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1818
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 1823
  return;
 }
 dest = $2 + 4 | 0; //@line 1827
 stop = dest + 52 | 0; //@line 1827
 do {
  HEAP32[dest >> 2] = 0; //@line 1827
  dest = dest + 4 | 0; //@line 1827
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 1828
 HEAP32[$2 + 8 >> 2] = $4; //@line 1830
 HEAP32[$2 + 12 >> 2] = -1; //@line 1832
 HEAP32[$2 + 48 >> 2] = 1; //@line 1834
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 1837
 $16 = HEAP32[$6 >> 2] | 0; //@line 1838
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 1839
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 1840
 if (!___async) {
  ___async_unwind = 0; //@line 1843
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 105; //@line 1845
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 1847
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 1849
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 1851
 sp = STACKTOP; //@line 1852
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_68($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 842
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 846
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 848
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 850
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 852
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 854
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 857
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 858
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 864
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 865
   if (!___async) {
    ___async_unwind = 0; //@line 868
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 116; //@line 870
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 872
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 874
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 876
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 878
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 880
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 882
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 885
   sp = STACKTOP; //@line 886
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
  $$0914 = $2; //@line 8305
  $8 = $0; //@line 8305
  $9 = $1; //@line 8305
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 8307
   $$0914 = $$0914 + -1 | 0; //@line 8311
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 8312
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 8313
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 8321
   }
  }
  $$010$lcssa$off0 = $8; //@line 8326
  $$09$lcssa = $$0914; //@line 8326
 } else {
  $$010$lcssa$off0 = $0; //@line 8328
  $$09$lcssa = $2; //@line 8328
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 8332
 } else {
  $$012 = $$010$lcssa$off0; //@line 8334
  $$111 = $$09$lcssa; //@line 8334
  while (1) {
   $26 = $$111 + -1 | 0; //@line 8339
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 8340
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 8344
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 8347
    $$111 = $26; //@line 8347
   }
  }
 }
 return $$1$lcssa | 0; //@line 8351
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1261
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1263
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1267
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1269
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1271
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1273
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 1277
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 1280
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 1281
   if (!___async) {
    ___async_unwind = 0; //@line 1284
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 120; //@line 1286
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 1288
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 1290
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 1292
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 1294
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 1296
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 1298
   sp = STACKTOP; //@line 1299
   return;
  }
 }
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 5807
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 5812
   label = 4; //@line 5813
  } else {
   $$01519 = $0; //@line 5815
   $23 = $1; //@line 5815
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 5820
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 5823
    $23 = $6; //@line 5824
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 5828
     label = 4; //@line 5829
     break;
    } else {
     $$01519 = $6; //@line 5832
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 5838
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 5840
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 5848
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 5856
  } else {
   $$pn = $$0; //@line 5858
   while (1) {
    $19 = $$pn + 1 | 0; //@line 5860
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 5864
     break;
    } else {
     $$pn = $19; //@line 5867
    }
   }
  }
  $$sink = $$1$lcssa; //@line 5872
 }
 return $$sink - $1 | 0; //@line 5875
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 10757
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 10764
   $10 = $1 + 16 | 0; //@line 10765
   $11 = HEAP32[$10 >> 2] | 0; //@line 10766
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 10769
    HEAP32[$1 + 24 >> 2] = $4; //@line 10771
    HEAP32[$1 + 36 >> 2] = 1; //@line 10773
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 10783
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 10788
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 10791
    HEAP8[$1 + 54 >> 0] = 1; //@line 10793
    break;
   }
   $21 = $1 + 24 | 0; //@line 10796
   $22 = HEAP32[$21 >> 2] | 0; //@line 10797
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 10800
    $28 = $4; //@line 10801
   } else {
    $28 = $22; //@line 10803
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 10812
   }
  }
 } while (0);
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10370
 $1 = HEAP32[58] | 0; //@line 10371
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 10377
 } else {
  $19 = 0; //@line 10379
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 10385
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 10391
    $12 = HEAP32[$11 >> 2] | 0; //@line 10392
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 10398
     HEAP8[$12 >> 0] = 10; //@line 10399
     $22 = 0; //@line 10400
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 10404
   $17 = ___overflow($1, 10) | 0; //@line 10405
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 102; //@line 10408
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 10410
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 10412
    sp = STACKTOP; //@line 10413
    return 0; //@line 10414
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10416
    $22 = $17 >> 31; //@line 10418
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 10425
 }
 return $22 | 0; //@line 10427
}
function _mbed_vtracef__async_cb_54($0) {
 $0 = $0 | 0;
 var $$18 = 0, $10 = 0, $12 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 13858
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13860
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13862
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13864
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 13869
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13871
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 13876
 $16 = _snprintf($4, $6, 1145, $2) | 0; //@line 13877
 $$18 = ($16 | 0) >= ($6 | 0) ? 0 : $16; //@line 13879
 $19 = $4 + $$18 | 0; //@line 13881
 $20 = $6 - $$18 | 0; //@line 13882
 if (($$18 | 0) > 0) {
  if (!(($$18 | 0) < 1 | ($20 | 0) < 1 | $10 ^ 1)) {
   _snprintf($19, $20, 1223, $12) | 0; //@line 13890
  }
 }
 $23 = HEAP32[53] | 0; //@line 13893
 $24 = HEAP32[46] | 0; //@line 13894
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 13895
 FUNCTION_TABLE_vi[$23 & 127]($24); //@line 13896
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 27; //@line 13899
  sp = STACKTOP; //@line 13900
  return;
 }
 ___async_unwind = 0; //@line 13903
 HEAP32[$ReallocAsyncCtx7 >> 2] = 27; //@line 13904
 sp = STACKTOP; //@line 13905
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_71($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1309
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1315
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1317
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1319
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1321
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 1326
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 1328
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 1329
 if (!___async) {
  ___async_unwind = 0; //@line 1332
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 120; //@line 1334
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 1336
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 1338
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 1340
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 1342
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 1344
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 1346
 sp = STACKTOP; //@line 1347
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10616
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 10625
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 10630
      HEAP32[$13 >> 2] = $2; //@line 10631
      $19 = $1 + 40 | 0; //@line 10632
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 10635
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 10645
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 10649
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 10656
    }
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1381
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1383
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1385
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1389
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 1393
  label = 4; //@line 1394
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 1399
   label = 4; //@line 1400
  } else {
   $$037$off039 = 3; //@line 1402
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 1406
  $17 = $8 + 40 | 0; //@line 1407
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 1410
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 1420
    $$037$off039 = $$037$off038; //@line 1421
   } else {
    $$037$off039 = $$037$off038; //@line 1423
   }
  } else {
   $$037$off039 = $$037$off038; //@line 1426
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 1429
 return;
}
function ___strerror_l($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $7 = 0, label = 0, $$113$looptemp = 0;
 $$016 = 0; //@line 9541
 while (1) {
  if ((HEAPU8[1974 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 9548
   break;
  }
  $7 = $$016 + 1 | 0; //@line 9551
  if (($7 | 0) == 87) {
   $$01214 = 2062; //@line 9554
   $$115 = 87; //@line 9554
   label = 5; //@line 9555
   break;
  } else {
   $$016 = $7; //@line 9558
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 2062; //@line 9564
  } else {
   $$01214 = 2062; //@line 9566
   $$115 = $$016; //@line 9566
   label = 5; //@line 9567
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 9572
   $$113 = $$01214; //@line 9573
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 9577
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 9584
   if (!$$115) {
    $$012$lcssa = $$113; //@line 9587
    break;
   } else {
    $$01214 = $$113; //@line 9590
    label = 5; //@line 9591
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 9598
}
function _strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $2 = 0, $5 = 0;
 $2 = HEAP8[$1 >> 0] | 0; //@line 9614
 do {
  if (!($2 << 24 >> 24)) {
   $$0 = $0; //@line 9618
  } else {
   $5 = _strchr($0, $2 << 24 >> 24) | 0; //@line 9621
   if (!$5) {
    $$0 = 0; //@line 9624
   } else {
    if (!(HEAP8[$1 + 1 >> 0] | 0)) {
     $$0 = $5; //@line 9630
    } else {
     if (!(HEAP8[$5 + 1 >> 0] | 0)) {
      $$0 = 0; //@line 9636
     } else {
      if (!(HEAP8[$1 + 2 >> 0] | 0)) {
       $$0 = _twobyte_strstr($5, $1) | 0; //@line 9643
       break;
      }
      if (!(HEAP8[$5 + 2 >> 0] | 0)) {
       $$0 = 0; //@line 9650
      } else {
       if (!(HEAP8[$1 + 3 >> 0] | 0)) {
        $$0 = _threebyte_strstr($5, $1) | 0; //@line 9657
        break;
       }
       if (!(HEAP8[$5 + 3 >> 0] | 0)) {
        $$0 = 0; //@line 9664
       } else {
        if (!(HEAP8[$1 + 4 >> 0] | 0)) {
         $$0 = _fourbyte_strstr($5, $1) | 0; //@line 9671
         break;
        } else {
         $$0 = _twoway_strstr($5, $1) | 0; //@line 9675
         break;
        }
       }
      }
     }
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 9685
}
function _mbed_vtracef__async_cb_60($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 14243
 $3 = HEAP32[54] | 0; //@line 14247
 if (HEAP8[$0 + 4 >> 0] & 1 & ($3 | 0) != 0) {
  $5 = HEAP32[46] | 0; //@line 14251
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 14252
  FUNCTION_TABLE_vi[$3 & 127]($5); //@line 14253
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 20; //@line 14256
   sp = STACKTOP; //@line 14257
   return;
  }
  ___async_unwind = 0; //@line 14260
  HEAP32[$ReallocAsyncCtx2 >> 2] = 20; //@line 14261
  sp = STACKTOP; //@line 14262
  return;
 } else {
  $6 = HEAP32[53] | 0; //@line 14265
  $7 = HEAP32[46] | 0; //@line 14266
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 14267
  FUNCTION_TABLE_vi[$6 & 127]($7); //@line 14268
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 22; //@line 14271
   sp = STACKTOP; //@line 14272
   return;
  }
  ___async_unwind = 0; //@line 14275
  HEAP32[$ReallocAsyncCtx4 >> 2] = 22; //@line 14276
  sp = STACKTOP; //@line 14277
  return;
 }
}
function _fourbyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$lcssa = 0, $$sink21$lcssa = 0, $$sink2123 = 0, $18 = 0, $32 = 0, $33 = 0, $35 = 0, $39 = 0, $40 = 0, $41 = 0;
 $18 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8 | (HEAPU8[$1 + 3 >> 0] | 0); //@line 9810
 $32 = $0 + 3 | 0; //@line 9824
 $33 = HEAP8[$32 >> 0] | 0; //@line 9825
 $35 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | (HEAPU8[$0 + 2 >> 0] | 0) << 8 | $33 & 255; //@line 9827
 if ($33 << 24 >> 24 == 0 | ($35 | 0) == ($18 | 0)) {
  $$lcssa = $33; //@line 9832
  $$sink21$lcssa = $32; //@line 9832
 } else {
  $$sink2123 = $32; //@line 9834
  $39 = $35; //@line 9834
  while (1) {
   $40 = $$sink2123 + 1 | 0; //@line 9837
   $41 = HEAP8[$40 >> 0] | 0; //@line 9838
   $39 = $39 << 8 | $41 & 255; //@line 9840
   if ($41 << 24 >> 24 == 0 | ($39 | 0) == ($18 | 0)) {
    $$lcssa = $41; //@line 9845
    $$sink21$lcssa = $40; //@line 9845
    break;
   } else {
    $$sink2123 = $40; //@line 9848
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$sink21$lcssa + -3 | 0 : 0) | 0; //@line 9855
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1824
 $2 = $0 + 12 | 0; //@line 1826
 $3 = HEAP32[$2 >> 2] | 0; //@line 1827
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1831
   _mbed_assert_internal(1351, 1356, 528); //@line 1832
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 53; //@line 1835
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 1837
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1839
    sp = STACKTOP; //@line 1840
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1843
    $8 = HEAP32[$2 >> 2] | 0; //@line 1845
    break;
   }
  } else {
   $8 = $3; //@line 1849
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 1852
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1854
 FUNCTION_TABLE_vi[$7 & 127]($0); //@line 1855
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 54; //@line 1858
  sp = STACKTOP; //@line 1859
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1862
  return;
 }
}
function _threebyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$016$lcssa = 0, $$01618 = 0, $$019 = 0, $$lcssa = 0, $14 = 0, $23 = 0, $24 = 0, $27 = 0, $30 = 0, $31 = 0;
 $14 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8; //@line 9744
 $23 = $0 + 2 | 0; //@line 9753
 $24 = HEAP8[$23 >> 0] | 0; //@line 9754
 $27 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | ($24 & 255) << 8; //@line 9757
 if (($27 | 0) == ($14 | 0) | $24 << 24 >> 24 == 0) {
  $$016$lcssa = $23; //@line 9762
  $$lcssa = $24; //@line 9762
 } else {
  $$01618 = $23; //@line 9764
  $$019 = $27; //@line 9764
  while (1) {
   $30 = $$01618 + 1 | 0; //@line 9766
   $31 = HEAP8[$30 >> 0] | 0; //@line 9767
   $$019 = ($$019 | $31 & 255) << 8; //@line 9770
   if (($$019 | 0) == ($14 | 0) | $31 << 24 >> 24 == 0) {
    $$016$lcssa = $30; //@line 9775
    $$lcssa = $31; //@line 9775
    break;
   } else {
    $$01618 = $30; //@line 9778
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$016$lcssa + -2 | 0 : 0) | 0; //@line 9785
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11963
 STACKTOP = STACKTOP + 16 | 0; //@line 11964
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11964
 $3 = sp; //@line 11965
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 11967
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 11970
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 11971
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 11972
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 124; //@line 11975
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 11977
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 11979
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 11981
  sp = STACKTOP; //@line 11982
  STACKTOP = sp; //@line 11983
  return 0; //@line 11983
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 11985
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 11989
 }
 STACKTOP = sp; //@line 11991
 return $8 & 1 | 0; //@line 11991
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 9372
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 9372
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 9373
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 9374
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 9383
    $$016 = $9; //@line 9386
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 9386
   } else {
    $$016 = $0; //@line 9388
    $storemerge = 0; //@line 9388
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 9390
   $$0 = $$016; //@line 9391
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 9395
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 9401
   HEAP32[tempDoublePtr >> 2] = $2; //@line 9404
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 9404
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 9405
  }
 }
 return +$$0;
}
function _mbed_vtracef__async_cb_57($0) {
 $0 = $0 | 0;
 var $$pre = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 13974
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13978
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 2) {
  return;
 }
 $5 = $4 + -1 | 0; //@line 13983
 $$pre = HEAP32[56] | 0; //@line 13984
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 13985
 FUNCTION_TABLE_v[$$pre & 0](); //@line 13986
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 29; //@line 13989
  $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 13990
  HEAP32[$6 >> 2] = $4; //@line 13991
  $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 13992
  HEAP32[$7 >> 2] = $5; //@line 13993
  sp = STACKTOP; //@line 13994
  return;
 }
 ___async_unwind = 0; //@line 13997
 HEAP32[$ReallocAsyncCtx9 >> 2] = 29; //@line 13998
 $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 13999
 HEAP32[$6 >> 2] = $4; //@line 14000
 $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 14001
 HEAP32[$7 >> 2] = $5; //@line 14002
 sp = STACKTOP; //@line 14003
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
 sp = STACKTOP; //@line 10972
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10978
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 10981
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10984
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10985
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 10986
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 108; //@line 10989
    sp = STACKTOP; //@line 10990
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10993
    break;
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_56($0) {
 $0 = $0 | 0;
 var $$pre = 0, $2 = 0, $4 = 0, $5 = 0, $6 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 13941
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13943
 if (($2 | 0) <= 1) {
  return;
 }
 $4 = $2 + -1 | 0; //@line 13948
 $$pre = HEAP32[56] | 0; //@line 13949
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 13950
 FUNCTION_TABLE_v[$$pre & 0](); //@line 13951
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 29; //@line 13954
  $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 13955
  HEAP32[$5 >> 2] = $2; //@line 13956
  $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 13957
  HEAP32[$6 >> 2] = $4; //@line 13958
  sp = STACKTOP; //@line 13959
  return;
 }
 ___async_unwind = 0; //@line 13962
 HEAP32[$ReallocAsyncCtx9 >> 2] = 29; //@line 13963
 $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 13964
 HEAP32[$5 >> 2] = $2; //@line 13965
 $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 13966
 HEAP32[$6 >> 2] = $4; //@line 13967
 sp = STACKTOP; //@line 13968
 return;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 423
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 431
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 433
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 435
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 437
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 439
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 441
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 443
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 454
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 455
 HEAP32[$10 >> 2] = 0; //@line 456
 HEAP32[$12 >> 2] = 0; //@line 457
 HEAP32[$14 >> 2] = 0; //@line 458
 HEAP32[$2 >> 2] = 0; //@line 459
 $33 = HEAP32[$16 >> 2] | 0; //@line 460
 HEAP32[$16 >> 2] = $33 | $18; //@line 465
 if ($20 | 0) {
  ___unlockfile($22); //@line 468
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 471
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
 sp = STACKTOP; //@line 11873
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 11875
 $8 = $7 >> 8; //@line 11876
 if (!($7 & 1)) {
  $$0 = $8; //@line 11880
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 11885
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 11887
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 11890
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11895
 FUNCTION_TABLE_viiiiii[$17 & 3]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 11896
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 122; //@line 11899
  sp = STACKTOP; //@line 11900
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11903
  return;
 }
}
function __Znwj($0) {
 $0 = $0 | 0;
 var $$ = 0, $$lcssa = 0, $2 = 0, $4 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10432
 $$ = ($0 | 0) == 0 ? 1 : $0; //@line 10434
 while (1) {
  $2 = _malloc($$) | 0; //@line 10436
  if ($2 | 0) {
   $$lcssa = $2; //@line 10439
   label = 7; //@line 10440
   break;
  }
  $4 = __ZSt15get_new_handlerv() | 0; //@line 10443
  if (!$4) {
   $$lcssa = 0; //@line 10446
   label = 7; //@line 10447
   break;
  }
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 10450
  FUNCTION_TABLE_v[$4 & 0](); //@line 10451
  if (___async) {
   label = 5; //@line 10454
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 10457
 }
 if ((label | 0) == 5) {
  HEAP32[$AsyncCtx >> 2] = 103; //@line 10460
  HEAP32[$AsyncCtx + 4 >> 2] = $$; //@line 10462
  sp = STACKTOP; //@line 10463
  return 0; //@line 10464
 } else if ((label | 0) == 7) {
  return $$lcssa | 0; //@line 10467
 }
 return 0; //@line 10469
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11141
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 11147
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 11150
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 11153
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11154
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 11155
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 111; //@line 11158
    sp = STACKTOP; //@line 11159
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 11162
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
 sp = STACKTOP; //@line 11915
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 11917
 $7 = $6 >> 8; //@line 11918
 if (!($6 & 1)) {
  $$0 = $7; //@line 11922
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 11927
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 11929
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 11932
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11937
 FUNCTION_TABLE_viiiii[$16 & 3]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 11938
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 123; //@line 11941
  sp = STACKTOP; //@line 11942
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11945
  return;
 }
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11830
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 11832
 $6 = $5 >> 8; //@line 11833
 if (!($5 & 1)) {
  $$0 = $6; //@line 11837
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 11842
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 11844
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 11847
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11852
 FUNCTION_TABLE_viiii[$15 & 3]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 11853
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 121; //@line 11856
  sp = STACKTOP; //@line 11857
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11860
  return;
 }
}
function ___dynamic_cast__async_cb_63($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 328
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 330
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 332
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 338
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 353
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 369
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 374
    break;
   }
  default:
   {
    $$0 = 0; //@line 378
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 383
 return;
}
function _mbed_error_vfprintf__async_cb_66($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 670
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 672
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 674
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 676
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 678
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 680
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 682
 _serial_putc(4100, $2 << 24 >> 24); //@line 683
 if (!___async) {
  ___async_unwind = 0; //@line 686
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 50; //@line 688
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 690
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 692
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $8; //@line 694
 HEAP8[$ReallocAsyncCtx2 + 16 >> 0] = $2; //@line 696
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 698
 sp = STACKTOP; //@line 699
 return;
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 8370
 STACKTOP = STACKTOP + 256 | 0; //@line 8371
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 8371
 $5 = sp; //@line 8372
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 8378
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 8382
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 8385
   $$011 = $9; //@line 8386
   do {
    _out_670($0, $5, 256); //@line 8388
    $$011 = $$011 + -256 | 0; //@line 8389
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 8398
  } else {
   $$0$lcssa = $9; //@line 8400
  }
  _out_670($0, $5, $$0$lcssa); //@line 8402
 }
 STACKTOP = sp; //@line 8404
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5665
 STACKTOP = STACKTOP + 32 | 0; //@line 5666
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 5666
 $vararg_buffer = sp; //@line 5667
 $3 = sp + 20 | 0; //@line 5668
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 5672
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 5674
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 5676
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 5678
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 5680
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 5685
  $10 = -1; //@line 5686
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 5689
 }
 STACKTOP = sp; //@line 5691
 return $10 | 0; //@line 5691
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 1299
 STACKTOP = STACKTOP + 16 | 0; //@line 1300
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1300
 $vararg_buffer = sp; //@line 1301
 HEAP32[$vararg_buffer >> 2] = $0; //@line 1302
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 1304
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 1306
 _mbed_error_printf(1228, $vararg_buffer); //@line 1307
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1308
 _mbed_die(); //@line 1309
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 30; //@line 1312
  sp = STACKTOP; //@line 1313
  STACKTOP = sp; //@line 1314
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1316
  STACKTOP = sp; //@line 1317
  return;
 }
}
function _snprintf($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10249
 STACKTOP = STACKTOP + 16 | 0; //@line 10250
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10250
 $3 = sp; //@line 10251
 HEAP32[$3 >> 2] = $varargs; //@line 10252
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 10253
 $4 = _vsnprintf($0, $1, $2, $3) | 0; //@line 10254
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 100; //@line 10257
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 10259
  sp = STACKTOP; //@line 10260
  STACKTOP = sp; //@line 10261
  return 0; //@line 10261
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 10263
  STACKTOP = sp; //@line 10264
  return $4 | 0; //@line 10264
 }
 return 0; //@line 10266
}
function _mbed_vtracef__async_cb_55($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 13911
 HEAP32[50] = HEAP32[48]; //@line 13913
 $2 = HEAP32[56] | 0; //@line 13914
 if (!$2) {
  return;
 }
 $4 = HEAP32[57] | 0; //@line 13919
 HEAP32[57] = 0; //@line 13920
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 13921
 FUNCTION_TABLE_v[$2 & 0](); //@line 13922
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 28; //@line 13925
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 13926
  HEAP32[$5 >> 2] = $4; //@line 13927
  sp = STACKTOP; //@line 13928
  return;
 }
 ___async_unwind = 0; //@line 13931
 HEAP32[$ReallocAsyncCtx8 >> 2] = 28; //@line 13932
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 13933
 HEAP32[$5 >> 2] = $4; //@line 13934
 sp = STACKTOP; //@line 13935
 return;
}
function _mbed_vtracef__async_cb_52($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 13647
 HEAP32[50] = HEAP32[48]; //@line 13649
 $2 = HEAP32[56] | 0; //@line 13650
 if (!$2) {
  return;
 }
 $4 = HEAP32[57] | 0; //@line 13655
 HEAP32[57] = 0; //@line 13656
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 13657
 FUNCTION_TABLE_v[$2 & 0](); //@line 13658
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 28; //@line 13661
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 13662
  HEAP32[$5 >> 2] = $4; //@line 13663
  sp = STACKTOP; //@line 13664
  return;
 }
 ___async_unwind = 0; //@line 13667
 HEAP32[$ReallocAsyncCtx8 >> 2] = 28; //@line 13668
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 13669
 HEAP32[$5 >> 2] = $4; //@line 13670
 sp = STACKTOP; //@line 13671
 return;
}
function _mbed_vtracef__async_cb_51($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 13617
 HEAP32[50] = HEAP32[48]; //@line 13619
 $2 = HEAP32[56] | 0; //@line 13620
 if (!$2) {
  return;
 }
 $4 = HEAP32[57] | 0; //@line 13625
 HEAP32[57] = 0; //@line 13626
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 13627
 FUNCTION_TABLE_v[$2 & 0](); //@line 13628
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 28; //@line 13631
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 13632
  HEAP32[$5 >> 2] = $4; //@line 13633
  sp = STACKTOP; //@line 13634
  return;
 }
 ___async_unwind = 0; //@line 13637
 HEAP32[$ReallocAsyncCtx8 >> 2] = 28; //@line 13638
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 13639
 HEAP32[$5 >> 2] = $4; //@line 13640
 sp = STACKTOP; //@line 13641
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 10694
 $5 = HEAP32[$4 >> 2] | 0; //@line 10695
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 10699
   HEAP32[$1 + 24 >> 2] = $3; //@line 10701
   HEAP32[$1 + 36 >> 2] = 1; //@line 10703
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 10707
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 10710
    HEAP32[$1 + 24 >> 2] = 2; //@line 10712
    HEAP8[$1 + 54 >> 0] = 1; //@line 10714
    break;
   }
   $10 = $1 + 24 | 0; //@line 10717
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 10721
   }
  }
 } while (0);
 return;
}
function __Znwj__async_cb($0) {
 $0 = $0 | 0;
 var $$lcssa = 0, $2 = 0, $3 = 0, $5 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12477
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12479
 $3 = _malloc($2) | 0; //@line 12480
 if (!$3) {
  $5 = __ZSt15get_new_handlerv() | 0; //@line 12483
  if (!$5) {
   $$lcssa = 0; //@line 12486
  } else {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 12488
   FUNCTION_TABLE_v[$5 & 0](); //@line 12489
   if (!___async) {
    ___async_unwind = 0; //@line 12492
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 103; //@line 12494
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 12496
   sp = STACKTOP; //@line 12497
   return;
  }
 } else {
  $$lcssa = $3; //@line 12501
 }
 HEAP32[___async_retval >> 2] = $$lcssa; //@line 12504
 return;
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 5772
 $3 = HEAP8[$1 >> 0] | 0; //@line 5773
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 5778
  $$lcssa8 = $2; //@line 5778
 } else {
  $$011 = $1; //@line 5780
  $$0710 = $0; //@line 5780
  do {
   $$0710 = $$0710 + 1 | 0; //@line 5782
   $$011 = $$011 + 1 | 0; //@line 5783
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 5784
   $9 = HEAP8[$$011 >> 0] | 0; //@line 5785
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 5790
  $$lcssa8 = $8; //@line 5790
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 5800
}
function _memcmp($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $14 = 0, $4 = 0, $5 = 0;
 L1 : do {
  if (!$2) {
   $14 = 0; //@line 10214
  } else {
   $$01318 = $0; //@line 10216
   $$01417 = $2; //@line 10216
   $$019 = $1; //@line 10216
   while (1) {
    $4 = HEAP8[$$01318 >> 0] | 0; //@line 10218
    $5 = HEAP8[$$019 >> 0] | 0; //@line 10219
    if ($4 << 24 >> 24 != $5 << 24 >> 24) {
     break;
    }
    $$01417 = $$01417 + -1 | 0; //@line 10224
    if (!$$01417) {
     $14 = 0; //@line 10229
     break L1;
    } else {
     $$01318 = $$01318 + 1 | 0; //@line 10232
     $$019 = $$019 + 1 | 0; //@line 10232
    }
   }
   $14 = ($4 & 255) - ($5 & 255) | 0; //@line 10238
  }
 } while (0);
 return $14 | 0; //@line 10241
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1796
 $2 = HEAP32[58] | 0; //@line 1797
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1798
 _putc($1, $2) | 0; //@line 1799
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 51; //@line 1802
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 1804
  sp = STACKTOP; //@line 1805
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1808
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1809
 _fflush($2) | 0; //@line 1810
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 52; //@line 1813
  sp = STACKTOP; //@line 1814
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1817
  return;
 }
}
function _mbed_die__async_cb_46($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 12885
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12887
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12889
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 12890
 _wait_ms(150); //@line 12891
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 32; //@line 12894
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 12895
  HEAP32[$4 >> 2] = $2; //@line 12896
  sp = STACKTOP; //@line 12897
  return;
 }
 ___async_unwind = 0; //@line 12900
 HEAP32[$ReallocAsyncCtx15 >> 2] = 32; //@line 12901
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 12902
 HEAP32[$4 >> 2] = $2; //@line 12903
 sp = STACKTOP; //@line 12904
 return;
}
function _mbed_die__async_cb_45($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 12860
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12862
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12864
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 12865
 _wait_ms(150); //@line 12866
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 33; //@line 12869
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 12870
  HEAP32[$4 >> 2] = $2; //@line 12871
  sp = STACKTOP; //@line 12872
  return;
 }
 ___async_unwind = 0; //@line 12875
 HEAP32[$ReallocAsyncCtx14 >> 2] = 33; //@line 12876
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 12877
 HEAP32[$4 >> 2] = $2; //@line 12878
 sp = STACKTOP; //@line 12879
 return;
}
function _mbed_die__async_cb_44($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 12835
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12837
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12839
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 12840
 _wait_ms(150); //@line 12841
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 34; //@line 12844
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 12845
  HEAP32[$4 >> 2] = $2; //@line 12846
  sp = STACKTOP; //@line 12847
  return;
 }
 ___async_unwind = 0; //@line 12850
 HEAP32[$ReallocAsyncCtx13 >> 2] = 34; //@line 12851
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 12852
 HEAP32[$4 >> 2] = $2; //@line 12853
 sp = STACKTOP; //@line 12854
 return;
}
function _mbed_die__async_cb_43($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 12810
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12812
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12814
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 12815
 _wait_ms(150); //@line 12816
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 35; //@line 12819
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 12820
  HEAP32[$4 >> 2] = $2; //@line 12821
  sp = STACKTOP; //@line 12822
  return;
 }
 ___async_unwind = 0; //@line 12825
 HEAP32[$ReallocAsyncCtx12 >> 2] = 35; //@line 12826
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 12827
 HEAP32[$4 >> 2] = $2; //@line 12828
 sp = STACKTOP; //@line 12829
 return;
}
function _mbed_die__async_cb_42($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 12785
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12787
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12789
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 12790
 _wait_ms(150); //@line 12791
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 36; //@line 12794
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 12795
  HEAP32[$4 >> 2] = $2; //@line 12796
  sp = STACKTOP; //@line 12797
  return;
 }
 ___async_unwind = 0; //@line 12800
 HEAP32[$ReallocAsyncCtx11 >> 2] = 36; //@line 12801
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 12802
 HEAP32[$4 >> 2] = $2; //@line 12803
 sp = STACKTOP; //@line 12804
 return;
}
function _mbed_die__async_cb_41($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 12760
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12762
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12764
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 12765
 _wait_ms(150); //@line 12766
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 37; //@line 12769
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 12770
  HEAP32[$4 >> 2] = $2; //@line 12771
  sp = STACKTOP; //@line 12772
  return;
 }
 ___async_unwind = 0; //@line 12775
 HEAP32[$ReallocAsyncCtx10 >> 2] = 37; //@line 12776
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 12777
 HEAP32[$4 >> 2] = $2; //@line 12778
 sp = STACKTOP; //@line 12779
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 12510
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12512
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12514
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 12515
 _wait_ms(150); //@line 12516
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 31; //@line 12519
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 12520
  HEAP32[$4 >> 2] = $2; //@line 12521
  sp = STACKTOP; //@line 12522
  return;
 }
 ___async_unwind = 0; //@line 12525
 HEAP32[$ReallocAsyncCtx16 >> 2] = 31; //@line 12526
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 12527
 HEAP32[$4 >> 2] = $2; //@line 12528
 sp = STACKTOP; //@line 12529
 return;
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5724
 STACKTOP = STACKTOP + 32 | 0; //@line 5725
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 5725
 $vararg_buffer = sp; //@line 5726
 HEAP32[$0 + 36 >> 2] = 5; //@line 5729
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 5737
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 5739
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 5741
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 5746
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 5749
 STACKTOP = sp; //@line 5750
 return $14 | 0; //@line 5750
}
function _mbed_die__async_cb_40($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 12735
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12737
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12739
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 12740
 _wait_ms(150); //@line 12741
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 38; //@line 12744
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 12745
  HEAP32[$4 >> 2] = $2; //@line 12746
  sp = STACKTOP; //@line 12747
  return;
 }
 ___async_unwind = 0; //@line 12750
 HEAP32[$ReallocAsyncCtx9 >> 2] = 38; //@line 12751
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 12752
 HEAP32[$4 >> 2] = $2; //@line 12753
 sp = STACKTOP; //@line 12754
 return;
}
function _mbed_die__async_cb_39($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 12710
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12712
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12714
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 12715
 _wait_ms(400); //@line 12716
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 39; //@line 12719
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 12720
  HEAP32[$4 >> 2] = $2; //@line 12721
  sp = STACKTOP; //@line 12722
  return;
 }
 ___async_unwind = 0; //@line 12725
 HEAP32[$ReallocAsyncCtx8 >> 2] = 39; //@line 12726
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 12727
 HEAP32[$4 >> 2] = $2; //@line 12728
 sp = STACKTOP; //@line 12729
 return;
}
function _mbed_die__async_cb_38($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 12685
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12687
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12689
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 12690
 _wait_ms(400); //@line 12691
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 40; //@line 12694
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 12695
  HEAP32[$4 >> 2] = $2; //@line 12696
  sp = STACKTOP; //@line 12697
  return;
 }
 ___async_unwind = 0; //@line 12700
 HEAP32[$ReallocAsyncCtx7 >> 2] = 40; //@line 12701
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 12702
 HEAP32[$4 >> 2] = $2; //@line 12703
 sp = STACKTOP; //@line 12704
 return;
}
function _mbed_die__async_cb_37($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 12660
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12662
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12664
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 12665
 _wait_ms(400); //@line 12666
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 41; //@line 12669
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 12670
  HEAP32[$4 >> 2] = $2; //@line 12671
  sp = STACKTOP; //@line 12672
  return;
 }
 ___async_unwind = 0; //@line 12675
 HEAP32[$ReallocAsyncCtx6 >> 2] = 41; //@line 12676
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 12677
 HEAP32[$4 >> 2] = $2; //@line 12678
 sp = STACKTOP; //@line 12679
 return;
}
function _mbed_die__async_cb_36($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 12635
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12637
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12639
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 12640
 _wait_ms(400); //@line 12641
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 42; //@line 12644
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 12645
  HEAP32[$4 >> 2] = $2; //@line 12646
  sp = STACKTOP; //@line 12647
  return;
 }
 ___async_unwind = 0; //@line 12650
 HEAP32[$ReallocAsyncCtx5 >> 2] = 42; //@line 12651
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 12652
 HEAP32[$4 >> 2] = $2; //@line 12653
 sp = STACKTOP; //@line 12654
 return;
}
function _mbed_die__async_cb_35($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 12610
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12612
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12614
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 12615
 _wait_ms(400); //@line 12616
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 43; //@line 12619
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 12620
  HEAP32[$4 >> 2] = $2; //@line 12621
  sp = STACKTOP; //@line 12622
  return;
 }
 ___async_unwind = 0; //@line 12625
 HEAP32[$ReallocAsyncCtx4 >> 2] = 43; //@line 12626
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 12627
 HEAP32[$4 >> 2] = $2; //@line 12628
 sp = STACKTOP; //@line 12629
 return;
}
function _mbed_die__async_cb_34($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 12585
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12587
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12589
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 12590
 _wait_ms(400); //@line 12591
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 44; //@line 12594
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 12595
  HEAP32[$4 >> 2] = $2; //@line 12596
  sp = STACKTOP; //@line 12597
  return;
 }
 ___async_unwind = 0; //@line 12600
 HEAP32[$ReallocAsyncCtx3 >> 2] = 44; //@line 12601
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 12602
 HEAP32[$4 >> 2] = $2; //@line 12603
 sp = STACKTOP; //@line 12604
 return;
}
function _mbed_die__async_cb_33($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12560
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12562
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12564
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 12565
 _wait_ms(400); //@line 12566
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 45; //@line 12569
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 12570
  HEAP32[$4 >> 2] = $2; //@line 12571
  sp = STACKTOP; //@line 12572
  return;
 }
 ___async_unwind = 0; //@line 12575
 HEAP32[$ReallocAsyncCtx2 >> 2] = 45; //@line 12576
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 12577
 HEAP32[$4 >> 2] = $2; //@line 12578
 sp = STACKTOP; //@line 12579
 return;
}
function _mbed_die__async_cb_32($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12535
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12537
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12539
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 12540
 _wait_ms(400); //@line 12541
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 46; //@line 12544
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 12545
  HEAP32[$4 >> 2] = $2; //@line 12546
  sp = STACKTOP; //@line 12547
  return;
 }
 ___async_unwind = 0; //@line 12550
 HEAP32[$ReallocAsyncCtx >> 2] = 46; //@line 12551
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 12552
 HEAP32[$4 >> 2] = $2; //@line 12553
 sp = STACKTOP; //@line 12554
 return;
}
function _mbed_tracef($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 601
 STACKTOP = STACKTOP + 16 | 0; //@line 602
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 602
 $3 = sp; //@line 603
 HEAP32[$3 >> 2] = $varargs; //@line 604
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 605
 _mbed_vtracef($0, $1, $2, $3); //@line 606
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 17; //@line 609
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 611
  sp = STACKTOP; //@line 612
  STACKTOP = sp; //@line 613
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 615
  STACKTOP = sp; //@line 616
  return;
 }
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1627
 STACKTOP = STACKTOP + 16 | 0; //@line 1628
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1628
 $1 = sp; //@line 1629
 HEAP32[$1 >> 2] = $varargs; //@line 1630
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1631
 _mbed_error_vfprintf($0, $1); //@line 1632
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 47; //@line 1635
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 1637
  sp = STACKTOP; //@line 1638
  STACKTOP = sp; //@line 1639
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1641
  STACKTOP = sp; //@line 1642
  return;
 }
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 2372
 newDynamicTop = oldDynamicTop + increment | 0; //@line 2373
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 2377
  ___setErrNo(12); //@line 2378
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 2382
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 2386
   ___setErrNo(12); //@line 2387
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 2391
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 5895
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 5897
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 5903
  $11 = ___fwritex($0, $4, $3) | 0; //@line 5904
  if ($phitmp) {
   $13 = $11; //@line 5906
  } else {
   ___unlockfile($3); //@line 5908
   $13 = $11; //@line 5909
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 5913
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 5917
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 5920
 }
 return $15 | 0; //@line 5922
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 8231
 } else {
  $$056 = $2; //@line 8233
  $15 = $1; //@line 8233
  $8 = $0; //@line 8233
  while (1) {
   $14 = $$056 + -1 | 0; //@line 8241
   HEAP8[$14 >> 0] = HEAPU8[1956 + ($8 & 15) >> 0] | 0 | $3; //@line 8242
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 8243
   $15 = tempRet0; //@line 8244
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 8249
    break;
   } else {
    $$056 = $14; //@line 8252
   }
  }
 }
 return $$05$lcssa | 0; //@line 8256
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 6112
 $3 = HEAP8[$1 >> 0] | 0; //@line 6114
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 6118
 $7 = HEAP32[$0 >> 2] | 0; //@line 6119
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 6124
  HEAP32[$0 + 4 >> 2] = 0; //@line 6126
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 6128
  HEAP32[$0 + 28 >> 2] = $14; //@line 6130
  HEAP32[$0 + 20 >> 2] = $14; //@line 6132
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 6138
  $$0 = 0; //@line 6139
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 6142
  $$0 = -1; //@line 6143
 }
 return $$0 | 0; //@line 6145
}
function _twobyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$sink$in = 0, $$sink17$sink = 0, $11 = 0, $12 = 0, $8 = 0;
 $8 = (HEAPU8[$1 >> 0] | 0) << 8 | (HEAPU8[$1 + 1 >> 0] | 0); //@line 9699
 $$sink$in = HEAPU8[$0 >> 0] | 0; //@line 9702
 $$sink17$sink = $0; //@line 9702
 while (1) {
  $11 = $$sink17$sink + 1 | 0; //@line 9704
  $12 = HEAP8[$11 >> 0] | 0; //@line 9705
  if (!($12 << 24 >> 24)) {
   break;
  }
  $$sink$in = $$sink$in << 8 & 65280 | $12 & 255; //@line 9713
  if (($$sink$in | 0) == ($8 | 0)) {
   break;
  } else {
   $$sink17$sink = $11; //@line 9718
  }
 }
 return ($12 << 24 >> 24 ? $$sink17$sink : 0) | 0; //@line 9723
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 8268
 } else {
  $$06 = $2; //@line 8270
  $11 = $1; //@line 8270
  $7 = $0; //@line 8270
  while (1) {
   $10 = $$06 + -1 | 0; //@line 8275
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 8276
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 8277
   $11 = tempRet0; //@line 8278
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 8283
    break;
   } else {
    $$06 = $10; //@line 8286
   }
  }
 }
 return $$0$lcssa | 0; //@line 8290
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11996
 do {
  if (!$0) {
   $3 = 0; //@line 12000
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 12002
   $2 = ___dynamic_cast($0, 56, 112, 0) | 0; //@line 12003
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 125; //@line 12006
    sp = STACKTOP; //@line 12007
    return 0; //@line 12008
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12010
    $3 = ($2 | 0) != 0 & 1; //@line 12013
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 12018
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 7912
 } else {
  $$04 = 0; //@line 7914
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 7917
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 7921
   $12 = $7 + 1 | 0; //@line 7922
   HEAP32[$0 >> 2] = $12; //@line 7923
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 7929
    break;
   } else {
    $$04 = $11; //@line 7932
   }
  }
 }
 return $$0$lcssa | 0; //@line 7936
}
function _invoke_ticker__async_cb_64($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 395
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 401
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 402
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 403
 FUNCTION_TABLE_vi[$5 & 127]($6); //@line 404
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 54; //@line 407
  sp = STACKTOP; //@line 408
  return;
 }
 ___async_unwind = 0; //@line 411
 HEAP32[$ReallocAsyncCtx >> 2] = 54; //@line 412
 sp = STACKTOP; //@line 413
 return;
}
function _mbed_vtracef__async_cb_50($0) {
 $0 = $0 | 0;
 var $1 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13599
 $1 = HEAP32[54] | 0; //@line 13600
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 13601
 FUNCTION_TABLE_vi[$1 & 127](1113); //@line 13602
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 21; //@line 13605
  sp = STACKTOP; //@line 13606
  return;
 }
 ___async_unwind = 0; //@line 13609
 HEAP32[$ReallocAsyncCtx3 >> 2] = 21; //@line 13610
 sp = STACKTOP; //@line 13611
 return;
}
function ___fflush_unlocked__async_cb_62($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 250
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 252
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 254
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 256
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 258
 HEAP32[$4 >> 2] = 0; //@line 259
 HEAP32[$6 >> 2] = 0; //@line 260
 HEAP32[$8 >> 2] = 0; //@line 261
 HEAP32[$10 >> 2] = 0; //@line 262
 HEAP32[___async_retval >> 2] = 0; //@line 264
 return;
}
function __ZN4mbed6BusOutaSEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 563
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 564
 __ZN4mbed6BusOut5writeEi($0, $1); //@line 565
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 15; //@line 568
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 570
  sp = STACKTOP; //@line 571
  return 0; //@line 572
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 574
  return $0 | 0; //@line 575
 }
 return 0; //@line 577
}
function _serial_putc__async_cb_76($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1894
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1896
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 1897
 _fflush($2) | 0; //@line 1898
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 52; //@line 1901
  sp = STACKTOP; //@line 1902
  return;
 }
 ___async_unwind = 0; //@line 1905
 HEAP32[$ReallocAsyncCtx >> 2] = 52; //@line 1906
 sp = STACKTOP; //@line 1907
 return;
}
function __GLOBAL__sub_I_main_cpp() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1913
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1914
 __ZN4mbed6BusOutC2E7PinNameS1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_(4108, 50, 52, 53, 55, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1); //@line 1915
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 57; //@line 1918
  sp = STACKTOP; //@line 1919
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1922
  return;
 }
}
function _emscripten_async_resume() {
 ___async = 0; //@line 2223
 ___async_unwind = 1; //@line 2224
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 2230
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 2234
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 2238
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 2240
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5535
 STACKTOP = STACKTOP + 16 | 0; //@line 5536
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 5536
 $vararg_buffer = sp; //@line 5537
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 5541
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 5543
 STACKTOP = sp; //@line 5544
 return $5 | 0; //@line 5544
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 2165
 STACKTOP = STACKTOP + 16 | 0; //@line 2166
 $rem = __stackBase__ | 0; //@line 2167
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 2168
 STACKTOP = __stackBase__; //@line 2169
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 2170
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 1935
 if ((ret | 0) < 8) return ret | 0; //@line 1936
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 1937
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 1938
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 1939
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 1940
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 1941
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10598
 }
 return;
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 10354
 $6 = HEAP32[$5 >> 2] | 0; //@line 10355
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 10356
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 10358
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 10360
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 10363
 return $2 | 0; //@line 10364
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1871
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 1874
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 1879
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 1882
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1785
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 1796
  $$0 = 1; //@line 1797
 } else {
  $$0 = 0; //@line 1799
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 1803
 return;
}
function _wait($0) {
 $0 = +$0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1879
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1883
 _emscripten_sleep((~~($0 * 1.0e6) | 0) / 1e3 | 0 | 0); //@line 1884
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 55; //@line 1887
  sp = STACKTOP; //@line 1888
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1891
  return;
 }
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 1775
 HEAP32[$0 >> 2] = $1; //@line 1776
 HEAP32[1024] = 1; //@line 1777
 $4 = $0; //@line 1778
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 1783
 $10 = 4100; //@line 1784
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 1786
 HEAP32[$10 + 4 >> 2] = $9; //@line 1789
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 10674
 }
 return;
}
function _main__async_cb_31($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 12463
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(4) | 0; //@line 12464
 __ZN4mbed6BusOutaSEi(4108, 1) | 0; //@line 12465
 if (!___async) {
  ___async_unwind = 0; //@line 12468
 }
 HEAP32[$ReallocAsyncCtx15 >> 2] = 60; //@line 12470
 sp = STACKTOP; //@line 12471
 return;
}
function _main__async_cb_30($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 12449
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(4) | 0; //@line 12450
 __ZN4mbed6BusOutaSEi(4108, 2) | 0; //@line 12451
 if (!___async) {
  ___async_unwind = 0; //@line 12454
 }
 HEAP32[$ReallocAsyncCtx14 >> 2] = 62; //@line 12456
 sp = STACKTOP; //@line 12457
 return;
}
function _main__async_cb_29($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 12435
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(4) | 0; //@line 12436
 __ZN4mbed6BusOutaSEi(4108, 3) | 0; //@line 12437
 if (!___async) {
  ___async_unwind = 0; //@line 12440
 }
 HEAP32[$ReallocAsyncCtx13 >> 2] = 64; //@line 12442
 sp = STACKTOP; //@line 12443
 return;
}
function _main__async_cb_28($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 12421
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(4) | 0; //@line 12422
 __ZN4mbed6BusOutaSEi(4108, 4) | 0; //@line 12423
 if (!___async) {
  ___async_unwind = 0; //@line 12426
 }
 HEAP32[$ReallocAsyncCtx12 >> 2] = 66; //@line 12428
 sp = STACKTOP; //@line 12429
 return;
}
function _main__async_cb_27($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 12407
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(4) | 0; //@line 12408
 __ZN4mbed6BusOutaSEi(4108, 5) | 0; //@line 12409
 if (!___async) {
  ___async_unwind = 0; //@line 12412
 }
 HEAP32[$ReallocAsyncCtx11 >> 2] = 68; //@line 12414
 sp = STACKTOP; //@line 12415
 return;
}
function _main__async_cb_26($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 12393
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(4) | 0; //@line 12394
 __ZN4mbed6BusOutaSEi(4108, 6) | 0; //@line 12395
 if (!___async) {
  ___async_unwind = 0; //@line 12398
 }
 HEAP32[$ReallocAsyncCtx10 >> 2] = 70; //@line 12400
 sp = STACKTOP; //@line 12401
 return;
}
function _main__async_cb_16($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 12253
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(4) | 0; //@line 12254
 __ZN4mbed6BusOutaSEi(4108, 0) | 0; //@line 12255
 if (!___async) {
  ___async_unwind = 0; //@line 12258
 }
 HEAP32[$ReallocAsyncCtx16 >> 2] = 58; //@line 12260
 sp = STACKTOP; //@line 12261
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1898
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1899
 _emscripten_sleep($0 | 0); //@line 1900
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 56; //@line 1903
  sp = STACKTOP; //@line 1904
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1907
  return;
 }
}
function _mbed_trace_default_print($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 582
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 583
 _puts($0) | 0; //@line 584
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 16; //@line 587
  sp = STACKTOP; //@line 588
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 591
  return;
 }
}
function _main__async_cb_22($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 12337
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(4) | 0; //@line 12338
 __ZN4mbed6BusOutaSEi(4108, 10) | 0; //@line 12339
 if (!___async) {
  ___async_unwind = 0; //@line 12342
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 78; //@line 12344
 sp = STACKTOP; //@line 12345
 return;
}
function _main__async_cb_21($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 12323
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(4) | 0; //@line 12324
 __ZN4mbed6BusOutaSEi(4108, 11) | 0; //@line 12325
 if (!___async) {
  ___async_unwind = 0; //@line 12328
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 80; //@line 12330
 sp = STACKTOP; //@line 12331
 return;
}
function _main__async_cb_20($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 12309
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 12310
 __ZN4mbed6BusOutaSEi(4108, 12) | 0; //@line 12311
 if (!___async) {
  ___async_unwind = 0; //@line 12314
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 82; //@line 12316
 sp = STACKTOP; //@line 12317
 return;
}
function _main__async_cb_19($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 12295
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 12296
 __ZN4mbed6BusOutaSEi(4108, 13) | 0; //@line 12297
 if (!___async) {
  ___async_unwind = 0; //@line 12300
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 84; //@line 12302
 sp = STACKTOP; //@line 12303
 return;
}
function _main__async_cb_18($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12281
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 12282
 __ZN4mbed6BusOutaSEi(4108, 14) | 0; //@line 12283
 if (!___async) {
  ___async_unwind = 0; //@line 12286
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 86; //@line 12288
 sp = STACKTOP; //@line 12289
 return;
}
function _main__async_cb_25($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 12379
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(4) | 0; //@line 12380
 __ZN4mbed6BusOutaSEi(4108, 7) | 0; //@line 12381
 if (!___async) {
  ___async_unwind = 0; //@line 12384
 }
 HEAP32[$ReallocAsyncCtx9 >> 2] = 72; //@line 12386
 sp = STACKTOP; //@line 12387
 return;
}
function _main__async_cb_24($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 12365
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(4) | 0; //@line 12366
 __ZN4mbed6BusOutaSEi(4108, 8) | 0; //@line 12367
 if (!___async) {
  ___async_unwind = 0; //@line 12370
 }
 HEAP32[$ReallocAsyncCtx8 >> 2] = 74; //@line 12372
 sp = STACKTOP; //@line 12373
 return;
}
function _main__async_cb_23($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 12351
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 12352
 __ZN4mbed6BusOutaSEi(4108, 9) | 0; //@line 12353
 if (!___async) {
  ___async_unwind = 0; //@line 12356
 }
 HEAP32[$ReallocAsyncCtx7 >> 2] = 76; //@line 12358
 sp = STACKTOP; //@line 12359
 return;
}
function _main__async_cb_17($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12267
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 12268
 __ZN4mbed6BusOutaSEi(4108, 15) | 0; //@line 12269
 if (!___async) {
  ___async_unwind = 0; //@line 12272
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 88; //@line 12274
 sp = STACKTOP; //@line 12275
 return;
}
function _main__async_cb_15($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx32 = 0, sp = 0;
 sp = STACKTOP; //@line 12239
 $ReallocAsyncCtx32 = _emscripten_realloc_async_context(4) | 0; //@line 12240
 _wait(.25); //@line 12241
 if (!___async) {
  ___async_unwind = 0; //@line 12244
 }
 HEAP32[$ReallocAsyncCtx32 >> 2] = 59; //@line 12246
 sp = STACKTOP; //@line 12247
 return;
}
function _main__async_cb_14($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx31 = 0, sp = 0;
 sp = STACKTOP; //@line 12225
 $ReallocAsyncCtx31 = _emscripten_realloc_async_context(4) | 0; //@line 12226
 _wait(.25); //@line 12227
 if (!___async) {
  ___async_unwind = 0; //@line 12230
 }
 HEAP32[$ReallocAsyncCtx31 >> 2] = 61; //@line 12232
 sp = STACKTOP; //@line 12233
 return;
}
function _main__async_cb_13($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx30 = 0, sp = 0;
 sp = STACKTOP; //@line 12211
 $ReallocAsyncCtx30 = _emscripten_realloc_async_context(4) | 0; //@line 12212
 _wait(.25); //@line 12213
 if (!___async) {
  ___async_unwind = 0; //@line 12216
 }
 HEAP32[$ReallocAsyncCtx30 >> 2] = 63; //@line 12218
 sp = STACKTOP; //@line 12219
 return;
}
function _main__async_cb_12($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx29 = 0, sp = 0;
 sp = STACKTOP; //@line 12197
 $ReallocAsyncCtx29 = _emscripten_realloc_async_context(4) | 0; //@line 12198
 _wait(.25); //@line 12199
 if (!___async) {
  ___async_unwind = 0; //@line 12202
 }
 HEAP32[$ReallocAsyncCtx29 >> 2] = 65; //@line 12204
 sp = STACKTOP; //@line 12205
 return;
}
function _main__async_cb_11($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx28 = 0, sp = 0;
 sp = STACKTOP; //@line 12183
 $ReallocAsyncCtx28 = _emscripten_realloc_async_context(4) | 0; //@line 12184
 _wait(.25); //@line 12185
 if (!___async) {
  ___async_unwind = 0; //@line 12188
 }
 HEAP32[$ReallocAsyncCtx28 >> 2] = 67; //@line 12190
 sp = STACKTOP; //@line 12191
 return;
}
function _main__async_cb_10($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx27 = 0, sp = 0;
 sp = STACKTOP; //@line 12169
 $ReallocAsyncCtx27 = _emscripten_realloc_async_context(4) | 0; //@line 12170
 _wait(.25); //@line 12171
 if (!___async) {
  ___async_unwind = 0; //@line 12174
 }
 HEAP32[$ReallocAsyncCtx27 >> 2] = 69; //@line 12176
 sp = STACKTOP; //@line 12177
 return;
}
function _main__async_cb_9($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx26 = 0, sp = 0;
 sp = STACKTOP; //@line 12155
 $ReallocAsyncCtx26 = _emscripten_realloc_async_context(4) | 0; //@line 12156
 _wait(.25); //@line 12157
 if (!___async) {
  ___async_unwind = 0; //@line 12160
 }
 HEAP32[$ReallocAsyncCtx26 >> 2] = 71; //@line 12162
 sp = STACKTOP; //@line 12163
 return;
}
function _main__async_cb_8($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx25 = 0, sp = 0;
 sp = STACKTOP; //@line 12141
 $ReallocAsyncCtx25 = _emscripten_realloc_async_context(4) | 0; //@line 12142
 _wait(.25); //@line 12143
 if (!___async) {
  ___async_unwind = 0; //@line 12146
 }
 HEAP32[$ReallocAsyncCtx25 >> 2] = 73; //@line 12148
 sp = STACKTOP; //@line 12149
 return;
}
function _main__async_cb_7($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx24 = 0, sp = 0;
 sp = STACKTOP; //@line 12127
 $ReallocAsyncCtx24 = _emscripten_realloc_async_context(4) | 0; //@line 12128
 _wait(.25); //@line 12129
 if (!___async) {
  ___async_unwind = 0; //@line 12132
 }
 HEAP32[$ReallocAsyncCtx24 >> 2] = 75; //@line 12134
 sp = STACKTOP; //@line 12135
 return;
}
function _main__async_cb_6($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx23 = 0, sp = 0;
 sp = STACKTOP; //@line 12113
 $ReallocAsyncCtx23 = _emscripten_realloc_async_context(4) | 0; //@line 12114
 _wait(.25); //@line 12115
 if (!___async) {
  ___async_unwind = 0; //@line 12118
 }
 HEAP32[$ReallocAsyncCtx23 >> 2] = 77; //@line 12120
 sp = STACKTOP; //@line 12121
 return;
}
function _main__async_cb_5($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx22 = 0, sp = 0;
 sp = STACKTOP; //@line 12099
 $ReallocAsyncCtx22 = _emscripten_realloc_async_context(4) | 0; //@line 12100
 _wait(.25); //@line 12101
 if (!___async) {
  ___async_unwind = 0; //@line 12104
 }
 HEAP32[$ReallocAsyncCtx22 >> 2] = 79; //@line 12106
 sp = STACKTOP; //@line 12107
 return;
}
function _main__async_cb_4($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx21 = 0, sp = 0;
 sp = STACKTOP; //@line 12085
 $ReallocAsyncCtx21 = _emscripten_realloc_async_context(4) | 0; //@line 12086
 _wait(.25); //@line 12087
 if (!___async) {
  ___async_unwind = 0; //@line 12090
 }
 HEAP32[$ReallocAsyncCtx21 >> 2] = 81; //@line 12092
 sp = STACKTOP; //@line 12093
 return;
}
function _main__async_cb_3($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx20 = 0, sp = 0;
 sp = STACKTOP; //@line 12071
 $ReallocAsyncCtx20 = _emscripten_realloc_async_context(4) | 0; //@line 12072
 _wait(.25); //@line 12073
 if (!___async) {
  ___async_unwind = 0; //@line 12076
 }
 HEAP32[$ReallocAsyncCtx20 >> 2] = 83; //@line 12078
 sp = STACKTOP; //@line 12079
 return;
}
function _main__async_cb_2($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx19 = 0, sp = 0;
 sp = STACKTOP; //@line 12057
 $ReallocAsyncCtx19 = _emscripten_realloc_async_context(4) | 0; //@line 12058
 _wait(.25); //@line 12059
 if (!___async) {
  ___async_unwind = 0; //@line 12062
 }
 HEAP32[$ReallocAsyncCtx19 >> 2] = 85; //@line 12064
 sp = STACKTOP; //@line 12065
 return;
}
function _main__async_cb_1($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx18 = 0, sp = 0;
 sp = STACKTOP; //@line 12043
 $ReallocAsyncCtx18 = _emscripten_realloc_async_context(4) | 0; //@line 12044
 _wait(.25); //@line 12045
 if (!___async) {
  ___async_unwind = 0; //@line 12048
 }
 HEAP32[$ReallocAsyncCtx18 >> 2] = 87; //@line 12050
 sp = STACKTOP; //@line 12051
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx17 = 0, sp = 0;
 sp = STACKTOP; //@line 12029
 $ReallocAsyncCtx17 = _emscripten_realloc_async_context(4) | 0; //@line 12030
 _wait(.25); //@line 12031
 if (!___async) {
  ___async_unwind = 0; //@line 12034
 }
 HEAP32[$ReallocAsyncCtx17 >> 2] = 89; //@line 12036
 sp = STACKTOP; //@line 12037
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 10738
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 10742
  }
 }
 return;
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 2199
 HEAP32[new_frame + 4 >> 2] = sp; //@line 2201
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 2203
 ___async_cur_frame = new_frame; //@line 2204
 return ___async_cur_frame + 8 | 0; //@line 2205
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 12919
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 12923
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 12926
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 2188
  return low << bits; //@line 2189
 }
 tempRet0 = low << bits - 32; //@line 2191
 return 0; //@line 2192
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 2177
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 2178
 }
 tempRet0 = 0; //@line 2180
 return high >>> bits - 32 | 0; //@line 2181
}
function _fflush__async_cb_47($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13016
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 13018
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 13021
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
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 277
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 280
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 283
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 14317
 } else {
  $$0 = -1; //@line 14319
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 14322
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 6242
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 6248
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 6252
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 2447
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 2211
 stackRestore(___async_cur_frame | 0); //@line 2212
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 2213
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1357
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 1358
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 1360
 return;
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 1751
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 1757
 _emscripten_asm_const_iii(2, $0 | 0, $1 | 0) | 0; //@line 1758
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 9353
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 9353
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 9355
 return $1 | 0; //@line 9356
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 5701
  $$0 = -1; //@line 5702
 } else {
  $$0 = $0; //@line 5704
 }
 return $$0 | 0; //@line 5706
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 1928
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 1929
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 1930
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 1920
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 1922
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 2440
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
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 2433
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 6387
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 6392
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 8413
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 8416
 }
 return $$0 | 0; //@line 8418
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 2412
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 2157
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 5882
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 5886
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 314
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 2218
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 2219
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 11179
 __ZdlPv($0); //@line 11180
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 10960
 __ZdlPv($0); //@line 10961
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 6378
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 6380
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 10488
 __ZdlPv($0); //@line 10489
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 14290
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
  ___fwritex($1, $2, $0) | 0; //@line 7898
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
 nullFunc_viiiiii(0); //@line 2484
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 10685
}
function __ZSt15get_new_handlerv() {
 var $0 = 0;
 $0 = HEAP32[1190] | 0; //@line 11952
 HEAP32[1190] = $0 + 0; //@line 11954
 return $0 | 0; //@line 11956
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
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 2245
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_73($0) {
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
 nullFunc_viiiii(0); //@line 2481
}
function _fflush__async_cb_48($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 13031
 return;
}
function __ZN4mbed6BusOutaSEi__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 1248
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 8361
}
function _snprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1777
 return;
}
function _putc__async_cb_72($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1370
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 2405
}
function b7(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 2463
 return 0; //@line 2463
}
function b6(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 2460
 return 0; //@line 2460
}
function b5(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 2457
 return 0; //@line 2457
}
function __ZN4mbed6BusOutD0Ev($0) {
 $0 = $0 | 0;
 __ZN4mbed6BusOutD2Ev($0); //@line 241
 __ZdlPv($0); //@line 242
 return;
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 127](a1 | 0); //@line 2426
}
function b15(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 2478
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 9606
}
function dynCall_i(index) {
 index = index | 0;
 return FUNCTION_TABLE_i[index & 0]() | 0; //@line 2398
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 0](); //@line 2419
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 5759
}
function b3(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 2454
 return 0; //@line 2454
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
 ___lock(4748); //@line 6397
 return 4756; //@line 6398
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
 return _pthread_self() | 0; //@line 9527
}
function _mbed_trace_default_print__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 9533
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
 _free($0); //@line 10475
 return;
}
function _mbed_assert_internal__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b1() {
 nullFunc_i(0); //@line 2451
 return 0; //@line 2451
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
 ___unlock(4748); //@line 6403
 return;
}
function b13(p0) {
 p0 = p0 | 0;
 nullFunc_vi(127); //@line 2475
}
function b12(p0) {
 p0 = p0 | 0;
 nullFunc_vi(126); //@line 2472
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 5717
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 6034
}
function __ZN4mbed6BusOut6unlockEv($0) {
 $0 = $0 | 0;
 return;
}
function b11(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 2469
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
 return 4744; //@line 5711
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
 return 364; //@line 5764
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 26
}
function b9() {
 nullFunc_v(0); //@line 2466
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_i = [b1];
var FUNCTION_TABLE_ii = [b3,___stdio_close];
var FUNCTION_TABLE_iiii = [b5,___stdout_write,___stdio_seek,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,___stdio_write,b6,b7];
var FUNCTION_TABLE_v = [b9];
var FUNCTION_TABLE_vi = [b11,__ZN4mbed6BusOutD2Ev,__ZN4mbed6BusOutD0Ev,__ZN4mbed6BusOut4lockEv,__ZN4mbed6BusOut6unlockEv,_mbed_trace_default_print,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed6BusOutC2E7PinNameS1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1___async_cb,__ZN4mbed6BusOut5writeEi__async_cb,__ZN4mbed6BusOut5writeEi__async_cb_61,__ZN4mbed6BusOutaSEi__async_cb,_mbed_trace_default_print__async_cb,_mbed_tracef__async_cb,_mbed_vtracef__async_cb,_mbed_vtracef__async_cb_60,_mbed_vtracef__async_cb_50,_mbed_vtracef__async_cb_51,_mbed_vtracef__async_cb_52,_mbed_vtracef__async_cb_59,_mbed_vtracef__async_cb_53,_mbed_vtracef__async_cb_58,_mbed_vtracef__async_cb_54,_mbed_vtracef__async_cb_55,_mbed_vtracef__async_cb_56
,_mbed_vtracef__async_cb_57,_mbed_assert_internal__async_cb,_mbed_die__async_cb_46,_mbed_die__async_cb_45,_mbed_die__async_cb_44,_mbed_die__async_cb_43,_mbed_die__async_cb_42,_mbed_die__async_cb_41,_mbed_die__async_cb_40,_mbed_die__async_cb_39,_mbed_die__async_cb_38,_mbed_die__async_cb_37,_mbed_die__async_cb_36,_mbed_die__async_cb_35,_mbed_die__async_cb_34,_mbed_die__async_cb_33,_mbed_die__async_cb_32,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_vfprintf__async_cb,_mbed_error_vfprintf__async_cb_66,_mbed_error_vfprintf__async_cb_65,_serial_putc__async_cb_76,_serial_putc__async_cb,_invoke_ticker__async_cb_64,_invoke_ticker__async_cb,_wait__async_cb,_wait_ms__async_cb,__GLOBAL__sub_I_main_cpp__async_cb,_main__async_cb_15
,_main__async_cb_31,_main__async_cb_14,_main__async_cb_30,_main__async_cb_13,_main__async_cb_29,_main__async_cb_12,_main__async_cb_28,_main__async_cb_11,_main__async_cb_27,_main__async_cb_10,_main__async_cb_26,_main__async_cb_9,_main__async_cb_25,_main__async_cb_8,_main__async_cb_24,_main__async_cb_7,_main__async_cb_23,_main__async_cb_6,_main__async_cb_22,_main__async_cb_5,_main__async_cb_21,_main__async_cb_4,_main__async_cb_20,_main__async_cb_3,_main__async_cb_19,_main__async_cb_2,_main__async_cb_18,_main__async_cb_1,_main__async_cb_17,_main__async_cb
,_main__async_cb_16,_putc__async_cb_72,_putc__async_cb,___overflow__async_cb,_fflush__async_cb_48,_fflush__async_cb_47,_fflush__async_cb_49,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_62,_vfprintf__async_cb,_snprintf__async_cb,_vsnprintf__async_cb,_puts__async_cb,__Znwj__async_cb,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_75,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_63,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_73,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_74,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_70,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_69,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_68,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_67,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb
,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_71,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b12,b13];
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
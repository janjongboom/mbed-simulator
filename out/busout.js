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

var ASM_CONSTS = [function($0, $1) { MbedJSHal.gpio.write($0, $1); },
 function($0, $1) { MbedJSHal.gpio.init_out($0, $1, 0); }];

function _emscripten_asm_const_iii(code, a0, a1) {
  return ASM_CONSTS[code](a0, a1);
}




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 5408;
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



var debug_table_ii = ["0", "___stdio_close"];
var debug_table_iiii = ["0", "___stdout_write", "___stdio_seek", "_sn_write", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv", "___stdio_write", "0", "0"];
var debug_table_v = ["0"];
var debug_table_vi = ["0", "__ZN4mbed6BusOutD2Ev", "__ZN4mbed6BusOutD0Ev", "__ZN4mbed6BusOut4lockEv", "__ZN4mbed6BusOut6unlockEv", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "__ZN10__cxxabiv121__vmi_class_type_infoD0Ev", "__ZN4mbed6BusOutC2E7PinNameS1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1___async_cb", "__ZN4mbed6BusOut5writeEi__async_cb", "__ZN4mbed6BusOut5writeEi__async_cb_63", "__ZN4mbed6BusOutaSEi__async_cb", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_54", "_mbed_die__async_cb_53", "_mbed_die__async_cb_52", "_mbed_die__async_cb_51", "_mbed_die__async_cb_50", "_mbed_die__async_cb_49", "_mbed_die__async_cb_48", "_mbed_die__async_cb_47", "_mbed_die__async_cb_46", "_mbed_die__async_cb_45", "_mbed_die__async_cb_44", "_mbed_die__async_cb_43", "_mbed_die__async_cb_42", "_mbed_die__async_cb_41", "_mbed_die__async_cb_40", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_printf__async_cb_34", "_serial_putc__async_cb_39", "_serial_putc__async_cb", "_invoke_ticker__async_cb_61", "_invoke_ticker__async_cb", "_wait__async_cb", "_wait_ms__async_cb", "__GLOBAL__sub_I_main_cpp__async_cb", "_main__async_cb_16", "_main__async_cb_32", "_main__async_cb_15", "_main__async_cb_31", "_main__async_cb_14", "_main__async_cb_30", "_main__async_cb_13", "_main__async_cb_29", "_main__async_cb_12", "_main__async_cb_28", "_main__async_cb_11", "_main__async_cb_27", "_main__async_cb_10", "_main__async_cb_26", "_main__async_cb_9", "_main__async_cb_25", "_main__async_cb_8", "_main__async_cb_24", "_main__async_cb_7", "_main__async_cb_23", "_main__async_cb_6", "_main__async_cb_22", "_main__async_cb_5", "_main__async_cb_21", "_main__async_cb_4", "_main__async_cb_20", "_main__async_cb_3", "_main__async_cb_19", "_main__async_cb_2", "_main__async_cb_18", "_main__async_cb", "_main__async_cb_17", "_putc__async_cb_33", "_putc__async_cb", "___overflow__async_cb", "_fflush__async_cb_57", "_fflush__async_cb_56", "_fflush__async_cb_58", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_55", "_vfprintf__async_cb", "_vsnprintf__async_cb", "__Znwj__async_cb", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_59", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_64", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_60", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_62", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_38", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_37", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_36", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_35", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_1", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
var debug_table_viiii = ["0", "__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi"];
var debug_table_viiiii = ["0", "__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib"];
var debug_table_viiiiii = ["0", "__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib"];
function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: iiii: " + debug_table_iiii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  "); abort(x) }

function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: ii: " + debug_table_ii[x] + "  viiii: " + debug_table_viiii[x] + "  vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  "); abort(x) }

function nullFunc_v(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_viiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  "); abort(x) }

function nullFunc_viiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viiii: " + debug_table_viiii[x] + "  vi: " + debug_table_vi[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  "); abort(x) }

function nullFunc_viiiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  "); abort(x) }

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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_ii": nullFunc_ii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_v": nullFunc_v, "nullFunc_vi": nullFunc_vi, "nullFunc_viiii": nullFunc_viiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "___gxx_personality_v0": ___gxx_personality_v0, "___lock": ___lock, "___resumeException": ___resumeException, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___unlock": ___unlock, "_abort": _abort, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
  var nullFunc_ii=env.nullFunc_ii;
  var nullFunc_iiii=env.nullFunc_iiii;
  var nullFunc_v=env.nullFunc_v;
  var nullFunc_vi=env.nullFunc_vi;
  var nullFunc_viiii=env.nullFunc_viiii;
  var nullFunc_viiiii=env.nullFunc_viiiii;
  var nullFunc_viiiiii=env.nullFunc_viiiiii;
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
 sp = STACKTOP; //@line 1600
 STACKTOP = STACKTOP + 16 | 0; //@line 1601
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1601
 $1 = sp; //@line 1602
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 1609
   $7 = $6 >>> 3; //@line 1610
   $8 = HEAP32[948] | 0; //@line 1611
   $9 = $8 >>> $7; //@line 1612
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 1618
    $16 = 3832 + ($14 << 1 << 2) | 0; //@line 1620
    $17 = $16 + 8 | 0; //@line 1621
    $18 = HEAP32[$17 >> 2] | 0; //@line 1622
    $19 = $18 + 8 | 0; //@line 1623
    $20 = HEAP32[$19 >> 2] | 0; //@line 1624
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[948] = $8 & ~(1 << $14); //@line 1631
     } else {
      if ((HEAP32[952] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 1636
      }
      $27 = $20 + 12 | 0; //@line 1639
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 1643
       HEAP32[$17 >> 2] = $20; //@line 1644
       break;
      } else {
       _abort(); //@line 1647
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 1652
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 1655
    $34 = $18 + $30 + 4 | 0; //@line 1657
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 1660
    $$0 = $19; //@line 1661
    STACKTOP = sp; //@line 1662
    return $$0 | 0; //@line 1662
   }
   $37 = HEAP32[950] | 0; //@line 1664
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 1670
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 1673
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 1676
     $49 = $47 >>> 12 & 16; //@line 1678
     $50 = $47 >>> $49; //@line 1679
     $52 = $50 >>> 5 & 8; //@line 1681
     $54 = $50 >>> $52; //@line 1683
     $56 = $54 >>> 2 & 4; //@line 1685
     $58 = $54 >>> $56; //@line 1687
     $60 = $58 >>> 1 & 2; //@line 1689
     $62 = $58 >>> $60; //@line 1691
     $64 = $62 >>> 1 & 1; //@line 1693
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 1696
     $69 = 3832 + ($67 << 1 << 2) | 0; //@line 1698
     $70 = $69 + 8 | 0; //@line 1699
     $71 = HEAP32[$70 >> 2] | 0; //@line 1700
     $72 = $71 + 8 | 0; //@line 1701
     $73 = HEAP32[$72 >> 2] | 0; //@line 1702
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 1708
       HEAP32[948] = $77; //@line 1709
       $98 = $77; //@line 1710
      } else {
       if ((HEAP32[952] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 1715
       }
       $80 = $73 + 12 | 0; //@line 1718
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 1722
        HEAP32[$70 >> 2] = $73; //@line 1723
        $98 = $8; //@line 1724
        break;
       } else {
        _abort(); //@line 1727
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 1732
     $84 = $83 - $6 | 0; //@line 1733
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 1736
     $87 = $71 + $6 | 0; //@line 1737
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 1740
     HEAP32[$71 + $83 >> 2] = $84; //@line 1742
     if ($37 | 0) {
      $92 = HEAP32[953] | 0; //@line 1745
      $93 = $37 >>> 3; //@line 1746
      $95 = 3832 + ($93 << 1 << 2) | 0; //@line 1748
      $96 = 1 << $93; //@line 1749
      if (!($98 & $96)) {
       HEAP32[948] = $98 | $96; //@line 1754
       $$0199 = $95; //@line 1756
       $$pre$phiZ2D = $95 + 8 | 0; //@line 1756
      } else {
       $101 = $95 + 8 | 0; //@line 1758
       $102 = HEAP32[$101 >> 2] | 0; //@line 1759
       if ((HEAP32[952] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 1763
       } else {
        $$0199 = $102; //@line 1766
        $$pre$phiZ2D = $101; //@line 1766
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 1769
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 1771
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 1773
      HEAP32[$92 + 12 >> 2] = $95; //@line 1775
     }
     HEAP32[950] = $84; //@line 1777
     HEAP32[953] = $87; //@line 1778
     $$0 = $72; //@line 1779
     STACKTOP = sp; //@line 1780
     return $$0 | 0; //@line 1780
    }
    $108 = HEAP32[949] | 0; //@line 1782
    if (!$108) {
     $$0197 = $6; //@line 1785
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 1789
     $114 = $112 >>> 12 & 16; //@line 1791
     $115 = $112 >>> $114; //@line 1792
     $117 = $115 >>> 5 & 8; //@line 1794
     $119 = $115 >>> $117; //@line 1796
     $121 = $119 >>> 2 & 4; //@line 1798
     $123 = $119 >>> $121; //@line 1800
     $125 = $123 >>> 1 & 2; //@line 1802
     $127 = $123 >>> $125; //@line 1804
     $129 = $127 >>> 1 & 1; //@line 1806
     $134 = HEAP32[4096 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 1811
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 1815
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1821
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 1824
      $$0193$lcssa$i = $138; //@line 1824
     } else {
      $$01926$i = $134; //@line 1826
      $$01935$i = $138; //@line 1826
      $146 = $143; //@line 1826
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 1831
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 1832
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 1833
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 1834
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1840
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 1843
        $$0193$lcssa$i = $$$0193$i; //@line 1843
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 1846
        $$01935$i = $$$0193$i; //@line 1846
       }
      }
     }
     $157 = HEAP32[952] | 0; //@line 1850
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 1853
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 1856
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 1859
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 1863
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 1865
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 1869
       $176 = HEAP32[$175 >> 2] | 0; //@line 1870
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 1873
        $179 = HEAP32[$178 >> 2] | 0; //@line 1874
        if (!$179) {
         $$3$i = 0; //@line 1877
         break;
        } else {
         $$1196$i = $179; //@line 1880
         $$1198$i = $178; //@line 1880
        }
       } else {
        $$1196$i = $176; //@line 1883
        $$1198$i = $175; //@line 1883
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 1886
        $182 = HEAP32[$181 >> 2] | 0; //@line 1887
        if ($182 | 0) {
         $$1196$i = $182; //@line 1890
         $$1198$i = $181; //@line 1890
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 1893
        $185 = HEAP32[$184 >> 2] | 0; //@line 1894
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 1899
         $$1198$i = $184; //@line 1899
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 1904
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 1907
        $$3$i = $$1196$i; //@line 1908
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 1913
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 1916
       }
       $169 = $167 + 12 | 0; //@line 1919
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 1923
       }
       $172 = $164 + 8 | 0; //@line 1926
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 1930
        HEAP32[$172 >> 2] = $167; //@line 1931
        $$3$i = $164; //@line 1932
        break;
       } else {
        _abort(); //@line 1935
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 1944
       $191 = 4096 + ($190 << 2) | 0; //@line 1945
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 1950
         if (!$$3$i) {
          HEAP32[949] = $108 & ~(1 << $190); //@line 1956
          break L73;
         }
        } else {
         if ((HEAP32[952] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 1963
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 1971
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[952] | 0; //@line 1981
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 1984
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 1988
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 1990
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 1996
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 2000
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 2002
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 2008
       if ($214 | 0) {
        if ((HEAP32[952] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 2014
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 2018
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 2020
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 2028
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 2031
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 2033
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 2036
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 2040
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 2043
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 2045
      if ($37 | 0) {
       $234 = HEAP32[953] | 0; //@line 2048
       $235 = $37 >>> 3; //@line 2049
       $237 = 3832 + ($235 << 1 << 2) | 0; //@line 2051
       $238 = 1 << $235; //@line 2052
       if (!($8 & $238)) {
        HEAP32[948] = $8 | $238; //@line 2057
        $$0189$i = $237; //@line 2059
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 2059
       } else {
        $242 = $237 + 8 | 0; //@line 2061
        $243 = HEAP32[$242 >> 2] | 0; //@line 2062
        if ((HEAP32[952] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 2066
        } else {
         $$0189$i = $243; //@line 2069
         $$pre$phi$iZ2D = $242; //@line 2069
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 2072
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 2074
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 2076
       HEAP32[$234 + 12 >> 2] = $237; //@line 2078
      }
      HEAP32[950] = $$0193$lcssa$i; //@line 2080
      HEAP32[953] = $159; //@line 2081
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 2084
     STACKTOP = sp; //@line 2085
     return $$0 | 0; //@line 2085
    }
   } else {
    $$0197 = $6; //@line 2088
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 2093
   } else {
    $251 = $0 + 11 | 0; //@line 2095
    $252 = $251 & -8; //@line 2096
    $253 = HEAP32[949] | 0; //@line 2097
    if (!$253) {
     $$0197 = $252; //@line 2100
    } else {
     $255 = 0 - $252 | 0; //@line 2102
     $256 = $251 >>> 8; //@line 2103
     if (!$256) {
      $$0358$i = 0; //@line 2106
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 2110
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 2114
       $262 = $256 << $261; //@line 2115
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 2118
       $267 = $262 << $265; //@line 2120
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 2123
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 2128
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 2134
      }
     }
     $282 = HEAP32[4096 + ($$0358$i << 2) >> 2] | 0; //@line 2138
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 2142
       $$3$i203 = 0; //@line 2142
       $$3350$i = $255; //@line 2142
       label = 81; //@line 2143
      } else {
       $$0342$i = 0; //@line 2150
       $$0347$i = $255; //@line 2150
       $$0353$i = $282; //@line 2150
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 2150
       $$0362$i = 0; //@line 2150
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 2155
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 2160
          $$435113$i = 0; //@line 2160
          $$435712$i = $$0353$i; //@line 2160
          label = 85; //@line 2161
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 2164
          $$1348$i = $292; //@line 2164
         }
        } else {
         $$1343$i = $$0342$i; //@line 2167
         $$1348$i = $$0347$i; //@line 2167
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 2170
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 2173
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 2177
        $302 = ($$0353$i | 0) == 0; //@line 2178
        if ($302) {
         $$2355$i = $$1363$i; //@line 2183
         $$3$i203 = $$1343$i; //@line 2183
         $$3350$i = $$1348$i; //@line 2183
         label = 81; //@line 2184
         break;
        } else {
         $$0342$i = $$1343$i; //@line 2187
         $$0347$i = $$1348$i; //@line 2187
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 2187
         $$0362$i = $$1363$i; //@line 2187
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 2197
       $309 = $253 & ($306 | 0 - $306); //@line 2200
       if (!$309) {
        $$0197 = $252; //@line 2203
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 2208
       $315 = $313 >>> 12 & 16; //@line 2210
       $316 = $313 >>> $315; //@line 2211
       $318 = $316 >>> 5 & 8; //@line 2213
       $320 = $316 >>> $318; //@line 2215
       $322 = $320 >>> 2 & 4; //@line 2217
       $324 = $320 >>> $322; //@line 2219
       $326 = $324 >>> 1 & 2; //@line 2221
       $328 = $324 >>> $326; //@line 2223
       $330 = $328 >>> 1 & 1; //@line 2225
       $$4$ph$i = 0; //@line 2231
       $$4357$ph$i = HEAP32[4096 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 2231
      } else {
       $$4$ph$i = $$3$i203; //@line 2233
       $$4357$ph$i = $$2355$i; //@line 2233
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 2237
       $$4351$lcssa$i = $$3350$i; //@line 2237
      } else {
       $$414$i = $$4$ph$i; //@line 2239
       $$435113$i = $$3350$i; //@line 2239
       $$435712$i = $$4357$ph$i; //@line 2239
       label = 85; //@line 2240
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 2245
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 2249
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 2250
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 2251
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 2252
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2258
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 2261
        $$4351$lcssa$i = $$$4351$i; //@line 2261
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 2264
        $$435113$i = $$$4351$i; //@line 2264
        label = 85; //@line 2265
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 2271
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[950] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[952] | 0; //@line 2277
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 2280
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 2283
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 2286
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 2290
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 2292
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 2296
         $371 = HEAP32[$370 >> 2] | 0; //@line 2297
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 2300
          $374 = HEAP32[$373 >> 2] | 0; //@line 2301
          if (!$374) {
           $$3372$i = 0; //@line 2304
           break;
          } else {
           $$1370$i = $374; //@line 2307
           $$1374$i = $373; //@line 2307
          }
         } else {
          $$1370$i = $371; //@line 2310
          $$1374$i = $370; //@line 2310
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 2313
          $377 = HEAP32[$376 >> 2] | 0; //@line 2314
          if ($377 | 0) {
           $$1370$i = $377; //@line 2317
           $$1374$i = $376; //@line 2317
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 2320
          $380 = HEAP32[$379 >> 2] | 0; //@line 2321
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 2326
           $$1374$i = $379; //@line 2326
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 2331
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 2334
          $$3372$i = $$1370$i; //@line 2335
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 2340
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 2343
         }
         $364 = $362 + 12 | 0; //@line 2346
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 2350
         }
         $367 = $359 + 8 | 0; //@line 2353
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 2357
          HEAP32[$367 >> 2] = $362; //@line 2358
          $$3372$i = $359; //@line 2359
          break;
         } else {
          _abort(); //@line 2362
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 2370
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 2373
         $386 = 4096 + ($385 << 2) | 0; //@line 2374
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 2379
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 2384
            HEAP32[949] = $391; //@line 2385
            $475 = $391; //@line 2386
            break L164;
           }
          } else {
           if ((HEAP32[952] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 2393
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 2401
            if (!$$3372$i) {
             $475 = $253; //@line 2404
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[952] | 0; //@line 2412
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 2415
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 2419
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 2421
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 2427
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 2431
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 2433
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 2439
         if (!$409) {
          $475 = $253; //@line 2442
         } else {
          if ((HEAP32[952] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 2447
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 2451
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 2453
           $475 = $253; //@line 2454
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 2463
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 2466
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 2468
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 2471
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 2475
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 2478
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 2480
         $428 = $$4351$lcssa$i >>> 3; //@line 2481
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 3832 + ($428 << 1 << 2) | 0; //@line 2485
          $432 = HEAP32[948] | 0; //@line 2486
          $433 = 1 << $428; //@line 2487
          if (!($432 & $433)) {
           HEAP32[948] = $432 | $433; //@line 2492
           $$0368$i = $431; //@line 2494
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 2494
          } else {
           $437 = $431 + 8 | 0; //@line 2496
           $438 = HEAP32[$437 >> 2] | 0; //@line 2497
           if ((HEAP32[952] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 2501
           } else {
            $$0368$i = $438; //@line 2504
            $$pre$phi$i211Z2D = $437; //@line 2504
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 2507
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 2509
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 2511
          HEAP32[$354 + 12 >> 2] = $431; //@line 2513
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 2516
         if (!$444) {
          $$0361$i = 0; //@line 2519
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 2523
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 2527
           $450 = $444 << $449; //@line 2528
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 2531
           $455 = $450 << $453; //@line 2533
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 2536
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 2541
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 2547
          }
         }
         $469 = 4096 + ($$0361$i << 2) | 0; //@line 2550
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 2552
         $471 = $354 + 16 | 0; //@line 2553
         HEAP32[$471 + 4 >> 2] = 0; //@line 2555
         HEAP32[$471 >> 2] = 0; //@line 2556
         $473 = 1 << $$0361$i; //@line 2557
         if (!($475 & $473)) {
          HEAP32[949] = $475 | $473; //@line 2562
          HEAP32[$469 >> 2] = $354; //@line 2563
          HEAP32[$354 + 24 >> 2] = $469; //@line 2565
          HEAP32[$354 + 12 >> 2] = $354; //@line 2567
          HEAP32[$354 + 8 >> 2] = $354; //@line 2569
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 2578
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 2578
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 2585
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 2589
          $494 = HEAP32[$492 >> 2] | 0; //@line 2591
          if (!$494) {
           label = 136; //@line 2594
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 2597
           $$0345$i = $494; //@line 2597
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[952] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 2604
          } else {
           HEAP32[$492 >> 2] = $354; //@line 2607
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 2609
           HEAP32[$354 + 12 >> 2] = $354; //@line 2611
           HEAP32[$354 + 8 >> 2] = $354; //@line 2613
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 2618
          $502 = HEAP32[$501 >> 2] | 0; //@line 2619
          $503 = HEAP32[952] | 0; //@line 2620
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 2626
           HEAP32[$501 >> 2] = $354; //@line 2627
           HEAP32[$354 + 8 >> 2] = $502; //@line 2629
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 2631
           HEAP32[$354 + 24 >> 2] = 0; //@line 2633
           break;
          } else {
           _abort(); //@line 2636
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 2643
       STACKTOP = sp; //@line 2644
       return $$0 | 0; //@line 2644
      } else {
       $$0197 = $252; //@line 2646
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[950] | 0; //@line 2653
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 2656
  $515 = HEAP32[953] | 0; //@line 2657
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 2660
   HEAP32[953] = $517; //@line 2661
   HEAP32[950] = $514; //@line 2662
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 2665
   HEAP32[$515 + $512 >> 2] = $514; //@line 2667
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 2670
  } else {
   HEAP32[950] = 0; //@line 2672
   HEAP32[953] = 0; //@line 2673
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 2676
   $526 = $515 + $512 + 4 | 0; //@line 2678
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 2681
  }
  $$0 = $515 + 8 | 0; //@line 2684
  STACKTOP = sp; //@line 2685
  return $$0 | 0; //@line 2685
 }
 $530 = HEAP32[951] | 0; //@line 2687
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 2690
  HEAP32[951] = $532; //@line 2691
  $533 = HEAP32[954] | 0; //@line 2692
  $534 = $533 + $$0197 | 0; //@line 2693
  HEAP32[954] = $534; //@line 2694
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 2697
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 2700
  $$0 = $533 + 8 | 0; //@line 2702
  STACKTOP = sp; //@line 2703
  return $$0 | 0; //@line 2703
 }
 if (!(HEAP32[1066] | 0)) {
  HEAP32[1068] = 4096; //@line 2708
  HEAP32[1067] = 4096; //@line 2709
  HEAP32[1069] = -1; //@line 2710
  HEAP32[1070] = -1; //@line 2711
  HEAP32[1071] = 0; //@line 2712
  HEAP32[1059] = 0; //@line 2713
  HEAP32[1066] = $1 & -16 ^ 1431655768; //@line 2717
  $548 = 4096; //@line 2718
 } else {
  $548 = HEAP32[1068] | 0; //@line 2721
 }
 $545 = $$0197 + 48 | 0; //@line 2723
 $546 = $$0197 + 47 | 0; //@line 2724
 $547 = $548 + $546 | 0; //@line 2725
 $549 = 0 - $548 | 0; //@line 2726
 $550 = $547 & $549; //@line 2727
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 2730
  STACKTOP = sp; //@line 2731
  return $$0 | 0; //@line 2731
 }
 $552 = HEAP32[1058] | 0; //@line 2733
 if ($552 | 0) {
  $554 = HEAP32[1056] | 0; //@line 2736
  $555 = $554 + $550 | 0; //@line 2737
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 2742
   STACKTOP = sp; //@line 2743
   return $$0 | 0; //@line 2743
  }
 }
 L244 : do {
  if (!(HEAP32[1059] & 4)) {
   $561 = HEAP32[954] | 0; //@line 2751
   L246 : do {
    if (!$561) {
     label = 163; //@line 2755
    } else {
     $$0$i$i = 4240; //@line 2757
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 2759
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 2762
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 2771
      if (!$570) {
       label = 163; //@line 2774
       break L246;
      } else {
       $$0$i$i = $570; //@line 2777
      }
     }
     $595 = $547 - $530 & $549; //@line 2781
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 2784
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 2792
       } else {
        $$723947$i = $595; //@line 2794
        $$748$i = $597; //@line 2794
        label = 180; //@line 2795
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 2799
       $$2253$ph$i = $595; //@line 2799
       label = 171; //@line 2800
      }
     } else {
      $$2234243136$i = 0; //@line 2803
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 2809
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 2812
     } else {
      $574 = $572; //@line 2814
      $575 = HEAP32[1067] | 0; //@line 2815
      $576 = $575 + -1 | 0; //@line 2816
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 2824
      $584 = HEAP32[1056] | 0; //@line 2825
      $585 = $$$i + $584 | 0; //@line 2826
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1058] | 0; //@line 2831
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 2838
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 2842
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 2845
        $$748$i = $572; //@line 2845
        label = 180; //@line 2846
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 2849
        $$2253$ph$i = $$$i; //@line 2849
        label = 171; //@line 2850
       }
      } else {
       $$2234243136$i = 0; //@line 2853
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 2860
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 2869
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 2872
       $$748$i = $$2247$ph$i; //@line 2872
       label = 180; //@line 2873
       break L244;
      }
     }
     $607 = HEAP32[1068] | 0; //@line 2877
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 2881
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 2884
      $$748$i = $$2247$ph$i; //@line 2884
      label = 180; //@line 2885
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 2891
      $$2234243136$i = 0; //@line 2892
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 2896
      $$748$i = $$2247$ph$i; //@line 2896
      label = 180; //@line 2897
      break L244;
     }
    }
   } while (0);
   HEAP32[1059] = HEAP32[1059] | 4; //@line 2904
   $$4236$i = $$2234243136$i; //@line 2905
   label = 178; //@line 2906
  } else {
   $$4236$i = 0; //@line 2908
   label = 178; //@line 2909
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 2915
   $621 = _sbrk(0) | 0; //@line 2916
   $627 = $621 - $620 | 0; //@line 2924
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 2926
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 2934
    $$748$i = $620; //@line 2934
    label = 180; //@line 2935
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1056] | 0) + $$723947$i | 0; //@line 2941
  HEAP32[1056] = $633; //@line 2942
  if ($633 >>> 0 > (HEAP32[1057] | 0) >>> 0) {
   HEAP32[1057] = $633; //@line 2946
  }
  $636 = HEAP32[954] | 0; //@line 2948
  do {
   if (!$636) {
    $638 = HEAP32[952] | 0; //@line 2952
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[952] = $$748$i; //@line 2957
    }
    HEAP32[1060] = $$748$i; //@line 2959
    HEAP32[1061] = $$723947$i; //@line 2960
    HEAP32[1063] = 0; //@line 2961
    HEAP32[957] = HEAP32[1066]; //@line 2963
    HEAP32[956] = -1; //@line 2964
    HEAP32[961] = 3832; //@line 2965
    HEAP32[960] = 3832; //@line 2966
    HEAP32[963] = 3840; //@line 2967
    HEAP32[962] = 3840; //@line 2968
    HEAP32[965] = 3848; //@line 2969
    HEAP32[964] = 3848; //@line 2970
    HEAP32[967] = 3856; //@line 2971
    HEAP32[966] = 3856; //@line 2972
    HEAP32[969] = 3864; //@line 2973
    HEAP32[968] = 3864; //@line 2974
    HEAP32[971] = 3872; //@line 2975
    HEAP32[970] = 3872; //@line 2976
    HEAP32[973] = 3880; //@line 2977
    HEAP32[972] = 3880; //@line 2978
    HEAP32[975] = 3888; //@line 2979
    HEAP32[974] = 3888; //@line 2980
    HEAP32[977] = 3896; //@line 2981
    HEAP32[976] = 3896; //@line 2982
    HEAP32[979] = 3904; //@line 2983
    HEAP32[978] = 3904; //@line 2984
    HEAP32[981] = 3912; //@line 2985
    HEAP32[980] = 3912; //@line 2986
    HEAP32[983] = 3920; //@line 2987
    HEAP32[982] = 3920; //@line 2988
    HEAP32[985] = 3928; //@line 2989
    HEAP32[984] = 3928; //@line 2990
    HEAP32[987] = 3936; //@line 2991
    HEAP32[986] = 3936; //@line 2992
    HEAP32[989] = 3944; //@line 2993
    HEAP32[988] = 3944; //@line 2994
    HEAP32[991] = 3952; //@line 2995
    HEAP32[990] = 3952; //@line 2996
    HEAP32[993] = 3960; //@line 2997
    HEAP32[992] = 3960; //@line 2998
    HEAP32[995] = 3968; //@line 2999
    HEAP32[994] = 3968; //@line 3000
    HEAP32[997] = 3976; //@line 3001
    HEAP32[996] = 3976; //@line 3002
    HEAP32[999] = 3984; //@line 3003
    HEAP32[998] = 3984; //@line 3004
    HEAP32[1001] = 3992; //@line 3005
    HEAP32[1e3] = 3992; //@line 3006
    HEAP32[1003] = 4e3; //@line 3007
    HEAP32[1002] = 4e3; //@line 3008
    HEAP32[1005] = 4008; //@line 3009
    HEAP32[1004] = 4008; //@line 3010
    HEAP32[1007] = 4016; //@line 3011
    HEAP32[1006] = 4016; //@line 3012
    HEAP32[1009] = 4024; //@line 3013
    HEAP32[1008] = 4024; //@line 3014
    HEAP32[1011] = 4032; //@line 3015
    HEAP32[1010] = 4032; //@line 3016
    HEAP32[1013] = 4040; //@line 3017
    HEAP32[1012] = 4040; //@line 3018
    HEAP32[1015] = 4048; //@line 3019
    HEAP32[1014] = 4048; //@line 3020
    HEAP32[1017] = 4056; //@line 3021
    HEAP32[1016] = 4056; //@line 3022
    HEAP32[1019] = 4064; //@line 3023
    HEAP32[1018] = 4064; //@line 3024
    HEAP32[1021] = 4072; //@line 3025
    HEAP32[1020] = 4072; //@line 3026
    HEAP32[1023] = 4080; //@line 3027
    HEAP32[1022] = 4080; //@line 3028
    $642 = $$723947$i + -40 | 0; //@line 3029
    $644 = $$748$i + 8 | 0; //@line 3031
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 3036
    $650 = $$748$i + $649 | 0; //@line 3037
    $651 = $642 - $649 | 0; //@line 3038
    HEAP32[954] = $650; //@line 3039
    HEAP32[951] = $651; //@line 3040
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 3043
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 3046
    HEAP32[955] = HEAP32[1070]; //@line 3048
   } else {
    $$024367$i = 4240; //@line 3050
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 3052
     $658 = $$024367$i + 4 | 0; //@line 3053
     $659 = HEAP32[$658 >> 2] | 0; //@line 3054
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 3058
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 3062
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 3067
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 3081
       $673 = (HEAP32[951] | 0) + $$723947$i | 0; //@line 3083
       $675 = $636 + 8 | 0; //@line 3085
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 3090
       $681 = $636 + $680 | 0; //@line 3091
       $682 = $673 - $680 | 0; //@line 3092
       HEAP32[954] = $681; //@line 3093
       HEAP32[951] = $682; //@line 3094
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 3097
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 3100
       HEAP32[955] = HEAP32[1070]; //@line 3102
       break;
      }
     }
    }
    $688 = HEAP32[952] | 0; //@line 3107
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[952] = $$748$i; //@line 3110
     $753 = $$748$i; //@line 3111
    } else {
     $753 = $688; //@line 3113
    }
    $690 = $$748$i + $$723947$i | 0; //@line 3115
    $$124466$i = 4240; //@line 3116
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 3121
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 3125
     if (!$694) {
      $$0$i$i$i = 4240; //@line 3128
      break;
     } else {
      $$124466$i = $694; //@line 3131
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 3140
      $700 = $$124466$i + 4 | 0; //@line 3141
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 3144
      $704 = $$748$i + 8 | 0; //@line 3146
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 3152
      $712 = $690 + 8 | 0; //@line 3154
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 3160
      $722 = $710 + $$0197 | 0; //@line 3164
      $723 = $718 - $710 - $$0197 | 0; //@line 3165
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 3168
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[951] | 0) + $723 | 0; //@line 3173
        HEAP32[951] = $728; //@line 3174
        HEAP32[954] = $722; //@line 3175
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 3178
       } else {
        if ((HEAP32[953] | 0) == ($718 | 0)) {
         $734 = (HEAP32[950] | 0) + $723 | 0; //@line 3184
         HEAP32[950] = $734; //@line 3185
         HEAP32[953] = $722; //@line 3186
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 3189
         HEAP32[$722 + $734 >> 2] = $734; //@line 3191
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 3195
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 3199
         $743 = $739 >>> 3; //@line 3200
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 3205
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 3207
           $750 = 3832 + ($743 << 1 << 2) | 0; //@line 3209
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 3215
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 3224
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[948] = HEAP32[948] & ~(1 << $743); //@line 3234
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 3241
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 3245
             }
             $764 = $748 + 8 | 0; //@line 3248
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 3252
              break;
             }
             _abort(); //@line 3255
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 3260
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 3261
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 3264
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 3266
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 3270
             $783 = $782 + 4 | 0; //@line 3271
             $784 = HEAP32[$783 >> 2] | 0; //@line 3272
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 3275
              if (!$786) {
               $$3$i$i = 0; //@line 3278
               break;
              } else {
               $$1291$i$i = $786; //@line 3281
               $$1293$i$i = $782; //@line 3281
              }
             } else {
              $$1291$i$i = $784; //@line 3284
              $$1293$i$i = $783; //@line 3284
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 3287
              $789 = HEAP32[$788 >> 2] | 0; //@line 3288
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 3291
               $$1293$i$i = $788; //@line 3291
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 3294
              $792 = HEAP32[$791 >> 2] | 0; //@line 3295
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 3300
               $$1293$i$i = $791; //@line 3300
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 3305
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 3308
              $$3$i$i = $$1291$i$i; //@line 3309
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 3314
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 3317
             }
             $776 = $774 + 12 | 0; //@line 3320
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 3324
             }
             $779 = $771 + 8 | 0; //@line 3327
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 3331
              HEAP32[$779 >> 2] = $774; //@line 3332
              $$3$i$i = $771; //@line 3333
              break;
             } else {
              _abort(); //@line 3336
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 3346
           $798 = 4096 + ($797 << 2) | 0; //@line 3347
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 3352
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[949] = HEAP32[949] & ~(1 << $797); //@line 3361
             break L311;
            } else {
             if ((HEAP32[952] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 3367
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 3375
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[952] | 0; //@line 3385
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 3388
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 3392
           $815 = $718 + 16 | 0; //@line 3393
           $816 = HEAP32[$815 >> 2] | 0; //@line 3394
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 3400
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 3404
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 3406
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 3412
           if (!$822) {
            break;
           }
           if ((HEAP32[952] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 3420
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 3424
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 3426
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 3433
         $$0287$i$i = $742 + $723 | 0; //@line 3433
        } else {
         $$0$i17$i = $718; //@line 3435
         $$0287$i$i = $723; //@line 3435
        }
        $830 = $$0$i17$i + 4 | 0; //@line 3437
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 3440
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 3443
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 3445
        $836 = $$0287$i$i >>> 3; //@line 3446
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 3832 + ($836 << 1 << 2) | 0; //@line 3450
         $840 = HEAP32[948] | 0; //@line 3451
         $841 = 1 << $836; //@line 3452
         do {
          if (!($840 & $841)) {
           HEAP32[948] = $840 | $841; //@line 3458
           $$0295$i$i = $839; //@line 3460
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 3460
          } else {
           $845 = $839 + 8 | 0; //@line 3462
           $846 = HEAP32[$845 >> 2] | 0; //@line 3463
           if ((HEAP32[952] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 3467
            $$pre$phi$i19$iZ2D = $845; //@line 3467
            break;
           }
           _abort(); //@line 3470
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 3474
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 3476
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 3478
         HEAP32[$722 + 12 >> 2] = $839; //@line 3480
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 3483
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 3487
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 3491
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 3496
          $858 = $852 << $857; //@line 3497
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 3500
          $863 = $858 << $861; //@line 3502
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 3505
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 3510
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 3516
         }
        } while (0);
        $877 = 4096 + ($$0296$i$i << 2) | 0; //@line 3519
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 3521
        $879 = $722 + 16 | 0; //@line 3522
        HEAP32[$879 + 4 >> 2] = 0; //@line 3524
        HEAP32[$879 >> 2] = 0; //@line 3525
        $881 = HEAP32[949] | 0; //@line 3526
        $882 = 1 << $$0296$i$i; //@line 3527
        if (!($881 & $882)) {
         HEAP32[949] = $881 | $882; //@line 3532
         HEAP32[$877 >> 2] = $722; //@line 3533
         HEAP32[$722 + 24 >> 2] = $877; //@line 3535
         HEAP32[$722 + 12 >> 2] = $722; //@line 3537
         HEAP32[$722 + 8 >> 2] = $722; //@line 3539
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 3548
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 3548
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 3555
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 3559
         $902 = HEAP32[$900 >> 2] | 0; //@line 3561
         if (!$902) {
          label = 260; //@line 3564
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 3567
          $$0289$i$i = $902; //@line 3567
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[952] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 3574
         } else {
          HEAP32[$900 >> 2] = $722; //@line 3577
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 3579
          HEAP32[$722 + 12 >> 2] = $722; //@line 3581
          HEAP32[$722 + 8 >> 2] = $722; //@line 3583
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 3588
         $910 = HEAP32[$909 >> 2] | 0; //@line 3589
         $911 = HEAP32[952] | 0; //@line 3590
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 3596
          HEAP32[$909 >> 2] = $722; //@line 3597
          HEAP32[$722 + 8 >> 2] = $910; //@line 3599
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 3601
          HEAP32[$722 + 24 >> 2] = 0; //@line 3603
          break;
         } else {
          _abort(); //@line 3606
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 3613
      STACKTOP = sp; //@line 3614
      return $$0 | 0; //@line 3614
     } else {
      $$0$i$i$i = 4240; //@line 3616
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 3620
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 3625
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 3633
    }
    $927 = $923 + -47 | 0; //@line 3635
    $929 = $927 + 8 | 0; //@line 3637
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 3643
    $936 = $636 + 16 | 0; //@line 3644
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 3646
    $939 = $938 + 8 | 0; //@line 3647
    $940 = $938 + 24 | 0; //@line 3648
    $941 = $$723947$i + -40 | 0; //@line 3649
    $943 = $$748$i + 8 | 0; //@line 3651
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 3656
    $949 = $$748$i + $948 | 0; //@line 3657
    $950 = $941 - $948 | 0; //@line 3658
    HEAP32[954] = $949; //@line 3659
    HEAP32[951] = $950; //@line 3660
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 3663
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 3666
    HEAP32[955] = HEAP32[1070]; //@line 3668
    $956 = $938 + 4 | 0; //@line 3669
    HEAP32[$956 >> 2] = 27; //@line 3670
    HEAP32[$939 >> 2] = HEAP32[1060]; //@line 3671
    HEAP32[$939 + 4 >> 2] = HEAP32[1061]; //@line 3671
    HEAP32[$939 + 8 >> 2] = HEAP32[1062]; //@line 3671
    HEAP32[$939 + 12 >> 2] = HEAP32[1063]; //@line 3671
    HEAP32[1060] = $$748$i; //@line 3672
    HEAP32[1061] = $$723947$i; //@line 3673
    HEAP32[1063] = 0; //@line 3674
    HEAP32[1062] = $939; //@line 3675
    $958 = $940; //@line 3676
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 3678
     HEAP32[$958 >> 2] = 7; //@line 3679
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 3692
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 3695
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 3698
     HEAP32[$938 >> 2] = $964; //@line 3699
     $969 = $964 >>> 3; //@line 3700
     if ($964 >>> 0 < 256) {
      $972 = 3832 + ($969 << 1 << 2) | 0; //@line 3704
      $973 = HEAP32[948] | 0; //@line 3705
      $974 = 1 << $969; //@line 3706
      if (!($973 & $974)) {
       HEAP32[948] = $973 | $974; //@line 3711
       $$0211$i$i = $972; //@line 3713
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 3713
      } else {
       $978 = $972 + 8 | 0; //@line 3715
       $979 = HEAP32[$978 >> 2] | 0; //@line 3716
       if ((HEAP32[952] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 3720
       } else {
        $$0211$i$i = $979; //@line 3723
        $$pre$phi$i$iZ2D = $978; //@line 3723
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 3726
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 3728
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 3730
      HEAP32[$636 + 12 >> 2] = $972; //@line 3732
      break;
     }
     $985 = $964 >>> 8; //@line 3735
     if (!$985) {
      $$0212$i$i = 0; //@line 3738
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 3742
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 3746
       $991 = $985 << $990; //@line 3747
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 3750
       $996 = $991 << $994; //@line 3752
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 3755
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 3760
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 3766
      }
     }
     $1010 = 4096 + ($$0212$i$i << 2) | 0; //@line 3769
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 3771
     HEAP32[$636 + 20 >> 2] = 0; //@line 3773
     HEAP32[$936 >> 2] = 0; //@line 3774
     $1013 = HEAP32[949] | 0; //@line 3775
     $1014 = 1 << $$0212$i$i; //@line 3776
     if (!($1013 & $1014)) {
      HEAP32[949] = $1013 | $1014; //@line 3781
      HEAP32[$1010 >> 2] = $636; //@line 3782
      HEAP32[$636 + 24 >> 2] = $1010; //@line 3784
      HEAP32[$636 + 12 >> 2] = $636; //@line 3786
      HEAP32[$636 + 8 >> 2] = $636; //@line 3788
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 3797
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 3797
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 3804
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 3808
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 3810
      if (!$1034) {
       label = 286; //@line 3813
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 3816
       $$0207$i$i = $1034; //@line 3816
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[952] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 3823
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 3826
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 3828
       HEAP32[$636 + 12 >> 2] = $636; //@line 3830
       HEAP32[$636 + 8 >> 2] = $636; //@line 3832
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 3837
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 3838
      $1043 = HEAP32[952] | 0; //@line 3839
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 3845
       HEAP32[$1041 >> 2] = $636; //@line 3846
       HEAP32[$636 + 8 >> 2] = $1042; //@line 3848
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 3850
       HEAP32[$636 + 24 >> 2] = 0; //@line 3852
       break;
      } else {
       _abort(); //@line 3855
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[951] | 0; //@line 3862
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 3865
   HEAP32[951] = $1054; //@line 3866
   $1055 = HEAP32[954] | 0; //@line 3867
   $1056 = $1055 + $$0197 | 0; //@line 3868
   HEAP32[954] = $1056; //@line 3869
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 3872
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 3875
   $$0 = $1055 + 8 | 0; //@line 3877
   STACKTOP = sp; //@line 3878
   return $$0 | 0; //@line 3878
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 3882
 $$0 = 0; //@line 3883
 STACKTOP = sp; //@line 3884
 return $$0 | 0; //@line 3884
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7370
 STACKTOP = STACKTOP + 560 | 0; //@line 7371
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 7371
 $6 = sp + 8 | 0; //@line 7372
 $7 = sp; //@line 7373
 $8 = sp + 524 | 0; //@line 7374
 $9 = $8; //@line 7375
 $10 = sp + 512 | 0; //@line 7376
 HEAP32[$7 >> 2] = 0; //@line 7377
 $11 = $10 + 12 | 0; //@line 7378
 ___DOUBLE_BITS_677($1) | 0; //@line 7379
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 7384
  $$0520 = 1; //@line 7384
  $$0521 = 1530; //@line 7384
 } else {
  $$0471 = $1; //@line 7395
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 7395
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 1531 : 1536 : 1533; //@line 7395
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 7397
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 7406
   $31 = $$0520 + 3 | 0; //@line 7411
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 7413
   _out_670($0, $$0521, $$0520); //@line 7414
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 1557 : 1561 : $27 ? 1549 : 1553, 3); //@line 7415
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 7417
   $$sink560 = $31; //@line 7418
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 7421
   $36 = $35 != 0.0; //@line 7422
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 7426
   }
   $39 = $5 | 32; //@line 7428
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 7431
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 7434
    $44 = $$0520 | 2; //@line 7435
    $46 = 12 - $3 | 0; //@line 7437
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 7442
     } else {
      $$0509585 = 8.0; //@line 7444
      $$1508586 = $46; //@line 7444
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 7446
       $$0509585 = $$0509585 * 16.0; //@line 7447
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 7462
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 7467
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 7472
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 7475
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 7478
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 7481
     HEAP8[$68 >> 0] = 48; //@line 7482
     $$0511 = $68; //@line 7483
    } else {
     $$0511 = $66; //@line 7485
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 7492
    $76 = $$0511 + -2 | 0; //@line 7495
    HEAP8[$76 >> 0] = $5 + 15; //@line 7496
    $77 = ($3 | 0) < 1; //@line 7497
    $79 = ($4 & 8 | 0) == 0; //@line 7499
    $$0523 = $8; //@line 7500
    $$2473 = $$1472; //@line 7500
    while (1) {
     $80 = ~~$$2473; //@line 7502
     $86 = $$0523 + 1 | 0; //@line 7508
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[1565 + $80 >> 0]; //@line 7509
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 7512
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 7521
      } else {
       HEAP8[$86 >> 0] = 46; //@line 7524
       $$1524 = $$0523 + 2 | 0; //@line 7525
      }
     } else {
      $$1524 = $86; //@line 7528
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 7532
     }
    }
    $$pre693 = $$1524; //@line 7538
    if (!$3) {
     label = 24; //@line 7540
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 7548
      $$sink = $3 + 2 | 0; //@line 7548
     } else {
      label = 24; //@line 7550
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 7554
     $$pre$phi691Z2D = $101; //@line 7555
     $$sink = $101; //@line 7555
    }
    $104 = $11 - $76 | 0; //@line 7559
    $106 = $104 + $44 + $$sink | 0; //@line 7561
    _pad_676($0, 32, $2, $106, $4); //@line 7562
    _out_670($0, $$0521$, $44); //@line 7563
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 7565
    _out_670($0, $8, $$pre$phi691Z2D); //@line 7566
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 7568
    _out_670($0, $76, $104); //@line 7569
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 7571
    $$sink560 = $106; //@line 7572
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 7576
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 7580
    HEAP32[$7 >> 2] = $113; //@line 7581
    $$3 = $35 * 268435456.0; //@line 7582
    $$pr = $113; //@line 7582
   } else {
    $$3 = $35; //@line 7585
    $$pr = HEAP32[$7 >> 2] | 0; //@line 7585
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 7589
   $$0498 = $$561; //@line 7590
   $$4 = $$3; //@line 7590
   do {
    $116 = ~~$$4 >>> 0; //@line 7592
    HEAP32[$$0498 >> 2] = $116; //@line 7593
    $$0498 = $$0498 + 4 | 0; //@line 7594
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 7597
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 7607
    $$1499662 = $$0498; //@line 7607
    $124 = $$pr; //@line 7607
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 7610
     $$0488655 = $$1499662 + -4 | 0; //@line 7611
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 7614
     } else {
      $$0488657 = $$0488655; //@line 7616
      $$0497656 = 0; //@line 7616
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 7619
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 7621
       $131 = tempRet0; //@line 7622
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 7623
       HEAP32[$$0488657 >> 2] = $132; //@line 7625
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 7626
       $$0488657 = $$0488657 + -4 | 0; //@line 7628
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 7638
      } else {
       $138 = $$1482663 + -4 | 0; //@line 7640
       HEAP32[$138 >> 2] = $$0497656; //@line 7641
       $$2483$ph = $138; //@line 7642
      }
     }
     $$2500 = $$1499662; //@line 7645
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 7651
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 7655
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 7661
     HEAP32[$7 >> 2] = $144; //@line 7662
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 7665
      $$1499662 = $$2500; //@line 7665
      $124 = $144; //@line 7665
     } else {
      $$1482$lcssa = $$2483$ph; //@line 7667
      $$1499$lcssa = $$2500; //@line 7667
      $$pr566 = $144; //@line 7667
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 7672
    $$1499$lcssa = $$0498; //@line 7672
    $$pr566 = $$pr; //@line 7672
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 7678
    $150 = ($39 | 0) == 102; //@line 7679
    $$3484650 = $$1482$lcssa; //@line 7680
    $$3501649 = $$1499$lcssa; //@line 7680
    $152 = $$pr566; //@line 7680
    while (1) {
     $151 = 0 - $152 | 0; //@line 7682
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 7684
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 7688
      $161 = 1e9 >>> $154; //@line 7689
      $$0487644 = 0; //@line 7690
      $$1489643 = $$3484650; //@line 7690
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 7692
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 7696
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 7697
       $$1489643 = $$1489643 + 4 | 0; //@line 7698
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 7709
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 7712
       $$4502 = $$3501649; //@line 7712
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 7715
       $$$3484700 = $$$3484; //@line 7716
       $$4502 = $$3501649 + 4 | 0; //@line 7716
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 7723
      $$4502 = $$3501649; //@line 7723
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 7725
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 7732
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 7734
     HEAP32[$7 >> 2] = $152; //@line 7735
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 7740
      $$3501$lcssa = $$$4502; //@line 7740
      break;
     } else {
      $$3484650 = $$$3484700; //@line 7738
      $$3501649 = $$$4502; //@line 7738
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 7745
    $$3501$lcssa = $$1499$lcssa; //@line 7745
   }
   $185 = $$561; //@line 7748
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 7753
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 7754
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 7757
    } else {
     $$0514639 = $189; //@line 7759
     $$0530638 = 10; //@line 7759
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 7761
      $193 = $$0514639 + 1 | 0; //@line 7762
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 7765
       break;
      } else {
       $$0514639 = $193; //@line 7768
      }
     }
    }
   } else {
    $$1515 = 0; //@line 7773
   }
   $198 = ($39 | 0) == 103; //@line 7778
   $199 = ($$540 | 0) != 0; //@line 7779
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 7782
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 7791
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 7794
    $213 = ($209 | 0) % 9 | 0; //@line 7795
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 7798
     $$1531632 = 10; //@line 7798
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 7801
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 7804
       $$1531632 = $215; //@line 7804
      } else {
       $$1531$lcssa = $215; //@line 7806
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 7811
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 7813
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 7814
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 7817
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 7820
     $$4518 = $$1515; //@line 7820
     $$8 = $$3484$lcssa; //@line 7820
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 7825
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 7826
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 7831
     if (!$$0520) {
      $$1467 = $$$564; //@line 7834
      $$1469 = $$543; //@line 7834
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 7837
      $$1467 = $230 ? -$$$564 : $$$564; //@line 7842
      $$1469 = $230 ? -$$543 : $$543; //@line 7842
     }
     $233 = $217 - $218 | 0; //@line 7844
     HEAP32[$212 >> 2] = $233; //@line 7845
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 7849
      HEAP32[$212 >> 2] = $236; //@line 7850
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 7853
       $$sink547625 = $212; //@line 7853
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 7855
        HEAP32[$$sink547625 >> 2] = 0; //@line 7856
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 7859
         HEAP32[$240 >> 2] = 0; //@line 7860
         $$6 = $240; //@line 7861
        } else {
         $$6 = $$5486626; //@line 7863
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 7866
        HEAP32[$238 >> 2] = $242; //@line 7867
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 7870
         $$sink547625 = $238; //@line 7870
        } else {
         $$5486$lcssa = $$6; //@line 7872
         $$sink547$lcssa = $238; //@line 7872
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 7877
       $$sink547$lcssa = $212; //@line 7877
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 7882
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 7883
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 7886
       $$4518 = $247; //@line 7886
       $$8 = $$5486$lcssa; //@line 7886
      } else {
       $$2516621 = $247; //@line 7888
       $$2532620 = 10; //@line 7888
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 7890
        $251 = $$2516621 + 1 | 0; //@line 7891
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 7894
         $$4518 = $251; //@line 7894
         $$8 = $$5486$lcssa; //@line 7894
         break;
        } else {
         $$2516621 = $251; //@line 7897
        }
       }
      }
     } else {
      $$4492 = $212; //@line 7902
      $$4518 = $$1515; //@line 7902
      $$8 = $$3484$lcssa; //@line 7902
     }
    }
    $253 = $$4492 + 4 | 0; //@line 7905
    $$5519$ph = $$4518; //@line 7908
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 7908
    $$9$ph = $$8; //@line 7908
   } else {
    $$5519$ph = $$1515; //@line 7910
    $$7505$ph = $$3501$lcssa; //@line 7910
    $$9$ph = $$3484$lcssa; //@line 7910
   }
   $$7505 = $$7505$ph; //@line 7912
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 7916
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 7919
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 7923
    } else {
     $$lcssa675 = 1; //@line 7925
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 7929
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 7934
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 7942
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 7942
     } else {
      $$0479 = $5 + -2 | 0; //@line 7946
      $$2476 = $$540$ + -1 | 0; //@line 7946
     }
     $267 = $4 & 8; //@line 7948
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 7953
       if (!$270) {
        $$2529 = 9; //@line 7956
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 7961
         $$3533616 = 10; //@line 7961
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 7963
          $275 = $$1528617 + 1 | 0; //@line 7964
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 7970
           break;
          } else {
           $$1528617 = $275; //@line 7968
          }
         }
        } else {
         $$2529 = 0; //@line 7975
        }
       }
      } else {
       $$2529 = 9; //@line 7979
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 7987
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 7989
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 7991
       $$1480 = $$0479; //@line 7994
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 7994
       $$pre$phi698Z2D = 0; //@line 7994
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 7998
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 8000
       $$1480 = $$0479; //@line 8003
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 8003
       $$pre$phi698Z2D = 0; //@line 8003
       break;
      }
     } else {
      $$1480 = $$0479; //@line 8007
      $$3477 = $$2476; //@line 8007
      $$pre$phi698Z2D = $267; //@line 8007
     }
    } else {
     $$1480 = $5; //@line 8011
     $$3477 = $$540; //@line 8011
     $$pre$phi698Z2D = $4 & 8; //@line 8011
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 8014
   $294 = ($292 | 0) != 0 & 1; //@line 8016
   $296 = ($$1480 | 32 | 0) == 102; //@line 8018
   if ($296) {
    $$2513 = 0; //@line 8022
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 8022
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 8025
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 8028
    $304 = $11; //@line 8029
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 8034
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 8036
      HEAP8[$308 >> 0] = 48; //@line 8037
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 8042
      } else {
       $$1512$lcssa = $308; //@line 8044
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 8049
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 8056
    $318 = $$1512$lcssa + -2 | 0; //@line 8058
    HEAP8[$318 >> 0] = $$1480; //@line 8059
    $$2513 = $318; //@line 8062
    $$pn = $304 - $318 | 0; //@line 8062
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 8067
   _pad_676($0, 32, $2, $323, $4); //@line 8068
   _out_670($0, $$0521, $$0520); //@line 8069
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 8071
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 8074
    $326 = $8 + 9 | 0; //@line 8075
    $327 = $326; //@line 8076
    $328 = $8 + 8 | 0; //@line 8077
    $$5493600 = $$0496$$9; //@line 8078
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 8081
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 8086
       $$1465 = $328; //@line 8087
      } else {
       $$1465 = $330; //@line 8089
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 8096
       $$0464597 = $330; //@line 8097
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 8099
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 8102
        } else {
         $$1465 = $335; //@line 8104
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 8109
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 8114
     $$5493600 = $$5493600 + 4 | 0; //@line 8115
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 1581, 1); //@line 8125
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 8131
     $$6494592 = $$5493600; //@line 8131
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 8134
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 8139
       $$0463587 = $347; //@line 8140
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 8142
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 8145
        } else {
         $$0463$lcssa = $351; //@line 8147
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 8152
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 8156
      $$6494592 = $$6494592 + 4 | 0; //@line 8157
      $356 = $$4478593 + -9 | 0; //@line 8158
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 8165
       break;
      } else {
       $$4478593 = $356; //@line 8163
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 8170
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 8173
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 8176
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 8179
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 8180
     $365 = $363; //@line 8181
     $366 = 0 - $9 | 0; //@line 8182
     $367 = $8 + 8 | 0; //@line 8183
     $$5605 = $$3477; //@line 8184
     $$7495604 = $$9$ph; //@line 8184
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 8187
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 8190
       $$0 = $367; //@line 8191
      } else {
       $$0 = $369; //@line 8193
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 8198
        _out_670($0, $$0, 1); //@line 8199
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 8203
         break;
        }
        _out_670($0, 1581, 1); //@line 8206
        $$2 = $375; //@line 8207
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 8211
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 8216
        $$1601 = $$0; //@line 8217
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 8219
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 8222
         } else {
          $$2 = $373; //@line 8224
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 8231
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 8234
      $381 = $$5605 - $378 | 0; //@line 8235
      $$7495604 = $$7495604 + 4 | 0; //@line 8236
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 8243
       break;
      } else {
       $$5605 = $381; //@line 8241
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 8248
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 8251
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 8255
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 8258
   $$sink560 = $323; //@line 8259
  }
 } while (0);
 STACKTOP = sp; //@line 8264
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 8264
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 5942
 STACKTOP = STACKTOP + 64 | 0; //@line 5943
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 5943
 $5 = sp + 16 | 0; //@line 5944
 $6 = sp; //@line 5945
 $7 = sp + 24 | 0; //@line 5946
 $8 = sp + 8 | 0; //@line 5947
 $9 = sp + 20 | 0; //@line 5948
 HEAP32[$5 >> 2] = $1; //@line 5949
 $10 = ($0 | 0) != 0; //@line 5950
 $11 = $7 + 40 | 0; //@line 5951
 $12 = $11; //@line 5952
 $13 = $7 + 39 | 0; //@line 5953
 $14 = $8 + 4 | 0; //@line 5954
 $$0243 = 0; //@line 5955
 $$0247 = 0; //@line 5955
 $$0269 = 0; //@line 5955
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 5964
     $$1248 = -1; //@line 5965
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 5969
     break;
    }
   } else {
    $$1248 = $$0247; //@line 5973
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 5976
  $21 = HEAP8[$20 >> 0] | 0; //@line 5977
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 5980
   break;
  } else {
   $23 = $21; //@line 5983
   $25 = $20; //@line 5983
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 5988
     $27 = $25; //@line 5988
     label = 9; //@line 5989
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 5994
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 6001
   HEAP32[$5 >> 2] = $24; //@line 6002
   $23 = HEAP8[$24 >> 0] | 0; //@line 6004
   $25 = $24; //@line 6004
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 6009
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 6014
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 6017
     $27 = $27 + 2 | 0; //@line 6018
     HEAP32[$5 >> 2] = $27; //@line 6019
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 6026
      break;
     } else {
      $$0249303 = $30; //@line 6023
      label = 9; //@line 6024
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 6034
  if ($10) {
   _out_670($0, $20, $36); //@line 6036
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 6040
   $$0247 = $$1248; //@line 6040
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 6048
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 6049
  if ($43) {
   $$0253 = -1; //@line 6051
   $$1270 = $$0269; //@line 6051
   $$sink = 1; //@line 6051
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 6061
    $$1270 = 1; //@line 6061
    $$sink = 3; //@line 6061
   } else {
    $$0253 = -1; //@line 6063
    $$1270 = $$0269; //@line 6063
    $$sink = 1; //@line 6063
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 6066
  HEAP32[$5 >> 2] = $51; //@line 6067
  $52 = HEAP8[$51 >> 0] | 0; //@line 6068
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 6070
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 6077
   $$lcssa291 = $52; //@line 6077
   $$lcssa292 = $51; //@line 6077
  } else {
   $$0262309 = 0; //@line 6079
   $60 = $52; //@line 6079
   $65 = $51; //@line 6079
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 6084
    $64 = $65 + 1 | 0; //@line 6085
    HEAP32[$5 >> 2] = $64; //@line 6086
    $66 = HEAP8[$64 >> 0] | 0; //@line 6087
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 6089
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 6096
     $$lcssa291 = $66; //@line 6096
     $$lcssa292 = $64; //@line 6096
     break;
    } else {
     $$0262309 = $63; //@line 6099
     $60 = $66; //@line 6099
     $65 = $64; //@line 6099
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 6111
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 6113
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 6118
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 6123
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 6135
     $$2271 = 1; //@line 6135
     $storemerge274 = $79 + 3 | 0; //@line 6135
    } else {
     label = 23; //@line 6137
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 6141
    if ($$1270 | 0) {
     $$0 = -1; //@line 6144
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6159
     $106 = HEAP32[$105 >> 2] | 0; //@line 6160
     HEAP32[$2 >> 2] = $105 + 4; //@line 6162
     $363 = $106; //@line 6163
    } else {
     $363 = 0; //@line 6165
    }
    $$0259 = $363; //@line 6169
    $$2271 = 0; //@line 6169
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 6169
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 6171
   $109 = ($$0259 | 0) < 0; //@line 6172
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 6177
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 6177
   $$3272 = $$2271; //@line 6177
   $115 = $storemerge274; //@line 6177
  } else {
   $112 = _getint_671($5) | 0; //@line 6179
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 6182
    break;
   }
   $$1260 = $112; //@line 6186
   $$1263 = $$0262$lcssa; //@line 6186
   $$3272 = $$1270; //@line 6186
   $115 = HEAP32[$5 >> 2] | 0; //@line 6186
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 6197
     $156 = _getint_671($5) | 0; //@line 6198
     $$0254 = $156; //@line 6200
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 6200
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 6209
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 6214
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 6219
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 6226
      $144 = $125 + 4 | 0; //@line 6230
      HEAP32[$5 >> 2] = $144; //@line 6231
      $$0254 = $140; //@line 6232
      $$pre345 = $144; //@line 6232
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 6238
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6253
     $152 = HEAP32[$151 >> 2] | 0; //@line 6254
     HEAP32[$2 >> 2] = $151 + 4; //@line 6256
     $364 = $152; //@line 6257
    } else {
     $364 = 0; //@line 6259
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 6262
    HEAP32[$5 >> 2] = $154; //@line 6263
    $$0254 = $364; //@line 6264
    $$pre345 = $154; //@line 6264
   } else {
    $$0254 = -1; //@line 6266
    $$pre345 = $115; //@line 6266
   }
  } while (0);
  $$0252 = 0; //@line 6269
  $158 = $$pre345; //@line 6269
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 6276
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 6279
   HEAP32[$5 >> 2] = $158; //@line 6280
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (1049 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 6285
   $168 = $167 & 255; //@line 6286
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 6290
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 6297
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 6301
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 6305
     break L1;
    } else {
     label = 50; //@line 6308
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 6313
     $176 = $3 + ($$0253 << 3) | 0; //@line 6315
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 6320
     $182 = $6; //@line 6321
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 6323
     HEAP32[$182 + 4 >> 2] = $181; //@line 6326
     label = 50; //@line 6327
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 6331
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 6334
    $187 = HEAP32[$5 >> 2] | 0; //@line 6336
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 6340
   if ($10) {
    $187 = $158; //@line 6342
   } else {
    $$0243 = 0; //@line 6344
    $$0247 = $$1248; //@line 6344
    $$0269 = $$3272; //@line 6344
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 6350
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 6356
  $196 = $$1263 & -65537; //@line 6359
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 6360
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 6368
       $$0243 = 0; //@line 6369
       $$0247 = $$1248; //@line 6369
       $$0269 = $$3272; //@line 6369
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 6375
       $$0243 = 0; //@line 6376
       $$0247 = $$1248; //@line 6376
       $$0269 = $$3272; //@line 6376
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 6384
       HEAP32[$208 >> 2] = $$1248; //@line 6386
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 6389
       $$0243 = 0; //@line 6390
       $$0247 = $$1248; //@line 6390
       $$0269 = $$3272; //@line 6390
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 6397
       $$0243 = 0; //@line 6398
       $$0247 = $$1248; //@line 6398
       $$0269 = $$3272; //@line 6398
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 6405
       $$0243 = 0; //@line 6406
       $$0247 = $$1248; //@line 6406
       $$0269 = $$3272; //@line 6406
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 6412
       $$0243 = 0; //@line 6413
       $$0247 = $$1248; //@line 6413
       $$0269 = $$3272; //@line 6413
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 6421
       HEAP32[$220 >> 2] = $$1248; //@line 6423
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 6426
       $$0243 = 0; //@line 6427
       $$0247 = $$1248; //@line 6427
       $$0269 = $$3272; //@line 6427
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 6432
       $$0247 = $$1248; //@line 6432
       $$0269 = $$3272; //@line 6432
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 6442
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 6442
     $$3265 = $$1263$ | 8; //@line 6442
     label = 62; //@line 6443
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 6447
     $$1255 = $$0254; //@line 6447
     $$3265 = $$1263$; //@line 6447
     label = 62; //@line 6448
     break;
    }
   case 111:
    {
     $242 = $6; //@line 6452
     $244 = HEAP32[$242 >> 2] | 0; //@line 6454
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 6457
     $248 = _fmt_o($244, $247, $11) | 0; //@line 6458
     $252 = $12 - $248 | 0; //@line 6462
     $$0228 = $248; //@line 6467
     $$1233 = 0; //@line 6467
     $$1238 = 1513; //@line 6467
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 6467
     $$4266 = $$1263$; //@line 6467
     $281 = $244; //@line 6467
     $283 = $247; //@line 6467
     label = 68; //@line 6468
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 6472
     $258 = HEAP32[$256 >> 2] | 0; //@line 6474
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 6477
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 6480
      $264 = tempRet0; //@line 6481
      $265 = $6; //@line 6482
      HEAP32[$265 >> 2] = $263; //@line 6484
      HEAP32[$265 + 4 >> 2] = $264; //@line 6487
      $$0232 = 1; //@line 6488
      $$0237 = 1513; //@line 6488
      $275 = $263; //@line 6488
      $276 = $264; //@line 6488
      label = 67; //@line 6489
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 6501
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 1513 : 1515 : 1514; //@line 6501
      $275 = $258; //@line 6501
      $276 = $261; //@line 6501
      label = 67; //@line 6502
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 6508
     $$0232 = 0; //@line 6514
     $$0237 = 1513; //@line 6514
     $275 = HEAP32[$197 >> 2] | 0; //@line 6514
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 6514
     label = 67; //@line 6515
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 6526
     $$2 = $13; //@line 6527
     $$2234 = 0; //@line 6527
     $$2239 = 1513; //@line 6527
     $$2251 = $11; //@line 6527
     $$5 = 1; //@line 6527
     $$6268 = $196; //@line 6527
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 6534
     label = 72; //@line 6535
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 6539
     $$1 = $302 | 0 ? $302 : 1523; //@line 6542
     label = 72; //@line 6543
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 6553
     HEAP32[$14 >> 2] = 0; //@line 6554
     HEAP32[$6 >> 2] = $8; //@line 6555
     $$4258354 = -1; //@line 6556
     $365 = $8; //@line 6556
     label = 76; //@line 6557
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 6561
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 6564
      $$0240$lcssa356 = 0; //@line 6565
      label = 85; //@line 6566
     } else {
      $$4258354 = $$0254; //@line 6568
      $365 = $$pre348; //@line 6568
      label = 76; //@line 6569
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 6576
     $$0247 = $$1248; //@line 6576
     $$0269 = $$3272; //@line 6576
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 6581
     $$2234 = 0; //@line 6581
     $$2239 = 1513; //@line 6581
     $$2251 = $11; //@line 6581
     $$5 = $$0254; //@line 6581
     $$6268 = $$1263$; //@line 6581
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 6587
    $227 = $6; //@line 6588
    $229 = HEAP32[$227 >> 2] | 0; //@line 6590
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 6593
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 6595
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 6601
    $$0228 = $234; //@line 6606
    $$1233 = $or$cond278 ? 0 : 2; //@line 6606
    $$1238 = $or$cond278 ? 1513 : 1513 + ($$1236 >> 4) | 0; //@line 6606
    $$2256 = $$1255; //@line 6606
    $$4266 = $$3265; //@line 6606
    $281 = $229; //@line 6606
    $283 = $232; //@line 6606
    label = 68; //@line 6607
   } else if ((label | 0) == 67) {
    label = 0; //@line 6610
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 6612
    $$1233 = $$0232; //@line 6612
    $$1238 = $$0237; //@line 6612
    $$2256 = $$0254; //@line 6612
    $$4266 = $$1263$; //@line 6612
    $281 = $275; //@line 6612
    $283 = $276; //@line 6612
    label = 68; //@line 6613
   } else if ((label | 0) == 72) {
    label = 0; //@line 6616
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 6617
    $306 = ($305 | 0) == 0; //@line 6618
    $$2 = $$1; //@line 6625
    $$2234 = 0; //@line 6625
    $$2239 = 1513; //@line 6625
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 6625
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 6625
    $$6268 = $196; //@line 6625
   } else if ((label | 0) == 76) {
    label = 0; //@line 6628
    $$0229316 = $365; //@line 6629
    $$0240315 = 0; //@line 6629
    $$1244314 = 0; //@line 6629
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 6631
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 6634
      $$2245 = $$1244314; //@line 6634
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 6637
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 6643
      $$2245 = $320; //@line 6643
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 6647
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 6650
      $$0240315 = $325; //@line 6650
      $$1244314 = $320; //@line 6650
     } else {
      $$0240$lcssa = $325; //@line 6652
      $$2245 = $320; //@line 6652
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 6658
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 6661
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 6664
     label = 85; //@line 6665
    } else {
     $$1230327 = $365; //@line 6667
     $$1241326 = 0; //@line 6667
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 6669
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 6672
       label = 85; //@line 6673
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 6676
      $$1241326 = $331 + $$1241326 | 0; //@line 6677
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 6680
       label = 85; //@line 6681
       break L97;
      }
      _out_670($0, $9, $331); //@line 6685
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 6690
       label = 85; //@line 6691
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 6688
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 6699
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 6705
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 6707
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 6712
   $$2 = $or$cond ? $$0228 : $11; //@line 6717
   $$2234 = $$1233; //@line 6717
   $$2239 = $$1238; //@line 6717
   $$2251 = $11; //@line 6717
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 6717
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 6717
  } else if ((label | 0) == 85) {
   label = 0; //@line 6720
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 6722
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 6725
   $$0247 = $$1248; //@line 6725
   $$0269 = $$3272; //@line 6725
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 6730
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 6732
  $345 = $$$5 + $$2234 | 0; //@line 6733
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 6735
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 6736
  _out_670($0, $$2239, $$2234); //@line 6737
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 6739
  _pad_676($0, 48, $$$5, $343, 0); //@line 6740
  _out_670($0, $$2, $343); //@line 6741
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 6743
  $$0243 = $$2261; //@line 6744
  $$0247 = $$1248; //@line 6744
  $$0269 = $$3272; //@line 6744
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 6752
    } else {
     $$2242302 = 1; //@line 6754
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 6757
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 6760
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 6764
      $356 = $$2242302 + 1 | 0; //@line 6765
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 6768
      } else {
       $$2242$lcssa = $356; //@line 6770
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 6776
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 6782
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 6788
       } else {
        $$0 = 1; //@line 6790
        break;
       }
      }
     } else {
      $$0 = 1; //@line 6795
     }
    }
   } else {
    $$0 = $$1248; //@line 6799
   }
  }
 } while (0);
 STACKTOP = sp; //@line 6803
 return $$0 | 0; //@line 6803
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 3911
 $3 = HEAP32[952] | 0; //@line 3912
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 3915
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 3919
 $7 = $6 & 3; //@line 3920
 if (($7 | 0) == 1) {
  _abort(); //@line 3923
 }
 $9 = $6 & -8; //@line 3926
 $10 = $2 + $9 | 0; //@line 3927
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 3932
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 3938
   $17 = $13 + $9 | 0; //@line 3939
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 3942
   }
   if ((HEAP32[953] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 3948
    $106 = HEAP32[$105 >> 2] | 0; //@line 3949
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 3953
     $$1382 = $17; //@line 3953
     $114 = $16; //@line 3953
     break;
    }
    HEAP32[950] = $17; //@line 3956
    HEAP32[$105 >> 2] = $106 & -2; //@line 3958
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 3961
    HEAP32[$16 + $17 >> 2] = $17; //@line 3963
    return;
   }
   $21 = $13 >>> 3; //@line 3966
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 3970
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 3972
    $28 = 3832 + ($21 << 1 << 2) | 0; //@line 3974
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 3979
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 3986
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[948] = HEAP32[948] & ~(1 << $21); //@line 3996
     $$1 = $16; //@line 3997
     $$1382 = $17; //@line 3997
     $114 = $16; //@line 3997
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 4003
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 4007
     }
     $41 = $26 + 8 | 0; //@line 4010
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 4014
     } else {
      _abort(); //@line 4016
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 4021
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 4022
    $$1 = $16; //@line 4023
    $$1382 = $17; //@line 4023
    $114 = $16; //@line 4023
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 4027
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 4029
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 4033
     $60 = $59 + 4 | 0; //@line 4034
     $61 = HEAP32[$60 >> 2] | 0; //@line 4035
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 4038
      if (!$63) {
       $$3 = 0; //@line 4041
       break;
      } else {
       $$1387 = $63; //@line 4044
       $$1390 = $59; //@line 4044
      }
     } else {
      $$1387 = $61; //@line 4047
      $$1390 = $60; //@line 4047
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 4050
      $66 = HEAP32[$65 >> 2] | 0; //@line 4051
      if ($66 | 0) {
       $$1387 = $66; //@line 4054
       $$1390 = $65; //@line 4054
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 4057
      $69 = HEAP32[$68 >> 2] | 0; //@line 4058
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 4063
       $$1390 = $68; //@line 4063
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 4068
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 4071
      $$3 = $$1387; //@line 4072
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 4077
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 4080
     }
     $53 = $51 + 12 | 0; //@line 4083
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 4087
     }
     $56 = $48 + 8 | 0; //@line 4090
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 4094
      HEAP32[$56 >> 2] = $51; //@line 4095
      $$3 = $48; //@line 4096
      break;
     } else {
      _abort(); //@line 4099
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 4106
    $$1382 = $17; //@line 4106
    $114 = $16; //@line 4106
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 4109
    $75 = 4096 + ($74 << 2) | 0; //@line 4110
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 4115
      if (!$$3) {
       HEAP32[949] = HEAP32[949] & ~(1 << $74); //@line 4122
       $$1 = $16; //@line 4123
       $$1382 = $17; //@line 4123
       $114 = $16; //@line 4123
       break L10;
      }
     } else {
      if ((HEAP32[952] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 4130
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 4138
       if (!$$3) {
        $$1 = $16; //@line 4141
        $$1382 = $17; //@line 4141
        $114 = $16; //@line 4141
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[952] | 0; //@line 4149
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 4152
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 4156
    $92 = $16 + 16 | 0; //@line 4157
    $93 = HEAP32[$92 >> 2] | 0; //@line 4158
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 4164
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 4168
       HEAP32[$93 + 24 >> 2] = $$3; //@line 4170
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 4176
    if (!$99) {
     $$1 = $16; //@line 4179
     $$1382 = $17; //@line 4179
     $114 = $16; //@line 4179
    } else {
     if ((HEAP32[952] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 4184
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 4188
      HEAP32[$99 + 24 >> 2] = $$3; //@line 4190
      $$1 = $16; //@line 4191
      $$1382 = $17; //@line 4191
      $114 = $16; //@line 4191
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 4197
   $$1382 = $9; //@line 4197
   $114 = $2; //@line 4197
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 4202
 }
 $115 = $10 + 4 | 0; //@line 4205
 $116 = HEAP32[$115 >> 2] | 0; //@line 4206
 if (!($116 & 1)) {
  _abort(); //@line 4210
 }
 if (!($116 & 2)) {
  if ((HEAP32[954] | 0) == ($10 | 0)) {
   $124 = (HEAP32[951] | 0) + $$1382 | 0; //@line 4220
   HEAP32[951] = $124; //@line 4221
   HEAP32[954] = $$1; //@line 4222
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 4225
   if (($$1 | 0) != (HEAP32[953] | 0)) {
    return;
   }
   HEAP32[953] = 0; //@line 4231
   HEAP32[950] = 0; //@line 4232
   return;
  }
  if ((HEAP32[953] | 0) == ($10 | 0)) {
   $132 = (HEAP32[950] | 0) + $$1382 | 0; //@line 4239
   HEAP32[950] = $132; //@line 4240
   HEAP32[953] = $114; //@line 4241
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 4244
   HEAP32[$114 + $132 >> 2] = $132; //@line 4246
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 4250
  $138 = $116 >>> 3; //@line 4251
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 4256
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 4258
    $145 = 3832 + ($138 << 1 << 2) | 0; //@line 4260
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[952] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 4266
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 4273
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[948] = HEAP32[948] & ~(1 << $138); //@line 4283
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 4289
    } else {
     if ((HEAP32[952] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 4294
     }
     $160 = $143 + 8 | 0; //@line 4297
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 4301
     } else {
      _abort(); //@line 4303
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 4308
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 4309
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 4312
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 4314
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 4318
      $180 = $179 + 4 | 0; //@line 4319
      $181 = HEAP32[$180 >> 2] | 0; //@line 4320
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 4323
       if (!$183) {
        $$3400 = 0; //@line 4326
        break;
       } else {
        $$1398 = $183; //@line 4329
        $$1402 = $179; //@line 4329
       }
      } else {
       $$1398 = $181; //@line 4332
       $$1402 = $180; //@line 4332
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 4335
       $186 = HEAP32[$185 >> 2] | 0; //@line 4336
       if ($186 | 0) {
        $$1398 = $186; //@line 4339
        $$1402 = $185; //@line 4339
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 4342
       $189 = HEAP32[$188 >> 2] | 0; //@line 4343
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 4348
        $$1402 = $188; //@line 4348
       }
      }
      if ((HEAP32[952] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 4354
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 4357
       $$3400 = $$1398; //@line 4358
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 4363
      if ((HEAP32[952] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 4367
      }
      $173 = $170 + 12 | 0; //@line 4370
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 4374
      }
      $176 = $167 + 8 | 0; //@line 4377
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 4381
       HEAP32[$176 >> 2] = $170; //@line 4382
       $$3400 = $167; //@line 4383
       break;
      } else {
       _abort(); //@line 4386
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 4394
     $196 = 4096 + ($195 << 2) | 0; //@line 4395
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 4400
       if (!$$3400) {
        HEAP32[949] = HEAP32[949] & ~(1 << $195); //@line 4407
        break L108;
       }
      } else {
       if ((HEAP32[952] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 4414
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 4422
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[952] | 0; //@line 4432
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 4435
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 4439
     $213 = $10 + 16 | 0; //@line 4440
     $214 = HEAP32[$213 >> 2] | 0; //@line 4441
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 4447
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 4451
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 4453
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 4459
     if ($220 | 0) {
      if ((HEAP32[952] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 4465
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 4469
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 4471
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 4480
  HEAP32[$114 + $137 >> 2] = $137; //@line 4482
  if (($$1 | 0) == (HEAP32[953] | 0)) {
   HEAP32[950] = $137; //@line 4486
   return;
  } else {
   $$2 = $137; //@line 4489
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 4493
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 4496
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 4498
  $$2 = $$1382; //@line 4499
 }
 $235 = $$2 >>> 3; //@line 4501
 if ($$2 >>> 0 < 256) {
  $238 = 3832 + ($235 << 1 << 2) | 0; //@line 4505
  $239 = HEAP32[948] | 0; //@line 4506
  $240 = 1 << $235; //@line 4507
  if (!($239 & $240)) {
   HEAP32[948] = $239 | $240; //@line 4512
   $$0403 = $238; //@line 4514
   $$pre$phiZ2D = $238 + 8 | 0; //@line 4514
  } else {
   $244 = $238 + 8 | 0; //@line 4516
   $245 = HEAP32[$244 >> 2] | 0; //@line 4517
   if ((HEAP32[952] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 4521
   } else {
    $$0403 = $245; //@line 4524
    $$pre$phiZ2D = $244; //@line 4524
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 4527
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 4529
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 4531
  HEAP32[$$1 + 12 >> 2] = $238; //@line 4533
  return;
 }
 $251 = $$2 >>> 8; //@line 4536
 if (!$251) {
  $$0396 = 0; //@line 4539
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 4543
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 4547
   $257 = $251 << $256; //@line 4548
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 4551
   $262 = $257 << $260; //@line 4553
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 4556
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 4561
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 4567
  }
 }
 $276 = 4096 + ($$0396 << 2) | 0; //@line 4570
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 4572
 HEAP32[$$1 + 20 >> 2] = 0; //@line 4575
 HEAP32[$$1 + 16 >> 2] = 0; //@line 4576
 $280 = HEAP32[949] | 0; //@line 4577
 $281 = 1 << $$0396; //@line 4578
 do {
  if (!($280 & $281)) {
   HEAP32[949] = $280 | $281; //@line 4584
   HEAP32[$276 >> 2] = $$1; //@line 4585
   HEAP32[$$1 + 24 >> 2] = $276; //@line 4587
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 4589
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 4591
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 4599
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 4599
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 4606
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 4610
    $301 = HEAP32[$299 >> 2] | 0; //@line 4612
    if (!$301) {
     label = 121; //@line 4615
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 4618
     $$0384 = $301; //@line 4618
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[952] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 4625
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 4628
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 4630
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 4632
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 4634
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 4639
    $309 = HEAP32[$308 >> 2] | 0; //@line 4640
    $310 = HEAP32[952] | 0; //@line 4641
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 4647
     HEAP32[$308 >> 2] = $$1; //@line 4648
     HEAP32[$$1 + 8 >> 2] = $309; //@line 4650
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 4652
     HEAP32[$$1 + 24 >> 2] = 0; //@line 4654
     break;
    } else {
     _abort(); //@line 4657
    }
   }
  }
 } while (0);
 $319 = (HEAP32[956] | 0) + -1 | 0; //@line 4664
 HEAP32[956] = $319; //@line 4665
 if (!$319) {
  $$0212$in$i = 4248; //@line 4668
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 4673
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 4679
  }
 }
 HEAP32[956] = -1; //@line 4682
 return;
}
function _main() {
 var $AsyncCtx = 0, $AsyncCtx101 = 0, $AsyncCtx104 = 0, $AsyncCtx107 = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx62 = 0, $AsyncCtx65 = 0, $AsyncCtx68 = 0, $AsyncCtx7 = 0, $AsyncCtx71 = 0, $AsyncCtx74 = 0, $AsyncCtx77 = 0, $AsyncCtx80 = 0, $AsyncCtx83 = 0, $AsyncCtx86 = 0, $AsyncCtx89 = 0, $AsyncCtx92 = 0, $AsyncCtx95 = 0, $AsyncCtx98 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1084
 while (1) {
  $AsyncCtx59 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1086
  __ZN4mbed6BusOutaSEi(3716, 0) | 0; //@line 1087
  if (___async) {
   label = 3; //@line 1090
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 1093
  $AsyncCtx107 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1094
  _wait(.25); //@line 1095
  if (___async) {
   label = 5; //@line 1098
   break;
  }
  _emscripten_free_async_context($AsyncCtx107 | 0); //@line 1101
  $AsyncCtx55 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1102
  __ZN4mbed6BusOutaSEi(3716, 1) | 0; //@line 1103
  if (___async) {
   label = 7; //@line 1106
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 1109
  $AsyncCtx104 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1110
  _wait(.25); //@line 1111
  if (___async) {
   label = 9; //@line 1114
   break;
  }
  _emscripten_free_async_context($AsyncCtx104 | 0); //@line 1117
  $AsyncCtx51 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1118
  __ZN4mbed6BusOutaSEi(3716, 2) | 0; //@line 1119
  if (___async) {
   label = 11; //@line 1122
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 1125
  $AsyncCtx101 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1126
  _wait(.25); //@line 1127
  if (___async) {
   label = 13; //@line 1130
   break;
  }
  _emscripten_free_async_context($AsyncCtx101 | 0); //@line 1133
  $AsyncCtx47 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1134
  __ZN4mbed6BusOutaSEi(3716, 3) | 0; //@line 1135
  if (___async) {
   label = 15; //@line 1138
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 1141
  $AsyncCtx98 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1142
  _wait(.25); //@line 1143
  if (___async) {
   label = 17; //@line 1146
   break;
  }
  _emscripten_free_async_context($AsyncCtx98 | 0); //@line 1149
  $AsyncCtx43 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1150
  __ZN4mbed6BusOutaSEi(3716, 4) | 0; //@line 1151
  if (___async) {
   label = 19; //@line 1154
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 1157
  $AsyncCtx95 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1158
  _wait(.25); //@line 1159
  if (___async) {
   label = 21; //@line 1162
   break;
  }
  _emscripten_free_async_context($AsyncCtx95 | 0); //@line 1165
  $AsyncCtx39 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1166
  __ZN4mbed6BusOutaSEi(3716, 5) | 0; //@line 1167
  if (___async) {
   label = 23; //@line 1170
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 1173
  $AsyncCtx92 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1174
  _wait(.25); //@line 1175
  if (___async) {
   label = 25; //@line 1178
   break;
  }
  _emscripten_free_async_context($AsyncCtx92 | 0); //@line 1181
  $AsyncCtx35 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1182
  __ZN4mbed6BusOutaSEi(3716, 6) | 0; //@line 1183
  if (___async) {
   label = 27; //@line 1186
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 1189
  $AsyncCtx89 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1190
  _wait(.25); //@line 1191
  if (___async) {
   label = 29; //@line 1194
   break;
  }
  _emscripten_free_async_context($AsyncCtx89 | 0); //@line 1197
  $AsyncCtx31 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1198
  __ZN4mbed6BusOutaSEi(3716, 7) | 0; //@line 1199
  if (___async) {
   label = 31; //@line 1202
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 1205
  $AsyncCtx86 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1206
  _wait(.25); //@line 1207
  if (___async) {
   label = 33; //@line 1210
   break;
  }
  _emscripten_free_async_context($AsyncCtx86 | 0); //@line 1213
  $AsyncCtx27 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1214
  __ZN4mbed6BusOutaSEi(3716, 8) | 0; //@line 1215
  if (___async) {
   label = 35; //@line 1218
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 1221
  $AsyncCtx83 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1222
  _wait(.25); //@line 1223
  if (___async) {
   label = 37; //@line 1226
   break;
  }
  _emscripten_free_async_context($AsyncCtx83 | 0); //@line 1229
  $AsyncCtx23 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1230
  __ZN4mbed6BusOutaSEi(3716, 9) | 0; //@line 1231
  if (___async) {
   label = 39; //@line 1234
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 1237
  $AsyncCtx80 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1238
  _wait(.25); //@line 1239
  if (___async) {
   label = 41; //@line 1242
   break;
  }
  _emscripten_free_async_context($AsyncCtx80 | 0); //@line 1245
  $AsyncCtx19 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1246
  __ZN4mbed6BusOutaSEi(3716, 10) | 0; //@line 1247
  if (___async) {
   label = 43; //@line 1250
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 1253
  $AsyncCtx77 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1254
  _wait(.25); //@line 1255
  if (___async) {
   label = 45; //@line 1258
   break;
  }
  _emscripten_free_async_context($AsyncCtx77 | 0); //@line 1261
  $AsyncCtx15 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1262
  __ZN4mbed6BusOutaSEi(3716, 11) | 0; //@line 1263
  if (___async) {
   label = 47; //@line 1266
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1269
  $AsyncCtx74 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1270
  _wait(.25); //@line 1271
  if (___async) {
   label = 49; //@line 1274
   break;
  }
  _emscripten_free_async_context($AsyncCtx74 | 0); //@line 1277
  $AsyncCtx11 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1278
  __ZN4mbed6BusOutaSEi(3716, 12) | 0; //@line 1279
  if (___async) {
   label = 51; //@line 1282
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1285
  $AsyncCtx71 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1286
  _wait(.25); //@line 1287
  if (___async) {
   label = 53; //@line 1290
   break;
  }
  _emscripten_free_async_context($AsyncCtx71 | 0); //@line 1293
  $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1294
  __ZN4mbed6BusOutaSEi(3716, 13) | 0; //@line 1295
  if (___async) {
   label = 55; //@line 1298
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1301
  $AsyncCtx68 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1302
  _wait(.25); //@line 1303
  if (___async) {
   label = 57; //@line 1306
   break;
  }
  _emscripten_free_async_context($AsyncCtx68 | 0); //@line 1309
  $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1310
  __ZN4mbed6BusOutaSEi(3716, 14) | 0; //@line 1311
  if (___async) {
   label = 59; //@line 1314
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1317
  $AsyncCtx65 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1318
  _wait(.25); //@line 1319
  if (___async) {
   label = 61; //@line 1322
   break;
  }
  _emscripten_free_async_context($AsyncCtx65 | 0); //@line 1325
  $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1326
  __ZN4mbed6BusOutaSEi(3716, 15) | 0; //@line 1327
  if (___async) {
   label = 63; //@line 1330
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1333
  $AsyncCtx62 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1334
  _wait(.25); //@line 1335
  if (___async) {
   label = 65; //@line 1338
   break;
  }
  _emscripten_free_async_context($AsyncCtx62 | 0); //@line 1341
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 41; //@line 1345
   sp = STACKTOP; //@line 1346
   return 0; //@line 1347
  }
 case 5:
  {
   HEAP32[$AsyncCtx107 >> 2] = 42; //@line 1351
   sp = STACKTOP; //@line 1352
   return 0; //@line 1353
  }
 case 7:
  {
   HEAP32[$AsyncCtx55 >> 2] = 43; //@line 1357
   sp = STACKTOP; //@line 1358
   return 0; //@line 1359
  }
 case 9:
  {
   HEAP32[$AsyncCtx104 >> 2] = 44; //@line 1363
   sp = STACKTOP; //@line 1364
   return 0; //@line 1365
  }
 case 11:
  {
   HEAP32[$AsyncCtx51 >> 2] = 45; //@line 1369
   sp = STACKTOP; //@line 1370
   return 0; //@line 1371
  }
 case 13:
  {
   HEAP32[$AsyncCtx101 >> 2] = 46; //@line 1375
   sp = STACKTOP; //@line 1376
   return 0; //@line 1377
  }
 case 15:
  {
   HEAP32[$AsyncCtx47 >> 2] = 47; //@line 1381
   sp = STACKTOP; //@line 1382
   return 0; //@line 1383
  }
 case 17:
  {
   HEAP32[$AsyncCtx98 >> 2] = 48; //@line 1387
   sp = STACKTOP; //@line 1388
   return 0; //@line 1389
  }
 case 19:
  {
   HEAP32[$AsyncCtx43 >> 2] = 49; //@line 1393
   sp = STACKTOP; //@line 1394
   return 0; //@line 1395
  }
 case 21:
  {
   HEAP32[$AsyncCtx95 >> 2] = 50; //@line 1399
   sp = STACKTOP; //@line 1400
   return 0; //@line 1401
  }
 case 23:
  {
   HEAP32[$AsyncCtx39 >> 2] = 51; //@line 1405
   sp = STACKTOP; //@line 1406
   return 0; //@line 1407
  }
 case 25:
  {
   HEAP32[$AsyncCtx92 >> 2] = 52; //@line 1411
   sp = STACKTOP; //@line 1412
   return 0; //@line 1413
  }
 case 27:
  {
   HEAP32[$AsyncCtx35 >> 2] = 53; //@line 1417
   sp = STACKTOP; //@line 1418
   return 0; //@line 1419
  }
 case 29:
  {
   HEAP32[$AsyncCtx89 >> 2] = 54; //@line 1423
   sp = STACKTOP; //@line 1424
   return 0; //@line 1425
  }
 case 31:
  {
   HEAP32[$AsyncCtx31 >> 2] = 55; //@line 1429
   sp = STACKTOP; //@line 1430
   return 0; //@line 1431
  }
 case 33:
  {
   HEAP32[$AsyncCtx86 >> 2] = 56; //@line 1435
   sp = STACKTOP; //@line 1436
   return 0; //@line 1437
  }
 case 35:
  {
   HEAP32[$AsyncCtx27 >> 2] = 57; //@line 1441
   sp = STACKTOP; //@line 1442
   return 0; //@line 1443
  }
 case 37:
  {
   HEAP32[$AsyncCtx83 >> 2] = 58; //@line 1447
   sp = STACKTOP; //@line 1448
   return 0; //@line 1449
  }
 case 39:
  {
   HEAP32[$AsyncCtx23 >> 2] = 59; //@line 1453
   sp = STACKTOP; //@line 1454
   return 0; //@line 1455
  }
 case 41:
  {
   HEAP32[$AsyncCtx80 >> 2] = 60; //@line 1459
   sp = STACKTOP; //@line 1460
   return 0; //@line 1461
  }
 case 43:
  {
   HEAP32[$AsyncCtx19 >> 2] = 61; //@line 1465
   sp = STACKTOP; //@line 1466
   return 0; //@line 1467
  }
 case 45:
  {
   HEAP32[$AsyncCtx77 >> 2] = 62; //@line 1471
   sp = STACKTOP; //@line 1472
   return 0; //@line 1473
  }
 case 47:
  {
   HEAP32[$AsyncCtx15 >> 2] = 63; //@line 1477
   sp = STACKTOP; //@line 1478
   return 0; //@line 1479
  }
 case 49:
  {
   HEAP32[$AsyncCtx74 >> 2] = 64; //@line 1483
   sp = STACKTOP; //@line 1484
   return 0; //@line 1485
  }
 case 51:
  {
   HEAP32[$AsyncCtx11 >> 2] = 65; //@line 1489
   sp = STACKTOP; //@line 1490
   return 0; //@line 1491
  }
 case 53:
  {
   HEAP32[$AsyncCtx71 >> 2] = 66; //@line 1495
   sp = STACKTOP; //@line 1496
   return 0; //@line 1497
  }
 case 55:
  {
   HEAP32[$AsyncCtx7 >> 2] = 67; //@line 1501
   sp = STACKTOP; //@line 1502
   return 0; //@line 1503
  }
 case 57:
  {
   HEAP32[$AsyncCtx68 >> 2] = 68; //@line 1507
   sp = STACKTOP; //@line 1508
   return 0; //@line 1509
  }
 case 59:
  {
   HEAP32[$AsyncCtx3 >> 2] = 69; //@line 1513
   sp = STACKTOP; //@line 1514
   return 0; //@line 1515
  }
 case 61:
  {
   HEAP32[$AsyncCtx65 >> 2] = 70; //@line 1519
   sp = STACKTOP; //@line 1520
   return 0; //@line 1521
  }
 case 63:
  {
   HEAP32[$AsyncCtx >> 2] = 71; //@line 1525
   sp = STACKTOP; //@line 1526
   return 0; //@line 1527
  }
 case 65:
  {
   HEAP32[$AsyncCtx62 >> 2] = 72; //@line 1531
   sp = STACKTOP; //@line 1532
   return 0; //@line 1533
  }
 }
 return 0; //@line 1537
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 $rem = $rem | 0;
 var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $_0$0 = 0, $_0$1 = 0, $q_sroa_1_1198$looptemp = 0;
 $n_sroa_0_0_extract_trunc = $a$0; //@line 13105
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 13106
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 13107
 $d_sroa_0_0_extract_trunc = $b$0; //@line 13108
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 13109
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 13110
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 13112
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 13115
    HEAP32[$rem + 4 >> 2] = 0; //@line 13116
   }
   $_0$1 = 0; //@line 13118
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 13119
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13120
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 13123
    $_0$0 = 0; //@line 13124
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13125
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 13127
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 13128
   $_0$1 = 0; //@line 13129
   $_0$0 = 0; //@line 13130
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13131
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 13134
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 13139
     HEAP32[$rem + 4 >> 2] = 0; //@line 13140
    }
    $_0$1 = 0; //@line 13142
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 13143
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13144
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 13148
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 13149
    }
    $_0$1 = 0; //@line 13151
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 13152
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13153
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 13155
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 13158
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 13159
    }
    $_0$1 = 0; //@line 13161
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 13162
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13163
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 13166
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 13168
    $58 = 31 - $51 | 0; //@line 13169
    $sr_1_ph = $57; //@line 13170
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 13171
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 13172
    $q_sroa_0_1_ph = 0; //@line 13173
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 13174
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 13178
    $_0$0 = 0; //@line 13179
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13180
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 13182
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 13183
   $_0$1 = 0; //@line 13184
   $_0$0 = 0; //@line 13185
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13186
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 13190
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 13192
     $126 = 31 - $119 | 0; //@line 13193
     $130 = $119 - 31 >> 31; //@line 13194
     $sr_1_ph = $125; //@line 13195
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 13196
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 13197
     $q_sroa_0_1_ph = 0; //@line 13198
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 13199
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 13203
     $_0$0 = 0; //@line 13204
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13205
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 13207
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 13208
    $_0$1 = 0; //@line 13209
    $_0$0 = 0; //@line 13210
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13211
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 13213
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 13216
    $89 = 64 - $88 | 0; //@line 13217
    $91 = 32 - $88 | 0; //@line 13218
    $92 = $91 >> 31; //@line 13219
    $95 = $88 - 32 | 0; //@line 13220
    $105 = $95 >> 31; //@line 13221
    $sr_1_ph = $88; //@line 13222
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 13223
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 13224
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 13225
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 13226
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 13230
    HEAP32[$rem + 4 >> 2] = 0; //@line 13231
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 13234
    $_0$0 = $a$0 | 0 | 0; //@line 13235
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13236
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 13238
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 13239
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 13240
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13241
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 13246
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 13247
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 13248
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 13249
  $carry_0_lcssa$1 = 0; //@line 13250
  $carry_0_lcssa$0 = 0; //@line 13251
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 13253
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 13254
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 13255
  $137$1 = tempRet0; //@line 13256
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 13257
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 13258
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 13259
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 13260
  $sr_1202 = $sr_1_ph; //@line 13261
  $carry_0203 = 0; //@line 13262
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 13264
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 13265
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 13266
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 13267
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 13268
   $150$1 = tempRet0; //@line 13269
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 13270
   $carry_0203 = $151$0 & 1; //@line 13271
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 13273
   $r_sroa_1_1200 = tempRet0; //@line 13274
   $sr_1202 = $sr_1202 - 1 | 0; //@line 13275
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 13287
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 13288
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 13289
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 13290
  $carry_0_lcssa$1 = 0; //@line 13291
  $carry_0_lcssa$0 = $carry_0203; //@line 13292
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 13294
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 13295
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 13298
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 13299
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 13301
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 13302
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13303
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9550
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 9556
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 9565
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 9570
      $19 = $1 + 44 | 0; //@line 9571
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 9580
      $26 = $1 + 52 | 0; //@line 9581
      $27 = $1 + 53 | 0; //@line 9582
      $28 = $1 + 54 | 0; //@line 9583
      $29 = $0 + 8 | 0; //@line 9584
      $30 = $1 + 24 | 0; //@line 9585
      $$081$off0 = 0; //@line 9586
      $$084 = $0 + 16 | 0; //@line 9586
      $$085$off0 = 0; //@line 9586
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 9590
        label = 20; //@line 9591
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 9594
       HEAP8[$27 >> 0] = 0; //@line 9595
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 9596
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 9597
       if (___async) {
        label = 12; //@line 9600
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 9603
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 9607
        label = 20; //@line 9608
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 9615
         $$186$off0 = $$085$off0; //@line 9615
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 9624
           label = 20; //@line 9625
           break L10;
          } else {
           $$182$off0 = 1; //@line 9628
           $$186$off0 = $$085$off0; //@line 9628
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 9635
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 9642
          break L10;
         } else {
          $$182$off0 = 1; //@line 9645
          $$186$off0 = 1; //@line 9645
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 9650
       $$084 = $$084 + 8 | 0; //@line 9650
       $$085$off0 = $$186$off0; //@line 9650
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 95; //@line 9653
       HEAP32[$AsyncCtx15 + 4 >> 2] = $19; //@line 9655
       HEAP32[$AsyncCtx15 + 8 >> 2] = $2; //@line 9657
       HEAP32[$AsyncCtx15 + 12 >> 2] = $13; //@line 9659
       HEAP32[$AsyncCtx15 + 16 >> 2] = $1; //@line 9661
       HEAP8[$AsyncCtx15 + 20 >> 0] = $$081$off0 & 1; //@line 9664
       HEAP8[$AsyncCtx15 + 21 >> 0] = $$085$off0 & 1; //@line 9667
       HEAP32[$AsyncCtx15 + 24 >> 2] = $$084; //@line 9669
       HEAP32[$AsyncCtx15 + 28 >> 2] = $29; //@line 9671
       HEAP32[$AsyncCtx15 + 32 >> 2] = $28; //@line 9673
       HEAP32[$AsyncCtx15 + 36 >> 2] = $30; //@line 9675
       HEAP32[$AsyncCtx15 + 40 >> 2] = $25; //@line 9677
       HEAP32[$AsyncCtx15 + 44 >> 2] = $26; //@line 9679
       HEAP32[$AsyncCtx15 + 48 >> 2] = $27; //@line 9681
       HEAP8[$AsyncCtx15 + 52 >> 0] = $4 & 1; //@line 9684
       sp = STACKTOP; //@line 9685
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 9691
         $61 = $1 + 40 | 0; //@line 9692
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 9695
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 9703
           if ($$283$off0) {
            label = 25; //@line 9705
            break;
           } else {
            $69 = 4; //@line 9708
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 9715
        } else {
         $69 = 4; //@line 9717
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 9722
      }
      HEAP32[$19 >> 2] = $69; //@line 9724
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 9733
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 9738
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 9739
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 9740
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 9741
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 96; //@line 9744
    HEAP32[$AsyncCtx11 + 4 >> 2] = $1; //@line 9746
    HEAP32[$AsyncCtx11 + 8 >> 2] = $73; //@line 9748
    HEAP32[$AsyncCtx11 + 12 >> 2] = $2; //@line 9750
    HEAP32[$AsyncCtx11 + 16 >> 2] = $3; //@line 9752
    HEAP8[$AsyncCtx11 + 20 >> 0] = $4 & 1; //@line 9755
    HEAP32[$AsyncCtx11 + 24 >> 2] = $0; //@line 9757
    HEAP32[$AsyncCtx11 + 28 >> 2] = $72; //@line 9759
    sp = STACKTOP; //@line 9760
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 9763
   $81 = $0 + 24 | 0; //@line 9764
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 9768
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 9772
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 9779
       $$2 = $81; //@line 9780
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 9792
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 9793
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 9798
        $136 = $$2 + 8 | 0; //@line 9799
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 9802
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 99; //@line 9807
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 9809
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 9811
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 9813
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 9815
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 9817
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 9819
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 9821
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 9824
       sp = STACKTOP; //@line 9825
       return;
      }
      $104 = $1 + 24 | 0; //@line 9828
      $105 = $1 + 54 | 0; //@line 9829
      $$1 = $81; //@line 9830
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 9846
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 9847
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9852
       $122 = $$1 + 8 | 0; //@line 9853
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 9856
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 98; //@line 9861
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 9863
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 9865
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 9867
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 9869
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 9871
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 9873
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 9875
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 9877
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 9880
      sp = STACKTOP; //@line 9881
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 9885
    $$0 = $81; //@line 9886
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 9893
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 9894
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 9899
     $100 = $$0 + 8 | 0; //@line 9900
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 9903
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 97; //@line 9908
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 9910
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 9912
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 9914
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 9916
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 9918
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 9920
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 9923
    sp = STACKTOP; //@line 9924
    return;
   }
  }
 } while (0);
 return;
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 525
 STACKTOP = STACKTOP + 32 | 0; //@line 526
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 526
 $0 = sp; //@line 527
 _gpio_init_out($0, 50); //@line 528
 while (1) {
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 531
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 532
  _wait_ms(150); //@line 533
  if (___async) {
   label = 3; //@line 536
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 539
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 541
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 542
  _wait_ms(150); //@line 543
  if (___async) {
   label = 5; //@line 546
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 549
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 551
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 552
  _wait_ms(150); //@line 553
  if (___async) {
   label = 7; //@line 556
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 559
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 561
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 562
  _wait_ms(150); //@line 563
  if (___async) {
   label = 9; //@line 566
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 569
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 571
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 572
  _wait_ms(150); //@line 573
  if (___async) {
   label = 11; //@line 576
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 579
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 581
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 582
  _wait_ms(150); //@line 583
  if (___async) {
   label = 13; //@line 586
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 589
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 591
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 592
  _wait_ms(150); //@line 593
  if (___async) {
   label = 15; //@line 596
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 599
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 601
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 602
  _wait_ms(150); //@line 603
  if (___async) {
   label = 17; //@line 606
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 609
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 611
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 612
  _wait_ms(400); //@line 613
  if (___async) {
   label = 19; //@line 616
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 619
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 621
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 622
  _wait_ms(400); //@line 623
  if (___async) {
   label = 21; //@line 626
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 629
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 631
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 632
  _wait_ms(400); //@line 633
  if (___async) {
   label = 23; //@line 636
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 639
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 641
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 642
  _wait_ms(400); //@line 643
  if (___async) {
   label = 25; //@line 646
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 649
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 651
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 652
  _wait_ms(400); //@line 653
  if (___async) {
   label = 27; //@line 656
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 659
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 661
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 662
  _wait_ms(400); //@line 663
  if (___async) {
   label = 29; //@line 666
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 669
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 671
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 672
  _wait_ms(400); //@line 673
  if (___async) {
   label = 31; //@line 676
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 679
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 681
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 682
  _wait_ms(400); //@line 683
  if (___async) {
   label = 33; //@line 686
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 689
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 16; //@line 693
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 695
   sp = STACKTOP; //@line 696
   STACKTOP = sp; //@line 697
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 17; //@line 701
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 703
   sp = STACKTOP; //@line 704
   STACKTOP = sp; //@line 705
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 18; //@line 709
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 711
   sp = STACKTOP; //@line 712
   STACKTOP = sp; //@line 713
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 19; //@line 717
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 719
   sp = STACKTOP; //@line 720
   STACKTOP = sp; //@line 721
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 20; //@line 725
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 727
   sp = STACKTOP; //@line 728
   STACKTOP = sp; //@line 729
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 21; //@line 733
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 735
   sp = STACKTOP; //@line 736
   STACKTOP = sp; //@line 737
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 22; //@line 741
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 743
   sp = STACKTOP; //@line 744
   STACKTOP = sp; //@line 745
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 23; //@line 749
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 751
   sp = STACKTOP; //@line 752
   STACKTOP = sp; //@line 753
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 24; //@line 757
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 759
   sp = STACKTOP; //@line 760
   STACKTOP = sp; //@line 761
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 25; //@line 765
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 767
   sp = STACKTOP; //@line 768
   STACKTOP = sp; //@line 769
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 26; //@line 773
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 775
   sp = STACKTOP; //@line 776
   STACKTOP = sp; //@line 777
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 27; //@line 781
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 783
   sp = STACKTOP; //@line 784
   STACKTOP = sp; //@line 785
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 28; //@line 789
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 791
   sp = STACKTOP; //@line 792
   STACKTOP = sp; //@line 793
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 29; //@line 797
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 799
   sp = STACKTOP; //@line 800
   STACKTOP = sp; //@line 801
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 30; //@line 805
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 807
   sp = STACKTOP; //@line 808
   STACKTOP = sp; //@line 809
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 31; //@line 813
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 815
   sp = STACKTOP; //@line 816
   STACKTOP = sp; //@line 817
   return;
  }
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_38($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11307
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11309
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11311
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11313
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11315
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 11318
 $12 = HEAP8[$0 + 21 >> 0] & 1; //@line 11321
 $14 = HEAP32[$0 + 24 >> 2] | 0; //@line 11323
 $16 = HEAP32[$0 + 28 >> 2] | 0; //@line 11325
 $18 = HEAP32[$0 + 32 >> 2] | 0; //@line 11327
 $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 11329
 $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 11331
 $24 = HEAP32[$0 + 44 >> 2] | 0; //@line 11333
 $26 = HEAP32[$0 + 48 >> 2] | 0; //@line 11335
 $28 = HEAP8[$0 + 52 >> 0] & 1; //@line 11338
 L2 : do {
  if (!(HEAP8[$18 >> 0] | 0)) {
   do {
    if (!(HEAP8[$26 >> 0] | 0)) {
     $$182$off0 = $10; //@line 11347
     $$186$off0 = $12; //@line 11347
    } else {
     if (!(HEAP8[$24 >> 0] | 0)) {
      if (!(HEAP32[$16 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $12; //@line 11356
       $$283$off0 = 1; //@line 11356
       label = 13; //@line 11357
       break L2;
      } else {
       $$182$off0 = 1; //@line 11360
       $$186$off0 = $12; //@line 11360
       break;
      }
     }
     if ((HEAP32[$20 >> 2] | 0) == 1) {
      label = 18; //@line 11367
      break L2;
     }
     if (!(HEAP32[$16 >> 2] & 2)) {
      label = 18; //@line 11374
      break L2;
     } else {
      $$182$off0 = 1; //@line 11377
      $$186$off0 = 1; //@line 11377
     }
    }
   } while (0);
   $30 = $14 + 8 | 0; //@line 11381
   if ($30 >>> 0 < $22 >>> 0) {
    HEAP8[$24 >> 0] = 0; //@line 11384
    HEAP8[$26 >> 0] = 0; //@line 11385
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 11386
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $8, $4, $4, 1, $28); //@line 11387
    if (!___async) {
     ___async_unwind = 0; //@line 11390
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 95; //@line 11392
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 11394
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 11396
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 11398
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 11400
    HEAP8[$ReallocAsyncCtx5 + 20 >> 0] = $$182$off0 & 1; //@line 11403
    HEAP8[$ReallocAsyncCtx5 + 21 >> 0] = $$186$off0 & 1; //@line 11406
    HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $30; //@line 11408
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $16; //@line 11410
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $18; //@line 11412
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $20; //@line 11414
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $22; //@line 11416
    HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $24; //@line 11418
    HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $26; //@line 11420
    HEAP8[$ReallocAsyncCtx5 + 52 >> 0] = $28 & 1; //@line 11423
    sp = STACKTOP; //@line 11424
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 11427
    $$283$off0 = $$182$off0; //@line 11427
    label = 13; //@line 11428
   }
  } else {
   $$085$off0$reg2mem$0 = $12; //@line 11431
   $$283$off0 = $10; //@line 11431
   label = 13; //@line 11432
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$6 >> 2] = $4; //@line 11438
    $59 = $8 + 40 | 0; //@line 11439
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 11442
    if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$20 >> 2] | 0) == 2) {
      HEAP8[$18 >> 0] = 1; //@line 11450
      if ($$283$off0) {
       label = 18; //@line 11452
       break;
      } else {
       $67 = 4; //@line 11455
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 11462
   } else {
    $67 = 4; //@line 11464
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 11469
 }
 HEAP32[$2 >> 2] = $67; //@line 11471
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_37($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11151
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11153
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11155
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11157
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11159
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 11162
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11164
 $15 = $12 + 24 | 0; //@line 11167
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$12 + 8 >> 2] | 0; //@line 11172
   if (!($18 & 2)) {
    $21 = $2 + 36 | 0; //@line 11176
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $2 + 54 | 0; //@line 11183
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 11194
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $6, $8, $10); //@line 11195
      if (!___async) {
       ___async_unwind = 0; //@line 11198
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 99; //@line 11200
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 11202
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 11204
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 11206
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 11208
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $2; //@line 11210
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $6; //@line 11212
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $8; //@line 11214
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $10 & 1; //@line 11217
      sp = STACKTOP; //@line 11218
      return;
     }
     $36 = $2 + 24 | 0; //@line 11221
     $37 = $2 + 54 | 0; //@line 11222
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 11237
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $6, $8, $10); //@line 11238
     if (!___async) {
      ___async_unwind = 0; //@line 11241
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 98; //@line 11243
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 11245
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 11247
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 11249
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 11251
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 11253
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $2; //@line 11255
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $6; //@line 11257
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $8; //@line 11259
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $10 & 1; //@line 11262
     sp = STACKTOP; //@line 11263
     return;
    }
   }
   $24 = $2 + 54 | 0; //@line 11267
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 11271
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $6, $8, $10); //@line 11272
    if (!___async) {
     ___async_unwind = 0; //@line 11275
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 97; //@line 11277
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 11279
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 11281
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 11283
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $2; //@line 11285
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $6; //@line 11287
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $8; //@line 11289
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $10 & 1; //@line 11292
    sp = STACKTOP; //@line 11293
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
 sp = STACKTOP; //@line 9388
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 9393
 } else {
  $9 = $1 + 52 | 0; //@line 9395
  $10 = HEAP8[$9 >> 0] | 0; //@line 9396
  $11 = $1 + 53 | 0; //@line 9397
  $12 = HEAP8[$11 >> 0] | 0; //@line 9398
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 9401
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 9402
  HEAP8[$9 >> 0] = 0; //@line 9403
  HEAP8[$11 >> 0] = 0; //@line 9404
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 9405
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 9406
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 93; //@line 9409
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 9411
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 9413
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 9415
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 9417
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 9419
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 9421
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 9423
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 9425
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 9427
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 9429
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 9432
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 9434
   sp = STACKTOP; //@line 9435
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9438
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 9443
    $32 = $0 + 8 | 0; //@line 9444
    $33 = $1 + 54 | 0; //@line 9445
    $$0 = $0 + 24 | 0; //@line 9446
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
     HEAP8[$9 >> 0] = 0; //@line 9479
     HEAP8[$11 >> 0] = 0; //@line 9480
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 9481
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 9482
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 9487
     $62 = $$0 + 8 | 0; //@line 9488
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 9491
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 94; //@line 9496
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 9498
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 9500
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 9502
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 9504
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 9506
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 9508
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 9510
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 9512
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 9514
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 9516
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 9518
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 9520
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 9522
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 9525
    sp = STACKTOP; //@line 9526
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 9530
  HEAP8[$11 >> 0] = $12; //@line 9531
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6887
      $10 = HEAP32[$9 >> 2] | 0; //@line 6888
      HEAP32[$2 >> 2] = $9 + 4; //@line 6890
      HEAP32[$0 >> 2] = $10; //@line 6891
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6907
      $17 = HEAP32[$16 >> 2] | 0; //@line 6908
      HEAP32[$2 >> 2] = $16 + 4; //@line 6910
      $20 = $0; //@line 6913
      HEAP32[$20 >> 2] = $17; //@line 6915
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 6918
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6934
      $30 = HEAP32[$29 >> 2] | 0; //@line 6935
      HEAP32[$2 >> 2] = $29 + 4; //@line 6937
      $31 = $0; //@line 6938
      HEAP32[$31 >> 2] = $30; //@line 6940
      HEAP32[$31 + 4 >> 2] = 0; //@line 6943
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 6959
      $41 = $40; //@line 6960
      $43 = HEAP32[$41 >> 2] | 0; //@line 6962
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 6965
      HEAP32[$2 >> 2] = $40 + 8; //@line 6967
      $47 = $0; //@line 6968
      HEAP32[$47 >> 2] = $43; //@line 6970
      HEAP32[$47 + 4 >> 2] = $46; //@line 6973
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6989
      $57 = HEAP32[$56 >> 2] | 0; //@line 6990
      HEAP32[$2 >> 2] = $56 + 4; //@line 6992
      $59 = ($57 & 65535) << 16 >> 16; //@line 6994
      $62 = $0; //@line 6997
      HEAP32[$62 >> 2] = $59; //@line 6999
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 7002
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7018
      $72 = HEAP32[$71 >> 2] | 0; //@line 7019
      HEAP32[$2 >> 2] = $71 + 4; //@line 7021
      $73 = $0; //@line 7023
      HEAP32[$73 >> 2] = $72 & 65535; //@line 7025
      HEAP32[$73 + 4 >> 2] = 0; //@line 7028
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7044
      $83 = HEAP32[$82 >> 2] | 0; //@line 7045
      HEAP32[$2 >> 2] = $82 + 4; //@line 7047
      $85 = ($83 & 255) << 24 >> 24; //@line 7049
      $88 = $0; //@line 7052
      HEAP32[$88 >> 2] = $85; //@line 7054
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 7057
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7073
      $98 = HEAP32[$97 >> 2] | 0; //@line 7074
      HEAP32[$2 >> 2] = $97 + 4; //@line 7076
      $99 = $0; //@line 7078
      HEAP32[$99 >> 2] = $98 & 255; //@line 7080
      HEAP32[$99 + 4 >> 2] = 0; //@line 7083
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7099
      $109 = +HEAPF64[$108 >> 3]; //@line 7100
      HEAP32[$2 >> 2] = $108 + 8; //@line 7102
      HEAPF64[$0 >> 3] = $109; //@line 7103
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7119
      $116 = +HEAPF64[$115 >> 3]; //@line 7120
      HEAP32[$2 >> 2] = $115 + 8; //@line 7122
      HEAPF64[$0 >> 3] = $116; //@line 7123
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
 sp = STACKTOP; //@line 5787
 STACKTOP = STACKTOP + 224 | 0; //@line 5788
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 5788
 $3 = sp + 120 | 0; //@line 5789
 $4 = sp + 80 | 0; //@line 5790
 $5 = sp; //@line 5791
 $6 = sp + 136 | 0; //@line 5792
 dest = $4; //@line 5793
 stop = dest + 40 | 0; //@line 5793
 do {
  HEAP32[dest >> 2] = 0; //@line 5793
  dest = dest + 4 | 0; //@line 5793
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 5795
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 5799
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 5806
  } else {
   $43 = 0; //@line 5808
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 5810
  $14 = $13 & 32; //@line 5811
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 5817
  }
  $19 = $0 + 48 | 0; //@line 5819
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 5824
    $24 = HEAP32[$23 >> 2] | 0; //@line 5825
    HEAP32[$23 >> 2] = $6; //@line 5826
    $25 = $0 + 28 | 0; //@line 5827
    HEAP32[$25 >> 2] = $6; //@line 5828
    $26 = $0 + 20 | 0; //@line 5829
    HEAP32[$26 >> 2] = $6; //@line 5830
    HEAP32[$19 >> 2] = 80; //@line 5831
    $28 = $0 + 16 | 0; //@line 5833
    HEAP32[$28 >> 2] = $6 + 80; //@line 5834
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 5835
    if (!$24) {
     $$1 = $29; //@line 5838
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 5841
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 5842
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 5843
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 82; //@line 5846
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 5848
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 5850
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 5852
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 5854
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 5856
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 5858
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 5860
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 5862
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 5864
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 5866
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 5868
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 5870
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 5872
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 5874
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 5876
      sp = STACKTOP; //@line 5877
      STACKTOP = sp; //@line 5878
      return 0; //@line 5878
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 5880
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 5883
      HEAP32[$23 >> 2] = $24; //@line 5884
      HEAP32[$19 >> 2] = 0; //@line 5885
      HEAP32[$28 >> 2] = 0; //@line 5886
      HEAP32[$25 >> 2] = 0; //@line 5887
      HEAP32[$26 >> 2] = 0; //@line 5888
      $$1 = $$; //@line 5889
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 5895
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 5898
  HEAP32[$0 >> 2] = $51 | $14; //@line 5903
  if ($43 | 0) {
   ___unlockfile($0); //@line 5906
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 5908
 }
 STACKTOP = sp; //@line 5910
 return $$0 | 0; //@line 5910
}
function __ZN4mbed6BusOut5writeEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $105 = 0, $14 = 0, $20 = 0, $26 = 0, $32 = 0, $38 = 0, $4 = 0, $44 = 0, $50 = 0, $56 = 0, $62 = 0, $68 = 0, $74 = 0, $80 = 0, $86 = 0, $9 = 0, $92 = 0, $98 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 296
 $4 = HEAP32[(HEAP32[$0 >> 2] | 0) + 8 >> 2] | 0; //@line 299
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 300
 FUNCTION_TABLE_vi[$4 & 127]($0); //@line 301
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 12; //@line 304
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 306
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 308
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 310
  sp = STACKTOP; //@line 311
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 314
 $9 = HEAP32[$0 + 4 >> 2] | 0; //@line 316
 if ($9 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$9 >> 2] | 0, $1 & 1 | 0) | 0; //@line 321
 }
 $14 = HEAP32[$0 + 8 >> 2] | 0; //@line 324
 if ($14 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$14 >> 2] | 0, $1 >>> 1 & 1 | 0) | 0; //@line 330
 }
 $20 = HEAP32[$0 + 12 >> 2] | 0; //@line 333
 if ($20 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$20 >> 2] | 0, $1 >>> 2 & 1 | 0) | 0; //@line 339
 }
 $26 = HEAP32[$0 + 16 >> 2] | 0; //@line 342
 if ($26 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$26 >> 2] | 0, $1 >>> 3 & 1 | 0) | 0; //@line 348
 }
 $32 = HEAP32[$0 + 20 >> 2] | 0; //@line 351
 if ($32 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$32 >> 2] | 0, $1 >>> 4 & 1 | 0) | 0; //@line 357
 }
 $38 = HEAP32[$0 + 24 >> 2] | 0; //@line 360
 if ($38 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$38 >> 2] | 0, $1 >>> 5 & 1 | 0) | 0; //@line 366
 }
 $44 = HEAP32[$0 + 28 >> 2] | 0; //@line 369
 if ($44 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$44 >> 2] | 0, $1 >>> 6 & 1 | 0) | 0; //@line 375
 }
 $50 = HEAP32[$0 + 32 >> 2] | 0; //@line 378
 if ($50 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$50 >> 2] | 0, $1 >>> 7 & 1 | 0) | 0; //@line 384
 }
 $56 = HEAP32[$0 + 36 >> 2] | 0; //@line 387
 if ($56 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$56 >> 2] | 0, $1 >>> 8 & 1 | 0) | 0; //@line 393
 }
 $62 = HEAP32[$0 + 40 >> 2] | 0; //@line 396
 if ($62 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$62 >> 2] | 0, $1 >>> 9 & 1 | 0) | 0; //@line 402
 }
 $68 = HEAP32[$0 + 44 >> 2] | 0; //@line 405
 if ($68 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$68 >> 2] | 0, $1 >>> 10 & 1 | 0) | 0; //@line 411
 }
 $74 = HEAP32[$0 + 48 >> 2] | 0; //@line 414
 if ($74 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$74 >> 2] | 0, $1 >>> 11 & 1 | 0) | 0; //@line 420
 }
 $80 = HEAP32[$0 + 52 >> 2] | 0; //@line 423
 if ($80 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$80 >> 2] | 0, $1 >>> 12 & 1 | 0) | 0; //@line 429
 }
 $86 = HEAP32[$0 + 56 >> 2] | 0; //@line 432
 if ($86 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$86 >> 2] | 0, $1 >>> 13 & 1 | 0) | 0; //@line 438
 }
 $92 = HEAP32[$0 + 60 >> 2] | 0; //@line 441
 if ($92 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$92 >> 2] | 0, $1 >>> 14 & 1 | 0) | 0; //@line 447
 }
 $98 = HEAP32[$0 + 64 >> 2] | 0; //@line 450
 if ($98 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$98 >> 2] | 0, $1 >>> 15 & 1 | 0) | 0; //@line 456
 }
 $105 = HEAP32[(HEAP32[$0 >> 2] | 0) + 12 >> 2] | 0; //@line 460
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 461
 FUNCTION_TABLE_vi[$105 & 127]($0); //@line 462
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 13; //@line 465
  sp = STACKTOP; //@line 466
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 469
  return;
 }
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 9021
 STACKTOP = STACKTOP + 64 | 0; //@line 9022
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 9022
 $4 = sp; //@line 9023
 $5 = HEAP32[$0 >> 2] | 0; //@line 9024
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 9027
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 9029
 HEAP32[$4 >> 2] = $2; //@line 9030
 HEAP32[$4 + 4 >> 2] = $0; //@line 9032
 HEAP32[$4 + 8 >> 2] = $1; //@line 9034
 HEAP32[$4 + 12 >> 2] = $3; //@line 9036
 $14 = $4 + 16 | 0; //@line 9037
 $15 = $4 + 20 | 0; //@line 9038
 $16 = $4 + 24 | 0; //@line 9039
 $17 = $4 + 28 | 0; //@line 9040
 $18 = $4 + 32 | 0; //@line 9041
 $19 = $4 + 40 | 0; //@line 9042
 dest = $14; //@line 9043
 stop = dest + 36 | 0; //@line 9043
 do {
  HEAP32[dest >> 2] = 0; //@line 9043
  dest = dest + 4 | 0; //@line 9043
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 9043
 HEAP8[$14 + 38 >> 0] = 0; //@line 9043
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 9048
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 9051
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 9052
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 9053
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 87; //@line 9056
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 9058
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 9060
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 9062
    sp = STACKTOP; //@line 9063
    STACKTOP = sp; //@line 9064
    return 0; //@line 9064
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9066
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 9070
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 9074
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 9077
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 9078
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 9079
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 88; //@line 9082
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 9084
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 9086
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 9088
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 9090
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 9092
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 9094
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 9096
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 9098
    sp = STACKTOP; //@line 9099
    STACKTOP = sp; //@line 9100
    return 0; //@line 9100
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9102
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 9116
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 9124
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 9140
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 9145
  }
 } while (0);
 STACKTOP = sp; //@line 9148
 return $$0 | 0; //@line 9148
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 5659
 $7 = ($2 | 0) != 0; //@line 5663
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 5667
   $$03555 = $0; //@line 5668
   $$03654 = $2; //@line 5668
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 5673
     $$036$lcssa64 = $$03654; //@line 5673
     label = 6; //@line 5674
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 5677
    $12 = $$03654 + -1 | 0; //@line 5678
    $16 = ($12 | 0) != 0; //@line 5682
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 5685
     $$03654 = $12; //@line 5685
    } else {
     $$035$lcssa = $11; //@line 5687
     $$036$lcssa = $12; //@line 5687
     $$lcssa = $16; //@line 5687
     label = 5; //@line 5688
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 5693
   $$036$lcssa = $2; //@line 5693
   $$lcssa = $7; //@line 5693
   label = 5; //@line 5694
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 5699
   $$036$lcssa64 = $$036$lcssa; //@line 5699
   label = 6; //@line 5700
  } else {
   $$2 = $$035$lcssa; //@line 5702
   $$3 = 0; //@line 5702
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 5708
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 5711
    $$3 = $$036$lcssa64; //@line 5711
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 5713
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 5717
      $$13745 = $$036$lcssa64; //@line 5717
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 5720
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 5729
       $30 = $$13745 + -4 | 0; //@line 5730
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 5733
        $$13745 = $30; //@line 5733
       } else {
        $$0$lcssa = $29; //@line 5735
        $$137$lcssa = $30; //@line 5735
        label = 11; //@line 5736
        break L11;
       }
      }
      $$140 = $$046; //@line 5740
      $$23839 = $$13745; //@line 5740
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 5742
      $$137$lcssa = $$036$lcssa64; //@line 5742
      label = 11; //@line 5743
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 5749
      $$3 = 0; //@line 5749
      break;
     } else {
      $$140 = $$0$lcssa; //@line 5752
      $$23839 = $$137$lcssa; //@line 5752
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 5759
      $$3 = $$23839; //@line 5759
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 5762
     $$23839 = $$23839 + -1 | 0; //@line 5763
     if (!$$23839) {
      $$2 = $35; //@line 5766
      $$3 = 0; //@line 5766
      break;
     } else {
      $$140 = $35; //@line 5769
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 5777
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 5430
 do {
  if (!$0) {
   do {
    if (!(HEAP32[74] | 0)) {
     $34 = 0; //@line 5438
    } else {
     $12 = HEAP32[74] | 0; //@line 5440
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5441
     $13 = _fflush($12) | 0; //@line 5442
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 78; //@line 5445
      sp = STACKTOP; //@line 5446
      return 0; //@line 5447
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 5449
      $34 = $13; //@line 5450
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 5456
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 5460
    } else {
     $$02327 = $$02325; //@line 5462
     $$02426 = $34; //@line 5462
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 5469
      } else {
       $28 = 0; //@line 5471
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 5479
       $25 = ___fflush_unlocked($$02327) | 0; //@line 5480
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 5485
       $$1 = $25 | $$02426; //@line 5487
      } else {
       $$1 = $$02426; //@line 5489
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 5493
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 5496
      if (!$$023) {
       $$024$lcssa = $$1; //@line 5499
       break L9;
      } else {
       $$02327 = $$023; //@line 5502
       $$02426 = $$1; //@line 5502
      }
     }
     HEAP32[$AsyncCtx >> 2] = 79; //@line 5505
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 5507
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 5509
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 5511
     sp = STACKTOP; //@line 5512
     return 0; //@line 5513
    }
   } while (0);
   ___ofl_unlock(); //@line 5516
   $$0 = $$024$lcssa; //@line 5517
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5523
    $5 = ___fflush_unlocked($0) | 0; //@line 5524
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 76; //@line 5527
     sp = STACKTOP; //@line 5528
     return 0; //@line 5529
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 5531
     $$0 = $5; //@line 5532
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 5537
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 5538
   $7 = ___fflush_unlocked($0) | 0; //@line 5539
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 77; //@line 5542
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 5545
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 5547
    sp = STACKTOP; //@line 5548
    return 0; //@line 5549
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5551
   if ($phitmp) {
    $$0 = $7; //@line 5553
   } else {
    ___unlockfile($0); //@line 5555
    $$0 = $7; //@line 5556
   }
  }
 } while (0);
 return $$0 | 0; //@line 5560
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9203
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 9209
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 9215
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 9218
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 9219
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 9220
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 91; //@line 9223
     sp = STACKTOP; //@line 9224
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9227
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 9235
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 9240
     $19 = $1 + 44 | 0; //@line 9241
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 9247
     HEAP8[$22 >> 0] = 0; //@line 9248
     $23 = $1 + 53 | 0; //@line 9249
     HEAP8[$23 >> 0] = 0; //@line 9250
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 9252
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 9255
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 9256
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 9257
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 90; //@line 9260
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 9262
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 9264
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 9266
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 9268
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 9270
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 9272
      sp = STACKTOP; //@line 9273
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 9276
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 9280
      label = 13; //@line 9281
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 9286
       label = 13; //@line 9287
      } else {
       $$037$off039 = 3; //@line 9289
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 9293
      $39 = $1 + 40 | 0; //@line 9294
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 9297
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 9307
        $$037$off039 = $$037$off038; //@line 9308
       } else {
        $$037$off039 = $$037$off038; //@line 9310
       }
      } else {
       $$037$off039 = $$037$off038; //@line 9313
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 9316
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 9323
   }
  }
 } while (0);
 return;
}
function __ZN4mbed6BusOut5writeEi__async_cb($0) {
 $0 = $0 | 0;
 var $104 = 0, $13 = 0, $19 = 0, $2 = 0, $25 = 0, $31 = 0, $37 = 0, $4 = 0, $43 = 0, $49 = 0, $55 = 0, $6 = 0, $61 = 0, $67 = 0, $73 = 0, $79 = 0, $8 = 0, $85 = 0, $91 = 0, $97 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12771
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12773
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12775
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12777
 $8 = HEAP32[$2 + 4 >> 2] | 0; //@line 12779
 if ($8 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$8 >> 2] | 0, $4 & 1 | 0) | 0; //@line 12784
 }
 $13 = HEAP32[$2 + 8 >> 2] | 0; //@line 12787
 if ($13 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$13 >> 2] | 0, $4 >>> 1 & 1 | 0) | 0; //@line 12793
 }
 $19 = HEAP32[$2 + 12 >> 2] | 0; //@line 12796
 if ($19 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$19 >> 2] | 0, $4 >>> 2 & 1 | 0) | 0; //@line 12802
 }
 $25 = HEAP32[$2 + 16 >> 2] | 0; //@line 12805
 if ($25 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$25 >> 2] | 0, $4 >>> 3 & 1 | 0) | 0; //@line 12811
 }
 $31 = HEAP32[$2 + 20 >> 2] | 0; //@line 12814
 if ($31 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$31 >> 2] | 0, $4 >>> 4 & 1 | 0) | 0; //@line 12820
 }
 $37 = HEAP32[$2 + 24 >> 2] | 0; //@line 12823
 if ($37 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$37 >> 2] | 0, $4 >>> 5 & 1 | 0) | 0; //@line 12829
 }
 $43 = HEAP32[$2 + 28 >> 2] | 0; //@line 12832
 if ($43 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$43 >> 2] | 0, $4 >>> 6 & 1 | 0) | 0; //@line 12838
 }
 $49 = HEAP32[$2 + 32 >> 2] | 0; //@line 12841
 if ($49 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$49 >> 2] | 0, $4 >>> 7 & 1 | 0) | 0; //@line 12847
 }
 $55 = HEAP32[$2 + 36 >> 2] | 0; //@line 12850
 if ($55 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$55 >> 2] | 0, $4 >>> 8 & 1 | 0) | 0; //@line 12856
 }
 $61 = HEAP32[$2 + 40 >> 2] | 0; //@line 12859
 if ($61 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$61 >> 2] | 0, $4 >>> 9 & 1 | 0) | 0; //@line 12865
 }
 $67 = HEAP32[$2 + 44 >> 2] | 0; //@line 12868
 if ($67 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$67 >> 2] | 0, $4 >>> 10 & 1 | 0) | 0; //@line 12874
 }
 $73 = HEAP32[$2 + 48 >> 2] | 0; //@line 12877
 if ($73 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$73 >> 2] | 0, $4 >>> 11 & 1 | 0) | 0; //@line 12883
 }
 $79 = HEAP32[$2 + 52 >> 2] | 0; //@line 12886
 if ($79 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$79 >> 2] | 0, $4 >>> 12 & 1 | 0) | 0; //@line 12892
 }
 $85 = HEAP32[$2 + 56 >> 2] | 0; //@line 12895
 if ($85 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$85 >> 2] | 0, $4 >>> 13 & 1 | 0) | 0; //@line 12901
 }
 $91 = HEAP32[$2 + 60 >> 2] | 0; //@line 12904
 if ($91 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$91 >> 2] | 0, $4 >>> 14 & 1 | 0) | 0; //@line 12910
 }
 $97 = HEAP32[$2 + 64 >> 2] | 0; //@line 12913
 if ($97 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$97 >> 2] | 0, $4 >>> 15 & 1 | 0) | 0; //@line 12919
 }
 $104 = HEAP32[(HEAP32[$6 >> 2] | 0) + 12 >> 2] | 0; //@line 12923
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 12924
 FUNCTION_TABLE_vi[$104 & 127]($2); //@line 12925
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 13; //@line 12928
  sp = STACKTOP; //@line 12929
  return;
 }
 ___async_unwind = 0; //@line 12932
 HEAP32[$ReallocAsyncCtx2 >> 2] = 13; //@line 12933
 sp = STACKTOP; //@line 12934
 return;
}
function __ZN4mbed6BusOutC2E7PinNameS1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1___async_cb($0) {
 $0 = $0 | 0;
 var $$02932$reg2mem$0 = 0, $$pre = 0, $10 = 0, $12 = 0, $14 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11484
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11486
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11488
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11490
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11492
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11494
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11496
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 11498
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11500
 HEAP32[$AsyncRetVal >> 2] = 0; //@line 11501
 HEAP32[$AsyncRetVal + 4 >> 2] = 0; //@line 11501
 HEAP32[$AsyncRetVal + 8 >> 2] = 0; //@line 11501
 HEAP32[$AsyncRetVal + 12 >> 2] = 0; //@line 11501
 HEAP32[$AsyncRetVal + 16 >> 2] = 0; //@line 11501
 HEAP32[$AsyncRetVal + 20 >> 2] = 0; //@line 11501
 _gpio_init_out($AsyncRetVal, $2); //@line 11502
 HEAP32[$4 + 4 + ($6 << 2) >> 2] = $AsyncRetVal; //@line 11504
 HEAP32[$8 >> 2] = HEAP32[$8 >> 2] | 1 << $6; //@line 11508
 $$02932$reg2mem$0 = $6; //@line 11509
 while (1) {
  $18 = $$02932$reg2mem$0 + 1 | 0; //@line 11511
  if (($$02932$reg2mem$0 | 0) >= 15) {
   label = 2; //@line 11514
   break;
  }
  $$pre = HEAP32[$10 + ($18 << 2) >> 2] | 0; //@line 11518
  if (($$pre | 0) != -1) {
   break;
  }
  HEAP32[$4 + 4 + ($18 << 2) >> 2] = 0; //@line 11524
  $$02932$reg2mem$0 = $18; //@line 11525
 }
 if ((label | 0) == 2) {
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(32) | 0; //@line 11530
 $19 = __Znwj(24) | 0; //@line 11531
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 11; //@line 11534
  $20 = $ReallocAsyncCtx + 4 | 0; //@line 11535
  HEAP32[$20 >> 2] = $$pre; //@line 11536
  $21 = $ReallocAsyncCtx + 8 | 0; //@line 11537
  HEAP32[$21 >> 2] = $4; //@line 11538
  $22 = $ReallocAsyncCtx + 12 | 0; //@line 11539
  HEAP32[$22 >> 2] = $18; //@line 11540
  $23 = $ReallocAsyncCtx + 16 | 0; //@line 11541
  HEAP32[$23 >> 2] = $8; //@line 11542
  $24 = $ReallocAsyncCtx + 20 | 0; //@line 11543
  HEAP32[$24 >> 2] = $10; //@line 11544
  $25 = $ReallocAsyncCtx + 24 | 0; //@line 11545
  HEAP32[$25 >> 2] = $12; //@line 11546
  $26 = $ReallocAsyncCtx + 28 | 0; //@line 11547
  HEAP32[$26 >> 2] = $14; //@line 11548
  sp = STACKTOP; //@line 11549
  return;
 }
 HEAP32[___async_retval >> 2] = $19; //@line 11553
 ___async_unwind = 0; //@line 11554
 HEAP32[$ReallocAsyncCtx >> 2] = 11; //@line 11555
 $20 = $ReallocAsyncCtx + 4 | 0; //@line 11556
 HEAP32[$20 >> 2] = $$pre; //@line 11557
 $21 = $ReallocAsyncCtx + 8 | 0; //@line 11558
 HEAP32[$21 >> 2] = $4; //@line 11559
 $22 = $ReallocAsyncCtx + 12 | 0; //@line 11560
 HEAP32[$22 >> 2] = $18; //@line 11561
 $23 = $ReallocAsyncCtx + 16 | 0; //@line 11562
 HEAP32[$23 >> 2] = $8; //@line 11563
 $24 = $ReallocAsyncCtx + 20 | 0; //@line 11564
 HEAP32[$24 >> 2] = $10; //@line 11565
 $25 = $ReallocAsyncCtx + 24 | 0; //@line 11566
 HEAP32[$25 >> 2] = $12; //@line 11567
 $26 = $ReallocAsyncCtx + 28 | 0; //@line 11568
 HEAP32[$26 >> 2] = $14; //@line 11569
 sp = STACKTOP; //@line 11570
 return;
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4707
 STACKTOP = STACKTOP + 48 | 0; //@line 4708
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 4708
 $vararg_buffer3 = sp + 16 | 0; //@line 4709
 $vararg_buffer = sp; //@line 4710
 $3 = sp + 32 | 0; //@line 4711
 $4 = $0 + 28 | 0; //@line 4712
 $5 = HEAP32[$4 >> 2] | 0; //@line 4713
 HEAP32[$3 >> 2] = $5; //@line 4714
 $7 = $0 + 20 | 0; //@line 4716
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 4718
 HEAP32[$3 + 4 >> 2] = $9; //@line 4719
 HEAP32[$3 + 8 >> 2] = $1; //@line 4721
 HEAP32[$3 + 12 >> 2] = $2; //@line 4723
 $12 = $9 + $2 | 0; //@line 4724
 $13 = $0 + 60 | 0; //@line 4725
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 4728
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 4730
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 4732
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 4734
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 4738
  } else {
   $$04756 = 2; //@line 4740
   $$04855 = $12; //@line 4740
   $$04954 = $3; //@line 4740
   $27 = $17; //@line 4740
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 4746
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 4748
    $38 = $27 >>> 0 > $37 >>> 0; //@line 4749
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 4751
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 4753
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 4755
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 4758
    $44 = $$150 + 4 | 0; //@line 4759
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 4762
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 4765
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 4767
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 4769
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 4771
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 4774
     break L1;
    } else {
     $$04756 = $$1; //@line 4777
     $$04954 = $$150; //@line 4777
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 4781
   HEAP32[$4 >> 2] = 0; //@line 4782
   HEAP32[$7 >> 2] = 0; //@line 4783
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 4786
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 4789
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 4794
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 4800
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 4805
  $25 = $20; //@line 4806
  HEAP32[$4 >> 2] = $25; //@line 4807
  HEAP32[$7 >> 2] = $25; //@line 4808
  $$051 = $2; //@line 4809
 }
 STACKTOP = sp; //@line 4811
 return $$051 | 0; //@line 4811
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
 sp = STACKTOP; //@line 192
 STACKTOP = STACKTOP + 64 | 0; //@line 193
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 193
 $17 = sp; //@line 194
 HEAP32[$0 >> 2] = 152; //@line 195
 HEAP32[$17 >> 2] = $1; //@line 196
 HEAP32[$17 + 4 >> 2] = $2; //@line 198
 HEAP32[$17 + 8 >> 2] = $3; //@line 200
 HEAP32[$17 + 12 >> 2] = $4; //@line 202
 HEAP32[$17 + 16 >> 2] = $5; //@line 204
 HEAP32[$17 + 20 >> 2] = $6; //@line 206
 HEAP32[$17 + 24 >> 2] = $7; //@line 208
 HEAP32[$17 + 28 >> 2] = $8; //@line 210
 HEAP32[$17 + 32 >> 2] = $9; //@line 212
 HEAP32[$17 + 36 >> 2] = $10; //@line 214
 HEAP32[$17 + 40 >> 2] = $11; //@line 216
 HEAP32[$17 + 44 >> 2] = $12; //@line 218
 HEAP32[$17 + 48 >> 2] = $13; //@line 220
 HEAP32[$17 + 52 >> 2] = $14; //@line 222
 HEAP32[$17 + 56 >> 2] = $15; //@line 224
 HEAP32[$17 + 60 >> 2] = $16; //@line 226
 $33 = $0 + 68 | 0; //@line 227
 HEAP32[$33 >> 2] = 0; //@line 228
 $$02932 = 0; //@line 229
 $35 = $1; //@line 229
 while (1) {
  if (($35 | 0) == -1) {
   HEAP32[$0 + 4 + ($$02932 << 2) >> 2] = 0; //@line 234
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(32, sp) | 0; //@line 236
   $37 = __Znwj(24) | 0; //@line 237
   if (___async) {
    label = 6; //@line 240
    break;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 243
   HEAP32[$37 >> 2] = 0; //@line 244
   HEAP32[$37 + 4 >> 2] = 0; //@line 244
   HEAP32[$37 + 8 >> 2] = 0; //@line 244
   HEAP32[$37 + 12 >> 2] = 0; //@line 244
   HEAP32[$37 + 16 >> 2] = 0; //@line 244
   HEAP32[$37 + 20 >> 2] = 0; //@line 244
   _gpio_init_out($37, $35); //@line 245
   HEAP32[$0 + 4 + ($$02932 << 2) >> 2] = $37; //@line 247
   HEAP32[$33 >> 2] = HEAP32[$33 >> 2] | 1 << $$02932; //@line 251
  }
  $49 = $$02932 + 1 | 0; //@line 253
  if (($$02932 | 0) >= 15) {
   label = 2; //@line 256
   break;
  }
  $$02932 = $49; //@line 261
  $35 = HEAP32[$17 + ($49 << 2) >> 2] | 0; //@line 261
 }
 if ((label | 0) == 2) {
  STACKTOP = sp; //@line 264
  return;
 } else if ((label | 0) == 6) {
  HEAP32[$AsyncCtx >> 2] = 11; //@line 267
  HEAP32[$AsyncCtx + 4 >> 2] = $35; //@line 269
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 271
  HEAP32[$AsyncCtx + 12 >> 2] = $$02932; //@line 273
  HEAP32[$AsyncCtx + 16 >> 2] = $33; //@line 275
  HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 277
  HEAP32[$AsyncCtx + 24 >> 2] = $17; //@line 279
  HEAP32[$AsyncCtx + 28 >> 2] = $1; //@line 281
  sp = STACKTOP; //@line 282
  STACKTOP = sp; //@line 283
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_62($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12653
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12657
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12659
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 12661
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12663
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 12665
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12667
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12669
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 12671
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 12673
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 12676
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 12678
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 12682
   $27 = $6 + 24 | 0; //@line 12683
   $28 = $4 + 8 | 0; //@line 12684
   $29 = $6 + 54 | 0; //@line 12685
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
    HEAP8[$10 >> 0] = 0; //@line 12715
    HEAP8[$14 >> 0] = 0; //@line 12716
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 12717
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 12718
    if (!___async) {
     ___async_unwind = 0; //@line 12721
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 94; //@line 12723
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 12725
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 12727
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 12729
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 12731
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 12733
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 12735
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 12737
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 12739
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 12741
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 12743
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 12745
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 12747
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 12749
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 12752
    sp = STACKTOP; //@line 12753
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 12758
 HEAP8[$14 >> 0] = $12; //@line 12759
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12537
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12541
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12543
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 12545
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12547
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 12549
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12551
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12553
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 12555
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 12557
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 12559
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 12561
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 12563
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 12566
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 12567
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
    HEAP8[$10 >> 0] = 0; //@line 12600
    HEAP8[$14 >> 0] = 0; //@line 12601
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 12602
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 12603
    if (!___async) {
     ___async_unwind = 0; //@line 12606
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 94; //@line 12608
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 12610
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 12612
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 12614
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 12616
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 12618
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 12620
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 12622
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 12624
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 12626
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 12628
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 12630
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 12632
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 12634
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 12637
    sp = STACKTOP; //@line 12638
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 12643
 HEAP8[$14 >> 0] = $12; //@line 12644
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 13412
 }
 ret = dest | 0; //@line 13415
 dest_end = dest + num | 0; //@line 13416
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 13420
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 13421
   dest = dest + 1 | 0; //@line 13422
   src = src + 1 | 0; //@line 13423
   num = num - 1 | 0; //@line 13424
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 13426
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 13427
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 13429
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 13430
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 13431
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 13432
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 13433
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 13434
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 13435
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 13436
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 13437
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 13438
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 13439
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 13440
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 13441
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 13442
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 13443
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 13444
   dest = dest + 64 | 0; //@line 13445
   src = src + 64 | 0; //@line 13446
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 13449
   dest = dest + 4 | 0; //@line 13450
   src = src + 4 | 0; //@line 13451
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 13455
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 13457
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 13458
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 13459
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 13460
   dest = dest + 4 | 0; //@line 13461
   src = src + 4 | 0; //@line 13462
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 13467
  dest = dest + 1 | 0; //@line 13468
  src = src + 1 | 0; //@line 13469
 }
 return ret | 0; //@line 13471
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 8704
 STACKTOP = STACKTOP + 64 | 0; //@line 8705
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 8705
 $3 = sp; //@line 8706
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 8709
 } else {
  if (!$1) {
   $$2 = 0; //@line 8713
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 8715
   $6 = ___dynamic_cast($1, 56, 40, 0) | 0; //@line 8716
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 85; //@line 8719
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 8721
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 8723
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 8725
    sp = STACKTOP; //@line 8726
    STACKTOP = sp; //@line 8727
    return 0; //@line 8727
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8729
   if (!$6) {
    $$2 = 0; //@line 8732
   } else {
    dest = $3 + 4 | 0; //@line 8735
    stop = dest + 52 | 0; //@line 8735
    do {
     HEAP32[dest >> 2] = 0; //@line 8735
     dest = dest + 4 | 0; //@line 8735
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 8736
    HEAP32[$3 + 8 >> 2] = $0; //@line 8738
    HEAP32[$3 + 12 >> 2] = -1; //@line 8740
    HEAP32[$3 + 48 >> 2] = 1; //@line 8742
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 8745
    $18 = HEAP32[$2 >> 2] | 0; //@line 8746
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8747
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 8748
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 86; //@line 8751
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 8753
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 8755
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 8757
     sp = STACKTOP; //@line 8758
     STACKTOP = sp; //@line 8759
     return 0; //@line 8759
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 8761
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 8768
     $$0 = 1; //@line 8769
    } else {
     $$0 = 0; //@line 8771
    }
    $$2 = $$0; //@line 8773
   }
  }
 }
 STACKTOP = sp; //@line 8777
 return $$2 | 0; //@line 8777
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 9938
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 9944
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 9948
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 9949
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 9950
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 9951
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 100; //@line 9954
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 9956
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 9958
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 9960
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 9962
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 9964
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 9966
    sp = STACKTOP; //@line 9967
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9970
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 9974
    $$0 = $0 + 24 | 0; //@line 9975
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 9977
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 9978
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 9983
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 9989
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 9992
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 101; //@line 9997
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 9999
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 10001
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 10003
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 10005
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 10007
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 10009
    sp = STACKTOP; //@line 10010
    return;
   }
  }
 } while (0);
 return;
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 8532
 STACKTOP = STACKTOP + 128 | 0; //@line 8533
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 8533
 $4 = sp + 124 | 0; //@line 8534
 $5 = sp; //@line 8535
 dest = $5; //@line 8536
 src = 544; //@line 8536
 stop = dest + 124 | 0; //@line 8536
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 8536
  dest = dest + 4 | 0; //@line 8536
  src = src + 4 | 0; //@line 8536
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 8542
   $$015 = 1; //@line 8542
   label = 4; //@line 8543
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 8546
   $$0 = -1; //@line 8547
  }
 } else {
  $$014 = $0; //@line 8550
  $$015 = $1; //@line 8550
  label = 4; //@line 8551
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 8555
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 8557
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 8559
  $14 = $5 + 20 | 0; //@line 8560
  HEAP32[$14 >> 2] = $$014; //@line 8561
  HEAP32[$5 + 44 >> 2] = $$014; //@line 8563
  $16 = $$014 + $$$015 | 0; //@line 8564
  $17 = $5 + 16 | 0; //@line 8565
  HEAP32[$17 >> 2] = $16; //@line 8566
  HEAP32[$5 + 28 >> 2] = $16; //@line 8568
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 8569
  $19 = _vfprintf($5, $2, $3) | 0; //@line 8570
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 83; //@line 8573
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 8575
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 8577
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 8579
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 8581
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 8583
   sp = STACKTOP; //@line 8584
   STACKTOP = sp; //@line 8585
   return 0; //@line 8585
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 8587
  if (!$$$015) {
   $$0 = $19; //@line 8590
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 8592
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 8597
   $$0 = $19; //@line 8598
  }
 }
 STACKTOP = sp; //@line 8601
 return $$0 | 0; //@line 8601
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 5295
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 5298
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 5301
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 5304
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 5310
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 5319
     $24 = $13 >>> 2; //@line 5320
     $$090 = 0; //@line 5321
     $$094 = $7; //@line 5321
     while (1) {
      $25 = $$094 >>> 1; //@line 5323
      $26 = $$090 + $25 | 0; //@line 5324
      $27 = $26 << 1; //@line 5325
      $28 = $27 + $23 | 0; //@line 5326
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 5329
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 5333
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 5339
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 5347
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 5351
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 5357
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 5362
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 5365
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 5365
      }
     }
     $46 = $27 + $24 | 0; //@line 5368
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 5371
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 5375
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 5387
     } else {
      $$4 = 0; //@line 5389
     }
    } else {
     $$4 = 0; //@line 5392
    }
   } else {
    $$4 = 0; //@line 5395
   }
  } else {
   $$4 = 0; //@line 5398
  }
 } while (0);
 return $$4 | 0; //@line 5401
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4960
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 4965
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 4970
  } else {
   $20 = $0 & 255; //@line 4972
   $21 = $0 & 255; //@line 4973
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 4979
   } else {
    $26 = $1 + 20 | 0; //@line 4981
    $27 = HEAP32[$26 >> 2] | 0; //@line 4982
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 4988
     HEAP8[$27 >> 0] = $20; //@line 4989
     $34 = $21; //@line 4990
    } else {
     label = 12; //@line 4992
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 4997
     $32 = ___overflow($1, $0) | 0; //@line 4998
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 74; //@line 5001
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 5003
      sp = STACKTOP; //@line 5004
      return 0; //@line 5005
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 5007
      $34 = $32; //@line 5008
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 5013
   $$0 = $34; //@line 5014
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 5019
   $8 = $0 & 255; //@line 5020
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 5026
    $14 = HEAP32[$13 >> 2] | 0; //@line 5027
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 5033
     HEAP8[$14 >> 0] = $7; //@line 5034
     $$0 = $8; //@line 5035
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5039
   $19 = ___overflow($1, $0) | 0; //@line 5040
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 73; //@line 5043
    sp = STACKTOP; //@line 5044
    return 0; //@line 5045
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5047
    $$0 = $19; //@line 5048
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 5053
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5566
 $1 = $0 + 20 | 0; //@line 5567
 $3 = $0 + 28 | 0; //@line 5569
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 5575
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 5576
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 5577
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 80; //@line 5580
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 5582
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 5584
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 5586
    sp = STACKTOP; //@line 5587
    return 0; //@line 5588
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5590
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 5594
     break;
    } else {
     label = 5; //@line 5597
     break;
    }
   }
  } else {
   label = 5; //@line 5602
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 5606
  $14 = HEAP32[$13 >> 2] | 0; //@line 5607
  $15 = $0 + 8 | 0; //@line 5608
  $16 = HEAP32[$15 >> 2] | 0; //@line 5609
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 5617
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 5618
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 5619
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 81; //@line 5622
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 5624
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 5626
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 5628
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 5630
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 5632
     sp = STACKTOP; //@line 5633
     return 0; //@line 5634
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5636
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 5642
  HEAP32[$3 >> 2] = 0; //@line 5643
  HEAP32[$1 >> 2] = 0; //@line 5644
  HEAP32[$15 >> 2] = 0; //@line 5645
  HEAP32[$13 >> 2] = 0; //@line 5646
  $$0 = 0; //@line 5647
 }
 return $$0 | 0; //@line 5649
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $$09$i = 0, $1 = 0, $12 = 0, $18 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 827
 STACKTOP = STACKTOP + 144 | 0; //@line 828
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(144); //@line 828
 $1 = sp + 16 | 0; //@line 829
 $2 = sp; //@line 830
 HEAP32[$2 >> 2] = $varargs; //@line 831
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 832
 $3 = _vsnprintf($1, 128, $0, $2) | 0; //@line 833
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 32; //@line 836
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 838
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 840
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 842
  sp = STACKTOP; //@line 843
  STACKTOP = sp; //@line 844
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 846
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 849
  return;
 }
 if (!(HEAP32[926] | 0)) {
  _serial_init(3708, 2, 3); //@line 854
  $$09$i = 0; //@line 855
 } else {
  $$09$i = 0; //@line 857
 }
 while (1) {
  $12 = HEAP8[$1 + $$09$i >> 0] | 0; //@line 862
  $AsyncCtx2 = _emscripten_alloc_async_context(24, sp) | 0; //@line 863
  _serial_putc(3708, $12); //@line 864
  if (___async) {
   label = 7; //@line 867
   break;
  }
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 870
  $18 = $$09$i + 1 | 0; //@line 871
  if (($18 | 0) == ($3 | 0)) {
   label = 9; //@line 874
   break;
  } else {
   $$09$i = $18; //@line 877
  }
 }
 if ((label | 0) == 7) {
  HEAP32[$AsyncCtx2 >> 2] = 33; //@line 881
  HEAP32[$AsyncCtx2 + 4 >> 2] = $$09$i; //@line 883
  HEAP32[$AsyncCtx2 + 8 >> 2] = $3; //@line 885
  HEAP32[$AsyncCtx2 + 12 >> 2] = $1; //@line 887
  HEAP32[$AsyncCtx2 + 16 >> 2] = $2; //@line 889
  HEAP32[$AsyncCtx2 + 20 >> 2] = $1; //@line 891
  sp = STACKTOP; //@line 892
  STACKTOP = sp; //@line 893
  return;
 } else if ((label | 0) == 9) {
  STACKTOP = sp; //@line 896
  return;
 }
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 5186
 $4 = HEAP32[$3 >> 2] | 0; //@line 5187
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 5194
   label = 5; //@line 5195
  } else {
   $$1 = 0; //@line 5197
  }
 } else {
  $12 = $4; //@line 5201
  label = 5; //@line 5202
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 5206
   $10 = HEAP32[$9 >> 2] | 0; //@line 5207
   $14 = $10; //@line 5210
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 5215
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 5223
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 5227
       $$141 = $0; //@line 5227
       $$143 = $1; //@line 5227
       $31 = $14; //@line 5227
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 5230
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 5237
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 5242
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 5245
      break L5;
     }
     $$139 = $$038; //@line 5251
     $$141 = $0 + $$038 | 0; //@line 5251
     $$143 = $1 - $$038 | 0; //@line 5251
     $31 = HEAP32[$9 >> 2] | 0; //@line 5251
    } else {
     $$139 = 0; //@line 5253
     $$141 = $0; //@line 5253
     $$143 = $1; //@line 5253
     $31 = $14; //@line 5253
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 5256
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 5259
   $$1 = $$139 + $$143 | 0; //@line 5261
  }
 } while (0);
 return $$1 | 0; //@line 5264
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_35($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11022
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11026
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11028
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11030
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11032
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11034
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 11036
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 11038
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 11041
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 11042
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 11058
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 11059
    if (!___async) {
     ___async_unwind = 0; //@line 11062
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 98; //@line 11064
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 11066
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 11068
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 11070
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 11072
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 11074
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 11076
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 11078
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 11080
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 11083
    sp = STACKTOP; //@line 11084
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
 sp = STACKTOP; //@line 5072
 STACKTOP = STACKTOP + 16 | 0; //@line 5073
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 5073
 $2 = sp; //@line 5074
 $3 = $1 & 255; //@line 5075
 HEAP8[$2 >> 0] = $3; //@line 5076
 $4 = $0 + 16 | 0; //@line 5077
 $5 = HEAP32[$4 >> 2] | 0; //@line 5078
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 5085
   label = 4; //@line 5086
  } else {
   $$0 = -1; //@line 5088
  }
 } else {
  $12 = $5; //@line 5091
  label = 4; //@line 5092
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 5096
   $10 = HEAP32[$9 >> 2] | 0; //@line 5097
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 5100
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 5107
     HEAP8[$10 >> 0] = $3; //@line 5108
     $$0 = $13; //@line 5109
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 5114
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 5115
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 5116
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 75; //@line 5119
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 5121
    sp = STACKTOP; //@line 5122
    STACKTOP = sp; //@line 5123
    return 0; //@line 5123
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 5125
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 5130
   } else {
    $$0 = -1; //@line 5132
   }
  }
 } while (0);
 STACKTOP = sp; //@line 5136
 return $$0 | 0; //@line 5136
}
function __ZN4mbed6BusOutD2Ev($0) {
 $0 = $0 | 0;
 var $11 = 0, $14 = 0, $17 = 0, $2 = 0, $20 = 0, $23 = 0, $26 = 0, $29 = 0, $32 = 0, $35 = 0, $38 = 0, $41 = 0, $44 = 0, $47 = 0, $5 = 0, $8 = 0;
 HEAP32[$0 >> 2] = 152; //@line 51
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 53
 if ($2 | 0) {
  __ZdlPv($2); //@line 56
 }
 $5 = HEAP32[$0 + 8 >> 2] | 0; //@line 59
 if ($5 | 0) {
  __ZdlPv($5); //@line 62
 }
 $8 = HEAP32[$0 + 12 >> 2] | 0; //@line 65
 if ($8 | 0) {
  __ZdlPv($8); //@line 68
 }
 $11 = HEAP32[$0 + 16 >> 2] | 0; //@line 71
 if ($11 | 0) {
  __ZdlPv($11); //@line 74
 }
 $14 = HEAP32[$0 + 20 >> 2] | 0; //@line 77
 if ($14 | 0) {
  __ZdlPv($14); //@line 80
 }
 $17 = HEAP32[$0 + 24 >> 2] | 0; //@line 83
 if ($17 | 0) {
  __ZdlPv($17); //@line 86
 }
 $20 = HEAP32[$0 + 28 >> 2] | 0; //@line 89
 if ($20 | 0) {
  __ZdlPv($20); //@line 92
 }
 $23 = HEAP32[$0 + 32 >> 2] | 0; //@line 95
 if ($23 | 0) {
  __ZdlPv($23); //@line 98
 }
 $26 = HEAP32[$0 + 36 >> 2] | 0; //@line 101
 if ($26 | 0) {
  __ZdlPv($26); //@line 104
 }
 $29 = HEAP32[$0 + 40 >> 2] | 0; //@line 107
 if ($29 | 0) {
  __ZdlPv($29); //@line 110
 }
 $32 = HEAP32[$0 + 44 >> 2] | 0; //@line 113
 if ($32 | 0) {
  __ZdlPv($32); //@line 116
 }
 $35 = HEAP32[$0 + 48 >> 2] | 0; //@line 119
 if ($35 | 0) {
  __ZdlPv($35); //@line 122
 }
 $38 = HEAP32[$0 + 52 >> 2] | 0; //@line 125
 if ($38 | 0) {
  __ZdlPv($38); //@line 128
 }
 $41 = HEAP32[$0 + 56 >> 2] | 0; //@line 131
 if ($41 | 0) {
  __ZdlPv($41); //@line 134
 }
 $44 = HEAP32[$0 + 60 >> 2] | 0; //@line 137
 if ($44 | 0) {
  __ZdlPv($44); //@line 140
 }
 $47 = HEAP32[$0 + 64 >> 2] | 0; //@line 143
 if (!$47) {
  return;
 }
 __ZdlPv($47); //@line 148
 return;
}
function _fflush__async_cb_58($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12242
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12244
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 12246
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 12250
  } else {
   $$02327 = $$02325; //@line 12252
   $$02426 = $AsyncRetVal; //@line 12252
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 12259
    } else {
     $16 = 0; //@line 12261
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 12273
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 12276
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 12279
     break L3;
    } else {
     $$02327 = $$023; //@line 12282
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 12285
   $13 = ___fflush_unlocked($$02327) | 0; //@line 12286
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 12290
    ___async_unwind = 0; //@line 12291
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 79; //@line 12293
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 12295
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 12297
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 12299
   sp = STACKTOP; //@line 12300
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 12304
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 12306
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 13476
 value = value & 255; //@line 13478
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 13481
   ptr = ptr + 1 | 0; //@line 13482
  }
  aligned_end = end & -4 | 0; //@line 13485
  block_aligned_end = aligned_end - 64 | 0; //@line 13486
  value4 = value | value << 8 | value << 16 | value << 24; //@line 13487
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 13490
   HEAP32[ptr + 4 >> 2] = value4; //@line 13491
   HEAP32[ptr + 8 >> 2] = value4; //@line 13492
   HEAP32[ptr + 12 >> 2] = value4; //@line 13493
   HEAP32[ptr + 16 >> 2] = value4; //@line 13494
   HEAP32[ptr + 20 >> 2] = value4; //@line 13495
   HEAP32[ptr + 24 >> 2] = value4; //@line 13496
   HEAP32[ptr + 28 >> 2] = value4; //@line 13497
   HEAP32[ptr + 32 >> 2] = value4; //@line 13498
   HEAP32[ptr + 36 >> 2] = value4; //@line 13499
   HEAP32[ptr + 40 >> 2] = value4; //@line 13500
   HEAP32[ptr + 44 >> 2] = value4; //@line 13501
   HEAP32[ptr + 48 >> 2] = value4; //@line 13502
   HEAP32[ptr + 52 >> 2] = value4; //@line 13503
   HEAP32[ptr + 56 >> 2] = value4; //@line 13504
   HEAP32[ptr + 60 >> 2] = value4; //@line 13505
   ptr = ptr + 64 | 0; //@line 13506
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 13510
   ptr = ptr + 4 | 0; //@line 13511
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 13516
  ptr = ptr + 1 | 0; //@line 13517
 }
 return end - num | 0; //@line 13519
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10959
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10963
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10965
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10967
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10969
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10971
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 10973
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 10976
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 10977
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 10986
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 10987
    if (!___async) {
     ___async_unwind = 0; //@line 10990
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 99; //@line 10992
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 10994
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 10996
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 10998
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 11000
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 11002
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 11004
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 11006
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 11009
    sp = STACKTOP; //@line 11010
    return;
   }
  }
 }
 return;
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12143
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 12153
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 12153
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 12153
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 12157
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 12160
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 12163
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 12171
  } else {
   $20 = 0; //@line 12173
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 12183
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 12187
  HEAP32[___async_retval >> 2] = $$1; //@line 12189
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 12192
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 12193
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 12197
  ___async_unwind = 0; //@line 12198
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 79; //@line 12200
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 12202
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 12204
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 12206
 sp = STACKTOP; //@line 12207
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12051
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12053
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12055
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12057
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 12062
  } else {
   $9 = $4 + 4 | 0; //@line 12064
   $10 = HEAP32[$9 >> 2] | 0; //@line 12065
   $11 = $4 + 8 | 0; //@line 12066
   $12 = HEAP32[$11 >> 2] | 0; //@line 12067
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 12071
    HEAP32[$6 >> 2] = 0; //@line 12072
    HEAP32[$2 >> 2] = 0; //@line 12073
    HEAP32[$11 >> 2] = 0; //@line 12074
    HEAP32[$9 >> 2] = 0; //@line 12075
    $$0 = 0; //@line 12076
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 12083
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 12084
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 12085
   if (!___async) {
    ___async_unwind = 0; //@line 12088
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 81; //@line 12090
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 12092
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 12094
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 12096
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 12098
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 12100
   sp = STACKTOP; //@line 12101
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 12106
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_59($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12339
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12341
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12343
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12345
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12347
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 12352
  return;
 }
 dest = $2 + 4 | 0; //@line 12356
 stop = dest + 52 | 0; //@line 12356
 do {
  HEAP32[dest >> 2] = 0; //@line 12356
  dest = dest + 4 | 0; //@line 12356
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 12357
 HEAP32[$2 + 8 >> 2] = $4; //@line 12359
 HEAP32[$2 + 12 >> 2] = -1; //@line 12361
 HEAP32[$2 + 48 >> 2] = 1; //@line 12363
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 12366
 $16 = HEAP32[$6 >> 2] | 0; //@line 12367
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 12368
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 12369
 if (!___async) {
  ___async_unwind = 0; //@line 12372
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 86; //@line 12374
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 12376
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 12378
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 12380
 sp = STACKTOP; //@line 12381
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 8338
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 8343
    $$0 = 1; //@line 8344
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 8357
     $$0 = 1; //@line 8358
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 8362
     $$0 = -1; //@line 8363
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 8373
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 8377
    $$0 = 2; //@line 8378
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 8390
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 8396
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 8400
    $$0 = 3; //@line 8401
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 8411
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 8417
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 8423
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 8427
    $$0 = 4; //@line 8428
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 8432
    $$0 = -1; //@line 8433
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 8438
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_36($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11095
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11099
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11101
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11103
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11105
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11107
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 11110
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 11111
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 11117
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 11118
   if (!___async) {
    ___async_unwind = 0; //@line 11121
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 97; //@line 11123
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 11125
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 11127
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 11129
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 11131
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 11133
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 11135
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 11138
   sp = STACKTOP; //@line 11139
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
  $$0914 = $2; //@line 7222
  $8 = $0; //@line 7222
  $9 = $1; //@line 7222
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 7224
   $$0914 = $$0914 + -1 | 0; //@line 7228
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 7229
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 7230
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 7238
   }
  }
  $$010$lcssa$off0 = $8; //@line 7243
  $$09$lcssa = $$0914; //@line 7243
 } else {
  $$010$lcssa$off0 = $0; //@line 7245
  $$09$lcssa = $2; //@line 7245
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 7249
 } else {
  $$012 = $$010$lcssa$off0; //@line 7251
  $$111 = $$09$lcssa; //@line 7251
  while (1) {
   $26 = $$111 + -1 | 0; //@line 7256
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 7257
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 7261
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 7264
    $$111 = $26; //@line 7264
   }
  }
 }
 return $$1$lcssa | 0; //@line 7268
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10282
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10284
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10288
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10290
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10292
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10294
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 10298
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 10301
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 10302
   if (!___async) {
    ___async_unwind = 0; //@line 10305
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 101; //@line 10307
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 10309
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 10311
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 10313
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 10315
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 10317
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 10319
   sp = STACKTOP; //@line 10320
   return;
  }
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 8951
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 8958
   $10 = $1 + 16 | 0; //@line 8959
   $11 = HEAP32[$10 >> 2] | 0; //@line 8960
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 8963
    HEAP32[$1 + 24 >> 2] = $4; //@line 8965
    HEAP32[$1 + 36 >> 2] = 1; //@line 8967
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 8977
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 8982
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 8985
    HEAP8[$1 + 54 >> 0] = 1; //@line 8987
    break;
   }
   $21 = $1 + 24 | 0; //@line 8990
   $22 = HEAP32[$21 >> 2] | 0; //@line 8991
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 8994
    $28 = $4; //@line 8995
   } else {
    $28 = $22; //@line 8997
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 9006
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_1($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10330
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10336
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10338
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10340
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10342
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 10347
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 10349
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 10350
 if (!___async) {
  ___async_unwind = 0; //@line 10353
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 101; //@line 10355
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 10357
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 10359
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 10361
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 10363
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 10365
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 10367
 sp = STACKTOP; //@line 10368
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12398
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12400
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12402
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12406
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 12410
  label = 4; //@line 12411
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 12416
   label = 4; //@line 12417
  } else {
   $$037$off039 = 3; //@line 12419
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 12423
  $17 = $8 + 40 | 0; //@line 12424
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 12427
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 12437
    $$037$off039 = $$037$off038; //@line 12438
   } else {
    $$037$off039 = $$037$off038; //@line 12440
   }
  } else {
   $$037$off039 = $$037$off038; //@line 12443
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 12446
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 8810
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 8819
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 8824
      HEAP32[$13 >> 2] = $2; //@line 8825
      $19 = $1 + 40 | 0; //@line 8826
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 8829
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 8839
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 8843
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 8850
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
 $$016 = 0; //@line 8458
 while (1) {
  if ((HEAPU8[1583 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 8465
   break;
  }
  $7 = $$016 + 1 | 0; //@line 8468
  if (($7 | 0) == 87) {
   $$01214 = 1671; //@line 8471
   $$115 = 87; //@line 8471
   label = 5; //@line 8472
   break;
  } else {
   $$016 = $7; //@line 8475
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 1671; //@line 8481
  } else {
   $$01214 = 1671; //@line 8483
   $$115 = $$016; //@line 8483
   label = 5; //@line 8484
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 8489
   $$113 = $$01214; //@line 8490
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 8494
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 8501
   if (!$$115) {
    $$012$lcssa = $$113; //@line 8504
    break;
   } else {
    $$01214 = $$113; //@line 8507
    label = 5; //@line 8508
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 8515
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 977
 $2 = $0 + 12 | 0; //@line 979
 $3 = HEAP32[$2 >> 2] | 0; //@line 980
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 984
   _mbed_assert_internal(960, 965, 528); //@line 985
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 36; //@line 988
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 990
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 992
    sp = STACKTOP; //@line 993
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 996
    $8 = HEAP32[$2 >> 2] | 0; //@line 998
    break;
   }
  } else {
   $8 = $3; //@line 1002
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 1005
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1007
 FUNCTION_TABLE_vi[$7 & 127]($0); //@line 1008
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 37; //@line 1011
  sp = STACKTOP; //@line 1012
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1015
  return;
 }
}
function _mbed_error_printf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 10872
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10874
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10876
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10878
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 10880
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[926] | 0)) {
  _serial_init(3708, 2, 3); //@line 10888
 }
 $12 = HEAP8[$6 >> 0] | 0; //@line 10891
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 10892
 _serial_putc(3708, $12); //@line 10893
 if (!___async) {
  ___async_unwind = 0; //@line 10896
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 33; //@line 10898
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = 0; //@line 10900
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $AsyncRetVal; //@line 10902
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 10904
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $4; //@line 10906
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $6; //@line 10908
 sp = STACKTOP; //@line 10909
 return;
}
function _mbed_error_printf__async_cb_34($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 10916
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10920
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10922
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10924
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10926
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 10927
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $14 = HEAP8[$10 + $12 >> 0] | 0; //@line 10934
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 10935
 _serial_putc(3708, $14); //@line 10936
 if (!___async) {
  ___async_unwind = 0; //@line 10939
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 33; //@line 10941
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $12; //@line 10943
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 10945
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 10947
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 10949
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 10951
 sp = STACKTOP; //@line 10952
 return;
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10157
 STACKTOP = STACKTOP + 16 | 0; //@line 10158
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10158
 $3 = sp; //@line 10159
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 10161
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 10164
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10165
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 10166
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 105; //@line 10169
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 10171
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10173
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 10175
  sp = STACKTOP; //@line 10176
  STACKTOP = sp; //@line 10177
  return 0; //@line 10177
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 10179
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 10183
 }
 STACKTOP = sp; //@line 10185
 return $8 & 1 | 0; //@line 10185
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 8289
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 8289
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 8290
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 8291
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 8300
    $$016 = $9; //@line 8303
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 8303
   } else {
    $$016 = $0; //@line 8305
    $storemerge = 0; //@line 8305
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 8307
   $$0 = $$016; //@line 8308
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 8312
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 8318
   HEAP32[tempDoublePtr >> 2] = $2; //@line 8321
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 8321
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 8322
  }
 }
 return +$$0;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10221
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10229
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10231
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 10233
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 10235
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 10237
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 10239
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 10241
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 10252
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 10253
 HEAP32[$10 >> 2] = 0; //@line 10254
 HEAP32[$12 >> 2] = 0; //@line 10255
 HEAP32[$14 >> 2] = 0; //@line 10256
 HEAP32[$2 >> 2] = 0; //@line 10257
 $33 = HEAP32[$16 >> 2] | 0; //@line 10258
 HEAP32[$16 >> 2] = $33 | $18; //@line 10263
 if ($20 | 0) {
  ___unlockfile($22); //@line 10266
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 10269
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
 sp = STACKTOP; //@line 9166
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 9172
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 9175
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 9178
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 9179
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 9180
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 89; //@line 9183
    sp = STACKTOP; //@line 9184
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9187
    break;
   }
  }
 } while (0);
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
 sp = STACKTOP; //@line 10067
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 10069
 $8 = $7 >> 8; //@line 10070
 if (!($7 & 1)) {
  $$0 = $8; //@line 10074
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 10079
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 10081
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 10084
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10089
 FUNCTION_TABLE_viiiiii[$17 & 3]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 10090
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 103; //@line 10093
  sp = STACKTOP; //@line 10094
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 10097
  return;
 }
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9335
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 9341
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 9344
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 9347
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 9348
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 9349
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 92; //@line 9352
    sp = STACKTOP; //@line 9353
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9356
    break;
   }
  }
 } while (0);
 return;
}
function __Znwj($0) {
 $0 = $0 | 0;
 var $$ = 0, $$lcssa = 0, $2 = 0, $4 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8626
 $$ = ($0 | 0) == 0 ? 1 : $0; //@line 8628
 while (1) {
  $2 = _malloc($$) | 0; //@line 8630
  if ($2 | 0) {
   $$lcssa = $2; //@line 8633
   label = 7; //@line 8634
   break;
  }
  $4 = __ZSt15get_new_handlerv() | 0; //@line 8637
  if (!$4) {
   $$lcssa = 0; //@line 8640
   label = 7; //@line 8641
   break;
  }
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 8644
  FUNCTION_TABLE_v[$4 & 0](); //@line 8645
  if (___async) {
   label = 5; //@line 8648
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 8651
 }
 if ((label | 0) == 5) {
  HEAP32[$AsyncCtx >> 2] = 84; //@line 8654
  HEAP32[$AsyncCtx + 4 >> 2] = $$; //@line 8656
  sp = STACKTOP; //@line 8657
  return 0; //@line 8658
 } else if ((label | 0) == 7) {
  return $$lcssa | 0; //@line 8661
 }
 return 0; //@line 8663
}
function ___dynamic_cast__async_cb_64($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13007
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13009
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13011
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 13017
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 13032
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 13048
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 13053
    break;
   }
  default:
   {
    $$0 = 0; //@line 13057
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 13062
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $13 = 0, $16 = 0, $6 = 0, $7 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10109
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 10111
 $7 = $6 >> 8; //@line 10112
 if (!($6 & 1)) {
  $$0 = $7; //@line 10116
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 10121
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 10123
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 10126
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10131
 FUNCTION_TABLE_viiiii[$16 & 3]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 10132
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 104; //@line 10135
  sp = STACKTOP; //@line 10136
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 10139
  return;
 }
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10024
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 10026
 $6 = $5 >> 8; //@line 10027
 if (!($5 & 1)) {
  $$0 = $6; //@line 10031
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 10036
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 10038
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 10041
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10046
 FUNCTION_TABLE_viiii[$15 & 3]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 10047
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 102; //@line 10050
  sp = STACKTOP; //@line 10051
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 10054
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
 sp = STACKTOP; //@line 7287
 STACKTOP = STACKTOP + 256 | 0; //@line 7288
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 7288
 $5 = sp; //@line 7289
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 7295
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 7299
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 7302
   $$011 = $9; //@line 7303
   do {
    _out_670($0, $5, 256); //@line 7305
    $$011 = $$011 + -256 | 0; //@line 7306
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 7315
  } else {
   $$0$lcssa = $9; //@line 7317
  }
  _out_670($0, $5, $$0$lcssa); //@line 7319
 }
 STACKTOP = sp; //@line 7321
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4818
 STACKTOP = STACKTOP + 32 | 0; //@line 4819
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 4819
 $vararg_buffer = sp; //@line 4820
 $3 = sp + 20 | 0; //@line 4821
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 4825
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 4827
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 4829
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 4831
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 4833
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 4838
  $10 = -1; //@line 4839
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 4842
 }
 STACKTOP = sp; //@line 4844
 return $10 | 0; //@line 4844
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 498
 STACKTOP = STACKTOP + 16 | 0; //@line 499
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 499
 $vararg_buffer = sp; //@line 500
 HEAP32[$vararg_buffer >> 2] = $0; //@line 501
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 503
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 505
 _mbed_error_printf(837, $vararg_buffer); //@line 506
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 507
 _mbed_die(); //@line 508
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 15; //@line 511
  sp = STACKTOP; //@line 512
  STACKTOP = sp; //@line 513
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 515
  STACKTOP = sp; //@line 516
  return;
 }
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 8888
 $5 = HEAP32[$4 >> 2] | 0; //@line 8889
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 8893
   HEAP32[$1 + 24 >> 2] = $3; //@line 8895
   HEAP32[$1 + 36 >> 2] = 1; //@line 8897
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 8901
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 8904
    HEAP32[$1 + 24 >> 2] = 2; //@line 8906
    HEAP8[$1 + 54 >> 0] = 1; //@line 8908
    break;
   }
   $10 = $1 + 24 | 0; //@line 8911
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 8915
   }
  }
 } while (0);
 return;
}
function __Znwj__async_cb($0) {
 $0 = $0 | 0;
 var $$lcssa = 0, $2 = 0, $3 = 0, $5 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12007
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12009
 $3 = _malloc($2) | 0; //@line 12010
 if (!$3) {
  $5 = __ZSt15get_new_handlerv() | 0; //@line 12013
  if (!$5) {
   $$lcssa = 0; //@line 12016
  } else {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 12018
   FUNCTION_TABLE_v[$5 & 0](); //@line 12019
   if (!___async) {
    ___async_unwind = 0; //@line 12022
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 84; //@line 12024
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 12026
   sp = STACKTOP; //@line 12027
   return;
  }
 } else {
  $$lcssa = $3; //@line 12031
 }
 HEAP32[___async_retval >> 2] = $$lcssa; //@line 12034
 return;
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 4925
 $3 = HEAP8[$1 >> 0] | 0; //@line 4926
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 4931
  $$lcssa8 = $2; //@line 4931
 } else {
  $$011 = $1; //@line 4933
  $$0710 = $0; //@line 4933
  do {
   $$0710 = $$0710 + 1 | 0; //@line 4935
   $$011 = $$011 + 1 | 0; //@line 4936
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 4937
   $9 = HEAP8[$$011 >> 0] | 0; //@line 4938
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 4943
  $$lcssa8 = $8; //@line 4943
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 4953
}
function _mbed_die__async_cb_54($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 11982
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11984
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11986
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 11987
 _wait_ms(150); //@line 11988
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 17; //@line 11991
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 11992
  HEAP32[$4 >> 2] = $2; //@line 11993
  sp = STACKTOP; //@line 11994
  return;
 }
 ___async_unwind = 0; //@line 11997
 HEAP32[$ReallocAsyncCtx15 >> 2] = 17; //@line 11998
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 11999
 HEAP32[$4 >> 2] = $2; //@line 12000
 sp = STACKTOP; //@line 12001
 return;
}
function _mbed_die__async_cb_53($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 11957
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11959
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11961
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 11962
 _wait_ms(150); //@line 11963
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 18; //@line 11966
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 11967
  HEAP32[$4 >> 2] = $2; //@line 11968
  sp = STACKTOP; //@line 11969
  return;
 }
 ___async_unwind = 0; //@line 11972
 HEAP32[$ReallocAsyncCtx14 >> 2] = 18; //@line 11973
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 11974
 HEAP32[$4 >> 2] = $2; //@line 11975
 sp = STACKTOP; //@line 11976
 return;
}
function _mbed_die__async_cb_52($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 11932
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11934
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11936
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 11937
 _wait_ms(150); //@line 11938
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 19; //@line 11941
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 11942
  HEAP32[$4 >> 2] = $2; //@line 11943
  sp = STACKTOP; //@line 11944
  return;
 }
 ___async_unwind = 0; //@line 11947
 HEAP32[$ReallocAsyncCtx13 >> 2] = 19; //@line 11948
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 11949
 HEAP32[$4 >> 2] = $2; //@line 11950
 sp = STACKTOP; //@line 11951
 return;
}
function _mbed_die__async_cb_51($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 11907
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11909
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11911
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 11912
 _wait_ms(150); //@line 11913
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 20; //@line 11916
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 11917
  HEAP32[$4 >> 2] = $2; //@line 11918
  sp = STACKTOP; //@line 11919
  return;
 }
 ___async_unwind = 0; //@line 11922
 HEAP32[$ReallocAsyncCtx12 >> 2] = 20; //@line 11923
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 11924
 HEAP32[$4 >> 2] = $2; //@line 11925
 sp = STACKTOP; //@line 11926
 return;
}
function _mbed_die__async_cb_50($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 11882
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11884
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11886
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 11887
 _wait_ms(150); //@line 11888
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 21; //@line 11891
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 11892
  HEAP32[$4 >> 2] = $2; //@line 11893
  sp = STACKTOP; //@line 11894
  return;
 }
 ___async_unwind = 0; //@line 11897
 HEAP32[$ReallocAsyncCtx11 >> 2] = 21; //@line 11898
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 11899
 HEAP32[$4 >> 2] = $2; //@line 11900
 sp = STACKTOP; //@line 11901
 return;
}
function _mbed_die__async_cb_49($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 11857
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11859
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11861
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 11862
 _wait_ms(150); //@line 11863
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 22; //@line 11866
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 11867
  HEAP32[$4 >> 2] = $2; //@line 11868
  sp = STACKTOP; //@line 11869
  return;
 }
 ___async_unwind = 0; //@line 11872
 HEAP32[$ReallocAsyncCtx10 >> 2] = 22; //@line 11873
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 11874
 HEAP32[$4 >> 2] = $2; //@line 11875
 sp = STACKTOP; //@line 11876
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 11607
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11609
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11611
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 11612
 _wait_ms(150); //@line 11613
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 16; //@line 11616
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 11617
  HEAP32[$4 >> 2] = $2; //@line 11618
  sp = STACKTOP; //@line 11619
  return;
 }
 ___async_unwind = 0; //@line 11622
 HEAP32[$ReallocAsyncCtx16 >> 2] = 16; //@line 11623
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 11624
 HEAP32[$4 >> 2] = $2; //@line 11625
 sp = STACKTOP; //@line 11626
 return;
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4877
 STACKTOP = STACKTOP + 32 | 0; //@line 4878
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 4878
 $vararg_buffer = sp; //@line 4879
 HEAP32[$0 + 36 >> 2] = 5; //@line 4882
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 4890
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 4892
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 4894
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 4899
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 4902
 STACKTOP = sp; //@line 4903
 return $14 | 0; //@line 4903
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 949
 $2 = HEAP32[42] | 0; //@line 950
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 951
 _putc($1, $2) | 0; //@line 952
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 34; //@line 955
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 957
  sp = STACKTOP; //@line 958
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 961
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 962
 _fflush($2) | 0; //@line 963
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 35; //@line 966
  sp = STACKTOP; //@line 967
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 970
  return;
 }
}
function _mbed_die__async_cb_48($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 11832
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11834
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11836
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 11837
 _wait_ms(150); //@line 11838
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 23; //@line 11841
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 11842
  HEAP32[$4 >> 2] = $2; //@line 11843
  sp = STACKTOP; //@line 11844
  return;
 }
 ___async_unwind = 0; //@line 11847
 HEAP32[$ReallocAsyncCtx9 >> 2] = 23; //@line 11848
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 11849
 HEAP32[$4 >> 2] = $2; //@line 11850
 sp = STACKTOP; //@line 11851
 return;
}
function _mbed_die__async_cb_47($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 11807
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11809
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11811
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 11812
 _wait_ms(400); //@line 11813
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 24; //@line 11816
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 11817
  HEAP32[$4 >> 2] = $2; //@line 11818
  sp = STACKTOP; //@line 11819
  return;
 }
 ___async_unwind = 0; //@line 11822
 HEAP32[$ReallocAsyncCtx8 >> 2] = 24; //@line 11823
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 11824
 HEAP32[$4 >> 2] = $2; //@line 11825
 sp = STACKTOP; //@line 11826
 return;
}
function _mbed_die__async_cb_46($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 11782
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11784
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11786
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 11787
 _wait_ms(400); //@line 11788
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 25; //@line 11791
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 11792
  HEAP32[$4 >> 2] = $2; //@line 11793
  sp = STACKTOP; //@line 11794
  return;
 }
 ___async_unwind = 0; //@line 11797
 HEAP32[$ReallocAsyncCtx7 >> 2] = 25; //@line 11798
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 11799
 HEAP32[$4 >> 2] = $2; //@line 11800
 sp = STACKTOP; //@line 11801
 return;
}
function _mbed_die__async_cb_45($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 11757
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11759
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11761
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 11762
 _wait_ms(400); //@line 11763
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 26; //@line 11766
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 11767
  HEAP32[$4 >> 2] = $2; //@line 11768
  sp = STACKTOP; //@line 11769
  return;
 }
 ___async_unwind = 0; //@line 11772
 HEAP32[$ReallocAsyncCtx6 >> 2] = 26; //@line 11773
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 11774
 HEAP32[$4 >> 2] = $2; //@line 11775
 sp = STACKTOP; //@line 11776
 return;
}
function _mbed_die__async_cb_44($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 11732
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11734
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11736
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 11737
 _wait_ms(400); //@line 11738
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 27; //@line 11741
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 11742
  HEAP32[$4 >> 2] = $2; //@line 11743
  sp = STACKTOP; //@line 11744
  return;
 }
 ___async_unwind = 0; //@line 11747
 HEAP32[$ReallocAsyncCtx5 >> 2] = 27; //@line 11748
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 11749
 HEAP32[$4 >> 2] = $2; //@line 11750
 sp = STACKTOP; //@line 11751
 return;
}
function _mbed_die__async_cb_43($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 11707
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11709
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11711
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 11712
 _wait_ms(400); //@line 11713
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 11716
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 11717
  HEAP32[$4 >> 2] = $2; //@line 11718
  sp = STACKTOP; //@line 11719
  return;
 }
 ___async_unwind = 0; //@line 11722
 HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 11723
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 11724
 HEAP32[$4 >> 2] = $2; //@line 11725
 sp = STACKTOP; //@line 11726
 return;
}
function _mbed_die__async_cb_42($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11682
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11684
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11686
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 11687
 _wait_ms(400); //@line 11688
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 29; //@line 11691
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 11692
  HEAP32[$4 >> 2] = $2; //@line 11693
  sp = STACKTOP; //@line 11694
  return;
 }
 ___async_unwind = 0; //@line 11697
 HEAP32[$ReallocAsyncCtx3 >> 2] = 29; //@line 11698
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 11699
 HEAP32[$4 >> 2] = $2; //@line 11700
 sp = STACKTOP; //@line 11701
 return;
}
function _mbed_die__async_cb_41($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11657
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11659
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 11661
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 11662
 _wait_ms(400); //@line 11663
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 30; //@line 11666
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 11667
  HEAP32[$4 >> 2] = $2; //@line 11668
  sp = STACKTOP; //@line 11669
  return;
 }
 ___async_unwind = 0; //@line 11672
 HEAP32[$ReallocAsyncCtx2 >> 2] = 30; //@line 11673
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 11674
 HEAP32[$4 >> 2] = $2; //@line 11675
 sp = STACKTOP; //@line 11676
 return;
}
function _mbed_die__async_cb_40($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11632
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11634
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 11636
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 11637
 _wait_ms(400); //@line 11638
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 31; //@line 11641
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 11642
  HEAP32[$4 >> 2] = $2; //@line 11643
  sp = STACKTOP; //@line 11644
  return;
 }
 ___async_unwind = 0; //@line 11647
 HEAP32[$ReallocAsyncCtx >> 2] = 31; //@line 11648
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 11649
 HEAP32[$4 >> 2] = $2; //@line 11650
 sp = STACKTOP; //@line 11651
 return;
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 13527
 newDynamicTop = oldDynamicTop + increment | 0; //@line 13528
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 13532
  ___setErrNo(12); //@line 13533
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 13537
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 13541
   ___setErrNo(12); //@line 13542
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 13546
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 7148
 } else {
  $$056 = $2; //@line 7150
  $15 = $1; //@line 7150
  $8 = $0; //@line 7150
  while (1) {
   $14 = $$056 + -1 | 0; //@line 7158
   HEAP8[$14 >> 0] = HEAPU8[1565 + ($8 & 15) >> 0] | 0 | $3; //@line 7159
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 7160
   $15 = tempRet0; //@line 7161
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 7166
    break;
   } else {
    $$056 = $14; //@line 7169
   }
  }
 }
 return $$05$lcssa | 0; //@line 7173
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 5143
 $3 = HEAP8[$1 >> 0] | 0; //@line 5145
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 5149
 $7 = HEAP32[$0 >> 2] | 0; //@line 5150
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 5155
  HEAP32[$0 + 4 >> 2] = 0; //@line 5157
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 5159
  HEAP32[$0 + 28 >> 2] = $14; //@line 5161
  HEAP32[$0 + 20 >> 2] = $14; //@line 5163
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 5169
  $$0 = 0; //@line 5170
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 5173
  $$0 = -1; //@line 5174
 }
 return $$0 | 0; //@line 5176
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 7185
 } else {
  $$06 = $2; //@line 7187
  $11 = $1; //@line 7187
  $7 = $0; //@line 7187
  while (1) {
   $10 = $$06 + -1 | 0; //@line 7192
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 7193
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 7194
   $11 = tempRet0; //@line 7195
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 7200
    break;
   } else {
    $$06 = $10; //@line 7203
   }
  }
 }
 return $$0$lcssa | 0; //@line 7207
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10190
 do {
  if (!$0) {
   $3 = 0; //@line 10194
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10196
   $2 = ___dynamic_cast($0, 56, 112, 0) | 0; //@line 10197
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 106; //@line 10200
    sp = STACKTOP; //@line 10201
    return 0; //@line 10202
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10204
    $3 = ($2 | 0) != 0 & 1; //@line 10207
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 10212
}
function _invoke_ticker__async_cb_61($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12510
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 12516
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 12517
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 12518
 FUNCTION_TABLE_vi[$5 & 127]($6); //@line 12519
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 37; //@line 12522
  sp = STACKTOP; //@line 12523
  return;
 }
 ___async_unwind = 0; //@line 12526
 HEAP32[$ReallocAsyncCtx >> 2] = 37; //@line 12527
 sp = STACKTOP; //@line 12528
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 6829
 } else {
  $$04 = 0; //@line 6831
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 6834
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 6838
   $12 = $7 + 1 | 0; //@line 6839
   HEAP32[$0 >> 2] = $12; //@line 6840
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 6846
    break;
   } else {
    $$04 = $11; //@line 6849
   }
  }
 }
 return $$0$lcssa | 0; //@line 6853
}
function ___fflush_unlocked__async_cb_55($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12116
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12118
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12120
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12122
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 12124
 HEAP32[$4 >> 2] = 0; //@line 12125
 HEAP32[$6 >> 2] = 0; //@line 12126
 HEAP32[$8 >> 2] = 0; //@line 12127
 HEAP32[$10 >> 2] = 0; //@line 12128
 HEAP32[___async_retval >> 2] = 0; //@line 12130
 return;
}
function __ZN4mbed6BusOutaSEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 477
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 478
 __ZN4mbed6BusOut5writeEi($0, $1); //@line 479
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 14; //@line 482
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 484
  sp = STACKTOP; //@line 485
  return 0; //@line 486
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 488
  return $0 | 0; //@line 489
 }
 return 0; //@line 491
}
function _serial_putc__async_cb_39($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11588
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11590
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 11591
 _fflush($2) | 0; //@line 11592
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 35; //@line 11595
  sp = STACKTOP; //@line 11596
  return;
 }
 ___async_unwind = 0; //@line 11599
 HEAP32[$ReallocAsyncCtx >> 2] = 35; //@line 11600
 sp = STACKTOP; //@line 11601
 return;
}
function __GLOBAL__sub_I_main_cpp() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1066
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1067
 __ZN4mbed6BusOutC2E7PinNameS1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_(3716, 50, 52, 53, 55, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1); //@line 1068
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 40; //@line 1071
  sp = STACKTOP; //@line 1072
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1075
  return;
 }
}
function _emscripten_async_resume() {
 ___async = 0; //@line 13378
 ___async_unwind = 1; //@line 13379
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 13385
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 13389
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 13393
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 13395
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4688
 STACKTOP = STACKTOP + 16 | 0; //@line 4689
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4689
 $vararg_buffer = sp; //@line 4690
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 4694
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 4696
 STACKTOP = sp; //@line 4697
 return $5 | 0; //@line 4697
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 13320
 STACKTOP = STACKTOP + 16 | 0; //@line 13321
 $rem = __stackBase__ | 0; //@line 13322
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 13323
 STACKTOP = __stackBase__; //@line 13324
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 13325
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 13090
 if ((ret | 0) < 8) return ret | 0; //@line 13091
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 13092
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 13093
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 13094
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 13095
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 13096
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 8792
 }
 return;
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 8611
 $6 = HEAP32[$5 >> 2] | 0; //@line 8612
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 8613
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 8615
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 8617
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 8620
 return $2 | 0; //@line 8621
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12314
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 12325
  $$0 = 1; //@line 12326
 } else {
  $$0 = 0; //@line 12328
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 12332
 return;
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12965
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 12968
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 12973
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 12976
 return;
}
function _wait($0) {
 $0 = +$0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1032
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1036
 _emscripten_sleep((~~($0 * 1.0e6) | 0) / 1e3 | 0 | 0); //@line 1037
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 38; //@line 1040
  sp = STACKTOP; //@line 1041
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1044
  return;
 }
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 8868
 }
 return;
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 928
 HEAP32[$0 >> 2] = $1; //@line 929
 HEAP32[926] = 1; //@line 930
 $4 = $0; //@line 931
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 936
 $10 = 3708; //@line 937
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 939
 HEAP32[$10 + 4 >> 2] = $9; //@line 942
 return;
}
function _main__async_cb_32($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 10808
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(4) | 0; //@line 10809
 __ZN4mbed6BusOutaSEi(3716, 1) | 0; //@line 10810
 if (!___async) {
  ___async_unwind = 0; //@line 10813
 }
 HEAP32[$ReallocAsyncCtx15 >> 2] = 43; //@line 10815
 sp = STACKTOP; //@line 10816
 return;
}
function _main__async_cb_31($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 10794
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(4) | 0; //@line 10795
 __ZN4mbed6BusOutaSEi(3716, 2) | 0; //@line 10796
 if (!___async) {
  ___async_unwind = 0; //@line 10799
 }
 HEAP32[$ReallocAsyncCtx14 >> 2] = 45; //@line 10801
 sp = STACKTOP; //@line 10802
 return;
}
function _main__async_cb_30($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 10780
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(4) | 0; //@line 10781
 __ZN4mbed6BusOutaSEi(3716, 3) | 0; //@line 10782
 if (!___async) {
  ___async_unwind = 0; //@line 10785
 }
 HEAP32[$ReallocAsyncCtx13 >> 2] = 47; //@line 10787
 sp = STACKTOP; //@line 10788
 return;
}
function _main__async_cb_29($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 10766
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(4) | 0; //@line 10767
 __ZN4mbed6BusOutaSEi(3716, 4) | 0; //@line 10768
 if (!___async) {
  ___async_unwind = 0; //@line 10771
 }
 HEAP32[$ReallocAsyncCtx12 >> 2] = 49; //@line 10773
 sp = STACKTOP; //@line 10774
 return;
}
function _main__async_cb_28($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 10752
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(4) | 0; //@line 10753
 __ZN4mbed6BusOutaSEi(3716, 5) | 0; //@line 10754
 if (!___async) {
  ___async_unwind = 0; //@line 10757
 }
 HEAP32[$ReallocAsyncCtx11 >> 2] = 51; //@line 10759
 sp = STACKTOP; //@line 10760
 return;
}
function _main__async_cb_27($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 10738
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(4) | 0; //@line 10739
 __ZN4mbed6BusOutaSEi(3716, 6) | 0; //@line 10740
 if (!___async) {
  ___async_unwind = 0; //@line 10743
 }
 HEAP32[$ReallocAsyncCtx10 >> 2] = 53; //@line 10745
 sp = STACKTOP; //@line 10746
 return;
}
function _main__async_cb_17($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 10598
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(4) | 0; //@line 10599
 __ZN4mbed6BusOutaSEi(3716, 0) | 0; //@line 10600
 if (!___async) {
  ___async_unwind = 0; //@line 10603
 }
 HEAP32[$ReallocAsyncCtx16 >> 2] = 41; //@line 10605
 sp = STACKTOP; //@line 10606
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1051
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1052
 _emscripten_sleep($0 | 0); //@line 1053
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 39; //@line 1056
  sp = STACKTOP; //@line 1057
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1060
  return;
 }
}
function _main__async_cb_23($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 10682
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(4) | 0; //@line 10683
 __ZN4mbed6BusOutaSEi(3716, 10) | 0; //@line 10684
 if (!___async) {
  ___async_unwind = 0; //@line 10687
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 61; //@line 10689
 sp = STACKTOP; //@line 10690
 return;
}
function _main__async_cb_22($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 10668
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(4) | 0; //@line 10669
 __ZN4mbed6BusOutaSEi(3716, 11) | 0; //@line 10670
 if (!___async) {
  ___async_unwind = 0; //@line 10673
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 63; //@line 10675
 sp = STACKTOP; //@line 10676
 return;
}
function _main__async_cb_21($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 10654
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 10655
 __ZN4mbed6BusOutaSEi(3716, 12) | 0; //@line 10656
 if (!___async) {
  ___async_unwind = 0; //@line 10659
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 65; //@line 10661
 sp = STACKTOP; //@line 10662
 return;
}
function _main__async_cb_20($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 10640
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 10641
 __ZN4mbed6BusOutaSEi(3716, 13) | 0; //@line 10642
 if (!___async) {
  ___async_unwind = 0; //@line 10645
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 67; //@line 10647
 sp = STACKTOP; //@line 10648
 return;
}
function _main__async_cb_19($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 10626
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 10627
 __ZN4mbed6BusOutaSEi(3716, 14) | 0; //@line 10628
 if (!___async) {
  ___async_unwind = 0; //@line 10631
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 69; //@line 10633
 sp = STACKTOP; //@line 10634
 return;
}
function _main__async_cb_26($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 10724
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(4) | 0; //@line 10725
 __ZN4mbed6BusOutaSEi(3716, 7) | 0; //@line 10726
 if (!___async) {
  ___async_unwind = 0; //@line 10729
 }
 HEAP32[$ReallocAsyncCtx9 >> 2] = 55; //@line 10731
 sp = STACKTOP; //@line 10732
 return;
}
function _main__async_cb_25($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 10710
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(4) | 0; //@line 10711
 __ZN4mbed6BusOutaSEi(3716, 8) | 0; //@line 10712
 if (!___async) {
  ___async_unwind = 0; //@line 10715
 }
 HEAP32[$ReallocAsyncCtx8 >> 2] = 57; //@line 10717
 sp = STACKTOP; //@line 10718
 return;
}
function _main__async_cb_24($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 10696
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 10697
 __ZN4mbed6BusOutaSEi(3716, 9) | 0; //@line 10698
 if (!___async) {
  ___async_unwind = 0; //@line 10701
 }
 HEAP32[$ReallocAsyncCtx7 >> 2] = 59; //@line 10703
 sp = STACKTOP; //@line 10704
 return;
}
function _main__async_cb_18($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10612
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 10613
 __ZN4mbed6BusOutaSEi(3716, 15) | 0; //@line 10614
 if (!___async) {
  ___async_unwind = 0; //@line 10617
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 71; //@line 10619
 sp = STACKTOP; //@line 10620
 return;
}
function _main__async_cb_16($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx32 = 0, sp = 0;
 sp = STACKTOP; //@line 10584
 $ReallocAsyncCtx32 = _emscripten_realloc_async_context(4) | 0; //@line 10585
 _wait(.25); //@line 10586
 if (!___async) {
  ___async_unwind = 0; //@line 10589
 }
 HEAP32[$ReallocAsyncCtx32 >> 2] = 42; //@line 10591
 sp = STACKTOP; //@line 10592
 return;
}
function _main__async_cb_15($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx31 = 0, sp = 0;
 sp = STACKTOP; //@line 10570
 $ReallocAsyncCtx31 = _emscripten_realloc_async_context(4) | 0; //@line 10571
 _wait(.25); //@line 10572
 if (!___async) {
  ___async_unwind = 0; //@line 10575
 }
 HEAP32[$ReallocAsyncCtx31 >> 2] = 44; //@line 10577
 sp = STACKTOP; //@line 10578
 return;
}
function _main__async_cb_14($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx30 = 0, sp = 0;
 sp = STACKTOP; //@line 10556
 $ReallocAsyncCtx30 = _emscripten_realloc_async_context(4) | 0; //@line 10557
 _wait(.25); //@line 10558
 if (!___async) {
  ___async_unwind = 0; //@line 10561
 }
 HEAP32[$ReallocAsyncCtx30 >> 2] = 46; //@line 10563
 sp = STACKTOP; //@line 10564
 return;
}
function _main__async_cb_13($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx29 = 0, sp = 0;
 sp = STACKTOP; //@line 10542
 $ReallocAsyncCtx29 = _emscripten_realloc_async_context(4) | 0; //@line 10543
 _wait(.25); //@line 10544
 if (!___async) {
  ___async_unwind = 0; //@line 10547
 }
 HEAP32[$ReallocAsyncCtx29 >> 2] = 48; //@line 10549
 sp = STACKTOP; //@line 10550
 return;
}
function _main__async_cb_12($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx28 = 0, sp = 0;
 sp = STACKTOP; //@line 10528
 $ReallocAsyncCtx28 = _emscripten_realloc_async_context(4) | 0; //@line 10529
 _wait(.25); //@line 10530
 if (!___async) {
  ___async_unwind = 0; //@line 10533
 }
 HEAP32[$ReallocAsyncCtx28 >> 2] = 50; //@line 10535
 sp = STACKTOP; //@line 10536
 return;
}
function _main__async_cb_11($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx27 = 0, sp = 0;
 sp = STACKTOP; //@line 10514
 $ReallocAsyncCtx27 = _emscripten_realloc_async_context(4) | 0; //@line 10515
 _wait(.25); //@line 10516
 if (!___async) {
  ___async_unwind = 0; //@line 10519
 }
 HEAP32[$ReallocAsyncCtx27 >> 2] = 52; //@line 10521
 sp = STACKTOP; //@line 10522
 return;
}
function _main__async_cb_10($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx26 = 0, sp = 0;
 sp = STACKTOP; //@line 10500
 $ReallocAsyncCtx26 = _emscripten_realloc_async_context(4) | 0; //@line 10501
 _wait(.25); //@line 10502
 if (!___async) {
  ___async_unwind = 0; //@line 10505
 }
 HEAP32[$ReallocAsyncCtx26 >> 2] = 54; //@line 10507
 sp = STACKTOP; //@line 10508
 return;
}
function _main__async_cb_9($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx25 = 0, sp = 0;
 sp = STACKTOP; //@line 10486
 $ReallocAsyncCtx25 = _emscripten_realloc_async_context(4) | 0; //@line 10487
 _wait(.25); //@line 10488
 if (!___async) {
  ___async_unwind = 0; //@line 10491
 }
 HEAP32[$ReallocAsyncCtx25 >> 2] = 56; //@line 10493
 sp = STACKTOP; //@line 10494
 return;
}
function _main__async_cb_8($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx24 = 0, sp = 0;
 sp = STACKTOP; //@line 10472
 $ReallocAsyncCtx24 = _emscripten_realloc_async_context(4) | 0; //@line 10473
 _wait(.25); //@line 10474
 if (!___async) {
  ___async_unwind = 0; //@line 10477
 }
 HEAP32[$ReallocAsyncCtx24 >> 2] = 58; //@line 10479
 sp = STACKTOP; //@line 10480
 return;
}
function _main__async_cb_7($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx23 = 0, sp = 0;
 sp = STACKTOP; //@line 10458
 $ReallocAsyncCtx23 = _emscripten_realloc_async_context(4) | 0; //@line 10459
 _wait(.25); //@line 10460
 if (!___async) {
  ___async_unwind = 0; //@line 10463
 }
 HEAP32[$ReallocAsyncCtx23 >> 2] = 60; //@line 10465
 sp = STACKTOP; //@line 10466
 return;
}
function _main__async_cb_6($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx22 = 0, sp = 0;
 sp = STACKTOP; //@line 10444
 $ReallocAsyncCtx22 = _emscripten_realloc_async_context(4) | 0; //@line 10445
 _wait(.25); //@line 10446
 if (!___async) {
  ___async_unwind = 0; //@line 10449
 }
 HEAP32[$ReallocAsyncCtx22 >> 2] = 62; //@line 10451
 sp = STACKTOP; //@line 10452
 return;
}
function _main__async_cb_5($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx21 = 0, sp = 0;
 sp = STACKTOP; //@line 10430
 $ReallocAsyncCtx21 = _emscripten_realloc_async_context(4) | 0; //@line 10431
 _wait(.25); //@line 10432
 if (!___async) {
  ___async_unwind = 0; //@line 10435
 }
 HEAP32[$ReallocAsyncCtx21 >> 2] = 64; //@line 10437
 sp = STACKTOP; //@line 10438
 return;
}
function _main__async_cb_4($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx20 = 0, sp = 0;
 sp = STACKTOP; //@line 10416
 $ReallocAsyncCtx20 = _emscripten_realloc_async_context(4) | 0; //@line 10417
 _wait(.25); //@line 10418
 if (!___async) {
  ___async_unwind = 0; //@line 10421
 }
 HEAP32[$ReallocAsyncCtx20 >> 2] = 66; //@line 10423
 sp = STACKTOP; //@line 10424
 return;
}
function _main__async_cb_3($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx19 = 0, sp = 0;
 sp = STACKTOP; //@line 10402
 $ReallocAsyncCtx19 = _emscripten_realloc_async_context(4) | 0; //@line 10403
 _wait(.25); //@line 10404
 if (!___async) {
  ___async_unwind = 0; //@line 10407
 }
 HEAP32[$ReallocAsyncCtx19 >> 2] = 68; //@line 10409
 sp = STACKTOP; //@line 10410
 return;
}
function _main__async_cb_2($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx18 = 0, sp = 0;
 sp = STACKTOP; //@line 10388
 $ReallocAsyncCtx18 = _emscripten_realloc_async_context(4) | 0; //@line 10389
 _wait(.25); //@line 10390
 if (!___async) {
  ___async_unwind = 0; //@line 10393
 }
 HEAP32[$ReallocAsyncCtx18 >> 2] = 70; //@line 10395
 sp = STACKTOP; //@line 10396
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx17 = 0, sp = 0;
 sp = STACKTOP; //@line 10374
 $ReallocAsyncCtx17 = _emscripten_realloc_async_context(4) | 0; //@line 10375
 _wait(.25); //@line 10376
 if (!___async) {
  ___async_unwind = 0; //@line 10379
 }
 HEAP32[$ReallocAsyncCtx17 >> 2] = 72; //@line 10381
 sp = STACKTOP; //@line 10382
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 8932
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 8936
  }
 }
 return;
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 13354
 HEAP32[new_frame + 4 >> 2] = sp; //@line 13356
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 13358
 ___async_cur_frame = new_frame; //@line 13359
 return ___async_cur_frame + 8 | 0; //@line 13360
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 12479
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 12483
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 12486
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 13343
  return low << bits; //@line 13344
 }
 tempRet0 = low << bits - 32; //@line 13346
 return 0; //@line 13347
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 13332
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 13333
 }
 tempRet0 = 0; //@line 13335
 return high >>> bits - 32 | 0; //@line 13336
}
function _fflush__async_cb_56($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12220
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 12222
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 12225
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
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 10854
 } else {
  $$0 = -1; //@line 10856
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 10859
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 5273
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 5279
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 5283
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 13595
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 13366
 stackRestore(___async_cur_frame | 0); //@line 13367
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 13368
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 10826
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 10827
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 10829
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 8270
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 8270
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 8272
 return $1 | 0; //@line 8273
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 13083
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 13084
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 13085
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 4854
  $$0 = -1; //@line 4855
 } else {
  $$0 = $0; //@line 4857
 }
 return $$0 | 0; //@line 4859
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 904
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 910
 _emscripten_asm_const_iii(1, $0 | 0, $1 | 0) | 0; //@line 911
 return;
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 13075
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 13077
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 13588
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 13581
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 7330
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 7333
 }
 return $$0 | 0; //@line 7335
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 13560
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 13312
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 12993
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 13373
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 13374
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 5409
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 5411
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 9373
 __ZdlPv($0); //@line 9374
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 9154
 __ZdlPv($0); //@line 9155
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 8682
 __ZdlPv($0); //@line 8683
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 12464
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
  ___fwritex($1, $2, $0) | 0; //@line 6815
 }
 return;
}
function b36(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 13686
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 8879
}
function __ZSt15get_new_handlerv() {
 var $0 = 0;
 $0 = HEAP32[1092] | 0; //@line 10146
 HEAP32[1092] = $0 + 0; //@line 10148
 return $0 | 0; //@line 10150
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
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 13400
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_60($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b34(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 13683
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6BusOutaSEi__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 12044
 return;
}
function _fflush__async_cb_57($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 12235
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 7278
}
function _putc__async_cb_33($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 10839
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 13553
}
function b5(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 13608
 return 0; //@line 13608
}
function b4(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 13605
 return 0; //@line 13605
}
function b3(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 13602
 return 0; //@line 13602
}
function __ZN4mbed6BusOutD0Ev($0) {
 $0 = $0 | 0;
 __ZN4mbed6BusOutD2Ev($0); //@line 155
 __ZdlPv($0); //@line 156
 return;
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 127](a1 | 0); //@line 13574
}
function b32(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 13680
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 8523
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 0](); //@line 13567
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 4912
}
function b1(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 13599
 return 0; //@line 13599
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
 ___lock(4356); //@line 5416
 return 4364; //@line 5417
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
function __ZN4mbed6BusOut5writeEi__async_cb_63($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 8444
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 8450
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
 _free($0); //@line 8669
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
function ___ofl_unlock() {
 ___unlock(4356); //@line 5422
 return;
}
function b30(p0) {
 p0 = p0 | 0;
 nullFunc_vi(127); //@line 13677
}
function b29(p0) {
 p0 = p0 | 0;
 nullFunc_vi(126); //@line 13674
}
function b28(p0) {
 p0 = p0 | 0;
 nullFunc_vi(125); //@line 13671
}
function b27(p0) {
 p0 = p0 | 0;
 nullFunc_vi(124); //@line 13668
}
function b26(p0) {
 p0 = p0 | 0;
 nullFunc_vi(123); //@line 13665
}
function b25(p0) {
 p0 = p0 | 0;
 nullFunc_vi(122); //@line 13662
}
function b24(p0) {
 p0 = p0 | 0;
 nullFunc_vi(121); //@line 13659
}
function b23(p0) {
 p0 = p0 | 0;
 nullFunc_vi(120); //@line 13656
}
function b22(p0) {
 p0 = p0 | 0;
 nullFunc_vi(119); //@line 13653
}
function b21(p0) {
 p0 = p0 | 0;
 nullFunc_vi(118); //@line 13650
}
function b20(p0) {
 p0 = p0 | 0;
 nullFunc_vi(117); //@line 13647
}
function b19(p0) {
 p0 = p0 | 0;
 nullFunc_vi(116); //@line 13644
}
function b18(p0) {
 p0 = p0 | 0;
 nullFunc_vi(115); //@line 13641
}
function b17(p0) {
 p0 = p0 | 0;
 nullFunc_vi(114); //@line 13638
}
function b16(p0) {
 p0 = p0 | 0;
 nullFunc_vi(113); //@line 13635
}
function b15(p0) {
 p0 = p0 | 0;
 nullFunc_vi(112); //@line 13632
}
function b14(p0) {
 p0 = p0 | 0;
 nullFunc_vi(111); //@line 13629
}
function b13(p0) {
 p0 = p0 | 0;
 nullFunc_vi(110); //@line 13626
}
function b12(p0) {
 p0 = p0 | 0;
 nullFunc_vi(109); //@line 13623
}
function b11(p0) {
 p0 = p0 | 0;
 nullFunc_vi(108); //@line 13620
}
function b10(p0) {
 p0 = p0 | 0;
 nullFunc_vi(107); //@line 13617
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 4870
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 5065
}
function __ZN4mbed6BusOut6unlockEv($0) {
 $0 = $0 | 0;
 return;
}
function b9(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 13614
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
function __ZNSt9type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function getTempRet0() {
 return tempRet0 | 0; //@line 42
}
function ___errno_location() {
 return 4352; //@line 4864
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
 return 300; //@line 4917
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 26
}
function b7() {
 nullFunc_v(0); //@line 13611
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_ii = [b1,___stdio_close];
var FUNCTION_TABLE_iiii = [b3,___stdout_write,___stdio_seek,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,___stdio_write,b4,b5];
var FUNCTION_TABLE_v = [b7];
var FUNCTION_TABLE_vi = [b9,__ZN4mbed6BusOutD2Ev,__ZN4mbed6BusOutD0Ev,__ZN4mbed6BusOut4lockEv,__ZN4mbed6BusOut6unlockEv,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed6BusOutC2E7PinNameS1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1___async_cb,__ZN4mbed6BusOut5writeEi__async_cb,__ZN4mbed6BusOut5writeEi__async_cb_63,__ZN4mbed6BusOutaSEi__async_cb,_mbed_assert_internal__async_cb,_mbed_die__async_cb_54,_mbed_die__async_cb_53,_mbed_die__async_cb_52,_mbed_die__async_cb_51,_mbed_die__async_cb_50,_mbed_die__async_cb_49,_mbed_die__async_cb_48,_mbed_die__async_cb_47,_mbed_die__async_cb_46,_mbed_die__async_cb_45,_mbed_die__async_cb_44,_mbed_die__async_cb_43,_mbed_die__async_cb_42
,_mbed_die__async_cb_41,_mbed_die__async_cb_40,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_printf__async_cb_34,_serial_putc__async_cb_39,_serial_putc__async_cb,_invoke_ticker__async_cb_61,_invoke_ticker__async_cb,_wait__async_cb,_wait_ms__async_cb,__GLOBAL__sub_I_main_cpp__async_cb,_main__async_cb_16,_main__async_cb_32,_main__async_cb_15,_main__async_cb_31,_main__async_cb_14,_main__async_cb_30,_main__async_cb_13,_main__async_cb_29,_main__async_cb_12,_main__async_cb_28,_main__async_cb_11,_main__async_cb_27,_main__async_cb_10,_main__async_cb_26,_main__async_cb_9,_main__async_cb_25,_main__async_cb_8,_main__async_cb_24
,_main__async_cb_7,_main__async_cb_23,_main__async_cb_6,_main__async_cb_22,_main__async_cb_5,_main__async_cb_21,_main__async_cb_4,_main__async_cb_20,_main__async_cb_3,_main__async_cb_19,_main__async_cb_2,_main__async_cb_18,_main__async_cb,_main__async_cb_17,_putc__async_cb_33,_putc__async_cb,___overflow__async_cb,_fflush__async_cb_57,_fflush__async_cb_56,_fflush__async_cb_58,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_55,_vfprintf__async_cb,_vsnprintf__async_cb,__Znwj__async_cb,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_59,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_64
,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_60,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_62,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_38,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_37,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_36,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_35,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_1,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b10,b11,b12,b13,b14,b15,b16,b17,b18,b19,b20,b21
,b22,b23,b24,b25,b26,b27,b28,b29,b30];
var FUNCTION_TABLE_viiii = [b32,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi];
var FUNCTION_TABLE_viiiii = [b34,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib];
var FUNCTION_TABLE_viiiiii = [b36,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib];

  return { __GLOBAL__sub_I_main_cpp: __GLOBAL__sub_I_main_cpp, ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _fflush: _fflush, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _invoke_ticker: _invoke_ticker, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
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
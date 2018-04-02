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

STATICTOP = STATIC_BASE + 2528;
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
var debug_table_iiii = ["0", "___stdout_write", "___stdio_seek", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv", "___stdio_write", "0", "0", "0"];
var debug_table_v = ["0"];
var debug_table_vi = ["0", "__ZN4mbed6BusOutD2Ev", "__ZN4mbed6BusOutD0Ev", "__ZN4mbed6BusOut4lockEv", "__ZN4mbed6BusOut6unlockEv", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "__ZN10__cxxabiv121__vmi_class_type_infoD0Ev", "__ZN4mbed6BusOutC2E7PinNameS1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1___async_cb", "__ZN4mbed6BusOut5writeEi__async_cb", "__ZN4mbed6BusOut5writeEi__async_cb_7", "__ZN4mbed6BusOutaSEi__async_cb", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_61", "_mbed_die__async_cb_60", "_mbed_die__async_cb_59", "_mbed_die__async_cb_58", "_mbed_die__async_cb_57", "_mbed_die__async_cb_56", "_mbed_die__async_cb_55", "_mbed_die__async_cb_54", "_mbed_die__async_cb_53", "_mbed_die__async_cb_52", "_mbed_die__async_cb_51", "_mbed_die__async_cb_50", "_mbed_die__async_cb_49", "_mbed_die__async_cb_48", "_mbed_die__async_cb_47", "_mbed_die__async_cb", "_invoke_ticker__async_cb_42", "_invoke_ticker__async_cb", "_wait__async_cb", "_wait_ms__async_cb", "__GLOBAL__sub_I_main_cpp__async_cb", "_main__async_cb_22", "_main__async_cb_38", "_main__async_cb_21", "_main__async_cb_37", "_main__async_cb_20", "_main__async_cb_36", "_main__async_cb_19", "_main__async_cb_35", "_main__async_cb_18", "_main__async_cb_34", "_main__async_cb_17", "_main__async_cb_33", "_main__async_cb_16", "_main__async_cb_32", "_main__async_cb_15", "_main__async_cb_31", "_main__async_cb_14", "_main__async_cb_30", "_main__async_cb_13", "_main__async_cb_29", "_main__async_cb_12", "_main__async_cb_28", "_main__async_cb_11", "_main__async_cb_27", "_main__async_cb_10", "_main__async_cb_26", "_main__async_cb_9", "_main__async_cb_25", "_main__async_cb_8", "_main__async_cb_24", "_main__async_cb", "_main__async_cb_23", "_fflush__async_cb_44", "_fflush__async_cb_43", "_fflush__async_cb_45", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_2", "__Znwj__async_cb", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_39", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_41", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_46", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_40", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_6", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_5", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_4", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_3", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_1", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_ii": nullFunc_ii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_v": nullFunc_v, "nullFunc_vi": nullFunc_vi, "nullFunc_viiii": nullFunc_viiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "___gxx_personality_v0": ___gxx_personality_v0, "___lock": ___lock, "___resumeException": ___resumeException, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___unlock": ___unlock, "_abort": _abort, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
 sp = STACKTOP; //@line 1472
 STACKTOP = STACKTOP + 16 | 0; //@line 1473
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1473
 $1 = sp; //@line 1474
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 1481
   $7 = $6 >>> 3; //@line 1482
   $8 = HEAP32[245] | 0; //@line 1483
   $9 = $8 >>> $7; //@line 1484
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 1490
    $16 = 1020 + ($14 << 1 << 2) | 0; //@line 1492
    $17 = $16 + 8 | 0; //@line 1493
    $18 = HEAP32[$17 >> 2] | 0; //@line 1494
    $19 = $18 + 8 | 0; //@line 1495
    $20 = HEAP32[$19 >> 2] | 0; //@line 1496
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[245] = $8 & ~(1 << $14); //@line 1503
     } else {
      if ((HEAP32[249] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 1508
      }
      $27 = $20 + 12 | 0; //@line 1511
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 1515
       HEAP32[$17 >> 2] = $20; //@line 1516
       break;
      } else {
       _abort(); //@line 1519
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 1524
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 1527
    $34 = $18 + $30 + 4 | 0; //@line 1529
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 1532
    $$0 = $19; //@line 1533
    STACKTOP = sp; //@line 1534
    return $$0 | 0; //@line 1534
   }
   $37 = HEAP32[247] | 0; //@line 1536
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 1542
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 1545
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 1548
     $49 = $47 >>> 12 & 16; //@line 1550
     $50 = $47 >>> $49; //@line 1551
     $52 = $50 >>> 5 & 8; //@line 1553
     $54 = $50 >>> $52; //@line 1555
     $56 = $54 >>> 2 & 4; //@line 1557
     $58 = $54 >>> $56; //@line 1559
     $60 = $58 >>> 1 & 2; //@line 1561
     $62 = $58 >>> $60; //@line 1563
     $64 = $62 >>> 1 & 1; //@line 1565
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 1568
     $69 = 1020 + ($67 << 1 << 2) | 0; //@line 1570
     $70 = $69 + 8 | 0; //@line 1571
     $71 = HEAP32[$70 >> 2] | 0; //@line 1572
     $72 = $71 + 8 | 0; //@line 1573
     $73 = HEAP32[$72 >> 2] | 0; //@line 1574
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 1580
       HEAP32[245] = $77; //@line 1581
       $98 = $77; //@line 1582
      } else {
       if ((HEAP32[249] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 1587
       }
       $80 = $73 + 12 | 0; //@line 1590
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 1594
        HEAP32[$70 >> 2] = $73; //@line 1595
        $98 = $8; //@line 1596
        break;
       } else {
        _abort(); //@line 1599
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 1604
     $84 = $83 - $6 | 0; //@line 1605
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 1608
     $87 = $71 + $6 | 0; //@line 1609
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 1612
     HEAP32[$71 + $83 >> 2] = $84; //@line 1614
     if ($37 | 0) {
      $92 = HEAP32[250] | 0; //@line 1617
      $93 = $37 >>> 3; //@line 1618
      $95 = 1020 + ($93 << 1 << 2) | 0; //@line 1620
      $96 = 1 << $93; //@line 1621
      if (!($98 & $96)) {
       HEAP32[245] = $98 | $96; //@line 1626
       $$0199 = $95; //@line 1628
       $$pre$phiZ2D = $95 + 8 | 0; //@line 1628
      } else {
       $101 = $95 + 8 | 0; //@line 1630
       $102 = HEAP32[$101 >> 2] | 0; //@line 1631
       if ((HEAP32[249] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 1635
       } else {
        $$0199 = $102; //@line 1638
        $$pre$phiZ2D = $101; //@line 1638
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 1641
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 1643
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 1645
      HEAP32[$92 + 12 >> 2] = $95; //@line 1647
     }
     HEAP32[247] = $84; //@line 1649
     HEAP32[250] = $87; //@line 1650
     $$0 = $72; //@line 1651
     STACKTOP = sp; //@line 1652
     return $$0 | 0; //@line 1652
    }
    $108 = HEAP32[246] | 0; //@line 1654
    if (!$108) {
     $$0197 = $6; //@line 1657
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 1661
     $114 = $112 >>> 12 & 16; //@line 1663
     $115 = $112 >>> $114; //@line 1664
     $117 = $115 >>> 5 & 8; //@line 1666
     $119 = $115 >>> $117; //@line 1668
     $121 = $119 >>> 2 & 4; //@line 1670
     $123 = $119 >>> $121; //@line 1672
     $125 = $123 >>> 1 & 2; //@line 1674
     $127 = $123 >>> $125; //@line 1676
     $129 = $127 >>> 1 & 1; //@line 1678
     $134 = HEAP32[1284 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 1683
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 1687
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1693
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 1696
      $$0193$lcssa$i = $138; //@line 1696
     } else {
      $$01926$i = $134; //@line 1698
      $$01935$i = $138; //@line 1698
      $146 = $143; //@line 1698
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 1703
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 1704
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 1705
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 1706
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1712
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 1715
        $$0193$lcssa$i = $$$0193$i; //@line 1715
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 1718
        $$01935$i = $$$0193$i; //@line 1718
       }
      }
     }
     $157 = HEAP32[249] | 0; //@line 1722
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 1725
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 1728
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 1731
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 1735
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 1737
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 1741
       $176 = HEAP32[$175 >> 2] | 0; //@line 1742
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 1745
        $179 = HEAP32[$178 >> 2] | 0; //@line 1746
        if (!$179) {
         $$3$i = 0; //@line 1749
         break;
        } else {
         $$1196$i = $179; //@line 1752
         $$1198$i = $178; //@line 1752
        }
       } else {
        $$1196$i = $176; //@line 1755
        $$1198$i = $175; //@line 1755
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 1758
        $182 = HEAP32[$181 >> 2] | 0; //@line 1759
        if ($182 | 0) {
         $$1196$i = $182; //@line 1762
         $$1198$i = $181; //@line 1762
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 1765
        $185 = HEAP32[$184 >> 2] | 0; //@line 1766
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 1771
         $$1198$i = $184; //@line 1771
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 1776
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 1779
        $$3$i = $$1196$i; //@line 1780
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 1785
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 1788
       }
       $169 = $167 + 12 | 0; //@line 1791
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 1795
       }
       $172 = $164 + 8 | 0; //@line 1798
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 1802
        HEAP32[$172 >> 2] = $167; //@line 1803
        $$3$i = $164; //@line 1804
        break;
       } else {
        _abort(); //@line 1807
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 1816
       $191 = 1284 + ($190 << 2) | 0; //@line 1817
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 1822
         if (!$$3$i) {
          HEAP32[246] = $108 & ~(1 << $190); //@line 1828
          break L73;
         }
        } else {
         if ((HEAP32[249] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 1835
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 1843
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[249] | 0; //@line 1853
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 1856
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 1860
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 1862
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 1868
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 1872
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 1874
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 1880
       if ($214 | 0) {
        if ((HEAP32[249] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 1886
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 1890
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 1892
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 1900
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 1903
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 1905
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 1908
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 1912
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 1915
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 1917
      if ($37 | 0) {
       $234 = HEAP32[250] | 0; //@line 1920
       $235 = $37 >>> 3; //@line 1921
       $237 = 1020 + ($235 << 1 << 2) | 0; //@line 1923
       $238 = 1 << $235; //@line 1924
       if (!($8 & $238)) {
        HEAP32[245] = $8 | $238; //@line 1929
        $$0189$i = $237; //@line 1931
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 1931
       } else {
        $242 = $237 + 8 | 0; //@line 1933
        $243 = HEAP32[$242 >> 2] | 0; //@line 1934
        if ((HEAP32[249] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 1938
        } else {
         $$0189$i = $243; //@line 1941
         $$pre$phi$iZ2D = $242; //@line 1941
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 1944
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 1946
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 1948
       HEAP32[$234 + 12 >> 2] = $237; //@line 1950
      }
      HEAP32[247] = $$0193$lcssa$i; //@line 1952
      HEAP32[250] = $159; //@line 1953
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 1956
     STACKTOP = sp; //@line 1957
     return $$0 | 0; //@line 1957
    }
   } else {
    $$0197 = $6; //@line 1960
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 1965
   } else {
    $251 = $0 + 11 | 0; //@line 1967
    $252 = $251 & -8; //@line 1968
    $253 = HEAP32[246] | 0; //@line 1969
    if (!$253) {
     $$0197 = $252; //@line 1972
    } else {
     $255 = 0 - $252 | 0; //@line 1974
     $256 = $251 >>> 8; //@line 1975
     if (!$256) {
      $$0358$i = 0; //@line 1978
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 1982
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 1986
       $262 = $256 << $261; //@line 1987
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 1990
       $267 = $262 << $265; //@line 1992
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 1995
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 2000
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 2006
      }
     }
     $282 = HEAP32[1284 + ($$0358$i << 2) >> 2] | 0; //@line 2010
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 2014
       $$3$i203 = 0; //@line 2014
       $$3350$i = $255; //@line 2014
       label = 81; //@line 2015
      } else {
       $$0342$i = 0; //@line 2022
       $$0347$i = $255; //@line 2022
       $$0353$i = $282; //@line 2022
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 2022
       $$0362$i = 0; //@line 2022
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 2027
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 2032
          $$435113$i = 0; //@line 2032
          $$435712$i = $$0353$i; //@line 2032
          label = 85; //@line 2033
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 2036
          $$1348$i = $292; //@line 2036
         }
        } else {
         $$1343$i = $$0342$i; //@line 2039
         $$1348$i = $$0347$i; //@line 2039
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 2042
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 2045
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 2049
        $302 = ($$0353$i | 0) == 0; //@line 2050
        if ($302) {
         $$2355$i = $$1363$i; //@line 2055
         $$3$i203 = $$1343$i; //@line 2055
         $$3350$i = $$1348$i; //@line 2055
         label = 81; //@line 2056
         break;
        } else {
         $$0342$i = $$1343$i; //@line 2059
         $$0347$i = $$1348$i; //@line 2059
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 2059
         $$0362$i = $$1363$i; //@line 2059
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 2069
       $309 = $253 & ($306 | 0 - $306); //@line 2072
       if (!$309) {
        $$0197 = $252; //@line 2075
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 2080
       $315 = $313 >>> 12 & 16; //@line 2082
       $316 = $313 >>> $315; //@line 2083
       $318 = $316 >>> 5 & 8; //@line 2085
       $320 = $316 >>> $318; //@line 2087
       $322 = $320 >>> 2 & 4; //@line 2089
       $324 = $320 >>> $322; //@line 2091
       $326 = $324 >>> 1 & 2; //@line 2093
       $328 = $324 >>> $326; //@line 2095
       $330 = $328 >>> 1 & 1; //@line 2097
       $$4$ph$i = 0; //@line 2103
       $$4357$ph$i = HEAP32[1284 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 2103
      } else {
       $$4$ph$i = $$3$i203; //@line 2105
       $$4357$ph$i = $$2355$i; //@line 2105
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 2109
       $$4351$lcssa$i = $$3350$i; //@line 2109
      } else {
       $$414$i = $$4$ph$i; //@line 2111
       $$435113$i = $$3350$i; //@line 2111
       $$435712$i = $$4357$ph$i; //@line 2111
       label = 85; //@line 2112
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 2117
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 2121
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 2122
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 2123
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 2124
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2130
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 2133
        $$4351$lcssa$i = $$$4351$i; //@line 2133
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 2136
        $$435113$i = $$$4351$i; //@line 2136
        label = 85; //@line 2137
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 2143
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[247] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[249] | 0; //@line 2149
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 2152
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 2155
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 2158
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 2162
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 2164
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 2168
         $371 = HEAP32[$370 >> 2] | 0; //@line 2169
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 2172
          $374 = HEAP32[$373 >> 2] | 0; //@line 2173
          if (!$374) {
           $$3372$i = 0; //@line 2176
           break;
          } else {
           $$1370$i = $374; //@line 2179
           $$1374$i = $373; //@line 2179
          }
         } else {
          $$1370$i = $371; //@line 2182
          $$1374$i = $370; //@line 2182
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 2185
          $377 = HEAP32[$376 >> 2] | 0; //@line 2186
          if ($377 | 0) {
           $$1370$i = $377; //@line 2189
           $$1374$i = $376; //@line 2189
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 2192
          $380 = HEAP32[$379 >> 2] | 0; //@line 2193
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 2198
           $$1374$i = $379; //@line 2198
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 2203
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 2206
          $$3372$i = $$1370$i; //@line 2207
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 2212
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 2215
         }
         $364 = $362 + 12 | 0; //@line 2218
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 2222
         }
         $367 = $359 + 8 | 0; //@line 2225
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 2229
          HEAP32[$367 >> 2] = $362; //@line 2230
          $$3372$i = $359; //@line 2231
          break;
         } else {
          _abort(); //@line 2234
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 2242
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 2245
         $386 = 1284 + ($385 << 2) | 0; //@line 2246
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 2251
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 2256
            HEAP32[246] = $391; //@line 2257
            $475 = $391; //@line 2258
            break L164;
           }
          } else {
           if ((HEAP32[249] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 2265
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 2273
            if (!$$3372$i) {
             $475 = $253; //@line 2276
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[249] | 0; //@line 2284
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 2287
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 2291
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 2293
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 2299
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 2303
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 2305
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 2311
         if (!$409) {
          $475 = $253; //@line 2314
         } else {
          if ((HEAP32[249] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 2319
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 2323
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 2325
           $475 = $253; //@line 2326
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 2335
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 2338
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 2340
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 2343
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 2347
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 2350
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 2352
         $428 = $$4351$lcssa$i >>> 3; //@line 2353
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 1020 + ($428 << 1 << 2) | 0; //@line 2357
          $432 = HEAP32[245] | 0; //@line 2358
          $433 = 1 << $428; //@line 2359
          if (!($432 & $433)) {
           HEAP32[245] = $432 | $433; //@line 2364
           $$0368$i = $431; //@line 2366
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 2366
          } else {
           $437 = $431 + 8 | 0; //@line 2368
           $438 = HEAP32[$437 >> 2] | 0; //@line 2369
           if ((HEAP32[249] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 2373
           } else {
            $$0368$i = $438; //@line 2376
            $$pre$phi$i211Z2D = $437; //@line 2376
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 2379
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 2381
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 2383
          HEAP32[$354 + 12 >> 2] = $431; //@line 2385
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 2388
         if (!$444) {
          $$0361$i = 0; //@line 2391
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 2395
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 2399
           $450 = $444 << $449; //@line 2400
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 2403
           $455 = $450 << $453; //@line 2405
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 2408
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 2413
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 2419
          }
         }
         $469 = 1284 + ($$0361$i << 2) | 0; //@line 2422
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 2424
         $471 = $354 + 16 | 0; //@line 2425
         HEAP32[$471 + 4 >> 2] = 0; //@line 2427
         HEAP32[$471 >> 2] = 0; //@line 2428
         $473 = 1 << $$0361$i; //@line 2429
         if (!($475 & $473)) {
          HEAP32[246] = $475 | $473; //@line 2434
          HEAP32[$469 >> 2] = $354; //@line 2435
          HEAP32[$354 + 24 >> 2] = $469; //@line 2437
          HEAP32[$354 + 12 >> 2] = $354; //@line 2439
          HEAP32[$354 + 8 >> 2] = $354; //@line 2441
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 2450
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 2450
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 2457
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 2461
          $494 = HEAP32[$492 >> 2] | 0; //@line 2463
          if (!$494) {
           label = 136; //@line 2466
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 2469
           $$0345$i = $494; //@line 2469
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[249] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 2476
          } else {
           HEAP32[$492 >> 2] = $354; //@line 2479
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 2481
           HEAP32[$354 + 12 >> 2] = $354; //@line 2483
           HEAP32[$354 + 8 >> 2] = $354; //@line 2485
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 2490
          $502 = HEAP32[$501 >> 2] | 0; //@line 2491
          $503 = HEAP32[249] | 0; //@line 2492
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 2498
           HEAP32[$501 >> 2] = $354; //@line 2499
           HEAP32[$354 + 8 >> 2] = $502; //@line 2501
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 2503
           HEAP32[$354 + 24 >> 2] = 0; //@line 2505
           break;
          } else {
           _abort(); //@line 2508
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 2515
       STACKTOP = sp; //@line 2516
       return $$0 | 0; //@line 2516
      } else {
       $$0197 = $252; //@line 2518
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[247] | 0; //@line 2525
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 2528
  $515 = HEAP32[250] | 0; //@line 2529
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 2532
   HEAP32[250] = $517; //@line 2533
   HEAP32[247] = $514; //@line 2534
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 2537
   HEAP32[$515 + $512 >> 2] = $514; //@line 2539
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 2542
  } else {
   HEAP32[247] = 0; //@line 2544
   HEAP32[250] = 0; //@line 2545
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 2548
   $526 = $515 + $512 + 4 | 0; //@line 2550
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 2553
  }
  $$0 = $515 + 8 | 0; //@line 2556
  STACKTOP = sp; //@line 2557
  return $$0 | 0; //@line 2557
 }
 $530 = HEAP32[248] | 0; //@line 2559
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 2562
  HEAP32[248] = $532; //@line 2563
  $533 = HEAP32[251] | 0; //@line 2564
  $534 = $533 + $$0197 | 0; //@line 2565
  HEAP32[251] = $534; //@line 2566
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 2569
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 2572
  $$0 = $533 + 8 | 0; //@line 2574
  STACKTOP = sp; //@line 2575
  return $$0 | 0; //@line 2575
 }
 if (!(HEAP32[363] | 0)) {
  HEAP32[365] = 4096; //@line 2580
  HEAP32[364] = 4096; //@line 2581
  HEAP32[366] = -1; //@line 2582
  HEAP32[367] = -1; //@line 2583
  HEAP32[368] = 0; //@line 2584
  HEAP32[356] = 0; //@line 2585
  HEAP32[363] = $1 & -16 ^ 1431655768; //@line 2589
  $548 = 4096; //@line 2590
 } else {
  $548 = HEAP32[365] | 0; //@line 2593
 }
 $545 = $$0197 + 48 | 0; //@line 2595
 $546 = $$0197 + 47 | 0; //@line 2596
 $547 = $548 + $546 | 0; //@line 2597
 $549 = 0 - $548 | 0; //@line 2598
 $550 = $547 & $549; //@line 2599
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 2602
  STACKTOP = sp; //@line 2603
  return $$0 | 0; //@line 2603
 }
 $552 = HEAP32[355] | 0; //@line 2605
 if ($552 | 0) {
  $554 = HEAP32[353] | 0; //@line 2608
  $555 = $554 + $550 | 0; //@line 2609
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 2614
   STACKTOP = sp; //@line 2615
   return $$0 | 0; //@line 2615
  }
 }
 L244 : do {
  if (!(HEAP32[356] & 4)) {
   $561 = HEAP32[251] | 0; //@line 2623
   L246 : do {
    if (!$561) {
     label = 163; //@line 2627
    } else {
     $$0$i$i = 1428; //@line 2629
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 2631
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 2634
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 2643
      if (!$570) {
       label = 163; //@line 2646
       break L246;
      } else {
       $$0$i$i = $570; //@line 2649
      }
     }
     $595 = $547 - $530 & $549; //@line 2653
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 2656
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 2664
       } else {
        $$723947$i = $595; //@line 2666
        $$748$i = $597; //@line 2666
        label = 180; //@line 2667
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 2671
       $$2253$ph$i = $595; //@line 2671
       label = 171; //@line 2672
      }
     } else {
      $$2234243136$i = 0; //@line 2675
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 2681
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 2684
     } else {
      $574 = $572; //@line 2686
      $575 = HEAP32[364] | 0; //@line 2687
      $576 = $575 + -1 | 0; //@line 2688
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 2696
      $584 = HEAP32[353] | 0; //@line 2697
      $585 = $$$i + $584 | 0; //@line 2698
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[355] | 0; //@line 2703
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 2710
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 2714
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 2717
        $$748$i = $572; //@line 2717
        label = 180; //@line 2718
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 2721
        $$2253$ph$i = $$$i; //@line 2721
        label = 171; //@line 2722
       }
      } else {
       $$2234243136$i = 0; //@line 2725
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 2732
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 2741
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 2744
       $$748$i = $$2247$ph$i; //@line 2744
       label = 180; //@line 2745
       break L244;
      }
     }
     $607 = HEAP32[365] | 0; //@line 2749
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 2753
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 2756
      $$748$i = $$2247$ph$i; //@line 2756
      label = 180; //@line 2757
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 2763
      $$2234243136$i = 0; //@line 2764
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 2768
      $$748$i = $$2247$ph$i; //@line 2768
      label = 180; //@line 2769
      break L244;
     }
    }
   } while (0);
   HEAP32[356] = HEAP32[356] | 4; //@line 2776
   $$4236$i = $$2234243136$i; //@line 2777
   label = 178; //@line 2778
  } else {
   $$4236$i = 0; //@line 2780
   label = 178; //@line 2781
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 2787
   $621 = _sbrk(0) | 0; //@line 2788
   $627 = $621 - $620 | 0; //@line 2796
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 2798
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 2806
    $$748$i = $620; //@line 2806
    label = 180; //@line 2807
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[353] | 0) + $$723947$i | 0; //@line 2813
  HEAP32[353] = $633; //@line 2814
  if ($633 >>> 0 > (HEAP32[354] | 0) >>> 0) {
   HEAP32[354] = $633; //@line 2818
  }
  $636 = HEAP32[251] | 0; //@line 2820
  do {
   if (!$636) {
    $638 = HEAP32[249] | 0; //@line 2824
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[249] = $$748$i; //@line 2829
    }
    HEAP32[357] = $$748$i; //@line 2831
    HEAP32[358] = $$723947$i; //@line 2832
    HEAP32[360] = 0; //@line 2833
    HEAP32[254] = HEAP32[363]; //@line 2835
    HEAP32[253] = -1; //@line 2836
    HEAP32[258] = 1020; //@line 2837
    HEAP32[257] = 1020; //@line 2838
    HEAP32[260] = 1028; //@line 2839
    HEAP32[259] = 1028; //@line 2840
    HEAP32[262] = 1036; //@line 2841
    HEAP32[261] = 1036; //@line 2842
    HEAP32[264] = 1044; //@line 2843
    HEAP32[263] = 1044; //@line 2844
    HEAP32[266] = 1052; //@line 2845
    HEAP32[265] = 1052; //@line 2846
    HEAP32[268] = 1060; //@line 2847
    HEAP32[267] = 1060; //@line 2848
    HEAP32[270] = 1068; //@line 2849
    HEAP32[269] = 1068; //@line 2850
    HEAP32[272] = 1076; //@line 2851
    HEAP32[271] = 1076; //@line 2852
    HEAP32[274] = 1084; //@line 2853
    HEAP32[273] = 1084; //@line 2854
    HEAP32[276] = 1092; //@line 2855
    HEAP32[275] = 1092; //@line 2856
    HEAP32[278] = 1100; //@line 2857
    HEAP32[277] = 1100; //@line 2858
    HEAP32[280] = 1108; //@line 2859
    HEAP32[279] = 1108; //@line 2860
    HEAP32[282] = 1116; //@line 2861
    HEAP32[281] = 1116; //@line 2862
    HEAP32[284] = 1124; //@line 2863
    HEAP32[283] = 1124; //@line 2864
    HEAP32[286] = 1132; //@line 2865
    HEAP32[285] = 1132; //@line 2866
    HEAP32[288] = 1140; //@line 2867
    HEAP32[287] = 1140; //@line 2868
    HEAP32[290] = 1148; //@line 2869
    HEAP32[289] = 1148; //@line 2870
    HEAP32[292] = 1156; //@line 2871
    HEAP32[291] = 1156; //@line 2872
    HEAP32[294] = 1164; //@line 2873
    HEAP32[293] = 1164; //@line 2874
    HEAP32[296] = 1172; //@line 2875
    HEAP32[295] = 1172; //@line 2876
    HEAP32[298] = 1180; //@line 2877
    HEAP32[297] = 1180; //@line 2878
    HEAP32[300] = 1188; //@line 2879
    HEAP32[299] = 1188; //@line 2880
    HEAP32[302] = 1196; //@line 2881
    HEAP32[301] = 1196; //@line 2882
    HEAP32[304] = 1204; //@line 2883
    HEAP32[303] = 1204; //@line 2884
    HEAP32[306] = 1212; //@line 2885
    HEAP32[305] = 1212; //@line 2886
    HEAP32[308] = 1220; //@line 2887
    HEAP32[307] = 1220; //@line 2888
    HEAP32[310] = 1228; //@line 2889
    HEAP32[309] = 1228; //@line 2890
    HEAP32[312] = 1236; //@line 2891
    HEAP32[311] = 1236; //@line 2892
    HEAP32[314] = 1244; //@line 2893
    HEAP32[313] = 1244; //@line 2894
    HEAP32[316] = 1252; //@line 2895
    HEAP32[315] = 1252; //@line 2896
    HEAP32[318] = 1260; //@line 2897
    HEAP32[317] = 1260; //@line 2898
    HEAP32[320] = 1268; //@line 2899
    HEAP32[319] = 1268; //@line 2900
    $642 = $$723947$i + -40 | 0; //@line 2901
    $644 = $$748$i + 8 | 0; //@line 2903
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 2908
    $650 = $$748$i + $649 | 0; //@line 2909
    $651 = $642 - $649 | 0; //@line 2910
    HEAP32[251] = $650; //@line 2911
    HEAP32[248] = $651; //@line 2912
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 2915
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 2918
    HEAP32[252] = HEAP32[367]; //@line 2920
   } else {
    $$024367$i = 1428; //@line 2922
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 2924
     $658 = $$024367$i + 4 | 0; //@line 2925
     $659 = HEAP32[$658 >> 2] | 0; //@line 2926
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 2930
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 2934
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 2939
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 2953
       $673 = (HEAP32[248] | 0) + $$723947$i | 0; //@line 2955
       $675 = $636 + 8 | 0; //@line 2957
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 2962
       $681 = $636 + $680 | 0; //@line 2963
       $682 = $673 - $680 | 0; //@line 2964
       HEAP32[251] = $681; //@line 2965
       HEAP32[248] = $682; //@line 2966
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 2969
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 2972
       HEAP32[252] = HEAP32[367]; //@line 2974
       break;
      }
     }
    }
    $688 = HEAP32[249] | 0; //@line 2979
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[249] = $$748$i; //@line 2982
     $753 = $$748$i; //@line 2983
    } else {
     $753 = $688; //@line 2985
    }
    $690 = $$748$i + $$723947$i | 0; //@line 2987
    $$124466$i = 1428; //@line 2988
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 2993
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 2997
     if (!$694) {
      $$0$i$i$i = 1428; //@line 3000
      break;
     } else {
      $$124466$i = $694; //@line 3003
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 3012
      $700 = $$124466$i + 4 | 0; //@line 3013
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 3016
      $704 = $$748$i + 8 | 0; //@line 3018
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 3024
      $712 = $690 + 8 | 0; //@line 3026
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 3032
      $722 = $710 + $$0197 | 0; //@line 3036
      $723 = $718 - $710 - $$0197 | 0; //@line 3037
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 3040
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[248] | 0) + $723 | 0; //@line 3045
        HEAP32[248] = $728; //@line 3046
        HEAP32[251] = $722; //@line 3047
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 3050
       } else {
        if ((HEAP32[250] | 0) == ($718 | 0)) {
         $734 = (HEAP32[247] | 0) + $723 | 0; //@line 3056
         HEAP32[247] = $734; //@line 3057
         HEAP32[250] = $722; //@line 3058
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 3061
         HEAP32[$722 + $734 >> 2] = $734; //@line 3063
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 3067
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 3071
         $743 = $739 >>> 3; //@line 3072
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 3077
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 3079
           $750 = 1020 + ($743 << 1 << 2) | 0; //@line 3081
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 3087
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 3096
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[245] = HEAP32[245] & ~(1 << $743); //@line 3106
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 3113
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 3117
             }
             $764 = $748 + 8 | 0; //@line 3120
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 3124
              break;
             }
             _abort(); //@line 3127
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 3132
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 3133
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 3136
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 3138
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 3142
             $783 = $782 + 4 | 0; //@line 3143
             $784 = HEAP32[$783 >> 2] | 0; //@line 3144
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 3147
              if (!$786) {
               $$3$i$i = 0; //@line 3150
               break;
              } else {
               $$1291$i$i = $786; //@line 3153
               $$1293$i$i = $782; //@line 3153
              }
             } else {
              $$1291$i$i = $784; //@line 3156
              $$1293$i$i = $783; //@line 3156
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 3159
              $789 = HEAP32[$788 >> 2] | 0; //@line 3160
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 3163
               $$1293$i$i = $788; //@line 3163
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 3166
              $792 = HEAP32[$791 >> 2] | 0; //@line 3167
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 3172
               $$1293$i$i = $791; //@line 3172
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 3177
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 3180
              $$3$i$i = $$1291$i$i; //@line 3181
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 3186
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 3189
             }
             $776 = $774 + 12 | 0; //@line 3192
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 3196
             }
             $779 = $771 + 8 | 0; //@line 3199
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 3203
              HEAP32[$779 >> 2] = $774; //@line 3204
              $$3$i$i = $771; //@line 3205
              break;
             } else {
              _abort(); //@line 3208
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 3218
           $798 = 1284 + ($797 << 2) | 0; //@line 3219
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 3224
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[246] = HEAP32[246] & ~(1 << $797); //@line 3233
             break L311;
            } else {
             if ((HEAP32[249] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 3239
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 3247
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[249] | 0; //@line 3257
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 3260
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 3264
           $815 = $718 + 16 | 0; //@line 3265
           $816 = HEAP32[$815 >> 2] | 0; //@line 3266
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 3272
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 3276
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 3278
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 3284
           if (!$822) {
            break;
           }
           if ((HEAP32[249] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 3292
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 3296
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 3298
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 3305
         $$0287$i$i = $742 + $723 | 0; //@line 3305
        } else {
         $$0$i17$i = $718; //@line 3307
         $$0287$i$i = $723; //@line 3307
        }
        $830 = $$0$i17$i + 4 | 0; //@line 3309
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 3312
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 3315
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 3317
        $836 = $$0287$i$i >>> 3; //@line 3318
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 1020 + ($836 << 1 << 2) | 0; //@line 3322
         $840 = HEAP32[245] | 0; //@line 3323
         $841 = 1 << $836; //@line 3324
         do {
          if (!($840 & $841)) {
           HEAP32[245] = $840 | $841; //@line 3330
           $$0295$i$i = $839; //@line 3332
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 3332
          } else {
           $845 = $839 + 8 | 0; //@line 3334
           $846 = HEAP32[$845 >> 2] | 0; //@line 3335
           if ((HEAP32[249] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 3339
            $$pre$phi$i19$iZ2D = $845; //@line 3339
            break;
           }
           _abort(); //@line 3342
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 3346
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 3348
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 3350
         HEAP32[$722 + 12 >> 2] = $839; //@line 3352
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 3355
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 3359
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 3363
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 3368
          $858 = $852 << $857; //@line 3369
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 3372
          $863 = $858 << $861; //@line 3374
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 3377
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 3382
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 3388
         }
        } while (0);
        $877 = 1284 + ($$0296$i$i << 2) | 0; //@line 3391
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 3393
        $879 = $722 + 16 | 0; //@line 3394
        HEAP32[$879 + 4 >> 2] = 0; //@line 3396
        HEAP32[$879 >> 2] = 0; //@line 3397
        $881 = HEAP32[246] | 0; //@line 3398
        $882 = 1 << $$0296$i$i; //@line 3399
        if (!($881 & $882)) {
         HEAP32[246] = $881 | $882; //@line 3404
         HEAP32[$877 >> 2] = $722; //@line 3405
         HEAP32[$722 + 24 >> 2] = $877; //@line 3407
         HEAP32[$722 + 12 >> 2] = $722; //@line 3409
         HEAP32[$722 + 8 >> 2] = $722; //@line 3411
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 3420
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 3420
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 3427
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 3431
         $902 = HEAP32[$900 >> 2] | 0; //@line 3433
         if (!$902) {
          label = 260; //@line 3436
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 3439
          $$0289$i$i = $902; //@line 3439
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[249] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 3446
         } else {
          HEAP32[$900 >> 2] = $722; //@line 3449
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 3451
          HEAP32[$722 + 12 >> 2] = $722; //@line 3453
          HEAP32[$722 + 8 >> 2] = $722; //@line 3455
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 3460
         $910 = HEAP32[$909 >> 2] | 0; //@line 3461
         $911 = HEAP32[249] | 0; //@line 3462
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 3468
          HEAP32[$909 >> 2] = $722; //@line 3469
          HEAP32[$722 + 8 >> 2] = $910; //@line 3471
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 3473
          HEAP32[$722 + 24 >> 2] = 0; //@line 3475
          break;
         } else {
          _abort(); //@line 3478
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 3485
      STACKTOP = sp; //@line 3486
      return $$0 | 0; //@line 3486
     } else {
      $$0$i$i$i = 1428; //@line 3488
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 3492
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 3497
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 3505
    }
    $927 = $923 + -47 | 0; //@line 3507
    $929 = $927 + 8 | 0; //@line 3509
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 3515
    $936 = $636 + 16 | 0; //@line 3516
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 3518
    $939 = $938 + 8 | 0; //@line 3519
    $940 = $938 + 24 | 0; //@line 3520
    $941 = $$723947$i + -40 | 0; //@line 3521
    $943 = $$748$i + 8 | 0; //@line 3523
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 3528
    $949 = $$748$i + $948 | 0; //@line 3529
    $950 = $941 - $948 | 0; //@line 3530
    HEAP32[251] = $949; //@line 3531
    HEAP32[248] = $950; //@line 3532
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 3535
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 3538
    HEAP32[252] = HEAP32[367]; //@line 3540
    $956 = $938 + 4 | 0; //@line 3541
    HEAP32[$956 >> 2] = 27; //@line 3542
    HEAP32[$939 >> 2] = HEAP32[357]; //@line 3543
    HEAP32[$939 + 4 >> 2] = HEAP32[358]; //@line 3543
    HEAP32[$939 + 8 >> 2] = HEAP32[359]; //@line 3543
    HEAP32[$939 + 12 >> 2] = HEAP32[360]; //@line 3543
    HEAP32[357] = $$748$i; //@line 3544
    HEAP32[358] = $$723947$i; //@line 3545
    HEAP32[360] = 0; //@line 3546
    HEAP32[359] = $939; //@line 3547
    $958 = $940; //@line 3548
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 3550
     HEAP32[$958 >> 2] = 7; //@line 3551
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 3564
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 3567
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 3570
     HEAP32[$938 >> 2] = $964; //@line 3571
     $969 = $964 >>> 3; //@line 3572
     if ($964 >>> 0 < 256) {
      $972 = 1020 + ($969 << 1 << 2) | 0; //@line 3576
      $973 = HEAP32[245] | 0; //@line 3577
      $974 = 1 << $969; //@line 3578
      if (!($973 & $974)) {
       HEAP32[245] = $973 | $974; //@line 3583
       $$0211$i$i = $972; //@line 3585
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 3585
      } else {
       $978 = $972 + 8 | 0; //@line 3587
       $979 = HEAP32[$978 >> 2] | 0; //@line 3588
       if ((HEAP32[249] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 3592
       } else {
        $$0211$i$i = $979; //@line 3595
        $$pre$phi$i$iZ2D = $978; //@line 3595
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 3598
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 3600
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 3602
      HEAP32[$636 + 12 >> 2] = $972; //@line 3604
      break;
     }
     $985 = $964 >>> 8; //@line 3607
     if (!$985) {
      $$0212$i$i = 0; //@line 3610
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 3614
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 3618
       $991 = $985 << $990; //@line 3619
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 3622
       $996 = $991 << $994; //@line 3624
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 3627
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 3632
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 3638
      }
     }
     $1010 = 1284 + ($$0212$i$i << 2) | 0; //@line 3641
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 3643
     HEAP32[$636 + 20 >> 2] = 0; //@line 3645
     HEAP32[$936 >> 2] = 0; //@line 3646
     $1013 = HEAP32[246] | 0; //@line 3647
     $1014 = 1 << $$0212$i$i; //@line 3648
     if (!($1013 & $1014)) {
      HEAP32[246] = $1013 | $1014; //@line 3653
      HEAP32[$1010 >> 2] = $636; //@line 3654
      HEAP32[$636 + 24 >> 2] = $1010; //@line 3656
      HEAP32[$636 + 12 >> 2] = $636; //@line 3658
      HEAP32[$636 + 8 >> 2] = $636; //@line 3660
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 3669
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 3669
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 3676
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 3680
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 3682
      if (!$1034) {
       label = 286; //@line 3685
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 3688
       $$0207$i$i = $1034; //@line 3688
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[249] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 3695
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 3698
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 3700
       HEAP32[$636 + 12 >> 2] = $636; //@line 3702
       HEAP32[$636 + 8 >> 2] = $636; //@line 3704
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 3709
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 3710
      $1043 = HEAP32[249] | 0; //@line 3711
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 3717
       HEAP32[$1041 >> 2] = $636; //@line 3718
       HEAP32[$636 + 8 >> 2] = $1042; //@line 3720
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 3722
       HEAP32[$636 + 24 >> 2] = 0; //@line 3724
       break;
      } else {
       _abort(); //@line 3727
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[248] | 0; //@line 3734
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 3737
   HEAP32[248] = $1054; //@line 3738
   $1055 = HEAP32[251] | 0; //@line 3739
   $1056 = $1055 + $$0197 | 0; //@line 3740
   HEAP32[251] = $1056; //@line 3741
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 3744
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 3747
   $$0 = $1055 + 8 | 0; //@line 3749
   STACKTOP = sp; //@line 3750
   return $$0 | 0; //@line 3750
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 3754
 $$0 = 0; //@line 3755
 STACKTOP = sp; //@line 3756
 return $$0 | 0; //@line 3756
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 3783
 $3 = HEAP32[249] | 0; //@line 3784
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 3787
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 3791
 $7 = $6 & 3; //@line 3792
 if (($7 | 0) == 1) {
  _abort(); //@line 3795
 }
 $9 = $6 & -8; //@line 3798
 $10 = $2 + $9 | 0; //@line 3799
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 3804
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 3810
   $17 = $13 + $9 | 0; //@line 3811
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 3814
   }
   if ((HEAP32[250] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 3820
    $106 = HEAP32[$105 >> 2] | 0; //@line 3821
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 3825
     $$1382 = $17; //@line 3825
     $114 = $16; //@line 3825
     break;
    }
    HEAP32[247] = $17; //@line 3828
    HEAP32[$105 >> 2] = $106 & -2; //@line 3830
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 3833
    HEAP32[$16 + $17 >> 2] = $17; //@line 3835
    return;
   }
   $21 = $13 >>> 3; //@line 3838
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 3842
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 3844
    $28 = 1020 + ($21 << 1 << 2) | 0; //@line 3846
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 3851
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 3858
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[245] = HEAP32[245] & ~(1 << $21); //@line 3868
     $$1 = $16; //@line 3869
     $$1382 = $17; //@line 3869
     $114 = $16; //@line 3869
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 3875
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 3879
     }
     $41 = $26 + 8 | 0; //@line 3882
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 3886
     } else {
      _abort(); //@line 3888
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 3893
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 3894
    $$1 = $16; //@line 3895
    $$1382 = $17; //@line 3895
    $114 = $16; //@line 3895
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 3899
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 3901
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 3905
     $60 = $59 + 4 | 0; //@line 3906
     $61 = HEAP32[$60 >> 2] | 0; //@line 3907
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 3910
      if (!$63) {
       $$3 = 0; //@line 3913
       break;
      } else {
       $$1387 = $63; //@line 3916
       $$1390 = $59; //@line 3916
      }
     } else {
      $$1387 = $61; //@line 3919
      $$1390 = $60; //@line 3919
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 3922
      $66 = HEAP32[$65 >> 2] | 0; //@line 3923
      if ($66 | 0) {
       $$1387 = $66; //@line 3926
       $$1390 = $65; //@line 3926
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 3929
      $69 = HEAP32[$68 >> 2] | 0; //@line 3930
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 3935
       $$1390 = $68; //@line 3935
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 3940
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 3943
      $$3 = $$1387; //@line 3944
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 3949
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 3952
     }
     $53 = $51 + 12 | 0; //@line 3955
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 3959
     }
     $56 = $48 + 8 | 0; //@line 3962
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 3966
      HEAP32[$56 >> 2] = $51; //@line 3967
      $$3 = $48; //@line 3968
      break;
     } else {
      _abort(); //@line 3971
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 3978
    $$1382 = $17; //@line 3978
    $114 = $16; //@line 3978
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 3981
    $75 = 1284 + ($74 << 2) | 0; //@line 3982
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 3987
      if (!$$3) {
       HEAP32[246] = HEAP32[246] & ~(1 << $74); //@line 3994
       $$1 = $16; //@line 3995
       $$1382 = $17; //@line 3995
       $114 = $16; //@line 3995
       break L10;
      }
     } else {
      if ((HEAP32[249] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 4002
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 4010
       if (!$$3) {
        $$1 = $16; //@line 4013
        $$1382 = $17; //@line 4013
        $114 = $16; //@line 4013
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[249] | 0; //@line 4021
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 4024
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 4028
    $92 = $16 + 16 | 0; //@line 4029
    $93 = HEAP32[$92 >> 2] | 0; //@line 4030
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 4036
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 4040
       HEAP32[$93 + 24 >> 2] = $$3; //@line 4042
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 4048
    if (!$99) {
     $$1 = $16; //@line 4051
     $$1382 = $17; //@line 4051
     $114 = $16; //@line 4051
    } else {
     if ((HEAP32[249] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 4056
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 4060
      HEAP32[$99 + 24 >> 2] = $$3; //@line 4062
      $$1 = $16; //@line 4063
      $$1382 = $17; //@line 4063
      $114 = $16; //@line 4063
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 4069
   $$1382 = $9; //@line 4069
   $114 = $2; //@line 4069
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 4074
 }
 $115 = $10 + 4 | 0; //@line 4077
 $116 = HEAP32[$115 >> 2] | 0; //@line 4078
 if (!($116 & 1)) {
  _abort(); //@line 4082
 }
 if (!($116 & 2)) {
  if ((HEAP32[251] | 0) == ($10 | 0)) {
   $124 = (HEAP32[248] | 0) + $$1382 | 0; //@line 4092
   HEAP32[248] = $124; //@line 4093
   HEAP32[251] = $$1; //@line 4094
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 4097
   if (($$1 | 0) != (HEAP32[250] | 0)) {
    return;
   }
   HEAP32[250] = 0; //@line 4103
   HEAP32[247] = 0; //@line 4104
   return;
  }
  if ((HEAP32[250] | 0) == ($10 | 0)) {
   $132 = (HEAP32[247] | 0) + $$1382 | 0; //@line 4111
   HEAP32[247] = $132; //@line 4112
   HEAP32[250] = $114; //@line 4113
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 4116
   HEAP32[$114 + $132 >> 2] = $132; //@line 4118
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 4122
  $138 = $116 >>> 3; //@line 4123
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 4128
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 4130
    $145 = 1020 + ($138 << 1 << 2) | 0; //@line 4132
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[249] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 4138
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 4145
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[245] = HEAP32[245] & ~(1 << $138); //@line 4155
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 4161
    } else {
     if ((HEAP32[249] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 4166
     }
     $160 = $143 + 8 | 0; //@line 4169
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 4173
     } else {
      _abort(); //@line 4175
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 4180
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 4181
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 4184
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 4186
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 4190
      $180 = $179 + 4 | 0; //@line 4191
      $181 = HEAP32[$180 >> 2] | 0; //@line 4192
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 4195
       if (!$183) {
        $$3400 = 0; //@line 4198
        break;
       } else {
        $$1398 = $183; //@line 4201
        $$1402 = $179; //@line 4201
       }
      } else {
       $$1398 = $181; //@line 4204
       $$1402 = $180; //@line 4204
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 4207
       $186 = HEAP32[$185 >> 2] | 0; //@line 4208
       if ($186 | 0) {
        $$1398 = $186; //@line 4211
        $$1402 = $185; //@line 4211
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 4214
       $189 = HEAP32[$188 >> 2] | 0; //@line 4215
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 4220
        $$1402 = $188; //@line 4220
       }
      }
      if ((HEAP32[249] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 4226
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 4229
       $$3400 = $$1398; //@line 4230
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 4235
      if ((HEAP32[249] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 4239
      }
      $173 = $170 + 12 | 0; //@line 4242
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 4246
      }
      $176 = $167 + 8 | 0; //@line 4249
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 4253
       HEAP32[$176 >> 2] = $170; //@line 4254
       $$3400 = $167; //@line 4255
       break;
      } else {
       _abort(); //@line 4258
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 4266
     $196 = 1284 + ($195 << 2) | 0; //@line 4267
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 4272
       if (!$$3400) {
        HEAP32[246] = HEAP32[246] & ~(1 << $195); //@line 4279
        break L108;
       }
      } else {
       if ((HEAP32[249] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 4286
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 4294
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[249] | 0; //@line 4304
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 4307
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 4311
     $213 = $10 + 16 | 0; //@line 4312
     $214 = HEAP32[$213 >> 2] | 0; //@line 4313
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 4319
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 4323
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 4325
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 4331
     if ($220 | 0) {
      if ((HEAP32[249] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 4337
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 4341
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 4343
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 4352
  HEAP32[$114 + $137 >> 2] = $137; //@line 4354
  if (($$1 | 0) == (HEAP32[250] | 0)) {
   HEAP32[247] = $137; //@line 4358
   return;
  } else {
   $$2 = $137; //@line 4361
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 4365
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 4368
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 4370
  $$2 = $$1382; //@line 4371
 }
 $235 = $$2 >>> 3; //@line 4373
 if ($$2 >>> 0 < 256) {
  $238 = 1020 + ($235 << 1 << 2) | 0; //@line 4377
  $239 = HEAP32[245] | 0; //@line 4378
  $240 = 1 << $235; //@line 4379
  if (!($239 & $240)) {
   HEAP32[245] = $239 | $240; //@line 4384
   $$0403 = $238; //@line 4386
   $$pre$phiZ2D = $238 + 8 | 0; //@line 4386
  } else {
   $244 = $238 + 8 | 0; //@line 4388
   $245 = HEAP32[$244 >> 2] | 0; //@line 4389
   if ((HEAP32[249] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 4393
   } else {
    $$0403 = $245; //@line 4396
    $$pre$phiZ2D = $244; //@line 4396
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 4399
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 4401
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 4403
  HEAP32[$$1 + 12 >> 2] = $238; //@line 4405
  return;
 }
 $251 = $$2 >>> 8; //@line 4408
 if (!$251) {
  $$0396 = 0; //@line 4411
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 4415
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 4419
   $257 = $251 << $256; //@line 4420
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 4423
   $262 = $257 << $260; //@line 4425
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 4428
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 4433
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 4439
  }
 }
 $276 = 1284 + ($$0396 << 2) | 0; //@line 4442
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 4444
 HEAP32[$$1 + 20 >> 2] = 0; //@line 4447
 HEAP32[$$1 + 16 >> 2] = 0; //@line 4448
 $280 = HEAP32[246] | 0; //@line 4449
 $281 = 1 << $$0396; //@line 4450
 do {
  if (!($280 & $281)) {
   HEAP32[246] = $280 | $281; //@line 4456
   HEAP32[$276 >> 2] = $$1; //@line 4457
   HEAP32[$$1 + 24 >> 2] = $276; //@line 4459
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 4461
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 4463
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 4471
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 4471
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 4478
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 4482
    $301 = HEAP32[$299 >> 2] | 0; //@line 4484
    if (!$301) {
     label = 121; //@line 4487
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 4490
     $$0384 = $301; //@line 4490
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[249] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 4497
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 4500
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 4502
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 4504
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 4506
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 4511
    $309 = HEAP32[$308 >> 2] | 0; //@line 4512
    $310 = HEAP32[249] | 0; //@line 4513
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 4519
     HEAP32[$308 >> 2] = $$1; //@line 4520
     HEAP32[$$1 + 8 >> 2] = $309; //@line 4522
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 4524
     HEAP32[$$1 + 24 >> 2] = 0; //@line 4526
     break;
    } else {
     _abort(); //@line 4529
    }
   }
  }
 } while (0);
 $319 = (HEAP32[253] | 0) + -1 | 0; //@line 4536
 HEAP32[253] = $319; //@line 4537
 if (!$319) {
  $$0212$in$i = 1436; //@line 4540
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 4545
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 4551
  }
 }
 HEAP32[253] = -1; //@line 4554
 return;
}
function _main() {
 var $AsyncCtx = 0, $AsyncCtx101 = 0, $AsyncCtx104 = 0, $AsyncCtx107 = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx62 = 0, $AsyncCtx65 = 0, $AsyncCtx68 = 0, $AsyncCtx7 = 0, $AsyncCtx71 = 0, $AsyncCtx74 = 0, $AsyncCtx77 = 0, $AsyncCtx80 = 0, $AsyncCtx83 = 0, $AsyncCtx86 = 0, $AsyncCtx89 = 0, $AsyncCtx92 = 0, $AsyncCtx95 = 0, $AsyncCtx98 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 956
 while (1) {
  $AsyncCtx59 = _emscripten_alloc_async_context(4, sp) | 0; //@line 958
  __ZN4mbed6BusOutaSEi(904, 0) | 0; //@line 959
  if (___async) {
   label = 3; //@line 962
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 965
  $AsyncCtx107 = _emscripten_alloc_async_context(4, sp) | 0; //@line 966
  _wait(.25); //@line 967
  if (___async) {
   label = 5; //@line 970
   break;
  }
  _emscripten_free_async_context($AsyncCtx107 | 0); //@line 973
  $AsyncCtx55 = _emscripten_alloc_async_context(4, sp) | 0; //@line 974
  __ZN4mbed6BusOutaSEi(904, 1) | 0; //@line 975
  if (___async) {
   label = 7; //@line 978
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 981
  $AsyncCtx104 = _emscripten_alloc_async_context(4, sp) | 0; //@line 982
  _wait(.25); //@line 983
  if (___async) {
   label = 9; //@line 986
   break;
  }
  _emscripten_free_async_context($AsyncCtx104 | 0); //@line 989
  $AsyncCtx51 = _emscripten_alloc_async_context(4, sp) | 0; //@line 990
  __ZN4mbed6BusOutaSEi(904, 2) | 0; //@line 991
  if (___async) {
   label = 11; //@line 994
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 997
  $AsyncCtx101 = _emscripten_alloc_async_context(4, sp) | 0; //@line 998
  _wait(.25); //@line 999
  if (___async) {
   label = 13; //@line 1002
   break;
  }
  _emscripten_free_async_context($AsyncCtx101 | 0); //@line 1005
  $AsyncCtx47 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1006
  __ZN4mbed6BusOutaSEi(904, 3) | 0; //@line 1007
  if (___async) {
   label = 15; //@line 1010
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 1013
  $AsyncCtx98 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1014
  _wait(.25); //@line 1015
  if (___async) {
   label = 17; //@line 1018
   break;
  }
  _emscripten_free_async_context($AsyncCtx98 | 0); //@line 1021
  $AsyncCtx43 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1022
  __ZN4mbed6BusOutaSEi(904, 4) | 0; //@line 1023
  if (___async) {
   label = 19; //@line 1026
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 1029
  $AsyncCtx95 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1030
  _wait(.25); //@line 1031
  if (___async) {
   label = 21; //@line 1034
   break;
  }
  _emscripten_free_async_context($AsyncCtx95 | 0); //@line 1037
  $AsyncCtx39 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1038
  __ZN4mbed6BusOutaSEi(904, 5) | 0; //@line 1039
  if (___async) {
   label = 23; //@line 1042
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 1045
  $AsyncCtx92 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1046
  _wait(.25); //@line 1047
  if (___async) {
   label = 25; //@line 1050
   break;
  }
  _emscripten_free_async_context($AsyncCtx92 | 0); //@line 1053
  $AsyncCtx35 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1054
  __ZN4mbed6BusOutaSEi(904, 6) | 0; //@line 1055
  if (___async) {
   label = 27; //@line 1058
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 1061
  $AsyncCtx89 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1062
  _wait(.25); //@line 1063
  if (___async) {
   label = 29; //@line 1066
   break;
  }
  _emscripten_free_async_context($AsyncCtx89 | 0); //@line 1069
  $AsyncCtx31 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1070
  __ZN4mbed6BusOutaSEi(904, 7) | 0; //@line 1071
  if (___async) {
   label = 31; //@line 1074
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 1077
  $AsyncCtx86 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1078
  _wait(.25); //@line 1079
  if (___async) {
   label = 33; //@line 1082
   break;
  }
  _emscripten_free_async_context($AsyncCtx86 | 0); //@line 1085
  $AsyncCtx27 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1086
  __ZN4mbed6BusOutaSEi(904, 8) | 0; //@line 1087
  if (___async) {
   label = 35; //@line 1090
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 1093
  $AsyncCtx83 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1094
  _wait(.25); //@line 1095
  if (___async) {
   label = 37; //@line 1098
   break;
  }
  _emscripten_free_async_context($AsyncCtx83 | 0); //@line 1101
  $AsyncCtx23 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1102
  __ZN4mbed6BusOutaSEi(904, 9) | 0; //@line 1103
  if (___async) {
   label = 39; //@line 1106
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 1109
  $AsyncCtx80 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1110
  _wait(.25); //@line 1111
  if (___async) {
   label = 41; //@line 1114
   break;
  }
  _emscripten_free_async_context($AsyncCtx80 | 0); //@line 1117
  $AsyncCtx19 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1118
  __ZN4mbed6BusOutaSEi(904, 10) | 0; //@line 1119
  if (___async) {
   label = 43; //@line 1122
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 1125
  $AsyncCtx77 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1126
  _wait(.25); //@line 1127
  if (___async) {
   label = 45; //@line 1130
   break;
  }
  _emscripten_free_async_context($AsyncCtx77 | 0); //@line 1133
  $AsyncCtx15 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1134
  __ZN4mbed6BusOutaSEi(904, 11) | 0; //@line 1135
  if (___async) {
   label = 47; //@line 1138
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1141
  $AsyncCtx74 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1142
  _wait(.25); //@line 1143
  if (___async) {
   label = 49; //@line 1146
   break;
  }
  _emscripten_free_async_context($AsyncCtx74 | 0); //@line 1149
  $AsyncCtx11 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1150
  __ZN4mbed6BusOutaSEi(904, 12) | 0; //@line 1151
  if (___async) {
   label = 51; //@line 1154
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1157
  $AsyncCtx71 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1158
  _wait(.25); //@line 1159
  if (___async) {
   label = 53; //@line 1162
   break;
  }
  _emscripten_free_async_context($AsyncCtx71 | 0); //@line 1165
  $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1166
  __ZN4mbed6BusOutaSEi(904, 13) | 0; //@line 1167
  if (___async) {
   label = 55; //@line 1170
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1173
  $AsyncCtx68 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1174
  _wait(.25); //@line 1175
  if (___async) {
   label = 57; //@line 1178
   break;
  }
  _emscripten_free_async_context($AsyncCtx68 | 0); //@line 1181
  $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1182
  __ZN4mbed6BusOutaSEi(904, 14) | 0; //@line 1183
  if (___async) {
   label = 59; //@line 1186
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1189
  $AsyncCtx65 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1190
  _wait(.25); //@line 1191
  if (___async) {
   label = 61; //@line 1194
   break;
  }
  _emscripten_free_async_context($AsyncCtx65 | 0); //@line 1197
  $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1198
  __ZN4mbed6BusOutaSEi(904, 15) | 0; //@line 1199
  if (___async) {
   label = 63; //@line 1202
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1205
  $AsyncCtx62 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1206
  _wait(.25); //@line 1207
  if (___async) {
   label = 65; //@line 1210
   break;
  }
  _emscripten_free_async_context($AsyncCtx62 | 0); //@line 1213
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 37; //@line 1217
   sp = STACKTOP; //@line 1218
   return 0; //@line 1219
  }
 case 5:
  {
   HEAP32[$AsyncCtx107 >> 2] = 38; //@line 1223
   sp = STACKTOP; //@line 1224
   return 0; //@line 1225
  }
 case 7:
  {
   HEAP32[$AsyncCtx55 >> 2] = 39; //@line 1229
   sp = STACKTOP; //@line 1230
   return 0; //@line 1231
  }
 case 9:
  {
   HEAP32[$AsyncCtx104 >> 2] = 40; //@line 1235
   sp = STACKTOP; //@line 1236
   return 0; //@line 1237
  }
 case 11:
  {
   HEAP32[$AsyncCtx51 >> 2] = 41; //@line 1241
   sp = STACKTOP; //@line 1242
   return 0; //@line 1243
  }
 case 13:
  {
   HEAP32[$AsyncCtx101 >> 2] = 42; //@line 1247
   sp = STACKTOP; //@line 1248
   return 0; //@line 1249
  }
 case 15:
  {
   HEAP32[$AsyncCtx47 >> 2] = 43; //@line 1253
   sp = STACKTOP; //@line 1254
   return 0; //@line 1255
  }
 case 17:
  {
   HEAP32[$AsyncCtx98 >> 2] = 44; //@line 1259
   sp = STACKTOP; //@line 1260
   return 0; //@line 1261
  }
 case 19:
  {
   HEAP32[$AsyncCtx43 >> 2] = 45; //@line 1265
   sp = STACKTOP; //@line 1266
   return 0; //@line 1267
  }
 case 21:
  {
   HEAP32[$AsyncCtx95 >> 2] = 46; //@line 1271
   sp = STACKTOP; //@line 1272
   return 0; //@line 1273
  }
 case 23:
  {
   HEAP32[$AsyncCtx39 >> 2] = 47; //@line 1277
   sp = STACKTOP; //@line 1278
   return 0; //@line 1279
  }
 case 25:
  {
   HEAP32[$AsyncCtx92 >> 2] = 48; //@line 1283
   sp = STACKTOP; //@line 1284
   return 0; //@line 1285
  }
 case 27:
  {
   HEAP32[$AsyncCtx35 >> 2] = 49; //@line 1289
   sp = STACKTOP; //@line 1290
   return 0; //@line 1291
  }
 case 29:
  {
   HEAP32[$AsyncCtx89 >> 2] = 50; //@line 1295
   sp = STACKTOP; //@line 1296
   return 0; //@line 1297
  }
 case 31:
  {
   HEAP32[$AsyncCtx31 >> 2] = 51; //@line 1301
   sp = STACKTOP; //@line 1302
   return 0; //@line 1303
  }
 case 33:
  {
   HEAP32[$AsyncCtx86 >> 2] = 52; //@line 1307
   sp = STACKTOP; //@line 1308
   return 0; //@line 1309
  }
 case 35:
  {
   HEAP32[$AsyncCtx27 >> 2] = 53; //@line 1313
   sp = STACKTOP; //@line 1314
   return 0; //@line 1315
  }
 case 37:
  {
   HEAP32[$AsyncCtx83 >> 2] = 54; //@line 1319
   sp = STACKTOP; //@line 1320
   return 0; //@line 1321
  }
 case 39:
  {
   HEAP32[$AsyncCtx23 >> 2] = 55; //@line 1325
   sp = STACKTOP; //@line 1326
   return 0; //@line 1327
  }
 case 41:
  {
   HEAP32[$AsyncCtx80 >> 2] = 56; //@line 1331
   sp = STACKTOP; //@line 1332
   return 0; //@line 1333
  }
 case 43:
  {
   HEAP32[$AsyncCtx19 >> 2] = 57; //@line 1337
   sp = STACKTOP; //@line 1338
   return 0; //@line 1339
  }
 case 45:
  {
   HEAP32[$AsyncCtx77 >> 2] = 58; //@line 1343
   sp = STACKTOP; //@line 1344
   return 0; //@line 1345
  }
 case 47:
  {
   HEAP32[$AsyncCtx15 >> 2] = 59; //@line 1349
   sp = STACKTOP; //@line 1350
   return 0; //@line 1351
  }
 case 49:
  {
   HEAP32[$AsyncCtx74 >> 2] = 60; //@line 1355
   sp = STACKTOP; //@line 1356
   return 0; //@line 1357
  }
 case 51:
  {
   HEAP32[$AsyncCtx11 >> 2] = 61; //@line 1361
   sp = STACKTOP; //@line 1362
   return 0; //@line 1363
  }
 case 53:
  {
   HEAP32[$AsyncCtx71 >> 2] = 62; //@line 1367
   sp = STACKTOP; //@line 1368
   return 0; //@line 1369
  }
 case 55:
  {
   HEAP32[$AsyncCtx7 >> 2] = 63; //@line 1373
   sp = STACKTOP; //@line 1374
   return 0; //@line 1375
  }
 case 57:
  {
   HEAP32[$AsyncCtx68 >> 2] = 64; //@line 1379
   sp = STACKTOP; //@line 1380
   return 0; //@line 1381
  }
 case 59:
  {
   HEAP32[$AsyncCtx3 >> 2] = 65; //@line 1385
   sp = STACKTOP; //@line 1386
   return 0; //@line 1387
  }
 case 61:
  {
   HEAP32[$AsyncCtx65 >> 2] = 66; //@line 1391
   sp = STACKTOP; //@line 1392
   return 0; //@line 1393
  }
 case 63:
  {
   HEAP32[$AsyncCtx >> 2] = 67; //@line 1397
   sp = STACKTOP; //@line 1398
   return 0; //@line 1399
  }
 case 65:
  {
   HEAP32[$AsyncCtx62 >> 2] = 68; //@line 1403
   sp = STACKTOP; //@line 1404
   return 0; //@line 1405
  }
 }
 return 0; //@line 1409
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5954
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 5960
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 5969
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 5974
      $19 = $1 + 44 | 0; //@line 5975
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 5984
      $26 = $1 + 52 | 0; //@line 5985
      $27 = $1 + 53 | 0; //@line 5986
      $28 = $1 + 54 | 0; //@line 5987
      $29 = $0 + 8 | 0; //@line 5988
      $30 = $1 + 24 | 0; //@line 5989
      $$081$off0 = 0; //@line 5990
      $$084 = $0 + 16 | 0; //@line 5990
      $$085$off0 = 0; //@line 5990
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 5994
        label = 20; //@line 5995
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 5998
       HEAP8[$27 >> 0] = 0; //@line 5999
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 6000
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 6001
       if (___async) {
        label = 12; //@line 6004
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 6007
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 6011
        label = 20; //@line 6012
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 6019
         $$186$off0 = $$085$off0; //@line 6019
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 6028
           label = 20; //@line 6029
           break L10;
          } else {
           $$182$off0 = 1; //@line 6032
           $$186$off0 = $$085$off0; //@line 6032
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 6039
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 6046
          break L10;
         } else {
          $$182$off0 = 1; //@line 6049
          $$186$off0 = 1; //@line 6049
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 6054
       $$084 = $$084 + 8 | 0; //@line 6054
       $$085$off0 = $$186$off0; //@line 6054
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 86; //@line 6057
       HEAP32[$AsyncCtx15 + 4 >> 2] = $26; //@line 6059
       HEAP32[$AsyncCtx15 + 8 >> 2] = $30; //@line 6061
       HEAP32[$AsyncCtx15 + 12 >> 2] = $29; //@line 6063
       HEAP32[$AsyncCtx15 + 16 >> 2] = $25; //@line 6065
       HEAP32[$AsyncCtx15 + 20 >> 2] = $27; //@line 6067
       HEAP32[$AsyncCtx15 + 24 >> 2] = $1; //@line 6069
       HEAP32[$AsyncCtx15 + 28 >> 2] = $2; //@line 6071
       HEAP8[$AsyncCtx15 + 32 >> 0] = $4 & 1; //@line 6074
       HEAP32[$AsyncCtx15 + 36 >> 2] = $28; //@line 6076
       HEAP32[$AsyncCtx15 + 40 >> 2] = $19; //@line 6078
       HEAP8[$AsyncCtx15 + 44 >> 0] = $$081$off0 & 1; //@line 6081
       HEAP8[$AsyncCtx15 + 45 >> 0] = $$085$off0 & 1; //@line 6084
       HEAP32[$AsyncCtx15 + 48 >> 2] = $$084; //@line 6086
       HEAP32[$AsyncCtx15 + 52 >> 2] = $13; //@line 6088
       sp = STACKTOP; //@line 6089
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 6095
         $61 = $1 + 40 | 0; //@line 6096
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 6099
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 6107
           if ($$283$off0) {
            label = 25; //@line 6109
            break;
           } else {
            $69 = 4; //@line 6112
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 6119
        } else {
         $69 = 4; //@line 6121
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 6126
      }
      HEAP32[$19 >> 2] = $69; //@line 6128
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 6137
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 6142
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 6143
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 6144
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 6145
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 87; //@line 6148
    HEAP32[$AsyncCtx11 + 4 >> 2] = $1; //@line 6150
    HEAP32[$AsyncCtx11 + 8 >> 2] = $2; //@line 6152
    HEAP32[$AsyncCtx11 + 12 >> 2] = $3; //@line 6154
    HEAP8[$AsyncCtx11 + 16 >> 0] = $4 & 1; //@line 6157
    HEAP32[$AsyncCtx11 + 20 >> 2] = $73; //@line 6159
    HEAP32[$AsyncCtx11 + 24 >> 2] = $0; //@line 6161
    HEAP32[$AsyncCtx11 + 28 >> 2] = $72; //@line 6163
    sp = STACKTOP; //@line 6164
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 6167
   $81 = $0 + 24 | 0; //@line 6168
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 6172
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 6176
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 6183
       $$2 = $81; //@line 6184
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 6196
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 6197
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 6202
        $136 = $$2 + 8 | 0; //@line 6203
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 6206
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 90; //@line 6211
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 6213
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 6215
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 6217
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 6219
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 6221
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 6223
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 6225
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 6228
       sp = STACKTOP; //@line 6229
       return;
      }
      $104 = $1 + 24 | 0; //@line 6232
      $105 = $1 + 54 | 0; //@line 6233
      $$1 = $81; //@line 6234
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 6250
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 6251
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6256
       $122 = $$1 + 8 | 0; //@line 6257
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 6260
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 89; //@line 6265
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 6267
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 6269
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 6271
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 6273
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 6275
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 6277
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 6279
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 6281
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 6284
      sp = STACKTOP; //@line 6285
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 6289
    $$0 = $81; //@line 6290
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 6297
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 6298
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 6303
     $100 = $$0 + 8 | 0; //@line 6304
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 6307
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 88; //@line 6312
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 6314
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 6316
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 6318
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 6320
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 6322
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 6324
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 6327
    sp = STACKTOP; //@line 6328
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
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_6($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7260
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7262
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7264
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7266
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7268
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7270
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 7272
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 7274
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 7277
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 7279
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 7281
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 7284
 $24 = HEAP8[$0 + 45 >> 0] & 1; //@line 7287
 $26 = HEAP32[$0 + 48 >> 2] | 0; //@line 7289
 $28 = HEAP32[$0 + 52 >> 2] | 0; //@line 7291
 L2 : do {
  if (!(HEAP8[$18 >> 0] | 0)) {
   do {
    if (!(HEAP8[$10 >> 0] | 0)) {
     $$182$off0 = $22; //@line 7300
     $$186$off0 = $24; //@line 7300
    } else {
     if (!(HEAP8[$2 >> 0] | 0)) {
      if (!(HEAP32[$6 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $24; //@line 7309
       $$283$off0 = 1; //@line 7309
       label = 13; //@line 7310
       break L2;
      } else {
       $$182$off0 = 1; //@line 7313
       $$186$off0 = $24; //@line 7313
       break;
      }
     }
     if ((HEAP32[$4 >> 2] | 0) == 1) {
      label = 18; //@line 7320
      break L2;
     }
     if (!(HEAP32[$6 >> 2] & 2)) {
      label = 18; //@line 7327
      break L2;
     } else {
      $$182$off0 = 1; //@line 7330
      $$186$off0 = 1; //@line 7330
     }
    }
   } while (0);
   $30 = $26 + 8 | 0; //@line 7334
   if ($30 >>> 0 < $8 >>> 0) {
    HEAP8[$2 >> 0] = 0; //@line 7337
    HEAP8[$10 >> 0] = 0; //@line 7338
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 7339
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $12, $14, $14, 1, $16); //@line 7340
    if (!___async) {
     ___async_unwind = 0; //@line 7343
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 86; //@line 7345
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 7347
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 7349
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 7351
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 7353
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 7355
    HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $12; //@line 7357
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 7359
    HEAP8[$ReallocAsyncCtx5 + 32 >> 0] = $16 & 1; //@line 7362
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $18; //@line 7364
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $20; //@line 7366
    HEAP8[$ReallocAsyncCtx5 + 44 >> 0] = $$182$off0 & 1; //@line 7369
    HEAP8[$ReallocAsyncCtx5 + 45 >> 0] = $$186$off0 & 1; //@line 7372
    HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $30; //@line 7374
    HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $28; //@line 7376
    sp = STACKTOP; //@line 7377
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 7380
    $$283$off0 = $$182$off0; //@line 7380
    label = 13; //@line 7381
   }
  } else {
   $$085$off0$reg2mem$0 = $24; //@line 7384
   $$283$off0 = $22; //@line 7384
   label = 13; //@line 7385
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$28 >> 2] = $14; //@line 7391
    $59 = $12 + 40 | 0; //@line 7392
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 7395
    if ((HEAP32[$12 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$4 >> 2] | 0) == 2) {
      HEAP8[$18 >> 0] = 1; //@line 7403
      if ($$283$off0) {
       label = 18; //@line 7405
       break;
      } else {
       $67 = 4; //@line 7408
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 7415
   } else {
    $67 = 4; //@line 7417
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 7422
 }
 HEAP32[$20 >> 2] = $67; //@line 7424
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_5($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 7104
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7106
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7108
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7110
 $8 = HEAP8[$0 + 16 >> 0] & 1; //@line 7113
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7115
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 7117
 $15 = $12 + 24 | 0; //@line 7120
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$12 + 8 >> 2] | 0; //@line 7125
   if (!($18 & 2)) {
    $21 = $2 + 36 | 0; //@line 7129
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $2 + 54 | 0; //@line 7136
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 7147
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 7148
      if (!___async) {
       ___async_unwind = 0; //@line 7151
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 90; //@line 7153
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 7155
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $10; //@line 7157
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 7159
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 7161
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $2; //@line 7163
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $4; //@line 7165
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $6; //@line 7167
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $8 & 1; //@line 7170
      sp = STACKTOP; //@line 7171
      return;
     }
     $36 = $2 + 24 | 0; //@line 7174
     $37 = $2 + 54 | 0; //@line 7175
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 7190
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 7191
     if (!___async) {
      ___async_unwind = 0; //@line 7194
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 89; //@line 7196
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 7198
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $10; //@line 7200
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 7202
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 7204
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 7206
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $2; //@line 7208
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $4; //@line 7210
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $6; //@line 7212
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $8 & 1; //@line 7215
     sp = STACKTOP; //@line 7216
     return;
    }
   }
   $24 = $2 + 54 | 0; //@line 7220
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 7224
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $4, $6, $8); //@line 7225
    if (!___async) {
     ___async_unwind = 0; //@line 7228
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 88; //@line 7230
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 7232
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $10; //@line 7234
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 7236
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $2; //@line 7238
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $4; //@line 7240
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $6; //@line 7242
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $8 & 1; //@line 7245
    sp = STACKTOP; //@line 7246
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
 sp = STACKTOP; //@line 5792
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 5797
 } else {
  $9 = $1 + 52 | 0; //@line 5799
  $10 = HEAP8[$9 >> 0] | 0; //@line 5800
  $11 = $1 + 53 | 0; //@line 5801
  $12 = HEAP8[$11 >> 0] | 0; //@line 5802
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 5805
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 5806
  HEAP8[$9 >> 0] = 0; //@line 5807
  HEAP8[$11 >> 0] = 0; //@line 5808
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 5809
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 5810
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 84; //@line 5813
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 5815
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 5817
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 5819
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 5821
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 5823
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 5825
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 5827
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 5829
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 5831
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 5833
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 5836
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 5838
   sp = STACKTOP; //@line 5839
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5842
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 5847
    $32 = $0 + 8 | 0; //@line 5848
    $33 = $1 + 54 | 0; //@line 5849
    $$0 = $0 + 24 | 0; //@line 5850
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
     HEAP8[$9 >> 0] = 0; //@line 5883
     HEAP8[$11 >> 0] = 0; //@line 5884
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 5885
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 5886
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 5891
     $62 = $$0 + 8 | 0; //@line 5892
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 5895
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 85; //@line 5900
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 5902
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 5904
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 5906
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 5908
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 5910
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 5912
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 5914
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 5916
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 5918
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 5920
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 5922
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 5924
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 5926
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 5929
    sp = STACKTOP; //@line 5930
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 5934
  HEAP8[$11 >> 0] = $12; //@line 5935
 }
 return;
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
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 306
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 308
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
 sp = STACKTOP; //@line 5425
 STACKTOP = STACKTOP + 64 | 0; //@line 5426
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 5426
 $4 = sp; //@line 5427
 $5 = HEAP32[$0 >> 2] | 0; //@line 5428
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 5431
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 5433
 HEAP32[$4 >> 2] = $2; //@line 5434
 HEAP32[$4 + 4 >> 2] = $0; //@line 5436
 HEAP32[$4 + 8 >> 2] = $1; //@line 5438
 HEAP32[$4 + 12 >> 2] = $3; //@line 5440
 $14 = $4 + 16 | 0; //@line 5441
 $15 = $4 + 20 | 0; //@line 5442
 $16 = $4 + 24 | 0; //@line 5443
 $17 = $4 + 28 | 0; //@line 5444
 $18 = $4 + 32 | 0; //@line 5445
 $19 = $4 + 40 | 0; //@line 5446
 dest = $14; //@line 5447
 stop = dest + 36 | 0; //@line 5447
 do {
  HEAP32[dest >> 2] = 0; //@line 5447
  dest = dest + 4 | 0; //@line 5447
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 5447
 HEAP8[$14 + 38 >> 0] = 0; //@line 5447
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 5452
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 5455
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 5456
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 5457
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 78; //@line 5460
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 5462
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 5464
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 5466
    sp = STACKTOP; //@line 5467
    STACKTOP = sp; //@line 5468
    return 0; //@line 5468
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5470
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 5474
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 5478
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 5481
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 5482
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 5483
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 79; //@line 5486
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 5488
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 5490
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 5492
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 5494
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 5496
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 5498
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 5500
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 5502
    sp = STACKTOP; //@line 5503
    STACKTOP = sp; //@line 5504
    return 0; //@line 5504
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5506
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 5520
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 5528
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 5544
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 5549
  }
 } while (0);
 STACKTOP = sp; //@line 5552
 return $$0 | 0; //@line 5552
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 4806
 do {
  if (!$0) {
   do {
    if (!(HEAP32[73] | 0)) {
     $34 = 0; //@line 4814
    } else {
     $12 = HEAP32[73] | 0; //@line 4816
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 4817
     $13 = _fflush($12) | 0; //@line 4818
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 71; //@line 4821
      sp = STACKTOP; //@line 4822
      return 0; //@line 4823
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 4825
      $34 = $13; //@line 4826
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 4832
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 4836
    } else {
     $$02327 = $$02325; //@line 4838
     $$02426 = $34; //@line 4838
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 4845
      } else {
       $28 = 0; //@line 4847
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 4855
       $25 = ___fflush_unlocked($$02327) | 0; //@line 4856
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 4861
       $$1 = $25 | $$02426; //@line 4863
      } else {
       $$1 = $$02426; //@line 4865
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 4869
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 4872
      if (!$$023) {
       $$024$lcssa = $$1; //@line 4875
       break L9;
      } else {
       $$02327 = $$023; //@line 4878
       $$02426 = $$1; //@line 4878
      }
     }
     HEAP32[$AsyncCtx >> 2] = 72; //@line 4881
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 4883
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 4885
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 4887
     sp = STACKTOP; //@line 4888
     return 0; //@line 4889
    }
   } while (0);
   ___ofl_unlock(); //@line 4892
   $$0 = $$024$lcssa; //@line 4893
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 4899
    $5 = ___fflush_unlocked($0) | 0; //@line 4900
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 69; //@line 4903
     sp = STACKTOP; //@line 4904
     return 0; //@line 4905
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 4907
     $$0 = $5; //@line 4908
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 4913
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 4914
   $7 = ___fflush_unlocked($0) | 0; //@line 4915
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 70; //@line 4918
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 4921
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 4923
    sp = STACKTOP; //@line 4924
    return 0; //@line 4925
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4927
   if ($phitmp) {
    $$0 = $7; //@line 4929
   } else {
    ___unlockfile($0); //@line 4931
    $$0 = $7; //@line 4932
   }
  }
 } while (0);
 return $$0 | 0; //@line 4936
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5607
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 5613
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 5619
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 5622
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5623
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 5624
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 82; //@line 5627
     sp = STACKTOP; //@line 5628
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5631
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 5639
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 5644
     $19 = $1 + 44 | 0; //@line 5645
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 5651
     HEAP8[$22 >> 0] = 0; //@line 5652
     $23 = $1 + 53 | 0; //@line 5653
     HEAP8[$23 >> 0] = 0; //@line 5654
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 5656
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 5659
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 5660
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 5661
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 81; //@line 5664
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 5666
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 5668
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 5670
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 5672
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 5674
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 5676
      sp = STACKTOP; //@line 5677
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 5680
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 5684
      label = 13; //@line 5685
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 5690
       label = 13; //@line 5691
      } else {
       $$037$off039 = 3; //@line 5693
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 5697
      $39 = $1 + 40 | 0; //@line 5698
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 5701
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 5711
        $$037$off039 = $$037$off038; //@line 5712
       } else {
        $$037$off039 = $$037$off038; //@line 5714
       }
      } else {
       $$037$off039 = $$037$off038; //@line 5717
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 5720
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 5727
   }
  }
 } while (0);
 return;
}
function __ZN4mbed6BusOut5writeEi__async_cb($0) {
 $0 = $0 | 0;
 var $104 = 0, $13 = 0, $19 = 0, $2 = 0, $25 = 0, $31 = 0, $37 = 0, $4 = 0, $43 = 0, $49 = 0, $55 = 0, $6 = 0, $61 = 0, $67 = 0, $73 = 0, $79 = 0, $8 = 0, $85 = 0, $91 = 0, $97 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 7458
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7460
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7462
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7464
 $8 = HEAP32[$4 + 4 >> 2] | 0; //@line 7466
 if ($8 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$8 >> 2] | 0, $2 & 1 | 0) | 0; //@line 7471
 }
 $13 = HEAP32[$4 + 8 >> 2] | 0; //@line 7474
 if ($13 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$13 >> 2] | 0, $2 >>> 1 & 1 | 0) | 0; //@line 7480
 }
 $19 = HEAP32[$4 + 12 >> 2] | 0; //@line 7483
 if ($19 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$19 >> 2] | 0, $2 >>> 2 & 1 | 0) | 0; //@line 7489
 }
 $25 = HEAP32[$4 + 16 >> 2] | 0; //@line 7492
 if ($25 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$25 >> 2] | 0, $2 >>> 3 & 1 | 0) | 0; //@line 7498
 }
 $31 = HEAP32[$4 + 20 >> 2] | 0; //@line 7501
 if ($31 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$31 >> 2] | 0, $2 >>> 4 & 1 | 0) | 0; //@line 7507
 }
 $37 = HEAP32[$4 + 24 >> 2] | 0; //@line 7510
 if ($37 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$37 >> 2] | 0, $2 >>> 5 & 1 | 0) | 0; //@line 7516
 }
 $43 = HEAP32[$4 + 28 >> 2] | 0; //@line 7519
 if ($43 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$43 >> 2] | 0, $2 >>> 6 & 1 | 0) | 0; //@line 7525
 }
 $49 = HEAP32[$4 + 32 >> 2] | 0; //@line 7528
 if ($49 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$49 >> 2] | 0, $2 >>> 7 & 1 | 0) | 0; //@line 7534
 }
 $55 = HEAP32[$4 + 36 >> 2] | 0; //@line 7537
 if ($55 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$55 >> 2] | 0, $2 >>> 8 & 1 | 0) | 0; //@line 7543
 }
 $61 = HEAP32[$4 + 40 >> 2] | 0; //@line 7546
 if ($61 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$61 >> 2] | 0, $2 >>> 9 & 1 | 0) | 0; //@line 7552
 }
 $67 = HEAP32[$4 + 44 >> 2] | 0; //@line 7555
 if ($67 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$67 >> 2] | 0, $2 >>> 10 & 1 | 0) | 0; //@line 7561
 }
 $73 = HEAP32[$4 + 48 >> 2] | 0; //@line 7564
 if ($73 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$73 >> 2] | 0, $2 >>> 11 & 1 | 0) | 0; //@line 7570
 }
 $79 = HEAP32[$4 + 52 >> 2] | 0; //@line 7573
 if ($79 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$79 >> 2] | 0, $2 >>> 12 & 1 | 0) | 0; //@line 7579
 }
 $85 = HEAP32[$4 + 56 >> 2] | 0; //@line 7582
 if ($85 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$85 >> 2] | 0, $2 >>> 13 & 1 | 0) | 0; //@line 7588
 }
 $91 = HEAP32[$4 + 60 >> 2] | 0; //@line 7591
 if ($91 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$91 >> 2] | 0, $2 >>> 14 & 1 | 0) | 0; //@line 7597
 }
 $97 = HEAP32[$4 + 64 >> 2] | 0; //@line 7600
 if ($97 | 0) {
  _emscripten_asm_const_iii(0, HEAP32[$97 >> 2] | 0, $2 >>> 15 & 1 | 0) | 0; //@line 7606
 }
 $104 = HEAP32[(HEAP32[$6 >> 2] | 0) + 12 >> 2] | 0; //@line 7610
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 7611
 FUNCTION_TABLE_vi[$104 & 127]($4); //@line 7612
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 13; //@line 7615
  sp = STACKTOP; //@line 7616
  return;
 }
 ___async_unwind = 0; //@line 7619
 HEAP32[$ReallocAsyncCtx2 >> 2] = 13; //@line 7620
 sp = STACKTOP; //@line 7621
 return;
}
function __ZN4mbed6BusOutC2E7PinNameS1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1___async_cb($0) {
 $0 = $0 | 0;
 var $$02932$reg2mem$0 = 0, $$pre = 0, $10 = 0, $12 = 0, $14 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6801
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6803
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6805
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6807
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6809
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6811
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6813
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6815
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6817
 HEAP32[$AsyncRetVal >> 2] = 0; //@line 6818
 HEAP32[$AsyncRetVal + 4 >> 2] = 0; //@line 6818
 HEAP32[$AsyncRetVal + 8 >> 2] = 0; //@line 6818
 HEAP32[$AsyncRetVal + 12 >> 2] = 0; //@line 6818
 HEAP32[$AsyncRetVal + 16 >> 2] = 0; //@line 6818
 HEAP32[$AsyncRetVal + 20 >> 2] = 0; //@line 6818
 _gpio_init_out($AsyncRetVal, $2); //@line 6819
 HEAP32[$4 + 4 + ($6 << 2) >> 2] = $AsyncRetVal; //@line 6821
 HEAP32[$8 >> 2] = HEAP32[$8 >> 2] | 1 << $6; //@line 6825
 $$02932$reg2mem$0 = $6; //@line 6826
 while (1) {
  $18 = $$02932$reg2mem$0 + 1 | 0; //@line 6828
  if (($$02932$reg2mem$0 | 0) >= 15) {
   label = 2; //@line 6831
   break;
  }
  $$pre = HEAP32[$10 + ($18 << 2) >> 2] | 0; //@line 6835
  if (($$pre | 0) != -1) {
   break;
  }
  HEAP32[$4 + 4 + ($18 << 2) >> 2] = 0; //@line 6841
  $$02932$reg2mem$0 = $18; //@line 6842
 }
 if ((label | 0) == 2) {
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(32) | 0; //@line 6847
 $19 = __Znwj(24) | 0; //@line 6848
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 11; //@line 6851
  $20 = $ReallocAsyncCtx + 4 | 0; //@line 6852
  HEAP32[$20 >> 2] = $$pre; //@line 6853
  $21 = $ReallocAsyncCtx + 8 | 0; //@line 6854
  HEAP32[$21 >> 2] = $4; //@line 6855
  $22 = $ReallocAsyncCtx + 12 | 0; //@line 6856
  HEAP32[$22 >> 2] = $18; //@line 6857
  $23 = $ReallocAsyncCtx + 16 | 0; //@line 6858
  HEAP32[$23 >> 2] = $8; //@line 6859
  $24 = $ReallocAsyncCtx + 20 | 0; //@line 6860
  HEAP32[$24 >> 2] = $10; //@line 6861
  $25 = $ReallocAsyncCtx + 24 | 0; //@line 6862
  HEAP32[$25 >> 2] = $12; //@line 6863
  $26 = $ReallocAsyncCtx + 28 | 0; //@line 6864
  HEAP32[$26 >> 2] = $14; //@line 6865
  sp = STACKTOP; //@line 6866
  return;
 }
 HEAP32[___async_retval >> 2] = $19; //@line 6870
 ___async_unwind = 0; //@line 6871
 HEAP32[$ReallocAsyncCtx >> 2] = 11; //@line 6872
 $20 = $ReallocAsyncCtx + 4 | 0; //@line 6873
 HEAP32[$20 >> 2] = $$pre; //@line 6874
 $21 = $ReallocAsyncCtx + 8 | 0; //@line 6875
 HEAP32[$21 >> 2] = $4; //@line 6876
 $22 = $ReallocAsyncCtx + 12 | 0; //@line 6877
 HEAP32[$22 >> 2] = $18; //@line 6878
 $23 = $ReallocAsyncCtx + 16 | 0; //@line 6879
 HEAP32[$23 >> 2] = $8; //@line 6880
 $24 = $ReallocAsyncCtx + 20 | 0; //@line 6881
 HEAP32[$24 >> 2] = $10; //@line 6882
 $25 = $ReallocAsyncCtx + 24 | 0; //@line 6883
 HEAP32[$25 >> 2] = $12; //@line 6884
 $26 = $ReallocAsyncCtx + 28 | 0; //@line 6885
 HEAP32[$26 >> 2] = $14; //@line 6886
 sp = STACKTOP; //@line 6887
 return;
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4579
 STACKTOP = STACKTOP + 48 | 0; //@line 4580
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 4580
 $vararg_buffer3 = sp + 16 | 0; //@line 4581
 $vararg_buffer = sp; //@line 4582
 $3 = sp + 32 | 0; //@line 4583
 $4 = $0 + 28 | 0; //@line 4584
 $5 = HEAP32[$4 >> 2] | 0; //@line 4585
 HEAP32[$3 >> 2] = $5; //@line 4586
 $7 = $0 + 20 | 0; //@line 4588
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 4590
 HEAP32[$3 + 4 >> 2] = $9; //@line 4591
 HEAP32[$3 + 8 >> 2] = $1; //@line 4593
 HEAP32[$3 + 12 >> 2] = $2; //@line 4595
 $12 = $9 + $2 | 0; //@line 4596
 $13 = $0 + 60 | 0; //@line 4597
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 4600
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 4602
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 4604
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 4606
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 4610
  } else {
   $$04756 = 2; //@line 4612
   $$04855 = $12; //@line 4612
   $$04954 = $3; //@line 4612
   $27 = $17; //@line 4612
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 4618
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 4620
    $38 = $27 >>> 0 > $37 >>> 0; //@line 4621
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 4623
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 4625
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 4627
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 4630
    $44 = $$150 + 4 | 0; //@line 4631
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 4634
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 4637
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 4639
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 4641
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 4643
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 4646
     break L1;
    } else {
     $$04756 = $$1; //@line 4649
     $$04954 = $$150; //@line 4649
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 4653
   HEAP32[$4 >> 2] = 0; //@line 4654
   HEAP32[$7 >> 2] = 0; //@line 4655
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 4658
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 4661
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 4666
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 4672
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 4677
  $25 = $20; //@line 4678
  HEAP32[$4 >> 2] = $25; //@line 4679
  HEAP32[$7 >> 2] = $25; //@line 4680
  $$051 = $2; //@line 4681
 }
 STACKTOP = sp; //@line 4683
 return $$051 | 0; //@line 4683
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
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_40($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8293
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8297
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8299
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 8301
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8303
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 8305
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8307
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8309
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 8311
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 8313
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 8316
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 8318
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 8322
   $27 = $6 + 24 | 0; //@line 8323
   $28 = $4 + 8 | 0; //@line 8324
   $29 = $6 + 54 | 0; //@line 8325
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
    HEAP8[$10 >> 0] = 0; //@line 8355
    HEAP8[$14 >> 0] = 0; //@line 8356
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 8357
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 8358
    if (!___async) {
     ___async_unwind = 0; //@line 8361
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 85; //@line 8363
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 8365
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 8367
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 8369
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 8371
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 8373
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 8375
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 8377
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 8379
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 8381
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 8383
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 8385
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 8387
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 8389
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 8392
    sp = STACKTOP; //@line 8393
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 8398
 HEAP8[$14 >> 0] = $12; //@line 8399
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8177
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8181
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8183
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 8185
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8187
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 8189
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8191
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8193
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 8195
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 8197
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 8199
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 8201
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 8203
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 8206
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 8207
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
    HEAP8[$10 >> 0] = 0; //@line 8240
    HEAP8[$14 >> 0] = 0; //@line 8241
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 8242
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 8243
    if (!___async) {
     ___async_unwind = 0; //@line 8246
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 85; //@line 8248
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 8250
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 8252
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 8254
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 8256
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 8258
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 8260
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 8262
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 8264
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 8266
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 8268
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 8270
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 8272
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 8274
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 8277
    sp = STACKTOP; //@line 8278
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 8283
 HEAP8[$14 >> 0] = $12; //@line 8284
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 9287
 }
 ret = dest | 0; //@line 9290
 dest_end = dest + num | 0; //@line 9291
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 9295
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 9296
   dest = dest + 1 | 0; //@line 9297
   src = src + 1 | 0; //@line 9298
   num = num - 1 | 0; //@line 9299
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 9301
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 9302
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 9304
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 9305
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 9306
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 9307
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 9308
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 9309
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 9310
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 9311
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 9312
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 9313
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 9314
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 9315
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 9316
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 9317
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 9318
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 9319
   dest = dest + 64 | 0; //@line 9320
   src = src + 64 | 0; //@line 9321
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 9324
   dest = dest + 4 | 0; //@line 9325
   src = src + 4 | 0; //@line 9326
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 9330
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 9332
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 9333
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 9334
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 9335
   dest = dest + 4 | 0; //@line 9336
   src = src + 4 | 0; //@line 9337
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 9342
  dest = dest + 1 | 0; //@line 9343
  src = src + 1 | 0; //@line 9344
 }
 return ret | 0; //@line 9346
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 5108
 STACKTOP = STACKTOP + 64 | 0; //@line 5109
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 5109
 $3 = sp; //@line 5110
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 5113
 } else {
  if (!$1) {
   $$2 = 0; //@line 5117
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 5119
   $6 = ___dynamic_cast($1, 56, 40, 0) | 0; //@line 5120
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 76; //@line 5123
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 5125
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 5127
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 5129
    sp = STACKTOP; //@line 5130
    STACKTOP = sp; //@line 5131
    return 0; //@line 5131
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5133
   if (!$6) {
    $$2 = 0; //@line 5136
   } else {
    dest = $3 + 4 | 0; //@line 5139
    stop = dest + 52 | 0; //@line 5139
    do {
     HEAP32[dest >> 2] = 0; //@line 5139
     dest = dest + 4 | 0; //@line 5139
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 5140
    HEAP32[$3 + 8 >> 2] = $0; //@line 5142
    HEAP32[$3 + 12 >> 2] = -1; //@line 5144
    HEAP32[$3 + 48 >> 2] = 1; //@line 5146
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 5149
    $18 = HEAP32[$2 >> 2] | 0; //@line 5150
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 5151
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 5152
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 77; //@line 5155
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 5157
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 5159
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 5161
     sp = STACKTOP; //@line 5162
     STACKTOP = sp; //@line 5163
     return 0; //@line 5163
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5165
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 5172
     $$0 = 1; //@line 5173
    } else {
     $$0 = 0; //@line 5175
    }
    $$2 = $$0; //@line 5177
   }
  }
 }
 STACKTOP = sp; //@line 5181
 return $$2 | 0; //@line 5181
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 6342
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 6348
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 6352
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 6353
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 6354
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 6355
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 91; //@line 6358
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 6360
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 6362
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 6364
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 6366
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 6368
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 6370
    sp = STACKTOP; //@line 6371
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6374
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 6378
    $$0 = $0 + 24 | 0; //@line 6379
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 6381
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 6382
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 6387
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 6393
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 6396
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 92; //@line 6401
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 6403
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 6405
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 6407
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 6409
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 6411
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 6413
    sp = STACKTOP; //@line 6414
    return;
   }
  }
 } while (0);
 return;
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4942
 $1 = $0 + 20 | 0; //@line 4943
 $3 = $0 + 28 | 0; //@line 4945
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 4951
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 4952
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 4953
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 73; //@line 4956
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 4958
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 4960
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 4962
    sp = STACKTOP; //@line 4963
    return 0; //@line 4964
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 4966
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 4970
     break;
    } else {
     label = 5; //@line 4973
     break;
    }
   }
  } else {
   label = 5; //@line 4978
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 4982
  $14 = HEAP32[$13 >> 2] | 0; //@line 4983
  $15 = $0 + 8 | 0; //@line 4984
  $16 = HEAP32[$15 >> 2] | 0; //@line 4985
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 4993
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 4994
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 4995
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 74; //@line 4998
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 5000
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 5002
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 5004
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 5006
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 5008
     sp = STACKTOP; //@line 5009
     return 0; //@line 5010
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5012
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 5018
  HEAP32[$3 >> 2] = 0; //@line 5019
  HEAP32[$1 >> 2] = 0; //@line 5020
  HEAP32[$15 >> 2] = 0; //@line 5021
  HEAP32[$13 >> 2] = 0; //@line 5022
  $$0 = 0; //@line 5023
 }
 return $$0 | 0; //@line 5025
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_3($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6975
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6979
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6981
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6983
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6985
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6987
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6989
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 6991
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 6994
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 6995
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 7011
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 7012
    if (!___async) {
     ___async_unwind = 0; //@line 7015
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 89; //@line 7017
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 7019
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 7021
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 7023
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 7025
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 7027
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 7029
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 7031
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 7033
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 7036
    sp = STACKTOP; //@line 7037
    return;
   }
  }
 } while (0);
 return;
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
function _fflush__async_cb_45($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8649
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8651
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 8653
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 8657
  } else {
   $$02327 = $$02325; //@line 8659
   $$02426 = $AsyncRetVal; //@line 8659
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 8666
    } else {
     $16 = 0; //@line 8668
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 8680
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 8683
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 8686
     break L3;
    } else {
     $$02327 = $$023; //@line 8689
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 8692
   $13 = ___fflush_unlocked($$02327) | 0; //@line 8693
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 8697
    ___async_unwind = 0; //@line 8698
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 72; //@line 8700
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 8702
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 8704
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 8706
   sp = STACKTOP; //@line 8707
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 8711
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 8713
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 9351
 value = value & 255; //@line 9353
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 9356
   ptr = ptr + 1 | 0; //@line 9357
  }
  aligned_end = end & -4 | 0; //@line 9360
  block_aligned_end = aligned_end - 64 | 0; //@line 9361
  value4 = value | value << 8 | value << 16 | value << 24; //@line 9362
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 9365
   HEAP32[ptr + 4 >> 2] = value4; //@line 9366
   HEAP32[ptr + 8 >> 2] = value4; //@line 9367
   HEAP32[ptr + 12 >> 2] = value4; //@line 9368
   HEAP32[ptr + 16 >> 2] = value4; //@line 9369
   HEAP32[ptr + 20 >> 2] = value4; //@line 9370
   HEAP32[ptr + 24 >> 2] = value4; //@line 9371
   HEAP32[ptr + 28 >> 2] = value4; //@line 9372
   HEAP32[ptr + 32 >> 2] = value4; //@line 9373
   HEAP32[ptr + 36 >> 2] = value4; //@line 9374
   HEAP32[ptr + 40 >> 2] = value4; //@line 9375
   HEAP32[ptr + 44 >> 2] = value4; //@line 9376
   HEAP32[ptr + 48 >> 2] = value4; //@line 9377
   HEAP32[ptr + 52 >> 2] = value4; //@line 9378
   HEAP32[ptr + 56 >> 2] = value4; //@line 9379
   HEAP32[ptr + 60 >> 2] = value4; //@line 9380
   ptr = ptr + 64 | 0; //@line 9381
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 9385
   ptr = ptr + 4 | 0; //@line 9386
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 9391
  ptr = ptr + 1 | 0; //@line 9392
 }
 return end - num | 0; //@line 9394
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6912
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6916
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6918
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6920
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6922
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6924
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6926
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 6929
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 6930
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 6939
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 6940
    if (!___async) {
     ___async_unwind = 0; //@line 6943
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 90; //@line 6945
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 6947
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 6949
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 6951
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 6953
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 6955
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 6957
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 6959
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 6962
    sp = STACKTOP; //@line 6963
    return;
   }
  }
 }
 return;
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8550
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 8560
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 8560
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 8560
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 8564
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 8567
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 8570
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 8578
  } else {
   $20 = 0; //@line 8580
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 8590
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 8594
  HEAP32[___async_retval >> 2] = $$1; //@line 8596
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 8599
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 8600
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 8604
  ___async_unwind = 0; //@line 8605
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 72; //@line 8607
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 8609
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 8611
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 8613
 sp = STACKTOP; //@line 8614
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6715
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6717
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6719
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6721
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 6726
  } else {
   $9 = $4 + 4 | 0; //@line 6728
   $10 = HEAP32[$9 >> 2] | 0; //@line 6729
   $11 = $4 + 8 | 0; //@line 6730
   $12 = HEAP32[$11 >> 2] | 0; //@line 6731
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 6735
    HEAP32[$6 >> 2] = 0; //@line 6736
    HEAP32[$2 >> 2] = 0; //@line 6737
    HEAP32[$11 >> 2] = 0; //@line 6738
    HEAP32[$9 >> 2] = 0; //@line 6739
    $$0 = 0; //@line 6740
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 6747
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 6748
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 6749
   if (!___async) {
    ___async_unwind = 0; //@line 6752
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 74; //@line 6754
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 6756
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 6758
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 6760
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 6762
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 6764
   sp = STACKTOP; //@line 6765
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 6770
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_39($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 8126
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8128
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8130
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8132
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8134
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 8139
  return;
 }
 dest = $2 + 4 | 0; //@line 8143
 stop = dest + 52 | 0; //@line 8143
 do {
  HEAP32[dest >> 2] = 0; //@line 8143
  dest = dest + 4 | 0; //@line 8143
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 8144
 HEAP32[$2 + 8 >> 2] = $4; //@line 8146
 HEAP32[$2 + 12 >> 2] = -1; //@line 8148
 HEAP32[$2 + 48 >> 2] = 1; //@line 8150
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 8153
 $16 = HEAP32[$6 >> 2] | 0; //@line 8154
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 8155
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 8156
 if (!___async) {
  ___async_unwind = 0; //@line 8159
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 77; //@line 8161
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 8163
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 8165
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 8167
 sp = STACKTOP; //@line 8168
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_4($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 7048
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7052
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7054
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7056
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7058
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 7060
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 7063
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 7064
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 7070
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 7071
   if (!___async) {
    ___async_unwind = 0; //@line 7074
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 88; //@line 7076
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 7078
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 7080
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 7082
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 7084
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 7086
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 7088
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 7091
   sp = STACKTOP; //@line 7092
   return;
  }
 }
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6622
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6624
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6628
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6630
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6632
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6634
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 6638
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 6641
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 6642
   if (!___async) {
    ___async_unwind = 0; //@line 6645
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 92; //@line 6647
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 6649
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 6651
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 6653
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 6655
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 6657
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 6659
   sp = STACKTOP; //@line 6660
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
 HEAP8[$1 + 53 >> 0] = 1; //@line 5355
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 5362
   $10 = $1 + 16 | 0; //@line 5363
   $11 = HEAP32[$10 >> 2] | 0; //@line 5364
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 5367
    HEAP32[$1 + 24 >> 2] = $4; //@line 5369
    HEAP32[$1 + 36 >> 2] = 1; //@line 5371
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 5381
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 5386
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 5389
    HEAP8[$1 + 54 >> 0] = 1; //@line 5391
    break;
   }
   $21 = $1 + 24 | 0; //@line 5394
   $22 = HEAP32[$21 >> 2] | 0; //@line 5395
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 5398
    $28 = $4; //@line 5399
   } else {
    $28 = $22; //@line 5401
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 5410
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_1($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6670
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6676
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6678
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6680
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6682
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 6687
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 6689
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 6690
 if (!___async) {
  ___async_unwind = 0; //@line 6693
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 92; //@line 6695
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 6697
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 6699
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 6701
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 6703
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 6705
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 6707
 sp = STACKTOP; //@line 6708
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 5214
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 5223
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 5228
      HEAP32[$13 >> 2] = $2; //@line 5229
      $19 = $1 + 40 | 0; //@line 5230
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 5233
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 5243
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 5247
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 5254
    }
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8724
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8726
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8728
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8732
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 8736
  label = 4; //@line 8737
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 8742
   label = 4; //@line 8743
  } else {
   $$037$off039 = 3; //@line 8745
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 8749
  $17 = $8 + 40 | 0; //@line 8750
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 8753
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 8763
    $$037$off039 = $$037$off038; //@line 8764
   } else {
    $$037$off039 = $$037$off038; //@line 8766
   }
  } else {
   $$037$off039 = $$037$off038; //@line 8769
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 8772
 return;
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 854
 $2 = $0 + 12 | 0; //@line 856
 $3 = HEAP32[$2 >> 2] | 0; //@line 857
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 861
   _mbed_assert_internal(588, 593, 528); //@line 862
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 32; //@line 865
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 867
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 869
    sp = STACKTOP; //@line 870
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 873
    $8 = HEAP32[$2 >> 2] | 0; //@line 875
    break;
   }
  } else {
   $8 = $3; //@line 879
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 882
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 884
 FUNCTION_TABLE_vi[$7 & 127]($0); //@line 885
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 33; //@line 888
  sp = STACKTOP; //@line 889
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 892
  return;
 }
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6561
 STACKTOP = STACKTOP + 16 | 0; //@line 6562
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 6562
 $3 = sp; //@line 6563
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 6565
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 6568
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 6569
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 6570
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 96; //@line 6573
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 6575
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 6577
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 6579
  sp = STACKTOP; //@line 6580
  STACKTOP = sp; //@line 6581
  return 0; //@line 6581
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 6583
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 6587
 }
 STACKTOP = sp; //@line 6589
 return $8 & 1 | 0; //@line 6589
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $10 = 0, $13 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5570
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 5576
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 5579
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 5582
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 5583
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 5584
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 80; //@line 5587
    sp = STACKTOP; //@line 5588
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5591
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
 sp = STACKTOP; //@line 6471
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 6473
 $8 = $7 >> 8; //@line 6474
 if (!($7 & 1)) {
  $$0 = $8; //@line 6478
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 6483
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 6485
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 6488
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 6493
 FUNCTION_TABLE_viiiiii[$17 & 3]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 6494
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 94; //@line 6497
  sp = STACKTOP; //@line 6498
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 6501
  return;
 }
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5739
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 5745
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 5748
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 5751
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 5752
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 5753
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 83; //@line 5756
    sp = STACKTOP; //@line 5757
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5760
    break;
   }
  }
 } while (0);
 return;
}
function __Znwj($0) {
 $0 = $0 | 0;
 var $$ = 0, $$lcssa = 0, $2 = 0, $4 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5030
 $$ = ($0 | 0) == 0 ? 1 : $0; //@line 5032
 while (1) {
  $2 = _malloc($$) | 0; //@line 5034
  if ($2 | 0) {
   $$lcssa = $2; //@line 5037
   label = 7; //@line 5038
   break;
  }
  $4 = __ZSt15get_new_handlerv() | 0; //@line 5041
  if (!$4) {
   $$lcssa = 0; //@line 5044
   label = 7; //@line 5045
   break;
  }
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 5048
  FUNCTION_TABLE_v[$4 & 0](); //@line 5049
  if (___async) {
   label = 5; //@line 5052
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 5055
 }
 if ((label | 0) == 5) {
  HEAP32[$AsyncCtx >> 2] = 75; //@line 5058
  HEAP32[$AsyncCtx + 4 >> 2] = $$; //@line 5060
  sp = STACKTOP; //@line 5061
  return 0; //@line 5062
 } else if ((label | 0) == 7) {
  return $$lcssa | 0; //@line 5065
 }
 return 0; //@line 5067
}
function ___dynamic_cast__async_cb_41($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8442
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8444
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8446
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8452
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 8467
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 8483
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 8488
    break;
   }
  default:
   {
    $$0 = 0; //@line 8492
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 8497
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $13 = 0, $16 = 0, $6 = 0, $7 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6513
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 6515
 $7 = $6 >> 8; //@line 6516
 if (!($6 & 1)) {
  $$0 = $7; //@line 6520
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 6525
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 6527
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 6530
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 6535
 FUNCTION_TABLE_viiiii[$16 & 3]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 6536
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 95; //@line 6539
  sp = STACKTOP; //@line 6540
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 6543
  return;
 }
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6428
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 6430
 $6 = $5 >> 8; //@line 6431
 if (!($5 & 1)) {
  $$0 = $6; //@line 6435
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 6440
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 6442
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 6445
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 6450
 FUNCTION_TABLE_viiii[$15 & 3]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 6451
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 93; //@line 6454
  sp = STACKTOP; //@line 6455
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 6458
  return;
 }
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4690
 STACKTOP = STACKTOP + 32 | 0; //@line 4691
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 4691
 $vararg_buffer = sp; //@line 4692
 $3 = sp + 20 | 0; //@line 4693
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 4697
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 4699
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 4701
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 4703
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 4705
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 4710
  $10 = -1; //@line 4711
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 4714
 }
 STACKTOP = sp; //@line 4716
 return $10 | 0; //@line 4716
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
 _mbed_error_printf(465, $vararg_buffer); //@line 506
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
 $4 = $1 + 16 | 0; //@line 5292
 $5 = HEAP32[$4 >> 2] | 0; //@line 5293
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 5297
   HEAP32[$1 + 24 >> 2] = $3; //@line 5299
   HEAP32[$1 + 36 >> 2] = 1; //@line 5301
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 5305
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 5308
    HEAP32[$1 + 24 >> 2] = 2; //@line 5310
    HEAP8[$1 + 54 >> 0] = 1; //@line 5312
    break;
   }
   $10 = $1 + 24 | 0; //@line 5315
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 5319
   }
  }
 } while (0);
 return;
}
function __Znwj__async_cb($0) {
 $0 = $0 | 0;
 var $$lcssa = 0, $2 = 0, $3 = 0, $5 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9196
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9198
 $3 = _malloc($2) | 0; //@line 9199
 if (!$3) {
  $5 = __ZSt15get_new_handlerv() | 0; //@line 9202
  if (!$5) {
   $$lcssa = 0; //@line 9205
  } else {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 9207
   FUNCTION_TABLE_v[$5 & 0](); //@line 9208
   if (!___async) {
    ___async_unwind = 0; //@line 9211
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 75; //@line 9213
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 9215
   sp = STACKTOP; //@line 9216
   return;
  }
 } else {
  $$lcssa = $3; //@line 9220
 }
 HEAP32[___async_retval >> 2] = $$lcssa; //@line 9223
 return;
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4749
 STACKTOP = STACKTOP + 32 | 0; //@line 4750
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 4750
 $vararg_buffer = sp; //@line 4751
 HEAP32[$0 + 36 >> 2] = 4; //@line 4754
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 4762
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 4764
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 4766
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 4771
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 4774
 STACKTOP = sp; //@line 4775
 return $14 | 0; //@line 4775
}
function _mbed_die__async_cb_61($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 9165
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9167
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 9169
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 9170
 _wait_ms(150); //@line 9171
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 17; //@line 9174
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 9175
  HEAP32[$4 >> 2] = $2; //@line 9176
  sp = STACKTOP; //@line 9177
  return;
 }
 ___async_unwind = 0; //@line 9180
 HEAP32[$ReallocAsyncCtx15 >> 2] = 17; //@line 9181
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 9182
 HEAP32[$4 >> 2] = $2; //@line 9183
 sp = STACKTOP; //@line 9184
 return;
}
function _mbed_die__async_cb_60($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 9140
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9142
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 9144
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 9145
 _wait_ms(150); //@line 9146
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 18; //@line 9149
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 9150
  HEAP32[$4 >> 2] = $2; //@line 9151
  sp = STACKTOP; //@line 9152
  return;
 }
 ___async_unwind = 0; //@line 9155
 HEAP32[$ReallocAsyncCtx14 >> 2] = 18; //@line 9156
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 9157
 HEAP32[$4 >> 2] = $2; //@line 9158
 sp = STACKTOP; //@line 9159
 return;
}
function _mbed_die__async_cb_59($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 9115
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9117
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 9119
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 9120
 _wait_ms(150); //@line 9121
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 19; //@line 9124
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 9125
  HEAP32[$4 >> 2] = $2; //@line 9126
  sp = STACKTOP; //@line 9127
  return;
 }
 ___async_unwind = 0; //@line 9130
 HEAP32[$ReallocAsyncCtx13 >> 2] = 19; //@line 9131
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 9132
 HEAP32[$4 >> 2] = $2; //@line 9133
 sp = STACKTOP; //@line 9134
 return;
}
function _mbed_die__async_cb_58($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 9090
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9092
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 9094
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 9095
 _wait_ms(150); //@line 9096
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 20; //@line 9099
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 9100
  HEAP32[$4 >> 2] = $2; //@line 9101
  sp = STACKTOP; //@line 9102
  return;
 }
 ___async_unwind = 0; //@line 9105
 HEAP32[$ReallocAsyncCtx12 >> 2] = 20; //@line 9106
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 9107
 HEAP32[$4 >> 2] = $2; //@line 9108
 sp = STACKTOP; //@line 9109
 return;
}
function _mbed_die__async_cb_57($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 9065
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9067
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 9069
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 9070
 _wait_ms(150); //@line 9071
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 21; //@line 9074
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 9075
  HEAP32[$4 >> 2] = $2; //@line 9076
  sp = STACKTOP; //@line 9077
  return;
 }
 ___async_unwind = 0; //@line 9080
 HEAP32[$ReallocAsyncCtx11 >> 2] = 21; //@line 9081
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 9082
 HEAP32[$4 >> 2] = $2; //@line 9083
 sp = STACKTOP; //@line 9084
 return;
}
function _mbed_die__async_cb_56($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 9040
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9042
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 9044
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 9045
 _wait_ms(150); //@line 9046
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 22; //@line 9049
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 9050
  HEAP32[$4 >> 2] = $2; //@line 9051
  sp = STACKTOP; //@line 9052
  return;
 }
 ___async_unwind = 0; //@line 9055
 HEAP32[$ReallocAsyncCtx10 >> 2] = 22; //@line 9056
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 9057
 HEAP32[$4 >> 2] = $2; //@line 9058
 sp = STACKTOP; //@line 9059
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 8790
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8792
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8794
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 8795
 _wait_ms(150); //@line 8796
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 16; //@line 8799
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 8800
  HEAP32[$4 >> 2] = $2; //@line 8801
  sp = STACKTOP; //@line 8802
  return;
 }
 ___async_unwind = 0; //@line 8805
 HEAP32[$ReallocAsyncCtx16 >> 2] = 16; //@line 8806
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 8807
 HEAP32[$4 >> 2] = $2; //@line 8808
 sp = STACKTOP; //@line 8809
 return;
}
function _mbed_die__async_cb_55($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 9015
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9017
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 9019
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 9020
 _wait_ms(150); //@line 9021
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 23; //@line 9024
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 9025
  HEAP32[$4 >> 2] = $2; //@line 9026
  sp = STACKTOP; //@line 9027
  return;
 }
 ___async_unwind = 0; //@line 9030
 HEAP32[$ReallocAsyncCtx9 >> 2] = 23; //@line 9031
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 9032
 HEAP32[$4 >> 2] = $2; //@line 9033
 sp = STACKTOP; //@line 9034
 return;
}
function _mbed_die__async_cb_54($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 8990
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8992
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8994
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 8995
 _wait_ms(400); //@line 8996
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 24; //@line 8999
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 9000
  HEAP32[$4 >> 2] = $2; //@line 9001
  sp = STACKTOP; //@line 9002
  return;
 }
 ___async_unwind = 0; //@line 9005
 HEAP32[$ReallocAsyncCtx8 >> 2] = 24; //@line 9006
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 9007
 HEAP32[$4 >> 2] = $2; //@line 9008
 sp = STACKTOP; //@line 9009
 return;
}
function _mbed_die__async_cb_53($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 8965
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8967
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8969
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 8970
 _wait_ms(400); //@line 8971
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 25; //@line 8974
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 8975
  HEAP32[$4 >> 2] = $2; //@line 8976
  sp = STACKTOP; //@line 8977
  return;
 }
 ___async_unwind = 0; //@line 8980
 HEAP32[$ReallocAsyncCtx7 >> 2] = 25; //@line 8981
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 8982
 HEAP32[$4 >> 2] = $2; //@line 8983
 sp = STACKTOP; //@line 8984
 return;
}
function _mbed_die__async_cb_52($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 8940
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8942
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8944
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 8945
 _wait_ms(400); //@line 8946
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 26; //@line 8949
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 8950
  HEAP32[$4 >> 2] = $2; //@line 8951
  sp = STACKTOP; //@line 8952
  return;
 }
 ___async_unwind = 0; //@line 8955
 HEAP32[$ReallocAsyncCtx6 >> 2] = 26; //@line 8956
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 8957
 HEAP32[$4 >> 2] = $2; //@line 8958
 sp = STACKTOP; //@line 8959
 return;
}
function _mbed_die__async_cb_51($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 8915
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8917
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8919
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 8920
 _wait_ms(400); //@line 8921
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 27; //@line 8924
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 8925
  HEAP32[$4 >> 2] = $2; //@line 8926
  sp = STACKTOP; //@line 8927
  return;
 }
 ___async_unwind = 0; //@line 8930
 HEAP32[$ReallocAsyncCtx5 >> 2] = 27; //@line 8931
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 8932
 HEAP32[$4 >> 2] = $2; //@line 8933
 sp = STACKTOP; //@line 8934
 return;
}
function _mbed_die__async_cb_50($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 8890
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8892
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8894
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 8895
 _wait_ms(400); //@line 8896
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 8899
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 8900
  HEAP32[$4 >> 2] = $2; //@line 8901
  sp = STACKTOP; //@line 8902
  return;
 }
 ___async_unwind = 0; //@line 8905
 HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 8906
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 8907
 HEAP32[$4 >> 2] = $2; //@line 8908
 sp = STACKTOP; //@line 8909
 return;
}
function _mbed_die__async_cb_49($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 8865
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8867
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8869
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 8870
 _wait_ms(400); //@line 8871
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 29; //@line 8874
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 8875
  HEAP32[$4 >> 2] = $2; //@line 8876
  sp = STACKTOP; //@line 8877
  return;
 }
 ___async_unwind = 0; //@line 8880
 HEAP32[$ReallocAsyncCtx3 >> 2] = 29; //@line 8881
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 8882
 HEAP32[$4 >> 2] = $2; //@line 8883
 sp = STACKTOP; //@line 8884
 return;
}
function _mbed_die__async_cb_48($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8840
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8842
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 8844
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 8845
 _wait_ms(400); //@line 8846
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 30; //@line 8849
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 8850
  HEAP32[$4 >> 2] = $2; //@line 8851
  sp = STACKTOP; //@line 8852
  return;
 }
 ___async_unwind = 0; //@line 8855
 HEAP32[$ReallocAsyncCtx2 >> 2] = 30; //@line 8856
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 8857
 HEAP32[$4 >> 2] = $2; //@line 8858
 sp = STACKTOP; //@line 8859
 return;
}
function _mbed_die__async_cb_47($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8815
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8817
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 8819
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 8820
 _wait_ms(400); //@line 8821
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 31; //@line 8824
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 8825
  HEAP32[$4 >> 2] = $2; //@line 8826
  sp = STACKTOP; //@line 8827
  return;
 }
 ___async_unwind = 0; //@line 8830
 HEAP32[$ReallocAsyncCtx >> 2] = 31; //@line 8831
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 8832
 HEAP32[$4 >> 2] = $2; //@line 8833
 sp = STACKTOP; //@line 8834
 return;
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 9402
 newDynamicTop = oldDynamicTop + increment | 0; //@line 9403
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 9407
  ___setErrNo(12); //@line 9408
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 9412
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 9416
   ___setErrNo(12); //@line 9417
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 9421
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6594
 do {
  if (!$0) {
   $3 = 0; //@line 6598
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 6600
   $2 = ___dynamic_cast($0, 56, 112, 0) | 0; //@line 6601
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 97; //@line 6604
    sp = STACKTOP; //@line 6605
    return 0; //@line 6606
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 6608
    $3 = ($2 | 0) != 0 & 1; //@line 6611
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 6616
}
function _invoke_ticker__async_cb_42($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8519
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 8525
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 8526
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 8527
 FUNCTION_TABLE_vi[$5 & 127]($6); //@line 8528
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 33; //@line 8531
  sp = STACKTOP; //@line 8532
  return;
 }
 ___async_unwind = 0; //@line 8535
 HEAP32[$ReallocAsyncCtx >> 2] = 33; //@line 8536
 sp = STACKTOP; //@line 8537
 return;
}
function ___fflush_unlocked__async_cb_2($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6780
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6782
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6784
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6786
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 6788
 HEAP32[$4 >> 2] = 0; //@line 6789
 HEAP32[$6 >> 2] = 0; //@line 6790
 HEAP32[$8 >> 2] = 0; //@line 6791
 HEAP32[$10 >> 2] = 0; //@line 6792
 HEAP32[___async_retval >> 2] = 0; //@line 6794
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
function __GLOBAL__sub_I_main_cpp() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 938
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 939
 __ZN4mbed6BusOutC2E7PinNameS1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_(904, 50, 52, 53, 55, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1); //@line 940
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 36; //@line 943
  sp = STACKTOP; //@line 944
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 947
  return;
 }
}
function _emscripten_async_resume() {
 ___async = 0; //@line 9257
 ___async_unwind = 1; //@line 9258
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 9264
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 9268
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 9272
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 9274
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4560
 STACKTOP = STACKTOP + 16 | 0; //@line 4561
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4561
 $vararg_buffer = sp; //@line 4562
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 4566
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 4568
 STACKTOP = sp; //@line 4569
 return $5 | 0; //@line 4569
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 5196
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8101
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 8112
  $$0 = 1; //@line 8113
 } else {
  $$0 = 0; //@line 8115
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 8119
 return;
}
function _wait($0) {
 $0 = +$0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 904
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 908
 _emscripten_sleep((~~($0 * 1.0e6) | 0) / 1e3 | 0 | 0); //@line 909
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 34; //@line 912
  sp = STACKTOP; //@line 913
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 916
  return;
 }
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 5272
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 923
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 924
 _emscripten_sleep($0 | 0); //@line 925
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 35; //@line 928
  sp = STACKTOP; //@line 929
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 932
  return;
 }
}
function _main__async_cb_38($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 8067
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(4) | 0; //@line 8068
 __ZN4mbed6BusOutaSEi(904, 1) | 0; //@line 8069
 if (!___async) {
  ___async_unwind = 0; //@line 8072
 }
 HEAP32[$ReallocAsyncCtx15 >> 2] = 39; //@line 8074
 sp = STACKTOP; //@line 8075
 return;
}
function _main__async_cb_37($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 8053
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(4) | 0; //@line 8054
 __ZN4mbed6BusOutaSEi(904, 2) | 0; //@line 8055
 if (!___async) {
  ___async_unwind = 0; //@line 8058
 }
 HEAP32[$ReallocAsyncCtx14 >> 2] = 41; //@line 8060
 sp = STACKTOP; //@line 8061
 return;
}
function _main__async_cb_36($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 8039
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(4) | 0; //@line 8040
 __ZN4mbed6BusOutaSEi(904, 3) | 0; //@line 8041
 if (!___async) {
  ___async_unwind = 0; //@line 8044
 }
 HEAP32[$ReallocAsyncCtx13 >> 2] = 43; //@line 8046
 sp = STACKTOP; //@line 8047
 return;
}
function _main__async_cb_35($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 8025
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(4) | 0; //@line 8026
 __ZN4mbed6BusOutaSEi(904, 4) | 0; //@line 8027
 if (!___async) {
  ___async_unwind = 0; //@line 8030
 }
 HEAP32[$ReallocAsyncCtx12 >> 2] = 45; //@line 8032
 sp = STACKTOP; //@line 8033
 return;
}
function _main__async_cb_34($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 8011
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(4) | 0; //@line 8012
 __ZN4mbed6BusOutaSEi(904, 5) | 0; //@line 8013
 if (!___async) {
  ___async_unwind = 0; //@line 8016
 }
 HEAP32[$ReallocAsyncCtx11 >> 2] = 47; //@line 8018
 sp = STACKTOP; //@line 8019
 return;
}
function _main__async_cb_33($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 7997
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(4) | 0; //@line 7998
 __ZN4mbed6BusOutaSEi(904, 6) | 0; //@line 7999
 if (!___async) {
  ___async_unwind = 0; //@line 8002
 }
 HEAP32[$ReallocAsyncCtx10 >> 2] = 49; //@line 8004
 sp = STACKTOP; //@line 8005
 return;
}
function _main__async_cb_23($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 7857
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(4) | 0; //@line 7858
 __ZN4mbed6BusOutaSEi(904, 0) | 0; //@line 7859
 if (!___async) {
  ___async_unwind = 0; //@line 7862
 }
 HEAP32[$ReallocAsyncCtx16 >> 2] = 37; //@line 7864
 sp = STACKTOP; //@line 7865
 return;
}
function runPostSets() {}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 9233
 HEAP32[new_frame + 4 >> 2] = sp; //@line 9235
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 9237
 ___async_cur_frame = new_frame; //@line 9238
 return ___async_cur_frame + 8 | 0; //@line 9239
}
function _main__async_cb_29($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 7941
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(4) | 0; //@line 7942
 __ZN4mbed6BusOutaSEi(904, 10) | 0; //@line 7943
 if (!___async) {
  ___async_unwind = 0; //@line 7946
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 57; //@line 7948
 sp = STACKTOP; //@line 7949
 return;
}
function _main__async_cb_28($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 7927
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(4) | 0; //@line 7928
 __ZN4mbed6BusOutaSEi(904, 11) | 0; //@line 7929
 if (!___async) {
  ___async_unwind = 0; //@line 7932
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 59; //@line 7934
 sp = STACKTOP; //@line 7935
 return;
}
function _main__async_cb_27($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 7913
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 7914
 __ZN4mbed6BusOutaSEi(904, 12) | 0; //@line 7915
 if (!___async) {
  ___async_unwind = 0; //@line 7918
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 61; //@line 7920
 sp = STACKTOP; //@line 7921
 return;
}
function _main__async_cb_26($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 7899
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 7900
 __ZN4mbed6BusOutaSEi(904, 13) | 0; //@line 7901
 if (!___async) {
  ___async_unwind = 0; //@line 7904
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 63; //@line 7906
 sp = STACKTOP; //@line 7907
 return;
}
function _main__async_cb_25($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 7885
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 7886
 __ZN4mbed6BusOutaSEi(904, 14) | 0; //@line 7887
 if (!___async) {
  ___async_unwind = 0; //@line 7890
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 65; //@line 7892
 sp = STACKTOP; //@line 7893
 return;
}
function _main__async_cb_32($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 7983
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(4) | 0; //@line 7984
 __ZN4mbed6BusOutaSEi(904, 7) | 0; //@line 7985
 if (!___async) {
  ___async_unwind = 0; //@line 7988
 }
 HEAP32[$ReallocAsyncCtx9 >> 2] = 51; //@line 7990
 sp = STACKTOP; //@line 7991
 return;
}
function _main__async_cb_31($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 7969
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(4) | 0; //@line 7970
 __ZN4mbed6BusOutaSEi(904, 8) | 0; //@line 7971
 if (!___async) {
  ___async_unwind = 0; //@line 7974
 }
 HEAP32[$ReallocAsyncCtx8 >> 2] = 53; //@line 7976
 sp = STACKTOP; //@line 7977
 return;
}
function _main__async_cb_30($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 7955
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 7956
 __ZN4mbed6BusOutaSEi(904, 9) | 0; //@line 7957
 if (!___async) {
  ___async_unwind = 0; //@line 7960
 }
 HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 7962
 sp = STACKTOP; //@line 7963
 return;
}
function _main__async_cb_24($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7871
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 7872
 __ZN4mbed6BusOutaSEi(904, 15) | 0; //@line 7873
 if (!___async) {
  ___async_unwind = 0; //@line 7876
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 67; //@line 7878
 sp = STACKTOP; //@line 7879
 return;
}
function _main__async_cb_22($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx32 = 0, sp = 0;
 sp = STACKTOP; //@line 7843
 $ReallocAsyncCtx32 = _emscripten_realloc_async_context(4) | 0; //@line 7844
 _wait(.25); //@line 7845
 if (!___async) {
  ___async_unwind = 0; //@line 7848
 }
 HEAP32[$ReallocAsyncCtx32 >> 2] = 38; //@line 7850
 sp = STACKTOP; //@line 7851
 return;
}
function _main__async_cb_21($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx31 = 0, sp = 0;
 sp = STACKTOP; //@line 7829
 $ReallocAsyncCtx31 = _emscripten_realloc_async_context(4) | 0; //@line 7830
 _wait(.25); //@line 7831
 if (!___async) {
  ___async_unwind = 0; //@line 7834
 }
 HEAP32[$ReallocAsyncCtx31 >> 2] = 40; //@line 7836
 sp = STACKTOP; //@line 7837
 return;
}
function _main__async_cb_20($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx30 = 0, sp = 0;
 sp = STACKTOP; //@line 7815
 $ReallocAsyncCtx30 = _emscripten_realloc_async_context(4) | 0; //@line 7816
 _wait(.25); //@line 7817
 if (!___async) {
  ___async_unwind = 0; //@line 7820
 }
 HEAP32[$ReallocAsyncCtx30 >> 2] = 42; //@line 7822
 sp = STACKTOP; //@line 7823
 return;
}
function _main__async_cb_19($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx29 = 0, sp = 0;
 sp = STACKTOP; //@line 7801
 $ReallocAsyncCtx29 = _emscripten_realloc_async_context(4) | 0; //@line 7802
 _wait(.25); //@line 7803
 if (!___async) {
  ___async_unwind = 0; //@line 7806
 }
 HEAP32[$ReallocAsyncCtx29 >> 2] = 44; //@line 7808
 sp = STACKTOP; //@line 7809
 return;
}
function _main__async_cb_18($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx28 = 0, sp = 0;
 sp = STACKTOP; //@line 7787
 $ReallocAsyncCtx28 = _emscripten_realloc_async_context(4) | 0; //@line 7788
 _wait(.25); //@line 7789
 if (!___async) {
  ___async_unwind = 0; //@line 7792
 }
 HEAP32[$ReallocAsyncCtx28 >> 2] = 46; //@line 7794
 sp = STACKTOP; //@line 7795
 return;
}
function _main__async_cb_17($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx27 = 0, sp = 0;
 sp = STACKTOP; //@line 7773
 $ReallocAsyncCtx27 = _emscripten_realloc_async_context(4) | 0; //@line 7774
 _wait(.25); //@line 7775
 if (!___async) {
  ___async_unwind = 0; //@line 7778
 }
 HEAP32[$ReallocAsyncCtx27 >> 2] = 48; //@line 7780
 sp = STACKTOP; //@line 7781
 return;
}
function _main__async_cb_16($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx26 = 0, sp = 0;
 sp = STACKTOP; //@line 7759
 $ReallocAsyncCtx26 = _emscripten_realloc_async_context(4) | 0; //@line 7760
 _wait(.25); //@line 7761
 if (!___async) {
  ___async_unwind = 0; //@line 7764
 }
 HEAP32[$ReallocAsyncCtx26 >> 2] = 50; //@line 7766
 sp = STACKTOP; //@line 7767
 return;
}
function _main__async_cb_15($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx25 = 0, sp = 0;
 sp = STACKTOP; //@line 7745
 $ReallocAsyncCtx25 = _emscripten_realloc_async_context(4) | 0; //@line 7746
 _wait(.25); //@line 7747
 if (!___async) {
  ___async_unwind = 0; //@line 7750
 }
 HEAP32[$ReallocAsyncCtx25 >> 2] = 52; //@line 7752
 sp = STACKTOP; //@line 7753
 return;
}
function _main__async_cb_14($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx24 = 0, sp = 0;
 sp = STACKTOP; //@line 7731
 $ReallocAsyncCtx24 = _emscripten_realloc_async_context(4) | 0; //@line 7732
 _wait(.25); //@line 7733
 if (!___async) {
  ___async_unwind = 0; //@line 7736
 }
 HEAP32[$ReallocAsyncCtx24 >> 2] = 54; //@line 7738
 sp = STACKTOP; //@line 7739
 return;
}
function _main__async_cb_13($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx23 = 0, sp = 0;
 sp = STACKTOP; //@line 7717
 $ReallocAsyncCtx23 = _emscripten_realloc_async_context(4) | 0; //@line 7718
 _wait(.25); //@line 7719
 if (!___async) {
  ___async_unwind = 0; //@line 7722
 }
 HEAP32[$ReallocAsyncCtx23 >> 2] = 56; //@line 7724
 sp = STACKTOP; //@line 7725
 return;
}
function _main__async_cb_12($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx22 = 0, sp = 0;
 sp = STACKTOP; //@line 7703
 $ReallocAsyncCtx22 = _emscripten_realloc_async_context(4) | 0; //@line 7704
 _wait(.25); //@line 7705
 if (!___async) {
  ___async_unwind = 0; //@line 7708
 }
 HEAP32[$ReallocAsyncCtx22 >> 2] = 58; //@line 7710
 sp = STACKTOP; //@line 7711
 return;
}
function _main__async_cb_11($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx21 = 0, sp = 0;
 sp = STACKTOP; //@line 7689
 $ReallocAsyncCtx21 = _emscripten_realloc_async_context(4) | 0; //@line 7690
 _wait(.25); //@line 7691
 if (!___async) {
  ___async_unwind = 0; //@line 7694
 }
 HEAP32[$ReallocAsyncCtx21 >> 2] = 60; //@line 7696
 sp = STACKTOP; //@line 7697
 return;
}
function _main__async_cb_10($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx20 = 0, sp = 0;
 sp = STACKTOP; //@line 7675
 $ReallocAsyncCtx20 = _emscripten_realloc_async_context(4) | 0; //@line 7676
 _wait(.25); //@line 7677
 if (!___async) {
  ___async_unwind = 0; //@line 7680
 }
 HEAP32[$ReallocAsyncCtx20 >> 2] = 62; //@line 7682
 sp = STACKTOP; //@line 7683
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 5336
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 5340
  }
 }
 return;
}
function _main__async_cb_9($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx19 = 0, sp = 0;
 sp = STACKTOP; //@line 7661
 $ReallocAsyncCtx19 = _emscripten_realloc_async_context(4) | 0; //@line 7662
 _wait(.25); //@line 7663
 if (!___async) {
  ___async_unwind = 0; //@line 7666
 }
 HEAP32[$ReallocAsyncCtx19 >> 2] = 64; //@line 7668
 sp = STACKTOP; //@line 7669
 return;
}
function _main__async_cb_8($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx18 = 0, sp = 0;
 sp = STACKTOP; //@line 7647
 $ReallocAsyncCtx18 = _emscripten_realloc_async_context(4) | 0; //@line 7648
 _wait(.25); //@line 7649
 if (!___async) {
  ___async_unwind = 0; //@line 7652
 }
 HEAP32[$ReallocAsyncCtx18 >> 2] = 66; //@line 7654
 sp = STACKTOP; //@line 7655
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx17 = 0, sp = 0;
 sp = STACKTOP; //@line 7633
 $ReallocAsyncCtx17 = _emscripten_realloc_async_context(4) | 0; //@line 7634
 _wait(.25); //@line 7635
 if (!___async) {
  ___async_unwind = 0; //@line 7638
 }
 HEAP32[$ReallocAsyncCtx17 >> 2] = 68; //@line 7640
 sp = STACKTOP; //@line 7641
 return;
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 7439
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 7443
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 7446
 return;
}
function _fflush__async_cb_43($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 8627
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 8629
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 8632
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
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 9470
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 9245
 stackRestore(___async_cur_frame | 0); //@line 9246
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 9247
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 4726
  $$0 = -1; //@line 4727
 } else {
  $$0 = $0; //@line 4729
 }
 return $$0 | 0; //@line 4731
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 834
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 840
 _emscripten_asm_const_iii(1, $0 | 0, $1 | 0) | 0; //@line 841
 return;
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 9463
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 9456
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 9435
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 8428
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 9252
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 9253
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 5777
 __ZdlPv($0); //@line 5778
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 5558
 __ZdlPv($0); //@line 5559
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 5086
 __ZdlPv($0); //@line 5087
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
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 8087
 return;
}
function b46(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 9591
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 5283
}
function __ZSt15get_new_handlerv() {
 var $0 = 0;
 $0 = HEAP32[373] | 0; //@line 6550
 HEAP32[373] = $0 + 0; //@line 6552
 return $0 | 0; //@line 6554
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
function b44(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 9588
}
function __ZN4mbed6BusOutaSEi__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 8507
 return;
}
function _fflush__async_cb_44($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 8642
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 9428
}
function b6(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 9486
 return 0; //@line 9486
}
function b5(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 9483
 return 0; //@line 9483
}
function b4(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(5); //@line 9480
 return 0; //@line 9480
}
function b3(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 9477
 return 0; //@line 9477
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
 FUNCTION_TABLE_vi[index & 127](a1 | 0); //@line 9449
}
function b42(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 9585
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 0](); //@line 9442
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 return;
}
function b1(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 9474
 return 0; //@line 9474
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
 ___lock(1480); //@line 4792
 return 1488; //@line 4793
}
function setTempRet0(value) {
 value = value | 0;
 tempRet0 = value; //@line 39
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6BusOut5writeEi__async_cb_7($0) {
 $0 = $0 | 0;
 return;
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
 _free($0); //@line 5073
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
 ___unlock(1480); //@line 4798
 return;
}
function b40(p0) {
 p0 = p0 | 0;
 nullFunc_vi(127); //@line 9582
}
function b39(p0) {
 p0 = p0 | 0;
 nullFunc_vi(126); //@line 9579
}
function b38(p0) {
 p0 = p0 | 0;
 nullFunc_vi(125); //@line 9576
}
function b37(p0) {
 p0 = p0 | 0;
 nullFunc_vi(124); //@line 9573
}
function b36(p0) {
 p0 = p0 | 0;
 nullFunc_vi(123); //@line 9570
}
function b35(p0) {
 p0 = p0 | 0;
 nullFunc_vi(122); //@line 9567
}
function b34(p0) {
 p0 = p0 | 0;
 nullFunc_vi(121); //@line 9564
}
function b33(p0) {
 p0 = p0 | 0;
 nullFunc_vi(120); //@line 9561
}
function b32(p0) {
 p0 = p0 | 0;
 nullFunc_vi(119); //@line 9558
}
function b31(p0) {
 p0 = p0 | 0;
 nullFunc_vi(118); //@line 9555
}
function b30(p0) {
 p0 = p0 | 0;
 nullFunc_vi(117); //@line 9552
}
function b29(p0) {
 p0 = p0 | 0;
 nullFunc_vi(116); //@line 9549
}
function b28(p0) {
 p0 = p0 | 0;
 nullFunc_vi(115); //@line 9546
}
function b27(p0) {
 p0 = p0 | 0;
 nullFunc_vi(114); //@line 9543
}
function b26(p0) {
 p0 = p0 | 0;
 nullFunc_vi(113); //@line 9540
}
function b25(p0) {
 p0 = p0 | 0;
 nullFunc_vi(112); //@line 9537
}
function b24(p0) {
 p0 = p0 | 0;
 nullFunc_vi(111); //@line 9534
}
function b23(p0) {
 p0 = p0 | 0;
 nullFunc_vi(110); //@line 9531
}
function b22(p0) {
 p0 = p0 | 0;
 nullFunc_vi(109); //@line 9528
}
function b21(p0) {
 p0 = p0 | 0;
 nullFunc_vi(108); //@line 9525
}
function b20(p0) {
 p0 = p0 | 0;
 nullFunc_vi(107); //@line 9522
}
function b19(p0) {
 p0 = p0 | 0;
 nullFunc_vi(106); //@line 9519
}
function b18(p0) {
 p0 = p0 | 0;
 nullFunc_vi(105); //@line 9516
}
function b17(p0) {
 p0 = p0 | 0;
 nullFunc_vi(104); //@line 9513
}
function b16(p0) {
 p0 = p0 | 0;
 nullFunc_vi(103); //@line 9510
}
function b15(p0) {
 p0 = p0 | 0;
 nullFunc_vi(102); //@line 9507
}
function b14(p0) {
 p0 = p0 | 0;
 nullFunc_vi(101); //@line 9504
}
function b13(p0) {
 p0 = p0 | 0;
 nullFunc_vi(100); //@line 9501
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 4742
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 4787
}
function b12(p0) {
 p0 = p0 | 0;
 nullFunc_vi(99); //@line 9498
}
function b11(p0) {
 p0 = p0 | 0;
 nullFunc_vi(98); //@line 9495
}
function __ZN4mbed6BusOut6unlockEv($0) {
 $0 = $0 | 0;
 return;
}
function b10(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 9492
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6BusOut4lockEv($0) {
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
 return 1476; //@line 4736
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
function _wait__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 26
}
function b8() {
 nullFunc_v(0); //@line 9489
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_ii = [b1,___stdio_close];
var FUNCTION_TABLE_iiii = [b3,___stdout_write,___stdio_seek,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,___stdio_write,b4,b5,b6];
var FUNCTION_TABLE_v = [b8];
var FUNCTION_TABLE_vi = [b10,__ZN4mbed6BusOutD2Ev,__ZN4mbed6BusOutD0Ev,__ZN4mbed6BusOut4lockEv,__ZN4mbed6BusOut6unlockEv,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed6BusOutC2E7PinNameS1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1_S1___async_cb,__ZN4mbed6BusOut5writeEi__async_cb,__ZN4mbed6BusOut5writeEi__async_cb_7,__ZN4mbed6BusOutaSEi__async_cb,_mbed_assert_internal__async_cb,_mbed_die__async_cb_61,_mbed_die__async_cb_60,_mbed_die__async_cb_59,_mbed_die__async_cb_58,_mbed_die__async_cb_57,_mbed_die__async_cb_56,_mbed_die__async_cb_55,_mbed_die__async_cb_54,_mbed_die__async_cb_53,_mbed_die__async_cb_52,_mbed_die__async_cb_51,_mbed_die__async_cb_50,_mbed_die__async_cb_49
,_mbed_die__async_cb_48,_mbed_die__async_cb_47,_mbed_die__async_cb,_invoke_ticker__async_cb_42,_invoke_ticker__async_cb,_wait__async_cb,_wait_ms__async_cb,__GLOBAL__sub_I_main_cpp__async_cb,_main__async_cb_22,_main__async_cb_38,_main__async_cb_21,_main__async_cb_37,_main__async_cb_20,_main__async_cb_36,_main__async_cb_19,_main__async_cb_35,_main__async_cb_18,_main__async_cb_34,_main__async_cb_17,_main__async_cb_33,_main__async_cb_16,_main__async_cb_32,_main__async_cb_15,_main__async_cb_31,_main__async_cb_14,_main__async_cb_30,_main__async_cb_13,_main__async_cb_29,_main__async_cb_12,_main__async_cb_28
,_main__async_cb_11,_main__async_cb_27,_main__async_cb_10,_main__async_cb_26,_main__async_cb_9,_main__async_cb_25,_main__async_cb_8,_main__async_cb_24,_main__async_cb,_main__async_cb_23,_fflush__async_cb_44,_fflush__async_cb_43,_fflush__async_cb_45,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_2,__Znwj__async_cb,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_39,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_41,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_46,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_40,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_6,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_5,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_4
,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_3,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_1,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b11,b12,b13,b14,b15,b16,b17,b18,b19,b20,b21,b22,b23,b24,b25,b26,b27,b28,b29,b30,b31
,b32,b33,b34,b35,b36,b37,b38,b39,b40];
var FUNCTION_TABLE_viiii = [b42,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi];
var FUNCTION_TABLE_viiiii = [b44,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib];
var FUNCTION_TABLE_viiiiii = [b46,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib];

  return { __GLOBAL__sub_I_main_cpp: __GLOBAL__sub_I_main_cpp, ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _fflush: _fflush, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _invoke_ticker: _invoke_ticker, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
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

var real__invoke_ticker = asm["_invoke_ticker"]; asm["_invoke_ticker"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__invoke_ticker.apply(null, arguments);
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
var _emscripten_alloc_async_context = Module["_emscripten_alloc_async_context"] = asm["_emscripten_alloc_async_context"];
var _emscripten_async_resume = Module["_emscripten_async_resume"] = asm["_emscripten_async_resume"];
var _emscripten_free_async_context = Module["_emscripten_free_async_context"] = asm["_emscripten_free_async_context"];
var _emscripten_realloc_async_context = Module["_emscripten_realloc_async_context"] = asm["_emscripten_realloc_async_context"];
var _fflush = Module["_fflush"] = asm["_fflush"];
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
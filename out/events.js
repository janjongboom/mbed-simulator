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
 function($0, $1) { MbedJSHal.gpio.init_in($0, $1, 3); },
 function($0, $1) { MbedJSHal.gpio.init_out($0, $1, 0); },
 function($0, $1) { MbedJSHal.gpio.irq_init($0, $1); },
 function($0, $1) { MbedJSHal.gpio.irq_free($0); },
 function($0, $1, $2) { MbedJSHal.gpio.irq_set($0, $1, $2); },
 function($0) { return MbedJSHal.gpio.read($0); }];

function _emscripten_asm_const_iii(code, a0, a1) {
  return ASM_CONSTS[code](a0, a1);
}

function _emscripten_asm_const_iiii(code, a0, a1, a2) {
  return ASM_CONSTS[code](a0, a1, a2);
}

function _emscripten_asm_const_ii(code, a0) {
  return ASM_CONSTS[code](a0);
}




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 6480;
/* global initializers */  __ATINIT__.push({ func: function() { __GLOBAL__sub_I_main_cpp() } });


memoryInitializer = "events.js.mem";





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

  function _gettimeofday(ptr) {
      var now = Date.now();
      HEAP32[((ptr)>>2)]=(now/1000)|0; // seconds
      HEAP32[(((ptr)+(4))>>2)]=((now % 1000)*1000)|0; // microseconds
      return 0;
    }



   

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 

   

  function _pthread_cond_init() { return 0; }

  function _pthread_cond_signal() { return 0; }

  function _pthread_cond_timedwait() { return 0; }

  function _pthread_cond_wait() { return 0; }

  
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

  function _pthread_mutex_init() {}

   

   

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



var debug_table_ii = ["0", "___stdio_close", "__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE", "0"];
var debug_table_iiii = ["0", "___stdio_write", "___stdio_seek", "___stdout_write", "_sn_write", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv", "0", "0"];
var debug_table_v = ["0", "__ZL25default_terminate_handlerv", "__Z9blink_ledv", "__Z8btn_fallv", "__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev", "0", "0", "0"];
var debug_table_vi = ["0", "__ZN4mbed11InterruptInD2Ev", "__ZN4mbed11InterruptInD0Ev", "__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv", "__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "__ZN10__cxxabiv121__vmi_class_type_infoD0Ev", "__ZN4mbed11InterruptInD2Ev__async_cb", "__ZN4mbed11InterruptInD2Ev__async_cb_1", "__ZN4mbed11InterruptInD0Ev__async_cb", "__ZN4mbed11InterruptInD0Ev__async_cb_3", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_42", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_44", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_45", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_46", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_47", "__ZN6events10EventQueue8dispatchEi__async_cb", "_equeue_alloc__async_cb", "_equeue_dealloc__async_cb", "_equeue_post__async_cb", "_equeue_enqueue__async_cb", "_equeue_dispatch__async_cb", "_equeue_dispatch__async_cb_50", "_equeue_dispatch__async_cb_48", "_equeue_dispatch__async_cb_49", "_equeue_dispatch__async_cb_51", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_18", "_mbed_die__async_cb_17", "_mbed_die__async_cb_16", "_mbed_die__async_cb_15", "_mbed_die__async_cb_14", "_mbed_die__async_cb_13", "_mbed_die__async_cb_12", "_mbed_die__async_cb_11", "_mbed_die__async_cb_10", "_mbed_die__async_cb_9", "_mbed_die__async_cb_8", "_mbed_die__async_cb_7", "_mbed_die__async_cb_6", "_mbed_die__async_cb_5", "_mbed_die__async_cb_4", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_printf__async_cb_36", "_handle_interrupt_in__async_cb", "_serial_putc__async_cb_2", "_serial_putc__async_cb", "_invoke_ticker__async_cb_41", "_invoke_ticker__async_cb", "_wait_ms__async_cb", "__Z9blink_ledv__async_cb", "__Z8btn_fallv__async_cb", "_main__async_cb_26", "__ZN6events10EventQueue13function_dtorIPFvvEEEvPv", "__ZN6events10EventQueue13function_callIPFvvEEEvPv", "_main__async_cb_22", "_main__async_cb_25", "__ZN6events5EventIFvvEE10event_dtorIPS1_EEvPNS2_5eventE", "_main__async_cb_24", "_main__async_cb", "_main__async_cb_20", "_main__async_cb_23", "_main__async_cb_21", "__ZN6events10EventQueue13function_callIPFvvEEEvPv__async_cb", "__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb_43", "__ZN6events10EventQueue13function_dtorINS0_9context00IPFvvEEEEEvPv", "__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv", "__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb", "__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb", "__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb_34", "__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb", "__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb_31", "__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv__async_cb", "_putc__async_cb_32", "_putc__async_cb", "___overflow__async_cb", "_fflush__async_cb_54", "_fflush__async_cb_53", "_fflush__async_cb_55", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_56", "_vfprintf__async_cb", "_vsnprintf__async_cb", "_fputc__async_cb_29", "_fputc__async_cb", "_puts__async_cb", "__ZL25default_terminate_handlerv__async_cb", "__ZL25default_terminate_handlerv__async_cb_52", "_abort_message__async_cb", "_abort_message__async_cb_27", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_35", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_33", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_19", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv", "__ZSt11__terminatePFvvE__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_57", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_40", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_39", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_38", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_37", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_28", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0"];
var debug_table_vii = ["0", "__ZN4mbed8CallbackIFvvEE13function_moveIN6events5EventIS1_EEEEvPvPKv", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event", "0"];
var debug_table_viiii = ["0", "__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi"];
var debug_table_viiiii = ["0", "__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib"];
var debug_table_viiiiii = ["0", "__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib"];
function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: iiii: " + debug_table_iiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  "); abort(x) }

function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: ii: " + debug_table_ii[x] + "  viiii: " + debug_table_viiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  "); abort(x) }

function nullFunc_v(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  vii: " + debug_table_vii[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: v: " + debug_table_v[x] + "  vii: " + debug_table_vii[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_vii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'vii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_viiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  "); abort(x) }

function nullFunc_viiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viiii: " + debug_table_viiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  "); abort(x) }

function nullFunc_viiiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  "); abort(x) }

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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_ii": nullFunc_ii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_v": nullFunc_v, "nullFunc_vi": nullFunc_vi, "nullFunc_vii": nullFunc_vii, "nullFunc_viiii": nullFunc_viiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "___cxa_begin_catch": ___cxa_begin_catch, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "___gxx_personality_v0": ___gxx_personality_v0, "___lock": ___lock, "___resumeException": ___resumeException, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___unlock": ___unlock, "_abort": _abort, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_asm_const_iiii": _emscripten_asm_const_iiii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "_gettimeofday": _gettimeofday, "_pthread_cond_init": _pthread_cond_init, "_pthread_cond_signal": _pthread_cond_signal, "_pthread_cond_timedwait": _pthread_cond_timedwait, "_pthread_cond_wait": _pthread_cond_wait, "_pthread_getspecific": _pthread_getspecific, "_pthread_key_create": _pthread_key_create, "_pthread_mutex_init": _pthread_mutex_init, "_pthread_once": _pthread_once, "_pthread_setspecific": _pthread_setspecific, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
  var nullFunc_vii=env.nullFunc_vii;
  var nullFunc_viiii=env.nullFunc_viiii;
  var nullFunc_viiiii=env.nullFunc_viiiii;
  var nullFunc_viiiiii=env.nullFunc_viiiiii;
  var invoke_ii=env.invoke_ii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_v=env.invoke_v;
  var invoke_vi=env.invoke_vi;
  var invoke_vii=env.invoke_vii;
  var invoke_viiii=env.invoke_viiii;
  var invoke_viiiii=env.invoke_viiiii;
  var invoke_viiiiii=env.invoke_viiiiii;
  var __ZSt18uncaught_exceptionv=env.__ZSt18uncaught_exceptionv;
  var ___cxa_begin_catch=env.___cxa_begin_catch;
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
  var _emscripten_asm_const_ii=env._emscripten_asm_const_ii;
  var _emscripten_asm_const_iii=env._emscripten_asm_const_iii;
  var _emscripten_asm_const_iiii=env._emscripten_asm_const_iiii;
  var _emscripten_get_now=env._emscripten_get_now;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var _emscripten_set_main_loop=env._emscripten_set_main_loop;
  var _emscripten_set_main_loop_timing=env._emscripten_set_main_loop_timing;
  var _emscripten_sleep=env._emscripten_sleep;
  var _gettimeofday=env._gettimeofday;
  var _pthread_cond_init=env._pthread_cond_init;
  var _pthread_cond_signal=env._pthread_cond_signal;
  var _pthread_cond_timedwait=env._pthread_cond_timedwait;
  var _pthread_cond_wait=env._pthread_cond_wait;
  var _pthread_getspecific=env._pthread_getspecific;
  var _pthread_key_create=env._pthread_key_create;
  var _pthread_mutex_init=env._pthread_mutex_init;
  var _pthread_once=env._pthread_once;
  var _pthread_setspecific=env._pthread_setspecific;
  var flush_NO_FILESYSTEM=env.flush_NO_FILESYSTEM;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS
function _malloc($0) {
 $0 = $0 | 0;
 var $$$0192$i = 0, $$$0193$i = 0, $$$4351$i = 0, $$$i = 0, $$0 = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i17$i = 0, $$0189$i = 0, $$0192$lcssa$i = 0, $$01926$i = 0, $$0193$lcssa$i = 0, $$01935$i = 0, $$0197 = 0, $$0199 = 0, $$0206$i$i = 0, $$0207$i$i = 0, $$0211$i$i = 0, $$0212$i$i = 0, $$024367$i = 0, $$0287$i$i = 0, $$0288$i$i = 0, $$0289$i$i = 0, $$0295$i$i = 0, $$0296$i$i = 0, $$0342$i = 0, $$0344$i = 0, $$0345$i = 0, $$0347$i = 0, $$0353$i = 0, $$0358$i = 0, $$0359$i = 0, $$0361$i = 0, $$0362$i = 0, $$0368$i = 0, $$1196$i = 0, $$1198$i = 0, $$124466$i = 0, $$1291$i$i = 0, $$1293$i$i = 0, $$1343$i = 0, $$1348$i = 0, $$1363$i = 0, $$1370$i = 0, $$1374$i = 0, $$2234243136$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2355$i = 0, $$3$i = 0, $$3$i$i = 0, $$3$i203 = 0, $$3350$i = 0, $$3372$i = 0, $$4$lcssa$i = 0, $$4$ph$i = 0, $$414$i = 0, $$4236$i = 0, $$4351$lcssa$i = 0, $$435113$i = 0, $$4357$$4$i = 0, $$4357$ph$i = 0, $$435712$i = 0, $$723947$i = 0, $$748$i = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i19$iZ2D = 0, $$pre$phi$i211Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phi11$i$iZ2D = 0, $$pre$phiZ2D = 0, $1 = 0, $1004 = 0, $101 = 0, $1010 = 0, $1013 = 0, $1014 = 0, $102 = 0, $1032 = 0, $1034 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1052 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $108 = 0, $112 = 0, $114 = 0, $115 = 0, $117 = 0, $119 = 0, $121 = 0, $123 = 0, $125 = 0, $127 = 0, $129 = 0, $134 = 0, $138 = 0, $14 = 0, $143 = 0, $146 = 0, $149 = 0, $150 = 0, $157 = 0, $159 = 0, $16 = 0, $162 = 0, $164 = 0, $167 = 0, $169 = 0, $17 = 0, $172 = 0, $175 = 0, $176 = 0, $178 = 0, $179 = 0, $18 = 0, $181 = 0, $182 = 0, $184 = 0, $185 = 0, $19 = 0, $190 = 0, $191 = 0, $20 = 0, $204 = 0, $208 = 0, $214 = 0, $221 = 0, $225 = 0, $234 = 0, $235 = 0, $237 = 0, $238 = 0, $242 = 0, $243 = 0, $251 = 0, $252 = 0, $253 = 0, $255 = 0, $256 = 0, $261 = 0, $262 = 0, $265 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $282 = 0, $292 = 0, $296 = 0, $30 = 0, $302 = 0, $306 = 0, $309 = 0, $313 = 0, $315 = 0, $316 = 0, $318 = 0, $320 = 0, $322 = 0, $324 = 0, $326 = 0, $328 = 0, $330 = 0, $34 = 0, $340 = 0, $341 = 0, $352 = 0, $354 = 0, $357 = 0, $359 = 0, $362 = 0, $364 = 0, $367 = 0, $37 = 0, $370 = 0, $371 = 0, $373 = 0, $374 = 0, $376 = 0, $377 = 0, $379 = 0, $380 = 0, $385 = 0, $386 = 0, $391 = 0, $399 = 0, $403 = 0, $409 = 0, $41 = 0, $416 = 0, $420 = 0, $428 = 0, $431 = 0, $432 = 0, $433 = 0, $437 = 0, $438 = 0, $44 = 0, $444 = 0, $449 = 0, $450 = 0, $453 = 0, $455 = 0, $458 = 0, $463 = 0, $469 = 0, $47 = 0, $471 = 0, $473 = 0, $475 = 0, $49 = 0, $492 = 0, $494 = 0, $50 = 0, $501 = 0, $502 = 0, $503 = 0, $512 = 0, $514 = 0, $515 = 0, $517 = 0, $52 = 0, $526 = 0, $530 = 0, $532 = 0, $533 = 0, $534 = 0, $54 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $550 = 0, $552 = 0, $554 = 0, $555 = 0, $56 = 0, $561 = 0, $563 = 0, $565 = 0, $570 = 0, $572 = 0, $574 = 0, $575 = 0, $576 = 0, $58 = 0, $584 = 0, $585 = 0, $588 = 0, $592 = 0, $595 = 0, $597 = 0, $6 = 0, $60 = 0, $603 = 0, $607 = 0, $611 = 0, $62 = 0, $620 = 0, $621 = 0, $627 = 0, $629 = 0, $633 = 0, $636 = 0, $638 = 0, $64 = 0, $642 = 0, $644 = 0, $649 = 0, $650 = 0, $651 = 0, $657 = 0, $658 = 0, $659 = 0, $663 = 0, $67 = 0, $673 = 0, $675 = 0, $680 = 0, $681 = 0, $682 = 0, $688 = 0, $69 = 0, $690 = 0, $694 = 0, $7 = 0, $70 = 0, $700 = 0, $704 = 0, $71 = 0, $710 = 0, $712 = 0, $718 = 0, $72 = 0, $722 = 0, $723 = 0, $728 = 0, $73 = 0, $734 = 0, $739 = 0, $742 = 0, $743 = 0, $746 = 0, $748 = 0, $750 = 0, $753 = 0, $764 = 0, $769 = 0, $77 = 0, $771 = 0, $774 = 0, $776 = 0, $779 = 0, $782 = 0, $783 = 0, $784 = 0, $786 = 0, $788 = 0, $789 = 0, $791 = 0, $792 = 0, $797 = 0, $798 = 0, $8 = 0, $80 = 0, $812 = 0, $815 = 0, $816 = 0, $822 = 0, $83 = 0, $830 = 0, $836 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $845 = 0, $846 = 0, $852 = 0, $857 = 0, $858 = 0, $861 = 0, $863 = 0, $866 = 0, $87 = 0, $871 = 0, $877 = 0, $879 = 0, $881 = 0, $882 = 0, $9 = 0, $900 = 0, $902 = 0, $909 = 0, $910 = 0, $911 = 0, $919 = 0, $92 = 0, $923 = 0, $927 = 0, $929 = 0, $93 = 0, $935 = 0, $936 = 0, $938 = 0, $939 = 0, $940 = 0, $941 = 0, $943 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $956 = 0, $958 = 0, $96 = 0, $964 = 0, $969 = 0, $972 = 0, $973 = 0, $974 = 0, $978 = 0, $979 = 0, $98 = 0, $985 = 0, $990 = 0, $991 = 0, $994 = 0, $996 = 0, $999 = 0, label = 0, sp = 0, $958$looptemp = 0;
 sp = STACKTOP; //@line 2743
 STACKTOP = STACKTOP + 16 | 0; //@line 2744
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2744
 $1 = sp; //@line 2745
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 2752
   $7 = $6 >>> 3; //@line 2753
   $8 = HEAP32[1212] | 0; //@line 2754
   $9 = $8 >>> $7; //@line 2755
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 2761
    $16 = 4888 + ($14 << 1 << 2) | 0; //@line 2763
    $17 = $16 + 8 | 0; //@line 2764
    $18 = HEAP32[$17 >> 2] | 0; //@line 2765
    $19 = $18 + 8 | 0; //@line 2766
    $20 = HEAP32[$19 >> 2] | 0; //@line 2767
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1212] = $8 & ~(1 << $14); //@line 2774
     } else {
      if ((HEAP32[1216] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 2779
      }
      $27 = $20 + 12 | 0; //@line 2782
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 2786
       HEAP32[$17 >> 2] = $20; //@line 2787
       break;
      } else {
       _abort(); //@line 2790
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 2795
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 2798
    $34 = $18 + $30 + 4 | 0; //@line 2800
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 2803
    $$0 = $19; //@line 2804
    STACKTOP = sp; //@line 2805
    return $$0 | 0; //@line 2805
   }
   $37 = HEAP32[1214] | 0; //@line 2807
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 2813
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 2816
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 2819
     $49 = $47 >>> 12 & 16; //@line 2821
     $50 = $47 >>> $49; //@line 2822
     $52 = $50 >>> 5 & 8; //@line 2824
     $54 = $50 >>> $52; //@line 2826
     $56 = $54 >>> 2 & 4; //@line 2828
     $58 = $54 >>> $56; //@line 2830
     $60 = $58 >>> 1 & 2; //@line 2832
     $62 = $58 >>> $60; //@line 2834
     $64 = $62 >>> 1 & 1; //@line 2836
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 2839
     $69 = 4888 + ($67 << 1 << 2) | 0; //@line 2841
     $70 = $69 + 8 | 0; //@line 2842
     $71 = HEAP32[$70 >> 2] | 0; //@line 2843
     $72 = $71 + 8 | 0; //@line 2844
     $73 = HEAP32[$72 >> 2] | 0; //@line 2845
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 2851
       HEAP32[1212] = $77; //@line 2852
       $98 = $77; //@line 2853
      } else {
       if ((HEAP32[1216] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 2858
       }
       $80 = $73 + 12 | 0; //@line 2861
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 2865
        HEAP32[$70 >> 2] = $73; //@line 2866
        $98 = $8; //@line 2867
        break;
       } else {
        _abort(); //@line 2870
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 2875
     $84 = $83 - $6 | 0; //@line 2876
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 2879
     $87 = $71 + $6 | 0; //@line 2880
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 2883
     HEAP32[$71 + $83 >> 2] = $84; //@line 2885
     if ($37 | 0) {
      $92 = HEAP32[1217] | 0; //@line 2888
      $93 = $37 >>> 3; //@line 2889
      $95 = 4888 + ($93 << 1 << 2) | 0; //@line 2891
      $96 = 1 << $93; //@line 2892
      if (!($98 & $96)) {
       HEAP32[1212] = $98 | $96; //@line 2897
       $$0199 = $95; //@line 2899
       $$pre$phiZ2D = $95 + 8 | 0; //@line 2899
      } else {
       $101 = $95 + 8 | 0; //@line 2901
       $102 = HEAP32[$101 >> 2] | 0; //@line 2902
       if ((HEAP32[1216] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 2906
       } else {
        $$0199 = $102; //@line 2909
        $$pre$phiZ2D = $101; //@line 2909
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 2912
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 2914
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 2916
      HEAP32[$92 + 12 >> 2] = $95; //@line 2918
     }
     HEAP32[1214] = $84; //@line 2920
     HEAP32[1217] = $87; //@line 2921
     $$0 = $72; //@line 2922
     STACKTOP = sp; //@line 2923
     return $$0 | 0; //@line 2923
    }
    $108 = HEAP32[1213] | 0; //@line 2925
    if (!$108) {
     $$0197 = $6; //@line 2928
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 2932
     $114 = $112 >>> 12 & 16; //@line 2934
     $115 = $112 >>> $114; //@line 2935
     $117 = $115 >>> 5 & 8; //@line 2937
     $119 = $115 >>> $117; //@line 2939
     $121 = $119 >>> 2 & 4; //@line 2941
     $123 = $119 >>> $121; //@line 2943
     $125 = $123 >>> 1 & 2; //@line 2945
     $127 = $123 >>> $125; //@line 2947
     $129 = $127 >>> 1 & 1; //@line 2949
     $134 = HEAP32[5152 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 2954
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 2958
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2964
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 2967
      $$0193$lcssa$i = $138; //@line 2967
     } else {
      $$01926$i = $134; //@line 2969
      $$01935$i = $138; //@line 2969
      $146 = $143; //@line 2969
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 2974
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 2975
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 2976
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 2977
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2983
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 2986
        $$0193$lcssa$i = $$$0193$i; //@line 2986
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 2989
        $$01935$i = $$$0193$i; //@line 2989
       }
      }
     }
     $157 = HEAP32[1216] | 0; //@line 2993
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 2996
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 2999
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 3002
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 3006
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 3008
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 3012
       $176 = HEAP32[$175 >> 2] | 0; //@line 3013
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 3016
        $179 = HEAP32[$178 >> 2] | 0; //@line 3017
        if (!$179) {
         $$3$i = 0; //@line 3020
         break;
        } else {
         $$1196$i = $179; //@line 3023
         $$1198$i = $178; //@line 3023
        }
       } else {
        $$1196$i = $176; //@line 3026
        $$1198$i = $175; //@line 3026
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 3029
        $182 = HEAP32[$181 >> 2] | 0; //@line 3030
        if ($182 | 0) {
         $$1196$i = $182; //@line 3033
         $$1198$i = $181; //@line 3033
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 3036
        $185 = HEAP32[$184 >> 2] | 0; //@line 3037
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 3042
         $$1198$i = $184; //@line 3042
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 3047
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 3050
        $$3$i = $$1196$i; //@line 3051
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 3056
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 3059
       }
       $169 = $167 + 12 | 0; //@line 3062
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 3066
       }
       $172 = $164 + 8 | 0; //@line 3069
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 3073
        HEAP32[$172 >> 2] = $167; //@line 3074
        $$3$i = $164; //@line 3075
        break;
       } else {
        _abort(); //@line 3078
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 3087
       $191 = 5152 + ($190 << 2) | 0; //@line 3088
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 3093
         if (!$$3$i) {
          HEAP32[1213] = $108 & ~(1 << $190); //@line 3099
          break L73;
         }
        } else {
         if ((HEAP32[1216] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 3106
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 3114
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1216] | 0; //@line 3124
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 3127
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 3131
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 3133
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 3139
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 3143
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 3145
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 3151
       if ($214 | 0) {
        if ((HEAP32[1216] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 3157
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 3161
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 3163
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 3171
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 3174
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 3176
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 3179
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 3183
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 3186
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 3188
      if ($37 | 0) {
       $234 = HEAP32[1217] | 0; //@line 3191
       $235 = $37 >>> 3; //@line 3192
       $237 = 4888 + ($235 << 1 << 2) | 0; //@line 3194
       $238 = 1 << $235; //@line 3195
       if (!($8 & $238)) {
        HEAP32[1212] = $8 | $238; //@line 3200
        $$0189$i = $237; //@line 3202
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 3202
       } else {
        $242 = $237 + 8 | 0; //@line 3204
        $243 = HEAP32[$242 >> 2] | 0; //@line 3205
        if ((HEAP32[1216] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 3209
        } else {
         $$0189$i = $243; //@line 3212
         $$pre$phi$iZ2D = $242; //@line 3212
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 3215
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 3217
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 3219
       HEAP32[$234 + 12 >> 2] = $237; //@line 3221
      }
      HEAP32[1214] = $$0193$lcssa$i; //@line 3223
      HEAP32[1217] = $159; //@line 3224
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 3227
     STACKTOP = sp; //@line 3228
     return $$0 | 0; //@line 3228
    }
   } else {
    $$0197 = $6; //@line 3231
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 3236
   } else {
    $251 = $0 + 11 | 0; //@line 3238
    $252 = $251 & -8; //@line 3239
    $253 = HEAP32[1213] | 0; //@line 3240
    if (!$253) {
     $$0197 = $252; //@line 3243
    } else {
     $255 = 0 - $252 | 0; //@line 3245
     $256 = $251 >>> 8; //@line 3246
     if (!$256) {
      $$0358$i = 0; //@line 3249
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 3253
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 3257
       $262 = $256 << $261; //@line 3258
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 3261
       $267 = $262 << $265; //@line 3263
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 3266
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 3271
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 3277
      }
     }
     $282 = HEAP32[5152 + ($$0358$i << 2) >> 2] | 0; //@line 3281
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 3285
       $$3$i203 = 0; //@line 3285
       $$3350$i = $255; //@line 3285
       label = 81; //@line 3286
      } else {
       $$0342$i = 0; //@line 3293
       $$0347$i = $255; //@line 3293
       $$0353$i = $282; //@line 3293
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 3293
       $$0362$i = 0; //@line 3293
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 3298
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 3303
          $$435113$i = 0; //@line 3303
          $$435712$i = $$0353$i; //@line 3303
          label = 85; //@line 3304
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 3307
          $$1348$i = $292; //@line 3307
         }
        } else {
         $$1343$i = $$0342$i; //@line 3310
         $$1348$i = $$0347$i; //@line 3310
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 3313
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 3316
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 3320
        $302 = ($$0353$i | 0) == 0; //@line 3321
        if ($302) {
         $$2355$i = $$1363$i; //@line 3326
         $$3$i203 = $$1343$i; //@line 3326
         $$3350$i = $$1348$i; //@line 3326
         label = 81; //@line 3327
         break;
        } else {
         $$0342$i = $$1343$i; //@line 3330
         $$0347$i = $$1348$i; //@line 3330
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 3330
         $$0362$i = $$1363$i; //@line 3330
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 3340
       $309 = $253 & ($306 | 0 - $306); //@line 3343
       if (!$309) {
        $$0197 = $252; //@line 3346
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 3351
       $315 = $313 >>> 12 & 16; //@line 3353
       $316 = $313 >>> $315; //@line 3354
       $318 = $316 >>> 5 & 8; //@line 3356
       $320 = $316 >>> $318; //@line 3358
       $322 = $320 >>> 2 & 4; //@line 3360
       $324 = $320 >>> $322; //@line 3362
       $326 = $324 >>> 1 & 2; //@line 3364
       $328 = $324 >>> $326; //@line 3366
       $330 = $328 >>> 1 & 1; //@line 3368
       $$4$ph$i = 0; //@line 3374
       $$4357$ph$i = HEAP32[5152 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 3374
      } else {
       $$4$ph$i = $$3$i203; //@line 3376
       $$4357$ph$i = $$2355$i; //@line 3376
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 3380
       $$4351$lcssa$i = $$3350$i; //@line 3380
      } else {
       $$414$i = $$4$ph$i; //@line 3382
       $$435113$i = $$3350$i; //@line 3382
       $$435712$i = $$4357$ph$i; //@line 3382
       label = 85; //@line 3383
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 3388
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 3392
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 3393
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 3394
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 3395
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 3401
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 3404
        $$4351$lcssa$i = $$$4351$i; //@line 3404
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 3407
        $$435113$i = $$$4351$i; //@line 3407
        label = 85; //@line 3408
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 3414
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1214] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1216] | 0; //@line 3420
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 3423
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 3426
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 3429
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 3433
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 3435
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 3439
         $371 = HEAP32[$370 >> 2] | 0; //@line 3440
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 3443
          $374 = HEAP32[$373 >> 2] | 0; //@line 3444
          if (!$374) {
           $$3372$i = 0; //@line 3447
           break;
          } else {
           $$1370$i = $374; //@line 3450
           $$1374$i = $373; //@line 3450
          }
         } else {
          $$1370$i = $371; //@line 3453
          $$1374$i = $370; //@line 3453
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 3456
          $377 = HEAP32[$376 >> 2] | 0; //@line 3457
          if ($377 | 0) {
           $$1370$i = $377; //@line 3460
           $$1374$i = $376; //@line 3460
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 3463
          $380 = HEAP32[$379 >> 2] | 0; //@line 3464
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 3469
           $$1374$i = $379; //@line 3469
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 3474
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 3477
          $$3372$i = $$1370$i; //@line 3478
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 3483
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 3486
         }
         $364 = $362 + 12 | 0; //@line 3489
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 3493
         }
         $367 = $359 + 8 | 0; //@line 3496
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 3500
          HEAP32[$367 >> 2] = $362; //@line 3501
          $$3372$i = $359; //@line 3502
          break;
         } else {
          _abort(); //@line 3505
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 3513
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 3516
         $386 = 5152 + ($385 << 2) | 0; //@line 3517
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 3522
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 3527
            HEAP32[1213] = $391; //@line 3528
            $475 = $391; //@line 3529
            break L164;
           }
          } else {
           if ((HEAP32[1216] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 3536
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 3544
            if (!$$3372$i) {
             $475 = $253; //@line 3547
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1216] | 0; //@line 3555
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 3558
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 3562
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 3564
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 3570
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 3574
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 3576
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 3582
         if (!$409) {
          $475 = $253; //@line 3585
         } else {
          if ((HEAP32[1216] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 3590
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 3594
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 3596
           $475 = $253; //@line 3597
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 3606
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 3609
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 3611
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 3614
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 3618
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 3621
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 3623
         $428 = $$4351$lcssa$i >>> 3; //@line 3624
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 4888 + ($428 << 1 << 2) | 0; //@line 3628
          $432 = HEAP32[1212] | 0; //@line 3629
          $433 = 1 << $428; //@line 3630
          if (!($432 & $433)) {
           HEAP32[1212] = $432 | $433; //@line 3635
           $$0368$i = $431; //@line 3637
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 3637
          } else {
           $437 = $431 + 8 | 0; //@line 3639
           $438 = HEAP32[$437 >> 2] | 0; //@line 3640
           if ((HEAP32[1216] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 3644
           } else {
            $$0368$i = $438; //@line 3647
            $$pre$phi$i211Z2D = $437; //@line 3647
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 3650
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 3652
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 3654
          HEAP32[$354 + 12 >> 2] = $431; //@line 3656
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 3659
         if (!$444) {
          $$0361$i = 0; //@line 3662
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 3666
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 3670
           $450 = $444 << $449; //@line 3671
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 3674
           $455 = $450 << $453; //@line 3676
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 3679
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 3684
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 3690
          }
         }
         $469 = 5152 + ($$0361$i << 2) | 0; //@line 3693
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 3695
         $471 = $354 + 16 | 0; //@line 3696
         HEAP32[$471 + 4 >> 2] = 0; //@line 3698
         HEAP32[$471 >> 2] = 0; //@line 3699
         $473 = 1 << $$0361$i; //@line 3700
         if (!($475 & $473)) {
          HEAP32[1213] = $475 | $473; //@line 3705
          HEAP32[$469 >> 2] = $354; //@line 3706
          HEAP32[$354 + 24 >> 2] = $469; //@line 3708
          HEAP32[$354 + 12 >> 2] = $354; //@line 3710
          HEAP32[$354 + 8 >> 2] = $354; //@line 3712
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 3721
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 3721
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 3728
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 3732
          $494 = HEAP32[$492 >> 2] | 0; //@line 3734
          if (!$494) {
           label = 136; //@line 3737
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 3740
           $$0345$i = $494; //@line 3740
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1216] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 3747
          } else {
           HEAP32[$492 >> 2] = $354; //@line 3750
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 3752
           HEAP32[$354 + 12 >> 2] = $354; //@line 3754
           HEAP32[$354 + 8 >> 2] = $354; //@line 3756
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 3761
          $502 = HEAP32[$501 >> 2] | 0; //@line 3762
          $503 = HEAP32[1216] | 0; //@line 3763
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 3769
           HEAP32[$501 >> 2] = $354; //@line 3770
           HEAP32[$354 + 8 >> 2] = $502; //@line 3772
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 3774
           HEAP32[$354 + 24 >> 2] = 0; //@line 3776
           break;
          } else {
           _abort(); //@line 3779
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 3786
       STACKTOP = sp; //@line 3787
       return $$0 | 0; //@line 3787
      } else {
       $$0197 = $252; //@line 3789
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1214] | 0; //@line 3796
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 3799
  $515 = HEAP32[1217] | 0; //@line 3800
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 3803
   HEAP32[1217] = $517; //@line 3804
   HEAP32[1214] = $514; //@line 3805
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 3808
   HEAP32[$515 + $512 >> 2] = $514; //@line 3810
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 3813
  } else {
   HEAP32[1214] = 0; //@line 3815
   HEAP32[1217] = 0; //@line 3816
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 3819
   $526 = $515 + $512 + 4 | 0; //@line 3821
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 3824
  }
  $$0 = $515 + 8 | 0; //@line 3827
  STACKTOP = sp; //@line 3828
  return $$0 | 0; //@line 3828
 }
 $530 = HEAP32[1215] | 0; //@line 3830
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 3833
  HEAP32[1215] = $532; //@line 3834
  $533 = HEAP32[1218] | 0; //@line 3835
  $534 = $533 + $$0197 | 0; //@line 3836
  HEAP32[1218] = $534; //@line 3837
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 3840
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 3843
  $$0 = $533 + 8 | 0; //@line 3845
  STACKTOP = sp; //@line 3846
  return $$0 | 0; //@line 3846
 }
 if (!(HEAP32[1330] | 0)) {
  HEAP32[1332] = 4096; //@line 3851
  HEAP32[1331] = 4096; //@line 3852
  HEAP32[1333] = -1; //@line 3853
  HEAP32[1334] = -1; //@line 3854
  HEAP32[1335] = 0; //@line 3855
  HEAP32[1323] = 0; //@line 3856
  HEAP32[1330] = $1 & -16 ^ 1431655768; //@line 3860
  $548 = 4096; //@line 3861
 } else {
  $548 = HEAP32[1332] | 0; //@line 3864
 }
 $545 = $$0197 + 48 | 0; //@line 3866
 $546 = $$0197 + 47 | 0; //@line 3867
 $547 = $548 + $546 | 0; //@line 3868
 $549 = 0 - $548 | 0; //@line 3869
 $550 = $547 & $549; //@line 3870
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 3873
  STACKTOP = sp; //@line 3874
  return $$0 | 0; //@line 3874
 }
 $552 = HEAP32[1322] | 0; //@line 3876
 if ($552 | 0) {
  $554 = HEAP32[1320] | 0; //@line 3879
  $555 = $554 + $550 | 0; //@line 3880
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 3885
   STACKTOP = sp; //@line 3886
   return $$0 | 0; //@line 3886
  }
 }
 L244 : do {
  if (!(HEAP32[1323] & 4)) {
   $561 = HEAP32[1218] | 0; //@line 3894
   L246 : do {
    if (!$561) {
     label = 163; //@line 3898
    } else {
     $$0$i$i = 5296; //@line 3900
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 3902
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 3905
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 3914
      if (!$570) {
       label = 163; //@line 3917
       break L246;
      } else {
       $$0$i$i = $570; //@line 3920
      }
     }
     $595 = $547 - $530 & $549; //@line 3924
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 3927
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 3935
       } else {
        $$723947$i = $595; //@line 3937
        $$748$i = $597; //@line 3937
        label = 180; //@line 3938
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 3942
       $$2253$ph$i = $595; //@line 3942
       label = 171; //@line 3943
      }
     } else {
      $$2234243136$i = 0; //@line 3946
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 3952
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 3955
     } else {
      $574 = $572; //@line 3957
      $575 = HEAP32[1331] | 0; //@line 3958
      $576 = $575 + -1 | 0; //@line 3959
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 3967
      $584 = HEAP32[1320] | 0; //@line 3968
      $585 = $$$i + $584 | 0; //@line 3969
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1322] | 0; //@line 3974
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 3981
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 3985
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 3988
        $$748$i = $572; //@line 3988
        label = 180; //@line 3989
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 3992
        $$2253$ph$i = $$$i; //@line 3992
        label = 171; //@line 3993
       }
      } else {
       $$2234243136$i = 0; //@line 3996
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 4003
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 4012
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 4015
       $$748$i = $$2247$ph$i; //@line 4015
       label = 180; //@line 4016
       break L244;
      }
     }
     $607 = HEAP32[1332] | 0; //@line 4020
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 4024
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 4027
      $$748$i = $$2247$ph$i; //@line 4027
      label = 180; //@line 4028
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 4034
      $$2234243136$i = 0; //@line 4035
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 4039
      $$748$i = $$2247$ph$i; //@line 4039
      label = 180; //@line 4040
      break L244;
     }
    }
   } while (0);
   HEAP32[1323] = HEAP32[1323] | 4; //@line 4047
   $$4236$i = $$2234243136$i; //@line 4048
   label = 178; //@line 4049
  } else {
   $$4236$i = 0; //@line 4051
   label = 178; //@line 4052
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 4058
   $621 = _sbrk(0) | 0; //@line 4059
   $627 = $621 - $620 | 0; //@line 4067
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 4069
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 4077
    $$748$i = $620; //@line 4077
    label = 180; //@line 4078
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1320] | 0) + $$723947$i | 0; //@line 4084
  HEAP32[1320] = $633; //@line 4085
  if ($633 >>> 0 > (HEAP32[1321] | 0) >>> 0) {
   HEAP32[1321] = $633; //@line 4089
  }
  $636 = HEAP32[1218] | 0; //@line 4091
  do {
   if (!$636) {
    $638 = HEAP32[1216] | 0; //@line 4095
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1216] = $$748$i; //@line 4100
    }
    HEAP32[1324] = $$748$i; //@line 4102
    HEAP32[1325] = $$723947$i; //@line 4103
    HEAP32[1327] = 0; //@line 4104
    HEAP32[1221] = HEAP32[1330]; //@line 4106
    HEAP32[1220] = -1; //@line 4107
    HEAP32[1225] = 4888; //@line 4108
    HEAP32[1224] = 4888; //@line 4109
    HEAP32[1227] = 4896; //@line 4110
    HEAP32[1226] = 4896; //@line 4111
    HEAP32[1229] = 4904; //@line 4112
    HEAP32[1228] = 4904; //@line 4113
    HEAP32[1231] = 4912; //@line 4114
    HEAP32[1230] = 4912; //@line 4115
    HEAP32[1233] = 4920; //@line 4116
    HEAP32[1232] = 4920; //@line 4117
    HEAP32[1235] = 4928; //@line 4118
    HEAP32[1234] = 4928; //@line 4119
    HEAP32[1237] = 4936; //@line 4120
    HEAP32[1236] = 4936; //@line 4121
    HEAP32[1239] = 4944; //@line 4122
    HEAP32[1238] = 4944; //@line 4123
    HEAP32[1241] = 4952; //@line 4124
    HEAP32[1240] = 4952; //@line 4125
    HEAP32[1243] = 4960; //@line 4126
    HEAP32[1242] = 4960; //@line 4127
    HEAP32[1245] = 4968; //@line 4128
    HEAP32[1244] = 4968; //@line 4129
    HEAP32[1247] = 4976; //@line 4130
    HEAP32[1246] = 4976; //@line 4131
    HEAP32[1249] = 4984; //@line 4132
    HEAP32[1248] = 4984; //@line 4133
    HEAP32[1251] = 4992; //@line 4134
    HEAP32[1250] = 4992; //@line 4135
    HEAP32[1253] = 5e3; //@line 4136
    HEAP32[1252] = 5e3; //@line 4137
    HEAP32[1255] = 5008; //@line 4138
    HEAP32[1254] = 5008; //@line 4139
    HEAP32[1257] = 5016; //@line 4140
    HEAP32[1256] = 5016; //@line 4141
    HEAP32[1259] = 5024; //@line 4142
    HEAP32[1258] = 5024; //@line 4143
    HEAP32[1261] = 5032; //@line 4144
    HEAP32[1260] = 5032; //@line 4145
    HEAP32[1263] = 5040; //@line 4146
    HEAP32[1262] = 5040; //@line 4147
    HEAP32[1265] = 5048; //@line 4148
    HEAP32[1264] = 5048; //@line 4149
    HEAP32[1267] = 5056; //@line 4150
    HEAP32[1266] = 5056; //@line 4151
    HEAP32[1269] = 5064; //@line 4152
    HEAP32[1268] = 5064; //@line 4153
    HEAP32[1271] = 5072; //@line 4154
    HEAP32[1270] = 5072; //@line 4155
    HEAP32[1273] = 5080; //@line 4156
    HEAP32[1272] = 5080; //@line 4157
    HEAP32[1275] = 5088; //@line 4158
    HEAP32[1274] = 5088; //@line 4159
    HEAP32[1277] = 5096; //@line 4160
    HEAP32[1276] = 5096; //@line 4161
    HEAP32[1279] = 5104; //@line 4162
    HEAP32[1278] = 5104; //@line 4163
    HEAP32[1281] = 5112; //@line 4164
    HEAP32[1280] = 5112; //@line 4165
    HEAP32[1283] = 5120; //@line 4166
    HEAP32[1282] = 5120; //@line 4167
    HEAP32[1285] = 5128; //@line 4168
    HEAP32[1284] = 5128; //@line 4169
    HEAP32[1287] = 5136; //@line 4170
    HEAP32[1286] = 5136; //@line 4171
    $642 = $$723947$i + -40 | 0; //@line 4172
    $644 = $$748$i + 8 | 0; //@line 4174
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 4179
    $650 = $$748$i + $649 | 0; //@line 4180
    $651 = $642 - $649 | 0; //@line 4181
    HEAP32[1218] = $650; //@line 4182
    HEAP32[1215] = $651; //@line 4183
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 4186
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 4189
    HEAP32[1219] = HEAP32[1334]; //@line 4191
   } else {
    $$024367$i = 5296; //@line 4193
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 4195
     $658 = $$024367$i + 4 | 0; //@line 4196
     $659 = HEAP32[$658 >> 2] | 0; //@line 4197
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 4201
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 4205
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 4210
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 4224
       $673 = (HEAP32[1215] | 0) + $$723947$i | 0; //@line 4226
       $675 = $636 + 8 | 0; //@line 4228
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 4233
       $681 = $636 + $680 | 0; //@line 4234
       $682 = $673 - $680 | 0; //@line 4235
       HEAP32[1218] = $681; //@line 4236
       HEAP32[1215] = $682; //@line 4237
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 4240
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 4243
       HEAP32[1219] = HEAP32[1334]; //@line 4245
       break;
      }
     }
    }
    $688 = HEAP32[1216] | 0; //@line 4250
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1216] = $$748$i; //@line 4253
     $753 = $$748$i; //@line 4254
    } else {
     $753 = $688; //@line 4256
    }
    $690 = $$748$i + $$723947$i | 0; //@line 4258
    $$124466$i = 5296; //@line 4259
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 4264
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 4268
     if (!$694) {
      $$0$i$i$i = 5296; //@line 4271
      break;
     } else {
      $$124466$i = $694; //@line 4274
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 4283
      $700 = $$124466$i + 4 | 0; //@line 4284
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 4287
      $704 = $$748$i + 8 | 0; //@line 4289
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 4295
      $712 = $690 + 8 | 0; //@line 4297
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 4303
      $722 = $710 + $$0197 | 0; //@line 4307
      $723 = $718 - $710 - $$0197 | 0; //@line 4308
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 4311
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1215] | 0) + $723 | 0; //@line 4316
        HEAP32[1215] = $728; //@line 4317
        HEAP32[1218] = $722; //@line 4318
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 4321
       } else {
        if ((HEAP32[1217] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1214] | 0) + $723 | 0; //@line 4327
         HEAP32[1214] = $734; //@line 4328
         HEAP32[1217] = $722; //@line 4329
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 4332
         HEAP32[$722 + $734 >> 2] = $734; //@line 4334
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 4338
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 4342
         $743 = $739 >>> 3; //@line 4343
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 4348
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 4350
           $750 = 4888 + ($743 << 1 << 2) | 0; //@line 4352
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 4358
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 4367
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1212] = HEAP32[1212] & ~(1 << $743); //@line 4377
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 4384
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 4388
             }
             $764 = $748 + 8 | 0; //@line 4391
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 4395
              break;
             }
             _abort(); //@line 4398
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 4403
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 4404
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 4407
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 4409
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 4413
             $783 = $782 + 4 | 0; //@line 4414
             $784 = HEAP32[$783 >> 2] | 0; //@line 4415
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 4418
              if (!$786) {
               $$3$i$i = 0; //@line 4421
               break;
              } else {
               $$1291$i$i = $786; //@line 4424
               $$1293$i$i = $782; //@line 4424
              }
             } else {
              $$1291$i$i = $784; //@line 4427
              $$1293$i$i = $783; //@line 4427
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 4430
              $789 = HEAP32[$788 >> 2] | 0; //@line 4431
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 4434
               $$1293$i$i = $788; //@line 4434
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 4437
              $792 = HEAP32[$791 >> 2] | 0; //@line 4438
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 4443
               $$1293$i$i = $791; //@line 4443
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 4448
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 4451
              $$3$i$i = $$1291$i$i; //@line 4452
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 4457
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 4460
             }
             $776 = $774 + 12 | 0; //@line 4463
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 4467
             }
             $779 = $771 + 8 | 0; //@line 4470
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 4474
              HEAP32[$779 >> 2] = $774; //@line 4475
              $$3$i$i = $771; //@line 4476
              break;
             } else {
              _abort(); //@line 4479
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 4489
           $798 = 5152 + ($797 << 2) | 0; //@line 4490
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 4495
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1213] = HEAP32[1213] & ~(1 << $797); //@line 4504
             break L311;
            } else {
             if ((HEAP32[1216] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 4510
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 4518
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1216] | 0; //@line 4528
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 4531
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 4535
           $815 = $718 + 16 | 0; //@line 4536
           $816 = HEAP32[$815 >> 2] | 0; //@line 4537
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 4543
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 4547
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 4549
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 4555
           if (!$822) {
            break;
           }
           if ((HEAP32[1216] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 4563
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 4567
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 4569
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 4576
         $$0287$i$i = $742 + $723 | 0; //@line 4576
        } else {
         $$0$i17$i = $718; //@line 4578
         $$0287$i$i = $723; //@line 4578
        }
        $830 = $$0$i17$i + 4 | 0; //@line 4580
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 4583
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 4586
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 4588
        $836 = $$0287$i$i >>> 3; //@line 4589
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 4888 + ($836 << 1 << 2) | 0; //@line 4593
         $840 = HEAP32[1212] | 0; //@line 4594
         $841 = 1 << $836; //@line 4595
         do {
          if (!($840 & $841)) {
           HEAP32[1212] = $840 | $841; //@line 4601
           $$0295$i$i = $839; //@line 4603
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 4603
          } else {
           $845 = $839 + 8 | 0; //@line 4605
           $846 = HEAP32[$845 >> 2] | 0; //@line 4606
           if ((HEAP32[1216] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 4610
            $$pre$phi$i19$iZ2D = $845; //@line 4610
            break;
           }
           _abort(); //@line 4613
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 4617
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 4619
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 4621
         HEAP32[$722 + 12 >> 2] = $839; //@line 4623
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 4626
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 4630
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 4634
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 4639
          $858 = $852 << $857; //@line 4640
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 4643
          $863 = $858 << $861; //@line 4645
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 4648
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 4653
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 4659
         }
        } while (0);
        $877 = 5152 + ($$0296$i$i << 2) | 0; //@line 4662
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 4664
        $879 = $722 + 16 | 0; //@line 4665
        HEAP32[$879 + 4 >> 2] = 0; //@line 4667
        HEAP32[$879 >> 2] = 0; //@line 4668
        $881 = HEAP32[1213] | 0; //@line 4669
        $882 = 1 << $$0296$i$i; //@line 4670
        if (!($881 & $882)) {
         HEAP32[1213] = $881 | $882; //@line 4675
         HEAP32[$877 >> 2] = $722; //@line 4676
         HEAP32[$722 + 24 >> 2] = $877; //@line 4678
         HEAP32[$722 + 12 >> 2] = $722; //@line 4680
         HEAP32[$722 + 8 >> 2] = $722; //@line 4682
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 4691
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 4691
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 4698
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 4702
         $902 = HEAP32[$900 >> 2] | 0; //@line 4704
         if (!$902) {
          label = 260; //@line 4707
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 4710
          $$0289$i$i = $902; //@line 4710
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1216] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 4717
         } else {
          HEAP32[$900 >> 2] = $722; //@line 4720
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 4722
          HEAP32[$722 + 12 >> 2] = $722; //@line 4724
          HEAP32[$722 + 8 >> 2] = $722; //@line 4726
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 4731
         $910 = HEAP32[$909 >> 2] | 0; //@line 4732
         $911 = HEAP32[1216] | 0; //@line 4733
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 4739
          HEAP32[$909 >> 2] = $722; //@line 4740
          HEAP32[$722 + 8 >> 2] = $910; //@line 4742
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 4744
          HEAP32[$722 + 24 >> 2] = 0; //@line 4746
          break;
         } else {
          _abort(); //@line 4749
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 4756
      STACKTOP = sp; //@line 4757
      return $$0 | 0; //@line 4757
     } else {
      $$0$i$i$i = 5296; //@line 4759
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 4763
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 4768
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 4776
    }
    $927 = $923 + -47 | 0; //@line 4778
    $929 = $927 + 8 | 0; //@line 4780
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 4786
    $936 = $636 + 16 | 0; //@line 4787
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 4789
    $939 = $938 + 8 | 0; //@line 4790
    $940 = $938 + 24 | 0; //@line 4791
    $941 = $$723947$i + -40 | 0; //@line 4792
    $943 = $$748$i + 8 | 0; //@line 4794
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 4799
    $949 = $$748$i + $948 | 0; //@line 4800
    $950 = $941 - $948 | 0; //@line 4801
    HEAP32[1218] = $949; //@line 4802
    HEAP32[1215] = $950; //@line 4803
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 4806
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 4809
    HEAP32[1219] = HEAP32[1334]; //@line 4811
    $956 = $938 + 4 | 0; //@line 4812
    HEAP32[$956 >> 2] = 27; //@line 4813
    HEAP32[$939 >> 2] = HEAP32[1324]; //@line 4814
    HEAP32[$939 + 4 >> 2] = HEAP32[1325]; //@line 4814
    HEAP32[$939 + 8 >> 2] = HEAP32[1326]; //@line 4814
    HEAP32[$939 + 12 >> 2] = HEAP32[1327]; //@line 4814
    HEAP32[1324] = $$748$i; //@line 4815
    HEAP32[1325] = $$723947$i; //@line 4816
    HEAP32[1327] = 0; //@line 4817
    HEAP32[1326] = $939; //@line 4818
    $958 = $940; //@line 4819
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 4821
     HEAP32[$958 >> 2] = 7; //@line 4822
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 4835
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 4838
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 4841
     HEAP32[$938 >> 2] = $964; //@line 4842
     $969 = $964 >>> 3; //@line 4843
     if ($964 >>> 0 < 256) {
      $972 = 4888 + ($969 << 1 << 2) | 0; //@line 4847
      $973 = HEAP32[1212] | 0; //@line 4848
      $974 = 1 << $969; //@line 4849
      if (!($973 & $974)) {
       HEAP32[1212] = $973 | $974; //@line 4854
       $$0211$i$i = $972; //@line 4856
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 4856
      } else {
       $978 = $972 + 8 | 0; //@line 4858
       $979 = HEAP32[$978 >> 2] | 0; //@line 4859
       if ((HEAP32[1216] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 4863
       } else {
        $$0211$i$i = $979; //@line 4866
        $$pre$phi$i$iZ2D = $978; //@line 4866
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 4869
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 4871
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 4873
      HEAP32[$636 + 12 >> 2] = $972; //@line 4875
      break;
     }
     $985 = $964 >>> 8; //@line 4878
     if (!$985) {
      $$0212$i$i = 0; //@line 4881
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 4885
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 4889
       $991 = $985 << $990; //@line 4890
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 4893
       $996 = $991 << $994; //@line 4895
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 4898
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 4903
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 4909
      }
     }
     $1010 = 5152 + ($$0212$i$i << 2) | 0; //@line 4912
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 4914
     HEAP32[$636 + 20 >> 2] = 0; //@line 4916
     HEAP32[$936 >> 2] = 0; //@line 4917
     $1013 = HEAP32[1213] | 0; //@line 4918
     $1014 = 1 << $$0212$i$i; //@line 4919
     if (!($1013 & $1014)) {
      HEAP32[1213] = $1013 | $1014; //@line 4924
      HEAP32[$1010 >> 2] = $636; //@line 4925
      HEAP32[$636 + 24 >> 2] = $1010; //@line 4927
      HEAP32[$636 + 12 >> 2] = $636; //@line 4929
      HEAP32[$636 + 8 >> 2] = $636; //@line 4931
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 4940
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 4940
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 4947
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 4951
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 4953
      if (!$1034) {
       label = 286; //@line 4956
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 4959
       $$0207$i$i = $1034; //@line 4959
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1216] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 4966
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 4969
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 4971
       HEAP32[$636 + 12 >> 2] = $636; //@line 4973
       HEAP32[$636 + 8 >> 2] = $636; //@line 4975
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 4980
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 4981
      $1043 = HEAP32[1216] | 0; //@line 4982
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 4988
       HEAP32[$1041 >> 2] = $636; //@line 4989
       HEAP32[$636 + 8 >> 2] = $1042; //@line 4991
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 4993
       HEAP32[$636 + 24 >> 2] = 0; //@line 4995
       break;
      } else {
       _abort(); //@line 4998
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1215] | 0; //@line 5005
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 5008
   HEAP32[1215] = $1054; //@line 5009
   $1055 = HEAP32[1218] | 0; //@line 5010
   $1056 = $1055 + $$0197 | 0; //@line 5011
   HEAP32[1218] = $1056; //@line 5012
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 5015
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 5018
   $$0 = $1055 + 8 | 0; //@line 5020
   STACKTOP = sp; //@line 5021
   return $$0 | 0; //@line 5021
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 5025
 $$0 = 0; //@line 5026
 STACKTOP = sp; //@line 5027
 return $$0 | 0; //@line 5027
}
function _equeue_dispatch__async_cb_51($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$03956$i = 0, $$03956$i$phi = 0, $$04055$i = 0, $$0405571$i = 0, $$04063$i = 0, $$04159$i = 0, $$04258$i = 0, $$057$i = 0, $$065 = 0, $$06790 = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val11 = 0, $$expand_i1_val13 = 0, $$expand_i1_val9 = 0, $$sink$in$i$i = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i73 = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i72 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $12 = 0, $127 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $150 = 0, $152 = 0, $153 = 0, $154 = 0, $156 = 0, $157 = 0, $16 = 0, $165 = 0, $166 = 0, $168 = 0, $171 = 0, $173 = 0, $176 = 0, $179 = 0, $18 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $190 = 0, $193 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $4 = 0, $44 = 0, $45 = 0, $48 = 0, $54 = 0, $6 = 0, $63 = 0, $66 = 0, $67 = 0, $69 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $93 = 0, $95 = 0, $98 = 0, $99 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0, $$04159$i$looptemp = 0, $$04258$i$looptemp = 0;
 sp = STACKTOP; //@line 1893
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1895
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1897
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1899
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1901
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1903
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1905
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1907
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 1910
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1912
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1914
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1916
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1918
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 1920
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 1922
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 1924
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 1926
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 1928
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 1930
 _equeue_mutex_lock($6); //@line 1931
 HEAP8[$22 >> 0] = (HEAPU8[$22 >> 0] | 0) + 1; //@line 1936
 if (((HEAP32[$24 >> 2] | 0) - $36 | 0) < 1) {
  HEAP32[$24 >> 2] = $36; //@line 1941
 }
 $44 = HEAP32[$28 >> 2] | 0; //@line 1943
 HEAP32[$30 >> 2] = $44; //@line 1944
 $45 = $44; //@line 1945
 L6 : do {
  if (!$44) {
   $$04055$i = $2; //@line 1949
   $54 = $45; //@line 1949
   label = 8; //@line 1950
  } else {
   $$04063$i = $2; //@line 1952
   $48 = $45; //@line 1952
   do {
    if (((HEAP32[$48 + 20 >> 2] | 0) - $36 | 0) >= 1) {
     $$04055$i = $$04063$i; //@line 1959
     $54 = $48; //@line 1959
     label = 8; //@line 1960
     break L6;
    }
    $$04063$i = $48 + 8 | 0; //@line 1963
    $48 = HEAP32[$$04063$i >> 2] | 0; //@line 1964
   } while (($48 | 0) != 0);
   HEAP32[$4 >> 2] = 0; //@line 1972
   $$0405571$i = $$04063$i; //@line 1973
  }
 } while (0);
 if ((label | 0) == 8) {
  HEAP32[$4 >> 2] = $54; //@line 1977
  if (!$54) {
   $$0405571$i = $$04055$i; //@line 1980
  } else {
   HEAP32[$54 + 16 >> 2] = $4; //@line 1983
   $$0405571$i = $$04055$i; //@line 1984
  }
 }
 HEAP32[$$0405571$i >> 2] = 0; //@line 1987
 _equeue_mutex_unlock($6); //@line 1988
 $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i72 = HEAP32[$2 >> 2] | 0; //@line 1989
 L15 : do {
  if (!$$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i72) {} else {
   $$04159$i = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i72; //@line 1994
   $$04258$i = $2; //@line 1994
   do {
    $$04258$i$looptemp = $$04258$i;
    $$04258$i = $$04159$i + 8 | 0; //@line 1996
    $$04159$i$looptemp = $$04159$i;
    $$04159$i = HEAP32[$$04258$i >> 2] | 0; //@line 1997
    $$03956$i = 0; //@line 1998
    $$057$i = $$04159$i$looptemp; //@line 1998
    while (1) {
     HEAP32[$$057$i + 8 >> 2] = $$03956$i; //@line 2001
     $63 = HEAP32[$$057$i + 12 >> 2] | 0; //@line 2003
     if (!$63) {
      break;
     } else {
      $$03956$i$phi = $$057$i; //@line 2008
      $$057$i = $63; //@line 2008
      $$03956$i = $$03956$i$phi; //@line 2008
     }
    }
    HEAP32[$$04258$i$looptemp >> 2] = $$057$i; //@line 2011
   } while (($$04159$i | 0) != 0);
   $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i73 = HEAP32[$2 >> 2] | 0; //@line 2019
   if ($$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i73 | 0) {
    $$06790 = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i73; //@line 2022
    while (1) {
     $66 = $$06790 + 8 | 0; //@line 2024
     $67 = HEAP32[$66 >> 2] | 0; //@line 2025
     $69 = HEAP32[$$06790 + 32 >> 2] | 0; //@line 2027
     if ($69 | 0) {
      label = 17; //@line 2030
      break;
     }
     $93 = HEAP32[$$06790 + 24 >> 2] | 0; //@line 2034
     if (($93 | 0) > -1) {
      label = 21; //@line 2037
      break;
     }
     $117 = $$06790 + 4 | 0; //@line 2041
     $118 = HEAP8[$117 >> 0] | 0; //@line 2042
     HEAP8[$117 >> 0] = (($118 + 1 & 255) << HEAP32[$34 >> 2] | 0) == 0 ? 1 : ($118 & 255) + 1 & 255; //@line 2051
     $127 = HEAP32[$$06790 + 28 >> 2] | 0; //@line 2053
     if ($127 | 0) {
      label = 25; //@line 2056
      break;
     }
     _equeue_mutex_lock($20); //@line 2059
     $150 = HEAP32[$32 >> 2] | 0; //@line 2060
     L28 : do {
      if (!$150) {
       $$02329$i$i = $32; //@line 2064
       label = 34; //@line 2065
      } else {
       $152 = HEAP32[$$06790 >> 2] | 0; //@line 2067
       $$025$i$i = $32; //@line 2068
       $154 = $150; //@line 2068
       while (1) {
        $153 = HEAP32[$154 >> 2] | 0; //@line 2070
        if ($153 >>> 0 >= $152 >>> 0) {
         break;
        }
        $156 = $154 + 8 | 0; //@line 2075
        $157 = HEAP32[$156 >> 2] | 0; //@line 2076
        if (!$157) {
         $$02329$i$i = $156; //@line 2079
         label = 34; //@line 2080
         break L28;
        } else {
         $$025$i$i = $156; //@line 2083
         $154 = $157; //@line 2083
        }
       }
       if (($153 | 0) == ($152 | 0)) {
        HEAP32[$$06790 + 12 >> 2] = $154; //@line 2089
        $$02330$i$i = $$025$i$i; //@line 2092
        $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 2092
       } else {
        $$02329$i$i = $$025$i$i; //@line 2094
        label = 34; //@line 2095
       }
      }
     } while (0);
     if ((label | 0) == 34) {
      label = 0; //@line 2100
      HEAP32[$$06790 + 12 >> 2] = 0; //@line 2102
      $$02330$i$i = $$02329$i$i; //@line 2103
      $$sink$in$i$i = $$02329$i$i; //@line 2103
     }
     HEAP32[$66 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 2106
     HEAP32[$$02330$i$i >> 2] = $$06790; //@line 2107
     _equeue_mutex_unlock($20); //@line 2108
     if (!$67) {
      break L15;
     } else {
      $$06790 = $67; //@line 2113
     }
    }
    if ((label | 0) == 17) {
     $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 2118
     FUNCTION_TABLE_vi[$69 & 127]($$06790 + 36 | 0); //@line 2119
     if (___async) {
      HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 2122
      $72 = $ReallocAsyncCtx + 4 | 0; //@line 2123
      HEAP32[$72 >> 2] = $6; //@line 2124
      $73 = $ReallocAsyncCtx + 8 | 0; //@line 2125
      HEAP32[$73 >> 2] = $8; //@line 2126
      $74 = $ReallocAsyncCtx + 12 | 0; //@line 2127
      HEAP32[$74 >> 2] = $10; //@line 2128
      $75 = $ReallocAsyncCtx + 16 | 0; //@line 2129
      HEAP32[$75 >> 2] = $2; //@line 2130
      $76 = $ReallocAsyncCtx + 20 | 0; //@line 2131
      HEAP32[$76 >> 2] = $4; //@line 2132
      $77 = $ReallocAsyncCtx + 24 | 0; //@line 2133
      HEAP32[$77 >> 2] = $12; //@line 2134
      $78 = $ReallocAsyncCtx + 28 | 0; //@line 2135
      HEAP32[$78 >> 2] = $14; //@line 2136
      $79 = $ReallocAsyncCtx + 32 | 0; //@line 2137
      $$expand_i1_val = $16 & 1; //@line 2138
      HEAP8[$79 >> 0] = $$expand_i1_val; //@line 2139
      $80 = $ReallocAsyncCtx + 36 | 0; //@line 2140
      HEAP32[$80 >> 2] = $18; //@line 2141
      $81 = $ReallocAsyncCtx + 40 | 0; //@line 2142
      HEAP32[$81 >> 2] = $66; //@line 2143
      $82 = $ReallocAsyncCtx + 44 | 0; //@line 2144
      HEAP32[$82 >> 2] = $$06790; //@line 2145
      $83 = $ReallocAsyncCtx + 48 | 0; //@line 2146
      HEAP32[$83 >> 2] = $20; //@line 2147
      $84 = $ReallocAsyncCtx + 52 | 0; //@line 2148
      HEAP32[$84 >> 2] = $22; //@line 2149
      $85 = $ReallocAsyncCtx + 56 | 0; //@line 2150
      HEAP32[$85 >> 2] = $24; //@line 2151
      $86 = $ReallocAsyncCtx + 60 | 0; //@line 2152
      HEAP32[$86 >> 2] = $67; //@line 2153
      $87 = $ReallocAsyncCtx + 64 | 0; //@line 2154
      HEAP32[$87 >> 2] = $26; //@line 2155
      $88 = $ReallocAsyncCtx + 68 | 0; //@line 2156
      HEAP32[$88 >> 2] = $28; //@line 2157
      $89 = $ReallocAsyncCtx + 72 | 0; //@line 2158
      HEAP32[$89 >> 2] = $30; //@line 2159
      $90 = $ReallocAsyncCtx + 76 | 0; //@line 2160
      HEAP32[$90 >> 2] = $32; //@line 2161
      $91 = $ReallocAsyncCtx + 80 | 0; //@line 2162
      HEAP32[$91 >> 2] = $34; //@line 2163
      sp = STACKTOP; //@line 2164
      return;
     }
     ___async_unwind = 0; //@line 2167
     HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 2168
     $72 = $ReallocAsyncCtx + 4 | 0; //@line 2169
     HEAP32[$72 >> 2] = $6; //@line 2170
     $73 = $ReallocAsyncCtx + 8 | 0; //@line 2171
     HEAP32[$73 >> 2] = $8; //@line 2172
     $74 = $ReallocAsyncCtx + 12 | 0; //@line 2173
     HEAP32[$74 >> 2] = $10; //@line 2174
     $75 = $ReallocAsyncCtx + 16 | 0; //@line 2175
     HEAP32[$75 >> 2] = $2; //@line 2176
     $76 = $ReallocAsyncCtx + 20 | 0; //@line 2177
     HEAP32[$76 >> 2] = $4; //@line 2178
     $77 = $ReallocAsyncCtx + 24 | 0; //@line 2179
     HEAP32[$77 >> 2] = $12; //@line 2180
     $78 = $ReallocAsyncCtx + 28 | 0; //@line 2181
     HEAP32[$78 >> 2] = $14; //@line 2182
     $79 = $ReallocAsyncCtx + 32 | 0; //@line 2183
     $$expand_i1_val = $16 & 1; //@line 2184
     HEAP8[$79 >> 0] = $$expand_i1_val; //@line 2185
     $80 = $ReallocAsyncCtx + 36 | 0; //@line 2186
     HEAP32[$80 >> 2] = $18; //@line 2187
     $81 = $ReallocAsyncCtx + 40 | 0; //@line 2188
     HEAP32[$81 >> 2] = $66; //@line 2189
     $82 = $ReallocAsyncCtx + 44 | 0; //@line 2190
     HEAP32[$82 >> 2] = $$06790; //@line 2191
     $83 = $ReallocAsyncCtx + 48 | 0; //@line 2192
     HEAP32[$83 >> 2] = $20; //@line 2193
     $84 = $ReallocAsyncCtx + 52 | 0; //@line 2194
     HEAP32[$84 >> 2] = $22; //@line 2195
     $85 = $ReallocAsyncCtx + 56 | 0; //@line 2196
     HEAP32[$85 >> 2] = $24; //@line 2197
     $86 = $ReallocAsyncCtx + 60 | 0; //@line 2198
     HEAP32[$86 >> 2] = $67; //@line 2199
     $87 = $ReallocAsyncCtx + 64 | 0; //@line 2200
     HEAP32[$87 >> 2] = $26; //@line 2201
     $88 = $ReallocAsyncCtx + 68 | 0; //@line 2202
     HEAP32[$88 >> 2] = $28; //@line 2203
     $89 = $ReallocAsyncCtx + 72 | 0; //@line 2204
     HEAP32[$89 >> 2] = $30; //@line 2205
     $90 = $ReallocAsyncCtx + 76 | 0; //@line 2206
     HEAP32[$90 >> 2] = $32; //@line 2207
     $91 = $ReallocAsyncCtx + 80 | 0; //@line 2208
     HEAP32[$91 >> 2] = $34; //@line 2209
     sp = STACKTOP; //@line 2210
     return;
    } else if ((label | 0) == 21) {
     $95 = $$06790 + 20 | 0; //@line 2214
     HEAP32[$95 >> 2] = (HEAP32[$95 >> 2] | 0) + $93; //@line 2217
     $98 = _equeue_tick() | 0; //@line 2218
     $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 2219
     _equeue_enqueue($14, $$06790, $98) | 0; //@line 2220
     if (___async) {
      HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 2223
      $99 = $ReallocAsyncCtx4 + 4 | 0; //@line 2224
      HEAP32[$99 >> 2] = $6; //@line 2225
      $100 = $ReallocAsyncCtx4 + 8 | 0; //@line 2226
      HEAP32[$100 >> 2] = $8; //@line 2227
      $101 = $ReallocAsyncCtx4 + 12 | 0; //@line 2228
      HEAP32[$101 >> 2] = $10; //@line 2229
      $102 = $ReallocAsyncCtx4 + 16 | 0; //@line 2230
      HEAP32[$102 >> 2] = $2; //@line 2231
      $103 = $ReallocAsyncCtx4 + 20 | 0; //@line 2232
      HEAP32[$103 >> 2] = $4; //@line 2233
      $104 = $ReallocAsyncCtx4 + 24 | 0; //@line 2234
      HEAP32[$104 >> 2] = $12; //@line 2235
      $105 = $ReallocAsyncCtx4 + 28 | 0; //@line 2236
      HEAP32[$105 >> 2] = $14; //@line 2237
      $106 = $ReallocAsyncCtx4 + 32 | 0; //@line 2238
      $$expand_i1_val9 = $16 & 1; //@line 2239
      HEAP8[$106 >> 0] = $$expand_i1_val9; //@line 2240
      $107 = $ReallocAsyncCtx4 + 36 | 0; //@line 2241
      HEAP32[$107 >> 2] = $18; //@line 2242
      $108 = $ReallocAsyncCtx4 + 40 | 0; //@line 2243
      HEAP32[$108 >> 2] = $20; //@line 2244
      $109 = $ReallocAsyncCtx4 + 44 | 0; //@line 2245
      HEAP32[$109 >> 2] = $22; //@line 2246
      $110 = $ReallocAsyncCtx4 + 48 | 0; //@line 2247
      HEAP32[$110 >> 2] = $24; //@line 2248
      $111 = $ReallocAsyncCtx4 + 52 | 0; //@line 2249
      HEAP32[$111 >> 2] = $67; //@line 2250
      $112 = $ReallocAsyncCtx4 + 56 | 0; //@line 2251
      HEAP32[$112 >> 2] = $26; //@line 2252
      $113 = $ReallocAsyncCtx4 + 60 | 0; //@line 2253
      HEAP32[$113 >> 2] = $28; //@line 2254
      $114 = $ReallocAsyncCtx4 + 64 | 0; //@line 2255
      HEAP32[$114 >> 2] = $30; //@line 2256
      $115 = $ReallocAsyncCtx4 + 68 | 0; //@line 2257
      HEAP32[$115 >> 2] = $32; //@line 2258
      $116 = $ReallocAsyncCtx4 + 72 | 0; //@line 2259
      HEAP32[$116 >> 2] = $34; //@line 2260
      sp = STACKTOP; //@line 2261
      return;
     }
     ___async_unwind = 0; //@line 2264
     HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 2265
     $99 = $ReallocAsyncCtx4 + 4 | 0; //@line 2266
     HEAP32[$99 >> 2] = $6; //@line 2267
     $100 = $ReallocAsyncCtx4 + 8 | 0; //@line 2268
     HEAP32[$100 >> 2] = $8; //@line 2269
     $101 = $ReallocAsyncCtx4 + 12 | 0; //@line 2270
     HEAP32[$101 >> 2] = $10; //@line 2271
     $102 = $ReallocAsyncCtx4 + 16 | 0; //@line 2272
     HEAP32[$102 >> 2] = $2; //@line 2273
     $103 = $ReallocAsyncCtx4 + 20 | 0; //@line 2274
     HEAP32[$103 >> 2] = $4; //@line 2275
     $104 = $ReallocAsyncCtx4 + 24 | 0; //@line 2276
     HEAP32[$104 >> 2] = $12; //@line 2277
     $105 = $ReallocAsyncCtx4 + 28 | 0; //@line 2278
     HEAP32[$105 >> 2] = $14; //@line 2279
     $106 = $ReallocAsyncCtx4 + 32 | 0; //@line 2280
     $$expand_i1_val9 = $16 & 1; //@line 2281
     HEAP8[$106 >> 0] = $$expand_i1_val9; //@line 2282
     $107 = $ReallocAsyncCtx4 + 36 | 0; //@line 2283
     HEAP32[$107 >> 2] = $18; //@line 2284
     $108 = $ReallocAsyncCtx4 + 40 | 0; //@line 2285
     HEAP32[$108 >> 2] = $20; //@line 2286
     $109 = $ReallocAsyncCtx4 + 44 | 0; //@line 2287
     HEAP32[$109 >> 2] = $22; //@line 2288
     $110 = $ReallocAsyncCtx4 + 48 | 0; //@line 2289
     HEAP32[$110 >> 2] = $24; //@line 2290
     $111 = $ReallocAsyncCtx4 + 52 | 0; //@line 2291
     HEAP32[$111 >> 2] = $67; //@line 2292
     $112 = $ReallocAsyncCtx4 + 56 | 0; //@line 2293
     HEAP32[$112 >> 2] = $26; //@line 2294
     $113 = $ReallocAsyncCtx4 + 60 | 0; //@line 2295
     HEAP32[$113 >> 2] = $28; //@line 2296
     $114 = $ReallocAsyncCtx4 + 64 | 0; //@line 2297
     HEAP32[$114 >> 2] = $30; //@line 2298
     $115 = $ReallocAsyncCtx4 + 68 | 0; //@line 2299
     HEAP32[$115 >> 2] = $32; //@line 2300
     $116 = $ReallocAsyncCtx4 + 72 | 0; //@line 2301
     HEAP32[$116 >> 2] = $34; //@line 2302
     sp = STACKTOP; //@line 2303
     return;
    } else if ((label | 0) == 25) {
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 2308
     FUNCTION_TABLE_vi[$127 & 127]($$06790 + 36 | 0); //@line 2309
     if (___async) {
      HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 2312
      $130 = $ReallocAsyncCtx2 + 4 | 0; //@line 2313
      HEAP32[$130 >> 2] = $6; //@line 2314
      $131 = $ReallocAsyncCtx2 + 8 | 0; //@line 2315
      HEAP32[$131 >> 2] = $8; //@line 2316
      $132 = $ReallocAsyncCtx2 + 12 | 0; //@line 2317
      HEAP32[$132 >> 2] = $10; //@line 2318
      $133 = $ReallocAsyncCtx2 + 16 | 0; //@line 2319
      HEAP32[$133 >> 2] = $2; //@line 2320
      $134 = $ReallocAsyncCtx2 + 20 | 0; //@line 2321
      HEAP32[$134 >> 2] = $4; //@line 2322
      $135 = $ReallocAsyncCtx2 + 24 | 0; //@line 2323
      HEAP32[$135 >> 2] = $12; //@line 2324
      $136 = $ReallocAsyncCtx2 + 28 | 0; //@line 2325
      HEAP32[$136 >> 2] = $14; //@line 2326
      $137 = $ReallocAsyncCtx2 + 32 | 0; //@line 2327
      $$expand_i1_val11 = $16 & 1; //@line 2328
      HEAP8[$137 >> 0] = $$expand_i1_val11; //@line 2329
      $138 = $ReallocAsyncCtx2 + 36 | 0; //@line 2330
      HEAP32[$138 >> 2] = $18; //@line 2331
      $139 = $ReallocAsyncCtx2 + 40 | 0; //@line 2332
      HEAP32[$139 >> 2] = $66; //@line 2333
      $140 = $ReallocAsyncCtx2 + 44 | 0; //@line 2334
      HEAP32[$140 >> 2] = $$06790; //@line 2335
      $141 = $ReallocAsyncCtx2 + 48 | 0; //@line 2336
      HEAP32[$141 >> 2] = $20; //@line 2337
      $142 = $ReallocAsyncCtx2 + 52 | 0; //@line 2338
      HEAP32[$142 >> 2] = $22; //@line 2339
      $143 = $ReallocAsyncCtx2 + 56 | 0; //@line 2340
      HEAP32[$143 >> 2] = $24; //@line 2341
      $144 = $ReallocAsyncCtx2 + 60 | 0; //@line 2342
      HEAP32[$144 >> 2] = $67; //@line 2343
      $145 = $ReallocAsyncCtx2 + 64 | 0; //@line 2344
      HEAP32[$145 >> 2] = $26; //@line 2345
      $146 = $ReallocAsyncCtx2 + 68 | 0; //@line 2346
      HEAP32[$146 >> 2] = $28; //@line 2347
      $147 = $ReallocAsyncCtx2 + 72 | 0; //@line 2348
      HEAP32[$147 >> 2] = $30; //@line 2349
      $148 = $ReallocAsyncCtx2 + 76 | 0; //@line 2350
      HEAP32[$148 >> 2] = $32; //@line 2351
      $149 = $ReallocAsyncCtx2 + 80 | 0; //@line 2352
      HEAP32[$149 >> 2] = $34; //@line 2353
      sp = STACKTOP; //@line 2354
      return;
     }
     ___async_unwind = 0; //@line 2357
     HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 2358
     $130 = $ReallocAsyncCtx2 + 4 | 0; //@line 2359
     HEAP32[$130 >> 2] = $6; //@line 2360
     $131 = $ReallocAsyncCtx2 + 8 | 0; //@line 2361
     HEAP32[$131 >> 2] = $8; //@line 2362
     $132 = $ReallocAsyncCtx2 + 12 | 0; //@line 2363
     HEAP32[$132 >> 2] = $10; //@line 2364
     $133 = $ReallocAsyncCtx2 + 16 | 0; //@line 2365
     HEAP32[$133 >> 2] = $2; //@line 2366
     $134 = $ReallocAsyncCtx2 + 20 | 0; //@line 2367
     HEAP32[$134 >> 2] = $4; //@line 2368
     $135 = $ReallocAsyncCtx2 + 24 | 0; //@line 2369
     HEAP32[$135 >> 2] = $12; //@line 2370
     $136 = $ReallocAsyncCtx2 + 28 | 0; //@line 2371
     HEAP32[$136 >> 2] = $14; //@line 2372
     $137 = $ReallocAsyncCtx2 + 32 | 0; //@line 2373
     $$expand_i1_val11 = $16 & 1; //@line 2374
     HEAP8[$137 >> 0] = $$expand_i1_val11; //@line 2375
     $138 = $ReallocAsyncCtx2 + 36 | 0; //@line 2376
     HEAP32[$138 >> 2] = $18; //@line 2377
     $139 = $ReallocAsyncCtx2 + 40 | 0; //@line 2378
     HEAP32[$139 >> 2] = $66; //@line 2379
     $140 = $ReallocAsyncCtx2 + 44 | 0; //@line 2380
     HEAP32[$140 >> 2] = $$06790; //@line 2381
     $141 = $ReallocAsyncCtx2 + 48 | 0; //@line 2382
     HEAP32[$141 >> 2] = $20; //@line 2383
     $142 = $ReallocAsyncCtx2 + 52 | 0; //@line 2384
     HEAP32[$142 >> 2] = $22; //@line 2385
     $143 = $ReallocAsyncCtx2 + 56 | 0; //@line 2386
     HEAP32[$143 >> 2] = $24; //@line 2387
     $144 = $ReallocAsyncCtx2 + 60 | 0; //@line 2388
     HEAP32[$144 >> 2] = $67; //@line 2389
     $145 = $ReallocAsyncCtx2 + 64 | 0; //@line 2390
     HEAP32[$145 >> 2] = $26; //@line 2391
     $146 = $ReallocAsyncCtx2 + 68 | 0; //@line 2392
     HEAP32[$146 >> 2] = $28; //@line 2393
     $147 = $ReallocAsyncCtx2 + 72 | 0; //@line 2394
     HEAP32[$147 >> 2] = $30; //@line 2395
     $148 = $ReallocAsyncCtx2 + 76 | 0; //@line 2396
     HEAP32[$148 >> 2] = $32; //@line 2397
     $149 = $ReallocAsyncCtx2 + 80 | 0; //@line 2398
     HEAP32[$149 >> 2] = $34; //@line 2399
     sp = STACKTOP; //@line 2400
     return;
    }
   }
  }
 } while (0);
 $165 = _equeue_tick() | 0; //@line 2406
 if ($16) {
  $166 = $18 - $165 | 0; //@line 2408
  if (($166 | 0) < 1) {
   $168 = $14 + 40 | 0; //@line 2411
   if (HEAP32[$168 >> 2] | 0) {
    _equeue_mutex_lock($6); //@line 2415
    $171 = HEAP32[$168 >> 2] | 0; //@line 2416
    if ($171 | 0) {
     $173 = HEAP32[$4 >> 2] | 0; //@line 2419
     if ($173 | 0) {
      $176 = HEAP32[$14 + 44 >> 2] | 0; //@line 2423
      $179 = (HEAP32[$173 + 20 >> 2] | 0) - $165 | 0; //@line 2426
      $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 2430
      FUNCTION_TABLE_vii[$171 & 3]($176, $179 & ~($179 >> 31)); //@line 2431
      if (___async) {
       HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 2434
       $183 = $ReallocAsyncCtx3 + 4 | 0; //@line 2435
       HEAP32[$183 >> 2] = $12; //@line 2436
       $184 = $ReallocAsyncCtx3 + 8 | 0; //@line 2437
       HEAP32[$184 >> 2] = $6; //@line 2438
       $185 = $ReallocAsyncCtx3 + 12 | 0; //@line 2439
       HEAP32[$185 >> 2] = $10; //@line 2440
       sp = STACKTOP; //@line 2441
       return;
      }
      ___async_unwind = 0; //@line 2444
      HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 2445
      $183 = $ReallocAsyncCtx3 + 4 | 0; //@line 2446
      HEAP32[$183 >> 2] = $12; //@line 2447
      $184 = $ReallocAsyncCtx3 + 8 | 0; //@line 2448
      HEAP32[$184 >> 2] = $6; //@line 2449
      $185 = $ReallocAsyncCtx3 + 12 | 0; //@line 2450
      HEAP32[$185 >> 2] = $10; //@line 2451
      sp = STACKTOP; //@line 2452
      return;
     }
    }
    HEAP8[$12 >> 0] = 1; //@line 2456
    _equeue_mutex_unlock($6); //@line 2457
   }
   HEAP8[$10 >> 0] = 0; //@line 2459
   return;
  } else {
   $$065 = $166; //@line 2462
  }
 } else {
  $$065 = -1; //@line 2465
 }
 _equeue_mutex_lock($6); //@line 2467
 $186 = HEAP32[$4 >> 2] | 0; //@line 2468
 if (!$186) {
  $$2 = $$065; //@line 2471
 } else {
  $190 = (HEAP32[$186 + 20 >> 2] | 0) - $165 | 0; //@line 2475
  $193 = $190 & ~($190 >> 31); //@line 2478
  $$2 = $193 >>> 0 < $$065 >>> 0 ? $193 : $$065; //@line 2481
 }
 _equeue_mutex_unlock($6); //@line 2483
 _equeue_sema_wait($8, $$2) | 0; //@line 2484
 do {
  if (HEAP8[$10 >> 0] | 0) {
   _equeue_mutex_lock($6); //@line 2489
   if (!(HEAP8[$10 >> 0] | 0)) {
    _equeue_mutex_unlock($6); //@line 2493
    break;
   }
   HEAP8[$10 >> 0] = 0; //@line 2496
   _equeue_mutex_unlock($6); //@line 2497
   return;
  }
 } while (0);
 $199 = _equeue_tick() | 0; //@line 2501
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 2502
 _wait_ms(20); //@line 2503
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 2506
  $200 = $ReallocAsyncCtx5 + 4 | 0; //@line 2507
  HEAP32[$200 >> 2] = $2; //@line 2508
  $201 = $ReallocAsyncCtx5 + 8 | 0; //@line 2509
  HEAP32[$201 >> 2] = $4; //@line 2510
  $202 = $ReallocAsyncCtx5 + 12 | 0; //@line 2511
  HEAP32[$202 >> 2] = $6; //@line 2512
  $203 = $ReallocAsyncCtx5 + 16 | 0; //@line 2513
  HEAP32[$203 >> 2] = $8; //@line 2514
  $204 = $ReallocAsyncCtx5 + 20 | 0; //@line 2515
  HEAP32[$204 >> 2] = $10; //@line 2516
  $205 = $ReallocAsyncCtx5 + 24 | 0; //@line 2517
  HEAP32[$205 >> 2] = $12; //@line 2518
  $206 = $ReallocAsyncCtx5 + 28 | 0; //@line 2519
  HEAP32[$206 >> 2] = $14; //@line 2520
  $207 = $ReallocAsyncCtx5 + 32 | 0; //@line 2521
  $$expand_i1_val13 = $16 & 1; //@line 2522
  HEAP8[$207 >> 0] = $$expand_i1_val13; //@line 2523
  $208 = $ReallocAsyncCtx5 + 36 | 0; //@line 2524
  HEAP32[$208 >> 2] = $18; //@line 2525
  $209 = $ReallocAsyncCtx5 + 40 | 0; //@line 2526
  HEAP32[$209 >> 2] = $20; //@line 2527
  $210 = $ReallocAsyncCtx5 + 44 | 0; //@line 2528
  HEAP32[$210 >> 2] = $22; //@line 2529
  $211 = $ReallocAsyncCtx5 + 48 | 0; //@line 2530
  HEAP32[$211 >> 2] = $24; //@line 2531
  $212 = $ReallocAsyncCtx5 + 52 | 0; //@line 2532
  HEAP32[$212 >> 2] = $26; //@line 2533
  $213 = $ReallocAsyncCtx5 + 56 | 0; //@line 2534
  HEAP32[$213 >> 2] = $28; //@line 2535
  $214 = $ReallocAsyncCtx5 + 60 | 0; //@line 2536
  HEAP32[$214 >> 2] = $30; //@line 2537
  $215 = $ReallocAsyncCtx5 + 64 | 0; //@line 2538
  HEAP32[$215 >> 2] = $32; //@line 2539
  $216 = $ReallocAsyncCtx5 + 68 | 0; //@line 2540
  HEAP32[$216 >> 2] = $34; //@line 2541
  $217 = $ReallocAsyncCtx5 + 72 | 0; //@line 2542
  HEAP32[$217 >> 2] = $199; //@line 2543
  sp = STACKTOP; //@line 2544
  return;
 }
 ___async_unwind = 0; //@line 2547
 HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 2548
 $200 = $ReallocAsyncCtx5 + 4 | 0; //@line 2549
 HEAP32[$200 >> 2] = $2; //@line 2550
 $201 = $ReallocAsyncCtx5 + 8 | 0; //@line 2551
 HEAP32[$201 >> 2] = $4; //@line 2552
 $202 = $ReallocAsyncCtx5 + 12 | 0; //@line 2553
 HEAP32[$202 >> 2] = $6; //@line 2554
 $203 = $ReallocAsyncCtx5 + 16 | 0; //@line 2555
 HEAP32[$203 >> 2] = $8; //@line 2556
 $204 = $ReallocAsyncCtx5 + 20 | 0; //@line 2557
 HEAP32[$204 >> 2] = $10; //@line 2558
 $205 = $ReallocAsyncCtx5 + 24 | 0; //@line 2559
 HEAP32[$205 >> 2] = $12; //@line 2560
 $206 = $ReallocAsyncCtx5 + 28 | 0; //@line 2561
 HEAP32[$206 >> 2] = $14; //@line 2562
 $207 = $ReallocAsyncCtx5 + 32 | 0; //@line 2563
 $$expand_i1_val13 = $16 & 1; //@line 2564
 HEAP8[$207 >> 0] = $$expand_i1_val13; //@line 2565
 $208 = $ReallocAsyncCtx5 + 36 | 0; //@line 2566
 HEAP32[$208 >> 2] = $18; //@line 2567
 $209 = $ReallocAsyncCtx5 + 40 | 0; //@line 2568
 HEAP32[$209 >> 2] = $20; //@line 2569
 $210 = $ReallocAsyncCtx5 + 44 | 0; //@line 2570
 HEAP32[$210 >> 2] = $22; //@line 2571
 $211 = $ReallocAsyncCtx5 + 48 | 0; //@line 2572
 HEAP32[$211 >> 2] = $24; //@line 2573
 $212 = $ReallocAsyncCtx5 + 52 | 0; //@line 2574
 HEAP32[$212 >> 2] = $26; //@line 2575
 $213 = $ReallocAsyncCtx5 + 56 | 0; //@line 2576
 HEAP32[$213 >> 2] = $28; //@line 2577
 $214 = $ReallocAsyncCtx5 + 60 | 0; //@line 2578
 HEAP32[$214 >> 2] = $30; //@line 2579
 $215 = $ReallocAsyncCtx5 + 64 | 0; //@line 2580
 HEAP32[$215 >> 2] = $32; //@line 2581
 $216 = $ReallocAsyncCtx5 + 68 | 0; //@line 2582
 HEAP32[$216 >> 2] = $34; //@line 2583
 $217 = $ReallocAsyncCtx5 + 72 | 0; //@line 2584
 HEAP32[$217 >> 2] = $199; //@line 2585
 sp = STACKTOP; //@line 2586
 return;
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8635
 STACKTOP = STACKTOP + 560 | 0; //@line 8636
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 8636
 $6 = sp + 8 | 0; //@line 8637
 $7 = sp; //@line 8638
 $8 = sp + 524 | 0; //@line 8639
 $9 = $8; //@line 8640
 $10 = sp + 512 | 0; //@line 8641
 HEAP32[$7 >> 2] = 0; //@line 8642
 $11 = $10 + 12 | 0; //@line 8643
 ___DOUBLE_BITS_677($1) | 0; //@line 8644
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 8649
  $$0520 = 1; //@line 8649
  $$0521 = 1988; //@line 8649
 } else {
  $$0471 = $1; //@line 8660
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 8660
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 1989 : 1994 : 1991; //@line 8660
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 8662
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 8671
   $31 = $$0520 + 3 | 0; //@line 8676
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 8678
   _out_670($0, $$0521, $$0520); //@line 8679
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 2015 : 2019 : $27 ? 2007 : 2011, 3); //@line 8680
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 8682
   $$sink560 = $31; //@line 8683
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 8686
   $36 = $35 != 0.0; //@line 8687
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 8691
   }
   $39 = $5 | 32; //@line 8693
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 8696
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 8699
    $44 = $$0520 | 2; //@line 8700
    $46 = 12 - $3 | 0; //@line 8702
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 8707
     } else {
      $$0509585 = 8.0; //@line 8709
      $$1508586 = $46; //@line 8709
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 8711
       $$0509585 = $$0509585 * 16.0; //@line 8712
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 8727
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 8732
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 8737
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 8740
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 8743
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 8746
     HEAP8[$68 >> 0] = 48; //@line 8747
     $$0511 = $68; //@line 8748
    } else {
     $$0511 = $66; //@line 8750
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 8757
    $76 = $$0511 + -2 | 0; //@line 8760
    HEAP8[$76 >> 0] = $5 + 15; //@line 8761
    $77 = ($3 | 0) < 1; //@line 8762
    $79 = ($4 & 8 | 0) == 0; //@line 8764
    $$0523 = $8; //@line 8765
    $$2473 = $$1472; //@line 8765
    while (1) {
     $80 = ~~$$2473; //@line 8767
     $86 = $$0523 + 1 | 0; //@line 8773
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[2023 + $80 >> 0]; //@line 8774
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 8777
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 8786
      } else {
       HEAP8[$86 >> 0] = 46; //@line 8789
       $$1524 = $$0523 + 2 | 0; //@line 8790
      }
     } else {
      $$1524 = $86; //@line 8793
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 8797
     }
    }
    $$pre693 = $$1524; //@line 8803
    if (!$3) {
     label = 24; //@line 8805
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 8813
      $$sink = $3 + 2 | 0; //@line 8813
     } else {
      label = 24; //@line 8815
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 8819
     $$pre$phi691Z2D = $101; //@line 8820
     $$sink = $101; //@line 8820
    }
    $104 = $11 - $76 | 0; //@line 8824
    $106 = $104 + $44 + $$sink | 0; //@line 8826
    _pad_676($0, 32, $2, $106, $4); //@line 8827
    _out_670($0, $$0521$, $44); //@line 8828
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 8830
    _out_670($0, $8, $$pre$phi691Z2D); //@line 8831
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 8833
    _out_670($0, $76, $104); //@line 8834
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 8836
    $$sink560 = $106; //@line 8837
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 8841
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 8845
    HEAP32[$7 >> 2] = $113; //@line 8846
    $$3 = $35 * 268435456.0; //@line 8847
    $$pr = $113; //@line 8847
   } else {
    $$3 = $35; //@line 8850
    $$pr = HEAP32[$7 >> 2] | 0; //@line 8850
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 8854
   $$0498 = $$561; //@line 8855
   $$4 = $$3; //@line 8855
   do {
    $116 = ~~$$4 >>> 0; //@line 8857
    HEAP32[$$0498 >> 2] = $116; //@line 8858
    $$0498 = $$0498 + 4 | 0; //@line 8859
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 8862
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 8872
    $$1499662 = $$0498; //@line 8872
    $124 = $$pr; //@line 8872
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 8875
     $$0488655 = $$1499662 + -4 | 0; //@line 8876
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 8879
     } else {
      $$0488657 = $$0488655; //@line 8881
      $$0497656 = 0; //@line 8881
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 8884
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 8886
       $131 = tempRet0; //@line 8887
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 8888
       HEAP32[$$0488657 >> 2] = $132; //@line 8890
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 8891
       $$0488657 = $$0488657 + -4 | 0; //@line 8893
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 8903
      } else {
       $138 = $$1482663 + -4 | 0; //@line 8905
       HEAP32[$138 >> 2] = $$0497656; //@line 8906
       $$2483$ph = $138; //@line 8907
      }
     }
     $$2500 = $$1499662; //@line 8910
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 8916
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 8920
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 8926
     HEAP32[$7 >> 2] = $144; //@line 8927
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 8930
      $$1499662 = $$2500; //@line 8930
      $124 = $144; //@line 8930
     } else {
      $$1482$lcssa = $$2483$ph; //@line 8932
      $$1499$lcssa = $$2500; //@line 8932
      $$pr566 = $144; //@line 8932
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 8937
    $$1499$lcssa = $$0498; //@line 8937
    $$pr566 = $$pr; //@line 8937
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 8943
    $150 = ($39 | 0) == 102; //@line 8944
    $$3484650 = $$1482$lcssa; //@line 8945
    $$3501649 = $$1499$lcssa; //@line 8945
    $152 = $$pr566; //@line 8945
    while (1) {
     $151 = 0 - $152 | 0; //@line 8947
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 8949
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 8953
      $161 = 1e9 >>> $154; //@line 8954
      $$0487644 = 0; //@line 8955
      $$1489643 = $$3484650; //@line 8955
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 8957
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 8961
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 8962
       $$1489643 = $$1489643 + 4 | 0; //@line 8963
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 8974
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 8977
       $$4502 = $$3501649; //@line 8977
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 8980
       $$$3484700 = $$$3484; //@line 8981
       $$4502 = $$3501649 + 4 | 0; //@line 8981
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 8988
      $$4502 = $$3501649; //@line 8988
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 8990
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 8997
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 8999
     HEAP32[$7 >> 2] = $152; //@line 9000
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 9005
      $$3501$lcssa = $$$4502; //@line 9005
      break;
     } else {
      $$3484650 = $$$3484700; //@line 9003
      $$3501649 = $$$4502; //@line 9003
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 9010
    $$3501$lcssa = $$1499$lcssa; //@line 9010
   }
   $185 = $$561; //@line 9013
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 9018
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 9019
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 9022
    } else {
     $$0514639 = $189; //@line 9024
     $$0530638 = 10; //@line 9024
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 9026
      $193 = $$0514639 + 1 | 0; //@line 9027
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 9030
       break;
      } else {
       $$0514639 = $193; //@line 9033
      }
     }
    }
   } else {
    $$1515 = 0; //@line 9038
   }
   $198 = ($39 | 0) == 103; //@line 9043
   $199 = ($$540 | 0) != 0; //@line 9044
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 9047
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 9056
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 9059
    $213 = ($209 | 0) % 9 | 0; //@line 9060
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 9063
     $$1531632 = 10; //@line 9063
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 9066
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 9069
       $$1531632 = $215; //@line 9069
      } else {
       $$1531$lcssa = $215; //@line 9071
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 9076
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 9078
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 9079
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 9082
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 9085
     $$4518 = $$1515; //@line 9085
     $$8 = $$3484$lcssa; //@line 9085
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 9090
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 9091
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 9096
     if (!$$0520) {
      $$1467 = $$$564; //@line 9099
      $$1469 = $$543; //@line 9099
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 9102
      $$1467 = $230 ? -$$$564 : $$$564; //@line 9107
      $$1469 = $230 ? -$$543 : $$543; //@line 9107
     }
     $233 = $217 - $218 | 0; //@line 9109
     HEAP32[$212 >> 2] = $233; //@line 9110
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 9114
      HEAP32[$212 >> 2] = $236; //@line 9115
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 9118
       $$sink547625 = $212; //@line 9118
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 9120
        HEAP32[$$sink547625 >> 2] = 0; //@line 9121
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 9124
         HEAP32[$240 >> 2] = 0; //@line 9125
         $$6 = $240; //@line 9126
        } else {
         $$6 = $$5486626; //@line 9128
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 9131
        HEAP32[$238 >> 2] = $242; //@line 9132
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 9135
         $$sink547625 = $238; //@line 9135
        } else {
         $$5486$lcssa = $$6; //@line 9137
         $$sink547$lcssa = $238; //@line 9137
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 9142
       $$sink547$lcssa = $212; //@line 9142
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 9147
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 9148
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 9151
       $$4518 = $247; //@line 9151
       $$8 = $$5486$lcssa; //@line 9151
      } else {
       $$2516621 = $247; //@line 9153
       $$2532620 = 10; //@line 9153
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 9155
        $251 = $$2516621 + 1 | 0; //@line 9156
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 9159
         $$4518 = $251; //@line 9159
         $$8 = $$5486$lcssa; //@line 9159
         break;
        } else {
         $$2516621 = $251; //@line 9162
        }
       }
      }
     } else {
      $$4492 = $212; //@line 9167
      $$4518 = $$1515; //@line 9167
      $$8 = $$3484$lcssa; //@line 9167
     }
    }
    $253 = $$4492 + 4 | 0; //@line 9170
    $$5519$ph = $$4518; //@line 9173
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 9173
    $$9$ph = $$8; //@line 9173
   } else {
    $$5519$ph = $$1515; //@line 9175
    $$7505$ph = $$3501$lcssa; //@line 9175
    $$9$ph = $$3484$lcssa; //@line 9175
   }
   $$7505 = $$7505$ph; //@line 9177
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 9181
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 9184
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 9188
    } else {
     $$lcssa675 = 1; //@line 9190
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 9194
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 9199
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 9207
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 9207
     } else {
      $$0479 = $5 + -2 | 0; //@line 9211
      $$2476 = $$540$ + -1 | 0; //@line 9211
     }
     $267 = $4 & 8; //@line 9213
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 9218
       if (!$270) {
        $$2529 = 9; //@line 9221
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 9226
         $$3533616 = 10; //@line 9226
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 9228
          $275 = $$1528617 + 1 | 0; //@line 9229
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 9235
           break;
          } else {
           $$1528617 = $275; //@line 9233
          }
         }
        } else {
         $$2529 = 0; //@line 9240
        }
       }
      } else {
       $$2529 = 9; //@line 9244
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 9252
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 9254
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 9256
       $$1480 = $$0479; //@line 9259
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 9259
       $$pre$phi698Z2D = 0; //@line 9259
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 9263
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 9265
       $$1480 = $$0479; //@line 9268
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 9268
       $$pre$phi698Z2D = 0; //@line 9268
       break;
      }
     } else {
      $$1480 = $$0479; //@line 9272
      $$3477 = $$2476; //@line 9272
      $$pre$phi698Z2D = $267; //@line 9272
     }
    } else {
     $$1480 = $5; //@line 9276
     $$3477 = $$540; //@line 9276
     $$pre$phi698Z2D = $4 & 8; //@line 9276
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 9279
   $294 = ($292 | 0) != 0 & 1; //@line 9281
   $296 = ($$1480 | 32 | 0) == 102; //@line 9283
   if ($296) {
    $$2513 = 0; //@line 9287
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 9287
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 9290
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 9293
    $304 = $11; //@line 9294
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 9299
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 9301
      HEAP8[$308 >> 0] = 48; //@line 9302
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 9307
      } else {
       $$1512$lcssa = $308; //@line 9309
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 9314
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 9321
    $318 = $$1512$lcssa + -2 | 0; //@line 9323
    HEAP8[$318 >> 0] = $$1480; //@line 9324
    $$2513 = $318; //@line 9327
    $$pn = $304 - $318 | 0; //@line 9327
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 9332
   _pad_676($0, 32, $2, $323, $4); //@line 9333
   _out_670($0, $$0521, $$0520); //@line 9334
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 9336
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 9339
    $326 = $8 + 9 | 0; //@line 9340
    $327 = $326; //@line 9341
    $328 = $8 + 8 | 0; //@line 9342
    $$5493600 = $$0496$$9; //@line 9343
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 9346
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 9351
       $$1465 = $328; //@line 9352
      } else {
       $$1465 = $330; //@line 9354
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 9361
       $$0464597 = $330; //@line 9362
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 9364
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 9367
        } else {
         $$1465 = $335; //@line 9369
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 9374
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 9379
     $$5493600 = $$5493600 + 4 | 0; //@line 9380
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 2039, 1); //@line 9390
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 9396
     $$6494592 = $$5493600; //@line 9396
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 9399
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 9404
       $$0463587 = $347; //@line 9405
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 9407
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 9410
        } else {
         $$0463$lcssa = $351; //@line 9412
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 9417
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 9421
      $$6494592 = $$6494592 + 4 | 0; //@line 9422
      $356 = $$4478593 + -9 | 0; //@line 9423
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 9430
       break;
      } else {
       $$4478593 = $356; //@line 9428
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 9435
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 9438
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 9441
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 9444
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 9445
     $365 = $363; //@line 9446
     $366 = 0 - $9 | 0; //@line 9447
     $367 = $8 + 8 | 0; //@line 9448
     $$5605 = $$3477; //@line 9449
     $$7495604 = $$9$ph; //@line 9449
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 9452
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 9455
       $$0 = $367; //@line 9456
      } else {
       $$0 = $369; //@line 9458
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 9463
        _out_670($0, $$0, 1); //@line 9464
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 9468
         break;
        }
        _out_670($0, 2039, 1); //@line 9471
        $$2 = $375; //@line 9472
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 9476
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 9481
        $$1601 = $$0; //@line 9482
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 9484
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 9487
         } else {
          $$2 = $373; //@line 9489
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 9496
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 9499
      $381 = $$5605 - $378 | 0; //@line 9500
      $$7495604 = $$7495604 + 4 | 0; //@line 9501
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 9508
       break;
      } else {
       $$5605 = $381; //@line 9506
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 9513
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 9516
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 9520
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 9523
   $$sink560 = $323; //@line 9524
  }
 } while (0);
 STACKTOP = sp; //@line 9529
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 9529
}
function _equeue_dispatch__async_cb_48($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$065 = 0, $$06790$reg2mem$0 = 0, $$06790$reg2mem$0$phi = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val31 = 0, $$expand_i1_val33 = 0, $$expand_i1_val35 = 0, $$reg2mem$0 = 0, $$reg2mem23$0 = 0, $$sink$in$i$i = 0, $10 = 0, $102 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $127 = 0, $128 = 0, $129 = 0, $131 = 0, $132 = 0, $14 = 0, $140 = 0, $141 = 0, $143 = 0, $146 = 0, $148 = 0, $151 = 0, $154 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $165 = 0, $168 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $190 = 0, $191 = 0, $192 = 0, $2 = 0, $24 = 0, $26 = 0, $28 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $70 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 637
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 639
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 641
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 643
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 645
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 647
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 649
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 651
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 654
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 656
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 662
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 664
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 666
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 670
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 672
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 674
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 676
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 678
 $$06790$reg2mem$0 = HEAP32[$0 + 44 >> 2] | 0; //@line 679
 $$reg2mem$0 = HEAP32[$0 + 40 >> 2] | 0; //@line 679
 $$reg2mem23$0 = HEAP32[$0 + 60 >> 2] | 0; //@line 679
 while (1) {
  _equeue_mutex_lock($24); //@line 681
  $125 = HEAP32[$38 >> 2] | 0; //@line 682
  L4 : do {
   if (!$125) {
    $$02329$i$i = $38; //@line 686
    label = 21; //@line 687
   } else {
    $127 = HEAP32[$$06790$reg2mem$0 >> 2] | 0; //@line 689
    $$025$i$i = $38; //@line 690
    $129 = $125; //@line 690
    while (1) {
     $128 = HEAP32[$129 >> 2] | 0; //@line 692
     if ($128 >>> 0 >= $127 >>> 0) {
      break;
     }
     $131 = $129 + 8 | 0; //@line 697
     $132 = HEAP32[$131 >> 2] | 0; //@line 698
     if (!$132) {
      $$02329$i$i = $131; //@line 701
      label = 21; //@line 702
      break L4;
     } else {
      $$025$i$i = $131; //@line 705
      $129 = $132; //@line 705
     }
    }
    if (($128 | 0) == ($127 | 0)) {
     HEAP32[$$06790$reg2mem$0 + 12 >> 2] = $129; //@line 711
     $$02330$i$i = $$025$i$i; //@line 714
     $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 714
    } else {
     $$02329$i$i = $$025$i$i; //@line 716
     label = 21; //@line 717
    }
   }
  } while (0);
  if ((label | 0) == 21) {
   label = 0; //@line 722
   HEAP32[$$06790$reg2mem$0 + 12 >> 2] = 0; //@line 724
   $$02330$i$i = $$02329$i$i; //@line 725
   $$sink$in$i$i = $$02329$i$i; //@line 725
  }
  HEAP32[$$reg2mem$0 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 728
  HEAP32[$$02330$i$i >> 2] = $$06790$reg2mem$0; //@line 729
  _equeue_mutex_unlock($24); //@line 730
  if (!$$reg2mem23$0) {
   label = 24; //@line 733
   break;
  }
  $$reg2mem$0 = $$reg2mem23$0 + 8 | 0; //@line 736
  $42 = HEAP32[$$reg2mem$0 >> 2] | 0; //@line 737
  $44 = HEAP32[$$reg2mem23$0 + 32 >> 2] | 0; //@line 739
  if ($44 | 0) {
   label = 3; //@line 742
   break;
  }
  $68 = HEAP32[$$reg2mem23$0 + 24 >> 2] | 0; //@line 746
  if (($68 | 0) > -1) {
   label = 7; //@line 749
   break;
  }
  $92 = $$reg2mem23$0 + 4 | 0; //@line 753
  $93 = HEAP8[$92 >> 0] | 0; //@line 754
  HEAP8[$92 >> 0] = (($93 + 1 & 255) << HEAP32[$40 >> 2] | 0) == 0 ? 1 : ($93 & 255) + 1 & 255; //@line 763
  $102 = HEAP32[$$reg2mem23$0 + 28 >> 2] | 0; //@line 765
  if ($102 | 0) {
   label = 11; //@line 770
   break;
  } else {
   $$06790$reg2mem$0$phi = $$reg2mem23$0; //@line 768
   $$reg2mem23$0 = $42; //@line 768
   $$06790$reg2mem$0 = $$06790$reg2mem$0$phi; //@line 768
  }
 }
 if ((label | 0) == 3) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 776
  FUNCTION_TABLE_vi[$44 & 127]($$reg2mem23$0 + 36 | 0); //@line 777
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 780
   $47 = $ReallocAsyncCtx + 4 | 0; //@line 781
   HEAP32[$47 >> 2] = $2; //@line 782
   $48 = $ReallocAsyncCtx + 8 | 0; //@line 783
   HEAP32[$48 >> 2] = $4; //@line 784
   $49 = $ReallocAsyncCtx + 12 | 0; //@line 785
   HEAP32[$49 >> 2] = $6; //@line 786
   $50 = $ReallocAsyncCtx + 16 | 0; //@line 787
   HEAP32[$50 >> 2] = $8; //@line 788
   $51 = $ReallocAsyncCtx + 20 | 0; //@line 789
   HEAP32[$51 >> 2] = $10; //@line 790
   $52 = $ReallocAsyncCtx + 24 | 0; //@line 791
   HEAP32[$52 >> 2] = $12; //@line 792
   $53 = $ReallocAsyncCtx + 28 | 0; //@line 793
   HEAP32[$53 >> 2] = $14; //@line 794
   $54 = $ReallocAsyncCtx + 32 | 0; //@line 795
   $$expand_i1_val = $16 & 1; //@line 796
   HEAP8[$54 >> 0] = $$expand_i1_val; //@line 797
   $55 = $ReallocAsyncCtx + 36 | 0; //@line 798
   HEAP32[$55 >> 2] = $18; //@line 799
   $56 = $ReallocAsyncCtx + 40 | 0; //@line 800
   HEAP32[$56 >> 2] = $$reg2mem$0; //@line 801
   $57 = $ReallocAsyncCtx + 44 | 0; //@line 802
   HEAP32[$57 >> 2] = $$reg2mem23$0; //@line 803
   $58 = $ReallocAsyncCtx + 48 | 0; //@line 804
   HEAP32[$58 >> 2] = $24; //@line 805
   $59 = $ReallocAsyncCtx + 52 | 0; //@line 806
   HEAP32[$59 >> 2] = $26; //@line 807
   $60 = $ReallocAsyncCtx + 56 | 0; //@line 808
   HEAP32[$60 >> 2] = $28; //@line 809
   $61 = $ReallocAsyncCtx + 60 | 0; //@line 810
   HEAP32[$61 >> 2] = $42; //@line 811
   $62 = $ReallocAsyncCtx + 64 | 0; //@line 812
   HEAP32[$62 >> 2] = $32; //@line 813
   $63 = $ReallocAsyncCtx + 68 | 0; //@line 814
   HEAP32[$63 >> 2] = $34; //@line 815
   $64 = $ReallocAsyncCtx + 72 | 0; //@line 816
   HEAP32[$64 >> 2] = $36; //@line 817
   $65 = $ReallocAsyncCtx + 76 | 0; //@line 818
   HEAP32[$65 >> 2] = $38; //@line 819
   $66 = $ReallocAsyncCtx + 80 | 0; //@line 820
   HEAP32[$66 >> 2] = $40; //@line 821
   sp = STACKTOP; //@line 822
   return;
  }
  ___async_unwind = 0; //@line 825
  HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 826
  $47 = $ReallocAsyncCtx + 4 | 0; //@line 827
  HEAP32[$47 >> 2] = $2; //@line 828
  $48 = $ReallocAsyncCtx + 8 | 0; //@line 829
  HEAP32[$48 >> 2] = $4; //@line 830
  $49 = $ReallocAsyncCtx + 12 | 0; //@line 831
  HEAP32[$49 >> 2] = $6; //@line 832
  $50 = $ReallocAsyncCtx + 16 | 0; //@line 833
  HEAP32[$50 >> 2] = $8; //@line 834
  $51 = $ReallocAsyncCtx + 20 | 0; //@line 835
  HEAP32[$51 >> 2] = $10; //@line 836
  $52 = $ReallocAsyncCtx + 24 | 0; //@line 837
  HEAP32[$52 >> 2] = $12; //@line 838
  $53 = $ReallocAsyncCtx + 28 | 0; //@line 839
  HEAP32[$53 >> 2] = $14; //@line 840
  $54 = $ReallocAsyncCtx + 32 | 0; //@line 841
  $$expand_i1_val = $16 & 1; //@line 842
  HEAP8[$54 >> 0] = $$expand_i1_val; //@line 843
  $55 = $ReallocAsyncCtx + 36 | 0; //@line 844
  HEAP32[$55 >> 2] = $18; //@line 845
  $56 = $ReallocAsyncCtx + 40 | 0; //@line 846
  HEAP32[$56 >> 2] = $$reg2mem$0; //@line 847
  $57 = $ReallocAsyncCtx + 44 | 0; //@line 848
  HEAP32[$57 >> 2] = $$reg2mem23$0; //@line 849
  $58 = $ReallocAsyncCtx + 48 | 0; //@line 850
  HEAP32[$58 >> 2] = $24; //@line 851
  $59 = $ReallocAsyncCtx + 52 | 0; //@line 852
  HEAP32[$59 >> 2] = $26; //@line 853
  $60 = $ReallocAsyncCtx + 56 | 0; //@line 854
  HEAP32[$60 >> 2] = $28; //@line 855
  $61 = $ReallocAsyncCtx + 60 | 0; //@line 856
  HEAP32[$61 >> 2] = $42; //@line 857
  $62 = $ReallocAsyncCtx + 64 | 0; //@line 858
  HEAP32[$62 >> 2] = $32; //@line 859
  $63 = $ReallocAsyncCtx + 68 | 0; //@line 860
  HEAP32[$63 >> 2] = $34; //@line 861
  $64 = $ReallocAsyncCtx + 72 | 0; //@line 862
  HEAP32[$64 >> 2] = $36; //@line 863
  $65 = $ReallocAsyncCtx + 76 | 0; //@line 864
  HEAP32[$65 >> 2] = $38; //@line 865
  $66 = $ReallocAsyncCtx + 80 | 0; //@line 866
  HEAP32[$66 >> 2] = $40; //@line 867
  sp = STACKTOP; //@line 868
  return;
 } else if ((label | 0) == 7) {
  $70 = $$reg2mem23$0 + 20 | 0; //@line 872
  HEAP32[$70 >> 2] = (HEAP32[$70 >> 2] | 0) + $68; //@line 875
  $73 = _equeue_tick() | 0; //@line 876
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 877
  _equeue_enqueue($14, $$reg2mem23$0, $73) | 0; //@line 878
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 881
   $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 882
   HEAP32[$74 >> 2] = $2; //@line 883
   $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 884
   HEAP32[$75 >> 2] = $4; //@line 885
   $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 886
   HEAP32[$76 >> 2] = $6; //@line 887
   $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 888
   HEAP32[$77 >> 2] = $8; //@line 889
   $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 890
   HEAP32[$78 >> 2] = $10; //@line 891
   $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 892
   HEAP32[$79 >> 2] = $12; //@line 893
   $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 894
   HEAP32[$80 >> 2] = $14; //@line 895
   $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 896
   $$expand_i1_val31 = $16 & 1; //@line 897
   HEAP8[$81 >> 0] = $$expand_i1_val31; //@line 898
   $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 899
   HEAP32[$82 >> 2] = $18; //@line 900
   $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 901
   HEAP32[$83 >> 2] = $24; //@line 902
   $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 903
   HEAP32[$84 >> 2] = $26; //@line 904
   $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 905
   HEAP32[$85 >> 2] = $28; //@line 906
   $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 907
   HEAP32[$86 >> 2] = $42; //@line 908
   $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 909
   HEAP32[$87 >> 2] = $32; //@line 910
   $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 911
   HEAP32[$88 >> 2] = $34; //@line 912
   $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 913
   HEAP32[$89 >> 2] = $36; //@line 914
   $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 915
   HEAP32[$90 >> 2] = $38; //@line 916
   $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 917
   HEAP32[$91 >> 2] = $40; //@line 918
   sp = STACKTOP; //@line 919
   return;
  }
  ___async_unwind = 0; //@line 922
  HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 923
  $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 924
  HEAP32[$74 >> 2] = $2; //@line 925
  $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 926
  HEAP32[$75 >> 2] = $4; //@line 927
  $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 928
  HEAP32[$76 >> 2] = $6; //@line 929
  $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 930
  HEAP32[$77 >> 2] = $8; //@line 931
  $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 932
  HEAP32[$78 >> 2] = $10; //@line 933
  $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 934
  HEAP32[$79 >> 2] = $12; //@line 935
  $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 936
  HEAP32[$80 >> 2] = $14; //@line 937
  $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 938
  $$expand_i1_val31 = $16 & 1; //@line 939
  HEAP8[$81 >> 0] = $$expand_i1_val31; //@line 940
  $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 941
  HEAP32[$82 >> 2] = $18; //@line 942
  $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 943
  HEAP32[$83 >> 2] = $24; //@line 944
  $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 945
  HEAP32[$84 >> 2] = $26; //@line 946
  $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 947
  HEAP32[$85 >> 2] = $28; //@line 948
  $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 949
  HEAP32[$86 >> 2] = $42; //@line 950
  $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 951
  HEAP32[$87 >> 2] = $32; //@line 952
  $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 953
  HEAP32[$88 >> 2] = $34; //@line 954
  $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 955
  HEAP32[$89 >> 2] = $36; //@line 956
  $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 957
  HEAP32[$90 >> 2] = $38; //@line 958
  $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 959
  HEAP32[$91 >> 2] = $40; //@line 960
  sp = STACKTOP; //@line 961
  return;
 } else if ((label | 0) == 11) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 966
  FUNCTION_TABLE_vi[$102 & 127]($$reg2mem23$0 + 36 | 0); //@line 967
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 970
   $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 971
   HEAP32[$105 >> 2] = $2; //@line 972
   $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 973
   HEAP32[$106 >> 2] = $4; //@line 974
   $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 975
   HEAP32[$107 >> 2] = $6; //@line 976
   $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 977
   HEAP32[$108 >> 2] = $8; //@line 978
   $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 979
   HEAP32[$109 >> 2] = $10; //@line 980
   $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 981
   HEAP32[$110 >> 2] = $12; //@line 982
   $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 983
   HEAP32[$111 >> 2] = $14; //@line 984
   $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 985
   $$expand_i1_val33 = $16 & 1; //@line 986
   HEAP8[$112 >> 0] = $$expand_i1_val33; //@line 987
   $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 988
   HEAP32[$113 >> 2] = $18; //@line 989
   $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 990
   HEAP32[$114 >> 2] = $$reg2mem$0; //@line 991
   $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 992
   HEAP32[$115 >> 2] = $$reg2mem23$0; //@line 993
   $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 994
   HEAP32[$116 >> 2] = $24; //@line 995
   $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 996
   HEAP32[$117 >> 2] = $26; //@line 997
   $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 998
   HEAP32[$118 >> 2] = $28; //@line 999
   $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 1000
   HEAP32[$119 >> 2] = $42; //@line 1001
   $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 1002
   HEAP32[$120 >> 2] = $32; //@line 1003
   $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 1004
   HEAP32[$121 >> 2] = $34; //@line 1005
   $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 1006
   HEAP32[$122 >> 2] = $36; //@line 1007
   $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 1008
   HEAP32[$123 >> 2] = $38; //@line 1009
   $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 1010
   HEAP32[$124 >> 2] = $40; //@line 1011
   sp = STACKTOP; //@line 1012
   return;
  }
  ___async_unwind = 0; //@line 1015
  HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 1016
  $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 1017
  HEAP32[$105 >> 2] = $2; //@line 1018
  $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 1019
  HEAP32[$106 >> 2] = $4; //@line 1020
  $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 1021
  HEAP32[$107 >> 2] = $6; //@line 1022
  $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 1023
  HEAP32[$108 >> 2] = $8; //@line 1024
  $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 1025
  HEAP32[$109 >> 2] = $10; //@line 1026
  $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 1027
  HEAP32[$110 >> 2] = $12; //@line 1028
  $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 1029
  HEAP32[$111 >> 2] = $14; //@line 1030
  $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 1031
  $$expand_i1_val33 = $16 & 1; //@line 1032
  HEAP8[$112 >> 0] = $$expand_i1_val33; //@line 1033
  $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 1034
  HEAP32[$113 >> 2] = $18; //@line 1035
  $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 1036
  HEAP32[$114 >> 2] = $$reg2mem$0; //@line 1037
  $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 1038
  HEAP32[$115 >> 2] = $$reg2mem23$0; //@line 1039
  $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 1040
  HEAP32[$116 >> 2] = $24; //@line 1041
  $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 1042
  HEAP32[$117 >> 2] = $26; //@line 1043
  $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 1044
  HEAP32[$118 >> 2] = $28; //@line 1045
  $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 1046
  HEAP32[$119 >> 2] = $42; //@line 1047
  $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 1048
  HEAP32[$120 >> 2] = $32; //@line 1049
  $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 1050
  HEAP32[$121 >> 2] = $34; //@line 1051
  $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 1052
  HEAP32[$122 >> 2] = $36; //@line 1053
  $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 1054
  HEAP32[$123 >> 2] = $38; //@line 1055
  $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 1056
  HEAP32[$124 >> 2] = $40; //@line 1057
  sp = STACKTOP; //@line 1058
  return;
 } else if ((label | 0) == 24) {
  $140 = _equeue_tick() | 0; //@line 1062
  if ($16) {
   $141 = $18 - $140 | 0; //@line 1064
   if (($141 | 0) < 1) {
    $143 = $14 + 40 | 0; //@line 1067
    if (HEAP32[$143 >> 2] | 0) {
     _equeue_mutex_lock($2); //@line 1071
     $146 = HEAP32[$143 >> 2] | 0; //@line 1072
     if ($146 | 0) {
      $148 = HEAP32[$10 >> 2] | 0; //@line 1075
      if ($148 | 0) {
       $151 = HEAP32[$14 + 44 >> 2] | 0; //@line 1079
       $154 = (HEAP32[$148 + 20 >> 2] | 0) - $140 | 0; //@line 1082
       $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 1086
       FUNCTION_TABLE_vii[$146 & 3]($151, $154 & ~($154 >> 31)); //@line 1087
       if (___async) {
        HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 1090
        $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 1091
        HEAP32[$158 >> 2] = $12; //@line 1092
        $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 1093
        HEAP32[$159 >> 2] = $2; //@line 1094
        $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 1095
        HEAP32[$160 >> 2] = $6; //@line 1096
        sp = STACKTOP; //@line 1097
        return;
       }
       ___async_unwind = 0; //@line 1100
       HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 1101
       $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 1102
       HEAP32[$158 >> 2] = $12; //@line 1103
       $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 1104
       HEAP32[$159 >> 2] = $2; //@line 1105
       $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 1106
       HEAP32[$160 >> 2] = $6; //@line 1107
       sp = STACKTOP; //@line 1108
       return;
      }
     }
     HEAP8[$12 >> 0] = 1; //@line 1112
     _equeue_mutex_unlock($2); //@line 1113
    }
    HEAP8[$6 >> 0] = 0; //@line 1115
    return;
   } else {
    $$065 = $141; //@line 1118
   }
  } else {
   $$065 = -1; //@line 1121
  }
  _equeue_mutex_lock($2); //@line 1123
  $161 = HEAP32[$10 >> 2] | 0; //@line 1124
  if (!$161) {
   $$2 = $$065; //@line 1127
  } else {
   $165 = (HEAP32[$161 + 20 >> 2] | 0) - $140 | 0; //@line 1131
   $168 = $165 & ~($165 >> 31); //@line 1134
   $$2 = $168 >>> 0 < $$065 >>> 0 ? $168 : $$065; //@line 1137
  }
  _equeue_mutex_unlock($2); //@line 1139
  _equeue_sema_wait($4, $$2) | 0; //@line 1140
  do {
   if (HEAP8[$6 >> 0] | 0) {
    _equeue_mutex_lock($2); //@line 1145
    if (!(HEAP8[$6 >> 0] | 0)) {
     _equeue_mutex_unlock($2); //@line 1149
     break;
    }
    HEAP8[$6 >> 0] = 0; //@line 1152
    _equeue_mutex_unlock($2); //@line 1153
    return;
   }
  } while (0);
  $174 = _equeue_tick() | 0; //@line 1157
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 1158
  _wait_ms(20); //@line 1159
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 1162
   $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 1163
   HEAP32[$175 >> 2] = $8; //@line 1164
   $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 1165
   HEAP32[$176 >> 2] = $10; //@line 1166
   $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 1167
   HEAP32[$177 >> 2] = $2; //@line 1168
   $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 1169
   HEAP32[$178 >> 2] = $4; //@line 1170
   $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 1171
   HEAP32[$179 >> 2] = $6; //@line 1172
   $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 1173
   HEAP32[$180 >> 2] = $12; //@line 1174
   $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 1175
   HEAP32[$181 >> 2] = $14; //@line 1176
   $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 1177
   $$expand_i1_val35 = $16 & 1; //@line 1178
   HEAP8[$182 >> 0] = $$expand_i1_val35; //@line 1179
   $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 1180
   HEAP32[$183 >> 2] = $18; //@line 1181
   $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 1182
   HEAP32[$184 >> 2] = $24; //@line 1183
   $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 1184
   HEAP32[$185 >> 2] = $26; //@line 1185
   $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 1186
   HEAP32[$186 >> 2] = $28; //@line 1187
   $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 1188
   HEAP32[$187 >> 2] = $32; //@line 1189
   $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 1190
   HEAP32[$188 >> 2] = $34; //@line 1191
   $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 1192
   HEAP32[$189 >> 2] = $36; //@line 1193
   $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 1194
   HEAP32[$190 >> 2] = $38; //@line 1195
   $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 1196
   HEAP32[$191 >> 2] = $40; //@line 1197
   $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 1198
   HEAP32[$192 >> 2] = $174; //@line 1199
   sp = STACKTOP; //@line 1200
   return;
  }
  ___async_unwind = 0; //@line 1203
  HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 1204
  $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 1205
  HEAP32[$175 >> 2] = $8; //@line 1206
  $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 1207
  HEAP32[$176 >> 2] = $10; //@line 1208
  $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 1209
  HEAP32[$177 >> 2] = $2; //@line 1210
  $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 1211
  HEAP32[$178 >> 2] = $4; //@line 1212
  $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 1213
  HEAP32[$179 >> 2] = $6; //@line 1214
  $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 1215
  HEAP32[$180 >> 2] = $12; //@line 1216
  $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 1217
  HEAP32[$181 >> 2] = $14; //@line 1218
  $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 1219
  $$expand_i1_val35 = $16 & 1; //@line 1220
  HEAP8[$182 >> 0] = $$expand_i1_val35; //@line 1221
  $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 1222
  HEAP32[$183 >> 2] = $18; //@line 1223
  $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 1224
  HEAP32[$184 >> 2] = $24; //@line 1225
  $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 1226
  HEAP32[$185 >> 2] = $26; //@line 1227
  $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 1228
  HEAP32[$186 >> 2] = $28; //@line 1229
  $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 1230
  HEAP32[$187 >> 2] = $32; //@line 1231
  $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 1232
  HEAP32[$188 >> 2] = $34; //@line 1233
  $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 1234
  HEAP32[$189 >> 2] = $36; //@line 1235
  $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 1236
  HEAP32[$190 >> 2] = $38; //@line 1237
  $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 1238
  HEAP32[$191 >> 2] = $40; //@line 1239
  $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 1240
  HEAP32[$192 >> 2] = $174; //@line 1241
  sp = STACKTOP; //@line 1242
  return;
 }
}
function _equeue_dispatch__async_cb($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$065 = 0, $$06790$reg2mem$0 = 0, $$06790$reg2mem$0$phi = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val31 = 0, $$expand_i1_val33 = 0, $$expand_i1_val35 = 0, $$reg2mem$0 = 0, $$reg2mem23$0 = 0, $$sink$in$i$i = 0, $10 = 0, $102 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $127 = 0, $128 = 0, $129 = 0, $131 = 0, $132 = 0, $14 = 0, $140 = 0, $141 = 0, $143 = 0, $146 = 0, $148 = 0, $151 = 0, $154 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $165 = 0, $168 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $190 = 0, $191 = 0, $192 = 0, $2 = 0, $24 = 0, $26 = 0, $28 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $70 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 14
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 16
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 18
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 20
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 22
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 24
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 26
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 28
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 31
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 33
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 39
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 41
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 43
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 47
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 49
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 51
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 53
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 55
 $$06790$reg2mem$0 = HEAP32[$0 + 44 >> 2] | 0; //@line 56
 $$reg2mem$0 = HEAP32[$0 + 40 >> 2] | 0; //@line 56
 $$reg2mem23$0 = HEAP32[$0 + 60 >> 2] | 0; //@line 56
 while (1) {
  $68 = HEAP32[$$06790$reg2mem$0 + 24 >> 2] | 0; //@line 59
  if (($68 | 0) > -1) {
   label = 8; //@line 62
   break;
  }
  $92 = $$06790$reg2mem$0 + 4 | 0; //@line 66
  $93 = HEAP8[$92 >> 0] | 0; //@line 67
  HEAP8[$92 >> 0] = (($93 + 1 & 255) << HEAP32[$40 >> 2] | 0) == 0 ? 1 : ($93 & 255) + 1 & 255; //@line 76
  $102 = HEAP32[$$06790$reg2mem$0 + 28 >> 2] | 0; //@line 78
  if ($102 | 0) {
   label = 12; //@line 81
   break;
  }
  _equeue_mutex_lock($24); //@line 84
  $125 = HEAP32[$38 >> 2] | 0; //@line 85
  L6 : do {
   if (!$125) {
    $$02329$i$i = $38; //@line 89
    label = 21; //@line 90
   } else {
    $127 = HEAP32[$$06790$reg2mem$0 >> 2] | 0; //@line 92
    $$025$i$i = $38; //@line 93
    $129 = $125; //@line 93
    while (1) {
     $128 = HEAP32[$129 >> 2] | 0; //@line 95
     if ($128 >>> 0 >= $127 >>> 0) {
      break;
     }
     $131 = $129 + 8 | 0; //@line 100
     $132 = HEAP32[$131 >> 2] | 0; //@line 101
     if (!$132) {
      $$02329$i$i = $131; //@line 104
      label = 21; //@line 105
      break L6;
     } else {
      $$025$i$i = $131; //@line 108
      $129 = $132; //@line 108
     }
    }
    if (($128 | 0) == ($127 | 0)) {
     HEAP32[$$06790$reg2mem$0 + 12 >> 2] = $129; //@line 114
     $$02330$i$i = $$025$i$i; //@line 117
     $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 117
    } else {
     $$02329$i$i = $$025$i$i; //@line 119
     label = 21; //@line 120
    }
   }
  } while (0);
  if ((label | 0) == 21) {
   label = 0; //@line 125
   HEAP32[$$06790$reg2mem$0 + 12 >> 2] = 0; //@line 127
   $$02330$i$i = $$02329$i$i; //@line 128
   $$sink$in$i$i = $$02329$i$i; //@line 128
  }
  HEAP32[$$reg2mem$0 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 131
  HEAP32[$$02330$i$i >> 2] = $$06790$reg2mem$0; //@line 132
  _equeue_mutex_unlock($24); //@line 133
  if (!$$reg2mem23$0) {
   label = 24; //@line 136
   break;
  }
  $41 = $$reg2mem23$0 + 8 | 0; //@line 139
  $42 = HEAP32[$41 >> 2] | 0; //@line 140
  $44 = HEAP32[$$reg2mem23$0 + 32 >> 2] | 0; //@line 142
  if (!$44) {
   $$06790$reg2mem$0$phi = $$reg2mem23$0; //@line 145
   $$reg2mem$0 = $41; //@line 145
   $$reg2mem23$0 = $42; //@line 145
   $$06790$reg2mem$0 = $$06790$reg2mem$0$phi; //@line 145
  } else {
   label = 3; //@line 147
   break;
  }
 }
 if ((label | 0) == 3) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 153
  FUNCTION_TABLE_vi[$44 & 127]($$reg2mem23$0 + 36 | 0); //@line 154
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 157
   $47 = $ReallocAsyncCtx + 4 | 0; //@line 158
   HEAP32[$47 >> 2] = $2; //@line 159
   $48 = $ReallocAsyncCtx + 8 | 0; //@line 160
   HEAP32[$48 >> 2] = $4; //@line 161
   $49 = $ReallocAsyncCtx + 12 | 0; //@line 162
   HEAP32[$49 >> 2] = $6; //@line 163
   $50 = $ReallocAsyncCtx + 16 | 0; //@line 164
   HEAP32[$50 >> 2] = $8; //@line 165
   $51 = $ReallocAsyncCtx + 20 | 0; //@line 166
   HEAP32[$51 >> 2] = $10; //@line 167
   $52 = $ReallocAsyncCtx + 24 | 0; //@line 168
   HEAP32[$52 >> 2] = $12; //@line 169
   $53 = $ReallocAsyncCtx + 28 | 0; //@line 170
   HEAP32[$53 >> 2] = $14; //@line 171
   $54 = $ReallocAsyncCtx + 32 | 0; //@line 172
   $$expand_i1_val = $16 & 1; //@line 173
   HEAP8[$54 >> 0] = $$expand_i1_val; //@line 174
   $55 = $ReallocAsyncCtx + 36 | 0; //@line 175
   HEAP32[$55 >> 2] = $18; //@line 176
   $56 = $ReallocAsyncCtx + 40 | 0; //@line 177
   HEAP32[$56 >> 2] = $41; //@line 178
   $57 = $ReallocAsyncCtx + 44 | 0; //@line 179
   HEAP32[$57 >> 2] = $$reg2mem23$0; //@line 180
   $58 = $ReallocAsyncCtx + 48 | 0; //@line 181
   HEAP32[$58 >> 2] = $24; //@line 182
   $59 = $ReallocAsyncCtx + 52 | 0; //@line 183
   HEAP32[$59 >> 2] = $26; //@line 184
   $60 = $ReallocAsyncCtx + 56 | 0; //@line 185
   HEAP32[$60 >> 2] = $28; //@line 186
   $61 = $ReallocAsyncCtx + 60 | 0; //@line 187
   HEAP32[$61 >> 2] = $42; //@line 188
   $62 = $ReallocAsyncCtx + 64 | 0; //@line 189
   HEAP32[$62 >> 2] = $32; //@line 190
   $63 = $ReallocAsyncCtx + 68 | 0; //@line 191
   HEAP32[$63 >> 2] = $34; //@line 192
   $64 = $ReallocAsyncCtx + 72 | 0; //@line 193
   HEAP32[$64 >> 2] = $36; //@line 194
   $65 = $ReallocAsyncCtx + 76 | 0; //@line 195
   HEAP32[$65 >> 2] = $38; //@line 196
   $66 = $ReallocAsyncCtx + 80 | 0; //@line 197
   HEAP32[$66 >> 2] = $40; //@line 198
   sp = STACKTOP; //@line 199
   return;
  }
  ___async_unwind = 0; //@line 202
  HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 203
  $47 = $ReallocAsyncCtx + 4 | 0; //@line 204
  HEAP32[$47 >> 2] = $2; //@line 205
  $48 = $ReallocAsyncCtx + 8 | 0; //@line 206
  HEAP32[$48 >> 2] = $4; //@line 207
  $49 = $ReallocAsyncCtx + 12 | 0; //@line 208
  HEAP32[$49 >> 2] = $6; //@line 209
  $50 = $ReallocAsyncCtx + 16 | 0; //@line 210
  HEAP32[$50 >> 2] = $8; //@line 211
  $51 = $ReallocAsyncCtx + 20 | 0; //@line 212
  HEAP32[$51 >> 2] = $10; //@line 213
  $52 = $ReallocAsyncCtx + 24 | 0; //@line 214
  HEAP32[$52 >> 2] = $12; //@line 215
  $53 = $ReallocAsyncCtx + 28 | 0; //@line 216
  HEAP32[$53 >> 2] = $14; //@line 217
  $54 = $ReallocAsyncCtx + 32 | 0; //@line 218
  $$expand_i1_val = $16 & 1; //@line 219
  HEAP8[$54 >> 0] = $$expand_i1_val; //@line 220
  $55 = $ReallocAsyncCtx + 36 | 0; //@line 221
  HEAP32[$55 >> 2] = $18; //@line 222
  $56 = $ReallocAsyncCtx + 40 | 0; //@line 223
  HEAP32[$56 >> 2] = $41; //@line 224
  $57 = $ReallocAsyncCtx + 44 | 0; //@line 225
  HEAP32[$57 >> 2] = $$reg2mem23$0; //@line 226
  $58 = $ReallocAsyncCtx + 48 | 0; //@line 227
  HEAP32[$58 >> 2] = $24; //@line 228
  $59 = $ReallocAsyncCtx + 52 | 0; //@line 229
  HEAP32[$59 >> 2] = $26; //@line 230
  $60 = $ReallocAsyncCtx + 56 | 0; //@line 231
  HEAP32[$60 >> 2] = $28; //@line 232
  $61 = $ReallocAsyncCtx + 60 | 0; //@line 233
  HEAP32[$61 >> 2] = $42; //@line 234
  $62 = $ReallocAsyncCtx + 64 | 0; //@line 235
  HEAP32[$62 >> 2] = $32; //@line 236
  $63 = $ReallocAsyncCtx + 68 | 0; //@line 237
  HEAP32[$63 >> 2] = $34; //@line 238
  $64 = $ReallocAsyncCtx + 72 | 0; //@line 239
  HEAP32[$64 >> 2] = $36; //@line 240
  $65 = $ReallocAsyncCtx + 76 | 0; //@line 241
  HEAP32[$65 >> 2] = $38; //@line 242
  $66 = $ReallocAsyncCtx + 80 | 0; //@line 243
  HEAP32[$66 >> 2] = $40; //@line 244
  sp = STACKTOP; //@line 245
  return;
 } else if ((label | 0) == 8) {
  $70 = $$06790$reg2mem$0 + 20 | 0; //@line 249
  HEAP32[$70 >> 2] = (HEAP32[$70 >> 2] | 0) + $68; //@line 252
  $73 = _equeue_tick() | 0; //@line 253
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 254
  _equeue_enqueue($14, $$06790$reg2mem$0, $73) | 0; //@line 255
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 258
   $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 259
   HEAP32[$74 >> 2] = $2; //@line 260
   $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 261
   HEAP32[$75 >> 2] = $4; //@line 262
   $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 263
   HEAP32[$76 >> 2] = $6; //@line 264
   $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 265
   HEAP32[$77 >> 2] = $8; //@line 266
   $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 267
   HEAP32[$78 >> 2] = $10; //@line 268
   $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 269
   HEAP32[$79 >> 2] = $12; //@line 270
   $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 271
   HEAP32[$80 >> 2] = $14; //@line 272
   $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 273
   $$expand_i1_val31 = $16 & 1; //@line 274
   HEAP8[$81 >> 0] = $$expand_i1_val31; //@line 275
   $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 276
   HEAP32[$82 >> 2] = $18; //@line 277
   $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 278
   HEAP32[$83 >> 2] = $24; //@line 279
   $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 280
   HEAP32[$84 >> 2] = $26; //@line 281
   $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 282
   HEAP32[$85 >> 2] = $28; //@line 283
   $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 284
   HEAP32[$86 >> 2] = $$reg2mem23$0; //@line 285
   $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 286
   HEAP32[$87 >> 2] = $32; //@line 287
   $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 288
   HEAP32[$88 >> 2] = $34; //@line 289
   $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 290
   HEAP32[$89 >> 2] = $36; //@line 291
   $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 292
   HEAP32[$90 >> 2] = $38; //@line 293
   $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 294
   HEAP32[$91 >> 2] = $40; //@line 295
   sp = STACKTOP; //@line 296
   return;
  }
  ___async_unwind = 0; //@line 299
  HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 300
  $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 301
  HEAP32[$74 >> 2] = $2; //@line 302
  $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 303
  HEAP32[$75 >> 2] = $4; //@line 304
  $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 305
  HEAP32[$76 >> 2] = $6; //@line 306
  $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 307
  HEAP32[$77 >> 2] = $8; //@line 308
  $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 309
  HEAP32[$78 >> 2] = $10; //@line 310
  $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 311
  HEAP32[$79 >> 2] = $12; //@line 312
  $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 313
  HEAP32[$80 >> 2] = $14; //@line 314
  $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 315
  $$expand_i1_val31 = $16 & 1; //@line 316
  HEAP8[$81 >> 0] = $$expand_i1_val31; //@line 317
  $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 318
  HEAP32[$82 >> 2] = $18; //@line 319
  $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 320
  HEAP32[$83 >> 2] = $24; //@line 321
  $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 322
  HEAP32[$84 >> 2] = $26; //@line 323
  $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 324
  HEAP32[$85 >> 2] = $28; //@line 325
  $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 326
  HEAP32[$86 >> 2] = $$reg2mem23$0; //@line 327
  $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 328
  HEAP32[$87 >> 2] = $32; //@line 329
  $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 330
  HEAP32[$88 >> 2] = $34; //@line 331
  $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 332
  HEAP32[$89 >> 2] = $36; //@line 333
  $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 334
  HEAP32[$90 >> 2] = $38; //@line 335
  $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 336
  HEAP32[$91 >> 2] = $40; //@line 337
  sp = STACKTOP; //@line 338
  return;
 } else if ((label | 0) == 12) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 343
  FUNCTION_TABLE_vi[$102 & 127]($$06790$reg2mem$0 + 36 | 0); //@line 344
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 347
   $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 348
   HEAP32[$105 >> 2] = $2; //@line 349
   $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 350
   HEAP32[$106 >> 2] = $4; //@line 351
   $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 352
   HEAP32[$107 >> 2] = $6; //@line 353
   $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 354
   HEAP32[$108 >> 2] = $8; //@line 355
   $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 356
   HEAP32[$109 >> 2] = $10; //@line 357
   $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 358
   HEAP32[$110 >> 2] = $12; //@line 359
   $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 360
   HEAP32[$111 >> 2] = $14; //@line 361
   $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 362
   $$expand_i1_val33 = $16 & 1; //@line 363
   HEAP8[$112 >> 0] = $$expand_i1_val33; //@line 364
   $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 365
   HEAP32[$113 >> 2] = $18; //@line 366
   $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 367
   HEAP32[$114 >> 2] = $$reg2mem$0; //@line 368
   $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 369
   HEAP32[$115 >> 2] = $$06790$reg2mem$0; //@line 370
   $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 371
   HEAP32[$116 >> 2] = $24; //@line 372
   $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 373
   HEAP32[$117 >> 2] = $26; //@line 374
   $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 375
   HEAP32[$118 >> 2] = $28; //@line 376
   $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 377
   HEAP32[$119 >> 2] = $$reg2mem23$0; //@line 378
   $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 379
   HEAP32[$120 >> 2] = $32; //@line 380
   $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 381
   HEAP32[$121 >> 2] = $34; //@line 382
   $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 383
   HEAP32[$122 >> 2] = $36; //@line 384
   $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 385
   HEAP32[$123 >> 2] = $38; //@line 386
   $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 387
   HEAP32[$124 >> 2] = $40; //@line 388
   sp = STACKTOP; //@line 389
   return;
  }
  ___async_unwind = 0; //@line 392
  HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 393
  $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 394
  HEAP32[$105 >> 2] = $2; //@line 395
  $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 396
  HEAP32[$106 >> 2] = $4; //@line 397
  $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 398
  HEAP32[$107 >> 2] = $6; //@line 399
  $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 400
  HEAP32[$108 >> 2] = $8; //@line 401
  $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 402
  HEAP32[$109 >> 2] = $10; //@line 403
  $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 404
  HEAP32[$110 >> 2] = $12; //@line 405
  $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 406
  HEAP32[$111 >> 2] = $14; //@line 407
  $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 408
  $$expand_i1_val33 = $16 & 1; //@line 409
  HEAP8[$112 >> 0] = $$expand_i1_val33; //@line 410
  $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 411
  HEAP32[$113 >> 2] = $18; //@line 412
  $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 413
  HEAP32[$114 >> 2] = $$reg2mem$0; //@line 414
  $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 415
  HEAP32[$115 >> 2] = $$06790$reg2mem$0; //@line 416
  $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 417
  HEAP32[$116 >> 2] = $24; //@line 418
  $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 419
  HEAP32[$117 >> 2] = $26; //@line 420
  $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 421
  HEAP32[$118 >> 2] = $28; //@line 422
  $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 423
  HEAP32[$119 >> 2] = $$reg2mem23$0; //@line 424
  $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 425
  HEAP32[$120 >> 2] = $32; //@line 426
  $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 427
  HEAP32[$121 >> 2] = $34; //@line 428
  $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 429
  HEAP32[$122 >> 2] = $36; //@line 430
  $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 431
  HEAP32[$123 >> 2] = $38; //@line 432
  $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 433
  HEAP32[$124 >> 2] = $40; //@line 434
  sp = STACKTOP; //@line 435
  return;
 } else if ((label | 0) == 24) {
  $140 = _equeue_tick() | 0; //@line 439
  if ($16) {
   $141 = $18 - $140 | 0; //@line 441
   if (($141 | 0) < 1) {
    $143 = $14 + 40 | 0; //@line 444
    if (HEAP32[$143 >> 2] | 0) {
     _equeue_mutex_lock($2); //@line 448
     $146 = HEAP32[$143 >> 2] | 0; //@line 449
     if ($146 | 0) {
      $148 = HEAP32[$10 >> 2] | 0; //@line 452
      if ($148 | 0) {
       $151 = HEAP32[$14 + 44 >> 2] | 0; //@line 456
       $154 = (HEAP32[$148 + 20 >> 2] | 0) - $140 | 0; //@line 459
       $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 463
       FUNCTION_TABLE_vii[$146 & 3]($151, $154 & ~($154 >> 31)); //@line 464
       if (___async) {
        HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 467
        $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 468
        HEAP32[$158 >> 2] = $12; //@line 469
        $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 470
        HEAP32[$159 >> 2] = $2; //@line 471
        $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 472
        HEAP32[$160 >> 2] = $6; //@line 473
        sp = STACKTOP; //@line 474
        return;
       }
       ___async_unwind = 0; //@line 477
       HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 478
       $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 479
       HEAP32[$158 >> 2] = $12; //@line 480
       $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 481
       HEAP32[$159 >> 2] = $2; //@line 482
       $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 483
       HEAP32[$160 >> 2] = $6; //@line 484
       sp = STACKTOP; //@line 485
       return;
      }
     }
     HEAP8[$12 >> 0] = 1; //@line 489
     _equeue_mutex_unlock($2); //@line 490
    }
    HEAP8[$6 >> 0] = 0; //@line 492
    return;
   } else {
    $$065 = $141; //@line 495
   }
  } else {
   $$065 = -1; //@line 498
  }
  _equeue_mutex_lock($2); //@line 500
  $161 = HEAP32[$10 >> 2] | 0; //@line 501
  if (!$161) {
   $$2 = $$065; //@line 504
  } else {
   $165 = (HEAP32[$161 + 20 >> 2] | 0) - $140 | 0; //@line 508
   $168 = $165 & ~($165 >> 31); //@line 511
   $$2 = $168 >>> 0 < $$065 >>> 0 ? $168 : $$065; //@line 514
  }
  _equeue_mutex_unlock($2); //@line 516
  _equeue_sema_wait($4, $$2) | 0; //@line 517
  do {
   if (HEAP8[$6 >> 0] | 0) {
    _equeue_mutex_lock($2); //@line 522
    if (!(HEAP8[$6 >> 0] | 0)) {
     _equeue_mutex_unlock($2); //@line 526
     break;
    }
    HEAP8[$6 >> 0] = 0; //@line 529
    _equeue_mutex_unlock($2); //@line 530
    return;
   }
  } while (0);
  $174 = _equeue_tick() | 0; //@line 534
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 535
  _wait_ms(20); //@line 536
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 539
   $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 540
   HEAP32[$175 >> 2] = $8; //@line 541
   $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 542
   HEAP32[$176 >> 2] = $10; //@line 543
   $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 544
   HEAP32[$177 >> 2] = $2; //@line 545
   $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 546
   HEAP32[$178 >> 2] = $4; //@line 547
   $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 548
   HEAP32[$179 >> 2] = $6; //@line 549
   $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 550
   HEAP32[$180 >> 2] = $12; //@line 551
   $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 552
   HEAP32[$181 >> 2] = $14; //@line 553
   $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 554
   $$expand_i1_val35 = $16 & 1; //@line 555
   HEAP8[$182 >> 0] = $$expand_i1_val35; //@line 556
   $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 557
   HEAP32[$183 >> 2] = $18; //@line 558
   $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 559
   HEAP32[$184 >> 2] = $24; //@line 560
   $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 561
   HEAP32[$185 >> 2] = $26; //@line 562
   $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 563
   HEAP32[$186 >> 2] = $28; //@line 564
   $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 565
   HEAP32[$187 >> 2] = $32; //@line 566
   $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 567
   HEAP32[$188 >> 2] = $34; //@line 568
   $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 569
   HEAP32[$189 >> 2] = $36; //@line 570
   $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 571
   HEAP32[$190 >> 2] = $38; //@line 572
   $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 573
   HEAP32[$191 >> 2] = $40; //@line 574
   $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 575
   HEAP32[$192 >> 2] = $174; //@line 576
   sp = STACKTOP; //@line 577
   return;
  }
  ___async_unwind = 0; //@line 580
  HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 581
  $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 582
  HEAP32[$175 >> 2] = $8; //@line 583
  $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 584
  HEAP32[$176 >> 2] = $10; //@line 585
  $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 586
  HEAP32[$177 >> 2] = $2; //@line 587
  $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 588
  HEAP32[$178 >> 2] = $4; //@line 589
  $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 590
  HEAP32[$179 >> 2] = $6; //@line 591
  $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 592
  HEAP32[$180 >> 2] = $12; //@line 593
  $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 594
  HEAP32[$181 >> 2] = $14; //@line 595
  $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 596
  $$expand_i1_val35 = $16 & 1; //@line 597
  HEAP8[$182 >> 0] = $$expand_i1_val35; //@line 598
  $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 599
  HEAP32[$183 >> 2] = $18; //@line 600
  $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 601
  HEAP32[$184 >> 2] = $24; //@line 602
  $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 603
  HEAP32[$185 >> 2] = $26; //@line 604
  $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 605
  HEAP32[$186 >> 2] = $28; //@line 606
  $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 607
  HEAP32[$187 >> 2] = $32; //@line 608
  $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 609
  HEAP32[$188 >> 2] = $34; //@line 610
  $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 611
  HEAP32[$189 >> 2] = $36; //@line 612
  $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 613
  HEAP32[$190 >> 2] = $38; //@line 614
  $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 615
  HEAP32[$191 >> 2] = $40; //@line 616
  $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 617
  HEAP32[$192 >> 2] = $174; //@line 618
  sp = STACKTOP; //@line 619
  return;
 }
}
function _equeue_dispatch__async_cb_50($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$065 = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val12 = 0, $$expand_i1_val14 = 0, $$expand_i1_val16 = 0, $$reg2mem$0 = 0, $$sink$in$i$i = 0, $10 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $123 = 0, $124 = 0, $125 = 0, $127 = 0, $128 = 0, $136 = 0, $137 = 0, $139 = 0, $14 = 0, $142 = 0, $144 = 0, $147 = 0, $150 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $16 = 0, $161 = 0, $164 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $40 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $64 = 0, $66 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $98 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1274
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1276
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1278
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1280
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1282
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1284
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1286
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1288
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 1291
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1293
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1295
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1297
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1299
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 1303
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 1305
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 1307
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 1309
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 1311
 $$reg2mem$0 = HEAP32[$0 + 52 >> 2] | 0; //@line 1312
 while (1) {
  if (!$$reg2mem$0) {
   label = 24; //@line 1316
   break;
  }
  $37 = $$reg2mem$0 + 8 | 0; //@line 1319
  $38 = HEAP32[$37 >> 2] | 0; //@line 1320
  $40 = HEAP32[$$reg2mem$0 + 32 >> 2] | 0; //@line 1322
  if ($40 | 0) {
   label = 3; //@line 1325
   break;
  }
  $64 = HEAP32[$$reg2mem$0 + 24 >> 2] | 0; //@line 1329
  if (($64 | 0) > -1) {
   label = 7; //@line 1332
   break;
  }
  $88 = $$reg2mem$0 + 4 | 0; //@line 1336
  $89 = HEAP8[$88 >> 0] | 0; //@line 1337
  HEAP8[$88 >> 0] = (($89 + 1 & 255) << HEAP32[$36 >> 2] | 0) == 0 ? 1 : ($89 & 255) + 1 & 255; //@line 1346
  $98 = HEAP32[$$reg2mem$0 + 28 >> 2] | 0; //@line 1348
  if ($98 | 0) {
   label = 12; //@line 1351
   break;
  }
  _equeue_mutex_lock($20); //@line 1354
  $121 = HEAP32[$34 >> 2] | 0; //@line 1355
  L8 : do {
   if (!$121) {
    $$02329$i$i = $34; //@line 1359
    label = 21; //@line 1360
   } else {
    $123 = HEAP32[$$reg2mem$0 >> 2] | 0; //@line 1362
    $$025$i$i = $34; //@line 1363
    $125 = $121; //@line 1363
    while (1) {
     $124 = HEAP32[$125 >> 2] | 0; //@line 1365
     if ($124 >>> 0 >= $123 >>> 0) {
      break;
     }
     $127 = $125 + 8 | 0; //@line 1370
     $128 = HEAP32[$127 >> 2] | 0; //@line 1371
     if (!$128) {
      $$02329$i$i = $127; //@line 1374
      label = 21; //@line 1375
      break L8;
     } else {
      $$025$i$i = $127; //@line 1378
      $125 = $128; //@line 1378
     }
    }
    if (($124 | 0) == ($123 | 0)) {
     HEAP32[$$reg2mem$0 + 12 >> 2] = $125; //@line 1384
     $$02330$i$i = $$025$i$i; //@line 1387
     $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 1387
    } else {
     $$02329$i$i = $$025$i$i; //@line 1389
     label = 21; //@line 1390
    }
   }
  } while (0);
  if ((label | 0) == 21) {
   label = 0; //@line 1395
   HEAP32[$$reg2mem$0 + 12 >> 2] = 0; //@line 1397
   $$02330$i$i = $$02329$i$i; //@line 1398
   $$sink$in$i$i = $$02329$i$i; //@line 1398
  }
  HEAP32[$37 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 1401
  HEAP32[$$02330$i$i >> 2] = $$reg2mem$0; //@line 1402
  _equeue_mutex_unlock($20); //@line 1403
  $$reg2mem$0 = $38; //@line 1404
 }
 if ((label | 0) == 3) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 1408
  FUNCTION_TABLE_vi[$40 & 127]($$reg2mem$0 + 36 | 0); //@line 1409
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 1412
   $43 = $ReallocAsyncCtx + 4 | 0; //@line 1413
   HEAP32[$43 >> 2] = $2; //@line 1414
   $44 = $ReallocAsyncCtx + 8 | 0; //@line 1415
   HEAP32[$44 >> 2] = $4; //@line 1416
   $45 = $ReallocAsyncCtx + 12 | 0; //@line 1417
   HEAP32[$45 >> 2] = $6; //@line 1418
   $46 = $ReallocAsyncCtx + 16 | 0; //@line 1419
   HEAP32[$46 >> 2] = $8; //@line 1420
   $47 = $ReallocAsyncCtx + 20 | 0; //@line 1421
   HEAP32[$47 >> 2] = $10; //@line 1422
   $48 = $ReallocAsyncCtx + 24 | 0; //@line 1423
   HEAP32[$48 >> 2] = $12; //@line 1424
   $49 = $ReallocAsyncCtx + 28 | 0; //@line 1425
   HEAP32[$49 >> 2] = $14; //@line 1426
   $50 = $ReallocAsyncCtx + 32 | 0; //@line 1427
   $$expand_i1_val = $16 & 1; //@line 1428
   HEAP8[$50 >> 0] = $$expand_i1_val; //@line 1429
   $51 = $ReallocAsyncCtx + 36 | 0; //@line 1430
   HEAP32[$51 >> 2] = $18; //@line 1431
   $52 = $ReallocAsyncCtx + 40 | 0; //@line 1432
   HEAP32[$52 >> 2] = $37; //@line 1433
   $53 = $ReallocAsyncCtx + 44 | 0; //@line 1434
   HEAP32[$53 >> 2] = $$reg2mem$0; //@line 1435
   $54 = $ReallocAsyncCtx + 48 | 0; //@line 1436
   HEAP32[$54 >> 2] = $20; //@line 1437
   $55 = $ReallocAsyncCtx + 52 | 0; //@line 1438
   HEAP32[$55 >> 2] = $22; //@line 1439
   $56 = $ReallocAsyncCtx + 56 | 0; //@line 1440
   HEAP32[$56 >> 2] = $24; //@line 1441
   $57 = $ReallocAsyncCtx + 60 | 0; //@line 1442
   HEAP32[$57 >> 2] = $38; //@line 1443
   $58 = $ReallocAsyncCtx + 64 | 0; //@line 1444
   HEAP32[$58 >> 2] = $28; //@line 1445
   $59 = $ReallocAsyncCtx + 68 | 0; //@line 1446
   HEAP32[$59 >> 2] = $30; //@line 1447
   $60 = $ReallocAsyncCtx + 72 | 0; //@line 1448
   HEAP32[$60 >> 2] = $32; //@line 1449
   $61 = $ReallocAsyncCtx + 76 | 0; //@line 1450
   HEAP32[$61 >> 2] = $34; //@line 1451
   $62 = $ReallocAsyncCtx + 80 | 0; //@line 1452
   HEAP32[$62 >> 2] = $36; //@line 1453
   sp = STACKTOP; //@line 1454
   return;
  }
  ___async_unwind = 0; //@line 1457
  HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 1458
  $43 = $ReallocAsyncCtx + 4 | 0; //@line 1459
  HEAP32[$43 >> 2] = $2; //@line 1460
  $44 = $ReallocAsyncCtx + 8 | 0; //@line 1461
  HEAP32[$44 >> 2] = $4; //@line 1462
  $45 = $ReallocAsyncCtx + 12 | 0; //@line 1463
  HEAP32[$45 >> 2] = $6; //@line 1464
  $46 = $ReallocAsyncCtx + 16 | 0; //@line 1465
  HEAP32[$46 >> 2] = $8; //@line 1466
  $47 = $ReallocAsyncCtx + 20 | 0; //@line 1467
  HEAP32[$47 >> 2] = $10; //@line 1468
  $48 = $ReallocAsyncCtx + 24 | 0; //@line 1469
  HEAP32[$48 >> 2] = $12; //@line 1470
  $49 = $ReallocAsyncCtx + 28 | 0; //@line 1471
  HEAP32[$49 >> 2] = $14; //@line 1472
  $50 = $ReallocAsyncCtx + 32 | 0; //@line 1473
  $$expand_i1_val = $16 & 1; //@line 1474
  HEAP8[$50 >> 0] = $$expand_i1_val; //@line 1475
  $51 = $ReallocAsyncCtx + 36 | 0; //@line 1476
  HEAP32[$51 >> 2] = $18; //@line 1477
  $52 = $ReallocAsyncCtx + 40 | 0; //@line 1478
  HEAP32[$52 >> 2] = $37; //@line 1479
  $53 = $ReallocAsyncCtx + 44 | 0; //@line 1480
  HEAP32[$53 >> 2] = $$reg2mem$0; //@line 1481
  $54 = $ReallocAsyncCtx + 48 | 0; //@line 1482
  HEAP32[$54 >> 2] = $20; //@line 1483
  $55 = $ReallocAsyncCtx + 52 | 0; //@line 1484
  HEAP32[$55 >> 2] = $22; //@line 1485
  $56 = $ReallocAsyncCtx + 56 | 0; //@line 1486
  HEAP32[$56 >> 2] = $24; //@line 1487
  $57 = $ReallocAsyncCtx + 60 | 0; //@line 1488
  HEAP32[$57 >> 2] = $38; //@line 1489
  $58 = $ReallocAsyncCtx + 64 | 0; //@line 1490
  HEAP32[$58 >> 2] = $28; //@line 1491
  $59 = $ReallocAsyncCtx + 68 | 0; //@line 1492
  HEAP32[$59 >> 2] = $30; //@line 1493
  $60 = $ReallocAsyncCtx + 72 | 0; //@line 1494
  HEAP32[$60 >> 2] = $32; //@line 1495
  $61 = $ReallocAsyncCtx + 76 | 0; //@line 1496
  HEAP32[$61 >> 2] = $34; //@line 1497
  $62 = $ReallocAsyncCtx + 80 | 0; //@line 1498
  HEAP32[$62 >> 2] = $36; //@line 1499
  sp = STACKTOP; //@line 1500
  return;
 } else if ((label | 0) == 7) {
  $66 = $$reg2mem$0 + 20 | 0; //@line 1504
  HEAP32[$66 >> 2] = (HEAP32[$66 >> 2] | 0) + $64; //@line 1507
  $69 = _equeue_tick() | 0; //@line 1508
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 1509
  _equeue_enqueue($14, $$reg2mem$0, $69) | 0; //@line 1510
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 1513
   $70 = $ReallocAsyncCtx4 + 4 | 0; //@line 1514
   HEAP32[$70 >> 2] = $2; //@line 1515
   $71 = $ReallocAsyncCtx4 + 8 | 0; //@line 1516
   HEAP32[$71 >> 2] = $4; //@line 1517
   $72 = $ReallocAsyncCtx4 + 12 | 0; //@line 1518
   HEAP32[$72 >> 2] = $6; //@line 1519
   $73 = $ReallocAsyncCtx4 + 16 | 0; //@line 1520
   HEAP32[$73 >> 2] = $8; //@line 1521
   $74 = $ReallocAsyncCtx4 + 20 | 0; //@line 1522
   HEAP32[$74 >> 2] = $10; //@line 1523
   $75 = $ReallocAsyncCtx4 + 24 | 0; //@line 1524
   HEAP32[$75 >> 2] = $12; //@line 1525
   $76 = $ReallocAsyncCtx4 + 28 | 0; //@line 1526
   HEAP32[$76 >> 2] = $14; //@line 1527
   $77 = $ReallocAsyncCtx4 + 32 | 0; //@line 1528
   $$expand_i1_val12 = $16 & 1; //@line 1529
   HEAP8[$77 >> 0] = $$expand_i1_val12; //@line 1530
   $78 = $ReallocAsyncCtx4 + 36 | 0; //@line 1531
   HEAP32[$78 >> 2] = $18; //@line 1532
   $79 = $ReallocAsyncCtx4 + 40 | 0; //@line 1533
   HEAP32[$79 >> 2] = $20; //@line 1534
   $80 = $ReallocAsyncCtx4 + 44 | 0; //@line 1535
   HEAP32[$80 >> 2] = $22; //@line 1536
   $81 = $ReallocAsyncCtx4 + 48 | 0; //@line 1537
   HEAP32[$81 >> 2] = $24; //@line 1538
   $82 = $ReallocAsyncCtx4 + 52 | 0; //@line 1539
   HEAP32[$82 >> 2] = $38; //@line 1540
   $83 = $ReallocAsyncCtx4 + 56 | 0; //@line 1541
   HEAP32[$83 >> 2] = $28; //@line 1542
   $84 = $ReallocAsyncCtx4 + 60 | 0; //@line 1543
   HEAP32[$84 >> 2] = $30; //@line 1544
   $85 = $ReallocAsyncCtx4 + 64 | 0; //@line 1545
   HEAP32[$85 >> 2] = $32; //@line 1546
   $86 = $ReallocAsyncCtx4 + 68 | 0; //@line 1547
   HEAP32[$86 >> 2] = $34; //@line 1548
   $87 = $ReallocAsyncCtx4 + 72 | 0; //@line 1549
   HEAP32[$87 >> 2] = $36; //@line 1550
   sp = STACKTOP; //@line 1551
   return;
  }
  ___async_unwind = 0; //@line 1554
  HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 1555
  $70 = $ReallocAsyncCtx4 + 4 | 0; //@line 1556
  HEAP32[$70 >> 2] = $2; //@line 1557
  $71 = $ReallocAsyncCtx4 + 8 | 0; //@line 1558
  HEAP32[$71 >> 2] = $4; //@line 1559
  $72 = $ReallocAsyncCtx4 + 12 | 0; //@line 1560
  HEAP32[$72 >> 2] = $6; //@line 1561
  $73 = $ReallocAsyncCtx4 + 16 | 0; //@line 1562
  HEAP32[$73 >> 2] = $8; //@line 1563
  $74 = $ReallocAsyncCtx4 + 20 | 0; //@line 1564
  HEAP32[$74 >> 2] = $10; //@line 1565
  $75 = $ReallocAsyncCtx4 + 24 | 0; //@line 1566
  HEAP32[$75 >> 2] = $12; //@line 1567
  $76 = $ReallocAsyncCtx4 + 28 | 0; //@line 1568
  HEAP32[$76 >> 2] = $14; //@line 1569
  $77 = $ReallocAsyncCtx4 + 32 | 0; //@line 1570
  $$expand_i1_val12 = $16 & 1; //@line 1571
  HEAP8[$77 >> 0] = $$expand_i1_val12; //@line 1572
  $78 = $ReallocAsyncCtx4 + 36 | 0; //@line 1573
  HEAP32[$78 >> 2] = $18; //@line 1574
  $79 = $ReallocAsyncCtx4 + 40 | 0; //@line 1575
  HEAP32[$79 >> 2] = $20; //@line 1576
  $80 = $ReallocAsyncCtx4 + 44 | 0; //@line 1577
  HEAP32[$80 >> 2] = $22; //@line 1578
  $81 = $ReallocAsyncCtx4 + 48 | 0; //@line 1579
  HEAP32[$81 >> 2] = $24; //@line 1580
  $82 = $ReallocAsyncCtx4 + 52 | 0; //@line 1581
  HEAP32[$82 >> 2] = $38; //@line 1582
  $83 = $ReallocAsyncCtx4 + 56 | 0; //@line 1583
  HEAP32[$83 >> 2] = $28; //@line 1584
  $84 = $ReallocAsyncCtx4 + 60 | 0; //@line 1585
  HEAP32[$84 >> 2] = $30; //@line 1586
  $85 = $ReallocAsyncCtx4 + 64 | 0; //@line 1587
  HEAP32[$85 >> 2] = $32; //@line 1588
  $86 = $ReallocAsyncCtx4 + 68 | 0; //@line 1589
  HEAP32[$86 >> 2] = $34; //@line 1590
  $87 = $ReallocAsyncCtx4 + 72 | 0; //@line 1591
  HEAP32[$87 >> 2] = $36; //@line 1592
  sp = STACKTOP; //@line 1593
  return;
 } else if ((label | 0) == 12) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 1598
  FUNCTION_TABLE_vi[$98 & 127]($$reg2mem$0 + 36 | 0); //@line 1599
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 1602
   $101 = $ReallocAsyncCtx2 + 4 | 0; //@line 1603
   HEAP32[$101 >> 2] = $2; //@line 1604
   $102 = $ReallocAsyncCtx2 + 8 | 0; //@line 1605
   HEAP32[$102 >> 2] = $4; //@line 1606
   $103 = $ReallocAsyncCtx2 + 12 | 0; //@line 1607
   HEAP32[$103 >> 2] = $6; //@line 1608
   $104 = $ReallocAsyncCtx2 + 16 | 0; //@line 1609
   HEAP32[$104 >> 2] = $8; //@line 1610
   $105 = $ReallocAsyncCtx2 + 20 | 0; //@line 1611
   HEAP32[$105 >> 2] = $10; //@line 1612
   $106 = $ReallocAsyncCtx2 + 24 | 0; //@line 1613
   HEAP32[$106 >> 2] = $12; //@line 1614
   $107 = $ReallocAsyncCtx2 + 28 | 0; //@line 1615
   HEAP32[$107 >> 2] = $14; //@line 1616
   $108 = $ReallocAsyncCtx2 + 32 | 0; //@line 1617
   $$expand_i1_val14 = $16 & 1; //@line 1618
   HEAP8[$108 >> 0] = $$expand_i1_val14; //@line 1619
   $109 = $ReallocAsyncCtx2 + 36 | 0; //@line 1620
   HEAP32[$109 >> 2] = $18; //@line 1621
   $110 = $ReallocAsyncCtx2 + 40 | 0; //@line 1622
   HEAP32[$110 >> 2] = $37; //@line 1623
   $111 = $ReallocAsyncCtx2 + 44 | 0; //@line 1624
   HEAP32[$111 >> 2] = $$reg2mem$0; //@line 1625
   $112 = $ReallocAsyncCtx2 + 48 | 0; //@line 1626
   HEAP32[$112 >> 2] = $20; //@line 1627
   $113 = $ReallocAsyncCtx2 + 52 | 0; //@line 1628
   HEAP32[$113 >> 2] = $22; //@line 1629
   $114 = $ReallocAsyncCtx2 + 56 | 0; //@line 1630
   HEAP32[$114 >> 2] = $24; //@line 1631
   $115 = $ReallocAsyncCtx2 + 60 | 0; //@line 1632
   HEAP32[$115 >> 2] = $38; //@line 1633
   $116 = $ReallocAsyncCtx2 + 64 | 0; //@line 1634
   HEAP32[$116 >> 2] = $28; //@line 1635
   $117 = $ReallocAsyncCtx2 + 68 | 0; //@line 1636
   HEAP32[$117 >> 2] = $30; //@line 1637
   $118 = $ReallocAsyncCtx2 + 72 | 0; //@line 1638
   HEAP32[$118 >> 2] = $32; //@line 1639
   $119 = $ReallocAsyncCtx2 + 76 | 0; //@line 1640
   HEAP32[$119 >> 2] = $34; //@line 1641
   $120 = $ReallocAsyncCtx2 + 80 | 0; //@line 1642
   HEAP32[$120 >> 2] = $36; //@line 1643
   sp = STACKTOP; //@line 1644
   return;
  }
  ___async_unwind = 0; //@line 1647
  HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 1648
  $101 = $ReallocAsyncCtx2 + 4 | 0; //@line 1649
  HEAP32[$101 >> 2] = $2; //@line 1650
  $102 = $ReallocAsyncCtx2 + 8 | 0; //@line 1651
  HEAP32[$102 >> 2] = $4; //@line 1652
  $103 = $ReallocAsyncCtx2 + 12 | 0; //@line 1653
  HEAP32[$103 >> 2] = $6; //@line 1654
  $104 = $ReallocAsyncCtx2 + 16 | 0; //@line 1655
  HEAP32[$104 >> 2] = $8; //@line 1656
  $105 = $ReallocAsyncCtx2 + 20 | 0; //@line 1657
  HEAP32[$105 >> 2] = $10; //@line 1658
  $106 = $ReallocAsyncCtx2 + 24 | 0; //@line 1659
  HEAP32[$106 >> 2] = $12; //@line 1660
  $107 = $ReallocAsyncCtx2 + 28 | 0; //@line 1661
  HEAP32[$107 >> 2] = $14; //@line 1662
  $108 = $ReallocAsyncCtx2 + 32 | 0; //@line 1663
  $$expand_i1_val14 = $16 & 1; //@line 1664
  HEAP8[$108 >> 0] = $$expand_i1_val14; //@line 1665
  $109 = $ReallocAsyncCtx2 + 36 | 0; //@line 1666
  HEAP32[$109 >> 2] = $18; //@line 1667
  $110 = $ReallocAsyncCtx2 + 40 | 0; //@line 1668
  HEAP32[$110 >> 2] = $37; //@line 1669
  $111 = $ReallocAsyncCtx2 + 44 | 0; //@line 1670
  HEAP32[$111 >> 2] = $$reg2mem$0; //@line 1671
  $112 = $ReallocAsyncCtx2 + 48 | 0; //@line 1672
  HEAP32[$112 >> 2] = $20; //@line 1673
  $113 = $ReallocAsyncCtx2 + 52 | 0; //@line 1674
  HEAP32[$113 >> 2] = $22; //@line 1675
  $114 = $ReallocAsyncCtx2 + 56 | 0; //@line 1676
  HEAP32[$114 >> 2] = $24; //@line 1677
  $115 = $ReallocAsyncCtx2 + 60 | 0; //@line 1678
  HEAP32[$115 >> 2] = $38; //@line 1679
  $116 = $ReallocAsyncCtx2 + 64 | 0; //@line 1680
  HEAP32[$116 >> 2] = $28; //@line 1681
  $117 = $ReallocAsyncCtx2 + 68 | 0; //@line 1682
  HEAP32[$117 >> 2] = $30; //@line 1683
  $118 = $ReallocAsyncCtx2 + 72 | 0; //@line 1684
  HEAP32[$118 >> 2] = $32; //@line 1685
  $119 = $ReallocAsyncCtx2 + 76 | 0; //@line 1686
  HEAP32[$119 >> 2] = $34; //@line 1687
  $120 = $ReallocAsyncCtx2 + 80 | 0; //@line 1688
  HEAP32[$120 >> 2] = $36; //@line 1689
  sp = STACKTOP; //@line 1690
  return;
 } else if ((label | 0) == 24) {
  $136 = _equeue_tick() | 0; //@line 1694
  if ($16) {
   $137 = $18 - $136 | 0; //@line 1696
   if (($137 | 0) < 1) {
    $139 = $14 + 40 | 0; //@line 1699
    if (HEAP32[$139 >> 2] | 0) {
     _equeue_mutex_lock($2); //@line 1703
     $142 = HEAP32[$139 >> 2] | 0; //@line 1704
     if ($142 | 0) {
      $144 = HEAP32[$10 >> 2] | 0; //@line 1707
      if ($144 | 0) {
       $147 = HEAP32[$14 + 44 >> 2] | 0; //@line 1711
       $150 = (HEAP32[$144 + 20 >> 2] | 0) - $136 | 0; //@line 1714
       $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 1718
       FUNCTION_TABLE_vii[$142 & 3]($147, $150 & ~($150 >> 31)); //@line 1719
       if (___async) {
        HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 1722
        $154 = $ReallocAsyncCtx3 + 4 | 0; //@line 1723
        HEAP32[$154 >> 2] = $12; //@line 1724
        $155 = $ReallocAsyncCtx3 + 8 | 0; //@line 1725
        HEAP32[$155 >> 2] = $2; //@line 1726
        $156 = $ReallocAsyncCtx3 + 12 | 0; //@line 1727
        HEAP32[$156 >> 2] = $6; //@line 1728
        sp = STACKTOP; //@line 1729
        return;
       }
       ___async_unwind = 0; //@line 1732
       HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 1733
       $154 = $ReallocAsyncCtx3 + 4 | 0; //@line 1734
       HEAP32[$154 >> 2] = $12; //@line 1735
       $155 = $ReallocAsyncCtx3 + 8 | 0; //@line 1736
       HEAP32[$155 >> 2] = $2; //@line 1737
       $156 = $ReallocAsyncCtx3 + 12 | 0; //@line 1738
       HEAP32[$156 >> 2] = $6; //@line 1739
       sp = STACKTOP; //@line 1740
       return;
      }
     }
     HEAP8[$12 >> 0] = 1; //@line 1744
     _equeue_mutex_unlock($2); //@line 1745
    }
    HEAP8[$6 >> 0] = 0; //@line 1747
    return;
   } else {
    $$065 = $137; //@line 1750
   }
  } else {
   $$065 = -1; //@line 1753
  }
  _equeue_mutex_lock($2); //@line 1755
  $157 = HEAP32[$10 >> 2] | 0; //@line 1756
  if (!$157) {
   $$2 = $$065; //@line 1759
  } else {
   $161 = (HEAP32[$157 + 20 >> 2] | 0) - $136 | 0; //@line 1763
   $164 = $161 & ~($161 >> 31); //@line 1766
   $$2 = $164 >>> 0 < $$065 >>> 0 ? $164 : $$065; //@line 1769
  }
  _equeue_mutex_unlock($2); //@line 1771
  _equeue_sema_wait($4, $$2) | 0; //@line 1772
  do {
   if (HEAP8[$6 >> 0] | 0) {
    _equeue_mutex_lock($2); //@line 1777
    if (!(HEAP8[$6 >> 0] | 0)) {
     _equeue_mutex_unlock($2); //@line 1781
     break;
    }
    HEAP8[$6 >> 0] = 0; //@line 1784
    _equeue_mutex_unlock($2); //@line 1785
    return;
   }
  } while (0);
  $170 = _equeue_tick() | 0; //@line 1789
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 1790
  _wait_ms(20); //@line 1791
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 1794
   $171 = $ReallocAsyncCtx5 + 4 | 0; //@line 1795
   HEAP32[$171 >> 2] = $8; //@line 1796
   $172 = $ReallocAsyncCtx5 + 8 | 0; //@line 1797
   HEAP32[$172 >> 2] = $10; //@line 1798
   $173 = $ReallocAsyncCtx5 + 12 | 0; //@line 1799
   HEAP32[$173 >> 2] = $2; //@line 1800
   $174 = $ReallocAsyncCtx5 + 16 | 0; //@line 1801
   HEAP32[$174 >> 2] = $4; //@line 1802
   $175 = $ReallocAsyncCtx5 + 20 | 0; //@line 1803
   HEAP32[$175 >> 2] = $6; //@line 1804
   $176 = $ReallocAsyncCtx5 + 24 | 0; //@line 1805
   HEAP32[$176 >> 2] = $12; //@line 1806
   $177 = $ReallocAsyncCtx5 + 28 | 0; //@line 1807
   HEAP32[$177 >> 2] = $14; //@line 1808
   $178 = $ReallocAsyncCtx5 + 32 | 0; //@line 1809
   $$expand_i1_val16 = $16 & 1; //@line 1810
   HEAP8[$178 >> 0] = $$expand_i1_val16; //@line 1811
   $179 = $ReallocAsyncCtx5 + 36 | 0; //@line 1812
   HEAP32[$179 >> 2] = $18; //@line 1813
   $180 = $ReallocAsyncCtx5 + 40 | 0; //@line 1814
   HEAP32[$180 >> 2] = $20; //@line 1815
   $181 = $ReallocAsyncCtx5 + 44 | 0; //@line 1816
   HEAP32[$181 >> 2] = $22; //@line 1817
   $182 = $ReallocAsyncCtx5 + 48 | 0; //@line 1818
   HEAP32[$182 >> 2] = $24; //@line 1819
   $183 = $ReallocAsyncCtx5 + 52 | 0; //@line 1820
   HEAP32[$183 >> 2] = $28; //@line 1821
   $184 = $ReallocAsyncCtx5 + 56 | 0; //@line 1822
   HEAP32[$184 >> 2] = $30; //@line 1823
   $185 = $ReallocAsyncCtx5 + 60 | 0; //@line 1824
   HEAP32[$185 >> 2] = $32; //@line 1825
   $186 = $ReallocAsyncCtx5 + 64 | 0; //@line 1826
   HEAP32[$186 >> 2] = $34; //@line 1827
   $187 = $ReallocAsyncCtx5 + 68 | 0; //@line 1828
   HEAP32[$187 >> 2] = $36; //@line 1829
   $188 = $ReallocAsyncCtx5 + 72 | 0; //@line 1830
   HEAP32[$188 >> 2] = $170; //@line 1831
   sp = STACKTOP; //@line 1832
   return;
  }
  ___async_unwind = 0; //@line 1835
  HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 1836
  $171 = $ReallocAsyncCtx5 + 4 | 0; //@line 1837
  HEAP32[$171 >> 2] = $8; //@line 1838
  $172 = $ReallocAsyncCtx5 + 8 | 0; //@line 1839
  HEAP32[$172 >> 2] = $10; //@line 1840
  $173 = $ReallocAsyncCtx5 + 12 | 0; //@line 1841
  HEAP32[$173 >> 2] = $2; //@line 1842
  $174 = $ReallocAsyncCtx5 + 16 | 0; //@line 1843
  HEAP32[$174 >> 2] = $4; //@line 1844
  $175 = $ReallocAsyncCtx5 + 20 | 0; //@line 1845
  HEAP32[$175 >> 2] = $6; //@line 1846
  $176 = $ReallocAsyncCtx5 + 24 | 0; //@line 1847
  HEAP32[$176 >> 2] = $12; //@line 1848
  $177 = $ReallocAsyncCtx5 + 28 | 0; //@line 1849
  HEAP32[$177 >> 2] = $14; //@line 1850
  $178 = $ReallocAsyncCtx5 + 32 | 0; //@line 1851
  $$expand_i1_val16 = $16 & 1; //@line 1852
  HEAP8[$178 >> 0] = $$expand_i1_val16; //@line 1853
  $179 = $ReallocAsyncCtx5 + 36 | 0; //@line 1854
  HEAP32[$179 >> 2] = $18; //@line 1855
  $180 = $ReallocAsyncCtx5 + 40 | 0; //@line 1856
  HEAP32[$180 >> 2] = $20; //@line 1857
  $181 = $ReallocAsyncCtx5 + 44 | 0; //@line 1858
  HEAP32[$181 >> 2] = $22; //@line 1859
  $182 = $ReallocAsyncCtx5 + 48 | 0; //@line 1860
  HEAP32[$182 >> 2] = $24; //@line 1861
  $183 = $ReallocAsyncCtx5 + 52 | 0; //@line 1862
  HEAP32[$183 >> 2] = $28; //@line 1863
  $184 = $ReallocAsyncCtx5 + 56 | 0; //@line 1864
  HEAP32[$184 >> 2] = $30; //@line 1865
  $185 = $ReallocAsyncCtx5 + 60 | 0; //@line 1866
  HEAP32[$185 >> 2] = $32; //@line 1867
  $186 = $ReallocAsyncCtx5 + 64 | 0; //@line 1868
  HEAP32[$186 >> 2] = $34; //@line 1869
  $187 = $ReallocAsyncCtx5 + 68 | 0; //@line 1870
  HEAP32[$187 >> 2] = $36; //@line 1871
  $188 = $ReallocAsyncCtx5 + 72 | 0; //@line 1872
  HEAP32[$188 >> 2] = $170; //@line 1873
  sp = STACKTOP; //@line 1874
  return;
 }
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 7207
 STACKTOP = STACKTOP + 64 | 0; //@line 7208
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 7208
 $5 = sp + 16 | 0; //@line 7209
 $6 = sp; //@line 7210
 $7 = sp + 24 | 0; //@line 7211
 $8 = sp + 8 | 0; //@line 7212
 $9 = sp + 20 | 0; //@line 7213
 HEAP32[$5 >> 2] = $1; //@line 7214
 $10 = ($0 | 0) != 0; //@line 7215
 $11 = $7 + 40 | 0; //@line 7216
 $12 = $11; //@line 7217
 $13 = $7 + 39 | 0; //@line 7218
 $14 = $8 + 4 | 0; //@line 7219
 $$0243 = 0; //@line 7220
 $$0247 = 0; //@line 7220
 $$0269 = 0; //@line 7220
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 7229
     $$1248 = -1; //@line 7230
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 7234
     break;
    }
   } else {
    $$1248 = $$0247; //@line 7238
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 7241
  $21 = HEAP8[$20 >> 0] | 0; //@line 7242
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 7245
   break;
  } else {
   $23 = $21; //@line 7248
   $25 = $20; //@line 7248
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 7253
     $27 = $25; //@line 7253
     label = 9; //@line 7254
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 7259
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 7266
   HEAP32[$5 >> 2] = $24; //@line 7267
   $23 = HEAP8[$24 >> 0] | 0; //@line 7269
   $25 = $24; //@line 7269
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 7274
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 7279
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 7282
     $27 = $27 + 2 | 0; //@line 7283
     HEAP32[$5 >> 2] = $27; //@line 7284
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 7291
      break;
     } else {
      $$0249303 = $30; //@line 7288
      label = 9; //@line 7289
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 7299
  if ($10) {
   _out_670($0, $20, $36); //@line 7301
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 7305
   $$0247 = $$1248; //@line 7305
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 7313
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 7314
  if ($43) {
   $$0253 = -1; //@line 7316
   $$1270 = $$0269; //@line 7316
   $$sink = 1; //@line 7316
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 7326
    $$1270 = 1; //@line 7326
    $$sink = 3; //@line 7326
   } else {
    $$0253 = -1; //@line 7328
    $$1270 = $$0269; //@line 7328
    $$sink = 1; //@line 7328
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 7331
  HEAP32[$5 >> 2] = $51; //@line 7332
  $52 = HEAP8[$51 >> 0] | 0; //@line 7333
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 7335
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 7342
   $$lcssa291 = $52; //@line 7342
   $$lcssa292 = $51; //@line 7342
  } else {
   $$0262309 = 0; //@line 7344
   $60 = $52; //@line 7344
   $65 = $51; //@line 7344
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 7349
    $64 = $65 + 1 | 0; //@line 7350
    HEAP32[$5 >> 2] = $64; //@line 7351
    $66 = HEAP8[$64 >> 0] | 0; //@line 7352
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 7354
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 7361
     $$lcssa291 = $66; //@line 7361
     $$lcssa292 = $64; //@line 7361
     break;
    } else {
     $$0262309 = $63; //@line 7364
     $60 = $66; //@line 7364
     $65 = $64; //@line 7364
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 7376
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 7378
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 7383
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 7388
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 7400
     $$2271 = 1; //@line 7400
     $storemerge274 = $79 + 3 | 0; //@line 7400
    } else {
     label = 23; //@line 7402
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 7406
    if ($$1270 | 0) {
     $$0 = -1; //@line 7409
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7424
     $106 = HEAP32[$105 >> 2] | 0; //@line 7425
     HEAP32[$2 >> 2] = $105 + 4; //@line 7427
     $363 = $106; //@line 7428
    } else {
     $363 = 0; //@line 7430
    }
    $$0259 = $363; //@line 7434
    $$2271 = 0; //@line 7434
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 7434
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 7436
   $109 = ($$0259 | 0) < 0; //@line 7437
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 7442
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 7442
   $$3272 = $$2271; //@line 7442
   $115 = $storemerge274; //@line 7442
  } else {
   $112 = _getint_671($5) | 0; //@line 7444
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 7447
    break;
   }
   $$1260 = $112; //@line 7451
   $$1263 = $$0262$lcssa; //@line 7451
   $$3272 = $$1270; //@line 7451
   $115 = HEAP32[$5 >> 2] | 0; //@line 7451
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 7462
     $156 = _getint_671($5) | 0; //@line 7463
     $$0254 = $156; //@line 7465
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 7465
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 7474
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 7479
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 7484
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 7491
      $144 = $125 + 4 | 0; //@line 7495
      HEAP32[$5 >> 2] = $144; //@line 7496
      $$0254 = $140; //@line 7497
      $$pre345 = $144; //@line 7497
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 7503
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7518
     $152 = HEAP32[$151 >> 2] | 0; //@line 7519
     HEAP32[$2 >> 2] = $151 + 4; //@line 7521
     $364 = $152; //@line 7522
    } else {
     $364 = 0; //@line 7524
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 7527
    HEAP32[$5 >> 2] = $154; //@line 7528
    $$0254 = $364; //@line 7529
    $$pre345 = $154; //@line 7529
   } else {
    $$0254 = -1; //@line 7531
    $$pre345 = $115; //@line 7531
   }
  } while (0);
  $$0252 = 0; //@line 7534
  $158 = $$pre345; //@line 7534
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 7541
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 7544
   HEAP32[$5 >> 2] = $158; //@line 7545
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (1507 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 7550
   $168 = $167 & 255; //@line 7551
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 7555
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 7562
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 7566
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 7570
     break L1;
    } else {
     label = 50; //@line 7573
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 7578
     $176 = $3 + ($$0253 << 3) | 0; //@line 7580
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 7585
     $182 = $6; //@line 7586
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 7588
     HEAP32[$182 + 4 >> 2] = $181; //@line 7591
     label = 50; //@line 7592
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 7596
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 7599
    $187 = HEAP32[$5 >> 2] | 0; //@line 7601
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 7605
   if ($10) {
    $187 = $158; //@line 7607
   } else {
    $$0243 = 0; //@line 7609
    $$0247 = $$1248; //@line 7609
    $$0269 = $$3272; //@line 7609
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 7615
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 7621
  $196 = $$1263 & -65537; //@line 7624
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 7625
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7633
       $$0243 = 0; //@line 7634
       $$0247 = $$1248; //@line 7634
       $$0269 = $$3272; //@line 7634
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7640
       $$0243 = 0; //@line 7641
       $$0247 = $$1248; //@line 7641
       $$0269 = $$3272; //@line 7641
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 7649
       HEAP32[$208 >> 2] = $$1248; //@line 7651
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 7654
       $$0243 = 0; //@line 7655
       $$0247 = $$1248; //@line 7655
       $$0269 = $$3272; //@line 7655
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 7662
       $$0243 = 0; //@line 7663
       $$0247 = $$1248; //@line 7663
       $$0269 = $$3272; //@line 7663
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 7670
       $$0243 = 0; //@line 7671
       $$0247 = $$1248; //@line 7671
       $$0269 = $$3272; //@line 7671
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7677
       $$0243 = 0; //@line 7678
       $$0247 = $$1248; //@line 7678
       $$0269 = $$3272; //@line 7678
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 7686
       HEAP32[$220 >> 2] = $$1248; //@line 7688
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 7691
       $$0243 = 0; //@line 7692
       $$0247 = $$1248; //@line 7692
       $$0269 = $$3272; //@line 7692
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 7697
       $$0247 = $$1248; //@line 7697
       $$0269 = $$3272; //@line 7697
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 7707
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 7707
     $$3265 = $$1263$ | 8; //@line 7707
     label = 62; //@line 7708
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 7712
     $$1255 = $$0254; //@line 7712
     $$3265 = $$1263$; //@line 7712
     label = 62; //@line 7713
     break;
    }
   case 111:
    {
     $242 = $6; //@line 7717
     $244 = HEAP32[$242 >> 2] | 0; //@line 7719
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 7722
     $248 = _fmt_o($244, $247, $11) | 0; //@line 7723
     $252 = $12 - $248 | 0; //@line 7727
     $$0228 = $248; //@line 7732
     $$1233 = 0; //@line 7732
     $$1238 = 1971; //@line 7732
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 7732
     $$4266 = $$1263$; //@line 7732
     $281 = $244; //@line 7732
     $283 = $247; //@line 7732
     label = 68; //@line 7733
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 7737
     $258 = HEAP32[$256 >> 2] | 0; //@line 7739
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 7742
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 7745
      $264 = tempRet0; //@line 7746
      $265 = $6; //@line 7747
      HEAP32[$265 >> 2] = $263; //@line 7749
      HEAP32[$265 + 4 >> 2] = $264; //@line 7752
      $$0232 = 1; //@line 7753
      $$0237 = 1971; //@line 7753
      $275 = $263; //@line 7753
      $276 = $264; //@line 7753
      label = 67; //@line 7754
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 7766
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 1971 : 1973 : 1972; //@line 7766
      $275 = $258; //@line 7766
      $276 = $261; //@line 7766
      label = 67; //@line 7767
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 7773
     $$0232 = 0; //@line 7779
     $$0237 = 1971; //@line 7779
     $275 = HEAP32[$197 >> 2] | 0; //@line 7779
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 7779
     label = 67; //@line 7780
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 7791
     $$2 = $13; //@line 7792
     $$2234 = 0; //@line 7792
     $$2239 = 1971; //@line 7792
     $$2251 = $11; //@line 7792
     $$5 = 1; //@line 7792
     $$6268 = $196; //@line 7792
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 7799
     label = 72; //@line 7800
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 7804
     $$1 = $302 | 0 ? $302 : 1981; //@line 7807
     label = 72; //@line 7808
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 7818
     HEAP32[$14 >> 2] = 0; //@line 7819
     HEAP32[$6 >> 2] = $8; //@line 7820
     $$4258354 = -1; //@line 7821
     $365 = $8; //@line 7821
     label = 76; //@line 7822
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 7826
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 7829
      $$0240$lcssa356 = 0; //@line 7830
      label = 85; //@line 7831
     } else {
      $$4258354 = $$0254; //@line 7833
      $365 = $$pre348; //@line 7833
      label = 76; //@line 7834
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 7841
     $$0247 = $$1248; //@line 7841
     $$0269 = $$3272; //@line 7841
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 7846
     $$2234 = 0; //@line 7846
     $$2239 = 1971; //@line 7846
     $$2251 = $11; //@line 7846
     $$5 = $$0254; //@line 7846
     $$6268 = $$1263$; //@line 7846
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 7852
    $227 = $6; //@line 7853
    $229 = HEAP32[$227 >> 2] | 0; //@line 7855
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 7858
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 7860
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 7866
    $$0228 = $234; //@line 7871
    $$1233 = $or$cond278 ? 0 : 2; //@line 7871
    $$1238 = $or$cond278 ? 1971 : 1971 + ($$1236 >> 4) | 0; //@line 7871
    $$2256 = $$1255; //@line 7871
    $$4266 = $$3265; //@line 7871
    $281 = $229; //@line 7871
    $283 = $232; //@line 7871
    label = 68; //@line 7872
   } else if ((label | 0) == 67) {
    label = 0; //@line 7875
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 7877
    $$1233 = $$0232; //@line 7877
    $$1238 = $$0237; //@line 7877
    $$2256 = $$0254; //@line 7877
    $$4266 = $$1263$; //@line 7877
    $281 = $275; //@line 7877
    $283 = $276; //@line 7877
    label = 68; //@line 7878
   } else if ((label | 0) == 72) {
    label = 0; //@line 7881
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 7882
    $306 = ($305 | 0) == 0; //@line 7883
    $$2 = $$1; //@line 7890
    $$2234 = 0; //@line 7890
    $$2239 = 1971; //@line 7890
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 7890
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 7890
    $$6268 = $196; //@line 7890
   } else if ((label | 0) == 76) {
    label = 0; //@line 7893
    $$0229316 = $365; //@line 7894
    $$0240315 = 0; //@line 7894
    $$1244314 = 0; //@line 7894
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 7896
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 7899
      $$2245 = $$1244314; //@line 7899
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 7902
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 7908
      $$2245 = $320; //@line 7908
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 7912
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 7915
      $$0240315 = $325; //@line 7915
      $$1244314 = $320; //@line 7915
     } else {
      $$0240$lcssa = $325; //@line 7917
      $$2245 = $320; //@line 7917
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 7923
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 7926
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 7929
     label = 85; //@line 7930
    } else {
     $$1230327 = $365; //@line 7932
     $$1241326 = 0; //@line 7932
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 7934
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7937
       label = 85; //@line 7938
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 7941
      $$1241326 = $331 + $$1241326 | 0; //@line 7942
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7945
       label = 85; //@line 7946
       break L97;
      }
      _out_670($0, $9, $331); //@line 7950
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7955
       label = 85; //@line 7956
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 7953
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 7964
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 7970
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 7972
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 7977
   $$2 = $or$cond ? $$0228 : $11; //@line 7982
   $$2234 = $$1233; //@line 7982
   $$2239 = $$1238; //@line 7982
   $$2251 = $11; //@line 7982
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 7982
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 7982
  } else if ((label | 0) == 85) {
   label = 0; //@line 7985
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 7987
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 7990
   $$0247 = $$1248; //@line 7990
   $$0269 = $$3272; //@line 7990
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 7995
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 7997
  $345 = $$$5 + $$2234 | 0; //@line 7998
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 8000
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 8001
  _out_670($0, $$2239, $$2234); //@line 8002
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 8004
  _pad_676($0, 48, $$$5, $343, 0); //@line 8005
  _out_670($0, $$2, $343); //@line 8006
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 8008
  $$0243 = $$2261; //@line 8009
  $$0247 = $$1248; //@line 8009
  $$0269 = $$3272; //@line 8009
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 8017
    } else {
     $$2242302 = 1; //@line 8019
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 8022
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 8025
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 8029
      $356 = $$2242302 + 1 | 0; //@line 8030
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 8033
      } else {
       $$2242$lcssa = $356; //@line 8035
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 8041
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 8047
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 8053
       } else {
        $$0 = 1; //@line 8055
        break;
       }
      }
     } else {
      $$0 = 1; //@line 8060
     }
    }
   } else {
    $$0 = $$1248; //@line 8064
   }
  }
 } while (0);
 STACKTOP = sp; //@line 8068
 return $$0 | 0; //@line 8068
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 5054
 $3 = HEAP32[1216] | 0; //@line 5055
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 5058
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 5062
 $7 = $6 & 3; //@line 5063
 if (($7 | 0) == 1) {
  _abort(); //@line 5066
 }
 $9 = $6 & -8; //@line 5069
 $10 = $2 + $9 | 0; //@line 5070
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 5075
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 5081
   $17 = $13 + $9 | 0; //@line 5082
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 5085
   }
   if ((HEAP32[1217] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 5091
    $106 = HEAP32[$105 >> 2] | 0; //@line 5092
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 5096
     $$1382 = $17; //@line 5096
     $114 = $16; //@line 5096
     break;
    }
    HEAP32[1214] = $17; //@line 5099
    HEAP32[$105 >> 2] = $106 & -2; //@line 5101
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 5104
    HEAP32[$16 + $17 >> 2] = $17; //@line 5106
    return;
   }
   $21 = $13 >>> 3; //@line 5109
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 5113
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 5115
    $28 = 4888 + ($21 << 1 << 2) | 0; //@line 5117
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 5122
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 5129
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1212] = HEAP32[1212] & ~(1 << $21); //@line 5139
     $$1 = $16; //@line 5140
     $$1382 = $17; //@line 5140
     $114 = $16; //@line 5140
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 5146
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 5150
     }
     $41 = $26 + 8 | 0; //@line 5153
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 5157
     } else {
      _abort(); //@line 5159
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 5164
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 5165
    $$1 = $16; //@line 5166
    $$1382 = $17; //@line 5166
    $114 = $16; //@line 5166
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 5170
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 5172
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 5176
     $60 = $59 + 4 | 0; //@line 5177
     $61 = HEAP32[$60 >> 2] | 0; //@line 5178
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 5181
      if (!$63) {
       $$3 = 0; //@line 5184
       break;
      } else {
       $$1387 = $63; //@line 5187
       $$1390 = $59; //@line 5187
      }
     } else {
      $$1387 = $61; //@line 5190
      $$1390 = $60; //@line 5190
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 5193
      $66 = HEAP32[$65 >> 2] | 0; //@line 5194
      if ($66 | 0) {
       $$1387 = $66; //@line 5197
       $$1390 = $65; //@line 5197
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 5200
      $69 = HEAP32[$68 >> 2] | 0; //@line 5201
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 5206
       $$1390 = $68; //@line 5206
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 5211
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 5214
      $$3 = $$1387; //@line 5215
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 5220
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 5223
     }
     $53 = $51 + 12 | 0; //@line 5226
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 5230
     }
     $56 = $48 + 8 | 0; //@line 5233
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 5237
      HEAP32[$56 >> 2] = $51; //@line 5238
      $$3 = $48; //@line 5239
      break;
     } else {
      _abort(); //@line 5242
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 5249
    $$1382 = $17; //@line 5249
    $114 = $16; //@line 5249
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 5252
    $75 = 5152 + ($74 << 2) | 0; //@line 5253
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 5258
      if (!$$3) {
       HEAP32[1213] = HEAP32[1213] & ~(1 << $74); //@line 5265
       $$1 = $16; //@line 5266
       $$1382 = $17; //@line 5266
       $114 = $16; //@line 5266
       break L10;
      }
     } else {
      if ((HEAP32[1216] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 5273
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 5281
       if (!$$3) {
        $$1 = $16; //@line 5284
        $$1382 = $17; //@line 5284
        $114 = $16; //@line 5284
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1216] | 0; //@line 5292
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 5295
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 5299
    $92 = $16 + 16 | 0; //@line 5300
    $93 = HEAP32[$92 >> 2] | 0; //@line 5301
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 5307
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 5311
       HEAP32[$93 + 24 >> 2] = $$3; //@line 5313
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 5319
    if (!$99) {
     $$1 = $16; //@line 5322
     $$1382 = $17; //@line 5322
     $114 = $16; //@line 5322
    } else {
     if ((HEAP32[1216] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 5327
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 5331
      HEAP32[$99 + 24 >> 2] = $$3; //@line 5333
      $$1 = $16; //@line 5334
      $$1382 = $17; //@line 5334
      $114 = $16; //@line 5334
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 5340
   $$1382 = $9; //@line 5340
   $114 = $2; //@line 5340
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 5345
 }
 $115 = $10 + 4 | 0; //@line 5348
 $116 = HEAP32[$115 >> 2] | 0; //@line 5349
 if (!($116 & 1)) {
  _abort(); //@line 5353
 }
 if (!($116 & 2)) {
  if ((HEAP32[1218] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1215] | 0) + $$1382 | 0; //@line 5363
   HEAP32[1215] = $124; //@line 5364
   HEAP32[1218] = $$1; //@line 5365
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 5368
   if (($$1 | 0) != (HEAP32[1217] | 0)) {
    return;
   }
   HEAP32[1217] = 0; //@line 5374
   HEAP32[1214] = 0; //@line 5375
   return;
  }
  if ((HEAP32[1217] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1214] | 0) + $$1382 | 0; //@line 5382
   HEAP32[1214] = $132; //@line 5383
   HEAP32[1217] = $114; //@line 5384
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 5387
   HEAP32[$114 + $132 >> 2] = $132; //@line 5389
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 5393
  $138 = $116 >>> 3; //@line 5394
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 5399
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 5401
    $145 = 4888 + ($138 << 1 << 2) | 0; //@line 5403
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1216] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 5409
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 5416
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1212] = HEAP32[1212] & ~(1 << $138); //@line 5426
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 5432
    } else {
     if ((HEAP32[1216] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 5437
     }
     $160 = $143 + 8 | 0; //@line 5440
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 5444
     } else {
      _abort(); //@line 5446
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 5451
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 5452
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 5455
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 5457
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 5461
      $180 = $179 + 4 | 0; //@line 5462
      $181 = HEAP32[$180 >> 2] | 0; //@line 5463
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 5466
       if (!$183) {
        $$3400 = 0; //@line 5469
        break;
       } else {
        $$1398 = $183; //@line 5472
        $$1402 = $179; //@line 5472
       }
      } else {
       $$1398 = $181; //@line 5475
       $$1402 = $180; //@line 5475
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 5478
       $186 = HEAP32[$185 >> 2] | 0; //@line 5479
       if ($186 | 0) {
        $$1398 = $186; //@line 5482
        $$1402 = $185; //@line 5482
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 5485
       $189 = HEAP32[$188 >> 2] | 0; //@line 5486
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 5491
        $$1402 = $188; //@line 5491
       }
      }
      if ((HEAP32[1216] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 5497
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 5500
       $$3400 = $$1398; //@line 5501
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 5506
      if ((HEAP32[1216] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 5510
      }
      $173 = $170 + 12 | 0; //@line 5513
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 5517
      }
      $176 = $167 + 8 | 0; //@line 5520
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 5524
       HEAP32[$176 >> 2] = $170; //@line 5525
       $$3400 = $167; //@line 5526
       break;
      } else {
       _abort(); //@line 5529
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 5537
     $196 = 5152 + ($195 << 2) | 0; //@line 5538
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 5543
       if (!$$3400) {
        HEAP32[1213] = HEAP32[1213] & ~(1 << $195); //@line 5550
        break L108;
       }
      } else {
       if ((HEAP32[1216] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 5557
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 5565
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1216] | 0; //@line 5575
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 5578
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 5582
     $213 = $10 + 16 | 0; //@line 5583
     $214 = HEAP32[$213 >> 2] | 0; //@line 5584
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 5590
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 5594
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 5596
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 5602
     if ($220 | 0) {
      if ((HEAP32[1216] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 5608
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 5612
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 5614
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 5623
  HEAP32[$114 + $137 >> 2] = $137; //@line 5625
  if (($$1 | 0) == (HEAP32[1217] | 0)) {
   HEAP32[1214] = $137; //@line 5629
   return;
  } else {
   $$2 = $137; //@line 5632
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 5636
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 5639
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 5641
  $$2 = $$1382; //@line 5642
 }
 $235 = $$2 >>> 3; //@line 5644
 if ($$2 >>> 0 < 256) {
  $238 = 4888 + ($235 << 1 << 2) | 0; //@line 5648
  $239 = HEAP32[1212] | 0; //@line 5649
  $240 = 1 << $235; //@line 5650
  if (!($239 & $240)) {
   HEAP32[1212] = $239 | $240; //@line 5655
   $$0403 = $238; //@line 5657
   $$pre$phiZ2D = $238 + 8 | 0; //@line 5657
  } else {
   $244 = $238 + 8 | 0; //@line 5659
   $245 = HEAP32[$244 >> 2] | 0; //@line 5660
   if ((HEAP32[1216] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 5664
   } else {
    $$0403 = $245; //@line 5667
    $$pre$phiZ2D = $244; //@line 5667
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 5670
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 5672
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 5674
  HEAP32[$$1 + 12 >> 2] = $238; //@line 5676
  return;
 }
 $251 = $$2 >>> 8; //@line 5679
 if (!$251) {
  $$0396 = 0; //@line 5682
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 5686
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 5690
   $257 = $251 << $256; //@line 5691
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 5694
   $262 = $257 << $260; //@line 5696
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 5699
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 5704
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 5710
  }
 }
 $276 = 5152 + ($$0396 << 2) | 0; //@line 5713
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 5715
 HEAP32[$$1 + 20 >> 2] = 0; //@line 5718
 HEAP32[$$1 + 16 >> 2] = 0; //@line 5719
 $280 = HEAP32[1213] | 0; //@line 5720
 $281 = 1 << $$0396; //@line 5721
 do {
  if (!($280 & $281)) {
   HEAP32[1213] = $280 | $281; //@line 5727
   HEAP32[$276 >> 2] = $$1; //@line 5728
   HEAP32[$$1 + 24 >> 2] = $276; //@line 5730
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 5732
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 5734
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 5742
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 5742
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 5749
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 5753
    $301 = HEAP32[$299 >> 2] | 0; //@line 5755
    if (!$301) {
     label = 121; //@line 5758
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 5761
     $$0384 = $301; //@line 5761
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1216] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 5768
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 5771
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 5773
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 5775
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 5777
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 5782
    $309 = HEAP32[$308 >> 2] | 0; //@line 5783
    $310 = HEAP32[1216] | 0; //@line 5784
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 5790
     HEAP32[$308 >> 2] = $$1; //@line 5791
     HEAP32[$$1 + 8 >> 2] = $309; //@line 5793
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 5795
     HEAP32[$$1 + 24 >> 2] = 0; //@line 5797
     break;
    } else {
     _abort(); //@line 5800
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1220] | 0) + -1 | 0; //@line 5807
 HEAP32[1220] = $319; //@line 5808
 if (!$319) {
  $$0212$in$i = 5304; //@line 5811
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 5816
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 5822
  }
 }
 HEAP32[1220] = -1; //@line 5825
 return;
}
function _equeue_dispatch($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$03956$i = 0, $$03956$i$phi = 0, $$04055$i = 0, $$0405571$i = 0, $$04063$i = 0, $$04159$i = 0, $$04258$i = 0, $$057$i = 0, $$065 = 0, $$06790 = 0, $$2 = 0, $$idx = 0, $$sink$in$i$i = 0, $$sroa$0$i = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i73 = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i72 = 0, $10 = 0, $103 = 0, $11 = 0, $12 = 0, $126 = 0, $128 = 0, $129 = 0, $130 = 0, $132 = 0, $133 = 0, $141 = 0, $142 = 0, $144 = 0, $147 = 0, $149 = 0, $152 = 0, $155 = 0, $162 = 0, $166 = 0, $169 = 0, $175 = 0, $2 = 0, $20 = 0, $21 = 0, $24 = 0, $3 = 0, $30 = 0, $39 = 0, $4 = 0, $42 = 0, $43 = 0, $45 = 0, $5 = 0, $6 = 0, $69 = 0, $7 = 0, $71 = 0, $74 = 0, $8 = 0, $9 = 0, $93 = 0, $94 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0, $$04159$i$looptemp = 0, $$04258$i$looptemp = 0;
 sp = STACKTOP; //@line 978
 STACKTOP = STACKTOP + 16 | 0; //@line 979
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 979
 $$sroa$0$i = sp; //@line 980
 $2 = _equeue_tick() | 0; //@line 981
 $3 = $2 + $1 | 0; //@line 982
 $4 = $0 + 36 | 0; //@line 983
 HEAP8[$4 >> 0] = 0; //@line 984
 $5 = $0 + 128 | 0; //@line 985
 $6 = $0 + 9 | 0; //@line 986
 $7 = $0 + 4 | 0; //@line 987
 $8 = ($1 | 0) > -1; //@line 988
 $9 = $0 + 48 | 0; //@line 989
 $10 = $0 + 8 | 0; //@line 990
 $$idx = $0 + 16 | 0; //@line 991
 $11 = $0 + 156 | 0; //@line 992
 $12 = $0 + 24 | 0; //@line 993
 $$0 = $2; //@line 994
 L1 : while (1) {
  _equeue_mutex_lock($5); //@line 996
  HEAP8[$6 >> 0] = (HEAPU8[$6 >> 0] | 0) + 1; //@line 1001
  if (((HEAP32[$7 >> 2] | 0) - $$0 | 0) < 1) {
   HEAP32[$7 >> 2] = $$0; //@line 1006
  }
  $20 = HEAP32[$0 >> 2] | 0; //@line 1008
  HEAP32[$$sroa$0$i >> 2] = $20; //@line 1009
  $21 = $20; //@line 1010
  L6 : do {
   if (!$20) {
    $$04055$i = $$sroa$0$i; //@line 1014
    $30 = $21; //@line 1014
    label = 8; //@line 1015
   } else {
    $$04063$i = $$sroa$0$i; //@line 1017
    $24 = $21; //@line 1017
    do {
     if (((HEAP32[$24 + 20 >> 2] | 0) - $$0 | 0) >= 1) {
      $$04055$i = $$04063$i; //@line 1024
      $30 = $24; //@line 1024
      label = 8; //@line 1025
      break L6;
     }
     $$04063$i = $24 + 8 | 0; //@line 1028
     $24 = HEAP32[$$04063$i >> 2] | 0; //@line 1029
    } while (($24 | 0) != 0);
    HEAP32[$0 >> 2] = 0; //@line 1037
    $$0405571$i = $$04063$i; //@line 1038
   }
  } while (0);
  if ((label | 0) == 8) {
   label = 0; //@line 1042
   HEAP32[$0 >> 2] = $30; //@line 1043
   if (!$30) {
    $$0405571$i = $$04055$i; //@line 1046
   } else {
    HEAP32[$30 + 16 >> 2] = $0; //@line 1049
    $$0405571$i = $$04055$i; //@line 1050
   }
  }
  HEAP32[$$0405571$i >> 2] = 0; //@line 1053
  _equeue_mutex_unlock($5); //@line 1054
  $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i72 = HEAP32[$$sroa$0$i >> 2] | 0; //@line 1055
  if (!$$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i72) {} else {
   $$04159$i = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i72; //@line 1059
   $$04258$i = $$sroa$0$i; //@line 1059
   do {
    $$04258$i$looptemp = $$04258$i;
    $$04258$i = $$04159$i + 8 | 0; //@line 1061
    $$04159$i$looptemp = $$04159$i;
    $$04159$i = HEAP32[$$04258$i >> 2] | 0; //@line 1062
    $$03956$i = 0; //@line 1063
    $$057$i = $$04159$i$looptemp; //@line 1063
    while (1) {
     HEAP32[$$057$i + 8 >> 2] = $$03956$i; //@line 1066
     $39 = HEAP32[$$057$i + 12 >> 2] | 0; //@line 1068
     if (!$39) {
      break;
     } else {
      $$03956$i$phi = $$057$i; //@line 1073
      $$057$i = $39; //@line 1073
      $$03956$i = $$03956$i$phi; //@line 1073
     }
    }
    HEAP32[$$04258$i$looptemp >> 2] = $$057$i; //@line 1076
   } while (($$04159$i | 0) != 0);
   $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i73 = HEAP32[$$sroa$0$i >> 2] | 0; //@line 1084
   if ($$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i73 | 0) {
    $$06790 = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i73; //@line 1087
    while (1) {
     $42 = $$06790 + 8 | 0; //@line 1089
     $43 = HEAP32[$42 >> 2] | 0; //@line 1090
     $45 = HEAP32[$$06790 + 32 >> 2] | 0; //@line 1092
     if ($45 | 0) {
      $AsyncCtx = _emscripten_alloc_async_context(84, sp) | 0; //@line 1096
      FUNCTION_TABLE_vi[$45 & 127]($$06790 + 36 | 0); //@line 1097
      if (___async) {
       label = 18; //@line 1100
       break L1;
      }
      _emscripten_free_async_context($AsyncCtx | 0); //@line 1103
     }
     $69 = HEAP32[$$06790 + 24 >> 2] | 0; //@line 1106
     if (($69 | 0) > -1) {
      $71 = $$06790 + 20 | 0; //@line 1109
      HEAP32[$71 >> 2] = (HEAP32[$71 >> 2] | 0) + $69; //@line 1112
      $74 = _equeue_tick() | 0; //@line 1113
      $AsyncCtx11 = _emscripten_alloc_async_context(76, sp) | 0; //@line 1114
      _equeue_enqueue($0, $$06790, $74) | 0; //@line 1115
      if (___async) {
       label = 22; //@line 1118
       break L1;
      }
      _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1121
     } else {
      $93 = $$06790 + 4 | 0; //@line 1124
      $94 = HEAP8[$93 >> 0] | 0; //@line 1125
      HEAP8[$93 >> 0] = (($94 + 1 & 255) << HEAP32[$$idx >> 2] | 0) == 0 ? 1 : ($94 & 255) + 1 & 255; //@line 1134
      $103 = HEAP32[$$06790 + 28 >> 2] | 0; //@line 1136
      if ($103 | 0) {
       $AsyncCtx3 = _emscripten_alloc_async_context(84, sp) | 0; //@line 1140
       FUNCTION_TABLE_vi[$103 & 127]($$06790 + 36 | 0); //@line 1141
       if (___async) {
        label = 26; //@line 1144
        break L1;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1147
      }
      _equeue_mutex_lock($11); //@line 1149
      $126 = HEAP32[$12 >> 2] | 0; //@line 1150
      L37 : do {
       if (!$126) {
        $$02329$i$i = $12; //@line 1154
        label = 34; //@line 1155
       } else {
        $128 = HEAP32[$$06790 >> 2] | 0; //@line 1157
        $$025$i$i = $12; //@line 1158
        $130 = $126; //@line 1158
        while (1) {
         $129 = HEAP32[$130 >> 2] | 0; //@line 1160
         if ($129 >>> 0 >= $128 >>> 0) {
          break;
         }
         $132 = $130 + 8 | 0; //@line 1165
         $133 = HEAP32[$132 >> 2] | 0; //@line 1166
         if (!$133) {
          $$02329$i$i = $132; //@line 1169
          label = 34; //@line 1170
          break L37;
         } else {
          $$025$i$i = $132; //@line 1173
          $130 = $133; //@line 1173
         }
        }
        if (($129 | 0) == ($128 | 0)) {
         HEAP32[$$06790 + 12 >> 2] = $130; //@line 1179
         $$02330$i$i = $$025$i$i; //@line 1182
         $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 1182
        } else {
         $$02329$i$i = $$025$i$i; //@line 1184
         label = 34; //@line 1185
        }
       }
      } while (0);
      if ((label | 0) == 34) {
       label = 0; //@line 1190
       HEAP32[$$06790 + 12 >> 2] = 0; //@line 1192
       $$02330$i$i = $$02329$i$i; //@line 1193
       $$sink$in$i$i = $$02329$i$i; //@line 1193
      }
      HEAP32[$42 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 1196
      HEAP32[$$02330$i$i >> 2] = $$06790; //@line 1197
      _equeue_mutex_unlock($11); //@line 1198
     }
     if (!$43) {
      break;
     } else {
      $$06790 = $43; //@line 1204
     }
    }
   }
  }
  $141 = _equeue_tick() | 0; //@line 1209
  if ($8) {
   $142 = $3 - $141 | 0; //@line 1211
   if (($142 | 0) < 1) {
    label = 39; //@line 1214
    break;
   } else {
    $$065 = $142; //@line 1217
   }
  } else {
   $$065 = -1; //@line 1220
  }
  _equeue_mutex_lock($5); //@line 1222
  $162 = HEAP32[$0 >> 2] | 0; //@line 1223
  if (!$162) {
   $$2 = $$065; //@line 1226
  } else {
   $166 = (HEAP32[$162 + 20 >> 2] | 0) - $141 | 0; //@line 1230
   $169 = $166 & ~($166 >> 31); //@line 1233
   $$2 = $169 >>> 0 < $$065 >>> 0 ? $169 : $$065; //@line 1236
  }
  _equeue_mutex_unlock($5); //@line 1238
  _equeue_sema_wait($9, $$2) | 0; //@line 1239
  if (HEAP8[$10 >> 0] | 0) {
   _equeue_mutex_lock($5); //@line 1243
   if (HEAP8[$10 >> 0] | 0) {
    label = 51; //@line 1247
    break;
   }
   _equeue_mutex_unlock($5); //@line 1250
  }
  $175 = _equeue_tick() | 0; //@line 1252
  $AsyncCtx15 = _emscripten_alloc_async_context(76, sp) | 0; //@line 1253
  _wait_ms(20); //@line 1254
  if (___async) {
   label = 54; //@line 1257
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1260
  $$0 = $175; //@line 1261
 }
 if ((label | 0) == 18) {
  HEAP32[$AsyncCtx >> 2] = 27; //@line 1264
  HEAP32[$AsyncCtx + 4 >> 2] = $5; //@line 1266
  HEAP32[$AsyncCtx + 8 >> 2] = $9; //@line 1268
  HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 1270
  HEAP32[$AsyncCtx + 16 >> 2] = $$sroa$0$i; //@line 1272
  HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 1274
  HEAP32[$AsyncCtx + 24 >> 2] = $4; //@line 1276
  HEAP32[$AsyncCtx + 28 >> 2] = $0; //@line 1278
  HEAP8[$AsyncCtx + 32 >> 0] = $8 & 1; //@line 1281
  HEAP32[$AsyncCtx + 36 >> 2] = $3; //@line 1283
  HEAP32[$AsyncCtx + 40 >> 2] = $42; //@line 1285
  HEAP32[$AsyncCtx + 44 >> 2] = $$06790; //@line 1287
  HEAP32[$AsyncCtx + 48 >> 2] = $11; //@line 1289
  HEAP32[$AsyncCtx + 52 >> 2] = $6; //@line 1291
  HEAP32[$AsyncCtx + 56 >> 2] = $7; //@line 1293
  HEAP32[$AsyncCtx + 60 >> 2] = $43; //@line 1295
  HEAP32[$AsyncCtx + 64 >> 2] = $$sroa$0$i; //@line 1297
  HEAP32[$AsyncCtx + 68 >> 2] = $0; //@line 1299
  HEAP32[$AsyncCtx + 72 >> 2] = $$sroa$0$i; //@line 1301
  HEAP32[$AsyncCtx + 76 >> 2] = $12; //@line 1303
  HEAP32[$AsyncCtx + 80 >> 2] = $$idx; //@line 1305
  sp = STACKTOP; //@line 1306
  STACKTOP = sp; //@line 1307
  return;
 } else if ((label | 0) == 22) {
  HEAP32[$AsyncCtx11 >> 2] = 28; //@line 1310
  HEAP32[$AsyncCtx11 + 4 >> 2] = $5; //@line 1312
  HEAP32[$AsyncCtx11 + 8 >> 2] = $9; //@line 1314
  HEAP32[$AsyncCtx11 + 12 >> 2] = $10; //@line 1316
  HEAP32[$AsyncCtx11 + 16 >> 2] = $$sroa$0$i; //@line 1318
  HEAP32[$AsyncCtx11 + 20 >> 2] = $0; //@line 1320
  HEAP32[$AsyncCtx11 + 24 >> 2] = $4; //@line 1322
  HEAP32[$AsyncCtx11 + 28 >> 2] = $0; //@line 1324
  HEAP8[$AsyncCtx11 + 32 >> 0] = $8 & 1; //@line 1327
  HEAP32[$AsyncCtx11 + 36 >> 2] = $3; //@line 1329
  HEAP32[$AsyncCtx11 + 40 >> 2] = $11; //@line 1331
  HEAP32[$AsyncCtx11 + 44 >> 2] = $6; //@line 1333
  HEAP32[$AsyncCtx11 + 48 >> 2] = $7; //@line 1335
  HEAP32[$AsyncCtx11 + 52 >> 2] = $43; //@line 1337
  HEAP32[$AsyncCtx11 + 56 >> 2] = $$sroa$0$i; //@line 1339
  HEAP32[$AsyncCtx11 + 60 >> 2] = $0; //@line 1341
  HEAP32[$AsyncCtx11 + 64 >> 2] = $$sroa$0$i; //@line 1343
  HEAP32[$AsyncCtx11 + 68 >> 2] = $12; //@line 1345
  HEAP32[$AsyncCtx11 + 72 >> 2] = $$idx; //@line 1347
  sp = STACKTOP; //@line 1348
  STACKTOP = sp; //@line 1349
  return;
 } else if ((label | 0) == 26) {
  HEAP32[$AsyncCtx3 >> 2] = 29; //@line 1352
  HEAP32[$AsyncCtx3 + 4 >> 2] = $5; //@line 1354
  HEAP32[$AsyncCtx3 + 8 >> 2] = $9; //@line 1356
  HEAP32[$AsyncCtx3 + 12 >> 2] = $10; //@line 1358
  HEAP32[$AsyncCtx3 + 16 >> 2] = $$sroa$0$i; //@line 1360
  HEAP32[$AsyncCtx3 + 20 >> 2] = $0; //@line 1362
  HEAP32[$AsyncCtx3 + 24 >> 2] = $4; //@line 1364
  HEAP32[$AsyncCtx3 + 28 >> 2] = $0; //@line 1366
  HEAP8[$AsyncCtx3 + 32 >> 0] = $8 & 1; //@line 1369
  HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 1371
  HEAP32[$AsyncCtx3 + 40 >> 2] = $42; //@line 1373
  HEAP32[$AsyncCtx3 + 44 >> 2] = $$06790; //@line 1375
  HEAP32[$AsyncCtx3 + 48 >> 2] = $11; //@line 1377
  HEAP32[$AsyncCtx3 + 52 >> 2] = $6; //@line 1379
  HEAP32[$AsyncCtx3 + 56 >> 2] = $7; //@line 1381
  HEAP32[$AsyncCtx3 + 60 >> 2] = $43; //@line 1383
  HEAP32[$AsyncCtx3 + 64 >> 2] = $$sroa$0$i; //@line 1385
  HEAP32[$AsyncCtx3 + 68 >> 2] = $0; //@line 1387
  HEAP32[$AsyncCtx3 + 72 >> 2] = $$sroa$0$i; //@line 1389
  HEAP32[$AsyncCtx3 + 76 >> 2] = $12; //@line 1391
  HEAP32[$AsyncCtx3 + 80 >> 2] = $$idx; //@line 1393
  sp = STACKTOP; //@line 1394
  STACKTOP = sp; //@line 1395
  return;
 } else if ((label | 0) == 39) {
  $144 = $0 + 40 | 0; //@line 1398
  if (HEAP32[$144 >> 2] | 0) {
   _equeue_mutex_lock($5); //@line 1402
   $147 = HEAP32[$144 >> 2] | 0; //@line 1403
   do {
    if ($147 | 0) {
     $149 = HEAP32[$0 >> 2] | 0; //@line 1407
     if ($149 | 0) {
      $152 = HEAP32[$0 + 44 >> 2] | 0; //@line 1411
      $155 = (HEAP32[$149 + 20 >> 2] | 0) - $141 | 0; //@line 1414
      $AsyncCtx7 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1418
      FUNCTION_TABLE_vii[$147 & 3]($152, $155 & ~($155 >> 31)); //@line 1419
      if (___async) {
       HEAP32[$AsyncCtx7 >> 2] = 30; //@line 1422
       HEAP32[$AsyncCtx7 + 4 >> 2] = $4; //@line 1424
       HEAP32[$AsyncCtx7 + 8 >> 2] = $5; //@line 1426
       HEAP32[$AsyncCtx7 + 12 >> 2] = $10; //@line 1428
       sp = STACKTOP; //@line 1429
       STACKTOP = sp; //@line 1430
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1432
       break;
      }
     }
    }
   } while (0);
   HEAP8[$4 >> 0] = 1; //@line 1438
   _equeue_mutex_unlock($5); //@line 1439
  }
  HEAP8[$10 >> 0] = 0; //@line 1441
  STACKTOP = sp; //@line 1442
  return;
 } else if ((label | 0) == 51) {
  HEAP8[$10 >> 0] = 0; //@line 1445
  _equeue_mutex_unlock($5); //@line 1446
  STACKTOP = sp; //@line 1447
  return;
 } else if ((label | 0) == 54) {
  HEAP32[$AsyncCtx15 >> 2] = 31; //@line 1450
  HEAP32[$AsyncCtx15 + 4 >> 2] = $$sroa$0$i; //@line 1452
  HEAP32[$AsyncCtx15 + 8 >> 2] = $0; //@line 1454
  HEAP32[$AsyncCtx15 + 12 >> 2] = $5; //@line 1456
  HEAP32[$AsyncCtx15 + 16 >> 2] = $9; //@line 1458
  HEAP32[$AsyncCtx15 + 20 >> 2] = $10; //@line 1460
  HEAP32[$AsyncCtx15 + 24 >> 2] = $4; //@line 1462
  HEAP32[$AsyncCtx15 + 28 >> 2] = $0; //@line 1464
  HEAP8[$AsyncCtx15 + 32 >> 0] = $8 & 1; //@line 1467
  HEAP32[$AsyncCtx15 + 36 >> 2] = $3; //@line 1469
  HEAP32[$AsyncCtx15 + 40 >> 2] = $11; //@line 1471
  HEAP32[$AsyncCtx15 + 44 >> 2] = $6; //@line 1473
  HEAP32[$AsyncCtx15 + 48 >> 2] = $7; //@line 1475
  HEAP32[$AsyncCtx15 + 52 >> 2] = $$sroa$0$i; //@line 1477
  HEAP32[$AsyncCtx15 + 56 >> 2] = $0; //@line 1479
  HEAP32[$AsyncCtx15 + 60 >> 2] = $$sroa$0$i; //@line 1481
  HEAP32[$AsyncCtx15 + 64 >> 2] = $12; //@line 1483
  HEAP32[$AsyncCtx15 + 68 >> 2] = $$idx; //@line 1485
  HEAP32[$AsyncCtx15 + 72 >> 2] = $175; //@line 1487
  sp = STACKTOP; //@line 1488
  STACKTOP = sp; //@line 1489
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11195
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 11201
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 11210
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 11215
      $19 = $1 + 44 | 0; //@line 11216
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 11225
      $26 = $1 + 52 | 0; //@line 11226
      $27 = $1 + 53 | 0; //@line 11227
      $28 = $1 + 54 | 0; //@line 11228
      $29 = $0 + 8 | 0; //@line 11229
      $30 = $1 + 24 | 0; //@line 11230
      $$081$off0 = 0; //@line 11231
      $$084 = $0 + 16 | 0; //@line 11231
      $$085$off0 = 0; //@line 11231
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 11235
        label = 20; //@line 11236
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 11239
       HEAP8[$27 >> 0] = 0; //@line 11240
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 11241
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 11242
       if (___async) {
        label = 12; //@line 11245
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 11248
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 11252
        label = 20; //@line 11253
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 11260
         $$186$off0 = $$085$off0; //@line 11260
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 11269
           label = 20; //@line 11270
           break L10;
          } else {
           $$182$off0 = 1; //@line 11273
           $$186$off0 = $$085$off0; //@line 11273
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 11280
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 11287
          break L10;
         } else {
          $$182$off0 = 1; //@line 11290
          $$186$off0 = 1; //@line 11290
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 11295
       $$084 = $$084 + 8 | 0; //@line 11295
       $$085$off0 = $$186$off0; //@line 11295
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 110; //@line 11298
       HEAP32[$AsyncCtx15 + 4 >> 2] = $19; //@line 11300
       HEAP32[$AsyncCtx15 + 8 >> 2] = $28; //@line 11302
       HEAP32[$AsyncCtx15 + 12 >> 2] = $30; //@line 11304
       HEAP32[$AsyncCtx15 + 16 >> 2] = $2; //@line 11306
       HEAP32[$AsyncCtx15 + 20 >> 2] = $13; //@line 11308
       HEAP32[$AsyncCtx15 + 24 >> 2] = $1; //@line 11310
       HEAP8[$AsyncCtx15 + 28 >> 0] = $$081$off0 & 1; //@line 11313
       HEAP8[$AsyncCtx15 + 29 >> 0] = $$085$off0 & 1; //@line 11316
       HEAP32[$AsyncCtx15 + 32 >> 2] = $$084; //@line 11318
       HEAP32[$AsyncCtx15 + 36 >> 2] = $29; //@line 11320
       HEAP32[$AsyncCtx15 + 40 >> 2] = $26; //@line 11322
       HEAP32[$AsyncCtx15 + 44 >> 2] = $27; //@line 11324
       HEAP8[$AsyncCtx15 + 48 >> 0] = $4 & 1; //@line 11327
       HEAP32[$AsyncCtx15 + 52 >> 2] = $25; //@line 11329
       sp = STACKTOP; //@line 11330
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 11336
         $61 = $1 + 40 | 0; //@line 11337
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 11340
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 11348
           if ($$283$off0) {
            label = 25; //@line 11350
            break;
           } else {
            $69 = 4; //@line 11353
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 11360
        } else {
         $69 = 4; //@line 11362
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 11367
      }
      HEAP32[$19 >> 2] = $69; //@line 11369
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 11378
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 11383
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 11384
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 11385
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 11386
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 111; //@line 11389
    HEAP32[$AsyncCtx11 + 4 >> 2] = $73; //@line 11391
    HEAP32[$AsyncCtx11 + 8 >> 2] = $1; //@line 11393
    HEAP32[$AsyncCtx11 + 12 >> 2] = $2; //@line 11395
    HEAP32[$AsyncCtx11 + 16 >> 2] = $3; //@line 11397
    HEAP8[$AsyncCtx11 + 20 >> 0] = $4 & 1; //@line 11400
    HEAP32[$AsyncCtx11 + 24 >> 2] = $0; //@line 11402
    HEAP32[$AsyncCtx11 + 28 >> 2] = $72; //@line 11404
    sp = STACKTOP; //@line 11405
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 11408
   $81 = $0 + 24 | 0; //@line 11409
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 11413
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 11417
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 11424
       $$2 = $81; //@line 11425
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 11437
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 11438
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 11443
        $136 = $$2 + 8 | 0; //@line 11444
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 11447
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 114; //@line 11452
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 11454
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 11456
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 11458
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 11460
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 11462
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 11464
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 11466
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 11469
       sp = STACKTOP; //@line 11470
       return;
      }
      $104 = $1 + 24 | 0; //@line 11473
      $105 = $1 + 54 | 0; //@line 11474
      $$1 = $81; //@line 11475
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 11491
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 11492
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11497
       $122 = $$1 + 8 | 0; //@line 11498
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 11501
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 113; //@line 11506
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 11508
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 11510
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 11512
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 11514
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 11516
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 11518
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 11520
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 11522
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 11525
      sp = STACKTOP; //@line 11526
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 11530
    $$0 = $81; //@line 11531
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 11538
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 11539
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 11544
     $100 = $$0 + 8 | 0; //@line 11545
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 11548
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 112; //@line 11553
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 11555
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 11557
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 11559
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 11561
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 11563
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 11565
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 11568
    sp = STACKTOP; //@line 11569
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
 $n_sroa_0_0_extract_trunc = $a$0; //@line 3205
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 3206
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 3207
 $d_sroa_0_0_extract_trunc = $b$0; //@line 3208
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 3209
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 3210
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 3212
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 3215
    HEAP32[$rem + 4 >> 2] = 0; //@line 3216
   }
   $_0$1 = 0; //@line 3218
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 3219
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3220
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 3223
    $_0$0 = 0; //@line 3224
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3225
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 3227
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 3228
   $_0$1 = 0; //@line 3229
   $_0$0 = 0; //@line 3230
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3231
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 3234
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 3239
     HEAP32[$rem + 4 >> 2] = 0; //@line 3240
    }
    $_0$1 = 0; //@line 3242
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 3243
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3244
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 3248
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 3249
    }
    $_0$1 = 0; //@line 3251
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 3252
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3253
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 3255
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 3258
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 3259
    }
    $_0$1 = 0; //@line 3261
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 3262
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3263
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 3266
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 3268
    $58 = 31 - $51 | 0; //@line 3269
    $sr_1_ph = $57; //@line 3270
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 3271
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 3272
    $q_sroa_0_1_ph = 0; //@line 3273
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 3274
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 3278
    $_0$0 = 0; //@line 3279
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3280
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 3282
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 3283
   $_0$1 = 0; //@line 3284
   $_0$0 = 0; //@line 3285
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3286
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 3290
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 3292
     $126 = 31 - $119 | 0; //@line 3293
     $130 = $119 - 31 >> 31; //@line 3294
     $sr_1_ph = $125; //@line 3295
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 3296
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 3297
     $q_sroa_0_1_ph = 0; //@line 3298
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 3299
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 3303
     $_0$0 = 0; //@line 3304
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3305
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 3307
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 3308
    $_0$1 = 0; //@line 3309
    $_0$0 = 0; //@line 3310
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3311
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 3313
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 3316
    $89 = 64 - $88 | 0; //@line 3317
    $91 = 32 - $88 | 0; //@line 3318
    $92 = $91 >> 31; //@line 3319
    $95 = $88 - 32 | 0; //@line 3320
    $105 = $95 >> 31; //@line 3321
    $sr_1_ph = $88; //@line 3322
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 3323
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 3324
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 3325
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 3326
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 3330
    HEAP32[$rem + 4 >> 2] = 0; //@line 3331
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 3334
    $_0$0 = $a$0 | 0 | 0; //@line 3335
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3336
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 3338
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 3339
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 3340
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3341
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 3346
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 3347
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 3348
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 3349
  $carry_0_lcssa$1 = 0; //@line 3350
  $carry_0_lcssa$0 = 0; //@line 3351
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 3353
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 3354
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 3355
  $137$1 = tempRet0; //@line 3356
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 3357
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 3358
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 3359
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 3360
  $sr_1202 = $sr_1_ph; //@line 3361
  $carry_0203 = 0; //@line 3362
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 3364
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 3365
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 3366
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 3367
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 3368
   $150$1 = tempRet0; //@line 3369
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 3370
   $carry_0203 = $151$0 & 1; //@line 3371
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 3373
   $r_sroa_1_1200 = tempRet0; //@line 3374
   $sr_1202 = $sr_1202 - 1 | 0; //@line 3375
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 3387
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 3388
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 3389
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 3390
  $carry_0_lcssa$1 = 0; //@line 3391
  $carry_0_lcssa$0 = $carry_0203; //@line 3392
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 3394
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 3395
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 3398
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 3399
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 3401
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 3402
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3403
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1665
 STACKTOP = STACKTOP + 32 | 0; //@line 1666
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 1666
 $0 = sp; //@line 1667
 _gpio_init_out($0, 50); //@line 1668
 while (1) {
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1671
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1672
  _wait_ms(150); //@line 1673
  if (___async) {
   label = 3; //@line 1676
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 1679
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1681
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1682
  _wait_ms(150); //@line 1683
  if (___async) {
   label = 5; //@line 1686
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 1689
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1691
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1692
  _wait_ms(150); //@line 1693
  if (___async) {
   label = 7; //@line 1696
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 1699
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1701
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1702
  _wait_ms(150); //@line 1703
  if (___async) {
   label = 9; //@line 1706
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 1709
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1711
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1712
  _wait_ms(150); //@line 1713
  if (___async) {
   label = 11; //@line 1716
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 1719
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1721
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1722
  _wait_ms(150); //@line 1723
  if (___async) {
   label = 13; //@line 1726
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 1729
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1731
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1732
  _wait_ms(150); //@line 1733
  if (___async) {
   label = 15; //@line 1736
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 1739
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1741
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1742
  _wait_ms(150); //@line 1743
  if (___async) {
   label = 17; //@line 1746
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 1749
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1751
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1752
  _wait_ms(400); //@line 1753
  if (___async) {
   label = 19; //@line 1756
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 1759
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1761
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1762
  _wait_ms(400); //@line 1763
  if (___async) {
   label = 21; //@line 1766
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 1769
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1771
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1772
  _wait_ms(400); //@line 1773
  if (___async) {
   label = 23; //@line 1776
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 1779
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1781
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1782
  _wait_ms(400); //@line 1783
  if (___async) {
   label = 25; //@line 1786
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1789
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1791
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1792
  _wait_ms(400); //@line 1793
  if (___async) {
   label = 27; //@line 1796
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1799
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1801
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1802
  _wait_ms(400); //@line 1803
  if (___async) {
   label = 29; //@line 1806
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1809
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1811
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1812
  _wait_ms(400); //@line 1813
  if (___async) {
   label = 31; //@line 1816
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1819
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1821
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1822
  _wait_ms(400); //@line 1823
  if (___async) {
   label = 33; //@line 1826
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1829
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 33; //@line 1833
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 1835
   sp = STACKTOP; //@line 1836
   STACKTOP = sp; //@line 1837
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 34; //@line 1841
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 1843
   sp = STACKTOP; //@line 1844
   STACKTOP = sp; //@line 1845
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 35; //@line 1849
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 1851
   sp = STACKTOP; //@line 1852
   STACKTOP = sp; //@line 1853
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 36; //@line 1857
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 1859
   sp = STACKTOP; //@line 1860
   STACKTOP = sp; //@line 1861
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 37; //@line 1865
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 1867
   sp = STACKTOP; //@line 1868
   STACKTOP = sp; //@line 1869
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 38; //@line 1873
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 1875
   sp = STACKTOP; //@line 1876
   STACKTOP = sp; //@line 1877
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 39; //@line 1881
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 1883
   sp = STACKTOP; //@line 1884
   STACKTOP = sp; //@line 1885
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 40; //@line 1889
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 1891
   sp = STACKTOP; //@line 1892
   STACKTOP = sp; //@line 1893
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 41; //@line 1897
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 1899
   sp = STACKTOP; //@line 1900
   STACKTOP = sp; //@line 1901
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 42; //@line 1905
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 1907
   sp = STACKTOP; //@line 1908
   STACKTOP = sp; //@line 1909
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 43; //@line 1913
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 1915
   sp = STACKTOP; //@line 1916
   STACKTOP = sp; //@line 1917
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 44; //@line 1921
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 1923
   sp = STACKTOP; //@line 1924
   STACKTOP = sp; //@line 1925
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 45; //@line 1929
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 1931
   sp = STACKTOP; //@line 1932
   STACKTOP = sp; //@line 1933
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 46; //@line 1937
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 1939
   sp = STACKTOP; //@line 1940
   STACKTOP = sp; //@line 1941
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 47; //@line 1945
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1947
   sp = STACKTOP; //@line 1948
   STACKTOP = sp; //@line 1949
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 48; //@line 1953
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1955
   sp = STACKTOP; //@line 1956
   STACKTOP = sp; //@line 1957
   return;
  }
 }
}
function _main() {
 var $0 = 0, $1 = 0, $15 = 0, $18 = 0, $21 = 0, $23 = 0, $26 = 0, $29 = 0, $34 = 0, $37 = 0, $40 = 0, $5 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx13 = 0, $AsyncCtx17 = 0, $AsyncCtx20 = 0, $AsyncCtx24 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 2311
 STACKTOP = STACKTOP + 16 | 0; //@line 2312
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2312
 $0 = sp; //@line 2313
 $AsyncCtx24 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2314
 $1 = _equeue_alloc(4528, 4) | 0; //@line 2315
 if (___async) {
  HEAP32[$AsyncCtx24 >> 2] = 59; //@line 2318
  HEAP32[$AsyncCtx24 + 4 >> 2] = $0; //@line 2320
  sp = STACKTOP; //@line 2321
  STACKTOP = sp; //@line 2322
  return 0; //@line 2322
 }
 _emscripten_free_async_context($AsyncCtx24 | 0); //@line 2324
 do {
  if ($1 | 0) {
   HEAP32[$1 >> 2] = 2; //@line 2328
   _equeue_event_delay($1, 1e3); //@line 2329
   _equeue_event_period($1, 1e3); //@line 2330
   _equeue_event_dtor($1, 60); //@line 2331
   $AsyncCtx10 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2332
   _equeue_post(4528, 61, $1) | 0; //@line 2333
   if (___async) {
    HEAP32[$AsyncCtx10 >> 2] = 62; //@line 2336
    HEAP32[$AsyncCtx10 + 4 >> 2] = $0; //@line 2338
    sp = STACKTOP; //@line 2339
    STACKTOP = sp; //@line 2340
    return 0; //@line 2340
   } else {
    _emscripten_free_async_context($AsyncCtx10 | 0); //@line 2342
    break;
   }
  }
 } while (0);
 $AsyncCtx20 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2347
 $5 = _equeue_alloc(4528, 32) | 0; //@line 2348
 if (___async) {
  HEAP32[$AsyncCtx20 >> 2] = 63; //@line 2351
  HEAP32[$AsyncCtx20 + 4 >> 2] = $0; //@line 2353
  sp = STACKTOP; //@line 2354
  STACKTOP = sp; //@line 2355
  return 0; //@line 2355
 }
 _emscripten_free_async_context($AsyncCtx20 | 0); //@line 2357
 if (!$5) {
  HEAP32[$0 >> 2] = 0; //@line 2360
  HEAP32[$0 + 4 >> 2] = 0; //@line 2360
  HEAP32[$0 + 8 >> 2] = 0; //@line 2360
  HEAP32[$0 + 12 >> 2] = 0; //@line 2360
  $21 = 1; //@line 2361
  $23 = $0; //@line 2361
 } else {
  HEAP32[$5 + 4 >> 2] = 4528; //@line 2364
  HEAP32[$5 + 8 >> 2] = 0; //@line 2366
  HEAP32[$5 + 12 >> 2] = 0; //@line 2368
  HEAP32[$5 + 16 >> 2] = -1; //@line 2370
  HEAP32[$5 + 20 >> 2] = 2; //@line 2372
  HEAP32[$5 + 24 >> 2] = 64; //@line 2374
  HEAP32[$5 + 28 >> 2] = 3; //@line 2376
  HEAP32[$5 >> 2] = 1; //@line 2377
  $15 = $0 + 4 | 0; //@line 2378
  HEAP32[$15 >> 2] = 0; //@line 2379
  HEAP32[$15 + 4 >> 2] = 0; //@line 2379
  HEAP32[$15 + 8 >> 2] = 0; //@line 2379
  HEAP32[$0 >> 2] = $5; //@line 2380
  HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + 1; //@line 2383
  $21 = 0; //@line 2384
  $23 = $0; //@line 2384
 }
 $18 = $0 + 12 | 0; //@line 2386
 HEAP32[$18 >> 2] = 168; //@line 2387
 $AsyncCtx17 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2388
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(4776, $0); //@line 2389
 if (___async) {
  HEAP32[$AsyncCtx17 >> 2] = 65; //@line 2392
  HEAP32[$AsyncCtx17 + 4 >> 2] = $18; //@line 2394
  HEAP8[$AsyncCtx17 + 8 >> 0] = $21 & 1; //@line 2397
  HEAP32[$AsyncCtx17 + 12 >> 2] = $23; //@line 2399
  HEAP32[$AsyncCtx17 + 16 >> 2] = $5; //@line 2401
  HEAP32[$AsyncCtx17 + 20 >> 2] = $5; //@line 2403
  sp = STACKTOP; //@line 2404
  STACKTOP = sp; //@line 2405
  return 0; //@line 2405
 }
 _emscripten_free_async_context($AsyncCtx17 | 0); //@line 2407
 $26 = HEAP32[$18 >> 2] | 0; //@line 2408
 do {
  if ($26 | 0) {
   $29 = HEAP32[$26 + 8 >> 2] | 0; //@line 2413
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 2414
   FUNCTION_TABLE_vi[$29 & 127]($23); //@line 2415
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 66; //@line 2418
    HEAP8[$AsyncCtx + 4 >> 0] = $21 & 1; //@line 2421
    HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 2423
    HEAP32[$AsyncCtx + 12 >> 2] = $5; //@line 2425
    sp = STACKTOP; //@line 2426
    STACKTOP = sp; //@line 2427
    return 0; //@line 2427
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 2429
    break;
   }
  }
 } while (0);
 do {
  if (!$21) {
   $34 = (HEAP32[$5 >> 2] | 0) + -1 | 0; //@line 2437
   HEAP32[$5 >> 2] = $34; //@line 2438
   if (!$34) {
    $37 = HEAP32[$5 + 24 >> 2] | 0; //@line 2442
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2443
    FUNCTION_TABLE_vi[$37 & 127]($5); //@line 2444
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 67; //@line 2447
     HEAP32[$AsyncCtx3 + 4 >> 2] = $5; //@line 2449
     sp = STACKTOP; //@line 2450
     STACKTOP = sp; //@line 2451
     return 0; //@line 2451
    }
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2453
    $40 = HEAP32[$5 + 4 >> 2] | 0; //@line 2455
    $AsyncCtx13 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2456
    _equeue_dealloc($40, $5); //@line 2457
    if (___async) {
     HEAP32[$AsyncCtx13 >> 2] = 68; //@line 2460
     sp = STACKTOP; //@line 2461
     STACKTOP = sp; //@line 2462
     return 0; //@line 2462
    } else {
     _emscripten_free_async_context($AsyncCtx13 | 0); //@line 2464
     break;
    }
   }
  }
 } while (0);
 $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2470
 __ZN6events10EventQueue8dispatchEi(4528, -1); //@line 2471
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 69; //@line 2474
  sp = STACKTOP; //@line 2475
  STACKTOP = sp; //@line 2476
  return 0; //@line 2476
 } else {
  _emscripten_free_async_context($AsyncCtx6 | 0); //@line 2478
  STACKTOP = sp; //@line 2479
  return 0; //@line 2479
 }
 return 0; //@line 2481
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$phi$trans$insert = 0, $$pre = 0, $$pre$i$i4 = 0, $$pre10 = 0, $12 = 0, $2 = 0, $20 = 0, $21 = 0, $25 = 0, $27 = 0, $29 = 0, $3 = 0, $30 = 0, $33 = 0, $4 = 0, $41 = 0, $49 = 0, $6 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx8 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 236
 STACKTOP = STACKTOP + 16 | 0; //@line 237
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 237
 $2 = sp; //@line 238
 $3 = $1 + 12 | 0; //@line 239
 $4 = HEAP32[$3 >> 2] | 0; //@line 240
 if ($4 | 0) {
  $6 = $0 + 56 | 0; //@line 243
  if (($6 | 0) != ($1 | 0)) {
   $8 = $0 + 68 | 0; //@line 246
   $9 = HEAP32[$8 >> 2] | 0; //@line 247
   do {
    if (!$9) {
     $20 = $4; //@line 251
     label = 7; //@line 252
    } else {
     $12 = HEAP32[$9 + 8 >> 2] | 0; //@line 255
     $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 256
     FUNCTION_TABLE_vi[$12 & 127]($6); //@line 257
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 17; //@line 260
      HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 262
      HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 264
      HEAP32[$AsyncCtx + 12 >> 2] = $6; //@line 266
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 268
      HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 270
      sp = STACKTOP; //@line 271
      STACKTOP = sp; //@line 272
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 274
      $$pre = HEAP32[$3 >> 2] | 0; //@line 275
      if (!$$pre) {
       $25 = 0; //@line 278
       break;
      } else {
       $20 = $$pre; //@line 281
       label = 7; //@line 282
       break;
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 7) {
     $21 = HEAP32[$20 + 4 >> 2] | 0; //@line 291
     $AsyncCtx2 = _emscripten_alloc_async_context(16, sp) | 0; //@line 292
     FUNCTION_TABLE_vii[$21 & 3]($6, $1); //@line 293
     if (___async) {
      HEAP32[$AsyncCtx2 >> 2] = 18; //@line 296
      HEAP32[$AsyncCtx2 + 4 >> 2] = $3; //@line 298
      HEAP32[$AsyncCtx2 + 8 >> 2] = $8; //@line 300
      HEAP32[$AsyncCtx2 + 12 >> 2] = $0; //@line 302
      sp = STACKTOP; //@line 303
      STACKTOP = sp; //@line 304
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx2 | 0); //@line 306
      $25 = HEAP32[$3 >> 2] | 0; //@line 308
      break;
     }
    }
   } while (0);
   HEAP32[$8 >> 2] = $25; //@line 313
  }
  _gpio_irq_set($0 + 28 | 0, 2, 1); //@line 316
  STACKTOP = sp; //@line 317
  return;
 }
 HEAP32[$2 >> 2] = 0; //@line 319
 HEAP32[$2 + 4 >> 2] = 0; //@line 319
 HEAP32[$2 + 8 >> 2] = 0; //@line 319
 HEAP32[$2 + 12 >> 2] = 0; //@line 319
 $27 = $0 + 56 | 0; //@line 320
 do {
  if (($27 | 0) != ($2 | 0)) {
   $29 = $0 + 68 | 0; //@line 324
   $30 = HEAP32[$29 >> 2] | 0; //@line 325
   if ($30 | 0) {
    $33 = HEAP32[$30 + 8 >> 2] | 0; //@line 329
    $AsyncCtx5 = _emscripten_alloc_async_context(24, sp) | 0; //@line 330
    FUNCTION_TABLE_vi[$33 & 127]($27); //@line 331
    if (___async) {
     HEAP32[$AsyncCtx5 >> 2] = 19; //@line 334
     HEAP32[$AsyncCtx5 + 4 >> 2] = $2; //@line 336
     HEAP32[$AsyncCtx5 + 8 >> 2] = $29; //@line 338
     HEAP32[$AsyncCtx5 + 12 >> 2] = $27; //@line 340
     HEAP32[$AsyncCtx5 + 16 >> 2] = $2; //@line 342
     HEAP32[$AsyncCtx5 + 20 >> 2] = $0; //@line 344
     sp = STACKTOP; //@line 345
     STACKTOP = sp; //@line 346
     return;
    }
    _emscripten_free_async_context($AsyncCtx5 | 0); //@line 348
    $$phi$trans$insert = $2 + 12 | 0; //@line 349
    $$pre10 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 350
    if ($$pre10 | 0) {
     $41 = HEAP32[$$pre10 + 4 >> 2] | 0; //@line 354
     $AsyncCtx8 = _emscripten_alloc_async_context(20, sp) | 0; //@line 355
     FUNCTION_TABLE_vii[$41 & 3]($27, $2); //@line 356
     if (___async) {
      HEAP32[$AsyncCtx8 >> 2] = 20; //@line 359
      HEAP32[$AsyncCtx8 + 4 >> 2] = $$phi$trans$insert; //@line 361
      HEAP32[$AsyncCtx8 + 8 >> 2] = $29; //@line 363
      HEAP32[$AsyncCtx8 + 12 >> 2] = $2; //@line 365
      HEAP32[$AsyncCtx8 + 16 >> 2] = $0; //@line 367
      sp = STACKTOP; //@line 368
      STACKTOP = sp; //@line 369
      return;
     }
     _emscripten_free_async_context($AsyncCtx8 | 0); //@line 371
     $$pre$i$i4 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 372
     HEAP32[$29 >> 2] = $$pre$i$i4; //@line 373
     if (!$$pre$i$i4) {
      break;
     }
     $49 = HEAP32[$$pre$i$i4 + 8 >> 2] | 0; //@line 380
     $AsyncCtx11 = _emscripten_alloc_async_context(12, sp) | 0; //@line 381
     FUNCTION_TABLE_vi[$49 & 127]($2); //@line 382
     if (___async) {
      HEAP32[$AsyncCtx11 >> 2] = 21; //@line 385
      HEAP32[$AsyncCtx11 + 4 >> 2] = $2; //@line 387
      HEAP32[$AsyncCtx11 + 8 >> 2] = $0; //@line 389
      sp = STACKTOP; //@line 390
      STACKTOP = sp; //@line 391
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx11 | 0); //@line 393
      break;
     }
    }
   }
   HEAP32[$29 >> 2] = 0; //@line 398
  }
 } while (0);
 _gpio_irq_set($0 + 28 | 0, 2, 0); //@line 402
 STACKTOP = sp; //@line 403
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_40($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13895
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13897
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13899
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13901
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13903
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13905
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13907
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 13910
 $16 = HEAP8[$0 + 29 >> 0] & 1; //@line 13913
 $18 = HEAP32[$0 + 32 >> 2] | 0; //@line 13915
 $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 13917
 $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 13919
 $24 = HEAP32[$0 + 44 >> 2] | 0; //@line 13921
 $26 = HEAP8[$0 + 48 >> 0] & 1; //@line 13924
 $28 = HEAP32[$0 + 52 >> 2] | 0; //@line 13926
 L2 : do {
  if (!(HEAP8[$4 >> 0] | 0)) {
   do {
    if (!(HEAP8[$24 >> 0] | 0)) {
     $$182$off0 = $14; //@line 13935
     $$186$off0 = $16; //@line 13935
    } else {
     if (!(HEAP8[$22 >> 0] | 0)) {
      if (!(HEAP32[$20 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $16; //@line 13944
       $$283$off0 = 1; //@line 13944
       label = 13; //@line 13945
       break L2;
      } else {
       $$182$off0 = 1; //@line 13948
       $$186$off0 = $16; //@line 13948
       break;
      }
     }
     if ((HEAP32[$6 >> 2] | 0) == 1) {
      label = 18; //@line 13955
      break L2;
     }
     if (!(HEAP32[$20 >> 2] & 2)) {
      label = 18; //@line 13962
      break L2;
     } else {
      $$182$off0 = 1; //@line 13965
      $$186$off0 = 1; //@line 13965
     }
    }
   } while (0);
   $30 = $18 + 8 | 0; //@line 13969
   if ($30 >>> 0 < $28 >>> 0) {
    HEAP8[$22 >> 0] = 0; //@line 13972
    HEAP8[$24 >> 0] = 0; //@line 13973
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 13974
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $12, $8, $8, 1, $26); //@line 13975
    if (!___async) {
     ___async_unwind = 0; //@line 13978
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 110; //@line 13980
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 13982
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 13984
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 13986
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 13988
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 13990
    HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $12; //@line 13992
    HEAP8[$ReallocAsyncCtx5 + 28 >> 0] = $$182$off0 & 1; //@line 13995
    HEAP8[$ReallocAsyncCtx5 + 29 >> 0] = $$186$off0 & 1; //@line 13998
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $30; //@line 14000
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $20; //@line 14002
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $22; //@line 14004
    HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $24; //@line 14006
    HEAP8[$ReallocAsyncCtx5 + 48 >> 0] = $26 & 1; //@line 14009
    HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $28; //@line 14011
    sp = STACKTOP; //@line 14012
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 14015
    $$283$off0 = $$182$off0; //@line 14015
    label = 13; //@line 14016
   }
  } else {
   $$085$off0$reg2mem$0 = $16; //@line 14019
   $$283$off0 = $14; //@line 14019
   label = 13; //@line 14020
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$10 >> 2] = $8; //@line 14026
    $59 = $12 + 40 | 0; //@line 14027
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 14030
    if ((HEAP32[$12 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$6 >> 2] | 0) == 2) {
      HEAP8[$4 >> 0] = 1; //@line 14038
      if ($$283$off0) {
       label = 18; //@line 14040
       break;
      } else {
       $67 = 4; //@line 14043
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 14050
   } else {
    $67 = 4; //@line 14052
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 14057
 }
 HEAP32[$2 >> 2] = $67; //@line 14059
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_39($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13739
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13741
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13743
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13745
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13747
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 13750
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13752
 $15 = $12 + 24 | 0; //@line 13755
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$12 + 8 >> 2] | 0; //@line 13760
   if (!($18 & 2)) {
    $21 = $4 + 36 | 0; //@line 13764
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $4 + 54 | 0; //@line 13771
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 13782
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 13783
      if (!___async) {
       ___async_unwind = 0; //@line 13786
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 114; //@line 13788
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 13790
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $2; //@line 13792
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 13794
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 13796
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $4; //@line 13798
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $6; //@line 13800
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $8; //@line 13802
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $10 & 1; //@line 13805
      sp = STACKTOP; //@line 13806
      return;
     }
     $36 = $4 + 24 | 0; //@line 13809
     $37 = $4 + 54 | 0; //@line 13810
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 13825
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 13826
     if (!___async) {
      ___async_unwind = 0; //@line 13829
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 113; //@line 13831
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 13833
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $2; //@line 13835
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 13837
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 13839
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 13841
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $4; //@line 13843
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $6; //@line 13845
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $8; //@line 13847
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $10 & 1; //@line 13850
     sp = STACKTOP; //@line 13851
     return;
    }
   }
   $24 = $4 + 54 | 0; //@line 13855
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 13859
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 13860
    if (!___async) {
     ___async_unwind = 0; //@line 13863
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 112; //@line 13865
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 13867
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $2; //@line 13869
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 13871
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $4; //@line 13873
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $6; //@line 13875
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $8; //@line 13877
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $10 & 1; //@line 13880
    sp = STACKTOP; //@line 13881
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
 sp = STACKTOP; //@line 11033
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 11038
 } else {
  $9 = $1 + 52 | 0; //@line 11040
  $10 = HEAP8[$9 >> 0] | 0; //@line 11041
  $11 = $1 + 53 | 0; //@line 11042
  $12 = HEAP8[$11 >> 0] | 0; //@line 11043
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 11046
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 11047
  HEAP8[$9 >> 0] = 0; //@line 11048
  HEAP8[$11 >> 0] = 0; //@line 11049
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 11050
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 11051
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 108; //@line 11054
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 11056
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 11058
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 11060
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 11062
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 11064
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 11066
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 11068
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 11070
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 11072
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 11074
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 11077
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 11079
   sp = STACKTOP; //@line 11080
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11083
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 11088
    $32 = $0 + 8 | 0; //@line 11089
    $33 = $1 + 54 | 0; //@line 11090
    $$0 = $0 + 24 | 0; //@line 11091
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
     HEAP8[$9 >> 0] = 0; //@line 11124
     HEAP8[$11 >> 0] = 0; //@line 11125
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 11126
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 11127
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 11132
     $62 = $$0 + 8 | 0; //@line 11133
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 11136
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 109; //@line 11141
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 11143
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 11145
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 11147
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 11149
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 11151
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 11153
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 11155
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 11157
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 11159
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 11161
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 11163
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 11165
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 11167
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 11170
    sp = STACKTOP; //@line 11171
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 11175
  HEAP8[$11 >> 0] = $12; //@line 11176
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8152
      $10 = HEAP32[$9 >> 2] | 0; //@line 8153
      HEAP32[$2 >> 2] = $9 + 4; //@line 8155
      HEAP32[$0 >> 2] = $10; //@line 8156
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8172
      $17 = HEAP32[$16 >> 2] | 0; //@line 8173
      HEAP32[$2 >> 2] = $16 + 4; //@line 8175
      $20 = $0; //@line 8178
      HEAP32[$20 >> 2] = $17; //@line 8180
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 8183
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8199
      $30 = HEAP32[$29 >> 2] | 0; //@line 8200
      HEAP32[$2 >> 2] = $29 + 4; //@line 8202
      $31 = $0; //@line 8203
      HEAP32[$31 >> 2] = $30; //@line 8205
      HEAP32[$31 + 4 >> 2] = 0; //@line 8208
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 8224
      $41 = $40; //@line 8225
      $43 = HEAP32[$41 >> 2] | 0; //@line 8227
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 8230
      HEAP32[$2 >> 2] = $40 + 8; //@line 8232
      $47 = $0; //@line 8233
      HEAP32[$47 >> 2] = $43; //@line 8235
      HEAP32[$47 + 4 >> 2] = $46; //@line 8238
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8254
      $57 = HEAP32[$56 >> 2] | 0; //@line 8255
      HEAP32[$2 >> 2] = $56 + 4; //@line 8257
      $59 = ($57 & 65535) << 16 >> 16; //@line 8259
      $62 = $0; //@line 8262
      HEAP32[$62 >> 2] = $59; //@line 8264
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 8267
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8283
      $72 = HEAP32[$71 >> 2] | 0; //@line 8284
      HEAP32[$2 >> 2] = $71 + 4; //@line 8286
      $73 = $0; //@line 8288
      HEAP32[$73 >> 2] = $72 & 65535; //@line 8290
      HEAP32[$73 + 4 >> 2] = 0; //@line 8293
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8309
      $83 = HEAP32[$82 >> 2] | 0; //@line 8310
      HEAP32[$2 >> 2] = $82 + 4; //@line 8312
      $85 = ($83 & 255) << 24 >> 24; //@line 8314
      $88 = $0; //@line 8317
      HEAP32[$88 >> 2] = $85; //@line 8319
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 8322
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8338
      $98 = HEAP32[$97 >> 2] | 0; //@line 8339
      HEAP32[$2 >> 2] = $97 + 4; //@line 8341
      $99 = $0; //@line 8343
      HEAP32[$99 >> 2] = $98 & 255; //@line 8345
      HEAP32[$99 + 4 >> 2] = 0; //@line 8348
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 8364
      $109 = +HEAPF64[$108 >> 3]; //@line 8365
      HEAP32[$2 >> 2] = $108 + 8; //@line 8367
      HEAPF64[$0 >> 3] = $109; //@line 8368
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 8384
      $116 = +HEAPF64[$115 >> 3]; //@line 8385
      HEAP32[$2 >> 2] = $115 + 8; //@line 8387
      HEAPF64[$0 >> 3] = $116; //@line 8388
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
 sp = STACKTOP; //@line 7052
 STACKTOP = STACKTOP + 224 | 0; //@line 7053
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 7053
 $3 = sp + 120 | 0; //@line 7054
 $4 = sp + 80 | 0; //@line 7055
 $5 = sp; //@line 7056
 $6 = sp + 136 | 0; //@line 7057
 dest = $4; //@line 7058
 stop = dest + 40 | 0; //@line 7058
 do {
  HEAP32[dest >> 2] = 0; //@line 7058
  dest = dest + 4 | 0; //@line 7058
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 7060
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 7064
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 7071
  } else {
   $43 = 0; //@line 7073
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 7075
  $14 = $13 & 32; //@line 7076
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 7082
  }
  $19 = $0 + 48 | 0; //@line 7084
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 7089
    $24 = HEAP32[$23 >> 2] | 0; //@line 7090
    HEAP32[$23 >> 2] = $6; //@line 7091
    $25 = $0 + 28 | 0; //@line 7092
    HEAP32[$25 >> 2] = $6; //@line 7093
    $26 = $0 + 20 | 0; //@line 7094
    HEAP32[$26 >> 2] = $6; //@line 7095
    HEAP32[$19 >> 2] = 80; //@line 7096
    $28 = $0 + 16 | 0; //@line 7098
    HEAP32[$28 >> 2] = $6 + 80; //@line 7099
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 7100
    if (!$24) {
     $$1 = $29; //@line 7103
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 7106
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 7107
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 7108
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 89; //@line 7111
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 7113
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 7115
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 7117
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 7119
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 7121
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 7123
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 7125
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 7127
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 7129
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 7131
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 7133
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 7135
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 7137
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 7139
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 7141
      sp = STACKTOP; //@line 7142
      STACKTOP = sp; //@line 7143
      return 0; //@line 7143
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 7145
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 7148
      HEAP32[$23 >> 2] = $24; //@line 7149
      HEAP32[$19 >> 2] = 0; //@line 7150
      HEAP32[$28 >> 2] = 0; //@line 7151
      HEAP32[$25 >> 2] = 0; //@line 7152
      HEAP32[$26 >> 2] = 0; //@line 7153
      $$1 = $$; //@line 7154
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 7160
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 7163
  HEAP32[$0 >> 2] = $51 | $14; //@line 7168
  if ($43 | 0) {
   ___unlockfile($0); //@line 7171
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 7173
 }
 STACKTOP = sp; //@line 7175
 return $$0 | 0; //@line 7175
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 10568
 STACKTOP = STACKTOP + 64 | 0; //@line 10569
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 10569
 $4 = sp; //@line 10570
 $5 = HEAP32[$0 >> 2] | 0; //@line 10571
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 10574
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 10576
 HEAP32[$4 >> 2] = $2; //@line 10577
 HEAP32[$4 + 4 >> 2] = $0; //@line 10579
 HEAP32[$4 + 8 >> 2] = $1; //@line 10581
 HEAP32[$4 + 12 >> 2] = $3; //@line 10583
 $14 = $4 + 16 | 0; //@line 10584
 $15 = $4 + 20 | 0; //@line 10585
 $16 = $4 + 24 | 0; //@line 10586
 $17 = $4 + 28 | 0; //@line 10587
 $18 = $4 + 32 | 0; //@line 10588
 $19 = $4 + 40 | 0; //@line 10589
 dest = $14; //@line 10590
 stop = dest + 36 | 0; //@line 10590
 do {
  HEAP32[dest >> 2] = 0; //@line 10590
  dest = dest + 4 | 0; //@line 10590
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 10590
 HEAP8[$14 + 38 >> 0] = 0; //@line 10590
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 10595
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10598
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10599
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 10600
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 100; //@line 10603
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 10605
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 10607
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 10609
    sp = STACKTOP; //@line 10610
    STACKTOP = sp; //@line 10611
    return 0; //@line 10611
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10613
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 10617
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 10621
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 10624
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 10625
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 10626
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 101; //@line 10629
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 10631
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 10633
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 10635
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 10637
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 10639
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 10641
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 10643
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 10645
    sp = STACKTOP; //@line 10646
    STACKTOP = sp; //@line 10647
    return 0; //@line 10647
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10649
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 10663
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 10671
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 10687
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 10692
  }
 } while (0);
 STACKTOP = sp; //@line 10695
 return $$0 | 0; //@line 10695
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 6924
 $7 = ($2 | 0) != 0; //@line 6928
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 6932
   $$03555 = $0; //@line 6933
   $$03654 = $2; //@line 6933
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 6938
     $$036$lcssa64 = $$03654; //@line 6938
     label = 6; //@line 6939
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 6942
    $12 = $$03654 + -1 | 0; //@line 6943
    $16 = ($12 | 0) != 0; //@line 6947
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 6950
     $$03654 = $12; //@line 6950
    } else {
     $$035$lcssa = $11; //@line 6952
     $$036$lcssa = $12; //@line 6952
     $$lcssa = $16; //@line 6952
     label = 5; //@line 6953
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 6958
   $$036$lcssa = $2; //@line 6958
   $$lcssa = $7; //@line 6958
   label = 5; //@line 6959
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 6964
   $$036$lcssa64 = $$036$lcssa; //@line 6964
   label = 6; //@line 6965
  } else {
   $$2 = $$035$lcssa; //@line 6967
   $$3 = 0; //@line 6967
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 6973
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 6976
    $$3 = $$036$lcssa64; //@line 6976
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 6978
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 6982
      $$13745 = $$036$lcssa64; //@line 6982
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 6985
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 6994
       $30 = $$13745 + -4 | 0; //@line 6995
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 6998
        $$13745 = $30; //@line 6998
       } else {
        $$0$lcssa = $29; //@line 7000
        $$137$lcssa = $30; //@line 7000
        label = 11; //@line 7001
        break L11;
       }
      }
      $$140 = $$046; //@line 7005
      $$23839 = $$13745; //@line 7005
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 7007
      $$137$lcssa = $$036$lcssa64; //@line 7007
      label = 11; //@line 7008
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 7014
      $$3 = 0; //@line 7014
      break;
     } else {
      $$140 = $$0$lcssa; //@line 7017
      $$23839 = $$137$lcssa; //@line 7017
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 7024
      $$3 = $$23839; //@line 7024
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 7027
     $$23839 = $$23839 + -1 | 0; //@line 7028
     if (!$$23839) {
      $$2 = $35; //@line 7031
      $$3 = 0; //@line 7031
      break;
     } else {
      $$140 = $35; //@line 7034
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 7042
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 6695
 do {
  if (!$0) {
   do {
    if (!(HEAP32[109] | 0)) {
     $34 = 0; //@line 6703
    } else {
     $12 = HEAP32[109] | 0; //@line 6705
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 6706
     $13 = _fflush($12) | 0; //@line 6707
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 85; //@line 6710
      sp = STACKTOP; //@line 6711
      return 0; //@line 6712
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 6714
      $34 = $13; //@line 6715
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 6721
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 6725
    } else {
     $$02327 = $$02325; //@line 6727
     $$02426 = $34; //@line 6727
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 6734
      } else {
       $28 = 0; //@line 6736
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 6744
       $25 = ___fflush_unlocked($$02327) | 0; //@line 6745
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 6750
       $$1 = $25 | $$02426; //@line 6752
      } else {
       $$1 = $$02426; //@line 6754
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 6758
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 6761
      if (!$$023) {
       $$024$lcssa = $$1; //@line 6764
       break L9;
      } else {
       $$02327 = $$023; //@line 6767
       $$02426 = $$1; //@line 6767
      }
     }
     HEAP32[$AsyncCtx >> 2] = 86; //@line 6770
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 6772
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 6774
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 6776
     sp = STACKTOP; //@line 6777
     return 0; //@line 6778
    }
   } while (0);
   ___ofl_unlock(); //@line 6781
   $$0 = $$024$lcssa; //@line 6782
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 6788
    $5 = ___fflush_unlocked($0) | 0; //@line 6789
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 83; //@line 6792
     sp = STACKTOP; //@line 6793
     return 0; //@line 6794
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 6796
     $$0 = $5; //@line 6797
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 6802
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 6803
   $7 = ___fflush_unlocked($0) | 0; //@line 6804
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 84; //@line 6807
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 6810
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 6812
    sp = STACKTOP; //@line 6813
    return 0; //@line 6814
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6816
   if ($phitmp) {
    $$0 = $7; //@line 6818
   } else {
    ___unlockfile($0); //@line 6820
    $$0 = $7; //@line 6821
   }
  }
 } while (0);
 return $$0 | 0; //@line 6825
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10750
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10756
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 10762
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 10765
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 10766
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 10767
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 104; //@line 10770
     sp = STACKTOP; //@line 10771
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10774
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 10782
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 10787
     $19 = $1 + 44 | 0; //@line 10788
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 10794
     HEAP8[$22 >> 0] = 0; //@line 10795
     $23 = $1 + 53 | 0; //@line 10796
     HEAP8[$23 >> 0] = 0; //@line 10797
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 10799
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 10802
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 10803
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 10804
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 103; //@line 10807
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 10809
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10811
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 10813
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 10815
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 10817
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 10819
      sp = STACKTOP; //@line 10820
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 10823
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 10827
      label = 13; //@line 10828
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 10833
       label = 13; //@line 10834
      } else {
       $$037$off039 = 3; //@line 10836
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 10840
      $39 = $1 + 40 | 0; //@line 10841
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 10844
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 10854
        $$037$off039 = $$037$off038; //@line 10855
       } else {
        $$037$off039 = $$037$off038; //@line 10857
       }
      } else {
       $$037$off039 = $$037$off038; //@line 10860
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 10863
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 10870
   }
  }
 } while (0);
 return;
}
function _equeue_enqueue($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$051$ph = 0, $$05157 = 0, $$0515859 = 0, $$053 = 0, $13 = 0, $14 = 0, $16 = 0, $24 = 0, $25 = 0, $27 = 0, $29 = 0, $33 = 0, $34 = 0, $42 = 0, $43 = 0, $46 = 0, $47 = 0, $49 = 0, $54 = 0, $65 = 0, $67 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 815
 $13 = $1 - (HEAP32[$0 + 12 >> 2] | 0) | HEAPU8[$1 + 4 >> 0] << HEAP32[$0 + 16 >> 2]; //@line 826
 $14 = $1 + 20 | 0; //@line 827
 $16 = (HEAP32[$14 >> 2] | 0) - $2 | 0; //@line 829
 HEAP32[$14 >> 2] = ($16 & ~($16 >> 31)) + $2; //@line 834
 HEAP8[$1 + 5 >> 0] = HEAP8[$0 + 9 >> 0] | 0; //@line 838
 $24 = $0 + 128 | 0; //@line 839
 _equeue_mutex_lock($24); //@line 840
 $25 = HEAP32[$0 >> 2] | 0; //@line 841
 L1 : do {
  if (!$25) {
   $$051$ph = $0; //@line 845
   label = 5; //@line 846
  } else {
   $27 = HEAP32[$14 >> 2] | 0; //@line 848
   $$053 = $0; //@line 849
   $29 = $25; //@line 849
   while (1) {
    if (((HEAP32[$29 + 20 >> 2] | 0) - $27 | 0) >= 0) {
     break;
    }
    $33 = $29 + 8 | 0; //@line 858
    $34 = HEAP32[$33 >> 2] | 0; //@line 859
    if (!$34) {
     $$051$ph = $33; //@line 862
     label = 5; //@line 863
     break L1;
    } else {
     $$053 = $33; //@line 866
     $29 = $34; //@line 866
    }
   }
   if ((HEAP32[$29 + 20 >> 2] | 0) != (HEAP32[$14 >> 2] | 0)) {
    $49 = $1 + 8 | 0; //@line 874
    HEAP32[$49 >> 2] = $29; //@line 875
    HEAP32[$29 + 16 >> 2] = $49; //@line 877
    $$0515859 = $$053; //@line 878
    label = 11; //@line 879
    break;
   }
   $42 = HEAP32[$29 + 8 >> 2] | 0; //@line 883
   $43 = $1 + 8 | 0; //@line 884
   HEAP32[$43 >> 2] = $42; //@line 885
   if ($42 | 0) {
    HEAP32[$42 + 16 >> 2] = $43; //@line 889
   }
   $46 = HEAP32[$$053 >> 2] | 0; //@line 891
   $47 = $1 + 12 | 0; //@line 892
   HEAP32[$47 >> 2] = $46; //@line 893
   HEAP32[$46 + 16 >> 2] = $47; //@line 895
   $$05157 = $$053; //@line 896
  }
 } while (0);
 if ((label | 0) == 5) {
  HEAP32[$1 + 8 >> 2] = 0; //@line 901
  $$0515859 = $$051$ph; //@line 902
  label = 11; //@line 903
 }
 if ((label | 0) == 11) {
  HEAP32[$1 + 12 >> 2] = 0; //@line 907
  $$05157 = $$0515859; //@line 908
 }
 HEAP32[$$05157 >> 2] = $1; //@line 910
 HEAP32[$1 + 16 >> 2] = $$05157; //@line 912
 $54 = HEAP32[$0 + 40 >> 2] | 0; //@line 914
 if (!$54) {
  _equeue_mutex_unlock($24); //@line 917
  return $13 | 0; //@line 918
 }
 if (!(HEAP8[$0 + 36 >> 0] | 0)) {
  _equeue_mutex_unlock($24); //@line 924
  return $13 | 0; //@line 925
 }
 if ((HEAP32[$0 >> 2] | 0) != ($1 | 0)) {
  _equeue_mutex_unlock($24); //@line 930
  return $13 | 0; //@line 931
 }
 if (HEAP32[$1 + 12 >> 2] | 0) {
  _equeue_mutex_unlock($24); //@line 937
  return $13 | 0; //@line 938
 }
 $65 = HEAP32[$0 + 44 >> 2] | 0; //@line 941
 $67 = (HEAP32[$14 >> 2] | 0) - $2 | 0; //@line 943
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 947
 FUNCTION_TABLE_vii[$54 & 3]($65, $67 & ~($67 >> 31)); //@line 948
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 26; //@line 951
  HEAP32[$AsyncCtx + 4 >> 2] = $24; //@line 953
  HEAP32[$AsyncCtx + 8 >> 2] = $13; //@line 955
  sp = STACKTOP; //@line 956
  return 0; //@line 957
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 959
 _equeue_mutex_unlock($24); //@line 960
 return $13 | 0; //@line 961
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $12 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $29 = 0, $3 = 0, $36 = 0, $39 = 0, $40 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx14 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 10062
 STACKTOP = STACKTOP + 48 | 0; //@line 10063
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 10063
 $vararg_buffer10 = sp + 32 | 0; //@line 10064
 $vararg_buffer7 = sp + 24 | 0; //@line 10065
 $vararg_buffer3 = sp + 16 | 0; //@line 10066
 $vararg_buffer = sp; //@line 10067
 $0 = sp + 36 | 0; //@line 10068
 $1 = ___cxa_get_globals_fast() | 0; //@line 10069
 if ($1 | 0) {
  $3 = HEAP32[$1 >> 2] | 0; //@line 10072
  if ($3 | 0) {
   $7 = $3 + 48 | 0; //@line 10077
   $9 = HEAP32[$7 >> 2] | 0; //@line 10079
   $12 = HEAP32[$7 + 4 >> 2] | 0; //@line 10082
   if (!(($9 & -256 | 0) == 1126902528 & ($12 | 0) == 1129074247)) {
    HEAP32[$vararg_buffer7 >> 2] = 4069; //@line 10088
    _abort_message(4019, $vararg_buffer7); //@line 10089
   }
   if (($9 | 0) == 1126902529 & ($12 | 0) == 1129074247) {
    $22 = HEAP32[$3 + 44 >> 2] | 0; //@line 10098
   } else {
    $22 = $3 + 80 | 0; //@line 10100
   }
   HEAP32[$0 >> 2] = $22; //@line 10102
   $23 = HEAP32[$3 >> 2] | 0; //@line 10103
   $25 = HEAP32[$23 + 4 >> 2] | 0; //@line 10105
   $28 = HEAP32[(HEAP32[10] | 0) + 16 >> 2] | 0; //@line 10108
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 10109
   $29 = FUNCTION_TABLE_iiii[$28 & 7](40, $23, $0) | 0; //@line 10110
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 94; //@line 10113
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 10115
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 10117
    HEAP32[$AsyncCtx + 12 >> 2] = $25; //@line 10119
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 10121
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 10123
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 10125
    sp = STACKTOP; //@line 10126
    STACKTOP = sp; //@line 10127
    return;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 10129
   if (!$29) {
    HEAP32[$vararg_buffer3 >> 2] = 4069; //@line 10131
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 10133
    _abort_message(3978, $vararg_buffer3); //@line 10134
   }
   $36 = HEAP32[$0 >> 2] | 0; //@line 10137
   $39 = HEAP32[(HEAP32[$36 >> 2] | 0) + 8 >> 2] | 0; //@line 10140
   $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 10141
   $40 = FUNCTION_TABLE_ii[$39 & 3]($36) | 0; //@line 10142
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 95; //@line 10145
    HEAP32[$AsyncCtx14 + 4 >> 2] = $vararg_buffer; //@line 10147
    HEAP32[$AsyncCtx14 + 8 >> 2] = $25; //@line 10149
    HEAP32[$AsyncCtx14 + 12 >> 2] = $vararg_buffer; //@line 10151
    sp = STACKTOP; //@line 10152
    STACKTOP = sp; //@line 10153
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 10155
    HEAP32[$vararg_buffer >> 2] = 4069; //@line 10156
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 10158
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 10160
    _abort_message(3933, $vararg_buffer); //@line 10161
   }
  }
 }
 _abort_message(4057, $vararg_buffer10); //@line 10166
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5850
 STACKTOP = STACKTOP + 48 | 0; //@line 5851
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 5851
 $vararg_buffer3 = sp + 16 | 0; //@line 5852
 $vararg_buffer = sp; //@line 5853
 $3 = sp + 32 | 0; //@line 5854
 $4 = $0 + 28 | 0; //@line 5855
 $5 = HEAP32[$4 >> 2] | 0; //@line 5856
 HEAP32[$3 >> 2] = $5; //@line 5857
 $7 = $0 + 20 | 0; //@line 5859
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 5861
 HEAP32[$3 + 4 >> 2] = $9; //@line 5862
 HEAP32[$3 + 8 >> 2] = $1; //@line 5864
 HEAP32[$3 + 12 >> 2] = $2; //@line 5866
 $12 = $9 + $2 | 0; //@line 5867
 $13 = $0 + 60 | 0; //@line 5868
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 5871
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 5873
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 5875
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 5877
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 5881
  } else {
   $$04756 = 2; //@line 5883
   $$04855 = $12; //@line 5883
   $$04954 = $3; //@line 5883
   $27 = $17; //@line 5883
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 5889
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 5891
    $38 = $27 >>> 0 > $37 >>> 0; //@line 5892
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 5894
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 5896
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 5898
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 5901
    $44 = $$150 + 4 | 0; //@line 5902
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 5905
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 5908
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 5910
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 5912
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 5914
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 5917
     break L1;
    } else {
     $$04756 = $$1; //@line 5920
     $$04954 = $$150; //@line 5920
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 5924
   HEAP32[$4 >> 2] = 0; //@line 5925
   HEAP32[$7 >> 2] = 0; //@line 5926
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 5929
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 5932
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 5937
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 5943
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 5948
  $25 = $20; //@line 5949
  HEAP32[$4 >> 2] = $25; //@line 5950
  HEAP32[$7 >> 2] = $25; //@line 5951
  $$051 = $2; //@line 5952
 }
 STACKTOP = sp; //@line 5954
 return $$051 | 0; //@line 5954
}
function _main__async_cb_25($0) {
 $0 = $0 | 0;
 var $$expand_i1_val = 0, $12 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 12744
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12746
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12748
 if (!$AsyncRetVal) {
  HEAP32[$2 >> 2] = 0; //@line 12751
  HEAP32[$2 + 4 >> 2] = 0; //@line 12751
  HEAP32[$2 + 8 >> 2] = 0; //@line 12751
  HEAP32[$2 + 12 >> 2] = 0; //@line 12751
  $18 = 1; //@line 12752
  $20 = $2; //@line 12752
 } else {
  HEAP32[$AsyncRetVal + 4 >> 2] = 4528; //@line 12755
  HEAP32[$AsyncRetVal + 8 >> 2] = 0; //@line 12757
  HEAP32[$AsyncRetVal + 12 >> 2] = 0; //@line 12759
  HEAP32[$AsyncRetVal + 16 >> 2] = -1; //@line 12761
  HEAP32[$AsyncRetVal + 20 >> 2] = 2; //@line 12763
  HEAP32[$AsyncRetVal + 24 >> 2] = 64; //@line 12765
  HEAP32[$AsyncRetVal + 28 >> 2] = 3; //@line 12767
  HEAP32[$AsyncRetVal >> 2] = 1; //@line 12768
  $12 = $2 + 4 | 0; //@line 12769
  HEAP32[$12 >> 2] = 0; //@line 12770
  HEAP32[$12 + 4 >> 2] = 0; //@line 12770
  HEAP32[$12 + 8 >> 2] = 0; //@line 12770
  HEAP32[$2 >> 2] = $AsyncRetVal; //@line 12771
  HEAP32[$AsyncRetVal >> 2] = (HEAP32[$AsyncRetVal >> 2] | 0) + 1; //@line 12774
  $18 = 0; //@line 12775
  $20 = $2; //@line 12775
 }
 $15 = $2 + 12 | 0; //@line 12777
 HEAP32[$15 >> 2] = 168; //@line 12778
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(24) | 0; //@line 12779
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(4776, $2); //@line 12780
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 65; //@line 12783
  $16 = $ReallocAsyncCtx6 + 4 | 0; //@line 12784
  HEAP32[$16 >> 2] = $15; //@line 12785
  $17 = $ReallocAsyncCtx6 + 8 | 0; //@line 12786
  $$expand_i1_val = $18 & 1; //@line 12787
  HEAP8[$17 >> 0] = $$expand_i1_val; //@line 12788
  $19 = $ReallocAsyncCtx6 + 12 | 0; //@line 12789
  HEAP32[$19 >> 2] = $20; //@line 12790
  $21 = $ReallocAsyncCtx6 + 16 | 0; //@line 12791
  HEAP32[$21 >> 2] = $AsyncRetVal; //@line 12792
  $22 = $ReallocAsyncCtx6 + 20 | 0; //@line 12793
  HEAP32[$22 >> 2] = $AsyncRetVal; //@line 12794
  sp = STACKTOP; //@line 12795
  return;
 }
 ___async_unwind = 0; //@line 12798
 HEAP32[$ReallocAsyncCtx6 >> 2] = 65; //@line 12799
 $16 = $ReallocAsyncCtx6 + 4 | 0; //@line 12800
 HEAP32[$16 >> 2] = $15; //@line 12801
 $17 = $ReallocAsyncCtx6 + 8 | 0; //@line 12802
 $$expand_i1_val = $18 & 1; //@line 12803
 HEAP8[$17 >> 0] = $$expand_i1_val; //@line 12804
 $19 = $ReallocAsyncCtx6 + 12 | 0; //@line 12805
 HEAP32[$19 >> 2] = $20; //@line 12806
 $21 = $ReallocAsyncCtx6 + 16 | 0; //@line 12807
 HEAP32[$21 >> 2] = $AsyncRetVal; //@line 12808
 $22 = $ReallocAsyncCtx6 + 20 | 0; //@line 12809
 HEAP32[$22 >> 2] = $AsyncRetVal; //@line 12810
 sp = STACKTOP; //@line 12811
 return;
}
function _main__async_cb_24($0) {
 $0 = $0 | 0;
 var $$expand_i1_val = 0, $10 = 0, $11 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $19 = 0, $22 = 0, $23 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 12657
 $4 = HEAP8[$0 + 8 >> 0] & 1; //@line 12662
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12664
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12666
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12668
 $11 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 12669
 if ($11 | 0) {
  $14 = HEAP32[$11 + 8 >> 2] | 0; //@line 12673
  $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 12674
  FUNCTION_TABLE_vi[$14 & 127]($6); //@line 12675
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 66; //@line 12678
   $15 = $ReallocAsyncCtx + 4 | 0; //@line 12679
   $$expand_i1_val = $4 & 1; //@line 12680
   HEAP8[$15 >> 0] = $$expand_i1_val; //@line 12681
   $16 = $ReallocAsyncCtx + 8 | 0; //@line 12682
   HEAP32[$16 >> 2] = $8; //@line 12683
   $17 = $ReallocAsyncCtx + 12 | 0; //@line 12684
   HEAP32[$17 >> 2] = $10; //@line 12685
   sp = STACKTOP; //@line 12686
   return;
  }
  ___async_unwind = 0; //@line 12689
  HEAP32[$ReallocAsyncCtx >> 2] = 66; //@line 12690
  $15 = $ReallocAsyncCtx + 4 | 0; //@line 12691
  $$expand_i1_val = $4 & 1; //@line 12692
  HEAP8[$15 >> 0] = $$expand_i1_val; //@line 12693
  $16 = $ReallocAsyncCtx + 8 | 0; //@line 12694
  HEAP32[$16 >> 2] = $8; //@line 12695
  $17 = $ReallocAsyncCtx + 12 | 0; //@line 12696
  HEAP32[$17 >> 2] = $10; //@line 12697
  sp = STACKTOP; //@line 12698
  return;
 }
 if (!$4) {
  $19 = (HEAP32[$8 >> 2] | 0) + -1 | 0; //@line 12703
  HEAP32[$8 >> 2] = $19; //@line 12704
  if (!$19) {
   $22 = HEAP32[$8 + 24 >> 2] | 0; //@line 12708
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 12709
   FUNCTION_TABLE_vi[$22 & 127]($10); //@line 12710
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 67; //@line 12713
    $23 = $ReallocAsyncCtx2 + 4 | 0; //@line 12714
    HEAP32[$23 >> 2] = $8; //@line 12715
    sp = STACKTOP; //@line 12716
    return;
   }
   ___async_unwind = 0; //@line 12719
   HEAP32[$ReallocAsyncCtx2 >> 2] = 67; //@line 12720
   $23 = $ReallocAsyncCtx2 + 4 | 0; //@line 12721
   HEAP32[$23 >> 2] = $8; //@line 12722
   sp = STACKTOP; //@line 12723
   return;
  }
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 12727
 __ZN6events10EventQueue8dispatchEi(4528, -1); //@line 12728
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 69; //@line 12731
  sp = STACKTOP; //@line 12732
  return;
 }
 ___async_unwind = 0; //@line 12735
 HEAP32[$ReallocAsyncCtx3 >> 2] = 69; //@line 12736
 sp = STACKTOP; //@line 12737
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_57($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3038
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3042
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3044
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 3046
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3048
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 3050
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3052
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3054
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3056
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 3058
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 3061
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 3063
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 3067
   $27 = $6 + 24 | 0; //@line 3068
   $28 = $4 + 8 | 0; //@line 3069
   $29 = $6 + 54 | 0; //@line 3070
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
    HEAP8[$10 >> 0] = 0; //@line 3100
    HEAP8[$14 >> 0] = 0; //@line 3101
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 3102
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 3103
    if (!___async) {
     ___async_unwind = 0; //@line 3106
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 109; //@line 3108
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 3110
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 3112
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 3114
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 3116
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 3118
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 3120
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 3122
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 3124
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 3126
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 3128
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 3130
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 3132
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 3134
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 3137
    sp = STACKTOP; //@line 3138
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 3143
 HEAP8[$14 >> 0] = $12; //@line 3144
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2922
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2926
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2928
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 2930
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2932
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 2934
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2936
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2938
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2940
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2942
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 2944
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 2946
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 2948
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 2951
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 2952
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
    HEAP8[$10 >> 0] = 0; //@line 2985
    HEAP8[$14 >> 0] = 0; //@line 2986
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 2987
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 2988
    if (!___async) {
     ___async_unwind = 0; //@line 2991
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 109; //@line 2993
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 2995
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 2997
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 2999
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 3001
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 3003
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 3005
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 3007
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 3009
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 3011
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 3013
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 3015
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 3017
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 3019
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 3022
    sp = STACKTOP; //@line 3023
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 3028
 HEAP8[$14 >> 0] = $12; //@line 3029
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 3512
 }
 ret = dest | 0; //@line 3515
 dest_end = dest + num | 0; //@line 3516
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 3520
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 3521
   dest = dest + 1 | 0; //@line 3522
   src = src + 1 | 0; //@line 3523
   num = num - 1 | 0; //@line 3524
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 3526
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 3527
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 3529
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 3530
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 3531
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 3532
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 3533
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 3534
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 3535
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 3536
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 3537
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 3538
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 3539
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 3540
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 3541
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 3542
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 3543
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 3544
   dest = dest + 64 | 0; //@line 3545
   src = src + 64 | 0; //@line 3546
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 3549
   dest = dest + 4 | 0; //@line 3550
   src = src + 4 | 0; //@line 3551
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 3555
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 3557
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 3558
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 3559
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 3560
   dest = dest + 4 | 0; //@line 3561
   src = src + 4 | 0; //@line 3562
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 3567
  dest = dest + 1 | 0; //@line 3568
  src = src + 1 | 0; //@line 3569
 }
 return ret | 0; //@line 3571
}
function _equeue_alloc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$037$sink$i = 0, $$03741$i = 0, $$1$i9 = 0, $11 = 0, $14 = 0, $17 = 0, $18 = 0, $20 = 0, $21 = 0, $23 = 0, $24 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 590
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 591
 _wait_ms(10); //@line 592
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 23; //@line 595
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 597
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 599
  sp = STACKTOP; //@line 600
  return 0; //@line 601
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 603
 $5 = $1 + 39 & -4; //@line 605
 $6 = $0 + 156 | 0; //@line 606
 _equeue_mutex_lock($6); //@line 607
 $7 = $0 + 24 | 0; //@line 608
 $8 = HEAP32[$7 >> 2] | 0; //@line 609
 L4 : do {
  if (!$8) {
   label = 9; //@line 613
  } else {
   $$03741$i = $7; //@line 615
   $11 = $8; //@line 615
   while (1) {
    if ((HEAP32[$11 >> 2] | 0) >>> 0 >= $5 >>> 0) {
     break;
    }
    $17 = $11 + 8 | 0; //@line 622
    $18 = HEAP32[$17 >> 2] | 0; //@line 623
    if (!$18) {
     label = 9; //@line 626
     break L4;
    } else {
     $$03741$i = $17; //@line 629
     $11 = $18; //@line 629
    }
   }
   $14 = HEAP32[$11 + 12 >> 2] | 0; //@line 633
   if (!$14) {
    $$037$sink$i = $$03741$i; //@line 636
   } else {
    HEAP32[$$03741$i >> 2] = $14; //@line 638
    $$037$sink$i = $14 + 8 | 0; //@line 640
   }
   HEAP32[$$037$sink$i >> 2] = HEAP32[$11 + 8 >> 2]; //@line 644
   _equeue_mutex_unlock($6); //@line 645
   $$1$i9 = $11; //@line 646
  }
 } while (0);
 do {
  if ((label | 0) == 9) {
   $20 = $0 + 28 | 0; //@line 651
   $21 = HEAP32[$20 >> 2] | 0; //@line 652
   if ($21 >>> 0 < $5 >>> 0) {
    _equeue_mutex_unlock($6); //@line 655
    $$0 = 0; //@line 656
    return $$0 | 0; //@line 657
   } else {
    $23 = $0 + 32 | 0; //@line 659
    $24 = HEAP32[$23 >> 2] | 0; //@line 660
    HEAP32[$23 >> 2] = $24 + $5; //@line 662
    HEAP32[$20 >> 2] = $21 - $5; //@line 664
    HEAP32[$24 >> 2] = $5; //@line 665
    HEAP8[$24 + 4 >> 0] = 1; //@line 667
    _equeue_mutex_unlock($6); //@line 668
    if (!$24) {
     $$0 = 0; //@line 671
    } else {
     $$1$i9 = $24; //@line 673
     break;
    }
    return $$0 | 0; //@line 676
   }
  }
 } while (0);
 HEAP32[$$1$i9 + 20 >> 2] = 0; //@line 681
 HEAP32[$$1$i9 + 24 >> 2] = -1; //@line 683
 HEAP32[$$1$i9 + 28 >> 2] = 0; //@line 685
 $$0 = $$1$i9 + 36 | 0; //@line 687
 return $$0 | 0; //@line 688
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 10251
 STACKTOP = STACKTOP + 64 | 0; //@line 10252
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 10252
 $3 = sp; //@line 10253
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 10256
 } else {
  if (!$1) {
   $$2 = 0; //@line 10260
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 10262
   $6 = ___dynamic_cast($1, 64, 48, 0) | 0; //@line 10263
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 98; //@line 10266
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 10268
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 10270
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 10272
    sp = STACKTOP; //@line 10273
    STACKTOP = sp; //@line 10274
    return 0; //@line 10274
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10276
   if (!$6) {
    $$2 = 0; //@line 10279
   } else {
    dest = $3 + 4 | 0; //@line 10282
    stop = dest + 52 | 0; //@line 10282
    do {
     HEAP32[dest >> 2] = 0; //@line 10282
     dest = dest + 4 | 0; //@line 10282
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 10283
    HEAP32[$3 + 8 >> 2] = $0; //@line 10285
    HEAP32[$3 + 12 >> 2] = -1; //@line 10287
    HEAP32[$3 + 48 >> 2] = 1; //@line 10289
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 10292
    $18 = HEAP32[$2 >> 2] | 0; //@line 10293
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10294
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 10295
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 99; //@line 10298
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 10300
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10302
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 10304
     sp = STACKTOP; //@line 10305
     STACKTOP = sp; //@line 10306
     return 0; //@line 10306
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10308
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 10315
     $$0 = 1; //@line 10316
    } else {
     $$0 = 0; //@line 10318
    }
    $$2 = $$0; //@line 10320
   }
  }
 }
 STACKTOP = sp; //@line 10324
 return $$2 | 0; //@line 10324
}
function _equeue_alloc__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$037$sink$i = 0, $$03741$i = 0, $$1$i9 = 0, $12 = 0, $15 = 0, $18 = 0, $19 = 0, $21 = 0, $22 = 0, $24 = 0, $25 = 0, $34 = 0, $4 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12898
 $6 = (HEAP32[$0 + 4 >> 2] | 0) + 39 & -4; //@line 12900
 $7 = $4 + 156 | 0; //@line 12901
 _equeue_mutex_lock($7); //@line 12902
 $8 = $4 + 24 | 0; //@line 12903
 $9 = HEAP32[$8 >> 2] | 0; //@line 12904
 L2 : do {
  if (!$9) {
   label = 8; //@line 12908
  } else {
   $$03741$i = $8; //@line 12910
   $12 = $9; //@line 12910
   while (1) {
    if ((HEAP32[$12 >> 2] | 0) >>> 0 >= $6 >>> 0) {
     break;
    }
    $18 = $12 + 8 | 0; //@line 12917
    $19 = HEAP32[$18 >> 2] | 0; //@line 12918
    if (!$19) {
     label = 8; //@line 12921
     break L2;
    } else {
     $$03741$i = $18; //@line 12924
     $12 = $19; //@line 12924
    }
   }
   $15 = HEAP32[$12 + 12 >> 2] | 0; //@line 12928
   if (!$15) {
    $$037$sink$i = $$03741$i; //@line 12931
   } else {
    HEAP32[$$03741$i >> 2] = $15; //@line 12933
    $$037$sink$i = $15 + 8 | 0; //@line 12935
   }
   HEAP32[$$037$sink$i >> 2] = HEAP32[$12 + 8 >> 2]; //@line 12939
   _equeue_mutex_unlock($7); //@line 12940
   $$1$i9 = $12; //@line 12941
  }
 } while (0);
 do {
  if ((label | 0) == 8) {
   $21 = $4 + 28 | 0; //@line 12946
   $22 = HEAP32[$21 >> 2] | 0; //@line 12947
   if ($22 >>> 0 < $6 >>> 0) {
    _equeue_mutex_unlock($7); //@line 12950
    $$0 = 0; //@line 12951
    $34 = ___async_retval; //@line 12952
    HEAP32[$34 >> 2] = $$0; //@line 12953
    return;
   } else {
    $24 = $4 + 32 | 0; //@line 12956
    $25 = HEAP32[$24 >> 2] | 0; //@line 12957
    HEAP32[$24 >> 2] = $25 + $6; //@line 12959
    HEAP32[$21 >> 2] = $22 - $6; //@line 12961
    HEAP32[$25 >> 2] = $6; //@line 12962
    HEAP8[$25 + 4 >> 0] = 1; //@line 12964
    _equeue_mutex_unlock($7); //@line 12965
    if (!$25) {
     $$0 = 0; //@line 12968
    } else {
     $$1$i9 = $25; //@line 12970
     break;
    }
    $34 = ___async_retval; //@line 12973
    HEAP32[$34 >> 2] = $$0; //@line 12974
    return;
   }
  }
 } while (0);
 HEAP32[$$1$i9 + 20 >> 2] = 0; //@line 12980
 HEAP32[$$1$i9 + 24 >> 2] = -1; //@line 12982
 HEAP32[$$1$i9 + 28 >> 2] = 0; //@line 12984
 $$0 = $$1$i9 + 36 | 0; //@line 12986
 $34 = ___async_retval; //@line 12987
 HEAP32[$34 >> 2] = $$0; //@line 12988
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11583
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 11589
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 11593
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 11594
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 11595
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 11596
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 115; //@line 11599
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 11601
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 11603
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 11605
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 11607
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 11609
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 11611
    sp = STACKTOP; //@line 11612
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11615
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 11619
    $$0 = $0 + 24 | 0; //@line 11620
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 11622
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 11623
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 11628
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 11634
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 11637
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 116; //@line 11642
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 11644
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 11646
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 11648
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 11650
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 11652
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 11654
    sp = STACKTOP; //@line 11655
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
 sp = STACKTOP; //@line 9797
 STACKTOP = STACKTOP + 128 | 0; //@line 9798
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 9798
 $4 = sp + 124 | 0; //@line 9799
 $5 = sp; //@line 9800
 dest = $5; //@line 9801
 src = 684; //@line 9801
 stop = dest + 124 | 0; //@line 9801
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 9801
  dest = dest + 4 | 0; //@line 9801
  src = src + 4 | 0; //@line 9801
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 9807
   $$015 = 1; //@line 9807
   label = 4; //@line 9808
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 9811
   $$0 = -1; //@line 9812
  }
 } else {
  $$014 = $0; //@line 9815
  $$015 = $1; //@line 9815
  label = 4; //@line 9816
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 9820
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 9822
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 9824
  $14 = $5 + 20 | 0; //@line 9825
  HEAP32[$14 >> 2] = $$014; //@line 9826
  HEAP32[$5 + 44 >> 2] = $$014; //@line 9828
  $16 = $$014 + $$$015 | 0; //@line 9829
  $17 = $5 + 16 | 0; //@line 9830
  HEAP32[$17 >> 2] = $16; //@line 9831
  HEAP32[$5 + 28 >> 2] = $16; //@line 9833
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 9834
  $19 = _vfprintf($5, $2, $3) | 0; //@line 9835
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 90; //@line 9838
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 9840
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 9842
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 9844
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 9846
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 9848
   sp = STACKTOP; //@line 9849
   STACKTOP = sp; //@line 9850
   return 0; //@line 9850
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 9852
  if (!$$$015) {
   $$0 = $19; //@line 9855
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 9857
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 9862
   $$0 = $19; //@line 9863
  }
 }
 STACKTOP = sp; //@line 9866
 return $$0 | 0; //@line 9866
}
function _equeue_dealloc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$02329$i = 0, $$02330$i = 0, $$025$i = 0, $$sink$in$i = 0, $$sink21$i = 0, $10 = 0, $11 = 0, $13 = 0, $14 = 0, $15 = 0, $17 = 0, $18 = 0, $2 = 0, $25 = 0, $4 = 0, $9 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 695
 $2 = $1 + -36 | 0; //@line 696
 $4 = HEAP32[$1 + -8 >> 2] | 0; //@line 698
 do {
  if ($4 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 702
   FUNCTION_TABLE_vi[$4 & 127]($1); //@line 703
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 24; //@line 706
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 708
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 710
    HEAP32[$AsyncCtx + 12 >> 2] = $2; //@line 712
    sp = STACKTOP; //@line 713
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 716
    break;
   }
  }
 } while (0);
 $9 = $0 + 156 | 0; //@line 721
 _equeue_mutex_lock($9); //@line 722
 $10 = $0 + 24 | 0; //@line 723
 $11 = HEAP32[$10 >> 2] | 0; //@line 724
 L7 : do {
  if (!$11) {
   $$02329$i = $10; //@line 728
  } else {
   $13 = HEAP32[$2 >> 2] | 0; //@line 730
   $$025$i = $10; //@line 731
   $15 = $11; //@line 731
   while (1) {
    $14 = HEAP32[$15 >> 2] | 0; //@line 733
    if ($14 >>> 0 >= $13 >>> 0) {
     break;
    }
    $17 = $15 + 8 | 0; //@line 738
    $18 = HEAP32[$17 >> 2] | 0; //@line 739
    if (!$18) {
     $$02329$i = $17; //@line 742
     break L7;
    } else {
     $$025$i = $17; //@line 745
     $15 = $18; //@line 745
    }
   }
   if (($14 | 0) == ($13 | 0)) {
    HEAP32[$1 + -24 >> 2] = $15; //@line 751
    $$02330$i = $$025$i; //@line 754
    $$sink$in$i = (HEAP32[$$025$i >> 2] | 0) + 8 | 0; //@line 754
    $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 755
    $25 = $1 + -28 | 0; //@line 756
    HEAP32[$25 >> 2] = $$sink21$i; //@line 757
    HEAP32[$$02330$i >> 2] = $2; //@line 758
    _equeue_mutex_unlock($9); //@line 759
    return;
   } else {
    $$02329$i = $$025$i; //@line 762
   }
  }
 } while (0);
 HEAP32[$1 + -24 >> 2] = 0; //@line 767
 $$02330$i = $$02329$i; //@line 768
 $$sink$in$i = $$02329$i; //@line 768
 $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 769
 $25 = $1 + -28 | 0; //@line 770
 HEAP32[$25 >> 2] = $$sink21$i; //@line 771
 HEAP32[$$02330$i >> 2] = $2; //@line 772
 _equeue_mutex_unlock($9); //@line 773
 return;
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 6560
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 6563
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 6566
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 6569
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 6575
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 6584
     $24 = $13 >>> 2; //@line 6585
     $$090 = 0; //@line 6586
     $$094 = $7; //@line 6586
     while (1) {
      $25 = $$094 >>> 1; //@line 6588
      $26 = $$090 + $25 | 0; //@line 6589
      $27 = $26 << 1; //@line 6590
      $28 = $27 + $23 | 0; //@line 6591
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 6594
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 6598
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 6604
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 6612
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 6616
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 6622
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 6627
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 6630
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 6630
      }
     }
     $46 = $27 + $24 | 0; //@line 6633
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 6636
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 6640
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 6652
     } else {
      $$4 = 0; //@line 6654
     }
    } else {
     $$4 = 0; //@line 6657
    }
   } else {
    $$4 = 0; //@line 6660
   }
  } else {
   $$4 = 0; //@line 6663
  }
 } while (0);
 return $$4 | 0; //@line 6666
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9893
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 9898
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 9903
  } else {
   $20 = $0 & 255; //@line 9905
   $21 = $0 & 255; //@line 9906
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 9912
   } else {
    $26 = $1 + 20 | 0; //@line 9914
    $27 = HEAP32[$26 >> 2] | 0; //@line 9915
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 9921
     HEAP8[$27 >> 0] = $20; //@line 9922
     $34 = $21; //@line 9923
    } else {
     label = 12; //@line 9925
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 9930
     $32 = ___overflow($1, $0) | 0; //@line 9931
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 92; //@line 9934
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 9936
      sp = STACKTOP; //@line 9937
      return 0; //@line 9938
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 9940
      $34 = $32; //@line 9941
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 9946
   $$0 = $34; //@line 9947
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 9952
   $8 = $0 & 255; //@line 9953
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 9959
    $14 = HEAP32[$13 >> 2] | 0; //@line 9960
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 9966
     HEAP8[$14 >> 0] = $7; //@line 9967
     $$0 = $8; //@line 9968
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 9972
   $19 = ___overflow($1, $0) | 0; //@line 9973
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 91; //@line 9976
    sp = STACKTOP; //@line 9977
    return 0; //@line 9978
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9980
    $$0 = $19; //@line 9981
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 9986
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6225
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 6230
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 6235
  } else {
   $20 = $0 & 255; //@line 6237
   $21 = $0 & 255; //@line 6238
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 6244
   } else {
    $26 = $1 + 20 | 0; //@line 6246
    $27 = HEAP32[$26 >> 2] | 0; //@line 6247
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 6253
     HEAP8[$27 >> 0] = $20; //@line 6254
     $34 = $21; //@line 6255
    } else {
     label = 12; //@line 6257
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 6262
     $32 = ___overflow($1, $0) | 0; //@line 6263
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 81; //@line 6266
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 6268
      sp = STACKTOP; //@line 6269
      return 0; //@line 6270
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 6272
      $34 = $32; //@line 6273
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 6278
   $$0 = $34; //@line 6279
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 6284
   $8 = $0 & 255; //@line 6285
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 6291
    $14 = HEAP32[$13 >> 2] | 0; //@line 6292
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 6298
     HEAP8[$14 >> 0] = $7; //@line 6299
     $$0 = $8; //@line 6300
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 6304
   $19 = ___overflow($1, $0) | 0; //@line 6305
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 80; //@line 6308
    sp = STACKTOP; //@line 6309
    return 0; //@line 6310
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6312
    $$0 = $19; //@line 6313
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 6318
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6831
 $1 = $0 + 20 | 0; //@line 6832
 $3 = $0 + 28 | 0; //@line 6834
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 6840
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 6841
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 6842
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 87; //@line 6845
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 6847
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 6849
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 6851
    sp = STACKTOP; //@line 6852
    return 0; //@line 6853
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 6855
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 6859
     break;
    } else {
     label = 5; //@line 6862
     break;
    }
   }
  } else {
   label = 5; //@line 6867
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 6871
  $14 = HEAP32[$13 >> 2] | 0; //@line 6872
  $15 = $0 + 8 | 0; //@line 6873
  $16 = HEAP32[$15 >> 2] | 0; //@line 6874
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 6882
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 6883
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 6884
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 88; //@line 6887
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 6889
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 6891
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 6893
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 6895
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 6897
     sp = STACKTOP; //@line 6898
     return 0; //@line 6899
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6901
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 6907
  HEAP32[$3 >> 2] = 0; //@line 6908
  HEAP32[$1 >> 2] = 0; //@line 6909
  HEAP32[$15 >> 2] = 0; //@line 6910
  HEAP32[$13 >> 2] = 0; //@line 6911
  $$0 = 0; //@line 6912
 }
 return $$0 | 0; //@line 6914
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $$09$i = 0, $1 = 0, $12 = 0, $18 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1967
 STACKTOP = STACKTOP + 144 | 0; //@line 1968
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(144); //@line 1968
 $1 = sp + 16 | 0; //@line 1969
 $2 = sp; //@line 1970
 HEAP32[$2 >> 2] = $varargs; //@line 1971
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1972
 $3 = _vsnprintf($1, 128, $0, $2) | 0; //@line 1973
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 49; //@line 1976
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 1978
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 1980
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 1982
  sp = STACKTOP; //@line 1983
  STACKTOP = sp; //@line 1984
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1986
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 1989
  return;
 }
 if (!(HEAP32[1129] | 0)) {
  _serial_init(4520, 2, 3); //@line 1994
  $$09$i = 0; //@line 1995
 } else {
  $$09$i = 0; //@line 1997
 }
 while (1) {
  $12 = HEAP8[$1 + $$09$i >> 0] | 0; //@line 2002
  $AsyncCtx2 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2003
  _serial_putc(4520, $12); //@line 2004
  if (___async) {
   label = 7; //@line 2007
   break;
  }
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2010
  $18 = $$09$i + 1 | 0; //@line 2011
  if (($18 | 0) == ($3 | 0)) {
   label = 9; //@line 2014
   break;
  } else {
   $$09$i = $18; //@line 2017
  }
 }
 if ((label | 0) == 7) {
  HEAP32[$AsyncCtx2 >> 2] = 50; //@line 2021
  HEAP32[$AsyncCtx2 + 4 >> 2] = $$09$i; //@line 2023
  HEAP32[$AsyncCtx2 + 8 >> 2] = $3; //@line 2025
  HEAP32[$AsyncCtx2 + 12 >> 2] = $1; //@line 2027
  HEAP32[$AsyncCtx2 + 16 >> 2] = $2; //@line 2029
  HEAP32[$AsyncCtx2 + 20 >> 2] = $1; //@line 2031
  sp = STACKTOP; //@line 2032
  STACKTOP = sp; //@line 2033
  return;
 } else if ((label | 0) == 9) {
  STACKTOP = sp; //@line 2036
  return;
 }
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 6451
 $4 = HEAP32[$3 >> 2] | 0; //@line 6452
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 6459
   label = 5; //@line 6460
  } else {
   $$1 = 0; //@line 6462
  }
 } else {
  $12 = $4; //@line 6466
  label = 5; //@line 6467
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 6471
   $10 = HEAP32[$9 >> 2] | 0; //@line 6472
   $14 = $10; //@line 6475
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 6480
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 6488
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 6492
       $$141 = $0; //@line 6492
       $$143 = $1; //@line 6492
       $31 = $14; //@line 6492
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 6495
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 6502
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 6507
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 6510
      break L5;
     }
     $$139 = $$038; //@line 6516
     $$141 = $0 + $$038 | 0; //@line 6516
     $$143 = $1 - $$038 | 0; //@line 6516
     $31 = HEAP32[$9 >> 2] | 0; //@line 6516
    } else {
     $$139 = 0; //@line 6518
     $$141 = $0; //@line 6518
     $$143 = $1; //@line 6518
     $31 = $14; //@line 6518
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 6521
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 6524
   $$1 = $$139 + $$143 | 0; //@line 6526
  }
 } while (0);
 return $$1 | 0; //@line 6529
}
function _equeue_dealloc__async_cb($0) {
 $0 = $0 | 0;
 var $$02329$i = 0, $$02330$i = 0, $$025$i = 0, $$sink$in$i = 0, $$sink21$i = 0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $16 = 0, $2 = 0, $23 = 0, $4 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14082
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14084
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14086
 $7 = $2 + 156 | 0; //@line 14087
 _equeue_mutex_lock($7); //@line 14088
 $8 = $2 + 24 | 0; //@line 14089
 $9 = HEAP32[$8 >> 2] | 0; //@line 14090
 L3 : do {
  if (!$9) {
   $$02329$i = $8; //@line 14094
  } else {
   $11 = HEAP32[$6 >> 2] | 0; //@line 14096
   $$025$i = $8; //@line 14097
   $13 = $9; //@line 14097
   while (1) {
    $12 = HEAP32[$13 >> 2] | 0; //@line 14099
    if ($12 >>> 0 >= $11 >>> 0) {
     break;
    }
    $15 = $13 + 8 | 0; //@line 14104
    $16 = HEAP32[$15 >> 2] | 0; //@line 14105
    if (!$16) {
     $$02329$i = $15; //@line 14108
     break L3;
    } else {
     $$025$i = $15; //@line 14111
     $13 = $16; //@line 14111
    }
   }
   if (($12 | 0) == ($11 | 0)) {
    HEAP32[$4 + -24 >> 2] = $13; //@line 14117
    $$02330$i = $$025$i; //@line 14120
    $$sink$in$i = (HEAP32[$$025$i >> 2] | 0) + 8 | 0; //@line 14120
    $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 14121
    $23 = $4 + -28 | 0; //@line 14122
    HEAP32[$23 >> 2] = $$sink21$i; //@line 14123
    HEAP32[$$02330$i >> 2] = $6; //@line 14124
    _equeue_mutex_unlock($7); //@line 14125
    return;
   } else {
    $$02329$i = $$025$i; //@line 14128
   }
  }
 } while (0);
 HEAP32[$4 + -24 >> 2] = 0; //@line 14133
 $$02330$i = $$02329$i; //@line 14134
 $$sink$in$i = $$02329$i; //@line 14134
 $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 14135
 $23 = $4 + -28 | 0; //@line 14136
 HEAP32[$23 >> 2] = $$sink21$i; //@line 14137
 HEAP32[$$02330$i >> 2] = $6; //@line 14138
 _equeue_mutex_unlock($7); //@line 14139
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_45($0) {
 $0 = $0 | 0;
 var $$phi$trans$insert = 0, $$pre10 = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 14349
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14353
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14355
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14357
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 14359
 $$phi$trans$insert = (HEAP32[$0 + 4 >> 2] | 0) + 12 | 0; //@line 14360
 $$pre10 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 14361
 if (!$$pre10) {
  HEAP32[$4 >> 2] = 0; //@line 14364
  _gpio_irq_set($10 + 28 | 0, 2, 0); //@line 14366
  return;
 }
 $13 = HEAP32[$$pre10 + 4 >> 2] | 0; //@line 14370
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 14371
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 14372
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 20; //@line 14375
  $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 14376
  HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 14377
  $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 14378
  HEAP32[$15 >> 2] = $4; //@line 14379
  $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 14380
  HEAP32[$16 >> 2] = $8; //@line 14381
  $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 14382
  HEAP32[$17 >> 2] = $10; //@line 14383
  sp = STACKTOP; //@line 14384
  return;
 }
 ___async_unwind = 0; //@line 14387
 HEAP32[$ReallocAsyncCtx4 >> 2] = 20; //@line 14388
 $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 14389
 HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 14390
 $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 14391
 HEAP32[$15 >> 2] = $4; //@line 14392
 $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 14393
 HEAP32[$16 >> 2] = $8; //@line 14394
 $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 14395
 HEAP32[$17 >> 2] = $10; //@line 14396
 sp = STACKTOP; //@line 14397
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_37($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13610
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13614
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13616
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13618
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13620
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13622
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 13624
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 13626
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 13629
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 13630
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 13646
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 13647
    if (!___async) {
     ___async_unwind = 0; //@line 13650
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 113; //@line 13652
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 13654
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 13656
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 13658
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 13660
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 13662
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 13664
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 13666
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 13668
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 13671
    sp = STACKTOP; //@line 13672
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
 sp = STACKTOP; //@line 6337
 STACKTOP = STACKTOP + 16 | 0; //@line 6338
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 6338
 $2 = sp; //@line 6339
 $3 = $1 & 255; //@line 6340
 HEAP8[$2 >> 0] = $3; //@line 6341
 $4 = $0 + 16 | 0; //@line 6342
 $5 = HEAP32[$4 >> 2] | 0; //@line 6343
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 6350
   label = 4; //@line 6351
  } else {
   $$0 = -1; //@line 6353
  }
 } else {
  $12 = $5; //@line 6356
  label = 4; //@line 6357
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 6361
   $10 = HEAP32[$9 >> 2] | 0; //@line 6362
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 6365
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 6372
     HEAP8[$10 >> 0] = $3; //@line 6373
     $$0 = $13; //@line 6374
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 6379
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 6380
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 6381
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 82; //@line 6384
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 6386
    sp = STACKTOP; //@line 6387
    STACKTOP = sp; //@line 6388
    return 0; //@line 6388
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 6390
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 6395
   } else {
    $$0 = -1; //@line 6397
   }
  }
 } while (0);
 STACKTOP = sp; //@line 6401
 return $$0 | 0; //@line 6401
}
function _main__async_cb_26($0) {
 $0 = $0 | 0;
 var $2 = 0, $5 = 0, $6 = 0, $7 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 12817
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12819
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12821
 if (!$AsyncRetVal) {
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 12824
  $6 = _equeue_alloc(4528, 32) | 0; //@line 12825
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 63; //@line 12828
   $7 = $ReallocAsyncCtx7 + 4 | 0; //@line 12829
   HEAP32[$7 >> 2] = $2; //@line 12830
   sp = STACKTOP; //@line 12831
   return;
  }
  HEAP32[___async_retval >> 2] = $6; //@line 12835
  ___async_unwind = 0; //@line 12836
  HEAP32[$ReallocAsyncCtx7 >> 2] = 63; //@line 12837
  $7 = $ReallocAsyncCtx7 + 4 | 0; //@line 12838
  HEAP32[$7 >> 2] = $2; //@line 12839
  sp = STACKTOP; //@line 12840
  return;
 } else {
  HEAP32[$AsyncRetVal >> 2] = 2; //@line 12843
  _equeue_event_delay($AsyncRetVal, 1e3); //@line 12844
  _equeue_event_period($AsyncRetVal, 1e3); //@line 12845
  _equeue_event_dtor($AsyncRetVal, 60); //@line 12846
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 12847
  _equeue_post(4528, 61, $AsyncRetVal) | 0; //@line 12848
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 62; //@line 12851
   $5 = $ReallocAsyncCtx4 + 4 | 0; //@line 12852
   HEAP32[$5 >> 2] = $2; //@line 12853
   sp = STACKTOP; //@line 12854
   return;
  }
  ___async_unwind = 0; //@line 12857
  HEAP32[$ReallocAsyncCtx4 >> 2] = 62; //@line 12858
  $5 = $ReallocAsyncCtx4 + 4 | 0; //@line 12859
  HEAP32[$5 >> 2] = $2; //@line 12860
  sp = STACKTOP; //@line 12861
  return;
 }
}
function _fflush__async_cb_55($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2763
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2765
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 2767
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 2771
  } else {
   $$02327 = $$02325; //@line 2773
   $$02426 = $AsyncRetVal; //@line 2773
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 2780
    } else {
     $16 = 0; //@line 2782
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 2794
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 2797
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 2800
     break L3;
    } else {
     $$02327 = $$023; //@line 2803
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 2806
   $13 = ___fflush_unlocked($$02327) | 0; //@line 2807
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 2811
    ___async_unwind = 0; //@line 2812
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 86; //@line 2814
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 2816
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 2818
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 2820
   sp = STACKTOP; //@line 2821
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 2825
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 2827
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 3576
 value = value & 255; //@line 3578
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 3581
   ptr = ptr + 1 | 0; //@line 3582
  }
  aligned_end = end & -4 | 0; //@line 3585
  block_aligned_end = aligned_end - 64 | 0; //@line 3586
  value4 = value | value << 8 | value << 16 | value << 24; //@line 3587
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 3590
   HEAP32[ptr + 4 >> 2] = value4; //@line 3591
   HEAP32[ptr + 8 >> 2] = value4; //@line 3592
   HEAP32[ptr + 12 >> 2] = value4; //@line 3593
   HEAP32[ptr + 16 >> 2] = value4; //@line 3594
   HEAP32[ptr + 20 >> 2] = value4; //@line 3595
   HEAP32[ptr + 24 >> 2] = value4; //@line 3596
   HEAP32[ptr + 28 >> 2] = value4; //@line 3597
   HEAP32[ptr + 32 >> 2] = value4; //@line 3598
   HEAP32[ptr + 36 >> 2] = value4; //@line 3599
   HEAP32[ptr + 40 >> 2] = value4; //@line 3600
   HEAP32[ptr + 44 >> 2] = value4; //@line 3601
   HEAP32[ptr + 48 >> 2] = value4; //@line 3602
   HEAP32[ptr + 52 >> 2] = value4; //@line 3603
   HEAP32[ptr + 56 >> 2] = value4; //@line 3604
   HEAP32[ptr + 60 >> 2] = value4; //@line 3605
   ptr = ptr + 64 | 0; //@line 3606
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 3610
   ptr = ptr + 4 | 0; //@line 3611
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 3616
  ptr = ptr + 1 | 0; //@line 3617
 }
 return end - num | 0; //@line 3619
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13547
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13551
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13553
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13555
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13557
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13559
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 13561
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 13564
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 13565
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 13574
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 13575
    if (!___async) {
     ___async_unwind = 0; //@line 13578
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 114; //@line 13580
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 13582
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 13584
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 13586
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 13588
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 13590
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 13592
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 13594
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 13597
    sp = STACKTOP; //@line 13598
    return;
   }
  }
 }
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 14283
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14285
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14287
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14289
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14291
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 14293
 $$pre = HEAP32[$2 >> 2] | 0; //@line 14294
 if (!$$pre) {
  HEAP32[$4 >> 2] = 0; //@line 14297
  _gpio_irq_set($10 + 28 | 0, 2, 1); //@line 14299
  return;
 }
 $13 = HEAP32[$$pre + 4 >> 2] | 0; //@line 14303
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 14304
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 14305
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 18; //@line 14308
  $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 14309
  HEAP32[$14 >> 2] = $2; //@line 14310
  $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 14311
  HEAP32[$15 >> 2] = $4; //@line 14312
  $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 14313
  HEAP32[$16 >> 2] = $10; //@line 14314
  sp = STACKTOP; //@line 14315
  return;
 }
 ___async_unwind = 0; //@line 14318
 HEAP32[$ReallocAsyncCtx2 >> 2] = 18; //@line 14319
 $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 14320
 HEAP32[$14 >> 2] = $2; //@line 14321
 $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 14322
 HEAP32[$15 >> 2] = $4; //@line 14323
 $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 14324
 HEAP32[$16 >> 2] = $10; //@line 14325
 sp = STACKTOP; //@line 14326
 return;
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2664
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 2674
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 2674
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 2674
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 2678
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 2681
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 2684
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 2692
  } else {
   $20 = 0; //@line 2694
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 2704
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 2708
  HEAP32[___async_retval >> 2] = $$1; //@line 2710
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 2713
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 2714
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 2718
  ___async_unwind = 0; //@line 2719
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 86; //@line 2721
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 2723
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 2725
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 2727
 sp = STACKTOP; //@line 2728
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2834
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2836
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2838
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2840
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 2845
  } else {
   $9 = $4 + 4 | 0; //@line 2847
   $10 = HEAP32[$9 >> 2] | 0; //@line 2848
   $11 = $4 + 8 | 0; //@line 2849
   $12 = HEAP32[$11 >> 2] | 0; //@line 2850
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 2854
    HEAP32[$6 >> 2] = 0; //@line 2855
    HEAP32[$2 >> 2] = 0; //@line 2856
    HEAP32[$11 >> 2] = 0; //@line 2857
    HEAP32[$9 >> 2] = 0; //@line 2858
    $$0 = 0; //@line 2859
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 2866
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 2867
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 2868
   if (!___async) {
    ___async_unwind = 0; //@line 2871
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 88; //@line 2873
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 2875
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 2877
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 2879
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 2881
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 2883
   sp = STACKTOP; //@line 2884
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 2889
 return;
}
function _equeue_create($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$032$i = 0, $$033$i = 0, $2 = 0, $20 = 0, $22 = 0, $26 = 0, $29 = 0, $5 = 0, $6 = 0;
 $2 = _malloc($1) | 0; //@line 445
 if (!$2) {
  $$0 = -1; //@line 448
  return $$0 | 0; //@line 449
 }
 HEAP32[$0 + 12 >> 2] = $2; //@line 452
 $5 = $0 + 20 | 0; //@line 453
 HEAP32[$5 >> 2] = 0; //@line 454
 $6 = $0 + 16 | 0; //@line 455
 HEAP32[$6 >> 2] = 0; //@line 456
 if ($1 | 0) {
  $$033$i = $1; //@line 459
  $22 = 0; //@line 459
  do {
   $22 = $22 + 1 | 0; //@line 461
   $$033$i = $$033$i >>> 1; //@line 462
  } while (($$033$i | 0) != 0);
  HEAP32[$6 >> 2] = $22; //@line 470
 }
 HEAP32[$0 + 24 >> 2] = 0; //@line 473
 HEAP32[$0 + 28 >> 2] = $1; //@line 475
 HEAP32[$0 + 32 >> 2] = $2; //@line 477
 HEAP32[$0 >> 2] = 0; //@line 478
 HEAP32[$0 + 4 >> 2] = _equeue_tick() | 0; //@line 481
 HEAP8[$0 + 9 >> 0] = 0; //@line 483
 HEAP8[$0 + 8 >> 0] = 0; //@line 485
 HEAP8[$0 + 36 >> 0] = 0; //@line 487
 HEAP32[$0 + 40 >> 2] = 0; //@line 489
 HEAP32[$0 + 44 >> 2] = 0; //@line 491
 $20 = _equeue_sema_create($0 + 48 | 0) | 0; //@line 493
 if (($20 | 0) < 0) {
  $$032$i = $20; //@line 496
 } else {
  $26 = _equeue_mutex_create($0 + 128 | 0) | 0; //@line 499
  if (($26 | 0) < 0) {
   $$032$i = $26; //@line 502
  } else {
   $29 = _equeue_mutex_create($0 + 156 | 0) | 0; //@line 505
   $$032$i = ($29 | 0) < 0 ? $29 : 0; //@line 508
  }
 }
 HEAP32[$5 >> 2] = $2; //@line 511
 $$0 = $$032$i; //@line 512
 return $$0 | 0; //@line 513
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_35($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 13392
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13394
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13396
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13398
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13400
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 13405
  return;
 }
 dest = $2 + 4 | 0; //@line 13409
 stop = dest + 52 | 0; //@line 13409
 do {
  HEAP32[dest >> 2] = 0; //@line 13409
  dest = dest + 4 | 0; //@line 13409
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 13410
 HEAP32[$2 + 8 >> 2] = $4; //@line 13412
 HEAP32[$2 + 12 >> 2] = -1; //@line 13414
 HEAP32[$2 + 48 >> 2] = 1; //@line 13416
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 13419
 $16 = HEAP32[$6 >> 2] | 0; //@line 13420
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 13421
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 13422
 if (!___async) {
  ___async_unwind = 0; //@line 13425
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 99; //@line 13427
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 13429
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 13431
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 13433
 sp = STACKTOP; //@line 13434
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 9603
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 9608
    $$0 = 1; //@line 9609
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 9622
     $$0 = 1; //@line 9623
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 9627
     $$0 = -1; //@line 9628
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 9638
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 9642
    $$0 = 2; //@line 9643
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 9655
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 9661
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 9665
    $$0 = 3; //@line 9666
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 9676
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 9682
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 9688
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 9692
    $$0 = 4; //@line 9693
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 9697
    $$0 = -1; //@line 9698
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 9703
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_38($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13683
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13687
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13689
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13691
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13693
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13695
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 13698
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 13699
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 13705
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 13706
   if (!___async) {
    ___async_unwind = 0; //@line 13709
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 112; //@line 13711
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 13713
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 13715
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 13717
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 13719
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 13721
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 13723
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 13726
   sp = STACKTOP; //@line 13727
   return;
  }
 }
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $11 = 0, $12 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 12540
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12545
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12547
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  $8 = (HEAP32[$4 >> 2] | 0) + -1 | 0; //@line 12550
  HEAP32[$4 >> 2] = $8; //@line 12551
  if (!$8) {
   $11 = HEAP32[$4 + 24 >> 2] | 0; //@line 12555
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 12556
   FUNCTION_TABLE_vi[$11 & 127]($6); //@line 12557
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 67; //@line 12560
    $12 = $ReallocAsyncCtx2 + 4 | 0; //@line 12561
    HEAP32[$12 >> 2] = $4; //@line 12562
    sp = STACKTOP; //@line 12563
    return;
   }
   ___async_unwind = 0; //@line 12566
   HEAP32[$ReallocAsyncCtx2 >> 2] = 67; //@line 12567
   $12 = $ReallocAsyncCtx2 + 4 | 0; //@line 12568
   HEAP32[$12 >> 2] = $4; //@line 12569
   sp = STACKTOP; //@line 12570
   return;
  }
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 12574
 __ZN6events10EventQueue8dispatchEi(4528, -1); //@line 12575
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 69; //@line 12578
  sp = STACKTOP; //@line 12579
  return;
 }
 ___async_unwind = 0; //@line 12582
 HEAP32[$ReallocAsyncCtx3 >> 2] = 69; //@line 12583
 sp = STACKTOP; //@line 12584
 return;
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 8487
  $8 = $0; //@line 8487
  $9 = $1; //@line 8487
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 8489
   $$0914 = $$0914 + -1 | 0; //@line 8493
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 8494
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 8495
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 8503
   }
  }
  $$010$lcssa$off0 = $8; //@line 8508
  $$09$lcssa = $$0914; //@line 8508
 } else {
  $$010$lcssa$off0 = $0; //@line 8510
  $$09$lcssa = $2; //@line 8510
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 8514
 } else {
  $$012 = $$010$lcssa$off0; //@line 8516
  $$111 = $$09$lcssa; //@line 8516
  while (1) {
   $26 = $$111 + -1 | 0; //@line 8521
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 8522
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 8526
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 8529
    $$111 = $26; //@line 8529
   }
  }
 }
 return $$1$lcssa | 0; //@line 8533
}
function __ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2510
 $1 = $0 + 4 | 0; //@line 2511
 $2 = HEAP32[$1 >> 2] | 0; //@line 2512
 $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2513
 $3 = _equeue_alloc($2, 4) | 0; //@line 2514
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 71; //@line 2517
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2519
  HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 2521
  sp = STACKTOP; //@line 2522
  return 0; //@line 2523
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2525
 if (!$3) {
  $$0 = 0; //@line 2528
  return $$0 | 0; //@line 2529
 }
 HEAP32[$3 >> 2] = HEAP32[$0 + 28 >> 2]; //@line 2533
 _equeue_event_delay($3, HEAP32[$0 + 12 >> 2] | 0); //@line 2536
 _equeue_event_period($3, HEAP32[$0 + 16 >> 2] | 0); //@line 2539
 _equeue_event_dtor($3, 72); //@line 2540
 $13 = HEAP32[$1 >> 2] | 0; //@line 2541
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2542
 $14 = _equeue_post($13, 73, $3) | 0; //@line 2543
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 74; //@line 2546
  sp = STACKTOP; //@line 2547
  return 0; //@line 2548
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2550
 $$0 = $14; //@line 2551
 return $$0 | 0; //@line 2552
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13018
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13020
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13024
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13026
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13028
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13030
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 13034
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 13037
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 13038
   if (!___async) {
    ___async_unwind = 0; //@line 13041
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 116; //@line 13043
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 13045
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 13047
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 13049
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 13051
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 13053
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 13055
   sp = STACKTOP; //@line 13056
   return;
  }
 }
 return;
}
function _equeue_create_inplace($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$032 = 0, $$033 = 0, $19 = 0, $21 = 0, $25 = 0, $28 = 0, $5 = 0;
 HEAP32[$0 + 12 >> 2] = $2; //@line 523
 HEAP32[$0 + 20 >> 2] = 0; //@line 525
 $5 = $0 + 16 | 0; //@line 526
 HEAP32[$5 >> 2] = 0; //@line 527
 if ($1 | 0) {
  $$033 = $1; //@line 530
  $21 = 0; //@line 530
  do {
   $21 = $21 + 1 | 0; //@line 532
   $$033 = $$033 >>> 1; //@line 533
  } while (($$033 | 0) != 0);
  HEAP32[$5 >> 2] = $21; //@line 541
 }
 HEAP32[$0 + 24 >> 2] = 0; //@line 544
 HEAP32[$0 + 28 >> 2] = $1; //@line 546
 HEAP32[$0 + 32 >> 2] = $2; //@line 548
 HEAP32[$0 >> 2] = 0; //@line 549
 HEAP32[$0 + 4 >> 2] = _equeue_tick() | 0; //@line 552
 HEAP8[$0 + 9 >> 0] = 0; //@line 554
 HEAP8[$0 + 8 >> 0] = 0; //@line 556
 HEAP8[$0 + 36 >> 0] = 0; //@line 558
 HEAP32[$0 + 40 >> 2] = 0; //@line 560
 HEAP32[$0 + 44 >> 2] = 0; //@line 562
 $19 = _equeue_sema_create($0 + 48 | 0) | 0; //@line 564
 if (($19 | 0) < 0) {
  $$032 = $19; //@line 567
  return $$032 | 0; //@line 568
 }
 $25 = _equeue_mutex_create($0 + 128 | 0) | 0; //@line 571
 if (($25 | 0) < 0) {
  $$032 = $25; //@line 574
  return $$032 | 0; //@line 575
 }
 $28 = _equeue_mutex_create($0 + 156 | 0) | 0; //@line 578
 $$032 = ($28 | 0) < 0 ? $28 : 0; //@line 581
 return $$032 | 0; //@line 582
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 6103
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 6108
   label = 4; //@line 6109
  } else {
   $$01519 = $0; //@line 6111
   $23 = $1; //@line 6111
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 6116
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 6119
    $23 = $6; //@line 6120
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 6124
     label = 4; //@line 6125
     break;
    } else {
     $$01519 = $6; //@line 6128
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 6134
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 6136
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 6144
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 6152
  } else {
   $$pn = $$0; //@line 6154
   while (1) {
    $19 = $$pn + 1 | 0; //@line 6156
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 6160
     break;
    } else {
     $$pn = $19; //@line 6163
    }
   }
  }
  $$sink = $$1$lcssa; //@line 6168
 }
 return $$sink - $1 | 0; //@line 6171
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 10498
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 10505
   $10 = $1 + 16 | 0; //@line 10506
   $11 = HEAP32[$10 >> 2] | 0; //@line 10507
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 10510
    HEAP32[$1 + 24 >> 2] = $4; //@line 10512
    HEAP32[$1 + 36 >> 2] = 1; //@line 10514
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 10524
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 10529
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 10532
    HEAP8[$1 + 54 >> 0] = 1; //@line 10534
    break;
   }
   $21 = $1 + 24 | 0; //@line 10537
   $22 = HEAP32[$21 >> 2] | 0; //@line 10538
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 10541
    $28 = $4; //@line 10542
   } else {
    $28 = $22; //@line 10544
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 10553
   }
  }
 } while (0);
 return;
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $12 = 0, $2 = 0, $4 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 177
 $2 = $0; //@line 178
 L1 : do {
  switch ($1 | 0) {
  case 1:
   {
    $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 183
    if ($4 | 0) {
     $7 = HEAP32[$4 >> 2] | 0; //@line 187
     $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 188
     FUNCTION_TABLE_vi[$7 & 127]($2 + 40 | 0); //@line 189
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 15; //@line 192
      sp = STACKTOP; //@line 193
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 196
      break L1;
     }
    }
    break;
   }
  case 2:
   {
    $9 = HEAP32[$2 + 68 >> 2] | 0; //@line 204
    if ($9 | 0) {
     $12 = HEAP32[$9 >> 2] | 0; //@line 208
     $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 209
     FUNCTION_TABLE_vi[$12 & 127]($2 + 56 | 0); //@line 210
     if (___async) {
      HEAP32[$AsyncCtx2 >> 2] = 16; //@line 213
      sp = STACKTOP; //@line 214
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx2 | 0); //@line 217
      break L1;
     }
    }
    break;
   }
  default:
   {}
  }
 } while (0);
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_46($0) {
 $0 = $0 | 0;
 var $$pre$i$i4 = 0, $12 = 0, $13 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 14403
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14409
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14411
 $$pre$i$i4 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 14412
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = $$pre$i$i4; //@line 14413
 if (!$$pre$i$i4) {
  _gpio_irq_set($8 + 28 | 0, 2, 0); //@line 14417
  return;
 }
 $12 = HEAP32[$$pre$i$i4 + 8 >> 2] | 0; //@line 14422
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(12) | 0; //@line 14423
 FUNCTION_TABLE_vi[$12 & 127]($6); //@line 14424
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 21; //@line 14427
  $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 14428
  HEAP32[$13 >> 2] = $6; //@line 14429
  $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 14430
  HEAP32[$14 >> 2] = $8; //@line 14431
  sp = STACKTOP; //@line 14432
  return;
 }
 ___async_unwind = 0; //@line 14435
 HEAP32[$ReallocAsyncCtx5 >> 2] = 21; //@line 14436
 $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 14437
 HEAP32[$13 >> 2] = $6; //@line 14438
 $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 14439
 HEAP32[$14 >> 2] = $8; //@line 14440
 sp = STACKTOP; //@line 14441
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9992
 $1 = HEAP32[77] | 0; //@line 9993
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 9999
 } else {
  $19 = 0; //@line 10001
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 10007
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 10013
    $12 = HEAP32[$11 >> 2] | 0; //@line 10014
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 10020
     HEAP8[$12 >> 0] = 10; //@line 10021
     $22 = 0; //@line 10022
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 10026
   $17 = ___overflow($1, 10) | 0; //@line 10027
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 93; //@line 10030
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 10032
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 10034
    sp = STACKTOP; //@line 10035
    return 0; //@line 10036
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10038
    $22 = $17 >> 31; //@line 10040
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 10047
 }
 return $22 | 0; //@line 10049
}
function __ZN4mbed11InterruptInD0Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 99
 HEAP32[$0 >> 2] = 160; //@line 100
 _gpio_irq_free($0 + 28 | 0); //@line 102
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 104
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 110
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 111
   FUNCTION_TABLE_vi[$7 & 127]($0 + 56 | 0); //@line 112
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 13; //@line 115
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 117
    sp = STACKTOP; //@line 118
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 121
    break;
   }
  }
 } while (0);
 $10 = HEAP32[$0 + 52 >> 2] | 0; //@line 127
 if (!$10) {
  __ZdlPv($0); //@line 130
  return;
 }
 $14 = HEAP32[$10 + 8 >> 2] | 0; //@line 135
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 136
 FUNCTION_TABLE_vi[$14 & 127]($0 + 40 | 0); //@line 137
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 14; //@line 140
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 142
  sp = STACKTOP; //@line 143
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 146
 __ZdlPv($0); //@line 147
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_28($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13066
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13072
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13074
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13076
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13078
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 13083
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 13085
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 13086
 if (!___async) {
  ___async_unwind = 0; //@line 13089
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 116; //@line 13091
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 13093
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 13095
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 13097
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 13099
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 13101
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 13103
 sp = STACKTOP; //@line 13104
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12480
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12482
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12484
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12488
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 12492
  label = 4; //@line 12493
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 12498
   label = 4; //@line 12499
  } else {
   $$037$off039 = 3; //@line 12501
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 12505
  $17 = $8 + 40 | 0; //@line 12506
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 12509
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 12519
    $$037$off039 = $$037$off038; //@line 12520
   } else {
    $$037$off039 = $$037$off038; //@line 12522
   }
  } else {
   $$037$off039 = $$037$off038; //@line 12525
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 12528
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10357
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 10366
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 10371
      HEAP32[$13 >> 2] = $2; //@line 10372
      $19 = $1 + 40 | 0; //@line 10373
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 10376
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 10386
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 10390
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 10397
    }
   }
  }
 } while (0);
 return;
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2593
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2595
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2597
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2599
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 2601
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 2603
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 4069; //@line 2608
  HEAP32[$4 + 4 >> 2] = $6; //@line 2610
  _abort_message(3978, $4); //@line 2611
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 2614
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 2617
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 2618
 $16 = FUNCTION_TABLE_ii[$15 & 3]($12) | 0; //@line 2619
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 2623
  ___async_unwind = 0; //@line 2624
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 2626
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 2628
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 2630
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 2632
 sp = STACKTOP; //@line 2633
 return;
}
function __ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb_43($0) {
 $0 = $0 | 0;
 var $13 = 0, $14 = 0, $2 = 0, $4 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14240
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14242
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14244
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 14246
 if (!$AsyncRetVal) {
  HEAP32[___async_retval >> 2] = 0; //@line 14250
  return;
 }
 HEAP32[$AsyncRetVal >> 2] = HEAP32[$2 + 28 >> 2]; //@line 14255
 _equeue_event_delay($AsyncRetVal, HEAP32[$2 + 12 >> 2] | 0); //@line 14258
 _equeue_event_period($AsyncRetVal, HEAP32[$2 + 16 >> 2] | 0); //@line 14261
 _equeue_event_dtor($AsyncRetVal, 72); //@line 14262
 $13 = HEAP32[$4 >> 2] | 0; //@line 14263
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 14264
 $14 = _equeue_post($13, 73, $AsyncRetVal) | 0; //@line 14265
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 74; //@line 14268
  sp = STACKTOP; //@line 14269
  return;
 }
 HEAP32[___async_retval >> 2] = $14; //@line 14273
 ___async_unwind = 0; //@line 14274
 HEAP32[$ReallocAsyncCtx >> 2] = 74; //@line 14275
 sp = STACKTOP; //@line 14276
 return;
}
function ___strerror_l($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $7 = 0, label = 0, $$113$looptemp = 0;
 $$016 = 0; //@line 9723
 while (1) {
  if ((HEAPU8[2041 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 9730
   break;
  }
  $7 = $$016 + 1 | 0; //@line 9733
  if (($7 | 0) == 87) {
   $$01214 = 2129; //@line 9736
   $$115 = 87; //@line 9736
   label = 5; //@line 9737
   break;
  } else {
   $$016 = $7; //@line 9740
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 2129; //@line 9746
  } else {
   $$01214 = 2129; //@line 9748
   $$115 = $$016; //@line 9748
   label = 5; //@line 9749
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 9754
   $$113 = $$01214; //@line 9755
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 9759
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 9766
   if (!$$115) {
    $$012$lcssa = $$113; //@line 9769
    break;
   } else {
    $$01214 = $$113; //@line 9772
    label = 5; //@line 9773
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 9780
}
function __ZN4mbed11InterruptInD2Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 48
 HEAP32[$0 >> 2] = 160; //@line 49
 _gpio_irq_free($0 + 28 | 0); //@line 51
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 53
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 59
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 60
   FUNCTION_TABLE_vi[$7 & 127]($0 + 56 | 0); //@line 61
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 11; //@line 64
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 66
    sp = STACKTOP; //@line 67
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 70
    break;
   }
  }
 } while (0);
 $10 = HEAP32[$0 + 52 >> 2] | 0; //@line 76
 if (!$10) {
  return;
 }
 $14 = HEAP32[$10 + 8 >> 2] | 0; //@line 83
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 84
 FUNCTION_TABLE_vi[$14 & 127]($0 + 40 | 0); //@line 85
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 12; //@line 88
  sp = STACKTOP; //@line 89
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 92
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $4 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2619
 $1 = HEAP32[$0 >> 2] | 0; //@line 2620
 if (!$1) {
  return;
 }
 $4 = (HEAP32[$1 >> 2] | 0) + -1 | 0; //@line 2626
 HEAP32[$1 >> 2] = $4; //@line 2627
 if ($4 | 0) {
  return;
 }
 $7 = HEAP32[$1 + 24 >> 2] | 0; //@line 2633
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2634
 FUNCTION_TABLE_vi[$7 & 127]($1); //@line 2635
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 77; //@line 2638
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2640
  sp = STACKTOP; //@line 2641
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2644
 $9 = HEAP32[$0 >> 2] | 0; //@line 2645
 $11 = HEAP32[$9 + 4 >> 2] | 0; //@line 2647
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2648
 _equeue_dealloc($11, $9); //@line 2649
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 78; //@line 2652
  sp = STACKTOP; //@line 2653
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2656
 return;
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2185
 $2 = $0 + 12 | 0; //@line 2187
 $3 = HEAP32[$2 >> 2] | 0; //@line 2188
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2192
   _mbed_assert_internal(1231, 1236, 528); //@line 2193
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 54; //@line 2196
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 2198
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 2200
    sp = STACKTOP; //@line 2201
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2204
    $8 = HEAP32[$2 >> 2] | 0; //@line 2206
    break;
   }
  } else {
   $8 = $3; //@line 2210
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 2213
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2215
 FUNCTION_TABLE_vi[$7 & 127]($0); //@line 2216
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 55; //@line 2219
  sp = STACKTOP; //@line 2220
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2223
  return;
 }
}
function _abort_message($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 10190
 STACKTOP = STACKTOP + 16 | 0; //@line 10191
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10191
 $1 = sp; //@line 10192
 HEAP32[$1 >> 2] = $varargs; //@line 10193
 $2 = HEAP32[45] | 0; //@line 10194
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 10195
 _vfprintf($2, $0, $1) | 0; //@line 10196
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 96; //@line 10199
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 10201
  sp = STACKTOP; //@line 10202
  STACKTOP = sp; //@line 10203
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 10205
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 10206
 _fputc(10, $2) | 0; //@line 10207
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 97; //@line 10210
  sp = STACKTOP; //@line 10211
  STACKTOP = sp; //@line 10212
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 10214
  _abort(); //@line 10215
 }
}
function _mbed_error_printf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13441
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13443
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13445
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13447
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13449
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[1129] | 0)) {
  _serial_init(4520, 2, 3); //@line 13457
 }
 $12 = HEAP8[$6 >> 0] | 0; //@line 13460
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 13461
 _serial_putc(4520, $12); //@line 13462
 if (!___async) {
  ___async_unwind = 0; //@line 13465
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 50; //@line 13467
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = 0; //@line 13469
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $AsyncRetVal; //@line 13471
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 13473
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $4; //@line 13475
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $6; //@line 13477
 sp = STACKTOP; //@line 13478
 return;
}
function _equeue_sema_wait($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $20 = 0, $3 = 0, $4 = 0, sp = 0;
 sp = STACKTOP; //@line 1593
 STACKTOP = STACKTOP + 16 | 0; //@line 1594
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1594
 $2 = sp + 8 | 0; //@line 1595
 $3 = sp; //@line 1596
 _pthread_mutex_lock($0 | 0) | 0; //@line 1597
 $4 = $0 + 76 | 0; //@line 1598
 do {
  if (!(HEAP8[$4 >> 0] | 0)) {
   if (($1 | 0) < 0) {
    _pthread_cond_wait($0 + 28 | 0, $0 | 0) | 0; //@line 1606
    break;
   } else {
    _gettimeofday($2 | 0, 0) | 0; //@line 1609
    HEAP32[$3 >> 2] = (HEAP32[$2 >> 2] | 0) + (($1 >>> 0) / 1e3 | 0); //@line 1613
    HEAP32[$3 + 4 >> 2] = ((HEAP32[$2 + 4 >> 2] | 0) * 1e3 | 0) + ($1 * 1e6 | 0); //@line 1620
    _pthread_cond_timedwait($0 + 28 | 0, $0 | 0, $3 | 0) | 0; //@line 1622
    break;
   }
  }
 } while (0);
 $20 = (HEAP8[$4 >> 0] | 0) != 0; //@line 1628
 HEAP8[$4 >> 0] = 0; //@line 1629
 _pthread_mutex_unlock($0 | 0) | 0; //@line 1630
 STACKTOP = sp; //@line 1631
 return $20 | 0; //@line 1631
}
function _mbed_error_printf__async_cb_36($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13485
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13489
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13491
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13493
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13495
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 13496
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $14 = HEAP8[$10 + $12 >> 0] | 0; //@line 13503
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 13504
 _serial_putc(4520, $14); //@line 13505
 if (!___async) {
  ___async_unwind = 0; //@line 13508
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 50; //@line 13510
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $12; //@line 13512
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 13514
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 13516
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 13518
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 13520
 sp = STACKTOP; //@line 13521
 return;
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11793
 STACKTOP = STACKTOP + 16 | 0; //@line 11794
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11794
 $3 = sp; //@line 11795
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 11797
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 11800
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 11801
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 11802
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 120; //@line 11805
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 11807
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 11809
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 11811
  sp = STACKTOP; //@line 11812
  STACKTOP = sp; //@line 11813
  return 0; //@line 11813
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 11815
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 11819
 }
 STACKTOP = sp; //@line 11821
 return $8 & 1 | 0; //@line 11821
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 9554
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 9554
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 9555
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 9556
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 9565
    $$016 = $9; //@line 9568
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 9568
   } else {
    $$016 = $0; //@line 9570
    $storemerge = 0; //@line 9570
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 9572
   $$0 = $$016; //@line 9573
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 9577
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 9583
   HEAP32[tempDoublePtr >> 2] = $2; //@line 9586
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 9586
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 9587
  }
 }
 return +$$0;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11940
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11948
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11950
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 11952
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 11954
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 11956
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 11958
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 11960
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 11971
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 11972
 HEAP32[$10 >> 2] = 0; //@line 11973
 HEAP32[$12 >> 2] = 0; //@line 11974
 HEAP32[$14 >> 2] = 0; //@line 11975
 HEAP32[$2 >> 2] = 0; //@line 11976
 $33 = HEAP32[$16 >> 2] | 0; //@line 11977
 HEAP32[$16 >> 2] = $33 | $18; //@line 11982
 if ($20 | 0) {
  ___unlockfile($22); //@line 11985
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 11988
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2563
 $1 = HEAP32[$0 >> 2] | 0; //@line 2564
 if ($1 | 0) {
  $4 = HEAP32[$1 + 20 >> 2] | 0; //@line 2568
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2569
  $5 = FUNCTION_TABLE_ii[$4 & 3]($1) | 0; //@line 2570
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 75; //@line 2573
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2575
   sp = STACKTOP; //@line 2576
   return;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2579
  HEAP32[(HEAP32[$0 >> 2] | 0) + 8 >> 2] = $5; //@line 2582
  if ($5 | 0) {
   return;
  }
 }
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2588
 _mbed_assert_internal(1425, 1428, 149); //@line 2589
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 76; //@line 2592
  sp = STACKTOP; //@line 2593
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2596
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
 sp = STACKTOP; //@line 10713
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10719
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 10722
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10725
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10726
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 10727
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 102; //@line 10730
    sp = STACKTOP; //@line 10731
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10734
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
 sp = STACKTOP; //@line 11712
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 11714
 $8 = $7 >> 8; //@line 11715
 if (!($7 & 1)) {
  $$0 = $8; //@line 11719
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 11724
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 11726
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 11729
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11734
 FUNCTION_TABLE_viiiiii[$17 & 3]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 11735
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 118; //@line 11738
  sp = STACKTOP; //@line 11739
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11742
  return;
 }
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10882
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 10888
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 10891
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 10894
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10895
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 10896
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 105; //@line 10899
    sp = STACKTOP; //@line 10900
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10903
    break;
   }
  }
 } while (0);
 return;
}
function ___dynamic_cast__async_cb_33($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13270
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13272
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13274
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 13280
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 13295
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 13311
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 13316
    break;
   }
  default:
   {
    $$0 = 0; //@line 13320
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 13325
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $13 = 0, $16 = 0, $6 = 0, $7 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11754
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 11756
 $7 = $6 >> 8; //@line 11757
 if (!($6 & 1)) {
  $$0 = $7; //@line 11761
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 11766
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 11768
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 11771
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11776
 FUNCTION_TABLE_viiiii[$16 & 3]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 11777
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 119; //@line 11780
  sp = STACKTOP; //@line 11781
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11784
  return;
 }
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11669
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 11671
 $6 = $5 >> 8; //@line 11672
 if (!($5 & 1)) {
  $$0 = $6; //@line 11676
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 11681
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 11683
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 11686
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11691
 FUNCTION_TABLE_viiii[$15 & 3]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 11692
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 117; //@line 11695
  sp = STACKTOP; //@line 11696
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11699
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
 sp = STACKTOP; //@line 8552
 STACKTOP = STACKTOP + 256 | 0; //@line 8553
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 8553
 $5 = sp; //@line 8554
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 8560
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 8564
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 8567
   $$011 = $9; //@line 8568
   do {
    _out_670($0, $5, 256); //@line 8570
    $$011 = $$011 + -256 | 0; //@line 8571
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 8580
  } else {
   $$0$lcssa = $9; //@line 8582
  }
  _out_670($0, $5, $$0$lcssa); //@line 8584
 }
 STACKTOP = sp; //@line 8586
 return;
}
function __ZN4mbed11InterruptInD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12033
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12035
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 12037
 if (!$4) {
  __ZdlPv($2); //@line 12040
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 12045
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 12046
 FUNCTION_TABLE_vi[$8 & 127]($2 + 40 | 0); //@line 12047
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 14; //@line 12050
  $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 12051
  HEAP32[$9 >> 2] = $2; //@line 12052
  sp = STACKTOP; //@line 12053
  return;
 }
 ___async_unwind = 0; //@line 12056
 HEAP32[$ReallocAsyncCtx2 >> 2] = 14; //@line 12057
 $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 12058
 HEAP32[$9 >> 2] = $2; //@line 12059
 sp = STACKTOP; //@line 12060
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5961
 STACKTOP = STACKTOP + 32 | 0; //@line 5962
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 5962
 $vararg_buffer = sp; //@line 5963
 $3 = sp + 20 | 0; //@line 5964
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 5968
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 5970
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 5972
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 5974
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 5976
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 5981
  $10 = -1; //@line 5982
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 5985
 }
 STACKTOP = sp; //@line 5987
 return $10 | 0; //@line 5987
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 1638
 STACKTOP = STACKTOP + 16 | 0; //@line 1639
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1639
 $vararg_buffer = sp; //@line 1640
 HEAP32[$vararg_buffer >> 2] = $0; //@line 1641
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 1643
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 1645
 _mbed_error_printf(993, $vararg_buffer); //@line 1646
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1647
 _mbed_die(); //@line 1648
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 32; //@line 1651
  sp = STACKTOP; //@line 1652
  STACKTOP = sp; //@line 1653
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1655
  STACKTOP = sp; //@line 1656
  return;
 }
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 10435
 $5 = HEAP32[$4 >> 2] | 0; //@line 10436
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 10440
   HEAP32[$1 + 24 >> 2] = $3; //@line 10442
   HEAP32[$1 + 36 >> 2] = 1; //@line 10444
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 10448
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 10451
    HEAP32[$1 + 24 >> 2] = 2; //@line 10453
    HEAP8[$1 + 54 >> 0] = 1; //@line 10455
    break;
   }
   $10 = $1 + 24 | 0; //@line 10458
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 10462
   }
  }
 } while (0);
 return;
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 10985
 STACKTOP = STACKTOP + 16 | 0; //@line 10986
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10986
 $vararg_buffer = sp; //@line 10987
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 10988
 FUNCTION_TABLE_v[$0 & 7](); //@line 10989
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 107; //@line 10992
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 10994
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 10996
  sp = STACKTOP; //@line 10997
  STACKTOP = sp; //@line 10998
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11000
  _abort_message(4360, $vararg_buffer); //@line 11001
 }
}
function _equeue_post($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $4 = 0, $6 = 0, $9 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 781
 $4 = _equeue_tick() | 0; //@line 783
 HEAP32[$2 + -4 >> 2] = $1; //@line 785
 $6 = $2 + -16 | 0; //@line 786
 HEAP32[$6 >> 2] = (HEAP32[$6 >> 2] | 0) + $4; //@line 789
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 790
 $9 = _equeue_enqueue($0, $2 + -36 | 0, $4) | 0; //@line 791
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 25; //@line 794
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 796
  sp = STACKTOP; //@line 797
  return 0; //@line 798
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 800
  _equeue_sema_signal($0 + 48 | 0); //@line 802
  return $9 | 0; //@line 803
 }
 return 0; //@line 805
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 6068
 $3 = HEAP8[$1 >> 0] | 0; //@line 6069
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 6074
  $$lcssa8 = $2; //@line 6074
 } else {
  $$011 = $1; //@line 6076
  $$0710 = $0; //@line 6076
  do {
   $$0710 = $$0710 + 1 | 0; //@line 6078
   $$011 = $$011 + 1 | 0; //@line 6079
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 6080
   $9 = HEAP8[$$011 >> 0] | 0; //@line 6081
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 6086
  $$lcssa8 = $8; //@line 6086
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 6096
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2157
 $2 = HEAP32[77] | 0; //@line 2158
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2159
 _putc($1, $2) | 0; //@line 2160
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 52; //@line 2163
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 2165
  sp = STACKTOP; //@line 2166
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2169
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2170
 _fflush($2) | 0; //@line 2171
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 53; //@line 2174
  sp = STACKTOP; //@line 2175
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2178
  return;
 }
}
function _mbed_die__async_cb_18($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 12450
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12452
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12454
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 12455
 _wait_ms(150); //@line 12456
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 34; //@line 12459
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 12460
  HEAP32[$4 >> 2] = $2; //@line 12461
  sp = STACKTOP; //@line 12462
  return;
 }
 ___async_unwind = 0; //@line 12465
 HEAP32[$ReallocAsyncCtx15 >> 2] = 34; //@line 12466
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 12467
 HEAP32[$4 >> 2] = $2; //@line 12468
 sp = STACKTOP; //@line 12469
 return;
}
function _mbed_die__async_cb_17($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 12425
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12427
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12429
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 12430
 _wait_ms(150); //@line 12431
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 35; //@line 12434
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 12435
  HEAP32[$4 >> 2] = $2; //@line 12436
  sp = STACKTOP; //@line 12437
  return;
 }
 ___async_unwind = 0; //@line 12440
 HEAP32[$ReallocAsyncCtx14 >> 2] = 35; //@line 12441
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 12442
 HEAP32[$4 >> 2] = $2; //@line 12443
 sp = STACKTOP; //@line 12444
 return;
}
function _mbed_die__async_cb_16($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 12400
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12402
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12404
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 12405
 _wait_ms(150); //@line 12406
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 36; //@line 12409
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 12410
  HEAP32[$4 >> 2] = $2; //@line 12411
  sp = STACKTOP; //@line 12412
  return;
 }
 ___async_unwind = 0; //@line 12415
 HEAP32[$ReallocAsyncCtx13 >> 2] = 36; //@line 12416
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 12417
 HEAP32[$4 >> 2] = $2; //@line 12418
 sp = STACKTOP; //@line 12419
 return;
}
function _mbed_die__async_cb_15($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 12375
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12377
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12379
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 12380
 _wait_ms(150); //@line 12381
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 37; //@line 12384
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 12385
  HEAP32[$4 >> 2] = $2; //@line 12386
  sp = STACKTOP; //@line 12387
  return;
 }
 ___async_unwind = 0; //@line 12390
 HEAP32[$ReallocAsyncCtx12 >> 2] = 37; //@line 12391
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 12392
 HEAP32[$4 >> 2] = $2; //@line 12393
 sp = STACKTOP; //@line 12394
 return;
}
function _mbed_die__async_cb_14($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 12350
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12352
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12354
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 12355
 _wait_ms(150); //@line 12356
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 38; //@line 12359
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 12360
  HEAP32[$4 >> 2] = $2; //@line 12361
  sp = STACKTOP; //@line 12362
  return;
 }
 ___async_unwind = 0; //@line 12365
 HEAP32[$ReallocAsyncCtx11 >> 2] = 38; //@line 12366
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 12367
 HEAP32[$4 >> 2] = $2; //@line 12368
 sp = STACKTOP; //@line 12369
 return;
}
function _mbed_die__async_cb_13($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 12325
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12327
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12329
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 12330
 _wait_ms(150); //@line 12331
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 39; //@line 12334
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 12335
  HEAP32[$4 >> 2] = $2; //@line 12336
  sp = STACKTOP; //@line 12337
  return;
 }
 ___async_unwind = 0; //@line 12340
 HEAP32[$ReallocAsyncCtx10 >> 2] = 39; //@line 12341
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 12342
 HEAP32[$4 >> 2] = $2; //@line 12343
 sp = STACKTOP; //@line 12344
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 12075
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12077
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12079
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 12080
 _wait_ms(150); //@line 12081
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 33; //@line 12084
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 12085
  HEAP32[$4 >> 2] = $2; //@line 12086
  sp = STACKTOP; //@line 12087
  return;
 }
 ___async_unwind = 0; //@line 12090
 HEAP32[$ReallocAsyncCtx16 >> 2] = 33; //@line 12091
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 12092
 HEAP32[$4 >> 2] = $2; //@line 12093
 sp = STACKTOP; //@line 12094
 return;
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 6020
 STACKTOP = STACKTOP + 32 | 0; //@line 6021
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 6021
 $vararg_buffer = sp; //@line 6022
 HEAP32[$0 + 36 >> 2] = 1; //@line 6025
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 6033
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 6035
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 6037
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 6042
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 6045
 STACKTOP = sp; //@line 6046
 return $14 | 0; //@line 6046
}
function _mbed_die__async_cb_12($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 12300
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12302
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12304
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 12305
 _wait_ms(150); //@line 12306
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 40; //@line 12309
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 12310
  HEAP32[$4 >> 2] = $2; //@line 12311
  sp = STACKTOP; //@line 12312
  return;
 }
 ___async_unwind = 0; //@line 12315
 HEAP32[$ReallocAsyncCtx9 >> 2] = 40; //@line 12316
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 12317
 HEAP32[$4 >> 2] = $2; //@line 12318
 sp = STACKTOP; //@line 12319
 return;
}
function _mbed_die__async_cb_11($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 12275
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12277
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12279
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 12280
 _wait_ms(400); //@line 12281
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 41; //@line 12284
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 12285
  HEAP32[$4 >> 2] = $2; //@line 12286
  sp = STACKTOP; //@line 12287
  return;
 }
 ___async_unwind = 0; //@line 12290
 HEAP32[$ReallocAsyncCtx8 >> 2] = 41; //@line 12291
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 12292
 HEAP32[$4 >> 2] = $2; //@line 12293
 sp = STACKTOP; //@line 12294
 return;
}
function _mbed_die__async_cb_10($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 12250
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12252
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12254
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 12255
 _wait_ms(400); //@line 12256
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 42; //@line 12259
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 12260
  HEAP32[$4 >> 2] = $2; //@line 12261
  sp = STACKTOP; //@line 12262
  return;
 }
 ___async_unwind = 0; //@line 12265
 HEAP32[$ReallocAsyncCtx7 >> 2] = 42; //@line 12266
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 12267
 HEAP32[$4 >> 2] = $2; //@line 12268
 sp = STACKTOP; //@line 12269
 return;
}
function _mbed_die__async_cb_9($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 12225
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12227
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12229
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 12230
 _wait_ms(400); //@line 12231
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 43; //@line 12234
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 12235
  HEAP32[$4 >> 2] = $2; //@line 12236
  sp = STACKTOP; //@line 12237
  return;
 }
 ___async_unwind = 0; //@line 12240
 HEAP32[$ReallocAsyncCtx6 >> 2] = 43; //@line 12241
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 12242
 HEAP32[$4 >> 2] = $2; //@line 12243
 sp = STACKTOP; //@line 12244
 return;
}
function _mbed_die__async_cb_8($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 12200
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12202
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12204
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 12205
 _wait_ms(400); //@line 12206
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 44; //@line 12209
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 12210
  HEAP32[$4 >> 2] = $2; //@line 12211
  sp = STACKTOP; //@line 12212
  return;
 }
 ___async_unwind = 0; //@line 12215
 HEAP32[$ReallocAsyncCtx5 >> 2] = 44; //@line 12216
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 12217
 HEAP32[$4 >> 2] = $2; //@line 12218
 sp = STACKTOP; //@line 12219
 return;
}
function _mbed_die__async_cb_7($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 12175
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12177
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12179
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 12180
 _wait_ms(400); //@line 12181
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 45; //@line 12184
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 12185
  HEAP32[$4 >> 2] = $2; //@line 12186
  sp = STACKTOP; //@line 12187
  return;
 }
 ___async_unwind = 0; //@line 12190
 HEAP32[$ReallocAsyncCtx4 >> 2] = 45; //@line 12191
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 12192
 HEAP32[$4 >> 2] = $2; //@line 12193
 sp = STACKTOP; //@line 12194
 return;
}
function _mbed_die__async_cb_6($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 12150
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12152
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12154
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 12155
 _wait_ms(400); //@line 12156
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 12159
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 12160
  HEAP32[$4 >> 2] = $2; //@line 12161
  sp = STACKTOP; //@line 12162
  return;
 }
 ___async_unwind = 0; //@line 12165
 HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 12166
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 12167
 HEAP32[$4 >> 2] = $2; //@line 12168
 sp = STACKTOP; //@line 12169
 return;
}
function _mbed_die__async_cb_5($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12125
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12127
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 12129
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 12130
 _wait_ms(400); //@line 12131
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 47; //@line 12134
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 12135
  HEAP32[$4 >> 2] = $2; //@line 12136
  sp = STACKTOP; //@line 12137
  return;
 }
 ___async_unwind = 0; //@line 12140
 HEAP32[$ReallocAsyncCtx2 >> 2] = 47; //@line 12141
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 12142
 HEAP32[$4 >> 2] = $2; //@line 12143
 sp = STACKTOP; //@line 12144
 return;
}
function _mbed_die__async_cb_4($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12100
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12102
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 12104
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 12105
 _wait_ms(400); //@line 12106
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 48; //@line 12109
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 12110
  HEAP32[$4 >> 2] = $2; //@line 12111
  sp = STACKTOP; //@line 12112
  return;
 }
 ___async_unwind = 0; //@line 12115
 HEAP32[$ReallocAsyncCtx >> 2] = 48; //@line 12116
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 12117
 HEAP32[$4 >> 2] = $2; //@line 12118
 sp = STACKTOP; //@line 12119
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13331
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13335
 HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 8 >> 2] = $AsyncRetVal; //@line 13338
 if ($AsyncRetVal | 0) {
  return;
 }
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 13343
 _mbed_assert_internal(1425, 1428, 149); //@line 13344
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 76; //@line 13347
  sp = STACKTOP; //@line 13348
  return;
 }
 ___async_unwind = 0; //@line 13351
 HEAP32[$ReallocAsyncCtx2 >> 2] = 76; //@line 13352
 sp = STACKTOP; //@line 13353
 return;
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 3635
 newDynamicTop = oldDynamicTop + increment | 0; //@line 3636
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 3640
  ___setErrNo(12); //@line 3641
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 3645
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 3649
   ___setErrNo(12); //@line 3650
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 3654
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 6191
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 6193
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 6199
  $11 = ___fwritex($0, $4, $3) | 0; //@line 6200
  if ($phitmp) {
   $13 = $11; //@line 6202
  } else {
   ___unlockfile($3); //@line 6204
   $13 = $11; //@line 6205
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 6209
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 6213
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 6216
 }
 return $15 | 0; //@line 6218
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 8413
 } else {
  $$056 = $2; //@line 8415
  $15 = $1; //@line 8415
  $8 = $0; //@line 8415
  while (1) {
   $14 = $$056 + -1 | 0; //@line 8423
   HEAP8[$14 >> 0] = HEAPU8[2023 + ($8 & 15) >> 0] | 0 | $3; //@line 8424
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 8425
   $15 = tempRet0; //@line 8426
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 8431
    break;
   } else {
    $$056 = $14; //@line 8434
   }
  }
 }
 return $$05$lcssa | 0; //@line 8438
}
function __ZSt9terminatev() {
 var $0 = 0, $16 = 0, $17 = 0, $2 = 0, $5 = 0, sp = 0;
 sp = STACKTOP; //@line 10950
 $0 = ___cxa_get_globals_fast() | 0; //@line 10951
 if ($0 | 0) {
  $2 = HEAP32[$0 >> 2] | 0; //@line 10954
  if ($2 | 0) {
   $5 = $2 + 48 | 0; //@line 10958
   if ((HEAP32[$5 >> 2] & -256 | 0) == 1126902528 ? (HEAP32[$5 + 4 >> 2] | 0) == 1129074247 : 0) {
    $16 = HEAP32[$2 + 12 >> 2] | 0; //@line 10970
    _emscripten_alloc_async_context(4, sp) | 0; //@line 10971
    __ZSt11__terminatePFvvE($16); //@line 10972
   }
  }
 }
 $17 = __ZSt13get_terminatev() | 0; //@line 10977
 _emscripten_alloc_async_context(4, sp) | 0; //@line 10978
 __ZSt11__terminatePFvvE($17); //@line 10979
}
function __ZN4mbed11InterruptInD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11853
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11855
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 11857
 if (!$4) {
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 11864
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 11865
 FUNCTION_TABLE_vi[$8 & 127]($2 + 40 | 0); //@line 11866
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 12; //@line 11869
  sp = STACKTOP; //@line 11870
  return;
 }
 ___async_unwind = 0; //@line 11873
 HEAP32[$ReallocAsyncCtx2 >> 2] = 12; //@line 11874
 sp = STACKTOP; //@line 11875
 return;
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 6408
 $3 = HEAP8[$1 >> 0] | 0; //@line 6410
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 6414
 $7 = HEAP32[$0 >> 2] | 0; //@line 6415
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 6420
  HEAP32[$0 + 4 >> 2] = 0; //@line 6422
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 6424
  HEAP32[$0 + 28 >> 2] = $14; //@line 6426
  HEAP32[$0 + 20 >> 2] = $14; //@line 6428
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 6434
  $$0 = 0; //@line 6435
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 6438
  $$0 = -1; //@line 6439
 }
 return $$0 | 0; //@line 6441
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 8450
 } else {
  $$06 = $2; //@line 8452
  $11 = $1; //@line 8452
  $7 = $0; //@line 8452
  while (1) {
   $10 = $$06 + -1 | 0; //@line 8457
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 8458
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 8459
   $11 = tempRet0; //@line 8460
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 8465
    break;
   } else {
    $$06 = $10; //@line 8468
   }
  }
 }
 return $$0$lcssa | 0; //@line 8472
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13145
 $3 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 13148
 $5 = HEAP32[$3 + 4 >> 2] | 0; //@line 13150
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 13151
 _equeue_dealloc($5, $3); //@line 13152
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 78; //@line 13155
  sp = STACKTOP; //@line 13156
  return;
 }
 ___async_unwind = 0; //@line 13159
 HEAP32[$ReallocAsyncCtx2 >> 2] = 78; //@line 13160
 sp = STACKTOP; //@line 13161
 return;
}
function __GLOBAL__sub_I_main_cpp() {
 __ZN6events10EventQueueC2EjPh(4528, 1664, 0); //@line 2256
 HEAP32[1182] = 0; //@line 2257
 HEAP32[1183] = 0; //@line 2257
 HEAP32[1184] = 0; //@line 2257
 HEAP32[1185] = 0; //@line 2257
 HEAP32[1186] = 0; //@line 2257
 HEAP32[1187] = 0; //@line 2257
 _gpio_init_out(4728, 50); //@line 2258
 HEAP32[1188] = 0; //@line 2259
 HEAP32[1189] = 0; //@line 2259
 HEAP32[1190] = 0; //@line 2259
 HEAP32[1191] = 0; //@line 2259
 HEAP32[1192] = 0; //@line 2259
 HEAP32[1193] = 0; //@line 2259
 _gpio_init_out(4752, 52); //@line 2260
 __ZN4mbed11InterruptInC2E7PinName(4776, 1337); //@line 2261
 return;
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11826
 do {
  if (!$0) {
   $3 = 0; //@line 11830
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11832
   $2 = ___dynamic_cast($0, 64, 120, 0) | 0; //@line 11833
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 121; //@line 11836
    sp = STACKTOP; //@line 11837
    return 0; //@line 11838
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 11840
    $3 = ($2 | 0) != 0 & 1; //@line 11843
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 11848
}
function _invoke_ticker__async_cb_41($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14151
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 14157
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 14158
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 14159
 FUNCTION_TABLE_vi[$5 & 127]($6); //@line 14160
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 55; //@line 14163
  sp = STACKTOP; //@line 14164
  return;
 }
 ___async_unwind = 0; //@line 14167
 HEAP32[$ReallocAsyncCtx >> 2] = 55; //@line 14168
 sp = STACKTOP; //@line 14169
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 8094
 } else {
  $$04 = 0; //@line 8096
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 8099
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 8103
   $12 = $7 + 1 | 0; //@line 8104
   HEAP32[$0 >> 2] = $12; //@line 8105
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 8111
    break;
   } else {
    $$04 = $11; //@line 8114
   }
  }
 }
 return $$0$lcssa | 0; //@line 8118
}
function _main__async_cb_20($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 12590
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12592
 $4 = HEAP32[$2 + 4 >> 2] | 0; //@line 12594
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(4) | 0; //@line 12595
 _equeue_dealloc($4, $2); //@line 12596
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 68; //@line 12599
  sp = STACKTOP; //@line 12600
  return;
 }
 ___async_unwind = 0; //@line 12603
 HEAP32[$ReallocAsyncCtx5 >> 2] = 68; //@line 12604
 sp = STACKTOP; //@line 12605
 return;
}
function _main__async_cb_22($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 12619
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12621
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 12622
 $3 = _equeue_alloc(4528, 32) | 0; //@line 12623
 if (!___async) {
  HEAP32[___async_retval >> 2] = $3; //@line 12627
  ___async_unwind = 0; //@line 12628
 }
 HEAP32[$ReallocAsyncCtx7 >> 2] = 63; //@line 12630
 HEAP32[$ReallocAsyncCtx7 + 4 >> 2] = $2; //@line 12632
 sp = STACKTOP; //@line 12633
 return;
}
function ___fflush_unlocked__async_cb_56($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2899
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2901
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2903
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2905
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 2907
 HEAP32[$4 >> 2] = 0; //@line 2908
 HEAP32[$6 >> 2] = 0; //@line 2909
 HEAP32[$8 >> 2] = 0; //@line 2910
 HEAP32[$10 >> 2] = 0; //@line 2911
 HEAP32[___async_retval >> 2] = 0; //@line 2913
 return;
}
function __Z9blink_ledv() {
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2266
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2267
 _puts(1320) | 0; //@line 2268
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 57; //@line 2271
  sp = STACKTOP; //@line 2272
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2275
  $2 = (_emscripten_asm_const_ii(6, HEAP32[1182] | 0) | 0) == 0 & 1; //@line 2279
  _emscripten_asm_const_iii(0, HEAP32[1182] | 0, $2 | 0) | 0; //@line 2281
  return;
 }
}
function __Z8btn_fallv() {
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2287
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2288
 _puts(1408) | 0; //@line 2289
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 58; //@line 2292
  sp = STACKTOP; //@line 2293
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2296
  $2 = (_emscripten_asm_const_ii(6, HEAP32[1188] | 0) | 0) == 0 & 1; //@line 2300
  _emscripten_asm_const_iii(0, HEAP32[1188] | 0, $2 | 0) | 0; //@line 2302
  return;
 }
}
function _serial_putc__async_cb_2($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11893
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11895
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 11896
 _fflush($2) | 0; //@line 11897
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 53; //@line 11900
  sp = STACKTOP; //@line 11901
  return;
 }
 ___async_unwind = 0; //@line 11904
 HEAP32[$ReallocAsyncCtx >> 2] = 53; //@line 11905
 sp = STACKTOP; //@line 11906
 return;
}
function __ZN4mbed11InterruptInC2E7PinName($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $3 = 0, $4 = 0, dest = 0, stop = 0;
 HEAP32[$0 >> 2] = 160; //@line 164
 $2 = $0 + 4 | 0; //@line 165
 $3 = $0 + 28 | 0; //@line 166
 $4 = $0; //@line 167
 dest = $2; //@line 168
 stop = dest + 68 | 0; //@line 168
 do {
  HEAP32[dest >> 2] = 0; //@line 168
  dest = dest + 4 | 0; //@line 168
 } while ((dest | 0) < (stop | 0));
 _gpio_irq_init($3, $1, 2, $4) | 0; //@line 169
 _gpio_init_in($2, $1); //@line 170
 return;
}
function __ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2668
 $1 = HEAP32[$0 >> 2] | 0; //@line 2669
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2670
 FUNCTION_TABLE_v[$1 & 7](); //@line 2671
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 79; //@line 2674
  sp = STACKTOP; //@line 2675
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2678
  return;
 }
}
function _emscripten_async_resume() {
 ___async = 0; //@line 3478
 ___async_unwind = 1; //@line 3479
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 3485
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 3489
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 3493
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 3495
 }
}
function _main__async_cb_23($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 12639
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 12640
 __ZN6events10EventQueue8dispatchEi(4528, -1); //@line 12641
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 69; //@line 12644
  sp = STACKTOP; //@line 12645
  return;
 }
 ___async_unwind = 0; //@line 12648
 HEAP32[$ReallocAsyncCtx3 >> 2] = 69; //@line 12649
 sp = STACKTOP; //@line 12650
 return;
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5831
 STACKTOP = STACKTOP + 16 | 0; //@line 5832
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 5832
 $vararg_buffer = sp; //@line 5833
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 5837
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 5839
 STACKTOP = sp; //@line 5840
 return $5 | 0; //@line 5840
}
function __ZN6events10EventQueue13function_callIPFvvEEEvPv($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2492
 $1 = HEAP32[$0 >> 2] | 0; //@line 2493
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2494
 FUNCTION_TABLE_v[$1 & 7](); //@line 2495
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 70; //@line 2498
  sp = STACKTOP; //@line 2499
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2502
  return;
 }
}
function _handle_interrupt_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2073
 $2 = HEAP32[1128] | 0; //@line 2074
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2075
 FUNCTION_TABLE_vii[$2 & 3]($0, $1); //@line 2076
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 51; //@line 2079
  sp = STACKTOP; //@line 2080
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2083
  return;
 }
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 3420
 STACKTOP = STACKTOP + 16 | 0; //@line 3421
 $rem = __stackBase__ | 0; //@line 3422
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 3423
 STACKTOP = __stackBase__; //@line 3424
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 3425
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 3190
 if ((ret | 0) < 8) return ret | 0; //@line 3191
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 3192
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 3193
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 3194
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 3195
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 3196
}
function ___cxa_get_globals_fast() {
 var $3 = 0, sp = 0;
 sp = STACKTOP; //@line 10171
 STACKTOP = STACKTOP + 16 | 0; //@line 10172
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10172
 if (!(_pthread_once(5424, 4) | 0)) {
  $3 = _pthread_getspecific(HEAP32[1357] | 0) | 0; //@line 10178
  STACKTOP = sp; //@line 10179
  return $3 | 0; //@line 10179
 } else {
  _abort_message(4208, sp); //@line 10181
 }
 return 0; //@line 10184
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10339
 }
 return;
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12994
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12996
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 12997
 _fputc(10, $2) | 0; //@line 12998
 if (!___async) {
  ___async_unwind = 0; //@line 13001
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 97; //@line 13003
 sp = STACKTOP; //@line 13004
 return;
}
function __ZL25default_terminate_handlerv__async_cb_52($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2641
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2643
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2645
 HEAP32[$2 >> 2] = 4069; //@line 2646
 HEAP32[$2 + 4 >> 2] = $4; //@line 2648
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 2650
 _abort_message(3933, $2); //@line 2651
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 9876
 $6 = HEAP32[$5 >> 2] | 0; //@line 9877
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 9878
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 9880
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 9882
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 9885
 return $2 | 0; //@line 9886
}
function __ZN6events10EventQueueC2EjPh($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0;
 $3 = $0 + 184 | 0; //@line 411
 HEAP32[$3 >> 2] = 0; //@line 412
 HEAP32[$3 + 4 >> 2] = 0; //@line 412
 HEAP32[$3 + 8 >> 2] = 0; //@line 412
 HEAP32[$3 + 12 >> 2] = 0; //@line 412
 if (!$2) {
  _equeue_create($0, $1) | 0; //@line 415
  return;
 } else {
  _equeue_create_inplace($0, $1, $2) | 0; //@line 418
  return;
 }
}
function __ZN6events10EventQueue8dispatchEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 426
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 427
 _equeue_dispatch($0, $1); //@line 428
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 22; //@line 431
  sp = STACKTOP; //@line 432
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 435
  return;
 }
}
function _gpio_irq_init($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0;
 if (($1 | 0) == -1) {
  $$0 = -1; //@line 2096
  return $$0 | 0; //@line 2097
 }
 HEAP32[1128] = $2; //@line 2099
 HEAP32[$0 >> 2] = $1; //@line 2100
 HEAP32[$0 + 4 >> 2] = $1; //@line 2102
 _emscripten_asm_const_iii(3, $3 | 0, $1 | 0) | 0; //@line 2103
 $$0 = 0; //@line 2104
 return $$0 | 0; //@line 2105
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13367
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 13378
  $$0 = 1; //@line 13379
 } else {
  $$0 = 0; //@line 13381
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 13385
 return;
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12016
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 12019
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 12024
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 12027
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 10933
 STACKTOP = STACKTOP + 16 | 0; //@line 10934
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10934
 _free($0); //@line 10936
 if (!(_pthread_setspecific(HEAP32[1357] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 10941
  return;
 } else {
  _abort_message(4307, sp); //@line 10943
 }
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 2136
 HEAP32[$0 >> 2] = $1; //@line 2137
 HEAP32[1129] = 1; //@line 2138
 $4 = $0; //@line 2139
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 2144
 $10 = 4520; //@line 2145
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 2147
 HEAP32[$10 + 4 >> 2] = $9; //@line 2150
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 10415
 }
 return;
}
function _equeue_sema_create($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $4 = 0;
 $1 = _pthread_mutex_init($0 | 0, 0) | 0; //@line 1558
 if (!$1) {
  $4 = _pthread_cond_init($0 + 28 | 0, 0) | 0; //@line 1562
  if (!$4) {
   HEAP8[$0 + 76 >> 0] = 0; //@line 1566
   $$0 = 0; //@line 1567
  } else {
   $$0 = $4; //@line 1569
  }
 } else {
  $$0 = $1; //@line 1572
 }
 return $$0 | 0; //@line 1574
}
function _equeue_tick() {
 var $0 = 0, sp = 0;
 sp = STACKTOP; //@line 1521
 STACKTOP = STACKTOP + 16 | 0; //@line 1522
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1522
 $0 = sp; //@line 1523
 _gettimeofday($0 | 0, 0) | 0; //@line 1524
 STACKTOP = sp; //@line 1531
 return ((HEAP32[$0 + 4 >> 2] | 0) / 1e3 | 0) + ((HEAP32[$0 >> 2] | 0) * 1e3 | 0) | 0; //@line 1531
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2240
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2241
 _emscripten_sleep($0 | 0); //@line 2242
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 56; //@line 2245
  sp = STACKTOP; //@line 2246
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2249
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
  $7 = $1 + 28 | 0; //@line 10479
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 10483
  }
 }
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var sp = 0;
 sp = STACKTOP; //@line 10918
 STACKTOP = STACKTOP + 16 | 0; //@line 10919
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10919
 if (!(_pthread_key_create(5428, 106) | 0)) {
  STACKTOP = sp; //@line 10924
  return;
 } else {
  _abort_message(4257, sp); //@line 10926
 }
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 3454
 HEAP32[new_frame + 4 >> 2] = sp; //@line 3456
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 3458
 ___async_cur_frame = new_frame; //@line 3459
 return ___async_cur_frame + 8 | 0; //@line 3460
}
function __ZN4mbed8CallbackIFvvEE13function_moveIN6events5EventIS1_EEEEvPvPKv($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 HEAP32[$0 >> 2] = 0; //@line 2604
 $2 = HEAP32[$1 >> 2] | 0; //@line 2605
 if (!$2) {
  return;
 }
 HEAP32[$0 >> 2] = $2; //@line 2610
 HEAP32[$2 >> 2] = (HEAP32[$2 >> 2] | 0) + 1; //@line 2613
 return;
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 14216
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 14220
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 14223
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 3443
  return low << bits; //@line 3444
 }
 tempRet0 = low << bits - 32; //@line 3446
 return 0; //@line 3447
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 3432
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 3433
 }
 tempRet0 = 0; //@line 3435
 return high >>> bits - 32 | 0; //@line 3436
}
function _equeue_dispatch__async_cb_49($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1253
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1255
 HEAP8[HEAP32[$0 + 4 >> 2] >> 0] = 1; //@line 1256
 _equeue_mutex_unlock($4); //@line 1257
 HEAP8[$6 >> 0] = 0; //@line 1258
 return;
}
function _fflush__async_cb_53($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2741
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 2743
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 2746
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_44($0) {
 $0 = $0 | 0;
 var $6 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14338
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 14340
 _gpio_irq_set($6 + 28 | 0, 2, 1); //@line 14342
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
function _equeue_post__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 14069
 _equeue_sema_signal((HEAP32[$0 + 4 >> 2] | 0) + 48 | 0); //@line 14071
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 14073
 return;
}
function _puts__async_cb($0) {
 $0 = $0 | 0;
 var $$lobit = 0;
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 13534
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 13537
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 13540
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 14184
 } else {
  $$0 = -1; //@line 14186
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 14189
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 6538
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 6544
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 6548
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 3710
}
function _fputc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13114
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 13115
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 13117
 return;
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13195
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 13196
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 13198
 return;
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 3466
 stackRestore(___async_cur_frame | 0); //@line 3467
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 3468
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 2059
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 2065
 _emscripten_asm_const_iii(2, $0 | 0, $1 | 0) | 0; //@line 2066
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 9535
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 9535
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 9537
 return $1 | 0; //@line 9538
}
function _gpio_init_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 2044
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 2050
 _emscripten_asm_const_iii(1, $0 | 0, $1 | 0) | 0; //@line 2051
 return;
}
function _equeue_sema_signal($0) {
 $0 = $0 | 0;
 _pthread_mutex_lock($0 | 0) | 0; //@line 1580
 HEAP8[$0 + 76 >> 0] = 1; //@line 1582
 _pthread_cond_signal($0 + 28 | 0) | 0; //@line 1584
 _pthread_mutex_unlock($0 | 0) | 0; //@line 1585
 return;
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 5997
  $$0 = -1; //@line 5998
 } else {
  $$0 = $0; //@line 6000
 }
 return $$0 | 0; //@line 6002
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 3183
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 3184
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 3185
}
function _equeue_enqueue__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13224
 _equeue_mutex_unlock(HEAP32[$0 + 4 >> 2] | 0); //@line 13225
 HEAP32[___async_retval >> 2] = $4; //@line 13227
 return;
}
function __Z9blink_ledv__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(6, HEAP32[1182] | 0) | 0) == 0 & 1; //@line 12878
 _emscripten_asm_const_iii(0, HEAP32[1182] | 0, $3 | 0) | 0; //@line 12880
 return;
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 3175
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 3177
}
function __Z8btn_fallv__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(6, HEAP32[1188] | 0) | 0) == 0 & 1; //@line 13177
 _emscripten_asm_const_iii(0, HEAP32[1188] | 0, $3 | 0) | 0; //@line 13179
 return;
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 3703
}
function ___clang_call_terminate($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 153
 ___cxa_begin_catch($0 | 0) | 0; //@line 154
 _emscripten_alloc_async_context(4, sp) | 0; //@line 155
 __ZSt9terminatev(); //@line 156
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 3696
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 8595
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 8598
 }
 return $$0 | 0; //@line 8600
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 3668
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 3412
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 13256
 return;
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 6178
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 6182
}
function __ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 14233
 return;
}
function _gpio_irq_set($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 _emscripten_asm_const_iiii(5, HEAP32[$0 + 4 >> 2] | 0, $1 | 0, $2 | 0) | 0; //@line 2126
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 3473
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 3474
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_47($0) {
 $0 = $0 | 0;
 _gpio_irq_set((HEAP32[$0 + 8 >> 2] | 0) + 28 | 0, 2, 0); //@line 14453
 return;
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 11018
 __ZdlPv($0); //@line 11019
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 10701
 __ZdlPv($0); //@line 10702
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 6674
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 6676
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 10229
 __ZdlPv($0); //@line 10230
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
  ___fwritex($1, $2, $0) | 0; //@line 8080
 }
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 3162
 return;
}
function b28(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 3774
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 10426
}
function __ZSt13get_terminatev() {
 var $0 = 0;
 $0 = HEAP32[202] | 0; //@line 11008
 HEAP32[202] = $0 + 0; //@line 11010
 return $0 | 0; //@line 11012
}
function _gpio_irq_free($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iii(4, HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 2115
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
 FUNCTION_TABLE_vii[index & 3](a1 | 0, a2 | 0); //@line 3689
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
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 3500
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_19($0) {
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
function b26(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 3771
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 8543
}
function _fputc__async_cb_29($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 13127
 return;
}
function _fflush__async_cb_54($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 2756
 return;
}
function _putc__async_cb_32($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 13208
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 3](a1 | 0) | 0; //@line 3661
}
function __ZN4mbed11InterruptInD0Ev__async_cb_3($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 12069
 return;
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(4360, HEAP32[$0 + 4 >> 2] | 0); //@line 11997
}
function b6(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 3726
 return 0; //@line 3726
}
function b5(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 3723
 return 0; //@line 3723
}
function b4(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 3720
 return 0; //@line 3720
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 127](a1 | 0); //@line 3682
}
function b24(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 3768
}
function _equeue_event_period($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + -12 >> 2] = $1; //@line 1507
 return;
}
function _equeue_event_delay($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + -16 >> 2] = $1; //@line 1498
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb_34($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb_31($0) {
 $0 = $0 | 0;
 return;
}
function _equeue_event_dtor($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + -8 >> 2] = $1; //@line 1516
 return;
}
function __ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _equeue_mutex_unlock($0) {
 $0 = $0 | 0;
 _pthread_mutex_unlock($0 | 0) | 0; //@line 1551
 return;
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 9788
}
function _equeue_mutex_create($0) {
 $0 = $0 | 0;
 return _pthread_mutex_init($0 | 0, 0) | 0; //@line 1538
}
function _main__async_cb_21($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 12613
 return;
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_42($0) {
 $0 = $0 | 0;
 return;
}
function __ZN6events10EventQueue13function_dtorINS0_9context00IPFvvEEEEEvPv($0) {
 $0 = $0 | 0;
 return;
}
function _equeue_mutex_lock($0) {
 $0 = $0 | 0;
 _pthread_mutex_lock($0 | 0) | 0; //@line 1544
 return;
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN6events10EventQueue13function_callIPFvvEEEvPv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN6events5EventIFvvEE10event_dtorIPS1_EEvPNS2_5eventE($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 7](); //@line 3675
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 6055
}
function __ZN6events10EventQueue13function_dtorIPFvvEEEvPv($0) {
 $0 = $0 | 0;
 return;
}
function b2(p0) {
 p0 = p0 | 0;
 nullFunc_ii(3); //@line 3717
 return 0; //@line 3717
}
function b1(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 3714
 return 0; //@line 3714
}
function __ZN6events10EventQueue8dispatchEi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b22(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(3); //@line 3765
}
function b21(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(0); //@line 3762
}
function _abort_message__async_cb_27($0) {
 $0 = $0 | 0;
 _abort(); //@line 13011
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
 ___lock(5412); //@line 6681
 return 5420; //@line 6682
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
function __ZN4mbed11InterruptInD2Ev__async_cb_1($0) {
 $0 = $0 | 0;
 return;
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 9709
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 9715
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 16
}
function _pthread_mutex_unlock(x) {
 x = x | 0;
 return 0; //@line 3627
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 10055
 return;
}
function _pthread_mutex_lock(x) {
 x = x | 0;
 return 0; //@line 3623
}
function _mbed_assert_internal__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _handle_interrupt_in__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___ofl_unlock() {
 ___unlock(5412); //@line 6687
 return;
}
function b19(p0) {
 p0 = p0 | 0;
 nullFunc_vi(127); //@line 3759
}
function b18(p0) {
 p0 = p0 | 0;
 nullFunc_vi(126); //@line 3756
}
function b17(p0) {
 p0 = p0 | 0;
 nullFunc_vi(125); //@line 3753
}
function b16(p0) {
 p0 = p0 | 0;
 nullFunc_vi(124); //@line 3750
}
function b15(p0) {
 p0 = p0 | 0;
 nullFunc_vi(123); //@line 3747
}
function b14(p0) {
 p0 = p0 | 0;
 nullFunc_vi(122); //@line 3744
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 6013
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 6330
}
function b13(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 3741
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___clang_call_terminate__async_cb($0) {
 $0 = $0 | 0;
}
function _serial_putc__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZSt9terminatev__async_cb_30($0) {
 $0 = $0 | 0;
}
function __ZNSt9type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function getTempRet0() {
 return tempRet0 | 0; //@line 42
}
function ___errno_location() {
 return 5408; //@line 6007
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
function __ZSt9terminatev__async_cb($0) {
 $0 = $0 | 0;
}
function _core_util_critical_section_exit() {
 return;
}
function _pthread_self() {
 return 440; //@line 6060
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 26
}
function b11() {
 nullFunc_v(7); //@line 3738
}
function b10() {
 nullFunc_v(6); //@line 3735
}
function b9() {
 nullFunc_v(5); //@line 3732
}
function b8() {
 nullFunc_v(0); //@line 3729
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_ii = [b1,___stdio_close,__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE,b2];
var FUNCTION_TABLE_iiii = [b4,___stdio_write,___stdio_seek,___stdout_write,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b5,b6];
var FUNCTION_TABLE_v = [b8,__ZL25default_terminate_handlerv,__Z9blink_ledv,__Z8btn_fallv,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev,b9,b10,b11];
var FUNCTION_TABLE_vi = [b13,__ZN4mbed11InterruptInD2Ev,__ZN4mbed11InterruptInD0Ev,__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv,__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed11InterruptInD2Ev__async_cb,__ZN4mbed11InterruptInD2Ev__async_cb_1,__ZN4mbed11InterruptInD0Ev__async_cb,__ZN4mbed11InterruptInD0Ev__async_cb_3,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_42,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_44,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_45,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_46,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_47,__ZN6events10EventQueue8dispatchEi__async_cb,_equeue_alloc__async_cb,_equeue_dealloc__async_cb,_equeue_post__async_cb,_equeue_enqueue__async_cb,_equeue_dispatch__async_cb,_equeue_dispatch__async_cb_50
,_equeue_dispatch__async_cb_48,_equeue_dispatch__async_cb_49,_equeue_dispatch__async_cb_51,_mbed_assert_internal__async_cb,_mbed_die__async_cb_18,_mbed_die__async_cb_17,_mbed_die__async_cb_16,_mbed_die__async_cb_15,_mbed_die__async_cb_14,_mbed_die__async_cb_13,_mbed_die__async_cb_12,_mbed_die__async_cb_11,_mbed_die__async_cb_10,_mbed_die__async_cb_9,_mbed_die__async_cb_8,_mbed_die__async_cb_7,_mbed_die__async_cb_6,_mbed_die__async_cb_5,_mbed_die__async_cb_4,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_printf__async_cb_36,_handle_interrupt_in__async_cb,_serial_putc__async_cb_2,_serial_putc__async_cb,_invoke_ticker__async_cb_41,_invoke_ticker__async_cb,_wait_ms__async_cb,__Z9blink_ledv__async_cb,__Z8btn_fallv__async_cb
,_main__async_cb_26,__ZN6events10EventQueue13function_dtorIPFvvEEEvPv,__ZN6events10EventQueue13function_callIPFvvEEEvPv,_main__async_cb_22,_main__async_cb_25,__ZN6events5EventIFvvEE10event_dtorIPS1_EEvPNS2_5eventE,_main__async_cb_24,_main__async_cb,_main__async_cb_20,_main__async_cb_23,_main__async_cb_21,__ZN6events10EventQueue13function_callIPFvvEEEvPv__async_cb,__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb_43,__ZN6events10EventQueue13function_dtorINS0_9context00IPFvvEEEEEvPv,__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv,__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb,__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb,__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb_34,__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb,__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb_31,__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv__async_cb,_putc__async_cb_32,_putc__async_cb,___overflow__async_cb,_fflush__async_cb_54,_fflush__async_cb_53,_fflush__async_cb_55,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_56
,_vfprintf__async_cb,_vsnprintf__async_cb,_fputc__async_cb_29,_fputc__async_cb,_puts__async_cb,__ZL25default_terminate_handlerv__async_cb,__ZL25default_terminate_handlerv__async_cb_52,_abort_message__async_cb,_abort_message__async_cb_27,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_35,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_33,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_19,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_57,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_40,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_39,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_38,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_37,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_28,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb
,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b14,b15,b16,b17,b18,b19];
var FUNCTION_TABLE_vii = [b21,__ZN4mbed8CallbackIFvvEE13function_moveIN6events5EventIS1_EEEEvPvPKv,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event,b22];
var FUNCTION_TABLE_viiii = [b24,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi];
var FUNCTION_TABLE_viiiii = [b26,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib];
var FUNCTION_TABLE_viiiiii = [b28,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib];

  return { __GLOBAL__sub_I_main_cpp: __GLOBAL__sub_I_main_cpp, ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _fflush: _fflush, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _invoke_ticker: _invoke_ticker, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _pthread_mutex_lock: _pthread_mutex_lock, _pthread_mutex_unlock: _pthread_mutex_unlock, _sbrk: _sbrk, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
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

var real__pthread_mutex_lock = asm["_pthread_mutex_lock"]; asm["_pthread_mutex_lock"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__pthread_mutex_lock.apply(null, arguments);
};

var real__pthread_mutex_unlock = asm["_pthread_mutex_unlock"]; asm["_pthread_mutex_unlock"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__pthread_mutex_unlock.apply(null, arguments);
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
var _pthread_mutex_lock = Module["_pthread_mutex_lock"] = asm["_pthread_mutex_lock"];
var _pthread_mutex_unlock = Module["_pthread_mutex_unlock"] = asm["_pthread_mutex_unlock"];
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
var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
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






//# sourceMappingURL=events.js.map
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

STATICTOP = STATIC_BASE + 6336;
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
var debug_table_iiii = ["0", "___stdio_write", "___stdio_seek", "___stdout_write", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv", "0", "0", "0"];
var debug_table_v = ["0", "__ZL25default_terminate_handlerv", "__Z9blink_ledv", "__Z8btn_fallv", "__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev", "0", "0", "0"];
var debug_table_vi = ["0", "__ZN4mbed11InterruptInD2Ev", "__ZN4mbed11InterruptInD0Ev", "__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv", "__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "__ZN10__cxxabiv121__vmi_class_type_infoD0Ev", "__ZN4mbed11InterruptInD2Ev__async_cb", "__ZN4mbed11InterruptInD2Ev__async_cb_12", "__ZN4mbed11InterruptInD0Ev__async_cb", "__ZN4mbed11InterruptInD0Ev__async_cb_17", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_4", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_39", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_40", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_41", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_42", "__ZN6events10EventQueue8dispatchEi__async_cb", "_equeue_alloc__async_cb", "_equeue_dealloc__async_cb", "_equeue_post__async_cb", "_equeue_enqueue__async_cb", "_equeue_dispatch__async_cb", "_equeue_dispatch__async_cb_7", "_equeue_dispatch__async_cb_5", "_equeue_dispatch__async_cb_6", "_equeue_dispatch__async_cb_8", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_32", "_mbed_die__async_cb_31", "_mbed_die__async_cb_30", "_mbed_die__async_cb_29", "_mbed_die__async_cb_28", "_mbed_die__async_cb_27", "_mbed_die__async_cb_26", "_mbed_die__async_cb_25", "_mbed_die__async_cb_24", "_mbed_die__async_cb_23", "_mbed_die__async_cb_22", "_mbed_die__async_cb_21", "_mbed_die__async_cb_20", "_mbed_die__async_cb_19", "_mbed_die__async_cb_18", "_mbed_die__async_cb", "_handle_interrupt_in__async_cb", "_invoke_ticker__async_cb_1", "_invoke_ticker__async_cb", "_wait_ms__async_cb", "__Z9blink_ledv__async_cb", "__Z8btn_fallv__async_cb", "_main__async_cb_54", "__ZN6events10EventQueue13function_dtorIPFvvEEEvPv", "__ZN6events10EventQueue13function_callIPFvvEEEvPv", "_main__async_cb_50", "_main__async_cb_53", "__ZN6events5EventIFvvEE10event_dtorIPS1_EEvPNS2_5eventE", "_main__async_cb_52", "_main__async_cb", "_main__async_cb_48", "_main__async_cb_51", "_main__async_cb_49", "__ZN6events10EventQueue13function_callIPFvvEEEvPv__async_cb", "__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb_43", "__ZN6events10EventQueue13function_dtorINS0_9context00IPFvvEEEEEvPv", "__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv", "__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb", "__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb", "__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb_3", "__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb", "__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb_33", "__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv__async_cb", "___overflow__async_cb", "_fflush__async_cb_45", "_fflush__async_cb_44", "_fflush__async_cb_46", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_16", "_vfprintf__async_cb", "_fputc__async_cb_9", "_fputc__async_cb", "_puts__async_cb", "__ZL25default_terminate_handlerv__async_cb", "__ZL25default_terminate_handlerv__async_cb_34", "_abort_message__async_cb", "_abort_message__async_cb_11", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_2", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_10", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_14", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv", "__ZSt11__terminatePFvvE__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_47", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_38", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_37", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_36", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_35", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_13", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
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
 sp = STACKTOP; //@line 2620
 STACKTOP = STACKTOP + 16 | 0; //@line 2621
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2621
 $1 = sp; //@line 2622
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 2629
   $7 = $6 >>> 3; //@line 2630
   $8 = HEAP32[1177] | 0; //@line 2631
   $9 = $8 >>> $7; //@line 2632
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 2638
    $16 = 4748 + ($14 << 1 << 2) | 0; //@line 2640
    $17 = $16 + 8 | 0; //@line 2641
    $18 = HEAP32[$17 >> 2] | 0; //@line 2642
    $19 = $18 + 8 | 0; //@line 2643
    $20 = HEAP32[$19 >> 2] | 0; //@line 2644
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1177] = $8 & ~(1 << $14); //@line 2651
     } else {
      if ((HEAP32[1181] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 2656
      }
      $27 = $20 + 12 | 0; //@line 2659
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 2663
       HEAP32[$17 >> 2] = $20; //@line 2664
       break;
      } else {
       _abort(); //@line 2667
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 2672
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 2675
    $34 = $18 + $30 + 4 | 0; //@line 2677
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 2680
    $$0 = $19; //@line 2681
    STACKTOP = sp; //@line 2682
    return $$0 | 0; //@line 2682
   }
   $37 = HEAP32[1179] | 0; //@line 2684
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 2690
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 2693
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 2696
     $49 = $47 >>> 12 & 16; //@line 2698
     $50 = $47 >>> $49; //@line 2699
     $52 = $50 >>> 5 & 8; //@line 2701
     $54 = $50 >>> $52; //@line 2703
     $56 = $54 >>> 2 & 4; //@line 2705
     $58 = $54 >>> $56; //@line 2707
     $60 = $58 >>> 1 & 2; //@line 2709
     $62 = $58 >>> $60; //@line 2711
     $64 = $62 >>> 1 & 1; //@line 2713
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 2716
     $69 = 4748 + ($67 << 1 << 2) | 0; //@line 2718
     $70 = $69 + 8 | 0; //@line 2719
     $71 = HEAP32[$70 >> 2] | 0; //@line 2720
     $72 = $71 + 8 | 0; //@line 2721
     $73 = HEAP32[$72 >> 2] | 0; //@line 2722
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 2728
       HEAP32[1177] = $77; //@line 2729
       $98 = $77; //@line 2730
      } else {
       if ((HEAP32[1181] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 2735
       }
       $80 = $73 + 12 | 0; //@line 2738
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 2742
        HEAP32[$70 >> 2] = $73; //@line 2743
        $98 = $8; //@line 2744
        break;
       } else {
        _abort(); //@line 2747
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 2752
     $84 = $83 - $6 | 0; //@line 2753
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 2756
     $87 = $71 + $6 | 0; //@line 2757
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 2760
     HEAP32[$71 + $83 >> 2] = $84; //@line 2762
     if ($37 | 0) {
      $92 = HEAP32[1182] | 0; //@line 2765
      $93 = $37 >>> 3; //@line 2766
      $95 = 4748 + ($93 << 1 << 2) | 0; //@line 2768
      $96 = 1 << $93; //@line 2769
      if (!($98 & $96)) {
       HEAP32[1177] = $98 | $96; //@line 2774
       $$0199 = $95; //@line 2776
       $$pre$phiZ2D = $95 + 8 | 0; //@line 2776
      } else {
       $101 = $95 + 8 | 0; //@line 2778
       $102 = HEAP32[$101 >> 2] | 0; //@line 2779
       if ((HEAP32[1181] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 2783
       } else {
        $$0199 = $102; //@line 2786
        $$pre$phiZ2D = $101; //@line 2786
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 2789
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 2791
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 2793
      HEAP32[$92 + 12 >> 2] = $95; //@line 2795
     }
     HEAP32[1179] = $84; //@line 2797
     HEAP32[1182] = $87; //@line 2798
     $$0 = $72; //@line 2799
     STACKTOP = sp; //@line 2800
     return $$0 | 0; //@line 2800
    }
    $108 = HEAP32[1178] | 0; //@line 2802
    if (!$108) {
     $$0197 = $6; //@line 2805
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 2809
     $114 = $112 >>> 12 & 16; //@line 2811
     $115 = $112 >>> $114; //@line 2812
     $117 = $115 >>> 5 & 8; //@line 2814
     $119 = $115 >>> $117; //@line 2816
     $121 = $119 >>> 2 & 4; //@line 2818
     $123 = $119 >>> $121; //@line 2820
     $125 = $123 >>> 1 & 2; //@line 2822
     $127 = $123 >>> $125; //@line 2824
     $129 = $127 >>> 1 & 1; //@line 2826
     $134 = HEAP32[5012 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 2831
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 2835
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2841
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 2844
      $$0193$lcssa$i = $138; //@line 2844
     } else {
      $$01926$i = $134; //@line 2846
      $$01935$i = $138; //@line 2846
      $146 = $143; //@line 2846
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 2851
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 2852
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 2853
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 2854
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2860
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 2863
        $$0193$lcssa$i = $$$0193$i; //@line 2863
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 2866
        $$01935$i = $$$0193$i; //@line 2866
       }
      }
     }
     $157 = HEAP32[1181] | 0; //@line 2870
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 2873
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 2876
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 2879
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 2883
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 2885
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 2889
       $176 = HEAP32[$175 >> 2] | 0; //@line 2890
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 2893
        $179 = HEAP32[$178 >> 2] | 0; //@line 2894
        if (!$179) {
         $$3$i = 0; //@line 2897
         break;
        } else {
         $$1196$i = $179; //@line 2900
         $$1198$i = $178; //@line 2900
        }
       } else {
        $$1196$i = $176; //@line 2903
        $$1198$i = $175; //@line 2903
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 2906
        $182 = HEAP32[$181 >> 2] | 0; //@line 2907
        if ($182 | 0) {
         $$1196$i = $182; //@line 2910
         $$1198$i = $181; //@line 2910
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 2913
        $185 = HEAP32[$184 >> 2] | 0; //@line 2914
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 2919
         $$1198$i = $184; //@line 2919
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 2924
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 2927
        $$3$i = $$1196$i; //@line 2928
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 2933
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 2936
       }
       $169 = $167 + 12 | 0; //@line 2939
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 2943
       }
       $172 = $164 + 8 | 0; //@line 2946
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 2950
        HEAP32[$172 >> 2] = $167; //@line 2951
        $$3$i = $164; //@line 2952
        break;
       } else {
        _abort(); //@line 2955
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 2964
       $191 = 5012 + ($190 << 2) | 0; //@line 2965
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 2970
         if (!$$3$i) {
          HEAP32[1178] = $108 & ~(1 << $190); //@line 2976
          break L73;
         }
        } else {
         if ((HEAP32[1181] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 2983
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 2991
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1181] | 0; //@line 3001
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 3004
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 3008
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 3010
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 3016
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 3020
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 3022
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 3028
       if ($214 | 0) {
        if ((HEAP32[1181] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 3034
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 3038
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 3040
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 3048
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 3051
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 3053
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 3056
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 3060
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 3063
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 3065
      if ($37 | 0) {
       $234 = HEAP32[1182] | 0; //@line 3068
       $235 = $37 >>> 3; //@line 3069
       $237 = 4748 + ($235 << 1 << 2) | 0; //@line 3071
       $238 = 1 << $235; //@line 3072
       if (!($8 & $238)) {
        HEAP32[1177] = $8 | $238; //@line 3077
        $$0189$i = $237; //@line 3079
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 3079
       } else {
        $242 = $237 + 8 | 0; //@line 3081
        $243 = HEAP32[$242 >> 2] | 0; //@line 3082
        if ((HEAP32[1181] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 3086
        } else {
         $$0189$i = $243; //@line 3089
         $$pre$phi$iZ2D = $242; //@line 3089
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 3092
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 3094
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 3096
       HEAP32[$234 + 12 >> 2] = $237; //@line 3098
      }
      HEAP32[1179] = $$0193$lcssa$i; //@line 3100
      HEAP32[1182] = $159; //@line 3101
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 3104
     STACKTOP = sp; //@line 3105
     return $$0 | 0; //@line 3105
    }
   } else {
    $$0197 = $6; //@line 3108
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 3113
   } else {
    $251 = $0 + 11 | 0; //@line 3115
    $252 = $251 & -8; //@line 3116
    $253 = HEAP32[1178] | 0; //@line 3117
    if (!$253) {
     $$0197 = $252; //@line 3120
    } else {
     $255 = 0 - $252 | 0; //@line 3122
     $256 = $251 >>> 8; //@line 3123
     if (!$256) {
      $$0358$i = 0; //@line 3126
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 3130
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 3134
       $262 = $256 << $261; //@line 3135
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 3138
       $267 = $262 << $265; //@line 3140
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 3143
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 3148
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 3154
      }
     }
     $282 = HEAP32[5012 + ($$0358$i << 2) >> 2] | 0; //@line 3158
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 3162
       $$3$i203 = 0; //@line 3162
       $$3350$i = $255; //@line 3162
       label = 81; //@line 3163
      } else {
       $$0342$i = 0; //@line 3170
       $$0347$i = $255; //@line 3170
       $$0353$i = $282; //@line 3170
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 3170
       $$0362$i = 0; //@line 3170
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 3175
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 3180
          $$435113$i = 0; //@line 3180
          $$435712$i = $$0353$i; //@line 3180
          label = 85; //@line 3181
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 3184
          $$1348$i = $292; //@line 3184
         }
        } else {
         $$1343$i = $$0342$i; //@line 3187
         $$1348$i = $$0347$i; //@line 3187
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 3190
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 3193
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 3197
        $302 = ($$0353$i | 0) == 0; //@line 3198
        if ($302) {
         $$2355$i = $$1363$i; //@line 3203
         $$3$i203 = $$1343$i; //@line 3203
         $$3350$i = $$1348$i; //@line 3203
         label = 81; //@line 3204
         break;
        } else {
         $$0342$i = $$1343$i; //@line 3207
         $$0347$i = $$1348$i; //@line 3207
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 3207
         $$0362$i = $$1363$i; //@line 3207
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 3217
       $309 = $253 & ($306 | 0 - $306); //@line 3220
       if (!$309) {
        $$0197 = $252; //@line 3223
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 3228
       $315 = $313 >>> 12 & 16; //@line 3230
       $316 = $313 >>> $315; //@line 3231
       $318 = $316 >>> 5 & 8; //@line 3233
       $320 = $316 >>> $318; //@line 3235
       $322 = $320 >>> 2 & 4; //@line 3237
       $324 = $320 >>> $322; //@line 3239
       $326 = $324 >>> 1 & 2; //@line 3241
       $328 = $324 >>> $326; //@line 3243
       $330 = $328 >>> 1 & 1; //@line 3245
       $$4$ph$i = 0; //@line 3251
       $$4357$ph$i = HEAP32[5012 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 3251
      } else {
       $$4$ph$i = $$3$i203; //@line 3253
       $$4357$ph$i = $$2355$i; //@line 3253
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 3257
       $$4351$lcssa$i = $$3350$i; //@line 3257
      } else {
       $$414$i = $$4$ph$i; //@line 3259
       $$435113$i = $$3350$i; //@line 3259
       $$435712$i = $$4357$ph$i; //@line 3259
       label = 85; //@line 3260
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 3265
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 3269
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 3270
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 3271
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 3272
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 3278
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 3281
        $$4351$lcssa$i = $$$4351$i; //@line 3281
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 3284
        $$435113$i = $$$4351$i; //@line 3284
        label = 85; //@line 3285
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 3291
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1179] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1181] | 0; //@line 3297
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 3300
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 3303
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 3306
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 3310
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 3312
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 3316
         $371 = HEAP32[$370 >> 2] | 0; //@line 3317
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 3320
          $374 = HEAP32[$373 >> 2] | 0; //@line 3321
          if (!$374) {
           $$3372$i = 0; //@line 3324
           break;
          } else {
           $$1370$i = $374; //@line 3327
           $$1374$i = $373; //@line 3327
          }
         } else {
          $$1370$i = $371; //@line 3330
          $$1374$i = $370; //@line 3330
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 3333
          $377 = HEAP32[$376 >> 2] | 0; //@line 3334
          if ($377 | 0) {
           $$1370$i = $377; //@line 3337
           $$1374$i = $376; //@line 3337
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 3340
          $380 = HEAP32[$379 >> 2] | 0; //@line 3341
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 3346
           $$1374$i = $379; //@line 3346
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 3351
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 3354
          $$3372$i = $$1370$i; //@line 3355
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 3360
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 3363
         }
         $364 = $362 + 12 | 0; //@line 3366
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 3370
         }
         $367 = $359 + 8 | 0; //@line 3373
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 3377
          HEAP32[$367 >> 2] = $362; //@line 3378
          $$3372$i = $359; //@line 3379
          break;
         } else {
          _abort(); //@line 3382
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 3390
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 3393
         $386 = 5012 + ($385 << 2) | 0; //@line 3394
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 3399
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 3404
            HEAP32[1178] = $391; //@line 3405
            $475 = $391; //@line 3406
            break L164;
           }
          } else {
           if ((HEAP32[1181] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 3413
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 3421
            if (!$$3372$i) {
             $475 = $253; //@line 3424
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1181] | 0; //@line 3432
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 3435
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 3439
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 3441
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 3447
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 3451
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 3453
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 3459
         if (!$409) {
          $475 = $253; //@line 3462
         } else {
          if ((HEAP32[1181] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 3467
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 3471
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 3473
           $475 = $253; //@line 3474
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 3483
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 3486
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 3488
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 3491
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 3495
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 3498
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 3500
         $428 = $$4351$lcssa$i >>> 3; //@line 3501
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 4748 + ($428 << 1 << 2) | 0; //@line 3505
          $432 = HEAP32[1177] | 0; //@line 3506
          $433 = 1 << $428; //@line 3507
          if (!($432 & $433)) {
           HEAP32[1177] = $432 | $433; //@line 3512
           $$0368$i = $431; //@line 3514
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 3514
          } else {
           $437 = $431 + 8 | 0; //@line 3516
           $438 = HEAP32[$437 >> 2] | 0; //@line 3517
           if ((HEAP32[1181] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 3521
           } else {
            $$0368$i = $438; //@line 3524
            $$pre$phi$i211Z2D = $437; //@line 3524
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 3527
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 3529
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 3531
          HEAP32[$354 + 12 >> 2] = $431; //@line 3533
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 3536
         if (!$444) {
          $$0361$i = 0; //@line 3539
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 3543
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 3547
           $450 = $444 << $449; //@line 3548
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 3551
           $455 = $450 << $453; //@line 3553
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 3556
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 3561
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 3567
          }
         }
         $469 = 5012 + ($$0361$i << 2) | 0; //@line 3570
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 3572
         $471 = $354 + 16 | 0; //@line 3573
         HEAP32[$471 + 4 >> 2] = 0; //@line 3575
         HEAP32[$471 >> 2] = 0; //@line 3576
         $473 = 1 << $$0361$i; //@line 3577
         if (!($475 & $473)) {
          HEAP32[1178] = $475 | $473; //@line 3582
          HEAP32[$469 >> 2] = $354; //@line 3583
          HEAP32[$354 + 24 >> 2] = $469; //@line 3585
          HEAP32[$354 + 12 >> 2] = $354; //@line 3587
          HEAP32[$354 + 8 >> 2] = $354; //@line 3589
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 3598
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 3598
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 3605
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 3609
          $494 = HEAP32[$492 >> 2] | 0; //@line 3611
          if (!$494) {
           label = 136; //@line 3614
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 3617
           $$0345$i = $494; //@line 3617
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1181] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 3624
          } else {
           HEAP32[$492 >> 2] = $354; //@line 3627
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 3629
           HEAP32[$354 + 12 >> 2] = $354; //@line 3631
           HEAP32[$354 + 8 >> 2] = $354; //@line 3633
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 3638
          $502 = HEAP32[$501 >> 2] | 0; //@line 3639
          $503 = HEAP32[1181] | 0; //@line 3640
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 3646
           HEAP32[$501 >> 2] = $354; //@line 3647
           HEAP32[$354 + 8 >> 2] = $502; //@line 3649
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 3651
           HEAP32[$354 + 24 >> 2] = 0; //@line 3653
           break;
          } else {
           _abort(); //@line 3656
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 3663
       STACKTOP = sp; //@line 3664
       return $$0 | 0; //@line 3664
      } else {
       $$0197 = $252; //@line 3666
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1179] | 0; //@line 3673
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 3676
  $515 = HEAP32[1182] | 0; //@line 3677
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 3680
   HEAP32[1182] = $517; //@line 3681
   HEAP32[1179] = $514; //@line 3682
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 3685
   HEAP32[$515 + $512 >> 2] = $514; //@line 3687
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 3690
  } else {
   HEAP32[1179] = 0; //@line 3692
   HEAP32[1182] = 0; //@line 3693
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 3696
   $526 = $515 + $512 + 4 | 0; //@line 3698
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 3701
  }
  $$0 = $515 + 8 | 0; //@line 3704
  STACKTOP = sp; //@line 3705
  return $$0 | 0; //@line 3705
 }
 $530 = HEAP32[1180] | 0; //@line 3707
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 3710
  HEAP32[1180] = $532; //@line 3711
  $533 = HEAP32[1183] | 0; //@line 3712
  $534 = $533 + $$0197 | 0; //@line 3713
  HEAP32[1183] = $534; //@line 3714
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 3717
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 3720
  $$0 = $533 + 8 | 0; //@line 3722
  STACKTOP = sp; //@line 3723
  return $$0 | 0; //@line 3723
 }
 if (!(HEAP32[1295] | 0)) {
  HEAP32[1297] = 4096; //@line 3728
  HEAP32[1296] = 4096; //@line 3729
  HEAP32[1298] = -1; //@line 3730
  HEAP32[1299] = -1; //@line 3731
  HEAP32[1300] = 0; //@line 3732
  HEAP32[1288] = 0; //@line 3733
  HEAP32[1295] = $1 & -16 ^ 1431655768; //@line 3737
  $548 = 4096; //@line 3738
 } else {
  $548 = HEAP32[1297] | 0; //@line 3741
 }
 $545 = $$0197 + 48 | 0; //@line 3743
 $546 = $$0197 + 47 | 0; //@line 3744
 $547 = $548 + $546 | 0; //@line 3745
 $549 = 0 - $548 | 0; //@line 3746
 $550 = $547 & $549; //@line 3747
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 3750
  STACKTOP = sp; //@line 3751
  return $$0 | 0; //@line 3751
 }
 $552 = HEAP32[1287] | 0; //@line 3753
 if ($552 | 0) {
  $554 = HEAP32[1285] | 0; //@line 3756
  $555 = $554 + $550 | 0; //@line 3757
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 3762
   STACKTOP = sp; //@line 3763
   return $$0 | 0; //@line 3763
  }
 }
 L244 : do {
  if (!(HEAP32[1288] & 4)) {
   $561 = HEAP32[1183] | 0; //@line 3771
   L246 : do {
    if (!$561) {
     label = 163; //@line 3775
    } else {
     $$0$i$i = 5156; //@line 3777
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 3779
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 3782
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 3791
      if (!$570) {
       label = 163; //@line 3794
       break L246;
      } else {
       $$0$i$i = $570; //@line 3797
      }
     }
     $595 = $547 - $530 & $549; //@line 3801
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 3804
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 3812
       } else {
        $$723947$i = $595; //@line 3814
        $$748$i = $597; //@line 3814
        label = 180; //@line 3815
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 3819
       $$2253$ph$i = $595; //@line 3819
       label = 171; //@line 3820
      }
     } else {
      $$2234243136$i = 0; //@line 3823
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 3829
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 3832
     } else {
      $574 = $572; //@line 3834
      $575 = HEAP32[1296] | 0; //@line 3835
      $576 = $575 + -1 | 0; //@line 3836
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 3844
      $584 = HEAP32[1285] | 0; //@line 3845
      $585 = $$$i + $584 | 0; //@line 3846
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1287] | 0; //@line 3851
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 3858
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 3862
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 3865
        $$748$i = $572; //@line 3865
        label = 180; //@line 3866
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 3869
        $$2253$ph$i = $$$i; //@line 3869
        label = 171; //@line 3870
       }
      } else {
       $$2234243136$i = 0; //@line 3873
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 3880
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 3889
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 3892
       $$748$i = $$2247$ph$i; //@line 3892
       label = 180; //@line 3893
       break L244;
      }
     }
     $607 = HEAP32[1297] | 0; //@line 3897
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 3901
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 3904
      $$748$i = $$2247$ph$i; //@line 3904
      label = 180; //@line 3905
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 3911
      $$2234243136$i = 0; //@line 3912
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 3916
      $$748$i = $$2247$ph$i; //@line 3916
      label = 180; //@line 3917
      break L244;
     }
    }
   } while (0);
   HEAP32[1288] = HEAP32[1288] | 4; //@line 3924
   $$4236$i = $$2234243136$i; //@line 3925
   label = 178; //@line 3926
  } else {
   $$4236$i = 0; //@line 3928
   label = 178; //@line 3929
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 3935
   $621 = _sbrk(0) | 0; //@line 3936
   $627 = $621 - $620 | 0; //@line 3944
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 3946
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 3954
    $$748$i = $620; //@line 3954
    label = 180; //@line 3955
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1285] | 0) + $$723947$i | 0; //@line 3961
  HEAP32[1285] = $633; //@line 3962
  if ($633 >>> 0 > (HEAP32[1286] | 0) >>> 0) {
   HEAP32[1286] = $633; //@line 3966
  }
  $636 = HEAP32[1183] | 0; //@line 3968
  do {
   if (!$636) {
    $638 = HEAP32[1181] | 0; //@line 3972
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1181] = $$748$i; //@line 3977
    }
    HEAP32[1289] = $$748$i; //@line 3979
    HEAP32[1290] = $$723947$i; //@line 3980
    HEAP32[1292] = 0; //@line 3981
    HEAP32[1186] = HEAP32[1295]; //@line 3983
    HEAP32[1185] = -1; //@line 3984
    HEAP32[1190] = 4748; //@line 3985
    HEAP32[1189] = 4748; //@line 3986
    HEAP32[1192] = 4756; //@line 3987
    HEAP32[1191] = 4756; //@line 3988
    HEAP32[1194] = 4764; //@line 3989
    HEAP32[1193] = 4764; //@line 3990
    HEAP32[1196] = 4772; //@line 3991
    HEAP32[1195] = 4772; //@line 3992
    HEAP32[1198] = 4780; //@line 3993
    HEAP32[1197] = 4780; //@line 3994
    HEAP32[1200] = 4788; //@line 3995
    HEAP32[1199] = 4788; //@line 3996
    HEAP32[1202] = 4796; //@line 3997
    HEAP32[1201] = 4796; //@line 3998
    HEAP32[1204] = 4804; //@line 3999
    HEAP32[1203] = 4804; //@line 4000
    HEAP32[1206] = 4812; //@line 4001
    HEAP32[1205] = 4812; //@line 4002
    HEAP32[1208] = 4820; //@line 4003
    HEAP32[1207] = 4820; //@line 4004
    HEAP32[1210] = 4828; //@line 4005
    HEAP32[1209] = 4828; //@line 4006
    HEAP32[1212] = 4836; //@line 4007
    HEAP32[1211] = 4836; //@line 4008
    HEAP32[1214] = 4844; //@line 4009
    HEAP32[1213] = 4844; //@line 4010
    HEAP32[1216] = 4852; //@line 4011
    HEAP32[1215] = 4852; //@line 4012
    HEAP32[1218] = 4860; //@line 4013
    HEAP32[1217] = 4860; //@line 4014
    HEAP32[1220] = 4868; //@line 4015
    HEAP32[1219] = 4868; //@line 4016
    HEAP32[1222] = 4876; //@line 4017
    HEAP32[1221] = 4876; //@line 4018
    HEAP32[1224] = 4884; //@line 4019
    HEAP32[1223] = 4884; //@line 4020
    HEAP32[1226] = 4892; //@line 4021
    HEAP32[1225] = 4892; //@line 4022
    HEAP32[1228] = 4900; //@line 4023
    HEAP32[1227] = 4900; //@line 4024
    HEAP32[1230] = 4908; //@line 4025
    HEAP32[1229] = 4908; //@line 4026
    HEAP32[1232] = 4916; //@line 4027
    HEAP32[1231] = 4916; //@line 4028
    HEAP32[1234] = 4924; //@line 4029
    HEAP32[1233] = 4924; //@line 4030
    HEAP32[1236] = 4932; //@line 4031
    HEAP32[1235] = 4932; //@line 4032
    HEAP32[1238] = 4940; //@line 4033
    HEAP32[1237] = 4940; //@line 4034
    HEAP32[1240] = 4948; //@line 4035
    HEAP32[1239] = 4948; //@line 4036
    HEAP32[1242] = 4956; //@line 4037
    HEAP32[1241] = 4956; //@line 4038
    HEAP32[1244] = 4964; //@line 4039
    HEAP32[1243] = 4964; //@line 4040
    HEAP32[1246] = 4972; //@line 4041
    HEAP32[1245] = 4972; //@line 4042
    HEAP32[1248] = 4980; //@line 4043
    HEAP32[1247] = 4980; //@line 4044
    HEAP32[1250] = 4988; //@line 4045
    HEAP32[1249] = 4988; //@line 4046
    HEAP32[1252] = 4996; //@line 4047
    HEAP32[1251] = 4996; //@line 4048
    $642 = $$723947$i + -40 | 0; //@line 4049
    $644 = $$748$i + 8 | 0; //@line 4051
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 4056
    $650 = $$748$i + $649 | 0; //@line 4057
    $651 = $642 - $649 | 0; //@line 4058
    HEAP32[1183] = $650; //@line 4059
    HEAP32[1180] = $651; //@line 4060
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 4063
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 4066
    HEAP32[1184] = HEAP32[1299]; //@line 4068
   } else {
    $$024367$i = 5156; //@line 4070
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 4072
     $658 = $$024367$i + 4 | 0; //@line 4073
     $659 = HEAP32[$658 >> 2] | 0; //@line 4074
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 4078
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 4082
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 4087
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 4101
       $673 = (HEAP32[1180] | 0) + $$723947$i | 0; //@line 4103
       $675 = $636 + 8 | 0; //@line 4105
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 4110
       $681 = $636 + $680 | 0; //@line 4111
       $682 = $673 - $680 | 0; //@line 4112
       HEAP32[1183] = $681; //@line 4113
       HEAP32[1180] = $682; //@line 4114
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 4117
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 4120
       HEAP32[1184] = HEAP32[1299]; //@line 4122
       break;
      }
     }
    }
    $688 = HEAP32[1181] | 0; //@line 4127
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1181] = $$748$i; //@line 4130
     $753 = $$748$i; //@line 4131
    } else {
     $753 = $688; //@line 4133
    }
    $690 = $$748$i + $$723947$i | 0; //@line 4135
    $$124466$i = 5156; //@line 4136
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 4141
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 4145
     if (!$694) {
      $$0$i$i$i = 5156; //@line 4148
      break;
     } else {
      $$124466$i = $694; //@line 4151
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 4160
      $700 = $$124466$i + 4 | 0; //@line 4161
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 4164
      $704 = $$748$i + 8 | 0; //@line 4166
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 4172
      $712 = $690 + 8 | 0; //@line 4174
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 4180
      $722 = $710 + $$0197 | 0; //@line 4184
      $723 = $718 - $710 - $$0197 | 0; //@line 4185
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 4188
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1180] | 0) + $723 | 0; //@line 4193
        HEAP32[1180] = $728; //@line 4194
        HEAP32[1183] = $722; //@line 4195
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 4198
       } else {
        if ((HEAP32[1182] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1179] | 0) + $723 | 0; //@line 4204
         HEAP32[1179] = $734; //@line 4205
         HEAP32[1182] = $722; //@line 4206
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 4209
         HEAP32[$722 + $734 >> 2] = $734; //@line 4211
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 4215
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 4219
         $743 = $739 >>> 3; //@line 4220
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 4225
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 4227
           $750 = 4748 + ($743 << 1 << 2) | 0; //@line 4229
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 4235
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 4244
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1177] = HEAP32[1177] & ~(1 << $743); //@line 4254
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 4261
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 4265
             }
             $764 = $748 + 8 | 0; //@line 4268
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 4272
              break;
             }
             _abort(); //@line 4275
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 4280
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 4281
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 4284
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 4286
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 4290
             $783 = $782 + 4 | 0; //@line 4291
             $784 = HEAP32[$783 >> 2] | 0; //@line 4292
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 4295
              if (!$786) {
               $$3$i$i = 0; //@line 4298
               break;
              } else {
               $$1291$i$i = $786; //@line 4301
               $$1293$i$i = $782; //@line 4301
              }
             } else {
              $$1291$i$i = $784; //@line 4304
              $$1293$i$i = $783; //@line 4304
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 4307
              $789 = HEAP32[$788 >> 2] | 0; //@line 4308
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 4311
               $$1293$i$i = $788; //@line 4311
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 4314
              $792 = HEAP32[$791 >> 2] | 0; //@line 4315
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 4320
               $$1293$i$i = $791; //@line 4320
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 4325
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 4328
              $$3$i$i = $$1291$i$i; //@line 4329
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 4334
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 4337
             }
             $776 = $774 + 12 | 0; //@line 4340
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 4344
             }
             $779 = $771 + 8 | 0; //@line 4347
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 4351
              HEAP32[$779 >> 2] = $774; //@line 4352
              $$3$i$i = $771; //@line 4353
              break;
             } else {
              _abort(); //@line 4356
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 4366
           $798 = 5012 + ($797 << 2) | 0; //@line 4367
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 4372
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1178] = HEAP32[1178] & ~(1 << $797); //@line 4381
             break L311;
            } else {
             if ((HEAP32[1181] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 4387
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 4395
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1181] | 0; //@line 4405
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 4408
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 4412
           $815 = $718 + 16 | 0; //@line 4413
           $816 = HEAP32[$815 >> 2] | 0; //@line 4414
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 4420
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 4424
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 4426
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 4432
           if (!$822) {
            break;
           }
           if ((HEAP32[1181] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 4440
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 4444
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 4446
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 4453
         $$0287$i$i = $742 + $723 | 0; //@line 4453
        } else {
         $$0$i17$i = $718; //@line 4455
         $$0287$i$i = $723; //@line 4455
        }
        $830 = $$0$i17$i + 4 | 0; //@line 4457
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 4460
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 4463
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 4465
        $836 = $$0287$i$i >>> 3; //@line 4466
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 4748 + ($836 << 1 << 2) | 0; //@line 4470
         $840 = HEAP32[1177] | 0; //@line 4471
         $841 = 1 << $836; //@line 4472
         do {
          if (!($840 & $841)) {
           HEAP32[1177] = $840 | $841; //@line 4478
           $$0295$i$i = $839; //@line 4480
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 4480
          } else {
           $845 = $839 + 8 | 0; //@line 4482
           $846 = HEAP32[$845 >> 2] | 0; //@line 4483
           if ((HEAP32[1181] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 4487
            $$pre$phi$i19$iZ2D = $845; //@line 4487
            break;
           }
           _abort(); //@line 4490
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 4494
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 4496
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 4498
         HEAP32[$722 + 12 >> 2] = $839; //@line 4500
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 4503
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 4507
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 4511
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 4516
          $858 = $852 << $857; //@line 4517
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 4520
          $863 = $858 << $861; //@line 4522
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 4525
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 4530
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 4536
         }
        } while (0);
        $877 = 5012 + ($$0296$i$i << 2) | 0; //@line 4539
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 4541
        $879 = $722 + 16 | 0; //@line 4542
        HEAP32[$879 + 4 >> 2] = 0; //@line 4544
        HEAP32[$879 >> 2] = 0; //@line 4545
        $881 = HEAP32[1178] | 0; //@line 4546
        $882 = 1 << $$0296$i$i; //@line 4547
        if (!($881 & $882)) {
         HEAP32[1178] = $881 | $882; //@line 4552
         HEAP32[$877 >> 2] = $722; //@line 4553
         HEAP32[$722 + 24 >> 2] = $877; //@line 4555
         HEAP32[$722 + 12 >> 2] = $722; //@line 4557
         HEAP32[$722 + 8 >> 2] = $722; //@line 4559
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 4568
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 4568
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 4575
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 4579
         $902 = HEAP32[$900 >> 2] | 0; //@line 4581
         if (!$902) {
          label = 260; //@line 4584
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 4587
          $$0289$i$i = $902; //@line 4587
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1181] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 4594
         } else {
          HEAP32[$900 >> 2] = $722; //@line 4597
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 4599
          HEAP32[$722 + 12 >> 2] = $722; //@line 4601
          HEAP32[$722 + 8 >> 2] = $722; //@line 4603
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 4608
         $910 = HEAP32[$909 >> 2] | 0; //@line 4609
         $911 = HEAP32[1181] | 0; //@line 4610
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 4616
          HEAP32[$909 >> 2] = $722; //@line 4617
          HEAP32[$722 + 8 >> 2] = $910; //@line 4619
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 4621
          HEAP32[$722 + 24 >> 2] = 0; //@line 4623
          break;
         } else {
          _abort(); //@line 4626
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 4633
      STACKTOP = sp; //@line 4634
      return $$0 | 0; //@line 4634
     } else {
      $$0$i$i$i = 5156; //@line 4636
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 4640
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 4645
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 4653
    }
    $927 = $923 + -47 | 0; //@line 4655
    $929 = $927 + 8 | 0; //@line 4657
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 4663
    $936 = $636 + 16 | 0; //@line 4664
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 4666
    $939 = $938 + 8 | 0; //@line 4667
    $940 = $938 + 24 | 0; //@line 4668
    $941 = $$723947$i + -40 | 0; //@line 4669
    $943 = $$748$i + 8 | 0; //@line 4671
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 4676
    $949 = $$748$i + $948 | 0; //@line 4677
    $950 = $941 - $948 | 0; //@line 4678
    HEAP32[1183] = $949; //@line 4679
    HEAP32[1180] = $950; //@line 4680
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 4683
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 4686
    HEAP32[1184] = HEAP32[1299]; //@line 4688
    $956 = $938 + 4 | 0; //@line 4689
    HEAP32[$956 >> 2] = 27; //@line 4690
    HEAP32[$939 >> 2] = HEAP32[1289]; //@line 4691
    HEAP32[$939 + 4 >> 2] = HEAP32[1290]; //@line 4691
    HEAP32[$939 + 8 >> 2] = HEAP32[1291]; //@line 4691
    HEAP32[$939 + 12 >> 2] = HEAP32[1292]; //@line 4691
    HEAP32[1289] = $$748$i; //@line 4692
    HEAP32[1290] = $$723947$i; //@line 4693
    HEAP32[1292] = 0; //@line 4694
    HEAP32[1291] = $939; //@line 4695
    $958 = $940; //@line 4696
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 4698
     HEAP32[$958 >> 2] = 7; //@line 4699
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 4712
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 4715
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 4718
     HEAP32[$938 >> 2] = $964; //@line 4719
     $969 = $964 >>> 3; //@line 4720
     if ($964 >>> 0 < 256) {
      $972 = 4748 + ($969 << 1 << 2) | 0; //@line 4724
      $973 = HEAP32[1177] | 0; //@line 4725
      $974 = 1 << $969; //@line 4726
      if (!($973 & $974)) {
       HEAP32[1177] = $973 | $974; //@line 4731
       $$0211$i$i = $972; //@line 4733
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 4733
      } else {
       $978 = $972 + 8 | 0; //@line 4735
       $979 = HEAP32[$978 >> 2] | 0; //@line 4736
       if ((HEAP32[1181] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 4740
       } else {
        $$0211$i$i = $979; //@line 4743
        $$pre$phi$i$iZ2D = $978; //@line 4743
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 4746
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 4748
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 4750
      HEAP32[$636 + 12 >> 2] = $972; //@line 4752
      break;
     }
     $985 = $964 >>> 8; //@line 4755
     if (!$985) {
      $$0212$i$i = 0; //@line 4758
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 4762
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 4766
       $991 = $985 << $990; //@line 4767
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 4770
       $996 = $991 << $994; //@line 4772
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 4775
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 4780
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 4786
      }
     }
     $1010 = 5012 + ($$0212$i$i << 2) | 0; //@line 4789
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 4791
     HEAP32[$636 + 20 >> 2] = 0; //@line 4793
     HEAP32[$936 >> 2] = 0; //@line 4794
     $1013 = HEAP32[1178] | 0; //@line 4795
     $1014 = 1 << $$0212$i$i; //@line 4796
     if (!($1013 & $1014)) {
      HEAP32[1178] = $1013 | $1014; //@line 4801
      HEAP32[$1010 >> 2] = $636; //@line 4802
      HEAP32[$636 + 24 >> 2] = $1010; //@line 4804
      HEAP32[$636 + 12 >> 2] = $636; //@line 4806
      HEAP32[$636 + 8 >> 2] = $636; //@line 4808
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 4817
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 4817
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 4824
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 4828
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 4830
      if (!$1034) {
       label = 286; //@line 4833
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 4836
       $$0207$i$i = $1034; //@line 4836
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1181] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 4843
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 4846
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 4848
       HEAP32[$636 + 12 >> 2] = $636; //@line 4850
       HEAP32[$636 + 8 >> 2] = $636; //@line 4852
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 4857
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 4858
      $1043 = HEAP32[1181] | 0; //@line 4859
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 4865
       HEAP32[$1041 >> 2] = $636; //@line 4866
       HEAP32[$636 + 8 >> 2] = $1042; //@line 4868
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 4870
       HEAP32[$636 + 24 >> 2] = 0; //@line 4872
       break;
      } else {
       _abort(); //@line 4875
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1180] | 0; //@line 4882
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 4885
   HEAP32[1180] = $1054; //@line 4886
   $1055 = HEAP32[1183] | 0; //@line 4887
   $1056 = $1055 + $$0197 | 0; //@line 4888
   HEAP32[1183] = $1056; //@line 4889
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 4892
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 4895
   $$0 = $1055 + 8 | 0; //@line 4897
   STACKTOP = sp; //@line 4898
   return $$0 | 0; //@line 4898
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 4902
 $$0 = 0; //@line 4903
 STACKTOP = sp; //@line 4904
 return $$0 | 0; //@line 4904
}
function _equeue_dispatch__async_cb_8($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$03956$i = 0, $$03956$i$phi = 0, $$04055$i = 0, $$0405571$i = 0, $$04063$i = 0, $$04159$i = 0, $$04258$i = 0, $$057$i = 0, $$065 = 0, $$06790 = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val11 = 0, $$expand_i1_val13 = 0, $$expand_i1_val9 = 0, $$sink$in$i$i = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i73 = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i72 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $12 = 0, $127 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $150 = 0, $152 = 0, $153 = 0, $154 = 0, $156 = 0, $157 = 0, $16 = 0, $165 = 0, $166 = 0, $168 = 0, $171 = 0, $173 = 0, $176 = 0, $179 = 0, $18 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $190 = 0, $193 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $4 = 0, $44 = 0, $45 = 0, $48 = 0, $54 = 0, $6 = 0, $63 = 0, $66 = 0, $67 = 0, $69 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $93 = 0, $95 = 0, $98 = 0, $99 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0, $$04159$i$looptemp = 0, $$04258$i$looptemp = 0;
 sp = STACKTOP; //@line 15
 $2 = HEAP8[$0 + 4 >> 0] & 1; //@line 18
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 20
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 22
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 24
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 26
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 28
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 30
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 32
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 34
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 36
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 38
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 40
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 42
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 44
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 46
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 48
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 50
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 52
 _equeue_mutex_lock($8); //@line 53
 HEAP8[$28 >> 0] = (HEAPU8[$28 >> 0] | 0) + 1; //@line 58
 if (((HEAP32[$26 >> 2] | 0) - $36 | 0) < 1) {
  HEAP32[$26 >> 2] = $36; //@line 63
 }
 $44 = HEAP32[$22 >> 2] | 0; //@line 65
 HEAP32[$24 >> 2] = $44; //@line 66
 $45 = $44; //@line 67
 L6 : do {
  if (!$44) {
   $$04055$i = $14; //@line 71
   $54 = $45; //@line 71
   label = 8; //@line 72
  } else {
   $$04063$i = $14; //@line 74
   $48 = $45; //@line 74
   do {
    if (((HEAP32[$48 + 20 >> 2] | 0) - $36 | 0) >= 1) {
     $$04055$i = $$04063$i; //@line 81
     $54 = $48; //@line 81
     label = 8; //@line 82
     break L6;
    }
    $$04063$i = $48 + 8 | 0; //@line 85
    $48 = HEAP32[$$04063$i >> 2] | 0; //@line 86
   } while (($48 | 0) != 0);
   HEAP32[$10 >> 2] = 0; //@line 94
   $$0405571$i = $$04063$i; //@line 95
  }
 } while (0);
 if ((label | 0) == 8) {
  HEAP32[$10 >> 2] = $54; //@line 99
  if (!$54) {
   $$0405571$i = $$04055$i; //@line 102
  } else {
   HEAP32[$54 + 16 >> 2] = $10; //@line 105
   $$0405571$i = $$04055$i; //@line 106
  }
 }
 HEAP32[$$0405571$i >> 2] = 0; //@line 109
 _equeue_mutex_unlock($8); //@line 110
 $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i72 = HEAP32[$14 >> 2] | 0; //@line 111
 L15 : do {
  if (!$$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i72) {} else {
   $$04159$i = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i72; //@line 116
   $$04258$i = $14; //@line 116
   do {
    $$04258$i$looptemp = $$04258$i;
    $$04258$i = $$04159$i + 8 | 0; //@line 118
    $$04159$i$looptemp = $$04159$i;
    $$04159$i = HEAP32[$$04258$i >> 2] | 0; //@line 119
    $$03956$i = 0; //@line 120
    $$057$i = $$04159$i$looptemp; //@line 120
    while (1) {
     HEAP32[$$057$i + 8 >> 2] = $$03956$i; //@line 123
     $63 = HEAP32[$$057$i + 12 >> 2] | 0; //@line 125
     if (!$63) {
      break;
     } else {
      $$03956$i$phi = $$057$i; //@line 130
      $$057$i = $63; //@line 130
      $$03956$i = $$03956$i$phi; //@line 130
     }
    }
    HEAP32[$$04258$i$looptemp >> 2] = $$057$i; //@line 133
   } while (($$04159$i | 0) != 0);
   $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i73 = HEAP32[$14 >> 2] | 0; //@line 141
   if ($$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i73 | 0) {
    $$06790 = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i73; //@line 144
    while (1) {
     $66 = $$06790 + 8 | 0; //@line 146
     $67 = HEAP32[$66 >> 2] | 0; //@line 147
     $69 = HEAP32[$$06790 + 32 >> 2] | 0; //@line 149
     if ($69 | 0) {
      label = 17; //@line 152
      break;
     }
     $93 = HEAP32[$$06790 + 24 >> 2] | 0; //@line 156
     if (($93 | 0) > -1) {
      label = 21; //@line 159
      break;
     }
     $117 = $$06790 + 4 | 0; //@line 163
     $118 = HEAP8[$117 >> 0] | 0; //@line 164
     HEAP8[$117 >> 0] = (($118 + 1 & 255) << HEAP32[$30 >> 2] | 0) == 0 ? 1 : ($118 & 255) + 1 & 255; //@line 173
     $127 = HEAP32[$$06790 + 28 >> 2] | 0; //@line 175
     if ($127 | 0) {
      label = 25; //@line 178
      break;
     }
     _equeue_mutex_lock($16); //@line 181
     $150 = HEAP32[$18 >> 2] | 0; //@line 182
     L28 : do {
      if (!$150) {
       $$02329$i$i = $18; //@line 186
       label = 34; //@line 187
      } else {
       $152 = HEAP32[$$06790 >> 2] | 0; //@line 189
       $$025$i$i = $18; //@line 190
       $154 = $150; //@line 190
       while (1) {
        $153 = HEAP32[$154 >> 2] | 0; //@line 192
        if ($153 >>> 0 >= $152 >>> 0) {
         break;
        }
        $156 = $154 + 8 | 0; //@line 197
        $157 = HEAP32[$156 >> 2] | 0; //@line 198
        if (!$157) {
         $$02329$i$i = $156; //@line 201
         label = 34; //@line 202
         break L28;
        } else {
         $$025$i$i = $156; //@line 205
         $154 = $157; //@line 205
        }
       }
       if (($153 | 0) == ($152 | 0)) {
        HEAP32[$$06790 + 12 >> 2] = $154; //@line 211
        $$02330$i$i = $$025$i$i; //@line 214
        $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 214
       } else {
        $$02329$i$i = $$025$i$i; //@line 216
        label = 34; //@line 217
       }
      }
     } while (0);
     if ((label | 0) == 34) {
      label = 0; //@line 222
      HEAP32[$$06790 + 12 >> 2] = 0; //@line 224
      $$02330$i$i = $$02329$i$i; //@line 225
      $$sink$in$i$i = $$02329$i$i; //@line 225
     }
     HEAP32[$66 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 228
     HEAP32[$$02330$i$i >> 2] = $$06790; //@line 229
     _equeue_mutex_unlock($16); //@line 230
     if (!$67) {
      break L15;
     } else {
      $$06790 = $67; //@line 235
     }
    }
    if ((label | 0) == 17) {
     $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 240
     FUNCTION_TABLE_vi[$69 & 127]($$06790 + 36 | 0); //@line 241
     if (___async) {
      HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 244
      $72 = $ReallocAsyncCtx + 4 | 0; //@line 245
      HEAP32[$72 >> 2] = $67; //@line 246
      $73 = $ReallocAsyncCtx + 8 | 0; //@line 247
      $$expand_i1_val = $2 & 1; //@line 248
      HEAP8[$73 >> 0] = $$expand_i1_val; //@line 249
      $74 = $ReallocAsyncCtx + 12 | 0; //@line 250
      HEAP32[$74 >> 2] = $4; //@line 251
      $75 = $ReallocAsyncCtx + 16 | 0; //@line 252
      HEAP32[$75 >> 2] = $6; //@line 253
      $76 = $ReallocAsyncCtx + 20 | 0; //@line 254
      HEAP32[$76 >> 2] = $8; //@line 255
      $77 = $ReallocAsyncCtx + 24 | 0; //@line 256
      HEAP32[$77 >> 2] = $10; //@line 257
      $78 = $ReallocAsyncCtx + 28 | 0; //@line 258
      HEAP32[$78 >> 2] = $12; //@line 259
      $79 = $ReallocAsyncCtx + 32 | 0; //@line 260
      HEAP32[$79 >> 2] = $14; //@line 261
      $80 = $ReallocAsyncCtx + 36 | 0; //@line 262
      HEAP32[$80 >> 2] = $16; //@line 263
      $81 = $ReallocAsyncCtx + 40 | 0; //@line 264
      HEAP32[$81 >> 2] = $18; //@line 265
      $82 = $ReallocAsyncCtx + 44 | 0; //@line 266
      HEAP32[$82 >> 2] = $20; //@line 267
      $83 = $ReallocAsyncCtx + 48 | 0; //@line 268
      HEAP32[$83 >> 2] = $22; //@line 269
      $84 = $ReallocAsyncCtx + 52 | 0; //@line 270
      HEAP32[$84 >> 2] = $24; //@line 271
      $85 = $ReallocAsyncCtx + 56 | 0; //@line 272
      HEAP32[$85 >> 2] = $$06790; //@line 273
      $86 = $ReallocAsyncCtx + 60 | 0; //@line 274
      HEAP32[$86 >> 2] = $26; //@line 275
      $87 = $ReallocAsyncCtx + 64 | 0; //@line 276
      HEAP32[$87 >> 2] = $28; //@line 277
      $88 = $ReallocAsyncCtx + 68 | 0; //@line 278
      HEAP32[$88 >> 2] = $66; //@line 279
      $89 = $ReallocAsyncCtx + 72 | 0; //@line 280
      HEAP32[$89 >> 2] = $30; //@line 281
      $90 = $ReallocAsyncCtx + 76 | 0; //@line 282
      HEAP32[$90 >> 2] = $32; //@line 283
      $91 = $ReallocAsyncCtx + 80 | 0; //@line 284
      HEAP32[$91 >> 2] = $34; //@line 285
      sp = STACKTOP; //@line 286
      return;
     }
     ___async_unwind = 0; //@line 289
     HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 290
     $72 = $ReallocAsyncCtx + 4 | 0; //@line 291
     HEAP32[$72 >> 2] = $67; //@line 292
     $73 = $ReallocAsyncCtx + 8 | 0; //@line 293
     $$expand_i1_val = $2 & 1; //@line 294
     HEAP8[$73 >> 0] = $$expand_i1_val; //@line 295
     $74 = $ReallocAsyncCtx + 12 | 0; //@line 296
     HEAP32[$74 >> 2] = $4; //@line 297
     $75 = $ReallocAsyncCtx + 16 | 0; //@line 298
     HEAP32[$75 >> 2] = $6; //@line 299
     $76 = $ReallocAsyncCtx + 20 | 0; //@line 300
     HEAP32[$76 >> 2] = $8; //@line 301
     $77 = $ReallocAsyncCtx + 24 | 0; //@line 302
     HEAP32[$77 >> 2] = $10; //@line 303
     $78 = $ReallocAsyncCtx + 28 | 0; //@line 304
     HEAP32[$78 >> 2] = $12; //@line 305
     $79 = $ReallocAsyncCtx + 32 | 0; //@line 306
     HEAP32[$79 >> 2] = $14; //@line 307
     $80 = $ReallocAsyncCtx + 36 | 0; //@line 308
     HEAP32[$80 >> 2] = $16; //@line 309
     $81 = $ReallocAsyncCtx + 40 | 0; //@line 310
     HEAP32[$81 >> 2] = $18; //@line 311
     $82 = $ReallocAsyncCtx + 44 | 0; //@line 312
     HEAP32[$82 >> 2] = $20; //@line 313
     $83 = $ReallocAsyncCtx + 48 | 0; //@line 314
     HEAP32[$83 >> 2] = $22; //@line 315
     $84 = $ReallocAsyncCtx + 52 | 0; //@line 316
     HEAP32[$84 >> 2] = $24; //@line 317
     $85 = $ReallocAsyncCtx + 56 | 0; //@line 318
     HEAP32[$85 >> 2] = $$06790; //@line 319
     $86 = $ReallocAsyncCtx + 60 | 0; //@line 320
     HEAP32[$86 >> 2] = $26; //@line 321
     $87 = $ReallocAsyncCtx + 64 | 0; //@line 322
     HEAP32[$87 >> 2] = $28; //@line 323
     $88 = $ReallocAsyncCtx + 68 | 0; //@line 324
     HEAP32[$88 >> 2] = $66; //@line 325
     $89 = $ReallocAsyncCtx + 72 | 0; //@line 326
     HEAP32[$89 >> 2] = $30; //@line 327
     $90 = $ReallocAsyncCtx + 76 | 0; //@line 328
     HEAP32[$90 >> 2] = $32; //@line 329
     $91 = $ReallocAsyncCtx + 80 | 0; //@line 330
     HEAP32[$91 >> 2] = $34; //@line 331
     sp = STACKTOP; //@line 332
     return;
    } else if ((label | 0) == 21) {
     $95 = $$06790 + 20 | 0; //@line 336
     HEAP32[$95 >> 2] = (HEAP32[$95 >> 2] | 0) + $93; //@line 339
     $98 = _equeue_tick() | 0; //@line 340
     $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 341
     _equeue_enqueue($6, $$06790, $98) | 0; //@line 342
     if (___async) {
      HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 345
      $99 = $ReallocAsyncCtx4 + 4 | 0; //@line 346
      HEAP32[$99 >> 2] = $67; //@line 347
      $100 = $ReallocAsyncCtx4 + 8 | 0; //@line 348
      $$expand_i1_val9 = $2 & 1; //@line 349
      HEAP8[$100 >> 0] = $$expand_i1_val9; //@line 350
      $101 = $ReallocAsyncCtx4 + 12 | 0; //@line 351
      HEAP32[$101 >> 2] = $4; //@line 352
      $102 = $ReallocAsyncCtx4 + 16 | 0; //@line 353
      HEAP32[$102 >> 2] = $6; //@line 354
      $103 = $ReallocAsyncCtx4 + 20 | 0; //@line 355
      HEAP32[$103 >> 2] = $8; //@line 356
      $104 = $ReallocAsyncCtx4 + 24 | 0; //@line 357
      HEAP32[$104 >> 2] = $10; //@line 358
      $105 = $ReallocAsyncCtx4 + 28 | 0; //@line 359
      HEAP32[$105 >> 2] = $12; //@line 360
      $106 = $ReallocAsyncCtx4 + 32 | 0; //@line 361
      HEAP32[$106 >> 2] = $14; //@line 362
      $107 = $ReallocAsyncCtx4 + 36 | 0; //@line 363
      HEAP32[$107 >> 2] = $16; //@line 364
      $108 = $ReallocAsyncCtx4 + 40 | 0; //@line 365
      HEAP32[$108 >> 2] = $18; //@line 366
      $109 = $ReallocAsyncCtx4 + 44 | 0; //@line 367
      HEAP32[$109 >> 2] = $20; //@line 368
      $110 = $ReallocAsyncCtx4 + 48 | 0; //@line 369
      HEAP32[$110 >> 2] = $22; //@line 370
      $111 = $ReallocAsyncCtx4 + 52 | 0; //@line 371
      HEAP32[$111 >> 2] = $24; //@line 372
      $112 = $ReallocAsyncCtx4 + 56 | 0; //@line 373
      HEAP32[$112 >> 2] = $26; //@line 374
      $113 = $ReallocAsyncCtx4 + 60 | 0; //@line 375
      HEAP32[$113 >> 2] = $28; //@line 376
      $114 = $ReallocAsyncCtx4 + 64 | 0; //@line 377
      HEAP32[$114 >> 2] = $30; //@line 378
      $115 = $ReallocAsyncCtx4 + 68 | 0; //@line 379
      HEAP32[$115 >> 2] = $32; //@line 380
      $116 = $ReallocAsyncCtx4 + 72 | 0; //@line 381
      HEAP32[$116 >> 2] = $34; //@line 382
      sp = STACKTOP; //@line 383
      return;
     }
     ___async_unwind = 0; //@line 386
     HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 387
     $99 = $ReallocAsyncCtx4 + 4 | 0; //@line 388
     HEAP32[$99 >> 2] = $67; //@line 389
     $100 = $ReallocAsyncCtx4 + 8 | 0; //@line 390
     $$expand_i1_val9 = $2 & 1; //@line 391
     HEAP8[$100 >> 0] = $$expand_i1_val9; //@line 392
     $101 = $ReallocAsyncCtx4 + 12 | 0; //@line 393
     HEAP32[$101 >> 2] = $4; //@line 394
     $102 = $ReallocAsyncCtx4 + 16 | 0; //@line 395
     HEAP32[$102 >> 2] = $6; //@line 396
     $103 = $ReallocAsyncCtx4 + 20 | 0; //@line 397
     HEAP32[$103 >> 2] = $8; //@line 398
     $104 = $ReallocAsyncCtx4 + 24 | 0; //@line 399
     HEAP32[$104 >> 2] = $10; //@line 400
     $105 = $ReallocAsyncCtx4 + 28 | 0; //@line 401
     HEAP32[$105 >> 2] = $12; //@line 402
     $106 = $ReallocAsyncCtx4 + 32 | 0; //@line 403
     HEAP32[$106 >> 2] = $14; //@line 404
     $107 = $ReallocAsyncCtx4 + 36 | 0; //@line 405
     HEAP32[$107 >> 2] = $16; //@line 406
     $108 = $ReallocAsyncCtx4 + 40 | 0; //@line 407
     HEAP32[$108 >> 2] = $18; //@line 408
     $109 = $ReallocAsyncCtx4 + 44 | 0; //@line 409
     HEAP32[$109 >> 2] = $20; //@line 410
     $110 = $ReallocAsyncCtx4 + 48 | 0; //@line 411
     HEAP32[$110 >> 2] = $22; //@line 412
     $111 = $ReallocAsyncCtx4 + 52 | 0; //@line 413
     HEAP32[$111 >> 2] = $24; //@line 414
     $112 = $ReallocAsyncCtx4 + 56 | 0; //@line 415
     HEAP32[$112 >> 2] = $26; //@line 416
     $113 = $ReallocAsyncCtx4 + 60 | 0; //@line 417
     HEAP32[$113 >> 2] = $28; //@line 418
     $114 = $ReallocAsyncCtx4 + 64 | 0; //@line 419
     HEAP32[$114 >> 2] = $30; //@line 420
     $115 = $ReallocAsyncCtx4 + 68 | 0; //@line 421
     HEAP32[$115 >> 2] = $32; //@line 422
     $116 = $ReallocAsyncCtx4 + 72 | 0; //@line 423
     HEAP32[$116 >> 2] = $34; //@line 424
     sp = STACKTOP; //@line 425
     return;
    } else if ((label | 0) == 25) {
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 430
     FUNCTION_TABLE_vi[$127 & 127]($$06790 + 36 | 0); //@line 431
     if (___async) {
      HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 434
      $130 = $ReallocAsyncCtx2 + 4 | 0; //@line 435
      HEAP32[$130 >> 2] = $67; //@line 436
      $131 = $ReallocAsyncCtx2 + 8 | 0; //@line 437
      $$expand_i1_val11 = $2 & 1; //@line 438
      HEAP8[$131 >> 0] = $$expand_i1_val11; //@line 439
      $132 = $ReallocAsyncCtx2 + 12 | 0; //@line 440
      HEAP32[$132 >> 2] = $4; //@line 441
      $133 = $ReallocAsyncCtx2 + 16 | 0; //@line 442
      HEAP32[$133 >> 2] = $6; //@line 443
      $134 = $ReallocAsyncCtx2 + 20 | 0; //@line 444
      HEAP32[$134 >> 2] = $8; //@line 445
      $135 = $ReallocAsyncCtx2 + 24 | 0; //@line 446
      HEAP32[$135 >> 2] = $10; //@line 447
      $136 = $ReallocAsyncCtx2 + 28 | 0; //@line 448
      HEAP32[$136 >> 2] = $12; //@line 449
      $137 = $ReallocAsyncCtx2 + 32 | 0; //@line 450
      HEAP32[$137 >> 2] = $14; //@line 451
      $138 = $ReallocAsyncCtx2 + 36 | 0; //@line 452
      HEAP32[$138 >> 2] = $16; //@line 453
      $139 = $ReallocAsyncCtx2 + 40 | 0; //@line 454
      HEAP32[$139 >> 2] = $18; //@line 455
      $140 = $ReallocAsyncCtx2 + 44 | 0; //@line 456
      HEAP32[$140 >> 2] = $20; //@line 457
      $141 = $ReallocAsyncCtx2 + 48 | 0; //@line 458
      HEAP32[$141 >> 2] = $22; //@line 459
      $142 = $ReallocAsyncCtx2 + 52 | 0; //@line 460
      HEAP32[$142 >> 2] = $24; //@line 461
      $143 = $ReallocAsyncCtx2 + 56 | 0; //@line 462
      HEAP32[$143 >> 2] = $26; //@line 463
      $144 = $ReallocAsyncCtx2 + 60 | 0; //@line 464
      HEAP32[$144 >> 2] = $28; //@line 465
      $145 = $ReallocAsyncCtx2 + 64 | 0; //@line 466
      HEAP32[$145 >> 2] = $30; //@line 467
      $146 = $ReallocAsyncCtx2 + 68 | 0; //@line 468
      HEAP32[$146 >> 2] = $32; //@line 469
      $147 = $ReallocAsyncCtx2 + 72 | 0; //@line 470
      HEAP32[$147 >> 2] = $34; //@line 471
      $148 = $ReallocAsyncCtx2 + 76 | 0; //@line 472
      HEAP32[$148 >> 2] = $$06790; //@line 473
      $149 = $ReallocAsyncCtx2 + 80 | 0; //@line 474
      HEAP32[$149 >> 2] = $66; //@line 475
      sp = STACKTOP; //@line 476
      return;
     }
     ___async_unwind = 0; //@line 479
     HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 480
     $130 = $ReallocAsyncCtx2 + 4 | 0; //@line 481
     HEAP32[$130 >> 2] = $67; //@line 482
     $131 = $ReallocAsyncCtx2 + 8 | 0; //@line 483
     $$expand_i1_val11 = $2 & 1; //@line 484
     HEAP8[$131 >> 0] = $$expand_i1_val11; //@line 485
     $132 = $ReallocAsyncCtx2 + 12 | 0; //@line 486
     HEAP32[$132 >> 2] = $4; //@line 487
     $133 = $ReallocAsyncCtx2 + 16 | 0; //@line 488
     HEAP32[$133 >> 2] = $6; //@line 489
     $134 = $ReallocAsyncCtx2 + 20 | 0; //@line 490
     HEAP32[$134 >> 2] = $8; //@line 491
     $135 = $ReallocAsyncCtx2 + 24 | 0; //@line 492
     HEAP32[$135 >> 2] = $10; //@line 493
     $136 = $ReallocAsyncCtx2 + 28 | 0; //@line 494
     HEAP32[$136 >> 2] = $12; //@line 495
     $137 = $ReallocAsyncCtx2 + 32 | 0; //@line 496
     HEAP32[$137 >> 2] = $14; //@line 497
     $138 = $ReallocAsyncCtx2 + 36 | 0; //@line 498
     HEAP32[$138 >> 2] = $16; //@line 499
     $139 = $ReallocAsyncCtx2 + 40 | 0; //@line 500
     HEAP32[$139 >> 2] = $18; //@line 501
     $140 = $ReallocAsyncCtx2 + 44 | 0; //@line 502
     HEAP32[$140 >> 2] = $20; //@line 503
     $141 = $ReallocAsyncCtx2 + 48 | 0; //@line 504
     HEAP32[$141 >> 2] = $22; //@line 505
     $142 = $ReallocAsyncCtx2 + 52 | 0; //@line 506
     HEAP32[$142 >> 2] = $24; //@line 507
     $143 = $ReallocAsyncCtx2 + 56 | 0; //@line 508
     HEAP32[$143 >> 2] = $26; //@line 509
     $144 = $ReallocAsyncCtx2 + 60 | 0; //@line 510
     HEAP32[$144 >> 2] = $28; //@line 511
     $145 = $ReallocAsyncCtx2 + 64 | 0; //@line 512
     HEAP32[$145 >> 2] = $30; //@line 513
     $146 = $ReallocAsyncCtx2 + 68 | 0; //@line 514
     HEAP32[$146 >> 2] = $32; //@line 515
     $147 = $ReallocAsyncCtx2 + 72 | 0; //@line 516
     HEAP32[$147 >> 2] = $34; //@line 517
     $148 = $ReallocAsyncCtx2 + 76 | 0; //@line 518
     HEAP32[$148 >> 2] = $$06790; //@line 519
     $149 = $ReallocAsyncCtx2 + 80 | 0; //@line 520
     HEAP32[$149 >> 2] = $66; //@line 521
     sp = STACKTOP; //@line 522
     return;
    }
   }
  }
 } while (0);
 $165 = _equeue_tick() | 0; //@line 528
 if ($2) {
  $166 = $4 - $165 | 0; //@line 530
  if (($166 | 0) < 1) {
   $168 = $6 + 40 | 0; //@line 533
   if (HEAP32[$168 >> 2] | 0) {
    _equeue_mutex_lock($8); //@line 537
    $171 = HEAP32[$168 >> 2] | 0; //@line 538
    if ($171 | 0) {
     $173 = HEAP32[$10 >> 2] | 0; //@line 541
     if ($173 | 0) {
      $176 = HEAP32[$6 + 44 >> 2] | 0; //@line 545
      $179 = (HEAP32[$173 + 20 >> 2] | 0) - $165 | 0; //@line 548
      $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 552
      FUNCTION_TABLE_vii[$171 & 3]($176, $179 & ~($179 >> 31)); //@line 553
      if (___async) {
       HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 556
       $183 = $ReallocAsyncCtx3 + 4 | 0; //@line 557
       HEAP32[$183 >> 2] = $12; //@line 558
       $184 = $ReallocAsyncCtx3 + 8 | 0; //@line 559
       HEAP32[$184 >> 2] = $8; //@line 560
       $185 = $ReallocAsyncCtx3 + 12 | 0; //@line 561
       HEAP32[$185 >> 2] = $32; //@line 562
       sp = STACKTOP; //@line 563
       return;
      }
      ___async_unwind = 0; //@line 566
      HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 567
      $183 = $ReallocAsyncCtx3 + 4 | 0; //@line 568
      HEAP32[$183 >> 2] = $12; //@line 569
      $184 = $ReallocAsyncCtx3 + 8 | 0; //@line 570
      HEAP32[$184 >> 2] = $8; //@line 571
      $185 = $ReallocAsyncCtx3 + 12 | 0; //@line 572
      HEAP32[$185 >> 2] = $32; //@line 573
      sp = STACKTOP; //@line 574
      return;
     }
    }
    HEAP8[$12 >> 0] = 1; //@line 578
    _equeue_mutex_unlock($8); //@line 579
   }
   HEAP8[$32 >> 0] = 0; //@line 581
   return;
  } else {
   $$065 = $166; //@line 584
  }
 } else {
  $$065 = -1; //@line 587
 }
 _equeue_mutex_lock($8); //@line 589
 $186 = HEAP32[$10 >> 2] | 0; //@line 590
 if (!$186) {
  $$2 = $$065; //@line 593
 } else {
  $190 = (HEAP32[$186 + 20 >> 2] | 0) - $165 | 0; //@line 597
  $193 = $190 & ~($190 >> 31); //@line 600
  $$2 = $193 >>> 0 < $$065 >>> 0 ? $193 : $$065; //@line 603
 }
 _equeue_mutex_unlock($8); //@line 605
 _equeue_sema_wait($34, $$2) | 0; //@line 606
 do {
  if (HEAP8[$32 >> 0] | 0) {
   _equeue_mutex_lock($8); //@line 611
   if (!(HEAP8[$32 >> 0] | 0)) {
    _equeue_mutex_unlock($8); //@line 615
    break;
   }
   HEAP8[$32 >> 0] = 0; //@line 618
   _equeue_mutex_unlock($8); //@line 619
   return;
  }
 } while (0);
 $199 = _equeue_tick() | 0; //@line 623
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 624
 _wait_ms(20); //@line 625
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 628
  $200 = $ReallocAsyncCtx5 + 4 | 0; //@line 629
  $$expand_i1_val13 = $2 & 1; //@line 630
  HEAP8[$200 >> 0] = $$expand_i1_val13; //@line 631
  $201 = $ReallocAsyncCtx5 + 8 | 0; //@line 632
  HEAP32[$201 >> 2] = $4; //@line 633
  $202 = $ReallocAsyncCtx5 + 12 | 0; //@line 634
  HEAP32[$202 >> 2] = $6; //@line 635
  $203 = $ReallocAsyncCtx5 + 16 | 0; //@line 636
  HEAP32[$203 >> 2] = $8; //@line 637
  $204 = $ReallocAsyncCtx5 + 20 | 0; //@line 638
  HEAP32[$204 >> 2] = $10; //@line 639
  $205 = $ReallocAsyncCtx5 + 24 | 0; //@line 640
  HEAP32[$205 >> 2] = $12; //@line 641
  $206 = $ReallocAsyncCtx5 + 28 | 0; //@line 642
  HEAP32[$206 >> 2] = $14; //@line 643
  $207 = $ReallocAsyncCtx5 + 32 | 0; //@line 644
  HEAP32[$207 >> 2] = $16; //@line 645
  $208 = $ReallocAsyncCtx5 + 36 | 0; //@line 646
  HEAP32[$208 >> 2] = $18; //@line 647
  $209 = $ReallocAsyncCtx5 + 40 | 0; //@line 648
  HEAP32[$209 >> 2] = $20; //@line 649
  $210 = $ReallocAsyncCtx5 + 44 | 0; //@line 650
  HEAP32[$210 >> 2] = $22; //@line 651
  $211 = $ReallocAsyncCtx5 + 48 | 0; //@line 652
  HEAP32[$211 >> 2] = $24; //@line 653
  $212 = $ReallocAsyncCtx5 + 52 | 0; //@line 654
  HEAP32[$212 >> 2] = $26; //@line 655
  $213 = $ReallocAsyncCtx5 + 56 | 0; //@line 656
  HEAP32[$213 >> 2] = $28; //@line 657
  $214 = $ReallocAsyncCtx5 + 60 | 0; //@line 658
  HEAP32[$214 >> 2] = $30; //@line 659
  $215 = $ReallocAsyncCtx5 + 64 | 0; //@line 660
  HEAP32[$215 >> 2] = $32; //@line 661
  $216 = $ReallocAsyncCtx5 + 68 | 0; //@line 662
  HEAP32[$216 >> 2] = $34; //@line 663
  $217 = $ReallocAsyncCtx5 + 72 | 0; //@line 664
  HEAP32[$217 >> 2] = $199; //@line 665
  sp = STACKTOP; //@line 666
  return;
 }
 ___async_unwind = 0; //@line 669
 HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 670
 $200 = $ReallocAsyncCtx5 + 4 | 0; //@line 671
 $$expand_i1_val13 = $2 & 1; //@line 672
 HEAP8[$200 >> 0] = $$expand_i1_val13; //@line 673
 $201 = $ReallocAsyncCtx5 + 8 | 0; //@line 674
 HEAP32[$201 >> 2] = $4; //@line 675
 $202 = $ReallocAsyncCtx5 + 12 | 0; //@line 676
 HEAP32[$202 >> 2] = $6; //@line 677
 $203 = $ReallocAsyncCtx5 + 16 | 0; //@line 678
 HEAP32[$203 >> 2] = $8; //@line 679
 $204 = $ReallocAsyncCtx5 + 20 | 0; //@line 680
 HEAP32[$204 >> 2] = $10; //@line 681
 $205 = $ReallocAsyncCtx5 + 24 | 0; //@line 682
 HEAP32[$205 >> 2] = $12; //@line 683
 $206 = $ReallocAsyncCtx5 + 28 | 0; //@line 684
 HEAP32[$206 >> 2] = $14; //@line 685
 $207 = $ReallocAsyncCtx5 + 32 | 0; //@line 686
 HEAP32[$207 >> 2] = $16; //@line 687
 $208 = $ReallocAsyncCtx5 + 36 | 0; //@line 688
 HEAP32[$208 >> 2] = $18; //@line 689
 $209 = $ReallocAsyncCtx5 + 40 | 0; //@line 690
 HEAP32[$209 >> 2] = $20; //@line 691
 $210 = $ReallocAsyncCtx5 + 44 | 0; //@line 692
 HEAP32[$210 >> 2] = $22; //@line 693
 $211 = $ReallocAsyncCtx5 + 48 | 0; //@line 694
 HEAP32[$211 >> 2] = $24; //@line 695
 $212 = $ReallocAsyncCtx5 + 52 | 0; //@line 696
 HEAP32[$212 >> 2] = $26; //@line 697
 $213 = $ReallocAsyncCtx5 + 56 | 0; //@line 698
 HEAP32[$213 >> 2] = $28; //@line 699
 $214 = $ReallocAsyncCtx5 + 60 | 0; //@line 700
 HEAP32[$214 >> 2] = $30; //@line 701
 $215 = $ReallocAsyncCtx5 + 64 | 0; //@line 702
 HEAP32[$215 >> 2] = $32; //@line 703
 $216 = $ReallocAsyncCtx5 + 68 | 0; //@line 704
 HEAP32[$216 >> 2] = $34; //@line 705
 $217 = $ReallocAsyncCtx5 + 72 | 0; //@line 706
 HEAP32[$217 >> 2] = $199; //@line 707
 sp = STACKTOP; //@line 708
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
 sp = STACKTOP; //@line 8412
 STACKTOP = STACKTOP + 560 | 0; //@line 8413
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 8413
 $6 = sp + 8 | 0; //@line 8414
 $7 = sp; //@line 8415
 $8 = sp + 524 | 0; //@line 8416
 $9 = $8; //@line 8417
 $10 = sp + 512 | 0; //@line 8418
 HEAP32[$7 >> 2] = 0; //@line 8419
 $11 = $10 + 12 | 0; //@line 8420
 ___DOUBLE_BITS_677($1) | 0; //@line 8421
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 8426
  $$0520 = 1; //@line 8426
  $$0521 = 1864; //@line 8426
 } else {
  $$0471 = $1; //@line 8437
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 8437
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 1865 : 1870 : 1867; //@line 8437
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 8439
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 8448
   $31 = $$0520 + 3 | 0; //@line 8453
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 8455
   _out_670($0, $$0521, $$0520); //@line 8456
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 1891 : 1895 : $27 ? 1883 : 1887, 3); //@line 8457
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 8459
   $$sink560 = $31; //@line 8460
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 8463
   $36 = $35 != 0.0; //@line 8464
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 8468
   }
   $39 = $5 | 32; //@line 8470
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 8473
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 8476
    $44 = $$0520 | 2; //@line 8477
    $46 = 12 - $3 | 0; //@line 8479
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 8484
     } else {
      $$0509585 = 8.0; //@line 8486
      $$1508586 = $46; //@line 8486
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 8488
       $$0509585 = $$0509585 * 16.0; //@line 8489
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 8504
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 8509
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 8514
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 8517
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 8520
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 8523
     HEAP8[$68 >> 0] = 48; //@line 8524
     $$0511 = $68; //@line 8525
    } else {
     $$0511 = $66; //@line 8527
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 8534
    $76 = $$0511 + -2 | 0; //@line 8537
    HEAP8[$76 >> 0] = $5 + 15; //@line 8538
    $77 = ($3 | 0) < 1; //@line 8539
    $79 = ($4 & 8 | 0) == 0; //@line 8541
    $$0523 = $8; //@line 8542
    $$2473 = $$1472; //@line 8542
    while (1) {
     $80 = ~~$$2473; //@line 8544
     $86 = $$0523 + 1 | 0; //@line 8550
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[1899 + $80 >> 0]; //@line 8551
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 8554
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 8563
      } else {
       HEAP8[$86 >> 0] = 46; //@line 8566
       $$1524 = $$0523 + 2 | 0; //@line 8567
      }
     } else {
      $$1524 = $86; //@line 8570
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 8574
     }
    }
    $$pre693 = $$1524; //@line 8580
    if (!$3) {
     label = 24; //@line 8582
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 8590
      $$sink = $3 + 2 | 0; //@line 8590
     } else {
      label = 24; //@line 8592
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 8596
     $$pre$phi691Z2D = $101; //@line 8597
     $$sink = $101; //@line 8597
    }
    $104 = $11 - $76 | 0; //@line 8601
    $106 = $104 + $44 + $$sink | 0; //@line 8603
    _pad_676($0, 32, $2, $106, $4); //@line 8604
    _out_670($0, $$0521$, $44); //@line 8605
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 8607
    _out_670($0, $8, $$pre$phi691Z2D); //@line 8608
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 8610
    _out_670($0, $76, $104); //@line 8611
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 8613
    $$sink560 = $106; //@line 8614
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 8618
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 8622
    HEAP32[$7 >> 2] = $113; //@line 8623
    $$3 = $35 * 268435456.0; //@line 8624
    $$pr = $113; //@line 8624
   } else {
    $$3 = $35; //@line 8627
    $$pr = HEAP32[$7 >> 2] | 0; //@line 8627
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 8631
   $$0498 = $$561; //@line 8632
   $$4 = $$3; //@line 8632
   do {
    $116 = ~~$$4 >>> 0; //@line 8634
    HEAP32[$$0498 >> 2] = $116; //@line 8635
    $$0498 = $$0498 + 4 | 0; //@line 8636
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 8639
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 8649
    $$1499662 = $$0498; //@line 8649
    $124 = $$pr; //@line 8649
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 8652
     $$0488655 = $$1499662 + -4 | 0; //@line 8653
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 8656
     } else {
      $$0488657 = $$0488655; //@line 8658
      $$0497656 = 0; //@line 8658
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 8661
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 8663
       $131 = tempRet0; //@line 8664
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 8665
       HEAP32[$$0488657 >> 2] = $132; //@line 8667
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 8668
       $$0488657 = $$0488657 + -4 | 0; //@line 8670
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 8680
      } else {
       $138 = $$1482663 + -4 | 0; //@line 8682
       HEAP32[$138 >> 2] = $$0497656; //@line 8683
       $$2483$ph = $138; //@line 8684
      }
     }
     $$2500 = $$1499662; //@line 8687
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 8693
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 8697
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 8703
     HEAP32[$7 >> 2] = $144; //@line 8704
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 8707
      $$1499662 = $$2500; //@line 8707
      $124 = $144; //@line 8707
     } else {
      $$1482$lcssa = $$2483$ph; //@line 8709
      $$1499$lcssa = $$2500; //@line 8709
      $$pr566 = $144; //@line 8709
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 8714
    $$1499$lcssa = $$0498; //@line 8714
    $$pr566 = $$pr; //@line 8714
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 8720
    $150 = ($39 | 0) == 102; //@line 8721
    $$3484650 = $$1482$lcssa; //@line 8722
    $$3501649 = $$1499$lcssa; //@line 8722
    $152 = $$pr566; //@line 8722
    while (1) {
     $151 = 0 - $152 | 0; //@line 8724
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 8726
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 8730
      $161 = 1e9 >>> $154; //@line 8731
      $$0487644 = 0; //@line 8732
      $$1489643 = $$3484650; //@line 8732
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 8734
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 8738
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 8739
       $$1489643 = $$1489643 + 4 | 0; //@line 8740
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 8751
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 8754
       $$4502 = $$3501649; //@line 8754
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 8757
       $$$3484700 = $$$3484; //@line 8758
       $$4502 = $$3501649 + 4 | 0; //@line 8758
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 8765
      $$4502 = $$3501649; //@line 8765
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 8767
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 8774
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 8776
     HEAP32[$7 >> 2] = $152; //@line 8777
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 8782
      $$3501$lcssa = $$$4502; //@line 8782
      break;
     } else {
      $$3484650 = $$$3484700; //@line 8780
      $$3501649 = $$$4502; //@line 8780
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 8787
    $$3501$lcssa = $$1499$lcssa; //@line 8787
   }
   $185 = $$561; //@line 8790
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 8795
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 8796
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 8799
    } else {
     $$0514639 = $189; //@line 8801
     $$0530638 = 10; //@line 8801
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 8803
      $193 = $$0514639 + 1 | 0; //@line 8804
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 8807
       break;
      } else {
       $$0514639 = $193; //@line 8810
      }
     }
    }
   } else {
    $$1515 = 0; //@line 8815
   }
   $198 = ($39 | 0) == 103; //@line 8820
   $199 = ($$540 | 0) != 0; //@line 8821
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 8824
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 8833
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 8836
    $213 = ($209 | 0) % 9 | 0; //@line 8837
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 8840
     $$1531632 = 10; //@line 8840
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 8843
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 8846
       $$1531632 = $215; //@line 8846
      } else {
       $$1531$lcssa = $215; //@line 8848
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 8853
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 8855
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 8856
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 8859
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 8862
     $$4518 = $$1515; //@line 8862
     $$8 = $$3484$lcssa; //@line 8862
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 8867
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 8868
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 8873
     if (!$$0520) {
      $$1467 = $$$564; //@line 8876
      $$1469 = $$543; //@line 8876
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 8879
      $$1467 = $230 ? -$$$564 : $$$564; //@line 8884
      $$1469 = $230 ? -$$543 : $$543; //@line 8884
     }
     $233 = $217 - $218 | 0; //@line 8886
     HEAP32[$212 >> 2] = $233; //@line 8887
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 8891
      HEAP32[$212 >> 2] = $236; //@line 8892
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 8895
       $$sink547625 = $212; //@line 8895
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 8897
        HEAP32[$$sink547625 >> 2] = 0; //@line 8898
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 8901
         HEAP32[$240 >> 2] = 0; //@line 8902
         $$6 = $240; //@line 8903
        } else {
         $$6 = $$5486626; //@line 8905
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 8908
        HEAP32[$238 >> 2] = $242; //@line 8909
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 8912
         $$sink547625 = $238; //@line 8912
        } else {
         $$5486$lcssa = $$6; //@line 8914
         $$sink547$lcssa = $238; //@line 8914
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 8919
       $$sink547$lcssa = $212; //@line 8919
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 8924
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 8925
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 8928
       $$4518 = $247; //@line 8928
       $$8 = $$5486$lcssa; //@line 8928
      } else {
       $$2516621 = $247; //@line 8930
       $$2532620 = 10; //@line 8930
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 8932
        $251 = $$2516621 + 1 | 0; //@line 8933
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 8936
         $$4518 = $251; //@line 8936
         $$8 = $$5486$lcssa; //@line 8936
         break;
        } else {
         $$2516621 = $251; //@line 8939
        }
       }
      }
     } else {
      $$4492 = $212; //@line 8944
      $$4518 = $$1515; //@line 8944
      $$8 = $$3484$lcssa; //@line 8944
     }
    }
    $253 = $$4492 + 4 | 0; //@line 8947
    $$5519$ph = $$4518; //@line 8950
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 8950
    $$9$ph = $$8; //@line 8950
   } else {
    $$5519$ph = $$1515; //@line 8952
    $$7505$ph = $$3501$lcssa; //@line 8952
    $$9$ph = $$3484$lcssa; //@line 8952
   }
   $$7505 = $$7505$ph; //@line 8954
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 8958
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 8961
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 8965
    } else {
     $$lcssa675 = 1; //@line 8967
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 8971
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 8976
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 8984
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 8984
     } else {
      $$0479 = $5 + -2 | 0; //@line 8988
      $$2476 = $$540$ + -1 | 0; //@line 8988
     }
     $267 = $4 & 8; //@line 8990
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 8995
       if (!$270) {
        $$2529 = 9; //@line 8998
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 9003
         $$3533616 = 10; //@line 9003
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 9005
          $275 = $$1528617 + 1 | 0; //@line 9006
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 9012
           break;
          } else {
           $$1528617 = $275; //@line 9010
          }
         }
        } else {
         $$2529 = 0; //@line 9017
        }
       }
      } else {
       $$2529 = 9; //@line 9021
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 9029
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 9031
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 9033
       $$1480 = $$0479; //@line 9036
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 9036
       $$pre$phi698Z2D = 0; //@line 9036
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 9040
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 9042
       $$1480 = $$0479; //@line 9045
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 9045
       $$pre$phi698Z2D = 0; //@line 9045
       break;
      }
     } else {
      $$1480 = $$0479; //@line 9049
      $$3477 = $$2476; //@line 9049
      $$pre$phi698Z2D = $267; //@line 9049
     }
    } else {
     $$1480 = $5; //@line 9053
     $$3477 = $$540; //@line 9053
     $$pre$phi698Z2D = $4 & 8; //@line 9053
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 9056
   $294 = ($292 | 0) != 0 & 1; //@line 9058
   $296 = ($$1480 | 32 | 0) == 102; //@line 9060
   if ($296) {
    $$2513 = 0; //@line 9064
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 9064
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 9067
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 9070
    $304 = $11; //@line 9071
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 9076
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 9078
      HEAP8[$308 >> 0] = 48; //@line 9079
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 9084
      } else {
       $$1512$lcssa = $308; //@line 9086
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 9091
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 9098
    $318 = $$1512$lcssa + -2 | 0; //@line 9100
    HEAP8[$318 >> 0] = $$1480; //@line 9101
    $$2513 = $318; //@line 9104
    $$pn = $304 - $318 | 0; //@line 9104
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 9109
   _pad_676($0, 32, $2, $323, $4); //@line 9110
   _out_670($0, $$0521, $$0520); //@line 9111
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 9113
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 9116
    $326 = $8 + 9 | 0; //@line 9117
    $327 = $326; //@line 9118
    $328 = $8 + 8 | 0; //@line 9119
    $$5493600 = $$0496$$9; //@line 9120
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 9123
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 9128
       $$1465 = $328; //@line 9129
      } else {
       $$1465 = $330; //@line 9131
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 9138
       $$0464597 = $330; //@line 9139
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 9141
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 9144
        } else {
         $$1465 = $335; //@line 9146
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 9151
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 9156
     $$5493600 = $$5493600 + 4 | 0; //@line 9157
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 1915, 1); //@line 9167
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 9173
     $$6494592 = $$5493600; //@line 9173
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 9176
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 9181
       $$0463587 = $347; //@line 9182
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 9184
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 9187
        } else {
         $$0463$lcssa = $351; //@line 9189
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 9194
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 9198
      $$6494592 = $$6494592 + 4 | 0; //@line 9199
      $356 = $$4478593 + -9 | 0; //@line 9200
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 9207
       break;
      } else {
       $$4478593 = $356; //@line 9205
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 9212
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 9215
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 9218
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 9221
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 9222
     $365 = $363; //@line 9223
     $366 = 0 - $9 | 0; //@line 9224
     $367 = $8 + 8 | 0; //@line 9225
     $$5605 = $$3477; //@line 9226
     $$7495604 = $$9$ph; //@line 9226
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 9229
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 9232
       $$0 = $367; //@line 9233
      } else {
       $$0 = $369; //@line 9235
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 9240
        _out_670($0, $$0, 1); //@line 9241
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 9245
         break;
        }
        _out_670($0, 1915, 1); //@line 9248
        $$2 = $375; //@line 9249
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 9253
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 9258
        $$1601 = $$0; //@line 9259
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 9261
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 9264
         } else {
          $$2 = $373; //@line 9266
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 9273
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 9276
      $381 = $$5605 - $378 | 0; //@line 9277
      $$7495604 = $$7495604 + 4 | 0; //@line 9278
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 9285
       break;
      } else {
       $$5605 = $381; //@line 9283
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 9290
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 9293
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 9297
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 9300
   $$sink560 = $323; //@line 9301
  }
 } while (0);
 STACKTOP = sp; //@line 9306
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 9306
}
function _equeue_dispatch__async_cb($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$065 = 0, $$06790$reg2mem$0 = 0, $$06790$reg2mem$0$phi = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val31 = 0, $$expand_i1_val33 = 0, $$expand_i1_val35 = 0, $$reg2mem$0 = 0, $$reg2mem24$0 = 0, $$sink$in$i$i = 0, $10 = 0, $102 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $127 = 0, $128 = 0, $129 = 0, $131 = 0, $132 = 0, $14 = 0, $140 = 0, $141 = 0, $143 = 0, $146 = 0, $148 = 0, $151 = 0, $154 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $165 = 0, $168 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $190 = 0, $191 = 0, $192 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $30 = 0, $32 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $70 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11779
 $4 = HEAP8[$0 + 8 >> 0] & 1; //@line 11784
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11786
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11788
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11790
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11792
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 11794
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 11796
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 11798
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 11800
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 11802
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 11804
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 11806
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 11810
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 11812
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 11816
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 11818
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 11820
 $$06790$reg2mem$0 = HEAP32[$0 + 56 >> 2] | 0; //@line 11821
 $$reg2mem$0 = HEAP32[$0 + 4 >> 2] | 0; //@line 11821
 $$reg2mem24$0 = HEAP32[$0 + 68 >> 2] | 0; //@line 11821
 while (1) {
  $68 = HEAP32[$$06790$reg2mem$0 + 24 >> 2] | 0; //@line 11824
  if (($68 | 0) > -1) {
   label = 8; //@line 11827
   break;
  }
  $92 = $$06790$reg2mem$0 + 4 | 0; //@line 11831
  $93 = HEAP8[$92 >> 0] | 0; //@line 11832
  HEAP8[$92 >> 0] = (($93 + 1 & 255) << HEAP32[$36 >> 2] | 0) == 0 ? 1 : ($93 & 255) + 1 & 255; //@line 11841
  $102 = HEAP32[$$06790$reg2mem$0 + 28 >> 2] | 0; //@line 11843
  if ($102 | 0) {
   label = 12; //@line 11846
   break;
  }
  _equeue_mutex_lock($18); //@line 11849
  $125 = HEAP32[$20 >> 2] | 0; //@line 11850
  L6 : do {
   if (!$125) {
    $$02329$i$i = $20; //@line 11854
    label = 21; //@line 11855
   } else {
    $127 = HEAP32[$$06790$reg2mem$0 >> 2] | 0; //@line 11857
    $$025$i$i = $20; //@line 11858
    $129 = $125; //@line 11858
    while (1) {
     $128 = HEAP32[$129 >> 2] | 0; //@line 11860
     if ($128 >>> 0 >= $127 >>> 0) {
      break;
     }
     $131 = $129 + 8 | 0; //@line 11865
     $132 = HEAP32[$131 >> 2] | 0; //@line 11866
     if (!$132) {
      $$02329$i$i = $131; //@line 11869
      label = 21; //@line 11870
      break L6;
     } else {
      $$025$i$i = $131; //@line 11873
      $129 = $132; //@line 11873
     }
    }
    if (($128 | 0) == ($127 | 0)) {
     HEAP32[$$06790$reg2mem$0 + 12 >> 2] = $129; //@line 11879
     $$02330$i$i = $$025$i$i; //@line 11882
     $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 11882
    } else {
     $$02329$i$i = $$025$i$i; //@line 11884
     label = 21; //@line 11885
    }
   }
  } while (0);
  if ((label | 0) == 21) {
   label = 0; //@line 11890
   HEAP32[$$06790$reg2mem$0 + 12 >> 2] = 0; //@line 11892
   $$02330$i$i = $$02329$i$i; //@line 11893
   $$sink$in$i$i = $$02329$i$i; //@line 11893
  }
  HEAP32[$$reg2mem24$0 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 11896
  HEAP32[$$02330$i$i >> 2] = $$06790$reg2mem$0; //@line 11897
  _equeue_mutex_unlock($18); //@line 11898
  if (!$$reg2mem$0) {
   label = 24; //@line 11901
   break;
  }
  $41 = $$reg2mem$0 + 8 | 0; //@line 11904
  $42 = HEAP32[$41 >> 2] | 0; //@line 11905
  $44 = HEAP32[$$reg2mem$0 + 32 >> 2] | 0; //@line 11907
  if (!$44) {
   $$06790$reg2mem$0$phi = $$reg2mem$0; //@line 11910
   $$reg2mem$0 = $42; //@line 11910
   $$reg2mem24$0 = $41; //@line 11910
   $$06790$reg2mem$0 = $$06790$reg2mem$0$phi; //@line 11910
  } else {
   label = 3; //@line 11912
   break;
  }
 }
 if ((label | 0) == 3) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 11918
  FUNCTION_TABLE_vi[$44 & 127]($$reg2mem$0 + 36 | 0); //@line 11919
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 11922
   $47 = $ReallocAsyncCtx + 4 | 0; //@line 11923
   HEAP32[$47 >> 2] = $42; //@line 11924
   $48 = $ReallocAsyncCtx + 8 | 0; //@line 11925
   $$expand_i1_val = $4 & 1; //@line 11926
   HEAP8[$48 >> 0] = $$expand_i1_val; //@line 11927
   $49 = $ReallocAsyncCtx + 12 | 0; //@line 11928
   HEAP32[$49 >> 2] = $6; //@line 11929
   $50 = $ReallocAsyncCtx + 16 | 0; //@line 11930
   HEAP32[$50 >> 2] = $8; //@line 11931
   $51 = $ReallocAsyncCtx + 20 | 0; //@line 11932
   HEAP32[$51 >> 2] = $10; //@line 11933
   $52 = $ReallocAsyncCtx + 24 | 0; //@line 11934
   HEAP32[$52 >> 2] = $12; //@line 11935
   $53 = $ReallocAsyncCtx + 28 | 0; //@line 11936
   HEAP32[$53 >> 2] = $14; //@line 11937
   $54 = $ReallocAsyncCtx + 32 | 0; //@line 11938
   HEAP32[$54 >> 2] = $16; //@line 11939
   $55 = $ReallocAsyncCtx + 36 | 0; //@line 11940
   HEAP32[$55 >> 2] = $18; //@line 11941
   $56 = $ReallocAsyncCtx + 40 | 0; //@line 11942
   HEAP32[$56 >> 2] = $20; //@line 11943
   $57 = $ReallocAsyncCtx + 44 | 0; //@line 11944
   HEAP32[$57 >> 2] = $22; //@line 11945
   $58 = $ReallocAsyncCtx + 48 | 0; //@line 11946
   HEAP32[$58 >> 2] = $24; //@line 11947
   $59 = $ReallocAsyncCtx + 52 | 0; //@line 11948
   HEAP32[$59 >> 2] = $26; //@line 11949
   $60 = $ReallocAsyncCtx + 56 | 0; //@line 11950
   HEAP32[$60 >> 2] = $$reg2mem$0; //@line 11951
   $61 = $ReallocAsyncCtx + 60 | 0; //@line 11952
   HEAP32[$61 >> 2] = $30; //@line 11953
   $62 = $ReallocAsyncCtx + 64 | 0; //@line 11954
   HEAP32[$62 >> 2] = $32; //@line 11955
   $63 = $ReallocAsyncCtx + 68 | 0; //@line 11956
   HEAP32[$63 >> 2] = $41; //@line 11957
   $64 = $ReallocAsyncCtx + 72 | 0; //@line 11958
   HEAP32[$64 >> 2] = $36; //@line 11959
   $65 = $ReallocAsyncCtx + 76 | 0; //@line 11960
   HEAP32[$65 >> 2] = $38; //@line 11961
   $66 = $ReallocAsyncCtx + 80 | 0; //@line 11962
   HEAP32[$66 >> 2] = $40; //@line 11963
   sp = STACKTOP; //@line 11964
   return;
  }
  ___async_unwind = 0; //@line 11967
  HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 11968
  $47 = $ReallocAsyncCtx + 4 | 0; //@line 11969
  HEAP32[$47 >> 2] = $42; //@line 11970
  $48 = $ReallocAsyncCtx + 8 | 0; //@line 11971
  $$expand_i1_val = $4 & 1; //@line 11972
  HEAP8[$48 >> 0] = $$expand_i1_val; //@line 11973
  $49 = $ReallocAsyncCtx + 12 | 0; //@line 11974
  HEAP32[$49 >> 2] = $6; //@line 11975
  $50 = $ReallocAsyncCtx + 16 | 0; //@line 11976
  HEAP32[$50 >> 2] = $8; //@line 11977
  $51 = $ReallocAsyncCtx + 20 | 0; //@line 11978
  HEAP32[$51 >> 2] = $10; //@line 11979
  $52 = $ReallocAsyncCtx + 24 | 0; //@line 11980
  HEAP32[$52 >> 2] = $12; //@line 11981
  $53 = $ReallocAsyncCtx + 28 | 0; //@line 11982
  HEAP32[$53 >> 2] = $14; //@line 11983
  $54 = $ReallocAsyncCtx + 32 | 0; //@line 11984
  HEAP32[$54 >> 2] = $16; //@line 11985
  $55 = $ReallocAsyncCtx + 36 | 0; //@line 11986
  HEAP32[$55 >> 2] = $18; //@line 11987
  $56 = $ReallocAsyncCtx + 40 | 0; //@line 11988
  HEAP32[$56 >> 2] = $20; //@line 11989
  $57 = $ReallocAsyncCtx + 44 | 0; //@line 11990
  HEAP32[$57 >> 2] = $22; //@line 11991
  $58 = $ReallocAsyncCtx + 48 | 0; //@line 11992
  HEAP32[$58 >> 2] = $24; //@line 11993
  $59 = $ReallocAsyncCtx + 52 | 0; //@line 11994
  HEAP32[$59 >> 2] = $26; //@line 11995
  $60 = $ReallocAsyncCtx + 56 | 0; //@line 11996
  HEAP32[$60 >> 2] = $$reg2mem$0; //@line 11997
  $61 = $ReallocAsyncCtx + 60 | 0; //@line 11998
  HEAP32[$61 >> 2] = $30; //@line 11999
  $62 = $ReallocAsyncCtx + 64 | 0; //@line 12000
  HEAP32[$62 >> 2] = $32; //@line 12001
  $63 = $ReallocAsyncCtx + 68 | 0; //@line 12002
  HEAP32[$63 >> 2] = $41; //@line 12003
  $64 = $ReallocAsyncCtx + 72 | 0; //@line 12004
  HEAP32[$64 >> 2] = $36; //@line 12005
  $65 = $ReallocAsyncCtx + 76 | 0; //@line 12006
  HEAP32[$65 >> 2] = $38; //@line 12007
  $66 = $ReallocAsyncCtx + 80 | 0; //@line 12008
  HEAP32[$66 >> 2] = $40; //@line 12009
  sp = STACKTOP; //@line 12010
  return;
 } else if ((label | 0) == 8) {
  $70 = $$06790$reg2mem$0 + 20 | 0; //@line 12014
  HEAP32[$70 >> 2] = (HEAP32[$70 >> 2] | 0) + $68; //@line 12017
  $73 = _equeue_tick() | 0; //@line 12018
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 12019
  _equeue_enqueue($8, $$06790$reg2mem$0, $73) | 0; //@line 12020
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 12023
   $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 12024
   HEAP32[$74 >> 2] = $$reg2mem$0; //@line 12025
   $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 12026
   $$expand_i1_val31 = $4 & 1; //@line 12027
   HEAP8[$75 >> 0] = $$expand_i1_val31; //@line 12028
   $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 12029
   HEAP32[$76 >> 2] = $6; //@line 12030
   $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 12031
   HEAP32[$77 >> 2] = $8; //@line 12032
   $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 12033
   HEAP32[$78 >> 2] = $10; //@line 12034
   $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 12035
   HEAP32[$79 >> 2] = $12; //@line 12036
   $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 12037
   HEAP32[$80 >> 2] = $14; //@line 12038
   $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 12039
   HEAP32[$81 >> 2] = $16; //@line 12040
   $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 12041
   HEAP32[$82 >> 2] = $18; //@line 12042
   $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 12043
   HEAP32[$83 >> 2] = $20; //@line 12044
   $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 12045
   HEAP32[$84 >> 2] = $22; //@line 12046
   $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 12047
   HEAP32[$85 >> 2] = $24; //@line 12048
   $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 12049
   HEAP32[$86 >> 2] = $26; //@line 12050
   $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 12051
   HEAP32[$87 >> 2] = $30; //@line 12052
   $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 12053
   HEAP32[$88 >> 2] = $32; //@line 12054
   $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 12055
   HEAP32[$89 >> 2] = $36; //@line 12056
   $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 12057
   HEAP32[$90 >> 2] = $38; //@line 12058
   $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 12059
   HEAP32[$91 >> 2] = $40; //@line 12060
   sp = STACKTOP; //@line 12061
   return;
  }
  ___async_unwind = 0; //@line 12064
  HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 12065
  $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 12066
  HEAP32[$74 >> 2] = $$reg2mem$0; //@line 12067
  $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 12068
  $$expand_i1_val31 = $4 & 1; //@line 12069
  HEAP8[$75 >> 0] = $$expand_i1_val31; //@line 12070
  $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 12071
  HEAP32[$76 >> 2] = $6; //@line 12072
  $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 12073
  HEAP32[$77 >> 2] = $8; //@line 12074
  $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 12075
  HEAP32[$78 >> 2] = $10; //@line 12076
  $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 12077
  HEAP32[$79 >> 2] = $12; //@line 12078
  $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 12079
  HEAP32[$80 >> 2] = $14; //@line 12080
  $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 12081
  HEAP32[$81 >> 2] = $16; //@line 12082
  $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 12083
  HEAP32[$82 >> 2] = $18; //@line 12084
  $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 12085
  HEAP32[$83 >> 2] = $20; //@line 12086
  $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 12087
  HEAP32[$84 >> 2] = $22; //@line 12088
  $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 12089
  HEAP32[$85 >> 2] = $24; //@line 12090
  $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 12091
  HEAP32[$86 >> 2] = $26; //@line 12092
  $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 12093
  HEAP32[$87 >> 2] = $30; //@line 12094
  $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 12095
  HEAP32[$88 >> 2] = $32; //@line 12096
  $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 12097
  HEAP32[$89 >> 2] = $36; //@line 12098
  $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 12099
  HEAP32[$90 >> 2] = $38; //@line 12100
  $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 12101
  HEAP32[$91 >> 2] = $40; //@line 12102
  sp = STACKTOP; //@line 12103
  return;
 } else if ((label | 0) == 12) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 12108
  FUNCTION_TABLE_vi[$102 & 127]($$06790$reg2mem$0 + 36 | 0); //@line 12109
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 12112
   $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 12113
   HEAP32[$105 >> 2] = $$reg2mem$0; //@line 12114
   $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 12115
   $$expand_i1_val33 = $4 & 1; //@line 12116
   HEAP8[$106 >> 0] = $$expand_i1_val33; //@line 12117
   $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 12118
   HEAP32[$107 >> 2] = $6; //@line 12119
   $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 12120
   HEAP32[$108 >> 2] = $8; //@line 12121
   $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 12122
   HEAP32[$109 >> 2] = $10; //@line 12123
   $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 12124
   HEAP32[$110 >> 2] = $12; //@line 12125
   $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 12126
   HEAP32[$111 >> 2] = $14; //@line 12127
   $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 12128
   HEAP32[$112 >> 2] = $16; //@line 12129
   $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 12130
   HEAP32[$113 >> 2] = $18; //@line 12131
   $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 12132
   HEAP32[$114 >> 2] = $20; //@line 12133
   $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 12134
   HEAP32[$115 >> 2] = $22; //@line 12135
   $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 12136
   HEAP32[$116 >> 2] = $24; //@line 12137
   $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 12138
   HEAP32[$117 >> 2] = $26; //@line 12139
   $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 12140
   HEAP32[$118 >> 2] = $30; //@line 12141
   $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 12142
   HEAP32[$119 >> 2] = $32; //@line 12143
   $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 12144
   HEAP32[$120 >> 2] = $36; //@line 12145
   $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 12146
   HEAP32[$121 >> 2] = $38; //@line 12147
   $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 12148
   HEAP32[$122 >> 2] = $40; //@line 12149
   $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 12150
   HEAP32[$123 >> 2] = $$06790$reg2mem$0; //@line 12151
   $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 12152
   HEAP32[$124 >> 2] = $$reg2mem24$0; //@line 12153
   sp = STACKTOP; //@line 12154
   return;
  }
  ___async_unwind = 0; //@line 12157
  HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 12158
  $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 12159
  HEAP32[$105 >> 2] = $$reg2mem$0; //@line 12160
  $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 12161
  $$expand_i1_val33 = $4 & 1; //@line 12162
  HEAP8[$106 >> 0] = $$expand_i1_val33; //@line 12163
  $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 12164
  HEAP32[$107 >> 2] = $6; //@line 12165
  $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 12166
  HEAP32[$108 >> 2] = $8; //@line 12167
  $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 12168
  HEAP32[$109 >> 2] = $10; //@line 12169
  $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 12170
  HEAP32[$110 >> 2] = $12; //@line 12171
  $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 12172
  HEAP32[$111 >> 2] = $14; //@line 12173
  $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 12174
  HEAP32[$112 >> 2] = $16; //@line 12175
  $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 12176
  HEAP32[$113 >> 2] = $18; //@line 12177
  $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 12178
  HEAP32[$114 >> 2] = $20; //@line 12179
  $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 12180
  HEAP32[$115 >> 2] = $22; //@line 12181
  $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 12182
  HEAP32[$116 >> 2] = $24; //@line 12183
  $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 12184
  HEAP32[$117 >> 2] = $26; //@line 12185
  $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 12186
  HEAP32[$118 >> 2] = $30; //@line 12187
  $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 12188
  HEAP32[$119 >> 2] = $32; //@line 12189
  $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 12190
  HEAP32[$120 >> 2] = $36; //@line 12191
  $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 12192
  HEAP32[$121 >> 2] = $38; //@line 12193
  $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 12194
  HEAP32[$122 >> 2] = $40; //@line 12195
  $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 12196
  HEAP32[$123 >> 2] = $$06790$reg2mem$0; //@line 12197
  $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 12198
  HEAP32[$124 >> 2] = $$reg2mem24$0; //@line 12199
  sp = STACKTOP; //@line 12200
  return;
 } else if ((label | 0) == 24) {
  $140 = _equeue_tick() | 0; //@line 12204
  if ($4) {
   $141 = $6 - $140 | 0; //@line 12206
   if (($141 | 0) < 1) {
    $143 = $8 + 40 | 0; //@line 12209
    if (HEAP32[$143 >> 2] | 0) {
     _equeue_mutex_lock($10); //@line 12213
     $146 = HEAP32[$143 >> 2] | 0; //@line 12214
     if ($146 | 0) {
      $148 = HEAP32[$12 >> 2] | 0; //@line 12217
      if ($148 | 0) {
       $151 = HEAP32[$8 + 44 >> 2] | 0; //@line 12221
       $154 = (HEAP32[$148 + 20 >> 2] | 0) - $140 | 0; //@line 12224
       $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 12228
       FUNCTION_TABLE_vii[$146 & 3]($151, $154 & ~($154 >> 31)); //@line 12229
       if (___async) {
        HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 12232
        $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 12233
        HEAP32[$158 >> 2] = $14; //@line 12234
        $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 12235
        HEAP32[$159 >> 2] = $10; //@line 12236
        $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 12237
        HEAP32[$160 >> 2] = $38; //@line 12238
        sp = STACKTOP; //@line 12239
        return;
       }
       ___async_unwind = 0; //@line 12242
       HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 12243
       $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 12244
       HEAP32[$158 >> 2] = $14; //@line 12245
       $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 12246
       HEAP32[$159 >> 2] = $10; //@line 12247
       $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 12248
       HEAP32[$160 >> 2] = $38; //@line 12249
       sp = STACKTOP; //@line 12250
       return;
      }
     }
     HEAP8[$14 >> 0] = 1; //@line 12254
     _equeue_mutex_unlock($10); //@line 12255
    }
    HEAP8[$38 >> 0] = 0; //@line 12257
    return;
   } else {
    $$065 = $141; //@line 12260
   }
  } else {
   $$065 = -1; //@line 12263
  }
  _equeue_mutex_lock($10); //@line 12265
  $161 = HEAP32[$12 >> 2] | 0; //@line 12266
  if (!$161) {
   $$2 = $$065; //@line 12269
  } else {
   $165 = (HEAP32[$161 + 20 >> 2] | 0) - $140 | 0; //@line 12273
   $168 = $165 & ~($165 >> 31); //@line 12276
   $$2 = $168 >>> 0 < $$065 >>> 0 ? $168 : $$065; //@line 12279
  }
  _equeue_mutex_unlock($10); //@line 12281
  _equeue_sema_wait($40, $$2) | 0; //@line 12282
  do {
   if (HEAP8[$38 >> 0] | 0) {
    _equeue_mutex_lock($10); //@line 12287
    if (!(HEAP8[$38 >> 0] | 0)) {
     _equeue_mutex_unlock($10); //@line 12291
     break;
    }
    HEAP8[$38 >> 0] = 0; //@line 12294
    _equeue_mutex_unlock($10); //@line 12295
    return;
   }
  } while (0);
  $174 = _equeue_tick() | 0; //@line 12299
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 12300
  _wait_ms(20); //@line 12301
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 12304
   $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 12305
   $$expand_i1_val35 = $4 & 1; //@line 12306
   HEAP8[$175 >> 0] = $$expand_i1_val35; //@line 12307
   $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 12308
   HEAP32[$176 >> 2] = $6; //@line 12309
   $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 12310
   HEAP32[$177 >> 2] = $8; //@line 12311
   $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 12312
   HEAP32[$178 >> 2] = $10; //@line 12313
   $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 12314
   HEAP32[$179 >> 2] = $12; //@line 12315
   $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 12316
   HEAP32[$180 >> 2] = $14; //@line 12317
   $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 12318
   HEAP32[$181 >> 2] = $16; //@line 12319
   $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 12320
   HEAP32[$182 >> 2] = $18; //@line 12321
   $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 12322
   HEAP32[$183 >> 2] = $20; //@line 12323
   $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 12324
   HEAP32[$184 >> 2] = $22; //@line 12325
   $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 12326
   HEAP32[$185 >> 2] = $24; //@line 12327
   $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 12328
   HEAP32[$186 >> 2] = $26; //@line 12329
   $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 12330
   HEAP32[$187 >> 2] = $30; //@line 12331
   $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 12332
   HEAP32[$188 >> 2] = $32; //@line 12333
   $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 12334
   HEAP32[$189 >> 2] = $36; //@line 12335
   $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 12336
   HEAP32[$190 >> 2] = $38; //@line 12337
   $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 12338
   HEAP32[$191 >> 2] = $40; //@line 12339
   $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 12340
   HEAP32[$192 >> 2] = $174; //@line 12341
   sp = STACKTOP; //@line 12342
   return;
  }
  ___async_unwind = 0; //@line 12345
  HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 12346
  $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 12347
  $$expand_i1_val35 = $4 & 1; //@line 12348
  HEAP8[$175 >> 0] = $$expand_i1_val35; //@line 12349
  $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 12350
  HEAP32[$176 >> 2] = $6; //@line 12351
  $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 12352
  HEAP32[$177 >> 2] = $8; //@line 12353
  $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 12354
  HEAP32[$178 >> 2] = $10; //@line 12355
  $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 12356
  HEAP32[$179 >> 2] = $12; //@line 12357
  $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 12358
  HEAP32[$180 >> 2] = $14; //@line 12359
  $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 12360
  HEAP32[$181 >> 2] = $16; //@line 12361
  $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 12362
  HEAP32[$182 >> 2] = $18; //@line 12363
  $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 12364
  HEAP32[$183 >> 2] = $20; //@line 12365
  $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 12366
  HEAP32[$184 >> 2] = $22; //@line 12367
  $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 12368
  HEAP32[$185 >> 2] = $24; //@line 12369
  $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 12370
  HEAP32[$186 >> 2] = $26; //@line 12371
  $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 12372
  HEAP32[$187 >> 2] = $30; //@line 12373
  $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 12374
  HEAP32[$188 >> 2] = $32; //@line 12375
  $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 12376
  HEAP32[$189 >> 2] = $36; //@line 12377
  $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 12378
  HEAP32[$190 >> 2] = $38; //@line 12379
  $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 12380
  HEAP32[$191 >> 2] = $40; //@line 12381
  $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 12382
  HEAP32[$192 >> 2] = $174; //@line 12383
  sp = STACKTOP; //@line 12384
  return;
 }
}
function _equeue_dispatch__async_cb_5($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$065 = 0, $$06790$reg2mem$0 = 0, $$06790$reg2mem$0$phi = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val31 = 0, $$expand_i1_val33 = 0, $$expand_i1_val35 = 0, $$reg2mem$0 = 0, $$reg2mem24$0 = 0, $$sink$in$i$i = 0, $10 = 0, $102 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $127 = 0, $128 = 0, $129 = 0, $131 = 0, $132 = 0, $14 = 0, $140 = 0, $141 = 0, $143 = 0, $146 = 0, $148 = 0, $151 = 0, $154 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $165 = 0, $168 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $190 = 0, $191 = 0, $192 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $4 = 0, $42 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $70 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12402
 $4 = HEAP8[$0 + 8 >> 0] & 1; //@line 12407
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12409
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12411
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12413
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12415
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12417
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12419
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 12421
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 12423
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 12425
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 12427
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 12429
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 12431
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 12433
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 12435
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 12437
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 12439
 $$06790$reg2mem$0 = HEAP32[$0 + 76 >> 2] | 0; //@line 12444
 $$reg2mem$0 = HEAP32[$0 + 4 >> 2] | 0; //@line 12444
 $$reg2mem24$0 = HEAP32[$0 + 80 >> 2] | 0; //@line 12444
 while (1) {
  _equeue_mutex_lock($18); //@line 12446
  $125 = HEAP32[$20 >> 2] | 0; //@line 12447
  L4 : do {
   if (!$125) {
    $$02329$i$i = $20; //@line 12451
    label = 21; //@line 12452
   } else {
    $127 = HEAP32[$$06790$reg2mem$0 >> 2] | 0; //@line 12454
    $$025$i$i = $20; //@line 12455
    $129 = $125; //@line 12455
    while (1) {
     $128 = HEAP32[$129 >> 2] | 0; //@line 12457
     if ($128 >>> 0 >= $127 >>> 0) {
      break;
     }
     $131 = $129 + 8 | 0; //@line 12462
     $132 = HEAP32[$131 >> 2] | 0; //@line 12463
     if (!$132) {
      $$02329$i$i = $131; //@line 12466
      label = 21; //@line 12467
      break L4;
     } else {
      $$025$i$i = $131; //@line 12470
      $129 = $132; //@line 12470
     }
    }
    if (($128 | 0) == ($127 | 0)) {
     HEAP32[$$06790$reg2mem$0 + 12 >> 2] = $129; //@line 12476
     $$02330$i$i = $$025$i$i; //@line 12479
     $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 12479
    } else {
     $$02329$i$i = $$025$i$i; //@line 12481
     label = 21; //@line 12482
    }
   }
  } while (0);
  if ((label | 0) == 21) {
   label = 0; //@line 12487
   HEAP32[$$06790$reg2mem$0 + 12 >> 2] = 0; //@line 12489
   $$02330$i$i = $$02329$i$i; //@line 12490
   $$sink$in$i$i = $$02329$i$i; //@line 12490
  }
  HEAP32[$$reg2mem24$0 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 12493
  HEAP32[$$02330$i$i >> 2] = $$06790$reg2mem$0; //@line 12494
  _equeue_mutex_unlock($18); //@line 12495
  if (!$$reg2mem$0) {
   label = 24; //@line 12498
   break;
  }
  $$reg2mem24$0 = $$reg2mem$0 + 8 | 0; //@line 12501
  $42 = HEAP32[$$reg2mem24$0 >> 2] | 0; //@line 12502
  $44 = HEAP32[$$reg2mem$0 + 32 >> 2] | 0; //@line 12504
  if ($44 | 0) {
   label = 3; //@line 12507
   break;
  }
  $68 = HEAP32[$$reg2mem$0 + 24 >> 2] | 0; //@line 12511
  if (($68 | 0) > -1) {
   label = 7; //@line 12514
   break;
  }
  $92 = $$reg2mem$0 + 4 | 0; //@line 12518
  $93 = HEAP8[$92 >> 0] | 0; //@line 12519
  HEAP8[$92 >> 0] = (($93 + 1 & 255) << HEAP32[$32 >> 2] | 0) == 0 ? 1 : ($93 & 255) + 1 & 255; //@line 12528
  $102 = HEAP32[$$reg2mem$0 + 28 >> 2] | 0; //@line 12530
  if ($102 | 0) {
   label = 11; //@line 12535
   break;
  } else {
   $$06790$reg2mem$0$phi = $$reg2mem$0; //@line 12533
   $$reg2mem$0 = $42; //@line 12533
   $$06790$reg2mem$0 = $$06790$reg2mem$0$phi; //@line 12533
  }
 }
 if ((label | 0) == 3) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 12541
  FUNCTION_TABLE_vi[$44 & 127]($$reg2mem$0 + 36 | 0); //@line 12542
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 12545
   $47 = $ReallocAsyncCtx + 4 | 0; //@line 12546
   HEAP32[$47 >> 2] = $42; //@line 12547
   $48 = $ReallocAsyncCtx + 8 | 0; //@line 12548
   $$expand_i1_val = $4 & 1; //@line 12549
   HEAP8[$48 >> 0] = $$expand_i1_val; //@line 12550
   $49 = $ReallocAsyncCtx + 12 | 0; //@line 12551
   HEAP32[$49 >> 2] = $6; //@line 12552
   $50 = $ReallocAsyncCtx + 16 | 0; //@line 12553
   HEAP32[$50 >> 2] = $8; //@line 12554
   $51 = $ReallocAsyncCtx + 20 | 0; //@line 12555
   HEAP32[$51 >> 2] = $10; //@line 12556
   $52 = $ReallocAsyncCtx + 24 | 0; //@line 12557
   HEAP32[$52 >> 2] = $12; //@line 12558
   $53 = $ReallocAsyncCtx + 28 | 0; //@line 12559
   HEAP32[$53 >> 2] = $14; //@line 12560
   $54 = $ReallocAsyncCtx + 32 | 0; //@line 12561
   HEAP32[$54 >> 2] = $16; //@line 12562
   $55 = $ReallocAsyncCtx + 36 | 0; //@line 12563
   HEAP32[$55 >> 2] = $18; //@line 12564
   $56 = $ReallocAsyncCtx + 40 | 0; //@line 12565
   HEAP32[$56 >> 2] = $20; //@line 12566
   $57 = $ReallocAsyncCtx + 44 | 0; //@line 12567
   HEAP32[$57 >> 2] = $22; //@line 12568
   $58 = $ReallocAsyncCtx + 48 | 0; //@line 12569
   HEAP32[$58 >> 2] = $24; //@line 12570
   $59 = $ReallocAsyncCtx + 52 | 0; //@line 12571
   HEAP32[$59 >> 2] = $26; //@line 12572
   $60 = $ReallocAsyncCtx + 56 | 0; //@line 12573
   HEAP32[$60 >> 2] = $$reg2mem$0; //@line 12574
   $61 = $ReallocAsyncCtx + 60 | 0; //@line 12575
   HEAP32[$61 >> 2] = $28; //@line 12576
   $62 = $ReallocAsyncCtx + 64 | 0; //@line 12577
   HEAP32[$62 >> 2] = $30; //@line 12578
   $63 = $ReallocAsyncCtx + 68 | 0; //@line 12579
   HEAP32[$63 >> 2] = $$reg2mem24$0; //@line 12580
   $64 = $ReallocAsyncCtx + 72 | 0; //@line 12581
   HEAP32[$64 >> 2] = $32; //@line 12582
   $65 = $ReallocAsyncCtx + 76 | 0; //@line 12583
   HEAP32[$65 >> 2] = $34; //@line 12584
   $66 = $ReallocAsyncCtx + 80 | 0; //@line 12585
   HEAP32[$66 >> 2] = $36; //@line 12586
   sp = STACKTOP; //@line 12587
   return;
  }
  ___async_unwind = 0; //@line 12590
  HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 12591
  $47 = $ReallocAsyncCtx + 4 | 0; //@line 12592
  HEAP32[$47 >> 2] = $42; //@line 12593
  $48 = $ReallocAsyncCtx + 8 | 0; //@line 12594
  $$expand_i1_val = $4 & 1; //@line 12595
  HEAP8[$48 >> 0] = $$expand_i1_val; //@line 12596
  $49 = $ReallocAsyncCtx + 12 | 0; //@line 12597
  HEAP32[$49 >> 2] = $6; //@line 12598
  $50 = $ReallocAsyncCtx + 16 | 0; //@line 12599
  HEAP32[$50 >> 2] = $8; //@line 12600
  $51 = $ReallocAsyncCtx + 20 | 0; //@line 12601
  HEAP32[$51 >> 2] = $10; //@line 12602
  $52 = $ReallocAsyncCtx + 24 | 0; //@line 12603
  HEAP32[$52 >> 2] = $12; //@line 12604
  $53 = $ReallocAsyncCtx + 28 | 0; //@line 12605
  HEAP32[$53 >> 2] = $14; //@line 12606
  $54 = $ReallocAsyncCtx + 32 | 0; //@line 12607
  HEAP32[$54 >> 2] = $16; //@line 12608
  $55 = $ReallocAsyncCtx + 36 | 0; //@line 12609
  HEAP32[$55 >> 2] = $18; //@line 12610
  $56 = $ReallocAsyncCtx + 40 | 0; //@line 12611
  HEAP32[$56 >> 2] = $20; //@line 12612
  $57 = $ReallocAsyncCtx + 44 | 0; //@line 12613
  HEAP32[$57 >> 2] = $22; //@line 12614
  $58 = $ReallocAsyncCtx + 48 | 0; //@line 12615
  HEAP32[$58 >> 2] = $24; //@line 12616
  $59 = $ReallocAsyncCtx + 52 | 0; //@line 12617
  HEAP32[$59 >> 2] = $26; //@line 12618
  $60 = $ReallocAsyncCtx + 56 | 0; //@line 12619
  HEAP32[$60 >> 2] = $$reg2mem$0; //@line 12620
  $61 = $ReallocAsyncCtx + 60 | 0; //@line 12621
  HEAP32[$61 >> 2] = $28; //@line 12622
  $62 = $ReallocAsyncCtx + 64 | 0; //@line 12623
  HEAP32[$62 >> 2] = $30; //@line 12624
  $63 = $ReallocAsyncCtx + 68 | 0; //@line 12625
  HEAP32[$63 >> 2] = $$reg2mem24$0; //@line 12626
  $64 = $ReallocAsyncCtx + 72 | 0; //@line 12627
  HEAP32[$64 >> 2] = $32; //@line 12628
  $65 = $ReallocAsyncCtx + 76 | 0; //@line 12629
  HEAP32[$65 >> 2] = $34; //@line 12630
  $66 = $ReallocAsyncCtx + 80 | 0; //@line 12631
  HEAP32[$66 >> 2] = $36; //@line 12632
  sp = STACKTOP; //@line 12633
  return;
 } else if ((label | 0) == 7) {
  $70 = $$reg2mem$0 + 20 | 0; //@line 12637
  HEAP32[$70 >> 2] = (HEAP32[$70 >> 2] | 0) + $68; //@line 12640
  $73 = _equeue_tick() | 0; //@line 12641
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 12642
  _equeue_enqueue($8, $$reg2mem$0, $73) | 0; //@line 12643
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 12646
   $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 12647
   HEAP32[$74 >> 2] = $42; //@line 12648
   $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 12649
   $$expand_i1_val31 = $4 & 1; //@line 12650
   HEAP8[$75 >> 0] = $$expand_i1_val31; //@line 12651
   $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 12652
   HEAP32[$76 >> 2] = $6; //@line 12653
   $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 12654
   HEAP32[$77 >> 2] = $8; //@line 12655
   $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 12656
   HEAP32[$78 >> 2] = $10; //@line 12657
   $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 12658
   HEAP32[$79 >> 2] = $12; //@line 12659
   $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 12660
   HEAP32[$80 >> 2] = $14; //@line 12661
   $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 12662
   HEAP32[$81 >> 2] = $16; //@line 12663
   $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 12664
   HEAP32[$82 >> 2] = $18; //@line 12665
   $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 12666
   HEAP32[$83 >> 2] = $20; //@line 12667
   $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 12668
   HEAP32[$84 >> 2] = $22; //@line 12669
   $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 12670
   HEAP32[$85 >> 2] = $24; //@line 12671
   $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 12672
   HEAP32[$86 >> 2] = $26; //@line 12673
   $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 12674
   HEAP32[$87 >> 2] = $28; //@line 12675
   $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 12676
   HEAP32[$88 >> 2] = $30; //@line 12677
   $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 12678
   HEAP32[$89 >> 2] = $32; //@line 12679
   $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 12680
   HEAP32[$90 >> 2] = $34; //@line 12681
   $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 12682
   HEAP32[$91 >> 2] = $36; //@line 12683
   sp = STACKTOP; //@line 12684
   return;
  }
  ___async_unwind = 0; //@line 12687
  HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 12688
  $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 12689
  HEAP32[$74 >> 2] = $42; //@line 12690
  $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 12691
  $$expand_i1_val31 = $4 & 1; //@line 12692
  HEAP8[$75 >> 0] = $$expand_i1_val31; //@line 12693
  $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 12694
  HEAP32[$76 >> 2] = $6; //@line 12695
  $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 12696
  HEAP32[$77 >> 2] = $8; //@line 12697
  $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 12698
  HEAP32[$78 >> 2] = $10; //@line 12699
  $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 12700
  HEAP32[$79 >> 2] = $12; //@line 12701
  $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 12702
  HEAP32[$80 >> 2] = $14; //@line 12703
  $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 12704
  HEAP32[$81 >> 2] = $16; //@line 12705
  $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 12706
  HEAP32[$82 >> 2] = $18; //@line 12707
  $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 12708
  HEAP32[$83 >> 2] = $20; //@line 12709
  $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 12710
  HEAP32[$84 >> 2] = $22; //@line 12711
  $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 12712
  HEAP32[$85 >> 2] = $24; //@line 12713
  $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 12714
  HEAP32[$86 >> 2] = $26; //@line 12715
  $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 12716
  HEAP32[$87 >> 2] = $28; //@line 12717
  $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 12718
  HEAP32[$88 >> 2] = $30; //@line 12719
  $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 12720
  HEAP32[$89 >> 2] = $32; //@line 12721
  $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 12722
  HEAP32[$90 >> 2] = $34; //@line 12723
  $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 12724
  HEAP32[$91 >> 2] = $36; //@line 12725
  sp = STACKTOP; //@line 12726
  return;
 } else if ((label | 0) == 11) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 12731
  FUNCTION_TABLE_vi[$102 & 127]($$reg2mem$0 + 36 | 0); //@line 12732
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 12735
   $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 12736
   HEAP32[$105 >> 2] = $42; //@line 12737
   $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 12738
   $$expand_i1_val33 = $4 & 1; //@line 12739
   HEAP8[$106 >> 0] = $$expand_i1_val33; //@line 12740
   $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 12741
   HEAP32[$107 >> 2] = $6; //@line 12742
   $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 12743
   HEAP32[$108 >> 2] = $8; //@line 12744
   $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 12745
   HEAP32[$109 >> 2] = $10; //@line 12746
   $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 12747
   HEAP32[$110 >> 2] = $12; //@line 12748
   $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 12749
   HEAP32[$111 >> 2] = $14; //@line 12750
   $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 12751
   HEAP32[$112 >> 2] = $16; //@line 12752
   $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 12753
   HEAP32[$113 >> 2] = $18; //@line 12754
   $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 12755
   HEAP32[$114 >> 2] = $20; //@line 12756
   $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 12757
   HEAP32[$115 >> 2] = $22; //@line 12758
   $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 12759
   HEAP32[$116 >> 2] = $24; //@line 12760
   $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 12761
   HEAP32[$117 >> 2] = $26; //@line 12762
   $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 12763
   HEAP32[$118 >> 2] = $28; //@line 12764
   $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 12765
   HEAP32[$119 >> 2] = $30; //@line 12766
   $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 12767
   HEAP32[$120 >> 2] = $32; //@line 12768
   $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 12769
   HEAP32[$121 >> 2] = $34; //@line 12770
   $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 12771
   HEAP32[$122 >> 2] = $36; //@line 12772
   $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 12773
   HEAP32[$123 >> 2] = $$reg2mem$0; //@line 12774
   $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 12775
   HEAP32[$124 >> 2] = $$reg2mem24$0; //@line 12776
   sp = STACKTOP; //@line 12777
   return;
  }
  ___async_unwind = 0; //@line 12780
  HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 12781
  $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 12782
  HEAP32[$105 >> 2] = $42; //@line 12783
  $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 12784
  $$expand_i1_val33 = $4 & 1; //@line 12785
  HEAP8[$106 >> 0] = $$expand_i1_val33; //@line 12786
  $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 12787
  HEAP32[$107 >> 2] = $6; //@line 12788
  $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 12789
  HEAP32[$108 >> 2] = $8; //@line 12790
  $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 12791
  HEAP32[$109 >> 2] = $10; //@line 12792
  $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 12793
  HEAP32[$110 >> 2] = $12; //@line 12794
  $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 12795
  HEAP32[$111 >> 2] = $14; //@line 12796
  $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 12797
  HEAP32[$112 >> 2] = $16; //@line 12798
  $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 12799
  HEAP32[$113 >> 2] = $18; //@line 12800
  $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 12801
  HEAP32[$114 >> 2] = $20; //@line 12802
  $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 12803
  HEAP32[$115 >> 2] = $22; //@line 12804
  $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 12805
  HEAP32[$116 >> 2] = $24; //@line 12806
  $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 12807
  HEAP32[$117 >> 2] = $26; //@line 12808
  $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 12809
  HEAP32[$118 >> 2] = $28; //@line 12810
  $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 12811
  HEAP32[$119 >> 2] = $30; //@line 12812
  $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 12813
  HEAP32[$120 >> 2] = $32; //@line 12814
  $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 12815
  HEAP32[$121 >> 2] = $34; //@line 12816
  $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 12817
  HEAP32[$122 >> 2] = $36; //@line 12818
  $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 12819
  HEAP32[$123 >> 2] = $$reg2mem$0; //@line 12820
  $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 12821
  HEAP32[$124 >> 2] = $$reg2mem24$0; //@line 12822
  sp = STACKTOP; //@line 12823
  return;
 } else if ((label | 0) == 24) {
  $140 = _equeue_tick() | 0; //@line 12827
  if ($4) {
   $141 = $6 - $140 | 0; //@line 12829
   if (($141 | 0) < 1) {
    $143 = $8 + 40 | 0; //@line 12832
    if (HEAP32[$143 >> 2] | 0) {
     _equeue_mutex_lock($10); //@line 12836
     $146 = HEAP32[$143 >> 2] | 0; //@line 12837
     if ($146 | 0) {
      $148 = HEAP32[$12 >> 2] | 0; //@line 12840
      if ($148 | 0) {
       $151 = HEAP32[$8 + 44 >> 2] | 0; //@line 12844
       $154 = (HEAP32[$148 + 20 >> 2] | 0) - $140 | 0; //@line 12847
       $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 12851
       FUNCTION_TABLE_vii[$146 & 3]($151, $154 & ~($154 >> 31)); //@line 12852
       if (___async) {
        HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 12855
        $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 12856
        HEAP32[$158 >> 2] = $14; //@line 12857
        $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 12858
        HEAP32[$159 >> 2] = $10; //@line 12859
        $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 12860
        HEAP32[$160 >> 2] = $34; //@line 12861
        sp = STACKTOP; //@line 12862
        return;
       }
       ___async_unwind = 0; //@line 12865
       HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 12866
       $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 12867
       HEAP32[$158 >> 2] = $14; //@line 12868
       $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 12869
       HEAP32[$159 >> 2] = $10; //@line 12870
       $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 12871
       HEAP32[$160 >> 2] = $34; //@line 12872
       sp = STACKTOP; //@line 12873
       return;
      }
     }
     HEAP8[$14 >> 0] = 1; //@line 12877
     _equeue_mutex_unlock($10); //@line 12878
    }
    HEAP8[$34 >> 0] = 0; //@line 12880
    return;
   } else {
    $$065 = $141; //@line 12883
   }
  } else {
   $$065 = -1; //@line 12886
  }
  _equeue_mutex_lock($10); //@line 12888
  $161 = HEAP32[$12 >> 2] | 0; //@line 12889
  if (!$161) {
   $$2 = $$065; //@line 12892
  } else {
   $165 = (HEAP32[$161 + 20 >> 2] | 0) - $140 | 0; //@line 12896
   $168 = $165 & ~($165 >> 31); //@line 12899
   $$2 = $168 >>> 0 < $$065 >>> 0 ? $168 : $$065; //@line 12902
  }
  _equeue_mutex_unlock($10); //@line 12904
  _equeue_sema_wait($36, $$2) | 0; //@line 12905
  do {
   if (HEAP8[$34 >> 0] | 0) {
    _equeue_mutex_lock($10); //@line 12910
    if (!(HEAP8[$34 >> 0] | 0)) {
     _equeue_mutex_unlock($10); //@line 12914
     break;
    }
    HEAP8[$34 >> 0] = 0; //@line 12917
    _equeue_mutex_unlock($10); //@line 12918
    return;
   }
  } while (0);
  $174 = _equeue_tick() | 0; //@line 12922
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 12923
  _wait_ms(20); //@line 12924
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 12927
   $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 12928
   $$expand_i1_val35 = $4 & 1; //@line 12929
   HEAP8[$175 >> 0] = $$expand_i1_val35; //@line 12930
   $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 12931
   HEAP32[$176 >> 2] = $6; //@line 12932
   $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 12933
   HEAP32[$177 >> 2] = $8; //@line 12934
   $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 12935
   HEAP32[$178 >> 2] = $10; //@line 12936
   $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 12937
   HEAP32[$179 >> 2] = $12; //@line 12938
   $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 12939
   HEAP32[$180 >> 2] = $14; //@line 12940
   $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 12941
   HEAP32[$181 >> 2] = $16; //@line 12942
   $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 12943
   HEAP32[$182 >> 2] = $18; //@line 12944
   $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 12945
   HEAP32[$183 >> 2] = $20; //@line 12946
   $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 12947
   HEAP32[$184 >> 2] = $22; //@line 12948
   $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 12949
   HEAP32[$185 >> 2] = $24; //@line 12950
   $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 12951
   HEAP32[$186 >> 2] = $26; //@line 12952
   $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 12953
   HEAP32[$187 >> 2] = $28; //@line 12954
   $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 12955
   HEAP32[$188 >> 2] = $30; //@line 12956
   $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 12957
   HEAP32[$189 >> 2] = $32; //@line 12958
   $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 12959
   HEAP32[$190 >> 2] = $34; //@line 12960
   $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 12961
   HEAP32[$191 >> 2] = $36; //@line 12962
   $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 12963
   HEAP32[$192 >> 2] = $174; //@line 12964
   sp = STACKTOP; //@line 12965
   return;
  }
  ___async_unwind = 0; //@line 12968
  HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 12969
  $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 12970
  $$expand_i1_val35 = $4 & 1; //@line 12971
  HEAP8[$175 >> 0] = $$expand_i1_val35; //@line 12972
  $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 12973
  HEAP32[$176 >> 2] = $6; //@line 12974
  $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 12975
  HEAP32[$177 >> 2] = $8; //@line 12976
  $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 12977
  HEAP32[$178 >> 2] = $10; //@line 12978
  $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 12979
  HEAP32[$179 >> 2] = $12; //@line 12980
  $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 12981
  HEAP32[$180 >> 2] = $14; //@line 12982
  $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 12983
  HEAP32[$181 >> 2] = $16; //@line 12984
  $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 12985
  HEAP32[$182 >> 2] = $18; //@line 12986
  $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 12987
  HEAP32[$183 >> 2] = $20; //@line 12988
  $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 12989
  HEAP32[$184 >> 2] = $22; //@line 12990
  $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 12991
  HEAP32[$185 >> 2] = $24; //@line 12992
  $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 12993
  HEAP32[$186 >> 2] = $26; //@line 12994
  $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 12995
  HEAP32[$187 >> 2] = $28; //@line 12996
  $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 12997
  HEAP32[$188 >> 2] = $30; //@line 12998
  $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 12999
  HEAP32[$189 >> 2] = $32; //@line 13000
  $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 13001
  HEAP32[$190 >> 2] = $34; //@line 13002
  $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 13003
  HEAP32[$191 >> 2] = $36; //@line 13004
  $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 13005
  HEAP32[$192 >> 2] = $174; //@line 13006
  sp = STACKTOP; //@line 13007
  return;
 }
}
function _equeue_dispatch__async_cb_7($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$065 = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val12 = 0, $$expand_i1_val14 = 0, $$expand_i1_val16 = 0, $$reg2mem$0 = 0, $$sink$in$i$i = 0, $10 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $123 = 0, $124 = 0, $125 = 0, $127 = 0, $128 = 0, $136 = 0, $137 = 0, $139 = 0, $14 = 0, $142 = 0, $144 = 0, $147 = 0, $150 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $16 = 0, $161 = 0, $164 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $40 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $64 = 0, $66 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $98 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13039
 $4 = HEAP8[$0 + 8 >> 0] & 1; //@line 13044
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13046
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13048
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13050
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13052
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 13054
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 13056
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 13058
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 13060
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 13062
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 13064
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 13066
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 13068
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 13070
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 13072
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 13074
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 13076
 $$reg2mem$0 = HEAP32[$0 + 4 >> 2] | 0; //@line 13077
 while (1) {
  if (!$$reg2mem$0) {
   label = 24; //@line 13081
   break;
  }
  $37 = $$reg2mem$0 + 8 | 0; //@line 13084
  $38 = HEAP32[$37 >> 2] | 0; //@line 13085
  $40 = HEAP32[$$reg2mem$0 + 32 >> 2] | 0; //@line 13087
  if ($40 | 0) {
   label = 3; //@line 13090
   break;
  }
  $64 = HEAP32[$$reg2mem$0 + 24 >> 2] | 0; //@line 13094
  if (($64 | 0) > -1) {
   label = 7; //@line 13097
   break;
  }
  $88 = $$reg2mem$0 + 4 | 0; //@line 13101
  $89 = HEAP8[$88 >> 0] | 0; //@line 13102
  HEAP8[$88 >> 0] = (($89 + 1 & 255) << HEAP32[$32 >> 2] | 0) == 0 ? 1 : ($89 & 255) + 1 & 255; //@line 13111
  $98 = HEAP32[$$reg2mem$0 + 28 >> 2] | 0; //@line 13113
  if ($98 | 0) {
   label = 12; //@line 13116
   break;
  }
  _equeue_mutex_lock($18); //@line 13119
  $121 = HEAP32[$20 >> 2] | 0; //@line 13120
  L8 : do {
   if (!$121) {
    $$02329$i$i = $20; //@line 13124
    label = 21; //@line 13125
   } else {
    $123 = HEAP32[$$reg2mem$0 >> 2] | 0; //@line 13127
    $$025$i$i = $20; //@line 13128
    $125 = $121; //@line 13128
    while (1) {
     $124 = HEAP32[$125 >> 2] | 0; //@line 13130
     if ($124 >>> 0 >= $123 >>> 0) {
      break;
     }
     $127 = $125 + 8 | 0; //@line 13135
     $128 = HEAP32[$127 >> 2] | 0; //@line 13136
     if (!$128) {
      $$02329$i$i = $127; //@line 13139
      label = 21; //@line 13140
      break L8;
     } else {
      $$025$i$i = $127; //@line 13143
      $125 = $128; //@line 13143
     }
    }
    if (($124 | 0) == ($123 | 0)) {
     HEAP32[$$reg2mem$0 + 12 >> 2] = $125; //@line 13149
     $$02330$i$i = $$025$i$i; //@line 13152
     $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 13152
    } else {
     $$02329$i$i = $$025$i$i; //@line 13154
     label = 21; //@line 13155
    }
   }
  } while (0);
  if ((label | 0) == 21) {
   label = 0; //@line 13160
   HEAP32[$$reg2mem$0 + 12 >> 2] = 0; //@line 13162
   $$02330$i$i = $$02329$i$i; //@line 13163
   $$sink$in$i$i = $$02329$i$i; //@line 13163
  }
  HEAP32[$37 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 13166
  HEAP32[$$02330$i$i >> 2] = $$reg2mem$0; //@line 13167
  _equeue_mutex_unlock($18); //@line 13168
  $$reg2mem$0 = $38; //@line 13169
 }
 if ((label | 0) == 3) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 13173
  FUNCTION_TABLE_vi[$40 & 127]($$reg2mem$0 + 36 | 0); //@line 13174
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 13177
   $43 = $ReallocAsyncCtx + 4 | 0; //@line 13178
   HEAP32[$43 >> 2] = $38; //@line 13179
   $44 = $ReallocAsyncCtx + 8 | 0; //@line 13180
   $$expand_i1_val = $4 & 1; //@line 13181
   HEAP8[$44 >> 0] = $$expand_i1_val; //@line 13182
   $45 = $ReallocAsyncCtx + 12 | 0; //@line 13183
   HEAP32[$45 >> 2] = $6; //@line 13184
   $46 = $ReallocAsyncCtx + 16 | 0; //@line 13185
   HEAP32[$46 >> 2] = $8; //@line 13186
   $47 = $ReallocAsyncCtx + 20 | 0; //@line 13187
   HEAP32[$47 >> 2] = $10; //@line 13188
   $48 = $ReallocAsyncCtx + 24 | 0; //@line 13189
   HEAP32[$48 >> 2] = $12; //@line 13190
   $49 = $ReallocAsyncCtx + 28 | 0; //@line 13191
   HEAP32[$49 >> 2] = $14; //@line 13192
   $50 = $ReallocAsyncCtx + 32 | 0; //@line 13193
   HEAP32[$50 >> 2] = $16; //@line 13194
   $51 = $ReallocAsyncCtx + 36 | 0; //@line 13195
   HEAP32[$51 >> 2] = $18; //@line 13196
   $52 = $ReallocAsyncCtx + 40 | 0; //@line 13197
   HEAP32[$52 >> 2] = $20; //@line 13198
   $53 = $ReallocAsyncCtx + 44 | 0; //@line 13199
   HEAP32[$53 >> 2] = $22; //@line 13200
   $54 = $ReallocAsyncCtx + 48 | 0; //@line 13201
   HEAP32[$54 >> 2] = $24; //@line 13202
   $55 = $ReallocAsyncCtx + 52 | 0; //@line 13203
   HEAP32[$55 >> 2] = $26; //@line 13204
   $56 = $ReallocAsyncCtx + 56 | 0; //@line 13205
   HEAP32[$56 >> 2] = $$reg2mem$0; //@line 13206
   $57 = $ReallocAsyncCtx + 60 | 0; //@line 13207
   HEAP32[$57 >> 2] = $28; //@line 13208
   $58 = $ReallocAsyncCtx + 64 | 0; //@line 13209
   HEAP32[$58 >> 2] = $30; //@line 13210
   $59 = $ReallocAsyncCtx + 68 | 0; //@line 13211
   HEAP32[$59 >> 2] = $37; //@line 13212
   $60 = $ReallocAsyncCtx + 72 | 0; //@line 13213
   HEAP32[$60 >> 2] = $32; //@line 13214
   $61 = $ReallocAsyncCtx + 76 | 0; //@line 13215
   HEAP32[$61 >> 2] = $34; //@line 13216
   $62 = $ReallocAsyncCtx + 80 | 0; //@line 13217
   HEAP32[$62 >> 2] = $36; //@line 13218
   sp = STACKTOP; //@line 13219
   return;
  }
  ___async_unwind = 0; //@line 13222
  HEAP32[$ReallocAsyncCtx >> 2] = 27; //@line 13223
  $43 = $ReallocAsyncCtx + 4 | 0; //@line 13224
  HEAP32[$43 >> 2] = $38; //@line 13225
  $44 = $ReallocAsyncCtx + 8 | 0; //@line 13226
  $$expand_i1_val = $4 & 1; //@line 13227
  HEAP8[$44 >> 0] = $$expand_i1_val; //@line 13228
  $45 = $ReallocAsyncCtx + 12 | 0; //@line 13229
  HEAP32[$45 >> 2] = $6; //@line 13230
  $46 = $ReallocAsyncCtx + 16 | 0; //@line 13231
  HEAP32[$46 >> 2] = $8; //@line 13232
  $47 = $ReallocAsyncCtx + 20 | 0; //@line 13233
  HEAP32[$47 >> 2] = $10; //@line 13234
  $48 = $ReallocAsyncCtx + 24 | 0; //@line 13235
  HEAP32[$48 >> 2] = $12; //@line 13236
  $49 = $ReallocAsyncCtx + 28 | 0; //@line 13237
  HEAP32[$49 >> 2] = $14; //@line 13238
  $50 = $ReallocAsyncCtx + 32 | 0; //@line 13239
  HEAP32[$50 >> 2] = $16; //@line 13240
  $51 = $ReallocAsyncCtx + 36 | 0; //@line 13241
  HEAP32[$51 >> 2] = $18; //@line 13242
  $52 = $ReallocAsyncCtx + 40 | 0; //@line 13243
  HEAP32[$52 >> 2] = $20; //@line 13244
  $53 = $ReallocAsyncCtx + 44 | 0; //@line 13245
  HEAP32[$53 >> 2] = $22; //@line 13246
  $54 = $ReallocAsyncCtx + 48 | 0; //@line 13247
  HEAP32[$54 >> 2] = $24; //@line 13248
  $55 = $ReallocAsyncCtx + 52 | 0; //@line 13249
  HEAP32[$55 >> 2] = $26; //@line 13250
  $56 = $ReallocAsyncCtx + 56 | 0; //@line 13251
  HEAP32[$56 >> 2] = $$reg2mem$0; //@line 13252
  $57 = $ReallocAsyncCtx + 60 | 0; //@line 13253
  HEAP32[$57 >> 2] = $28; //@line 13254
  $58 = $ReallocAsyncCtx + 64 | 0; //@line 13255
  HEAP32[$58 >> 2] = $30; //@line 13256
  $59 = $ReallocAsyncCtx + 68 | 0; //@line 13257
  HEAP32[$59 >> 2] = $37; //@line 13258
  $60 = $ReallocAsyncCtx + 72 | 0; //@line 13259
  HEAP32[$60 >> 2] = $32; //@line 13260
  $61 = $ReallocAsyncCtx + 76 | 0; //@line 13261
  HEAP32[$61 >> 2] = $34; //@line 13262
  $62 = $ReallocAsyncCtx + 80 | 0; //@line 13263
  HEAP32[$62 >> 2] = $36; //@line 13264
  sp = STACKTOP; //@line 13265
  return;
 } else if ((label | 0) == 7) {
  $66 = $$reg2mem$0 + 20 | 0; //@line 13269
  HEAP32[$66 >> 2] = (HEAP32[$66 >> 2] | 0) + $64; //@line 13272
  $69 = _equeue_tick() | 0; //@line 13273
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 13274
  _equeue_enqueue($8, $$reg2mem$0, $69) | 0; //@line 13275
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 13278
   $70 = $ReallocAsyncCtx4 + 4 | 0; //@line 13279
   HEAP32[$70 >> 2] = $38; //@line 13280
   $71 = $ReallocAsyncCtx4 + 8 | 0; //@line 13281
   $$expand_i1_val12 = $4 & 1; //@line 13282
   HEAP8[$71 >> 0] = $$expand_i1_val12; //@line 13283
   $72 = $ReallocAsyncCtx4 + 12 | 0; //@line 13284
   HEAP32[$72 >> 2] = $6; //@line 13285
   $73 = $ReallocAsyncCtx4 + 16 | 0; //@line 13286
   HEAP32[$73 >> 2] = $8; //@line 13287
   $74 = $ReallocAsyncCtx4 + 20 | 0; //@line 13288
   HEAP32[$74 >> 2] = $10; //@line 13289
   $75 = $ReallocAsyncCtx4 + 24 | 0; //@line 13290
   HEAP32[$75 >> 2] = $12; //@line 13291
   $76 = $ReallocAsyncCtx4 + 28 | 0; //@line 13292
   HEAP32[$76 >> 2] = $14; //@line 13293
   $77 = $ReallocAsyncCtx4 + 32 | 0; //@line 13294
   HEAP32[$77 >> 2] = $16; //@line 13295
   $78 = $ReallocAsyncCtx4 + 36 | 0; //@line 13296
   HEAP32[$78 >> 2] = $18; //@line 13297
   $79 = $ReallocAsyncCtx4 + 40 | 0; //@line 13298
   HEAP32[$79 >> 2] = $20; //@line 13299
   $80 = $ReallocAsyncCtx4 + 44 | 0; //@line 13300
   HEAP32[$80 >> 2] = $22; //@line 13301
   $81 = $ReallocAsyncCtx4 + 48 | 0; //@line 13302
   HEAP32[$81 >> 2] = $24; //@line 13303
   $82 = $ReallocAsyncCtx4 + 52 | 0; //@line 13304
   HEAP32[$82 >> 2] = $26; //@line 13305
   $83 = $ReallocAsyncCtx4 + 56 | 0; //@line 13306
   HEAP32[$83 >> 2] = $28; //@line 13307
   $84 = $ReallocAsyncCtx4 + 60 | 0; //@line 13308
   HEAP32[$84 >> 2] = $30; //@line 13309
   $85 = $ReallocAsyncCtx4 + 64 | 0; //@line 13310
   HEAP32[$85 >> 2] = $32; //@line 13311
   $86 = $ReallocAsyncCtx4 + 68 | 0; //@line 13312
   HEAP32[$86 >> 2] = $34; //@line 13313
   $87 = $ReallocAsyncCtx4 + 72 | 0; //@line 13314
   HEAP32[$87 >> 2] = $36; //@line 13315
   sp = STACKTOP; //@line 13316
   return;
  }
  ___async_unwind = 0; //@line 13319
  HEAP32[$ReallocAsyncCtx4 >> 2] = 28; //@line 13320
  $70 = $ReallocAsyncCtx4 + 4 | 0; //@line 13321
  HEAP32[$70 >> 2] = $38; //@line 13322
  $71 = $ReallocAsyncCtx4 + 8 | 0; //@line 13323
  $$expand_i1_val12 = $4 & 1; //@line 13324
  HEAP8[$71 >> 0] = $$expand_i1_val12; //@line 13325
  $72 = $ReallocAsyncCtx4 + 12 | 0; //@line 13326
  HEAP32[$72 >> 2] = $6; //@line 13327
  $73 = $ReallocAsyncCtx4 + 16 | 0; //@line 13328
  HEAP32[$73 >> 2] = $8; //@line 13329
  $74 = $ReallocAsyncCtx4 + 20 | 0; //@line 13330
  HEAP32[$74 >> 2] = $10; //@line 13331
  $75 = $ReallocAsyncCtx4 + 24 | 0; //@line 13332
  HEAP32[$75 >> 2] = $12; //@line 13333
  $76 = $ReallocAsyncCtx4 + 28 | 0; //@line 13334
  HEAP32[$76 >> 2] = $14; //@line 13335
  $77 = $ReallocAsyncCtx4 + 32 | 0; //@line 13336
  HEAP32[$77 >> 2] = $16; //@line 13337
  $78 = $ReallocAsyncCtx4 + 36 | 0; //@line 13338
  HEAP32[$78 >> 2] = $18; //@line 13339
  $79 = $ReallocAsyncCtx4 + 40 | 0; //@line 13340
  HEAP32[$79 >> 2] = $20; //@line 13341
  $80 = $ReallocAsyncCtx4 + 44 | 0; //@line 13342
  HEAP32[$80 >> 2] = $22; //@line 13343
  $81 = $ReallocAsyncCtx4 + 48 | 0; //@line 13344
  HEAP32[$81 >> 2] = $24; //@line 13345
  $82 = $ReallocAsyncCtx4 + 52 | 0; //@line 13346
  HEAP32[$82 >> 2] = $26; //@line 13347
  $83 = $ReallocAsyncCtx4 + 56 | 0; //@line 13348
  HEAP32[$83 >> 2] = $28; //@line 13349
  $84 = $ReallocAsyncCtx4 + 60 | 0; //@line 13350
  HEAP32[$84 >> 2] = $30; //@line 13351
  $85 = $ReallocAsyncCtx4 + 64 | 0; //@line 13352
  HEAP32[$85 >> 2] = $32; //@line 13353
  $86 = $ReallocAsyncCtx4 + 68 | 0; //@line 13354
  HEAP32[$86 >> 2] = $34; //@line 13355
  $87 = $ReallocAsyncCtx4 + 72 | 0; //@line 13356
  HEAP32[$87 >> 2] = $36; //@line 13357
  sp = STACKTOP; //@line 13358
  return;
 } else if ((label | 0) == 12) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 13363
  FUNCTION_TABLE_vi[$98 & 127]($$reg2mem$0 + 36 | 0); //@line 13364
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 13367
   $101 = $ReallocAsyncCtx2 + 4 | 0; //@line 13368
   HEAP32[$101 >> 2] = $38; //@line 13369
   $102 = $ReallocAsyncCtx2 + 8 | 0; //@line 13370
   $$expand_i1_val14 = $4 & 1; //@line 13371
   HEAP8[$102 >> 0] = $$expand_i1_val14; //@line 13372
   $103 = $ReallocAsyncCtx2 + 12 | 0; //@line 13373
   HEAP32[$103 >> 2] = $6; //@line 13374
   $104 = $ReallocAsyncCtx2 + 16 | 0; //@line 13375
   HEAP32[$104 >> 2] = $8; //@line 13376
   $105 = $ReallocAsyncCtx2 + 20 | 0; //@line 13377
   HEAP32[$105 >> 2] = $10; //@line 13378
   $106 = $ReallocAsyncCtx2 + 24 | 0; //@line 13379
   HEAP32[$106 >> 2] = $12; //@line 13380
   $107 = $ReallocAsyncCtx2 + 28 | 0; //@line 13381
   HEAP32[$107 >> 2] = $14; //@line 13382
   $108 = $ReallocAsyncCtx2 + 32 | 0; //@line 13383
   HEAP32[$108 >> 2] = $16; //@line 13384
   $109 = $ReallocAsyncCtx2 + 36 | 0; //@line 13385
   HEAP32[$109 >> 2] = $18; //@line 13386
   $110 = $ReallocAsyncCtx2 + 40 | 0; //@line 13387
   HEAP32[$110 >> 2] = $20; //@line 13388
   $111 = $ReallocAsyncCtx2 + 44 | 0; //@line 13389
   HEAP32[$111 >> 2] = $22; //@line 13390
   $112 = $ReallocAsyncCtx2 + 48 | 0; //@line 13391
   HEAP32[$112 >> 2] = $24; //@line 13392
   $113 = $ReallocAsyncCtx2 + 52 | 0; //@line 13393
   HEAP32[$113 >> 2] = $26; //@line 13394
   $114 = $ReallocAsyncCtx2 + 56 | 0; //@line 13395
   HEAP32[$114 >> 2] = $28; //@line 13396
   $115 = $ReallocAsyncCtx2 + 60 | 0; //@line 13397
   HEAP32[$115 >> 2] = $30; //@line 13398
   $116 = $ReallocAsyncCtx2 + 64 | 0; //@line 13399
   HEAP32[$116 >> 2] = $32; //@line 13400
   $117 = $ReallocAsyncCtx2 + 68 | 0; //@line 13401
   HEAP32[$117 >> 2] = $34; //@line 13402
   $118 = $ReallocAsyncCtx2 + 72 | 0; //@line 13403
   HEAP32[$118 >> 2] = $36; //@line 13404
   $119 = $ReallocAsyncCtx2 + 76 | 0; //@line 13405
   HEAP32[$119 >> 2] = $$reg2mem$0; //@line 13406
   $120 = $ReallocAsyncCtx2 + 80 | 0; //@line 13407
   HEAP32[$120 >> 2] = $37; //@line 13408
   sp = STACKTOP; //@line 13409
   return;
  }
  ___async_unwind = 0; //@line 13412
  HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 13413
  $101 = $ReallocAsyncCtx2 + 4 | 0; //@line 13414
  HEAP32[$101 >> 2] = $38; //@line 13415
  $102 = $ReallocAsyncCtx2 + 8 | 0; //@line 13416
  $$expand_i1_val14 = $4 & 1; //@line 13417
  HEAP8[$102 >> 0] = $$expand_i1_val14; //@line 13418
  $103 = $ReallocAsyncCtx2 + 12 | 0; //@line 13419
  HEAP32[$103 >> 2] = $6; //@line 13420
  $104 = $ReallocAsyncCtx2 + 16 | 0; //@line 13421
  HEAP32[$104 >> 2] = $8; //@line 13422
  $105 = $ReallocAsyncCtx2 + 20 | 0; //@line 13423
  HEAP32[$105 >> 2] = $10; //@line 13424
  $106 = $ReallocAsyncCtx2 + 24 | 0; //@line 13425
  HEAP32[$106 >> 2] = $12; //@line 13426
  $107 = $ReallocAsyncCtx2 + 28 | 0; //@line 13427
  HEAP32[$107 >> 2] = $14; //@line 13428
  $108 = $ReallocAsyncCtx2 + 32 | 0; //@line 13429
  HEAP32[$108 >> 2] = $16; //@line 13430
  $109 = $ReallocAsyncCtx2 + 36 | 0; //@line 13431
  HEAP32[$109 >> 2] = $18; //@line 13432
  $110 = $ReallocAsyncCtx2 + 40 | 0; //@line 13433
  HEAP32[$110 >> 2] = $20; //@line 13434
  $111 = $ReallocAsyncCtx2 + 44 | 0; //@line 13435
  HEAP32[$111 >> 2] = $22; //@line 13436
  $112 = $ReallocAsyncCtx2 + 48 | 0; //@line 13437
  HEAP32[$112 >> 2] = $24; //@line 13438
  $113 = $ReallocAsyncCtx2 + 52 | 0; //@line 13439
  HEAP32[$113 >> 2] = $26; //@line 13440
  $114 = $ReallocAsyncCtx2 + 56 | 0; //@line 13441
  HEAP32[$114 >> 2] = $28; //@line 13442
  $115 = $ReallocAsyncCtx2 + 60 | 0; //@line 13443
  HEAP32[$115 >> 2] = $30; //@line 13444
  $116 = $ReallocAsyncCtx2 + 64 | 0; //@line 13445
  HEAP32[$116 >> 2] = $32; //@line 13446
  $117 = $ReallocAsyncCtx2 + 68 | 0; //@line 13447
  HEAP32[$117 >> 2] = $34; //@line 13448
  $118 = $ReallocAsyncCtx2 + 72 | 0; //@line 13449
  HEAP32[$118 >> 2] = $36; //@line 13450
  $119 = $ReallocAsyncCtx2 + 76 | 0; //@line 13451
  HEAP32[$119 >> 2] = $$reg2mem$0; //@line 13452
  $120 = $ReallocAsyncCtx2 + 80 | 0; //@line 13453
  HEAP32[$120 >> 2] = $37; //@line 13454
  sp = STACKTOP; //@line 13455
  return;
 } else if ((label | 0) == 24) {
  $136 = _equeue_tick() | 0; //@line 13459
  if ($4) {
   $137 = $6 - $136 | 0; //@line 13461
   if (($137 | 0) < 1) {
    $139 = $8 + 40 | 0; //@line 13464
    if (HEAP32[$139 >> 2] | 0) {
     _equeue_mutex_lock($10); //@line 13468
     $142 = HEAP32[$139 >> 2] | 0; //@line 13469
     if ($142 | 0) {
      $144 = HEAP32[$12 >> 2] | 0; //@line 13472
      if ($144 | 0) {
       $147 = HEAP32[$8 + 44 >> 2] | 0; //@line 13476
       $150 = (HEAP32[$144 + 20 >> 2] | 0) - $136 | 0; //@line 13479
       $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 13483
       FUNCTION_TABLE_vii[$142 & 3]($147, $150 & ~($150 >> 31)); //@line 13484
       if (___async) {
        HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 13487
        $154 = $ReallocAsyncCtx3 + 4 | 0; //@line 13488
        HEAP32[$154 >> 2] = $14; //@line 13489
        $155 = $ReallocAsyncCtx3 + 8 | 0; //@line 13490
        HEAP32[$155 >> 2] = $10; //@line 13491
        $156 = $ReallocAsyncCtx3 + 12 | 0; //@line 13492
        HEAP32[$156 >> 2] = $34; //@line 13493
        sp = STACKTOP; //@line 13494
        return;
       }
       ___async_unwind = 0; //@line 13497
       HEAP32[$ReallocAsyncCtx3 >> 2] = 30; //@line 13498
       $154 = $ReallocAsyncCtx3 + 4 | 0; //@line 13499
       HEAP32[$154 >> 2] = $14; //@line 13500
       $155 = $ReallocAsyncCtx3 + 8 | 0; //@line 13501
       HEAP32[$155 >> 2] = $10; //@line 13502
       $156 = $ReallocAsyncCtx3 + 12 | 0; //@line 13503
       HEAP32[$156 >> 2] = $34; //@line 13504
       sp = STACKTOP; //@line 13505
       return;
      }
     }
     HEAP8[$14 >> 0] = 1; //@line 13509
     _equeue_mutex_unlock($10); //@line 13510
    }
    HEAP8[$34 >> 0] = 0; //@line 13512
    return;
   } else {
    $$065 = $137; //@line 13515
   }
  } else {
   $$065 = -1; //@line 13518
  }
  _equeue_mutex_lock($10); //@line 13520
  $157 = HEAP32[$12 >> 2] | 0; //@line 13521
  if (!$157) {
   $$2 = $$065; //@line 13524
  } else {
   $161 = (HEAP32[$157 + 20 >> 2] | 0) - $136 | 0; //@line 13528
   $164 = $161 & ~($161 >> 31); //@line 13531
   $$2 = $164 >>> 0 < $$065 >>> 0 ? $164 : $$065; //@line 13534
  }
  _equeue_mutex_unlock($10); //@line 13536
  _equeue_sema_wait($36, $$2) | 0; //@line 13537
  do {
   if (HEAP8[$34 >> 0] | 0) {
    _equeue_mutex_lock($10); //@line 13542
    if (!(HEAP8[$34 >> 0] | 0)) {
     _equeue_mutex_unlock($10); //@line 13546
     break;
    }
    HEAP8[$34 >> 0] = 0; //@line 13549
    _equeue_mutex_unlock($10); //@line 13550
    return;
   }
  } while (0);
  $170 = _equeue_tick() | 0; //@line 13554
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 13555
  _wait_ms(20); //@line 13556
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 13559
   $171 = $ReallocAsyncCtx5 + 4 | 0; //@line 13560
   $$expand_i1_val16 = $4 & 1; //@line 13561
   HEAP8[$171 >> 0] = $$expand_i1_val16; //@line 13562
   $172 = $ReallocAsyncCtx5 + 8 | 0; //@line 13563
   HEAP32[$172 >> 2] = $6; //@line 13564
   $173 = $ReallocAsyncCtx5 + 12 | 0; //@line 13565
   HEAP32[$173 >> 2] = $8; //@line 13566
   $174 = $ReallocAsyncCtx5 + 16 | 0; //@line 13567
   HEAP32[$174 >> 2] = $10; //@line 13568
   $175 = $ReallocAsyncCtx5 + 20 | 0; //@line 13569
   HEAP32[$175 >> 2] = $12; //@line 13570
   $176 = $ReallocAsyncCtx5 + 24 | 0; //@line 13571
   HEAP32[$176 >> 2] = $14; //@line 13572
   $177 = $ReallocAsyncCtx5 + 28 | 0; //@line 13573
   HEAP32[$177 >> 2] = $16; //@line 13574
   $178 = $ReallocAsyncCtx5 + 32 | 0; //@line 13575
   HEAP32[$178 >> 2] = $18; //@line 13576
   $179 = $ReallocAsyncCtx5 + 36 | 0; //@line 13577
   HEAP32[$179 >> 2] = $20; //@line 13578
   $180 = $ReallocAsyncCtx5 + 40 | 0; //@line 13579
   HEAP32[$180 >> 2] = $22; //@line 13580
   $181 = $ReallocAsyncCtx5 + 44 | 0; //@line 13581
   HEAP32[$181 >> 2] = $24; //@line 13582
   $182 = $ReallocAsyncCtx5 + 48 | 0; //@line 13583
   HEAP32[$182 >> 2] = $26; //@line 13584
   $183 = $ReallocAsyncCtx5 + 52 | 0; //@line 13585
   HEAP32[$183 >> 2] = $28; //@line 13586
   $184 = $ReallocAsyncCtx5 + 56 | 0; //@line 13587
   HEAP32[$184 >> 2] = $30; //@line 13588
   $185 = $ReallocAsyncCtx5 + 60 | 0; //@line 13589
   HEAP32[$185 >> 2] = $32; //@line 13590
   $186 = $ReallocAsyncCtx5 + 64 | 0; //@line 13591
   HEAP32[$186 >> 2] = $34; //@line 13592
   $187 = $ReallocAsyncCtx5 + 68 | 0; //@line 13593
   HEAP32[$187 >> 2] = $36; //@line 13594
   $188 = $ReallocAsyncCtx5 + 72 | 0; //@line 13595
   HEAP32[$188 >> 2] = $170; //@line 13596
   sp = STACKTOP; //@line 13597
   return;
  }
  ___async_unwind = 0; //@line 13600
  HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 13601
  $171 = $ReallocAsyncCtx5 + 4 | 0; //@line 13602
  $$expand_i1_val16 = $4 & 1; //@line 13603
  HEAP8[$171 >> 0] = $$expand_i1_val16; //@line 13604
  $172 = $ReallocAsyncCtx5 + 8 | 0; //@line 13605
  HEAP32[$172 >> 2] = $6; //@line 13606
  $173 = $ReallocAsyncCtx5 + 12 | 0; //@line 13607
  HEAP32[$173 >> 2] = $8; //@line 13608
  $174 = $ReallocAsyncCtx5 + 16 | 0; //@line 13609
  HEAP32[$174 >> 2] = $10; //@line 13610
  $175 = $ReallocAsyncCtx5 + 20 | 0; //@line 13611
  HEAP32[$175 >> 2] = $12; //@line 13612
  $176 = $ReallocAsyncCtx5 + 24 | 0; //@line 13613
  HEAP32[$176 >> 2] = $14; //@line 13614
  $177 = $ReallocAsyncCtx5 + 28 | 0; //@line 13615
  HEAP32[$177 >> 2] = $16; //@line 13616
  $178 = $ReallocAsyncCtx5 + 32 | 0; //@line 13617
  HEAP32[$178 >> 2] = $18; //@line 13618
  $179 = $ReallocAsyncCtx5 + 36 | 0; //@line 13619
  HEAP32[$179 >> 2] = $20; //@line 13620
  $180 = $ReallocAsyncCtx5 + 40 | 0; //@line 13621
  HEAP32[$180 >> 2] = $22; //@line 13622
  $181 = $ReallocAsyncCtx5 + 44 | 0; //@line 13623
  HEAP32[$181 >> 2] = $24; //@line 13624
  $182 = $ReallocAsyncCtx5 + 48 | 0; //@line 13625
  HEAP32[$182 >> 2] = $26; //@line 13626
  $183 = $ReallocAsyncCtx5 + 52 | 0; //@line 13627
  HEAP32[$183 >> 2] = $28; //@line 13628
  $184 = $ReallocAsyncCtx5 + 56 | 0; //@line 13629
  HEAP32[$184 >> 2] = $30; //@line 13630
  $185 = $ReallocAsyncCtx5 + 60 | 0; //@line 13631
  HEAP32[$185 >> 2] = $32; //@line 13632
  $186 = $ReallocAsyncCtx5 + 64 | 0; //@line 13633
  HEAP32[$186 >> 2] = $34; //@line 13634
  $187 = $ReallocAsyncCtx5 + 68 | 0; //@line 13635
  HEAP32[$187 >> 2] = $36; //@line 13636
  $188 = $ReallocAsyncCtx5 + 72 | 0; //@line 13637
  HEAP32[$188 >> 2] = $170; //@line 13638
  sp = STACKTOP; //@line 13639
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
 sp = STACKTOP; //@line 6984
 STACKTOP = STACKTOP + 64 | 0; //@line 6985
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 6985
 $5 = sp + 16 | 0; //@line 6986
 $6 = sp; //@line 6987
 $7 = sp + 24 | 0; //@line 6988
 $8 = sp + 8 | 0; //@line 6989
 $9 = sp + 20 | 0; //@line 6990
 HEAP32[$5 >> 2] = $1; //@line 6991
 $10 = ($0 | 0) != 0; //@line 6992
 $11 = $7 + 40 | 0; //@line 6993
 $12 = $11; //@line 6994
 $13 = $7 + 39 | 0; //@line 6995
 $14 = $8 + 4 | 0; //@line 6996
 $$0243 = 0; //@line 6997
 $$0247 = 0; //@line 6997
 $$0269 = 0; //@line 6997
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 7006
     $$1248 = -1; //@line 7007
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 7011
     break;
    }
   } else {
    $$1248 = $$0247; //@line 7015
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 7018
  $21 = HEAP8[$20 >> 0] | 0; //@line 7019
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 7022
   break;
  } else {
   $23 = $21; //@line 7025
   $25 = $20; //@line 7025
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 7030
     $27 = $25; //@line 7030
     label = 9; //@line 7031
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 7036
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 7043
   HEAP32[$5 >> 2] = $24; //@line 7044
   $23 = HEAP8[$24 >> 0] | 0; //@line 7046
   $25 = $24; //@line 7046
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 7051
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 7056
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 7059
     $27 = $27 + 2 | 0; //@line 7060
     HEAP32[$5 >> 2] = $27; //@line 7061
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 7068
      break;
     } else {
      $$0249303 = $30; //@line 7065
      label = 9; //@line 7066
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 7076
  if ($10) {
   _out_670($0, $20, $36); //@line 7078
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 7082
   $$0247 = $$1248; //@line 7082
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 7090
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 7091
  if ($43) {
   $$0253 = -1; //@line 7093
   $$1270 = $$0269; //@line 7093
   $$sink = 1; //@line 7093
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 7103
    $$1270 = 1; //@line 7103
    $$sink = 3; //@line 7103
   } else {
    $$0253 = -1; //@line 7105
    $$1270 = $$0269; //@line 7105
    $$sink = 1; //@line 7105
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 7108
  HEAP32[$5 >> 2] = $51; //@line 7109
  $52 = HEAP8[$51 >> 0] | 0; //@line 7110
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 7112
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 7119
   $$lcssa291 = $52; //@line 7119
   $$lcssa292 = $51; //@line 7119
  } else {
   $$0262309 = 0; //@line 7121
   $60 = $52; //@line 7121
   $65 = $51; //@line 7121
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 7126
    $64 = $65 + 1 | 0; //@line 7127
    HEAP32[$5 >> 2] = $64; //@line 7128
    $66 = HEAP8[$64 >> 0] | 0; //@line 7129
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 7131
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 7138
     $$lcssa291 = $66; //@line 7138
     $$lcssa292 = $64; //@line 7138
     break;
    } else {
     $$0262309 = $63; //@line 7141
     $60 = $66; //@line 7141
     $65 = $64; //@line 7141
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 7153
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 7155
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 7160
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 7165
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 7177
     $$2271 = 1; //@line 7177
     $storemerge274 = $79 + 3 | 0; //@line 7177
    } else {
     label = 23; //@line 7179
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 7183
    if ($$1270 | 0) {
     $$0 = -1; //@line 7186
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7201
     $106 = HEAP32[$105 >> 2] | 0; //@line 7202
     HEAP32[$2 >> 2] = $105 + 4; //@line 7204
     $363 = $106; //@line 7205
    } else {
     $363 = 0; //@line 7207
    }
    $$0259 = $363; //@line 7211
    $$2271 = 0; //@line 7211
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 7211
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 7213
   $109 = ($$0259 | 0) < 0; //@line 7214
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 7219
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 7219
   $$3272 = $$2271; //@line 7219
   $115 = $storemerge274; //@line 7219
  } else {
   $112 = _getint_671($5) | 0; //@line 7221
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 7224
    break;
   }
   $$1260 = $112; //@line 7228
   $$1263 = $$0262$lcssa; //@line 7228
   $$3272 = $$1270; //@line 7228
   $115 = HEAP32[$5 >> 2] | 0; //@line 7228
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 7239
     $156 = _getint_671($5) | 0; //@line 7240
     $$0254 = $156; //@line 7242
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 7242
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 7251
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 7256
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 7261
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 7268
      $144 = $125 + 4 | 0; //@line 7272
      HEAP32[$5 >> 2] = $144; //@line 7273
      $$0254 = $140; //@line 7274
      $$pre345 = $144; //@line 7274
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 7280
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7295
     $152 = HEAP32[$151 >> 2] | 0; //@line 7296
     HEAP32[$2 >> 2] = $151 + 4; //@line 7298
     $364 = $152; //@line 7299
    } else {
     $364 = 0; //@line 7301
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 7304
    HEAP32[$5 >> 2] = $154; //@line 7305
    $$0254 = $364; //@line 7306
    $$pre345 = $154; //@line 7306
   } else {
    $$0254 = -1; //@line 7308
    $$pre345 = $115; //@line 7308
   }
  } while (0);
  $$0252 = 0; //@line 7311
  $158 = $$pre345; //@line 7311
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 7318
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 7321
   HEAP32[$5 >> 2] = $158; //@line 7322
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (1383 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 7327
   $168 = $167 & 255; //@line 7328
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 7332
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 7339
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 7343
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 7347
     break L1;
    } else {
     label = 50; //@line 7350
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 7355
     $176 = $3 + ($$0253 << 3) | 0; //@line 7357
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 7362
     $182 = $6; //@line 7363
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 7365
     HEAP32[$182 + 4 >> 2] = $181; //@line 7368
     label = 50; //@line 7369
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 7373
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 7376
    $187 = HEAP32[$5 >> 2] | 0; //@line 7378
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 7382
   if ($10) {
    $187 = $158; //@line 7384
   } else {
    $$0243 = 0; //@line 7386
    $$0247 = $$1248; //@line 7386
    $$0269 = $$3272; //@line 7386
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 7392
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 7398
  $196 = $$1263 & -65537; //@line 7401
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 7402
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7410
       $$0243 = 0; //@line 7411
       $$0247 = $$1248; //@line 7411
       $$0269 = $$3272; //@line 7411
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7417
       $$0243 = 0; //@line 7418
       $$0247 = $$1248; //@line 7418
       $$0269 = $$3272; //@line 7418
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 7426
       HEAP32[$208 >> 2] = $$1248; //@line 7428
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 7431
       $$0243 = 0; //@line 7432
       $$0247 = $$1248; //@line 7432
       $$0269 = $$3272; //@line 7432
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 7439
       $$0243 = 0; //@line 7440
       $$0247 = $$1248; //@line 7440
       $$0269 = $$3272; //@line 7440
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 7447
       $$0243 = 0; //@line 7448
       $$0247 = $$1248; //@line 7448
       $$0269 = $$3272; //@line 7448
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7454
       $$0243 = 0; //@line 7455
       $$0247 = $$1248; //@line 7455
       $$0269 = $$3272; //@line 7455
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 7463
       HEAP32[$220 >> 2] = $$1248; //@line 7465
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 7468
       $$0243 = 0; //@line 7469
       $$0247 = $$1248; //@line 7469
       $$0269 = $$3272; //@line 7469
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 7474
       $$0247 = $$1248; //@line 7474
       $$0269 = $$3272; //@line 7474
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 7484
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 7484
     $$3265 = $$1263$ | 8; //@line 7484
     label = 62; //@line 7485
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 7489
     $$1255 = $$0254; //@line 7489
     $$3265 = $$1263$; //@line 7489
     label = 62; //@line 7490
     break;
    }
   case 111:
    {
     $242 = $6; //@line 7494
     $244 = HEAP32[$242 >> 2] | 0; //@line 7496
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 7499
     $248 = _fmt_o($244, $247, $11) | 0; //@line 7500
     $252 = $12 - $248 | 0; //@line 7504
     $$0228 = $248; //@line 7509
     $$1233 = 0; //@line 7509
     $$1238 = 1847; //@line 7509
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 7509
     $$4266 = $$1263$; //@line 7509
     $281 = $244; //@line 7509
     $283 = $247; //@line 7509
     label = 68; //@line 7510
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 7514
     $258 = HEAP32[$256 >> 2] | 0; //@line 7516
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 7519
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 7522
      $264 = tempRet0; //@line 7523
      $265 = $6; //@line 7524
      HEAP32[$265 >> 2] = $263; //@line 7526
      HEAP32[$265 + 4 >> 2] = $264; //@line 7529
      $$0232 = 1; //@line 7530
      $$0237 = 1847; //@line 7530
      $275 = $263; //@line 7530
      $276 = $264; //@line 7530
      label = 67; //@line 7531
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 7543
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 1847 : 1849 : 1848; //@line 7543
      $275 = $258; //@line 7543
      $276 = $261; //@line 7543
      label = 67; //@line 7544
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 7550
     $$0232 = 0; //@line 7556
     $$0237 = 1847; //@line 7556
     $275 = HEAP32[$197 >> 2] | 0; //@line 7556
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 7556
     label = 67; //@line 7557
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 7568
     $$2 = $13; //@line 7569
     $$2234 = 0; //@line 7569
     $$2239 = 1847; //@line 7569
     $$2251 = $11; //@line 7569
     $$5 = 1; //@line 7569
     $$6268 = $196; //@line 7569
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 7576
     label = 72; //@line 7577
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 7581
     $$1 = $302 | 0 ? $302 : 1857; //@line 7584
     label = 72; //@line 7585
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 7595
     HEAP32[$14 >> 2] = 0; //@line 7596
     HEAP32[$6 >> 2] = $8; //@line 7597
     $$4258354 = -1; //@line 7598
     $365 = $8; //@line 7598
     label = 76; //@line 7599
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 7603
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 7606
      $$0240$lcssa356 = 0; //@line 7607
      label = 85; //@line 7608
     } else {
      $$4258354 = $$0254; //@line 7610
      $365 = $$pre348; //@line 7610
      label = 76; //@line 7611
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 7618
     $$0247 = $$1248; //@line 7618
     $$0269 = $$3272; //@line 7618
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 7623
     $$2234 = 0; //@line 7623
     $$2239 = 1847; //@line 7623
     $$2251 = $11; //@line 7623
     $$5 = $$0254; //@line 7623
     $$6268 = $$1263$; //@line 7623
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 7629
    $227 = $6; //@line 7630
    $229 = HEAP32[$227 >> 2] | 0; //@line 7632
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 7635
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 7637
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 7643
    $$0228 = $234; //@line 7648
    $$1233 = $or$cond278 ? 0 : 2; //@line 7648
    $$1238 = $or$cond278 ? 1847 : 1847 + ($$1236 >> 4) | 0; //@line 7648
    $$2256 = $$1255; //@line 7648
    $$4266 = $$3265; //@line 7648
    $281 = $229; //@line 7648
    $283 = $232; //@line 7648
    label = 68; //@line 7649
   } else if ((label | 0) == 67) {
    label = 0; //@line 7652
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 7654
    $$1233 = $$0232; //@line 7654
    $$1238 = $$0237; //@line 7654
    $$2256 = $$0254; //@line 7654
    $$4266 = $$1263$; //@line 7654
    $281 = $275; //@line 7654
    $283 = $276; //@line 7654
    label = 68; //@line 7655
   } else if ((label | 0) == 72) {
    label = 0; //@line 7658
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 7659
    $306 = ($305 | 0) == 0; //@line 7660
    $$2 = $$1; //@line 7667
    $$2234 = 0; //@line 7667
    $$2239 = 1847; //@line 7667
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 7667
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 7667
    $$6268 = $196; //@line 7667
   } else if ((label | 0) == 76) {
    label = 0; //@line 7670
    $$0229316 = $365; //@line 7671
    $$0240315 = 0; //@line 7671
    $$1244314 = 0; //@line 7671
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 7673
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 7676
      $$2245 = $$1244314; //@line 7676
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 7679
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 7685
      $$2245 = $320; //@line 7685
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 7689
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 7692
      $$0240315 = $325; //@line 7692
      $$1244314 = $320; //@line 7692
     } else {
      $$0240$lcssa = $325; //@line 7694
      $$2245 = $320; //@line 7694
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 7700
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 7703
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 7706
     label = 85; //@line 7707
    } else {
     $$1230327 = $365; //@line 7709
     $$1241326 = 0; //@line 7709
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 7711
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7714
       label = 85; //@line 7715
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 7718
      $$1241326 = $331 + $$1241326 | 0; //@line 7719
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7722
       label = 85; //@line 7723
       break L97;
      }
      _out_670($0, $9, $331); //@line 7727
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7732
       label = 85; //@line 7733
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 7730
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 7741
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 7747
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 7749
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 7754
   $$2 = $or$cond ? $$0228 : $11; //@line 7759
   $$2234 = $$1233; //@line 7759
   $$2239 = $$1238; //@line 7759
   $$2251 = $11; //@line 7759
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 7759
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 7759
  } else if ((label | 0) == 85) {
   label = 0; //@line 7762
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 7764
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 7767
   $$0247 = $$1248; //@line 7767
   $$0269 = $$3272; //@line 7767
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 7772
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 7774
  $345 = $$$5 + $$2234 | 0; //@line 7775
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 7777
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 7778
  _out_670($0, $$2239, $$2234); //@line 7779
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 7781
  _pad_676($0, 48, $$$5, $343, 0); //@line 7782
  _out_670($0, $$2, $343); //@line 7783
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 7785
  $$0243 = $$2261; //@line 7786
  $$0247 = $$1248; //@line 7786
  $$0269 = $$3272; //@line 7786
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 7794
    } else {
     $$2242302 = 1; //@line 7796
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 7799
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 7802
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 7806
      $356 = $$2242302 + 1 | 0; //@line 7807
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 7810
      } else {
       $$2242$lcssa = $356; //@line 7812
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 7818
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 7824
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 7830
       } else {
        $$0 = 1; //@line 7832
        break;
       }
      }
     } else {
      $$0 = 1; //@line 7837
     }
    }
   } else {
    $$0 = $$1248; //@line 7841
   }
  }
 } while (0);
 STACKTOP = sp; //@line 7845
 return $$0 | 0; //@line 7845
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 4931
 $3 = HEAP32[1181] | 0; //@line 4932
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 4935
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 4939
 $7 = $6 & 3; //@line 4940
 if (($7 | 0) == 1) {
  _abort(); //@line 4943
 }
 $9 = $6 & -8; //@line 4946
 $10 = $2 + $9 | 0; //@line 4947
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 4952
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 4958
   $17 = $13 + $9 | 0; //@line 4959
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 4962
   }
   if ((HEAP32[1182] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 4968
    $106 = HEAP32[$105 >> 2] | 0; //@line 4969
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 4973
     $$1382 = $17; //@line 4973
     $114 = $16; //@line 4973
     break;
    }
    HEAP32[1179] = $17; //@line 4976
    HEAP32[$105 >> 2] = $106 & -2; //@line 4978
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 4981
    HEAP32[$16 + $17 >> 2] = $17; //@line 4983
    return;
   }
   $21 = $13 >>> 3; //@line 4986
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 4990
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 4992
    $28 = 4748 + ($21 << 1 << 2) | 0; //@line 4994
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 4999
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 5006
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1177] = HEAP32[1177] & ~(1 << $21); //@line 5016
     $$1 = $16; //@line 5017
     $$1382 = $17; //@line 5017
     $114 = $16; //@line 5017
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 5023
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 5027
     }
     $41 = $26 + 8 | 0; //@line 5030
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 5034
     } else {
      _abort(); //@line 5036
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 5041
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 5042
    $$1 = $16; //@line 5043
    $$1382 = $17; //@line 5043
    $114 = $16; //@line 5043
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 5047
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 5049
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 5053
     $60 = $59 + 4 | 0; //@line 5054
     $61 = HEAP32[$60 >> 2] | 0; //@line 5055
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 5058
      if (!$63) {
       $$3 = 0; //@line 5061
       break;
      } else {
       $$1387 = $63; //@line 5064
       $$1390 = $59; //@line 5064
      }
     } else {
      $$1387 = $61; //@line 5067
      $$1390 = $60; //@line 5067
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 5070
      $66 = HEAP32[$65 >> 2] | 0; //@line 5071
      if ($66 | 0) {
       $$1387 = $66; //@line 5074
       $$1390 = $65; //@line 5074
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 5077
      $69 = HEAP32[$68 >> 2] | 0; //@line 5078
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 5083
       $$1390 = $68; //@line 5083
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 5088
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 5091
      $$3 = $$1387; //@line 5092
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 5097
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 5100
     }
     $53 = $51 + 12 | 0; //@line 5103
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 5107
     }
     $56 = $48 + 8 | 0; //@line 5110
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 5114
      HEAP32[$56 >> 2] = $51; //@line 5115
      $$3 = $48; //@line 5116
      break;
     } else {
      _abort(); //@line 5119
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 5126
    $$1382 = $17; //@line 5126
    $114 = $16; //@line 5126
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 5129
    $75 = 5012 + ($74 << 2) | 0; //@line 5130
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 5135
      if (!$$3) {
       HEAP32[1178] = HEAP32[1178] & ~(1 << $74); //@line 5142
       $$1 = $16; //@line 5143
       $$1382 = $17; //@line 5143
       $114 = $16; //@line 5143
       break L10;
      }
     } else {
      if ((HEAP32[1181] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 5150
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 5158
       if (!$$3) {
        $$1 = $16; //@line 5161
        $$1382 = $17; //@line 5161
        $114 = $16; //@line 5161
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1181] | 0; //@line 5169
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 5172
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 5176
    $92 = $16 + 16 | 0; //@line 5177
    $93 = HEAP32[$92 >> 2] | 0; //@line 5178
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 5184
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 5188
       HEAP32[$93 + 24 >> 2] = $$3; //@line 5190
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 5196
    if (!$99) {
     $$1 = $16; //@line 5199
     $$1382 = $17; //@line 5199
     $114 = $16; //@line 5199
    } else {
     if ((HEAP32[1181] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 5204
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 5208
      HEAP32[$99 + 24 >> 2] = $$3; //@line 5210
      $$1 = $16; //@line 5211
      $$1382 = $17; //@line 5211
      $114 = $16; //@line 5211
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 5217
   $$1382 = $9; //@line 5217
   $114 = $2; //@line 5217
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 5222
 }
 $115 = $10 + 4 | 0; //@line 5225
 $116 = HEAP32[$115 >> 2] | 0; //@line 5226
 if (!($116 & 1)) {
  _abort(); //@line 5230
 }
 if (!($116 & 2)) {
  if ((HEAP32[1183] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1180] | 0) + $$1382 | 0; //@line 5240
   HEAP32[1180] = $124; //@line 5241
   HEAP32[1183] = $$1; //@line 5242
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 5245
   if (($$1 | 0) != (HEAP32[1182] | 0)) {
    return;
   }
   HEAP32[1182] = 0; //@line 5251
   HEAP32[1179] = 0; //@line 5252
   return;
  }
  if ((HEAP32[1182] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1179] | 0) + $$1382 | 0; //@line 5259
   HEAP32[1179] = $132; //@line 5260
   HEAP32[1182] = $114; //@line 5261
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 5264
   HEAP32[$114 + $132 >> 2] = $132; //@line 5266
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 5270
  $138 = $116 >>> 3; //@line 5271
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 5276
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 5278
    $145 = 4748 + ($138 << 1 << 2) | 0; //@line 5280
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1181] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 5286
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 5293
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1177] = HEAP32[1177] & ~(1 << $138); //@line 5303
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 5309
    } else {
     if ((HEAP32[1181] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 5314
     }
     $160 = $143 + 8 | 0; //@line 5317
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 5321
     } else {
      _abort(); //@line 5323
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 5328
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 5329
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 5332
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 5334
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 5338
      $180 = $179 + 4 | 0; //@line 5339
      $181 = HEAP32[$180 >> 2] | 0; //@line 5340
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 5343
       if (!$183) {
        $$3400 = 0; //@line 5346
        break;
       } else {
        $$1398 = $183; //@line 5349
        $$1402 = $179; //@line 5349
       }
      } else {
       $$1398 = $181; //@line 5352
       $$1402 = $180; //@line 5352
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 5355
       $186 = HEAP32[$185 >> 2] | 0; //@line 5356
       if ($186 | 0) {
        $$1398 = $186; //@line 5359
        $$1402 = $185; //@line 5359
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 5362
       $189 = HEAP32[$188 >> 2] | 0; //@line 5363
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 5368
        $$1402 = $188; //@line 5368
       }
      }
      if ((HEAP32[1181] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 5374
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 5377
       $$3400 = $$1398; //@line 5378
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 5383
      if ((HEAP32[1181] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 5387
      }
      $173 = $170 + 12 | 0; //@line 5390
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 5394
      }
      $176 = $167 + 8 | 0; //@line 5397
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 5401
       HEAP32[$176 >> 2] = $170; //@line 5402
       $$3400 = $167; //@line 5403
       break;
      } else {
       _abort(); //@line 5406
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 5414
     $196 = 5012 + ($195 << 2) | 0; //@line 5415
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 5420
       if (!$$3400) {
        HEAP32[1178] = HEAP32[1178] & ~(1 << $195); //@line 5427
        break L108;
       }
      } else {
       if ((HEAP32[1181] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 5434
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 5442
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1181] | 0; //@line 5452
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 5455
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 5459
     $213 = $10 + 16 | 0; //@line 5460
     $214 = HEAP32[$213 >> 2] | 0; //@line 5461
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 5467
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 5471
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 5473
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 5479
     if ($220 | 0) {
      if ((HEAP32[1181] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 5485
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 5489
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 5491
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 5500
  HEAP32[$114 + $137 >> 2] = $137; //@line 5502
  if (($$1 | 0) == (HEAP32[1182] | 0)) {
   HEAP32[1179] = $137; //@line 5506
   return;
  } else {
   $$2 = $137; //@line 5509
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 5513
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 5516
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 5518
  $$2 = $$1382; //@line 5519
 }
 $235 = $$2 >>> 3; //@line 5521
 if ($$2 >>> 0 < 256) {
  $238 = 4748 + ($235 << 1 << 2) | 0; //@line 5525
  $239 = HEAP32[1177] | 0; //@line 5526
  $240 = 1 << $235; //@line 5527
  if (!($239 & $240)) {
   HEAP32[1177] = $239 | $240; //@line 5532
   $$0403 = $238; //@line 5534
   $$pre$phiZ2D = $238 + 8 | 0; //@line 5534
  } else {
   $244 = $238 + 8 | 0; //@line 5536
   $245 = HEAP32[$244 >> 2] | 0; //@line 5537
   if ((HEAP32[1181] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 5541
   } else {
    $$0403 = $245; //@line 5544
    $$pre$phiZ2D = $244; //@line 5544
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 5547
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 5549
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 5551
  HEAP32[$$1 + 12 >> 2] = $238; //@line 5553
  return;
 }
 $251 = $$2 >>> 8; //@line 5556
 if (!$251) {
  $$0396 = 0; //@line 5559
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 5563
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 5567
   $257 = $251 << $256; //@line 5568
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 5571
   $262 = $257 << $260; //@line 5573
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 5576
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 5581
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 5587
  }
 }
 $276 = 5012 + ($$0396 << 2) | 0; //@line 5590
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 5592
 HEAP32[$$1 + 20 >> 2] = 0; //@line 5595
 HEAP32[$$1 + 16 >> 2] = 0; //@line 5596
 $280 = HEAP32[1178] | 0; //@line 5597
 $281 = 1 << $$0396; //@line 5598
 do {
  if (!($280 & $281)) {
   HEAP32[1178] = $280 | $281; //@line 5604
   HEAP32[$276 >> 2] = $$1; //@line 5605
   HEAP32[$$1 + 24 >> 2] = $276; //@line 5607
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 5609
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 5611
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 5619
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 5619
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 5626
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 5630
    $301 = HEAP32[$299 >> 2] | 0; //@line 5632
    if (!$301) {
     label = 121; //@line 5635
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 5638
     $$0384 = $301; //@line 5638
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1181] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 5645
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 5648
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 5650
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 5652
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 5654
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 5659
    $309 = HEAP32[$308 >> 2] | 0; //@line 5660
    $310 = HEAP32[1181] | 0; //@line 5661
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 5667
     HEAP32[$308 >> 2] = $$1; //@line 5668
     HEAP32[$$1 + 8 >> 2] = $309; //@line 5670
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 5672
     HEAP32[$$1 + 24 >> 2] = 0; //@line 5674
     break;
    } else {
     _abort(); //@line 5677
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1185] | 0) + -1 | 0; //@line 5684
 HEAP32[1185] = $319; //@line 5685
 if (!$319) {
  $$0212$in$i = 5164; //@line 5688
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 5693
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 5699
  }
 }
 HEAP32[1185] = -1; //@line 5702
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
  HEAP32[$AsyncCtx + 4 >> 2] = $43; //@line 1266
  HEAP8[$AsyncCtx + 8 >> 0] = $8 & 1; //@line 1269
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 1271
  HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 1273
  HEAP32[$AsyncCtx + 20 >> 2] = $5; //@line 1275
  HEAP32[$AsyncCtx + 24 >> 2] = $0; //@line 1277
  HEAP32[$AsyncCtx + 28 >> 2] = $4; //@line 1279
  HEAP32[$AsyncCtx + 32 >> 2] = $$sroa$0$i; //@line 1281
  HEAP32[$AsyncCtx + 36 >> 2] = $11; //@line 1283
  HEAP32[$AsyncCtx + 40 >> 2] = $12; //@line 1285
  HEAP32[$AsyncCtx + 44 >> 2] = $$sroa$0$i; //@line 1287
  HEAP32[$AsyncCtx + 48 >> 2] = $0; //@line 1289
  HEAP32[$AsyncCtx + 52 >> 2] = $$sroa$0$i; //@line 1291
  HEAP32[$AsyncCtx + 56 >> 2] = $$06790; //@line 1293
  HEAP32[$AsyncCtx + 60 >> 2] = $7; //@line 1295
  HEAP32[$AsyncCtx + 64 >> 2] = $6; //@line 1297
  HEAP32[$AsyncCtx + 68 >> 2] = $42; //@line 1299
  HEAP32[$AsyncCtx + 72 >> 2] = $$idx; //@line 1301
  HEAP32[$AsyncCtx + 76 >> 2] = $10; //@line 1303
  HEAP32[$AsyncCtx + 80 >> 2] = $9; //@line 1305
  sp = STACKTOP; //@line 1306
  STACKTOP = sp; //@line 1307
  return;
 } else if ((label | 0) == 22) {
  HEAP32[$AsyncCtx11 >> 2] = 28; //@line 1310
  HEAP32[$AsyncCtx11 + 4 >> 2] = $43; //@line 1312
  HEAP8[$AsyncCtx11 + 8 >> 0] = $8 & 1; //@line 1315
  HEAP32[$AsyncCtx11 + 12 >> 2] = $3; //@line 1317
  HEAP32[$AsyncCtx11 + 16 >> 2] = $0; //@line 1319
  HEAP32[$AsyncCtx11 + 20 >> 2] = $5; //@line 1321
  HEAP32[$AsyncCtx11 + 24 >> 2] = $0; //@line 1323
  HEAP32[$AsyncCtx11 + 28 >> 2] = $4; //@line 1325
  HEAP32[$AsyncCtx11 + 32 >> 2] = $$sroa$0$i; //@line 1327
  HEAP32[$AsyncCtx11 + 36 >> 2] = $11; //@line 1329
  HEAP32[$AsyncCtx11 + 40 >> 2] = $12; //@line 1331
  HEAP32[$AsyncCtx11 + 44 >> 2] = $$sroa$0$i; //@line 1333
  HEAP32[$AsyncCtx11 + 48 >> 2] = $0; //@line 1335
  HEAP32[$AsyncCtx11 + 52 >> 2] = $$sroa$0$i; //@line 1337
  HEAP32[$AsyncCtx11 + 56 >> 2] = $7; //@line 1339
  HEAP32[$AsyncCtx11 + 60 >> 2] = $6; //@line 1341
  HEAP32[$AsyncCtx11 + 64 >> 2] = $$idx; //@line 1343
  HEAP32[$AsyncCtx11 + 68 >> 2] = $10; //@line 1345
  HEAP32[$AsyncCtx11 + 72 >> 2] = $9; //@line 1347
  sp = STACKTOP; //@line 1348
  STACKTOP = sp; //@line 1349
  return;
 } else if ((label | 0) == 26) {
  HEAP32[$AsyncCtx3 >> 2] = 29; //@line 1352
  HEAP32[$AsyncCtx3 + 4 >> 2] = $43; //@line 1354
  HEAP8[$AsyncCtx3 + 8 >> 0] = $8 & 1; //@line 1357
  HEAP32[$AsyncCtx3 + 12 >> 2] = $3; //@line 1359
  HEAP32[$AsyncCtx3 + 16 >> 2] = $0; //@line 1361
  HEAP32[$AsyncCtx3 + 20 >> 2] = $5; //@line 1363
  HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 1365
  HEAP32[$AsyncCtx3 + 28 >> 2] = $4; //@line 1367
  HEAP32[$AsyncCtx3 + 32 >> 2] = $$sroa$0$i; //@line 1369
  HEAP32[$AsyncCtx3 + 36 >> 2] = $11; //@line 1371
  HEAP32[$AsyncCtx3 + 40 >> 2] = $12; //@line 1373
  HEAP32[$AsyncCtx3 + 44 >> 2] = $$sroa$0$i; //@line 1375
  HEAP32[$AsyncCtx3 + 48 >> 2] = $0; //@line 1377
  HEAP32[$AsyncCtx3 + 52 >> 2] = $$sroa$0$i; //@line 1379
  HEAP32[$AsyncCtx3 + 56 >> 2] = $7; //@line 1381
  HEAP32[$AsyncCtx3 + 60 >> 2] = $6; //@line 1383
  HEAP32[$AsyncCtx3 + 64 >> 2] = $$idx; //@line 1385
  HEAP32[$AsyncCtx3 + 68 >> 2] = $10; //@line 1387
  HEAP32[$AsyncCtx3 + 72 >> 2] = $9; //@line 1389
  HEAP32[$AsyncCtx3 + 76 >> 2] = $$06790; //@line 1391
  HEAP32[$AsyncCtx3 + 80 >> 2] = $42; //@line 1393
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
  HEAP8[$AsyncCtx15 + 4 >> 0] = $8 & 1; //@line 1453
  HEAP32[$AsyncCtx15 + 8 >> 2] = $3; //@line 1455
  HEAP32[$AsyncCtx15 + 12 >> 2] = $0; //@line 1457
  HEAP32[$AsyncCtx15 + 16 >> 2] = $5; //@line 1459
  HEAP32[$AsyncCtx15 + 20 >> 2] = $0; //@line 1461
  HEAP32[$AsyncCtx15 + 24 >> 2] = $4; //@line 1463
  HEAP32[$AsyncCtx15 + 28 >> 2] = $$sroa$0$i; //@line 1465
  HEAP32[$AsyncCtx15 + 32 >> 2] = $11; //@line 1467
  HEAP32[$AsyncCtx15 + 36 >> 2] = $12; //@line 1469
  HEAP32[$AsyncCtx15 + 40 >> 2] = $$sroa$0$i; //@line 1471
  HEAP32[$AsyncCtx15 + 44 >> 2] = $0; //@line 1473
  HEAP32[$AsyncCtx15 + 48 >> 2] = $$sroa$0$i; //@line 1475
  HEAP32[$AsyncCtx15 + 52 >> 2] = $7; //@line 1477
  HEAP32[$AsyncCtx15 + 56 >> 2] = $6; //@line 1479
  HEAP32[$AsyncCtx15 + 60 >> 2] = $$idx; //@line 1481
  HEAP32[$AsyncCtx15 + 64 >> 2] = $10; //@line 1483
  HEAP32[$AsyncCtx15 + 68 >> 2] = $9; //@line 1485
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
 sp = STACKTOP; //@line 10874
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10880
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 10889
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 10894
      $19 = $1 + 44 | 0; //@line 10895
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 10904
      $26 = $1 + 52 | 0; //@line 10905
      $27 = $1 + 53 | 0; //@line 10906
      $28 = $1 + 54 | 0; //@line 10907
      $29 = $0 + 8 | 0; //@line 10908
      $30 = $1 + 24 | 0; //@line 10909
      $$081$off0 = 0; //@line 10910
      $$084 = $0 + 16 | 0; //@line 10910
      $$085$off0 = 0; //@line 10910
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 10914
        label = 20; //@line 10915
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 10918
       HEAP8[$27 >> 0] = 0; //@line 10919
       $AsyncCtx15 = _emscripten_alloc_async_context(52, sp) | 0; //@line 10920
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 10921
       if (___async) {
        label = 12; //@line 10924
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 10927
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 10931
        label = 20; //@line 10932
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 10939
         $$186$off0 = $$085$off0; //@line 10939
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 10948
           label = 20; //@line 10949
           break L10;
          } else {
           $$182$off0 = 1; //@line 10952
           $$186$off0 = $$085$off0; //@line 10952
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 10959
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 10966
          break L10;
         } else {
          $$182$off0 = 1; //@line 10969
          $$186$off0 = 1; //@line 10969
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 10974
       $$084 = $$084 + 8 | 0; //@line 10974
       $$085$off0 = $$186$off0; //@line 10974
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 103; //@line 10977
       HEAP32[$AsyncCtx15 + 4 >> 2] = $25; //@line 10979
       HEAP32[$AsyncCtx15 + 8 >> 2] = $26; //@line 10981
       HEAP32[$AsyncCtx15 + 12 >> 2] = $27; //@line 10983
       HEAP32[$AsyncCtx15 + 16 >> 2] = $1; //@line 10985
       HEAP32[$AsyncCtx15 + 20 >> 2] = $2; //@line 10987
       HEAP8[$AsyncCtx15 + 24 >> 0] = $4 & 1; //@line 10990
       HEAP8[$AsyncCtx15 + 25 >> 0] = $$085$off0 & 1; //@line 10993
       HEAP8[$AsyncCtx15 + 26 >> 0] = $$081$off0 & 1; //@line 10996
       HEAP32[$AsyncCtx15 + 28 >> 2] = $$084; //@line 10998
       HEAP32[$AsyncCtx15 + 32 >> 2] = $13; //@line 11000
       HEAP32[$AsyncCtx15 + 36 >> 2] = $30; //@line 11002
       HEAP32[$AsyncCtx15 + 40 >> 2] = $29; //@line 11004
       HEAP32[$AsyncCtx15 + 44 >> 2] = $28; //@line 11006
       HEAP32[$AsyncCtx15 + 48 >> 2] = $19; //@line 11008
       sp = STACKTOP; //@line 11009
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 11015
         $61 = $1 + 40 | 0; //@line 11016
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 11019
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 11027
           if ($$283$off0) {
            label = 25; //@line 11029
            break;
           } else {
            $69 = 4; //@line 11032
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 11039
        } else {
         $69 = 4; //@line 11041
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 11046
      }
      HEAP32[$19 >> 2] = $69; //@line 11048
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 11057
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 11062
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 11063
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 11064
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 11065
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 104; //@line 11068
    HEAP32[$AsyncCtx11 + 4 >> 2] = $73; //@line 11070
    HEAP32[$AsyncCtx11 + 8 >> 2] = $1; //@line 11072
    HEAP32[$AsyncCtx11 + 12 >> 2] = $2; //@line 11074
    HEAP32[$AsyncCtx11 + 16 >> 2] = $3; //@line 11076
    HEAP8[$AsyncCtx11 + 20 >> 0] = $4 & 1; //@line 11079
    HEAP32[$AsyncCtx11 + 24 >> 2] = $0; //@line 11081
    HEAP32[$AsyncCtx11 + 28 >> 2] = $72; //@line 11083
    sp = STACKTOP; //@line 11084
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 11087
   $81 = $0 + 24 | 0; //@line 11088
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 11092
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 11096
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 11103
       $$2 = $81; //@line 11104
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 11116
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 11117
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 11122
        $136 = $$2 + 8 | 0; //@line 11123
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 11126
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 107; //@line 11131
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 11133
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 11135
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 11137
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 11139
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 11141
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 11143
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 11145
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 11148
       sp = STACKTOP; //@line 11149
       return;
      }
      $104 = $1 + 24 | 0; //@line 11152
      $105 = $1 + 54 | 0; //@line 11153
      $$1 = $81; //@line 11154
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 11170
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 11171
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11176
       $122 = $$1 + 8 | 0; //@line 11177
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 11180
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 106; //@line 11185
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 11187
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 11189
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 11191
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 11193
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 11195
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 11197
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 11199
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 11201
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 11204
      sp = STACKTOP; //@line 11205
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 11209
    $$0 = $81; //@line 11210
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 11217
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 11218
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 11223
     $100 = $$0 + 8 | 0; //@line 11224
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 11227
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 105; //@line 11232
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 11234
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 11236
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 11238
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 11240
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 11242
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 11244
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 11247
    sp = STACKTOP; //@line 11248
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
 $n_sroa_0_0_extract_trunc = $a$0; //@line 3532
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 3533
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 3534
 $d_sroa_0_0_extract_trunc = $b$0; //@line 3535
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 3536
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 3537
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 3539
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 3542
    HEAP32[$rem + 4 >> 2] = 0; //@line 3543
   }
   $_0$1 = 0; //@line 3545
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 3546
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3547
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 3550
    $_0$0 = 0; //@line 3551
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3552
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 3554
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 3555
   $_0$1 = 0; //@line 3556
   $_0$0 = 0; //@line 3557
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3558
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 3561
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 3566
     HEAP32[$rem + 4 >> 2] = 0; //@line 3567
    }
    $_0$1 = 0; //@line 3569
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 3570
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3571
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 3575
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 3576
    }
    $_0$1 = 0; //@line 3578
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 3579
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3580
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 3582
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 3585
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 3586
    }
    $_0$1 = 0; //@line 3588
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 3589
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3590
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 3593
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 3595
    $58 = 31 - $51 | 0; //@line 3596
    $sr_1_ph = $57; //@line 3597
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 3598
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 3599
    $q_sroa_0_1_ph = 0; //@line 3600
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 3601
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 3605
    $_0$0 = 0; //@line 3606
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3607
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 3609
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 3610
   $_0$1 = 0; //@line 3611
   $_0$0 = 0; //@line 3612
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3613
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 3617
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 3619
     $126 = 31 - $119 | 0; //@line 3620
     $130 = $119 - 31 >> 31; //@line 3621
     $sr_1_ph = $125; //@line 3622
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 3623
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 3624
     $q_sroa_0_1_ph = 0; //@line 3625
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 3626
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 3630
     $_0$0 = 0; //@line 3631
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3632
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 3634
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 3635
    $_0$1 = 0; //@line 3636
    $_0$0 = 0; //@line 3637
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3638
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 3640
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 3643
    $89 = 64 - $88 | 0; //@line 3644
    $91 = 32 - $88 | 0; //@line 3645
    $92 = $91 >> 31; //@line 3646
    $95 = $88 - 32 | 0; //@line 3647
    $105 = $95 >> 31; //@line 3648
    $sr_1_ph = $88; //@line 3649
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 3650
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 3651
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 3652
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 3653
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 3657
    HEAP32[$rem + 4 >> 2] = 0; //@line 3658
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 3661
    $_0$0 = $a$0 | 0 | 0; //@line 3662
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3663
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 3665
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 3666
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 3667
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3668
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 3673
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 3674
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 3675
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 3676
  $carry_0_lcssa$1 = 0; //@line 3677
  $carry_0_lcssa$0 = 0; //@line 3678
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 3680
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 3681
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 3682
  $137$1 = tempRet0; //@line 3683
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 3684
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 3685
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 3686
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 3687
  $sr_1202 = $sr_1_ph; //@line 3688
  $carry_0203 = 0; //@line 3689
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 3691
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 3692
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 3693
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 3694
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 3695
   $150$1 = tempRet0; //@line 3696
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 3697
   $carry_0203 = $151$0 & 1; //@line 3698
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 3700
   $r_sroa_1_1200 = tempRet0; //@line 3701
   $sr_1202 = $sr_1202 - 1 | 0; //@line 3702
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 3714
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 3715
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 3716
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 3717
  $carry_0_lcssa$1 = 0; //@line 3718
  $carry_0_lcssa$0 = $carry_0203; //@line 3719
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 3721
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 3722
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 3725
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 3726
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 3728
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 3729
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 3730
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
 sp = STACKTOP; //@line 2188
 STACKTOP = STACKTOP + 16 | 0; //@line 2189
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2189
 $0 = sp; //@line 2190
 $AsyncCtx24 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2191
 $1 = _equeue_alloc(4388, 4) | 0; //@line 2192
 if (___async) {
  HEAP32[$AsyncCtx24 >> 2] = 55; //@line 2195
  HEAP32[$AsyncCtx24 + 4 >> 2] = $0; //@line 2197
  sp = STACKTOP; //@line 2198
  STACKTOP = sp; //@line 2199
  return 0; //@line 2199
 }
 _emscripten_free_async_context($AsyncCtx24 | 0); //@line 2201
 do {
  if ($1 | 0) {
   HEAP32[$1 >> 2] = 2; //@line 2205
   _equeue_event_delay($1, 1e3); //@line 2206
   _equeue_event_period($1, 1e3); //@line 2207
   _equeue_event_dtor($1, 56); //@line 2208
   $AsyncCtx10 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2209
   _equeue_post(4388, 57, $1) | 0; //@line 2210
   if (___async) {
    HEAP32[$AsyncCtx10 >> 2] = 58; //@line 2213
    HEAP32[$AsyncCtx10 + 4 >> 2] = $0; //@line 2215
    sp = STACKTOP; //@line 2216
    STACKTOP = sp; //@line 2217
    return 0; //@line 2217
   } else {
    _emscripten_free_async_context($AsyncCtx10 | 0); //@line 2219
    break;
   }
  }
 } while (0);
 $AsyncCtx20 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2224
 $5 = _equeue_alloc(4388, 32) | 0; //@line 2225
 if (___async) {
  HEAP32[$AsyncCtx20 >> 2] = 59; //@line 2228
  HEAP32[$AsyncCtx20 + 4 >> 2] = $0; //@line 2230
  sp = STACKTOP; //@line 2231
  STACKTOP = sp; //@line 2232
  return 0; //@line 2232
 }
 _emscripten_free_async_context($AsyncCtx20 | 0); //@line 2234
 if (!$5) {
  HEAP32[$0 >> 2] = 0; //@line 2237
  HEAP32[$0 + 4 >> 2] = 0; //@line 2237
  HEAP32[$0 + 8 >> 2] = 0; //@line 2237
  HEAP32[$0 + 12 >> 2] = 0; //@line 2237
  $21 = 1; //@line 2238
  $23 = $0; //@line 2238
 } else {
  HEAP32[$5 + 4 >> 2] = 4388; //@line 2241
  HEAP32[$5 + 8 >> 2] = 0; //@line 2243
  HEAP32[$5 + 12 >> 2] = 0; //@line 2245
  HEAP32[$5 + 16 >> 2] = -1; //@line 2247
  HEAP32[$5 + 20 >> 2] = 2; //@line 2249
  HEAP32[$5 + 24 >> 2] = 60; //@line 2251
  HEAP32[$5 + 28 >> 2] = 3; //@line 2253
  HEAP32[$5 >> 2] = 1; //@line 2254
  $15 = $0 + 4 | 0; //@line 2255
  HEAP32[$15 >> 2] = 0; //@line 2256
  HEAP32[$15 + 4 >> 2] = 0; //@line 2256
  HEAP32[$15 + 8 >> 2] = 0; //@line 2256
  HEAP32[$0 >> 2] = $5; //@line 2257
  HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + 1; //@line 2260
  $21 = 0; //@line 2261
  $23 = $0; //@line 2261
 }
 $18 = $0 + 12 | 0; //@line 2263
 HEAP32[$18 >> 2] = 168; //@line 2264
 $AsyncCtx17 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2265
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(4636, $0); //@line 2266
 if (___async) {
  HEAP32[$AsyncCtx17 >> 2] = 61; //@line 2269
  HEAP32[$AsyncCtx17 + 4 >> 2] = $18; //@line 2271
  HEAP8[$AsyncCtx17 + 8 >> 0] = $21 & 1; //@line 2274
  HEAP32[$AsyncCtx17 + 12 >> 2] = $23; //@line 2276
  HEAP32[$AsyncCtx17 + 16 >> 2] = $5; //@line 2278
  HEAP32[$AsyncCtx17 + 20 >> 2] = $5; //@line 2280
  sp = STACKTOP; //@line 2281
  STACKTOP = sp; //@line 2282
  return 0; //@line 2282
 }
 _emscripten_free_async_context($AsyncCtx17 | 0); //@line 2284
 $26 = HEAP32[$18 >> 2] | 0; //@line 2285
 do {
  if ($26 | 0) {
   $29 = HEAP32[$26 + 8 >> 2] | 0; //@line 2290
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 2291
   FUNCTION_TABLE_vi[$29 & 127]($23); //@line 2292
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 62; //@line 2295
    HEAP8[$AsyncCtx + 4 >> 0] = $21 & 1; //@line 2298
    HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 2300
    HEAP32[$AsyncCtx + 12 >> 2] = $5; //@line 2302
    sp = STACKTOP; //@line 2303
    STACKTOP = sp; //@line 2304
    return 0; //@line 2304
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 2306
    break;
   }
  }
 } while (0);
 do {
  if (!$21) {
   $34 = (HEAP32[$5 >> 2] | 0) + -1 | 0; //@line 2314
   HEAP32[$5 >> 2] = $34; //@line 2315
   if (!$34) {
    $37 = HEAP32[$5 + 24 >> 2] | 0; //@line 2319
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2320
    FUNCTION_TABLE_vi[$37 & 127]($5); //@line 2321
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 63; //@line 2324
     HEAP32[$AsyncCtx3 + 4 >> 2] = $5; //@line 2326
     sp = STACKTOP; //@line 2327
     STACKTOP = sp; //@line 2328
     return 0; //@line 2328
    }
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2330
    $40 = HEAP32[$5 + 4 >> 2] | 0; //@line 2332
    $AsyncCtx13 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2333
    _equeue_dealloc($40, $5); //@line 2334
    if (___async) {
     HEAP32[$AsyncCtx13 >> 2] = 64; //@line 2337
     sp = STACKTOP; //@line 2338
     STACKTOP = sp; //@line 2339
     return 0; //@line 2339
    } else {
     _emscripten_free_async_context($AsyncCtx13 | 0); //@line 2341
     break;
    }
   }
  }
 } while (0);
 $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2347
 __ZN6events10EventQueue8dispatchEi(4388, -1); //@line 2348
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 65; //@line 2351
  sp = STACKTOP; //@line 2352
  STACKTOP = sp; //@line 2353
  return 0; //@line 2353
 } else {
  _emscripten_free_async_context($AsyncCtx6 | 0); //@line 2355
  STACKTOP = sp; //@line 2356
  return 0; //@line 2356
 }
 return 0; //@line 2358
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
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_38($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2118
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2120
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2122
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2124
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2126
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2128
 $12 = HEAP8[$0 + 24 >> 0] & 1; //@line 2131
 $14 = HEAP8[$0 + 25 >> 0] & 1; //@line 2134
 $16 = HEAP8[$0 + 26 >> 0] & 1; //@line 2137
 $18 = HEAP32[$0 + 28 >> 2] | 0; //@line 2139
 $20 = HEAP32[$0 + 32 >> 2] | 0; //@line 2141
 $22 = HEAP32[$0 + 36 >> 2] | 0; //@line 2143
 $24 = HEAP32[$0 + 40 >> 2] | 0; //@line 2145
 $26 = HEAP32[$0 + 44 >> 2] | 0; //@line 2147
 $28 = HEAP32[$0 + 48 >> 2] | 0; //@line 2149
 L2 : do {
  if (!(HEAP8[$26 >> 0] | 0)) {
   do {
    if (!(HEAP8[$6 >> 0] | 0)) {
     $$182$off0 = $16; //@line 2158
     $$186$off0 = $14; //@line 2158
    } else {
     if (!(HEAP8[$4 >> 0] | 0)) {
      if (!(HEAP32[$24 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $14; //@line 2167
       $$283$off0 = 1; //@line 2167
       label = 13; //@line 2168
       break L2;
      } else {
       $$182$off0 = 1; //@line 2171
       $$186$off0 = $14; //@line 2171
       break;
      }
     }
     if ((HEAP32[$22 >> 2] | 0) == 1) {
      label = 18; //@line 2178
      break L2;
     }
     if (!(HEAP32[$24 >> 2] & 2)) {
      label = 18; //@line 2185
      break L2;
     } else {
      $$182$off0 = 1; //@line 2188
      $$186$off0 = 1; //@line 2188
     }
    }
   } while (0);
   $30 = $18 + 8 | 0; //@line 2192
   if ($30 >>> 0 < $2 >>> 0) {
    HEAP8[$4 >> 0] = 0; //@line 2195
    HEAP8[$6 >> 0] = 0; //@line 2196
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(52) | 0; //@line 2197
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $8, $10, $10, 1, $12); //@line 2198
    if (!___async) {
     ___async_unwind = 0; //@line 2201
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 103; //@line 2203
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 2205
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 2207
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 2209
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 2211
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 2213
    HEAP8[$ReallocAsyncCtx5 + 24 >> 0] = $12 & 1; //@line 2216
    HEAP8[$ReallocAsyncCtx5 + 25 >> 0] = $$186$off0 & 1; //@line 2219
    HEAP8[$ReallocAsyncCtx5 + 26 >> 0] = $$182$off0 & 1; //@line 2222
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $30; //@line 2224
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $20; //@line 2226
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $22; //@line 2228
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $24; //@line 2230
    HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $26; //@line 2232
    HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $28; //@line 2234
    sp = STACKTOP; //@line 2235
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 2238
    $$283$off0 = $$182$off0; //@line 2238
    label = 13; //@line 2239
   }
  } else {
   $$085$off0$reg2mem$0 = $14; //@line 2242
   $$283$off0 = $16; //@line 2242
   label = 13; //@line 2243
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$20 >> 2] = $10; //@line 2249
    $59 = $8 + 40 | 0; //@line 2250
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 2253
    if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$22 >> 2] | 0) == 2) {
      HEAP8[$26 >> 0] = 1; //@line 2261
      if ($$283$off0) {
       label = 18; //@line 2263
       break;
      } else {
       $67 = 4; //@line 2266
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 2273
   } else {
    $67 = 4; //@line 2275
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 2280
 }
 HEAP32[$28 >> 2] = $67; //@line 2282
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
 sp = STACKTOP; //@line 10712
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10717
 } else {
  $9 = $1 + 52 | 0; //@line 10719
  $10 = HEAP8[$9 >> 0] | 0; //@line 10720
  $11 = $1 + 53 | 0; //@line 10721
  $12 = HEAP8[$11 >> 0] | 0; //@line 10722
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 10725
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 10726
  HEAP8[$9 >> 0] = 0; //@line 10727
  HEAP8[$11 >> 0] = 0; //@line 10728
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 10729
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 10730
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 101; //@line 10733
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 10735
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 10737
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 10739
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 10741
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 10743
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 10745
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 10747
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 10749
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 10751
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 10753
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 10756
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 10758
   sp = STACKTOP; //@line 10759
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10762
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 10767
    $32 = $0 + 8 | 0; //@line 10768
    $33 = $1 + 54 | 0; //@line 10769
    $$0 = $0 + 24 | 0; //@line 10770
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
     HEAP8[$9 >> 0] = 0; //@line 10803
     HEAP8[$11 >> 0] = 0; //@line 10804
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 10805
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 10806
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 10811
     $62 = $$0 + 8 | 0; //@line 10812
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 10815
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 102; //@line 10820
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 10822
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 10824
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 10826
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 10828
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 10830
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 10832
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 10834
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 10836
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 10838
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 10840
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 10842
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 10844
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 10846
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 10849
    sp = STACKTOP; //@line 10850
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 10854
  HEAP8[$11 >> 0] = $12; //@line 10855
 }
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_37($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1962
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1964
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1966
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1968
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1970
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 1973
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1975
 $15 = $12 + 24 | 0; //@line 1978
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$12 + 8 >> 2] | 0; //@line 1983
   if (!($18 & 2)) {
    $21 = $4 + 36 | 0; //@line 1987
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $4 + 54 | 0; //@line 1994
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 2005
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 2006
      if (!___async) {
       ___async_unwind = 0; //@line 2009
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 107; //@line 2011
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 2013
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $2; //@line 2015
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 2017
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 2019
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $4; //@line 2021
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $6; //@line 2023
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $8; //@line 2025
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $10 & 1; //@line 2028
      sp = STACKTOP; //@line 2029
      return;
     }
     $36 = $4 + 24 | 0; //@line 2032
     $37 = $4 + 54 | 0; //@line 2033
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 2048
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 2049
     if (!___async) {
      ___async_unwind = 0; //@line 2052
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 106; //@line 2054
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 2056
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $2; //@line 2058
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 2060
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 2062
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 2064
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $4; //@line 2066
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $6; //@line 2068
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $8; //@line 2070
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $10 & 1; //@line 2073
     sp = STACKTOP; //@line 2074
     return;
    }
   }
   $24 = $4 + 54 | 0; //@line 2078
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 2082
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 2083
    if (!___async) {
     ___async_unwind = 0; //@line 2086
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 105; //@line 2088
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 2090
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $2; //@line 2092
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 2094
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $4; //@line 2096
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $6; //@line 2098
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $8; //@line 2100
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $10 & 1; //@line 2103
    sp = STACKTOP; //@line 2104
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7929
      $10 = HEAP32[$9 >> 2] | 0; //@line 7930
      HEAP32[$2 >> 2] = $9 + 4; //@line 7932
      HEAP32[$0 >> 2] = $10; //@line 7933
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7949
      $17 = HEAP32[$16 >> 2] | 0; //@line 7950
      HEAP32[$2 >> 2] = $16 + 4; //@line 7952
      $20 = $0; //@line 7955
      HEAP32[$20 >> 2] = $17; //@line 7957
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 7960
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7976
      $30 = HEAP32[$29 >> 2] | 0; //@line 7977
      HEAP32[$2 >> 2] = $29 + 4; //@line 7979
      $31 = $0; //@line 7980
      HEAP32[$31 >> 2] = $30; //@line 7982
      HEAP32[$31 + 4 >> 2] = 0; //@line 7985
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 8001
      $41 = $40; //@line 8002
      $43 = HEAP32[$41 >> 2] | 0; //@line 8004
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 8007
      HEAP32[$2 >> 2] = $40 + 8; //@line 8009
      $47 = $0; //@line 8010
      HEAP32[$47 >> 2] = $43; //@line 8012
      HEAP32[$47 + 4 >> 2] = $46; //@line 8015
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8031
      $57 = HEAP32[$56 >> 2] | 0; //@line 8032
      HEAP32[$2 >> 2] = $56 + 4; //@line 8034
      $59 = ($57 & 65535) << 16 >> 16; //@line 8036
      $62 = $0; //@line 8039
      HEAP32[$62 >> 2] = $59; //@line 8041
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 8044
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8060
      $72 = HEAP32[$71 >> 2] | 0; //@line 8061
      HEAP32[$2 >> 2] = $71 + 4; //@line 8063
      $73 = $0; //@line 8065
      HEAP32[$73 >> 2] = $72 & 65535; //@line 8067
      HEAP32[$73 + 4 >> 2] = 0; //@line 8070
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8086
      $83 = HEAP32[$82 >> 2] | 0; //@line 8087
      HEAP32[$2 >> 2] = $82 + 4; //@line 8089
      $85 = ($83 & 255) << 24 >> 24; //@line 8091
      $88 = $0; //@line 8094
      HEAP32[$88 >> 2] = $85; //@line 8096
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 8099
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8115
      $98 = HEAP32[$97 >> 2] | 0; //@line 8116
      HEAP32[$2 >> 2] = $97 + 4; //@line 8118
      $99 = $0; //@line 8120
      HEAP32[$99 >> 2] = $98 & 255; //@line 8122
      HEAP32[$99 + 4 >> 2] = 0; //@line 8125
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 8141
      $109 = +HEAPF64[$108 >> 3]; //@line 8142
      HEAP32[$2 >> 2] = $108 + 8; //@line 8144
      HEAPF64[$0 >> 3] = $109; //@line 8145
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 8161
      $116 = +HEAPF64[$115 >> 3]; //@line 8162
      HEAP32[$2 >> 2] = $115 + 8; //@line 8164
      HEAPF64[$0 >> 3] = $116; //@line 8165
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
 sp = STACKTOP; //@line 6829
 STACKTOP = STACKTOP + 224 | 0; //@line 6830
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 6830
 $3 = sp + 120 | 0; //@line 6831
 $4 = sp + 80 | 0; //@line 6832
 $5 = sp; //@line 6833
 $6 = sp + 136 | 0; //@line 6834
 dest = $4; //@line 6835
 stop = dest + 40 | 0; //@line 6835
 do {
  HEAP32[dest >> 2] = 0; //@line 6835
  dest = dest + 4 | 0; //@line 6835
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 6837
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 6841
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 6848
  } else {
   $43 = 0; //@line 6850
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 6852
  $14 = $13 & 32; //@line 6853
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 6859
  }
  $19 = $0 + 48 | 0; //@line 6861
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 6866
    $24 = HEAP32[$23 >> 2] | 0; //@line 6867
    HEAP32[$23 >> 2] = $6; //@line 6868
    $25 = $0 + 28 | 0; //@line 6869
    HEAP32[$25 >> 2] = $6; //@line 6870
    $26 = $0 + 20 | 0; //@line 6871
    HEAP32[$26 >> 2] = $6; //@line 6872
    HEAP32[$19 >> 2] = 80; //@line 6873
    $28 = $0 + 16 | 0; //@line 6875
    HEAP32[$28 >> 2] = $6 + 80; //@line 6876
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6877
    if (!$24) {
     $$1 = $29; //@line 6880
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 6883
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 6884
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 6885
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 83; //@line 6888
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 6890
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 6892
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 6894
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 6896
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 6898
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 6900
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 6902
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 6904
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 6906
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 6908
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 6910
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 6912
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 6914
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 6916
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 6918
      sp = STACKTOP; //@line 6919
      STACKTOP = sp; //@line 6920
      return 0; //@line 6920
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 6922
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 6925
      HEAP32[$23 >> 2] = $24; //@line 6926
      HEAP32[$19 >> 2] = 0; //@line 6927
      HEAP32[$28 >> 2] = 0; //@line 6928
      HEAP32[$25 >> 2] = 0; //@line 6929
      HEAP32[$26 >> 2] = 0; //@line 6930
      $$1 = $$; //@line 6931
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6937
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 6940
  HEAP32[$0 >> 2] = $51 | $14; //@line 6945
  if ($43 | 0) {
   ___unlockfile($0); //@line 6948
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 6950
 }
 STACKTOP = sp; //@line 6952
 return $$0 | 0; //@line 6952
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 10247
 STACKTOP = STACKTOP + 64 | 0; //@line 10248
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 10248
 $4 = sp; //@line 10249
 $5 = HEAP32[$0 >> 2] | 0; //@line 10250
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 10253
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 10255
 HEAP32[$4 >> 2] = $2; //@line 10256
 HEAP32[$4 + 4 >> 2] = $0; //@line 10258
 HEAP32[$4 + 8 >> 2] = $1; //@line 10260
 HEAP32[$4 + 12 >> 2] = $3; //@line 10262
 $14 = $4 + 16 | 0; //@line 10263
 $15 = $4 + 20 | 0; //@line 10264
 $16 = $4 + 24 | 0; //@line 10265
 $17 = $4 + 28 | 0; //@line 10266
 $18 = $4 + 32 | 0; //@line 10267
 $19 = $4 + 40 | 0; //@line 10268
 dest = $14; //@line 10269
 stop = dest + 36 | 0; //@line 10269
 do {
  HEAP32[dest >> 2] = 0; //@line 10269
  dest = dest + 4 | 0; //@line 10269
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 10269
 HEAP8[$14 + 38 >> 0] = 0; //@line 10269
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 10274
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10277
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10278
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 10279
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 93; //@line 10282
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 10284
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 10286
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 10288
    sp = STACKTOP; //@line 10289
    STACKTOP = sp; //@line 10290
    return 0; //@line 10290
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10292
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 10296
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 10300
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 10303
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 10304
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 10305
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 94; //@line 10308
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 10310
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 10312
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 10314
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 10316
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 10318
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 10320
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 10322
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 10324
    sp = STACKTOP; //@line 10325
    STACKTOP = sp; //@line 10326
    return 0; //@line 10326
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10328
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 10342
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 10350
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 10366
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 10371
  }
 } while (0);
 STACKTOP = sp; //@line 10374
 return $$0 | 0; //@line 10374
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 6701
 $7 = ($2 | 0) != 0; //@line 6705
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 6709
   $$03555 = $0; //@line 6710
   $$03654 = $2; //@line 6710
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 6715
     $$036$lcssa64 = $$03654; //@line 6715
     label = 6; //@line 6716
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 6719
    $12 = $$03654 + -1 | 0; //@line 6720
    $16 = ($12 | 0) != 0; //@line 6724
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 6727
     $$03654 = $12; //@line 6727
    } else {
     $$035$lcssa = $11; //@line 6729
     $$036$lcssa = $12; //@line 6729
     $$lcssa = $16; //@line 6729
     label = 5; //@line 6730
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 6735
   $$036$lcssa = $2; //@line 6735
   $$lcssa = $7; //@line 6735
   label = 5; //@line 6736
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 6741
   $$036$lcssa64 = $$036$lcssa; //@line 6741
   label = 6; //@line 6742
  } else {
   $$2 = $$035$lcssa; //@line 6744
   $$3 = 0; //@line 6744
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 6750
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 6753
    $$3 = $$036$lcssa64; //@line 6753
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 6755
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 6759
      $$13745 = $$036$lcssa64; //@line 6759
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 6762
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 6771
       $30 = $$13745 + -4 | 0; //@line 6772
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 6775
        $$13745 = $30; //@line 6775
       } else {
        $$0$lcssa = $29; //@line 6777
        $$137$lcssa = $30; //@line 6777
        label = 11; //@line 6778
        break L11;
       }
      }
      $$140 = $$046; //@line 6782
      $$23839 = $$13745; //@line 6782
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 6784
      $$137$lcssa = $$036$lcssa64; //@line 6784
      label = 11; //@line 6785
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 6791
      $$3 = 0; //@line 6791
      break;
     } else {
      $$140 = $$0$lcssa; //@line 6794
      $$23839 = $$137$lcssa; //@line 6794
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 6801
      $$3 = $$23839; //@line 6801
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 6804
     $$23839 = $$23839 + -1 | 0; //@line 6805
     if (!$$23839) {
      $$2 = $35; //@line 6808
      $$3 = 0; //@line 6808
      break;
     } else {
      $$140 = $35; //@line 6811
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 6819
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 6472
 do {
  if (!$0) {
   do {
    if (!(HEAP32[109] | 0)) {
     $34 = 0; //@line 6480
    } else {
     $12 = HEAP32[109] | 0; //@line 6482
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 6483
     $13 = _fflush($12) | 0; //@line 6484
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 79; //@line 6487
      sp = STACKTOP; //@line 6488
      return 0; //@line 6489
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 6491
      $34 = $13; //@line 6492
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 6498
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 6502
    } else {
     $$02327 = $$02325; //@line 6504
     $$02426 = $34; //@line 6504
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 6511
      } else {
       $28 = 0; //@line 6513
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 6521
       $25 = ___fflush_unlocked($$02327) | 0; //@line 6522
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 6527
       $$1 = $25 | $$02426; //@line 6529
      } else {
       $$1 = $$02426; //@line 6531
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 6535
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 6538
      if (!$$023) {
       $$024$lcssa = $$1; //@line 6541
       break L9;
      } else {
       $$02327 = $$023; //@line 6544
       $$02426 = $$1; //@line 6544
      }
     }
     HEAP32[$AsyncCtx >> 2] = 80; //@line 6547
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 6549
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 6551
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 6553
     sp = STACKTOP; //@line 6554
     return 0; //@line 6555
    }
   } while (0);
   ___ofl_unlock(); //@line 6558
   $$0 = $$024$lcssa; //@line 6559
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 6565
    $5 = ___fflush_unlocked($0) | 0; //@line 6566
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 77; //@line 6569
     sp = STACKTOP; //@line 6570
     return 0; //@line 6571
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 6573
     $$0 = $5; //@line 6574
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 6579
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 6580
   $7 = ___fflush_unlocked($0) | 0; //@line 6581
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 78; //@line 6584
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 6587
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 6589
    sp = STACKTOP; //@line 6590
    return 0; //@line 6591
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6593
   if ($phitmp) {
    $$0 = $7; //@line 6595
   } else {
    ___unlockfile($0); //@line 6597
    $$0 = $7; //@line 6598
   }
  }
 } while (0);
 return $$0 | 0; //@line 6602
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10429
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10435
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 10441
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 10444
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 10445
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 10446
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 97; //@line 10449
     sp = STACKTOP; //@line 10450
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10453
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 10461
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 10466
     $19 = $1 + 44 | 0; //@line 10467
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 10473
     HEAP8[$22 >> 0] = 0; //@line 10474
     $23 = $1 + 53 | 0; //@line 10475
     HEAP8[$23 >> 0] = 0; //@line 10476
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 10478
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 10481
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 10482
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 10483
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 96; //@line 10486
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 10488
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10490
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 10492
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 10494
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 10496
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 10498
      sp = STACKTOP; //@line 10499
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 10502
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 10506
      label = 13; //@line 10507
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 10512
       label = 13; //@line 10513
      } else {
       $$037$off039 = 3; //@line 10515
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 10519
      $39 = $1 + 40 | 0; //@line 10520
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 10523
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 10533
        $$037$off039 = $$037$off038; //@line 10534
       } else {
        $$037$off039 = $$037$off038; //@line 10536
       }
      } else {
       $$037$off039 = $$037$off038; //@line 10539
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 10542
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 10549
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
 sp = STACKTOP; //@line 9741
 STACKTOP = STACKTOP + 48 | 0; //@line 9742
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 9742
 $vararg_buffer10 = sp + 32 | 0; //@line 9743
 $vararg_buffer7 = sp + 24 | 0; //@line 9744
 $vararg_buffer3 = sp + 16 | 0; //@line 9745
 $vararg_buffer = sp; //@line 9746
 $0 = sp + 36 | 0; //@line 9747
 $1 = ___cxa_get_globals_fast() | 0; //@line 9748
 if ($1 | 0) {
  $3 = HEAP32[$1 >> 2] | 0; //@line 9751
  if ($3 | 0) {
   $7 = $3 + 48 | 0; //@line 9756
   $9 = HEAP32[$7 >> 2] | 0; //@line 9758
   $12 = HEAP32[$7 + 4 >> 2] | 0; //@line 9761
   if (!(($9 & -256 | 0) == 1126902528 & ($12 | 0) == 1129074247)) {
    HEAP32[$vararg_buffer7 >> 2] = 3945; //@line 9767
    _abort_message(3895, $vararg_buffer7); //@line 9768
   }
   if (($9 | 0) == 1126902529 & ($12 | 0) == 1129074247) {
    $22 = HEAP32[$3 + 44 >> 2] | 0; //@line 9777
   } else {
    $22 = $3 + 80 | 0; //@line 9779
   }
   HEAP32[$0 >> 2] = $22; //@line 9781
   $23 = HEAP32[$3 >> 2] | 0; //@line 9782
   $25 = HEAP32[$23 + 4 >> 2] | 0; //@line 9784
   $28 = HEAP32[(HEAP32[10] | 0) + 16 >> 2] | 0; //@line 9787
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 9788
   $29 = FUNCTION_TABLE_iiii[$28 & 7](40, $23, $0) | 0; //@line 9789
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 87; //@line 9792
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 9794
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 9796
    HEAP32[$AsyncCtx + 12 >> 2] = $25; //@line 9798
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 9800
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 9802
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 9804
    sp = STACKTOP; //@line 9805
    STACKTOP = sp; //@line 9806
    return;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 9808
   if (!$29) {
    HEAP32[$vararg_buffer3 >> 2] = 3945; //@line 9810
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 9812
    _abort_message(3854, $vararg_buffer3); //@line 9813
   }
   $36 = HEAP32[$0 >> 2] | 0; //@line 9816
   $39 = HEAP32[(HEAP32[$36 >> 2] | 0) + 8 >> 2] | 0; //@line 9819
   $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 9820
   $40 = FUNCTION_TABLE_ii[$39 & 3]($36) | 0; //@line 9821
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 88; //@line 9824
    HEAP32[$AsyncCtx14 + 4 >> 2] = $vararg_buffer; //@line 9826
    HEAP32[$AsyncCtx14 + 8 >> 2] = $25; //@line 9828
    HEAP32[$AsyncCtx14 + 12 >> 2] = $vararg_buffer; //@line 9830
    sp = STACKTOP; //@line 9831
    STACKTOP = sp; //@line 9832
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 9834
    HEAP32[$vararg_buffer >> 2] = 3945; //@line 9835
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 9837
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 9839
    _abort_message(3809, $vararg_buffer); //@line 9840
   }
  }
 }
 _abort_message(3933, $vararg_buffer10); //@line 9845
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5727
 STACKTOP = STACKTOP + 48 | 0; //@line 5728
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 5728
 $vararg_buffer3 = sp + 16 | 0; //@line 5729
 $vararg_buffer = sp; //@line 5730
 $3 = sp + 32 | 0; //@line 5731
 $4 = $0 + 28 | 0; //@line 5732
 $5 = HEAP32[$4 >> 2] | 0; //@line 5733
 HEAP32[$3 >> 2] = $5; //@line 5734
 $7 = $0 + 20 | 0; //@line 5736
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 5738
 HEAP32[$3 + 4 >> 2] = $9; //@line 5739
 HEAP32[$3 + 8 >> 2] = $1; //@line 5741
 HEAP32[$3 + 12 >> 2] = $2; //@line 5743
 $12 = $9 + $2 | 0; //@line 5744
 $13 = $0 + 60 | 0; //@line 5745
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 5748
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 5750
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 5752
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 5754
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 5758
  } else {
   $$04756 = 2; //@line 5760
   $$04855 = $12; //@line 5760
   $$04954 = $3; //@line 5760
   $27 = $17; //@line 5760
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 5766
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 5768
    $38 = $27 >>> 0 > $37 >>> 0; //@line 5769
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 5771
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 5773
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 5775
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 5778
    $44 = $$150 + 4 | 0; //@line 5779
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 5782
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 5785
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 5787
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 5789
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 5791
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 5794
     break L1;
    } else {
     $$04756 = $$1; //@line 5797
     $$04954 = $$150; //@line 5797
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 5801
   HEAP32[$4 >> 2] = 0; //@line 5802
   HEAP32[$7 >> 2] = 0; //@line 5803
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 5806
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 5809
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 5814
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 5820
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 5825
  $25 = $20; //@line 5826
  HEAP32[$4 >> 2] = $25; //@line 5827
  HEAP32[$7 >> 2] = $25; //@line 5828
  $$051 = $2; //@line 5829
 }
 STACKTOP = sp; //@line 5831
 return $$051 | 0; //@line 5831
}
function _main__async_cb_53($0) {
 $0 = $0 | 0;
 var $$expand_i1_val = 0, $12 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 3261
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3263
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3265
 if (!$AsyncRetVal) {
  HEAP32[$2 >> 2] = 0; //@line 3268
  HEAP32[$2 + 4 >> 2] = 0; //@line 3268
  HEAP32[$2 + 8 >> 2] = 0; //@line 3268
  HEAP32[$2 + 12 >> 2] = 0; //@line 3268
  $18 = 1; //@line 3269
  $20 = $2; //@line 3269
 } else {
  HEAP32[$AsyncRetVal + 4 >> 2] = 4388; //@line 3272
  HEAP32[$AsyncRetVal + 8 >> 2] = 0; //@line 3274
  HEAP32[$AsyncRetVal + 12 >> 2] = 0; //@line 3276
  HEAP32[$AsyncRetVal + 16 >> 2] = -1; //@line 3278
  HEAP32[$AsyncRetVal + 20 >> 2] = 2; //@line 3280
  HEAP32[$AsyncRetVal + 24 >> 2] = 60; //@line 3282
  HEAP32[$AsyncRetVal + 28 >> 2] = 3; //@line 3284
  HEAP32[$AsyncRetVal >> 2] = 1; //@line 3285
  $12 = $2 + 4 | 0; //@line 3286
  HEAP32[$12 >> 2] = 0; //@line 3287
  HEAP32[$12 + 4 >> 2] = 0; //@line 3287
  HEAP32[$12 + 8 >> 2] = 0; //@line 3287
  HEAP32[$2 >> 2] = $AsyncRetVal; //@line 3288
  HEAP32[$AsyncRetVal >> 2] = (HEAP32[$AsyncRetVal >> 2] | 0) + 1; //@line 3291
  $18 = 0; //@line 3292
  $20 = $2; //@line 3292
 }
 $15 = $2 + 12 | 0; //@line 3294
 HEAP32[$15 >> 2] = 168; //@line 3295
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(24) | 0; //@line 3296
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(4636, $2); //@line 3297
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 61; //@line 3300
  $16 = $ReallocAsyncCtx6 + 4 | 0; //@line 3301
  HEAP32[$16 >> 2] = $15; //@line 3302
  $17 = $ReallocAsyncCtx6 + 8 | 0; //@line 3303
  $$expand_i1_val = $18 & 1; //@line 3304
  HEAP8[$17 >> 0] = $$expand_i1_val; //@line 3305
  $19 = $ReallocAsyncCtx6 + 12 | 0; //@line 3306
  HEAP32[$19 >> 2] = $20; //@line 3307
  $21 = $ReallocAsyncCtx6 + 16 | 0; //@line 3308
  HEAP32[$21 >> 2] = $AsyncRetVal; //@line 3309
  $22 = $ReallocAsyncCtx6 + 20 | 0; //@line 3310
  HEAP32[$22 >> 2] = $AsyncRetVal; //@line 3311
  sp = STACKTOP; //@line 3312
  return;
 }
 ___async_unwind = 0; //@line 3315
 HEAP32[$ReallocAsyncCtx6 >> 2] = 61; //@line 3316
 $16 = $ReallocAsyncCtx6 + 4 | 0; //@line 3317
 HEAP32[$16 >> 2] = $15; //@line 3318
 $17 = $ReallocAsyncCtx6 + 8 | 0; //@line 3319
 $$expand_i1_val = $18 & 1; //@line 3320
 HEAP8[$17 >> 0] = $$expand_i1_val; //@line 3321
 $19 = $ReallocAsyncCtx6 + 12 | 0; //@line 3322
 HEAP32[$19 >> 2] = $20; //@line 3323
 $21 = $ReallocAsyncCtx6 + 16 | 0; //@line 3324
 HEAP32[$21 >> 2] = $AsyncRetVal; //@line 3325
 $22 = $ReallocAsyncCtx6 + 20 | 0; //@line 3326
 HEAP32[$22 >> 2] = $AsyncRetVal; //@line 3327
 sp = STACKTOP; //@line 3328
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_47($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2843
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2847
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2849
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 2851
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2853
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 2855
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2857
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2859
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2861
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2863
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 2866
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 2868
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 2872
   $27 = $6 + 24 | 0; //@line 2873
   $28 = $4 + 8 | 0; //@line 2874
   $29 = $6 + 54 | 0; //@line 2875
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
    HEAP8[$10 >> 0] = 0; //@line 2905
    HEAP8[$14 >> 0] = 0; //@line 2906
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 2907
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 2908
    if (!___async) {
     ___async_unwind = 0; //@line 2911
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 102; //@line 2913
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 2915
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 2917
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 2919
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 2921
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 2923
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 2925
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 2927
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 2929
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 2931
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 2933
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 2935
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 2937
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 2939
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 2942
    sp = STACKTOP; //@line 2943
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 2948
 HEAP8[$14 >> 0] = $12; //@line 2949
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2727
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2731
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2733
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 2735
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2737
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 2739
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2741
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2743
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2745
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2747
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 2749
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 2751
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 2753
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 2756
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 2757
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
    HEAP8[$10 >> 0] = 0; //@line 2790
    HEAP8[$14 >> 0] = 0; //@line 2791
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 2792
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 2793
    if (!___async) {
     ___async_unwind = 0; //@line 2796
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 102; //@line 2798
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 2800
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 2802
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 2804
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 2806
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 2808
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 2810
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 2812
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 2814
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 2816
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 2818
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 2820
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 2822
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 2824
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 2827
    sp = STACKTOP; //@line 2828
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 2833
 HEAP8[$14 >> 0] = $12; //@line 2834
 return;
}
function _main__async_cb_52($0) {
 $0 = $0 | 0;
 var $$expand_i1_val = 0, $10 = 0, $11 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $19 = 0, $22 = 0, $23 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3174
 $4 = HEAP8[$0 + 8 >> 0] & 1; //@line 3179
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3181
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3183
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3185
 $11 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 3186
 if ($11 | 0) {
  $14 = HEAP32[$11 + 8 >> 2] | 0; //@line 3190
  $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 3191
  FUNCTION_TABLE_vi[$14 & 127]($6); //@line 3192
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 62; //@line 3195
   $15 = $ReallocAsyncCtx + 4 | 0; //@line 3196
   $$expand_i1_val = $4 & 1; //@line 3197
   HEAP8[$15 >> 0] = $$expand_i1_val; //@line 3198
   $16 = $ReallocAsyncCtx + 8 | 0; //@line 3199
   HEAP32[$16 >> 2] = $8; //@line 3200
   $17 = $ReallocAsyncCtx + 12 | 0; //@line 3201
   HEAP32[$17 >> 2] = $10; //@line 3202
   sp = STACKTOP; //@line 3203
   return;
  }
  ___async_unwind = 0; //@line 3206
  HEAP32[$ReallocAsyncCtx >> 2] = 62; //@line 3207
  $15 = $ReallocAsyncCtx + 4 | 0; //@line 3208
  $$expand_i1_val = $4 & 1; //@line 3209
  HEAP8[$15 >> 0] = $$expand_i1_val; //@line 3210
  $16 = $ReallocAsyncCtx + 8 | 0; //@line 3211
  HEAP32[$16 >> 2] = $8; //@line 3212
  $17 = $ReallocAsyncCtx + 12 | 0; //@line 3213
  HEAP32[$17 >> 2] = $10; //@line 3214
  sp = STACKTOP; //@line 3215
  return;
 }
 if (!$4) {
  $19 = (HEAP32[$8 >> 2] | 0) + -1 | 0; //@line 3220
  HEAP32[$8 >> 2] = $19; //@line 3221
  if (!$19) {
   $22 = HEAP32[$8 + 24 >> 2] | 0; //@line 3225
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 3226
   FUNCTION_TABLE_vi[$22 & 127]($10); //@line 3227
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 63; //@line 3230
    $23 = $ReallocAsyncCtx2 + 4 | 0; //@line 3231
    HEAP32[$23 >> 2] = $8; //@line 3232
    sp = STACKTOP; //@line 3233
    return;
   }
   ___async_unwind = 0; //@line 3236
   HEAP32[$ReallocAsyncCtx2 >> 2] = 63; //@line 3237
   $23 = $ReallocAsyncCtx2 + 4 | 0; //@line 3238
   HEAP32[$23 >> 2] = $8; //@line 3239
   sp = STACKTOP; //@line 3240
   return;
  }
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 3244
 __ZN6events10EventQueue8dispatchEi(4388, -1); //@line 3245
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 65; //@line 3248
  sp = STACKTOP; //@line 3249
  return;
 }
 ___async_unwind = 0; //@line 3252
 HEAP32[$ReallocAsyncCtx3 >> 2] = 65; //@line 3253
 sp = STACKTOP; //@line 3254
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 3839
 }
 ret = dest | 0; //@line 3842
 dest_end = dest + num | 0; //@line 3843
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 3847
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 3848
   dest = dest + 1 | 0; //@line 3849
   src = src + 1 | 0; //@line 3850
   num = num - 1 | 0; //@line 3851
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 3853
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 3854
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 3856
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 3857
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 3858
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 3859
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 3860
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 3861
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 3862
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 3863
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 3864
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 3865
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 3866
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 3867
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 3868
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 3869
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 3870
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 3871
   dest = dest + 64 | 0; //@line 3872
   src = src + 64 | 0; //@line 3873
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 3876
   dest = dest + 4 | 0; //@line 3877
   src = src + 4 | 0; //@line 3878
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 3882
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 3884
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 3885
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 3886
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 3887
   dest = dest + 4 | 0; //@line 3888
   src = src + 4 | 0; //@line 3889
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 3894
  dest = dest + 1 | 0; //@line 3895
  src = src + 1 | 0; //@line 3896
 }
 return ret | 0; //@line 3898
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
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11262
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 11268
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 11272
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 11273
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 11274
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 11275
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 108; //@line 11278
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 11280
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 11282
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 11284
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 11286
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 11288
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 11290
    sp = STACKTOP; //@line 11291
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11294
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 11298
    $$0 = $0 + 24 | 0; //@line 11299
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 11301
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 11302
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 11307
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 11313
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 11316
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 109; //@line 11321
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 11323
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 11325
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 11327
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 11329
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 11331
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 11333
    sp = STACKTOP; //@line 11334
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
 sp = STACKTOP; //@line 9930
 STACKTOP = STACKTOP + 64 | 0; //@line 9931
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 9931
 $3 = sp; //@line 9932
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 9935
 } else {
  if (!$1) {
   $$2 = 0; //@line 9939
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 9941
   $6 = ___dynamic_cast($1, 64, 48, 0) | 0; //@line 9942
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 91; //@line 9945
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 9947
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 9949
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 9951
    sp = STACKTOP; //@line 9952
    STACKTOP = sp; //@line 9953
    return 0; //@line 9953
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9955
   if (!$6) {
    $$2 = 0; //@line 9958
   } else {
    dest = $3 + 4 | 0; //@line 9961
    stop = dest + 52 | 0; //@line 9961
    do {
     HEAP32[dest >> 2] = 0; //@line 9961
     dest = dest + 4 | 0; //@line 9961
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 9962
    HEAP32[$3 + 8 >> 2] = $0; //@line 9964
    HEAP32[$3 + 12 >> 2] = -1; //@line 9966
    HEAP32[$3 + 48 >> 2] = 1; //@line 9968
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 9971
    $18 = HEAP32[$2 >> 2] | 0; //@line 9972
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 9973
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 9974
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 92; //@line 9977
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 9979
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 9981
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 9983
     sp = STACKTOP; //@line 9984
     STACKTOP = sp; //@line 9985
     return 0; //@line 9985
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9987
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 9994
     $$0 = 1; //@line 9995
    } else {
     $$0 = 0; //@line 9997
    }
    $$2 = $$0; //@line 9999
   }
  }
 }
 STACKTOP = sp; //@line 10003
 return $$2 | 0; //@line 10003
}
function _equeue_alloc__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$037$sink$i = 0, $$03741$i = 0, $$1$i9 = 0, $12 = 0, $15 = 0, $18 = 0, $19 = 0, $21 = 0, $22 = 0, $24 = 0, $25 = 0, $34 = 0, $4 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2961
 $6 = (HEAP32[$0 + 4 >> 2] | 0) + 39 & -4; //@line 2963
 $7 = $4 + 156 | 0; //@line 2964
 _equeue_mutex_lock($7); //@line 2965
 $8 = $4 + 24 | 0; //@line 2966
 $9 = HEAP32[$8 >> 2] | 0; //@line 2967
 L2 : do {
  if (!$9) {
   label = 8; //@line 2971
  } else {
   $$03741$i = $8; //@line 2973
   $12 = $9; //@line 2973
   while (1) {
    if ((HEAP32[$12 >> 2] | 0) >>> 0 >= $6 >>> 0) {
     break;
    }
    $18 = $12 + 8 | 0; //@line 2980
    $19 = HEAP32[$18 >> 2] | 0; //@line 2981
    if (!$19) {
     label = 8; //@line 2984
     break L2;
    } else {
     $$03741$i = $18; //@line 2987
     $12 = $19; //@line 2987
    }
   }
   $15 = HEAP32[$12 + 12 >> 2] | 0; //@line 2991
   if (!$15) {
    $$037$sink$i = $$03741$i; //@line 2994
   } else {
    HEAP32[$$03741$i >> 2] = $15; //@line 2996
    $$037$sink$i = $15 + 8 | 0; //@line 2998
   }
   HEAP32[$$037$sink$i >> 2] = HEAP32[$12 + 8 >> 2]; //@line 3002
   _equeue_mutex_unlock($7); //@line 3003
   $$1$i9 = $12; //@line 3004
  }
 } while (0);
 do {
  if ((label | 0) == 8) {
   $21 = $4 + 28 | 0; //@line 3009
   $22 = HEAP32[$21 >> 2] | 0; //@line 3010
   if ($22 >>> 0 < $6 >>> 0) {
    _equeue_mutex_unlock($7); //@line 3013
    $$0 = 0; //@line 3014
    $34 = ___async_retval; //@line 3015
    HEAP32[$34 >> 2] = $$0; //@line 3016
    return;
   } else {
    $24 = $4 + 32 | 0; //@line 3019
    $25 = HEAP32[$24 >> 2] | 0; //@line 3020
    HEAP32[$24 >> 2] = $25 + $6; //@line 3022
    HEAP32[$21 >> 2] = $22 - $6; //@line 3024
    HEAP32[$25 >> 2] = $6; //@line 3025
    HEAP8[$25 + 4 >> 0] = 1; //@line 3027
    _equeue_mutex_unlock($7); //@line 3028
    if (!$25) {
     $$0 = 0; //@line 3031
    } else {
     $$1$i9 = $25; //@line 3033
     break;
    }
    $34 = ___async_retval; //@line 3036
    HEAP32[$34 >> 2] = $$0; //@line 3037
    return;
   }
  }
 } while (0);
 HEAP32[$$1$i9 + 20 >> 2] = 0; //@line 3043
 HEAP32[$$1$i9 + 24 >> 2] = -1; //@line 3045
 HEAP32[$$1$i9 + 28 >> 2] = 0; //@line 3047
 $$0 = $$1$i9 + 36 | 0; //@line 3049
 $34 = ___async_retval; //@line 3050
 HEAP32[$34 >> 2] = $$0; //@line 3051
 return;
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
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 6337
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 6340
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 6343
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 6346
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 6352
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 6361
     $24 = $13 >>> 2; //@line 6362
     $$090 = 0; //@line 6363
     $$094 = $7; //@line 6363
     while (1) {
      $25 = $$094 >>> 1; //@line 6365
      $26 = $$090 + $25 | 0; //@line 6366
      $27 = $26 << 1; //@line 6367
      $28 = $27 + $23 | 0; //@line 6368
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 6371
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 6375
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 6381
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 6389
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 6393
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 6399
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 6404
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 6407
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 6407
      }
     }
     $46 = $27 + $24 | 0; //@line 6410
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 6413
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 6417
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 6429
     } else {
      $$4 = 0; //@line 6431
     }
    } else {
     $$4 = 0; //@line 6434
    }
   } else {
    $$4 = 0; //@line 6437
   }
  } else {
   $$4 = 0; //@line 6440
  }
 } while (0);
 return $$4 | 0; //@line 6443
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9572
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 9577
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 9582
  } else {
   $20 = $0 & 255; //@line 9584
   $21 = $0 & 255; //@line 9585
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 9591
   } else {
    $26 = $1 + 20 | 0; //@line 9593
    $27 = HEAP32[$26 >> 2] | 0; //@line 9594
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 9600
     HEAP8[$27 >> 0] = $20; //@line 9601
     $34 = $21; //@line 9602
    } else {
     label = 12; //@line 9604
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 9609
     $32 = ___overflow($1, $0) | 0; //@line 9610
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 85; //@line 9613
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 9615
      sp = STACKTOP; //@line 9616
      return 0; //@line 9617
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 9619
      $34 = $32; //@line 9620
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 9625
   $$0 = $34; //@line 9626
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 9631
   $8 = $0 & 255; //@line 9632
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 9638
    $14 = HEAP32[$13 >> 2] | 0; //@line 9639
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 9645
     HEAP8[$14 >> 0] = $7; //@line 9646
     $$0 = $8; //@line 9647
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 9651
   $19 = ___overflow($1, $0) | 0; //@line 9652
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 84; //@line 9655
    sp = STACKTOP; //@line 9656
    return 0; //@line 9657
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9659
    $$0 = $19; //@line 9660
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 9665
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6608
 $1 = $0 + 20 | 0; //@line 6609
 $3 = $0 + 28 | 0; //@line 6611
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 6617
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 6618
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 6619
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 81; //@line 6622
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 6624
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 6626
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 6628
    sp = STACKTOP; //@line 6629
    return 0; //@line 6630
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 6632
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 6636
     break;
    } else {
     label = 5; //@line 6639
     break;
    }
   }
  } else {
   label = 5; //@line 6644
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 6648
  $14 = HEAP32[$13 >> 2] | 0; //@line 6649
  $15 = $0 + 8 | 0; //@line 6650
  $16 = HEAP32[$15 >> 2] | 0; //@line 6651
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 6659
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 6660
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 6661
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 82; //@line 6664
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 6666
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 6668
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 6670
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 6672
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 6674
     sp = STACKTOP; //@line 6675
     return 0; //@line 6676
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6678
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 6684
  HEAP32[$3 >> 2] = 0; //@line 6685
  HEAP32[$1 >> 2] = 0; //@line 6686
  HEAP32[$15 >> 2] = 0; //@line 6687
  HEAP32[$13 >> 2] = 0; //@line 6688
  $$0 = 0; //@line 6689
 }
 return $$0 | 0; //@line 6691
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 6228
 $4 = HEAP32[$3 >> 2] | 0; //@line 6229
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 6236
   label = 5; //@line 6237
  } else {
   $$1 = 0; //@line 6239
  }
 } else {
  $12 = $4; //@line 6243
  label = 5; //@line 6244
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 6248
   $10 = HEAP32[$9 >> 2] | 0; //@line 6249
   $14 = $10; //@line 6252
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 6257
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 6265
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 6269
       $$141 = $0; //@line 6269
       $$143 = $1; //@line 6269
       $31 = $14; //@line 6269
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 6272
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 6279
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 6284
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 6287
      break L5;
     }
     $$139 = $$038; //@line 6293
     $$141 = $0 + $$038 | 0; //@line 6293
     $$143 = $1 - $$038 | 0; //@line 6293
     $31 = HEAP32[$9 >> 2] | 0; //@line 6293
    } else {
     $$139 = 0; //@line 6295
     $$141 = $0; //@line 6295
     $$143 = $1; //@line 6295
     $31 = $14; //@line 6295
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 6298
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 6301
   $$1 = $$139 + $$143 | 0; //@line 6303
  }
 } while (0);
 return $$1 | 0; //@line 6306
}
function _equeue_dealloc__async_cb($0) {
 $0 = $0 | 0;
 var $$02329$i = 0, $$02330$i = 0, $$025$i = 0, $$sink$in$i = 0, $$sink21$i = 0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $16 = 0, $2 = 0, $23 = 0, $4 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3400
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3402
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3404
 $7 = $2 + 156 | 0; //@line 3405
 _equeue_mutex_lock($7); //@line 3406
 $8 = $2 + 24 | 0; //@line 3407
 $9 = HEAP32[$8 >> 2] | 0; //@line 3408
 L3 : do {
  if (!$9) {
   $$02329$i = $8; //@line 3412
  } else {
   $11 = HEAP32[$6 >> 2] | 0; //@line 3414
   $$025$i = $8; //@line 3415
   $13 = $9; //@line 3415
   while (1) {
    $12 = HEAP32[$13 >> 2] | 0; //@line 3417
    if ($12 >>> 0 >= $11 >>> 0) {
     break;
    }
    $15 = $13 + 8 | 0; //@line 3422
    $16 = HEAP32[$15 >> 2] | 0; //@line 3423
    if (!$16) {
     $$02329$i = $15; //@line 3426
     break L3;
    } else {
     $$025$i = $15; //@line 3429
     $13 = $16; //@line 3429
    }
   }
   if (($12 | 0) == ($11 | 0)) {
    HEAP32[$4 + -24 >> 2] = $13; //@line 3435
    $$02330$i = $$025$i; //@line 3438
    $$sink$in$i = (HEAP32[$$025$i >> 2] | 0) + 8 | 0; //@line 3438
    $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 3439
    $23 = $4 + -28 | 0; //@line 3440
    HEAP32[$23 >> 2] = $$sink21$i; //@line 3441
    HEAP32[$$02330$i >> 2] = $6; //@line 3442
    _equeue_mutex_unlock($7); //@line 3443
    return;
   } else {
    $$02329$i = $$025$i; //@line 3446
   }
  }
 } while (0);
 HEAP32[$4 + -24 >> 2] = 0; //@line 3451
 $$02330$i = $$02329$i; //@line 3452
 $$sink$in$i = $$02329$i; //@line 3452
 $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 3453
 $23 = $4 + -28 | 0; //@line 3454
 HEAP32[$23 >> 2] = $$sink21$i; //@line 3455
 HEAP32[$$02330$i >> 2] = $6; //@line 3456
 _equeue_mutex_unlock($7); //@line 3457
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_40($0) {
 $0 = $0 | 0;
 var $$phi$trans$insert = 0, $$pre10 = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 2355
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2359
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2361
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2363
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2365
 $$phi$trans$insert = (HEAP32[$0 + 4 >> 2] | 0) + 12 | 0; //@line 2366
 $$pre10 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 2367
 if (!$$pre10) {
  HEAP32[$4 >> 2] = 0; //@line 2370
  _gpio_irq_set($10 + 28 | 0, 2, 0); //@line 2372
  return;
 }
 $13 = HEAP32[$$pre10 + 4 >> 2] | 0; //@line 2376
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 2377
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 2378
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 20; //@line 2381
  $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 2382
  HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 2383
  $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 2384
  HEAP32[$15 >> 2] = $4; //@line 2385
  $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 2386
  HEAP32[$16 >> 2] = $8; //@line 2387
  $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 2388
  HEAP32[$17 >> 2] = $10; //@line 2389
  sp = STACKTOP; //@line 2390
  return;
 }
 ___async_unwind = 0; //@line 2393
 HEAP32[$ReallocAsyncCtx4 >> 2] = 20; //@line 2394
 $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 2395
 HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 2396
 $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 2397
 HEAP32[$15 >> 2] = $4; //@line 2398
 $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 2399
 HEAP32[$16 >> 2] = $8; //@line 2400
 $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 2401
 HEAP32[$17 >> 2] = $10; //@line 2402
 sp = STACKTOP; //@line 2403
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_35($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1833
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1837
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1839
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1841
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1843
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1845
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1847
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1849
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 1852
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 1853
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 1869
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 1870
    if (!___async) {
     ___async_unwind = 0; //@line 1873
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 106; //@line 1875
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 1877
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 1879
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 1881
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 1883
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 1885
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 1887
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 1889
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 1891
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 1894
    sp = STACKTOP; //@line 1895
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
 sp = STACKTOP; //@line 6114
 STACKTOP = STACKTOP + 16 | 0; //@line 6115
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 6115
 $2 = sp; //@line 6116
 $3 = $1 & 255; //@line 6117
 HEAP8[$2 >> 0] = $3; //@line 6118
 $4 = $0 + 16 | 0; //@line 6119
 $5 = HEAP32[$4 >> 2] | 0; //@line 6120
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 6127
   label = 4; //@line 6128
  } else {
   $$0 = -1; //@line 6130
  }
 } else {
  $12 = $5; //@line 6133
  label = 4; //@line 6134
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 6138
   $10 = HEAP32[$9 >> 2] | 0; //@line 6139
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 6142
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 6149
     HEAP8[$10 >> 0] = $3; //@line 6150
     $$0 = $13; //@line 6151
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 6156
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 6157
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 6158
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 76; //@line 6161
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 6163
    sp = STACKTOP; //@line 6164
    STACKTOP = sp; //@line 6165
    return 0; //@line 6165
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 6167
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 6172
   } else {
    $$0 = -1; //@line 6174
   }
  }
 } while (0);
 STACKTOP = sp; //@line 6178
 return $$0 | 0; //@line 6178
}
function _main__async_cb_54($0) {
 $0 = $0 | 0;
 var $2 = 0, $5 = 0, $6 = 0, $7 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 3334
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3336
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3338
 if (!$AsyncRetVal) {
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 3341
  $6 = _equeue_alloc(4388, 32) | 0; //@line 3342
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 59; //@line 3345
   $7 = $ReallocAsyncCtx7 + 4 | 0; //@line 3346
   HEAP32[$7 >> 2] = $2; //@line 3347
   sp = STACKTOP; //@line 3348
   return;
  }
  HEAP32[___async_retval >> 2] = $6; //@line 3352
  ___async_unwind = 0; //@line 3353
  HEAP32[$ReallocAsyncCtx7 >> 2] = 59; //@line 3354
  $7 = $ReallocAsyncCtx7 + 4 | 0; //@line 3355
  HEAP32[$7 >> 2] = $2; //@line 3356
  sp = STACKTOP; //@line 3357
  return;
 } else {
  HEAP32[$AsyncRetVal >> 2] = 2; //@line 3360
  _equeue_event_delay($AsyncRetVal, 1e3); //@line 3361
  _equeue_event_period($AsyncRetVal, 1e3); //@line 3362
  _equeue_event_dtor($AsyncRetVal, 56); //@line 3363
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 3364
  _equeue_post(4388, 57, $AsyncRetVal) | 0; //@line 3365
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 58; //@line 3368
   $5 = $ReallocAsyncCtx4 + 4 | 0; //@line 3369
   HEAP32[$5 >> 2] = $2; //@line 3370
   sp = STACKTOP; //@line 3371
   return;
  }
  ___async_unwind = 0; //@line 3374
  HEAP32[$ReallocAsyncCtx4 >> 2] = 58; //@line 3375
  $5 = $ReallocAsyncCtx4 + 4 | 0; //@line 3376
  HEAP32[$5 >> 2] = $2; //@line 3377
  sp = STACKTOP; //@line 3378
  return;
 }
}
function _fflush__async_cb_46($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2630
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2632
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 2634
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 2638
  } else {
   $$02327 = $$02325; //@line 2640
   $$02426 = $AsyncRetVal; //@line 2640
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 2647
    } else {
     $16 = 0; //@line 2649
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 2661
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 2664
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 2667
     break L3;
    } else {
     $$02327 = $$023; //@line 2670
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 2673
   $13 = ___fflush_unlocked($$02327) | 0; //@line 2674
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 2678
    ___async_unwind = 0; //@line 2679
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 80; //@line 2681
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 2683
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 2685
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 2687
   sp = STACKTOP; //@line 2688
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 2692
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 2694
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 3903
 value = value & 255; //@line 3905
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 3908
   ptr = ptr + 1 | 0; //@line 3909
  }
  aligned_end = end & -4 | 0; //@line 3912
  block_aligned_end = aligned_end - 64 | 0; //@line 3913
  value4 = value | value << 8 | value << 16 | value << 24; //@line 3914
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 3917
   HEAP32[ptr + 4 >> 2] = value4; //@line 3918
   HEAP32[ptr + 8 >> 2] = value4; //@line 3919
   HEAP32[ptr + 12 >> 2] = value4; //@line 3920
   HEAP32[ptr + 16 >> 2] = value4; //@line 3921
   HEAP32[ptr + 20 >> 2] = value4; //@line 3922
   HEAP32[ptr + 24 >> 2] = value4; //@line 3923
   HEAP32[ptr + 28 >> 2] = value4; //@line 3924
   HEAP32[ptr + 32 >> 2] = value4; //@line 3925
   HEAP32[ptr + 36 >> 2] = value4; //@line 3926
   HEAP32[ptr + 40 >> 2] = value4; //@line 3927
   HEAP32[ptr + 44 >> 2] = value4; //@line 3928
   HEAP32[ptr + 48 >> 2] = value4; //@line 3929
   HEAP32[ptr + 52 >> 2] = value4; //@line 3930
   HEAP32[ptr + 56 >> 2] = value4; //@line 3931
   HEAP32[ptr + 60 >> 2] = value4; //@line 3932
   ptr = ptr + 64 | 0; //@line 3933
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 3937
   ptr = ptr + 4 | 0; //@line 3938
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 3943
  ptr = ptr + 1 | 0; //@line 3944
 }
 return end - num | 0; //@line 3946
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1770
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1774
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1776
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1778
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1780
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1782
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1784
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 1787
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 1788
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 1797
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 1798
    if (!___async) {
     ___async_unwind = 0; //@line 1801
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 107; //@line 1803
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 1805
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 1807
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 1809
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 1811
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 1813
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 1815
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 1817
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 1820
    sp = STACKTOP; //@line 1821
    return;
   }
  }
 }
 return;
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2531
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 2541
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 2541
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 2541
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 2545
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 2548
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 2551
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 2559
  } else {
   $20 = 0; //@line 2561
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 2571
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 2575
  HEAP32[___async_retval >> 2] = $$1; //@line 2577
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 2580
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 2581
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 2585
  ___async_unwind = 0; //@line 2586
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 80; //@line 2588
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 2590
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 2592
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 2594
 sp = STACKTOP; //@line 2595
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1149
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1151
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1153
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1155
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 1160
  } else {
   $9 = $4 + 4 | 0; //@line 1162
   $10 = HEAP32[$9 >> 2] | 0; //@line 1163
   $11 = $4 + 8 | 0; //@line 1164
   $12 = HEAP32[$11 >> 2] | 0; //@line 1165
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 1169
    HEAP32[$6 >> 2] = 0; //@line 1170
    HEAP32[$2 >> 2] = 0; //@line 1171
    HEAP32[$11 >> 2] = 0; //@line 1172
    HEAP32[$9 >> 2] = 0; //@line 1173
    $$0 = 0; //@line 1174
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 1181
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 1182
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 1183
   if (!___async) {
    ___async_unwind = 0; //@line 1186
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 82; //@line 1188
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 1190
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 1192
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 1194
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 1196
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 1198
   sp = STACKTOP; //@line 1199
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 1204
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2289
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2291
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2293
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2295
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2297
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2299
 $$pre = HEAP32[$2 >> 2] | 0; //@line 2300
 if (!$$pre) {
  HEAP32[$4 >> 2] = 0; //@line 2303
  _gpio_irq_set($10 + 28 | 0, 2, 1); //@line 2305
  return;
 }
 $13 = HEAP32[$$pre + 4 >> 2] | 0; //@line 2309
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 2310
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 2311
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 18; //@line 2314
  $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 2315
  HEAP32[$14 >> 2] = $2; //@line 2316
  $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 2317
  HEAP32[$15 >> 2] = $4; //@line 2318
  $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 2319
  HEAP32[$16 >> 2] = $10; //@line 2320
  sp = STACKTOP; //@line 2321
  return;
 }
 ___async_unwind = 0; //@line 2324
 HEAP32[$ReallocAsyncCtx2 >> 2] = 18; //@line 2325
 $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 2326
 HEAP32[$14 >> 2] = $2; //@line 2327
 $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 2328
 HEAP32[$15 >> 2] = $4; //@line 2329
 $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 2330
 HEAP32[$16 >> 2] = $10; //@line 2331
 sp = STACKTOP; //@line 2332
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
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_2($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 11653
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11655
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11657
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11659
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11661
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 11666
  return;
 }
 dest = $2 + 4 | 0; //@line 11670
 stop = dest + 52 | 0; //@line 11670
 do {
  HEAP32[dest >> 2] = 0; //@line 11670
  dest = dest + 4 | 0; //@line 11670
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 11671
 HEAP32[$2 + 8 >> 2] = $4; //@line 11673
 HEAP32[$2 + 12 >> 2] = -1; //@line 11675
 HEAP32[$2 + 48 >> 2] = 1; //@line 11677
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 11680
 $16 = HEAP32[$6 >> 2] | 0; //@line 11681
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 11682
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 11683
 if (!___async) {
  ___async_unwind = 0; //@line 11686
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 92; //@line 11688
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 11690
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 11692
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 11694
 sp = STACKTOP; //@line 11695
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 9380
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 9385
    $$0 = 1; //@line 9386
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 9399
     $$0 = 1; //@line 9400
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 9404
     $$0 = -1; //@line 9405
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 9415
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 9419
    $$0 = 2; //@line 9420
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 9432
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 9438
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 9442
    $$0 = 3; //@line 9443
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 9453
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 9459
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 9465
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 9469
    $$0 = 4; //@line 9470
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 9474
    $$0 = -1; //@line 9475
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 9480
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_36($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1906
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1910
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1912
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1914
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1916
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1918
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 1921
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 1922
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 1928
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 1929
   if (!___async) {
    ___async_unwind = 0; //@line 1932
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 105; //@line 1934
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 1936
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 1938
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 1940
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 1942
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 1944
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 1946
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 1949
   sp = STACKTOP; //@line 1950
   return;
  }
 }
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $11 = 0, $12 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3057
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3062
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3064
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  $8 = (HEAP32[$4 >> 2] | 0) + -1 | 0; //@line 3067
  HEAP32[$4 >> 2] = $8; //@line 3068
  if (!$8) {
   $11 = HEAP32[$4 + 24 >> 2] | 0; //@line 3072
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 3073
   FUNCTION_TABLE_vi[$11 & 127]($6); //@line 3074
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 63; //@line 3077
    $12 = $ReallocAsyncCtx2 + 4 | 0; //@line 3078
    HEAP32[$12 >> 2] = $4; //@line 3079
    sp = STACKTOP; //@line 3080
    return;
   }
   ___async_unwind = 0; //@line 3083
   HEAP32[$ReallocAsyncCtx2 >> 2] = 63; //@line 3084
   $12 = $ReallocAsyncCtx2 + 4 | 0; //@line 3085
   HEAP32[$12 >> 2] = $4; //@line 3086
   sp = STACKTOP; //@line 3087
   return;
  }
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 3091
 __ZN6events10EventQueue8dispatchEi(4388, -1); //@line 3092
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 65; //@line 3095
  sp = STACKTOP; //@line 3096
  return;
 }
 ___async_unwind = 0; //@line 3099
 HEAP32[$ReallocAsyncCtx3 >> 2] = 65; //@line 3100
 sp = STACKTOP; //@line 3101
 return;
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 8264
  $8 = $0; //@line 8264
  $9 = $1; //@line 8264
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 8266
   $$0914 = $$0914 + -1 | 0; //@line 8270
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 8271
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 8272
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 8280
   }
  }
  $$010$lcssa$off0 = $8; //@line 8285
  $$09$lcssa = $$0914; //@line 8285
 } else {
  $$010$lcssa$off0 = $0; //@line 8287
  $$09$lcssa = $2; //@line 8287
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 8291
 } else {
  $$012 = $$010$lcssa$off0; //@line 8293
  $$111 = $$09$lcssa; //@line 8293
  while (1) {
   $26 = $$111 + -1 | 0; //@line 8298
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 8299
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 8303
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 8306
    $$111 = $26; //@line 8306
   }
  }
 }
 return $$1$lcssa | 0; //@line 8310
}
function __ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2387
 $1 = $0 + 4 | 0; //@line 2388
 $2 = HEAP32[$1 >> 2] | 0; //@line 2389
 $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2390
 $3 = _equeue_alloc($2, 4) | 0; //@line 2391
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 67; //@line 2394
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2396
  HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 2398
  sp = STACKTOP; //@line 2399
  return 0; //@line 2400
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2402
 if (!$3) {
  $$0 = 0; //@line 2405
  return $$0 | 0; //@line 2406
 }
 HEAP32[$3 >> 2] = HEAP32[$0 + 28 >> 2]; //@line 2410
 _equeue_event_delay($3, HEAP32[$0 + 12 >> 2] | 0); //@line 2413
 _equeue_event_period($3, HEAP32[$0 + 16 >> 2] | 0); //@line 2416
 _equeue_event_dtor($3, 68); //@line 2417
 $13 = HEAP32[$1 >> 2] | 0; //@line 2418
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2419
 $14 = _equeue_post($13, 69, $3) | 0; //@line 2420
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 70; //@line 2423
  sp = STACKTOP; //@line 2424
  return 0; //@line 2425
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2427
 $$0 = $14; //@line 2428
 return $$0 | 0; //@line 2429
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
 $1 = $0; //@line 5980
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 5985
   label = 4; //@line 5986
  } else {
   $$01519 = $0; //@line 5988
   $23 = $1; //@line 5988
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 5993
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 5996
    $23 = $6; //@line 5997
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 6001
     label = 4; //@line 6002
     break;
    } else {
     $$01519 = $6; //@line 6005
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 6011
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 6013
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 6021
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 6029
  } else {
   $$pn = $$0; //@line 6031
   while (1) {
    $19 = $$pn + 1 | 0; //@line 6033
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 6037
     break;
    } else {
     $$pn = $19; //@line 6040
    }
   }
  }
  $$sink = $$1$lcssa; //@line 6045
 }
 return $$sink - $1 | 0; //@line 6048
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 10177
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 10184
   $10 = $1 + 16 | 0; //@line 10185
   $11 = HEAP32[$10 >> 2] | 0; //@line 10186
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 10189
    HEAP32[$1 + 24 >> 2] = $4; //@line 10191
    HEAP32[$1 + 36 >> 2] = 1; //@line 10193
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 10203
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 10208
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 10211
    HEAP8[$1 + 54 >> 0] = 1; //@line 10213
    break;
   }
   $21 = $1 + 24 | 0; //@line 10216
   $22 = HEAP32[$21 >> 2] | 0; //@line 10217
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 10220
    $28 = $4; //@line 10221
   } else {
    $28 = $22; //@line 10223
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 10232
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 941
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 943
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 947
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 949
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 951
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 953
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 957
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 960
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 961
   if (!___async) {
    ___async_unwind = 0; //@line 964
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 109; //@line 966
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 968
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 970
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 972
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 974
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 976
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 978
   sp = STACKTOP; //@line 979
   return;
  }
 }
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
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_41($0) {
 $0 = $0 | 0;
 var $$pre$i$i4 = 0, $12 = 0, $13 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 2409
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2415
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2417
 $$pre$i$i4 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 2418
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = $$pre$i$i4; //@line 2419
 if (!$$pre$i$i4) {
  _gpio_irq_set($8 + 28 | 0, 2, 0); //@line 2423
  return;
 }
 $12 = HEAP32[$$pre$i$i4 + 8 >> 2] | 0; //@line 2428
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(12) | 0; //@line 2429
 FUNCTION_TABLE_vi[$12 & 127]($6); //@line 2430
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 21; //@line 2433
  $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 2434
  HEAP32[$13 >> 2] = $6; //@line 2435
  $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 2436
  HEAP32[$14 >> 2] = $8; //@line 2437
  sp = STACKTOP; //@line 2438
  return;
 }
 ___async_unwind = 0; //@line 2441
 HEAP32[$ReallocAsyncCtx5 >> 2] = 21; //@line 2442
 $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 2443
 HEAP32[$13 >> 2] = $6; //@line 2444
 $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 2445
 HEAP32[$14 >> 2] = $8; //@line 2446
 sp = STACKTOP; //@line 2447
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9671
 $1 = HEAP32[77] | 0; //@line 9672
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 9678
 } else {
  $19 = 0; //@line 9680
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 9686
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 9692
    $12 = HEAP32[$11 >> 2] | 0; //@line 9693
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 9699
     HEAP8[$12 >> 0] = 10; //@line 9700
     $22 = 0; //@line 9701
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 9705
   $17 = ___overflow($1, 10) | 0; //@line 9706
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 86; //@line 9709
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 9711
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 9713
    sp = STACKTOP; //@line 9714
    return 0; //@line 9715
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9717
    $22 = $17 >> 31; //@line 9719
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 9726
 }
 return $22 | 0; //@line 9728
}
function __ZN4mbed11InterruptInD0Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 108
 HEAP32[$0 >> 2] = 160; //@line 109
 _gpio_irq_free($0 + 28 | 0); //@line 111
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 113
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 119
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 120
   FUNCTION_TABLE_vi[$7 & 127]($0 + 56 | 0); //@line 121
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 13; //@line 124
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 126
    sp = STACKTOP; //@line 127
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 130
    break;
   }
  }
 } while (0);
 $10 = HEAP32[$0 + 52 >> 2] | 0; //@line 136
 if (!$10) {
  __ZdlPv($0); //@line 139
  return;
 }
 $14 = HEAP32[$10 + 8 >> 2] | 0; //@line 144
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 145
 FUNCTION_TABLE_vi[$14 & 127]($0 + 40 | 0); //@line 146
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 14; //@line 149
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 151
  sp = STACKTOP; //@line 152
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 155
 __ZdlPv($0); //@line 156
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_13($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 989
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 995
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 997
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 999
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1001
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 1006
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 1008
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 1009
 if (!___async) {
  ___async_unwind = 0; //@line 1012
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 109; //@line 1014
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 1016
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 1018
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 1020
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 1022
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 1024
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 1026
 sp = STACKTOP; //@line 1027
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10036
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 10045
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 10050
      HEAP32[$13 >> 2] = $2; //@line 10051
      $19 = $1 + 40 | 0; //@line 10052
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 10055
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 10065
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 10069
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 10076
    }
   }
  }
 } while (0);
 return;
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1705
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1707
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1709
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1711
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 1713
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 1715
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 3945; //@line 1720
  HEAP32[$4 + 4 >> 2] = $6; //@line 1722
  _abort_message(3854, $4); //@line 1723
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 1726
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 1729
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 1730
 $16 = FUNCTION_TABLE_ii[$15 & 3]($12) | 0; //@line 1731
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 1735
  ___async_unwind = 0; //@line 1736
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 88; //@line 1738
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 1740
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 1742
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 1744
 sp = STACKTOP; //@line 1745
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1044
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1046
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1048
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1052
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 1056
  label = 4; //@line 1057
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 1062
   label = 4; //@line 1063
  } else {
   $$037$off039 = 3; //@line 1065
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 1069
  $17 = $8 + 40 | 0; //@line 1070
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 1073
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 1083
    $$037$off039 = $$037$off038; //@line 1084
   } else {
    $$037$off039 = $$037$off038; //@line 1086
   }
  } else {
   $$037$off039 = $$037$off038; //@line 1089
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 1092
 return;
}
function ___strerror_l($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $7 = 0, label = 0, $$113$looptemp = 0;
 $$016 = 0; //@line 9500
 while (1) {
  if ((HEAPU8[1917 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 9507
   break;
  }
  $7 = $$016 + 1 | 0; //@line 9510
  if (($7 | 0) == 87) {
   $$01214 = 2005; //@line 9513
   $$115 = 87; //@line 9513
   label = 5; //@line 9514
   break;
  } else {
   $$016 = $7; //@line 9517
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 2005; //@line 9523
  } else {
   $$01214 = 2005; //@line 9525
   $$115 = $$016; //@line 9525
   label = 5; //@line 9526
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 9531
   $$113 = $$01214; //@line 9532
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 9536
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 9543
   if (!$$115) {
    $$012$lcssa = $$113; //@line 9546
    break;
   } else {
    $$01214 = $$113; //@line 9549
    label = 5; //@line 9550
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 9557
}
function __ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb_43($0) {
 $0 = $0 | 0;
 var $13 = 0, $14 = 0, $2 = 0, $4 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2476
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2478
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2480
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2482
 if (!$AsyncRetVal) {
  HEAP32[___async_retval >> 2] = 0; //@line 2486
  return;
 }
 HEAP32[$AsyncRetVal >> 2] = HEAP32[$2 + 28 >> 2]; //@line 2491
 _equeue_event_delay($AsyncRetVal, HEAP32[$2 + 12 >> 2] | 0); //@line 2494
 _equeue_event_period($AsyncRetVal, HEAP32[$2 + 16 >> 2] | 0); //@line 2497
 _equeue_event_dtor($AsyncRetVal, 68); //@line 2498
 $13 = HEAP32[$4 >> 2] | 0; //@line 2499
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 2500
 $14 = _equeue_post($13, 69, $AsyncRetVal) | 0; //@line 2501
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 70; //@line 2504
  sp = STACKTOP; //@line 2505
  return;
 }
 HEAP32[___async_retval >> 2] = $14; //@line 2509
 ___async_unwind = 0; //@line 2510
 HEAP32[$ReallocAsyncCtx >> 2] = 70; //@line 2511
 sp = STACKTOP; //@line 2512
 return;
}
function __ZN4mbed11InterruptInD2Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 57
 HEAP32[$0 >> 2] = 160; //@line 58
 _gpio_irq_free($0 + 28 | 0); //@line 60
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 62
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 68
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 69
   FUNCTION_TABLE_vi[$7 & 127]($0 + 56 | 0); //@line 70
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 11; //@line 73
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 75
    sp = STACKTOP; //@line 76
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 79
    break;
   }
  }
 } while (0);
 $10 = HEAP32[$0 + 52 >> 2] | 0; //@line 85
 if (!$10) {
  return;
 }
 $14 = HEAP32[$10 + 8 >> 2] | 0; //@line 92
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 93
 FUNCTION_TABLE_vi[$14 & 127]($0 + 40 | 0); //@line 94
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 12; //@line 97
  sp = STACKTOP; //@line 98
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 101
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $4 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2496
 $1 = HEAP32[$0 >> 2] | 0; //@line 2497
 if (!$1) {
  return;
 }
 $4 = (HEAP32[$1 >> 2] | 0) + -1 | 0; //@line 2503
 HEAP32[$1 >> 2] = $4; //@line 2504
 if ($4 | 0) {
  return;
 }
 $7 = HEAP32[$1 + 24 >> 2] | 0; //@line 2510
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2511
 FUNCTION_TABLE_vi[$7 & 127]($1); //@line 2512
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 73; //@line 2515
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2517
  sp = STACKTOP; //@line 2518
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2521
 $9 = HEAP32[$0 >> 2] | 0; //@line 2522
 $11 = HEAP32[$9 + 4 >> 2] | 0; //@line 2524
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2525
 _equeue_dealloc($11, $9); //@line 2526
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 74; //@line 2529
  sp = STACKTOP; //@line 2530
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2533
 return;
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2062
 $2 = $0 + 12 | 0; //@line 2064
 $3 = HEAP32[$2 >> 2] | 0; //@line 2065
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2069
   _mbed_assert_internal(1107, 1112, 528); //@line 2070
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 50; //@line 2073
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 2075
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 2077
    sp = STACKTOP; //@line 2078
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2081
    $8 = HEAP32[$2 >> 2] | 0; //@line 2083
    break;
   }
  } else {
   $8 = $3; //@line 2087
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 2090
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2092
 FUNCTION_TABLE_vi[$7 & 127]($0); //@line 2093
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 51; //@line 2096
  sp = STACKTOP; //@line 2097
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2100
  return;
 }
}
function _abort_message($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9869
 STACKTOP = STACKTOP + 16 | 0; //@line 9870
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 9870
 $1 = sp; //@line 9871
 HEAP32[$1 >> 2] = $varargs; //@line 9872
 $2 = HEAP32[45] | 0; //@line 9873
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 9874
 _vfprintf($2, $0, $1) | 0; //@line 9875
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 89; //@line 9878
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 9880
  sp = STACKTOP; //@line 9881
  STACKTOP = sp; //@line 9882
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 9884
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 9885
 _fputc(10, $2) | 0; //@line 9886
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 90; //@line 9889
  sp = STACKTOP; //@line 9890
  STACKTOP = sp; //@line 9891
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 9893
  _abort(); //@line 9894
 }
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
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11472
 STACKTOP = STACKTOP + 16 | 0; //@line 11473
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11473
 $3 = sp; //@line 11474
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 11476
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 11479
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 11480
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 11481
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 113; //@line 11484
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 11486
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 11488
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 11490
  sp = STACKTOP; //@line 11491
  STACKTOP = sp; //@line 11492
  return 0; //@line 11492
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 11494
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 11498
 }
 STACKTOP = sp; //@line 11500
 return $8 & 1 | 0; //@line 11500
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 9331
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 9331
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 9332
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 9333
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 9342
    $$016 = $9; //@line 9345
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 9345
   } else {
    $$016 = $0; //@line 9347
    $storemerge = 0; //@line 9347
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 9349
   $$0 = $$016; //@line 9350
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 9354
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 9360
   HEAP32[tempDoublePtr >> 2] = $2; //@line 9363
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 9363
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 9364
  }
 }
 return +$$0;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11572
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11580
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11582
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 11584
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 11586
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 11588
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 11590
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 11592
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 11603
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 11604
 HEAP32[$10 >> 2] = 0; //@line 11605
 HEAP32[$12 >> 2] = 0; //@line 11606
 HEAP32[$14 >> 2] = 0; //@line 11607
 HEAP32[$2 >> 2] = 0; //@line 11608
 $33 = HEAP32[$16 >> 2] | 0; //@line 11609
 HEAP32[$16 >> 2] = $33 | $18; //@line 11614
 if ($20 | 0) {
  ___unlockfile($22); //@line 11617
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 11620
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2440
 $1 = HEAP32[$0 >> 2] | 0; //@line 2441
 if ($1 | 0) {
  $4 = HEAP32[$1 + 20 >> 2] | 0; //@line 2445
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2446
  $5 = FUNCTION_TABLE_ii[$4 & 3]($1) | 0; //@line 2447
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 71; //@line 2450
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2452
   sp = STACKTOP; //@line 2453
   return;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2456
  HEAP32[(HEAP32[$0 >> 2] | 0) + 8 >> 2] = $5; //@line 2459
  if ($5 | 0) {
   return;
  }
 }
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2465
 _mbed_assert_internal(1301, 1304, 149); //@line 2466
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 72; //@line 2469
  sp = STACKTOP; //@line 2470
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2473
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
 sp = STACKTOP; //@line 10392
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10398
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 10401
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10404
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10405
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 10406
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 95; //@line 10409
    sp = STACKTOP; //@line 10410
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10413
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
 sp = STACKTOP; //@line 11391
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 11393
 $8 = $7 >> 8; //@line 11394
 if (!($7 & 1)) {
  $$0 = $8; //@line 11398
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 11403
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 11405
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 11408
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11413
 FUNCTION_TABLE_viiiiii[$17 & 3]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 11414
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 111; //@line 11417
  sp = STACKTOP; //@line 11418
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11421
  return;
 }
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10561
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 10567
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 10570
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 10573
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10574
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 10575
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 98; //@line 10578
    sp = STACKTOP; //@line 10579
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10582
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
 sp = STACKTOP; //@line 11433
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 11435
 $7 = $6 >> 8; //@line 11436
 if (!($6 & 1)) {
  $$0 = $7; //@line 11440
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 11445
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 11447
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 11450
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11455
 FUNCTION_TABLE_viiiii[$16 & 3]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 11456
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 112; //@line 11459
  sp = STACKTOP; //@line 11460
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11463
  return;
 }
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11348
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 11350
 $6 = $5 >> 8; //@line 11351
 if (!($5 & 1)) {
  $$0 = $6; //@line 11355
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 11360
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 11362
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 11365
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11370
 FUNCTION_TABLE_viiii[$15 & 3]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 11371
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 110; //@line 11374
  sp = STACKTOP; //@line 11375
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11378
  return;
 }
}
function ___dynamic_cast__async_cb_10($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 784
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 786
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 788
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 794
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 809
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 825
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 830
    break;
   }
  default:
   {
    $$0 = 0; //@line 834
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 839
 return;
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 8329
 STACKTOP = STACKTOP + 256 | 0; //@line 8330
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 8330
 $5 = sp; //@line 8331
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 8337
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 8341
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 8344
   $$011 = $9; //@line 8345
   do {
    _out_670($0, $5, 256); //@line 8347
    $$011 = $$011 + -256 | 0; //@line 8348
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 8357
  } else {
   $$0$lcssa = $9; //@line 8359
  }
  _out_670($0, $5, $$0$lcssa); //@line 8361
 }
 STACKTOP = sp; //@line 8363
 return;
}
function __ZN4mbed11InterruptInD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1234
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1236
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 1238
 if (!$4) {
  __ZdlPv($2); //@line 1241
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 1246
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 1247
 FUNCTION_TABLE_vi[$8 & 127]($2 + 40 | 0); //@line 1248
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 14; //@line 1251
  $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 1252
  HEAP32[$9 >> 2] = $2; //@line 1253
  sp = STACKTOP; //@line 1254
  return;
 }
 ___async_unwind = 0; //@line 1257
 HEAP32[$ReallocAsyncCtx2 >> 2] = 14; //@line 1258
 $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 1259
 HEAP32[$9 >> 2] = $2; //@line 1260
 sp = STACKTOP; //@line 1261
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5838
 STACKTOP = STACKTOP + 32 | 0; //@line 5839
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 5839
 $vararg_buffer = sp; //@line 5840
 $3 = sp + 20 | 0; //@line 5841
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 5845
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 5847
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 5849
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 5851
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 5853
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 5858
  $10 = -1; //@line 5859
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 5862
 }
 STACKTOP = sp; //@line 5864
 return $10 | 0; //@line 5864
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
 _mbed_error_printf(869, $vararg_buffer); //@line 1646
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
 $4 = $1 + 16 | 0; //@line 10114
 $5 = HEAP32[$4 >> 2] | 0; //@line 10115
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 10119
   HEAP32[$1 + 24 >> 2] = $3; //@line 10121
   HEAP32[$1 + 36 >> 2] = 1; //@line 10123
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 10127
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 10130
    HEAP32[$1 + 24 >> 2] = 2; //@line 10132
    HEAP8[$1 + 54 >> 0] = 1; //@line 10134
    break;
   }
   $10 = $1 + 24 | 0; //@line 10137
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 10141
   }
  }
 } while (0);
 return;
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 10664
 STACKTOP = STACKTOP + 16 | 0; //@line 10665
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10665
 $vararg_buffer = sp; //@line 10666
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 10667
 FUNCTION_TABLE_v[$0 & 7](); //@line 10668
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 100; //@line 10671
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 10673
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 10675
  sp = STACKTOP; //@line 10676
  STACKTOP = sp; //@line 10677
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 10679
  _abort_message(4236, $vararg_buffer); //@line 10680
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
 $2 = HEAP8[$0 >> 0] | 0; //@line 5945
 $3 = HEAP8[$1 >> 0] | 0; //@line 5946
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 5951
  $$lcssa8 = $2; //@line 5951
 } else {
  $$011 = $1; //@line 5953
  $$0710 = $0; //@line 5953
  do {
   $$0710 = $$0710 + 1 | 0; //@line 5955
   $$011 = $$011 + 1 | 0; //@line 5956
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 5957
   $9 = HEAP8[$$011 >> 0] | 0; //@line 5958
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 5963
  $$lcssa8 = $8; //@line 5963
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 5973
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5897
 STACKTOP = STACKTOP + 32 | 0; //@line 5898
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 5898
 $vararg_buffer = sp; //@line 5899
 HEAP32[$0 + 36 >> 2] = 1; //@line 5902
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 5910
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 5912
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 5914
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 5919
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 5922
 STACKTOP = sp; //@line 5923
 return $14 | 0; //@line 5923
}
function _mbed_die__async_cb_32($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 1651
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1653
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 1655
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 1656
 _wait_ms(150); //@line 1657
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 34; //@line 1660
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 1661
  HEAP32[$4 >> 2] = $2; //@line 1662
  sp = STACKTOP; //@line 1663
  return;
 }
 ___async_unwind = 0; //@line 1666
 HEAP32[$ReallocAsyncCtx15 >> 2] = 34; //@line 1667
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 1668
 HEAP32[$4 >> 2] = $2; //@line 1669
 sp = STACKTOP; //@line 1670
 return;
}
function _mbed_die__async_cb_31($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 1626
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1628
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 1630
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 1631
 _wait_ms(150); //@line 1632
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 35; //@line 1635
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 1636
  HEAP32[$4 >> 2] = $2; //@line 1637
  sp = STACKTOP; //@line 1638
  return;
 }
 ___async_unwind = 0; //@line 1641
 HEAP32[$ReallocAsyncCtx14 >> 2] = 35; //@line 1642
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 1643
 HEAP32[$4 >> 2] = $2; //@line 1644
 sp = STACKTOP; //@line 1645
 return;
}
function _mbed_die__async_cb_30($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 1601
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1603
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 1605
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 1606
 _wait_ms(150); //@line 1607
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 36; //@line 1610
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 1611
  HEAP32[$4 >> 2] = $2; //@line 1612
  sp = STACKTOP; //@line 1613
  return;
 }
 ___async_unwind = 0; //@line 1616
 HEAP32[$ReallocAsyncCtx13 >> 2] = 36; //@line 1617
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 1618
 HEAP32[$4 >> 2] = $2; //@line 1619
 sp = STACKTOP; //@line 1620
 return;
}
function _mbed_die__async_cb_29($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 1576
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1578
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 1580
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 1581
 _wait_ms(150); //@line 1582
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 37; //@line 1585
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 1586
  HEAP32[$4 >> 2] = $2; //@line 1587
  sp = STACKTOP; //@line 1588
  return;
 }
 ___async_unwind = 0; //@line 1591
 HEAP32[$ReallocAsyncCtx12 >> 2] = 37; //@line 1592
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 1593
 HEAP32[$4 >> 2] = $2; //@line 1594
 sp = STACKTOP; //@line 1595
 return;
}
function _mbed_die__async_cb_28($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 1551
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1553
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 1555
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 1556
 _wait_ms(150); //@line 1557
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 38; //@line 1560
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 1561
  HEAP32[$4 >> 2] = $2; //@line 1562
  sp = STACKTOP; //@line 1563
  return;
 }
 ___async_unwind = 0; //@line 1566
 HEAP32[$ReallocAsyncCtx11 >> 2] = 38; //@line 1567
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 1568
 HEAP32[$4 >> 2] = $2; //@line 1569
 sp = STACKTOP; //@line 1570
 return;
}
function _mbed_die__async_cb_27($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 1526
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1528
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 1530
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 1531
 _wait_ms(150); //@line 1532
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 39; //@line 1535
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 1536
  HEAP32[$4 >> 2] = $2; //@line 1537
  sp = STACKTOP; //@line 1538
  return;
 }
 ___async_unwind = 0; //@line 1541
 HEAP32[$ReallocAsyncCtx10 >> 2] = 39; //@line 1542
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 1543
 HEAP32[$4 >> 2] = $2; //@line 1544
 sp = STACKTOP; //@line 1545
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 1276
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1278
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 1280
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 1281
 _wait_ms(150); //@line 1282
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 33; //@line 1285
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 1286
  HEAP32[$4 >> 2] = $2; //@line 1287
  sp = STACKTOP; //@line 1288
  return;
 }
 ___async_unwind = 0; //@line 1291
 HEAP32[$ReallocAsyncCtx16 >> 2] = 33; //@line 1292
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 1293
 HEAP32[$4 >> 2] = $2; //@line 1294
 sp = STACKTOP; //@line 1295
 return;
}
function _mbed_die__async_cb_26($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 1501
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1503
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 1505
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 1506
 _wait_ms(150); //@line 1507
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 40; //@line 1510
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 1511
  HEAP32[$4 >> 2] = $2; //@line 1512
  sp = STACKTOP; //@line 1513
  return;
 }
 ___async_unwind = 0; //@line 1516
 HEAP32[$ReallocAsyncCtx9 >> 2] = 40; //@line 1517
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 1518
 HEAP32[$4 >> 2] = $2; //@line 1519
 sp = STACKTOP; //@line 1520
 return;
}
function _mbed_die__async_cb_25($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 1476
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1478
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 1480
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 1481
 _wait_ms(400); //@line 1482
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 41; //@line 1485
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 1486
  HEAP32[$4 >> 2] = $2; //@line 1487
  sp = STACKTOP; //@line 1488
  return;
 }
 ___async_unwind = 0; //@line 1491
 HEAP32[$ReallocAsyncCtx8 >> 2] = 41; //@line 1492
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 1493
 HEAP32[$4 >> 2] = $2; //@line 1494
 sp = STACKTOP; //@line 1495
 return;
}
function _mbed_die__async_cb_24($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 1451
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1453
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 1455
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 1456
 _wait_ms(400); //@line 1457
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 42; //@line 1460
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 1461
  HEAP32[$4 >> 2] = $2; //@line 1462
  sp = STACKTOP; //@line 1463
  return;
 }
 ___async_unwind = 0; //@line 1466
 HEAP32[$ReallocAsyncCtx7 >> 2] = 42; //@line 1467
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 1468
 HEAP32[$4 >> 2] = $2; //@line 1469
 sp = STACKTOP; //@line 1470
 return;
}
function _mbed_die__async_cb_23($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 1426
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1428
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 1430
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 1431
 _wait_ms(400); //@line 1432
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 43; //@line 1435
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 1436
  HEAP32[$4 >> 2] = $2; //@line 1437
  sp = STACKTOP; //@line 1438
  return;
 }
 ___async_unwind = 0; //@line 1441
 HEAP32[$ReallocAsyncCtx6 >> 2] = 43; //@line 1442
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 1443
 HEAP32[$4 >> 2] = $2; //@line 1444
 sp = STACKTOP; //@line 1445
 return;
}
function _mbed_die__async_cb_22($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 1401
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1403
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 1405
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 1406
 _wait_ms(400); //@line 1407
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 44; //@line 1410
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 1411
  HEAP32[$4 >> 2] = $2; //@line 1412
  sp = STACKTOP; //@line 1413
  return;
 }
 ___async_unwind = 0; //@line 1416
 HEAP32[$ReallocAsyncCtx5 >> 2] = 44; //@line 1417
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 1418
 HEAP32[$4 >> 2] = $2; //@line 1419
 sp = STACKTOP; //@line 1420
 return;
}
function _mbed_die__async_cb_21($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1376
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1378
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 1380
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 1381
 _wait_ms(400); //@line 1382
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 45; //@line 1385
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 1386
  HEAP32[$4 >> 2] = $2; //@line 1387
  sp = STACKTOP; //@line 1388
  return;
 }
 ___async_unwind = 0; //@line 1391
 HEAP32[$ReallocAsyncCtx4 >> 2] = 45; //@line 1392
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 1393
 HEAP32[$4 >> 2] = $2; //@line 1394
 sp = STACKTOP; //@line 1395
 return;
}
function _mbed_die__async_cb_20($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1351
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1353
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 1355
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 1356
 _wait_ms(400); //@line 1357
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 1360
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 1361
  HEAP32[$4 >> 2] = $2; //@line 1362
  sp = STACKTOP; //@line 1363
  return;
 }
 ___async_unwind = 0; //@line 1366
 HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 1367
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 1368
 HEAP32[$4 >> 2] = $2; //@line 1369
 sp = STACKTOP; //@line 1370
 return;
}
function _mbed_die__async_cb_19($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1326
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1328
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 1330
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 1331
 _wait_ms(400); //@line 1332
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 47; //@line 1335
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 1336
  HEAP32[$4 >> 2] = $2; //@line 1337
  sp = STACKTOP; //@line 1338
  return;
 }
 ___async_unwind = 0; //@line 1341
 HEAP32[$ReallocAsyncCtx2 >> 2] = 47; //@line 1342
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 1343
 HEAP32[$4 >> 2] = $2; //@line 1344
 sp = STACKTOP; //@line 1345
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11716
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11720
 HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 8 >> 2] = $AsyncRetVal; //@line 11723
 if ($AsyncRetVal | 0) {
  return;
 }
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 11728
 _mbed_assert_internal(1301, 1304, 149); //@line 11729
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 72; //@line 11732
  sp = STACKTOP; //@line 11733
  return;
 }
 ___async_unwind = 0; //@line 11736
 HEAP32[$ReallocAsyncCtx2 >> 2] = 72; //@line 11737
 sp = STACKTOP; //@line 11738
 return;
}
function _mbed_die__async_cb_18($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1301
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1303
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 1305
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 1306
 _wait_ms(400); //@line 1307
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 48; //@line 1310
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 1311
  HEAP32[$4 >> 2] = $2; //@line 1312
  sp = STACKTOP; //@line 1313
  return;
 }
 ___async_unwind = 0; //@line 1316
 HEAP32[$ReallocAsyncCtx >> 2] = 48; //@line 1317
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 1318
 HEAP32[$4 >> 2] = $2; //@line 1319
 sp = STACKTOP; //@line 1320
 return;
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 3962
 newDynamicTop = oldDynamicTop + increment | 0; //@line 3963
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 3967
  ___setErrNo(12); //@line 3968
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 3972
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 3976
   ___setErrNo(12); //@line 3977
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 3981
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 6068
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 6070
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 6076
  $11 = ___fwritex($0, $4, $3) | 0; //@line 6077
  if ($phitmp) {
   $13 = $11; //@line 6079
  } else {
   ___unlockfile($3); //@line 6081
   $13 = $11; //@line 6082
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 6086
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 6090
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 6093
 }
 return $15 | 0; //@line 6095
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 8190
 } else {
  $$056 = $2; //@line 8192
  $15 = $1; //@line 8192
  $8 = $0; //@line 8192
  while (1) {
   $14 = $$056 + -1 | 0; //@line 8200
   HEAP8[$14 >> 0] = HEAPU8[1899 + ($8 & 15) >> 0] | 0 | $3; //@line 8201
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 8202
   $15 = tempRet0; //@line 8203
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 8208
    break;
   } else {
    $$056 = $14; //@line 8211
   }
  }
 }
 return $$05$lcssa | 0; //@line 8215
}
function __ZSt9terminatev() {
 var $0 = 0, $16 = 0, $17 = 0, $2 = 0, $5 = 0, sp = 0;
 sp = STACKTOP; //@line 10629
 $0 = ___cxa_get_globals_fast() | 0; //@line 10630
 if ($0 | 0) {
  $2 = HEAP32[$0 >> 2] | 0; //@line 10633
  if ($2 | 0) {
   $5 = $2 + 48 | 0; //@line 10637
   if ((HEAP32[$5 >> 2] & -256 | 0) == 1126902528 ? (HEAP32[$5 + 4 >> 2] | 0) == 1129074247 : 0) {
    $16 = HEAP32[$2 + 12 >> 2] | 0; //@line 10649
    _emscripten_alloc_async_context(4, sp) | 0; //@line 10650
    __ZSt11__terminatePFvvE($16); //@line 10651
   }
  }
 }
 $17 = __ZSt13get_terminatev() | 0; //@line 10656
 _emscripten_alloc_async_context(4, sp) | 0; //@line 10657
 __ZSt11__terminatePFvvE($17); //@line 10658
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 6185
 $3 = HEAP8[$1 >> 0] | 0; //@line 6187
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 6191
 $7 = HEAP32[$0 >> 2] | 0; //@line 6192
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 6197
  HEAP32[$0 + 4 >> 2] = 0; //@line 6199
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 6201
  HEAP32[$0 + 28 >> 2] = $14; //@line 6203
  HEAP32[$0 + 20 >> 2] = $14; //@line 6205
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 6211
  $$0 = 0; //@line 6212
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 6215
  $$0 = -1; //@line 6216
 }
 return $$0 | 0; //@line 6218
}
function __ZN4mbed11InterruptInD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 900
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 902
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 904
 if (!$4) {
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 911
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 912
 FUNCTION_TABLE_vi[$8 & 127]($2 + 40 | 0); //@line 913
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 12; //@line 916
  sp = STACKTOP; //@line 917
  return;
 }
 ___async_unwind = 0; //@line 920
 HEAP32[$ReallocAsyncCtx2 >> 2] = 12; //@line 921
 sp = STACKTOP; //@line 922
 return;
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 8227
 } else {
  $$06 = $2; //@line 8229
  $11 = $1; //@line 8229
  $7 = $0; //@line 8229
  while (1) {
   $10 = $$06 + -1 | 0; //@line 8234
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 8235
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 8236
   $11 = tempRet0; //@line 8237
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 8242
    break;
   } else {
    $$06 = $10; //@line 8245
   }
  }
 }
 return $$0$lcssa | 0; //@line 8249
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1676
 $3 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 1679
 $5 = HEAP32[$3 + 4 >> 2] | 0; //@line 1681
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 1682
 _equeue_dealloc($5, $3); //@line 1683
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 74; //@line 1686
  sp = STACKTOP; //@line 1687
  return;
 }
 ___async_unwind = 0; //@line 1690
 HEAP32[$ReallocAsyncCtx2 >> 2] = 74; //@line 1691
 sp = STACKTOP; //@line 1692
 return;
}
function __GLOBAL__sub_I_main_cpp() {
 __ZN6events10EventQueueC2EjPh(4388, 1664, 0); //@line 2133
 HEAP32[1147] = 0; //@line 2134
 HEAP32[1148] = 0; //@line 2134
 HEAP32[1149] = 0; //@line 2134
 HEAP32[1150] = 0; //@line 2134
 HEAP32[1151] = 0; //@line 2134
 HEAP32[1152] = 0; //@line 2134
 _gpio_init_out(4588, 50); //@line 2135
 HEAP32[1153] = 0; //@line 2136
 HEAP32[1154] = 0; //@line 2136
 HEAP32[1155] = 0; //@line 2136
 HEAP32[1156] = 0; //@line 2136
 HEAP32[1157] = 0; //@line 2136
 HEAP32[1158] = 0; //@line 2136
 _gpio_init_out(4612, 52); //@line 2137
 __ZN4mbed11InterruptInC2E7PinName(4636, 1337); //@line 2138
 return;
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11505
 do {
  if (!$0) {
   $3 = 0; //@line 11509
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11511
   $2 = ___dynamic_cast($0, 64, 120, 0) | 0; //@line 11512
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 114; //@line 11515
    sp = STACKTOP; //@line 11516
    return 0; //@line 11517
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 11519
    $3 = ($2 | 0) != 0 & 1; //@line 11522
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 11527
}
function _invoke_ticker__async_cb_1($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11544
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 11550
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 11551
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 11552
 FUNCTION_TABLE_vi[$5 & 127]($6); //@line 11553
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 51; //@line 11556
  sp = STACKTOP; //@line 11557
  return;
 }
 ___async_unwind = 0; //@line 11560
 HEAP32[$ReallocAsyncCtx >> 2] = 51; //@line 11561
 sp = STACKTOP; //@line 11562
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 7871
 } else {
  $$04 = 0; //@line 7873
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 7876
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 7880
   $12 = $7 + 1 | 0; //@line 7881
   HEAP32[$0 >> 2] = $12; //@line 7882
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 7888
    break;
   } else {
    $$04 = $11; //@line 7891
   }
  }
 }
 return $$0$lcssa | 0; //@line 7895
}
function _main__async_cb_48($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 3107
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3109
 $4 = HEAP32[$2 + 4 >> 2] | 0; //@line 3111
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(4) | 0; //@line 3112
 _equeue_dealloc($4, $2); //@line 3113
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 64; //@line 3116
  sp = STACKTOP; //@line 3117
  return;
 }
 ___async_unwind = 0; //@line 3120
 HEAP32[$ReallocAsyncCtx5 >> 2] = 64; //@line 3121
 sp = STACKTOP; //@line 3122
 return;
}
function _main__async_cb_50($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 3136
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3138
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 3139
 $3 = _equeue_alloc(4388, 32) | 0; //@line 3140
 if (!___async) {
  HEAP32[___async_retval >> 2] = $3; //@line 3144
  ___async_unwind = 0; //@line 3145
 }
 HEAP32[$ReallocAsyncCtx7 >> 2] = 59; //@line 3147
 HEAP32[$ReallocAsyncCtx7 + 4 >> 2] = $2; //@line 3149
 sp = STACKTOP; //@line 3150
 return;
}
function ___fflush_unlocked__async_cb_16($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1214
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1216
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1218
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1220
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 1222
 HEAP32[$4 >> 2] = 0; //@line 1223
 HEAP32[$6 >> 2] = 0; //@line 1224
 HEAP32[$8 >> 2] = 0; //@line 1225
 HEAP32[$10 >> 2] = 0; //@line 1226
 HEAP32[___async_retval >> 2] = 0; //@line 1228
 return;
}
function __Z9blink_ledv() {
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2143
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2144
 _puts(1196) | 0; //@line 2145
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 53; //@line 2148
  sp = STACKTOP; //@line 2149
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2152
  $2 = (_emscripten_asm_const_ii(6, HEAP32[1147] | 0) | 0) == 0 & 1; //@line 2156
  _emscripten_asm_const_iii(0, HEAP32[1147] | 0, $2 | 0) | 0; //@line 2158
  return;
 }
}
function __Z8btn_fallv() {
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2164
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2165
 _puts(1284) | 0; //@line 2166
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 54; //@line 2169
  sp = STACKTOP; //@line 2170
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2173
  $2 = (_emscripten_asm_const_ii(6, HEAP32[1153] | 0) | 0) == 0 & 1; //@line 2177
  _emscripten_asm_const_iii(0, HEAP32[1153] | 0, $2 | 0) | 0; //@line 2179
  return;
 }
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
 sp = STACKTOP; //@line 2545
 $1 = HEAP32[$0 >> 2] | 0; //@line 2546
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2547
 FUNCTION_TABLE_v[$1 & 7](); //@line 2548
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 75; //@line 2551
  sp = STACKTOP; //@line 2552
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2555
  return;
 }
}
function _emscripten_async_resume() {
 ___async = 0; //@line 3805
 ___async_unwind = 1; //@line 3806
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 3812
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 3816
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 3820
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 3822
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5708
 STACKTOP = STACKTOP + 16 | 0; //@line 5709
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 5709
 $vararg_buffer = sp; //@line 5710
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 5714
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 5716
 STACKTOP = sp; //@line 5717
 return $5 | 0; //@line 5717
}
function _main__async_cb_51($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3156
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 3157
 __ZN6events10EventQueue8dispatchEi(4388, -1); //@line 3158
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 65; //@line 3161
  sp = STACKTOP; //@line 3162
  return;
 }
 ___async_unwind = 0; //@line 3165
 HEAP32[$ReallocAsyncCtx3 >> 2] = 65; //@line 3166
 sp = STACKTOP; //@line 3167
 return;
}
function __ZN6events10EventQueue13function_callIPFvvEEEvPv($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2369
 $1 = HEAP32[$0 >> 2] | 0; //@line 2370
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2371
 FUNCTION_TABLE_v[$1 & 7](); //@line 2372
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 66; //@line 2375
  sp = STACKTOP; //@line 2376
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2379
  return;
 }
}
function _handle_interrupt_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2003
 $2 = HEAP32[1096] | 0; //@line 2004
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2005
 FUNCTION_TABLE_vii[$2 & 3]($0, $1); //@line 2006
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 49; //@line 2009
  sp = STACKTOP; //@line 2010
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2013
  return;
 }
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 3747
 STACKTOP = STACKTOP + 16 | 0; //@line 3748
 $rem = __stackBase__ | 0; //@line 3749
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 3750
 STACKTOP = __stackBase__; //@line 3751
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 3752
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 3517
 if ((ret | 0) < 8) return ret | 0; //@line 3518
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 3519
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 3520
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 3521
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 3522
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 3523
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10018
 }
 return;
}
function ___cxa_get_globals_fast() {
 var $3 = 0, sp = 0;
 sp = STACKTOP; //@line 9850
 STACKTOP = STACKTOP + 16 | 0; //@line 9851
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 9851
 if (!(_pthread_once(5284, 4) | 0)) {
  $3 = _pthread_getspecific(HEAP32[1322] | 0) | 0; //@line 9857
  STACKTOP = sp; //@line 9858
  return $3 | 0; //@line 9858
 } else {
  _abort_message(4084, sp); //@line 9860
 }
 return 0; //@line 9863
}
function __ZL25default_terminate_handlerv__async_cb_34($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1753
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1755
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1757
 HEAP32[$2 >> 2] = 3945; //@line 1758
 HEAP32[$2 + 4 >> 2] = $4; //@line 1760
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 1762
 _abort_message(3809, $2); //@line 1763
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
  $$0 = -1; //@line 2026
  return $$0 | 0; //@line 2027
 }
 HEAP32[1096] = $2; //@line 2029
 HEAP32[$0 >> 2] = $1; //@line 2030
 HEAP32[$0 + 4 >> 2] = $1; //@line 2032
 _emscripten_asm_const_iii(3, $3 | 0, $1 | 0) | 0; //@line 2033
 $$0 = 0; //@line 2034
 return $$0 | 0; //@line 2035
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 863
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 865
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 866
 _fputc(10, $2) | 0; //@line 867
 if (!___async) {
  ___async_unwind = 0; //@line 870
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 90; //@line 872
 sp = STACKTOP; //@line 873
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11628
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 11639
  $$0 = 1; //@line 11640
 } else {
  $$0 = 0; //@line 11642
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 11646
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 10612
 STACKTOP = STACKTOP + 16 | 0; //@line 10613
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10613
 _free($0); //@line 10615
 if (!(_pthread_setspecific(HEAP32[1322] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 10620
  return;
 } else {
  _abort_message(4183, sp); //@line 10622
 }
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 10094
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
 sp = STACKTOP; //@line 2117
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2118
 _emscripten_sleep($0 | 0); //@line 2119
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 52; //@line 2122
  sp = STACKTOP; //@line 2123
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2126
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
  $7 = $1 + 28 | 0; //@line 10158
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 10162
  }
 }
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var sp = 0;
 sp = STACKTOP; //@line 10597
 STACKTOP = STACKTOP + 16 | 0; //@line 10598
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10598
 if (!(_pthread_key_create(5288, 99) | 0)) {
  STACKTOP = sp; //@line 10603
  return;
 } else {
  _abort_message(4133, sp); //@line 10605
 }
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 3781
 HEAP32[new_frame + 4 >> 2] = sp; //@line 3783
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 3785
 ___async_cur_frame = new_frame; //@line 3786
 return ___async_cur_frame + 8 | 0; //@line 3787
}
function __ZN4mbed8CallbackIFvvEE13function_moveIN6events5EventIS1_EEEEvPvPKv($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 HEAP32[$0 >> 2] = 0; //@line 2481
 $2 = HEAP32[$1 >> 2] | 0; //@line 2482
 if (!$2) {
  return;
 }
 HEAP32[$0 >> 2] = $2; //@line 2487
 HEAP32[$2 >> 2] = (HEAP32[$2 >> 2] | 0) + 1; //@line 2490
 return;
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 723
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 727
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 730
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 3770
  return low << bits; //@line 3771
 }
 tempRet0 = low << bits - 32; //@line 3773
 return 0; //@line 3774
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 3759
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 3760
 }
 tempRet0 = 0; //@line 3762
 return high >>> bits - 32 | 0; //@line 3763
}
function _equeue_dispatch__async_cb_6($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13018
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13020
 HEAP8[HEAP32[$0 + 4 >> 2] >> 0] = 1; //@line 13021
 _equeue_mutex_unlock($4); //@line 13022
 HEAP8[$6 >> 0] = 0; //@line 13023
 return;
}
function _fflush__async_cb_44($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2608
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 2610
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 2613
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_39($0) {
 $0 = $0 | 0;
 var $6 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2344
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 2346
 _gpio_irq_set($6 + 28 | 0, 2, 1); //@line 2348
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
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 1123
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 1126
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 1129
 return;
}
function _equeue_post__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 890
 _equeue_sema_signal((HEAP32[$0 + 4 >> 2] | 0) + 48 | 0); //@line 892
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 894
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 3484
 } else {
  $$0 = -1; //@line 3486
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 3489
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 6315
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 6321
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 6325
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 4037
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 3793
 stackRestore(___async_cur_frame | 0); //@line 3794
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 3795
}
function _fputc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 740
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 741
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 743
 return;
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 1989
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 1995
 _emscripten_asm_const_iii(2, $0 | 0, $1 | 0) | 0; //@line 1996
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 9312
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 9312
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 9314
 return $1 | 0; //@line 9315
}
function _gpio_init_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 1974
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 1980
 _emscripten_asm_const_iii(1, $0 | 0, $1 | 0) | 0; //@line 1981
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
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 5874
  $$0 = -1; //@line 5875
 } else {
  $$0 = $0; //@line 5877
 }
 return $$0 | 0; //@line 5879
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 3510
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 3511
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 3512
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 3502
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 3504
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 4030
}
function _equeue_enqueue__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1139
 _equeue_mutex_unlock(HEAP32[$0 + 4 >> 2] | 0); //@line 1140
 HEAP32[___async_retval >> 2] = $4; //@line 1142
 return;
}
function __Z9blink_ledv__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(6, HEAP32[1147] | 0) | 0) == 0 & 1; //@line 2704
 _emscripten_asm_const_iii(0, HEAP32[1147] | 0, $3 | 0) | 0; //@line 2706
 return;
}
function __Z8btn_fallv__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(6, HEAP32[1153] | 0) | 0) == 0 & 1; //@line 3389
 _emscripten_asm_const_iii(0, HEAP32[1153] | 0, $3 | 0) | 0; //@line 3391
 return;
}
function ___clang_call_terminate($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 48
 ___cxa_begin_catch($0 | 0) | 0; //@line 49
 _emscripten_alloc_async_context(4, sp) | 0; //@line 50
 __ZSt9terminatev(); //@line 51
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 4023
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 8372
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 8375
 }
 return $$0 | 0; //@line 8377
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 3995
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 3739
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 6055
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 6059
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 770
 return;
}
function __ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 2469
 return;
}
function _gpio_irq_set($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 _emscripten_asm_const_iiii(5, HEAP32[$0 + 4 >> 2] | 0, $1 | 0, $2 | 0) | 0; //@line 2056
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 3800
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 3801
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_42($0) {
 $0 = $0 | 0;
 _gpio_irq_set((HEAP32[$0 + 8 >> 2] | 0) + 28 | 0, 2, 0); //@line 2459
 return;
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 10697
 __ZdlPv($0); //@line 10698
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 10380
 __ZdlPv($0); //@line 10381
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 6451
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 6453
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 9908
 __ZdlPv($0); //@line 9909
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
  ___fwritex($1, $2, $0) | 0; //@line 7857
 }
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 3469
 return;
}
function b36(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 4125
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 10105
}
function __ZSt13get_terminatev() {
 var $0 = 0;
 $0 = HEAP32[171] | 0; //@line 10687
 HEAP32[171] = $0 + 0; //@line 10689
 return $0 | 0; //@line 10691
}
function _gpio_irq_free($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iii(4, HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 2045
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
 FUNCTION_TABLE_vii[index & 3](a1 | 0, a2 | 0); //@line 4016
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
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 3827
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_14($0) {
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
function b34(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 4122
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 8320
}
function _fflush__async_cb_45($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 2623
 return;
}
function _fputc__async_cb_9($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 753
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 3](a1 | 0) | 0; //@line 3988
}
function __ZN4mbed11InterruptInD0Ev__async_cb_17($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 1270
 return;
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(4236, HEAP32[$0 + 4 >> 2] | 0); //@line 11704
}
function b7(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 4056
 return 0; //@line 4056
}
function b6(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 4053
 return 0; //@line 4053
}
function b5(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(5); //@line 4050
 return 0; //@line 4050
}
function b4(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 4047
 return 0; //@line 4047
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 127](a1 | 0); //@line 4009
}
function b32(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 4119
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
function __ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb_33($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb_3($0) {
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
 return ___lctrans_impl($0, $1) | 0; //@line 9565
}
function _equeue_mutex_create($0) {
 $0 = $0 | 0;
 return _pthread_mutex_init($0 | 0, 0) | 0; //@line 1538
}
function _main__async_cb_49($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 3130
 return;
}
function __ZN6events10EventQueue13function_dtorINS0_9context00IPFvvEEEEEvPv($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_4($0) {
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
 FUNCTION_TABLE_v[index & 7](); //@line 4002
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 return;
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 5932
}
function __ZN6events10EventQueue13function_dtorIPFvvEEEvPv($0) {
 $0 = $0 | 0;
 return;
}
function b2(p0) {
 p0 = p0 | 0;
 nullFunc_ii(3); //@line 4044
 return 0; //@line 4044
}
function b1(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 4041
 return 0; //@line 4041
}
function __ZN6events10EventQueue8dispatchEi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b30(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(3); //@line 4116
}
function b29(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(0); //@line 4113
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
 ___lock(5272); //@line 6458
 return 5280; //@line 6459
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
function _abort_message__async_cb_11($0) {
 $0 = $0 | 0;
 _abort(); //@line 880
}
function __ZN4mbed11InterruptInD2Ev__async_cb_12($0) {
 $0 = $0 | 0;
 return;
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 9486
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 9492
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 16
}
function _pthread_mutex_unlock(x) {
 x = x | 0;
 return 0; //@line 3954
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 9734
 return;
}
function _pthread_mutex_lock(x) {
 x = x | 0;
 return 0; //@line 3950
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
 ___unlock(5272); //@line 6464
 return;
}
function b27(p0) {
 p0 = p0 | 0;
 nullFunc_vi(127); //@line 4110
}
function b26(p0) {
 p0 = p0 | 0;
 nullFunc_vi(126); //@line 4107
}
function b25(p0) {
 p0 = p0 | 0;
 nullFunc_vi(125); //@line 4104
}
function b24(p0) {
 p0 = p0 | 0;
 nullFunc_vi(124); //@line 4101
}
function b23(p0) {
 p0 = p0 | 0;
 nullFunc_vi(123); //@line 4098
}
function b22(p0) {
 p0 = p0 | 0;
 nullFunc_vi(122); //@line 4095
}
function b21(p0) {
 p0 = p0 | 0;
 nullFunc_vi(121); //@line 4092
}
function b20(p0) {
 p0 = p0 | 0;
 nullFunc_vi(120); //@line 4089
}
function b19(p0) {
 p0 = p0 | 0;
 nullFunc_vi(119); //@line 4086
}
function b18(p0) {
 p0 = p0 | 0;
 nullFunc_vi(118); //@line 4083
}
function b17(p0) {
 p0 = p0 | 0;
 nullFunc_vi(117); //@line 4080
}
function b16(p0) {
 p0 = p0 | 0;
 nullFunc_vi(116); //@line 4077
}
function b15(p0) {
 p0 = p0 | 0;
 nullFunc_vi(115); //@line 4074
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 5890
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 6107
}
function b14(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 4071
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___clang_call_terminate__async_cb($0) {
 $0 = $0 | 0;
}
function __ZSt9terminatev__async_cb_15($0) {
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
 return 5268; //@line 5884
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
 return 440; //@line 5937
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 26
}
function b12() {
 nullFunc_v(7); //@line 4068
}
function b11() {
 nullFunc_v(6); //@line 4065
}
function b10() {
 nullFunc_v(5); //@line 4062
}
function b9() {
 nullFunc_v(0); //@line 4059
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_ii = [b1,___stdio_close,__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE,b2];
var FUNCTION_TABLE_iiii = [b4,___stdio_write,___stdio_seek,___stdout_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b5,b6,b7];
var FUNCTION_TABLE_v = [b9,__ZL25default_terminate_handlerv,__Z9blink_ledv,__Z8btn_fallv,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev,b10,b11,b12];
var FUNCTION_TABLE_vi = [b14,__ZN4mbed11InterruptInD2Ev,__ZN4mbed11InterruptInD0Ev,__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv,__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed11InterruptInD2Ev__async_cb,__ZN4mbed11InterruptInD2Ev__async_cb_12,__ZN4mbed11InterruptInD0Ev__async_cb,__ZN4mbed11InterruptInD0Ev__async_cb_17,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_4,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_39,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_40,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_41,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_42,__ZN6events10EventQueue8dispatchEi__async_cb,_equeue_alloc__async_cb,_equeue_dealloc__async_cb,_equeue_post__async_cb,_equeue_enqueue__async_cb,_equeue_dispatch__async_cb,_equeue_dispatch__async_cb_7
,_equeue_dispatch__async_cb_5,_equeue_dispatch__async_cb_6,_equeue_dispatch__async_cb_8,_mbed_assert_internal__async_cb,_mbed_die__async_cb_32,_mbed_die__async_cb_31,_mbed_die__async_cb_30,_mbed_die__async_cb_29,_mbed_die__async_cb_28,_mbed_die__async_cb_27,_mbed_die__async_cb_26,_mbed_die__async_cb_25,_mbed_die__async_cb_24,_mbed_die__async_cb_23,_mbed_die__async_cb_22,_mbed_die__async_cb_21,_mbed_die__async_cb_20,_mbed_die__async_cb_19,_mbed_die__async_cb_18,_mbed_die__async_cb,_handle_interrupt_in__async_cb,_invoke_ticker__async_cb_1,_invoke_ticker__async_cb,_wait_ms__async_cb,__Z9blink_ledv__async_cb,__Z8btn_fallv__async_cb,_main__async_cb_54,__ZN6events10EventQueue13function_dtorIPFvvEEEvPv,__ZN6events10EventQueue13function_callIPFvvEEEvPv,_main__async_cb_50
,_main__async_cb_53,__ZN6events5EventIFvvEE10event_dtorIPS1_EEvPNS2_5eventE,_main__async_cb_52,_main__async_cb,_main__async_cb_48,_main__async_cb_51,_main__async_cb_49,__ZN6events10EventQueue13function_callIPFvvEEEvPv__async_cb,__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb_43,__ZN6events10EventQueue13function_dtorINS0_9context00IPFvvEEEEEvPv,__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv,__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb,__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb,__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb_3,__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb,__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb_33,__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv__async_cb,___overflow__async_cb,_fflush__async_cb_45,_fflush__async_cb_44,_fflush__async_cb_46,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_16,_vfprintf__async_cb,_fputc__async_cb_9,_fputc__async_cb,_puts__async_cb,__ZL25default_terminate_handlerv__async_cb,__ZL25default_terminate_handlerv__async_cb_34
,_abort_message__async_cb,_abort_message__async_cb_11,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_2,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_10,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_14,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_47,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_38,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_37,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_36,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_35,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_13,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b15,b16,b17,b18
,b19,b20,b21,b22,b23,b24,b25,b26,b27];
var FUNCTION_TABLE_vii = [b29,__ZN4mbed8CallbackIFvvEE13function_moveIN6events5EventIS1_EEEEvPvPKv,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event,b30];
var FUNCTION_TABLE_viiii = [b32,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi];
var FUNCTION_TABLE_viiiii = [b34,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib];
var FUNCTION_TABLE_viiiiii = [b36,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib];

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
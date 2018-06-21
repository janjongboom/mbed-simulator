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

function _emscripten_asm_const_i(code) {
  return ASM_CONSTS[code]();
}

function _emscripten_asm_const_ii(code, a0) {
  return ASM_CONSTS[code](a0);
}




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 6912;
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



var debug_table_i = ["0"];
var debug_table_ii = ["0", "___stdio_close", "__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE", "0"];
var debug_table_iiii = ["0", "___stdio_write", "___stdio_seek", "___stdout_write", "_sn_write", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv", "0", "0"];
var debug_table_v = ["0", "__ZL25default_terminate_handlerv", "__Z9blink_ledv", "__Z8btn_fallv", "__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev", "0", "0", "0"];
var debug_table_vi = ["0", "__ZN4mbed11InterruptInD2Ev", "__ZN4mbed11InterruptInD0Ev", "_mbed_trace_default_print", "__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv", "__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "__ZN10__cxxabiv121__vmi_class_type_infoD0Ev", "__ZN4mbed11InterruptInD2Ev__async_cb", "__ZN4mbed11InterruptInD2Ev__async_cb_57", "__ZN4mbed11InterruptInD0Ev__async_cb", "__ZN4mbed11InterruptInD0Ev__async_cb_43", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_1", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_64", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_65", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_66", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_67", "__ZN6events10EventQueue8dispatchEi__async_cb", "_equeue_alloc__async_cb", "_equeue_dealloc__async_cb", "_equeue_post__async_cb", "_equeue_enqueue__async_cb", "_equeue_dispatch__async_cb", "_equeue_dispatch__async_cb_60", "_equeue_dispatch__async_cb_58", "_equeue_dispatch__async_cb_59", "_equeue_dispatch__async_cb_61", "_mbed_trace_default_print__async_cb", "_mbed_tracef__async_cb", "_mbed_vtracef__async_cb", "_mbed_vtracef__async_cb_56", "_mbed_vtracef__async_cb_46", "_mbed_vtracef__async_cb_47", "_mbed_vtracef__async_cb_48", "_mbed_vtracef__async_cb_55", "_mbed_vtracef__async_cb_49", "_mbed_vtracef__async_cb_54", "_mbed_vtracef__async_cb_50", "_mbed_vtracef__async_cb_51", "_mbed_vtracef__async_cb_52", "_mbed_vtracef__async_cb_53", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_17", "_mbed_die__async_cb_16", "_mbed_die__async_cb_15", "_mbed_die__async_cb_14", "_mbed_die__async_cb_13", "_mbed_die__async_cb_12", "_mbed_die__async_cb_11", "_mbed_die__async_cb_10", "_mbed_die__async_cb_9", "_mbed_die__async_cb_8", "_mbed_die__async_cb_7", "_mbed_die__async_cb_6", "_mbed_die__async_cb_5", "_mbed_die__async_cb_4", "_mbed_die__async_cb_3", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_vfprintf__async_cb", "_mbed_error_vfprintf__async_cb_37", "_mbed_error_vfprintf__async_cb_36", "_handle_interrupt_in__async_cb", "_serial_putc__async_cb_20", "_serial_putc__async_cb", "_invoke_ticker__async_cb_45", "_invoke_ticker__async_cb", "_wait_ms__async_cb", "__Z9blink_ledv__async_cb", "__Z8btn_fallv__async_cb", "_main__async_cb_27", "__ZN6events10EventQueue13function_dtorIPFvvEEEvPv", "__ZN6events10EventQueue13function_callIPFvvEEEvPv", "_main__async_cb_23", "_main__async_cb_26", "__ZN6events5EventIFvvEE10event_dtorIPS1_EEvPNS2_5eventE", "_main__async_cb_25", "_main__async_cb", "_main__async_cb_21", "_main__async_cb_24", "_main__async_cb_22", "__ZN6events10EventQueue13function_callIPFvvEEEvPv__async_cb", "__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb_62", "__ZN6events10EventQueue13function_dtorINS0_9context00IPFvvEEEEEvPv", "__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv", "__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb", "__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb", "__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb_69", "__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb", "__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb_34", "__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv__async_cb", "_putc__async_cb_28", "_putc__async_cb", "___overflow__async_cb", "_fflush__async_cb_39", "_fflush__async_cb_38", "_fflush__async_cb_40", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_44", "_vfprintf__async_cb", "_snprintf__async_cb", "_vsnprintf__async_cb", "_fputc__async_cb_33", "_fputc__async_cb", "_puts__async_cb", "__ZL25default_terminate_handlerv__async_cb", "__ZL25default_terminate_handlerv__async_cb_63", "_abort_message__async_cb", "_abort_message__async_cb_68", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_19", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_2", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_41", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv", "__ZSt11__terminatePFvvE__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_18", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_32", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_31", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_30", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_29", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_35", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
var debug_table_vii = ["0", "__ZN4mbed8CallbackIFvvEE13function_moveIN6events5EventIS1_EEEEvPvPKv", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event", "0"];
var debug_table_viiii = ["0", "__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi"];
var debug_table_viiiii = ["0", "__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib"];
var debug_table_viiiiii = ["0", "__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib"];
function nullFunc_i(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'i'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  vii: " + debug_table_vii[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  "); abort(x) }

function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: i: " + debug_table_i[x] + "  iiii: " + debug_table_iiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  "); abort(x) }

function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  viiii: " + debug_table_viiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  "); abort(x) }

function nullFunc_v(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  vii: " + debug_table_vii[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  i: " + debug_table_i[x] + "  ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: v: " + debug_table_v[x] + "  vii: " + debug_table_vii[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  i: " + debug_table_i[x] + "  ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_vii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'vii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_viiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  "); abort(x) }

function nullFunc_viiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viiii: " + debug_table_viiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  "); abort(x) }

function nullFunc_viiiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  "); abort(x) }

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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_i": nullFunc_i, "nullFunc_ii": nullFunc_ii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_v": nullFunc_v, "nullFunc_vi": nullFunc_vi, "nullFunc_vii": nullFunc_vii, "nullFunc_viiii": nullFunc_viiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "invoke_i": invoke_i, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "___cxa_begin_catch": ___cxa_begin_catch, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "___gxx_personality_v0": ___gxx_personality_v0, "___lock": ___lock, "___resumeException": ___resumeException, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___unlock": ___unlock, "_abort": _abort, "_emscripten_asm_const_i": _emscripten_asm_const_i, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_asm_const_iiii": _emscripten_asm_const_iiii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "_gettimeofday": _gettimeofday, "_pthread_cond_init": _pthread_cond_init, "_pthread_cond_signal": _pthread_cond_signal, "_pthread_cond_timedwait": _pthread_cond_timedwait, "_pthread_cond_wait": _pthread_cond_wait, "_pthread_getspecific": _pthread_getspecific, "_pthread_key_create": _pthread_key_create, "_pthread_mutex_init": _pthread_mutex_init, "_pthread_once": _pthread_once, "_pthread_setspecific": _pthread_setspecific, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
  var nullFunc_vii=env.nullFunc_vii;
  var nullFunc_viiii=env.nullFunc_viiii;
  var nullFunc_viiiii=env.nullFunc_viiiii;
  var nullFunc_viiiiii=env.nullFunc_viiiiii;
  var invoke_i=env.invoke_i;
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
  var _emscripten_asm_const_i=env._emscripten_asm_const_i;
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
 sp = STACKTOP; //@line 3610
 STACKTOP = STACKTOP + 16 | 0; //@line 3611
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3611
 $1 = sp; //@line 3612
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 3619
   $7 = $6 >>> 3; //@line 3620
   $8 = HEAP32[1321] | 0; //@line 3621
   $9 = $8 >>> $7; //@line 3622
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 3628
    $16 = 5324 + ($14 << 1 << 2) | 0; //@line 3630
    $17 = $16 + 8 | 0; //@line 3631
    $18 = HEAP32[$17 >> 2] | 0; //@line 3632
    $19 = $18 + 8 | 0; //@line 3633
    $20 = HEAP32[$19 >> 2] | 0; //@line 3634
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1321] = $8 & ~(1 << $14); //@line 3641
     } else {
      if ((HEAP32[1325] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 3646
      }
      $27 = $20 + 12 | 0; //@line 3649
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 3653
       HEAP32[$17 >> 2] = $20; //@line 3654
       break;
      } else {
       _abort(); //@line 3657
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 3662
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 3665
    $34 = $18 + $30 + 4 | 0; //@line 3667
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 3670
    $$0 = $19; //@line 3671
    STACKTOP = sp; //@line 3672
    return $$0 | 0; //@line 3672
   }
   $37 = HEAP32[1323] | 0; //@line 3674
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 3680
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 3683
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 3686
     $49 = $47 >>> 12 & 16; //@line 3688
     $50 = $47 >>> $49; //@line 3689
     $52 = $50 >>> 5 & 8; //@line 3691
     $54 = $50 >>> $52; //@line 3693
     $56 = $54 >>> 2 & 4; //@line 3695
     $58 = $54 >>> $56; //@line 3697
     $60 = $58 >>> 1 & 2; //@line 3699
     $62 = $58 >>> $60; //@line 3701
     $64 = $62 >>> 1 & 1; //@line 3703
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 3706
     $69 = 5324 + ($67 << 1 << 2) | 0; //@line 3708
     $70 = $69 + 8 | 0; //@line 3709
     $71 = HEAP32[$70 >> 2] | 0; //@line 3710
     $72 = $71 + 8 | 0; //@line 3711
     $73 = HEAP32[$72 >> 2] | 0; //@line 3712
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 3718
       HEAP32[1321] = $77; //@line 3719
       $98 = $77; //@line 3720
      } else {
       if ((HEAP32[1325] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 3725
       }
       $80 = $73 + 12 | 0; //@line 3728
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 3732
        HEAP32[$70 >> 2] = $73; //@line 3733
        $98 = $8; //@line 3734
        break;
       } else {
        _abort(); //@line 3737
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 3742
     $84 = $83 - $6 | 0; //@line 3743
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 3746
     $87 = $71 + $6 | 0; //@line 3747
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 3750
     HEAP32[$71 + $83 >> 2] = $84; //@line 3752
     if ($37 | 0) {
      $92 = HEAP32[1326] | 0; //@line 3755
      $93 = $37 >>> 3; //@line 3756
      $95 = 5324 + ($93 << 1 << 2) | 0; //@line 3758
      $96 = 1 << $93; //@line 3759
      if (!($98 & $96)) {
       HEAP32[1321] = $98 | $96; //@line 3764
       $$0199 = $95; //@line 3766
       $$pre$phiZ2D = $95 + 8 | 0; //@line 3766
      } else {
       $101 = $95 + 8 | 0; //@line 3768
       $102 = HEAP32[$101 >> 2] | 0; //@line 3769
       if ((HEAP32[1325] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 3773
       } else {
        $$0199 = $102; //@line 3776
        $$pre$phiZ2D = $101; //@line 3776
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 3779
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 3781
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 3783
      HEAP32[$92 + 12 >> 2] = $95; //@line 3785
     }
     HEAP32[1323] = $84; //@line 3787
     HEAP32[1326] = $87; //@line 3788
     $$0 = $72; //@line 3789
     STACKTOP = sp; //@line 3790
     return $$0 | 0; //@line 3790
    }
    $108 = HEAP32[1322] | 0; //@line 3792
    if (!$108) {
     $$0197 = $6; //@line 3795
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 3799
     $114 = $112 >>> 12 & 16; //@line 3801
     $115 = $112 >>> $114; //@line 3802
     $117 = $115 >>> 5 & 8; //@line 3804
     $119 = $115 >>> $117; //@line 3806
     $121 = $119 >>> 2 & 4; //@line 3808
     $123 = $119 >>> $121; //@line 3810
     $125 = $123 >>> 1 & 2; //@line 3812
     $127 = $123 >>> $125; //@line 3814
     $129 = $127 >>> 1 & 1; //@line 3816
     $134 = HEAP32[5588 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 3821
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 3825
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 3831
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 3834
      $$0193$lcssa$i = $138; //@line 3834
     } else {
      $$01926$i = $134; //@line 3836
      $$01935$i = $138; //@line 3836
      $146 = $143; //@line 3836
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 3841
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 3842
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 3843
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 3844
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 3850
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 3853
        $$0193$lcssa$i = $$$0193$i; //@line 3853
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 3856
        $$01935$i = $$$0193$i; //@line 3856
       }
      }
     }
     $157 = HEAP32[1325] | 0; //@line 3860
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 3863
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 3866
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 3869
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 3873
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 3875
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 3879
       $176 = HEAP32[$175 >> 2] | 0; //@line 3880
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 3883
        $179 = HEAP32[$178 >> 2] | 0; //@line 3884
        if (!$179) {
         $$3$i = 0; //@line 3887
         break;
        } else {
         $$1196$i = $179; //@line 3890
         $$1198$i = $178; //@line 3890
        }
       } else {
        $$1196$i = $176; //@line 3893
        $$1198$i = $175; //@line 3893
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 3896
        $182 = HEAP32[$181 >> 2] | 0; //@line 3897
        if ($182 | 0) {
         $$1196$i = $182; //@line 3900
         $$1198$i = $181; //@line 3900
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 3903
        $185 = HEAP32[$184 >> 2] | 0; //@line 3904
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 3909
         $$1198$i = $184; //@line 3909
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 3914
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 3917
        $$3$i = $$1196$i; //@line 3918
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 3923
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 3926
       }
       $169 = $167 + 12 | 0; //@line 3929
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 3933
       }
       $172 = $164 + 8 | 0; //@line 3936
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 3940
        HEAP32[$172 >> 2] = $167; //@line 3941
        $$3$i = $164; //@line 3942
        break;
       } else {
        _abort(); //@line 3945
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 3954
       $191 = 5588 + ($190 << 2) | 0; //@line 3955
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 3960
         if (!$$3$i) {
          HEAP32[1322] = $108 & ~(1 << $190); //@line 3966
          break L73;
         }
        } else {
         if ((HEAP32[1325] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 3973
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 3981
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1325] | 0; //@line 3991
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 3994
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 3998
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 4000
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 4006
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 4010
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 4012
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 4018
       if ($214 | 0) {
        if ((HEAP32[1325] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 4024
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 4028
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 4030
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 4038
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 4041
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 4043
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 4046
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 4050
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 4053
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 4055
      if ($37 | 0) {
       $234 = HEAP32[1326] | 0; //@line 4058
       $235 = $37 >>> 3; //@line 4059
       $237 = 5324 + ($235 << 1 << 2) | 0; //@line 4061
       $238 = 1 << $235; //@line 4062
       if (!($8 & $238)) {
        HEAP32[1321] = $8 | $238; //@line 4067
        $$0189$i = $237; //@line 4069
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 4069
       } else {
        $242 = $237 + 8 | 0; //@line 4071
        $243 = HEAP32[$242 >> 2] | 0; //@line 4072
        if ((HEAP32[1325] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 4076
        } else {
         $$0189$i = $243; //@line 4079
         $$pre$phi$iZ2D = $242; //@line 4079
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 4082
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 4084
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 4086
       HEAP32[$234 + 12 >> 2] = $237; //@line 4088
      }
      HEAP32[1323] = $$0193$lcssa$i; //@line 4090
      HEAP32[1326] = $159; //@line 4091
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 4094
     STACKTOP = sp; //@line 4095
     return $$0 | 0; //@line 4095
    }
   } else {
    $$0197 = $6; //@line 4098
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 4103
   } else {
    $251 = $0 + 11 | 0; //@line 4105
    $252 = $251 & -8; //@line 4106
    $253 = HEAP32[1322] | 0; //@line 4107
    if (!$253) {
     $$0197 = $252; //@line 4110
    } else {
     $255 = 0 - $252 | 0; //@line 4112
     $256 = $251 >>> 8; //@line 4113
     if (!$256) {
      $$0358$i = 0; //@line 4116
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 4120
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 4124
       $262 = $256 << $261; //@line 4125
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 4128
       $267 = $262 << $265; //@line 4130
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 4133
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 4138
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 4144
      }
     }
     $282 = HEAP32[5588 + ($$0358$i << 2) >> 2] | 0; //@line 4148
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 4152
       $$3$i203 = 0; //@line 4152
       $$3350$i = $255; //@line 4152
       label = 81; //@line 4153
      } else {
       $$0342$i = 0; //@line 4160
       $$0347$i = $255; //@line 4160
       $$0353$i = $282; //@line 4160
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 4160
       $$0362$i = 0; //@line 4160
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 4165
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 4170
          $$435113$i = 0; //@line 4170
          $$435712$i = $$0353$i; //@line 4170
          label = 85; //@line 4171
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 4174
          $$1348$i = $292; //@line 4174
         }
        } else {
         $$1343$i = $$0342$i; //@line 4177
         $$1348$i = $$0347$i; //@line 4177
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 4180
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 4183
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 4187
        $302 = ($$0353$i | 0) == 0; //@line 4188
        if ($302) {
         $$2355$i = $$1363$i; //@line 4193
         $$3$i203 = $$1343$i; //@line 4193
         $$3350$i = $$1348$i; //@line 4193
         label = 81; //@line 4194
         break;
        } else {
         $$0342$i = $$1343$i; //@line 4197
         $$0347$i = $$1348$i; //@line 4197
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 4197
         $$0362$i = $$1363$i; //@line 4197
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 4207
       $309 = $253 & ($306 | 0 - $306); //@line 4210
       if (!$309) {
        $$0197 = $252; //@line 4213
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 4218
       $315 = $313 >>> 12 & 16; //@line 4220
       $316 = $313 >>> $315; //@line 4221
       $318 = $316 >>> 5 & 8; //@line 4223
       $320 = $316 >>> $318; //@line 4225
       $322 = $320 >>> 2 & 4; //@line 4227
       $324 = $320 >>> $322; //@line 4229
       $326 = $324 >>> 1 & 2; //@line 4231
       $328 = $324 >>> $326; //@line 4233
       $330 = $328 >>> 1 & 1; //@line 4235
       $$4$ph$i = 0; //@line 4241
       $$4357$ph$i = HEAP32[5588 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 4241
      } else {
       $$4$ph$i = $$3$i203; //@line 4243
       $$4357$ph$i = $$2355$i; //@line 4243
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 4247
       $$4351$lcssa$i = $$3350$i; //@line 4247
      } else {
       $$414$i = $$4$ph$i; //@line 4249
       $$435113$i = $$3350$i; //@line 4249
       $$435712$i = $$4357$ph$i; //@line 4249
       label = 85; //@line 4250
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 4255
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 4259
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 4260
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 4261
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 4262
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4268
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 4271
        $$4351$lcssa$i = $$$4351$i; //@line 4271
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 4274
        $$435113$i = $$$4351$i; //@line 4274
        label = 85; //@line 4275
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 4281
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1323] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1325] | 0; //@line 4287
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 4290
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 4293
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 4296
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 4300
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 4302
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 4306
         $371 = HEAP32[$370 >> 2] | 0; //@line 4307
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 4310
          $374 = HEAP32[$373 >> 2] | 0; //@line 4311
          if (!$374) {
           $$3372$i = 0; //@line 4314
           break;
          } else {
           $$1370$i = $374; //@line 4317
           $$1374$i = $373; //@line 4317
          }
         } else {
          $$1370$i = $371; //@line 4320
          $$1374$i = $370; //@line 4320
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 4323
          $377 = HEAP32[$376 >> 2] | 0; //@line 4324
          if ($377 | 0) {
           $$1370$i = $377; //@line 4327
           $$1374$i = $376; //@line 4327
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 4330
          $380 = HEAP32[$379 >> 2] | 0; //@line 4331
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 4336
           $$1374$i = $379; //@line 4336
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 4341
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 4344
          $$3372$i = $$1370$i; //@line 4345
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 4350
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 4353
         }
         $364 = $362 + 12 | 0; //@line 4356
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 4360
         }
         $367 = $359 + 8 | 0; //@line 4363
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 4367
          HEAP32[$367 >> 2] = $362; //@line 4368
          $$3372$i = $359; //@line 4369
          break;
         } else {
          _abort(); //@line 4372
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 4380
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 4383
         $386 = 5588 + ($385 << 2) | 0; //@line 4384
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 4389
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 4394
            HEAP32[1322] = $391; //@line 4395
            $475 = $391; //@line 4396
            break L164;
           }
          } else {
           if ((HEAP32[1325] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 4403
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 4411
            if (!$$3372$i) {
             $475 = $253; //@line 4414
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1325] | 0; //@line 4422
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 4425
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 4429
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 4431
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 4437
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 4441
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 4443
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 4449
         if (!$409) {
          $475 = $253; //@line 4452
         } else {
          if ((HEAP32[1325] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 4457
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 4461
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 4463
           $475 = $253; //@line 4464
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 4473
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 4476
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 4478
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 4481
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 4485
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 4488
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 4490
         $428 = $$4351$lcssa$i >>> 3; //@line 4491
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 5324 + ($428 << 1 << 2) | 0; //@line 4495
          $432 = HEAP32[1321] | 0; //@line 4496
          $433 = 1 << $428; //@line 4497
          if (!($432 & $433)) {
           HEAP32[1321] = $432 | $433; //@line 4502
           $$0368$i = $431; //@line 4504
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 4504
          } else {
           $437 = $431 + 8 | 0; //@line 4506
           $438 = HEAP32[$437 >> 2] | 0; //@line 4507
           if ((HEAP32[1325] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 4511
           } else {
            $$0368$i = $438; //@line 4514
            $$pre$phi$i211Z2D = $437; //@line 4514
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 4517
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 4519
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 4521
          HEAP32[$354 + 12 >> 2] = $431; //@line 4523
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 4526
         if (!$444) {
          $$0361$i = 0; //@line 4529
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 4533
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 4537
           $450 = $444 << $449; //@line 4538
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 4541
           $455 = $450 << $453; //@line 4543
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 4546
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 4551
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 4557
          }
         }
         $469 = 5588 + ($$0361$i << 2) | 0; //@line 4560
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 4562
         $471 = $354 + 16 | 0; //@line 4563
         HEAP32[$471 + 4 >> 2] = 0; //@line 4565
         HEAP32[$471 >> 2] = 0; //@line 4566
         $473 = 1 << $$0361$i; //@line 4567
         if (!($475 & $473)) {
          HEAP32[1322] = $475 | $473; //@line 4572
          HEAP32[$469 >> 2] = $354; //@line 4573
          HEAP32[$354 + 24 >> 2] = $469; //@line 4575
          HEAP32[$354 + 12 >> 2] = $354; //@line 4577
          HEAP32[$354 + 8 >> 2] = $354; //@line 4579
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 4588
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 4588
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 4595
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 4599
          $494 = HEAP32[$492 >> 2] | 0; //@line 4601
          if (!$494) {
           label = 136; //@line 4604
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 4607
           $$0345$i = $494; //@line 4607
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1325] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 4614
          } else {
           HEAP32[$492 >> 2] = $354; //@line 4617
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 4619
           HEAP32[$354 + 12 >> 2] = $354; //@line 4621
           HEAP32[$354 + 8 >> 2] = $354; //@line 4623
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 4628
          $502 = HEAP32[$501 >> 2] | 0; //@line 4629
          $503 = HEAP32[1325] | 0; //@line 4630
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 4636
           HEAP32[$501 >> 2] = $354; //@line 4637
           HEAP32[$354 + 8 >> 2] = $502; //@line 4639
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 4641
           HEAP32[$354 + 24 >> 2] = 0; //@line 4643
           break;
          } else {
           _abort(); //@line 4646
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 4653
       STACKTOP = sp; //@line 4654
       return $$0 | 0; //@line 4654
      } else {
       $$0197 = $252; //@line 4656
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1323] | 0; //@line 4663
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 4666
  $515 = HEAP32[1326] | 0; //@line 4667
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 4670
   HEAP32[1326] = $517; //@line 4671
   HEAP32[1323] = $514; //@line 4672
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 4675
   HEAP32[$515 + $512 >> 2] = $514; //@line 4677
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 4680
  } else {
   HEAP32[1323] = 0; //@line 4682
   HEAP32[1326] = 0; //@line 4683
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 4686
   $526 = $515 + $512 + 4 | 0; //@line 4688
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 4691
  }
  $$0 = $515 + 8 | 0; //@line 4694
  STACKTOP = sp; //@line 4695
  return $$0 | 0; //@line 4695
 }
 $530 = HEAP32[1324] | 0; //@line 4697
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 4700
  HEAP32[1324] = $532; //@line 4701
  $533 = HEAP32[1327] | 0; //@line 4702
  $534 = $533 + $$0197 | 0; //@line 4703
  HEAP32[1327] = $534; //@line 4704
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 4707
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 4710
  $$0 = $533 + 8 | 0; //@line 4712
  STACKTOP = sp; //@line 4713
  return $$0 | 0; //@line 4713
 }
 if (!(HEAP32[1439] | 0)) {
  HEAP32[1441] = 4096; //@line 4718
  HEAP32[1440] = 4096; //@line 4719
  HEAP32[1442] = -1; //@line 4720
  HEAP32[1443] = -1; //@line 4721
  HEAP32[1444] = 0; //@line 4722
  HEAP32[1432] = 0; //@line 4723
  HEAP32[1439] = $1 & -16 ^ 1431655768; //@line 4727
  $548 = 4096; //@line 4728
 } else {
  $548 = HEAP32[1441] | 0; //@line 4731
 }
 $545 = $$0197 + 48 | 0; //@line 4733
 $546 = $$0197 + 47 | 0; //@line 4734
 $547 = $548 + $546 | 0; //@line 4735
 $549 = 0 - $548 | 0; //@line 4736
 $550 = $547 & $549; //@line 4737
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 4740
  STACKTOP = sp; //@line 4741
  return $$0 | 0; //@line 4741
 }
 $552 = HEAP32[1431] | 0; //@line 4743
 if ($552 | 0) {
  $554 = HEAP32[1429] | 0; //@line 4746
  $555 = $554 + $550 | 0; //@line 4747
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 4752
   STACKTOP = sp; //@line 4753
   return $$0 | 0; //@line 4753
  }
 }
 L244 : do {
  if (!(HEAP32[1432] & 4)) {
   $561 = HEAP32[1327] | 0; //@line 4761
   L246 : do {
    if (!$561) {
     label = 163; //@line 4765
    } else {
     $$0$i$i = 5732; //@line 4767
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 4769
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 4772
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 4781
      if (!$570) {
       label = 163; //@line 4784
       break L246;
      } else {
       $$0$i$i = $570; //@line 4787
      }
     }
     $595 = $547 - $530 & $549; //@line 4791
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 4794
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 4802
       } else {
        $$723947$i = $595; //@line 4804
        $$748$i = $597; //@line 4804
        label = 180; //@line 4805
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 4809
       $$2253$ph$i = $595; //@line 4809
       label = 171; //@line 4810
      }
     } else {
      $$2234243136$i = 0; //@line 4813
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 4819
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 4822
     } else {
      $574 = $572; //@line 4824
      $575 = HEAP32[1440] | 0; //@line 4825
      $576 = $575 + -1 | 0; //@line 4826
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 4834
      $584 = HEAP32[1429] | 0; //@line 4835
      $585 = $$$i + $584 | 0; //@line 4836
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1431] | 0; //@line 4841
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 4848
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 4852
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 4855
        $$748$i = $572; //@line 4855
        label = 180; //@line 4856
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 4859
        $$2253$ph$i = $$$i; //@line 4859
        label = 171; //@line 4860
       }
      } else {
       $$2234243136$i = 0; //@line 4863
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 4870
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 4879
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 4882
       $$748$i = $$2247$ph$i; //@line 4882
       label = 180; //@line 4883
       break L244;
      }
     }
     $607 = HEAP32[1441] | 0; //@line 4887
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 4891
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 4894
      $$748$i = $$2247$ph$i; //@line 4894
      label = 180; //@line 4895
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 4901
      $$2234243136$i = 0; //@line 4902
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 4906
      $$748$i = $$2247$ph$i; //@line 4906
      label = 180; //@line 4907
      break L244;
     }
    }
   } while (0);
   HEAP32[1432] = HEAP32[1432] | 4; //@line 4914
   $$4236$i = $$2234243136$i; //@line 4915
   label = 178; //@line 4916
  } else {
   $$4236$i = 0; //@line 4918
   label = 178; //@line 4919
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 4925
   $621 = _sbrk(0) | 0; //@line 4926
   $627 = $621 - $620 | 0; //@line 4934
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 4936
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 4944
    $$748$i = $620; //@line 4944
    label = 180; //@line 4945
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1429] | 0) + $$723947$i | 0; //@line 4951
  HEAP32[1429] = $633; //@line 4952
  if ($633 >>> 0 > (HEAP32[1430] | 0) >>> 0) {
   HEAP32[1430] = $633; //@line 4956
  }
  $636 = HEAP32[1327] | 0; //@line 4958
  do {
   if (!$636) {
    $638 = HEAP32[1325] | 0; //@line 4962
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1325] = $$748$i; //@line 4967
    }
    HEAP32[1433] = $$748$i; //@line 4969
    HEAP32[1434] = $$723947$i; //@line 4970
    HEAP32[1436] = 0; //@line 4971
    HEAP32[1330] = HEAP32[1439]; //@line 4973
    HEAP32[1329] = -1; //@line 4974
    HEAP32[1334] = 5324; //@line 4975
    HEAP32[1333] = 5324; //@line 4976
    HEAP32[1336] = 5332; //@line 4977
    HEAP32[1335] = 5332; //@line 4978
    HEAP32[1338] = 5340; //@line 4979
    HEAP32[1337] = 5340; //@line 4980
    HEAP32[1340] = 5348; //@line 4981
    HEAP32[1339] = 5348; //@line 4982
    HEAP32[1342] = 5356; //@line 4983
    HEAP32[1341] = 5356; //@line 4984
    HEAP32[1344] = 5364; //@line 4985
    HEAP32[1343] = 5364; //@line 4986
    HEAP32[1346] = 5372; //@line 4987
    HEAP32[1345] = 5372; //@line 4988
    HEAP32[1348] = 5380; //@line 4989
    HEAP32[1347] = 5380; //@line 4990
    HEAP32[1350] = 5388; //@line 4991
    HEAP32[1349] = 5388; //@line 4992
    HEAP32[1352] = 5396; //@line 4993
    HEAP32[1351] = 5396; //@line 4994
    HEAP32[1354] = 5404; //@line 4995
    HEAP32[1353] = 5404; //@line 4996
    HEAP32[1356] = 5412; //@line 4997
    HEAP32[1355] = 5412; //@line 4998
    HEAP32[1358] = 5420; //@line 4999
    HEAP32[1357] = 5420; //@line 5000
    HEAP32[1360] = 5428; //@line 5001
    HEAP32[1359] = 5428; //@line 5002
    HEAP32[1362] = 5436; //@line 5003
    HEAP32[1361] = 5436; //@line 5004
    HEAP32[1364] = 5444; //@line 5005
    HEAP32[1363] = 5444; //@line 5006
    HEAP32[1366] = 5452; //@line 5007
    HEAP32[1365] = 5452; //@line 5008
    HEAP32[1368] = 5460; //@line 5009
    HEAP32[1367] = 5460; //@line 5010
    HEAP32[1370] = 5468; //@line 5011
    HEAP32[1369] = 5468; //@line 5012
    HEAP32[1372] = 5476; //@line 5013
    HEAP32[1371] = 5476; //@line 5014
    HEAP32[1374] = 5484; //@line 5015
    HEAP32[1373] = 5484; //@line 5016
    HEAP32[1376] = 5492; //@line 5017
    HEAP32[1375] = 5492; //@line 5018
    HEAP32[1378] = 5500; //@line 5019
    HEAP32[1377] = 5500; //@line 5020
    HEAP32[1380] = 5508; //@line 5021
    HEAP32[1379] = 5508; //@line 5022
    HEAP32[1382] = 5516; //@line 5023
    HEAP32[1381] = 5516; //@line 5024
    HEAP32[1384] = 5524; //@line 5025
    HEAP32[1383] = 5524; //@line 5026
    HEAP32[1386] = 5532; //@line 5027
    HEAP32[1385] = 5532; //@line 5028
    HEAP32[1388] = 5540; //@line 5029
    HEAP32[1387] = 5540; //@line 5030
    HEAP32[1390] = 5548; //@line 5031
    HEAP32[1389] = 5548; //@line 5032
    HEAP32[1392] = 5556; //@line 5033
    HEAP32[1391] = 5556; //@line 5034
    HEAP32[1394] = 5564; //@line 5035
    HEAP32[1393] = 5564; //@line 5036
    HEAP32[1396] = 5572; //@line 5037
    HEAP32[1395] = 5572; //@line 5038
    $642 = $$723947$i + -40 | 0; //@line 5039
    $644 = $$748$i + 8 | 0; //@line 5041
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 5046
    $650 = $$748$i + $649 | 0; //@line 5047
    $651 = $642 - $649 | 0; //@line 5048
    HEAP32[1327] = $650; //@line 5049
    HEAP32[1324] = $651; //@line 5050
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 5053
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 5056
    HEAP32[1328] = HEAP32[1443]; //@line 5058
   } else {
    $$024367$i = 5732; //@line 5060
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 5062
     $658 = $$024367$i + 4 | 0; //@line 5063
     $659 = HEAP32[$658 >> 2] | 0; //@line 5064
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 5068
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 5072
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 5077
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 5091
       $673 = (HEAP32[1324] | 0) + $$723947$i | 0; //@line 5093
       $675 = $636 + 8 | 0; //@line 5095
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 5100
       $681 = $636 + $680 | 0; //@line 5101
       $682 = $673 - $680 | 0; //@line 5102
       HEAP32[1327] = $681; //@line 5103
       HEAP32[1324] = $682; //@line 5104
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 5107
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 5110
       HEAP32[1328] = HEAP32[1443]; //@line 5112
       break;
      }
     }
    }
    $688 = HEAP32[1325] | 0; //@line 5117
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1325] = $$748$i; //@line 5120
     $753 = $$748$i; //@line 5121
    } else {
     $753 = $688; //@line 5123
    }
    $690 = $$748$i + $$723947$i | 0; //@line 5125
    $$124466$i = 5732; //@line 5126
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 5131
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 5135
     if (!$694) {
      $$0$i$i$i = 5732; //@line 5138
      break;
     } else {
      $$124466$i = $694; //@line 5141
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 5150
      $700 = $$124466$i + 4 | 0; //@line 5151
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 5154
      $704 = $$748$i + 8 | 0; //@line 5156
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 5162
      $712 = $690 + 8 | 0; //@line 5164
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 5170
      $722 = $710 + $$0197 | 0; //@line 5174
      $723 = $718 - $710 - $$0197 | 0; //@line 5175
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 5178
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1324] | 0) + $723 | 0; //@line 5183
        HEAP32[1324] = $728; //@line 5184
        HEAP32[1327] = $722; //@line 5185
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 5188
       } else {
        if ((HEAP32[1326] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1323] | 0) + $723 | 0; //@line 5194
         HEAP32[1323] = $734; //@line 5195
         HEAP32[1326] = $722; //@line 5196
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 5199
         HEAP32[$722 + $734 >> 2] = $734; //@line 5201
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 5205
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 5209
         $743 = $739 >>> 3; //@line 5210
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 5215
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 5217
           $750 = 5324 + ($743 << 1 << 2) | 0; //@line 5219
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 5225
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 5234
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1321] = HEAP32[1321] & ~(1 << $743); //@line 5244
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 5251
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 5255
             }
             $764 = $748 + 8 | 0; //@line 5258
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 5262
              break;
             }
             _abort(); //@line 5265
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 5270
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 5271
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 5274
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 5276
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 5280
             $783 = $782 + 4 | 0; //@line 5281
             $784 = HEAP32[$783 >> 2] | 0; //@line 5282
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 5285
              if (!$786) {
               $$3$i$i = 0; //@line 5288
               break;
              } else {
               $$1291$i$i = $786; //@line 5291
               $$1293$i$i = $782; //@line 5291
              }
             } else {
              $$1291$i$i = $784; //@line 5294
              $$1293$i$i = $783; //@line 5294
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 5297
              $789 = HEAP32[$788 >> 2] | 0; //@line 5298
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 5301
               $$1293$i$i = $788; //@line 5301
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 5304
              $792 = HEAP32[$791 >> 2] | 0; //@line 5305
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 5310
               $$1293$i$i = $791; //@line 5310
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 5315
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 5318
              $$3$i$i = $$1291$i$i; //@line 5319
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 5324
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 5327
             }
             $776 = $774 + 12 | 0; //@line 5330
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 5334
             }
             $779 = $771 + 8 | 0; //@line 5337
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 5341
              HEAP32[$779 >> 2] = $774; //@line 5342
              $$3$i$i = $771; //@line 5343
              break;
             } else {
              _abort(); //@line 5346
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 5356
           $798 = 5588 + ($797 << 2) | 0; //@line 5357
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 5362
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1322] = HEAP32[1322] & ~(1 << $797); //@line 5371
             break L311;
            } else {
             if ((HEAP32[1325] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 5377
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 5385
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1325] | 0; //@line 5395
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 5398
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 5402
           $815 = $718 + 16 | 0; //@line 5403
           $816 = HEAP32[$815 >> 2] | 0; //@line 5404
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 5410
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 5414
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 5416
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 5422
           if (!$822) {
            break;
           }
           if ((HEAP32[1325] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 5430
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 5434
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 5436
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 5443
         $$0287$i$i = $742 + $723 | 0; //@line 5443
        } else {
         $$0$i17$i = $718; //@line 5445
         $$0287$i$i = $723; //@line 5445
        }
        $830 = $$0$i17$i + 4 | 0; //@line 5447
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 5450
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 5453
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 5455
        $836 = $$0287$i$i >>> 3; //@line 5456
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 5324 + ($836 << 1 << 2) | 0; //@line 5460
         $840 = HEAP32[1321] | 0; //@line 5461
         $841 = 1 << $836; //@line 5462
         do {
          if (!($840 & $841)) {
           HEAP32[1321] = $840 | $841; //@line 5468
           $$0295$i$i = $839; //@line 5470
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 5470
          } else {
           $845 = $839 + 8 | 0; //@line 5472
           $846 = HEAP32[$845 >> 2] | 0; //@line 5473
           if ((HEAP32[1325] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 5477
            $$pre$phi$i19$iZ2D = $845; //@line 5477
            break;
           }
           _abort(); //@line 5480
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 5484
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 5486
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 5488
         HEAP32[$722 + 12 >> 2] = $839; //@line 5490
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 5493
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 5497
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 5501
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 5506
          $858 = $852 << $857; //@line 5507
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 5510
          $863 = $858 << $861; //@line 5512
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 5515
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 5520
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 5526
         }
        } while (0);
        $877 = 5588 + ($$0296$i$i << 2) | 0; //@line 5529
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 5531
        $879 = $722 + 16 | 0; //@line 5532
        HEAP32[$879 + 4 >> 2] = 0; //@line 5534
        HEAP32[$879 >> 2] = 0; //@line 5535
        $881 = HEAP32[1322] | 0; //@line 5536
        $882 = 1 << $$0296$i$i; //@line 5537
        if (!($881 & $882)) {
         HEAP32[1322] = $881 | $882; //@line 5542
         HEAP32[$877 >> 2] = $722; //@line 5543
         HEAP32[$722 + 24 >> 2] = $877; //@line 5545
         HEAP32[$722 + 12 >> 2] = $722; //@line 5547
         HEAP32[$722 + 8 >> 2] = $722; //@line 5549
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 5558
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 5558
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 5565
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 5569
         $902 = HEAP32[$900 >> 2] | 0; //@line 5571
         if (!$902) {
          label = 260; //@line 5574
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 5577
          $$0289$i$i = $902; //@line 5577
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1325] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 5584
         } else {
          HEAP32[$900 >> 2] = $722; //@line 5587
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 5589
          HEAP32[$722 + 12 >> 2] = $722; //@line 5591
          HEAP32[$722 + 8 >> 2] = $722; //@line 5593
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 5598
         $910 = HEAP32[$909 >> 2] | 0; //@line 5599
         $911 = HEAP32[1325] | 0; //@line 5600
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 5606
          HEAP32[$909 >> 2] = $722; //@line 5607
          HEAP32[$722 + 8 >> 2] = $910; //@line 5609
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 5611
          HEAP32[$722 + 24 >> 2] = 0; //@line 5613
          break;
         } else {
          _abort(); //@line 5616
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 5623
      STACKTOP = sp; //@line 5624
      return $$0 | 0; //@line 5624
     } else {
      $$0$i$i$i = 5732; //@line 5626
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 5630
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 5635
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 5643
    }
    $927 = $923 + -47 | 0; //@line 5645
    $929 = $927 + 8 | 0; //@line 5647
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 5653
    $936 = $636 + 16 | 0; //@line 5654
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 5656
    $939 = $938 + 8 | 0; //@line 5657
    $940 = $938 + 24 | 0; //@line 5658
    $941 = $$723947$i + -40 | 0; //@line 5659
    $943 = $$748$i + 8 | 0; //@line 5661
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 5666
    $949 = $$748$i + $948 | 0; //@line 5667
    $950 = $941 - $948 | 0; //@line 5668
    HEAP32[1327] = $949; //@line 5669
    HEAP32[1324] = $950; //@line 5670
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 5673
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 5676
    HEAP32[1328] = HEAP32[1443]; //@line 5678
    $956 = $938 + 4 | 0; //@line 5679
    HEAP32[$956 >> 2] = 27; //@line 5680
    HEAP32[$939 >> 2] = HEAP32[1433]; //@line 5681
    HEAP32[$939 + 4 >> 2] = HEAP32[1434]; //@line 5681
    HEAP32[$939 + 8 >> 2] = HEAP32[1435]; //@line 5681
    HEAP32[$939 + 12 >> 2] = HEAP32[1436]; //@line 5681
    HEAP32[1433] = $$748$i; //@line 5682
    HEAP32[1434] = $$723947$i; //@line 5683
    HEAP32[1436] = 0; //@line 5684
    HEAP32[1435] = $939; //@line 5685
    $958 = $940; //@line 5686
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 5688
     HEAP32[$958 >> 2] = 7; //@line 5689
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 5702
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 5705
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 5708
     HEAP32[$938 >> 2] = $964; //@line 5709
     $969 = $964 >>> 3; //@line 5710
     if ($964 >>> 0 < 256) {
      $972 = 5324 + ($969 << 1 << 2) | 0; //@line 5714
      $973 = HEAP32[1321] | 0; //@line 5715
      $974 = 1 << $969; //@line 5716
      if (!($973 & $974)) {
       HEAP32[1321] = $973 | $974; //@line 5721
       $$0211$i$i = $972; //@line 5723
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 5723
      } else {
       $978 = $972 + 8 | 0; //@line 5725
       $979 = HEAP32[$978 >> 2] | 0; //@line 5726
       if ((HEAP32[1325] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 5730
       } else {
        $$0211$i$i = $979; //@line 5733
        $$pre$phi$i$iZ2D = $978; //@line 5733
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 5736
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 5738
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 5740
      HEAP32[$636 + 12 >> 2] = $972; //@line 5742
      break;
     }
     $985 = $964 >>> 8; //@line 5745
     if (!$985) {
      $$0212$i$i = 0; //@line 5748
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 5752
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 5756
       $991 = $985 << $990; //@line 5757
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 5760
       $996 = $991 << $994; //@line 5762
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 5765
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 5770
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 5776
      }
     }
     $1010 = 5588 + ($$0212$i$i << 2) | 0; //@line 5779
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 5781
     HEAP32[$636 + 20 >> 2] = 0; //@line 5783
     HEAP32[$936 >> 2] = 0; //@line 5784
     $1013 = HEAP32[1322] | 0; //@line 5785
     $1014 = 1 << $$0212$i$i; //@line 5786
     if (!($1013 & $1014)) {
      HEAP32[1322] = $1013 | $1014; //@line 5791
      HEAP32[$1010 >> 2] = $636; //@line 5792
      HEAP32[$636 + 24 >> 2] = $1010; //@line 5794
      HEAP32[$636 + 12 >> 2] = $636; //@line 5796
      HEAP32[$636 + 8 >> 2] = $636; //@line 5798
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 5807
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 5807
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 5814
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 5818
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 5820
      if (!$1034) {
       label = 286; //@line 5823
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 5826
       $$0207$i$i = $1034; //@line 5826
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1325] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 5833
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 5836
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 5838
       HEAP32[$636 + 12 >> 2] = $636; //@line 5840
       HEAP32[$636 + 8 >> 2] = $636; //@line 5842
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 5847
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 5848
      $1043 = HEAP32[1325] | 0; //@line 5849
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 5855
       HEAP32[$1041 >> 2] = $636; //@line 5856
       HEAP32[$636 + 8 >> 2] = $1042; //@line 5858
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 5860
       HEAP32[$636 + 24 >> 2] = 0; //@line 5862
       break;
      } else {
       _abort(); //@line 5865
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1324] | 0; //@line 5872
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 5875
   HEAP32[1324] = $1054; //@line 5876
   $1055 = HEAP32[1327] | 0; //@line 5877
   $1056 = $1055 + $$0197 | 0; //@line 5878
   HEAP32[1327] = $1056; //@line 5879
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 5882
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 5885
   $$0 = $1055 + 8 | 0; //@line 5887
   STACKTOP = sp; //@line 5888
   return $$0 | 0; //@line 5888
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 5892
 $$0 = 0; //@line 5893
 STACKTOP = sp; //@line 5894
 return $$0 | 0; //@line 5894
}
function _equeue_dispatch__async_cb_61($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$03956$i = 0, $$03956$i$phi = 0, $$04055$i = 0, $$0405571$i = 0, $$04063$i = 0, $$04159$i = 0, $$04258$i = 0, $$057$i = 0, $$067 = 0, $$06992 = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val11 = 0, $$expand_i1_val13 = 0, $$expand_i1_val9 = 0, $$sink$in$i$i = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $12 = 0, $127 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $150 = 0, $152 = 0, $153 = 0, $154 = 0, $156 = 0, $157 = 0, $16 = 0, $165 = 0, $166 = 0, $168 = 0, $171 = 0, $173 = 0, $176 = 0, $179 = 0, $18 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $190 = 0, $193 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $4 = 0, $44 = 0, $45 = 0, $48 = 0, $54 = 0, $6 = 0, $63 = 0, $66 = 0, $67 = 0, $69 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $93 = 0, $95 = 0, $98 = 0, $99 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0, $$04159$i$looptemp = 0, $$04258$i$looptemp = 0;
 sp = STACKTOP; //@line 5420
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5422
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5424
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5426
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5428
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5430
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5432
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 5434
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 5436
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 5438
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 5440
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 5442
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 5444
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 5446
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 5448
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 5450
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 5452
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 5454
 $36 = HEAP8[$0 + 72 >> 0] & 1; //@line 5457
 _equeue_mutex_lock($4); //@line 5458
 HEAP8[$6 >> 0] = (HEAPU8[$6 >> 0] | 0) + 1; //@line 5463
 if (((HEAP32[$8 >> 2] | 0) - $2 | 0) < 1) {
  HEAP32[$8 >> 2] = $2; //@line 5468
 }
 $44 = HEAP32[$16 >> 2] | 0; //@line 5470
 HEAP32[$18 >> 2] = $44; //@line 5471
 $45 = $44; //@line 5472
 L6 : do {
  if (!$44) {
   $$04055$i = $20; //@line 5476
   $54 = $45; //@line 5476
   label = 8; //@line 5477
  } else {
   $$04063$i = $20; //@line 5479
   $48 = $45; //@line 5479
   do {
    if (((HEAP32[$48 + 20 >> 2] | 0) - $2 | 0) >= 1) {
     $$04055$i = $$04063$i; //@line 5486
     $54 = $48; //@line 5486
     label = 8; //@line 5487
     break L6;
    }
    $$04063$i = $48 + 8 | 0; //@line 5490
    $48 = HEAP32[$$04063$i >> 2] | 0; //@line 5491
   } while (($48 | 0) != 0);
   HEAP32[$10 >> 2] = 0; //@line 5499
   $$0405571$i = $$04063$i; //@line 5500
  }
 } while (0);
 if ((label | 0) == 8) {
  HEAP32[$10 >> 2] = $54; //@line 5504
  if (!$54) {
   $$0405571$i = $$04055$i; //@line 5507
  } else {
   HEAP32[$54 + 16 >> 2] = $10; //@line 5510
   $$0405571$i = $$04055$i; //@line 5511
  }
 }
 HEAP32[$$0405571$i >> 2] = 0; //@line 5514
 _equeue_mutex_unlock($4); //@line 5515
 $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74 = HEAP32[$20 >> 2] | 0; //@line 5516
 L15 : do {
  if (!$$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74) {} else {
   $$04159$i = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74; //@line 5521
   $$04258$i = $20; //@line 5521
   do {
    $$04258$i$looptemp = $$04258$i;
    $$04258$i = $$04159$i + 8 | 0; //@line 5523
    $$04159$i$looptemp = $$04159$i;
    $$04159$i = HEAP32[$$04258$i >> 2] | 0; //@line 5524
    $$03956$i = 0; //@line 5525
    $$057$i = $$04159$i$looptemp; //@line 5525
    while (1) {
     HEAP32[$$057$i + 8 >> 2] = $$03956$i; //@line 5528
     $63 = HEAP32[$$057$i + 12 >> 2] | 0; //@line 5530
     if (!$63) {
      break;
     } else {
      $$03956$i$phi = $$057$i; //@line 5535
      $$057$i = $63; //@line 5535
      $$03956$i = $$03956$i$phi; //@line 5535
     }
    }
    HEAP32[$$04258$i$looptemp >> 2] = $$057$i; //@line 5538
   } while (($$04159$i | 0) != 0);
   $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 = HEAP32[$20 >> 2] | 0; //@line 5546
   if ($$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 | 0) {
    $$06992 = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75; //@line 5549
    while (1) {
     $66 = $$06992 + 8 | 0; //@line 5551
     $67 = HEAP32[$66 >> 2] | 0; //@line 5552
     $69 = HEAP32[$$06992 + 32 >> 2] | 0; //@line 5554
     if ($69 | 0) {
      label = 17; //@line 5557
      break;
     }
     $93 = HEAP32[$$06992 + 24 >> 2] | 0; //@line 5561
     if (($93 | 0) > -1) {
      label = 21; //@line 5564
      break;
     }
     $117 = $$06992 + 4 | 0; //@line 5568
     $118 = HEAP8[$117 >> 0] | 0; //@line 5569
     HEAP8[$117 >> 0] = (($118 + 1 & 255) << HEAP32[$28 >> 2] | 0) == 0 ? 1 : ($118 & 255) + 1 & 255; //@line 5578
     $127 = HEAP32[$$06992 + 28 >> 2] | 0; //@line 5580
     if ($127 | 0) {
      label = 25; //@line 5583
      break;
     }
     _equeue_mutex_lock($30); //@line 5586
     $150 = HEAP32[$32 >> 2] | 0; //@line 5587
     L28 : do {
      if (!$150) {
       $$02329$i$i = $32; //@line 5591
       label = 34; //@line 5592
      } else {
       $152 = HEAP32[$$06992 >> 2] | 0; //@line 5594
       $$025$i$i = $32; //@line 5595
       $154 = $150; //@line 5595
       while (1) {
        $153 = HEAP32[$154 >> 2] | 0; //@line 5597
        if ($153 >>> 0 >= $152 >>> 0) {
         break;
        }
        $156 = $154 + 8 | 0; //@line 5602
        $157 = HEAP32[$156 >> 2] | 0; //@line 5603
        if (!$157) {
         $$02329$i$i = $156; //@line 5606
         label = 34; //@line 5607
         break L28;
        } else {
         $$025$i$i = $156; //@line 5610
         $154 = $157; //@line 5610
        }
       }
       if (($153 | 0) == ($152 | 0)) {
        HEAP32[$$06992 + 12 >> 2] = $154; //@line 5616
        $$02330$i$i = $$025$i$i; //@line 5619
        $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 5619
       } else {
        $$02329$i$i = $$025$i$i; //@line 5621
        label = 34; //@line 5622
       }
      }
     } while (0);
     if ((label | 0) == 34) {
      label = 0; //@line 5627
      HEAP32[$$06992 + 12 >> 2] = 0; //@line 5629
      $$02330$i$i = $$02329$i$i; //@line 5630
      $$sink$in$i$i = $$02329$i$i; //@line 5630
     }
     HEAP32[$66 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 5633
     HEAP32[$$02330$i$i >> 2] = $$06992; //@line 5634
     _equeue_mutex_unlock($30); //@line 5635
     if (!$67) {
      break L15;
     } else {
      $$06992 = $67; //@line 5640
     }
    }
    if ((label | 0) == 17) {
     $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 5645
     FUNCTION_TABLE_vi[$69 & 255]($$06992 + 36 | 0); //@line 5646
     if (___async) {
      HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 5649
      $72 = $ReallocAsyncCtx + 4 | 0; //@line 5650
      HEAP32[$72 >> 2] = $4; //@line 5651
      $73 = $ReallocAsyncCtx + 8 | 0; //@line 5652
      HEAP32[$73 >> 2] = $6; //@line 5653
      $74 = $ReallocAsyncCtx + 12 | 0; //@line 5654
      HEAP32[$74 >> 2] = $8; //@line 5655
      $75 = $ReallocAsyncCtx + 16 | 0; //@line 5656
      HEAP32[$75 >> 2] = $10; //@line 5657
      $76 = $ReallocAsyncCtx + 20 | 0; //@line 5658
      HEAP32[$76 >> 2] = $12; //@line 5659
      $77 = $ReallocAsyncCtx + 24 | 0; //@line 5660
      HEAP32[$77 >> 2] = $14; //@line 5661
      $78 = $ReallocAsyncCtx + 28 | 0; //@line 5662
      HEAP32[$78 >> 2] = $16; //@line 5663
      $79 = $ReallocAsyncCtx + 32 | 0; //@line 5664
      HEAP32[$79 >> 2] = $18; //@line 5665
      $80 = $ReallocAsyncCtx + 36 | 0; //@line 5666
      HEAP32[$80 >> 2] = $20; //@line 5667
      $81 = $ReallocAsyncCtx + 40 | 0; //@line 5668
      HEAP32[$81 >> 2] = $22; //@line 5669
      $82 = $ReallocAsyncCtx + 44 | 0; //@line 5670
      HEAP32[$82 >> 2] = $24; //@line 5671
      $83 = $ReallocAsyncCtx + 48 | 0; //@line 5672
      HEAP32[$83 >> 2] = $26; //@line 5673
      $84 = $ReallocAsyncCtx + 52 | 0; //@line 5674
      HEAP32[$84 >> 2] = $67; //@line 5675
      $85 = $ReallocAsyncCtx + 56 | 0; //@line 5676
      HEAP32[$85 >> 2] = $$06992; //@line 5677
      $86 = $ReallocAsyncCtx + 60 | 0; //@line 5678
      HEAP32[$86 >> 2] = $28; //@line 5679
      $87 = $ReallocAsyncCtx + 64 | 0; //@line 5680
      HEAP32[$87 >> 2] = $30; //@line 5681
      $88 = $ReallocAsyncCtx + 68 | 0; //@line 5682
      HEAP32[$88 >> 2] = $32; //@line 5683
      $89 = $ReallocAsyncCtx + 72 | 0; //@line 5684
      HEAP32[$89 >> 2] = $66; //@line 5685
      $90 = $ReallocAsyncCtx + 76 | 0; //@line 5686
      HEAP32[$90 >> 2] = $34; //@line 5687
      $91 = $ReallocAsyncCtx + 80 | 0; //@line 5688
      $$expand_i1_val = $36 & 1; //@line 5689
      HEAP8[$91 >> 0] = $$expand_i1_val; //@line 5690
      sp = STACKTOP; //@line 5691
      return;
     }
     ___async_unwind = 0; //@line 5694
     HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 5695
     $72 = $ReallocAsyncCtx + 4 | 0; //@line 5696
     HEAP32[$72 >> 2] = $4; //@line 5697
     $73 = $ReallocAsyncCtx + 8 | 0; //@line 5698
     HEAP32[$73 >> 2] = $6; //@line 5699
     $74 = $ReallocAsyncCtx + 12 | 0; //@line 5700
     HEAP32[$74 >> 2] = $8; //@line 5701
     $75 = $ReallocAsyncCtx + 16 | 0; //@line 5702
     HEAP32[$75 >> 2] = $10; //@line 5703
     $76 = $ReallocAsyncCtx + 20 | 0; //@line 5704
     HEAP32[$76 >> 2] = $12; //@line 5705
     $77 = $ReallocAsyncCtx + 24 | 0; //@line 5706
     HEAP32[$77 >> 2] = $14; //@line 5707
     $78 = $ReallocAsyncCtx + 28 | 0; //@line 5708
     HEAP32[$78 >> 2] = $16; //@line 5709
     $79 = $ReallocAsyncCtx + 32 | 0; //@line 5710
     HEAP32[$79 >> 2] = $18; //@line 5711
     $80 = $ReallocAsyncCtx + 36 | 0; //@line 5712
     HEAP32[$80 >> 2] = $20; //@line 5713
     $81 = $ReallocAsyncCtx + 40 | 0; //@line 5714
     HEAP32[$81 >> 2] = $22; //@line 5715
     $82 = $ReallocAsyncCtx + 44 | 0; //@line 5716
     HEAP32[$82 >> 2] = $24; //@line 5717
     $83 = $ReallocAsyncCtx + 48 | 0; //@line 5718
     HEAP32[$83 >> 2] = $26; //@line 5719
     $84 = $ReallocAsyncCtx + 52 | 0; //@line 5720
     HEAP32[$84 >> 2] = $67; //@line 5721
     $85 = $ReallocAsyncCtx + 56 | 0; //@line 5722
     HEAP32[$85 >> 2] = $$06992; //@line 5723
     $86 = $ReallocAsyncCtx + 60 | 0; //@line 5724
     HEAP32[$86 >> 2] = $28; //@line 5725
     $87 = $ReallocAsyncCtx + 64 | 0; //@line 5726
     HEAP32[$87 >> 2] = $30; //@line 5727
     $88 = $ReallocAsyncCtx + 68 | 0; //@line 5728
     HEAP32[$88 >> 2] = $32; //@line 5729
     $89 = $ReallocAsyncCtx + 72 | 0; //@line 5730
     HEAP32[$89 >> 2] = $66; //@line 5731
     $90 = $ReallocAsyncCtx + 76 | 0; //@line 5732
     HEAP32[$90 >> 2] = $34; //@line 5733
     $91 = $ReallocAsyncCtx + 80 | 0; //@line 5734
     $$expand_i1_val = $36 & 1; //@line 5735
     HEAP8[$91 >> 0] = $$expand_i1_val; //@line 5736
     sp = STACKTOP; //@line 5737
     return;
    } else if ((label | 0) == 21) {
     $95 = $$06992 + 20 | 0; //@line 5741
     HEAP32[$95 >> 2] = (HEAP32[$95 >> 2] | 0) + $93; //@line 5744
     $98 = _equeue_tick() | 0; //@line 5745
     $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 5746
     _equeue_enqueue($12, $$06992, $98) | 0; //@line 5747
     if (___async) {
      HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 5750
      $99 = $ReallocAsyncCtx4 + 4 | 0; //@line 5751
      HEAP32[$99 >> 2] = $4; //@line 5752
      $100 = $ReallocAsyncCtx4 + 8 | 0; //@line 5753
      HEAP32[$100 >> 2] = $6; //@line 5754
      $101 = $ReallocAsyncCtx4 + 12 | 0; //@line 5755
      HEAP32[$101 >> 2] = $8; //@line 5756
      $102 = $ReallocAsyncCtx4 + 16 | 0; //@line 5757
      HEAP32[$102 >> 2] = $10; //@line 5758
      $103 = $ReallocAsyncCtx4 + 20 | 0; //@line 5759
      HEAP32[$103 >> 2] = $12; //@line 5760
      $104 = $ReallocAsyncCtx4 + 24 | 0; //@line 5761
      HEAP32[$104 >> 2] = $14; //@line 5762
      $105 = $ReallocAsyncCtx4 + 28 | 0; //@line 5763
      HEAP32[$105 >> 2] = $16; //@line 5764
      $106 = $ReallocAsyncCtx4 + 32 | 0; //@line 5765
      HEAP32[$106 >> 2] = $18; //@line 5766
      $107 = $ReallocAsyncCtx4 + 36 | 0; //@line 5767
      HEAP32[$107 >> 2] = $20; //@line 5768
      $108 = $ReallocAsyncCtx4 + 40 | 0; //@line 5769
      HEAP32[$108 >> 2] = $22; //@line 5770
      $109 = $ReallocAsyncCtx4 + 44 | 0; //@line 5771
      HEAP32[$109 >> 2] = $24; //@line 5772
      $110 = $ReallocAsyncCtx4 + 48 | 0; //@line 5773
      HEAP32[$110 >> 2] = $26; //@line 5774
      $111 = $ReallocAsyncCtx4 + 52 | 0; //@line 5775
      HEAP32[$111 >> 2] = $28; //@line 5776
      $112 = $ReallocAsyncCtx4 + 56 | 0; //@line 5777
      HEAP32[$112 >> 2] = $30; //@line 5778
      $113 = $ReallocAsyncCtx4 + 60 | 0; //@line 5779
      HEAP32[$113 >> 2] = $32; //@line 5780
      $114 = $ReallocAsyncCtx4 + 64 | 0; //@line 5781
      HEAP32[$114 >> 2] = $34; //@line 5782
      $115 = $ReallocAsyncCtx4 + 68 | 0; //@line 5783
      $$expand_i1_val9 = $36 & 1; //@line 5784
      HEAP8[$115 >> 0] = $$expand_i1_val9; //@line 5785
      $116 = $ReallocAsyncCtx4 + 72 | 0; //@line 5786
      HEAP32[$116 >> 2] = $67; //@line 5787
      sp = STACKTOP; //@line 5788
      return;
     }
     ___async_unwind = 0; //@line 5791
     HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 5792
     $99 = $ReallocAsyncCtx4 + 4 | 0; //@line 5793
     HEAP32[$99 >> 2] = $4; //@line 5794
     $100 = $ReallocAsyncCtx4 + 8 | 0; //@line 5795
     HEAP32[$100 >> 2] = $6; //@line 5796
     $101 = $ReallocAsyncCtx4 + 12 | 0; //@line 5797
     HEAP32[$101 >> 2] = $8; //@line 5798
     $102 = $ReallocAsyncCtx4 + 16 | 0; //@line 5799
     HEAP32[$102 >> 2] = $10; //@line 5800
     $103 = $ReallocAsyncCtx4 + 20 | 0; //@line 5801
     HEAP32[$103 >> 2] = $12; //@line 5802
     $104 = $ReallocAsyncCtx4 + 24 | 0; //@line 5803
     HEAP32[$104 >> 2] = $14; //@line 5804
     $105 = $ReallocAsyncCtx4 + 28 | 0; //@line 5805
     HEAP32[$105 >> 2] = $16; //@line 5806
     $106 = $ReallocAsyncCtx4 + 32 | 0; //@line 5807
     HEAP32[$106 >> 2] = $18; //@line 5808
     $107 = $ReallocAsyncCtx4 + 36 | 0; //@line 5809
     HEAP32[$107 >> 2] = $20; //@line 5810
     $108 = $ReallocAsyncCtx4 + 40 | 0; //@line 5811
     HEAP32[$108 >> 2] = $22; //@line 5812
     $109 = $ReallocAsyncCtx4 + 44 | 0; //@line 5813
     HEAP32[$109 >> 2] = $24; //@line 5814
     $110 = $ReallocAsyncCtx4 + 48 | 0; //@line 5815
     HEAP32[$110 >> 2] = $26; //@line 5816
     $111 = $ReallocAsyncCtx4 + 52 | 0; //@line 5817
     HEAP32[$111 >> 2] = $28; //@line 5818
     $112 = $ReallocAsyncCtx4 + 56 | 0; //@line 5819
     HEAP32[$112 >> 2] = $30; //@line 5820
     $113 = $ReallocAsyncCtx4 + 60 | 0; //@line 5821
     HEAP32[$113 >> 2] = $32; //@line 5822
     $114 = $ReallocAsyncCtx4 + 64 | 0; //@line 5823
     HEAP32[$114 >> 2] = $34; //@line 5824
     $115 = $ReallocAsyncCtx4 + 68 | 0; //@line 5825
     $$expand_i1_val9 = $36 & 1; //@line 5826
     HEAP8[$115 >> 0] = $$expand_i1_val9; //@line 5827
     $116 = $ReallocAsyncCtx4 + 72 | 0; //@line 5828
     HEAP32[$116 >> 2] = $67; //@line 5829
     sp = STACKTOP; //@line 5830
     return;
    } else if ((label | 0) == 25) {
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 5835
     FUNCTION_TABLE_vi[$127 & 255]($$06992 + 36 | 0); //@line 5836
     if (___async) {
      HEAP32[$ReallocAsyncCtx2 >> 2] = 30; //@line 5839
      $130 = $ReallocAsyncCtx2 + 4 | 0; //@line 5840
      HEAP32[$130 >> 2] = $4; //@line 5841
      $131 = $ReallocAsyncCtx2 + 8 | 0; //@line 5842
      HEAP32[$131 >> 2] = $6; //@line 5843
      $132 = $ReallocAsyncCtx2 + 12 | 0; //@line 5844
      HEAP32[$132 >> 2] = $8; //@line 5845
      $133 = $ReallocAsyncCtx2 + 16 | 0; //@line 5846
      HEAP32[$133 >> 2] = $10; //@line 5847
      $134 = $ReallocAsyncCtx2 + 20 | 0; //@line 5848
      HEAP32[$134 >> 2] = $12; //@line 5849
      $135 = $ReallocAsyncCtx2 + 24 | 0; //@line 5850
      HEAP32[$135 >> 2] = $14; //@line 5851
      $136 = $ReallocAsyncCtx2 + 28 | 0; //@line 5852
      HEAP32[$136 >> 2] = $16; //@line 5853
      $137 = $ReallocAsyncCtx2 + 32 | 0; //@line 5854
      HEAP32[$137 >> 2] = $18; //@line 5855
      $138 = $ReallocAsyncCtx2 + 36 | 0; //@line 5856
      HEAP32[$138 >> 2] = $20; //@line 5857
      $139 = $ReallocAsyncCtx2 + 40 | 0; //@line 5858
      HEAP32[$139 >> 2] = $22; //@line 5859
      $140 = $ReallocAsyncCtx2 + 44 | 0; //@line 5860
      HEAP32[$140 >> 2] = $24; //@line 5861
      $141 = $ReallocAsyncCtx2 + 48 | 0; //@line 5862
      HEAP32[$141 >> 2] = $26; //@line 5863
      $142 = $ReallocAsyncCtx2 + 52 | 0; //@line 5864
      HEAP32[$142 >> 2] = $28; //@line 5865
      $143 = $ReallocAsyncCtx2 + 56 | 0; //@line 5866
      HEAP32[$143 >> 2] = $30; //@line 5867
      $144 = $ReallocAsyncCtx2 + 60 | 0; //@line 5868
      HEAP32[$144 >> 2] = $32; //@line 5869
      $145 = $ReallocAsyncCtx2 + 64 | 0; //@line 5870
      HEAP32[$145 >> 2] = $34; //@line 5871
      $146 = $ReallocAsyncCtx2 + 68 | 0; //@line 5872
      $$expand_i1_val11 = $36 & 1; //@line 5873
      HEAP8[$146 >> 0] = $$expand_i1_val11; //@line 5874
      $147 = $ReallocAsyncCtx2 + 72 | 0; //@line 5875
      HEAP32[$147 >> 2] = $67; //@line 5876
      $148 = $ReallocAsyncCtx2 + 76 | 0; //@line 5877
      HEAP32[$148 >> 2] = $$06992; //@line 5878
      $149 = $ReallocAsyncCtx2 + 80 | 0; //@line 5879
      HEAP32[$149 >> 2] = $66; //@line 5880
      sp = STACKTOP; //@line 5881
      return;
     }
     ___async_unwind = 0; //@line 5884
     HEAP32[$ReallocAsyncCtx2 >> 2] = 30; //@line 5885
     $130 = $ReallocAsyncCtx2 + 4 | 0; //@line 5886
     HEAP32[$130 >> 2] = $4; //@line 5887
     $131 = $ReallocAsyncCtx2 + 8 | 0; //@line 5888
     HEAP32[$131 >> 2] = $6; //@line 5889
     $132 = $ReallocAsyncCtx2 + 12 | 0; //@line 5890
     HEAP32[$132 >> 2] = $8; //@line 5891
     $133 = $ReallocAsyncCtx2 + 16 | 0; //@line 5892
     HEAP32[$133 >> 2] = $10; //@line 5893
     $134 = $ReallocAsyncCtx2 + 20 | 0; //@line 5894
     HEAP32[$134 >> 2] = $12; //@line 5895
     $135 = $ReallocAsyncCtx2 + 24 | 0; //@line 5896
     HEAP32[$135 >> 2] = $14; //@line 5897
     $136 = $ReallocAsyncCtx2 + 28 | 0; //@line 5898
     HEAP32[$136 >> 2] = $16; //@line 5899
     $137 = $ReallocAsyncCtx2 + 32 | 0; //@line 5900
     HEAP32[$137 >> 2] = $18; //@line 5901
     $138 = $ReallocAsyncCtx2 + 36 | 0; //@line 5902
     HEAP32[$138 >> 2] = $20; //@line 5903
     $139 = $ReallocAsyncCtx2 + 40 | 0; //@line 5904
     HEAP32[$139 >> 2] = $22; //@line 5905
     $140 = $ReallocAsyncCtx2 + 44 | 0; //@line 5906
     HEAP32[$140 >> 2] = $24; //@line 5907
     $141 = $ReallocAsyncCtx2 + 48 | 0; //@line 5908
     HEAP32[$141 >> 2] = $26; //@line 5909
     $142 = $ReallocAsyncCtx2 + 52 | 0; //@line 5910
     HEAP32[$142 >> 2] = $28; //@line 5911
     $143 = $ReallocAsyncCtx2 + 56 | 0; //@line 5912
     HEAP32[$143 >> 2] = $30; //@line 5913
     $144 = $ReallocAsyncCtx2 + 60 | 0; //@line 5914
     HEAP32[$144 >> 2] = $32; //@line 5915
     $145 = $ReallocAsyncCtx2 + 64 | 0; //@line 5916
     HEAP32[$145 >> 2] = $34; //@line 5917
     $146 = $ReallocAsyncCtx2 + 68 | 0; //@line 5918
     $$expand_i1_val11 = $36 & 1; //@line 5919
     HEAP8[$146 >> 0] = $$expand_i1_val11; //@line 5920
     $147 = $ReallocAsyncCtx2 + 72 | 0; //@line 5921
     HEAP32[$147 >> 2] = $67; //@line 5922
     $148 = $ReallocAsyncCtx2 + 76 | 0; //@line 5923
     HEAP32[$148 >> 2] = $$06992; //@line 5924
     $149 = $ReallocAsyncCtx2 + 80 | 0; //@line 5925
     HEAP32[$149 >> 2] = $66; //@line 5926
     sp = STACKTOP; //@line 5927
     return;
    }
   }
  }
 } while (0);
 $165 = _equeue_tick() | 0; //@line 5933
 if ($36) {
  $166 = $34 - $165 | 0; //@line 5935
  if (($166 | 0) < 1) {
   $168 = $12 + 40 | 0; //@line 5938
   if (HEAP32[$168 >> 2] | 0) {
    _equeue_mutex_lock($4); //@line 5942
    $171 = HEAP32[$168 >> 2] | 0; //@line 5943
    if ($171 | 0) {
     $173 = HEAP32[$10 >> 2] | 0; //@line 5946
     if ($173 | 0) {
      $176 = HEAP32[$12 + 44 >> 2] | 0; //@line 5950
      $179 = (HEAP32[$173 + 20 >> 2] | 0) - $165 | 0; //@line 5953
      $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 5957
      FUNCTION_TABLE_vii[$171 & 3]($176, $179 & ~($179 >> 31)); //@line 5958
      if (___async) {
       HEAP32[$ReallocAsyncCtx3 >> 2] = 31; //@line 5961
       $183 = $ReallocAsyncCtx3 + 4 | 0; //@line 5962
       HEAP32[$183 >> 2] = $22; //@line 5963
       $184 = $ReallocAsyncCtx3 + 8 | 0; //@line 5964
       HEAP32[$184 >> 2] = $4; //@line 5965
       $185 = $ReallocAsyncCtx3 + 12 | 0; //@line 5966
       HEAP32[$185 >> 2] = $24; //@line 5967
       sp = STACKTOP; //@line 5968
       return;
      }
      ___async_unwind = 0; //@line 5971
      HEAP32[$ReallocAsyncCtx3 >> 2] = 31; //@line 5972
      $183 = $ReallocAsyncCtx3 + 4 | 0; //@line 5973
      HEAP32[$183 >> 2] = $22; //@line 5974
      $184 = $ReallocAsyncCtx3 + 8 | 0; //@line 5975
      HEAP32[$184 >> 2] = $4; //@line 5976
      $185 = $ReallocAsyncCtx3 + 12 | 0; //@line 5977
      HEAP32[$185 >> 2] = $24; //@line 5978
      sp = STACKTOP; //@line 5979
      return;
     }
    }
    HEAP8[$22 >> 0] = 1; //@line 5983
    _equeue_mutex_unlock($4); //@line 5984
   }
   HEAP8[$24 >> 0] = 0; //@line 5986
   return;
  } else {
   $$067 = $166; //@line 5989
  }
 } else {
  $$067 = -1; //@line 5992
 }
 _equeue_mutex_lock($4); //@line 5994
 $186 = HEAP32[$10 >> 2] | 0; //@line 5995
 if (!$186) {
  $$2 = $$067; //@line 5998
 } else {
  $190 = (HEAP32[$186 + 20 >> 2] | 0) - $165 | 0; //@line 6002
  $193 = $190 & ~($190 >> 31); //@line 6005
  $$2 = $193 >>> 0 < $$067 >>> 0 ? $193 : $$067; //@line 6008
 }
 _equeue_mutex_unlock($4); //@line 6010
 _equeue_sema_wait($26, $$2) | 0; //@line 6011
 do {
  if (HEAP8[$24 >> 0] | 0) {
   _equeue_mutex_lock($4); //@line 6016
   if (!(HEAP8[$24 >> 0] | 0)) {
    _equeue_mutex_unlock($4); //@line 6020
    break;
   }
   HEAP8[$24 >> 0] = 0; //@line 6023
   _equeue_mutex_unlock($4); //@line 6024
   return;
  }
 } while (0);
 $199 = _equeue_tick() | 0; //@line 6028
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 6029
 _wait_ms(20); //@line 6030
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 32; //@line 6033
  $200 = $ReallocAsyncCtx5 + 4 | 0; //@line 6034
  HEAP32[$200 >> 2] = $199; //@line 6035
  $201 = $ReallocAsyncCtx5 + 8 | 0; //@line 6036
  HEAP32[$201 >> 2] = $4; //@line 6037
  $202 = $ReallocAsyncCtx5 + 12 | 0; //@line 6038
  HEAP32[$202 >> 2] = $6; //@line 6039
  $203 = $ReallocAsyncCtx5 + 16 | 0; //@line 6040
  HEAP32[$203 >> 2] = $8; //@line 6041
  $204 = $ReallocAsyncCtx5 + 20 | 0; //@line 6042
  HEAP32[$204 >> 2] = $10; //@line 6043
  $205 = $ReallocAsyncCtx5 + 24 | 0; //@line 6044
  HEAP32[$205 >> 2] = $12; //@line 6045
  $206 = $ReallocAsyncCtx5 + 28 | 0; //@line 6046
  HEAP32[$206 >> 2] = $14; //@line 6047
  $207 = $ReallocAsyncCtx5 + 32 | 0; //@line 6048
  HEAP32[$207 >> 2] = $16; //@line 6049
  $208 = $ReallocAsyncCtx5 + 36 | 0; //@line 6050
  HEAP32[$208 >> 2] = $18; //@line 6051
  $209 = $ReallocAsyncCtx5 + 40 | 0; //@line 6052
  HEAP32[$209 >> 2] = $20; //@line 6053
  $210 = $ReallocAsyncCtx5 + 44 | 0; //@line 6054
  HEAP32[$210 >> 2] = $22; //@line 6055
  $211 = $ReallocAsyncCtx5 + 48 | 0; //@line 6056
  HEAP32[$211 >> 2] = $24; //@line 6057
  $212 = $ReallocAsyncCtx5 + 52 | 0; //@line 6058
  HEAP32[$212 >> 2] = $26; //@line 6059
  $213 = $ReallocAsyncCtx5 + 56 | 0; //@line 6060
  HEAP32[$213 >> 2] = $28; //@line 6061
  $214 = $ReallocAsyncCtx5 + 60 | 0; //@line 6062
  HEAP32[$214 >> 2] = $30; //@line 6063
  $215 = $ReallocAsyncCtx5 + 64 | 0; //@line 6064
  HEAP32[$215 >> 2] = $32; //@line 6065
  $216 = $ReallocAsyncCtx5 + 68 | 0; //@line 6066
  HEAP32[$216 >> 2] = $34; //@line 6067
  $217 = $ReallocAsyncCtx5 + 72 | 0; //@line 6068
  $$expand_i1_val13 = $36 & 1; //@line 6069
  HEAP8[$217 >> 0] = $$expand_i1_val13; //@line 6070
  sp = STACKTOP; //@line 6071
  return;
 }
 ___async_unwind = 0; //@line 6074
 HEAP32[$ReallocAsyncCtx5 >> 2] = 32; //@line 6075
 $200 = $ReallocAsyncCtx5 + 4 | 0; //@line 6076
 HEAP32[$200 >> 2] = $199; //@line 6077
 $201 = $ReallocAsyncCtx5 + 8 | 0; //@line 6078
 HEAP32[$201 >> 2] = $4; //@line 6079
 $202 = $ReallocAsyncCtx5 + 12 | 0; //@line 6080
 HEAP32[$202 >> 2] = $6; //@line 6081
 $203 = $ReallocAsyncCtx5 + 16 | 0; //@line 6082
 HEAP32[$203 >> 2] = $8; //@line 6083
 $204 = $ReallocAsyncCtx5 + 20 | 0; //@line 6084
 HEAP32[$204 >> 2] = $10; //@line 6085
 $205 = $ReallocAsyncCtx5 + 24 | 0; //@line 6086
 HEAP32[$205 >> 2] = $12; //@line 6087
 $206 = $ReallocAsyncCtx5 + 28 | 0; //@line 6088
 HEAP32[$206 >> 2] = $14; //@line 6089
 $207 = $ReallocAsyncCtx5 + 32 | 0; //@line 6090
 HEAP32[$207 >> 2] = $16; //@line 6091
 $208 = $ReallocAsyncCtx5 + 36 | 0; //@line 6092
 HEAP32[$208 >> 2] = $18; //@line 6093
 $209 = $ReallocAsyncCtx5 + 40 | 0; //@line 6094
 HEAP32[$209 >> 2] = $20; //@line 6095
 $210 = $ReallocAsyncCtx5 + 44 | 0; //@line 6096
 HEAP32[$210 >> 2] = $22; //@line 6097
 $211 = $ReallocAsyncCtx5 + 48 | 0; //@line 6098
 HEAP32[$211 >> 2] = $24; //@line 6099
 $212 = $ReallocAsyncCtx5 + 52 | 0; //@line 6100
 HEAP32[$212 >> 2] = $26; //@line 6101
 $213 = $ReallocAsyncCtx5 + 56 | 0; //@line 6102
 HEAP32[$213 >> 2] = $28; //@line 6103
 $214 = $ReallocAsyncCtx5 + 60 | 0; //@line 6104
 HEAP32[$214 >> 2] = $30; //@line 6105
 $215 = $ReallocAsyncCtx5 + 64 | 0; //@line 6106
 HEAP32[$215 >> 2] = $32; //@line 6107
 $216 = $ReallocAsyncCtx5 + 68 | 0; //@line 6108
 HEAP32[$216 >> 2] = $34; //@line 6109
 $217 = $ReallocAsyncCtx5 + 72 | 0; //@line 6110
 $$expand_i1_val13 = $36 & 1; //@line 6111
 HEAP8[$217 >> 0] = $$expand_i1_val13; //@line 6112
 sp = STACKTOP; //@line 6113
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
 sp = STACKTOP; //@line 9616
 STACKTOP = STACKTOP + 560 | 0; //@line 9617
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 9617
 $6 = sp + 8 | 0; //@line 9618
 $7 = sp; //@line 9619
 $8 = sp + 524 | 0; //@line 9620
 $9 = $8; //@line 9621
 $10 = sp + 512 | 0; //@line 9622
 HEAP32[$7 >> 2] = 0; //@line 9623
 $11 = $10 + 12 | 0; //@line 9624
 ___DOUBLE_BITS_677($1) | 0; //@line 9625
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 9630
  $$0520 = 1; //@line 9630
  $$0521 = 2420; //@line 9630
 } else {
  $$0471 = $1; //@line 9641
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 9641
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 2421 : 2426 : 2423; //@line 9641
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 9643
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 9652
   $31 = $$0520 + 3 | 0; //@line 9657
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 9659
   _out_670($0, $$0521, $$0520); //@line 9660
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 2447 : 2451 : $27 ? 2439 : 2443, 3); //@line 9661
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 9663
   $$sink560 = $31; //@line 9664
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 9667
   $36 = $35 != 0.0; //@line 9668
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 9672
   }
   $39 = $5 | 32; //@line 9674
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 9677
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 9680
    $44 = $$0520 | 2; //@line 9681
    $46 = 12 - $3 | 0; //@line 9683
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 9688
     } else {
      $$0509585 = 8.0; //@line 9690
      $$1508586 = $46; //@line 9690
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 9692
       $$0509585 = $$0509585 * 16.0; //@line 9693
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 9708
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 9713
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 9718
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 9721
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 9724
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 9727
     HEAP8[$68 >> 0] = 48; //@line 9728
     $$0511 = $68; //@line 9729
    } else {
     $$0511 = $66; //@line 9731
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 9738
    $76 = $$0511 + -2 | 0; //@line 9741
    HEAP8[$76 >> 0] = $5 + 15; //@line 9742
    $77 = ($3 | 0) < 1; //@line 9743
    $79 = ($4 & 8 | 0) == 0; //@line 9745
    $$0523 = $8; //@line 9746
    $$2473 = $$1472; //@line 9746
    while (1) {
     $80 = ~~$$2473; //@line 9748
     $86 = $$0523 + 1 | 0; //@line 9754
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[2455 + $80 >> 0]; //@line 9755
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 9758
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 9767
      } else {
       HEAP8[$86 >> 0] = 46; //@line 9770
       $$1524 = $$0523 + 2 | 0; //@line 9771
      }
     } else {
      $$1524 = $86; //@line 9774
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 9778
     }
    }
    $$pre693 = $$1524; //@line 9784
    if (!$3) {
     label = 24; //@line 9786
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 9794
      $$sink = $3 + 2 | 0; //@line 9794
     } else {
      label = 24; //@line 9796
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 9800
     $$pre$phi691Z2D = $101; //@line 9801
     $$sink = $101; //@line 9801
    }
    $104 = $11 - $76 | 0; //@line 9805
    $106 = $104 + $44 + $$sink | 0; //@line 9807
    _pad_676($0, 32, $2, $106, $4); //@line 9808
    _out_670($0, $$0521$, $44); //@line 9809
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 9811
    _out_670($0, $8, $$pre$phi691Z2D); //@line 9812
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 9814
    _out_670($0, $76, $104); //@line 9815
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 9817
    $$sink560 = $106; //@line 9818
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 9822
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 9826
    HEAP32[$7 >> 2] = $113; //@line 9827
    $$3 = $35 * 268435456.0; //@line 9828
    $$pr = $113; //@line 9828
   } else {
    $$3 = $35; //@line 9831
    $$pr = HEAP32[$7 >> 2] | 0; //@line 9831
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 9835
   $$0498 = $$561; //@line 9836
   $$4 = $$3; //@line 9836
   do {
    $116 = ~~$$4 >>> 0; //@line 9838
    HEAP32[$$0498 >> 2] = $116; //@line 9839
    $$0498 = $$0498 + 4 | 0; //@line 9840
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 9843
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 9853
    $$1499662 = $$0498; //@line 9853
    $124 = $$pr; //@line 9853
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 9856
     $$0488655 = $$1499662 + -4 | 0; //@line 9857
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 9860
     } else {
      $$0488657 = $$0488655; //@line 9862
      $$0497656 = 0; //@line 9862
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 9865
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 9867
       $131 = tempRet0; //@line 9868
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 9869
       HEAP32[$$0488657 >> 2] = $132; //@line 9871
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 9872
       $$0488657 = $$0488657 + -4 | 0; //@line 9874
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 9884
      } else {
       $138 = $$1482663 + -4 | 0; //@line 9886
       HEAP32[$138 >> 2] = $$0497656; //@line 9887
       $$2483$ph = $138; //@line 9888
      }
     }
     $$2500 = $$1499662; //@line 9891
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 9897
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 9901
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 9907
     HEAP32[$7 >> 2] = $144; //@line 9908
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 9911
      $$1499662 = $$2500; //@line 9911
      $124 = $144; //@line 9911
     } else {
      $$1482$lcssa = $$2483$ph; //@line 9913
      $$1499$lcssa = $$2500; //@line 9913
      $$pr566 = $144; //@line 9913
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 9918
    $$1499$lcssa = $$0498; //@line 9918
    $$pr566 = $$pr; //@line 9918
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 9924
    $150 = ($39 | 0) == 102; //@line 9925
    $$3484650 = $$1482$lcssa; //@line 9926
    $$3501649 = $$1499$lcssa; //@line 9926
    $152 = $$pr566; //@line 9926
    while (1) {
     $151 = 0 - $152 | 0; //@line 9928
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 9930
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 9934
      $161 = 1e9 >>> $154; //@line 9935
      $$0487644 = 0; //@line 9936
      $$1489643 = $$3484650; //@line 9936
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 9938
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 9942
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 9943
       $$1489643 = $$1489643 + 4 | 0; //@line 9944
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 9955
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 9958
       $$4502 = $$3501649; //@line 9958
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 9961
       $$$3484700 = $$$3484; //@line 9962
       $$4502 = $$3501649 + 4 | 0; //@line 9962
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 9969
      $$4502 = $$3501649; //@line 9969
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 9971
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 9978
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 9980
     HEAP32[$7 >> 2] = $152; //@line 9981
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 9986
      $$3501$lcssa = $$$4502; //@line 9986
      break;
     } else {
      $$3484650 = $$$3484700; //@line 9984
      $$3501649 = $$$4502; //@line 9984
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 9991
    $$3501$lcssa = $$1499$lcssa; //@line 9991
   }
   $185 = $$561; //@line 9994
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 9999
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 10000
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 10003
    } else {
     $$0514639 = $189; //@line 10005
     $$0530638 = 10; //@line 10005
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 10007
      $193 = $$0514639 + 1 | 0; //@line 10008
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 10011
       break;
      } else {
       $$0514639 = $193; //@line 10014
      }
     }
    }
   } else {
    $$1515 = 0; //@line 10019
   }
   $198 = ($39 | 0) == 103; //@line 10024
   $199 = ($$540 | 0) != 0; //@line 10025
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 10028
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 10037
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 10040
    $213 = ($209 | 0) % 9 | 0; //@line 10041
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 10044
     $$1531632 = 10; //@line 10044
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 10047
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 10050
       $$1531632 = $215; //@line 10050
      } else {
       $$1531$lcssa = $215; //@line 10052
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 10057
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 10059
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 10060
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 10063
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 10066
     $$4518 = $$1515; //@line 10066
     $$8 = $$3484$lcssa; //@line 10066
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 10071
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 10072
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 10077
     if (!$$0520) {
      $$1467 = $$$564; //@line 10080
      $$1469 = $$543; //@line 10080
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 10083
      $$1467 = $230 ? -$$$564 : $$$564; //@line 10088
      $$1469 = $230 ? -$$543 : $$543; //@line 10088
     }
     $233 = $217 - $218 | 0; //@line 10090
     HEAP32[$212 >> 2] = $233; //@line 10091
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 10095
      HEAP32[$212 >> 2] = $236; //@line 10096
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 10099
       $$sink547625 = $212; //@line 10099
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 10101
        HEAP32[$$sink547625 >> 2] = 0; //@line 10102
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 10105
         HEAP32[$240 >> 2] = 0; //@line 10106
         $$6 = $240; //@line 10107
        } else {
         $$6 = $$5486626; //@line 10109
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 10112
        HEAP32[$238 >> 2] = $242; //@line 10113
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 10116
         $$sink547625 = $238; //@line 10116
        } else {
         $$5486$lcssa = $$6; //@line 10118
         $$sink547$lcssa = $238; //@line 10118
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 10123
       $$sink547$lcssa = $212; //@line 10123
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 10128
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 10129
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 10132
       $$4518 = $247; //@line 10132
       $$8 = $$5486$lcssa; //@line 10132
      } else {
       $$2516621 = $247; //@line 10134
       $$2532620 = 10; //@line 10134
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 10136
        $251 = $$2516621 + 1 | 0; //@line 10137
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 10140
         $$4518 = $251; //@line 10140
         $$8 = $$5486$lcssa; //@line 10140
         break;
        } else {
         $$2516621 = $251; //@line 10143
        }
       }
      }
     } else {
      $$4492 = $212; //@line 10148
      $$4518 = $$1515; //@line 10148
      $$8 = $$3484$lcssa; //@line 10148
     }
    }
    $253 = $$4492 + 4 | 0; //@line 10151
    $$5519$ph = $$4518; //@line 10154
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 10154
    $$9$ph = $$8; //@line 10154
   } else {
    $$5519$ph = $$1515; //@line 10156
    $$7505$ph = $$3501$lcssa; //@line 10156
    $$9$ph = $$3484$lcssa; //@line 10156
   }
   $$7505 = $$7505$ph; //@line 10158
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 10162
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 10165
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 10169
    } else {
     $$lcssa675 = 1; //@line 10171
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 10175
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 10180
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 10188
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 10188
     } else {
      $$0479 = $5 + -2 | 0; //@line 10192
      $$2476 = $$540$ + -1 | 0; //@line 10192
     }
     $267 = $4 & 8; //@line 10194
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 10199
       if (!$270) {
        $$2529 = 9; //@line 10202
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 10207
         $$3533616 = 10; //@line 10207
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 10209
          $275 = $$1528617 + 1 | 0; //@line 10210
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 10216
           break;
          } else {
           $$1528617 = $275; //@line 10214
          }
         }
        } else {
         $$2529 = 0; //@line 10221
        }
       }
      } else {
       $$2529 = 9; //@line 10225
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 10233
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 10235
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 10237
       $$1480 = $$0479; //@line 10240
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 10240
       $$pre$phi698Z2D = 0; //@line 10240
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 10244
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 10246
       $$1480 = $$0479; //@line 10249
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 10249
       $$pre$phi698Z2D = 0; //@line 10249
       break;
      }
     } else {
      $$1480 = $$0479; //@line 10253
      $$3477 = $$2476; //@line 10253
      $$pre$phi698Z2D = $267; //@line 10253
     }
    } else {
     $$1480 = $5; //@line 10257
     $$3477 = $$540; //@line 10257
     $$pre$phi698Z2D = $4 & 8; //@line 10257
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 10260
   $294 = ($292 | 0) != 0 & 1; //@line 10262
   $296 = ($$1480 | 32 | 0) == 102; //@line 10264
   if ($296) {
    $$2513 = 0; //@line 10268
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 10268
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 10271
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 10274
    $304 = $11; //@line 10275
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 10280
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 10282
      HEAP8[$308 >> 0] = 48; //@line 10283
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 10288
      } else {
       $$1512$lcssa = $308; //@line 10290
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 10295
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 10302
    $318 = $$1512$lcssa + -2 | 0; //@line 10304
    HEAP8[$318 >> 0] = $$1480; //@line 10305
    $$2513 = $318; //@line 10308
    $$pn = $304 - $318 | 0; //@line 10308
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 10313
   _pad_676($0, 32, $2, $323, $4); //@line 10314
   _out_670($0, $$0521, $$0520); //@line 10315
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 10317
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 10320
    $326 = $8 + 9 | 0; //@line 10321
    $327 = $326; //@line 10322
    $328 = $8 + 8 | 0; //@line 10323
    $$5493600 = $$0496$$9; //@line 10324
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 10327
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 10332
       $$1465 = $328; //@line 10333
      } else {
       $$1465 = $330; //@line 10335
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 10342
       $$0464597 = $330; //@line 10343
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 10345
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 10348
        } else {
         $$1465 = $335; //@line 10350
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 10355
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 10360
     $$5493600 = $$5493600 + 4 | 0; //@line 10361
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 2471, 1); //@line 10371
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 10377
     $$6494592 = $$5493600; //@line 10377
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 10380
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 10385
       $$0463587 = $347; //@line 10386
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 10388
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 10391
        } else {
         $$0463$lcssa = $351; //@line 10393
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 10398
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 10402
      $$6494592 = $$6494592 + 4 | 0; //@line 10403
      $356 = $$4478593 + -9 | 0; //@line 10404
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 10411
       break;
      } else {
       $$4478593 = $356; //@line 10409
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 10416
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 10419
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 10422
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 10425
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 10426
     $365 = $363; //@line 10427
     $366 = 0 - $9 | 0; //@line 10428
     $367 = $8 + 8 | 0; //@line 10429
     $$5605 = $$3477; //@line 10430
     $$7495604 = $$9$ph; //@line 10430
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 10433
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 10436
       $$0 = $367; //@line 10437
      } else {
       $$0 = $369; //@line 10439
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 10444
        _out_670($0, $$0, 1); //@line 10445
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 10449
         break;
        }
        _out_670($0, 2471, 1); //@line 10452
        $$2 = $375; //@line 10453
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 10457
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 10462
        $$1601 = $$0; //@line 10463
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 10465
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 10468
         } else {
          $$2 = $373; //@line 10470
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 10477
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 10480
      $381 = $$5605 - $378 | 0; //@line 10481
      $$7495604 = $$7495604 + 4 | 0; //@line 10482
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 10489
       break;
      } else {
       $$5605 = $381; //@line 10487
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 10494
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 10497
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 10501
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 10504
   $$sink560 = $323; //@line 10505
  }
 } while (0);
 STACKTOP = sp; //@line 10510
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 10510
}
function _equeue_dispatch__async_cb($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$067 = 0, $$06992$reg2mem$0 = 0, $$06992$reg2mem$0$phi = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val31 = 0, $$expand_i1_val33 = 0, $$expand_i1_val35 = 0, $$reg2mem$0 = 0, $$reg2mem24$0 = 0, $$sink$in$i$i = 0, $10 = 0, $102 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $127 = 0, $128 = 0, $129 = 0, $131 = 0, $132 = 0, $14 = 0, $140 = 0, $141 = 0, $143 = 0, $146 = 0, $148 = 0, $151 = 0, $154 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $165 = 0, $168 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $190 = 0, $191 = 0, $192 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $30 = 0, $32 = 0, $34 = 0, $38 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $70 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3541
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3543
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3545
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3547
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3549
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3551
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3553
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3555
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3557
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3559
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 3561
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 3563
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 3565
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 3571
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 3573
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 3575
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 3579
 $40 = HEAP8[$0 + 80 >> 0] & 1; //@line 3582
 $$06992$reg2mem$0 = HEAP32[$0 + 56 >> 2] | 0; //@line 3583
 $$reg2mem$0 = HEAP32[$0 + 52 >> 2] | 0; //@line 3583
 $$reg2mem24$0 = HEAP32[$0 + 72 >> 2] | 0; //@line 3583
 while (1) {
  $68 = HEAP32[$$06992$reg2mem$0 + 24 >> 2] | 0; //@line 3586
  if (($68 | 0) > -1) {
   label = 8; //@line 3589
   break;
  }
  $92 = $$06992$reg2mem$0 + 4 | 0; //@line 3593
  $93 = HEAP8[$92 >> 0] | 0; //@line 3594
  HEAP8[$92 >> 0] = (($93 + 1 & 255) << HEAP32[$30 >> 2] | 0) == 0 ? 1 : ($93 & 255) + 1 & 255; //@line 3603
  $102 = HEAP32[$$06992$reg2mem$0 + 28 >> 2] | 0; //@line 3605
  if ($102 | 0) {
   label = 12; //@line 3608
   break;
  }
  _equeue_mutex_lock($32); //@line 3611
  $125 = HEAP32[$34 >> 2] | 0; //@line 3612
  L6 : do {
   if (!$125) {
    $$02329$i$i = $34; //@line 3616
    label = 21; //@line 3617
   } else {
    $127 = HEAP32[$$06992$reg2mem$0 >> 2] | 0; //@line 3619
    $$025$i$i = $34; //@line 3620
    $129 = $125; //@line 3620
    while (1) {
     $128 = HEAP32[$129 >> 2] | 0; //@line 3622
     if ($128 >>> 0 >= $127 >>> 0) {
      break;
     }
     $131 = $129 + 8 | 0; //@line 3627
     $132 = HEAP32[$131 >> 2] | 0; //@line 3628
     if (!$132) {
      $$02329$i$i = $131; //@line 3631
      label = 21; //@line 3632
      break L6;
     } else {
      $$025$i$i = $131; //@line 3635
      $129 = $132; //@line 3635
     }
    }
    if (($128 | 0) == ($127 | 0)) {
     HEAP32[$$06992$reg2mem$0 + 12 >> 2] = $129; //@line 3641
     $$02330$i$i = $$025$i$i; //@line 3644
     $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 3644
    } else {
     $$02329$i$i = $$025$i$i; //@line 3646
     label = 21; //@line 3647
    }
   }
  } while (0);
  if ((label | 0) == 21) {
   label = 0; //@line 3652
   HEAP32[$$06992$reg2mem$0 + 12 >> 2] = 0; //@line 3654
   $$02330$i$i = $$02329$i$i; //@line 3655
   $$sink$in$i$i = $$02329$i$i; //@line 3655
  }
  HEAP32[$$reg2mem24$0 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 3658
  HEAP32[$$02330$i$i >> 2] = $$06992$reg2mem$0; //@line 3659
  _equeue_mutex_unlock($32); //@line 3660
  if (!$$reg2mem$0) {
   label = 24; //@line 3663
   break;
  }
  $41 = $$reg2mem$0 + 8 | 0; //@line 3666
  $42 = HEAP32[$41 >> 2] | 0; //@line 3667
  $44 = HEAP32[$$reg2mem$0 + 32 >> 2] | 0; //@line 3669
  if (!$44) {
   $$06992$reg2mem$0$phi = $$reg2mem$0; //@line 3672
   $$reg2mem$0 = $42; //@line 3672
   $$reg2mem24$0 = $41; //@line 3672
   $$06992$reg2mem$0 = $$06992$reg2mem$0$phi; //@line 3672
  } else {
   label = 3; //@line 3674
   break;
  }
 }
 if ((label | 0) == 3) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 3680
  FUNCTION_TABLE_vi[$44 & 255]($$reg2mem$0 + 36 | 0); //@line 3681
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 3684
   $47 = $ReallocAsyncCtx + 4 | 0; //@line 3685
   HEAP32[$47 >> 2] = $2; //@line 3686
   $48 = $ReallocAsyncCtx + 8 | 0; //@line 3687
   HEAP32[$48 >> 2] = $4; //@line 3688
   $49 = $ReallocAsyncCtx + 12 | 0; //@line 3689
   HEAP32[$49 >> 2] = $6; //@line 3690
   $50 = $ReallocAsyncCtx + 16 | 0; //@line 3691
   HEAP32[$50 >> 2] = $8; //@line 3692
   $51 = $ReallocAsyncCtx + 20 | 0; //@line 3693
   HEAP32[$51 >> 2] = $10; //@line 3694
   $52 = $ReallocAsyncCtx + 24 | 0; //@line 3695
   HEAP32[$52 >> 2] = $12; //@line 3696
   $53 = $ReallocAsyncCtx + 28 | 0; //@line 3697
   HEAP32[$53 >> 2] = $14; //@line 3698
   $54 = $ReallocAsyncCtx + 32 | 0; //@line 3699
   HEAP32[$54 >> 2] = $16; //@line 3700
   $55 = $ReallocAsyncCtx + 36 | 0; //@line 3701
   HEAP32[$55 >> 2] = $18; //@line 3702
   $56 = $ReallocAsyncCtx + 40 | 0; //@line 3703
   HEAP32[$56 >> 2] = $20; //@line 3704
   $57 = $ReallocAsyncCtx + 44 | 0; //@line 3705
   HEAP32[$57 >> 2] = $22; //@line 3706
   $58 = $ReallocAsyncCtx + 48 | 0; //@line 3707
   HEAP32[$58 >> 2] = $24; //@line 3708
   $59 = $ReallocAsyncCtx + 52 | 0; //@line 3709
   HEAP32[$59 >> 2] = $42; //@line 3710
   $60 = $ReallocAsyncCtx + 56 | 0; //@line 3711
   HEAP32[$60 >> 2] = $$reg2mem$0; //@line 3712
   $61 = $ReallocAsyncCtx + 60 | 0; //@line 3713
   HEAP32[$61 >> 2] = $30; //@line 3714
   $62 = $ReallocAsyncCtx + 64 | 0; //@line 3715
   HEAP32[$62 >> 2] = $32; //@line 3716
   $63 = $ReallocAsyncCtx + 68 | 0; //@line 3717
   HEAP32[$63 >> 2] = $34; //@line 3718
   $64 = $ReallocAsyncCtx + 72 | 0; //@line 3719
   HEAP32[$64 >> 2] = $41; //@line 3720
   $65 = $ReallocAsyncCtx + 76 | 0; //@line 3721
   HEAP32[$65 >> 2] = $38; //@line 3722
   $66 = $ReallocAsyncCtx + 80 | 0; //@line 3723
   $$expand_i1_val = $40 & 1; //@line 3724
   HEAP8[$66 >> 0] = $$expand_i1_val; //@line 3725
   sp = STACKTOP; //@line 3726
   return;
  }
  ___async_unwind = 0; //@line 3729
  HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 3730
  $47 = $ReallocAsyncCtx + 4 | 0; //@line 3731
  HEAP32[$47 >> 2] = $2; //@line 3732
  $48 = $ReallocAsyncCtx + 8 | 0; //@line 3733
  HEAP32[$48 >> 2] = $4; //@line 3734
  $49 = $ReallocAsyncCtx + 12 | 0; //@line 3735
  HEAP32[$49 >> 2] = $6; //@line 3736
  $50 = $ReallocAsyncCtx + 16 | 0; //@line 3737
  HEAP32[$50 >> 2] = $8; //@line 3738
  $51 = $ReallocAsyncCtx + 20 | 0; //@line 3739
  HEAP32[$51 >> 2] = $10; //@line 3740
  $52 = $ReallocAsyncCtx + 24 | 0; //@line 3741
  HEAP32[$52 >> 2] = $12; //@line 3742
  $53 = $ReallocAsyncCtx + 28 | 0; //@line 3743
  HEAP32[$53 >> 2] = $14; //@line 3744
  $54 = $ReallocAsyncCtx + 32 | 0; //@line 3745
  HEAP32[$54 >> 2] = $16; //@line 3746
  $55 = $ReallocAsyncCtx + 36 | 0; //@line 3747
  HEAP32[$55 >> 2] = $18; //@line 3748
  $56 = $ReallocAsyncCtx + 40 | 0; //@line 3749
  HEAP32[$56 >> 2] = $20; //@line 3750
  $57 = $ReallocAsyncCtx + 44 | 0; //@line 3751
  HEAP32[$57 >> 2] = $22; //@line 3752
  $58 = $ReallocAsyncCtx + 48 | 0; //@line 3753
  HEAP32[$58 >> 2] = $24; //@line 3754
  $59 = $ReallocAsyncCtx + 52 | 0; //@line 3755
  HEAP32[$59 >> 2] = $42; //@line 3756
  $60 = $ReallocAsyncCtx + 56 | 0; //@line 3757
  HEAP32[$60 >> 2] = $$reg2mem$0; //@line 3758
  $61 = $ReallocAsyncCtx + 60 | 0; //@line 3759
  HEAP32[$61 >> 2] = $30; //@line 3760
  $62 = $ReallocAsyncCtx + 64 | 0; //@line 3761
  HEAP32[$62 >> 2] = $32; //@line 3762
  $63 = $ReallocAsyncCtx + 68 | 0; //@line 3763
  HEAP32[$63 >> 2] = $34; //@line 3764
  $64 = $ReallocAsyncCtx + 72 | 0; //@line 3765
  HEAP32[$64 >> 2] = $41; //@line 3766
  $65 = $ReallocAsyncCtx + 76 | 0; //@line 3767
  HEAP32[$65 >> 2] = $38; //@line 3768
  $66 = $ReallocAsyncCtx + 80 | 0; //@line 3769
  $$expand_i1_val = $40 & 1; //@line 3770
  HEAP8[$66 >> 0] = $$expand_i1_val; //@line 3771
  sp = STACKTOP; //@line 3772
  return;
 } else if ((label | 0) == 8) {
  $70 = $$06992$reg2mem$0 + 20 | 0; //@line 3776
  HEAP32[$70 >> 2] = (HEAP32[$70 >> 2] | 0) + $68; //@line 3779
  $73 = _equeue_tick() | 0; //@line 3780
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 3781
  _equeue_enqueue($10, $$06992$reg2mem$0, $73) | 0; //@line 3782
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 3785
   $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 3786
   HEAP32[$74 >> 2] = $2; //@line 3787
   $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 3788
   HEAP32[$75 >> 2] = $4; //@line 3789
   $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 3790
   HEAP32[$76 >> 2] = $6; //@line 3791
   $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 3792
   HEAP32[$77 >> 2] = $8; //@line 3793
   $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 3794
   HEAP32[$78 >> 2] = $10; //@line 3795
   $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 3796
   HEAP32[$79 >> 2] = $12; //@line 3797
   $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 3798
   HEAP32[$80 >> 2] = $14; //@line 3799
   $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 3800
   HEAP32[$81 >> 2] = $16; //@line 3801
   $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 3802
   HEAP32[$82 >> 2] = $18; //@line 3803
   $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 3804
   HEAP32[$83 >> 2] = $20; //@line 3805
   $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 3806
   HEAP32[$84 >> 2] = $22; //@line 3807
   $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 3808
   HEAP32[$85 >> 2] = $24; //@line 3809
   $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 3810
   HEAP32[$86 >> 2] = $30; //@line 3811
   $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 3812
   HEAP32[$87 >> 2] = $32; //@line 3813
   $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 3814
   HEAP32[$88 >> 2] = $34; //@line 3815
   $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 3816
   HEAP32[$89 >> 2] = $38; //@line 3817
   $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 3818
   $$expand_i1_val31 = $40 & 1; //@line 3819
   HEAP8[$90 >> 0] = $$expand_i1_val31; //@line 3820
   $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 3821
   HEAP32[$91 >> 2] = $$reg2mem$0; //@line 3822
   sp = STACKTOP; //@line 3823
   return;
  }
  ___async_unwind = 0; //@line 3826
  HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 3827
  $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 3828
  HEAP32[$74 >> 2] = $2; //@line 3829
  $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 3830
  HEAP32[$75 >> 2] = $4; //@line 3831
  $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 3832
  HEAP32[$76 >> 2] = $6; //@line 3833
  $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 3834
  HEAP32[$77 >> 2] = $8; //@line 3835
  $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 3836
  HEAP32[$78 >> 2] = $10; //@line 3837
  $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 3838
  HEAP32[$79 >> 2] = $12; //@line 3839
  $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 3840
  HEAP32[$80 >> 2] = $14; //@line 3841
  $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 3842
  HEAP32[$81 >> 2] = $16; //@line 3843
  $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 3844
  HEAP32[$82 >> 2] = $18; //@line 3845
  $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 3846
  HEAP32[$83 >> 2] = $20; //@line 3847
  $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 3848
  HEAP32[$84 >> 2] = $22; //@line 3849
  $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 3850
  HEAP32[$85 >> 2] = $24; //@line 3851
  $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 3852
  HEAP32[$86 >> 2] = $30; //@line 3853
  $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 3854
  HEAP32[$87 >> 2] = $32; //@line 3855
  $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 3856
  HEAP32[$88 >> 2] = $34; //@line 3857
  $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 3858
  HEAP32[$89 >> 2] = $38; //@line 3859
  $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 3860
  $$expand_i1_val31 = $40 & 1; //@line 3861
  HEAP8[$90 >> 0] = $$expand_i1_val31; //@line 3862
  $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 3863
  HEAP32[$91 >> 2] = $$reg2mem$0; //@line 3864
  sp = STACKTOP; //@line 3865
  return;
 } else if ((label | 0) == 12) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 3870
  FUNCTION_TABLE_vi[$102 & 255]($$06992$reg2mem$0 + 36 | 0); //@line 3871
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 30; //@line 3874
   $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 3875
   HEAP32[$105 >> 2] = $2; //@line 3876
   $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 3877
   HEAP32[$106 >> 2] = $4; //@line 3878
   $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 3879
   HEAP32[$107 >> 2] = $6; //@line 3880
   $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 3881
   HEAP32[$108 >> 2] = $8; //@line 3882
   $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 3883
   HEAP32[$109 >> 2] = $10; //@line 3884
   $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 3885
   HEAP32[$110 >> 2] = $12; //@line 3886
   $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 3887
   HEAP32[$111 >> 2] = $14; //@line 3888
   $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 3889
   HEAP32[$112 >> 2] = $16; //@line 3890
   $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 3891
   HEAP32[$113 >> 2] = $18; //@line 3892
   $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 3893
   HEAP32[$114 >> 2] = $20; //@line 3894
   $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 3895
   HEAP32[$115 >> 2] = $22; //@line 3896
   $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 3897
   HEAP32[$116 >> 2] = $24; //@line 3898
   $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 3899
   HEAP32[$117 >> 2] = $30; //@line 3900
   $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 3901
   HEAP32[$118 >> 2] = $32; //@line 3902
   $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 3903
   HEAP32[$119 >> 2] = $34; //@line 3904
   $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 3905
   HEAP32[$120 >> 2] = $38; //@line 3906
   $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 3907
   $$expand_i1_val33 = $40 & 1; //@line 3908
   HEAP8[$121 >> 0] = $$expand_i1_val33; //@line 3909
   $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 3910
   HEAP32[$122 >> 2] = $$reg2mem$0; //@line 3911
   $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 3912
   HEAP32[$123 >> 2] = $$06992$reg2mem$0; //@line 3913
   $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 3914
   HEAP32[$124 >> 2] = $$reg2mem24$0; //@line 3915
   sp = STACKTOP; //@line 3916
   return;
  }
  ___async_unwind = 0; //@line 3919
  HEAP32[$ReallocAsyncCtx2 >> 2] = 30; //@line 3920
  $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 3921
  HEAP32[$105 >> 2] = $2; //@line 3922
  $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 3923
  HEAP32[$106 >> 2] = $4; //@line 3924
  $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 3925
  HEAP32[$107 >> 2] = $6; //@line 3926
  $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 3927
  HEAP32[$108 >> 2] = $8; //@line 3928
  $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 3929
  HEAP32[$109 >> 2] = $10; //@line 3930
  $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 3931
  HEAP32[$110 >> 2] = $12; //@line 3932
  $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 3933
  HEAP32[$111 >> 2] = $14; //@line 3934
  $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 3935
  HEAP32[$112 >> 2] = $16; //@line 3936
  $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 3937
  HEAP32[$113 >> 2] = $18; //@line 3938
  $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 3939
  HEAP32[$114 >> 2] = $20; //@line 3940
  $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 3941
  HEAP32[$115 >> 2] = $22; //@line 3942
  $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 3943
  HEAP32[$116 >> 2] = $24; //@line 3944
  $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 3945
  HEAP32[$117 >> 2] = $30; //@line 3946
  $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 3947
  HEAP32[$118 >> 2] = $32; //@line 3948
  $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 3949
  HEAP32[$119 >> 2] = $34; //@line 3950
  $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 3951
  HEAP32[$120 >> 2] = $38; //@line 3952
  $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 3953
  $$expand_i1_val33 = $40 & 1; //@line 3954
  HEAP8[$121 >> 0] = $$expand_i1_val33; //@line 3955
  $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 3956
  HEAP32[$122 >> 2] = $$reg2mem$0; //@line 3957
  $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 3958
  HEAP32[$123 >> 2] = $$06992$reg2mem$0; //@line 3959
  $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 3960
  HEAP32[$124 >> 2] = $$reg2mem24$0; //@line 3961
  sp = STACKTOP; //@line 3962
  return;
 } else if ((label | 0) == 24) {
  $140 = _equeue_tick() | 0; //@line 3966
  if ($40) {
   $141 = $38 - $140 | 0; //@line 3968
   if (($141 | 0) < 1) {
    $143 = $10 + 40 | 0; //@line 3971
    if (HEAP32[$143 >> 2] | 0) {
     _equeue_mutex_lock($2); //@line 3975
     $146 = HEAP32[$143 >> 2] | 0; //@line 3976
     if ($146 | 0) {
      $148 = HEAP32[$8 >> 2] | 0; //@line 3979
      if ($148 | 0) {
       $151 = HEAP32[$10 + 44 >> 2] | 0; //@line 3983
       $154 = (HEAP32[$148 + 20 >> 2] | 0) - $140 | 0; //@line 3986
       $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 3990
       FUNCTION_TABLE_vii[$146 & 3]($151, $154 & ~($154 >> 31)); //@line 3991
       if (___async) {
        HEAP32[$ReallocAsyncCtx3 >> 2] = 31; //@line 3994
        $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 3995
        HEAP32[$158 >> 2] = $20; //@line 3996
        $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 3997
        HEAP32[$159 >> 2] = $2; //@line 3998
        $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 3999
        HEAP32[$160 >> 2] = $22; //@line 4000
        sp = STACKTOP; //@line 4001
        return;
       }
       ___async_unwind = 0; //@line 4004
       HEAP32[$ReallocAsyncCtx3 >> 2] = 31; //@line 4005
       $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 4006
       HEAP32[$158 >> 2] = $20; //@line 4007
       $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 4008
       HEAP32[$159 >> 2] = $2; //@line 4009
       $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 4010
       HEAP32[$160 >> 2] = $22; //@line 4011
       sp = STACKTOP; //@line 4012
       return;
      }
     }
     HEAP8[$20 >> 0] = 1; //@line 4016
     _equeue_mutex_unlock($2); //@line 4017
    }
    HEAP8[$22 >> 0] = 0; //@line 4019
    return;
   } else {
    $$067 = $141; //@line 4022
   }
  } else {
   $$067 = -1; //@line 4025
  }
  _equeue_mutex_lock($2); //@line 4027
  $161 = HEAP32[$8 >> 2] | 0; //@line 4028
  if (!$161) {
   $$2 = $$067; //@line 4031
  } else {
   $165 = (HEAP32[$161 + 20 >> 2] | 0) - $140 | 0; //@line 4035
   $168 = $165 & ~($165 >> 31); //@line 4038
   $$2 = $168 >>> 0 < $$067 >>> 0 ? $168 : $$067; //@line 4041
  }
  _equeue_mutex_unlock($2); //@line 4043
  _equeue_sema_wait($24, $$2) | 0; //@line 4044
  do {
   if (HEAP8[$22 >> 0] | 0) {
    _equeue_mutex_lock($2); //@line 4049
    if (!(HEAP8[$22 >> 0] | 0)) {
     _equeue_mutex_unlock($2); //@line 4053
     break;
    }
    HEAP8[$22 >> 0] = 0; //@line 4056
    _equeue_mutex_unlock($2); //@line 4057
    return;
   }
  } while (0);
  $174 = _equeue_tick() | 0; //@line 4061
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 4062
  _wait_ms(20); //@line 4063
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 32; //@line 4066
   $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 4067
   HEAP32[$175 >> 2] = $174; //@line 4068
   $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 4069
   HEAP32[$176 >> 2] = $2; //@line 4070
   $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 4071
   HEAP32[$177 >> 2] = $4; //@line 4072
   $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 4073
   HEAP32[$178 >> 2] = $6; //@line 4074
   $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 4075
   HEAP32[$179 >> 2] = $8; //@line 4076
   $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 4077
   HEAP32[$180 >> 2] = $10; //@line 4078
   $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 4079
   HEAP32[$181 >> 2] = $12; //@line 4080
   $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 4081
   HEAP32[$182 >> 2] = $14; //@line 4082
   $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 4083
   HEAP32[$183 >> 2] = $16; //@line 4084
   $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 4085
   HEAP32[$184 >> 2] = $18; //@line 4086
   $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 4087
   HEAP32[$185 >> 2] = $20; //@line 4088
   $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 4089
   HEAP32[$186 >> 2] = $22; //@line 4090
   $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 4091
   HEAP32[$187 >> 2] = $24; //@line 4092
   $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 4093
   HEAP32[$188 >> 2] = $30; //@line 4094
   $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 4095
   HEAP32[$189 >> 2] = $32; //@line 4096
   $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 4097
   HEAP32[$190 >> 2] = $34; //@line 4098
   $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 4099
   HEAP32[$191 >> 2] = $38; //@line 4100
   $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 4101
   $$expand_i1_val35 = $40 & 1; //@line 4102
   HEAP8[$192 >> 0] = $$expand_i1_val35; //@line 4103
   sp = STACKTOP; //@line 4104
   return;
  }
  ___async_unwind = 0; //@line 4107
  HEAP32[$ReallocAsyncCtx5 >> 2] = 32; //@line 4108
  $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 4109
  HEAP32[$175 >> 2] = $174; //@line 4110
  $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 4111
  HEAP32[$176 >> 2] = $2; //@line 4112
  $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 4113
  HEAP32[$177 >> 2] = $4; //@line 4114
  $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 4115
  HEAP32[$178 >> 2] = $6; //@line 4116
  $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 4117
  HEAP32[$179 >> 2] = $8; //@line 4118
  $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 4119
  HEAP32[$180 >> 2] = $10; //@line 4120
  $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 4121
  HEAP32[$181 >> 2] = $12; //@line 4122
  $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 4123
  HEAP32[$182 >> 2] = $14; //@line 4124
  $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 4125
  HEAP32[$183 >> 2] = $16; //@line 4126
  $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 4127
  HEAP32[$184 >> 2] = $18; //@line 4128
  $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 4129
  HEAP32[$185 >> 2] = $20; //@line 4130
  $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 4131
  HEAP32[$186 >> 2] = $22; //@line 4132
  $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 4133
  HEAP32[$187 >> 2] = $24; //@line 4134
  $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 4135
  HEAP32[$188 >> 2] = $30; //@line 4136
  $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 4137
  HEAP32[$189 >> 2] = $32; //@line 4138
  $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 4139
  HEAP32[$190 >> 2] = $34; //@line 4140
  $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 4141
  HEAP32[$191 >> 2] = $38; //@line 4142
  $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 4143
  $$expand_i1_val35 = $40 & 1; //@line 4144
  HEAP8[$192 >> 0] = $$expand_i1_val35; //@line 4145
  sp = STACKTOP; //@line 4146
  return;
 }
}
function _equeue_dispatch__async_cb_58($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$067 = 0, $$06992$reg2mem$0 = 0, $$06992$reg2mem$0$phi = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val31 = 0, $$expand_i1_val33 = 0, $$expand_i1_val35 = 0, $$reg2mem$0 = 0, $$reg2mem24$0 = 0, $$sink$in$i$i = 0, $10 = 0, $102 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $127 = 0, $128 = 0, $129 = 0, $131 = 0, $132 = 0, $14 = 0, $140 = 0, $141 = 0, $143 = 0, $146 = 0, $148 = 0, $151 = 0, $154 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $165 = 0, $168 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $190 = 0, $191 = 0, $192 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $4 = 0, $42 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $70 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4164
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4166
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4168
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4170
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4172
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4174
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4176
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4178
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4180
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4182
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 4184
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 4186
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 4188
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 4190
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 4192
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 4194
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 4196
 $34 = HEAP8[$0 + 68 >> 0] & 1; //@line 4199
 $$06992$reg2mem$0 = HEAP32[$0 + 76 >> 2] | 0; //@line 4206
 $$reg2mem$0 = HEAP32[$0 + 72 >> 2] | 0; //@line 4206
 $$reg2mem24$0 = HEAP32[$0 + 80 >> 2] | 0; //@line 4206
 while (1) {
  _equeue_mutex_lock($28); //@line 4208
  $125 = HEAP32[$30 >> 2] | 0; //@line 4209
  L4 : do {
   if (!$125) {
    $$02329$i$i = $30; //@line 4213
    label = 21; //@line 4214
   } else {
    $127 = HEAP32[$$06992$reg2mem$0 >> 2] | 0; //@line 4216
    $$025$i$i = $30; //@line 4217
    $129 = $125; //@line 4217
    while (1) {
     $128 = HEAP32[$129 >> 2] | 0; //@line 4219
     if ($128 >>> 0 >= $127 >>> 0) {
      break;
     }
     $131 = $129 + 8 | 0; //@line 4224
     $132 = HEAP32[$131 >> 2] | 0; //@line 4225
     if (!$132) {
      $$02329$i$i = $131; //@line 4228
      label = 21; //@line 4229
      break L4;
     } else {
      $$025$i$i = $131; //@line 4232
      $129 = $132; //@line 4232
     }
    }
    if (($128 | 0) == ($127 | 0)) {
     HEAP32[$$06992$reg2mem$0 + 12 >> 2] = $129; //@line 4238
     $$02330$i$i = $$025$i$i; //@line 4241
     $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 4241
    } else {
     $$02329$i$i = $$025$i$i; //@line 4243
     label = 21; //@line 4244
    }
   }
  } while (0);
  if ((label | 0) == 21) {
   label = 0; //@line 4249
   HEAP32[$$06992$reg2mem$0 + 12 >> 2] = 0; //@line 4251
   $$02330$i$i = $$02329$i$i; //@line 4252
   $$sink$in$i$i = $$02329$i$i; //@line 4252
  }
  HEAP32[$$reg2mem24$0 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 4255
  HEAP32[$$02330$i$i >> 2] = $$06992$reg2mem$0; //@line 4256
  _equeue_mutex_unlock($28); //@line 4257
  if (!$$reg2mem$0) {
   label = 24; //@line 4260
   break;
  }
  $$reg2mem24$0 = $$reg2mem$0 + 8 | 0; //@line 4263
  $42 = HEAP32[$$reg2mem24$0 >> 2] | 0; //@line 4264
  $44 = HEAP32[$$reg2mem$0 + 32 >> 2] | 0; //@line 4266
  if ($44 | 0) {
   label = 3; //@line 4269
   break;
  }
  $68 = HEAP32[$$reg2mem$0 + 24 >> 2] | 0; //@line 4273
  if (($68 | 0) > -1) {
   label = 7; //@line 4276
   break;
  }
  $92 = $$reg2mem$0 + 4 | 0; //@line 4280
  $93 = HEAP8[$92 >> 0] | 0; //@line 4281
  HEAP8[$92 >> 0] = (($93 + 1 & 255) << HEAP32[$26 >> 2] | 0) == 0 ? 1 : ($93 & 255) + 1 & 255; //@line 4290
  $102 = HEAP32[$$reg2mem$0 + 28 >> 2] | 0; //@line 4292
  if ($102 | 0) {
   label = 11; //@line 4297
   break;
  } else {
   $$06992$reg2mem$0$phi = $$reg2mem$0; //@line 4295
   $$reg2mem$0 = $42; //@line 4295
   $$06992$reg2mem$0 = $$06992$reg2mem$0$phi; //@line 4295
  }
 }
 if ((label | 0) == 3) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 4303
  FUNCTION_TABLE_vi[$44 & 255]($$reg2mem$0 + 36 | 0); //@line 4304
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 4307
   $47 = $ReallocAsyncCtx + 4 | 0; //@line 4308
   HEAP32[$47 >> 2] = $2; //@line 4309
   $48 = $ReallocAsyncCtx + 8 | 0; //@line 4310
   HEAP32[$48 >> 2] = $4; //@line 4311
   $49 = $ReallocAsyncCtx + 12 | 0; //@line 4312
   HEAP32[$49 >> 2] = $6; //@line 4313
   $50 = $ReallocAsyncCtx + 16 | 0; //@line 4314
   HEAP32[$50 >> 2] = $8; //@line 4315
   $51 = $ReallocAsyncCtx + 20 | 0; //@line 4316
   HEAP32[$51 >> 2] = $10; //@line 4317
   $52 = $ReallocAsyncCtx + 24 | 0; //@line 4318
   HEAP32[$52 >> 2] = $12; //@line 4319
   $53 = $ReallocAsyncCtx + 28 | 0; //@line 4320
   HEAP32[$53 >> 2] = $14; //@line 4321
   $54 = $ReallocAsyncCtx + 32 | 0; //@line 4322
   HEAP32[$54 >> 2] = $16; //@line 4323
   $55 = $ReallocAsyncCtx + 36 | 0; //@line 4324
   HEAP32[$55 >> 2] = $18; //@line 4325
   $56 = $ReallocAsyncCtx + 40 | 0; //@line 4326
   HEAP32[$56 >> 2] = $20; //@line 4327
   $57 = $ReallocAsyncCtx + 44 | 0; //@line 4328
   HEAP32[$57 >> 2] = $22; //@line 4329
   $58 = $ReallocAsyncCtx + 48 | 0; //@line 4330
   HEAP32[$58 >> 2] = $24; //@line 4331
   $59 = $ReallocAsyncCtx + 52 | 0; //@line 4332
   HEAP32[$59 >> 2] = $42; //@line 4333
   $60 = $ReallocAsyncCtx + 56 | 0; //@line 4334
   HEAP32[$60 >> 2] = $$reg2mem$0; //@line 4335
   $61 = $ReallocAsyncCtx + 60 | 0; //@line 4336
   HEAP32[$61 >> 2] = $26; //@line 4337
   $62 = $ReallocAsyncCtx + 64 | 0; //@line 4338
   HEAP32[$62 >> 2] = $28; //@line 4339
   $63 = $ReallocAsyncCtx + 68 | 0; //@line 4340
   HEAP32[$63 >> 2] = $30; //@line 4341
   $64 = $ReallocAsyncCtx + 72 | 0; //@line 4342
   HEAP32[$64 >> 2] = $$reg2mem24$0; //@line 4343
   $65 = $ReallocAsyncCtx + 76 | 0; //@line 4344
   HEAP32[$65 >> 2] = $32; //@line 4345
   $66 = $ReallocAsyncCtx + 80 | 0; //@line 4346
   $$expand_i1_val = $34 & 1; //@line 4347
   HEAP8[$66 >> 0] = $$expand_i1_val; //@line 4348
   sp = STACKTOP; //@line 4349
   return;
  }
  ___async_unwind = 0; //@line 4352
  HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 4353
  $47 = $ReallocAsyncCtx + 4 | 0; //@line 4354
  HEAP32[$47 >> 2] = $2; //@line 4355
  $48 = $ReallocAsyncCtx + 8 | 0; //@line 4356
  HEAP32[$48 >> 2] = $4; //@line 4357
  $49 = $ReallocAsyncCtx + 12 | 0; //@line 4358
  HEAP32[$49 >> 2] = $6; //@line 4359
  $50 = $ReallocAsyncCtx + 16 | 0; //@line 4360
  HEAP32[$50 >> 2] = $8; //@line 4361
  $51 = $ReallocAsyncCtx + 20 | 0; //@line 4362
  HEAP32[$51 >> 2] = $10; //@line 4363
  $52 = $ReallocAsyncCtx + 24 | 0; //@line 4364
  HEAP32[$52 >> 2] = $12; //@line 4365
  $53 = $ReallocAsyncCtx + 28 | 0; //@line 4366
  HEAP32[$53 >> 2] = $14; //@line 4367
  $54 = $ReallocAsyncCtx + 32 | 0; //@line 4368
  HEAP32[$54 >> 2] = $16; //@line 4369
  $55 = $ReallocAsyncCtx + 36 | 0; //@line 4370
  HEAP32[$55 >> 2] = $18; //@line 4371
  $56 = $ReallocAsyncCtx + 40 | 0; //@line 4372
  HEAP32[$56 >> 2] = $20; //@line 4373
  $57 = $ReallocAsyncCtx + 44 | 0; //@line 4374
  HEAP32[$57 >> 2] = $22; //@line 4375
  $58 = $ReallocAsyncCtx + 48 | 0; //@line 4376
  HEAP32[$58 >> 2] = $24; //@line 4377
  $59 = $ReallocAsyncCtx + 52 | 0; //@line 4378
  HEAP32[$59 >> 2] = $42; //@line 4379
  $60 = $ReallocAsyncCtx + 56 | 0; //@line 4380
  HEAP32[$60 >> 2] = $$reg2mem$0; //@line 4381
  $61 = $ReallocAsyncCtx + 60 | 0; //@line 4382
  HEAP32[$61 >> 2] = $26; //@line 4383
  $62 = $ReallocAsyncCtx + 64 | 0; //@line 4384
  HEAP32[$62 >> 2] = $28; //@line 4385
  $63 = $ReallocAsyncCtx + 68 | 0; //@line 4386
  HEAP32[$63 >> 2] = $30; //@line 4387
  $64 = $ReallocAsyncCtx + 72 | 0; //@line 4388
  HEAP32[$64 >> 2] = $$reg2mem24$0; //@line 4389
  $65 = $ReallocAsyncCtx + 76 | 0; //@line 4390
  HEAP32[$65 >> 2] = $32; //@line 4391
  $66 = $ReallocAsyncCtx + 80 | 0; //@line 4392
  $$expand_i1_val = $34 & 1; //@line 4393
  HEAP8[$66 >> 0] = $$expand_i1_val; //@line 4394
  sp = STACKTOP; //@line 4395
  return;
 } else if ((label | 0) == 7) {
  $70 = $$reg2mem$0 + 20 | 0; //@line 4399
  HEAP32[$70 >> 2] = (HEAP32[$70 >> 2] | 0) + $68; //@line 4402
  $73 = _equeue_tick() | 0; //@line 4403
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 4404
  _equeue_enqueue($10, $$reg2mem$0, $73) | 0; //@line 4405
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 4408
   $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 4409
   HEAP32[$74 >> 2] = $2; //@line 4410
   $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 4411
   HEAP32[$75 >> 2] = $4; //@line 4412
   $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 4413
   HEAP32[$76 >> 2] = $6; //@line 4414
   $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 4415
   HEAP32[$77 >> 2] = $8; //@line 4416
   $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 4417
   HEAP32[$78 >> 2] = $10; //@line 4418
   $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 4419
   HEAP32[$79 >> 2] = $12; //@line 4420
   $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 4421
   HEAP32[$80 >> 2] = $14; //@line 4422
   $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 4423
   HEAP32[$81 >> 2] = $16; //@line 4424
   $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 4425
   HEAP32[$82 >> 2] = $18; //@line 4426
   $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 4427
   HEAP32[$83 >> 2] = $20; //@line 4428
   $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 4429
   HEAP32[$84 >> 2] = $22; //@line 4430
   $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 4431
   HEAP32[$85 >> 2] = $24; //@line 4432
   $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 4433
   HEAP32[$86 >> 2] = $26; //@line 4434
   $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 4435
   HEAP32[$87 >> 2] = $28; //@line 4436
   $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 4437
   HEAP32[$88 >> 2] = $30; //@line 4438
   $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 4439
   HEAP32[$89 >> 2] = $32; //@line 4440
   $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 4441
   $$expand_i1_val31 = $34 & 1; //@line 4442
   HEAP8[$90 >> 0] = $$expand_i1_val31; //@line 4443
   $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 4444
   HEAP32[$91 >> 2] = $42; //@line 4445
   sp = STACKTOP; //@line 4446
   return;
  }
  ___async_unwind = 0; //@line 4449
  HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 4450
  $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 4451
  HEAP32[$74 >> 2] = $2; //@line 4452
  $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 4453
  HEAP32[$75 >> 2] = $4; //@line 4454
  $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 4455
  HEAP32[$76 >> 2] = $6; //@line 4456
  $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 4457
  HEAP32[$77 >> 2] = $8; //@line 4458
  $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 4459
  HEAP32[$78 >> 2] = $10; //@line 4460
  $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 4461
  HEAP32[$79 >> 2] = $12; //@line 4462
  $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 4463
  HEAP32[$80 >> 2] = $14; //@line 4464
  $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 4465
  HEAP32[$81 >> 2] = $16; //@line 4466
  $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 4467
  HEAP32[$82 >> 2] = $18; //@line 4468
  $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 4469
  HEAP32[$83 >> 2] = $20; //@line 4470
  $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 4471
  HEAP32[$84 >> 2] = $22; //@line 4472
  $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 4473
  HEAP32[$85 >> 2] = $24; //@line 4474
  $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 4475
  HEAP32[$86 >> 2] = $26; //@line 4476
  $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 4477
  HEAP32[$87 >> 2] = $28; //@line 4478
  $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 4479
  HEAP32[$88 >> 2] = $30; //@line 4480
  $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 4481
  HEAP32[$89 >> 2] = $32; //@line 4482
  $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 4483
  $$expand_i1_val31 = $34 & 1; //@line 4484
  HEAP8[$90 >> 0] = $$expand_i1_val31; //@line 4485
  $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 4486
  HEAP32[$91 >> 2] = $42; //@line 4487
  sp = STACKTOP; //@line 4488
  return;
 } else if ((label | 0) == 11) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 4493
  FUNCTION_TABLE_vi[$102 & 255]($$reg2mem$0 + 36 | 0); //@line 4494
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 30; //@line 4497
   $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 4498
   HEAP32[$105 >> 2] = $2; //@line 4499
   $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 4500
   HEAP32[$106 >> 2] = $4; //@line 4501
   $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 4502
   HEAP32[$107 >> 2] = $6; //@line 4503
   $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 4504
   HEAP32[$108 >> 2] = $8; //@line 4505
   $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 4506
   HEAP32[$109 >> 2] = $10; //@line 4507
   $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 4508
   HEAP32[$110 >> 2] = $12; //@line 4509
   $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 4510
   HEAP32[$111 >> 2] = $14; //@line 4511
   $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 4512
   HEAP32[$112 >> 2] = $16; //@line 4513
   $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 4514
   HEAP32[$113 >> 2] = $18; //@line 4515
   $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 4516
   HEAP32[$114 >> 2] = $20; //@line 4517
   $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 4518
   HEAP32[$115 >> 2] = $22; //@line 4519
   $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 4520
   HEAP32[$116 >> 2] = $24; //@line 4521
   $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 4522
   HEAP32[$117 >> 2] = $26; //@line 4523
   $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 4524
   HEAP32[$118 >> 2] = $28; //@line 4525
   $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 4526
   HEAP32[$119 >> 2] = $30; //@line 4527
   $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 4528
   HEAP32[$120 >> 2] = $32; //@line 4529
   $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 4530
   $$expand_i1_val33 = $34 & 1; //@line 4531
   HEAP8[$121 >> 0] = $$expand_i1_val33; //@line 4532
   $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 4533
   HEAP32[$122 >> 2] = $42; //@line 4534
   $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 4535
   HEAP32[$123 >> 2] = $$reg2mem$0; //@line 4536
   $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 4537
   HEAP32[$124 >> 2] = $$reg2mem24$0; //@line 4538
   sp = STACKTOP; //@line 4539
   return;
  }
  ___async_unwind = 0; //@line 4542
  HEAP32[$ReallocAsyncCtx2 >> 2] = 30; //@line 4543
  $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 4544
  HEAP32[$105 >> 2] = $2; //@line 4545
  $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 4546
  HEAP32[$106 >> 2] = $4; //@line 4547
  $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 4548
  HEAP32[$107 >> 2] = $6; //@line 4549
  $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 4550
  HEAP32[$108 >> 2] = $8; //@line 4551
  $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 4552
  HEAP32[$109 >> 2] = $10; //@line 4553
  $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 4554
  HEAP32[$110 >> 2] = $12; //@line 4555
  $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 4556
  HEAP32[$111 >> 2] = $14; //@line 4557
  $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 4558
  HEAP32[$112 >> 2] = $16; //@line 4559
  $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 4560
  HEAP32[$113 >> 2] = $18; //@line 4561
  $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 4562
  HEAP32[$114 >> 2] = $20; //@line 4563
  $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 4564
  HEAP32[$115 >> 2] = $22; //@line 4565
  $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 4566
  HEAP32[$116 >> 2] = $24; //@line 4567
  $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 4568
  HEAP32[$117 >> 2] = $26; //@line 4569
  $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 4570
  HEAP32[$118 >> 2] = $28; //@line 4571
  $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 4572
  HEAP32[$119 >> 2] = $30; //@line 4573
  $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 4574
  HEAP32[$120 >> 2] = $32; //@line 4575
  $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 4576
  $$expand_i1_val33 = $34 & 1; //@line 4577
  HEAP8[$121 >> 0] = $$expand_i1_val33; //@line 4578
  $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 4579
  HEAP32[$122 >> 2] = $42; //@line 4580
  $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 4581
  HEAP32[$123 >> 2] = $$reg2mem$0; //@line 4582
  $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 4583
  HEAP32[$124 >> 2] = $$reg2mem24$0; //@line 4584
  sp = STACKTOP; //@line 4585
  return;
 } else if ((label | 0) == 24) {
  $140 = _equeue_tick() | 0; //@line 4589
  if ($34) {
   $141 = $32 - $140 | 0; //@line 4591
   if (($141 | 0) < 1) {
    $143 = $10 + 40 | 0; //@line 4594
    if (HEAP32[$143 >> 2] | 0) {
     _equeue_mutex_lock($2); //@line 4598
     $146 = HEAP32[$143 >> 2] | 0; //@line 4599
     if ($146 | 0) {
      $148 = HEAP32[$8 >> 2] | 0; //@line 4602
      if ($148 | 0) {
       $151 = HEAP32[$10 + 44 >> 2] | 0; //@line 4606
       $154 = (HEAP32[$148 + 20 >> 2] | 0) - $140 | 0; //@line 4609
       $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 4613
       FUNCTION_TABLE_vii[$146 & 3]($151, $154 & ~($154 >> 31)); //@line 4614
       if (___async) {
        HEAP32[$ReallocAsyncCtx3 >> 2] = 31; //@line 4617
        $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 4618
        HEAP32[$158 >> 2] = $20; //@line 4619
        $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 4620
        HEAP32[$159 >> 2] = $2; //@line 4621
        $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 4622
        HEAP32[$160 >> 2] = $22; //@line 4623
        sp = STACKTOP; //@line 4624
        return;
       }
       ___async_unwind = 0; //@line 4627
       HEAP32[$ReallocAsyncCtx3 >> 2] = 31; //@line 4628
       $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 4629
       HEAP32[$158 >> 2] = $20; //@line 4630
       $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 4631
       HEAP32[$159 >> 2] = $2; //@line 4632
       $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 4633
       HEAP32[$160 >> 2] = $22; //@line 4634
       sp = STACKTOP; //@line 4635
       return;
      }
     }
     HEAP8[$20 >> 0] = 1; //@line 4639
     _equeue_mutex_unlock($2); //@line 4640
    }
    HEAP8[$22 >> 0] = 0; //@line 4642
    return;
   } else {
    $$067 = $141; //@line 4645
   }
  } else {
   $$067 = -1; //@line 4648
  }
  _equeue_mutex_lock($2); //@line 4650
  $161 = HEAP32[$8 >> 2] | 0; //@line 4651
  if (!$161) {
   $$2 = $$067; //@line 4654
  } else {
   $165 = (HEAP32[$161 + 20 >> 2] | 0) - $140 | 0; //@line 4658
   $168 = $165 & ~($165 >> 31); //@line 4661
   $$2 = $168 >>> 0 < $$067 >>> 0 ? $168 : $$067; //@line 4664
  }
  _equeue_mutex_unlock($2); //@line 4666
  _equeue_sema_wait($24, $$2) | 0; //@line 4667
  do {
   if (HEAP8[$22 >> 0] | 0) {
    _equeue_mutex_lock($2); //@line 4672
    if (!(HEAP8[$22 >> 0] | 0)) {
     _equeue_mutex_unlock($2); //@line 4676
     break;
    }
    HEAP8[$22 >> 0] = 0; //@line 4679
    _equeue_mutex_unlock($2); //@line 4680
    return;
   }
  } while (0);
  $174 = _equeue_tick() | 0; //@line 4684
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 4685
  _wait_ms(20); //@line 4686
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 32; //@line 4689
   $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 4690
   HEAP32[$175 >> 2] = $174; //@line 4691
   $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 4692
   HEAP32[$176 >> 2] = $2; //@line 4693
   $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 4694
   HEAP32[$177 >> 2] = $4; //@line 4695
   $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 4696
   HEAP32[$178 >> 2] = $6; //@line 4697
   $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 4698
   HEAP32[$179 >> 2] = $8; //@line 4699
   $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 4700
   HEAP32[$180 >> 2] = $10; //@line 4701
   $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 4702
   HEAP32[$181 >> 2] = $12; //@line 4703
   $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 4704
   HEAP32[$182 >> 2] = $14; //@line 4705
   $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 4706
   HEAP32[$183 >> 2] = $16; //@line 4707
   $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 4708
   HEAP32[$184 >> 2] = $18; //@line 4709
   $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 4710
   HEAP32[$185 >> 2] = $20; //@line 4711
   $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 4712
   HEAP32[$186 >> 2] = $22; //@line 4713
   $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 4714
   HEAP32[$187 >> 2] = $24; //@line 4715
   $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 4716
   HEAP32[$188 >> 2] = $26; //@line 4717
   $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 4718
   HEAP32[$189 >> 2] = $28; //@line 4719
   $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 4720
   HEAP32[$190 >> 2] = $30; //@line 4721
   $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 4722
   HEAP32[$191 >> 2] = $32; //@line 4723
   $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 4724
   $$expand_i1_val35 = $34 & 1; //@line 4725
   HEAP8[$192 >> 0] = $$expand_i1_val35; //@line 4726
   sp = STACKTOP; //@line 4727
   return;
  }
  ___async_unwind = 0; //@line 4730
  HEAP32[$ReallocAsyncCtx5 >> 2] = 32; //@line 4731
  $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 4732
  HEAP32[$175 >> 2] = $174; //@line 4733
  $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 4734
  HEAP32[$176 >> 2] = $2; //@line 4735
  $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 4736
  HEAP32[$177 >> 2] = $4; //@line 4737
  $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 4738
  HEAP32[$178 >> 2] = $6; //@line 4739
  $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 4740
  HEAP32[$179 >> 2] = $8; //@line 4741
  $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 4742
  HEAP32[$180 >> 2] = $10; //@line 4743
  $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 4744
  HEAP32[$181 >> 2] = $12; //@line 4745
  $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 4746
  HEAP32[$182 >> 2] = $14; //@line 4747
  $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 4748
  HEAP32[$183 >> 2] = $16; //@line 4749
  $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 4750
  HEAP32[$184 >> 2] = $18; //@line 4751
  $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 4752
  HEAP32[$185 >> 2] = $20; //@line 4753
  $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 4754
  HEAP32[$186 >> 2] = $22; //@line 4755
  $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 4756
  HEAP32[$187 >> 2] = $24; //@line 4757
  $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 4758
  HEAP32[$188 >> 2] = $26; //@line 4759
  $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 4760
  HEAP32[$189 >> 2] = $28; //@line 4761
  $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 4762
  HEAP32[$190 >> 2] = $30; //@line 4763
  $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 4764
  HEAP32[$191 >> 2] = $32; //@line 4765
  $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 4766
  $$expand_i1_val35 = $34 & 1; //@line 4767
  HEAP8[$192 >> 0] = $$expand_i1_val35; //@line 4768
  sp = STACKTOP; //@line 4769
  return;
 }
}
function _equeue_dispatch__async_cb_60($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$067 = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val12 = 0, $$expand_i1_val14 = 0, $$expand_i1_val16 = 0, $$reg2mem$0 = 0, $$sink$in$i$i = 0, $10 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $123 = 0, $124 = 0, $125 = 0, $127 = 0, $128 = 0, $136 = 0, $137 = 0, $139 = 0, $14 = 0, $142 = 0, $144 = 0, $147 = 0, $150 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $16 = 0, $161 = 0, $164 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $37 = 0, $38 = 0, $4 = 0, $40 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $64 = 0, $66 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $98 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4801
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4803
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4805
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4807
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4809
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4811
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4813
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4815
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4817
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4819
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 4821
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 4823
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 4825
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 4827
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 4829
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 4831
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 4833
 $34 = HEAP8[$0 + 68 >> 0] & 1; //@line 4836
 $$reg2mem$0 = HEAP32[$0 + 72 >> 2] | 0; //@line 4839
 while (1) {
  if (!$$reg2mem$0) {
   label = 24; //@line 4843
   break;
  }
  $37 = $$reg2mem$0 + 8 | 0; //@line 4846
  $38 = HEAP32[$37 >> 2] | 0; //@line 4847
  $40 = HEAP32[$$reg2mem$0 + 32 >> 2] | 0; //@line 4849
  if ($40 | 0) {
   label = 3; //@line 4852
   break;
  }
  $64 = HEAP32[$$reg2mem$0 + 24 >> 2] | 0; //@line 4856
  if (($64 | 0) > -1) {
   label = 7; //@line 4859
   break;
  }
  $88 = $$reg2mem$0 + 4 | 0; //@line 4863
  $89 = HEAP8[$88 >> 0] | 0; //@line 4864
  HEAP8[$88 >> 0] = (($89 + 1 & 255) << HEAP32[$26 >> 2] | 0) == 0 ? 1 : ($89 & 255) + 1 & 255; //@line 4873
  $98 = HEAP32[$$reg2mem$0 + 28 >> 2] | 0; //@line 4875
  if ($98 | 0) {
   label = 12; //@line 4878
   break;
  }
  _equeue_mutex_lock($28); //@line 4881
  $121 = HEAP32[$30 >> 2] | 0; //@line 4882
  L8 : do {
   if (!$121) {
    $$02329$i$i = $30; //@line 4886
    label = 21; //@line 4887
   } else {
    $123 = HEAP32[$$reg2mem$0 >> 2] | 0; //@line 4889
    $$025$i$i = $30; //@line 4890
    $125 = $121; //@line 4890
    while (1) {
     $124 = HEAP32[$125 >> 2] | 0; //@line 4892
     if ($124 >>> 0 >= $123 >>> 0) {
      break;
     }
     $127 = $125 + 8 | 0; //@line 4897
     $128 = HEAP32[$127 >> 2] | 0; //@line 4898
     if (!$128) {
      $$02329$i$i = $127; //@line 4901
      label = 21; //@line 4902
      break L8;
     } else {
      $$025$i$i = $127; //@line 4905
      $125 = $128; //@line 4905
     }
    }
    if (($124 | 0) == ($123 | 0)) {
     HEAP32[$$reg2mem$0 + 12 >> 2] = $125; //@line 4911
     $$02330$i$i = $$025$i$i; //@line 4914
     $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 4914
    } else {
     $$02329$i$i = $$025$i$i; //@line 4916
     label = 21; //@line 4917
    }
   }
  } while (0);
  if ((label | 0) == 21) {
   label = 0; //@line 4922
   HEAP32[$$reg2mem$0 + 12 >> 2] = 0; //@line 4924
   $$02330$i$i = $$02329$i$i; //@line 4925
   $$sink$in$i$i = $$02329$i$i; //@line 4925
  }
  HEAP32[$37 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 4928
  HEAP32[$$02330$i$i >> 2] = $$reg2mem$0; //@line 4929
  _equeue_mutex_unlock($28); //@line 4930
  $$reg2mem$0 = $38; //@line 4931
 }
 if ((label | 0) == 3) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 4935
  FUNCTION_TABLE_vi[$40 & 255]($$reg2mem$0 + 36 | 0); //@line 4936
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 4939
   $43 = $ReallocAsyncCtx + 4 | 0; //@line 4940
   HEAP32[$43 >> 2] = $2; //@line 4941
   $44 = $ReallocAsyncCtx + 8 | 0; //@line 4942
   HEAP32[$44 >> 2] = $4; //@line 4943
   $45 = $ReallocAsyncCtx + 12 | 0; //@line 4944
   HEAP32[$45 >> 2] = $6; //@line 4945
   $46 = $ReallocAsyncCtx + 16 | 0; //@line 4946
   HEAP32[$46 >> 2] = $8; //@line 4947
   $47 = $ReallocAsyncCtx + 20 | 0; //@line 4948
   HEAP32[$47 >> 2] = $10; //@line 4949
   $48 = $ReallocAsyncCtx + 24 | 0; //@line 4950
   HEAP32[$48 >> 2] = $12; //@line 4951
   $49 = $ReallocAsyncCtx + 28 | 0; //@line 4952
   HEAP32[$49 >> 2] = $14; //@line 4953
   $50 = $ReallocAsyncCtx + 32 | 0; //@line 4954
   HEAP32[$50 >> 2] = $16; //@line 4955
   $51 = $ReallocAsyncCtx + 36 | 0; //@line 4956
   HEAP32[$51 >> 2] = $18; //@line 4957
   $52 = $ReallocAsyncCtx + 40 | 0; //@line 4958
   HEAP32[$52 >> 2] = $20; //@line 4959
   $53 = $ReallocAsyncCtx + 44 | 0; //@line 4960
   HEAP32[$53 >> 2] = $22; //@line 4961
   $54 = $ReallocAsyncCtx + 48 | 0; //@line 4962
   HEAP32[$54 >> 2] = $24; //@line 4963
   $55 = $ReallocAsyncCtx + 52 | 0; //@line 4964
   HEAP32[$55 >> 2] = $38; //@line 4965
   $56 = $ReallocAsyncCtx + 56 | 0; //@line 4966
   HEAP32[$56 >> 2] = $$reg2mem$0; //@line 4967
   $57 = $ReallocAsyncCtx + 60 | 0; //@line 4968
   HEAP32[$57 >> 2] = $26; //@line 4969
   $58 = $ReallocAsyncCtx + 64 | 0; //@line 4970
   HEAP32[$58 >> 2] = $28; //@line 4971
   $59 = $ReallocAsyncCtx + 68 | 0; //@line 4972
   HEAP32[$59 >> 2] = $30; //@line 4973
   $60 = $ReallocAsyncCtx + 72 | 0; //@line 4974
   HEAP32[$60 >> 2] = $37; //@line 4975
   $61 = $ReallocAsyncCtx + 76 | 0; //@line 4976
   HEAP32[$61 >> 2] = $32; //@line 4977
   $62 = $ReallocAsyncCtx + 80 | 0; //@line 4978
   $$expand_i1_val = $34 & 1; //@line 4979
   HEAP8[$62 >> 0] = $$expand_i1_val; //@line 4980
   sp = STACKTOP; //@line 4981
   return;
  }
  ___async_unwind = 0; //@line 4984
  HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 4985
  $43 = $ReallocAsyncCtx + 4 | 0; //@line 4986
  HEAP32[$43 >> 2] = $2; //@line 4987
  $44 = $ReallocAsyncCtx + 8 | 0; //@line 4988
  HEAP32[$44 >> 2] = $4; //@line 4989
  $45 = $ReallocAsyncCtx + 12 | 0; //@line 4990
  HEAP32[$45 >> 2] = $6; //@line 4991
  $46 = $ReallocAsyncCtx + 16 | 0; //@line 4992
  HEAP32[$46 >> 2] = $8; //@line 4993
  $47 = $ReallocAsyncCtx + 20 | 0; //@line 4994
  HEAP32[$47 >> 2] = $10; //@line 4995
  $48 = $ReallocAsyncCtx + 24 | 0; //@line 4996
  HEAP32[$48 >> 2] = $12; //@line 4997
  $49 = $ReallocAsyncCtx + 28 | 0; //@line 4998
  HEAP32[$49 >> 2] = $14; //@line 4999
  $50 = $ReallocAsyncCtx + 32 | 0; //@line 5000
  HEAP32[$50 >> 2] = $16; //@line 5001
  $51 = $ReallocAsyncCtx + 36 | 0; //@line 5002
  HEAP32[$51 >> 2] = $18; //@line 5003
  $52 = $ReallocAsyncCtx + 40 | 0; //@line 5004
  HEAP32[$52 >> 2] = $20; //@line 5005
  $53 = $ReallocAsyncCtx + 44 | 0; //@line 5006
  HEAP32[$53 >> 2] = $22; //@line 5007
  $54 = $ReallocAsyncCtx + 48 | 0; //@line 5008
  HEAP32[$54 >> 2] = $24; //@line 5009
  $55 = $ReallocAsyncCtx + 52 | 0; //@line 5010
  HEAP32[$55 >> 2] = $38; //@line 5011
  $56 = $ReallocAsyncCtx + 56 | 0; //@line 5012
  HEAP32[$56 >> 2] = $$reg2mem$0; //@line 5013
  $57 = $ReallocAsyncCtx + 60 | 0; //@line 5014
  HEAP32[$57 >> 2] = $26; //@line 5015
  $58 = $ReallocAsyncCtx + 64 | 0; //@line 5016
  HEAP32[$58 >> 2] = $28; //@line 5017
  $59 = $ReallocAsyncCtx + 68 | 0; //@line 5018
  HEAP32[$59 >> 2] = $30; //@line 5019
  $60 = $ReallocAsyncCtx + 72 | 0; //@line 5020
  HEAP32[$60 >> 2] = $37; //@line 5021
  $61 = $ReallocAsyncCtx + 76 | 0; //@line 5022
  HEAP32[$61 >> 2] = $32; //@line 5023
  $62 = $ReallocAsyncCtx + 80 | 0; //@line 5024
  $$expand_i1_val = $34 & 1; //@line 5025
  HEAP8[$62 >> 0] = $$expand_i1_val; //@line 5026
  sp = STACKTOP; //@line 5027
  return;
 } else if ((label | 0) == 7) {
  $66 = $$reg2mem$0 + 20 | 0; //@line 5031
  HEAP32[$66 >> 2] = (HEAP32[$66 >> 2] | 0) + $64; //@line 5034
  $69 = _equeue_tick() | 0; //@line 5035
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 5036
  _equeue_enqueue($10, $$reg2mem$0, $69) | 0; //@line 5037
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 5040
   $70 = $ReallocAsyncCtx4 + 4 | 0; //@line 5041
   HEAP32[$70 >> 2] = $2; //@line 5042
   $71 = $ReallocAsyncCtx4 + 8 | 0; //@line 5043
   HEAP32[$71 >> 2] = $4; //@line 5044
   $72 = $ReallocAsyncCtx4 + 12 | 0; //@line 5045
   HEAP32[$72 >> 2] = $6; //@line 5046
   $73 = $ReallocAsyncCtx4 + 16 | 0; //@line 5047
   HEAP32[$73 >> 2] = $8; //@line 5048
   $74 = $ReallocAsyncCtx4 + 20 | 0; //@line 5049
   HEAP32[$74 >> 2] = $10; //@line 5050
   $75 = $ReallocAsyncCtx4 + 24 | 0; //@line 5051
   HEAP32[$75 >> 2] = $12; //@line 5052
   $76 = $ReallocAsyncCtx4 + 28 | 0; //@line 5053
   HEAP32[$76 >> 2] = $14; //@line 5054
   $77 = $ReallocAsyncCtx4 + 32 | 0; //@line 5055
   HEAP32[$77 >> 2] = $16; //@line 5056
   $78 = $ReallocAsyncCtx4 + 36 | 0; //@line 5057
   HEAP32[$78 >> 2] = $18; //@line 5058
   $79 = $ReallocAsyncCtx4 + 40 | 0; //@line 5059
   HEAP32[$79 >> 2] = $20; //@line 5060
   $80 = $ReallocAsyncCtx4 + 44 | 0; //@line 5061
   HEAP32[$80 >> 2] = $22; //@line 5062
   $81 = $ReallocAsyncCtx4 + 48 | 0; //@line 5063
   HEAP32[$81 >> 2] = $24; //@line 5064
   $82 = $ReallocAsyncCtx4 + 52 | 0; //@line 5065
   HEAP32[$82 >> 2] = $26; //@line 5066
   $83 = $ReallocAsyncCtx4 + 56 | 0; //@line 5067
   HEAP32[$83 >> 2] = $28; //@line 5068
   $84 = $ReallocAsyncCtx4 + 60 | 0; //@line 5069
   HEAP32[$84 >> 2] = $30; //@line 5070
   $85 = $ReallocAsyncCtx4 + 64 | 0; //@line 5071
   HEAP32[$85 >> 2] = $32; //@line 5072
   $86 = $ReallocAsyncCtx4 + 68 | 0; //@line 5073
   $$expand_i1_val12 = $34 & 1; //@line 5074
   HEAP8[$86 >> 0] = $$expand_i1_val12; //@line 5075
   $87 = $ReallocAsyncCtx4 + 72 | 0; //@line 5076
   HEAP32[$87 >> 2] = $38; //@line 5077
   sp = STACKTOP; //@line 5078
   return;
  }
  ___async_unwind = 0; //@line 5081
  HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 5082
  $70 = $ReallocAsyncCtx4 + 4 | 0; //@line 5083
  HEAP32[$70 >> 2] = $2; //@line 5084
  $71 = $ReallocAsyncCtx4 + 8 | 0; //@line 5085
  HEAP32[$71 >> 2] = $4; //@line 5086
  $72 = $ReallocAsyncCtx4 + 12 | 0; //@line 5087
  HEAP32[$72 >> 2] = $6; //@line 5088
  $73 = $ReallocAsyncCtx4 + 16 | 0; //@line 5089
  HEAP32[$73 >> 2] = $8; //@line 5090
  $74 = $ReallocAsyncCtx4 + 20 | 0; //@line 5091
  HEAP32[$74 >> 2] = $10; //@line 5092
  $75 = $ReallocAsyncCtx4 + 24 | 0; //@line 5093
  HEAP32[$75 >> 2] = $12; //@line 5094
  $76 = $ReallocAsyncCtx4 + 28 | 0; //@line 5095
  HEAP32[$76 >> 2] = $14; //@line 5096
  $77 = $ReallocAsyncCtx4 + 32 | 0; //@line 5097
  HEAP32[$77 >> 2] = $16; //@line 5098
  $78 = $ReallocAsyncCtx4 + 36 | 0; //@line 5099
  HEAP32[$78 >> 2] = $18; //@line 5100
  $79 = $ReallocAsyncCtx4 + 40 | 0; //@line 5101
  HEAP32[$79 >> 2] = $20; //@line 5102
  $80 = $ReallocAsyncCtx4 + 44 | 0; //@line 5103
  HEAP32[$80 >> 2] = $22; //@line 5104
  $81 = $ReallocAsyncCtx4 + 48 | 0; //@line 5105
  HEAP32[$81 >> 2] = $24; //@line 5106
  $82 = $ReallocAsyncCtx4 + 52 | 0; //@line 5107
  HEAP32[$82 >> 2] = $26; //@line 5108
  $83 = $ReallocAsyncCtx4 + 56 | 0; //@line 5109
  HEAP32[$83 >> 2] = $28; //@line 5110
  $84 = $ReallocAsyncCtx4 + 60 | 0; //@line 5111
  HEAP32[$84 >> 2] = $30; //@line 5112
  $85 = $ReallocAsyncCtx4 + 64 | 0; //@line 5113
  HEAP32[$85 >> 2] = $32; //@line 5114
  $86 = $ReallocAsyncCtx4 + 68 | 0; //@line 5115
  $$expand_i1_val12 = $34 & 1; //@line 5116
  HEAP8[$86 >> 0] = $$expand_i1_val12; //@line 5117
  $87 = $ReallocAsyncCtx4 + 72 | 0; //@line 5118
  HEAP32[$87 >> 2] = $38; //@line 5119
  sp = STACKTOP; //@line 5120
  return;
 } else if ((label | 0) == 12) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 5125
  FUNCTION_TABLE_vi[$98 & 255]($$reg2mem$0 + 36 | 0); //@line 5126
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 30; //@line 5129
   $101 = $ReallocAsyncCtx2 + 4 | 0; //@line 5130
   HEAP32[$101 >> 2] = $2; //@line 5131
   $102 = $ReallocAsyncCtx2 + 8 | 0; //@line 5132
   HEAP32[$102 >> 2] = $4; //@line 5133
   $103 = $ReallocAsyncCtx2 + 12 | 0; //@line 5134
   HEAP32[$103 >> 2] = $6; //@line 5135
   $104 = $ReallocAsyncCtx2 + 16 | 0; //@line 5136
   HEAP32[$104 >> 2] = $8; //@line 5137
   $105 = $ReallocAsyncCtx2 + 20 | 0; //@line 5138
   HEAP32[$105 >> 2] = $10; //@line 5139
   $106 = $ReallocAsyncCtx2 + 24 | 0; //@line 5140
   HEAP32[$106 >> 2] = $12; //@line 5141
   $107 = $ReallocAsyncCtx2 + 28 | 0; //@line 5142
   HEAP32[$107 >> 2] = $14; //@line 5143
   $108 = $ReallocAsyncCtx2 + 32 | 0; //@line 5144
   HEAP32[$108 >> 2] = $16; //@line 5145
   $109 = $ReallocAsyncCtx2 + 36 | 0; //@line 5146
   HEAP32[$109 >> 2] = $18; //@line 5147
   $110 = $ReallocAsyncCtx2 + 40 | 0; //@line 5148
   HEAP32[$110 >> 2] = $20; //@line 5149
   $111 = $ReallocAsyncCtx2 + 44 | 0; //@line 5150
   HEAP32[$111 >> 2] = $22; //@line 5151
   $112 = $ReallocAsyncCtx2 + 48 | 0; //@line 5152
   HEAP32[$112 >> 2] = $24; //@line 5153
   $113 = $ReallocAsyncCtx2 + 52 | 0; //@line 5154
   HEAP32[$113 >> 2] = $26; //@line 5155
   $114 = $ReallocAsyncCtx2 + 56 | 0; //@line 5156
   HEAP32[$114 >> 2] = $28; //@line 5157
   $115 = $ReallocAsyncCtx2 + 60 | 0; //@line 5158
   HEAP32[$115 >> 2] = $30; //@line 5159
   $116 = $ReallocAsyncCtx2 + 64 | 0; //@line 5160
   HEAP32[$116 >> 2] = $32; //@line 5161
   $117 = $ReallocAsyncCtx2 + 68 | 0; //@line 5162
   $$expand_i1_val14 = $34 & 1; //@line 5163
   HEAP8[$117 >> 0] = $$expand_i1_val14; //@line 5164
   $118 = $ReallocAsyncCtx2 + 72 | 0; //@line 5165
   HEAP32[$118 >> 2] = $38; //@line 5166
   $119 = $ReallocAsyncCtx2 + 76 | 0; //@line 5167
   HEAP32[$119 >> 2] = $$reg2mem$0; //@line 5168
   $120 = $ReallocAsyncCtx2 + 80 | 0; //@line 5169
   HEAP32[$120 >> 2] = $37; //@line 5170
   sp = STACKTOP; //@line 5171
   return;
  }
  ___async_unwind = 0; //@line 5174
  HEAP32[$ReallocAsyncCtx2 >> 2] = 30; //@line 5175
  $101 = $ReallocAsyncCtx2 + 4 | 0; //@line 5176
  HEAP32[$101 >> 2] = $2; //@line 5177
  $102 = $ReallocAsyncCtx2 + 8 | 0; //@line 5178
  HEAP32[$102 >> 2] = $4; //@line 5179
  $103 = $ReallocAsyncCtx2 + 12 | 0; //@line 5180
  HEAP32[$103 >> 2] = $6; //@line 5181
  $104 = $ReallocAsyncCtx2 + 16 | 0; //@line 5182
  HEAP32[$104 >> 2] = $8; //@line 5183
  $105 = $ReallocAsyncCtx2 + 20 | 0; //@line 5184
  HEAP32[$105 >> 2] = $10; //@line 5185
  $106 = $ReallocAsyncCtx2 + 24 | 0; //@line 5186
  HEAP32[$106 >> 2] = $12; //@line 5187
  $107 = $ReallocAsyncCtx2 + 28 | 0; //@line 5188
  HEAP32[$107 >> 2] = $14; //@line 5189
  $108 = $ReallocAsyncCtx2 + 32 | 0; //@line 5190
  HEAP32[$108 >> 2] = $16; //@line 5191
  $109 = $ReallocAsyncCtx2 + 36 | 0; //@line 5192
  HEAP32[$109 >> 2] = $18; //@line 5193
  $110 = $ReallocAsyncCtx2 + 40 | 0; //@line 5194
  HEAP32[$110 >> 2] = $20; //@line 5195
  $111 = $ReallocAsyncCtx2 + 44 | 0; //@line 5196
  HEAP32[$111 >> 2] = $22; //@line 5197
  $112 = $ReallocAsyncCtx2 + 48 | 0; //@line 5198
  HEAP32[$112 >> 2] = $24; //@line 5199
  $113 = $ReallocAsyncCtx2 + 52 | 0; //@line 5200
  HEAP32[$113 >> 2] = $26; //@line 5201
  $114 = $ReallocAsyncCtx2 + 56 | 0; //@line 5202
  HEAP32[$114 >> 2] = $28; //@line 5203
  $115 = $ReallocAsyncCtx2 + 60 | 0; //@line 5204
  HEAP32[$115 >> 2] = $30; //@line 5205
  $116 = $ReallocAsyncCtx2 + 64 | 0; //@line 5206
  HEAP32[$116 >> 2] = $32; //@line 5207
  $117 = $ReallocAsyncCtx2 + 68 | 0; //@line 5208
  $$expand_i1_val14 = $34 & 1; //@line 5209
  HEAP8[$117 >> 0] = $$expand_i1_val14; //@line 5210
  $118 = $ReallocAsyncCtx2 + 72 | 0; //@line 5211
  HEAP32[$118 >> 2] = $38; //@line 5212
  $119 = $ReallocAsyncCtx2 + 76 | 0; //@line 5213
  HEAP32[$119 >> 2] = $$reg2mem$0; //@line 5214
  $120 = $ReallocAsyncCtx2 + 80 | 0; //@line 5215
  HEAP32[$120 >> 2] = $37; //@line 5216
  sp = STACKTOP; //@line 5217
  return;
 } else if ((label | 0) == 24) {
  $136 = _equeue_tick() | 0; //@line 5221
  if ($34) {
   $137 = $32 - $136 | 0; //@line 5223
   if (($137 | 0) < 1) {
    $139 = $10 + 40 | 0; //@line 5226
    if (HEAP32[$139 >> 2] | 0) {
     _equeue_mutex_lock($2); //@line 5230
     $142 = HEAP32[$139 >> 2] | 0; //@line 5231
     if ($142 | 0) {
      $144 = HEAP32[$8 >> 2] | 0; //@line 5234
      if ($144 | 0) {
       $147 = HEAP32[$10 + 44 >> 2] | 0; //@line 5238
       $150 = (HEAP32[$144 + 20 >> 2] | 0) - $136 | 0; //@line 5241
       $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 5245
       FUNCTION_TABLE_vii[$142 & 3]($147, $150 & ~($150 >> 31)); //@line 5246
       if (___async) {
        HEAP32[$ReallocAsyncCtx3 >> 2] = 31; //@line 5249
        $154 = $ReallocAsyncCtx3 + 4 | 0; //@line 5250
        HEAP32[$154 >> 2] = $20; //@line 5251
        $155 = $ReallocAsyncCtx3 + 8 | 0; //@line 5252
        HEAP32[$155 >> 2] = $2; //@line 5253
        $156 = $ReallocAsyncCtx3 + 12 | 0; //@line 5254
        HEAP32[$156 >> 2] = $22; //@line 5255
        sp = STACKTOP; //@line 5256
        return;
       }
       ___async_unwind = 0; //@line 5259
       HEAP32[$ReallocAsyncCtx3 >> 2] = 31; //@line 5260
       $154 = $ReallocAsyncCtx3 + 4 | 0; //@line 5261
       HEAP32[$154 >> 2] = $20; //@line 5262
       $155 = $ReallocAsyncCtx3 + 8 | 0; //@line 5263
       HEAP32[$155 >> 2] = $2; //@line 5264
       $156 = $ReallocAsyncCtx3 + 12 | 0; //@line 5265
       HEAP32[$156 >> 2] = $22; //@line 5266
       sp = STACKTOP; //@line 5267
       return;
      }
     }
     HEAP8[$20 >> 0] = 1; //@line 5271
     _equeue_mutex_unlock($2); //@line 5272
    }
    HEAP8[$22 >> 0] = 0; //@line 5274
    return;
   } else {
    $$067 = $137; //@line 5277
   }
  } else {
   $$067 = -1; //@line 5280
  }
  _equeue_mutex_lock($2); //@line 5282
  $157 = HEAP32[$8 >> 2] | 0; //@line 5283
  if (!$157) {
   $$2 = $$067; //@line 5286
  } else {
   $161 = (HEAP32[$157 + 20 >> 2] | 0) - $136 | 0; //@line 5290
   $164 = $161 & ~($161 >> 31); //@line 5293
   $$2 = $164 >>> 0 < $$067 >>> 0 ? $164 : $$067; //@line 5296
  }
  _equeue_mutex_unlock($2); //@line 5298
  _equeue_sema_wait($24, $$2) | 0; //@line 5299
  do {
   if (HEAP8[$22 >> 0] | 0) {
    _equeue_mutex_lock($2); //@line 5304
    if (!(HEAP8[$22 >> 0] | 0)) {
     _equeue_mutex_unlock($2); //@line 5308
     break;
    }
    HEAP8[$22 >> 0] = 0; //@line 5311
    _equeue_mutex_unlock($2); //@line 5312
    return;
   }
  } while (0);
  $170 = _equeue_tick() | 0; //@line 5316
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 5317
  _wait_ms(20); //@line 5318
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 32; //@line 5321
   $171 = $ReallocAsyncCtx5 + 4 | 0; //@line 5322
   HEAP32[$171 >> 2] = $170; //@line 5323
   $172 = $ReallocAsyncCtx5 + 8 | 0; //@line 5324
   HEAP32[$172 >> 2] = $2; //@line 5325
   $173 = $ReallocAsyncCtx5 + 12 | 0; //@line 5326
   HEAP32[$173 >> 2] = $4; //@line 5327
   $174 = $ReallocAsyncCtx5 + 16 | 0; //@line 5328
   HEAP32[$174 >> 2] = $6; //@line 5329
   $175 = $ReallocAsyncCtx5 + 20 | 0; //@line 5330
   HEAP32[$175 >> 2] = $8; //@line 5331
   $176 = $ReallocAsyncCtx5 + 24 | 0; //@line 5332
   HEAP32[$176 >> 2] = $10; //@line 5333
   $177 = $ReallocAsyncCtx5 + 28 | 0; //@line 5334
   HEAP32[$177 >> 2] = $12; //@line 5335
   $178 = $ReallocAsyncCtx5 + 32 | 0; //@line 5336
   HEAP32[$178 >> 2] = $14; //@line 5337
   $179 = $ReallocAsyncCtx5 + 36 | 0; //@line 5338
   HEAP32[$179 >> 2] = $16; //@line 5339
   $180 = $ReallocAsyncCtx5 + 40 | 0; //@line 5340
   HEAP32[$180 >> 2] = $18; //@line 5341
   $181 = $ReallocAsyncCtx5 + 44 | 0; //@line 5342
   HEAP32[$181 >> 2] = $20; //@line 5343
   $182 = $ReallocAsyncCtx5 + 48 | 0; //@line 5344
   HEAP32[$182 >> 2] = $22; //@line 5345
   $183 = $ReallocAsyncCtx5 + 52 | 0; //@line 5346
   HEAP32[$183 >> 2] = $24; //@line 5347
   $184 = $ReallocAsyncCtx5 + 56 | 0; //@line 5348
   HEAP32[$184 >> 2] = $26; //@line 5349
   $185 = $ReallocAsyncCtx5 + 60 | 0; //@line 5350
   HEAP32[$185 >> 2] = $28; //@line 5351
   $186 = $ReallocAsyncCtx5 + 64 | 0; //@line 5352
   HEAP32[$186 >> 2] = $30; //@line 5353
   $187 = $ReallocAsyncCtx5 + 68 | 0; //@line 5354
   HEAP32[$187 >> 2] = $32; //@line 5355
   $188 = $ReallocAsyncCtx5 + 72 | 0; //@line 5356
   $$expand_i1_val16 = $34 & 1; //@line 5357
   HEAP8[$188 >> 0] = $$expand_i1_val16; //@line 5358
   sp = STACKTOP; //@line 5359
   return;
  }
  ___async_unwind = 0; //@line 5362
  HEAP32[$ReallocAsyncCtx5 >> 2] = 32; //@line 5363
  $171 = $ReallocAsyncCtx5 + 4 | 0; //@line 5364
  HEAP32[$171 >> 2] = $170; //@line 5365
  $172 = $ReallocAsyncCtx5 + 8 | 0; //@line 5366
  HEAP32[$172 >> 2] = $2; //@line 5367
  $173 = $ReallocAsyncCtx5 + 12 | 0; //@line 5368
  HEAP32[$173 >> 2] = $4; //@line 5369
  $174 = $ReallocAsyncCtx5 + 16 | 0; //@line 5370
  HEAP32[$174 >> 2] = $6; //@line 5371
  $175 = $ReallocAsyncCtx5 + 20 | 0; //@line 5372
  HEAP32[$175 >> 2] = $8; //@line 5373
  $176 = $ReallocAsyncCtx5 + 24 | 0; //@line 5374
  HEAP32[$176 >> 2] = $10; //@line 5375
  $177 = $ReallocAsyncCtx5 + 28 | 0; //@line 5376
  HEAP32[$177 >> 2] = $12; //@line 5377
  $178 = $ReallocAsyncCtx5 + 32 | 0; //@line 5378
  HEAP32[$178 >> 2] = $14; //@line 5379
  $179 = $ReallocAsyncCtx5 + 36 | 0; //@line 5380
  HEAP32[$179 >> 2] = $16; //@line 5381
  $180 = $ReallocAsyncCtx5 + 40 | 0; //@line 5382
  HEAP32[$180 >> 2] = $18; //@line 5383
  $181 = $ReallocAsyncCtx5 + 44 | 0; //@line 5384
  HEAP32[$181 >> 2] = $20; //@line 5385
  $182 = $ReallocAsyncCtx5 + 48 | 0; //@line 5386
  HEAP32[$182 >> 2] = $22; //@line 5387
  $183 = $ReallocAsyncCtx5 + 52 | 0; //@line 5388
  HEAP32[$183 >> 2] = $24; //@line 5389
  $184 = $ReallocAsyncCtx5 + 56 | 0; //@line 5390
  HEAP32[$184 >> 2] = $26; //@line 5391
  $185 = $ReallocAsyncCtx5 + 60 | 0; //@line 5392
  HEAP32[$185 >> 2] = $28; //@line 5393
  $186 = $ReallocAsyncCtx5 + 64 | 0; //@line 5394
  HEAP32[$186 >> 2] = $30; //@line 5395
  $187 = $ReallocAsyncCtx5 + 68 | 0; //@line 5396
  HEAP32[$187 >> 2] = $32; //@line 5397
  $188 = $ReallocAsyncCtx5 + 72 | 0; //@line 5398
  $$expand_i1_val16 = $34 & 1; //@line 5399
  HEAP8[$188 >> 0] = $$expand_i1_val16; //@line 5400
  sp = STACKTOP; //@line 5401
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
 sp = STACKTOP; //@line 8188
 STACKTOP = STACKTOP + 64 | 0; //@line 8189
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 8189
 $5 = sp + 16 | 0; //@line 8190
 $6 = sp; //@line 8191
 $7 = sp + 24 | 0; //@line 8192
 $8 = sp + 8 | 0; //@line 8193
 $9 = sp + 20 | 0; //@line 8194
 HEAP32[$5 >> 2] = $1; //@line 8195
 $10 = ($0 | 0) != 0; //@line 8196
 $11 = $7 + 40 | 0; //@line 8197
 $12 = $11; //@line 8198
 $13 = $7 + 39 | 0; //@line 8199
 $14 = $8 + 4 | 0; //@line 8200
 $$0243 = 0; //@line 8201
 $$0247 = 0; //@line 8201
 $$0269 = 0; //@line 8201
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 8210
     $$1248 = -1; //@line 8211
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 8215
     break;
    }
   } else {
    $$1248 = $$0247; //@line 8219
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 8222
  $21 = HEAP8[$20 >> 0] | 0; //@line 8223
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 8226
   break;
  } else {
   $23 = $21; //@line 8229
   $25 = $20; //@line 8229
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 8234
     $27 = $25; //@line 8234
     label = 9; //@line 8235
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 8240
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 8247
   HEAP32[$5 >> 2] = $24; //@line 8248
   $23 = HEAP8[$24 >> 0] | 0; //@line 8250
   $25 = $24; //@line 8250
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 8255
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 8260
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 8263
     $27 = $27 + 2 | 0; //@line 8264
     HEAP32[$5 >> 2] = $27; //@line 8265
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 8272
      break;
     } else {
      $$0249303 = $30; //@line 8269
      label = 9; //@line 8270
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 8280
  if ($10) {
   _out_670($0, $20, $36); //@line 8282
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 8286
   $$0247 = $$1248; //@line 8286
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 8294
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 8295
  if ($43) {
   $$0253 = -1; //@line 8297
   $$1270 = $$0269; //@line 8297
   $$sink = 1; //@line 8297
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 8307
    $$1270 = 1; //@line 8307
    $$sink = 3; //@line 8307
   } else {
    $$0253 = -1; //@line 8309
    $$1270 = $$0269; //@line 8309
    $$sink = 1; //@line 8309
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 8312
  HEAP32[$5 >> 2] = $51; //@line 8313
  $52 = HEAP8[$51 >> 0] | 0; //@line 8314
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 8316
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 8323
   $$lcssa291 = $52; //@line 8323
   $$lcssa292 = $51; //@line 8323
  } else {
   $$0262309 = 0; //@line 8325
   $60 = $52; //@line 8325
   $65 = $51; //@line 8325
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 8330
    $64 = $65 + 1 | 0; //@line 8331
    HEAP32[$5 >> 2] = $64; //@line 8332
    $66 = HEAP8[$64 >> 0] | 0; //@line 8333
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 8335
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 8342
     $$lcssa291 = $66; //@line 8342
     $$lcssa292 = $64; //@line 8342
     break;
    } else {
     $$0262309 = $63; //@line 8345
     $60 = $66; //@line 8345
     $65 = $64; //@line 8345
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 8357
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 8359
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 8364
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 8369
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 8381
     $$2271 = 1; //@line 8381
     $storemerge274 = $79 + 3 | 0; //@line 8381
    } else {
     label = 23; //@line 8383
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 8387
    if ($$1270 | 0) {
     $$0 = -1; //@line 8390
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8405
     $106 = HEAP32[$105 >> 2] | 0; //@line 8406
     HEAP32[$2 >> 2] = $105 + 4; //@line 8408
     $363 = $106; //@line 8409
    } else {
     $363 = 0; //@line 8411
    }
    $$0259 = $363; //@line 8415
    $$2271 = 0; //@line 8415
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 8415
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 8417
   $109 = ($$0259 | 0) < 0; //@line 8418
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 8423
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 8423
   $$3272 = $$2271; //@line 8423
   $115 = $storemerge274; //@line 8423
  } else {
   $112 = _getint_671($5) | 0; //@line 8425
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 8428
    break;
   }
   $$1260 = $112; //@line 8432
   $$1263 = $$0262$lcssa; //@line 8432
   $$3272 = $$1270; //@line 8432
   $115 = HEAP32[$5 >> 2] | 0; //@line 8432
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 8443
     $156 = _getint_671($5) | 0; //@line 8444
     $$0254 = $156; //@line 8446
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 8446
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 8455
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 8460
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 8465
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 8472
      $144 = $125 + 4 | 0; //@line 8476
      HEAP32[$5 >> 2] = $144; //@line 8477
      $$0254 = $140; //@line 8478
      $$pre345 = $144; //@line 8478
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 8484
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8499
     $152 = HEAP32[$151 >> 2] | 0; //@line 8500
     HEAP32[$2 >> 2] = $151 + 4; //@line 8502
     $364 = $152; //@line 8503
    } else {
     $364 = 0; //@line 8505
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 8508
    HEAP32[$5 >> 2] = $154; //@line 8509
    $$0254 = $364; //@line 8510
    $$pre345 = $154; //@line 8510
   } else {
    $$0254 = -1; //@line 8512
    $$pre345 = $115; //@line 8512
   }
  } while (0);
  $$0252 = 0; //@line 8515
  $158 = $$pre345; //@line 8515
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 8522
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 8525
   HEAP32[$5 >> 2] = $158; //@line 8526
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (1939 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 8531
   $168 = $167 & 255; //@line 8532
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 8536
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 8543
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 8547
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 8551
     break L1;
    } else {
     label = 50; //@line 8554
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 8559
     $176 = $3 + ($$0253 << 3) | 0; //@line 8561
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 8566
     $182 = $6; //@line 8567
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 8569
     HEAP32[$182 + 4 >> 2] = $181; //@line 8572
     label = 50; //@line 8573
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 8577
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 8580
    $187 = HEAP32[$5 >> 2] | 0; //@line 8582
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 8586
   if ($10) {
    $187 = $158; //@line 8588
   } else {
    $$0243 = 0; //@line 8590
    $$0247 = $$1248; //@line 8590
    $$0269 = $$3272; //@line 8590
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 8596
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 8602
  $196 = $$1263 & -65537; //@line 8605
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 8606
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 8614
       $$0243 = 0; //@line 8615
       $$0247 = $$1248; //@line 8615
       $$0269 = $$3272; //@line 8615
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 8621
       $$0243 = 0; //@line 8622
       $$0247 = $$1248; //@line 8622
       $$0269 = $$3272; //@line 8622
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 8630
       HEAP32[$208 >> 2] = $$1248; //@line 8632
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 8635
       $$0243 = 0; //@line 8636
       $$0247 = $$1248; //@line 8636
       $$0269 = $$3272; //@line 8636
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 8643
       $$0243 = 0; //@line 8644
       $$0247 = $$1248; //@line 8644
       $$0269 = $$3272; //@line 8644
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 8651
       $$0243 = 0; //@line 8652
       $$0247 = $$1248; //@line 8652
       $$0269 = $$3272; //@line 8652
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 8658
       $$0243 = 0; //@line 8659
       $$0247 = $$1248; //@line 8659
       $$0269 = $$3272; //@line 8659
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 8667
       HEAP32[$220 >> 2] = $$1248; //@line 8669
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 8672
       $$0243 = 0; //@line 8673
       $$0247 = $$1248; //@line 8673
       $$0269 = $$3272; //@line 8673
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 8678
       $$0247 = $$1248; //@line 8678
       $$0269 = $$3272; //@line 8678
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 8688
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 8688
     $$3265 = $$1263$ | 8; //@line 8688
     label = 62; //@line 8689
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 8693
     $$1255 = $$0254; //@line 8693
     $$3265 = $$1263$; //@line 8693
     label = 62; //@line 8694
     break;
    }
   case 111:
    {
     $242 = $6; //@line 8698
     $244 = HEAP32[$242 >> 2] | 0; //@line 8700
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 8703
     $248 = _fmt_o($244, $247, $11) | 0; //@line 8704
     $252 = $12 - $248 | 0; //@line 8708
     $$0228 = $248; //@line 8713
     $$1233 = 0; //@line 8713
     $$1238 = 2403; //@line 8713
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 8713
     $$4266 = $$1263$; //@line 8713
     $281 = $244; //@line 8713
     $283 = $247; //@line 8713
     label = 68; //@line 8714
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 8718
     $258 = HEAP32[$256 >> 2] | 0; //@line 8720
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 8723
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 8726
      $264 = tempRet0; //@line 8727
      $265 = $6; //@line 8728
      HEAP32[$265 >> 2] = $263; //@line 8730
      HEAP32[$265 + 4 >> 2] = $264; //@line 8733
      $$0232 = 1; //@line 8734
      $$0237 = 2403; //@line 8734
      $275 = $263; //@line 8734
      $276 = $264; //@line 8734
      label = 67; //@line 8735
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 8747
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 2403 : 2405 : 2404; //@line 8747
      $275 = $258; //@line 8747
      $276 = $261; //@line 8747
      label = 67; //@line 8748
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 8754
     $$0232 = 0; //@line 8760
     $$0237 = 2403; //@line 8760
     $275 = HEAP32[$197 >> 2] | 0; //@line 8760
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 8760
     label = 67; //@line 8761
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 8772
     $$2 = $13; //@line 8773
     $$2234 = 0; //@line 8773
     $$2239 = 2403; //@line 8773
     $$2251 = $11; //@line 8773
     $$5 = 1; //@line 8773
     $$6268 = $196; //@line 8773
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 8780
     label = 72; //@line 8781
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 8785
     $$1 = $302 | 0 ? $302 : 2413; //@line 8788
     label = 72; //@line 8789
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 8799
     HEAP32[$14 >> 2] = 0; //@line 8800
     HEAP32[$6 >> 2] = $8; //@line 8801
     $$4258354 = -1; //@line 8802
     $365 = $8; //@line 8802
     label = 76; //@line 8803
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 8807
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 8810
      $$0240$lcssa356 = 0; //@line 8811
      label = 85; //@line 8812
     } else {
      $$4258354 = $$0254; //@line 8814
      $365 = $$pre348; //@line 8814
      label = 76; //@line 8815
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 8822
     $$0247 = $$1248; //@line 8822
     $$0269 = $$3272; //@line 8822
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 8827
     $$2234 = 0; //@line 8827
     $$2239 = 2403; //@line 8827
     $$2251 = $11; //@line 8827
     $$5 = $$0254; //@line 8827
     $$6268 = $$1263$; //@line 8827
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 8833
    $227 = $6; //@line 8834
    $229 = HEAP32[$227 >> 2] | 0; //@line 8836
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 8839
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 8841
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 8847
    $$0228 = $234; //@line 8852
    $$1233 = $or$cond278 ? 0 : 2; //@line 8852
    $$1238 = $or$cond278 ? 2403 : 2403 + ($$1236 >> 4) | 0; //@line 8852
    $$2256 = $$1255; //@line 8852
    $$4266 = $$3265; //@line 8852
    $281 = $229; //@line 8852
    $283 = $232; //@line 8852
    label = 68; //@line 8853
   } else if ((label | 0) == 67) {
    label = 0; //@line 8856
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 8858
    $$1233 = $$0232; //@line 8858
    $$1238 = $$0237; //@line 8858
    $$2256 = $$0254; //@line 8858
    $$4266 = $$1263$; //@line 8858
    $281 = $275; //@line 8858
    $283 = $276; //@line 8858
    label = 68; //@line 8859
   } else if ((label | 0) == 72) {
    label = 0; //@line 8862
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 8863
    $306 = ($305 | 0) == 0; //@line 8864
    $$2 = $$1; //@line 8871
    $$2234 = 0; //@line 8871
    $$2239 = 2403; //@line 8871
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 8871
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 8871
    $$6268 = $196; //@line 8871
   } else if ((label | 0) == 76) {
    label = 0; //@line 8874
    $$0229316 = $365; //@line 8875
    $$0240315 = 0; //@line 8875
    $$1244314 = 0; //@line 8875
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 8877
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 8880
      $$2245 = $$1244314; //@line 8880
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 8883
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 8889
      $$2245 = $320; //@line 8889
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 8893
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 8896
      $$0240315 = $325; //@line 8896
      $$1244314 = $320; //@line 8896
     } else {
      $$0240$lcssa = $325; //@line 8898
      $$2245 = $320; //@line 8898
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 8904
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 8907
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 8910
     label = 85; //@line 8911
    } else {
     $$1230327 = $365; //@line 8913
     $$1241326 = 0; //@line 8913
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 8915
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 8918
       label = 85; //@line 8919
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 8922
      $$1241326 = $331 + $$1241326 | 0; //@line 8923
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 8926
       label = 85; //@line 8927
       break L97;
      }
      _out_670($0, $9, $331); //@line 8931
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 8936
       label = 85; //@line 8937
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 8934
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 8945
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 8951
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 8953
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 8958
   $$2 = $or$cond ? $$0228 : $11; //@line 8963
   $$2234 = $$1233; //@line 8963
   $$2239 = $$1238; //@line 8963
   $$2251 = $11; //@line 8963
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 8963
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 8963
  } else if ((label | 0) == 85) {
   label = 0; //@line 8966
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 8968
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 8971
   $$0247 = $$1248; //@line 8971
   $$0269 = $$3272; //@line 8971
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 8976
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 8978
  $345 = $$$5 + $$2234 | 0; //@line 8979
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 8981
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 8982
  _out_670($0, $$2239, $$2234); //@line 8983
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 8985
  _pad_676($0, 48, $$$5, $343, 0); //@line 8986
  _out_670($0, $$2, $343); //@line 8987
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 8989
  $$0243 = $$2261; //@line 8990
  $$0247 = $$1248; //@line 8990
  $$0269 = $$3272; //@line 8990
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 8998
    } else {
     $$2242302 = 1; //@line 9000
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 9003
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 9006
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 9010
      $356 = $$2242302 + 1 | 0; //@line 9011
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 9014
      } else {
       $$2242$lcssa = $356; //@line 9016
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 9022
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 9028
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 9034
       } else {
        $$0 = 1; //@line 9036
        break;
       }
      }
     } else {
      $$0 = 1; //@line 9041
     }
    }
   } else {
    $$0 = $$1248; //@line 9045
   }
  }
 } while (0);
 STACKTOP = sp; //@line 9049
 return $$0 | 0; //@line 9049
}
function _mbed_vtracef($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$0199 = 0, $$1$off0 = 0, $$10 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$13 = 0, $$18 = 0, $$3 = 0, $$3147 = 0, $$3147168 = 0, $$3154 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$6 = 0, $$6150 = 0, $$9 = 0, $$lobit = 0, $$pre = 0, $$sink = 0, $125 = 0, $126 = 0, $151 = 0, $157 = 0, $168 = 0, $169 = 0, $171 = 0, $181 = 0, $182 = 0, $184 = 0, $186 = 0, $194 = 0, $201 = 0, $202 = 0, $204 = 0, $206 = 0, $209 = 0, $34 = 0, $38 = 0, $4 = 0, $43 = 0, $5 = 0, $54 = 0, $55 = 0, $59 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $69 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $76 = 0, $78 = 0, $82 = 0, $89 = 0, $95 = 0, $AsyncCtx = 0, $AsyncCtx27 = 0, $AsyncCtx30 = 0, $AsyncCtx34 = 0, $AsyncCtx38 = 0, $AsyncCtx42 = 0, $AsyncCtx45 = 0, $AsyncCtx49 = 0, $AsyncCtx52 = 0, $AsyncCtx56 = 0, $AsyncCtx60 = 0, $AsyncCtx64 = 0, $extract$t159 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer12 = 0, $vararg_buffer15 = 0, $vararg_buffer18 = 0, $vararg_buffer20 = 0, $vararg_buffer23 = 0, $vararg_buffer3 = 0, $vararg_buffer6 = 0, $vararg_buffer9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1799
 STACKTOP = STACKTOP + 96 | 0; //@line 1800
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(96); //@line 1800
 $vararg_buffer23 = sp + 72 | 0; //@line 1801
 $vararg_buffer20 = sp + 64 | 0; //@line 1802
 $vararg_buffer18 = sp + 56 | 0; //@line 1803
 $vararg_buffer15 = sp + 48 | 0; //@line 1804
 $vararg_buffer12 = sp + 40 | 0; //@line 1805
 $vararg_buffer9 = sp + 32 | 0; //@line 1806
 $vararg_buffer6 = sp + 24 | 0; //@line 1807
 $vararg_buffer3 = sp + 16 | 0; //@line 1808
 $vararg_buffer1 = sp + 8 | 0; //@line 1809
 $vararg_buffer = sp; //@line 1810
 $4 = sp + 80 | 0; //@line 1811
 $5 = HEAP32[55] | 0; //@line 1812
 do {
  if ($5 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(104, sp) | 0; //@line 1816
   FUNCTION_TABLE_v[$5 & 7](); //@line 1817
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 35; //@line 1820
    HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer1; //@line 1822
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer1; //@line 1824
    HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer20; //@line 1826
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer20; //@line 1828
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer3; //@line 1830
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer3; //@line 1832
    HEAP32[$AsyncCtx + 28 >> 2] = $vararg_buffer9; //@line 1834
    HEAP32[$AsyncCtx + 32 >> 2] = $1; //@line 1836
    HEAP32[$AsyncCtx + 36 >> 2] = $vararg_buffer9; //@line 1838
    HEAP32[$AsyncCtx + 40 >> 2] = $vararg_buffer12; //@line 1840
    HEAP32[$AsyncCtx + 44 >> 2] = $vararg_buffer12; //@line 1842
    HEAP32[$AsyncCtx + 48 >> 2] = $vararg_buffer15; //@line 1844
    HEAP32[$AsyncCtx + 52 >> 2] = $vararg_buffer15; //@line 1846
    HEAP32[$AsyncCtx + 56 >> 2] = $vararg_buffer18; //@line 1848
    HEAP32[$AsyncCtx + 60 >> 2] = $vararg_buffer18; //@line 1850
    HEAP8[$AsyncCtx + 64 >> 0] = $0; //@line 1852
    HEAP32[$AsyncCtx + 68 >> 2] = $4; //@line 1854
    HEAP32[$AsyncCtx + 72 >> 2] = $3; //@line 1856
    HEAP32[$AsyncCtx + 76 >> 2] = $2; //@line 1858
    HEAP32[$AsyncCtx + 80 >> 2] = $vararg_buffer6; //@line 1860
    HEAP32[$AsyncCtx + 84 >> 2] = $vararg_buffer6; //@line 1862
    HEAP32[$AsyncCtx + 88 >> 2] = $vararg_buffer23; //@line 1864
    HEAP32[$AsyncCtx + 92 >> 2] = $vararg_buffer23; //@line 1866
    HEAP32[$AsyncCtx + 96 >> 2] = $vararg_buffer; //@line 1868
    HEAP32[$AsyncCtx + 100 >> 2] = $vararg_buffer; //@line 1870
    sp = STACKTOP; //@line 1871
    STACKTOP = sp; //@line 1872
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 1874
    HEAP32[57] = (HEAP32[57] | 0) + 1; //@line 1877
    break;
   }
  }
 } while (0);
 $34 = HEAP32[46] | 0; //@line 1882
 do {
  if ($34 | 0) {
   HEAP8[$34 >> 0] = 0; //@line 1886
   do {
    if ($0 << 24 >> 24 > -1 & ($1 | 0) != 0) {
     $38 = HEAP32[43] | 0; //@line 1892
     if (HEAP8[$38 >> 0] | 0) {
      if (_strstr($38, $1) | 0) {
       $$0$i = 1; //@line 1899
       break;
      }
     }
     $43 = HEAP32[44] | 0; //@line 1903
     if (!(HEAP8[$43 >> 0] | 0)) {
      label = 11; //@line 1907
     } else {
      if (!(_strstr($43, $1) | 0)) {
       $$0$i = 1; //@line 1912
      } else {
       label = 11; //@line 1914
      }
     }
    } else {
     label = 11; //@line 1918
    }
   } while (0);
   if ((label | 0) == 11) {
    $$0$i = 0; //@line 1922
   }
   if (!((HEAP32[53] | 0) != 0 & ((($1 | 0) == 0 | (($2 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[50] = HEAP32[48]; //@line 1934
    break;
   }
   $54 = HEAPU8[168] | 0; //@line 1938
   $55 = $0 & 255; //@line 1939
   if ($55 & 31 & $54 | 0) {
    $59 = $54 & 64; //@line 1944
    $$lobit = $59 >>> 6; //@line 1945
    $60 = $$lobit & 255; //@line 1946
    $64 = ($54 & 32 | 0) == 0; //@line 1950
    $65 = HEAP32[47] | 0; //@line 1951
    $66 = HEAP32[46] | 0; //@line 1952
    $67 = $0 << 24 >> 24 == 1; //@line 1953
    do {
     if ($67 | ($54 & 128 | 0) != 0) {
      $AsyncCtx64 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1957
      _vsnprintf($66, $65, $2, $3) | 0; //@line 1958
      if (___async) {
       HEAP32[$AsyncCtx64 >> 2] = 36; //@line 1961
       HEAP8[$AsyncCtx64 + 4 >> 0] = $67 & 1; //@line 1964
       sp = STACKTOP; //@line 1965
       STACKTOP = sp; //@line 1966
       return;
      }
      _emscripten_free_async_context($AsyncCtx64 | 0); //@line 1968
      $69 = HEAP32[54] | 0; //@line 1969
      if (!($67 & ($69 | 0) != 0)) {
       $73 = HEAP32[53] | 0; //@line 1973
       $74 = HEAP32[46] | 0; //@line 1974
       $AsyncCtx34 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1975
       FUNCTION_TABLE_vi[$73 & 255]($74); //@line 1976
       if (___async) {
        HEAP32[$AsyncCtx34 >> 2] = 39; //@line 1979
        sp = STACKTOP; //@line 1980
        STACKTOP = sp; //@line 1981
        return;
       } else {
        _emscripten_free_async_context($AsyncCtx34 | 0); //@line 1983
        break;
       }
      }
      $71 = HEAP32[46] | 0; //@line 1987
      $AsyncCtx27 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1988
      FUNCTION_TABLE_vi[$69 & 255]($71); //@line 1989
      if (___async) {
       HEAP32[$AsyncCtx27 >> 2] = 37; //@line 1992
       sp = STACKTOP; //@line 1993
       STACKTOP = sp; //@line 1994
       return;
      }
      _emscripten_free_async_context($AsyncCtx27 | 0); //@line 1996
      $72 = HEAP32[54] | 0; //@line 1997
      $AsyncCtx30 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1998
      FUNCTION_TABLE_vi[$72 & 255](1310); //@line 1999
      if (___async) {
       HEAP32[$AsyncCtx30 >> 2] = 38; //@line 2002
       sp = STACKTOP; //@line 2003
       STACKTOP = sp; //@line 2004
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx30 | 0); //@line 2006
       break;
      }
     } else {
      if (!$59) {
       $$1$off0 = ($$lobit | 0) != 0; //@line 2013
       $$1143 = $66; //@line 2013
       $$1145 = $65; //@line 2013
       $$3154 = 0; //@line 2013
       label = 38; //@line 2014
      } else {
       if ($64) {
        $$0142 = $66; //@line 2017
        $$0144 = $65; //@line 2017
       } else {
        $76 = _snprintf($66, $65, 1312, $vararg_buffer) | 0; //@line 2019
        $$ = ($76 | 0) >= ($65 | 0) ? 0 : $76; //@line 2021
        $78 = ($$ | 0) > 0; //@line 2022
        $$0142 = $78 ? $66 + $$ | 0 : $66; //@line 2027
        $$0144 = $65 - ($78 ? $$ : 0) | 0; //@line 2027
       }
       if (($$0144 | 0) > 0) {
        $82 = $55 + -2 | 0; //@line 2031
        switch ($82 >>> 1 | $82 << 31 | 0) {
        case 0:
         {
          $$sink = 1330; //@line 2037
          label = 35; //@line 2038
          break;
         }
        case 1:
         {
          $$sink = 1336; //@line 2042
          label = 35; //@line 2043
          break;
         }
        case 3:
         {
          $$sink = 1324; //@line 2047
          label = 35; //@line 2048
          break;
         }
        case 7:
         {
          $$sink = 1318; //@line 2052
          label = 35; //@line 2053
          break;
         }
        default:
         {
          $$0141 = 0; //@line 2057
          $$1152 = 0; //@line 2057
         }
        }
        if ((label | 0) == 35) {
         HEAP32[$vararg_buffer1 >> 2] = $$sink; //@line 2061
         $$0141 = $60 & 1; //@line 2064
         $$1152 = _snprintf($$0142, $$0144, 1342, $vararg_buffer1) | 0; //@line 2064
        }
        $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 2067
        $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 2069
        if (($$1152$ | 0) > 0) {
         $89 = $$0141 << 24 >> 24 == 0; //@line 2071
         $$1$off0 = $extract$t159; //@line 2076
         $$1143 = $89 ? $$0142 : $$0142 + $$1152$ | 0; //@line 2076
         $$1145 = $$0144 - ($89 ? 0 : $$1152$) | 0; //@line 2076
         $$3154 = $$1152; //@line 2076
         label = 38; //@line 2077
        } else {
         $$1$off0 = $extract$t159; //@line 2079
         $$1143 = $$0142; //@line 2079
         $$1145 = $$0144; //@line 2079
         $$3154 = $$1152$; //@line 2079
         label = 38; //@line 2080
        }
       }
      }
      L54 : do {
       if ((label | 0) == 38) {
        do {
         if (($$1145 | 0) > 0 & (HEAP32[51] | 0) != 0) {
          HEAP32[$4 >> 2] = HEAP32[$3 >> 2]; //@line 2093
          $AsyncCtx60 = _emscripten_alloc_async_context(104, sp) | 0; //@line 2094
          $95 = _vsnprintf(0, 0, $2, $4) | 0; //@line 2095
          if (___async) {
           HEAP32[$AsyncCtx60 >> 2] = 40; //@line 2098
           HEAP32[$AsyncCtx60 + 4 >> 2] = $vararg_buffer20; //@line 2100
           HEAP32[$AsyncCtx60 + 8 >> 2] = $vararg_buffer20; //@line 2102
           HEAP32[$AsyncCtx60 + 12 >> 2] = $vararg_buffer3; //@line 2104
           HEAP32[$AsyncCtx60 + 16 >> 2] = $$1143; //@line 2106
           HEAP32[$AsyncCtx60 + 20 >> 2] = $$1145; //@line 2108
           HEAP32[$AsyncCtx60 + 24 >> 2] = $vararg_buffer3; //@line 2110
           HEAP32[$AsyncCtx60 + 28 >> 2] = $4; //@line 2112
           HEAP32[$AsyncCtx60 + 32 >> 2] = $vararg_buffer9; //@line 2114
           HEAP32[$AsyncCtx60 + 36 >> 2] = $1; //@line 2116
           HEAP32[$AsyncCtx60 + 40 >> 2] = $vararg_buffer9; //@line 2118
           HEAP32[$AsyncCtx60 + 44 >> 2] = $vararg_buffer12; //@line 2120
           HEAP32[$AsyncCtx60 + 48 >> 2] = $vararg_buffer12; //@line 2122
           HEAP32[$AsyncCtx60 + 52 >> 2] = $vararg_buffer15; //@line 2124
           HEAP32[$AsyncCtx60 + 56 >> 2] = $vararg_buffer15; //@line 2126
           HEAP32[$AsyncCtx60 + 60 >> 2] = $vararg_buffer18; //@line 2128
           HEAP32[$AsyncCtx60 + 64 >> 2] = $vararg_buffer18; //@line 2130
           HEAP32[$AsyncCtx60 + 68 >> 2] = $55; //@line 2132
           HEAP32[$AsyncCtx60 + 72 >> 2] = $vararg_buffer6; //@line 2134
           HEAP32[$AsyncCtx60 + 76 >> 2] = $vararg_buffer6; //@line 2136
           HEAP32[$AsyncCtx60 + 80 >> 2] = $vararg_buffer23; //@line 2138
           HEAP32[$AsyncCtx60 + 84 >> 2] = $vararg_buffer23; //@line 2140
           HEAP8[$AsyncCtx60 + 88 >> 0] = $$1$off0 & 1; //@line 2143
           HEAP32[$AsyncCtx60 + 92 >> 2] = $2; //@line 2145
           HEAP32[$AsyncCtx60 + 96 >> 2] = $3; //@line 2147
           HEAP32[$AsyncCtx60 + 100 >> 2] = $$3154; //@line 2149
           sp = STACKTOP; //@line 2150
           STACKTOP = sp; //@line 2151
           return;
          }
          _emscripten_free_async_context($AsyncCtx60 | 0); //@line 2153
          $125 = HEAP32[51] | 0; //@line 2158
          $AsyncCtx38 = _emscripten_alloc_async_context(100, sp) | 0; //@line 2159
          $126 = FUNCTION_TABLE_ii[$125 & 3](($$3154 | 0 ? 4 : 0) + $$3154 + $95 | 0) | 0; //@line 2160
          if (___async) {
           HEAP32[$AsyncCtx38 >> 2] = 41; //@line 2163
           HEAP32[$AsyncCtx38 + 4 >> 2] = $vararg_buffer20; //@line 2165
           HEAP32[$AsyncCtx38 + 8 >> 2] = $vararg_buffer20; //@line 2167
           HEAP32[$AsyncCtx38 + 12 >> 2] = $vararg_buffer3; //@line 2169
           HEAP32[$AsyncCtx38 + 16 >> 2] = $$1143; //@line 2171
           HEAP32[$AsyncCtx38 + 20 >> 2] = $$1145; //@line 2173
           HEAP32[$AsyncCtx38 + 24 >> 2] = $vararg_buffer3; //@line 2175
           HEAP32[$AsyncCtx38 + 28 >> 2] = $4; //@line 2177
           HEAP32[$AsyncCtx38 + 32 >> 2] = $vararg_buffer9; //@line 2179
           HEAP32[$AsyncCtx38 + 36 >> 2] = $1; //@line 2181
           HEAP32[$AsyncCtx38 + 40 >> 2] = $vararg_buffer9; //@line 2183
           HEAP32[$AsyncCtx38 + 44 >> 2] = $vararg_buffer12; //@line 2185
           HEAP32[$AsyncCtx38 + 48 >> 2] = $vararg_buffer12; //@line 2187
           HEAP32[$AsyncCtx38 + 52 >> 2] = $vararg_buffer15; //@line 2189
           HEAP32[$AsyncCtx38 + 56 >> 2] = $vararg_buffer15; //@line 2191
           HEAP32[$AsyncCtx38 + 60 >> 2] = $vararg_buffer18; //@line 2193
           HEAP32[$AsyncCtx38 + 64 >> 2] = $vararg_buffer18; //@line 2195
           HEAP32[$AsyncCtx38 + 68 >> 2] = $55; //@line 2197
           HEAP32[$AsyncCtx38 + 72 >> 2] = $vararg_buffer6; //@line 2199
           HEAP32[$AsyncCtx38 + 76 >> 2] = $vararg_buffer6; //@line 2201
           HEAP32[$AsyncCtx38 + 80 >> 2] = $vararg_buffer23; //@line 2203
           HEAP32[$AsyncCtx38 + 84 >> 2] = $vararg_buffer23; //@line 2205
           HEAP8[$AsyncCtx38 + 88 >> 0] = $$1$off0 & 1; //@line 2208
           HEAP32[$AsyncCtx38 + 92 >> 2] = $2; //@line 2210
           HEAP32[$AsyncCtx38 + 96 >> 2] = $3; //@line 2212
           sp = STACKTOP; //@line 2213
           STACKTOP = sp; //@line 2214
           return;
          } else {
           _emscripten_free_async_context($AsyncCtx38 | 0); //@line 2216
           HEAP32[$vararg_buffer3 >> 2] = $126; //@line 2217
           $151 = _snprintf($$1143, $$1145, 1342, $vararg_buffer3) | 0; //@line 2218
           $$10 = ($151 | 0) >= ($$1145 | 0) ? 0 : $151; //@line 2220
           if (($$10 | 0) > 0) {
            $$3 = $$1143 + $$10 | 0; //@line 2225
            $$3147 = $$1145 - $$10 | 0; //@line 2225
            label = 44; //@line 2226
            break;
           } else {
            $$3147168 = $$1145; //@line 2229
            $$3169 = $$1143; //@line 2229
            break;
           }
          }
         } else {
          $$3 = $$1143; //@line 2234
          $$3147 = $$1145; //@line 2234
          label = 44; //@line 2235
         }
        } while (0);
        if ((label | 0) == 44) {
         if (($$3147 | 0) > 0) {
          $$3147168 = $$3147; //@line 2241
          $$3169 = $$3; //@line 2241
         } else {
          break;
         }
        }
        $157 = $55 + -2 | 0; //@line 2246
        switch ($157 >>> 1 | $157 << 31 | 0) {
        case 0:
         {
          HEAP32[$vararg_buffer6 >> 2] = $1; //@line 2252
          $$5156 = _snprintf($$3169, $$3147168, 1345, $vararg_buffer6) | 0; //@line 2254
          break;
         }
        case 1:
         {
          HEAP32[$vararg_buffer9 >> 2] = $1; //@line 2258
          $$5156 = _snprintf($$3169, $$3147168, 1360, $vararg_buffer9) | 0; //@line 2260
          break;
         }
        case 3:
         {
          HEAP32[$vararg_buffer12 >> 2] = $1; //@line 2264
          $$5156 = _snprintf($$3169, $$3147168, 1375, $vararg_buffer12) | 0; //@line 2266
          break;
         }
        case 7:
         {
          HEAP32[$vararg_buffer15 >> 2] = $1; //@line 2270
          $$5156 = _snprintf($$3169, $$3147168, 1390, $vararg_buffer15) | 0; //@line 2272
          break;
         }
        default:
         {
          $$5156 = _snprintf($$3169, $$3147168, 1405, $vararg_buffer18) | 0; //@line 2277
         }
        }
        $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 2281
        $168 = $$3169 + $$5156$ | 0; //@line 2283
        $169 = $$3147168 - $$5156$ | 0; //@line 2284
        if (($$5156$ | 0) > 0 & ($169 | 0) > 0) {
         $AsyncCtx56 = _emscripten_alloc_async_context(32, sp) | 0; //@line 2288
         $171 = _vsnprintf($168, $169, $2, $3) | 0; //@line 2289
         if (___async) {
          HEAP32[$AsyncCtx56 >> 2] = 42; //@line 2292
          HEAP32[$AsyncCtx56 + 4 >> 2] = $vararg_buffer20; //@line 2294
          HEAP32[$AsyncCtx56 + 8 >> 2] = $vararg_buffer20; //@line 2296
          HEAP32[$AsyncCtx56 + 12 >> 2] = $169; //@line 2298
          HEAP32[$AsyncCtx56 + 16 >> 2] = $168; //@line 2300
          HEAP32[$AsyncCtx56 + 20 >> 2] = $vararg_buffer23; //@line 2302
          HEAP32[$AsyncCtx56 + 24 >> 2] = $vararg_buffer23; //@line 2304
          HEAP8[$AsyncCtx56 + 28 >> 0] = $$1$off0 & 1; //@line 2307
          sp = STACKTOP; //@line 2308
          STACKTOP = sp; //@line 2309
          return;
         }
         _emscripten_free_async_context($AsyncCtx56 | 0); //@line 2311
         $$13 = ($171 | 0) >= ($169 | 0) ? 0 : $171; //@line 2313
         $181 = $168 + $$13 | 0; //@line 2315
         $182 = $169 - $$13 | 0; //@line 2316
         if (($$13 | 0) > 0) {
          $184 = HEAP32[52] | 0; //@line 2319
          do {
           if (($182 | 0) > 0 & ($184 | 0) != 0) {
            $AsyncCtx42 = _emscripten_alloc_async_context(32, sp) | 0; //@line 2324
            $186 = FUNCTION_TABLE_i[$184 & 0]() | 0; //@line 2325
            if (___async) {
             HEAP32[$AsyncCtx42 >> 2] = 43; //@line 2328
             HEAP32[$AsyncCtx42 + 4 >> 2] = $vararg_buffer20; //@line 2330
             HEAP32[$AsyncCtx42 + 8 >> 2] = $181; //@line 2332
             HEAP32[$AsyncCtx42 + 12 >> 2] = $182; //@line 2334
             HEAP32[$AsyncCtx42 + 16 >> 2] = $vararg_buffer20; //@line 2336
             HEAP8[$AsyncCtx42 + 20 >> 0] = $$1$off0 & 1; //@line 2339
             HEAP32[$AsyncCtx42 + 24 >> 2] = $vararg_buffer23; //@line 2341
             HEAP32[$AsyncCtx42 + 28 >> 2] = $vararg_buffer23; //@line 2343
             sp = STACKTOP; //@line 2344
             STACKTOP = sp; //@line 2345
             return;
            } else {
             _emscripten_free_async_context($AsyncCtx42 | 0); //@line 2347
             HEAP32[$vararg_buffer20 >> 2] = $186; //@line 2348
             $194 = _snprintf($181, $182, 1342, $vararg_buffer20) | 0; //@line 2349
             $$18 = ($194 | 0) >= ($182 | 0) ? 0 : $194; //@line 2351
             if (($$18 | 0) > 0) {
              $$6 = $181 + $$18 | 0; //@line 2356
              $$6150 = $182 - $$18 | 0; //@line 2356
              $$9 = $$18; //@line 2356
              break;
             } else {
              break L54;
             }
            }
           } else {
            $$6 = $181; //@line 2363
            $$6150 = $182; //@line 2363
            $$9 = $$13; //@line 2363
           }
          } while (0);
          if (!(($$9 | 0) < 1 | ($$6150 | 0) < 1 | $$1$off0 ^ 1)) {
           _snprintf($$6, $$6150, 1420, $vararg_buffer23) | 0; //@line 2372
          }
         }
        }
       }
      } while (0);
      $201 = HEAP32[53] | 0; //@line 2378
      $202 = HEAP32[46] | 0; //@line 2379
      $AsyncCtx45 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2380
      FUNCTION_TABLE_vi[$201 & 255]($202); //@line 2381
      if (___async) {
       HEAP32[$AsyncCtx45 >> 2] = 44; //@line 2384
       sp = STACKTOP; //@line 2385
       STACKTOP = sp; //@line 2386
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx45 | 0); //@line 2388
       break;
      }
     }
    } while (0);
    HEAP32[50] = HEAP32[48]; //@line 2394
   }
  }
 } while (0);
 $204 = HEAP32[56] | 0; //@line 2398
 if (!$204) {
  STACKTOP = sp; //@line 2401
  return;
 }
 $206 = HEAP32[57] | 0; //@line 2403
 HEAP32[57] = 0; //@line 2404
 $AsyncCtx49 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2405
 FUNCTION_TABLE_v[$204 & 7](); //@line 2406
 if (___async) {
  HEAP32[$AsyncCtx49 >> 2] = 45; //@line 2409
  HEAP32[$AsyncCtx49 + 4 >> 2] = $206; //@line 2411
  sp = STACKTOP; //@line 2412
  STACKTOP = sp; //@line 2413
  return;
 }
 _emscripten_free_async_context($AsyncCtx49 | 0); //@line 2415
 if (($206 | 0) > 1) {
  $$0199 = $206; //@line 2418
 } else {
  STACKTOP = sp; //@line 2420
  return;
 }
 while (1) {
  $209 = $$0199 + -1 | 0; //@line 2423
  $$pre = HEAP32[56] | 0; //@line 2424
  $AsyncCtx52 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2425
  FUNCTION_TABLE_v[$$pre & 7](); //@line 2426
  if (___async) {
   label = 70; //@line 2429
   break;
  }
  _emscripten_free_async_context($AsyncCtx52 | 0); //@line 2432
  if (($$0199 | 0) > 2) {
   $$0199 = $209; //@line 2435
  } else {
   label = 72; //@line 2437
   break;
  }
 }
 if ((label | 0) == 70) {
  HEAP32[$AsyncCtx52 >> 2] = 46; //@line 2442
  HEAP32[$AsyncCtx52 + 4 >> 2] = $$0199; //@line 2444
  HEAP32[$AsyncCtx52 + 8 >> 2] = $209; //@line 2446
  sp = STACKTOP; //@line 2447
  STACKTOP = sp; //@line 2448
  return;
 } else if ((label | 0) == 72) {
  STACKTOP = sp; //@line 2451
  return;
 }
}
function _mbed_vtracef__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$1$off0 = 0, $$1$off0$expand_i1_val = 0, $$1$off0$expand_i1_val18 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$3154 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $$lobit = 0, $$sink = 0, $10 = 0, $102 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $136 = 0, $14 = 0, $147 = 0, $148 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $163 = 0, $164 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $53 = 0, $57 = 0, $6 = 0, $62 = 0, $73 = 0, $74 = 0, $78 = 0, $79 = 0, $8 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $89 = 0, $91 = 0, $95 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx11 = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx7 = 0, $ReallocAsyncCtx8 = 0, $extract$t159 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2290
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2292
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2296
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2298
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2300
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2302
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2304
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2306
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2308
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2310
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 2312
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 2314
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 2316
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 2318
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 2320
 $32 = HEAP8[$0 + 64 >> 0] | 0; //@line 2322
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 2324
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 2326
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 2328
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 2330
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 2332
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 2334
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 2336
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 2338
 HEAP32[57] = (HEAP32[57] | 0) + 1; //@line 2343
 $53 = HEAP32[46] | 0; //@line 2344
 do {
  if ($53 | 0) {
   HEAP8[$53 >> 0] = 0; //@line 2348
   do {
    if ($32 << 24 >> 24 > -1 & ($16 | 0) != 0) {
     $57 = HEAP32[43] | 0; //@line 2354
     if (HEAP8[$57 >> 0] | 0) {
      if (_strstr($57, $16) | 0) {
       $$0$i = 1; //@line 2361
       break;
      }
     }
     $62 = HEAP32[44] | 0; //@line 2365
     if (!(HEAP8[$62 >> 0] | 0)) {
      label = 9; //@line 2369
     } else {
      if (!(_strstr($62, $16) | 0)) {
       $$0$i = 1; //@line 2374
      } else {
       label = 9; //@line 2376
      }
     }
    } else {
     label = 9; //@line 2380
    }
   } while (0);
   if ((label | 0) == 9) {
    $$0$i = 0; //@line 2384
   }
   if (!((HEAP32[53] | 0) != 0 & ((($16 | 0) == 0 | (($38 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[50] = HEAP32[48]; //@line 2396
    break;
   }
   $73 = HEAPU8[168] | 0; //@line 2400
   $74 = $32 & 255; //@line 2401
   if ($74 & 31 & $73 | 0) {
    $78 = $73 & 64; //@line 2406
    $$lobit = $78 >>> 6; //@line 2407
    $79 = $$lobit & 255; //@line 2408
    $83 = ($73 & 32 | 0) == 0; //@line 2412
    $84 = HEAP32[47] | 0; //@line 2413
    $85 = HEAP32[46] | 0; //@line 2414
    $86 = $32 << 24 >> 24 == 1; //@line 2415
    if ($86 | ($73 & 128 | 0) != 0) {
     $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 2418
     _vsnprintf($85, $84, $38, $36) | 0; //@line 2419
     if (___async) {
      HEAP32[$ReallocAsyncCtx12 >> 2] = 36; //@line 2422
      $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 2423
      $$expand_i1_val = $86 & 1; //@line 2424
      HEAP8[$87 >> 0] = $$expand_i1_val; //@line 2425
      sp = STACKTOP; //@line 2426
      return;
     }
     ___async_unwind = 0; //@line 2429
     HEAP32[$ReallocAsyncCtx12 >> 2] = 36; //@line 2430
     $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 2431
     $$expand_i1_val = $86 & 1; //@line 2432
     HEAP8[$87 >> 0] = $$expand_i1_val; //@line 2433
     sp = STACKTOP; //@line 2434
     return;
    }
    if (!$78) {
     $$1$off0 = ($$lobit | 0) != 0; //@line 2440
     $$1143 = $85; //@line 2440
     $$1145 = $84; //@line 2440
     $$3154 = 0; //@line 2440
     label = 28; //@line 2441
    } else {
     if ($83) {
      $$0142 = $85; //@line 2444
      $$0144 = $84; //@line 2444
     } else {
      $89 = _snprintf($85, $84, 1312, $48) | 0; //@line 2446
      $$ = ($89 | 0) >= ($84 | 0) ? 0 : $89; //@line 2448
      $91 = ($$ | 0) > 0; //@line 2449
      $$0142 = $91 ? $85 + $$ | 0 : $85; //@line 2454
      $$0144 = $84 - ($91 ? $$ : 0) | 0; //@line 2454
     }
     if (($$0144 | 0) > 0) {
      $95 = $74 + -2 | 0; //@line 2458
      switch ($95 >>> 1 | $95 << 31 | 0) {
      case 0:
       {
        $$sink = 1330; //@line 2464
        label = 25; //@line 2465
        break;
       }
      case 1:
       {
        $$sink = 1336; //@line 2469
        label = 25; //@line 2470
        break;
       }
      case 3:
       {
        $$sink = 1324; //@line 2474
        label = 25; //@line 2475
        break;
       }
      case 7:
       {
        $$sink = 1318; //@line 2479
        label = 25; //@line 2480
        break;
       }
      default:
       {
        $$0141 = 0; //@line 2484
        $$1152 = 0; //@line 2484
       }
      }
      if ((label | 0) == 25) {
       HEAP32[$2 >> 2] = $$sink; //@line 2488
       $$0141 = $79 & 1; //@line 2491
       $$1152 = _snprintf($$0142, $$0144, 1342, $2) | 0; //@line 2491
      }
      $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 2494
      $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 2496
      if (($$1152$ | 0) > 0) {
       $102 = $$0141 << 24 >> 24 == 0; //@line 2498
       $$1$off0 = $extract$t159; //@line 2503
       $$1143 = $102 ? $$0142 : $$0142 + $$1152$ | 0; //@line 2503
       $$1145 = $$0144 - ($102 ? 0 : $$1152$) | 0; //@line 2503
       $$3154 = $$1152; //@line 2503
       label = 28; //@line 2504
      } else {
       $$1$off0 = $extract$t159; //@line 2506
       $$1143 = $$0142; //@line 2506
       $$1145 = $$0144; //@line 2506
       $$3154 = $$1152$; //@line 2506
       label = 28; //@line 2507
      }
     }
    }
    if ((label | 0) == 28) {
     if (($$1145 | 0) > 0 & (HEAP32[51] | 0) != 0) {
      HEAP32[$34 >> 2] = HEAP32[$36 >> 2]; //@line 2518
      $ReallocAsyncCtx11 = _emscripten_realloc_async_context(104) | 0; //@line 2519
      $108 = _vsnprintf(0, 0, $38, $34) | 0; //@line 2520
      if (___async) {
       HEAP32[$ReallocAsyncCtx11 >> 2] = 40; //@line 2523
       $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 2524
       HEAP32[$109 >> 2] = $6; //@line 2525
       $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 2526
       HEAP32[$110 >> 2] = $8; //@line 2527
       $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 2528
       HEAP32[$111 >> 2] = $10; //@line 2529
       $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 2530
       HEAP32[$112 >> 2] = $$1143; //@line 2531
       $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 2532
       HEAP32[$113 >> 2] = $$1145; //@line 2533
       $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 2534
       HEAP32[$114 >> 2] = $12; //@line 2535
       $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 2536
       HEAP32[$115 >> 2] = $34; //@line 2537
       $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 2538
       HEAP32[$116 >> 2] = $14; //@line 2539
       $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 2540
       HEAP32[$117 >> 2] = $16; //@line 2541
       $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 2542
       HEAP32[$118 >> 2] = $18; //@line 2543
       $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 2544
       HEAP32[$119 >> 2] = $20; //@line 2545
       $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 2546
       HEAP32[$120 >> 2] = $22; //@line 2547
       $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 2548
       HEAP32[$121 >> 2] = $24; //@line 2549
       $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 2550
       HEAP32[$122 >> 2] = $26; //@line 2551
       $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 2552
       HEAP32[$123 >> 2] = $28; //@line 2553
       $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 2554
       HEAP32[$124 >> 2] = $30; //@line 2555
       $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 2556
       HEAP32[$125 >> 2] = $74; //@line 2557
       $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 2558
       HEAP32[$126 >> 2] = $40; //@line 2559
       $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 2560
       HEAP32[$127 >> 2] = $42; //@line 2561
       $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 2562
       HEAP32[$128 >> 2] = $44; //@line 2563
       $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 2564
       HEAP32[$129 >> 2] = $46; //@line 2565
       $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 2566
       $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 2567
       HEAP8[$130 >> 0] = $$1$off0$expand_i1_val; //@line 2568
       $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 2569
       HEAP32[$131 >> 2] = $38; //@line 2570
       $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 2571
       HEAP32[$132 >> 2] = $36; //@line 2572
       $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 2573
       HEAP32[$133 >> 2] = $$3154; //@line 2574
       sp = STACKTOP; //@line 2575
       return;
      }
      HEAP32[___async_retval >> 2] = $108; //@line 2579
      ___async_unwind = 0; //@line 2580
      HEAP32[$ReallocAsyncCtx11 >> 2] = 40; //@line 2581
      $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 2582
      HEAP32[$109 >> 2] = $6; //@line 2583
      $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 2584
      HEAP32[$110 >> 2] = $8; //@line 2585
      $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 2586
      HEAP32[$111 >> 2] = $10; //@line 2587
      $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 2588
      HEAP32[$112 >> 2] = $$1143; //@line 2589
      $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 2590
      HEAP32[$113 >> 2] = $$1145; //@line 2591
      $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 2592
      HEAP32[$114 >> 2] = $12; //@line 2593
      $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 2594
      HEAP32[$115 >> 2] = $34; //@line 2595
      $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 2596
      HEAP32[$116 >> 2] = $14; //@line 2597
      $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 2598
      HEAP32[$117 >> 2] = $16; //@line 2599
      $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 2600
      HEAP32[$118 >> 2] = $18; //@line 2601
      $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 2602
      HEAP32[$119 >> 2] = $20; //@line 2603
      $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 2604
      HEAP32[$120 >> 2] = $22; //@line 2605
      $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 2606
      HEAP32[$121 >> 2] = $24; //@line 2607
      $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 2608
      HEAP32[$122 >> 2] = $26; //@line 2609
      $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 2610
      HEAP32[$123 >> 2] = $28; //@line 2611
      $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 2612
      HEAP32[$124 >> 2] = $30; //@line 2613
      $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 2614
      HEAP32[$125 >> 2] = $74; //@line 2615
      $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 2616
      HEAP32[$126 >> 2] = $40; //@line 2617
      $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 2618
      HEAP32[$127 >> 2] = $42; //@line 2619
      $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 2620
      HEAP32[$128 >> 2] = $44; //@line 2621
      $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 2622
      HEAP32[$129 >> 2] = $46; //@line 2623
      $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 2624
      $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 2625
      HEAP8[$130 >> 0] = $$1$off0$expand_i1_val; //@line 2626
      $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 2627
      HEAP32[$131 >> 2] = $38; //@line 2628
      $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 2629
      HEAP32[$132 >> 2] = $36; //@line 2630
      $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 2631
      HEAP32[$133 >> 2] = $$3154; //@line 2632
      sp = STACKTOP; //@line 2633
      return;
     }
     if (($$1145 | 0) > 0) {
      $136 = $74 + -2 | 0; //@line 2638
      switch ($136 >>> 1 | $136 << 31 | 0) {
      case 0:
       {
        HEAP32[$40 >> 2] = $16; //@line 2644
        $$5156 = _snprintf($$1143, $$1145, 1345, $40) | 0; //@line 2646
        break;
       }
      case 1:
       {
        HEAP32[$14 >> 2] = $16; //@line 2650
        $$5156 = _snprintf($$1143, $$1145, 1360, $14) | 0; //@line 2652
        break;
       }
      case 3:
       {
        HEAP32[$20 >> 2] = $16; //@line 2656
        $$5156 = _snprintf($$1143, $$1145, 1375, $20) | 0; //@line 2658
        break;
       }
      case 7:
       {
        HEAP32[$24 >> 2] = $16; //@line 2662
        $$5156 = _snprintf($$1143, $$1145, 1390, $24) | 0; //@line 2664
        break;
       }
      default:
       {
        $$5156 = _snprintf($$1143, $$1145, 1405, $28) | 0; //@line 2669
       }
      }
      $$5156$ = ($$5156 | 0) < ($$1145 | 0) ? $$5156 : 0; //@line 2673
      $147 = $$1143 + $$5156$ | 0; //@line 2675
      $148 = $$1145 - $$5156$ | 0; //@line 2676
      if (($$5156$ | 0) > 0 & ($148 | 0) > 0) {
       $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 2680
       $150 = _vsnprintf($147, $148, $38, $36) | 0; //@line 2681
       if (___async) {
        HEAP32[$ReallocAsyncCtx10 >> 2] = 42; //@line 2684
        $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 2685
        HEAP32[$151 >> 2] = $6; //@line 2686
        $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 2687
        HEAP32[$152 >> 2] = $8; //@line 2688
        $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 2689
        HEAP32[$153 >> 2] = $148; //@line 2690
        $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 2691
        HEAP32[$154 >> 2] = $147; //@line 2692
        $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 2693
        HEAP32[$155 >> 2] = $44; //@line 2694
        $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 2695
        HEAP32[$156 >> 2] = $46; //@line 2696
        $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 2697
        $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 2698
        HEAP8[$157 >> 0] = $$1$off0$expand_i1_val18; //@line 2699
        sp = STACKTOP; //@line 2700
        return;
       }
       HEAP32[___async_retval >> 2] = $150; //@line 2704
       ___async_unwind = 0; //@line 2705
       HEAP32[$ReallocAsyncCtx10 >> 2] = 42; //@line 2706
       $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 2707
       HEAP32[$151 >> 2] = $6; //@line 2708
       $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 2709
       HEAP32[$152 >> 2] = $8; //@line 2710
       $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 2711
       HEAP32[$153 >> 2] = $148; //@line 2712
       $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 2713
       HEAP32[$154 >> 2] = $147; //@line 2714
       $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 2715
       HEAP32[$155 >> 2] = $44; //@line 2716
       $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 2717
       HEAP32[$156 >> 2] = $46; //@line 2718
       $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 2719
       $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 2720
       HEAP8[$157 >> 0] = $$1$off0$expand_i1_val18; //@line 2721
       sp = STACKTOP; //@line 2722
       return;
      }
     }
    }
    $159 = HEAP32[53] | 0; //@line 2727
    $160 = HEAP32[46] | 0; //@line 2728
    $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 2729
    FUNCTION_TABLE_vi[$159 & 255]($160); //@line 2730
    if (___async) {
     HEAP32[$ReallocAsyncCtx7 >> 2] = 44; //@line 2733
     sp = STACKTOP; //@line 2734
     return;
    }
    ___async_unwind = 0; //@line 2737
    HEAP32[$ReallocAsyncCtx7 >> 2] = 44; //@line 2738
    sp = STACKTOP; //@line 2739
    return;
   }
  }
 } while (0);
 $161 = HEAP32[56] | 0; //@line 2744
 if (!$161) {
  return;
 }
 $163 = HEAP32[57] | 0; //@line 2749
 HEAP32[57] = 0; //@line 2750
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 2751
 FUNCTION_TABLE_v[$161 & 7](); //@line 2752
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 45; //@line 2755
  $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 2756
  HEAP32[$164 >> 2] = $163; //@line 2757
  sp = STACKTOP; //@line 2758
  return;
 }
 ___async_unwind = 0; //@line 2761
 HEAP32[$ReallocAsyncCtx8 >> 2] = 45; //@line 2762
 $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 2763
 HEAP32[$164 >> 2] = $163; //@line 2764
 sp = STACKTOP; //@line 2765
 return;
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 5921
 $3 = HEAP32[1325] | 0; //@line 5922
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 5925
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 5929
 $7 = $6 & 3; //@line 5930
 if (($7 | 0) == 1) {
  _abort(); //@line 5933
 }
 $9 = $6 & -8; //@line 5936
 $10 = $2 + $9 | 0; //@line 5937
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 5942
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 5948
   $17 = $13 + $9 | 0; //@line 5949
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 5952
   }
   if ((HEAP32[1326] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 5958
    $106 = HEAP32[$105 >> 2] | 0; //@line 5959
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 5963
     $$1382 = $17; //@line 5963
     $114 = $16; //@line 5963
     break;
    }
    HEAP32[1323] = $17; //@line 5966
    HEAP32[$105 >> 2] = $106 & -2; //@line 5968
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 5971
    HEAP32[$16 + $17 >> 2] = $17; //@line 5973
    return;
   }
   $21 = $13 >>> 3; //@line 5976
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 5980
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 5982
    $28 = 5324 + ($21 << 1 << 2) | 0; //@line 5984
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 5989
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 5996
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1321] = HEAP32[1321] & ~(1 << $21); //@line 6006
     $$1 = $16; //@line 6007
     $$1382 = $17; //@line 6007
     $114 = $16; //@line 6007
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 6013
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 6017
     }
     $41 = $26 + 8 | 0; //@line 6020
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 6024
     } else {
      _abort(); //@line 6026
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 6031
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 6032
    $$1 = $16; //@line 6033
    $$1382 = $17; //@line 6033
    $114 = $16; //@line 6033
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 6037
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 6039
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 6043
     $60 = $59 + 4 | 0; //@line 6044
     $61 = HEAP32[$60 >> 2] | 0; //@line 6045
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 6048
      if (!$63) {
       $$3 = 0; //@line 6051
       break;
      } else {
       $$1387 = $63; //@line 6054
       $$1390 = $59; //@line 6054
      }
     } else {
      $$1387 = $61; //@line 6057
      $$1390 = $60; //@line 6057
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 6060
      $66 = HEAP32[$65 >> 2] | 0; //@line 6061
      if ($66 | 0) {
       $$1387 = $66; //@line 6064
       $$1390 = $65; //@line 6064
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 6067
      $69 = HEAP32[$68 >> 2] | 0; //@line 6068
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 6073
       $$1390 = $68; //@line 6073
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 6078
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 6081
      $$3 = $$1387; //@line 6082
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 6087
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 6090
     }
     $53 = $51 + 12 | 0; //@line 6093
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 6097
     }
     $56 = $48 + 8 | 0; //@line 6100
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 6104
      HEAP32[$56 >> 2] = $51; //@line 6105
      $$3 = $48; //@line 6106
      break;
     } else {
      _abort(); //@line 6109
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 6116
    $$1382 = $17; //@line 6116
    $114 = $16; //@line 6116
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 6119
    $75 = 5588 + ($74 << 2) | 0; //@line 6120
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 6125
      if (!$$3) {
       HEAP32[1322] = HEAP32[1322] & ~(1 << $74); //@line 6132
       $$1 = $16; //@line 6133
       $$1382 = $17; //@line 6133
       $114 = $16; //@line 6133
       break L10;
      }
     } else {
      if ((HEAP32[1325] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 6140
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 6148
       if (!$$3) {
        $$1 = $16; //@line 6151
        $$1382 = $17; //@line 6151
        $114 = $16; //@line 6151
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1325] | 0; //@line 6159
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 6162
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 6166
    $92 = $16 + 16 | 0; //@line 6167
    $93 = HEAP32[$92 >> 2] | 0; //@line 6168
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 6174
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 6178
       HEAP32[$93 + 24 >> 2] = $$3; //@line 6180
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 6186
    if (!$99) {
     $$1 = $16; //@line 6189
     $$1382 = $17; //@line 6189
     $114 = $16; //@line 6189
    } else {
     if ((HEAP32[1325] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 6194
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 6198
      HEAP32[$99 + 24 >> 2] = $$3; //@line 6200
      $$1 = $16; //@line 6201
      $$1382 = $17; //@line 6201
      $114 = $16; //@line 6201
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 6207
   $$1382 = $9; //@line 6207
   $114 = $2; //@line 6207
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 6212
 }
 $115 = $10 + 4 | 0; //@line 6215
 $116 = HEAP32[$115 >> 2] | 0; //@line 6216
 if (!($116 & 1)) {
  _abort(); //@line 6220
 }
 if (!($116 & 2)) {
  if ((HEAP32[1327] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1324] | 0) + $$1382 | 0; //@line 6230
   HEAP32[1324] = $124; //@line 6231
   HEAP32[1327] = $$1; //@line 6232
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 6235
   if (($$1 | 0) != (HEAP32[1326] | 0)) {
    return;
   }
   HEAP32[1326] = 0; //@line 6241
   HEAP32[1323] = 0; //@line 6242
   return;
  }
  if ((HEAP32[1326] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1323] | 0) + $$1382 | 0; //@line 6249
   HEAP32[1323] = $132; //@line 6250
   HEAP32[1326] = $114; //@line 6251
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 6254
   HEAP32[$114 + $132 >> 2] = $132; //@line 6256
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 6260
  $138 = $116 >>> 3; //@line 6261
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 6266
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 6268
    $145 = 5324 + ($138 << 1 << 2) | 0; //@line 6270
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1325] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 6276
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 6283
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1321] = HEAP32[1321] & ~(1 << $138); //@line 6293
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 6299
    } else {
     if ((HEAP32[1325] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 6304
     }
     $160 = $143 + 8 | 0; //@line 6307
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 6311
     } else {
      _abort(); //@line 6313
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 6318
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 6319
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 6322
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 6324
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 6328
      $180 = $179 + 4 | 0; //@line 6329
      $181 = HEAP32[$180 >> 2] | 0; //@line 6330
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 6333
       if (!$183) {
        $$3400 = 0; //@line 6336
        break;
       } else {
        $$1398 = $183; //@line 6339
        $$1402 = $179; //@line 6339
       }
      } else {
       $$1398 = $181; //@line 6342
       $$1402 = $180; //@line 6342
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 6345
       $186 = HEAP32[$185 >> 2] | 0; //@line 6346
       if ($186 | 0) {
        $$1398 = $186; //@line 6349
        $$1402 = $185; //@line 6349
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 6352
       $189 = HEAP32[$188 >> 2] | 0; //@line 6353
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 6358
        $$1402 = $188; //@line 6358
       }
      }
      if ((HEAP32[1325] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 6364
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 6367
       $$3400 = $$1398; //@line 6368
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 6373
      if ((HEAP32[1325] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 6377
      }
      $173 = $170 + 12 | 0; //@line 6380
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 6384
      }
      $176 = $167 + 8 | 0; //@line 6387
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 6391
       HEAP32[$176 >> 2] = $170; //@line 6392
       $$3400 = $167; //@line 6393
       break;
      } else {
       _abort(); //@line 6396
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 6404
     $196 = 5588 + ($195 << 2) | 0; //@line 6405
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 6410
       if (!$$3400) {
        HEAP32[1322] = HEAP32[1322] & ~(1 << $195); //@line 6417
        break L108;
       }
      } else {
       if ((HEAP32[1325] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 6424
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 6432
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1325] | 0; //@line 6442
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 6445
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 6449
     $213 = $10 + 16 | 0; //@line 6450
     $214 = HEAP32[$213 >> 2] | 0; //@line 6451
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 6457
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 6461
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 6463
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 6469
     if ($220 | 0) {
      if ((HEAP32[1325] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 6475
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 6479
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 6481
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 6490
  HEAP32[$114 + $137 >> 2] = $137; //@line 6492
  if (($$1 | 0) == (HEAP32[1326] | 0)) {
   HEAP32[1323] = $137; //@line 6496
   return;
  } else {
   $$2 = $137; //@line 6499
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 6503
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 6506
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 6508
  $$2 = $$1382; //@line 6509
 }
 $235 = $$2 >>> 3; //@line 6511
 if ($$2 >>> 0 < 256) {
  $238 = 5324 + ($235 << 1 << 2) | 0; //@line 6515
  $239 = HEAP32[1321] | 0; //@line 6516
  $240 = 1 << $235; //@line 6517
  if (!($239 & $240)) {
   HEAP32[1321] = $239 | $240; //@line 6522
   $$0403 = $238; //@line 6524
   $$pre$phiZ2D = $238 + 8 | 0; //@line 6524
  } else {
   $244 = $238 + 8 | 0; //@line 6526
   $245 = HEAP32[$244 >> 2] | 0; //@line 6527
   if ((HEAP32[1325] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 6531
   } else {
    $$0403 = $245; //@line 6534
    $$pre$phiZ2D = $244; //@line 6534
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 6537
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 6539
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 6541
  HEAP32[$$1 + 12 >> 2] = $238; //@line 6543
  return;
 }
 $251 = $$2 >>> 8; //@line 6546
 if (!$251) {
  $$0396 = 0; //@line 6549
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 6553
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 6557
   $257 = $251 << $256; //@line 6558
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 6561
   $262 = $257 << $260; //@line 6563
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 6566
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 6571
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 6577
  }
 }
 $276 = 5588 + ($$0396 << 2) | 0; //@line 6580
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 6582
 HEAP32[$$1 + 20 >> 2] = 0; //@line 6585
 HEAP32[$$1 + 16 >> 2] = 0; //@line 6586
 $280 = HEAP32[1322] | 0; //@line 6587
 $281 = 1 << $$0396; //@line 6588
 do {
  if (!($280 & $281)) {
   HEAP32[1322] = $280 | $281; //@line 6594
   HEAP32[$276 >> 2] = $$1; //@line 6595
   HEAP32[$$1 + 24 >> 2] = $276; //@line 6597
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 6599
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 6601
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 6609
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 6609
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 6616
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 6620
    $301 = HEAP32[$299 >> 2] | 0; //@line 6622
    if (!$301) {
     label = 121; //@line 6625
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 6628
     $$0384 = $301; //@line 6628
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1325] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 6635
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 6638
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 6640
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 6642
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 6644
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 6649
    $309 = HEAP32[$308 >> 2] | 0; //@line 6650
    $310 = HEAP32[1325] | 0; //@line 6651
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 6657
     HEAP32[$308 >> 2] = $$1; //@line 6658
     HEAP32[$$1 + 8 >> 2] = $309; //@line 6660
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 6662
     HEAP32[$$1 + 24 >> 2] = 0; //@line 6664
     break;
    } else {
     _abort(); //@line 6667
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1329] | 0) + -1 | 0; //@line 6674
 HEAP32[1329] = $319; //@line 6675
 if (!$319) {
  $$0212$in$i = 5740; //@line 6678
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 6683
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 6689
  }
 }
 HEAP32[1329] = -1; //@line 6692
 return;
}
function _equeue_dispatch($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$03956$i = 0, $$03956$i$phi = 0, $$04055$i = 0, $$0405571$i = 0, $$04063$i = 0, $$04159$i = 0, $$04258$i = 0, $$057$i = 0, $$067 = 0, $$06992 = 0, $$2 = 0, $$idx = 0, $$sink$in$i$i = 0, $$sroa$0$i = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74 = 0, $10 = 0, $106 = 0, $11 = 0, $12 = 0, $129 = 0, $13 = 0, $131 = 0, $132 = 0, $133 = 0, $135 = 0, $136 = 0, $14 = 0, $144 = 0, $145 = 0, $147 = 0, $15 = 0, $150 = 0, $152 = 0, $155 = 0, $158 = 0, $165 = 0, $169 = 0, $172 = 0, $178 = 0, $2 = 0, $23 = 0, $24 = 0, $27 = 0, $33 = 0, $42 = 0, $45 = 0, $46 = 0, $48 = 0, $5 = 0, $6 = 0, $7 = 0, $72 = 0, $74 = 0, $77 = 0, $8 = 0, $9 = 0, $96 = 0, $97 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0, $$04159$i$looptemp = 0, $$04258$i$looptemp = 0;
 sp = STACKTOP; //@line 1078
 STACKTOP = STACKTOP + 16 | 0; //@line 1079
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1079
 $$sroa$0$i = sp; //@line 1080
 $2 = $0 + 184 | 0; //@line 1081
 if (!(HEAP8[$2 >> 0] | 0)) {
  HEAP8[$2 >> 0] = 1; //@line 1085
 }
 $5 = _equeue_tick() | 0; //@line 1087
 $6 = $5 + $1 | 0; //@line 1088
 $7 = $0 + 36 | 0; //@line 1089
 HEAP8[$7 >> 0] = 0; //@line 1090
 $8 = $0 + 128 | 0; //@line 1091
 $9 = $0 + 9 | 0; //@line 1092
 $10 = $0 + 4 | 0; //@line 1093
 $11 = ($1 | 0) > -1; //@line 1094
 $12 = $0 + 48 | 0; //@line 1095
 $13 = $0 + 8 | 0; //@line 1096
 $$idx = $0 + 16 | 0; //@line 1097
 $14 = $0 + 156 | 0; //@line 1098
 $15 = $0 + 24 | 0; //@line 1099
 $$0 = $5; //@line 1100
 L4 : while (1) {
  _equeue_mutex_lock($8); //@line 1102
  HEAP8[$9 >> 0] = (HEAPU8[$9 >> 0] | 0) + 1; //@line 1107
  if (((HEAP32[$10 >> 2] | 0) - $$0 | 0) < 1) {
   HEAP32[$10 >> 2] = $$0; //@line 1112
  }
  $23 = HEAP32[$0 >> 2] | 0; //@line 1114
  HEAP32[$$sroa$0$i >> 2] = $23; //@line 1115
  $24 = $23; //@line 1116
  L9 : do {
   if (!$23) {
    $$04055$i = $$sroa$0$i; //@line 1120
    $33 = $24; //@line 1120
    label = 10; //@line 1121
   } else {
    $$04063$i = $$sroa$0$i; //@line 1123
    $27 = $24; //@line 1123
    do {
     if (((HEAP32[$27 + 20 >> 2] | 0) - $$0 | 0) >= 1) {
      $$04055$i = $$04063$i; //@line 1130
      $33 = $27; //@line 1130
      label = 10; //@line 1131
      break L9;
     }
     $$04063$i = $27 + 8 | 0; //@line 1134
     $27 = HEAP32[$$04063$i >> 2] | 0; //@line 1135
    } while (($27 | 0) != 0);
    HEAP32[$0 >> 2] = 0; //@line 1143
    $$0405571$i = $$04063$i; //@line 1144
   }
  } while (0);
  if ((label | 0) == 10) {
   label = 0; //@line 1148
   HEAP32[$0 >> 2] = $33; //@line 1149
   if (!$33) {
    $$0405571$i = $$04055$i; //@line 1152
   } else {
    HEAP32[$33 + 16 >> 2] = $0; //@line 1155
    $$0405571$i = $$04055$i; //@line 1156
   }
  }
  HEAP32[$$0405571$i >> 2] = 0; //@line 1159
  _equeue_mutex_unlock($8); //@line 1160
  $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74 = HEAP32[$$sroa$0$i >> 2] | 0; //@line 1161
  if (!$$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74) {} else {
   $$04159$i = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74; //@line 1165
   $$04258$i = $$sroa$0$i; //@line 1165
   do {
    $$04258$i$looptemp = $$04258$i;
    $$04258$i = $$04159$i + 8 | 0; //@line 1167
    $$04159$i$looptemp = $$04159$i;
    $$04159$i = HEAP32[$$04258$i >> 2] | 0; //@line 1168
    $$03956$i = 0; //@line 1169
    $$057$i = $$04159$i$looptemp; //@line 1169
    while (1) {
     HEAP32[$$057$i + 8 >> 2] = $$03956$i; //@line 1172
     $42 = HEAP32[$$057$i + 12 >> 2] | 0; //@line 1174
     if (!$42) {
      break;
     } else {
      $$03956$i$phi = $$057$i; //@line 1179
      $$057$i = $42; //@line 1179
      $$03956$i = $$03956$i$phi; //@line 1179
     }
    }
    HEAP32[$$04258$i$looptemp >> 2] = $$057$i; //@line 1182
   } while (($$04159$i | 0) != 0);
   $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 = HEAP32[$$sroa$0$i >> 2] | 0; //@line 1190
   if ($$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 | 0) {
    $$06992 = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75; //@line 1193
    while (1) {
     $45 = $$06992 + 8 | 0; //@line 1195
     $46 = HEAP32[$45 >> 2] | 0; //@line 1196
     $48 = HEAP32[$$06992 + 32 >> 2] | 0; //@line 1198
     if ($48 | 0) {
      $AsyncCtx = _emscripten_alloc_async_context(84, sp) | 0; //@line 1202
      FUNCTION_TABLE_vi[$48 & 255]($$06992 + 36 | 0); //@line 1203
      if (___async) {
       label = 20; //@line 1206
       break L4;
      }
      _emscripten_free_async_context($AsyncCtx | 0); //@line 1209
     }
     $72 = HEAP32[$$06992 + 24 >> 2] | 0; //@line 1212
     if (($72 | 0) > -1) {
      $74 = $$06992 + 20 | 0; //@line 1215
      HEAP32[$74 >> 2] = (HEAP32[$74 >> 2] | 0) + $72; //@line 1218
      $77 = _equeue_tick() | 0; //@line 1219
      $AsyncCtx11 = _emscripten_alloc_async_context(76, sp) | 0; //@line 1220
      _equeue_enqueue($0, $$06992, $77) | 0; //@line 1221
      if (___async) {
       label = 24; //@line 1224
       break L4;
      }
      _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1227
     } else {
      $96 = $$06992 + 4 | 0; //@line 1230
      $97 = HEAP8[$96 >> 0] | 0; //@line 1231
      HEAP8[$96 >> 0] = (($97 + 1 & 255) << HEAP32[$$idx >> 2] | 0) == 0 ? 1 : ($97 & 255) + 1 & 255; //@line 1240
      $106 = HEAP32[$$06992 + 28 >> 2] | 0; //@line 1242
      if ($106 | 0) {
       $AsyncCtx3 = _emscripten_alloc_async_context(84, sp) | 0; //@line 1246
       FUNCTION_TABLE_vi[$106 & 255]($$06992 + 36 | 0); //@line 1247
       if (___async) {
        label = 28; //@line 1250
        break L4;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1253
      }
      _equeue_mutex_lock($14); //@line 1255
      $129 = HEAP32[$15 >> 2] | 0; //@line 1256
      L40 : do {
       if (!$129) {
        $$02329$i$i = $15; //@line 1260
        label = 36; //@line 1261
       } else {
        $131 = HEAP32[$$06992 >> 2] | 0; //@line 1263
        $$025$i$i = $15; //@line 1264
        $133 = $129; //@line 1264
        while (1) {
         $132 = HEAP32[$133 >> 2] | 0; //@line 1266
         if ($132 >>> 0 >= $131 >>> 0) {
          break;
         }
         $135 = $133 + 8 | 0; //@line 1271
         $136 = HEAP32[$135 >> 2] | 0; //@line 1272
         if (!$136) {
          $$02329$i$i = $135; //@line 1275
          label = 36; //@line 1276
          break L40;
         } else {
          $$025$i$i = $135; //@line 1279
          $133 = $136; //@line 1279
         }
        }
        if (($132 | 0) == ($131 | 0)) {
         HEAP32[$$06992 + 12 >> 2] = $133; //@line 1285
         $$02330$i$i = $$025$i$i; //@line 1288
         $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 1288
        } else {
         $$02329$i$i = $$025$i$i; //@line 1290
         label = 36; //@line 1291
        }
       }
      } while (0);
      if ((label | 0) == 36) {
       label = 0; //@line 1296
       HEAP32[$$06992 + 12 >> 2] = 0; //@line 1298
       $$02330$i$i = $$02329$i$i; //@line 1299
       $$sink$in$i$i = $$02329$i$i; //@line 1299
      }
      HEAP32[$45 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 1302
      HEAP32[$$02330$i$i >> 2] = $$06992; //@line 1303
      _equeue_mutex_unlock($14); //@line 1304
     }
     if (!$46) {
      break;
     } else {
      $$06992 = $46; //@line 1310
     }
    }
   }
  }
  $144 = _equeue_tick() | 0; //@line 1315
  if ($11) {
   $145 = $6 - $144 | 0; //@line 1317
   if (($145 | 0) < 1) {
    label = 41; //@line 1320
    break;
   } else {
    $$067 = $145; //@line 1323
   }
  } else {
   $$067 = -1; //@line 1326
  }
  _equeue_mutex_lock($8); //@line 1328
  $165 = HEAP32[$0 >> 2] | 0; //@line 1329
  if (!$165) {
   $$2 = $$067; //@line 1332
  } else {
   $169 = (HEAP32[$165 + 20 >> 2] | 0) - $144 | 0; //@line 1336
   $172 = $169 & ~($169 >> 31); //@line 1339
   $$2 = $172 >>> 0 < $$067 >>> 0 ? $172 : $$067; //@line 1342
  }
  _equeue_mutex_unlock($8); //@line 1344
  _equeue_sema_wait($12, $$2) | 0; //@line 1345
  if (HEAP8[$13 >> 0] | 0) {
   _equeue_mutex_lock($8); //@line 1349
   if (HEAP8[$13 >> 0] | 0) {
    label = 53; //@line 1353
    break;
   }
   _equeue_mutex_unlock($8); //@line 1356
  }
  $178 = _equeue_tick() | 0; //@line 1358
  $AsyncCtx15 = _emscripten_alloc_async_context(76, sp) | 0; //@line 1359
  _wait_ms(20); //@line 1360
  if (___async) {
   label = 56; //@line 1363
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1366
  $$0 = $178; //@line 1367
 }
 if ((label | 0) == 20) {
  HEAP32[$AsyncCtx >> 2] = 28; //@line 1370
  HEAP32[$AsyncCtx + 4 >> 2] = $8; //@line 1372
  HEAP32[$AsyncCtx + 8 >> 2] = $9; //@line 1374
  HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 1376
  HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 1378
  HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 1380
  HEAP32[$AsyncCtx + 24 >> 2] = $$sroa$0$i; //@line 1382
  HEAP32[$AsyncCtx + 28 >> 2] = $0; //@line 1384
  HEAP32[$AsyncCtx + 32 >> 2] = $$sroa$0$i; //@line 1386
  HEAP32[$AsyncCtx + 36 >> 2] = $$sroa$0$i; //@line 1388
  HEAP32[$AsyncCtx + 40 >> 2] = $7; //@line 1390
  HEAP32[$AsyncCtx + 44 >> 2] = $13; //@line 1392
  HEAP32[$AsyncCtx + 48 >> 2] = $12; //@line 1394
  HEAP32[$AsyncCtx + 52 >> 2] = $46; //@line 1396
  HEAP32[$AsyncCtx + 56 >> 2] = $$06992; //@line 1398
  HEAP32[$AsyncCtx + 60 >> 2] = $$idx; //@line 1400
  HEAP32[$AsyncCtx + 64 >> 2] = $14; //@line 1402
  HEAP32[$AsyncCtx + 68 >> 2] = $15; //@line 1404
  HEAP32[$AsyncCtx + 72 >> 2] = $45; //@line 1406
  HEAP32[$AsyncCtx + 76 >> 2] = $6; //@line 1408
  HEAP8[$AsyncCtx + 80 >> 0] = $11 & 1; //@line 1411
  sp = STACKTOP; //@line 1412
  STACKTOP = sp; //@line 1413
  return;
 } else if ((label | 0) == 24) {
  HEAP32[$AsyncCtx11 >> 2] = 29; //@line 1416
  HEAP32[$AsyncCtx11 + 4 >> 2] = $8; //@line 1418
  HEAP32[$AsyncCtx11 + 8 >> 2] = $9; //@line 1420
  HEAP32[$AsyncCtx11 + 12 >> 2] = $10; //@line 1422
  HEAP32[$AsyncCtx11 + 16 >> 2] = $0; //@line 1424
  HEAP32[$AsyncCtx11 + 20 >> 2] = $0; //@line 1426
  HEAP32[$AsyncCtx11 + 24 >> 2] = $$sroa$0$i; //@line 1428
  HEAP32[$AsyncCtx11 + 28 >> 2] = $0; //@line 1430
  HEAP32[$AsyncCtx11 + 32 >> 2] = $$sroa$0$i; //@line 1432
  HEAP32[$AsyncCtx11 + 36 >> 2] = $$sroa$0$i; //@line 1434
  HEAP32[$AsyncCtx11 + 40 >> 2] = $7; //@line 1436
  HEAP32[$AsyncCtx11 + 44 >> 2] = $13; //@line 1438
  HEAP32[$AsyncCtx11 + 48 >> 2] = $12; //@line 1440
  HEAP32[$AsyncCtx11 + 52 >> 2] = $$idx; //@line 1442
  HEAP32[$AsyncCtx11 + 56 >> 2] = $14; //@line 1444
  HEAP32[$AsyncCtx11 + 60 >> 2] = $15; //@line 1446
  HEAP32[$AsyncCtx11 + 64 >> 2] = $6; //@line 1448
  HEAP8[$AsyncCtx11 + 68 >> 0] = $11 & 1; //@line 1451
  HEAP32[$AsyncCtx11 + 72 >> 2] = $46; //@line 1453
  sp = STACKTOP; //@line 1454
  STACKTOP = sp; //@line 1455
  return;
 } else if ((label | 0) == 28) {
  HEAP32[$AsyncCtx3 >> 2] = 30; //@line 1458
  HEAP32[$AsyncCtx3 + 4 >> 2] = $8; //@line 1460
  HEAP32[$AsyncCtx3 + 8 >> 2] = $9; //@line 1462
  HEAP32[$AsyncCtx3 + 12 >> 2] = $10; //@line 1464
  HEAP32[$AsyncCtx3 + 16 >> 2] = $0; //@line 1466
  HEAP32[$AsyncCtx3 + 20 >> 2] = $0; //@line 1468
  HEAP32[$AsyncCtx3 + 24 >> 2] = $$sroa$0$i; //@line 1470
  HEAP32[$AsyncCtx3 + 28 >> 2] = $0; //@line 1472
  HEAP32[$AsyncCtx3 + 32 >> 2] = $$sroa$0$i; //@line 1474
  HEAP32[$AsyncCtx3 + 36 >> 2] = $$sroa$0$i; //@line 1476
  HEAP32[$AsyncCtx3 + 40 >> 2] = $7; //@line 1478
  HEAP32[$AsyncCtx3 + 44 >> 2] = $13; //@line 1480
  HEAP32[$AsyncCtx3 + 48 >> 2] = $12; //@line 1482
  HEAP32[$AsyncCtx3 + 52 >> 2] = $$idx; //@line 1484
  HEAP32[$AsyncCtx3 + 56 >> 2] = $14; //@line 1486
  HEAP32[$AsyncCtx3 + 60 >> 2] = $15; //@line 1488
  HEAP32[$AsyncCtx3 + 64 >> 2] = $6; //@line 1490
  HEAP8[$AsyncCtx3 + 68 >> 0] = $11 & 1; //@line 1493
  HEAP32[$AsyncCtx3 + 72 >> 2] = $46; //@line 1495
  HEAP32[$AsyncCtx3 + 76 >> 2] = $$06992; //@line 1497
  HEAP32[$AsyncCtx3 + 80 >> 2] = $45; //@line 1499
  sp = STACKTOP; //@line 1500
  STACKTOP = sp; //@line 1501
  return;
 } else if ((label | 0) == 41) {
  $147 = $0 + 40 | 0; //@line 1504
  if (HEAP32[$147 >> 2] | 0) {
   _equeue_mutex_lock($8); //@line 1508
   $150 = HEAP32[$147 >> 2] | 0; //@line 1509
   do {
    if ($150 | 0) {
     $152 = HEAP32[$0 >> 2] | 0; //@line 1513
     if ($152 | 0) {
      $155 = HEAP32[$0 + 44 >> 2] | 0; //@line 1517
      $158 = (HEAP32[$152 + 20 >> 2] | 0) - $144 | 0; //@line 1520
      $AsyncCtx7 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1524
      FUNCTION_TABLE_vii[$150 & 3]($155, $158 & ~($158 >> 31)); //@line 1525
      if (___async) {
       HEAP32[$AsyncCtx7 >> 2] = 31; //@line 1528
       HEAP32[$AsyncCtx7 + 4 >> 2] = $7; //@line 1530
       HEAP32[$AsyncCtx7 + 8 >> 2] = $8; //@line 1532
       HEAP32[$AsyncCtx7 + 12 >> 2] = $13; //@line 1534
       sp = STACKTOP; //@line 1535
       STACKTOP = sp; //@line 1536
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1538
       break;
      }
     }
    }
   } while (0);
   HEAP8[$7 >> 0] = 1; //@line 1544
   _equeue_mutex_unlock($8); //@line 1545
  }
  HEAP8[$13 >> 0] = 0; //@line 1547
  STACKTOP = sp; //@line 1548
  return;
 } else if ((label | 0) == 53) {
  HEAP8[$13 >> 0] = 0; //@line 1551
  _equeue_mutex_unlock($8); //@line 1552
  STACKTOP = sp; //@line 1553
  return;
 } else if ((label | 0) == 56) {
  HEAP32[$AsyncCtx15 >> 2] = 32; //@line 1556
  HEAP32[$AsyncCtx15 + 4 >> 2] = $178; //@line 1558
  HEAP32[$AsyncCtx15 + 8 >> 2] = $8; //@line 1560
  HEAP32[$AsyncCtx15 + 12 >> 2] = $9; //@line 1562
  HEAP32[$AsyncCtx15 + 16 >> 2] = $10; //@line 1564
  HEAP32[$AsyncCtx15 + 20 >> 2] = $0; //@line 1566
  HEAP32[$AsyncCtx15 + 24 >> 2] = $0; //@line 1568
  HEAP32[$AsyncCtx15 + 28 >> 2] = $$sroa$0$i; //@line 1570
  HEAP32[$AsyncCtx15 + 32 >> 2] = $0; //@line 1572
  HEAP32[$AsyncCtx15 + 36 >> 2] = $$sroa$0$i; //@line 1574
  HEAP32[$AsyncCtx15 + 40 >> 2] = $$sroa$0$i; //@line 1576
  HEAP32[$AsyncCtx15 + 44 >> 2] = $7; //@line 1578
  HEAP32[$AsyncCtx15 + 48 >> 2] = $13; //@line 1580
  HEAP32[$AsyncCtx15 + 52 >> 2] = $12; //@line 1582
  HEAP32[$AsyncCtx15 + 56 >> 2] = $$idx; //@line 1584
  HEAP32[$AsyncCtx15 + 60 >> 2] = $14; //@line 1586
  HEAP32[$AsyncCtx15 + 64 >> 2] = $15; //@line 1588
  HEAP32[$AsyncCtx15 + 68 >> 2] = $6; //@line 1590
  HEAP8[$AsyncCtx15 + 72 >> 0] = $11 & 1; //@line 1593
  sp = STACKTOP; //@line 1594
  STACKTOP = sp; //@line 1595
  return;
 }
}
function _twoway_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0166 = 0, $$0168 = 0, $$0169 = 0, $$0169$be = 0, $$0170 = 0, $$0175$ph$ph$lcssa216 = 0, $$0175$ph$ph$lcssa216328 = 0, $$0175$ph$ph254 = 0, $$0179242 = 0, $$0183$ph197$ph253 = 0, $$0183$ph197248 = 0, $$0183$ph260 = 0, $$0185$ph$lcssa = 0, $$0185$ph$lcssa327 = 0, $$0185$ph259 = 0, $$0187219$ph325326 = 0, $$0187263 = 0, $$1176$$0175 = 0, $$1176$ph$ph$lcssa208 = 0, $$1176$ph$ph233 = 0, $$1180222 = 0, $$1184$ph193$ph232 = 0, $$1184$ph193227 = 0, $$1184$ph239 = 0, $$1186$$0185 = 0, $$1186$ph$lcssa = 0, $$1186$ph238 = 0, $$2181$sink = 0, $$3 = 0, $$3173 = 0, $$3178 = 0, $$3182221 = 0, $$4 = 0, $$pr = 0, $10 = 0, $105 = 0, $111 = 0, $113 = 0, $118 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $14 = 0, $2 = 0, $23 = 0, $25 = 0, $27 = 0, $3 = 0, $32 = 0, $34 = 0, $37 = 0, $4 = 0, $41 = 0, $45 = 0, $50 = 0, $52 = 0, $53 = 0, $56 = 0, $60 = 0, $68 = 0, $70 = 0, $74 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $83 = 0, $86 = 0, $93 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11032
 STACKTOP = STACKTOP + 1056 | 0; //@line 11033
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(1056); //@line 11033
 $2 = sp + 1024 | 0; //@line 11034
 $3 = sp; //@line 11035
 HEAP32[$2 >> 2] = 0; //@line 11036
 HEAP32[$2 + 4 >> 2] = 0; //@line 11036
 HEAP32[$2 + 8 >> 2] = 0; //@line 11036
 HEAP32[$2 + 12 >> 2] = 0; //@line 11036
 HEAP32[$2 + 16 >> 2] = 0; //@line 11036
 HEAP32[$2 + 20 >> 2] = 0; //@line 11036
 HEAP32[$2 + 24 >> 2] = 0; //@line 11036
 HEAP32[$2 + 28 >> 2] = 0; //@line 11036
 $4 = HEAP8[$1 >> 0] | 0; //@line 11037
 L1 : do {
  if (!($4 << 24 >> 24)) {
   $$0175$ph$ph$lcssa216328 = 1; //@line 11041
   $$0185$ph$lcssa327 = -1; //@line 11041
   $$0187219$ph325326 = 0; //@line 11041
   $$1176$ph$ph$lcssa208 = 1; //@line 11041
   $$1186$ph$lcssa = -1; //@line 11041
   label = 26; //@line 11042
  } else {
   $$0187263 = 0; //@line 11044
   $10 = $4; //@line 11044
   do {
    if (!(HEAP8[$0 + $$0187263 >> 0] | 0)) {
     $$3 = 0; //@line 11050
     break L1;
    }
    $14 = $2 + ((($10 & 255) >>> 5 & 255) << 2) | 0; //@line 11058
    HEAP32[$14 >> 2] = HEAP32[$14 >> 2] | 1 << ($10 & 31); //@line 11061
    $$0187263 = $$0187263 + 1 | 0; //@line 11062
    HEAP32[$3 + (($10 & 255) << 2) >> 2] = $$0187263; //@line 11065
    $10 = HEAP8[$1 + $$0187263 >> 0] | 0; //@line 11067
   } while ($10 << 24 >> 24 != 0);
   $23 = $$0187263 >>> 0 > 1; //@line 11075
   if ($23) {
    $$0183$ph260 = 0; //@line 11077
    $$0185$ph259 = -1; //@line 11077
    $130 = 1; //@line 11077
    L6 : while (1) {
     $$0175$ph$ph254 = 1; //@line 11079
     $$0183$ph197$ph253 = $$0183$ph260; //@line 11079
     $131 = $130; //@line 11079
     while (1) {
      $$0183$ph197248 = $$0183$ph197$ph253; //@line 11081
      $132 = $131; //@line 11081
      L10 : while (1) {
       $$0179242 = 1; //@line 11083
       $25 = $132; //@line 11083
       while (1) {
        $32 = HEAP8[$1 + ($$0179242 + $$0185$ph259) >> 0] | 0; //@line 11087
        $34 = HEAP8[$1 + $25 >> 0] | 0; //@line 11089
        if ($32 << 24 >> 24 != $34 << 24 >> 24) {
         break L10;
        }
        if (($$0179242 | 0) == ($$0175$ph$ph254 | 0)) {
         break;
        }
        $$0179242 = $$0179242 + 1 | 0; //@line 11095
        $27 = $$0179242 + $$0183$ph197248 | 0; //@line 11099
        if ($27 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 11104
         $$0185$ph$lcssa = $$0185$ph259; //@line 11104
         break L6;
        } else {
         $25 = $27; //@line 11102
        }
       }
       $37 = $$0175$ph$ph254 + $$0183$ph197248 | 0; //@line 11108
       $132 = $37 + 1 | 0; //@line 11109
       if ($132 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 11114
        $$0185$ph$lcssa = $$0185$ph259; //@line 11114
        break L6;
       } else {
        $$0183$ph197248 = $37; //@line 11112
       }
      }
      $41 = $25 - $$0185$ph259 | 0; //@line 11119
      if (($32 & 255) <= ($34 & 255)) {
       break;
      }
      $131 = $25 + 1 | 0; //@line 11123
      if ($131 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216 = $41; //@line 11128
       $$0185$ph$lcssa = $$0185$ph259; //@line 11128
       break L6;
      } else {
       $$0175$ph$ph254 = $41; //@line 11126
       $$0183$ph197$ph253 = $25; //@line 11126
      }
     }
     $130 = $$0183$ph197248 + 2 | 0; //@line 11133
     if ($130 >>> 0 >= $$0187263 >>> 0) {
      $$0175$ph$ph$lcssa216 = 1; //@line 11138
      $$0185$ph$lcssa = $$0183$ph197248; //@line 11138
      break;
     } else {
      $$0183$ph260 = $$0183$ph197248 + 1 | 0; //@line 11136
      $$0185$ph259 = $$0183$ph197248; //@line 11136
     }
    }
    if ($23) {
     $$1184$ph239 = 0; //@line 11143
     $$1186$ph238 = -1; //@line 11143
     $133 = 1; //@line 11143
     while (1) {
      $$1176$ph$ph233 = 1; //@line 11145
      $$1184$ph193$ph232 = $$1184$ph239; //@line 11145
      $135 = $133; //@line 11145
      while (1) {
       $$1184$ph193227 = $$1184$ph193$ph232; //@line 11147
       $134 = $135; //@line 11147
       L25 : while (1) {
        $$1180222 = 1; //@line 11149
        $52 = $134; //@line 11149
        while (1) {
         $50 = HEAP8[$1 + ($$1180222 + $$1186$ph238) >> 0] | 0; //@line 11153
         $53 = HEAP8[$1 + $52 >> 0] | 0; //@line 11155
         if ($50 << 24 >> 24 != $53 << 24 >> 24) {
          break L25;
         }
         if (($$1180222 | 0) == ($$1176$ph$ph233 | 0)) {
          break;
         }
         $$1180222 = $$1180222 + 1 | 0; //@line 11161
         $45 = $$1180222 + $$1184$ph193227 | 0; //@line 11165
         if ($45 >>> 0 >= $$0187263 >>> 0) {
          $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11170
          $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11170
          $$0187219$ph325326 = $$0187263; //@line 11170
          $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 11170
          $$1186$ph$lcssa = $$1186$ph238; //@line 11170
          label = 26; //@line 11171
          break L1;
         } else {
          $52 = $45; //@line 11168
         }
        }
        $56 = $$1176$ph$ph233 + $$1184$ph193227 | 0; //@line 11175
        $134 = $56 + 1 | 0; //@line 11176
        if ($134 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11181
         $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11181
         $$0187219$ph325326 = $$0187263; //@line 11181
         $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 11181
         $$1186$ph$lcssa = $$1186$ph238; //@line 11181
         label = 26; //@line 11182
         break L1;
        } else {
         $$1184$ph193227 = $56; //@line 11179
        }
       }
       $60 = $52 - $$1186$ph238 | 0; //@line 11187
       if (($50 & 255) >= ($53 & 255)) {
        break;
       }
       $135 = $52 + 1 | 0; //@line 11191
       if ($135 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11196
        $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11196
        $$0187219$ph325326 = $$0187263; //@line 11196
        $$1176$ph$ph$lcssa208 = $60; //@line 11196
        $$1186$ph$lcssa = $$1186$ph238; //@line 11196
        label = 26; //@line 11197
        break L1;
       } else {
        $$1176$ph$ph233 = $60; //@line 11194
        $$1184$ph193$ph232 = $52; //@line 11194
       }
      }
      $133 = $$1184$ph193227 + 2 | 0; //@line 11202
      if ($133 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11207
       $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11207
       $$0187219$ph325326 = $$0187263; //@line 11207
       $$1176$ph$ph$lcssa208 = 1; //@line 11207
       $$1186$ph$lcssa = $$1184$ph193227; //@line 11207
       label = 26; //@line 11208
       break;
      } else {
       $$1184$ph239 = $$1184$ph193227 + 1 | 0; //@line 11205
       $$1186$ph238 = $$1184$ph193227; //@line 11205
      }
     }
    } else {
     $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11213
     $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11213
     $$0187219$ph325326 = $$0187263; //@line 11213
     $$1176$ph$ph$lcssa208 = 1; //@line 11213
     $$1186$ph$lcssa = -1; //@line 11213
     label = 26; //@line 11214
    }
   } else {
    $$0175$ph$ph$lcssa216328 = 1; //@line 11217
    $$0185$ph$lcssa327 = -1; //@line 11217
    $$0187219$ph325326 = $$0187263; //@line 11217
    $$1176$ph$ph$lcssa208 = 1; //@line 11217
    $$1186$ph$lcssa = -1; //@line 11217
    label = 26; //@line 11218
   }
  }
 } while (0);
 L35 : do {
  if ((label | 0) == 26) {
   $68 = ($$1186$ph$lcssa + 1 | 0) >>> 0 > ($$0185$ph$lcssa327 + 1 | 0) >>> 0; //@line 11226
   $$1176$$0175 = $68 ? $$1176$ph$ph$lcssa208 : $$0175$ph$ph$lcssa216328; //@line 11227
   $$1186$$0185 = $68 ? $$1186$ph$lcssa : $$0185$ph$lcssa327; //@line 11228
   $70 = $$1186$$0185 + 1 | 0; //@line 11230
   if (!(_memcmp($1, $1 + $$1176$$0175 | 0, $70) | 0)) {
    $$0168 = $$0187219$ph325326 - $$1176$$0175 | 0; //@line 11235
    $$3178 = $$1176$$0175; //@line 11235
   } else {
    $74 = $$0187219$ph325326 - $$1186$$0185 + -1 | 0; //@line 11238
    $$0168 = 0; //@line 11242
    $$3178 = ($$1186$$0185 >>> 0 > $74 >>> 0 ? $$1186$$0185 : $74) + 1 | 0; //@line 11242
   }
   $78 = $$0187219$ph325326 | 63; //@line 11244
   $79 = $$0187219$ph325326 + -1 | 0; //@line 11245
   $80 = ($$0168 | 0) != 0; //@line 11246
   $81 = $$0187219$ph325326 - $$3178 | 0; //@line 11247
   $$0166 = $0; //@line 11248
   $$0169 = 0; //@line 11248
   $$0170 = $0; //@line 11248
   while (1) {
    $83 = $$0166; //@line 11251
    do {
     if (($$0170 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
      $86 = _memchr($$0170, 0, $78) | 0; //@line 11256
      if (!$86) {
       $$3173 = $$0170 + $78 | 0; //@line 11260
       break;
      } else {
       if (($86 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
        $$3 = 0; //@line 11267
        break L35;
       } else {
        $$3173 = $86; //@line 11270
        break;
       }
      }
     } else {
      $$3173 = $$0170; //@line 11275
     }
    } while (0);
    $93 = HEAP8[$$0166 + $79 >> 0] | 0; //@line 11279
    L49 : do {
     if (!(1 << ($93 & 31) & HEAP32[$2 + ((($93 & 255) >>> 5 & 255) << 2) >> 2])) {
      $$0169$be = 0; //@line 11291
      $$2181$sink = $$0187219$ph325326; //@line 11291
     } else {
      $105 = $$0187219$ph325326 - (HEAP32[$3 + (($93 & 255) << 2) >> 2] | 0) | 0; //@line 11296
      if ($105 | 0) {
       $$0169$be = 0; //@line 11304
       $$2181$sink = $80 & ($$0169 | 0) != 0 & $105 >>> 0 < $$3178 >>> 0 ? $81 : $105; //@line 11304
       break;
      }
      $111 = $70 >>> 0 > $$0169 >>> 0 ? $70 : $$0169; //@line 11308
      $113 = HEAP8[$1 + $111 >> 0] | 0; //@line 11310
      L54 : do {
       if (!($113 << 24 >> 24)) {
        $$4 = $70; //@line 11314
       } else {
        $$3182221 = $111; //@line 11316
        $$pr = $113; //@line 11316
        while (1) {
         if ($$pr << 24 >> 24 != (HEAP8[$$0166 + $$3182221 >> 0] | 0)) {
          break;
         }
         $118 = $$3182221 + 1 | 0; //@line 11324
         $$pr = HEAP8[$1 + $118 >> 0] | 0; //@line 11326
         if (!($$pr << 24 >> 24)) {
          $$4 = $70; //@line 11329
          break L54;
         } else {
          $$3182221 = $118; //@line 11332
         }
        }
        $$0169$be = 0; //@line 11336
        $$2181$sink = $$3182221 - $$1186$$0185 | 0; //@line 11336
        break L49;
       }
      } while (0);
      while (1) {
       if ($$4 >>> 0 <= $$0169 >>> 0) {
        $$3 = $$0166; //@line 11343
        break L35;
       }
       $$4 = $$4 + -1 | 0; //@line 11346
       if ((HEAP8[$1 + $$4 >> 0] | 0) != (HEAP8[$$0166 + $$4 >> 0] | 0)) {
        $$0169$be = $$0168; //@line 11355
        $$2181$sink = $$3178; //@line 11355
        break;
       }
      }
     }
    } while (0);
    $$0166 = $$0166 + $$2181$sink | 0; //@line 11362
    $$0169 = $$0169$be; //@line 11362
    $$0170 = $$3173; //@line 11362
   }
  }
 } while (0);
 STACKTOP = sp; //@line 11366
 return $$3 | 0; //@line 11366
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12836
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12842
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 12851
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 12856
      $19 = $1 + 44 | 0; //@line 12857
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 12866
      $26 = $1 + 52 | 0; //@line 12867
      $27 = $1 + 53 | 0; //@line 12868
      $28 = $1 + 54 | 0; //@line 12869
      $29 = $0 + 8 | 0; //@line 12870
      $30 = $1 + 24 | 0; //@line 12871
      $$081$off0 = 0; //@line 12872
      $$084 = $0 + 16 | 0; //@line 12872
      $$085$off0 = 0; //@line 12872
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 12876
        label = 20; //@line 12877
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 12880
       HEAP8[$27 >> 0] = 0; //@line 12881
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 12882
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 12883
       if (___async) {
        label = 12; //@line 12886
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 12889
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 12893
        label = 20; //@line 12894
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 12901
         $$186$off0 = $$085$off0; //@line 12901
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 12910
           label = 20; //@line 12911
           break L10;
          } else {
           $$182$off0 = 1; //@line 12914
           $$186$off0 = $$085$off0; //@line 12914
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 12921
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 12928
          break L10;
         } else {
          $$182$off0 = 1; //@line 12931
          $$186$off0 = 1; //@line 12931
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 12936
       $$084 = $$084 + 8 | 0; //@line 12936
       $$085$off0 = $$186$off0; //@line 12936
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 128; //@line 12939
       HEAP32[$AsyncCtx15 + 4 >> 2] = $25; //@line 12941
       HEAP32[$AsyncCtx15 + 8 >> 2] = $27; //@line 12943
       HEAP32[$AsyncCtx15 + 12 >> 2] = $26; //@line 12945
       HEAP32[$AsyncCtx15 + 16 >> 2] = $1; //@line 12947
       HEAP32[$AsyncCtx15 + 20 >> 2] = $2; //@line 12949
       HEAP8[$AsyncCtx15 + 24 >> 0] = $4 & 1; //@line 12952
       HEAP32[$AsyncCtx15 + 28 >> 2] = $30; //@line 12954
       HEAP32[$AsyncCtx15 + 32 >> 2] = $29; //@line 12956
       HEAP32[$AsyncCtx15 + 36 >> 2] = $28; //@line 12958
       HEAP8[$AsyncCtx15 + 40 >> 0] = $$081$off0 & 1; //@line 12961
       HEAP8[$AsyncCtx15 + 41 >> 0] = $$085$off0 & 1; //@line 12964
       HEAP32[$AsyncCtx15 + 44 >> 2] = $$084; //@line 12966
       HEAP32[$AsyncCtx15 + 48 >> 2] = $13; //@line 12968
       HEAP32[$AsyncCtx15 + 52 >> 2] = $19; //@line 12970
       sp = STACKTOP; //@line 12971
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 12977
         $61 = $1 + 40 | 0; //@line 12978
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 12981
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 12989
           if ($$283$off0) {
            label = 25; //@line 12991
            break;
           } else {
            $69 = 4; //@line 12994
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 13001
        } else {
         $69 = 4; //@line 13003
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 13008
      }
      HEAP32[$19 >> 2] = $69; //@line 13010
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 13019
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 13024
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 13025
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 13026
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 13027
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 129; //@line 13030
    HEAP32[$AsyncCtx11 + 4 >> 2] = $73; //@line 13032
    HEAP32[$AsyncCtx11 + 8 >> 2] = $1; //@line 13034
    HEAP32[$AsyncCtx11 + 12 >> 2] = $2; //@line 13036
    HEAP32[$AsyncCtx11 + 16 >> 2] = $3; //@line 13038
    HEAP8[$AsyncCtx11 + 20 >> 0] = $4 & 1; //@line 13041
    HEAP32[$AsyncCtx11 + 24 >> 2] = $0; //@line 13043
    HEAP32[$AsyncCtx11 + 28 >> 2] = $72; //@line 13045
    sp = STACKTOP; //@line 13046
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 13049
   $81 = $0 + 24 | 0; //@line 13050
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 13054
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 13058
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 13065
       $$2 = $81; //@line 13066
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 13078
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 13079
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 13084
        $136 = $$2 + 8 | 0; //@line 13085
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 13088
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 132; //@line 13093
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 13095
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 13097
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 13099
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 13101
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 13103
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 13105
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 13107
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 13110
       sp = STACKTOP; //@line 13111
       return;
      }
      $104 = $1 + 24 | 0; //@line 13114
      $105 = $1 + 54 | 0; //@line 13115
      $$1 = $81; //@line 13116
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 13132
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 13133
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13138
       $122 = $$1 + 8 | 0; //@line 13139
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 13142
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 131; //@line 13147
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 13149
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 13151
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 13153
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 13155
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 13157
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 13159
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 13161
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 13163
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 13166
      sp = STACKTOP; //@line 13167
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 13171
    $$0 = $81; //@line 13172
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 13179
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 13180
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 13185
     $100 = $$0 + 8 | 0; //@line 13186
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 13189
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 130; //@line 13194
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 13196
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 13198
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 13200
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 13202
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 13204
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 13206
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 13209
    sp = STACKTOP; //@line 13210
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
 $n_sroa_0_0_extract_trunc = $a$0; //@line 6592
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 6593
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 6594
 $d_sroa_0_0_extract_trunc = $b$0; //@line 6595
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 6596
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 6597
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 6599
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 6602
    HEAP32[$rem + 4 >> 2] = 0; //@line 6603
   }
   $_0$1 = 0; //@line 6605
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 6606
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6607
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 6610
    $_0$0 = 0; //@line 6611
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6612
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 6614
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 6615
   $_0$1 = 0; //@line 6616
   $_0$0 = 0; //@line 6617
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6618
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 6621
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 6626
     HEAP32[$rem + 4 >> 2] = 0; //@line 6627
    }
    $_0$1 = 0; //@line 6629
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 6630
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6631
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 6635
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 6636
    }
    $_0$1 = 0; //@line 6638
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 6639
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6640
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 6642
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 6645
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 6646
    }
    $_0$1 = 0; //@line 6648
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 6649
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6650
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 6653
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 6655
    $58 = 31 - $51 | 0; //@line 6656
    $sr_1_ph = $57; //@line 6657
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 6658
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 6659
    $q_sroa_0_1_ph = 0; //@line 6660
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 6661
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 6665
    $_0$0 = 0; //@line 6666
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6667
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 6669
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 6670
   $_0$1 = 0; //@line 6671
   $_0$0 = 0; //@line 6672
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6673
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 6677
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 6679
     $126 = 31 - $119 | 0; //@line 6680
     $130 = $119 - 31 >> 31; //@line 6681
     $sr_1_ph = $125; //@line 6682
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 6683
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 6684
     $q_sroa_0_1_ph = 0; //@line 6685
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 6686
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 6690
     $_0$0 = 0; //@line 6691
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6692
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 6694
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 6695
    $_0$1 = 0; //@line 6696
    $_0$0 = 0; //@line 6697
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6698
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 6700
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 6703
    $89 = 64 - $88 | 0; //@line 6704
    $91 = 32 - $88 | 0; //@line 6705
    $92 = $91 >> 31; //@line 6706
    $95 = $88 - 32 | 0; //@line 6707
    $105 = $95 >> 31; //@line 6708
    $sr_1_ph = $88; //@line 6709
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 6710
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 6711
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 6712
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 6713
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 6717
    HEAP32[$rem + 4 >> 2] = 0; //@line 6718
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 6721
    $_0$0 = $a$0 | 0 | 0; //@line 6722
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6723
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 6725
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 6726
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 6727
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6728
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 6733
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 6734
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 6735
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 6736
  $carry_0_lcssa$1 = 0; //@line 6737
  $carry_0_lcssa$0 = 0; //@line 6738
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 6740
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 6741
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 6742
  $137$1 = tempRet0; //@line 6743
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 6744
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 6745
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 6746
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 6747
  $sr_1202 = $sr_1_ph; //@line 6748
  $carry_0203 = 0; //@line 6749
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 6751
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 6752
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 6753
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 6754
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 6755
   $150$1 = tempRet0; //@line 6756
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 6757
   $carry_0203 = $151$0 & 1; //@line 6758
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 6760
   $r_sroa_1_1200 = tempRet0; //@line 6761
   $sr_1202 = $sr_1202 - 1 | 0; //@line 6762
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 6774
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 6775
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 6776
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 6777
  $carry_0_lcssa$1 = 0; //@line 6778
  $carry_0_lcssa$0 = $carry_0203; //@line 6779
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 6781
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 6782
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 6785
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 6786
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 6788
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 6789
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6790
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2486
 STACKTOP = STACKTOP + 32 | 0; //@line 2487
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 2487
 $0 = sp; //@line 2488
 _gpio_init_out($0, 50); //@line 2489
 while (1) {
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2492
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2493
  _wait_ms(150); //@line 2494
  if (___async) {
   label = 3; //@line 2497
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 2500
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2502
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2503
  _wait_ms(150); //@line 2504
  if (___async) {
   label = 5; //@line 2507
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 2510
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2512
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2513
  _wait_ms(150); //@line 2514
  if (___async) {
   label = 7; //@line 2517
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 2520
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2522
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2523
  _wait_ms(150); //@line 2524
  if (___async) {
   label = 9; //@line 2527
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 2530
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2532
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2533
  _wait_ms(150); //@line 2534
  if (___async) {
   label = 11; //@line 2537
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 2540
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2542
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2543
  _wait_ms(150); //@line 2544
  if (___async) {
   label = 13; //@line 2547
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 2550
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2552
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2553
  _wait_ms(150); //@line 2554
  if (___async) {
   label = 15; //@line 2557
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 2560
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2562
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2563
  _wait_ms(150); //@line 2564
  if (___async) {
   label = 17; //@line 2567
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 2570
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2572
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2573
  _wait_ms(400); //@line 2574
  if (___async) {
   label = 19; //@line 2577
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 2580
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2582
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2583
  _wait_ms(400); //@line 2584
  if (___async) {
   label = 21; //@line 2587
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 2590
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2592
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2593
  _wait_ms(400); //@line 2594
  if (___async) {
   label = 23; //@line 2597
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 2600
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2602
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2603
  _wait_ms(400); //@line 2604
  if (___async) {
   label = 25; //@line 2607
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 2610
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2612
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2613
  _wait_ms(400); //@line 2614
  if (___async) {
   label = 27; //@line 2617
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 2620
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2622
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2623
  _wait_ms(400); //@line 2624
  if (___async) {
   label = 29; //@line 2627
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2630
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2632
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2633
  _wait_ms(400); //@line 2634
  if (___async) {
   label = 31; //@line 2637
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2640
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2642
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2643
  _wait_ms(400); //@line 2644
  if (___async) {
   label = 33; //@line 2647
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2650
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 48; //@line 2654
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 2656
   sp = STACKTOP; //@line 2657
   STACKTOP = sp; //@line 2658
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 49; //@line 2662
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 2664
   sp = STACKTOP; //@line 2665
   STACKTOP = sp; //@line 2666
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 50; //@line 2670
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 2672
   sp = STACKTOP; //@line 2673
   STACKTOP = sp; //@line 2674
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 51; //@line 2678
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 2680
   sp = STACKTOP; //@line 2681
   STACKTOP = sp; //@line 2682
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 52; //@line 2686
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 2688
   sp = STACKTOP; //@line 2689
   STACKTOP = sp; //@line 2690
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 53; //@line 2694
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 2696
   sp = STACKTOP; //@line 2697
   STACKTOP = sp; //@line 2698
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 54; //@line 2702
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 2704
   sp = STACKTOP; //@line 2705
   STACKTOP = sp; //@line 2706
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 55; //@line 2710
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 2712
   sp = STACKTOP; //@line 2713
   STACKTOP = sp; //@line 2714
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 56; //@line 2718
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 2720
   sp = STACKTOP; //@line 2721
   STACKTOP = sp; //@line 2722
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 57; //@line 2726
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 2728
   sp = STACKTOP; //@line 2729
   STACKTOP = sp; //@line 2730
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 58; //@line 2734
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 2736
   sp = STACKTOP; //@line 2737
   STACKTOP = sp; //@line 2738
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 59; //@line 2742
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 2744
   sp = STACKTOP; //@line 2745
   STACKTOP = sp; //@line 2746
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 60; //@line 2750
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 2752
   sp = STACKTOP; //@line 2753
   STACKTOP = sp; //@line 2754
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 61; //@line 2758
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 2760
   sp = STACKTOP; //@line 2761
   STACKTOP = sp; //@line 2762
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 62; //@line 2766
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2768
   sp = STACKTOP; //@line 2769
   STACKTOP = sp; //@line 2770
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 63; //@line 2774
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2776
   sp = STACKTOP; //@line 2777
   STACKTOP = sp; //@line 2778
   return;
  }
 }
}
function _main() {
 var $0 = 0, $1 = 0, $15 = 0, $18 = 0, $21 = 0, $23 = 0, $26 = 0, $29 = 0, $34 = 0, $37 = 0, $40 = 0, $5 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx13 = 0, $AsyncCtx17 = 0, $AsyncCtx20 = 0, $AsyncCtx24 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 3178
 STACKTOP = STACKTOP + 16 | 0; //@line 3179
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3179
 $0 = sp; //@line 3180
 $AsyncCtx24 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3181
 $1 = _equeue_alloc(4960, 4) | 0; //@line 3182
 if (___async) {
  HEAP32[$AsyncCtx24 >> 2] = 76; //@line 3185
  HEAP32[$AsyncCtx24 + 4 >> 2] = $0; //@line 3187
  sp = STACKTOP; //@line 3188
  STACKTOP = sp; //@line 3189
  return 0; //@line 3189
 }
 _emscripten_free_async_context($AsyncCtx24 | 0); //@line 3191
 do {
  if ($1 | 0) {
   HEAP32[$1 >> 2] = 2; //@line 3195
   _equeue_event_delay($1, 1e3); //@line 3196
   _equeue_event_period($1, 1e3); //@line 3197
   _equeue_event_dtor($1, 77); //@line 3198
   $AsyncCtx10 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3199
   _equeue_post(4960, 78, $1) | 0; //@line 3200
   if (___async) {
    HEAP32[$AsyncCtx10 >> 2] = 79; //@line 3203
    HEAP32[$AsyncCtx10 + 4 >> 2] = $0; //@line 3205
    sp = STACKTOP; //@line 3206
    STACKTOP = sp; //@line 3207
    return 0; //@line 3207
   } else {
    _emscripten_free_async_context($AsyncCtx10 | 0); //@line 3209
    break;
   }
  }
 } while (0);
 $AsyncCtx20 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3214
 $5 = _equeue_alloc(4960, 32) | 0; //@line 3215
 if (___async) {
  HEAP32[$AsyncCtx20 >> 2] = 80; //@line 3218
  HEAP32[$AsyncCtx20 + 4 >> 2] = $0; //@line 3220
  sp = STACKTOP; //@line 3221
  STACKTOP = sp; //@line 3222
  return 0; //@line 3222
 }
 _emscripten_free_async_context($AsyncCtx20 | 0); //@line 3224
 if (!$5) {
  HEAP32[$0 >> 2] = 0; //@line 3227
  HEAP32[$0 + 4 >> 2] = 0; //@line 3227
  HEAP32[$0 + 8 >> 2] = 0; //@line 3227
  HEAP32[$0 + 12 >> 2] = 0; //@line 3227
  $21 = 1; //@line 3228
  $23 = $0; //@line 3228
 } else {
  HEAP32[$5 + 4 >> 2] = 4960; //@line 3231
  HEAP32[$5 + 8 >> 2] = 0; //@line 3233
  HEAP32[$5 + 12 >> 2] = 0; //@line 3235
  HEAP32[$5 + 16 >> 2] = -1; //@line 3237
  HEAP32[$5 + 20 >> 2] = 2; //@line 3239
  HEAP32[$5 + 24 >> 2] = 81; //@line 3241
  HEAP32[$5 + 28 >> 2] = 3; //@line 3243
  HEAP32[$5 >> 2] = 1; //@line 3244
  $15 = $0 + 4 | 0; //@line 3245
  HEAP32[$15 >> 2] = 0; //@line 3246
  HEAP32[$15 + 4 >> 2] = 0; //@line 3246
  HEAP32[$15 + 8 >> 2] = 0; //@line 3246
  HEAP32[$0 >> 2] = $5; //@line 3247
  HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + 1; //@line 3250
  $21 = 0; //@line 3251
  $23 = $0; //@line 3251
 }
 $18 = $0 + 12 | 0; //@line 3253
 HEAP32[$18 >> 2] = 232; //@line 3254
 $AsyncCtx17 = _emscripten_alloc_async_context(24, sp) | 0; //@line 3255
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5212, $0); //@line 3256
 if (___async) {
  HEAP32[$AsyncCtx17 >> 2] = 82; //@line 3259
  HEAP32[$AsyncCtx17 + 4 >> 2] = $18; //@line 3261
  HEAP8[$AsyncCtx17 + 8 >> 0] = $21 & 1; //@line 3264
  HEAP32[$AsyncCtx17 + 12 >> 2] = $23; //@line 3266
  HEAP32[$AsyncCtx17 + 16 >> 2] = $5; //@line 3268
  HEAP32[$AsyncCtx17 + 20 >> 2] = $5; //@line 3270
  sp = STACKTOP; //@line 3271
  STACKTOP = sp; //@line 3272
  return 0; //@line 3272
 }
 _emscripten_free_async_context($AsyncCtx17 | 0); //@line 3274
 $26 = HEAP32[$18 >> 2] | 0; //@line 3275
 do {
  if ($26 | 0) {
   $29 = HEAP32[$26 + 8 >> 2] | 0; //@line 3280
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 3281
   FUNCTION_TABLE_vi[$29 & 255]($23); //@line 3282
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 83; //@line 3285
    HEAP8[$AsyncCtx + 4 >> 0] = $21 & 1; //@line 3288
    HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 3290
    HEAP32[$AsyncCtx + 12 >> 2] = $5; //@line 3292
    sp = STACKTOP; //@line 3293
    STACKTOP = sp; //@line 3294
    return 0; //@line 3294
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 3296
    break;
   }
  }
 } while (0);
 do {
  if (!$21) {
   $34 = (HEAP32[$5 >> 2] | 0) + -1 | 0; //@line 3304
   HEAP32[$5 >> 2] = $34; //@line 3305
   if (!$34) {
    $37 = HEAP32[$5 + 24 >> 2] | 0; //@line 3309
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3310
    FUNCTION_TABLE_vi[$37 & 255]($5); //@line 3311
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 84; //@line 3314
     HEAP32[$AsyncCtx3 + 4 >> 2] = $5; //@line 3316
     sp = STACKTOP; //@line 3317
     STACKTOP = sp; //@line 3318
     return 0; //@line 3318
    }
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3320
    $40 = HEAP32[$5 + 4 >> 2] | 0; //@line 3322
    $AsyncCtx13 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3323
    _equeue_dealloc($40, $5); //@line 3324
    if (___async) {
     HEAP32[$AsyncCtx13 >> 2] = 85; //@line 3327
     sp = STACKTOP; //@line 3328
     STACKTOP = sp; //@line 3329
     return 0; //@line 3329
    } else {
     _emscripten_free_async_context($AsyncCtx13 | 0); //@line 3331
     break;
    }
   }
  }
 } while (0);
 $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3337
 __ZN6events10EventQueue8dispatchEi(4960, -1); //@line 3338
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 86; //@line 3341
  sp = STACKTOP; //@line 3342
  STACKTOP = sp; //@line 3343
  return 0; //@line 3343
 } else {
  _emscripten_free_async_context($AsyncCtx6 | 0); //@line 3345
  STACKTOP = sp; //@line 3346
  return 0; //@line 3346
 }
 return 0; //@line 3348
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$phi$trans$insert = 0, $$pre = 0, $$pre$i$i4 = 0, $$pre10 = 0, $12 = 0, $2 = 0, $20 = 0, $21 = 0, $25 = 0, $27 = 0, $29 = 0, $3 = 0, $30 = 0, $33 = 0, $4 = 0, $41 = 0, $49 = 0, $6 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx8 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 323
 STACKTOP = STACKTOP + 16 | 0; //@line 324
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 324
 $2 = sp; //@line 325
 $3 = $1 + 12 | 0; //@line 326
 $4 = HEAP32[$3 >> 2] | 0; //@line 327
 if ($4 | 0) {
  $6 = $0 + 56 | 0; //@line 330
  if (($6 | 0) != ($1 | 0)) {
   $8 = $0 + 68 | 0; //@line 333
   $9 = HEAP32[$8 >> 2] | 0; //@line 334
   do {
    if (!$9) {
     $20 = $4; //@line 338
     label = 7; //@line 339
    } else {
     $12 = HEAP32[$9 + 8 >> 2] | 0; //@line 342
     $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 343
     FUNCTION_TABLE_vi[$12 & 255]($6); //@line 344
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 18; //@line 347
      HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 349
      HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 351
      HEAP32[$AsyncCtx + 12 >> 2] = $6; //@line 353
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 355
      HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 357
      sp = STACKTOP; //@line 358
      STACKTOP = sp; //@line 359
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 361
      $$pre = HEAP32[$3 >> 2] | 0; //@line 362
      if (!$$pre) {
       $25 = 0; //@line 365
       break;
      } else {
       $20 = $$pre; //@line 368
       label = 7; //@line 369
       break;
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 7) {
     $21 = HEAP32[$20 + 4 >> 2] | 0; //@line 378
     $AsyncCtx2 = _emscripten_alloc_async_context(16, sp) | 0; //@line 379
     FUNCTION_TABLE_vii[$21 & 3]($6, $1); //@line 380
     if (___async) {
      HEAP32[$AsyncCtx2 >> 2] = 19; //@line 383
      HEAP32[$AsyncCtx2 + 4 >> 2] = $3; //@line 385
      HEAP32[$AsyncCtx2 + 8 >> 2] = $8; //@line 387
      HEAP32[$AsyncCtx2 + 12 >> 2] = $0; //@line 389
      sp = STACKTOP; //@line 390
      STACKTOP = sp; //@line 391
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx2 | 0); //@line 393
      $25 = HEAP32[$3 >> 2] | 0; //@line 395
      break;
     }
    }
   } while (0);
   HEAP32[$8 >> 2] = $25; //@line 400
  }
  _gpio_irq_set($0 + 28 | 0, 2, 1); //@line 403
  STACKTOP = sp; //@line 404
  return;
 }
 HEAP32[$2 >> 2] = 0; //@line 406
 HEAP32[$2 + 4 >> 2] = 0; //@line 406
 HEAP32[$2 + 8 >> 2] = 0; //@line 406
 HEAP32[$2 + 12 >> 2] = 0; //@line 406
 $27 = $0 + 56 | 0; //@line 407
 do {
  if (($27 | 0) != ($2 | 0)) {
   $29 = $0 + 68 | 0; //@line 411
   $30 = HEAP32[$29 >> 2] | 0; //@line 412
   if ($30 | 0) {
    $33 = HEAP32[$30 + 8 >> 2] | 0; //@line 416
    $AsyncCtx5 = _emscripten_alloc_async_context(24, sp) | 0; //@line 417
    FUNCTION_TABLE_vi[$33 & 255]($27); //@line 418
    if (___async) {
     HEAP32[$AsyncCtx5 >> 2] = 20; //@line 421
     HEAP32[$AsyncCtx5 + 4 >> 2] = $2; //@line 423
     HEAP32[$AsyncCtx5 + 8 >> 2] = $29; //@line 425
     HEAP32[$AsyncCtx5 + 12 >> 2] = $27; //@line 427
     HEAP32[$AsyncCtx5 + 16 >> 2] = $2; //@line 429
     HEAP32[$AsyncCtx5 + 20 >> 2] = $0; //@line 431
     sp = STACKTOP; //@line 432
     STACKTOP = sp; //@line 433
     return;
    }
    _emscripten_free_async_context($AsyncCtx5 | 0); //@line 435
    $$phi$trans$insert = $2 + 12 | 0; //@line 436
    $$pre10 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 437
    if ($$pre10 | 0) {
     $41 = HEAP32[$$pre10 + 4 >> 2] | 0; //@line 441
     $AsyncCtx8 = _emscripten_alloc_async_context(20, sp) | 0; //@line 442
     FUNCTION_TABLE_vii[$41 & 3]($27, $2); //@line 443
     if (___async) {
      HEAP32[$AsyncCtx8 >> 2] = 21; //@line 446
      HEAP32[$AsyncCtx8 + 4 >> 2] = $$phi$trans$insert; //@line 448
      HEAP32[$AsyncCtx8 + 8 >> 2] = $29; //@line 450
      HEAP32[$AsyncCtx8 + 12 >> 2] = $2; //@line 452
      HEAP32[$AsyncCtx8 + 16 >> 2] = $0; //@line 454
      sp = STACKTOP; //@line 455
      STACKTOP = sp; //@line 456
      return;
     }
     _emscripten_free_async_context($AsyncCtx8 | 0); //@line 458
     $$pre$i$i4 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 459
     HEAP32[$29 >> 2] = $$pre$i$i4; //@line 460
     if (!$$pre$i$i4) {
      break;
     }
     $49 = HEAP32[$$pre$i$i4 + 8 >> 2] | 0; //@line 467
     $AsyncCtx11 = _emscripten_alloc_async_context(12, sp) | 0; //@line 468
     FUNCTION_TABLE_vi[$49 & 255]($2); //@line 469
     if (___async) {
      HEAP32[$AsyncCtx11 >> 2] = 22; //@line 472
      HEAP32[$AsyncCtx11 + 4 >> 2] = $2; //@line 474
      HEAP32[$AsyncCtx11 + 8 >> 2] = $0; //@line 476
      sp = STACKTOP; //@line 477
      STACKTOP = sp; //@line 478
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx11 | 0); //@line 480
      break;
     }
    }
   }
   HEAP32[$29 >> 2] = 0; //@line 485
  }
 } while (0);
 _gpio_irq_set($0 + 28 | 0, 2, 0); //@line 489
 STACKTOP = sp; //@line 490
 return;
}
function _mbed_vtracef__async_cb_49($0) {
 $0 = $0 | 0;
 var $$10 = 0, $$3147168 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $10 = 0, $16 = 0, $18 = 0, $2 = 0, $22 = 0, $26 = 0, $30 = 0, $34 = 0, $36 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $54 = 0, $56 = 0, $6 = 0, $67 = 0, $68 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2853
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2855
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2857
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2859
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2861
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2863
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2869
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2871
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 2875
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 2879
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 2883
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 2887
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 2889
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 2893
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 2895
 $44 = HEAP8[$0 + 88 >> 0] & 1; //@line 2898
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 2900
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 2902
 HEAP32[$6 >> 2] = HEAP32[___async_retval >> 2]; //@line 2905
 $50 = _snprintf($8, $10, 1342, $6) | 0; //@line 2906
 $$10 = ($50 | 0) >= ($10 | 0) ? 0 : $50; //@line 2908
 $53 = $8 + $$10 | 0; //@line 2910
 $54 = $10 - $$10 | 0; //@line 2911
 if (($$10 | 0) > 0) {
  if (($54 | 0) > 0) {
   $$3147168 = $54; //@line 2915
   $$3169 = $53; //@line 2915
   label = 4; //@line 2916
  }
 } else {
  $$3147168 = $10; //@line 2919
  $$3169 = $8; //@line 2919
  label = 4; //@line 2920
 }
 if ((label | 0) == 4) {
  $56 = $34 + -2 | 0; //@line 2923
  switch ($56 >>> 1 | $56 << 31 | 0) {
  case 0:
   {
    HEAP32[$36 >> 2] = $18; //@line 2929
    $$5156 = _snprintf($$3169, $$3147168, 1345, $36) | 0; //@line 2931
    break;
   }
  case 1:
   {
    HEAP32[$16 >> 2] = $18; //@line 2935
    $$5156 = _snprintf($$3169, $$3147168, 1360, $16) | 0; //@line 2937
    break;
   }
  case 3:
   {
    HEAP32[$22 >> 2] = $18; //@line 2941
    $$5156 = _snprintf($$3169, $$3147168, 1375, $22) | 0; //@line 2943
    break;
   }
  case 7:
   {
    HEAP32[$26 >> 2] = $18; //@line 2947
    $$5156 = _snprintf($$3169, $$3147168, 1390, $26) | 0; //@line 2949
    break;
   }
  default:
   {
    $$5156 = _snprintf($$3169, $$3147168, 1405, $30) | 0; //@line 2954
   }
  }
  $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 2958
  $67 = $$3169 + $$5156$ | 0; //@line 2960
  $68 = $$3147168 - $$5156$ | 0; //@line 2961
  if (($$5156$ | 0) > 0 & ($68 | 0) > 0) {
   $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 2965
   $70 = _vsnprintf($67, $68, $46, $48) | 0; //@line 2966
   if (___async) {
    HEAP32[$ReallocAsyncCtx10 >> 2] = 42; //@line 2969
    $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 2970
    HEAP32[$71 >> 2] = $2; //@line 2971
    $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 2972
    HEAP32[$72 >> 2] = $4; //@line 2973
    $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 2974
    HEAP32[$73 >> 2] = $68; //@line 2975
    $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 2976
    HEAP32[$74 >> 2] = $67; //@line 2977
    $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 2978
    HEAP32[$75 >> 2] = $40; //@line 2979
    $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 2980
    HEAP32[$76 >> 2] = $42; //@line 2981
    $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 2982
    $$expand_i1_val = $44 & 1; //@line 2983
    HEAP8[$77 >> 0] = $$expand_i1_val; //@line 2984
    sp = STACKTOP; //@line 2985
    return;
   }
   HEAP32[___async_retval >> 2] = $70; //@line 2989
   ___async_unwind = 0; //@line 2990
   HEAP32[$ReallocAsyncCtx10 >> 2] = 42; //@line 2991
   $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 2992
   HEAP32[$71 >> 2] = $2; //@line 2993
   $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 2994
   HEAP32[$72 >> 2] = $4; //@line 2995
   $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 2996
   HEAP32[$73 >> 2] = $68; //@line 2997
   $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 2998
   HEAP32[$74 >> 2] = $67; //@line 2999
   $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 3000
   HEAP32[$75 >> 2] = $40; //@line 3001
   $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 3002
   HEAP32[$76 >> 2] = $42; //@line 3003
   $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 3004
   $$expand_i1_val = $44 & 1; //@line 3005
   HEAP8[$77 >> 0] = $$expand_i1_val; //@line 3006
   sp = STACKTOP; //@line 3007
   return;
  }
 }
 $79 = HEAP32[53] | 0; //@line 3011
 $80 = HEAP32[46] | 0; //@line 3012
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 3013
 FUNCTION_TABLE_vi[$79 & 255]($80); //@line 3014
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 44; //@line 3017
  sp = STACKTOP; //@line 3018
  return;
 }
 ___async_unwind = 0; //@line 3021
 HEAP32[$ReallocAsyncCtx7 >> 2] = 44; //@line 3022
 sp = STACKTOP; //@line 3023
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_32($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1083
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1085
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1087
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1089
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1091
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1093
 $12 = HEAP8[$0 + 24 >> 0] & 1; //@line 1096
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1098
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1100
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1102
 $20 = HEAP8[$0 + 40 >> 0] & 1; //@line 1105
 $22 = HEAP8[$0 + 41 >> 0] & 1; //@line 1108
 $24 = HEAP32[$0 + 44 >> 2] | 0; //@line 1110
 $26 = HEAP32[$0 + 48 >> 2] | 0; //@line 1112
 $28 = HEAP32[$0 + 52 >> 2] | 0; //@line 1114
 L2 : do {
  if (!(HEAP8[$18 >> 0] | 0)) {
   do {
    if (!(HEAP8[$4 >> 0] | 0)) {
     $$182$off0 = $20; //@line 1123
     $$186$off0 = $22; //@line 1123
    } else {
     if (!(HEAP8[$6 >> 0] | 0)) {
      if (!(HEAP32[$16 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $22; //@line 1132
       $$283$off0 = 1; //@line 1132
       label = 13; //@line 1133
       break L2;
      } else {
       $$182$off0 = 1; //@line 1136
       $$186$off0 = $22; //@line 1136
       break;
      }
     }
     if ((HEAP32[$14 >> 2] | 0) == 1) {
      label = 18; //@line 1143
      break L2;
     }
     if (!(HEAP32[$16 >> 2] & 2)) {
      label = 18; //@line 1150
      break L2;
     } else {
      $$182$off0 = 1; //@line 1153
      $$186$off0 = 1; //@line 1153
     }
    }
   } while (0);
   $30 = $24 + 8 | 0; //@line 1157
   if ($30 >>> 0 < $2 >>> 0) {
    HEAP8[$6 >> 0] = 0; //@line 1160
    HEAP8[$4 >> 0] = 0; //@line 1161
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 1162
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $8, $10, $10, 1, $12); //@line 1163
    if (!___async) {
     ___async_unwind = 0; //@line 1166
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 128; //@line 1168
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 1170
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 1172
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 1174
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 1176
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 1178
    HEAP8[$ReallocAsyncCtx5 + 24 >> 0] = $12 & 1; //@line 1181
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 1183
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $16; //@line 1185
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $18; //@line 1187
    HEAP8[$ReallocAsyncCtx5 + 40 >> 0] = $$182$off0 & 1; //@line 1190
    HEAP8[$ReallocAsyncCtx5 + 41 >> 0] = $$186$off0 & 1; //@line 1193
    HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $30; //@line 1195
    HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $26; //@line 1197
    HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $28; //@line 1199
    sp = STACKTOP; //@line 1200
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 1203
    $$283$off0 = $$182$off0; //@line 1203
    label = 13; //@line 1204
   }
  } else {
   $$085$off0$reg2mem$0 = $22; //@line 1207
   $$283$off0 = $20; //@line 1207
   label = 13; //@line 1208
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$26 >> 2] = $10; //@line 1214
    $59 = $8 + 40 | 0; //@line 1215
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 1218
    if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$14 >> 2] | 0) == 2) {
      HEAP8[$18 >> 0] = 1; //@line 1226
      if ($$283$off0) {
       label = 18; //@line 1228
       break;
      } else {
       $67 = 4; //@line 1231
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 1238
   } else {
    $67 = 4; //@line 1240
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 1245
 }
 HEAP32[$28 >> 2] = $67; //@line 1247
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
 sp = STACKTOP; //@line 12674
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 12679
 } else {
  $9 = $1 + 52 | 0; //@line 12681
  $10 = HEAP8[$9 >> 0] | 0; //@line 12682
  $11 = $1 + 53 | 0; //@line 12683
  $12 = HEAP8[$11 >> 0] | 0; //@line 12684
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 12687
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 12688
  HEAP8[$9 >> 0] = 0; //@line 12689
  HEAP8[$11 >> 0] = 0; //@line 12690
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 12691
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 12692
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 126; //@line 12695
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 12697
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 12699
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 12701
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 12703
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 12705
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 12707
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 12709
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 12711
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 12713
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 12715
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 12718
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 12720
   sp = STACKTOP; //@line 12721
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12724
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 12729
    $32 = $0 + 8 | 0; //@line 12730
    $33 = $1 + 54 | 0; //@line 12731
    $$0 = $0 + 24 | 0; //@line 12732
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
     HEAP8[$9 >> 0] = 0; //@line 12765
     HEAP8[$11 >> 0] = 0; //@line 12766
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 12767
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 12768
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 12773
     $62 = $$0 + 8 | 0; //@line 12774
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 12777
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 127; //@line 12782
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 12784
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 12786
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 12788
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 12790
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 12792
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 12794
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 12796
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 12798
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 12800
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 12802
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 12804
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 12806
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 12808
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 12811
    sp = STACKTOP; //@line 12812
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 12816
  HEAP8[$11 >> 0] = $12; //@line 12817
 }
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_31($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 927
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 929
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 931
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 933
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 935
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 938
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 940
 $15 = $12 + 24 | 0; //@line 943
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$12 + 8 >> 2] | 0; //@line 948
   if (!($18 & 2)) {
    $21 = $4 + 36 | 0; //@line 952
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $4 + 54 | 0; //@line 959
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 970
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 971
      if (!___async) {
       ___async_unwind = 0; //@line 974
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 132; //@line 976
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 978
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $2; //@line 980
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 982
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 984
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $4; //@line 986
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $6; //@line 988
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $8; //@line 990
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $10 & 1; //@line 993
      sp = STACKTOP; //@line 994
      return;
     }
     $36 = $4 + 24 | 0; //@line 997
     $37 = $4 + 54 | 0; //@line 998
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 1013
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 1014
     if (!___async) {
      ___async_unwind = 0; //@line 1017
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 131; //@line 1019
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 1021
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $2; //@line 1023
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 1025
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 1027
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 1029
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $4; //@line 1031
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $6; //@line 1033
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $8; //@line 1035
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $10 & 1; //@line 1038
     sp = STACKTOP; //@line 1039
     return;
    }
   }
   $24 = $4 + 54 | 0; //@line 1043
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 1047
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 1048
    if (!___async) {
     ___async_unwind = 0; //@line 1051
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 130; //@line 1053
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 1055
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $2; //@line 1057
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 1059
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $4; //@line 1061
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $6; //@line 1063
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $8; //@line 1065
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $10 & 1; //@line 1068
    sp = STACKTOP; //@line 1069
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9133
      $10 = HEAP32[$9 >> 2] | 0; //@line 9134
      HEAP32[$2 >> 2] = $9 + 4; //@line 9136
      HEAP32[$0 >> 2] = $10; //@line 9137
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9153
      $17 = HEAP32[$16 >> 2] | 0; //@line 9154
      HEAP32[$2 >> 2] = $16 + 4; //@line 9156
      $20 = $0; //@line 9159
      HEAP32[$20 >> 2] = $17; //@line 9161
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 9164
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9180
      $30 = HEAP32[$29 >> 2] | 0; //@line 9181
      HEAP32[$2 >> 2] = $29 + 4; //@line 9183
      $31 = $0; //@line 9184
      HEAP32[$31 >> 2] = $30; //@line 9186
      HEAP32[$31 + 4 >> 2] = 0; //@line 9189
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9205
      $41 = $40; //@line 9206
      $43 = HEAP32[$41 >> 2] | 0; //@line 9208
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 9211
      HEAP32[$2 >> 2] = $40 + 8; //@line 9213
      $47 = $0; //@line 9214
      HEAP32[$47 >> 2] = $43; //@line 9216
      HEAP32[$47 + 4 >> 2] = $46; //@line 9219
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9235
      $57 = HEAP32[$56 >> 2] | 0; //@line 9236
      HEAP32[$2 >> 2] = $56 + 4; //@line 9238
      $59 = ($57 & 65535) << 16 >> 16; //@line 9240
      $62 = $0; //@line 9243
      HEAP32[$62 >> 2] = $59; //@line 9245
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 9248
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9264
      $72 = HEAP32[$71 >> 2] | 0; //@line 9265
      HEAP32[$2 >> 2] = $71 + 4; //@line 9267
      $73 = $0; //@line 9269
      HEAP32[$73 >> 2] = $72 & 65535; //@line 9271
      HEAP32[$73 + 4 >> 2] = 0; //@line 9274
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9290
      $83 = HEAP32[$82 >> 2] | 0; //@line 9291
      HEAP32[$2 >> 2] = $82 + 4; //@line 9293
      $85 = ($83 & 255) << 24 >> 24; //@line 9295
      $88 = $0; //@line 9298
      HEAP32[$88 >> 2] = $85; //@line 9300
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 9303
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9319
      $98 = HEAP32[$97 >> 2] | 0; //@line 9320
      HEAP32[$2 >> 2] = $97 + 4; //@line 9322
      $99 = $0; //@line 9324
      HEAP32[$99 >> 2] = $98 & 255; //@line 9326
      HEAP32[$99 + 4 >> 2] = 0; //@line 9329
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9345
      $109 = +HEAPF64[$108 >> 3]; //@line 9346
      HEAP32[$2 >> 2] = $108 + 8; //@line 9348
      HEAPF64[$0 >> 3] = $109; //@line 9349
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9365
      $116 = +HEAPF64[$115 >> 3]; //@line 9366
      HEAP32[$2 >> 2] = $115 + 8; //@line 9368
      HEAPF64[$0 >> 3] = $116; //@line 9369
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
 sp = STACKTOP; //@line 8033
 STACKTOP = STACKTOP + 224 | 0; //@line 8034
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 8034
 $3 = sp + 120 | 0; //@line 8035
 $4 = sp + 80 | 0; //@line 8036
 $5 = sp; //@line 8037
 $6 = sp + 136 | 0; //@line 8038
 dest = $4; //@line 8039
 stop = dest + 40 | 0; //@line 8039
 do {
  HEAP32[dest >> 2] = 0; //@line 8039
  dest = dest + 4 | 0; //@line 8039
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 8041
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 8045
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 8052
  } else {
   $43 = 0; //@line 8054
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 8056
  $14 = $13 & 32; //@line 8057
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 8063
  }
  $19 = $0 + 48 | 0; //@line 8065
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 8070
    $24 = HEAP32[$23 >> 2] | 0; //@line 8071
    HEAP32[$23 >> 2] = $6; //@line 8072
    $25 = $0 + 28 | 0; //@line 8073
    HEAP32[$25 >> 2] = $6; //@line 8074
    $26 = $0 + 20 | 0; //@line 8075
    HEAP32[$26 >> 2] = $6; //@line 8076
    HEAP32[$19 >> 2] = 80; //@line 8077
    $28 = $0 + 16 | 0; //@line 8079
    HEAP32[$28 >> 2] = $6 + 80; //@line 8080
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 8081
    if (!$24) {
     $$1 = $29; //@line 8084
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 8087
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 8088
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 8089
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 106; //@line 8092
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 8094
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 8096
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 8098
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 8100
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 8102
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 8104
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 8106
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 8108
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 8110
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 8112
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 8114
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 8116
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 8118
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 8120
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 8122
      sp = STACKTOP; //@line 8123
      STACKTOP = sp; //@line 8124
      return 0; //@line 8124
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 8126
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 8129
      HEAP32[$23 >> 2] = $24; //@line 8130
      HEAP32[$19 >> 2] = 0; //@line 8131
      HEAP32[$28 >> 2] = 0; //@line 8132
      HEAP32[$25 >> 2] = 0; //@line 8133
      HEAP32[$26 >> 2] = 0; //@line 8134
      $$1 = $$; //@line 8135
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 8141
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 8144
  HEAP32[$0 >> 2] = $51 | $14; //@line 8149
  if ($43 | 0) {
   ___unlockfile($0); //@line 8152
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 8154
 }
 STACKTOP = sp; //@line 8156
 return $$0 | 0; //@line 8156
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12209
 STACKTOP = STACKTOP + 64 | 0; //@line 12210
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 12210
 $4 = sp; //@line 12211
 $5 = HEAP32[$0 >> 2] | 0; //@line 12212
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 12215
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 12217
 HEAP32[$4 >> 2] = $2; //@line 12218
 HEAP32[$4 + 4 >> 2] = $0; //@line 12220
 HEAP32[$4 + 8 >> 2] = $1; //@line 12222
 HEAP32[$4 + 12 >> 2] = $3; //@line 12224
 $14 = $4 + 16 | 0; //@line 12225
 $15 = $4 + 20 | 0; //@line 12226
 $16 = $4 + 24 | 0; //@line 12227
 $17 = $4 + 28 | 0; //@line 12228
 $18 = $4 + 32 | 0; //@line 12229
 $19 = $4 + 40 | 0; //@line 12230
 dest = $14; //@line 12231
 stop = dest + 36 | 0; //@line 12231
 do {
  HEAP32[dest >> 2] = 0; //@line 12231
  dest = dest + 4 | 0; //@line 12231
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 12231
 HEAP8[$14 + 38 >> 0] = 0; //@line 12231
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 12236
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 12239
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 12240
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 12241
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 118; //@line 12244
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 12246
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 12248
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 12250
    sp = STACKTOP; //@line 12251
    STACKTOP = sp; //@line 12252
    return 0; //@line 12252
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12254
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 12258
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 12262
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 12265
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 12266
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 12267
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 119; //@line 12270
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 12272
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 12274
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 12276
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 12278
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 12280
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 12282
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 12284
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 12286
    sp = STACKTOP; //@line 12287
    STACKTOP = sp; //@line 12288
    return 0; //@line 12288
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12290
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 12304
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 12312
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 12328
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 12333
  }
 } while (0);
 STACKTOP = sp; //@line 12336
 return $$0 | 0; //@line 12336
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 7905
 $7 = ($2 | 0) != 0; //@line 7909
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 7913
   $$03555 = $0; //@line 7914
   $$03654 = $2; //@line 7914
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 7919
     $$036$lcssa64 = $$03654; //@line 7919
     label = 6; //@line 7920
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 7923
    $12 = $$03654 + -1 | 0; //@line 7924
    $16 = ($12 | 0) != 0; //@line 7928
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 7931
     $$03654 = $12; //@line 7931
    } else {
     $$035$lcssa = $11; //@line 7933
     $$036$lcssa = $12; //@line 7933
     $$lcssa = $16; //@line 7933
     label = 5; //@line 7934
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 7939
   $$036$lcssa = $2; //@line 7939
   $$lcssa = $7; //@line 7939
   label = 5; //@line 7940
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 7945
   $$036$lcssa64 = $$036$lcssa; //@line 7945
   label = 6; //@line 7946
  } else {
   $$2 = $$035$lcssa; //@line 7948
   $$3 = 0; //@line 7948
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 7954
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 7957
    $$3 = $$036$lcssa64; //@line 7957
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 7959
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 7963
      $$13745 = $$036$lcssa64; //@line 7963
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 7966
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 7975
       $30 = $$13745 + -4 | 0; //@line 7976
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 7979
        $$13745 = $30; //@line 7979
       } else {
        $$0$lcssa = $29; //@line 7981
        $$137$lcssa = $30; //@line 7981
        label = 11; //@line 7982
        break L11;
       }
      }
      $$140 = $$046; //@line 7986
      $$23839 = $$13745; //@line 7986
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 7988
      $$137$lcssa = $$036$lcssa64; //@line 7988
      label = 11; //@line 7989
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 7995
      $$3 = 0; //@line 7995
      break;
     } else {
      $$140 = $$0$lcssa; //@line 7998
      $$23839 = $$137$lcssa; //@line 7998
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 8005
      $$3 = $$23839; //@line 8005
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 8008
     $$23839 = $$23839 + -1 | 0; //@line 8009
     if (!$$23839) {
      $$2 = $35; //@line 8012
      $$3 = 0; //@line 8012
      break;
     } else {
      $$140 = $35; //@line 8015
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 8023
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 7676
 do {
  if (!$0) {
   do {
    if (!(HEAP32[125] | 0)) {
     $34 = 0; //@line 7684
    } else {
     $12 = HEAP32[125] | 0; //@line 7686
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7687
     $13 = _fflush($12) | 0; //@line 7688
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 102; //@line 7691
      sp = STACKTOP; //@line 7692
      return 0; //@line 7693
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 7695
      $34 = $13; //@line 7696
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 7702
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 7706
    } else {
     $$02327 = $$02325; //@line 7708
     $$02426 = $34; //@line 7708
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 7715
      } else {
       $28 = 0; //@line 7717
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 7725
       $25 = ___fflush_unlocked($$02327) | 0; //@line 7726
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 7731
       $$1 = $25 | $$02426; //@line 7733
      } else {
       $$1 = $$02426; //@line 7735
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 7739
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 7742
      if (!$$023) {
       $$024$lcssa = $$1; //@line 7745
       break L9;
      } else {
       $$02327 = $$023; //@line 7748
       $$02426 = $$1; //@line 7748
      }
     }
     HEAP32[$AsyncCtx >> 2] = 103; //@line 7751
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 7753
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 7755
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 7757
     sp = STACKTOP; //@line 7758
     return 0; //@line 7759
    }
   } while (0);
   ___ofl_unlock(); //@line 7762
   $$0 = $$024$lcssa; //@line 7763
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7769
    $5 = ___fflush_unlocked($0) | 0; //@line 7770
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 100; //@line 7773
     sp = STACKTOP; //@line 7774
     return 0; //@line 7775
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 7777
     $$0 = $5; //@line 7778
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 7783
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 7784
   $7 = ___fflush_unlocked($0) | 0; //@line 7785
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 101; //@line 7788
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 7791
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 7793
    sp = STACKTOP; //@line 7794
    return 0; //@line 7795
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7797
   if ($phitmp) {
    $$0 = $7; //@line 7799
   } else {
    ___unlockfile($0); //@line 7801
    $$0 = $7; //@line 7802
   }
  }
 } while (0);
 return $$0 | 0; //@line 7806
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12391
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12397
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 12403
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 12406
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12407
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 12408
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 122; //@line 12411
     sp = STACKTOP; //@line 12412
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12415
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 12423
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 12428
     $19 = $1 + 44 | 0; //@line 12429
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 12435
     HEAP8[$22 >> 0] = 0; //@line 12436
     $23 = $1 + 53 | 0; //@line 12437
     HEAP8[$23 >> 0] = 0; //@line 12438
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 12440
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 12443
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 12444
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 12445
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 121; //@line 12448
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 12450
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 12452
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 12454
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 12456
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 12458
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 12460
      sp = STACKTOP; //@line 12461
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 12464
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 12468
      label = 13; //@line 12469
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 12474
       label = 13; //@line 12475
      } else {
       $$037$off039 = 3; //@line 12477
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 12481
      $39 = $1 + 40 | 0; //@line 12482
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 12485
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 12495
        $$037$off039 = $$037$off038; //@line 12496
       } else {
        $$037$off039 = $$037$off038; //@line 12498
       }
      } else {
       $$037$off039 = $$037$off038; //@line 12501
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 12504
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 12511
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_54($0) {
 $0 = $0 | 0;
 var $$13 = 0, $$expand_i1_val = 0, $10 = 0, $12 = 0, $14 = 0, $18 = 0, $19 = 0, $2 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 3183
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3185
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3187
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3189
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3193
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3195
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 3198
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3200
 $$13 = ($AsyncRetVal | 0) >= ($6 | 0) ? 0 : $AsyncRetVal; //@line 3202
 $18 = (HEAP32[$0 + 16 >> 2] | 0) + $$13 | 0; //@line 3204
 $19 = $6 - $$13 | 0; //@line 3205
 do {
  if (($$13 | 0) > 0) {
   $21 = HEAP32[52] | 0; //@line 3209
   if (!(($19 | 0) > 0 & ($21 | 0) != 0)) {
    if (($$13 | 0) < 1 | ($19 | 0) < 1 | $14 ^ 1) {
     break;
    }
    _snprintf($18, $19, 1420, $10) | 0; //@line 3221
    break;
   }
   $ReallocAsyncCtx6 = _emscripten_realloc_async_context(32) | 0; //@line 3224
   $23 = FUNCTION_TABLE_i[$21 & 0]() | 0; //@line 3225
   if (___async) {
    HEAP32[$ReallocAsyncCtx6 >> 2] = 43; //@line 3228
    $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 3229
    HEAP32[$24 >> 2] = $2; //@line 3230
    $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 3231
    HEAP32[$25 >> 2] = $18; //@line 3232
    $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 3233
    HEAP32[$26 >> 2] = $19; //@line 3234
    $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 3235
    HEAP32[$27 >> 2] = $4; //@line 3236
    $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 3237
    $$expand_i1_val = $14 & 1; //@line 3238
    HEAP8[$28 >> 0] = $$expand_i1_val; //@line 3239
    $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 3240
    HEAP32[$29 >> 2] = $10; //@line 3241
    $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 3242
    HEAP32[$30 >> 2] = $12; //@line 3243
    sp = STACKTOP; //@line 3244
    return;
   }
   HEAP32[___async_retval >> 2] = $23; //@line 3248
   ___async_unwind = 0; //@line 3249
   HEAP32[$ReallocAsyncCtx6 >> 2] = 43; //@line 3250
   $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 3251
   HEAP32[$24 >> 2] = $2; //@line 3252
   $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 3253
   HEAP32[$25 >> 2] = $18; //@line 3254
   $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 3255
   HEAP32[$26 >> 2] = $19; //@line 3256
   $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 3257
   HEAP32[$27 >> 2] = $4; //@line 3258
   $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 3259
   $$expand_i1_val = $14 & 1; //@line 3260
   HEAP8[$28 >> 0] = $$expand_i1_val; //@line 3261
   $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 3262
   HEAP32[$29 >> 2] = $10; //@line 3263
   $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 3264
   HEAP32[$30 >> 2] = $12; //@line 3265
   sp = STACKTOP; //@line 3266
   return;
  }
 } while (0);
 $34 = HEAP32[53] | 0; //@line 3270
 $35 = HEAP32[46] | 0; //@line 3271
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 3272
 FUNCTION_TABLE_vi[$34 & 255]($35); //@line 3273
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 44; //@line 3276
  sp = STACKTOP; //@line 3277
  return;
 }
 ___async_unwind = 0; //@line 3280
 HEAP32[$ReallocAsyncCtx7 >> 2] = 44; //@line 3281
 sp = STACKTOP; //@line 3282
 return;
}
function _equeue_enqueue($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$051$ph = 0, $$05157 = 0, $$0515859 = 0, $$053 = 0, $13 = 0, $14 = 0, $16 = 0, $24 = 0, $25 = 0, $27 = 0, $29 = 0, $33 = 0, $34 = 0, $42 = 0, $43 = 0, $46 = 0, $47 = 0, $49 = 0, $54 = 0, $65 = 0, $67 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 915
 $13 = $1 - (HEAP32[$0 + 12 >> 2] | 0) | HEAPU8[$1 + 4 >> 0] << HEAP32[$0 + 16 >> 2]; //@line 926
 $14 = $1 + 20 | 0; //@line 927
 $16 = (HEAP32[$14 >> 2] | 0) - $2 | 0; //@line 929
 HEAP32[$14 >> 2] = ($16 & ~($16 >> 31)) + $2; //@line 934
 HEAP8[$1 + 5 >> 0] = HEAP8[$0 + 9 >> 0] | 0; //@line 938
 $24 = $0 + 128 | 0; //@line 939
 _equeue_mutex_lock($24); //@line 940
 $25 = HEAP32[$0 >> 2] | 0; //@line 941
 L1 : do {
  if (!$25) {
   $$051$ph = $0; //@line 945
   label = 5; //@line 946
  } else {
   $27 = HEAP32[$14 >> 2] | 0; //@line 948
   $$053 = $0; //@line 949
   $29 = $25; //@line 949
   while (1) {
    if (((HEAP32[$29 + 20 >> 2] | 0) - $27 | 0) >= 0) {
     break;
    }
    $33 = $29 + 8 | 0; //@line 958
    $34 = HEAP32[$33 >> 2] | 0; //@line 959
    if (!$34) {
     $$051$ph = $33; //@line 962
     label = 5; //@line 963
     break L1;
    } else {
     $$053 = $33; //@line 966
     $29 = $34; //@line 966
    }
   }
   if ((HEAP32[$29 + 20 >> 2] | 0) != (HEAP32[$14 >> 2] | 0)) {
    $49 = $1 + 8 | 0; //@line 974
    HEAP32[$49 >> 2] = $29; //@line 975
    HEAP32[$29 + 16 >> 2] = $49; //@line 977
    $$0515859 = $$053; //@line 978
    label = 11; //@line 979
    break;
   }
   $42 = HEAP32[$29 + 8 >> 2] | 0; //@line 983
   $43 = $1 + 8 | 0; //@line 984
   HEAP32[$43 >> 2] = $42; //@line 985
   if ($42 | 0) {
    HEAP32[$42 + 16 >> 2] = $43; //@line 989
   }
   $46 = HEAP32[$$053 >> 2] | 0; //@line 991
   $47 = $1 + 12 | 0; //@line 992
   HEAP32[$47 >> 2] = $46; //@line 993
   HEAP32[$46 + 16 >> 2] = $47; //@line 995
   $$05157 = $$053; //@line 996
  }
 } while (0);
 if ((label | 0) == 5) {
  HEAP32[$1 + 8 >> 2] = 0; //@line 1001
  $$0515859 = $$051$ph; //@line 1002
  label = 11; //@line 1003
 }
 if ((label | 0) == 11) {
  HEAP32[$1 + 12 >> 2] = 0; //@line 1007
  $$05157 = $$0515859; //@line 1008
 }
 HEAP32[$$05157 >> 2] = $1; //@line 1010
 HEAP32[$1 + 16 >> 2] = $$05157; //@line 1012
 $54 = HEAP32[$0 + 40 >> 2] | 0; //@line 1014
 if (!$54) {
  _equeue_mutex_unlock($24); //@line 1017
  return $13 | 0; //@line 1018
 }
 if (!(HEAP8[$0 + 36 >> 0] | 0)) {
  _equeue_mutex_unlock($24); //@line 1024
  return $13 | 0; //@line 1025
 }
 if ((HEAP32[$0 >> 2] | 0) != ($1 | 0)) {
  _equeue_mutex_unlock($24); //@line 1030
  return $13 | 0; //@line 1031
 }
 if (HEAP32[$1 + 12 >> 2] | 0) {
  _equeue_mutex_unlock($24); //@line 1037
  return $13 | 0; //@line 1038
 }
 $65 = HEAP32[$0 + 44 >> 2] | 0; //@line 1041
 $67 = (HEAP32[$14 >> 2] | 0) - $2 | 0; //@line 1043
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1047
 FUNCTION_TABLE_vii[$54 & 3]($65, $67 & ~($67 >> 31)); //@line 1048
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 27; //@line 1051
  HEAP32[$AsyncCtx + 4 >> 2] = $24; //@line 1053
  HEAP32[$AsyncCtx + 8 >> 2] = $13; //@line 1055
  sp = STACKTOP; //@line 1056
  return 0; //@line 1057
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1059
 _equeue_mutex_unlock($24); //@line 1060
 return $13 | 0; //@line 1061
}
function _mbed_vtracef__async_cb_55($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 3292
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3294
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3296
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3298
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3300
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3302
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3304
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3306
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3308
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3310
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 3312
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 3314
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 3316
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 3318
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 3320
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 3322
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 3324
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 3326
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 3328
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 3330
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 3332
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 3334
 $44 = HEAP8[$0 + 88 >> 0] & 1; //@line 3337
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 3339
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 3341
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 3343
 $55 = ($50 | 0 ? 4 : 0) + $50 + (HEAP32[___async_retval >> 2] | 0) | 0; //@line 3349
 $56 = HEAP32[51] | 0; //@line 3350
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(100) | 0; //@line 3351
 $57 = FUNCTION_TABLE_ii[$56 & 3]($55) | 0; //@line 3352
 if (!___async) {
  HEAP32[___async_retval >> 2] = $57; //@line 3356
  ___async_unwind = 0; //@line 3357
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 41; //@line 3359
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 3361
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 3363
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 3365
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 3367
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 3369
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $12; //@line 3371
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 3373
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $16; //@line 3375
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $18; //@line 3377
 HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $20; //@line 3379
 HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $22; //@line 3381
 HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $24; //@line 3383
 HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $26; //@line 3385
 HEAP32[$ReallocAsyncCtx5 + 56 >> 2] = $28; //@line 3387
 HEAP32[$ReallocAsyncCtx5 + 60 >> 2] = $30; //@line 3389
 HEAP32[$ReallocAsyncCtx5 + 64 >> 2] = $32; //@line 3391
 HEAP32[$ReallocAsyncCtx5 + 68 >> 2] = $34; //@line 3393
 HEAP32[$ReallocAsyncCtx5 + 72 >> 2] = $36; //@line 3395
 HEAP32[$ReallocAsyncCtx5 + 76 >> 2] = $38; //@line 3397
 HEAP32[$ReallocAsyncCtx5 + 80 >> 2] = $40; //@line 3399
 HEAP32[$ReallocAsyncCtx5 + 84 >> 2] = $42; //@line 3401
 HEAP8[$ReallocAsyncCtx5 + 88 >> 0] = $44 & 1; //@line 3404
 HEAP32[$ReallocAsyncCtx5 + 92 >> 2] = $46; //@line 3406
 HEAP32[$ReallocAsyncCtx5 + 96 >> 2] = $48; //@line 3408
 sp = STACKTOP; //@line 3409
 return;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $12 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $29 = 0, $3 = 0, $36 = 0, $39 = 0, $40 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx14 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 11703
 STACKTOP = STACKTOP + 48 | 0; //@line 11704
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 11704
 $vararg_buffer10 = sp + 32 | 0; //@line 11705
 $vararg_buffer7 = sp + 24 | 0; //@line 11706
 $vararg_buffer3 = sp + 16 | 0; //@line 11707
 $vararg_buffer = sp; //@line 11708
 $0 = sp + 36 | 0; //@line 11709
 $1 = ___cxa_get_globals_fast() | 0; //@line 11710
 if ($1 | 0) {
  $3 = HEAP32[$1 >> 2] | 0; //@line 11713
  if ($3 | 0) {
   $7 = $3 + 48 | 0; //@line 11718
   $9 = HEAP32[$7 >> 2] | 0; //@line 11720
   $12 = HEAP32[$7 + 4 >> 2] | 0; //@line 11723
   if (!(($9 & -256 | 0) == 1126902528 & ($12 | 0) == 1129074247)) {
    HEAP32[$vararg_buffer7 >> 2] = 4501; //@line 11729
    _abort_message(4451, $vararg_buffer7); //@line 11730
   }
   if (($9 | 0) == 1126902529 & ($12 | 0) == 1129074247) {
    $22 = HEAP32[$3 + 44 >> 2] | 0; //@line 11739
   } else {
    $22 = $3 + 80 | 0; //@line 11741
   }
   HEAP32[$0 >> 2] = $22; //@line 11743
   $23 = HEAP32[$3 >> 2] | 0; //@line 11744
   $25 = HEAP32[$23 + 4 >> 2] | 0; //@line 11746
   $28 = HEAP32[(HEAP32[10] | 0) + 16 >> 2] | 0; //@line 11749
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 11750
   $29 = FUNCTION_TABLE_iiii[$28 & 7](40, $23, $0) | 0; //@line 11751
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 112; //@line 11754
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 11756
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 11758
    HEAP32[$AsyncCtx + 12 >> 2] = $25; //@line 11760
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 11762
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 11764
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 11766
    sp = STACKTOP; //@line 11767
    STACKTOP = sp; //@line 11768
    return;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 11770
   if (!$29) {
    HEAP32[$vararg_buffer3 >> 2] = 4501; //@line 11772
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 11774
    _abort_message(4410, $vararg_buffer3); //@line 11775
   }
   $36 = HEAP32[$0 >> 2] | 0; //@line 11778
   $39 = HEAP32[(HEAP32[$36 >> 2] | 0) + 8 >> 2] | 0; //@line 11781
   $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 11782
   $40 = FUNCTION_TABLE_ii[$39 & 3]($36) | 0; //@line 11783
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 113; //@line 11786
    HEAP32[$AsyncCtx14 + 4 >> 2] = $vararg_buffer; //@line 11788
    HEAP32[$AsyncCtx14 + 8 >> 2] = $25; //@line 11790
    HEAP32[$AsyncCtx14 + 12 >> 2] = $vararg_buffer; //@line 11792
    sp = STACKTOP; //@line 11793
    STACKTOP = sp; //@line 11794
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 11796
    HEAP32[$vararg_buffer >> 2] = 4501; //@line 11797
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 11799
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 11801
    _abort_message(4365, $vararg_buffer); //@line 11802
   }
  }
 }
 _abort_message(4489, $vararg_buffer10); //@line 11807
}
function _mbed_error_vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1518
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1520
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1522
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1524
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[1237] | 0)) {
  _serial_init(4952, 2, 3); //@line 1532
 }
 $9 = HEAP8[$4 >> 0] | 0; //@line 1534
 if (0 == 13 | $9 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 1540
  _serial_putc(4952, $9 << 24 >> 24); //@line 1541
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 67; //@line 1544
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 1545
   HEAP32[$18 >> 2] = 0; //@line 1546
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 1547
   HEAP32[$19 >> 2] = $AsyncRetVal; //@line 1548
   $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 1549
   HEAP32[$20 >> 2] = $2; //@line 1550
   $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 1551
   HEAP8[$21 >> 0] = $9; //@line 1552
   $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 1553
   HEAP32[$22 >> 2] = $4; //@line 1554
   sp = STACKTOP; //@line 1555
   return;
  }
  ___async_unwind = 0; //@line 1558
  HEAP32[$ReallocAsyncCtx2 >> 2] = 67; //@line 1559
  $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 1560
  HEAP32[$18 >> 2] = 0; //@line 1561
  $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 1562
  HEAP32[$19 >> 2] = $AsyncRetVal; //@line 1563
  $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 1564
  HEAP32[$20 >> 2] = $2; //@line 1565
  $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 1566
  HEAP8[$21 >> 0] = $9; //@line 1567
  $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 1568
  HEAP32[$22 >> 2] = $4; //@line 1569
  sp = STACKTOP; //@line 1570
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 1573
  _serial_putc(4952, 13); //@line 1574
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 66; //@line 1577
   $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 1578
   HEAP8[$12 >> 0] = $9; //@line 1579
   $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 1580
   HEAP32[$13 >> 2] = 0; //@line 1581
   $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 1582
   HEAP32[$14 >> 2] = $AsyncRetVal; //@line 1583
   $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 1584
   HEAP32[$15 >> 2] = $2; //@line 1585
   $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 1586
   HEAP32[$16 >> 2] = $4; //@line 1587
   sp = STACKTOP; //@line 1588
   return;
  }
  ___async_unwind = 0; //@line 1591
  HEAP32[$ReallocAsyncCtx3 >> 2] = 66; //@line 1592
  $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 1593
  HEAP8[$12 >> 0] = $9; //@line 1594
  $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 1595
  HEAP32[$13 >> 2] = 0; //@line 1596
  $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 1597
  HEAP32[$14 >> 2] = $AsyncRetVal; //@line 1598
  $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 1599
  HEAP32[$15 >> 2] = $2; //@line 1600
  $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 1601
  HEAP32[$16 >> 2] = $4; //@line 1602
  sp = STACKTOP; //@line 1603
  return;
 }
}
function _mbed_error_vfprintf__async_cb_36($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1611
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1615
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1617
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1621
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 1622
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP8[$10 + $12 >> 0] | 0; //@line 1628
 if ((HEAP8[$0 + 16 >> 0] | 0) == 13 | $13 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 1634
  _serial_putc(4952, $13 << 24 >> 24); //@line 1635
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 67; //@line 1638
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 1639
   HEAP32[$22 >> 2] = $12; //@line 1640
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 1641
   HEAP32[$23 >> 2] = $4; //@line 1642
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 1643
   HEAP32[$24 >> 2] = $6; //@line 1644
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 1645
   HEAP8[$25 >> 0] = $13; //@line 1646
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 1647
   HEAP32[$26 >> 2] = $10; //@line 1648
   sp = STACKTOP; //@line 1649
   return;
  }
  ___async_unwind = 0; //@line 1652
  HEAP32[$ReallocAsyncCtx2 >> 2] = 67; //@line 1653
  $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 1654
  HEAP32[$22 >> 2] = $12; //@line 1655
  $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 1656
  HEAP32[$23 >> 2] = $4; //@line 1657
  $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 1658
  HEAP32[$24 >> 2] = $6; //@line 1659
  $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 1660
  HEAP8[$25 >> 0] = $13; //@line 1661
  $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 1662
  HEAP32[$26 >> 2] = $10; //@line 1663
  sp = STACKTOP; //@line 1664
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 1667
  _serial_putc(4952, 13); //@line 1668
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 66; //@line 1671
   $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 1672
   HEAP8[$16 >> 0] = $13; //@line 1673
   $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 1674
   HEAP32[$17 >> 2] = $12; //@line 1675
   $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 1676
   HEAP32[$18 >> 2] = $4; //@line 1677
   $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 1678
   HEAP32[$19 >> 2] = $6; //@line 1679
   $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 1680
   HEAP32[$20 >> 2] = $10; //@line 1681
   sp = STACKTOP; //@line 1682
   return;
  }
  ___async_unwind = 0; //@line 1685
  HEAP32[$ReallocAsyncCtx3 >> 2] = 66; //@line 1686
  $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 1687
  HEAP8[$16 >> 0] = $13; //@line 1688
  $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 1689
  HEAP32[$17 >> 2] = $12; //@line 1690
  $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 1691
  HEAP32[$18 >> 2] = $4; //@line 1692
  $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 1693
  HEAP32[$19 >> 2] = $6; //@line 1694
  $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 1695
  HEAP32[$20 >> 2] = $10; //@line 1696
  sp = STACKTOP; //@line 1697
  return;
 }
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6717
 STACKTOP = STACKTOP + 48 | 0; //@line 6718
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 6718
 $vararg_buffer3 = sp + 16 | 0; //@line 6719
 $vararg_buffer = sp; //@line 6720
 $3 = sp + 32 | 0; //@line 6721
 $4 = $0 + 28 | 0; //@line 6722
 $5 = HEAP32[$4 >> 2] | 0; //@line 6723
 HEAP32[$3 >> 2] = $5; //@line 6724
 $7 = $0 + 20 | 0; //@line 6726
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 6728
 HEAP32[$3 + 4 >> 2] = $9; //@line 6729
 HEAP32[$3 + 8 >> 2] = $1; //@line 6731
 HEAP32[$3 + 12 >> 2] = $2; //@line 6733
 $12 = $9 + $2 | 0; //@line 6734
 $13 = $0 + 60 | 0; //@line 6735
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 6738
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 6740
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 6742
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 6744
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 6748
  } else {
   $$04756 = 2; //@line 6750
   $$04855 = $12; //@line 6750
   $$04954 = $3; //@line 6750
   $27 = $17; //@line 6750
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 6756
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 6758
    $38 = $27 >>> 0 > $37 >>> 0; //@line 6759
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 6761
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 6763
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 6765
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 6768
    $44 = $$150 + 4 | 0; //@line 6769
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 6772
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 6775
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 6777
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 6779
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 6781
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 6784
     break L1;
    } else {
     $$04756 = $$1; //@line 6787
     $$04954 = $$150; //@line 6787
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 6791
   HEAP32[$4 >> 2] = 0; //@line 6792
   HEAP32[$7 >> 2] = 0; //@line 6793
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 6796
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 6799
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 6804
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 6810
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 6815
  $25 = $20; //@line 6816
  HEAP32[$4 >> 2] = $25; //@line 6817
  HEAP32[$7 >> 2] = $25; //@line 6818
  $$051 = $2; //@line 6819
 }
 STACKTOP = sp; //@line 6821
 return $$051 | 0; //@line 6821
}
function _mbed_error_vfprintf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$01213 = 0, $$014 = 0, $2 = 0, $24 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0, $$01213$looptemp = 0;
 sp = STACKTOP; //@line 2810
 STACKTOP = STACKTOP + 128 | 0; //@line 2811
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 2811
 $2 = sp; //@line 2812
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 2813
 $3 = _vsnprintf($2, 128, $0, $1) | 0; //@line 2814
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 65; //@line 2817
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 2819
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 2821
  sp = STACKTOP; //@line 2822
  STACKTOP = sp; //@line 2823
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2825
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 2828
  return;
 }
 if (!(HEAP32[1237] | 0)) {
  _serial_init(4952, 2, 3); //@line 2833
  $$01213 = 0; //@line 2834
  $$014 = 0; //@line 2834
 } else {
  $$01213 = 0; //@line 2836
  $$014 = 0; //@line 2836
 }
 while (1) {
  $$01213$looptemp = $$01213;
  $$01213 = HEAP8[$2 + $$014 >> 0] | 0; //@line 2840
  if (!($$01213$looptemp << 24 >> 24 == 13 | $$01213 << 24 >> 24 != 10)) {
   $AsyncCtx7 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2845
   _serial_putc(4952, 13); //@line 2846
   if (___async) {
    label = 8; //@line 2849
    break;
   }
   _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2852
  }
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2855
  _serial_putc(4952, $$01213 << 24 >> 24); //@line 2856
  if (___async) {
   label = 11; //@line 2859
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2862
  $24 = $$014 + 1 | 0; //@line 2863
  if (($24 | 0) == ($3 | 0)) {
   label = 13; //@line 2866
   break;
  } else {
   $$014 = $24; //@line 2869
  }
 }
 if ((label | 0) == 8) {
  HEAP32[$AsyncCtx7 >> 2] = 66; //@line 2873
  HEAP8[$AsyncCtx7 + 4 >> 0] = $$01213; //@line 2875
  HEAP32[$AsyncCtx7 + 8 >> 2] = $$014; //@line 2877
  HEAP32[$AsyncCtx7 + 12 >> 2] = $3; //@line 2879
  HEAP32[$AsyncCtx7 + 16 >> 2] = $2; //@line 2881
  HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 2883
  sp = STACKTOP; //@line 2884
  STACKTOP = sp; //@line 2885
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx3 >> 2] = 67; //@line 2888
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$014; //@line 2890
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 2892
  HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 2894
  HEAP8[$AsyncCtx3 + 16 >> 0] = $$01213; //@line 2896
  HEAP32[$AsyncCtx3 + 20 >> 2] = $2; //@line 2898
  sp = STACKTOP; //@line 2899
  STACKTOP = sp; //@line 2900
  return;
 } else if ((label | 0) == 13) {
  STACKTOP = sp; //@line 2903
  return;
 }
}
function _main__async_cb_26($0) {
 $0 = $0 | 0;
 var $$expand_i1_val = 0, $12 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 557
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 559
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 561
 if (!$AsyncRetVal) {
  HEAP32[$2 >> 2] = 0; //@line 564
  HEAP32[$2 + 4 >> 2] = 0; //@line 564
  HEAP32[$2 + 8 >> 2] = 0; //@line 564
  HEAP32[$2 + 12 >> 2] = 0; //@line 564
  $18 = 1; //@line 565
  $20 = $2; //@line 565
 } else {
  HEAP32[$AsyncRetVal + 4 >> 2] = 4960; //@line 568
  HEAP32[$AsyncRetVal + 8 >> 2] = 0; //@line 570
  HEAP32[$AsyncRetVal + 12 >> 2] = 0; //@line 572
  HEAP32[$AsyncRetVal + 16 >> 2] = -1; //@line 574
  HEAP32[$AsyncRetVal + 20 >> 2] = 2; //@line 576
  HEAP32[$AsyncRetVal + 24 >> 2] = 81; //@line 578
  HEAP32[$AsyncRetVal + 28 >> 2] = 3; //@line 580
  HEAP32[$AsyncRetVal >> 2] = 1; //@line 581
  $12 = $2 + 4 | 0; //@line 582
  HEAP32[$12 >> 2] = 0; //@line 583
  HEAP32[$12 + 4 >> 2] = 0; //@line 583
  HEAP32[$12 + 8 >> 2] = 0; //@line 583
  HEAP32[$2 >> 2] = $AsyncRetVal; //@line 584
  HEAP32[$AsyncRetVal >> 2] = (HEAP32[$AsyncRetVal >> 2] | 0) + 1; //@line 587
  $18 = 0; //@line 588
  $20 = $2; //@line 588
 }
 $15 = $2 + 12 | 0; //@line 590
 HEAP32[$15 >> 2] = 232; //@line 591
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(24) | 0; //@line 592
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5212, $2); //@line 593
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 82; //@line 596
  $16 = $ReallocAsyncCtx6 + 4 | 0; //@line 597
  HEAP32[$16 >> 2] = $15; //@line 598
  $17 = $ReallocAsyncCtx6 + 8 | 0; //@line 599
  $$expand_i1_val = $18 & 1; //@line 600
  HEAP8[$17 >> 0] = $$expand_i1_val; //@line 601
  $19 = $ReallocAsyncCtx6 + 12 | 0; //@line 602
  HEAP32[$19 >> 2] = $20; //@line 603
  $21 = $ReallocAsyncCtx6 + 16 | 0; //@line 604
  HEAP32[$21 >> 2] = $AsyncRetVal; //@line 605
  $22 = $ReallocAsyncCtx6 + 20 | 0; //@line 606
  HEAP32[$22 >> 2] = $AsyncRetVal; //@line 607
  sp = STACKTOP; //@line 608
  return;
 }
 ___async_unwind = 0; //@line 611
 HEAP32[$ReallocAsyncCtx6 >> 2] = 82; //@line 612
 $16 = $ReallocAsyncCtx6 + 4 | 0; //@line 613
 HEAP32[$16 >> 2] = $15; //@line 614
 $17 = $ReallocAsyncCtx6 + 8 | 0; //@line 615
 $$expand_i1_val = $18 & 1; //@line 616
 HEAP8[$17 >> 0] = $$expand_i1_val; //@line 617
 $19 = $ReallocAsyncCtx6 + 12 | 0; //@line 618
 HEAP32[$19 >> 2] = $20; //@line 619
 $21 = $ReallocAsyncCtx6 + 16 | 0; //@line 620
 HEAP32[$21 >> 2] = $AsyncRetVal; //@line 621
 $22 = $ReallocAsyncCtx6 + 20 | 0; //@line 622
 HEAP32[$22 >> 2] = $AsyncRetVal; //@line 623
 sp = STACKTOP; //@line 624
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 6899
 }
 ret = dest | 0; //@line 6902
 dest_end = dest + num | 0; //@line 6903
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 6907
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 6908
   dest = dest + 1 | 0; //@line 6909
   src = src + 1 | 0; //@line 6910
   num = num - 1 | 0; //@line 6911
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 6913
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 6914
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 6916
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 6917
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 6918
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 6919
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 6920
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 6921
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 6922
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 6923
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 6924
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 6925
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 6926
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 6927
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 6928
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 6929
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 6930
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 6931
   dest = dest + 64 | 0; //@line 6932
   src = src + 64 | 0; //@line 6933
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 6936
   dest = dest + 4 | 0; //@line 6937
   src = src + 4 | 0; //@line 6938
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 6942
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 6944
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 6945
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 6946
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 6947
   dest = dest + 4 | 0; //@line 6948
   src = src + 4 | 0; //@line 6949
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 6954
  dest = dest + 1 | 0; //@line 6955
  src = src + 1 | 0; //@line 6956
 }
 return ret | 0; //@line 6958
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_18($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 122
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 126
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 128
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 130
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 132
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 134
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 136
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 138
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 140
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 142
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 145
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 147
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 151
   $27 = $6 + 24 | 0; //@line 152
   $28 = $4 + 8 | 0; //@line 153
   $29 = $6 + 54 | 0; //@line 154
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
    HEAP8[$10 >> 0] = 0; //@line 184
    HEAP8[$14 >> 0] = 0; //@line 185
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 186
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 187
    if (!___async) {
     ___async_unwind = 0; //@line 190
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 127; //@line 192
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 194
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 196
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 198
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 200
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 202
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 204
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 206
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 208
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 210
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 212
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 214
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 216
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 218
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 221
    sp = STACKTOP; //@line 222
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 227
 HEAP8[$14 >> 0] = $12; //@line 228
 return;
}
function _main__async_cb_25($0) {
 $0 = $0 | 0;
 var $$expand_i1_val = 0, $10 = 0, $11 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $19 = 0, $22 = 0, $23 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 470
 $4 = HEAP8[$0 + 8 >> 0] & 1; //@line 475
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 477
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 479
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 481
 $11 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 482
 if ($11 | 0) {
  $14 = HEAP32[$11 + 8 >> 2] | 0; //@line 486
  $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 487
  FUNCTION_TABLE_vi[$14 & 255]($6); //@line 488
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 83; //@line 491
   $15 = $ReallocAsyncCtx + 4 | 0; //@line 492
   $$expand_i1_val = $4 & 1; //@line 493
   HEAP8[$15 >> 0] = $$expand_i1_val; //@line 494
   $16 = $ReallocAsyncCtx + 8 | 0; //@line 495
   HEAP32[$16 >> 2] = $8; //@line 496
   $17 = $ReallocAsyncCtx + 12 | 0; //@line 497
   HEAP32[$17 >> 2] = $10; //@line 498
   sp = STACKTOP; //@line 499
   return;
  }
  ___async_unwind = 0; //@line 502
  HEAP32[$ReallocAsyncCtx >> 2] = 83; //@line 503
  $15 = $ReallocAsyncCtx + 4 | 0; //@line 504
  $$expand_i1_val = $4 & 1; //@line 505
  HEAP8[$15 >> 0] = $$expand_i1_val; //@line 506
  $16 = $ReallocAsyncCtx + 8 | 0; //@line 507
  HEAP32[$16 >> 2] = $8; //@line 508
  $17 = $ReallocAsyncCtx + 12 | 0; //@line 509
  HEAP32[$17 >> 2] = $10; //@line 510
  sp = STACKTOP; //@line 511
  return;
 }
 if (!$4) {
  $19 = (HEAP32[$8 >> 2] | 0) + -1 | 0; //@line 516
  HEAP32[$8 >> 2] = $19; //@line 517
  if (!$19) {
   $22 = HEAP32[$8 + 24 >> 2] | 0; //@line 521
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 522
   FUNCTION_TABLE_vi[$22 & 255]($10); //@line 523
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 84; //@line 526
    $23 = $ReallocAsyncCtx2 + 4 | 0; //@line 527
    HEAP32[$23 >> 2] = $8; //@line 528
    sp = STACKTOP; //@line 529
    return;
   }
   ___async_unwind = 0; //@line 532
   HEAP32[$ReallocAsyncCtx2 >> 2] = 84; //@line 533
   $23 = $ReallocAsyncCtx2 + 4 | 0; //@line 534
   HEAP32[$23 >> 2] = $8; //@line 535
   sp = STACKTOP; //@line 536
   return;
  }
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 540
 __ZN6events10EventQueue8dispatchEi(4960, -1); //@line 541
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 544
  sp = STACKTOP; //@line 545
  return;
 }
 ___async_unwind = 0; //@line 548
 HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 549
 sp = STACKTOP; //@line 550
 return;
}
function _equeue_alloc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$038$sink$i = 0, $$03842$i = 0, $$1$i9 = 0, $10 = 0, $11 = 0, $14 = 0, $17 = 0, $20 = 0, $21 = 0, $23 = 0, $24 = 0, $26 = 0, $27 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 681
 do {
  if (HEAP8[$0 + 184 >> 0] | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 687
   _wait_ms(10); //@line 688
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 24; //@line 691
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 693
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 695
    sp = STACKTOP; //@line 696
    return 0; //@line 697
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 699
    break;
   }
  }
 } while (0);
 $8 = $1 + 39 & -4; //@line 705
 $9 = $0 + 156 | 0; //@line 706
 _equeue_mutex_lock($9); //@line 707
 $10 = $0 + 24 | 0; //@line 708
 $11 = HEAP32[$10 >> 2] | 0; //@line 709
 L7 : do {
  if (!$11) {
   label = 11; //@line 713
  } else {
   $$03842$i = $10; //@line 715
   $14 = $11; //@line 715
   while (1) {
    if ((HEAP32[$14 >> 2] | 0) >>> 0 >= $8 >>> 0) {
     break;
    }
    $20 = $14 + 8 | 0; //@line 722
    $21 = HEAP32[$20 >> 2] | 0; //@line 723
    if (!$21) {
     label = 11; //@line 726
     break L7;
    } else {
     $$03842$i = $20; //@line 729
     $14 = $21; //@line 729
    }
   }
   $17 = HEAP32[$14 + 12 >> 2] | 0; //@line 733
   if (!$17) {
    $$038$sink$i = $$03842$i; //@line 736
   } else {
    HEAP32[$$03842$i >> 2] = $17; //@line 738
    $$038$sink$i = $17 + 8 | 0; //@line 740
   }
   HEAP32[$$038$sink$i >> 2] = HEAP32[$14 + 8 >> 2]; //@line 744
   _equeue_mutex_unlock($9); //@line 745
   $$1$i9 = $14; //@line 746
  }
 } while (0);
 do {
  if ((label | 0) == 11) {
   $23 = $0 + 28 | 0; //@line 751
   $24 = HEAP32[$23 >> 2] | 0; //@line 752
   if ($24 >>> 0 < $8 >>> 0) {
    _equeue_mutex_unlock($9); //@line 755
    $$0 = 0; //@line 756
    return $$0 | 0; //@line 757
   } else {
    $26 = $0 + 32 | 0; //@line 759
    $27 = HEAP32[$26 >> 2] | 0; //@line 760
    HEAP32[$26 >> 2] = $27 + $8; //@line 762
    HEAP32[$23 >> 2] = $24 - $8; //@line 764
    HEAP32[$27 >> 2] = $8; //@line 765
    HEAP8[$27 + 4 >> 0] = 1; //@line 767
    _equeue_mutex_unlock($9); //@line 768
    if (!$27) {
     $$0 = 0; //@line 771
    } else {
     $$1$i9 = $27; //@line 773
     break;
    }
    return $$0 | 0; //@line 776
   }
  }
 } while (0);
 HEAP32[$$1$i9 + 20 >> 2] = 0; //@line 781
 HEAP32[$$1$i9 + 24 >> 2] = -1; //@line 783
 HEAP32[$$1$i9 + 28 >> 2] = 0; //@line 785
 $$0 = $$1$i9 + 36 | 0; //@line 787
 return $$0 | 0; //@line 788
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 14
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 16
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 18
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 20
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 22
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 24
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 26
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 28
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 30
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 32
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 35
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 36
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
    HEAP8[$10 >> 0] = 0; //@line 69
    HEAP8[$14 >> 0] = 0; //@line 70
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 71
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 72
    if (!___async) {
     ___async_unwind = 0; //@line 75
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 127; //@line 77
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 79
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 81
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 83
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 85
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 87
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 89
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 91
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 93
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 95
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 97
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 99
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 101
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 103
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 106
    sp = STACKTOP; //@line 107
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 112
 HEAP8[$14 >> 0] = $12; //@line 113
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 11892
 STACKTOP = STACKTOP + 64 | 0; //@line 11893
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 11893
 $3 = sp; //@line 11894
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 11897
 } else {
  if (!$1) {
   $$2 = 0; //@line 11901
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 11903
   $6 = ___dynamic_cast($1, 64, 48, 0) | 0; //@line 11904
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 116; //@line 11907
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 11909
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 11911
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 11913
    sp = STACKTOP; //@line 11914
    STACKTOP = sp; //@line 11915
    return 0; //@line 11915
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11917
   if (!$6) {
    $$2 = 0; //@line 11920
   } else {
    dest = $3 + 4 | 0; //@line 11923
    stop = dest + 52 | 0; //@line 11923
    do {
     HEAP32[dest >> 2] = 0; //@line 11923
     dest = dest + 4 | 0; //@line 11923
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 11924
    HEAP32[$3 + 8 >> 2] = $0; //@line 11926
    HEAP32[$3 + 12 >> 2] = -1; //@line 11928
    HEAP32[$3 + 48 >> 2] = 1; //@line 11930
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 11933
    $18 = HEAP32[$2 >> 2] | 0; //@line 11934
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 11935
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 11936
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 117; //@line 11939
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 11941
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 11943
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 11945
     sp = STACKTOP; //@line 11946
     STACKTOP = sp; //@line 11947
     return 0; //@line 11947
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 11949
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 11956
     $$0 = 1; //@line 11957
    } else {
     $$0 = 0; //@line 11959
    }
    $$2 = $$0; //@line 11961
   }
  }
 }
 STACKTOP = sp; //@line 11965
 return $$2 | 0; //@line 11965
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 11438
 STACKTOP = STACKTOP + 128 | 0; //@line 11439
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 11439
 $4 = sp + 124 | 0; //@line 11440
 $5 = sp; //@line 11441
 dest = $5; //@line 11442
 src = 748; //@line 11442
 stop = dest + 124 | 0; //@line 11442
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 11442
  dest = dest + 4 | 0; //@line 11442
  src = src + 4 | 0; //@line 11442
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 11448
   $$015 = 1; //@line 11448
   label = 4; //@line 11449
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 11452
   $$0 = -1; //@line 11453
  }
 } else {
  $$014 = $0; //@line 11456
  $$015 = $1; //@line 11456
  label = 4; //@line 11457
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 11461
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 11463
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 11465
  $14 = $5 + 20 | 0; //@line 11466
  HEAP32[$14 >> 2] = $$014; //@line 11467
  HEAP32[$5 + 44 >> 2] = $$014; //@line 11469
  $16 = $$014 + $$$015 | 0; //@line 11470
  $17 = $5 + 16 | 0; //@line 11471
  HEAP32[$17 >> 2] = $16; //@line 11472
  HEAP32[$5 + 28 >> 2] = $16; //@line 11474
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 11475
  $19 = _vfprintf($5, $2, $3) | 0; //@line 11476
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 108; //@line 11479
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 11481
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 11483
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 11485
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 11487
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 11489
   sp = STACKTOP; //@line 11490
   STACKTOP = sp; //@line 11491
   return 0; //@line 11491
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11493
  if (!$$$015) {
   $$0 = $19; //@line 11496
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 11498
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 11503
   $$0 = $19; //@line 11504
  }
 }
 STACKTOP = sp; //@line 11507
 return $$0 | 0; //@line 11507
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13224
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 13230
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 13234
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 13235
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 13236
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 13237
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 133; //@line 13240
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 13242
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 13244
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 13246
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 13248
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 13250
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 13252
    sp = STACKTOP; //@line 13253
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13256
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 13260
    $$0 = $0 + 24 | 0; //@line 13261
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 13263
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 13264
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 13269
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 13275
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 13278
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 134; //@line 13283
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 13285
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 13287
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 13289
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 13291
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 13293
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 13295
    sp = STACKTOP; //@line 13296
    return;
   }
  }
 } while (0);
 return;
}
function _equeue_alloc__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$038$sink$i = 0, $$03842$i = 0, $$1$i9 = 0, $12 = 0, $15 = 0, $18 = 0, $19 = 0, $21 = 0, $22 = 0, $24 = 0, $25 = 0, $34 = 0, $4 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1316
 $6 = (HEAP32[$0 + 4 >> 2] | 0) + 39 & -4; //@line 1318
 $7 = $4 + 156 | 0; //@line 1319
 _equeue_mutex_lock($7); //@line 1320
 $8 = $4 + 24 | 0; //@line 1321
 $9 = HEAP32[$8 >> 2] | 0; //@line 1322
 L3 : do {
  if (!$9) {
   label = 9; //@line 1326
  } else {
   $$03842$i = $8; //@line 1328
   $12 = $9; //@line 1328
   while (1) {
    if ((HEAP32[$12 >> 2] | 0) >>> 0 >= $6 >>> 0) {
     break;
    }
    $18 = $12 + 8 | 0; //@line 1335
    $19 = HEAP32[$18 >> 2] | 0; //@line 1336
    if (!$19) {
     label = 9; //@line 1339
     break L3;
    } else {
     $$03842$i = $18; //@line 1342
     $12 = $19; //@line 1342
    }
   }
   $15 = HEAP32[$12 + 12 >> 2] | 0; //@line 1346
   if (!$15) {
    $$038$sink$i = $$03842$i; //@line 1349
   } else {
    HEAP32[$$03842$i >> 2] = $15; //@line 1351
    $$038$sink$i = $15 + 8 | 0; //@line 1353
   }
   HEAP32[$$038$sink$i >> 2] = HEAP32[$12 + 8 >> 2]; //@line 1357
   _equeue_mutex_unlock($7); //@line 1358
   $$1$i9 = $12; //@line 1359
  }
 } while (0);
 do {
  if ((label | 0) == 9) {
   $21 = $4 + 28 | 0; //@line 1364
   $22 = HEAP32[$21 >> 2] | 0; //@line 1365
   if ($22 >>> 0 < $6 >>> 0) {
    _equeue_mutex_unlock($7); //@line 1368
    $$0 = 0; //@line 1369
    $34 = ___async_retval; //@line 1370
    HEAP32[$34 >> 2] = $$0; //@line 1371
    return;
   } else {
    $24 = $4 + 32 | 0; //@line 1374
    $25 = HEAP32[$24 >> 2] | 0; //@line 1375
    HEAP32[$24 >> 2] = $25 + $6; //@line 1377
    HEAP32[$21 >> 2] = $22 - $6; //@line 1379
    HEAP32[$25 >> 2] = $6; //@line 1380
    HEAP8[$25 + 4 >> 0] = 1; //@line 1382
    _equeue_mutex_unlock($7); //@line 1383
    if (!$25) {
     $$0 = 0; //@line 1386
    } else {
     $$1$i9 = $25; //@line 1388
     break;
    }
    $34 = ___async_retval; //@line 1391
    HEAP32[$34 >> 2] = $$0; //@line 1392
    return;
   }
  }
 } while (0);
 HEAP32[$$1$i9 + 20 >> 2] = 0; //@line 1398
 HEAP32[$$1$i9 + 24 >> 2] = -1; //@line 1400
 HEAP32[$$1$i9 + 28 >> 2] = 0; //@line 1402
 $$0 = $$1$i9 + 36 | 0; //@line 1404
 $34 = ___async_retval; //@line 1405
 HEAP32[$34 >> 2] = $$0; //@line 1406
 return;
}
function _equeue_dealloc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$02329$i = 0, $$02330$i = 0, $$025$i = 0, $$sink$in$i = 0, $$sink21$i = 0, $10 = 0, $11 = 0, $13 = 0, $14 = 0, $15 = 0, $17 = 0, $18 = 0, $2 = 0, $25 = 0, $4 = 0, $9 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 795
 $2 = $1 + -36 | 0; //@line 796
 $4 = HEAP32[$1 + -8 >> 2] | 0; //@line 798
 do {
  if ($4 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 802
   FUNCTION_TABLE_vi[$4 & 255]($1); //@line 803
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 25; //@line 806
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 808
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 810
    HEAP32[$AsyncCtx + 12 >> 2] = $2; //@line 812
    sp = STACKTOP; //@line 813
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 816
    break;
   }
  }
 } while (0);
 $9 = $0 + 156 | 0; //@line 821
 _equeue_mutex_lock($9); //@line 822
 $10 = $0 + 24 | 0; //@line 823
 $11 = HEAP32[$10 >> 2] | 0; //@line 824
 L7 : do {
  if (!$11) {
   $$02329$i = $10; //@line 828
  } else {
   $13 = HEAP32[$2 >> 2] | 0; //@line 830
   $$025$i = $10; //@line 831
   $15 = $11; //@line 831
   while (1) {
    $14 = HEAP32[$15 >> 2] | 0; //@line 833
    if ($14 >>> 0 >= $13 >>> 0) {
     break;
    }
    $17 = $15 + 8 | 0; //@line 838
    $18 = HEAP32[$17 >> 2] | 0; //@line 839
    if (!$18) {
     $$02329$i = $17; //@line 842
     break L7;
    } else {
     $$025$i = $17; //@line 845
     $15 = $18; //@line 845
    }
   }
   if (($14 | 0) == ($13 | 0)) {
    HEAP32[$1 + -24 >> 2] = $15; //@line 851
    $$02330$i = $$025$i; //@line 854
    $$sink$in$i = (HEAP32[$$025$i >> 2] | 0) + 8 | 0; //@line 854
    $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 855
    $25 = $1 + -28 | 0; //@line 856
    HEAP32[$25 >> 2] = $$sink21$i; //@line 857
    HEAP32[$$02330$i >> 2] = $2; //@line 858
    _equeue_mutex_unlock($9); //@line 859
    return;
   } else {
    $$02329$i = $$025$i; //@line 862
   }
  }
 } while (0);
 HEAP32[$1 + -24 >> 2] = 0; //@line 867
 $$02330$i = $$02329$i; //@line 868
 $$sink$in$i = $$02329$i; //@line 868
 $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 869
 $25 = $1 + -28 | 0; //@line 870
 HEAP32[$25 >> 2] = $$sink21$i; //@line 871
 HEAP32[$$02330$i >> 2] = $2; //@line 872
 _equeue_mutex_unlock($9); //@line 873
 return;
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11534
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 11539
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 11544
  } else {
   $20 = $0 & 255; //@line 11546
   $21 = $0 & 255; //@line 11547
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 11553
   } else {
    $26 = $1 + 20 | 0; //@line 11555
    $27 = HEAP32[$26 >> 2] | 0; //@line 11556
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 11562
     HEAP8[$27 >> 0] = $20; //@line 11563
     $34 = $21; //@line 11564
    } else {
     label = 12; //@line 11566
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 11571
     $32 = ___overflow($1, $0) | 0; //@line 11572
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 110; //@line 11575
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 11577
      sp = STACKTOP; //@line 11578
      return 0; //@line 11579
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 11581
      $34 = $32; //@line 11582
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 11587
   $$0 = $34; //@line 11588
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 11593
   $8 = $0 & 255; //@line 11594
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 11600
    $14 = HEAP32[$13 >> 2] | 0; //@line 11601
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 11607
     HEAP8[$14 >> 0] = $7; //@line 11608
     $$0 = $8; //@line 11609
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 11613
   $19 = ___overflow($1, $0) | 0; //@line 11614
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 109; //@line 11617
    sp = STACKTOP; //@line 11618
    return 0; //@line 11619
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11621
    $$0 = $19; //@line 11622
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 11627
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 7427
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 7430
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 7433
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 7436
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 7442
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 7451
     $24 = $13 >>> 2; //@line 7452
     $$090 = 0; //@line 7453
     $$094 = $7; //@line 7453
     while (1) {
      $25 = $$094 >>> 1; //@line 7455
      $26 = $$090 + $25 | 0; //@line 7456
      $27 = $26 << 1; //@line 7457
      $28 = $27 + $23 | 0; //@line 7458
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 7461
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 7465
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 7471
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 7479
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 7483
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 7489
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 7494
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 7497
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 7497
      }
     }
     $46 = $27 + $24 | 0; //@line 7500
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 7503
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 7507
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 7519
     } else {
      $$4 = 0; //@line 7521
     }
    } else {
     $$4 = 0; //@line 7524
    }
   } else {
    $$4 = 0; //@line 7527
   }
  } else {
   $$4 = 0; //@line 7530
  }
 } while (0);
 return $$4 | 0; //@line 7533
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7092
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 7097
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 7102
  } else {
   $20 = $0 & 255; //@line 7104
   $21 = $0 & 255; //@line 7105
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 7111
   } else {
    $26 = $1 + 20 | 0; //@line 7113
    $27 = HEAP32[$26 >> 2] | 0; //@line 7114
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 7120
     HEAP8[$27 >> 0] = $20; //@line 7121
     $34 = $21; //@line 7122
    } else {
     label = 12; //@line 7124
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7129
     $32 = ___overflow($1, $0) | 0; //@line 7130
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 98; //@line 7133
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 7135
      sp = STACKTOP; //@line 7136
      return 0; //@line 7137
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 7139
      $34 = $32; //@line 7140
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 7145
   $$0 = $34; //@line 7146
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 7151
   $8 = $0 & 255; //@line 7152
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 7158
    $14 = HEAP32[$13 >> 2] | 0; //@line 7159
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 7165
     HEAP8[$14 >> 0] = $7; //@line 7166
     $$0 = $8; //@line 7167
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7171
   $19 = ___overflow($1, $0) | 0; //@line 7172
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 97; //@line 7175
    sp = STACKTOP; //@line 7176
    return 0; //@line 7177
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7179
    $$0 = $19; //@line 7180
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 7185
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7812
 $1 = $0 + 20 | 0; //@line 7813
 $3 = $0 + 28 | 0; //@line 7815
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 7821
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 7822
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 7823
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 104; //@line 7826
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 7828
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 7830
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 7832
    sp = STACKTOP; //@line 7833
    return 0; //@line 7834
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7836
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 7840
     break;
    } else {
     label = 5; //@line 7843
     break;
    }
   }
  } else {
   label = 5; //@line 7848
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 7852
  $14 = HEAP32[$13 >> 2] | 0; //@line 7853
  $15 = $0 + 8 | 0; //@line 7854
  $16 = HEAP32[$15 >> 2] | 0; //@line 7855
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 7863
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 7864
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 7865
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 105; //@line 7868
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 7870
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 7872
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 7874
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 7876
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 7878
     sp = STACKTOP; //@line 7879
     return 0; //@line 7880
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7882
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 7888
  HEAP32[$3 >> 2] = 0; //@line 7889
  HEAP32[$1 >> 2] = 0; //@line 7890
  HEAP32[$15 >> 2] = 0; //@line 7891
  HEAP32[$13 >> 2] = 0; //@line 7892
  $$0 = 0; //@line 7893
 }
 return $$0 | 0; //@line 7895
}
function __ZN16SX1276_LoRaRadio8rx_frameEPhjjhh($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $10 = 0, $13 = 0, $16 = 0, $6 = 0, $7 = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer4 = 0, $vararg_buffer8 = 0, sp = 0;
 sp = STACKTOP; //@line 77
 STACKTOP = STACKTOP + 48 | 0; //@line 78
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 78
 $vararg_buffer12 = sp + 32 | 0; //@line 79
 $vararg_buffer8 = sp + 24 | 0; //@line 80
 $vararg_buffer4 = sp + 16 | 0; //@line 81
 $vararg_buffer = sp; //@line 82
 $6 = $4 & 255; //@line 83
 $7 = $5 & 255; //@line 84
 HEAP32[$vararg_buffer >> 2] = $2; //@line 85
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 87
 HEAP32[$vararg_buffer + 8 >> 2] = $6; //@line 89
 HEAP32[$vararg_buffer + 12 >> 2] = $7; //@line 91
 _mbed_tracef(16, 996, 1024, $vararg_buffer); //@line 92
 _emscripten_asm_const_i(0) | 0; //@line 93
 $10 = HEAP32[$0 + 752 >> 2] | 0; //@line 95
 if (($10 | 0) != ($6 | 0)) {
  HEAP32[$vararg_buffer4 >> 2] = $10; //@line 98
  HEAP32[$vararg_buffer4 + 4 >> 2] = $6; //@line 100
  _mbed_tracef(16, 996, 1106, $vararg_buffer4); //@line 101
  STACKTOP = sp; //@line 102
  return;
 }
 $13 = HEAP32[$0 + 756 >> 2] | 0; //@line 105
 if (($13 | 0) != ($7 | 0)) {
  HEAP32[$vararg_buffer8 >> 2] = $13; //@line 108
  HEAP32[$vararg_buffer8 + 4 >> 2] = $7; //@line 110
  _mbed_tracef(16, 996, 1153, $vararg_buffer8); //@line 111
  STACKTOP = sp; //@line 112
  return;
 }
 $16 = HEAP32[$0 + 692 >> 2] | 0; //@line 115
 if (($16 | 0) == ($3 | 0)) {
  _memcpy($0 + 792 | 0, $1 | 0, $2 | 0) | 0; //@line 119
  HEAP8[$0 + 782 >> 0] = $2; //@line 122
  HEAP8[$0 + 781 >> 0] = -35; //@line 124
  HEAP8[$0 + 780 >> 0] = -5; //@line 126
  HEAP8[$0 + 783 >> 0] = 1; //@line 128
  HEAP32[$0 + 784 >> 2] = _emscripten_asm_const_i(1) | 0; //@line 131
  STACKTOP = sp; //@line 132
  return;
 } else {
  HEAP32[$vararg_buffer12 >> 2] = $16; //@line 134
  HEAP32[$vararg_buffer12 + 4 >> 2] = $3; //@line 136
  _mbed_tracef(16, 996, 1200, $vararg_buffer12); //@line 137
  STACKTOP = sp; //@line 138
  return;
 }
}
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 7576
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 7582
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 7588
   } else {
    $7 = $1 & 255; //@line 7590
    $$03039 = $0; //@line 7591
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 7593
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 7598
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 7601
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 7606
      break;
     } else {
      $$03039 = $13; //@line 7609
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 7613
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 7614
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 7622
     $25 = $18; //@line 7622
     while (1) {
      $24 = $25 ^ $17; //@line 7624
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 7631
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 7634
      $25 = HEAP32[$31 >> 2] | 0; //@line 7635
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 7644
       break;
      } else {
       $$02936 = $31; //@line 7642
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 7649
    }
   } while (0);
   $38 = $1 & 255; //@line 7652
   $$1 = $$029$lcssa; //@line 7653
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 7655
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 7661
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 7664
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 7669
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 7318
 $4 = HEAP32[$3 >> 2] | 0; //@line 7319
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 7326
   label = 5; //@line 7327
  } else {
   $$1 = 0; //@line 7329
  }
 } else {
  $12 = $4; //@line 7333
  label = 5; //@line 7334
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 7338
   $10 = HEAP32[$9 >> 2] | 0; //@line 7339
   $14 = $10; //@line 7342
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 7347
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 7355
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 7359
       $$141 = $0; //@line 7359
       $$143 = $1; //@line 7359
       $31 = $14; //@line 7359
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 7362
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 7369
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 7374
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 7377
      break L5;
     }
     $$139 = $$038; //@line 7383
     $$141 = $0 + $$038 | 0; //@line 7383
     $$143 = $1 - $$038 | 0; //@line 7383
     $31 = HEAP32[$9 >> 2] | 0; //@line 7383
    } else {
     $$139 = 0; //@line 7385
     $$141 = $0; //@line 7385
     $$143 = $1; //@line 7385
     $31 = $14; //@line 7385
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 7388
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 7391
   $$1 = $$139 + $$143 | 0; //@line 7393
  }
 } while (0);
 return $$1 | 0; //@line 7396
}
function _equeue_dealloc__async_cb($0) {
 $0 = $0 | 0;
 var $$02329$i = 0, $$02330$i = 0, $$025$i = 0, $$sink$in$i = 0, $$sink21$i = 0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $16 = 0, $2 = 0, $23 = 0, $4 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1786
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1788
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1790
 $7 = $2 + 156 | 0; //@line 1791
 _equeue_mutex_lock($7); //@line 1792
 $8 = $2 + 24 | 0; //@line 1793
 $9 = HEAP32[$8 >> 2] | 0; //@line 1794
 L3 : do {
  if (!$9) {
   $$02329$i = $8; //@line 1798
  } else {
   $11 = HEAP32[$6 >> 2] | 0; //@line 1800
   $$025$i = $8; //@line 1801
   $13 = $9; //@line 1801
   while (1) {
    $12 = HEAP32[$13 >> 2] | 0; //@line 1803
    if ($12 >>> 0 >= $11 >>> 0) {
     break;
    }
    $15 = $13 + 8 | 0; //@line 1808
    $16 = HEAP32[$15 >> 2] | 0; //@line 1809
    if (!$16) {
     $$02329$i = $15; //@line 1812
     break L3;
    } else {
     $$025$i = $15; //@line 1815
     $13 = $16; //@line 1815
    }
   }
   if (($12 | 0) == ($11 | 0)) {
    HEAP32[$4 + -24 >> 2] = $13; //@line 1821
    $$02330$i = $$025$i; //@line 1824
    $$sink$in$i = (HEAP32[$$025$i >> 2] | 0) + 8 | 0; //@line 1824
    $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 1825
    $23 = $4 + -28 | 0; //@line 1826
    HEAP32[$23 >> 2] = $$sink21$i; //@line 1827
    HEAP32[$$02330$i >> 2] = $6; //@line 1828
    _equeue_mutex_unlock($7); //@line 1829
    return;
   } else {
    $$02329$i = $$025$i; //@line 1832
   }
  }
 } while (0);
 HEAP32[$4 + -24 >> 2] = 0; //@line 1837
 $$02330$i = $$02329$i; //@line 1838
 $$sink$in$i = $$02329$i; //@line 1838
 $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 1839
 $23 = $4 + -28 | 0; //@line 1840
 HEAP32[$23 >> 2] = $$sink21$i; //@line 1841
 HEAP32[$$02330$i >> 2] = $6; //@line 1842
 _equeue_mutex_unlock($7); //@line 1843
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_65($0) {
 $0 = $0 | 0;
 var $$phi$trans$insert = 0, $$pre10 = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 6334
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6338
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6340
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6342
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6344
 $$phi$trans$insert = (HEAP32[$0 + 4 >> 2] | 0) + 12 | 0; //@line 6345
 $$pre10 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 6346
 if (!$$pre10) {
  HEAP32[$4 >> 2] = 0; //@line 6349
  _gpio_irq_set($10 + 28 | 0, 2, 0); //@line 6351
  return;
 }
 $13 = HEAP32[$$pre10 + 4 >> 2] | 0; //@line 6355
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 6356
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 6357
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 21; //@line 6360
  $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 6361
  HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 6362
  $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 6363
  HEAP32[$15 >> 2] = $4; //@line 6364
  $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 6365
  HEAP32[$16 >> 2] = $8; //@line 6366
  $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 6367
  HEAP32[$17 >> 2] = $10; //@line 6368
  sp = STACKTOP; //@line 6369
  return;
 }
 ___async_unwind = 0; //@line 6372
 HEAP32[$ReallocAsyncCtx4 >> 2] = 21; //@line 6373
 $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 6374
 HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 6375
 $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 6376
 HEAP32[$15 >> 2] = $4; //@line 6377
 $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 6378
 HEAP32[$16 >> 2] = $8; //@line 6379
 $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 6380
 HEAP32[$17 >> 2] = $10; //@line 6381
 sp = STACKTOP; //@line 6382
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_29($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 798
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 802
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 804
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 806
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 808
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 810
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 812
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 814
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 817
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 818
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 834
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 835
    if (!___async) {
     ___async_unwind = 0; //@line 838
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 131; //@line 840
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 842
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 844
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 846
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 848
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 850
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 852
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 854
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 856
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 859
    sp = STACKTOP; //@line 860
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
 sp = STACKTOP; //@line 7204
 STACKTOP = STACKTOP + 16 | 0; //@line 7205
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7205
 $2 = sp; //@line 7206
 $3 = $1 & 255; //@line 7207
 HEAP8[$2 >> 0] = $3; //@line 7208
 $4 = $0 + 16 | 0; //@line 7209
 $5 = HEAP32[$4 >> 2] | 0; //@line 7210
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 7217
   label = 4; //@line 7218
  } else {
   $$0 = -1; //@line 7220
  }
 } else {
  $12 = $5; //@line 7223
  label = 4; //@line 7224
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 7228
   $10 = HEAP32[$9 >> 2] | 0; //@line 7229
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 7232
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 7239
     HEAP8[$10 >> 0] = $3; //@line 7240
     $$0 = $13; //@line 7241
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 7246
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7247
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 7248
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 99; //@line 7251
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 7253
    sp = STACKTOP; //@line 7254
    STACKTOP = sp; //@line 7255
    return 0; //@line 7255
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 7257
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 7262
   } else {
    $$0 = -1; //@line 7264
   }
  }
 } while (0);
 STACKTOP = sp; //@line 7268
 return $$0 | 0; //@line 7268
}
function _fflush__async_cb_40($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1955
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1957
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 1959
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 1963
  } else {
   $$02327 = $$02325; //@line 1965
   $$02426 = $AsyncRetVal; //@line 1965
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 1972
    } else {
     $16 = 0; //@line 1974
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 1986
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 1989
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 1992
     break L3;
    } else {
     $$02327 = $$023; //@line 1995
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 1998
   $13 = ___fflush_unlocked($$02327) | 0; //@line 1999
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 2003
    ___async_unwind = 0; //@line 2004
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 103; //@line 2006
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 2008
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 2010
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 2012
   sp = STACKTOP; //@line 2013
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 2017
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 2019
 return;
}
function _main__async_cb_27($0) {
 $0 = $0 | 0;
 var $2 = 0, $5 = 0, $6 = 0, $7 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 630
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 632
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 634
 if (!$AsyncRetVal) {
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 637
  $6 = _equeue_alloc(4960, 32) | 0; //@line 638
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 80; //@line 641
   $7 = $ReallocAsyncCtx7 + 4 | 0; //@line 642
   HEAP32[$7 >> 2] = $2; //@line 643
   sp = STACKTOP; //@line 644
   return;
  }
  HEAP32[___async_retval >> 2] = $6; //@line 648
  ___async_unwind = 0; //@line 649
  HEAP32[$ReallocAsyncCtx7 >> 2] = 80; //@line 650
  $7 = $ReallocAsyncCtx7 + 4 | 0; //@line 651
  HEAP32[$7 >> 2] = $2; //@line 652
  sp = STACKTOP; //@line 653
  return;
 } else {
  HEAP32[$AsyncRetVal >> 2] = 2; //@line 656
  _equeue_event_delay($AsyncRetVal, 1e3); //@line 657
  _equeue_event_period($AsyncRetVal, 1e3); //@line 658
  _equeue_event_dtor($AsyncRetVal, 77); //@line 659
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 660
  _equeue_post(4960, 78, $AsyncRetVal) | 0; //@line 661
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 79; //@line 664
   $5 = $ReallocAsyncCtx4 + 4 | 0; //@line 665
   HEAP32[$5 >> 2] = $2; //@line 666
   sp = STACKTOP; //@line 667
   return;
  }
  ___async_unwind = 0; //@line 670
  HEAP32[$ReallocAsyncCtx4 >> 2] = 79; //@line 671
  $5 = $ReallocAsyncCtx4 + 4 | 0; //@line 672
  HEAP32[$5 >> 2] = $2; //@line 673
  sp = STACKTOP; //@line 674
  return;
 }
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 6963
 value = value & 255; //@line 6965
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 6968
   ptr = ptr + 1 | 0; //@line 6969
  }
  aligned_end = end & -4 | 0; //@line 6972
  block_aligned_end = aligned_end - 64 | 0; //@line 6973
  value4 = value | value << 8 | value << 16 | value << 24; //@line 6974
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 6977
   HEAP32[ptr + 4 >> 2] = value4; //@line 6978
   HEAP32[ptr + 8 >> 2] = value4; //@line 6979
   HEAP32[ptr + 12 >> 2] = value4; //@line 6980
   HEAP32[ptr + 16 >> 2] = value4; //@line 6981
   HEAP32[ptr + 20 >> 2] = value4; //@line 6982
   HEAP32[ptr + 24 >> 2] = value4; //@line 6983
   HEAP32[ptr + 28 >> 2] = value4; //@line 6984
   HEAP32[ptr + 32 >> 2] = value4; //@line 6985
   HEAP32[ptr + 36 >> 2] = value4; //@line 6986
   HEAP32[ptr + 40 >> 2] = value4; //@line 6987
   HEAP32[ptr + 44 >> 2] = value4; //@line 6988
   HEAP32[ptr + 48 >> 2] = value4; //@line 6989
   HEAP32[ptr + 52 >> 2] = value4; //@line 6990
   HEAP32[ptr + 56 >> 2] = value4; //@line 6991
   HEAP32[ptr + 60 >> 2] = value4; //@line 6992
   ptr = ptr + 64 | 0; //@line 6993
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 6997
   ptr = ptr + 4 | 0; //@line 6998
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 7003
  ptr = ptr + 1 | 0; //@line 7004
 }
 return end - num | 0; //@line 7006
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 735
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 739
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 741
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 743
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 745
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 747
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 749
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 752
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 753
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 762
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 763
    if (!___async) {
     ___async_unwind = 0; //@line 766
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 132; //@line 768
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 770
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 772
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 774
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 776
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 778
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 780
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 782
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 785
    sp = STACKTOP; //@line 786
    return;
   }
  }
 }
 return;
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1856
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 1866
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 1866
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 1866
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 1870
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 1873
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 1876
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 1884
  } else {
   $20 = 0; //@line 1886
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 1896
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 1900
  HEAP32[___async_retval >> 2] = $$1; //@line 1902
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 1905
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 1906
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 1910
  ___async_unwind = 0; //@line 1911
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 103; //@line 1913
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 1915
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 1917
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 1919
 sp = STACKTOP; //@line 1920
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2165
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2167
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2169
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2171
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 2176
  } else {
   $9 = $4 + 4 | 0; //@line 2178
   $10 = HEAP32[$9 >> 2] | 0; //@line 2179
   $11 = $4 + 8 | 0; //@line 2180
   $12 = HEAP32[$11 >> 2] | 0; //@line 2181
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 2185
    HEAP32[$6 >> 2] = 0; //@line 2186
    HEAP32[$2 >> 2] = 0; //@line 2187
    HEAP32[$11 >> 2] = 0; //@line 2188
    HEAP32[$9 >> 2] = 0; //@line 2189
    $$0 = 0; //@line 2190
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 2197
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 2198
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 2199
   if (!___async) {
    ___async_unwind = 0; //@line 2202
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 105; //@line 2204
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 2206
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 2208
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 2210
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 2212
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 2214
   sp = STACKTOP; //@line 2215
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 2220
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6268
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6270
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6272
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6274
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6276
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6278
 $$pre = HEAP32[$2 >> 2] | 0; //@line 6279
 if (!$$pre) {
  HEAP32[$4 >> 2] = 0; //@line 6282
  _gpio_irq_set($10 + 28 | 0, 2, 1); //@line 6284
  return;
 }
 $13 = HEAP32[$$pre + 4 >> 2] | 0; //@line 6288
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 6289
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 6290
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 19; //@line 6293
  $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 6294
  HEAP32[$14 >> 2] = $2; //@line 6295
  $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 6296
  HEAP32[$15 >> 2] = $4; //@line 6297
  $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 6298
  HEAP32[$16 >> 2] = $10; //@line 6299
  sp = STACKTOP; //@line 6300
  return;
 }
 ___async_unwind = 0; //@line 6303
 HEAP32[$ReallocAsyncCtx2 >> 2] = 19; //@line 6304
 $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 6305
 HEAP32[$14 >> 2] = $2; //@line 6306
 $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 6307
 HEAP32[$15 >> 2] = $4; //@line 6308
 $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 6309
 HEAP32[$16 >> 2] = $10; //@line 6310
 sp = STACKTOP; //@line 6311
 return;
}
function _equeue_create($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$033$i = 0, $$034$i = 0, $2 = 0, $21 = 0, $23 = 0, $27 = 0, $30 = 0, $5 = 0, $6 = 0;
 $2 = _malloc($1) | 0; //@line 532
 if (!$2) {
  $$0 = -1; //@line 535
  return $$0 | 0; //@line 536
 }
 HEAP32[$0 + 12 >> 2] = $2; //@line 539
 $5 = $0 + 20 | 0; //@line 540
 HEAP32[$5 >> 2] = 0; //@line 541
 $6 = $0 + 16 | 0; //@line 542
 HEAP32[$6 >> 2] = 0; //@line 543
 if ($1 | 0) {
  $$034$i = $1; //@line 546
  $23 = 0; //@line 546
  do {
   $23 = $23 + 1 | 0; //@line 548
   $$034$i = $$034$i >>> 1; //@line 549
  } while (($$034$i | 0) != 0);
  HEAP32[$6 >> 2] = $23; //@line 557
 }
 HEAP32[$0 + 24 >> 2] = 0; //@line 560
 HEAP32[$0 + 28 >> 2] = $1; //@line 562
 HEAP32[$0 + 32 >> 2] = $2; //@line 564
 HEAP32[$0 >> 2] = 0; //@line 565
 HEAP32[$0 + 4 >> 2] = _equeue_tick() | 0; //@line 568
 HEAP8[$0 + 9 >> 0] = 0; //@line 570
 HEAP8[$0 + 8 >> 0] = 0; //@line 572
 HEAP8[$0 + 36 >> 0] = 0; //@line 574
 HEAP32[$0 + 40 >> 2] = 0; //@line 576
 HEAP32[$0 + 44 >> 2] = 0; //@line 578
 HEAP8[$0 + 184 >> 0] = 0; //@line 580
 $21 = _equeue_sema_create($0 + 48 | 0) | 0; //@line 582
 if (($21 | 0) < 0) {
  $$033$i = $21; //@line 585
 } else {
  $27 = _equeue_mutex_create($0 + 128 | 0) | 0; //@line 588
  if (($27 | 0) < 0) {
   $$033$i = $27; //@line 591
  } else {
   $30 = _equeue_mutex_create($0 + 156 | 0) | 0; //@line 594
   $$033$i = ($30 | 0) < 0 ? $30 : 0; //@line 597
  }
 }
 HEAP32[$5 >> 2] = $2; //@line 600
 $$0 = $$033$i; //@line 601
 return $$0 | 0; //@line 602
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 10584
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 10589
    $$0 = 1; //@line 10590
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 10603
     $$0 = 1; //@line 10604
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 10608
     $$0 = -1; //@line 10609
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 10619
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 10623
    $$0 = 2; //@line 10624
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 10636
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 10642
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 10646
    $$0 = 3; //@line 10647
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 10657
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 10663
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 10669
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 10673
    $$0 = 4; //@line 10674
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 10678
    $$0 = -1; //@line 10679
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 10684
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_19($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 261
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 263
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 265
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 267
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 269
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 274
  return;
 }
 dest = $2 + 4 | 0; //@line 278
 stop = dest + 52 | 0; //@line 278
 do {
  HEAP32[dest >> 2] = 0; //@line 278
  dest = dest + 4 | 0; //@line 278
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 279
 HEAP32[$2 + 8 >> 2] = $4; //@line 281
 HEAP32[$2 + 12 >> 2] = -1; //@line 283
 HEAP32[$2 + 48 >> 2] = 1; //@line 285
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 288
 $16 = HEAP32[$6 >> 2] | 0; //@line 289
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 290
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 291
 if (!___async) {
  ___async_unwind = 0; //@line 294
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 117; //@line 296
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 298
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 300
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 302
 sp = STACKTOP; //@line 303
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_30($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 871
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 875
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 877
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 879
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 881
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 883
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 886
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 887
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 893
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 894
   if (!___async) {
    ___async_unwind = 0; //@line 897
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 130; //@line 899
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 901
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 903
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 905
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 907
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 909
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 911
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 914
   sp = STACKTOP; //@line 915
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
  $$0914 = $2; //@line 9468
  $8 = $0; //@line 9468
  $9 = $1; //@line 9468
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 9470
   $$0914 = $$0914 + -1 | 0; //@line 9474
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 9475
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 9476
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 9484
   }
  }
  $$010$lcssa$off0 = $8; //@line 9489
  $$09$lcssa = $$0914; //@line 9489
 } else {
  $$010$lcssa$off0 = $0; //@line 9491
  $$09$lcssa = $2; //@line 9491
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 9495
 } else {
  $$012 = $$010$lcssa$off0; //@line 9497
  $$111 = $$09$lcssa; //@line 9497
  while (1) {
   $26 = $$111 + -1 | 0; //@line 9502
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 9503
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 9507
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 9510
    $$111 = $26; //@line 9510
   }
  }
 }
 return $$1$lcssa | 0; //@line 9514
}
function _equeue_create_inplace($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$033 = 0, $$034 = 0, $20 = 0, $22 = 0, $26 = 0, $29 = 0, $5 = 0;
 HEAP32[$0 + 12 >> 2] = $2; //@line 612
 HEAP32[$0 + 20 >> 2] = 0; //@line 614
 $5 = $0 + 16 | 0; //@line 615
 HEAP32[$5 >> 2] = 0; //@line 616
 if ($1 | 0) {
  $$034 = $1; //@line 619
  $22 = 0; //@line 619
  do {
   $22 = $22 + 1 | 0; //@line 621
   $$034 = $$034 >>> 1; //@line 622
  } while (($$034 | 0) != 0);
  HEAP32[$5 >> 2] = $22; //@line 630
 }
 HEAP32[$0 + 24 >> 2] = 0; //@line 633
 HEAP32[$0 + 28 >> 2] = $1; //@line 635
 HEAP32[$0 + 32 >> 2] = $2; //@line 637
 HEAP32[$0 >> 2] = 0; //@line 638
 HEAP32[$0 + 4 >> 2] = _equeue_tick() | 0; //@line 641
 HEAP8[$0 + 9 >> 0] = 0; //@line 643
 HEAP8[$0 + 8 >> 0] = 0; //@line 645
 HEAP8[$0 + 36 >> 0] = 0; //@line 647
 HEAP32[$0 + 40 >> 2] = 0; //@line 649
 HEAP32[$0 + 44 >> 2] = 0; //@line 651
 HEAP8[$0 + 184 >> 0] = 0; //@line 653
 $20 = _equeue_sema_create($0 + 48 | 0) | 0; //@line 655
 if (($20 | 0) < 0) {
  $$033 = $20; //@line 658
  return $$033 | 0; //@line 659
 }
 $26 = _equeue_mutex_create($0 + 128 | 0) | 0; //@line 662
 if (($26 | 0) < 0) {
  $$033 = $26; //@line 665
  return $$033 | 0; //@line 666
 }
 $29 = _equeue_mutex_create($0 + 156 | 0) | 0; //@line 669
 $$033 = ($29 | 0) < 0 ? $29 : 0; //@line 672
 return $$033 | 0; //@line 673
}
function __ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3377
 $1 = $0 + 4 | 0; //@line 3378
 $2 = HEAP32[$1 >> 2] | 0; //@line 3379
 $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 3380
 $3 = _equeue_alloc($2, 4) | 0; //@line 3381
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 88; //@line 3384
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 3386
  HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 3388
  sp = STACKTOP; //@line 3389
  return 0; //@line 3390
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3392
 if (!$3) {
  $$0 = 0; //@line 3395
  return $$0 | 0; //@line 3396
 }
 HEAP32[$3 >> 2] = HEAP32[$0 + 28 >> 2]; //@line 3400
 _equeue_event_delay($3, HEAP32[$0 + 12 >> 2] | 0); //@line 3403
 _equeue_event_period($3, HEAP32[$0 + 16 >> 2] | 0); //@line 3406
 _equeue_event_dtor($3, 89); //@line 3407
 $13 = HEAP32[$1 >> 2] | 0; //@line 3408
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3409
 $14 = _equeue_post($13, 90, $3) | 0; //@line 3410
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 91; //@line 3413
  sp = STACKTOP; //@line 3414
  return 0; //@line 3415
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3417
 $$0 = $14; //@line 3418
 return $$0 | 0; //@line 3419
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $11 = 0, $12 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 353
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 358
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 360
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  $8 = (HEAP32[$4 >> 2] | 0) + -1 | 0; //@line 363
  HEAP32[$4 >> 2] = $8; //@line 364
  if (!$8) {
   $11 = HEAP32[$4 + 24 >> 2] | 0; //@line 368
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 369
   FUNCTION_TABLE_vi[$11 & 255]($6); //@line 370
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 84; //@line 373
    $12 = $ReallocAsyncCtx2 + 4 | 0; //@line 374
    HEAP32[$12 >> 2] = $4; //@line 375
    sp = STACKTOP; //@line 376
    return;
   }
   ___async_unwind = 0; //@line 379
   HEAP32[$ReallocAsyncCtx2 >> 2] = 84; //@line 380
   $12 = $ReallocAsyncCtx2 + 4 | 0; //@line 381
   HEAP32[$12 >> 2] = $4; //@line 382
   sp = STACKTOP; //@line 383
   return;
  }
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 387
 __ZN6events10EventQueue8dispatchEi(4960, -1); //@line 388
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 391
  sp = STACKTOP; //@line 392
  return;
 }
 ___async_unwind = 0; //@line 395
 HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 396
 sp = STACKTOP; //@line 397
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1413
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1415
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1419
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1421
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1423
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1425
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 1429
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 1432
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 1433
   if (!___async) {
    ___async_unwind = 0; //@line 1436
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 134; //@line 1438
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 1440
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 1442
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 1444
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 1446
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 1448
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 1450
   sp = STACKTOP; //@line 1451
   return;
  }
 }
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 6970
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 6975
   label = 4; //@line 6976
  } else {
   $$01519 = $0; //@line 6978
   $23 = $1; //@line 6978
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 6983
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 6986
    $23 = $6; //@line 6987
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 6991
     label = 4; //@line 6992
     break;
    } else {
     $$01519 = $6; //@line 6995
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 7001
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 7003
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 7011
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 7019
  } else {
   $$pn = $$0; //@line 7021
   while (1) {
    $19 = $$pn + 1 | 0; //@line 7023
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 7027
     break;
    } else {
     $$pn = $19; //@line 7030
    }
   }
  }
  $$sink = $$1$lcssa; //@line 7035
 }
 return $$sink - $1 | 0; //@line 7038
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 12139
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 12146
   $10 = $1 + 16 | 0; //@line 12147
   $11 = HEAP32[$10 >> 2] | 0; //@line 12148
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 12151
    HEAP32[$1 + 24 >> 2] = $4; //@line 12153
    HEAP32[$1 + 36 >> 2] = 1; //@line 12155
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 12165
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 12170
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 12173
    HEAP8[$1 + 54 >> 0] = 1; //@line 12175
    break;
   }
   $21 = $1 + 24 | 0; //@line 12178
   $22 = HEAP32[$21 >> 2] | 0; //@line 12179
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 12182
    $28 = $4; //@line 12183
   } else {
    $28 = $22; //@line 12185
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 12194
   }
  }
 } while (0);
 return;
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $12 = 0, $2 = 0, $4 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 264
 $2 = $0; //@line 265
 L1 : do {
  switch ($1 | 0) {
  case 1:
   {
    $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 270
    if ($4 | 0) {
     $7 = HEAP32[$4 >> 2] | 0; //@line 274
     $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 275
     FUNCTION_TABLE_vi[$7 & 255]($2 + 40 | 0); //@line 276
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 16; //@line 279
      sp = STACKTOP; //@line 280
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 283
      break L1;
     }
    }
    break;
   }
  case 2:
   {
    $9 = HEAP32[$2 + 68 >> 2] | 0; //@line 291
    if ($9 | 0) {
     $12 = HEAP32[$9 >> 2] | 0; //@line 295
     $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 296
     FUNCTION_TABLE_vi[$12 & 255]($2 + 56 | 0); //@line 297
     if (___async) {
      HEAP32[$AsyncCtx2 >> 2] = 17; //@line 300
      sp = STACKTOP; //@line 301
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx2 | 0); //@line 304
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
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11633
 $1 = HEAP32[93] | 0; //@line 11634
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 11640
 } else {
  $19 = 0; //@line 11642
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 11648
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 11654
    $12 = HEAP32[$11 >> 2] | 0; //@line 11655
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 11661
     HEAP8[$12 >> 0] = 10; //@line 11662
     $22 = 0; //@line 11663
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 11667
   $17 = ___overflow($1, 10) | 0; //@line 11668
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 111; //@line 11671
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 11673
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 11675
    sp = STACKTOP; //@line 11676
    return 0; //@line 11677
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 11679
    $22 = $17 >> 31; //@line 11681
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 11688
 }
 return $22 | 0; //@line 11690
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_66($0) {
 $0 = $0 | 0;
 var $$pre$i$i4 = 0, $12 = 0, $13 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 6388
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6394
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6396
 $$pre$i$i4 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 6397
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = $$pre$i$i4; //@line 6398
 if (!$$pre$i$i4) {
  _gpio_irq_set($8 + 28 | 0, 2, 0); //@line 6402
  return;
 }
 $12 = HEAP32[$$pre$i$i4 + 8 >> 2] | 0; //@line 6407
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(12) | 0; //@line 6408
 FUNCTION_TABLE_vi[$12 & 255]($6); //@line 6409
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 22; //@line 6412
  $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 6413
  HEAP32[$13 >> 2] = $6; //@line 6414
  $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 6415
  HEAP32[$14 >> 2] = $8; //@line 6416
  sp = STACKTOP; //@line 6417
  return;
 }
 ___async_unwind = 0; //@line 6420
 HEAP32[$ReallocAsyncCtx5 >> 2] = 22; //@line 6421
 $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 6422
 HEAP32[$13 >> 2] = $6; //@line 6423
 $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 6424
 HEAP32[$14 >> 2] = $8; //@line 6425
 sp = STACKTOP; //@line 6426
 return;
}
function __ZN4mbed11InterruptInD0Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 195
 HEAP32[$0 >> 2] = 160; //@line 196
 _gpio_irq_free($0 + 28 | 0); //@line 198
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 200
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 206
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 207
   FUNCTION_TABLE_vi[$7 & 255]($0 + 56 | 0); //@line 208
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 14; //@line 211
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 213
    sp = STACKTOP; //@line 214
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 217
    break;
   }
  }
 } while (0);
 $10 = HEAP32[$0 + 52 >> 2] | 0; //@line 223
 if (!$10) {
  __ZdlPv($0); //@line 226
  return;
 }
 $14 = HEAP32[$10 + 8 >> 2] | 0; //@line 231
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 232
 FUNCTION_TABLE_vi[$14 & 255]($0 + 40 | 0); //@line 233
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 15; //@line 236
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 238
  sp = STACKTOP; //@line 239
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 242
 __ZdlPv($0); //@line 243
 return;
}
function _mbed_vtracef__async_cb_50($0) {
 $0 = $0 | 0;
 var $$18 = 0, $10 = 0, $12 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 3030
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3032
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3034
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3036
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 3041
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3043
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 3048
 $16 = _snprintf($4, $6, 1342, $2) | 0; //@line 3049
 $$18 = ($16 | 0) >= ($6 | 0) ? 0 : $16; //@line 3051
 $19 = $4 + $$18 | 0; //@line 3053
 $20 = $6 - $$18 | 0; //@line 3054
 if (($$18 | 0) > 0) {
  if (!(($$18 | 0) < 1 | ($20 | 0) < 1 | $10 ^ 1)) {
   _snprintf($19, $20, 1420, $12) | 0; //@line 3062
  }
 }
 $23 = HEAP32[53] | 0; //@line 3065
 $24 = HEAP32[46] | 0; //@line 3066
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 3067
 FUNCTION_TABLE_vi[$23 & 255]($24); //@line 3068
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 44; //@line 3071
  sp = STACKTOP; //@line 3072
  return;
 }
 ___async_unwind = 0; //@line 3075
 HEAP32[$ReallocAsyncCtx7 >> 2] = 44; //@line 3076
 sp = STACKTOP; //@line 3077
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_35($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1461
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1467
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1469
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1471
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1473
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 1478
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 1480
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 1481
 if (!___async) {
  ___async_unwind = 0; //@line 1484
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 134; //@line 1486
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 1488
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 1490
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 1492
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 1494
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 1496
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 1498
 sp = STACKTOP; //@line 1499
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 11998
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 12007
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 12012
      HEAP32[$13 >> 2] = $2; //@line 12013
      $19 = $1 + 40 | 0; //@line 12014
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 12017
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 12027
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 12031
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 12038
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
 $$016 = 0; //@line 10704
 while (1) {
  if ((HEAPU8[2473 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 10711
   break;
  }
  $7 = $$016 + 1 | 0; //@line 10714
  if (($7 | 0) == 87) {
   $$01214 = 2561; //@line 10717
   $$115 = 87; //@line 10717
   label = 5; //@line 10718
   break;
  } else {
   $$016 = $7; //@line 10721
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 2561; //@line 10727
  } else {
   $$01214 = 2561; //@line 10729
   $$115 = $$016; //@line 10729
   label = 5; //@line 10730
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 10735
   $$113 = $$01214; //@line 10736
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 10740
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 10747
   if (!$$115) {
    $$012$lcssa = $$113; //@line 10750
    break;
   } else {
    $$01214 = $$113; //@line 10753
    label = 5; //@line 10754
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 10761
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6203
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6205
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6207
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6209
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 6211
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 6213
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 4501; //@line 6218
  HEAP32[$4 + 4 >> 2] = $6; //@line 6220
  _abort_message(4410, $4); //@line 6221
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 6224
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 6227
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 6228
 $16 = FUNCTION_TABLE_ii[$15 & 3]($12) | 0; //@line 6229
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 6233
  ___async_unwind = 0; //@line 6234
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 113; //@line 6236
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 6238
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 6240
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 6242
 sp = STACKTOP; //@line 6243
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2030
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2032
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2034
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2038
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 2042
  label = 4; //@line 2043
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 2048
   label = 4; //@line 2049
  } else {
   $$037$off039 = 3; //@line 2051
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 2055
  $17 = $8 + 40 | 0; //@line 2056
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 2059
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 2069
    $$037$off039 = $$037$off038; //@line 2070
   } else {
    $$037$off039 = $$037$off038; //@line 2072
   }
  } else {
   $$037$off039 = $$037$off038; //@line 2075
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 2078
 return;
}
function __ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb_62($0) {
 $0 = $0 | 0;
 var $13 = 0, $14 = 0, $2 = 0, $4 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6136
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6138
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6140
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6142
 if (!$AsyncRetVal) {
  HEAP32[___async_retval >> 2] = 0; //@line 6146
  return;
 }
 HEAP32[$AsyncRetVal >> 2] = HEAP32[$2 + 28 >> 2]; //@line 6151
 _equeue_event_delay($AsyncRetVal, HEAP32[$2 + 12 >> 2] | 0); //@line 6154
 _equeue_event_period($AsyncRetVal, HEAP32[$2 + 16 >> 2] | 0); //@line 6157
 _equeue_event_dtor($AsyncRetVal, 89); //@line 6158
 $13 = HEAP32[$4 >> 2] | 0; //@line 6159
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 6160
 $14 = _equeue_post($13, 90, $AsyncRetVal) | 0; //@line 6161
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 91; //@line 6164
  sp = STACKTOP; //@line 6165
  return;
 }
 HEAP32[___async_retval >> 2] = $14; //@line 6169
 ___async_unwind = 0; //@line 6170
 HEAP32[$ReallocAsyncCtx >> 2] = 91; //@line 6171
 sp = STACKTOP; //@line 6172
 return;
}
function _strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $2 = 0, $5 = 0;
 $2 = HEAP8[$1 >> 0] | 0; //@line 10777
 do {
  if (!($2 << 24 >> 24)) {
   $$0 = $0; //@line 10781
  } else {
   $5 = _strchr($0, $2 << 24 >> 24) | 0; //@line 10784
   if (!$5) {
    $$0 = 0; //@line 10787
   } else {
    if (!(HEAP8[$1 + 1 >> 0] | 0)) {
     $$0 = $5; //@line 10793
    } else {
     if (!(HEAP8[$5 + 1 >> 0] | 0)) {
      $$0 = 0; //@line 10799
     } else {
      if (!(HEAP8[$1 + 2 >> 0] | 0)) {
       $$0 = _twobyte_strstr($5, $1) | 0; //@line 10806
       break;
      }
      if (!(HEAP8[$5 + 2 >> 0] | 0)) {
       $$0 = 0; //@line 10813
      } else {
       if (!(HEAP8[$1 + 3 >> 0] | 0)) {
        $$0 = _threebyte_strstr($5, $1) | 0; //@line 10820
        break;
       }
       if (!(HEAP8[$5 + 3 >> 0] | 0)) {
        $$0 = 0; //@line 10827
       } else {
        if (!(HEAP8[$1 + 4 >> 0] | 0)) {
         $$0 = _fourbyte_strstr($5, $1) | 0; //@line 10834
         break;
        } else {
         $$0 = _twoway_strstr($5, $1) | 0; //@line 10838
         break;
        }
       }
      }
     }
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 10848
}
function __ZN4mbed11InterruptInD2Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 144
 HEAP32[$0 >> 2] = 160; //@line 145
 _gpio_irq_free($0 + 28 | 0); //@line 147
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 149
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 155
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 156
   FUNCTION_TABLE_vi[$7 & 255]($0 + 56 | 0); //@line 157
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 12; //@line 160
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 162
    sp = STACKTOP; //@line 163
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 166
    break;
   }
  }
 } while (0);
 $10 = HEAP32[$0 + 52 >> 2] | 0; //@line 172
 if (!$10) {
  return;
 }
 $14 = HEAP32[$10 + 8 >> 2] | 0; //@line 179
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 180
 FUNCTION_TABLE_vi[$14 & 255]($0 + 40 | 0); //@line 181
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 13; //@line 184
  sp = STACKTOP; //@line 185
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 188
 return;
}
function _fourbyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$lcssa = 0, $$sink21$lcssa = 0, $$sink2123 = 0, $18 = 0, $32 = 0, $33 = 0, $35 = 0, $39 = 0, $40 = 0, $41 = 0;
 $18 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8 | (HEAPU8[$1 + 3 >> 0] | 0); //@line 10973
 $32 = $0 + 3 | 0; //@line 10987
 $33 = HEAP8[$32 >> 0] | 0; //@line 10988
 $35 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | (HEAPU8[$0 + 2 >> 0] | 0) << 8 | $33 & 255; //@line 10990
 if ($33 << 24 >> 24 == 0 | ($35 | 0) == ($18 | 0)) {
  $$lcssa = $33; //@line 10995
  $$sink21$lcssa = $32; //@line 10995
 } else {
  $$sink2123 = $32; //@line 10997
  $39 = $35; //@line 10997
  while (1) {
   $40 = $$sink2123 + 1 | 0; //@line 11000
   $41 = HEAP8[$40 >> 0] | 0; //@line 11001
   $39 = $39 << 8 | $41 & 255; //@line 11003
   if ($41 << 24 >> 24 == 0 | ($39 | 0) == ($18 | 0)) {
    $$lcssa = $41; //@line 11008
    $$sink21$lcssa = $40; //@line 11008
    break;
   } else {
    $$sink2123 = $40; //@line 11011
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$sink21$lcssa + -3 | 0 : 0) | 0; //@line 11018
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $4 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3486
 $1 = HEAP32[$0 >> 2] | 0; //@line 3487
 if (!$1) {
  return;
 }
 $4 = (HEAP32[$1 >> 2] | 0) + -1 | 0; //@line 3493
 HEAP32[$1 >> 2] = $4; //@line 3494
 if ($4 | 0) {
  return;
 }
 $7 = HEAP32[$1 + 24 >> 2] | 0; //@line 3500
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3501
 FUNCTION_TABLE_vi[$7 & 255]($1); //@line 3502
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 94; //@line 3505
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3507
  sp = STACKTOP; //@line 3508
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3511
 $9 = HEAP32[$0 >> 2] | 0; //@line 3512
 $11 = HEAP32[$9 + 4 >> 2] | 0; //@line 3514
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3515
 _equeue_dealloc($11, $9); //@line 3516
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 95; //@line 3519
  sp = STACKTOP; //@line 3520
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 3523
 return;
}
function _mbed_vtracef__async_cb_56($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 3415
 $3 = HEAP32[54] | 0; //@line 3419
 if (HEAP8[$0 + 4 >> 0] & 1 & ($3 | 0) != 0) {
  $5 = HEAP32[46] | 0; //@line 3423
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 3424
  FUNCTION_TABLE_vi[$3 & 255]($5); //@line 3425
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 37; //@line 3428
   sp = STACKTOP; //@line 3429
   return;
  }
  ___async_unwind = 0; //@line 3432
  HEAP32[$ReallocAsyncCtx2 >> 2] = 37; //@line 3433
  sp = STACKTOP; //@line 3434
  return;
 } else {
  $6 = HEAP32[53] | 0; //@line 3437
  $7 = HEAP32[46] | 0; //@line 3438
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 3439
  FUNCTION_TABLE_vi[$6 & 255]($7); //@line 3440
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 39; //@line 3443
   sp = STACKTOP; //@line 3444
   return;
  }
  ___async_unwind = 0; //@line 3447
  HEAP32[$ReallocAsyncCtx4 >> 2] = 39; //@line 3448
  sp = STACKTOP; //@line 3449
  return;
 }
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3052
 $2 = $0 + 12 | 0; //@line 3054
 $3 = HEAP32[$2 >> 2] | 0; //@line 3055
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 3059
   _mbed_assert_internal(1663, 1668, 528); //@line 3060
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 71; //@line 3063
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 3065
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 3067
    sp = STACKTOP; //@line 3068
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 3071
    $8 = HEAP32[$2 >> 2] | 0; //@line 3073
    break;
   }
  } else {
   $8 = $3; //@line 3077
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 3080
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3082
 FUNCTION_TABLE_vi[$7 & 255]($0); //@line 3083
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 72; //@line 3086
  sp = STACKTOP; //@line 3087
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3090
  return;
 }
}
function _abort_message($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11831
 STACKTOP = STACKTOP + 16 | 0; //@line 11832
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11832
 $1 = sp; //@line 11833
 HEAP32[$1 >> 2] = $varargs; //@line 11834
 $2 = HEAP32[61] | 0; //@line 11835
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 11836
 _vfprintf($2, $0, $1) | 0; //@line 11837
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 114; //@line 11840
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 11842
  sp = STACKTOP; //@line 11843
  STACKTOP = sp; //@line 11844
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 11846
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 11847
 _fputc(10, $2) | 0; //@line 11848
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 115; //@line 11851
  sp = STACKTOP; //@line 11852
  STACKTOP = sp; //@line 11853
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 11855
  _abort(); //@line 11856
 }
}
function _threebyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$016$lcssa = 0, $$01618 = 0, $$019 = 0, $$lcssa = 0, $14 = 0, $23 = 0, $24 = 0, $27 = 0, $30 = 0, $31 = 0;
 $14 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8; //@line 10907
 $23 = $0 + 2 | 0; //@line 10916
 $24 = HEAP8[$23 >> 0] | 0; //@line 10917
 $27 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | ($24 & 255) << 8; //@line 10920
 if (($27 | 0) == ($14 | 0) | $24 << 24 >> 24 == 0) {
  $$016$lcssa = $23; //@line 10925
  $$lcssa = $24; //@line 10925
 } else {
  $$01618 = $23; //@line 10927
  $$019 = $27; //@line 10927
  while (1) {
   $30 = $$01618 + 1 | 0; //@line 10929
   $31 = HEAP8[$30 >> 0] | 0; //@line 10930
   $$019 = ($$019 | $31 & 255) << 8; //@line 10933
   if (($$019 | 0) == ($14 | 0) | $31 << 24 >> 24 == 0) {
    $$016$lcssa = $30; //@line 10938
    $$lcssa = $31; //@line 10938
    break;
   } else {
    $$01618 = $30; //@line 10941
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$016$lcssa + -2 | 0 : 0) | 0; //@line 10948
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 10535
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 10535
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 10536
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 10537
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 10546
    $$016 = $9; //@line 10549
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 10549
   } else {
    $$016 = $0; //@line 10551
    $storemerge = 0; //@line 10551
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 10553
   $$0 = $$016; //@line 10554
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 10558
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 10564
   HEAP32[tempDoublePtr >> 2] = $2; //@line 10567
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 10567
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 10568
  }
 }
 return +$$0;
}
function _equeue_sema_wait($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $20 = 0, $3 = 0, $4 = 0, sp = 0;
 sp = STACKTOP; //@line 1699
 STACKTOP = STACKTOP + 16 | 0; //@line 1700
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1700
 $2 = sp + 8 | 0; //@line 1701
 $3 = sp; //@line 1702
 _pthread_mutex_lock($0 | 0) | 0; //@line 1703
 $4 = $0 + 76 | 0; //@line 1704
 do {
  if (!(HEAP8[$4 >> 0] | 0)) {
   if (($1 | 0) < 0) {
    _pthread_cond_wait($0 + 28 | 0, $0 | 0) | 0; //@line 1712
    break;
   } else {
    _gettimeofday($2 | 0, 0) | 0; //@line 1715
    HEAP32[$3 >> 2] = (HEAP32[$2 >> 2] | 0) + (($1 >>> 0) / 1e3 | 0); //@line 1719
    HEAP32[$3 + 4 >> 2] = ((HEAP32[$2 + 4 >> 2] | 0) * 1e3 | 0) + ($1 * 1e6 | 0); //@line 1726
    _pthread_cond_timedwait($0 + 28 | 0, $0 | 0, $3 | 0) | 0; //@line 1728
    break;
   }
  }
 } while (0);
 $20 = (HEAP8[$4 >> 0] | 0) != 0; //@line 1734
 HEAP8[$4 >> 0] = 0; //@line 1735
 _pthread_mutex_unlock($0 | 0) | 0; //@line 1736
 STACKTOP = sp; //@line 1737
 return $20 | 0; //@line 1737
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13434
 STACKTOP = STACKTOP + 16 | 0; //@line 13435
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13435
 $3 = sp; //@line 13436
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 13438
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 13441
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 13442
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 13443
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 138; //@line 13446
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 13448
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 13450
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 13452
  sp = STACKTOP; //@line 13453
  STACKTOP = sp; //@line 13454
  return 0; //@line 13454
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 13456
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 13460
 }
 STACKTOP = sp; //@line 13462
 return $8 & 1 | 0; //@line 13462
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13498
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13506
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13508
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 13510
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 13512
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 13514
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 13516
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 13518
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 13529
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 13530
 HEAP32[$10 >> 2] = 0; //@line 13531
 HEAP32[$12 >> 2] = 0; //@line 13532
 HEAP32[$14 >> 2] = 0; //@line 13533
 HEAP32[$2 >> 2] = 0; //@line 13534
 $33 = HEAP32[$16 >> 2] | 0; //@line 13535
 HEAP32[$16 >> 2] = $33 | $18; //@line 13540
 if ($20 | 0) {
  ___unlockfile($22); //@line 13543
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 13546
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3430
 $1 = HEAP32[$0 >> 2] | 0; //@line 3431
 if ($1 | 0) {
  $4 = HEAP32[$1 + 20 >> 2] | 0; //@line 3435
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3436
  $5 = FUNCTION_TABLE_ii[$4 & 3]($1) | 0; //@line 3437
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 92; //@line 3440
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3442
   sp = STACKTOP; //@line 3443
   return;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3446
  HEAP32[(HEAP32[$0 >> 2] | 0) + 8 >> 2] = $5; //@line 3449
  if ($5 | 0) {
   return;
  }
 }
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3455
 _mbed_assert_internal(1857, 1860, 149); //@line 3456
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 93; //@line 3459
  sp = STACKTOP; //@line 3460
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 3463
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
 sp = STACKTOP; //@line 12354
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 12360
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 12363
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 12366
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 12367
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 12368
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 120; //@line 12371
    sp = STACKTOP; //@line 12372
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12375
    break;
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_53($0) {
 $0 = $0 | 0;
 var $$pre = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 3146
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3150
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 2) {
  return;
 }
 $5 = $4 + -1 | 0; //@line 3155
 $$pre = HEAP32[56] | 0; //@line 3156
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 3157
 FUNCTION_TABLE_v[$$pre & 7](); //@line 3158
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 46; //@line 3161
  $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 3162
  HEAP32[$6 >> 2] = $4; //@line 3163
  $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 3164
  HEAP32[$7 >> 2] = $5; //@line 3165
  sp = STACKTOP; //@line 3166
  return;
 }
 ___async_unwind = 0; //@line 3169
 HEAP32[$ReallocAsyncCtx9 >> 2] = 46; //@line 3170
 $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 3171
 HEAP32[$6 >> 2] = $4; //@line 3172
 $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 3173
 HEAP32[$7 >> 2] = $5; //@line 3174
 sp = STACKTOP; //@line 3175
 return;
}
function _mbed_vtracef__async_cb_52($0) {
 $0 = $0 | 0;
 var $$pre = 0, $2 = 0, $4 = 0, $5 = 0, $6 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 3113
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3115
 if (($2 | 0) <= 1) {
  return;
 }
 $4 = $2 + -1 | 0; //@line 3120
 $$pre = HEAP32[56] | 0; //@line 3121
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 3122
 FUNCTION_TABLE_v[$$pre & 7](); //@line 3123
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 46; //@line 3126
  $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 3127
  HEAP32[$5 >> 2] = $2; //@line 3128
  $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 3129
  HEAP32[$6 >> 2] = $4; //@line 3130
  sp = STACKTOP; //@line 3131
  return;
 }
 ___async_unwind = 0; //@line 3134
 HEAP32[$ReallocAsyncCtx9 >> 2] = 46; //@line 3135
 $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 3136
 HEAP32[$5 >> 2] = $2; //@line 3137
 $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 3138
 HEAP32[$6 >> 2] = $4; //@line 3139
 sp = STACKTOP; //@line 3140
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
 sp = STACKTOP; //@line 13353
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 13355
 $8 = $7 >> 8; //@line 13356
 if (!($7 & 1)) {
  $$0 = $8; //@line 13360
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 13365
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 13367
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 13370
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13375
 FUNCTION_TABLE_viiiiii[$17 & 3]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 13376
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 136; //@line 13379
  sp = STACKTOP; //@line 13380
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13383
  return;
 }
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12523
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 12529
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 12532
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 12535
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 12536
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 12537
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 123; //@line 12540
    sp = STACKTOP; //@line 12541
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12544
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
 sp = STACKTOP; //@line 13395
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 13397
 $7 = $6 >> 8; //@line 13398
 if (!($6 & 1)) {
  $$0 = $7; //@line 13402
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 13407
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 13409
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 13412
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13417
 FUNCTION_TABLE_viiiii[$16 & 3]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 13418
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 137; //@line 13421
  sp = STACKTOP; //@line 13422
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13425
  return;
 }
}
function ___dynamic_cast__async_cb_2($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13597
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13599
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13601
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 13607
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 13622
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 13638
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 13643
    break;
   }
  default:
   {
    $$0 = 0; //@line 13647
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 13652
 return;
}
function _mbed_error_vfprintf__async_cb_37($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1704
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 1706
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1708
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1710
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1712
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1714
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 1716
 _serial_putc(4952, $2 << 24 >> 24); //@line 1717
 if (!___async) {
  ___async_unwind = 0; //@line 1720
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 67; //@line 1722
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 1724
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 1726
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $8; //@line 1728
 HEAP8[$ReallocAsyncCtx2 + 16 >> 0] = $2; //@line 1730
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 1732
 sp = STACKTOP; //@line 1733
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13310
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 13312
 $6 = $5 >> 8; //@line 13313
 if (!($5 & 1)) {
  $$0 = $6; //@line 13317
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 13322
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 13324
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 13327
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13332
 FUNCTION_TABLE_viiii[$15 & 3]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 13333
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 135; //@line 13336
  sp = STACKTOP; //@line 13337
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13340
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
 sp = STACKTOP; //@line 9533
 STACKTOP = STACKTOP + 256 | 0; //@line 9534
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 9534
 $5 = sp; //@line 9535
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 9541
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 9545
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 9548
   $$011 = $9; //@line 9549
   do {
    _out_670($0, $5, 256); //@line 9551
    $$011 = $$011 + -256 | 0; //@line 9552
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 9561
  } else {
   $$0$lcssa = $9; //@line 9563
  }
  _out_670($0, $5, $$0$lcssa); //@line 9565
 }
 STACKTOP = sp; //@line 9567
 return;
}
function __ZN4mbed11InterruptInD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2116
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2118
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 2120
 if (!$4) {
  __ZdlPv($2); //@line 2123
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 2128
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 2129
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 2130
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 15; //@line 2133
  $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 2134
  HEAP32[$9 >> 2] = $2; //@line 2135
  sp = STACKTOP; //@line 2136
  return;
 }
 ___async_unwind = 0; //@line 2139
 HEAP32[$ReallocAsyncCtx2 >> 2] = 15; //@line 2140
 $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 2141
 HEAP32[$9 >> 2] = $2; //@line 2142
 sp = STACKTOP; //@line 2143
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 6828
 STACKTOP = STACKTOP + 32 | 0; //@line 6829
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 6829
 $vararg_buffer = sp; //@line 6830
 $3 = sp + 20 | 0; //@line 6831
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 6835
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 6837
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 6839
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 6841
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 6843
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 6848
  $10 = -1; //@line 6849
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 6852
 }
 STACKTOP = sp; //@line 6854
 return $10 | 0; //@line 6854
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 2459
 STACKTOP = STACKTOP + 16 | 0; //@line 2460
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2460
 $vararg_buffer = sp; //@line 2461
 HEAP32[$vararg_buffer >> 2] = $0; //@line 2462
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 2464
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 2466
 _mbed_error_printf(1425, $vararg_buffer); //@line 2467
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2468
 _mbed_die(); //@line 2469
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 47; //@line 2472
  sp = STACKTOP; //@line 2473
  STACKTOP = sp; //@line 2474
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2476
  STACKTOP = sp; //@line 2477
  return;
 }
}
function _snprintf($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11412
 STACKTOP = STACKTOP + 16 | 0; //@line 11413
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11413
 $3 = sp; //@line 11414
 HEAP32[$3 >> 2] = $varargs; //@line 11415
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 11416
 $4 = _vsnprintf($0, $1, $2, $3) | 0; //@line 11417
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 107; //@line 11420
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 11422
  sp = STACKTOP; //@line 11423
  STACKTOP = sp; //@line 11424
  return 0; //@line 11424
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11426
  STACKTOP = sp; //@line 11427
  return $4 | 0; //@line 11427
 }
 return 0; //@line 11429
}
function _mbed_vtracef__async_cb_51($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 3083
 HEAP32[50] = HEAP32[48]; //@line 3085
 $2 = HEAP32[56] | 0; //@line 3086
 if (!$2) {
  return;
 }
 $4 = HEAP32[57] | 0; //@line 3091
 HEAP32[57] = 0; //@line 3092
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 3093
 FUNCTION_TABLE_v[$2 & 7](); //@line 3094
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 45; //@line 3097
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 3098
  HEAP32[$5 >> 2] = $4; //@line 3099
  sp = STACKTOP; //@line 3100
  return;
 }
 ___async_unwind = 0; //@line 3103
 HEAP32[$ReallocAsyncCtx8 >> 2] = 45; //@line 3104
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 3105
 HEAP32[$5 >> 2] = $4; //@line 3106
 sp = STACKTOP; //@line 3107
 return;
}
function _mbed_vtracef__async_cb_48($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 2819
 HEAP32[50] = HEAP32[48]; //@line 2821
 $2 = HEAP32[56] | 0; //@line 2822
 if (!$2) {
  return;
 }
 $4 = HEAP32[57] | 0; //@line 2827
 HEAP32[57] = 0; //@line 2828
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 2829
 FUNCTION_TABLE_v[$2 & 7](); //@line 2830
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 45; //@line 2833
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 2834
  HEAP32[$5 >> 2] = $4; //@line 2835
  sp = STACKTOP; //@line 2836
  return;
 }
 ___async_unwind = 0; //@line 2839
 HEAP32[$ReallocAsyncCtx8 >> 2] = 45; //@line 2840
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 2841
 HEAP32[$5 >> 2] = $4; //@line 2842
 sp = STACKTOP; //@line 2843
 return;
}
function _mbed_vtracef__async_cb_47($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 2789
 HEAP32[50] = HEAP32[48]; //@line 2791
 $2 = HEAP32[56] | 0; //@line 2792
 if (!$2) {
  return;
 }
 $4 = HEAP32[57] | 0; //@line 2797
 HEAP32[57] = 0; //@line 2798
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 2799
 FUNCTION_TABLE_v[$2 & 7](); //@line 2800
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 45; //@line 2803
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 2804
  HEAP32[$5 >> 2] = $4; //@line 2805
  sp = STACKTOP; //@line 2806
  return;
 }
 ___async_unwind = 0; //@line 2809
 HEAP32[$ReallocAsyncCtx8 >> 2] = 45; //@line 2810
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 2811
 HEAP32[$5 >> 2] = $4; //@line 2812
 sp = STACKTOP; //@line 2813
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 12076
 $5 = HEAP32[$4 >> 2] | 0; //@line 12077
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 12081
   HEAP32[$1 + 24 >> 2] = $3; //@line 12083
   HEAP32[$1 + 36 >> 2] = 1; //@line 12085
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 12089
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 12092
    HEAP32[$1 + 24 >> 2] = 2; //@line 12094
    HEAP8[$1 + 54 >> 0] = 1; //@line 12096
    break;
   }
   $10 = $1 + 24 | 0; //@line 12099
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 12103
   }
  }
 } while (0);
 return;
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 12626
 STACKTOP = STACKTOP + 16 | 0; //@line 12627
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12627
 $vararg_buffer = sp; //@line 12628
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 12629
 FUNCTION_TABLE_v[$0 & 7](); //@line 12630
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 125; //@line 12633
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 12635
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 12637
  sp = STACKTOP; //@line 12638
  STACKTOP = sp; //@line 12639
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 12641
  _abort_message(4792, $vararg_buffer); //@line 12642
 }
}
function _equeue_post($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $4 = 0, $6 = 0, $9 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 881
 $4 = _equeue_tick() | 0; //@line 883
 HEAP32[$2 + -4 >> 2] = $1; //@line 885
 $6 = $2 + -16 | 0; //@line 886
 HEAP32[$6 >> 2] = (HEAP32[$6 >> 2] | 0) + $4; //@line 889
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 890
 $9 = _equeue_enqueue($0, $2 + -36 | 0, $4) | 0; //@line 891
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 26; //@line 894
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 896
  sp = STACKTOP; //@line 897
  return 0; //@line 898
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 900
  _equeue_sema_signal($0 + 48 | 0); //@line 902
  return $9 | 0; //@line 903
 }
 return 0; //@line 905
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 6935
 $3 = HEAP8[$1 >> 0] | 0; //@line 6936
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 6941
  $$lcssa8 = $2; //@line 6941
 } else {
  $$011 = $1; //@line 6943
  $$0710 = $0; //@line 6943
  do {
   $$0710 = $$0710 + 1 | 0; //@line 6945
   $$011 = $$011 + 1 | 0; //@line 6946
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 6947
   $9 = HEAP8[$$011 >> 0] | 0; //@line 6948
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 6953
  $$lcssa8 = $8; //@line 6953
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 6963
}
function _memcmp($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $14 = 0, $4 = 0, $5 = 0;
 L1 : do {
  if (!$2) {
   $14 = 0; //@line 11377
  } else {
   $$01318 = $0; //@line 11379
   $$01417 = $2; //@line 11379
   $$019 = $1; //@line 11379
   while (1) {
    $4 = HEAP8[$$01318 >> 0] | 0; //@line 11381
    $5 = HEAP8[$$019 >> 0] | 0; //@line 11382
    if ($4 << 24 >> 24 != $5 << 24 >> 24) {
     break;
    }
    $$01417 = $$01417 + -1 | 0; //@line 11387
    if (!$$01417) {
     $14 = 0; //@line 11392
     break L1;
    } else {
     $$01318 = $$01318 + 1 | 0; //@line 11395
     $$019 = $$019 + 1 | 0; //@line 11395
    }
   }
   $14 = ($4 & 255) - ($5 & 255) | 0; //@line 11401
  }
 } while (0);
 return $14 | 0; //@line 11404
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3024
 $2 = HEAP32[93] | 0; //@line 3025
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3026
 _putc($1, $2) | 0; //@line 3027
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 69; //@line 3030
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 3032
  sp = STACKTOP; //@line 3033
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3036
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3037
 _fflush($2) | 0; //@line 3038
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 70; //@line 3041
  sp = STACKTOP; //@line 3042
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3045
  return;
 }
}
function _mbed_die__async_cb_17($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 14033
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14035
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 14037
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 14038
 _wait_ms(150); //@line 14039
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 49; //@line 14042
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 14043
  HEAP32[$4 >> 2] = $2; //@line 14044
  sp = STACKTOP; //@line 14045
  return;
 }
 ___async_unwind = 0; //@line 14048
 HEAP32[$ReallocAsyncCtx15 >> 2] = 49; //@line 14049
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 14050
 HEAP32[$4 >> 2] = $2; //@line 14051
 sp = STACKTOP; //@line 14052
 return;
}
function _mbed_die__async_cb_16($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 14008
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14010
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 14012
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 14013
 _wait_ms(150); //@line 14014
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 50; //@line 14017
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 14018
  HEAP32[$4 >> 2] = $2; //@line 14019
  sp = STACKTOP; //@line 14020
  return;
 }
 ___async_unwind = 0; //@line 14023
 HEAP32[$ReallocAsyncCtx14 >> 2] = 50; //@line 14024
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 14025
 HEAP32[$4 >> 2] = $2; //@line 14026
 sp = STACKTOP; //@line 14027
 return;
}
function _mbed_die__async_cb_15($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 13983
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13985
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13987
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 13988
 _wait_ms(150); //@line 13989
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 51; //@line 13992
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 13993
  HEAP32[$4 >> 2] = $2; //@line 13994
  sp = STACKTOP; //@line 13995
  return;
 }
 ___async_unwind = 0; //@line 13998
 HEAP32[$ReallocAsyncCtx13 >> 2] = 51; //@line 13999
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 14000
 HEAP32[$4 >> 2] = $2; //@line 14001
 sp = STACKTOP; //@line 14002
 return;
}
function _mbed_die__async_cb_14($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 13958
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13960
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13962
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 13963
 _wait_ms(150); //@line 13964
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 52; //@line 13967
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 13968
  HEAP32[$4 >> 2] = $2; //@line 13969
  sp = STACKTOP; //@line 13970
  return;
 }
 ___async_unwind = 0; //@line 13973
 HEAP32[$ReallocAsyncCtx12 >> 2] = 52; //@line 13974
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 13975
 HEAP32[$4 >> 2] = $2; //@line 13976
 sp = STACKTOP; //@line 13977
 return;
}
function _mbed_die__async_cb_13($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 13933
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13935
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13937
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 13938
 _wait_ms(150); //@line 13939
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 53; //@line 13942
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 13943
  HEAP32[$4 >> 2] = $2; //@line 13944
  sp = STACKTOP; //@line 13945
  return;
 }
 ___async_unwind = 0; //@line 13948
 HEAP32[$ReallocAsyncCtx11 >> 2] = 53; //@line 13949
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 13950
 HEAP32[$4 >> 2] = $2; //@line 13951
 sp = STACKTOP; //@line 13952
 return;
}
function _mbed_die__async_cb_12($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 13908
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13910
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13912
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 13913
 _wait_ms(150); //@line 13914
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 54; //@line 13917
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 13918
  HEAP32[$4 >> 2] = $2; //@line 13919
  sp = STACKTOP; //@line 13920
  return;
 }
 ___async_unwind = 0; //@line 13923
 HEAP32[$ReallocAsyncCtx10 >> 2] = 54; //@line 13924
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 13925
 HEAP32[$4 >> 2] = $2; //@line 13926
 sp = STACKTOP; //@line 13927
 return;
}
function _mbed_tracef($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1761
 STACKTOP = STACKTOP + 16 | 0; //@line 1762
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1762
 $3 = sp; //@line 1763
 HEAP32[$3 >> 2] = $varargs; //@line 1764
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1765
 _mbed_vtracef($0, $1, $2, $3); //@line 1766
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 34; //@line 1769
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 1771
  sp = STACKTOP; //@line 1772
  STACKTOP = sp; //@line 1773
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1775
  STACKTOP = sp; //@line 1776
  return;
 }
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 13658
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13660
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13662
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 13663
 _wait_ms(150); //@line 13664
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 48; //@line 13667
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 13668
  HEAP32[$4 >> 2] = $2; //@line 13669
  sp = STACKTOP; //@line 13670
  return;
 }
 ___async_unwind = 0; //@line 13673
 HEAP32[$ReallocAsyncCtx16 >> 2] = 48; //@line 13674
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 13675
 HEAP32[$4 >> 2] = $2; //@line 13676
 sp = STACKTOP; //@line 13677
 return;
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 6887
 STACKTOP = STACKTOP + 32 | 0; //@line 6888
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 6888
 $vararg_buffer = sp; //@line 6889
 HEAP32[$0 + 36 >> 2] = 1; //@line 6892
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 6900
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 6902
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 6904
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 6909
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 6912
 STACKTOP = sp; //@line 6913
 return $14 | 0; //@line 6913
}
function _mbed_die__async_cb_11($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 13883
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13885
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13887
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 13888
 _wait_ms(150); //@line 13889
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 55; //@line 13892
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 13893
  HEAP32[$4 >> 2] = $2; //@line 13894
  sp = STACKTOP; //@line 13895
  return;
 }
 ___async_unwind = 0; //@line 13898
 HEAP32[$ReallocAsyncCtx9 >> 2] = 55; //@line 13899
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 13900
 HEAP32[$4 >> 2] = $2; //@line 13901
 sp = STACKTOP; //@line 13902
 return;
}
function _mbed_die__async_cb_10($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 13858
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13860
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13862
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 13863
 _wait_ms(400); //@line 13864
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 13867
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 13868
  HEAP32[$4 >> 2] = $2; //@line 13869
  sp = STACKTOP; //@line 13870
  return;
 }
 ___async_unwind = 0; //@line 13873
 HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 13874
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 13875
 HEAP32[$4 >> 2] = $2; //@line 13876
 sp = STACKTOP; //@line 13877
 return;
}
function _mbed_die__async_cb_9($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 13833
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13835
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13837
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 13838
 _wait_ms(400); //@line 13839
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 57; //@line 13842
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 13843
  HEAP32[$4 >> 2] = $2; //@line 13844
  sp = STACKTOP; //@line 13845
  return;
 }
 ___async_unwind = 0; //@line 13848
 HEAP32[$ReallocAsyncCtx7 >> 2] = 57; //@line 13849
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 13850
 HEAP32[$4 >> 2] = $2; //@line 13851
 sp = STACKTOP; //@line 13852
 return;
}
function _mbed_die__async_cb_8($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 13808
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13810
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13812
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 13813
 _wait_ms(400); //@line 13814
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 58; //@line 13817
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 13818
  HEAP32[$4 >> 2] = $2; //@line 13819
  sp = STACKTOP; //@line 13820
  return;
 }
 ___async_unwind = 0; //@line 13823
 HEAP32[$ReallocAsyncCtx6 >> 2] = 58; //@line 13824
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 13825
 HEAP32[$4 >> 2] = $2; //@line 13826
 sp = STACKTOP; //@line 13827
 return;
}
function _mbed_die__async_cb_7($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 13783
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13785
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13787
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 13788
 _wait_ms(400); //@line 13789
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 59; //@line 13792
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 13793
  HEAP32[$4 >> 2] = $2; //@line 13794
  sp = STACKTOP; //@line 13795
  return;
 }
 ___async_unwind = 0; //@line 13798
 HEAP32[$ReallocAsyncCtx5 >> 2] = 59; //@line 13799
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 13800
 HEAP32[$4 >> 2] = $2; //@line 13801
 sp = STACKTOP; //@line 13802
 return;
}
function _mbed_die__async_cb_6($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 13758
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13760
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13762
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 13763
 _wait_ms(400); //@line 13764
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 60; //@line 13767
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 13768
  HEAP32[$4 >> 2] = $2; //@line 13769
  sp = STACKTOP; //@line 13770
  return;
 }
 ___async_unwind = 0; //@line 13773
 HEAP32[$ReallocAsyncCtx4 >> 2] = 60; //@line 13774
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 13775
 HEAP32[$4 >> 2] = $2; //@line 13776
 sp = STACKTOP; //@line 13777
 return;
}
function _mbed_die__async_cb_5($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13733
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13735
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13737
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 13738
 _wait_ms(400); //@line 13739
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 61; //@line 13742
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 13743
  HEAP32[$4 >> 2] = $2; //@line 13744
  sp = STACKTOP; //@line 13745
  return;
 }
 ___async_unwind = 0; //@line 13748
 HEAP32[$ReallocAsyncCtx3 >> 2] = 61; //@line 13749
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 13750
 HEAP32[$4 >> 2] = $2; //@line 13751
 sp = STACKTOP; //@line 13752
 return;
}
function _mbed_die__async_cb_4($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13708
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13710
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13712
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 13713
 _wait_ms(400); //@line 13714
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 62; //@line 13717
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 13718
  HEAP32[$4 >> 2] = $2; //@line 13719
  sp = STACKTOP; //@line 13720
  return;
 }
 ___async_unwind = 0; //@line 13723
 HEAP32[$ReallocAsyncCtx2 >> 2] = 62; //@line 13724
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 13725
 HEAP32[$4 >> 2] = $2; //@line 13726
 sp = STACKTOP; //@line 13727
 return;
}
function _mbed_die__async_cb_3($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13683
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13685
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13687
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 13688
 _wait_ms(400); //@line 13689
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 63; //@line 13692
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 13693
  HEAP32[$4 >> 2] = $2; //@line 13694
  sp = STACKTOP; //@line 13695
  return;
 }
 ___async_unwind = 0; //@line 13698
 HEAP32[$ReallocAsyncCtx >> 2] = 63; //@line 13699
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 13700
 HEAP32[$4 >> 2] = $2; //@line 13701
 sp = STACKTOP; //@line 13702
 return;
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2787
 STACKTOP = STACKTOP + 16 | 0; //@line 2788
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2788
 $1 = sp; //@line 2789
 HEAP32[$1 >> 2] = $varargs; //@line 2790
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2791
 _mbed_error_vfprintf($0, $1); //@line 2792
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 64; //@line 2795
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 2797
  sp = STACKTOP; //@line 2798
  STACKTOP = sp; //@line 2799
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2801
  STACKTOP = sp; //@line 2802
  return;
 }
}
function __ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6521
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6525
 HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 8 >> 2] = $AsyncRetVal; //@line 6528
 if ($AsyncRetVal | 0) {
  return;
 }
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 6533
 _mbed_assert_internal(1857, 1860, 149); //@line 6534
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 93; //@line 6537
  sp = STACKTOP; //@line 6538
  return;
 }
 ___async_unwind = 0; //@line 6541
 HEAP32[$ReallocAsyncCtx2 >> 2] = 93; //@line 6542
 sp = STACKTOP; //@line 6543
 return;
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 7022
 newDynamicTop = oldDynamicTop + increment | 0; //@line 7023
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 7027
  ___setErrNo(12); //@line 7028
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 7032
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 7036
   ___setErrNo(12); //@line 7037
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 7041
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 7058
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 7060
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 7066
  $11 = ___fwritex($0, $4, $3) | 0; //@line 7067
  if ($phitmp) {
   $13 = $11; //@line 7069
  } else {
   ___unlockfile($3); //@line 7071
   $13 = $11; //@line 7072
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 7076
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 7080
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 7083
 }
 return $15 | 0; //@line 7085
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 9394
 } else {
  $$056 = $2; //@line 9396
  $15 = $1; //@line 9396
  $8 = $0; //@line 9396
  while (1) {
   $14 = $$056 + -1 | 0; //@line 9404
   HEAP8[$14 >> 0] = HEAPU8[2455 + ($8 & 15) >> 0] | 0 | $3; //@line 9405
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 9406
   $15 = tempRet0; //@line 9407
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 9412
    break;
   } else {
    $$056 = $14; //@line 9415
   }
  }
 }
 return $$05$lcssa | 0; //@line 9419
}
function __ZSt9terminatev() {
 var $0 = 0, $16 = 0, $17 = 0, $2 = 0, $5 = 0, sp = 0;
 sp = STACKTOP; //@line 12591
 $0 = ___cxa_get_globals_fast() | 0; //@line 12592
 if ($0 | 0) {
  $2 = HEAP32[$0 >> 2] | 0; //@line 12595
  if ($2 | 0) {
   $5 = $2 + 48 | 0; //@line 12599
   if ((HEAP32[$5 >> 2] & -256 | 0) == 1126902528 ? (HEAP32[$5 + 4 >> 2] | 0) == 1129074247 : 0) {
    $16 = HEAP32[$2 + 12 >> 2] | 0; //@line 12611
    _emscripten_alloc_async_context(4, sp) | 0; //@line 12612
    __ZSt11__terminatePFvvE($16); //@line 12613
   }
  }
 }
 $17 = __ZSt13get_terminatev() | 0; //@line 12618
 _emscripten_alloc_async_context(4, sp) | 0; //@line 12619
 __ZSt11__terminatePFvvE($17); //@line 12620
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 7275
 $3 = HEAP8[$1 >> 0] | 0; //@line 7277
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 7281
 $7 = HEAP32[$0 >> 2] | 0; //@line 7282
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 7287
  HEAP32[$0 + 4 >> 2] = 0; //@line 7289
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 7291
  HEAP32[$0 + 28 >> 2] = $14; //@line 7293
  HEAP32[$0 + 20 >> 2] = $14; //@line 7295
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 7301
  $$0 = 0; //@line 7302
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 7305
  $$0 = -1; //@line 7306
 }
 return $$0 | 0; //@line 7308
}
function __ZN4mbed11InterruptInD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3471
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3473
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 3475
 if (!$4) {
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 3482
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 3483
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 3484
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 13; //@line 3487
  sp = STACKTOP; //@line 3488
  return;
 }
 ___async_unwind = 0; //@line 3491
 HEAP32[$ReallocAsyncCtx2 >> 2] = 13; //@line 3492
 sp = STACKTOP; //@line 3493
 return;
}
function _twobyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$sink$in = 0, $$sink17$sink = 0, $11 = 0, $12 = 0, $8 = 0;
 $8 = (HEAPU8[$1 >> 0] | 0) << 8 | (HEAPU8[$1 + 1 >> 0] | 0); //@line 10862
 $$sink$in = HEAPU8[$0 >> 0] | 0; //@line 10865
 $$sink17$sink = $0; //@line 10865
 while (1) {
  $11 = $$sink17$sink + 1 | 0; //@line 10867
  $12 = HEAP8[$11 >> 0] | 0; //@line 10868
  if (!($12 << 24 >> 24)) {
   break;
  }
  $$sink$in = $$sink$in << 8 & 65280 | $12 & 255; //@line 10876
  if (($$sink$in | 0) == ($8 | 0)) {
   break;
  } else {
   $$sink17$sink = $11; //@line 10881
  }
 }
 return ($12 << 24 >> 24 ? $$sink17$sink : 0) | 0; //@line 10886
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 9431
 } else {
  $$06 = $2; //@line 9433
  $11 = $1; //@line 9433
  $7 = $0; //@line 9433
  while (1) {
   $10 = $$06 + -1 | 0; //@line 9438
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 9439
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 9440
   $11 = tempRet0; //@line 9441
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 9446
    break;
   } else {
    $$06 = $10; //@line 9449
   }
  }
 }
 return $$0$lcssa | 0; //@line 9453
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1276
 $3 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 1279
 $5 = HEAP32[$3 + 4 >> 2] | 0; //@line 1281
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 1282
 _equeue_dealloc($5, $3); //@line 1283
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 1286
  sp = STACKTOP; //@line 1287
  return;
 }
 ___async_unwind = 0; //@line 1290
 HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 1291
 sp = STACKTOP; //@line 1292
 return;
}
function __GLOBAL__sub_I_main_cpp() {
 __ZN6events10EventQueueC2EjPh(4960, 1664, 0); //@line 3123
 HEAP32[1291] = 0; //@line 3124
 HEAP32[1292] = 0; //@line 3124
 HEAP32[1293] = 0; //@line 3124
 HEAP32[1294] = 0; //@line 3124
 HEAP32[1295] = 0; //@line 3124
 HEAP32[1296] = 0; //@line 3124
 _gpio_init_out(5164, 50); //@line 3125
 HEAP32[1297] = 0; //@line 3126
 HEAP32[1298] = 0; //@line 3126
 HEAP32[1299] = 0; //@line 3126
 HEAP32[1300] = 0; //@line 3126
 HEAP32[1301] = 0; //@line 3126
 HEAP32[1302] = 0; //@line 3126
 _gpio_init_out(5188, 52); //@line 3127
 __ZN4mbed11InterruptInC2E7PinName(5212, 1337); //@line 3128
 return;
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13467
 do {
  if (!$0) {
   $3 = 0; //@line 13471
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13473
   $2 = ___dynamic_cast($0, 64, 120, 0) | 0; //@line 13474
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 139; //@line 13477
    sp = STACKTOP; //@line 13478
    return 0; //@line 13479
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 13481
    $3 = ($2 | 0) != 0 & 1; //@line 13484
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 13489
}
function _invoke_ticker__async_cb_45($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2256
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 2262
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 2263
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 2264
 FUNCTION_TABLE_vi[$5 & 255]($6); //@line 2265
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 72; //@line 2268
  sp = STACKTOP; //@line 2269
  return;
 }
 ___async_unwind = 0; //@line 2272
 HEAP32[$ReallocAsyncCtx >> 2] = 72; //@line 2273
 sp = STACKTOP; //@line 2274
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 9075
 } else {
  $$04 = 0; //@line 9077
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 9080
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 9084
   $12 = $7 + 1 | 0; //@line 9085
   HEAP32[$0 >> 2] = $12; //@line 9086
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 9092
    break;
   } else {
    $$04 = $11; //@line 9095
   }
  }
 }
 return $$0$lcssa | 0; //@line 9099
}
function _main__async_cb_21($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 403
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 405
 $4 = HEAP32[$2 + 4 >> 2] | 0; //@line 407
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(4) | 0; //@line 408
 _equeue_dealloc($4, $2); //@line 409
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 85; //@line 412
  sp = STACKTOP; //@line 413
  return;
 }
 ___async_unwind = 0; //@line 416
 HEAP32[$ReallocAsyncCtx5 >> 2] = 85; //@line 417
 sp = STACKTOP; //@line 418
 return;
}
function ___fflush_unlocked__async_cb_44($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2230
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2232
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2234
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2236
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 2238
 HEAP32[$4 >> 2] = 0; //@line 2239
 HEAP32[$6 >> 2] = 0; //@line 2240
 HEAP32[$8 >> 2] = 0; //@line 2241
 HEAP32[$10 >> 2] = 0; //@line 2242
 HEAP32[___async_retval >> 2] = 0; //@line 2244
 return;
}
function _main__async_cb_23($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 432
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 434
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 435
 $3 = _equeue_alloc(4960, 32) | 0; //@line 436
 if (!___async) {
  HEAP32[___async_retval >> 2] = $3; //@line 440
  ___async_unwind = 0; //@line 441
 }
 HEAP32[$ReallocAsyncCtx7 >> 2] = 80; //@line 443
 HEAP32[$ReallocAsyncCtx7 + 4 >> 2] = $2; //@line 445
 sp = STACKTOP; //@line 446
 return;
}
function __Z9blink_ledv() {
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3133
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3134
 _puts(1752) | 0; //@line 3135
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 74; //@line 3138
  sp = STACKTOP; //@line 3139
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3142
  $2 = (_emscripten_asm_const_ii(8, HEAP32[1291] | 0) | 0) == 0 & 1; //@line 3146
  _emscripten_asm_const_iii(2, HEAP32[1291] | 0, $2 | 0) | 0; //@line 3148
  return;
 }
}
function __Z8btn_fallv() {
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3154
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3155
 _puts(1840) | 0; //@line 3156
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 75; //@line 3159
  sp = STACKTOP; //@line 3160
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3163
  $2 = (_emscripten_asm_const_ii(8, HEAP32[1297] | 0) | 0) == 0 & 1; //@line 3167
  _emscripten_asm_const_iii(2, HEAP32[1297] | 0, $2 | 0) | 0; //@line 3169
  return;
 }
}
function _mbed_vtracef__async_cb_46($0) {
 $0 = $0 | 0;
 var $1 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2771
 $1 = HEAP32[54] | 0; //@line 2772
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 2773
 FUNCTION_TABLE_vi[$1 & 255](1310); //@line 2774
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 38; //@line 2777
  sp = STACKTOP; //@line 2778
  return;
 }
 ___async_unwind = 0; //@line 2781
 HEAP32[$ReallocAsyncCtx3 >> 2] = 38; //@line 2782
 sp = STACKTOP; //@line 2783
 return;
}
function __ZN4mbed11InterruptInC2E7PinName($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $3 = 0, $4 = 0, dest = 0, stop = 0;
 HEAP32[$0 >> 2] = 160; //@line 251
 $2 = $0 + 4 | 0; //@line 252
 $3 = $0 + 28 | 0; //@line 253
 $4 = $0; //@line 254
 dest = $2; //@line 255
 stop = dest + 68 | 0; //@line 255
 do {
  HEAP32[dest >> 2] = 0; //@line 255
  dest = dest + 4 | 0; //@line 255
 } while ((dest | 0) < (stop | 0));
 _gpio_irq_init($3, $1, 2, $4) | 0; //@line 256
 _gpio_init_in($2, $1); //@line 257
 return;
}
function _serial_putc__async_cb_20($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 334
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 336
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 337
 _fflush($2) | 0; //@line 338
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 70; //@line 341
  sp = STACKTOP; //@line 342
  return;
 }
 ___async_unwind = 0; //@line 345
 HEAP32[$ReallocAsyncCtx >> 2] = 70; //@line 346
 sp = STACKTOP; //@line 347
 return;
}
function __ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3535
 $1 = HEAP32[$0 >> 2] | 0; //@line 3536
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3537
 FUNCTION_TABLE_v[$1 & 7](); //@line 3538
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 96; //@line 3541
  sp = STACKTOP; //@line 3542
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3545
  return;
 }
}
function _emscripten_async_resume() {
 ___async = 0; //@line 6865
 ___async_unwind = 1; //@line 6866
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 6872
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 6876
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 6880
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 6882
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 6698
 STACKTOP = STACKTOP + 16 | 0; //@line 6699
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 6699
 $vararg_buffer = sp; //@line 6700
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 6704
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 6706
 STACKTOP = sp; //@line 6707
 return $5 | 0; //@line 6707
}
function __ZN6events10EventQueue13function_callIPFvvEEEvPv($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3359
 $1 = HEAP32[$0 >> 2] | 0; //@line 3360
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3361
 FUNCTION_TABLE_v[$1 & 7](); //@line 3362
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 87; //@line 3365
  sp = STACKTOP; //@line 3366
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3369
  return;
 }
}
function _main__async_cb_24($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 452
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 453
 __ZN6events10EventQueue8dispatchEi(4960, -1); //@line 454
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 457
  sp = STACKTOP; //@line 458
  return;
 }
 ___async_unwind = 0; //@line 461
 HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 462
 sp = STACKTOP; //@line 463
 return;
}
function _handle_interrupt_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2940
 $2 = HEAP32[1236] | 0; //@line 2941
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2942
 FUNCTION_TABLE_vii[$2 & 3]($0, $1); //@line 2943
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 68; //@line 2946
  sp = STACKTOP; //@line 2947
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2950
  return;
 }
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 6807
 STACKTOP = STACKTOP + 16 | 0; //@line 6808
 $rem = __stackBase__ | 0; //@line 6809
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 6810
 STACKTOP = __stackBase__; //@line 6811
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 6812
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 6577
 if ((ret | 0) < 8) return ret | 0; //@line 6578
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 6579
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 6580
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 6581
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 6582
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 6583
}
function ___cxa_get_globals_fast() {
 var $3 = 0, sp = 0;
 sp = STACKTOP; //@line 11812
 STACKTOP = STACKTOP + 16 | 0; //@line 11813
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11813
 if (!(_pthread_once(5860, 4) | 0)) {
  $3 = _pthread_getspecific(HEAP32[1466] | 0) | 0; //@line 11819
  STACKTOP = sp; //@line 11820
  return $3 | 0; //@line 11820
 } else {
  _abort_message(4640, sp); //@line 11822
 }
 return 0; //@line 11825
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 11980
 }
 return;
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 11517
 $6 = HEAP32[$5 >> 2] | 0; //@line 11518
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 11519
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 11521
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 11523
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 11526
 return $2 | 0; //@line 11527
}
function __ZL25default_terminate_handlerv__async_cb_63($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6251
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6253
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6255
 HEAP32[$2 >> 2] = 4501; //@line 6256
 HEAP32[$2 + 4 >> 2] = $4; //@line 6258
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 6260
 _abort_message(4365, $2); //@line 6261
}
function __ZN6events10EventQueueC2EjPh($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0;
 $3 = $0 + 188 | 0; //@line 498
 HEAP32[$3 >> 2] = 0; //@line 499
 HEAP32[$3 + 4 >> 2] = 0; //@line 499
 HEAP32[$3 + 8 >> 2] = 0; //@line 499
 HEAP32[$3 + 12 >> 2] = 0; //@line 499
 if (!$2) {
  _equeue_create($0, $1) | 0; //@line 502
  return;
 } else {
  _equeue_create_inplace($0, $1, $2) | 0; //@line 505
  return;
 }
}
function __ZN6events10EventQueue8dispatchEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 513
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 514
 _equeue_dispatch($0, $1); //@line 515
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 23; //@line 518
  sp = STACKTOP; //@line 519
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 522
  return;
 }
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6498
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6500
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 6501
 _fputc(10, $2) | 0; //@line 6502
 if (!___async) {
  ___async_unwind = 0; //@line 6505
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 115; //@line 6507
 sp = STACKTOP; //@line 6508
 return;
}
function _gpio_irq_init($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0;
 if (($1 | 0) == -1) {
  $$0 = -1; //@line 2963
  return $$0 | 0; //@line 2964
 }
 HEAP32[1236] = $2; //@line 2966
 HEAP32[$0 >> 2] = $1; //@line 2967
 HEAP32[$0 + 4 >> 2] = $1; //@line 2969
 _emscripten_asm_const_iii(5, $3 | 0, $1 | 0) | 0; //@line 2970
 $$0 = 0; //@line 2971
 return $$0 | 0; //@line 2972
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 12574
 STACKTOP = STACKTOP + 16 | 0; //@line 12575
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12575
 _free($0); //@line 12577
 if (!(_pthread_setspecific(HEAP32[1466] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 12582
  return;
 } else {
  _abort_message(4739, sp); //@line 12584
 }
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1766
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 1769
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 1774
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 1777
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 236
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 247
  $$0 = 1; //@line 248
 } else {
  $$0 = 0; //@line 250
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 254
 return;
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 3003
 HEAP32[$0 >> 2] = $1; //@line 3004
 HEAP32[1237] = 1; //@line 3005
 $4 = $0; //@line 3006
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 3011
 $10 = 4952; //@line 3012
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 3014
 HEAP32[$10 + 4 >> 2] = $9; //@line 3017
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 12056
 }
 return;
}
function _mbed_trace_default_print($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1742
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1743
 _puts($0) | 0; //@line 1744
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 33; //@line 1747
  sp = STACKTOP; //@line 1748
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1751
  return;
 }
}
function _equeue_sema_create($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $4 = 0;
 $1 = _pthread_mutex_init($0 | 0, 0) | 0; //@line 1664
 if (!$1) {
  $4 = _pthread_cond_init($0 + 28 | 0, 0) | 0; //@line 1668
  if (!$4) {
   HEAP8[$0 + 76 >> 0] = 0; //@line 1672
   $$0 = 0; //@line 1673
  } else {
   $$0 = $4; //@line 1675
  }
 } else {
  $$0 = $1; //@line 1678
 }
 return $$0 | 0; //@line 1680
}
function _equeue_tick() {
 var $0 = 0, sp = 0;
 sp = STACKTOP; //@line 1627
 STACKTOP = STACKTOP + 16 | 0; //@line 1628
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1628
 $0 = sp; //@line 1629
 _gettimeofday($0 | 0, 0) | 0; //@line 1630
 STACKTOP = sp; //@line 1637
 return ((HEAP32[$0 + 4 >> 2] | 0) / 1e3 | 0) + ((HEAP32[$0 >> 2] | 0) * 1e3 | 0) | 0; //@line 1637
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3107
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3108
 _emscripten_sleep($0 | 0); //@line 3109
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 73; //@line 3112
  sp = STACKTOP; //@line 3113
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3116
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
  $7 = $1 + 28 | 0; //@line 12120
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 12124
  }
 }
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var sp = 0;
 sp = STACKTOP; //@line 12559
 STACKTOP = STACKTOP + 16 | 0; //@line 12560
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12560
 if (!(_pthread_key_create(5864, 124) | 0)) {
  STACKTOP = sp; //@line 12565
  return;
 } else {
  _abort_message(4689, sp); //@line 12567
 }
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 6841
 HEAP32[new_frame + 4 >> 2] = sp; //@line 6843
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 6845
 ___async_cur_frame = new_frame; //@line 6846
 return ___async_cur_frame + 8 | 0; //@line 6847
}
function __ZN4mbed8CallbackIFvvEE13function_moveIN6events5EventIS1_EEEEvPvPKv($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 HEAP32[$0 >> 2] = 0; //@line 3471
 $2 = HEAP32[$1 >> 2] | 0; //@line 3472
 if (!$2) {
  return;
 }
 HEAP32[$0 >> 2] = $2; //@line 3477
 HEAP32[$2 >> 2] = (HEAP32[$2 >> 2] | 0) + 1; //@line 3480
 return;
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 6479
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 6483
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 6486
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 6830
  return low << bits; //@line 6831
 }
 tempRet0 = low << bits - 32; //@line 6833
 return 0; //@line 6834
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 6819
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 6820
 }
 tempRet0 = 0; //@line 6822
 return high >>> bits - 32 | 0; //@line 6823
}
function _equeue_dispatch__async_cb_59($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4780
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4782
 HEAP8[HEAP32[$0 + 4 >> 2] >> 0] = 1; //@line 4783
 _equeue_mutex_unlock($4); //@line 4784
 HEAP8[$6 >> 0] = 0; //@line 4785
 return;
}
function _fflush__async_cb_38($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1933
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 1935
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 1938
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_64($0) {
 $0 = $0 | 0;
 var $6 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6323
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 6325
 _gpio_irq_set($6 + 28 | 0, 2, 1); //@line 6327
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
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2094
 _equeue_sema_signal((HEAP32[$0 + 4 >> 2] | 0) + 48 | 0); //@line 2096
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 2098
 return;
}
function _puts__async_cb($0) {
 $0 = $0 | 0;
 var $$lobit = 0;
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 316
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 319
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 322
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 6453
 } else {
  $$0 = -1; //@line 6455
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 6458
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 7405
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 7411
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 7415
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 7104
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 6853
 stackRestore(___async_cur_frame | 0); //@line 6854
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 6855
}
function _fputc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1257
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 1258
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 1260
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 10516
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 10516
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 10518
 return $1 | 0; //@line 10519
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 685
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 686
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 688
 return;
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 2926
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 2932
 _emscripten_asm_const_iii(4, $0 | 0, $1 | 0) | 0; //@line 2933
 return;
}
function _gpio_init_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 2911
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 2917
 _emscripten_asm_const_iii(3, $0 | 0, $1 | 0) | 0; //@line 2918
 return;
}
function _equeue_sema_signal($0) {
 $0 = $0 | 0;
 _pthread_mutex_lock($0 | 0) | 0; //@line 1686
 HEAP8[$0 + 76 >> 0] = 1; //@line 1688
 _pthread_cond_signal($0 + 28 | 0) | 0; //@line 1690
 _pthread_mutex_unlock($0 | 0) | 0; //@line 1691
 return;
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 6864
  $$0 = -1; //@line 6865
 } else {
  $$0 = $0; //@line 6867
 }
 return $$0 | 0; //@line 6869
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 6570
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 6571
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 6572
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 6562
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 6564
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 7097
}
function _equeue_enqueue__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3509
 _equeue_mutex_unlock(HEAP32[$0 + 4 >> 2] | 0); //@line 3510
 HEAP32[___async_retval >> 2] = $4; //@line 3512
 return;
}
function __Z9blink_ledv__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(8, HEAP32[1291] | 0) | 0) == 0 & 1; //@line 6188
 _emscripten_asm_const_iii(2, HEAP32[1291] | 0, $3 | 0) | 0; //@line 6190
 return;
}
function __Z8btn_fallv__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(8, HEAP32[1297] | 0) | 0) == 0 & 1; //@line 708
 _emscripten_asm_const_iii(2, HEAP32[1297] | 0, $3 | 0) | 0; //@line 710
 return;
}
function _handle_lora_downlink($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 __ZN16SX1276_LoRaRadio8rx_frameEPhjjhh($0, $1, $2, $3, $4, $5); //@line 65
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
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 7090
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 7550
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 7555
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 9576
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 9579
 }
 return $$0 | 0; //@line 9581
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 7062
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 6799
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 13583
 return;
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 7045
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 7049
}
function __ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 6129
 return;
}
function _gpio_irq_set($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 _emscripten_asm_const_iiii(7, HEAP32[$0 + 4 >> 2] | 0, $1 | 0, $2 | 0) | 0; //@line 2993
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 6860
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 6861
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_67($0) {
 $0 = $0 | 0;
 _gpio_irq_set((HEAP32[$0 + 8 >> 2] | 0) + 28 | 0, 2, 0); //@line 6438
 return;
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 12659
 __ZdlPv($0); //@line 12660
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 12342
 __ZdlPv($0); //@line 12343
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 7541
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 7543
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 11870
 __ZdlPv($0); //@line 11871
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
  ___fwritex($1, $2, $0) | 0; //@line 9061
 }
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 722
 return;
}
function b140(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 7501
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 12067
}
function __ZSt13get_terminatev() {
 var $0 = 0;
 $0 = HEAP32[218] | 0; //@line 12649
 HEAP32[218] = $0 + 0; //@line 12651
 return $0 | 0; //@line 12653
}
function _gpio_irq_free($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iii(6, HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 2982
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
 FUNCTION_TABLE_vii[index & 3](a1 | 0, a2 | 0); //@line 7083
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
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 6887
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_41($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b138(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 7498
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 9524
}
function _fflush__async_cb_39($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1948
 return;
}
function _snprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1511
 return;
}
function _fputc__async_cb_33($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1270
 return;
}
function _putc__async_cb_28($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 698
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 3](a1 | 0) | 0; //@line 7055
}
function __ZN4mbed11InterruptInD0Ev__async_cb_43($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 2152
 return;
}
function b8(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 7123
 return 0; //@line 7123
}
function b7(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 7120
 return 0; //@line 7120
}
function b6(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 7117
 return 0; //@line 7117
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(4792, HEAP32[$0 + 4 >> 2] | 0); //@line 3465
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 255](a1 | 0); //@line 7076
}
function b136(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 7495
}
function _equeue_event_period($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + -12 >> 2] = $1; //@line 1613
 return;
}
function _equeue_event_delay($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + -16 >> 2] = $1; //@line 1604
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb_69($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb_34($0) {
 $0 = $0 | 0;
 return;
}
function _equeue_event_dtor($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + -8 >> 2] = $1; //@line 1622
 return;
}
function __ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 10769
}
function _equeue_mutex_unlock($0) {
 $0 = $0 | 0;
 _pthread_mutex_unlock($0 | 0) | 0; //@line 1657
 return;
}
function _equeue_mutex_create($0) {
 $0 = $0 | 0;
 return _pthread_mutex_init($0 | 0, 0) | 0; //@line 1644
}
function __ZN6events10EventQueue13function_dtorINS0_9context00IPFvvEEEEEvPv($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_1($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_i(index) {
 index = index | 0;
 return FUNCTION_TABLE_i[index & 0]() | 0; //@line 7048
}
function _main__async_cb_22($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 426
 return;
}
function _equeue_mutex_lock($0) {
 $0 = $0 | 0;
 _pthread_mutex_lock($0 | 0) | 0; //@line 1650
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
 FUNCTION_TABLE_v[index & 7](); //@line 7069
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 6922
}
function __ZN6events10EventQueue13function_dtorIPFvvEEEvPv($0) {
 $0 = $0 | 0;
 return;
}
function b4(p0) {
 p0 = p0 | 0;
 nullFunc_ii(3); //@line 7114
 return 0; //@line 7114
}
function b3(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 7111
 return 0; //@line 7111
}
function b134(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(3); //@line 7492
}
function b133(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(0); //@line 7489
}
function __ZN6events10EventQueue8dispatchEi__async_cb($0) {
 $0 = $0 | 0;
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
function _abort_message__async_cb_68($0) {
 $0 = $0 | 0;
 _abort(); //@line 6515
}
function ___ofl_lock() {
 ___lock(5848); //@line 7560
 return 5856; //@line 7561
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
function __ZN4mbed11InterruptInD2Ev__async_cb_57($0) {
 $0 = $0 | 0;
 return;
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 10690
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 10696
}
function _mbed_trace_default_print__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 16
}
function _pthread_mutex_unlock(x) {
 x = x | 0;
 return 0; //@line 7014
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 11696
 return;
}
function _pthread_mutex_lock(x) {
 x = x | 0;
 return 0; //@line 7010
}
function _mbed_assert_internal__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b1() {
 nullFunc_i(0); //@line 7108
 return 0; //@line 7108
}
function _handle_interrupt_in__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _mbed_error_printf__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___ofl_unlock() {
 ___unlock(5848); //@line 7566
 return;
}
function b131(p0) {
 p0 = p0 | 0;
 nullFunc_vi(255); //@line 7486
}
function b130(p0) {
 p0 = p0 | 0;
 nullFunc_vi(254); //@line 7483
}
function b129(p0) {
 p0 = p0 | 0;
 nullFunc_vi(253); //@line 7480
}
function b128(p0) {
 p0 = p0 | 0;
 nullFunc_vi(252); //@line 7477
}
function b127(p0) {
 p0 = p0 | 0;
 nullFunc_vi(251); //@line 7474
}
function b126(p0) {
 p0 = p0 | 0;
 nullFunc_vi(250); //@line 7471
}
function b125(p0) {
 p0 = p0 | 0;
 nullFunc_vi(249); //@line 7468
}
function b124(p0) {
 p0 = p0 | 0;
 nullFunc_vi(248); //@line 7465
}
function b123(p0) {
 p0 = p0 | 0;
 nullFunc_vi(247); //@line 7462
}
function b122(p0) {
 p0 = p0 | 0;
 nullFunc_vi(246); //@line 7459
}
function b121(p0) {
 p0 = p0 | 0;
 nullFunc_vi(245); //@line 7456
}
function b120(p0) {
 p0 = p0 | 0;
 nullFunc_vi(244); //@line 7453
}
function b119(p0) {
 p0 = p0 | 0;
 nullFunc_vi(243); //@line 7450
}
function b118(p0) {
 p0 = p0 | 0;
 nullFunc_vi(242); //@line 7447
}
function b117(p0) {
 p0 = p0 | 0;
 nullFunc_vi(241); //@line 7444
}
function b116(p0) {
 p0 = p0 | 0;
 nullFunc_vi(240); //@line 7441
}
function b115(p0) {
 p0 = p0 | 0;
 nullFunc_vi(239); //@line 7438
}
function b114(p0) {
 p0 = p0 | 0;
 nullFunc_vi(238); //@line 7435
}
function b113(p0) {
 p0 = p0 | 0;
 nullFunc_vi(237); //@line 7432
}
function b112(p0) {
 p0 = p0 | 0;
 nullFunc_vi(236); //@line 7429
}
function b111(p0) {
 p0 = p0 | 0;
 nullFunc_vi(235); //@line 7426
}
function b110(p0) {
 p0 = p0 | 0;
 nullFunc_vi(234); //@line 7423
}
function b109(p0) {
 p0 = p0 | 0;
 nullFunc_vi(233); //@line 7420
}
function b108(p0) {
 p0 = p0 | 0;
 nullFunc_vi(232); //@line 7417
}
function b107(p0) {
 p0 = p0 | 0;
 nullFunc_vi(231); //@line 7414
}
function b106(p0) {
 p0 = p0 | 0;
 nullFunc_vi(230); //@line 7411
}
function b105(p0) {
 p0 = p0 | 0;
 nullFunc_vi(229); //@line 7408
}
function b104(p0) {
 p0 = p0 | 0;
 nullFunc_vi(228); //@line 7405
}
function b103(p0) {
 p0 = p0 | 0;
 nullFunc_vi(227); //@line 7402
}
function b102(p0) {
 p0 = p0 | 0;
 nullFunc_vi(226); //@line 7399
}
function b101(p0) {
 p0 = p0 | 0;
 nullFunc_vi(225); //@line 7396
}
function b100(p0) {
 p0 = p0 | 0;
 nullFunc_vi(224); //@line 7393
}
function b99(p0) {
 p0 = p0 | 0;
 nullFunc_vi(223); //@line 7390
}
function b98(p0) {
 p0 = p0 | 0;
 nullFunc_vi(222); //@line 7387
}
function b97(p0) {
 p0 = p0 | 0;
 nullFunc_vi(221); //@line 7384
}
function b96(p0) {
 p0 = p0 | 0;
 nullFunc_vi(220); //@line 7381
}
function b95(p0) {
 p0 = p0 | 0;
 nullFunc_vi(219); //@line 7378
}
function b94(p0) {
 p0 = p0 | 0;
 nullFunc_vi(218); //@line 7375
}
function b93(p0) {
 p0 = p0 | 0;
 nullFunc_vi(217); //@line 7372
}
function b92(p0) {
 p0 = p0 | 0;
 nullFunc_vi(216); //@line 7369
}
function b91(p0) {
 p0 = p0 | 0;
 nullFunc_vi(215); //@line 7366
}
function b90(p0) {
 p0 = p0 | 0;
 nullFunc_vi(214); //@line 7363
}
function b89(p0) {
 p0 = p0 | 0;
 nullFunc_vi(213); //@line 7360
}
function b88(p0) {
 p0 = p0 | 0;
 nullFunc_vi(212); //@line 7357
}
function b87(p0) {
 p0 = p0 | 0;
 nullFunc_vi(211); //@line 7354
}
function b86(p0) {
 p0 = p0 | 0;
 nullFunc_vi(210); //@line 7351
}
function b85(p0) {
 p0 = p0 | 0;
 nullFunc_vi(209); //@line 7348
}
function b84(p0) {
 p0 = p0 | 0;
 nullFunc_vi(208); //@line 7345
}
function b83(p0) {
 p0 = p0 | 0;
 nullFunc_vi(207); //@line 7342
}
function b82(p0) {
 p0 = p0 | 0;
 nullFunc_vi(206); //@line 7339
}
function b81(p0) {
 p0 = p0 | 0;
 nullFunc_vi(205); //@line 7336
}
function b80(p0) {
 p0 = p0 | 0;
 nullFunc_vi(204); //@line 7333
}
function b79(p0) {
 p0 = p0 | 0;
 nullFunc_vi(203); //@line 7330
}
function b78(p0) {
 p0 = p0 | 0;
 nullFunc_vi(202); //@line 7327
}
function b77(p0) {
 p0 = p0 | 0;
 nullFunc_vi(201); //@line 7324
}
function b76(p0) {
 p0 = p0 | 0;
 nullFunc_vi(200); //@line 7321
}
function b75(p0) {
 p0 = p0 | 0;
 nullFunc_vi(199); //@line 7318
}
function b74(p0) {
 p0 = p0 | 0;
 nullFunc_vi(198); //@line 7315
}
function b73(p0) {
 p0 = p0 | 0;
 nullFunc_vi(197); //@line 7312
}
function b72(p0) {
 p0 = p0 | 0;
 nullFunc_vi(196); //@line 7309
}
function b71(p0) {
 p0 = p0 | 0;
 nullFunc_vi(195); //@line 7306
}
function b70(p0) {
 p0 = p0 | 0;
 nullFunc_vi(194); //@line 7303
}
function b69(p0) {
 p0 = p0 | 0;
 nullFunc_vi(193); //@line 7300
}
function b68(p0) {
 p0 = p0 | 0;
 nullFunc_vi(192); //@line 7297
}
function b67(p0) {
 p0 = p0 | 0;
 nullFunc_vi(191); //@line 7294
}
function b66(p0) {
 p0 = p0 | 0;
 nullFunc_vi(190); //@line 7291
}
function b65(p0) {
 p0 = p0 | 0;
 nullFunc_vi(189); //@line 7288
}
function b64(p0) {
 p0 = p0 | 0;
 nullFunc_vi(188); //@line 7285
}
function b63(p0) {
 p0 = p0 | 0;
 nullFunc_vi(187); //@line 7282
}
function b62(p0) {
 p0 = p0 | 0;
 nullFunc_vi(186); //@line 7279
}
function b61(p0) {
 p0 = p0 | 0;
 nullFunc_vi(185); //@line 7276
}
function b60(p0) {
 p0 = p0 | 0;
 nullFunc_vi(184); //@line 7273
}
function b59(p0) {
 p0 = p0 | 0;
 nullFunc_vi(183); //@line 7270
}
function b58(p0) {
 p0 = p0 | 0;
 nullFunc_vi(182); //@line 7267
}
function b57(p0) {
 p0 = p0 | 0;
 nullFunc_vi(181); //@line 7264
}
function b56(p0) {
 p0 = p0 | 0;
 nullFunc_vi(180); //@line 7261
}
function b55(p0) {
 p0 = p0 | 0;
 nullFunc_vi(179); //@line 7258
}
function b54(p0) {
 p0 = p0 | 0;
 nullFunc_vi(178); //@line 7255
}
function b53(p0) {
 p0 = p0 | 0;
 nullFunc_vi(177); //@line 7252
}
function b52(p0) {
 p0 = p0 | 0;
 nullFunc_vi(176); //@line 7249
}
function b51(p0) {
 p0 = p0 | 0;
 nullFunc_vi(175); //@line 7246
}
function b50(p0) {
 p0 = p0 | 0;
 nullFunc_vi(174); //@line 7243
}
function b49(p0) {
 p0 = p0 | 0;
 nullFunc_vi(173); //@line 7240
}
function b48(p0) {
 p0 = p0 | 0;
 nullFunc_vi(172); //@line 7237
}
function b47(p0) {
 p0 = p0 | 0;
 nullFunc_vi(171); //@line 7234
}
function b46(p0) {
 p0 = p0 | 0;
 nullFunc_vi(170); //@line 7231
}
function b45(p0) {
 p0 = p0 | 0;
 nullFunc_vi(169); //@line 7228
}
function b44(p0) {
 p0 = p0 | 0;
 nullFunc_vi(168); //@line 7225
}
function b43(p0) {
 p0 = p0 | 0;
 nullFunc_vi(167); //@line 7222
}
function b42(p0) {
 p0 = p0 | 0;
 nullFunc_vi(166); //@line 7219
}
function b41(p0) {
 p0 = p0 | 0;
 nullFunc_vi(165); //@line 7216
}
function b40(p0) {
 p0 = p0 | 0;
 nullFunc_vi(164); //@line 7213
}
function b39(p0) {
 p0 = p0 | 0;
 nullFunc_vi(163); //@line 7210
}
function b38(p0) {
 p0 = p0 | 0;
 nullFunc_vi(162); //@line 7207
}
function b37(p0) {
 p0 = p0 | 0;
 nullFunc_vi(161); //@line 7204
}
function b36(p0) {
 p0 = p0 | 0;
 nullFunc_vi(160); //@line 7201
}
function b35(p0) {
 p0 = p0 | 0;
 nullFunc_vi(159); //@line 7198
}
function b34(p0) {
 p0 = p0 | 0;
 nullFunc_vi(158); //@line 7195
}
function b33(p0) {
 p0 = p0 | 0;
 nullFunc_vi(157); //@line 7192
}
function b32(p0) {
 p0 = p0 | 0;
 nullFunc_vi(156); //@line 7189
}
function b31(p0) {
 p0 = p0 | 0;
 nullFunc_vi(155); //@line 7186
}
function b30(p0) {
 p0 = p0 | 0;
 nullFunc_vi(154); //@line 7183
}
function b29(p0) {
 p0 = p0 | 0;
 nullFunc_vi(153); //@line 7180
}
function b28(p0) {
 p0 = p0 | 0;
 nullFunc_vi(152); //@line 7177
}
function b27(p0) {
 p0 = p0 | 0;
 nullFunc_vi(151); //@line 7174
}
function b26(p0) {
 p0 = p0 | 0;
 nullFunc_vi(150); //@line 7171
}
function b25(p0) {
 p0 = p0 | 0;
 nullFunc_vi(149); //@line 7168
}
function b24(p0) {
 p0 = p0 | 0;
 nullFunc_vi(148); //@line 7165
}
function b23(p0) {
 p0 = p0 | 0;
 nullFunc_vi(147); //@line 7162
}
function b22(p0) {
 p0 = p0 | 0;
 nullFunc_vi(146); //@line 7159
}
function b21(p0) {
 p0 = p0 | 0;
 nullFunc_vi(145); //@line 7156
}
function b20(p0) {
 p0 = p0 | 0;
 nullFunc_vi(144); //@line 7153
}
function b19(p0) {
 p0 = p0 | 0;
 nullFunc_vi(143); //@line 7150
}
function b18(p0) {
 p0 = p0 | 0;
 nullFunc_vi(142); //@line 7147
}
function b17(p0) {
 p0 = p0 | 0;
 nullFunc_vi(141); //@line 7144
}
function b16(p0) {
 p0 = p0 | 0;
 nullFunc_vi(140); //@line 7141
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 6880
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 7197
}
function b15(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 7138
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
function _mbed_tracef__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZSt9terminatev__async_cb_42($0) {
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
 return 5844; //@line 6874
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
 return 504; //@line 6927
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 26
}
function b13() {
 nullFunc_v(7); //@line 7135
}
function b12() {
 nullFunc_v(6); //@line 7132
}
function b11() {
 nullFunc_v(5); //@line 7129
}
function b10() {
 nullFunc_v(0); //@line 7126
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_i = [b1];
var FUNCTION_TABLE_ii = [b3,___stdio_close,__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE,b4];
var FUNCTION_TABLE_iiii = [b6,___stdio_write,___stdio_seek,___stdout_write,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b7,b8];
var FUNCTION_TABLE_v = [b10,__ZL25default_terminate_handlerv,__Z9blink_ledv,__Z8btn_fallv,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev,b11,b12,b13];
var FUNCTION_TABLE_vi = [b15,__ZN4mbed11InterruptInD2Ev,__ZN4mbed11InterruptInD0Ev,_mbed_trace_default_print,__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv,__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed11InterruptInD2Ev__async_cb,__ZN4mbed11InterruptInD2Ev__async_cb_57,__ZN4mbed11InterruptInD0Ev__async_cb,__ZN4mbed11InterruptInD0Ev__async_cb_43,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_1,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_64,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_65,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_66,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_67,__ZN6events10EventQueue8dispatchEi__async_cb,_equeue_alloc__async_cb,_equeue_dealloc__async_cb,_equeue_post__async_cb,_equeue_enqueue__async_cb,_equeue_dispatch__async_cb
,_equeue_dispatch__async_cb_60,_equeue_dispatch__async_cb_58,_equeue_dispatch__async_cb_59,_equeue_dispatch__async_cb_61,_mbed_trace_default_print__async_cb,_mbed_tracef__async_cb,_mbed_vtracef__async_cb,_mbed_vtracef__async_cb_56,_mbed_vtracef__async_cb_46,_mbed_vtracef__async_cb_47,_mbed_vtracef__async_cb_48,_mbed_vtracef__async_cb_55,_mbed_vtracef__async_cb_49,_mbed_vtracef__async_cb_54,_mbed_vtracef__async_cb_50,_mbed_vtracef__async_cb_51,_mbed_vtracef__async_cb_52,_mbed_vtracef__async_cb_53,_mbed_assert_internal__async_cb,_mbed_die__async_cb_17,_mbed_die__async_cb_16,_mbed_die__async_cb_15,_mbed_die__async_cb_14,_mbed_die__async_cb_13,_mbed_die__async_cb_12,_mbed_die__async_cb_11,_mbed_die__async_cb_10,_mbed_die__async_cb_9,_mbed_die__async_cb_8,_mbed_die__async_cb_7
,_mbed_die__async_cb_6,_mbed_die__async_cb_5,_mbed_die__async_cb_4,_mbed_die__async_cb_3,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_vfprintf__async_cb,_mbed_error_vfprintf__async_cb_37,_mbed_error_vfprintf__async_cb_36,_handle_interrupt_in__async_cb,_serial_putc__async_cb_20,_serial_putc__async_cb,_invoke_ticker__async_cb_45,_invoke_ticker__async_cb,_wait_ms__async_cb,__Z9blink_ledv__async_cb,__Z8btn_fallv__async_cb,_main__async_cb_27,__ZN6events10EventQueue13function_dtorIPFvvEEEvPv,__ZN6events10EventQueue13function_callIPFvvEEEvPv,_main__async_cb_23,_main__async_cb_26,__ZN6events5EventIFvvEE10event_dtorIPS1_EEvPNS2_5eventE,_main__async_cb_25,_main__async_cb,_main__async_cb_21,_main__async_cb_24,_main__async_cb_22,__ZN6events10EventQueue13function_callIPFvvEEEvPv__async_cb,__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb_62
,__ZN6events10EventQueue13function_dtorINS0_9context00IPFvvEEEEEvPv,__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv,__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb,__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb,__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb_69,__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb,__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb_34,__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv__async_cb,_putc__async_cb_28,_putc__async_cb,___overflow__async_cb,_fflush__async_cb_39,_fflush__async_cb_38,_fflush__async_cb_40,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_44,_vfprintf__async_cb,_snprintf__async_cb,_vsnprintf__async_cb,_fputc__async_cb_33,_fputc__async_cb,_puts__async_cb,__ZL25default_terminate_handlerv__async_cb,__ZL25default_terminate_handlerv__async_cb_63,_abort_message__async_cb,_abort_message__async_cb_68,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_19,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb
,___dynamic_cast__async_cb_2,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_41,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_18,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_32,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_31,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_30,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_29,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_35,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b16,b17,b18,b19,b20,b21,b22,b23,b24
,b25,b26,b27,b28,b29,b30,b31,b32,b33,b34,b35,b36,b37,b38,b39,b40,b41,b42,b43,b44,b45,b46,b47,b48,b49,b50,b51,b52,b53,b54
,b55,b56,b57,b58,b59,b60,b61,b62,b63,b64,b65,b66,b67,b68,b69,b70,b71,b72,b73,b74,b75,b76,b77,b78,b79,b80,b81,b82,b83,b84
,b85,b86,b87,b88,b89,b90,b91,b92,b93,b94,b95,b96,b97,b98,b99,b100,b101,b102,b103,b104,b105,b106,b107,b108,b109,b110,b111,b112,b113,b114
,b115,b116,b117,b118,b119,b120,b121,b122,b123,b124,b125,b126,b127,b128,b129,b130,b131];
var FUNCTION_TABLE_vii = [b133,__ZN4mbed8CallbackIFvvEE13function_moveIN6events5EventIS1_EEEEvPvPKv,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event,b134];
var FUNCTION_TABLE_viiii = [b136,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi];
var FUNCTION_TABLE_viiiii = [b138,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib];
var FUNCTION_TABLE_viiiiii = [b140,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib];

  return { __GLOBAL__sub_I_main_cpp: __GLOBAL__sub_I_main_cpp, ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _fflush: _fflush, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _handle_lora_downlink: _handle_lora_downlink, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _invoke_ticker: _invoke_ticker, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _pthread_mutex_lock: _pthread_mutex_lock, _pthread_mutex_unlock: _pthread_mutex_unlock, _sbrk: _sbrk, dynCall_i: dynCall_i, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
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
var _handle_lora_downlink = Module["_handle_lora_downlink"] = asm["_handle_lora_downlink"];
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
var dynCall_i = Module["dynCall_i"] = asm["dynCall_i"];
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
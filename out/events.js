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

STATICTOP = STATIC_BASE + 6880;
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
var debug_table_vi = ["0", "__ZN4mbed11InterruptInD2Ev", "__ZN4mbed11InterruptInD0Ev", "_mbed_trace_default_print", "__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv", "__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "__ZN10__cxxabiv121__vmi_class_type_infoD0Ev", "__ZN4mbed11InterruptInD2Ev__async_cb", "__ZN4mbed11InterruptInD2Ev__async_cb_1", "__ZN4mbed11InterruptInD0Ev__async_cb", "__ZN4mbed11InterruptInD0Ev__async_cb_19", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_58", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_51", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_52", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_53", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_54", "__ZN6events10EventQueue8dispatchEi__async_cb", "_equeue_alloc__async_cb", "_equeue_dealloc__async_cb", "_equeue_post__async_cb", "_equeue_enqueue__async_cb", "_equeue_dispatch__async_cb", "_equeue_dispatch__async_cb_67", "_equeue_dispatch__async_cb_65", "_equeue_dispatch__async_cb_66", "_equeue_dispatch__async_cb_68", "_mbed_trace_default_print__async_cb", "_mbed_tracef__async_cb", "_mbed_vtracef__async_cb", "_mbed_vtracef__async_cb_18", "_mbed_vtracef__async_cb_8", "_mbed_vtracef__async_cb_9", "_mbed_vtracef__async_cb_10", "_mbed_vtracef__async_cb_17", "_mbed_vtracef__async_cb_11", "_mbed_vtracef__async_cb_16", "_mbed_vtracef__async_cb_12", "_mbed_vtracef__async_cb_13", "_mbed_vtracef__async_cb_14", "_mbed_vtracef__async_cb_15", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_43", "_mbed_die__async_cb_42", "_mbed_die__async_cb_41", "_mbed_die__async_cb_40", "_mbed_die__async_cb_39", "_mbed_die__async_cb_38", "_mbed_die__async_cb_37", "_mbed_die__async_cb_36", "_mbed_die__async_cb_35", "_mbed_die__async_cb_34", "_mbed_die__async_cb_33", "_mbed_die__async_cb_32", "_mbed_die__async_cb_31", "_mbed_die__async_cb_30", "_mbed_die__async_cb_29", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_vfprintf__async_cb", "_mbed_error_vfprintf__async_cb_61", "_mbed_error_vfprintf__async_cb_60", "_handle_interrupt_in__async_cb", "_serial_putc__async_cb_55", "_serial_putc__async_cb", "_invoke_ticker__async_cb_50", "_invoke_ticker__async_cb", "_wait_ms__async_cb", "__Z9blink_ledv__async_cb", "__Z8btn_fallv__async_cb", "_main__async_cb_28", "__ZN6events10EventQueue13function_dtorIPFvvEEEvPv", "__ZN6events10EventQueue13function_callIPFvvEEEvPv", "_main__async_cb_24", "_main__async_cb_27", "__ZN6events5EventIFvvEE10event_dtorIPS1_EEvPNS2_5eventE", "_main__async_cb_26", "_main__async_cb", "_main__async_cb_22", "_main__async_cb_25", "_main__async_cb_23", "__ZN6events10EventQueue13function_callIPFvvEEEvPv__async_cb", "__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb_63", "__ZN6events10EventQueue13function_dtorINS0_9context00IPFvvEEEEEvPv", "__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv", "__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb", "__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb", "__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb_6", "__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb", "__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb_44", "__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv__async_cb", "_putc__async_cb_49", "_putc__async_cb", "___overflow__async_cb", "_fflush__async_cb_3", "_fflush__async_cb_2", "_fflush__async_cb_4", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_7", "_vfprintf__async_cb", "_snprintf__async_cb", "_vsnprintf__async_cb", "_fputc__async_cb_69", "_fputc__async_cb", "_puts__async_cb", "__ZL25default_terminate_handlerv__async_cb", "__ZL25default_terminate_handlerv__async_cb_57", "_abort_message__async_cb", "_abort_message__async_cb_5", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_64", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_59", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_21", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv", "__ZSt11__terminatePFvvE__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_56", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_48", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_47", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_46", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_45", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_62", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
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
 sp = STACKTOP; //@line 3609
 STACKTOP = STACKTOP + 16 | 0; //@line 3610
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3610
 $1 = sp; //@line 3611
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 3618
   $7 = $6 >>> 3; //@line 3619
   $8 = HEAP32[1311] | 0; //@line 3620
   $9 = $8 >>> $7; //@line 3621
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 3627
    $16 = 5284 + ($14 << 1 << 2) | 0; //@line 3629
    $17 = $16 + 8 | 0; //@line 3630
    $18 = HEAP32[$17 >> 2] | 0; //@line 3631
    $19 = $18 + 8 | 0; //@line 3632
    $20 = HEAP32[$19 >> 2] | 0; //@line 3633
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1311] = $8 & ~(1 << $14); //@line 3640
     } else {
      if ((HEAP32[1315] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 3645
      }
      $27 = $20 + 12 | 0; //@line 3648
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 3652
       HEAP32[$17 >> 2] = $20; //@line 3653
       break;
      } else {
       _abort(); //@line 3656
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 3661
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 3664
    $34 = $18 + $30 + 4 | 0; //@line 3666
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 3669
    $$0 = $19; //@line 3670
    STACKTOP = sp; //@line 3671
    return $$0 | 0; //@line 3671
   }
   $37 = HEAP32[1313] | 0; //@line 3673
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 3679
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 3682
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 3685
     $49 = $47 >>> 12 & 16; //@line 3687
     $50 = $47 >>> $49; //@line 3688
     $52 = $50 >>> 5 & 8; //@line 3690
     $54 = $50 >>> $52; //@line 3692
     $56 = $54 >>> 2 & 4; //@line 3694
     $58 = $54 >>> $56; //@line 3696
     $60 = $58 >>> 1 & 2; //@line 3698
     $62 = $58 >>> $60; //@line 3700
     $64 = $62 >>> 1 & 1; //@line 3702
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 3705
     $69 = 5284 + ($67 << 1 << 2) | 0; //@line 3707
     $70 = $69 + 8 | 0; //@line 3708
     $71 = HEAP32[$70 >> 2] | 0; //@line 3709
     $72 = $71 + 8 | 0; //@line 3710
     $73 = HEAP32[$72 >> 2] | 0; //@line 3711
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 3717
       HEAP32[1311] = $77; //@line 3718
       $98 = $77; //@line 3719
      } else {
       if ((HEAP32[1315] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 3724
       }
       $80 = $73 + 12 | 0; //@line 3727
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 3731
        HEAP32[$70 >> 2] = $73; //@line 3732
        $98 = $8; //@line 3733
        break;
       } else {
        _abort(); //@line 3736
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 3741
     $84 = $83 - $6 | 0; //@line 3742
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 3745
     $87 = $71 + $6 | 0; //@line 3746
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 3749
     HEAP32[$71 + $83 >> 2] = $84; //@line 3751
     if ($37 | 0) {
      $92 = HEAP32[1316] | 0; //@line 3754
      $93 = $37 >>> 3; //@line 3755
      $95 = 5284 + ($93 << 1 << 2) | 0; //@line 3757
      $96 = 1 << $93; //@line 3758
      if (!($98 & $96)) {
       HEAP32[1311] = $98 | $96; //@line 3763
       $$0199 = $95; //@line 3765
       $$pre$phiZ2D = $95 + 8 | 0; //@line 3765
      } else {
       $101 = $95 + 8 | 0; //@line 3767
       $102 = HEAP32[$101 >> 2] | 0; //@line 3768
       if ((HEAP32[1315] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 3772
       } else {
        $$0199 = $102; //@line 3775
        $$pre$phiZ2D = $101; //@line 3775
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 3778
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 3780
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 3782
      HEAP32[$92 + 12 >> 2] = $95; //@line 3784
     }
     HEAP32[1313] = $84; //@line 3786
     HEAP32[1316] = $87; //@line 3787
     $$0 = $72; //@line 3788
     STACKTOP = sp; //@line 3789
     return $$0 | 0; //@line 3789
    }
    $108 = HEAP32[1312] | 0; //@line 3791
    if (!$108) {
     $$0197 = $6; //@line 3794
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 3798
     $114 = $112 >>> 12 & 16; //@line 3800
     $115 = $112 >>> $114; //@line 3801
     $117 = $115 >>> 5 & 8; //@line 3803
     $119 = $115 >>> $117; //@line 3805
     $121 = $119 >>> 2 & 4; //@line 3807
     $123 = $119 >>> $121; //@line 3809
     $125 = $123 >>> 1 & 2; //@line 3811
     $127 = $123 >>> $125; //@line 3813
     $129 = $127 >>> 1 & 1; //@line 3815
     $134 = HEAP32[5548 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 3820
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 3824
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 3830
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 3833
      $$0193$lcssa$i = $138; //@line 3833
     } else {
      $$01926$i = $134; //@line 3835
      $$01935$i = $138; //@line 3835
      $146 = $143; //@line 3835
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 3840
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 3841
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 3842
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 3843
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 3849
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 3852
        $$0193$lcssa$i = $$$0193$i; //@line 3852
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 3855
        $$01935$i = $$$0193$i; //@line 3855
       }
      }
     }
     $157 = HEAP32[1315] | 0; //@line 3859
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 3862
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 3865
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 3868
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 3872
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 3874
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 3878
       $176 = HEAP32[$175 >> 2] | 0; //@line 3879
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 3882
        $179 = HEAP32[$178 >> 2] | 0; //@line 3883
        if (!$179) {
         $$3$i = 0; //@line 3886
         break;
        } else {
         $$1196$i = $179; //@line 3889
         $$1198$i = $178; //@line 3889
        }
       } else {
        $$1196$i = $176; //@line 3892
        $$1198$i = $175; //@line 3892
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 3895
        $182 = HEAP32[$181 >> 2] | 0; //@line 3896
        if ($182 | 0) {
         $$1196$i = $182; //@line 3899
         $$1198$i = $181; //@line 3899
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 3902
        $185 = HEAP32[$184 >> 2] | 0; //@line 3903
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 3908
         $$1198$i = $184; //@line 3908
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 3913
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 3916
        $$3$i = $$1196$i; //@line 3917
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 3922
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 3925
       }
       $169 = $167 + 12 | 0; //@line 3928
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 3932
       }
       $172 = $164 + 8 | 0; //@line 3935
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 3939
        HEAP32[$172 >> 2] = $167; //@line 3940
        $$3$i = $164; //@line 3941
        break;
       } else {
        _abort(); //@line 3944
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 3953
       $191 = 5548 + ($190 << 2) | 0; //@line 3954
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 3959
         if (!$$3$i) {
          HEAP32[1312] = $108 & ~(1 << $190); //@line 3965
          break L73;
         }
        } else {
         if ((HEAP32[1315] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 3972
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 3980
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1315] | 0; //@line 3990
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 3993
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 3997
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 3999
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 4005
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 4009
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 4011
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 4017
       if ($214 | 0) {
        if ((HEAP32[1315] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 4023
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 4027
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 4029
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 4037
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 4040
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 4042
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 4045
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 4049
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 4052
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 4054
      if ($37 | 0) {
       $234 = HEAP32[1316] | 0; //@line 4057
       $235 = $37 >>> 3; //@line 4058
       $237 = 5284 + ($235 << 1 << 2) | 0; //@line 4060
       $238 = 1 << $235; //@line 4061
       if (!($8 & $238)) {
        HEAP32[1311] = $8 | $238; //@line 4066
        $$0189$i = $237; //@line 4068
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 4068
       } else {
        $242 = $237 + 8 | 0; //@line 4070
        $243 = HEAP32[$242 >> 2] | 0; //@line 4071
        if ((HEAP32[1315] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 4075
        } else {
         $$0189$i = $243; //@line 4078
         $$pre$phi$iZ2D = $242; //@line 4078
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 4081
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 4083
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 4085
       HEAP32[$234 + 12 >> 2] = $237; //@line 4087
      }
      HEAP32[1313] = $$0193$lcssa$i; //@line 4089
      HEAP32[1316] = $159; //@line 4090
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 4093
     STACKTOP = sp; //@line 4094
     return $$0 | 0; //@line 4094
    }
   } else {
    $$0197 = $6; //@line 4097
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 4102
   } else {
    $251 = $0 + 11 | 0; //@line 4104
    $252 = $251 & -8; //@line 4105
    $253 = HEAP32[1312] | 0; //@line 4106
    if (!$253) {
     $$0197 = $252; //@line 4109
    } else {
     $255 = 0 - $252 | 0; //@line 4111
     $256 = $251 >>> 8; //@line 4112
     if (!$256) {
      $$0358$i = 0; //@line 4115
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 4119
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 4123
       $262 = $256 << $261; //@line 4124
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 4127
       $267 = $262 << $265; //@line 4129
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 4132
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 4137
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 4143
      }
     }
     $282 = HEAP32[5548 + ($$0358$i << 2) >> 2] | 0; //@line 4147
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 4151
       $$3$i203 = 0; //@line 4151
       $$3350$i = $255; //@line 4151
       label = 81; //@line 4152
      } else {
       $$0342$i = 0; //@line 4159
       $$0347$i = $255; //@line 4159
       $$0353$i = $282; //@line 4159
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 4159
       $$0362$i = 0; //@line 4159
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 4164
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 4169
          $$435113$i = 0; //@line 4169
          $$435712$i = $$0353$i; //@line 4169
          label = 85; //@line 4170
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 4173
          $$1348$i = $292; //@line 4173
         }
        } else {
         $$1343$i = $$0342$i; //@line 4176
         $$1348$i = $$0347$i; //@line 4176
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 4179
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 4182
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 4186
        $302 = ($$0353$i | 0) == 0; //@line 4187
        if ($302) {
         $$2355$i = $$1363$i; //@line 4192
         $$3$i203 = $$1343$i; //@line 4192
         $$3350$i = $$1348$i; //@line 4192
         label = 81; //@line 4193
         break;
        } else {
         $$0342$i = $$1343$i; //@line 4196
         $$0347$i = $$1348$i; //@line 4196
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 4196
         $$0362$i = $$1363$i; //@line 4196
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 4206
       $309 = $253 & ($306 | 0 - $306); //@line 4209
       if (!$309) {
        $$0197 = $252; //@line 4212
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 4217
       $315 = $313 >>> 12 & 16; //@line 4219
       $316 = $313 >>> $315; //@line 4220
       $318 = $316 >>> 5 & 8; //@line 4222
       $320 = $316 >>> $318; //@line 4224
       $322 = $320 >>> 2 & 4; //@line 4226
       $324 = $320 >>> $322; //@line 4228
       $326 = $324 >>> 1 & 2; //@line 4230
       $328 = $324 >>> $326; //@line 4232
       $330 = $328 >>> 1 & 1; //@line 4234
       $$4$ph$i = 0; //@line 4240
       $$4357$ph$i = HEAP32[5548 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 4240
      } else {
       $$4$ph$i = $$3$i203; //@line 4242
       $$4357$ph$i = $$2355$i; //@line 4242
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 4246
       $$4351$lcssa$i = $$3350$i; //@line 4246
      } else {
       $$414$i = $$4$ph$i; //@line 4248
       $$435113$i = $$3350$i; //@line 4248
       $$435712$i = $$4357$ph$i; //@line 4248
       label = 85; //@line 4249
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 4254
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 4258
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 4259
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 4260
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 4261
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4267
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 4270
        $$4351$lcssa$i = $$$4351$i; //@line 4270
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 4273
        $$435113$i = $$$4351$i; //@line 4273
        label = 85; //@line 4274
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 4280
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1313] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1315] | 0; //@line 4286
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 4289
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 4292
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 4295
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 4299
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 4301
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 4305
         $371 = HEAP32[$370 >> 2] | 0; //@line 4306
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 4309
          $374 = HEAP32[$373 >> 2] | 0; //@line 4310
          if (!$374) {
           $$3372$i = 0; //@line 4313
           break;
          } else {
           $$1370$i = $374; //@line 4316
           $$1374$i = $373; //@line 4316
          }
         } else {
          $$1370$i = $371; //@line 4319
          $$1374$i = $370; //@line 4319
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 4322
          $377 = HEAP32[$376 >> 2] | 0; //@line 4323
          if ($377 | 0) {
           $$1370$i = $377; //@line 4326
           $$1374$i = $376; //@line 4326
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 4329
          $380 = HEAP32[$379 >> 2] | 0; //@line 4330
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 4335
           $$1374$i = $379; //@line 4335
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 4340
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 4343
          $$3372$i = $$1370$i; //@line 4344
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 4349
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 4352
         }
         $364 = $362 + 12 | 0; //@line 4355
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 4359
         }
         $367 = $359 + 8 | 0; //@line 4362
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 4366
          HEAP32[$367 >> 2] = $362; //@line 4367
          $$3372$i = $359; //@line 4368
          break;
         } else {
          _abort(); //@line 4371
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 4379
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 4382
         $386 = 5548 + ($385 << 2) | 0; //@line 4383
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 4388
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 4393
            HEAP32[1312] = $391; //@line 4394
            $475 = $391; //@line 4395
            break L164;
           }
          } else {
           if ((HEAP32[1315] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 4402
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 4410
            if (!$$3372$i) {
             $475 = $253; //@line 4413
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1315] | 0; //@line 4421
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 4424
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 4428
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 4430
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 4436
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 4440
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 4442
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 4448
         if (!$409) {
          $475 = $253; //@line 4451
         } else {
          if ((HEAP32[1315] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 4456
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 4460
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 4462
           $475 = $253; //@line 4463
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 4472
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 4475
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 4477
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 4480
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 4484
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 4487
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 4489
         $428 = $$4351$lcssa$i >>> 3; //@line 4490
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 5284 + ($428 << 1 << 2) | 0; //@line 4494
          $432 = HEAP32[1311] | 0; //@line 4495
          $433 = 1 << $428; //@line 4496
          if (!($432 & $433)) {
           HEAP32[1311] = $432 | $433; //@line 4501
           $$0368$i = $431; //@line 4503
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 4503
          } else {
           $437 = $431 + 8 | 0; //@line 4505
           $438 = HEAP32[$437 >> 2] | 0; //@line 4506
           if ((HEAP32[1315] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 4510
           } else {
            $$0368$i = $438; //@line 4513
            $$pre$phi$i211Z2D = $437; //@line 4513
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 4516
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 4518
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 4520
          HEAP32[$354 + 12 >> 2] = $431; //@line 4522
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 4525
         if (!$444) {
          $$0361$i = 0; //@line 4528
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 4532
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 4536
           $450 = $444 << $449; //@line 4537
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 4540
           $455 = $450 << $453; //@line 4542
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 4545
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 4550
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 4556
          }
         }
         $469 = 5548 + ($$0361$i << 2) | 0; //@line 4559
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 4561
         $471 = $354 + 16 | 0; //@line 4562
         HEAP32[$471 + 4 >> 2] = 0; //@line 4564
         HEAP32[$471 >> 2] = 0; //@line 4565
         $473 = 1 << $$0361$i; //@line 4566
         if (!($475 & $473)) {
          HEAP32[1312] = $475 | $473; //@line 4571
          HEAP32[$469 >> 2] = $354; //@line 4572
          HEAP32[$354 + 24 >> 2] = $469; //@line 4574
          HEAP32[$354 + 12 >> 2] = $354; //@line 4576
          HEAP32[$354 + 8 >> 2] = $354; //@line 4578
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 4587
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 4587
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 4594
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 4598
          $494 = HEAP32[$492 >> 2] | 0; //@line 4600
          if (!$494) {
           label = 136; //@line 4603
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 4606
           $$0345$i = $494; //@line 4606
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1315] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 4613
          } else {
           HEAP32[$492 >> 2] = $354; //@line 4616
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 4618
           HEAP32[$354 + 12 >> 2] = $354; //@line 4620
           HEAP32[$354 + 8 >> 2] = $354; //@line 4622
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 4627
          $502 = HEAP32[$501 >> 2] | 0; //@line 4628
          $503 = HEAP32[1315] | 0; //@line 4629
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 4635
           HEAP32[$501 >> 2] = $354; //@line 4636
           HEAP32[$354 + 8 >> 2] = $502; //@line 4638
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 4640
           HEAP32[$354 + 24 >> 2] = 0; //@line 4642
           break;
          } else {
           _abort(); //@line 4645
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 4652
       STACKTOP = sp; //@line 4653
       return $$0 | 0; //@line 4653
      } else {
       $$0197 = $252; //@line 4655
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1313] | 0; //@line 4662
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 4665
  $515 = HEAP32[1316] | 0; //@line 4666
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 4669
   HEAP32[1316] = $517; //@line 4670
   HEAP32[1313] = $514; //@line 4671
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 4674
   HEAP32[$515 + $512 >> 2] = $514; //@line 4676
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 4679
  } else {
   HEAP32[1313] = 0; //@line 4681
   HEAP32[1316] = 0; //@line 4682
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 4685
   $526 = $515 + $512 + 4 | 0; //@line 4687
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 4690
  }
  $$0 = $515 + 8 | 0; //@line 4693
  STACKTOP = sp; //@line 4694
  return $$0 | 0; //@line 4694
 }
 $530 = HEAP32[1314] | 0; //@line 4696
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 4699
  HEAP32[1314] = $532; //@line 4700
  $533 = HEAP32[1317] | 0; //@line 4701
  $534 = $533 + $$0197 | 0; //@line 4702
  HEAP32[1317] = $534; //@line 4703
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 4706
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 4709
  $$0 = $533 + 8 | 0; //@line 4711
  STACKTOP = sp; //@line 4712
  return $$0 | 0; //@line 4712
 }
 if (!(HEAP32[1429] | 0)) {
  HEAP32[1431] = 4096; //@line 4717
  HEAP32[1430] = 4096; //@line 4718
  HEAP32[1432] = -1; //@line 4719
  HEAP32[1433] = -1; //@line 4720
  HEAP32[1434] = 0; //@line 4721
  HEAP32[1422] = 0; //@line 4722
  HEAP32[1429] = $1 & -16 ^ 1431655768; //@line 4726
  $548 = 4096; //@line 4727
 } else {
  $548 = HEAP32[1431] | 0; //@line 4730
 }
 $545 = $$0197 + 48 | 0; //@line 4732
 $546 = $$0197 + 47 | 0; //@line 4733
 $547 = $548 + $546 | 0; //@line 4734
 $549 = 0 - $548 | 0; //@line 4735
 $550 = $547 & $549; //@line 4736
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 4739
  STACKTOP = sp; //@line 4740
  return $$0 | 0; //@line 4740
 }
 $552 = HEAP32[1421] | 0; //@line 4742
 if ($552 | 0) {
  $554 = HEAP32[1419] | 0; //@line 4745
  $555 = $554 + $550 | 0; //@line 4746
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 4751
   STACKTOP = sp; //@line 4752
   return $$0 | 0; //@line 4752
  }
 }
 L244 : do {
  if (!(HEAP32[1422] & 4)) {
   $561 = HEAP32[1317] | 0; //@line 4760
   L246 : do {
    if (!$561) {
     label = 163; //@line 4764
    } else {
     $$0$i$i = 5692; //@line 4766
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 4768
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 4771
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 4780
      if (!$570) {
       label = 163; //@line 4783
       break L246;
      } else {
       $$0$i$i = $570; //@line 4786
      }
     }
     $595 = $547 - $530 & $549; //@line 4790
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 4793
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 4801
       } else {
        $$723947$i = $595; //@line 4803
        $$748$i = $597; //@line 4803
        label = 180; //@line 4804
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 4808
       $$2253$ph$i = $595; //@line 4808
       label = 171; //@line 4809
      }
     } else {
      $$2234243136$i = 0; //@line 4812
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 4818
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 4821
     } else {
      $574 = $572; //@line 4823
      $575 = HEAP32[1430] | 0; //@line 4824
      $576 = $575 + -1 | 0; //@line 4825
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 4833
      $584 = HEAP32[1419] | 0; //@line 4834
      $585 = $$$i + $584 | 0; //@line 4835
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1421] | 0; //@line 4840
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 4847
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 4851
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 4854
        $$748$i = $572; //@line 4854
        label = 180; //@line 4855
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 4858
        $$2253$ph$i = $$$i; //@line 4858
        label = 171; //@line 4859
       }
      } else {
       $$2234243136$i = 0; //@line 4862
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 4869
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 4878
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 4881
       $$748$i = $$2247$ph$i; //@line 4881
       label = 180; //@line 4882
       break L244;
      }
     }
     $607 = HEAP32[1431] | 0; //@line 4886
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 4890
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 4893
      $$748$i = $$2247$ph$i; //@line 4893
      label = 180; //@line 4894
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 4900
      $$2234243136$i = 0; //@line 4901
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 4905
      $$748$i = $$2247$ph$i; //@line 4905
      label = 180; //@line 4906
      break L244;
     }
    }
   } while (0);
   HEAP32[1422] = HEAP32[1422] | 4; //@line 4913
   $$4236$i = $$2234243136$i; //@line 4914
   label = 178; //@line 4915
  } else {
   $$4236$i = 0; //@line 4917
   label = 178; //@line 4918
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 4924
   $621 = _sbrk(0) | 0; //@line 4925
   $627 = $621 - $620 | 0; //@line 4933
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 4935
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 4943
    $$748$i = $620; //@line 4943
    label = 180; //@line 4944
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1419] | 0) + $$723947$i | 0; //@line 4950
  HEAP32[1419] = $633; //@line 4951
  if ($633 >>> 0 > (HEAP32[1420] | 0) >>> 0) {
   HEAP32[1420] = $633; //@line 4955
  }
  $636 = HEAP32[1317] | 0; //@line 4957
  do {
   if (!$636) {
    $638 = HEAP32[1315] | 0; //@line 4961
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1315] = $$748$i; //@line 4966
    }
    HEAP32[1423] = $$748$i; //@line 4968
    HEAP32[1424] = $$723947$i; //@line 4969
    HEAP32[1426] = 0; //@line 4970
    HEAP32[1320] = HEAP32[1429]; //@line 4972
    HEAP32[1319] = -1; //@line 4973
    HEAP32[1324] = 5284; //@line 4974
    HEAP32[1323] = 5284; //@line 4975
    HEAP32[1326] = 5292; //@line 4976
    HEAP32[1325] = 5292; //@line 4977
    HEAP32[1328] = 5300; //@line 4978
    HEAP32[1327] = 5300; //@line 4979
    HEAP32[1330] = 5308; //@line 4980
    HEAP32[1329] = 5308; //@line 4981
    HEAP32[1332] = 5316; //@line 4982
    HEAP32[1331] = 5316; //@line 4983
    HEAP32[1334] = 5324; //@line 4984
    HEAP32[1333] = 5324; //@line 4985
    HEAP32[1336] = 5332; //@line 4986
    HEAP32[1335] = 5332; //@line 4987
    HEAP32[1338] = 5340; //@line 4988
    HEAP32[1337] = 5340; //@line 4989
    HEAP32[1340] = 5348; //@line 4990
    HEAP32[1339] = 5348; //@line 4991
    HEAP32[1342] = 5356; //@line 4992
    HEAP32[1341] = 5356; //@line 4993
    HEAP32[1344] = 5364; //@line 4994
    HEAP32[1343] = 5364; //@line 4995
    HEAP32[1346] = 5372; //@line 4996
    HEAP32[1345] = 5372; //@line 4997
    HEAP32[1348] = 5380; //@line 4998
    HEAP32[1347] = 5380; //@line 4999
    HEAP32[1350] = 5388; //@line 5000
    HEAP32[1349] = 5388; //@line 5001
    HEAP32[1352] = 5396; //@line 5002
    HEAP32[1351] = 5396; //@line 5003
    HEAP32[1354] = 5404; //@line 5004
    HEAP32[1353] = 5404; //@line 5005
    HEAP32[1356] = 5412; //@line 5006
    HEAP32[1355] = 5412; //@line 5007
    HEAP32[1358] = 5420; //@line 5008
    HEAP32[1357] = 5420; //@line 5009
    HEAP32[1360] = 5428; //@line 5010
    HEAP32[1359] = 5428; //@line 5011
    HEAP32[1362] = 5436; //@line 5012
    HEAP32[1361] = 5436; //@line 5013
    HEAP32[1364] = 5444; //@line 5014
    HEAP32[1363] = 5444; //@line 5015
    HEAP32[1366] = 5452; //@line 5016
    HEAP32[1365] = 5452; //@line 5017
    HEAP32[1368] = 5460; //@line 5018
    HEAP32[1367] = 5460; //@line 5019
    HEAP32[1370] = 5468; //@line 5020
    HEAP32[1369] = 5468; //@line 5021
    HEAP32[1372] = 5476; //@line 5022
    HEAP32[1371] = 5476; //@line 5023
    HEAP32[1374] = 5484; //@line 5024
    HEAP32[1373] = 5484; //@line 5025
    HEAP32[1376] = 5492; //@line 5026
    HEAP32[1375] = 5492; //@line 5027
    HEAP32[1378] = 5500; //@line 5028
    HEAP32[1377] = 5500; //@line 5029
    HEAP32[1380] = 5508; //@line 5030
    HEAP32[1379] = 5508; //@line 5031
    HEAP32[1382] = 5516; //@line 5032
    HEAP32[1381] = 5516; //@line 5033
    HEAP32[1384] = 5524; //@line 5034
    HEAP32[1383] = 5524; //@line 5035
    HEAP32[1386] = 5532; //@line 5036
    HEAP32[1385] = 5532; //@line 5037
    $642 = $$723947$i + -40 | 0; //@line 5038
    $644 = $$748$i + 8 | 0; //@line 5040
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 5045
    $650 = $$748$i + $649 | 0; //@line 5046
    $651 = $642 - $649 | 0; //@line 5047
    HEAP32[1317] = $650; //@line 5048
    HEAP32[1314] = $651; //@line 5049
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 5052
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 5055
    HEAP32[1318] = HEAP32[1433]; //@line 5057
   } else {
    $$024367$i = 5692; //@line 5059
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 5061
     $658 = $$024367$i + 4 | 0; //@line 5062
     $659 = HEAP32[$658 >> 2] | 0; //@line 5063
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 5067
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 5071
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 5076
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 5090
       $673 = (HEAP32[1314] | 0) + $$723947$i | 0; //@line 5092
       $675 = $636 + 8 | 0; //@line 5094
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 5099
       $681 = $636 + $680 | 0; //@line 5100
       $682 = $673 - $680 | 0; //@line 5101
       HEAP32[1317] = $681; //@line 5102
       HEAP32[1314] = $682; //@line 5103
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 5106
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 5109
       HEAP32[1318] = HEAP32[1433]; //@line 5111
       break;
      }
     }
    }
    $688 = HEAP32[1315] | 0; //@line 5116
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1315] = $$748$i; //@line 5119
     $753 = $$748$i; //@line 5120
    } else {
     $753 = $688; //@line 5122
    }
    $690 = $$748$i + $$723947$i | 0; //@line 5124
    $$124466$i = 5692; //@line 5125
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 5130
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 5134
     if (!$694) {
      $$0$i$i$i = 5692; //@line 5137
      break;
     } else {
      $$124466$i = $694; //@line 5140
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 5149
      $700 = $$124466$i + 4 | 0; //@line 5150
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 5153
      $704 = $$748$i + 8 | 0; //@line 5155
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 5161
      $712 = $690 + 8 | 0; //@line 5163
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 5169
      $722 = $710 + $$0197 | 0; //@line 5173
      $723 = $718 - $710 - $$0197 | 0; //@line 5174
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 5177
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1314] | 0) + $723 | 0; //@line 5182
        HEAP32[1314] = $728; //@line 5183
        HEAP32[1317] = $722; //@line 5184
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 5187
       } else {
        if ((HEAP32[1316] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1313] | 0) + $723 | 0; //@line 5193
         HEAP32[1313] = $734; //@line 5194
         HEAP32[1316] = $722; //@line 5195
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 5198
         HEAP32[$722 + $734 >> 2] = $734; //@line 5200
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 5204
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 5208
         $743 = $739 >>> 3; //@line 5209
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 5214
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 5216
           $750 = 5284 + ($743 << 1 << 2) | 0; //@line 5218
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 5224
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 5233
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1311] = HEAP32[1311] & ~(1 << $743); //@line 5243
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 5250
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 5254
             }
             $764 = $748 + 8 | 0; //@line 5257
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 5261
              break;
             }
             _abort(); //@line 5264
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 5269
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 5270
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 5273
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 5275
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 5279
             $783 = $782 + 4 | 0; //@line 5280
             $784 = HEAP32[$783 >> 2] | 0; //@line 5281
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 5284
              if (!$786) {
               $$3$i$i = 0; //@line 5287
               break;
              } else {
               $$1291$i$i = $786; //@line 5290
               $$1293$i$i = $782; //@line 5290
              }
             } else {
              $$1291$i$i = $784; //@line 5293
              $$1293$i$i = $783; //@line 5293
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 5296
              $789 = HEAP32[$788 >> 2] | 0; //@line 5297
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 5300
               $$1293$i$i = $788; //@line 5300
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 5303
              $792 = HEAP32[$791 >> 2] | 0; //@line 5304
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 5309
               $$1293$i$i = $791; //@line 5309
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 5314
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 5317
              $$3$i$i = $$1291$i$i; //@line 5318
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 5323
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 5326
             }
             $776 = $774 + 12 | 0; //@line 5329
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 5333
             }
             $779 = $771 + 8 | 0; //@line 5336
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 5340
              HEAP32[$779 >> 2] = $774; //@line 5341
              $$3$i$i = $771; //@line 5342
              break;
             } else {
              _abort(); //@line 5345
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 5355
           $798 = 5548 + ($797 << 2) | 0; //@line 5356
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 5361
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1312] = HEAP32[1312] & ~(1 << $797); //@line 5370
             break L311;
            } else {
             if ((HEAP32[1315] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 5376
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 5384
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1315] | 0; //@line 5394
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 5397
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 5401
           $815 = $718 + 16 | 0; //@line 5402
           $816 = HEAP32[$815 >> 2] | 0; //@line 5403
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 5409
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 5413
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 5415
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 5421
           if (!$822) {
            break;
           }
           if ((HEAP32[1315] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 5429
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 5433
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 5435
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 5442
         $$0287$i$i = $742 + $723 | 0; //@line 5442
        } else {
         $$0$i17$i = $718; //@line 5444
         $$0287$i$i = $723; //@line 5444
        }
        $830 = $$0$i17$i + 4 | 0; //@line 5446
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 5449
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 5452
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 5454
        $836 = $$0287$i$i >>> 3; //@line 5455
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 5284 + ($836 << 1 << 2) | 0; //@line 5459
         $840 = HEAP32[1311] | 0; //@line 5460
         $841 = 1 << $836; //@line 5461
         do {
          if (!($840 & $841)) {
           HEAP32[1311] = $840 | $841; //@line 5467
           $$0295$i$i = $839; //@line 5469
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 5469
          } else {
           $845 = $839 + 8 | 0; //@line 5471
           $846 = HEAP32[$845 >> 2] | 0; //@line 5472
           if ((HEAP32[1315] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 5476
            $$pre$phi$i19$iZ2D = $845; //@line 5476
            break;
           }
           _abort(); //@line 5479
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 5483
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 5485
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 5487
         HEAP32[$722 + 12 >> 2] = $839; //@line 5489
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 5492
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 5496
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 5500
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 5505
          $858 = $852 << $857; //@line 5506
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 5509
          $863 = $858 << $861; //@line 5511
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 5514
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 5519
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 5525
         }
        } while (0);
        $877 = 5548 + ($$0296$i$i << 2) | 0; //@line 5528
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 5530
        $879 = $722 + 16 | 0; //@line 5531
        HEAP32[$879 + 4 >> 2] = 0; //@line 5533
        HEAP32[$879 >> 2] = 0; //@line 5534
        $881 = HEAP32[1312] | 0; //@line 5535
        $882 = 1 << $$0296$i$i; //@line 5536
        if (!($881 & $882)) {
         HEAP32[1312] = $881 | $882; //@line 5541
         HEAP32[$877 >> 2] = $722; //@line 5542
         HEAP32[$722 + 24 >> 2] = $877; //@line 5544
         HEAP32[$722 + 12 >> 2] = $722; //@line 5546
         HEAP32[$722 + 8 >> 2] = $722; //@line 5548
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 5557
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 5557
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 5564
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 5568
         $902 = HEAP32[$900 >> 2] | 0; //@line 5570
         if (!$902) {
          label = 260; //@line 5573
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 5576
          $$0289$i$i = $902; //@line 5576
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1315] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 5583
         } else {
          HEAP32[$900 >> 2] = $722; //@line 5586
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 5588
          HEAP32[$722 + 12 >> 2] = $722; //@line 5590
          HEAP32[$722 + 8 >> 2] = $722; //@line 5592
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 5597
         $910 = HEAP32[$909 >> 2] | 0; //@line 5598
         $911 = HEAP32[1315] | 0; //@line 5599
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 5605
          HEAP32[$909 >> 2] = $722; //@line 5606
          HEAP32[$722 + 8 >> 2] = $910; //@line 5608
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 5610
          HEAP32[$722 + 24 >> 2] = 0; //@line 5612
          break;
         } else {
          _abort(); //@line 5615
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 5622
      STACKTOP = sp; //@line 5623
      return $$0 | 0; //@line 5623
     } else {
      $$0$i$i$i = 5692; //@line 5625
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 5629
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 5634
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 5642
    }
    $927 = $923 + -47 | 0; //@line 5644
    $929 = $927 + 8 | 0; //@line 5646
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 5652
    $936 = $636 + 16 | 0; //@line 5653
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 5655
    $939 = $938 + 8 | 0; //@line 5656
    $940 = $938 + 24 | 0; //@line 5657
    $941 = $$723947$i + -40 | 0; //@line 5658
    $943 = $$748$i + 8 | 0; //@line 5660
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 5665
    $949 = $$748$i + $948 | 0; //@line 5666
    $950 = $941 - $948 | 0; //@line 5667
    HEAP32[1317] = $949; //@line 5668
    HEAP32[1314] = $950; //@line 5669
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 5672
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 5675
    HEAP32[1318] = HEAP32[1433]; //@line 5677
    $956 = $938 + 4 | 0; //@line 5678
    HEAP32[$956 >> 2] = 27; //@line 5679
    HEAP32[$939 >> 2] = HEAP32[1423]; //@line 5680
    HEAP32[$939 + 4 >> 2] = HEAP32[1424]; //@line 5680
    HEAP32[$939 + 8 >> 2] = HEAP32[1425]; //@line 5680
    HEAP32[$939 + 12 >> 2] = HEAP32[1426]; //@line 5680
    HEAP32[1423] = $$748$i; //@line 5681
    HEAP32[1424] = $$723947$i; //@line 5682
    HEAP32[1426] = 0; //@line 5683
    HEAP32[1425] = $939; //@line 5684
    $958 = $940; //@line 5685
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 5687
     HEAP32[$958 >> 2] = 7; //@line 5688
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 5701
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 5704
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 5707
     HEAP32[$938 >> 2] = $964; //@line 5708
     $969 = $964 >>> 3; //@line 5709
     if ($964 >>> 0 < 256) {
      $972 = 5284 + ($969 << 1 << 2) | 0; //@line 5713
      $973 = HEAP32[1311] | 0; //@line 5714
      $974 = 1 << $969; //@line 5715
      if (!($973 & $974)) {
       HEAP32[1311] = $973 | $974; //@line 5720
       $$0211$i$i = $972; //@line 5722
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 5722
      } else {
       $978 = $972 + 8 | 0; //@line 5724
       $979 = HEAP32[$978 >> 2] | 0; //@line 5725
       if ((HEAP32[1315] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 5729
       } else {
        $$0211$i$i = $979; //@line 5732
        $$pre$phi$i$iZ2D = $978; //@line 5732
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 5735
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 5737
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 5739
      HEAP32[$636 + 12 >> 2] = $972; //@line 5741
      break;
     }
     $985 = $964 >>> 8; //@line 5744
     if (!$985) {
      $$0212$i$i = 0; //@line 5747
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 5751
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 5755
       $991 = $985 << $990; //@line 5756
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 5759
       $996 = $991 << $994; //@line 5761
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 5764
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 5769
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 5775
      }
     }
     $1010 = 5548 + ($$0212$i$i << 2) | 0; //@line 5778
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 5780
     HEAP32[$636 + 20 >> 2] = 0; //@line 5782
     HEAP32[$936 >> 2] = 0; //@line 5783
     $1013 = HEAP32[1312] | 0; //@line 5784
     $1014 = 1 << $$0212$i$i; //@line 5785
     if (!($1013 & $1014)) {
      HEAP32[1312] = $1013 | $1014; //@line 5790
      HEAP32[$1010 >> 2] = $636; //@line 5791
      HEAP32[$636 + 24 >> 2] = $1010; //@line 5793
      HEAP32[$636 + 12 >> 2] = $636; //@line 5795
      HEAP32[$636 + 8 >> 2] = $636; //@line 5797
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 5806
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 5806
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 5813
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 5817
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 5819
      if (!$1034) {
       label = 286; //@line 5822
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 5825
       $$0207$i$i = $1034; //@line 5825
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1315] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 5832
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 5835
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 5837
       HEAP32[$636 + 12 >> 2] = $636; //@line 5839
       HEAP32[$636 + 8 >> 2] = $636; //@line 5841
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 5846
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 5847
      $1043 = HEAP32[1315] | 0; //@line 5848
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 5854
       HEAP32[$1041 >> 2] = $636; //@line 5855
       HEAP32[$636 + 8 >> 2] = $1042; //@line 5857
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 5859
       HEAP32[$636 + 24 >> 2] = 0; //@line 5861
       break;
      } else {
       _abort(); //@line 5864
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1314] | 0; //@line 5871
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 5874
   HEAP32[1314] = $1054; //@line 5875
   $1055 = HEAP32[1317] | 0; //@line 5876
   $1056 = $1055 + $$0197 | 0; //@line 5877
   HEAP32[1317] = $1056; //@line 5878
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 5881
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 5884
   $$0 = $1055 + 8 | 0; //@line 5886
   STACKTOP = sp; //@line 5887
   return $$0 | 0; //@line 5887
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 5891
 $$0 = 0; //@line 5892
 STACKTOP = sp; //@line 5893
 return $$0 | 0; //@line 5893
}
function _equeue_dispatch__async_cb_68($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$03956$i = 0, $$03956$i$phi = 0, $$04055$i = 0, $$0405571$i = 0, $$04063$i = 0, $$04159$i = 0, $$04258$i = 0, $$057$i = 0, $$067 = 0, $$06992 = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val11 = 0, $$expand_i1_val13 = 0, $$expand_i1_val9 = 0, $$sink$in$i$i = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $12 = 0, $127 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $150 = 0, $152 = 0, $153 = 0, $154 = 0, $156 = 0, $157 = 0, $16 = 0, $165 = 0, $166 = 0, $168 = 0, $171 = 0, $173 = 0, $176 = 0, $179 = 0, $18 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $190 = 0, $193 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $4 = 0, $44 = 0, $45 = 0, $48 = 0, $54 = 0, $6 = 0, $63 = 0, $66 = 0, $67 = 0, $69 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $93 = 0, $95 = 0, $98 = 0, $99 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0, $$04159$i$looptemp = 0, $$04258$i$looptemp = 0;
 sp = STACKTOP; //@line 5948
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5950
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5952
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5954
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5956
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5958
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5960
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 5962
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 5964
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 5966
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 5968
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 5970
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 5972
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 5974
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 5976
 $30 = HEAP8[$0 + 60 >> 0] & 1; //@line 5979
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 5981
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 5983
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 5985
 _equeue_mutex_lock($6); //@line 5986
 HEAP8[$22 >> 0] = (HEAPU8[$22 >> 0] | 0) + 1; //@line 5991
 if (((HEAP32[$16 >> 2] | 0) - $20 | 0) < 1) {
  HEAP32[$16 >> 2] = $20; //@line 5996
 }
 $44 = HEAP32[$24 >> 2] | 0; //@line 5998
 HEAP32[$26 >> 2] = $44; //@line 5999
 $45 = $44; //@line 6000
 L6 : do {
  if (!$44) {
   $$04055$i = $2; //@line 6004
   $54 = $45; //@line 6004
   label = 8; //@line 6005
  } else {
   $$04063$i = $2; //@line 6007
   $48 = $45; //@line 6007
   do {
    if (((HEAP32[$48 + 20 >> 2] | 0) - $20 | 0) >= 1) {
     $$04055$i = $$04063$i; //@line 6014
     $54 = $48; //@line 6014
     label = 8; //@line 6015
     break L6;
    }
    $$04063$i = $48 + 8 | 0; //@line 6018
    $48 = HEAP32[$$04063$i >> 2] | 0; //@line 6019
   } while (($48 | 0) != 0);
   HEAP32[$12 >> 2] = 0; //@line 6027
   $$0405571$i = $$04063$i; //@line 6028
  }
 } while (0);
 if ((label | 0) == 8) {
  HEAP32[$12 >> 2] = $54; //@line 6032
  if (!$54) {
   $$0405571$i = $$04055$i; //@line 6035
  } else {
   HEAP32[$54 + 16 >> 2] = $12; //@line 6038
   $$0405571$i = $$04055$i; //@line 6039
  }
 }
 HEAP32[$$0405571$i >> 2] = 0; //@line 6042
 _equeue_mutex_unlock($6); //@line 6043
 $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74 = HEAP32[$2 >> 2] | 0; //@line 6044
 L15 : do {
  if (!$$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74) {} else {
   $$04159$i = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74; //@line 6049
   $$04258$i = $2; //@line 6049
   do {
    $$04258$i$looptemp = $$04258$i;
    $$04258$i = $$04159$i + 8 | 0; //@line 6051
    $$04159$i$looptemp = $$04159$i;
    $$04159$i = HEAP32[$$04258$i >> 2] | 0; //@line 6052
    $$03956$i = 0; //@line 6053
    $$057$i = $$04159$i$looptemp; //@line 6053
    while (1) {
     HEAP32[$$057$i + 8 >> 2] = $$03956$i; //@line 6056
     $63 = HEAP32[$$057$i + 12 >> 2] | 0; //@line 6058
     if (!$63) {
      break;
     } else {
      $$03956$i$phi = $$057$i; //@line 6063
      $$057$i = $63; //@line 6063
      $$03956$i = $$03956$i$phi; //@line 6063
     }
    }
    HEAP32[$$04258$i$looptemp >> 2] = $$057$i; //@line 6066
   } while (($$04159$i | 0) != 0);
   $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 = HEAP32[$2 >> 2] | 0; //@line 6074
   if ($$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 | 0) {
    $$06992 = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75; //@line 6077
    while (1) {
     $66 = $$06992 + 8 | 0; //@line 6079
     $67 = HEAP32[$66 >> 2] | 0; //@line 6080
     $69 = HEAP32[$$06992 + 32 >> 2] | 0; //@line 6082
     if ($69 | 0) {
      label = 17; //@line 6085
      break;
     }
     $93 = HEAP32[$$06992 + 24 >> 2] | 0; //@line 6089
     if (($93 | 0) > -1) {
      label = 21; //@line 6092
      break;
     }
     $117 = $$06992 + 4 | 0; //@line 6096
     $118 = HEAP8[$117 >> 0] | 0; //@line 6097
     HEAP8[$117 >> 0] = (($118 + 1 & 255) << HEAP32[$36 >> 2] | 0) == 0 ? 1 : ($118 & 255) + 1 & 255; //@line 6106
     $127 = HEAP32[$$06992 + 28 >> 2] | 0; //@line 6108
     if ($127 | 0) {
      label = 25; //@line 6111
      break;
     }
     _equeue_mutex_lock($34); //@line 6114
     $150 = HEAP32[$32 >> 2] | 0; //@line 6115
     L28 : do {
      if (!$150) {
       $$02329$i$i = $32; //@line 6119
       label = 34; //@line 6120
      } else {
       $152 = HEAP32[$$06992 >> 2] | 0; //@line 6122
       $$025$i$i = $32; //@line 6123
       $154 = $150; //@line 6123
       while (1) {
        $153 = HEAP32[$154 >> 2] | 0; //@line 6125
        if ($153 >>> 0 >= $152 >>> 0) {
         break;
        }
        $156 = $154 + 8 | 0; //@line 6130
        $157 = HEAP32[$156 >> 2] | 0; //@line 6131
        if (!$157) {
         $$02329$i$i = $156; //@line 6134
         label = 34; //@line 6135
         break L28;
        } else {
         $$025$i$i = $156; //@line 6138
         $154 = $157; //@line 6138
        }
       }
       if (($153 | 0) == ($152 | 0)) {
        HEAP32[$$06992 + 12 >> 2] = $154; //@line 6144
        $$02330$i$i = $$025$i$i; //@line 6147
        $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 6147
       } else {
        $$02329$i$i = $$025$i$i; //@line 6149
        label = 34; //@line 6150
       }
      }
     } while (0);
     if ((label | 0) == 34) {
      label = 0; //@line 6155
      HEAP32[$$06992 + 12 >> 2] = 0; //@line 6157
      $$02330$i$i = $$02329$i$i; //@line 6158
      $$sink$in$i$i = $$02329$i$i; //@line 6158
     }
     HEAP32[$66 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 6161
     HEAP32[$$02330$i$i >> 2] = $$06992; //@line 6162
     _equeue_mutex_unlock($34); //@line 6163
     if (!$67) {
      break L15;
     } else {
      $$06992 = $67; //@line 6168
     }
    }
    if ((label | 0) == 17) {
     $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 6173
     FUNCTION_TABLE_vi[$69 & 255]($$06992 + 36 | 0); //@line 6174
     if (___async) {
      HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 6177
      $72 = $ReallocAsyncCtx + 4 | 0; //@line 6178
      HEAP32[$72 >> 2] = $2; //@line 6179
      $73 = $ReallocAsyncCtx + 8 | 0; //@line 6180
      HEAP32[$73 >> 2] = $4; //@line 6181
      $74 = $ReallocAsyncCtx + 12 | 0; //@line 6182
      HEAP32[$74 >> 2] = $67; //@line 6183
      $75 = $ReallocAsyncCtx + 16 | 0; //@line 6184
      HEAP32[$75 >> 2] = $6; //@line 6185
      $76 = $ReallocAsyncCtx + 20 | 0; //@line 6186
      HEAP32[$76 >> 2] = $10; //@line 6187
      $77 = $ReallocAsyncCtx + 24 | 0; //@line 6188
      HEAP32[$77 >> 2] = $12; //@line 6189
      $78 = $ReallocAsyncCtx + 28 | 0; //@line 6190
      HEAP32[$78 >> 2] = $14; //@line 6191
      $79 = $ReallocAsyncCtx + 32 | 0; //@line 6192
      HEAP32[$79 >> 2] = $16; //@line 6193
      $80 = $ReallocAsyncCtx + 36 | 0; //@line 6194
      HEAP32[$80 >> 2] = $18; //@line 6195
      $81 = $ReallocAsyncCtx + 40 | 0; //@line 6196
      HEAP32[$81 >> 2] = $22; //@line 6197
      $82 = $ReallocAsyncCtx + 44 | 0; //@line 6198
      HEAP32[$82 >> 2] = $8; //@line 6199
      $83 = $ReallocAsyncCtx + 48 | 0; //@line 6200
      HEAP32[$83 >> 2] = $24; //@line 6201
      $84 = $ReallocAsyncCtx + 52 | 0; //@line 6202
      HEAP32[$84 >> 2] = $26; //@line 6203
      $85 = $ReallocAsyncCtx + 56 | 0; //@line 6204
      HEAP32[$85 >> 2] = $28; //@line 6205
      $86 = $ReallocAsyncCtx + 60 | 0; //@line 6206
      $$expand_i1_val = $30 & 1; //@line 6207
      HEAP8[$86 >> 0] = $$expand_i1_val; //@line 6208
      $87 = $ReallocAsyncCtx + 64 | 0; //@line 6209
      HEAP32[$87 >> 2] = $32; //@line 6210
      $88 = $ReallocAsyncCtx + 68 | 0; //@line 6211
      HEAP32[$88 >> 2] = $$06992; //@line 6212
      $89 = $ReallocAsyncCtx + 72 | 0; //@line 6213
      HEAP32[$89 >> 2] = $66; //@line 6214
      $90 = $ReallocAsyncCtx + 76 | 0; //@line 6215
      HEAP32[$90 >> 2] = $34; //@line 6216
      $91 = $ReallocAsyncCtx + 80 | 0; //@line 6217
      HEAP32[$91 >> 2] = $36; //@line 6218
      sp = STACKTOP; //@line 6219
      return;
     }
     ___async_unwind = 0; //@line 6222
     HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 6223
     $72 = $ReallocAsyncCtx + 4 | 0; //@line 6224
     HEAP32[$72 >> 2] = $2; //@line 6225
     $73 = $ReallocAsyncCtx + 8 | 0; //@line 6226
     HEAP32[$73 >> 2] = $4; //@line 6227
     $74 = $ReallocAsyncCtx + 12 | 0; //@line 6228
     HEAP32[$74 >> 2] = $67; //@line 6229
     $75 = $ReallocAsyncCtx + 16 | 0; //@line 6230
     HEAP32[$75 >> 2] = $6; //@line 6231
     $76 = $ReallocAsyncCtx + 20 | 0; //@line 6232
     HEAP32[$76 >> 2] = $10; //@line 6233
     $77 = $ReallocAsyncCtx + 24 | 0; //@line 6234
     HEAP32[$77 >> 2] = $12; //@line 6235
     $78 = $ReallocAsyncCtx + 28 | 0; //@line 6236
     HEAP32[$78 >> 2] = $14; //@line 6237
     $79 = $ReallocAsyncCtx + 32 | 0; //@line 6238
     HEAP32[$79 >> 2] = $16; //@line 6239
     $80 = $ReallocAsyncCtx + 36 | 0; //@line 6240
     HEAP32[$80 >> 2] = $18; //@line 6241
     $81 = $ReallocAsyncCtx + 40 | 0; //@line 6242
     HEAP32[$81 >> 2] = $22; //@line 6243
     $82 = $ReallocAsyncCtx + 44 | 0; //@line 6244
     HEAP32[$82 >> 2] = $8; //@line 6245
     $83 = $ReallocAsyncCtx + 48 | 0; //@line 6246
     HEAP32[$83 >> 2] = $24; //@line 6247
     $84 = $ReallocAsyncCtx + 52 | 0; //@line 6248
     HEAP32[$84 >> 2] = $26; //@line 6249
     $85 = $ReallocAsyncCtx + 56 | 0; //@line 6250
     HEAP32[$85 >> 2] = $28; //@line 6251
     $86 = $ReallocAsyncCtx + 60 | 0; //@line 6252
     $$expand_i1_val = $30 & 1; //@line 6253
     HEAP8[$86 >> 0] = $$expand_i1_val; //@line 6254
     $87 = $ReallocAsyncCtx + 64 | 0; //@line 6255
     HEAP32[$87 >> 2] = $32; //@line 6256
     $88 = $ReallocAsyncCtx + 68 | 0; //@line 6257
     HEAP32[$88 >> 2] = $$06992; //@line 6258
     $89 = $ReallocAsyncCtx + 72 | 0; //@line 6259
     HEAP32[$89 >> 2] = $66; //@line 6260
     $90 = $ReallocAsyncCtx + 76 | 0; //@line 6261
     HEAP32[$90 >> 2] = $34; //@line 6262
     $91 = $ReallocAsyncCtx + 80 | 0; //@line 6263
     HEAP32[$91 >> 2] = $36; //@line 6264
     sp = STACKTOP; //@line 6265
     return;
    } else if ((label | 0) == 21) {
     $95 = $$06992 + 20 | 0; //@line 6269
     HEAP32[$95 >> 2] = (HEAP32[$95 >> 2] | 0) + $93; //@line 6272
     $98 = _equeue_tick() | 0; //@line 6273
     $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 6274
     _equeue_enqueue($18, $$06992, $98) | 0; //@line 6275
     if (___async) {
      HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 6278
      $99 = $ReallocAsyncCtx4 + 4 | 0; //@line 6279
      HEAP32[$99 >> 2] = $2; //@line 6280
      $100 = $ReallocAsyncCtx4 + 8 | 0; //@line 6281
      HEAP32[$100 >> 2] = $4; //@line 6282
      $101 = $ReallocAsyncCtx4 + 12 | 0; //@line 6283
      HEAP32[$101 >> 2] = $67; //@line 6284
      $102 = $ReallocAsyncCtx4 + 16 | 0; //@line 6285
      HEAP32[$102 >> 2] = $6; //@line 6286
      $103 = $ReallocAsyncCtx4 + 20 | 0; //@line 6287
      HEAP32[$103 >> 2] = $8; //@line 6288
      $104 = $ReallocAsyncCtx4 + 24 | 0; //@line 6289
      HEAP32[$104 >> 2] = $10; //@line 6290
      $105 = $ReallocAsyncCtx4 + 28 | 0; //@line 6291
      HEAP32[$105 >> 2] = $12; //@line 6292
      $106 = $ReallocAsyncCtx4 + 32 | 0; //@line 6293
      HEAP32[$106 >> 2] = $14; //@line 6294
      $107 = $ReallocAsyncCtx4 + 36 | 0; //@line 6295
      HEAP32[$107 >> 2] = $16; //@line 6296
      $108 = $ReallocAsyncCtx4 + 40 | 0; //@line 6297
      HEAP32[$108 >> 2] = $18; //@line 6298
      $109 = $ReallocAsyncCtx4 + 44 | 0; //@line 6299
      HEAP32[$109 >> 2] = $22; //@line 6300
      $110 = $ReallocAsyncCtx4 + 48 | 0; //@line 6301
      HEAP32[$110 >> 2] = $24; //@line 6302
      $111 = $ReallocAsyncCtx4 + 52 | 0; //@line 6303
      HEAP32[$111 >> 2] = $26; //@line 6304
      $112 = $ReallocAsyncCtx4 + 56 | 0; //@line 6305
      HEAP32[$112 >> 2] = $28; //@line 6306
      $113 = $ReallocAsyncCtx4 + 60 | 0; //@line 6307
      $$expand_i1_val9 = $30 & 1; //@line 6308
      HEAP8[$113 >> 0] = $$expand_i1_val9; //@line 6309
      $114 = $ReallocAsyncCtx4 + 64 | 0; //@line 6310
      HEAP32[$114 >> 2] = $32; //@line 6311
      $115 = $ReallocAsyncCtx4 + 68 | 0; //@line 6312
      HEAP32[$115 >> 2] = $34; //@line 6313
      $116 = $ReallocAsyncCtx4 + 72 | 0; //@line 6314
      HEAP32[$116 >> 2] = $36; //@line 6315
      sp = STACKTOP; //@line 6316
      return;
     }
     ___async_unwind = 0; //@line 6319
     HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 6320
     $99 = $ReallocAsyncCtx4 + 4 | 0; //@line 6321
     HEAP32[$99 >> 2] = $2; //@line 6322
     $100 = $ReallocAsyncCtx4 + 8 | 0; //@line 6323
     HEAP32[$100 >> 2] = $4; //@line 6324
     $101 = $ReallocAsyncCtx4 + 12 | 0; //@line 6325
     HEAP32[$101 >> 2] = $67; //@line 6326
     $102 = $ReallocAsyncCtx4 + 16 | 0; //@line 6327
     HEAP32[$102 >> 2] = $6; //@line 6328
     $103 = $ReallocAsyncCtx4 + 20 | 0; //@line 6329
     HEAP32[$103 >> 2] = $8; //@line 6330
     $104 = $ReallocAsyncCtx4 + 24 | 0; //@line 6331
     HEAP32[$104 >> 2] = $10; //@line 6332
     $105 = $ReallocAsyncCtx4 + 28 | 0; //@line 6333
     HEAP32[$105 >> 2] = $12; //@line 6334
     $106 = $ReallocAsyncCtx4 + 32 | 0; //@line 6335
     HEAP32[$106 >> 2] = $14; //@line 6336
     $107 = $ReallocAsyncCtx4 + 36 | 0; //@line 6337
     HEAP32[$107 >> 2] = $16; //@line 6338
     $108 = $ReallocAsyncCtx4 + 40 | 0; //@line 6339
     HEAP32[$108 >> 2] = $18; //@line 6340
     $109 = $ReallocAsyncCtx4 + 44 | 0; //@line 6341
     HEAP32[$109 >> 2] = $22; //@line 6342
     $110 = $ReallocAsyncCtx4 + 48 | 0; //@line 6343
     HEAP32[$110 >> 2] = $24; //@line 6344
     $111 = $ReallocAsyncCtx4 + 52 | 0; //@line 6345
     HEAP32[$111 >> 2] = $26; //@line 6346
     $112 = $ReallocAsyncCtx4 + 56 | 0; //@line 6347
     HEAP32[$112 >> 2] = $28; //@line 6348
     $113 = $ReallocAsyncCtx4 + 60 | 0; //@line 6349
     $$expand_i1_val9 = $30 & 1; //@line 6350
     HEAP8[$113 >> 0] = $$expand_i1_val9; //@line 6351
     $114 = $ReallocAsyncCtx4 + 64 | 0; //@line 6352
     HEAP32[$114 >> 2] = $32; //@line 6353
     $115 = $ReallocAsyncCtx4 + 68 | 0; //@line 6354
     HEAP32[$115 >> 2] = $34; //@line 6355
     $116 = $ReallocAsyncCtx4 + 72 | 0; //@line 6356
     HEAP32[$116 >> 2] = $36; //@line 6357
     sp = STACKTOP; //@line 6358
     return;
    } else if ((label | 0) == 25) {
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 6363
     FUNCTION_TABLE_vi[$127 & 255]($$06992 + 36 | 0); //@line 6364
     if (___async) {
      HEAP32[$ReallocAsyncCtx2 >> 2] = 30; //@line 6367
      $130 = $ReallocAsyncCtx2 + 4 | 0; //@line 6368
      HEAP32[$130 >> 2] = $2; //@line 6369
      $131 = $ReallocAsyncCtx2 + 8 | 0; //@line 6370
      HEAP32[$131 >> 2] = $4; //@line 6371
      $132 = $ReallocAsyncCtx2 + 12 | 0; //@line 6372
      HEAP32[$132 >> 2] = $67; //@line 6373
      $133 = $ReallocAsyncCtx2 + 16 | 0; //@line 6374
      HEAP32[$133 >> 2] = $6; //@line 6375
      $134 = $ReallocAsyncCtx2 + 20 | 0; //@line 6376
      HEAP32[$134 >> 2] = $10; //@line 6377
      $135 = $ReallocAsyncCtx2 + 24 | 0; //@line 6378
      HEAP32[$135 >> 2] = $12; //@line 6379
      $136 = $ReallocAsyncCtx2 + 28 | 0; //@line 6380
      HEAP32[$136 >> 2] = $14; //@line 6381
      $137 = $ReallocAsyncCtx2 + 32 | 0; //@line 6382
      HEAP32[$137 >> 2] = $16; //@line 6383
      $138 = $ReallocAsyncCtx2 + 36 | 0; //@line 6384
      HEAP32[$138 >> 2] = $18; //@line 6385
      $139 = $ReallocAsyncCtx2 + 40 | 0; //@line 6386
      HEAP32[$139 >> 2] = $22; //@line 6387
      $140 = $ReallocAsyncCtx2 + 44 | 0; //@line 6388
      HEAP32[$140 >> 2] = $8; //@line 6389
      $141 = $ReallocAsyncCtx2 + 48 | 0; //@line 6390
      HEAP32[$141 >> 2] = $24; //@line 6391
      $142 = $ReallocAsyncCtx2 + 52 | 0; //@line 6392
      HEAP32[$142 >> 2] = $26; //@line 6393
      $143 = $ReallocAsyncCtx2 + 56 | 0; //@line 6394
      HEAP32[$143 >> 2] = $28; //@line 6395
      $144 = $ReallocAsyncCtx2 + 60 | 0; //@line 6396
      $$expand_i1_val11 = $30 & 1; //@line 6397
      HEAP8[$144 >> 0] = $$expand_i1_val11; //@line 6398
      $145 = $ReallocAsyncCtx2 + 64 | 0; //@line 6399
      HEAP32[$145 >> 2] = $32; //@line 6400
      $146 = $ReallocAsyncCtx2 + 68 | 0; //@line 6401
      HEAP32[$146 >> 2] = $34; //@line 6402
      $147 = $ReallocAsyncCtx2 + 72 | 0; //@line 6403
      HEAP32[$147 >> 2] = $36; //@line 6404
      $148 = $ReallocAsyncCtx2 + 76 | 0; //@line 6405
      HEAP32[$148 >> 2] = $$06992; //@line 6406
      $149 = $ReallocAsyncCtx2 + 80 | 0; //@line 6407
      HEAP32[$149 >> 2] = $66; //@line 6408
      sp = STACKTOP; //@line 6409
      return;
     }
     ___async_unwind = 0; //@line 6412
     HEAP32[$ReallocAsyncCtx2 >> 2] = 30; //@line 6413
     $130 = $ReallocAsyncCtx2 + 4 | 0; //@line 6414
     HEAP32[$130 >> 2] = $2; //@line 6415
     $131 = $ReallocAsyncCtx2 + 8 | 0; //@line 6416
     HEAP32[$131 >> 2] = $4; //@line 6417
     $132 = $ReallocAsyncCtx2 + 12 | 0; //@line 6418
     HEAP32[$132 >> 2] = $67; //@line 6419
     $133 = $ReallocAsyncCtx2 + 16 | 0; //@line 6420
     HEAP32[$133 >> 2] = $6; //@line 6421
     $134 = $ReallocAsyncCtx2 + 20 | 0; //@line 6422
     HEAP32[$134 >> 2] = $10; //@line 6423
     $135 = $ReallocAsyncCtx2 + 24 | 0; //@line 6424
     HEAP32[$135 >> 2] = $12; //@line 6425
     $136 = $ReallocAsyncCtx2 + 28 | 0; //@line 6426
     HEAP32[$136 >> 2] = $14; //@line 6427
     $137 = $ReallocAsyncCtx2 + 32 | 0; //@line 6428
     HEAP32[$137 >> 2] = $16; //@line 6429
     $138 = $ReallocAsyncCtx2 + 36 | 0; //@line 6430
     HEAP32[$138 >> 2] = $18; //@line 6431
     $139 = $ReallocAsyncCtx2 + 40 | 0; //@line 6432
     HEAP32[$139 >> 2] = $22; //@line 6433
     $140 = $ReallocAsyncCtx2 + 44 | 0; //@line 6434
     HEAP32[$140 >> 2] = $8; //@line 6435
     $141 = $ReallocAsyncCtx2 + 48 | 0; //@line 6436
     HEAP32[$141 >> 2] = $24; //@line 6437
     $142 = $ReallocAsyncCtx2 + 52 | 0; //@line 6438
     HEAP32[$142 >> 2] = $26; //@line 6439
     $143 = $ReallocAsyncCtx2 + 56 | 0; //@line 6440
     HEAP32[$143 >> 2] = $28; //@line 6441
     $144 = $ReallocAsyncCtx2 + 60 | 0; //@line 6442
     $$expand_i1_val11 = $30 & 1; //@line 6443
     HEAP8[$144 >> 0] = $$expand_i1_val11; //@line 6444
     $145 = $ReallocAsyncCtx2 + 64 | 0; //@line 6445
     HEAP32[$145 >> 2] = $32; //@line 6446
     $146 = $ReallocAsyncCtx2 + 68 | 0; //@line 6447
     HEAP32[$146 >> 2] = $34; //@line 6448
     $147 = $ReallocAsyncCtx2 + 72 | 0; //@line 6449
     HEAP32[$147 >> 2] = $36; //@line 6450
     $148 = $ReallocAsyncCtx2 + 76 | 0; //@line 6451
     HEAP32[$148 >> 2] = $$06992; //@line 6452
     $149 = $ReallocAsyncCtx2 + 80 | 0; //@line 6453
     HEAP32[$149 >> 2] = $66; //@line 6454
     sp = STACKTOP; //@line 6455
     return;
    }
   }
  }
 } while (0);
 $165 = _equeue_tick() | 0; //@line 6461
 if ($30) {
  $166 = $28 - $165 | 0; //@line 6463
  if (($166 | 0) < 1) {
   $168 = $18 + 40 | 0; //@line 6466
   if (HEAP32[$168 >> 2] | 0) {
    _equeue_mutex_lock($6); //@line 6470
    $171 = HEAP32[$168 >> 2] | 0; //@line 6471
    if ($171 | 0) {
     $173 = HEAP32[$12 >> 2] | 0; //@line 6474
     if ($173 | 0) {
      $176 = HEAP32[$18 + 44 >> 2] | 0; //@line 6478
      $179 = (HEAP32[$173 + 20 >> 2] | 0) - $165 | 0; //@line 6481
      $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 6485
      FUNCTION_TABLE_vii[$171 & 3]($176, $179 & ~($179 >> 31)); //@line 6486
      if (___async) {
       HEAP32[$ReallocAsyncCtx3 >> 2] = 31; //@line 6489
       $183 = $ReallocAsyncCtx3 + 4 | 0; //@line 6490
       HEAP32[$183 >> 2] = $8; //@line 6491
       $184 = $ReallocAsyncCtx3 + 8 | 0; //@line 6492
       HEAP32[$184 >> 2] = $6; //@line 6493
       $185 = $ReallocAsyncCtx3 + 12 | 0; //@line 6494
       HEAP32[$185 >> 2] = $10; //@line 6495
       sp = STACKTOP; //@line 6496
       return;
      }
      ___async_unwind = 0; //@line 6499
      HEAP32[$ReallocAsyncCtx3 >> 2] = 31; //@line 6500
      $183 = $ReallocAsyncCtx3 + 4 | 0; //@line 6501
      HEAP32[$183 >> 2] = $8; //@line 6502
      $184 = $ReallocAsyncCtx3 + 8 | 0; //@line 6503
      HEAP32[$184 >> 2] = $6; //@line 6504
      $185 = $ReallocAsyncCtx3 + 12 | 0; //@line 6505
      HEAP32[$185 >> 2] = $10; //@line 6506
      sp = STACKTOP; //@line 6507
      return;
     }
    }
    HEAP8[$8 >> 0] = 1; //@line 6511
    _equeue_mutex_unlock($6); //@line 6512
   }
   HEAP8[$10 >> 0] = 0; //@line 6514
   return;
  } else {
   $$067 = $166; //@line 6517
  }
 } else {
  $$067 = -1; //@line 6520
 }
 _equeue_mutex_lock($6); //@line 6522
 $186 = HEAP32[$12 >> 2] | 0; //@line 6523
 if (!$186) {
  $$2 = $$067; //@line 6526
 } else {
  $190 = (HEAP32[$186 + 20 >> 2] | 0) - $165 | 0; //@line 6530
  $193 = $190 & ~($190 >> 31); //@line 6533
  $$2 = $193 >>> 0 < $$067 >>> 0 ? $193 : $$067; //@line 6536
 }
 _equeue_mutex_unlock($6); //@line 6538
 _equeue_sema_wait($14, $$2) | 0; //@line 6539
 do {
  if (HEAP8[$10 >> 0] | 0) {
   _equeue_mutex_lock($6); //@line 6544
   if (!(HEAP8[$10 >> 0] | 0)) {
    _equeue_mutex_unlock($6); //@line 6548
    break;
   }
   HEAP8[$10 >> 0] = 0; //@line 6551
   _equeue_mutex_unlock($6); //@line 6552
   return;
  }
 } while (0);
 $199 = _equeue_tick() | 0; //@line 6556
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 6557
 _wait_ms(20); //@line 6558
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 32; //@line 6561
  $200 = $ReallocAsyncCtx5 + 4 | 0; //@line 6562
  HEAP32[$200 >> 2] = $2; //@line 6563
  $201 = $ReallocAsyncCtx5 + 8 | 0; //@line 6564
  HEAP32[$201 >> 2] = $4; //@line 6565
  $202 = $ReallocAsyncCtx5 + 12 | 0; //@line 6566
  HEAP32[$202 >> 2] = $6; //@line 6567
  $203 = $ReallocAsyncCtx5 + 16 | 0; //@line 6568
  HEAP32[$203 >> 2] = $8; //@line 6569
  $204 = $ReallocAsyncCtx5 + 20 | 0; //@line 6570
  HEAP32[$204 >> 2] = $10; //@line 6571
  $205 = $ReallocAsyncCtx5 + 24 | 0; //@line 6572
  HEAP32[$205 >> 2] = $12; //@line 6573
  $206 = $ReallocAsyncCtx5 + 28 | 0; //@line 6574
  HEAP32[$206 >> 2] = $14; //@line 6575
  $207 = $ReallocAsyncCtx5 + 32 | 0; //@line 6576
  HEAP32[$207 >> 2] = $16; //@line 6577
  $208 = $ReallocAsyncCtx5 + 36 | 0; //@line 6578
  HEAP32[$208 >> 2] = $18; //@line 6579
  $209 = $ReallocAsyncCtx5 + 40 | 0; //@line 6580
  HEAP32[$209 >> 2] = $199; //@line 6581
  $210 = $ReallocAsyncCtx5 + 44 | 0; //@line 6582
  HEAP32[$210 >> 2] = $22; //@line 6583
  $211 = $ReallocAsyncCtx5 + 48 | 0; //@line 6584
  HEAP32[$211 >> 2] = $24; //@line 6585
  $212 = $ReallocAsyncCtx5 + 52 | 0; //@line 6586
  HEAP32[$212 >> 2] = $26; //@line 6587
  $213 = $ReallocAsyncCtx5 + 56 | 0; //@line 6588
  HEAP32[$213 >> 2] = $28; //@line 6589
  $214 = $ReallocAsyncCtx5 + 60 | 0; //@line 6590
  $$expand_i1_val13 = $30 & 1; //@line 6591
  HEAP8[$214 >> 0] = $$expand_i1_val13; //@line 6592
  $215 = $ReallocAsyncCtx5 + 64 | 0; //@line 6593
  HEAP32[$215 >> 2] = $32; //@line 6594
  $216 = $ReallocAsyncCtx5 + 68 | 0; //@line 6595
  HEAP32[$216 >> 2] = $34; //@line 6596
  $217 = $ReallocAsyncCtx5 + 72 | 0; //@line 6597
  HEAP32[$217 >> 2] = $36; //@line 6598
  sp = STACKTOP; //@line 6599
  return;
 }
 ___async_unwind = 0; //@line 6602
 HEAP32[$ReallocAsyncCtx5 >> 2] = 32; //@line 6603
 $200 = $ReallocAsyncCtx5 + 4 | 0; //@line 6604
 HEAP32[$200 >> 2] = $2; //@line 6605
 $201 = $ReallocAsyncCtx5 + 8 | 0; //@line 6606
 HEAP32[$201 >> 2] = $4; //@line 6607
 $202 = $ReallocAsyncCtx5 + 12 | 0; //@line 6608
 HEAP32[$202 >> 2] = $6; //@line 6609
 $203 = $ReallocAsyncCtx5 + 16 | 0; //@line 6610
 HEAP32[$203 >> 2] = $8; //@line 6611
 $204 = $ReallocAsyncCtx5 + 20 | 0; //@line 6612
 HEAP32[$204 >> 2] = $10; //@line 6613
 $205 = $ReallocAsyncCtx5 + 24 | 0; //@line 6614
 HEAP32[$205 >> 2] = $12; //@line 6615
 $206 = $ReallocAsyncCtx5 + 28 | 0; //@line 6616
 HEAP32[$206 >> 2] = $14; //@line 6617
 $207 = $ReallocAsyncCtx5 + 32 | 0; //@line 6618
 HEAP32[$207 >> 2] = $16; //@line 6619
 $208 = $ReallocAsyncCtx5 + 36 | 0; //@line 6620
 HEAP32[$208 >> 2] = $18; //@line 6621
 $209 = $ReallocAsyncCtx5 + 40 | 0; //@line 6622
 HEAP32[$209 >> 2] = $199; //@line 6623
 $210 = $ReallocAsyncCtx5 + 44 | 0; //@line 6624
 HEAP32[$210 >> 2] = $22; //@line 6625
 $211 = $ReallocAsyncCtx5 + 48 | 0; //@line 6626
 HEAP32[$211 >> 2] = $24; //@line 6627
 $212 = $ReallocAsyncCtx5 + 52 | 0; //@line 6628
 HEAP32[$212 >> 2] = $26; //@line 6629
 $213 = $ReallocAsyncCtx5 + 56 | 0; //@line 6630
 HEAP32[$213 >> 2] = $28; //@line 6631
 $214 = $ReallocAsyncCtx5 + 60 | 0; //@line 6632
 $$expand_i1_val13 = $30 & 1; //@line 6633
 HEAP8[$214 >> 0] = $$expand_i1_val13; //@line 6634
 $215 = $ReallocAsyncCtx5 + 64 | 0; //@line 6635
 HEAP32[$215 >> 2] = $32; //@line 6636
 $216 = $ReallocAsyncCtx5 + 68 | 0; //@line 6637
 HEAP32[$216 >> 2] = $34; //@line 6638
 $217 = $ReallocAsyncCtx5 + 72 | 0; //@line 6639
 HEAP32[$217 >> 2] = $36; //@line 6640
 sp = STACKTOP; //@line 6641
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
 sp = STACKTOP; //@line 9615
 STACKTOP = STACKTOP + 560 | 0; //@line 9616
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 9616
 $6 = sp + 8 | 0; //@line 9617
 $7 = sp; //@line 9618
 $8 = sp + 524 | 0; //@line 9619
 $9 = $8; //@line 9620
 $10 = sp + 512 | 0; //@line 9621
 HEAP32[$7 >> 2] = 0; //@line 9622
 $11 = $10 + 12 | 0; //@line 9623
 ___DOUBLE_BITS_677($1) | 0; //@line 9624
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 9629
  $$0520 = 1; //@line 9629
  $$0521 = 2379; //@line 9629
 } else {
  $$0471 = $1; //@line 9640
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 9640
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 2380 : 2385 : 2382; //@line 9640
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 9642
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 9651
   $31 = $$0520 + 3 | 0; //@line 9656
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 9658
   _out_670($0, $$0521, $$0520); //@line 9659
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 2406 : 2410 : $27 ? 2398 : 2402, 3); //@line 9660
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 9662
   $$sink560 = $31; //@line 9663
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 9666
   $36 = $35 != 0.0; //@line 9667
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 9671
   }
   $39 = $5 | 32; //@line 9673
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 9676
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 9679
    $44 = $$0520 | 2; //@line 9680
    $46 = 12 - $3 | 0; //@line 9682
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 9687
     } else {
      $$0509585 = 8.0; //@line 9689
      $$1508586 = $46; //@line 9689
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 9691
       $$0509585 = $$0509585 * 16.0; //@line 9692
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 9707
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 9712
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 9717
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 9720
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 9723
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 9726
     HEAP8[$68 >> 0] = 48; //@line 9727
     $$0511 = $68; //@line 9728
    } else {
     $$0511 = $66; //@line 9730
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 9737
    $76 = $$0511 + -2 | 0; //@line 9740
    HEAP8[$76 >> 0] = $5 + 15; //@line 9741
    $77 = ($3 | 0) < 1; //@line 9742
    $79 = ($4 & 8 | 0) == 0; //@line 9744
    $$0523 = $8; //@line 9745
    $$2473 = $$1472; //@line 9745
    while (1) {
     $80 = ~~$$2473; //@line 9747
     $86 = $$0523 + 1 | 0; //@line 9753
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[2414 + $80 >> 0]; //@line 9754
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 9757
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 9766
      } else {
       HEAP8[$86 >> 0] = 46; //@line 9769
       $$1524 = $$0523 + 2 | 0; //@line 9770
      }
     } else {
      $$1524 = $86; //@line 9773
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 9777
     }
    }
    $$pre693 = $$1524; //@line 9783
    if (!$3) {
     label = 24; //@line 9785
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 9793
      $$sink = $3 + 2 | 0; //@line 9793
     } else {
      label = 24; //@line 9795
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 9799
     $$pre$phi691Z2D = $101; //@line 9800
     $$sink = $101; //@line 9800
    }
    $104 = $11 - $76 | 0; //@line 9804
    $106 = $104 + $44 + $$sink | 0; //@line 9806
    _pad_676($0, 32, $2, $106, $4); //@line 9807
    _out_670($0, $$0521$, $44); //@line 9808
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 9810
    _out_670($0, $8, $$pre$phi691Z2D); //@line 9811
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 9813
    _out_670($0, $76, $104); //@line 9814
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 9816
    $$sink560 = $106; //@line 9817
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 9821
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 9825
    HEAP32[$7 >> 2] = $113; //@line 9826
    $$3 = $35 * 268435456.0; //@line 9827
    $$pr = $113; //@line 9827
   } else {
    $$3 = $35; //@line 9830
    $$pr = HEAP32[$7 >> 2] | 0; //@line 9830
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 9834
   $$0498 = $$561; //@line 9835
   $$4 = $$3; //@line 9835
   do {
    $116 = ~~$$4 >>> 0; //@line 9837
    HEAP32[$$0498 >> 2] = $116; //@line 9838
    $$0498 = $$0498 + 4 | 0; //@line 9839
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 9842
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 9852
    $$1499662 = $$0498; //@line 9852
    $124 = $$pr; //@line 9852
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 9855
     $$0488655 = $$1499662 + -4 | 0; //@line 9856
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 9859
     } else {
      $$0488657 = $$0488655; //@line 9861
      $$0497656 = 0; //@line 9861
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 9864
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 9866
       $131 = tempRet0; //@line 9867
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 9868
       HEAP32[$$0488657 >> 2] = $132; //@line 9870
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 9871
       $$0488657 = $$0488657 + -4 | 0; //@line 9873
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 9883
      } else {
       $138 = $$1482663 + -4 | 0; //@line 9885
       HEAP32[$138 >> 2] = $$0497656; //@line 9886
       $$2483$ph = $138; //@line 9887
      }
     }
     $$2500 = $$1499662; //@line 9890
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 9896
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 9900
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 9906
     HEAP32[$7 >> 2] = $144; //@line 9907
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 9910
      $$1499662 = $$2500; //@line 9910
      $124 = $144; //@line 9910
     } else {
      $$1482$lcssa = $$2483$ph; //@line 9912
      $$1499$lcssa = $$2500; //@line 9912
      $$pr566 = $144; //@line 9912
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 9917
    $$1499$lcssa = $$0498; //@line 9917
    $$pr566 = $$pr; //@line 9917
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 9923
    $150 = ($39 | 0) == 102; //@line 9924
    $$3484650 = $$1482$lcssa; //@line 9925
    $$3501649 = $$1499$lcssa; //@line 9925
    $152 = $$pr566; //@line 9925
    while (1) {
     $151 = 0 - $152 | 0; //@line 9927
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 9929
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 9933
      $161 = 1e9 >>> $154; //@line 9934
      $$0487644 = 0; //@line 9935
      $$1489643 = $$3484650; //@line 9935
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 9937
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 9941
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 9942
       $$1489643 = $$1489643 + 4 | 0; //@line 9943
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 9954
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 9957
       $$4502 = $$3501649; //@line 9957
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 9960
       $$$3484700 = $$$3484; //@line 9961
       $$4502 = $$3501649 + 4 | 0; //@line 9961
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 9968
      $$4502 = $$3501649; //@line 9968
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 9970
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 9977
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 9979
     HEAP32[$7 >> 2] = $152; //@line 9980
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 9985
      $$3501$lcssa = $$$4502; //@line 9985
      break;
     } else {
      $$3484650 = $$$3484700; //@line 9983
      $$3501649 = $$$4502; //@line 9983
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 9990
    $$3501$lcssa = $$1499$lcssa; //@line 9990
   }
   $185 = $$561; //@line 9993
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 9998
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 9999
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 10002
    } else {
     $$0514639 = $189; //@line 10004
     $$0530638 = 10; //@line 10004
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 10006
      $193 = $$0514639 + 1 | 0; //@line 10007
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 10010
       break;
      } else {
       $$0514639 = $193; //@line 10013
      }
     }
    }
   } else {
    $$1515 = 0; //@line 10018
   }
   $198 = ($39 | 0) == 103; //@line 10023
   $199 = ($$540 | 0) != 0; //@line 10024
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 10027
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 10036
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 10039
    $213 = ($209 | 0) % 9 | 0; //@line 10040
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 10043
     $$1531632 = 10; //@line 10043
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 10046
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 10049
       $$1531632 = $215; //@line 10049
      } else {
       $$1531$lcssa = $215; //@line 10051
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 10056
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 10058
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 10059
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 10062
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 10065
     $$4518 = $$1515; //@line 10065
     $$8 = $$3484$lcssa; //@line 10065
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 10070
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 10071
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 10076
     if (!$$0520) {
      $$1467 = $$$564; //@line 10079
      $$1469 = $$543; //@line 10079
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 10082
      $$1467 = $230 ? -$$$564 : $$$564; //@line 10087
      $$1469 = $230 ? -$$543 : $$543; //@line 10087
     }
     $233 = $217 - $218 | 0; //@line 10089
     HEAP32[$212 >> 2] = $233; //@line 10090
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 10094
      HEAP32[$212 >> 2] = $236; //@line 10095
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 10098
       $$sink547625 = $212; //@line 10098
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 10100
        HEAP32[$$sink547625 >> 2] = 0; //@line 10101
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 10104
         HEAP32[$240 >> 2] = 0; //@line 10105
         $$6 = $240; //@line 10106
        } else {
         $$6 = $$5486626; //@line 10108
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 10111
        HEAP32[$238 >> 2] = $242; //@line 10112
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 10115
         $$sink547625 = $238; //@line 10115
        } else {
         $$5486$lcssa = $$6; //@line 10117
         $$sink547$lcssa = $238; //@line 10117
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 10122
       $$sink547$lcssa = $212; //@line 10122
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 10127
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 10128
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 10131
       $$4518 = $247; //@line 10131
       $$8 = $$5486$lcssa; //@line 10131
      } else {
       $$2516621 = $247; //@line 10133
       $$2532620 = 10; //@line 10133
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 10135
        $251 = $$2516621 + 1 | 0; //@line 10136
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 10139
         $$4518 = $251; //@line 10139
         $$8 = $$5486$lcssa; //@line 10139
         break;
        } else {
         $$2516621 = $251; //@line 10142
        }
       }
      }
     } else {
      $$4492 = $212; //@line 10147
      $$4518 = $$1515; //@line 10147
      $$8 = $$3484$lcssa; //@line 10147
     }
    }
    $253 = $$4492 + 4 | 0; //@line 10150
    $$5519$ph = $$4518; //@line 10153
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 10153
    $$9$ph = $$8; //@line 10153
   } else {
    $$5519$ph = $$1515; //@line 10155
    $$7505$ph = $$3501$lcssa; //@line 10155
    $$9$ph = $$3484$lcssa; //@line 10155
   }
   $$7505 = $$7505$ph; //@line 10157
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 10161
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 10164
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 10168
    } else {
     $$lcssa675 = 1; //@line 10170
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 10174
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 10179
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 10187
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 10187
     } else {
      $$0479 = $5 + -2 | 0; //@line 10191
      $$2476 = $$540$ + -1 | 0; //@line 10191
     }
     $267 = $4 & 8; //@line 10193
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 10198
       if (!$270) {
        $$2529 = 9; //@line 10201
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 10206
         $$3533616 = 10; //@line 10206
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 10208
          $275 = $$1528617 + 1 | 0; //@line 10209
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 10215
           break;
          } else {
           $$1528617 = $275; //@line 10213
          }
         }
        } else {
         $$2529 = 0; //@line 10220
        }
       }
      } else {
       $$2529 = 9; //@line 10224
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 10232
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 10234
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 10236
       $$1480 = $$0479; //@line 10239
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 10239
       $$pre$phi698Z2D = 0; //@line 10239
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 10243
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 10245
       $$1480 = $$0479; //@line 10248
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 10248
       $$pre$phi698Z2D = 0; //@line 10248
       break;
      }
     } else {
      $$1480 = $$0479; //@line 10252
      $$3477 = $$2476; //@line 10252
      $$pre$phi698Z2D = $267; //@line 10252
     }
    } else {
     $$1480 = $5; //@line 10256
     $$3477 = $$540; //@line 10256
     $$pre$phi698Z2D = $4 & 8; //@line 10256
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 10259
   $294 = ($292 | 0) != 0 & 1; //@line 10261
   $296 = ($$1480 | 32 | 0) == 102; //@line 10263
   if ($296) {
    $$2513 = 0; //@line 10267
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 10267
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 10270
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 10273
    $304 = $11; //@line 10274
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 10279
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 10281
      HEAP8[$308 >> 0] = 48; //@line 10282
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 10287
      } else {
       $$1512$lcssa = $308; //@line 10289
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 10294
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 10301
    $318 = $$1512$lcssa + -2 | 0; //@line 10303
    HEAP8[$318 >> 0] = $$1480; //@line 10304
    $$2513 = $318; //@line 10307
    $$pn = $304 - $318 | 0; //@line 10307
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 10312
   _pad_676($0, 32, $2, $323, $4); //@line 10313
   _out_670($0, $$0521, $$0520); //@line 10314
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 10316
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 10319
    $326 = $8 + 9 | 0; //@line 10320
    $327 = $326; //@line 10321
    $328 = $8 + 8 | 0; //@line 10322
    $$5493600 = $$0496$$9; //@line 10323
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 10326
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 10331
       $$1465 = $328; //@line 10332
      } else {
       $$1465 = $330; //@line 10334
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 10341
       $$0464597 = $330; //@line 10342
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 10344
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 10347
        } else {
         $$1465 = $335; //@line 10349
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 10354
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 10359
     $$5493600 = $$5493600 + 4 | 0; //@line 10360
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 2430, 1); //@line 10370
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 10376
     $$6494592 = $$5493600; //@line 10376
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 10379
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 10384
       $$0463587 = $347; //@line 10385
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 10387
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 10390
        } else {
         $$0463$lcssa = $351; //@line 10392
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 10397
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 10401
      $$6494592 = $$6494592 + 4 | 0; //@line 10402
      $356 = $$4478593 + -9 | 0; //@line 10403
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 10410
       break;
      } else {
       $$4478593 = $356; //@line 10408
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 10415
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 10418
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 10421
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 10424
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 10425
     $365 = $363; //@line 10426
     $366 = 0 - $9 | 0; //@line 10427
     $367 = $8 + 8 | 0; //@line 10428
     $$5605 = $$3477; //@line 10429
     $$7495604 = $$9$ph; //@line 10429
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 10432
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 10435
       $$0 = $367; //@line 10436
      } else {
       $$0 = $369; //@line 10438
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 10443
        _out_670($0, $$0, 1); //@line 10444
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 10448
         break;
        }
        _out_670($0, 2430, 1); //@line 10451
        $$2 = $375; //@line 10452
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 10456
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 10461
        $$1601 = $$0; //@line 10462
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 10464
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 10467
         } else {
          $$2 = $373; //@line 10469
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 10476
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 10479
      $381 = $$5605 - $378 | 0; //@line 10480
      $$7495604 = $$7495604 + 4 | 0; //@line 10481
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 10488
       break;
      } else {
       $$5605 = $381; //@line 10486
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 10493
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 10496
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 10500
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 10503
   $$sink560 = $323; //@line 10504
  }
 } while (0);
 STACKTOP = sp; //@line 10509
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 10509
}
function _equeue_dispatch__async_cb($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$067 = 0, $$06992$reg2mem$0 = 0, $$06992$reg2mem$0$phi = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val31 = 0, $$expand_i1_val33 = 0, $$expand_i1_val35 = 0, $$reg2mem$0 = 0, $$reg2mem24$0 = 0, $$sink$in$i$i = 0, $10 = 0, $102 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $127 = 0, $128 = 0, $129 = 0, $131 = 0, $132 = 0, $14 = 0, $140 = 0, $141 = 0, $143 = 0, $146 = 0, $148 = 0, $151 = 0, $154 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $165 = 0, $168 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $190 = 0, $191 = 0, $192 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $38 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $70 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4069
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4071
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4073
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4077
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4079
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4081
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4083
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4085
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4087
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 4089
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 4091
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 4093
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 4095
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 4097
 $30 = HEAP8[$0 + 60 >> 0] & 1; //@line 4100
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 4102
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 4108
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 4110
 $$06992$reg2mem$0 = HEAP32[$0 + 68 >> 2] | 0; //@line 4111
 $$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 4111
 $$reg2mem24$0 = HEAP32[$0 + 72 >> 2] | 0; //@line 4111
 while (1) {
  $68 = HEAP32[$$06992$reg2mem$0 + 24 >> 2] | 0; //@line 4114
  if (($68 | 0) > -1) {
   label = 8; //@line 4117
   break;
  }
  $92 = $$06992$reg2mem$0 + 4 | 0; //@line 4121
  $93 = HEAP8[$92 >> 0] | 0; //@line 4122
  HEAP8[$92 >> 0] = (($93 + 1 & 255) << HEAP32[$40 >> 2] | 0) == 0 ? 1 : ($93 & 255) + 1 & 255; //@line 4131
  $102 = HEAP32[$$06992$reg2mem$0 + 28 >> 2] | 0; //@line 4133
  if ($102 | 0) {
   label = 12; //@line 4136
   break;
  }
  _equeue_mutex_lock($38); //@line 4139
  $125 = HEAP32[$32 >> 2] | 0; //@line 4140
  L6 : do {
   if (!$125) {
    $$02329$i$i = $32; //@line 4144
    label = 21; //@line 4145
   } else {
    $127 = HEAP32[$$06992$reg2mem$0 >> 2] | 0; //@line 4147
    $$025$i$i = $32; //@line 4148
    $129 = $125; //@line 4148
    while (1) {
     $128 = HEAP32[$129 >> 2] | 0; //@line 4150
     if ($128 >>> 0 >= $127 >>> 0) {
      break;
     }
     $131 = $129 + 8 | 0; //@line 4155
     $132 = HEAP32[$131 >> 2] | 0; //@line 4156
     if (!$132) {
      $$02329$i$i = $131; //@line 4159
      label = 21; //@line 4160
      break L6;
     } else {
      $$025$i$i = $131; //@line 4163
      $129 = $132; //@line 4163
     }
    }
    if (($128 | 0) == ($127 | 0)) {
     HEAP32[$$06992$reg2mem$0 + 12 >> 2] = $129; //@line 4169
     $$02330$i$i = $$025$i$i; //@line 4172
     $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 4172
    } else {
     $$02329$i$i = $$025$i$i; //@line 4174
     label = 21; //@line 4175
    }
   }
  } while (0);
  if ((label | 0) == 21) {
   label = 0; //@line 4180
   HEAP32[$$06992$reg2mem$0 + 12 >> 2] = 0; //@line 4182
   $$02330$i$i = $$02329$i$i; //@line 4183
   $$sink$in$i$i = $$02329$i$i; //@line 4183
  }
  HEAP32[$$reg2mem24$0 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 4186
  HEAP32[$$02330$i$i >> 2] = $$06992$reg2mem$0; //@line 4187
  _equeue_mutex_unlock($38); //@line 4188
  if (!$$reg2mem$0) {
   label = 24; //@line 4191
   break;
  }
  $41 = $$reg2mem$0 + 8 | 0; //@line 4194
  $42 = HEAP32[$41 >> 2] | 0; //@line 4195
  $44 = HEAP32[$$reg2mem$0 + 32 >> 2] | 0; //@line 4197
  if (!$44) {
   $$06992$reg2mem$0$phi = $$reg2mem$0; //@line 4200
   $$reg2mem$0 = $42; //@line 4200
   $$reg2mem24$0 = $41; //@line 4200
   $$06992$reg2mem$0 = $$06992$reg2mem$0$phi; //@line 4200
  } else {
   label = 3; //@line 4202
   break;
  }
 }
 if ((label | 0) == 3) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 4208
  FUNCTION_TABLE_vi[$44 & 255]($$reg2mem$0 + 36 | 0); //@line 4209
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 4212
   $47 = $ReallocAsyncCtx + 4 | 0; //@line 4213
   HEAP32[$47 >> 2] = $2; //@line 4214
   $48 = $ReallocAsyncCtx + 8 | 0; //@line 4215
   HEAP32[$48 >> 2] = $4; //@line 4216
   $49 = $ReallocAsyncCtx + 12 | 0; //@line 4217
   HEAP32[$49 >> 2] = $42; //@line 4218
   $50 = $ReallocAsyncCtx + 16 | 0; //@line 4219
   HEAP32[$50 >> 2] = $8; //@line 4220
   $51 = $ReallocAsyncCtx + 20 | 0; //@line 4221
   HEAP32[$51 >> 2] = $10; //@line 4222
   $52 = $ReallocAsyncCtx + 24 | 0; //@line 4223
   HEAP32[$52 >> 2] = $12; //@line 4224
   $53 = $ReallocAsyncCtx + 28 | 0; //@line 4225
   HEAP32[$53 >> 2] = $14; //@line 4226
   $54 = $ReallocAsyncCtx + 32 | 0; //@line 4227
   HEAP32[$54 >> 2] = $16; //@line 4228
   $55 = $ReallocAsyncCtx + 36 | 0; //@line 4229
   HEAP32[$55 >> 2] = $18; //@line 4230
   $56 = $ReallocAsyncCtx + 40 | 0; //@line 4231
   HEAP32[$56 >> 2] = $20; //@line 4232
   $57 = $ReallocAsyncCtx + 44 | 0; //@line 4233
   HEAP32[$57 >> 2] = $22; //@line 4234
   $58 = $ReallocAsyncCtx + 48 | 0; //@line 4235
   HEAP32[$58 >> 2] = $24; //@line 4236
   $59 = $ReallocAsyncCtx + 52 | 0; //@line 4237
   HEAP32[$59 >> 2] = $26; //@line 4238
   $60 = $ReallocAsyncCtx + 56 | 0; //@line 4239
   HEAP32[$60 >> 2] = $28; //@line 4240
   $61 = $ReallocAsyncCtx + 60 | 0; //@line 4241
   $$expand_i1_val = $30 & 1; //@line 4242
   HEAP8[$61 >> 0] = $$expand_i1_val; //@line 4243
   $62 = $ReallocAsyncCtx + 64 | 0; //@line 4244
   HEAP32[$62 >> 2] = $32; //@line 4245
   $63 = $ReallocAsyncCtx + 68 | 0; //@line 4246
   HEAP32[$63 >> 2] = $$reg2mem$0; //@line 4247
   $64 = $ReallocAsyncCtx + 72 | 0; //@line 4248
   HEAP32[$64 >> 2] = $41; //@line 4249
   $65 = $ReallocAsyncCtx + 76 | 0; //@line 4250
   HEAP32[$65 >> 2] = $38; //@line 4251
   $66 = $ReallocAsyncCtx + 80 | 0; //@line 4252
   HEAP32[$66 >> 2] = $40; //@line 4253
   sp = STACKTOP; //@line 4254
   return;
  }
  ___async_unwind = 0; //@line 4257
  HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 4258
  $47 = $ReallocAsyncCtx + 4 | 0; //@line 4259
  HEAP32[$47 >> 2] = $2; //@line 4260
  $48 = $ReallocAsyncCtx + 8 | 0; //@line 4261
  HEAP32[$48 >> 2] = $4; //@line 4262
  $49 = $ReallocAsyncCtx + 12 | 0; //@line 4263
  HEAP32[$49 >> 2] = $42; //@line 4264
  $50 = $ReallocAsyncCtx + 16 | 0; //@line 4265
  HEAP32[$50 >> 2] = $8; //@line 4266
  $51 = $ReallocAsyncCtx + 20 | 0; //@line 4267
  HEAP32[$51 >> 2] = $10; //@line 4268
  $52 = $ReallocAsyncCtx + 24 | 0; //@line 4269
  HEAP32[$52 >> 2] = $12; //@line 4270
  $53 = $ReallocAsyncCtx + 28 | 0; //@line 4271
  HEAP32[$53 >> 2] = $14; //@line 4272
  $54 = $ReallocAsyncCtx + 32 | 0; //@line 4273
  HEAP32[$54 >> 2] = $16; //@line 4274
  $55 = $ReallocAsyncCtx + 36 | 0; //@line 4275
  HEAP32[$55 >> 2] = $18; //@line 4276
  $56 = $ReallocAsyncCtx + 40 | 0; //@line 4277
  HEAP32[$56 >> 2] = $20; //@line 4278
  $57 = $ReallocAsyncCtx + 44 | 0; //@line 4279
  HEAP32[$57 >> 2] = $22; //@line 4280
  $58 = $ReallocAsyncCtx + 48 | 0; //@line 4281
  HEAP32[$58 >> 2] = $24; //@line 4282
  $59 = $ReallocAsyncCtx + 52 | 0; //@line 4283
  HEAP32[$59 >> 2] = $26; //@line 4284
  $60 = $ReallocAsyncCtx + 56 | 0; //@line 4285
  HEAP32[$60 >> 2] = $28; //@line 4286
  $61 = $ReallocAsyncCtx + 60 | 0; //@line 4287
  $$expand_i1_val = $30 & 1; //@line 4288
  HEAP8[$61 >> 0] = $$expand_i1_val; //@line 4289
  $62 = $ReallocAsyncCtx + 64 | 0; //@line 4290
  HEAP32[$62 >> 2] = $32; //@line 4291
  $63 = $ReallocAsyncCtx + 68 | 0; //@line 4292
  HEAP32[$63 >> 2] = $$reg2mem$0; //@line 4293
  $64 = $ReallocAsyncCtx + 72 | 0; //@line 4294
  HEAP32[$64 >> 2] = $41; //@line 4295
  $65 = $ReallocAsyncCtx + 76 | 0; //@line 4296
  HEAP32[$65 >> 2] = $38; //@line 4297
  $66 = $ReallocAsyncCtx + 80 | 0; //@line 4298
  HEAP32[$66 >> 2] = $40; //@line 4299
  sp = STACKTOP; //@line 4300
  return;
 } else if ((label | 0) == 8) {
  $70 = $$06992$reg2mem$0 + 20 | 0; //@line 4304
  HEAP32[$70 >> 2] = (HEAP32[$70 >> 2] | 0) + $68; //@line 4307
  $73 = _equeue_tick() | 0; //@line 4308
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 4309
  _equeue_enqueue($18, $$06992$reg2mem$0, $73) | 0; //@line 4310
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 4313
   $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 4314
   HEAP32[$74 >> 2] = $2; //@line 4315
   $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 4316
   HEAP32[$75 >> 2] = $4; //@line 4317
   $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 4318
   HEAP32[$76 >> 2] = $$reg2mem$0; //@line 4319
   $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 4320
   HEAP32[$77 >> 2] = $8; //@line 4321
   $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 4322
   HEAP32[$78 >> 2] = $22; //@line 4323
   $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 4324
   HEAP32[$79 >> 2] = $10; //@line 4325
   $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 4326
   HEAP32[$80 >> 2] = $12; //@line 4327
   $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 4328
   HEAP32[$81 >> 2] = $14; //@line 4329
   $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 4330
   HEAP32[$82 >> 2] = $16; //@line 4331
   $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 4332
   HEAP32[$83 >> 2] = $18; //@line 4333
   $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 4334
   HEAP32[$84 >> 2] = $20; //@line 4335
   $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 4336
   HEAP32[$85 >> 2] = $24; //@line 4337
   $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 4338
   HEAP32[$86 >> 2] = $26; //@line 4339
   $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 4340
   HEAP32[$87 >> 2] = $28; //@line 4341
   $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 4342
   $$expand_i1_val31 = $30 & 1; //@line 4343
   HEAP8[$88 >> 0] = $$expand_i1_val31; //@line 4344
   $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 4345
   HEAP32[$89 >> 2] = $32; //@line 4346
   $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 4347
   HEAP32[$90 >> 2] = $38; //@line 4348
   $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 4349
   HEAP32[$91 >> 2] = $40; //@line 4350
   sp = STACKTOP; //@line 4351
   return;
  }
  ___async_unwind = 0; //@line 4354
  HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 4355
  $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 4356
  HEAP32[$74 >> 2] = $2; //@line 4357
  $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 4358
  HEAP32[$75 >> 2] = $4; //@line 4359
  $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 4360
  HEAP32[$76 >> 2] = $$reg2mem$0; //@line 4361
  $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 4362
  HEAP32[$77 >> 2] = $8; //@line 4363
  $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 4364
  HEAP32[$78 >> 2] = $22; //@line 4365
  $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 4366
  HEAP32[$79 >> 2] = $10; //@line 4367
  $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 4368
  HEAP32[$80 >> 2] = $12; //@line 4369
  $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 4370
  HEAP32[$81 >> 2] = $14; //@line 4371
  $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 4372
  HEAP32[$82 >> 2] = $16; //@line 4373
  $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 4374
  HEAP32[$83 >> 2] = $18; //@line 4375
  $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 4376
  HEAP32[$84 >> 2] = $20; //@line 4377
  $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 4378
  HEAP32[$85 >> 2] = $24; //@line 4379
  $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 4380
  HEAP32[$86 >> 2] = $26; //@line 4381
  $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 4382
  HEAP32[$87 >> 2] = $28; //@line 4383
  $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 4384
  $$expand_i1_val31 = $30 & 1; //@line 4385
  HEAP8[$88 >> 0] = $$expand_i1_val31; //@line 4386
  $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 4387
  HEAP32[$89 >> 2] = $32; //@line 4388
  $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 4389
  HEAP32[$90 >> 2] = $38; //@line 4390
  $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 4391
  HEAP32[$91 >> 2] = $40; //@line 4392
  sp = STACKTOP; //@line 4393
  return;
 } else if ((label | 0) == 12) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 4398
  FUNCTION_TABLE_vi[$102 & 255]($$06992$reg2mem$0 + 36 | 0); //@line 4399
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 30; //@line 4402
   $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 4403
   HEAP32[$105 >> 2] = $2; //@line 4404
   $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 4405
   HEAP32[$106 >> 2] = $4; //@line 4406
   $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 4407
   HEAP32[$107 >> 2] = $$reg2mem$0; //@line 4408
   $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 4409
   HEAP32[$108 >> 2] = $8; //@line 4410
   $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 4411
   HEAP32[$109 >> 2] = $10; //@line 4412
   $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 4413
   HEAP32[$110 >> 2] = $12; //@line 4414
   $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 4415
   HEAP32[$111 >> 2] = $14; //@line 4416
   $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 4417
   HEAP32[$112 >> 2] = $16; //@line 4418
   $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 4419
   HEAP32[$113 >> 2] = $18; //@line 4420
   $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 4421
   HEAP32[$114 >> 2] = $20; //@line 4422
   $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 4423
   HEAP32[$115 >> 2] = $22; //@line 4424
   $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 4425
   HEAP32[$116 >> 2] = $24; //@line 4426
   $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 4427
   HEAP32[$117 >> 2] = $26; //@line 4428
   $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 4429
   HEAP32[$118 >> 2] = $28; //@line 4430
   $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 4431
   $$expand_i1_val33 = $30 & 1; //@line 4432
   HEAP8[$119 >> 0] = $$expand_i1_val33; //@line 4433
   $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 4434
   HEAP32[$120 >> 2] = $32; //@line 4435
   $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 4436
   HEAP32[$121 >> 2] = $38; //@line 4437
   $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 4438
   HEAP32[$122 >> 2] = $40; //@line 4439
   $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 4440
   HEAP32[$123 >> 2] = $$06992$reg2mem$0; //@line 4441
   $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 4442
   HEAP32[$124 >> 2] = $$reg2mem24$0; //@line 4443
   sp = STACKTOP; //@line 4444
   return;
  }
  ___async_unwind = 0; //@line 4447
  HEAP32[$ReallocAsyncCtx2 >> 2] = 30; //@line 4448
  $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 4449
  HEAP32[$105 >> 2] = $2; //@line 4450
  $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 4451
  HEAP32[$106 >> 2] = $4; //@line 4452
  $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 4453
  HEAP32[$107 >> 2] = $$reg2mem$0; //@line 4454
  $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 4455
  HEAP32[$108 >> 2] = $8; //@line 4456
  $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 4457
  HEAP32[$109 >> 2] = $10; //@line 4458
  $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 4459
  HEAP32[$110 >> 2] = $12; //@line 4460
  $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 4461
  HEAP32[$111 >> 2] = $14; //@line 4462
  $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 4463
  HEAP32[$112 >> 2] = $16; //@line 4464
  $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 4465
  HEAP32[$113 >> 2] = $18; //@line 4466
  $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 4467
  HEAP32[$114 >> 2] = $20; //@line 4468
  $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 4469
  HEAP32[$115 >> 2] = $22; //@line 4470
  $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 4471
  HEAP32[$116 >> 2] = $24; //@line 4472
  $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 4473
  HEAP32[$117 >> 2] = $26; //@line 4474
  $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 4475
  HEAP32[$118 >> 2] = $28; //@line 4476
  $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 4477
  $$expand_i1_val33 = $30 & 1; //@line 4478
  HEAP8[$119 >> 0] = $$expand_i1_val33; //@line 4479
  $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 4480
  HEAP32[$120 >> 2] = $32; //@line 4481
  $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 4482
  HEAP32[$121 >> 2] = $38; //@line 4483
  $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 4484
  HEAP32[$122 >> 2] = $40; //@line 4485
  $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 4486
  HEAP32[$123 >> 2] = $$06992$reg2mem$0; //@line 4487
  $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 4488
  HEAP32[$124 >> 2] = $$reg2mem24$0; //@line 4489
  sp = STACKTOP; //@line 4490
  return;
 } else if ((label | 0) == 24) {
  $140 = _equeue_tick() | 0; //@line 4494
  if ($30) {
   $141 = $28 - $140 | 0; //@line 4496
   if (($141 | 0) < 1) {
    $143 = $18 + 40 | 0; //@line 4499
    if (HEAP32[$143 >> 2] | 0) {
     _equeue_mutex_lock($8); //@line 4503
     $146 = HEAP32[$143 >> 2] | 0; //@line 4504
     if ($146 | 0) {
      $148 = HEAP32[$12 >> 2] | 0; //@line 4507
      if ($148 | 0) {
       $151 = HEAP32[$18 + 44 >> 2] | 0; //@line 4511
       $154 = (HEAP32[$148 + 20 >> 2] | 0) - $140 | 0; //@line 4514
       $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 4518
       FUNCTION_TABLE_vii[$146 & 3]($151, $154 & ~($154 >> 31)); //@line 4519
       if (___async) {
        HEAP32[$ReallocAsyncCtx3 >> 2] = 31; //@line 4522
        $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 4523
        HEAP32[$158 >> 2] = $22; //@line 4524
        $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 4525
        HEAP32[$159 >> 2] = $8; //@line 4526
        $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 4527
        HEAP32[$160 >> 2] = $10; //@line 4528
        sp = STACKTOP; //@line 4529
        return;
       }
       ___async_unwind = 0; //@line 4532
       HEAP32[$ReallocAsyncCtx3 >> 2] = 31; //@line 4533
       $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 4534
       HEAP32[$158 >> 2] = $22; //@line 4535
       $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 4536
       HEAP32[$159 >> 2] = $8; //@line 4537
       $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 4538
       HEAP32[$160 >> 2] = $10; //@line 4539
       sp = STACKTOP; //@line 4540
       return;
      }
     }
     HEAP8[$22 >> 0] = 1; //@line 4544
     _equeue_mutex_unlock($8); //@line 4545
    }
    HEAP8[$10 >> 0] = 0; //@line 4547
    return;
   } else {
    $$067 = $141; //@line 4550
   }
  } else {
   $$067 = -1; //@line 4553
  }
  _equeue_mutex_lock($8); //@line 4555
  $161 = HEAP32[$12 >> 2] | 0; //@line 4556
  if (!$161) {
   $$2 = $$067; //@line 4559
  } else {
   $165 = (HEAP32[$161 + 20 >> 2] | 0) - $140 | 0; //@line 4563
   $168 = $165 & ~($165 >> 31); //@line 4566
   $$2 = $168 >>> 0 < $$067 >>> 0 ? $168 : $$067; //@line 4569
  }
  _equeue_mutex_unlock($8); //@line 4571
  _equeue_sema_wait($14, $$2) | 0; //@line 4572
  do {
   if (HEAP8[$10 >> 0] | 0) {
    _equeue_mutex_lock($8); //@line 4577
    if (!(HEAP8[$10 >> 0] | 0)) {
     _equeue_mutex_unlock($8); //@line 4581
     break;
    }
    HEAP8[$10 >> 0] = 0; //@line 4584
    _equeue_mutex_unlock($8); //@line 4585
    return;
   }
  } while (0);
  $174 = _equeue_tick() | 0; //@line 4589
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 4590
  _wait_ms(20); //@line 4591
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 32; //@line 4594
   $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 4595
   HEAP32[$175 >> 2] = $2; //@line 4596
   $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 4597
   HEAP32[$176 >> 2] = $4; //@line 4598
   $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 4599
   HEAP32[$177 >> 2] = $8; //@line 4600
   $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 4601
   HEAP32[$178 >> 2] = $22; //@line 4602
   $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 4603
   HEAP32[$179 >> 2] = $10; //@line 4604
   $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 4605
   HEAP32[$180 >> 2] = $12; //@line 4606
   $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 4607
   HEAP32[$181 >> 2] = $14; //@line 4608
   $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 4609
   HEAP32[$182 >> 2] = $16; //@line 4610
   $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 4611
   HEAP32[$183 >> 2] = $18; //@line 4612
   $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 4613
   HEAP32[$184 >> 2] = $174; //@line 4614
   $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 4615
   HEAP32[$185 >> 2] = $20; //@line 4616
   $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 4617
   HEAP32[$186 >> 2] = $24; //@line 4618
   $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 4619
   HEAP32[$187 >> 2] = $26; //@line 4620
   $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 4621
   HEAP32[$188 >> 2] = $28; //@line 4622
   $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 4623
   $$expand_i1_val35 = $30 & 1; //@line 4624
   HEAP8[$189 >> 0] = $$expand_i1_val35; //@line 4625
   $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 4626
   HEAP32[$190 >> 2] = $32; //@line 4627
   $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 4628
   HEAP32[$191 >> 2] = $38; //@line 4629
   $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 4630
   HEAP32[$192 >> 2] = $40; //@line 4631
   sp = STACKTOP; //@line 4632
   return;
  }
  ___async_unwind = 0; //@line 4635
  HEAP32[$ReallocAsyncCtx5 >> 2] = 32; //@line 4636
  $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 4637
  HEAP32[$175 >> 2] = $2; //@line 4638
  $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 4639
  HEAP32[$176 >> 2] = $4; //@line 4640
  $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 4641
  HEAP32[$177 >> 2] = $8; //@line 4642
  $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 4643
  HEAP32[$178 >> 2] = $22; //@line 4644
  $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 4645
  HEAP32[$179 >> 2] = $10; //@line 4646
  $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 4647
  HEAP32[$180 >> 2] = $12; //@line 4648
  $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 4649
  HEAP32[$181 >> 2] = $14; //@line 4650
  $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 4651
  HEAP32[$182 >> 2] = $16; //@line 4652
  $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 4653
  HEAP32[$183 >> 2] = $18; //@line 4654
  $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 4655
  HEAP32[$184 >> 2] = $174; //@line 4656
  $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 4657
  HEAP32[$185 >> 2] = $20; //@line 4658
  $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 4659
  HEAP32[$186 >> 2] = $24; //@line 4660
  $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 4661
  HEAP32[$187 >> 2] = $26; //@line 4662
  $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 4663
  HEAP32[$188 >> 2] = $28; //@line 4664
  $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 4665
  $$expand_i1_val35 = $30 & 1; //@line 4666
  HEAP8[$189 >> 0] = $$expand_i1_val35; //@line 4667
  $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 4668
  HEAP32[$190 >> 2] = $32; //@line 4669
  $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 4670
  HEAP32[$191 >> 2] = $38; //@line 4671
  $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 4672
  HEAP32[$192 >> 2] = $40; //@line 4673
  sp = STACKTOP; //@line 4674
  return;
 }
}
function _equeue_dispatch__async_cb_65($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$067 = 0, $$06992$reg2mem$0 = 0, $$06992$reg2mem$0$phi = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val31 = 0, $$expand_i1_val33 = 0, $$expand_i1_val35 = 0, $$reg2mem$0 = 0, $$reg2mem24$0 = 0, $$sink$in$i$i = 0, $10 = 0, $102 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $127 = 0, $128 = 0, $129 = 0, $131 = 0, $132 = 0, $14 = 0, $140 = 0, $141 = 0, $143 = 0, $146 = 0, $148 = 0, $151 = 0, $154 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $165 = 0, $168 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $190 = 0, $191 = 0, $192 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $4 = 0, $42 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $70 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4692
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4694
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4696
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4700
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4702
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4704
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4706
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4708
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4710
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 4712
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 4714
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 4716
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 4718
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 4720
 $30 = HEAP8[$0 + 60 >> 0] & 1; //@line 4723
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 4725
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 4727
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 4729
 $$06992$reg2mem$0 = HEAP32[$0 + 76 >> 2] | 0; //@line 4734
 $$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 4734
 $$reg2mem24$0 = HEAP32[$0 + 80 >> 2] | 0; //@line 4734
 while (1) {
  _equeue_mutex_lock($34); //@line 4736
  $125 = HEAP32[$32 >> 2] | 0; //@line 4737
  L4 : do {
   if (!$125) {
    $$02329$i$i = $32; //@line 4741
    label = 21; //@line 4742
   } else {
    $127 = HEAP32[$$06992$reg2mem$0 >> 2] | 0; //@line 4744
    $$025$i$i = $32; //@line 4745
    $129 = $125; //@line 4745
    while (1) {
     $128 = HEAP32[$129 >> 2] | 0; //@line 4747
     if ($128 >>> 0 >= $127 >>> 0) {
      break;
     }
     $131 = $129 + 8 | 0; //@line 4752
     $132 = HEAP32[$131 >> 2] | 0; //@line 4753
     if (!$132) {
      $$02329$i$i = $131; //@line 4756
      label = 21; //@line 4757
      break L4;
     } else {
      $$025$i$i = $131; //@line 4760
      $129 = $132; //@line 4760
     }
    }
    if (($128 | 0) == ($127 | 0)) {
     HEAP32[$$06992$reg2mem$0 + 12 >> 2] = $129; //@line 4766
     $$02330$i$i = $$025$i$i; //@line 4769
     $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 4769
    } else {
     $$02329$i$i = $$025$i$i; //@line 4771
     label = 21; //@line 4772
    }
   }
  } while (0);
  if ((label | 0) == 21) {
   label = 0; //@line 4777
   HEAP32[$$06992$reg2mem$0 + 12 >> 2] = 0; //@line 4779
   $$02330$i$i = $$02329$i$i; //@line 4780
   $$sink$in$i$i = $$02329$i$i; //@line 4780
  }
  HEAP32[$$reg2mem24$0 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 4783
  HEAP32[$$02330$i$i >> 2] = $$06992$reg2mem$0; //@line 4784
  _equeue_mutex_unlock($34); //@line 4785
  if (!$$reg2mem$0) {
   label = 24; //@line 4788
   break;
  }
  $$reg2mem24$0 = $$reg2mem$0 + 8 | 0; //@line 4791
  $42 = HEAP32[$$reg2mem24$0 >> 2] | 0; //@line 4792
  $44 = HEAP32[$$reg2mem$0 + 32 >> 2] | 0; //@line 4794
  if ($44 | 0) {
   label = 3; //@line 4797
   break;
  }
  $68 = HEAP32[$$reg2mem$0 + 24 >> 2] | 0; //@line 4801
  if (($68 | 0) > -1) {
   label = 7; //@line 4804
   break;
  }
  $92 = $$reg2mem$0 + 4 | 0; //@line 4808
  $93 = HEAP8[$92 >> 0] | 0; //@line 4809
  HEAP8[$92 >> 0] = (($93 + 1 & 255) << HEAP32[$36 >> 2] | 0) == 0 ? 1 : ($93 & 255) + 1 & 255; //@line 4818
  $102 = HEAP32[$$reg2mem$0 + 28 >> 2] | 0; //@line 4820
  if ($102 | 0) {
   label = 11; //@line 4825
   break;
  } else {
   $$06992$reg2mem$0$phi = $$reg2mem$0; //@line 4823
   $$reg2mem$0 = $42; //@line 4823
   $$06992$reg2mem$0 = $$06992$reg2mem$0$phi; //@line 4823
  }
 }
 if ((label | 0) == 3) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 4831
  FUNCTION_TABLE_vi[$44 & 255]($$reg2mem$0 + 36 | 0); //@line 4832
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 4835
   $47 = $ReallocAsyncCtx + 4 | 0; //@line 4836
   HEAP32[$47 >> 2] = $2; //@line 4837
   $48 = $ReallocAsyncCtx + 8 | 0; //@line 4838
   HEAP32[$48 >> 2] = $4; //@line 4839
   $49 = $ReallocAsyncCtx + 12 | 0; //@line 4840
   HEAP32[$49 >> 2] = $42; //@line 4841
   $50 = $ReallocAsyncCtx + 16 | 0; //@line 4842
   HEAP32[$50 >> 2] = $8; //@line 4843
   $51 = $ReallocAsyncCtx + 20 | 0; //@line 4844
   HEAP32[$51 >> 2] = $10; //@line 4845
   $52 = $ReallocAsyncCtx + 24 | 0; //@line 4846
   HEAP32[$52 >> 2] = $12; //@line 4847
   $53 = $ReallocAsyncCtx + 28 | 0; //@line 4848
   HEAP32[$53 >> 2] = $14; //@line 4849
   $54 = $ReallocAsyncCtx + 32 | 0; //@line 4850
   HEAP32[$54 >> 2] = $16; //@line 4851
   $55 = $ReallocAsyncCtx + 36 | 0; //@line 4852
   HEAP32[$55 >> 2] = $18; //@line 4853
   $56 = $ReallocAsyncCtx + 40 | 0; //@line 4854
   HEAP32[$56 >> 2] = $20; //@line 4855
   $57 = $ReallocAsyncCtx + 44 | 0; //@line 4856
   HEAP32[$57 >> 2] = $22; //@line 4857
   $58 = $ReallocAsyncCtx + 48 | 0; //@line 4858
   HEAP32[$58 >> 2] = $24; //@line 4859
   $59 = $ReallocAsyncCtx + 52 | 0; //@line 4860
   HEAP32[$59 >> 2] = $26; //@line 4861
   $60 = $ReallocAsyncCtx + 56 | 0; //@line 4862
   HEAP32[$60 >> 2] = $28; //@line 4863
   $61 = $ReallocAsyncCtx + 60 | 0; //@line 4864
   $$expand_i1_val = $30 & 1; //@line 4865
   HEAP8[$61 >> 0] = $$expand_i1_val; //@line 4866
   $62 = $ReallocAsyncCtx + 64 | 0; //@line 4867
   HEAP32[$62 >> 2] = $32; //@line 4868
   $63 = $ReallocAsyncCtx + 68 | 0; //@line 4869
   HEAP32[$63 >> 2] = $$reg2mem$0; //@line 4870
   $64 = $ReallocAsyncCtx + 72 | 0; //@line 4871
   HEAP32[$64 >> 2] = $$reg2mem24$0; //@line 4872
   $65 = $ReallocAsyncCtx + 76 | 0; //@line 4873
   HEAP32[$65 >> 2] = $34; //@line 4874
   $66 = $ReallocAsyncCtx + 80 | 0; //@line 4875
   HEAP32[$66 >> 2] = $36; //@line 4876
   sp = STACKTOP; //@line 4877
   return;
  }
  ___async_unwind = 0; //@line 4880
  HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 4881
  $47 = $ReallocAsyncCtx + 4 | 0; //@line 4882
  HEAP32[$47 >> 2] = $2; //@line 4883
  $48 = $ReallocAsyncCtx + 8 | 0; //@line 4884
  HEAP32[$48 >> 2] = $4; //@line 4885
  $49 = $ReallocAsyncCtx + 12 | 0; //@line 4886
  HEAP32[$49 >> 2] = $42; //@line 4887
  $50 = $ReallocAsyncCtx + 16 | 0; //@line 4888
  HEAP32[$50 >> 2] = $8; //@line 4889
  $51 = $ReallocAsyncCtx + 20 | 0; //@line 4890
  HEAP32[$51 >> 2] = $10; //@line 4891
  $52 = $ReallocAsyncCtx + 24 | 0; //@line 4892
  HEAP32[$52 >> 2] = $12; //@line 4893
  $53 = $ReallocAsyncCtx + 28 | 0; //@line 4894
  HEAP32[$53 >> 2] = $14; //@line 4895
  $54 = $ReallocAsyncCtx + 32 | 0; //@line 4896
  HEAP32[$54 >> 2] = $16; //@line 4897
  $55 = $ReallocAsyncCtx + 36 | 0; //@line 4898
  HEAP32[$55 >> 2] = $18; //@line 4899
  $56 = $ReallocAsyncCtx + 40 | 0; //@line 4900
  HEAP32[$56 >> 2] = $20; //@line 4901
  $57 = $ReallocAsyncCtx + 44 | 0; //@line 4902
  HEAP32[$57 >> 2] = $22; //@line 4903
  $58 = $ReallocAsyncCtx + 48 | 0; //@line 4904
  HEAP32[$58 >> 2] = $24; //@line 4905
  $59 = $ReallocAsyncCtx + 52 | 0; //@line 4906
  HEAP32[$59 >> 2] = $26; //@line 4907
  $60 = $ReallocAsyncCtx + 56 | 0; //@line 4908
  HEAP32[$60 >> 2] = $28; //@line 4909
  $61 = $ReallocAsyncCtx + 60 | 0; //@line 4910
  $$expand_i1_val = $30 & 1; //@line 4911
  HEAP8[$61 >> 0] = $$expand_i1_val; //@line 4912
  $62 = $ReallocAsyncCtx + 64 | 0; //@line 4913
  HEAP32[$62 >> 2] = $32; //@line 4914
  $63 = $ReallocAsyncCtx + 68 | 0; //@line 4915
  HEAP32[$63 >> 2] = $$reg2mem$0; //@line 4916
  $64 = $ReallocAsyncCtx + 72 | 0; //@line 4917
  HEAP32[$64 >> 2] = $$reg2mem24$0; //@line 4918
  $65 = $ReallocAsyncCtx + 76 | 0; //@line 4919
  HEAP32[$65 >> 2] = $34; //@line 4920
  $66 = $ReallocAsyncCtx + 80 | 0; //@line 4921
  HEAP32[$66 >> 2] = $36; //@line 4922
  sp = STACKTOP; //@line 4923
  return;
 } else if ((label | 0) == 7) {
  $70 = $$reg2mem$0 + 20 | 0; //@line 4927
  HEAP32[$70 >> 2] = (HEAP32[$70 >> 2] | 0) + $68; //@line 4930
  $73 = _equeue_tick() | 0; //@line 4931
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 4932
  _equeue_enqueue($18, $$reg2mem$0, $73) | 0; //@line 4933
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 4936
   $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 4937
   HEAP32[$74 >> 2] = $2; //@line 4938
   $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 4939
   HEAP32[$75 >> 2] = $4; //@line 4940
   $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 4941
   HEAP32[$76 >> 2] = $42; //@line 4942
   $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 4943
   HEAP32[$77 >> 2] = $8; //@line 4944
   $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 4945
   HEAP32[$78 >> 2] = $22; //@line 4946
   $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 4947
   HEAP32[$79 >> 2] = $10; //@line 4948
   $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 4949
   HEAP32[$80 >> 2] = $12; //@line 4950
   $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 4951
   HEAP32[$81 >> 2] = $14; //@line 4952
   $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 4953
   HEAP32[$82 >> 2] = $16; //@line 4954
   $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 4955
   HEAP32[$83 >> 2] = $18; //@line 4956
   $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 4957
   HEAP32[$84 >> 2] = $20; //@line 4958
   $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 4959
   HEAP32[$85 >> 2] = $24; //@line 4960
   $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 4961
   HEAP32[$86 >> 2] = $26; //@line 4962
   $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 4963
   HEAP32[$87 >> 2] = $28; //@line 4964
   $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 4965
   $$expand_i1_val31 = $30 & 1; //@line 4966
   HEAP8[$88 >> 0] = $$expand_i1_val31; //@line 4967
   $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 4968
   HEAP32[$89 >> 2] = $32; //@line 4969
   $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 4970
   HEAP32[$90 >> 2] = $34; //@line 4971
   $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 4972
   HEAP32[$91 >> 2] = $36; //@line 4973
   sp = STACKTOP; //@line 4974
   return;
  }
  ___async_unwind = 0; //@line 4977
  HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 4978
  $74 = $ReallocAsyncCtx4 + 4 | 0; //@line 4979
  HEAP32[$74 >> 2] = $2; //@line 4980
  $75 = $ReallocAsyncCtx4 + 8 | 0; //@line 4981
  HEAP32[$75 >> 2] = $4; //@line 4982
  $76 = $ReallocAsyncCtx4 + 12 | 0; //@line 4983
  HEAP32[$76 >> 2] = $42; //@line 4984
  $77 = $ReallocAsyncCtx4 + 16 | 0; //@line 4985
  HEAP32[$77 >> 2] = $8; //@line 4986
  $78 = $ReallocAsyncCtx4 + 20 | 0; //@line 4987
  HEAP32[$78 >> 2] = $22; //@line 4988
  $79 = $ReallocAsyncCtx4 + 24 | 0; //@line 4989
  HEAP32[$79 >> 2] = $10; //@line 4990
  $80 = $ReallocAsyncCtx4 + 28 | 0; //@line 4991
  HEAP32[$80 >> 2] = $12; //@line 4992
  $81 = $ReallocAsyncCtx4 + 32 | 0; //@line 4993
  HEAP32[$81 >> 2] = $14; //@line 4994
  $82 = $ReallocAsyncCtx4 + 36 | 0; //@line 4995
  HEAP32[$82 >> 2] = $16; //@line 4996
  $83 = $ReallocAsyncCtx4 + 40 | 0; //@line 4997
  HEAP32[$83 >> 2] = $18; //@line 4998
  $84 = $ReallocAsyncCtx4 + 44 | 0; //@line 4999
  HEAP32[$84 >> 2] = $20; //@line 5000
  $85 = $ReallocAsyncCtx4 + 48 | 0; //@line 5001
  HEAP32[$85 >> 2] = $24; //@line 5002
  $86 = $ReallocAsyncCtx4 + 52 | 0; //@line 5003
  HEAP32[$86 >> 2] = $26; //@line 5004
  $87 = $ReallocAsyncCtx4 + 56 | 0; //@line 5005
  HEAP32[$87 >> 2] = $28; //@line 5006
  $88 = $ReallocAsyncCtx4 + 60 | 0; //@line 5007
  $$expand_i1_val31 = $30 & 1; //@line 5008
  HEAP8[$88 >> 0] = $$expand_i1_val31; //@line 5009
  $89 = $ReallocAsyncCtx4 + 64 | 0; //@line 5010
  HEAP32[$89 >> 2] = $32; //@line 5011
  $90 = $ReallocAsyncCtx4 + 68 | 0; //@line 5012
  HEAP32[$90 >> 2] = $34; //@line 5013
  $91 = $ReallocAsyncCtx4 + 72 | 0; //@line 5014
  HEAP32[$91 >> 2] = $36; //@line 5015
  sp = STACKTOP; //@line 5016
  return;
 } else if ((label | 0) == 11) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 5021
  FUNCTION_TABLE_vi[$102 & 255]($$reg2mem$0 + 36 | 0); //@line 5022
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 30; //@line 5025
   $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 5026
   HEAP32[$105 >> 2] = $2; //@line 5027
   $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 5028
   HEAP32[$106 >> 2] = $4; //@line 5029
   $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 5030
   HEAP32[$107 >> 2] = $42; //@line 5031
   $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 5032
   HEAP32[$108 >> 2] = $8; //@line 5033
   $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 5034
   HEAP32[$109 >> 2] = $10; //@line 5035
   $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 5036
   HEAP32[$110 >> 2] = $12; //@line 5037
   $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 5038
   HEAP32[$111 >> 2] = $14; //@line 5039
   $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 5040
   HEAP32[$112 >> 2] = $16; //@line 5041
   $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 5042
   HEAP32[$113 >> 2] = $18; //@line 5043
   $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 5044
   HEAP32[$114 >> 2] = $20; //@line 5045
   $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 5046
   HEAP32[$115 >> 2] = $22; //@line 5047
   $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 5048
   HEAP32[$116 >> 2] = $24; //@line 5049
   $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 5050
   HEAP32[$117 >> 2] = $26; //@line 5051
   $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 5052
   HEAP32[$118 >> 2] = $28; //@line 5053
   $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 5054
   $$expand_i1_val33 = $30 & 1; //@line 5055
   HEAP8[$119 >> 0] = $$expand_i1_val33; //@line 5056
   $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 5057
   HEAP32[$120 >> 2] = $32; //@line 5058
   $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 5059
   HEAP32[$121 >> 2] = $34; //@line 5060
   $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 5061
   HEAP32[$122 >> 2] = $36; //@line 5062
   $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 5063
   HEAP32[$123 >> 2] = $$reg2mem$0; //@line 5064
   $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 5065
   HEAP32[$124 >> 2] = $$reg2mem24$0; //@line 5066
   sp = STACKTOP; //@line 5067
   return;
  }
  ___async_unwind = 0; //@line 5070
  HEAP32[$ReallocAsyncCtx2 >> 2] = 30; //@line 5071
  $105 = $ReallocAsyncCtx2 + 4 | 0; //@line 5072
  HEAP32[$105 >> 2] = $2; //@line 5073
  $106 = $ReallocAsyncCtx2 + 8 | 0; //@line 5074
  HEAP32[$106 >> 2] = $4; //@line 5075
  $107 = $ReallocAsyncCtx2 + 12 | 0; //@line 5076
  HEAP32[$107 >> 2] = $42; //@line 5077
  $108 = $ReallocAsyncCtx2 + 16 | 0; //@line 5078
  HEAP32[$108 >> 2] = $8; //@line 5079
  $109 = $ReallocAsyncCtx2 + 20 | 0; //@line 5080
  HEAP32[$109 >> 2] = $10; //@line 5081
  $110 = $ReallocAsyncCtx2 + 24 | 0; //@line 5082
  HEAP32[$110 >> 2] = $12; //@line 5083
  $111 = $ReallocAsyncCtx2 + 28 | 0; //@line 5084
  HEAP32[$111 >> 2] = $14; //@line 5085
  $112 = $ReallocAsyncCtx2 + 32 | 0; //@line 5086
  HEAP32[$112 >> 2] = $16; //@line 5087
  $113 = $ReallocAsyncCtx2 + 36 | 0; //@line 5088
  HEAP32[$113 >> 2] = $18; //@line 5089
  $114 = $ReallocAsyncCtx2 + 40 | 0; //@line 5090
  HEAP32[$114 >> 2] = $20; //@line 5091
  $115 = $ReallocAsyncCtx2 + 44 | 0; //@line 5092
  HEAP32[$115 >> 2] = $22; //@line 5093
  $116 = $ReallocAsyncCtx2 + 48 | 0; //@line 5094
  HEAP32[$116 >> 2] = $24; //@line 5095
  $117 = $ReallocAsyncCtx2 + 52 | 0; //@line 5096
  HEAP32[$117 >> 2] = $26; //@line 5097
  $118 = $ReallocAsyncCtx2 + 56 | 0; //@line 5098
  HEAP32[$118 >> 2] = $28; //@line 5099
  $119 = $ReallocAsyncCtx2 + 60 | 0; //@line 5100
  $$expand_i1_val33 = $30 & 1; //@line 5101
  HEAP8[$119 >> 0] = $$expand_i1_val33; //@line 5102
  $120 = $ReallocAsyncCtx2 + 64 | 0; //@line 5103
  HEAP32[$120 >> 2] = $32; //@line 5104
  $121 = $ReallocAsyncCtx2 + 68 | 0; //@line 5105
  HEAP32[$121 >> 2] = $34; //@line 5106
  $122 = $ReallocAsyncCtx2 + 72 | 0; //@line 5107
  HEAP32[$122 >> 2] = $36; //@line 5108
  $123 = $ReallocAsyncCtx2 + 76 | 0; //@line 5109
  HEAP32[$123 >> 2] = $$reg2mem$0; //@line 5110
  $124 = $ReallocAsyncCtx2 + 80 | 0; //@line 5111
  HEAP32[$124 >> 2] = $$reg2mem24$0; //@line 5112
  sp = STACKTOP; //@line 5113
  return;
 } else if ((label | 0) == 24) {
  $140 = _equeue_tick() | 0; //@line 5117
  if ($30) {
   $141 = $28 - $140 | 0; //@line 5119
   if (($141 | 0) < 1) {
    $143 = $18 + 40 | 0; //@line 5122
    if (HEAP32[$143 >> 2] | 0) {
     _equeue_mutex_lock($8); //@line 5126
     $146 = HEAP32[$143 >> 2] | 0; //@line 5127
     if ($146 | 0) {
      $148 = HEAP32[$12 >> 2] | 0; //@line 5130
      if ($148 | 0) {
       $151 = HEAP32[$18 + 44 >> 2] | 0; //@line 5134
       $154 = (HEAP32[$148 + 20 >> 2] | 0) - $140 | 0; //@line 5137
       $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 5141
       FUNCTION_TABLE_vii[$146 & 3]($151, $154 & ~($154 >> 31)); //@line 5142
       if (___async) {
        HEAP32[$ReallocAsyncCtx3 >> 2] = 31; //@line 5145
        $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 5146
        HEAP32[$158 >> 2] = $22; //@line 5147
        $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 5148
        HEAP32[$159 >> 2] = $8; //@line 5149
        $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 5150
        HEAP32[$160 >> 2] = $10; //@line 5151
        sp = STACKTOP; //@line 5152
        return;
       }
       ___async_unwind = 0; //@line 5155
       HEAP32[$ReallocAsyncCtx3 >> 2] = 31; //@line 5156
       $158 = $ReallocAsyncCtx3 + 4 | 0; //@line 5157
       HEAP32[$158 >> 2] = $22; //@line 5158
       $159 = $ReallocAsyncCtx3 + 8 | 0; //@line 5159
       HEAP32[$159 >> 2] = $8; //@line 5160
       $160 = $ReallocAsyncCtx3 + 12 | 0; //@line 5161
       HEAP32[$160 >> 2] = $10; //@line 5162
       sp = STACKTOP; //@line 5163
       return;
      }
     }
     HEAP8[$22 >> 0] = 1; //@line 5167
     _equeue_mutex_unlock($8); //@line 5168
    }
    HEAP8[$10 >> 0] = 0; //@line 5170
    return;
   } else {
    $$067 = $141; //@line 5173
   }
  } else {
   $$067 = -1; //@line 5176
  }
  _equeue_mutex_lock($8); //@line 5178
  $161 = HEAP32[$12 >> 2] | 0; //@line 5179
  if (!$161) {
   $$2 = $$067; //@line 5182
  } else {
   $165 = (HEAP32[$161 + 20 >> 2] | 0) - $140 | 0; //@line 5186
   $168 = $165 & ~($165 >> 31); //@line 5189
   $$2 = $168 >>> 0 < $$067 >>> 0 ? $168 : $$067; //@line 5192
  }
  _equeue_mutex_unlock($8); //@line 5194
  _equeue_sema_wait($14, $$2) | 0; //@line 5195
  do {
   if (HEAP8[$10 >> 0] | 0) {
    _equeue_mutex_lock($8); //@line 5200
    if (!(HEAP8[$10 >> 0] | 0)) {
     _equeue_mutex_unlock($8); //@line 5204
     break;
    }
    HEAP8[$10 >> 0] = 0; //@line 5207
    _equeue_mutex_unlock($8); //@line 5208
    return;
   }
  } while (0);
  $174 = _equeue_tick() | 0; //@line 5212
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 5213
  _wait_ms(20); //@line 5214
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 32; //@line 5217
   $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 5218
   HEAP32[$175 >> 2] = $2; //@line 5219
   $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 5220
   HEAP32[$176 >> 2] = $4; //@line 5221
   $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 5222
   HEAP32[$177 >> 2] = $8; //@line 5223
   $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 5224
   HEAP32[$178 >> 2] = $22; //@line 5225
   $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 5226
   HEAP32[$179 >> 2] = $10; //@line 5227
   $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 5228
   HEAP32[$180 >> 2] = $12; //@line 5229
   $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 5230
   HEAP32[$181 >> 2] = $14; //@line 5231
   $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 5232
   HEAP32[$182 >> 2] = $16; //@line 5233
   $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 5234
   HEAP32[$183 >> 2] = $18; //@line 5235
   $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 5236
   HEAP32[$184 >> 2] = $174; //@line 5237
   $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 5238
   HEAP32[$185 >> 2] = $20; //@line 5239
   $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 5240
   HEAP32[$186 >> 2] = $24; //@line 5241
   $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 5242
   HEAP32[$187 >> 2] = $26; //@line 5243
   $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 5244
   HEAP32[$188 >> 2] = $28; //@line 5245
   $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 5246
   $$expand_i1_val35 = $30 & 1; //@line 5247
   HEAP8[$189 >> 0] = $$expand_i1_val35; //@line 5248
   $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 5249
   HEAP32[$190 >> 2] = $32; //@line 5250
   $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 5251
   HEAP32[$191 >> 2] = $34; //@line 5252
   $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 5253
   HEAP32[$192 >> 2] = $36; //@line 5254
   sp = STACKTOP; //@line 5255
   return;
  }
  ___async_unwind = 0; //@line 5258
  HEAP32[$ReallocAsyncCtx5 >> 2] = 32; //@line 5259
  $175 = $ReallocAsyncCtx5 + 4 | 0; //@line 5260
  HEAP32[$175 >> 2] = $2; //@line 5261
  $176 = $ReallocAsyncCtx5 + 8 | 0; //@line 5262
  HEAP32[$176 >> 2] = $4; //@line 5263
  $177 = $ReallocAsyncCtx5 + 12 | 0; //@line 5264
  HEAP32[$177 >> 2] = $8; //@line 5265
  $178 = $ReallocAsyncCtx5 + 16 | 0; //@line 5266
  HEAP32[$178 >> 2] = $22; //@line 5267
  $179 = $ReallocAsyncCtx5 + 20 | 0; //@line 5268
  HEAP32[$179 >> 2] = $10; //@line 5269
  $180 = $ReallocAsyncCtx5 + 24 | 0; //@line 5270
  HEAP32[$180 >> 2] = $12; //@line 5271
  $181 = $ReallocAsyncCtx5 + 28 | 0; //@line 5272
  HEAP32[$181 >> 2] = $14; //@line 5273
  $182 = $ReallocAsyncCtx5 + 32 | 0; //@line 5274
  HEAP32[$182 >> 2] = $16; //@line 5275
  $183 = $ReallocAsyncCtx5 + 36 | 0; //@line 5276
  HEAP32[$183 >> 2] = $18; //@line 5277
  $184 = $ReallocAsyncCtx5 + 40 | 0; //@line 5278
  HEAP32[$184 >> 2] = $174; //@line 5279
  $185 = $ReallocAsyncCtx5 + 44 | 0; //@line 5280
  HEAP32[$185 >> 2] = $20; //@line 5281
  $186 = $ReallocAsyncCtx5 + 48 | 0; //@line 5282
  HEAP32[$186 >> 2] = $24; //@line 5283
  $187 = $ReallocAsyncCtx5 + 52 | 0; //@line 5284
  HEAP32[$187 >> 2] = $26; //@line 5285
  $188 = $ReallocAsyncCtx5 + 56 | 0; //@line 5286
  HEAP32[$188 >> 2] = $28; //@line 5287
  $189 = $ReallocAsyncCtx5 + 60 | 0; //@line 5288
  $$expand_i1_val35 = $30 & 1; //@line 5289
  HEAP8[$189 >> 0] = $$expand_i1_val35; //@line 5290
  $190 = $ReallocAsyncCtx5 + 64 | 0; //@line 5291
  HEAP32[$190 >> 2] = $32; //@line 5292
  $191 = $ReallocAsyncCtx5 + 68 | 0; //@line 5293
  HEAP32[$191 >> 2] = $34; //@line 5294
  $192 = $ReallocAsyncCtx5 + 72 | 0; //@line 5295
  HEAP32[$192 >> 2] = $36; //@line 5296
  sp = STACKTOP; //@line 5297
  return;
 }
}
function _equeue_dispatch__async_cb_67($0) {
 $0 = $0 | 0;
 var $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$067 = 0, $$2 = 0, $$expand_i1_val = 0, $$expand_i1_val12 = 0, $$expand_i1_val14 = 0, $$expand_i1_val16 = 0, $$reg2mem$0 = 0, $$sink$in$i$i = 0, $10 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $123 = 0, $124 = 0, $125 = 0, $127 = 0, $128 = 0, $136 = 0, $137 = 0, $139 = 0, $14 = 0, $142 = 0, $144 = 0, $147 = 0, $150 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $16 = 0, $161 = 0, $164 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $40 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $64 = 0, $66 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $98 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5329
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5331
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5333
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5337
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5339
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5341
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 5343
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 5345
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 5347
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 5349
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 5351
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 5353
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 5355
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 5357
 $30 = HEAP8[$0 + 60 >> 0] & 1; //@line 5360
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 5362
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 5364
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 5366
 $$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 5367
 while (1) {
  if (!$$reg2mem$0) {
   label = 24; //@line 5371
   break;
  }
  $37 = $$reg2mem$0 + 8 | 0; //@line 5374
  $38 = HEAP32[$37 >> 2] | 0; //@line 5375
  $40 = HEAP32[$$reg2mem$0 + 32 >> 2] | 0; //@line 5377
  if ($40 | 0) {
   label = 3; //@line 5380
   break;
  }
  $64 = HEAP32[$$reg2mem$0 + 24 >> 2] | 0; //@line 5384
  if (($64 | 0) > -1) {
   label = 7; //@line 5387
   break;
  }
  $88 = $$reg2mem$0 + 4 | 0; //@line 5391
  $89 = HEAP8[$88 >> 0] | 0; //@line 5392
  HEAP8[$88 >> 0] = (($89 + 1 & 255) << HEAP32[$36 >> 2] | 0) == 0 ? 1 : ($89 & 255) + 1 & 255; //@line 5401
  $98 = HEAP32[$$reg2mem$0 + 28 >> 2] | 0; //@line 5403
  if ($98 | 0) {
   label = 12; //@line 5406
   break;
  }
  _equeue_mutex_lock($34); //@line 5409
  $121 = HEAP32[$32 >> 2] | 0; //@line 5410
  L8 : do {
   if (!$121) {
    $$02329$i$i = $32; //@line 5414
    label = 21; //@line 5415
   } else {
    $123 = HEAP32[$$reg2mem$0 >> 2] | 0; //@line 5417
    $$025$i$i = $32; //@line 5418
    $125 = $121; //@line 5418
    while (1) {
     $124 = HEAP32[$125 >> 2] | 0; //@line 5420
     if ($124 >>> 0 >= $123 >>> 0) {
      break;
     }
     $127 = $125 + 8 | 0; //@line 5425
     $128 = HEAP32[$127 >> 2] | 0; //@line 5426
     if (!$128) {
      $$02329$i$i = $127; //@line 5429
      label = 21; //@line 5430
      break L8;
     } else {
      $$025$i$i = $127; //@line 5433
      $125 = $128; //@line 5433
     }
    }
    if (($124 | 0) == ($123 | 0)) {
     HEAP32[$$reg2mem$0 + 12 >> 2] = $125; //@line 5439
     $$02330$i$i = $$025$i$i; //@line 5442
     $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 5442
    } else {
     $$02329$i$i = $$025$i$i; //@line 5444
     label = 21; //@line 5445
    }
   }
  } while (0);
  if ((label | 0) == 21) {
   label = 0; //@line 5450
   HEAP32[$$reg2mem$0 + 12 >> 2] = 0; //@line 5452
   $$02330$i$i = $$02329$i$i; //@line 5453
   $$sink$in$i$i = $$02329$i$i; //@line 5453
  }
  HEAP32[$37 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 5456
  HEAP32[$$02330$i$i >> 2] = $$reg2mem$0; //@line 5457
  _equeue_mutex_unlock($34); //@line 5458
  $$reg2mem$0 = $38; //@line 5459
 }
 if ((label | 0) == 3) {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(84) | 0; //@line 5463
  FUNCTION_TABLE_vi[$40 & 255]($$reg2mem$0 + 36 | 0); //@line 5464
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 5467
   $43 = $ReallocAsyncCtx + 4 | 0; //@line 5468
   HEAP32[$43 >> 2] = $2; //@line 5469
   $44 = $ReallocAsyncCtx + 8 | 0; //@line 5470
   HEAP32[$44 >> 2] = $4; //@line 5471
   $45 = $ReallocAsyncCtx + 12 | 0; //@line 5472
   HEAP32[$45 >> 2] = $38; //@line 5473
   $46 = $ReallocAsyncCtx + 16 | 0; //@line 5474
   HEAP32[$46 >> 2] = $8; //@line 5475
   $47 = $ReallocAsyncCtx + 20 | 0; //@line 5476
   HEAP32[$47 >> 2] = $12; //@line 5477
   $48 = $ReallocAsyncCtx + 24 | 0; //@line 5478
   HEAP32[$48 >> 2] = $14; //@line 5479
   $49 = $ReallocAsyncCtx + 28 | 0; //@line 5480
   HEAP32[$49 >> 2] = $16; //@line 5481
   $50 = $ReallocAsyncCtx + 32 | 0; //@line 5482
   HEAP32[$50 >> 2] = $18; //@line 5483
   $51 = $ReallocAsyncCtx + 36 | 0; //@line 5484
   HEAP32[$51 >> 2] = $20; //@line 5485
   $52 = $ReallocAsyncCtx + 40 | 0; //@line 5486
   HEAP32[$52 >> 2] = $22; //@line 5487
   $53 = $ReallocAsyncCtx + 44 | 0; //@line 5488
   HEAP32[$53 >> 2] = $10; //@line 5489
   $54 = $ReallocAsyncCtx + 48 | 0; //@line 5490
   HEAP32[$54 >> 2] = $24; //@line 5491
   $55 = $ReallocAsyncCtx + 52 | 0; //@line 5492
   HEAP32[$55 >> 2] = $26; //@line 5493
   $56 = $ReallocAsyncCtx + 56 | 0; //@line 5494
   HEAP32[$56 >> 2] = $28; //@line 5495
   $57 = $ReallocAsyncCtx + 60 | 0; //@line 5496
   $$expand_i1_val = $30 & 1; //@line 5497
   HEAP8[$57 >> 0] = $$expand_i1_val; //@line 5498
   $58 = $ReallocAsyncCtx + 64 | 0; //@line 5499
   HEAP32[$58 >> 2] = $32; //@line 5500
   $59 = $ReallocAsyncCtx + 68 | 0; //@line 5501
   HEAP32[$59 >> 2] = $$reg2mem$0; //@line 5502
   $60 = $ReallocAsyncCtx + 72 | 0; //@line 5503
   HEAP32[$60 >> 2] = $37; //@line 5504
   $61 = $ReallocAsyncCtx + 76 | 0; //@line 5505
   HEAP32[$61 >> 2] = $34; //@line 5506
   $62 = $ReallocAsyncCtx + 80 | 0; //@line 5507
   HEAP32[$62 >> 2] = $36; //@line 5508
   sp = STACKTOP; //@line 5509
   return;
  }
  ___async_unwind = 0; //@line 5512
  HEAP32[$ReallocAsyncCtx >> 2] = 28; //@line 5513
  $43 = $ReallocAsyncCtx + 4 | 0; //@line 5514
  HEAP32[$43 >> 2] = $2; //@line 5515
  $44 = $ReallocAsyncCtx + 8 | 0; //@line 5516
  HEAP32[$44 >> 2] = $4; //@line 5517
  $45 = $ReallocAsyncCtx + 12 | 0; //@line 5518
  HEAP32[$45 >> 2] = $38; //@line 5519
  $46 = $ReallocAsyncCtx + 16 | 0; //@line 5520
  HEAP32[$46 >> 2] = $8; //@line 5521
  $47 = $ReallocAsyncCtx + 20 | 0; //@line 5522
  HEAP32[$47 >> 2] = $12; //@line 5523
  $48 = $ReallocAsyncCtx + 24 | 0; //@line 5524
  HEAP32[$48 >> 2] = $14; //@line 5525
  $49 = $ReallocAsyncCtx + 28 | 0; //@line 5526
  HEAP32[$49 >> 2] = $16; //@line 5527
  $50 = $ReallocAsyncCtx + 32 | 0; //@line 5528
  HEAP32[$50 >> 2] = $18; //@line 5529
  $51 = $ReallocAsyncCtx + 36 | 0; //@line 5530
  HEAP32[$51 >> 2] = $20; //@line 5531
  $52 = $ReallocAsyncCtx + 40 | 0; //@line 5532
  HEAP32[$52 >> 2] = $22; //@line 5533
  $53 = $ReallocAsyncCtx + 44 | 0; //@line 5534
  HEAP32[$53 >> 2] = $10; //@line 5535
  $54 = $ReallocAsyncCtx + 48 | 0; //@line 5536
  HEAP32[$54 >> 2] = $24; //@line 5537
  $55 = $ReallocAsyncCtx + 52 | 0; //@line 5538
  HEAP32[$55 >> 2] = $26; //@line 5539
  $56 = $ReallocAsyncCtx + 56 | 0; //@line 5540
  HEAP32[$56 >> 2] = $28; //@line 5541
  $57 = $ReallocAsyncCtx + 60 | 0; //@line 5542
  $$expand_i1_val = $30 & 1; //@line 5543
  HEAP8[$57 >> 0] = $$expand_i1_val; //@line 5544
  $58 = $ReallocAsyncCtx + 64 | 0; //@line 5545
  HEAP32[$58 >> 2] = $32; //@line 5546
  $59 = $ReallocAsyncCtx + 68 | 0; //@line 5547
  HEAP32[$59 >> 2] = $$reg2mem$0; //@line 5548
  $60 = $ReallocAsyncCtx + 72 | 0; //@line 5549
  HEAP32[$60 >> 2] = $37; //@line 5550
  $61 = $ReallocAsyncCtx + 76 | 0; //@line 5551
  HEAP32[$61 >> 2] = $34; //@line 5552
  $62 = $ReallocAsyncCtx + 80 | 0; //@line 5553
  HEAP32[$62 >> 2] = $36; //@line 5554
  sp = STACKTOP; //@line 5555
  return;
 } else if ((label | 0) == 7) {
  $66 = $$reg2mem$0 + 20 | 0; //@line 5559
  HEAP32[$66 >> 2] = (HEAP32[$66 >> 2] | 0) + $64; //@line 5562
  $69 = _equeue_tick() | 0; //@line 5563
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(76) | 0; //@line 5564
  _equeue_enqueue($20, $$reg2mem$0, $69) | 0; //@line 5565
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 5568
   $70 = $ReallocAsyncCtx4 + 4 | 0; //@line 5569
   HEAP32[$70 >> 2] = $2; //@line 5570
   $71 = $ReallocAsyncCtx4 + 8 | 0; //@line 5571
   HEAP32[$71 >> 2] = $4; //@line 5572
   $72 = $ReallocAsyncCtx4 + 12 | 0; //@line 5573
   HEAP32[$72 >> 2] = $38; //@line 5574
   $73 = $ReallocAsyncCtx4 + 16 | 0; //@line 5575
   HEAP32[$73 >> 2] = $8; //@line 5576
   $74 = $ReallocAsyncCtx4 + 20 | 0; //@line 5577
   HEAP32[$74 >> 2] = $10; //@line 5578
   $75 = $ReallocAsyncCtx4 + 24 | 0; //@line 5579
   HEAP32[$75 >> 2] = $12; //@line 5580
   $76 = $ReallocAsyncCtx4 + 28 | 0; //@line 5581
   HEAP32[$76 >> 2] = $14; //@line 5582
   $77 = $ReallocAsyncCtx4 + 32 | 0; //@line 5583
   HEAP32[$77 >> 2] = $16; //@line 5584
   $78 = $ReallocAsyncCtx4 + 36 | 0; //@line 5585
   HEAP32[$78 >> 2] = $18; //@line 5586
   $79 = $ReallocAsyncCtx4 + 40 | 0; //@line 5587
   HEAP32[$79 >> 2] = $20; //@line 5588
   $80 = $ReallocAsyncCtx4 + 44 | 0; //@line 5589
   HEAP32[$80 >> 2] = $22; //@line 5590
   $81 = $ReallocAsyncCtx4 + 48 | 0; //@line 5591
   HEAP32[$81 >> 2] = $24; //@line 5592
   $82 = $ReallocAsyncCtx4 + 52 | 0; //@line 5593
   HEAP32[$82 >> 2] = $26; //@line 5594
   $83 = $ReallocAsyncCtx4 + 56 | 0; //@line 5595
   HEAP32[$83 >> 2] = $28; //@line 5596
   $84 = $ReallocAsyncCtx4 + 60 | 0; //@line 5597
   $$expand_i1_val12 = $30 & 1; //@line 5598
   HEAP8[$84 >> 0] = $$expand_i1_val12; //@line 5599
   $85 = $ReallocAsyncCtx4 + 64 | 0; //@line 5600
   HEAP32[$85 >> 2] = $32; //@line 5601
   $86 = $ReallocAsyncCtx4 + 68 | 0; //@line 5602
   HEAP32[$86 >> 2] = $34; //@line 5603
   $87 = $ReallocAsyncCtx4 + 72 | 0; //@line 5604
   HEAP32[$87 >> 2] = $36; //@line 5605
   sp = STACKTOP; //@line 5606
   return;
  }
  ___async_unwind = 0; //@line 5609
  HEAP32[$ReallocAsyncCtx4 >> 2] = 29; //@line 5610
  $70 = $ReallocAsyncCtx4 + 4 | 0; //@line 5611
  HEAP32[$70 >> 2] = $2; //@line 5612
  $71 = $ReallocAsyncCtx4 + 8 | 0; //@line 5613
  HEAP32[$71 >> 2] = $4; //@line 5614
  $72 = $ReallocAsyncCtx4 + 12 | 0; //@line 5615
  HEAP32[$72 >> 2] = $38; //@line 5616
  $73 = $ReallocAsyncCtx4 + 16 | 0; //@line 5617
  HEAP32[$73 >> 2] = $8; //@line 5618
  $74 = $ReallocAsyncCtx4 + 20 | 0; //@line 5619
  HEAP32[$74 >> 2] = $10; //@line 5620
  $75 = $ReallocAsyncCtx4 + 24 | 0; //@line 5621
  HEAP32[$75 >> 2] = $12; //@line 5622
  $76 = $ReallocAsyncCtx4 + 28 | 0; //@line 5623
  HEAP32[$76 >> 2] = $14; //@line 5624
  $77 = $ReallocAsyncCtx4 + 32 | 0; //@line 5625
  HEAP32[$77 >> 2] = $16; //@line 5626
  $78 = $ReallocAsyncCtx4 + 36 | 0; //@line 5627
  HEAP32[$78 >> 2] = $18; //@line 5628
  $79 = $ReallocAsyncCtx4 + 40 | 0; //@line 5629
  HEAP32[$79 >> 2] = $20; //@line 5630
  $80 = $ReallocAsyncCtx4 + 44 | 0; //@line 5631
  HEAP32[$80 >> 2] = $22; //@line 5632
  $81 = $ReallocAsyncCtx4 + 48 | 0; //@line 5633
  HEAP32[$81 >> 2] = $24; //@line 5634
  $82 = $ReallocAsyncCtx4 + 52 | 0; //@line 5635
  HEAP32[$82 >> 2] = $26; //@line 5636
  $83 = $ReallocAsyncCtx4 + 56 | 0; //@line 5637
  HEAP32[$83 >> 2] = $28; //@line 5638
  $84 = $ReallocAsyncCtx4 + 60 | 0; //@line 5639
  $$expand_i1_val12 = $30 & 1; //@line 5640
  HEAP8[$84 >> 0] = $$expand_i1_val12; //@line 5641
  $85 = $ReallocAsyncCtx4 + 64 | 0; //@line 5642
  HEAP32[$85 >> 2] = $32; //@line 5643
  $86 = $ReallocAsyncCtx4 + 68 | 0; //@line 5644
  HEAP32[$86 >> 2] = $34; //@line 5645
  $87 = $ReallocAsyncCtx4 + 72 | 0; //@line 5646
  HEAP32[$87 >> 2] = $36; //@line 5647
  sp = STACKTOP; //@line 5648
  return;
 } else if ((label | 0) == 12) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(84) | 0; //@line 5653
  FUNCTION_TABLE_vi[$98 & 255]($$reg2mem$0 + 36 | 0); //@line 5654
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 30; //@line 5657
   $101 = $ReallocAsyncCtx2 + 4 | 0; //@line 5658
   HEAP32[$101 >> 2] = $2; //@line 5659
   $102 = $ReallocAsyncCtx2 + 8 | 0; //@line 5660
   HEAP32[$102 >> 2] = $4; //@line 5661
   $103 = $ReallocAsyncCtx2 + 12 | 0; //@line 5662
   HEAP32[$103 >> 2] = $38; //@line 5663
   $104 = $ReallocAsyncCtx2 + 16 | 0; //@line 5664
   HEAP32[$104 >> 2] = $8; //@line 5665
   $105 = $ReallocAsyncCtx2 + 20 | 0; //@line 5666
   HEAP32[$105 >> 2] = $12; //@line 5667
   $106 = $ReallocAsyncCtx2 + 24 | 0; //@line 5668
   HEAP32[$106 >> 2] = $14; //@line 5669
   $107 = $ReallocAsyncCtx2 + 28 | 0; //@line 5670
   HEAP32[$107 >> 2] = $16; //@line 5671
   $108 = $ReallocAsyncCtx2 + 32 | 0; //@line 5672
   HEAP32[$108 >> 2] = $18; //@line 5673
   $109 = $ReallocAsyncCtx2 + 36 | 0; //@line 5674
   HEAP32[$109 >> 2] = $20; //@line 5675
   $110 = $ReallocAsyncCtx2 + 40 | 0; //@line 5676
   HEAP32[$110 >> 2] = $22; //@line 5677
   $111 = $ReallocAsyncCtx2 + 44 | 0; //@line 5678
   HEAP32[$111 >> 2] = $10; //@line 5679
   $112 = $ReallocAsyncCtx2 + 48 | 0; //@line 5680
   HEAP32[$112 >> 2] = $24; //@line 5681
   $113 = $ReallocAsyncCtx2 + 52 | 0; //@line 5682
   HEAP32[$113 >> 2] = $26; //@line 5683
   $114 = $ReallocAsyncCtx2 + 56 | 0; //@line 5684
   HEAP32[$114 >> 2] = $28; //@line 5685
   $115 = $ReallocAsyncCtx2 + 60 | 0; //@line 5686
   $$expand_i1_val14 = $30 & 1; //@line 5687
   HEAP8[$115 >> 0] = $$expand_i1_val14; //@line 5688
   $116 = $ReallocAsyncCtx2 + 64 | 0; //@line 5689
   HEAP32[$116 >> 2] = $32; //@line 5690
   $117 = $ReallocAsyncCtx2 + 68 | 0; //@line 5691
   HEAP32[$117 >> 2] = $34; //@line 5692
   $118 = $ReallocAsyncCtx2 + 72 | 0; //@line 5693
   HEAP32[$118 >> 2] = $36; //@line 5694
   $119 = $ReallocAsyncCtx2 + 76 | 0; //@line 5695
   HEAP32[$119 >> 2] = $$reg2mem$0; //@line 5696
   $120 = $ReallocAsyncCtx2 + 80 | 0; //@line 5697
   HEAP32[$120 >> 2] = $37; //@line 5698
   sp = STACKTOP; //@line 5699
   return;
  }
  ___async_unwind = 0; //@line 5702
  HEAP32[$ReallocAsyncCtx2 >> 2] = 30; //@line 5703
  $101 = $ReallocAsyncCtx2 + 4 | 0; //@line 5704
  HEAP32[$101 >> 2] = $2; //@line 5705
  $102 = $ReallocAsyncCtx2 + 8 | 0; //@line 5706
  HEAP32[$102 >> 2] = $4; //@line 5707
  $103 = $ReallocAsyncCtx2 + 12 | 0; //@line 5708
  HEAP32[$103 >> 2] = $38; //@line 5709
  $104 = $ReallocAsyncCtx2 + 16 | 0; //@line 5710
  HEAP32[$104 >> 2] = $8; //@line 5711
  $105 = $ReallocAsyncCtx2 + 20 | 0; //@line 5712
  HEAP32[$105 >> 2] = $12; //@line 5713
  $106 = $ReallocAsyncCtx2 + 24 | 0; //@line 5714
  HEAP32[$106 >> 2] = $14; //@line 5715
  $107 = $ReallocAsyncCtx2 + 28 | 0; //@line 5716
  HEAP32[$107 >> 2] = $16; //@line 5717
  $108 = $ReallocAsyncCtx2 + 32 | 0; //@line 5718
  HEAP32[$108 >> 2] = $18; //@line 5719
  $109 = $ReallocAsyncCtx2 + 36 | 0; //@line 5720
  HEAP32[$109 >> 2] = $20; //@line 5721
  $110 = $ReallocAsyncCtx2 + 40 | 0; //@line 5722
  HEAP32[$110 >> 2] = $22; //@line 5723
  $111 = $ReallocAsyncCtx2 + 44 | 0; //@line 5724
  HEAP32[$111 >> 2] = $10; //@line 5725
  $112 = $ReallocAsyncCtx2 + 48 | 0; //@line 5726
  HEAP32[$112 >> 2] = $24; //@line 5727
  $113 = $ReallocAsyncCtx2 + 52 | 0; //@line 5728
  HEAP32[$113 >> 2] = $26; //@line 5729
  $114 = $ReallocAsyncCtx2 + 56 | 0; //@line 5730
  HEAP32[$114 >> 2] = $28; //@line 5731
  $115 = $ReallocAsyncCtx2 + 60 | 0; //@line 5732
  $$expand_i1_val14 = $30 & 1; //@line 5733
  HEAP8[$115 >> 0] = $$expand_i1_val14; //@line 5734
  $116 = $ReallocAsyncCtx2 + 64 | 0; //@line 5735
  HEAP32[$116 >> 2] = $32; //@line 5736
  $117 = $ReallocAsyncCtx2 + 68 | 0; //@line 5737
  HEAP32[$117 >> 2] = $34; //@line 5738
  $118 = $ReallocAsyncCtx2 + 72 | 0; //@line 5739
  HEAP32[$118 >> 2] = $36; //@line 5740
  $119 = $ReallocAsyncCtx2 + 76 | 0; //@line 5741
  HEAP32[$119 >> 2] = $$reg2mem$0; //@line 5742
  $120 = $ReallocAsyncCtx2 + 80 | 0; //@line 5743
  HEAP32[$120 >> 2] = $37; //@line 5744
  sp = STACKTOP; //@line 5745
  return;
 } else if ((label | 0) == 24) {
  $136 = _equeue_tick() | 0; //@line 5749
  if ($30) {
   $137 = $28 - $136 | 0; //@line 5751
   if (($137 | 0) < 1) {
    $139 = $20 + 40 | 0; //@line 5754
    if (HEAP32[$139 >> 2] | 0) {
     _equeue_mutex_lock($8); //@line 5758
     $142 = HEAP32[$139 >> 2] | 0; //@line 5759
     if ($142 | 0) {
      $144 = HEAP32[$14 >> 2] | 0; //@line 5762
      if ($144 | 0) {
       $147 = HEAP32[$20 + 44 >> 2] | 0; //@line 5766
       $150 = (HEAP32[$144 + 20 >> 2] | 0) - $136 | 0; //@line 5769
       $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 5773
       FUNCTION_TABLE_vii[$142 & 3]($147, $150 & ~($150 >> 31)); //@line 5774
       if (___async) {
        HEAP32[$ReallocAsyncCtx3 >> 2] = 31; //@line 5777
        $154 = $ReallocAsyncCtx3 + 4 | 0; //@line 5778
        HEAP32[$154 >> 2] = $10; //@line 5779
        $155 = $ReallocAsyncCtx3 + 8 | 0; //@line 5780
        HEAP32[$155 >> 2] = $8; //@line 5781
        $156 = $ReallocAsyncCtx3 + 12 | 0; //@line 5782
        HEAP32[$156 >> 2] = $12; //@line 5783
        sp = STACKTOP; //@line 5784
        return;
       }
       ___async_unwind = 0; //@line 5787
       HEAP32[$ReallocAsyncCtx3 >> 2] = 31; //@line 5788
       $154 = $ReallocAsyncCtx3 + 4 | 0; //@line 5789
       HEAP32[$154 >> 2] = $10; //@line 5790
       $155 = $ReallocAsyncCtx3 + 8 | 0; //@line 5791
       HEAP32[$155 >> 2] = $8; //@line 5792
       $156 = $ReallocAsyncCtx3 + 12 | 0; //@line 5793
       HEAP32[$156 >> 2] = $12; //@line 5794
       sp = STACKTOP; //@line 5795
       return;
      }
     }
     HEAP8[$10 >> 0] = 1; //@line 5799
     _equeue_mutex_unlock($8); //@line 5800
    }
    HEAP8[$12 >> 0] = 0; //@line 5802
    return;
   } else {
    $$067 = $137; //@line 5805
   }
  } else {
   $$067 = -1; //@line 5808
  }
  _equeue_mutex_lock($8); //@line 5810
  $157 = HEAP32[$14 >> 2] | 0; //@line 5811
  if (!$157) {
   $$2 = $$067; //@line 5814
  } else {
   $161 = (HEAP32[$157 + 20 >> 2] | 0) - $136 | 0; //@line 5818
   $164 = $161 & ~($161 >> 31); //@line 5821
   $$2 = $164 >>> 0 < $$067 >>> 0 ? $164 : $$067; //@line 5824
  }
  _equeue_mutex_unlock($8); //@line 5826
  _equeue_sema_wait($16, $$2) | 0; //@line 5827
  do {
   if (HEAP8[$12 >> 0] | 0) {
    _equeue_mutex_lock($8); //@line 5832
    if (!(HEAP8[$12 >> 0] | 0)) {
     _equeue_mutex_unlock($8); //@line 5836
     break;
    }
    HEAP8[$12 >> 0] = 0; //@line 5839
    _equeue_mutex_unlock($8); //@line 5840
    return;
   }
  } while (0);
  $170 = _equeue_tick() | 0; //@line 5844
  $ReallocAsyncCtx5 = _emscripten_realloc_async_context(76) | 0; //@line 5845
  _wait_ms(20); //@line 5846
  if (___async) {
   HEAP32[$ReallocAsyncCtx5 >> 2] = 32; //@line 5849
   $171 = $ReallocAsyncCtx5 + 4 | 0; //@line 5850
   HEAP32[$171 >> 2] = $2; //@line 5851
   $172 = $ReallocAsyncCtx5 + 8 | 0; //@line 5852
   HEAP32[$172 >> 2] = $4; //@line 5853
   $173 = $ReallocAsyncCtx5 + 12 | 0; //@line 5854
   HEAP32[$173 >> 2] = $8; //@line 5855
   $174 = $ReallocAsyncCtx5 + 16 | 0; //@line 5856
   HEAP32[$174 >> 2] = $10; //@line 5857
   $175 = $ReallocAsyncCtx5 + 20 | 0; //@line 5858
   HEAP32[$175 >> 2] = $12; //@line 5859
   $176 = $ReallocAsyncCtx5 + 24 | 0; //@line 5860
   HEAP32[$176 >> 2] = $14; //@line 5861
   $177 = $ReallocAsyncCtx5 + 28 | 0; //@line 5862
   HEAP32[$177 >> 2] = $16; //@line 5863
   $178 = $ReallocAsyncCtx5 + 32 | 0; //@line 5864
   HEAP32[$178 >> 2] = $18; //@line 5865
   $179 = $ReallocAsyncCtx5 + 36 | 0; //@line 5866
   HEAP32[$179 >> 2] = $20; //@line 5867
   $180 = $ReallocAsyncCtx5 + 40 | 0; //@line 5868
   HEAP32[$180 >> 2] = $170; //@line 5869
   $181 = $ReallocAsyncCtx5 + 44 | 0; //@line 5870
   HEAP32[$181 >> 2] = $22; //@line 5871
   $182 = $ReallocAsyncCtx5 + 48 | 0; //@line 5872
   HEAP32[$182 >> 2] = $24; //@line 5873
   $183 = $ReallocAsyncCtx5 + 52 | 0; //@line 5874
   HEAP32[$183 >> 2] = $26; //@line 5875
   $184 = $ReallocAsyncCtx5 + 56 | 0; //@line 5876
   HEAP32[$184 >> 2] = $28; //@line 5877
   $185 = $ReallocAsyncCtx5 + 60 | 0; //@line 5878
   $$expand_i1_val16 = $30 & 1; //@line 5879
   HEAP8[$185 >> 0] = $$expand_i1_val16; //@line 5880
   $186 = $ReallocAsyncCtx5 + 64 | 0; //@line 5881
   HEAP32[$186 >> 2] = $32; //@line 5882
   $187 = $ReallocAsyncCtx5 + 68 | 0; //@line 5883
   HEAP32[$187 >> 2] = $34; //@line 5884
   $188 = $ReallocAsyncCtx5 + 72 | 0; //@line 5885
   HEAP32[$188 >> 2] = $36; //@line 5886
   sp = STACKTOP; //@line 5887
   return;
  }
  ___async_unwind = 0; //@line 5890
  HEAP32[$ReallocAsyncCtx5 >> 2] = 32; //@line 5891
  $171 = $ReallocAsyncCtx5 + 4 | 0; //@line 5892
  HEAP32[$171 >> 2] = $2; //@line 5893
  $172 = $ReallocAsyncCtx5 + 8 | 0; //@line 5894
  HEAP32[$172 >> 2] = $4; //@line 5895
  $173 = $ReallocAsyncCtx5 + 12 | 0; //@line 5896
  HEAP32[$173 >> 2] = $8; //@line 5897
  $174 = $ReallocAsyncCtx5 + 16 | 0; //@line 5898
  HEAP32[$174 >> 2] = $10; //@line 5899
  $175 = $ReallocAsyncCtx5 + 20 | 0; //@line 5900
  HEAP32[$175 >> 2] = $12; //@line 5901
  $176 = $ReallocAsyncCtx5 + 24 | 0; //@line 5902
  HEAP32[$176 >> 2] = $14; //@line 5903
  $177 = $ReallocAsyncCtx5 + 28 | 0; //@line 5904
  HEAP32[$177 >> 2] = $16; //@line 5905
  $178 = $ReallocAsyncCtx5 + 32 | 0; //@line 5906
  HEAP32[$178 >> 2] = $18; //@line 5907
  $179 = $ReallocAsyncCtx5 + 36 | 0; //@line 5908
  HEAP32[$179 >> 2] = $20; //@line 5909
  $180 = $ReallocAsyncCtx5 + 40 | 0; //@line 5910
  HEAP32[$180 >> 2] = $170; //@line 5911
  $181 = $ReallocAsyncCtx5 + 44 | 0; //@line 5912
  HEAP32[$181 >> 2] = $22; //@line 5913
  $182 = $ReallocAsyncCtx5 + 48 | 0; //@line 5914
  HEAP32[$182 >> 2] = $24; //@line 5915
  $183 = $ReallocAsyncCtx5 + 52 | 0; //@line 5916
  HEAP32[$183 >> 2] = $26; //@line 5917
  $184 = $ReallocAsyncCtx5 + 56 | 0; //@line 5918
  HEAP32[$184 >> 2] = $28; //@line 5919
  $185 = $ReallocAsyncCtx5 + 60 | 0; //@line 5920
  $$expand_i1_val16 = $30 & 1; //@line 5921
  HEAP8[$185 >> 0] = $$expand_i1_val16; //@line 5922
  $186 = $ReallocAsyncCtx5 + 64 | 0; //@line 5923
  HEAP32[$186 >> 2] = $32; //@line 5924
  $187 = $ReallocAsyncCtx5 + 68 | 0; //@line 5925
  HEAP32[$187 >> 2] = $34; //@line 5926
  $188 = $ReallocAsyncCtx5 + 72 | 0; //@line 5927
  HEAP32[$188 >> 2] = $36; //@line 5928
  sp = STACKTOP; //@line 5929
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
 sp = STACKTOP; //@line 8187
 STACKTOP = STACKTOP + 64 | 0; //@line 8188
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 8188
 $5 = sp + 16 | 0; //@line 8189
 $6 = sp; //@line 8190
 $7 = sp + 24 | 0; //@line 8191
 $8 = sp + 8 | 0; //@line 8192
 $9 = sp + 20 | 0; //@line 8193
 HEAP32[$5 >> 2] = $1; //@line 8194
 $10 = ($0 | 0) != 0; //@line 8195
 $11 = $7 + 40 | 0; //@line 8196
 $12 = $11; //@line 8197
 $13 = $7 + 39 | 0; //@line 8198
 $14 = $8 + 4 | 0; //@line 8199
 $$0243 = 0; //@line 8200
 $$0247 = 0; //@line 8200
 $$0269 = 0; //@line 8200
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 8209
     $$1248 = -1; //@line 8210
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 8214
     break;
    }
   } else {
    $$1248 = $$0247; //@line 8218
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 8221
  $21 = HEAP8[$20 >> 0] | 0; //@line 8222
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 8225
   break;
  } else {
   $23 = $21; //@line 8228
   $25 = $20; //@line 8228
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 8233
     $27 = $25; //@line 8233
     label = 9; //@line 8234
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 8239
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 8246
   HEAP32[$5 >> 2] = $24; //@line 8247
   $23 = HEAP8[$24 >> 0] | 0; //@line 8249
   $25 = $24; //@line 8249
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 8254
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 8259
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 8262
     $27 = $27 + 2 | 0; //@line 8263
     HEAP32[$5 >> 2] = $27; //@line 8264
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 8271
      break;
     } else {
      $$0249303 = $30; //@line 8268
      label = 9; //@line 8269
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 8279
  if ($10) {
   _out_670($0, $20, $36); //@line 8281
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 8285
   $$0247 = $$1248; //@line 8285
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 8293
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 8294
  if ($43) {
   $$0253 = -1; //@line 8296
   $$1270 = $$0269; //@line 8296
   $$sink = 1; //@line 8296
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 8306
    $$1270 = 1; //@line 8306
    $$sink = 3; //@line 8306
   } else {
    $$0253 = -1; //@line 8308
    $$1270 = $$0269; //@line 8308
    $$sink = 1; //@line 8308
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 8311
  HEAP32[$5 >> 2] = $51; //@line 8312
  $52 = HEAP8[$51 >> 0] | 0; //@line 8313
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 8315
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 8322
   $$lcssa291 = $52; //@line 8322
   $$lcssa292 = $51; //@line 8322
  } else {
   $$0262309 = 0; //@line 8324
   $60 = $52; //@line 8324
   $65 = $51; //@line 8324
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 8329
    $64 = $65 + 1 | 0; //@line 8330
    HEAP32[$5 >> 2] = $64; //@line 8331
    $66 = HEAP8[$64 >> 0] | 0; //@line 8332
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 8334
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 8341
     $$lcssa291 = $66; //@line 8341
     $$lcssa292 = $64; //@line 8341
     break;
    } else {
     $$0262309 = $63; //@line 8344
     $60 = $66; //@line 8344
     $65 = $64; //@line 8344
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 8356
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 8358
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 8363
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 8368
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 8380
     $$2271 = 1; //@line 8380
     $storemerge274 = $79 + 3 | 0; //@line 8380
    } else {
     label = 23; //@line 8382
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 8386
    if ($$1270 | 0) {
     $$0 = -1; //@line 8389
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8404
     $106 = HEAP32[$105 >> 2] | 0; //@line 8405
     HEAP32[$2 >> 2] = $105 + 4; //@line 8407
     $363 = $106; //@line 8408
    } else {
     $363 = 0; //@line 8410
    }
    $$0259 = $363; //@line 8414
    $$2271 = 0; //@line 8414
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 8414
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 8416
   $109 = ($$0259 | 0) < 0; //@line 8417
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 8422
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 8422
   $$3272 = $$2271; //@line 8422
   $115 = $storemerge274; //@line 8422
  } else {
   $112 = _getint_671($5) | 0; //@line 8424
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 8427
    break;
   }
   $$1260 = $112; //@line 8431
   $$1263 = $$0262$lcssa; //@line 8431
   $$3272 = $$1270; //@line 8431
   $115 = HEAP32[$5 >> 2] | 0; //@line 8431
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 8442
     $156 = _getint_671($5) | 0; //@line 8443
     $$0254 = $156; //@line 8445
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 8445
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 8454
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 8459
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 8464
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 8471
      $144 = $125 + 4 | 0; //@line 8475
      HEAP32[$5 >> 2] = $144; //@line 8476
      $$0254 = $140; //@line 8477
      $$pre345 = $144; //@line 8477
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 8483
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8498
     $152 = HEAP32[$151 >> 2] | 0; //@line 8499
     HEAP32[$2 >> 2] = $151 + 4; //@line 8501
     $364 = $152; //@line 8502
    } else {
     $364 = 0; //@line 8504
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 8507
    HEAP32[$5 >> 2] = $154; //@line 8508
    $$0254 = $364; //@line 8509
    $$pre345 = $154; //@line 8509
   } else {
    $$0254 = -1; //@line 8511
    $$pre345 = $115; //@line 8511
   }
  } while (0);
  $$0252 = 0; //@line 8514
  $158 = $$pre345; //@line 8514
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 8521
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 8524
   HEAP32[$5 >> 2] = $158; //@line 8525
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (1898 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 8530
   $168 = $167 & 255; //@line 8531
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 8535
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 8542
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 8546
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 8550
     break L1;
    } else {
     label = 50; //@line 8553
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 8558
     $176 = $3 + ($$0253 << 3) | 0; //@line 8560
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 8565
     $182 = $6; //@line 8566
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 8568
     HEAP32[$182 + 4 >> 2] = $181; //@line 8571
     label = 50; //@line 8572
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 8576
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 8579
    $187 = HEAP32[$5 >> 2] | 0; //@line 8581
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 8585
   if ($10) {
    $187 = $158; //@line 8587
   } else {
    $$0243 = 0; //@line 8589
    $$0247 = $$1248; //@line 8589
    $$0269 = $$3272; //@line 8589
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 8595
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 8601
  $196 = $$1263 & -65537; //@line 8604
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 8605
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 8613
       $$0243 = 0; //@line 8614
       $$0247 = $$1248; //@line 8614
       $$0269 = $$3272; //@line 8614
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 8620
       $$0243 = 0; //@line 8621
       $$0247 = $$1248; //@line 8621
       $$0269 = $$3272; //@line 8621
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 8629
       HEAP32[$208 >> 2] = $$1248; //@line 8631
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 8634
       $$0243 = 0; //@line 8635
       $$0247 = $$1248; //@line 8635
       $$0269 = $$3272; //@line 8635
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 8642
       $$0243 = 0; //@line 8643
       $$0247 = $$1248; //@line 8643
       $$0269 = $$3272; //@line 8643
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 8650
       $$0243 = 0; //@line 8651
       $$0247 = $$1248; //@line 8651
       $$0269 = $$3272; //@line 8651
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 8657
       $$0243 = 0; //@line 8658
       $$0247 = $$1248; //@line 8658
       $$0269 = $$3272; //@line 8658
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 8666
       HEAP32[$220 >> 2] = $$1248; //@line 8668
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 8671
       $$0243 = 0; //@line 8672
       $$0247 = $$1248; //@line 8672
       $$0269 = $$3272; //@line 8672
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 8677
       $$0247 = $$1248; //@line 8677
       $$0269 = $$3272; //@line 8677
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 8687
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 8687
     $$3265 = $$1263$ | 8; //@line 8687
     label = 62; //@line 8688
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 8692
     $$1255 = $$0254; //@line 8692
     $$3265 = $$1263$; //@line 8692
     label = 62; //@line 8693
     break;
    }
   case 111:
    {
     $242 = $6; //@line 8697
     $244 = HEAP32[$242 >> 2] | 0; //@line 8699
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 8702
     $248 = _fmt_o($244, $247, $11) | 0; //@line 8703
     $252 = $12 - $248 | 0; //@line 8707
     $$0228 = $248; //@line 8712
     $$1233 = 0; //@line 8712
     $$1238 = 2362; //@line 8712
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 8712
     $$4266 = $$1263$; //@line 8712
     $281 = $244; //@line 8712
     $283 = $247; //@line 8712
     label = 68; //@line 8713
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 8717
     $258 = HEAP32[$256 >> 2] | 0; //@line 8719
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 8722
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 8725
      $264 = tempRet0; //@line 8726
      $265 = $6; //@line 8727
      HEAP32[$265 >> 2] = $263; //@line 8729
      HEAP32[$265 + 4 >> 2] = $264; //@line 8732
      $$0232 = 1; //@line 8733
      $$0237 = 2362; //@line 8733
      $275 = $263; //@line 8733
      $276 = $264; //@line 8733
      label = 67; //@line 8734
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 8746
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 2362 : 2364 : 2363; //@line 8746
      $275 = $258; //@line 8746
      $276 = $261; //@line 8746
      label = 67; //@line 8747
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 8753
     $$0232 = 0; //@line 8759
     $$0237 = 2362; //@line 8759
     $275 = HEAP32[$197 >> 2] | 0; //@line 8759
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 8759
     label = 67; //@line 8760
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 8771
     $$2 = $13; //@line 8772
     $$2234 = 0; //@line 8772
     $$2239 = 2362; //@line 8772
     $$2251 = $11; //@line 8772
     $$5 = 1; //@line 8772
     $$6268 = $196; //@line 8772
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 8779
     label = 72; //@line 8780
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 8784
     $$1 = $302 | 0 ? $302 : 2372; //@line 8787
     label = 72; //@line 8788
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 8798
     HEAP32[$14 >> 2] = 0; //@line 8799
     HEAP32[$6 >> 2] = $8; //@line 8800
     $$4258354 = -1; //@line 8801
     $365 = $8; //@line 8801
     label = 76; //@line 8802
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 8806
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 8809
      $$0240$lcssa356 = 0; //@line 8810
      label = 85; //@line 8811
     } else {
      $$4258354 = $$0254; //@line 8813
      $365 = $$pre348; //@line 8813
      label = 76; //@line 8814
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 8821
     $$0247 = $$1248; //@line 8821
     $$0269 = $$3272; //@line 8821
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 8826
     $$2234 = 0; //@line 8826
     $$2239 = 2362; //@line 8826
     $$2251 = $11; //@line 8826
     $$5 = $$0254; //@line 8826
     $$6268 = $$1263$; //@line 8826
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 8832
    $227 = $6; //@line 8833
    $229 = HEAP32[$227 >> 2] | 0; //@line 8835
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 8838
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 8840
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 8846
    $$0228 = $234; //@line 8851
    $$1233 = $or$cond278 ? 0 : 2; //@line 8851
    $$1238 = $or$cond278 ? 2362 : 2362 + ($$1236 >> 4) | 0; //@line 8851
    $$2256 = $$1255; //@line 8851
    $$4266 = $$3265; //@line 8851
    $281 = $229; //@line 8851
    $283 = $232; //@line 8851
    label = 68; //@line 8852
   } else if ((label | 0) == 67) {
    label = 0; //@line 8855
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 8857
    $$1233 = $$0232; //@line 8857
    $$1238 = $$0237; //@line 8857
    $$2256 = $$0254; //@line 8857
    $$4266 = $$1263$; //@line 8857
    $281 = $275; //@line 8857
    $283 = $276; //@line 8857
    label = 68; //@line 8858
   } else if ((label | 0) == 72) {
    label = 0; //@line 8861
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 8862
    $306 = ($305 | 0) == 0; //@line 8863
    $$2 = $$1; //@line 8870
    $$2234 = 0; //@line 8870
    $$2239 = 2362; //@line 8870
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 8870
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 8870
    $$6268 = $196; //@line 8870
   } else if ((label | 0) == 76) {
    label = 0; //@line 8873
    $$0229316 = $365; //@line 8874
    $$0240315 = 0; //@line 8874
    $$1244314 = 0; //@line 8874
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 8876
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 8879
      $$2245 = $$1244314; //@line 8879
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 8882
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 8888
      $$2245 = $320; //@line 8888
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 8892
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 8895
      $$0240315 = $325; //@line 8895
      $$1244314 = $320; //@line 8895
     } else {
      $$0240$lcssa = $325; //@line 8897
      $$2245 = $320; //@line 8897
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 8903
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 8906
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 8909
     label = 85; //@line 8910
    } else {
     $$1230327 = $365; //@line 8912
     $$1241326 = 0; //@line 8912
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 8914
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 8917
       label = 85; //@line 8918
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 8921
      $$1241326 = $331 + $$1241326 | 0; //@line 8922
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 8925
       label = 85; //@line 8926
       break L97;
      }
      _out_670($0, $9, $331); //@line 8930
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 8935
       label = 85; //@line 8936
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 8933
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 8944
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 8950
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 8952
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 8957
   $$2 = $or$cond ? $$0228 : $11; //@line 8962
   $$2234 = $$1233; //@line 8962
   $$2239 = $$1238; //@line 8962
   $$2251 = $11; //@line 8962
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 8962
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 8962
  } else if ((label | 0) == 85) {
   label = 0; //@line 8965
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 8967
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 8970
   $$0247 = $$1248; //@line 8970
   $$0269 = $$3272; //@line 8970
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 8975
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 8977
  $345 = $$$5 + $$2234 | 0; //@line 8978
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 8980
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 8981
  _out_670($0, $$2239, $$2234); //@line 8982
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 8984
  _pad_676($0, 48, $$$5, $343, 0); //@line 8985
  _out_670($0, $$2, $343); //@line 8986
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 8988
  $$0243 = $$2261; //@line 8989
  $$0247 = $$1248; //@line 8989
  $$0269 = $$3272; //@line 8989
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 8997
    } else {
     $$2242302 = 1; //@line 8999
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 9002
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 9005
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 9009
      $356 = $$2242302 + 1 | 0; //@line 9010
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 9013
      } else {
       $$2242$lcssa = $356; //@line 9015
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 9021
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 9027
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 9033
       } else {
        $$0 = 1; //@line 9035
        break;
       }
      }
     } else {
      $$0 = 1; //@line 9040
     }
    }
   } else {
    $$0 = $$1248; //@line 9044
   }
  }
 } while (0);
 STACKTOP = sp; //@line 9048
 return $$0 | 0; //@line 9048
}
function _mbed_vtracef($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$0199 = 0, $$1$off0 = 0, $$10 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$13 = 0, $$18 = 0, $$3 = 0, $$3147 = 0, $$3147168 = 0, $$3154 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$6 = 0, $$6150 = 0, $$9 = 0, $$lobit = 0, $$pre = 0, $$sink = 0, $125 = 0, $126 = 0, $151 = 0, $157 = 0, $168 = 0, $169 = 0, $171 = 0, $181 = 0, $182 = 0, $184 = 0, $186 = 0, $194 = 0, $201 = 0, $202 = 0, $204 = 0, $206 = 0, $209 = 0, $34 = 0, $38 = 0, $4 = 0, $43 = 0, $5 = 0, $54 = 0, $55 = 0, $59 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $69 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $76 = 0, $78 = 0, $82 = 0, $89 = 0, $95 = 0, $AsyncCtx = 0, $AsyncCtx27 = 0, $AsyncCtx30 = 0, $AsyncCtx34 = 0, $AsyncCtx38 = 0, $AsyncCtx42 = 0, $AsyncCtx45 = 0, $AsyncCtx49 = 0, $AsyncCtx52 = 0, $AsyncCtx56 = 0, $AsyncCtx60 = 0, $AsyncCtx64 = 0, $extract$t159 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer12 = 0, $vararg_buffer15 = 0, $vararg_buffer18 = 0, $vararg_buffer20 = 0, $vararg_buffer23 = 0, $vararg_buffer3 = 0, $vararg_buffer6 = 0, $vararg_buffer9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1798
 STACKTOP = STACKTOP + 96 | 0; //@line 1799
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(96); //@line 1799
 $vararg_buffer23 = sp + 72 | 0; //@line 1800
 $vararg_buffer20 = sp + 64 | 0; //@line 1801
 $vararg_buffer18 = sp + 56 | 0; //@line 1802
 $vararg_buffer15 = sp + 48 | 0; //@line 1803
 $vararg_buffer12 = sp + 40 | 0; //@line 1804
 $vararg_buffer9 = sp + 32 | 0; //@line 1805
 $vararg_buffer6 = sp + 24 | 0; //@line 1806
 $vararg_buffer3 = sp + 16 | 0; //@line 1807
 $vararg_buffer1 = sp + 8 | 0; //@line 1808
 $vararg_buffer = sp; //@line 1809
 $4 = sp + 80 | 0; //@line 1810
 $5 = HEAP32[55] | 0; //@line 1811
 do {
  if ($5 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(104, sp) | 0; //@line 1815
   FUNCTION_TABLE_v[$5 & 7](); //@line 1816
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 35; //@line 1819
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 1821
    HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 1823
    HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer3; //@line 1825
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 1827
    HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 1829
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer23; //@line 1831
    HEAP32[$AsyncCtx + 28 >> 2] = $vararg_buffer23; //@line 1833
    HEAP8[$AsyncCtx + 32 >> 0] = $0; //@line 1835
    HEAP32[$AsyncCtx + 36 >> 2] = $vararg_buffer; //@line 1837
    HEAP32[$AsyncCtx + 40 >> 2] = $vararg_buffer; //@line 1839
    HEAP32[$AsyncCtx + 44 >> 2] = $vararg_buffer1; //@line 1841
    HEAP32[$AsyncCtx + 48 >> 2] = $vararg_buffer1; //@line 1843
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 1845
    HEAP32[$AsyncCtx + 56 >> 2] = $vararg_buffer6; //@line 1847
    HEAP32[$AsyncCtx + 60 >> 2] = $vararg_buffer6; //@line 1849
    HEAP32[$AsyncCtx + 64 >> 2] = $vararg_buffer12; //@line 1851
    HEAP32[$AsyncCtx + 68 >> 2] = $vararg_buffer12; //@line 1853
    HEAP32[$AsyncCtx + 72 >> 2] = $vararg_buffer20; //@line 1855
    HEAP32[$AsyncCtx + 76 >> 2] = $vararg_buffer20; //@line 1857
    HEAP32[$AsyncCtx + 80 >> 2] = $vararg_buffer9; //@line 1859
    HEAP32[$AsyncCtx + 84 >> 2] = $vararg_buffer9; //@line 1861
    HEAP32[$AsyncCtx + 88 >> 2] = $vararg_buffer18; //@line 1863
    HEAP32[$AsyncCtx + 92 >> 2] = $vararg_buffer18; //@line 1865
    HEAP32[$AsyncCtx + 96 >> 2] = $vararg_buffer15; //@line 1867
    HEAP32[$AsyncCtx + 100 >> 2] = $vararg_buffer15; //@line 1869
    sp = STACKTOP; //@line 1870
    STACKTOP = sp; //@line 1871
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 1873
    HEAP32[57] = (HEAP32[57] | 0) + 1; //@line 1876
    break;
   }
  }
 } while (0);
 $34 = HEAP32[46] | 0; //@line 1881
 do {
  if ($34 | 0) {
   HEAP8[$34 >> 0] = 0; //@line 1885
   do {
    if ($0 << 24 >> 24 > -1 & ($1 | 0) != 0) {
     $38 = HEAP32[43] | 0; //@line 1891
     if (HEAP8[$38 >> 0] | 0) {
      if (_strstr($38, $1) | 0) {
       $$0$i = 1; //@line 1898
       break;
      }
     }
     $43 = HEAP32[44] | 0; //@line 1902
     if (!(HEAP8[$43 >> 0] | 0)) {
      label = 11; //@line 1906
     } else {
      if (!(_strstr($43, $1) | 0)) {
       $$0$i = 1; //@line 1911
      } else {
       label = 11; //@line 1913
      }
     }
    } else {
     label = 11; //@line 1917
    }
   } while (0);
   if ((label | 0) == 11) {
    $$0$i = 0; //@line 1921
   }
   if (!((HEAP32[53] | 0) != 0 & ((($1 | 0) == 0 | (($2 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[50] = HEAP32[48]; //@line 1933
    break;
   }
   $54 = HEAPU8[168] | 0; //@line 1937
   $55 = $0 & 255; //@line 1938
   if ($55 & 31 & $54 | 0) {
    $59 = $54 & 64; //@line 1943
    $$lobit = $59 >>> 6; //@line 1944
    $60 = $$lobit & 255; //@line 1945
    $64 = ($54 & 32 | 0) == 0; //@line 1949
    $65 = HEAP32[47] | 0; //@line 1950
    $66 = HEAP32[46] | 0; //@line 1951
    $67 = $0 << 24 >> 24 == 1; //@line 1952
    do {
     if ($67 | ($54 & 128 | 0) != 0) {
      $AsyncCtx64 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1956
      _vsnprintf($66, $65, $2, $3) | 0; //@line 1957
      if (___async) {
       HEAP32[$AsyncCtx64 >> 2] = 36; //@line 1960
       HEAP8[$AsyncCtx64 + 4 >> 0] = $67 & 1; //@line 1963
       sp = STACKTOP; //@line 1964
       STACKTOP = sp; //@line 1965
       return;
      }
      _emscripten_free_async_context($AsyncCtx64 | 0); //@line 1967
      $69 = HEAP32[54] | 0; //@line 1968
      if (!($67 & ($69 | 0) != 0)) {
       $73 = HEAP32[53] | 0; //@line 1972
       $74 = HEAP32[46] | 0; //@line 1973
       $AsyncCtx34 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1974
       FUNCTION_TABLE_vi[$73 & 255]($74); //@line 1975
       if (___async) {
        HEAP32[$AsyncCtx34 >> 2] = 39; //@line 1978
        sp = STACKTOP; //@line 1979
        STACKTOP = sp; //@line 1980
        return;
       } else {
        _emscripten_free_async_context($AsyncCtx34 | 0); //@line 1982
        break;
       }
      }
      $71 = HEAP32[46] | 0; //@line 1986
      $AsyncCtx27 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1987
      FUNCTION_TABLE_vi[$69 & 255]($71); //@line 1988
      if (___async) {
       HEAP32[$AsyncCtx27 >> 2] = 37; //@line 1991
       sp = STACKTOP; //@line 1992
       STACKTOP = sp; //@line 1993
       return;
      }
      _emscripten_free_async_context($AsyncCtx27 | 0); //@line 1995
      $72 = HEAP32[54] | 0; //@line 1996
      $AsyncCtx30 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1997
      FUNCTION_TABLE_vi[$72 & 255](1269); //@line 1998
      if (___async) {
       HEAP32[$AsyncCtx30 >> 2] = 38; //@line 2001
       sp = STACKTOP; //@line 2002
       STACKTOP = sp; //@line 2003
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx30 | 0); //@line 2005
       break;
      }
     } else {
      if (!$59) {
       $$1$off0 = ($$lobit | 0) != 0; //@line 2012
       $$1143 = $66; //@line 2012
       $$1145 = $65; //@line 2012
       $$3154 = 0; //@line 2012
       label = 38; //@line 2013
      } else {
       if ($64) {
        $$0142 = $66; //@line 2016
        $$0144 = $65; //@line 2016
       } else {
        $76 = _snprintf($66, $65, 1271, $vararg_buffer) | 0; //@line 2018
        $$ = ($76 | 0) >= ($65 | 0) ? 0 : $76; //@line 2020
        $78 = ($$ | 0) > 0; //@line 2021
        $$0142 = $78 ? $66 + $$ | 0 : $66; //@line 2026
        $$0144 = $65 - ($78 ? $$ : 0) | 0; //@line 2026
       }
       if (($$0144 | 0) > 0) {
        $82 = $55 + -2 | 0; //@line 2030
        switch ($82 >>> 1 | $82 << 31 | 0) {
        case 0:
         {
          $$sink = 1289; //@line 2036
          label = 35; //@line 2037
          break;
         }
        case 1:
         {
          $$sink = 1295; //@line 2041
          label = 35; //@line 2042
          break;
         }
        case 3:
         {
          $$sink = 1283; //@line 2046
          label = 35; //@line 2047
          break;
         }
        case 7:
         {
          $$sink = 1277; //@line 2051
          label = 35; //@line 2052
          break;
         }
        default:
         {
          $$0141 = 0; //@line 2056
          $$1152 = 0; //@line 2056
         }
        }
        if ((label | 0) == 35) {
         HEAP32[$vararg_buffer1 >> 2] = $$sink; //@line 2060
         $$0141 = $60 & 1; //@line 2063
         $$1152 = _snprintf($$0142, $$0144, 1301, $vararg_buffer1) | 0; //@line 2063
        }
        $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 2066
        $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 2068
        if (($$1152$ | 0) > 0) {
         $89 = $$0141 << 24 >> 24 == 0; //@line 2070
         $$1$off0 = $extract$t159; //@line 2075
         $$1143 = $89 ? $$0142 : $$0142 + $$1152$ | 0; //@line 2075
         $$1145 = $$0144 - ($89 ? 0 : $$1152$) | 0; //@line 2075
         $$3154 = $$1152; //@line 2075
         label = 38; //@line 2076
        } else {
         $$1$off0 = $extract$t159; //@line 2078
         $$1143 = $$0142; //@line 2078
         $$1145 = $$0144; //@line 2078
         $$3154 = $$1152$; //@line 2078
         label = 38; //@line 2079
        }
       }
      }
      L54 : do {
       if ((label | 0) == 38) {
        do {
         if (($$1145 | 0) > 0 & (HEAP32[51] | 0) != 0) {
          HEAP32[$4 >> 2] = HEAP32[$3 >> 2]; //@line 2092
          $AsyncCtx60 = _emscripten_alloc_async_context(104, sp) | 0; //@line 2093
          $95 = _vsnprintf(0, 0, $2, $4) | 0; //@line 2094
          if (___async) {
           HEAP32[$AsyncCtx60 >> 2] = 40; //@line 2097
           HEAP32[$AsyncCtx60 + 4 >> 2] = $2; //@line 2099
           HEAP32[$AsyncCtx60 + 8 >> 2] = $3; //@line 2101
           HEAP32[$AsyncCtx60 + 12 >> 2] = $vararg_buffer3; //@line 2103
           HEAP32[$AsyncCtx60 + 16 >> 2] = $$1143; //@line 2105
           HEAP32[$AsyncCtx60 + 20 >> 2] = $$1145; //@line 2107
           HEAP32[$AsyncCtx60 + 24 >> 2] = $vararg_buffer3; //@line 2109
           HEAP32[$AsyncCtx60 + 28 >> 2] = $4; //@line 2111
           HEAP32[$AsyncCtx60 + 32 >> 2] = $vararg_buffer23; //@line 2113
           HEAP32[$AsyncCtx60 + 36 >> 2] = $vararg_buffer23; //@line 2115
           HEAP8[$AsyncCtx60 + 40 >> 0] = $$1$off0 & 1; //@line 2118
           HEAP32[$AsyncCtx60 + 44 >> 2] = $$3154; //@line 2120
           HEAP32[$AsyncCtx60 + 48 >> 2] = $vararg_buffer20; //@line 2122
           HEAP32[$AsyncCtx60 + 52 >> 2] = $vararg_buffer20; //@line 2124
           HEAP32[$AsyncCtx60 + 56 >> 2] = $vararg_buffer6; //@line 2126
           HEAP32[$AsyncCtx60 + 60 >> 2] = $1; //@line 2128
           HEAP32[$AsyncCtx60 + 64 >> 2] = $vararg_buffer6; //@line 2130
           HEAP32[$AsyncCtx60 + 68 >> 2] = $55; //@line 2132
           HEAP32[$AsyncCtx60 + 72 >> 2] = $vararg_buffer12; //@line 2134
           HEAP32[$AsyncCtx60 + 76 >> 2] = $vararg_buffer12; //@line 2136
           HEAP32[$AsyncCtx60 + 80 >> 2] = $vararg_buffer9; //@line 2138
           HEAP32[$AsyncCtx60 + 84 >> 2] = $vararg_buffer9; //@line 2140
           HEAP32[$AsyncCtx60 + 88 >> 2] = $vararg_buffer18; //@line 2142
           HEAP32[$AsyncCtx60 + 92 >> 2] = $vararg_buffer18; //@line 2144
           HEAP32[$AsyncCtx60 + 96 >> 2] = $vararg_buffer15; //@line 2146
           HEAP32[$AsyncCtx60 + 100 >> 2] = $vararg_buffer15; //@line 2148
           sp = STACKTOP; //@line 2149
           STACKTOP = sp; //@line 2150
           return;
          }
          _emscripten_free_async_context($AsyncCtx60 | 0); //@line 2152
          $125 = HEAP32[51] | 0; //@line 2157
          $AsyncCtx38 = _emscripten_alloc_async_context(100, sp) | 0; //@line 2158
          $126 = FUNCTION_TABLE_ii[$125 & 3](($$3154 | 0 ? 4 : 0) + $$3154 + $95 | 0) | 0; //@line 2159
          if (___async) {
           HEAP32[$AsyncCtx38 >> 2] = 41; //@line 2162
           HEAP32[$AsyncCtx38 + 4 >> 2] = $2; //@line 2164
           HEAP32[$AsyncCtx38 + 8 >> 2] = $3; //@line 2166
           HEAP32[$AsyncCtx38 + 12 >> 2] = $vararg_buffer3; //@line 2168
           HEAP32[$AsyncCtx38 + 16 >> 2] = $$1143; //@line 2170
           HEAP32[$AsyncCtx38 + 20 >> 2] = $$1145; //@line 2172
           HEAP32[$AsyncCtx38 + 24 >> 2] = $vararg_buffer3; //@line 2174
           HEAP32[$AsyncCtx38 + 28 >> 2] = $4; //@line 2176
           HEAP32[$AsyncCtx38 + 32 >> 2] = $vararg_buffer23; //@line 2178
           HEAP32[$AsyncCtx38 + 36 >> 2] = $vararg_buffer23; //@line 2180
           HEAP8[$AsyncCtx38 + 40 >> 0] = $$1$off0 & 1; //@line 2183
           HEAP32[$AsyncCtx38 + 44 >> 2] = $vararg_buffer6; //@line 2185
           HEAP32[$AsyncCtx38 + 48 >> 2] = $1; //@line 2187
           HEAP32[$AsyncCtx38 + 52 >> 2] = $vararg_buffer6; //@line 2189
           HEAP32[$AsyncCtx38 + 56 >> 2] = $55; //@line 2191
           HEAP32[$AsyncCtx38 + 60 >> 2] = $vararg_buffer12; //@line 2193
           HEAP32[$AsyncCtx38 + 64 >> 2] = $vararg_buffer12; //@line 2195
           HEAP32[$AsyncCtx38 + 68 >> 2] = $vararg_buffer20; //@line 2197
           HEAP32[$AsyncCtx38 + 72 >> 2] = $vararg_buffer20; //@line 2199
           HEAP32[$AsyncCtx38 + 76 >> 2] = $vararg_buffer9; //@line 2201
           HEAP32[$AsyncCtx38 + 80 >> 2] = $vararg_buffer9; //@line 2203
           HEAP32[$AsyncCtx38 + 84 >> 2] = $vararg_buffer18; //@line 2205
           HEAP32[$AsyncCtx38 + 88 >> 2] = $vararg_buffer18; //@line 2207
           HEAP32[$AsyncCtx38 + 92 >> 2] = $vararg_buffer15; //@line 2209
           HEAP32[$AsyncCtx38 + 96 >> 2] = $vararg_buffer15; //@line 2211
           sp = STACKTOP; //@line 2212
           STACKTOP = sp; //@line 2213
           return;
          } else {
           _emscripten_free_async_context($AsyncCtx38 | 0); //@line 2215
           HEAP32[$vararg_buffer3 >> 2] = $126; //@line 2216
           $151 = _snprintf($$1143, $$1145, 1301, $vararg_buffer3) | 0; //@line 2217
           $$10 = ($151 | 0) >= ($$1145 | 0) ? 0 : $151; //@line 2219
           if (($$10 | 0) > 0) {
            $$3 = $$1143 + $$10 | 0; //@line 2224
            $$3147 = $$1145 - $$10 | 0; //@line 2224
            label = 44; //@line 2225
            break;
           } else {
            $$3147168 = $$1145; //@line 2228
            $$3169 = $$1143; //@line 2228
            break;
           }
          }
         } else {
          $$3 = $$1143; //@line 2233
          $$3147 = $$1145; //@line 2233
          label = 44; //@line 2234
         }
        } while (0);
        if ((label | 0) == 44) {
         if (($$3147 | 0) > 0) {
          $$3147168 = $$3147; //@line 2240
          $$3169 = $$3; //@line 2240
         } else {
          break;
         }
        }
        $157 = $55 + -2 | 0; //@line 2245
        switch ($157 >>> 1 | $157 << 31 | 0) {
        case 0:
         {
          HEAP32[$vararg_buffer6 >> 2] = $1; //@line 2251
          $$5156 = _snprintf($$3169, $$3147168, 1304, $vararg_buffer6) | 0; //@line 2253
          break;
         }
        case 1:
         {
          HEAP32[$vararg_buffer9 >> 2] = $1; //@line 2257
          $$5156 = _snprintf($$3169, $$3147168, 1319, $vararg_buffer9) | 0; //@line 2259
          break;
         }
        case 3:
         {
          HEAP32[$vararg_buffer12 >> 2] = $1; //@line 2263
          $$5156 = _snprintf($$3169, $$3147168, 1334, $vararg_buffer12) | 0; //@line 2265
          break;
         }
        case 7:
         {
          HEAP32[$vararg_buffer15 >> 2] = $1; //@line 2269
          $$5156 = _snprintf($$3169, $$3147168, 1349, $vararg_buffer15) | 0; //@line 2271
          break;
         }
        default:
         {
          $$5156 = _snprintf($$3169, $$3147168, 1364, $vararg_buffer18) | 0; //@line 2276
         }
        }
        $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 2280
        $168 = $$3169 + $$5156$ | 0; //@line 2282
        $169 = $$3147168 - $$5156$ | 0; //@line 2283
        if (($$5156$ | 0) > 0 & ($169 | 0) > 0) {
         $AsyncCtx56 = _emscripten_alloc_async_context(32, sp) | 0; //@line 2287
         $171 = _vsnprintf($168, $169, $2, $3) | 0; //@line 2288
         if (___async) {
          HEAP32[$AsyncCtx56 >> 2] = 42; //@line 2291
          HEAP32[$AsyncCtx56 + 4 >> 2] = $vararg_buffer23; //@line 2293
          HEAP32[$AsyncCtx56 + 8 >> 2] = $vararg_buffer23; //@line 2295
          HEAP8[$AsyncCtx56 + 12 >> 0] = $$1$off0 & 1; //@line 2298
          HEAP32[$AsyncCtx56 + 16 >> 2] = $vararg_buffer20; //@line 2300
          HEAP32[$AsyncCtx56 + 20 >> 2] = $vararg_buffer20; //@line 2302
          HEAP32[$AsyncCtx56 + 24 >> 2] = $169; //@line 2304
          HEAP32[$AsyncCtx56 + 28 >> 2] = $168; //@line 2306
          sp = STACKTOP; //@line 2307
          STACKTOP = sp; //@line 2308
          return;
         }
         _emscripten_free_async_context($AsyncCtx56 | 0); //@line 2310
         $$13 = ($171 | 0) >= ($169 | 0) ? 0 : $171; //@line 2312
         $181 = $168 + $$13 | 0; //@line 2314
         $182 = $169 - $$13 | 0; //@line 2315
         if (($$13 | 0) > 0) {
          $184 = HEAP32[52] | 0; //@line 2318
          do {
           if (($182 | 0) > 0 & ($184 | 0) != 0) {
            $AsyncCtx42 = _emscripten_alloc_async_context(32, sp) | 0; //@line 2323
            $186 = FUNCTION_TABLE_i[$184 & 0]() | 0; //@line 2324
            if (___async) {
             HEAP32[$AsyncCtx42 >> 2] = 43; //@line 2327
             HEAP32[$AsyncCtx42 + 4 >> 2] = $vararg_buffer20; //@line 2329
             HEAP32[$AsyncCtx42 + 8 >> 2] = $181; //@line 2331
             HEAP32[$AsyncCtx42 + 12 >> 2] = $182; //@line 2333
             HEAP32[$AsyncCtx42 + 16 >> 2] = $vararg_buffer20; //@line 2335
             HEAP8[$AsyncCtx42 + 20 >> 0] = $$1$off0 & 1; //@line 2338
             HEAP32[$AsyncCtx42 + 24 >> 2] = $vararg_buffer23; //@line 2340
             HEAP32[$AsyncCtx42 + 28 >> 2] = $vararg_buffer23; //@line 2342
             sp = STACKTOP; //@line 2343
             STACKTOP = sp; //@line 2344
             return;
            } else {
             _emscripten_free_async_context($AsyncCtx42 | 0); //@line 2346
             HEAP32[$vararg_buffer20 >> 2] = $186; //@line 2347
             $194 = _snprintf($181, $182, 1301, $vararg_buffer20) | 0; //@line 2348
             $$18 = ($194 | 0) >= ($182 | 0) ? 0 : $194; //@line 2350
             if (($$18 | 0) > 0) {
              $$6 = $181 + $$18 | 0; //@line 2355
              $$6150 = $182 - $$18 | 0; //@line 2355
              $$9 = $$18; //@line 2355
              break;
             } else {
              break L54;
             }
            }
           } else {
            $$6 = $181; //@line 2362
            $$6150 = $182; //@line 2362
            $$9 = $$13; //@line 2362
           }
          } while (0);
          if (!(($$9 | 0) < 1 | ($$6150 | 0) < 1 | $$1$off0 ^ 1)) {
           _snprintf($$6, $$6150, 1379, $vararg_buffer23) | 0; //@line 2371
          }
         }
        }
       }
      } while (0);
      $201 = HEAP32[53] | 0; //@line 2377
      $202 = HEAP32[46] | 0; //@line 2378
      $AsyncCtx45 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2379
      FUNCTION_TABLE_vi[$201 & 255]($202); //@line 2380
      if (___async) {
       HEAP32[$AsyncCtx45 >> 2] = 44; //@line 2383
       sp = STACKTOP; //@line 2384
       STACKTOP = sp; //@line 2385
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx45 | 0); //@line 2387
       break;
      }
     }
    } while (0);
    HEAP32[50] = HEAP32[48]; //@line 2393
   }
  }
 } while (0);
 $204 = HEAP32[56] | 0; //@line 2397
 if (!$204) {
  STACKTOP = sp; //@line 2400
  return;
 }
 $206 = HEAP32[57] | 0; //@line 2402
 HEAP32[57] = 0; //@line 2403
 $AsyncCtx49 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2404
 FUNCTION_TABLE_v[$204 & 7](); //@line 2405
 if (___async) {
  HEAP32[$AsyncCtx49 >> 2] = 45; //@line 2408
  HEAP32[$AsyncCtx49 + 4 >> 2] = $206; //@line 2410
  sp = STACKTOP; //@line 2411
  STACKTOP = sp; //@line 2412
  return;
 }
 _emscripten_free_async_context($AsyncCtx49 | 0); //@line 2414
 if (($206 | 0) > 1) {
  $$0199 = $206; //@line 2417
 } else {
  STACKTOP = sp; //@line 2419
  return;
 }
 while (1) {
  $209 = $$0199 + -1 | 0; //@line 2422
  $$pre = HEAP32[56] | 0; //@line 2423
  $AsyncCtx52 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2424
  FUNCTION_TABLE_v[$$pre & 7](); //@line 2425
  if (___async) {
   label = 70; //@line 2428
   break;
  }
  _emscripten_free_async_context($AsyncCtx52 | 0); //@line 2431
  if (($$0199 | 0) > 2) {
   $$0199 = $209; //@line 2434
  } else {
   label = 72; //@line 2436
   break;
  }
 }
 if ((label | 0) == 70) {
  HEAP32[$AsyncCtx52 >> 2] = 46; //@line 2441
  HEAP32[$AsyncCtx52 + 4 >> 2] = $$0199; //@line 2443
  HEAP32[$AsyncCtx52 + 8 >> 2] = $209; //@line 2445
  sp = STACKTOP; //@line 2446
  STACKTOP = sp; //@line 2447
  return;
 } else if ((label | 0) == 72) {
  STACKTOP = sp; //@line 2450
  return;
 }
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 5920
 $3 = HEAP32[1315] | 0; //@line 5921
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 5924
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 5928
 $7 = $6 & 3; //@line 5929
 if (($7 | 0) == 1) {
  _abort(); //@line 5932
 }
 $9 = $6 & -8; //@line 5935
 $10 = $2 + $9 | 0; //@line 5936
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 5941
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 5947
   $17 = $13 + $9 | 0; //@line 5948
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 5951
   }
   if ((HEAP32[1316] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 5957
    $106 = HEAP32[$105 >> 2] | 0; //@line 5958
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 5962
     $$1382 = $17; //@line 5962
     $114 = $16; //@line 5962
     break;
    }
    HEAP32[1313] = $17; //@line 5965
    HEAP32[$105 >> 2] = $106 & -2; //@line 5967
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 5970
    HEAP32[$16 + $17 >> 2] = $17; //@line 5972
    return;
   }
   $21 = $13 >>> 3; //@line 5975
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 5979
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 5981
    $28 = 5284 + ($21 << 1 << 2) | 0; //@line 5983
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 5988
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 5995
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1311] = HEAP32[1311] & ~(1 << $21); //@line 6005
     $$1 = $16; //@line 6006
     $$1382 = $17; //@line 6006
     $114 = $16; //@line 6006
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 6012
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 6016
     }
     $41 = $26 + 8 | 0; //@line 6019
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 6023
     } else {
      _abort(); //@line 6025
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 6030
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 6031
    $$1 = $16; //@line 6032
    $$1382 = $17; //@line 6032
    $114 = $16; //@line 6032
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 6036
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 6038
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 6042
     $60 = $59 + 4 | 0; //@line 6043
     $61 = HEAP32[$60 >> 2] | 0; //@line 6044
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 6047
      if (!$63) {
       $$3 = 0; //@line 6050
       break;
      } else {
       $$1387 = $63; //@line 6053
       $$1390 = $59; //@line 6053
      }
     } else {
      $$1387 = $61; //@line 6056
      $$1390 = $60; //@line 6056
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 6059
      $66 = HEAP32[$65 >> 2] | 0; //@line 6060
      if ($66 | 0) {
       $$1387 = $66; //@line 6063
       $$1390 = $65; //@line 6063
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 6066
      $69 = HEAP32[$68 >> 2] | 0; //@line 6067
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 6072
       $$1390 = $68; //@line 6072
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 6077
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 6080
      $$3 = $$1387; //@line 6081
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 6086
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 6089
     }
     $53 = $51 + 12 | 0; //@line 6092
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 6096
     }
     $56 = $48 + 8 | 0; //@line 6099
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 6103
      HEAP32[$56 >> 2] = $51; //@line 6104
      $$3 = $48; //@line 6105
      break;
     } else {
      _abort(); //@line 6108
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 6115
    $$1382 = $17; //@line 6115
    $114 = $16; //@line 6115
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 6118
    $75 = 5548 + ($74 << 2) | 0; //@line 6119
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 6124
      if (!$$3) {
       HEAP32[1312] = HEAP32[1312] & ~(1 << $74); //@line 6131
       $$1 = $16; //@line 6132
       $$1382 = $17; //@line 6132
       $114 = $16; //@line 6132
       break L10;
      }
     } else {
      if ((HEAP32[1315] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 6139
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 6147
       if (!$$3) {
        $$1 = $16; //@line 6150
        $$1382 = $17; //@line 6150
        $114 = $16; //@line 6150
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1315] | 0; //@line 6158
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 6161
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 6165
    $92 = $16 + 16 | 0; //@line 6166
    $93 = HEAP32[$92 >> 2] | 0; //@line 6167
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 6173
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 6177
       HEAP32[$93 + 24 >> 2] = $$3; //@line 6179
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 6185
    if (!$99) {
     $$1 = $16; //@line 6188
     $$1382 = $17; //@line 6188
     $114 = $16; //@line 6188
    } else {
     if ((HEAP32[1315] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 6193
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 6197
      HEAP32[$99 + 24 >> 2] = $$3; //@line 6199
      $$1 = $16; //@line 6200
      $$1382 = $17; //@line 6200
      $114 = $16; //@line 6200
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 6206
   $$1382 = $9; //@line 6206
   $114 = $2; //@line 6206
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 6211
 }
 $115 = $10 + 4 | 0; //@line 6214
 $116 = HEAP32[$115 >> 2] | 0; //@line 6215
 if (!($116 & 1)) {
  _abort(); //@line 6219
 }
 if (!($116 & 2)) {
  if ((HEAP32[1317] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1314] | 0) + $$1382 | 0; //@line 6229
   HEAP32[1314] = $124; //@line 6230
   HEAP32[1317] = $$1; //@line 6231
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 6234
   if (($$1 | 0) != (HEAP32[1316] | 0)) {
    return;
   }
   HEAP32[1316] = 0; //@line 6240
   HEAP32[1313] = 0; //@line 6241
   return;
  }
  if ((HEAP32[1316] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1313] | 0) + $$1382 | 0; //@line 6248
   HEAP32[1313] = $132; //@line 6249
   HEAP32[1316] = $114; //@line 6250
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 6253
   HEAP32[$114 + $132 >> 2] = $132; //@line 6255
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 6259
  $138 = $116 >>> 3; //@line 6260
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 6265
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 6267
    $145 = 5284 + ($138 << 1 << 2) | 0; //@line 6269
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1315] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 6275
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 6282
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1311] = HEAP32[1311] & ~(1 << $138); //@line 6292
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 6298
    } else {
     if ((HEAP32[1315] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 6303
     }
     $160 = $143 + 8 | 0; //@line 6306
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 6310
     } else {
      _abort(); //@line 6312
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 6317
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 6318
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 6321
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 6323
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 6327
      $180 = $179 + 4 | 0; //@line 6328
      $181 = HEAP32[$180 >> 2] | 0; //@line 6329
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 6332
       if (!$183) {
        $$3400 = 0; //@line 6335
        break;
       } else {
        $$1398 = $183; //@line 6338
        $$1402 = $179; //@line 6338
       }
      } else {
       $$1398 = $181; //@line 6341
       $$1402 = $180; //@line 6341
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 6344
       $186 = HEAP32[$185 >> 2] | 0; //@line 6345
       if ($186 | 0) {
        $$1398 = $186; //@line 6348
        $$1402 = $185; //@line 6348
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 6351
       $189 = HEAP32[$188 >> 2] | 0; //@line 6352
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 6357
        $$1402 = $188; //@line 6357
       }
      }
      if ((HEAP32[1315] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 6363
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 6366
       $$3400 = $$1398; //@line 6367
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 6372
      if ((HEAP32[1315] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 6376
      }
      $173 = $170 + 12 | 0; //@line 6379
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 6383
      }
      $176 = $167 + 8 | 0; //@line 6386
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 6390
       HEAP32[$176 >> 2] = $170; //@line 6391
       $$3400 = $167; //@line 6392
       break;
      } else {
       _abort(); //@line 6395
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 6403
     $196 = 5548 + ($195 << 2) | 0; //@line 6404
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 6409
       if (!$$3400) {
        HEAP32[1312] = HEAP32[1312] & ~(1 << $195); //@line 6416
        break L108;
       }
      } else {
       if ((HEAP32[1315] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 6423
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 6431
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1315] | 0; //@line 6441
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 6444
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 6448
     $213 = $10 + 16 | 0; //@line 6449
     $214 = HEAP32[$213 >> 2] | 0; //@line 6450
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 6456
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 6460
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 6462
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 6468
     if ($220 | 0) {
      if ((HEAP32[1315] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 6474
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 6478
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 6480
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 6489
  HEAP32[$114 + $137 >> 2] = $137; //@line 6491
  if (($$1 | 0) == (HEAP32[1316] | 0)) {
   HEAP32[1313] = $137; //@line 6495
   return;
  } else {
   $$2 = $137; //@line 6498
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 6502
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 6505
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 6507
  $$2 = $$1382; //@line 6508
 }
 $235 = $$2 >>> 3; //@line 6510
 if ($$2 >>> 0 < 256) {
  $238 = 5284 + ($235 << 1 << 2) | 0; //@line 6514
  $239 = HEAP32[1311] | 0; //@line 6515
  $240 = 1 << $235; //@line 6516
  if (!($239 & $240)) {
   HEAP32[1311] = $239 | $240; //@line 6521
   $$0403 = $238; //@line 6523
   $$pre$phiZ2D = $238 + 8 | 0; //@line 6523
  } else {
   $244 = $238 + 8 | 0; //@line 6525
   $245 = HEAP32[$244 >> 2] | 0; //@line 6526
   if ((HEAP32[1315] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 6530
   } else {
    $$0403 = $245; //@line 6533
    $$pre$phiZ2D = $244; //@line 6533
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 6536
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 6538
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 6540
  HEAP32[$$1 + 12 >> 2] = $238; //@line 6542
  return;
 }
 $251 = $$2 >>> 8; //@line 6545
 if (!$251) {
  $$0396 = 0; //@line 6548
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 6552
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 6556
   $257 = $251 << $256; //@line 6557
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 6560
   $262 = $257 << $260; //@line 6562
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 6565
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 6570
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 6576
  }
 }
 $276 = 5548 + ($$0396 << 2) | 0; //@line 6579
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 6581
 HEAP32[$$1 + 20 >> 2] = 0; //@line 6584
 HEAP32[$$1 + 16 >> 2] = 0; //@line 6585
 $280 = HEAP32[1312] | 0; //@line 6586
 $281 = 1 << $$0396; //@line 6587
 do {
  if (!($280 & $281)) {
   HEAP32[1312] = $280 | $281; //@line 6593
   HEAP32[$276 >> 2] = $$1; //@line 6594
   HEAP32[$$1 + 24 >> 2] = $276; //@line 6596
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 6598
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 6600
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 6608
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 6608
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 6615
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 6619
    $301 = HEAP32[$299 >> 2] | 0; //@line 6621
    if (!$301) {
     label = 121; //@line 6624
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 6627
     $$0384 = $301; //@line 6627
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1315] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 6634
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 6637
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 6639
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 6641
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 6643
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 6648
    $309 = HEAP32[$308 >> 2] | 0; //@line 6649
    $310 = HEAP32[1315] | 0; //@line 6650
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 6656
     HEAP32[$308 >> 2] = $$1; //@line 6657
     HEAP32[$$1 + 8 >> 2] = $309; //@line 6659
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 6661
     HEAP32[$$1 + 24 >> 2] = 0; //@line 6663
     break;
    } else {
     _abort(); //@line 6666
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1319] | 0) + -1 | 0; //@line 6673
 HEAP32[1319] = $319; //@line 6674
 if (!$319) {
  $$0212$in$i = 5700; //@line 6677
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 6682
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 6688
  }
 }
 HEAP32[1319] = -1; //@line 6691
 return;
}
function _mbed_vtracef__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$1$off0 = 0, $$1$off0$expand_i1_val = 0, $$1$off0$expand_i1_val18 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$3154 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $$lobit = 0, $$sink = 0, $10 = 0, $102 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $136 = 0, $14 = 0, $147 = 0, $148 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $163 = 0, $164 = 0, $18 = 0, $2 = 0, $22 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $57 = 0, $6 = 0, $62 = 0, $73 = 0, $74 = 0, $78 = 0, $79 = 0, $8 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $89 = 0, $91 = 0, $95 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx11 = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx7 = 0, $ReallocAsyncCtx8 = 0, $extract$t159 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 15
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 17
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 19
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 21
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 23
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 25
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 27
 $16 = HEAP8[$0 + 32 >> 0] | 0; //@line 29
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 31
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 35
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 39
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 41
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 43
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 45
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 47
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 49
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 51
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 53
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 55
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 57
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 59
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 61
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 63
 HEAP32[57] = (HEAP32[57] | 0) + 1; //@line 66
 $53 = HEAP32[46] | 0; //@line 67
 do {
  if ($53 | 0) {
   HEAP8[$53 >> 0] = 0; //@line 71
   do {
    if ($16 << 24 >> 24 > -1 & ($10 | 0) != 0) {
     $57 = HEAP32[43] | 0; //@line 77
     if (HEAP8[$57 >> 0] | 0) {
      if (_strstr($57, $10) | 0) {
       $$0$i = 1; //@line 84
       break;
      }
     }
     $62 = HEAP32[44] | 0; //@line 88
     if (!(HEAP8[$62 >> 0] | 0)) {
      label = 9; //@line 92
     } else {
      if (!(_strstr($62, $10) | 0)) {
       $$0$i = 1; //@line 97
      } else {
       label = 9; //@line 99
      }
     }
    } else {
     label = 9; //@line 103
    }
   } while (0);
   if ((label | 0) == 9) {
    $$0$i = 0; //@line 107
   }
   if (!((HEAP32[53] | 0) != 0 & ((($10 | 0) == 0 | (($2 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[50] = HEAP32[48]; //@line 119
    break;
   }
   $73 = HEAPU8[168] | 0; //@line 123
   $74 = $16 & 255; //@line 124
   if ($74 & 31 & $73 | 0) {
    $78 = $73 & 64; //@line 129
    $$lobit = $78 >>> 6; //@line 130
    $79 = $$lobit & 255; //@line 131
    $83 = ($73 & 32 | 0) == 0; //@line 135
    $84 = HEAP32[47] | 0; //@line 136
    $85 = HEAP32[46] | 0; //@line 137
    $86 = $16 << 24 >> 24 == 1; //@line 138
    if ($86 | ($73 & 128 | 0) != 0) {
     $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 141
     _vsnprintf($85, $84, $2, $4) | 0; //@line 142
     if (___async) {
      HEAP32[$ReallocAsyncCtx12 >> 2] = 36; //@line 145
      $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 146
      $$expand_i1_val = $86 & 1; //@line 147
      HEAP8[$87 >> 0] = $$expand_i1_val; //@line 148
      sp = STACKTOP; //@line 149
      return;
     }
     ___async_unwind = 0; //@line 152
     HEAP32[$ReallocAsyncCtx12 >> 2] = 36; //@line 153
     $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 154
     $$expand_i1_val = $86 & 1; //@line 155
     HEAP8[$87 >> 0] = $$expand_i1_val; //@line 156
     sp = STACKTOP; //@line 157
     return;
    }
    if (!$78) {
     $$1$off0 = ($$lobit | 0) != 0; //@line 163
     $$1143 = $85; //@line 163
     $$1145 = $84; //@line 163
     $$3154 = 0; //@line 163
     label = 28; //@line 164
    } else {
     if ($83) {
      $$0142 = $85; //@line 167
      $$0144 = $84; //@line 167
     } else {
      $89 = _snprintf($85, $84, 1271, $18) | 0; //@line 169
      $$ = ($89 | 0) >= ($84 | 0) ? 0 : $89; //@line 171
      $91 = ($$ | 0) > 0; //@line 172
      $$0142 = $91 ? $85 + $$ | 0 : $85; //@line 177
      $$0144 = $84 - ($91 ? $$ : 0) | 0; //@line 177
     }
     if (($$0144 | 0) > 0) {
      $95 = $74 + -2 | 0; //@line 181
      switch ($95 >>> 1 | $95 << 31 | 0) {
      case 0:
       {
        $$sink = 1289; //@line 187
        label = 25; //@line 188
        break;
       }
      case 1:
       {
        $$sink = 1295; //@line 192
        label = 25; //@line 193
        break;
       }
      case 3:
       {
        $$sink = 1283; //@line 197
        label = 25; //@line 198
        break;
       }
      case 7:
       {
        $$sink = 1277; //@line 202
        label = 25; //@line 203
        break;
       }
      default:
       {
        $$0141 = 0; //@line 207
        $$1152 = 0; //@line 207
       }
      }
      if ((label | 0) == 25) {
       HEAP32[$22 >> 2] = $$sink; //@line 211
       $$0141 = $79 & 1; //@line 214
       $$1152 = _snprintf($$0142, $$0144, 1301, $22) | 0; //@line 214
      }
      $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 217
      $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 219
      if (($$1152$ | 0) > 0) {
       $102 = $$0141 << 24 >> 24 == 0; //@line 221
       $$1$off0 = $extract$t159; //@line 226
       $$1143 = $102 ? $$0142 : $$0142 + $$1152$ | 0; //@line 226
       $$1145 = $$0144 - ($102 ? 0 : $$1152$) | 0; //@line 226
       $$3154 = $$1152; //@line 226
       label = 28; //@line 227
      } else {
       $$1$off0 = $extract$t159; //@line 229
       $$1143 = $$0142; //@line 229
       $$1145 = $$0144; //@line 229
       $$3154 = $$1152$; //@line 229
       label = 28; //@line 230
      }
     }
    }
    if ((label | 0) == 28) {
     if (($$1145 | 0) > 0 & (HEAP32[51] | 0) != 0) {
      HEAP32[$26 >> 2] = HEAP32[$4 >> 2]; //@line 241
      $ReallocAsyncCtx11 = _emscripten_realloc_async_context(104) | 0; //@line 242
      $108 = _vsnprintf(0, 0, $2, $26) | 0; //@line 243
      if (___async) {
       HEAP32[$ReallocAsyncCtx11 >> 2] = 40; //@line 246
       $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 247
       HEAP32[$109 >> 2] = $2; //@line 248
       $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 249
       HEAP32[$110 >> 2] = $4; //@line 250
       $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 251
       HEAP32[$111 >> 2] = $6; //@line 252
       $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 253
       HEAP32[$112 >> 2] = $$1143; //@line 254
       $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 255
       HEAP32[$113 >> 2] = $$1145; //@line 256
       $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 257
       HEAP32[$114 >> 2] = $8; //@line 258
       $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 259
       HEAP32[$115 >> 2] = $26; //@line 260
       $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 261
       HEAP32[$116 >> 2] = $12; //@line 262
       $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 263
       HEAP32[$117 >> 2] = $14; //@line 264
       $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 265
       $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 266
       HEAP8[$118 >> 0] = $$1$off0$expand_i1_val; //@line 267
       $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 268
       HEAP32[$119 >> 2] = $$3154; //@line 269
       $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 270
       HEAP32[$120 >> 2] = $36; //@line 271
       $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 272
       HEAP32[$121 >> 2] = $38; //@line 273
       $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 274
       HEAP32[$122 >> 2] = $28; //@line 275
       $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 276
       HEAP32[$123 >> 2] = $10; //@line 277
       $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 278
       HEAP32[$124 >> 2] = $30; //@line 279
       $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 280
       HEAP32[$125 >> 2] = $74; //@line 281
       $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 282
       HEAP32[$126 >> 2] = $32; //@line 283
       $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 284
       HEAP32[$127 >> 2] = $34; //@line 285
       $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 286
       HEAP32[$128 >> 2] = $40; //@line 287
       $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 288
       HEAP32[$129 >> 2] = $42; //@line 289
       $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 290
       HEAP32[$130 >> 2] = $44; //@line 291
       $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 292
       HEAP32[$131 >> 2] = $46; //@line 293
       $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 294
       HEAP32[$132 >> 2] = $48; //@line 295
       $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 296
       HEAP32[$133 >> 2] = $50; //@line 297
       sp = STACKTOP; //@line 298
       return;
      }
      HEAP32[___async_retval >> 2] = $108; //@line 302
      ___async_unwind = 0; //@line 303
      HEAP32[$ReallocAsyncCtx11 >> 2] = 40; //@line 304
      $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 305
      HEAP32[$109 >> 2] = $2; //@line 306
      $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 307
      HEAP32[$110 >> 2] = $4; //@line 308
      $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 309
      HEAP32[$111 >> 2] = $6; //@line 310
      $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 311
      HEAP32[$112 >> 2] = $$1143; //@line 312
      $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 313
      HEAP32[$113 >> 2] = $$1145; //@line 314
      $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 315
      HEAP32[$114 >> 2] = $8; //@line 316
      $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 317
      HEAP32[$115 >> 2] = $26; //@line 318
      $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 319
      HEAP32[$116 >> 2] = $12; //@line 320
      $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 321
      HEAP32[$117 >> 2] = $14; //@line 322
      $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 323
      $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 324
      HEAP8[$118 >> 0] = $$1$off0$expand_i1_val; //@line 325
      $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 326
      HEAP32[$119 >> 2] = $$3154; //@line 327
      $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 328
      HEAP32[$120 >> 2] = $36; //@line 329
      $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 330
      HEAP32[$121 >> 2] = $38; //@line 331
      $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 332
      HEAP32[$122 >> 2] = $28; //@line 333
      $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 334
      HEAP32[$123 >> 2] = $10; //@line 335
      $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 336
      HEAP32[$124 >> 2] = $30; //@line 337
      $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 338
      HEAP32[$125 >> 2] = $74; //@line 339
      $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 340
      HEAP32[$126 >> 2] = $32; //@line 341
      $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 342
      HEAP32[$127 >> 2] = $34; //@line 343
      $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 344
      HEAP32[$128 >> 2] = $40; //@line 345
      $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 346
      HEAP32[$129 >> 2] = $42; //@line 347
      $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 348
      HEAP32[$130 >> 2] = $44; //@line 349
      $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 350
      HEAP32[$131 >> 2] = $46; //@line 351
      $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 352
      HEAP32[$132 >> 2] = $48; //@line 353
      $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 354
      HEAP32[$133 >> 2] = $50; //@line 355
      sp = STACKTOP; //@line 356
      return;
     }
     if (($$1145 | 0) > 0) {
      $136 = $74 + -2 | 0; //@line 361
      switch ($136 >>> 1 | $136 << 31 | 0) {
      case 0:
       {
        HEAP32[$28 >> 2] = $10; //@line 367
        $$5156 = _snprintf($$1143, $$1145, 1304, $28) | 0; //@line 369
        break;
       }
      case 1:
       {
        HEAP32[$40 >> 2] = $10; //@line 373
        $$5156 = _snprintf($$1143, $$1145, 1319, $40) | 0; //@line 375
        break;
       }
      case 3:
       {
        HEAP32[$32 >> 2] = $10; //@line 379
        $$5156 = _snprintf($$1143, $$1145, 1334, $32) | 0; //@line 381
        break;
       }
      case 7:
       {
        HEAP32[$48 >> 2] = $10; //@line 385
        $$5156 = _snprintf($$1143, $$1145, 1349, $48) | 0; //@line 387
        break;
       }
      default:
       {
        $$5156 = _snprintf($$1143, $$1145, 1364, $44) | 0; //@line 392
       }
      }
      $$5156$ = ($$5156 | 0) < ($$1145 | 0) ? $$5156 : 0; //@line 396
      $147 = $$1143 + $$5156$ | 0; //@line 398
      $148 = $$1145 - $$5156$ | 0; //@line 399
      if (($$5156$ | 0) > 0 & ($148 | 0) > 0) {
       $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 403
       $150 = _vsnprintf($147, $148, $2, $4) | 0; //@line 404
       if (___async) {
        HEAP32[$ReallocAsyncCtx10 >> 2] = 42; //@line 407
        $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 408
        HEAP32[$151 >> 2] = $12; //@line 409
        $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 410
        HEAP32[$152 >> 2] = $14; //@line 411
        $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 412
        $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 413
        HEAP8[$153 >> 0] = $$1$off0$expand_i1_val18; //@line 414
        $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 415
        HEAP32[$154 >> 2] = $36; //@line 416
        $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 417
        HEAP32[$155 >> 2] = $38; //@line 418
        $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 419
        HEAP32[$156 >> 2] = $148; //@line 420
        $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 421
        HEAP32[$157 >> 2] = $147; //@line 422
        sp = STACKTOP; //@line 423
        return;
       }
       HEAP32[___async_retval >> 2] = $150; //@line 427
       ___async_unwind = 0; //@line 428
       HEAP32[$ReallocAsyncCtx10 >> 2] = 42; //@line 429
       $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 430
       HEAP32[$151 >> 2] = $12; //@line 431
       $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 432
       HEAP32[$152 >> 2] = $14; //@line 433
       $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 434
       $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 435
       HEAP8[$153 >> 0] = $$1$off0$expand_i1_val18; //@line 436
       $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 437
       HEAP32[$154 >> 2] = $36; //@line 438
       $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 439
       HEAP32[$155 >> 2] = $38; //@line 440
       $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 441
       HEAP32[$156 >> 2] = $148; //@line 442
       $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 443
       HEAP32[$157 >> 2] = $147; //@line 444
       sp = STACKTOP; //@line 445
       return;
      }
     }
    }
    $159 = HEAP32[53] | 0; //@line 450
    $160 = HEAP32[46] | 0; //@line 451
    $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 452
    FUNCTION_TABLE_vi[$159 & 255]($160); //@line 453
    if (___async) {
     HEAP32[$ReallocAsyncCtx7 >> 2] = 44; //@line 456
     sp = STACKTOP; //@line 457
     return;
    }
    ___async_unwind = 0; //@line 460
    HEAP32[$ReallocAsyncCtx7 >> 2] = 44; //@line 461
    sp = STACKTOP; //@line 462
    return;
   }
  }
 } while (0);
 $161 = HEAP32[56] | 0; //@line 467
 if (!$161) {
  return;
 }
 $163 = HEAP32[57] | 0; //@line 472
 HEAP32[57] = 0; //@line 473
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 474
 FUNCTION_TABLE_v[$161 & 7](); //@line 475
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 45; //@line 478
  $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 479
  HEAP32[$164 >> 2] = $163; //@line 480
  sp = STACKTOP; //@line 481
  return;
 }
 ___async_unwind = 0; //@line 484
 HEAP32[$ReallocAsyncCtx8 >> 2] = 45; //@line 485
 $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 486
 HEAP32[$164 >> 2] = $163; //@line 487
 sp = STACKTOP; //@line 488
 return;
}
function _equeue_dispatch($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$02329$i$i = 0, $$02330$i$i = 0, $$025$i$i = 0, $$03956$i = 0, $$03956$i$phi = 0, $$04055$i = 0, $$0405571$i = 0, $$04063$i = 0, $$04159$i = 0, $$04258$i = 0, $$057$i = 0, $$067 = 0, $$06992 = 0, $$2 = 0, $$idx = 0, $$sink$in$i$i = 0, $$sroa$0$i = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 = 0, $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74 = 0, $10 = 0, $106 = 0, $11 = 0, $12 = 0, $129 = 0, $13 = 0, $131 = 0, $132 = 0, $133 = 0, $135 = 0, $136 = 0, $14 = 0, $144 = 0, $145 = 0, $147 = 0, $15 = 0, $150 = 0, $152 = 0, $155 = 0, $158 = 0, $165 = 0, $169 = 0, $172 = 0, $178 = 0, $2 = 0, $23 = 0, $24 = 0, $27 = 0, $33 = 0, $42 = 0, $45 = 0, $46 = 0, $48 = 0, $5 = 0, $6 = 0, $7 = 0, $72 = 0, $74 = 0, $77 = 0, $8 = 0, $9 = 0, $96 = 0, $97 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0, $$04159$i$looptemp = 0, $$04258$i$looptemp = 0;
 sp = STACKTOP; //@line 1077
 STACKTOP = STACKTOP + 16 | 0; //@line 1078
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1078
 $$sroa$0$i = sp; //@line 1079
 $2 = $0 + 184 | 0; //@line 1080
 if (!(HEAP8[$2 >> 0] | 0)) {
  HEAP8[$2 >> 0] = 1; //@line 1084
 }
 $5 = _equeue_tick() | 0; //@line 1086
 $6 = $5 + $1 | 0; //@line 1087
 $7 = $0 + 36 | 0; //@line 1088
 HEAP8[$7 >> 0] = 0; //@line 1089
 $8 = $0 + 128 | 0; //@line 1090
 $9 = $0 + 9 | 0; //@line 1091
 $10 = $0 + 4 | 0; //@line 1092
 $11 = ($1 | 0) > -1; //@line 1093
 $12 = $0 + 48 | 0; //@line 1094
 $13 = $0 + 8 | 0; //@line 1095
 $$idx = $0 + 16 | 0; //@line 1096
 $14 = $0 + 156 | 0; //@line 1097
 $15 = $0 + 24 | 0; //@line 1098
 $$0 = $5; //@line 1099
 L4 : while (1) {
  _equeue_mutex_lock($8); //@line 1101
  HEAP8[$9 >> 0] = (HEAPU8[$9 >> 0] | 0) + 1; //@line 1106
  if (((HEAP32[$10 >> 2] | 0) - $$0 | 0) < 1) {
   HEAP32[$10 >> 2] = $$0; //@line 1111
  }
  $23 = HEAP32[$0 >> 2] | 0; //@line 1113
  HEAP32[$$sroa$0$i >> 2] = $23; //@line 1114
  $24 = $23; //@line 1115
  L9 : do {
   if (!$23) {
    $$04055$i = $$sroa$0$i; //@line 1119
    $33 = $24; //@line 1119
    label = 10; //@line 1120
   } else {
    $$04063$i = $$sroa$0$i; //@line 1122
    $27 = $24; //@line 1122
    do {
     if (((HEAP32[$27 + 20 >> 2] | 0) - $$0 | 0) >= 1) {
      $$04055$i = $$04063$i; //@line 1129
      $33 = $27; //@line 1129
      label = 10; //@line 1130
      break L9;
     }
     $$04063$i = $27 + 8 | 0; //@line 1133
     $27 = HEAP32[$$04063$i >> 2] | 0; //@line 1134
    } while (($27 | 0) != 0);
    HEAP32[$0 >> 2] = 0; //@line 1142
    $$0405571$i = $$04063$i; //@line 1143
   }
  } while (0);
  if ((label | 0) == 10) {
   label = 0; //@line 1147
   HEAP32[$0 >> 2] = $33; //@line 1148
   if (!$33) {
    $$0405571$i = $$04055$i; //@line 1151
   } else {
    HEAP32[$33 + 16 >> 2] = $0; //@line 1154
    $$0405571$i = $$04055$i; //@line 1155
   }
  }
  HEAP32[$$0405571$i >> 2] = 0; //@line 1158
  _equeue_mutex_unlock($8); //@line 1159
  $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74 = HEAP32[$$sroa$0$i >> 2] | 0; //@line 1160
  if (!$$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74) {} else {
   $$04159$i = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$52$i74; //@line 1164
   $$04258$i = $$sroa$0$i; //@line 1164
   do {
    $$04258$i$looptemp = $$04258$i;
    $$04258$i = $$04159$i + 8 | 0; //@line 1166
    $$04159$i$looptemp = $$04159$i;
    $$04159$i = HEAP32[$$04258$i >> 2] | 0; //@line 1167
    $$03956$i = 0; //@line 1168
    $$057$i = $$04159$i$looptemp; //@line 1168
    while (1) {
     HEAP32[$$057$i + 8 >> 2] = $$03956$i; //@line 1171
     $42 = HEAP32[$$057$i + 12 >> 2] | 0; //@line 1173
     if (!$42) {
      break;
     } else {
      $$03956$i$phi = $$057$i; //@line 1178
      $$057$i = $42; //@line 1178
      $$03956$i = $$03956$i$phi; //@line 1178
     }
    }
    HEAP32[$$04258$i$looptemp >> 2] = $$057$i; //@line 1181
   } while (($$04159$i | 0) != 0);
   $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 = HEAP32[$$sroa$0$i >> 2] | 0; //@line 1189
   if ($$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75 | 0) {
    $$06992 = $$sroa$0$i$0$$sroa$0$0$$sroa$0$0$$0$4353$pre$i75; //@line 1192
    while (1) {
     $45 = $$06992 + 8 | 0; //@line 1194
     $46 = HEAP32[$45 >> 2] | 0; //@line 1195
     $48 = HEAP32[$$06992 + 32 >> 2] | 0; //@line 1197
     if ($48 | 0) {
      $AsyncCtx = _emscripten_alloc_async_context(84, sp) | 0; //@line 1201
      FUNCTION_TABLE_vi[$48 & 255]($$06992 + 36 | 0); //@line 1202
      if (___async) {
       label = 20; //@line 1205
       break L4;
      }
      _emscripten_free_async_context($AsyncCtx | 0); //@line 1208
     }
     $72 = HEAP32[$$06992 + 24 >> 2] | 0; //@line 1211
     if (($72 | 0) > -1) {
      $74 = $$06992 + 20 | 0; //@line 1214
      HEAP32[$74 >> 2] = (HEAP32[$74 >> 2] | 0) + $72; //@line 1217
      $77 = _equeue_tick() | 0; //@line 1218
      $AsyncCtx11 = _emscripten_alloc_async_context(76, sp) | 0; //@line 1219
      _equeue_enqueue($0, $$06992, $77) | 0; //@line 1220
      if (___async) {
       label = 24; //@line 1223
       break L4;
      }
      _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1226
     } else {
      $96 = $$06992 + 4 | 0; //@line 1229
      $97 = HEAP8[$96 >> 0] | 0; //@line 1230
      HEAP8[$96 >> 0] = (($97 + 1 & 255) << HEAP32[$$idx >> 2] | 0) == 0 ? 1 : ($97 & 255) + 1 & 255; //@line 1239
      $106 = HEAP32[$$06992 + 28 >> 2] | 0; //@line 1241
      if ($106 | 0) {
       $AsyncCtx3 = _emscripten_alloc_async_context(84, sp) | 0; //@line 1245
       FUNCTION_TABLE_vi[$106 & 255]($$06992 + 36 | 0); //@line 1246
       if (___async) {
        label = 28; //@line 1249
        break L4;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1252
      }
      _equeue_mutex_lock($14); //@line 1254
      $129 = HEAP32[$15 >> 2] | 0; //@line 1255
      L40 : do {
       if (!$129) {
        $$02329$i$i = $15; //@line 1259
        label = 36; //@line 1260
       } else {
        $131 = HEAP32[$$06992 >> 2] | 0; //@line 1262
        $$025$i$i = $15; //@line 1263
        $133 = $129; //@line 1263
        while (1) {
         $132 = HEAP32[$133 >> 2] | 0; //@line 1265
         if ($132 >>> 0 >= $131 >>> 0) {
          break;
         }
         $135 = $133 + 8 | 0; //@line 1270
         $136 = HEAP32[$135 >> 2] | 0; //@line 1271
         if (!$136) {
          $$02329$i$i = $135; //@line 1274
          label = 36; //@line 1275
          break L40;
         } else {
          $$025$i$i = $135; //@line 1278
          $133 = $136; //@line 1278
         }
        }
        if (($132 | 0) == ($131 | 0)) {
         HEAP32[$$06992 + 12 >> 2] = $133; //@line 1284
         $$02330$i$i = $$025$i$i; //@line 1287
         $$sink$in$i$i = (HEAP32[$$025$i$i >> 2] | 0) + 8 | 0; //@line 1287
        } else {
         $$02329$i$i = $$025$i$i; //@line 1289
         label = 36; //@line 1290
        }
       }
      } while (0);
      if ((label | 0) == 36) {
       label = 0; //@line 1295
       HEAP32[$$06992 + 12 >> 2] = 0; //@line 1297
       $$02330$i$i = $$02329$i$i; //@line 1298
       $$sink$in$i$i = $$02329$i$i; //@line 1298
      }
      HEAP32[$45 >> 2] = HEAP32[$$sink$in$i$i >> 2]; //@line 1301
      HEAP32[$$02330$i$i >> 2] = $$06992; //@line 1302
      _equeue_mutex_unlock($14); //@line 1303
     }
     if (!$46) {
      break;
     } else {
      $$06992 = $46; //@line 1309
     }
    }
   }
  }
  $144 = _equeue_tick() | 0; //@line 1314
  if ($11) {
   $145 = $6 - $144 | 0; //@line 1316
   if (($145 | 0) < 1) {
    label = 41; //@line 1319
    break;
   } else {
    $$067 = $145; //@line 1322
   }
  } else {
   $$067 = -1; //@line 1325
  }
  _equeue_mutex_lock($8); //@line 1327
  $165 = HEAP32[$0 >> 2] | 0; //@line 1328
  if (!$165) {
   $$2 = $$067; //@line 1331
  } else {
   $169 = (HEAP32[$165 + 20 >> 2] | 0) - $144 | 0; //@line 1335
   $172 = $169 & ~($169 >> 31); //@line 1338
   $$2 = $172 >>> 0 < $$067 >>> 0 ? $172 : $$067; //@line 1341
  }
  _equeue_mutex_unlock($8); //@line 1343
  _equeue_sema_wait($12, $$2) | 0; //@line 1344
  if (HEAP8[$13 >> 0] | 0) {
   _equeue_mutex_lock($8); //@line 1348
   if (HEAP8[$13 >> 0] | 0) {
    label = 53; //@line 1352
    break;
   }
   _equeue_mutex_unlock($8); //@line 1355
  }
  $178 = _equeue_tick() | 0; //@line 1357
  $AsyncCtx15 = _emscripten_alloc_async_context(76, sp) | 0; //@line 1358
  _wait_ms(20); //@line 1359
  if (___async) {
   label = 56; //@line 1362
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1365
  $$0 = $178; //@line 1366
 }
 if ((label | 0) == 20) {
  HEAP32[$AsyncCtx >> 2] = 28; //@line 1369
  HEAP32[$AsyncCtx + 4 >> 2] = $$sroa$0$i; //@line 1371
  HEAP32[$AsyncCtx + 8 >> 2] = $$sroa$0$i; //@line 1373
  HEAP32[$AsyncCtx + 12 >> 2] = $46; //@line 1375
  HEAP32[$AsyncCtx + 16 >> 2] = $8; //@line 1377
  HEAP32[$AsyncCtx + 20 >> 2] = $13; //@line 1379
  HEAP32[$AsyncCtx + 24 >> 2] = $0; //@line 1381
  HEAP32[$AsyncCtx + 28 >> 2] = $12; //@line 1383
  HEAP32[$AsyncCtx + 32 >> 2] = $10; //@line 1385
  HEAP32[$AsyncCtx + 36 >> 2] = $0; //@line 1387
  HEAP32[$AsyncCtx + 40 >> 2] = $9; //@line 1389
  HEAP32[$AsyncCtx + 44 >> 2] = $7; //@line 1391
  HEAP32[$AsyncCtx + 48 >> 2] = $0; //@line 1393
  HEAP32[$AsyncCtx + 52 >> 2] = $$sroa$0$i; //@line 1395
  HEAP32[$AsyncCtx + 56 >> 2] = $6; //@line 1397
  HEAP8[$AsyncCtx + 60 >> 0] = $11 & 1; //@line 1400
  HEAP32[$AsyncCtx + 64 >> 2] = $15; //@line 1402
  HEAP32[$AsyncCtx + 68 >> 2] = $$06992; //@line 1404
  HEAP32[$AsyncCtx + 72 >> 2] = $45; //@line 1406
  HEAP32[$AsyncCtx + 76 >> 2] = $14; //@line 1408
  HEAP32[$AsyncCtx + 80 >> 2] = $$idx; //@line 1410
  sp = STACKTOP; //@line 1411
  STACKTOP = sp; //@line 1412
  return;
 } else if ((label | 0) == 24) {
  HEAP32[$AsyncCtx11 >> 2] = 29; //@line 1415
  HEAP32[$AsyncCtx11 + 4 >> 2] = $$sroa$0$i; //@line 1417
  HEAP32[$AsyncCtx11 + 8 >> 2] = $$sroa$0$i; //@line 1419
  HEAP32[$AsyncCtx11 + 12 >> 2] = $46; //@line 1421
  HEAP32[$AsyncCtx11 + 16 >> 2] = $8; //@line 1423
  HEAP32[$AsyncCtx11 + 20 >> 2] = $7; //@line 1425
  HEAP32[$AsyncCtx11 + 24 >> 2] = $13; //@line 1427
  HEAP32[$AsyncCtx11 + 28 >> 2] = $0; //@line 1429
  HEAP32[$AsyncCtx11 + 32 >> 2] = $12; //@line 1431
  HEAP32[$AsyncCtx11 + 36 >> 2] = $10; //@line 1433
  HEAP32[$AsyncCtx11 + 40 >> 2] = $0; //@line 1435
  HEAP32[$AsyncCtx11 + 44 >> 2] = $9; //@line 1437
  HEAP32[$AsyncCtx11 + 48 >> 2] = $0; //@line 1439
  HEAP32[$AsyncCtx11 + 52 >> 2] = $$sroa$0$i; //@line 1441
  HEAP32[$AsyncCtx11 + 56 >> 2] = $6; //@line 1443
  HEAP8[$AsyncCtx11 + 60 >> 0] = $11 & 1; //@line 1446
  HEAP32[$AsyncCtx11 + 64 >> 2] = $15; //@line 1448
  HEAP32[$AsyncCtx11 + 68 >> 2] = $14; //@line 1450
  HEAP32[$AsyncCtx11 + 72 >> 2] = $$idx; //@line 1452
  sp = STACKTOP; //@line 1453
  STACKTOP = sp; //@line 1454
  return;
 } else if ((label | 0) == 28) {
  HEAP32[$AsyncCtx3 >> 2] = 30; //@line 1457
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$sroa$0$i; //@line 1459
  HEAP32[$AsyncCtx3 + 8 >> 2] = $$sroa$0$i; //@line 1461
  HEAP32[$AsyncCtx3 + 12 >> 2] = $46; //@line 1463
  HEAP32[$AsyncCtx3 + 16 >> 2] = $8; //@line 1465
  HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 1467
  HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 1469
  HEAP32[$AsyncCtx3 + 28 >> 2] = $12; //@line 1471
  HEAP32[$AsyncCtx3 + 32 >> 2] = $10; //@line 1473
  HEAP32[$AsyncCtx3 + 36 >> 2] = $0; //@line 1475
  HEAP32[$AsyncCtx3 + 40 >> 2] = $9; //@line 1477
  HEAP32[$AsyncCtx3 + 44 >> 2] = $7; //@line 1479
  HEAP32[$AsyncCtx3 + 48 >> 2] = $0; //@line 1481
  HEAP32[$AsyncCtx3 + 52 >> 2] = $$sroa$0$i; //@line 1483
  HEAP32[$AsyncCtx3 + 56 >> 2] = $6; //@line 1485
  HEAP8[$AsyncCtx3 + 60 >> 0] = $11 & 1; //@line 1488
  HEAP32[$AsyncCtx3 + 64 >> 2] = $15; //@line 1490
  HEAP32[$AsyncCtx3 + 68 >> 2] = $14; //@line 1492
  HEAP32[$AsyncCtx3 + 72 >> 2] = $$idx; //@line 1494
  HEAP32[$AsyncCtx3 + 76 >> 2] = $$06992; //@line 1496
  HEAP32[$AsyncCtx3 + 80 >> 2] = $45; //@line 1498
  sp = STACKTOP; //@line 1499
  STACKTOP = sp; //@line 1500
  return;
 } else if ((label | 0) == 41) {
  $147 = $0 + 40 | 0; //@line 1503
  if (HEAP32[$147 >> 2] | 0) {
   _equeue_mutex_lock($8); //@line 1507
   $150 = HEAP32[$147 >> 2] | 0; //@line 1508
   do {
    if ($150 | 0) {
     $152 = HEAP32[$0 >> 2] | 0; //@line 1512
     if ($152 | 0) {
      $155 = HEAP32[$0 + 44 >> 2] | 0; //@line 1516
      $158 = (HEAP32[$152 + 20 >> 2] | 0) - $144 | 0; //@line 1519
      $AsyncCtx7 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1523
      FUNCTION_TABLE_vii[$150 & 3]($155, $158 & ~($158 >> 31)); //@line 1524
      if (___async) {
       HEAP32[$AsyncCtx7 >> 2] = 31; //@line 1527
       HEAP32[$AsyncCtx7 + 4 >> 2] = $7; //@line 1529
       HEAP32[$AsyncCtx7 + 8 >> 2] = $8; //@line 1531
       HEAP32[$AsyncCtx7 + 12 >> 2] = $13; //@line 1533
       sp = STACKTOP; //@line 1534
       STACKTOP = sp; //@line 1535
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1537
       break;
      }
     }
    }
   } while (0);
   HEAP8[$7 >> 0] = 1; //@line 1543
   _equeue_mutex_unlock($8); //@line 1544
  }
  HEAP8[$13 >> 0] = 0; //@line 1546
  STACKTOP = sp; //@line 1547
  return;
 } else if ((label | 0) == 53) {
  HEAP8[$13 >> 0] = 0; //@line 1550
  _equeue_mutex_unlock($8); //@line 1551
  STACKTOP = sp; //@line 1552
  return;
 } else if ((label | 0) == 56) {
  HEAP32[$AsyncCtx15 >> 2] = 32; //@line 1555
  HEAP32[$AsyncCtx15 + 4 >> 2] = $$sroa$0$i; //@line 1557
  HEAP32[$AsyncCtx15 + 8 >> 2] = $$sroa$0$i; //@line 1559
  HEAP32[$AsyncCtx15 + 12 >> 2] = $8; //@line 1561
  HEAP32[$AsyncCtx15 + 16 >> 2] = $7; //@line 1563
  HEAP32[$AsyncCtx15 + 20 >> 2] = $13; //@line 1565
  HEAP32[$AsyncCtx15 + 24 >> 2] = $0; //@line 1567
  HEAP32[$AsyncCtx15 + 28 >> 2] = $12; //@line 1569
  HEAP32[$AsyncCtx15 + 32 >> 2] = $10; //@line 1571
  HEAP32[$AsyncCtx15 + 36 >> 2] = $0; //@line 1573
  HEAP32[$AsyncCtx15 + 40 >> 2] = $178; //@line 1575
  HEAP32[$AsyncCtx15 + 44 >> 2] = $9; //@line 1577
  HEAP32[$AsyncCtx15 + 48 >> 2] = $0; //@line 1579
  HEAP32[$AsyncCtx15 + 52 >> 2] = $$sroa$0$i; //@line 1581
  HEAP32[$AsyncCtx15 + 56 >> 2] = $6; //@line 1583
  HEAP8[$AsyncCtx15 + 60 >> 0] = $11 & 1; //@line 1586
  HEAP32[$AsyncCtx15 + 64 >> 2] = $15; //@line 1588
  HEAP32[$AsyncCtx15 + 68 >> 2] = $14; //@line 1590
  HEAP32[$AsyncCtx15 + 72 >> 2] = $$idx; //@line 1592
  sp = STACKTOP; //@line 1593
  STACKTOP = sp; //@line 1594
  return;
 }
}
function _twoway_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0166 = 0, $$0168 = 0, $$0169 = 0, $$0169$be = 0, $$0170 = 0, $$0175$ph$ph$lcssa216 = 0, $$0175$ph$ph$lcssa216328 = 0, $$0175$ph$ph254 = 0, $$0179242 = 0, $$0183$ph197$ph253 = 0, $$0183$ph197248 = 0, $$0183$ph260 = 0, $$0185$ph$lcssa = 0, $$0185$ph$lcssa327 = 0, $$0185$ph259 = 0, $$0187219$ph325326 = 0, $$0187263 = 0, $$1176$$0175 = 0, $$1176$ph$ph$lcssa208 = 0, $$1176$ph$ph233 = 0, $$1180222 = 0, $$1184$ph193$ph232 = 0, $$1184$ph193227 = 0, $$1184$ph239 = 0, $$1186$$0185 = 0, $$1186$ph$lcssa = 0, $$1186$ph238 = 0, $$2181$sink = 0, $$3 = 0, $$3173 = 0, $$3178 = 0, $$3182221 = 0, $$4 = 0, $$pr = 0, $10 = 0, $105 = 0, $111 = 0, $113 = 0, $118 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $14 = 0, $2 = 0, $23 = 0, $25 = 0, $27 = 0, $3 = 0, $32 = 0, $34 = 0, $37 = 0, $4 = 0, $41 = 0, $45 = 0, $50 = 0, $52 = 0, $53 = 0, $56 = 0, $60 = 0, $68 = 0, $70 = 0, $74 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $83 = 0, $86 = 0, $93 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11031
 STACKTOP = STACKTOP + 1056 | 0; //@line 11032
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(1056); //@line 11032
 $2 = sp + 1024 | 0; //@line 11033
 $3 = sp; //@line 11034
 HEAP32[$2 >> 2] = 0; //@line 11035
 HEAP32[$2 + 4 >> 2] = 0; //@line 11035
 HEAP32[$2 + 8 >> 2] = 0; //@line 11035
 HEAP32[$2 + 12 >> 2] = 0; //@line 11035
 HEAP32[$2 + 16 >> 2] = 0; //@line 11035
 HEAP32[$2 + 20 >> 2] = 0; //@line 11035
 HEAP32[$2 + 24 >> 2] = 0; //@line 11035
 HEAP32[$2 + 28 >> 2] = 0; //@line 11035
 $4 = HEAP8[$1 >> 0] | 0; //@line 11036
 L1 : do {
  if (!($4 << 24 >> 24)) {
   $$0175$ph$ph$lcssa216328 = 1; //@line 11040
   $$0185$ph$lcssa327 = -1; //@line 11040
   $$0187219$ph325326 = 0; //@line 11040
   $$1176$ph$ph$lcssa208 = 1; //@line 11040
   $$1186$ph$lcssa = -1; //@line 11040
   label = 26; //@line 11041
  } else {
   $$0187263 = 0; //@line 11043
   $10 = $4; //@line 11043
   do {
    if (!(HEAP8[$0 + $$0187263 >> 0] | 0)) {
     $$3 = 0; //@line 11049
     break L1;
    }
    $14 = $2 + ((($10 & 255) >>> 5 & 255) << 2) | 0; //@line 11057
    HEAP32[$14 >> 2] = HEAP32[$14 >> 2] | 1 << ($10 & 31); //@line 11060
    $$0187263 = $$0187263 + 1 | 0; //@line 11061
    HEAP32[$3 + (($10 & 255) << 2) >> 2] = $$0187263; //@line 11064
    $10 = HEAP8[$1 + $$0187263 >> 0] | 0; //@line 11066
   } while ($10 << 24 >> 24 != 0);
   $23 = $$0187263 >>> 0 > 1; //@line 11074
   if ($23) {
    $$0183$ph260 = 0; //@line 11076
    $$0185$ph259 = -1; //@line 11076
    $130 = 1; //@line 11076
    L6 : while (1) {
     $$0175$ph$ph254 = 1; //@line 11078
     $$0183$ph197$ph253 = $$0183$ph260; //@line 11078
     $131 = $130; //@line 11078
     while (1) {
      $$0183$ph197248 = $$0183$ph197$ph253; //@line 11080
      $132 = $131; //@line 11080
      L10 : while (1) {
       $$0179242 = 1; //@line 11082
       $25 = $132; //@line 11082
       while (1) {
        $32 = HEAP8[$1 + ($$0179242 + $$0185$ph259) >> 0] | 0; //@line 11086
        $34 = HEAP8[$1 + $25 >> 0] | 0; //@line 11088
        if ($32 << 24 >> 24 != $34 << 24 >> 24) {
         break L10;
        }
        if (($$0179242 | 0) == ($$0175$ph$ph254 | 0)) {
         break;
        }
        $$0179242 = $$0179242 + 1 | 0; //@line 11094
        $27 = $$0179242 + $$0183$ph197248 | 0; //@line 11098
        if ($27 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 11103
         $$0185$ph$lcssa = $$0185$ph259; //@line 11103
         break L6;
        } else {
         $25 = $27; //@line 11101
        }
       }
       $37 = $$0175$ph$ph254 + $$0183$ph197248 | 0; //@line 11107
       $132 = $37 + 1 | 0; //@line 11108
       if ($132 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 11113
        $$0185$ph$lcssa = $$0185$ph259; //@line 11113
        break L6;
       } else {
        $$0183$ph197248 = $37; //@line 11111
       }
      }
      $41 = $25 - $$0185$ph259 | 0; //@line 11118
      if (($32 & 255) <= ($34 & 255)) {
       break;
      }
      $131 = $25 + 1 | 0; //@line 11122
      if ($131 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216 = $41; //@line 11127
       $$0185$ph$lcssa = $$0185$ph259; //@line 11127
       break L6;
      } else {
       $$0175$ph$ph254 = $41; //@line 11125
       $$0183$ph197$ph253 = $25; //@line 11125
      }
     }
     $130 = $$0183$ph197248 + 2 | 0; //@line 11132
     if ($130 >>> 0 >= $$0187263 >>> 0) {
      $$0175$ph$ph$lcssa216 = 1; //@line 11137
      $$0185$ph$lcssa = $$0183$ph197248; //@line 11137
      break;
     } else {
      $$0183$ph260 = $$0183$ph197248 + 1 | 0; //@line 11135
      $$0185$ph259 = $$0183$ph197248; //@line 11135
     }
    }
    if ($23) {
     $$1184$ph239 = 0; //@line 11142
     $$1186$ph238 = -1; //@line 11142
     $133 = 1; //@line 11142
     while (1) {
      $$1176$ph$ph233 = 1; //@line 11144
      $$1184$ph193$ph232 = $$1184$ph239; //@line 11144
      $135 = $133; //@line 11144
      while (1) {
       $$1184$ph193227 = $$1184$ph193$ph232; //@line 11146
       $134 = $135; //@line 11146
       L25 : while (1) {
        $$1180222 = 1; //@line 11148
        $52 = $134; //@line 11148
        while (1) {
         $50 = HEAP8[$1 + ($$1180222 + $$1186$ph238) >> 0] | 0; //@line 11152
         $53 = HEAP8[$1 + $52 >> 0] | 0; //@line 11154
         if ($50 << 24 >> 24 != $53 << 24 >> 24) {
          break L25;
         }
         if (($$1180222 | 0) == ($$1176$ph$ph233 | 0)) {
          break;
         }
         $$1180222 = $$1180222 + 1 | 0; //@line 11160
         $45 = $$1180222 + $$1184$ph193227 | 0; //@line 11164
         if ($45 >>> 0 >= $$0187263 >>> 0) {
          $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11169
          $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11169
          $$0187219$ph325326 = $$0187263; //@line 11169
          $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 11169
          $$1186$ph$lcssa = $$1186$ph238; //@line 11169
          label = 26; //@line 11170
          break L1;
         } else {
          $52 = $45; //@line 11167
         }
        }
        $56 = $$1176$ph$ph233 + $$1184$ph193227 | 0; //@line 11174
        $134 = $56 + 1 | 0; //@line 11175
        if ($134 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11180
         $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11180
         $$0187219$ph325326 = $$0187263; //@line 11180
         $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 11180
         $$1186$ph$lcssa = $$1186$ph238; //@line 11180
         label = 26; //@line 11181
         break L1;
        } else {
         $$1184$ph193227 = $56; //@line 11178
        }
       }
       $60 = $52 - $$1186$ph238 | 0; //@line 11186
       if (($50 & 255) >= ($53 & 255)) {
        break;
       }
       $135 = $52 + 1 | 0; //@line 11190
       if ($135 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11195
        $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11195
        $$0187219$ph325326 = $$0187263; //@line 11195
        $$1176$ph$ph$lcssa208 = $60; //@line 11195
        $$1186$ph$lcssa = $$1186$ph238; //@line 11195
        label = 26; //@line 11196
        break L1;
       } else {
        $$1176$ph$ph233 = $60; //@line 11193
        $$1184$ph193$ph232 = $52; //@line 11193
       }
      }
      $133 = $$1184$ph193227 + 2 | 0; //@line 11201
      if ($133 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11206
       $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11206
       $$0187219$ph325326 = $$0187263; //@line 11206
       $$1176$ph$ph$lcssa208 = 1; //@line 11206
       $$1186$ph$lcssa = $$1184$ph193227; //@line 11206
       label = 26; //@line 11207
       break;
      } else {
       $$1184$ph239 = $$1184$ph193227 + 1 | 0; //@line 11204
       $$1186$ph238 = $$1184$ph193227; //@line 11204
      }
     }
    } else {
     $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11212
     $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11212
     $$0187219$ph325326 = $$0187263; //@line 11212
     $$1176$ph$ph$lcssa208 = 1; //@line 11212
     $$1186$ph$lcssa = -1; //@line 11212
     label = 26; //@line 11213
    }
   } else {
    $$0175$ph$ph$lcssa216328 = 1; //@line 11216
    $$0185$ph$lcssa327 = -1; //@line 11216
    $$0187219$ph325326 = $$0187263; //@line 11216
    $$1176$ph$ph$lcssa208 = 1; //@line 11216
    $$1186$ph$lcssa = -1; //@line 11216
    label = 26; //@line 11217
   }
  }
 } while (0);
 L35 : do {
  if ((label | 0) == 26) {
   $68 = ($$1186$ph$lcssa + 1 | 0) >>> 0 > ($$0185$ph$lcssa327 + 1 | 0) >>> 0; //@line 11225
   $$1176$$0175 = $68 ? $$1176$ph$ph$lcssa208 : $$0175$ph$ph$lcssa216328; //@line 11226
   $$1186$$0185 = $68 ? $$1186$ph$lcssa : $$0185$ph$lcssa327; //@line 11227
   $70 = $$1186$$0185 + 1 | 0; //@line 11229
   if (!(_memcmp($1, $1 + $$1176$$0175 | 0, $70) | 0)) {
    $$0168 = $$0187219$ph325326 - $$1176$$0175 | 0; //@line 11234
    $$3178 = $$1176$$0175; //@line 11234
   } else {
    $74 = $$0187219$ph325326 - $$1186$$0185 + -1 | 0; //@line 11237
    $$0168 = 0; //@line 11241
    $$3178 = ($$1186$$0185 >>> 0 > $74 >>> 0 ? $$1186$$0185 : $74) + 1 | 0; //@line 11241
   }
   $78 = $$0187219$ph325326 | 63; //@line 11243
   $79 = $$0187219$ph325326 + -1 | 0; //@line 11244
   $80 = ($$0168 | 0) != 0; //@line 11245
   $81 = $$0187219$ph325326 - $$3178 | 0; //@line 11246
   $$0166 = $0; //@line 11247
   $$0169 = 0; //@line 11247
   $$0170 = $0; //@line 11247
   while (1) {
    $83 = $$0166; //@line 11250
    do {
     if (($$0170 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
      $86 = _memchr($$0170, 0, $78) | 0; //@line 11255
      if (!$86) {
       $$3173 = $$0170 + $78 | 0; //@line 11259
       break;
      } else {
       if (($86 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
        $$3 = 0; //@line 11266
        break L35;
       } else {
        $$3173 = $86; //@line 11269
        break;
       }
      }
     } else {
      $$3173 = $$0170; //@line 11274
     }
    } while (0);
    $93 = HEAP8[$$0166 + $79 >> 0] | 0; //@line 11278
    L49 : do {
     if (!(1 << ($93 & 31) & HEAP32[$2 + ((($93 & 255) >>> 5 & 255) << 2) >> 2])) {
      $$0169$be = 0; //@line 11290
      $$2181$sink = $$0187219$ph325326; //@line 11290
     } else {
      $105 = $$0187219$ph325326 - (HEAP32[$3 + (($93 & 255) << 2) >> 2] | 0) | 0; //@line 11295
      if ($105 | 0) {
       $$0169$be = 0; //@line 11303
       $$2181$sink = $80 & ($$0169 | 0) != 0 & $105 >>> 0 < $$3178 >>> 0 ? $81 : $105; //@line 11303
       break;
      }
      $111 = $70 >>> 0 > $$0169 >>> 0 ? $70 : $$0169; //@line 11307
      $113 = HEAP8[$1 + $111 >> 0] | 0; //@line 11309
      L54 : do {
       if (!($113 << 24 >> 24)) {
        $$4 = $70; //@line 11313
       } else {
        $$3182221 = $111; //@line 11315
        $$pr = $113; //@line 11315
        while (1) {
         if ($$pr << 24 >> 24 != (HEAP8[$$0166 + $$3182221 >> 0] | 0)) {
          break;
         }
         $118 = $$3182221 + 1 | 0; //@line 11323
         $$pr = HEAP8[$1 + $118 >> 0] | 0; //@line 11325
         if (!($$pr << 24 >> 24)) {
          $$4 = $70; //@line 11328
          break L54;
         } else {
          $$3182221 = $118; //@line 11331
         }
        }
        $$0169$be = 0; //@line 11335
        $$2181$sink = $$3182221 - $$1186$$0185 | 0; //@line 11335
        break L49;
       }
      } while (0);
      while (1) {
       if ($$4 >>> 0 <= $$0169 >>> 0) {
        $$3 = $$0166; //@line 11342
        break L35;
       }
       $$4 = $$4 + -1 | 0; //@line 11345
       if ((HEAP8[$1 + $$4 >> 0] | 0) != (HEAP8[$$0166 + $$4 >> 0] | 0)) {
        $$0169$be = $$0168; //@line 11354
        $$2181$sink = $$3178; //@line 11354
        break;
       }
      }
     }
    } while (0);
    $$0166 = $$0166 + $$2181$sink | 0; //@line 11361
    $$0169 = $$0169$be; //@line 11361
    $$0170 = $$3173; //@line 11361
   }
  }
 } while (0);
 STACKTOP = sp; //@line 11365
 return $$3 | 0; //@line 11365
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12835
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12841
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 12850
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 12855
      $19 = $1 + 44 | 0; //@line 12856
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 12865
      $26 = $1 + 52 | 0; //@line 12866
      $27 = $1 + 53 | 0; //@line 12867
      $28 = $1 + 54 | 0; //@line 12868
      $29 = $0 + 8 | 0; //@line 12869
      $30 = $1 + 24 | 0; //@line 12870
      $$081$off0 = 0; //@line 12871
      $$084 = $0 + 16 | 0; //@line 12871
      $$085$off0 = 0; //@line 12871
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 12875
        label = 20; //@line 12876
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 12879
       HEAP8[$27 >> 0] = 0; //@line 12880
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 12881
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 12882
       if (___async) {
        label = 12; //@line 12885
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 12888
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 12892
        label = 20; //@line 12893
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 12900
         $$186$off0 = $$085$off0; //@line 12900
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 12909
           label = 20; //@line 12910
           break L10;
          } else {
           $$182$off0 = 1; //@line 12913
           $$186$off0 = $$085$off0; //@line 12913
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 12920
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 12927
          break L10;
         } else {
          $$182$off0 = 1; //@line 12930
          $$186$off0 = 1; //@line 12930
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 12935
       $$084 = $$084 + 8 | 0; //@line 12935
       $$085$off0 = $$186$off0; //@line 12935
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 128; //@line 12938
       HEAP32[$AsyncCtx15 + 4 >> 2] = $19; //@line 12940
       HEAP32[$AsyncCtx15 + 8 >> 2] = $30; //@line 12942
       HEAP32[$AsyncCtx15 + 12 >> 2] = $28; //@line 12944
       HEAP8[$AsyncCtx15 + 16 >> 0] = $$081$off0 & 1; //@line 12947
       HEAP8[$AsyncCtx15 + 17 >> 0] = $$085$off0 & 1; //@line 12950
       HEAP32[$AsyncCtx15 + 20 >> 2] = $2; //@line 12952
       HEAP32[$AsyncCtx15 + 24 >> 2] = $13; //@line 12954
       HEAP32[$AsyncCtx15 + 28 >> 2] = $1; //@line 12956
       HEAP32[$AsyncCtx15 + 32 >> 2] = $29; //@line 12958
       HEAP32[$AsyncCtx15 + 36 >> 2] = $$084; //@line 12960
       HEAP32[$AsyncCtx15 + 40 >> 2] = $26; //@line 12962
       HEAP32[$AsyncCtx15 + 44 >> 2] = $27; //@line 12964
       HEAP8[$AsyncCtx15 + 48 >> 0] = $4 & 1; //@line 12967
       HEAP32[$AsyncCtx15 + 52 >> 2] = $25; //@line 12969
       sp = STACKTOP; //@line 12970
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 12976
         $61 = $1 + 40 | 0; //@line 12977
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 12980
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 12988
           if ($$283$off0) {
            label = 25; //@line 12990
            break;
           } else {
            $69 = 4; //@line 12993
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 13000
        } else {
         $69 = 4; //@line 13002
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 13007
      }
      HEAP32[$19 >> 2] = $69; //@line 13009
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 13018
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 13023
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 13024
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 13025
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 13026
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 129; //@line 13029
    HEAP32[$AsyncCtx11 + 4 >> 2] = $73; //@line 13031
    HEAP32[$AsyncCtx11 + 8 >> 2] = $1; //@line 13033
    HEAP32[$AsyncCtx11 + 12 >> 2] = $2; //@line 13035
    HEAP32[$AsyncCtx11 + 16 >> 2] = $3; //@line 13037
    HEAP8[$AsyncCtx11 + 20 >> 0] = $4 & 1; //@line 13040
    HEAP32[$AsyncCtx11 + 24 >> 2] = $0; //@line 13042
    HEAP32[$AsyncCtx11 + 28 >> 2] = $72; //@line 13044
    sp = STACKTOP; //@line 13045
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 13048
   $81 = $0 + 24 | 0; //@line 13049
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 13053
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 13057
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 13064
       $$2 = $81; //@line 13065
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 13077
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 13078
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 13083
        $136 = $$2 + 8 | 0; //@line 13084
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 13087
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 132; //@line 13092
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 13094
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 13096
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 13098
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 13100
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 13102
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 13104
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 13106
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 13109
       sp = STACKTOP; //@line 13110
       return;
      }
      $104 = $1 + 24 | 0; //@line 13113
      $105 = $1 + 54 | 0; //@line 13114
      $$1 = $81; //@line 13115
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 13131
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 13132
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13137
       $122 = $$1 + 8 | 0; //@line 13138
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 13141
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 131; //@line 13146
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 13148
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 13150
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 13152
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 13154
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 13156
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 13158
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 13160
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 13162
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 13165
      sp = STACKTOP; //@line 13166
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 13170
    $$0 = $81; //@line 13171
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 13178
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 13179
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 13184
     $100 = $$0 + 8 | 0; //@line 13185
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 13188
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 130; //@line 13193
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 13195
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 13197
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 13199
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 13201
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 13203
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 13205
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 13208
    sp = STACKTOP; //@line 13209
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
 $n_sroa_0_0_extract_trunc = $a$0; //@line 6713
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 6714
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 6715
 $d_sroa_0_0_extract_trunc = $b$0; //@line 6716
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 6717
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 6718
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 6720
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 6723
    HEAP32[$rem + 4 >> 2] = 0; //@line 6724
   }
   $_0$1 = 0; //@line 6726
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 6727
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6728
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 6731
    $_0$0 = 0; //@line 6732
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6733
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 6735
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 6736
   $_0$1 = 0; //@line 6737
   $_0$0 = 0; //@line 6738
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6739
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 6742
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 6747
     HEAP32[$rem + 4 >> 2] = 0; //@line 6748
    }
    $_0$1 = 0; //@line 6750
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 6751
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6752
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 6756
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 6757
    }
    $_0$1 = 0; //@line 6759
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 6760
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6761
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 6763
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 6766
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 6767
    }
    $_0$1 = 0; //@line 6769
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 6770
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6771
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 6774
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 6776
    $58 = 31 - $51 | 0; //@line 6777
    $sr_1_ph = $57; //@line 6778
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 6779
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 6780
    $q_sroa_0_1_ph = 0; //@line 6781
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 6782
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 6786
    $_0$0 = 0; //@line 6787
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6788
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 6790
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 6791
   $_0$1 = 0; //@line 6792
   $_0$0 = 0; //@line 6793
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6794
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 6798
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 6800
     $126 = 31 - $119 | 0; //@line 6801
     $130 = $119 - 31 >> 31; //@line 6802
     $sr_1_ph = $125; //@line 6803
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 6804
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 6805
     $q_sroa_0_1_ph = 0; //@line 6806
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 6807
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 6811
     $_0$0 = 0; //@line 6812
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6813
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 6815
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 6816
    $_0$1 = 0; //@line 6817
    $_0$0 = 0; //@line 6818
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6819
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 6821
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 6824
    $89 = 64 - $88 | 0; //@line 6825
    $91 = 32 - $88 | 0; //@line 6826
    $92 = $91 >> 31; //@line 6827
    $95 = $88 - 32 | 0; //@line 6828
    $105 = $95 >> 31; //@line 6829
    $sr_1_ph = $88; //@line 6830
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 6831
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 6832
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 6833
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 6834
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 6838
    HEAP32[$rem + 4 >> 2] = 0; //@line 6839
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 6842
    $_0$0 = $a$0 | 0 | 0; //@line 6843
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6844
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 6846
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 6847
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 6848
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6849
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 6854
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 6855
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 6856
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 6857
  $carry_0_lcssa$1 = 0; //@line 6858
  $carry_0_lcssa$0 = 0; //@line 6859
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 6861
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 6862
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 6863
  $137$1 = tempRet0; //@line 6864
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 6865
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 6866
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 6867
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 6868
  $sr_1202 = $sr_1_ph; //@line 6869
  $carry_0203 = 0; //@line 6870
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 6872
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 6873
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 6874
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 6875
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 6876
   $150$1 = tempRet0; //@line 6877
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 6878
   $carry_0203 = $151$0 & 1; //@line 6879
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 6881
   $r_sroa_1_1200 = tempRet0; //@line 6882
   $sr_1202 = $sr_1202 - 1 | 0; //@line 6883
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 6895
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 6896
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 6897
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 6898
  $carry_0_lcssa$1 = 0; //@line 6899
  $carry_0_lcssa$0 = $carry_0203; //@line 6900
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 6902
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 6903
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 6906
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 6907
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 6909
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 6910
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6911
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2485
 STACKTOP = STACKTOP + 32 | 0; //@line 2486
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 2486
 $0 = sp; //@line 2487
 _gpio_init_out($0, 50); //@line 2488
 while (1) {
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2491
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2492
  _wait_ms(150); //@line 2493
  if (___async) {
   label = 3; //@line 2496
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 2499
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2501
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2502
  _wait_ms(150); //@line 2503
  if (___async) {
   label = 5; //@line 2506
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 2509
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2511
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2512
  _wait_ms(150); //@line 2513
  if (___async) {
   label = 7; //@line 2516
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 2519
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2521
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2522
  _wait_ms(150); //@line 2523
  if (___async) {
   label = 9; //@line 2526
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 2529
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2531
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2532
  _wait_ms(150); //@line 2533
  if (___async) {
   label = 11; //@line 2536
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 2539
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2541
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2542
  _wait_ms(150); //@line 2543
  if (___async) {
   label = 13; //@line 2546
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 2549
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2551
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2552
  _wait_ms(150); //@line 2553
  if (___async) {
   label = 15; //@line 2556
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 2559
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2561
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2562
  _wait_ms(150); //@line 2563
  if (___async) {
   label = 17; //@line 2566
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 2569
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2571
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2572
  _wait_ms(400); //@line 2573
  if (___async) {
   label = 19; //@line 2576
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 2579
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2581
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2582
  _wait_ms(400); //@line 2583
  if (___async) {
   label = 21; //@line 2586
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 2589
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2591
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2592
  _wait_ms(400); //@line 2593
  if (___async) {
   label = 23; //@line 2596
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 2599
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2601
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2602
  _wait_ms(400); //@line 2603
  if (___async) {
   label = 25; //@line 2606
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 2609
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2611
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2612
  _wait_ms(400); //@line 2613
  if (___async) {
   label = 27; //@line 2616
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 2619
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2621
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2622
  _wait_ms(400); //@line 2623
  if (___async) {
   label = 29; //@line 2626
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2629
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2631
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2632
  _wait_ms(400); //@line 2633
  if (___async) {
   label = 31; //@line 2636
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2639
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2641
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2642
  _wait_ms(400); //@line 2643
  if (___async) {
   label = 33; //@line 2646
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2649
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 48; //@line 2653
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 2655
   sp = STACKTOP; //@line 2656
   STACKTOP = sp; //@line 2657
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 49; //@line 2661
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 2663
   sp = STACKTOP; //@line 2664
   STACKTOP = sp; //@line 2665
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 50; //@line 2669
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 2671
   sp = STACKTOP; //@line 2672
   STACKTOP = sp; //@line 2673
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 51; //@line 2677
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 2679
   sp = STACKTOP; //@line 2680
   STACKTOP = sp; //@line 2681
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 52; //@line 2685
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 2687
   sp = STACKTOP; //@line 2688
   STACKTOP = sp; //@line 2689
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 53; //@line 2693
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 2695
   sp = STACKTOP; //@line 2696
   STACKTOP = sp; //@line 2697
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 54; //@line 2701
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 2703
   sp = STACKTOP; //@line 2704
   STACKTOP = sp; //@line 2705
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 55; //@line 2709
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 2711
   sp = STACKTOP; //@line 2712
   STACKTOP = sp; //@line 2713
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 56; //@line 2717
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 2719
   sp = STACKTOP; //@line 2720
   STACKTOP = sp; //@line 2721
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 57; //@line 2725
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 2727
   sp = STACKTOP; //@line 2728
   STACKTOP = sp; //@line 2729
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 58; //@line 2733
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 2735
   sp = STACKTOP; //@line 2736
   STACKTOP = sp; //@line 2737
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 59; //@line 2741
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 2743
   sp = STACKTOP; //@line 2744
   STACKTOP = sp; //@line 2745
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 60; //@line 2749
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 2751
   sp = STACKTOP; //@line 2752
   STACKTOP = sp; //@line 2753
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 61; //@line 2757
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 2759
   sp = STACKTOP; //@line 2760
   STACKTOP = sp; //@line 2761
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 62; //@line 2765
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2767
   sp = STACKTOP; //@line 2768
   STACKTOP = sp; //@line 2769
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 63; //@line 2773
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2775
   sp = STACKTOP; //@line 2776
   STACKTOP = sp; //@line 2777
   return;
  }
 }
}
function _main() {
 var $0 = 0, $1 = 0, $15 = 0, $18 = 0, $21 = 0, $23 = 0, $26 = 0, $29 = 0, $34 = 0, $37 = 0, $40 = 0, $5 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx13 = 0, $AsyncCtx17 = 0, $AsyncCtx20 = 0, $AsyncCtx24 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 3177
 STACKTOP = STACKTOP + 16 | 0; //@line 3178
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3178
 $0 = sp; //@line 3179
 $AsyncCtx24 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3180
 $1 = _equeue_alloc(4920, 4) | 0; //@line 3181
 if (___async) {
  HEAP32[$AsyncCtx24 >> 2] = 76; //@line 3184
  HEAP32[$AsyncCtx24 + 4 >> 2] = $0; //@line 3186
  sp = STACKTOP; //@line 3187
  STACKTOP = sp; //@line 3188
  return 0; //@line 3188
 }
 _emscripten_free_async_context($AsyncCtx24 | 0); //@line 3190
 do {
  if ($1 | 0) {
   HEAP32[$1 >> 2] = 2; //@line 3194
   _equeue_event_delay($1, 1e3); //@line 3195
   _equeue_event_period($1, 1e3); //@line 3196
   _equeue_event_dtor($1, 77); //@line 3197
   $AsyncCtx10 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3198
   _equeue_post(4920, 78, $1) | 0; //@line 3199
   if (___async) {
    HEAP32[$AsyncCtx10 >> 2] = 79; //@line 3202
    HEAP32[$AsyncCtx10 + 4 >> 2] = $0; //@line 3204
    sp = STACKTOP; //@line 3205
    STACKTOP = sp; //@line 3206
    return 0; //@line 3206
   } else {
    _emscripten_free_async_context($AsyncCtx10 | 0); //@line 3208
    break;
   }
  }
 } while (0);
 $AsyncCtx20 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3213
 $5 = _equeue_alloc(4920, 32) | 0; //@line 3214
 if (___async) {
  HEAP32[$AsyncCtx20 >> 2] = 80; //@line 3217
  HEAP32[$AsyncCtx20 + 4 >> 2] = $0; //@line 3219
  sp = STACKTOP; //@line 3220
  STACKTOP = sp; //@line 3221
  return 0; //@line 3221
 }
 _emscripten_free_async_context($AsyncCtx20 | 0); //@line 3223
 if (!$5) {
  HEAP32[$0 >> 2] = 0; //@line 3226
  HEAP32[$0 + 4 >> 2] = 0; //@line 3226
  HEAP32[$0 + 8 >> 2] = 0; //@line 3226
  HEAP32[$0 + 12 >> 2] = 0; //@line 3226
  $21 = 1; //@line 3227
  $23 = $0; //@line 3227
 } else {
  HEAP32[$5 + 4 >> 2] = 4920; //@line 3230
  HEAP32[$5 + 8 >> 2] = 0; //@line 3232
  HEAP32[$5 + 12 >> 2] = 0; //@line 3234
  HEAP32[$5 + 16 >> 2] = -1; //@line 3236
  HEAP32[$5 + 20 >> 2] = 2; //@line 3238
  HEAP32[$5 + 24 >> 2] = 81; //@line 3240
  HEAP32[$5 + 28 >> 2] = 3; //@line 3242
  HEAP32[$5 >> 2] = 1; //@line 3243
  $15 = $0 + 4 | 0; //@line 3244
  HEAP32[$15 >> 2] = 0; //@line 3245
  HEAP32[$15 + 4 >> 2] = 0; //@line 3245
  HEAP32[$15 + 8 >> 2] = 0; //@line 3245
  HEAP32[$0 >> 2] = $5; //@line 3246
  HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + 1; //@line 3249
  $21 = 0; //@line 3250
  $23 = $0; //@line 3250
 }
 $18 = $0 + 12 | 0; //@line 3252
 HEAP32[$18 >> 2] = 232; //@line 3253
 $AsyncCtx17 = _emscripten_alloc_async_context(24, sp) | 0; //@line 3254
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5172, $0); //@line 3255
 if (___async) {
  HEAP32[$AsyncCtx17 >> 2] = 82; //@line 3258
  HEAP32[$AsyncCtx17 + 4 >> 2] = $18; //@line 3260
  HEAP8[$AsyncCtx17 + 8 >> 0] = $21 & 1; //@line 3263
  HEAP32[$AsyncCtx17 + 12 >> 2] = $23; //@line 3265
  HEAP32[$AsyncCtx17 + 16 >> 2] = $5; //@line 3267
  HEAP32[$AsyncCtx17 + 20 >> 2] = $5; //@line 3269
  sp = STACKTOP; //@line 3270
  STACKTOP = sp; //@line 3271
  return 0; //@line 3271
 }
 _emscripten_free_async_context($AsyncCtx17 | 0); //@line 3273
 $26 = HEAP32[$18 >> 2] | 0; //@line 3274
 do {
  if ($26 | 0) {
   $29 = HEAP32[$26 + 8 >> 2] | 0; //@line 3279
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 3280
   FUNCTION_TABLE_vi[$29 & 255]($23); //@line 3281
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 83; //@line 3284
    HEAP8[$AsyncCtx + 4 >> 0] = $21 & 1; //@line 3287
    HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 3289
    HEAP32[$AsyncCtx + 12 >> 2] = $5; //@line 3291
    sp = STACKTOP; //@line 3292
    STACKTOP = sp; //@line 3293
    return 0; //@line 3293
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 3295
    break;
   }
  }
 } while (0);
 do {
  if (!$21) {
   $34 = (HEAP32[$5 >> 2] | 0) + -1 | 0; //@line 3303
   HEAP32[$5 >> 2] = $34; //@line 3304
   if (!$34) {
    $37 = HEAP32[$5 + 24 >> 2] | 0; //@line 3308
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3309
    FUNCTION_TABLE_vi[$37 & 255]($5); //@line 3310
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 84; //@line 3313
     HEAP32[$AsyncCtx3 + 4 >> 2] = $5; //@line 3315
     sp = STACKTOP; //@line 3316
     STACKTOP = sp; //@line 3317
     return 0; //@line 3317
    }
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3319
    $40 = HEAP32[$5 + 4 >> 2] | 0; //@line 3321
    $AsyncCtx13 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3322
    _equeue_dealloc($40, $5); //@line 3323
    if (___async) {
     HEAP32[$AsyncCtx13 >> 2] = 85; //@line 3326
     sp = STACKTOP; //@line 3327
     STACKTOP = sp; //@line 3328
     return 0; //@line 3328
    } else {
     _emscripten_free_async_context($AsyncCtx13 | 0); //@line 3330
     break;
    }
   }
  }
 } while (0);
 $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3336
 __ZN6events10EventQueue8dispatchEi(4920, -1); //@line 3337
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 86; //@line 3340
  sp = STACKTOP; //@line 3341
  STACKTOP = sp; //@line 3342
  return 0; //@line 3342
 } else {
  _emscripten_free_async_context($AsyncCtx6 | 0); //@line 3344
  STACKTOP = sp; //@line 3345
  return 0; //@line 3345
 }
 return 0; //@line 3347
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$phi$trans$insert = 0, $$pre = 0, $$pre$i$i4 = 0, $$pre10 = 0, $12 = 0, $2 = 0, $20 = 0, $21 = 0, $25 = 0, $27 = 0, $29 = 0, $3 = 0, $30 = 0, $33 = 0, $4 = 0, $41 = 0, $49 = 0, $6 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx8 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 322
 STACKTOP = STACKTOP + 16 | 0; //@line 323
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 323
 $2 = sp; //@line 324
 $3 = $1 + 12 | 0; //@line 325
 $4 = HEAP32[$3 >> 2] | 0; //@line 326
 if ($4 | 0) {
  $6 = $0 + 56 | 0; //@line 329
  if (($6 | 0) != ($1 | 0)) {
   $8 = $0 + 68 | 0; //@line 332
   $9 = HEAP32[$8 >> 2] | 0; //@line 333
   do {
    if (!$9) {
     $20 = $4; //@line 337
     label = 7; //@line 338
    } else {
     $12 = HEAP32[$9 + 8 >> 2] | 0; //@line 341
     $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 342
     FUNCTION_TABLE_vi[$12 & 255]($6); //@line 343
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 18; //@line 346
      HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 348
      HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 350
      HEAP32[$AsyncCtx + 12 >> 2] = $6; //@line 352
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 354
      HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 356
      sp = STACKTOP; //@line 357
      STACKTOP = sp; //@line 358
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 360
      $$pre = HEAP32[$3 >> 2] | 0; //@line 361
      if (!$$pre) {
       $25 = 0; //@line 364
       break;
      } else {
       $20 = $$pre; //@line 367
       label = 7; //@line 368
       break;
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 7) {
     $21 = HEAP32[$20 + 4 >> 2] | 0; //@line 377
     $AsyncCtx2 = _emscripten_alloc_async_context(16, sp) | 0; //@line 378
     FUNCTION_TABLE_vii[$21 & 3]($6, $1); //@line 379
     if (___async) {
      HEAP32[$AsyncCtx2 >> 2] = 19; //@line 382
      HEAP32[$AsyncCtx2 + 4 >> 2] = $3; //@line 384
      HEAP32[$AsyncCtx2 + 8 >> 2] = $8; //@line 386
      HEAP32[$AsyncCtx2 + 12 >> 2] = $0; //@line 388
      sp = STACKTOP; //@line 389
      STACKTOP = sp; //@line 390
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx2 | 0); //@line 392
      $25 = HEAP32[$3 >> 2] | 0; //@line 394
      break;
     }
    }
   } while (0);
   HEAP32[$8 >> 2] = $25; //@line 399
  }
  _gpio_irq_set($0 + 28 | 0, 2, 1); //@line 402
  STACKTOP = sp; //@line 403
  return;
 }
 HEAP32[$2 >> 2] = 0; //@line 405
 HEAP32[$2 + 4 >> 2] = 0; //@line 405
 HEAP32[$2 + 8 >> 2] = 0; //@line 405
 HEAP32[$2 + 12 >> 2] = 0; //@line 405
 $27 = $0 + 56 | 0; //@line 406
 do {
  if (($27 | 0) != ($2 | 0)) {
   $29 = $0 + 68 | 0; //@line 410
   $30 = HEAP32[$29 >> 2] | 0; //@line 411
   if ($30 | 0) {
    $33 = HEAP32[$30 + 8 >> 2] | 0; //@line 415
    $AsyncCtx5 = _emscripten_alloc_async_context(24, sp) | 0; //@line 416
    FUNCTION_TABLE_vi[$33 & 255]($27); //@line 417
    if (___async) {
     HEAP32[$AsyncCtx5 >> 2] = 20; //@line 420
     HEAP32[$AsyncCtx5 + 4 >> 2] = $2; //@line 422
     HEAP32[$AsyncCtx5 + 8 >> 2] = $29; //@line 424
     HEAP32[$AsyncCtx5 + 12 >> 2] = $27; //@line 426
     HEAP32[$AsyncCtx5 + 16 >> 2] = $2; //@line 428
     HEAP32[$AsyncCtx5 + 20 >> 2] = $0; //@line 430
     sp = STACKTOP; //@line 431
     STACKTOP = sp; //@line 432
     return;
    }
    _emscripten_free_async_context($AsyncCtx5 | 0); //@line 434
    $$phi$trans$insert = $2 + 12 | 0; //@line 435
    $$pre10 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 436
    if ($$pre10 | 0) {
     $41 = HEAP32[$$pre10 + 4 >> 2] | 0; //@line 440
     $AsyncCtx8 = _emscripten_alloc_async_context(20, sp) | 0; //@line 441
     FUNCTION_TABLE_vii[$41 & 3]($27, $2); //@line 442
     if (___async) {
      HEAP32[$AsyncCtx8 >> 2] = 21; //@line 445
      HEAP32[$AsyncCtx8 + 4 >> 2] = $$phi$trans$insert; //@line 447
      HEAP32[$AsyncCtx8 + 8 >> 2] = $29; //@line 449
      HEAP32[$AsyncCtx8 + 12 >> 2] = $2; //@line 451
      HEAP32[$AsyncCtx8 + 16 >> 2] = $0; //@line 453
      sp = STACKTOP; //@line 454
      STACKTOP = sp; //@line 455
      return;
     }
     _emscripten_free_async_context($AsyncCtx8 | 0); //@line 457
     $$pre$i$i4 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 458
     HEAP32[$29 >> 2] = $$pre$i$i4; //@line 459
     if (!$$pre$i$i4) {
      break;
     }
     $49 = HEAP32[$$pre$i$i4 + 8 >> 2] | 0; //@line 466
     $AsyncCtx11 = _emscripten_alloc_async_context(12, sp) | 0; //@line 467
     FUNCTION_TABLE_vi[$49 & 255]($2); //@line 468
     if (___async) {
      HEAP32[$AsyncCtx11 >> 2] = 22; //@line 471
      HEAP32[$AsyncCtx11 + 4 >> 2] = $2; //@line 473
      HEAP32[$AsyncCtx11 + 8 >> 2] = $0; //@line 475
      sp = STACKTOP; //@line 476
      STACKTOP = sp; //@line 477
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx11 | 0); //@line 479
      break;
     }
    }
   }
   HEAP32[$29 >> 2] = 0; //@line 484
  }
 } while (0);
 _gpio_irq_set($0 + 28 | 0, 2, 0); //@line 488
 STACKTOP = sp; //@line 489
 return;
}
function _mbed_vtracef__async_cb_11($0) {
 $0 = $0 | 0;
 var $$10 = 0, $$3147168 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $10 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $28 = 0, $30 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $42 = 0, $46 = 0, $50 = 0, $53 = 0, $54 = 0, $56 = 0, $6 = 0, $67 = 0, $68 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 576
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 578
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 580
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 582
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 584
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 586
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 592
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 594
 $20 = HEAP8[$0 + 40 >> 0] & 1; //@line 597
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 599
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 601
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 605
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 607
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 611
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 613
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 615
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 619
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 623
 HEAP32[$6 >> 2] = HEAP32[___async_retval >> 2]; //@line 628
 $50 = _snprintf($8, $10, 1301, $6) | 0; //@line 629
 $$10 = ($50 | 0) >= ($10 | 0) ? 0 : $50; //@line 631
 $53 = $8 + $$10 | 0; //@line 633
 $54 = $10 - $$10 | 0; //@line 634
 if (($$10 | 0) > 0) {
  if (($54 | 0) > 0) {
   $$3147168 = $54; //@line 638
   $$3169 = $53; //@line 638
   label = 4; //@line 639
  }
 } else {
  $$3147168 = $10; //@line 642
  $$3169 = $8; //@line 642
  label = 4; //@line 643
 }
 if ((label | 0) == 4) {
  $56 = $28 + -2 | 0; //@line 646
  switch ($56 >>> 1 | $56 << 31 | 0) {
  case 0:
   {
    HEAP32[$22 >> 2] = $24; //@line 652
    $$5156 = _snprintf($$3169, $$3147168, 1304, $22) | 0; //@line 654
    break;
   }
  case 1:
   {
    HEAP32[$38 >> 2] = $24; //@line 658
    $$5156 = _snprintf($$3169, $$3147168, 1319, $38) | 0; //@line 660
    break;
   }
  case 3:
   {
    HEAP32[$30 >> 2] = $24; //@line 664
    $$5156 = _snprintf($$3169, $$3147168, 1334, $30) | 0; //@line 666
    break;
   }
  case 7:
   {
    HEAP32[$46 >> 2] = $24; //@line 670
    $$5156 = _snprintf($$3169, $$3147168, 1349, $46) | 0; //@line 672
    break;
   }
  default:
   {
    $$5156 = _snprintf($$3169, $$3147168, 1364, $42) | 0; //@line 677
   }
  }
  $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 681
  $67 = $$3169 + $$5156$ | 0; //@line 683
  $68 = $$3147168 - $$5156$ | 0; //@line 684
  if (($$5156$ | 0) > 0 & ($68 | 0) > 0) {
   $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 688
   $70 = _vsnprintf($67, $68, $2, $4) | 0; //@line 689
   if (___async) {
    HEAP32[$ReallocAsyncCtx10 >> 2] = 42; //@line 692
    $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 693
    HEAP32[$71 >> 2] = $16; //@line 694
    $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 695
    HEAP32[$72 >> 2] = $18; //@line 696
    $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 697
    $$expand_i1_val = $20 & 1; //@line 698
    HEAP8[$73 >> 0] = $$expand_i1_val; //@line 699
    $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 700
    HEAP32[$74 >> 2] = $34; //@line 701
    $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 702
    HEAP32[$75 >> 2] = $36; //@line 703
    $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 704
    HEAP32[$76 >> 2] = $68; //@line 705
    $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 706
    HEAP32[$77 >> 2] = $67; //@line 707
    sp = STACKTOP; //@line 708
    return;
   }
   HEAP32[___async_retval >> 2] = $70; //@line 712
   ___async_unwind = 0; //@line 713
   HEAP32[$ReallocAsyncCtx10 >> 2] = 42; //@line 714
   $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 715
   HEAP32[$71 >> 2] = $16; //@line 716
   $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 717
   HEAP32[$72 >> 2] = $18; //@line 718
   $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 719
   $$expand_i1_val = $20 & 1; //@line 720
   HEAP8[$73 >> 0] = $$expand_i1_val; //@line 721
   $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 722
   HEAP32[$74 >> 2] = $34; //@line 723
   $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 724
   HEAP32[$75 >> 2] = $36; //@line 725
   $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 726
   HEAP32[$76 >> 2] = $68; //@line 727
   $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 728
   HEAP32[$77 >> 2] = $67; //@line 729
   sp = STACKTOP; //@line 730
   return;
  }
 }
 $79 = HEAP32[53] | 0; //@line 734
 $80 = HEAP32[46] | 0; //@line 735
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 736
 FUNCTION_TABLE_vi[$79 & 255]($80); //@line 737
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 44; //@line 740
  sp = STACKTOP; //@line 741
  return;
 }
 ___async_unwind = 0; //@line 744
 HEAP32[$ReallocAsyncCtx7 >> 2] = 44; //@line 745
 sp = STACKTOP; //@line 746
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_48($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2661
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2663
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2665
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2667
 $8 = HEAP8[$0 + 16 >> 0] & 1; //@line 2670
 $10 = HEAP8[$0 + 17 >> 0] & 1; //@line 2673
 $12 = HEAP32[$0 + 20 >> 2] | 0; //@line 2675
 $14 = HEAP32[$0 + 24 >> 2] | 0; //@line 2677
 $16 = HEAP32[$0 + 28 >> 2] | 0; //@line 2679
 $18 = HEAP32[$0 + 32 >> 2] | 0; //@line 2681
 $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 2683
 $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 2685
 $24 = HEAP32[$0 + 44 >> 2] | 0; //@line 2687
 $26 = HEAP8[$0 + 48 >> 0] & 1; //@line 2690
 $28 = HEAP32[$0 + 52 >> 2] | 0; //@line 2692
 L2 : do {
  if (!(HEAP8[$6 >> 0] | 0)) {
   do {
    if (!(HEAP8[$24 >> 0] | 0)) {
     $$182$off0 = $8; //@line 2701
     $$186$off0 = $10; //@line 2701
    } else {
     if (!(HEAP8[$22 >> 0] | 0)) {
      if (!(HEAP32[$18 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $10; //@line 2710
       $$283$off0 = 1; //@line 2710
       label = 13; //@line 2711
       break L2;
      } else {
       $$182$off0 = 1; //@line 2714
       $$186$off0 = $10; //@line 2714
       break;
      }
     }
     if ((HEAP32[$4 >> 2] | 0) == 1) {
      label = 18; //@line 2721
      break L2;
     }
     if (!(HEAP32[$18 >> 2] & 2)) {
      label = 18; //@line 2728
      break L2;
     } else {
      $$182$off0 = 1; //@line 2731
      $$186$off0 = 1; //@line 2731
     }
    }
   } while (0);
   $30 = $20 + 8 | 0; //@line 2735
   if ($30 >>> 0 < $28 >>> 0) {
    HEAP8[$22 >> 0] = 0; //@line 2738
    HEAP8[$24 >> 0] = 0; //@line 2739
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 2740
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $16, $12, $12, 1, $26); //@line 2741
    if (!___async) {
     ___async_unwind = 0; //@line 2744
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 128; //@line 2746
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 2748
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 2750
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 2752
    HEAP8[$ReallocAsyncCtx5 + 16 >> 0] = $$182$off0 & 1; //@line 2755
    HEAP8[$ReallocAsyncCtx5 + 17 >> 0] = $$186$off0 & 1; //@line 2758
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $12; //@line 2760
    HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $14; //@line 2762
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $16; //@line 2764
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $18; //@line 2766
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $30; //@line 2768
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $22; //@line 2770
    HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $24; //@line 2772
    HEAP8[$ReallocAsyncCtx5 + 48 >> 0] = $26 & 1; //@line 2775
    HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $28; //@line 2777
    sp = STACKTOP; //@line 2778
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 2781
    $$283$off0 = $$182$off0; //@line 2781
    label = 13; //@line 2782
   }
  } else {
   $$085$off0$reg2mem$0 = $10; //@line 2785
   $$283$off0 = $8; //@line 2785
   label = 13; //@line 2786
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$14 >> 2] = $12; //@line 2792
    $59 = $16 + 40 | 0; //@line 2793
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 2796
    if ((HEAP32[$16 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$4 >> 2] | 0) == 2) {
      HEAP8[$6 >> 0] = 1; //@line 2804
      if ($$283$off0) {
       label = 18; //@line 2806
       break;
      } else {
       $67 = 4; //@line 2809
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 2816
   } else {
    $67 = 4; //@line 2818
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 2823
 }
 HEAP32[$2 >> 2] = $67; //@line 2825
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
 sp = STACKTOP; //@line 12673
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 12678
 } else {
  $9 = $1 + 52 | 0; //@line 12680
  $10 = HEAP8[$9 >> 0] | 0; //@line 12681
  $11 = $1 + 53 | 0; //@line 12682
  $12 = HEAP8[$11 >> 0] | 0; //@line 12683
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 12686
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 12687
  HEAP8[$9 >> 0] = 0; //@line 12688
  HEAP8[$11 >> 0] = 0; //@line 12689
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 12690
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 12691
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 126; //@line 12694
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 12696
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 12698
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 12700
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 12702
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 12704
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 12706
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 12708
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 12710
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 12712
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 12714
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 12717
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 12719
   sp = STACKTOP; //@line 12720
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12723
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 12728
    $32 = $0 + 8 | 0; //@line 12729
    $33 = $1 + 54 | 0; //@line 12730
    $$0 = $0 + 24 | 0; //@line 12731
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
     HEAP8[$9 >> 0] = 0; //@line 12764
     HEAP8[$11 >> 0] = 0; //@line 12765
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 12766
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 12767
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 12772
     $62 = $$0 + 8 | 0; //@line 12773
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 12776
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 127; //@line 12781
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 12783
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 12785
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 12787
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 12789
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 12791
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 12793
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 12795
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 12797
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 12799
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 12801
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 12803
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 12805
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 12807
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 12810
    sp = STACKTOP; //@line 12811
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 12815
  HEAP8[$11 >> 0] = $12; //@line 12816
 }
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_47($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2505
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2507
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2509
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2511
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2513
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 2516
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2518
 $15 = $12 + 24 | 0; //@line 2521
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$12 + 8 >> 2] | 0; //@line 2526
   if (!($18 & 2)) {
    $21 = $4 + 36 | 0; //@line 2530
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $4 + 54 | 0; //@line 2537
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 2548
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 2549
      if (!___async) {
       ___async_unwind = 0; //@line 2552
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 132; //@line 2554
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 2556
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $2; //@line 2558
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 2560
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 2562
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $4; //@line 2564
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $6; //@line 2566
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $8; //@line 2568
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $10 & 1; //@line 2571
      sp = STACKTOP; //@line 2572
      return;
     }
     $36 = $4 + 24 | 0; //@line 2575
     $37 = $4 + 54 | 0; //@line 2576
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 2591
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 2592
     if (!___async) {
      ___async_unwind = 0; //@line 2595
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 131; //@line 2597
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 2599
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $2; //@line 2601
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 2603
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 2605
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 2607
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $4; //@line 2609
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $6; //@line 2611
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $8; //@line 2613
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $10 & 1; //@line 2616
     sp = STACKTOP; //@line 2617
     return;
    }
   }
   $24 = $4 + 54 | 0; //@line 2621
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 2625
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 2626
    if (!___async) {
     ___async_unwind = 0; //@line 2629
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 130; //@line 2631
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 2633
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $2; //@line 2635
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 2637
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $4; //@line 2639
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $6; //@line 2641
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $8; //@line 2643
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $10 & 1; //@line 2646
    sp = STACKTOP; //@line 2647
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9132
      $10 = HEAP32[$9 >> 2] | 0; //@line 9133
      HEAP32[$2 >> 2] = $9 + 4; //@line 9135
      HEAP32[$0 >> 2] = $10; //@line 9136
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9152
      $17 = HEAP32[$16 >> 2] | 0; //@line 9153
      HEAP32[$2 >> 2] = $16 + 4; //@line 9155
      $20 = $0; //@line 9158
      HEAP32[$20 >> 2] = $17; //@line 9160
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 9163
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9179
      $30 = HEAP32[$29 >> 2] | 0; //@line 9180
      HEAP32[$2 >> 2] = $29 + 4; //@line 9182
      $31 = $0; //@line 9183
      HEAP32[$31 >> 2] = $30; //@line 9185
      HEAP32[$31 + 4 >> 2] = 0; //@line 9188
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9204
      $41 = $40; //@line 9205
      $43 = HEAP32[$41 >> 2] | 0; //@line 9207
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 9210
      HEAP32[$2 >> 2] = $40 + 8; //@line 9212
      $47 = $0; //@line 9213
      HEAP32[$47 >> 2] = $43; //@line 9215
      HEAP32[$47 + 4 >> 2] = $46; //@line 9218
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9234
      $57 = HEAP32[$56 >> 2] | 0; //@line 9235
      HEAP32[$2 >> 2] = $56 + 4; //@line 9237
      $59 = ($57 & 65535) << 16 >> 16; //@line 9239
      $62 = $0; //@line 9242
      HEAP32[$62 >> 2] = $59; //@line 9244
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 9247
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9263
      $72 = HEAP32[$71 >> 2] | 0; //@line 9264
      HEAP32[$2 >> 2] = $71 + 4; //@line 9266
      $73 = $0; //@line 9268
      HEAP32[$73 >> 2] = $72 & 65535; //@line 9270
      HEAP32[$73 + 4 >> 2] = 0; //@line 9273
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9289
      $83 = HEAP32[$82 >> 2] | 0; //@line 9290
      HEAP32[$2 >> 2] = $82 + 4; //@line 9292
      $85 = ($83 & 255) << 24 >> 24; //@line 9294
      $88 = $0; //@line 9297
      HEAP32[$88 >> 2] = $85; //@line 9299
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 9302
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9318
      $98 = HEAP32[$97 >> 2] | 0; //@line 9319
      HEAP32[$2 >> 2] = $97 + 4; //@line 9321
      $99 = $0; //@line 9323
      HEAP32[$99 >> 2] = $98 & 255; //@line 9325
      HEAP32[$99 + 4 >> 2] = 0; //@line 9328
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9344
      $109 = +HEAPF64[$108 >> 3]; //@line 9345
      HEAP32[$2 >> 2] = $108 + 8; //@line 9347
      HEAPF64[$0 >> 3] = $109; //@line 9348
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9364
      $116 = +HEAPF64[$115 >> 3]; //@line 9365
      HEAP32[$2 >> 2] = $115 + 8; //@line 9367
      HEAPF64[$0 >> 3] = $116; //@line 9368
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
 sp = STACKTOP; //@line 8032
 STACKTOP = STACKTOP + 224 | 0; //@line 8033
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 8033
 $3 = sp + 120 | 0; //@line 8034
 $4 = sp + 80 | 0; //@line 8035
 $5 = sp; //@line 8036
 $6 = sp + 136 | 0; //@line 8037
 dest = $4; //@line 8038
 stop = dest + 40 | 0; //@line 8038
 do {
  HEAP32[dest >> 2] = 0; //@line 8038
  dest = dest + 4 | 0; //@line 8038
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 8040
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 8044
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 8051
  } else {
   $43 = 0; //@line 8053
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 8055
  $14 = $13 & 32; //@line 8056
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 8062
  }
  $19 = $0 + 48 | 0; //@line 8064
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 8069
    $24 = HEAP32[$23 >> 2] | 0; //@line 8070
    HEAP32[$23 >> 2] = $6; //@line 8071
    $25 = $0 + 28 | 0; //@line 8072
    HEAP32[$25 >> 2] = $6; //@line 8073
    $26 = $0 + 20 | 0; //@line 8074
    HEAP32[$26 >> 2] = $6; //@line 8075
    HEAP32[$19 >> 2] = 80; //@line 8076
    $28 = $0 + 16 | 0; //@line 8078
    HEAP32[$28 >> 2] = $6 + 80; //@line 8079
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 8080
    if (!$24) {
     $$1 = $29; //@line 8083
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 8086
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 8087
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 8088
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 106; //@line 8091
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 8093
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 8095
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 8097
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 8099
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 8101
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 8103
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 8105
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 8107
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 8109
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 8111
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 8113
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 8115
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 8117
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 8119
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 8121
      sp = STACKTOP; //@line 8122
      STACKTOP = sp; //@line 8123
      return 0; //@line 8123
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 8125
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 8128
      HEAP32[$23 >> 2] = $24; //@line 8129
      HEAP32[$19 >> 2] = 0; //@line 8130
      HEAP32[$28 >> 2] = 0; //@line 8131
      HEAP32[$25 >> 2] = 0; //@line 8132
      HEAP32[$26 >> 2] = 0; //@line 8133
      $$1 = $$; //@line 8134
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 8140
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 8143
  HEAP32[$0 >> 2] = $51 | $14; //@line 8148
  if ($43 | 0) {
   ___unlockfile($0); //@line 8151
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 8153
 }
 STACKTOP = sp; //@line 8155
 return $$0 | 0; //@line 8155
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12208
 STACKTOP = STACKTOP + 64 | 0; //@line 12209
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 12209
 $4 = sp; //@line 12210
 $5 = HEAP32[$0 >> 2] | 0; //@line 12211
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 12214
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 12216
 HEAP32[$4 >> 2] = $2; //@line 12217
 HEAP32[$4 + 4 >> 2] = $0; //@line 12219
 HEAP32[$4 + 8 >> 2] = $1; //@line 12221
 HEAP32[$4 + 12 >> 2] = $3; //@line 12223
 $14 = $4 + 16 | 0; //@line 12224
 $15 = $4 + 20 | 0; //@line 12225
 $16 = $4 + 24 | 0; //@line 12226
 $17 = $4 + 28 | 0; //@line 12227
 $18 = $4 + 32 | 0; //@line 12228
 $19 = $4 + 40 | 0; //@line 12229
 dest = $14; //@line 12230
 stop = dest + 36 | 0; //@line 12230
 do {
  HEAP32[dest >> 2] = 0; //@line 12230
  dest = dest + 4 | 0; //@line 12230
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 12230
 HEAP8[$14 + 38 >> 0] = 0; //@line 12230
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 12235
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 12238
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 12239
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 12240
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 118; //@line 12243
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 12245
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 12247
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 12249
    sp = STACKTOP; //@line 12250
    STACKTOP = sp; //@line 12251
    return 0; //@line 12251
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12253
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 12257
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 12261
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 12264
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 12265
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 12266
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 119; //@line 12269
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 12271
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 12273
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 12275
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 12277
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 12279
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 12281
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 12283
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 12285
    sp = STACKTOP; //@line 12286
    STACKTOP = sp; //@line 12287
    return 0; //@line 12287
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12289
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 12303
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 12311
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 12327
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 12332
  }
 } while (0);
 STACKTOP = sp; //@line 12335
 return $$0 | 0; //@line 12335
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 7904
 $7 = ($2 | 0) != 0; //@line 7908
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 7912
   $$03555 = $0; //@line 7913
   $$03654 = $2; //@line 7913
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 7918
     $$036$lcssa64 = $$03654; //@line 7918
     label = 6; //@line 7919
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 7922
    $12 = $$03654 + -1 | 0; //@line 7923
    $16 = ($12 | 0) != 0; //@line 7927
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 7930
     $$03654 = $12; //@line 7930
    } else {
     $$035$lcssa = $11; //@line 7932
     $$036$lcssa = $12; //@line 7932
     $$lcssa = $16; //@line 7932
     label = 5; //@line 7933
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 7938
   $$036$lcssa = $2; //@line 7938
   $$lcssa = $7; //@line 7938
   label = 5; //@line 7939
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 7944
   $$036$lcssa64 = $$036$lcssa; //@line 7944
   label = 6; //@line 7945
  } else {
   $$2 = $$035$lcssa; //@line 7947
   $$3 = 0; //@line 7947
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 7953
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 7956
    $$3 = $$036$lcssa64; //@line 7956
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 7958
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 7962
      $$13745 = $$036$lcssa64; //@line 7962
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 7965
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 7974
       $30 = $$13745 + -4 | 0; //@line 7975
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 7978
        $$13745 = $30; //@line 7978
       } else {
        $$0$lcssa = $29; //@line 7980
        $$137$lcssa = $30; //@line 7980
        label = 11; //@line 7981
        break L11;
       }
      }
      $$140 = $$046; //@line 7985
      $$23839 = $$13745; //@line 7985
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 7987
      $$137$lcssa = $$036$lcssa64; //@line 7987
      label = 11; //@line 7988
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 7994
      $$3 = 0; //@line 7994
      break;
     } else {
      $$140 = $$0$lcssa; //@line 7997
      $$23839 = $$137$lcssa; //@line 7997
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 8004
      $$3 = $$23839; //@line 8004
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 8007
     $$23839 = $$23839 + -1 | 0; //@line 8008
     if (!$$23839) {
      $$2 = $35; //@line 8011
      $$3 = 0; //@line 8011
      break;
     } else {
      $$140 = $35; //@line 8014
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 8022
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 7675
 do {
  if (!$0) {
   do {
    if (!(HEAP32[125] | 0)) {
     $34 = 0; //@line 7683
    } else {
     $12 = HEAP32[125] | 0; //@line 7685
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7686
     $13 = _fflush($12) | 0; //@line 7687
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 102; //@line 7690
      sp = STACKTOP; //@line 7691
      return 0; //@line 7692
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 7694
      $34 = $13; //@line 7695
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 7701
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 7705
    } else {
     $$02327 = $$02325; //@line 7707
     $$02426 = $34; //@line 7707
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 7714
      } else {
       $28 = 0; //@line 7716
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 7724
       $25 = ___fflush_unlocked($$02327) | 0; //@line 7725
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 7730
       $$1 = $25 | $$02426; //@line 7732
      } else {
       $$1 = $$02426; //@line 7734
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 7738
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 7741
      if (!$$023) {
       $$024$lcssa = $$1; //@line 7744
       break L9;
      } else {
       $$02327 = $$023; //@line 7747
       $$02426 = $$1; //@line 7747
      }
     }
     HEAP32[$AsyncCtx >> 2] = 103; //@line 7750
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 7752
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 7754
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 7756
     sp = STACKTOP; //@line 7757
     return 0; //@line 7758
    }
   } while (0);
   ___ofl_unlock(); //@line 7761
   $$0 = $$024$lcssa; //@line 7762
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7768
    $5 = ___fflush_unlocked($0) | 0; //@line 7769
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 100; //@line 7772
     sp = STACKTOP; //@line 7773
     return 0; //@line 7774
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 7776
     $$0 = $5; //@line 7777
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 7782
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 7783
   $7 = ___fflush_unlocked($0) | 0; //@line 7784
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 101; //@line 7787
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 7790
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 7792
    sp = STACKTOP; //@line 7793
    return 0; //@line 7794
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7796
   if ($phitmp) {
    $$0 = $7; //@line 7798
   } else {
    ___unlockfile($0); //@line 7800
    $$0 = $7; //@line 7801
   }
  }
 } while (0);
 return $$0 | 0; //@line 7805
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12390
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12396
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 12402
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 12405
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12406
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 12407
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 122; //@line 12410
     sp = STACKTOP; //@line 12411
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12414
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 12422
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 12427
     $19 = $1 + 44 | 0; //@line 12428
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 12434
     HEAP8[$22 >> 0] = 0; //@line 12435
     $23 = $1 + 53 | 0; //@line 12436
     HEAP8[$23 >> 0] = 0; //@line 12437
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 12439
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 12442
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 12443
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 12444
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 121; //@line 12447
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 12449
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 12451
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 12453
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 12455
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 12457
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 12459
      sp = STACKTOP; //@line 12460
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 12463
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 12467
      label = 13; //@line 12468
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 12473
       label = 13; //@line 12474
      } else {
       $$037$off039 = 3; //@line 12476
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 12480
      $39 = $1 + 40 | 0; //@line 12481
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 12484
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 12494
        $$037$off039 = $$037$off038; //@line 12495
       } else {
        $$037$off039 = $$037$off038; //@line 12497
       }
      } else {
       $$037$off039 = $$037$off038; //@line 12500
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 12503
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 12510
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
 sp = STACKTOP; //@line 914
 $13 = $1 - (HEAP32[$0 + 12 >> 2] | 0) | HEAPU8[$1 + 4 >> 0] << HEAP32[$0 + 16 >> 2]; //@line 925
 $14 = $1 + 20 | 0; //@line 926
 $16 = (HEAP32[$14 >> 2] | 0) - $2 | 0; //@line 928
 HEAP32[$14 >> 2] = ($16 & ~($16 >> 31)) + $2; //@line 933
 HEAP8[$1 + 5 >> 0] = HEAP8[$0 + 9 >> 0] | 0; //@line 937
 $24 = $0 + 128 | 0; //@line 938
 _equeue_mutex_lock($24); //@line 939
 $25 = HEAP32[$0 >> 2] | 0; //@line 940
 L1 : do {
  if (!$25) {
   $$051$ph = $0; //@line 944
   label = 5; //@line 945
  } else {
   $27 = HEAP32[$14 >> 2] | 0; //@line 947
   $$053 = $0; //@line 948
   $29 = $25; //@line 948
   while (1) {
    if (((HEAP32[$29 + 20 >> 2] | 0) - $27 | 0) >= 0) {
     break;
    }
    $33 = $29 + 8 | 0; //@line 957
    $34 = HEAP32[$33 >> 2] | 0; //@line 958
    if (!$34) {
     $$051$ph = $33; //@line 961
     label = 5; //@line 962
     break L1;
    } else {
     $$053 = $33; //@line 965
     $29 = $34; //@line 965
    }
   }
   if ((HEAP32[$29 + 20 >> 2] | 0) != (HEAP32[$14 >> 2] | 0)) {
    $49 = $1 + 8 | 0; //@line 973
    HEAP32[$49 >> 2] = $29; //@line 974
    HEAP32[$29 + 16 >> 2] = $49; //@line 976
    $$0515859 = $$053; //@line 977
    label = 11; //@line 978
    break;
   }
   $42 = HEAP32[$29 + 8 >> 2] | 0; //@line 982
   $43 = $1 + 8 | 0; //@line 983
   HEAP32[$43 >> 2] = $42; //@line 984
   if ($42 | 0) {
    HEAP32[$42 + 16 >> 2] = $43; //@line 988
   }
   $46 = HEAP32[$$053 >> 2] | 0; //@line 990
   $47 = $1 + 12 | 0; //@line 991
   HEAP32[$47 >> 2] = $46; //@line 992
   HEAP32[$46 + 16 >> 2] = $47; //@line 994
   $$05157 = $$053; //@line 995
  }
 } while (0);
 if ((label | 0) == 5) {
  HEAP32[$1 + 8 >> 2] = 0; //@line 1000
  $$0515859 = $$051$ph; //@line 1001
  label = 11; //@line 1002
 }
 if ((label | 0) == 11) {
  HEAP32[$1 + 12 >> 2] = 0; //@line 1006
  $$05157 = $$0515859; //@line 1007
 }
 HEAP32[$$05157 >> 2] = $1; //@line 1009
 HEAP32[$1 + 16 >> 2] = $$05157; //@line 1011
 $54 = HEAP32[$0 + 40 >> 2] | 0; //@line 1013
 if (!$54) {
  _equeue_mutex_unlock($24); //@line 1016
  return $13 | 0; //@line 1017
 }
 if (!(HEAP8[$0 + 36 >> 0] | 0)) {
  _equeue_mutex_unlock($24); //@line 1023
  return $13 | 0; //@line 1024
 }
 if ((HEAP32[$0 >> 2] | 0) != ($1 | 0)) {
  _equeue_mutex_unlock($24); //@line 1029
  return $13 | 0; //@line 1030
 }
 if (HEAP32[$1 + 12 >> 2] | 0) {
  _equeue_mutex_unlock($24); //@line 1036
  return $13 | 0; //@line 1037
 }
 $65 = HEAP32[$0 + 44 >> 2] | 0; //@line 1040
 $67 = (HEAP32[$14 >> 2] | 0) - $2 | 0; //@line 1042
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1046
 FUNCTION_TABLE_vii[$54 & 3]($65, $67 & ~($67 >> 31)); //@line 1047
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 27; //@line 1050
  HEAP32[$AsyncCtx + 4 >> 2] = $24; //@line 1052
  HEAP32[$AsyncCtx + 8 >> 2] = $13; //@line 1054
  sp = STACKTOP; //@line 1055
  return 0; //@line 1056
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1058
 _equeue_mutex_unlock($24); //@line 1059
 return $13 | 0; //@line 1060
}
function _mbed_vtracef__async_cb_17($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 1015
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1017
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1019
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1021
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1023
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1025
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1027
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1029
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1031
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1033
 $20 = HEAP8[$0 + 40 >> 0] & 1; //@line 1036
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1038
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1040
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 1042
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 1044
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 1046
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 1048
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 1050
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 1052
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 1054
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 1056
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 1058
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 1060
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 1062
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 1064
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 1066
 $55 = ($22 | 0 ? 4 : 0) + $22 + (HEAP32[___async_retval >> 2] | 0) | 0; //@line 1072
 $56 = HEAP32[51] | 0; //@line 1073
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(100) | 0; //@line 1074
 $57 = FUNCTION_TABLE_ii[$56 & 3]($55) | 0; //@line 1075
 if (!___async) {
  HEAP32[___async_retval >> 2] = $57; //@line 1079
  ___async_unwind = 0; //@line 1080
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 41; //@line 1082
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 1084
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 1086
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 1088
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 1090
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 1092
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $12; //@line 1094
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 1096
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $16; //@line 1098
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $18; //@line 1100
 HEAP8[$ReallocAsyncCtx5 + 40 >> 0] = $20 & 1; //@line 1103
 HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $28; //@line 1105
 HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $30; //@line 1107
 HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $32; //@line 1109
 HEAP32[$ReallocAsyncCtx5 + 56 >> 2] = $34; //@line 1111
 HEAP32[$ReallocAsyncCtx5 + 60 >> 2] = $36; //@line 1113
 HEAP32[$ReallocAsyncCtx5 + 64 >> 2] = $38; //@line 1115
 HEAP32[$ReallocAsyncCtx5 + 68 >> 2] = $24; //@line 1117
 HEAP32[$ReallocAsyncCtx5 + 72 >> 2] = $26; //@line 1119
 HEAP32[$ReallocAsyncCtx5 + 76 >> 2] = $40; //@line 1121
 HEAP32[$ReallocAsyncCtx5 + 80 >> 2] = $42; //@line 1123
 HEAP32[$ReallocAsyncCtx5 + 84 >> 2] = $44; //@line 1125
 HEAP32[$ReallocAsyncCtx5 + 88 >> 2] = $46; //@line 1127
 HEAP32[$ReallocAsyncCtx5 + 92 >> 2] = $48; //@line 1129
 HEAP32[$ReallocAsyncCtx5 + 96 >> 2] = $50; //@line 1131
 sp = STACKTOP; //@line 1132
 return;
}
function _mbed_vtracef__async_cb_16($0) {
 $0 = $0 | 0;
 var $$13 = 0, $$expand_i1_val = 0, $10 = 0, $12 = 0, $18 = 0, $19 = 0, $2 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 906
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 908
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 910
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 913
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 915
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 917
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 919
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 923
 $$13 = ($AsyncRetVal | 0) >= ($12 | 0) ? 0 : $AsyncRetVal; //@line 925
 $18 = (HEAP32[$0 + 28 >> 2] | 0) + $$13 | 0; //@line 927
 $19 = $12 - $$13 | 0; //@line 928
 do {
  if (($$13 | 0) > 0) {
   $21 = HEAP32[52] | 0; //@line 932
   if (!(($19 | 0) > 0 & ($21 | 0) != 0)) {
    if (($$13 | 0) < 1 | ($19 | 0) < 1 | $6 ^ 1) {
     break;
    }
    _snprintf($18, $19, 1379, $2) | 0; //@line 944
    break;
   }
   $ReallocAsyncCtx6 = _emscripten_realloc_async_context(32) | 0; //@line 947
   $23 = FUNCTION_TABLE_i[$21 & 0]() | 0; //@line 948
   if (___async) {
    HEAP32[$ReallocAsyncCtx6 >> 2] = 43; //@line 951
    $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 952
    HEAP32[$24 >> 2] = $8; //@line 953
    $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 954
    HEAP32[$25 >> 2] = $18; //@line 955
    $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 956
    HEAP32[$26 >> 2] = $19; //@line 957
    $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 958
    HEAP32[$27 >> 2] = $10; //@line 959
    $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 960
    $$expand_i1_val = $6 & 1; //@line 961
    HEAP8[$28 >> 0] = $$expand_i1_val; //@line 962
    $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 963
    HEAP32[$29 >> 2] = $2; //@line 964
    $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 965
    HEAP32[$30 >> 2] = $4; //@line 966
    sp = STACKTOP; //@line 967
    return;
   }
   HEAP32[___async_retval >> 2] = $23; //@line 971
   ___async_unwind = 0; //@line 972
   HEAP32[$ReallocAsyncCtx6 >> 2] = 43; //@line 973
   $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 974
   HEAP32[$24 >> 2] = $8; //@line 975
   $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 976
   HEAP32[$25 >> 2] = $18; //@line 977
   $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 978
   HEAP32[$26 >> 2] = $19; //@line 979
   $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 980
   HEAP32[$27 >> 2] = $10; //@line 981
   $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 982
   $$expand_i1_val = $6 & 1; //@line 983
   HEAP8[$28 >> 0] = $$expand_i1_val; //@line 984
   $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 985
   HEAP32[$29 >> 2] = $2; //@line 986
   $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 987
   HEAP32[$30 >> 2] = $4; //@line 988
   sp = STACKTOP; //@line 989
   return;
  }
 } while (0);
 $34 = HEAP32[53] | 0; //@line 993
 $35 = HEAP32[46] | 0; //@line 994
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 995
 FUNCTION_TABLE_vi[$34 & 255]($35); //@line 996
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 44; //@line 999
  sp = STACKTOP; //@line 1000
  return;
 }
 ___async_unwind = 0; //@line 1003
 HEAP32[$ReallocAsyncCtx7 >> 2] = 44; //@line 1004
 sp = STACKTOP; //@line 1005
 return;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $12 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $29 = 0, $3 = 0, $36 = 0, $39 = 0, $40 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx14 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 11702
 STACKTOP = STACKTOP + 48 | 0; //@line 11703
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 11703
 $vararg_buffer10 = sp + 32 | 0; //@line 11704
 $vararg_buffer7 = sp + 24 | 0; //@line 11705
 $vararg_buffer3 = sp + 16 | 0; //@line 11706
 $vararg_buffer = sp; //@line 11707
 $0 = sp + 36 | 0; //@line 11708
 $1 = ___cxa_get_globals_fast() | 0; //@line 11709
 if ($1 | 0) {
  $3 = HEAP32[$1 >> 2] | 0; //@line 11712
  if ($3 | 0) {
   $7 = $3 + 48 | 0; //@line 11717
   $9 = HEAP32[$7 >> 2] | 0; //@line 11719
   $12 = HEAP32[$7 + 4 >> 2] | 0; //@line 11722
   if (!(($9 & -256 | 0) == 1126902528 & ($12 | 0) == 1129074247)) {
    HEAP32[$vararg_buffer7 >> 2] = 4460; //@line 11728
    _abort_message(4410, $vararg_buffer7); //@line 11729
   }
   if (($9 | 0) == 1126902529 & ($12 | 0) == 1129074247) {
    $22 = HEAP32[$3 + 44 >> 2] | 0; //@line 11738
   } else {
    $22 = $3 + 80 | 0; //@line 11740
   }
   HEAP32[$0 >> 2] = $22; //@line 11742
   $23 = HEAP32[$3 >> 2] | 0; //@line 11743
   $25 = HEAP32[$23 + 4 >> 2] | 0; //@line 11745
   $28 = HEAP32[(HEAP32[10] | 0) + 16 >> 2] | 0; //@line 11748
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 11749
   $29 = FUNCTION_TABLE_iiii[$28 & 7](40, $23, $0) | 0; //@line 11750
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 112; //@line 11753
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 11755
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 11757
    HEAP32[$AsyncCtx + 12 >> 2] = $25; //@line 11759
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 11761
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 11763
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 11765
    sp = STACKTOP; //@line 11766
    STACKTOP = sp; //@line 11767
    return;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 11769
   if (!$29) {
    HEAP32[$vararg_buffer3 >> 2] = 4460; //@line 11771
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 11773
    _abort_message(4369, $vararg_buffer3); //@line 11774
   }
   $36 = HEAP32[$0 >> 2] | 0; //@line 11777
   $39 = HEAP32[(HEAP32[$36 >> 2] | 0) + 8 >> 2] | 0; //@line 11780
   $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 11781
   $40 = FUNCTION_TABLE_ii[$39 & 3]($36) | 0; //@line 11782
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 113; //@line 11785
    HEAP32[$AsyncCtx14 + 4 >> 2] = $vararg_buffer; //@line 11787
    HEAP32[$AsyncCtx14 + 8 >> 2] = $25; //@line 11789
    HEAP32[$AsyncCtx14 + 12 >> 2] = $vararg_buffer; //@line 11791
    sp = STACKTOP; //@line 11792
    STACKTOP = sp; //@line 11793
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 11795
    HEAP32[$vararg_buffer >> 2] = 4460; //@line 11796
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 11798
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 11800
    _abort_message(4324, $vararg_buffer); //@line 11801
   }
  }
 }
 _abort_message(4448, $vararg_buffer10); //@line 11806
}
function _mbed_error_vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3532
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3534
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3536
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3538
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[1227] | 0)) {
  _serial_init(4912, 2, 3); //@line 3546
 }
 $9 = HEAP8[$4 >> 0] | 0; //@line 3548
 if (0 == 13 | $9 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 3554
  _serial_putc(4912, $9 << 24 >> 24); //@line 3555
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 67; //@line 3558
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 3559
   HEAP32[$18 >> 2] = 0; //@line 3560
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 3561
   HEAP32[$19 >> 2] = $AsyncRetVal; //@line 3562
   $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 3563
   HEAP32[$20 >> 2] = $2; //@line 3564
   $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 3565
   HEAP8[$21 >> 0] = $9; //@line 3566
   $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 3567
   HEAP32[$22 >> 2] = $4; //@line 3568
   sp = STACKTOP; //@line 3569
   return;
  }
  ___async_unwind = 0; //@line 3572
  HEAP32[$ReallocAsyncCtx2 >> 2] = 67; //@line 3573
  $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 3574
  HEAP32[$18 >> 2] = 0; //@line 3575
  $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 3576
  HEAP32[$19 >> 2] = $AsyncRetVal; //@line 3577
  $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 3578
  HEAP32[$20 >> 2] = $2; //@line 3579
  $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 3580
  HEAP8[$21 >> 0] = $9; //@line 3581
  $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 3582
  HEAP32[$22 >> 2] = $4; //@line 3583
  sp = STACKTOP; //@line 3584
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 3587
  _serial_putc(4912, 13); //@line 3588
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 66; //@line 3591
   $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 3592
   HEAP8[$12 >> 0] = $9; //@line 3593
   $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 3594
   HEAP32[$13 >> 2] = 0; //@line 3595
   $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 3596
   HEAP32[$14 >> 2] = $AsyncRetVal; //@line 3597
   $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 3598
   HEAP32[$15 >> 2] = $2; //@line 3599
   $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 3600
   HEAP32[$16 >> 2] = $4; //@line 3601
   sp = STACKTOP; //@line 3602
   return;
  }
  ___async_unwind = 0; //@line 3605
  HEAP32[$ReallocAsyncCtx3 >> 2] = 66; //@line 3606
  $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 3607
  HEAP8[$12 >> 0] = $9; //@line 3608
  $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 3609
  HEAP32[$13 >> 2] = 0; //@line 3610
  $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 3611
  HEAP32[$14 >> 2] = $AsyncRetVal; //@line 3612
  $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 3613
  HEAP32[$15 >> 2] = $2; //@line 3614
  $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 3615
  HEAP32[$16 >> 2] = $4; //@line 3616
  sp = STACKTOP; //@line 3617
  return;
 }
}
function _mbed_error_vfprintf__async_cb_60($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3625
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3629
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3631
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3635
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 3636
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP8[$10 + $12 >> 0] | 0; //@line 3642
 if ((HEAP8[$0 + 16 >> 0] | 0) == 13 | $13 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 3648
  _serial_putc(4912, $13 << 24 >> 24); //@line 3649
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 67; //@line 3652
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 3653
   HEAP32[$22 >> 2] = $12; //@line 3654
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 3655
   HEAP32[$23 >> 2] = $4; //@line 3656
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 3657
   HEAP32[$24 >> 2] = $6; //@line 3658
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 3659
   HEAP8[$25 >> 0] = $13; //@line 3660
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 3661
   HEAP32[$26 >> 2] = $10; //@line 3662
   sp = STACKTOP; //@line 3663
   return;
  }
  ___async_unwind = 0; //@line 3666
  HEAP32[$ReallocAsyncCtx2 >> 2] = 67; //@line 3667
  $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 3668
  HEAP32[$22 >> 2] = $12; //@line 3669
  $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 3670
  HEAP32[$23 >> 2] = $4; //@line 3671
  $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 3672
  HEAP32[$24 >> 2] = $6; //@line 3673
  $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 3674
  HEAP8[$25 >> 0] = $13; //@line 3675
  $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 3676
  HEAP32[$26 >> 2] = $10; //@line 3677
  sp = STACKTOP; //@line 3678
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 3681
  _serial_putc(4912, 13); //@line 3682
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 66; //@line 3685
   $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 3686
   HEAP8[$16 >> 0] = $13; //@line 3687
   $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 3688
   HEAP32[$17 >> 2] = $12; //@line 3689
   $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 3690
   HEAP32[$18 >> 2] = $4; //@line 3691
   $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 3692
   HEAP32[$19 >> 2] = $6; //@line 3693
   $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 3694
   HEAP32[$20 >> 2] = $10; //@line 3695
   sp = STACKTOP; //@line 3696
   return;
  }
  ___async_unwind = 0; //@line 3699
  HEAP32[$ReallocAsyncCtx3 >> 2] = 66; //@line 3700
  $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 3701
  HEAP8[$16 >> 0] = $13; //@line 3702
  $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 3703
  HEAP32[$17 >> 2] = $12; //@line 3704
  $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 3705
  HEAP32[$18 >> 2] = $4; //@line 3706
  $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 3707
  HEAP32[$19 >> 2] = $6; //@line 3708
  $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 3709
  HEAP32[$20 >> 2] = $10; //@line 3710
  sp = STACKTOP; //@line 3711
  return;
 }
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6716
 STACKTOP = STACKTOP + 48 | 0; //@line 6717
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 6717
 $vararg_buffer3 = sp + 16 | 0; //@line 6718
 $vararg_buffer = sp; //@line 6719
 $3 = sp + 32 | 0; //@line 6720
 $4 = $0 + 28 | 0; //@line 6721
 $5 = HEAP32[$4 >> 2] | 0; //@line 6722
 HEAP32[$3 >> 2] = $5; //@line 6723
 $7 = $0 + 20 | 0; //@line 6725
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 6727
 HEAP32[$3 + 4 >> 2] = $9; //@line 6728
 HEAP32[$3 + 8 >> 2] = $1; //@line 6730
 HEAP32[$3 + 12 >> 2] = $2; //@line 6732
 $12 = $9 + $2 | 0; //@line 6733
 $13 = $0 + 60 | 0; //@line 6734
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 6737
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 6739
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 6741
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 6743
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 6747
  } else {
   $$04756 = 2; //@line 6749
   $$04855 = $12; //@line 6749
   $$04954 = $3; //@line 6749
   $27 = $17; //@line 6749
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 6755
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 6757
    $38 = $27 >>> 0 > $37 >>> 0; //@line 6758
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 6760
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 6762
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 6764
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 6767
    $44 = $$150 + 4 | 0; //@line 6768
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 6771
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 6774
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 6776
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 6778
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 6780
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 6783
     break L1;
    } else {
     $$04756 = $$1; //@line 6786
     $$04954 = $$150; //@line 6786
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 6790
   HEAP32[$4 >> 2] = 0; //@line 6791
   HEAP32[$7 >> 2] = 0; //@line 6792
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 6795
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 6798
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 6803
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 6809
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 6814
  $25 = $20; //@line 6815
  HEAP32[$4 >> 2] = $25; //@line 6816
  HEAP32[$7 >> 2] = $25; //@line 6817
  $$051 = $2; //@line 6818
 }
 STACKTOP = sp; //@line 6820
 return $$051 | 0; //@line 6820
}
function _main__async_cb_27($0) {
 $0 = $0 | 0;
 var $$expand_i1_val = 0, $12 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 1646
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1648
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1650
 if (!$AsyncRetVal) {
  HEAP32[$2 >> 2] = 0; //@line 1653
  HEAP32[$2 + 4 >> 2] = 0; //@line 1653
  HEAP32[$2 + 8 >> 2] = 0; //@line 1653
  HEAP32[$2 + 12 >> 2] = 0; //@line 1653
  $18 = 1; //@line 1654
  $20 = $2; //@line 1654
 } else {
  HEAP32[$AsyncRetVal + 4 >> 2] = 4920; //@line 1657
  HEAP32[$AsyncRetVal + 8 >> 2] = 0; //@line 1659
  HEAP32[$AsyncRetVal + 12 >> 2] = 0; //@line 1661
  HEAP32[$AsyncRetVal + 16 >> 2] = -1; //@line 1663
  HEAP32[$AsyncRetVal + 20 >> 2] = 2; //@line 1665
  HEAP32[$AsyncRetVal + 24 >> 2] = 81; //@line 1667
  HEAP32[$AsyncRetVal + 28 >> 2] = 3; //@line 1669
  HEAP32[$AsyncRetVal >> 2] = 1; //@line 1670
  $12 = $2 + 4 | 0; //@line 1671
  HEAP32[$12 >> 2] = 0; //@line 1672
  HEAP32[$12 + 4 >> 2] = 0; //@line 1672
  HEAP32[$12 + 8 >> 2] = 0; //@line 1672
  HEAP32[$2 >> 2] = $AsyncRetVal; //@line 1673
  HEAP32[$AsyncRetVal >> 2] = (HEAP32[$AsyncRetVal >> 2] | 0) + 1; //@line 1676
  $18 = 0; //@line 1677
  $20 = $2; //@line 1677
 }
 $15 = $2 + 12 | 0; //@line 1679
 HEAP32[$15 >> 2] = 232; //@line 1680
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(24) | 0; //@line 1681
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5172, $2); //@line 1682
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 82; //@line 1685
  $16 = $ReallocAsyncCtx6 + 4 | 0; //@line 1686
  HEAP32[$16 >> 2] = $15; //@line 1687
  $17 = $ReallocAsyncCtx6 + 8 | 0; //@line 1688
  $$expand_i1_val = $18 & 1; //@line 1689
  HEAP8[$17 >> 0] = $$expand_i1_val; //@line 1690
  $19 = $ReallocAsyncCtx6 + 12 | 0; //@line 1691
  HEAP32[$19 >> 2] = $20; //@line 1692
  $21 = $ReallocAsyncCtx6 + 16 | 0; //@line 1693
  HEAP32[$21 >> 2] = $AsyncRetVal; //@line 1694
  $22 = $ReallocAsyncCtx6 + 20 | 0; //@line 1695
  HEAP32[$22 >> 2] = $AsyncRetVal; //@line 1696
  sp = STACKTOP; //@line 1697
  return;
 }
 ___async_unwind = 0; //@line 1700
 HEAP32[$ReallocAsyncCtx6 >> 2] = 82; //@line 1701
 $16 = $ReallocAsyncCtx6 + 4 | 0; //@line 1702
 HEAP32[$16 >> 2] = $15; //@line 1703
 $17 = $ReallocAsyncCtx6 + 8 | 0; //@line 1704
 $$expand_i1_val = $18 & 1; //@line 1705
 HEAP8[$17 >> 0] = $$expand_i1_val; //@line 1706
 $19 = $ReallocAsyncCtx6 + 12 | 0; //@line 1707
 HEAP32[$19 >> 2] = $20; //@line 1708
 $21 = $ReallocAsyncCtx6 + 16 | 0; //@line 1709
 HEAP32[$21 >> 2] = $AsyncRetVal; //@line 1710
 $22 = $ReallocAsyncCtx6 + 20 | 0; //@line 1711
 HEAP32[$22 >> 2] = $AsyncRetVal; //@line 1712
 sp = STACKTOP; //@line 1713
 return;
}
function _mbed_error_vfprintf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$01213 = 0, $$014 = 0, $2 = 0, $24 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0, $$01213$looptemp = 0;
 sp = STACKTOP; //@line 2809
 STACKTOP = STACKTOP + 128 | 0; //@line 2810
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 2810
 $2 = sp; //@line 2811
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 2812
 $3 = _vsnprintf($2, 128, $0, $1) | 0; //@line 2813
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 65; //@line 2816
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 2818
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 2820
  sp = STACKTOP; //@line 2821
  STACKTOP = sp; //@line 2822
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2824
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 2827
  return;
 }
 if (!(HEAP32[1227] | 0)) {
  _serial_init(4912, 2, 3); //@line 2832
  $$01213 = 0; //@line 2833
  $$014 = 0; //@line 2833
 } else {
  $$01213 = 0; //@line 2835
  $$014 = 0; //@line 2835
 }
 while (1) {
  $$01213$looptemp = $$01213;
  $$01213 = HEAP8[$2 + $$014 >> 0] | 0; //@line 2839
  if (!($$01213$looptemp << 24 >> 24 == 13 | $$01213 << 24 >> 24 != 10)) {
   $AsyncCtx7 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2844
   _serial_putc(4912, 13); //@line 2845
   if (___async) {
    label = 8; //@line 2848
    break;
   }
   _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2851
  }
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2854
  _serial_putc(4912, $$01213 << 24 >> 24); //@line 2855
  if (___async) {
   label = 11; //@line 2858
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2861
  $24 = $$014 + 1 | 0; //@line 2862
  if (($24 | 0) == ($3 | 0)) {
   label = 13; //@line 2865
   break;
  } else {
   $$014 = $24; //@line 2868
  }
 }
 if ((label | 0) == 8) {
  HEAP32[$AsyncCtx7 >> 2] = 66; //@line 2872
  HEAP8[$AsyncCtx7 + 4 >> 0] = $$01213; //@line 2874
  HEAP32[$AsyncCtx7 + 8 >> 2] = $$014; //@line 2876
  HEAP32[$AsyncCtx7 + 12 >> 2] = $3; //@line 2878
  HEAP32[$AsyncCtx7 + 16 >> 2] = $2; //@line 2880
  HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 2882
  sp = STACKTOP; //@line 2883
  STACKTOP = sp; //@line 2884
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx3 >> 2] = 67; //@line 2887
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$014; //@line 2889
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 2891
  HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 2893
  HEAP8[$AsyncCtx3 + 16 >> 0] = $$01213; //@line 2895
  HEAP32[$AsyncCtx3 + 20 >> 2] = $2; //@line 2897
  sp = STACKTOP; //@line 2898
  STACKTOP = sp; //@line 2899
  return;
 } else if ((label | 0) == 13) {
  STACKTOP = sp; //@line 2902
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_56($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3213
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3217
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3219
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 3221
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3223
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 3225
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3227
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3229
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3231
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 3233
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 3236
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 3238
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 3242
   $27 = $6 + 24 | 0; //@line 3243
   $28 = $4 + 8 | 0; //@line 3244
   $29 = $6 + 54 | 0; //@line 3245
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
    HEAP8[$10 >> 0] = 0; //@line 3275
    HEAP8[$14 >> 0] = 0; //@line 3276
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 3277
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 3278
    if (!___async) {
     ___async_unwind = 0; //@line 3281
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 127; //@line 3283
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 3285
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 3287
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 3289
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 3291
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 3293
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 3295
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 3297
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 3299
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 3301
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 3303
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 3305
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 3307
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 3309
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 3312
    sp = STACKTOP; //@line 3313
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 3318
 HEAP8[$14 >> 0] = $12; //@line 3319
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3097
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3101
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3103
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 3105
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3107
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 3109
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3111
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3113
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3115
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 3117
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 3119
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 3121
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 3123
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 3126
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 3127
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
    HEAP8[$10 >> 0] = 0; //@line 3160
    HEAP8[$14 >> 0] = 0; //@line 3161
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 3162
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 3163
    if (!___async) {
     ___async_unwind = 0; //@line 3166
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 127; //@line 3168
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 3170
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 3172
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 3174
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 3176
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 3178
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 3180
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 3182
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 3184
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 3186
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 3188
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 3190
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 3192
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 3194
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 3197
    sp = STACKTOP; //@line 3198
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 3203
 HEAP8[$14 >> 0] = $12; //@line 3204
 return;
}
function _main__async_cb_26($0) {
 $0 = $0 | 0;
 var $$expand_i1_val = 0, $10 = 0, $11 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $19 = 0, $22 = 0, $23 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1559
 $4 = HEAP8[$0 + 8 >> 0] & 1; //@line 1564
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1566
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1568
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1570
 $11 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 1571
 if ($11 | 0) {
  $14 = HEAP32[$11 + 8 >> 2] | 0; //@line 1575
  $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 1576
  FUNCTION_TABLE_vi[$14 & 255]($6); //@line 1577
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 83; //@line 1580
   $15 = $ReallocAsyncCtx + 4 | 0; //@line 1581
   $$expand_i1_val = $4 & 1; //@line 1582
   HEAP8[$15 >> 0] = $$expand_i1_val; //@line 1583
   $16 = $ReallocAsyncCtx + 8 | 0; //@line 1584
   HEAP32[$16 >> 2] = $8; //@line 1585
   $17 = $ReallocAsyncCtx + 12 | 0; //@line 1586
   HEAP32[$17 >> 2] = $10; //@line 1587
   sp = STACKTOP; //@line 1588
   return;
  }
  ___async_unwind = 0; //@line 1591
  HEAP32[$ReallocAsyncCtx >> 2] = 83; //@line 1592
  $15 = $ReallocAsyncCtx + 4 | 0; //@line 1593
  $$expand_i1_val = $4 & 1; //@line 1594
  HEAP8[$15 >> 0] = $$expand_i1_val; //@line 1595
  $16 = $ReallocAsyncCtx + 8 | 0; //@line 1596
  HEAP32[$16 >> 2] = $8; //@line 1597
  $17 = $ReallocAsyncCtx + 12 | 0; //@line 1598
  HEAP32[$17 >> 2] = $10; //@line 1599
  sp = STACKTOP; //@line 1600
  return;
 }
 if (!$4) {
  $19 = (HEAP32[$8 >> 2] | 0) + -1 | 0; //@line 1605
  HEAP32[$8 >> 2] = $19; //@line 1606
  if (!$19) {
   $22 = HEAP32[$8 + 24 >> 2] | 0; //@line 1610
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 1611
   FUNCTION_TABLE_vi[$22 & 255]($10); //@line 1612
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 84; //@line 1615
    $23 = $ReallocAsyncCtx2 + 4 | 0; //@line 1616
    HEAP32[$23 >> 2] = $8; //@line 1617
    sp = STACKTOP; //@line 1618
    return;
   }
   ___async_unwind = 0; //@line 1621
   HEAP32[$ReallocAsyncCtx2 >> 2] = 84; //@line 1622
   $23 = $ReallocAsyncCtx2 + 4 | 0; //@line 1623
   HEAP32[$23 >> 2] = $8; //@line 1624
   sp = STACKTOP; //@line 1625
   return;
  }
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 1629
 __ZN6events10EventQueue8dispatchEi(4920, -1); //@line 1630
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 1633
  sp = STACKTOP; //@line 1634
  return;
 }
 ___async_unwind = 0; //@line 1637
 HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 1638
 sp = STACKTOP; //@line 1639
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 7020
 }
 ret = dest | 0; //@line 7023
 dest_end = dest + num | 0; //@line 7024
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 7028
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 7029
   dest = dest + 1 | 0; //@line 7030
   src = src + 1 | 0; //@line 7031
   num = num - 1 | 0; //@line 7032
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 7034
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 7035
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 7037
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 7038
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 7039
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 7040
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 7041
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 7042
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 7043
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 7044
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 7045
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 7046
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 7047
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 7048
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 7049
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 7050
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 7051
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 7052
   dest = dest + 64 | 0; //@line 7053
   src = src + 64 | 0; //@line 7054
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 7057
   dest = dest + 4 | 0; //@line 7058
   src = src + 4 | 0; //@line 7059
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 7063
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 7065
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 7066
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 7067
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 7068
   dest = dest + 4 | 0; //@line 7069
   src = src + 4 | 0; //@line 7070
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 7075
  dest = dest + 1 | 0; //@line 7076
  src = src + 1 | 0; //@line 7077
 }
 return ret | 0; //@line 7079
}
function _equeue_alloc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$038$sink$i = 0, $$03842$i = 0, $$1$i9 = 0, $10 = 0, $11 = 0, $14 = 0, $17 = 0, $20 = 0, $21 = 0, $23 = 0, $24 = 0, $26 = 0, $27 = 0, $8 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 680
 do {
  if (HEAP8[$0 + 184 >> 0] | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 686
   _wait_ms(10); //@line 687
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 24; //@line 690
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 692
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 694
    sp = STACKTOP; //@line 695
    return 0; //@line 696
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 698
    break;
   }
  }
 } while (0);
 $8 = $1 + 39 & -4; //@line 704
 $9 = $0 + 156 | 0; //@line 705
 _equeue_mutex_lock($9); //@line 706
 $10 = $0 + 24 | 0; //@line 707
 $11 = HEAP32[$10 >> 2] | 0; //@line 708
 L7 : do {
  if (!$11) {
   label = 11; //@line 712
  } else {
   $$03842$i = $10; //@line 714
   $14 = $11; //@line 714
   while (1) {
    if ((HEAP32[$14 >> 2] | 0) >>> 0 >= $8 >>> 0) {
     break;
    }
    $20 = $14 + 8 | 0; //@line 721
    $21 = HEAP32[$20 >> 2] | 0; //@line 722
    if (!$21) {
     label = 11; //@line 725
     break L7;
    } else {
     $$03842$i = $20; //@line 728
     $14 = $21; //@line 728
    }
   }
   $17 = HEAP32[$14 + 12 >> 2] | 0; //@line 732
   if (!$17) {
    $$038$sink$i = $$03842$i; //@line 735
   } else {
    HEAP32[$$03842$i >> 2] = $17; //@line 737
    $$038$sink$i = $17 + 8 | 0; //@line 739
   }
   HEAP32[$$038$sink$i >> 2] = HEAP32[$14 + 8 >> 2]; //@line 743
   _equeue_mutex_unlock($9); //@line 744
   $$1$i9 = $14; //@line 745
  }
 } while (0);
 do {
  if ((label | 0) == 11) {
   $23 = $0 + 28 | 0; //@line 750
   $24 = HEAP32[$23 >> 2] | 0; //@line 751
   if ($24 >>> 0 < $8 >>> 0) {
    _equeue_mutex_unlock($9); //@line 754
    $$0 = 0; //@line 755
    return $$0 | 0; //@line 756
   } else {
    $26 = $0 + 32 | 0; //@line 758
    $27 = HEAP32[$26 >> 2] | 0; //@line 759
    HEAP32[$26 >> 2] = $27 + $8; //@line 761
    HEAP32[$23 >> 2] = $24 - $8; //@line 763
    HEAP32[$27 >> 2] = $8; //@line 764
    HEAP8[$27 + 4 >> 0] = 1; //@line 766
    _equeue_mutex_unlock($9); //@line 767
    if (!$27) {
     $$0 = 0; //@line 770
    } else {
     $$1$i9 = $27; //@line 772
     break;
    }
    return $$0 | 0; //@line 775
   }
  }
 } while (0);
 HEAP32[$$1$i9 + 20 >> 2] = 0; //@line 780
 HEAP32[$$1$i9 + 24 >> 2] = -1; //@line 782
 HEAP32[$$1$i9 + 28 >> 2] = 0; //@line 784
 $$0 = $$1$i9 + 36 | 0; //@line 786
 return $$0 | 0; //@line 787
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 11891
 STACKTOP = STACKTOP + 64 | 0; //@line 11892
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 11892
 $3 = sp; //@line 11893
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 11896
 } else {
  if (!$1) {
   $$2 = 0; //@line 11900
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 11902
   $6 = ___dynamic_cast($1, 64, 48, 0) | 0; //@line 11903
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 116; //@line 11906
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 11908
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 11910
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 11912
    sp = STACKTOP; //@line 11913
    STACKTOP = sp; //@line 11914
    return 0; //@line 11914
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11916
   if (!$6) {
    $$2 = 0; //@line 11919
   } else {
    dest = $3 + 4 | 0; //@line 11922
    stop = dest + 52 | 0; //@line 11922
    do {
     HEAP32[dest >> 2] = 0; //@line 11922
     dest = dest + 4 | 0; //@line 11922
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 11923
    HEAP32[$3 + 8 >> 2] = $0; //@line 11925
    HEAP32[$3 + 12 >> 2] = -1; //@line 11927
    HEAP32[$3 + 48 >> 2] = 1; //@line 11929
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 11932
    $18 = HEAP32[$2 >> 2] | 0; //@line 11933
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 11934
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 11935
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 117; //@line 11938
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 11940
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 11942
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 11944
     sp = STACKTOP; //@line 11945
     STACKTOP = sp; //@line 11946
     return 0; //@line 11946
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 11948
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 11955
     $$0 = 1; //@line 11956
    } else {
     $$0 = 0; //@line 11958
    }
    $$2 = $$0; //@line 11960
   }
  }
 }
 STACKTOP = sp; //@line 11964
 return $$2 | 0; //@line 11964
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 11437
 STACKTOP = STACKTOP + 128 | 0; //@line 11438
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 11438
 $4 = sp + 124 | 0; //@line 11439
 $5 = sp; //@line 11440
 dest = $5; //@line 11441
 src = 748; //@line 11441
 stop = dest + 124 | 0; //@line 11441
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 11441
  dest = dest + 4 | 0; //@line 11441
  src = src + 4 | 0; //@line 11441
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 11447
   $$015 = 1; //@line 11447
   label = 4; //@line 11448
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 11451
   $$0 = -1; //@line 11452
  }
 } else {
  $$014 = $0; //@line 11455
  $$015 = $1; //@line 11455
  label = 4; //@line 11456
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 11460
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 11462
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 11464
  $14 = $5 + 20 | 0; //@line 11465
  HEAP32[$14 >> 2] = $$014; //@line 11466
  HEAP32[$5 + 44 >> 2] = $$014; //@line 11468
  $16 = $$014 + $$$015 | 0; //@line 11469
  $17 = $5 + 16 | 0; //@line 11470
  HEAP32[$17 >> 2] = $16; //@line 11471
  HEAP32[$5 + 28 >> 2] = $16; //@line 11473
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 11474
  $19 = _vfprintf($5, $2, $3) | 0; //@line 11475
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 108; //@line 11478
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 11480
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 11482
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 11484
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 11486
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 11488
   sp = STACKTOP; //@line 11489
   STACKTOP = sp; //@line 11490
   return 0; //@line 11490
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11492
  if (!$$$015) {
   $$0 = $19; //@line 11495
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 11497
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 11502
   $$0 = $19; //@line 11503
  }
 }
 STACKTOP = sp; //@line 11506
 return $$0 | 0; //@line 11506
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13223
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 13229
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 13233
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 13234
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 13235
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 13236
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 133; //@line 13239
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 13241
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 13243
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 13245
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 13247
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 13249
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 13251
    sp = STACKTOP; //@line 13252
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13255
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 13259
    $$0 = $0 + 24 | 0; //@line 13260
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 13262
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 13263
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 13268
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 13274
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 13277
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 134; //@line 13282
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 13284
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 13286
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 13288
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 13290
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 13292
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 13294
    sp = STACKTOP; //@line 13295
    return;
   }
  }
 } while (0);
 return;
}
function _equeue_alloc__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$038$sink$i = 0, $$03842$i = 0, $$1$i9 = 0, $12 = 0, $15 = 0, $18 = 0, $19 = 0, $21 = 0, $22 = 0, $24 = 0, $25 = 0, $34 = 0, $4 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1782
 $6 = (HEAP32[$0 + 4 >> 2] | 0) + 39 & -4; //@line 1784
 $7 = $4 + 156 | 0; //@line 1785
 _equeue_mutex_lock($7); //@line 1786
 $8 = $4 + 24 | 0; //@line 1787
 $9 = HEAP32[$8 >> 2] | 0; //@line 1788
 L3 : do {
  if (!$9) {
   label = 9; //@line 1792
  } else {
   $$03842$i = $8; //@line 1794
   $12 = $9; //@line 1794
   while (1) {
    if ((HEAP32[$12 >> 2] | 0) >>> 0 >= $6 >>> 0) {
     break;
    }
    $18 = $12 + 8 | 0; //@line 1801
    $19 = HEAP32[$18 >> 2] | 0; //@line 1802
    if (!$19) {
     label = 9; //@line 1805
     break L3;
    } else {
     $$03842$i = $18; //@line 1808
     $12 = $19; //@line 1808
    }
   }
   $15 = HEAP32[$12 + 12 >> 2] | 0; //@line 1812
   if (!$15) {
    $$038$sink$i = $$03842$i; //@line 1815
   } else {
    HEAP32[$$03842$i >> 2] = $15; //@line 1817
    $$038$sink$i = $15 + 8 | 0; //@line 1819
   }
   HEAP32[$$038$sink$i >> 2] = HEAP32[$12 + 8 >> 2]; //@line 1823
   _equeue_mutex_unlock($7); //@line 1824
   $$1$i9 = $12; //@line 1825
  }
 } while (0);
 do {
  if ((label | 0) == 9) {
   $21 = $4 + 28 | 0; //@line 1830
   $22 = HEAP32[$21 >> 2] | 0; //@line 1831
   if ($22 >>> 0 < $6 >>> 0) {
    _equeue_mutex_unlock($7); //@line 1834
    $$0 = 0; //@line 1835
    $34 = ___async_retval; //@line 1836
    HEAP32[$34 >> 2] = $$0; //@line 1837
    return;
   } else {
    $24 = $4 + 32 | 0; //@line 1840
    $25 = HEAP32[$24 >> 2] | 0; //@line 1841
    HEAP32[$24 >> 2] = $25 + $6; //@line 1843
    HEAP32[$21 >> 2] = $22 - $6; //@line 1845
    HEAP32[$25 >> 2] = $6; //@line 1846
    HEAP8[$25 + 4 >> 0] = 1; //@line 1848
    _equeue_mutex_unlock($7); //@line 1849
    if (!$25) {
     $$0 = 0; //@line 1852
    } else {
     $$1$i9 = $25; //@line 1854
     break;
    }
    $34 = ___async_retval; //@line 1857
    HEAP32[$34 >> 2] = $$0; //@line 1858
    return;
   }
  }
 } while (0);
 HEAP32[$$1$i9 + 20 >> 2] = 0; //@line 1864
 HEAP32[$$1$i9 + 24 >> 2] = -1; //@line 1866
 HEAP32[$$1$i9 + 28 >> 2] = 0; //@line 1868
 $$0 = $$1$i9 + 36 | 0; //@line 1870
 $34 = ___async_retval; //@line 1871
 HEAP32[$34 >> 2] = $$0; //@line 1872
 return;
}
function _equeue_dealloc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$02329$i = 0, $$02330$i = 0, $$025$i = 0, $$sink$in$i = 0, $$sink21$i = 0, $10 = 0, $11 = 0, $13 = 0, $14 = 0, $15 = 0, $17 = 0, $18 = 0, $2 = 0, $25 = 0, $4 = 0, $9 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 794
 $2 = $1 + -36 | 0; //@line 795
 $4 = HEAP32[$1 + -8 >> 2] | 0; //@line 797
 do {
  if ($4 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 801
   FUNCTION_TABLE_vi[$4 & 255]($1); //@line 802
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 25; //@line 805
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 807
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 809
    HEAP32[$AsyncCtx + 12 >> 2] = $2; //@line 811
    sp = STACKTOP; //@line 812
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 815
    break;
   }
  }
 } while (0);
 $9 = $0 + 156 | 0; //@line 820
 _equeue_mutex_lock($9); //@line 821
 $10 = $0 + 24 | 0; //@line 822
 $11 = HEAP32[$10 >> 2] | 0; //@line 823
 L7 : do {
  if (!$11) {
   $$02329$i = $10; //@line 827
  } else {
   $13 = HEAP32[$2 >> 2] | 0; //@line 829
   $$025$i = $10; //@line 830
   $15 = $11; //@line 830
   while (1) {
    $14 = HEAP32[$15 >> 2] | 0; //@line 832
    if ($14 >>> 0 >= $13 >>> 0) {
     break;
    }
    $17 = $15 + 8 | 0; //@line 837
    $18 = HEAP32[$17 >> 2] | 0; //@line 838
    if (!$18) {
     $$02329$i = $17; //@line 841
     break L7;
    } else {
     $$025$i = $17; //@line 844
     $15 = $18; //@line 844
    }
   }
   if (($14 | 0) == ($13 | 0)) {
    HEAP32[$1 + -24 >> 2] = $15; //@line 850
    $$02330$i = $$025$i; //@line 853
    $$sink$in$i = (HEAP32[$$025$i >> 2] | 0) + 8 | 0; //@line 853
    $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 854
    $25 = $1 + -28 | 0; //@line 855
    HEAP32[$25 >> 2] = $$sink21$i; //@line 856
    HEAP32[$$02330$i >> 2] = $2; //@line 857
    _equeue_mutex_unlock($9); //@line 858
    return;
   } else {
    $$02329$i = $$025$i; //@line 861
   }
  }
 } while (0);
 HEAP32[$1 + -24 >> 2] = 0; //@line 866
 $$02330$i = $$02329$i; //@line 867
 $$sink$in$i = $$02329$i; //@line 867
 $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 868
 $25 = $1 + -28 | 0; //@line 869
 HEAP32[$25 >> 2] = $$sink21$i; //@line 870
 HEAP32[$$02330$i >> 2] = $2; //@line 871
 _equeue_mutex_unlock($9); //@line 872
 return;
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11533
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 11538
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 11543
  } else {
   $20 = $0 & 255; //@line 11545
   $21 = $0 & 255; //@line 11546
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 11552
   } else {
    $26 = $1 + 20 | 0; //@line 11554
    $27 = HEAP32[$26 >> 2] | 0; //@line 11555
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 11561
     HEAP8[$27 >> 0] = $20; //@line 11562
     $34 = $21; //@line 11563
    } else {
     label = 12; //@line 11565
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 11570
     $32 = ___overflow($1, $0) | 0; //@line 11571
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 110; //@line 11574
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 11576
      sp = STACKTOP; //@line 11577
      return 0; //@line 11578
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 11580
      $34 = $32; //@line 11581
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 11586
   $$0 = $34; //@line 11587
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 11592
   $8 = $0 & 255; //@line 11593
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 11599
    $14 = HEAP32[$13 >> 2] | 0; //@line 11600
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 11606
     HEAP8[$14 >> 0] = $7; //@line 11607
     $$0 = $8; //@line 11608
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 11612
   $19 = ___overflow($1, $0) | 0; //@line 11613
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 109; //@line 11616
    sp = STACKTOP; //@line 11617
    return 0; //@line 11618
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11620
    $$0 = $19; //@line 11621
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 11626
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 7426
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 7429
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 7432
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 7435
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 7441
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 7450
     $24 = $13 >>> 2; //@line 7451
     $$090 = 0; //@line 7452
     $$094 = $7; //@line 7452
     while (1) {
      $25 = $$094 >>> 1; //@line 7454
      $26 = $$090 + $25 | 0; //@line 7455
      $27 = $26 << 1; //@line 7456
      $28 = $27 + $23 | 0; //@line 7457
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 7460
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 7464
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 7470
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 7478
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 7482
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 7488
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 7493
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 7496
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 7496
      }
     }
     $46 = $27 + $24 | 0; //@line 7499
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 7502
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 7506
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 7518
     } else {
      $$4 = 0; //@line 7520
     }
    } else {
     $$4 = 0; //@line 7523
    }
   } else {
    $$4 = 0; //@line 7526
   }
  } else {
   $$4 = 0; //@line 7529
  }
 } while (0);
 return $$4 | 0; //@line 7532
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7091
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 7096
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 7101
  } else {
   $20 = $0 & 255; //@line 7103
   $21 = $0 & 255; //@line 7104
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 7110
   } else {
    $26 = $1 + 20 | 0; //@line 7112
    $27 = HEAP32[$26 >> 2] | 0; //@line 7113
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 7119
     HEAP8[$27 >> 0] = $20; //@line 7120
     $34 = $21; //@line 7121
    } else {
     label = 12; //@line 7123
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7128
     $32 = ___overflow($1, $0) | 0; //@line 7129
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 98; //@line 7132
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 7134
      sp = STACKTOP; //@line 7135
      return 0; //@line 7136
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 7138
      $34 = $32; //@line 7139
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 7144
   $$0 = $34; //@line 7145
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 7150
   $8 = $0 & 255; //@line 7151
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 7157
    $14 = HEAP32[$13 >> 2] | 0; //@line 7158
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 7164
     HEAP8[$14 >> 0] = $7; //@line 7165
     $$0 = $8; //@line 7166
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7170
   $19 = ___overflow($1, $0) | 0; //@line 7171
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 97; //@line 7174
    sp = STACKTOP; //@line 7175
    return 0; //@line 7176
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7178
    $$0 = $19; //@line 7179
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 7184
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7811
 $1 = $0 + 20 | 0; //@line 7812
 $3 = $0 + 28 | 0; //@line 7814
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 7820
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 7821
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 7822
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 104; //@line 7825
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 7827
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 7829
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 7831
    sp = STACKTOP; //@line 7832
    return 0; //@line 7833
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7835
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 7839
     break;
    } else {
     label = 5; //@line 7842
     break;
    }
   }
  } else {
   label = 5; //@line 7847
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 7851
  $14 = HEAP32[$13 >> 2] | 0; //@line 7852
  $15 = $0 + 8 | 0; //@line 7853
  $16 = HEAP32[$15 >> 2] | 0; //@line 7854
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 7862
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 7863
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 7864
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 105; //@line 7867
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 7869
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 7871
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 7873
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 7875
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 7877
     sp = STACKTOP; //@line 7878
     return 0; //@line 7879
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7881
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 7887
  HEAP32[$3 >> 2] = 0; //@line 7888
  HEAP32[$1 >> 2] = 0; //@line 7889
  HEAP32[$15 >> 2] = 0; //@line 7890
  HEAP32[$13 >> 2] = 0; //@line 7891
  $$0 = 0; //@line 7892
 }
 return $$0 | 0; //@line 7894
}
function __ZN16SX1276_LoRaRadio8rx_frameEPhjjhh($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $12 = 0, $15 = 0, $6 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer4 = 0, $vararg_buffer8 = 0, sp = 0;
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
 _mbed_tracef(16, 1019, 1024, $vararg_buffer); //@line 92
 $9 = HEAP32[$0 + 752 >> 2] | 0; //@line 94
 if (($9 | 0) != ($6 | 0)) {
  HEAP32[$vararg_buffer4 >> 2] = $9; //@line 97
  HEAP32[$vararg_buffer4 + 4 >> 2] = $6; //@line 99
  _mbed_tracef(16, 1019, 1065, $vararg_buffer4); //@line 100
  STACKTOP = sp; //@line 101
  return;
 }
 $12 = HEAP32[$0 + 756 >> 2] | 0; //@line 104
 if (($12 | 0) != ($7 | 0)) {
  HEAP32[$vararg_buffer8 >> 2] = $12; //@line 107
  HEAP32[$vararg_buffer8 + 4 >> 2] = $7; //@line 109
  _mbed_tracef(16, 1019, 1112, $vararg_buffer8); //@line 110
  STACKTOP = sp; //@line 111
  return;
 }
 $15 = HEAP32[$0 + 692 >> 2] | 0; //@line 114
 if (($15 | 0) == ($3 | 0)) {
  _memcpy($0 + 792 | 0, $1 | 0, $2 | 0) | 0; //@line 118
  HEAP8[$0 + 782 >> 0] = $2; //@line 121
  HEAP8[$0 + 781 >> 0] = -35; //@line 123
  HEAP8[$0 + 780 >> 0] = -5; //@line 125
  HEAP8[$0 + 783 >> 0] = 1; //@line 127
  HEAP32[$0 + 784 >> 2] = _emscripten_asm_const_i(0) | 0; //@line 130
  STACKTOP = sp; //@line 131
  return;
 } else {
  HEAP32[$vararg_buffer12 >> 2] = $15; //@line 133
  HEAP32[$vararg_buffer12 + 4 >> 2] = $3; //@line 135
  _mbed_tracef(16, 1019, 1159, $vararg_buffer12); //@line 136
  STACKTOP = sp; //@line 137
  return;
 }
}
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 7575
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 7581
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 7587
   } else {
    $7 = $1 & 255; //@line 7589
    $$03039 = $0; //@line 7590
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 7592
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 7597
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 7600
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 7605
      break;
     } else {
      $$03039 = $13; //@line 7608
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 7612
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 7613
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 7621
     $25 = $18; //@line 7621
     while (1) {
      $24 = $25 ^ $17; //@line 7623
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 7630
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 7633
      $25 = HEAP32[$31 >> 2] | 0; //@line 7634
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 7643
       break;
      } else {
       $$02936 = $31; //@line 7641
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 7648
    }
   } while (0);
   $38 = $1 & 255; //@line 7651
   $$1 = $$029$lcssa; //@line 7652
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 7654
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 7660
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 7663
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 7668
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 7317
 $4 = HEAP32[$3 >> 2] | 0; //@line 7318
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 7325
   label = 5; //@line 7326
  } else {
   $$1 = 0; //@line 7328
  }
 } else {
  $12 = $4; //@line 7332
  label = 5; //@line 7333
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 7337
   $10 = HEAP32[$9 >> 2] | 0; //@line 7338
   $14 = $10; //@line 7341
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 7346
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 7354
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 7358
       $$141 = $0; //@line 7358
       $$143 = $1; //@line 7358
       $31 = $14; //@line 7358
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 7361
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 7368
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 7373
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 7376
      break L5;
     }
     $$139 = $$038; //@line 7382
     $$141 = $0 + $$038 | 0; //@line 7382
     $$143 = $1 - $$038 | 0; //@line 7382
     $31 = HEAP32[$9 >> 2] | 0; //@line 7382
    } else {
     $$139 = 0; //@line 7384
     $$141 = $0; //@line 7384
     $$143 = $1; //@line 7384
     $31 = $14; //@line 7384
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 7387
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 7390
   $$1 = $$139 + $$143 | 0; //@line 7392
  }
 } while (0);
 return $$1 | 0; //@line 7395
}
function _equeue_dealloc__async_cb($0) {
 $0 = $0 | 0;
 var $$02329$i = 0, $$02330$i = 0, $$025$i = 0, $$sink$in$i = 0, $$sink21$i = 0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $16 = 0, $2 = 0, $23 = 0, $4 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1335
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1337
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1339
 $7 = $2 + 156 | 0; //@line 1340
 _equeue_mutex_lock($7); //@line 1341
 $8 = $2 + 24 | 0; //@line 1342
 $9 = HEAP32[$8 >> 2] | 0; //@line 1343
 L3 : do {
  if (!$9) {
   $$02329$i = $8; //@line 1347
  } else {
   $11 = HEAP32[$6 >> 2] | 0; //@line 1349
   $$025$i = $8; //@line 1350
   $13 = $9; //@line 1350
   while (1) {
    $12 = HEAP32[$13 >> 2] | 0; //@line 1352
    if ($12 >>> 0 >= $11 >>> 0) {
     break;
    }
    $15 = $13 + 8 | 0; //@line 1357
    $16 = HEAP32[$15 >> 2] | 0; //@line 1358
    if (!$16) {
     $$02329$i = $15; //@line 1361
     break L3;
    } else {
     $$025$i = $15; //@line 1364
     $13 = $16; //@line 1364
    }
   }
   if (($12 | 0) == ($11 | 0)) {
    HEAP32[$4 + -24 >> 2] = $13; //@line 1370
    $$02330$i = $$025$i; //@line 1373
    $$sink$in$i = (HEAP32[$$025$i >> 2] | 0) + 8 | 0; //@line 1373
    $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 1374
    $23 = $4 + -28 | 0; //@line 1375
    HEAP32[$23 >> 2] = $$sink21$i; //@line 1376
    HEAP32[$$02330$i >> 2] = $6; //@line 1377
    _equeue_mutex_unlock($7); //@line 1378
    return;
   } else {
    $$02329$i = $$025$i; //@line 1381
   }
  }
 } while (0);
 HEAP32[$4 + -24 >> 2] = 0; //@line 1386
 $$02330$i = $$02329$i; //@line 1387
 $$sink$in$i = $$02329$i; //@line 1387
 $$sink21$i = HEAP32[$$sink$in$i >> 2] | 0; //@line 1388
 $23 = $4 + -28 | 0; //@line 1389
 HEAP32[$23 >> 2] = $$sink21$i; //@line 1390
 HEAP32[$$02330$i >> 2] = $6; //@line 1391
 _equeue_mutex_unlock($7); //@line 1392
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_52($0) {
 $0 = $0 | 0;
 var $$phi$trans$insert = 0, $$pre10 = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 2951
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2955
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2957
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2959
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2961
 $$phi$trans$insert = (HEAP32[$0 + 4 >> 2] | 0) + 12 | 0; //@line 2962
 $$pre10 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 2963
 if (!$$pre10) {
  HEAP32[$4 >> 2] = 0; //@line 2966
  _gpio_irq_set($10 + 28 | 0, 2, 0); //@line 2968
  return;
 }
 $13 = HEAP32[$$pre10 + 4 >> 2] | 0; //@line 2972
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 2973
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 2974
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 21; //@line 2977
  $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 2978
  HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 2979
  $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 2980
  HEAP32[$15 >> 2] = $4; //@line 2981
  $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 2982
  HEAP32[$16 >> 2] = $8; //@line 2983
  $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 2984
  HEAP32[$17 >> 2] = $10; //@line 2985
  sp = STACKTOP; //@line 2986
  return;
 }
 ___async_unwind = 0; //@line 2989
 HEAP32[$ReallocAsyncCtx4 >> 2] = 21; //@line 2990
 $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 2991
 HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 2992
 $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 2993
 HEAP32[$15 >> 2] = $4; //@line 2994
 $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 2995
 HEAP32[$16 >> 2] = $8; //@line 2996
 $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 2997
 HEAP32[$17 >> 2] = $10; //@line 2998
 sp = STACKTOP; //@line 2999
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_45($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2376
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2380
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2382
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2384
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2386
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2388
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2390
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2392
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 2395
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 2396
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 2412
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 2413
    if (!___async) {
     ___async_unwind = 0; //@line 2416
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 131; //@line 2418
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 2420
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 2422
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 2424
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 2426
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 2428
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 2430
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 2432
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 2434
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 2437
    sp = STACKTOP; //@line 2438
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
 sp = STACKTOP; //@line 7203
 STACKTOP = STACKTOP + 16 | 0; //@line 7204
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7204
 $2 = sp; //@line 7205
 $3 = $1 & 255; //@line 7206
 HEAP8[$2 >> 0] = $3; //@line 7207
 $4 = $0 + 16 | 0; //@line 7208
 $5 = HEAP32[$4 >> 2] | 0; //@line 7209
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 7216
   label = 4; //@line 7217
  } else {
   $$0 = -1; //@line 7219
  }
 } else {
  $12 = $5; //@line 7222
  label = 4; //@line 7223
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 7227
   $10 = HEAP32[$9 >> 2] | 0; //@line 7228
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 7231
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 7238
     HEAP8[$10 >> 0] = $3; //@line 7239
     $$0 = $13; //@line 7240
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 7245
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7246
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 7247
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 99; //@line 7250
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 7252
    sp = STACKTOP; //@line 7253
    STACKTOP = sp; //@line 7254
    return 0; //@line 7254
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 7256
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 7261
   } else {
    $$0 = -1; //@line 7263
   }
  }
 } while (0);
 STACKTOP = sp; //@line 7267
 return $$0 | 0; //@line 7267
}
function _fflush__async_cb_4($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13667
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13669
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 13671
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 13675
  } else {
   $$02327 = $$02325; //@line 13677
   $$02426 = $AsyncRetVal; //@line 13677
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 13684
    } else {
     $16 = 0; //@line 13686
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 13698
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 13701
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 13704
     break L3;
    } else {
     $$02327 = $$023; //@line 13707
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 13710
   $13 = ___fflush_unlocked($$02327) | 0; //@line 13711
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 13715
    ___async_unwind = 0; //@line 13716
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 103; //@line 13718
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 13720
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 13722
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 13724
   sp = STACKTOP; //@line 13725
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 13729
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 13731
 return;
}
function _main__async_cb_28($0) {
 $0 = $0 | 0;
 var $2 = 0, $5 = 0, $6 = 0, $7 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 1719
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1721
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1723
 if (!$AsyncRetVal) {
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 1726
  $6 = _equeue_alloc(4920, 32) | 0; //@line 1727
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 80; //@line 1730
   $7 = $ReallocAsyncCtx7 + 4 | 0; //@line 1731
   HEAP32[$7 >> 2] = $2; //@line 1732
   sp = STACKTOP; //@line 1733
   return;
  }
  HEAP32[___async_retval >> 2] = $6; //@line 1737
  ___async_unwind = 0; //@line 1738
  HEAP32[$ReallocAsyncCtx7 >> 2] = 80; //@line 1739
  $7 = $ReallocAsyncCtx7 + 4 | 0; //@line 1740
  HEAP32[$7 >> 2] = $2; //@line 1741
  sp = STACKTOP; //@line 1742
  return;
 } else {
  HEAP32[$AsyncRetVal >> 2] = 2; //@line 1745
  _equeue_event_delay($AsyncRetVal, 1e3); //@line 1746
  _equeue_event_period($AsyncRetVal, 1e3); //@line 1747
  _equeue_event_dtor($AsyncRetVal, 77); //@line 1748
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 1749
  _equeue_post(4920, 78, $AsyncRetVal) | 0; //@line 1750
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 79; //@line 1753
   $5 = $ReallocAsyncCtx4 + 4 | 0; //@line 1754
   HEAP32[$5 >> 2] = $2; //@line 1755
   sp = STACKTOP; //@line 1756
   return;
  }
  ___async_unwind = 0; //@line 1759
  HEAP32[$ReallocAsyncCtx4 >> 2] = 79; //@line 1760
  $5 = $ReallocAsyncCtx4 + 4 | 0; //@line 1761
  HEAP32[$5 >> 2] = $2; //@line 1762
  sp = STACKTOP; //@line 1763
  return;
 }
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 7084
 value = value & 255; //@line 7086
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 7089
   ptr = ptr + 1 | 0; //@line 7090
  }
  aligned_end = end & -4 | 0; //@line 7093
  block_aligned_end = aligned_end - 64 | 0; //@line 7094
  value4 = value | value << 8 | value << 16 | value << 24; //@line 7095
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 7098
   HEAP32[ptr + 4 >> 2] = value4; //@line 7099
   HEAP32[ptr + 8 >> 2] = value4; //@line 7100
   HEAP32[ptr + 12 >> 2] = value4; //@line 7101
   HEAP32[ptr + 16 >> 2] = value4; //@line 7102
   HEAP32[ptr + 20 >> 2] = value4; //@line 7103
   HEAP32[ptr + 24 >> 2] = value4; //@line 7104
   HEAP32[ptr + 28 >> 2] = value4; //@line 7105
   HEAP32[ptr + 32 >> 2] = value4; //@line 7106
   HEAP32[ptr + 36 >> 2] = value4; //@line 7107
   HEAP32[ptr + 40 >> 2] = value4; //@line 7108
   HEAP32[ptr + 44 >> 2] = value4; //@line 7109
   HEAP32[ptr + 48 >> 2] = value4; //@line 7110
   HEAP32[ptr + 52 >> 2] = value4; //@line 7111
   HEAP32[ptr + 56 >> 2] = value4; //@line 7112
   HEAP32[ptr + 60 >> 2] = value4; //@line 7113
   ptr = ptr + 64 | 0; //@line 7114
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 7118
   ptr = ptr + 4 | 0; //@line 7119
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 7124
  ptr = ptr + 1 | 0; //@line 7125
 }
 return end - num | 0; //@line 7127
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2313
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2317
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2319
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2321
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2323
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2325
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2327
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 2330
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 2331
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 2340
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 2341
    if (!___async) {
     ___async_unwind = 0; //@line 2344
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 132; //@line 2346
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 2348
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 2350
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 2352
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 2354
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 2356
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 2358
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 2360
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 2363
    sp = STACKTOP; //@line 2364
    return;
   }
  }
 }
 return;
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13568
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 13578
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 13578
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 13578
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 13582
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 13585
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 13588
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 13596
  } else {
   $20 = 0; //@line 13598
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 13608
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 13612
  HEAP32[___async_retval >> 2] = $$1; //@line 13614
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 13617
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 13618
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 13622
  ___async_unwind = 0; //@line 13623
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 103; //@line 13625
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 13627
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 13629
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 13631
 sp = STACKTOP; //@line 13632
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13851
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13853
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13855
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13857
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 13862
  } else {
   $9 = $4 + 4 | 0; //@line 13864
   $10 = HEAP32[$9 >> 2] | 0; //@line 13865
   $11 = $4 + 8 | 0; //@line 13866
   $12 = HEAP32[$11 >> 2] | 0; //@line 13867
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 13871
    HEAP32[$6 >> 2] = 0; //@line 13872
    HEAP32[$2 >> 2] = 0; //@line 13873
    HEAP32[$11 >> 2] = 0; //@line 13874
    HEAP32[$9 >> 2] = 0; //@line 13875
    $$0 = 0; //@line 13876
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 13883
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 13884
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 13885
   if (!___async) {
    ___async_unwind = 0; //@line 13888
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 105; //@line 13890
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 13892
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 13894
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 13896
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 13898
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 13900
   sp = STACKTOP; //@line 13901
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 13906
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2885
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2887
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2889
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2891
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2893
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2895
 $$pre = HEAP32[$2 >> 2] | 0; //@line 2896
 if (!$$pre) {
  HEAP32[$4 >> 2] = 0; //@line 2899
  _gpio_irq_set($10 + 28 | 0, 2, 1); //@line 2901
  return;
 }
 $13 = HEAP32[$$pre + 4 >> 2] | 0; //@line 2905
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 2906
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 2907
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 19; //@line 2910
  $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 2911
  HEAP32[$14 >> 2] = $2; //@line 2912
  $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 2913
  HEAP32[$15 >> 2] = $4; //@line 2914
  $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 2915
  HEAP32[$16 >> 2] = $10; //@line 2916
  sp = STACKTOP; //@line 2917
  return;
 }
 ___async_unwind = 0; //@line 2920
 HEAP32[$ReallocAsyncCtx2 >> 2] = 19; //@line 2921
 $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 2922
 HEAP32[$14 >> 2] = $2; //@line 2923
 $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 2924
 HEAP32[$15 >> 2] = $4; //@line 2925
 $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 2926
 HEAP32[$16 >> 2] = $10; //@line 2927
 sp = STACKTOP; //@line 2928
 return;
}
function _equeue_create($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$033$i = 0, $$034$i = 0, $2 = 0, $21 = 0, $23 = 0, $27 = 0, $30 = 0, $5 = 0, $6 = 0;
 $2 = _malloc($1) | 0; //@line 531
 if (!$2) {
  $$0 = -1; //@line 534
  return $$0 | 0; //@line 535
 }
 HEAP32[$0 + 12 >> 2] = $2; //@line 538
 $5 = $0 + 20 | 0; //@line 539
 HEAP32[$5 >> 2] = 0; //@line 540
 $6 = $0 + 16 | 0; //@line 541
 HEAP32[$6 >> 2] = 0; //@line 542
 if ($1 | 0) {
  $$034$i = $1; //@line 545
  $23 = 0; //@line 545
  do {
   $23 = $23 + 1 | 0; //@line 547
   $$034$i = $$034$i >>> 1; //@line 548
  } while (($$034$i | 0) != 0);
  HEAP32[$6 >> 2] = $23; //@line 556
 }
 HEAP32[$0 + 24 >> 2] = 0; //@line 559
 HEAP32[$0 + 28 >> 2] = $1; //@line 561
 HEAP32[$0 + 32 >> 2] = $2; //@line 563
 HEAP32[$0 >> 2] = 0; //@line 564
 HEAP32[$0 + 4 >> 2] = _equeue_tick() | 0; //@line 567
 HEAP8[$0 + 9 >> 0] = 0; //@line 569
 HEAP8[$0 + 8 >> 0] = 0; //@line 571
 HEAP8[$0 + 36 >> 0] = 0; //@line 573
 HEAP32[$0 + 40 >> 2] = 0; //@line 575
 HEAP32[$0 + 44 >> 2] = 0; //@line 577
 HEAP8[$0 + 184 >> 0] = 0; //@line 579
 $21 = _equeue_sema_create($0 + 48 | 0) | 0; //@line 581
 if (($21 | 0) < 0) {
  $$033$i = $21; //@line 584
 } else {
  $27 = _equeue_mutex_create($0 + 128 | 0) | 0; //@line 587
  if (($27 | 0) < 0) {
   $$033$i = $27; //@line 590
  } else {
   $30 = _equeue_mutex_create($0 + 156 | 0) | 0; //@line 593
   $$033$i = ($30 | 0) < 0 ? $30 : 0; //@line 596
  }
 }
 HEAP32[$5 >> 2] = $2; //@line 599
 $$0 = $$033$i; //@line 600
 return $$0 | 0; //@line 601
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 10583
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 10588
    $$0 = 1; //@line 10589
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 10602
     $$0 = 1; //@line 10603
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 10607
     $$0 = -1; //@line 10608
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 10618
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 10622
    $$0 = 2; //@line 10623
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 10635
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 10641
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 10645
    $$0 = 3; //@line 10646
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 10656
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 10662
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 10668
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 10672
    $$0 = 4; //@line 10673
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 10677
    $$0 = -1; //@line 10678
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 10683
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_64($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 3938
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3940
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3942
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3944
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3946
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 3951
  return;
 }
 dest = $2 + 4 | 0; //@line 3955
 stop = dest + 52 | 0; //@line 3955
 do {
  HEAP32[dest >> 2] = 0; //@line 3955
  dest = dest + 4 | 0; //@line 3955
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 3956
 HEAP32[$2 + 8 >> 2] = $4; //@line 3958
 HEAP32[$2 + 12 >> 2] = -1; //@line 3960
 HEAP32[$2 + 48 >> 2] = 1; //@line 3962
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 3965
 $16 = HEAP32[$6 >> 2] | 0; //@line 3966
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 3967
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 3968
 if (!___async) {
  ___async_unwind = 0; //@line 3971
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 117; //@line 3973
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 3975
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 3977
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 3979
 sp = STACKTOP; //@line 3980
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_46($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2449
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2453
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2455
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2457
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2459
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2461
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 2464
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 2465
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 2471
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 2472
   if (!___async) {
    ___async_unwind = 0; //@line 2475
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 130; //@line 2477
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 2479
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 2481
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 2483
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 2485
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 2487
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 2489
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 2492
   sp = STACKTOP; //@line 2493
   return;
  }
 }
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $11 = 0, $12 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1442
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1447
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1449
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  $8 = (HEAP32[$4 >> 2] | 0) + -1 | 0; //@line 1452
  HEAP32[$4 >> 2] = $8; //@line 1453
  if (!$8) {
   $11 = HEAP32[$4 + 24 >> 2] | 0; //@line 1457
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 1458
   FUNCTION_TABLE_vi[$11 & 255]($6); //@line 1459
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 84; //@line 1462
    $12 = $ReallocAsyncCtx2 + 4 | 0; //@line 1463
    HEAP32[$12 >> 2] = $4; //@line 1464
    sp = STACKTOP; //@line 1465
    return;
   }
   ___async_unwind = 0; //@line 1468
   HEAP32[$ReallocAsyncCtx2 >> 2] = 84; //@line 1469
   $12 = $ReallocAsyncCtx2 + 4 | 0; //@line 1470
   HEAP32[$12 >> 2] = $4; //@line 1471
   sp = STACKTOP; //@line 1472
   return;
  }
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 1476
 __ZN6events10EventQueue8dispatchEi(4920, -1); //@line 1477
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 1480
  sp = STACKTOP; //@line 1481
  return;
 }
 ___async_unwind = 0; //@line 1484
 HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 1485
 sp = STACKTOP; //@line 1486
 return;
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 9467
  $8 = $0; //@line 9467
  $9 = $1; //@line 9467
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 9469
   $$0914 = $$0914 + -1 | 0; //@line 9473
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 9474
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 9475
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 9483
   }
  }
  $$010$lcssa$off0 = $8; //@line 9488
  $$09$lcssa = $$0914; //@line 9488
 } else {
  $$010$lcssa$off0 = $0; //@line 9490
  $$09$lcssa = $2; //@line 9490
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 9494
 } else {
  $$012 = $$010$lcssa$off0; //@line 9496
  $$111 = $$09$lcssa; //@line 9496
  while (1) {
   $26 = $$111 + -1 | 0; //@line 9501
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 9502
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 9506
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 9509
    $$111 = $26; //@line 9509
   }
  }
 }
 return $$1$lcssa | 0; //@line 9513
}
function _equeue_create_inplace($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$033 = 0, $$034 = 0, $20 = 0, $22 = 0, $26 = 0, $29 = 0, $5 = 0;
 HEAP32[$0 + 12 >> 2] = $2; //@line 611
 HEAP32[$0 + 20 >> 2] = 0; //@line 613
 $5 = $0 + 16 | 0; //@line 614
 HEAP32[$5 >> 2] = 0; //@line 615
 if ($1 | 0) {
  $$034 = $1; //@line 618
  $22 = 0; //@line 618
  do {
   $22 = $22 + 1 | 0; //@line 620
   $$034 = $$034 >>> 1; //@line 621
  } while (($$034 | 0) != 0);
  HEAP32[$5 >> 2] = $22; //@line 629
 }
 HEAP32[$0 + 24 >> 2] = 0; //@line 632
 HEAP32[$0 + 28 >> 2] = $1; //@line 634
 HEAP32[$0 + 32 >> 2] = $2; //@line 636
 HEAP32[$0 >> 2] = 0; //@line 637
 HEAP32[$0 + 4 >> 2] = _equeue_tick() | 0; //@line 640
 HEAP8[$0 + 9 >> 0] = 0; //@line 642
 HEAP8[$0 + 8 >> 0] = 0; //@line 644
 HEAP8[$0 + 36 >> 0] = 0; //@line 646
 HEAP32[$0 + 40 >> 2] = 0; //@line 648
 HEAP32[$0 + 44 >> 2] = 0; //@line 650
 HEAP8[$0 + 184 >> 0] = 0; //@line 652
 $20 = _equeue_sema_create($0 + 48 | 0) | 0; //@line 654
 if (($20 | 0) < 0) {
  $$033 = $20; //@line 657
  return $$033 | 0; //@line 658
 }
 $26 = _equeue_mutex_create($0 + 128 | 0) | 0; //@line 661
 if (($26 | 0) < 0) {
  $$033 = $26; //@line 664
  return $$033 | 0; //@line 665
 }
 $29 = _equeue_mutex_create($0 + 156 | 0) | 0; //@line 668
 $$033 = ($29 | 0) < 0 ? $29 : 0; //@line 671
 return $$033 | 0; //@line 672
}
function __ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3376
 $1 = $0 + 4 | 0; //@line 3377
 $2 = HEAP32[$1 >> 2] | 0; //@line 3378
 $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 3379
 $3 = _equeue_alloc($2, 4) | 0; //@line 3380
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 88; //@line 3383
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 3385
  HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 3387
  sp = STACKTOP; //@line 3388
  return 0; //@line 3389
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3391
 if (!$3) {
  $$0 = 0; //@line 3394
  return $$0 | 0; //@line 3395
 }
 HEAP32[$3 >> 2] = HEAP32[$0 + 28 >> 2]; //@line 3399
 _equeue_event_delay($3, HEAP32[$0 + 12 >> 2] | 0); //@line 3402
 _equeue_event_period($3, HEAP32[$0 + 16 >> 2] | 0); //@line 3405
 _equeue_event_dtor($3, 89); //@line 3406
 $13 = HEAP32[$1 >> 2] | 0; //@line 3407
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3408
 $14 = _equeue_post($13, 90, $3) | 0; //@line 3409
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 91; //@line 3412
  sp = STACKTOP; //@line 3413
  return 0; //@line 3414
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3416
 $$0 = $14; //@line 3417
 return $$0 | 0; //@line 3418
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3760
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3762
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3766
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3768
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3770
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3772
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 3776
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 3779
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 3780
   if (!___async) {
    ___async_unwind = 0; //@line 3783
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 134; //@line 3785
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 3787
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 3789
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 3791
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 3793
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 3795
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 3797
   sp = STACKTOP; //@line 3798
   return;
  }
 }
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 6969
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 6974
   label = 4; //@line 6975
  } else {
   $$01519 = $0; //@line 6977
   $23 = $1; //@line 6977
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 6982
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 6985
    $23 = $6; //@line 6986
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 6990
     label = 4; //@line 6991
     break;
    } else {
     $$01519 = $6; //@line 6994
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 7000
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 7002
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 7010
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 7018
  } else {
   $$pn = $$0; //@line 7020
   while (1) {
    $19 = $$pn + 1 | 0; //@line 7022
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 7026
     break;
    } else {
     $$pn = $19; //@line 7029
    }
   }
  }
  $$sink = $$1$lcssa; //@line 7034
 }
 return $$sink - $1 | 0; //@line 7037
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 12138
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 12145
   $10 = $1 + 16 | 0; //@line 12146
   $11 = HEAP32[$10 >> 2] | 0; //@line 12147
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 12150
    HEAP32[$1 + 24 >> 2] = $4; //@line 12152
    HEAP32[$1 + 36 >> 2] = 1; //@line 12154
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 12164
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 12169
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 12172
    HEAP8[$1 + 54 >> 0] = 1; //@line 12174
    break;
   }
   $21 = $1 + 24 | 0; //@line 12177
   $22 = HEAP32[$21 >> 2] | 0; //@line 12178
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 12181
    $28 = $4; //@line 12182
   } else {
    $28 = $22; //@line 12184
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 12193
   }
  }
 } while (0);
 return;
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $12 = 0, $2 = 0, $4 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 263
 $2 = $0; //@line 264
 L1 : do {
  switch ($1 | 0) {
  case 1:
   {
    $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 269
    if ($4 | 0) {
     $7 = HEAP32[$4 >> 2] | 0; //@line 273
     $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 274
     FUNCTION_TABLE_vi[$7 & 255]($2 + 40 | 0); //@line 275
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 16; //@line 278
      sp = STACKTOP; //@line 279
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 282
      break L1;
     }
    }
    break;
   }
  case 2:
   {
    $9 = HEAP32[$2 + 68 >> 2] | 0; //@line 290
    if ($9 | 0) {
     $12 = HEAP32[$9 >> 2] | 0; //@line 294
     $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 295
     FUNCTION_TABLE_vi[$12 & 255]($2 + 56 | 0); //@line 296
     if (___async) {
      HEAP32[$AsyncCtx2 >> 2] = 17; //@line 299
      sp = STACKTOP; //@line 300
      return;
     } else {
      _emscripten_free_async_context($AsyncCtx2 | 0); //@line 303
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
 sp = STACKTOP; //@line 11632
 $1 = HEAP32[93] | 0; //@line 11633
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 11639
 } else {
  $19 = 0; //@line 11641
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 11647
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 11653
    $12 = HEAP32[$11 >> 2] | 0; //@line 11654
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 11660
     HEAP8[$12 >> 0] = 10; //@line 11661
     $22 = 0; //@line 11662
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 11666
   $17 = ___overflow($1, 10) | 0; //@line 11667
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 111; //@line 11670
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 11672
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 11674
    sp = STACKTOP; //@line 11675
    return 0; //@line 11676
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 11678
    $22 = $17 >> 31; //@line 11680
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 11687
 }
 return $22 | 0; //@line 11689
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_53($0) {
 $0 = $0 | 0;
 var $$pre$i$i4 = 0, $12 = 0, $13 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 3005
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3011
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3013
 $$pre$i$i4 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 3014
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = $$pre$i$i4; //@line 3015
 if (!$$pre$i$i4) {
  _gpio_irq_set($8 + 28 | 0, 2, 0); //@line 3019
  return;
 }
 $12 = HEAP32[$$pre$i$i4 + 8 >> 2] | 0; //@line 3024
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(12) | 0; //@line 3025
 FUNCTION_TABLE_vi[$12 & 255]($6); //@line 3026
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 22; //@line 3029
  $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 3030
  HEAP32[$13 >> 2] = $6; //@line 3031
  $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 3032
  HEAP32[$14 >> 2] = $8; //@line 3033
  sp = STACKTOP; //@line 3034
  return;
 }
 ___async_unwind = 0; //@line 3037
 HEAP32[$ReallocAsyncCtx5 >> 2] = 22; //@line 3038
 $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 3039
 HEAP32[$13 >> 2] = $6; //@line 3040
 $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 3041
 HEAP32[$14 >> 2] = $8; //@line 3042
 sp = STACKTOP; //@line 3043
 return;
}
function __ZN4mbed11InterruptInD0Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 194
 HEAP32[$0 >> 2] = 160; //@line 195
 _gpio_irq_free($0 + 28 | 0); //@line 197
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 199
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 205
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 206
   FUNCTION_TABLE_vi[$7 & 255]($0 + 56 | 0); //@line 207
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 14; //@line 210
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 212
    sp = STACKTOP; //@line 213
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 216
    break;
   }
  }
 } while (0);
 $10 = HEAP32[$0 + 52 >> 2] | 0; //@line 222
 if (!$10) {
  __ZdlPv($0); //@line 225
  return;
 }
 $14 = HEAP32[$10 + 8 >> 2] | 0; //@line 230
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 231
 FUNCTION_TABLE_vi[$14 & 255]($0 + 40 | 0); //@line 232
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 15; //@line 235
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 237
  sp = STACKTOP; //@line 238
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 241
 __ZdlPv($0); //@line 242
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_62($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3808
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3814
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3816
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3818
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3820
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 3825
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 3827
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 3828
 if (!___async) {
  ___async_unwind = 0; //@line 3831
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 134; //@line 3833
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 3835
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 3837
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 3839
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 3841
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 3843
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 3845
 sp = STACKTOP; //@line 3846
 return;
}
function _mbed_vtracef__async_cb_12($0) {
 $0 = $0 | 0;
 var $$18 = 0, $10 = 0, $12 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 753
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 755
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 757
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 759
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 764
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 766
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 771
 $16 = _snprintf($4, $6, 1301, $2) | 0; //@line 772
 $$18 = ($16 | 0) >= ($6 | 0) ? 0 : $16; //@line 774
 $19 = $4 + $$18 | 0; //@line 776
 $20 = $6 - $$18 | 0; //@line 777
 if (($$18 | 0) > 0) {
  if (!(($$18 | 0) < 1 | ($20 | 0) < 1 | $10 ^ 1)) {
   _snprintf($19, $20, 1379, $12) | 0; //@line 785
  }
 }
 $23 = HEAP32[53] | 0; //@line 788
 $24 = HEAP32[46] | 0; //@line 789
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 790
 FUNCTION_TABLE_vi[$23 & 255]($24); //@line 791
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 44; //@line 794
  sp = STACKTOP; //@line 795
  return;
 }
 ___async_unwind = 0; //@line 798
 HEAP32[$ReallocAsyncCtx7 >> 2] = 44; //@line 799
 sp = STACKTOP; //@line 800
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 11997
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 12006
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 12011
      HEAP32[$13 >> 2] = $2; //@line 12012
      $19 = $1 + 40 | 0; //@line 12013
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 12016
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 12026
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 12030
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 12037
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
 $$016 = 0; //@line 10703
 while (1) {
  if ((HEAPU8[2432 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 10710
   break;
  }
  $7 = $$016 + 1 | 0; //@line 10713
  if (($7 | 0) == 87) {
   $$01214 = 2520; //@line 10716
   $$115 = 87; //@line 10716
   label = 5; //@line 10717
   break;
  } else {
   $$016 = $7; //@line 10720
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 2520; //@line 10726
  } else {
   $$01214 = 2520; //@line 10728
   $$115 = $$016; //@line 10728
   label = 5; //@line 10729
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 10734
   $$113 = $$01214; //@line 10735
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 10739
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 10746
   if (!$$115) {
    $$012$lcssa = $$113; //@line 10749
    break;
   } else {
    $$01214 = $$113; //@line 10752
    label = 5; //@line 10753
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 10760
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3357
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3359
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3361
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3363
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 3365
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 3367
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 4460; //@line 3372
  HEAP32[$4 + 4 >> 2] = $6; //@line 3374
  _abort_message(4369, $4); //@line 3375
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 3378
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 3381
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 3382
 $16 = FUNCTION_TABLE_ii[$15 & 3]($12) | 0; //@line 3383
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 3387
  ___async_unwind = 0; //@line 3388
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 113; //@line 3390
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 3392
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 3394
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 3396
 sp = STACKTOP; //@line 3397
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1272
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1274
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1276
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1280
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 1284
  label = 4; //@line 1285
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 1290
   label = 4; //@line 1291
  } else {
   $$037$off039 = 3; //@line 1293
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 1297
  $17 = $8 + 40 | 0; //@line 1298
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 1301
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 1311
    $$037$off039 = $$037$off038; //@line 1312
   } else {
    $$037$off039 = $$037$off038; //@line 1314
   }
  } else {
   $$037$off039 = $$037$off038; //@line 1317
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 1320
 return;
}
function __ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb_63($0) {
 $0 = $0 | 0;
 var $13 = 0, $14 = 0, $2 = 0, $4 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3869
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3871
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3873
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3875
 if (!$AsyncRetVal) {
  HEAP32[___async_retval >> 2] = 0; //@line 3879
  return;
 }
 HEAP32[$AsyncRetVal >> 2] = HEAP32[$2 + 28 >> 2]; //@line 3884
 _equeue_event_delay($AsyncRetVal, HEAP32[$2 + 12 >> 2] | 0); //@line 3887
 _equeue_event_period($AsyncRetVal, HEAP32[$2 + 16 >> 2] | 0); //@line 3890
 _equeue_event_dtor($AsyncRetVal, 89); //@line 3891
 $13 = HEAP32[$4 >> 2] | 0; //@line 3892
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 3893
 $14 = _equeue_post($13, 90, $AsyncRetVal) | 0; //@line 3894
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 91; //@line 3897
  sp = STACKTOP; //@line 3898
  return;
 }
 HEAP32[___async_retval >> 2] = $14; //@line 3902
 ___async_unwind = 0; //@line 3903
 HEAP32[$ReallocAsyncCtx >> 2] = 91; //@line 3904
 sp = STACKTOP; //@line 3905
 return;
}
function _strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $2 = 0, $5 = 0;
 $2 = HEAP8[$1 >> 0] | 0; //@line 10776
 do {
  if (!($2 << 24 >> 24)) {
   $$0 = $0; //@line 10780
  } else {
   $5 = _strchr($0, $2 << 24 >> 24) | 0; //@line 10783
   if (!$5) {
    $$0 = 0; //@line 10786
   } else {
    if (!(HEAP8[$1 + 1 >> 0] | 0)) {
     $$0 = $5; //@line 10792
    } else {
     if (!(HEAP8[$5 + 1 >> 0] | 0)) {
      $$0 = 0; //@line 10798
     } else {
      if (!(HEAP8[$1 + 2 >> 0] | 0)) {
       $$0 = _twobyte_strstr($5, $1) | 0; //@line 10805
       break;
      }
      if (!(HEAP8[$5 + 2 >> 0] | 0)) {
       $$0 = 0; //@line 10812
      } else {
       if (!(HEAP8[$1 + 3 >> 0] | 0)) {
        $$0 = _threebyte_strstr($5, $1) | 0; //@line 10819
        break;
       }
       if (!(HEAP8[$5 + 3 >> 0] | 0)) {
        $$0 = 0; //@line 10826
       } else {
        if (!(HEAP8[$1 + 4 >> 0] | 0)) {
         $$0 = _fourbyte_strstr($5, $1) | 0; //@line 10833
         break;
        } else {
         $$0 = _twoway_strstr($5, $1) | 0; //@line 10837
         break;
        }
       }
      }
     }
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 10847
}
function __ZN4mbed11InterruptInD2Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 143
 HEAP32[$0 >> 2] = 160; //@line 144
 _gpio_irq_free($0 + 28 | 0); //@line 146
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 148
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 154
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 155
   FUNCTION_TABLE_vi[$7 & 255]($0 + 56 | 0); //@line 156
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 12; //@line 159
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 161
    sp = STACKTOP; //@line 162
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 165
    break;
   }
  }
 } while (0);
 $10 = HEAP32[$0 + 52 >> 2] | 0; //@line 171
 if (!$10) {
  return;
 }
 $14 = HEAP32[$10 + 8 >> 2] | 0; //@line 178
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 179
 FUNCTION_TABLE_vi[$14 & 255]($0 + 40 | 0); //@line 180
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 13; //@line 183
  sp = STACKTOP; //@line 184
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 187
 return;
}
function _fourbyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$lcssa = 0, $$sink21$lcssa = 0, $$sink2123 = 0, $18 = 0, $32 = 0, $33 = 0, $35 = 0, $39 = 0, $40 = 0, $41 = 0;
 $18 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8 | (HEAPU8[$1 + 3 >> 0] | 0); //@line 10972
 $32 = $0 + 3 | 0; //@line 10986
 $33 = HEAP8[$32 >> 0] | 0; //@line 10987
 $35 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | (HEAPU8[$0 + 2 >> 0] | 0) << 8 | $33 & 255; //@line 10989
 if ($33 << 24 >> 24 == 0 | ($35 | 0) == ($18 | 0)) {
  $$lcssa = $33; //@line 10994
  $$sink21$lcssa = $32; //@line 10994
 } else {
  $$sink2123 = $32; //@line 10996
  $39 = $35; //@line 10996
  while (1) {
   $40 = $$sink2123 + 1 | 0; //@line 10999
   $41 = HEAP8[$40 >> 0] | 0; //@line 11000
   $39 = $39 << 8 | $41 & 255; //@line 11002
   if ($41 << 24 >> 24 == 0 | ($39 | 0) == ($18 | 0)) {
    $$lcssa = $41; //@line 11007
    $$sink21$lcssa = $40; //@line 11007
    break;
   } else {
    $$sink2123 = $40; //@line 11010
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$sink21$lcssa + -3 | 0 : 0) | 0; //@line 11017
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $4 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3485
 $1 = HEAP32[$0 >> 2] | 0; //@line 3486
 if (!$1) {
  return;
 }
 $4 = (HEAP32[$1 >> 2] | 0) + -1 | 0; //@line 3492
 HEAP32[$1 >> 2] = $4; //@line 3493
 if ($4 | 0) {
  return;
 }
 $7 = HEAP32[$1 + 24 >> 2] | 0; //@line 3499
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3500
 FUNCTION_TABLE_vi[$7 & 255]($1); //@line 3501
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 94; //@line 3504
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3506
  sp = STACKTOP; //@line 3507
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3510
 $9 = HEAP32[$0 >> 2] | 0; //@line 3511
 $11 = HEAP32[$9 + 4 >> 2] | 0; //@line 3513
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3514
 _equeue_dealloc($11, $9); //@line 3515
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 95; //@line 3518
  sp = STACKTOP; //@line 3519
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 3522
 return;
}
function _mbed_vtracef__async_cb_18($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1138
 $3 = HEAP32[54] | 0; //@line 1142
 if (HEAP8[$0 + 4 >> 0] & 1 & ($3 | 0) != 0) {
  $5 = HEAP32[46] | 0; //@line 1146
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 1147
  FUNCTION_TABLE_vi[$3 & 255]($5); //@line 1148
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 37; //@line 1151
   sp = STACKTOP; //@line 1152
   return;
  }
  ___async_unwind = 0; //@line 1155
  HEAP32[$ReallocAsyncCtx2 >> 2] = 37; //@line 1156
  sp = STACKTOP; //@line 1157
  return;
 } else {
  $6 = HEAP32[53] | 0; //@line 1160
  $7 = HEAP32[46] | 0; //@line 1161
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 1162
  FUNCTION_TABLE_vi[$6 & 255]($7); //@line 1163
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 39; //@line 1166
   sp = STACKTOP; //@line 1167
   return;
  }
  ___async_unwind = 0; //@line 1170
  HEAP32[$ReallocAsyncCtx4 >> 2] = 39; //@line 1171
  sp = STACKTOP; //@line 1172
  return;
 }
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3051
 $2 = $0 + 12 | 0; //@line 3053
 $3 = HEAP32[$2 >> 2] | 0; //@line 3054
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 3058
   _mbed_assert_internal(1622, 1627, 528); //@line 3059
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 71; //@line 3062
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 3064
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 3066
    sp = STACKTOP; //@line 3067
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 3070
    $8 = HEAP32[$2 >> 2] | 0; //@line 3072
    break;
   }
  } else {
   $8 = $3; //@line 3076
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 3079
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3081
 FUNCTION_TABLE_vi[$7 & 255]($0); //@line 3082
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 72; //@line 3085
  sp = STACKTOP; //@line 3086
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3089
  return;
 }
}
function _abort_message($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11830
 STACKTOP = STACKTOP + 16 | 0; //@line 11831
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11831
 $1 = sp; //@line 11832
 HEAP32[$1 >> 2] = $varargs; //@line 11833
 $2 = HEAP32[61] | 0; //@line 11834
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 11835
 _vfprintf($2, $0, $1) | 0; //@line 11836
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 114; //@line 11839
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 11841
  sp = STACKTOP; //@line 11842
  STACKTOP = sp; //@line 11843
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 11845
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 11846
 _fputc(10, $2) | 0; //@line 11847
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 115; //@line 11850
  sp = STACKTOP; //@line 11851
  STACKTOP = sp; //@line 11852
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 11854
  _abort(); //@line 11855
 }
}
function _threebyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$016$lcssa = 0, $$01618 = 0, $$019 = 0, $$lcssa = 0, $14 = 0, $23 = 0, $24 = 0, $27 = 0, $30 = 0, $31 = 0;
 $14 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8; //@line 10906
 $23 = $0 + 2 | 0; //@line 10915
 $24 = HEAP8[$23 >> 0] | 0; //@line 10916
 $27 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | ($24 & 255) << 8; //@line 10919
 if (($27 | 0) == ($14 | 0) | $24 << 24 >> 24 == 0) {
  $$016$lcssa = $23; //@line 10924
  $$lcssa = $24; //@line 10924
 } else {
  $$01618 = $23; //@line 10926
  $$019 = $27; //@line 10926
  while (1) {
   $30 = $$01618 + 1 | 0; //@line 10928
   $31 = HEAP8[$30 >> 0] | 0; //@line 10929
   $$019 = ($$019 | $31 & 255) << 8; //@line 10932
   if (($$019 | 0) == ($14 | 0) | $31 << 24 >> 24 == 0) {
    $$016$lcssa = $30; //@line 10937
    $$lcssa = $31; //@line 10937
    break;
   } else {
    $$01618 = $30; //@line 10940
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$016$lcssa + -2 | 0 : 0) | 0; //@line 10947
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 10534
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 10534
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 10535
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 10536
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 10545
    $$016 = $9; //@line 10548
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 10548
   } else {
    $$016 = $0; //@line 10550
    $storemerge = 0; //@line 10550
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 10552
   $$0 = $$016; //@line 10553
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 10557
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 10563
   HEAP32[tempDoublePtr >> 2] = $2; //@line 10566
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 10566
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 10567
  }
 }
 return +$$0;
}
function _equeue_sema_wait($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $20 = 0, $3 = 0, $4 = 0, sp = 0;
 sp = STACKTOP; //@line 1698
 STACKTOP = STACKTOP + 16 | 0; //@line 1699
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1699
 $2 = sp + 8 | 0; //@line 1700
 $3 = sp; //@line 1701
 _pthread_mutex_lock($0 | 0) | 0; //@line 1702
 $4 = $0 + 76 | 0; //@line 1703
 do {
  if (!(HEAP8[$4 >> 0] | 0)) {
   if (($1 | 0) < 0) {
    _pthread_cond_wait($0 + 28 | 0, $0 | 0) | 0; //@line 1711
    break;
   } else {
    _gettimeofday($2 | 0, 0) | 0; //@line 1714
    HEAP32[$3 >> 2] = (HEAP32[$2 >> 2] | 0) + (($1 >>> 0) / 1e3 | 0); //@line 1718
    HEAP32[$3 + 4 >> 2] = ((HEAP32[$2 + 4 >> 2] | 0) * 1e3 | 0) + ($1 * 1e6 | 0); //@line 1725
    _pthread_cond_timedwait($0 + 28 | 0, $0 | 0, $3 | 0) | 0; //@line 1727
    break;
   }
  }
 } while (0);
 $20 = (HEAP8[$4 >> 0] | 0) != 0; //@line 1733
 HEAP8[$4 >> 0] = 0; //@line 1734
 _pthread_mutex_unlock($0 | 0) | 0; //@line 1735
 STACKTOP = sp; //@line 1736
 return $20 | 0; //@line 1736
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13433
 STACKTOP = STACKTOP + 16 | 0; //@line 13434
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13434
 $3 = sp; //@line 13435
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 13437
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 13440
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 13441
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 13442
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 138; //@line 13445
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 13447
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 13449
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 13451
  sp = STACKTOP; //@line 13452
  STACKTOP = sp; //@line 13453
  return 0; //@line 13453
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 13455
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 13459
 }
 STACKTOP = sp; //@line 13461
 return $8 & 1 | 0; //@line 13461
}
function __ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3429
 $1 = HEAP32[$0 >> 2] | 0; //@line 3430
 if ($1 | 0) {
  $4 = HEAP32[$1 + 20 >> 2] | 0; //@line 3434
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3435
  $5 = FUNCTION_TABLE_ii[$4 & 3]($1) | 0; //@line 3436
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 92; //@line 3439
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3441
   sp = STACKTOP; //@line 3442
   return;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3445
  HEAP32[(HEAP32[$0 >> 2] | 0) + 8 >> 2] = $5; //@line 3448
  if ($5 | 0) {
   return;
  }
 }
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3454
 _mbed_assert_internal(1816, 1819, 149); //@line 3455
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 93; //@line 3458
  sp = STACKTOP; //@line 3459
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 3462
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
 sp = STACKTOP; //@line 12353
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 12359
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 12362
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 12365
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 12366
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 12367
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 120; //@line 12370
    sp = STACKTOP; //@line 12371
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12374
    break;
   }
  }
 } while (0);
 return;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4004
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4012
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4014
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4016
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4018
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4020
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 4022
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 4024
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 4035
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 4036
 HEAP32[$10 >> 2] = 0; //@line 4037
 HEAP32[$12 >> 2] = 0; //@line 4038
 HEAP32[$14 >> 2] = 0; //@line 4039
 HEAP32[$2 >> 2] = 0; //@line 4040
 $33 = HEAP32[$16 >> 2] | 0; //@line 4041
 HEAP32[$16 >> 2] = $33 | $18; //@line 4046
 if ($20 | 0) {
  ___unlockfile($22); //@line 4049
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 4052
 return;
}
function _mbed_vtracef__async_cb_15($0) {
 $0 = $0 | 0;
 var $$pre = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 869
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 873
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 2) {
  return;
 }
 $5 = $4 + -1 | 0; //@line 878
 $$pre = HEAP32[56] | 0; //@line 879
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 880
 FUNCTION_TABLE_v[$$pre & 7](); //@line 881
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 46; //@line 884
  $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 885
  HEAP32[$6 >> 2] = $4; //@line 886
  $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 887
  HEAP32[$7 >> 2] = $5; //@line 888
  sp = STACKTOP; //@line 889
  return;
 }
 ___async_unwind = 0; //@line 892
 HEAP32[$ReallocAsyncCtx9 >> 2] = 46; //@line 893
 $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 894
 HEAP32[$6 >> 2] = $4; //@line 895
 $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 896
 HEAP32[$7 >> 2] = $5; //@line 897
 sp = STACKTOP; //@line 898
 return;
}
function _mbed_vtracef__async_cb_14($0) {
 $0 = $0 | 0;
 var $$pre = 0, $2 = 0, $4 = 0, $5 = 0, $6 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 836
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 838
 if (($2 | 0) <= 1) {
  return;
 }
 $4 = $2 + -1 | 0; //@line 843
 $$pre = HEAP32[56] | 0; //@line 844
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 845
 FUNCTION_TABLE_v[$$pre & 7](); //@line 846
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 46; //@line 849
  $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 850
  HEAP32[$5 >> 2] = $2; //@line 851
  $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 852
  HEAP32[$6 >> 2] = $4; //@line 853
  sp = STACKTOP; //@line 854
  return;
 }
 ___async_unwind = 0; //@line 857
 HEAP32[$ReallocAsyncCtx9 >> 2] = 46; //@line 858
 $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 859
 HEAP32[$5 >> 2] = $2; //@line 860
 $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 861
 HEAP32[$6 >> 2] = $4; //@line 862
 sp = STACKTOP; //@line 863
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
 sp = STACKTOP; //@line 13352
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 13354
 $8 = $7 >> 8; //@line 13355
 if (!($7 & 1)) {
  $$0 = $8; //@line 13359
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 13364
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 13366
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 13369
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13374
 FUNCTION_TABLE_viiiiii[$17 & 3]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 13375
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 136; //@line 13378
  sp = STACKTOP; //@line 13379
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13382
  return;
 }
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12522
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 12528
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 12531
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 12534
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 12535
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 12536
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 123; //@line 12539
    sp = STACKTOP; //@line 12540
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12543
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
 sp = STACKTOP; //@line 13394
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 13396
 $7 = $6 >> 8; //@line 13397
 if (!($6 & 1)) {
  $$0 = $7; //@line 13401
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 13406
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 13408
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 13411
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13416
 FUNCTION_TABLE_viiiii[$16 & 3]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 13417
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 137; //@line 13420
  sp = STACKTOP; //@line 13421
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13424
  return;
 }
}
function ___dynamic_cast__async_cb_59($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3470
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3472
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3474
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3480
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 3495
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 3511
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 3516
    break;
   }
  default:
   {
    $$0 = 0; //@line 3520
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 3525
 return;
}
function _mbed_error_vfprintf__async_cb_61($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3718
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 3720
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3722
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3724
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3726
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3728
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 3730
 _serial_putc(4912, $2 << 24 >> 24); //@line 3731
 if (!___async) {
  ___async_unwind = 0; //@line 3734
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 67; //@line 3736
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 3738
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 3740
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $8; //@line 3742
 HEAP8[$ReallocAsyncCtx2 + 16 >> 0] = $2; //@line 3744
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 3746
 sp = STACKTOP; //@line 3747
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13309
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 13311
 $6 = $5 >> 8; //@line 13312
 if (!($5 & 1)) {
  $$0 = $6; //@line 13316
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 13321
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 13323
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 13326
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13331
 FUNCTION_TABLE_viiii[$15 & 3]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 13332
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 135; //@line 13335
  sp = STACKTOP; //@line 13336
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13339
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
 sp = STACKTOP; //@line 9532
 STACKTOP = STACKTOP + 256 | 0; //@line 9533
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 9533
 $5 = sp; //@line 9534
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 9540
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 9544
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 9547
   $$011 = $9; //@line 9548
   do {
    _out_670($0, $5, 256); //@line 9550
    $$011 = $$011 + -256 | 0; //@line 9551
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 9560
  } else {
   $$0$lcssa = $9; //@line 9562
  }
  _out_670($0, $5, $$0$lcssa); //@line 9564
 }
 STACKTOP = sp; //@line 9566
 return;
}
function __ZN4mbed11InterruptInD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1201
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1203
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 1205
 if (!$4) {
  __ZdlPv($2); //@line 1208
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 1213
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 1214
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 1215
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 15; //@line 1218
  $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 1219
  HEAP32[$9 >> 2] = $2; //@line 1220
  sp = STACKTOP; //@line 1221
  return;
 }
 ___async_unwind = 0; //@line 1224
 HEAP32[$ReallocAsyncCtx2 >> 2] = 15; //@line 1225
 $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 1226
 HEAP32[$9 >> 2] = $2; //@line 1227
 sp = STACKTOP; //@line 1228
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 6827
 STACKTOP = STACKTOP + 32 | 0; //@line 6828
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 6828
 $vararg_buffer = sp; //@line 6829
 $3 = sp + 20 | 0; //@line 6830
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 6834
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 6836
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 6838
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 6840
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 6842
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 6847
  $10 = -1; //@line 6848
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 6851
 }
 STACKTOP = sp; //@line 6853
 return $10 | 0; //@line 6853
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 2458
 STACKTOP = STACKTOP + 16 | 0; //@line 2459
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2459
 $vararg_buffer = sp; //@line 2460
 HEAP32[$vararg_buffer >> 2] = $0; //@line 2461
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 2463
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 2465
 _mbed_error_printf(1384, $vararg_buffer); //@line 2466
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2467
 _mbed_die(); //@line 2468
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 47; //@line 2471
  sp = STACKTOP; //@line 2472
  STACKTOP = sp; //@line 2473
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2475
  STACKTOP = sp; //@line 2476
  return;
 }
}
function _snprintf($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11411
 STACKTOP = STACKTOP + 16 | 0; //@line 11412
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11412
 $3 = sp; //@line 11413
 HEAP32[$3 >> 2] = $varargs; //@line 11414
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 11415
 $4 = _vsnprintf($0, $1, $2, $3) | 0; //@line 11416
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 107; //@line 11419
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 11421
  sp = STACKTOP; //@line 11422
  STACKTOP = sp; //@line 11423
  return 0; //@line 11423
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11425
  STACKTOP = sp; //@line 11426
  return $4 | 0; //@line 11426
 }
 return 0; //@line 11428
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 12075
 $5 = HEAP32[$4 >> 2] | 0; //@line 12076
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 12080
   HEAP32[$1 + 24 >> 2] = $3; //@line 12082
   HEAP32[$1 + 36 >> 2] = 1; //@line 12084
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 12088
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 12091
    HEAP32[$1 + 24 >> 2] = 2; //@line 12093
    HEAP8[$1 + 54 >> 0] = 1; //@line 12095
    break;
   }
   $10 = $1 + 24 | 0; //@line 12098
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 12102
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_13($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 806
 HEAP32[50] = HEAP32[48]; //@line 808
 $2 = HEAP32[56] | 0; //@line 809
 if (!$2) {
  return;
 }
 $4 = HEAP32[57] | 0; //@line 814
 HEAP32[57] = 0; //@line 815
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 816
 FUNCTION_TABLE_v[$2 & 7](); //@line 817
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 45; //@line 820
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 821
  HEAP32[$5 >> 2] = $4; //@line 822
  sp = STACKTOP; //@line 823
  return;
 }
 ___async_unwind = 0; //@line 826
 HEAP32[$ReallocAsyncCtx8 >> 2] = 45; //@line 827
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 828
 HEAP32[$5 >> 2] = $4; //@line 829
 sp = STACKTOP; //@line 830
 return;
}
function _mbed_vtracef__async_cb_10($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 542
 HEAP32[50] = HEAP32[48]; //@line 544
 $2 = HEAP32[56] | 0; //@line 545
 if (!$2) {
  return;
 }
 $4 = HEAP32[57] | 0; //@line 550
 HEAP32[57] = 0; //@line 551
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 552
 FUNCTION_TABLE_v[$2 & 7](); //@line 553
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 45; //@line 556
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 557
  HEAP32[$5 >> 2] = $4; //@line 558
  sp = STACKTOP; //@line 559
  return;
 }
 ___async_unwind = 0; //@line 562
 HEAP32[$ReallocAsyncCtx8 >> 2] = 45; //@line 563
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 564
 HEAP32[$5 >> 2] = $4; //@line 565
 sp = STACKTOP; //@line 566
 return;
}
function _mbed_vtracef__async_cb_9($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 512
 HEAP32[50] = HEAP32[48]; //@line 514
 $2 = HEAP32[56] | 0; //@line 515
 if (!$2) {
  return;
 }
 $4 = HEAP32[57] | 0; //@line 520
 HEAP32[57] = 0; //@line 521
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 522
 FUNCTION_TABLE_v[$2 & 7](); //@line 523
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 45; //@line 526
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 527
  HEAP32[$5 >> 2] = $4; //@line 528
  sp = STACKTOP; //@line 529
  return;
 }
 ___async_unwind = 0; //@line 532
 HEAP32[$ReallocAsyncCtx8 >> 2] = 45; //@line 533
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 534
 HEAP32[$5 >> 2] = $4; //@line 535
 sp = STACKTOP; //@line 536
 return;
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 12625
 STACKTOP = STACKTOP + 16 | 0; //@line 12626
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12626
 $vararg_buffer = sp; //@line 12627
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 12628
 FUNCTION_TABLE_v[$0 & 7](); //@line 12629
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 125; //@line 12632
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 12634
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 12636
  sp = STACKTOP; //@line 12637
  STACKTOP = sp; //@line 12638
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 12640
  _abort_message(4751, $vararg_buffer); //@line 12641
 }
}
function _equeue_post($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $4 = 0, $6 = 0, $9 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 880
 $4 = _equeue_tick() | 0; //@line 882
 HEAP32[$2 + -4 >> 2] = $1; //@line 884
 $6 = $2 + -16 | 0; //@line 885
 HEAP32[$6 >> 2] = (HEAP32[$6 >> 2] | 0) + $4; //@line 888
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 889
 $9 = _equeue_enqueue($0, $2 + -36 | 0, $4) | 0; //@line 890
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 26; //@line 893
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 895
  sp = STACKTOP; //@line 896
  return 0; //@line 897
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 899
  _equeue_sema_signal($0 + 48 | 0); //@line 901
  return $9 | 0; //@line 902
 }
 return 0; //@line 904
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 6934
 $3 = HEAP8[$1 >> 0] | 0; //@line 6935
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 6940
  $$lcssa8 = $2; //@line 6940
 } else {
  $$011 = $1; //@line 6942
  $$0710 = $0; //@line 6942
  do {
   $$0710 = $$0710 + 1 | 0; //@line 6944
   $$011 = $$011 + 1 | 0; //@line 6945
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 6946
   $9 = HEAP8[$$011 >> 0] | 0; //@line 6947
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 6952
  $$lcssa8 = $8; //@line 6952
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 6962
}
function _memcmp($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $14 = 0, $4 = 0, $5 = 0;
 L1 : do {
  if (!$2) {
   $14 = 0; //@line 11376
  } else {
   $$01318 = $0; //@line 11378
   $$01417 = $2; //@line 11378
   $$019 = $1; //@line 11378
   while (1) {
    $4 = HEAP8[$$01318 >> 0] | 0; //@line 11380
    $5 = HEAP8[$$019 >> 0] | 0; //@line 11381
    if ($4 << 24 >> 24 != $5 << 24 >> 24) {
     break;
    }
    $$01417 = $$01417 + -1 | 0; //@line 11386
    if (!$$01417) {
     $14 = 0; //@line 11391
     break L1;
    } else {
     $$01318 = $$01318 + 1 | 0; //@line 11394
     $$019 = $$019 + 1 | 0; //@line 11394
    }
   }
   $14 = ($4 & 255) - ($5 & 255) | 0; //@line 11400
  }
 } while (0);
 return $14 | 0; //@line 11403
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3023
 $2 = HEAP32[93] | 0; //@line 3024
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3025
 _putc($1, $2) | 0; //@line 3026
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 69; //@line 3029
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 3031
  sp = STACKTOP; //@line 3032
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3035
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3036
 _fflush($2) | 0; //@line 3037
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 70; //@line 3040
  sp = STACKTOP; //@line 3041
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3044
  return;
 }
}
function _mbed_tracef($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1760
 STACKTOP = STACKTOP + 16 | 0; //@line 1761
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1761
 $3 = sp; //@line 1762
 HEAP32[$3 >> 2] = $varargs; //@line 1763
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1764
 _mbed_vtracef($0, $1, $2, $3); //@line 1765
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 34; //@line 1768
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 1770
  sp = STACKTOP; //@line 1771
  STACKTOP = sp; //@line 1772
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1774
  STACKTOP = sp; //@line 1775
  return;
 }
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 6886
 STACKTOP = STACKTOP + 32 | 0; //@line 6887
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 6887
 $vararg_buffer = sp; //@line 6888
 HEAP32[$0 + 36 >> 2] = 1; //@line 6891
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 6899
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 6901
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 6903
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 6908
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 6911
 STACKTOP = sp; //@line 6912
 return $14 | 0; //@line 6912
}
function _mbed_die__async_cb_43($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 2253
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2255
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2257
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 2258
 _wait_ms(150); //@line 2259
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 49; //@line 2262
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 2263
  HEAP32[$4 >> 2] = $2; //@line 2264
  sp = STACKTOP; //@line 2265
  return;
 }
 ___async_unwind = 0; //@line 2268
 HEAP32[$ReallocAsyncCtx15 >> 2] = 49; //@line 2269
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 2270
 HEAP32[$4 >> 2] = $2; //@line 2271
 sp = STACKTOP; //@line 2272
 return;
}
function _mbed_die__async_cb_42($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 2228
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2230
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2232
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 2233
 _wait_ms(150); //@line 2234
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 50; //@line 2237
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 2238
  HEAP32[$4 >> 2] = $2; //@line 2239
  sp = STACKTOP; //@line 2240
  return;
 }
 ___async_unwind = 0; //@line 2243
 HEAP32[$ReallocAsyncCtx14 >> 2] = 50; //@line 2244
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 2245
 HEAP32[$4 >> 2] = $2; //@line 2246
 sp = STACKTOP; //@line 2247
 return;
}
function _mbed_die__async_cb_41($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 2203
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2205
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2207
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 2208
 _wait_ms(150); //@line 2209
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 51; //@line 2212
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 2213
  HEAP32[$4 >> 2] = $2; //@line 2214
  sp = STACKTOP; //@line 2215
  return;
 }
 ___async_unwind = 0; //@line 2218
 HEAP32[$ReallocAsyncCtx13 >> 2] = 51; //@line 2219
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 2220
 HEAP32[$4 >> 2] = $2; //@line 2221
 sp = STACKTOP; //@line 2222
 return;
}
function _mbed_die__async_cb_40($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 2178
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2180
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2182
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 2183
 _wait_ms(150); //@line 2184
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 52; //@line 2187
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 2188
  HEAP32[$4 >> 2] = $2; //@line 2189
  sp = STACKTOP; //@line 2190
  return;
 }
 ___async_unwind = 0; //@line 2193
 HEAP32[$ReallocAsyncCtx12 >> 2] = 52; //@line 2194
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 2195
 HEAP32[$4 >> 2] = $2; //@line 2196
 sp = STACKTOP; //@line 2197
 return;
}
function _mbed_die__async_cb_39($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 2153
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2155
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2157
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 2158
 _wait_ms(150); //@line 2159
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 53; //@line 2162
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 2163
  HEAP32[$4 >> 2] = $2; //@line 2164
  sp = STACKTOP; //@line 2165
  return;
 }
 ___async_unwind = 0; //@line 2168
 HEAP32[$ReallocAsyncCtx11 >> 2] = 53; //@line 2169
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 2170
 HEAP32[$4 >> 2] = $2; //@line 2171
 sp = STACKTOP; //@line 2172
 return;
}
function _mbed_die__async_cb_38($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 2128
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2130
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2132
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 2133
 _wait_ms(150); //@line 2134
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 54; //@line 2137
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 2138
  HEAP32[$4 >> 2] = $2; //@line 2139
  sp = STACKTOP; //@line 2140
  return;
 }
 ___async_unwind = 0; //@line 2143
 HEAP32[$ReallocAsyncCtx10 >> 2] = 54; //@line 2144
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 2145
 HEAP32[$4 >> 2] = $2; //@line 2146
 sp = STACKTOP; //@line 2147
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 1878
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1880
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 1882
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 1883
 _wait_ms(150); //@line 1884
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 48; //@line 1887
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 1888
  HEAP32[$4 >> 2] = $2; //@line 1889
  sp = STACKTOP; //@line 1890
  return;
 }
 ___async_unwind = 0; //@line 1893
 HEAP32[$ReallocAsyncCtx16 >> 2] = 48; //@line 1894
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 1895
 HEAP32[$4 >> 2] = $2; //@line 1896
 sp = STACKTOP; //@line 1897
 return;
}
function _mbed_die__async_cb_37($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 2103
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2105
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2107
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 2108
 _wait_ms(150); //@line 2109
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 55; //@line 2112
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 2113
  HEAP32[$4 >> 2] = $2; //@line 2114
  sp = STACKTOP; //@line 2115
  return;
 }
 ___async_unwind = 0; //@line 2118
 HEAP32[$ReallocAsyncCtx9 >> 2] = 55; //@line 2119
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 2120
 HEAP32[$4 >> 2] = $2; //@line 2121
 sp = STACKTOP; //@line 2122
 return;
}
function _mbed_die__async_cb_36($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 2078
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2080
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2082
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 2083
 _wait_ms(400); //@line 2084
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 2087
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 2088
  HEAP32[$4 >> 2] = $2; //@line 2089
  sp = STACKTOP; //@line 2090
  return;
 }
 ___async_unwind = 0; //@line 2093
 HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 2094
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 2095
 HEAP32[$4 >> 2] = $2; //@line 2096
 sp = STACKTOP; //@line 2097
 return;
}
function _mbed_die__async_cb_35($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2053
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2055
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2057
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 2058
 _wait_ms(400); //@line 2059
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 57; //@line 2062
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 2063
  HEAP32[$4 >> 2] = $2; //@line 2064
  sp = STACKTOP; //@line 2065
  return;
 }
 ___async_unwind = 0; //@line 2068
 HEAP32[$ReallocAsyncCtx7 >> 2] = 57; //@line 2069
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 2070
 HEAP32[$4 >> 2] = $2; //@line 2071
 sp = STACKTOP; //@line 2072
 return;
}
function _mbed_die__async_cb_34($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 2028
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2030
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2032
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 2033
 _wait_ms(400); //@line 2034
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 58; //@line 2037
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 2038
  HEAP32[$4 >> 2] = $2; //@line 2039
  sp = STACKTOP; //@line 2040
  return;
 }
 ___async_unwind = 0; //@line 2043
 HEAP32[$ReallocAsyncCtx6 >> 2] = 58; //@line 2044
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 2045
 HEAP32[$4 >> 2] = $2; //@line 2046
 sp = STACKTOP; //@line 2047
 return;
}
function _mbed_die__async_cb_33($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 2003
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2005
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2007
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 2008
 _wait_ms(400); //@line 2009
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 59; //@line 2012
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 2013
  HEAP32[$4 >> 2] = $2; //@line 2014
  sp = STACKTOP; //@line 2015
  return;
 }
 ___async_unwind = 0; //@line 2018
 HEAP32[$ReallocAsyncCtx5 >> 2] = 59; //@line 2019
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 2020
 HEAP32[$4 >> 2] = $2; //@line 2021
 sp = STACKTOP; //@line 2022
 return;
}
function _mbed_die__async_cb_32($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1978
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1980
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 1982
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 1983
 _wait_ms(400); //@line 1984
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 60; //@line 1987
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 1988
  HEAP32[$4 >> 2] = $2; //@line 1989
  sp = STACKTOP; //@line 1990
  return;
 }
 ___async_unwind = 0; //@line 1993
 HEAP32[$ReallocAsyncCtx4 >> 2] = 60; //@line 1994
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 1995
 HEAP32[$4 >> 2] = $2; //@line 1996
 sp = STACKTOP; //@line 1997
 return;
}
function _mbed_die__async_cb_31($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1953
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1955
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 1957
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 1958
 _wait_ms(400); //@line 1959
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 61; //@line 1962
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 1963
  HEAP32[$4 >> 2] = $2; //@line 1964
  sp = STACKTOP; //@line 1965
  return;
 }
 ___async_unwind = 0; //@line 1968
 HEAP32[$ReallocAsyncCtx3 >> 2] = 61; //@line 1969
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 1970
 HEAP32[$4 >> 2] = $2; //@line 1971
 sp = STACKTOP; //@line 1972
 return;
}
function _mbed_die__async_cb_30($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1928
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1930
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 1932
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 1933
 _wait_ms(400); //@line 1934
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 62; //@line 1937
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 1938
  HEAP32[$4 >> 2] = $2; //@line 1939
  sp = STACKTOP; //@line 1940
  return;
 }
 ___async_unwind = 0; //@line 1943
 HEAP32[$ReallocAsyncCtx2 >> 2] = 62; //@line 1944
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 1945
 HEAP32[$4 >> 2] = $2; //@line 1946
 sp = STACKTOP; //@line 1947
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13796
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13800
 HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 8 >> 2] = $AsyncRetVal; //@line 13803
 if ($AsyncRetVal | 0) {
  return;
 }
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 13808
 _mbed_assert_internal(1816, 1819, 149); //@line 13809
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 93; //@line 13812
  sp = STACKTOP; //@line 13813
  return;
 }
 ___async_unwind = 0; //@line 13816
 HEAP32[$ReallocAsyncCtx2 >> 2] = 93; //@line 13817
 sp = STACKTOP; //@line 13818
 return;
}
function _mbed_die__async_cb_29($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1903
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1905
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 1907
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 1908
 _wait_ms(400); //@line 1909
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 63; //@line 1912
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 1913
  HEAP32[$4 >> 2] = $2; //@line 1914
  sp = STACKTOP; //@line 1915
  return;
 }
 ___async_unwind = 0; //@line 1918
 HEAP32[$ReallocAsyncCtx >> 2] = 63; //@line 1919
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 1920
 HEAP32[$4 >> 2] = $2; //@line 1921
 sp = STACKTOP; //@line 1922
 return;
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2786
 STACKTOP = STACKTOP + 16 | 0; //@line 2787
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2787
 $1 = sp; //@line 2788
 HEAP32[$1 >> 2] = $varargs; //@line 2789
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2790
 _mbed_error_vfprintf($0, $1); //@line 2791
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 64; //@line 2794
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 2796
  sp = STACKTOP; //@line 2797
  STACKTOP = sp; //@line 2798
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2800
  STACKTOP = sp; //@line 2801
  return;
 }
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 7143
 newDynamicTop = oldDynamicTop + increment | 0; //@line 7144
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 7148
  ___setErrNo(12); //@line 7149
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 7153
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 7157
   ___setErrNo(12); //@line 7158
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 7162
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 7057
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 7059
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 7065
  $11 = ___fwritex($0, $4, $3) | 0; //@line 7066
  if ($phitmp) {
   $13 = $11; //@line 7068
  } else {
   ___unlockfile($3); //@line 7070
   $13 = $11; //@line 7071
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 7075
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 7079
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 7082
 }
 return $15 | 0; //@line 7084
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 9393
 } else {
  $$056 = $2; //@line 9395
  $15 = $1; //@line 9395
  $8 = $0; //@line 9395
  while (1) {
   $14 = $$056 + -1 | 0; //@line 9403
   HEAP8[$14 >> 0] = HEAPU8[2414 + ($8 & 15) >> 0] | 0 | $3; //@line 9404
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 9405
   $15 = tempRet0; //@line 9406
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 9411
    break;
   } else {
    $$056 = $14; //@line 9414
   }
  }
 }
 return $$05$lcssa | 0; //@line 9418
}
function __ZSt9terminatev() {
 var $0 = 0, $16 = 0, $17 = 0, $2 = 0, $5 = 0, sp = 0;
 sp = STACKTOP; //@line 12590
 $0 = ___cxa_get_globals_fast() | 0; //@line 12591
 if ($0 | 0) {
  $2 = HEAP32[$0 >> 2] | 0; //@line 12594
  if ($2 | 0) {
   $5 = $2 + 48 | 0; //@line 12598
   if ((HEAP32[$5 >> 2] & -256 | 0) == 1126902528 ? (HEAP32[$5 + 4 >> 2] | 0) == 1129074247 : 0) {
    $16 = HEAP32[$2 + 12 >> 2] | 0; //@line 12610
    _emscripten_alloc_async_context(4, sp) | 0; //@line 12611
    __ZSt11__terminatePFvvE($16); //@line 12612
   }
  }
 }
 $17 = __ZSt13get_terminatev() | 0; //@line 12617
 _emscripten_alloc_async_context(4, sp) | 0; //@line 12618
 __ZSt11__terminatePFvvE($17); //@line 12619
}
function __ZN4mbed11InterruptInD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13518
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13520
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 13522
 if (!$4) {
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 13529
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 13530
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 13531
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 13; //@line 13534
  sp = STACKTOP; //@line 13535
  return;
 }
 ___async_unwind = 0; //@line 13538
 HEAP32[$ReallocAsyncCtx2 >> 2] = 13; //@line 13539
 sp = STACKTOP; //@line 13540
 return;
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 7274
 $3 = HEAP8[$1 >> 0] | 0; //@line 7276
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 7280
 $7 = HEAP32[$0 >> 2] | 0; //@line 7281
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 7286
  HEAP32[$0 + 4 >> 2] = 0; //@line 7288
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 7290
  HEAP32[$0 + 28 >> 2] = $14; //@line 7292
  HEAP32[$0 + 20 >> 2] = $14; //@line 7294
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 7300
  $$0 = 0; //@line 7301
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 7304
  $$0 = -1; //@line 7305
 }
 return $$0 | 0; //@line 7307
}
function _twobyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$sink$in = 0, $$sink17$sink = 0, $11 = 0, $12 = 0, $8 = 0;
 $8 = (HEAPU8[$1 >> 0] | 0) << 8 | (HEAPU8[$1 + 1 >> 0] | 0); //@line 10861
 $$sink$in = HEAPU8[$0 >> 0] | 0; //@line 10864
 $$sink17$sink = $0; //@line 10864
 while (1) {
  $11 = $$sink17$sink + 1 | 0; //@line 10866
  $12 = HEAP8[$11 >> 0] | 0; //@line 10867
  if (!($12 << 24 >> 24)) {
   break;
  }
  $$sink$in = $$sink$in << 8 & 65280 | $12 & 255; //@line 10875
  if (($$sink$in | 0) == ($8 | 0)) {
   break;
  } else {
   $$sink17$sink = $11; //@line 10880
  }
 }
 return ($12 << 24 >> 24 ? $$sink17$sink : 0) | 0; //@line 10885
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 9430
 } else {
  $$06 = $2; //@line 9432
  $11 = $1; //@line 9432
  $7 = $0; //@line 9432
  while (1) {
   $10 = $$06 + -1 | 0; //@line 9437
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 9438
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 9439
   $11 = tempRet0; //@line 9440
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 9445
    break;
   } else {
    $$06 = $10; //@line 9448
   }
  }
 }
 return $$0$lcssa | 0; //@line 9452
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2278
 $3 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 2281
 $5 = HEAP32[$3 + 4 >> 2] | 0; //@line 2283
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 2284
 _equeue_dealloc($5, $3); //@line 2285
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 2288
  sp = STACKTOP; //@line 2289
  return;
 }
 ___async_unwind = 0; //@line 2292
 HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 2293
 sp = STACKTOP; //@line 2294
 return;
}
function __GLOBAL__sub_I_main_cpp() {
 __ZN6events10EventQueueC2EjPh(4920, 1664, 0); //@line 3122
 HEAP32[1281] = 0; //@line 3123
 HEAP32[1282] = 0; //@line 3123
 HEAP32[1283] = 0; //@line 3123
 HEAP32[1284] = 0; //@line 3123
 HEAP32[1285] = 0; //@line 3123
 HEAP32[1286] = 0; //@line 3123
 _gpio_init_out(5124, 50); //@line 3124
 HEAP32[1287] = 0; //@line 3125
 HEAP32[1288] = 0; //@line 3125
 HEAP32[1289] = 0; //@line 3125
 HEAP32[1290] = 0; //@line 3125
 HEAP32[1291] = 0; //@line 3125
 HEAP32[1292] = 0; //@line 3125
 _gpio_init_out(5148, 52); //@line 3126
 __ZN4mbed11InterruptInC2E7PinName(5172, 1337); //@line 3127
 return;
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13466
 do {
  if (!$0) {
   $3 = 0; //@line 13470
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13472
   $2 = ___dynamic_cast($0, 64, 120, 0) | 0; //@line 13473
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 139; //@line 13476
    sp = STACKTOP; //@line 13477
    return 0; //@line 13478
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 13480
    $3 = ($2 | 0) != 0 & 1; //@line 13483
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 13488
}
function _invoke_ticker__async_cb_50($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2860
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 2866
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 2867
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 2868
 FUNCTION_TABLE_vi[$5 & 255]($6); //@line 2869
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 72; //@line 2872
  sp = STACKTOP; //@line 2873
  return;
 }
 ___async_unwind = 0; //@line 2876
 HEAP32[$ReallocAsyncCtx >> 2] = 72; //@line 2877
 sp = STACKTOP; //@line 2878
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 9074
 } else {
  $$04 = 0; //@line 9076
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 9079
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 9083
   $12 = $7 + 1 | 0; //@line 9084
   HEAP32[$0 >> 2] = $12; //@line 9085
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 9091
    break;
   } else {
    $$04 = $11; //@line 9094
   }
  }
 }
 return $$0$lcssa | 0; //@line 9098
}
function _main__async_cb_22($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 1492
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1494
 $4 = HEAP32[$2 + 4 >> 2] | 0; //@line 1496
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(4) | 0; //@line 1497
 _equeue_dealloc($4, $2); //@line 1498
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 85; //@line 1501
  sp = STACKTOP; //@line 1502
  return;
 }
 ___async_unwind = 0; //@line 1505
 HEAP32[$ReallocAsyncCtx5 >> 2] = 85; //@line 1506
 sp = STACKTOP; //@line 1507
 return;
}
function ___fflush_unlocked__async_cb_7($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13916
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13918
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13920
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13922
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 13924
 HEAP32[$4 >> 2] = 0; //@line 13925
 HEAP32[$6 >> 2] = 0; //@line 13926
 HEAP32[$8 >> 2] = 0; //@line 13927
 HEAP32[$10 >> 2] = 0; //@line 13928
 HEAP32[___async_retval >> 2] = 0; //@line 13930
 return;
}
function _main__async_cb_24($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 1521
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1523
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 1524
 $3 = _equeue_alloc(4920, 32) | 0; //@line 1525
 if (!___async) {
  HEAP32[___async_retval >> 2] = $3; //@line 1529
  ___async_unwind = 0; //@line 1530
 }
 HEAP32[$ReallocAsyncCtx7 >> 2] = 80; //@line 1532
 HEAP32[$ReallocAsyncCtx7 + 4 >> 2] = $2; //@line 1534
 sp = STACKTOP; //@line 1535
 return;
}
function __Z9blink_ledv() {
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3132
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3133
 _puts(1711) | 0; //@line 3134
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 74; //@line 3137
  sp = STACKTOP; //@line 3138
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3141
  $2 = (_emscripten_asm_const_ii(7, HEAP32[1281] | 0) | 0) == 0 & 1; //@line 3145
  _emscripten_asm_const_iii(1, HEAP32[1281] | 0, $2 | 0) | 0; //@line 3147
  return;
 }
}
function __Z8btn_fallv() {
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3153
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3154
 _puts(1799) | 0; //@line 3155
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 75; //@line 3158
  sp = STACKTOP; //@line 3159
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3162
  $2 = (_emscripten_asm_const_ii(7, HEAP32[1287] | 0) | 0) == 0 & 1; //@line 3166
  _emscripten_asm_const_iii(1, HEAP32[1287] | 0, $2 | 0) | 0; //@line 3168
  return;
 }
}
function _mbed_vtracef__async_cb_8($0) {
 $0 = $0 | 0;
 var $1 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 494
 $1 = HEAP32[54] | 0; //@line 495
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 496
 FUNCTION_TABLE_vi[$1 & 255](1269); //@line 497
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 38; //@line 500
  sp = STACKTOP; //@line 501
  return;
 }
 ___async_unwind = 0; //@line 504
 HEAP32[$ReallocAsyncCtx3 >> 2] = 38; //@line 505
 sp = STACKTOP; //@line 506
 return;
}
function __ZN4mbed11InterruptInC2E7PinName($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $3 = 0, $4 = 0, dest = 0, stop = 0;
 HEAP32[$0 >> 2] = 160; //@line 250
 $2 = $0 + 4 | 0; //@line 251
 $3 = $0 + 28 | 0; //@line 252
 $4 = $0; //@line 253
 dest = $2; //@line 254
 stop = dest + 68 | 0; //@line 254
 do {
  HEAP32[dest >> 2] = 0; //@line 254
  dest = dest + 4 | 0; //@line 254
 } while ((dest | 0) < (stop | 0));
 _gpio_irq_init($3, $1, 2, $4) | 0; //@line 255
 _gpio_init_in($2, $1); //@line 256
 return;
}
function _serial_putc__async_cb_55($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3067
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3069
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 3070
 _fflush($2) | 0; //@line 3071
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 70; //@line 3074
  sp = STACKTOP; //@line 3075
  return;
 }
 ___async_unwind = 0; //@line 3078
 HEAP32[$ReallocAsyncCtx >> 2] = 70; //@line 3079
 sp = STACKTOP; //@line 3080
 return;
}
function __ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3534
 $1 = HEAP32[$0 >> 2] | 0; //@line 3535
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3536
 FUNCTION_TABLE_v[$1 & 7](); //@line 3537
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 96; //@line 3540
  sp = STACKTOP; //@line 3541
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3544
  return;
 }
}
function _emscripten_async_resume() {
 ___async = 0; //@line 6986
 ___async_unwind = 1; //@line 6987
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 6993
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 6997
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 7001
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 7003
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 6697
 STACKTOP = STACKTOP + 16 | 0; //@line 6698
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 6698
 $vararg_buffer = sp; //@line 6699
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 6703
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 6705
 STACKTOP = sp; //@line 6706
 return $5 | 0; //@line 6706
}
function _main__async_cb_25($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1541
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 1542
 __ZN6events10EventQueue8dispatchEi(4920, -1); //@line 1543
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 1546
  sp = STACKTOP; //@line 1547
  return;
 }
 ___async_unwind = 0; //@line 1550
 HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 1551
 sp = STACKTOP; //@line 1552
 return;
}
function __ZN6events10EventQueue13function_callIPFvvEEEvPv($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3358
 $1 = HEAP32[$0 >> 2] | 0; //@line 3359
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3360
 FUNCTION_TABLE_v[$1 & 7](); //@line 3361
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 87; //@line 3364
  sp = STACKTOP; //@line 3365
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3368
  return;
 }
}
function _handle_interrupt_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2939
 $2 = HEAP32[1226] | 0; //@line 2940
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2941
 FUNCTION_TABLE_vii[$2 & 3]($0, $1); //@line 2942
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 68; //@line 2945
  sp = STACKTOP; //@line 2946
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2949
  return;
 }
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 6928
 STACKTOP = STACKTOP + 16 | 0; //@line 6929
 $rem = __stackBase__ | 0; //@line 6930
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 6931
 STACKTOP = __stackBase__; //@line 6932
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 6933
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 6698
 if ((ret | 0) < 8) return ret | 0; //@line 6699
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 6700
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 6701
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 6702
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 6703
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 6704
}
function ___cxa_get_globals_fast() {
 var $3 = 0, sp = 0;
 sp = STACKTOP; //@line 11811
 STACKTOP = STACKTOP + 16 | 0; //@line 11812
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11812
 if (!(_pthread_once(5820, 4) | 0)) {
  $3 = _pthread_getspecific(HEAP32[1456] | 0) | 0; //@line 11818
  STACKTOP = sp; //@line 11819
  return $3 | 0; //@line 11819
 } else {
  _abort_message(4599, sp); //@line 11821
 }
 return 0; //@line 11824
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 11979
 }
 return;
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 11516
 $6 = HEAP32[$5 >> 2] | 0; //@line 11517
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 11518
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 11520
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 11522
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 11525
 return $2 | 0; //@line 11526
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13773
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13775
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 13776
 _fputc(10, $2) | 0; //@line 13777
 if (!___async) {
  ___async_unwind = 0; //@line 13780
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 115; //@line 13782
 sp = STACKTOP; //@line 13783
 return;
}
function __ZL25default_terminate_handlerv__async_cb_57($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3405
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3407
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3409
 HEAP32[$2 >> 2] = 4460; //@line 3410
 HEAP32[$2 + 4 >> 2] = $4; //@line 3412
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 3414
 _abort_message(4324, $2); //@line 3415
}
function __ZN6events10EventQueueC2EjPh($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0;
 $3 = $0 + 188 | 0; //@line 497
 HEAP32[$3 >> 2] = 0; //@line 498
 HEAP32[$3 + 4 >> 2] = 0; //@line 498
 HEAP32[$3 + 8 >> 2] = 0; //@line 498
 HEAP32[$3 + 12 >> 2] = 0; //@line 498
 if (!$2) {
  _equeue_create($0, $1) | 0; //@line 501
  return;
 } else {
  _equeue_create_inplace($0, $1, $2) | 0; //@line 504
  return;
 }
}
function __ZN6events10EventQueue8dispatchEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 512
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 513
 _equeue_dispatch($0, $1); //@line 514
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 23; //@line 517
  sp = STACKTOP; //@line 518
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 521
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
  $$0 = -1; //@line 2962
  return $$0 | 0; //@line 2963
 }
 HEAP32[1226] = $2; //@line 2965
 HEAP32[$0 >> 2] = $1; //@line 2966
 HEAP32[$0 + 4 >> 2] = $1; //@line 2968
 _emscripten_asm_const_iii(4, $3 | 0, $1 | 0) | 0; //@line 2969
 $$0 = 0; //@line 2970
 return $$0 | 0; //@line 2971
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13750
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 13753
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 13758
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 13761
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 12573
 STACKTOP = STACKTOP + 16 | 0; //@line 12574
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12574
 _free($0); //@line 12576
 if (!(_pthread_setspecific(HEAP32[1456] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 12581
  return;
 } else {
  _abort_message(4698, sp); //@line 12583
 }
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3913
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 3924
  $$0 = 1; //@line 3925
 } else {
  $$0 = 0; //@line 3927
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 3931
 return;
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 3002
 HEAP32[$0 >> 2] = $1; //@line 3003
 HEAP32[1227] = 1; //@line 3004
 $4 = $0; //@line 3005
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 3010
 $10 = 4912; //@line 3011
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 3013
 HEAP32[$10 + 4 >> 2] = $9; //@line 3016
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 12055
 }
 return;
}
function _mbed_trace_default_print($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1741
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1742
 _puts($0) | 0; //@line 1743
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 33; //@line 1746
  sp = STACKTOP; //@line 1747
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1750
  return;
 }
}
function _equeue_sema_create($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $4 = 0;
 $1 = _pthread_mutex_init($0 | 0, 0) | 0; //@line 1663
 if (!$1) {
  $4 = _pthread_cond_init($0 + 28 | 0, 0) | 0; //@line 1667
  if (!$4) {
   HEAP8[$0 + 76 >> 0] = 0; //@line 1671
   $$0 = 0; //@line 1672
  } else {
   $$0 = $4; //@line 1674
  }
 } else {
  $$0 = $1; //@line 1677
 }
 return $$0 | 0; //@line 1679
}
function _equeue_tick() {
 var $0 = 0, sp = 0;
 sp = STACKTOP; //@line 1626
 STACKTOP = STACKTOP + 16 | 0; //@line 1627
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1627
 $0 = sp; //@line 1628
 _gettimeofday($0 | 0, 0) | 0; //@line 1629
 STACKTOP = sp; //@line 1636
 return ((HEAP32[$0 + 4 >> 2] | 0) / 1e3 | 0) + ((HEAP32[$0 >> 2] | 0) * 1e3 | 0) | 0; //@line 1636
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3106
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3107
 _emscripten_sleep($0 | 0); //@line 3108
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 73; //@line 3111
  sp = STACKTOP; //@line 3112
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3115
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
  $7 = $1 + 28 | 0; //@line 12119
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 12123
  }
 }
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var sp = 0;
 sp = STACKTOP; //@line 12558
 STACKTOP = STACKTOP + 16 | 0; //@line 12559
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12559
 if (!(_pthread_key_create(5824, 124) | 0)) {
  STACKTOP = sp; //@line 12564
  return;
 } else {
  _abort_message(4648, sp); //@line 12566
 }
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 6962
 HEAP32[new_frame + 4 >> 2] = sp; //@line 6964
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 6966
 ___async_cur_frame = new_frame; //@line 6967
 return ___async_cur_frame + 8 | 0; //@line 6968
}
function __ZN4mbed8CallbackIFvvEE13function_moveIN6events5EventIS1_EEEEvPvPKv($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 HEAP32[$0 >> 2] = 0; //@line 3470
 $2 = HEAP32[$1 >> 2] | 0; //@line 3471
 if (!$2) {
  return;
 }
 HEAP32[$0 >> 2] = $2; //@line 3476
 HEAP32[$2 >> 2] = (HEAP32[$2 >> 2] | 0) + 1; //@line 3479
 return;
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 1188
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 1192
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 1195
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 6951
  return low << bits; //@line 6952
 }
 tempRet0 = low << bits - 32; //@line 6954
 return 0; //@line 6955
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 6940
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 6941
 }
 tempRet0 = 0; //@line 6943
 return high >>> bits - 32 | 0; //@line 6944
}
function _equeue_dispatch__async_cb_66($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5308
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5310
 HEAP8[HEAP32[$0 + 4 >> 2] >> 0] = 1; //@line 5311
 _equeue_mutex_unlock($4); //@line 5312
 HEAP8[$6 >> 0] = 0; //@line 5313
 return;
}
function _fflush__async_cb_2($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13645
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 13647
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 13650
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_51($0) {
 $0 = $0 | 0;
 var $6 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2940
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 2942
 _gpio_irq_set($6 + 28 | 0, 2, 1); //@line 2944
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
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1414
 _equeue_sema_signal((HEAP32[$0 + 4 >> 2] | 0) + 48 | 0); //@line 1416
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 1418
 return;
}
function _puts__async_cb($0) {
 $0 = $0 | 0;
 var $$lobit = 0;
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 3332
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 3335
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 3338
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 13839
 } else {
  $$0 = -1; //@line 13841
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 13844
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 7404
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 7410
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 7414
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 7225
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 6974
 stackRestore(___async_cur_frame | 0); //@line 6975
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 6976
}
function _fputc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6657
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 6658
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 6660
 return;
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2835
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 2836
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 2838
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 10515
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 10515
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 10517
 return $1 | 0; //@line 10518
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 2925
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 2931
 _emscripten_asm_const_iii(3, $0 | 0, $1 | 0) | 0; //@line 2932
 return;
}
function _gpio_init_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 2910
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 2916
 _emscripten_asm_const_iii(2, $0 | 0, $1 | 0) | 0; //@line 2917
 return;
}
function _equeue_sema_signal($0) {
 $0 = $0 | 0;
 _pthread_mutex_lock($0 | 0) | 0; //@line 1685
 HEAP8[$0 + 76 >> 0] = 1; //@line 1687
 _pthread_cond_signal($0 + 28 | 0) | 0; //@line 1689
 _pthread_mutex_unlock($0 | 0) | 0; //@line 1690
 return;
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 6863
  $$0 = -1; //@line 6864
 } else {
  $$0 = $0; //@line 6866
 }
 return $$0 | 0; //@line 6868
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 6691
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 6692
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 6693
}
function _equeue_enqueue__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13497
 _equeue_mutex_unlock(HEAP32[$0 + 4 >> 2] | 0); //@line 13498
 HEAP32[___async_retval >> 2] = $4; //@line 13500
 return;
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 6683
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 6685
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 7218
}
function __Z9blink_ledv__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(7, HEAP32[1281] | 0) | 0) == 0 & 1; //@line 1434
 _emscripten_asm_const_iii(1, HEAP32[1281] | 0, $3 | 0) | 0; //@line 1436
 return;
}
function __Z8btn_fallv__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(7, HEAP32[1287] | 0) | 0) == 0 & 1; //@line 1259
 _emscripten_asm_const_iii(1, HEAP32[1287] | 0, $3 | 0) | 0; //@line 1261
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
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 7211
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 7549
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 7554
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 9575
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 9578
 }
 return $$0 | 0; //@line 9580
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 7183
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 6920
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 7044
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 7048
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 3456
 return;
}
function __ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 3862
 return;
}
function _gpio_irq_set($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 _emscripten_asm_const_iiii(6, HEAP32[$0 + 4 >> 2] | 0, $1 | 0, $2 | 0) | 0; //@line 2992
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 6981
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 6982
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_54($0) {
 $0 = $0 | 0;
 _gpio_irq_set((HEAP32[$0 + 8 >> 2] | 0) + 28 | 0, 2, 0); //@line 3055
 return;
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 12658
 __ZdlPv($0); //@line 12659
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 12341
 __ZdlPv($0); //@line 12342
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 7540
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 7542
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 11869
 __ZdlPv($0); //@line 11870
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
  ___fwritex($1, $2, $0) | 0; //@line 9060
 }
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 1404
 return;
}
function b140(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 7622
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 12066
}
function __ZSt13get_terminatev() {
 var $0 = 0;
 $0 = HEAP32[218] | 0; //@line 12648
 HEAP32[218] = $0 + 0; //@line 12650
 return $0 | 0; //@line 12652
}
function _gpio_irq_free($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iii(5, HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 2981
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
 FUNCTION_TABLE_vii[index & 3](a1 | 0, a2 | 0); //@line 7204
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
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 7008
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_21($0) {
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
 nullFunc_viiiii(0); //@line 7619
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 9523
}
function _fflush__async_cb_3($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 13660
 return;
}
function _snprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 3350
 return;
}
function _fputc__async_cb_69($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 6670
 return;
}
function _putc__async_cb_49($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 2848
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 3](a1 | 0) | 0; //@line 7176
}
function __ZN4mbed11InterruptInD0Ev__async_cb_19($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 1237
 return;
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(4751, HEAP32[$0 + 4 >> 2] | 0); //@line 13555
}
function b8(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 7244
 return 0; //@line 7244
}
function b7(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 7241
 return 0; //@line 7241
}
function b6(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 7238
 return 0; //@line 7238
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 255](a1 | 0); //@line 7197
}
function b136(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 7616
}
function _equeue_event_period($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + -12 >> 2] = $1; //@line 1612
 return;
}
function _equeue_event_delay($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + -16 >> 2] = $1; //@line 1603
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb_44($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb_6($0) {
 $0 = $0 | 0;
 return;
}
function _equeue_event_dtor($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + -8 >> 2] = $1; //@line 1621
 return;
}
function __ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 10768
}
function _equeue_mutex_unlock($0) {
 $0 = $0 | 0;
 _pthread_mutex_unlock($0 | 0) | 0; //@line 1656
 return;
}
function _equeue_mutex_create($0) {
 $0 = $0 | 0;
 return _pthread_mutex_init($0 | 0, 0) | 0; //@line 1643
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_58($0) {
 $0 = $0 | 0;
 return;
}
function _main__async_cb_23($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 1515
 return;
}
function __ZN6events10EventQueue13function_dtorINS0_9context00IPFvvEEEEEvPv($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_i(index) {
 index = index | 0;
 return FUNCTION_TABLE_i[index & 0]() | 0; //@line 7169
}
function _equeue_mutex_lock($0) {
 $0 = $0 | 0;
 _pthread_mutex_lock($0 | 0) | 0; //@line 1649
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
 FUNCTION_TABLE_v[index & 7](); //@line 7190
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 6921
}
function __ZN6events10EventQueue13function_dtorIPFvvEEEvPv($0) {
 $0 = $0 | 0;
 return;
}
function b4(p0) {
 p0 = p0 | 0;
 nullFunc_ii(3); //@line 7235
 return 0; //@line 7235
}
function b3(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 7232
 return 0; //@line 7232
}
function b134(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(3); //@line 7613
}
function b133(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(0); //@line 7610
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
function _abort_message__async_cb_5($0) {
 $0 = $0 | 0;
 _abort(); //@line 13790
}
function ___ofl_lock() {
 ___lock(5808); //@line 7559
 return 5816; //@line 7560
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
 return _pthread_self() | 0; //@line 10689
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 10695
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
 return 0; //@line 7135
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 11695
 return;
}
function _pthread_mutex_lock(x) {
 x = x | 0;
 return 0; //@line 7131
}
function _mbed_assert_internal__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b1() {
 nullFunc_i(0); //@line 7229
 return 0; //@line 7229
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
 ___unlock(5808); //@line 7565
 return;
}
function b131(p0) {
 p0 = p0 | 0;
 nullFunc_vi(255); //@line 7607
}
function b130(p0) {
 p0 = p0 | 0;
 nullFunc_vi(254); //@line 7604
}
function b129(p0) {
 p0 = p0 | 0;
 nullFunc_vi(253); //@line 7601
}
function b128(p0) {
 p0 = p0 | 0;
 nullFunc_vi(252); //@line 7598
}
function b127(p0) {
 p0 = p0 | 0;
 nullFunc_vi(251); //@line 7595
}
function b126(p0) {
 p0 = p0 | 0;
 nullFunc_vi(250); //@line 7592
}
function b125(p0) {
 p0 = p0 | 0;
 nullFunc_vi(249); //@line 7589
}
function b124(p0) {
 p0 = p0 | 0;
 nullFunc_vi(248); //@line 7586
}
function b123(p0) {
 p0 = p0 | 0;
 nullFunc_vi(247); //@line 7583
}
function b122(p0) {
 p0 = p0 | 0;
 nullFunc_vi(246); //@line 7580
}
function b121(p0) {
 p0 = p0 | 0;
 nullFunc_vi(245); //@line 7577
}
function b120(p0) {
 p0 = p0 | 0;
 nullFunc_vi(244); //@line 7574
}
function b119(p0) {
 p0 = p0 | 0;
 nullFunc_vi(243); //@line 7571
}
function b118(p0) {
 p0 = p0 | 0;
 nullFunc_vi(242); //@line 7568
}
function b117(p0) {
 p0 = p0 | 0;
 nullFunc_vi(241); //@line 7565
}
function b116(p0) {
 p0 = p0 | 0;
 nullFunc_vi(240); //@line 7562
}
function b115(p0) {
 p0 = p0 | 0;
 nullFunc_vi(239); //@line 7559
}
function b114(p0) {
 p0 = p0 | 0;
 nullFunc_vi(238); //@line 7556
}
function b113(p0) {
 p0 = p0 | 0;
 nullFunc_vi(237); //@line 7553
}
function b112(p0) {
 p0 = p0 | 0;
 nullFunc_vi(236); //@line 7550
}
function b111(p0) {
 p0 = p0 | 0;
 nullFunc_vi(235); //@line 7547
}
function b110(p0) {
 p0 = p0 | 0;
 nullFunc_vi(234); //@line 7544
}
function b109(p0) {
 p0 = p0 | 0;
 nullFunc_vi(233); //@line 7541
}
function b108(p0) {
 p0 = p0 | 0;
 nullFunc_vi(232); //@line 7538
}
function b107(p0) {
 p0 = p0 | 0;
 nullFunc_vi(231); //@line 7535
}
function b106(p0) {
 p0 = p0 | 0;
 nullFunc_vi(230); //@line 7532
}
function b105(p0) {
 p0 = p0 | 0;
 nullFunc_vi(229); //@line 7529
}
function b104(p0) {
 p0 = p0 | 0;
 nullFunc_vi(228); //@line 7526
}
function b103(p0) {
 p0 = p0 | 0;
 nullFunc_vi(227); //@line 7523
}
function b102(p0) {
 p0 = p0 | 0;
 nullFunc_vi(226); //@line 7520
}
function b101(p0) {
 p0 = p0 | 0;
 nullFunc_vi(225); //@line 7517
}
function b100(p0) {
 p0 = p0 | 0;
 nullFunc_vi(224); //@line 7514
}
function b99(p0) {
 p0 = p0 | 0;
 nullFunc_vi(223); //@line 7511
}
function b98(p0) {
 p0 = p0 | 0;
 nullFunc_vi(222); //@line 7508
}
function b97(p0) {
 p0 = p0 | 0;
 nullFunc_vi(221); //@line 7505
}
function b96(p0) {
 p0 = p0 | 0;
 nullFunc_vi(220); //@line 7502
}
function b95(p0) {
 p0 = p0 | 0;
 nullFunc_vi(219); //@line 7499
}
function b94(p0) {
 p0 = p0 | 0;
 nullFunc_vi(218); //@line 7496
}
function b93(p0) {
 p0 = p0 | 0;
 nullFunc_vi(217); //@line 7493
}
function b92(p0) {
 p0 = p0 | 0;
 nullFunc_vi(216); //@line 7490
}
function b91(p0) {
 p0 = p0 | 0;
 nullFunc_vi(215); //@line 7487
}
function b90(p0) {
 p0 = p0 | 0;
 nullFunc_vi(214); //@line 7484
}
function b89(p0) {
 p0 = p0 | 0;
 nullFunc_vi(213); //@line 7481
}
function b88(p0) {
 p0 = p0 | 0;
 nullFunc_vi(212); //@line 7478
}
function b87(p0) {
 p0 = p0 | 0;
 nullFunc_vi(211); //@line 7475
}
function b86(p0) {
 p0 = p0 | 0;
 nullFunc_vi(210); //@line 7472
}
function b85(p0) {
 p0 = p0 | 0;
 nullFunc_vi(209); //@line 7469
}
function b84(p0) {
 p0 = p0 | 0;
 nullFunc_vi(208); //@line 7466
}
function b83(p0) {
 p0 = p0 | 0;
 nullFunc_vi(207); //@line 7463
}
function b82(p0) {
 p0 = p0 | 0;
 nullFunc_vi(206); //@line 7460
}
function b81(p0) {
 p0 = p0 | 0;
 nullFunc_vi(205); //@line 7457
}
function b80(p0) {
 p0 = p0 | 0;
 nullFunc_vi(204); //@line 7454
}
function b79(p0) {
 p0 = p0 | 0;
 nullFunc_vi(203); //@line 7451
}
function b78(p0) {
 p0 = p0 | 0;
 nullFunc_vi(202); //@line 7448
}
function b77(p0) {
 p0 = p0 | 0;
 nullFunc_vi(201); //@line 7445
}
function b76(p0) {
 p0 = p0 | 0;
 nullFunc_vi(200); //@line 7442
}
function b75(p0) {
 p0 = p0 | 0;
 nullFunc_vi(199); //@line 7439
}
function b74(p0) {
 p0 = p0 | 0;
 nullFunc_vi(198); //@line 7436
}
function b73(p0) {
 p0 = p0 | 0;
 nullFunc_vi(197); //@line 7433
}
function b72(p0) {
 p0 = p0 | 0;
 nullFunc_vi(196); //@line 7430
}
function b71(p0) {
 p0 = p0 | 0;
 nullFunc_vi(195); //@line 7427
}
function b70(p0) {
 p0 = p0 | 0;
 nullFunc_vi(194); //@line 7424
}
function b69(p0) {
 p0 = p0 | 0;
 nullFunc_vi(193); //@line 7421
}
function b68(p0) {
 p0 = p0 | 0;
 nullFunc_vi(192); //@line 7418
}
function b67(p0) {
 p0 = p0 | 0;
 nullFunc_vi(191); //@line 7415
}
function b66(p0) {
 p0 = p0 | 0;
 nullFunc_vi(190); //@line 7412
}
function b65(p0) {
 p0 = p0 | 0;
 nullFunc_vi(189); //@line 7409
}
function b64(p0) {
 p0 = p0 | 0;
 nullFunc_vi(188); //@line 7406
}
function b63(p0) {
 p0 = p0 | 0;
 nullFunc_vi(187); //@line 7403
}
function b62(p0) {
 p0 = p0 | 0;
 nullFunc_vi(186); //@line 7400
}
function b61(p0) {
 p0 = p0 | 0;
 nullFunc_vi(185); //@line 7397
}
function b60(p0) {
 p0 = p0 | 0;
 nullFunc_vi(184); //@line 7394
}
function b59(p0) {
 p0 = p0 | 0;
 nullFunc_vi(183); //@line 7391
}
function b58(p0) {
 p0 = p0 | 0;
 nullFunc_vi(182); //@line 7388
}
function b57(p0) {
 p0 = p0 | 0;
 nullFunc_vi(181); //@line 7385
}
function b56(p0) {
 p0 = p0 | 0;
 nullFunc_vi(180); //@line 7382
}
function b55(p0) {
 p0 = p0 | 0;
 nullFunc_vi(179); //@line 7379
}
function b54(p0) {
 p0 = p0 | 0;
 nullFunc_vi(178); //@line 7376
}
function b53(p0) {
 p0 = p0 | 0;
 nullFunc_vi(177); //@line 7373
}
function b52(p0) {
 p0 = p0 | 0;
 nullFunc_vi(176); //@line 7370
}
function b51(p0) {
 p0 = p0 | 0;
 nullFunc_vi(175); //@line 7367
}
function b50(p0) {
 p0 = p0 | 0;
 nullFunc_vi(174); //@line 7364
}
function b49(p0) {
 p0 = p0 | 0;
 nullFunc_vi(173); //@line 7361
}
function b48(p0) {
 p0 = p0 | 0;
 nullFunc_vi(172); //@line 7358
}
function b47(p0) {
 p0 = p0 | 0;
 nullFunc_vi(171); //@line 7355
}
function b46(p0) {
 p0 = p0 | 0;
 nullFunc_vi(170); //@line 7352
}
function b45(p0) {
 p0 = p0 | 0;
 nullFunc_vi(169); //@line 7349
}
function b44(p0) {
 p0 = p0 | 0;
 nullFunc_vi(168); //@line 7346
}
function b43(p0) {
 p0 = p0 | 0;
 nullFunc_vi(167); //@line 7343
}
function b42(p0) {
 p0 = p0 | 0;
 nullFunc_vi(166); //@line 7340
}
function b41(p0) {
 p0 = p0 | 0;
 nullFunc_vi(165); //@line 7337
}
function b40(p0) {
 p0 = p0 | 0;
 nullFunc_vi(164); //@line 7334
}
function b39(p0) {
 p0 = p0 | 0;
 nullFunc_vi(163); //@line 7331
}
function b38(p0) {
 p0 = p0 | 0;
 nullFunc_vi(162); //@line 7328
}
function b37(p0) {
 p0 = p0 | 0;
 nullFunc_vi(161); //@line 7325
}
function b36(p0) {
 p0 = p0 | 0;
 nullFunc_vi(160); //@line 7322
}
function b35(p0) {
 p0 = p0 | 0;
 nullFunc_vi(159); //@line 7319
}
function b34(p0) {
 p0 = p0 | 0;
 nullFunc_vi(158); //@line 7316
}
function b33(p0) {
 p0 = p0 | 0;
 nullFunc_vi(157); //@line 7313
}
function b32(p0) {
 p0 = p0 | 0;
 nullFunc_vi(156); //@line 7310
}
function b31(p0) {
 p0 = p0 | 0;
 nullFunc_vi(155); //@line 7307
}
function b30(p0) {
 p0 = p0 | 0;
 nullFunc_vi(154); //@line 7304
}
function b29(p0) {
 p0 = p0 | 0;
 nullFunc_vi(153); //@line 7301
}
function b28(p0) {
 p0 = p0 | 0;
 nullFunc_vi(152); //@line 7298
}
function b27(p0) {
 p0 = p0 | 0;
 nullFunc_vi(151); //@line 7295
}
function b26(p0) {
 p0 = p0 | 0;
 nullFunc_vi(150); //@line 7292
}
function b25(p0) {
 p0 = p0 | 0;
 nullFunc_vi(149); //@line 7289
}
function b24(p0) {
 p0 = p0 | 0;
 nullFunc_vi(148); //@line 7286
}
function b23(p0) {
 p0 = p0 | 0;
 nullFunc_vi(147); //@line 7283
}
function b22(p0) {
 p0 = p0 | 0;
 nullFunc_vi(146); //@line 7280
}
function b21(p0) {
 p0 = p0 | 0;
 nullFunc_vi(145); //@line 7277
}
function b20(p0) {
 p0 = p0 | 0;
 nullFunc_vi(144); //@line 7274
}
function b19(p0) {
 p0 = p0 | 0;
 nullFunc_vi(143); //@line 7271
}
function b18(p0) {
 p0 = p0 | 0;
 nullFunc_vi(142); //@line 7268
}
function b17(p0) {
 p0 = p0 | 0;
 nullFunc_vi(141); //@line 7265
}
function b16(p0) {
 p0 = p0 | 0;
 nullFunc_vi(140); //@line 7262
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 6879
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 7196
}
function b15(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 7259
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
function __ZSt9terminatev__async_cb_20($0) {
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
 return 5804; //@line 6873
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
 return 504; //@line 6926
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 26
}
function b13() {
 nullFunc_v(7); //@line 7256
}
function b12() {
 nullFunc_v(6); //@line 7253
}
function b11() {
 nullFunc_v(5); //@line 7250
}
function b10() {
 nullFunc_v(0); //@line 7247
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_i = [b1];
var FUNCTION_TABLE_ii = [b3,___stdio_close,__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE,b4];
var FUNCTION_TABLE_iiii = [b6,___stdio_write,___stdio_seek,___stdout_write,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b7,b8];
var FUNCTION_TABLE_v = [b10,__ZL25default_terminate_handlerv,__Z9blink_ledv,__Z8btn_fallv,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev,b11,b12,b13];
var FUNCTION_TABLE_vi = [b15,__ZN4mbed11InterruptInD2Ev,__ZN4mbed11InterruptInD0Ev,_mbed_trace_default_print,__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv,__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed11InterruptInD2Ev__async_cb,__ZN4mbed11InterruptInD2Ev__async_cb_1,__ZN4mbed11InterruptInD0Ev__async_cb,__ZN4mbed11InterruptInD0Ev__async_cb_19,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_58,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_51,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_52,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_53,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_54,__ZN6events10EventQueue8dispatchEi__async_cb,_equeue_alloc__async_cb,_equeue_dealloc__async_cb,_equeue_post__async_cb,_equeue_enqueue__async_cb,_equeue_dispatch__async_cb
,_equeue_dispatch__async_cb_67,_equeue_dispatch__async_cb_65,_equeue_dispatch__async_cb_66,_equeue_dispatch__async_cb_68,_mbed_trace_default_print__async_cb,_mbed_tracef__async_cb,_mbed_vtracef__async_cb,_mbed_vtracef__async_cb_18,_mbed_vtracef__async_cb_8,_mbed_vtracef__async_cb_9,_mbed_vtracef__async_cb_10,_mbed_vtracef__async_cb_17,_mbed_vtracef__async_cb_11,_mbed_vtracef__async_cb_16,_mbed_vtracef__async_cb_12,_mbed_vtracef__async_cb_13,_mbed_vtracef__async_cb_14,_mbed_vtracef__async_cb_15,_mbed_assert_internal__async_cb,_mbed_die__async_cb_43,_mbed_die__async_cb_42,_mbed_die__async_cb_41,_mbed_die__async_cb_40,_mbed_die__async_cb_39,_mbed_die__async_cb_38,_mbed_die__async_cb_37,_mbed_die__async_cb_36,_mbed_die__async_cb_35,_mbed_die__async_cb_34,_mbed_die__async_cb_33
,_mbed_die__async_cb_32,_mbed_die__async_cb_31,_mbed_die__async_cb_30,_mbed_die__async_cb_29,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_vfprintf__async_cb,_mbed_error_vfprintf__async_cb_61,_mbed_error_vfprintf__async_cb_60,_handle_interrupt_in__async_cb,_serial_putc__async_cb_55,_serial_putc__async_cb,_invoke_ticker__async_cb_50,_invoke_ticker__async_cb,_wait_ms__async_cb,__Z9blink_ledv__async_cb,__Z8btn_fallv__async_cb,_main__async_cb_28,__ZN6events10EventQueue13function_dtorIPFvvEEEvPv,__ZN6events10EventQueue13function_callIPFvvEEEvPv,_main__async_cb_24,_main__async_cb_27,__ZN6events5EventIFvvEE10event_dtorIPS1_EEvPNS2_5eventE,_main__async_cb_26,_main__async_cb,_main__async_cb_22,_main__async_cb_25,_main__async_cb_23,__ZN6events10EventQueue13function_callIPFvvEEEvPv__async_cb,__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb_63
,__ZN6events10EventQueue13function_dtorINS0_9context00IPFvvEEEEEvPv,__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv,__ZN6events5EventIFvvEE10event_postIPS1_EEiPNS2_5eventE__async_cb,__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb,__ZN4mbed8CallbackIFvvEE13function_callIN6events5EventIS1_EEEEvPKv__async_cb_6,__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb,__ZN4mbed8CallbackIFvvEE13function_dtorIN6events5EventIS1_EEEEvPv__async_cb_44,__ZN6events10EventQueue13function_callINS0_9context00IPFvvEEEEEvPv__async_cb,_putc__async_cb_49,_putc__async_cb,___overflow__async_cb,_fflush__async_cb_3,_fflush__async_cb_2,_fflush__async_cb_4,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_7,_vfprintf__async_cb,_snprintf__async_cb,_vsnprintf__async_cb,_fputc__async_cb_69,_fputc__async_cb,_puts__async_cb,__ZL25default_terminate_handlerv__async_cb,__ZL25default_terminate_handlerv__async_cb_57,_abort_message__async_cb,_abort_message__async_cb_5,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_64,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb
,___dynamic_cast__async_cb_59,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_21,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_56,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_48,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_47,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_46,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_45,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_62,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b16,b17,b18,b19,b20,b21,b22,b23,b24
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
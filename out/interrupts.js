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
 function($0) { window.MbedJSHal.timers.ticker_detach($0); },
 function($0, $1) { window.MbedJSHal.timers.ticker_setup($0, $1); },
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

STATICTOP = STATIC_BASE + 7520;
/* global initializers */  __ATINIT__.push({ func: function() { __GLOBAL__sub_I_main_cpp() } });


memoryInitializer = "interrupts.js.mem";





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

  function ___cxa_pure_virtual() {
      ABORT = true;
      throw 'Pure virtual function called!';
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



   

  function _llvm_trap() {
      abort('trap!');
    }

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 

   

  
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



var debug_table_i = ["0", "_us_ticker_read", "_us_ticker_get_info", "0"];
var debug_table_ii = ["0", "___stdio_close"];
var debug_table_iiii = ["0", "___stdio_write", "___stdio_seek", "___stdout_write", "_sn_write", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv", "0", "0"];
var debug_table_v = ["0", "___cxa_pure_virtual", "_us_ticker_init", "_us_ticker_disable_interrupt", "_us_ticker_clear_interrupt", "_us_ticker_fire_interrupt", "__ZL25default_terminate_handlerv", "__Z10blink_led1v", "__Z12turn_led3_onv", "__Z11toggle_led2v", "__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev", "0", "0", "0", "0", "0"];
var debug_table_vi = ["0", "__ZN4mbed11InterruptInD2Ev", "__ZN4mbed11InterruptInD0Ev", "__ZN4mbed7TimeoutD2Ev", "__ZN4mbed7TimeoutD0Ev", "__ZN4mbed7Timeout7handlerEv", "__ZN4mbed10TimerEventD2Ev", "__ZN4mbed10TimerEventD0Ev", "_mbed_trace_default_print", "__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv", "__ZN4mbed8CallbackIFvvEE13function_dtorIPS1_EEvPv", "_us_ticker_set_interrupt", "__ZN4mbed6TickerD2Ev", "__ZN4mbed6TickerD0Ev", "__ZN4mbed6Ticker7handlerEv", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "__ZN10__cxxabiv121__vmi_class_type_infoD0Ev", "__ZN4mbed11InterruptInD2Ev__async_cb", "__ZN4mbed11InterruptInD2Ev__async_cb_15", "__ZN4mbed11InterruptInD0Ev__async_cb", "__ZN4mbed11InterruptInD0Ev__async_cb_16", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_54", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_57", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_58", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_59", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_60", "__ZN4mbed7TimeoutD2Ev__async_cb", "__ZN4mbed7TimeoutD2Ev__async_cb_49", "__ZN4mbed7TimeoutD0Ev__async_cb", "__ZN4mbed7TimeoutD0Ev__async_cb_37", "__ZN4mbed7Timeout7handlerEv__async_cb", "__ZN4mbed7Timeout7handlerEv__async_cb_73", "__ZN4mbed7Timeout7handlerEv__async_cb_71", "__ZN4mbed7Timeout7handlerEv__async_cb_72", "__ZN4mbed10TimerEventD2Ev__async_cb", "__ZN4mbed10TimerEvent3irqEj", "__ZN4mbed10TimerEventC2Ev__async_cb", "__ZN4mbed10TimerEvent3irqEj__async_cb", "_mbed_trace_default_print__async_cb", "_mbed_tracef__async_cb", "_mbed_vtracef__async_cb", "_mbed_vtracef__async_cb_11", "_mbed_vtracef__async_cb_1", "_mbed_vtracef__async_cb_2", "_mbed_vtracef__async_cb_3", "_mbed_vtracef__async_cb_10", "_mbed_vtracef__async_cb_4", "_mbed_vtracef__async_cb_9", "_mbed_vtracef__async_cb_5", "_mbed_vtracef__async_cb_6", "_mbed_vtracef__async_cb_7", "_mbed_vtracef__async_cb_8", "__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv__async_cb", "_ticker_set_handler__async_cb", "_initialize__async_cb", "_initialize__async_cb_74", "_initialize__async_cb_79", "_initialize__async_cb_78", "_initialize__async_cb_75", "_initialize__async_cb_76", "_initialize__async_cb_77", "_schedule_interrupt__async_cb", "_schedule_interrupt__async_cb_61", "_schedule_interrupt__async_cb_62", "_schedule_interrupt__async_cb_63", "_schedule_interrupt__async_cb_64", "_schedule_interrupt__async_cb_65", "_schedule_interrupt__async_cb_66", "_ticker_remove_event__async_cb", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_36", "_mbed_die__async_cb_35", "_mbed_die__async_cb_34", "_mbed_die__async_cb_33", "_mbed_die__async_cb_32", "_mbed_die__async_cb_31", "_mbed_die__async_cb_30", "_mbed_die__async_cb_29", "_mbed_die__async_cb_28", "_mbed_die__async_cb_27", "_mbed_die__async_cb_26", "_mbed_die__async_cb_25", "_mbed_die__async_cb_24", "_mbed_die__async_cb_23", "_mbed_die__async_cb_22", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_vfprintf__async_cb", "_mbed_error_vfprintf__async_cb_19", "_mbed_error_vfprintf__async_cb_18", "_handle_interrupt_in__async_cb", "_serial_putc__async_cb_20", "_serial_putc__async_cb", "__ZN4mbed6TickerD2Ev__async_cb", "__ZN4mbed6TickerD2Ev__async_cb_48", "__ZN4mbed6TickerD0Ev__async_cb", "__ZN4mbed6TickerD0Ev__async_cb_38", "__ZN4mbed6Ticker7handlerEv__async_cb", "_invoke_ticker__async_cb", "_wait_ms__async_cb", "__GLOBAL__sub_I_main_cpp__async_cb_84", "__GLOBAL__sub_I_main_cpp__async_cb", "__Z10blink_led1v__async_cb", "__Z11toggle_led2v__async_cb", "__Z12turn_led3_onv__async_cb", "_main__async_cb_43", "_main__async_cb_42", "_main__async_cb_41", "_main__async_cb_45", "_main__async_cb", "_main__async_cb_44", "_main__async_cb_39", "_main__async_cb_46", "_main__async_cb_40", "_main__async_cb_47", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_50", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_51", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_52", "_putc__async_cb_55", "_putc__async_cb", "___overflow__async_cb", "_fflush__async_cb_13", "_fflush__async_cb_12", "_fflush__async_cb_14", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_17", "_vfprintf__async_cb", "_snprintf__async_cb", "_vsnprintf__async_cb", "_fputc__async_cb_21", "_fputc__async_cb", "_puts__async_cb", "__ZL25default_terminate_handlerv__async_cb", "__ZL25default_terminate_handlerv__async_cb_86", "_abort_message__async_cb", "_abort_message__async_cb_68", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_70", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_69", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_56", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv", "__ZSt11__terminatePFvvE__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_85", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_83", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_82", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_81", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_80", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_67", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
var debug_table_vii = ["0", "__ZN4mbed8CallbackIFvvEE13function_moveIPS1_EEvPvPKv", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event", "0"];
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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_i": nullFunc_i, "nullFunc_ii": nullFunc_ii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_v": nullFunc_v, "nullFunc_vi": nullFunc_vi, "nullFunc_vii": nullFunc_vii, "nullFunc_viiii": nullFunc_viiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "invoke_i": invoke_i, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "___cxa_begin_catch": ___cxa_begin_catch, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "___cxa_pure_virtual": ___cxa_pure_virtual, "___gxx_personality_v0": ___gxx_personality_v0, "___lock": ___lock, "___resumeException": ___resumeException, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___unlock": ___unlock, "_abort": _abort, "_emscripten_asm_const_i": _emscripten_asm_const_i, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_asm_const_iiii": _emscripten_asm_const_iiii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "_llvm_trap": _llvm_trap, "_pthread_getspecific": _pthread_getspecific, "_pthread_key_create": _pthread_key_create, "_pthread_once": _pthread_once, "_pthread_setspecific": _pthread_setspecific, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
  var ___cxa_pure_virtual=env.___cxa_pure_virtual;
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
  var _llvm_trap=env._llvm_trap;
  var _pthread_getspecific=env._pthread_getspecific;
  var _pthread_key_create=env._pthread_key_create;
  var _pthread_once=env._pthread_once;
  var _pthread_setspecific=env._pthread_setspecific;
  var flush_NO_FILESYSTEM=env.flush_NO_FILESYSTEM;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS
function _malloc($0) {
 $0 = $0 | 0;
 var $$$0192$i = 0, $$$0193$i = 0, $$$4351$i = 0, $$$i = 0, $$0 = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i17$i = 0, $$0189$i = 0, $$0192$lcssa$i = 0, $$01926$i = 0, $$0193$lcssa$i = 0, $$01935$i = 0, $$0197 = 0, $$0199 = 0, $$0206$i$i = 0, $$0207$i$i = 0, $$0211$i$i = 0, $$0212$i$i = 0, $$024367$i = 0, $$0287$i$i = 0, $$0288$i$i = 0, $$0289$i$i = 0, $$0295$i$i = 0, $$0296$i$i = 0, $$0342$i = 0, $$0344$i = 0, $$0345$i = 0, $$0347$i = 0, $$0353$i = 0, $$0358$i = 0, $$0359$i = 0, $$0361$i = 0, $$0362$i = 0, $$0368$i = 0, $$1196$i = 0, $$1198$i = 0, $$124466$i = 0, $$1291$i$i = 0, $$1293$i$i = 0, $$1343$i = 0, $$1348$i = 0, $$1363$i = 0, $$1370$i = 0, $$1374$i = 0, $$2234243136$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2355$i = 0, $$3$i = 0, $$3$i$i = 0, $$3$i203 = 0, $$3350$i = 0, $$3372$i = 0, $$4$lcssa$i = 0, $$4$ph$i = 0, $$414$i = 0, $$4236$i = 0, $$4351$lcssa$i = 0, $$435113$i = 0, $$4357$$4$i = 0, $$4357$ph$i = 0, $$435712$i = 0, $$723947$i = 0, $$748$i = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i19$iZ2D = 0, $$pre$phi$i211Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phi11$i$iZ2D = 0, $$pre$phiZ2D = 0, $1 = 0, $1004 = 0, $101 = 0, $1010 = 0, $1013 = 0, $1014 = 0, $102 = 0, $1032 = 0, $1034 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1052 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $108 = 0, $112 = 0, $114 = 0, $115 = 0, $117 = 0, $119 = 0, $121 = 0, $123 = 0, $125 = 0, $127 = 0, $129 = 0, $134 = 0, $138 = 0, $14 = 0, $143 = 0, $146 = 0, $149 = 0, $150 = 0, $157 = 0, $159 = 0, $16 = 0, $162 = 0, $164 = 0, $167 = 0, $169 = 0, $17 = 0, $172 = 0, $175 = 0, $176 = 0, $178 = 0, $179 = 0, $18 = 0, $181 = 0, $182 = 0, $184 = 0, $185 = 0, $19 = 0, $190 = 0, $191 = 0, $20 = 0, $204 = 0, $208 = 0, $214 = 0, $221 = 0, $225 = 0, $234 = 0, $235 = 0, $237 = 0, $238 = 0, $242 = 0, $243 = 0, $251 = 0, $252 = 0, $253 = 0, $255 = 0, $256 = 0, $261 = 0, $262 = 0, $265 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $282 = 0, $292 = 0, $296 = 0, $30 = 0, $302 = 0, $306 = 0, $309 = 0, $313 = 0, $315 = 0, $316 = 0, $318 = 0, $320 = 0, $322 = 0, $324 = 0, $326 = 0, $328 = 0, $330 = 0, $34 = 0, $340 = 0, $341 = 0, $352 = 0, $354 = 0, $357 = 0, $359 = 0, $362 = 0, $364 = 0, $367 = 0, $37 = 0, $370 = 0, $371 = 0, $373 = 0, $374 = 0, $376 = 0, $377 = 0, $379 = 0, $380 = 0, $385 = 0, $386 = 0, $391 = 0, $399 = 0, $403 = 0, $409 = 0, $41 = 0, $416 = 0, $420 = 0, $428 = 0, $431 = 0, $432 = 0, $433 = 0, $437 = 0, $438 = 0, $44 = 0, $444 = 0, $449 = 0, $450 = 0, $453 = 0, $455 = 0, $458 = 0, $463 = 0, $469 = 0, $47 = 0, $471 = 0, $473 = 0, $475 = 0, $49 = 0, $492 = 0, $494 = 0, $50 = 0, $501 = 0, $502 = 0, $503 = 0, $512 = 0, $514 = 0, $515 = 0, $517 = 0, $52 = 0, $526 = 0, $530 = 0, $532 = 0, $533 = 0, $534 = 0, $54 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $550 = 0, $552 = 0, $554 = 0, $555 = 0, $56 = 0, $561 = 0, $563 = 0, $565 = 0, $570 = 0, $572 = 0, $574 = 0, $575 = 0, $576 = 0, $58 = 0, $584 = 0, $585 = 0, $588 = 0, $592 = 0, $595 = 0, $597 = 0, $6 = 0, $60 = 0, $603 = 0, $607 = 0, $611 = 0, $62 = 0, $620 = 0, $621 = 0, $627 = 0, $629 = 0, $633 = 0, $636 = 0, $638 = 0, $64 = 0, $642 = 0, $644 = 0, $649 = 0, $650 = 0, $651 = 0, $657 = 0, $658 = 0, $659 = 0, $663 = 0, $67 = 0, $673 = 0, $675 = 0, $680 = 0, $681 = 0, $682 = 0, $688 = 0, $69 = 0, $690 = 0, $694 = 0, $7 = 0, $70 = 0, $700 = 0, $704 = 0, $71 = 0, $710 = 0, $712 = 0, $718 = 0, $72 = 0, $722 = 0, $723 = 0, $728 = 0, $73 = 0, $734 = 0, $739 = 0, $742 = 0, $743 = 0, $746 = 0, $748 = 0, $750 = 0, $753 = 0, $764 = 0, $769 = 0, $77 = 0, $771 = 0, $774 = 0, $776 = 0, $779 = 0, $782 = 0, $783 = 0, $784 = 0, $786 = 0, $788 = 0, $789 = 0, $791 = 0, $792 = 0, $797 = 0, $798 = 0, $8 = 0, $80 = 0, $812 = 0, $815 = 0, $816 = 0, $822 = 0, $83 = 0, $830 = 0, $836 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $845 = 0, $846 = 0, $852 = 0, $857 = 0, $858 = 0, $861 = 0, $863 = 0, $866 = 0, $87 = 0, $871 = 0, $877 = 0, $879 = 0, $881 = 0, $882 = 0, $9 = 0, $900 = 0, $902 = 0, $909 = 0, $910 = 0, $911 = 0, $919 = 0, $92 = 0, $923 = 0, $927 = 0, $929 = 0, $93 = 0, $935 = 0, $936 = 0, $938 = 0, $939 = 0, $940 = 0, $941 = 0, $943 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $956 = 0, $958 = 0, $96 = 0, $964 = 0, $969 = 0, $972 = 0, $973 = 0, $974 = 0, $978 = 0, $979 = 0, $98 = 0, $985 = 0, $990 = 0, $991 = 0, $994 = 0, $996 = 0, $999 = 0, label = 0, sp = 0, $958$looptemp = 0;
 sp = STACKTOP; //@line 4036
 STACKTOP = STACKTOP + 16 | 0; //@line 4037
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4037
 $1 = sp; //@line 4038
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 4045
   $7 = $6 >>> 3; //@line 4046
   $8 = HEAP32[1474] | 0; //@line 4047
   $9 = $8 >>> $7; //@line 4048
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 4054
    $16 = 5936 + ($14 << 1 << 2) | 0; //@line 4056
    $17 = $16 + 8 | 0; //@line 4057
    $18 = HEAP32[$17 >> 2] | 0; //@line 4058
    $19 = $18 + 8 | 0; //@line 4059
    $20 = HEAP32[$19 >> 2] | 0; //@line 4060
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1474] = $8 & ~(1 << $14); //@line 4067
     } else {
      if ((HEAP32[1478] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 4072
      }
      $27 = $20 + 12 | 0; //@line 4075
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 4079
       HEAP32[$17 >> 2] = $20; //@line 4080
       break;
      } else {
       _abort(); //@line 4083
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 4088
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 4091
    $34 = $18 + $30 + 4 | 0; //@line 4093
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 4096
    $$0 = $19; //@line 4097
    STACKTOP = sp; //@line 4098
    return $$0 | 0; //@line 4098
   }
   $37 = HEAP32[1476] | 0; //@line 4100
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 4106
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 4109
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 4112
     $49 = $47 >>> 12 & 16; //@line 4114
     $50 = $47 >>> $49; //@line 4115
     $52 = $50 >>> 5 & 8; //@line 4117
     $54 = $50 >>> $52; //@line 4119
     $56 = $54 >>> 2 & 4; //@line 4121
     $58 = $54 >>> $56; //@line 4123
     $60 = $58 >>> 1 & 2; //@line 4125
     $62 = $58 >>> $60; //@line 4127
     $64 = $62 >>> 1 & 1; //@line 4129
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 4132
     $69 = 5936 + ($67 << 1 << 2) | 0; //@line 4134
     $70 = $69 + 8 | 0; //@line 4135
     $71 = HEAP32[$70 >> 2] | 0; //@line 4136
     $72 = $71 + 8 | 0; //@line 4137
     $73 = HEAP32[$72 >> 2] | 0; //@line 4138
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 4144
       HEAP32[1474] = $77; //@line 4145
       $98 = $77; //@line 4146
      } else {
       if ((HEAP32[1478] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 4151
       }
       $80 = $73 + 12 | 0; //@line 4154
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 4158
        HEAP32[$70 >> 2] = $73; //@line 4159
        $98 = $8; //@line 4160
        break;
       } else {
        _abort(); //@line 4163
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 4168
     $84 = $83 - $6 | 0; //@line 4169
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 4172
     $87 = $71 + $6 | 0; //@line 4173
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 4176
     HEAP32[$71 + $83 >> 2] = $84; //@line 4178
     if ($37 | 0) {
      $92 = HEAP32[1479] | 0; //@line 4181
      $93 = $37 >>> 3; //@line 4182
      $95 = 5936 + ($93 << 1 << 2) | 0; //@line 4184
      $96 = 1 << $93; //@line 4185
      if (!($98 & $96)) {
       HEAP32[1474] = $98 | $96; //@line 4190
       $$0199 = $95; //@line 4192
       $$pre$phiZ2D = $95 + 8 | 0; //@line 4192
      } else {
       $101 = $95 + 8 | 0; //@line 4194
       $102 = HEAP32[$101 >> 2] | 0; //@line 4195
       if ((HEAP32[1478] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 4199
       } else {
        $$0199 = $102; //@line 4202
        $$pre$phiZ2D = $101; //@line 4202
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 4205
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 4207
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 4209
      HEAP32[$92 + 12 >> 2] = $95; //@line 4211
     }
     HEAP32[1476] = $84; //@line 4213
     HEAP32[1479] = $87; //@line 4214
     $$0 = $72; //@line 4215
     STACKTOP = sp; //@line 4216
     return $$0 | 0; //@line 4216
    }
    $108 = HEAP32[1475] | 0; //@line 4218
    if (!$108) {
     $$0197 = $6; //@line 4221
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 4225
     $114 = $112 >>> 12 & 16; //@line 4227
     $115 = $112 >>> $114; //@line 4228
     $117 = $115 >>> 5 & 8; //@line 4230
     $119 = $115 >>> $117; //@line 4232
     $121 = $119 >>> 2 & 4; //@line 4234
     $123 = $119 >>> $121; //@line 4236
     $125 = $123 >>> 1 & 2; //@line 4238
     $127 = $123 >>> $125; //@line 4240
     $129 = $127 >>> 1 & 1; //@line 4242
     $134 = HEAP32[6200 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 4247
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 4251
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4257
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 4260
      $$0193$lcssa$i = $138; //@line 4260
     } else {
      $$01926$i = $134; //@line 4262
      $$01935$i = $138; //@line 4262
      $146 = $143; //@line 4262
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 4267
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 4268
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 4269
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 4270
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4276
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 4279
        $$0193$lcssa$i = $$$0193$i; //@line 4279
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 4282
        $$01935$i = $$$0193$i; //@line 4282
       }
      }
     }
     $157 = HEAP32[1478] | 0; //@line 4286
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 4289
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 4292
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 4295
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 4299
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 4301
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 4305
       $176 = HEAP32[$175 >> 2] | 0; //@line 4306
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 4309
        $179 = HEAP32[$178 >> 2] | 0; //@line 4310
        if (!$179) {
         $$3$i = 0; //@line 4313
         break;
        } else {
         $$1196$i = $179; //@line 4316
         $$1198$i = $178; //@line 4316
        }
       } else {
        $$1196$i = $176; //@line 4319
        $$1198$i = $175; //@line 4319
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 4322
        $182 = HEAP32[$181 >> 2] | 0; //@line 4323
        if ($182 | 0) {
         $$1196$i = $182; //@line 4326
         $$1198$i = $181; //@line 4326
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 4329
        $185 = HEAP32[$184 >> 2] | 0; //@line 4330
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 4335
         $$1198$i = $184; //@line 4335
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 4340
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 4343
        $$3$i = $$1196$i; //@line 4344
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 4349
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 4352
       }
       $169 = $167 + 12 | 0; //@line 4355
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 4359
       }
       $172 = $164 + 8 | 0; //@line 4362
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 4366
        HEAP32[$172 >> 2] = $167; //@line 4367
        $$3$i = $164; //@line 4368
        break;
       } else {
        _abort(); //@line 4371
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 4380
       $191 = 6200 + ($190 << 2) | 0; //@line 4381
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 4386
         if (!$$3$i) {
          HEAP32[1475] = $108 & ~(1 << $190); //@line 4392
          break L73;
         }
        } else {
         if ((HEAP32[1478] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 4399
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 4407
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1478] | 0; //@line 4417
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 4420
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 4424
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 4426
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 4432
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 4436
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 4438
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 4444
       if ($214 | 0) {
        if ((HEAP32[1478] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 4450
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 4454
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 4456
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 4464
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 4467
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 4469
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 4472
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 4476
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 4479
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 4481
      if ($37 | 0) {
       $234 = HEAP32[1479] | 0; //@line 4484
       $235 = $37 >>> 3; //@line 4485
       $237 = 5936 + ($235 << 1 << 2) | 0; //@line 4487
       $238 = 1 << $235; //@line 4488
       if (!($8 & $238)) {
        HEAP32[1474] = $8 | $238; //@line 4493
        $$0189$i = $237; //@line 4495
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 4495
       } else {
        $242 = $237 + 8 | 0; //@line 4497
        $243 = HEAP32[$242 >> 2] | 0; //@line 4498
        if ((HEAP32[1478] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 4502
        } else {
         $$0189$i = $243; //@line 4505
         $$pre$phi$iZ2D = $242; //@line 4505
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 4508
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 4510
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 4512
       HEAP32[$234 + 12 >> 2] = $237; //@line 4514
      }
      HEAP32[1476] = $$0193$lcssa$i; //@line 4516
      HEAP32[1479] = $159; //@line 4517
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 4520
     STACKTOP = sp; //@line 4521
     return $$0 | 0; //@line 4521
    }
   } else {
    $$0197 = $6; //@line 4524
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 4529
   } else {
    $251 = $0 + 11 | 0; //@line 4531
    $252 = $251 & -8; //@line 4532
    $253 = HEAP32[1475] | 0; //@line 4533
    if (!$253) {
     $$0197 = $252; //@line 4536
    } else {
     $255 = 0 - $252 | 0; //@line 4538
     $256 = $251 >>> 8; //@line 4539
     if (!$256) {
      $$0358$i = 0; //@line 4542
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 4546
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 4550
       $262 = $256 << $261; //@line 4551
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 4554
       $267 = $262 << $265; //@line 4556
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 4559
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 4564
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 4570
      }
     }
     $282 = HEAP32[6200 + ($$0358$i << 2) >> 2] | 0; //@line 4574
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 4578
       $$3$i203 = 0; //@line 4578
       $$3350$i = $255; //@line 4578
       label = 81; //@line 4579
      } else {
       $$0342$i = 0; //@line 4586
       $$0347$i = $255; //@line 4586
       $$0353$i = $282; //@line 4586
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 4586
       $$0362$i = 0; //@line 4586
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 4591
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 4596
          $$435113$i = 0; //@line 4596
          $$435712$i = $$0353$i; //@line 4596
          label = 85; //@line 4597
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 4600
          $$1348$i = $292; //@line 4600
         }
        } else {
         $$1343$i = $$0342$i; //@line 4603
         $$1348$i = $$0347$i; //@line 4603
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 4606
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 4609
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 4613
        $302 = ($$0353$i | 0) == 0; //@line 4614
        if ($302) {
         $$2355$i = $$1363$i; //@line 4619
         $$3$i203 = $$1343$i; //@line 4619
         $$3350$i = $$1348$i; //@line 4619
         label = 81; //@line 4620
         break;
        } else {
         $$0342$i = $$1343$i; //@line 4623
         $$0347$i = $$1348$i; //@line 4623
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 4623
         $$0362$i = $$1363$i; //@line 4623
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 4633
       $309 = $253 & ($306 | 0 - $306); //@line 4636
       if (!$309) {
        $$0197 = $252; //@line 4639
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 4644
       $315 = $313 >>> 12 & 16; //@line 4646
       $316 = $313 >>> $315; //@line 4647
       $318 = $316 >>> 5 & 8; //@line 4649
       $320 = $316 >>> $318; //@line 4651
       $322 = $320 >>> 2 & 4; //@line 4653
       $324 = $320 >>> $322; //@line 4655
       $326 = $324 >>> 1 & 2; //@line 4657
       $328 = $324 >>> $326; //@line 4659
       $330 = $328 >>> 1 & 1; //@line 4661
       $$4$ph$i = 0; //@line 4667
       $$4357$ph$i = HEAP32[6200 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 4667
      } else {
       $$4$ph$i = $$3$i203; //@line 4669
       $$4357$ph$i = $$2355$i; //@line 4669
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 4673
       $$4351$lcssa$i = $$3350$i; //@line 4673
      } else {
       $$414$i = $$4$ph$i; //@line 4675
       $$435113$i = $$3350$i; //@line 4675
       $$435712$i = $$4357$ph$i; //@line 4675
       label = 85; //@line 4676
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 4681
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 4685
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 4686
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 4687
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 4688
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4694
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 4697
        $$4351$lcssa$i = $$$4351$i; //@line 4697
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 4700
        $$435113$i = $$$4351$i; //@line 4700
        label = 85; //@line 4701
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 4707
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1476] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1478] | 0; //@line 4713
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 4716
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 4719
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 4722
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 4726
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 4728
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 4732
         $371 = HEAP32[$370 >> 2] | 0; //@line 4733
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 4736
          $374 = HEAP32[$373 >> 2] | 0; //@line 4737
          if (!$374) {
           $$3372$i = 0; //@line 4740
           break;
          } else {
           $$1370$i = $374; //@line 4743
           $$1374$i = $373; //@line 4743
          }
         } else {
          $$1370$i = $371; //@line 4746
          $$1374$i = $370; //@line 4746
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 4749
          $377 = HEAP32[$376 >> 2] | 0; //@line 4750
          if ($377 | 0) {
           $$1370$i = $377; //@line 4753
           $$1374$i = $376; //@line 4753
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 4756
          $380 = HEAP32[$379 >> 2] | 0; //@line 4757
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 4762
           $$1374$i = $379; //@line 4762
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 4767
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 4770
          $$3372$i = $$1370$i; //@line 4771
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 4776
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 4779
         }
         $364 = $362 + 12 | 0; //@line 4782
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 4786
         }
         $367 = $359 + 8 | 0; //@line 4789
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 4793
          HEAP32[$367 >> 2] = $362; //@line 4794
          $$3372$i = $359; //@line 4795
          break;
         } else {
          _abort(); //@line 4798
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 4806
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 4809
         $386 = 6200 + ($385 << 2) | 0; //@line 4810
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 4815
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 4820
            HEAP32[1475] = $391; //@line 4821
            $475 = $391; //@line 4822
            break L164;
           }
          } else {
           if ((HEAP32[1478] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 4829
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 4837
            if (!$$3372$i) {
             $475 = $253; //@line 4840
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1478] | 0; //@line 4848
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 4851
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 4855
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 4857
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 4863
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 4867
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 4869
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 4875
         if (!$409) {
          $475 = $253; //@line 4878
         } else {
          if ((HEAP32[1478] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 4883
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 4887
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 4889
           $475 = $253; //@line 4890
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 4899
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 4902
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 4904
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 4907
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 4911
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 4914
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 4916
         $428 = $$4351$lcssa$i >>> 3; //@line 4917
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 5936 + ($428 << 1 << 2) | 0; //@line 4921
          $432 = HEAP32[1474] | 0; //@line 4922
          $433 = 1 << $428; //@line 4923
          if (!($432 & $433)) {
           HEAP32[1474] = $432 | $433; //@line 4928
           $$0368$i = $431; //@line 4930
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 4930
          } else {
           $437 = $431 + 8 | 0; //@line 4932
           $438 = HEAP32[$437 >> 2] | 0; //@line 4933
           if ((HEAP32[1478] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 4937
           } else {
            $$0368$i = $438; //@line 4940
            $$pre$phi$i211Z2D = $437; //@line 4940
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 4943
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 4945
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 4947
          HEAP32[$354 + 12 >> 2] = $431; //@line 4949
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 4952
         if (!$444) {
          $$0361$i = 0; //@line 4955
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 4959
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 4963
           $450 = $444 << $449; //@line 4964
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 4967
           $455 = $450 << $453; //@line 4969
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 4972
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 4977
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 4983
          }
         }
         $469 = 6200 + ($$0361$i << 2) | 0; //@line 4986
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 4988
         $471 = $354 + 16 | 0; //@line 4989
         HEAP32[$471 + 4 >> 2] = 0; //@line 4991
         HEAP32[$471 >> 2] = 0; //@line 4992
         $473 = 1 << $$0361$i; //@line 4993
         if (!($475 & $473)) {
          HEAP32[1475] = $475 | $473; //@line 4998
          HEAP32[$469 >> 2] = $354; //@line 4999
          HEAP32[$354 + 24 >> 2] = $469; //@line 5001
          HEAP32[$354 + 12 >> 2] = $354; //@line 5003
          HEAP32[$354 + 8 >> 2] = $354; //@line 5005
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 5014
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 5014
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 5021
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 5025
          $494 = HEAP32[$492 >> 2] | 0; //@line 5027
          if (!$494) {
           label = 136; //@line 5030
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 5033
           $$0345$i = $494; //@line 5033
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1478] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 5040
          } else {
           HEAP32[$492 >> 2] = $354; //@line 5043
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 5045
           HEAP32[$354 + 12 >> 2] = $354; //@line 5047
           HEAP32[$354 + 8 >> 2] = $354; //@line 5049
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 5054
          $502 = HEAP32[$501 >> 2] | 0; //@line 5055
          $503 = HEAP32[1478] | 0; //@line 5056
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 5062
           HEAP32[$501 >> 2] = $354; //@line 5063
           HEAP32[$354 + 8 >> 2] = $502; //@line 5065
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 5067
           HEAP32[$354 + 24 >> 2] = 0; //@line 5069
           break;
          } else {
           _abort(); //@line 5072
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 5079
       STACKTOP = sp; //@line 5080
       return $$0 | 0; //@line 5080
      } else {
       $$0197 = $252; //@line 5082
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1476] | 0; //@line 5089
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 5092
  $515 = HEAP32[1479] | 0; //@line 5093
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 5096
   HEAP32[1479] = $517; //@line 5097
   HEAP32[1476] = $514; //@line 5098
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 5101
   HEAP32[$515 + $512 >> 2] = $514; //@line 5103
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 5106
  } else {
   HEAP32[1476] = 0; //@line 5108
   HEAP32[1479] = 0; //@line 5109
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 5112
   $526 = $515 + $512 + 4 | 0; //@line 5114
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 5117
  }
  $$0 = $515 + 8 | 0; //@line 5120
  STACKTOP = sp; //@line 5121
  return $$0 | 0; //@line 5121
 }
 $530 = HEAP32[1477] | 0; //@line 5123
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 5126
  HEAP32[1477] = $532; //@line 5127
  $533 = HEAP32[1480] | 0; //@line 5128
  $534 = $533 + $$0197 | 0; //@line 5129
  HEAP32[1480] = $534; //@line 5130
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 5133
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 5136
  $$0 = $533 + 8 | 0; //@line 5138
  STACKTOP = sp; //@line 5139
  return $$0 | 0; //@line 5139
 }
 if (!(HEAP32[1592] | 0)) {
  HEAP32[1594] = 4096; //@line 5144
  HEAP32[1593] = 4096; //@line 5145
  HEAP32[1595] = -1; //@line 5146
  HEAP32[1596] = -1; //@line 5147
  HEAP32[1597] = 0; //@line 5148
  HEAP32[1585] = 0; //@line 5149
  HEAP32[1592] = $1 & -16 ^ 1431655768; //@line 5153
  $548 = 4096; //@line 5154
 } else {
  $548 = HEAP32[1594] | 0; //@line 5157
 }
 $545 = $$0197 + 48 | 0; //@line 5159
 $546 = $$0197 + 47 | 0; //@line 5160
 $547 = $548 + $546 | 0; //@line 5161
 $549 = 0 - $548 | 0; //@line 5162
 $550 = $547 & $549; //@line 5163
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 5166
  STACKTOP = sp; //@line 5167
  return $$0 | 0; //@line 5167
 }
 $552 = HEAP32[1584] | 0; //@line 5169
 if ($552 | 0) {
  $554 = HEAP32[1582] | 0; //@line 5172
  $555 = $554 + $550 | 0; //@line 5173
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 5178
   STACKTOP = sp; //@line 5179
   return $$0 | 0; //@line 5179
  }
 }
 L244 : do {
  if (!(HEAP32[1585] & 4)) {
   $561 = HEAP32[1480] | 0; //@line 5187
   L246 : do {
    if (!$561) {
     label = 163; //@line 5191
    } else {
     $$0$i$i = 6344; //@line 5193
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 5195
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 5198
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 5207
      if (!$570) {
       label = 163; //@line 5210
       break L246;
      } else {
       $$0$i$i = $570; //@line 5213
      }
     }
     $595 = $547 - $530 & $549; //@line 5217
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 5220
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 5228
       } else {
        $$723947$i = $595; //@line 5230
        $$748$i = $597; //@line 5230
        label = 180; //@line 5231
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 5235
       $$2253$ph$i = $595; //@line 5235
       label = 171; //@line 5236
      }
     } else {
      $$2234243136$i = 0; //@line 5239
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 5245
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 5248
     } else {
      $574 = $572; //@line 5250
      $575 = HEAP32[1593] | 0; //@line 5251
      $576 = $575 + -1 | 0; //@line 5252
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 5260
      $584 = HEAP32[1582] | 0; //@line 5261
      $585 = $$$i + $584 | 0; //@line 5262
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1584] | 0; //@line 5267
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 5274
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 5278
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 5281
        $$748$i = $572; //@line 5281
        label = 180; //@line 5282
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 5285
        $$2253$ph$i = $$$i; //@line 5285
        label = 171; //@line 5286
       }
      } else {
       $$2234243136$i = 0; //@line 5289
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 5296
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 5305
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 5308
       $$748$i = $$2247$ph$i; //@line 5308
       label = 180; //@line 5309
       break L244;
      }
     }
     $607 = HEAP32[1594] | 0; //@line 5313
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 5317
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 5320
      $$748$i = $$2247$ph$i; //@line 5320
      label = 180; //@line 5321
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 5327
      $$2234243136$i = 0; //@line 5328
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 5332
      $$748$i = $$2247$ph$i; //@line 5332
      label = 180; //@line 5333
      break L244;
     }
    }
   } while (0);
   HEAP32[1585] = HEAP32[1585] | 4; //@line 5340
   $$4236$i = $$2234243136$i; //@line 5341
   label = 178; //@line 5342
  } else {
   $$4236$i = 0; //@line 5344
   label = 178; //@line 5345
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 5351
   $621 = _sbrk(0) | 0; //@line 5352
   $627 = $621 - $620 | 0; //@line 5360
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 5362
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 5370
    $$748$i = $620; //@line 5370
    label = 180; //@line 5371
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1582] | 0) + $$723947$i | 0; //@line 5377
  HEAP32[1582] = $633; //@line 5378
  if ($633 >>> 0 > (HEAP32[1583] | 0) >>> 0) {
   HEAP32[1583] = $633; //@line 5382
  }
  $636 = HEAP32[1480] | 0; //@line 5384
  do {
   if (!$636) {
    $638 = HEAP32[1478] | 0; //@line 5388
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1478] = $$748$i; //@line 5393
    }
    HEAP32[1586] = $$748$i; //@line 5395
    HEAP32[1587] = $$723947$i; //@line 5396
    HEAP32[1589] = 0; //@line 5397
    HEAP32[1483] = HEAP32[1592]; //@line 5399
    HEAP32[1482] = -1; //@line 5400
    HEAP32[1487] = 5936; //@line 5401
    HEAP32[1486] = 5936; //@line 5402
    HEAP32[1489] = 5944; //@line 5403
    HEAP32[1488] = 5944; //@line 5404
    HEAP32[1491] = 5952; //@line 5405
    HEAP32[1490] = 5952; //@line 5406
    HEAP32[1493] = 5960; //@line 5407
    HEAP32[1492] = 5960; //@line 5408
    HEAP32[1495] = 5968; //@line 5409
    HEAP32[1494] = 5968; //@line 5410
    HEAP32[1497] = 5976; //@line 5411
    HEAP32[1496] = 5976; //@line 5412
    HEAP32[1499] = 5984; //@line 5413
    HEAP32[1498] = 5984; //@line 5414
    HEAP32[1501] = 5992; //@line 5415
    HEAP32[1500] = 5992; //@line 5416
    HEAP32[1503] = 6e3; //@line 5417
    HEAP32[1502] = 6e3; //@line 5418
    HEAP32[1505] = 6008; //@line 5419
    HEAP32[1504] = 6008; //@line 5420
    HEAP32[1507] = 6016; //@line 5421
    HEAP32[1506] = 6016; //@line 5422
    HEAP32[1509] = 6024; //@line 5423
    HEAP32[1508] = 6024; //@line 5424
    HEAP32[1511] = 6032; //@line 5425
    HEAP32[1510] = 6032; //@line 5426
    HEAP32[1513] = 6040; //@line 5427
    HEAP32[1512] = 6040; //@line 5428
    HEAP32[1515] = 6048; //@line 5429
    HEAP32[1514] = 6048; //@line 5430
    HEAP32[1517] = 6056; //@line 5431
    HEAP32[1516] = 6056; //@line 5432
    HEAP32[1519] = 6064; //@line 5433
    HEAP32[1518] = 6064; //@line 5434
    HEAP32[1521] = 6072; //@line 5435
    HEAP32[1520] = 6072; //@line 5436
    HEAP32[1523] = 6080; //@line 5437
    HEAP32[1522] = 6080; //@line 5438
    HEAP32[1525] = 6088; //@line 5439
    HEAP32[1524] = 6088; //@line 5440
    HEAP32[1527] = 6096; //@line 5441
    HEAP32[1526] = 6096; //@line 5442
    HEAP32[1529] = 6104; //@line 5443
    HEAP32[1528] = 6104; //@line 5444
    HEAP32[1531] = 6112; //@line 5445
    HEAP32[1530] = 6112; //@line 5446
    HEAP32[1533] = 6120; //@line 5447
    HEAP32[1532] = 6120; //@line 5448
    HEAP32[1535] = 6128; //@line 5449
    HEAP32[1534] = 6128; //@line 5450
    HEAP32[1537] = 6136; //@line 5451
    HEAP32[1536] = 6136; //@line 5452
    HEAP32[1539] = 6144; //@line 5453
    HEAP32[1538] = 6144; //@line 5454
    HEAP32[1541] = 6152; //@line 5455
    HEAP32[1540] = 6152; //@line 5456
    HEAP32[1543] = 6160; //@line 5457
    HEAP32[1542] = 6160; //@line 5458
    HEAP32[1545] = 6168; //@line 5459
    HEAP32[1544] = 6168; //@line 5460
    HEAP32[1547] = 6176; //@line 5461
    HEAP32[1546] = 6176; //@line 5462
    HEAP32[1549] = 6184; //@line 5463
    HEAP32[1548] = 6184; //@line 5464
    $642 = $$723947$i + -40 | 0; //@line 5465
    $644 = $$748$i + 8 | 0; //@line 5467
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 5472
    $650 = $$748$i + $649 | 0; //@line 5473
    $651 = $642 - $649 | 0; //@line 5474
    HEAP32[1480] = $650; //@line 5475
    HEAP32[1477] = $651; //@line 5476
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 5479
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 5482
    HEAP32[1481] = HEAP32[1596]; //@line 5484
   } else {
    $$024367$i = 6344; //@line 5486
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 5488
     $658 = $$024367$i + 4 | 0; //@line 5489
     $659 = HEAP32[$658 >> 2] | 0; //@line 5490
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 5494
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 5498
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 5503
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 5517
       $673 = (HEAP32[1477] | 0) + $$723947$i | 0; //@line 5519
       $675 = $636 + 8 | 0; //@line 5521
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 5526
       $681 = $636 + $680 | 0; //@line 5527
       $682 = $673 - $680 | 0; //@line 5528
       HEAP32[1480] = $681; //@line 5529
       HEAP32[1477] = $682; //@line 5530
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 5533
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 5536
       HEAP32[1481] = HEAP32[1596]; //@line 5538
       break;
      }
     }
    }
    $688 = HEAP32[1478] | 0; //@line 5543
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1478] = $$748$i; //@line 5546
     $753 = $$748$i; //@line 5547
    } else {
     $753 = $688; //@line 5549
    }
    $690 = $$748$i + $$723947$i | 0; //@line 5551
    $$124466$i = 6344; //@line 5552
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 5557
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 5561
     if (!$694) {
      $$0$i$i$i = 6344; //@line 5564
      break;
     } else {
      $$124466$i = $694; //@line 5567
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 5576
      $700 = $$124466$i + 4 | 0; //@line 5577
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 5580
      $704 = $$748$i + 8 | 0; //@line 5582
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 5588
      $712 = $690 + 8 | 0; //@line 5590
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 5596
      $722 = $710 + $$0197 | 0; //@line 5600
      $723 = $718 - $710 - $$0197 | 0; //@line 5601
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 5604
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1477] | 0) + $723 | 0; //@line 5609
        HEAP32[1477] = $728; //@line 5610
        HEAP32[1480] = $722; //@line 5611
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 5614
       } else {
        if ((HEAP32[1479] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1476] | 0) + $723 | 0; //@line 5620
         HEAP32[1476] = $734; //@line 5621
         HEAP32[1479] = $722; //@line 5622
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 5625
         HEAP32[$722 + $734 >> 2] = $734; //@line 5627
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 5631
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 5635
         $743 = $739 >>> 3; //@line 5636
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 5641
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 5643
           $750 = 5936 + ($743 << 1 << 2) | 0; //@line 5645
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 5651
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 5660
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1474] = HEAP32[1474] & ~(1 << $743); //@line 5670
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 5677
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 5681
             }
             $764 = $748 + 8 | 0; //@line 5684
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 5688
              break;
             }
             _abort(); //@line 5691
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 5696
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 5697
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 5700
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 5702
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 5706
             $783 = $782 + 4 | 0; //@line 5707
             $784 = HEAP32[$783 >> 2] | 0; //@line 5708
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 5711
              if (!$786) {
               $$3$i$i = 0; //@line 5714
               break;
              } else {
               $$1291$i$i = $786; //@line 5717
               $$1293$i$i = $782; //@line 5717
              }
             } else {
              $$1291$i$i = $784; //@line 5720
              $$1293$i$i = $783; //@line 5720
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 5723
              $789 = HEAP32[$788 >> 2] | 0; //@line 5724
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 5727
               $$1293$i$i = $788; //@line 5727
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 5730
              $792 = HEAP32[$791 >> 2] | 0; //@line 5731
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 5736
               $$1293$i$i = $791; //@line 5736
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 5741
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 5744
              $$3$i$i = $$1291$i$i; //@line 5745
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 5750
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 5753
             }
             $776 = $774 + 12 | 0; //@line 5756
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 5760
             }
             $779 = $771 + 8 | 0; //@line 5763
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 5767
              HEAP32[$779 >> 2] = $774; //@line 5768
              $$3$i$i = $771; //@line 5769
              break;
             } else {
              _abort(); //@line 5772
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 5782
           $798 = 6200 + ($797 << 2) | 0; //@line 5783
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 5788
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1475] = HEAP32[1475] & ~(1 << $797); //@line 5797
             break L311;
            } else {
             if ((HEAP32[1478] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 5803
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 5811
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1478] | 0; //@line 5821
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 5824
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 5828
           $815 = $718 + 16 | 0; //@line 5829
           $816 = HEAP32[$815 >> 2] | 0; //@line 5830
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 5836
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 5840
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 5842
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 5848
           if (!$822) {
            break;
           }
           if ((HEAP32[1478] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 5856
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 5860
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 5862
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 5869
         $$0287$i$i = $742 + $723 | 0; //@line 5869
        } else {
         $$0$i17$i = $718; //@line 5871
         $$0287$i$i = $723; //@line 5871
        }
        $830 = $$0$i17$i + 4 | 0; //@line 5873
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 5876
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 5879
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 5881
        $836 = $$0287$i$i >>> 3; //@line 5882
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 5936 + ($836 << 1 << 2) | 0; //@line 5886
         $840 = HEAP32[1474] | 0; //@line 5887
         $841 = 1 << $836; //@line 5888
         do {
          if (!($840 & $841)) {
           HEAP32[1474] = $840 | $841; //@line 5894
           $$0295$i$i = $839; //@line 5896
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 5896
          } else {
           $845 = $839 + 8 | 0; //@line 5898
           $846 = HEAP32[$845 >> 2] | 0; //@line 5899
           if ((HEAP32[1478] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 5903
            $$pre$phi$i19$iZ2D = $845; //@line 5903
            break;
           }
           _abort(); //@line 5906
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 5910
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 5912
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 5914
         HEAP32[$722 + 12 >> 2] = $839; //@line 5916
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 5919
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 5923
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 5927
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 5932
          $858 = $852 << $857; //@line 5933
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 5936
          $863 = $858 << $861; //@line 5938
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 5941
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 5946
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 5952
         }
        } while (0);
        $877 = 6200 + ($$0296$i$i << 2) | 0; //@line 5955
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 5957
        $879 = $722 + 16 | 0; //@line 5958
        HEAP32[$879 + 4 >> 2] = 0; //@line 5960
        HEAP32[$879 >> 2] = 0; //@line 5961
        $881 = HEAP32[1475] | 0; //@line 5962
        $882 = 1 << $$0296$i$i; //@line 5963
        if (!($881 & $882)) {
         HEAP32[1475] = $881 | $882; //@line 5968
         HEAP32[$877 >> 2] = $722; //@line 5969
         HEAP32[$722 + 24 >> 2] = $877; //@line 5971
         HEAP32[$722 + 12 >> 2] = $722; //@line 5973
         HEAP32[$722 + 8 >> 2] = $722; //@line 5975
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 5984
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 5984
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 5991
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 5995
         $902 = HEAP32[$900 >> 2] | 0; //@line 5997
         if (!$902) {
          label = 260; //@line 6000
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 6003
          $$0289$i$i = $902; //@line 6003
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1478] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 6010
         } else {
          HEAP32[$900 >> 2] = $722; //@line 6013
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 6015
          HEAP32[$722 + 12 >> 2] = $722; //@line 6017
          HEAP32[$722 + 8 >> 2] = $722; //@line 6019
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 6024
         $910 = HEAP32[$909 >> 2] | 0; //@line 6025
         $911 = HEAP32[1478] | 0; //@line 6026
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 6032
          HEAP32[$909 >> 2] = $722; //@line 6033
          HEAP32[$722 + 8 >> 2] = $910; //@line 6035
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 6037
          HEAP32[$722 + 24 >> 2] = 0; //@line 6039
          break;
         } else {
          _abort(); //@line 6042
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 6049
      STACKTOP = sp; //@line 6050
      return $$0 | 0; //@line 6050
     } else {
      $$0$i$i$i = 6344; //@line 6052
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 6056
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 6061
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 6069
    }
    $927 = $923 + -47 | 0; //@line 6071
    $929 = $927 + 8 | 0; //@line 6073
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 6079
    $936 = $636 + 16 | 0; //@line 6080
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 6082
    $939 = $938 + 8 | 0; //@line 6083
    $940 = $938 + 24 | 0; //@line 6084
    $941 = $$723947$i + -40 | 0; //@line 6085
    $943 = $$748$i + 8 | 0; //@line 6087
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 6092
    $949 = $$748$i + $948 | 0; //@line 6093
    $950 = $941 - $948 | 0; //@line 6094
    HEAP32[1480] = $949; //@line 6095
    HEAP32[1477] = $950; //@line 6096
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 6099
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 6102
    HEAP32[1481] = HEAP32[1596]; //@line 6104
    $956 = $938 + 4 | 0; //@line 6105
    HEAP32[$956 >> 2] = 27; //@line 6106
    HEAP32[$939 >> 2] = HEAP32[1586]; //@line 6107
    HEAP32[$939 + 4 >> 2] = HEAP32[1587]; //@line 6107
    HEAP32[$939 + 8 >> 2] = HEAP32[1588]; //@line 6107
    HEAP32[$939 + 12 >> 2] = HEAP32[1589]; //@line 6107
    HEAP32[1586] = $$748$i; //@line 6108
    HEAP32[1587] = $$723947$i; //@line 6109
    HEAP32[1589] = 0; //@line 6110
    HEAP32[1588] = $939; //@line 6111
    $958 = $940; //@line 6112
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 6114
     HEAP32[$958 >> 2] = 7; //@line 6115
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 6128
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 6131
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 6134
     HEAP32[$938 >> 2] = $964; //@line 6135
     $969 = $964 >>> 3; //@line 6136
     if ($964 >>> 0 < 256) {
      $972 = 5936 + ($969 << 1 << 2) | 0; //@line 6140
      $973 = HEAP32[1474] | 0; //@line 6141
      $974 = 1 << $969; //@line 6142
      if (!($973 & $974)) {
       HEAP32[1474] = $973 | $974; //@line 6147
       $$0211$i$i = $972; //@line 6149
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 6149
      } else {
       $978 = $972 + 8 | 0; //@line 6151
       $979 = HEAP32[$978 >> 2] | 0; //@line 6152
       if ((HEAP32[1478] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 6156
       } else {
        $$0211$i$i = $979; //@line 6159
        $$pre$phi$i$iZ2D = $978; //@line 6159
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 6162
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 6164
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 6166
      HEAP32[$636 + 12 >> 2] = $972; //@line 6168
      break;
     }
     $985 = $964 >>> 8; //@line 6171
     if (!$985) {
      $$0212$i$i = 0; //@line 6174
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 6178
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 6182
       $991 = $985 << $990; //@line 6183
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 6186
       $996 = $991 << $994; //@line 6188
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 6191
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 6196
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 6202
      }
     }
     $1010 = 6200 + ($$0212$i$i << 2) | 0; //@line 6205
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 6207
     HEAP32[$636 + 20 >> 2] = 0; //@line 6209
     HEAP32[$936 >> 2] = 0; //@line 6210
     $1013 = HEAP32[1475] | 0; //@line 6211
     $1014 = 1 << $$0212$i$i; //@line 6212
     if (!($1013 & $1014)) {
      HEAP32[1475] = $1013 | $1014; //@line 6217
      HEAP32[$1010 >> 2] = $636; //@line 6218
      HEAP32[$636 + 24 >> 2] = $1010; //@line 6220
      HEAP32[$636 + 12 >> 2] = $636; //@line 6222
      HEAP32[$636 + 8 >> 2] = $636; //@line 6224
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 6233
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 6233
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 6240
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 6244
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 6246
      if (!$1034) {
       label = 286; //@line 6249
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 6252
       $$0207$i$i = $1034; //@line 6252
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1478] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 6259
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 6262
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 6264
       HEAP32[$636 + 12 >> 2] = $636; //@line 6266
       HEAP32[$636 + 8 >> 2] = $636; //@line 6268
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 6273
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 6274
      $1043 = HEAP32[1478] | 0; //@line 6275
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 6281
       HEAP32[$1041 >> 2] = $636; //@line 6282
       HEAP32[$636 + 8 >> 2] = $1042; //@line 6284
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 6286
       HEAP32[$636 + 24 >> 2] = 0; //@line 6288
       break;
      } else {
       _abort(); //@line 6291
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1477] | 0; //@line 6298
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 6301
   HEAP32[1477] = $1054; //@line 6302
   $1055 = HEAP32[1480] | 0; //@line 6303
   $1056 = $1055 + $$0197 | 0; //@line 6304
   HEAP32[1480] = $1056; //@line 6305
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 6308
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 6311
   $$0 = $1055 + 8 | 0; //@line 6313
   STACKTOP = sp; //@line 6314
   return $$0 | 0; //@line 6314
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 6318
 $$0 = 0; //@line 6319
 STACKTOP = sp; //@line 6320
 return $$0 | 0; //@line 6320
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10042
 STACKTOP = STACKTOP + 560 | 0; //@line 10043
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 10043
 $6 = sp + 8 | 0; //@line 10044
 $7 = sp; //@line 10045
 $8 = sp + 524 | 0; //@line 10046
 $9 = $8; //@line 10047
 $10 = sp + 512 | 0; //@line 10048
 HEAP32[$7 >> 2] = 0; //@line 10049
 $11 = $10 + 12 | 0; //@line 10050
 ___DOUBLE_BITS_677($1) | 0; //@line 10051
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 10056
  $$0520 = 1; //@line 10056
  $$0521 = 3023; //@line 10056
 } else {
  $$0471 = $1; //@line 10067
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 10067
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 3024 : 3029 : 3026; //@line 10067
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 10069
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 10078
   $31 = $$0520 + 3 | 0; //@line 10083
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 10085
   _out_670($0, $$0521, $$0520); //@line 10086
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 3050 : 3054 : $27 ? 3042 : 3046, 3); //@line 10087
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 10089
   $$sink560 = $31; //@line 10090
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 10093
   $36 = $35 != 0.0; //@line 10094
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 10098
   }
   $39 = $5 | 32; //@line 10100
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 10103
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 10106
    $44 = $$0520 | 2; //@line 10107
    $46 = 12 - $3 | 0; //@line 10109
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 10114
     } else {
      $$0509585 = 8.0; //@line 10116
      $$1508586 = $46; //@line 10116
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 10118
       $$0509585 = $$0509585 * 16.0; //@line 10119
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 10134
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 10139
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 10144
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 10147
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 10150
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 10153
     HEAP8[$68 >> 0] = 48; //@line 10154
     $$0511 = $68; //@line 10155
    } else {
     $$0511 = $66; //@line 10157
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 10164
    $76 = $$0511 + -2 | 0; //@line 10167
    HEAP8[$76 >> 0] = $5 + 15; //@line 10168
    $77 = ($3 | 0) < 1; //@line 10169
    $79 = ($4 & 8 | 0) == 0; //@line 10171
    $$0523 = $8; //@line 10172
    $$2473 = $$1472; //@line 10172
    while (1) {
     $80 = ~~$$2473; //@line 10174
     $86 = $$0523 + 1 | 0; //@line 10180
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[3058 + $80 >> 0]; //@line 10181
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 10184
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 10193
      } else {
       HEAP8[$86 >> 0] = 46; //@line 10196
       $$1524 = $$0523 + 2 | 0; //@line 10197
      }
     } else {
      $$1524 = $86; //@line 10200
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 10204
     }
    }
    $$pre693 = $$1524; //@line 10210
    if (!$3) {
     label = 24; //@line 10212
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 10220
      $$sink = $3 + 2 | 0; //@line 10220
     } else {
      label = 24; //@line 10222
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 10226
     $$pre$phi691Z2D = $101; //@line 10227
     $$sink = $101; //@line 10227
    }
    $104 = $11 - $76 | 0; //@line 10231
    $106 = $104 + $44 + $$sink | 0; //@line 10233
    _pad_676($0, 32, $2, $106, $4); //@line 10234
    _out_670($0, $$0521$, $44); //@line 10235
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 10237
    _out_670($0, $8, $$pre$phi691Z2D); //@line 10238
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 10240
    _out_670($0, $76, $104); //@line 10241
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 10243
    $$sink560 = $106; //@line 10244
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 10248
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 10252
    HEAP32[$7 >> 2] = $113; //@line 10253
    $$3 = $35 * 268435456.0; //@line 10254
    $$pr = $113; //@line 10254
   } else {
    $$3 = $35; //@line 10257
    $$pr = HEAP32[$7 >> 2] | 0; //@line 10257
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 10261
   $$0498 = $$561; //@line 10262
   $$4 = $$3; //@line 10262
   do {
    $116 = ~~$$4 >>> 0; //@line 10264
    HEAP32[$$0498 >> 2] = $116; //@line 10265
    $$0498 = $$0498 + 4 | 0; //@line 10266
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 10269
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 10279
    $$1499662 = $$0498; //@line 10279
    $124 = $$pr; //@line 10279
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 10282
     $$0488655 = $$1499662 + -4 | 0; //@line 10283
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 10286
     } else {
      $$0488657 = $$0488655; //@line 10288
      $$0497656 = 0; //@line 10288
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 10291
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 10293
       $131 = tempRet0; //@line 10294
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 10295
       HEAP32[$$0488657 >> 2] = $132; //@line 10297
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 10298
       $$0488657 = $$0488657 + -4 | 0; //@line 10300
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 10310
      } else {
       $138 = $$1482663 + -4 | 0; //@line 10312
       HEAP32[$138 >> 2] = $$0497656; //@line 10313
       $$2483$ph = $138; //@line 10314
      }
     }
     $$2500 = $$1499662; //@line 10317
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 10323
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 10327
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 10333
     HEAP32[$7 >> 2] = $144; //@line 10334
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 10337
      $$1499662 = $$2500; //@line 10337
      $124 = $144; //@line 10337
     } else {
      $$1482$lcssa = $$2483$ph; //@line 10339
      $$1499$lcssa = $$2500; //@line 10339
      $$pr566 = $144; //@line 10339
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 10344
    $$1499$lcssa = $$0498; //@line 10344
    $$pr566 = $$pr; //@line 10344
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 10350
    $150 = ($39 | 0) == 102; //@line 10351
    $$3484650 = $$1482$lcssa; //@line 10352
    $$3501649 = $$1499$lcssa; //@line 10352
    $152 = $$pr566; //@line 10352
    while (1) {
     $151 = 0 - $152 | 0; //@line 10354
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 10356
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 10360
      $161 = 1e9 >>> $154; //@line 10361
      $$0487644 = 0; //@line 10362
      $$1489643 = $$3484650; //@line 10362
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 10364
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 10368
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 10369
       $$1489643 = $$1489643 + 4 | 0; //@line 10370
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 10381
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 10384
       $$4502 = $$3501649; //@line 10384
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 10387
       $$$3484700 = $$$3484; //@line 10388
       $$4502 = $$3501649 + 4 | 0; //@line 10388
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 10395
      $$4502 = $$3501649; //@line 10395
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 10397
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 10404
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 10406
     HEAP32[$7 >> 2] = $152; //@line 10407
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 10412
      $$3501$lcssa = $$$4502; //@line 10412
      break;
     } else {
      $$3484650 = $$$3484700; //@line 10410
      $$3501649 = $$$4502; //@line 10410
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 10417
    $$3501$lcssa = $$1499$lcssa; //@line 10417
   }
   $185 = $$561; //@line 10420
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 10425
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 10426
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 10429
    } else {
     $$0514639 = $189; //@line 10431
     $$0530638 = 10; //@line 10431
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 10433
      $193 = $$0514639 + 1 | 0; //@line 10434
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 10437
       break;
      } else {
       $$0514639 = $193; //@line 10440
      }
     }
    }
   } else {
    $$1515 = 0; //@line 10445
   }
   $198 = ($39 | 0) == 103; //@line 10450
   $199 = ($$540 | 0) != 0; //@line 10451
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 10454
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 10463
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 10466
    $213 = ($209 | 0) % 9 | 0; //@line 10467
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 10470
     $$1531632 = 10; //@line 10470
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 10473
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 10476
       $$1531632 = $215; //@line 10476
      } else {
       $$1531$lcssa = $215; //@line 10478
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 10483
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 10485
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 10486
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 10489
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 10492
     $$4518 = $$1515; //@line 10492
     $$8 = $$3484$lcssa; //@line 10492
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 10497
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 10498
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 10503
     if (!$$0520) {
      $$1467 = $$$564; //@line 10506
      $$1469 = $$543; //@line 10506
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 10509
      $$1467 = $230 ? -$$$564 : $$$564; //@line 10514
      $$1469 = $230 ? -$$543 : $$543; //@line 10514
     }
     $233 = $217 - $218 | 0; //@line 10516
     HEAP32[$212 >> 2] = $233; //@line 10517
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 10521
      HEAP32[$212 >> 2] = $236; //@line 10522
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 10525
       $$sink547625 = $212; //@line 10525
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 10527
        HEAP32[$$sink547625 >> 2] = 0; //@line 10528
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 10531
         HEAP32[$240 >> 2] = 0; //@line 10532
         $$6 = $240; //@line 10533
        } else {
         $$6 = $$5486626; //@line 10535
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 10538
        HEAP32[$238 >> 2] = $242; //@line 10539
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 10542
         $$sink547625 = $238; //@line 10542
        } else {
         $$5486$lcssa = $$6; //@line 10544
         $$sink547$lcssa = $238; //@line 10544
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 10549
       $$sink547$lcssa = $212; //@line 10549
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 10554
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 10555
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 10558
       $$4518 = $247; //@line 10558
       $$8 = $$5486$lcssa; //@line 10558
      } else {
       $$2516621 = $247; //@line 10560
       $$2532620 = 10; //@line 10560
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 10562
        $251 = $$2516621 + 1 | 0; //@line 10563
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 10566
         $$4518 = $251; //@line 10566
         $$8 = $$5486$lcssa; //@line 10566
         break;
        } else {
         $$2516621 = $251; //@line 10569
        }
       }
      }
     } else {
      $$4492 = $212; //@line 10574
      $$4518 = $$1515; //@line 10574
      $$8 = $$3484$lcssa; //@line 10574
     }
    }
    $253 = $$4492 + 4 | 0; //@line 10577
    $$5519$ph = $$4518; //@line 10580
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 10580
    $$9$ph = $$8; //@line 10580
   } else {
    $$5519$ph = $$1515; //@line 10582
    $$7505$ph = $$3501$lcssa; //@line 10582
    $$9$ph = $$3484$lcssa; //@line 10582
   }
   $$7505 = $$7505$ph; //@line 10584
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 10588
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 10591
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 10595
    } else {
     $$lcssa675 = 1; //@line 10597
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 10601
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 10606
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 10614
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 10614
     } else {
      $$0479 = $5 + -2 | 0; //@line 10618
      $$2476 = $$540$ + -1 | 0; //@line 10618
     }
     $267 = $4 & 8; //@line 10620
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 10625
       if (!$270) {
        $$2529 = 9; //@line 10628
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 10633
         $$3533616 = 10; //@line 10633
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 10635
          $275 = $$1528617 + 1 | 0; //@line 10636
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 10642
           break;
          } else {
           $$1528617 = $275; //@line 10640
          }
         }
        } else {
         $$2529 = 0; //@line 10647
        }
       }
      } else {
       $$2529 = 9; //@line 10651
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 10659
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 10661
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 10663
       $$1480 = $$0479; //@line 10666
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 10666
       $$pre$phi698Z2D = 0; //@line 10666
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 10670
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 10672
       $$1480 = $$0479; //@line 10675
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 10675
       $$pre$phi698Z2D = 0; //@line 10675
       break;
      }
     } else {
      $$1480 = $$0479; //@line 10679
      $$3477 = $$2476; //@line 10679
      $$pre$phi698Z2D = $267; //@line 10679
     }
    } else {
     $$1480 = $5; //@line 10683
     $$3477 = $$540; //@line 10683
     $$pre$phi698Z2D = $4 & 8; //@line 10683
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 10686
   $294 = ($292 | 0) != 0 & 1; //@line 10688
   $296 = ($$1480 | 32 | 0) == 102; //@line 10690
   if ($296) {
    $$2513 = 0; //@line 10694
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 10694
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 10697
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 10700
    $304 = $11; //@line 10701
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 10706
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 10708
      HEAP8[$308 >> 0] = 48; //@line 10709
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 10714
      } else {
       $$1512$lcssa = $308; //@line 10716
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 10721
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 10728
    $318 = $$1512$lcssa + -2 | 0; //@line 10730
    HEAP8[$318 >> 0] = $$1480; //@line 10731
    $$2513 = $318; //@line 10734
    $$pn = $304 - $318 | 0; //@line 10734
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 10739
   _pad_676($0, 32, $2, $323, $4); //@line 10740
   _out_670($0, $$0521, $$0520); //@line 10741
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 10743
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 10746
    $326 = $8 + 9 | 0; //@line 10747
    $327 = $326; //@line 10748
    $328 = $8 + 8 | 0; //@line 10749
    $$5493600 = $$0496$$9; //@line 10750
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 10753
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 10758
       $$1465 = $328; //@line 10759
      } else {
       $$1465 = $330; //@line 10761
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 10768
       $$0464597 = $330; //@line 10769
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 10771
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 10774
        } else {
         $$1465 = $335; //@line 10776
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 10781
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 10786
     $$5493600 = $$5493600 + 4 | 0; //@line 10787
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 3074, 1); //@line 10797
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 10803
     $$6494592 = $$5493600; //@line 10803
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 10806
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 10811
       $$0463587 = $347; //@line 10812
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 10814
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 10817
        } else {
         $$0463$lcssa = $351; //@line 10819
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 10824
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 10828
      $$6494592 = $$6494592 + 4 | 0; //@line 10829
      $356 = $$4478593 + -9 | 0; //@line 10830
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 10837
       break;
      } else {
       $$4478593 = $356; //@line 10835
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 10842
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 10845
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 10848
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 10851
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 10852
     $365 = $363; //@line 10853
     $366 = 0 - $9 | 0; //@line 10854
     $367 = $8 + 8 | 0; //@line 10855
     $$5605 = $$3477; //@line 10856
     $$7495604 = $$9$ph; //@line 10856
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 10859
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 10862
       $$0 = $367; //@line 10863
      } else {
       $$0 = $369; //@line 10865
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 10870
        _out_670($0, $$0, 1); //@line 10871
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 10875
         break;
        }
        _out_670($0, 3074, 1); //@line 10878
        $$2 = $375; //@line 10879
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 10883
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 10888
        $$1601 = $$0; //@line 10889
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 10891
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 10894
         } else {
          $$2 = $373; //@line 10896
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 10903
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 10906
      $381 = $$5605 - $378 | 0; //@line 10907
      $$7495604 = $$7495604 + 4 | 0; //@line 10908
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 10915
       break;
      } else {
       $$5605 = $381; //@line 10913
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 10920
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 10923
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 10927
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 10930
   $$sink560 = $323; //@line 10931
  }
 } while (0);
 STACKTOP = sp; //@line 10936
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 10936
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 8614
 STACKTOP = STACKTOP + 64 | 0; //@line 8615
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 8615
 $5 = sp + 16 | 0; //@line 8616
 $6 = sp; //@line 8617
 $7 = sp + 24 | 0; //@line 8618
 $8 = sp + 8 | 0; //@line 8619
 $9 = sp + 20 | 0; //@line 8620
 HEAP32[$5 >> 2] = $1; //@line 8621
 $10 = ($0 | 0) != 0; //@line 8622
 $11 = $7 + 40 | 0; //@line 8623
 $12 = $11; //@line 8624
 $13 = $7 + 39 | 0; //@line 8625
 $14 = $8 + 4 | 0; //@line 8626
 $$0243 = 0; //@line 8627
 $$0247 = 0; //@line 8627
 $$0269 = 0; //@line 8627
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 8636
     $$1248 = -1; //@line 8637
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 8641
     break;
    }
   } else {
    $$1248 = $$0247; //@line 8645
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 8648
  $21 = HEAP8[$20 >> 0] | 0; //@line 8649
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 8652
   break;
  } else {
   $23 = $21; //@line 8655
   $25 = $20; //@line 8655
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 8660
     $27 = $25; //@line 8660
     label = 9; //@line 8661
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 8666
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 8673
   HEAP32[$5 >> 2] = $24; //@line 8674
   $23 = HEAP8[$24 >> 0] | 0; //@line 8676
   $25 = $24; //@line 8676
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 8681
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 8686
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 8689
     $27 = $27 + 2 | 0; //@line 8690
     HEAP32[$5 >> 2] = $27; //@line 8691
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 8698
      break;
     } else {
      $$0249303 = $30; //@line 8695
      label = 9; //@line 8696
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 8706
  if ($10) {
   _out_670($0, $20, $36); //@line 8708
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 8712
   $$0247 = $$1248; //@line 8712
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 8720
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 8721
  if ($43) {
   $$0253 = -1; //@line 8723
   $$1270 = $$0269; //@line 8723
   $$sink = 1; //@line 8723
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 8733
    $$1270 = 1; //@line 8733
    $$sink = 3; //@line 8733
   } else {
    $$0253 = -1; //@line 8735
    $$1270 = $$0269; //@line 8735
    $$sink = 1; //@line 8735
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 8738
  HEAP32[$5 >> 2] = $51; //@line 8739
  $52 = HEAP8[$51 >> 0] | 0; //@line 8740
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 8742
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 8749
   $$lcssa291 = $52; //@line 8749
   $$lcssa292 = $51; //@line 8749
  } else {
   $$0262309 = 0; //@line 8751
   $60 = $52; //@line 8751
   $65 = $51; //@line 8751
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 8756
    $64 = $65 + 1 | 0; //@line 8757
    HEAP32[$5 >> 2] = $64; //@line 8758
    $66 = HEAP8[$64 >> 0] | 0; //@line 8759
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 8761
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 8768
     $$lcssa291 = $66; //@line 8768
     $$lcssa292 = $64; //@line 8768
     break;
    } else {
     $$0262309 = $63; //@line 8771
     $60 = $66; //@line 8771
     $65 = $64; //@line 8771
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 8783
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 8785
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 8790
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 8795
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 8807
     $$2271 = 1; //@line 8807
     $storemerge274 = $79 + 3 | 0; //@line 8807
    } else {
     label = 23; //@line 8809
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 8813
    if ($$1270 | 0) {
     $$0 = -1; //@line 8816
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8831
     $106 = HEAP32[$105 >> 2] | 0; //@line 8832
     HEAP32[$2 >> 2] = $105 + 4; //@line 8834
     $363 = $106; //@line 8835
    } else {
     $363 = 0; //@line 8837
    }
    $$0259 = $363; //@line 8841
    $$2271 = 0; //@line 8841
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 8841
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 8843
   $109 = ($$0259 | 0) < 0; //@line 8844
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 8849
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 8849
   $$3272 = $$2271; //@line 8849
   $115 = $storemerge274; //@line 8849
  } else {
   $112 = _getint_671($5) | 0; //@line 8851
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 8854
    break;
   }
   $$1260 = $112; //@line 8858
   $$1263 = $$0262$lcssa; //@line 8858
   $$3272 = $$1270; //@line 8858
   $115 = HEAP32[$5 >> 2] | 0; //@line 8858
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 8869
     $156 = _getint_671($5) | 0; //@line 8870
     $$0254 = $156; //@line 8872
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 8872
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 8881
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 8886
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 8891
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 8898
      $144 = $125 + 4 | 0; //@line 8902
      HEAP32[$5 >> 2] = $144; //@line 8903
      $$0254 = $140; //@line 8904
      $$pre345 = $144; //@line 8904
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 8910
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8925
     $152 = HEAP32[$151 >> 2] | 0; //@line 8926
     HEAP32[$2 >> 2] = $151 + 4; //@line 8928
     $364 = $152; //@line 8929
    } else {
     $364 = 0; //@line 8931
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 8934
    HEAP32[$5 >> 2] = $154; //@line 8935
    $$0254 = $364; //@line 8936
    $$pre345 = $154; //@line 8936
   } else {
    $$0254 = -1; //@line 8938
    $$pre345 = $115; //@line 8938
   }
  } while (0);
  $$0252 = 0; //@line 8941
  $158 = $$pre345; //@line 8941
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 8948
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 8951
   HEAP32[$5 >> 2] = $158; //@line 8952
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (2542 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 8957
   $168 = $167 & 255; //@line 8958
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 8962
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 8969
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 8973
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 8977
     break L1;
    } else {
     label = 50; //@line 8980
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 8985
     $176 = $3 + ($$0253 << 3) | 0; //@line 8987
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 8992
     $182 = $6; //@line 8993
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 8995
     HEAP32[$182 + 4 >> 2] = $181; //@line 8998
     label = 50; //@line 8999
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 9003
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 9006
    $187 = HEAP32[$5 >> 2] | 0; //@line 9008
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 9012
   if ($10) {
    $187 = $158; //@line 9014
   } else {
    $$0243 = 0; //@line 9016
    $$0247 = $$1248; //@line 9016
    $$0269 = $$3272; //@line 9016
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 9022
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 9028
  $196 = $$1263 & -65537; //@line 9031
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 9032
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9040
       $$0243 = 0; //@line 9041
       $$0247 = $$1248; //@line 9041
       $$0269 = $$3272; //@line 9041
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9047
       $$0243 = 0; //@line 9048
       $$0247 = $$1248; //@line 9048
       $$0269 = $$3272; //@line 9048
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 9056
       HEAP32[$208 >> 2] = $$1248; //@line 9058
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 9061
       $$0243 = 0; //@line 9062
       $$0247 = $$1248; //@line 9062
       $$0269 = $$3272; //@line 9062
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 9069
       $$0243 = 0; //@line 9070
       $$0247 = $$1248; //@line 9070
       $$0269 = $$3272; //@line 9070
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 9077
       $$0243 = 0; //@line 9078
       $$0247 = $$1248; //@line 9078
       $$0269 = $$3272; //@line 9078
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9084
       $$0243 = 0; //@line 9085
       $$0247 = $$1248; //@line 9085
       $$0269 = $$3272; //@line 9085
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 9093
       HEAP32[$220 >> 2] = $$1248; //@line 9095
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 9098
       $$0243 = 0; //@line 9099
       $$0247 = $$1248; //@line 9099
       $$0269 = $$3272; //@line 9099
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 9104
       $$0247 = $$1248; //@line 9104
       $$0269 = $$3272; //@line 9104
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 9114
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 9114
     $$3265 = $$1263$ | 8; //@line 9114
     label = 62; //@line 9115
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 9119
     $$1255 = $$0254; //@line 9119
     $$3265 = $$1263$; //@line 9119
     label = 62; //@line 9120
     break;
    }
   case 111:
    {
     $242 = $6; //@line 9124
     $244 = HEAP32[$242 >> 2] | 0; //@line 9126
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 9129
     $248 = _fmt_o($244, $247, $11) | 0; //@line 9130
     $252 = $12 - $248 | 0; //@line 9134
     $$0228 = $248; //@line 9139
     $$1233 = 0; //@line 9139
     $$1238 = 3006; //@line 9139
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 9139
     $$4266 = $$1263$; //@line 9139
     $281 = $244; //@line 9139
     $283 = $247; //@line 9139
     label = 68; //@line 9140
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 9144
     $258 = HEAP32[$256 >> 2] | 0; //@line 9146
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 9149
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 9152
      $264 = tempRet0; //@line 9153
      $265 = $6; //@line 9154
      HEAP32[$265 >> 2] = $263; //@line 9156
      HEAP32[$265 + 4 >> 2] = $264; //@line 9159
      $$0232 = 1; //@line 9160
      $$0237 = 3006; //@line 9160
      $275 = $263; //@line 9160
      $276 = $264; //@line 9160
      label = 67; //@line 9161
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 9173
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 3006 : 3008 : 3007; //@line 9173
      $275 = $258; //@line 9173
      $276 = $261; //@line 9173
      label = 67; //@line 9174
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 9180
     $$0232 = 0; //@line 9186
     $$0237 = 3006; //@line 9186
     $275 = HEAP32[$197 >> 2] | 0; //@line 9186
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 9186
     label = 67; //@line 9187
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 9198
     $$2 = $13; //@line 9199
     $$2234 = 0; //@line 9199
     $$2239 = 3006; //@line 9199
     $$2251 = $11; //@line 9199
     $$5 = 1; //@line 9199
     $$6268 = $196; //@line 9199
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 9206
     label = 72; //@line 9207
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 9211
     $$1 = $302 | 0 ? $302 : 3016; //@line 9214
     label = 72; //@line 9215
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 9225
     HEAP32[$14 >> 2] = 0; //@line 9226
     HEAP32[$6 >> 2] = $8; //@line 9227
     $$4258354 = -1; //@line 9228
     $365 = $8; //@line 9228
     label = 76; //@line 9229
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 9233
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 9236
      $$0240$lcssa356 = 0; //@line 9237
      label = 85; //@line 9238
     } else {
      $$4258354 = $$0254; //@line 9240
      $365 = $$pre348; //@line 9240
      label = 76; //@line 9241
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 9248
     $$0247 = $$1248; //@line 9248
     $$0269 = $$3272; //@line 9248
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 9253
     $$2234 = 0; //@line 9253
     $$2239 = 3006; //@line 9253
     $$2251 = $11; //@line 9253
     $$5 = $$0254; //@line 9253
     $$6268 = $$1263$; //@line 9253
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 9259
    $227 = $6; //@line 9260
    $229 = HEAP32[$227 >> 2] | 0; //@line 9262
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 9265
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 9267
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 9273
    $$0228 = $234; //@line 9278
    $$1233 = $or$cond278 ? 0 : 2; //@line 9278
    $$1238 = $or$cond278 ? 3006 : 3006 + ($$1236 >> 4) | 0; //@line 9278
    $$2256 = $$1255; //@line 9278
    $$4266 = $$3265; //@line 9278
    $281 = $229; //@line 9278
    $283 = $232; //@line 9278
    label = 68; //@line 9279
   } else if ((label | 0) == 67) {
    label = 0; //@line 9282
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 9284
    $$1233 = $$0232; //@line 9284
    $$1238 = $$0237; //@line 9284
    $$2256 = $$0254; //@line 9284
    $$4266 = $$1263$; //@line 9284
    $281 = $275; //@line 9284
    $283 = $276; //@line 9284
    label = 68; //@line 9285
   } else if ((label | 0) == 72) {
    label = 0; //@line 9288
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 9289
    $306 = ($305 | 0) == 0; //@line 9290
    $$2 = $$1; //@line 9297
    $$2234 = 0; //@line 9297
    $$2239 = 3006; //@line 9297
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 9297
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 9297
    $$6268 = $196; //@line 9297
   } else if ((label | 0) == 76) {
    label = 0; //@line 9300
    $$0229316 = $365; //@line 9301
    $$0240315 = 0; //@line 9301
    $$1244314 = 0; //@line 9301
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 9303
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 9306
      $$2245 = $$1244314; //@line 9306
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 9309
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 9315
      $$2245 = $320; //@line 9315
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 9319
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 9322
      $$0240315 = $325; //@line 9322
      $$1244314 = $320; //@line 9322
     } else {
      $$0240$lcssa = $325; //@line 9324
      $$2245 = $320; //@line 9324
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 9330
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 9333
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 9336
     label = 85; //@line 9337
    } else {
     $$1230327 = $365; //@line 9339
     $$1241326 = 0; //@line 9339
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 9341
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9344
       label = 85; //@line 9345
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 9348
      $$1241326 = $331 + $$1241326 | 0; //@line 9349
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9352
       label = 85; //@line 9353
       break L97;
      }
      _out_670($0, $9, $331); //@line 9357
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9362
       label = 85; //@line 9363
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 9360
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 9371
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 9377
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 9379
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 9384
   $$2 = $or$cond ? $$0228 : $11; //@line 9389
   $$2234 = $$1233; //@line 9389
   $$2239 = $$1238; //@line 9389
   $$2251 = $11; //@line 9389
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 9389
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 9389
  } else if ((label | 0) == 85) {
   label = 0; //@line 9392
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 9394
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 9397
   $$0247 = $$1248; //@line 9397
   $$0269 = $$3272; //@line 9397
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 9402
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 9404
  $345 = $$$5 + $$2234 | 0; //@line 9405
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 9407
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 9408
  _out_670($0, $$2239, $$2234); //@line 9409
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 9411
  _pad_676($0, 48, $$$5, $343, 0); //@line 9412
  _out_670($0, $$2, $343); //@line 9413
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 9415
  $$0243 = $$2261; //@line 9416
  $$0247 = $$1248; //@line 9416
  $$0269 = $$3272; //@line 9416
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 9424
    } else {
     $$2242302 = 1; //@line 9426
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 9429
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 9432
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 9436
      $356 = $$2242302 + 1 | 0; //@line 9437
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 9440
      } else {
       $$2242$lcssa = $356; //@line 9442
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 9448
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 9454
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 9460
       } else {
        $$0 = 1; //@line 9462
        break;
       }
      }
     } else {
      $$0 = 1; //@line 9467
     }
    }
   } else {
    $$0 = $$1248; //@line 9471
   }
  }
 } while (0);
 STACKTOP = sp; //@line 9475
 return $$0 | 0; //@line 9475
}
function _mbed_vtracef($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$0199 = 0, $$1$off0 = 0, $$10 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$13 = 0, $$18 = 0, $$3 = 0, $$3147 = 0, $$3147168 = 0, $$3154 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$6 = 0, $$6150 = 0, $$9 = 0, $$lobit = 0, $$pre = 0, $$sink = 0, $125 = 0, $126 = 0, $151 = 0, $157 = 0, $168 = 0, $169 = 0, $171 = 0, $181 = 0, $182 = 0, $184 = 0, $186 = 0, $194 = 0, $201 = 0, $202 = 0, $204 = 0, $206 = 0, $209 = 0, $34 = 0, $38 = 0, $4 = 0, $43 = 0, $5 = 0, $54 = 0, $55 = 0, $59 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $69 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $76 = 0, $78 = 0, $82 = 0, $89 = 0, $95 = 0, $AsyncCtx = 0, $AsyncCtx27 = 0, $AsyncCtx30 = 0, $AsyncCtx34 = 0, $AsyncCtx38 = 0, $AsyncCtx42 = 0, $AsyncCtx45 = 0, $AsyncCtx49 = 0, $AsyncCtx52 = 0, $AsyncCtx56 = 0, $AsyncCtx60 = 0, $AsyncCtx64 = 0, $extract$t159 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer12 = 0, $vararg_buffer15 = 0, $vararg_buffer18 = 0, $vararg_buffer20 = 0, $vararg_buffer23 = 0, $vararg_buffer3 = 0, $vararg_buffer6 = 0, $vararg_buffer9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 808
 STACKTOP = STACKTOP + 96 | 0; //@line 809
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(96); //@line 809
 $vararg_buffer23 = sp + 72 | 0; //@line 810
 $vararg_buffer20 = sp + 64 | 0; //@line 811
 $vararg_buffer18 = sp + 56 | 0; //@line 812
 $vararg_buffer15 = sp + 48 | 0; //@line 813
 $vararg_buffer12 = sp + 40 | 0; //@line 814
 $vararg_buffer9 = sp + 32 | 0; //@line 815
 $vararg_buffer6 = sp + 24 | 0; //@line 816
 $vararg_buffer3 = sp + 16 | 0; //@line 817
 $vararg_buffer1 = sp + 8 | 0; //@line 818
 $vararg_buffer = sp; //@line 819
 $4 = sp + 80 | 0; //@line 820
 $5 = HEAP32[93] | 0; //@line 821
 do {
  if ($5 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(104, sp) | 0; //@line 825
   FUNCTION_TABLE_v[$5 & 15](); //@line 826
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 46; //@line 829
    HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer3; //@line 831
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 833
    HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer23; //@line 835
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer23; //@line 837
    HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 839
    HEAP8[$AsyncCtx + 24 >> 0] = $0; //@line 841
    HEAP32[$AsyncCtx + 28 >> 2] = $2; //@line 843
    HEAP32[$AsyncCtx + 32 >> 2] = $3; //@line 845
    HEAP32[$AsyncCtx + 36 >> 2] = $vararg_buffer12; //@line 847
    HEAP32[$AsyncCtx + 40 >> 2] = $vararg_buffer12; //@line 849
    HEAP32[$AsyncCtx + 44 >> 2] = $vararg_buffer15; //@line 851
    HEAP32[$AsyncCtx + 48 >> 2] = $vararg_buffer15; //@line 853
    HEAP32[$AsyncCtx + 52 >> 2] = $vararg_buffer18; //@line 855
    HEAP32[$AsyncCtx + 56 >> 2] = $vararg_buffer18; //@line 857
    HEAP32[$AsyncCtx + 60 >> 2] = $vararg_buffer6; //@line 859
    HEAP32[$AsyncCtx + 64 >> 2] = $vararg_buffer6; //@line 861
    HEAP32[$AsyncCtx + 68 >> 2] = $vararg_buffer9; //@line 863
    HEAP32[$AsyncCtx + 72 >> 2] = $vararg_buffer9; //@line 865
    HEAP32[$AsyncCtx + 76 >> 2] = $vararg_buffer1; //@line 867
    HEAP32[$AsyncCtx + 80 >> 2] = $vararg_buffer1; //@line 869
    HEAP32[$AsyncCtx + 84 >> 2] = $vararg_buffer20; //@line 871
    HEAP32[$AsyncCtx + 88 >> 2] = $vararg_buffer20; //@line 873
    HEAP32[$AsyncCtx + 92 >> 2] = $4; //@line 875
    HEAP32[$AsyncCtx + 96 >> 2] = $vararg_buffer; //@line 877
    HEAP32[$AsyncCtx + 100 >> 2] = $vararg_buffer; //@line 879
    sp = STACKTOP; //@line 880
    STACKTOP = sp; //@line 881
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 883
    HEAP32[95] = (HEAP32[95] | 0) + 1; //@line 886
    break;
   }
  }
 } while (0);
 $34 = HEAP32[84] | 0; //@line 891
 do {
  if ($34 | 0) {
   HEAP8[$34 >> 0] = 0; //@line 895
   do {
    if ($0 << 24 >> 24 > -1 & ($1 | 0) != 0) {
     $38 = HEAP32[81] | 0; //@line 901
     if (HEAP8[$38 >> 0] | 0) {
      if (_strstr($38, $1) | 0) {
       $$0$i = 1; //@line 908
       break;
      }
     }
     $43 = HEAP32[82] | 0; //@line 912
     if (!(HEAP8[$43 >> 0] | 0)) {
      label = 11; //@line 916
     } else {
      if (!(_strstr($43, $1) | 0)) {
       $$0$i = 1; //@line 921
      } else {
       label = 11; //@line 923
      }
     }
    } else {
     label = 11; //@line 927
    }
   } while (0);
   if ((label | 0) == 11) {
    $$0$i = 0; //@line 931
   }
   if (!((HEAP32[91] | 0) != 0 & ((($1 | 0) == 0 | (($2 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[88] = HEAP32[86]; //@line 943
    break;
   }
   $54 = HEAPU8[320] | 0; //@line 947
   $55 = $0 & 255; //@line 948
   if ($55 & 31 & $54 | 0) {
    $59 = $54 & 64; //@line 953
    $$lobit = $59 >>> 6; //@line 954
    $60 = $$lobit & 255; //@line 955
    $64 = ($54 & 32 | 0) == 0; //@line 959
    $65 = HEAP32[85] | 0; //@line 960
    $66 = HEAP32[84] | 0; //@line 961
    $67 = $0 << 24 >> 24 == 1; //@line 962
    do {
     if ($67 | ($54 & 128 | 0) != 0) {
      $AsyncCtx64 = _emscripten_alloc_async_context(8, sp) | 0; //@line 966
      _vsnprintf($66, $65, $2, $3) | 0; //@line 967
      if (___async) {
       HEAP32[$AsyncCtx64 >> 2] = 47; //@line 970
       HEAP8[$AsyncCtx64 + 4 >> 0] = $67 & 1; //@line 973
       sp = STACKTOP; //@line 974
       STACKTOP = sp; //@line 975
       return;
      }
      _emscripten_free_async_context($AsyncCtx64 | 0); //@line 977
      $69 = HEAP32[92] | 0; //@line 978
      if (!($67 & ($69 | 0) != 0)) {
       $73 = HEAP32[91] | 0; //@line 982
       $74 = HEAP32[84] | 0; //@line 983
       $AsyncCtx34 = _emscripten_alloc_async_context(4, sp) | 0; //@line 984
       FUNCTION_TABLE_vi[$73 & 255]($74); //@line 985
       if (___async) {
        HEAP32[$AsyncCtx34 >> 2] = 50; //@line 988
        sp = STACKTOP; //@line 989
        STACKTOP = sp; //@line 990
        return;
       } else {
        _emscripten_free_async_context($AsyncCtx34 | 0); //@line 992
        break;
       }
      }
      $71 = HEAP32[84] | 0; //@line 996
      $AsyncCtx27 = _emscripten_alloc_async_context(4, sp) | 0; //@line 997
      FUNCTION_TABLE_vi[$69 & 255]($71); //@line 998
      if (___async) {
       HEAP32[$AsyncCtx27 >> 2] = 48; //@line 1001
       sp = STACKTOP; //@line 1002
       STACKTOP = sp; //@line 1003
       return;
      }
      _emscripten_free_async_context($AsyncCtx27 | 0); //@line 1005
      $72 = HEAP32[92] | 0; //@line 1006
      $AsyncCtx30 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1007
      FUNCTION_TABLE_vi[$72 & 255](1684); //@line 1008
      if (___async) {
       HEAP32[$AsyncCtx30 >> 2] = 49; //@line 1011
       sp = STACKTOP; //@line 1012
       STACKTOP = sp; //@line 1013
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx30 | 0); //@line 1015
       break;
      }
     } else {
      if (!$59) {
       $$1$off0 = ($$lobit | 0) != 0; //@line 1022
       $$1143 = $66; //@line 1022
       $$1145 = $65; //@line 1022
       $$3154 = 0; //@line 1022
       label = 38; //@line 1023
      } else {
       if ($64) {
        $$0142 = $66; //@line 1026
        $$0144 = $65; //@line 1026
       } else {
        $76 = _snprintf($66, $65, 1686, $vararg_buffer) | 0; //@line 1028
        $$ = ($76 | 0) >= ($65 | 0) ? 0 : $76; //@line 1030
        $78 = ($$ | 0) > 0; //@line 1031
        $$0142 = $78 ? $66 + $$ | 0 : $66; //@line 1036
        $$0144 = $65 - ($78 ? $$ : 0) | 0; //@line 1036
       }
       if (($$0144 | 0) > 0) {
        $82 = $55 + -2 | 0; //@line 1040
        switch ($82 >>> 1 | $82 << 31 | 0) {
        case 0:
         {
          $$sink = 1704; //@line 1046
          label = 35; //@line 1047
          break;
         }
        case 1:
         {
          $$sink = 1710; //@line 1051
          label = 35; //@line 1052
          break;
         }
        case 3:
         {
          $$sink = 1698; //@line 1056
          label = 35; //@line 1057
          break;
         }
        case 7:
         {
          $$sink = 1692; //@line 1061
          label = 35; //@line 1062
          break;
         }
        default:
         {
          $$0141 = 0; //@line 1066
          $$1152 = 0; //@line 1066
         }
        }
        if ((label | 0) == 35) {
         HEAP32[$vararg_buffer1 >> 2] = $$sink; //@line 1070
         $$0141 = $60 & 1; //@line 1073
         $$1152 = _snprintf($$0142, $$0144, 1716, $vararg_buffer1) | 0; //@line 1073
        }
        $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 1076
        $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 1078
        if (($$1152$ | 0) > 0) {
         $89 = $$0141 << 24 >> 24 == 0; //@line 1080
         $$1$off0 = $extract$t159; //@line 1085
         $$1143 = $89 ? $$0142 : $$0142 + $$1152$ | 0; //@line 1085
         $$1145 = $$0144 - ($89 ? 0 : $$1152$) | 0; //@line 1085
         $$3154 = $$1152; //@line 1085
         label = 38; //@line 1086
        } else {
         $$1$off0 = $extract$t159; //@line 1088
         $$1143 = $$0142; //@line 1088
         $$1145 = $$0144; //@line 1088
         $$3154 = $$1152$; //@line 1088
         label = 38; //@line 1089
        }
       }
      }
      L54 : do {
       if ((label | 0) == 38) {
        do {
         if (($$1145 | 0) > 0 & (HEAP32[89] | 0) != 0) {
          HEAP32[$4 >> 2] = HEAP32[$3 >> 2]; //@line 1102
          $AsyncCtx60 = _emscripten_alloc_async_context(104, sp) | 0; //@line 1103
          $95 = _vsnprintf(0, 0, $2, $4) | 0; //@line 1104
          if (___async) {
           HEAP32[$AsyncCtx60 >> 2] = 51; //@line 1107
           HEAP32[$AsyncCtx60 + 4 >> 2] = $vararg_buffer3; //@line 1109
           HEAP32[$AsyncCtx60 + 8 >> 2] = $$1143; //@line 1111
           HEAP32[$AsyncCtx60 + 12 >> 2] = $$1145; //@line 1113
           HEAP32[$AsyncCtx60 + 16 >> 2] = $vararg_buffer3; //@line 1115
           HEAP32[$AsyncCtx60 + 20 >> 2] = $4; //@line 1117
           HEAP32[$AsyncCtx60 + 24 >> 2] = $vararg_buffer23; //@line 1119
           HEAP32[$AsyncCtx60 + 28 >> 2] = $vararg_buffer23; //@line 1121
           HEAP32[$AsyncCtx60 + 32 >> 2] = $vararg_buffer20; //@line 1123
           HEAP32[$AsyncCtx60 + 36 >> 2] = $vararg_buffer20; //@line 1125
           HEAP8[$AsyncCtx60 + 40 >> 0] = $$1$off0 & 1; //@line 1128
           HEAP32[$AsyncCtx60 + 44 >> 2] = $2; //@line 1130
           HEAP32[$AsyncCtx60 + 48 >> 2] = $3; //@line 1132
           HEAP32[$AsyncCtx60 + 52 >> 2] = $vararg_buffer12; //@line 1134
           HEAP32[$AsyncCtx60 + 56 >> 2] = $1; //@line 1136
           HEAP32[$AsyncCtx60 + 60 >> 2] = $vararg_buffer12; //@line 1138
           HEAP32[$AsyncCtx60 + 64 >> 2] = $vararg_buffer15; //@line 1140
           HEAP32[$AsyncCtx60 + 68 >> 2] = $vararg_buffer15; //@line 1142
           HEAP32[$AsyncCtx60 + 72 >> 2] = $vararg_buffer18; //@line 1144
           HEAP32[$AsyncCtx60 + 76 >> 2] = $vararg_buffer18; //@line 1146
           HEAP32[$AsyncCtx60 + 80 >> 2] = $55; //@line 1148
           HEAP32[$AsyncCtx60 + 84 >> 2] = $vararg_buffer6; //@line 1150
           HEAP32[$AsyncCtx60 + 88 >> 2] = $vararg_buffer6; //@line 1152
           HEAP32[$AsyncCtx60 + 92 >> 2] = $vararg_buffer9; //@line 1154
           HEAP32[$AsyncCtx60 + 96 >> 2] = $vararg_buffer9; //@line 1156
           HEAP32[$AsyncCtx60 + 100 >> 2] = $$3154; //@line 1158
           sp = STACKTOP; //@line 1159
           STACKTOP = sp; //@line 1160
           return;
          }
          _emscripten_free_async_context($AsyncCtx60 | 0); //@line 1162
          $125 = HEAP32[89] | 0; //@line 1167
          $AsyncCtx38 = _emscripten_alloc_async_context(100, sp) | 0; //@line 1168
          $126 = FUNCTION_TABLE_ii[$125 & 1](($$3154 | 0 ? 4 : 0) + $$3154 + $95 | 0) | 0; //@line 1169
          if (___async) {
           HEAP32[$AsyncCtx38 >> 2] = 52; //@line 1172
           HEAP32[$AsyncCtx38 + 4 >> 2] = $vararg_buffer3; //@line 1174
           HEAP32[$AsyncCtx38 + 8 >> 2] = $$1143; //@line 1176
           HEAP32[$AsyncCtx38 + 12 >> 2] = $$1145; //@line 1178
           HEAP32[$AsyncCtx38 + 16 >> 2] = $vararg_buffer3; //@line 1180
           HEAP32[$AsyncCtx38 + 20 >> 2] = $4; //@line 1182
           HEAP32[$AsyncCtx38 + 24 >> 2] = $vararg_buffer23; //@line 1184
           HEAP32[$AsyncCtx38 + 28 >> 2] = $vararg_buffer23; //@line 1186
           HEAP32[$AsyncCtx38 + 32 >> 2] = $2; //@line 1188
           HEAP32[$AsyncCtx38 + 36 >> 2] = $3; //@line 1190
           HEAP8[$AsyncCtx38 + 40 >> 0] = $$1$off0 & 1; //@line 1193
           HEAP32[$AsyncCtx38 + 44 >> 2] = $vararg_buffer12; //@line 1195
           HEAP32[$AsyncCtx38 + 48 >> 2] = $1; //@line 1197
           HEAP32[$AsyncCtx38 + 52 >> 2] = $vararg_buffer12; //@line 1199
           HEAP32[$AsyncCtx38 + 56 >> 2] = $vararg_buffer15; //@line 1201
           HEAP32[$AsyncCtx38 + 60 >> 2] = $vararg_buffer15; //@line 1203
           HEAP32[$AsyncCtx38 + 64 >> 2] = $vararg_buffer18; //@line 1205
           HEAP32[$AsyncCtx38 + 68 >> 2] = $vararg_buffer18; //@line 1207
           HEAP32[$AsyncCtx38 + 72 >> 2] = $55; //@line 1209
           HEAP32[$AsyncCtx38 + 76 >> 2] = $vararg_buffer6; //@line 1211
           HEAP32[$AsyncCtx38 + 80 >> 2] = $vararg_buffer6; //@line 1213
           HEAP32[$AsyncCtx38 + 84 >> 2] = $vararg_buffer9; //@line 1215
           HEAP32[$AsyncCtx38 + 88 >> 2] = $vararg_buffer9; //@line 1217
           HEAP32[$AsyncCtx38 + 92 >> 2] = $vararg_buffer20; //@line 1219
           HEAP32[$AsyncCtx38 + 96 >> 2] = $vararg_buffer20; //@line 1221
           sp = STACKTOP; //@line 1222
           STACKTOP = sp; //@line 1223
           return;
          } else {
           _emscripten_free_async_context($AsyncCtx38 | 0); //@line 1225
           HEAP32[$vararg_buffer3 >> 2] = $126; //@line 1226
           $151 = _snprintf($$1143, $$1145, 1716, $vararg_buffer3) | 0; //@line 1227
           $$10 = ($151 | 0) >= ($$1145 | 0) ? 0 : $151; //@line 1229
           if (($$10 | 0) > 0) {
            $$3 = $$1143 + $$10 | 0; //@line 1234
            $$3147 = $$1145 - $$10 | 0; //@line 1234
            label = 44; //@line 1235
            break;
           } else {
            $$3147168 = $$1145; //@line 1238
            $$3169 = $$1143; //@line 1238
            break;
           }
          }
         } else {
          $$3 = $$1143; //@line 1243
          $$3147 = $$1145; //@line 1243
          label = 44; //@line 1244
         }
        } while (0);
        if ((label | 0) == 44) {
         if (($$3147 | 0) > 0) {
          $$3147168 = $$3147; //@line 1250
          $$3169 = $$3; //@line 1250
         } else {
          break;
         }
        }
        $157 = $55 + -2 | 0; //@line 1255
        switch ($157 >>> 1 | $157 << 31 | 0) {
        case 0:
         {
          HEAP32[$vararg_buffer6 >> 2] = $1; //@line 1261
          $$5156 = _snprintf($$3169, $$3147168, 1719, $vararg_buffer6) | 0; //@line 1263
          break;
         }
        case 1:
         {
          HEAP32[$vararg_buffer9 >> 2] = $1; //@line 1267
          $$5156 = _snprintf($$3169, $$3147168, 1734, $vararg_buffer9) | 0; //@line 1269
          break;
         }
        case 3:
         {
          HEAP32[$vararg_buffer12 >> 2] = $1; //@line 1273
          $$5156 = _snprintf($$3169, $$3147168, 1749, $vararg_buffer12) | 0; //@line 1275
          break;
         }
        case 7:
         {
          HEAP32[$vararg_buffer15 >> 2] = $1; //@line 1279
          $$5156 = _snprintf($$3169, $$3147168, 1764, $vararg_buffer15) | 0; //@line 1281
          break;
         }
        default:
         {
          $$5156 = _snprintf($$3169, $$3147168, 1779, $vararg_buffer18) | 0; //@line 1286
         }
        }
        $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 1290
        $168 = $$3169 + $$5156$ | 0; //@line 1292
        $169 = $$3147168 - $$5156$ | 0; //@line 1293
        if (($$5156$ | 0) > 0 & ($169 | 0) > 0) {
         $AsyncCtx56 = _emscripten_alloc_async_context(32, sp) | 0; //@line 1297
         $171 = _vsnprintf($168, $169, $2, $3) | 0; //@line 1298
         if (___async) {
          HEAP32[$AsyncCtx56 >> 2] = 53; //@line 1301
          HEAP32[$AsyncCtx56 + 4 >> 2] = $vararg_buffer23; //@line 1303
          HEAP32[$AsyncCtx56 + 8 >> 2] = $vararg_buffer23; //@line 1305
          HEAP32[$AsyncCtx56 + 12 >> 2] = $vararg_buffer20; //@line 1307
          HEAP32[$AsyncCtx56 + 16 >> 2] = $vararg_buffer20; //@line 1309
          HEAP8[$AsyncCtx56 + 20 >> 0] = $$1$off0 & 1; //@line 1312
          HEAP32[$AsyncCtx56 + 24 >> 2] = $169; //@line 1314
          HEAP32[$AsyncCtx56 + 28 >> 2] = $168; //@line 1316
          sp = STACKTOP; //@line 1317
          STACKTOP = sp; //@line 1318
          return;
         }
         _emscripten_free_async_context($AsyncCtx56 | 0); //@line 1320
         $$13 = ($171 | 0) >= ($169 | 0) ? 0 : $171; //@line 1322
         $181 = $168 + $$13 | 0; //@line 1324
         $182 = $169 - $$13 | 0; //@line 1325
         if (($$13 | 0) > 0) {
          $184 = HEAP32[90] | 0; //@line 1328
          do {
           if (($182 | 0) > 0 & ($184 | 0) != 0) {
            $AsyncCtx42 = _emscripten_alloc_async_context(32, sp) | 0; //@line 1333
            $186 = FUNCTION_TABLE_i[$184 & 3]() | 0; //@line 1334
            if (___async) {
             HEAP32[$AsyncCtx42 >> 2] = 54; //@line 1337
             HEAP32[$AsyncCtx42 + 4 >> 2] = $vararg_buffer20; //@line 1339
             HEAP32[$AsyncCtx42 + 8 >> 2] = $181; //@line 1341
             HEAP32[$AsyncCtx42 + 12 >> 2] = $182; //@line 1343
             HEAP32[$AsyncCtx42 + 16 >> 2] = $vararg_buffer20; //@line 1345
             HEAP8[$AsyncCtx42 + 20 >> 0] = $$1$off0 & 1; //@line 1348
             HEAP32[$AsyncCtx42 + 24 >> 2] = $vararg_buffer23; //@line 1350
             HEAP32[$AsyncCtx42 + 28 >> 2] = $vararg_buffer23; //@line 1352
             sp = STACKTOP; //@line 1353
             STACKTOP = sp; //@line 1354
             return;
            } else {
             _emscripten_free_async_context($AsyncCtx42 | 0); //@line 1356
             HEAP32[$vararg_buffer20 >> 2] = $186; //@line 1357
             $194 = _snprintf($181, $182, 1716, $vararg_buffer20) | 0; //@line 1358
             $$18 = ($194 | 0) >= ($182 | 0) ? 0 : $194; //@line 1360
             if (($$18 | 0) > 0) {
              $$6 = $181 + $$18 | 0; //@line 1365
              $$6150 = $182 - $$18 | 0; //@line 1365
              $$9 = $$18; //@line 1365
              break;
             } else {
              break L54;
             }
            }
           } else {
            $$6 = $181; //@line 1372
            $$6150 = $182; //@line 1372
            $$9 = $$13; //@line 1372
           }
          } while (0);
          if (!(($$9 | 0) < 1 | ($$6150 | 0) < 1 | $$1$off0 ^ 1)) {
           _snprintf($$6, $$6150, 1794, $vararg_buffer23) | 0; //@line 1381
          }
         }
        }
       }
      } while (0);
      $201 = HEAP32[91] | 0; //@line 1387
      $202 = HEAP32[84] | 0; //@line 1388
      $AsyncCtx45 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1389
      FUNCTION_TABLE_vi[$201 & 255]($202); //@line 1390
      if (___async) {
       HEAP32[$AsyncCtx45 >> 2] = 55; //@line 1393
       sp = STACKTOP; //@line 1394
       STACKTOP = sp; //@line 1395
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx45 | 0); //@line 1397
       break;
      }
     }
    } while (0);
    HEAP32[88] = HEAP32[86]; //@line 1403
   }
  }
 } while (0);
 $204 = HEAP32[94] | 0; //@line 1407
 if (!$204) {
  STACKTOP = sp; //@line 1410
  return;
 }
 $206 = HEAP32[95] | 0; //@line 1412
 HEAP32[95] = 0; //@line 1413
 $AsyncCtx49 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1414
 FUNCTION_TABLE_v[$204 & 15](); //@line 1415
 if (___async) {
  HEAP32[$AsyncCtx49 >> 2] = 56; //@line 1418
  HEAP32[$AsyncCtx49 + 4 >> 2] = $206; //@line 1420
  sp = STACKTOP; //@line 1421
  STACKTOP = sp; //@line 1422
  return;
 }
 _emscripten_free_async_context($AsyncCtx49 | 0); //@line 1424
 if (($206 | 0) > 1) {
  $$0199 = $206; //@line 1427
 } else {
  STACKTOP = sp; //@line 1429
  return;
 }
 while (1) {
  $209 = $$0199 + -1 | 0; //@line 1432
  $$pre = HEAP32[94] | 0; //@line 1433
  $AsyncCtx52 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1434
  FUNCTION_TABLE_v[$$pre & 15](); //@line 1435
  if (___async) {
   label = 70; //@line 1438
   break;
  }
  _emscripten_free_async_context($AsyncCtx52 | 0); //@line 1441
  if (($$0199 | 0) > 2) {
   $$0199 = $209; //@line 1444
  } else {
   label = 72; //@line 1446
   break;
  }
 }
 if ((label | 0) == 70) {
  HEAP32[$AsyncCtx52 >> 2] = 57; //@line 1451
  HEAP32[$AsyncCtx52 + 4 >> 2] = $$0199; //@line 1453
  HEAP32[$AsyncCtx52 + 8 >> 2] = $209; //@line 1455
  sp = STACKTOP; //@line 1456
  STACKTOP = sp; //@line 1457
  return;
 } else if ((label | 0) == 72) {
  STACKTOP = sp; //@line 1460
  return;
 }
}
function _initialize($0) {
 $0 = $0 | 0;
 var $$043 = 0, $$044 = 0, $$04750525456586062646668707274767880828486889092949698100102104106108 = 0, $$048 = 0, $1 = 0, $104 = 0, $105 = 0, $107 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $116 = 0, $118 = 0, $124 = 0, $125 = 0, $126 = 0, $13 = 0, $135 = 0, $136 = 0, $137 = 0, $139 = 0, $14 = 0, $143 = 0, $144 = 0, $145 = 0, $147 = 0, $149 = 0, $155 = 0, $156 = 0, $157 = 0, $166 = 0, $167 = 0, $168 = 0, $170 = 0, $174 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $184 = 0, $24 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $37 = 0, $39 = 0, $40 = 0, $41 = 0, $45 = 0, $46 = 0, $53 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $66 = 0, $67 = 0, $68 = 0, $7 = 0, $70 = 0, $72 = 0, $75 = 0, $79 = 0, $80 = 0, $87 = 0, $88 = 0, $AsyncCtx = 0, $AsyncCtx12 = 0, $AsyncCtx16 = 0, $AsyncCtx19 = 0, $AsyncCtx2 = 0, $AsyncCtx6 = 0, $AsyncCtx9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1533
 $1 = $0 + 4 | 0; //@line 1534
 if (HEAP8[(HEAP32[$1 >> 2] | 0) + 56 >> 0] | 0) {
  return;
 }
 $7 = HEAP32[HEAP32[$0 >> 2] >> 2] | 0; //@line 1543
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1544
 FUNCTION_TABLE_v[$7 & 15](); //@line 1545
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 60; //@line 1548
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 1550
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 1552
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 1554
  sp = STACKTOP; //@line 1555
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1558
 $13 = HEAP32[(HEAP32[$0 >> 2] | 0) + 24 >> 2] | 0; //@line 1561
 $AsyncCtx2 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1562
 $14 = FUNCTION_TABLE_i[$13 & 3]() | 0; //@line 1563
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 61; //@line 1566
  HEAP32[$AsyncCtx2 + 4 >> 2] = $1; //@line 1568
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1570
  HEAP32[$AsyncCtx2 + 12 >> 2] = $0; //@line 1572
  sp = STACKTOP; //@line 1573
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1576
 $18 = HEAP32[$14 >> 2] | 0; //@line 1577
 L10 : do {
  if (($18 | 0) < 32768) {
   if (($18 | 0) >= 128) {
    if (($18 | 0) < 2048) {
     switch ($18 | 0) {
     case 1024:
      {
       $$043 = 10; //@line 1587
       $$048 = $18; //@line 1587
       break L10;
       break;
      }
     case 512:
      {
       $$043 = 9; //@line 1592
       $$048 = $18; //@line 1592
       break L10;
       break;
      }
     case 256:
      {
       $$043 = 8; //@line 1597
       $$048 = $18; //@line 1597
       break L10;
       break;
      }
     case 128:
      {
       $$043 = 7; //@line 1602
       $$048 = $18; //@line 1602
       break L10;
       break;
      }
     default:
      {
       $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1607
       label = 60; //@line 1608
       break L10;
      }
     }
    }
    if (($18 | 0) < 8192) {
     switch ($18 | 0) {
     case 4096:
      {
       $$043 = 12; //@line 1617
       $$048 = $18; //@line 1617
       break L10;
       break;
      }
     case 2048:
      {
       $$043 = 11; //@line 1622
       $$048 = $18; //@line 1622
       break L10;
       break;
      }
     default:
      {
       $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1627
       label = 60; //@line 1628
       break L10;
      }
     }
    }
    if (($18 | 0) < 16384) {
     switch ($18 | 0) {
     case 8192:
      {
       break;
      }
     default:
      {
       $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1640
       label = 60; //@line 1641
       break L10;
      }
     }
     $$043 = 13; //@line 1645
     $$048 = $18; //@line 1645
     break;
    } else {
     switch ($18 | 0) {
     case 16384:
      {
       break;
      }
     default:
      {
       $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1653
       label = 60; //@line 1654
       break L10;
      }
     }
     $$043 = 14; //@line 1658
     $$048 = $18; //@line 1658
     break;
    }
   }
   if (($18 | 0) >= 8) {
    switch ($18 | 0) {
    case 64:
     {
      $$043 = 6; //@line 1666
      $$048 = $18; //@line 1666
      break L10;
      break;
     }
    case 32:
     {
      $$043 = 5; //@line 1671
      $$048 = $18; //@line 1671
      break L10;
      break;
     }
    case 16:
     {
      $$043 = 4; //@line 1676
      $$048 = $18; //@line 1676
      break L10;
      break;
     }
    case 8:
     {
      $$043 = 3; //@line 1681
      $$048 = $18; //@line 1681
      break L10;
      break;
     }
    default:
     {
      $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1686
      label = 60; //@line 1687
      break L10;
     }
    }
   }
   if (($18 | 0) >= 2) {
    switch ($18 | 0) {
    case 4:
     {
      $$043 = 2; //@line 1696
      $$048 = $18; //@line 1696
      break L10;
      break;
     }
    case 2:
     {
      $$043 = 1; //@line 1701
      $$048 = $18; //@line 1701
      break L10;
      break;
     }
    default:
     {
      $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1706
      label = 60; //@line 1707
      break L10;
     }
    }
   }
   if (($18 | 0) < 0) {
    switch ($18 | 0) {
    case -2147483648:
     {
      $$043 = 31; //@line 1716
      $$048 = -2147483648; //@line 1716
      break L10;
      break;
     }
    default:
     {
      $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1721
      label = 60; //@line 1722
      break L10;
     }
    }
   }
   switch ($18 | 0) {
   case 0:
    {
     break;
    }
   default:
    {
     $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1732
     label = 60; //@line 1733
     break L10;
    }
   }
   $AsyncCtx19 = _emscripten_alloc_async_context(20, sp) | 0; //@line 1737
   _mbed_assert_internal(1799, 1801, 41); //@line 1738
   if (___async) {
    HEAP32[$AsyncCtx19 >> 2] = 62; //@line 1741
    HEAP32[$AsyncCtx19 + 4 >> 2] = $1; //@line 1743
    HEAP32[$AsyncCtx19 + 8 >> 2] = $0; //@line 1745
    HEAP32[$AsyncCtx19 + 12 >> 2] = $0; //@line 1747
    HEAP32[$AsyncCtx19 + 16 >> 2] = $14; //@line 1749
    sp = STACKTOP; //@line 1750
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx19 | 0); //@line 1753
    $$04750525456586062646668707274767880828486889092949698100102104106108 = 1e6; //@line 1754
    label = 60; //@line 1755
    break;
   }
  } else {
   if (($18 | 0) < 8388608) {
    if (($18 | 0) < 524288) {
     if (($18 | 0) < 131072) {
      if (($18 | 0) < 65536) {
       switch ($18 | 0) {
       case 32768:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1772
         label = 60; //@line 1773
         break L10;
        }
       }
       $$043 = 15; //@line 1777
       $$048 = $18; //@line 1777
       break;
      } else {
       switch ($18 | 0) {
       case 65536:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1785
         label = 60; //@line 1786
         break L10;
        }
       }
       $$043 = 16; //@line 1790
       $$048 = $18; //@line 1790
       break;
      }
     } else {
      if (($18 | 0) < 262144) {
       switch ($18 | 0) {
       case 131072:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1801
         label = 60; //@line 1802
         break L10;
        }
       }
       $$043 = 17; //@line 1806
       $$048 = $18; //@line 1806
       break;
      } else {
       switch ($18 | 0) {
       case 262144:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1814
         label = 60; //@line 1815
         break L10;
        }
       }
       $$043 = 18; //@line 1819
       $$048 = $18; //@line 1819
       break;
      }
     }
    } else {
     if (($18 | 0) < 2097152) {
      if (($18 | 0) < 1048576) {
       switch ($18 | 0) {
       case 524288:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1833
         label = 60; //@line 1834
         break L10;
        }
       }
       $$043 = 19; //@line 1838
       $$048 = $18; //@line 1838
       break;
      } else {
       switch ($18 | 0) {
       case 1048576:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1846
         label = 60; //@line 1847
         break L10;
        }
       }
       $$043 = 20; //@line 1851
       $$048 = $18; //@line 1851
       break;
      }
     } else {
      if (($18 | 0) < 4194304) {
       switch ($18 | 0) {
       case 2097152:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1862
         label = 60; //@line 1863
         break L10;
        }
       }
       $$043 = 21; //@line 1867
       $$048 = $18; //@line 1867
       break;
      } else {
       switch ($18 | 0) {
       case 4194304:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1875
         label = 60; //@line 1876
         break L10;
        }
       }
       $$043 = 22; //@line 1880
       $$048 = $18; //@line 1880
       break;
      }
     }
    }
   } else {
    if (($18 | 0) < 134217728) {
     if (($18 | 0) < 33554432) {
      if (($18 | 0) < 16777216) {
       switch ($18 | 0) {
       case 8388608:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1897
         label = 60; //@line 1898
         break L10;
        }
       }
       $$043 = 23; //@line 1902
       $$048 = $18; //@line 1902
       break;
      } else {
       switch ($18 | 0) {
       case 16777216:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1910
         label = 60; //@line 1911
         break L10;
        }
       }
       $$043 = 24; //@line 1915
       $$048 = $18; //@line 1915
       break;
      }
     } else {
      if (($18 | 0) < 67108864) {
       switch ($18 | 0) {
       case 33554432:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1926
         label = 60; //@line 1927
         break L10;
        }
       }
       $$043 = 25; //@line 1931
       $$048 = $18; //@line 1931
       break;
      } else {
       switch ($18 | 0) {
       case 67108864:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1939
         label = 60; //@line 1940
         break L10;
        }
       }
       $$043 = 26; //@line 1944
       $$048 = $18; //@line 1944
       break;
      }
     }
    } else {
     if (($18 | 0) < 536870912) {
      if (($18 | 0) < 268435456) {
       switch ($18 | 0) {
       case 134217728:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1958
         label = 60; //@line 1959
         break L10;
        }
       }
       $$043 = 27; //@line 1963
       $$048 = $18; //@line 1963
       break;
      } else {
       switch ($18 | 0) {
       case 268435456:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1971
         label = 60; //@line 1972
         break L10;
        }
       }
       $$043 = 28; //@line 1976
       $$048 = $18; //@line 1976
       break;
      }
     } else {
      if (($18 | 0) < 1073741824) {
       switch ($18 | 0) {
       case 536870912:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1987
         label = 60; //@line 1988
         break L10;
        }
       }
       $$043 = 29; //@line 1992
       $$048 = $18; //@line 1992
       break;
      } else {
       switch ($18 | 0) {
       case 1073741824:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 2000
         label = 60; //@line 2001
         break L10;
        }
       }
       $$043 = 30; //@line 2005
       $$048 = $18; //@line 2005
       break;
      }
     }
    }
   }
  }
 } while (0);
 if ((label | 0) == 60) {
  $$043 = 0; //@line 2014
  $$048 = $$04750525456586062646668707274767880828486889092949698100102104106108; //@line 2014
 }
 $24 = HEAP32[$14 + 4 >> 2] | 0; //@line 2017
 do {
  if (($24 + -4 | 0) >>> 0 > 28) {
   $AsyncCtx16 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2022
   _mbed_assert_internal(1799, 1801, 55); //@line 2023
   if (___async) {
    HEAP32[$AsyncCtx16 >> 2] = 63; //@line 2026
    HEAP32[$AsyncCtx16 + 4 >> 2] = $$048; //@line 2028
    HEAP32[$AsyncCtx16 + 8 >> 2] = $1; //@line 2030
    HEAP32[$AsyncCtx16 + 12 >> 2] = $0; //@line 2032
    HEAP32[$AsyncCtx16 + 16 >> 2] = $0; //@line 2034
    HEAP8[$AsyncCtx16 + 20 >> 0] = $$043; //@line 2036
    sp = STACKTOP; //@line 2037
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx16 | 0); //@line 2040
    $$044 = 32; //@line 2041
    break;
   }
  } else {
   $$044 = $24; //@line 2045
  }
 } while (0);
 $32 = 7 << $$044 + -4; //@line 2049
 $33 = ___muldi3($32 | 0, 0, 1e6, 0) | 0; //@line 2050
 $34 = tempRet0; //@line 2051
 $35 = _i64Add($$048 | 0, 0, -1, -1) | 0; //@line 2052
 $37 = _i64Add($35 | 0, tempRet0 | 0, $33 | 0, $34 | 0) | 0; //@line 2054
 $39 = ___udivdi3($37 | 0, tempRet0 | 0, $$048 | 0, 0) | 0; //@line 2056
 $40 = tempRet0; //@line 2057
 $41 = HEAP32[$1 >> 2] | 0; //@line 2058
 HEAP32[$41 >> 2] = 0; //@line 2059
 HEAP32[$41 + 4 >> 2] = 0; //@line 2061
 $45 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 2064
 $AsyncCtx6 = _emscripten_alloc_async_context(40, sp) | 0; //@line 2065
 $46 = FUNCTION_TABLE_i[$45 & 3]() | 0; //@line 2066
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 64; //@line 2069
  HEAP32[$AsyncCtx6 + 4 >> 2] = $1; //@line 2071
  HEAP32[$AsyncCtx6 + 8 >> 2] = $$048; //@line 2073
  HEAP8[$AsyncCtx6 + 12 >> 0] = $$043; //@line 2075
  HEAP32[$AsyncCtx6 + 16 >> 2] = $$044; //@line 2077
  HEAP32[$AsyncCtx6 + 20 >> 2] = $32; //@line 2079
  $53 = $AsyncCtx6 + 24 | 0; //@line 2081
  HEAP32[$53 >> 2] = $39; //@line 2083
  HEAP32[$53 + 4 >> 2] = $40; //@line 2086
  HEAP32[$AsyncCtx6 + 32 >> 2] = $0; //@line 2088
  HEAP32[$AsyncCtx6 + 36 >> 2] = $0; //@line 2090
  sp = STACKTOP; //@line 2091
  return;
 }
 _emscripten_free_async_context($AsyncCtx6 | 0); //@line 2094
 $59 = HEAP32[$1 >> 2] | 0; //@line 2095
 $60 = $59 + 32 | 0; //@line 2096
 HEAP32[$60 >> 2] = $46; //@line 2097
 $61 = $59 + 40 | 0; //@line 2098
 $62 = $61; //@line 2099
 HEAP32[$62 >> 2] = 0; //@line 2101
 HEAP32[$62 + 4 >> 2] = 0; //@line 2104
 $66 = $59 + 8 | 0; //@line 2105
 HEAP32[$66 >> 2] = $$048; //@line 2106
 $67 = $59 + 57 | 0; //@line 2107
 HEAP8[$67 >> 0] = $$043; //@line 2108
 $68 = _bitshift64Shl(1, 0, $$044 | 0) | 0; //@line 2109
 $70 = _i64Add($68 | 0, tempRet0 | 0, -1, 0) | 0; //@line 2111
 $72 = $59 + 12 | 0; //@line 2113
 HEAP32[$72 >> 2] = $70; //@line 2114
 HEAP32[$59 + 16 >> 2] = $32; //@line 2116
 $75 = $59 + 24 | 0; //@line 2118
 HEAP32[$75 >> 2] = $39; //@line 2120
 HEAP32[$75 + 4 >> 2] = $40; //@line 2123
 $79 = $59 + 48 | 0; //@line 2124
 $80 = $79; //@line 2125
 HEAP32[$80 >> 2] = 0; //@line 2127
 HEAP32[$80 + 4 >> 2] = 0; //@line 2130
 HEAP8[$59 + 56 >> 0] = 1; //@line 2132
 $87 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 2135
 $AsyncCtx9 = _emscripten_alloc_async_context(36, sp) | 0; //@line 2136
 $88 = FUNCTION_TABLE_i[$87 & 3]() | 0; //@line 2137
 if (___async) {
  HEAP32[$AsyncCtx9 >> 2] = 65; //@line 2140
  HEAP32[$AsyncCtx9 + 4 >> 2] = $1; //@line 2142
  HEAP32[$AsyncCtx9 + 8 >> 2] = $0; //@line 2144
  HEAP32[$AsyncCtx9 + 12 >> 2] = $60; //@line 2146
  HEAP32[$AsyncCtx9 + 16 >> 2] = $72; //@line 2148
  HEAP32[$AsyncCtx9 + 20 >> 2] = $66; //@line 2150
  HEAP32[$AsyncCtx9 + 24 >> 2] = $79; //@line 2152
  HEAP32[$AsyncCtx9 + 28 >> 2] = $67; //@line 2154
  HEAP32[$AsyncCtx9 + 32 >> 2] = $61; //@line 2156
  sp = STACKTOP; //@line 2157
  return;
 }
 _emscripten_free_async_context($AsyncCtx9 | 0); //@line 2160
 if (($88 | 0) != (HEAP32[(HEAP32[$1 >> 2] | 0) + 32 >> 2] | 0)) {
  $104 = $88 - (HEAP32[$60 >> 2] | 0) & HEAP32[$72 >> 2]; //@line 2169
  HEAP32[$60 >> 2] = $88; //@line 2170
  $105 = HEAP32[$66 >> 2] | 0; //@line 2171
  do {
   if (($105 | 0) == 1e6) {
    $180 = $104; //@line 2175
    $181 = 0; //@line 2175
   } else {
    $107 = HEAP8[$67 >> 0] | 0; //@line 2177
    $109 = ___muldi3($104 | 0, 0, 1e6, 0) | 0; //@line 2179
    $110 = tempRet0; //@line 2180
    if (!($107 << 24 >> 24)) {
     $143 = ___udivdi3($109 | 0, $110 | 0, $105 | 0, 0) | 0; //@line 2182
     $144 = tempRet0; //@line 2183
     $145 = ___muldi3($143 | 0, $144 | 0, $105 | 0, 0) | 0; //@line 2184
     $147 = _i64Subtract($109 | 0, $110 | 0, $145 | 0, tempRet0 | 0) | 0; //@line 2186
     $149 = $61; //@line 2188
     $155 = _i64Add($147 | 0, tempRet0 | 0, HEAP32[$149 >> 2] | 0, HEAP32[$149 + 4 >> 2] | 0) | 0; //@line 2194
     $156 = tempRet0; //@line 2195
     $157 = $61; //@line 2196
     HEAP32[$157 >> 2] = $155; //@line 2198
     HEAP32[$157 + 4 >> 2] = $156; //@line 2201
     if ($156 >>> 0 < 0 | ($156 | 0) == 0 & $155 >>> 0 < $105 >>> 0) {
      $180 = $143; //@line 2208
      $181 = $144; //@line 2208
      break;
     }
     $166 = _i64Add($143 | 0, $144 | 0, 1, 0) | 0; //@line 2211
     $167 = tempRet0; //@line 2212
     $168 = _i64Subtract($155 | 0, $156 | 0, $105 | 0, 0) | 0; //@line 2213
     $170 = $61; //@line 2215
     HEAP32[$170 >> 2] = $168; //@line 2217
     HEAP32[$170 + 4 >> 2] = tempRet0; //@line 2220
     $180 = $166; //@line 2221
     $181 = $167; //@line 2221
     break;
    } else {
     $111 = $107 & 255; //@line 2224
     $112 = _bitshift64Lshr($109 | 0, $110 | 0, $111 | 0) | 0; //@line 2225
     $113 = tempRet0; //@line 2226
     $114 = _bitshift64Shl($112 | 0, $113 | 0, $111 | 0) | 0; //@line 2227
     $116 = _i64Subtract($109 | 0, $110 | 0, $114 | 0, tempRet0 | 0) | 0; //@line 2229
     $118 = $61; //@line 2231
     $124 = _i64Add(HEAP32[$118 >> 2] | 0, HEAP32[$118 + 4 >> 2] | 0, $116 | 0, tempRet0 | 0) | 0; //@line 2237
     $125 = tempRet0; //@line 2238
     $126 = $61; //@line 2239
     HEAP32[$126 >> 2] = $124; //@line 2241
     HEAP32[$126 + 4 >> 2] = $125; //@line 2244
     if ($125 >>> 0 < 0 | ($125 | 0) == 0 & $124 >>> 0 < $105 >>> 0) {
      $180 = $112; //@line 2251
      $181 = $113; //@line 2251
      break;
     }
     $135 = _i64Add($112 | 0, $113 | 0, 1, 0) | 0; //@line 2254
     $136 = tempRet0; //@line 2255
     $137 = _i64Subtract($124 | 0, $125 | 0, $105 | 0, 0) | 0; //@line 2256
     $139 = $61; //@line 2258
     HEAP32[$139 >> 2] = $137; //@line 2260
     HEAP32[$139 + 4 >> 2] = tempRet0; //@line 2263
     $180 = $135; //@line 2264
     $181 = $136; //@line 2264
     break;
    }
   }
  } while (0);
  $174 = $79; //@line 2269
  $182 = _i64Add(HEAP32[$174 >> 2] | 0, HEAP32[$174 + 4 >> 2] | 0, $180 | 0, $181 | 0) | 0; //@line 2275
  $184 = $79; //@line 2277
  HEAP32[$184 >> 2] = $182; //@line 2279
  HEAP32[$184 + 4 >> 2] = tempRet0; //@line 2282
 }
 $AsyncCtx12 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2284
 _schedule_interrupt($0); //@line 2285
 if (___async) {
  HEAP32[$AsyncCtx12 >> 2] = 66; //@line 2288
  sp = STACKTOP; //@line 2289
  return;
 }
 _emscripten_free_async_context($AsyncCtx12 | 0); //@line 2292
 return;
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 6347
 $3 = HEAP32[1478] | 0; //@line 6348
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 6351
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 6355
 $7 = $6 & 3; //@line 6356
 if (($7 | 0) == 1) {
  _abort(); //@line 6359
 }
 $9 = $6 & -8; //@line 6362
 $10 = $2 + $9 | 0; //@line 6363
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 6368
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 6374
   $17 = $13 + $9 | 0; //@line 6375
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 6378
   }
   if ((HEAP32[1479] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 6384
    $106 = HEAP32[$105 >> 2] | 0; //@line 6385
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 6389
     $$1382 = $17; //@line 6389
     $114 = $16; //@line 6389
     break;
    }
    HEAP32[1476] = $17; //@line 6392
    HEAP32[$105 >> 2] = $106 & -2; //@line 6394
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 6397
    HEAP32[$16 + $17 >> 2] = $17; //@line 6399
    return;
   }
   $21 = $13 >>> 3; //@line 6402
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 6406
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 6408
    $28 = 5936 + ($21 << 1 << 2) | 0; //@line 6410
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 6415
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 6422
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1474] = HEAP32[1474] & ~(1 << $21); //@line 6432
     $$1 = $16; //@line 6433
     $$1382 = $17; //@line 6433
     $114 = $16; //@line 6433
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 6439
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 6443
     }
     $41 = $26 + 8 | 0; //@line 6446
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 6450
     } else {
      _abort(); //@line 6452
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 6457
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 6458
    $$1 = $16; //@line 6459
    $$1382 = $17; //@line 6459
    $114 = $16; //@line 6459
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 6463
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 6465
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 6469
     $60 = $59 + 4 | 0; //@line 6470
     $61 = HEAP32[$60 >> 2] | 0; //@line 6471
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 6474
      if (!$63) {
       $$3 = 0; //@line 6477
       break;
      } else {
       $$1387 = $63; //@line 6480
       $$1390 = $59; //@line 6480
      }
     } else {
      $$1387 = $61; //@line 6483
      $$1390 = $60; //@line 6483
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 6486
      $66 = HEAP32[$65 >> 2] | 0; //@line 6487
      if ($66 | 0) {
       $$1387 = $66; //@line 6490
       $$1390 = $65; //@line 6490
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 6493
      $69 = HEAP32[$68 >> 2] | 0; //@line 6494
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 6499
       $$1390 = $68; //@line 6499
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 6504
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 6507
      $$3 = $$1387; //@line 6508
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 6513
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 6516
     }
     $53 = $51 + 12 | 0; //@line 6519
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 6523
     }
     $56 = $48 + 8 | 0; //@line 6526
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 6530
      HEAP32[$56 >> 2] = $51; //@line 6531
      $$3 = $48; //@line 6532
      break;
     } else {
      _abort(); //@line 6535
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 6542
    $$1382 = $17; //@line 6542
    $114 = $16; //@line 6542
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 6545
    $75 = 6200 + ($74 << 2) | 0; //@line 6546
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 6551
      if (!$$3) {
       HEAP32[1475] = HEAP32[1475] & ~(1 << $74); //@line 6558
       $$1 = $16; //@line 6559
       $$1382 = $17; //@line 6559
       $114 = $16; //@line 6559
       break L10;
      }
     } else {
      if ((HEAP32[1478] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 6566
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 6574
       if (!$$3) {
        $$1 = $16; //@line 6577
        $$1382 = $17; //@line 6577
        $114 = $16; //@line 6577
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1478] | 0; //@line 6585
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 6588
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 6592
    $92 = $16 + 16 | 0; //@line 6593
    $93 = HEAP32[$92 >> 2] | 0; //@line 6594
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 6600
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 6604
       HEAP32[$93 + 24 >> 2] = $$3; //@line 6606
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 6612
    if (!$99) {
     $$1 = $16; //@line 6615
     $$1382 = $17; //@line 6615
     $114 = $16; //@line 6615
    } else {
     if ((HEAP32[1478] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 6620
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 6624
      HEAP32[$99 + 24 >> 2] = $$3; //@line 6626
      $$1 = $16; //@line 6627
      $$1382 = $17; //@line 6627
      $114 = $16; //@line 6627
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 6633
   $$1382 = $9; //@line 6633
   $114 = $2; //@line 6633
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 6638
 }
 $115 = $10 + 4 | 0; //@line 6641
 $116 = HEAP32[$115 >> 2] | 0; //@line 6642
 if (!($116 & 1)) {
  _abort(); //@line 6646
 }
 if (!($116 & 2)) {
  if ((HEAP32[1480] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1477] | 0) + $$1382 | 0; //@line 6656
   HEAP32[1477] = $124; //@line 6657
   HEAP32[1480] = $$1; //@line 6658
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 6661
   if (($$1 | 0) != (HEAP32[1479] | 0)) {
    return;
   }
   HEAP32[1479] = 0; //@line 6667
   HEAP32[1476] = 0; //@line 6668
   return;
  }
  if ((HEAP32[1479] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1476] | 0) + $$1382 | 0; //@line 6675
   HEAP32[1476] = $132; //@line 6676
   HEAP32[1479] = $114; //@line 6677
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 6680
   HEAP32[$114 + $132 >> 2] = $132; //@line 6682
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 6686
  $138 = $116 >>> 3; //@line 6687
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 6692
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 6694
    $145 = 5936 + ($138 << 1 << 2) | 0; //@line 6696
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1478] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 6702
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 6709
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1474] = HEAP32[1474] & ~(1 << $138); //@line 6719
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 6725
    } else {
     if ((HEAP32[1478] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 6730
     }
     $160 = $143 + 8 | 0; //@line 6733
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 6737
     } else {
      _abort(); //@line 6739
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 6744
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 6745
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 6748
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 6750
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 6754
      $180 = $179 + 4 | 0; //@line 6755
      $181 = HEAP32[$180 >> 2] | 0; //@line 6756
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 6759
       if (!$183) {
        $$3400 = 0; //@line 6762
        break;
       } else {
        $$1398 = $183; //@line 6765
        $$1402 = $179; //@line 6765
       }
      } else {
       $$1398 = $181; //@line 6768
       $$1402 = $180; //@line 6768
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 6771
       $186 = HEAP32[$185 >> 2] | 0; //@line 6772
       if ($186 | 0) {
        $$1398 = $186; //@line 6775
        $$1402 = $185; //@line 6775
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 6778
       $189 = HEAP32[$188 >> 2] | 0; //@line 6779
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 6784
        $$1402 = $188; //@line 6784
       }
      }
      if ((HEAP32[1478] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 6790
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 6793
       $$3400 = $$1398; //@line 6794
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 6799
      if ((HEAP32[1478] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 6803
      }
      $173 = $170 + 12 | 0; //@line 6806
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 6810
      }
      $176 = $167 + 8 | 0; //@line 6813
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 6817
       HEAP32[$176 >> 2] = $170; //@line 6818
       $$3400 = $167; //@line 6819
       break;
      } else {
       _abort(); //@line 6822
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 6830
     $196 = 6200 + ($195 << 2) | 0; //@line 6831
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 6836
       if (!$$3400) {
        HEAP32[1475] = HEAP32[1475] & ~(1 << $195); //@line 6843
        break L108;
       }
      } else {
       if ((HEAP32[1478] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 6850
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 6858
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1478] | 0; //@line 6868
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 6871
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 6875
     $213 = $10 + 16 | 0; //@line 6876
     $214 = HEAP32[$213 >> 2] | 0; //@line 6877
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 6883
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 6887
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 6889
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 6895
     if ($220 | 0) {
      if ((HEAP32[1478] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 6901
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 6905
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 6907
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 6916
  HEAP32[$114 + $137 >> 2] = $137; //@line 6918
  if (($$1 | 0) == (HEAP32[1479] | 0)) {
   HEAP32[1476] = $137; //@line 6922
   return;
  } else {
   $$2 = $137; //@line 6925
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 6929
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 6932
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 6934
  $$2 = $$1382; //@line 6935
 }
 $235 = $$2 >>> 3; //@line 6937
 if ($$2 >>> 0 < 256) {
  $238 = 5936 + ($235 << 1 << 2) | 0; //@line 6941
  $239 = HEAP32[1474] | 0; //@line 6942
  $240 = 1 << $235; //@line 6943
  if (!($239 & $240)) {
   HEAP32[1474] = $239 | $240; //@line 6948
   $$0403 = $238; //@line 6950
   $$pre$phiZ2D = $238 + 8 | 0; //@line 6950
  } else {
   $244 = $238 + 8 | 0; //@line 6952
   $245 = HEAP32[$244 >> 2] | 0; //@line 6953
   if ((HEAP32[1478] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 6957
   } else {
    $$0403 = $245; //@line 6960
    $$pre$phiZ2D = $244; //@line 6960
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 6963
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 6965
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 6967
  HEAP32[$$1 + 12 >> 2] = $238; //@line 6969
  return;
 }
 $251 = $$2 >>> 8; //@line 6972
 if (!$251) {
  $$0396 = 0; //@line 6975
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 6979
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 6983
   $257 = $251 << $256; //@line 6984
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 6987
   $262 = $257 << $260; //@line 6989
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 6992
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 6997
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 7003
  }
 }
 $276 = 6200 + ($$0396 << 2) | 0; //@line 7006
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 7008
 HEAP32[$$1 + 20 >> 2] = 0; //@line 7011
 HEAP32[$$1 + 16 >> 2] = 0; //@line 7012
 $280 = HEAP32[1475] | 0; //@line 7013
 $281 = 1 << $$0396; //@line 7014
 do {
  if (!($280 & $281)) {
   HEAP32[1475] = $280 | $281; //@line 7020
   HEAP32[$276 >> 2] = $$1; //@line 7021
   HEAP32[$$1 + 24 >> 2] = $276; //@line 7023
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 7025
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 7027
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 7035
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 7035
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 7042
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 7046
    $301 = HEAP32[$299 >> 2] | 0; //@line 7048
    if (!$301) {
     label = 121; //@line 7051
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 7054
     $$0384 = $301; //@line 7054
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1478] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 7061
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 7064
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 7066
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 7068
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 7070
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 7075
    $309 = HEAP32[$308 >> 2] | 0; //@line 7076
    $310 = HEAP32[1478] | 0; //@line 7077
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 7083
     HEAP32[$308 >> 2] = $$1; //@line 7084
     HEAP32[$$1 + 8 >> 2] = $309; //@line 7086
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 7088
     HEAP32[$$1 + 24 >> 2] = 0; //@line 7090
     break;
    } else {
     _abort(); //@line 7093
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1482] | 0) + -1 | 0; //@line 7100
 HEAP32[1482] = $319; //@line 7101
 if (!$319) {
  $$0212$in$i = 6352; //@line 7104
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 7109
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 7115
  }
 }
 HEAP32[1482] = -1; //@line 7118
 return;
}
function _mbed_vtracef__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$1$off0 = 0, $$1$off0$expand_i1_val = 0, $$1$off0$expand_i1_val18 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$3154 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $$lobit = 0, $$sink = 0, $10 = 0, $102 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $136 = 0, $14 = 0, $147 = 0, $148 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $163 = 0, $164 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $53 = 0, $57 = 0, $6 = 0, $62 = 0, $73 = 0, $74 = 0, $78 = 0, $79 = 0, $8 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $89 = 0, $91 = 0, $95 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx11 = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx7 = 0, $ReallocAsyncCtx8 = 0, $extract$t159 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 15
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 17
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 19
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 21
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 23
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 25
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 27
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 29
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 31
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 33
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 35
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 37
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 39
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 41
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 43
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 45
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 47
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 49
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 51
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 55
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 57
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 59
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 61
 HEAP32[95] = (HEAP32[95] | 0) + 1; //@line 66
 $53 = HEAP32[84] | 0; //@line 67
 do {
  if ($53 | 0) {
   HEAP8[$53 >> 0] = 0; //@line 71
   do {
    if ($12 << 24 >> 24 > -1 & ($10 | 0) != 0) {
     $57 = HEAP32[81] | 0; //@line 77
     if (HEAP8[$57 >> 0] | 0) {
      if (_strstr($57, $10) | 0) {
       $$0$i = 1; //@line 84
       break;
      }
     }
     $62 = HEAP32[82] | 0; //@line 88
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
   if (!((HEAP32[91] | 0) != 0 & ((($10 | 0) == 0 | (($14 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[88] = HEAP32[86]; //@line 119
    break;
   }
   $73 = HEAPU8[320] | 0; //@line 123
   $74 = $12 & 255; //@line 124
   if ($74 & 31 & $73 | 0) {
    $78 = $73 & 64; //@line 129
    $$lobit = $78 >>> 6; //@line 130
    $79 = $$lobit & 255; //@line 131
    $83 = ($73 & 32 | 0) == 0; //@line 135
    $84 = HEAP32[85] | 0; //@line 136
    $85 = HEAP32[84] | 0; //@line 137
    $86 = $12 << 24 >> 24 == 1; //@line 138
    if ($86 | ($73 & 128 | 0) != 0) {
     $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 141
     _vsnprintf($85, $84, $14, $16) | 0; //@line 142
     if (___async) {
      HEAP32[$ReallocAsyncCtx12 >> 2] = 47; //@line 145
      $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 146
      $$expand_i1_val = $86 & 1; //@line 147
      HEAP8[$87 >> 0] = $$expand_i1_val; //@line 148
      sp = STACKTOP; //@line 149
      return;
     }
     ___async_unwind = 0; //@line 152
     HEAP32[$ReallocAsyncCtx12 >> 2] = 47; //@line 153
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
      $89 = _snprintf($85, $84, 1686, $48) | 0; //@line 169
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
        $$sink = 1704; //@line 187
        label = 25; //@line 188
        break;
       }
      case 1:
       {
        $$sink = 1710; //@line 192
        label = 25; //@line 193
        break;
       }
      case 3:
       {
        $$sink = 1698; //@line 197
        label = 25; //@line 198
        break;
       }
      case 7:
       {
        $$sink = 1692; //@line 202
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
       HEAP32[$38 >> 2] = $$sink; //@line 211
       $$0141 = $79 & 1; //@line 214
       $$1152 = _snprintf($$0142, $$0144, 1716, $38) | 0; //@line 214
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
     if (($$1145 | 0) > 0 & (HEAP32[89] | 0) != 0) {
      HEAP32[$46 >> 2] = HEAP32[$16 >> 2]; //@line 241
      $ReallocAsyncCtx11 = _emscripten_realloc_async_context(104) | 0; //@line 242
      $108 = _vsnprintf(0, 0, $14, $46) | 0; //@line 243
      if (___async) {
       HEAP32[$ReallocAsyncCtx11 >> 2] = 51; //@line 246
       $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 247
       HEAP32[$109 >> 2] = $2; //@line 248
       $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 249
       HEAP32[$110 >> 2] = $$1143; //@line 250
       $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 251
       HEAP32[$111 >> 2] = $$1145; //@line 252
       $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 253
       HEAP32[$112 >> 2] = $4; //@line 254
       $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 255
       HEAP32[$113 >> 2] = $46; //@line 256
       $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 257
       HEAP32[$114 >> 2] = $6; //@line 258
       $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 259
       HEAP32[$115 >> 2] = $8; //@line 260
       $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 261
       HEAP32[$116 >> 2] = $42; //@line 262
       $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 263
       HEAP32[$117 >> 2] = $44; //@line 264
       $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 265
       $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 266
       HEAP8[$118 >> 0] = $$1$off0$expand_i1_val; //@line 267
       $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 268
       HEAP32[$119 >> 2] = $14; //@line 269
       $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 270
       HEAP32[$120 >> 2] = $16; //@line 271
       $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 272
       HEAP32[$121 >> 2] = $18; //@line 273
       $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 274
       HEAP32[$122 >> 2] = $10; //@line 275
       $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 276
       HEAP32[$123 >> 2] = $20; //@line 277
       $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 278
       HEAP32[$124 >> 2] = $22; //@line 279
       $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 280
       HEAP32[$125 >> 2] = $24; //@line 281
       $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 282
       HEAP32[$126 >> 2] = $26; //@line 283
       $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 284
       HEAP32[$127 >> 2] = $28; //@line 285
       $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 286
       HEAP32[$128 >> 2] = $74; //@line 287
       $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 288
       HEAP32[$129 >> 2] = $30; //@line 289
       $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 290
       HEAP32[$130 >> 2] = $32; //@line 291
       $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 292
       HEAP32[$131 >> 2] = $34; //@line 293
       $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 294
       HEAP32[$132 >> 2] = $36; //@line 295
       $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 296
       HEAP32[$133 >> 2] = $$3154; //@line 297
       sp = STACKTOP; //@line 298
       return;
      }
      HEAP32[___async_retval >> 2] = $108; //@line 302
      ___async_unwind = 0; //@line 303
      HEAP32[$ReallocAsyncCtx11 >> 2] = 51; //@line 304
      $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 305
      HEAP32[$109 >> 2] = $2; //@line 306
      $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 307
      HEAP32[$110 >> 2] = $$1143; //@line 308
      $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 309
      HEAP32[$111 >> 2] = $$1145; //@line 310
      $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 311
      HEAP32[$112 >> 2] = $4; //@line 312
      $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 313
      HEAP32[$113 >> 2] = $46; //@line 314
      $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 315
      HEAP32[$114 >> 2] = $6; //@line 316
      $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 317
      HEAP32[$115 >> 2] = $8; //@line 318
      $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 319
      HEAP32[$116 >> 2] = $42; //@line 320
      $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 321
      HEAP32[$117 >> 2] = $44; //@line 322
      $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 323
      $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 324
      HEAP8[$118 >> 0] = $$1$off0$expand_i1_val; //@line 325
      $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 326
      HEAP32[$119 >> 2] = $14; //@line 327
      $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 328
      HEAP32[$120 >> 2] = $16; //@line 329
      $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 330
      HEAP32[$121 >> 2] = $18; //@line 331
      $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 332
      HEAP32[$122 >> 2] = $10; //@line 333
      $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 334
      HEAP32[$123 >> 2] = $20; //@line 335
      $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 336
      HEAP32[$124 >> 2] = $22; //@line 337
      $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 338
      HEAP32[$125 >> 2] = $24; //@line 339
      $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 340
      HEAP32[$126 >> 2] = $26; //@line 341
      $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 342
      HEAP32[$127 >> 2] = $28; //@line 343
      $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 344
      HEAP32[$128 >> 2] = $74; //@line 345
      $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 346
      HEAP32[$129 >> 2] = $30; //@line 347
      $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 348
      HEAP32[$130 >> 2] = $32; //@line 349
      $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 350
      HEAP32[$131 >> 2] = $34; //@line 351
      $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 352
      HEAP32[$132 >> 2] = $36; //@line 353
      $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 354
      HEAP32[$133 >> 2] = $$3154; //@line 355
      sp = STACKTOP; //@line 356
      return;
     }
     if (($$1145 | 0) > 0) {
      $136 = $74 + -2 | 0; //@line 361
      switch ($136 >>> 1 | $136 << 31 | 0) {
      case 0:
       {
        HEAP32[$30 >> 2] = $10; //@line 367
        $$5156 = _snprintf($$1143, $$1145, 1719, $30) | 0; //@line 369
        break;
       }
      case 1:
       {
        HEAP32[$34 >> 2] = $10; //@line 373
        $$5156 = _snprintf($$1143, $$1145, 1734, $34) | 0; //@line 375
        break;
       }
      case 3:
       {
        HEAP32[$18 >> 2] = $10; //@line 379
        $$5156 = _snprintf($$1143, $$1145, 1749, $18) | 0; //@line 381
        break;
       }
      case 7:
       {
        HEAP32[$22 >> 2] = $10; //@line 385
        $$5156 = _snprintf($$1143, $$1145, 1764, $22) | 0; //@line 387
        break;
       }
      default:
       {
        $$5156 = _snprintf($$1143, $$1145, 1779, $26) | 0; //@line 392
       }
      }
      $$5156$ = ($$5156 | 0) < ($$1145 | 0) ? $$5156 : 0; //@line 396
      $147 = $$1143 + $$5156$ | 0; //@line 398
      $148 = $$1145 - $$5156$ | 0; //@line 399
      if (($$5156$ | 0) > 0 & ($148 | 0) > 0) {
       $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 403
       $150 = _vsnprintf($147, $148, $14, $16) | 0; //@line 404
       if (___async) {
        HEAP32[$ReallocAsyncCtx10 >> 2] = 53; //@line 407
        $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 408
        HEAP32[$151 >> 2] = $6; //@line 409
        $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 410
        HEAP32[$152 >> 2] = $8; //@line 411
        $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 412
        HEAP32[$153 >> 2] = $42; //@line 413
        $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 414
        HEAP32[$154 >> 2] = $44; //@line 415
        $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 416
        $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 417
        HEAP8[$155 >> 0] = $$1$off0$expand_i1_val18; //@line 418
        $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 419
        HEAP32[$156 >> 2] = $148; //@line 420
        $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 421
        HEAP32[$157 >> 2] = $147; //@line 422
        sp = STACKTOP; //@line 423
        return;
       }
       HEAP32[___async_retval >> 2] = $150; //@line 427
       ___async_unwind = 0; //@line 428
       HEAP32[$ReallocAsyncCtx10 >> 2] = 53; //@line 429
       $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 430
       HEAP32[$151 >> 2] = $6; //@line 431
       $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 432
       HEAP32[$152 >> 2] = $8; //@line 433
       $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 434
       HEAP32[$153 >> 2] = $42; //@line 435
       $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 436
       HEAP32[$154 >> 2] = $44; //@line 437
       $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 438
       $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 439
       HEAP8[$155 >> 0] = $$1$off0$expand_i1_val18; //@line 440
       $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 441
       HEAP32[$156 >> 2] = $148; //@line 442
       $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 443
       HEAP32[$157 >> 2] = $147; //@line 444
       sp = STACKTOP; //@line 445
       return;
      }
     }
    }
    $159 = HEAP32[91] | 0; //@line 450
    $160 = HEAP32[84] | 0; //@line 451
    $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 452
    FUNCTION_TABLE_vi[$159 & 255]($160); //@line 453
    if (___async) {
     HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 456
     sp = STACKTOP; //@line 457
     return;
    }
    ___async_unwind = 0; //@line 460
    HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 461
    sp = STACKTOP; //@line 462
    return;
   }
  }
 } while (0);
 $161 = HEAP32[94] | 0; //@line 467
 if (!$161) {
  return;
 }
 $163 = HEAP32[95] | 0; //@line 472
 HEAP32[95] = 0; //@line 473
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 474
 FUNCTION_TABLE_v[$161 & 15](); //@line 475
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 478
  $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 479
  HEAP32[$164 >> 2] = $163; //@line 480
  sp = STACKTOP; //@line 481
  return;
 }
 ___async_unwind = 0; //@line 484
 HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 485
 $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 486
 HEAP32[$164 >> 2] = $163; //@line 487
 sp = STACKTOP; //@line 488
 return;
}
function _initialize__async_cb_74($0) {
 $0 = $0 | 0;
 var $$043 = 0, $$048 = 0, $10 = 0, $11 = 0, $12 = 0, $14 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $27 = 0, $29 = 0, $30 = 0, $31 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $6 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4416
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4418
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4420
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4422
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4424
 $8 = HEAP32[$AsyncRetVal >> 2] | 0; //@line 4425
 L2 : do {
  if (($8 | 0) < 32768) {
   if (($8 | 0) >= 128) {
    if (($8 | 0) < 2048) {
     switch ($8 | 0) {
     case 1024:
      {
       $$043 = 10; //@line 4435
       $$048 = $8; //@line 4435
       break L2;
       break;
      }
     case 512:
      {
       $$043 = 9; //@line 4440
       $$048 = $8; //@line 4440
       break L2;
       break;
      }
     case 256:
      {
       $$043 = 8; //@line 4445
       $$048 = $8; //@line 4445
       break L2;
       break;
      }
     case 128:
      {
       $$043 = 7; //@line 4450
       $$048 = $8; //@line 4450
       break L2;
       break;
      }
     default:
      {
       label = 43; //@line 4455
       break L2;
      }
     }
    }
    if (($8 | 0) < 8192) {
     switch ($8 | 0) {
     case 4096:
      {
       $$043 = 12; //@line 4464
       $$048 = $8; //@line 4464
       break L2;
       break;
      }
     case 2048:
      {
       $$043 = 11; //@line 4469
       $$048 = $8; //@line 4469
       break L2;
       break;
      }
     default:
      {
       label = 43; //@line 4474
       break L2;
      }
     }
    }
    if (($8 | 0) < 16384) {
     switch ($8 | 0) {
     case 8192:
      {
       break;
      }
     default:
      {
       label = 43; //@line 4486
       break L2;
      }
     }
     $$043 = 13; //@line 4490
     $$048 = $8; //@line 4490
     break;
    } else {
     switch ($8 | 0) {
     case 16384:
      {
       break;
      }
     default:
      {
       label = 43; //@line 4498
       break L2;
      }
     }
     $$043 = 14; //@line 4502
     $$048 = $8; //@line 4502
     break;
    }
   }
   if (($8 | 0) >= 8) {
    switch ($8 | 0) {
    case 64:
     {
      $$043 = 6; //@line 4510
      $$048 = $8; //@line 4510
      break L2;
      break;
     }
    case 32:
     {
      $$043 = 5; //@line 4515
      $$048 = $8; //@line 4515
      break L2;
      break;
     }
    case 16:
     {
      $$043 = 4; //@line 4520
      $$048 = $8; //@line 4520
      break L2;
      break;
     }
    case 8:
     {
      $$043 = 3; //@line 4525
      $$048 = $8; //@line 4525
      break L2;
      break;
     }
    default:
     {
      label = 43; //@line 4530
      break L2;
     }
    }
   }
   if (($8 | 0) >= 2) {
    switch ($8 | 0) {
    case 4:
     {
      $$043 = 2; //@line 4539
      $$048 = $8; //@line 4539
      break L2;
      break;
     }
    case 2:
     {
      $$043 = 1; //@line 4544
      $$048 = $8; //@line 4544
      break L2;
      break;
     }
    default:
     {
      label = 43; //@line 4549
      break L2;
     }
    }
   }
   if (($8 | 0) < 0) {
    switch ($8 | 0) {
    case -2147483648:
     {
      $$043 = 31; //@line 4558
      $$048 = -2147483648; //@line 4558
      break L2;
      break;
     }
    default:
     {
      label = 43; //@line 4563
      break L2;
     }
    }
   }
   switch ($8 | 0) {
   case 0:
    {
     break;
    }
   default:
    {
     label = 43; //@line 4573
     break L2;
    }
   }
   $ReallocAsyncCtx7 = _emscripten_realloc_async_context(20) | 0; //@line 4577
   _mbed_assert_internal(1799, 1801, 41); //@line 4578
   if (___async) {
    HEAP32[$ReallocAsyncCtx7 >> 2] = 62; //@line 4581
    $9 = $ReallocAsyncCtx7 + 4 | 0; //@line 4582
    HEAP32[$9 >> 2] = $2; //@line 4583
    $10 = $ReallocAsyncCtx7 + 8 | 0; //@line 4584
    HEAP32[$10 >> 2] = $4; //@line 4585
    $11 = $ReallocAsyncCtx7 + 12 | 0; //@line 4586
    HEAP32[$11 >> 2] = $6; //@line 4587
    $12 = $ReallocAsyncCtx7 + 16 | 0; //@line 4588
    HEAP32[$12 >> 2] = $AsyncRetVal; //@line 4589
    sp = STACKTOP; //@line 4590
    return;
   }
   ___async_unwind = 0; //@line 4593
   HEAP32[$ReallocAsyncCtx7 >> 2] = 62; //@line 4594
   $9 = $ReallocAsyncCtx7 + 4 | 0; //@line 4595
   HEAP32[$9 >> 2] = $2; //@line 4596
   $10 = $ReallocAsyncCtx7 + 8 | 0; //@line 4597
   HEAP32[$10 >> 2] = $4; //@line 4598
   $11 = $ReallocAsyncCtx7 + 12 | 0; //@line 4599
   HEAP32[$11 >> 2] = $6; //@line 4600
   $12 = $ReallocAsyncCtx7 + 16 | 0; //@line 4601
   HEAP32[$12 >> 2] = $AsyncRetVal; //@line 4602
   sp = STACKTOP; //@line 4603
   return;
  } else {
   if (($8 | 0) < 8388608) {
    if (($8 | 0) < 524288) {
     if (($8 | 0) < 131072) {
      if (($8 | 0) < 65536) {
       switch ($8 | 0) {
       case 32768:
        {
         break;
        }
       default:
        {
         label = 43; //@line 4619
         break L2;
        }
       }
       $$043 = 15; //@line 4623
       $$048 = $8; //@line 4623
       break;
      } else {
       switch ($8 | 0) {
       case 65536:
        {
         break;
        }
       default:
        {
         label = 43; //@line 4631
         break L2;
        }
       }
       $$043 = 16; //@line 4635
       $$048 = $8; //@line 4635
       break;
      }
     } else {
      if (($8 | 0) < 262144) {
       switch ($8 | 0) {
       case 131072:
        {
         break;
        }
       default:
        {
         label = 43; //@line 4646
         break L2;
        }
       }
       $$043 = 17; //@line 4650
       $$048 = $8; //@line 4650
       break;
      } else {
       switch ($8 | 0) {
       case 262144:
        {
         break;
        }
       default:
        {
         label = 43; //@line 4658
         break L2;
        }
       }
       $$043 = 18; //@line 4662
       $$048 = $8; //@line 4662
       break;
      }
     }
    } else {
     if (($8 | 0) < 2097152) {
      if (($8 | 0) < 1048576) {
       switch ($8 | 0) {
       case 524288:
        {
         break;
        }
       default:
        {
         label = 43; //@line 4676
         break L2;
        }
       }
       $$043 = 19; //@line 4680
       $$048 = $8; //@line 4680
       break;
      } else {
       switch ($8 | 0) {
       case 1048576:
        {
         break;
        }
       default:
        {
         label = 43; //@line 4688
         break L2;
        }
       }
       $$043 = 20; //@line 4692
       $$048 = $8; //@line 4692
       break;
      }
     } else {
      if (($8 | 0) < 4194304) {
       switch ($8 | 0) {
       case 2097152:
        {
         break;
        }
       default:
        {
         label = 43; //@line 4703
         break L2;
        }
       }
       $$043 = 21; //@line 4707
       $$048 = $8; //@line 4707
       break;
      } else {
       switch ($8 | 0) {
       case 4194304:
        {
         break;
        }
       default:
        {
         label = 43; //@line 4715
         break L2;
        }
       }
       $$043 = 22; //@line 4719
       $$048 = $8; //@line 4719
       break;
      }
     }
    }
   } else {
    if (($8 | 0) < 134217728) {
     if (($8 | 0) < 33554432) {
      if (($8 | 0) < 16777216) {
       switch ($8 | 0) {
       case 8388608:
        {
         break;
        }
       default:
        {
         label = 43; //@line 4736
         break L2;
        }
       }
       $$043 = 23; //@line 4740
       $$048 = $8; //@line 4740
       break;
      } else {
       switch ($8 | 0) {
       case 16777216:
        {
         break;
        }
       default:
        {
         label = 43; //@line 4748
         break L2;
        }
       }
       $$043 = 24; //@line 4752
       $$048 = $8; //@line 4752
       break;
      }
     } else {
      if (($8 | 0) < 67108864) {
       switch ($8 | 0) {
       case 33554432:
        {
         break;
        }
       default:
        {
         label = 43; //@line 4763
         break L2;
        }
       }
       $$043 = 25; //@line 4767
       $$048 = $8; //@line 4767
       break;
      } else {
       switch ($8 | 0) {
       case 67108864:
        {
         break;
        }
       default:
        {
         label = 43; //@line 4775
         break L2;
        }
       }
       $$043 = 26; //@line 4779
       $$048 = $8; //@line 4779
       break;
      }
     }
    } else {
     if (($8 | 0) < 536870912) {
      if (($8 | 0) < 268435456) {
       switch ($8 | 0) {
       case 134217728:
        {
         break;
        }
       default:
        {
         label = 43; //@line 4793
         break L2;
        }
       }
       $$043 = 27; //@line 4797
       $$048 = $8; //@line 4797
       break;
      } else {
       switch ($8 | 0) {
       case 268435456:
        {
         break;
        }
       default:
        {
         label = 43; //@line 4805
         break L2;
        }
       }
       $$043 = 28; //@line 4809
       $$048 = $8; //@line 4809
       break;
      }
     } else {
      if (($8 | 0) < 1073741824) {
       switch ($8 | 0) {
       case 536870912:
        {
         break;
        }
       default:
        {
         label = 43; //@line 4820
         break L2;
        }
       }
       $$043 = 29; //@line 4824
       $$048 = $8; //@line 4824
       break;
      } else {
       switch ($8 | 0) {
       case 1073741824:
        {
         break;
        }
       default:
        {
         label = 43; //@line 4832
         break L2;
        }
       }
       $$043 = 30; //@line 4836
       $$048 = $8; //@line 4836
       break;
      }
     }
    }
   }
  }
 } while (0);
 if ((label | 0) == 43) {
  $$043 = 0; //@line 4845
  $$048 = $8; //@line 4845
 }
 $14 = HEAP32[$AsyncRetVal + 4 >> 2] | 0; //@line 4848
 if (($14 + -4 | 0) >>> 0 > 28) {
  $ReallocAsyncCtx6 = _emscripten_realloc_async_context(24) | 0; //@line 4852
  _mbed_assert_internal(1799, 1801, 55); //@line 4853
  if (___async) {
   HEAP32[$ReallocAsyncCtx6 >> 2] = 63; //@line 4856
   $16 = $ReallocAsyncCtx6 + 4 | 0; //@line 4857
   HEAP32[$16 >> 2] = $$048; //@line 4858
   $17 = $ReallocAsyncCtx6 + 8 | 0; //@line 4859
   HEAP32[$17 >> 2] = $2; //@line 4860
   $18 = $ReallocAsyncCtx6 + 12 | 0; //@line 4861
   HEAP32[$18 >> 2] = $4; //@line 4862
   $19 = $ReallocAsyncCtx6 + 16 | 0; //@line 4863
   HEAP32[$19 >> 2] = $6; //@line 4864
   $20 = $ReallocAsyncCtx6 + 20 | 0; //@line 4865
   HEAP8[$20 >> 0] = $$043; //@line 4866
   sp = STACKTOP; //@line 4867
   return;
  }
  ___async_unwind = 0; //@line 4870
  HEAP32[$ReallocAsyncCtx6 >> 2] = 63; //@line 4871
  $16 = $ReallocAsyncCtx6 + 4 | 0; //@line 4872
  HEAP32[$16 >> 2] = $$048; //@line 4873
  $17 = $ReallocAsyncCtx6 + 8 | 0; //@line 4874
  HEAP32[$17 >> 2] = $2; //@line 4875
  $18 = $ReallocAsyncCtx6 + 12 | 0; //@line 4876
  HEAP32[$18 >> 2] = $4; //@line 4877
  $19 = $ReallocAsyncCtx6 + 16 | 0; //@line 4878
  HEAP32[$19 >> 2] = $6; //@line 4879
  $20 = $ReallocAsyncCtx6 + 20 | 0; //@line 4880
  HEAP8[$20 >> 0] = $$043; //@line 4881
  sp = STACKTOP; //@line 4882
  return;
 } else {
  $22 = 7 << $14 + -4; //@line 4886
  $23 = ___muldi3($22 | 0, 0, 1e6, 0) | 0; //@line 4887
  $24 = tempRet0; //@line 4888
  $25 = _i64Add($$048 | 0, 0, -1, -1) | 0; //@line 4889
  $27 = _i64Add($25 | 0, tempRet0 | 0, $23 | 0, $24 | 0) | 0; //@line 4891
  $29 = ___udivdi3($27 | 0, tempRet0 | 0, $$048 | 0, 0) | 0; //@line 4893
  $30 = tempRet0; //@line 4894
  $31 = HEAP32[$2 >> 2] | 0; //@line 4895
  HEAP32[$31 >> 2] = 0; //@line 4896
  HEAP32[$31 + 4 >> 2] = 0; //@line 4898
  $35 = HEAP32[(HEAP32[$4 >> 2] | 0) + 4 >> 2] | 0; //@line 4901
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 4902
  $36 = FUNCTION_TABLE_i[$35 & 3]() | 0; //@line 4903
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 4906
   $37 = $ReallocAsyncCtx3 + 4 | 0; //@line 4907
   HEAP32[$37 >> 2] = $2; //@line 4908
   $38 = $ReallocAsyncCtx3 + 8 | 0; //@line 4909
   HEAP32[$38 >> 2] = $$048; //@line 4910
   $39 = $ReallocAsyncCtx3 + 12 | 0; //@line 4911
   HEAP8[$39 >> 0] = $$043; //@line 4912
   $40 = $ReallocAsyncCtx3 + 16 | 0; //@line 4913
   HEAP32[$40 >> 2] = $14; //@line 4914
   $41 = $ReallocAsyncCtx3 + 20 | 0; //@line 4915
   HEAP32[$41 >> 2] = $22; //@line 4916
   $42 = $ReallocAsyncCtx3 + 24 | 0; //@line 4917
   $43 = $42; //@line 4918
   $44 = $43; //@line 4919
   HEAP32[$44 >> 2] = $29; //@line 4920
   $45 = $43 + 4 | 0; //@line 4921
   $46 = $45; //@line 4922
   HEAP32[$46 >> 2] = $30; //@line 4923
   $47 = $ReallocAsyncCtx3 + 32 | 0; //@line 4924
   HEAP32[$47 >> 2] = $4; //@line 4925
   $48 = $ReallocAsyncCtx3 + 36 | 0; //@line 4926
   HEAP32[$48 >> 2] = $6; //@line 4927
   sp = STACKTOP; //@line 4928
   return;
  }
  HEAP32[___async_retval >> 2] = $36; //@line 4932
  ___async_unwind = 0; //@line 4933
  HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 4934
  $37 = $ReallocAsyncCtx3 + 4 | 0; //@line 4935
  HEAP32[$37 >> 2] = $2; //@line 4936
  $38 = $ReallocAsyncCtx3 + 8 | 0; //@line 4937
  HEAP32[$38 >> 2] = $$048; //@line 4938
  $39 = $ReallocAsyncCtx3 + 12 | 0; //@line 4939
  HEAP8[$39 >> 0] = $$043; //@line 4940
  $40 = $ReallocAsyncCtx3 + 16 | 0; //@line 4941
  HEAP32[$40 >> 2] = $14; //@line 4942
  $41 = $ReallocAsyncCtx3 + 20 | 0; //@line 4943
  HEAP32[$41 >> 2] = $22; //@line 4944
  $42 = $ReallocAsyncCtx3 + 24 | 0; //@line 4945
  $43 = $42; //@line 4946
  $44 = $43; //@line 4947
  HEAP32[$44 >> 2] = $29; //@line 4948
  $45 = $43 + 4 | 0; //@line 4949
  $46 = $45; //@line 4950
  HEAP32[$46 >> 2] = $30; //@line 4951
  $47 = $ReallocAsyncCtx3 + 32 | 0; //@line 4952
  HEAP32[$47 >> 2] = $4; //@line 4953
  $48 = $ReallocAsyncCtx3 + 36 | 0; //@line 4954
  HEAP32[$48 >> 2] = $6; //@line 4955
  sp = STACKTOP; //@line 4956
  return;
 }
}
function _twoway_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0166 = 0, $$0168 = 0, $$0169 = 0, $$0169$be = 0, $$0170 = 0, $$0175$ph$ph$lcssa216 = 0, $$0175$ph$ph$lcssa216328 = 0, $$0175$ph$ph254 = 0, $$0179242 = 0, $$0183$ph197$ph253 = 0, $$0183$ph197248 = 0, $$0183$ph260 = 0, $$0185$ph$lcssa = 0, $$0185$ph$lcssa327 = 0, $$0185$ph259 = 0, $$0187219$ph325326 = 0, $$0187263 = 0, $$1176$$0175 = 0, $$1176$ph$ph$lcssa208 = 0, $$1176$ph$ph233 = 0, $$1180222 = 0, $$1184$ph193$ph232 = 0, $$1184$ph193227 = 0, $$1184$ph239 = 0, $$1186$$0185 = 0, $$1186$ph$lcssa = 0, $$1186$ph238 = 0, $$2181$sink = 0, $$3 = 0, $$3173 = 0, $$3178 = 0, $$3182221 = 0, $$4 = 0, $$pr = 0, $10 = 0, $105 = 0, $111 = 0, $113 = 0, $118 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $14 = 0, $2 = 0, $23 = 0, $25 = 0, $27 = 0, $3 = 0, $32 = 0, $34 = 0, $37 = 0, $4 = 0, $41 = 0, $45 = 0, $50 = 0, $52 = 0, $53 = 0, $56 = 0, $60 = 0, $68 = 0, $70 = 0, $74 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $83 = 0, $86 = 0, $93 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11458
 STACKTOP = STACKTOP + 1056 | 0; //@line 11459
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(1056); //@line 11459
 $2 = sp + 1024 | 0; //@line 11460
 $3 = sp; //@line 11461
 HEAP32[$2 >> 2] = 0; //@line 11462
 HEAP32[$2 + 4 >> 2] = 0; //@line 11462
 HEAP32[$2 + 8 >> 2] = 0; //@line 11462
 HEAP32[$2 + 12 >> 2] = 0; //@line 11462
 HEAP32[$2 + 16 >> 2] = 0; //@line 11462
 HEAP32[$2 + 20 >> 2] = 0; //@line 11462
 HEAP32[$2 + 24 >> 2] = 0; //@line 11462
 HEAP32[$2 + 28 >> 2] = 0; //@line 11462
 $4 = HEAP8[$1 >> 0] | 0; //@line 11463
 L1 : do {
  if (!($4 << 24 >> 24)) {
   $$0175$ph$ph$lcssa216328 = 1; //@line 11467
   $$0185$ph$lcssa327 = -1; //@line 11467
   $$0187219$ph325326 = 0; //@line 11467
   $$1176$ph$ph$lcssa208 = 1; //@line 11467
   $$1186$ph$lcssa = -1; //@line 11467
   label = 26; //@line 11468
  } else {
   $$0187263 = 0; //@line 11470
   $10 = $4; //@line 11470
   do {
    if (!(HEAP8[$0 + $$0187263 >> 0] | 0)) {
     $$3 = 0; //@line 11476
     break L1;
    }
    $14 = $2 + ((($10 & 255) >>> 5 & 255) << 2) | 0; //@line 11484
    HEAP32[$14 >> 2] = HEAP32[$14 >> 2] | 1 << ($10 & 31); //@line 11487
    $$0187263 = $$0187263 + 1 | 0; //@line 11488
    HEAP32[$3 + (($10 & 255) << 2) >> 2] = $$0187263; //@line 11491
    $10 = HEAP8[$1 + $$0187263 >> 0] | 0; //@line 11493
   } while ($10 << 24 >> 24 != 0);
   $23 = $$0187263 >>> 0 > 1; //@line 11501
   if ($23) {
    $$0183$ph260 = 0; //@line 11503
    $$0185$ph259 = -1; //@line 11503
    $130 = 1; //@line 11503
    L6 : while (1) {
     $$0175$ph$ph254 = 1; //@line 11505
     $$0183$ph197$ph253 = $$0183$ph260; //@line 11505
     $131 = $130; //@line 11505
     while (1) {
      $$0183$ph197248 = $$0183$ph197$ph253; //@line 11507
      $132 = $131; //@line 11507
      L10 : while (1) {
       $$0179242 = 1; //@line 11509
       $25 = $132; //@line 11509
       while (1) {
        $32 = HEAP8[$1 + ($$0179242 + $$0185$ph259) >> 0] | 0; //@line 11513
        $34 = HEAP8[$1 + $25 >> 0] | 0; //@line 11515
        if ($32 << 24 >> 24 != $34 << 24 >> 24) {
         break L10;
        }
        if (($$0179242 | 0) == ($$0175$ph$ph254 | 0)) {
         break;
        }
        $$0179242 = $$0179242 + 1 | 0; //@line 11521
        $27 = $$0179242 + $$0183$ph197248 | 0; //@line 11525
        if ($27 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 11530
         $$0185$ph$lcssa = $$0185$ph259; //@line 11530
         break L6;
        } else {
         $25 = $27; //@line 11528
        }
       }
       $37 = $$0175$ph$ph254 + $$0183$ph197248 | 0; //@line 11534
       $132 = $37 + 1 | 0; //@line 11535
       if ($132 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 11540
        $$0185$ph$lcssa = $$0185$ph259; //@line 11540
        break L6;
       } else {
        $$0183$ph197248 = $37; //@line 11538
       }
      }
      $41 = $25 - $$0185$ph259 | 0; //@line 11545
      if (($32 & 255) <= ($34 & 255)) {
       break;
      }
      $131 = $25 + 1 | 0; //@line 11549
      if ($131 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216 = $41; //@line 11554
       $$0185$ph$lcssa = $$0185$ph259; //@line 11554
       break L6;
      } else {
       $$0175$ph$ph254 = $41; //@line 11552
       $$0183$ph197$ph253 = $25; //@line 11552
      }
     }
     $130 = $$0183$ph197248 + 2 | 0; //@line 11559
     if ($130 >>> 0 >= $$0187263 >>> 0) {
      $$0175$ph$ph$lcssa216 = 1; //@line 11564
      $$0185$ph$lcssa = $$0183$ph197248; //@line 11564
      break;
     } else {
      $$0183$ph260 = $$0183$ph197248 + 1 | 0; //@line 11562
      $$0185$ph259 = $$0183$ph197248; //@line 11562
     }
    }
    if ($23) {
     $$1184$ph239 = 0; //@line 11569
     $$1186$ph238 = -1; //@line 11569
     $133 = 1; //@line 11569
     while (1) {
      $$1176$ph$ph233 = 1; //@line 11571
      $$1184$ph193$ph232 = $$1184$ph239; //@line 11571
      $135 = $133; //@line 11571
      while (1) {
       $$1184$ph193227 = $$1184$ph193$ph232; //@line 11573
       $134 = $135; //@line 11573
       L25 : while (1) {
        $$1180222 = 1; //@line 11575
        $52 = $134; //@line 11575
        while (1) {
         $50 = HEAP8[$1 + ($$1180222 + $$1186$ph238) >> 0] | 0; //@line 11579
         $53 = HEAP8[$1 + $52 >> 0] | 0; //@line 11581
         if ($50 << 24 >> 24 != $53 << 24 >> 24) {
          break L25;
         }
         if (($$1180222 | 0) == ($$1176$ph$ph233 | 0)) {
          break;
         }
         $$1180222 = $$1180222 + 1 | 0; //@line 11587
         $45 = $$1180222 + $$1184$ph193227 | 0; //@line 11591
         if ($45 >>> 0 >= $$0187263 >>> 0) {
          $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11596
          $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11596
          $$0187219$ph325326 = $$0187263; //@line 11596
          $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 11596
          $$1186$ph$lcssa = $$1186$ph238; //@line 11596
          label = 26; //@line 11597
          break L1;
         } else {
          $52 = $45; //@line 11594
         }
        }
        $56 = $$1176$ph$ph233 + $$1184$ph193227 | 0; //@line 11601
        $134 = $56 + 1 | 0; //@line 11602
        if ($134 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11607
         $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11607
         $$0187219$ph325326 = $$0187263; //@line 11607
         $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 11607
         $$1186$ph$lcssa = $$1186$ph238; //@line 11607
         label = 26; //@line 11608
         break L1;
        } else {
         $$1184$ph193227 = $56; //@line 11605
        }
       }
       $60 = $52 - $$1186$ph238 | 0; //@line 11613
       if (($50 & 255) >= ($53 & 255)) {
        break;
       }
       $135 = $52 + 1 | 0; //@line 11617
       if ($135 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11622
        $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11622
        $$0187219$ph325326 = $$0187263; //@line 11622
        $$1176$ph$ph$lcssa208 = $60; //@line 11622
        $$1186$ph$lcssa = $$1186$ph238; //@line 11622
        label = 26; //@line 11623
        break L1;
       } else {
        $$1176$ph$ph233 = $60; //@line 11620
        $$1184$ph193$ph232 = $52; //@line 11620
       }
      }
      $133 = $$1184$ph193227 + 2 | 0; //@line 11628
      if ($133 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11633
       $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11633
       $$0187219$ph325326 = $$0187263; //@line 11633
       $$1176$ph$ph$lcssa208 = 1; //@line 11633
       $$1186$ph$lcssa = $$1184$ph193227; //@line 11633
       label = 26; //@line 11634
       break;
      } else {
       $$1184$ph239 = $$1184$ph193227 + 1 | 0; //@line 11631
       $$1186$ph238 = $$1184$ph193227; //@line 11631
      }
     }
    } else {
     $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11639
     $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11639
     $$0187219$ph325326 = $$0187263; //@line 11639
     $$1176$ph$ph$lcssa208 = 1; //@line 11639
     $$1186$ph$lcssa = -1; //@line 11639
     label = 26; //@line 11640
    }
   } else {
    $$0175$ph$ph$lcssa216328 = 1; //@line 11643
    $$0185$ph$lcssa327 = -1; //@line 11643
    $$0187219$ph325326 = $$0187263; //@line 11643
    $$1176$ph$ph$lcssa208 = 1; //@line 11643
    $$1186$ph$lcssa = -1; //@line 11643
    label = 26; //@line 11644
   }
  }
 } while (0);
 L35 : do {
  if ((label | 0) == 26) {
   $68 = ($$1186$ph$lcssa + 1 | 0) >>> 0 > ($$0185$ph$lcssa327 + 1 | 0) >>> 0; //@line 11652
   $$1176$$0175 = $68 ? $$1176$ph$ph$lcssa208 : $$0175$ph$ph$lcssa216328; //@line 11653
   $$1186$$0185 = $68 ? $$1186$ph$lcssa : $$0185$ph$lcssa327; //@line 11654
   $70 = $$1186$$0185 + 1 | 0; //@line 11656
   if (!(_memcmp($1, $1 + $$1176$$0175 | 0, $70) | 0)) {
    $$0168 = $$0187219$ph325326 - $$1176$$0175 | 0; //@line 11661
    $$3178 = $$1176$$0175; //@line 11661
   } else {
    $74 = $$0187219$ph325326 - $$1186$$0185 + -1 | 0; //@line 11664
    $$0168 = 0; //@line 11668
    $$3178 = ($$1186$$0185 >>> 0 > $74 >>> 0 ? $$1186$$0185 : $74) + 1 | 0; //@line 11668
   }
   $78 = $$0187219$ph325326 | 63; //@line 11670
   $79 = $$0187219$ph325326 + -1 | 0; //@line 11671
   $80 = ($$0168 | 0) != 0; //@line 11672
   $81 = $$0187219$ph325326 - $$3178 | 0; //@line 11673
   $$0166 = $0; //@line 11674
   $$0169 = 0; //@line 11674
   $$0170 = $0; //@line 11674
   while (1) {
    $83 = $$0166; //@line 11677
    do {
     if (($$0170 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
      $86 = _memchr($$0170, 0, $78) | 0; //@line 11682
      if (!$86) {
       $$3173 = $$0170 + $78 | 0; //@line 11686
       break;
      } else {
       if (($86 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
        $$3 = 0; //@line 11693
        break L35;
       } else {
        $$3173 = $86; //@line 11696
        break;
       }
      }
     } else {
      $$3173 = $$0170; //@line 11701
     }
    } while (0);
    $93 = HEAP8[$$0166 + $79 >> 0] | 0; //@line 11705
    L49 : do {
     if (!(1 << ($93 & 31) & HEAP32[$2 + ((($93 & 255) >>> 5 & 255) << 2) >> 2])) {
      $$0169$be = 0; //@line 11717
      $$2181$sink = $$0187219$ph325326; //@line 11717
     } else {
      $105 = $$0187219$ph325326 - (HEAP32[$3 + (($93 & 255) << 2) >> 2] | 0) | 0; //@line 11722
      if ($105 | 0) {
       $$0169$be = 0; //@line 11730
       $$2181$sink = $80 & ($$0169 | 0) != 0 & $105 >>> 0 < $$3178 >>> 0 ? $81 : $105; //@line 11730
       break;
      }
      $111 = $70 >>> 0 > $$0169 >>> 0 ? $70 : $$0169; //@line 11734
      $113 = HEAP8[$1 + $111 >> 0] | 0; //@line 11736
      L54 : do {
       if (!($113 << 24 >> 24)) {
        $$4 = $70; //@line 11740
       } else {
        $$3182221 = $111; //@line 11742
        $$pr = $113; //@line 11742
        while (1) {
         if ($$pr << 24 >> 24 != (HEAP8[$$0166 + $$3182221 >> 0] | 0)) {
          break;
         }
         $118 = $$3182221 + 1 | 0; //@line 11750
         $$pr = HEAP8[$1 + $118 >> 0] | 0; //@line 11752
         if (!($$pr << 24 >> 24)) {
          $$4 = $70; //@line 11755
          break L54;
         } else {
          $$3182221 = $118; //@line 11758
         }
        }
        $$0169$be = 0; //@line 11762
        $$2181$sink = $$3182221 - $$1186$$0185 | 0; //@line 11762
        break L49;
       }
      } while (0);
      while (1) {
       if ($$4 >>> 0 <= $$0169 >>> 0) {
        $$3 = $$0166; //@line 11769
        break L35;
       }
       $$4 = $$4 + -1 | 0; //@line 11772
       if ((HEAP8[$1 + $$4 >> 0] | 0) != (HEAP8[$$0166 + $$4 >> 0] | 0)) {
        $$0169$be = $$0168; //@line 11781
        $$2181$sink = $$3178; //@line 11781
        break;
       }
      }
     }
    } while (0);
    $$0166 = $$0166 + $$2181$sink | 0; //@line 11788
    $$0169 = $$0169$be; //@line 11788
    $$0170 = $$3173; //@line 11788
   }
  }
 } while (0);
 STACKTOP = sp; //@line 11792
 return $$3 | 0; //@line 11792
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13262
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 13268
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 13277
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 13282
      $19 = $1 + 44 | 0; //@line 13283
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 13292
      $26 = $1 + 52 | 0; //@line 13293
      $27 = $1 + 53 | 0; //@line 13294
      $28 = $1 + 54 | 0; //@line 13295
      $29 = $0 + 8 | 0; //@line 13296
      $30 = $1 + 24 | 0; //@line 13297
      $$081$off0 = 0; //@line 13298
      $$084 = $0 + 16 | 0; //@line 13298
      $$085$off0 = 0; //@line 13298
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 13302
        label = 20; //@line 13303
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 13306
       HEAP8[$27 >> 0] = 0; //@line 13307
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 13308
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 13309
       if (___async) {
        label = 12; //@line 13312
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 13315
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 13319
        label = 20; //@line 13320
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 13327
         $$186$off0 = $$085$off0; //@line 13327
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 13336
           label = 20; //@line 13337
           break L10;
          } else {
           $$182$off0 = 1; //@line 13340
           $$186$off0 = $$085$off0; //@line 13340
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 13347
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 13354
          break L10;
         } else {
          $$182$off0 = 1; //@line 13357
          $$186$off0 = 1; //@line 13357
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 13362
       $$084 = $$084 + 8 | 0; //@line 13362
       $$085$off0 = $$186$off0; //@line 13362
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 156; //@line 13365
       HEAP32[$AsyncCtx15 + 4 >> 2] = $27; //@line 13367
       HEAP32[$AsyncCtx15 + 8 >> 2] = $26; //@line 13369
       HEAP32[$AsyncCtx15 + 12 >> 2] = $1; //@line 13371
       HEAP32[$AsyncCtx15 + 16 >> 2] = $2; //@line 13373
       HEAP8[$AsyncCtx15 + 20 >> 0] = $4 & 1; //@line 13376
       HEAP32[$AsyncCtx15 + 24 >> 2] = $25; //@line 13378
       HEAP32[$AsyncCtx15 + 28 >> 2] = $19; //@line 13380
       HEAP32[$AsyncCtx15 + 32 >> 2] = $28; //@line 13382
       HEAP32[$AsyncCtx15 + 36 >> 2] = $29; //@line 13384
       HEAP32[$AsyncCtx15 + 40 >> 2] = $30; //@line 13386
       HEAP32[$AsyncCtx15 + 44 >> 2] = $13; //@line 13388
       HEAP8[$AsyncCtx15 + 48 >> 0] = $$081$off0 & 1; //@line 13391
       HEAP8[$AsyncCtx15 + 49 >> 0] = $$085$off0 & 1; //@line 13394
       HEAP32[$AsyncCtx15 + 52 >> 2] = $$084; //@line 13396
       sp = STACKTOP; //@line 13397
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 13403
         $61 = $1 + 40 | 0; //@line 13404
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 13407
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 13415
           if ($$283$off0) {
            label = 25; //@line 13417
            break;
           } else {
            $69 = 4; //@line 13420
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 13427
        } else {
         $69 = 4; //@line 13429
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 13434
      }
      HEAP32[$19 >> 2] = $69; //@line 13436
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 13445
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 13450
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 13451
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 13452
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 13453
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 157; //@line 13456
    HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 13458
    HEAP32[$AsyncCtx11 + 8 >> 2] = $72; //@line 13460
    HEAP32[$AsyncCtx11 + 12 >> 2] = $73; //@line 13462
    HEAP32[$AsyncCtx11 + 16 >> 2] = $1; //@line 13464
    HEAP32[$AsyncCtx11 + 20 >> 2] = $2; //@line 13466
    HEAP32[$AsyncCtx11 + 24 >> 2] = $3; //@line 13468
    HEAP8[$AsyncCtx11 + 28 >> 0] = $4 & 1; //@line 13471
    sp = STACKTOP; //@line 13472
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 13475
   $81 = $0 + 24 | 0; //@line 13476
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 13480
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 13484
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 13491
       $$2 = $81; //@line 13492
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 13504
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 13505
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 13510
        $136 = $$2 + 8 | 0; //@line 13511
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 13514
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 160; //@line 13519
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 13521
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 13523
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 13525
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 13527
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 13529
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 13531
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 13533
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 13536
       sp = STACKTOP; //@line 13537
       return;
      }
      $104 = $1 + 24 | 0; //@line 13540
      $105 = $1 + 54 | 0; //@line 13541
      $$1 = $81; //@line 13542
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 13558
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 13559
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13564
       $122 = $$1 + 8 | 0; //@line 13565
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 13568
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 159; //@line 13573
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 13575
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 13577
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 13579
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 13581
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 13583
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 13585
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 13587
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 13589
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 13592
      sp = STACKTOP; //@line 13593
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 13597
    $$0 = $81; //@line 13598
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 13605
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 13606
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 13611
     $100 = $$0 + 8 | 0; //@line 13612
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 13615
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 158; //@line 13620
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 13622
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 13624
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 13626
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 13628
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 13630
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 13632
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 13635
    sp = STACKTOP; //@line 13636
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
 $n_sroa_0_0_extract_trunc = $a$0; //@line 6426
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 6427
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 6428
 $d_sroa_0_0_extract_trunc = $b$0; //@line 6429
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 6430
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 6431
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 6433
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 6436
    HEAP32[$rem + 4 >> 2] = 0; //@line 6437
   }
   $_0$1 = 0; //@line 6439
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 6440
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6441
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 6444
    $_0$0 = 0; //@line 6445
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6446
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 6448
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 6449
   $_0$1 = 0; //@line 6450
   $_0$0 = 0; //@line 6451
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6452
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 6455
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 6460
     HEAP32[$rem + 4 >> 2] = 0; //@line 6461
    }
    $_0$1 = 0; //@line 6463
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 6464
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6465
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 6469
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 6470
    }
    $_0$1 = 0; //@line 6472
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 6473
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6474
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 6476
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 6479
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 6480
    }
    $_0$1 = 0; //@line 6482
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 6483
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6484
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 6487
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 6489
    $58 = 31 - $51 | 0; //@line 6490
    $sr_1_ph = $57; //@line 6491
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 6492
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 6493
    $q_sroa_0_1_ph = 0; //@line 6494
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 6495
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 6499
    $_0$0 = 0; //@line 6500
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6501
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 6503
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 6504
   $_0$1 = 0; //@line 6505
   $_0$0 = 0; //@line 6506
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6507
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 6511
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 6513
     $126 = 31 - $119 | 0; //@line 6514
     $130 = $119 - 31 >> 31; //@line 6515
     $sr_1_ph = $125; //@line 6516
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 6517
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 6518
     $q_sroa_0_1_ph = 0; //@line 6519
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 6520
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 6524
     $_0$0 = 0; //@line 6525
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6526
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 6528
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 6529
    $_0$1 = 0; //@line 6530
    $_0$0 = 0; //@line 6531
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6532
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 6534
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 6537
    $89 = 64 - $88 | 0; //@line 6538
    $91 = 32 - $88 | 0; //@line 6539
    $92 = $91 >> 31; //@line 6540
    $95 = $88 - 32 | 0; //@line 6541
    $105 = $95 >> 31; //@line 6542
    $sr_1_ph = $88; //@line 6543
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 6544
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 6545
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 6546
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 6547
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 6551
    HEAP32[$rem + 4 >> 2] = 0; //@line 6552
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 6555
    $_0$0 = $a$0 | 0 | 0; //@line 6556
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6557
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 6559
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 6560
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 6561
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6562
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 6567
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 6568
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 6569
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 6570
  $carry_0_lcssa$1 = 0; //@line 6571
  $carry_0_lcssa$0 = 0; //@line 6572
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 6574
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 6575
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 6576
  $137$1 = tempRet0; //@line 6577
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 6578
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 6579
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 6580
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 6581
  $sr_1202 = $sr_1_ph; //@line 6582
  $carry_0203 = 0; //@line 6583
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 6585
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 6586
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 6587
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 6588
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 6589
   $150$1 = tempRet0; //@line 6590
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 6591
   $carry_0203 = $151$0 & 1; //@line 6592
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 6594
   $r_sroa_1_1200 = tempRet0; //@line 6595
   $sr_1202 = $sr_1202 - 1 | 0; //@line 6596
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 6608
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 6609
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 6610
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 6611
  $carry_0_lcssa$1 = 0; //@line 6612
  $carry_0_lcssa$0 = $carry_0203; //@line 6613
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 6615
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 6616
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 6619
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 6620
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 6622
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 6623
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6624
}
function _schedule_interrupt($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $104 = 0, $109 = 0, $11 = 0, $112 = 0, $114 = 0, $117 = 0, $118 = 0, $120 = 0, $123 = 0, $131 = 0, $132 = 0, $133 = 0, $135 = 0, $137 = 0, $14 = 0, $142 = 0, $149 = 0, $153 = 0, $156 = 0, $158 = 0, $161 = 0, $163 = 0, $170 = 0, $171 = 0, $174 = 0, $176 = 0, $178 = 0, $184 = 0, $185 = 0, $189 = 0, $19 = 0, $197 = 0, $2 = 0, $205 = 0, $208 = 0, $21 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $33 = 0, $35 = 0, $36 = 0, $42 = 0, $43 = 0, $44 = 0, $5 = 0, $53 = 0, $54 = 0, $55 = 0, $57 = 0, $6 = 0, $61 = 0, $62 = 0, $63 = 0, $65 = 0, $67 = 0, $68 = 0, $74 = 0, $75 = 0, $76 = 0, $85 = 0, $86 = 0, $87 = 0, $89 = 0, $93 = 0, $94 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx14 = 0, $AsyncCtx18 = 0, $AsyncCtx22 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2309
 $1 = $0 + 4 | 0; //@line 2310
 $2 = HEAP32[$1 >> 2] | 0; //@line 2311
 $5 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 2314
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 2315
 $6 = FUNCTION_TABLE_i[$5 & 3]() | 0; //@line 2316
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 67; //@line 2319
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2321
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 2323
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 2325
  sp = STACKTOP; //@line 2326
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2329
 $10 = HEAP32[$1 >> 2] | 0; //@line 2330
 $11 = $10 + 32 | 0; //@line 2331
 if (($6 | 0) != (HEAP32[$11 >> 2] | 0)) {
  $14 = $2 + 32 | 0; //@line 2335
  $19 = $6 - (HEAP32[$14 >> 2] | 0) & HEAP32[$2 + 12 >> 2]; //@line 2340
  HEAP32[$14 >> 2] = $6; //@line 2341
  $21 = HEAP32[$2 + 8 >> 2] | 0; //@line 2343
  do {
   if (($21 | 0) == 1e6) {
    $100 = $19; //@line 2347
    $101 = 0; //@line 2347
   } else {
    $24 = HEAP8[$2 + 57 >> 0] | 0; //@line 2350
    $26 = ___muldi3($19 | 0, 0, 1e6, 0) | 0; //@line 2352
    $27 = tempRet0; //@line 2353
    if (!($24 << 24 >> 24)) {
     $61 = ___udivdi3($26 | 0, $27 | 0, $21 | 0, 0) | 0; //@line 2355
     $62 = tempRet0; //@line 2356
     $63 = ___muldi3($61 | 0, $62 | 0, $21 | 0, 0) | 0; //@line 2357
     $65 = _i64Subtract($26 | 0, $27 | 0, $63 | 0, tempRet0 | 0) | 0; //@line 2359
     $67 = $2 + 40 | 0; //@line 2361
     $68 = $67; //@line 2362
     $74 = _i64Add($65 | 0, tempRet0 | 0, HEAP32[$68 >> 2] | 0, HEAP32[$68 + 4 >> 2] | 0) | 0; //@line 2368
     $75 = tempRet0; //@line 2369
     $76 = $67; //@line 2370
     HEAP32[$76 >> 2] = $74; //@line 2372
     HEAP32[$76 + 4 >> 2] = $75; //@line 2375
     if ($75 >>> 0 < 0 | ($75 | 0) == 0 & $74 >>> 0 < $21 >>> 0) {
      $100 = $61; //@line 2382
      $101 = $62; //@line 2382
      break;
     }
     $85 = _i64Add($61 | 0, $62 | 0, 1, 0) | 0; //@line 2385
     $86 = tempRet0; //@line 2386
     $87 = _i64Subtract($74 | 0, $75 | 0, $21 | 0, 0) | 0; //@line 2387
     $89 = $67; //@line 2389
     HEAP32[$89 >> 2] = $87; //@line 2391
     HEAP32[$89 + 4 >> 2] = tempRet0; //@line 2394
     $100 = $85; //@line 2395
     $101 = $86; //@line 2395
     break;
    } else {
     $28 = $24 & 255; //@line 2398
     $29 = _bitshift64Lshr($26 | 0, $27 | 0, $28 | 0) | 0; //@line 2399
     $30 = tempRet0; //@line 2400
     $31 = _bitshift64Shl($29 | 0, $30 | 0, $28 | 0) | 0; //@line 2401
     $33 = _i64Subtract($26 | 0, $27 | 0, $31 | 0, tempRet0 | 0) | 0; //@line 2403
     $35 = $2 + 40 | 0; //@line 2405
     $36 = $35; //@line 2406
     $42 = _i64Add(HEAP32[$36 >> 2] | 0, HEAP32[$36 + 4 >> 2] | 0, $33 | 0, tempRet0 | 0) | 0; //@line 2412
     $43 = tempRet0; //@line 2413
     $44 = $35; //@line 2414
     HEAP32[$44 >> 2] = $42; //@line 2416
     HEAP32[$44 + 4 >> 2] = $43; //@line 2419
     if ($43 >>> 0 < 0 | ($43 | 0) == 0 & $42 >>> 0 < $21 >>> 0) {
      $100 = $29; //@line 2426
      $101 = $30; //@line 2426
      break;
     }
     $53 = _i64Add($29 | 0, $30 | 0, 1, 0) | 0; //@line 2429
     $54 = tempRet0; //@line 2430
     $55 = _i64Subtract($42 | 0, $43 | 0, $21 | 0, 0) | 0; //@line 2431
     $57 = $35; //@line 2433
     HEAP32[$57 >> 2] = $55; //@line 2435
     HEAP32[$57 + 4 >> 2] = tempRet0; //@line 2438
     $100 = $53; //@line 2439
     $101 = $54; //@line 2439
     break;
    }
   }
  } while (0);
  $93 = $2 + 48 | 0; //@line 2444
  $94 = $93; //@line 2445
  $102 = _i64Add(HEAP32[$94 >> 2] | 0, HEAP32[$94 + 4 >> 2] | 0, $100 | 0, $101 | 0) | 0; //@line 2451
  $104 = $93; //@line 2453
  HEAP32[$104 >> 2] = $102; //@line 2455
  HEAP32[$104 + 4 >> 2] = tempRet0; //@line 2458
 }
 $109 = HEAP32[$10 + 4 >> 2] | 0; //@line 2461
 if (!$109) {
  $205 = (HEAP32[$2 + 16 >> 2] | 0) + (HEAP32[$2 + 32 >> 2] | 0) & HEAP32[$2 + 12 >> 2]; //@line 2471
  $208 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 2474
  $AsyncCtx22 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2475
  FUNCTION_TABLE_vi[$208 & 255]($205); //@line 2476
  if (___async) {
   HEAP32[$AsyncCtx22 >> 2] = 73; //@line 2479
   sp = STACKTOP; //@line 2480
   return;
  } else {
   _emscripten_free_async_context($AsyncCtx22 | 0); //@line 2483
   return;
  }
 }
 $112 = $10 + 48 | 0; //@line 2488
 $114 = HEAP32[$112 >> 2] | 0; //@line 2490
 $117 = HEAP32[$112 + 4 >> 2] | 0; //@line 2493
 $118 = $109; //@line 2494
 $120 = HEAP32[$118 >> 2] | 0; //@line 2496
 $123 = HEAP32[$118 + 4 >> 2] | 0; //@line 2499
 if (!($123 >>> 0 > $117 >>> 0 | ($123 | 0) == ($117 | 0) & $120 >>> 0 > $114 >>> 0)) {
  $131 = HEAP32[(HEAP32[$0 >> 2] | 0) + 20 >> 2] | 0; //@line 2508
  $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2509
  FUNCTION_TABLE_v[$131 & 15](); //@line 2510
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 68; //@line 2513
   sp = STACKTOP; //@line 2514
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2517
  return;
 }
 $132 = _i64Subtract($120 | 0, $123 | 0, $114 | 0, $117 | 0) | 0; //@line 2520
 $133 = tempRet0; //@line 2521
 $135 = HEAP32[$10 + 16 >> 2] | 0; //@line 2523
 $137 = $10 + 24 | 0; //@line 2525
 $142 = HEAP32[$137 + 4 >> 2] | 0; //@line 2530
 do {
  if ($133 >>> 0 > $142 >>> 0 | (($133 | 0) == ($142 | 0) ? $132 >>> 0 > (HEAP32[$137 >> 2] | 0) >>> 0 : 0)) {
   $$0$i = $135; //@line 2538
  } else {
   $149 = HEAP32[$10 + 8 >> 2] | 0; //@line 2541
   if (($149 | 0) == 1e6) {
    $$0$i = $135 >>> 0 < $132 >>> 0 ? $135 : $132; //@line 2546
    break;
   }
   $153 = HEAP8[$10 + 57 >> 0] | 0; //@line 2550
   if (!($153 << 24 >> 24)) {
    $161 = ___muldi3($132 | 0, $133 | 0, $149 | 0, 0) | 0; //@line 2553
    $163 = ___udivdi3($161 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 2555
    $$0$i = $135 >>> 0 < $163 >>> 0 ? $135 : $163; //@line 2559
    break;
   } else {
    $156 = _bitshift64Shl($132 | 0, $133 | 0, $153 & 255 | 0) | 0; //@line 2563
    $158 = ___udivdi3($156 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 2565
    $$0$i = $135 >>> 0 < $158 >>> 0 ? $135 : $158; //@line 2569
    break;
   }
  }
 } while (0);
 $170 = (HEAP32[$11 >> 2] | 0) + $$0$i & HEAP32[$10 + 12 >> 2]; //@line 2578
 $171 = $2 + 32 | 0; //@line 2579
 $174 = HEAP32[$0 >> 2] | 0; //@line 2582
 if (($170 | 0) == (HEAP32[$171 >> 2] | 0)) {
  $176 = HEAP32[$174 + 20 >> 2] | 0; //@line 2585
  $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2586
  FUNCTION_TABLE_v[$176 & 15](); //@line 2587
  if (___async) {
   HEAP32[$AsyncCtx7 >> 2] = 69; //@line 2590
   sp = STACKTOP; //@line 2591
   return;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2594
  return;
 }
 $178 = HEAP32[$174 + 16 >> 2] | 0; //@line 2598
 $AsyncCtx11 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2599
 FUNCTION_TABLE_vi[$178 & 255]($170); //@line 2600
 if (___async) {
  HEAP32[$AsyncCtx11 >> 2] = 70; //@line 2603
  HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 2605
  HEAP32[$AsyncCtx11 + 8 >> 2] = $171; //@line 2607
  HEAP32[$AsyncCtx11 + 12 >> 2] = $170; //@line 2609
  sp = STACKTOP; //@line 2610
  return;
 }
 _emscripten_free_async_context($AsyncCtx11 | 0); //@line 2613
 $184 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 2616
 $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2617
 $185 = FUNCTION_TABLE_i[$184 & 3]() | 0; //@line 2618
 if (___async) {
  HEAP32[$AsyncCtx14 >> 2] = 71; //@line 2621
  HEAP32[$AsyncCtx14 + 4 >> 2] = $171; //@line 2623
  HEAP32[$AsyncCtx14 + 8 >> 2] = $170; //@line 2625
  HEAP32[$AsyncCtx14 + 12 >> 2] = $0; //@line 2627
  sp = STACKTOP; //@line 2628
  return;
 }
 _emscripten_free_async_context($AsyncCtx14 | 0); //@line 2631
 $189 = HEAP32[$171 >> 2] | 0; //@line 2632
 if ($170 >>> 0 > $189 >>> 0) {
  if (!($185 >>> 0 >= $170 >>> 0 | $185 >>> 0 < $189 >>> 0)) {
   return;
  }
 } else {
  if (!($185 >>> 0 >= $170 >>> 0 & $185 >>> 0 < $189 >>> 0)) {
   return;
  }
 }
 $197 = HEAP32[(HEAP32[$0 >> 2] | 0) + 20 >> 2] | 0; //@line 2651
 $AsyncCtx18 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2652
 FUNCTION_TABLE_v[$197 & 15](); //@line 2653
 if (___async) {
  HEAP32[$AsyncCtx18 >> 2] = 72; //@line 2656
  sp = STACKTOP; //@line 2657
  return;
 }
 _emscripten_free_async_context($AsyncCtx18 | 0); //@line 2660
 return;
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2750
 STACKTOP = STACKTOP + 32 | 0; //@line 2751
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 2751
 $0 = sp; //@line 2752
 _gpio_init_out($0, 50); //@line 2753
 while (1) {
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2756
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2757
  _wait_ms(150); //@line 2758
  if (___async) {
   label = 3; //@line 2761
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 2764
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2766
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2767
  _wait_ms(150); //@line 2768
  if (___async) {
   label = 5; //@line 2771
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 2774
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2776
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2777
  _wait_ms(150); //@line 2778
  if (___async) {
   label = 7; //@line 2781
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 2784
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2786
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2787
  _wait_ms(150); //@line 2788
  if (___async) {
   label = 9; //@line 2791
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 2794
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2796
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2797
  _wait_ms(150); //@line 2798
  if (___async) {
   label = 11; //@line 2801
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 2804
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2806
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2807
  _wait_ms(150); //@line 2808
  if (___async) {
   label = 13; //@line 2811
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 2814
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2816
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2817
  _wait_ms(150); //@line 2818
  if (___async) {
   label = 15; //@line 2821
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 2824
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2826
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2827
  _wait_ms(150); //@line 2828
  if (___async) {
   label = 17; //@line 2831
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 2834
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2836
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2837
  _wait_ms(400); //@line 2838
  if (___async) {
   label = 19; //@line 2841
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 2844
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2846
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2847
  _wait_ms(400); //@line 2848
  if (___async) {
   label = 21; //@line 2851
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 2854
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2856
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2857
  _wait_ms(400); //@line 2858
  if (___async) {
   label = 23; //@line 2861
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 2864
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2866
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2867
  _wait_ms(400); //@line 2868
  if (___async) {
   label = 25; //@line 2871
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 2874
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2876
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2877
  _wait_ms(400); //@line 2878
  if (___async) {
   label = 27; //@line 2881
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 2884
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2886
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2887
  _wait_ms(400); //@line 2888
  if (___async) {
   label = 29; //@line 2891
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2894
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2896
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2897
  _wait_ms(400); //@line 2898
  if (___async) {
   label = 31; //@line 2901
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2904
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2906
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2907
  _wait_ms(400); //@line 2908
  if (___async) {
   label = 33; //@line 2911
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2914
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 76; //@line 2918
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 2920
   sp = STACKTOP; //@line 2921
   STACKTOP = sp; //@line 2922
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 77; //@line 2926
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 2928
   sp = STACKTOP; //@line 2929
   STACKTOP = sp; //@line 2930
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 78; //@line 2934
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 2936
   sp = STACKTOP; //@line 2937
   STACKTOP = sp; //@line 2938
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 79; //@line 2942
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 2944
   sp = STACKTOP; //@line 2945
   STACKTOP = sp; //@line 2946
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 80; //@line 2950
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 2952
   sp = STACKTOP; //@line 2953
   STACKTOP = sp; //@line 2954
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 81; //@line 2958
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 2960
   sp = STACKTOP; //@line 2961
   STACKTOP = sp; //@line 2962
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 82; //@line 2966
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 2968
   sp = STACKTOP; //@line 2969
   STACKTOP = sp; //@line 2970
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 83; //@line 2974
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 2976
   sp = STACKTOP; //@line 2977
   STACKTOP = sp; //@line 2978
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 84; //@line 2982
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 2984
   sp = STACKTOP; //@line 2985
   STACKTOP = sp; //@line 2986
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 85; //@line 2990
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 2992
   sp = STACKTOP; //@line 2993
   STACKTOP = sp; //@line 2994
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 86; //@line 2998
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 3000
   sp = STACKTOP; //@line 3001
   STACKTOP = sp; //@line 3002
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 87; //@line 3006
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 3008
   sp = STACKTOP; //@line 3009
   STACKTOP = sp; //@line 3010
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 88; //@line 3014
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 3016
   sp = STACKTOP; //@line 3017
   STACKTOP = sp; //@line 3018
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 89; //@line 3022
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 3024
   sp = STACKTOP; //@line 3025
   STACKTOP = sp; //@line 3026
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 90; //@line 3030
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 3032
   sp = STACKTOP; //@line 3033
   STACKTOP = sp; //@line 3034
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 91; //@line 3038
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3040
   sp = STACKTOP; //@line 3041
   STACKTOP = sp; //@line 3042
   return;
  }
 }
}
function _schedule_interrupt__async_cb($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $100 = 0, $102 = 0, $107 = 0, $110 = 0, $112 = 0, $115 = 0, $116 = 0, $118 = 0, $12 = 0, $121 = 0, $129 = 0, $130 = 0, $131 = 0, $133 = 0, $135 = 0, $140 = 0, $147 = 0, $151 = 0, $154 = 0, $156 = 0, $159 = 0, $161 = 0, $168 = 0, $169 = 0, $17 = 0, $172 = 0, $174 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $187 = 0, $19 = 0, $190 = 0, $2 = 0, $22 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $31 = 0, $33 = 0, $34 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $51 = 0, $52 = 0, $53 = 0, $55 = 0, $59 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $72 = 0, $73 = 0, $74 = 0, $8 = 0, $83 = 0, $84 = 0, $85 = 0, $87 = 0, $9 = 0, $91 = 0, $92 = 0, $98 = 0, $99 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 3518
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3520
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3522
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3526
 $8 = HEAP32[HEAP32[$0 + 12 >> 2] >> 2] | 0; //@line 3527
 $9 = $8 + 32 | 0; //@line 3528
 if (($AsyncRetVal | 0) != (HEAP32[$9 >> 2] | 0)) {
  $12 = $4 + 32 | 0; //@line 3532
  $17 = $AsyncRetVal - (HEAP32[$12 >> 2] | 0) & HEAP32[$4 + 12 >> 2]; //@line 3537
  HEAP32[$12 >> 2] = $AsyncRetVal; //@line 3538
  $19 = HEAP32[$4 + 8 >> 2] | 0; //@line 3540
  do {
   if (($19 | 0) == 1e6) {
    $98 = $17; //@line 3544
    $99 = 0; //@line 3544
   } else {
    $22 = HEAP8[$4 + 57 >> 0] | 0; //@line 3547
    $24 = ___muldi3($17 | 0, 0, 1e6, 0) | 0; //@line 3549
    $25 = tempRet0; //@line 3550
    if (!($22 << 24 >> 24)) {
     $59 = ___udivdi3($24 | 0, $25 | 0, $19 | 0, 0) | 0; //@line 3552
     $60 = tempRet0; //@line 3553
     $61 = ___muldi3($59 | 0, $60 | 0, $19 | 0, 0) | 0; //@line 3554
     $63 = _i64Subtract($24 | 0, $25 | 0, $61 | 0, tempRet0 | 0) | 0; //@line 3556
     $65 = $4 + 40 | 0; //@line 3558
     $66 = $65; //@line 3559
     $72 = _i64Add($63 | 0, tempRet0 | 0, HEAP32[$66 >> 2] | 0, HEAP32[$66 + 4 >> 2] | 0) | 0; //@line 3565
     $73 = tempRet0; //@line 3566
     $74 = $65; //@line 3567
     HEAP32[$74 >> 2] = $72; //@line 3569
     HEAP32[$74 + 4 >> 2] = $73; //@line 3572
     if ($73 >>> 0 < 0 | ($73 | 0) == 0 & $72 >>> 0 < $19 >>> 0) {
      $98 = $59; //@line 3579
      $99 = $60; //@line 3579
      break;
     }
     $83 = _i64Add($59 | 0, $60 | 0, 1, 0) | 0; //@line 3582
     $84 = tempRet0; //@line 3583
     $85 = _i64Subtract($72 | 0, $73 | 0, $19 | 0, 0) | 0; //@line 3584
     $87 = $65; //@line 3586
     HEAP32[$87 >> 2] = $85; //@line 3588
     HEAP32[$87 + 4 >> 2] = tempRet0; //@line 3591
     $98 = $83; //@line 3592
     $99 = $84; //@line 3592
     break;
    } else {
     $26 = $22 & 255; //@line 3595
     $27 = _bitshift64Lshr($24 | 0, $25 | 0, $26 | 0) | 0; //@line 3596
     $28 = tempRet0; //@line 3597
     $29 = _bitshift64Shl($27 | 0, $28 | 0, $26 | 0) | 0; //@line 3598
     $31 = _i64Subtract($24 | 0, $25 | 0, $29 | 0, tempRet0 | 0) | 0; //@line 3600
     $33 = $4 + 40 | 0; //@line 3602
     $34 = $33; //@line 3603
     $40 = _i64Add(HEAP32[$34 >> 2] | 0, HEAP32[$34 + 4 >> 2] | 0, $31 | 0, tempRet0 | 0) | 0; //@line 3609
     $41 = tempRet0; //@line 3610
     $42 = $33; //@line 3611
     HEAP32[$42 >> 2] = $40; //@line 3613
     HEAP32[$42 + 4 >> 2] = $41; //@line 3616
     if ($41 >>> 0 < 0 | ($41 | 0) == 0 & $40 >>> 0 < $19 >>> 0) {
      $98 = $27; //@line 3623
      $99 = $28; //@line 3623
      break;
     }
     $51 = _i64Add($27 | 0, $28 | 0, 1, 0) | 0; //@line 3626
     $52 = tempRet0; //@line 3627
     $53 = _i64Subtract($40 | 0, $41 | 0, $19 | 0, 0) | 0; //@line 3628
     $55 = $33; //@line 3630
     HEAP32[$55 >> 2] = $53; //@line 3632
     HEAP32[$55 + 4 >> 2] = tempRet0; //@line 3635
     $98 = $51; //@line 3636
     $99 = $52; //@line 3636
     break;
    }
   }
  } while (0);
  $91 = $4 + 48 | 0; //@line 3641
  $92 = $91; //@line 3642
  $100 = _i64Add(HEAP32[$92 >> 2] | 0, HEAP32[$92 + 4 >> 2] | 0, $98 | 0, $99 | 0) | 0; //@line 3648
  $102 = $91; //@line 3650
  HEAP32[$102 >> 2] = $100; //@line 3652
  HEAP32[$102 + 4 >> 2] = tempRet0; //@line 3655
 }
 $107 = HEAP32[$8 + 4 >> 2] | 0; //@line 3658
 if (!$107) {
  $187 = (HEAP32[$4 + 16 >> 2] | 0) + (HEAP32[$4 + 32 >> 2] | 0) & HEAP32[$4 + 12 >> 2]; //@line 3668
  $190 = HEAP32[(HEAP32[$2 >> 2] | 0) + 16 >> 2] | 0; //@line 3671
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 3672
  FUNCTION_TABLE_vi[$190 & 255]($187); //@line 3673
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 73; //@line 3676
   sp = STACKTOP; //@line 3677
   return;
  }
  ___async_unwind = 0; //@line 3680
  HEAP32[$ReallocAsyncCtx7 >> 2] = 73; //@line 3681
  sp = STACKTOP; //@line 3682
  return;
 }
 $110 = $8 + 48 | 0; //@line 3686
 $112 = HEAP32[$110 >> 2] | 0; //@line 3688
 $115 = HEAP32[$110 + 4 >> 2] | 0; //@line 3691
 $116 = $107; //@line 3692
 $118 = HEAP32[$116 >> 2] | 0; //@line 3694
 $121 = HEAP32[$116 + 4 >> 2] | 0; //@line 3697
 if (!($121 >>> 0 > $115 >>> 0 | ($121 | 0) == ($115 | 0) & $118 >>> 0 > $112 >>> 0)) {
  $129 = HEAP32[(HEAP32[$2 >> 2] | 0) + 20 >> 2] | 0; //@line 3706
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 3707
  FUNCTION_TABLE_v[$129 & 15](); //@line 3708
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 68; //@line 3711
   sp = STACKTOP; //@line 3712
   return;
  }
  ___async_unwind = 0; //@line 3715
  HEAP32[$ReallocAsyncCtx2 >> 2] = 68; //@line 3716
  sp = STACKTOP; //@line 3717
  return;
 }
 $130 = _i64Subtract($118 | 0, $121 | 0, $112 | 0, $115 | 0) | 0; //@line 3720
 $131 = tempRet0; //@line 3721
 $133 = HEAP32[$8 + 16 >> 2] | 0; //@line 3723
 $135 = $8 + 24 | 0; //@line 3725
 $140 = HEAP32[$135 + 4 >> 2] | 0; //@line 3730
 do {
  if ($131 >>> 0 > $140 >>> 0 | (($131 | 0) == ($140 | 0) ? $130 >>> 0 > (HEAP32[$135 >> 2] | 0) >>> 0 : 0)) {
   $$0$i = $133; //@line 3738
  } else {
   $147 = HEAP32[$8 + 8 >> 2] | 0; //@line 3741
   if (($147 | 0) == 1e6) {
    $$0$i = $133 >>> 0 < $130 >>> 0 ? $133 : $130; //@line 3746
    break;
   }
   $151 = HEAP8[$8 + 57 >> 0] | 0; //@line 3750
   if (!($151 << 24 >> 24)) {
    $159 = ___muldi3($130 | 0, $131 | 0, $147 | 0, 0) | 0; //@line 3753
    $161 = ___udivdi3($159 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 3755
    $$0$i = $133 >>> 0 < $161 >>> 0 ? $133 : $161; //@line 3759
    break;
   } else {
    $154 = _bitshift64Shl($130 | 0, $131 | 0, $151 & 255 | 0) | 0; //@line 3763
    $156 = ___udivdi3($154 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 3765
    $$0$i = $133 >>> 0 < $156 >>> 0 ? $133 : $156; //@line 3769
    break;
   }
  }
 } while (0);
 $168 = (HEAP32[$9 >> 2] | 0) + $$0$i & HEAP32[$8 + 12 >> 2]; //@line 3778
 $169 = $4 + 32 | 0; //@line 3779
 $172 = HEAP32[$2 >> 2] | 0; //@line 3782
 if (($168 | 0) == (HEAP32[$169 >> 2] | 0)) {
  $174 = HEAP32[$172 + 20 >> 2] | 0; //@line 3785
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 3786
  FUNCTION_TABLE_v[$174 & 15](); //@line 3787
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 69; //@line 3790
   sp = STACKTOP; //@line 3791
   return;
  }
  ___async_unwind = 0; //@line 3794
  HEAP32[$ReallocAsyncCtx3 >> 2] = 69; //@line 3795
  sp = STACKTOP; //@line 3796
  return;
 } else {
  $176 = HEAP32[$172 + 16 >> 2] | 0; //@line 3800
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 3801
  FUNCTION_TABLE_vi[$176 & 255]($168); //@line 3802
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 70; //@line 3805
   $177 = $ReallocAsyncCtx4 + 4 | 0; //@line 3806
   HEAP32[$177 >> 2] = $2; //@line 3807
   $178 = $ReallocAsyncCtx4 + 8 | 0; //@line 3808
   HEAP32[$178 >> 2] = $169; //@line 3809
   $179 = $ReallocAsyncCtx4 + 12 | 0; //@line 3810
   HEAP32[$179 >> 2] = $168; //@line 3811
   sp = STACKTOP; //@line 3812
   return;
  }
  ___async_unwind = 0; //@line 3815
  HEAP32[$ReallocAsyncCtx4 >> 2] = 70; //@line 3816
  $177 = $ReallocAsyncCtx4 + 4 | 0; //@line 3817
  HEAP32[$177 >> 2] = $2; //@line 3818
  $178 = $ReallocAsyncCtx4 + 8 | 0; //@line 3819
  HEAP32[$178 >> 2] = $169; //@line 3820
  $179 = $ReallocAsyncCtx4 + 12 | 0; //@line 3821
  HEAP32[$179 >> 2] = $168; //@line 3822
  sp = STACKTOP; //@line 3823
  return;
 }
}
function _main() {
 var $0 = 0, $1 = 0, $13 = 0, $17 = 0, $2 = 0, $22 = 0, $25 = 0, $29 = 0, $33 = 0, $37 = 0, $40 = 0, $43 = 0, $47 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx22 = 0, $AsyncCtx25 = 0, $AsyncCtx28 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 3623
 STACKTOP = STACKTOP + 48 | 0; //@line 3624
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 3624
 $0 = sp + 32 | 0; //@line 3625
 $1 = sp + 16 | 0; //@line 3626
 $2 = sp; //@line 3627
 $AsyncCtx19 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3628
 _puts(2389) | 0; //@line 3629
 if (___async) {
  HEAP32[$AsyncCtx19 >> 2] = 111; //@line 3632
  HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 3634
  HEAP32[$AsyncCtx19 + 8 >> 2] = $1; //@line 3636
  HEAP32[$AsyncCtx19 + 12 >> 2] = $2; //@line 3638
  sp = STACKTOP; //@line 3639
  STACKTOP = sp; //@line 3640
  return 0; //@line 3640
 }
 _emscripten_free_async_context($AsyncCtx19 | 0); //@line 3642
 $AsyncCtx15 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3643
 _puts(2402) | 0; //@line 3644
 if (___async) {
  HEAP32[$AsyncCtx15 >> 2] = 112; //@line 3647
  HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 3649
  HEAP32[$AsyncCtx15 + 8 >> 2] = $1; //@line 3651
  HEAP32[$AsyncCtx15 + 12 >> 2] = $2; //@line 3653
  sp = STACKTOP; //@line 3654
  STACKTOP = sp; //@line 3655
  return 0; //@line 3655
 }
 _emscripten_free_async_context($AsyncCtx15 | 0); //@line 3657
 $AsyncCtx11 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3658
 _puts(2505) | 0; //@line 3659
 if (___async) {
  HEAP32[$AsyncCtx11 >> 2] = 113; //@line 3662
  HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 3664
  HEAP32[$AsyncCtx11 + 8 >> 2] = $1; //@line 3666
  HEAP32[$AsyncCtx11 + 12 >> 2] = $2; //@line 3668
  sp = STACKTOP; //@line 3669
  STACKTOP = sp; //@line 3670
  return 0; //@line 3670
 }
 _emscripten_free_async_context($AsyncCtx11 | 0); //@line 3672
 $13 = $0 + 4 | 0; //@line 3674
 HEAP32[$13 >> 2] = 0; //@line 3676
 HEAP32[$13 + 4 >> 2] = 0; //@line 3679
 HEAP32[$0 >> 2] = 7; //@line 3680
 $17 = $0 + 12 | 0; //@line 3681
 HEAP32[$17 >> 2] = 384; //@line 3682
 $AsyncCtx25 = _emscripten_alloc_async_context(20, sp) | 0; //@line 3683
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5608, $0, 1.0); //@line 3684
 if (___async) {
  HEAP32[$AsyncCtx25 >> 2] = 114; //@line 3687
  HEAP32[$AsyncCtx25 + 4 >> 2] = $1; //@line 3689
  HEAP32[$AsyncCtx25 + 8 >> 2] = $2; //@line 3691
  HEAP32[$AsyncCtx25 + 12 >> 2] = $0; //@line 3693
  HEAP32[$AsyncCtx25 + 16 >> 2] = $17; //@line 3695
  sp = STACKTOP; //@line 3696
  STACKTOP = sp; //@line 3697
  return 0; //@line 3697
 }
 _emscripten_free_async_context($AsyncCtx25 | 0); //@line 3699
 $22 = HEAP32[$17 >> 2] | 0; //@line 3700
 do {
  if ($22 | 0) {
   $25 = HEAP32[$22 + 8 >> 2] | 0; //@line 3705
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 3706
   FUNCTION_TABLE_vi[$25 & 255]($0); //@line 3707
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 115; //@line 3710
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 3712
    HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 3714
    sp = STACKTOP; //@line 3715
    STACKTOP = sp; //@line 3716
    return 0; //@line 3716
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 3718
    break;
   }
  }
 } while (0);
 $29 = $1 + 4 | 0; //@line 3724
 HEAP32[$29 >> 2] = 0; //@line 3726
 HEAP32[$29 + 4 >> 2] = 0; //@line 3729
 HEAP32[$1 >> 2] = 8; //@line 3730
 $33 = $1 + 12 | 0; //@line 3731
 HEAP32[$33 >> 2] = 384; //@line 3732
 $AsyncCtx22 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3733
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5672, $1, 2.5); //@line 3734
 if (___async) {
  HEAP32[$AsyncCtx22 >> 2] = 116; //@line 3737
  HEAP32[$AsyncCtx22 + 4 >> 2] = $33; //@line 3739
  HEAP32[$AsyncCtx22 + 8 >> 2] = $2; //@line 3741
  HEAP32[$AsyncCtx22 + 12 >> 2] = $1; //@line 3743
  sp = STACKTOP; //@line 3744
  STACKTOP = sp; //@line 3745
  return 0; //@line 3745
 }
 _emscripten_free_async_context($AsyncCtx22 | 0); //@line 3747
 $37 = HEAP32[$33 >> 2] | 0; //@line 3748
 do {
  if ($37 | 0) {
   $40 = HEAP32[$37 + 8 >> 2] | 0; //@line 3753
   $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3754
   FUNCTION_TABLE_vi[$40 & 255]($1); //@line 3755
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 117; //@line 3758
    HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 3760
    sp = STACKTOP; //@line 3761
    STACKTOP = sp; //@line 3762
    return 0; //@line 3762
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3764
    break;
   }
  }
 } while (0);
 $43 = $2 + 4 | 0; //@line 3770
 HEAP32[$43 >> 2] = 0; //@line 3772
 HEAP32[$43 + 4 >> 2] = 0; //@line 3775
 HEAP32[$2 >> 2] = 9; //@line 3776
 $47 = $2 + 12 | 0; //@line 3777
 HEAP32[$47 >> 2] = 384; //@line 3778
 $AsyncCtx28 = _emscripten_alloc_async_context(12, sp) | 0; //@line 3779
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5824, $2); //@line 3780
 if (___async) {
  HEAP32[$AsyncCtx28 >> 2] = 118; //@line 3783
  HEAP32[$AsyncCtx28 + 4 >> 2] = $47; //@line 3785
  HEAP32[$AsyncCtx28 + 8 >> 2] = $2; //@line 3787
  sp = STACKTOP; //@line 3788
  STACKTOP = sp; //@line 3789
  return 0; //@line 3789
 }
 _emscripten_free_async_context($AsyncCtx28 | 0); //@line 3791
 $50 = HEAP32[$47 >> 2] | 0; //@line 3792
 do {
  if ($50 | 0) {
   $53 = HEAP32[$50 + 8 >> 2] | 0; //@line 3797
   $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3798
   FUNCTION_TABLE_vi[$53 & 255]($2); //@line 3799
   if (___async) {
    HEAP32[$AsyncCtx7 >> 2] = 119; //@line 3802
    sp = STACKTOP; //@line 3803
    STACKTOP = sp; //@line 3804
    return 0; //@line 3804
   } else {
    _emscripten_free_async_context($AsyncCtx7 | 0); //@line 3806
    break;
   }
  }
 } while (0);
 $AsyncCtx31 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3811
 _wait_ms(-1); //@line 3812
 if (___async) {
  HEAP32[$AsyncCtx31 >> 2] = 120; //@line 3815
  sp = STACKTOP; //@line 3816
  STACKTOP = sp; //@line 3817
  return 0; //@line 3817
 } else {
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 3819
  STACKTOP = sp; //@line 3820
  return 0; //@line 3820
 }
 return 0; //@line 3822
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0.0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $16 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $48 = 0, $6 = 0.0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 2845
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2849
 $6 = +HEAPF32[$0 + 12 >> 2]; //@line 2851
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2853
 $9 = $4 + 12 | 0; //@line 2855
 HEAP32[$9 >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 2856
 $10 = $6 * 1.0e6; //@line 2857
 $11 = ~~$10 >>> 0; //@line 2858
 $12 = +Math_abs($10) >= 1.0 ? $10 > 0.0 ? ~~+Math_min(+Math_floor($10 / 4294967296.0), 4294967295.0) >>> 0 : ~~+Math_ceil(($10 - +(~~$10 >>> 0)) / 4294967296.0) >>> 0 : 0; //@line 2859
 $13 = $8 + 40 | 0; //@line 2860
 do {
  if (($13 | 0) != ($4 | 0)) {
   $15 = $8 + 52 | 0; //@line 2864
   $16 = HEAP32[$15 >> 2] | 0; //@line 2865
   if ($16 | 0) {
    $19 = HEAP32[$16 + 8 >> 2] | 0; //@line 2869
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 2870
    FUNCTION_TABLE_vi[$19 & 255]($13); //@line 2871
    if (___async) {
     HEAP32[$ReallocAsyncCtx2 >> 2] = 122; //@line 2874
     $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 2875
     HEAP32[$20 >> 2] = $9; //@line 2876
     $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 2877
     HEAP32[$21 >> 2] = $15; //@line 2878
     $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 2879
     HEAP32[$22 >> 2] = $13; //@line 2880
     $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 2881
     HEAP32[$23 >> 2] = $4; //@line 2882
     $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 2883
     HEAP32[$24 >> 2] = $9; //@line 2884
     $25 = $ReallocAsyncCtx2 + 24 | 0; //@line 2885
     HEAP32[$25 >> 2] = $8; //@line 2886
     $26 = $ReallocAsyncCtx2 + 32 | 0; //@line 2887
     $27 = $26; //@line 2888
     $28 = $27; //@line 2889
     HEAP32[$28 >> 2] = $11; //@line 2890
     $29 = $27 + 4 | 0; //@line 2891
     $30 = $29; //@line 2892
     HEAP32[$30 >> 2] = $12; //@line 2893
     sp = STACKTOP; //@line 2894
     return;
    }
    ___async_unwind = 0; //@line 2897
    HEAP32[$ReallocAsyncCtx2 >> 2] = 122; //@line 2898
    $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 2899
    HEAP32[$20 >> 2] = $9; //@line 2900
    $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 2901
    HEAP32[$21 >> 2] = $15; //@line 2902
    $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 2903
    HEAP32[$22 >> 2] = $13; //@line 2904
    $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 2905
    HEAP32[$23 >> 2] = $4; //@line 2906
    $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 2907
    HEAP32[$24 >> 2] = $9; //@line 2908
    $25 = $ReallocAsyncCtx2 + 24 | 0; //@line 2909
    HEAP32[$25 >> 2] = $8; //@line 2910
    $26 = $ReallocAsyncCtx2 + 32 | 0; //@line 2911
    $27 = $26; //@line 2912
    $28 = $27; //@line 2913
    HEAP32[$28 >> 2] = $11; //@line 2914
    $29 = $27 + 4 | 0; //@line 2915
    $30 = $29; //@line 2916
    HEAP32[$30 >> 2] = $12; //@line 2917
    sp = STACKTOP; //@line 2918
    return;
   }
   $31 = HEAP32[$9 >> 2] | 0; //@line 2921
   if (!$31) {
    HEAP32[$15 >> 2] = 0; //@line 2924
    break;
   }
   $34 = HEAP32[$31 + 4 >> 2] | 0; //@line 2928
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 2929
   FUNCTION_TABLE_vii[$34 & 3]($13, $4); //@line 2930
   if (___async) {
    HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 2933
    $35 = $ReallocAsyncCtx3 + 4 | 0; //@line 2934
    HEAP32[$35 >> 2] = $9; //@line 2935
    $36 = $ReallocAsyncCtx3 + 8 | 0; //@line 2936
    HEAP32[$36 >> 2] = $15; //@line 2937
    $37 = $ReallocAsyncCtx3 + 12 | 0; //@line 2938
    HEAP32[$37 >> 2] = $8; //@line 2939
    $38 = $ReallocAsyncCtx3 + 16 | 0; //@line 2940
    $39 = $38; //@line 2941
    $40 = $39; //@line 2942
    HEAP32[$40 >> 2] = $11; //@line 2943
    $41 = $39 + 4 | 0; //@line 2944
    $42 = $41; //@line 2945
    HEAP32[$42 >> 2] = $12; //@line 2946
    $43 = $ReallocAsyncCtx3 + 24 | 0; //@line 2947
    HEAP32[$43 >> 2] = $9; //@line 2948
    $44 = $ReallocAsyncCtx3 + 28 | 0; //@line 2949
    HEAP32[$44 >> 2] = $4; //@line 2950
    sp = STACKTOP; //@line 2951
    return;
   }
   ___async_unwind = 0; //@line 2954
   HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 2955
   $35 = $ReallocAsyncCtx3 + 4 | 0; //@line 2956
   HEAP32[$35 >> 2] = $9; //@line 2957
   $36 = $ReallocAsyncCtx3 + 8 | 0; //@line 2958
   HEAP32[$36 >> 2] = $15; //@line 2959
   $37 = $ReallocAsyncCtx3 + 12 | 0; //@line 2960
   HEAP32[$37 >> 2] = $8; //@line 2961
   $38 = $ReallocAsyncCtx3 + 16 | 0; //@line 2962
   $39 = $38; //@line 2963
   $40 = $39; //@line 2964
   HEAP32[$40 >> 2] = $11; //@line 2965
   $41 = $39 + 4 | 0; //@line 2966
   $42 = $41; //@line 2967
   HEAP32[$42 >> 2] = $12; //@line 2968
   $43 = $ReallocAsyncCtx3 + 24 | 0; //@line 2969
   HEAP32[$43 >> 2] = $9; //@line 2970
   $44 = $ReallocAsyncCtx3 + 28 | 0; //@line 2971
   HEAP32[$44 >> 2] = $4; //@line 2972
   sp = STACKTOP; //@line 2973
   return;
  }
 } while (0);
 __ZN4mbed6Ticker5setupEy($8, $11, $12); //@line 2977
 $45 = HEAP32[$9 >> 2] | 0; //@line 2978
 if (!$45) {
  return;
 }
 $48 = HEAP32[$45 + 8 >> 2] | 0; //@line 2984
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 2985
 FUNCTION_TABLE_vi[$48 & 255]($4); //@line 2986
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 2989
  sp = STACKTOP; //@line 2990
  return;
 }
 ___async_unwind = 0; //@line 2993
 HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 2994
 sp = STACKTOP; //@line 2995
 return;
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
      HEAP32[$AsyncCtx >> 2] = 27; //@line 346
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
      HEAP32[$AsyncCtx2 >> 2] = 28; //@line 382
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
     HEAP32[$AsyncCtx5 >> 2] = 29; //@line 420
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
      HEAP32[$AsyncCtx8 >> 2] = 30; //@line 445
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
      HEAP32[$AsyncCtx11 >> 2] = 31; //@line 471
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
function _mbed_vtracef__async_cb_4($0) {
 $0 = $0 | 0;
 var $$10 = 0, $$3147168 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $28 = 0, $32 = 0, $36 = 0, $38 = 0, $4 = 0, $42 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $54 = 0, $56 = 0, $6 = 0, $67 = 0, $68 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $79 = 0, $80 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 576
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 578
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 580
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 582
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 588
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 590
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 592
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 594
 $20 = HEAP8[$0 + 40 >> 0] & 1; //@line 597
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 599
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 601
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 605
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 609
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 613
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 615
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 619
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 623
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 625
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 628
 $50 = _snprintf($4, $6, 1716, $2) | 0; //@line 629
 $$10 = ($50 | 0) >= ($6 | 0) ? 0 : $50; //@line 631
 $53 = $4 + $$10 | 0; //@line 633
 $54 = $6 - $$10 | 0; //@line 634
 if (($$10 | 0) > 0) {
  if (($54 | 0) > 0) {
   $$3147168 = $54; //@line 638
   $$3169 = $53; //@line 638
   label = 4; //@line 639
  }
 } else {
  $$3147168 = $6; //@line 642
  $$3169 = $4; //@line 642
  label = 4; //@line 643
 }
 if ((label | 0) == 4) {
  $56 = $36 + -2 | 0; //@line 646
  switch ($56 >>> 1 | $56 << 31 | 0) {
  case 0:
   {
    HEAP32[$38 >> 2] = $24; //@line 652
    $$5156 = _snprintf($$3169, $$3147168, 1719, $38) | 0; //@line 654
    break;
   }
  case 1:
   {
    HEAP32[$42 >> 2] = $24; //@line 658
    $$5156 = _snprintf($$3169, $$3147168, 1734, $42) | 0; //@line 660
    break;
   }
  case 3:
   {
    HEAP32[$22 >> 2] = $24; //@line 664
    $$5156 = _snprintf($$3169, $$3147168, 1749, $22) | 0; //@line 666
    break;
   }
  case 7:
   {
    HEAP32[$28 >> 2] = $24; //@line 670
    $$5156 = _snprintf($$3169, $$3147168, 1764, $28) | 0; //@line 672
    break;
   }
  default:
   {
    $$5156 = _snprintf($$3169, $$3147168, 1779, $32) | 0; //@line 677
   }
  }
  $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 681
  $67 = $$3169 + $$5156$ | 0; //@line 683
  $68 = $$3147168 - $$5156$ | 0; //@line 684
  if (($$5156$ | 0) > 0 & ($68 | 0) > 0) {
   $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 688
   $70 = _vsnprintf($67, $68, $16, $18) | 0; //@line 689
   if (___async) {
    HEAP32[$ReallocAsyncCtx10 >> 2] = 53; //@line 692
    $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 693
    HEAP32[$71 >> 2] = $12; //@line 694
    $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 695
    HEAP32[$72 >> 2] = $14; //@line 696
    $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 697
    HEAP32[$73 >> 2] = $46; //@line 698
    $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 699
    HEAP32[$74 >> 2] = $48; //@line 700
    $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 701
    $$expand_i1_val = $20 & 1; //@line 702
    HEAP8[$75 >> 0] = $$expand_i1_val; //@line 703
    $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 704
    HEAP32[$76 >> 2] = $68; //@line 705
    $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 706
    HEAP32[$77 >> 2] = $67; //@line 707
    sp = STACKTOP; //@line 708
    return;
   }
   HEAP32[___async_retval >> 2] = $70; //@line 712
   ___async_unwind = 0; //@line 713
   HEAP32[$ReallocAsyncCtx10 >> 2] = 53; //@line 714
   $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 715
   HEAP32[$71 >> 2] = $12; //@line 716
   $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 717
   HEAP32[$72 >> 2] = $14; //@line 718
   $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 719
   HEAP32[$73 >> 2] = $46; //@line 720
   $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 721
   HEAP32[$74 >> 2] = $48; //@line 722
   $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 723
   $$expand_i1_val = $20 & 1; //@line 724
   HEAP8[$75 >> 0] = $$expand_i1_val; //@line 725
   $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 726
   HEAP32[$76 >> 2] = $68; //@line 727
   $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 728
   HEAP32[$77 >> 2] = $67; //@line 729
   sp = STACKTOP; //@line 730
   return;
  }
 }
 $79 = HEAP32[91] | 0; //@line 734
 $80 = HEAP32[84] | 0; //@line 735
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 736
 FUNCTION_TABLE_vi[$79 & 255]($80); //@line 737
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 740
  sp = STACKTOP; //@line 741
  return;
 }
 ___async_unwind = 0; //@line 744
 HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 745
 sp = STACKTOP; //@line 746
 return;
}
function _initialize__async_cb_79($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $23 = 0, $25 = 0, $26 = 0, $27 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $6 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 5342
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5344
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5346
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5348
 $10 = HEAP32[(HEAP32[$0 + 16 >> 2] | 0) + 4 >> 2] | 0; //@line 5352
 if (($10 + -4 | 0) >>> 0 > 28) {
  $ReallocAsyncCtx6 = _emscripten_realloc_async_context(24) | 0; //@line 5356
  _mbed_assert_internal(1799, 1801, 55); //@line 5357
  if (___async) {
   HEAP32[$ReallocAsyncCtx6 >> 2] = 63; //@line 5360
   $12 = $ReallocAsyncCtx6 + 4 | 0; //@line 5361
   HEAP32[$12 >> 2] = 1e6; //@line 5362
   $13 = $ReallocAsyncCtx6 + 8 | 0; //@line 5363
   HEAP32[$13 >> 2] = $2; //@line 5364
   $14 = $ReallocAsyncCtx6 + 12 | 0; //@line 5365
   HEAP32[$14 >> 2] = $4; //@line 5366
   $15 = $ReallocAsyncCtx6 + 16 | 0; //@line 5367
   HEAP32[$15 >> 2] = $6; //@line 5368
   $16 = $ReallocAsyncCtx6 + 20 | 0; //@line 5369
   HEAP8[$16 >> 0] = 0; //@line 5370
   sp = STACKTOP; //@line 5371
   return;
  }
  ___async_unwind = 0; //@line 5374
  HEAP32[$ReallocAsyncCtx6 >> 2] = 63; //@line 5375
  $12 = $ReallocAsyncCtx6 + 4 | 0; //@line 5376
  HEAP32[$12 >> 2] = 1e6; //@line 5377
  $13 = $ReallocAsyncCtx6 + 8 | 0; //@line 5378
  HEAP32[$13 >> 2] = $2; //@line 5379
  $14 = $ReallocAsyncCtx6 + 12 | 0; //@line 5380
  HEAP32[$14 >> 2] = $4; //@line 5381
  $15 = $ReallocAsyncCtx6 + 16 | 0; //@line 5382
  HEAP32[$15 >> 2] = $6; //@line 5383
  $16 = $ReallocAsyncCtx6 + 20 | 0; //@line 5384
  HEAP8[$16 >> 0] = 0; //@line 5385
  sp = STACKTOP; //@line 5386
  return;
 } else {
  $18 = 7 << $10 + -4; //@line 5390
  $19 = ___muldi3($18 | 0, 0, 1e6, 0) | 0; //@line 5391
  $20 = tempRet0; //@line 5392
  $21 = _i64Add(1e6, 0, -1, -1) | 0; //@line 5393
  $23 = _i64Add($21 | 0, tempRet0 | 0, $19 | 0, $20 | 0) | 0; //@line 5395
  $25 = ___udivdi3($23 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 5397
  $26 = tempRet0; //@line 5398
  $27 = HEAP32[$2 >> 2] | 0; //@line 5399
  HEAP32[$27 >> 2] = 0; //@line 5400
  HEAP32[$27 + 4 >> 2] = 0; //@line 5402
  $31 = HEAP32[(HEAP32[$4 >> 2] | 0) + 4 >> 2] | 0; //@line 5405
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 5406
  $32 = FUNCTION_TABLE_i[$31 & 3]() | 0; //@line 5407
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 5410
   $33 = $ReallocAsyncCtx3 + 4 | 0; //@line 5411
   HEAP32[$33 >> 2] = $2; //@line 5412
   $34 = $ReallocAsyncCtx3 + 8 | 0; //@line 5413
   HEAP32[$34 >> 2] = 1e6; //@line 5414
   $35 = $ReallocAsyncCtx3 + 12 | 0; //@line 5415
   HEAP8[$35 >> 0] = 0; //@line 5416
   $36 = $ReallocAsyncCtx3 + 16 | 0; //@line 5417
   HEAP32[$36 >> 2] = $10; //@line 5418
   $37 = $ReallocAsyncCtx3 + 20 | 0; //@line 5419
   HEAP32[$37 >> 2] = $18; //@line 5420
   $38 = $ReallocAsyncCtx3 + 24 | 0; //@line 5421
   $39 = $38; //@line 5422
   $40 = $39; //@line 5423
   HEAP32[$40 >> 2] = $25; //@line 5424
   $41 = $39 + 4 | 0; //@line 5425
   $42 = $41; //@line 5426
   HEAP32[$42 >> 2] = $26; //@line 5427
   $43 = $ReallocAsyncCtx3 + 32 | 0; //@line 5428
   HEAP32[$43 >> 2] = $4; //@line 5429
   $44 = $ReallocAsyncCtx3 + 36 | 0; //@line 5430
   HEAP32[$44 >> 2] = $6; //@line 5431
   sp = STACKTOP; //@line 5432
   return;
  }
  HEAP32[___async_retval >> 2] = $32; //@line 5436
  ___async_unwind = 0; //@line 5437
  HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 5438
  $33 = $ReallocAsyncCtx3 + 4 | 0; //@line 5439
  HEAP32[$33 >> 2] = $2; //@line 5440
  $34 = $ReallocAsyncCtx3 + 8 | 0; //@line 5441
  HEAP32[$34 >> 2] = 1e6; //@line 5442
  $35 = $ReallocAsyncCtx3 + 12 | 0; //@line 5443
  HEAP8[$35 >> 0] = 0; //@line 5444
  $36 = $ReallocAsyncCtx3 + 16 | 0; //@line 5445
  HEAP32[$36 >> 2] = $10; //@line 5446
  $37 = $ReallocAsyncCtx3 + 20 | 0; //@line 5447
  HEAP32[$37 >> 2] = $18; //@line 5448
  $38 = $ReallocAsyncCtx3 + 24 | 0; //@line 5449
  $39 = $38; //@line 5450
  $40 = $39; //@line 5451
  HEAP32[$40 >> 2] = $25; //@line 5452
  $41 = $39 + 4 | 0; //@line 5453
  $42 = $41; //@line 5454
  HEAP32[$42 >> 2] = $26; //@line 5455
  $43 = $ReallocAsyncCtx3 + 32 | 0; //@line 5456
  HEAP32[$43 >> 2] = $4; //@line 5457
  $44 = $ReallocAsyncCtx3 + 36 | 0; //@line 5458
  HEAP32[$44 >> 2] = $6; //@line 5459
  sp = STACKTOP; //@line 5460
  return;
 }
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = +$2;
 var $13 = 0, $14 = 0, $15 = 0.0, $16 = 0, $17 = 0, $18 = 0, $20 = 0, $21 = 0, $24 = 0, $3 = 0, $32 = 0, $36 = 0, $39 = 0, $4 = 0, $44 = 0, $5 = 0, $50 = 0, $51 = 0, $54 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 3832
 STACKTOP = STACKTOP + 16 | 0; //@line 3833
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3833
 $3 = sp; //@line 3834
 $4 = $1 + 12 | 0; //@line 3835
 $5 = HEAP32[$4 >> 2] | 0; //@line 3836
 do {
  if (!$5) {
   $14 = 0; //@line 3840
  } else {
   $8 = HEAP32[$5 + 4 >> 2] | 0; //@line 3843
   $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 3844
   FUNCTION_TABLE_vii[$8 & 3]($3, $1); //@line 3845
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 121; //@line 3848
    HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 3850
    HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 3852
    HEAPF32[$AsyncCtx + 12 >> 2] = $2; //@line 3854
    HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 3856
    sp = STACKTOP; //@line 3857
    STACKTOP = sp; //@line 3858
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 3860
    $14 = HEAP32[$4 >> 2] | 0; //@line 3862
    break;
   }
  }
 } while (0);
 $13 = $3 + 12 | 0; //@line 3867
 HEAP32[$13 >> 2] = $14; //@line 3868
 $15 = $2 * 1.0e6; //@line 3869
 $16 = ~~$15 >>> 0; //@line 3870
 $17 = +Math_abs($15) >= 1.0 ? $15 > 0.0 ? ~~+Math_min(+Math_floor($15 / 4294967296.0), 4294967295.0) >>> 0 : ~~+Math_ceil(($15 - +(~~$15 >>> 0)) / 4294967296.0) >>> 0 : 0; //@line 3871
 $18 = $0 + 40 | 0; //@line 3872
 if (($18 | 0) != ($3 | 0)) {
  $20 = $0 + 52 | 0; //@line 3875
  $21 = HEAP32[$20 >> 2] | 0; //@line 3876
  do {
   if ($21 | 0) {
    $24 = HEAP32[$21 + 8 >> 2] | 0; //@line 3881
    $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3882
    FUNCTION_TABLE_vi[$24 & 255]($18); //@line 3883
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 122; //@line 3886
     HEAP32[$AsyncCtx3 + 4 >> 2] = $13; //@line 3888
     HEAP32[$AsyncCtx3 + 8 >> 2] = $20; //@line 3890
     HEAP32[$AsyncCtx3 + 12 >> 2] = $18; //@line 3892
     HEAP32[$AsyncCtx3 + 16 >> 2] = $3; //@line 3894
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 3896
     HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 3898
     $32 = $AsyncCtx3 + 32 | 0; //@line 3900
     HEAP32[$32 >> 2] = $16; //@line 3902
     HEAP32[$32 + 4 >> 2] = $17; //@line 3905
     sp = STACKTOP; //@line 3906
     STACKTOP = sp; //@line 3907
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3909
     break;
    }
   }
  } while (0);
  $36 = HEAP32[$13 >> 2] | 0; //@line 3914
  do {
   if (!$36) {
    $50 = 0; //@line 3918
   } else {
    $39 = HEAP32[$36 + 4 >> 2] | 0; //@line 3921
    $AsyncCtx6 = _emscripten_alloc_async_context(32, sp) | 0; //@line 3922
    FUNCTION_TABLE_vii[$39 & 3]($18, $3); //@line 3923
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 123; //@line 3926
     HEAP32[$AsyncCtx6 + 4 >> 2] = $13; //@line 3928
     HEAP32[$AsyncCtx6 + 8 >> 2] = $20; //@line 3930
     HEAP32[$AsyncCtx6 + 12 >> 2] = $0; //@line 3932
     $44 = $AsyncCtx6 + 16 | 0; //@line 3934
     HEAP32[$44 >> 2] = $16; //@line 3936
     HEAP32[$44 + 4 >> 2] = $17; //@line 3939
     HEAP32[$AsyncCtx6 + 24 >> 2] = $13; //@line 3941
     HEAP32[$AsyncCtx6 + 28 >> 2] = $3; //@line 3943
     sp = STACKTOP; //@line 3944
     STACKTOP = sp; //@line 3945
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 3947
     $50 = HEAP32[$13 >> 2] | 0; //@line 3949
     break;
    }
   }
  } while (0);
  HEAP32[$20 >> 2] = $50; //@line 3954
 }
 __ZN4mbed6Ticker5setupEy($0, $16, $17); //@line 3956
 $51 = HEAP32[$13 >> 2] | 0; //@line 3957
 if (!$51) {
  STACKTOP = sp; //@line 3960
  return;
 }
 $54 = HEAP32[$51 + 8 >> 2] | 0; //@line 3963
 $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3964
 FUNCTION_TABLE_vi[$54 & 255]($3); //@line 3965
 if (___async) {
  HEAP32[$AsyncCtx10 >> 2] = 124; //@line 3968
  sp = STACKTOP; //@line 3969
  STACKTOP = sp; //@line 3970
  return;
 }
 _emscripten_free_async_context($AsyncCtx10 | 0); //@line 3972
 STACKTOP = sp; //@line 3973
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_83($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5816
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5818
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5820
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5822
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5824
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 5827
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5829
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 5831
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 5833
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 5835
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 5837
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 5839
 $24 = HEAP8[$0 + 48 >> 0] & 1; //@line 5842
 $26 = HEAP8[$0 + 49 >> 0] & 1; //@line 5845
 $28 = HEAP32[$0 + 52 >> 2] | 0; //@line 5847
 L2 : do {
  if (!(HEAP8[$16 >> 0] | 0)) {
   do {
    if (!(HEAP8[$2 >> 0] | 0)) {
     $$182$off0 = $24; //@line 5856
     $$186$off0 = $26; //@line 5856
    } else {
     if (!(HEAP8[$4 >> 0] | 0)) {
      if (!(HEAP32[$18 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $26; //@line 5865
       $$283$off0 = 1; //@line 5865
       label = 13; //@line 5866
       break L2;
      } else {
       $$182$off0 = 1; //@line 5869
       $$186$off0 = $26; //@line 5869
       break;
      }
     }
     if ((HEAP32[$20 >> 2] | 0) == 1) {
      label = 18; //@line 5876
      break L2;
     }
     if (!(HEAP32[$18 >> 2] & 2)) {
      label = 18; //@line 5883
      break L2;
     } else {
      $$182$off0 = 1; //@line 5886
      $$186$off0 = 1; //@line 5886
     }
    }
   } while (0);
   $30 = $28 + 8 | 0; //@line 5890
   if ($30 >>> 0 < $12 >>> 0) {
    HEAP8[$4 >> 0] = 0; //@line 5893
    HEAP8[$2 >> 0] = 0; //@line 5894
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 5895
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $6, $8, $8, 1, $10); //@line 5896
    if (!___async) {
     ___async_unwind = 0; //@line 5899
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 156; //@line 5901
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 5903
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 5905
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 5907
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 5909
    HEAP8[$ReallocAsyncCtx5 + 20 >> 0] = $10 & 1; //@line 5912
    HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $12; //@line 5914
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 5916
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $16; //@line 5918
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $18; //@line 5920
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $20; //@line 5922
    HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $22; //@line 5924
    HEAP8[$ReallocAsyncCtx5 + 48 >> 0] = $$182$off0 & 1; //@line 5927
    HEAP8[$ReallocAsyncCtx5 + 49 >> 0] = $$186$off0 & 1; //@line 5930
    HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $30; //@line 5932
    sp = STACKTOP; //@line 5933
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 5936
    $$283$off0 = $$182$off0; //@line 5936
    label = 13; //@line 5937
   }
  } else {
   $$085$off0$reg2mem$0 = $26; //@line 5940
   $$283$off0 = $24; //@line 5940
   label = 13; //@line 5941
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$22 >> 2] = $8; //@line 5947
    $59 = $6 + 40 | 0; //@line 5948
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 5951
    if ((HEAP32[$6 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$20 >> 2] | 0) == 2) {
      HEAP8[$16 >> 0] = 1; //@line 5959
      if ($$283$off0) {
       label = 18; //@line 5961
       break;
      } else {
       $67 = 4; //@line 5964
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 5971
   } else {
    $67 = 4; //@line 5973
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 5978
 }
 HEAP32[$14 >> 2] = $67; //@line 5980
 return;
}
function _initialize__async_cb_76($0) {
 $0 = $0 | 0;
 var $10 = 0, $101 = 0, $102 = 0, $103 = 0, $105 = 0, $12 = 0, $14 = 0, $16 = 0, $25 = 0, $26 = 0, $28 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $37 = 0, $39 = 0, $4 = 0, $45 = 0, $46 = 0, $47 = 0, $56 = 0, $57 = 0, $58 = 0, $6 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $70 = 0, $76 = 0, $77 = 0, $78 = 0, $87 = 0, $88 = 0, $89 = 0, $91 = 0, $95 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 5086
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5090
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5092
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5096
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5098
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 5100
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 5102
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5104
 if (($AsyncRetVal | 0) != (HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 32 >> 2] | 0)) {
  $25 = $AsyncRetVal - (HEAP32[$6 >> 2] | 0) & HEAP32[HEAP32[$0 + 16 >> 2] >> 2]; //@line 5113
  HEAP32[$6 >> 2] = $AsyncRetVal; //@line 5114
  $26 = HEAP32[$10 >> 2] | 0; //@line 5115
  do {
   if (($26 | 0) == 1e6) {
    $101 = $25; //@line 5119
    $102 = 0; //@line 5119
   } else {
    $28 = HEAP8[$14 >> 0] | 0; //@line 5121
    $30 = ___muldi3($25 | 0, 0, 1e6, 0) | 0; //@line 5123
    $31 = tempRet0; //@line 5124
    if (!($28 << 24 >> 24)) {
     $64 = ___udivdi3($30 | 0, $31 | 0, $26 | 0, 0) | 0; //@line 5126
     $65 = tempRet0; //@line 5127
     $66 = ___muldi3($64 | 0, $65 | 0, $26 | 0, 0) | 0; //@line 5128
     $68 = _i64Subtract($30 | 0, $31 | 0, $66 | 0, tempRet0 | 0) | 0; //@line 5130
     $70 = $16; //@line 5132
     $76 = _i64Add($68 | 0, tempRet0 | 0, HEAP32[$70 >> 2] | 0, HEAP32[$70 + 4 >> 2] | 0) | 0; //@line 5138
     $77 = tempRet0; //@line 5139
     $78 = $16; //@line 5140
     HEAP32[$78 >> 2] = $76; //@line 5142
     HEAP32[$78 + 4 >> 2] = $77; //@line 5145
     if ($77 >>> 0 < 0 | ($77 | 0) == 0 & $76 >>> 0 < $26 >>> 0) {
      $101 = $64; //@line 5152
      $102 = $65; //@line 5152
      break;
     }
     $87 = _i64Add($64 | 0, $65 | 0, 1, 0) | 0; //@line 5155
     $88 = tempRet0; //@line 5156
     $89 = _i64Subtract($76 | 0, $77 | 0, $26 | 0, 0) | 0; //@line 5157
     $91 = $16; //@line 5159
     HEAP32[$91 >> 2] = $89; //@line 5161
     HEAP32[$91 + 4 >> 2] = tempRet0; //@line 5164
     $101 = $87; //@line 5165
     $102 = $88; //@line 5165
     break;
    } else {
     $32 = $28 & 255; //@line 5168
     $33 = _bitshift64Lshr($30 | 0, $31 | 0, $32 | 0) | 0; //@line 5169
     $34 = tempRet0; //@line 5170
     $35 = _bitshift64Shl($33 | 0, $34 | 0, $32 | 0) | 0; //@line 5171
     $37 = _i64Subtract($30 | 0, $31 | 0, $35 | 0, tempRet0 | 0) | 0; //@line 5173
     $39 = $16; //@line 5175
     $45 = _i64Add(HEAP32[$39 >> 2] | 0, HEAP32[$39 + 4 >> 2] | 0, $37 | 0, tempRet0 | 0) | 0; //@line 5181
     $46 = tempRet0; //@line 5182
     $47 = $16; //@line 5183
     HEAP32[$47 >> 2] = $45; //@line 5185
     HEAP32[$47 + 4 >> 2] = $46; //@line 5188
     if ($46 >>> 0 < 0 | ($46 | 0) == 0 & $45 >>> 0 < $26 >>> 0) {
      $101 = $33; //@line 5195
      $102 = $34; //@line 5195
      break;
     }
     $56 = _i64Add($33 | 0, $34 | 0, 1, 0) | 0; //@line 5198
     $57 = tempRet0; //@line 5199
     $58 = _i64Subtract($45 | 0, $46 | 0, $26 | 0, 0) | 0; //@line 5200
     $60 = $16; //@line 5202
     HEAP32[$60 >> 2] = $58; //@line 5204
     HEAP32[$60 + 4 >> 2] = tempRet0; //@line 5207
     $101 = $56; //@line 5208
     $102 = $57; //@line 5208
     break;
    }
   }
  } while (0);
  $95 = $12; //@line 5213
  $103 = _i64Add(HEAP32[$95 >> 2] | 0, HEAP32[$95 + 4 >> 2] | 0, $101 | 0, $102 | 0) | 0; //@line 5219
  $105 = $12; //@line 5221
  HEAP32[$105 >> 2] = $103; //@line 5223
  HEAP32[$105 + 4 >> 2] = tempRet0; //@line 5226
 }
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(4) | 0; //@line 5228
 _schedule_interrupt($4); //@line 5229
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 66; //@line 5232
  sp = STACKTOP; //@line 5233
  return;
 }
 ___async_unwind = 0; //@line 5236
 HEAP32[$ReallocAsyncCtx5 >> 2] = 66; //@line 5237
 sp = STACKTOP; //@line 5238
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
 sp = STACKTOP; //@line 13100
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 13105
 } else {
  $9 = $1 + 52 | 0; //@line 13107
  $10 = HEAP8[$9 >> 0] | 0; //@line 13108
  $11 = $1 + 53 | 0; //@line 13109
  $12 = HEAP8[$11 >> 0] | 0; //@line 13110
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 13113
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 13114
  HEAP8[$9 >> 0] = 0; //@line 13115
  HEAP8[$11 >> 0] = 0; //@line 13116
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 13117
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 13118
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 154; //@line 13121
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 13123
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 13125
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 13127
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 13129
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 13131
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 13133
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 13135
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 13137
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 13139
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 13141
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 13144
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 13146
   sp = STACKTOP; //@line 13147
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13150
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 13155
    $32 = $0 + 8 | 0; //@line 13156
    $33 = $1 + 54 | 0; //@line 13157
    $$0 = $0 + 24 | 0; //@line 13158
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
     HEAP8[$9 >> 0] = 0; //@line 13191
     HEAP8[$11 >> 0] = 0; //@line 13192
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 13193
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 13194
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 13199
     $62 = $$0 + 8 | 0; //@line 13200
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 13203
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 155; //@line 13208
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 13210
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 13212
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 13214
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 13216
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 13218
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 13220
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 13222
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 13224
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 13226
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 13228
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 13230
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 13232
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 13234
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 13237
    sp = STACKTOP; //@line 13238
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 13242
  HEAP8[$11 >> 0] = $12; //@line 13243
 }
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_82($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5660
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5662
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5666
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5668
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5670
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5672
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 5675
 $15 = $2 + 24 | 0; //@line 5676
 do {
  if ((HEAP32[$0 + 8 >> 2] | 0) > 1) {
   $18 = HEAP32[$2 + 8 >> 2] | 0; //@line 5681
   if (!($18 & 2)) {
    $21 = $8 + 36 | 0; //@line 5685
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $8 + 54 | 0; //@line 5692
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 5703
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $8, $10, $12, $14); //@line 5704
      if (!___async) {
       ___async_unwind = 0; //@line 5707
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 160; //@line 5709
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 5711
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 5713
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 5715
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 5717
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 5719
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 5721
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $12; //@line 5723
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $14 & 1; //@line 5726
      sp = STACKTOP; //@line 5727
      return;
     }
     $36 = $8 + 24 | 0; //@line 5730
     $37 = $8 + 54 | 0; //@line 5731
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 5746
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $8, $10, $12, $14); //@line 5747
     if (!___async) {
      ___async_unwind = 0; //@line 5750
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 159; //@line 5752
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 5754
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 5756
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 5758
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 5760
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 5762
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $8; //@line 5764
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $10; //@line 5766
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $12; //@line 5768
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $14 & 1; //@line 5771
     sp = STACKTOP; //@line 5772
     return;
    }
   }
   $24 = $8 + 54 | 0; //@line 5776
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 5780
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $8, $10, $12, $14); //@line 5781
    if (!___async) {
     ___async_unwind = 0; //@line 5784
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 158; //@line 5786
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 5788
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $6; //@line 5790
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 5792
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 5794
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 5796
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 5798
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 5801
    sp = STACKTOP; //@line 5802
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9559
      $10 = HEAP32[$9 >> 2] | 0; //@line 9560
      HEAP32[$2 >> 2] = $9 + 4; //@line 9562
      HEAP32[$0 >> 2] = $10; //@line 9563
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9579
      $17 = HEAP32[$16 >> 2] | 0; //@line 9580
      HEAP32[$2 >> 2] = $16 + 4; //@line 9582
      $20 = $0; //@line 9585
      HEAP32[$20 >> 2] = $17; //@line 9587
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 9590
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9606
      $30 = HEAP32[$29 >> 2] | 0; //@line 9607
      HEAP32[$2 >> 2] = $29 + 4; //@line 9609
      $31 = $0; //@line 9610
      HEAP32[$31 >> 2] = $30; //@line 9612
      HEAP32[$31 + 4 >> 2] = 0; //@line 9615
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9631
      $41 = $40; //@line 9632
      $43 = HEAP32[$41 >> 2] | 0; //@line 9634
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 9637
      HEAP32[$2 >> 2] = $40 + 8; //@line 9639
      $47 = $0; //@line 9640
      HEAP32[$47 >> 2] = $43; //@line 9642
      HEAP32[$47 + 4 >> 2] = $46; //@line 9645
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9661
      $57 = HEAP32[$56 >> 2] | 0; //@line 9662
      HEAP32[$2 >> 2] = $56 + 4; //@line 9664
      $59 = ($57 & 65535) << 16 >> 16; //@line 9666
      $62 = $0; //@line 9669
      HEAP32[$62 >> 2] = $59; //@line 9671
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 9674
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9690
      $72 = HEAP32[$71 >> 2] | 0; //@line 9691
      HEAP32[$2 >> 2] = $71 + 4; //@line 9693
      $73 = $0; //@line 9695
      HEAP32[$73 >> 2] = $72 & 65535; //@line 9697
      HEAP32[$73 + 4 >> 2] = 0; //@line 9700
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9716
      $83 = HEAP32[$82 >> 2] | 0; //@line 9717
      HEAP32[$2 >> 2] = $82 + 4; //@line 9719
      $85 = ($83 & 255) << 24 >> 24; //@line 9721
      $88 = $0; //@line 9724
      HEAP32[$88 >> 2] = $85; //@line 9726
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 9729
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9745
      $98 = HEAP32[$97 >> 2] | 0; //@line 9746
      HEAP32[$2 >> 2] = $97 + 4; //@line 9748
      $99 = $0; //@line 9750
      HEAP32[$99 >> 2] = $98 & 255; //@line 9752
      HEAP32[$99 + 4 >> 2] = 0; //@line 9755
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9771
      $109 = +HEAPF64[$108 >> 3]; //@line 9772
      HEAP32[$2 >> 2] = $108 + 8; //@line 9774
      HEAPF64[$0 >> 3] = $109; //@line 9775
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9791
      $116 = +HEAPF64[$115 >> 3]; //@line 9792
      HEAP32[$2 >> 2] = $115 + 8; //@line 9794
      HEAPF64[$0 >> 3] = $116; //@line 9795
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
 sp = STACKTOP; //@line 8459
 STACKTOP = STACKTOP + 224 | 0; //@line 8460
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 8460
 $3 = sp + 120 | 0; //@line 8461
 $4 = sp + 80 | 0; //@line 8462
 $5 = sp; //@line 8463
 $6 = sp + 136 | 0; //@line 8464
 dest = $4; //@line 8465
 stop = dest + 40 | 0; //@line 8465
 do {
  HEAP32[dest >> 2] = 0; //@line 8465
  dest = dest + 4 | 0; //@line 8465
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 8467
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 8471
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 8478
  } else {
   $43 = 0; //@line 8480
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 8482
  $14 = $13 & 32; //@line 8483
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 8489
  }
  $19 = $0 + 48 | 0; //@line 8491
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 8496
    $24 = HEAP32[$23 >> 2] | 0; //@line 8497
    HEAP32[$23 >> 2] = $6; //@line 8498
    $25 = $0 + 28 | 0; //@line 8499
    HEAP32[$25 >> 2] = $6; //@line 8500
    $26 = $0 + 20 | 0; //@line 8501
    HEAP32[$26 >> 2] = $6; //@line 8502
    HEAP32[$19 >> 2] = 80; //@line 8503
    $28 = $0 + 16 | 0; //@line 8505
    HEAP32[$28 >> 2] = $6 + 80; //@line 8506
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 8507
    if (!$24) {
     $$1 = $29; //@line 8510
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 8513
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 8514
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 8515
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 134; //@line 8518
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 8520
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 8522
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 8524
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 8526
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 8528
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 8530
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 8532
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 8534
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 8536
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 8538
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 8540
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 8542
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 8544
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 8546
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 8548
      sp = STACKTOP; //@line 8549
      STACKTOP = sp; //@line 8550
      return 0; //@line 8550
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 8552
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 8555
      HEAP32[$23 >> 2] = $24; //@line 8556
      HEAP32[$19 >> 2] = 0; //@line 8557
      HEAP32[$28 >> 2] = 0; //@line 8558
      HEAP32[$25 >> 2] = 0; //@line 8559
      HEAP32[$26 >> 2] = 0; //@line 8560
      $$1 = $$; //@line 8561
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 8567
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 8570
  HEAP32[$0 >> 2] = $51 | $14; //@line 8575
  if ($43 | 0) {
   ___unlockfile($0); //@line 8578
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 8580
 }
 STACKTOP = sp; //@line 8582
 return $$0 | 0; //@line 8582
}
function _initialize__async_cb_75($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $19 = 0, $2 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $30 = 0, $31 = 0, $32 = 0, $34 = 0, $36 = 0, $39 = 0, $4 = 0, $43 = 0, $44 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4966
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4968
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4970
 $6 = HEAP8[$0 + 12 >> 0] | 0; //@line 4972
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4974
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4976
 $12 = $0 + 24 | 0; //@line 4978
 $14 = HEAP32[$12 >> 2] | 0; //@line 4980
 $17 = HEAP32[$12 + 4 >> 2] | 0; //@line 4983
 $19 = HEAP32[$0 + 32 >> 2] | 0; //@line 4985
 $21 = HEAP32[$0 + 36 >> 2] | 0; //@line 4987
 $23 = HEAP32[$2 >> 2] | 0; //@line 4990
 $24 = $23 + 32 | 0; //@line 4991
 HEAP32[$24 >> 2] = HEAP32[___async_retval >> 2]; //@line 4992
 $25 = $23 + 40 | 0; //@line 4993
 $26 = $25; //@line 4994
 HEAP32[$26 >> 2] = 0; //@line 4996
 HEAP32[$26 + 4 >> 2] = 0; //@line 4999
 $30 = $23 + 8 | 0; //@line 5000
 HEAP32[$30 >> 2] = $4; //@line 5001
 $31 = $23 + 57 | 0; //@line 5002
 HEAP8[$31 >> 0] = $6; //@line 5003
 $32 = _bitshift64Shl(1, 0, $8 | 0) | 0; //@line 5004
 $34 = _i64Add($32 | 0, tempRet0 | 0, -1, 0) | 0; //@line 5006
 $36 = $23 + 12 | 0; //@line 5008
 HEAP32[$36 >> 2] = $34; //@line 5009
 HEAP32[$23 + 16 >> 2] = $10; //@line 5011
 $39 = $23 + 24 | 0; //@line 5013
 HEAP32[$39 >> 2] = $14; //@line 5015
 HEAP32[$39 + 4 >> 2] = $17; //@line 5018
 $43 = $23 + 48 | 0; //@line 5019
 $44 = $43; //@line 5020
 HEAP32[$44 >> 2] = 0; //@line 5022
 HEAP32[$44 + 4 >> 2] = 0; //@line 5025
 HEAP8[$23 + 56 >> 0] = 1; //@line 5027
 $51 = HEAP32[(HEAP32[$19 >> 2] | 0) + 4 >> 2] | 0; //@line 5030
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(36) | 0; //@line 5031
 $52 = FUNCTION_TABLE_i[$51 & 3]() | 0; //@line 5032
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 65; //@line 5035
  $53 = $ReallocAsyncCtx4 + 4 | 0; //@line 5036
  HEAP32[$53 >> 2] = $2; //@line 5037
  $54 = $ReallocAsyncCtx4 + 8 | 0; //@line 5038
  HEAP32[$54 >> 2] = $21; //@line 5039
  $55 = $ReallocAsyncCtx4 + 12 | 0; //@line 5040
  HEAP32[$55 >> 2] = $24; //@line 5041
  $56 = $ReallocAsyncCtx4 + 16 | 0; //@line 5042
  HEAP32[$56 >> 2] = $36; //@line 5043
  $57 = $ReallocAsyncCtx4 + 20 | 0; //@line 5044
  HEAP32[$57 >> 2] = $30; //@line 5045
  $58 = $ReallocAsyncCtx4 + 24 | 0; //@line 5046
  HEAP32[$58 >> 2] = $43; //@line 5047
  $59 = $ReallocAsyncCtx4 + 28 | 0; //@line 5048
  HEAP32[$59 >> 2] = $31; //@line 5049
  $60 = $ReallocAsyncCtx4 + 32 | 0; //@line 5050
  HEAP32[$60 >> 2] = $25; //@line 5051
  sp = STACKTOP; //@line 5052
  return;
 }
 HEAP32[___async_retval >> 2] = $52; //@line 5056
 ___async_unwind = 0; //@line 5057
 HEAP32[$ReallocAsyncCtx4 >> 2] = 65; //@line 5058
 $53 = $ReallocAsyncCtx4 + 4 | 0; //@line 5059
 HEAP32[$53 >> 2] = $2; //@line 5060
 $54 = $ReallocAsyncCtx4 + 8 | 0; //@line 5061
 HEAP32[$54 >> 2] = $21; //@line 5062
 $55 = $ReallocAsyncCtx4 + 12 | 0; //@line 5063
 HEAP32[$55 >> 2] = $24; //@line 5064
 $56 = $ReallocAsyncCtx4 + 16 | 0; //@line 5065
 HEAP32[$56 >> 2] = $36; //@line 5066
 $57 = $ReallocAsyncCtx4 + 20 | 0; //@line 5067
 HEAP32[$57 >> 2] = $30; //@line 5068
 $58 = $ReallocAsyncCtx4 + 24 | 0; //@line 5069
 HEAP32[$58 >> 2] = $43; //@line 5070
 $59 = $ReallocAsyncCtx4 + 28 | 0; //@line 5071
 HEAP32[$59 >> 2] = $31; //@line 5072
 $60 = $ReallocAsyncCtx4 + 32 | 0; //@line 5073
 HEAP32[$60 >> 2] = $25; //@line 5074
 sp = STACKTOP; //@line 5075
 return;
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12635
 STACKTOP = STACKTOP + 64 | 0; //@line 12636
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 12636
 $4 = sp; //@line 12637
 $5 = HEAP32[$0 >> 2] | 0; //@line 12638
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 12641
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 12643
 HEAP32[$4 >> 2] = $2; //@line 12644
 HEAP32[$4 + 4 >> 2] = $0; //@line 12646
 HEAP32[$4 + 8 >> 2] = $1; //@line 12648
 HEAP32[$4 + 12 >> 2] = $3; //@line 12650
 $14 = $4 + 16 | 0; //@line 12651
 $15 = $4 + 20 | 0; //@line 12652
 $16 = $4 + 24 | 0; //@line 12653
 $17 = $4 + 28 | 0; //@line 12654
 $18 = $4 + 32 | 0; //@line 12655
 $19 = $4 + 40 | 0; //@line 12656
 dest = $14; //@line 12657
 stop = dest + 36 | 0; //@line 12657
 do {
  HEAP32[dest >> 2] = 0; //@line 12657
  dest = dest + 4 | 0; //@line 12657
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 12657
 HEAP8[$14 + 38 >> 0] = 0; //@line 12657
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 12662
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 12665
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 12666
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 12667
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 146; //@line 12670
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 12672
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 12674
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 12676
    sp = STACKTOP; //@line 12677
    STACKTOP = sp; //@line 12678
    return 0; //@line 12678
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12680
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 12684
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 12688
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 12691
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 12692
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 12693
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 147; //@line 12696
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 12698
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 12700
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 12702
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 12704
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 12706
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 12708
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 12710
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 12712
    sp = STACKTOP; //@line 12713
    STACKTOP = sp; //@line 12714
    return 0; //@line 12714
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12716
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 12730
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 12738
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 12754
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 12759
  }
 } while (0);
 STACKTOP = sp; //@line 12762
 return $$0 | 0; //@line 12762
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 8331
 $7 = ($2 | 0) != 0; //@line 8335
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 8339
   $$03555 = $0; //@line 8340
   $$03654 = $2; //@line 8340
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 8345
     $$036$lcssa64 = $$03654; //@line 8345
     label = 6; //@line 8346
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 8349
    $12 = $$03654 + -1 | 0; //@line 8350
    $16 = ($12 | 0) != 0; //@line 8354
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 8357
     $$03654 = $12; //@line 8357
    } else {
     $$035$lcssa = $11; //@line 8359
     $$036$lcssa = $12; //@line 8359
     $$lcssa = $16; //@line 8359
     label = 5; //@line 8360
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 8365
   $$036$lcssa = $2; //@line 8365
   $$lcssa = $7; //@line 8365
   label = 5; //@line 8366
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 8371
   $$036$lcssa64 = $$036$lcssa; //@line 8371
   label = 6; //@line 8372
  } else {
   $$2 = $$035$lcssa; //@line 8374
   $$3 = 0; //@line 8374
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 8380
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 8383
    $$3 = $$036$lcssa64; //@line 8383
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 8385
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 8389
      $$13745 = $$036$lcssa64; //@line 8389
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 8392
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 8401
       $30 = $$13745 + -4 | 0; //@line 8402
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 8405
        $$13745 = $30; //@line 8405
       } else {
        $$0$lcssa = $29; //@line 8407
        $$137$lcssa = $30; //@line 8407
        label = 11; //@line 8408
        break L11;
       }
      }
      $$140 = $$046; //@line 8412
      $$23839 = $$13745; //@line 8412
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 8414
      $$137$lcssa = $$036$lcssa64; //@line 8414
      label = 11; //@line 8415
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 8421
      $$3 = 0; //@line 8421
      break;
     } else {
      $$140 = $$0$lcssa; //@line 8424
      $$23839 = $$137$lcssa; //@line 8424
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 8431
      $$3 = $$23839; //@line 8431
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 8434
     $$23839 = $$23839 + -1 | 0; //@line 8435
     if (!$$23839) {
      $$2 = $35; //@line 8438
      $$3 = 0; //@line 8438
      break;
     } else {
      $$140 = $35; //@line 8441
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 8449
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 8102
 do {
  if (!$0) {
   do {
    if (!(HEAP32[179] | 0)) {
     $34 = 0; //@line 8110
    } else {
     $12 = HEAP32[179] | 0; //@line 8112
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 8113
     $13 = _fflush($12) | 0; //@line 8114
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 130; //@line 8117
      sp = STACKTOP; //@line 8118
      return 0; //@line 8119
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 8121
      $34 = $13; //@line 8122
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 8128
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 8132
    } else {
     $$02327 = $$02325; //@line 8134
     $$02426 = $34; //@line 8134
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 8141
      } else {
       $28 = 0; //@line 8143
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8151
       $25 = ___fflush_unlocked($$02327) | 0; //@line 8152
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 8157
       $$1 = $25 | $$02426; //@line 8159
      } else {
       $$1 = $$02426; //@line 8161
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 8165
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 8168
      if (!$$023) {
       $$024$lcssa = $$1; //@line 8171
       break L9;
      } else {
       $$02327 = $$023; //@line 8174
       $$02426 = $$1; //@line 8174
      }
     }
     HEAP32[$AsyncCtx >> 2] = 131; //@line 8177
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 8179
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 8181
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 8183
     sp = STACKTOP; //@line 8184
     return 0; //@line 8185
    }
   } while (0);
   ___ofl_unlock(); //@line 8188
   $$0 = $$024$lcssa; //@line 8189
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 8195
    $5 = ___fflush_unlocked($0) | 0; //@line 8196
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 128; //@line 8199
     sp = STACKTOP; //@line 8200
     return 0; //@line 8201
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 8203
     $$0 = $5; //@line 8204
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 8209
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 8210
   $7 = ___fflush_unlocked($0) | 0; //@line 8211
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 129; //@line 8214
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 8217
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 8219
    sp = STACKTOP; //@line 8220
    return 0; //@line 8221
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8223
   if ($phitmp) {
    $$0 = $7; //@line 8225
   } else {
    ___unlockfile($0); //@line 8227
    $$0 = $7; //@line 8228
   }
  }
 } while (0);
 return $$0 | 0; //@line 8232
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12817
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12823
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 12829
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 12832
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12833
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 12834
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 150; //@line 12837
     sp = STACKTOP; //@line 12838
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12841
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 12849
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 12854
     $19 = $1 + 44 | 0; //@line 12855
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 12861
     HEAP8[$22 >> 0] = 0; //@line 12862
     $23 = $1 + 53 | 0; //@line 12863
     HEAP8[$23 >> 0] = 0; //@line 12864
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 12866
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 12869
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 12870
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 12871
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 149; //@line 12874
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 12876
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 12878
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 12880
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 12882
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 12884
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 12886
      sp = STACKTOP; //@line 12887
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 12890
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 12894
      label = 13; //@line 12895
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 12900
       label = 13; //@line 12901
      } else {
       $$037$off039 = 3; //@line 12903
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 12907
      $39 = $1 + 40 | 0; //@line 12908
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 12911
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 12921
        $$037$off039 = $$037$off038; //@line 12922
       } else {
        $$037$off039 = $$037$off038; //@line 12924
       }
      } else {
       $$037$off039 = $$037$off038; //@line 12927
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 12930
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 12937
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_10($0) {
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
 $55 = ($50 | 0 ? 4 : 0) + $50 + (HEAP32[___async_retval >> 2] | 0) | 0; //@line 1072
 $56 = HEAP32[89] | 0; //@line 1073
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(100) | 0; //@line 1074
 $57 = FUNCTION_TABLE_ii[$56 & 1]($55) | 0; //@line 1075
 if (!___async) {
  HEAP32[___async_retval >> 2] = $57; //@line 1079
  ___async_unwind = 0; //@line 1080
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 52; //@line 1082
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 1084
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 1086
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 1088
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 1090
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 1092
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $12; //@line 1094
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 1096
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $22; //@line 1098
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $24; //@line 1100
 HEAP8[$ReallocAsyncCtx5 + 40 >> 0] = $20 & 1; //@line 1103
 HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $26; //@line 1105
 HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $28; //@line 1107
 HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $30; //@line 1109
 HEAP32[$ReallocAsyncCtx5 + 56 >> 2] = $32; //@line 1111
 HEAP32[$ReallocAsyncCtx5 + 60 >> 2] = $34; //@line 1113
 HEAP32[$ReallocAsyncCtx5 + 64 >> 2] = $36; //@line 1115
 HEAP32[$ReallocAsyncCtx5 + 68 >> 2] = $38; //@line 1117
 HEAP32[$ReallocAsyncCtx5 + 72 >> 2] = $40; //@line 1119
 HEAP32[$ReallocAsyncCtx5 + 76 >> 2] = $42; //@line 1121
 HEAP32[$ReallocAsyncCtx5 + 80 >> 2] = $44; //@line 1123
 HEAP32[$ReallocAsyncCtx5 + 84 >> 2] = $46; //@line 1125
 HEAP32[$ReallocAsyncCtx5 + 88 >> 2] = $48; //@line 1127
 HEAP32[$ReallocAsyncCtx5 + 92 >> 2] = $16; //@line 1129
 HEAP32[$ReallocAsyncCtx5 + 96 >> 2] = $18; //@line 1131
 sp = STACKTOP; //@line 1132
 return;
}
function _mbed_vtracef__async_cb_9($0) {
 $0 = $0 | 0;
 var $$13 = 0, $$expand_i1_val = 0, $10 = 0, $12 = 0, $18 = 0, $19 = 0, $2 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 906
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 908
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 910
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 912
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 914
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 917
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 919
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 923
 $$13 = ($AsyncRetVal | 0) >= ($12 | 0) ? 0 : $AsyncRetVal; //@line 925
 $18 = (HEAP32[$0 + 28 >> 2] | 0) + $$13 | 0; //@line 927
 $19 = $12 - $$13 | 0; //@line 928
 do {
  if (($$13 | 0) > 0) {
   $21 = HEAP32[90] | 0; //@line 932
   if (!(($19 | 0) > 0 & ($21 | 0) != 0)) {
    if (($$13 | 0) < 1 | ($19 | 0) < 1 | $10 ^ 1) {
     break;
    }
    _snprintf($18, $19, 1794, $2) | 0; //@line 944
    break;
   }
   $ReallocAsyncCtx6 = _emscripten_realloc_async_context(32) | 0; //@line 947
   $23 = FUNCTION_TABLE_i[$21 & 3]() | 0; //@line 948
   if (___async) {
    HEAP32[$ReallocAsyncCtx6 >> 2] = 54; //@line 951
    $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 952
    HEAP32[$24 >> 2] = $6; //@line 953
    $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 954
    HEAP32[$25 >> 2] = $18; //@line 955
    $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 956
    HEAP32[$26 >> 2] = $19; //@line 957
    $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 958
    HEAP32[$27 >> 2] = $8; //@line 959
    $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 960
    $$expand_i1_val = $10 & 1; //@line 961
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
   HEAP32[$ReallocAsyncCtx6 >> 2] = 54; //@line 973
   $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 974
   HEAP32[$24 >> 2] = $6; //@line 975
   $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 976
   HEAP32[$25 >> 2] = $18; //@line 977
   $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 978
   HEAP32[$26 >> 2] = $19; //@line 979
   $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 980
   HEAP32[$27 >> 2] = $8; //@line 981
   $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 982
   $$expand_i1_val = $10 & 1; //@line 983
   HEAP8[$28 >> 0] = $$expand_i1_val; //@line 984
   $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 985
   HEAP32[$29 >> 2] = $2; //@line 986
   $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 987
   HEAP32[$30 >> 2] = $4; //@line 988
   sp = STACKTOP; //@line 989
   return;
  }
 } while (0);
 $34 = HEAP32[91] | 0; //@line 993
 $35 = HEAP32[84] | 0; //@line 994
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 995
 FUNCTION_TABLE_vi[$34 & 255]($35); //@line 996
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 999
  sp = STACKTOP; //@line 1000
  return;
 }
 ___async_unwind = 0; //@line 1003
 HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 1004
 sp = STACKTOP; //@line 1005
 return;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $12 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $29 = 0, $3 = 0, $36 = 0, $39 = 0, $40 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx14 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 12129
 STACKTOP = STACKTOP + 48 | 0; //@line 12130
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 12130
 $vararg_buffer10 = sp + 32 | 0; //@line 12131
 $vararg_buffer7 = sp + 24 | 0; //@line 12132
 $vararg_buffer3 = sp + 16 | 0; //@line 12133
 $vararg_buffer = sp; //@line 12134
 $0 = sp + 36 | 0; //@line 12135
 $1 = ___cxa_get_globals_fast() | 0; //@line 12136
 if ($1 | 0) {
  $3 = HEAP32[$1 >> 2] | 0; //@line 12139
  if ($3 | 0) {
   $7 = $3 + 48 | 0; //@line 12144
   $9 = HEAP32[$7 >> 2] | 0; //@line 12146
   $12 = HEAP32[$7 + 4 >> 2] | 0; //@line 12149
   if (!(($9 & -256 | 0) == 1126902528 & ($12 | 0) == 1129074247)) {
    HEAP32[$vararg_buffer7 >> 2] = 5104; //@line 12155
    _abort_message(5054, $vararg_buffer7); //@line 12156
   }
   if (($9 | 0) == 1126902529 & ($12 | 0) == 1129074247) {
    $22 = HEAP32[$3 + 44 >> 2] | 0; //@line 12165
   } else {
    $22 = $3 + 80 | 0; //@line 12167
   }
   HEAP32[$0 >> 2] = $22; //@line 12169
   $23 = HEAP32[$3 >> 2] | 0; //@line 12170
   $25 = HEAP32[$23 + 4 >> 2] | 0; //@line 12172
   $28 = HEAP32[(HEAP32[38] | 0) + 16 >> 2] | 0; //@line 12175
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 12176
   $29 = FUNCTION_TABLE_iiii[$28 & 7](152, $23, $0) | 0; //@line 12177
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 140; //@line 12180
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 12182
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 12184
    HEAP32[$AsyncCtx + 12 >> 2] = $25; //@line 12186
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 12188
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 12190
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 12192
    sp = STACKTOP; //@line 12193
    STACKTOP = sp; //@line 12194
    return;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 12196
   if (!$29) {
    HEAP32[$vararg_buffer3 >> 2] = 5104; //@line 12198
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 12200
    _abort_message(5013, $vararg_buffer3); //@line 12201
   }
   $36 = HEAP32[$0 >> 2] | 0; //@line 12204
   $39 = HEAP32[(HEAP32[$36 >> 2] | 0) + 8 >> 2] | 0; //@line 12207
   $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 12208
   $40 = FUNCTION_TABLE_ii[$39 & 1]($36) | 0; //@line 12209
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 141; //@line 12212
    HEAP32[$AsyncCtx14 + 4 >> 2] = $vararg_buffer; //@line 12214
    HEAP32[$AsyncCtx14 + 8 >> 2] = $25; //@line 12216
    HEAP32[$AsyncCtx14 + 12 >> 2] = $vararg_buffer; //@line 12218
    sp = STACKTOP; //@line 12219
    STACKTOP = sp; //@line 12220
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 12222
    HEAP32[$vararg_buffer >> 2] = 5104; //@line 12223
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 12225
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 12227
    _abort_message(4968, $vararg_buffer); //@line 12228
   }
  }
 }
 _abort_message(5092, $vararg_buffer10); //@line 12233
}
function _initialize__async_cb_78($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $17 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5252
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5254
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5256
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5258
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5260
 $10 = HEAP8[$0 + 20 >> 0] | 0; //@line 5262
 $12 = 7 << 32 + -4; //@line 5264
 $13 = ___muldi3($12 | 0, 0, 1e6, 0) | 0; //@line 5265
 $14 = tempRet0; //@line 5266
 $15 = _i64Add($2 | 0, 0, -1, -1) | 0; //@line 5267
 $17 = _i64Add($15 | 0, tempRet0 | 0, $13 | 0, $14 | 0) | 0; //@line 5269
 $19 = ___udivdi3($17 | 0, tempRet0 | 0, $2 | 0, 0) | 0; //@line 5271
 $20 = tempRet0; //@line 5272
 $21 = HEAP32[$4 >> 2] | 0; //@line 5273
 HEAP32[$21 >> 2] = 0; //@line 5274
 HEAP32[$21 + 4 >> 2] = 0; //@line 5276
 $25 = HEAP32[(HEAP32[$6 >> 2] | 0) + 4 >> 2] | 0; //@line 5279
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 5280
 $26 = FUNCTION_TABLE_i[$25 & 3]() | 0; //@line 5281
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 5284
  $27 = $ReallocAsyncCtx3 + 4 | 0; //@line 5285
  HEAP32[$27 >> 2] = $4; //@line 5286
  $28 = $ReallocAsyncCtx3 + 8 | 0; //@line 5287
  HEAP32[$28 >> 2] = $2; //@line 5288
  $29 = $ReallocAsyncCtx3 + 12 | 0; //@line 5289
  HEAP8[$29 >> 0] = $10; //@line 5290
  $30 = $ReallocAsyncCtx3 + 16 | 0; //@line 5291
  HEAP32[$30 >> 2] = 32; //@line 5292
  $31 = $ReallocAsyncCtx3 + 20 | 0; //@line 5293
  HEAP32[$31 >> 2] = $12; //@line 5294
  $32 = $ReallocAsyncCtx3 + 24 | 0; //@line 5295
  $33 = $32; //@line 5296
  $34 = $33; //@line 5297
  HEAP32[$34 >> 2] = $19; //@line 5298
  $35 = $33 + 4 | 0; //@line 5299
  $36 = $35; //@line 5300
  HEAP32[$36 >> 2] = $20; //@line 5301
  $37 = $ReallocAsyncCtx3 + 32 | 0; //@line 5302
  HEAP32[$37 >> 2] = $6; //@line 5303
  $38 = $ReallocAsyncCtx3 + 36 | 0; //@line 5304
  HEAP32[$38 >> 2] = $8; //@line 5305
  sp = STACKTOP; //@line 5306
  return;
 }
 HEAP32[___async_retval >> 2] = $26; //@line 5310
 ___async_unwind = 0; //@line 5311
 HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 5312
 $27 = $ReallocAsyncCtx3 + 4 | 0; //@line 5313
 HEAP32[$27 >> 2] = $4; //@line 5314
 $28 = $ReallocAsyncCtx3 + 8 | 0; //@line 5315
 HEAP32[$28 >> 2] = $2; //@line 5316
 $29 = $ReallocAsyncCtx3 + 12 | 0; //@line 5317
 HEAP8[$29 >> 0] = $10; //@line 5318
 $30 = $ReallocAsyncCtx3 + 16 | 0; //@line 5319
 HEAP32[$30 >> 2] = 32; //@line 5320
 $31 = $ReallocAsyncCtx3 + 20 | 0; //@line 5321
 HEAP32[$31 >> 2] = $12; //@line 5322
 $32 = $ReallocAsyncCtx3 + 24 | 0; //@line 5323
 $33 = $32; //@line 5324
 $34 = $33; //@line 5325
 HEAP32[$34 >> 2] = $19; //@line 5326
 $35 = $33 + 4 | 0; //@line 5327
 $36 = $35; //@line 5328
 HEAP32[$36 >> 2] = $20; //@line 5329
 $37 = $ReallocAsyncCtx3 + 32 | 0; //@line 5330
 HEAP32[$37 >> 2] = $6; //@line 5331
 $38 = $ReallocAsyncCtx3 + 36 | 0; //@line 5332
 HEAP32[$38 >> 2] = $8; //@line 5333
 sp = STACKTOP; //@line 5334
 return;
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_50($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $37 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 3003
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3005
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3007
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3009
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3011
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3013
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3015
 $14 = $0 + 32 | 0; //@line 3017
 $16 = HEAP32[$14 >> 2] | 0; //@line 3019
 $19 = HEAP32[$14 + 4 >> 2] | 0; //@line 3022
 $20 = HEAP32[$2 >> 2] | 0; //@line 3023
 if ($20 | 0) {
  $23 = HEAP32[$20 + 4 >> 2] | 0; //@line 3027
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 3028
  FUNCTION_TABLE_vii[$23 & 3]($6, $8); //@line 3029
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 3032
   $24 = $ReallocAsyncCtx3 + 4 | 0; //@line 3033
   HEAP32[$24 >> 2] = $10; //@line 3034
   $25 = $ReallocAsyncCtx3 + 8 | 0; //@line 3035
   HEAP32[$25 >> 2] = $4; //@line 3036
   $26 = $ReallocAsyncCtx3 + 12 | 0; //@line 3037
   HEAP32[$26 >> 2] = $12; //@line 3038
   $27 = $ReallocAsyncCtx3 + 16 | 0; //@line 3039
   $28 = $27; //@line 3040
   $29 = $28; //@line 3041
   HEAP32[$29 >> 2] = $16; //@line 3042
   $30 = $28 + 4 | 0; //@line 3043
   $31 = $30; //@line 3044
   HEAP32[$31 >> 2] = $19; //@line 3045
   $32 = $ReallocAsyncCtx3 + 24 | 0; //@line 3046
   HEAP32[$32 >> 2] = $2; //@line 3047
   $33 = $ReallocAsyncCtx3 + 28 | 0; //@line 3048
   HEAP32[$33 >> 2] = $8; //@line 3049
   sp = STACKTOP; //@line 3050
   return;
  }
  ___async_unwind = 0; //@line 3053
  HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 3054
  $24 = $ReallocAsyncCtx3 + 4 | 0; //@line 3055
  HEAP32[$24 >> 2] = $10; //@line 3056
  $25 = $ReallocAsyncCtx3 + 8 | 0; //@line 3057
  HEAP32[$25 >> 2] = $4; //@line 3058
  $26 = $ReallocAsyncCtx3 + 12 | 0; //@line 3059
  HEAP32[$26 >> 2] = $12; //@line 3060
  $27 = $ReallocAsyncCtx3 + 16 | 0; //@line 3061
  $28 = $27; //@line 3062
  $29 = $28; //@line 3063
  HEAP32[$29 >> 2] = $16; //@line 3064
  $30 = $28 + 4 | 0; //@line 3065
  $31 = $30; //@line 3066
  HEAP32[$31 >> 2] = $19; //@line 3067
  $32 = $ReallocAsyncCtx3 + 24 | 0; //@line 3068
  HEAP32[$32 >> 2] = $2; //@line 3069
  $33 = $ReallocAsyncCtx3 + 28 | 0; //@line 3070
  HEAP32[$33 >> 2] = $8; //@line 3071
  sp = STACKTOP; //@line 3072
  return;
 }
 HEAP32[$4 >> 2] = 0; //@line 3075
 __ZN4mbed6Ticker5setupEy($12, $16, $19); //@line 3076
 $34 = HEAP32[$2 >> 2] | 0; //@line 3077
 if (!$34) {
  return;
 }
 $37 = HEAP32[$34 + 8 >> 2] | 0; //@line 3083
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 3084
 FUNCTION_TABLE_vi[$37 & 255]($8); //@line 3085
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 3088
  sp = STACKTOP; //@line 3089
  return;
 }
 ___async_unwind = 0; //@line 3092
 HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 3093
 sp = STACKTOP; //@line 3094
 return;
}
function _mbed_error_vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1512
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1514
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1516
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1518
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[1435] | 0)) {
  _serial_init(5744, 2, 3); //@line 1526
 }
 $9 = HEAP8[$4 >> 0] | 0; //@line 1528
 if (0 == 13 | $9 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 1534
  _serial_putc(5744, $9 << 24 >> 24); //@line 1535
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 1538
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 1539
   HEAP32[$18 >> 2] = 0; //@line 1540
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 1541
   HEAP32[$19 >> 2] = $AsyncRetVal; //@line 1542
   $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 1543
   HEAP32[$20 >> 2] = $2; //@line 1544
   $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 1545
   HEAP8[$21 >> 0] = $9; //@line 1546
   $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 1547
   HEAP32[$22 >> 2] = $4; //@line 1548
   sp = STACKTOP; //@line 1549
   return;
  }
  ___async_unwind = 0; //@line 1552
  HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 1553
  $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 1554
  HEAP32[$18 >> 2] = 0; //@line 1555
  $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 1556
  HEAP32[$19 >> 2] = $AsyncRetVal; //@line 1557
  $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 1558
  HEAP32[$20 >> 2] = $2; //@line 1559
  $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 1560
  HEAP8[$21 >> 0] = $9; //@line 1561
  $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 1562
  HEAP32[$22 >> 2] = $4; //@line 1563
  sp = STACKTOP; //@line 1564
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 1567
  _serial_putc(5744, 13); //@line 1568
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 94; //@line 1571
   $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 1572
   HEAP8[$12 >> 0] = $9; //@line 1573
   $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 1574
   HEAP32[$13 >> 2] = 0; //@line 1575
   $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 1576
   HEAP32[$14 >> 2] = $AsyncRetVal; //@line 1577
   $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 1578
   HEAP32[$15 >> 2] = $2; //@line 1579
   $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 1580
   HEAP32[$16 >> 2] = $4; //@line 1581
   sp = STACKTOP; //@line 1582
   return;
  }
  ___async_unwind = 0; //@line 1585
  HEAP32[$ReallocAsyncCtx3 >> 2] = 94; //@line 1586
  $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 1587
  HEAP8[$12 >> 0] = $9; //@line 1588
  $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 1589
  HEAP32[$13 >> 2] = 0; //@line 1590
  $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 1591
  HEAP32[$14 >> 2] = $AsyncRetVal; //@line 1592
  $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 1593
  HEAP32[$15 >> 2] = $2; //@line 1594
  $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 1595
  HEAP32[$16 >> 2] = $4; //@line 1596
  sp = STACKTOP; //@line 1597
  return;
 }
}
function _mbed_error_vfprintf__async_cb_18($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1605
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1609
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1611
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1615
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 1616
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP8[$10 + $12 >> 0] | 0; //@line 1622
 if ((HEAP8[$0 + 16 >> 0] | 0) == 13 | $13 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 1628
  _serial_putc(5744, $13 << 24 >> 24); //@line 1629
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 1632
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 1633
   HEAP32[$22 >> 2] = $12; //@line 1634
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 1635
   HEAP32[$23 >> 2] = $4; //@line 1636
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 1637
   HEAP32[$24 >> 2] = $6; //@line 1638
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 1639
   HEAP8[$25 >> 0] = $13; //@line 1640
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 1641
   HEAP32[$26 >> 2] = $10; //@line 1642
   sp = STACKTOP; //@line 1643
   return;
  }
  ___async_unwind = 0; //@line 1646
  HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 1647
  $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 1648
  HEAP32[$22 >> 2] = $12; //@line 1649
  $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 1650
  HEAP32[$23 >> 2] = $4; //@line 1651
  $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 1652
  HEAP32[$24 >> 2] = $6; //@line 1653
  $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 1654
  HEAP8[$25 >> 0] = $13; //@line 1655
  $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 1656
  HEAP32[$26 >> 2] = $10; //@line 1657
  sp = STACKTOP; //@line 1658
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 1661
  _serial_putc(5744, 13); //@line 1662
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 94; //@line 1665
   $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 1666
   HEAP8[$16 >> 0] = $13; //@line 1667
   $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 1668
   HEAP32[$17 >> 2] = $12; //@line 1669
   $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 1670
   HEAP32[$18 >> 2] = $4; //@line 1671
   $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 1672
   HEAP32[$19 >> 2] = $6; //@line 1673
   $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 1674
   HEAP32[$20 >> 2] = $10; //@line 1675
   sp = STACKTOP; //@line 1676
   return;
  }
  ___async_unwind = 0; //@line 1679
  HEAP32[$ReallocAsyncCtx3 >> 2] = 94; //@line 1680
  $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 1681
  HEAP8[$16 >> 0] = $13; //@line 1682
  $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 1683
  HEAP32[$17 >> 2] = $12; //@line 1684
  $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 1685
  HEAP32[$18 >> 2] = $4; //@line 1686
  $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 1687
  HEAP32[$19 >> 2] = $6; //@line 1688
  $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 1689
  HEAP32[$20 >> 2] = $10; //@line 1690
  sp = STACKTOP; //@line 1691
  return;
 }
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7143
 STACKTOP = STACKTOP + 48 | 0; //@line 7144
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 7144
 $vararg_buffer3 = sp + 16 | 0; //@line 7145
 $vararg_buffer = sp; //@line 7146
 $3 = sp + 32 | 0; //@line 7147
 $4 = $0 + 28 | 0; //@line 7148
 $5 = HEAP32[$4 >> 2] | 0; //@line 7149
 HEAP32[$3 >> 2] = $5; //@line 7150
 $7 = $0 + 20 | 0; //@line 7152
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 7154
 HEAP32[$3 + 4 >> 2] = $9; //@line 7155
 HEAP32[$3 + 8 >> 2] = $1; //@line 7157
 HEAP32[$3 + 12 >> 2] = $2; //@line 7159
 $12 = $9 + $2 | 0; //@line 7160
 $13 = $0 + 60 | 0; //@line 7161
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 7164
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 7166
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 7168
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 7170
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 7174
  } else {
   $$04756 = 2; //@line 7176
   $$04855 = $12; //@line 7176
   $$04954 = $3; //@line 7176
   $27 = $17; //@line 7176
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 7182
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 7184
    $38 = $27 >>> 0 > $37 >>> 0; //@line 7185
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 7187
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 7189
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 7191
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 7194
    $44 = $$150 + 4 | 0; //@line 7195
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 7198
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 7201
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 7203
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 7205
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 7207
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 7210
     break L1;
    } else {
     $$04756 = $$1; //@line 7213
     $$04954 = $$150; //@line 7213
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 7217
   HEAP32[$4 >> 2] = 0; //@line 7218
   HEAP32[$7 >> 2] = 0; //@line 7219
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 7222
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 7225
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 7230
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 7236
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 7241
  $25 = $20; //@line 7242
  HEAP32[$4 >> 2] = $25; //@line 7243
  HEAP32[$7 >> 2] = $25; //@line 7244
  $$051 = $2; //@line 7245
 }
 STACKTOP = sp; //@line 7247
 return $$051 | 0; //@line 7247
}
function __ZN4mbed7Timeout7handlerEv($0) {
 $0 = $0 | 0;
 var $1 = 0, $12 = 0, $13 = 0, $14 = 0, $18 = 0, $19 = 0, $2 = 0, $22 = 0, $25 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx6 = 0, $AsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 580
 STACKTOP = STACKTOP + 16 | 0; //@line 581
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 581
 $1 = sp; //@line 582
 $2 = $0 + 52 | 0; //@line 583
 $3 = HEAP32[$2 >> 2] | 0; //@line 584
 do {
  if (!$3) {
   $13 = 0; //@line 588
  } else {
   $7 = HEAP32[$3 + 4 >> 2] | 0; //@line 592
   $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 593
   FUNCTION_TABLE_vii[$7 & 3]($1, $0 + 40 | 0); //@line 594
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 36; //@line 597
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 599
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 601
    HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 603
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 605
    sp = STACKTOP; //@line 606
    STACKTOP = sp; //@line 607
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 609
    $13 = HEAP32[$2 >> 2] | 0; //@line 611
    break;
   }
  }
 } while (0);
 $12 = $1 + 12 | 0; //@line 616
 HEAP32[$12 >> 2] = $13; //@line 617
 __ZN4mbed6Ticker6detachEv($0); //@line 618
 $14 = HEAP32[$12 >> 2] | 0; //@line 619
 do {
  if (!$14) {
   $AsyncCtx9 = _emscripten_alloc_async_context(12, sp) | 0; //@line 623
   _mbed_assert_internal(1485, 1490, 528); //@line 624
   if (___async) {
    HEAP32[$AsyncCtx9 >> 2] = 37; //@line 627
    HEAP32[$AsyncCtx9 + 4 >> 2] = $12; //@line 629
    HEAP32[$AsyncCtx9 + 8 >> 2] = $1; //@line 631
    sp = STACKTOP; //@line 632
    STACKTOP = sp; //@line 633
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx9 | 0); //@line 635
    $19 = HEAP32[$12 >> 2] | 0; //@line 637
    break;
   }
  } else {
   $19 = $14; //@line 641
  }
 } while (0);
 $18 = HEAP32[$19 >> 2] | 0; //@line 644
 $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 645
 FUNCTION_TABLE_vi[$18 & 255]($1); //@line 646
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 38; //@line 649
  HEAP32[$AsyncCtx2 + 4 >> 2] = $12; //@line 651
  HEAP32[$AsyncCtx2 + 8 >> 2] = $1; //@line 653
  sp = STACKTOP; //@line 654
  STACKTOP = sp; //@line 655
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 657
 $22 = HEAP32[$12 >> 2] | 0; //@line 658
 if (!$22) {
  STACKTOP = sp; //@line 661
  return;
 }
 $25 = HEAP32[$22 + 8 >> 2] | 0; //@line 664
 $AsyncCtx6 = _emscripten_alloc_async_context(8, sp) | 0; //@line 665
 FUNCTION_TABLE_vi[$25 & 255]($1); //@line 666
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 39; //@line 669
  HEAP32[$AsyncCtx6 + 4 >> 2] = $1; //@line 671
  sp = STACKTOP; //@line 672
  STACKTOP = sp; //@line 673
  return;
 }
 _emscripten_free_async_context($AsyncCtx6 | 0); //@line 675
 STACKTOP = sp; //@line 676
 return;
}
function _mbed_error_vfprintf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$01213 = 0, $$014 = 0, $2 = 0, $24 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0, $$01213$looptemp = 0;
 sp = STACKTOP; //@line 3074
 STACKTOP = STACKTOP + 128 | 0; //@line 3075
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 3075
 $2 = sp; //@line 3076
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 3077
 $3 = _vsnprintf($2, 128, $0, $1) | 0; //@line 3078
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 93; //@line 3081
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 3083
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 3085
  sp = STACKTOP; //@line 3086
  STACKTOP = sp; //@line 3087
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3089
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 3092
  return;
 }
 if (!(HEAP32[1435] | 0)) {
  _serial_init(5744, 2, 3); //@line 3097
  $$01213 = 0; //@line 3098
  $$014 = 0; //@line 3098
 } else {
  $$01213 = 0; //@line 3100
  $$014 = 0; //@line 3100
 }
 while (1) {
  $$01213$looptemp = $$01213;
  $$01213 = HEAP8[$2 + $$014 >> 0] | 0; //@line 3104
  if (!($$01213$looptemp << 24 >> 24 == 13 | $$01213 << 24 >> 24 != 10)) {
   $AsyncCtx7 = _emscripten_alloc_async_context(24, sp) | 0; //@line 3109
   _serial_putc(5744, 13); //@line 3110
   if (___async) {
    label = 8; //@line 3113
    break;
   }
   _emscripten_free_async_context($AsyncCtx7 | 0); //@line 3116
  }
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 3119
  _serial_putc(5744, $$01213 << 24 >> 24); //@line 3120
  if (___async) {
   label = 11; //@line 3123
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3126
  $24 = $$014 + 1 | 0; //@line 3127
  if (($24 | 0) == ($3 | 0)) {
   label = 13; //@line 3130
   break;
  } else {
   $$014 = $24; //@line 3133
  }
 }
 if ((label | 0) == 8) {
  HEAP32[$AsyncCtx7 >> 2] = 94; //@line 3137
  HEAP8[$AsyncCtx7 + 4 >> 0] = $$01213; //@line 3139
  HEAP32[$AsyncCtx7 + 8 >> 2] = $$014; //@line 3141
  HEAP32[$AsyncCtx7 + 12 >> 2] = $3; //@line 3143
  HEAP32[$AsyncCtx7 + 16 >> 2] = $2; //@line 3145
  HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 3147
  sp = STACKTOP; //@line 3148
  STACKTOP = sp; //@line 3149
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx3 >> 2] = 95; //@line 3152
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$014; //@line 3154
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 3156
  HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 3158
  HEAP8[$AsyncCtx3 + 16 >> 0] = $$01213; //@line 3160
  HEAP32[$AsyncCtx3 + 20 >> 2] = $2; //@line 3162
  sp = STACKTOP; //@line 3163
  STACKTOP = sp; //@line 3164
  return;
 } else if ((label | 0) == 13) {
  STACKTOP = sp; //@line 3167
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_85($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6147
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6151
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6153
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 6155
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6157
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 6159
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6161
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 6163
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 6165
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 6167
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 6170
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 6172
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 6176
   $27 = $6 + 24 | 0; //@line 6177
   $28 = $4 + 8 | 0; //@line 6178
   $29 = $6 + 54 | 0; //@line 6179
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
    HEAP8[$10 >> 0] = 0; //@line 6209
    HEAP8[$14 >> 0] = 0; //@line 6210
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 6211
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 6212
    if (!___async) {
     ___async_unwind = 0; //@line 6215
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 155; //@line 6217
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 6219
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 6221
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 6223
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 6225
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 6227
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 6229
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 6231
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 6233
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 6235
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 6237
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 6239
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 6241
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 6243
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 6246
    sp = STACKTOP; //@line 6247
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 6252
 HEAP8[$14 >> 0] = $12; //@line 6253
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6031
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6035
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6037
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 6039
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6041
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 6043
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6045
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 6047
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 6049
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 6051
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 6053
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 6055
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 6057
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 6060
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 6061
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
    HEAP8[$10 >> 0] = 0; //@line 6094
    HEAP8[$14 >> 0] = 0; //@line 6095
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 6096
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 6097
    if (!___async) {
     ___async_unwind = 0; //@line 6100
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 155; //@line 6102
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 6104
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 6106
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 6108
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 6110
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 6112
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 6114
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 6116
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 6118
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 6120
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 6122
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 6124
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 6126
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 6128
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 6131
    sp = STACKTOP; //@line 6132
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 6137
 HEAP8[$14 >> 0] = $12; //@line 6138
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 6733
 }
 ret = dest | 0; //@line 6736
 dest_end = dest + num | 0; //@line 6737
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 6741
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 6742
   dest = dest + 1 | 0; //@line 6743
   src = src + 1 | 0; //@line 6744
   num = num - 1 | 0; //@line 6745
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 6747
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 6748
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 6750
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 6751
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 6752
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 6753
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 6754
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 6755
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 6756
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 6757
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 6758
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 6759
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 6760
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 6761
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 6762
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 6763
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 6764
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 6765
   dest = dest + 64 | 0; //@line 6766
   src = src + 64 | 0; //@line 6767
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 6770
   dest = dest + 4 | 0; //@line 6771
   src = src + 4 | 0; //@line 6772
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 6776
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 6778
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 6779
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 6780
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 6781
   dest = dest + 4 | 0; //@line 6782
   src = src + 4 | 0; //@line 6783
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 6788
  dest = dest + 1 | 0; //@line 6789
  src = src + 1 | 0; //@line 6790
 }
 return ret | 0; //@line 6792
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12318
 STACKTOP = STACKTOP + 64 | 0; //@line 12319
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 12319
 $3 = sp; //@line 12320
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 12323
 } else {
  if (!$1) {
   $$2 = 0; //@line 12327
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 12329
   $6 = ___dynamic_cast($1, 176, 160, 0) | 0; //@line 12330
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 144; //@line 12333
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 12335
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 12337
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 12339
    sp = STACKTOP; //@line 12340
    STACKTOP = sp; //@line 12341
    return 0; //@line 12341
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12343
   if (!$6) {
    $$2 = 0; //@line 12346
   } else {
    dest = $3 + 4 | 0; //@line 12349
    stop = dest + 52 | 0; //@line 12349
    do {
     HEAP32[dest >> 2] = 0; //@line 12349
     dest = dest + 4 | 0; //@line 12349
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 12350
    HEAP32[$3 + 8 >> 2] = $0; //@line 12352
    HEAP32[$3 + 12 >> 2] = -1; //@line 12354
    HEAP32[$3 + 48 >> 2] = 1; //@line 12356
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 12359
    $18 = HEAP32[$2 >> 2] | 0; //@line 12360
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 12361
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 12362
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 145; //@line 12365
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 12367
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 12369
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 12371
     sp = STACKTOP; //@line 12372
     STACKTOP = sp; //@line 12373
     return 0; //@line 12373
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12375
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 12382
     $$0 = 1; //@line 12383
    } else {
     $$0 = 0; //@line 12385
    }
    $$2 = $$0; //@line 12387
   }
  }
 }
 STACKTOP = sp; //@line 12391
 return $$2 | 0; //@line 12391
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 11864
 STACKTOP = STACKTOP + 128 | 0; //@line 11865
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 11865
 $4 = sp + 124 | 0; //@line 11866
 $5 = sp; //@line 11867
 dest = $5; //@line 11868
 src = 964; //@line 11868
 stop = dest + 124 | 0; //@line 11868
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 11868
  dest = dest + 4 | 0; //@line 11868
  src = src + 4 | 0; //@line 11868
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 11874
   $$015 = 1; //@line 11874
   label = 4; //@line 11875
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 11878
   $$0 = -1; //@line 11879
  }
 } else {
  $$014 = $0; //@line 11882
  $$015 = $1; //@line 11882
  label = 4; //@line 11883
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 11887
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 11889
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 11891
  $14 = $5 + 20 | 0; //@line 11892
  HEAP32[$14 >> 2] = $$014; //@line 11893
  HEAP32[$5 + 44 >> 2] = $$014; //@line 11895
  $16 = $$014 + $$$015 | 0; //@line 11896
  $17 = $5 + 16 | 0; //@line 11897
  HEAP32[$17 >> 2] = $16; //@line 11898
  HEAP32[$5 + 28 >> 2] = $16; //@line 11900
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 11901
  $19 = _vfprintf($5, $2, $3) | 0; //@line 11902
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 136; //@line 11905
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 11907
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 11909
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 11911
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 11913
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 11915
   sp = STACKTOP; //@line 11916
   STACKTOP = sp; //@line 11917
   return 0; //@line 11917
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11919
  if (!$$$015) {
   $$0 = $19; //@line 11922
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 11924
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 11929
   $$0 = $19; //@line 11930
  }
 }
 STACKTOP = sp; //@line 11933
 return $$0 | 0; //@line 11933
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13650
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 13656
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 13660
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 13661
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 13662
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 13663
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 161; //@line 13666
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 13668
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 13670
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 13672
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 13674
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 13676
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 13678
    sp = STACKTOP; //@line 13679
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13682
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 13686
    $$0 = $0 + 24 | 0; //@line 13687
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 13689
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 13690
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 13695
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 13701
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 13704
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 162; //@line 13709
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 13711
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 13713
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 13715
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 13717
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 13719
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 13721
    sp = STACKTOP; //@line 13722
    return;
   }
  }
 } while (0);
 return;
}
function _main__async_cb_45($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $16 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2580
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2582
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2584
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2586
 $9 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 2589
 if (!$9) {
  $16 = $2 + 4 | 0; //@line 2593
  HEAP32[$16 >> 2] = 0; //@line 2595
  HEAP32[$16 + 4 >> 2] = 0; //@line 2598
  HEAP32[$2 >> 2] = 8; //@line 2599
  $20 = $2 + 12 | 0; //@line 2600
  HEAP32[$20 >> 2] = 384; //@line 2601
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(16) | 0; //@line 2602
  __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5672, $2, 2.5); //@line 2603
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 116; //@line 2606
   $21 = $ReallocAsyncCtx7 + 4 | 0; //@line 2607
   HEAP32[$21 >> 2] = $20; //@line 2608
   $22 = $ReallocAsyncCtx7 + 8 | 0; //@line 2609
   HEAP32[$22 >> 2] = $4; //@line 2610
   $23 = $ReallocAsyncCtx7 + 12 | 0; //@line 2611
   HEAP32[$23 >> 2] = $2; //@line 2612
   sp = STACKTOP; //@line 2613
   return;
  }
  ___async_unwind = 0; //@line 2616
  HEAP32[$ReallocAsyncCtx7 >> 2] = 116; //@line 2617
  $21 = $ReallocAsyncCtx7 + 4 | 0; //@line 2618
  HEAP32[$21 >> 2] = $20; //@line 2619
  $22 = $ReallocAsyncCtx7 + 8 | 0; //@line 2620
  HEAP32[$22 >> 2] = $4; //@line 2621
  $23 = $ReallocAsyncCtx7 + 12 | 0; //@line 2622
  HEAP32[$23 >> 2] = $2; //@line 2623
  sp = STACKTOP; //@line 2624
  return;
 } else {
  $12 = HEAP32[$9 + 8 >> 2] | 0; //@line 2628
  $ReallocAsyncCtx = _emscripten_realloc_async_context(12) | 0; //@line 2629
  FUNCTION_TABLE_vi[$12 & 255]($6); //@line 2630
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 115; //@line 2633
   $13 = $ReallocAsyncCtx + 4 | 0; //@line 2634
   HEAP32[$13 >> 2] = $2; //@line 2635
   $14 = $ReallocAsyncCtx + 8 | 0; //@line 2636
   HEAP32[$14 >> 2] = $4; //@line 2637
   sp = STACKTOP; //@line 2638
   return;
  }
  ___async_unwind = 0; //@line 2641
  HEAP32[$ReallocAsyncCtx >> 2] = 115; //@line 2642
  $13 = $ReallocAsyncCtx + 4 | 0; //@line 2643
  HEAP32[$13 >> 2] = $2; //@line 2644
  $14 = $ReallocAsyncCtx + 8 | 0; //@line 2645
  HEAP32[$14 >> 2] = $4; //@line 2646
  sp = STACKTOP; //@line 2647
  return;
 }
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11960
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 11965
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 11970
  } else {
   $20 = $0 & 255; //@line 11972
   $21 = $0 & 255; //@line 11973
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 11979
   } else {
    $26 = $1 + 20 | 0; //@line 11981
    $27 = HEAP32[$26 >> 2] | 0; //@line 11982
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 11988
     HEAP8[$27 >> 0] = $20; //@line 11989
     $34 = $21; //@line 11990
    } else {
     label = 12; //@line 11992
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 11997
     $32 = ___overflow($1, $0) | 0; //@line 11998
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 138; //@line 12001
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 12003
      sp = STACKTOP; //@line 12004
      return 0; //@line 12005
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 12007
      $34 = $32; //@line 12008
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 12013
   $$0 = $34; //@line 12014
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 12019
   $8 = $0 & 255; //@line 12020
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 12026
    $14 = HEAP32[$13 >> 2] | 0; //@line 12027
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 12033
     HEAP8[$14 >> 0] = $7; //@line 12034
     $$0 = $8; //@line 12035
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12039
   $19 = ___overflow($1, $0) | 0; //@line 12040
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 137; //@line 12043
    sp = STACKTOP; //@line 12044
    return 0; //@line 12045
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12047
    $$0 = $19; //@line 12048
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 12053
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 7853
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 7856
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 7859
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 7862
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 7868
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 7877
     $24 = $13 >>> 2; //@line 7878
     $$090 = 0; //@line 7879
     $$094 = $7; //@line 7879
     while (1) {
      $25 = $$094 >>> 1; //@line 7881
      $26 = $$090 + $25 | 0; //@line 7882
      $27 = $26 << 1; //@line 7883
      $28 = $27 + $23 | 0; //@line 7884
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 7887
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 7891
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 7897
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 7905
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 7909
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 7915
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 7920
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 7923
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 7923
      }
     }
     $46 = $27 + $24 | 0; //@line 7926
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 7929
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 7933
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 7945
     } else {
      $$4 = 0; //@line 7947
     }
    } else {
     $$4 = 0; //@line 7950
    }
   } else {
    $$4 = 0; //@line 7953
   }
  } else {
   $$4 = 0; //@line 7956
  }
 } while (0);
 return $$4 | 0; //@line 7959
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7518
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 7523
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 7528
  } else {
   $20 = $0 & 255; //@line 7530
   $21 = $0 & 255; //@line 7531
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 7537
   } else {
    $26 = $1 + 20 | 0; //@line 7539
    $27 = HEAP32[$26 >> 2] | 0; //@line 7540
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 7546
     HEAP8[$27 >> 0] = $20; //@line 7547
     $34 = $21; //@line 7548
    } else {
     label = 12; //@line 7550
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7555
     $32 = ___overflow($1, $0) | 0; //@line 7556
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 126; //@line 7559
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 7561
      sp = STACKTOP; //@line 7562
      return 0; //@line 7563
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 7565
      $34 = $32; //@line 7566
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 7571
   $$0 = $34; //@line 7572
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 7577
   $8 = $0 & 255; //@line 7578
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 7584
    $14 = HEAP32[$13 >> 2] | 0; //@line 7585
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 7591
     HEAP8[$14 >> 0] = $7; //@line 7592
     $$0 = $8; //@line 7593
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7597
   $19 = ___overflow($1, $0) | 0; //@line 7598
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 125; //@line 7601
    sp = STACKTOP; //@line 7602
    return 0; //@line 7603
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7605
    $$0 = $19; //@line 7606
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 7611
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8238
 $1 = $0 + 20 | 0; //@line 8239
 $3 = $0 + 28 | 0; //@line 8241
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 8247
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8248
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 8249
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 132; //@line 8252
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 8254
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 8256
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 8258
    sp = STACKTOP; //@line 8259
    return 0; //@line 8260
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 8262
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 8266
     break;
    } else {
     label = 5; //@line 8269
     break;
    }
   }
  } else {
   label = 5; //@line 8274
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 8278
  $14 = HEAP32[$13 >> 2] | 0; //@line 8279
  $15 = $0 + 8 | 0; //@line 8280
  $16 = HEAP32[$15 >> 2] | 0; //@line 8281
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 8289
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 8290
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 8291
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 133; //@line 8294
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 8296
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 8298
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 8300
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 8302
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 8304
     sp = STACKTOP; //@line 8305
     return 0; //@line 8306
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8308
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 8314
  HEAP32[$3 >> 2] = 0; //@line 8315
  HEAP32[$1 >> 2] = 0; //@line 8316
  HEAP32[$15 >> 2] = 0; //@line 8317
  HEAP32[$13 >> 2] = 0; //@line 8318
  $$0 = 0; //@line 8319
 }
 return $$0 | 0; //@line 8321
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
 _mbed_tracef(16, 1235, 1240, $vararg_buffer); //@line 92
 $9 = HEAP32[$0 + 752 >> 2] | 0; //@line 94
 if (($9 | 0) != ($6 | 0)) {
  HEAP32[$vararg_buffer4 >> 2] = $9; //@line 97
  HEAP32[$vararg_buffer4 + 4 >> 2] = $6; //@line 99
  _mbed_tracef(16, 1235, 1281, $vararg_buffer4); //@line 100
  STACKTOP = sp; //@line 101
  return;
 }
 $12 = HEAP32[$0 + 756 >> 2] | 0; //@line 104
 if (($12 | 0) != ($7 | 0)) {
  HEAP32[$vararg_buffer8 >> 2] = $12; //@line 107
  HEAP32[$vararg_buffer8 + 4 >> 2] = $7; //@line 109
  _mbed_tracef(16, 1235, 1328, $vararg_buffer8); //@line 110
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
  _mbed_tracef(16, 1235, 1375, $vararg_buffer12); //@line 136
  STACKTOP = sp; //@line 137
  return;
 }
}
function __ZN4mbed7Timeout7handlerEv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4254
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4260
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4262
 $9 = (HEAP32[$0 + 8 >> 2] | 0) + 12 | 0; //@line 4264
 HEAP32[$9 >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 4265
 __ZN4mbed6Ticker6detachEv($6); //@line 4266
 $10 = HEAP32[$9 >> 2] | 0; //@line 4267
 if (!$10) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(12) | 0; //@line 4270
  _mbed_assert_internal(1485, 1490, 528); //@line 4271
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 37; //@line 4274
   $12 = $ReallocAsyncCtx4 + 4 | 0; //@line 4275
   HEAP32[$12 >> 2] = $9; //@line 4276
   $13 = $ReallocAsyncCtx4 + 8 | 0; //@line 4277
   HEAP32[$13 >> 2] = $8; //@line 4278
   sp = STACKTOP; //@line 4279
   return;
  }
  ___async_unwind = 0; //@line 4282
  HEAP32[$ReallocAsyncCtx4 >> 2] = 37; //@line 4283
  $12 = $ReallocAsyncCtx4 + 4 | 0; //@line 4284
  HEAP32[$12 >> 2] = $9; //@line 4285
  $13 = $ReallocAsyncCtx4 + 8 | 0; //@line 4286
  HEAP32[$13 >> 2] = $8; //@line 4287
  sp = STACKTOP; //@line 4288
  return;
 } else {
  $14 = HEAP32[$10 >> 2] | 0; //@line 4291
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 4292
  FUNCTION_TABLE_vi[$14 & 255]($8); //@line 4293
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 38; //@line 4296
   $15 = $ReallocAsyncCtx2 + 4 | 0; //@line 4297
   HEAP32[$15 >> 2] = $9; //@line 4298
   $16 = $ReallocAsyncCtx2 + 8 | 0; //@line 4299
   HEAP32[$16 >> 2] = $8; //@line 4300
   sp = STACKTOP; //@line 4301
   return;
  }
  ___async_unwind = 0; //@line 4304
  HEAP32[$ReallocAsyncCtx2 >> 2] = 38; //@line 4305
  $15 = $ReallocAsyncCtx2 + 4 | 0; //@line 4306
  HEAP32[$15 >> 2] = $9; //@line 4307
  $16 = $ReallocAsyncCtx2 + 8 | 0; //@line 4308
  HEAP32[$16 >> 2] = $8; //@line 4309
  sp = STACKTOP; //@line 4310
  return;
 }
}
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 8002
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 8008
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 8014
   } else {
    $7 = $1 & 255; //@line 8016
    $$03039 = $0; //@line 8017
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 8019
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 8024
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 8027
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 8032
      break;
     } else {
      $$03039 = $13; //@line 8035
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 8039
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 8040
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 8048
     $25 = $18; //@line 8048
     while (1) {
      $24 = $25 ^ $17; //@line 8050
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 8057
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 8060
      $25 = HEAP32[$31 >> 2] | 0; //@line 8061
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 8070
       break;
      } else {
       $$02936 = $31; //@line 8068
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 8075
    }
   } while (0);
   $38 = $1 & 255; //@line 8078
   $$1 = $$029$lcssa; //@line 8079
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 8081
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 8087
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 8090
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 8095
}
function _main__async_cb_44($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $13 = 0, $17 = 0, $18 = 0, $19 = 0, $4 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 2515
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2519
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2521
 $7 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 2522
 if (!$7) {
  $13 = $4 + 4 | 0; //@line 2526
  HEAP32[$13 >> 2] = 0; //@line 2528
  HEAP32[$13 + 4 >> 2] = 0; //@line 2531
  HEAP32[$4 >> 2] = 9; //@line 2532
  $17 = $4 + 12 | 0; //@line 2533
  HEAP32[$17 >> 2] = 384; //@line 2534
  $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 2535
  __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5824, $4); //@line 2536
  if (___async) {
   HEAP32[$ReallocAsyncCtx9 >> 2] = 118; //@line 2539
   $18 = $ReallocAsyncCtx9 + 4 | 0; //@line 2540
   HEAP32[$18 >> 2] = $17; //@line 2541
   $19 = $ReallocAsyncCtx9 + 8 | 0; //@line 2542
   HEAP32[$19 >> 2] = $4; //@line 2543
   sp = STACKTOP; //@line 2544
   return;
  }
  ___async_unwind = 0; //@line 2547
  HEAP32[$ReallocAsyncCtx9 >> 2] = 118; //@line 2548
  $18 = $ReallocAsyncCtx9 + 4 | 0; //@line 2549
  HEAP32[$18 >> 2] = $17; //@line 2550
  $19 = $ReallocAsyncCtx9 + 8 | 0; //@line 2551
  HEAP32[$19 >> 2] = $4; //@line 2552
  sp = STACKTOP; //@line 2553
  return;
 } else {
  $10 = HEAP32[$7 + 8 >> 2] | 0; //@line 2557
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 2558
  FUNCTION_TABLE_vi[$10 & 255]($6); //@line 2559
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 117; //@line 2562
   $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 2563
   HEAP32[$11 >> 2] = $4; //@line 2564
   sp = STACKTOP; //@line 2565
   return;
  }
  ___async_unwind = 0; //@line 2568
  HEAP32[$ReallocAsyncCtx2 >> 2] = 117; //@line 2569
  $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 2570
  HEAP32[$11 >> 2] = $4; //@line 2571
  sp = STACKTOP; //@line 2572
  return;
 }
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 7744
 $4 = HEAP32[$3 >> 2] | 0; //@line 7745
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 7752
   label = 5; //@line 7753
  } else {
   $$1 = 0; //@line 7755
  }
 } else {
  $12 = $4; //@line 7759
  label = 5; //@line 7760
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 7764
   $10 = HEAP32[$9 >> 2] | 0; //@line 7765
   $14 = $10; //@line 7768
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 7773
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 7781
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 7785
       $$141 = $0; //@line 7785
       $$143 = $1; //@line 7785
       $31 = $14; //@line 7785
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 7788
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 7795
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 7800
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 7803
      break L5;
     }
     $$139 = $$038; //@line 7809
     $$141 = $0 + $$038 | 0; //@line 7809
     $$143 = $1 - $$038 | 0; //@line 7809
     $31 = HEAP32[$9 >> 2] | 0; //@line 7809
    } else {
     $$139 = 0; //@line 7811
     $$141 = $0; //@line 7811
     $$143 = $1; //@line 7811
     $31 = $14; //@line 7811
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 7814
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 7817
   $$1 = $$139 + $$143 | 0; //@line 7819
  }
 } while (0);
 return $$1 | 0; //@line 7822
}
function __GLOBAL__sub_I_main_cpp() {
 var $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3524
 HEAP32[1438] = 0; //@line 3525
 HEAP32[1439] = 0; //@line 3525
 HEAP32[1440] = 0; //@line 3525
 HEAP32[1441] = 0; //@line 3525
 HEAP32[1442] = 0; //@line 3525
 HEAP32[1443] = 0; //@line 3525
 _gpio_init_out(5752, 50); //@line 3526
 HEAP32[1444] = 0; //@line 3527
 HEAP32[1445] = 0; //@line 3527
 HEAP32[1446] = 0; //@line 3527
 HEAP32[1447] = 0; //@line 3527
 HEAP32[1448] = 0; //@line 3527
 HEAP32[1449] = 0; //@line 3527
 _gpio_init_out(5776, 52); //@line 3528
 HEAP32[1450] = 0; //@line 3529
 HEAP32[1451] = 0; //@line 3529
 HEAP32[1452] = 0; //@line 3529
 HEAP32[1453] = 0; //@line 3529
 HEAP32[1454] = 0; //@line 3529
 HEAP32[1455] = 0; //@line 3529
 _gpio_init_out(5800, 53); //@line 3530
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3531
 __ZN4mbed10TimerEventC2Ev(5608); //@line 3532
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 106; //@line 3535
  sp = STACKTOP; //@line 3536
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3539
 HEAP32[1402] = 440; //@line 3540
 HEAP32[1412] = 0; //@line 3541
 HEAP32[1413] = 0; //@line 3541
 HEAP32[1414] = 0; //@line 3541
 HEAP32[1415] = 0; //@line 3541
 HEAP8[5664] = 1; //@line 3542
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3543
 __ZN4mbed10TimerEventC2Ev(5672); //@line 3544
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 107; //@line 3547
  sp = STACKTOP; //@line 3548
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3551
  HEAP32[1428] = 0; //@line 3552
  HEAP32[1429] = 0; //@line 3552
  HEAP32[1430] = 0; //@line 3552
  HEAP32[1431] = 0; //@line 3552
  HEAP8[5728] = 1; //@line 3553
  HEAP32[1418] = 288; //@line 3554
  __ZN4mbed11InterruptInC2E7PinName(5824, 1337); //@line 3555
  return;
 }
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_58($0) {
 $0 = $0 | 0;
 var $$phi$trans$insert = 0, $$pre10 = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 3398
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3402
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3404
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3406
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3408
 $$phi$trans$insert = (HEAP32[$0 + 4 >> 2] | 0) + 12 | 0; //@line 3409
 $$pre10 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 3410
 if (!$$pre10) {
  HEAP32[$4 >> 2] = 0; //@line 3413
  _gpio_irq_set($10 + 28 | 0, 2, 0); //@line 3415
  return;
 }
 $13 = HEAP32[$$pre10 + 4 >> 2] | 0; //@line 3419
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 3420
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 3421
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 30; //@line 3424
  $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 3425
  HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 3426
  $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 3427
  HEAP32[$15 >> 2] = $4; //@line 3428
  $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 3429
  HEAP32[$16 >> 2] = $8; //@line 3430
  $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 3431
  HEAP32[$17 >> 2] = $10; //@line 3432
  sp = STACKTOP; //@line 3433
  return;
 }
 ___async_unwind = 0; //@line 3436
 HEAP32[$ReallocAsyncCtx4 >> 2] = 30; //@line 3437
 $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 3438
 HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 3439
 $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 3440
 HEAP32[$15 >> 2] = $4; //@line 3441
 $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 3442
 HEAP32[$16 >> 2] = $8; //@line 3443
 $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 3444
 HEAP32[$17 >> 2] = $10; //@line 3445
 sp = STACKTOP; //@line 3446
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_80($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5531
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5535
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5537
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5539
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5541
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5543
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 5545
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 5547
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 5550
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 5551
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 5567
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 5568
    if (!___async) {
     ___async_unwind = 0; //@line 5571
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 159; //@line 5573
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 5575
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 5577
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 5579
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 5581
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 5583
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 5585
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 5587
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 5589
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 5592
    sp = STACKTOP; //@line 5593
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
 sp = STACKTOP; //@line 7630
 STACKTOP = STACKTOP + 16 | 0; //@line 7631
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7631
 $2 = sp; //@line 7632
 $3 = $1 & 255; //@line 7633
 HEAP8[$2 >> 0] = $3; //@line 7634
 $4 = $0 + 16 | 0; //@line 7635
 $5 = HEAP32[$4 >> 2] | 0; //@line 7636
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 7643
   label = 4; //@line 7644
  } else {
   $$0 = -1; //@line 7646
  }
 } else {
  $12 = $5; //@line 7649
  label = 4; //@line 7650
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 7654
   $10 = HEAP32[$9 >> 2] | 0; //@line 7655
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 7658
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 7665
     HEAP8[$10 >> 0] = $3; //@line 7666
     $$0 = $13; //@line 7667
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 7672
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7673
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 7674
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 127; //@line 7677
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 7679
    sp = STACKTOP; //@line 7680
    STACKTOP = sp; //@line 7681
    return 0; //@line 7681
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 7683
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 7688
   } else {
    $$0 = -1; //@line 7690
   }
  }
 } while (0);
 STACKTOP = sp; //@line 7694
 return $$0 | 0; //@line 7694
}
function _fflush__async_cb_14($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1279
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1281
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 1283
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 1287
  } else {
   $$02327 = $$02325; //@line 1289
   $$02426 = $AsyncRetVal; //@line 1289
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 1296
    } else {
     $16 = 0; //@line 1298
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 1310
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 1313
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 1316
     break L3;
    } else {
     $$02327 = $$023; //@line 1319
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 1322
   $13 = ___fflush_unlocked($$02327) | 0; //@line 1323
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 1327
    ___async_unwind = 0; //@line 1328
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 131; //@line 1330
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 1332
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 1334
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 1336
   sp = STACKTOP; //@line 1337
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 1341
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 1343
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 6797
 value = value & 255; //@line 6799
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 6802
   ptr = ptr + 1 | 0; //@line 6803
  }
  aligned_end = end & -4 | 0; //@line 6806
  block_aligned_end = aligned_end - 64 | 0; //@line 6807
  value4 = value | value << 8 | value << 16 | value << 24; //@line 6808
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 6811
   HEAP32[ptr + 4 >> 2] = value4; //@line 6812
   HEAP32[ptr + 8 >> 2] = value4; //@line 6813
   HEAP32[ptr + 12 >> 2] = value4; //@line 6814
   HEAP32[ptr + 16 >> 2] = value4; //@line 6815
   HEAP32[ptr + 20 >> 2] = value4; //@line 6816
   HEAP32[ptr + 24 >> 2] = value4; //@line 6817
   HEAP32[ptr + 28 >> 2] = value4; //@line 6818
   HEAP32[ptr + 32 >> 2] = value4; //@line 6819
   HEAP32[ptr + 36 >> 2] = value4; //@line 6820
   HEAP32[ptr + 40 >> 2] = value4; //@line 6821
   HEAP32[ptr + 44 >> 2] = value4; //@line 6822
   HEAP32[ptr + 48 >> 2] = value4; //@line 6823
   HEAP32[ptr + 52 >> 2] = value4; //@line 6824
   HEAP32[ptr + 56 >> 2] = value4; //@line 6825
   HEAP32[ptr + 60 >> 2] = value4; //@line 6826
   ptr = ptr + 64 | 0; //@line 6827
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 6831
   ptr = ptr + 4 | 0; //@line 6832
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 6837
  ptr = ptr + 1 | 0; //@line 6838
 }
 return end - num | 0; //@line 6840
}
function _main__async_cb_41($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 2413
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2415
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2417
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2419
 $8 = $2 + 4 | 0; //@line 2421
 HEAP32[$8 >> 2] = 0; //@line 2423
 HEAP32[$8 + 4 >> 2] = 0; //@line 2426
 HEAP32[$2 >> 2] = 7; //@line 2427
 $12 = $2 + 12 | 0; //@line 2428
 HEAP32[$12 >> 2] = 384; //@line 2429
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(20) | 0; //@line 2430
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5608, $2, 1.0); //@line 2431
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 114; //@line 2434
  $13 = $ReallocAsyncCtx8 + 4 | 0; //@line 2435
  HEAP32[$13 >> 2] = $4; //@line 2436
  $14 = $ReallocAsyncCtx8 + 8 | 0; //@line 2437
  HEAP32[$14 >> 2] = $6; //@line 2438
  $15 = $ReallocAsyncCtx8 + 12 | 0; //@line 2439
  HEAP32[$15 >> 2] = $2; //@line 2440
  $16 = $ReallocAsyncCtx8 + 16 | 0; //@line 2441
  HEAP32[$16 >> 2] = $12; //@line 2442
  sp = STACKTOP; //@line 2443
  return;
 }
 ___async_unwind = 0; //@line 2446
 HEAP32[$ReallocAsyncCtx8 >> 2] = 114; //@line 2447
 $13 = $ReallocAsyncCtx8 + 4 | 0; //@line 2448
 HEAP32[$13 >> 2] = $4; //@line 2449
 $14 = $ReallocAsyncCtx8 + 8 | 0; //@line 2450
 HEAP32[$14 >> 2] = $6; //@line 2451
 $15 = $ReallocAsyncCtx8 + 12 | 0; //@line 2452
 HEAP32[$15 >> 2] = $2; //@line 2453
 $16 = $ReallocAsyncCtx8 + 16 | 0; //@line 2454
 HEAP32[$16 >> 2] = $12; //@line 2455
 sp = STACKTOP; //@line 2456
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5468
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5472
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5474
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5476
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5478
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5480
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 5482
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 5485
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 5486
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 5495
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 5496
    if (!___async) {
     ___async_unwind = 0; //@line 5499
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 160; //@line 5501
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 5503
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 5505
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 5507
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 5509
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 5511
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 5513
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 5515
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 5518
    sp = STACKTOP; //@line 5519
    return;
   }
  }
 }
 return;
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1180
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 1190
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 1190
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 1190
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 1194
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 1197
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 1200
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 1208
  } else {
   $20 = 0; //@line 1210
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 1220
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 1224
  HEAP32[___async_retval >> 2] = $$1; //@line 1226
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 1229
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 1230
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 1234
  ___async_unwind = 0; //@line 1235
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 131; //@line 1237
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 1239
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 1241
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 1243
 sp = STACKTOP; //@line 1244
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1426
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1428
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1430
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1432
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 1437
  } else {
   $9 = $4 + 4 | 0; //@line 1439
   $10 = HEAP32[$9 >> 2] | 0; //@line 1440
   $11 = $4 + 8 | 0; //@line 1441
   $12 = HEAP32[$11 >> 2] | 0; //@line 1442
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 1446
    HEAP32[$6 >> 2] = 0; //@line 1447
    HEAP32[$2 >> 2] = 0; //@line 1448
    HEAP32[$11 >> 2] = 0; //@line 1449
    HEAP32[$9 >> 2] = 0; //@line 1450
    $$0 = 0; //@line 1451
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 1458
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 1459
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 1460
   if (!___async) {
    ___async_unwind = 0; //@line 1463
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 133; //@line 1465
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 1467
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 1469
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 1471
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 1473
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 1475
   sp = STACKTOP; //@line 1476
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 1481
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3332
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3334
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3336
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3338
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3340
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3342
 $$pre = HEAP32[$2 >> 2] | 0; //@line 3343
 if (!$$pre) {
  HEAP32[$4 >> 2] = 0; //@line 3346
  _gpio_irq_set($10 + 28 | 0, 2, 1); //@line 3348
  return;
 }
 $13 = HEAP32[$$pre + 4 >> 2] | 0; //@line 3352
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 3353
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 3354
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 28; //@line 3357
  $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 3358
  HEAP32[$14 >> 2] = $2; //@line 3359
  $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 3360
  HEAP32[$15 >> 2] = $4; //@line 3361
  $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 3362
  HEAP32[$16 >> 2] = $10; //@line 3363
  sp = STACKTOP; //@line 3364
  return;
 }
 ___async_unwind = 0; //@line 3367
 HEAP32[$ReallocAsyncCtx2 >> 2] = 28; //@line 3368
 $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 3369
 HEAP32[$14 >> 2] = $2; //@line 3370
 $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 3371
 HEAP32[$15 >> 2] = $4; //@line 3372
 $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 3373
 HEAP32[$16 >> 2] = $10; //@line 3374
 sp = STACKTOP; //@line 3375
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 11010
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 11015
    $$0 = 1; //@line 11016
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 11029
     $$0 = 1; //@line 11030
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 11034
     $$0 = -1; //@line 11035
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 11045
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 11049
    $$0 = 2; //@line 11050
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 11062
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 11068
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 11072
    $$0 = 3; //@line 11073
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 11083
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 11089
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 11095
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 11099
    $$0 = 4; //@line 11100
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 11104
    $$0 = -1; //@line 11105
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 11110
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_70($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 4185
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4187
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4189
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4191
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4193
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 4198
  return;
 }
 dest = $2 + 4 | 0; //@line 4202
 stop = dest + 52 | 0; //@line 4202
 do {
  HEAP32[dest >> 2] = 0; //@line 4202
  dest = dest + 4 | 0; //@line 4202
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 4203
 HEAP32[$2 + 8 >> 2] = $4; //@line 4205
 HEAP32[$2 + 12 >> 2] = -1; //@line 4207
 HEAP32[$2 + 48 >> 2] = 1; //@line 4209
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 4212
 $16 = HEAP32[$6 >> 2] | 0; //@line 4213
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 4214
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 4215
 if (!___async) {
  ___async_unwind = 0; //@line 4218
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 145; //@line 4220
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 4222
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 4224
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 4226
 sp = STACKTOP; //@line 4227
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_81($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5604
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5608
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5610
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5612
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5614
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5616
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 5619
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 5620
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 5626
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 5627
   if (!___async) {
    ___async_unwind = 0; //@line 5630
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 158; //@line 5632
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 5634
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 5636
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 5638
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 5640
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 5642
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 5644
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 5647
   sp = STACKTOP; //@line 5648
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
  $$0914 = $2; //@line 9894
  $8 = $0; //@line 9894
  $9 = $1; //@line 9894
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 9896
   $$0914 = $$0914 + -1 | 0; //@line 9900
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 9901
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 9902
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 9910
   }
  }
  $$010$lcssa$off0 = $8; //@line 9915
  $$09$lcssa = $$0914; //@line 9915
 } else {
  $$010$lcssa$off0 = $0; //@line 9917
  $$09$lcssa = $2; //@line 9917
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 9921
 } else {
  $$012 = $$010$lcssa$off0; //@line 9923
  $$111 = $$09$lcssa; //@line 9923
  while (1) {
   $26 = $$111 + -1 | 0; //@line 9928
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 9929
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 9933
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 9936
    $$111 = $26; //@line 9936
   }
  }
 }
 return $$1$lcssa | 0; //@line 9940
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2319
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2321
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2323
 $6 = $2 + 4 | 0; //@line 2325
 HEAP32[$6 >> 2] = 0; //@line 2327
 HEAP32[$6 + 4 >> 2] = 0; //@line 2330
 HEAP32[$2 >> 2] = 8; //@line 2331
 $10 = $2 + 12 | 0; //@line 2332
 HEAP32[$10 >> 2] = 384; //@line 2333
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(16) | 0; //@line 2334
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5672, $2, 2.5); //@line 2335
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 116; //@line 2338
  $11 = $ReallocAsyncCtx7 + 4 | 0; //@line 2339
  HEAP32[$11 >> 2] = $10; //@line 2340
  $12 = $ReallocAsyncCtx7 + 8 | 0; //@line 2341
  HEAP32[$12 >> 2] = $4; //@line 2342
  $13 = $ReallocAsyncCtx7 + 12 | 0; //@line 2343
  HEAP32[$13 >> 2] = $2; //@line 2344
  sp = STACKTOP; //@line 2345
  return;
 }
 ___async_unwind = 0; //@line 2348
 HEAP32[$ReallocAsyncCtx7 >> 2] = 116; //@line 2349
 $11 = $ReallocAsyncCtx7 + 4 | 0; //@line 2350
 HEAP32[$11 >> 2] = $10; //@line 2351
 $12 = $ReallocAsyncCtx7 + 8 | 0; //@line 2352
 HEAP32[$12 >> 2] = $4; //@line 2353
 $13 = $ReallocAsyncCtx7 + 12 | 0; //@line 2354
 HEAP32[$13 >> 2] = $2; //@line 2355
 sp = STACKTOP; //@line 2356
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3932
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3934
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3938
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3940
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3942
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3944
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 3948
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 3951
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 3952
   if (!___async) {
    ___async_unwind = 0; //@line 3955
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 162; //@line 3957
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 3959
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 3961
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 3963
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 3965
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 3967
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 3969
   sp = STACKTOP; //@line 3970
   return;
  }
 }
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 7396
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 7401
   label = 4; //@line 7402
  } else {
   $$01519 = $0; //@line 7404
   $23 = $1; //@line 7404
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 7409
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 7412
    $23 = $6; //@line 7413
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 7417
     label = 4; //@line 7418
     break;
    } else {
     $$01519 = $6; //@line 7421
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 7427
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 7429
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 7437
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 7445
  } else {
   $$pn = $$0; //@line 7447
   while (1) {
    $19 = $$pn + 1 | 0; //@line 7449
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 7453
     break;
    } else {
     $$pn = $19; //@line 7456
    }
   }
  }
  $$sink = $$1$lcssa; //@line 7461
 }
 return $$sink - $1 | 0; //@line 7464
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 12565
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 12572
   $10 = $1 + 16 | 0; //@line 12573
   $11 = HEAP32[$10 >> 2] | 0; //@line 12574
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 12577
    HEAP32[$1 + 24 >> 2] = $4; //@line 12579
    HEAP32[$1 + 36 >> 2] = 1; //@line 12581
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 12591
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 12596
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 12599
    HEAP8[$1 + 54 >> 0] = 1; //@line 12601
    break;
   }
   $21 = $1 + 24 | 0; //@line 12604
   $22 = HEAP32[$21 >> 2] | 0; //@line 12605
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 12608
    $28 = $4; //@line 12609
   } else {
    $28 = $22; //@line 12611
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 12620
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
      HEAP32[$AsyncCtx >> 2] = 25; //@line 278
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
      HEAP32[$AsyncCtx2 >> 2] = 26; //@line 299
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
 sp = STACKTOP; //@line 12059
 $1 = HEAP32[147] | 0; //@line 12060
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 12066
 } else {
  $19 = 0; //@line 12068
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 12074
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 12080
    $12 = HEAP32[$11 >> 2] | 0; //@line 12081
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 12087
     HEAP8[$12 >> 0] = 10; //@line 12088
     $22 = 0; //@line 12089
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 12093
   $17 = ___overflow($1, 10) | 0; //@line 12094
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 139; //@line 12097
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 12099
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 12101
    sp = STACKTOP; //@line 12102
    return 0; //@line 12103
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12105
    $22 = $17 >> 31; //@line 12107
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 12114
 }
 return $22 | 0; //@line 12116
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_59($0) {
 $0 = $0 | 0;
 var $$pre$i$i4 = 0, $12 = 0, $13 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 3452
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3458
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3460
 $$pre$i$i4 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 3461
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = $$pre$i$i4; //@line 3462
 if (!$$pre$i$i4) {
  _gpio_irq_set($8 + 28 | 0, 2, 0); //@line 3466
  return;
 }
 $12 = HEAP32[$$pre$i$i4 + 8 >> 2] | 0; //@line 3471
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(12) | 0; //@line 3472
 FUNCTION_TABLE_vi[$12 & 255]($6); //@line 3473
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 3476
  $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 3477
  HEAP32[$13 >> 2] = $6; //@line 3478
  $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 3479
  HEAP32[$14 >> 2] = $8; //@line 3480
  sp = STACKTOP; //@line 3481
  return;
 }
 ___async_unwind = 0; //@line 3484
 HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 3485
 $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 3486
 HEAP32[$13 >> 2] = $6; //@line 3487
 $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 3488
 HEAP32[$14 >> 2] = $8; //@line 3489
 sp = STACKTOP; //@line 3490
 return;
}
function __ZN4mbed11InterruptInD0Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 194
 HEAP32[$0 >> 2] = 272; //@line 195
 _gpio_irq_free($0 + 28 | 0); //@line 197
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 199
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 205
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 206
   FUNCTION_TABLE_vi[$7 & 255]($0 + 56 | 0); //@line 207
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 23; //@line 210
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
  HEAP32[$AsyncCtx3 >> 2] = 24; //@line 235
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 237
  sp = STACKTOP; //@line 238
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 241
 __ZdlPv($0); //@line 242
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_67($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3980
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3986
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3988
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3990
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3992
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 3997
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 3999
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 4000
 if (!___async) {
  ___async_unwind = 0; //@line 4003
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 162; //@line 4005
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 4007
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 4009
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 4011
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 4013
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 4015
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 4017
 sp = STACKTOP; //@line 4018
 return;
}
function _mbed_vtracef__async_cb_5($0) {
 $0 = $0 | 0;
 var $$18 = 0, $10 = 0, $12 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 753
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 755
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 757
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 759
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 764
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 766
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 771
 $16 = _snprintf($4, $6, 1716, $2) | 0; //@line 772
 $$18 = ($16 | 0) >= ($6 | 0) ? 0 : $16; //@line 774
 $19 = $4 + $$18 | 0; //@line 776
 $20 = $6 - $$18 | 0; //@line 777
 if (($$18 | 0) > 0) {
  if (!(($$18 | 0) < 1 | ($20 | 0) < 1 | $10 ^ 1)) {
   _snprintf($19, $20, 1794, $12) | 0; //@line 785
  }
 }
 $23 = HEAP32[91] | 0; //@line 788
 $24 = HEAP32[84] | 0; //@line 789
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 790
 FUNCTION_TABLE_vi[$23 & 255]($24); //@line 791
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 794
  sp = STACKTOP; //@line 795
  return;
 }
 ___async_unwind = 0; //@line 798
 HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 799
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12424
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 12433
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 12438
      HEAP32[$13 >> 2] = $2; //@line 12439
      $19 = $1 + 40 | 0; //@line 12440
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 12443
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 12453
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 12457
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 12464
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
 $$016 = 0; //@line 11130
 while (1) {
  if ((HEAPU8[3076 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 11137
   break;
  }
  $7 = $$016 + 1 | 0; //@line 11140
  if (($7 | 0) == 87) {
   $$01214 = 3164; //@line 11143
   $$115 = 87; //@line 11143
   label = 5; //@line 11144
   break;
  } else {
   $$016 = $7; //@line 11147
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 3164; //@line 11153
  } else {
   $$01214 = 3164; //@line 11155
   $$115 = $$016; //@line 11155
   label = 5; //@line 11156
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 11161
   $$113 = $$01214; //@line 11162
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 11166
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 11173
   if (!$$115) {
    $$012$lcssa = $$113; //@line 11176
    break;
   } else {
    $$01214 = $$113; //@line 11179
    label = 5; //@line 11180
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 11187
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6299
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6301
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6303
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6305
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 6307
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 6309
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 5104; //@line 6314
  HEAP32[$4 + 4 >> 2] = $6; //@line 6316
  _abort_message(5013, $4); //@line 6317
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 6320
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 6323
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 6324
 $16 = FUNCTION_TABLE_ii[$15 & 1]($12) | 0; //@line 6325
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 6329
  ___async_unwind = 0; //@line 6330
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 141; //@line 6332
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 6334
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 6336
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 6338
 sp = STACKTOP; //@line 6339
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3271
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3273
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3275
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3279
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 3283
  label = 4; //@line 3284
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 3289
   label = 4; //@line 3290
  } else {
   $$037$off039 = 3; //@line 3292
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 3296
  $17 = $8 + 40 | 0; //@line 3297
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 3300
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 3310
    $$037$off039 = $$037$off038; //@line 3311
   } else {
    $$037$off039 = $$037$off038; //@line 3313
   }
  } else {
   $$037$off039 = $$037$off038; //@line 3316
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 3319
 return;
}
function _strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $2 = 0, $5 = 0;
 $2 = HEAP8[$1 >> 0] | 0; //@line 11203
 do {
  if (!($2 << 24 >> 24)) {
   $$0 = $0; //@line 11207
  } else {
   $5 = _strchr($0, $2 << 24 >> 24) | 0; //@line 11210
   if (!$5) {
    $$0 = 0; //@line 11213
   } else {
    if (!(HEAP8[$1 + 1 >> 0] | 0)) {
     $$0 = $5; //@line 11219
    } else {
     if (!(HEAP8[$5 + 1 >> 0] | 0)) {
      $$0 = 0; //@line 11225
     } else {
      if (!(HEAP8[$1 + 2 >> 0] | 0)) {
       $$0 = _twobyte_strstr($5, $1) | 0; //@line 11232
       break;
      }
      if (!(HEAP8[$5 + 2 >> 0] | 0)) {
       $$0 = 0; //@line 11239
      } else {
       if (!(HEAP8[$1 + 3 >> 0] | 0)) {
        $$0 = _threebyte_strstr($5, $1) | 0; //@line 11246
        break;
       }
       if (!(HEAP8[$5 + 3 >> 0] | 0)) {
        $$0 = 0; //@line 11253
       } else {
        if (!(HEAP8[$1 + 4 >> 0] | 0)) {
         $$0 = _fourbyte_strstr($5, $1) | 0; //@line 11260
         break;
        } else {
         $$0 = _twoway_strstr($5, $1) | 0; //@line 11264
         break;
        }
       }
      }
     }
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 11274
}
function __ZN4mbed11InterruptInD2Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 143
 HEAP32[$0 >> 2] = 272; //@line 144
 _gpio_irq_free($0 + 28 | 0); //@line 146
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 148
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 154
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 155
   FUNCTION_TABLE_vi[$7 & 255]($0 + 56 | 0); //@line 156
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 21; //@line 159
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
  HEAP32[$AsyncCtx3 >> 2] = 22; //@line 183
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
 $18 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8 | (HEAPU8[$1 + 3 >> 0] | 0); //@line 11399
 $32 = $0 + 3 | 0; //@line 11413
 $33 = HEAP8[$32 >> 0] | 0; //@line 11414
 $35 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | (HEAPU8[$0 + 2 >> 0] | 0) << 8 | $33 & 255; //@line 11416
 if ($33 << 24 >> 24 == 0 | ($35 | 0) == ($18 | 0)) {
  $$lcssa = $33; //@line 11421
  $$sink21$lcssa = $32; //@line 11421
 } else {
  $$sink2123 = $32; //@line 11423
  $39 = $35; //@line 11423
  while (1) {
   $40 = $$sink2123 + 1 | 0; //@line 11426
   $41 = HEAP8[$40 >> 0] | 0; //@line 11427
   $39 = $39 << 8 | $41 & 255; //@line 11429
   if ($41 << 24 >> 24 == 0 | ($39 | 0) == ($18 | 0)) {
    $$lcssa = $41; //@line 11434
    $$sink21$lcssa = $40; //@line 11434
    break;
   } else {
    $$sink2123 = $40; //@line 11437
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$sink21$lcssa + -3 | 0 : 0) | 0; //@line 11444
}
function _main__async_cb_39($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 2362
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2364
 $4 = $2 + 4 | 0; //@line 2366
 HEAP32[$4 >> 2] = 0; //@line 2368
 HEAP32[$4 + 4 >> 2] = 0; //@line 2371
 HEAP32[$2 >> 2] = 9; //@line 2372
 $8 = $2 + 12 | 0; //@line 2373
 HEAP32[$8 >> 2] = 384; //@line 2374
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 2375
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5824, $2); //@line 2376
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 118; //@line 2379
  $9 = $ReallocAsyncCtx9 + 4 | 0; //@line 2380
  HEAP32[$9 >> 2] = $8; //@line 2381
  $10 = $ReallocAsyncCtx9 + 8 | 0; //@line 2382
  HEAP32[$10 >> 2] = $2; //@line 2383
  sp = STACKTOP; //@line 2384
  return;
 }
 ___async_unwind = 0; //@line 2387
 HEAP32[$ReallocAsyncCtx9 >> 2] = 118; //@line 2388
 $9 = $ReallocAsyncCtx9 + 4 | 0; //@line 2389
 HEAP32[$9 >> 2] = $8; //@line 2390
 $10 = $ReallocAsyncCtx9 + 8 | 0; //@line 2391
 HEAP32[$10 >> 2] = $2; //@line 2392
 sp = STACKTOP; //@line 2393
 return;
}
function __ZN4mbed6TickerD0Ev($0) {
 $0 = $0 | 0;
 var $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3388
 HEAP32[$0 >> 2] = 440; //@line 3389
 _emscripten_asm_const_ii(7, $0 | 0) | 0; //@line 3390
 $3 = HEAP32[$0 + 52 >> 2] | 0; //@line 3392
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 3398
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3399
   FUNCTION_TABLE_vi[$7 & 255]($0 + 40 | 0); //@line 3400
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 101; //@line 3403
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3405
    sp = STACKTOP; //@line 3406
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 3409
    break;
   }
  }
 } while (0);
 $AsyncCtx2 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3414
 __ZN4mbed10TimerEventD2Ev($0); //@line 3415
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 102; //@line 3418
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 3420
  sp = STACKTOP; //@line 3421
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 3424
  __ZdlPv($0); //@line 3425
  return;
 }
}
function _mbed_vtracef__async_cb_11($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1138
 $3 = HEAP32[92] | 0; //@line 1142
 if (HEAP8[$0 + 4 >> 0] & 1 & ($3 | 0) != 0) {
  $5 = HEAP32[84] | 0; //@line 1146
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 1147
  FUNCTION_TABLE_vi[$3 & 255]($5); //@line 1148
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 48; //@line 1151
   sp = STACKTOP; //@line 1152
   return;
  }
  ___async_unwind = 0; //@line 1155
  HEAP32[$ReallocAsyncCtx2 >> 2] = 48; //@line 1156
  sp = STACKTOP; //@line 1157
  return;
 } else {
  $6 = HEAP32[91] | 0; //@line 1160
  $7 = HEAP32[84] | 0; //@line 1161
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 1162
  FUNCTION_TABLE_vi[$6 & 255]($7); //@line 1163
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 50; //@line 1166
   sp = STACKTOP; //@line 1167
   return;
  }
  ___async_unwind = 0; //@line 1170
  HEAP32[$ReallocAsyncCtx4 >> 2] = 50; //@line 1171
  sp = STACKTOP; //@line 1172
  return;
 }
}
function _abort_message($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12257
 STACKTOP = STACKTOP + 16 | 0; //@line 12258
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12258
 $1 = sp; //@line 12259
 HEAP32[$1 >> 2] = $varargs; //@line 12260
 $2 = HEAP32[115] | 0; //@line 12261
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12262
 _vfprintf($2, $0, $1) | 0; //@line 12263
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 142; //@line 12266
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 12268
  sp = STACKTOP; //@line 12269
  STACKTOP = sp; //@line 12270
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 12272
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12273
 _fputc(10, $2) | 0; //@line 12274
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 143; //@line 12277
  sp = STACKTOP; //@line 12278
  STACKTOP = sp; //@line 12279
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 12281
  _abort(); //@line 12282
 }
}
function __ZN4mbed7TimeoutD0Ev($0) {
 $0 = $0 | 0;
 var $2 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 535
 HEAP32[$0 >> 2] = 440; //@line 536
 __ZN4mbed6Ticker6detachEv($0); //@line 537
 $2 = HEAP32[$0 + 52 >> 2] | 0; //@line 539
 do {
  if ($2 | 0) {
   $6 = HEAP32[$2 + 8 >> 2] | 0; //@line 545
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 546
   FUNCTION_TABLE_vi[$6 & 255]($0 + 40 | 0); //@line 547
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 34; //@line 550
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 552
    sp = STACKTOP; //@line 553
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 556
    break;
   }
  }
 } while (0);
 $AsyncCtx2 = _emscripten_alloc_async_context(8, sp) | 0; //@line 561
 __ZN4mbed10TimerEventD2Ev($0); //@line 562
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 35; //@line 565
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 567
  sp = STACKTOP; //@line 568
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 571
  __ZdlPv($0); //@line 572
  return;
 }
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_51($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $15 = 0, $17 = 0, $18 = 0, $21 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 3101
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3107
 $8 = $0 + 16 | 0; //@line 3109
 $10 = HEAP32[$8 >> 2] | 0; //@line 3111
 $13 = HEAP32[$8 + 4 >> 2] | 0; //@line 3114
 $15 = HEAP32[$0 + 24 >> 2] | 0; //@line 3116
 $17 = HEAP32[$0 + 28 >> 2] | 0; //@line 3118
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 3120
 __ZN4mbed6Ticker5setupEy($6, $10, $13); //@line 3121
 $18 = HEAP32[$15 >> 2] | 0; //@line 3122
 if (!$18) {
  return;
 }
 $21 = HEAP32[$18 + 8 >> 2] | 0; //@line 3128
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 3129
 FUNCTION_TABLE_vi[$21 & 255]($17); //@line 3130
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 3133
  sp = STACKTOP; //@line 3134
  return;
 }
 ___async_unwind = 0; //@line 3137
 HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 3138
 sp = STACKTOP; //@line 3139
 return;
}
function _threebyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$016$lcssa = 0, $$01618 = 0, $$019 = 0, $$lcssa = 0, $14 = 0, $23 = 0, $24 = 0, $27 = 0, $30 = 0, $31 = 0;
 $14 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8; //@line 11333
 $23 = $0 + 2 | 0; //@line 11342
 $24 = HEAP8[$23 >> 0] | 0; //@line 11343
 $27 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | ($24 & 255) << 8; //@line 11346
 if (($27 | 0) == ($14 | 0) | $24 << 24 >> 24 == 0) {
  $$016$lcssa = $23; //@line 11351
  $$lcssa = $24; //@line 11351
 } else {
  $$01618 = $23; //@line 11353
  $$019 = $27; //@line 11353
  while (1) {
   $30 = $$01618 + 1 | 0; //@line 11355
   $31 = HEAP8[$30 >> 0] | 0; //@line 11356
   $$019 = ($$019 | $31 & 255) << 8; //@line 11359
   if (($$019 | 0) == ($14 | 0) | $31 << 24 >> 24 == 0) {
    $$016$lcssa = $30; //@line 11364
    $$lcssa = $31; //@line 11364
    break;
   } else {
    $$01618 = $30; //@line 11367
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$016$lcssa + -2 | 0 : 0) | 0; //@line 11374
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 10961
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 10961
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 10962
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 10963
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 10972
    $$016 = $9; //@line 10975
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 10975
   } else {
    $$016 = $0; //@line 10977
    $storemerge = 0; //@line 10977
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 10979
   $$0 = $$016; //@line 10980
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 10984
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 10990
   HEAP32[tempDoublePtr >> 2] = $2; //@line 10993
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 10993
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 10994
  }
 }
 return +$$0;
}
function _main__async_cb_46($0) {
 $0 = $0 | 0;
 var $4 = 0, $5 = 0, $8 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2654
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2658
 $5 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 2659
 if (!$5) {
  $ReallocAsyncCtx10 = _emscripten_realloc_async_context(4) | 0; //@line 2662
  _wait_ms(-1); //@line 2663
  if (___async) {
   HEAP32[$ReallocAsyncCtx10 >> 2] = 120; //@line 2666
   sp = STACKTOP; //@line 2667
   return;
  }
  ___async_unwind = 0; //@line 2670
  HEAP32[$ReallocAsyncCtx10 >> 2] = 120; //@line 2671
  sp = STACKTOP; //@line 2672
  return;
 } else {
  $8 = HEAP32[$5 + 8 >> 2] | 0; //@line 2676
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 2677
  FUNCTION_TABLE_vi[$8 & 255]($4); //@line 2678
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 119; //@line 2681
   sp = STACKTOP; //@line 2682
   return;
  }
  ___async_unwind = 0; //@line 2685
  HEAP32[$ReallocAsyncCtx3 >> 2] = 119; //@line 2686
  sp = STACKTOP; //@line 2687
  return;
 }
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13860
 STACKTOP = STACKTOP + 16 | 0; //@line 13861
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13861
 $3 = sp; //@line 13862
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 13864
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 13867
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 13868
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 13869
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 166; //@line 13872
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 13874
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 13876
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 13878
  sp = STACKTOP; //@line 13879
  STACKTOP = sp; //@line 13880
  return 0; //@line 13880
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 13882
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 13886
 }
 STACKTOP = sp; //@line 13888
 return $8 & 1 | 0; //@line 13888
}
function __ZN4mbed6TickerD2Ev($0) {
 $0 = $0 | 0;
 var $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3347
 HEAP32[$0 >> 2] = 440; //@line 3348
 _emscripten_asm_const_ii(7, $0 | 0) | 0; //@line 3349
 $3 = HEAP32[$0 + 52 >> 2] | 0; //@line 3351
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 3357
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3358
   FUNCTION_TABLE_vi[$7 & 255]($0 + 40 | 0); //@line 3359
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 99; //@line 3362
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3364
    sp = STACKTOP; //@line 3365
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 3368
    break;
   }
  }
 } while (0);
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3373
 __ZN4mbed10TimerEventD2Ev($0); //@line 3374
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 100; //@line 3377
  sp = STACKTOP; //@line 3378
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 3381
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
 sp = STACKTOP; //@line 12780
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 12786
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 12789
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 12792
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 12793
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 12794
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 148; //@line 12797
    sp = STACKTOP; //@line 12798
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12801
    break;
   }
  }
 } while (0);
 return;
}
function _schedule_interrupt__async_cb_64($0) {
 $0 = $0 | 0;
 var $16 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 3874
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3878
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3880
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3882
 $8 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 3883
 if ($4 >>> 0 > $8 >>> 0) {
  if (!($AsyncRetVal >>> 0 >= $4 >>> 0 | $AsyncRetVal >>> 0 < $8 >>> 0)) {
   return;
  }
 } else {
  if (!($AsyncRetVal >>> 0 >= $4 >>> 0 & $AsyncRetVal >>> 0 < $8 >>> 0)) {
   return;
  }
 }
 $16 = HEAP32[(HEAP32[$6 >> 2] | 0) + 20 >> 2] | 0; //@line 3902
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(4) | 0; //@line 3903
 FUNCTION_TABLE_v[$16 & 15](); //@line 3904
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 72; //@line 3907
  sp = STACKTOP; //@line 3908
  return;
 }
 ___async_unwind = 0; //@line 3911
 HEAP32[$ReallocAsyncCtx6 >> 2] = 72; //@line 3912
 sp = STACKTOP; //@line 3913
 return;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2758
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2766
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2768
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2770
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2772
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2774
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2776
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 2778
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 2789
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 2790
 HEAP32[$10 >> 2] = 0; //@line 2791
 HEAP32[$12 >> 2] = 0; //@line 2792
 HEAP32[$14 >> 2] = 0; //@line 2793
 HEAP32[$2 >> 2] = 0; //@line 2794
 $33 = HEAP32[$16 >> 2] | 0; //@line 2795
 HEAP32[$16 >> 2] = $33 | $18; //@line 2800
 if ($20 | 0) {
  ___unlockfile($22); //@line 2803
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 2806
 return;
}
function __ZN4mbed7TimeoutD2Ev($0) {
 $0 = $0 | 0;
 var $2 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 494
 HEAP32[$0 >> 2] = 440; //@line 495
 __ZN4mbed6Ticker6detachEv($0); //@line 496
 $2 = HEAP32[$0 + 52 >> 2] | 0; //@line 498
 do {
  if ($2 | 0) {
   $6 = HEAP32[$2 + 8 >> 2] | 0; //@line 504
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 505
   FUNCTION_TABLE_vi[$6 & 255]($0 + 40 | 0); //@line 506
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 32; //@line 509
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 511
    sp = STACKTOP; //@line 512
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 515
    break;
   }
  }
 } while (0);
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 520
 __ZN4mbed10TimerEventD2Ev($0); //@line 521
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 33; //@line 524
  sp = STACKTOP; //@line 525
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 528
  return;
 }
}
function _mbed_vtracef__async_cb_8($0) {
 $0 = $0 | 0;
 var $$pre = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 869
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 873
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 2) {
  return;
 }
 $5 = $4 + -1 | 0; //@line 878
 $$pre = HEAP32[94] | 0; //@line 879
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 880
 FUNCTION_TABLE_v[$$pre & 15](); //@line 881
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 57; //@line 884
  $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 885
  HEAP32[$6 >> 2] = $4; //@line 886
  $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 887
  HEAP32[$7 >> 2] = $5; //@line 888
  sp = STACKTOP; //@line 889
  return;
 }
 ___async_unwind = 0; //@line 892
 HEAP32[$ReallocAsyncCtx9 >> 2] = 57; //@line 893
 $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 894
 HEAP32[$6 >> 2] = $4; //@line 895
 $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 896
 HEAP32[$7 >> 2] = $5; //@line 897
 sp = STACKTOP; //@line 898
 return;
}
function _mbed_vtracef__async_cb_7($0) {
 $0 = $0 | 0;
 var $$pre = 0, $2 = 0, $4 = 0, $5 = 0, $6 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 836
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 838
 if (($2 | 0) <= 1) {
  return;
 }
 $4 = $2 + -1 | 0; //@line 843
 $$pre = HEAP32[94] | 0; //@line 844
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 845
 FUNCTION_TABLE_v[$$pre & 15](); //@line 846
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 57; //@line 849
  $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 850
  HEAP32[$5 >> 2] = $2; //@line 851
  $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 852
  HEAP32[$6 >> 2] = $4; //@line 853
  sp = STACKTOP; //@line 854
  return;
 }
 ___async_unwind = 0; //@line 857
 HEAP32[$ReallocAsyncCtx9 >> 2] = 57; //@line 858
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
 sp = STACKTOP; //@line 13779
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 13781
 $8 = $7 >> 8; //@line 13782
 if (!($7 & 1)) {
  $$0 = $8; //@line 13786
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 13791
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 13793
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 13796
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13801
 FUNCTION_TABLE_viiiiii[$17 & 3]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 13802
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 164; //@line 13805
  sp = STACKTOP; //@line 13806
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13809
  return;
 }
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12949
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 12955
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 12958
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 12961
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 12962
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 12963
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 151; //@line 12966
    sp = STACKTOP; //@line 12967
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12970
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
 sp = STACKTOP; //@line 13821
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 13823
 $7 = $6 >> 8; //@line 13824
 if (!($6 & 1)) {
  $$0 = $7; //@line 13828
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 13833
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 13835
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 13838
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13843
 FUNCTION_TABLE_viiiii[$16 & 3]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 13844
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 165; //@line 13847
  sp = STACKTOP; //@line 13848
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13851
  return;
 }
}
function _ticker_remove_event($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2667
 $4 = (HEAP32[$0 + 4 >> 2] | 0) + 4 | 0; //@line 2670
 $5 = HEAP32[$4 >> 2] | 0; //@line 2671
 if (($5 | 0) == ($1 | 0)) {
  HEAP32[$4 >> 2] = HEAP32[$1 + 12 >> 2]; //@line 2676
  $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2677
  _schedule_interrupt($0); //@line 2678
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 74; //@line 2681
   sp = STACKTOP; //@line 2682
   return;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2685
  return;
 } else {
  $$0 = $5; //@line 2688
 }
 do {
  if (!$$0) {
   label = 8; //@line 2693
   break;
  }
  $10 = $$0 + 12 | 0; //@line 2696
  $$0 = HEAP32[$10 >> 2] | 0; //@line 2697
 } while (($$0 | 0) != ($1 | 0));
 if ((label | 0) == 8) {
  return;
 }
 HEAP32[$10 >> 2] = HEAP32[$1 + 12 >> 2]; //@line 2710
 return;
}
function ___dynamic_cast__async_cb_69($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4097
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4099
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4101
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4107
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 4122
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 4138
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 4143
    break;
   }
  default:
   {
    $$0 = 0; //@line 4147
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 4152
 return;
}
function _mbed_error_vfprintf__async_cb_19($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1698
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 1700
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1702
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1704
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1706
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1708
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 1710
 _serial_putc(5744, $2 << 24 >> 24); //@line 1711
 if (!___async) {
  ___async_unwind = 0; //@line 1714
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 1716
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 1718
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 1720
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $8; //@line 1722
 HEAP8[$ReallocAsyncCtx2 + 16 >> 0] = $2; //@line 1724
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 1726
 sp = STACKTOP; //@line 1727
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13736
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 13738
 $6 = $5 >> 8; //@line 13739
 if (!($5 & 1)) {
  $$0 = $6; //@line 13743
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 13748
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 13750
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 13753
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13758
 FUNCTION_TABLE_viiii[$15 & 3]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 13759
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 163; //@line 13762
  sp = STACKTOP; //@line 13763
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13766
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
 sp = STACKTOP; //@line 9959
 STACKTOP = STACKTOP + 256 | 0; //@line 9960
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 9960
 $5 = sp; //@line 9961
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 9967
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 9971
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 9974
   $$011 = $9; //@line 9975
   do {
    _out_670($0, $5, 256); //@line 9977
    $$011 = $$011 + -256 | 0; //@line 9978
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 9987
  } else {
   $$0$lcssa = $9; //@line 9989
  }
  _out_670($0, $5, $$0$lcssa); //@line 9991
 }
 STACKTOP = sp; //@line 9993
 return;
}
function __ZN4mbed11InterruptInD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1383
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1385
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 1387
 if (!$4) {
  __ZdlPv($2); //@line 1390
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 1395
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 1396
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 1397
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 24; //@line 1400
  $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 1401
  HEAP32[$9 >> 2] = $2; //@line 1402
  sp = STACKTOP; //@line 1403
  return;
 }
 ___async_unwind = 0; //@line 1406
 HEAP32[$ReallocAsyncCtx2 >> 2] = 24; //@line 1407
 $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 1408
 HEAP32[$9 >> 2] = $2; //@line 1409
 sp = STACKTOP; //@line 1410
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7254
 STACKTOP = STACKTOP + 32 | 0; //@line 7255
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 7255
 $vararg_buffer = sp; //@line 7256
 $3 = sp + 20 | 0; //@line 7257
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 7261
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 7263
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 7265
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 7267
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 7269
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 7274
  $10 = -1; //@line 7275
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 7278
 }
 STACKTOP = sp; //@line 7280
 return $10 | 0; //@line 7280
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 2723
 STACKTOP = STACKTOP + 16 | 0; //@line 2724
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2724
 $vararg_buffer = sp; //@line 2725
 HEAP32[$vararg_buffer >> 2] = $0; //@line 2726
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 2728
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 2730
 _mbed_error_printf(1887, $vararg_buffer); //@line 2731
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2732
 _mbed_die(); //@line 2733
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 75; //@line 2736
  sp = STACKTOP; //@line 2737
  STACKTOP = sp; //@line 2738
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2740
  STACKTOP = sp; //@line 2741
  return;
 }
}
function __ZN4mbed7Timeout7handlerEv__async_cb_71($0) {
 $0 = $0 | 0;
 var $4 = 0, $5 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4317
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4321
 $5 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 4322
 if (!$5) {
  return;
 }
 $8 = HEAP32[$5 + 8 >> 2] | 0; //@line 4328
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 4329
 FUNCTION_TABLE_vi[$8 & 255]($4); //@line 4330
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 39; //@line 4333
  $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 4334
  HEAP32[$9 >> 2] = $4; //@line 4335
  sp = STACKTOP; //@line 4336
  return;
 }
 ___async_unwind = 0; //@line 4339
 HEAP32[$ReallocAsyncCtx3 >> 2] = 39; //@line 4340
 $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 4341
 HEAP32[$9 >> 2] = $4; //@line 4342
 sp = STACKTOP; //@line 4343
 return;
}
function _snprintf($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11838
 STACKTOP = STACKTOP + 16 | 0; //@line 11839
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11839
 $3 = sp; //@line 11840
 HEAP32[$3 >> 2] = $varargs; //@line 11841
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 11842
 $4 = _vsnprintf($0, $1, $2, $3) | 0; //@line 11843
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 135; //@line 11846
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 11848
  sp = STACKTOP; //@line 11849
  STACKTOP = sp; //@line 11850
  return 0; //@line 11850
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11852
  STACKTOP = sp; //@line 11853
  return $4 | 0; //@line 11853
 }
 return 0; //@line 11855
}
function _schedule_interrupt__async_cb_63($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 3842
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3844
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3846
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3848
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 4 >> 2] | 0; //@line 3851
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(16) | 0; //@line 3852
 $10 = FUNCTION_TABLE_i[$9 & 3]() | 0; //@line 3853
 if (!___async) {
  HEAP32[___async_retval >> 2] = $10; //@line 3857
  ___async_unwind = 0; //@line 3858
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 71; //@line 3860
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $4; //@line 3862
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $6; //@line 3864
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $2; //@line 3866
 sp = STACKTOP; //@line 3867
 return;
}
function _initialize__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4381
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4383
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4385
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4387
 $9 = HEAP32[(HEAP32[$4 >> 2] | 0) + 24 >> 2] | 0; //@line 4390
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 4391
 $10 = FUNCTION_TABLE_i[$9 & 3]() | 0; //@line 4392
 if (!___async) {
  HEAP32[___async_retval >> 2] = $10; //@line 4396
  ___async_unwind = 0; //@line 4397
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 61; //@line 4399
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 4401
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 4403
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 4405
 sp = STACKTOP; //@line 4406
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 12502
 $5 = HEAP32[$4 >> 2] | 0; //@line 12503
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 12507
   HEAP32[$1 + 24 >> 2] = $3; //@line 12509
   HEAP32[$1 + 36 >> 2] = 1; //@line 12511
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 12515
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 12518
    HEAP32[$1 + 24 >> 2] = 2; //@line 12520
    HEAP8[$1 + 54 >> 0] = 1; //@line 12522
    break;
   }
   $10 = $1 + 24 | 0; //@line 12525
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 12529
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_6($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 806
 HEAP32[88] = HEAP32[86]; //@line 808
 $2 = HEAP32[94] | 0; //@line 809
 if (!$2) {
  return;
 }
 $4 = HEAP32[95] | 0; //@line 814
 HEAP32[95] = 0; //@line 815
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 816
 FUNCTION_TABLE_v[$2 & 15](); //@line 817
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 820
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 821
  HEAP32[$5 >> 2] = $4; //@line 822
  sp = STACKTOP; //@line 823
  return;
 }
 ___async_unwind = 0; //@line 826
 HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 827
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 828
 HEAP32[$5 >> 2] = $4; //@line 829
 sp = STACKTOP; //@line 830
 return;
}
function _mbed_vtracef__async_cb_3($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 542
 HEAP32[88] = HEAP32[86]; //@line 544
 $2 = HEAP32[94] | 0; //@line 545
 if (!$2) {
  return;
 }
 $4 = HEAP32[95] | 0; //@line 550
 HEAP32[95] = 0; //@line 551
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 552
 FUNCTION_TABLE_v[$2 & 15](); //@line 553
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 556
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 557
  HEAP32[$5 >> 2] = $4; //@line 558
  sp = STACKTOP; //@line 559
  return;
 }
 ___async_unwind = 0; //@line 562
 HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 563
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 564
 HEAP32[$5 >> 2] = $4; //@line 565
 sp = STACKTOP; //@line 566
 return;
}
function _mbed_vtracef__async_cb_2($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 512
 HEAP32[88] = HEAP32[86]; //@line 514
 $2 = HEAP32[94] | 0; //@line 515
 if (!$2) {
  return;
 }
 $4 = HEAP32[95] | 0; //@line 520
 HEAP32[95] = 0; //@line 521
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 522
 FUNCTION_TABLE_v[$2 & 15](); //@line 523
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 526
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 527
  HEAP32[$5 >> 2] = $4; //@line 528
  sp = STACKTOP; //@line 529
  return;
 }
 ___async_unwind = 0; //@line 532
 HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 533
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 534
 HEAP32[$5 >> 2] = $4; //@line 535
 sp = STACKTOP; //@line 536
 return;
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 13052
 STACKTOP = STACKTOP + 16 | 0; //@line 13053
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13053
 $vararg_buffer = sp; //@line 13054
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 13055
 FUNCTION_TABLE_v[$0 & 15](); //@line 13056
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 153; //@line 13059
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 13061
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 13063
  sp = STACKTOP; //@line 13064
  STACKTOP = sp; //@line 13065
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13067
  _abort_message(5395, $vararg_buffer); //@line 13068
 }
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 7361
 $3 = HEAP8[$1 >> 0] | 0; //@line 7362
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 7367
  $$lcssa8 = $2; //@line 7367
 } else {
  $$011 = $1; //@line 7369
  $$0710 = $0; //@line 7369
  do {
   $$0710 = $$0710 + 1 | 0; //@line 7371
   $$011 = $$011 + 1 | 0; //@line 7372
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 7373
   $9 = HEAP8[$$011 >> 0] | 0; //@line 7374
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 7379
  $$lcssa8 = $8; //@line 7379
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 7389
}
function _memcmp($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $14 = 0, $4 = 0, $5 = 0;
 L1 : do {
  if (!$2) {
   $14 = 0; //@line 11803
  } else {
   $$01318 = $0; //@line 11805
   $$01417 = $2; //@line 11805
   $$019 = $1; //@line 11805
   while (1) {
    $4 = HEAP8[$$01318 >> 0] | 0; //@line 11807
    $5 = HEAP8[$$019 >> 0] | 0; //@line 11808
    if ($4 << 24 >> 24 != $5 << 24 >> 24) {
     break;
    }
    $$01417 = $$01417 + -1 | 0; //@line 11813
    if (!$$01417) {
     $14 = 0; //@line 11818
     break L1;
    } else {
     $$01318 = $$01318 + 1 | 0; //@line 11821
     $$019 = $$019 + 1 | 0; //@line 11821
    }
   }
   $14 = ($4 & 255) - ($5 & 255) | 0; //@line 11827
  }
 } while (0);
 return $14 | 0; //@line 11830
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3288
 $2 = HEAP32[147] | 0; //@line 3289
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3290
 _putc($1, $2) | 0; //@line 3291
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 97; //@line 3294
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 3296
  sp = STACKTOP; //@line 3297
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3300
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3301
 _fflush($2) | 0; //@line 3302
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 98; //@line 3305
  sp = STACKTOP; //@line 3306
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3309
  return;
 }
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7313
 STACKTOP = STACKTOP + 32 | 0; //@line 7314
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 7314
 $vararg_buffer = sp; //@line 7315
 HEAP32[$0 + 36 >> 2] = 1; //@line 7318
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 7326
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 7328
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 7330
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 7335
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 7338
 STACKTOP = sp; //@line 7339
 return $14 | 0; //@line 7339
}
function _mbed_die__async_cb_36($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 2228
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2230
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2232
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 2233
 _wait_ms(150); //@line 2234
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 77; //@line 2237
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 2238
  HEAP32[$4 >> 2] = $2; //@line 2239
  sp = STACKTOP; //@line 2240
  return;
 }
 ___async_unwind = 0; //@line 2243
 HEAP32[$ReallocAsyncCtx15 >> 2] = 77; //@line 2244
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 2245
 HEAP32[$4 >> 2] = $2; //@line 2246
 sp = STACKTOP; //@line 2247
 return;
}
function _mbed_die__async_cb_35($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 2203
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2205
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2207
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 2208
 _wait_ms(150); //@line 2209
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 78; //@line 2212
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 2213
  HEAP32[$4 >> 2] = $2; //@line 2214
  sp = STACKTOP; //@line 2215
  return;
 }
 ___async_unwind = 0; //@line 2218
 HEAP32[$ReallocAsyncCtx14 >> 2] = 78; //@line 2219
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 2220
 HEAP32[$4 >> 2] = $2; //@line 2221
 sp = STACKTOP; //@line 2222
 return;
}
function _mbed_die__async_cb_34($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 2178
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2180
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2182
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 2183
 _wait_ms(150); //@line 2184
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 79; //@line 2187
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 2188
  HEAP32[$4 >> 2] = $2; //@line 2189
  sp = STACKTOP; //@line 2190
  return;
 }
 ___async_unwind = 0; //@line 2193
 HEAP32[$ReallocAsyncCtx13 >> 2] = 79; //@line 2194
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 2195
 HEAP32[$4 >> 2] = $2; //@line 2196
 sp = STACKTOP; //@line 2197
 return;
}
function _mbed_die__async_cb_33($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 2153
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2155
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2157
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 2158
 _wait_ms(150); //@line 2159
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 80; //@line 2162
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 2163
  HEAP32[$4 >> 2] = $2; //@line 2164
  sp = STACKTOP; //@line 2165
  return;
 }
 ___async_unwind = 0; //@line 2168
 HEAP32[$ReallocAsyncCtx12 >> 2] = 80; //@line 2169
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 2170
 HEAP32[$4 >> 2] = $2; //@line 2171
 sp = STACKTOP; //@line 2172
 return;
}
function _mbed_die__async_cb_32($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 2128
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2130
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2132
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 2133
 _wait_ms(150); //@line 2134
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 81; //@line 2137
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 2138
  HEAP32[$4 >> 2] = $2; //@line 2139
  sp = STACKTOP; //@line 2140
  return;
 }
 ___async_unwind = 0; //@line 2143
 HEAP32[$ReallocAsyncCtx11 >> 2] = 81; //@line 2144
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 2145
 HEAP32[$4 >> 2] = $2; //@line 2146
 sp = STACKTOP; //@line 2147
 return;
}
function _mbed_die__async_cb_31($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 2103
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2105
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2107
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 2108
 _wait_ms(150); //@line 2109
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 82; //@line 2112
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 2113
  HEAP32[$4 >> 2] = $2; //@line 2114
  sp = STACKTOP; //@line 2115
  return;
 }
 ___async_unwind = 0; //@line 2118
 HEAP32[$ReallocAsyncCtx10 >> 2] = 82; //@line 2119
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 2120
 HEAP32[$4 >> 2] = $2; //@line 2121
 sp = STACKTOP; //@line 2122
 return;
}
function _mbed_tracef($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 770
 STACKTOP = STACKTOP + 16 | 0; //@line 771
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 771
 $3 = sp; //@line 772
 HEAP32[$3 >> 2] = $varargs; //@line 773
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 774
 _mbed_vtracef($0, $1, $2, $3); //@line 775
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 45; //@line 778
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 780
  sp = STACKTOP; //@line 781
  STACKTOP = sp; //@line 782
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 784
  STACKTOP = sp; //@line 785
  return;
 }
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 1853
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1855
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 1857
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 1858
 _wait_ms(150); //@line 1859
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 76; //@line 1862
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 1863
  HEAP32[$4 >> 2] = $2; //@line 1864
  sp = STACKTOP; //@line 1865
  return;
 }
 ___async_unwind = 0; //@line 1868
 HEAP32[$ReallocAsyncCtx16 >> 2] = 76; //@line 1869
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 1870
 HEAP32[$4 >> 2] = $2; //@line 1871
 sp = STACKTOP; //@line 1872
 return;
}
function _mbed_die__async_cb_30($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 2078
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2080
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2082
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 2083
 _wait_ms(150); //@line 2084
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 83; //@line 2087
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 2088
  HEAP32[$4 >> 2] = $2; //@line 2089
  sp = STACKTOP; //@line 2090
  return;
 }
 ___async_unwind = 0; //@line 2093
 HEAP32[$ReallocAsyncCtx9 >> 2] = 83; //@line 2094
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 2095
 HEAP32[$4 >> 2] = $2; //@line 2096
 sp = STACKTOP; //@line 2097
 return;
}
function _mbed_die__async_cb_29($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 2053
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2055
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2057
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 2058
 _wait_ms(400); //@line 2059
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 84; //@line 2062
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 2063
  HEAP32[$4 >> 2] = $2; //@line 2064
  sp = STACKTOP; //@line 2065
  return;
 }
 ___async_unwind = 0; //@line 2068
 HEAP32[$ReallocAsyncCtx8 >> 2] = 84; //@line 2069
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 2070
 HEAP32[$4 >> 2] = $2; //@line 2071
 sp = STACKTOP; //@line 2072
 return;
}
function _mbed_die__async_cb_28($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2028
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2030
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2032
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 2033
 _wait_ms(400); //@line 2034
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 85; //@line 2037
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 2038
  HEAP32[$4 >> 2] = $2; //@line 2039
  sp = STACKTOP; //@line 2040
  return;
 }
 ___async_unwind = 0; //@line 2043
 HEAP32[$ReallocAsyncCtx7 >> 2] = 85; //@line 2044
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 2045
 HEAP32[$4 >> 2] = $2; //@line 2046
 sp = STACKTOP; //@line 2047
 return;
}
function _mbed_die__async_cb_27($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 2003
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2005
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2007
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 2008
 _wait_ms(400); //@line 2009
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 86; //@line 2012
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 2013
  HEAP32[$4 >> 2] = $2; //@line 2014
  sp = STACKTOP; //@line 2015
  return;
 }
 ___async_unwind = 0; //@line 2018
 HEAP32[$ReallocAsyncCtx6 >> 2] = 86; //@line 2019
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 2020
 HEAP32[$4 >> 2] = $2; //@line 2021
 sp = STACKTOP; //@line 2022
 return;
}
function _mbed_die__async_cb_26($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 1978
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1980
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 1982
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 1983
 _wait_ms(400); //@line 1984
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 87; //@line 1987
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 1988
  HEAP32[$4 >> 2] = $2; //@line 1989
  sp = STACKTOP; //@line 1990
  return;
 }
 ___async_unwind = 0; //@line 1993
 HEAP32[$ReallocAsyncCtx5 >> 2] = 87; //@line 1994
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 1995
 HEAP32[$4 >> 2] = $2; //@line 1996
 sp = STACKTOP; //@line 1997
 return;
}
function _mbed_die__async_cb_25($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1953
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1955
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 1957
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 1958
 _wait_ms(400); //@line 1959
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 88; //@line 1962
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 1963
  HEAP32[$4 >> 2] = $2; //@line 1964
  sp = STACKTOP; //@line 1965
  return;
 }
 ___async_unwind = 0; //@line 1968
 HEAP32[$ReallocAsyncCtx4 >> 2] = 88; //@line 1969
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 1970
 HEAP32[$4 >> 2] = $2; //@line 1971
 sp = STACKTOP; //@line 1972
 return;
}
function _mbed_die__async_cb_24($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1928
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1930
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 1932
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 1933
 _wait_ms(400); //@line 1934
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 89; //@line 1937
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 1938
  HEAP32[$4 >> 2] = $2; //@line 1939
  sp = STACKTOP; //@line 1940
  return;
 }
 ___async_unwind = 0; //@line 1943
 HEAP32[$ReallocAsyncCtx3 >> 2] = 89; //@line 1944
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 1945
 HEAP32[$4 >> 2] = $2; //@line 1946
 sp = STACKTOP; //@line 1947
 return;
}
function _mbed_die__async_cb_23($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1903
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1905
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 1907
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 1908
 _wait_ms(400); //@line 1909
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 90; //@line 1912
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 1913
  HEAP32[$4 >> 2] = $2; //@line 1914
  sp = STACKTOP; //@line 1915
  return;
 }
 ___async_unwind = 0; //@line 1918
 HEAP32[$ReallocAsyncCtx2 >> 2] = 90; //@line 1919
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 1920
 HEAP32[$4 >> 2] = $2; //@line 1921
 sp = STACKTOP; //@line 1922
 return;
}
function _mbed_die__async_cb_22($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1878
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1880
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 1882
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 1883
 _wait_ms(400); //@line 1884
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 91; //@line 1887
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 1888
  HEAP32[$4 >> 2] = $2; //@line 1889
  sp = STACKTOP; //@line 1890
  return;
 }
 ___async_unwind = 0; //@line 1893
 HEAP32[$ReallocAsyncCtx >> 2] = 91; //@line 1894
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 1895
 HEAP32[$4 >> 2] = $2; //@line 1896
 sp = STACKTOP; //@line 1897
 return;
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3051
 STACKTOP = STACKTOP + 16 | 0; //@line 3052
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3052
 $1 = sp; //@line 3053
 HEAP32[$1 >> 2] = $varargs; //@line 3054
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3055
 _mbed_error_vfprintf($0, $1); //@line 3056
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 92; //@line 3059
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 3061
  sp = STACKTOP; //@line 3062
  STACKTOP = sp; //@line 3063
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3065
  STACKTOP = sp; //@line 3066
  return;
 }
}
function __ZN4mbed10TimerEventC2Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 708
 HEAP32[$0 >> 2] = 308; //@line 709
 $1 = $0 + 8 | 0; //@line 710
 HEAP32[$1 >> 2] = 0; //@line 711
 HEAP32[$1 + 4 >> 2] = 0; //@line 711
 HEAP32[$1 + 8 >> 2] = 0; //@line 711
 HEAP32[$1 + 12 >> 2] = 0; //@line 711
 $2 = _get_us_ticker_data() | 0; //@line 712
 HEAP32[$0 + 24 >> 2] = $2; //@line 714
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 715
 _ticker_set_handler($2, 41); //@line 716
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 42; //@line 719
  sp = STACKTOP; //@line 720
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 723
  return;
 }
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 6848
 newDynamicTop = oldDynamicTop + increment | 0; //@line 6849
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 6853
  ___setErrNo(12); //@line 6854
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 6858
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 6862
   ___setErrNo(12); //@line 6863
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 6867
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 7484
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 7486
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 7492
  $11 = ___fwritex($0, $4, $3) | 0; //@line 7493
  if ($phitmp) {
   $13 = $11; //@line 7495
  } else {
   ___unlockfile($3); //@line 7497
   $13 = $11; //@line 7498
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 7502
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 7506
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 7509
 }
 return $15 | 0; //@line 7511
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 9820
 } else {
  $$056 = $2; //@line 9822
  $15 = $1; //@line 9822
  $8 = $0; //@line 9822
  while (1) {
   $14 = $$056 + -1 | 0; //@line 9830
   HEAP8[$14 >> 0] = HEAPU8[3058 + ($8 & 15) >> 0] | 0 | $3; //@line 9831
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 9832
   $15 = tempRet0; //@line 9833
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 9838
    break;
   } else {
    $$056 = $14; //@line 9841
   }
  }
 }
 return $$05$lcssa | 0; //@line 9845
}
function __ZSt9terminatev() {
 var $0 = 0, $16 = 0, $17 = 0, $2 = 0, $5 = 0, sp = 0;
 sp = STACKTOP; //@line 13017
 $0 = ___cxa_get_globals_fast() | 0; //@line 13018
 if ($0 | 0) {
  $2 = HEAP32[$0 >> 2] | 0; //@line 13021
  if ($2 | 0) {
   $5 = $2 + 48 | 0; //@line 13025
   if ((HEAP32[$5 >> 2] & -256 | 0) == 1126902528 ? (HEAP32[$5 + 4 >> 2] | 0) == 1129074247 : 0) {
    $16 = HEAP32[$2 + 12 >> 2] | 0; //@line 13037
    _emscripten_alloc_async_context(4, sp) | 0; //@line 13038
    __ZSt11__terminatePFvvE($16); //@line 13039
   }
  }
 }
 $17 = __ZSt13get_terminatev() | 0; //@line 13044
 _emscripten_alloc_async_context(4, sp) | 0; //@line 13045
 __ZSt11__terminatePFvvE($17); //@line 13046
}
function _main__async_cb_43($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 2488
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2490
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2492
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2494
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(16) | 0; //@line 2495
 _puts(2402) | 0; //@line 2496
 if (!___async) {
  ___async_unwind = 0; //@line 2499
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 112; //@line 2501
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 2503
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 2505
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 2507
 sp = STACKTOP; //@line 2508
 return;
}
function _main__async_cb_42($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 2462
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2464
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2466
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2468
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 2469
 _puts(2505) | 0; //@line 2470
 if (!___async) {
  ___async_unwind = 0; //@line 2473
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 113; //@line 2475
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $2; //@line 2477
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $4; //@line 2479
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $6; //@line 2481
 sp = STACKTOP; //@line 2482
 return;
}
function __GLOBAL__sub_I_main_cpp__async_cb_84($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6008
 HEAP32[1402] = 440; //@line 6009
 HEAP32[1412] = 0; //@line 6010
 HEAP32[1413] = 0; //@line 6010
 HEAP32[1414] = 0; //@line 6010
 HEAP32[1415] = 0; //@line 6010
 HEAP8[5664] = 1; //@line 6011
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 6012
 __ZN4mbed10TimerEventC2Ev(5672); //@line 6013
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 107; //@line 6016
  sp = STACKTOP; //@line 6017
  return;
 }
 ___async_unwind = 0; //@line 6020
 HEAP32[$ReallocAsyncCtx >> 2] = 107; //@line 6021
 sp = STACKTOP; //@line 6022
 return;
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 7701
 $3 = HEAP8[$1 >> 0] | 0; //@line 7703
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 7707
 $7 = HEAP32[$0 >> 2] | 0; //@line 7708
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 7713
  HEAP32[$0 + 4 >> 2] = 0; //@line 7715
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 7717
  HEAP32[$0 + 28 >> 2] = $14; //@line 7719
  HEAP32[$0 + 20 >> 2] = $14; //@line 7721
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 7727
  $$0 = 0; //@line 7728
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 7731
  $$0 = -1; //@line 7732
 }
 return $$0 | 0; //@line 7734
}
function __ZN4mbed11InterruptInD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1349
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1351
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 1353
 if (!$4) {
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 1360
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 1361
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 1362
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 22; //@line 1365
  sp = STACKTOP; //@line 1366
  return;
 }
 ___async_unwind = 0; //@line 1369
 HEAP32[$ReallocAsyncCtx2 >> 2] = 22; //@line 1370
 sp = STACKTOP; //@line 1371
 return;
}
function __ZN4mbed7Timeout7handlerEv__async_cb_73($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4357
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4359
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4361
 $5 = HEAP32[HEAP32[$2 >> 2] >> 2] | 0; //@line 4363
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 4364
 FUNCTION_TABLE_vi[$5 & 255]($4); //@line 4365
 if (!___async) {
  ___async_unwind = 0; //@line 4368
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 38; //@line 4370
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 4372
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 4374
 sp = STACKTOP; //@line 4375
 return;
}
function _twobyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$sink$in = 0, $$sink17$sink = 0, $11 = 0, $12 = 0, $8 = 0;
 $8 = (HEAPU8[$1 >> 0] | 0) << 8 | (HEAPU8[$1 + 1 >> 0] | 0); //@line 11288
 $$sink$in = HEAPU8[$0 >> 0] | 0; //@line 11291
 $$sink17$sink = $0; //@line 11291
 while (1) {
  $11 = $$sink17$sink + 1 | 0; //@line 11293
  $12 = HEAP8[$11 >> 0] | 0; //@line 11294
  if (!($12 << 24 >> 24)) {
   break;
  }
  $$sink$in = $$sink$in << 8 & 65280 | $12 & 255; //@line 11302
  if (($$sink$in | 0) == ($8 | 0)) {
   break;
  } else {
   $$sink17$sink = $11; //@line 11307
  }
 }
 return ($12 << 24 >> 24 ? $$sink17$sink : 0) | 0; //@line 11312
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 9857
 } else {
  $$06 = $2; //@line 9859
  $11 = $1; //@line 9859
  $7 = $0; //@line 9859
  while (1) {
   $10 = $$06 + -1 | 0; //@line 9864
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 9865
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 9866
   $11 = tempRet0; //@line 9867
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 9872
    break;
   } else {
    $$06 = $10; //@line 9875
   }
  }
 }
 return $$0$lcssa | 0; //@line 9879
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13893
 do {
  if (!$0) {
   $3 = 0; //@line 13897
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13899
   $2 = ___dynamic_cast($0, 176, 232, 0) | 0; //@line 13900
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 167; //@line 13903
    sp = STACKTOP; //@line 13904
    return 0; //@line 13905
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 13907
    $3 = ($2 | 0) != 0 & 1; //@line 13910
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 13915
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 9501
 } else {
  $$04 = 0; //@line 9503
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 9506
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 9510
   $12 = $7 + 1 | 0; //@line 9511
   HEAP32[$0 >> 2] = $12; //@line 9512
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 9518
    break;
   } else {
    $$04 = $11; //@line 9521
   }
  }
 }
 return $$0$lcssa | 0; //@line 9525
}
function ___muldi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $x_sroa_0_0_extract_trunc = 0, $y_sroa_0_0_extract_trunc = 0, $1$0 = 0, $1$1 = 0;
 $x_sroa_0_0_extract_trunc = $a$0; //@line 6381
 $y_sroa_0_0_extract_trunc = $b$0; //@line 6382
 $1$0 = ___muldsi3($x_sroa_0_0_extract_trunc, $y_sroa_0_0_extract_trunc) | 0; //@line 6383
 $1$1 = tempRet0; //@line 6384
 return (tempRet0 = (Math_imul($a$1, $y_sroa_0_0_extract_trunc) | 0) + (Math_imul($b$1, $x_sroa_0_0_extract_trunc) | 0) + $1$1 | $1$1 & 0, $1$0 | 0 | 0) | 0; //@line 6386
}
function runPostSets() {}
function ___muldsi3($a, $b) {
 $a = $a | 0;
 $b = $b | 0;
 var $1 = 0, $2 = 0, $3 = 0, $6 = 0, $8 = 0, $11 = 0, $12 = 0;
 $1 = $a & 65535; //@line 6366
 $2 = $b & 65535; //@line 6367
 $3 = Math_imul($2, $1) | 0; //@line 6368
 $6 = $a >>> 16; //@line 6369
 $8 = ($3 >>> 16) + (Math_imul($2, $6) | 0) | 0; //@line 6370
 $11 = $b >>> 16; //@line 6371
 $12 = Math_imul($11, $1) | 0; //@line 6372
 return (tempRet0 = ($8 >>> 16) + (Math_imul($11, $6) | 0) + ((($8 & 65535) + $12 | 0) >>> 16) | 0, $8 + $12 << 16 | $3 & 65535 | 0) | 0; //@line 6373
}
function _ticker_set_handler($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1499
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1500
 _initialize($0); //@line 1501
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 59; //@line 1504
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1506
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 1508
  sp = STACKTOP; //@line 1509
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1512
  HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = $1; //@line 1515
  return;
 }
}
function __Z11toggle_led2v() {
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3582
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3583
 _puts(2354) | 0; //@line 3584
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 109; //@line 3587
  sp = STACKTOP; //@line 3588
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3591
  $2 = (_emscripten_asm_const_ii(9, HEAP32[1444] | 0) | 0) == 0 & 1; //@line 3595
  _emscripten_asm_const_iii(1, HEAP32[1444] | 0, $2 | 0) | 0; //@line 3597
  return;
 }
}
function ___fflush_unlocked__async_cb_17($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1491
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1493
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1495
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1497
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 1499
 HEAP32[$4 >> 2] = 0; //@line 1500
 HEAP32[$6 >> 2] = 0; //@line 1501
 HEAP32[$8 >> 2] = 0; //@line 1502
 HEAP32[$10 >> 2] = 0; //@line 1503
 HEAP32[___async_retval >> 2] = 0; //@line 1505
 return;
}
function __ZN4mbed6Ticker7handlerEv($0) {
 $0 = $0 | 0;
 var $2 = 0, $5 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3432
 $2 = HEAP32[$0 + 52 >> 2] | 0; //@line 3434
 if (!$2) {
  return;
 }
 $5 = HEAP32[$2 >> 2] | 0; //@line 3440
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3441
 FUNCTION_TABLE_vi[$5 & 255]($0 + 40 | 0); //@line 3442
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 103; //@line 3445
  sp = STACKTOP; //@line 3446
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3449
 return;
}
function __Z10blink_led1v() {
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3561
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3562
 _puts(2271) | 0; //@line 3563
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 108; //@line 3566
  sp = STACKTOP; //@line 3567
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3570
  $2 = (_emscripten_asm_const_ii(9, HEAP32[1438] | 0) | 0) == 0 & 1; //@line 3574
  _emscripten_asm_const_iii(1, HEAP32[1438] | 0, $2 | 0) | 0; //@line 3576
  return;
 }
}
function __ZN4mbed6TickerD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2729
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2731
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 2732
 __ZN4mbed10TimerEventD2Ev($2); //@line 2733
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 2736
  sp = STACKTOP; //@line 2737
  return;
 }
 ___async_unwind = 0; //@line 2740
 HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 2741
 sp = STACKTOP; //@line 2742
 return;
}
function __ZN4mbed7TimeoutD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2818
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2820
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 2821
 __ZN4mbed10TimerEventD2Ev($2); //@line 2822
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 33; //@line 2825
  sp = STACKTOP; //@line 2826
  return;
 }
 ___async_unwind = 0; //@line 2829
 HEAP32[$ReallocAsyncCtx2 >> 2] = 33; //@line 2830
 sp = STACKTOP; //@line 2831
 return;
}
function _mbed_vtracef__async_cb_1($0) {
 $0 = $0 | 0;
 var $1 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 494
 $1 = HEAP32[92] | 0; //@line 495
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 496
 FUNCTION_TABLE_vi[$1 & 255](1684); //@line 497
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 49; //@line 500
  sp = STACKTOP; //@line 501
  return;
 }
 ___async_unwind = 0; //@line 504
 HEAP32[$ReallocAsyncCtx3 >> 2] = 49; //@line 505
 sp = STACKTOP; //@line 506
 return;
}
function __ZN4mbed11InterruptInC2E7PinName($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $3 = 0, $4 = 0, dest = 0, stop = 0;
 HEAP32[$0 >> 2] = 272; //@line 250
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
function _serial_putc__async_cb_20($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1799
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1801
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 1802
 _fflush($2) | 0; //@line 1803
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 98; //@line 1806
  sp = STACKTOP; //@line 1807
  return;
 }
 ___async_unwind = 0; //@line 1810
 HEAP32[$ReallocAsyncCtx >> 2] = 98; //@line 1811
 sp = STACKTOP; //@line 1812
 return;
}
function __ZN4mbed10TimerEventD2Ev($0) {
 $0 = $0 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 681
 HEAP32[$0 >> 2] = 308; //@line 682
 $2 = HEAP32[$0 + 24 >> 2] | 0; //@line 684
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 686
 _ticker_remove_event($2, $0 + 8 | 0); //@line 687
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 40; //@line 690
  sp = STACKTOP; //@line 691
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 694
  return;
 }
}
function __ZN4mbed7TimeoutD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2259
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2261
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 2262
 __ZN4mbed10TimerEventD2Ev($2); //@line 2263
 if (!___async) {
  ___async_unwind = 0; //@line 2266
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 35; //@line 2268
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 2270
 sp = STACKTOP; //@line 2271
 return;
}
function __ZN4mbed6TickerD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2286
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2288
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 2289
 __ZN4mbed10TimerEventD2Ev($2); //@line 2290
 if (!___async) {
  ___async_unwind = 0; //@line 2293
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 102; //@line 2295
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 2297
 sp = STACKTOP; //@line 2298
 return;
}
function _emscripten_async_resume() {
 ___async = 0; //@line 6699
 ___async_unwind = 1; //@line 6700
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 6706
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 6710
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 6714
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 6716
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7124
 STACKTOP = STACKTOP + 16 | 0; //@line 7125
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7125
 $vararg_buffer = sp; //@line 7126
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 7130
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 7132
 STACKTOP = sp; //@line 7133
 return $5 | 0; //@line 7133
}
function __ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1466
 $1 = HEAP32[$0 >> 2] | 0; //@line 1467
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1468
 FUNCTION_TABLE_v[$1 & 15](); //@line 1469
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 58; //@line 1472
  sp = STACKTOP; //@line 1473
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1476
  return;
 }
}
function __ZN4mbed10TimerEvent3irqEj($0) {
 $0 = $0 | 0;
 var $5 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 730
 $5 = HEAP32[(HEAP32[$0 >> 2] | 0) + 8 >> 2] | 0; //@line 735
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 736
 FUNCTION_TABLE_vi[$5 & 255]($0); //@line 737
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 43; //@line 740
  sp = STACKTOP; //@line 741
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 744
  return;
 }
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $5 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3455
 $5 = HEAP32[(HEAP32[$0 >> 2] | 0) + 8 >> 2] | 0; //@line 3460
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3461
 FUNCTION_TABLE_vi[$5 & 255]($0); //@line 3462
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 104; //@line 3465
  sp = STACKTOP; //@line 3466
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3469
  return;
 }
}
function _handle_interrupt_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3204
 $2 = HEAP32[1434] | 0; //@line 3205
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3206
 FUNCTION_TABLE_vii[$2 & 3]($0, $1); //@line 3207
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 96; //@line 3210
  sp = STACKTOP; //@line 3211
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3214
  return;
 }
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 6641
 STACKTOP = STACKTOP + 16 | 0; //@line 6642
 $rem = __stackBase__ | 0; //@line 6643
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 6644
 STACKTOP = __stackBase__; //@line 6645
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 6646
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 6411
 if ((ret | 0) < 8) return ret | 0; //@line 6412
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 6413
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 6414
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 6415
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 6416
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 6417
}
function ___cxa_get_globals_fast() {
 var $3 = 0, sp = 0;
 sp = STACKTOP; //@line 12238
 STACKTOP = STACKTOP + 16 | 0; //@line 12239
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12239
 if (!(_pthread_once(6472, 10) | 0)) {
  $3 = _pthread_getspecific(HEAP32[1619] | 0) | 0; //@line 12245
  STACKTOP = sp; //@line 12246
  return $3 | 0; //@line 12246
 } else {
  _abort_message(5243, sp); //@line 12248
 }
 return 0; //@line 12251
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 12406
 }
 return;
}
function __Z12turn_led3_onv() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3603
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3604
 _puts(2375) | 0; //@line 3605
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 110; //@line 3608
  sp = STACKTOP; //@line 3609
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3612
  _emscripten_asm_const_iii(1, HEAP32[1450] | 0, 1) | 0; //@line 3614
  return;
 }
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 11943
 $6 = HEAP32[$5 >> 2] | 0; //@line 11944
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 11945
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 11947
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 11949
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 11952
 return $2 | 0; //@line 11953
}
function __ZL25default_terminate_handlerv__async_cb_86($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6347
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6349
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6351
 HEAP32[$2 >> 2] = 5104; //@line 6352
 HEAP32[$2 + 4 >> 2] = $4; //@line 6354
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 6356
 _abort_message(4968, $2); //@line 6357
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4043
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4045
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 4046
 _fputc(10, $2) | 0; //@line 4047
 if (!___async) {
  ___async_unwind = 0; //@line 4050
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 143; //@line 4052
 sp = STACKTOP; //@line 4053
 return;
}
function _gpio_irq_init($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0;
 if (($1 | 0) == -1) {
  $$0 = -1; //@line 3227
  return $$0 | 0; //@line 3228
 }
 HEAP32[1434] = $2; //@line 3230
 HEAP32[$0 >> 2] = $1; //@line 3231
 HEAP32[$0 + 4 >> 2] = $1; //@line 3233
 _emscripten_asm_const_iii(4, $3 | 0, $1 | 0) | 0; //@line 3234
 $$0 = 0; //@line 3235
 return $$0 | 0; //@line 3236
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 13000
 STACKTOP = STACKTOP + 16 | 0; //@line 13001
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13001
 _free($0); //@line 13003
 if (!(_pthread_setspecific(HEAP32[1619] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 13008
  return;
 } else {
  _abort_message(5342, sp); //@line 13010
 }
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3182
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 3185
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 3190
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 3193
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4160
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 4171
  $$0 = 1; //@line 4172
 } else {
  $$0 = 0; //@line 4174
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 4178
 return;
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 3267
 HEAP32[$0 >> 2] = $1; //@line 3268
 HEAP32[1435] = 1; //@line 3269
 $4 = $0; //@line 3270
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 3275
 $10 = 5744; //@line 3276
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 3278
 HEAP32[$10 + 4 >> 2] = $9; //@line 3281
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 12482
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3509
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3510
 _emscripten_sleep($0 | 0); //@line 3511
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 105; //@line 3514
  sp = STACKTOP; //@line 3515
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3518
  return;
 }
}
function _mbed_trace_default_print($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 751
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 752
 _puts($0) | 0; //@line 753
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 44; //@line 756
  sp = STACKTOP; //@line 757
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 760
  return;
 }
}
function _main__async_cb_40($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 2399
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(4) | 0; //@line 2400
 _wait_ms(-1); //@line 2401
 if (!___async) {
  ___async_unwind = 0; //@line 2404
 }
 HEAP32[$ReallocAsyncCtx10 >> 2] = 120; //@line 2406
 sp = STACKTOP; //@line 2407
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 12546
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 12550
  }
 }
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var sp = 0;
 sp = STACKTOP; //@line 12985
 STACKTOP = STACKTOP + 16 | 0; //@line 12986
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12986
 if (!(_pthread_key_create(6476, 152) | 0)) {
  STACKTOP = sp; //@line 12991
  return;
 } else {
  _abort_message(5292, sp); //@line 12993
 }
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 6675
 HEAP32[new_frame + 4 >> 2] = sp; //@line 6677
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 6679
 ___async_cur_frame = new_frame; //@line 6680
 return ___async_cur_frame + 8 | 0; //@line 6681
}
function __GLOBAL__sub_I_main_cpp__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[1428] = 0; //@line 5999
 HEAP32[1429] = 0; //@line 5999
 HEAP32[1430] = 0; //@line 5999
 HEAP32[1431] = 0; //@line 5999
 HEAP8[5728] = 1; //@line 6000
 HEAP32[1418] = 288; //@line 6001
 __ZN4mbed11InterruptInC2E7PinName(5824, 1337); //@line 6002
 return;
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 1748
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 1752
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 1755
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 6664
  return low << bits; //@line 6665
 }
 tempRet0 = low << bits - 32; //@line 6667
 return 0; //@line 6668
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 6653
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 6654
 }
 tempRet0 = 0; //@line 6656
 return high >>> bits - 32 | 0; //@line 6657
}
function _fflush__async_cb_12($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1257
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 1259
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 1262
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_57($0) {
 $0 = $0 | 0;
 var $6 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3387
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 3389
 _gpio_irq_set($6 + 28 | 0, 2, 1); //@line 3391
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
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 4031
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 4034
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 4037
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 4242
 } else {
  $$0 = -1; //@line 4244
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 4247
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 7831
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 7837
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 7841
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 6930
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 6687
 stackRestore(___async_cur_frame | 0); //@line 6688
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 6689
}
function _fputc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1822
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 1823
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 1825
 return;
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3235
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 3236
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 3238
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 10942
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 10942
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 10944
 return $1 | 0; //@line 10945
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 3190
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 3196
 _emscripten_asm_const_iii(3, $0 | 0, $1 | 0) | 0; //@line 3197
 return;
}
function _gpio_init_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 3175
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 3181
 _emscripten_asm_const_iii(2, $0 | 0, $1 | 0) | 0; //@line 3182
 return;
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 7290
  $$0 = -1; //@line 7291
 } else {
  $$0 = $0; //@line 7293
 }
 return $$0 | 0; //@line 7295
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 6404
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 6405
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 6406
}
function __ZN4mbed6Ticker5setupEy($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0;
 $3 = ___udivdi3($1 | 0, $2 | 0, 1e3, 0) | 0; //@line 3479
 _emscripten_asm_const_iii(8, $0 | 0, $3 | 0) | 0; //@line 3481
 return;
}
function __Z11toggle_led2v__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(9, HEAP32[1444] | 0) | 0) == 0 & 1; //@line 1845
 _emscripten_asm_const_iii(1, HEAP32[1444] | 0, $3 | 0) | 0; //@line 1847
 return;
}
function __Z10blink_led1v__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(9, HEAP32[1438] | 0) | 0) == 0 & 1; //@line 6263
 _emscripten_asm_const_iii(1, HEAP32[1438] | 0, $3 | 0) | 0; //@line 6265
 return;
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 6923
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
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 6396
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 6398
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 6916
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 10002
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 10005
 }
 return $$0 | 0; //@line 10007
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 7976
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 7981
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 6888
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 6633
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 7471
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 7475
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 4083
 return;
}
function _gpio_irq_set($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 _emscripten_asm_const_iiii(6, HEAP32[$0 + 4 >> 2] | 0, $1 | 0, $2 | 0) | 0; //@line 3257
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 6694
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 6695
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_60($0) {
 $0 = $0 | 0;
 _gpio_irq_set((HEAP32[$0 + 8 >> 2] | 0) + 28 | 0, 2, 0); //@line 3502
 return;
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 13085
 __ZdlPv($0); //@line 13086
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 12768
 __ZdlPv($0); //@line 12769
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 7967
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 7969
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 12296
 __ZdlPv($0); //@line 12297
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
function _ticker_set_handler__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 4 >> 2] >> 2] = HEAP32[$0 + 8 >> 2]; //@line 6278
 return;
}
function _out_670($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 if (!(HEAP32[$0 >> 2] & 32)) {
  ___fwritex($1, $2, $0) | 0; //@line 9487
 }
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 5992
 return;
}
function b114(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 7252
}
function __ZN4mbed8CallbackIFvvEE13function_moveIPS1_EEvPvPKv($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = HEAP32[$1 >> 2]; //@line 1486
 return;
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 12493
}
function __ZSt13get_terminatev() {
 var $0 = 0;
 $0 = HEAP32[272] | 0; //@line 13075
 HEAP32[272] = $0 + 0; //@line 13077
 return $0 | 0; //@line 13079
}
function _gpio_irq_free($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iii(5, HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 3246
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
 FUNCTION_TABLE_vii[index & 3](a1 | 0, a2 | 0); //@line 6909
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
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 6721
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_56($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b112(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 7249
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __Z12turn_led3_onv__async_cb($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iii(1, HEAP32[1450] | 0, 1) | 0; //@line 1781
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 9950
}
function _fflush__async_cb_13($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1272
 return;
}
function _snprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1773
 return;
}
function _fputc__async_cb_21($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1835
 return;
}
function _putc__async_cb_55($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 3248
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 6881
}
function __ZN4mbed11InterruptInD0Ev__async_cb_16($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 1419
 return;
}
function b8(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 6949
 return 0; //@line 6949
}
function b7(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 6946
 return 0; //@line 6946
}
function b6(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 6943
 return 0; //@line 6943
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(5395, HEAP32[$0 + 4 >> 2] | 0); //@line 2705
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 255](a1 | 0); //@line 6902
}
function b110(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 7246
}
function __ZN4mbed7TimeoutD0Ev__async_cb_37($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 2280
 return;
}
function __ZN4mbed6TickerD0Ev__async_cb_38($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 2307
 return;
}
function __ZN4mbed6Ticker6detachEv($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_ii(7, $0 | 0) | 0; //@line 3488
 return;
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 11195
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_54($0) {
 $0 = $0 | 0;
 return;
}
function _main__async_cb_47($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 2696
 return;
}
function dynCall_i(index) {
 index = index | 0;
 return FUNCTION_TABLE_i[index & 3]() | 0; //@line 6874
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_52($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 15](); //@line 6895
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 7348
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIPS1_EEvPv($0) {
 $0 = $0 | 0;
 return;
}
function b4(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 6940
 return 0; //@line 6940
}
function b108(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(3); //@line 7243
}
function b107(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(0); //@line 7240
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed10TimerEventD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 702
}
function _abort_message__async_cb_68($0) {
 $0 = $0 | 0;
 _abort(); //@line 4060
}
function ___ofl_lock() {
 ___lock(6460); //@line 7986
 return 6468; //@line 7987
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
function ___cxa_pure_virtual__wrapper() {
 ___cxa_pure_virtual(); //@line 6955
}
function __ZN4mbed7Timeout7handlerEv__async_cb_72($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed11InterruptInD2Ev__async_cb_15($0) {
 $0 = $0 | 0;
 return;
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 11116
}
function __ZN4mbed10TimerEvent3irqEj__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 11122
}
function __ZN4mbed6Ticker7handlerEv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _mbed_trace_default_print__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed10TimerEventD2Ev__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed10TimerEventC2Ev__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 16
}
function __ZN4mbed7TimeoutD2Ev__async_cb_49($0) {
 $0 = $0 | 0;
 return;
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 12122
 return;
}
function __ZN4mbed6TickerD2Ev__async_cb_48($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_66($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_65($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_62($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_61($0) {
 $0 = $0 | 0;
 return;
}
function _mbed_assert_internal__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b2() {
 nullFunc_i(3); //@line 6937
 return 0; //@line 6937
}
function b1() {
 nullFunc_i(0); //@line 6934
 return 0; //@line 6934
}
function _ticker_remove_event__async_cb($0) {
 $0 = $0 | 0;
 return;
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
 ___unlock(6460); //@line 7992
 return;
}
function b105(p0) {
 p0 = p0 | 0;
 nullFunc_vi(255); //@line 7237
}
function b104(p0) {
 p0 = p0 | 0;
 nullFunc_vi(254); //@line 7234
}
function b103(p0) {
 p0 = p0 | 0;
 nullFunc_vi(253); //@line 7231
}
function b102(p0) {
 p0 = p0 | 0;
 nullFunc_vi(252); //@line 7228
}
function b101(p0) {
 p0 = p0 | 0;
 nullFunc_vi(251); //@line 7225
}
function b100(p0) {
 p0 = p0 | 0;
 nullFunc_vi(250); //@line 7222
}
function b99(p0) {
 p0 = p0 | 0;
 nullFunc_vi(249); //@line 7219
}
function b98(p0) {
 p0 = p0 | 0;
 nullFunc_vi(248); //@line 7216
}
function b97(p0) {
 p0 = p0 | 0;
 nullFunc_vi(247); //@line 7213
}
function b96(p0) {
 p0 = p0 | 0;
 nullFunc_vi(246); //@line 7210
}
function b95(p0) {
 p0 = p0 | 0;
 nullFunc_vi(245); //@line 7207
}
function b94(p0) {
 p0 = p0 | 0;
 nullFunc_vi(244); //@line 7204
}
function b93(p0) {
 p0 = p0 | 0;
 nullFunc_vi(243); //@line 7201
}
function b92(p0) {
 p0 = p0 | 0;
 nullFunc_vi(242); //@line 7198
}
function b91(p0) {
 p0 = p0 | 0;
 nullFunc_vi(241); //@line 7195
}
function b90(p0) {
 p0 = p0 | 0;
 nullFunc_vi(240); //@line 7192
}
function b89(p0) {
 p0 = p0 | 0;
 nullFunc_vi(239); //@line 7189
}
function b88(p0) {
 p0 = p0 | 0;
 nullFunc_vi(238); //@line 7186
}
function b87(p0) {
 p0 = p0 | 0;
 nullFunc_vi(237); //@line 7183
}
function b86(p0) {
 p0 = p0 | 0;
 nullFunc_vi(236); //@line 7180
}
function b85(p0) {
 p0 = p0 | 0;
 nullFunc_vi(235); //@line 7177
}
function b84(p0) {
 p0 = p0 | 0;
 nullFunc_vi(234); //@line 7174
}
function b83(p0) {
 p0 = p0 | 0;
 nullFunc_vi(233); //@line 7171
}
function b82(p0) {
 p0 = p0 | 0;
 nullFunc_vi(232); //@line 7168
}
function b81(p0) {
 p0 = p0 | 0;
 nullFunc_vi(231); //@line 7165
}
function b80(p0) {
 p0 = p0 | 0;
 nullFunc_vi(230); //@line 7162
}
function b79(p0) {
 p0 = p0 | 0;
 nullFunc_vi(229); //@line 7159
}
function b78(p0) {
 p0 = p0 | 0;
 nullFunc_vi(228); //@line 7156
}
function b77(p0) {
 p0 = p0 | 0;
 nullFunc_vi(227); //@line 7153
}
function b76(p0) {
 p0 = p0 | 0;
 nullFunc_vi(226); //@line 7150
}
function b75(p0) {
 p0 = p0 | 0;
 nullFunc_vi(225); //@line 7147
}
function b74(p0) {
 p0 = p0 | 0;
 nullFunc_vi(224); //@line 7144
}
function b73(p0) {
 p0 = p0 | 0;
 nullFunc_vi(223); //@line 7141
}
function b72(p0) {
 p0 = p0 | 0;
 nullFunc_vi(222); //@line 7138
}
function b71(p0) {
 p0 = p0 | 0;
 nullFunc_vi(221); //@line 7135
}
function b70(p0) {
 p0 = p0 | 0;
 nullFunc_vi(220); //@line 7132
}
function b69(p0) {
 p0 = p0 | 0;
 nullFunc_vi(219); //@line 7129
}
function b68(p0) {
 p0 = p0 | 0;
 nullFunc_vi(218); //@line 7126
}
function b67(p0) {
 p0 = p0 | 0;
 nullFunc_vi(217); //@line 7123
}
function b66(p0) {
 p0 = p0 | 0;
 nullFunc_vi(216); //@line 7120
}
function b65(p0) {
 p0 = p0 | 0;
 nullFunc_vi(215); //@line 7117
}
function b64(p0) {
 p0 = p0 | 0;
 nullFunc_vi(214); //@line 7114
}
function b63(p0) {
 p0 = p0 | 0;
 nullFunc_vi(213); //@line 7111
}
function b62(p0) {
 p0 = p0 | 0;
 nullFunc_vi(212); //@line 7108
}
function b61(p0) {
 p0 = p0 | 0;
 nullFunc_vi(211); //@line 7105
}
function b60(p0) {
 p0 = p0 | 0;
 nullFunc_vi(210); //@line 7102
}
function b59(p0) {
 p0 = p0 | 0;
 nullFunc_vi(209); //@line 7099
}
function b58(p0) {
 p0 = p0 | 0;
 nullFunc_vi(208); //@line 7096
}
function b57(p0) {
 p0 = p0 | 0;
 nullFunc_vi(207); //@line 7093
}
function b56(p0) {
 p0 = p0 | 0;
 nullFunc_vi(206); //@line 7090
}
function b55(p0) {
 p0 = p0 | 0;
 nullFunc_vi(205); //@line 7087
}
function b54(p0) {
 p0 = p0 | 0;
 nullFunc_vi(204); //@line 7084
}
function b53(p0) {
 p0 = p0 | 0;
 nullFunc_vi(203); //@line 7081
}
function b52(p0) {
 p0 = p0 | 0;
 nullFunc_vi(202); //@line 7078
}
function b51(p0) {
 p0 = p0 | 0;
 nullFunc_vi(201); //@line 7075
}
function b50(p0) {
 p0 = p0 | 0;
 nullFunc_vi(200); //@line 7072
}
function b49(p0) {
 p0 = p0 | 0;
 nullFunc_vi(199); //@line 7069
}
function b48(p0) {
 p0 = p0 | 0;
 nullFunc_vi(198); //@line 7066
}
function b47(p0) {
 p0 = p0 | 0;
 nullFunc_vi(197); //@line 7063
}
function b46(p0) {
 p0 = p0 | 0;
 nullFunc_vi(196); //@line 7060
}
function b45(p0) {
 p0 = p0 | 0;
 nullFunc_vi(195); //@line 7057
}
function b44(p0) {
 p0 = p0 | 0;
 nullFunc_vi(194); //@line 7054
}
function b43(p0) {
 p0 = p0 | 0;
 nullFunc_vi(193); //@line 7051
}
function b42(p0) {
 p0 = p0 | 0;
 nullFunc_vi(192); //@line 7048
}
function b41(p0) {
 p0 = p0 | 0;
 nullFunc_vi(191); //@line 7045
}
function b40(p0) {
 p0 = p0 | 0;
 nullFunc_vi(190); //@line 7042
}
function b39(p0) {
 p0 = p0 | 0;
 nullFunc_vi(189); //@line 7039
}
function b38(p0) {
 p0 = p0 | 0;
 nullFunc_vi(188); //@line 7036
}
function b37(p0) {
 p0 = p0 | 0;
 nullFunc_vi(187); //@line 7033
}
function b36(p0) {
 p0 = p0 | 0;
 nullFunc_vi(186); //@line 7030
}
function b35(p0) {
 p0 = p0 | 0;
 nullFunc_vi(185); //@line 7027
}
function b34(p0) {
 p0 = p0 | 0;
 nullFunc_vi(184); //@line 7024
}
function b33(p0) {
 p0 = p0 | 0;
 nullFunc_vi(183); //@line 7021
}
function b32(p0) {
 p0 = p0 | 0;
 nullFunc_vi(182); //@line 7018
}
function b31(p0) {
 p0 = p0 | 0;
 nullFunc_vi(181); //@line 7015
}
function b30(p0) {
 p0 = p0 | 0;
 nullFunc_vi(180); //@line 7012
}
function b29(p0) {
 p0 = p0 | 0;
 nullFunc_vi(179); //@line 7009
}
function b28(p0) {
 p0 = p0 | 0;
 nullFunc_vi(178); //@line 7006
}
function b27(p0) {
 p0 = p0 | 0;
 nullFunc_vi(177); //@line 7003
}
function b26(p0) {
 p0 = p0 | 0;
 nullFunc_vi(176); //@line 7000
}
function b25(p0) {
 p0 = p0 | 0;
 nullFunc_vi(175); //@line 6997
}
function b24(p0) {
 p0 = p0 | 0;
 nullFunc_vi(174); //@line 6994
}
function b23(p0) {
 p0 = p0 | 0;
 nullFunc_vi(173); //@line 6991
}
function b22(p0) {
 p0 = p0 | 0;
 nullFunc_vi(172); //@line 6988
}
function b21(p0) {
 p0 = p0 | 0;
 nullFunc_vi(171); //@line 6985
}
function b20(p0) {
 p0 = p0 | 0;
 nullFunc_vi(170); //@line 6982
}
function b19(p0) {
 p0 = p0 | 0;
 nullFunc_vi(169); //@line 6979
}
function b18(p0) {
 p0 = p0 | 0;
 nullFunc_vi(168); //@line 6976
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 7306
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 7623
}
function b17(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 6973
}
function _us_ticker_set_interrupt($0) {
 $0 = $0 | 0;
 return;
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _initialize__async_cb_77($0) {
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
function _us_ticker_get_info() {
 return 452; //@line 3504
}
function _get_us_ticker_data() {
 return 396; //@line 2716
}
function __ZSt9terminatev__async_cb_53($0) {
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
 return 6456; //@line 7300
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
function _us_ticker_read() {
 return 0; //@line 3321
}
function _pthread_self() {
 return 720; //@line 7353
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function _us_ticker_disable_interrupt() {
 return;
}
function _us_ticker_clear_interrupt() {
 return;
}
function setAsync() {
 ___async = 1; //@line 26
}
function _us_ticker_fire_interrupt() {
 return;
}
function b15() {
 nullFunc_v(15); //@line 6970
}
function b14() {
 nullFunc_v(14); //@line 6967
}
function b13() {
 nullFunc_v(13); //@line 6964
}
function b12() {
 nullFunc_v(12); //@line 6961
}
function b11() {
 nullFunc_v(11); //@line 6958
}
function b10() {
 nullFunc_v(0); //@line 6952
}
function _us_ticker_init() {
 return;
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_i = [b1,_us_ticker_read,_us_ticker_get_info,b2];
var FUNCTION_TABLE_ii = [b4,___stdio_close];
var FUNCTION_TABLE_iiii = [b6,___stdio_write,___stdio_seek,___stdout_write,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b7,b8];
var FUNCTION_TABLE_v = [b10,___cxa_pure_virtual__wrapper,_us_ticker_init,_us_ticker_disable_interrupt,_us_ticker_clear_interrupt,_us_ticker_fire_interrupt,__ZL25default_terminate_handlerv,__Z10blink_led1v,__Z12turn_led3_onv,__Z11toggle_led2v,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev,b11,b12,b13,b14,b15];
var FUNCTION_TABLE_vi = [b17,__ZN4mbed11InterruptInD2Ev,__ZN4mbed11InterruptInD0Ev,__ZN4mbed7TimeoutD2Ev,__ZN4mbed7TimeoutD0Ev,__ZN4mbed7Timeout7handlerEv,__ZN4mbed10TimerEventD2Ev,__ZN4mbed10TimerEventD0Ev,_mbed_trace_default_print,__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv,__ZN4mbed8CallbackIFvvEE13function_dtorIPS1_EEvPv,_us_ticker_set_interrupt,__ZN4mbed6TickerD2Ev,__ZN4mbed6TickerD0Ev,__ZN4mbed6Ticker7handlerEv,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed11InterruptInD2Ev__async_cb,__ZN4mbed11InterruptInD2Ev__async_cb_15,__ZN4mbed11InterruptInD0Ev__async_cb,__ZN4mbed11InterruptInD0Ev__async_cb_16,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_54,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_57
,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_58,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_59,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_60,__ZN4mbed7TimeoutD2Ev__async_cb,__ZN4mbed7TimeoutD2Ev__async_cb_49,__ZN4mbed7TimeoutD0Ev__async_cb,__ZN4mbed7TimeoutD0Ev__async_cb_37,__ZN4mbed7Timeout7handlerEv__async_cb,__ZN4mbed7Timeout7handlerEv__async_cb_73,__ZN4mbed7Timeout7handlerEv__async_cb_71,__ZN4mbed7Timeout7handlerEv__async_cb_72,__ZN4mbed10TimerEventD2Ev__async_cb,__ZN4mbed10TimerEvent3irqEj,__ZN4mbed10TimerEventC2Ev__async_cb,__ZN4mbed10TimerEvent3irqEj__async_cb,_mbed_trace_default_print__async_cb,_mbed_tracef__async_cb,_mbed_vtracef__async_cb,_mbed_vtracef__async_cb_11,_mbed_vtracef__async_cb_1,_mbed_vtracef__async_cb_2,_mbed_vtracef__async_cb_3,_mbed_vtracef__async_cb_10,_mbed_vtracef__async_cb_4,_mbed_vtracef__async_cb_9,_mbed_vtracef__async_cb_5,_mbed_vtracef__async_cb_6,_mbed_vtracef__async_cb_7,_mbed_vtracef__async_cb_8,__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv__async_cb
,_ticker_set_handler__async_cb,_initialize__async_cb,_initialize__async_cb_74,_initialize__async_cb_79,_initialize__async_cb_78,_initialize__async_cb_75,_initialize__async_cb_76,_initialize__async_cb_77,_schedule_interrupt__async_cb,_schedule_interrupt__async_cb_61,_schedule_interrupt__async_cb_62,_schedule_interrupt__async_cb_63,_schedule_interrupt__async_cb_64,_schedule_interrupt__async_cb_65,_schedule_interrupt__async_cb_66,_ticker_remove_event__async_cb,_mbed_assert_internal__async_cb,_mbed_die__async_cb_36,_mbed_die__async_cb_35,_mbed_die__async_cb_34,_mbed_die__async_cb_33,_mbed_die__async_cb_32,_mbed_die__async_cb_31,_mbed_die__async_cb_30,_mbed_die__async_cb_29,_mbed_die__async_cb_28,_mbed_die__async_cb_27,_mbed_die__async_cb_26,_mbed_die__async_cb_25,_mbed_die__async_cb_24
,_mbed_die__async_cb_23,_mbed_die__async_cb_22,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_vfprintf__async_cb,_mbed_error_vfprintf__async_cb_19,_mbed_error_vfprintf__async_cb_18,_handle_interrupt_in__async_cb,_serial_putc__async_cb_20,_serial_putc__async_cb,__ZN4mbed6TickerD2Ev__async_cb,__ZN4mbed6TickerD2Ev__async_cb_48,__ZN4mbed6TickerD0Ev__async_cb,__ZN4mbed6TickerD0Ev__async_cb_38,__ZN4mbed6Ticker7handlerEv__async_cb,_invoke_ticker__async_cb,_wait_ms__async_cb,__GLOBAL__sub_I_main_cpp__async_cb_84,__GLOBAL__sub_I_main_cpp__async_cb,__Z10blink_led1v__async_cb,__Z11toggle_led2v__async_cb,__Z12turn_led3_onv__async_cb,_main__async_cb_43,_main__async_cb_42,_main__async_cb_41,_main__async_cb_45,_main__async_cb,_main__async_cb_44,_main__async_cb_39,_main__async_cb_46
,_main__async_cb_40,_main__async_cb_47,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_50,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_51,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_52,_putc__async_cb_55,_putc__async_cb,___overflow__async_cb,_fflush__async_cb_13,_fflush__async_cb_12,_fflush__async_cb_14,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_17,_vfprintf__async_cb,_snprintf__async_cb,_vsnprintf__async_cb,_fputc__async_cb_21,_fputc__async_cb,_puts__async_cb,__ZL25default_terminate_handlerv__async_cb,__ZL25default_terminate_handlerv__async_cb_86,_abort_message__async_cb,_abort_message__async_cb_68,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_70,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_69,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb
,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_56,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_85,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_83,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_82,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_81,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_80,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_67,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b18,b19,b20,b21,b22,b23,b24,b25,b26,b27,b28
,b29,b30,b31,b32,b33,b34,b35,b36,b37,b38,b39,b40,b41,b42,b43,b44,b45,b46,b47,b48,b49,b50,b51,b52,b53,b54,b55,b56,b57,b58
,b59,b60,b61,b62,b63,b64,b65,b66,b67,b68,b69,b70,b71,b72,b73,b74,b75,b76,b77,b78,b79,b80,b81,b82,b83,b84,b85,b86,b87,b88
,b89,b90,b91,b92,b93,b94,b95,b96,b97,b98,b99,b100,b101,b102,b103,b104,b105];
var FUNCTION_TABLE_vii = [b107,__ZN4mbed8CallbackIFvvEE13function_moveIPS1_EEvPvPKv,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event,b108];
var FUNCTION_TABLE_viiii = [b110,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi];
var FUNCTION_TABLE_viiiii = [b112,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib];
var FUNCTION_TABLE_viiiiii = [b114,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib];

  return { __GLOBAL__sub_I_main_cpp: __GLOBAL__sub_I_main_cpp, ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___muldi3: ___muldi3, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _fflush: _fflush, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _handle_lora_downlink: _handle_lora_downlink, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _invoke_ticker: _invoke_ticker, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_i: dynCall_i, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
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

var real____muldi3 = asm["___muldi3"]; asm["___muldi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____muldi3.apply(null, arguments);
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
var ___muldi3 = Module["___muldi3"] = asm["___muldi3"];
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






//# sourceMappingURL=interrupts.js.map
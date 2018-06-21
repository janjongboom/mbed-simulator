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
var debug_table_vi = ["0", "__ZN4mbed11InterruptInD2Ev", "__ZN4mbed11InterruptInD0Ev", "__ZN4mbed7TimeoutD2Ev", "__ZN4mbed7TimeoutD0Ev", "__ZN4mbed7Timeout7handlerEv", "__ZN4mbed10TimerEventD2Ev", "__ZN4mbed10TimerEventD0Ev", "_mbed_trace_default_print", "__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv", "__ZN4mbed8CallbackIFvvEE13function_dtorIPS1_EEvPv", "_us_ticker_set_interrupt", "__ZN4mbed6TickerD2Ev", "__ZN4mbed6TickerD0Ev", "__ZN4mbed6Ticker7handlerEv", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "__ZN10__cxxabiv121__vmi_class_type_infoD0Ev", "__ZN4mbed11InterruptInD2Ev__async_cb", "__ZN4mbed11InterruptInD2Ev__async_cb_15", "__ZN4mbed11InterruptInD0Ev__async_cb", "__ZN4mbed11InterruptInD0Ev__async_cb_14", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_48", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_58", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_59", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_60", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_61", "__ZN4mbed7TimeoutD2Ev__async_cb", "__ZN4mbed7TimeoutD2Ev__async_cb_70", "__ZN4mbed7TimeoutD0Ev__async_cb", "__ZN4mbed7TimeoutD0Ev__async_cb_19", "__ZN4mbed7Timeout7handlerEv__async_cb", "__ZN4mbed7Timeout7handlerEv__async_cb_26", "__ZN4mbed7Timeout7handlerEv__async_cb_24", "__ZN4mbed7Timeout7handlerEv__async_cb_25", "__ZN4mbed10TimerEventD2Ev__async_cb", "__ZN4mbed10TimerEvent3irqEj", "__ZN4mbed10TimerEventC2Ev__async_cb", "__ZN4mbed10TimerEvent3irqEj__async_cb", "_mbed_trace_default_print__async_cb", "_mbed_tracef__async_cb", "_mbed_vtracef__async_cb", "_mbed_vtracef__async_cb_13", "_mbed_vtracef__async_cb_3", "_mbed_vtracef__async_cb_4", "_mbed_vtracef__async_cb_5", "_mbed_vtracef__async_cb_12", "_mbed_vtracef__async_cb_6", "_mbed_vtracef__async_cb_11", "_mbed_vtracef__async_cb_7", "_mbed_vtracef__async_cb_8", "_mbed_vtracef__async_cb_9", "_mbed_vtracef__async_cb_10", "__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv__async_cb", "_ticker_set_handler__async_cb", "_initialize__async_cb", "_initialize__async_cb_49", "_initialize__async_cb_54", "_initialize__async_cb_53", "_initialize__async_cb_50", "_initialize__async_cb_51", "_initialize__async_cb_52", "_schedule_interrupt__async_cb", "_schedule_interrupt__async_cb_38", "_schedule_interrupt__async_cb_39", "_schedule_interrupt__async_cb_40", "_schedule_interrupt__async_cb_41", "_schedule_interrupt__async_cb_42", "_schedule_interrupt__async_cb_43", "_ticker_remove_event__async_cb", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_86", "_mbed_die__async_cb_85", "_mbed_die__async_cb_84", "_mbed_die__async_cb_83", "_mbed_die__async_cb_82", "_mbed_die__async_cb_81", "_mbed_die__async_cb_80", "_mbed_die__async_cb_79", "_mbed_die__async_cb_78", "_mbed_die__async_cb_77", "_mbed_die__async_cb_76", "_mbed_die__async_cb_75", "_mbed_die__async_cb_74", "_mbed_die__async_cb_73", "_mbed_die__async_cb_72", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_vfprintf__async_cb", "_mbed_error_vfprintf__async_cb_2", "_mbed_error_vfprintf__async_cb_1", "_handle_interrupt_in__async_cb", "_serial_putc__async_cb_21", "_serial_putc__async_cb", "__ZN4mbed6TickerD2Ev__async_cb", "__ZN4mbed6TickerD2Ev__async_cb_87", "__ZN4mbed6TickerD0Ev__async_cb", "__ZN4mbed6TickerD0Ev__async_cb_68", "__ZN4mbed6Ticker7handlerEv__async_cb", "_invoke_ticker__async_cb_20", "_invoke_ticker__async_cb", "_wait_ms__async_cb", "__GLOBAL__sub_I_main_cpp__async_cb_23", "__GLOBAL__sub_I_main_cpp__async_cb", "__Z10blink_led1v__async_cb", "__Z11toggle_led2v__async_cb", "__Z12turn_led3_onv__async_cb", "_main__async_cb_32", "_main__async_cb_31", "_main__async_cb_30", "_main__async_cb_34", "_main__async_cb", "_main__async_cb_33", "_main__async_cb_28", "_main__async_cb_35", "_main__async_cb_29", "_main__async_cb_36", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_64", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_65", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_66", "_putc__async_cb_69", "_putc__async_cb", "___overflow__async_cb", "_fflush__async_cb_17", "_fflush__async_cb_16", "_fflush__async_cb_18", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_22", "_vfprintf__async_cb", "_snprintf__async_cb", "_vsnprintf__async_cb", "_fputc__async_cb_71", "_fputc__async_cb", "_puts__async_cb", "__ZL25default_terminate_handlerv__async_cb", "__ZL25default_terminate_handlerv__async_cb_56", "_abort_message__async_cb", "_abort_message__async_cb_55", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_67", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_27", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_62", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv", "__ZSt11__terminatePFvvE__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_37", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_47", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_46", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_45", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_44", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_57", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
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
 sp = STACKTOP; //@line 4062
 STACKTOP = STACKTOP + 16 | 0; //@line 4063
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4063
 $1 = sp; //@line 4064
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 4071
   $7 = $6 >>> 3; //@line 4072
   $8 = HEAP32[1474] | 0; //@line 4073
   $9 = $8 >>> $7; //@line 4074
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 4080
    $16 = 5936 + ($14 << 1 << 2) | 0; //@line 4082
    $17 = $16 + 8 | 0; //@line 4083
    $18 = HEAP32[$17 >> 2] | 0; //@line 4084
    $19 = $18 + 8 | 0; //@line 4085
    $20 = HEAP32[$19 >> 2] | 0; //@line 4086
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1474] = $8 & ~(1 << $14); //@line 4093
     } else {
      if ((HEAP32[1478] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 4098
      }
      $27 = $20 + 12 | 0; //@line 4101
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 4105
       HEAP32[$17 >> 2] = $20; //@line 4106
       break;
      } else {
       _abort(); //@line 4109
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 4114
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 4117
    $34 = $18 + $30 + 4 | 0; //@line 4119
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 4122
    $$0 = $19; //@line 4123
    STACKTOP = sp; //@line 4124
    return $$0 | 0; //@line 4124
   }
   $37 = HEAP32[1476] | 0; //@line 4126
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 4132
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 4135
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 4138
     $49 = $47 >>> 12 & 16; //@line 4140
     $50 = $47 >>> $49; //@line 4141
     $52 = $50 >>> 5 & 8; //@line 4143
     $54 = $50 >>> $52; //@line 4145
     $56 = $54 >>> 2 & 4; //@line 4147
     $58 = $54 >>> $56; //@line 4149
     $60 = $58 >>> 1 & 2; //@line 4151
     $62 = $58 >>> $60; //@line 4153
     $64 = $62 >>> 1 & 1; //@line 4155
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 4158
     $69 = 5936 + ($67 << 1 << 2) | 0; //@line 4160
     $70 = $69 + 8 | 0; //@line 4161
     $71 = HEAP32[$70 >> 2] | 0; //@line 4162
     $72 = $71 + 8 | 0; //@line 4163
     $73 = HEAP32[$72 >> 2] | 0; //@line 4164
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 4170
       HEAP32[1474] = $77; //@line 4171
       $98 = $77; //@line 4172
      } else {
       if ((HEAP32[1478] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 4177
       }
       $80 = $73 + 12 | 0; //@line 4180
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 4184
        HEAP32[$70 >> 2] = $73; //@line 4185
        $98 = $8; //@line 4186
        break;
       } else {
        _abort(); //@line 4189
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 4194
     $84 = $83 - $6 | 0; //@line 4195
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 4198
     $87 = $71 + $6 | 0; //@line 4199
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 4202
     HEAP32[$71 + $83 >> 2] = $84; //@line 4204
     if ($37 | 0) {
      $92 = HEAP32[1479] | 0; //@line 4207
      $93 = $37 >>> 3; //@line 4208
      $95 = 5936 + ($93 << 1 << 2) | 0; //@line 4210
      $96 = 1 << $93; //@line 4211
      if (!($98 & $96)) {
       HEAP32[1474] = $98 | $96; //@line 4216
       $$0199 = $95; //@line 4218
       $$pre$phiZ2D = $95 + 8 | 0; //@line 4218
      } else {
       $101 = $95 + 8 | 0; //@line 4220
       $102 = HEAP32[$101 >> 2] | 0; //@line 4221
       if ((HEAP32[1478] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 4225
       } else {
        $$0199 = $102; //@line 4228
        $$pre$phiZ2D = $101; //@line 4228
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 4231
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 4233
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 4235
      HEAP32[$92 + 12 >> 2] = $95; //@line 4237
     }
     HEAP32[1476] = $84; //@line 4239
     HEAP32[1479] = $87; //@line 4240
     $$0 = $72; //@line 4241
     STACKTOP = sp; //@line 4242
     return $$0 | 0; //@line 4242
    }
    $108 = HEAP32[1475] | 0; //@line 4244
    if (!$108) {
     $$0197 = $6; //@line 4247
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 4251
     $114 = $112 >>> 12 & 16; //@line 4253
     $115 = $112 >>> $114; //@line 4254
     $117 = $115 >>> 5 & 8; //@line 4256
     $119 = $115 >>> $117; //@line 4258
     $121 = $119 >>> 2 & 4; //@line 4260
     $123 = $119 >>> $121; //@line 4262
     $125 = $123 >>> 1 & 2; //@line 4264
     $127 = $123 >>> $125; //@line 4266
     $129 = $127 >>> 1 & 1; //@line 4268
     $134 = HEAP32[6200 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 4273
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 4277
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4283
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 4286
      $$0193$lcssa$i = $138; //@line 4286
     } else {
      $$01926$i = $134; //@line 4288
      $$01935$i = $138; //@line 4288
      $146 = $143; //@line 4288
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 4293
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 4294
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 4295
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 4296
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4302
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 4305
        $$0193$lcssa$i = $$$0193$i; //@line 4305
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 4308
        $$01935$i = $$$0193$i; //@line 4308
       }
      }
     }
     $157 = HEAP32[1478] | 0; //@line 4312
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 4315
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 4318
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 4321
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 4325
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 4327
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 4331
       $176 = HEAP32[$175 >> 2] | 0; //@line 4332
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 4335
        $179 = HEAP32[$178 >> 2] | 0; //@line 4336
        if (!$179) {
         $$3$i = 0; //@line 4339
         break;
        } else {
         $$1196$i = $179; //@line 4342
         $$1198$i = $178; //@line 4342
        }
       } else {
        $$1196$i = $176; //@line 4345
        $$1198$i = $175; //@line 4345
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 4348
        $182 = HEAP32[$181 >> 2] | 0; //@line 4349
        if ($182 | 0) {
         $$1196$i = $182; //@line 4352
         $$1198$i = $181; //@line 4352
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 4355
        $185 = HEAP32[$184 >> 2] | 0; //@line 4356
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 4361
         $$1198$i = $184; //@line 4361
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 4366
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 4369
        $$3$i = $$1196$i; //@line 4370
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 4375
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 4378
       }
       $169 = $167 + 12 | 0; //@line 4381
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 4385
       }
       $172 = $164 + 8 | 0; //@line 4388
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 4392
        HEAP32[$172 >> 2] = $167; //@line 4393
        $$3$i = $164; //@line 4394
        break;
       } else {
        _abort(); //@line 4397
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 4406
       $191 = 6200 + ($190 << 2) | 0; //@line 4407
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 4412
         if (!$$3$i) {
          HEAP32[1475] = $108 & ~(1 << $190); //@line 4418
          break L73;
         }
        } else {
         if ((HEAP32[1478] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 4425
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 4433
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1478] | 0; //@line 4443
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 4446
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 4450
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 4452
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 4458
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 4462
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 4464
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 4470
       if ($214 | 0) {
        if ((HEAP32[1478] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 4476
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 4480
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 4482
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 4490
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 4493
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 4495
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 4498
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 4502
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 4505
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 4507
      if ($37 | 0) {
       $234 = HEAP32[1479] | 0; //@line 4510
       $235 = $37 >>> 3; //@line 4511
       $237 = 5936 + ($235 << 1 << 2) | 0; //@line 4513
       $238 = 1 << $235; //@line 4514
       if (!($8 & $238)) {
        HEAP32[1474] = $8 | $238; //@line 4519
        $$0189$i = $237; //@line 4521
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 4521
       } else {
        $242 = $237 + 8 | 0; //@line 4523
        $243 = HEAP32[$242 >> 2] | 0; //@line 4524
        if ((HEAP32[1478] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 4528
        } else {
         $$0189$i = $243; //@line 4531
         $$pre$phi$iZ2D = $242; //@line 4531
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 4534
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 4536
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 4538
       HEAP32[$234 + 12 >> 2] = $237; //@line 4540
      }
      HEAP32[1476] = $$0193$lcssa$i; //@line 4542
      HEAP32[1479] = $159; //@line 4543
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 4546
     STACKTOP = sp; //@line 4547
     return $$0 | 0; //@line 4547
    }
   } else {
    $$0197 = $6; //@line 4550
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 4555
   } else {
    $251 = $0 + 11 | 0; //@line 4557
    $252 = $251 & -8; //@line 4558
    $253 = HEAP32[1475] | 0; //@line 4559
    if (!$253) {
     $$0197 = $252; //@line 4562
    } else {
     $255 = 0 - $252 | 0; //@line 4564
     $256 = $251 >>> 8; //@line 4565
     if (!$256) {
      $$0358$i = 0; //@line 4568
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 4572
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 4576
       $262 = $256 << $261; //@line 4577
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 4580
       $267 = $262 << $265; //@line 4582
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 4585
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 4590
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 4596
      }
     }
     $282 = HEAP32[6200 + ($$0358$i << 2) >> 2] | 0; //@line 4600
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 4604
       $$3$i203 = 0; //@line 4604
       $$3350$i = $255; //@line 4604
       label = 81; //@line 4605
      } else {
       $$0342$i = 0; //@line 4612
       $$0347$i = $255; //@line 4612
       $$0353$i = $282; //@line 4612
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 4612
       $$0362$i = 0; //@line 4612
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 4617
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 4622
          $$435113$i = 0; //@line 4622
          $$435712$i = $$0353$i; //@line 4622
          label = 85; //@line 4623
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 4626
          $$1348$i = $292; //@line 4626
         }
        } else {
         $$1343$i = $$0342$i; //@line 4629
         $$1348$i = $$0347$i; //@line 4629
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 4632
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 4635
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 4639
        $302 = ($$0353$i | 0) == 0; //@line 4640
        if ($302) {
         $$2355$i = $$1363$i; //@line 4645
         $$3$i203 = $$1343$i; //@line 4645
         $$3350$i = $$1348$i; //@line 4645
         label = 81; //@line 4646
         break;
        } else {
         $$0342$i = $$1343$i; //@line 4649
         $$0347$i = $$1348$i; //@line 4649
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 4649
         $$0362$i = $$1363$i; //@line 4649
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 4659
       $309 = $253 & ($306 | 0 - $306); //@line 4662
       if (!$309) {
        $$0197 = $252; //@line 4665
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 4670
       $315 = $313 >>> 12 & 16; //@line 4672
       $316 = $313 >>> $315; //@line 4673
       $318 = $316 >>> 5 & 8; //@line 4675
       $320 = $316 >>> $318; //@line 4677
       $322 = $320 >>> 2 & 4; //@line 4679
       $324 = $320 >>> $322; //@line 4681
       $326 = $324 >>> 1 & 2; //@line 4683
       $328 = $324 >>> $326; //@line 4685
       $330 = $328 >>> 1 & 1; //@line 4687
       $$4$ph$i = 0; //@line 4693
       $$4357$ph$i = HEAP32[6200 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 4693
      } else {
       $$4$ph$i = $$3$i203; //@line 4695
       $$4357$ph$i = $$2355$i; //@line 4695
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 4699
       $$4351$lcssa$i = $$3350$i; //@line 4699
      } else {
       $$414$i = $$4$ph$i; //@line 4701
       $$435113$i = $$3350$i; //@line 4701
       $$435712$i = $$4357$ph$i; //@line 4701
       label = 85; //@line 4702
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 4707
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 4711
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 4712
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 4713
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 4714
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4720
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 4723
        $$4351$lcssa$i = $$$4351$i; //@line 4723
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 4726
        $$435113$i = $$$4351$i; //@line 4726
        label = 85; //@line 4727
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 4733
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1476] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1478] | 0; //@line 4739
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 4742
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 4745
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 4748
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 4752
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 4754
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 4758
         $371 = HEAP32[$370 >> 2] | 0; //@line 4759
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 4762
          $374 = HEAP32[$373 >> 2] | 0; //@line 4763
          if (!$374) {
           $$3372$i = 0; //@line 4766
           break;
          } else {
           $$1370$i = $374; //@line 4769
           $$1374$i = $373; //@line 4769
          }
         } else {
          $$1370$i = $371; //@line 4772
          $$1374$i = $370; //@line 4772
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 4775
          $377 = HEAP32[$376 >> 2] | 0; //@line 4776
          if ($377 | 0) {
           $$1370$i = $377; //@line 4779
           $$1374$i = $376; //@line 4779
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 4782
          $380 = HEAP32[$379 >> 2] | 0; //@line 4783
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 4788
           $$1374$i = $379; //@line 4788
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 4793
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 4796
          $$3372$i = $$1370$i; //@line 4797
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 4802
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 4805
         }
         $364 = $362 + 12 | 0; //@line 4808
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 4812
         }
         $367 = $359 + 8 | 0; //@line 4815
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 4819
          HEAP32[$367 >> 2] = $362; //@line 4820
          $$3372$i = $359; //@line 4821
          break;
         } else {
          _abort(); //@line 4824
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 4832
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 4835
         $386 = 6200 + ($385 << 2) | 0; //@line 4836
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 4841
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 4846
            HEAP32[1475] = $391; //@line 4847
            $475 = $391; //@line 4848
            break L164;
           }
          } else {
           if ((HEAP32[1478] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 4855
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 4863
            if (!$$3372$i) {
             $475 = $253; //@line 4866
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1478] | 0; //@line 4874
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 4877
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 4881
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 4883
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 4889
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 4893
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 4895
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 4901
         if (!$409) {
          $475 = $253; //@line 4904
         } else {
          if ((HEAP32[1478] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 4909
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 4913
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 4915
           $475 = $253; //@line 4916
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 4925
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 4928
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 4930
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 4933
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 4937
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 4940
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 4942
         $428 = $$4351$lcssa$i >>> 3; //@line 4943
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 5936 + ($428 << 1 << 2) | 0; //@line 4947
          $432 = HEAP32[1474] | 0; //@line 4948
          $433 = 1 << $428; //@line 4949
          if (!($432 & $433)) {
           HEAP32[1474] = $432 | $433; //@line 4954
           $$0368$i = $431; //@line 4956
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 4956
          } else {
           $437 = $431 + 8 | 0; //@line 4958
           $438 = HEAP32[$437 >> 2] | 0; //@line 4959
           if ((HEAP32[1478] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 4963
           } else {
            $$0368$i = $438; //@line 4966
            $$pre$phi$i211Z2D = $437; //@line 4966
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 4969
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 4971
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 4973
          HEAP32[$354 + 12 >> 2] = $431; //@line 4975
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 4978
         if (!$444) {
          $$0361$i = 0; //@line 4981
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 4985
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 4989
           $450 = $444 << $449; //@line 4990
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 4993
           $455 = $450 << $453; //@line 4995
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 4998
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 5003
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 5009
          }
         }
         $469 = 6200 + ($$0361$i << 2) | 0; //@line 5012
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 5014
         $471 = $354 + 16 | 0; //@line 5015
         HEAP32[$471 + 4 >> 2] = 0; //@line 5017
         HEAP32[$471 >> 2] = 0; //@line 5018
         $473 = 1 << $$0361$i; //@line 5019
         if (!($475 & $473)) {
          HEAP32[1475] = $475 | $473; //@line 5024
          HEAP32[$469 >> 2] = $354; //@line 5025
          HEAP32[$354 + 24 >> 2] = $469; //@line 5027
          HEAP32[$354 + 12 >> 2] = $354; //@line 5029
          HEAP32[$354 + 8 >> 2] = $354; //@line 5031
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 5040
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 5040
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 5047
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 5051
          $494 = HEAP32[$492 >> 2] | 0; //@line 5053
          if (!$494) {
           label = 136; //@line 5056
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 5059
           $$0345$i = $494; //@line 5059
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1478] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 5066
          } else {
           HEAP32[$492 >> 2] = $354; //@line 5069
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 5071
           HEAP32[$354 + 12 >> 2] = $354; //@line 5073
           HEAP32[$354 + 8 >> 2] = $354; //@line 5075
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 5080
          $502 = HEAP32[$501 >> 2] | 0; //@line 5081
          $503 = HEAP32[1478] | 0; //@line 5082
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 5088
           HEAP32[$501 >> 2] = $354; //@line 5089
           HEAP32[$354 + 8 >> 2] = $502; //@line 5091
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 5093
           HEAP32[$354 + 24 >> 2] = 0; //@line 5095
           break;
          } else {
           _abort(); //@line 5098
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 5105
       STACKTOP = sp; //@line 5106
       return $$0 | 0; //@line 5106
      } else {
       $$0197 = $252; //@line 5108
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1476] | 0; //@line 5115
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 5118
  $515 = HEAP32[1479] | 0; //@line 5119
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 5122
   HEAP32[1479] = $517; //@line 5123
   HEAP32[1476] = $514; //@line 5124
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 5127
   HEAP32[$515 + $512 >> 2] = $514; //@line 5129
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 5132
  } else {
   HEAP32[1476] = 0; //@line 5134
   HEAP32[1479] = 0; //@line 5135
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 5138
   $526 = $515 + $512 + 4 | 0; //@line 5140
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 5143
  }
  $$0 = $515 + 8 | 0; //@line 5146
  STACKTOP = sp; //@line 5147
  return $$0 | 0; //@line 5147
 }
 $530 = HEAP32[1477] | 0; //@line 5149
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 5152
  HEAP32[1477] = $532; //@line 5153
  $533 = HEAP32[1480] | 0; //@line 5154
  $534 = $533 + $$0197 | 0; //@line 5155
  HEAP32[1480] = $534; //@line 5156
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 5159
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 5162
  $$0 = $533 + 8 | 0; //@line 5164
  STACKTOP = sp; //@line 5165
  return $$0 | 0; //@line 5165
 }
 if (!(HEAP32[1592] | 0)) {
  HEAP32[1594] = 4096; //@line 5170
  HEAP32[1593] = 4096; //@line 5171
  HEAP32[1595] = -1; //@line 5172
  HEAP32[1596] = -1; //@line 5173
  HEAP32[1597] = 0; //@line 5174
  HEAP32[1585] = 0; //@line 5175
  HEAP32[1592] = $1 & -16 ^ 1431655768; //@line 5179
  $548 = 4096; //@line 5180
 } else {
  $548 = HEAP32[1594] | 0; //@line 5183
 }
 $545 = $$0197 + 48 | 0; //@line 5185
 $546 = $$0197 + 47 | 0; //@line 5186
 $547 = $548 + $546 | 0; //@line 5187
 $549 = 0 - $548 | 0; //@line 5188
 $550 = $547 & $549; //@line 5189
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 5192
  STACKTOP = sp; //@line 5193
  return $$0 | 0; //@line 5193
 }
 $552 = HEAP32[1584] | 0; //@line 5195
 if ($552 | 0) {
  $554 = HEAP32[1582] | 0; //@line 5198
  $555 = $554 + $550 | 0; //@line 5199
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 5204
   STACKTOP = sp; //@line 5205
   return $$0 | 0; //@line 5205
  }
 }
 L244 : do {
  if (!(HEAP32[1585] & 4)) {
   $561 = HEAP32[1480] | 0; //@line 5213
   L246 : do {
    if (!$561) {
     label = 163; //@line 5217
    } else {
     $$0$i$i = 6344; //@line 5219
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 5221
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 5224
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 5233
      if (!$570) {
       label = 163; //@line 5236
       break L246;
      } else {
       $$0$i$i = $570; //@line 5239
      }
     }
     $595 = $547 - $530 & $549; //@line 5243
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 5246
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 5254
       } else {
        $$723947$i = $595; //@line 5256
        $$748$i = $597; //@line 5256
        label = 180; //@line 5257
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 5261
       $$2253$ph$i = $595; //@line 5261
       label = 171; //@line 5262
      }
     } else {
      $$2234243136$i = 0; //@line 5265
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 5271
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 5274
     } else {
      $574 = $572; //@line 5276
      $575 = HEAP32[1593] | 0; //@line 5277
      $576 = $575 + -1 | 0; //@line 5278
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 5286
      $584 = HEAP32[1582] | 0; //@line 5287
      $585 = $$$i + $584 | 0; //@line 5288
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1584] | 0; //@line 5293
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 5300
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 5304
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 5307
        $$748$i = $572; //@line 5307
        label = 180; //@line 5308
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 5311
        $$2253$ph$i = $$$i; //@line 5311
        label = 171; //@line 5312
       }
      } else {
       $$2234243136$i = 0; //@line 5315
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 5322
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 5331
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 5334
       $$748$i = $$2247$ph$i; //@line 5334
       label = 180; //@line 5335
       break L244;
      }
     }
     $607 = HEAP32[1594] | 0; //@line 5339
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 5343
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 5346
      $$748$i = $$2247$ph$i; //@line 5346
      label = 180; //@line 5347
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 5353
      $$2234243136$i = 0; //@line 5354
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 5358
      $$748$i = $$2247$ph$i; //@line 5358
      label = 180; //@line 5359
      break L244;
     }
    }
   } while (0);
   HEAP32[1585] = HEAP32[1585] | 4; //@line 5366
   $$4236$i = $$2234243136$i; //@line 5367
   label = 178; //@line 5368
  } else {
   $$4236$i = 0; //@line 5370
   label = 178; //@line 5371
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 5377
   $621 = _sbrk(0) | 0; //@line 5378
   $627 = $621 - $620 | 0; //@line 5386
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 5388
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 5396
    $$748$i = $620; //@line 5396
    label = 180; //@line 5397
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1582] | 0) + $$723947$i | 0; //@line 5403
  HEAP32[1582] = $633; //@line 5404
  if ($633 >>> 0 > (HEAP32[1583] | 0) >>> 0) {
   HEAP32[1583] = $633; //@line 5408
  }
  $636 = HEAP32[1480] | 0; //@line 5410
  do {
   if (!$636) {
    $638 = HEAP32[1478] | 0; //@line 5414
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1478] = $$748$i; //@line 5419
    }
    HEAP32[1586] = $$748$i; //@line 5421
    HEAP32[1587] = $$723947$i; //@line 5422
    HEAP32[1589] = 0; //@line 5423
    HEAP32[1483] = HEAP32[1592]; //@line 5425
    HEAP32[1482] = -1; //@line 5426
    HEAP32[1487] = 5936; //@line 5427
    HEAP32[1486] = 5936; //@line 5428
    HEAP32[1489] = 5944; //@line 5429
    HEAP32[1488] = 5944; //@line 5430
    HEAP32[1491] = 5952; //@line 5431
    HEAP32[1490] = 5952; //@line 5432
    HEAP32[1493] = 5960; //@line 5433
    HEAP32[1492] = 5960; //@line 5434
    HEAP32[1495] = 5968; //@line 5435
    HEAP32[1494] = 5968; //@line 5436
    HEAP32[1497] = 5976; //@line 5437
    HEAP32[1496] = 5976; //@line 5438
    HEAP32[1499] = 5984; //@line 5439
    HEAP32[1498] = 5984; //@line 5440
    HEAP32[1501] = 5992; //@line 5441
    HEAP32[1500] = 5992; //@line 5442
    HEAP32[1503] = 6e3; //@line 5443
    HEAP32[1502] = 6e3; //@line 5444
    HEAP32[1505] = 6008; //@line 5445
    HEAP32[1504] = 6008; //@line 5446
    HEAP32[1507] = 6016; //@line 5447
    HEAP32[1506] = 6016; //@line 5448
    HEAP32[1509] = 6024; //@line 5449
    HEAP32[1508] = 6024; //@line 5450
    HEAP32[1511] = 6032; //@line 5451
    HEAP32[1510] = 6032; //@line 5452
    HEAP32[1513] = 6040; //@line 5453
    HEAP32[1512] = 6040; //@line 5454
    HEAP32[1515] = 6048; //@line 5455
    HEAP32[1514] = 6048; //@line 5456
    HEAP32[1517] = 6056; //@line 5457
    HEAP32[1516] = 6056; //@line 5458
    HEAP32[1519] = 6064; //@line 5459
    HEAP32[1518] = 6064; //@line 5460
    HEAP32[1521] = 6072; //@line 5461
    HEAP32[1520] = 6072; //@line 5462
    HEAP32[1523] = 6080; //@line 5463
    HEAP32[1522] = 6080; //@line 5464
    HEAP32[1525] = 6088; //@line 5465
    HEAP32[1524] = 6088; //@line 5466
    HEAP32[1527] = 6096; //@line 5467
    HEAP32[1526] = 6096; //@line 5468
    HEAP32[1529] = 6104; //@line 5469
    HEAP32[1528] = 6104; //@line 5470
    HEAP32[1531] = 6112; //@line 5471
    HEAP32[1530] = 6112; //@line 5472
    HEAP32[1533] = 6120; //@line 5473
    HEAP32[1532] = 6120; //@line 5474
    HEAP32[1535] = 6128; //@line 5475
    HEAP32[1534] = 6128; //@line 5476
    HEAP32[1537] = 6136; //@line 5477
    HEAP32[1536] = 6136; //@line 5478
    HEAP32[1539] = 6144; //@line 5479
    HEAP32[1538] = 6144; //@line 5480
    HEAP32[1541] = 6152; //@line 5481
    HEAP32[1540] = 6152; //@line 5482
    HEAP32[1543] = 6160; //@line 5483
    HEAP32[1542] = 6160; //@line 5484
    HEAP32[1545] = 6168; //@line 5485
    HEAP32[1544] = 6168; //@line 5486
    HEAP32[1547] = 6176; //@line 5487
    HEAP32[1546] = 6176; //@line 5488
    HEAP32[1549] = 6184; //@line 5489
    HEAP32[1548] = 6184; //@line 5490
    $642 = $$723947$i + -40 | 0; //@line 5491
    $644 = $$748$i + 8 | 0; //@line 5493
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 5498
    $650 = $$748$i + $649 | 0; //@line 5499
    $651 = $642 - $649 | 0; //@line 5500
    HEAP32[1480] = $650; //@line 5501
    HEAP32[1477] = $651; //@line 5502
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 5505
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 5508
    HEAP32[1481] = HEAP32[1596]; //@line 5510
   } else {
    $$024367$i = 6344; //@line 5512
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 5514
     $658 = $$024367$i + 4 | 0; //@line 5515
     $659 = HEAP32[$658 >> 2] | 0; //@line 5516
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 5520
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 5524
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 5529
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 5543
       $673 = (HEAP32[1477] | 0) + $$723947$i | 0; //@line 5545
       $675 = $636 + 8 | 0; //@line 5547
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 5552
       $681 = $636 + $680 | 0; //@line 5553
       $682 = $673 - $680 | 0; //@line 5554
       HEAP32[1480] = $681; //@line 5555
       HEAP32[1477] = $682; //@line 5556
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 5559
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 5562
       HEAP32[1481] = HEAP32[1596]; //@line 5564
       break;
      }
     }
    }
    $688 = HEAP32[1478] | 0; //@line 5569
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1478] = $$748$i; //@line 5572
     $753 = $$748$i; //@line 5573
    } else {
     $753 = $688; //@line 5575
    }
    $690 = $$748$i + $$723947$i | 0; //@line 5577
    $$124466$i = 6344; //@line 5578
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 5583
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 5587
     if (!$694) {
      $$0$i$i$i = 6344; //@line 5590
      break;
     } else {
      $$124466$i = $694; //@line 5593
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 5602
      $700 = $$124466$i + 4 | 0; //@line 5603
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 5606
      $704 = $$748$i + 8 | 0; //@line 5608
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 5614
      $712 = $690 + 8 | 0; //@line 5616
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 5622
      $722 = $710 + $$0197 | 0; //@line 5626
      $723 = $718 - $710 - $$0197 | 0; //@line 5627
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 5630
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1477] | 0) + $723 | 0; //@line 5635
        HEAP32[1477] = $728; //@line 5636
        HEAP32[1480] = $722; //@line 5637
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 5640
       } else {
        if ((HEAP32[1479] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1476] | 0) + $723 | 0; //@line 5646
         HEAP32[1476] = $734; //@line 5647
         HEAP32[1479] = $722; //@line 5648
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 5651
         HEAP32[$722 + $734 >> 2] = $734; //@line 5653
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 5657
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 5661
         $743 = $739 >>> 3; //@line 5662
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 5667
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 5669
           $750 = 5936 + ($743 << 1 << 2) | 0; //@line 5671
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 5677
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 5686
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1474] = HEAP32[1474] & ~(1 << $743); //@line 5696
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 5703
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 5707
             }
             $764 = $748 + 8 | 0; //@line 5710
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 5714
              break;
             }
             _abort(); //@line 5717
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 5722
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 5723
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 5726
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 5728
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 5732
             $783 = $782 + 4 | 0; //@line 5733
             $784 = HEAP32[$783 >> 2] | 0; //@line 5734
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 5737
              if (!$786) {
               $$3$i$i = 0; //@line 5740
               break;
              } else {
               $$1291$i$i = $786; //@line 5743
               $$1293$i$i = $782; //@line 5743
              }
             } else {
              $$1291$i$i = $784; //@line 5746
              $$1293$i$i = $783; //@line 5746
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 5749
              $789 = HEAP32[$788 >> 2] | 0; //@line 5750
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 5753
               $$1293$i$i = $788; //@line 5753
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 5756
              $792 = HEAP32[$791 >> 2] | 0; //@line 5757
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 5762
               $$1293$i$i = $791; //@line 5762
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 5767
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 5770
              $$3$i$i = $$1291$i$i; //@line 5771
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 5776
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 5779
             }
             $776 = $774 + 12 | 0; //@line 5782
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 5786
             }
             $779 = $771 + 8 | 0; //@line 5789
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 5793
              HEAP32[$779 >> 2] = $774; //@line 5794
              $$3$i$i = $771; //@line 5795
              break;
             } else {
              _abort(); //@line 5798
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 5808
           $798 = 6200 + ($797 << 2) | 0; //@line 5809
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 5814
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1475] = HEAP32[1475] & ~(1 << $797); //@line 5823
             break L311;
            } else {
             if ((HEAP32[1478] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 5829
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 5837
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1478] | 0; //@line 5847
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 5850
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 5854
           $815 = $718 + 16 | 0; //@line 5855
           $816 = HEAP32[$815 >> 2] | 0; //@line 5856
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 5862
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 5866
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 5868
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 5874
           if (!$822) {
            break;
           }
           if ((HEAP32[1478] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 5882
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 5886
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 5888
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 5895
         $$0287$i$i = $742 + $723 | 0; //@line 5895
        } else {
         $$0$i17$i = $718; //@line 5897
         $$0287$i$i = $723; //@line 5897
        }
        $830 = $$0$i17$i + 4 | 0; //@line 5899
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 5902
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 5905
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 5907
        $836 = $$0287$i$i >>> 3; //@line 5908
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 5936 + ($836 << 1 << 2) | 0; //@line 5912
         $840 = HEAP32[1474] | 0; //@line 5913
         $841 = 1 << $836; //@line 5914
         do {
          if (!($840 & $841)) {
           HEAP32[1474] = $840 | $841; //@line 5920
           $$0295$i$i = $839; //@line 5922
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 5922
          } else {
           $845 = $839 + 8 | 0; //@line 5924
           $846 = HEAP32[$845 >> 2] | 0; //@line 5925
           if ((HEAP32[1478] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 5929
            $$pre$phi$i19$iZ2D = $845; //@line 5929
            break;
           }
           _abort(); //@line 5932
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 5936
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 5938
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 5940
         HEAP32[$722 + 12 >> 2] = $839; //@line 5942
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 5945
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 5949
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 5953
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 5958
          $858 = $852 << $857; //@line 5959
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 5962
          $863 = $858 << $861; //@line 5964
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 5967
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 5972
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 5978
         }
        } while (0);
        $877 = 6200 + ($$0296$i$i << 2) | 0; //@line 5981
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 5983
        $879 = $722 + 16 | 0; //@line 5984
        HEAP32[$879 + 4 >> 2] = 0; //@line 5986
        HEAP32[$879 >> 2] = 0; //@line 5987
        $881 = HEAP32[1475] | 0; //@line 5988
        $882 = 1 << $$0296$i$i; //@line 5989
        if (!($881 & $882)) {
         HEAP32[1475] = $881 | $882; //@line 5994
         HEAP32[$877 >> 2] = $722; //@line 5995
         HEAP32[$722 + 24 >> 2] = $877; //@line 5997
         HEAP32[$722 + 12 >> 2] = $722; //@line 5999
         HEAP32[$722 + 8 >> 2] = $722; //@line 6001
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 6010
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 6010
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 6017
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 6021
         $902 = HEAP32[$900 >> 2] | 0; //@line 6023
         if (!$902) {
          label = 260; //@line 6026
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 6029
          $$0289$i$i = $902; //@line 6029
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1478] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 6036
         } else {
          HEAP32[$900 >> 2] = $722; //@line 6039
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 6041
          HEAP32[$722 + 12 >> 2] = $722; //@line 6043
          HEAP32[$722 + 8 >> 2] = $722; //@line 6045
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 6050
         $910 = HEAP32[$909 >> 2] | 0; //@line 6051
         $911 = HEAP32[1478] | 0; //@line 6052
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 6058
          HEAP32[$909 >> 2] = $722; //@line 6059
          HEAP32[$722 + 8 >> 2] = $910; //@line 6061
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 6063
          HEAP32[$722 + 24 >> 2] = 0; //@line 6065
          break;
         } else {
          _abort(); //@line 6068
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 6075
      STACKTOP = sp; //@line 6076
      return $$0 | 0; //@line 6076
     } else {
      $$0$i$i$i = 6344; //@line 6078
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 6082
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 6087
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 6095
    }
    $927 = $923 + -47 | 0; //@line 6097
    $929 = $927 + 8 | 0; //@line 6099
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 6105
    $936 = $636 + 16 | 0; //@line 6106
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 6108
    $939 = $938 + 8 | 0; //@line 6109
    $940 = $938 + 24 | 0; //@line 6110
    $941 = $$723947$i + -40 | 0; //@line 6111
    $943 = $$748$i + 8 | 0; //@line 6113
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 6118
    $949 = $$748$i + $948 | 0; //@line 6119
    $950 = $941 - $948 | 0; //@line 6120
    HEAP32[1480] = $949; //@line 6121
    HEAP32[1477] = $950; //@line 6122
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 6125
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 6128
    HEAP32[1481] = HEAP32[1596]; //@line 6130
    $956 = $938 + 4 | 0; //@line 6131
    HEAP32[$956 >> 2] = 27; //@line 6132
    HEAP32[$939 >> 2] = HEAP32[1586]; //@line 6133
    HEAP32[$939 + 4 >> 2] = HEAP32[1587]; //@line 6133
    HEAP32[$939 + 8 >> 2] = HEAP32[1588]; //@line 6133
    HEAP32[$939 + 12 >> 2] = HEAP32[1589]; //@line 6133
    HEAP32[1586] = $$748$i; //@line 6134
    HEAP32[1587] = $$723947$i; //@line 6135
    HEAP32[1589] = 0; //@line 6136
    HEAP32[1588] = $939; //@line 6137
    $958 = $940; //@line 6138
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 6140
     HEAP32[$958 >> 2] = 7; //@line 6141
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 6154
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 6157
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 6160
     HEAP32[$938 >> 2] = $964; //@line 6161
     $969 = $964 >>> 3; //@line 6162
     if ($964 >>> 0 < 256) {
      $972 = 5936 + ($969 << 1 << 2) | 0; //@line 6166
      $973 = HEAP32[1474] | 0; //@line 6167
      $974 = 1 << $969; //@line 6168
      if (!($973 & $974)) {
       HEAP32[1474] = $973 | $974; //@line 6173
       $$0211$i$i = $972; //@line 6175
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 6175
      } else {
       $978 = $972 + 8 | 0; //@line 6177
       $979 = HEAP32[$978 >> 2] | 0; //@line 6178
       if ((HEAP32[1478] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 6182
       } else {
        $$0211$i$i = $979; //@line 6185
        $$pre$phi$i$iZ2D = $978; //@line 6185
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 6188
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 6190
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 6192
      HEAP32[$636 + 12 >> 2] = $972; //@line 6194
      break;
     }
     $985 = $964 >>> 8; //@line 6197
     if (!$985) {
      $$0212$i$i = 0; //@line 6200
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 6204
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 6208
       $991 = $985 << $990; //@line 6209
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 6212
       $996 = $991 << $994; //@line 6214
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 6217
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 6222
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 6228
      }
     }
     $1010 = 6200 + ($$0212$i$i << 2) | 0; //@line 6231
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 6233
     HEAP32[$636 + 20 >> 2] = 0; //@line 6235
     HEAP32[$936 >> 2] = 0; //@line 6236
     $1013 = HEAP32[1475] | 0; //@line 6237
     $1014 = 1 << $$0212$i$i; //@line 6238
     if (!($1013 & $1014)) {
      HEAP32[1475] = $1013 | $1014; //@line 6243
      HEAP32[$1010 >> 2] = $636; //@line 6244
      HEAP32[$636 + 24 >> 2] = $1010; //@line 6246
      HEAP32[$636 + 12 >> 2] = $636; //@line 6248
      HEAP32[$636 + 8 >> 2] = $636; //@line 6250
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 6259
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 6259
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 6266
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 6270
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 6272
      if (!$1034) {
       label = 286; //@line 6275
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 6278
       $$0207$i$i = $1034; //@line 6278
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1478] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 6285
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 6288
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 6290
       HEAP32[$636 + 12 >> 2] = $636; //@line 6292
       HEAP32[$636 + 8 >> 2] = $636; //@line 6294
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 6299
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 6300
      $1043 = HEAP32[1478] | 0; //@line 6301
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 6307
       HEAP32[$1041 >> 2] = $636; //@line 6308
       HEAP32[$636 + 8 >> 2] = $1042; //@line 6310
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 6312
       HEAP32[$636 + 24 >> 2] = 0; //@line 6314
       break;
      } else {
       _abort(); //@line 6317
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1477] | 0; //@line 6324
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 6327
   HEAP32[1477] = $1054; //@line 6328
   $1055 = HEAP32[1480] | 0; //@line 6329
   $1056 = $1055 + $$0197 | 0; //@line 6330
   HEAP32[1480] = $1056; //@line 6331
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 6334
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 6337
   $$0 = $1055 + 8 | 0; //@line 6339
   STACKTOP = sp; //@line 6340
   return $$0 | 0; //@line 6340
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 6344
 $$0 = 0; //@line 6345
 STACKTOP = sp; //@line 6346
 return $$0 | 0; //@line 6346
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10068
 STACKTOP = STACKTOP + 560 | 0; //@line 10069
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 10069
 $6 = sp + 8 | 0; //@line 10070
 $7 = sp; //@line 10071
 $8 = sp + 524 | 0; //@line 10072
 $9 = $8; //@line 10073
 $10 = sp + 512 | 0; //@line 10074
 HEAP32[$7 >> 2] = 0; //@line 10075
 $11 = $10 + 12 | 0; //@line 10076
 ___DOUBLE_BITS_677($1) | 0; //@line 10077
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 10082
  $$0520 = 1; //@line 10082
  $$0521 = 3023; //@line 10082
 } else {
  $$0471 = $1; //@line 10093
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 10093
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 3024 : 3029 : 3026; //@line 10093
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 10095
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 10104
   $31 = $$0520 + 3 | 0; //@line 10109
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 10111
   _out_670($0, $$0521, $$0520); //@line 10112
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 3050 : 3054 : $27 ? 3042 : 3046, 3); //@line 10113
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 10115
   $$sink560 = $31; //@line 10116
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 10119
   $36 = $35 != 0.0; //@line 10120
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 10124
   }
   $39 = $5 | 32; //@line 10126
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 10129
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 10132
    $44 = $$0520 | 2; //@line 10133
    $46 = 12 - $3 | 0; //@line 10135
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 10140
     } else {
      $$0509585 = 8.0; //@line 10142
      $$1508586 = $46; //@line 10142
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 10144
       $$0509585 = $$0509585 * 16.0; //@line 10145
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 10160
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 10165
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 10170
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 10173
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 10176
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 10179
     HEAP8[$68 >> 0] = 48; //@line 10180
     $$0511 = $68; //@line 10181
    } else {
     $$0511 = $66; //@line 10183
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 10190
    $76 = $$0511 + -2 | 0; //@line 10193
    HEAP8[$76 >> 0] = $5 + 15; //@line 10194
    $77 = ($3 | 0) < 1; //@line 10195
    $79 = ($4 & 8 | 0) == 0; //@line 10197
    $$0523 = $8; //@line 10198
    $$2473 = $$1472; //@line 10198
    while (1) {
     $80 = ~~$$2473; //@line 10200
     $86 = $$0523 + 1 | 0; //@line 10206
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[3058 + $80 >> 0]; //@line 10207
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 10210
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 10219
      } else {
       HEAP8[$86 >> 0] = 46; //@line 10222
       $$1524 = $$0523 + 2 | 0; //@line 10223
      }
     } else {
      $$1524 = $86; //@line 10226
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 10230
     }
    }
    $$pre693 = $$1524; //@line 10236
    if (!$3) {
     label = 24; //@line 10238
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 10246
      $$sink = $3 + 2 | 0; //@line 10246
     } else {
      label = 24; //@line 10248
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 10252
     $$pre$phi691Z2D = $101; //@line 10253
     $$sink = $101; //@line 10253
    }
    $104 = $11 - $76 | 0; //@line 10257
    $106 = $104 + $44 + $$sink | 0; //@line 10259
    _pad_676($0, 32, $2, $106, $4); //@line 10260
    _out_670($0, $$0521$, $44); //@line 10261
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 10263
    _out_670($0, $8, $$pre$phi691Z2D); //@line 10264
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 10266
    _out_670($0, $76, $104); //@line 10267
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 10269
    $$sink560 = $106; //@line 10270
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 10274
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 10278
    HEAP32[$7 >> 2] = $113; //@line 10279
    $$3 = $35 * 268435456.0; //@line 10280
    $$pr = $113; //@line 10280
   } else {
    $$3 = $35; //@line 10283
    $$pr = HEAP32[$7 >> 2] | 0; //@line 10283
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 10287
   $$0498 = $$561; //@line 10288
   $$4 = $$3; //@line 10288
   do {
    $116 = ~~$$4 >>> 0; //@line 10290
    HEAP32[$$0498 >> 2] = $116; //@line 10291
    $$0498 = $$0498 + 4 | 0; //@line 10292
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 10295
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 10305
    $$1499662 = $$0498; //@line 10305
    $124 = $$pr; //@line 10305
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 10308
     $$0488655 = $$1499662 + -4 | 0; //@line 10309
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 10312
     } else {
      $$0488657 = $$0488655; //@line 10314
      $$0497656 = 0; //@line 10314
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 10317
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 10319
       $131 = tempRet0; //@line 10320
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 10321
       HEAP32[$$0488657 >> 2] = $132; //@line 10323
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 10324
       $$0488657 = $$0488657 + -4 | 0; //@line 10326
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 10336
      } else {
       $138 = $$1482663 + -4 | 0; //@line 10338
       HEAP32[$138 >> 2] = $$0497656; //@line 10339
       $$2483$ph = $138; //@line 10340
      }
     }
     $$2500 = $$1499662; //@line 10343
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 10349
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 10353
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 10359
     HEAP32[$7 >> 2] = $144; //@line 10360
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 10363
      $$1499662 = $$2500; //@line 10363
      $124 = $144; //@line 10363
     } else {
      $$1482$lcssa = $$2483$ph; //@line 10365
      $$1499$lcssa = $$2500; //@line 10365
      $$pr566 = $144; //@line 10365
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 10370
    $$1499$lcssa = $$0498; //@line 10370
    $$pr566 = $$pr; //@line 10370
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 10376
    $150 = ($39 | 0) == 102; //@line 10377
    $$3484650 = $$1482$lcssa; //@line 10378
    $$3501649 = $$1499$lcssa; //@line 10378
    $152 = $$pr566; //@line 10378
    while (1) {
     $151 = 0 - $152 | 0; //@line 10380
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 10382
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 10386
      $161 = 1e9 >>> $154; //@line 10387
      $$0487644 = 0; //@line 10388
      $$1489643 = $$3484650; //@line 10388
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 10390
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 10394
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 10395
       $$1489643 = $$1489643 + 4 | 0; //@line 10396
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 10407
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 10410
       $$4502 = $$3501649; //@line 10410
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 10413
       $$$3484700 = $$$3484; //@line 10414
       $$4502 = $$3501649 + 4 | 0; //@line 10414
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 10421
      $$4502 = $$3501649; //@line 10421
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 10423
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 10430
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 10432
     HEAP32[$7 >> 2] = $152; //@line 10433
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 10438
      $$3501$lcssa = $$$4502; //@line 10438
      break;
     } else {
      $$3484650 = $$$3484700; //@line 10436
      $$3501649 = $$$4502; //@line 10436
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 10443
    $$3501$lcssa = $$1499$lcssa; //@line 10443
   }
   $185 = $$561; //@line 10446
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 10451
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 10452
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 10455
    } else {
     $$0514639 = $189; //@line 10457
     $$0530638 = 10; //@line 10457
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 10459
      $193 = $$0514639 + 1 | 0; //@line 10460
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 10463
       break;
      } else {
       $$0514639 = $193; //@line 10466
      }
     }
    }
   } else {
    $$1515 = 0; //@line 10471
   }
   $198 = ($39 | 0) == 103; //@line 10476
   $199 = ($$540 | 0) != 0; //@line 10477
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 10480
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 10489
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 10492
    $213 = ($209 | 0) % 9 | 0; //@line 10493
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 10496
     $$1531632 = 10; //@line 10496
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 10499
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 10502
       $$1531632 = $215; //@line 10502
      } else {
       $$1531$lcssa = $215; //@line 10504
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 10509
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 10511
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 10512
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 10515
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 10518
     $$4518 = $$1515; //@line 10518
     $$8 = $$3484$lcssa; //@line 10518
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 10523
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 10524
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 10529
     if (!$$0520) {
      $$1467 = $$$564; //@line 10532
      $$1469 = $$543; //@line 10532
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 10535
      $$1467 = $230 ? -$$$564 : $$$564; //@line 10540
      $$1469 = $230 ? -$$543 : $$543; //@line 10540
     }
     $233 = $217 - $218 | 0; //@line 10542
     HEAP32[$212 >> 2] = $233; //@line 10543
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 10547
      HEAP32[$212 >> 2] = $236; //@line 10548
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 10551
       $$sink547625 = $212; //@line 10551
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 10553
        HEAP32[$$sink547625 >> 2] = 0; //@line 10554
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 10557
         HEAP32[$240 >> 2] = 0; //@line 10558
         $$6 = $240; //@line 10559
        } else {
         $$6 = $$5486626; //@line 10561
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 10564
        HEAP32[$238 >> 2] = $242; //@line 10565
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 10568
         $$sink547625 = $238; //@line 10568
        } else {
         $$5486$lcssa = $$6; //@line 10570
         $$sink547$lcssa = $238; //@line 10570
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 10575
       $$sink547$lcssa = $212; //@line 10575
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 10580
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 10581
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 10584
       $$4518 = $247; //@line 10584
       $$8 = $$5486$lcssa; //@line 10584
      } else {
       $$2516621 = $247; //@line 10586
       $$2532620 = 10; //@line 10586
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 10588
        $251 = $$2516621 + 1 | 0; //@line 10589
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 10592
         $$4518 = $251; //@line 10592
         $$8 = $$5486$lcssa; //@line 10592
         break;
        } else {
         $$2516621 = $251; //@line 10595
        }
       }
      }
     } else {
      $$4492 = $212; //@line 10600
      $$4518 = $$1515; //@line 10600
      $$8 = $$3484$lcssa; //@line 10600
     }
    }
    $253 = $$4492 + 4 | 0; //@line 10603
    $$5519$ph = $$4518; //@line 10606
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 10606
    $$9$ph = $$8; //@line 10606
   } else {
    $$5519$ph = $$1515; //@line 10608
    $$7505$ph = $$3501$lcssa; //@line 10608
    $$9$ph = $$3484$lcssa; //@line 10608
   }
   $$7505 = $$7505$ph; //@line 10610
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 10614
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 10617
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 10621
    } else {
     $$lcssa675 = 1; //@line 10623
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 10627
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 10632
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 10640
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 10640
     } else {
      $$0479 = $5 + -2 | 0; //@line 10644
      $$2476 = $$540$ + -1 | 0; //@line 10644
     }
     $267 = $4 & 8; //@line 10646
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 10651
       if (!$270) {
        $$2529 = 9; //@line 10654
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 10659
         $$3533616 = 10; //@line 10659
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 10661
          $275 = $$1528617 + 1 | 0; //@line 10662
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 10668
           break;
          } else {
           $$1528617 = $275; //@line 10666
          }
         }
        } else {
         $$2529 = 0; //@line 10673
        }
       }
      } else {
       $$2529 = 9; //@line 10677
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 10685
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 10687
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 10689
       $$1480 = $$0479; //@line 10692
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 10692
       $$pre$phi698Z2D = 0; //@line 10692
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 10696
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 10698
       $$1480 = $$0479; //@line 10701
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 10701
       $$pre$phi698Z2D = 0; //@line 10701
       break;
      }
     } else {
      $$1480 = $$0479; //@line 10705
      $$3477 = $$2476; //@line 10705
      $$pre$phi698Z2D = $267; //@line 10705
     }
    } else {
     $$1480 = $5; //@line 10709
     $$3477 = $$540; //@line 10709
     $$pre$phi698Z2D = $4 & 8; //@line 10709
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 10712
   $294 = ($292 | 0) != 0 & 1; //@line 10714
   $296 = ($$1480 | 32 | 0) == 102; //@line 10716
   if ($296) {
    $$2513 = 0; //@line 10720
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 10720
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 10723
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 10726
    $304 = $11; //@line 10727
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 10732
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 10734
      HEAP8[$308 >> 0] = 48; //@line 10735
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 10740
      } else {
       $$1512$lcssa = $308; //@line 10742
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 10747
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 10754
    $318 = $$1512$lcssa + -2 | 0; //@line 10756
    HEAP8[$318 >> 0] = $$1480; //@line 10757
    $$2513 = $318; //@line 10760
    $$pn = $304 - $318 | 0; //@line 10760
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 10765
   _pad_676($0, 32, $2, $323, $4); //@line 10766
   _out_670($0, $$0521, $$0520); //@line 10767
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 10769
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 10772
    $326 = $8 + 9 | 0; //@line 10773
    $327 = $326; //@line 10774
    $328 = $8 + 8 | 0; //@line 10775
    $$5493600 = $$0496$$9; //@line 10776
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 10779
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 10784
       $$1465 = $328; //@line 10785
      } else {
       $$1465 = $330; //@line 10787
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 10794
       $$0464597 = $330; //@line 10795
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 10797
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 10800
        } else {
         $$1465 = $335; //@line 10802
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 10807
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 10812
     $$5493600 = $$5493600 + 4 | 0; //@line 10813
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 3074, 1); //@line 10823
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 10829
     $$6494592 = $$5493600; //@line 10829
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 10832
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 10837
       $$0463587 = $347; //@line 10838
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 10840
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 10843
        } else {
         $$0463$lcssa = $351; //@line 10845
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 10850
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 10854
      $$6494592 = $$6494592 + 4 | 0; //@line 10855
      $356 = $$4478593 + -9 | 0; //@line 10856
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 10863
       break;
      } else {
       $$4478593 = $356; //@line 10861
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 10868
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 10871
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 10874
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 10877
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 10878
     $365 = $363; //@line 10879
     $366 = 0 - $9 | 0; //@line 10880
     $367 = $8 + 8 | 0; //@line 10881
     $$5605 = $$3477; //@line 10882
     $$7495604 = $$9$ph; //@line 10882
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 10885
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 10888
       $$0 = $367; //@line 10889
      } else {
       $$0 = $369; //@line 10891
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 10896
        _out_670($0, $$0, 1); //@line 10897
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 10901
         break;
        }
        _out_670($0, 3074, 1); //@line 10904
        $$2 = $375; //@line 10905
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 10909
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 10914
        $$1601 = $$0; //@line 10915
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 10917
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 10920
         } else {
          $$2 = $373; //@line 10922
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 10929
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 10932
      $381 = $$5605 - $378 | 0; //@line 10933
      $$7495604 = $$7495604 + 4 | 0; //@line 10934
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 10941
       break;
      } else {
       $$5605 = $381; //@line 10939
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 10946
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 10949
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 10953
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 10956
   $$sink560 = $323; //@line 10957
  }
 } while (0);
 STACKTOP = sp; //@line 10962
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 10962
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 8640
 STACKTOP = STACKTOP + 64 | 0; //@line 8641
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 8641
 $5 = sp + 16 | 0; //@line 8642
 $6 = sp; //@line 8643
 $7 = sp + 24 | 0; //@line 8644
 $8 = sp + 8 | 0; //@line 8645
 $9 = sp + 20 | 0; //@line 8646
 HEAP32[$5 >> 2] = $1; //@line 8647
 $10 = ($0 | 0) != 0; //@line 8648
 $11 = $7 + 40 | 0; //@line 8649
 $12 = $11; //@line 8650
 $13 = $7 + 39 | 0; //@line 8651
 $14 = $8 + 4 | 0; //@line 8652
 $$0243 = 0; //@line 8653
 $$0247 = 0; //@line 8653
 $$0269 = 0; //@line 8653
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 8662
     $$1248 = -1; //@line 8663
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 8667
     break;
    }
   } else {
    $$1248 = $$0247; //@line 8671
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 8674
  $21 = HEAP8[$20 >> 0] | 0; //@line 8675
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 8678
   break;
  } else {
   $23 = $21; //@line 8681
   $25 = $20; //@line 8681
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 8686
     $27 = $25; //@line 8686
     label = 9; //@line 8687
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 8692
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 8699
   HEAP32[$5 >> 2] = $24; //@line 8700
   $23 = HEAP8[$24 >> 0] | 0; //@line 8702
   $25 = $24; //@line 8702
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 8707
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 8712
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 8715
     $27 = $27 + 2 | 0; //@line 8716
     HEAP32[$5 >> 2] = $27; //@line 8717
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 8724
      break;
     } else {
      $$0249303 = $30; //@line 8721
      label = 9; //@line 8722
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 8732
  if ($10) {
   _out_670($0, $20, $36); //@line 8734
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 8738
   $$0247 = $$1248; //@line 8738
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 8746
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 8747
  if ($43) {
   $$0253 = -1; //@line 8749
   $$1270 = $$0269; //@line 8749
   $$sink = 1; //@line 8749
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 8759
    $$1270 = 1; //@line 8759
    $$sink = 3; //@line 8759
   } else {
    $$0253 = -1; //@line 8761
    $$1270 = $$0269; //@line 8761
    $$sink = 1; //@line 8761
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 8764
  HEAP32[$5 >> 2] = $51; //@line 8765
  $52 = HEAP8[$51 >> 0] | 0; //@line 8766
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 8768
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 8775
   $$lcssa291 = $52; //@line 8775
   $$lcssa292 = $51; //@line 8775
  } else {
   $$0262309 = 0; //@line 8777
   $60 = $52; //@line 8777
   $65 = $51; //@line 8777
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 8782
    $64 = $65 + 1 | 0; //@line 8783
    HEAP32[$5 >> 2] = $64; //@line 8784
    $66 = HEAP8[$64 >> 0] | 0; //@line 8785
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 8787
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 8794
     $$lcssa291 = $66; //@line 8794
     $$lcssa292 = $64; //@line 8794
     break;
    } else {
     $$0262309 = $63; //@line 8797
     $60 = $66; //@line 8797
     $65 = $64; //@line 8797
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 8809
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 8811
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 8816
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 8821
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 8833
     $$2271 = 1; //@line 8833
     $storemerge274 = $79 + 3 | 0; //@line 8833
    } else {
     label = 23; //@line 8835
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 8839
    if ($$1270 | 0) {
     $$0 = -1; //@line 8842
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8857
     $106 = HEAP32[$105 >> 2] | 0; //@line 8858
     HEAP32[$2 >> 2] = $105 + 4; //@line 8860
     $363 = $106; //@line 8861
    } else {
     $363 = 0; //@line 8863
    }
    $$0259 = $363; //@line 8867
    $$2271 = 0; //@line 8867
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 8867
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 8869
   $109 = ($$0259 | 0) < 0; //@line 8870
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 8875
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 8875
   $$3272 = $$2271; //@line 8875
   $115 = $storemerge274; //@line 8875
  } else {
   $112 = _getint_671($5) | 0; //@line 8877
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 8880
    break;
   }
   $$1260 = $112; //@line 8884
   $$1263 = $$0262$lcssa; //@line 8884
   $$3272 = $$1270; //@line 8884
   $115 = HEAP32[$5 >> 2] | 0; //@line 8884
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 8895
     $156 = _getint_671($5) | 0; //@line 8896
     $$0254 = $156; //@line 8898
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 8898
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 8907
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 8912
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 8917
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 8924
      $144 = $125 + 4 | 0; //@line 8928
      HEAP32[$5 >> 2] = $144; //@line 8929
      $$0254 = $140; //@line 8930
      $$pre345 = $144; //@line 8930
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 8936
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8951
     $152 = HEAP32[$151 >> 2] | 0; //@line 8952
     HEAP32[$2 >> 2] = $151 + 4; //@line 8954
     $364 = $152; //@line 8955
    } else {
     $364 = 0; //@line 8957
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 8960
    HEAP32[$5 >> 2] = $154; //@line 8961
    $$0254 = $364; //@line 8962
    $$pre345 = $154; //@line 8962
   } else {
    $$0254 = -1; //@line 8964
    $$pre345 = $115; //@line 8964
   }
  } while (0);
  $$0252 = 0; //@line 8967
  $158 = $$pre345; //@line 8967
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 8974
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 8977
   HEAP32[$5 >> 2] = $158; //@line 8978
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (2542 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 8983
   $168 = $167 & 255; //@line 8984
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 8988
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 8995
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 8999
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 9003
     break L1;
    } else {
     label = 50; //@line 9006
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 9011
     $176 = $3 + ($$0253 << 3) | 0; //@line 9013
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 9018
     $182 = $6; //@line 9019
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 9021
     HEAP32[$182 + 4 >> 2] = $181; //@line 9024
     label = 50; //@line 9025
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 9029
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 9032
    $187 = HEAP32[$5 >> 2] | 0; //@line 9034
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 9038
   if ($10) {
    $187 = $158; //@line 9040
   } else {
    $$0243 = 0; //@line 9042
    $$0247 = $$1248; //@line 9042
    $$0269 = $$3272; //@line 9042
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 9048
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 9054
  $196 = $$1263 & -65537; //@line 9057
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 9058
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9066
       $$0243 = 0; //@line 9067
       $$0247 = $$1248; //@line 9067
       $$0269 = $$3272; //@line 9067
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9073
       $$0243 = 0; //@line 9074
       $$0247 = $$1248; //@line 9074
       $$0269 = $$3272; //@line 9074
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 9082
       HEAP32[$208 >> 2] = $$1248; //@line 9084
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 9087
       $$0243 = 0; //@line 9088
       $$0247 = $$1248; //@line 9088
       $$0269 = $$3272; //@line 9088
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 9095
       $$0243 = 0; //@line 9096
       $$0247 = $$1248; //@line 9096
       $$0269 = $$3272; //@line 9096
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 9103
       $$0243 = 0; //@line 9104
       $$0247 = $$1248; //@line 9104
       $$0269 = $$3272; //@line 9104
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9110
       $$0243 = 0; //@line 9111
       $$0247 = $$1248; //@line 9111
       $$0269 = $$3272; //@line 9111
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 9119
       HEAP32[$220 >> 2] = $$1248; //@line 9121
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 9124
       $$0243 = 0; //@line 9125
       $$0247 = $$1248; //@line 9125
       $$0269 = $$3272; //@line 9125
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 9130
       $$0247 = $$1248; //@line 9130
       $$0269 = $$3272; //@line 9130
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 9140
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 9140
     $$3265 = $$1263$ | 8; //@line 9140
     label = 62; //@line 9141
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 9145
     $$1255 = $$0254; //@line 9145
     $$3265 = $$1263$; //@line 9145
     label = 62; //@line 9146
     break;
    }
   case 111:
    {
     $242 = $6; //@line 9150
     $244 = HEAP32[$242 >> 2] | 0; //@line 9152
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 9155
     $248 = _fmt_o($244, $247, $11) | 0; //@line 9156
     $252 = $12 - $248 | 0; //@line 9160
     $$0228 = $248; //@line 9165
     $$1233 = 0; //@line 9165
     $$1238 = 3006; //@line 9165
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 9165
     $$4266 = $$1263$; //@line 9165
     $281 = $244; //@line 9165
     $283 = $247; //@line 9165
     label = 68; //@line 9166
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 9170
     $258 = HEAP32[$256 >> 2] | 0; //@line 9172
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 9175
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 9178
      $264 = tempRet0; //@line 9179
      $265 = $6; //@line 9180
      HEAP32[$265 >> 2] = $263; //@line 9182
      HEAP32[$265 + 4 >> 2] = $264; //@line 9185
      $$0232 = 1; //@line 9186
      $$0237 = 3006; //@line 9186
      $275 = $263; //@line 9186
      $276 = $264; //@line 9186
      label = 67; //@line 9187
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 9199
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 3006 : 3008 : 3007; //@line 9199
      $275 = $258; //@line 9199
      $276 = $261; //@line 9199
      label = 67; //@line 9200
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 9206
     $$0232 = 0; //@line 9212
     $$0237 = 3006; //@line 9212
     $275 = HEAP32[$197 >> 2] | 0; //@line 9212
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 9212
     label = 67; //@line 9213
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 9224
     $$2 = $13; //@line 9225
     $$2234 = 0; //@line 9225
     $$2239 = 3006; //@line 9225
     $$2251 = $11; //@line 9225
     $$5 = 1; //@line 9225
     $$6268 = $196; //@line 9225
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 9232
     label = 72; //@line 9233
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 9237
     $$1 = $302 | 0 ? $302 : 3016; //@line 9240
     label = 72; //@line 9241
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 9251
     HEAP32[$14 >> 2] = 0; //@line 9252
     HEAP32[$6 >> 2] = $8; //@line 9253
     $$4258354 = -1; //@line 9254
     $365 = $8; //@line 9254
     label = 76; //@line 9255
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 9259
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 9262
      $$0240$lcssa356 = 0; //@line 9263
      label = 85; //@line 9264
     } else {
      $$4258354 = $$0254; //@line 9266
      $365 = $$pre348; //@line 9266
      label = 76; //@line 9267
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 9274
     $$0247 = $$1248; //@line 9274
     $$0269 = $$3272; //@line 9274
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 9279
     $$2234 = 0; //@line 9279
     $$2239 = 3006; //@line 9279
     $$2251 = $11; //@line 9279
     $$5 = $$0254; //@line 9279
     $$6268 = $$1263$; //@line 9279
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 9285
    $227 = $6; //@line 9286
    $229 = HEAP32[$227 >> 2] | 0; //@line 9288
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 9291
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 9293
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 9299
    $$0228 = $234; //@line 9304
    $$1233 = $or$cond278 ? 0 : 2; //@line 9304
    $$1238 = $or$cond278 ? 3006 : 3006 + ($$1236 >> 4) | 0; //@line 9304
    $$2256 = $$1255; //@line 9304
    $$4266 = $$3265; //@line 9304
    $281 = $229; //@line 9304
    $283 = $232; //@line 9304
    label = 68; //@line 9305
   } else if ((label | 0) == 67) {
    label = 0; //@line 9308
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 9310
    $$1233 = $$0232; //@line 9310
    $$1238 = $$0237; //@line 9310
    $$2256 = $$0254; //@line 9310
    $$4266 = $$1263$; //@line 9310
    $281 = $275; //@line 9310
    $283 = $276; //@line 9310
    label = 68; //@line 9311
   } else if ((label | 0) == 72) {
    label = 0; //@line 9314
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 9315
    $306 = ($305 | 0) == 0; //@line 9316
    $$2 = $$1; //@line 9323
    $$2234 = 0; //@line 9323
    $$2239 = 3006; //@line 9323
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 9323
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 9323
    $$6268 = $196; //@line 9323
   } else if ((label | 0) == 76) {
    label = 0; //@line 9326
    $$0229316 = $365; //@line 9327
    $$0240315 = 0; //@line 9327
    $$1244314 = 0; //@line 9327
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 9329
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 9332
      $$2245 = $$1244314; //@line 9332
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 9335
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 9341
      $$2245 = $320; //@line 9341
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 9345
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 9348
      $$0240315 = $325; //@line 9348
      $$1244314 = $320; //@line 9348
     } else {
      $$0240$lcssa = $325; //@line 9350
      $$2245 = $320; //@line 9350
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 9356
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 9359
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 9362
     label = 85; //@line 9363
    } else {
     $$1230327 = $365; //@line 9365
     $$1241326 = 0; //@line 9365
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 9367
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9370
       label = 85; //@line 9371
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 9374
      $$1241326 = $331 + $$1241326 | 0; //@line 9375
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9378
       label = 85; //@line 9379
       break L97;
      }
      _out_670($0, $9, $331); //@line 9383
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9388
       label = 85; //@line 9389
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 9386
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 9397
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 9403
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 9405
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 9410
   $$2 = $or$cond ? $$0228 : $11; //@line 9415
   $$2234 = $$1233; //@line 9415
   $$2239 = $$1238; //@line 9415
   $$2251 = $11; //@line 9415
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 9415
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 9415
  } else if ((label | 0) == 85) {
   label = 0; //@line 9418
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 9420
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 9423
   $$0247 = $$1248; //@line 9423
   $$0269 = $$3272; //@line 9423
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 9428
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 9430
  $345 = $$$5 + $$2234 | 0; //@line 9431
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 9433
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 9434
  _out_670($0, $$2239, $$2234); //@line 9435
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 9437
  _pad_676($0, 48, $$$5, $343, 0); //@line 9438
  _out_670($0, $$2, $343); //@line 9439
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 9441
  $$0243 = $$2261; //@line 9442
  $$0247 = $$1248; //@line 9442
  $$0269 = $$3272; //@line 9442
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 9450
    } else {
     $$2242302 = 1; //@line 9452
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 9455
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 9458
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 9462
      $356 = $$2242302 + 1 | 0; //@line 9463
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 9466
      } else {
       $$2242$lcssa = $356; //@line 9468
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 9474
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 9480
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 9486
       } else {
        $$0 = 1; //@line 9488
        break;
       }
      }
     } else {
      $$0 = 1; //@line 9493
     }
    }
   } else {
    $$0 = $$1248; //@line 9497
   }
  }
 } while (0);
 STACKTOP = sp; //@line 9501
 return $$0 | 0; //@line 9501
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
    HEAP8[$AsyncCtx + 4 >> 0] = $0; //@line 831
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 833
    HEAP32[$AsyncCtx + 12 >> 2] = $2; //@line 835
    HEAP32[$AsyncCtx + 16 >> 2] = $3; //@line 837
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer23; //@line 839
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer23; //@line 841
    HEAP32[$AsyncCtx + 28 >> 2] = $vararg_buffer; //@line 843
    HEAP32[$AsyncCtx + 32 >> 2] = $vararg_buffer; //@line 845
    HEAP32[$AsyncCtx + 36 >> 2] = $vararg_buffer3; //@line 847
    HEAP32[$AsyncCtx + 40 >> 2] = $vararg_buffer3; //@line 849
    HEAP32[$AsyncCtx + 44 >> 2] = $vararg_buffer20; //@line 851
    HEAP32[$AsyncCtx + 48 >> 2] = $vararg_buffer20; //@line 853
    HEAP32[$AsyncCtx + 52 >> 2] = $vararg_buffer1; //@line 855
    HEAP32[$AsyncCtx + 56 >> 2] = $vararg_buffer1; //@line 857
    HEAP32[$AsyncCtx + 60 >> 2] = $4; //@line 859
    HEAP32[$AsyncCtx + 64 >> 2] = $vararg_buffer6; //@line 861
    HEAP32[$AsyncCtx + 68 >> 2] = $vararg_buffer6; //@line 863
    HEAP32[$AsyncCtx + 72 >> 2] = $vararg_buffer9; //@line 865
    HEAP32[$AsyncCtx + 76 >> 2] = $vararg_buffer9; //@line 867
    HEAP32[$AsyncCtx + 80 >> 2] = $vararg_buffer12; //@line 869
    HEAP32[$AsyncCtx + 84 >> 2] = $vararg_buffer12; //@line 871
    HEAP32[$AsyncCtx + 88 >> 2] = $vararg_buffer15; //@line 873
    HEAP32[$AsyncCtx + 92 >> 2] = $vararg_buffer15; //@line 875
    HEAP32[$AsyncCtx + 96 >> 2] = $vararg_buffer18; //@line 877
    HEAP32[$AsyncCtx + 100 >> 2] = $vararg_buffer18; //@line 879
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
      FUNCTION_TABLE_vi[$72 & 255](1595); //@line 1008
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
        $76 = _snprintf($66, $65, 1597, $vararg_buffer) | 0; //@line 1028
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
          $$sink = 1615; //@line 1046
          label = 35; //@line 1047
          break;
         }
        case 1:
         {
          $$sink = 1621; //@line 1051
          label = 35; //@line 1052
          break;
         }
        case 3:
         {
          $$sink = 1609; //@line 1056
          label = 35; //@line 1057
          break;
         }
        case 7:
         {
          $$sink = 1603; //@line 1061
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
         $$1152 = _snprintf($$0142, $$0144, 1627, $vararg_buffer1) | 0; //@line 1073
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
           HEAP32[$AsyncCtx60 + 4 >> 2] = $2; //@line 1109
           HEAP32[$AsyncCtx60 + 8 >> 2] = $3; //@line 1111
           HEAP32[$AsyncCtx60 + 12 >> 2] = $vararg_buffer20; //@line 1113
           HEAP32[$AsyncCtx60 + 16 >> 2] = $vararg_buffer20; //@line 1115
           HEAP8[$AsyncCtx60 + 20 >> 0] = $$1$off0 & 1; //@line 1118
           HEAP32[$AsyncCtx60 + 24 >> 2] = $vararg_buffer23; //@line 1120
           HEAP32[$AsyncCtx60 + 28 >> 2] = $vararg_buffer23; //@line 1122
           HEAP32[$AsyncCtx60 + 32 >> 2] = $vararg_buffer3; //@line 1124
           HEAP32[$AsyncCtx60 + 36 >> 2] = $$1143; //@line 1126
           HEAP32[$AsyncCtx60 + 40 >> 2] = $$1145; //@line 1128
           HEAP32[$AsyncCtx60 + 44 >> 2] = $vararg_buffer3; //@line 1130
           HEAP32[$AsyncCtx60 + 48 >> 2] = $4; //@line 1132
           HEAP32[$AsyncCtx60 + 52 >> 2] = $55; //@line 1134
           HEAP32[$AsyncCtx60 + 56 >> 2] = $vararg_buffer6; //@line 1136
           HEAP32[$AsyncCtx60 + 60 >> 2] = $1; //@line 1138
           HEAP32[$AsyncCtx60 + 64 >> 2] = $vararg_buffer6; //@line 1140
           HEAP32[$AsyncCtx60 + 68 >> 2] = $vararg_buffer9; //@line 1142
           HEAP32[$AsyncCtx60 + 72 >> 2] = $vararg_buffer9; //@line 1144
           HEAP32[$AsyncCtx60 + 76 >> 2] = $vararg_buffer12; //@line 1146
           HEAP32[$AsyncCtx60 + 80 >> 2] = $vararg_buffer12; //@line 1148
           HEAP32[$AsyncCtx60 + 84 >> 2] = $vararg_buffer15; //@line 1150
           HEAP32[$AsyncCtx60 + 88 >> 2] = $vararg_buffer15; //@line 1152
           HEAP32[$AsyncCtx60 + 92 >> 2] = $vararg_buffer18; //@line 1154
           HEAP32[$AsyncCtx60 + 96 >> 2] = $vararg_buffer18; //@line 1156
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
           HEAP32[$AsyncCtx38 + 4 >> 2] = $2; //@line 1174
           HEAP32[$AsyncCtx38 + 8 >> 2] = $3; //@line 1176
           HEAP32[$AsyncCtx38 + 12 >> 2] = $vararg_buffer23; //@line 1178
           HEAP32[$AsyncCtx38 + 16 >> 2] = $vararg_buffer23; //@line 1180
           HEAP8[$AsyncCtx38 + 20 >> 0] = $$1$off0 & 1; //@line 1183
           HEAP32[$AsyncCtx38 + 24 >> 2] = $vararg_buffer3; //@line 1185
           HEAP32[$AsyncCtx38 + 28 >> 2] = $$1143; //@line 1187
           HEAP32[$AsyncCtx38 + 32 >> 2] = $$1145; //@line 1189
           HEAP32[$AsyncCtx38 + 36 >> 2] = $vararg_buffer3; //@line 1191
           HEAP32[$AsyncCtx38 + 40 >> 2] = $4; //@line 1193
           HEAP32[$AsyncCtx38 + 44 >> 2] = $vararg_buffer20; //@line 1195
           HEAP32[$AsyncCtx38 + 48 >> 2] = $vararg_buffer20; //@line 1197
           HEAP32[$AsyncCtx38 + 52 >> 2] = $55; //@line 1199
           HEAP32[$AsyncCtx38 + 56 >> 2] = $vararg_buffer6; //@line 1201
           HEAP32[$AsyncCtx38 + 60 >> 2] = $1; //@line 1203
           HEAP32[$AsyncCtx38 + 64 >> 2] = $vararg_buffer6; //@line 1205
           HEAP32[$AsyncCtx38 + 68 >> 2] = $vararg_buffer9; //@line 1207
           HEAP32[$AsyncCtx38 + 72 >> 2] = $vararg_buffer9; //@line 1209
           HEAP32[$AsyncCtx38 + 76 >> 2] = $vararg_buffer12; //@line 1211
           HEAP32[$AsyncCtx38 + 80 >> 2] = $vararg_buffer12; //@line 1213
           HEAP32[$AsyncCtx38 + 84 >> 2] = $vararg_buffer15; //@line 1215
           HEAP32[$AsyncCtx38 + 88 >> 2] = $vararg_buffer15; //@line 1217
           HEAP32[$AsyncCtx38 + 92 >> 2] = $vararg_buffer18; //@line 1219
           HEAP32[$AsyncCtx38 + 96 >> 2] = $vararg_buffer18; //@line 1221
           sp = STACKTOP; //@line 1222
           STACKTOP = sp; //@line 1223
           return;
          } else {
           _emscripten_free_async_context($AsyncCtx38 | 0); //@line 1225
           HEAP32[$vararg_buffer3 >> 2] = $126; //@line 1226
           $151 = _snprintf($$1143, $$1145, 1627, $vararg_buffer3) | 0; //@line 1227
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
          $$5156 = _snprintf($$3169, $$3147168, 1630, $vararg_buffer6) | 0; //@line 1263
          break;
         }
        case 1:
         {
          HEAP32[$vararg_buffer9 >> 2] = $1; //@line 1267
          $$5156 = _snprintf($$3169, $$3147168, 1645, $vararg_buffer9) | 0; //@line 1269
          break;
         }
        case 3:
         {
          HEAP32[$vararg_buffer12 >> 2] = $1; //@line 1273
          $$5156 = _snprintf($$3169, $$3147168, 1660, $vararg_buffer12) | 0; //@line 1275
          break;
         }
        case 7:
         {
          HEAP32[$vararg_buffer15 >> 2] = $1; //@line 1279
          $$5156 = _snprintf($$3169, $$3147168, 1675, $vararg_buffer15) | 0; //@line 1281
          break;
         }
        default:
         {
          $$5156 = _snprintf($$3169, $$3147168, 1690, $vararg_buffer18) | 0; //@line 1286
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
          HEAP32[$AsyncCtx56 + 4 >> 2] = $vararg_buffer20; //@line 1303
          HEAP32[$AsyncCtx56 + 8 >> 2] = $vararg_buffer20; //@line 1305
          HEAP8[$AsyncCtx56 + 12 >> 0] = $$1$off0 & 1; //@line 1308
          HEAP32[$AsyncCtx56 + 16 >> 2] = $vararg_buffer23; //@line 1310
          HEAP32[$AsyncCtx56 + 20 >> 2] = $vararg_buffer23; //@line 1312
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
             $194 = _snprintf($181, $182, 1627, $vararg_buffer20) | 0; //@line 1358
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
           _snprintf($$6, $$6150, 1705, $vararg_buffer23) | 0; //@line 1381
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
   _mbed_assert_internal(1710, 1712, 41); //@line 1738
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
   _mbed_assert_internal(1710, 1712, 55); //@line 2023
   if (___async) {
    HEAP32[$AsyncCtx16 >> 2] = 63; //@line 2026
    HEAP32[$AsyncCtx16 + 4 >> 2] = $1; //@line 2028
    HEAP32[$AsyncCtx16 + 8 >> 2] = $$048; //@line 2030
    HEAP8[$AsyncCtx16 + 12 >> 0] = $$043; //@line 2032
    HEAP32[$AsyncCtx16 + 16 >> 2] = $0; //@line 2034
    HEAP32[$AsyncCtx16 + 20 >> 2] = $0; //@line 2036
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
 $2 = $0 + -8 | 0; //@line 6373
 $3 = HEAP32[1478] | 0; //@line 6374
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 6377
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 6381
 $7 = $6 & 3; //@line 6382
 if (($7 | 0) == 1) {
  _abort(); //@line 6385
 }
 $9 = $6 & -8; //@line 6388
 $10 = $2 + $9 | 0; //@line 6389
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 6394
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 6400
   $17 = $13 + $9 | 0; //@line 6401
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 6404
   }
   if ((HEAP32[1479] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 6410
    $106 = HEAP32[$105 >> 2] | 0; //@line 6411
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 6415
     $$1382 = $17; //@line 6415
     $114 = $16; //@line 6415
     break;
    }
    HEAP32[1476] = $17; //@line 6418
    HEAP32[$105 >> 2] = $106 & -2; //@line 6420
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 6423
    HEAP32[$16 + $17 >> 2] = $17; //@line 6425
    return;
   }
   $21 = $13 >>> 3; //@line 6428
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 6432
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 6434
    $28 = 5936 + ($21 << 1 << 2) | 0; //@line 6436
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 6441
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 6448
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1474] = HEAP32[1474] & ~(1 << $21); //@line 6458
     $$1 = $16; //@line 6459
     $$1382 = $17; //@line 6459
     $114 = $16; //@line 6459
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 6465
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 6469
     }
     $41 = $26 + 8 | 0; //@line 6472
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 6476
     } else {
      _abort(); //@line 6478
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 6483
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 6484
    $$1 = $16; //@line 6485
    $$1382 = $17; //@line 6485
    $114 = $16; //@line 6485
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 6489
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 6491
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 6495
     $60 = $59 + 4 | 0; //@line 6496
     $61 = HEAP32[$60 >> 2] | 0; //@line 6497
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 6500
      if (!$63) {
       $$3 = 0; //@line 6503
       break;
      } else {
       $$1387 = $63; //@line 6506
       $$1390 = $59; //@line 6506
      }
     } else {
      $$1387 = $61; //@line 6509
      $$1390 = $60; //@line 6509
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 6512
      $66 = HEAP32[$65 >> 2] | 0; //@line 6513
      if ($66 | 0) {
       $$1387 = $66; //@line 6516
       $$1390 = $65; //@line 6516
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 6519
      $69 = HEAP32[$68 >> 2] | 0; //@line 6520
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 6525
       $$1390 = $68; //@line 6525
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 6530
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 6533
      $$3 = $$1387; //@line 6534
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 6539
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 6542
     }
     $53 = $51 + 12 | 0; //@line 6545
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 6549
     }
     $56 = $48 + 8 | 0; //@line 6552
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 6556
      HEAP32[$56 >> 2] = $51; //@line 6557
      $$3 = $48; //@line 6558
      break;
     } else {
      _abort(); //@line 6561
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 6568
    $$1382 = $17; //@line 6568
    $114 = $16; //@line 6568
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 6571
    $75 = 6200 + ($74 << 2) | 0; //@line 6572
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 6577
      if (!$$3) {
       HEAP32[1475] = HEAP32[1475] & ~(1 << $74); //@line 6584
       $$1 = $16; //@line 6585
       $$1382 = $17; //@line 6585
       $114 = $16; //@line 6585
       break L10;
      }
     } else {
      if ((HEAP32[1478] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 6592
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 6600
       if (!$$3) {
        $$1 = $16; //@line 6603
        $$1382 = $17; //@line 6603
        $114 = $16; //@line 6603
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1478] | 0; //@line 6611
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 6614
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 6618
    $92 = $16 + 16 | 0; //@line 6619
    $93 = HEAP32[$92 >> 2] | 0; //@line 6620
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 6626
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 6630
       HEAP32[$93 + 24 >> 2] = $$3; //@line 6632
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 6638
    if (!$99) {
     $$1 = $16; //@line 6641
     $$1382 = $17; //@line 6641
     $114 = $16; //@line 6641
    } else {
     if ((HEAP32[1478] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 6646
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 6650
      HEAP32[$99 + 24 >> 2] = $$3; //@line 6652
      $$1 = $16; //@line 6653
      $$1382 = $17; //@line 6653
      $114 = $16; //@line 6653
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 6659
   $$1382 = $9; //@line 6659
   $114 = $2; //@line 6659
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 6664
 }
 $115 = $10 + 4 | 0; //@line 6667
 $116 = HEAP32[$115 >> 2] | 0; //@line 6668
 if (!($116 & 1)) {
  _abort(); //@line 6672
 }
 if (!($116 & 2)) {
  if ((HEAP32[1480] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1477] | 0) + $$1382 | 0; //@line 6682
   HEAP32[1477] = $124; //@line 6683
   HEAP32[1480] = $$1; //@line 6684
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 6687
   if (($$1 | 0) != (HEAP32[1479] | 0)) {
    return;
   }
   HEAP32[1479] = 0; //@line 6693
   HEAP32[1476] = 0; //@line 6694
   return;
  }
  if ((HEAP32[1479] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1476] | 0) + $$1382 | 0; //@line 6701
   HEAP32[1476] = $132; //@line 6702
   HEAP32[1479] = $114; //@line 6703
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 6706
   HEAP32[$114 + $132 >> 2] = $132; //@line 6708
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 6712
  $138 = $116 >>> 3; //@line 6713
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 6718
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 6720
    $145 = 5936 + ($138 << 1 << 2) | 0; //@line 6722
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1478] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 6728
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 6735
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1474] = HEAP32[1474] & ~(1 << $138); //@line 6745
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 6751
    } else {
     if ((HEAP32[1478] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 6756
     }
     $160 = $143 + 8 | 0; //@line 6759
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 6763
     } else {
      _abort(); //@line 6765
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 6770
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 6771
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 6774
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 6776
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 6780
      $180 = $179 + 4 | 0; //@line 6781
      $181 = HEAP32[$180 >> 2] | 0; //@line 6782
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 6785
       if (!$183) {
        $$3400 = 0; //@line 6788
        break;
       } else {
        $$1398 = $183; //@line 6791
        $$1402 = $179; //@line 6791
       }
      } else {
       $$1398 = $181; //@line 6794
       $$1402 = $180; //@line 6794
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 6797
       $186 = HEAP32[$185 >> 2] | 0; //@line 6798
       if ($186 | 0) {
        $$1398 = $186; //@line 6801
        $$1402 = $185; //@line 6801
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 6804
       $189 = HEAP32[$188 >> 2] | 0; //@line 6805
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 6810
        $$1402 = $188; //@line 6810
       }
      }
      if ((HEAP32[1478] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 6816
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 6819
       $$3400 = $$1398; //@line 6820
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 6825
      if ((HEAP32[1478] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 6829
      }
      $173 = $170 + 12 | 0; //@line 6832
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 6836
      }
      $176 = $167 + 8 | 0; //@line 6839
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 6843
       HEAP32[$176 >> 2] = $170; //@line 6844
       $$3400 = $167; //@line 6845
       break;
      } else {
       _abort(); //@line 6848
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 6856
     $196 = 6200 + ($195 << 2) | 0; //@line 6857
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 6862
       if (!$$3400) {
        HEAP32[1475] = HEAP32[1475] & ~(1 << $195); //@line 6869
        break L108;
       }
      } else {
       if ((HEAP32[1478] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 6876
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 6884
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1478] | 0; //@line 6894
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 6897
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 6901
     $213 = $10 + 16 | 0; //@line 6902
     $214 = HEAP32[$213 >> 2] | 0; //@line 6903
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 6909
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 6913
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 6915
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 6921
     if ($220 | 0) {
      if ((HEAP32[1478] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 6927
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 6931
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 6933
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 6942
  HEAP32[$114 + $137 >> 2] = $137; //@line 6944
  if (($$1 | 0) == (HEAP32[1479] | 0)) {
   HEAP32[1476] = $137; //@line 6948
   return;
  } else {
   $$2 = $137; //@line 6951
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 6955
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 6958
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 6960
  $$2 = $$1382; //@line 6961
 }
 $235 = $$2 >>> 3; //@line 6963
 if ($$2 >>> 0 < 256) {
  $238 = 5936 + ($235 << 1 << 2) | 0; //@line 6967
  $239 = HEAP32[1474] | 0; //@line 6968
  $240 = 1 << $235; //@line 6969
  if (!($239 & $240)) {
   HEAP32[1474] = $239 | $240; //@line 6974
   $$0403 = $238; //@line 6976
   $$pre$phiZ2D = $238 + 8 | 0; //@line 6976
  } else {
   $244 = $238 + 8 | 0; //@line 6978
   $245 = HEAP32[$244 >> 2] | 0; //@line 6979
   if ((HEAP32[1478] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 6983
   } else {
    $$0403 = $245; //@line 6986
    $$pre$phiZ2D = $244; //@line 6986
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 6989
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 6991
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 6993
  HEAP32[$$1 + 12 >> 2] = $238; //@line 6995
  return;
 }
 $251 = $$2 >>> 8; //@line 6998
 if (!$251) {
  $$0396 = 0; //@line 7001
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 7005
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 7009
   $257 = $251 << $256; //@line 7010
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 7013
   $262 = $257 << $260; //@line 7015
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 7018
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 7023
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 7029
  }
 }
 $276 = 6200 + ($$0396 << 2) | 0; //@line 7032
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 7034
 HEAP32[$$1 + 20 >> 2] = 0; //@line 7037
 HEAP32[$$1 + 16 >> 2] = 0; //@line 7038
 $280 = HEAP32[1475] | 0; //@line 7039
 $281 = 1 << $$0396; //@line 7040
 do {
  if (!($280 & $281)) {
   HEAP32[1475] = $280 | $281; //@line 7046
   HEAP32[$276 >> 2] = $$1; //@line 7047
   HEAP32[$$1 + 24 >> 2] = $276; //@line 7049
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 7051
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 7053
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 7061
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 7061
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 7068
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 7072
    $301 = HEAP32[$299 >> 2] | 0; //@line 7074
    if (!$301) {
     label = 121; //@line 7077
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 7080
     $$0384 = $301; //@line 7080
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1478] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 7087
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 7090
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 7092
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 7094
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 7096
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 7101
    $309 = HEAP32[$308 >> 2] | 0; //@line 7102
    $310 = HEAP32[1478] | 0; //@line 7103
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 7109
     HEAP32[$308 >> 2] = $$1; //@line 7110
     HEAP32[$$1 + 8 >> 2] = $309; //@line 7112
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 7114
     HEAP32[$$1 + 24 >> 2] = 0; //@line 7116
     break;
    } else {
     _abort(); //@line 7119
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1482] | 0) + -1 | 0; //@line 7126
 HEAP32[1482] = $319; //@line 7127
 if (!$319) {
  $$0212$in$i = 6352; //@line 7130
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 7135
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 7141
  }
 }
 HEAP32[1482] = -1; //@line 7144
 return;
}
function _mbed_vtracef__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$1$off0 = 0, $$1$off0$expand_i1_val = 0, $$1$off0$expand_i1_val18 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$3154 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $$lobit = 0, $$sink = 0, $10 = 0, $102 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $136 = 0, $14 = 0, $147 = 0, $148 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $159 = 0, $160 = 0, $161 = 0, $163 = 0, $164 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $57 = 0, $6 = 0, $62 = 0, $73 = 0, $74 = 0, $78 = 0, $79 = 0, $8 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $89 = 0, $91 = 0, $95 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx11 = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx7 = 0, $ReallocAsyncCtx8 = 0, $extract$t159 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 142
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 144
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 146
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 148
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 150
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 152
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 154
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 156
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 160
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 162
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 164
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 166
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 168
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 172
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 174
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 176
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 178
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 180
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 182
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 184
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 186
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 188
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 190
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 192
 HEAP32[95] = (HEAP32[95] | 0) + 1; //@line 195
 $53 = HEAP32[84] | 0; //@line 196
 do {
  if ($53 | 0) {
   HEAP8[$53 >> 0] = 0; //@line 200
   do {
    if ($2 << 24 >> 24 > -1 & ($4 | 0) != 0) {
     $57 = HEAP32[81] | 0; //@line 206
     if (HEAP8[$57 >> 0] | 0) {
      if (_strstr($57, $4) | 0) {
       $$0$i = 1; //@line 213
       break;
      }
     }
     $62 = HEAP32[82] | 0; //@line 217
     if (!(HEAP8[$62 >> 0] | 0)) {
      label = 9; //@line 221
     } else {
      if (!(_strstr($62, $4) | 0)) {
       $$0$i = 1; //@line 226
      } else {
       label = 9; //@line 228
      }
     }
    } else {
     label = 9; //@line 232
    }
   } while (0);
   if ((label | 0) == 9) {
    $$0$i = 0; //@line 236
   }
   if (!((HEAP32[91] | 0) != 0 & ((($4 | 0) == 0 | (($6 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[88] = HEAP32[86]; //@line 248
    break;
   }
   $73 = HEAPU8[320] | 0; //@line 252
   $74 = $2 & 255; //@line 253
   if ($74 & 31 & $73 | 0) {
    $78 = $73 & 64; //@line 258
    $$lobit = $78 >>> 6; //@line 259
    $79 = $$lobit & 255; //@line 260
    $83 = ($73 & 32 | 0) == 0; //@line 264
    $84 = HEAP32[85] | 0; //@line 265
    $85 = HEAP32[84] | 0; //@line 266
    $86 = $2 << 24 >> 24 == 1; //@line 267
    if ($86 | ($73 & 128 | 0) != 0) {
     $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 270
     _vsnprintf($85, $84, $6, $8) | 0; //@line 271
     if (___async) {
      HEAP32[$ReallocAsyncCtx12 >> 2] = 47; //@line 274
      $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 275
      $$expand_i1_val = $86 & 1; //@line 276
      HEAP8[$87 >> 0] = $$expand_i1_val; //@line 277
      sp = STACKTOP; //@line 278
      return;
     }
     ___async_unwind = 0; //@line 281
     HEAP32[$ReallocAsyncCtx12 >> 2] = 47; //@line 282
     $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 283
     $$expand_i1_val = $86 & 1; //@line 284
     HEAP8[$87 >> 0] = $$expand_i1_val; //@line 285
     sp = STACKTOP; //@line 286
     return;
    }
    if (!$78) {
     $$1$off0 = ($$lobit | 0) != 0; //@line 292
     $$1143 = $85; //@line 292
     $$1145 = $84; //@line 292
     $$3154 = 0; //@line 292
     label = 28; //@line 293
    } else {
     if ($83) {
      $$0142 = $85; //@line 296
      $$0144 = $84; //@line 296
     } else {
      $89 = _snprintf($85, $84, 1597, $14) | 0; //@line 298
      $$ = ($89 | 0) >= ($84 | 0) ? 0 : $89; //@line 300
      $91 = ($$ | 0) > 0; //@line 301
      $$0142 = $91 ? $85 + $$ | 0 : $85; //@line 306
      $$0144 = $84 - ($91 ? $$ : 0) | 0; //@line 306
     }
     if (($$0144 | 0) > 0) {
      $95 = $74 + -2 | 0; //@line 310
      switch ($95 >>> 1 | $95 << 31 | 0) {
      case 0:
       {
        $$sink = 1615; //@line 316
        label = 25; //@line 317
        break;
       }
      case 1:
       {
        $$sink = 1621; //@line 321
        label = 25; //@line 322
        break;
       }
      case 3:
       {
        $$sink = 1609; //@line 326
        label = 25; //@line 327
        break;
       }
      case 7:
       {
        $$sink = 1603; //@line 331
        label = 25; //@line 332
        break;
       }
      default:
       {
        $$0141 = 0; //@line 336
        $$1152 = 0; //@line 336
       }
      }
      if ((label | 0) == 25) {
       HEAP32[$26 >> 2] = $$sink; //@line 340
       $$0141 = $79 & 1; //@line 343
       $$1152 = _snprintf($$0142, $$0144, 1627, $26) | 0; //@line 343
      }
      $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 346
      $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 348
      if (($$1152$ | 0) > 0) {
       $102 = $$0141 << 24 >> 24 == 0; //@line 350
       $$1$off0 = $extract$t159; //@line 355
       $$1143 = $102 ? $$0142 : $$0142 + $$1152$ | 0; //@line 355
       $$1145 = $$0144 - ($102 ? 0 : $$1152$) | 0; //@line 355
       $$3154 = $$1152; //@line 355
       label = 28; //@line 356
      } else {
       $$1$off0 = $extract$t159; //@line 358
       $$1143 = $$0142; //@line 358
       $$1145 = $$0144; //@line 358
       $$3154 = $$1152$; //@line 358
       label = 28; //@line 359
      }
     }
    }
    if ((label | 0) == 28) {
     if (($$1145 | 0) > 0 & (HEAP32[89] | 0) != 0) {
      HEAP32[$30 >> 2] = HEAP32[$8 >> 2]; //@line 370
      $ReallocAsyncCtx11 = _emscripten_realloc_async_context(104) | 0; //@line 371
      $108 = _vsnprintf(0, 0, $6, $30) | 0; //@line 372
      if (___async) {
       HEAP32[$ReallocAsyncCtx11 >> 2] = 51; //@line 375
       $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 376
       HEAP32[$109 >> 2] = $6; //@line 377
       $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 378
       HEAP32[$110 >> 2] = $8; //@line 379
       $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 380
       HEAP32[$111 >> 2] = $22; //@line 381
       $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 382
       HEAP32[$112 >> 2] = $24; //@line 383
       $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 384
       $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 385
       HEAP8[$113 >> 0] = $$1$off0$expand_i1_val; //@line 386
       $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 387
       HEAP32[$114 >> 2] = $10; //@line 388
       $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 389
       HEAP32[$115 >> 2] = $12; //@line 390
       $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 391
       HEAP32[$116 >> 2] = $18; //@line 392
       $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 393
       HEAP32[$117 >> 2] = $$1143; //@line 394
       $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 395
       HEAP32[$118 >> 2] = $$1145; //@line 396
       $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 397
       HEAP32[$119 >> 2] = $20; //@line 398
       $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 399
       HEAP32[$120 >> 2] = $30; //@line 400
       $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 401
       HEAP32[$121 >> 2] = $74; //@line 402
       $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 403
       HEAP32[$122 >> 2] = $32; //@line 404
       $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 405
       HEAP32[$123 >> 2] = $4; //@line 406
       $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 407
       HEAP32[$124 >> 2] = $34; //@line 408
       $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 409
       HEAP32[$125 >> 2] = $36; //@line 410
       $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 411
       HEAP32[$126 >> 2] = $38; //@line 412
       $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 413
       HEAP32[$127 >> 2] = $40; //@line 414
       $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 415
       HEAP32[$128 >> 2] = $42; //@line 416
       $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 417
       HEAP32[$129 >> 2] = $44; //@line 418
       $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 419
       HEAP32[$130 >> 2] = $46; //@line 420
       $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 421
       HEAP32[$131 >> 2] = $48; //@line 422
       $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 423
       HEAP32[$132 >> 2] = $50; //@line 424
       $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 425
       HEAP32[$133 >> 2] = $$3154; //@line 426
       sp = STACKTOP; //@line 427
       return;
      }
      HEAP32[___async_retval >> 2] = $108; //@line 431
      ___async_unwind = 0; //@line 432
      HEAP32[$ReallocAsyncCtx11 >> 2] = 51; //@line 433
      $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 434
      HEAP32[$109 >> 2] = $6; //@line 435
      $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 436
      HEAP32[$110 >> 2] = $8; //@line 437
      $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 438
      HEAP32[$111 >> 2] = $22; //@line 439
      $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 440
      HEAP32[$112 >> 2] = $24; //@line 441
      $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 442
      $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 443
      HEAP8[$113 >> 0] = $$1$off0$expand_i1_val; //@line 444
      $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 445
      HEAP32[$114 >> 2] = $10; //@line 446
      $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 447
      HEAP32[$115 >> 2] = $12; //@line 448
      $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 449
      HEAP32[$116 >> 2] = $18; //@line 450
      $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 451
      HEAP32[$117 >> 2] = $$1143; //@line 452
      $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 453
      HEAP32[$118 >> 2] = $$1145; //@line 454
      $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 455
      HEAP32[$119 >> 2] = $20; //@line 456
      $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 457
      HEAP32[$120 >> 2] = $30; //@line 458
      $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 459
      HEAP32[$121 >> 2] = $74; //@line 460
      $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 461
      HEAP32[$122 >> 2] = $32; //@line 462
      $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 463
      HEAP32[$123 >> 2] = $4; //@line 464
      $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 465
      HEAP32[$124 >> 2] = $34; //@line 466
      $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 467
      HEAP32[$125 >> 2] = $36; //@line 468
      $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 469
      HEAP32[$126 >> 2] = $38; //@line 470
      $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 471
      HEAP32[$127 >> 2] = $40; //@line 472
      $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 473
      HEAP32[$128 >> 2] = $42; //@line 474
      $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 475
      HEAP32[$129 >> 2] = $44; //@line 476
      $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 477
      HEAP32[$130 >> 2] = $46; //@line 478
      $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 479
      HEAP32[$131 >> 2] = $48; //@line 480
      $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 481
      HEAP32[$132 >> 2] = $50; //@line 482
      $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 483
      HEAP32[$133 >> 2] = $$3154; //@line 484
      sp = STACKTOP; //@line 485
      return;
     }
     if (($$1145 | 0) > 0) {
      $136 = $74 + -2 | 0; //@line 490
      switch ($136 >>> 1 | $136 << 31 | 0) {
      case 0:
       {
        HEAP32[$32 >> 2] = $4; //@line 496
        $$5156 = _snprintf($$1143, $$1145, 1630, $32) | 0; //@line 498
        break;
       }
      case 1:
       {
        HEAP32[$36 >> 2] = $4; //@line 502
        $$5156 = _snprintf($$1143, $$1145, 1645, $36) | 0; //@line 504
        break;
       }
      case 3:
       {
        HEAP32[$40 >> 2] = $4; //@line 508
        $$5156 = _snprintf($$1143, $$1145, 1660, $40) | 0; //@line 510
        break;
       }
      case 7:
       {
        HEAP32[$44 >> 2] = $4; //@line 514
        $$5156 = _snprintf($$1143, $$1145, 1675, $44) | 0; //@line 516
        break;
       }
      default:
       {
        $$5156 = _snprintf($$1143, $$1145, 1690, $48) | 0; //@line 521
       }
      }
      $$5156$ = ($$5156 | 0) < ($$1145 | 0) ? $$5156 : 0; //@line 525
      $147 = $$1143 + $$5156$ | 0; //@line 527
      $148 = $$1145 - $$5156$ | 0; //@line 528
      if (($$5156$ | 0) > 0 & ($148 | 0) > 0) {
       $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 532
       $150 = _vsnprintf($147, $148, $6, $8) | 0; //@line 533
       if (___async) {
        HEAP32[$ReallocAsyncCtx10 >> 2] = 53; //@line 536
        $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 537
        HEAP32[$151 >> 2] = $22; //@line 538
        $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 539
        HEAP32[$152 >> 2] = $24; //@line 540
        $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 541
        $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 542
        HEAP8[$153 >> 0] = $$1$off0$expand_i1_val18; //@line 543
        $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 544
        HEAP32[$154 >> 2] = $10; //@line 545
        $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 546
        HEAP32[$155 >> 2] = $12; //@line 547
        $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 548
        HEAP32[$156 >> 2] = $148; //@line 549
        $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 550
        HEAP32[$157 >> 2] = $147; //@line 551
        sp = STACKTOP; //@line 552
        return;
       }
       HEAP32[___async_retval >> 2] = $150; //@line 556
       ___async_unwind = 0; //@line 557
       HEAP32[$ReallocAsyncCtx10 >> 2] = 53; //@line 558
       $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 559
       HEAP32[$151 >> 2] = $22; //@line 560
       $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 561
       HEAP32[$152 >> 2] = $24; //@line 562
       $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 563
       $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 564
       HEAP8[$153 >> 0] = $$1$off0$expand_i1_val18; //@line 565
       $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 566
       HEAP32[$154 >> 2] = $10; //@line 567
       $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 568
       HEAP32[$155 >> 2] = $12; //@line 569
       $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 570
       HEAP32[$156 >> 2] = $148; //@line 571
       $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 572
       HEAP32[$157 >> 2] = $147; //@line 573
       sp = STACKTOP; //@line 574
       return;
      }
     }
    }
    $159 = HEAP32[91] | 0; //@line 579
    $160 = HEAP32[84] | 0; //@line 580
    $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 581
    FUNCTION_TABLE_vi[$159 & 255]($160); //@line 582
    if (___async) {
     HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 585
     sp = STACKTOP; //@line 586
     return;
    }
    ___async_unwind = 0; //@line 589
    HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 590
    sp = STACKTOP; //@line 591
    return;
   }
  }
 } while (0);
 $161 = HEAP32[94] | 0; //@line 596
 if (!$161) {
  return;
 }
 $163 = HEAP32[95] | 0; //@line 601
 HEAP32[95] = 0; //@line 602
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 603
 FUNCTION_TABLE_v[$161 & 15](); //@line 604
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 607
  $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 608
  HEAP32[$164 >> 2] = $163; //@line 609
  sp = STACKTOP; //@line 610
  return;
 }
 ___async_unwind = 0; //@line 613
 HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 614
 $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 615
 HEAP32[$164 >> 2] = $163; //@line 616
 sp = STACKTOP; //@line 617
 return;
}
function _initialize__async_cb_49($0) {
 $0 = $0 | 0;
 var $$043 = 0, $$048 = 0, $10 = 0, $11 = 0, $12 = 0, $14 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $27 = 0, $29 = 0, $30 = 0, $31 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $6 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3680
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3682
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3684
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3686
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3688
 $8 = HEAP32[$AsyncRetVal >> 2] | 0; //@line 3689
 L2 : do {
  if (($8 | 0) < 32768) {
   if (($8 | 0) >= 128) {
    if (($8 | 0) < 2048) {
     switch ($8 | 0) {
     case 1024:
      {
       $$043 = 10; //@line 3699
       $$048 = $8; //@line 3699
       break L2;
       break;
      }
     case 512:
      {
       $$043 = 9; //@line 3704
       $$048 = $8; //@line 3704
       break L2;
       break;
      }
     case 256:
      {
       $$043 = 8; //@line 3709
       $$048 = $8; //@line 3709
       break L2;
       break;
      }
     case 128:
      {
       $$043 = 7; //@line 3714
       $$048 = $8; //@line 3714
       break L2;
       break;
      }
     default:
      {
       label = 43; //@line 3719
       break L2;
      }
     }
    }
    if (($8 | 0) < 8192) {
     switch ($8 | 0) {
     case 4096:
      {
       $$043 = 12; //@line 3728
       $$048 = $8; //@line 3728
       break L2;
       break;
      }
     case 2048:
      {
       $$043 = 11; //@line 3733
       $$048 = $8; //@line 3733
       break L2;
       break;
      }
     default:
      {
       label = 43; //@line 3738
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
       label = 43; //@line 3750
       break L2;
      }
     }
     $$043 = 13; //@line 3754
     $$048 = $8; //@line 3754
     break;
    } else {
     switch ($8 | 0) {
     case 16384:
      {
       break;
      }
     default:
      {
       label = 43; //@line 3762
       break L2;
      }
     }
     $$043 = 14; //@line 3766
     $$048 = $8; //@line 3766
     break;
    }
   }
   if (($8 | 0) >= 8) {
    switch ($8 | 0) {
    case 64:
     {
      $$043 = 6; //@line 3774
      $$048 = $8; //@line 3774
      break L2;
      break;
     }
    case 32:
     {
      $$043 = 5; //@line 3779
      $$048 = $8; //@line 3779
      break L2;
      break;
     }
    case 16:
     {
      $$043 = 4; //@line 3784
      $$048 = $8; //@line 3784
      break L2;
      break;
     }
    case 8:
     {
      $$043 = 3; //@line 3789
      $$048 = $8; //@line 3789
      break L2;
      break;
     }
    default:
     {
      label = 43; //@line 3794
      break L2;
     }
    }
   }
   if (($8 | 0) >= 2) {
    switch ($8 | 0) {
    case 4:
     {
      $$043 = 2; //@line 3803
      $$048 = $8; //@line 3803
      break L2;
      break;
     }
    case 2:
     {
      $$043 = 1; //@line 3808
      $$048 = $8; //@line 3808
      break L2;
      break;
     }
    default:
     {
      label = 43; //@line 3813
      break L2;
     }
    }
   }
   if (($8 | 0) < 0) {
    switch ($8 | 0) {
    case -2147483648:
     {
      $$043 = 31; //@line 3822
      $$048 = -2147483648; //@line 3822
      break L2;
      break;
     }
    default:
     {
      label = 43; //@line 3827
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
     label = 43; //@line 3837
     break L2;
    }
   }
   $ReallocAsyncCtx7 = _emscripten_realloc_async_context(20) | 0; //@line 3841
   _mbed_assert_internal(1710, 1712, 41); //@line 3842
   if (___async) {
    HEAP32[$ReallocAsyncCtx7 >> 2] = 62; //@line 3845
    $9 = $ReallocAsyncCtx7 + 4 | 0; //@line 3846
    HEAP32[$9 >> 2] = $2; //@line 3847
    $10 = $ReallocAsyncCtx7 + 8 | 0; //@line 3848
    HEAP32[$10 >> 2] = $4; //@line 3849
    $11 = $ReallocAsyncCtx7 + 12 | 0; //@line 3850
    HEAP32[$11 >> 2] = $6; //@line 3851
    $12 = $ReallocAsyncCtx7 + 16 | 0; //@line 3852
    HEAP32[$12 >> 2] = $AsyncRetVal; //@line 3853
    sp = STACKTOP; //@line 3854
    return;
   }
   ___async_unwind = 0; //@line 3857
   HEAP32[$ReallocAsyncCtx7 >> 2] = 62; //@line 3858
   $9 = $ReallocAsyncCtx7 + 4 | 0; //@line 3859
   HEAP32[$9 >> 2] = $2; //@line 3860
   $10 = $ReallocAsyncCtx7 + 8 | 0; //@line 3861
   HEAP32[$10 >> 2] = $4; //@line 3862
   $11 = $ReallocAsyncCtx7 + 12 | 0; //@line 3863
   HEAP32[$11 >> 2] = $6; //@line 3864
   $12 = $ReallocAsyncCtx7 + 16 | 0; //@line 3865
   HEAP32[$12 >> 2] = $AsyncRetVal; //@line 3866
   sp = STACKTOP; //@line 3867
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
         label = 43; //@line 3883
         break L2;
        }
       }
       $$043 = 15; //@line 3887
       $$048 = $8; //@line 3887
       break;
      } else {
       switch ($8 | 0) {
       case 65536:
        {
         break;
        }
       default:
        {
         label = 43; //@line 3895
         break L2;
        }
       }
       $$043 = 16; //@line 3899
       $$048 = $8; //@line 3899
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
         label = 43; //@line 3910
         break L2;
        }
       }
       $$043 = 17; //@line 3914
       $$048 = $8; //@line 3914
       break;
      } else {
       switch ($8 | 0) {
       case 262144:
        {
         break;
        }
       default:
        {
         label = 43; //@line 3922
         break L2;
        }
       }
       $$043 = 18; //@line 3926
       $$048 = $8; //@line 3926
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
         label = 43; //@line 3940
         break L2;
        }
       }
       $$043 = 19; //@line 3944
       $$048 = $8; //@line 3944
       break;
      } else {
       switch ($8 | 0) {
       case 1048576:
        {
         break;
        }
       default:
        {
         label = 43; //@line 3952
         break L2;
        }
       }
       $$043 = 20; //@line 3956
       $$048 = $8; //@line 3956
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
         label = 43; //@line 3967
         break L2;
        }
       }
       $$043 = 21; //@line 3971
       $$048 = $8; //@line 3971
       break;
      } else {
       switch ($8 | 0) {
       case 4194304:
        {
         break;
        }
       default:
        {
         label = 43; //@line 3979
         break L2;
        }
       }
       $$043 = 22; //@line 3983
       $$048 = $8; //@line 3983
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
         label = 43; //@line 4000
         break L2;
        }
       }
       $$043 = 23; //@line 4004
       $$048 = $8; //@line 4004
       break;
      } else {
       switch ($8 | 0) {
       case 16777216:
        {
         break;
        }
       default:
        {
         label = 43; //@line 4012
         break L2;
        }
       }
       $$043 = 24; //@line 4016
       $$048 = $8; //@line 4016
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
         label = 43; //@line 4027
         break L2;
        }
       }
       $$043 = 25; //@line 4031
       $$048 = $8; //@line 4031
       break;
      } else {
       switch ($8 | 0) {
       case 67108864:
        {
         break;
        }
       default:
        {
         label = 43; //@line 4039
         break L2;
        }
       }
       $$043 = 26; //@line 4043
       $$048 = $8; //@line 4043
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
         label = 43; //@line 4057
         break L2;
        }
       }
       $$043 = 27; //@line 4061
       $$048 = $8; //@line 4061
       break;
      } else {
       switch ($8 | 0) {
       case 268435456:
        {
         break;
        }
       default:
        {
         label = 43; //@line 4069
         break L2;
        }
       }
       $$043 = 28; //@line 4073
       $$048 = $8; //@line 4073
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
         label = 43; //@line 4084
         break L2;
        }
       }
       $$043 = 29; //@line 4088
       $$048 = $8; //@line 4088
       break;
      } else {
       switch ($8 | 0) {
       case 1073741824:
        {
         break;
        }
       default:
        {
         label = 43; //@line 4096
         break L2;
        }
       }
       $$043 = 30; //@line 4100
       $$048 = $8; //@line 4100
       break;
      }
     }
    }
   }
  }
 } while (0);
 if ((label | 0) == 43) {
  $$043 = 0; //@line 4109
  $$048 = $8; //@line 4109
 }
 $14 = HEAP32[$AsyncRetVal + 4 >> 2] | 0; //@line 4112
 if (($14 + -4 | 0) >>> 0 > 28) {
  $ReallocAsyncCtx6 = _emscripten_realloc_async_context(24) | 0; //@line 4116
  _mbed_assert_internal(1710, 1712, 55); //@line 4117
  if (___async) {
   HEAP32[$ReallocAsyncCtx6 >> 2] = 63; //@line 4120
   $16 = $ReallocAsyncCtx6 + 4 | 0; //@line 4121
   HEAP32[$16 >> 2] = $2; //@line 4122
   $17 = $ReallocAsyncCtx6 + 8 | 0; //@line 4123
   HEAP32[$17 >> 2] = $$048; //@line 4124
   $18 = $ReallocAsyncCtx6 + 12 | 0; //@line 4125
   HEAP8[$18 >> 0] = $$043; //@line 4126
   $19 = $ReallocAsyncCtx6 + 16 | 0; //@line 4127
   HEAP32[$19 >> 2] = $4; //@line 4128
   $20 = $ReallocAsyncCtx6 + 20 | 0; //@line 4129
   HEAP32[$20 >> 2] = $6; //@line 4130
   sp = STACKTOP; //@line 4131
   return;
  }
  ___async_unwind = 0; //@line 4134
  HEAP32[$ReallocAsyncCtx6 >> 2] = 63; //@line 4135
  $16 = $ReallocAsyncCtx6 + 4 | 0; //@line 4136
  HEAP32[$16 >> 2] = $2; //@line 4137
  $17 = $ReallocAsyncCtx6 + 8 | 0; //@line 4138
  HEAP32[$17 >> 2] = $$048; //@line 4139
  $18 = $ReallocAsyncCtx6 + 12 | 0; //@line 4140
  HEAP8[$18 >> 0] = $$043; //@line 4141
  $19 = $ReallocAsyncCtx6 + 16 | 0; //@line 4142
  HEAP32[$19 >> 2] = $4; //@line 4143
  $20 = $ReallocAsyncCtx6 + 20 | 0; //@line 4144
  HEAP32[$20 >> 2] = $6; //@line 4145
  sp = STACKTOP; //@line 4146
  return;
 } else {
  $22 = 7 << $14 + -4; //@line 4150
  $23 = ___muldi3($22 | 0, 0, 1e6, 0) | 0; //@line 4151
  $24 = tempRet0; //@line 4152
  $25 = _i64Add($$048 | 0, 0, -1, -1) | 0; //@line 4153
  $27 = _i64Add($25 | 0, tempRet0 | 0, $23 | 0, $24 | 0) | 0; //@line 4155
  $29 = ___udivdi3($27 | 0, tempRet0 | 0, $$048 | 0, 0) | 0; //@line 4157
  $30 = tempRet0; //@line 4158
  $31 = HEAP32[$2 >> 2] | 0; //@line 4159
  HEAP32[$31 >> 2] = 0; //@line 4160
  HEAP32[$31 + 4 >> 2] = 0; //@line 4162
  $35 = HEAP32[(HEAP32[$4 >> 2] | 0) + 4 >> 2] | 0; //@line 4165
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 4166
  $36 = FUNCTION_TABLE_i[$35 & 3]() | 0; //@line 4167
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 4170
   $37 = $ReallocAsyncCtx3 + 4 | 0; //@line 4171
   HEAP32[$37 >> 2] = $2; //@line 4172
   $38 = $ReallocAsyncCtx3 + 8 | 0; //@line 4173
   HEAP32[$38 >> 2] = $$048; //@line 4174
   $39 = $ReallocAsyncCtx3 + 12 | 0; //@line 4175
   HEAP8[$39 >> 0] = $$043; //@line 4176
   $40 = $ReallocAsyncCtx3 + 16 | 0; //@line 4177
   HEAP32[$40 >> 2] = $14; //@line 4178
   $41 = $ReallocAsyncCtx3 + 20 | 0; //@line 4179
   HEAP32[$41 >> 2] = $22; //@line 4180
   $42 = $ReallocAsyncCtx3 + 24 | 0; //@line 4181
   $43 = $42; //@line 4182
   $44 = $43; //@line 4183
   HEAP32[$44 >> 2] = $29; //@line 4184
   $45 = $43 + 4 | 0; //@line 4185
   $46 = $45; //@line 4186
   HEAP32[$46 >> 2] = $30; //@line 4187
   $47 = $ReallocAsyncCtx3 + 32 | 0; //@line 4188
   HEAP32[$47 >> 2] = $4; //@line 4189
   $48 = $ReallocAsyncCtx3 + 36 | 0; //@line 4190
   HEAP32[$48 >> 2] = $6; //@line 4191
   sp = STACKTOP; //@line 4192
   return;
  }
  HEAP32[___async_retval >> 2] = $36; //@line 4196
  ___async_unwind = 0; //@line 4197
  HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 4198
  $37 = $ReallocAsyncCtx3 + 4 | 0; //@line 4199
  HEAP32[$37 >> 2] = $2; //@line 4200
  $38 = $ReallocAsyncCtx3 + 8 | 0; //@line 4201
  HEAP32[$38 >> 2] = $$048; //@line 4202
  $39 = $ReallocAsyncCtx3 + 12 | 0; //@line 4203
  HEAP8[$39 >> 0] = $$043; //@line 4204
  $40 = $ReallocAsyncCtx3 + 16 | 0; //@line 4205
  HEAP32[$40 >> 2] = $14; //@line 4206
  $41 = $ReallocAsyncCtx3 + 20 | 0; //@line 4207
  HEAP32[$41 >> 2] = $22; //@line 4208
  $42 = $ReallocAsyncCtx3 + 24 | 0; //@line 4209
  $43 = $42; //@line 4210
  $44 = $43; //@line 4211
  HEAP32[$44 >> 2] = $29; //@line 4212
  $45 = $43 + 4 | 0; //@line 4213
  $46 = $45; //@line 4214
  HEAP32[$46 >> 2] = $30; //@line 4215
  $47 = $ReallocAsyncCtx3 + 32 | 0; //@line 4216
  HEAP32[$47 >> 2] = $4; //@line 4217
  $48 = $ReallocAsyncCtx3 + 36 | 0; //@line 4218
  HEAP32[$48 >> 2] = $6; //@line 4219
  sp = STACKTOP; //@line 4220
  return;
 }
}
function _twoway_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0166 = 0, $$0168 = 0, $$0169 = 0, $$0169$be = 0, $$0170 = 0, $$0175$ph$ph$lcssa216 = 0, $$0175$ph$ph$lcssa216328 = 0, $$0175$ph$ph254 = 0, $$0179242 = 0, $$0183$ph197$ph253 = 0, $$0183$ph197248 = 0, $$0183$ph260 = 0, $$0185$ph$lcssa = 0, $$0185$ph$lcssa327 = 0, $$0185$ph259 = 0, $$0187219$ph325326 = 0, $$0187263 = 0, $$1176$$0175 = 0, $$1176$ph$ph$lcssa208 = 0, $$1176$ph$ph233 = 0, $$1180222 = 0, $$1184$ph193$ph232 = 0, $$1184$ph193227 = 0, $$1184$ph239 = 0, $$1186$$0185 = 0, $$1186$ph$lcssa = 0, $$1186$ph238 = 0, $$2181$sink = 0, $$3 = 0, $$3173 = 0, $$3178 = 0, $$3182221 = 0, $$4 = 0, $$pr = 0, $10 = 0, $105 = 0, $111 = 0, $113 = 0, $118 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $14 = 0, $2 = 0, $23 = 0, $25 = 0, $27 = 0, $3 = 0, $32 = 0, $34 = 0, $37 = 0, $4 = 0, $41 = 0, $45 = 0, $50 = 0, $52 = 0, $53 = 0, $56 = 0, $60 = 0, $68 = 0, $70 = 0, $74 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $83 = 0, $86 = 0, $93 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11484
 STACKTOP = STACKTOP + 1056 | 0; //@line 11485
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(1056); //@line 11485
 $2 = sp + 1024 | 0; //@line 11486
 $3 = sp; //@line 11487
 HEAP32[$2 >> 2] = 0; //@line 11488
 HEAP32[$2 + 4 >> 2] = 0; //@line 11488
 HEAP32[$2 + 8 >> 2] = 0; //@line 11488
 HEAP32[$2 + 12 >> 2] = 0; //@line 11488
 HEAP32[$2 + 16 >> 2] = 0; //@line 11488
 HEAP32[$2 + 20 >> 2] = 0; //@line 11488
 HEAP32[$2 + 24 >> 2] = 0; //@line 11488
 HEAP32[$2 + 28 >> 2] = 0; //@line 11488
 $4 = HEAP8[$1 >> 0] | 0; //@line 11489
 L1 : do {
  if (!($4 << 24 >> 24)) {
   $$0175$ph$ph$lcssa216328 = 1; //@line 11493
   $$0185$ph$lcssa327 = -1; //@line 11493
   $$0187219$ph325326 = 0; //@line 11493
   $$1176$ph$ph$lcssa208 = 1; //@line 11493
   $$1186$ph$lcssa = -1; //@line 11493
   label = 26; //@line 11494
  } else {
   $$0187263 = 0; //@line 11496
   $10 = $4; //@line 11496
   do {
    if (!(HEAP8[$0 + $$0187263 >> 0] | 0)) {
     $$3 = 0; //@line 11502
     break L1;
    }
    $14 = $2 + ((($10 & 255) >>> 5 & 255) << 2) | 0; //@line 11510
    HEAP32[$14 >> 2] = HEAP32[$14 >> 2] | 1 << ($10 & 31); //@line 11513
    $$0187263 = $$0187263 + 1 | 0; //@line 11514
    HEAP32[$3 + (($10 & 255) << 2) >> 2] = $$0187263; //@line 11517
    $10 = HEAP8[$1 + $$0187263 >> 0] | 0; //@line 11519
   } while ($10 << 24 >> 24 != 0);
   $23 = $$0187263 >>> 0 > 1; //@line 11527
   if ($23) {
    $$0183$ph260 = 0; //@line 11529
    $$0185$ph259 = -1; //@line 11529
    $130 = 1; //@line 11529
    L6 : while (1) {
     $$0175$ph$ph254 = 1; //@line 11531
     $$0183$ph197$ph253 = $$0183$ph260; //@line 11531
     $131 = $130; //@line 11531
     while (1) {
      $$0183$ph197248 = $$0183$ph197$ph253; //@line 11533
      $132 = $131; //@line 11533
      L10 : while (1) {
       $$0179242 = 1; //@line 11535
       $25 = $132; //@line 11535
       while (1) {
        $32 = HEAP8[$1 + ($$0179242 + $$0185$ph259) >> 0] | 0; //@line 11539
        $34 = HEAP8[$1 + $25 >> 0] | 0; //@line 11541
        if ($32 << 24 >> 24 != $34 << 24 >> 24) {
         break L10;
        }
        if (($$0179242 | 0) == ($$0175$ph$ph254 | 0)) {
         break;
        }
        $$0179242 = $$0179242 + 1 | 0; //@line 11547
        $27 = $$0179242 + $$0183$ph197248 | 0; //@line 11551
        if ($27 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 11556
         $$0185$ph$lcssa = $$0185$ph259; //@line 11556
         break L6;
        } else {
         $25 = $27; //@line 11554
        }
       }
       $37 = $$0175$ph$ph254 + $$0183$ph197248 | 0; //@line 11560
       $132 = $37 + 1 | 0; //@line 11561
       if ($132 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 11566
        $$0185$ph$lcssa = $$0185$ph259; //@line 11566
        break L6;
       } else {
        $$0183$ph197248 = $37; //@line 11564
       }
      }
      $41 = $25 - $$0185$ph259 | 0; //@line 11571
      if (($32 & 255) <= ($34 & 255)) {
       break;
      }
      $131 = $25 + 1 | 0; //@line 11575
      if ($131 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216 = $41; //@line 11580
       $$0185$ph$lcssa = $$0185$ph259; //@line 11580
       break L6;
      } else {
       $$0175$ph$ph254 = $41; //@line 11578
       $$0183$ph197$ph253 = $25; //@line 11578
      }
     }
     $130 = $$0183$ph197248 + 2 | 0; //@line 11585
     if ($130 >>> 0 >= $$0187263 >>> 0) {
      $$0175$ph$ph$lcssa216 = 1; //@line 11590
      $$0185$ph$lcssa = $$0183$ph197248; //@line 11590
      break;
     } else {
      $$0183$ph260 = $$0183$ph197248 + 1 | 0; //@line 11588
      $$0185$ph259 = $$0183$ph197248; //@line 11588
     }
    }
    if ($23) {
     $$1184$ph239 = 0; //@line 11595
     $$1186$ph238 = -1; //@line 11595
     $133 = 1; //@line 11595
     while (1) {
      $$1176$ph$ph233 = 1; //@line 11597
      $$1184$ph193$ph232 = $$1184$ph239; //@line 11597
      $135 = $133; //@line 11597
      while (1) {
       $$1184$ph193227 = $$1184$ph193$ph232; //@line 11599
       $134 = $135; //@line 11599
       L25 : while (1) {
        $$1180222 = 1; //@line 11601
        $52 = $134; //@line 11601
        while (1) {
         $50 = HEAP8[$1 + ($$1180222 + $$1186$ph238) >> 0] | 0; //@line 11605
         $53 = HEAP8[$1 + $52 >> 0] | 0; //@line 11607
         if ($50 << 24 >> 24 != $53 << 24 >> 24) {
          break L25;
         }
         if (($$1180222 | 0) == ($$1176$ph$ph233 | 0)) {
          break;
         }
         $$1180222 = $$1180222 + 1 | 0; //@line 11613
         $45 = $$1180222 + $$1184$ph193227 | 0; //@line 11617
         if ($45 >>> 0 >= $$0187263 >>> 0) {
          $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11622
          $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11622
          $$0187219$ph325326 = $$0187263; //@line 11622
          $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 11622
          $$1186$ph$lcssa = $$1186$ph238; //@line 11622
          label = 26; //@line 11623
          break L1;
         } else {
          $52 = $45; //@line 11620
         }
        }
        $56 = $$1176$ph$ph233 + $$1184$ph193227 | 0; //@line 11627
        $134 = $56 + 1 | 0; //@line 11628
        if ($134 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11633
         $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11633
         $$0187219$ph325326 = $$0187263; //@line 11633
         $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 11633
         $$1186$ph$lcssa = $$1186$ph238; //@line 11633
         label = 26; //@line 11634
         break L1;
        } else {
         $$1184$ph193227 = $56; //@line 11631
        }
       }
       $60 = $52 - $$1186$ph238 | 0; //@line 11639
       if (($50 & 255) >= ($53 & 255)) {
        break;
       }
       $135 = $52 + 1 | 0; //@line 11643
       if ($135 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11648
        $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11648
        $$0187219$ph325326 = $$0187263; //@line 11648
        $$1176$ph$ph$lcssa208 = $60; //@line 11648
        $$1186$ph$lcssa = $$1186$ph238; //@line 11648
        label = 26; //@line 11649
        break L1;
       } else {
        $$1176$ph$ph233 = $60; //@line 11646
        $$1184$ph193$ph232 = $52; //@line 11646
       }
      }
      $133 = $$1184$ph193227 + 2 | 0; //@line 11654
      if ($133 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11659
       $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11659
       $$0187219$ph325326 = $$0187263; //@line 11659
       $$1176$ph$ph$lcssa208 = 1; //@line 11659
       $$1186$ph$lcssa = $$1184$ph193227; //@line 11659
       label = 26; //@line 11660
       break;
      } else {
       $$1184$ph239 = $$1184$ph193227 + 1 | 0; //@line 11657
       $$1186$ph238 = $$1184$ph193227; //@line 11657
      }
     }
    } else {
     $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11665
     $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11665
     $$0187219$ph325326 = $$0187263; //@line 11665
     $$1176$ph$ph$lcssa208 = 1; //@line 11665
     $$1186$ph$lcssa = -1; //@line 11665
     label = 26; //@line 11666
    }
   } else {
    $$0175$ph$ph$lcssa216328 = 1; //@line 11669
    $$0185$ph$lcssa327 = -1; //@line 11669
    $$0187219$ph325326 = $$0187263; //@line 11669
    $$1176$ph$ph$lcssa208 = 1; //@line 11669
    $$1186$ph$lcssa = -1; //@line 11669
    label = 26; //@line 11670
   }
  }
 } while (0);
 L35 : do {
  if ((label | 0) == 26) {
   $68 = ($$1186$ph$lcssa + 1 | 0) >>> 0 > ($$0185$ph$lcssa327 + 1 | 0) >>> 0; //@line 11678
   $$1176$$0175 = $68 ? $$1176$ph$ph$lcssa208 : $$0175$ph$ph$lcssa216328; //@line 11679
   $$1186$$0185 = $68 ? $$1186$ph$lcssa : $$0185$ph$lcssa327; //@line 11680
   $70 = $$1186$$0185 + 1 | 0; //@line 11682
   if (!(_memcmp($1, $1 + $$1176$$0175 | 0, $70) | 0)) {
    $$0168 = $$0187219$ph325326 - $$1176$$0175 | 0; //@line 11687
    $$3178 = $$1176$$0175; //@line 11687
   } else {
    $74 = $$0187219$ph325326 - $$1186$$0185 + -1 | 0; //@line 11690
    $$0168 = 0; //@line 11694
    $$3178 = ($$1186$$0185 >>> 0 > $74 >>> 0 ? $$1186$$0185 : $74) + 1 | 0; //@line 11694
   }
   $78 = $$0187219$ph325326 | 63; //@line 11696
   $79 = $$0187219$ph325326 + -1 | 0; //@line 11697
   $80 = ($$0168 | 0) != 0; //@line 11698
   $81 = $$0187219$ph325326 - $$3178 | 0; //@line 11699
   $$0166 = $0; //@line 11700
   $$0169 = 0; //@line 11700
   $$0170 = $0; //@line 11700
   while (1) {
    $83 = $$0166; //@line 11703
    do {
     if (($$0170 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
      $86 = _memchr($$0170, 0, $78) | 0; //@line 11708
      if (!$86) {
       $$3173 = $$0170 + $78 | 0; //@line 11712
       break;
      } else {
       if (($86 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
        $$3 = 0; //@line 11719
        break L35;
       } else {
        $$3173 = $86; //@line 11722
        break;
       }
      }
     } else {
      $$3173 = $$0170; //@line 11727
     }
    } while (0);
    $93 = HEAP8[$$0166 + $79 >> 0] | 0; //@line 11731
    L49 : do {
     if (!(1 << ($93 & 31) & HEAP32[$2 + ((($93 & 255) >>> 5 & 255) << 2) >> 2])) {
      $$0169$be = 0; //@line 11743
      $$2181$sink = $$0187219$ph325326; //@line 11743
     } else {
      $105 = $$0187219$ph325326 - (HEAP32[$3 + (($93 & 255) << 2) >> 2] | 0) | 0; //@line 11748
      if ($105 | 0) {
       $$0169$be = 0; //@line 11756
       $$2181$sink = $80 & ($$0169 | 0) != 0 & $105 >>> 0 < $$3178 >>> 0 ? $81 : $105; //@line 11756
       break;
      }
      $111 = $70 >>> 0 > $$0169 >>> 0 ? $70 : $$0169; //@line 11760
      $113 = HEAP8[$1 + $111 >> 0] | 0; //@line 11762
      L54 : do {
       if (!($113 << 24 >> 24)) {
        $$4 = $70; //@line 11766
       } else {
        $$3182221 = $111; //@line 11768
        $$pr = $113; //@line 11768
        while (1) {
         if ($$pr << 24 >> 24 != (HEAP8[$$0166 + $$3182221 >> 0] | 0)) {
          break;
         }
         $118 = $$3182221 + 1 | 0; //@line 11776
         $$pr = HEAP8[$1 + $118 >> 0] | 0; //@line 11778
         if (!($$pr << 24 >> 24)) {
          $$4 = $70; //@line 11781
          break L54;
         } else {
          $$3182221 = $118; //@line 11784
         }
        }
        $$0169$be = 0; //@line 11788
        $$2181$sink = $$3182221 - $$1186$$0185 | 0; //@line 11788
        break L49;
       }
      } while (0);
      while (1) {
       if ($$4 >>> 0 <= $$0169 >>> 0) {
        $$3 = $$0166; //@line 11795
        break L35;
       }
       $$4 = $$4 + -1 | 0; //@line 11798
       if ((HEAP8[$1 + $$4 >> 0] | 0) != (HEAP8[$$0166 + $$4 >> 0] | 0)) {
        $$0169$be = $$0168; //@line 11807
        $$2181$sink = $$3178; //@line 11807
        break;
       }
      }
     }
    } while (0);
    $$0166 = $$0166 + $$2181$sink | 0; //@line 11814
    $$0169 = $$0169$be; //@line 11814
    $$0170 = $$3173; //@line 11814
   }
  }
 } while (0);
 STACKTOP = sp; //@line 11818
 return $$3 | 0; //@line 11818
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13288
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 13294
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 13303
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 13308
      $19 = $1 + 44 | 0; //@line 13309
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 13318
      $26 = $1 + 52 | 0; //@line 13319
      $27 = $1 + 53 | 0; //@line 13320
      $28 = $1 + 54 | 0; //@line 13321
      $29 = $0 + 8 | 0; //@line 13322
      $30 = $1 + 24 | 0; //@line 13323
      $$081$off0 = 0; //@line 13324
      $$084 = $0 + 16 | 0; //@line 13324
      $$085$off0 = 0; //@line 13324
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 13328
        label = 20; //@line 13329
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 13332
       HEAP8[$27 >> 0] = 0; //@line 13333
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 13334
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 13335
       if (___async) {
        label = 12; //@line 13338
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 13341
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 13345
        label = 20; //@line 13346
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 13353
         $$186$off0 = $$085$off0; //@line 13353
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 13362
           label = 20; //@line 13363
           break L10;
          } else {
           $$182$off0 = 1; //@line 13366
           $$186$off0 = $$085$off0; //@line 13366
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 13373
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 13380
          break L10;
         } else {
          $$182$off0 = 1; //@line 13383
          $$186$off0 = 1; //@line 13383
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 13388
       $$084 = $$084 + 8 | 0; //@line 13388
       $$085$off0 = $$186$off0; //@line 13388
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 157; //@line 13391
       HEAP32[$AsyncCtx15 + 4 >> 2] = $27; //@line 13393
       HEAP32[$AsyncCtx15 + 8 >> 2] = $26; //@line 13395
       HEAP32[$AsyncCtx15 + 12 >> 2] = $25; //@line 13397
       HEAP32[$AsyncCtx15 + 16 >> 2] = $1; //@line 13399
       HEAP32[$AsyncCtx15 + 20 >> 2] = $2; //@line 13401
       HEAP8[$AsyncCtx15 + 24 >> 0] = $4 & 1; //@line 13404
       HEAP32[$AsyncCtx15 + 28 >> 2] = $30; //@line 13406
       HEAP32[$AsyncCtx15 + 32 >> 2] = $28; //@line 13408
       HEAP8[$AsyncCtx15 + 36 >> 0] = $$081$off0 & 1; //@line 13411
       HEAP8[$AsyncCtx15 + 37 >> 0] = $$085$off0 & 1; //@line 13414
       HEAP32[$AsyncCtx15 + 40 >> 2] = $13; //@line 13416
       HEAP32[$AsyncCtx15 + 44 >> 2] = $29; //@line 13418
       HEAP32[$AsyncCtx15 + 48 >> 2] = $$084; //@line 13420
       HEAP32[$AsyncCtx15 + 52 >> 2] = $19; //@line 13422
       sp = STACKTOP; //@line 13423
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 13429
         $61 = $1 + 40 | 0; //@line 13430
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 13433
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 13441
           if ($$283$off0) {
            label = 25; //@line 13443
            break;
           } else {
            $69 = 4; //@line 13446
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 13453
        } else {
         $69 = 4; //@line 13455
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 13460
      }
      HEAP32[$19 >> 2] = $69; //@line 13462
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 13471
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 13476
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 13477
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 13478
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 13479
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 158; //@line 13482
    HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 13484
    HEAP32[$AsyncCtx11 + 8 >> 2] = $72; //@line 13486
    HEAP32[$AsyncCtx11 + 12 >> 2] = $73; //@line 13488
    HEAP32[$AsyncCtx11 + 16 >> 2] = $1; //@line 13490
    HEAP32[$AsyncCtx11 + 20 >> 2] = $2; //@line 13492
    HEAP32[$AsyncCtx11 + 24 >> 2] = $3; //@line 13494
    HEAP8[$AsyncCtx11 + 28 >> 0] = $4 & 1; //@line 13497
    sp = STACKTOP; //@line 13498
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 13501
   $81 = $0 + 24 | 0; //@line 13502
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 13506
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 13510
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 13517
       $$2 = $81; //@line 13518
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 13530
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 13531
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 13536
        $136 = $$2 + 8 | 0; //@line 13537
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 13540
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 161; //@line 13545
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 13547
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 13549
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 13551
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 13553
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 13555
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 13557
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 13559
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 13562
       sp = STACKTOP; //@line 13563
       return;
      }
      $104 = $1 + 24 | 0; //@line 13566
      $105 = $1 + 54 | 0; //@line 13567
      $$1 = $81; //@line 13568
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 13584
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 13585
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13590
       $122 = $$1 + 8 | 0; //@line 13591
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 13594
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 160; //@line 13599
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 13601
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 13603
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 13605
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 13607
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 13609
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 13611
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 13613
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 13615
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 13618
      sp = STACKTOP; //@line 13619
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 13623
    $$0 = $81; //@line 13624
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 13631
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 13632
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 13637
     $100 = $$0 + 8 | 0; //@line 13638
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 13641
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 159; //@line 13646
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 13648
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 13650
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 13652
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 13654
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 13656
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 13658
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 13661
    sp = STACKTOP; //@line 13662
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
 $n_sroa_0_0_extract_trunc = $a$0; //@line 6341
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 6342
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 6343
 $d_sroa_0_0_extract_trunc = $b$0; //@line 6344
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 6345
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 6346
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 6348
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 6351
    HEAP32[$rem + 4 >> 2] = 0; //@line 6352
   }
   $_0$1 = 0; //@line 6354
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 6355
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6356
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 6359
    $_0$0 = 0; //@line 6360
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6361
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 6363
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 6364
   $_0$1 = 0; //@line 6365
   $_0$0 = 0; //@line 6366
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6367
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 6370
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 6375
     HEAP32[$rem + 4 >> 2] = 0; //@line 6376
    }
    $_0$1 = 0; //@line 6378
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 6379
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6380
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 6384
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 6385
    }
    $_0$1 = 0; //@line 6387
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 6388
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6389
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 6391
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 6394
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 6395
    }
    $_0$1 = 0; //@line 6397
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 6398
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6399
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 6402
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 6404
    $58 = 31 - $51 | 0; //@line 6405
    $sr_1_ph = $57; //@line 6406
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 6407
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 6408
    $q_sroa_0_1_ph = 0; //@line 6409
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 6410
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 6414
    $_0$0 = 0; //@line 6415
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6416
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 6418
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 6419
   $_0$1 = 0; //@line 6420
   $_0$0 = 0; //@line 6421
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6422
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 6426
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 6428
     $126 = 31 - $119 | 0; //@line 6429
     $130 = $119 - 31 >> 31; //@line 6430
     $sr_1_ph = $125; //@line 6431
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 6432
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 6433
     $q_sroa_0_1_ph = 0; //@line 6434
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 6435
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 6439
     $_0$0 = 0; //@line 6440
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6441
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 6443
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 6444
    $_0$1 = 0; //@line 6445
    $_0$0 = 0; //@line 6446
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6447
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 6449
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 6452
    $89 = 64 - $88 | 0; //@line 6453
    $91 = 32 - $88 | 0; //@line 6454
    $92 = $91 >> 31; //@line 6455
    $95 = $88 - 32 | 0; //@line 6456
    $105 = $95 >> 31; //@line 6457
    $sr_1_ph = $88; //@line 6458
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 6459
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 6460
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 6461
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 6462
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 6466
    HEAP32[$rem + 4 >> 2] = 0; //@line 6467
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 6470
    $_0$0 = $a$0 | 0 | 0; //@line 6471
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6472
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 6474
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 6475
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 6476
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6477
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 6482
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 6483
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 6484
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 6485
  $carry_0_lcssa$1 = 0; //@line 6486
  $carry_0_lcssa$0 = 0; //@line 6487
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 6489
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 6490
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 6491
  $137$1 = tempRet0; //@line 6492
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 6493
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 6494
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 6495
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 6496
  $sr_1202 = $sr_1_ph; //@line 6497
  $carry_0203 = 0; //@line 6498
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 6500
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 6501
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 6502
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 6503
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 6504
   $150$1 = tempRet0; //@line 6505
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 6506
   $carry_0203 = $151$0 & 1; //@line 6507
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 6509
   $r_sroa_1_1200 = tempRet0; //@line 6510
   $sr_1202 = $sr_1202 - 1 | 0; //@line 6511
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 6523
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 6524
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 6525
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 6526
  $carry_0_lcssa$1 = 0; //@line 6527
  $carry_0_lcssa$0 = $carry_0203; //@line 6528
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 6530
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 6531
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 6534
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 6535
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 6537
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 6538
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6539
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
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 2321
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 2323
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 2325
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
 var $$0$i = 0, $100 = 0, $102 = 0, $107 = 0, $110 = 0, $112 = 0, $115 = 0, $116 = 0, $118 = 0, $12 = 0, $121 = 0, $129 = 0, $130 = 0, $131 = 0, $133 = 0, $135 = 0, $140 = 0, $147 = 0, $151 = 0, $154 = 0, $156 = 0, $159 = 0, $161 = 0, $168 = 0, $169 = 0, $17 = 0, $172 = 0, $174 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $187 = 0, $19 = 0, $190 = 0, $2 = 0, $22 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $31 = 0, $33 = 0, $34 = 0, $40 = 0, $41 = 0, $42 = 0, $51 = 0, $52 = 0, $53 = 0, $55 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $72 = 0, $73 = 0, $74 = 0, $8 = 0, $83 = 0, $84 = 0, $85 = 0, $87 = 0, $9 = 0, $91 = 0, $92 = 0, $98 = 0, $99 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2695
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2697
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2701
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2703
 $8 = HEAP32[HEAP32[$0 + 8 >> 2] >> 2] | 0; //@line 2704
 $9 = $8 + 32 | 0; //@line 2705
 if (($AsyncRetVal | 0) != (HEAP32[$9 >> 2] | 0)) {
  $12 = $2 + 32 | 0; //@line 2709
  $17 = $AsyncRetVal - (HEAP32[$12 >> 2] | 0) & HEAP32[$2 + 12 >> 2]; //@line 2714
  HEAP32[$12 >> 2] = $AsyncRetVal; //@line 2715
  $19 = HEAP32[$2 + 8 >> 2] | 0; //@line 2717
  do {
   if (($19 | 0) == 1e6) {
    $98 = $17; //@line 2721
    $99 = 0; //@line 2721
   } else {
    $22 = HEAP8[$2 + 57 >> 0] | 0; //@line 2724
    $24 = ___muldi3($17 | 0, 0, 1e6, 0) | 0; //@line 2726
    $25 = tempRet0; //@line 2727
    if (!($22 << 24 >> 24)) {
     $59 = ___udivdi3($24 | 0, $25 | 0, $19 | 0, 0) | 0; //@line 2729
     $60 = tempRet0; //@line 2730
     $61 = ___muldi3($59 | 0, $60 | 0, $19 | 0, 0) | 0; //@line 2731
     $63 = _i64Subtract($24 | 0, $25 | 0, $61 | 0, tempRet0 | 0) | 0; //@line 2733
     $65 = $2 + 40 | 0; //@line 2735
     $66 = $65; //@line 2736
     $72 = _i64Add($63 | 0, tempRet0 | 0, HEAP32[$66 >> 2] | 0, HEAP32[$66 + 4 >> 2] | 0) | 0; //@line 2742
     $73 = tempRet0; //@line 2743
     $74 = $65; //@line 2744
     HEAP32[$74 >> 2] = $72; //@line 2746
     HEAP32[$74 + 4 >> 2] = $73; //@line 2749
     if ($73 >>> 0 < 0 | ($73 | 0) == 0 & $72 >>> 0 < $19 >>> 0) {
      $98 = $59; //@line 2756
      $99 = $60; //@line 2756
      break;
     }
     $83 = _i64Add($59 | 0, $60 | 0, 1, 0) | 0; //@line 2759
     $84 = tempRet0; //@line 2760
     $85 = _i64Subtract($72 | 0, $73 | 0, $19 | 0, 0) | 0; //@line 2761
     $87 = $65; //@line 2763
     HEAP32[$87 >> 2] = $85; //@line 2765
     HEAP32[$87 + 4 >> 2] = tempRet0; //@line 2768
     $98 = $83; //@line 2769
     $99 = $84; //@line 2769
     break;
    } else {
     $26 = $22 & 255; //@line 2772
     $27 = _bitshift64Lshr($24 | 0, $25 | 0, $26 | 0) | 0; //@line 2773
     $28 = tempRet0; //@line 2774
     $29 = _bitshift64Shl($27 | 0, $28 | 0, $26 | 0) | 0; //@line 2775
     $31 = _i64Subtract($24 | 0, $25 | 0, $29 | 0, tempRet0 | 0) | 0; //@line 2777
     $33 = $2 + 40 | 0; //@line 2779
     $34 = $33; //@line 2780
     $40 = _i64Add(HEAP32[$34 >> 2] | 0, HEAP32[$34 + 4 >> 2] | 0, $31 | 0, tempRet0 | 0) | 0; //@line 2786
     $41 = tempRet0; //@line 2787
     $42 = $33; //@line 2788
     HEAP32[$42 >> 2] = $40; //@line 2790
     HEAP32[$42 + 4 >> 2] = $41; //@line 2793
     if ($41 >>> 0 < 0 | ($41 | 0) == 0 & $40 >>> 0 < $19 >>> 0) {
      $98 = $27; //@line 2800
      $99 = $28; //@line 2800
      break;
     }
     $51 = _i64Add($27 | 0, $28 | 0, 1, 0) | 0; //@line 2803
     $52 = tempRet0; //@line 2804
     $53 = _i64Subtract($40 | 0, $41 | 0, $19 | 0, 0) | 0; //@line 2805
     $55 = $33; //@line 2807
     HEAP32[$55 >> 2] = $53; //@line 2809
     HEAP32[$55 + 4 >> 2] = tempRet0; //@line 2812
     $98 = $51; //@line 2813
     $99 = $52; //@line 2813
     break;
    }
   }
  } while (0);
  $91 = $2 + 48 | 0; //@line 2818
  $92 = $91; //@line 2819
  $100 = _i64Add(HEAP32[$92 >> 2] | 0, HEAP32[$92 + 4 >> 2] | 0, $98 | 0, $99 | 0) | 0; //@line 2825
  $102 = $91; //@line 2827
  HEAP32[$102 >> 2] = $100; //@line 2829
  HEAP32[$102 + 4 >> 2] = tempRet0; //@line 2832
 }
 $107 = HEAP32[$8 + 4 >> 2] | 0; //@line 2835
 if (!$107) {
  $187 = (HEAP32[$2 + 16 >> 2] | 0) + (HEAP32[$2 + 32 >> 2] | 0) & HEAP32[$2 + 12 >> 2]; //@line 2845
  $190 = HEAP32[(HEAP32[$6 >> 2] | 0) + 16 >> 2] | 0; //@line 2848
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 2849
  FUNCTION_TABLE_vi[$190 & 255]($187); //@line 2850
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 73; //@line 2853
   sp = STACKTOP; //@line 2854
   return;
  }
  ___async_unwind = 0; //@line 2857
  HEAP32[$ReallocAsyncCtx7 >> 2] = 73; //@line 2858
  sp = STACKTOP; //@line 2859
  return;
 }
 $110 = $8 + 48 | 0; //@line 2863
 $112 = HEAP32[$110 >> 2] | 0; //@line 2865
 $115 = HEAP32[$110 + 4 >> 2] | 0; //@line 2868
 $116 = $107; //@line 2869
 $118 = HEAP32[$116 >> 2] | 0; //@line 2871
 $121 = HEAP32[$116 + 4 >> 2] | 0; //@line 2874
 if (!($121 >>> 0 > $115 >>> 0 | ($121 | 0) == ($115 | 0) & $118 >>> 0 > $112 >>> 0)) {
  $129 = HEAP32[(HEAP32[$6 >> 2] | 0) + 20 >> 2] | 0; //@line 2883
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 2884
  FUNCTION_TABLE_v[$129 & 15](); //@line 2885
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 68; //@line 2888
   sp = STACKTOP; //@line 2889
   return;
  }
  ___async_unwind = 0; //@line 2892
  HEAP32[$ReallocAsyncCtx2 >> 2] = 68; //@line 2893
  sp = STACKTOP; //@line 2894
  return;
 }
 $130 = _i64Subtract($118 | 0, $121 | 0, $112 | 0, $115 | 0) | 0; //@line 2897
 $131 = tempRet0; //@line 2898
 $133 = HEAP32[$8 + 16 >> 2] | 0; //@line 2900
 $135 = $8 + 24 | 0; //@line 2902
 $140 = HEAP32[$135 + 4 >> 2] | 0; //@line 2907
 do {
  if ($131 >>> 0 > $140 >>> 0 | (($131 | 0) == ($140 | 0) ? $130 >>> 0 > (HEAP32[$135 >> 2] | 0) >>> 0 : 0)) {
   $$0$i = $133; //@line 2915
  } else {
   $147 = HEAP32[$8 + 8 >> 2] | 0; //@line 2918
   if (($147 | 0) == 1e6) {
    $$0$i = $133 >>> 0 < $130 >>> 0 ? $133 : $130; //@line 2923
    break;
   }
   $151 = HEAP8[$8 + 57 >> 0] | 0; //@line 2927
   if (!($151 << 24 >> 24)) {
    $159 = ___muldi3($130 | 0, $131 | 0, $147 | 0, 0) | 0; //@line 2930
    $161 = ___udivdi3($159 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 2932
    $$0$i = $133 >>> 0 < $161 >>> 0 ? $133 : $161; //@line 2936
    break;
   } else {
    $154 = _bitshift64Shl($130 | 0, $131 | 0, $151 & 255 | 0) | 0; //@line 2940
    $156 = ___udivdi3($154 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 2942
    $$0$i = $133 >>> 0 < $156 >>> 0 ? $133 : $156; //@line 2946
    break;
   }
  }
 } while (0);
 $168 = (HEAP32[$9 >> 2] | 0) + $$0$i & HEAP32[$8 + 12 >> 2]; //@line 2955
 $169 = $2 + 32 | 0; //@line 2956
 $172 = HEAP32[$6 >> 2] | 0; //@line 2959
 if (($168 | 0) == (HEAP32[$169 >> 2] | 0)) {
  $174 = HEAP32[$172 + 20 >> 2] | 0; //@line 2962
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 2963
  FUNCTION_TABLE_v[$174 & 15](); //@line 2964
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 69; //@line 2967
   sp = STACKTOP; //@line 2968
   return;
  }
  ___async_unwind = 0; //@line 2971
  HEAP32[$ReallocAsyncCtx3 >> 2] = 69; //@line 2972
  sp = STACKTOP; //@line 2973
  return;
 } else {
  $176 = HEAP32[$172 + 16 >> 2] | 0; //@line 2977
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 2978
  FUNCTION_TABLE_vi[$176 & 255]($168); //@line 2979
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 70; //@line 2982
   $177 = $ReallocAsyncCtx4 + 4 | 0; //@line 2983
   HEAP32[$177 >> 2] = $6; //@line 2984
   $178 = $ReallocAsyncCtx4 + 8 | 0; //@line 2985
   HEAP32[$178 >> 2] = $169; //@line 2986
   $179 = $ReallocAsyncCtx4 + 12 | 0; //@line 2987
   HEAP32[$179 >> 2] = $168; //@line 2988
   sp = STACKTOP; //@line 2989
   return;
  }
  ___async_unwind = 0; //@line 2992
  HEAP32[$ReallocAsyncCtx4 >> 2] = 70; //@line 2993
  $177 = $ReallocAsyncCtx4 + 4 | 0; //@line 2994
  HEAP32[$177 >> 2] = $6; //@line 2995
  $178 = $ReallocAsyncCtx4 + 8 | 0; //@line 2996
  HEAP32[$178 >> 2] = $169; //@line 2997
  $179 = $ReallocAsyncCtx4 + 12 | 0; //@line 2998
  HEAP32[$179 >> 2] = $168; //@line 2999
  sp = STACKTOP; //@line 3000
  return;
 }
}
function _main() {
 var $0 = 0, $1 = 0, $13 = 0, $17 = 0, $2 = 0, $22 = 0, $25 = 0, $29 = 0, $33 = 0, $37 = 0, $40 = 0, $43 = 0, $47 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx22 = 0, $AsyncCtx25 = 0, $AsyncCtx28 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 3649
 STACKTOP = STACKTOP + 48 | 0; //@line 3650
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 3650
 $0 = sp + 32 | 0; //@line 3651
 $1 = sp + 16 | 0; //@line 3652
 $2 = sp; //@line 3653
 $AsyncCtx19 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3654
 _puts(2389) | 0; //@line 3655
 if (___async) {
  HEAP32[$AsyncCtx19 >> 2] = 112; //@line 3658
  HEAP32[$AsyncCtx19 + 4 >> 2] = $1; //@line 3660
  HEAP32[$AsyncCtx19 + 8 >> 2] = $2; //@line 3662
  HEAP32[$AsyncCtx19 + 12 >> 2] = $0; //@line 3664
  sp = STACKTOP; //@line 3665
  STACKTOP = sp; //@line 3666
  return 0; //@line 3666
 }
 _emscripten_free_async_context($AsyncCtx19 | 0); //@line 3668
 $AsyncCtx15 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3669
 _puts(2402) | 0; //@line 3670
 if (___async) {
  HEAP32[$AsyncCtx15 >> 2] = 113; //@line 3673
  HEAP32[$AsyncCtx15 + 4 >> 2] = $1; //@line 3675
  HEAP32[$AsyncCtx15 + 8 >> 2] = $2; //@line 3677
  HEAP32[$AsyncCtx15 + 12 >> 2] = $0; //@line 3679
  sp = STACKTOP; //@line 3680
  STACKTOP = sp; //@line 3681
  return 0; //@line 3681
 }
 _emscripten_free_async_context($AsyncCtx15 | 0); //@line 3683
 $AsyncCtx11 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3684
 _puts(2505) | 0; //@line 3685
 if (___async) {
  HEAP32[$AsyncCtx11 >> 2] = 114; //@line 3688
  HEAP32[$AsyncCtx11 + 4 >> 2] = $1; //@line 3690
  HEAP32[$AsyncCtx11 + 8 >> 2] = $2; //@line 3692
  HEAP32[$AsyncCtx11 + 12 >> 2] = $0; //@line 3694
  sp = STACKTOP; //@line 3695
  STACKTOP = sp; //@line 3696
  return 0; //@line 3696
 }
 _emscripten_free_async_context($AsyncCtx11 | 0); //@line 3698
 $13 = $0 + 4 | 0; //@line 3700
 HEAP32[$13 >> 2] = 0; //@line 3702
 HEAP32[$13 + 4 >> 2] = 0; //@line 3705
 HEAP32[$0 >> 2] = 7; //@line 3706
 $17 = $0 + 12 | 0; //@line 3707
 HEAP32[$17 >> 2] = 384; //@line 3708
 $AsyncCtx25 = _emscripten_alloc_async_context(20, sp) | 0; //@line 3709
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5608, $0, 1.0); //@line 3710
 if (___async) {
  HEAP32[$AsyncCtx25 >> 2] = 115; //@line 3713
  HEAP32[$AsyncCtx25 + 4 >> 2] = $1; //@line 3715
  HEAP32[$AsyncCtx25 + 8 >> 2] = $2; //@line 3717
  HEAP32[$AsyncCtx25 + 12 >> 2] = $0; //@line 3719
  HEAP32[$AsyncCtx25 + 16 >> 2] = $17; //@line 3721
  sp = STACKTOP; //@line 3722
  STACKTOP = sp; //@line 3723
  return 0; //@line 3723
 }
 _emscripten_free_async_context($AsyncCtx25 | 0); //@line 3725
 $22 = HEAP32[$17 >> 2] | 0; //@line 3726
 do {
  if ($22 | 0) {
   $25 = HEAP32[$22 + 8 >> 2] | 0; //@line 3731
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 3732
   FUNCTION_TABLE_vi[$25 & 255]($0); //@line 3733
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 116; //@line 3736
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 3738
    HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 3740
    sp = STACKTOP; //@line 3741
    STACKTOP = sp; //@line 3742
    return 0; //@line 3742
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 3744
    break;
   }
  }
 } while (0);
 $29 = $1 + 4 | 0; //@line 3750
 HEAP32[$29 >> 2] = 0; //@line 3752
 HEAP32[$29 + 4 >> 2] = 0; //@line 3755
 HEAP32[$1 >> 2] = 8; //@line 3756
 $33 = $1 + 12 | 0; //@line 3757
 HEAP32[$33 >> 2] = 384; //@line 3758
 $AsyncCtx22 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3759
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5672, $1, 2.5); //@line 3760
 if (___async) {
  HEAP32[$AsyncCtx22 >> 2] = 117; //@line 3763
  HEAP32[$AsyncCtx22 + 4 >> 2] = $33; //@line 3765
  HEAP32[$AsyncCtx22 + 8 >> 2] = $2; //@line 3767
  HEAP32[$AsyncCtx22 + 12 >> 2] = $1; //@line 3769
  sp = STACKTOP; //@line 3770
  STACKTOP = sp; //@line 3771
  return 0; //@line 3771
 }
 _emscripten_free_async_context($AsyncCtx22 | 0); //@line 3773
 $37 = HEAP32[$33 >> 2] | 0; //@line 3774
 do {
  if ($37 | 0) {
   $40 = HEAP32[$37 + 8 >> 2] | 0; //@line 3779
   $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3780
   FUNCTION_TABLE_vi[$40 & 255]($1); //@line 3781
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 118; //@line 3784
    HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 3786
    sp = STACKTOP; //@line 3787
    STACKTOP = sp; //@line 3788
    return 0; //@line 3788
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3790
    break;
   }
  }
 } while (0);
 $43 = $2 + 4 | 0; //@line 3796
 HEAP32[$43 >> 2] = 0; //@line 3798
 HEAP32[$43 + 4 >> 2] = 0; //@line 3801
 HEAP32[$2 >> 2] = 9; //@line 3802
 $47 = $2 + 12 | 0; //@line 3803
 HEAP32[$47 >> 2] = 384; //@line 3804
 $AsyncCtx28 = _emscripten_alloc_async_context(12, sp) | 0; //@line 3805
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5824, $2); //@line 3806
 if (___async) {
  HEAP32[$AsyncCtx28 >> 2] = 119; //@line 3809
  HEAP32[$AsyncCtx28 + 4 >> 2] = $47; //@line 3811
  HEAP32[$AsyncCtx28 + 8 >> 2] = $2; //@line 3813
  sp = STACKTOP; //@line 3814
  STACKTOP = sp; //@line 3815
  return 0; //@line 3815
 }
 _emscripten_free_async_context($AsyncCtx28 | 0); //@line 3817
 $50 = HEAP32[$47 >> 2] | 0; //@line 3818
 do {
  if ($50 | 0) {
   $53 = HEAP32[$50 + 8 >> 2] | 0; //@line 3823
   $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3824
   FUNCTION_TABLE_vi[$53 & 255]($2); //@line 3825
   if (___async) {
    HEAP32[$AsyncCtx7 >> 2] = 120; //@line 3828
    sp = STACKTOP; //@line 3829
    STACKTOP = sp; //@line 3830
    return 0; //@line 3830
   } else {
    _emscripten_free_async_context($AsyncCtx7 | 0); //@line 3832
    break;
   }
  }
 } while (0);
 $AsyncCtx31 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3837
 _wait_ms(-1); //@line 3838
 if (___async) {
  HEAP32[$AsyncCtx31 >> 2] = 121; //@line 3841
  sp = STACKTOP; //@line 3842
  STACKTOP = sp; //@line 3843
  return 0; //@line 3843
 } else {
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 3845
  STACKTOP = sp; //@line 3846
  return 0; //@line 3846
 }
 return 0; //@line 3848
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0.0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $16 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $48 = 0, $6 = 0.0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 5194
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5198
 $6 = +HEAPF32[$0 + 12 >> 2]; //@line 5200
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5202
 $9 = $4 + 12 | 0; //@line 5204
 HEAP32[$9 >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 5205
 $10 = $6 * 1.0e6; //@line 5206
 $11 = ~~$10 >>> 0; //@line 5207
 $12 = +Math_abs($10) >= 1.0 ? $10 > 0.0 ? ~~+Math_min(+Math_floor($10 / 4294967296.0), 4294967295.0) >>> 0 : ~~+Math_ceil(($10 - +(~~$10 >>> 0)) / 4294967296.0) >>> 0 : 0; //@line 5208
 $13 = $8 + 40 | 0; //@line 5209
 do {
  if (($13 | 0) != ($4 | 0)) {
   $15 = $8 + 52 | 0; //@line 5213
   $16 = HEAP32[$15 >> 2] | 0; //@line 5214
   if ($16 | 0) {
    $19 = HEAP32[$16 + 8 >> 2] | 0; //@line 5218
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 5219
    FUNCTION_TABLE_vi[$19 & 255]($13); //@line 5220
    if (___async) {
     HEAP32[$ReallocAsyncCtx2 >> 2] = 123; //@line 5223
     $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 5224
     HEAP32[$20 >> 2] = $9; //@line 5225
     $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 5226
     HEAP32[$21 >> 2] = $15; //@line 5227
     $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 5228
     HEAP32[$22 >> 2] = $13; //@line 5229
     $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 5230
     HEAP32[$23 >> 2] = $4; //@line 5231
     $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 5232
     HEAP32[$24 >> 2] = $9; //@line 5233
     $25 = $ReallocAsyncCtx2 + 24 | 0; //@line 5234
     HEAP32[$25 >> 2] = $8; //@line 5235
     $26 = $ReallocAsyncCtx2 + 32 | 0; //@line 5236
     $27 = $26; //@line 5237
     $28 = $27; //@line 5238
     HEAP32[$28 >> 2] = $11; //@line 5239
     $29 = $27 + 4 | 0; //@line 5240
     $30 = $29; //@line 5241
     HEAP32[$30 >> 2] = $12; //@line 5242
     sp = STACKTOP; //@line 5243
     return;
    }
    ___async_unwind = 0; //@line 5246
    HEAP32[$ReallocAsyncCtx2 >> 2] = 123; //@line 5247
    $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 5248
    HEAP32[$20 >> 2] = $9; //@line 5249
    $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 5250
    HEAP32[$21 >> 2] = $15; //@line 5251
    $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 5252
    HEAP32[$22 >> 2] = $13; //@line 5253
    $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 5254
    HEAP32[$23 >> 2] = $4; //@line 5255
    $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 5256
    HEAP32[$24 >> 2] = $9; //@line 5257
    $25 = $ReallocAsyncCtx2 + 24 | 0; //@line 5258
    HEAP32[$25 >> 2] = $8; //@line 5259
    $26 = $ReallocAsyncCtx2 + 32 | 0; //@line 5260
    $27 = $26; //@line 5261
    $28 = $27; //@line 5262
    HEAP32[$28 >> 2] = $11; //@line 5263
    $29 = $27 + 4 | 0; //@line 5264
    $30 = $29; //@line 5265
    HEAP32[$30 >> 2] = $12; //@line 5266
    sp = STACKTOP; //@line 5267
    return;
   }
   $31 = HEAP32[$9 >> 2] | 0; //@line 5270
   if (!$31) {
    HEAP32[$15 >> 2] = 0; //@line 5273
    break;
   }
   $34 = HEAP32[$31 + 4 >> 2] | 0; //@line 5277
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 5278
   FUNCTION_TABLE_vii[$34 & 3]($13, $4); //@line 5279
   if (___async) {
    HEAP32[$ReallocAsyncCtx3 >> 2] = 124; //@line 5282
    $35 = $ReallocAsyncCtx3 + 4 | 0; //@line 5283
    HEAP32[$35 >> 2] = $9; //@line 5284
    $36 = $ReallocAsyncCtx3 + 8 | 0; //@line 5285
    HEAP32[$36 >> 2] = $15; //@line 5286
    $37 = $ReallocAsyncCtx3 + 12 | 0; //@line 5287
    HEAP32[$37 >> 2] = $8; //@line 5288
    $38 = $ReallocAsyncCtx3 + 16 | 0; //@line 5289
    $39 = $38; //@line 5290
    $40 = $39; //@line 5291
    HEAP32[$40 >> 2] = $11; //@line 5292
    $41 = $39 + 4 | 0; //@line 5293
    $42 = $41; //@line 5294
    HEAP32[$42 >> 2] = $12; //@line 5295
    $43 = $ReallocAsyncCtx3 + 24 | 0; //@line 5296
    HEAP32[$43 >> 2] = $9; //@line 5297
    $44 = $ReallocAsyncCtx3 + 28 | 0; //@line 5298
    HEAP32[$44 >> 2] = $4; //@line 5299
    sp = STACKTOP; //@line 5300
    return;
   }
   ___async_unwind = 0; //@line 5303
   HEAP32[$ReallocAsyncCtx3 >> 2] = 124; //@line 5304
   $35 = $ReallocAsyncCtx3 + 4 | 0; //@line 5305
   HEAP32[$35 >> 2] = $9; //@line 5306
   $36 = $ReallocAsyncCtx3 + 8 | 0; //@line 5307
   HEAP32[$36 >> 2] = $15; //@line 5308
   $37 = $ReallocAsyncCtx3 + 12 | 0; //@line 5309
   HEAP32[$37 >> 2] = $8; //@line 5310
   $38 = $ReallocAsyncCtx3 + 16 | 0; //@line 5311
   $39 = $38; //@line 5312
   $40 = $39; //@line 5313
   HEAP32[$40 >> 2] = $11; //@line 5314
   $41 = $39 + 4 | 0; //@line 5315
   $42 = $41; //@line 5316
   HEAP32[$42 >> 2] = $12; //@line 5317
   $43 = $ReallocAsyncCtx3 + 24 | 0; //@line 5318
   HEAP32[$43 >> 2] = $9; //@line 5319
   $44 = $ReallocAsyncCtx3 + 28 | 0; //@line 5320
   HEAP32[$44 >> 2] = $4; //@line 5321
   sp = STACKTOP; //@line 5322
   return;
  }
 } while (0);
 __ZN4mbed6Ticker5setupEy($8, $11, $12); //@line 5326
 $45 = HEAP32[$9 >> 2] | 0; //@line 5327
 if (!$45) {
  return;
 }
 $48 = HEAP32[$45 + 8 >> 2] | 0; //@line 5333
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 5334
 FUNCTION_TABLE_vi[$48 & 255]($4); //@line 5335
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 125; //@line 5338
  sp = STACKTOP; //@line 5339
  return;
 }
 ___async_unwind = 0; //@line 5342
 HEAP32[$ReallocAsyncCtx4 >> 2] = 125; //@line 5343
 sp = STACKTOP; //@line 5344
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
function _mbed_vtracef__async_cb_6($0) {
 $0 = $0 | 0;
 var $$10 = 0, $$3147168 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $2 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $34 = 0, $38 = 0, $4 = 0, $42 = 0, $46 = 0, $50 = 0, $53 = 0, $54 = 0, $56 = 0, $6 = 0, $67 = 0, $68 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 705
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 707
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 709
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 711
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 713
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 716
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 718
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 720
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 722
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 728
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 730
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 732
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 734
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 736
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 740
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 744
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 748
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 752
 HEAP32[$12 >> 2] = HEAP32[___async_retval >> 2]; //@line 757
 $50 = _snprintf($14, $16, 1627, $12) | 0; //@line 758
 $$10 = ($50 | 0) >= ($16 | 0) ? 0 : $50; //@line 760
 $53 = $14 + $$10 | 0; //@line 762
 $54 = $16 - $$10 | 0; //@line 763
 if (($$10 | 0) > 0) {
  if (($54 | 0) > 0) {
   $$3147168 = $54; //@line 767
   $$3169 = $53; //@line 767
   label = 4; //@line 768
  }
 } else {
  $$3147168 = $16; //@line 771
  $$3169 = $14; //@line 771
  label = 4; //@line 772
 }
 if ((label | 0) == 4) {
  $56 = $26 + -2 | 0; //@line 775
  switch ($56 >>> 1 | $56 << 31 | 0) {
  case 0:
   {
    HEAP32[$28 >> 2] = $30; //@line 781
    $$5156 = _snprintf($$3169, $$3147168, 1630, $28) | 0; //@line 783
    break;
   }
  case 1:
   {
    HEAP32[$34 >> 2] = $30; //@line 787
    $$5156 = _snprintf($$3169, $$3147168, 1645, $34) | 0; //@line 789
    break;
   }
  case 3:
   {
    HEAP32[$38 >> 2] = $30; //@line 793
    $$5156 = _snprintf($$3169, $$3147168, 1660, $38) | 0; //@line 795
    break;
   }
  case 7:
   {
    HEAP32[$42 >> 2] = $30; //@line 799
    $$5156 = _snprintf($$3169, $$3147168, 1675, $42) | 0; //@line 801
    break;
   }
  default:
   {
    $$5156 = _snprintf($$3169, $$3147168, 1690, $46) | 0; //@line 806
   }
  }
  $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 810
  $67 = $$3169 + $$5156$ | 0; //@line 812
  $68 = $$3147168 - $$5156$ | 0; //@line 813
  if (($$5156$ | 0) > 0 & ($68 | 0) > 0) {
   $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 817
   $70 = _vsnprintf($67, $68, $2, $4) | 0; //@line 818
   if (___async) {
    HEAP32[$ReallocAsyncCtx10 >> 2] = 53; //@line 821
    $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 822
    HEAP32[$71 >> 2] = $22; //@line 823
    $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 824
    HEAP32[$72 >> 2] = $24; //@line 825
    $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 826
    $$expand_i1_val = $10 & 1; //@line 827
    HEAP8[$73 >> 0] = $$expand_i1_val; //@line 828
    $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 829
    HEAP32[$74 >> 2] = $6; //@line 830
    $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 831
    HEAP32[$75 >> 2] = $8; //@line 832
    $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 833
    HEAP32[$76 >> 2] = $68; //@line 834
    $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 835
    HEAP32[$77 >> 2] = $67; //@line 836
    sp = STACKTOP; //@line 837
    return;
   }
   HEAP32[___async_retval >> 2] = $70; //@line 841
   ___async_unwind = 0; //@line 842
   HEAP32[$ReallocAsyncCtx10 >> 2] = 53; //@line 843
   $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 844
   HEAP32[$71 >> 2] = $22; //@line 845
   $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 846
   HEAP32[$72 >> 2] = $24; //@line 847
   $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 848
   $$expand_i1_val = $10 & 1; //@line 849
   HEAP8[$73 >> 0] = $$expand_i1_val; //@line 850
   $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 851
   HEAP32[$74 >> 2] = $6; //@line 852
   $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 853
   HEAP32[$75 >> 2] = $8; //@line 854
   $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 855
   HEAP32[$76 >> 2] = $68; //@line 856
   $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 857
   HEAP32[$77 >> 2] = $67; //@line 858
   sp = STACKTOP; //@line 859
   return;
  }
 }
 $79 = HEAP32[91] | 0; //@line 863
 $80 = HEAP32[84] | 0; //@line 864
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 865
 FUNCTION_TABLE_vi[$79 & 255]($80); //@line 866
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 869
  sp = STACKTOP; //@line 870
  return;
 }
 ___async_unwind = 0; //@line 873
 HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 874
 sp = STACKTOP; //@line 875
 return;
}
function _initialize__async_cb_54($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $23 = 0, $25 = 0, $26 = 0, $27 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $6 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 4606
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4608
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4610
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4612
 $10 = HEAP32[(HEAP32[$0 + 16 >> 2] | 0) + 4 >> 2] | 0; //@line 4616
 if (($10 + -4 | 0) >>> 0 > 28) {
  $ReallocAsyncCtx6 = _emscripten_realloc_async_context(24) | 0; //@line 4620
  _mbed_assert_internal(1710, 1712, 55); //@line 4621
  if (___async) {
   HEAP32[$ReallocAsyncCtx6 >> 2] = 63; //@line 4624
   $12 = $ReallocAsyncCtx6 + 4 | 0; //@line 4625
   HEAP32[$12 >> 2] = $2; //@line 4626
   $13 = $ReallocAsyncCtx6 + 8 | 0; //@line 4627
   HEAP32[$13 >> 2] = 1e6; //@line 4628
   $14 = $ReallocAsyncCtx6 + 12 | 0; //@line 4629
   HEAP8[$14 >> 0] = 0; //@line 4630
   $15 = $ReallocAsyncCtx6 + 16 | 0; //@line 4631
   HEAP32[$15 >> 2] = $4; //@line 4632
   $16 = $ReallocAsyncCtx6 + 20 | 0; //@line 4633
   HEAP32[$16 >> 2] = $6; //@line 4634
   sp = STACKTOP; //@line 4635
   return;
  }
  ___async_unwind = 0; //@line 4638
  HEAP32[$ReallocAsyncCtx6 >> 2] = 63; //@line 4639
  $12 = $ReallocAsyncCtx6 + 4 | 0; //@line 4640
  HEAP32[$12 >> 2] = $2; //@line 4641
  $13 = $ReallocAsyncCtx6 + 8 | 0; //@line 4642
  HEAP32[$13 >> 2] = 1e6; //@line 4643
  $14 = $ReallocAsyncCtx6 + 12 | 0; //@line 4644
  HEAP8[$14 >> 0] = 0; //@line 4645
  $15 = $ReallocAsyncCtx6 + 16 | 0; //@line 4646
  HEAP32[$15 >> 2] = $4; //@line 4647
  $16 = $ReallocAsyncCtx6 + 20 | 0; //@line 4648
  HEAP32[$16 >> 2] = $6; //@line 4649
  sp = STACKTOP; //@line 4650
  return;
 } else {
  $18 = 7 << $10 + -4; //@line 4654
  $19 = ___muldi3($18 | 0, 0, 1e6, 0) | 0; //@line 4655
  $20 = tempRet0; //@line 4656
  $21 = _i64Add(1e6, 0, -1, -1) | 0; //@line 4657
  $23 = _i64Add($21 | 0, tempRet0 | 0, $19 | 0, $20 | 0) | 0; //@line 4659
  $25 = ___udivdi3($23 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 4661
  $26 = tempRet0; //@line 4662
  $27 = HEAP32[$2 >> 2] | 0; //@line 4663
  HEAP32[$27 >> 2] = 0; //@line 4664
  HEAP32[$27 + 4 >> 2] = 0; //@line 4666
  $31 = HEAP32[(HEAP32[$4 >> 2] | 0) + 4 >> 2] | 0; //@line 4669
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 4670
  $32 = FUNCTION_TABLE_i[$31 & 3]() | 0; //@line 4671
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 4674
   $33 = $ReallocAsyncCtx3 + 4 | 0; //@line 4675
   HEAP32[$33 >> 2] = $2; //@line 4676
   $34 = $ReallocAsyncCtx3 + 8 | 0; //@line 4677
   HEAP32[$34 >> 2] = 1e6; //@line 4678
   $35 = $ReallocAsyncCtx3 + 12 | 0; //@line 4679
   HEAP8[$35 >> 0] = 0; //@line 4680
   $36 = $ReallocAsyncCtx3 + 16 | 0; //@line 4681
   HEAP32[$36 >> 2] = $10; //@line 4682
   $37 = $ReallocAsyncCtx3 + 20 | 0; //@line 4683
   HEAP32[$37 >> 2] = $18; //@line 4684
   $38 = $ReallocAsyncCtx3 + 24 | 0; //@line 4685
   $39 = $38; //@line 4686
   $40 = $39; //@line 4687
   HEAP32[$40 >> 2] = $25; //@line 4688
   $41 = $39 + 4 | 0; //@line 4689
   $42 = $41; //@line 4690
   HEAP32[$42 >> 2] = $26; //@line 4691
   $43 = $ReallocAsyncCtx3 + 32 | 0; //@line 4692
   HEAP32[$43 >> 2] = $4; //@line 4693
   $44 = $ReallocAsyncCtx3 + 36 | 0; //@line 4694
   HEAP32[$44 >> 2] = $6; //@line 4695
   sp = STACKTOP; //@line 4696
   return;
  }
  HEAP32[___async_retval >> 2] = $32; //@line 4700
  ___async_unwind = 0; //@line 4701
  HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 4702
  $33 = $ReallocAsyncCtx3 + 4 | 0; //@line 4703
  HEAP32[$33 >> 2] = $2; //@line 4704
  $34 = $ReallocAsyncCtx3 + 8 | 0; //@line 4705
  HEAP32[$34 >> 2] = 1e6; //@line 4706
  $35 = $ReallocAsyncCtx3 + 12 | 0; //@line 4707
  HEAP8[$35 >> 0] = 0; //@line 4708
  $36 = $ReallocAsyncCtx3 + 16 | 0; //@line 4709
  HEAP32[$36 >> 2] = $10; //@line 4710
  $37 = $ReallocAsyncCtx3 + 20 | 0; //@line 4711
  HEAP32[$37 >> 2] = $18; //@line 4712
  $38 = $ReallocAsyncCtx3 + 24 | 0; //@line 4713
  $39 = $38; //@line 4714
  $40 = $39; //@line 4715
  HEAP32[$40 >> 2] = $25; //@line 4716
  $41 = $39 + 4 | 0; //@line 4717
  $42 = $41; //@line 4718
  HEAP32[$42 >> 2] = $26; //@line 4719
  $43 = $ReallocAsyncCtx3 + 32 | 0; //@line 4720
  HEAP32[$43 >> 2] = $4; //@line 4721
  $44 = $ReallocAsyncCtx3 + 36 | 0; //@line 4722
  HEAP32[$44 >> 2] = $6; //@line 4723
  sp = STACKTOP; //@line 4724
  return;
 }
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = +$2;
 var $13 = 0, $14 = 0, $15 = 0.0, $16 = 0, $17 = 0, $18 = 0, $20 = 0, $21 = 0, $24 = 0, $3 = 0, $32 = 0, $36 = 0, $39 = 0, $4 = 0, $44 = 0, $5 = 0, $50 = 0, $51 = 0, $54 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 3858
 STACKTOP = STACKTOP + 16 | 0; //@line 3859
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3859
 $3 = sp; //@line 3860
 $4 = $1 + 12 | 0; //@line 3861
 $5 = HEAP32[$4 >> 2] | 0; //@line 3862
 do {
  if (!$5) {
   $14 = 0; //@line 3866
  } else {
   $8 = HEAP32[$5 + 4 >> 2] | 0; //@line 3869
   $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 3870
   FUNCTION_TABLE_vii[$8 & 3]($3, $1); //@line 3871
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 122; //@line 3874
    HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 3876
    HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 3878
    HEAPF32[$AsyncCtx + 12 >> 2] = $2; //@line 3880
    HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 3882
    sp = STACKTOP; //@line 3883
    STACKTOP = sp; //@line 3884
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 3886
    $14 = HEAP32[$4 >> 2] | 0; //@line 3888
    break;
   }
  }
 } while (0);
 $13 = $3 + 12 | 0; //@line 3893
 HEAP32[$13 >> 2] = $14; //@line 3894
 $15 = $2 * 1.0e6; //@line 3895
 $16 = ~~$15 >>> 0; //@line 3896
 $17 = +Math_abs($15) >= 1.0 ? $15 > 0.0 ? ~~+Math_min(+Math_floor($15 / 4294967296.0), 4294967295.0) >>> 0 : ~~+Math_ceil(($15 - +(~~$15 >>> 0)) / 4294967296.0) >>> 0 : 0; //@line 3897
 $18 = $0 + 40 | 0; //@line 3898
 if (($18 | 0) != ($3 | 0)) {
  $20 = $0 + 52 | 0; //@line 3901
  $21 = HEAP32[$20 >> 2] | 0; //@line 3902
  do {
   if ($21 | 0) {
    $24 = HEAP32[$21 + 8 >> 2] | 0; //@line 3907
    $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3908
    FUNCTION_TABLE_vi[$24 & 255]($18); //@line 3909
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 123; //@line 3912
     HEAP32[$AsyncCtx3 + 4 >> 2] = $13; //@line 3914
     HEAP32[$AsyncCtx3 + 8 >> 2] = $20; //@line 3916
     HEAP32[$AsyncCtx3 + 12 >> 2] = $18; //@line 3918
     HEAP32[$AsyncCtx3 + 16 >> 2] = $3; //@line 3920
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 3922
     HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 3924
     $32 = $AsyncCtx3 + 32 | 0; //@line 3926
     HEAP32[$32 >> 2] = $16; //@line 3928
     HEAP32[$32 + 4 >> 2] = $17; //@line 3931
     sp = STACKTOP; //@line 3932
     STACKTOP = sp; //@line 3933
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3935
     break;
    }
   }
  } while (0);
  $36 = HEAP32[$13 >> 2] | 0; //@line 3940
  do {
   if (!$36) {
    $50 = 0; //@line 3944
   } else {
    $39 = HEAP32[$36 + 4 >> 2] | 0; //@line 3947
    $AsyncCtx6 = _emscripten_alloc_async_context(32, sp) | 0; //@line 3948
    FUNCTION_TABLE_vii[$39 & 3]($18, $3); //@line 3949
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 124; //@line 3952
     HEAP32[$AsyncCtx6 + 4 >> 2] = $13; //@line 3954
     HEAP32[$AsyncCtx6 + 8 >> 2] = $20; //@line 3956
     HEAP32[$AsyncCtx6 + 12 >> 2] = $0; //@line 3958
     $44 = $AsyncCtx6 + 16 | 0; //@line 3960
     HEAP32[$44 >> 2] = $16; //@line 3962
     HEAP32[$44 + 4 >> 2] = $17; //@line 3965
     HEAP32[$AsyncCtx6 + 24 >> 2] = $13; //@line 3967
     HEAP32[$AsyncCtx6 + 28 >> 2] = $3; //@line 3969
     sp = STACKTOP; //@line 3970
     STACKTOP = sp; //@line 3971
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 3973
     $50 = HEAP32[$13 >> 2] | 0; //@line 3975
     break;
    }
   }
  } while (0);
  HEAP32[$20 >> 2] = $50; //@line 3980
 }
 __ZN4mbed6Ticker5setupEy($0, $16, $17); //@line 3982
 $51 = HEAP32[$13 >> 2] | 0; //@line 3983
 if (!$51) {
  STACKTOP = sp; //@line 3986
  return;
 }
 $54 = HEAP32[$51 + 8 >> 2] | 0; //@line 3989
 $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3990
 FUNCTION_TABLE_vi[$54 & 255]($3); //@line 3991
 if (___async) {
  HEAP32[$AsyncCtx10 >> 2] = 125; //@line 3994
  sp = STACKTOP; //@line 3995
  STACKTOP = sp; //@line 3996
  return;
 }
 _emscripten_free_async_context($AsyncCtx10 | 0); //@line 3998
 STACKTOP = sp; //@line 3999
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_47($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3463
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3465
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3467
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3469
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3471
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3473
 $12 = HEAP8[$0 + 24 >> 0] & 1; //@line 3476
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3478
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3480
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 3483
 $20 = HEAP8[$0 + 37 >> 0] & 1; //@line 3486
 $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 3488
 $24 = HEAP32[$0 + 44 >> 2] | 0; //@line 3490
 $26 = HEAP32[$0 + 48 >> 2] | 0; //@line 3492
 $28 = HEAP32[$0 + 52 >> 2] | 0; //@line 3494
 L2 : do {
  if (!(HEAP8[$16 >> 0] | 0)) {
   do {
    if (!(HEAP8[$2 >> 0] | 0)) {
     $$182$off0 = $18; //@line 3503
     $$186$off0 = $20; //@line 3503
    } else {
     if (!(HEAP8[$4 >> 0] | 0)) {
      if (!(HEAP32[$24 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $20; //@line 3512
       $$283$off0 = 1; //@line 3512
       label = 13; //@line 3513
       break L2;
      } else {
       $$182$off0 = 1; //@line 3516
       $$186$off0 = $20; //@line 3516
       break;
      }
     }
     if ((HEAP32[$14 >> 2] | 0) == 1) {
      label = 18; //@line 3523
      break L2;
     }
     if (!(HEAP32[$24 >> 2] & 2)) {
      label = 18; //@line 3530
      break L2;
     } else {
      $$182$off0 = 1; //@line 3533
      $$186$off0 = 1; //@line 3533
     }
    }
   } while (0);
   $30 = $26 + 8 | 0; //@line 3537
   if ($30 >>> 0 < $6 >>> 0) {
    HEAP8[$4 >> 0] = 0; //@line 3540
    HEAP8[$2 >> 0] = 0; //@line 3541
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 3542
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $8, $10, $10, 1, $12); //@line 3543
    if (!___async) {
     ___async_unwind = 0; //@line 3546
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 157; //@line 3548
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 3550
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 3552
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 3554
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 3556
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 3558
    HEAP8[$ReallocAsyncCtx5 + 24 >> 0] = $12 & 1; //@line 3561
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 3563
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $16; //@line 3565
    HEAP8[$ReallocAsyncCtx5 + 36 >> 0] = $$182$off0 & 1; //@line 3568
    HEAP8[$ReallocAsyncCtx5 + 37 >> 0] = $$186$off0 & 1; //@line 3571
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $22; //@line 3573
    HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $24; //@line 3575
    HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $30; //@line 3577
    HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $28; //@line 3579
    sp = STACKTOP; //@line 3580
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 3583
    $$283$off0 = $$182$off0; //@line 3583
    label = 13; //@line 3584
   }
  } else {
   $$085$off0$reg2mem$0 = $20; //@line 3587
   $$283$off0 = $18; //@line 3587
   label = 13; //@line 3588
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$22 >> 2] = $10; //@line 3594
    $59 = $8 + 40 | 0; //@line 3595
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 3598
    if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$14 >> 2] | 0) == 2) {
      HEAP8[$16 >> 0] = 1; //@line 3606
      if ($$283$off0) {
       label = 18; //@line 3608
       break;
      } else {
       $67 = 4; //@line 3611
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 3618
   } else {
    $67 = 4; //@line 3620
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 3625
 }
 HEAP32[$28 >> 2] = $67; //@line 3627
 return;
}
function _initialize__async_cb_51($0) {
 $0 = $0 | 0;
 var $10 = 0, $101 = 0, $102 = 0, $103 = 0, $105 = 0, $12 = 0, $14 = 0, $16 = 0, $25 = 0, $26 = 0, $28 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $37 = 0, $39 = 0, $4 = 0, $45 = 0, $46 = 0, $47 = 0, $56 = 0, $57 = 0, $58 = 0, $6 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $70 = 0, $76 = 0, $77 = 0, $78 = 0, $87 = 0, $88 = 0, $89 = 0, $91 = 0, $95 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 4350
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4354
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4356
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4360
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4362
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4364
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4366
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4368
 if (($AsyncRetVal | 0) != (HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 32 >> 2] | 0)) {
  $25 = $AsyncRetVal - (HEAP32[$6 >> 2] | 0) & HEAP32[HEAP32[$0 + 16 >> 2] >> 2]; //@line 4377
  HEAP32[$6 >> 2] = $AsyncRetVal; //@line 4378
  $26 = HEAP32[$10 >> 2] | 0; //@line 4379
  do {
   if (($26 | 0) == 1e6) {
    $101 = $25; //@line 4383
    $102 = 0; //@line 4383
   } else {
    $28 = HEAP8[$14 >> 0] | 0; //@line 4385
    $30 = ___muldi3($25 | 0, 0, 1e6, 0) | 0; //@line 4387
    $31 = tempRet0; //@line 4388
    if (!($28 << 24 >> 24)) {
     $64 = ___udivdi3($30 | 0, $31 | 0, $26 | 0, 0) | 0; //@line 4390
     $65 = tempRet0; //@line 4391
     $66 = ___muldi3($64 | 0, $65 | 0, $26 | 0, 0) | 0; //@line 4392
     $68 = _i64Subtract($30 | 0, $31 | 0, $66 | 0, tempRet0 | 0) | 0; //@line 4394
     $70 = $16; //@line 4396
     $76 = _i64Add($68 | 0, tempRet0 | 0, HEAP32[$70 >> 2] | 0, HEAP32[$70 + 4 >> 2] | 0) | 0; //@line 4402
     $77 = tempRet0; //@line 4403
     $78 = $16; //@line 4404
     HEAP32[$78 >> 2] = $76; //@line 4406
     HEAP32[$78 + 4 >> 2] = $77; //@line 4409
     if ($77 >>> 0 < 0 | ($77 | 0) == 0 & $76 >>> 0 < $26 >>> 0) {
      $101 = $64; //@line 4416
      $102 = $65; //@line 4416
      break;
     }
     $87 = _i64Add($64 | 0, $65 | 0, 1, 0) | 0; //@line 4419
     $88 = tempRet0; //@line 4420
     $89 = _i64Subtract($76 | 0, $77 | 0, $26 | 0, 0) | 0; //@line 4421
     $91 = $16; //@line 4423
     HEAP32[$91 >> 2] = $89; //@line 4425
     HEAP32[$91 + 4 >> 2] = tempRet0; //@line 4428
     $101 = $87; //@line 4429
     $102 = $88; //@line 4429
     break;
    } else {
     $32 = $28 & 255; //@line 4432
     $33 = _bitshift64Lshr($30 | 0, $31 | 0, $32 | 0) | 0; //@line 4433
     $34 = tempRet0; //@line 4434
     $35 = _bitshift64Shl($33 | 0, $34 | 0, $32 | 0) | 0; //@line 4435
     $37 = _i64Subtract($30 | 0, $31 | 0, $35 | 0, tempRet0 | 0) | 0; //@line 4437
     $39 = $16; //@line 4439
     $45 = _i64Add(HEAP32[$39 >> 2] | 0, HEAP32[$39 + 4 >> 2] | 0, $37 | 0, tempRet0 | 0) | 0; //@line 4445
     $46 = tempRet0; //@line 4446
     $47 = $16; //@line 4447
     HEAP32[$47 >> 2] = $45; //@line 4449
     HEAP32[$47 + 4 >> 2] = $46; //@line 4452
     if ($46 >>> 0 < 0 | ($46 | 0) == 0 & $45 >>> 0 < $26 >>> 0) {
      $101 = $33; //@line 4459
      $102 = $34; //@line 4459
      break;
     }
     $56 = _i64Add($33 | 0, $34 | 0, 1, 0) | 0; //@line 4462
     $57 = tempRet0; //@line 4463
     $58 = _i64Subtract($45 | 0, $46 | 0, $26 | 0, 0) | 0; //@line 4464
     $60 = $16; //@line 4466
     HEAP32[$60 >> 2] = $58; //@line 4468
     HEAP32[$60 + 4 >> 2] = tempRet0; //@line 4471
     $101 = $56; //@line 4472
     $102 = $57; //@line 4472
     break;
    }
   }
  } while (0);
  $95 = $12; //@line 4477
  $103 = _i64Add(HEAP32[$95 >> 2] | 0, HEAP32[$95 + 4 >> 2] | 0, $101 | 0, $102 | 0) | 0; //@line 4483
  $105 = $12; //@line 4485
  HEAP32[$105 >> 2] = $103; //@line 4487
  HEAP32[$105 + 4 >> 2] = tempRet0; //@line 4490
 }
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(4) | 0; //@line 4492
 _schedule_interrupt($4); //@line 4493
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 66; //@line 4496
  sp = STACKTOP; //@line 4497
  return;
 }
 ___async_unwind = 0; //@line 4500
 HEAP32[$ReallocAsyncCtx5 >> 2] = 66; //@line 4501
 sp = STACKTOP; //@line 4502
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
 sp = STACKTOP; //@line 13126
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 13131
 } else {
  $9 = $1 + 52 | 0; //@line 13133
  $10 = HEAP8[$9 >> 0] | 0; //@line 13134
  $11 = $1 + 53 | 0; //@line 13135
  $12 = HEAP8[$11 >> 0] | 0; //@line 13136
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 13139
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 13140
  HEAP8[$9 >> 0] = 0; //@line 13141
  HEAP8[$11 >> 0] = 0; //@line 13142
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 13143
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 13144
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 155; //@line 13147
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 13149
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 13151
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 13153
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 13155
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 13157
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 13159
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 13161
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 13163
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 13165
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 13167
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 13170
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 13172
   sp = STACKTOP; //@line 13173
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13176
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 13181
    $32 = $0 + 8 | 0; //@line 13182
    $33 = $1 + 54 | 0; //@line 13183
    $$0 = $0 + 24 | 0; //@line 13184
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
     HEAP8[$9 >> 0] = 0; //@line 13217
     HEAP8[$11 >> 0] = 0; //@line 13218
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 13219
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 13220
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 13225
     $62 = $$0 + 8 | 0; //@line 13226
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 13229
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 156; //@line 13234
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 13236
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 13238
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 13240
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 13242
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 13244
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 13246
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 13248
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 13250
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 13252
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 13254
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 13256
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 13258
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 13260
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 13263
    sp = STACKTOP; //@line 13264
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 13268
  HEAP8[$11 >> 0] = $12; //@line 13269
 }
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_46($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3307
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3309
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3313
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3315
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3317
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3319
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 3322
 $15 = $2 + 24 | 0; //@line 3323
 do {
  if ((HEAP32[$0 + 8 >> 2] | 0) > 1) {
   $18 = HEAP32[$2 + 8 >> 2] | 0; //@line 3328
   if (!($18 & 2)) {
    $21 = $8 + 36 | 0; //@line 3332
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $8 + 54 | 0; //@line 3339
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 3350
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $8, $10, $12, $14); //@line 3351
      if (!___async) {
       ___async_unwind = 0; //@line 3354
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 161; //@line 3356
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 3358
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 3360
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 3362
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 3364
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 3366
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 3368
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $12; //@line 3370
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $14 & 1; //@line 3373
      sp = STACKTOP; //@line 3374
      return;
     }
     $36 = $8 + 24 | 0; //@line 3377
     $37 = $8 + 54 | 0; //@line 3378
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 3393
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $8, $10, $12, $14); //@line 3394
     if (!___async) {
      ___async_unwind = 0; //@line 3397
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 160; //@line 3399
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 3401
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 3403
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 3405
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 3407
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 3409
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $8; //@line 3411
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $10; //@line 3413
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $12; //@line 3415
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $14 & 1; //@line 3418
     sp = STACKTOP; //@line 3419
     return;
    }
   }
   $24 = $8 + 54 | 0; //@line 3423
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 3427
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $8, $10, $12, $14); //@line 3428
    if (!___async) {
     ___async_unwind = 0; //@line 3431
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 159; //@line 3433
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 3435
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $6; //@line 3437
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 3439
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 3441
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 3443
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 3445
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 3448
    sp = STACKTOP; //@line 3449
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9585
      $10 = HEAP32[$9 >> 2] | 0; //@line 9586
      HEAP32[$2 >> 2] = $9 + 4; //@line 9588
      HEAP32[$0 >> 2] = $10; //@line 9589
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9605
      $17 = HEAP32[$16 >> 2] | 0; //@line 9606
      HEAP32[$2 >> 2] = $16 + 4; //@line 9608
      $20 = $0; //@line 9611
      HEAP32[$20 >> 2] = $17; //@line 9613
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 9616
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9632
      $30 = HEAP32[$29 >> 2] | 0; //@line 9633
      HEAP32[$2 >> 2] = $29 + 4; //@line 9635
      $31 = $0; //@line 9636
      HEAP32[$31 >> 2] = $30; //@line 9638
      HEAP32[$31 + 4 >> 2] = 0; //@line 9641
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9657
      $41 = $40; //@line 9658
      $43 = HEAP32[$41 >> 2] | 0; //@line 9660
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 9663
      HEAP32[$2 >> 2] = $40 + 8; //@line 9665
      $47 = $0; //@line 9666
      HEAP32[$47 >> 2] = $43; //@line 9668
      HEAP32[$47 + 4 >> 2] = $46; //@line 9671
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9687
      $57 = HEAP32[$56 >> 2] | 0; //@line 9688
      HEAP32[$2 >> 2] = $56 + 4; //@line 9690
      $59 = ($57 & 65535) << 16 >> 16; //@line 9692
      $62 = $0; //@line 9695
      HEAP32[$62 >> 2] = $59; //@line 9697
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 9700
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9716
      $72 = HEAP32[$71 >> 2] | 0; //@line 9717
      HEAP32[$2 >> 2] = $71 + 4; //@line 9719
      $73 = $0; //@line 9721
      HEAP32[$73 >> 2] = $72 & 65535; //@line 9723
      HEAP32[$73 + 4 >> 2] = 0; //@line 9726
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9742
      $83 = HEAP32[$82 >> 2] | 0; //@line 9743
      HEAP32[$2 >> 2] = $82 + 4; //@line 9745
      $85 = ($83 & 255) << 24 >> 24; //@line 9747
      $88 = $0; //@line 9750
      HEAP32[$88 >> 2] = $85; //@line 9752
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 9755
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9771
      $98 = HEAP32[$97 >> 2] | 0; //@line 9772
      HEAP32[$2 >> 2] = $97 + 4; //@line 9774
      $99 = $0; //@line 9776
      HEAP32[$99 >> 2] = $98 & 255; //@line 9778
      HEAP32[$99 + 4 >> 2] = 0; //@line 9781
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9797
      $109 = +HEAPF64[$108 >> 3]; //@line 9798
      HEAP32[$2 >> 2] = $108 + 8; //@line 9800
      HEAPF64[$0 >> 3] = $109; //@line 9801
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9817
      $116 = +HEAPF64[$115 >> 3]; //@line 9818
      HEAP32[$2 >> 2] = $115 + 8; //@line 9820
      HEAPF64[$0 >> 3] = $116; //@line 9821
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
 sp = STACKTOP; //@line 8485
 STACKTOP = STACKTOP + 224 | 0; //@line 8486
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 8486
 $3 = sp + 120 | 0; //@line 8487
 $4 = sp + 80 | 0; //@line 8488
 $5 = sp; //@line 8489
 $6 = sp + 136 | 0; //@line 8490
 dest = $4; //@line 8491
 stop = dest + 40 | 0; //@line 8491
 do {
  HEAP32[dest >> 2] = 0; //@line 8491
  dest = dest + 4 | 0; //@line 8491
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 8493
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 8497
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 8504
  } else {
   $43 = 0; //@line 8506
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 8508
  $14 = $13 & 32; //@line 8509
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 8515
  }
  $19 = $0 + 48 | 0; //@line 8517
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 8522
    $24 = HEAP32[$23 >> 2] | 0; //@line 8523
    HEAP32[$23 >> 2] = $6; //@line 8524
    $25 = $0 + 28 | 0; //@line 8525
    HEAP32[$25 >> 2] = $6; //@line 8526
    $26 = $0 + 20 | 0; //@line 8527
    HEAP32[$26 >> 2] = $6; //@line 8528
    HEAP32[$19 >> 2] = 80; //@line 8529
    $28 = $0 + 16 | 0; //@line 8531
    HEAP32[$28 >> 2] = $6 + 80; //@line 8532
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 8533
    if (!$24) {
     $$1 = $29; //@line 8536
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 8539
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 8540
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 8541
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 135; //@line 8544
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 8546
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 8548
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 8550
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 8552
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 8554
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 8556
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 8558
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 8560
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 8562
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 8564
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 8566
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 8568
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 8570
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 8572
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 8574
      sp = STACKTOP; //@line 8575
      STACKTOP = sp; //@line 8576
      return 0; //@line 8576
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 8578
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 8581
      HEAP32[$23 >> 2] = $24; //@line 8582
      HEAP32[$19 >> 2] = 0; //@line 8583
      HEAP32[$28 >> 2] = 0; //@line 8584
      HEAP32[$25 >> 2] = 0; //@line 8585
      HEAP32[$26 >> 2] = 0; //@line 8586
      $$1 = $$; //@line 8587
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 8593
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 8596
  HEAP32[$0 >> 2] = $51 | $14; //@line 8601
  if ($43 | 0) {
   ___unlockfile($0); //@line 8604
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 8606
 }
 STACKTOP = sp; //@line 8608
 return $$0 | 0; //@line 8608
}
function _initialize__async_cb_50($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $19 = 0, $2 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $30 = 0, $31 = 0, $32 = 0, $34 = 0, $36 = 0, $39 = 0, $4 = 0, $43 = 0, $44 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4230
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4232
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4234
 $6 = HEAP8[$0 + 12 >> 0] | 0; //@line 4236
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4238
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4240
 $12 = $0 + 24 | 0; //@line 4242
 $14 = HEAP32[$12 >> 2] | 0; //@line 4244
 $17 = HEAP32[$12 + 4 >> 2] | 0; //@line 4247
 $19 = HEAP32[$0 + 32 >> 2] | 0; //@line 4249
 $21 = HEAP32[$0 + 36 >> 2] | 0; //@line 4251
 $23 = HEAP32[$2 >> 2] | 0; //@line 4254
 $24 = $23 + 32 | 0; //@line 4255
 HEAP32[$24 >> 2] = HEAP32[___async_retval >> 2]; //@line 4256
 $25 = $23 + 40 | 0; //@line 4257
 $26 = $25; //@line 4258
 HEAP32[$26 >> 2] = 0; //@line 4260
 HEAP32[$26 + 4 >> 2] = 0; //@line 4263
 $30 = $23 + 8 | 0; //@line 4264
 HEAP32[$30 >> 2] = $4; //@line 4265
 $31 = $23 + 57 | 0; //@line 4266
 HEAP8[$31 >> 0] = $6; //@line 4267
 $32 = _bitshift64Shl(1, 0, $8 | 0) | 0; //@line 4268
 $34 = _i64Add($32 | 0, tempRet0 | 0, -1, 0) | 0; //@line 4270
 $36 = $23 + 12 | 0; //@line 4272
 HEAP32[$36 >> 2] = $34; //@line 4273
 HEAP32[$23 + 16 >> 2] = $10; //@line 4275
 $39 = $23 + 24 | 0; //@line 4277
 HEAP32[$39 >> 2] = $14; //@line 4279
 HEAP32[$39 + 4 >> 2] = $17; //@line 4282
 $43 = $23 + 48 | 0; //@line 4283
 $44 = $43; //@line 4284
 HEAP32[$44 >> 2] = 0; //@line 4286
 HEAP32[$44 + 4 >> 2] = 0; //@line 4289
 HEAP8[$23 + 56 >> 0] = 1; //@line 4291
 $51 = HEAP32[(HEAP32[$19 >> 2] | 0) + 4 >> 2] | 0; //@line 4294
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(36) | 0; //@line 4295
 $52 = FUNCTION_TABLE_i[$51 & 3]() | 0; //@line 4296
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 65; //@line 4299
  $53 = $ReallocAsyncCtx4 + 4 | 0; //@line 4300
  HEAP32[$53 >> 2] = $2; //@line 4301
  $54 = $ReallocAsyncCtx4 + 8 | 0; //@line 4302
  HEAP32[$54 >> 2] = $21; //@line 4303
  $55 = $ReallocAsyncCtx4 + 12 | 0; //@line 4304
  HEAP32[$55 >> 2] = $24; //@line 4305
  $56 = $ReallocAsyncCtx4 + 16 | 0; //@line 4306
  HEAP32[$56 >> 2] = $36; //@line 4307
  $57 = $ReallocAsyncCtx4 + 20 | 0; //@line 4308
  HEAP32[$57 >> 2] = $30; //@line 4309
  $58 = $ReallocAsyncCtx4 + 24 | 0; //@line 4310
  HEAP32[$58 >> 2] = $43; //@line 4311
  $59 = $ReallocAsyncCtx4 + 28 | 0; //@line 4312
  HEAP32[$59 >> 2] = $31; //@line 4313
  $60 = $ReallocAsyncCtx4 + 32 | 0; //@line 4314
  HEAP32[$60 >> 2] = $25; //@line 4315
  sp = STACKTOP; //@line 4316
  return;
 }
 HEAP32[___async_retval >> 2] = $52; //@line 4320
 ___async_unwind = 0; //@line 4321
 HEAP32[$ReallocAsyncCtx4 >> 2] = 65; //@line 4322
 $53 = $ReallocAsyncCtx4 + 4 | 0; //@line 4323
 HEAP32[$53 >> 2] = $2; //@line 4324
 $54 = $ReallocAsyncCtx4 + 8 | 0; //@line 4325
 HEAP32[$54 >> 2] = $21; //@line 4326
 $55 = $ReallocAsyncCtx4 + 12 | 0; //@line 4327
 HEAP32[$55 >> 2] = $24; //@line 4328
 $56 = $ReallocAsyncCtx4 + 16 | 0; //@line 4329
 HEAP32[$56 >> 2] = $36; //@line 4330
 $57 = $ReallocAsyncCtx4 + 20 | 0; //@line 4331
 HEAP32[$57 >> 2] = $30; //@line 4332
 $58 = $ReallocAsyncCtx4 + 24 | 0; //@line 4333
 HEAP32[$58 >> 2] = $43; //@line 4334
 $59 = $ReallocAsyncCtx4 + 28 | 0; //@line 4335
 HEAP32[$59 >> 2] = $31; //@line 4336
 $60 = $ReallocAsyncCtx4 + 32 | 0; //@line 4337
 HEAP32[$60 >> 2] = $25; //@line 4338
 sp = STACKTOP; //@line 4339
 return;
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12661
 STACKTOP = STACKTOP + 64 | 0; //@line 12662
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 12662
 $4 = sp; //@line 12663
 $5 = HEAP32[$0 >> 2] | 0; //@line 12664
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 12667
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 12669
 HEAP32[$4 >> 2] = $2; //@line 12670
 HEAP32[$4 + 4 >> 2] = $0; //@line 12672
 HEAP32[$4 + 8 >> 2] = $1; //@line 12674
 HEAP32[$4 + 12 >> 2] = $3; //@line 12676
 $14 = $4 + 16 | 0; //@line 12677
 $15 = $4 + 20 | 0; //@line 12678
 $16 = $4 + 24 | 0; //@line 12679
 $17 = $4 + 28 | 0; //@line 12680
 $18 = $4 + 32 | 0; //@line 12681
 $19 = $4 + 40 | 0; //@line 12682
 dest = $14; //@line 12683
 stop = dest + 36 | 0; //@line 12683
 do {
  HEAP32[dest >> 2] = 0; //@line 12683
  dest = dest + 4 | 0; //@line 12683
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 12683
 HEAP8[$14 + 38 >> 0] = 0; //@line 12683
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 12688
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 12691
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 12692
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 12693
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 147; //@line 12696
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 12698
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 12700
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 12702
    sp = STACKTOP; //@line 12703
    STACKTOP = sp; //@line 12704
    return 0; //@line 12704
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12706
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 12710
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 12714
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 12717
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 12718
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 12719
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 148; //@line 12722
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 12724
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 12726
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 12728
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 12730
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 12732
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 12734
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 12736
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 12738
    sp = STACKTOP; //@line 12739
    STACKTOP = sp; //@line 12740
    return 0; //@line 12740
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12742
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 12756
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 12764
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 12780
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 12785
  }
 } while (0);
 STACKTOP = sp; //@line 12788
 return $$0 | 0; //@line 12788
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 8357
 $7 = ($2 | 0) != 0; //@line 8361
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 8365
   $$03555 = $0; //@line 8366
   $$03654 = $2; //@line 8366
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 8371
     $$036$lcssa64 = $$03654; //@line 8371
     label = 6; //@line 8372
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 8375
    $12 = $$03654 + -1 | 0; //@line 8376
    $16 = ($12 | 0) != 0; //@line 8380
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 8383
     $$03654 = $12; //@line 8383
    } else {
     $$035$lcssa = $11; //@line 8385
     $$036$lcssa = $12; //@line 8385
     $$lcssa = $16; //@line 8385
     label = 5; //@line 8386
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 8391
   $$036$lcssa = $2; //@line 8391
   $$lcssa = $7; //@line 8391
   label = 5; //@line 8392
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 8397
   $$036$lcssa64 = $$036$lcssa; //@line 8397
   label = 6; //@line 8398
  } else {
   $$2 = $$035$lcssa; //@line 8400
   $$3 = 0; //@line 8400
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 8406
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 8409
    $$3 = $$036$lcssa64; //@line 8409
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 8411
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 8415
      $$13745 = $$036$lcssa64; //@line 8415
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 8418
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 8427
       $30 = $$13745 + -4 | 0; //@line 8428
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 8431
        $$13745 = $30; //@line 8431
       } else {
        $$0$lcssa = $29; //@line 8433
        $$137$lcssa = $30; //@line 8433
        label = 11; //@line 8434
        break L11;
       }
      }
      $$140 = $$046; //@line 8438
      $$23839 = $$13745; //@line 8438
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 8440
      $$137$lcssa = $$036$lcssa64; //@line 8440
      label = 11; //@line 8441
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 8447
      $$3 = 0; //@line 8447
      break;
     } else {
      $$140 = $$0$lcssa; //@line 8450
      $$23839 = $$137$lcssa; //@line 8450
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 8457
      $$3 = $$23839; //@line 8457
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 8460
     $$23839 = $$23839 + -1 | 0; //@line 8461
     if (!$$23839) {
      $$2 = $35; //@line 8464
      $$3 = 0; //@line 8464
      break;
     } else {
      $$140 = $35; //@line 8467
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 8475
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 8128
 do {
  if (!$0) {
   do {
    if (!(HEAP32[179] | 0)) {
     $34 = 0; //@line 8136
    } else {
     $12 = HEAP32[179] | 0; //@line 8138
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 8139
     $13 = _fflush($12) | 0; //@line 8140
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 131; //@line 8143
      sp = STACKTOP; //@line 8144
      return 0; //@line 8145
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 8147
      $34 = $13; //@line 8148
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 8154
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 8158
    } else {
     $$02327 = $$02325; //@line 8160
     $$02426 = $34; //@line 8160
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 8167
      } else {
       $28 = 0; //@line 8169
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8177
       $25 = ___fflush_unlocked($$02327) | 0; //@line 8178
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 8183
       $$1 = $25 | $$02426; //@line 8185
      } else {
       $$1 = $$02426; //@line 8187
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 8191
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 8194
      if (!$$023) {
       $$024$lcssa = $$1; //@line 8197
       break L9;
      } else {
       $$02327 = $$023; //@line 8200
       $$02426 = $$1; //@line 8200
      }
     }
     HEAP32[$AsyncCtx >> 2] = 132; //@line 8203
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 8205
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 8207
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 8209
     sp = STACKTOP; //@line 8210
     return 0; //@line 8211
    }
   } while (0);
   ___ofl_unlock(); //@line 8214
   $$0 = $$024$lcssa; //@line 8215
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 8221
    $5 = ___fflush_unlocked($0) | 0; //@line 8222
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 129; //@line 8225
     sp = STACKTOP; //@line 8226
     return 0; //@line 8227
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 8229
     $$0 = $5; //@line 8230
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 8235
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 8236
   $7 = ___fflush_unlocked($0) | 0; //@line 8237
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 130; //@line 8240
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 8243
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 8245
    sp = STACKTOP; //@line 8246
    return 0; //@line 8247
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8249
   if ($phitmp) {
    $$0 = $7; //@line 8251
   } else {
    ___unlockfile($0); //@line 8253
    $$0 = $7; //@line 8254
   }
  }
 } while (0);
 return $$0 | 0; //@line 8258
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12843
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12849
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 12855
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 12858
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12859
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 12860
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 151; //@line 12863
     sp = STACKTOP; //@line 12864
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12867
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 12875
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 12880
     $19 = $1 + 44 | 0; //@line 12881
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 12887
     HEAP8[$22 >> 0] = 0; //@line 12888
     $23 = $1 + 53 | 0; //@line 12889
     HEAP8[$23 >> 0] = 0; //@line 12890
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 12892
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 12895
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 12896
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 12897
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 150; //@line 12900
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 12902
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 12904
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 12906
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 12908
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 12910
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 12912
      sp = STACKTOP; //@line 12913
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 12916
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 12920
      label = 13; //@line 12921
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 12926
       label = 13; //@line 12927
      } else {
       $$037$off039 = 3; //@line 12929
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 12933
      $39 = $1 + 40 | 0; //@line 12934
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 12937
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 12947
        $$037$off039 = $$037$off038; //@line 12948
       } else {
        $$037$off039 = $$037$off038; //@line 12950
       }
      } else {
       $$037$off039 = $$037$off038; //@line 12953
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 12956
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 12963
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_11($0) {
 $0 = $0 | 0;
 var $$13 = 0, $$expand_i1_val = 0, $10 = 0, $12 = 0, $18 = 0, $19 = 0, $2 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 1035
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1037
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1039
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 1042
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1044
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1046
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1048
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1052
 $$13 = ($AsyncRetVal | 0) >= ($12 | 0) ? 0 : $AsyncRetVal; //@line 1054
 $18 = (HEAP32[$0 + 28 >> 2] | 0) + $$13 | 0; //@line 1056
 $19 = $12 - $$13 | 0; //@line 1057
 do {
  if (($$13 | 0) > 0) {
   $21 = HEAP32[90] | 0; //@line 1061
   if (!(($19 | 0) > 0 & ($21 | 0) != 0)) {
    if (($$13 | 0) < 1 | ($19 | 0) < 1 | $6 ^ 1) {
     break;
    }
    _snprintf($18, $19, 1705, $8) | 0; //@line 1073
    break;
   }
   $ReallocAsyncCtx6 = _emscripten_realloc_async_context(32) | 0; //@line 1076
   $23 = FUNCTION_TABLE_i[$21 & 3]() | 0; //@line 1077
   if (___async) {
    HEAP32[$ReallocAsyncCtx6 >> 2] = 54; //@line 1080
    $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 1081
    HEAP32[$24 >> 2] = $2; //@line 1082
    $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 1083
    HEAP32[$25 >> 2] = $18; //@line 1084
    $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 1085
    HEAP32[$26 >> 2] = $19; //@line 1086
    $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 1087
    HEAP32[$27 >> 2] = $4; //@line 1088
    $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 1089
    $$expand_i1_val = $6 & 1; //@line 1090
    HEAP8[$28 >> 0] = $$expand_i1_val; //@line 1091
    $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 1092
    HEAP32[$29 >> 2] = $8; //@line 1093
    $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 1094
    HEAP32[$30 >> 2] = $10; //@line 1095
    sp = STACKTOP; //@line 1096
    return;
   }
   HEAP32[___async_retval >> 2] = $23; //@line 1100
   ___async_unwind = 0; //@line 1101
   HEAP32[$ReallocAsyncCtx6 >> 2] = 54; //@line 1102
   $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 1103
   HEAP32[$24 >> 2] = $2; //@line 1104
   $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 1105
   HEAP32[$25 >> 2] = $18; //@line 1106
   $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 1107
   HEAP32[$26 >> 2] = $19; //@line 1108
   $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 1109
   HEAP32[$27 >> 2] = $4; //@line 1110
   $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 1111
   $$expand_i1_val = $6 & 1; //@line 1112
   HEAP8[$28 >> 0] = $$expand_i1_val; //@line 1113
   $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 1114
   HEAP32[$29 >> 2] = $8; //@line 1115
   $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 1116
   HEAP32[$30 >> 2] = $10; //@line 1117
   sp = STACKTOP; //@line 1118
   return;
  }
 } while (0);
 $34 = HEAP32[91] | 0; //@line 1122
 $35 = HEAP32[84] | 0; //@line 1123
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 1124
 FUNCTION_TABLE_vi[$34 & 255]($35); //@line 1125
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 1128
  sp = STACKTOP; //@line 1129
  return;
 }
 ___async_unwind = 0; //@line 1132
 HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 1133
 sp = STACKTOP; //@line 1134
 return;
}
function _mbed_vtracef__async_cb_12($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 1144
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1146
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1148
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1150
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1152
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 1155
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1157
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1159
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1161
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1163
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1165
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1167
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1169
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 1171
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 1173
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 1175
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 1177
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 1179
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 1181
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 1183
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 1185
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 1187
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 1189
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 1191
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 1193
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 1195
 $55 = ($50 | 0 ? 4 : 0) + $50 + (HEAP32[___async_retval >> 2] | 0) | 0; //@line 1201
 $56 = HEAP32[89] | 0; //@line 1202
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(100) | 0; //@line 1203
 $57 = FUNCTION_TABLE_ii[$56 & 1]($55) | 0; //@line 1204
 if (!___async) {
  HEAP32[___async_retval >> 2] = $57; //@line 1208
  ___async_unwind = 0; //@line 1209
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 52; //@line 1211
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 1213
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 1215
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $12; //@line 1217
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $14; //@line 1219
 HEAP8[$ReallocAsyncCtx5 + 20 >> 0] = $10 & 1; //@line 1222
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $16; //@line 1224
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $18; //@line 1226
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $20; //@line 1228
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $22; //@line 1230
 HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $24; //@line 1232
 HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $6; //@line 1234
 HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $8; //@line 1236
 HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $26; //@line 1238
 HEAP32[$ReallocAsyncCtx5 + 56 >> 2] = $28; //@line 1240
 HEAP32[$ReallocAsyncCtx5 + 60 >> 2] = $30; //@line 1242
 HEAP32[$ReallocAsyncCtx5 + 64 >> 2] = $32; //@line 1244
 HEAP32[$ReallocAsyncCtx5 + 68 >> 2] = $34; //@line 1246
 HEAP32[$ReallocAsyncCtx5 + 72 >> 2] = $36; //@line 1248
 HEAP32[$ReallocAsyncCtx5 + 76 >> 2] = $38; //@line 1250
 HEAP32[$ReallocAsyncCtx5 + 80 >> 2] = $40; //@line 1252
 HEAP32[$ReallocAsyncCtx5 + 84 >> 2] = $42; //@line 1254
 HEAP32[$ReallocAsyncCtx5 + 88 >> 2] = $44; //@line 1256
 HEAP32[$ReallocAsyncCtx5 + 92 >> 2] = $46; //@line 1258
 HEAP32[$ReallocAsyncCtx5 + 96 >> 2] = $48; //@line 1260
 sp = STACKTOP; //@line 1261
 return;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $12 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $29 = 0, $3 = 0, $36 = 0, $39 = 0, $40 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx14 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 12155
 STACKTOP = STACKTOP + 48 | 0; //@line 12156
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 12156
 $vararg_buffer10 = sp + 32 | 0; //@line 12157
 $vararg_buffer7 = sp + 24 | 0; //@line 12158
 $vararg_buffer3 = sp + 16 | 0; //@line 12159
 $vararg_buffer = sp; //@line 12160
 $0 = sp + 36 | 0; //@line 12161
 $1 = ___cxa_get_globals_fast() | 0; //@line 12162
 if ($1 | 0) {
  $3 = HEAP32[$1 >> 2] | 0; //@line 12165
  if ($3 | 0) {
   $7 = $3 + 48 | 0; //@line 12170
   $9 = HEAP32[$7 >> 2] | 0; //@line 12172
   $12 = HEAP32[$7 + 4 >> 2] | 0; //@line 12175
   if (!(($9 & -256 | 0) == 1126902528 & ($12 | 0) == 1129074247)) {
    HEAP32[$vararg_buffer7 >> 2] = 5104; //@line 12181
    _abort_message(5054, $vararg_buffer7); //@line 12182
   }
   if (($9 | 0) == 1126902529 & ($12 | 0) == 1129074247) {
    $22 = HEAP32[$3 + 44 >> 2] | 0; //@line 12191
   } else {
    $22 = $3 + 80 | 0; //@line 12193
   }
   HEAP32[$0 >> 2] = $22; //@line 12195
   $23 = HEAP32[$3 >> 2] | 0; //@line 12196
   $25 = HEAP32[$23 + 4 >> 2] | 0; //@line 12198
   $28 = HEAP32[(HEAP32[38] | 0) + 16 >> 2] | 0; //@line 12201
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 12202
   $29 = FUNCTION_TABLE_iiii[$28 & 7](152, $23, $0) | 0; //@line 12203
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 141; //@line 12206
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 12208
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 12210
    HEAP32[$AsyncCtx + 12 >> 2] = $25; //@line 12212
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 12214
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 12216
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 12218
    sp = STACKTOP; //@line 12219
    STACKTOP = sp; //@line 12220
    return;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 12222
   if (!$29) {
    HEAP32[$vararg_buffer3 >> 2] = 5104; //@line 12224
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 12226
    _abort_message(5013, $vararg_buffer3); //@line 12227
   }
   $36 = HEAP32[$0 >> 2] | 0; //@line 12230
   $39 = HEAP32[(HEAP32[$36 >> 2] | 0) + 8 >> 2] | 0; //@line 12233
   $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 12234
   $40 = FUNCTION_TABLE_ii[$39 & 1]($36) | 0; //@line 12235
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 142; //@line 12238
    HEAP32[$AsyncCtx14 + 4 >> 2] = $vararg_buffer; //@line 12240
    HEAP32[$AsyncCtx14 + 8 >> 2] = $25; //@line 12242
    HEAP32[$AsyncCtx14 + 12 >> 2] = $vararg_buffer; //@line 12244
    sp = STACKTOP; //@line 12245
    STACKTOP = sp; //@line 12246
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 12248
    HEAP32[$vararg_buffer >> 2] = 5104; //@line 12249
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 12251
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 12253
    _abort_message(4968, $vararg_buffer); //@line 12254
   }
  }
 }
 _abort_message(5092, $vararg_buffer10); //@line 12259
}
function _mbed_error_vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13969
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13971
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13973
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13975
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[1435] | 0)) {
  _serial_init(5744, 2, 3); //@line 13983
 }
 $9 = HEAP8[$4 >> 0] | 0; //@line 13985
 if (0 == 13 | $9 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 13991
  _serial_putc(5744, $9 << 24 >> 24); //@line 13992
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 13995
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 13996
   HEAP32[$18 >> 2] = 0; //@line 13997
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 13998
   HEAP32[$19 >> 2] = $AsyncRetVal; //@line 13999
   $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 14000
   HEAP32[$20 >> 2] = $2; //@line 14001
   $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 14002
   HEAP8[$21 >> 0] = $9; //@line 14003
   $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 14004
   HEAP32[$22 >> 2] = $4; //@line 14005
   sp = STACKTOP; //@line 14006
   return;
  }
  ___async_unwind = 0; //@line 14009
  HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 14010
  $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 14011
  HEAP32[$18 >> 2] = 0; //@line 14012
  $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 14013
  HEAP32[$19 >> 2] = $AsyncRetVal; //@line 14014
  $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 14015
  HEAP32[$20 >> 2] = $2; //@line 14016
  $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 14017
  HEAP8[$21 >> 0] = $9; //@line 14018
  $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 14019
  HEAP32[$22 >> 2] = $4; //@line 14020
  sp = STACKTOP; //@line 14021
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 14024
  _serial_putc(5744, 13); //@line 14025
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 94; //@line 14028
   $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 14029
   HEAP8[$12 >> 0] = $9; //@line 14030
   $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 14031
   HEAP32[$13 >> 2] = 0; //@line 14032
   $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 14033
   HEAP32[$14 >> 2] = $AsyncRetVal; //@line 14034
   $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 14035
   HEAP32[$15 >> 2] = $2; //@line 14036
   $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 14037
   HEAP32[$16 >> 2] = $4; //@line 14038
   sp = STACKTOP; //@line 14039
   return;
  }
  ___async_unwind = 0; //@line 14042
  HEAP32[$ReallocAsyncCtx3 >> 2] = 94; //@line 14043
  $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 14044
  HEAP8[$12 >> 0] = $9; //@line 14045
  $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 14046
  HEAP32[$13 >> 2] = 0; //@line 14047
  $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 14048
  HEAP32[$14 >> 2] = $AsyncRetVal; //@line 14049
  $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 14050
  HEAP32[$15 >> 2] = $2; //@line 14051
  $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 14052
  HEAP32[$16 >> 2] = $4; //@line 14053
  sp = STACKTOP; //@line 14054
  return;
 }
}
function _initialize__async_cb_53($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $17 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4516
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4518
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4520
 $6 = HEAP8[$0 + 12 >> 0] | 0; //@line 4522
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4524
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4526
 $12 = 7 << 32 + -4; //@line 4528
 $13 = ___muldi3($12 | 0, 0, 1e6, 0) | 0; //@line 4529
 $14 = tempRet0; //@line 4530
 $15 = _i64Add($4 | 0, 0, -1, -1) | 0; //@line 4531
 $17 = _i64Add($15 | 0, tempRet0 | 0, $13 | 0, $14 | 0) | 0; //@line 4533
 $19 = ___udivdi3($17 | 0, tempRet0 | 0, $4 | 0, 0) | 0; //@line 4535
 $20 = tempRet0; //@line 4536
 $21 = HEAP32[$2 >> 2] | 0; //@line 4537
 HEAP32[$21 >> 2] = 0; //@line 4538
 HEAP32[$21 + 4 >> 2] = 0; //@line 4540
 $25 = HEAP32[(HEAP32[$8 >> 2] | 0) + 4 >> 2] | 0; //@line 4543
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 4544
 $26 = FUNCTION_TABLE_i[$25 & 3]() | 0; //@line 4545
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 4548
  $27 = $ReallocAsyncCtx3 + 4 | 0; //@line 4549
  HEAP32[$27 >> 2] = $2; //@line 4550
  $28 = $ReallocAsyncCtx3 + 8 | 0; //@line 4551
  HEAP32[$28 >> 2] = $4; //@line 4552
  $29 = $ReallocAsyncCtx3 + 12 | 0; //@line 4553
  HEAP8[$29 >> 0] = $6; //@line 4554
  $30 = $ReallocAsyncCtx3 + 16 | 0; //@line 4555
  HEAP32[$30 >> 2] = 32; //@line 4556
  $31 = $ReallocAsyncCtx3 + 20 | 0; //@line 4557
  HEAP32[$31 >> 2] = $12; //@line 4558
  $32 = $ReallocAsyncCtx3 + 24 | 0; //@line 4559
  $33 = $32; //@line 4560
  $34 = $33; //@line 4561
  HEAP32[$34 >> 2] = $19; //@line 4562
  $35 = $33 + 4 | 0; //@line 4563
  $36 = $35; //@line 4564
  HEAP32[$36 >> 2] = $20; //@line 4565
  $37 = $ReallocAsyncCtx3 + 32 | 0; //@line 4566
  HEAP32[$37 >> 2] = $8; //@line 4567
  $38 = $ReallocAsyncCtx3 + 36 | 0; //@line 4568
  HEAP32[$38 >> 2] = $10; //@line 4569
  sp = STACKTOP; //@line 4570
  return;
 }
 HEAP32[___async_retval >> 2] = $26; //@line 4574
 ___async_unwind = 0; //@line 4575
 HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 4576
 $27 = $ReallocAsyncCtx3 + 4 | 0; //@line 4577
 HEAP32[$27 >> 2] = $2; //@line 4578
 $28 = $ReallocAsyncCtx3 + 8 | 0; //@line 4579
 HEAP32[$28 >> 2] = $4; //@line 4580
 $29 = $ReallocAsyncCtx3 + 12 | 0; //@line 4581
 HEAP8[$29 >> 0] = $6; //@line 4582
 $30 = $ReallocAsyncCtx3 + 16 | 0; //@line 4583
 HEAP32[$30 >> 2] = 32; //@line 4584
 $31 = $ReallocAsyncCtx3 + 20 | 0; //@line 4585
 HEAP32[$31 >> 2] = $12; //@line 4586
 $32 = $ReallocAsyncCtx3 + 24 | 0; //@line 4587
 $33 = $32; //@line 4588
 $34 = $33; //@line 4589
 HEAP32[$34 >> 2] = $19; //@line 4590
 $35 = $33 + 4 | 0; //@line 4591
 $36 = $35; //@line 4592
 HEAP32[$36 >> 2] = $20; //@line 4593
 $37 = $ReallocAsyncCtx3 + 32 | 0; //@line 4594
 HEAP32[$37 >> 2] = $8; //@line 4595
 $38 = $ReallocAsyncCtx3 + 36 | 0; //@line 4596
 HEAP32[$38 >> 2] = $10; //@line 4597
 sp = STACKTOP; //@line 4598
 return;
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_64($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $37 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 5352
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5354
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5356
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5358
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5360
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5362
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5364
 $14 = $0 + 32 | 0; //@line 5366
 $16 = HEAP32[$14 >> 2] | 0; //@line 5368
 $19 = HEAP32[$14 + 4 >> 2] | 0; //@line 5371
 $20 = HEAP32[$2 >> 2] | 0; //@line 5372
 if ($20 | 0) {
  $23 = HEAP32[$20 + 4 >> 2] | 0; //@line 5376
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 5377
  FUNCTION_TABLE_vii[$23 & 3]($6, $8); //@line 5378
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 124; //@line 5381
   $24 = $ReallocAsyncCtx3 + 4 | 0; //@line 5382
   HEAP32[$24 >> 2] = $10; //@line 5383
   $25 = $ReallocAsyncCtx3 + 8 | 0; //@line 5384
   HEAP32[$25 >> 2] = $4; //@line 5385
   $26 = $ReallocAsyncCtx3 + 12 | 0; //@line 5386
   HEAP32[$26 >> 2] = $12; //@line 5387
   $27 = $ReallocAsyncCtx3 + 16 | 0; //@line 5388
   $28 = $27; //@line 5389
   $29 = $28; //@line 5390
   HEAP32[$29 >> 2] = $16; //@line 5391
   $30 = $28 + 4 | 0; //@line 5392
   $31 = $30; //@line 5393
   HEAP32[$31 >> 2] = $19; //@line 5394
   $32 = $ReallocAsyncCtx3 + 24 | 0; //@line 5395
   HEAP32[$32 >> 2] = $2; //@line 5396
   $33 = $ReallocAsyncCtx3 + 28 | 0; //@line 5397
   HEAP32[$33 >> 2] = $8; //@line 5398
   sp = STACKTOP; //@line 5399
   return;
  }
  ___async_unwind = 0; //@line 5402
  HEAP32[$ReallocAsyncCtx3 >> 2] = 124; //@line 5403
  $24 = $ReallocAsyncCtx3 + 4 | 0; //@line 5404
  HEAP32[$24 >> 2] = $10; //@line 5405
  $25 = $ReallocAsyncCtx3 + 8 | 0; //@line 5406
  HEAP32[$25 >> 2] = $4; //@line 5407
  $26 = $ReallocAsyncCtx3 + 12 | 0; //@line 5408
  HEAP32[$26 >> 2] = $12; //@line 5409
  $27 = $ReallocAsyncCtx3 + 16 | 0; //@line 5410
  $28 = $27; //@line 5411
  $29 = $28; //@line 5412
  HEAP32[$29 >> 2] = $16; //@line 5413
  $30 = $28 + 4 | 0; //@line 5414
  $31 = $30; //@line 5415
  HEAP32[$31 >> 2] = $19; //@line 5416
  $32 = $ReallocAsyncCtx3 + 24 | 0; //@line 5417
  HEAP32[$32 >> 2] = $2; //@line 5418
  $33 = $ReallocAsyncCtx3 + 28 | 0; //@line 5419
  HEAP32[$33 >> 2] = $8; //@line 5420
  sp = STACKTOP; //@line 5421
  return;
 }
 HEAP32[$4 >> 2] = 0; //@line 5424
 __ZN4mbed6Ticker5setupEy($12, $16, $19); //@line 5425
 $34 = HEAP32[$2 >> 2] | 0; //@line 5426
 if (!$34) {
  return;
 }
 $37 = HEAP32[$34 + 8 >> 2] | 0; //@line 5432
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 5433
 FUNCTION_TABLE_vi[$37 & 255]($8); //@line 5434
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 125; //@line 5437
  sp = STACKTOP; //@line 5438
  return;
 }
 ___async_unwind = 0; //@line 5441
 HEAP32[$ReallocAsyncCtx4 >> 2] = 125; //@line 5442
 sp = STACKTOP; //@line 5443
 return;
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7169
 STACKTOP = STACKTOP + 48 | 0; //@line 7170
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 7170
 $vararg_buffer3 = sp + 16 | 0; //@line 7171
 $vararg_buffer = sp; //@line 7172
 $3 = sp + 32 | 0; //@line 7173
 $4 = $0 + 28 | 0; //@line 7174
 $5 = HEAP32[$4 >> 2] | 0; //@line 7175
 HEAP32[$3 >> 2] = $5; //@line 7176
 $7 = $0 + 20 | 0; //@line 7178
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 7180
 HEAP32[$3 + 4 >> 2] = $9; //@line 7181
 HEAP32[$3 + 8 >> 2] = $1; //@line 7183
 HEAP32[$3 + 12 >> 2] = $2; //@line 7185
 $12 = $9 + $2 | 0; //@line 7186
 $13 = $0 + 60 | 0; //@line 7187
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 7190
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 7192
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 7194
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 7196
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 7200
  } else {
   $$04756 = 2; //@line 7202
   $$04855 = $12; //@line 7202
   $$04954 = $3; //@line 7202
   $27 = $17; //@line 7202
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 7208
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 7210
    $38 = $27 >>> 0 > $37 >>> 0; //@line 7211
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 7213
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 7215
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 7217
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 7220
    $44 = $$150 + 4 | 0; //@line 7221
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 7224
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 7227
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 7229
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 7231
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 7233
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 7236
     break L1;
    } else {
     $$04756 = $$1; //@line 7239
     $$04954 = $$150; //@line 7239
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 7243
   HEAP32[$4 >> 2] = 0; //@line 7244
   HEAP32[$7 >> 2] = 0; //@line 7245
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 7248
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 7251
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 7256
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 7262
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 7267
  $25 = $20; //@line 7268
  HEAP32[$4 >> 2] = $25; //@line 7269
  HEAP32[$7 >> 2] = $25; //@line 7270
  $$051 = $2; //@line 7271
 }
 STACKTOP = sp; //@line 7273
 return $$051 | 0; //@line 7273
}
function _mbed_error_vfprintf__async_cb_1($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 14
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 15
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP8[$10 + $12 >> 0] | 0; //@line 21
 if ((HEAP8[$0 + 16 >> 0] | 0) == 13 | $13 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 27
  _serial_putc(5744, $13 << 24 >> 24); //@line 28
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 31
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 32
   HEAP32[$22 >> 2] = $12; //@line 33
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 34
   HEAP32[$23 >> 2] = $4; //@line 35
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 36
   HEAP32[$24 >> 2] = $6; //@line 37
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 38
   HEAP8[$25 >> 0] = $13; //@line 39
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 40
   HEAP32[$26 >> 2] = $10; //@line 41
   sp = STACKTOP; //@line 42
   return;
  }
  ___async_unwind = 0; //@line 45
  HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 46
  $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 47
  HEAP32[$22 >> 2] = $12; //@line 48
  $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 49
  HEAP32[$23 >> 2] = $4; //@line 50
  $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 51
  HEAP32[$24 >> 2] = $6; //@line 52
  $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 53
  HEAP8[$25 >> 0] = $13; //@line 54
  $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 55
  HEAP32[$26 >> 2] = $10; //@line 56
  sp = STACKTOP; //@line 57
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 60
  _serial_putc(5744, 13); //@line 61
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 94; //@line 64
   $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 65
   HEAP8[$16 >> 0] = $13; //@line 66
   $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 67
   HEAP32[$17 >> 2] = $12; //@line 68
   $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 69
   HEAP32[$18 >> 2] = $4; //@line 70
   $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 71
   HEAP32[$19 >> 2] = $6; //@line 72
   $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 73
   HEAP32[$20 >> 2] = $10; //@line 74
   sp = STACKTOP; //@line 75
   return;
  }
  ___async_unwind = 0; //@line 78
  HEAP32[$ReallocAsyncCtx3 >> 2] = 94; //@line 79
  $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 80
  HEAP8[$16 >> 0] = $13; //@line 81
  $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 82
  HEAP32[$17 >> 2] = $12; //@line 83
  $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 84
  HEAP32[$18 >> 2] = $4; //@line 85
  $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 86
  HEAP32[$19 >> 2] = $6; //@line 87
  $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 88
  HEAP32[$20 >> 2] = $10; //@line 89
  sp = STACKTOP; //@line 90
  return;
 }
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
   _mbed_assert_internal(2132, 2137, 528); //@line 624
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
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_37($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2559
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2563
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2565
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 2567
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2569
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 2571
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2573
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2575
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2577
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2579
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 2582
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 2584
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 2588
   $27 = $6 + 24 | 0; //@line 2589
   $28 = $4 + 8 | 0; //@line 2590
   $29 = $6 + 54 | 0; //@line 2591
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
    HEAP8[$10 >> 0] = 0; //@line 2621
    HEAP8[$14 >> 0] = 0; //@line 2622
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 2623
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 2624
    if (!___async) {
     ___async_unwind = 0; //@line 2627
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 156; //@line 2629
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 2631
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 2633
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 2635
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 2637
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 2639
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 2641
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 2643
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 2645
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 2647
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 2649
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 2651
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 2653
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 2655
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 2658
    sp = STACKTOP; //@line 2659
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 2664
 HEAP8[$14 >> 0] = $12; //@line 2665
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2443
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2447
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2449
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 2451
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2453
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 2455
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2457
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2459
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2461
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2463
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 2465
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 2467
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 2469
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 2472
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 2473
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
    HEAP8[$10 >> 0] = 0; //@line 2506
    HEAP8[$14 >> 0] = 0; //@line 2507
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 2508
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 2509
    if (!___async) {
     ___async_unwind = 0; //@line 2512
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 156; //@line 2514
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 2516
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 2518
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 2520
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 2522
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 2524
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 2526
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 2528
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 2530
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 2532
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 2534
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 2536
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 2538
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 2540
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 2543
    sp = STACKTOP; //@line 2544
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 2549
 HEAP8[$14 >> 0] = $12; //@line 2550
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 6648
 }
 ret = dest | 0; //@line 6651
 dest_end = dest + num | 0; //@line 6652
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 6656
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 6657
   dest = dest + 1 | 0; //@line 6658
   src = src + 1 | 0; //@line 6659
   num = num - 1 | 0; //@line 6660
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 6662
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 6663
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 6665
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 6666
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 6667
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 6668
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 6669
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 6670
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 6671
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 6672
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 6673
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 6674
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 6675
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 6676
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 6677
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 6678
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 6679
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 6680
   dest = dest + 64 | 0; //@line 6681
   src = src + 64 | 0; //@line 6682
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 6685
   dest = dest + 4 | 0; //@line 6686
   src = src + 4 | 0; //@line 6687
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 6691
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 6693
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 6694
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 6695
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 6696
   dest = dest + 4 | 0; //@line 6697
   src = src + 4 | 0; //@line 6698
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 6703
  dest = dest + 1 | 0; //@line 6704
  src = src + 1 | 0; //@line 6705
 }
 return ret | 0; //@line 6707
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12344
 STACKTOP = STACKTOP + 64 | 0; //@line 12345
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 12345
 $3 = sp; //@line 12346
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 12349
 } else {
  if (!$1) {
   $$2 = 0; //@line 12353
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 12355
   $6 = ___dynamic_cast($1, 176, 160, 0) | 0; //@line 12356
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 145; //@line 12359
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 12361
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 12363
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 12365
    sp = STACKTOP; //@line 12366
    STACKTOP = sp; //@line 12367
    return 0; //@line 12367
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12369
   if (!$6) {
    $$2 = 0; //@line 12372
   } else {
    dest = $3 + 4 | 0; //@line 12375
    stop = dest + 52 | 0; //@line 12375
    do {
     HEAP32[dest >> 2] = 0; //@line 12375
     dest = dest + 4 | 0; //@line 12375
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 12376
    HEAP32[$3 + 8 >> 2] = $0; //@line 12378
    HEAP32[$3 + 12 >> 2] = -1; //@line 12380
    HEAP32[$3 + 48 >> 2] = 1; //@line 12382
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 12385
    $18 = HEAP32[$2 >> 2] | 0; //@line 12386
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 12387
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 12388
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 146; //@line 12391
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 12393
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 12395
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 12397
     sp = STACKTOP; //@line 12398
     STACKTOP = sp; //@line 12399
     return 0; //@line 12399
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12401
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 12408
     $$0 = 1; //@line 12409
    } else {
     $$0 = 0; //@line 12411
    }
    $$2 = $$0; //@line 12413
   }
  }
 }
 STACKTOP = sp; //@line 12417
 return $$2 | 0; //@line 12417
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 11890
 STACKTOP = STACKTOP + 128 | 0; //@line 11891
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 11891
 $4 = sp + 124 | 0; //@line 11892
 $5 = sp; //@line 11893
 dest = $5; //@line 11894
 src = 964; //@line 11894
 stop = dest + 124 | 0; //@line 11894
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 11894
  dest = dest + 4 | 0; //@line 11894
  src = src + 4 | 0; //@line 11894
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 11900
   $$015 = 1; //@line 11900
   label = 4; //@line 11901
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 11904
   $$0 = -1; //@line 11905
  }
 } else {
  $$014 = $0; //@line 11908
  $$015 = $1; //@line 11908
  label = 4; //@line 11909
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 11913
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 11915
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 11917
  $14 = $5 + 20 | 0; //@line 11918
  HEAP32[$14 >> 2] = $$014; //@line 11919
  HEAP32[$5 + 44 >> 2] = $$014; //@line 11921
  $16 = $$014 + $$$015 | 0; //@line 11922
  $17 = $5 + 16 | 0; //@line 11923
  HEAP32[$17 >> 2] = $16; //@line 11924
  HEAP32[$5 + 28 >> 2] = $16; //@line 11926
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 11927
  $19 = _vfprintf($5, $2, $3) | 0; //@line 11928
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 137; //@line 11931
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 11933
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 11935
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 11937
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 11939
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 11941
   sp = STACKTOP; //@line 11942
   STACKTOP = sp; //@line 11943
   return 0; //@line 11943
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11945
  if (!$$$015) {
   $$0 = $19; //@line 11948
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 11950
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 11955
   $$0 = $19; //@line 11956
  }
 }
 STACKTOP = sp; //@line 11959
 return $$0 | 0; //@line 11959
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13676
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 13682
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 13686
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 13687
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 13688
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 13689
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 162; //@line 13692
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 13694
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 13696
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 13698
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 13700
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 13702
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 13704
    sp = STACKTOP; //@line 13705
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13708
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 13712
    $$0 = $0 + 24 | 0; //@line 13713
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 13715
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 13716
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 13721
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 13727
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 13730
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 163; //@line 13735
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 13737
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 13739
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 13741
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 13743
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 13745
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 13747
    sp = STACKTOP; //@line 13748
    return;
   }
  }
 } while (0);
 return;
}
function _main__async_cb_34($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $16 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2305
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2307
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2309
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2311
 $9 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 2314
 if (!$9) {
  $16 = $2 + 4 | 0; //@line 2318
  HEAP32[$16 >> 2] = 0; //@line 2320
  HEAP32[$16 + 4 >> 2] = 0; //@line 2323
  HEAP32[$2 >> 2] = 8; //@line 2324
  $20 = $2 + 12 | 0; //@line 2325
  HEAP32[$20 >> 2] = 384; //@line 2326
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(16) | 0; //@line 2327
  __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5672, $2, 2.5); //@line 2328
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 117; //@line 2331
   $21 = $ReallocAsyncCtx7 + 4 | 0; //@line 2332
   HEAP32[$21 >> 2] = $20; //@line 2333
   $22 = $ReallocAsyncCtx7 + 8 | 0; //@line 2334
   HEAP32[$22 >> 2] = $4; //@line 2335
   $23 = $ReallocAsyncCtx7 + 12 | 0; //@line 2336
   HEAP32[$23 >> 2] = $2; //@line 2337
   sp = STACKTOP; //@line 2338
   return;
  }
  ___async_unwind = 0; //@line 2341
  HEAP32[$ReallocAsyncCtx7 >> 2] = 117; //@line 2342
  $21 = $ReallocAsyncCtx7 + 4 | 0; //@line 2343
  HEAP32[$21 >> 2] = $20; //@line 2344
  $22 = $ReallocAsyncCtx7 + 8 | 0; //@line 2345
  HEAP32[$22 >> 2] = $4; //@line 2346
  $23 = $ReallocAsyncCtx7 + 12 | 0; //@line 2347
  HEAP32[$23 >> 2] = $2; //@line 2348
  sp = STACKTOP; //@line 2349
  return;
 } else {
  $12 = HEAP32[$9 + 8 >> 2] | 0; //@line 2353
  $ReallocAsyncCtx = _emscripten_realloc_async_context(12) | 0; //@line 2354
  FUNCTION_TABLE_vi[$12 & 255]($6); //@line 2355
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 116; //@line 2358
   $13 = $ReallocAsyncCtx + 4 | 0; //@line 2359
   HEAP32[$13 >> 2] = $2; //@line 2360
   $14 = $ReallocAsyncCtx + 8 | 0; //@line 2361
   HEAP32[$14 >> 2] = $4; //@line 2362
   sp = STACKTOP; //@line 2363
   return;
  }
  ___async_unwind = 0; //@line 2366
  HEAP32[$ReallocAsyncCtx >> 2] = 116; //@line 2367
  $13 = $ReallocAsyncCtx + 4 | 0; //@line 2368
  HEAP32[$13 >> 2] = $2; //@line 2369
  $14 = $ReallocAsyncCtx + 8 | 0; //@line 2370
  HEAP32[$14 >> 2] = $4; //@line 2371
  sp = STACKTOP; //@line 2372
  return;
 }
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11986
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 11991
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 11996
  } else {
   $20 = $0 & 255; //@line 11998
   $21 = $0 & 255; //@line 11999
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 12005
   } else {
    $26 = $1 + 20 | 0; //@line 12007
    $27 = HEAP32[$26 >> 2] | 0; //@line 12008
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 12014
     HEAP8[$27 >> 0] = $20; //@line 12015
     $34 = $21; //@line 12016
    } else {
     label = 12; //@line 12018
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12023
     $32 = ___overflow($1, $0) | 0; //@line 12024
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 139; //@line 12027
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 12029
      sp = STACKTOP; //@line 12030
      return 0; //@line 12031
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 12033
      $34 = $32; //@line 12034
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 12039
   $$0 = $34; //@line 12040
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 12045
   $8 = $0 & 255; //@line 12046
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 12052
    $14 = HEAP32[$13 >> 2] | 0; //@line 12053
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 12059
     HEAP8[$14 >> 0] = $7; //@line 12060
     $$0 = $8; //@line 12061
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12065
   $19 = ___overflow($1, $0) | 0; //@line 12066
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 138; //@line 12069
    sp = STACKTOP; //@line 12070
    return 0; //@line 12071
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12073
    $$0 = $19; //@line 12074
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 12079
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 7879
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 7882
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 7885
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 7888
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 7894
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 7903
     $24 = $13 >>> 2; //@line 7904
     $$090 = 0; //@line 7905
     $$094 = $7; //@line 7905
     while (1) {
      $25 = $$094 >>> 1; //@line 7907
      $26 = $$090 + $25 | 0; //@line 7908
      $27 = $26 << 1; //@line 7909
      $28 = $27 + $23 | 0; //@line 7910
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 7913
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 7917
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 7923
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 7931
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 7935
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 7941
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 7946
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 7949
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 7949
      }
     }
     $46 = $27 + $24 | 0; //@line 7952
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 7955
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 7959
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 7971
     } else {
      $$4 = 0; //@line 7973
     }
    } else {
     $$4 = 0; //@line 7976
    }
   } else {
    $$4 = 0; //@line 7979
   }
  } else {
   $$4 = 0; //@line 7982
  }
 } while (0);
 return $$4 | 0; //@line 7985
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7544
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 7549
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 7554
  } else {
   $20 = $0 & 255; //@line 7556
   $21 = $0 & 255; //@line 7557
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 7563
   } else {
    $26 = $1 + 20 | 0; //@line 7565
    $27 = HEAP32[$26 >> 2] | 0; //@line 7566
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 7572
     HEAP8[$27 >> 0] = $20; //@line 7573
     $34 = $21; //@line 7574
    } else {
     label = 12; //@line 7576
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7581
     $32 = ___overflow($1, $0) | 0; //@line 7582
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 127; //@line 7585
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 7587
      sp = STACKTOP; //@line 7588
      return 0; //@line 7589
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 7591
      $34 = $32; //@line 7592
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 7597
   $$0 = $34; //@line 7598
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 7603
   $8 = $0 & 255; //@line 7604
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 7610
    $14 = HEAP32[$13 >> 2] | 0; //@line 7611
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 7617
     HEAP8[$14 >> 0] = $7; //@line 7618
     $$0 = $8; //@line 7619
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7623
   $19 = ___overflow($1, $0) | 0; //@line 7624
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 126; //@line 7627
    sp = STACKTOP; //@line 7628
    return 0; //@line 7629
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7631
    $$0 = $19; //@line 7632
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 7637
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8264
 $1 = $0 + 20 | 0; //@line 8265
 $3 = $0 + 28 | 0; //@line 8267
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 8273
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8274
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 8275
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 133; //@line 8278
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 8280
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 8282
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 8284
    sp = STACKTOP; //@line 8285
    return 0; //@line 8286
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 8288
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 8292
     break;
    } else {
     label = 5; //@line 8295
     break;
    }
   }
  } else {
   label = 5; //@line 8300
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 8304
  $14 = HEAP32[$13 >> 2] | 0; //@line 8305
  $15 = $0 + 8 | 0; //@line 8306
  $16 = HEAP32[$15 >> 2] | 0; //@line 8307
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 8315
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 8316
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 8317
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 134; //@line 8320
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 8322
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 8324
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 8326
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 8328
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 8330
     sp = STACKTOP; //@line 8331
     return 0; //@line 8332
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8334
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 8340
  HEAP32[$3 >> 2] = 0; //@line 8341
  HEAP32[$1 >> 2] = 0; //@line 8342
  HEAP32[$15 >> 2] = 0; //@line 8343
  HEAP32[$13 >> 2] = 0; //@line 8344
  $$0 = 0; //@line 8345
 }
 return $$0 | 0; //@line 8347
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
 sp = STACKTOP; //@line 1825
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1831
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1833
 $9 = (HEAP32[$0 + 8 >> 2] | 0) + 12 | 0; //@line 1835
 HEAP32[$9 >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 1836
 __ZN4mbed6Ticker6detachEv($6); //@line 1837
 $10 = HEAP32[$9 >> 2] | 0; //@line 1838
 if (!$10) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(12) | 0; //@line 1841
  _mbed_assert_internal(2132, 2137, 528); //@line 1842
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 37; //@line 1845
   $12 = $ReallocAsyncCtx4 + 4 | 0; //@line 1846
   HEAP32[$12 >> 2] = $9; //@line 1847
   $13 = $ReallocAsyncCtx4 + 8 | 0; //@line 1848
   HEAP32[$13 >> 2] = $8; //@line 1849
   sp = STACKTOP; //@line 1850
   return;
  }
  ___async_unwind = 0; //@line 1853
  HEAP32[$ReallocAsyncCtx4 >> 2] = 37; //@line 1854
  $12 = $ReallocAsyncCtx4 + 4 | 0; //@line 1855
  HEAP32[$12 >> 2] = $9; //@line 1856
  $13 = $ReallocAsyncCtx4 + 8 | 0; //@line 1857
  HEAP32[$13 >> 2] = $8; //@line 1858
  sp = STACKTOP; //@line 1859
  return;
 } else {
  $14 = HEAP32[$10 >> 2] | 0; //@line 1862
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 1863
  FUNCTION_TABLE_vi[$14 & 255]($8); //@line 1864
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 38; //@line 1867
   $15 = $ReallocAsyncCtx2 + 4 | 0; //@line 1868
   HEAP32[$15 >> 2] = $9; //@line 1869
   $16 = $ReallocAsyncCtx2 + 8 | 0; //@line 1870
   HEAP32[$16 >> 2] = $8; //@line 1871
   sp = STACKTOP; //@line 1872
   return;
  }
  ___async_unwind = 0; //@line 1875
  HEAP32[$ReallocAsyncCtx2 >> 2] = 38; //@line 1876
  $15 = $ReallocAsyncCtx2 + 4 | 0; //@line 1877
  HEAP32[$15 >> 2] = $9; //@line 1878
  $16 = $ReallocAsyncCtx2 + 8 | 0; //@line 1879
  HEAP32[$16 >> 2] = $8; //@line 1880
  sp = STACKTOP; //@line 1881
  return;
 }
}
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 8028
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 8034
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 8040
   } else {
    $7 = $1 & 255; //@line 8042
    $$03039 = $0; //@line 8043
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 8045
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 8050
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 8053
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 8058
      break;
     } else {
      $$03039 = $13; //@line 8061
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 8065
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 8066
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 8074
     $25 = $18; //@line 8074
     while (1) {
      $24 = $25 ^ $17; //@line 8076
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 8083
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 8086
      $25 = HEAP32[$31 >> 2] | 0; //@line 8087
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 8096
       break;
      } else {
       $$02936 = $31; //@line 8094
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 8101
    }
   } while (0);
   $38 = $1 & 255; //@line 8104
   $$1 = $$029$lcssa; //@line 8105
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 8107
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 8113
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 8116
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 8121
}
function _main__async_cb_33($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $13 = 0, $17 = 0, $18 = 0, $19 = 0, $4 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 2240
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2244
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2246
 $7 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 2247
 if (!$7) {
  $13 = $4 + 4 | 0; //@line 2251
  HEAP32[$13 >> 2] = 0; //@line 2253
  HEAP32[$13 + 4 >> 2] = 0; //@line 2256
  HEAP32[$4 >> 2] = 9; //@line 2257
  $17 = $4 + 12 | 0; //@line 2258
  HEAP32[$17 >> 2] = 384; //@line 2259
  $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 2260
  __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5824, $4); //@line 2261
  if (___async) {
   HEAP32[$ReallocAsyncCtx9 >> 2] = 119; //@line 2264
   $18 = $ReallocAsyncCtx9 + 4 | 0; //@line 2265
   HEAP32[$18 >> 2] = $17; //@line 2266
   $19 = $ReallocAsyncCtx9 + 8 | 0; //@line 2267
   HEAP32[$19 >> 2] = $4; //@line 2268
   sp = STACKTOP; //@line 2269
   return;
  }
  ___async_unwind = 0; //@line 2272
  HEAP32[$ReallocAsyncCtx9 >> 2] = 119; //@line 2273
  $18 = $ReallocAsyncCtx9 + 4 | 0; //@line 2274
  HEAP32[$18 >> 2] = $17; //@line 2275
  $19 = $ReallocAsyncCtx9 + 8 | 0; //@line 2276
  HEAP32[$19 >> 2] = $4; //@line 2277
  sp = STACKTOP; //@line 2278
  return;
 } else {
  $10 = HEAP32[$7 + 8 >> 2] | 0; //@line 2282
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 2283
  FUNCTION_TABLE_vi[$10 & 255]($6); //@line 2284
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 118; //@line 2287
   $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 2288
   HEAP32[$11 >> 2] = $4; //@line 2289
   sp = STACKTOP; //@line 2290
   return;
  }
  ___async_unwind = 0; //@line 2293
  HEAP32[$ReallocAsyncCtx2 >> 2] = 118; //@line 2294
  $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 2295
  HEAP32[$11 >> 2] = $4; //@line 2296
  sp = STACKTOP; //@line 2297
  return;
 }
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 7770
 $4 = HEAP32[$3 >> 2] | 0; //@line 7771
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 7778
   label = 5; //@line 7779
  } else {
   $$1 = 0; //@line 7781
  }
 } else {
  $12 = $4; //@line 7785
  label = 5; //@line 7786
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 7790
   $10 = HEAP32[$9 >> 2] | 0; //@line 7791
   $14 = $10; //@line 7794
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 7799
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 7807
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 7811
       $$141 = $0; //@line 7811
       $$143 = $1; //@line 7811
       $31 = $14; //@line 7811
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 7814
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 7821
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 7826
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 7829
      break L5;
     }
     $$139 = $$038; //@line 7835
     $$141 = $0 + $$038 | 0; //@line 7835
     $$143 = $1 - $$038 | 0; //@line 7835
     $31 = HEAP32[$9 >> 2] | 0; //@line 7835
    } else {
     $$139 = 0; //@line 7837
     $$141 = $0; //@line 7837
     $$143 = $1; //@line 7837
     $31 = $14; //@line 7837
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 7840
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 7843
   $$1 = $$139 + $$143 | 0; //@line 7845
  }
 } while (0);
 return $$1 | 0; //@line 7848
}
function __GLOBAL__sub_I_main_cpp() {
 var $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3550
 HEAP32[1438] = 0; //@line 3551
 HEAP32[1439] = 0; //@line 3551
 HEAP32[1440] = 0; //@line 3551
 HEAP32[1441] = 0; //@line 3551
 HEAP32[1442] = 0; //@line 3551
 HEAP32[1443] = 0; //@line 3551
 _gpio_init_out(5752, 50); //@line 3552
 HEAP32[1444] = 0; //@line 3553
 HEAP32[1445] = 0; //@line 3553
 HEAP32[1446] = 0; //@line 3553
 HEAP32[1447] = 0; //@line 3553
 HEAP32[1448] = 0; //@line 3553
 HEAP32[1449] = 0; //@line 3553
 _gpio_init_out(5776, 52); //@line 3554
 HEAP32[1450] = 0; //@line 3555
 HEAP32[1451] = 0; //@line 3555
 HEAP32[1452] = 0; //@line 3555
 HEAP32[1453] = 0; //@line 3555
 HEAP32[1454] = 0; //@line 3555
 HEAP32[1455] = 0; //@line 3555
 _gpio_init_out(5800, 53); //@line 3556
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3557
 __ZN4mbed10TimerEventC2Ev(5608); //@line 3558
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 107; //@line 3561
  sp = STACKTOP; //@line 3562
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3565
 HEAP32[1402] = 440; //@line 3566
 HEAP32[1412] = 0; //@line 3567
 HEAP32[1413] = 0; //@line 3567
 HEAP32[1414] = 0; //@line 3567
 HEAP32[1415] = 0; //@line 3567
 HEAP8[5664] = 1; //@line 3568
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3569
 __ZN4mbed10TimerEventC2Ev(5672); //@line 3570
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 108; //@line 3573
  sp = STACKTOP; //@line 3574
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3577
  HEAP32[1428] = 0; //@line 3578
  HEAP32[1429] = 0; //@line 3578
  HEAP32[1430] = 0; //@line 3578
  HEAP32[1431] = 0; //@line 3578
  HEAP8[5728] = 1; //@line 3579
  HEAP32[1418] = 288; //@line 3580
  __ZN4mbed11InterruptInC2E7PinName(5824, 1337); //@line 3581
  return;
 }
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_59($0) {
 $0 = $0 | 0;
 var $$phi$trans$insert = 0, $$pre10 = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4999
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5003
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5005
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5007
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5009
 $$phi$trans$insert = (HEAP32[$0 + 4 >> 2] | 0) + 12 | 0; //@line 5010
 $$pre10 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 5011
 if (!$$pre10) {
  HEAP32[$4 >> 2] = 0; //@line 5014
  _gpio_irq_set($10 + 28 | 0, 2, 0); //@line 5016
  return;
 }
 $13 = HEAP32[$$pre10 + 4 >> 2] | 0; //@line 5020
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 5021
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 5022
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 30; //@line 5025
  $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 5026
  HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 5027
  $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 5028
  HEAP32[$15 >> 2] = $4; //@line 5029
  $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 5030
  HEAP32[$16 >> 2] = $8; //@line 5031
  $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 5032
  HEAP32[$17 >> 2] = $10; //@line 5033
  sp = STACKTOP; //@line 5034
  return;
 }
 ___async_unwind = 0; //@line 5037
 HEAP32[$ReallocAsyncCtx4 >> 2] = 30; //@line 5038
 $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 5039
 HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 5040
 $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 5041
 HEAP32[$15 >> 2] = $4; //@line 5042
 $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 5043
 HEAP32[$16 >> 2] = $8; //@line 5044
 $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 5045
 HEAP32[$17 >> 2] = $10; //@line 5046
 sp = STACKTOP; //@line 5047
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_44($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3178
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3182
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3184
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3186
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3188
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3190
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3192
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3194
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 3197
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 3198
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 3214
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 3215
    if (!___async) {
     ___async_unwind = 0; //@line 3218
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 160; //@line 3220
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 3222
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 3224
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 3226
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 3228
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 3230
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 3232
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 3234
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 3236
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 3239
    sp = STACKTOP; //@line 3240
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
 sp = STACKTOP; //@line 7656
 STACKTOP = STACKTOP + 16 | 0; //@line 7657
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7657
 $2 = sp; //@line 7658
 $3 = $1 & 255; //@line 7659
 HEAP8[$2 >> 0] = $3; //@line 7660
 $4 = $0 + 16 | 0; //@line 7661
 $5 = HEAP32[$4 >> 2] | 0; //@line 7662
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 7669
   label = 4; //@line 7670
  } else {
   $$0 = -1; //@line 7672
  }
 } else {
  $12 = $5; //@line 7675
  label = 4; //@line 7676
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 7680
   $10 = HEAP32[$9 >> 2] | 0; //@line 7681
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 7684
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 7691
     HEAP8[$10 >> 0] = $3; //@line 7692
     $$0 = $13; //@line 7693
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 7698
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7699
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 7700
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 128; //@line 7703
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 7705
    sp = STACKTOP; //@line 7706
    STACKTOP = sp; //@line 7707
    return 0; //@line 7707
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 7709
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 7714
   } else {
    $$0 = -1; //@line 7716
   }
  }
 } while (0);
 STACKTOP = sp; //@line 7720
 return $$0 | 0; //@line 7720
}
function _fflush__async_cb_18($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1502
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1504
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 1506
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 1510
  } else {
   $$02327 = $$02325; //@line 1512
   $$02426 = $AsyncRetVal; //@line 1512
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 1519
    } else {
     $16 = 0; //@line 1521
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 1533
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 1536
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 1539
     break L3;
    } else {
     $$02327 = $$023; //@line 1542
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 1545
   $13 = ___fflush_unlocked($$02327) | 0; //@line 1546
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 1550
    ___async_unwind = 0; //@line 1551
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 132; //@line 1553
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 1555
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 1557
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 1559
   sp = STACKTOP; //@line 1560
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 1564
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 1566
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 6712
 value = value & 255; //@line 6714
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 6717
   ptr = ptr + 1 | 0; //@line 6718
  }
  aligned_end = end & -4 | 0; //@line 6721
  block_aligned_end = aligned_end - 64 | 0; //@line 6722
  value4 = value | value << 8 | value << 16 | value << 24; //@line 6723
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 6726
   HEAP32[ptr + 4 >> 2] = value4; //@line 6727
   HEAP32[ptr + 8 >> 2] = value4; //@line 6728
   HEAP32[ptr + 12 >> 2] = value4; //@line 6729
   HEAP32[ptr + 16 >> 2] = value4; //@line 6730
   HEAP32[ptr + 20 >> 2] = value4; //@line 6731
   HEAP32[ptr + 24 >> 2] = value4; //@line 6732
   HEAP32[ptr + 28 >> 2] = value4; //@line 6733
   HEAP32[ptr + 32 >> 2] = value4; //@line 6734
   HEAP32[ptr + 36 >> 2] = value4; //@line 6735
   HEAP32[ptr + 40 >> 2] = value4; //@line 6736
   HEAP32[ptr + 44 >> 2] = value4; //@line 6737
   HEAP32[ptr + 48 >> 2] = value4; //@line 6738
   HEAP32[ptr + 52 >> 2] = value4; //@line 6739
   HEAP32[ptr + 56 >> 2] = value4; //@line 6740
   HEAP32[ptr + 60 >> 2] = value4; //@line 6741
   ptr = ptr + 64 | 0; //@line 6742
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 6746
   ptr = ptr + 4 | 0; //@line 6747
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 6752
  ptr = ptr + 1 | 0; //@line 6753
 }
 return end - num | 0; //@line 6755
}
function _main__async_cb_30($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 2138
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2140
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2142
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2144
 $8 = $6 + 4 | 0; //@line 2146
 HEAP32[$8 >> 2] = 0; //@line 2148
 HEAP32[$8 + 4 >> 2] = 0; //@line 2151
 HEAP32[$6 >> 2] = 7; //@line 2152
 $12 = $6 + 12 | 0; //@line 2153
 HEAP32[$12 >> 2] = 384; //@line 2154
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(20) | 0; //@line 2155
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5608, $6, 1.0); //@line 2156
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 115; //@line 2159
  $13 = $ReallocAsyncCtx8 + 4 | 0; //@line 2160
  HEAP32[$13 >> 2] = $2; //@line 2161
  $14 = $ReallocAsyncCtx8 + 8 | 0; //@line 2162
  HEAP32[$14 >> 2] = $4; //@line 2163
  $15 = $ReallocAsyncCtx8 + 12 | 0; //@line 2164
  HEAP32[$15 >> 2] = $6; //@line 2165
  $16 = $ReallocAsyncCtx8 + 16 | 0; //@line 2166
  HEAP32[$16 >> 2] = $12; //@line 2167
  sp = STACKTOP; //@line 2168
  return;
 }
 ___async_unwind = 0; //@line 2171
 HEAP32[$ReallocAsyncCtx8 >> 2] = 115; //@line 2172
 $13 = $ReallocAsyncCtx8 + 4 | 0; //@line 2173
 HEAP32[$13 >> 2] = $2; //@line 2174
 $14 = $ReallocAsyncCtx8 + 8 | 0; //@line 2175
 HEAP32[$14 >> 2] = $4; //@line 2176
 $15 = $ReallocAsyncCtx8 + 12 | 0; //@line 2177
 HEAP32[$15 >> 2] = $6; //@line 2178
 $16 = $ReallocAsyncCtx8 + 16 | 0; //@line 2179
 HEAP32[$16 >> 2] = $12; //@line 2180
 sp = STACKTOP; //@line 2181
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3115
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3119
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3121
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3123
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3125
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3127
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3129
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 3132
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 3133
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 3142
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 3143
    if (!___async) {
     ___async_unwind = 0; //@line 3146
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 161; //@line 3148
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 3150
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 3152
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 3154
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 3156
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 3158
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 3160
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 3162
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 3165
    sp = STACKTOP; //@line 3166
    return;
   }
  }
 }
 return;
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1403
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 1413
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 1413
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 1413
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 1417
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 1420
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 1423
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 1431
  } else {
   $20 = 0; //@line 1433
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 1443
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 1447
  HEAP32[___async_retval >> 2] = $$1; //@line 1449
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 1452
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 1453
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 1457
  ___async_unwind = 0; //@line 1458
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 132; //@line 1460
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 1462
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 1464
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 1466
 sp = STACKTOP; //@line 1467
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1709
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1711
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1713
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1715
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 1720
  } else {
   $9 = $4 + 4 | 0; //@line 1722
   $10 = HEAP32[$9 >> 2] | 0; //@line 1723
   $11 = $4 + 8 | 0; //@line 1724
   $12 = HEAP32[$11 >> 2] | 0; //@line 1725
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 1729
    HEAP32[$6 >> 2] = 0; //@line 1730
    HEAP32[$2 >> 2] = 0; //@line 1731
    HEAP32[$11 >> 2] = 0; //@line 1732
    HEAP32[$9 >> 2] = 0; //@line 1733
    $$0 = 0; //@line 1734
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 1741
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 1742
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 1743
   if (!___async) {
    ___async_unwind = 0; //@line 1746
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 134; //@line 1748
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 1750
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 1752
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 1754
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 1756
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 1758
   sp = STACKTOP; //@line 1759
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 1764
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4933
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4935
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4937
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4939
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4941
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4943
 $$pre = HEAP32[$2 >> 2] | 0; //@line 4944
 if (!$$pre) {
  HEAP32[$4 >> 2] = 0; //@line 4947
  _gpio_irq_set($10 + 28 | 0, 2, 1); //@line 4949
  return;
 }
 $13 = HEAP32[$$pre + 4 >> 2] | 0; //@line 4953
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 4954
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 4955
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 28; //@line 4958
  $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 4959
  HEAP32[$14 >> 2] = $2; //@line 4960
  $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 4961
  HEAP32[$15 >> 2] = $4; //@line 4962
  $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 4963
  HEAP32[$16 >> 2] = $10; //@line 4964
  sp = STACKTOP; //@line 4965
  return;
 }
 ___async_unwind = 0; //@line 4968
 HEAP32[$ReallocAsyncCtx2 >> 2] = 28; //@line 4969
 $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 4970
 HEAP32[$14 >> 2] = $2; //@line 4971
 $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 4972
 HEAP32[$15 >> 2] = $4; //@line 4973
 $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 4974
 HEAP32[$16 >> 2] = $10; //@line 4975
 sp = STACKTOP; //@line 4976
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 11036
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 11041
    $$0 = 1; //@line 11042
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 11055
     $$0 = 1; //@line 11056
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 11060
     $$0 = -1; //@line 11061
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 11071
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 11075
    $$0 = 2; //@line 11076
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 11088
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 11094
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 11098
    $$0 = 3; //@line 11099
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 11109
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 11115
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 11121
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 11125
    $$0 = 4; //@line 11126
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 11130
    $$0 = -1; //@line 11131
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 11136
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_67($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 5651
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5653
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5655
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5657
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5659
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 5664
  return;
 }
 dest = $2 + 4 | 0; //@line 5668
 stop = dest + 52 | 0; //@line 5668
 do {
  HEAP32[dest >> 2] = 0; //@line 5668
  dest = dest + 4 | 0; //@line 5668
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 5669
 HEAP32[$2 + 8 >> 2] = $4; //@line 5671
 HEAP32[$2 + 12 >> 2] = -1; //@line 5673
 HEAP32[$2 + 48 >> 2] = 1; //@line 5675
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 5678
 $16 = HEAP32[$6 >> 2] | 0; //@line 5679
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 5680
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 5681
 if (!___async) {
  ___async_unwind = 0; //@line 5684
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 146; //@line 5686
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 5688
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 5690
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 5692
 sp = STACKTOP; //@line 5693
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_45($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3251
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3255
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3257
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3259
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3261
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3263
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 3266
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 3267
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 3273
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 3274
   if (!___async) {
    ___async_unwind = 0; //@line 3277
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 159; //@line 3279
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 3281
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 3283
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 3285
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 3287
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 3289
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 3291
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 3294
   sp = STACKTOP; //@line 3295
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
  $$0914 = $2; //@line 9920
  $8 = $0; //@line 9920
  $9 = $1; //@line 9920
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 9922
   $$0914 = $$0914 + -1 | 0; //@line 9926
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 9927
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 9928
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 9936
   }
  }
  $$010$lcssa$off0 = $8; //@line 9941
  $$09$lcssa = $$0914; //@line 9941
 } else {
  $$010$lcssa$off0 = $0; //@line 9943
  $$09$lcssa = $2; //@line 9943
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 9947
 } else {
  $$012 = $$010$lcssa$off0; //@line 9949
  $$111 = $$09$lcssa; //@line 9949
  while (1) {
   $26 = $$111 + -1 | 0; //@line 9954
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 9955
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 9959
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 9962
    $$111 = $26; //@line 9962
   }
  }
 }
 return $$1$lcssa | 0; //@line 9966
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2044
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2046
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2048
 $6 = $2 + 4 | 0; //@line 2050
 HEAP32[$6 >> 2] = 0; //@line 2052
 HEAP32[$6 + 4 >> 2] = 0; //@line 2055
 HEAP32[$2 >> 2] = 8; //@line 2056
 $10 = $2 + 12 | 0; //@line 2057
 HEAP32[$10 >> 2] = 384; //@line 2058
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(16) | 0; //@line 2059
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5672, $2, 2.5); //@line 2060
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 117; //@line 2063
  $11 = $ReallocAsyncCtx7 + 4 | 0; //@line 2064
  HEAP32[$11 >> 2] = $10; //@line 2065
  $12 = $ReallocAsyncCtx7 + 8 | 0; //@line 2066
  HEAP32[$12 >> 2] = $4; //@line 2067
  $13 = $ReallocAsyncCtx7 + 12 | 0; //@line 2068
  HEAP32[$13 >> 2] = $2; //@line 2069
  sp = STACKTOP; //@line 2070
  return;
 }
 ___async_unwind = 0; //@line 2073
 HEAP32[$ReallocAsyncCtx7 >> 2] = 117; //@line 2074
 $11 = $ReallocAsyncCtx7 + 4 | 0; //@line 2075
 HEAP32[$11 >> 2] = $10; //@line 2076
 $12 = $ReallocAsyncCtx7 + 8 | 0; //@line 2077
 HEAP32[$12 >> 2] = $4; //@line 2078
 $13 = $ReallocAsyncCtx7 + 12 | 0; //@line 2079
 HEAP32[$13 >> 2] = $2; //@line 2080
 sp = STACKTOP; //@line 2081
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4832
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4834
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4838
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4840
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4842
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4844
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 4848
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 4851
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 4852
   if (!___async) {
    ___async_unwind = 0; //@line 4855
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 163; //@line 4857
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 4859
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 4861
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 4863
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 4865
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 4867
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 4869
   sp = STACKTOP; //@line 4870
   return;
  }
 }
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 7422
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 7427
   label = 4; //@line 7428
  } else {
   $$01519 = $0; //@line 7430
   $23 = $1; //@line 7430
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 7435
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 7438
    $23 = $6; //@line 7439
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 7443
     label = 4; //@line 7444
     break;
    } else {
     $$01519 = $6; //@line 7447
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 7453
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 7455
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 7463
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 7471
  } else {
   $$pn = $$0; //@line 7473
   while (1) {
    $19 = $$pn + 1 | 0; //@line 7475
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 7479
     break;
    } else {
     $$pn = $19; //@line 7482
    }
   }
  }
  $$sink = $$1$lcssa; //@line 7487
 }
 return $$sink - $1 | 0; //@line 7490
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 12591
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 12598
   $10 = $1 + 16 | 0; //@line 12599
   $11 = HEAP32[$10 >> 2] | 0; //@line 12600
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 12603
    HEAP32[$1 + 24 >> 2] = $4; //@line 12605
    HEAP32[$1 + 36 >> 2] = 1; //@line 12607
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 12617
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 12622
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 12625
    HEAP8[$1 + 54 >> 0] = 1; //@line 12627
    break;
   }
   $21 = $1 + 24 | 0; //@line 12630
   $22 = HEAP32[$21 >> 2] | 0; //@line 12631
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 12634
    $28 = $4; //@line 12635
   } else {
    $28 = $22; //@line 12637
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 12646
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
 sp = STACKTOP; //@line 12085
 $1 = HEAP32[147] | 0; //@line 12086
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 12092
 } else {
  $19 = 0; //@line 12094
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 12100
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 12106
    $12 = HEAP32[$11 >> 2] | 0; //@line 12107
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 12113
     HEAP8[$12 >> 0] = 10; //@line 12114
     $22 = 0; //@line 12115
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 12119
   $17 = ___overflow($1, 10) | 0; //@line 12120
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 140; //@line 12123
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 12125
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 12127
    sp = STACKTOP; //@line 12128
    return 0; //@line 12129
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12131
    $22 = $17 >> 31; //@line 12133
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 12140
 }
 return $22 | 0; //@line 12142
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_60($0) {
 $0 = $0 | 0;
 var $$pre$i$i4 = 0, $12 = 0, $13 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 5053
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5059
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5061
 $$pre$i$i4 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 5062
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = $$pre$i$i4; //@line 5063
 if (!$$pre$i$i4) {
  _gpio_irq_set($8 + 28 | 0, 2, 0); //@line 5067
  return;
 }
 $12 = HEAP32[$$pre$i$i4 + 8 >> 2] | 0; //@line 5072
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(12) | 0; //@line 5073
 FUNCTION_TABLE_vi[$12 & 255]($6); //@line 5074
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 5077
  $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 5078
  HEAP32[$13 >> 2] = $6; //@line 5079
  $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 5080
  HEAP32[$14 >> 2] = $8; //@line 5081
  sp = STACKTOP; //@line 5082
  return;
 }
 ___async_unwind = 0; //@line 5085
 HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 5086
 $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 5087
 HEAP32[$13 >> 2] = $6; //@line 5088
 $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 5089
 HEAP32[$14 >> 2] = $8; //@line 5090
 sp = STACKTOP; //@line 5091
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
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_57($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4880
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4886
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4888
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4890
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4892
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 4897
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 4899
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 4900
 if (!___async) {
  ___async_unwind = 0; //@line 4903
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 163; //@line 4905
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 4907
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 4909
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 4911
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 4913
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 4915
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 4917
 sp = STACKTOP; //@line 4918
 return;
}
function _mbed_vtracef__async_cb_7($0) {
 $0 = $0 | 0;
 var $$18 = 0, $10 = 0, $12 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 882
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 884
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 886
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 888
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 893
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 895
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 900
 $16 = _snprintf($4, $6, 1627, $2) | 0; //@line 901
 $$18 = ($16 | 0) >= ($6 | 0) ? 0 : $16; //@line 903
 $19 = $4 + $$18 | 0; //@line 905
 $20 = $6 - $$18 | 0; //@line 906
 if (($$18 | 0) > 0) {
  if (!(($$18 | 0) < 1 | ($20 | 0) < 1 | $10 ^ 1)) {
   _snprintf($19, $20, 1705, $12) | 0; //@line 914
  }
 }
 $23 = HEAP32[91] | 0; //@line 917
 $24 = HEAP32[84] | 0; //@line 918
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 919
 FUNCTION_TABLE_vi[$23 & 255]($24); //@line 920
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 923
  sp = STACKTOP; //@line 924
  return;
 }
 ___async_unwind = 0; //@line 927
 HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 928
 sp = STACKTOP; //@line 929
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12450
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 12459
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 12464
      HEAP32[$13 >> 2] = $2; //@line 12465
      $19 = $1 + 40 | 0; //@line 12466
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 12469
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 12479
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 12483
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 12490
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
 $$016 = 0; //@line 11156
 while (1) {
  if ((HEAPU8[3076 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 11163
   break;
  }
  $7 = $$016 + 1 | 0; //@line 11166
  if (($7 | 0) == 87) {
   $$01214 = 3164; //@line 11169
   $$115 = 87; //@line 11169
   label = 5; //@line 11170
   break;
  } else {
   $$016 = $7; //@line 11173
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 3164; //@line 11179
  } else {
   $$01214 = 3164; //@line 11181
   $$115 = $$016; //@line 11181
   label = 5; //@line 11182
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 11187
   $$113 = $$01214; //@line 11188
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 11192
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 11199
   if (!$$115) {
    $$012$lcssa = $$113; //@line 11202
    break;
   } else {
    $$01214 = $$113; //@line 11205
    label = 5; //@line 11206
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 11213
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4767
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4769
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4771
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4773
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 4775
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 4777
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 5104; //@line 4782
  HEAP32[$4 + 4 >> 2] = $6; //@line 4784
  _abort_message(5013, $4); //@line 4785
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 4788
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 4791
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 4792
 $16 = FUNCTION_TABLE_ii[$15 & 1]($12) | 0; //@line 4793
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 4797
  ___async_unwind = 0; //@line 4798
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 142; //@line 4800
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 4802
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 4804
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 4806
 sp = STACKTOP; //@line 4807
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5114
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5116
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5118
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5122
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 5126
  label = 4; //@line 5127
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 5132
   label = 4; //@line 5133
  } else {
   $$037$off039 = 3; //@line 5135
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 5139
  $17 = $8 + 40 | 0; //@line 5140
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 5143
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 5153
    $$037$off039 = $$037$off038; //@line 5154
   } else {
    $$037$off039 = $$037$off038; //@line 5156
   }
  } else {
   $$037$off039 = $$037$off038; //@line 5159
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 5162
 return;
}
function _strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $2 = 0, $5 = 0;
 $2 = HEAP8[$1 >> 0] | 0; //@line 11229
 do {
  if (!($2 << 24 >> 24)) {
   $$0 = $0; //@line 11233
  } else {
   $5 = _strchr($0, $2 << 24 >> 24) | 0; //@line 11236
   if (!$5) {
    $$0 = 0; //@line 11239
   } else {
    if (!(HEAP8[$1 + 1 >> 0] | 0)) {
     $$0 = $5; //@line 11245
    } else {
     if (!(HEAP8[$5 + 1 >> 0] | 0)) {
      $$0 = 0; //@line 11251
     } else {
      if (!(HEAP8[$1 + 2 >> 0] | 0)) {
       $$0 = _twobyte_strstr($5, $1) | 0; //@line 11258
       break;
      }
      if (!(HEAP8[$5 + 2 >> 0] | 0)) {
       $$0 = 0; //@line 11265
      } else {
       if (!(HEAP8[$1 + 3 >> 0] | 0)) {
        $$0 = _threebyte_strstr($5, $1) | 0; //@line 11272
        break;
       }
       if (!(HEAP8[$5 + 3 >> 0] | 0)) {
        $$0 = 0; //@line 11279
       } else {
        if (!(HEAP8[$1 + 4 >> 0] | 0)) {
         $$0 = _fourbyte_strstr($5, $1) | 0; //@line 11286
         break;
        } else {
         $$0 = _twoway_strstr($5, $1) | 0; //@line 11290
         break;
        }
       }
      }
     }
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 11300
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
function __ZN4mbed6TickerD0Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3388
 HEAP32[$0 >> 2] = 440; //@line 3389
 $1 = $0 + 40 | 0; //@line 3390
 _emscripten_asm_const_ii(7, $1 | 0) | 0; //@line 3391
 $4 = HEAP32[$0 + 52 >> 2] | 0; //@line 3393
 do {
  if ($4 | 0) {
   $7 = HEAP32[$4 + 8 >> 2] | 0; //@line 3398
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3399
   FUNCTION_TABLE_vi[$7 & 255]($1); //@line 3400
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
function _fourbyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$lcssa = 0, $$sink21$lcssa = 0, $$sink2123 = 0, $18 = 0, $32 = 0, $33 = 0, $35 = 0, $39 = 0, $40 = 0, $41 = 0;
 $18 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8 | (HEAPU8[$1 + 3 >> 0] | 0); //@line 11425
 $32 = $0 + 3 | 0; //@line 11439
 $33 = HEAP8[$32 >> 0] | 0; //@line 11440
 $35 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | (HEAPU8[$0 + 2 >> 0] | 0) << 8 | $33 & 255; //@line 11442
 if ($33 << 24 >> 24 == 0 | ($35 | 0) == ($18 | 0)) {
  $$lcssa = $33; //@line 11447
  $$sink21$lcssa = $32; //@line 11447
 } else {
  $$sink2123 = $32; //@line 11449
  $39 = $35; //@line 11449
  while (1) {
   $40 = $$sink2123 + 1 | 0; //@line 11452
   $41 = HEAP8[$40 >> 0] | 0; //@line 11453
   $39 = $39 << 8 | $41 & 255; //@line 11455
   if ($41 << 24 >> 24 == 0 | ($39 | 0) == ($18 | 0)) {
    $$lcssa = $41; //@line 11460
    $$sink21$lcssa = $40; //@line 11460
    break;
   } else {
    $$sink2123 = $40; //@line 11463
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$sink21$lcssa + -3 | 0 : 0) | 0; //@line 11470
}
function _main__async_cb_28($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 2087
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2089
 $4 = $2 + 4 | 0; //@line 2091
 HEAP32[$4 >> 2] = 0; //@line 2093
 HEAP32[$4 + 4 >> 2] = 0; //@line 2096
 HEAP32[$2 >> 2] = 9; //@line 2097
 $8 = $2 + 12 | 0; //@line 2098
 HEAP32[$8 >> 2] = 384; //@line 2099
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 2100
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5824, $2); //@line 2101
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 119; //@line 2104
  $9 = $ReallocAsyncCtx9 + 4 | 0; //@line 2105
  HEAP32[$9 >> 2] = $8; //@line 2106
  $10 = $ReallocAsyncCtx9 + 8 | 0; //@line 2107
  HEAP32[$10 >> 2] = $2; //@line 2108
  sp = STACKTOP; //@line 2109
  return;
 }
 ___async_unwind = 0; //@line 2112
 HEAP32[$ReallocAsyncCtx9 >> 2] = 119; //@line 2113
 $9 = $ReallocAsyncCtx9 + 4 | 0; //@line 2114
 HEAP32[$9 >> 2] = $8; //@line 2115
 $10 = $ReallocAsyncCtx9 + 8 | 0; //@line 2116
 HEAP32[$10 >> 2] = $2; //@line 2117
 sp = STACKTOP; //@line 2118
 return;
}
function _mbed_vtracef__async_cb_13($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1267
 $3 = HEAP32[92] | 0; //@line 1271
 if (HEAP8[$0 + 4 >> 0] & 1 & ($3 | 0) != 0) {
  $5 = HEAP32[84] | 0; //@line 1275
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 1276
  FUNCTION_TABLE_vi[$3 & 255]($5); //@line 1277
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 48; //@line 1280
   sp = STACKTOP; //@line 1281
   return;
  }
  ___async_unwind = 0; //@line 1284
  HEAP32[$ReallocAsyncCtx2 >> 2] = 48; //@line 1285
  sp = STACKTOP; //@line 1286
  return;
 } else {
  $6 = HEAP32[91] | 0; //@line 1289
  $7 = HEAP32[84] | 0; //@line 1290
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 1291
  FUNCTION_TABLE_vi[$6 & 255]($7); //@line 1292
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 50; //@line 1295
   sp = STACKTOP; //@line 1296
   return;
  }
  ___async_unwind = 0; //@line 1299
  HEAP32[$ReallocAsyncCtx4 >> 2] = 50; //@line 1300
  sp = STACKTOP; //@line 1301
  return;
 }
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3455
 $2 = $0 + 12 | 0; //@line 3457
 $3 = HEAP32[$2 >> 2] | 0; //@line 3458
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 3462
   _mbed_assert_internal(2132, 2137, 528); //@line 3463
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 104; //@line 3466
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 3468
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 3470
    sp = STACKTOP; //@line 3471
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 3474
    $8 = HEAP32[$2 >> 2] | 0; //@line 3476
    break;
   }
  } else {
   $8 = $3; //@line 3480
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 3483
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3485
 FUNCTION_TABLE_vi[$7 & 255]($0); //@line 3486
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 105; //@line 3489
  sp = STACKTOP; //@line 3490
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3493
  return;
 }
}
function _abort_message($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12283
 STACKTOP = STACKTOP + 16 | 0; //@line 12284
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12284
 $1 = sp; //@line 12285
 HEAP32[$1 >> 2] = $varargs; //@line 12286
 $2 = HEAP32[115] | 0; //@line 12287
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12288
 _vfprintf($2, $0, $1) | 0; //@line 12289
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 143; //@line 12292
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 12294
  sp = STACKTOP; //@line 12295
  STACKTOP = sp; //@line 12296
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 12298
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12299
 _fputc(10, $2) | 0; //@line 12300
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 144; //@line 12303
  sp = STACKTOP; //@line 12304
  STACKTOP = sp; //@line 12305
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 12307
  _abort(); //@line 12308
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
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_65($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $15 = 0, $17 = 0, $18 = 0, $21 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 5450
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5456
 $8 = $0 + 16 | 0; //@line 5458
 $10 = HEAP32[$8 >> 2] | 0; //@line 5460
 $13 = HEAP32[$8 + 4 >> 2] | 0; //@line 5463
 $15 = HEAP32[$0 + 24 >> 2] | 0; //@line 5465
 $17 = HEAP32[$0 + 28 >> 2] | 0; //@line 5467
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 5469
 __ZN4mbed6Ticker5setupEy($6, $10, $13); //@line 5470
 $18 = HEAP32[$15 >> 2] | 0; //@line 5471
 if (!$18) {
  return;
 }
 $21 = HEAP32[$18 + 8 >> 2] | 0; //@line 5477
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 5478
 FUNCTION_TABLE_vi[$21 & 255]($17); //@line 5479
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 125; //@line 5482
  sp = STACKTOP; //@line 5483
  return;
 }
 ___async_unwind = 0; //@line 5486
 HEAP32[$ReallocAsyncCtx4 >> 2] = 125; //@line 5487
 sp = STACKTOP; //@line 5488
 return;
}
function _threebyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$016$lcssa = 0, $$01618 = 0, $$019 = 0, $$lcssa = 0, $14 = 0, $23 = 0, $24 = 0, $27 = 0, $30 = 0, $31 = 0;
 $14 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8; //@line 11359
 $23 = $0 + 2 | 0; //@line 11368
 $24 = HEAP8[$23 >> 0] | 0; //@line 11369
 $27 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | ($24 & 255) << 8; //@line 11372
 if (($27 | 0) == ($14 | 0) | $24 << 24 >> 24 == 0) {
  $$016$lcssa = $23; //@line 11377
  $$lcssa = $24; //@line 11377
 } else {
  $$01618 = $23; //@line 11379
  $$019 = $27; //@line 11379
  while (1) {
   $30 = $$01618 + 1 | 0; //@line 11381
   $31 = HEAP8[$30 >> 0] | 0; //@line 11382
   $$019 = ($$019 | $31 & 255) << 8; //@line 11385
   if (($$019 | 0) == ($14 | 0) | $31 << 24 >> 24 == 0) {
    $$016$lcssa = $30; //@line 11390
    $$lcssa = $31; //@line 11390
    break;
   } else {
    $$01618 = $30; //@line 11393
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$016$lcssa + -2 | 0 : 0) | 0; //@line 11400
}
function __ZN4mbed6TickerD2Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3347
 HEAP32[$0 >> 2] = 440; //@line 3348
 $1 = $0 + 40 | 0; //@line 3349
 _emscripten_asm_const_ii(7, $1 | 0) | 0; //@line 3350
 $4 = HEAP32[$0 + 52 >> 2] | 0; //@line 3352
 do {
  if ($4 | 0) {
   $7 = HEAP32[$4 + 8 >> 2] | 0; //@line 3357
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3358
   FUNCTION_TABLE_vi[$7 & 255]($1); //@line 3359
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
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 10987
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 10987
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 10988
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 10989
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 10998
    $$016 = $9; //@line 11001
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 11001
   } else {
    $$016 = $0; //@line 11003
    $storemerge = 0; //@line 11003
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 11005
   $$0 = $$016; //@line 11006
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 11010
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 11016
   HEAP32[tempDoublePtr >> 2] = $2; //@line 11019
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 11019
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 11020
  }
 }
 return +$$0;
}
function _main__async_cb_35($0) {
 $0 = $0 | 0;
 var $4 = 0, $5 = 0, $8 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2379
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2383
 $5 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 2384
 if (!$5) {
  $ReallocAsyncCtx10 = _emscripten_realloc_async_context(4) | 0; //@line 2387
  _wait_ms(-1); //@line 2388
  if (___async) {
   HEAP32[$ReallocAsyncCtx10 >> 2] = 121; //@line 2391
   sp = STACKTOP; //@line 2392
   return;
  }
  ___async_unwind = 0; //@line 2395
  HEAP32[$ReallocAsyncCtx10 >> 2] = 121; //@line 2396
  sp = STACKTOP; //@line 2397
  return;
 } else {
  $8 = HEAP32[$5 + 8 >> 2] | 0; //@line 2401
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 2402
  FUNCTION_TABLE_vi[$8 & 255]($4); //@line 2403
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 120; //@line 2406
   sp = STACKTOP; //@line 2407
   return;
  }
  ___async_unwind = 0; //@line 2410
  HEAP32[$ReallocAsyncCtx3 >> 2] = 120; //@line 2411
  sp = STACKTOP; //@line 2412
  return;
 }
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13886
 STACKTOP = STACKTOP + 16 | 0; //@line 13887
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13887
 $3 = sp; //@line 13888
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 13890
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 13893
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 13894
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 13895
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 167; //@line 13898
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 13900
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 13902
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 13904
  sp = STACKTOP; //@line 13905
  STACKTOP = sp; //@line 13906
  return 0; //@line 13906
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 13908
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 13912
 }
 STACKTOP = sp; //@line 13914
 return $8 & 1 | 0; //@line 13914
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $10 = 0, $13 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12806
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 12812
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 12815
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 12818
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 12819
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 12820
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 149; //@line 12823
    sp = STACKTOP; //@line 12824
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12827
    break;
   }
  }
 } while (0);
 return;
}
function _schedule_interrupt__async_cb_41($0) {
 $0 = $0 | 0;
 var $16 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 3051
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3055
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3057
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3059
 $8 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 3060
 if ($4 >>> 0 > $8 >>> 0) {
  if (!($AsyncRetVal >>> 0 >= $4 >>> 0 | $AsyncRetVal >>> 0 < $8 >>> 0)) {
   return;
  }
 } else {
  if (!($AsyncRetVal >>> 0 >= $4 >>> 0 & $AsyncRetVal >>> 0 < $8 >>> 0)) {
   return;
  }
 }
 $16 = HEAP32[(HEAP32[$6 >> 2] | 0) + 20 >> 2] | 0; //@line 3079
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(4) | 0; //@line 3080
 FUNCTION_TABLE_v[$16 & 15](); //@line 3081
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 72; //@line 3084
  sp = STACKTOP; //@line 3085
  return;
 }
 ___async_unwind = 0; //@line 3088
 HEAP32[$ReallocAsyncCtx6 >> 2] = 72; //@line 3089
 sp = STACKTOP; //@line 3090
 return;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5545
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5553
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5555
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 5557
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 5559
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 5561
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 5563
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 5565
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 5576
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 5577
 HEAP32[$10 >> 2] = 0; //@line 5578
 HEAP32[$12 >> 2] = 0; //@line 5579
 HEAP32[$14 >> 2] = 0; //@line 5580
 HEAP32[$2 >> 2] = 0; //@line 5581
 $33 = HEAP32[$16 >> 2] | 0; //@line 5582
 HEAP32[$16 >> 2] = $33 | $18; //@line 5587
 if ($20 | 0) {
  ___unlockfile($22); //@line 5590
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 5593
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
function _mbed_vtracef__async_cb_10($0) {
 $0 = $0 | 0;
 var $$pre = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 998
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1002
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 2) {
  return;
 }
 $5 = $4 + -1 | 0; //@line 1007
 $$pre = HEAP32[94] | 0; //@line 1008
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 1009
 FUNCTION_TABLE_v[$$pre & 15](); //@line 1010
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 57; //@line 1013
  $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 1014
  HEAP32[$6 >> 2] = $4; //@line 1015
  $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 1016
  HEAP32[$7 >> 2] = $5; //@line 1017
  sp = STACKTOP; //@line 1018
  return;
 }
 ___async_unwind = 0; //@line 1021
 HEAP32[$ReallocAsyncCtx9 >> 2] = 57; //@line 1022
 $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 1023
 HEAP32[$6 >> 2] = $4; //@line 1024
 $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 1025
 HEAP32[$7 >> 2] = $5; //@line 1026
 sp = STACKTOP; //@line 1027
 return;
}
function _mbed_vtracef__async_cb_9($0) {
 $0 = $0 | 0;
 var $$pre = 0, $2 = 0, $4 = 0, $5 = 0, $6 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 965
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 967
 if (($2 | 0) <= 1) {
  return;
 }
 $4 = $2 + -1 | 0; //@line 972
 $$pre = HEAP32[94] | 0; //@line 973
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 974
 FUNCTION_TABLE_v[$$pre & 15](); //@line 975
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 57; //@line 978
  $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 979
  HEAP32[$5 >> 2] = $2; //@line 980
  $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 981
  HEAP32[$6 >> 2] = $4; //@line 982
  sp = STACKTOP; //@line 983
  return;
 }
 ___async_unwind = 0; //@line 986
 HEAP32[$ReallocAsyncCtx9 >> 2] = 57; //@line 987
 $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 988
 HEAP32[$5 >> 2] = $2; //@line 989
 $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 990
 HEAP32[$6 >> 2] = $4; //@line 991
 sp = STACKTOP; //@line 992
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
 sp = STACKTOP; //@line 13805
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 13807
 $8 = $7 >> 8; //@line 13808
 if (!($7 & 1)) {
  $$0 = $8; //@line 13812
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 13817
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 13819
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 13822
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13827
 FUNCTION_TABLE_viiiiii[$17 & 3]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 13828
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 165; //@line 13831
  sp = STACKTOP; //@line 13832
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13835
  return;
 }
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12975
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 12981
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 12984
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 12987
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 12988
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 12989
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 152; //@line 12992
    sp = STACKTOP; //@line 12993
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12996
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
 sp = STACKTOP; //@line 13847
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 13849
 $7 = $6 >> 8; //@line 13850
 if (!($6 & 1)) {
  $$0 = $7; //@line 13854
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 13859
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 13861
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 13864
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13869
 FUNCTION_TABLE_viiiii[$16 & 3]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 13870
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 166; //@line 13873
  sp = STACKTOP; //@line 13874
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13877
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
function ___dynamic_cast__async_cb_27($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1983
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1985
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1987
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1993
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 2008
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 2024
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 2029
    break;
   }
  default:
   {
    $$0 = 0; //@line 2033
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 2038
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13762
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 13764
 $6 = $5 >> 8; //@line 13765
 if (!($5 & 1)) {
  $$0 = $6; //@line 13769
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 13774
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 13776
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 13779
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13784
 FUNCTION_TABLE_viiii[$15 & 3]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 13785
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 164; //@line 13788
  sp = STACKTOP; //@line 13789
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13792
  return;
 }
}
function _mbed_error_vfprintf__async_cb_2($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 97
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 99
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 101
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 103
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 105
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 107
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 109
 _serial_putc(5744, $2 << 24 >> 24); //@line 110
 if (!___async) {
  ___async_unwind = 0; //@line 113
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 115
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 117
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 119
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $8; //@line 121
 HEAP8[$ReallocAsyncCtx2 + 16 >> 0] = $2; //@line 123
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 125
 sp = STACKTOP; //@line 126
 return;
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 9985
 STACKTOP = STACKTOP + 256 | 0; //@line 9986
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 9986
 $5 = sp; //@line 9987
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 9993
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 9997
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 10000
   $$011 = $9; //@line 10001
   do {
    _out_670($0, $5, 256); //@line 10003
    $$011 = $$011 + -256 | 0; //@line 10004
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 10013
  } else {
   $$0$lcssa = $9; //@line 10015
  }
  _out_670($0, $5, $$0$lcssa); //@line 10017
 }
 STACKTOP = sp; //@line 10019
 return;
}
function __ZN4mbed11InterruptInD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1326
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1328
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 1330
 if (!$4) {
  __ZdlPv($2); //@line 1333
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 1338
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 1339
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 1340
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 24; //@line 1343
  $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 1344
  HEAP32[$9 >> 2] = $2; //@line 1345
  sp = STACKTOP; //@line 1346
  return;
 }
 ___async_unwind = 0; //@line 1349
 HEAP32[$ReallocAsyncCtx2 >> 2] = 24; //@line 1350
 $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 1351
 HEAP32[$9 >> 2] = $2; //@line 1352
 sp = STACKTOP; //@line 1353
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7280
 STACKTOP = STACKTOP + 32 | 0; //@line 7281
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 7281
 $vararg_buffer = sp; //@line 7282
 $3 = sp + 20 | 0; //@line 7283
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 7287
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 7289
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 7291
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 7293
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 7295
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 7300
  $10 = -1; //@line 7301
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 7304
 }
 STACKTOP = sp; //@line 7306
 return $10 | 0; //@line 7306
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
 _mbed_error_printf(1798, $vararg_buffer); //@line 2731
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
function __ZN4mbed7Timeout7handlerEv__async_cb_24($0) {
 $0 = $0 | 0;
 var $4 = 0, $5 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1888
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1892
 $5 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 1893
 if (!$5) {
  return;
 }
 $8 = HEAP32[$5 + 8 >> 2] | 0; //@line 1899
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 1900
 FUNCTION_TABLE_vi[$8 & 255]($4); //@line 1901
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 39; //@line 1904
  $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 1905
  HEAP32[$9 >> 2] = $4; //@line 1906
  sp = STACKTOP; //@line 1907
  return;
 }
 ___async_unwind = 0; //@line 1910
 HEAP32[$ReallocAsyncCtx3 >> 2] = 39; //@line 1911
 $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 1912
 HEAP32[$9 >> 2] = $4; //@line 1913
 sp = STACKTOP; //@line 1914
 return;
}
function _snprintf($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11864
 STACKTOP = STACKTOP + 16 | 0; //@line 11865
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11865
 $3 = sp; //@line 11866
 HEAP32[$3 >> 2] = $varargs; //@line 11867
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 11868
 $4 = _vsnprintf($0, $1, $2, $3) | 0; //@line 11869
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 136; //@line 11872
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 11874
  sp = STACKTOP; //@line 11875
  STACKTOP = sp; //@line 11876
  return 0; //@line 11876
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11878
  STACKTOP = sp; //@line 11879
  return $4 | 0; //@line 11879
 }
 return 0; //@line 11881
}
function _schedule_interrupt__async_cb_40($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 3019
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3021
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3023
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3025
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 4 >> 2] | 0; //@line 3028
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(16) | 0; //@line 3029
 $10 = FUNCTION_TABLE_i[$9 & 3]() | 0; //@line 3030
 if (!___async) {
  HEAP32[___async_retval >> 2] = $10; //@line 3034
  ___async_unwind = 0; //@line 3035
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 71; //@line 3037
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $4; //@line 3039
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $6; //@line 3041
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $2; //@line 3043
 sp = STACKTOP; //@line 3044
 return;
}
function _initialize__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3645
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3647
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3649
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3651
 $9 = HEAP32[(HEAP32[$4 >> 2] | 0) + 24 >> 2] | 0; //@line 3654
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 3655
 $10 = FUNCTION_TABLE_i[$9 & 3]() | 0; //@line 3656
 if (!___async) {
  HEAP32[___async_retval >> 2] = $10; //@line 3660
  ___async_unwind = 0; //@line 3661
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 61; //@line 3663
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 3665
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 3667
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 3669
 sp = STACKTOP; //@line 3670
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 12528
 $5 = HEAP32[$4 >> 2] | 0; //@line 12529
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 12533
   HEAP32[$1 + 24 >> 2] = $3; //@line 12535
   HEAP32[$1 + 36 >> 2] = 1; //@line 12537
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 12541
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 12544
    HEAP32[$1 + 24 >> 2] = 2; //@line 12546
    HEAP8[$1 + 54 >> 0] = 1; //@line 12548
    break;
   }
   $10 = $1 + 24 | 0; //@line 12551
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 12555
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_8($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 935
 HEAP32[88] = HEAP32[86]; //@line 937
 $2 = HEAP32[94] | 0; //@line 938
 if (!$2) {
  return;
 }
 $4 = HEAP32[95] | 0; //@line 943
 HEAP32[95] = 0; //@line 944
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 945
 FUNCTION_TABLE_v[$2 & 15](); //@line 946
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 949
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 950
  HEAP32[$5 >> 2] = $4; //@line 951
  sp = STACKTOP; //@line 952
  return;
 }
 ___async_unwind = 0; //@line 955
 HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 956
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 957
 HEAP32[$5 >> 2] = $4; //@line 958
 sp = STACKTOP; //@line 959
 return;
}
function _mbed_vtracef__async_cb_5($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 671
 HEAP32[88] = HEAP32[86]; //@line 673
 $2 = HEAP32[94] | 0; //@line 674
 if (!$2) {
  return;
 }
 $4 = HEAP32[95] | 0; //@line 679
 HEAP32[95] = 0; //@line 680
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 681
 FUNCTION_TABLE_v[$2 & 15](); //@line 682
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 685
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 686
  HEAP32[$5 >> 2] = $4; //@line 687
  sp = STACKTOP; //@line 688
  return;
 }
 ___async_unwind = 0; //@line 691
 HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 692
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 693
 HEAP32[$5 >> 2] = $4; //@line 694
 sp = STACKTOP; //@line 695
 return;
}
function _mbed_vtracef__async_cb_4($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 641
 HEAP32[88] = HEAP32[86]; //@line 643
 $2 = HEAP32[94] | 0; //@line 644
 if (!$2) {
  return;
 }
 $4 = HEAP32[95] | 0; //@line 649
 HEAP32[95] = 0; //@line 650
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 651
 FUNCTION_TABLE_v[$2 & 15](); //@line 652
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 655
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 656
  HEAP32[$5 >> 2] = $4; //@line 657
  sp = STACKTOP; //@line 658
  return;
 }
 ___async_unwind = 0; //@line 661
 HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 662
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 663
 HEAP32[$5 >> 2] = $4; //@line 664
 sp = STACKTOP; //@line 665
 return;
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 13078
 STACKTOP = STACKTOP + 16 | 0; //@line 13079
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13079
 $vararg_buffer = sp; //@line 13080
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 13081
 FUNCTION_TABLE_v[$0 & 15](); //@line 13082
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 154; //@line 13085
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 13087
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 13089
  sp = STACKTOP; //@line 13090
  STACKTOP = sp; //@line 13091
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13093
  _abort_message(5395, $vararg_buffer); //@line 13094
 }
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 7387
 $3 = HEAP8[$1 >> 0] | 0; //@line 7388
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 7393
  $$lcssa8 = $2; //@line 7393
 } else {
  $$011 = $1; //@line 7395
  $$0710 = $0; //@line 7395
  do {
   $$0710 = $$0710 + 1 | 0; //@line 7397
   $$011 = $$011 + 1 | 0; //@line 7398
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 7399
   $9 = HEAP8[$$011 >> 0] | 0; //@line 7400
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 7405
  $$lcssa8 = $8; //@line 7405
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 7415
}
function _memcmp($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $14 = 0, $4 = 0, $5 = 0;
 L1 : do {
  if (!$2) {
   $14 = 0; //@line 11829
  } else {
   $$01318 = $0; //@line 11831
   $$01417 = $2; //@line 11831
   $$019 = $1; //@line 11831
   while (1) {
    $4 = HEAP8[$$01318 >> 0] | 0; //@line 11833
    $5 = HEAP8[$$019 >> 0] | 0; //@line 11834
    if ($4 << 24 >> 24 != $5 << 24 >> 24) {
     break;
    }
    $$01417 = $$01417 + -1 | 0; //@line 11839
    if (!$$01417) {
     $14 = 0; //@line 11844
     break L1;
    } else {
     $$01318 = $$01318 + 1 | 0; //@line 11847
     $$019 = $$019 + 1 | 0; //@line 11847
    }
   }
   $14 = ($4 & 255) - ($5 & 255) | 0; //@line 11853
  }
 } while (0);
 return $14 | 0; //@line 11856
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
 sp = STACKTOP; //@line 7339
 STACKTOP = STACKTOP + 32 | 0; //@line 7340
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 7340
 $vararg_buffer = sp; //@line 7341
 HEAP32[$0 + 36 >> 2] = 1; //@line 7344
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 7352
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 7354
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 7356
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 7361
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 7364
 STACKTOP = sp; //@line 7365
 return $14 | 0; //@line 7365
}
function _mbed_die__async_cb_86($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 6204
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6206
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 6208
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 6209
 _wait_ms(150); //@line 6210
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 77; //@line 6213
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 6214
  HEAP32[$4 >> 2] = $2; //@line 6215
  sp = STACKTOP; //@line 6216
  return;
 }
 ___async_unwind = 0; //@line 6219
 HEAP32[$ReallocAsyncCtx15 >> 2] = 77; //@line 6220
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 6221
 HEAP32[$4 >> 2] = $2; //@line 6222
 sp = STACKTOP; //@line 6223
 return;
}
function _mbed_die__async_cb_85($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 6179
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6181
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 6183
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 6184
 _wait_ms(150); //@line 6185
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 78; //@line 6188
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 6189
  HEAP32[$4 >> 2] = $2; //@line 6190
  sp = STACKTOP; //@line 6191
  return;
 }
 ___async_unwind = 0; //@line 6194
 HEAP32[$ReallocAsyncCtx14 >> 2] = 78; //@line 6195
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 6196
 HEAP32[$4 >> 2] = $2; //@line 6197
 sp = STACKTOP; //@line 6198
 return;
}
function _mbed_die__async_cb_84($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 6154
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6156
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 6158
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 6159
 _wait_ms(150); //@line 6160
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 79; //@line 6163
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 6164
  HEAP32[$4 >> 2] = $2; //@line 6165
  sp = STACKTOP; //@line 6166
  return;
 }
 ___async_unwind = 0; //@line 6169
 HEAP32[$ReallocAsyncCtx13 >> 2] = 79; //@line 6170
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 6171
 HEAP32[$4 >> 2] = $2; //@line 6172
 sp = STACKTOP; //@line 6173
 return;
}
function _mbed_die__async_cb_83($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 6129
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6131
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 6133
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 6134
 _wait_ms(150); //@line 6135
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 80; //@line 6138
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 6139
  HEAP32[$4 >> 2] = $2; //@line 6140
  sp = STACKTOP; //@line 6141
  return;
 }
 ___async_unwind = 0; //@line 6144
 HEAP32[$ReallocAsyncCtx12 >> 2] = 80; //@line 6145
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 6146
 HEAP32[$4 >> 2] = $2; //@line 6147
 sp = STACKTOP; //@line 6148
 return;
}
function _mbed_die__async_cb_82($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 6104
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6106
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 6108
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 6109
 _wait_ms(150); //@line 6110
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 81; //@line 6113
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 6114
  HEAP32[$4 >> 2] = $2; //@line 6115
  sp = STACKTOP; //@line 6116
  return;
 }
 ___async_unwind = 0; //@line 6119
 HEAP32[$ReallocAsyncCtx11 >> 2] = 81; //@line 6120
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 6121
 HEAP32[$4 >> 2] = $2; //@line 6122
 sp = STACKTOP; //@line 6123
 return;
}
function _mbed_die__async_cb_81($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 6079
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6081
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 6083
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 6084
 _wait_ms(150); //@line 6085
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 82; //@line 6088
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 6089
  HEAP32[$4 >> 2] = $2; //@line 6090
  sp = STACKTOP; //@line 6091
  return;
 }
 ___async_unwind = 0; //@line 6094
 HEAP32[$ReallocAsyncCtx10 >> 2] = 82; //@line 6095
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 6096
 HEAP32[$4 >> 2] = $2; //@line 6097
 sp = STACKTOP; //@line 6098
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
 sp = STACKTOP; //@line 5829
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5831
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5833
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 5834
 _wait_ms(150); //@line 5835
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 76; //@line 5838
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 5839
  HEAP32[$4 >> 2] = $2; //@line 5840
  sp = STACKTOP; //@line 5841
  return;
 }
 ___async_unwind = 0; //@line 5844
 HEAP32[$ReallocAsyncCtx16 >> 2] = 76; //@line 5845
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 5846
 HEAP32[$4 >> 2] = $2; //@line 5847
 sp = STACKTOP; //@line 5848
 return;
}
function _mbed_die__async_cb_80($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 6054
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6056
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 6058
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 6059
 _wait_ms(150); //@line 6060
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 83; //@line 6063
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 6064
  HEAP32[$4 >> 2] = $2; //@line 6065
  sp = STACKTOP; //@line 6066
  return;
 }
 ___async_unwind = 0; //@line 6069
 HEAP32[$ReallocAsyncCtx9 >> 2] = 83; //@line 6070
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 6071
 HEAP32[$4 >> 2] = $2; //@line 6072
 sp = STACKTOP; //@line 6073
 return;
}
function _mbed_die__async_cb_79($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 6029
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6031
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 6033
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 6034
 _wait_ms(400); //@line 6035
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 84; //@line 6038
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 6039
  HEAP32[$4 >> 2] = $2; //@line 6040
  sp = STACKTOP; //@line 6041
  return;
 }
 ___async_unwind = 0; //@line 6044
 HEAP32[$ReallocAsyncCtx8 >> 2] = 84; //@line 6045
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 6046
 HEAP32[$4 >> 2] = $2; //@line 6047
 sp = STACKTOP; //@line 6048
 return;
}
function _mbed_die__async_cb_78($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 6004
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6006
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 6008
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 6009
 _wait_ms(400); //@line 6010
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 85; //@line 6013
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 6014
  HEAP32[$4 >> 2] = $2; //@line 6015
  sp = STACKTOP; //@line 6016
  return;
 }
 ___async_unwind = 0; //@line 6019
 HEAP32[$ReallocAsyncCtx7 >> 2] = 85; //@line 6020
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 6021
 HEAP32[$4 >> 2] = $2; //@line 6022
 sp = STACKTOP; //@line 6023
 return;
}
function _mbed_die__async_cb_77($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 5979
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5981
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5983
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 5984
 _wait_ms(400); //@line 5985
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 86; //@line 5988
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 5989
  HEAP32[$4 >> 2] = $2; //@line 5990
  sp = STACKTOP; //@line 5991
  return;
 }
 ___async_unwind = 0; //@line 5994
 HEAP32[$ReallocAsyncCtx6 >> 2] = 86; //@line 5995
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 5996
 HEAP32[$4 >> 2] = $2; //@line 5997
 sp = STACKTOP; //@line 5998
 return;
}
function _mbed_die__async_cb_76($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 5954
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5956
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5958
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 5959
 _wait_ms(400); //@line 5960
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 87; //@line 5963
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 5964
  HEAP32[$4 >> 2] = $2; //@line 5965
  sp = STACKTOP; //@line 5966
  return;
 }
 ___async_unwind = 0; //@line 5969
 HEAP32[$ReallocAsyncCtx5 >> 2] = 87; //@line 5970
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 5971
 HEAP32[$4 >> 2] = $2; //@line 5972
 sp = STACKTOP; //@line 5973
 return;
}
function _mbed_die__async_cb_75($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 5929
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5931
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5933
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 5934
 _wait_ms(400); //@line 5935
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 88; //@line 5938
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 5939
  HEAP32[$4 >> 2] = $2; //@line 5940
  sp = STACKTOP; //@line 5941
  return;
 }
 ___async_unwind = 0; //@line 5944
 HEAP32[$ReallocAsyncCtx4 >> 2] = 88; //@line 5945
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 5946
 HEAP32[$4 >> 2] = $2; //@line 5947
 sp = STACKTOP; //@line 5948
 return;
}
function _mbed_die__async_cb_74($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5904
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5906
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5908
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 5909
 _wait_ms(400); //@line 5910
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 89; //@line 5913
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 5914
  HEAP32[$4 >> 2] = $2; //@line 5915
  sp = STACKTOP; //@line 5916
  return;
 }
 ___async_unwind = 0; //@line 5919
 HEAP32[$ReallocAsyncCtx3 >> 2] = 89; //@line 5920
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 5921
 HEAP32[$4 >> 2] = $2; //@line 5922
 sp = STACKTOP; //@line 5923
 return;
}
function _mbed_die__async_cb_73($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5879
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5881
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5883
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 5884
 _wait_ms(400); //@line 5885
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 90; //@line 5888
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 5889
  HEAP32[$4 >> 2] = $2; //@line 5890
  sp = STACKTOP; //@line 5891
  return;
 }
 ___async_unwind = 0; //@line 5894
 HEAP32[$ReallocAsyncCtx2 >> 2] = 90; //@line 5895
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 5896
 HEAP32[$4 >> 2] = $2; //@line 5897
 sp = STACKTOP; //@line 5898
 return;
}
function _mbed_die__async_cb_72($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5854
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5856
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5858
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 5859
 _wait_ms(400); //@line 5860
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 91; //@line 5863
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 5864
  HEAP32[$4 >> 2] = $2; //@line 5865
  sp = STACKTOP; //@line 5866
  return;
 }
 ___async_unwind = 0; //@line 5869
 HEAP32[$ReallocAsyncCtx >> 2] = 91; //@line 5870
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 5871
 HEAP32[$4 >> 2] = $2; //@line 5872
 sp = STACKTOP; //@line 5873
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
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 6763
 newDynamicTop = oldDynamicTop + increment | 0; //@line 6764
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 6768
  ___setErrNo(12); //@line 6769
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 6773
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 6777
   ___setErrNo(12); //@line 6778
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 6782
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 7510
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 7512
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 7518
  $11 = ___fwritex($0, $4, $3) | 0; //@line 7519
  if ($phitmp) {
   $13 = $11; //@line 7521
  } else {
   ___unlockfile($3); //@line 7523
   $13 = $11; //@line 7524
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 7528
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 7532
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 7535
 }
 return $15 | 0; //@line 7537
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 9846
 } else {
  $$056 = $2; //@line 9848
  $15 = $1; //@line 9848
  $8 = $0; //@line 9848
  while (1) {
   $14 = $$056 + -1 | 0; //@line 9856
   HEAP8[$14 >> 0] = HEAPU8[3058 + ($8 & 15) >> 0] | 0 | $3; //@line 9857
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 9858
   $15 = tempRet0; //@line 9859
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 9864
    break;
   } else {
    $$056 = $14; //@line 9867
   }
  }
 }
 return $$05$lcssa | 0; //@line 9871
}
function __ZSt9terminatev() {
 var $0 = 0, $16 = 0, $17 = 0, $2 = 0, $5 = 0, sp = 0;
 sp = STACKTOP; //@line 13043
 $0 = ___cxa_get_globals_fast() | 0; //@line 13044
 if ($0 | 0) {
  $2 = HEAP32[$0 >> 2] | 0; //@line 13047
  if ($2 | 0) {
   $5 = $2 + 48 | 0; //@line 13051
   if ((HEAP32[$5 >> 2] & -256 | 0) == 1126902528 ? (HEAP32[$5 + 4 >> 2] | 0) == 1129074247 : 0) {
    $16 = HEAP32[$2 + 12 >> 2] | 0; //@line 13063
    _emscripten_alloc_async_context(4, sp) | 0; //@line 13064
    __ZSt11__terminatePFvvE($16); //@line 13065
   }
  }
 }
 $17 = __ZSt13get_terminatev() | 0; //@line 13070
 _emscripten_alloc_async_context(4, sp) | 0; //@line 13071
 __ZSt11__terminatePFvvE($17); //@line 13072
}
function _main__async_cb_32($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 2213
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2215
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2217
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2219
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(16) | 0; //@line 2220
 _puts(2402) | 0; //@line 2221
 if (!___async) {
  ___async_unwind = 0; //@line 2224
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 113; //@line 2226
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 2228
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 2230
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 2232
 sp = STACKTOP; //@line 2233
 return;
}
function _main__async_cb_31($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 2187
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2189
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2191
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2193
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 2194
 _puts(2505) | 0; //@line 2195
 if (!___async) {
  ___async_unwind = 0; //@line 2198
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 114; //@line 2200
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $2; //@line 2202
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $4; //@line 2204
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $6; //@line 2206
 sp = STACKTOP; //@line 2207
 return;
}
function __GLOBAL__sub_I_main_cpp__async_cb_23($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1804
 HEAP32[1402] = 440; //@line 1805
 HEAP32[1412] = 0; //@line 1806
 HEAP32[1413] = 0; //@line 1806
 HEAP32[1414] = 0; //@line 1806
 HEAP32[1415] = 0; //@line 1806
 HEAP8[5664] = 1; //@line 1807
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 1808
 __ZN4mbed10TimerEventC2Ev(5672); //@line 1809
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 108; //@line 1812
  sp = STACKTOP; //@line 1813
  return;
 }
 ___async_unwind = 0; //@line 1816
 HEAP32[$ReallocAsyncCtx >> 2] = 108; //@line 1817
 sp = STACKTOP; //@line 1818
 return;
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 7727
 $3 = HEAP8[$1 >> 0] | 0; //@line 7729
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 7733
 $7 = HEAP32[$0 >> 2] | 0; //@line 7734
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 7739
  HEAP32[$0 + 4 >> 2] = 0; //@line 7741
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 7743
  HEAP32[$0 + 28 >> 2] = $14; //@line 7745
  HEAP32[$0 + 20 >> 2] = $14; //@line 7747
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 7753
  $$0 = 0; //@line 7754
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 7757
  $$0 = -1; //@line 7758
 }
 return $$0 | 0; //@line 7760
}
function __ZN4mbed11InterruptInD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1368
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1370
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 1372
 if (!$4) {
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 1379
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 1380
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 1381
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 22; //@line 1384
  sp = STACKTOP; //@line 1385
  return;
 }
 ___async_unwind = 0; //@line 1388
 HEAP32[$ReallocAsyncCtx2 >> 2] = 22; //@line 1389
 sp = STACKTOP; //@line 1390
 return;
}
function __ZN4mbed7Timeout7handlerEv__async_cb_26($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1928
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1930
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1932
 $5 = HEAP32[HEAP32[$2 >> 2] >> 2] | 0; //@line 1934
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 1935
 FUNCTION_TABLE_vi[$5 & 255]($4); //@line 1936
 if (!___async) {
  ___async_unwind = 0; //@line 1939
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 38; //@line 1941
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 1943
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 1945
 sp = STACKTOP; //@line 1946
 return;
}
function _twobyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$sink$in = 0, $$sink17$sink = 0, $11 = 0, $12 = 0, $8 = 0;
 $8 = (HEAPU8[$1 >> 0] | 0) << 8 | (HEAPU8[$1 + 1 >> 0] | 0); //@line 11314
 $$sink$in = HEAPU8[$0 >> 0] | 0; //@line 11317
 $$sink17$sink = $0; //@line 11317
 while (1) {
  $11 = $$sink17$sink + 1 | 0; //@line 11319
  $12 = HEAP8[$11 >> 0] | 0; //@line 11320
  if (!($12 << 24 >> 24)) {
   break;
  }
  $$sink$in = $$sink$in << 8 & 65280 | $12 & 255; //@line 11328
  if (($$sink$in | 0) == ($8 | 0)) {
   break;
  } else {
   $$sink17$sink = $11; //@line 11333
  }
 }
 return ($12 << 24 >> 24 ? $$sink17$sink : 0) | 0; //@line 11338
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 9883
 } else {
  $$06 = $2; //@line 9885
  $11 = $1; //@line 9885
  $7 = $0; //@line 9885
  while (1) {
   $10 = $$06 + -1 | 0; //@line 9890
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 9891
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 9892
   $11 = tempRet0; //@line 9893
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 9898
    break;
   } else {
    $$06 = $10; //@line 9901
   }
  }
 }
 return $$0$lcssa | 0; //@line 9905
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13919
 do {
  if (!$0) {
   $3 = 0; //@line 13923
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13925
   $2 = ___dynamic_cast($0, 176, 232, 0) | 0; //@line 13926
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 168; //@line 13929
    sp = STACKTOP; //@line 13930
    return 0; //@line 13931
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 13933
    $3 = ($2 | 0) != 0 & 1; //@line 13936
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 13941
}
function _invoke_ticker__async_cb_20($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1635
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 1641
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 1642
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 1643
 FUNCTION_TABLE_vi[$5 & 255]($6); //@line 1644
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 105; //@line 1647
  sp = STACKTOP; //@line 1648
  return;
 }
 ___async_unwind = 0; //@line 1651
 HEAP32[$ReallocAsyncCtx >> 2] = 105; //@line 1652
 sp = STACKTOP; //@line 1653
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 9527
 } else {
  $$04 = 0; //@line 9529
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 9532
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 9536
   $12 = $7 + 1 | 0; //@line 9537
   HEAP32[$0 >> 2] = $12; //@line 9538
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 9544
    break;
   } else {
    $$04 = $11; //@line 9547
   }
  }
 }
 return $$0$lcssa | 0; //@line 9551
}
function ___muldi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $x_sroa_0_0_extract_trunc = 0, $y_sroa_0_0_extract_trunc = 0, $1$0 = 0, $1$1 = 0;
 $x_sroa_0_0_extract_trunc = $a$0; //@line 6296
 $y_sroa_0_0_extract_trunc = $b$0; //@line 6297
 $1$0 = ___muldsi3($x_sroa_0_0_extract_trunc, $y_sroa_0_0_extract_trunc) | 0; //@line 6298
 $1$1 = tempRet0; //@line 6299
 return (tempRet0 = (Math_imul($a$1, $y_sroa_0_0_extract_trunc) | 0) + (Math_imul($b$1, $x_sroa_0_0_extract_trunc) | 0) + $1$1 | $1$1 & 0, $1$0 | 0 | 0) | 0; //@line 6301
}
function runPostSets() {}
function ___muldsi3($a, $b) {
 $a = $a | 0;
 $b = $b | 0;
 var $1 = 0, $2 = 0, $3 = 0, $6 = 0, $8 = 0, $11 = 0, $12 = 0;
 $1 = $a & 65535; //@line 6281
 $2 = $b & 65535; //@line 6282
 $3 = Math_imul($2, $1) | 0; //@line 6283
 $6 = $a >>> 16; //@line 6284
 $8 = ($3 >>> 16) + (Math_imul($2, $6) | 0) | 0; //@line 6285
 $11 = $b >>> 16; //@line 6286
 $12 = Math_imul($11, $1) | 0; //@line 6287
 return (tempRet0 = ($8 >>> 16) + (Math_imul($11, $6) | 0) + ((($8 & 65535) + $12 | 0) >>> 16) | 0, $8 + $12 << 16 | $3 & 65535 | 0) | 0; //@line 6288
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
 sp = STACKTOP; //@line 3608
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3609
 _puts(2354) | 0; //@line 3610
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 110; //@line 3613
  sp = STACKTOP; //@line 3614
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3617
  $2 = (_emscripten_asm_const_ii(9, HEAP32[1444] | 0) | 0) == 0 & 1; //@line 3621
  _emscripten_asm_const_iii(1, HEAP32[1444] | 0, $2 | 0) | 0; //@line 3623
  return;
 }
}
function ___fflush_unlocked__async_cb_22($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1774
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1776
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1778
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1780
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 1782
 HEAP32[$4 >> 2] = 0; //@line 1783
 HEAP32[$6 >> 2] = 0; //@line 1784
 HEAP32[$8 >> 2] = 0; //@line 1785
 HEAP32[$10 >> 2] = 0; //@line 1786
 HEAP32[___async_retval >> 2] = 0; //@line 1788
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
 sp = STACKTOP; //@line 3587
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3588
 _puts(2271) | 0; //@line 3589
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 109; //@line 3592
  sp = STACKTOP; //@line 3593
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3596
  $2 = (_emscripten_asm_const_ii(9, HEAP32[1438] | 0) | 0) == 0 & 1; //@line 3600
  _emscripten_asm_const_iii(1, HEAP32[1438] | 0, $2 | 0) | 0; //@line 3602
  return;
 }
}
function __ZN4mbed6TickerD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6247
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6249
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 6250
 __ZN4mbed10TimerEventD2Ev($2); //@line 6251
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 6254
  sp = STACKTOP; //@line 6255
  return;
 }
 ___async_unwind = 0; //@line 6258
 HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 6259
 sp = STACKTOP; //@line 6260
 return;
}
function __ZN4mbed7TimeoutD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5773
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5775
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 5776
 __ZN4mbed10TimerEventD2Ev($2); //@line 5777
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 33; //@line 5780
  sp = STACKTOP; //@line 5781
  return;
 }
 ___async_unwind = 0; //@line 5784
 HEAP32[$ReallocAsyncCtx2 >> 2] = 33; //@line 5785
 sp = STACKTOP; //@line 5786
 return;
}
function _mbed_vtracef__async_cb_3($0) {
 $0 = $0 | 0;
 var $1 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 623
 $1 = HEAP32[92] | 0; //@line 624
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 625
 FUNCTION_TABLE_vi[$1 & 255](1595); //@line 626
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 49; //@line 629
  sp = STACKTOP; //@line 630
  return;
 }
 ___async_unwind = 0; //@line 633
 HEAP32[$ReallocAsyncCtx3 >> 2] = 49; //@line 634
 sp = STACKTOP; //@line 635
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
function _serial_putc__async_cb_21($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1689
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1691
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 1692
 _fflush($2) | 0; //@line 1693
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 98; //@line 1696
  sp = STACKTOP; //@line 1697
  return;
 }
 ___async_unwind = 0; //@line 1700
 HEAP32[$ReallocAsyncCtx >> 2] = 98; //@line 1701
 sp = STACKTOP; //@line 1702
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
 sp = STACKTOP; //@line 1572
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1574
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 1575
 __ZN4mbed10TimerEventD2Ev($2); //@line 1576
 if (!___async) {
  ___async_unwind = 0; //@line 1579
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 35; //@line 1581
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 1583
 sp = STACKTOP; //@line 1584
 return;
}
function __ZN4mbed6TickerD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5717
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5719
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 5720
 __ZN4mbed10TimerEventD2Ev($2); //@line 5721
 if (!___async) {
  ___async_unwind = 0; //@line 5724
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 102; //@line 5726
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 5728
 sp = STACKTOP; //@line 5729
 return;
}
function _emscripten_async_resume() {
 ___async = 0; //@line 6614
 ___async_unwind = 1; //@line 6615
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 6621
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 6625
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 6629
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 6631
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7150
 STACKTOP = STACKTOP + 16 | 0; //@line 7151
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7151
 $vararg_buffer = sp; //@line 7152
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 7156
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 7158
 STACKTOP = sp; //@line 7159
 return $5 | 0; //@line 7159
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
 __stackBase__ = STACKTOP; //@line 6556
 STACKTOP = STACKTOP + 16 | 0; //@line 6557
 $rem = __stackBase__ | 0; //@line 6558
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 6559
 STACKTOP = __stackBase__; //@line 6560
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 6561
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 6326
 if ((ret | 0) < 8) return ret | 0; //@line 6327
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 6328
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 6329
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 6330
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 6331
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 6332
}
function ___cxa_get_globals_fast() {
 var $3 = 0, sp = 0;
 sp = STACKTOP; //@line 12264
 STACKTOP = STACKTOP + 16 | 0; //@line 12265
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12265
 if (!(_pthread_once(6472, 10) | 0)) {
  $3 = _pthread_getspecific(HEAP32[1619] | 0) | 0; //@line 12271
  STACKTOP = sp; //@line 12272
  return $3 | 0; //@line 12272
 } else {
  _abort_message(5243, sp); //@line 12274
 }
 return 0; //@line 12277
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 12432
 }
 return;
}
function __Z12turn_led3_onv() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3629
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3630
 _puts(2375) | 0; //@line 3631
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 111; //@line 3634
  sp = STACKTOP; //@line 3635
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3638
  _emscripten_asm_const_iii(1, HEAP32[1450] | 0, 1) | 0; //@line 3640
  return;
 }
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 11969
 $6 = HEAP32[$5 >> 2] | 0; //@line 11970
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 11971
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 11973
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 11975
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 11978
 return $2 | 0; //@line 11979
}
function __ZL25default_terminate_handlerv__async_cb_56($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4815
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4817
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4819
 HEAP32[$2 >> 2] = 5104; //@line 4820
 HEAP32[$2 + 4 >> 2] = $4; //@line 4822
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 4824
 _abort_message(4968, $2); //@line 4825
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4737
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4739
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 4740
 _fputc(10, $2) | 0; //@line 4741
 if (!___async) {
  ___async_unwind = 0; //@line 4744
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 144; //@line 4746
 sp = STACKTOP; //@line 4747
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
 sp = STACKTOP; //@line 13026
 STACKTOP = STACKTOP + 16 | 0; //@line 13027
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13027
 _free($0); //@line 13029
 if (!(_pthread_setspecific(HEAP32[1619] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 13034
  return;
 } else {
  _abort_message(5342, sp); //@line 13036
 }
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1612
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 1615
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 1620
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 1623
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5626
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 5637
  $$0 = 1; //@line 5638
 } else {
  $$0 = 0; //@line 5640
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 5644
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
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 12508
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3535
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3536
 _emscripten_sleep($0 | 0); //@line 3537
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 106; //@line 3540
  sp = STACKTOP; //@line 3541
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3544
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
function _main__async_cb_29($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 2124
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(4) | 0; //@line 2125
 _wait_ms(-1); //@line 2126
 if (!___async) {
  ___async_unwind = 0; //@line 2129
 }
 HEAP32[$ReallocAsyncCtx10 >> 2] = 121; //@line 2131
 sp = STACKTOP; //@line 2132
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 12572
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 12576
  }
 }
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var sp = 0;
 sp = STACKTOP; //@line 13011
 STACKTOP = STACKTOP + 16 | 0; //@line 13012
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13012
 if (!(_pthread_key_create(6476, 153) | 0)) {
  STACKTOP = sp; //@line 13017
  return;
 } else {
  _abort_message(5292, sp); //@line 13019
 }
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 6590
 HEAP32[new_frame + 4 >> 2] = sp; //@line 6592
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 6594
 ___async_cur_frame = new_frame; //@line 6595
 return ___async_cur_frame + 8 | 0; //@line 6596
}
function __GLOBAL__sub_I_main_cpp__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[1428] = 0; //@line 1795
 HEAP32[1429] = 0; //@line 1795
 HEAP32[1430] = 0; //@line 1795
 HEAP32[1431] = 0; //@line 1795
 HEAP8[5728] = 1; //@line 1796
 HEAP32[1418] = 288; //@line 1797
 __ZN4mbed11InterruptInC2E7PinName(5824, 1337); //@line 1798
 return;
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 13955
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 13959
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 13962
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 6579
  return low << bits; //@line 6580
 }
 tempRet0 = low << bits - 32; //@line 6582
 return 0; //@line 6583
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 6568
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 6569
 }
 tempRet0 = 0; //@line 6571
 return high >>> bits - 32 | 0; //@line 6572
}
function _fflush__async_cb_16($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1480
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 1482
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 1485
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_58($0) {
 $0 = $0 | 0;
 var $6 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4988
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 4990
 _gpio_irq_set($6 + 28 | 0, 2, 1); //@line 4992
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
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 5612
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 5615
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 5618
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 5509
 } else {
  $$0 = -1; //@line 5511
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 5514
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 7857
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 7863
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 7867
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 6845
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 6602
 stackRestore(___async_cur_frame | 0); //@line 6603
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 6604
}
function _fputc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5810
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 5811
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 5813
 return;
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5754
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 5755
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 5757
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 10968
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 10968
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 10970
 return $1 | 0; //@line 10971
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
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 7316
  $$0 = -1; //@line 7317
 } else {
  $$0 = $0; //@line 7319
 }
 return $$0 | 0; //@line 7321
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 6319
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 6320
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 6321
}
function __ZN4mbed6Ticker5setupEy($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $4 = 0;
 $4 = ___udivdi3($1 | 0, $2 | 0, 1e3, 0) | 0; //@line 3504
 _emscripten_asm_const_iii(8, $0 + 40 | 0, $4 | 0) | 0; //@line 3506
 return;
}
function __Z11toggle_led2v__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(9, HEAP32[1444] | 0) | 0) == 0 & 1; //@line 1312
 _emscripten_asm_const_iii(1, HEAP32[1444] | 0, $3 | 0) | 0; //@line 1314
 return;
}
function __Z10blink_led1v__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(9, HEAP32[1438] | 0) | 0) == 0 & 1; //@line 1663
 _emscripten_asm_const_iii(1, HEAP32[1438] | 0, $3 | 0) | 0; //@line 1665
 return;
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 6838
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
 l = a + c >>> 0; //@line 6311
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 6313
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 6831
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 10028
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 10031
 }
 return $$0 | 0; //@line 10033
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 8002
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 8007
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 6803
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 6548
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 7497
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 7501
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 1969
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
 stackRestore(___async_cur_frame | 0); //@line 6609
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 6610
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_61($0) {
 $0 = $0 | 0;
 _gpio_irq_set((HEAP32[$0 + 8 >> 2] | 0) + 28 | 0, 2, 0); //@line 5103
 return;
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 13111
 __ZdlPv($0); //@line 13112
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 12794
 __ZdlPv($0); //@line 12795
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 7993
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 7995
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 12322
 __ZdlPv($0); //@line 12323
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
 HEAP32[HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 4 >> 2] >> 2] = HEAP32[$0 + 8 >> 2]; //@line 2434
 return;
}
function _out_670($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 if (!(HEAP32[$0 >> 2] & 32)) {
  ___fwritex($1, $2, $0) | 0; //@line 9513
 }
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 1677
 return;
}
function b113(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 7164
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
 return ($0 | 0) == ($1 | 0) | 0; //@line 12519
}
function __ZSt13get_terminatev() {
 var $0 = 0;
 $0 = HEAP32[272] | 0; //@line 13101
 HEAP32[272] = $0 + 0; //@line 13103
 return $0 | 0; //@line 13105
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
 FUNCTION_TABLE_vii[index & 3](a1 | 0, a2 | 0); //@line 6824
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
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 6636
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_62($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b111(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 7161
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __Z12turn_led3_onv__async_cb($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iii(1, HEAP32[1450] | 0, 1) | 0; //@line 2679
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 9976
}
function _fflush__async_cb_17($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1495
 return;
}
function _snprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 6235
 return;
}
function _fputc__async_cb_71($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 5823
 return;
}
function _putc__async_cb_69($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 5767
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 6796
}
function __ZN4mbed11InterruptInD0Ev__async_cb_14($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 1362
 return;
}
function b8(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 6864
 return 0; //@line 6864
}
function b7(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 6861
 return 0; //@line 6861
}
function b6(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 6858
 return 0; //@line 6858
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(5395, HEAP32[$0 + 4 >> 2] | 0); //@line 5535
}
function __ZN4mbed6Ticker6detachEv($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_ii(7, $0 + 40 | 0) | 0; //@line 3514
 return;
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 255](a1 | 0); //@line 6817
}
function b109(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 7158
}
function __ZN4mbed7TimeoutD0Ev__async_cb_19($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 1593
 return;
}
function __ZN4mbed6TickerD0Ev__async_cb_68($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 5738
 return;
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 11221
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_48($0) {
 $0 = $0 | 0;
 return;
}
function _main__async_cb_36($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 2421
 return;
}
function dynCall_i(index) {
 index = index | 0;
 return FUNCTION_TABLE_i[index & 3]() | 0; //@line 6789
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_66($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 15](); //@line 6810
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 7374
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIPS1_EEvPv($0) {
 $0 = $0 | 0;
 return;
}
function b4(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 6855
 return 0; //@line 6855
}
function b107(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(3); //@line 7155
}
function b106(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(0); //@line 7152
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
function _abort_message__async_cb_55($0) {
 $0 = $0 | 0;
 _abort(); //@line 4754
}
function ___ofl_lock() {
 ___lock(6460); //@line 8012
 return 6468; //@line 8013
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
 ___cxa_pure_virtual(); //@line 6870
}
function __ZN4mbed7Timeout7handlerEv__async_cb_25($0) {
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
 return _pthread_self() | 0; //@line 11142
}
function __ZN4mbed10TimerEvent3irqEj__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 11148
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
function __ZN4mbed7TimeoutD2Ev__async_cb_70($0) {
 $0 = $0 | 0;
 return;
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 12148
 return;
}
function __ZN4mbed6TickerD2Ev__async_cb_87($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_43($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_42($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_39($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_38($0) {
 $0 = $0 | 0;
 return;
}
function _mbed_assert_internal__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b2() {
 nullFunc_i(3); //@line 6852
 return 0; //@line 6852
}
function b1() {
 nullFunc_i(0); //@line 6849
 return 0; //@line 6849
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
 ___unlock(6460); //@line 8018
 return;
}
function b104(p0) {
 p0 = p0 | 0;
 nullFunc_vi(255); //@line 7149
}
function b103(p0) {
 p0 = p0 | 0;
 nullFunc_vi(254); //@line 7146
}
function b102(p0) {
 p0 = p0 | 0;
 nullFunc_vi(253); //@line 7143
}
function b101(p0) {
 p0 = p0 | 0;
 nullFunc_vi(252); //@line 7140
}
function b100(p0) {
 p0 = p0 | 0;
 nullFunc_vi(251); //@line 7137
}
function b99(p0) {
 p0 = p0 | 0;
 nullFunc_vi(250); //@line 7134
}
function b98(p0) {
 p0 = p0 | 0;
 nullFunc_vi(249); //@line 7131
}
function b97(p0) {
 p0 = p0 | 0;
 nullFunc_vi(248); //@line 7128
}
function b96(p0) {
 p0 = p0 | 0;
 nullFunc_vi(247); //@line 7125
}
function b95(p0) {
 p0 = p0 | 0;
 nullFunc_vi(246); //@line 7122
}
function b94(p0) {
 p0 = p0 | 0;
 nullFunc_vi(245); //@line 7119
}
function b93(p0) {
 p0 = p0 | 0;
 nullFunc_vi(244); //@line 7116
}
function b92(p0) {
 p0 = p0 | 0;
 nullFunc_vi(243); //@line 7113
}
function b91(p0) {
 p0 = p0 | 0;
 nullFunc_vi(242); //@line 7110
}
function b90(p0) {
 p0 = p0 | 0;
 nullFunc_vi(241); //@line 7107
}
function b89(p0) {
 p0 = p0 | 0;
 nullFunc_vi(240); //@line 7104
}
function b88(p0) {
 p0 = p0 | 0;
 nullFunc_vi(239); //@line 7101
}
function b87(p0) {
 p0 = p0 | 0;
 nullFunc_vi(238); //@line 7098
}
function b86(p0) {
 p0 = p0 | 0;
 nullFunc_vi(237); //@line 7095
}
function b85(p0) {
 p0 = p0 | 0;
 nullFunc_vi(236); //@line 7092
}
function b84(p0) {
 p0 = p0 | 0;
 nullFunc_vi(235); //@line 7089
}
function b83(p0) {
 p0 = p0 | 0;
 nullFunc_vi(234); //@line 7086
}
function b82(p0) {
 p0 = p0 | 0;
 nullFunc_vi(233); //@line 7083
}
function b81(p0) {
 p0 = p0 | 0;
 nullFunc_vi(232); //@line 7080
}
function b80(p0) {
 p0 = p0 | 0;
 nullFunc_vi(231); //@line 7077
}
function b79(p0) {
 p0 = p0 | 0;
 nullFunc_vi(230); //@line 7074
}
function b78(p0) {
 p0 = p0 | 0;
 nullFunc_vi(229); //@line 7071
}
function b77(p0) {
 p0 = p0 | 0;
 nullFunc_vi(228); //@line 7068
}
function b76(p0) {
 p0 = p0 | 0;
 nullFunc_vi(227); //@line 7065
}
function b75(p0) {
 p0 = p0 | 0;
 nullFunc_vi(226); //@line 7062
}
function b74(p0) {
 p0 = p0 | 0;
 nullFunc_vi(225); //@line 7059
}
function b73(p0) {
 p0 = p0 | 0;
 nullFunc_vi(224); //@line 7056
}
function b72(p0) {
 p0 = p0 | 0;
 nullFunc_vi(223); //@line 7053
}
function b71(p0) {
 p0 = p0 | 0;
 nullFunc_vi(222); //@line 7050
}
function b70(p0) {
 p0 = p0 | 0;
 nullFunc_vi(221); //@line 7047
}
function b69(p0) {
 p0 = p0 | 0;
 nullFunc_vi(220); //@line 7044
}
function b68(p0) {
 p0 = p0 | 0;
 nullFunc_vi(219); //@line 7041
}
function b67(p0) {
 p0 = p0 | 0;
 nullFunc_vi(218); //@line 7038
}
function b66(p0) {
 p0 = p0 | 0;
 nullFunc_vi(217); //@line 7035
}
function b65(p0) {
 p0 = p0 | 0;
 nullFunc_vi(216); //@line 7032
}
function b64(p0) {
 p0 = p0 | 0;
 nullFunc_vi(215); //@line 7029
}
function b63(p0) {
 p0 = p0 | 0;
 nullFunc_vi(214); //@line 7026
}
function b62(p0) {
 p0 = p0 | 0;
 nullFunc_vi(213); //@line 7023
}
function b61(p0) {
 p0 = p0 | 0;
 nullFunc_vi(212); //@line 7020
}
function b60(p0) {
 p0 = p0 | 0;
 nullFunc_vi(211); //@line 7017
}
function b59(p0) {
 p0 = p0 | 0;
 nullFunc_vi(210); //@line 7014
}
function b58(p0) {
 p0 = p0 | 0;
 nullFunc_vi(209); //@line 7011
}
function b57(p0) {
 p0 = p0 | 0;
 nullFunc_vi(208); //@line 7008
}
function b56(p0) {
 p0 = p0 | 0;
 nullFunc_vi(207); //@line 7005
}
function b55(p0) {
 p0 = p0 | 0;
 nullFunc_vi(206); //@line 7002
}
function b54(p0) {
 p0 = p0 | 0;
 nullFunc_vi(205); //@line 6999
}
function b53(p0) {
 p0 = p0 | 0;
 nullFunc_vi(204); //@line 6996
}
function b52(p0) {
 p0 = p0 | 0;
 nullFunc_vi(203); //@line 6993
}
function b51(p0) {
 p0 = p0 | 0;
 nullFunc_vi(202); //@line 6990
}
function b50(p0) {
 p0 = p0 | 0;
 nullFunc_vi(201); //@line 6987
}
function b49(p0) {
 p0 = p0 | 0;
 nullFunc_vi(200); //@line 6984
}
function b48(p0) {
 p0 = p0 | 0;
 nullFunc_vi(199); //@line 6981
}
function b47(p0) {
 p0 = p0 | 0;
 nullFunc_vi(198); //@line 6978
}
function b46(p0) {
 p0 = p0 | 0;
 nullFunc_vi(197); //@line 6975
}
function b45(p0) {
 p0 = p0 | 0;
 nullFunc_vi(196); //@line 6972
}
function b44(p0) {
 p0 = p0 | 0;
 nullFunc_vi(195); //@line 6969
}
function b43(p0) {
 p0 = p0 | 0;
 nullFunc_vi(194); //@line 6966
}
function b42(p0) {
 p0 = p0 | 0;
 nullFunc_vi(193); //@line 6963
}
function b41(p0) {
 p0 = p0 | 0;
 nullFunc_vi(192); //@line 6960
}
function b40(p0) {
 p0 = p0 | 0;
 nullFunc_vi(191); //@line 6957
}
function b39(p0) {
 p0 = p0 | 0;
 nullFunc_vi(190); //@line 6954
}
function b38(p0) {
 p0 = p0 | 0;
 nullFunc_vi(189); //@line 6951
}
function b37(p0) {
 p0 = p0 | 0;
 nullFunc_vi(188); //@line 6948
}
function b36(p0) {
 p0 = p0 | 0;
 nullFunc_vi(187); //@line 6945
}
function b35(p0) {
 p0 = p0 | 0;
 nullFunc_vi(186); //@line 6942
}
function b34(p0) {
 p0 = p0 | 0;
 nullFunc_vi(185); //@line 6939
}
function b33(p0) {
 p0 = p0 | 0;
 nullFunc_vi(184); //@line 6936
}
function b32(p0) {
 p0 = p0 | 0;
 nullFunc_vi(183); //@line 6933
}
function b31(p0) {
 p0 = p0 | 0;
 nullFunc_vi(182); //@line 6930
}
function b30(p0) {
 p0 = p0 | 0;
 nullFunc_vi(181); //@line 6927
}
function b29(p0) {
 p0 = p0 | 0;
 nullFunc_vi(180); //@line 6924
}
function b28(p0) {
 p0 = p0 | 0;
 nullFunc_vi(179); //@line 6921
}
function b27(p0) {
 p0 = p0 | 0;
 nullFunc_vi(178); //@line 6918
}
function b26(p0) {
 p0 = p0 | 0;
 nullFunc_vi(177); //@line 6915
}
function b25(p0) {
 p0 = p0 | 0;
 nullFunc_vi(176); //@line 6912
}
function b24(p0) {
 p0 = p0 | 0;
 nullFunc_vi(175); //@line 6909
}
function b23(p0) {
 p0 = p0 | 0;
 nullFunc_vi(174); //@line 6906
}
function b22(p0) {
 p0 = p0 | 0;
 nullFunc_vi(173); //@line 6903
}
function b21(p0) {
 p0 = p0 | 0;
 nullFunc_vi(172); //@line 6900
}
function b20(p0) {
 p0 = p0 | 0;
 nullFunc_vi(171); //@line 6897
}
function b19(p0) {
 p0 = p0 | 0;
 nullFunc_vi(170); //@line 6894
}
function b18(p0) {
 p0 = p0 | 0;
 nullFunc_vi(169); //@line 6891
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 7332
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 7649
}
function b17(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 6888
}
function _us_ticker_set_interrupt($0) {
 $0 = $0 | 0;
 return;
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _initialize__async_cb_52($0) {
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
 return 452; //@line 3530
}
function _get_us_ticker_data() {
 return 396; //@line 2716
}
function __ZSt9terminatev__async_cb_63($0) {
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
 return 6456; //@line 7326
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
 return 720; //@line 7379
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
 nullFunc_v(15); //@line 6885
}
function b14() {
 nullFunc_v(14); //@line 6882
}
function b13() {
 nullFunc_v(13); //@line 6879
}
function b12() {
 nullFunc_v(12); //@line 6876
}
function b11() {
 nullFunc_v(11); //@line 6873
}
function b10() {
 nullFunc_v(0); //@line 6867
}
function _us_ticker_init() {
 return;
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_i = [b1,_us_ticker_read,_us_ticker_get_info,b2];
var FUNCTION_TABLE_ii = [b4,___stdio_close];
var FUNCTION_TABLE_iiii = [b6,___stdio_write,___stdio_seek,___stdout_write,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b7,b8];
var FUNCTION_TABLE_v = [b10,___cxa_pure_virtual__wrapper,_us_ticker_init,_us_ticker_disable_interrupt,_us_ticker_clear_interrupt,_us_ticker_fire_interrupt,__ZL25default_terminate_handlerv,__Z10blink_led1v,__Z12turn_led3_onv,__Z11toggle_led2v,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev,b11,b12,b13,b14,b15];
var FUNCTION_TABLE_vi = [b17,__ZN4mbed11InterruptInD2Ev,__ZN4mbed11InterruptInD0Ev,__ZN4mbed7TimeoutD2Ev,__ZN4mbed7TimeoutD0Ev,__ZN4mbed7Timeout7handlerEv,__ZN4mbed10TimerEventD2Ev,__ZN4mbed10TimerEventD0Ev,_mbed_trace_default_print,__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv,__ZN4mbed8CallbackIFvvEE13function_dtorIPS1_EEvPv,_us_ticker_set_interrupt,__ZN4mbed6TickerD2Ev,__ZN4mbed6TickerD0Ev,__ZN4mbed6Ticker7handlerEv,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed11InterruptInD2Ev__async_cb,__ZN4mbed11InterruptInD2Ev__async_cb_15,__ZN4mbed11InterruptInD0Ev__async_cb,__ZN4mbed11InterruptInD0Ev__async_cb_14,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_48,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_58
,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_59,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_60,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_61,__ZN4mbed7TimeoutD2Ev__async_cb,__ZN4mbed7TimeoutD2Ev__async_cb_70,__ZN4mbed7TimeoutD0Ev__async_cb,__ZN4mbed7TimeoutD0Ev__async_cb_19,__ZN4mbed7Timeout7handlerEv__async_cb,__ZN4mbed7Timeout7handlerEv__async_cb_26,__ZN4mbed7Timeout7handlerEv__async_cb_24,__ZN4mbed7Timeout7handlerEv__async_cb_25,__ZN4mbed10TimerEventD2Ev__async_cb,__ZN4mbed10TimerEvent3irqEj,__ZN4mbed10TimerEventC2Ev__async_cb,__ZN4mbed10TimerEvent3irqEj__async_cb,_mbed_trace_default_print__async_cb,_mbed_tracef__async_cb,_mbed_vtracef__async_cb,_mbed_vtracef__async_cb_13,_mbed_vtracef__async_cb_3,_mbed_vtracef__async_cb_4,_mbed_vtracef__async_cb_5,_mbed_vtracef__async_cb_12,_mbed_vtracef__async_cb_6,_mbed_vtracef__async_cb_11,_mbed_vtracef__async_cb_7,_mbed_vtracef__async_cb_8,_mbed_vtracef__async_cb_9,_mbed_vtracef__async_cb_10,__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv__async_cb
,_ticker_set_handler__async_cb,_initialize__async_cb,_initialize__async_cb_49,_initialize__async_cb_54,_initialize__async_cb_53,_initialize__async_cb_50,_initialize__async_cb_51,_initialize__async_cb_52,_schedule_interrupt__async_cb,_schedule_interrupt__async_cb_38,_schedule_interrupt__async_cb_39,_schedule_interrupt__async_cb_40,_schedule_interrupt__async_cb_41,_schedule_interrupt__async_cb_42,_schedule_interrupt__async_cb_43,_ticker_remove_event__async_cb,_mbed_assert_internal__async_cb,_mbed_die__async_cb_86,_mbed_die__async_cb_85,_mbed_die__async_cb_84,_mbed_die__async_cb_83,_mbed_die__async_cb_82,_mbed_die__async_cb_81,_mbed_die__async_cb_80,_mbed_die__async_cb_79,_mbed_die__async_cb_78,_mbed_die__async_cb_77,_mbed_die__async_cb_76,_mbed_die__async_cb_75,_mbed_die__async_cb_74
,_mbed_die__async_cb_73,_mbed_die__async_cb_72,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_vfprintf__async_cb,_mbed_error_vfprintf__async_cb_2,_mbed_error_vfprintf__async_cb_1,_handle_interrupt_in__async_cb,_serial_putc__async_cb_21,_serial_putc__async_cb,__ZN4mbed6TickerD2Ev__async_cb,__ZN4mbed6TickerD2Ev__async_cb_87,__ZN4mbed6TickerD0Ev__async_cb,__ZN4mbed6TickerD0Ev__async_cb_68,__ZN4mbed6Ticker7handlerEv__async_cb,_invoke_ticker__async_cb_20,_invoke_ticker__async_cb,_wait_ms__async_cb,__GLOBAL__sub_I_main_cpp__async_cb_23,__GLOBAL__sub_I_main_cpp__async_cb,__Z10blink_led1v__async_cb,__Z11toggle_led2v__async_cb,__Z12turn_led3_onv__async_cb,_main__async_cb_32,_main__async_cb_31,_main__async_cb_30,_main__async_cb_34,_main__async_cb,_main__async_cb_33,_main__async_cb_28
,_main__async_cb_35,_main__async_cb_29,_main__async_cb_36,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_64,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_65,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_66,_putc__async_cb_69,_putc__async_cb,___overflow__async_cb,_fflush__async_cb_17,_fflush__async_cb_16,_fflush__async_cb_18,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_22,_vfprintf__async_cb,_snprintf__async_cb,_vsnprintf__async_cb,_fputc__async_cb_71,_fputc__async_cb,_puts__async_cb,__ZL25default_terminate_handlerv__async_cb,__ZL25default_terminate_handlerv__async_cb_56,_abort_message__async_cb,_abort_message__async_cb_55,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_67,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_27
,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_62,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_37,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_47,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_46,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_45,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_44,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_57,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b18,b19,b20,b21,b22,b23,b24,b25,b26,b27
,b28,b29,b30,b31,b32,b33,b34,b35,b36,b37,b38,b39,b40,b41,b42,b43,b44,b45,b46,b47,b48,b49,b50,b51,b52,b53,b54,b55,b56,b57
,b58,b59,b60,b61,b62,b63,b64,b65,b66,b67,b68,b69,b70,b71,b72,b73,b74,b75,b76,b77,b78,b79,b80,b81,b82,b83,b84,b85,b86,b87
,b88,b89,b90,b91,b92,b93,b94,b95,b96,b97,b98,b99,b100,b101,b102,b103,b104];
var FUNCTION_TABLE_vii = [b106,__ZN4mbed8CallbackIFvvEE13function_moveIPS1_EEvPvPKv,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event,b107];
var FUNCTION_TABLE_viiii = [b109,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi];
var FUNCTION_TABLE_viiiii = [b111,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib];
var FUNCTION_TABLE_viiiiii = [b113,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib];

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
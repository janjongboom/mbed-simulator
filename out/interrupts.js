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
 function($0) { window.MbedJSHal.timers.ticker_detach($0); },
 function($0, $1) { window.MbedJSHal.timers.ticker_setup($0, $1); },
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

STATICTOP = STATIC_BASE + 7008;
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
var debug_table_iiii = ["0", "___stdio_write", "___stdio_seek", "___stdout_write", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv", "0", "0", "0"];
var debug_table_v = ["0", "___cxa_pure_virtual", "_us_ticker_init", "_us_ticker_disable_interrupt", "_us_ticker_clear_interrupt", "_us_ticker_fire_interrupt", "__ZL25default_terminate_handlerv", "__Z10blink_led1v", "__Z12turn_led3_onv", "__Z11toggle_led2v", "__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev", "0", "0", "0", "0", "0"];
var debug_table_vi = ["0", "__ZN4mbed11InterruptInD2Ev", "__ZN4mbed11InterruptInD0Ev", "__ZN4mbed7TimeoutD2Ev", "__ZN4mbed7TimeoutD0Ev", "__ZN4mbed7Timeout7handlerEv", "__ZN4mbed10TimerEventD2Ev", "__ZN4mbed10TimerEventD0Ev", "_us_ticker_set_interrupt", "__ZN4mbed10TimerEvent3irqEj", "__ZN4mbed6TickerD2Ev", "__ZN4mbed6TickerD0Ev", "__ZN4mbed6Ticker7handlerEv", "__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv", "__ZN4mbed8CallbackIFvvEE13function_dtorIPS1_EEvPv", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "__ZN10__cxxabiv121__vmi_class_type_infoD0Ev", "__ZN4mbed11InterruptInD2Ev__async_cb", "__ZN4mbed11InterruptInD2Ev__async_cb_60", "__ZN4mbed11InterruptInD0Ev__async_cb", "__ZN4mbed11InterruptInD0Ev__async_cb_26", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_25", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_5", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_6", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_7", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_8", "__ZN4mbed7TimeoutD2Ev__async_cb", "__ZN4mbed7TimeoutD2Ev__async_cb_21", "__ZN4mbed7TimeoutD0Ev__async_cb", "__ZN4mbed7TimeoutD0Ev__async_cb_56", "__ZN4mbed7Timeout7handlerEv__async_cb_61", "__ZN4mbed7Timeout7handlerEv__async_cb", "__ZN4mbed10TimerEventD2Ev__async_cb", "__ZN4mbed10TimerEventC2Ev__async_cb", "__ZN4mbed10TimerEvent3irqEj__async_cb", "_ticker_set_handler__async_cb", "_initialize__async_cb", "_initialize__async_cb_29", "_initialize__async_cb_34", "_initialize__async_cb_33", "_initialize__async_cb_30", "_initialize__async_cb_31", "_initialize__async_cb_32", "_schedule_interrupt__async_cb", "_schedule_interrupt__async_cb_10", "_schedule_interrupt__async_cb_11", "_schedule_interrupt__async_cb_12", "_schedule_interrupt__async_cb_13", "_schedule_interrupt__async_cb_14", "_schedule_interrupt__async_cb_15", "_ticker_remove_event__async_cb", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_49", "_mbed_die__async_cb_48", "_mbed_die__async_cb_47", "_mbed_die__async_cb_46", "_mbed_die__async_cb_45", "_mbed_die__async_cb_44", "_mbed_die__async_cb_43", "_mbed_die__async_cb_42", "_mbed_die__async_cb_41", "_mbed_die__async_cb_40", "_mbed_die__async_cb_39", "_mbed_die__async_cb_38", "_mbed_die__async_cb_37", "_mbed_die__async_cb_36", "_mbed_die__async_cb_35", "_mbed_die__async_cb", "_handle_interrupt_in__async_cb", "__ZN4mbed6TickerD2Ev__async_cb", "__ZN4mbed6TickerD2Ev__async_cb_16", "__ZN4mbed6TickerD0Ev__async_cb", "__ZN4mbed6TickerD0Ev__async_cb_1", "__ZN4mbed6Ticker7handlerEv__async_cb", "_invoke_ticker__async_cb_55", "_invoke_ticker__async_cb", "__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv__async_cb", "_wait_ms__async_cb", "__GLOBAL__sub_I_main_cpp__async_cb_27", "__GLOBAL__sub_I_main_cpp__async_cb", "__Z10blink_led1v__async_cb", "__Z11toggle_led2v__async_cb", "__Z12turn_led3_onv__async_cb", "_main__async_cb_66", "_main__async_cb_65", "_main__async_cb_64", "_main__async_cb_68", "_main__async_cb", "_main__async_cb_67", "_main__async_cb_62", "_main__async_cb_69", "_main__async_cb_63", "_main__async_cb_70", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_2", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_3", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_4", "___overflow__async_cb", "_fflush__async_cb_51", "_fflush__async_cb_50", "_fflush__async_cb_52", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_28", "_vfprintf__async_cb", "_fputc__async_cb_59", "_fputc__async_cb", "_puts__async_cb", "__ZL25default_terminate_handlerv__async_cb", "__ZL25default_terminate_handlerv__async_cb_24", "_abort_message__async_cb", "_abort_message__async_cb_53", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_22", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_23", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_54", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv", "__ZSt11__terminatePFvvE__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_9", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_20", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_19", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_18", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_17", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_58", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_i": nullFunc_i, "nullFunc_ii": nullFunc_ii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_v": nullFunc_v, "nullFunc_vi": nullFunc_vi, "nullFunc_vii": nullFunc_vii, "nullFunc_viiii": nullFunc_viiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "invoke_i": invoke_i, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "___cxa_begin_catch": ___cxa_begin_catch, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "___cxa_pure_virtual": ___cxa_pure_virtual, "___gxx_personality_v0": ___gxx_personality_v0, "___lock": ___lock, "___resumeException": ___resumeException, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___unlock": ___unlock, "_abort": _abort, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_asm_const_iiii": _emscripten_asm_const_iiii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "_llvm_trap": _llvm_trap, "_pthread_getspecific": _pthread_getspecific, "_pthread_key_create": _pthread_key_create, "_pthread_once": _pthread_once, "_pthread_setspecific": _pthread_setspecific, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
 sp = STACKTOP; //@line 2645
 STACKTOP = STACKTOP + 16 | 0; //@line 2646
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2646
 $1 = sp; //@line 2647
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 2654
   $7 = $6 >>> 3; //@line 2655
   $8 = HEAP32[1343] | 0; //@line 2656
   $9 = $8 >>> $7; //@line 2657
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 2663
    $16 = 5412 + ($14 << 1 << 2) | 0; //@line 2665
    $17 = $16 + 8 | 0; //@line 2666
    $18 = HEAP32[$17 >> 2] | 0; //@line 2667
    $19 = $18 + 8 | 0; //@line 2668
    $20 = HEAP32[$19 >> 2] | 0; //@line 2669
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1343] = $8 & ~(1 << $14); //@line 2676
     } else {
      if ((HEAP32[1347] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 2681
      }
      $27 = $20 + 12 | 0; //@line 2684
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 2688
       HEAP32[$17 >> 2] = $20; //@line 2689
       break;
      } else {
       _abort(); //@line 2692
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 2697
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 2700
    $34 = $18 + $30 + 4 | 0; //@line 2702
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 2705
    $$0 = $19; //@line 2706
    STACKTOP = sp; //@line 2707
    return $$0 | 0; //@line 2707
   }
   $37 = HEAP32[1345] | 0; //@line 2709
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 2715
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 2718
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 2721
     $49 = $47 >>> 12 & 16; //@line 2723
     $50 = $47 >>> $49; //@line 2724
     $52 = $50 >>> 5 & 8; //@line 2726
     $54 = $50 >>> $52; //@line 2728
     $56 = $54 >>> 2 & 4; //@line 2730
     $58 = $54 >>> $56; //@line 2732
     $60 = $58 >>> 1 & 2; //@line 2734
     $62 = $58 >>> $60; //@line 2736
     $64 = $62 >>> 1 & 1; //@line 2738
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 2741
     $69 = 5412 + ($67 << 1 << 2) | 0; //@line 2743
     $70 = $69 + 8 | 0; //@line 2744
     $71 = HEAP32[$70 >> 2] | 0; //@line 2745
     $72 = $71 + 8 | 0; //@line 2746
     $73 = HEAP32[$72 >> 2] | 0; //@line 2747
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 2753
       HEAP32[1343] = $77; //@line 2754
       $98 = $77; //@line 2755
      } else {
       if ((HEAP32[1347] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 2760
       }
       $80 = $73 + 12 | 0; //@line 2763
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 2767
        HEAP32[$70 >> 2] = $73; //@line 2768
        $98 = $8; //@line 2769
        break;
       } else {
        _abort(); //@line 2772
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 2777
     $84 = $83 - $6 | 0; //@line 2778
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 2781
     $87 = $71 + $6 | 0; //@line 2782
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 2785
     HEAP32[$71 + $83 >> 2] = $84; //@line 2787
     if ($37 | 0) {
      $92 = HEAP32[1348] | 0; //@line 2790
      $93 = $37 >>> 3; //@line 2791
      $95 = 5412 + ($93 << 1 << 2) | 0; //@line 2793
      $96 = 1 << $93; //@line 2794
      if (!($98 & $96)) {
       HEAP32[1343] = $98 | $96; //@line 2799
       $$0199 = $95; //@line 2801
       $$pre$phiZ2D = $95 + 8 | 0; //@line 2801
      } else {
       $101 = $95 + 8 | 0; //@line 2803
       $102 = HEAP32[$101 >> 2] | 0; //@line 2804
       if ((HEAP32[1347] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 2808
       } else {
        $$0199 = $102; //@line 2811
        $$pre$phiZ2D = $101; //@line 2811
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 2814
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 2816
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 2818
      HEAP32[$92 + 12 >> 2] = $95; //@line 2820
     }
     HEAP32[1345] = $84; //@line 2822
     HEAP32[1348] = $87; //@line 2823
     $$0 = $72; //@line 2824
     STACKTOP = sp; //@line 2825
     return $$0 | 0; //@line 2825
    }
    $108 = HEAP32[1344] | 0; //@line 2827
    if (!$108) {
     $$0197 = $6; //@line 2830
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 2834
     $114 = $112 >>> 12 & 16; //@line 2836
     $115 = $112 >>> $114; //@line 2837
     $117 = $115 >>> 5 & 8; //@line 2839
     $119 = $115 >>> $117; //@line 2841
     $121 = $119 >>> 2 & 4; //@line 2843
     $123 = $119 >>> $121; //@line 2845
     $125 = $123 >>> 1 & 2; //@line 2847
     $127 = $123 >>> $125; //@line 2849
     $129 = $127 >>> 1 & 1; //@line 2851
     $134 = HEAP32[5676 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 2856
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 2860
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2866
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 2869
      $$0193$lcssa$i = $138; //@line 2869
     } else {
      $$01926$i = $134; //@line 2871
      $$01935$i = $138; //@line 2871
      $146 = $143; //@line 2871
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 2876
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 2877
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 2878
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 2879
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2885
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 2888
        $$0193$lcssa$i = $$$0193$i; //@line 2888
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 2891
        $$01935$i = $$$0193$i; //@line 2891
       }
      }
     }
     $157 = HEAP32[1347] | 0; //@line 2895
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 2898
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 2901
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 2904
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 2908
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 2910
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 2914
       $176 = HEAP32[$175 >> 2] | 0; //@line 2915
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 2918
        $179 = HEAP32[$178 >> 2] | 0; //@line 2919
        if (!$179) {
         $$3$i = 0; //@line 2922
         break;
        } else {
         $$1196$i = $179; //@line 2925
         $$1198$i = $178; //@line 2925
        }
       } else {
        $$1196$i = $176; //@line 2928
        $$1198$i = $175; //@line 2928
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 2931
        $182 = HEAP32[$181 >> 2] | 0; //@line 2932
        if ($182 | 0) {
         $$1196$i = $182; //@line 2935
         $$1198$i = $181; //@line 2935
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 2938
        $185 = HEAP32[$184 >> 2] | 0; //@line 2939
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 2944
         $$1198$i = $184; //@line 2944
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 2949
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 2952
        $$3$i = $$1196$i; //@line 2953
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 2958
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 2961
       }
       $169 = $167 + 12 | 0; //@line 2964
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 2968
       }
       $172 = $164 + 8 | 0; //@line 2971
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 2975
        HEAP32[$172 >> 2] = $167; //@line 2976
        $$3$i = $164; //@line 2977
        break;
       } else {
        _abort(); //@line 2980
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 2989
       $191 = 5676 + ($190 << 2) | 0; //@line 2990
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 2995
         if (!$$3$i) {
          HEAP32[1344] = $108 & ~(1 << $190); //@line 3001
          break L73;
         }
        } else {
         if ((HEAP32[1347] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 3008
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 3016
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1347] | 0; //@line 3026
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 3029
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 3033
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 3035
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 3041
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 3045
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 3047
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 3053
       if ($214 | 0) {
        if ((HEAP32[1347] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 3059
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 3063
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 3065
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 3073
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 3076
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 3078
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 3081
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 3085
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 3088
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 3090
      if ($37 | 0) {
       $234 = HEAP32[1348] | 0; //@line 3093
       $235 = $37 >>> 3; //@line 3094
       $237 = 5412 + ($235 << 1 << 2) | 0; //@line 3096
       $238 = 1 << $235; //@line 3097
       if (!($8 & $238)) {
        HEAP32[1343] = $8 | $238; //@line 3102
        $$0189$i = $237; //@line 3104
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 3104
       } else {
        $242 = $237 + 8 | 0; //@line 3106
        $243 = HEAP32[$242 >> 2] | 0; //@line 3107
        if ((HEAP32[1347] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 3111
        } else {
         $$0189$i = $243; //@line 3114
         $$pre$phi$iZ2D = $242; //@line 3114
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 3117
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 3119
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 3121
       HEAP32[$234 + 12 >> 2] = $237; //@line 3123
      }
      HEAP32[1345] = $$0193$lcssa$i; //@line 3125
      HEAP32[1348] = $159; //@line 3126
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 3129
     STACKTOP = sp; //@line 3130
     return $$0 | 0; //@line 3130
    }
   } else {
    $$0197 = $6; //@line 3133
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 3138
   } else {
    $251 = $0 + 11 | 0; //@line 3140
    $252 = $251 & -8; //@line 3141
    $253 = HEAP32[1344] | 0; //@line 3142
    if (!$253) {
     $$0197 = $252; //@line 3145
    } else {
     $255 = 0 - $252 | 0; //@line 3147
     $256 = $251 >>> 8; //@line 3148
     if (!$256) {
      $$0358$i = 0; //@line 3151
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 3155
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 3159
       $262 = $256 << $261; //@line 3160
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 3163
       $267 = $262 << $265; //@line 3165
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 3168
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 3173
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 3179
      }
     }
     $282 = HEAP32[5676 + ($$0358$i << 2) >> 2] | 0; //@line 3183
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 3187
       $$3$i203 = 0; //@line 3187
       $$3350$i = $255; //@line 3187
       label = 81; //@line 3188
      } else {
       $$0342$i = 0; //@line 3195
       $$0347$i = $255; //@line 3195
       $$0353$i = $282; //@line 3195
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 3195
       $$0362$i = 0; //@line 3195
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 3200
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 3205
          $$435113$i = 0; //@line 3205
          $$435712$i = $$0353$i; //@line 3205
          label = 85; //@line 3206
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 3209
          $$1348$i = $292; //@line 3209
         }
        } else {
         $$1343$i = $$0342$i; //@line 3212
         $$1348$i = $$0347$i; //@line 3212
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 3215
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 3218
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 3222
        $302 = ($$0353$i | 0) == 0; //@line 3223
        if ($302) {
         $$2355$i = $$1363$i; //@line 3228
         $$3$i203 = $$1343$i; //@line 3228
         $$3350$i = $$1348$i; //@line 3228
         label = 81; //@line 3229
         break;
        } else {
         $$0342$i = $$1343$i; //@line 3232
         $$0347$i = $$1348$i; //@line 3232
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 3232
         $$0362$i = $$1363$i; //@line 3232
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 3242
       $309 = $253 & ($306 | 0 - $306); //@line 3245
       if (!$309) {
        $$0197 = $252; //@line 3248
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 3253
       $315 = $313 >>> 12 & 16; //@line 3255
       $316 = $313 >>> $315; //@line 3256
       $318 = $316 >>> 5 & 8; //@line 3258
       $320 = $316 >>> $318; //@line 3260
       $322 = $320 >>> 2 & 4; //@line 3262
       $324 = $320 >>> $322; //@line 3264
       $326 = $324 >>> 1 & 2; //@line 3266
       $328 = $324 >>> $326; //@line 3268
       $330 = $328 >>> 1 & 1; //@line 3270
       $$4$ph$i = 0; //@line 3276
       $$4357$ph$i = HEAP32[5676 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 3276
      } else {
       $$4$ph$i = $$3$i203; //@line 3278
       $$4357$ph$i = $$2355$i; //@line 3278
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 3282
       $$4351$lcssa$i = $$3350$i; //@line 3282
      } else {
       $$414$i = $$4$ph$i; //@line 3284
       $$435113$i = $$3350$i; //@line 3284
       $$435712$i = $$4357$ph$i; //@line 3284
       label = 85; //@line 3285
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 3290
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 3294
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 3295
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 3296
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 3297
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 3303
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 3306
        $$4351$lcssa$i = $$$4351$i; //@line 3306
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 3309
        $$435113$i = $$$4351$i; //@line 3309
        label = 85; //@line 3310
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 3316
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1345] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1347] | 0; //@line 3322
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 3325
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 3328
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 3331
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 3335
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 3337
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 3341
         $371 = HEAP32[$370 >> 2] | 0; //@line 3342
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 3345
          $374 = HEAP32[$373 >> 2] | 0; //@line 3346
          if (!$374) {
           $$3372$i = 0; //@line 3349
           break;
          } else {
           $$1370$i = $374; //@line 3352
           $$1374$i = $373; //@line 3352
          }
         } else {
          $$1370$i = $371; //@line 3355
          $$1374$i = $370; //@line 3355
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 3358
          $377 = HEAP32[$376 >> 2] | 0; //@line 3359
          if ($377 | 0) {
           $$1370$i = $377; //@line 3362
           $$1374$i = $376; //@line 3362
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 3365
          $380 = HEAP32[$379 >> 2] | 0; //@line 3366
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 3371
           $$1374$i = $379; //@line 3371
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 3376
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 3379
          $$3372$i = $$1370$i; //@line 3380
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 3385
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 3388
         }
         $364 = $362 + 12 | 0; //@line 3391
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 3395
         }
         $367 = $359 + 8 | 0; //@line 3398
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 3402
          HEAP32[$367 >> 2] = $362; //@line 3403
          $$3372$i = $359; //@line 3404
          break;
         } else {
          _abort(); //@line 3407
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 3415
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 3418
         $386 = 5676 + ($385 << 2) | 0; //@line 3419
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 3424
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 3429
            HEAP32[1344] = $391; //@line 3430
            $475 = $391; //@line 3431
            break L164;
           }
          } else {
           if ((HEAP32[1347] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 3438
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 3446
            if (!$$3372$i) {
             $475 = $253; //@line 3449
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1347] | 0; //@line 3457
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 3460
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 3464
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 3466
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 3472
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 3476
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 3478
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 3484
         if (!$409) {
          $475 = $253; //@line 3487
         } else {
          if ((HEAP32[1347] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 3492
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 3496
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 3498
           $475 = $253; //@line 3499
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 3508
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 3511
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 3513
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 3516
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 3520
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 3523
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 3525
         $428 = $$4351$lcssa$i >>> 3; //@line 3526
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 5412 + ($428 << 1 << 2) | 0; //@line 3530
          $432 = HEAP32[1343] | 0; //@line 3531
          $433 = 1 << $428; //@line 3532
          if (!($432 & $433)) {
           HEAP32[1343] = $432 | $433; //@line 3537
           $$0368$i = $431; //@line 3539
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 3539
          } else {
           $437 = $431 + 8 | 0; //@line 3541
           $438 = HEAP32[$437 >> 2] | 0; //@line 3542
           if ((HEAP32[1347] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 3546
           } else {
            $$0368$i = $438; //@line 3549
            $$pre$phi$i211Z2D = $437; //@line 3549
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 3552
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 3554
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 3556
          HEAP32[$354 + 12 >> 2] = $431; //@line 3558
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 3561
         if (!$444) {
          $$0361$i = 0; //@line 3564
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 3568
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 3572
           $450 = $444 << $449; //@line 3573
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 3576
           $455 = $450 << $453; //@line 3578
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 3581
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 3586
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 3592
          }
         }
         $469 = 5676 + ($$0361$i << 2) | 0; //@line 3595
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 3597
         $471 = $354 + 16 | 0; //@line 3598
         HEAP32[$471 + 4 >> 2] = 0; //@line 3600
         HEAP32[$471 >> 2] = 0; //@line 3601
         $473 = 1 << $$0361$i; //@line 3602
         if (!($475 & $473)) {
          HEAP32[1344] = $475 | $473; //@line 3607
          HEAP32[$469 >> 2] = $354; //@line 3608
          HEAP32[$354 + 24 >> 2] = $469; //@line 3610
          HEAP32[$354 + 12 >> 2] = $354; //@line 3612
          HEAP32[$354 + 8 >> 2] = $354; //@line 3614
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 3623
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 3623
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 3630
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 3634
          $494 = HEAP32[$492 >> 2] | 0; //@line 3636
          if (!$494) {
           label = 136; //@line 3639
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 3642
           $$0345$i = $494; //@line 3642
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1347] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 3649
          } else {
           HEAP32[$492 >> 2] = $354; //@line 3652
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 3654
           HEAP32[$354 + 12 >> 2] = $354; //@line 3656
           HEAP32[$354 + 8 >> 2] = $354; //@line 3658
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 3663
          $502 = HEAP32[$501 >> 2] | 0; //@line 3664
          $503 = HEAP32[1347] | 0; //@line 3665
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 3671
           HEAP32[$501 >> 2] = $354; //@line 3672
           HEAP32[$354 + 8 >> 2] = $502; //@line 3674
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 3676
           HEAP32[$354 + 24 >> 2] = 0; //@line 3678
           break;
          } else {
           _abort(); //@line 3681
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 3688
       STACKTOP = sp; //@line 3689
       return $$0 | 0; //@line 3689
      } else {
       $$0197 = $252; //@line 3691
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1345] | 0; //@line 3698
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 3701
  $515 = HEAP32[1348] | 0; //@line 3702
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 3705
   HEAP32[1348] = $517; //@line 3706
   HEAP32[1345] = $514; //@line 3707
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 3710
   HEAP32[$515 + $512 >> 2] = $514; //@line 3712
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 3715
  } else {
   HEAP32[1345] = 0; //@line 3717
   HEAP32[1348] = 0; //@line 3718
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 3721
   $526 = $515 + $512 + 4 | 0; //@line 3723
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 3726
  }
  $$0 = $515 + 8 | 0; //@line 3729
  STACKTOP = sp; //@line 3730
  return $$0 | 0; //@line 3730
 }
 $530 = HEAP32[1346] | 0; //@line 3732
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 3735
  HEAP32[1346] = $532; //@line 3736
  $533 = HEAP32[1349] | 0; //@line 3737
  $534 = $533 + $$0197 | 0; //@line 3738
  HEAP32[1349] = $534; //@line 3739
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 3742
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 3745
  $$0 = $533 + 8 | 0; //@line 3747
  STACKTOP = sp; //@line 3748
  return $$0 | 0; //@line 3748
 }
 if (!(HEAP32[1461] | 0)) {
  HEAP32[1463] = 4096; //@line 3753
  HEAP32[1462] = 4096; //@line 3754
  HEAP32[1464] = -1; //@line 3755
  HEAP32[1465] = -1; //@line 3756
  HEAP32[1466] = 0; //@line 3757
  HEAP32[1454] = 0; //@line 3758
  HEAP32[1461] = $1 & -16 ^ 1431655768; //@line 3762
  $548 = 4096; //@line 3763
 } else {
  $548 = HEAP32[1463] | 0; //@line 3766
 }
 $545 = $$0197 + 48 | 0; //@line 3768
 $546 = $$0197 + 47 | 0; //@line 3769
 $547 = $548 + $546 | 0; //@line 3770
 $549 = 0 - $548 | 0; //@line 3771
 $550 = $547 & $549; //@line 3772
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 3775
  STACKTOP = sp; //@line 3776
  return $$0 | 0; //@line 3776
 }
 $552 = HEAP32[1453] | 0; //@line 3778
 if ($552 | 0) {
  $554 = HEAP32[1451] | 0; //@line 3781
  $555 = $554 + $550 | 0; //@line 3782
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 3787
   STACKTOP = sp; //@line 3788
   return $$0 | 0; //@line 3788
  }
 }
 L244 : do {
  if (!(HEAP32[1454] & 4)) {
   $561 = HEAP32[1349] | 0; //@line 3796
   L246 : do {
    if (!$561) {
     label = 163; //@line 3800
    } else {
     $$0$i$i = 5820; //@line 3802
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 3804
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 3807
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 3816
      if (!$570) {
       label = 163; //@line 3819
       break L246;
      } else {
       $$0$i$i = $570; //@line 3822
      }
     }
     $595 = $547 - $530 & $549; //@line 3826
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 3829
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 3837
       } else {
        $$723947$i = $595; //@line 3839
        $$748$i = $597; //@line 3839
        label = 180; //@line 3840
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 3844
       $$2253$ph$i = $595; //@line 3844
       label = 171; //@line 3845
      }
     } else {
      $$2234243136$i = 0; //@line 3848
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 3854
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 3857
     } else {
      $574 = $572; //@line 3859
      $575 = HEAP32[1462] | 0; //@line 3860
      $576 = $575 + -1 | 0; //@line 3861
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 3869
      $584 = HEAP32[1451] | 0; //@line 3870
      $585 = $$$i + $584 | 0; //@line 3871
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1453] | 0; //@line 3876
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 3883
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 3887
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 3890
        $$748$i = $572; //@line 3890
        label = 180; //@line 3891
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 3894
        $$2253$ph$i = $$$i; //@line 3894
        label = 171; //@line 3895
       }
      } else {
       $$2234243136$i = 0; //@line 3898
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 3905
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 3914
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 3917
       $$748$i = $$2247$ph$i; //@line 3917
       label = 180; //@line 3918
       break L244;
      }
     }
     $607 = HEAP32[1463] | 0; //@line 3922
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 3926
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 3929
      $$748$i = $$2247$ph$i; //@line 3929
      label = 180; //@line 3930
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 3936
      $$2234243136$i = 0; //@line 3937
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 3941
      $$748$i = $$2247$ph$i; //@line 3941
      label = 180; //@line 3942
      break L244;
     }
    }
   } while (0);
   HEAP32[1454] = HEAP32[1454] | 4; //@line 3949
   $$4236$i = $$2234243136$i; //@line 3950
   label = 178; //@line 3951
  } else {
   $$4236$i = 0; //@line 3953
   label = 178; //@line 3954
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 3960
   $621 = _sbrk(0) | 0; //@line 3961
   $627 = $621 - $620 | 0; //@line 3969
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 3971
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 3979
    $$748$i = $620; //@line 3979
    label = 180; //@line 3980
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1451] | 0) + $$723947$i | 0; //@line 3986
  HEAP32[1451] = $633; //@line 3987
  if ($633 >>> 0 > (HEAP32[1452] | 0) >>> 0) {
   HEAP32[1452] = $633; //@line 3991
  }
  $636 = HEAP32[1349] | 0; //@line 3993
  do {
   if (!$636) {
    $638 = HEAP32[1347] | 0; //@line 3997
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1347] = $$748$i; //@line 4002
    }
    HEAP32[1455] = $$748$i; //@line 4004
    HEAP32[1456] = $$723947$i; //@line 4005
    HEAP32[1458] = 0; //@line 4006
    HEAP32[1352] = HEAP32[1461]; //@line 4008
    HEAP32[1351] = -1; //@line 4009
    HEAP32[1356] = 5412; //@line 4010
    HEAP32[1355] = 5412; //@line 4011
    HEAP32[1358] = 5420; //@line 4012
    HEAP32[1357] = 5420; //@line 4013
    HEAP32[1360] = 5428; //@line 4014
    HEAP32[1359] = 5428; //@line 4015
    HEAP32[1362] = 5436; //@line 4016
    HEAP32[1361] = 5436; //@line 4017
    HEAP32[1364] = 5444; //@line 4018
    HEAP32[1363] = 5444; //@line 4019
    HEAP32[1366] = 5452; //@line 4020
    HEAP32[1365] = 5452; //@line 4021
    HEAP32[1368] = 5460; //@line 4022
    HEAP32[1367] = 5460; //@line 4023
    HEAP32[1370] = 5468; //@line 4024
    HEAP32[1369] = 5468; //@line 4025
    HEAP32[1372] = 5476; //@line 4026
    HEAP32[1371] = 5476; //@line 4027
    HEAP32[1374] = 5484; //@line 4028
    HEAP32[1373] = 5484; //@line 4029
    HEAP32[1376] = 5492; //@line 4030
    HEAP32[1375] = 5492; //@line 4031
    HEAP32[1378] = 5500; //@line 4032
    HEAP32[1377] = 5500; //@line 4033
    HEAP32[1380] = 5508; //@line 4034
    HEAP32[1379] = 5508; //@line 4035
    HEAP32[1382] = 5516; //@line 4036
    HEAP32[1381] = 5516; //@line 4037
    HEAP32[1384] = 5524; //@line 4038
    HEAP32[1383] = 5524; //@line 4039
    HEAP32[1386] = 5532; //@line 4040
    HEAP32[1385] = 5532; //@line 4041
    HEAP32[1388] = 5540; //@line 4042
    HEAP32[1387] = 5540; //@line 4043
    HEAP32[1390] = 5548; //@line 4044
    HEAP32[1389] = 5548; //@line 4045
    HEAP32[1392] = 5556; //@line 4046
    HEAP32[1391] = 5556; //@line 4047
    HEAP32[1394] = 5564; //@line 4048
    HEAP32[1393] = 5564; //@line 4049
    HEAP32[1396] = 5572; //@line 4050
    HEAP32[1395] = 5572; //@line 4051
    HEAP32[1398] = 5580; //@line 4052
    HEAP32[1397] = 5580; //@line 4053
    HEAP32[1400] = 5588; //@line 4054
    HEAP32[1399] = 5588; //@line 4055
    HEAP32[1402] = 5596; //@line 4056
    HEAP32[1401] = 5596; //@line 4057
    HEAP32[1404] = 5604; //@line 4058
    HEAP32[1403] = 5604; //@line 4059
    HEAP32[1406] = 5612; //@line 4060
    HEAP32[1405] = 5612; //@line 4061
    HEAP32[1408] = 5620; //@line 4062
    HEAP32[1407] = 5620; //@line 4063
    HEAP32[1410] = 5628; //@line 4064
    HEAP32[1409] = 5628; //@line 4065
    HEAP32[1412] = 5636; //@line 4066
    HEAP32[1411] = 5636; //@line 4067
    HEAP32[1414] = 5644; //@line 4068
    HEAP32[1413] = 5644; //@line 4069
    HEAP32[1416] = 5652; //@line 4070
    HEAP32[1415] = 5652; //@line 4071
    HEAP32[1418] = 5660; //@line 4072
    HEAP32[1417] = 5660; //@line 4073
    $642 = $$723947$i + -40 | 0; //@line 4074
    $644 = $$748$i + 8 | 0; //@line 4076
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 4081
    $650 = $$748$i + $649 | 0; //@line 4082
    $651 = $642 - $649 | 0; //@line 4083
    HEAP32[1349] = $650; //@line 4084
    HEAP32[1346] = $651; //@line 4085
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 4088
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 4091
    HEAP32[1350] = HEAP32[1465]; //@line 4093
   } else {
    $$024367$i = 5820; //@line 4095
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 4097
     $658 = $$024367$i + 4 | 0; //@line 4098
     $659 = HEAP32[$658 >> 2] | 0; //@line 4099
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 4103
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 4107
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 4112
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 4126
       $673 = (HEAP32[1346] | 0) + $$723947$i | 0; //@line 4128
       $675 = $636 + 8 | 0; //@line 4130
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 4135
       $681 = $636 + $680 | 0; //@line 4136
       $682 = $673 - $680 | 0; //@line 4137
       HEAP32[1349] = $681; //@line 4138
       HEAP32[1346] = $682; //@line 4139
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 4142
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 4145
       HEAP32[1350] = HEAP32[1465]; //@line 4147
       break;
      }
     }
    }
    $688 = HEAP32[1347] | 0; //@line 4152
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1347] = $$748$i; //@line 4155
     $753 = $$748$i; //@line 4156
    } else {
     $753 = $688; //@line 4158
    }
    $690 = $$748$i + $$723947$i | 0; //@line 4160
    $$124466$i = 5820; //@line 4161
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 4166
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 4170
     if (!$694) {
      $$0$i$i$i = 5820; //@line 4173
      break;
     } else {
      $$124466$i = $694; //@line 4176
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 4185
      $700 = $$124466$i + 4 | 0; //@line 4186
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 4189
      $704 = $$748$i + 8 | 0; //@line 4191
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 4197
      $712 = $690 + 8 | 0; //@line 4199
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 4205
      $722 = $710 + $$0197 | 0; //@line 4209
      $723 = $718 - $710 - $$0197 | 0; //@line 4210
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 4213
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1346] | 0) + $723 | 0; //@line 4218
        HEAP32[1346] = $728; //@line 4219
        HEAP32[1349] = $722; //@line 4220
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 4223
       } else {
        if ((HEAP32[1348] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1345] | 0) + $723 | 0; //@line 4229
         HEAP32[1345] = $734; //@line 4230
         HEAP32[1348] = $722; //@line 4231
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 4234
         HEAP32[$722 + $734 >> 2] = $734; //@line 4236
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 4240
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 4244
         $743 = $739 >>> 3; //@line 4245
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 4250
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 4252
           $750 = 5412 + ($743 << 1 << 2) | 0; //@line 4254
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 4260
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 4269
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1343] = HEAP32[1343] & ~(1 << $743); //@line 4279
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 4286
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 4290
             }
             $764 = $748 + 8 | 0; //@line 4293
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 4297
              break;
             }
             _abort(); //@line 4300
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 4305
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 4306
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 4309
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 4311
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 4315
             $783 = $782 + 4 | 0; //@line 4316
             $784 = HEAP32[$783 >> 2] | 0; //@line 4317
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 4320
              if (!$786) {
               $$3$i$i = 0; //@line 4323
               break;
              } else {
               $$1291$i$i = $786; //@line 4326
               $$1293$i$i = $782; //@line 4326
              }
             } else {
              $$1291$i$i = $784; //@line 4329
              $$1293$i$i = $783; //@line 4329
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 4332
              $789 = HEAP32[$788 >> 2] | 0; //@line 4333
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 4336
               $$1293$i$i = $788; //@line 4336
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 4339
              $792 = HEAP32[$791 >> 2] | 0; //@line 4340
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 4345
               $$1293$i$i = $791; //@line 4345
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 4350
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 4353
              $$3$i$i = $$1291$i$i; //@line 4354
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 4359
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 4362
             }
             $776 = $774 + 12 | 0; //@line 4365
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 4369
             }
             $779 = $771 + 8 | 0; //@line 4372
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 4376
              HEAP32[$779 >> 2] = $774; //@line 4377
              $$3$i$i = $771; //@line 4378
              break;
             } else {
              _abort(); //@line 4381
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 4391
           $798 = 5676 + ($797 << 2) | 0; //@line 4392
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 4397
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1344] = HEAP32[1344] & ~(1 << $797); //@line 4406
             break L311;
            } else {
             if ((HEAP32[1347] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 4412
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 4420
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1347] | 0; //@line 4430
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 4433
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 4437
           $815 = $718 + 16 | 0; //@line 4438
           $816 = HEAP32[$815 >> 2] | 0; //@line 4439
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 4445
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 4449
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 4451
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 4457
           if (!$822) {
            break;
           }
           if ((HEAP32[1347] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 4465
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 4469
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 4471
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 4478
         $$0287$i$i = $742 + $723 | 0; //@line 4478
        } else {
         $$0$i17$i = $718; //@line 4480
         $$0287$i$i = $723; //@line 4480
        }
        $830 = $$0$i17$i + 4 | 0; //@line 4482
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 4485
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 4488
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 4490
        $836 = $$0287$i$i >>> 3; //@line 4491
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 5412 + ($836 << 1 << 2) | 0; //@line 4495
         $840 = HEAP32[1343] | 0; //@line 4496
         $841 = 1 << $836; //@line 4497
         do {
          if (!($840 & $841)) {
           HEAP32[1343] = $840 | $841; //@line 4503
           $$0295$i$i = $839; //@line 4505
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 4505
          } else {
           $845 = $839 + 8 | 0; //@line 4507
           $846 = HEAP32[$845 >> 2] | 0; //@line 4508
           if ((HEAP32[1347] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 4512
            $$pre$phi$i19$iZ2D = $845; //@line 4512
            break;
           }
           _abort(); //@line 4515
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 4519
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 4521
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 4523
         HEAP32[$722 + 12 >> 2] = $839; //@line 4525
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 4528
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 4532
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 4536
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 4541
          $858 = $852 << $857; //@line 4542
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 4545
          $863 = $858 << $861; //@line 4547
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 4550
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 4555
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 4561
         }
        } while (0);
        $877 = 5676 + ($$0296$i$i << 2) | 0; //@line 4564
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 4566
        $879 = $722 + 16 | 0; //@line 4567
        HEAP32[$879 + 4 >> 2] = 0; //@line 4569
        HEAP32[$879 >> 2] = 0; //@line 4570
        $881 = HEAP32[1344] | 0; //@line 4571
        $882 = 1 << $$0296$i$i; //@line 4572
        if (!($881 & $882)) {
         HEAP32[1344] = $881 | $882; //@line 4577
         HEAP32[$877 >> 2] = $722; //@line 4578
         HEAP32[$722 + 24 >> 2] = $877; //@line 4580
         HEAP32[$722 + 12 >> 2] = $722; //@line 4582
         HEAP32[$722 + 8 >> 2] = $722; //@line 4584
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 4593
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 4593
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 4600
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 4604
         $902 = HEAP32[$900 >> 2] | 0; //@line 4606
         if (!$902) {
          label = 260; //@line 4609
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 4612
          $$0289$i$i = $902; //@line 4612
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1347] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 4619
         } else {
          HEAP32[$900 >> 2] = $722; //@line 4622
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 4624
          HEAP32[$722 + 12 >> 2] = $722; //@line 4626
          HEAP32[$722 + 8 >> 2] = $722; //@line 4628
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 4633
         $910 = HEAP32[$909 >> 2] | 0; //@line 4634
         $911 = HEAP32[1347] | 0; //@line 4635
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 4641
          HEAP32[$909 >> 2] = $722; //@line 4642
          HEAP32[$722 + 8 >> 2] = $910; //@line 4644
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 4646
          HEAP32[$722 + 24 >> 2] = 0; //@line 4648
          break;
         } else {
          _abort(); //@line 4651
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 4658
      STACKTOP = sp; //@line 4659
      return $$0 | 0; //@line 4659
     } else {
      $$0$i$i$i = 5820; //@line 4661
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 4665
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 4670
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 4678
    }
    $927 = $923 + -47 | 0; //@line 4680
    $929 = $927 + 8 | 0; //@line 4682
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 4688
    $936 = $636 + 16 | 0; //@line 4689
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 4691
    $939 = $938 + 8 | 0; //@line 4692
    $940 = $938 + 24 | 0; //@line 4693
    $941 = $$723947$i + -40 | 0; //@line 4694
    $943 = $$748$i + 8 | 0; //@line 4696
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 4701
    $949 = $$748$i + $948 | 0; //@line 4702
    $950 = $941 - $948 | 0; //@line 4703
    HEAP32[1349] = $949; //@line 4704
    HEAP32[1346] = $950; //@line 4705
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 4708
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 4711
    HEAP32[1350] = HEAP32[1465]; //@line 4713
    $956 = $938 + 4 | 0; //@line 4714
    HEAP32[$956 >> 2] = 27; //@line 4715
    HEAP32[$939 >> 2] = HEAP32[1455]; //@line 4716
    HEAP32[$939 + 4 >> 2] = HEAP32[1456]; //@line 4716
    HEAP32[$939 + 8 >> 2] = HEAP32[1457]; //@line 4716
    HEAP32[$939 + 12 >> 2] = HEAP32[1458]; //@line 4716
    HEAP32[1455] = $$748$i; //@line 4717
    HEAP32[1456] = $$723947$i; //@line 4718
    HEAP32[1458] = 0; //@line 4719
    HEAP32[1457] = $939; //@line 4720
    $958 = $940; //@line 4721
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 4723
     HEAP32[$958 >> 2] = 7; //@line 4724
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 4737
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 4740
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 4743
     HEAP32[$938 >> 2] = $964; //@line 4744
     $969 = $964 >>> 3; //@line 4745
     if ($964 >>> 0 < 256) {
      $972 = 5412 + ($969 << 1 << 2) | 0; //@line 4749
      $973 = HEAP32[1343] | 0; //@line 4750
      $974 = 1 << $969; //@line 4751
      if (!($973 & $974)) {
       HEAP32[1343] = $973 | $974; //@line 4756
       $$0211$i$i = $972; //@line 4758
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 4758
      } else {
       $978 = $972 + 8 | 0; //@line 4760
       $979 = HEAP32[$978 >> 2] | 0; //@line 4761
       if ((HEAP32[1347] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 4765
       } else {
        $$0211$i$i = $979; //@line 4768
        $$pre$phi$i$iZ2D = $978; //@line 4768
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 4771
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 4773
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 4775
      HEAP32[$636 + 12 >> 2] = $972; //@line 4777
      break;
     }
     $985 = $964 >>> 8; //@line 4780
     if (!$985) {
      $$0212$i$i = 0; //@line 4783
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 4787
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 4791
       $991 = $985 << $990; //@line 4792
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 4795
       $996 = $991 << $994; //@line 4797
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 4800
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 4805
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 4811
      }
     }
     $1010 = 5676 + ($$0212$i$i << 2) | 0; //@line 4814
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 4816
     HEAP32[$636 + 20 >> 2] = 0; //@line 4818
     HEAP32[$936 >> 2] = 0; //@line 4819
     $1013 = HEAP32[1344] | 0; //@line 4820
     $1014 = 1 << $$0212$i$i; //@line 4821
     if (!($1013 & $1014)) {
      HEAP32[1344] = $1013 | $1014; //@line 4826
      HEAP32[$1010 >> 2] = $636; //@line 4827
      HEAP32[$636 + 24 >> 2] = $1010; //@line 4829
      HEAP32[$636 + 12 >> 2] = $636; //@line 4831
      HEAP32[$636 + 8 >> 2] = $636; //@line 4833
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 4842
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 4842
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 4849
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 4853
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 4855
      if (!$1034) {
       label = 286; //@line 4858
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 4861
       $$0207$i$i = $1034; //@line 4861
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1347] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 4868
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 4871
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 4873
       HEAP32[$636 + 12 >> 2] = $636; //@line 4875
       HEAP32[$636 + 8 >> 2] = $636; //@line 4877
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 4882
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 4883
      $1043 = HEAP32[1347] | 0; //@line 4884
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 4890
       HEAP32[$1041 >> 2] = $636; //@line 4891
       HEAP32[$636 + 8 >> 2] = $1042; //@line 4893
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 4895
       HEAP32[$636 + 24 >> 2] = 0; //@line 4897
       break;
      } else {
       _abort(); //@line 4900
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1346] | 0; //@line 4907
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 4910
   HEAP32[1346] = $1054; //@line 4911
   $1055 = HEAP32[1349] | 0; //@line 4912
   $1056 = $1055 + $$0197 | 0; //@line 4913
   HEAP32[1349] = $1056; //@line 4914
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 4917
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 4920
   $$0 = $1055 + 8 | 0; //@line 4922
   STACKTOP = sp; //@line 4923
   return $$0 | 0; //@line 4923
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 4927
 $$0 = 0; //@line 4928
 STACKTOP = sp; //@line 4929
 return $$0 | 0; //@line 4929
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8437
 STACKTOP = STACKTOP + 560 | 0; //@line 8438
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 8438
 $6 = sp + 8 | 0; //@line 8439
 $7 = sp; //@line 8440
 $8 = sp + 524 | 0; //@line 8441
 $9 = $8; //@line 8442
 $10 = sp + 512 | 0; //@line 8443
 HEAP32[$7 >> 2] = 0; //@line 8444
 $11 = $10 + 12 | 0; //@line 8445
 ___DOUBLE_BITS_677($1) | 0; //@line 8446
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 8451
  $$0520 = 1; //@line 8451
  $$0521 = 2572; //@line 8451
 } else {
  $$0471 = $1; //@line 8462
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 8462
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 2573 : 2578 : 2575; //@line 8462
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 8464
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 8473
   $31 = $$0520 + 3 | 0; //@line 8478
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 8480
   _out_670($0, $$0521, $$0520); //@line 8481
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 2599 : 2603 : $27 ? 2591 : 2595, 3); //@line 8482
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 8484
   $$sink560 = $31; //@line 8485
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 8488
   $36 = $35 != 0.0; //@line 8489
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 8493
   }
   $39 = $5 | 32; //@line 8495
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 8498
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 8501
    $44 = $$0520 | 2; //@line 8502
    $46 = 12 - $3 | 0; //@line 8504
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 8509
     } else {
      $$0509585 = 8.0; //@line 8511
      $$1508586 = $46; //@line 8511
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 8513
       $$0509585 = $$0509585 * 16.0; //@line 8514
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 8529
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 8534
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 8539
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 8542
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 8545
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 8548
     HEAP8[$68 >> 0] = 48; //@line 8549
     $$0511 = $68; //@line 8550
    } else {
     $$0511 = $66; //@line 8552
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 8559
    $76 = $$0511 + -2 | 0; //@line 8562
    HEAP8[$76 >> 0] = $5 + 15; //@line 8563
    $77 = ($3 | 0) < 1; //@line 8564
    $79 = ($4 & 8 | 0) == 0; //@line 8566
    $$0523 = $8; //@line 8567
    $$2473 = $$1472; //@line 8567
    while (1) {
     $80 = ~~$$2473; //@line 8569
     $86 = $$0523 + 1 | 0; //@line 8575
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[2607 + $80 >> 0]; //@line 8576
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 8579
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 8588
      } else {
       HEAP8[$86 >> 0] = 46; //@line 8591
       $$1524 = $$0523 + 2 | 0; //@line 8592
      }
     } else {
      $$1524 = $86; //@line 8595
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 8599
     }
    }
    $$pre693 = $$1524; //@line 8605
    if (!$3) {
     label = 24; //@line 8607
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 8615
      $$sink = $3 + 2 | 0; //@line 8615
     } else {
      label = 24; //@line 8617
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 8621
     $$pre$phi691Z2D = $101; //@line 8622
     $$sink = $101; //@line 8622
    }
    $104 = $11 - $76 | 0; //@line 8626
    $106 = $104 + $44 + $$sink | 0; //@line 8628
    _pad_676($0, 32, $2, $106, $4); //@line 8629
    _out_670($0, $$0521$, $44); //@line 8630
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 8632
    _out_670($0, $8, $$pre$phi691Z2D); //@line 8633
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 8635
    _out_670($0, $76, $104); //@line 8636
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 8638
    $$sink560 = $106; //@line 8639
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 8643
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 8647
    HEAP32[$7 >> 2] = $113; //@line 8648
    $$3 = $35 * 268435456.0; //@line 8649
    $$pr = $113; //@line 8649
   } else {
    $$3 = $35; //@line 8652
    $$pr = HEAP32[$7 >> 2] | 0; //@line 8652
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 8656
   $$0498 = $$561; //@line 8657
   $$4 = $$3; //@line 8657
   do {
    $116 = ~~$$4 >>> 0; //@line 8659
    HEAP32[$$0498 >> 2] = $116; //@line 8660
    $$0498 = $$0498 + 4 | 0; //@line 8661
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 8664
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 8674
    $$1499662 = $$0498; //@line 8674
    $124 = $$pr; //@line 8674
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 8677
     $$0488655 = $$1499662 + -4 | 0; //@line 8678
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 8681
     } else {
      $$0488657 = $$0488655; //@line 8683
      $$0497656 = 0; //@line 8683
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 8686
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 8688
       $131 = tempRet0; //@line 8689
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 8690
       HEAP32[$$0488657 >> 2] = $132; //@line 8692
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 8693
       $$0488657 = $$0488657 + -4 | 0; //@line 8695
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 8705
      } else {
       $138 = $$1482663 + -4 | 0; //@line 8707
       HEAP32[$138 >> 2] = $$0497656; //@line 8708
       $$2483$ph = $138; //@line 8709
      }
     }
     $$2500 = $$1499662; //@line 8712
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 8718
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 8722
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 8728
     HEAP32[$7 >> 2] = $144; //@line 8729
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 8732
      $$1499662 = $$2500; //@line 8732
      $124 = $144; //@line 8732
     } else {
      $$1482$lcssa = $$2483$ph; //@line 8734
      $$1499$lcssa = $$2500; //@line 8734
      $$pr566 = $144; //@line 8734
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 8739
    $$1499$lcssa = $$0498; //@line 8739
    $$pr566 = $$pr; //@line 8739
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 8745
    $150 = ($39 | 0) == 102; //@line 8746
    $$3484650 = $$1482$lcssa; //@line 8747
    $$3501649 = $$1499$lcssa; //@line 8747
    $152 = $$pr566; //@line 8747
    while (1) {
     $151 = 0 - $152 | 0; //@line 8749
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 8751
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 8755
      $161 = 1e9 >>> $154; //@line 8756
      $$0487644 = 0; //@line 8757
      $$1489643 = $$3484650; //@line 8757
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 8759
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 8763
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 8764
       $$1489643 = $$1489643 + 4 | 0; //@line 8765
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 8776
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 8779
       $$4502 = $$3501649; //@line 8779
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 8782
       $$$3484700 = $$$3484; //@line 8783
       $$4502 = $$3501649 + 4 | 0; //@line 8783
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 8790
      $$4502 = $$3501649; //@line 8790
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 8792
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 8799
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 8801
     HEAP32[$7 >> 2] = $152; //@line 8802
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 8807
      $$3501$lcssa = $$$4502; //@line 8807
      break;
     } else {
      $$3484650 = $$$3484700; //@line 8805
      $$3501649 = $$$4502; //@line 8805
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 8812
    $$3501$lcssa = $$1499$lcssa; //@line 8812
   }
   $185 = $$561; //@line 8815
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 8820
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 8821
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 8824
    } else {
     $$0514639 = $189; //@line 8826
     $$0530638 = 10; //@line 8826
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 8828
      $193 = $$0514639 + 1 | 0; //@line 8829
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 8832
       break;
      } else {
       $$0514639 = $193; //@line 8835
      }
     }
    }
   } else {
    $$1515 = 0; //@line 8840
   }
   $198 = ($39 | 0) == 103; //@line 8845
   $199 = ($$540 | 0) != 0; //@line 8846
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 8849
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 8858
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 8861
    $213 = ($209 | 0) % 9 | 0; //@line 8862
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 8865
     $$1531632 = 10; //@line 8865
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 8868
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 8871
       $$1531632 = $215; //@line 8871
      } else {
       $$1531$lcssa = $215; //@line 8873
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 8878
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 8880
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 8881
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 8884
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 8887
     $$4518 = $$1515; //@line 8887
     $$8 = $$3484$lcssa; //@line 8887
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 8892
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 8893
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 8898
     if (!$$0520) {
      $$1467 = $$$564; //@line 8901
      $$1469 = $$543; //@line 8901
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 8904
      $$1467 = $230 ? -$$$564 : $$$564; //@line 8909
      $$1469 = $230 ? -$$543 : $$543; //@line 8909
     }
     $233 = $217 - $218 | 0; //@line 8911
     HEAP32[$212 >> 2] = $233; //@line 8912
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 8916
      HEAP32[$212 >> 2] = $236; //@line 8917
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 8920
       $$sink547625 = $212; //@line 8920
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 8922
        HEAP32[$$sink547625 >> 2] = 0; //@line 8923
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 8926
         HEAP32[$240 >> 2] = 0; //@line 8927
         $$6 = $240; //@line 8928
        } else {
         $$6 = $$5486626; //@line 8930
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 8933
        HEAP32[$238 >> 2] = $242; //@line 8934
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 8937
         $$sink547625 = $238; //@line 8937
        } else {
         $$5486$lcssa = $$6; //@line 8939
         $$sink547$lcssa = $238; //@line 8939
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 8944
       $$sink547$lcssa = $212; //@line 8944
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 8949
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 8950
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 8953
       $$4518 = $247; //@line 8953
       $$8 = $$5486$lcssa; //@line 8953
      } else {
       $$2516621 = $247; //@line 8955
       $$2532620 = 10; //@line 8955
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 8957
        $251 = $$2516621 + 1 | 0; //@line 8958
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 8961
         $$4518 = $251; //@line 8961
         $$8 = $$5486$lcssa; //@line 8961
         break;
        } else {
         $$2516621 = $251; //@line 8964
        }
       }
      }
     } else {
      $$4492 = $212; //@line 8969
      $$4518 = $$1515; //@line 8969
      $$8 = $$3484$lcssa; //@line 8969
     }
    }
    $253 = $$4492 + 4 | 0; //@line 8972
    $$5519$ph = $$4518; //@line 8975
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 8975
    $$9$ph = $$8; //@line 8975
   } else {
    $$5519$ph = $$1515; //@line 8977
    $$7505$ph = $$3501$lcssa; //@line 8977
    $$9$ph = $$3484$lcssa; //@line 8977
   }
   $$7505 = $$7505$ph; //@line 8979
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 8983
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 8986
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 8990
    } else {
     $$lcssa675 = 1; //@line 8992
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 8996
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 9001
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 9009
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 9009
     } else {
      $$0479 = $5 + -2 | 0; //@line 9013
      $$2476 = $$540$ + -1 | 0; //@line 9013
     }
     $267 = $4 & 8; //@line 9015
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 9020
       if (!$270) {
        $$2529 = 9; //@line 9023
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 9028
         $$3533616 = 10; //@line 9028
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 9030
          $275 = $$1528617 + 1 | 0; //@line 9031
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 9037
           break;
          } else {
           $$1528617 = $275; //@line 9035
          }
         }
        } else {
         $$2529 = 0; //@line 9042
        }
       }
      } else {
       $$2529 = 9; //@line 9046
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 9054
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 9056
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 9058
       $$1480 = $$0479; //@line 9061
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 9061
       $$pre$phi698Z2D = 0; //@line 9061
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 9065
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 9067
       $$1480 = $$0479; //@line 9070
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 9070
       $$pre$phi698Z2D = 0; //@line 9070
       break;
      }
     } else {
      $$1480 = $$0479; //@line 9074
      $$3477 = $$2476; //@line 9074
      $$pre$phi698Z2D = $267; //@line 9074
     }
    } else {
     $$1480 = $5; //@line 9078
     $$3477 = $$540; //@line 9078
     $$pre$phi698Z2D = $4 & 8; //@line 9078
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 9081
   $294 = ($292 | 0) != 0 & 1; //@line 9083
   $296 = ($$1480 | 32 | 0) == 102; //@line 9085
   if ($296) {
    $$2513 = 0; //@line 9089
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 9089
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 9092
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 9095
    $304 = $11; //@line 9096
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 9101
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 9103
      HEAP8[$308 >> 0] = 48; //@line 9104
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 9109
      } else {
       $$1512$lcssa = $308; //@line 9111
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 9116
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 9123
    $318 = $$1512$lcssa + -2 | 0; //@line 9125
    HEAP8[$318 >> 0] = $$1480; //@line 9126
    $$2513 = $318; //@line 9129
    $$pn = $304 - $318 | 0; //@line 9129
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 9134
   _pad_676($0, 32, $2, $323, $4); //@line 9135
   _out_670($0, $$0521, $$0520); //@line 9136
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 9138
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 9141
    $326 = $8 + 9 | 0; //@line 9142
    $327 = $326; //@line 9143
    $328 = $8 + 8 | 0; //@line 9144
    $$5493600 = $$0496$$9; //@line 9145
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 9148
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 9153
       $$1465 = $328; //@line 9154
      } else {
       $$1465 = $330; //@line 9156
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 9163
       $$0464597 = $330; //@line 9164
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 9166
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 9169
        } else {
         $$1465 = $335; //@line 9171
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 9176
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 9181
     $$5493600 = $$5493600 + 4 | 0; //@line 9182
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 2623, 1); //@line 9192
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 9198
     $$6494592 = $$5493600; //@line 9198
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 9201
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 9206
       $$0463587 = $347; //@line 9207
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 9209
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 9212
        } else {
         $$0463$lcssa = $351; //@line 9214
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 9219
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 9223
      $$6494592 = $$6494592 + 4 | 0; //@line 9224
      $356 = $$4478593 + -9 | 0; //@line 9225
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 9232
       break;
      } else {
       $$4478593 = $356; //@line 9230
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 9237
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 9240
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 9243
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 9246
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 9247
     $365 = $363; //@line 9248
     $366 = 0 - $9 | 0; //@line 9249
     $367 = $8 + 8 | 0; //@line 9250
     $$5605 = $$3477; //@line 9251
     $$7495604 = $$9$ph; //@line 9251
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 9254
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 9257
       $$0 = $367; //@line 9258
      } else {
       $$0 = $369; //@line 9260
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 9265
        _out_670($0, $$0, 1); //@line 9266
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 9270
         break;
        }
        _out_670($0, 2623, 1); //@line 9273
        $$2 = $375; //@line 9274
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 9278
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 9283
        $$1601 = $$0; //@line 9284
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 9286
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 9289
         } else {
          $$2 = $373; //@line 9291
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 9298
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 9301
      $381 = $$5605 - $378 | 0; //@line 9302
      $$7495604 = $$7495604 + 4 | 0; //@line 9303
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 9310
       break;
      } else {
       $$5605 = $381; //@line 9308
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 9315
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 9318
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 9322
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 9325
   $$sink560 = $323; //@line 9326
  }
 } while (0);
 STACKTOP = sp; //@line 9331
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 9331
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 7009
 STACKTOP = STACKTOP + 64 | 0; //@line 7010
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 7010
 $5 = sp + 16 | 0; //@line 7011
 $6 = sp; //@line 7012
 $7 = sp + 24 | 0; //@line 7013
 $8 = sp + 8 | 0; //@line 7014
 $9 = sp + 20 | 0; //@line 7015
 HEAP32[$5 >> 2] = $1; //@line 7016
 $10 = ($0 | 0) != 0; //@line 7017
 $11 = $7 + 40 | 0; //@line 7018
 $12 = $11; //@line 7019
 $13 = $7 + 39 | 0; //@line 7020
 $14 = $8 + 4 | 0; //@line 7021
 $$0243 = 0; //@line 7022
 $$0247 = 0; //@line 7022
 $$0269 = 0; //@line 7022
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 7031
     $$1248 = -1; //@line 7032
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 7036
     break;
    }
   } else {
    $$1248 = $$0247; //@line 7040
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 7043
  $21 = HEAP8[$20 >> 0] | 0; //@line 7044
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 7047
   break;
  } else {
   $23 = $21; //@line 7050
   $25 = $20; //@line 7050
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 7055
     $27 = $25; //@line 7055
     label = 9; //@line 7056
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 7061
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 7068
   HEAP32[$5 >> 2] = $24; //@line 7069
   $23 = HEAP8[$24 >> 0] | 0; //@line 7071
   $25 = $24; //@line 7071
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 7076
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 7081
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 7084
     $27 = $27 + 2 | 0; //@line 7085
     HEAP32[$5 >> 2] = $27; //@line 7086
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 7093
      break;
     } else {
      $$0249303 = $30; //@line 7090
      label = 9; //@line 7091
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 7101
  if ($10) {
   _out_670($0, $20, $36); //@line 7103
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 7107
   $$0247 = $$1248; //@line 7107
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 7115
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 7116
  if ($43) {
   $$0253 = -1; //@line 7118
   $$1270 = $$0269; //@line 7118
   $$sink = 1; //@line 7118
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 7128
    $$1270 = 1; //@line 7128
    $$sink = 3; //@line 7128
   } else {
    $$0253 = -1; //@line 7130
    $$1270 = $$0269; //@line 7130
    $$sink = 1; //@line 7130
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 7133
  HEAP32[$5 >> 2] = $51; //@line 7134
  $52 = HEAP8[$51 >> 0] | 0; //@line 7135
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 7137
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 7144
   $$lcssa291 = $52; //@line 7144
   $$lcssa292 = $51; //@line 7144
  } else {
   $$0262309 = 0; //@line 7146
   $60 = $52; //@line 7146
   $65 = $51; //@line 7146
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 7151
    $64 = $65 + 1 | 0; //@line 7152
    HEAP32[$5 >> 2] = $64; //@line 7153
    $66 = HEAP8[$64 >> 0] | 0; //@line 7154
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 7156
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 7163
     $$lcssa291 = $66; //@line 7163
     $$lcssa292 = $64; //@line 7163
     break;
    } else {
     $$0262309 = $63; //@line 7166
     $60 = $66; //@line 7166
     $65 = $64; //@line 7166
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 7178
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 7180
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 7185
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 7190
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 7202
     $$2271 = 1; //@line 7202
     $storemerge274 = $79 + 3 | 0; //@line 7202
    } else {
     label = 23; //@line 7204
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 7208
    if ($$1270 | 0) {
     $$0 = -1; //@line 7211
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7226
     $106 = HEAP32[$105 >> 2] | 0; //@line 7227
     HEAP32[$2 >> 2] = $105 + 4; //@line 7229
     $363 = $106; //@line 7230
    } else {
     $363 = 0; //@line 7232
    }
    $$0259 = $363; //@line 7236
    $$2271 = 0; //@line 7236
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 7236
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 7238
   $109 = ($$0259 | 0) < 0; //@line 7239
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 7244
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 7244
   $$3272 = $$2271; //@line 7244
   $115 = $storemerge274; //@line 7244
  } else {
   $112 = _getint_671($5) | 0; //@line 7246
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 7249
    break;
   }
   $$1260 = $112; //@line 7253
   $$1263 = $$0262$lcssa; //@line 7253
   $$3272 = $$1270; //@line 7253
   $115 = HEAP32[$5 >> 2] | 0; //@line 7253
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 7264
     $156 = _getint_671($5) | 0; //@line 7265
     $$0254 = $156; //@line 7267
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 7267
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 7276
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 7281
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 7286
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 7293
      $144 = $125 + 4 | 0; //@line 7297
      HEAP32[$5 >> 2] = $144; //@line 7298
      $$0254 = $140; //@line 7299
      $$pre345 = $144; //@line 7299
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 7305
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7320
     $152 = HEAP32[$151 >> 2] | 0; //@line 7321
     HEAP32[$2 >> 2] = $151 + 4; //@line 7323
     $364 = $152; //@line 7324
    } else {
     $364 = 0; //@line 7326
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 7329
    HEAP32[$5 >> 2] = $154; //@line 7330
    $$0254 = $364; //@line 7331
    $$pre345 = $154; //@line 7331
   } else {
    $$0254 = -1; //@line 7333
    $$pre345 = $115; //@line 7333
   }
  } while (0);
  $$0252 = 0; //@line 7336
  $158 = $$pre345; //@line 7336
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 7343
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 7346
   HEAP32[$5 >> 2] = $158; //@line 7347
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (2091 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 7352
   $168 = $167 & 255; //@line 7353
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 7357
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 7364
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 7368
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 7372
     break L1;
    } else {
     label = 50; //@line 7375
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 7380
     $176 = $3 + ($$0253 << 3) | 0; //@line 7382
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 7387
     $182 = $6; //@line 7388
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 7390
     HEAP32[$182 + 4 >> 2] = $181; //@line 7393
     label = 50; //@line 7394
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 7398
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 7401
    $187 = HEAP32[$5 >> 2] | 0; //@line 7403
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 7407
   if ($10) {
    $187 = $158; //@line 7409
   } else {
    $$0243 = 0; //@line 7411
    $$0247 = $$1248; //@line 7411
    $$0269 = $$3272; //@line 7411
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 7417
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 7423
  $196 = $$1263 & -65537; //@line 7426
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 7427
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7435
       $$0243 = 0; //@line 7436
       $$0247 = $$1248; //@line 7436
       $$0269 = $$3272; //@line 7436
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7442
       $$0243 = 0; //@line 7443
       $$0247 = $$1248; //@line 7443
       $$0269 = $$3272; //@line 7443
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 7451
       HEAP32[$208 >> 2] = $$1248; //@line 7453
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 7456
       $$0243 = 0; //@line 7457
       $$0247 = $$1248; //@line 7457
       $$0269 = $$3272; //@line 7457
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 7464
       $$0243 = 0; //@line 7465
       $$0247 = $$1248; //@line 7465
       $$0269 = $$3272; //@line 7465
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 7472
       $$0243 = 0; //@line 7473
       $$0247 = $$1248; //@line 7473
       $$0269 = $$3272; //@line 7473
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7479
       $$0243 = 0; //@line 7480
       $$0247 = $$1248; //@line 7480
       $$0269 = $$3272; //@line 7480
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 7488
       HEAP32[$220 >> 2] = $$1248; //@line 7490
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 7493
       $$0243 = 0; //@line 7494
       $$0247 = $$1248; //@line 7494
       $$0269 = $$3272; //@line 7494
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 7499
       $$0247 = $$1248; //@line 7499
       $$0269 = $$3272; //@line 7499
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 7509
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 7509
     $$3265 = $$1263$ | 8; //@line 7509
     label = 62; //@line 7510
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 7514
     $$1255 = $$0254; //@line 7514
     $$3265 = $$1263$; //@line 7514
     label = 62; //@line 7515
     break;
    }
   case 111:
    {
     $242 = $6; //@line 7519
     $244 = HEAP32[$242 >> 2] | 0; //@line 7521
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 7524
     $248 = _fmt_o($244, $247, $11) | 0; //@line 7525
     $252 = $12 - $248 | 0; //@line 7529
     $$0228 = $248; //@line 7534
     $$1233 = 0; //@line 7534
     $$1238 = 2555; //@line 7534
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 7534
     $$4266 = $$1263$; //@line 7534
     $281 = $244; //@line 7534
     $283 = $247; //@line 7534
     label = 68; //@line 7535
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 7539
     $258 = HEAP32[$256 >> 2] | 0; //@line 7541
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 7544
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 7547
      $264 = tempRet0; //@line 7548
      $265 = $6; //@line 7549
      HEAP32[$265 >> 2] = $263; //@line 7551
      HEAP32[$265 + 4 >> 2] = $264; //@line 7554
      $$0232 = 1; //@line 7555
      $$0237 = 2555; //@line 7555
      $275 = $263; //@line 7555
      $276 = $264; //@line 7555
      label = 67; //@line 7556
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 7568
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 2555 : 2557 : 2556; //@line 7568
      $275 = $258; //@line 7568
      $276 = $261; //@line 7568
      label = 67; //@line 7569
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 7575
     $$0232 = 0; //@line 7581
     $$0237 = 2555; //@line 7581
     $275 = HEAP32[$197 >> 2] | 0; //@line 7581
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 7581
     label = 67; //@line 7582
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 7593
     $$2 = $13; //@line 7594
     $$2234 = 0; //@line 7594
     $$2239 = 2555; //@line 7594
     $$2251 = $11; //@line 7594
     $$5 = 1; //@line 7594
     $$6268 = $196; //@line 7594
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 7601
     label = 72; //@line 7602
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 7606
     $$1 = $302 | 0 ? $302 : 2565; //@line 7609
     label = 72; //@line 7610
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 7620
     HEAP32[$14 >> 2] = 0; //@line 7621
     HEAP32[$6 >> 2] = $8; //@line 7622
     $$4258354 = -1; //@line 7623
     $365 = $8; //@line 7623
     label = 76; //@line 7624
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 7628
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 7631
      $$0240$lcssa356 = 0; //@line 7632
      label = 85; //@line 7633
     } else {
      $$4258354 = $$0254; //@line 7635
      $365 = $$pre348; //@line 7635
      label = 76; //@line 7636
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 7643
     $$0247 = $$1248; //@line 7643
     $$0269 = $$3272; //@line 7643
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 7648
     $$2234 = 0; //@line 7648
     $$2239 = 2555; //@line 7648
     $$2251 = $11; //@line 7648
     $$5 = $$0254; //@line 7648
     $$6268 = $$1263$; //@line 7648
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 7654
    $227 = $6; //@line 7655
    $229 = HEAP32[$227 >> 2] | 0; //@line 7657
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 7660
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 7662
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 7668
    $$0228 = $234; //@line 7673
    $$1233 = $or$cond278 ? 0 : 2; //@line 7673
    $$1238 = $or$cond278 ? 2555 : 2555 + ($$1236 >> 4) | 0; //@line 7673
    $$2256 = $$1255; //@line 7673
    $$4266 = $$3265; //@line 7673
    $281 = $229; //@line 7673
    $283 = $232; //@line 7673
    label = 68; //@line 7674
   } else if ((label | 0) == 67) {
    label = 0; //@line 7677
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 7679
    $$1233 = $$0232; //@line 7679
    $$1238 = $$0237; //@line 7679
    $$2256 = $$0254; //@line 7679
    $$4266 = $$1263$; //@line 7679
    $281 = $275; //@line 7679
    $283 = $276; //@line 7679
    label = 68; //@line 7680
   } else if ((label | 0) == 72) {
    label = 0; //@line 7683
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 7684
    $306 = ($305 | 0) == 0; //@line 7685
    $$2 = $$1; //@line 7692
    $$2234 = 0; //@line 7692
    $$2239 = 2555; //@line 7692
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 7692
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 7692
    $$6268 = $196; //@line 7692
   } else if ((label | 0) == 76) {
    label = 0; //@line 7695
    $$0229316 = $365; //@line 7696
    $$0240315 = 0; //@line 7696
    $$1244314 = 0; //@line 7696
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 7698
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 7701
      $$2245 = $$1244314; //@line 7701
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 7704
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 7710
      $$2245 = $320; //@line 7710
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 7714
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 7717
      $$0240315 = $325; //@line 7717
      $$1244314 = $320; //@line 7717
     } else {
      $$0240$lcssa = $325; //@line 7719
      $$2245 = $320; //@line 7719
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 7725
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 7728
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 7731
     label = 85; //@line 7732
    } else {
     $$1230327 = $365; //@line 7734
     $$1241326 = 0; //@line 7734
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 7736
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7739
       label = 85; //@line 7740
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 7743
      $$1241326 = $331 + $$1241326 | 0; //@line 7744
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7747
       label = 85; //@line 7748
       break L97;
      }
      _out_670($0, $9, $331); //@line 7752
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7757
       label = 85; //@line 7758
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 7755
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 7766
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 7772
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 7774
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 7779
   $$2 = $or$cond ? $$0228 : $11; //@line 7784
   $$2234 = $$1233; //@line 7784
   $$2239 = $$1238; //@line 7784
   $$2251 = $11; //@line 7784
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 7784
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 7784
  } else if ((label | 0) == 85) {
   label = 0; //@line 7787
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 7789
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 7792
   $$0247 = $$1248; //@line 7792
   $$0269 = $$3272; //@line 7792
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 7797
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 7799
  $345 = $$$5 + $$2234 | 0; //@line 7800
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 7802
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 7803
  _out_670($0, $$2239, $$2234); //@line 7804
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 7806
  _pad_676($0, 48, $$$5, $343, 0); //@line 7807
  _out_670($0, $$2, $343); //@line 7808
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 7810
  $$0243 = $$2261; //@line 7811
  $$0247 = $$1248; //@line 7811
  $$0269 = $$3272; //@line 7811
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 7819
    } else {
     $$2242302 = 1; //@line 7821
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 7824
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 7827
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 7831
      $356 = $$2242302 + 1 | 0; //@line 7832
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 7835
      } else {
       $$2242$lcssa = $356; //@line 7837
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 7843
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 7849
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 7855
       } else {
        $$0 = 1; //@line 7857
        break;
       }
      }
     } else {
      $$0 = 1; //@line 7862
     }
    }
   } else {
    $$0 = $$1248; //@line 7866
   }
  }
 } while (0);
 STACKTOP = sp; //@line 7870
 return $$0 | 0; //@line 7870
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 4956
 $3 = HEAP32[1347] | 0; //@line 4957
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 4960
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 4964
 $7 = $6 & 3; //@line 4965
 if (($7 | 0) == 1) {
  _abort(); //@line 4968
 }
 $9 = $6 & -8; //@line 4971
 $10 = $2 + $9 | 0; //@line 4972
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 4977
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 4983
   $17 = $13 + $9 | 0; //@line 4984
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 4987
   }
   if ((HEAP32[1348] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 4993
    $106 = HEAP32[$105 >> 2] | 0; //@line 4994
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 4998
     $$1382 = $17; //@line 4998
     $114 = $16; //@line 4998
     break;
    }
    HEAP32[1345] = $17; //@line 5001
    HEAP32[$105 >> 2] = $106 & -2; //@line 5003
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 5006
    HEAP32[$16 + $17 >> 2] = $17; //@line 5008
    return;
   }
   $21 = $13 >>> 3; //@line 5011
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 5015
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 5017
    $28 = 5412 + ($21 << 1 << 2) | 0; //@line 5019
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 5024
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 5031
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1343] = HEAP32[1343] & ~(1 << $21); //@line 5041
     $$1 = $16; //@line 5042
     $$1382 = $17; //@line 5042
     $114 = $16; //@line 5042
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 5048
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 5052
     }
     $41 = $26 + 8 | 0; //@line 5055
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 5059
     } else {
      _abort(); //@line 5061
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 5066
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 5067
    $$1 = $16; //@line 5068
    $$1382 = $17; //@line 5068
    $114 = $16; //@line 5068
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 5072
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 5074
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 5078
     $60 = $59 + 4 | 0; //@line 5079
     $61 = HEAP32[$60 >> 2] | 0; //@line 5080
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 5083
      if (!$63) {
       $$3 = 0; //@line 5086
       break;
      } else {
       $$1387 = $63; //@line 5089
       $$1390 = $59; //@line 5089
      }
     } else {
      $$1387 = $61; //@line 5092
      $$1390 = $60; //@line 5092
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 5095
      $66 = HEAP32[$65 >> 2] | 0; //@line 5096
      if ($66 | 0) {
       $$1387 = $66; //@line 5099
       $$1390 = $65; //@line 5099
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 5102
      $69 = HEAP32[$68 >> 2] | 0; //@line 5103
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 5108
       $$1390 = $68; //@line 5108
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 5113
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 5116
      $$3 = $$1387; //@line 5117
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 5122
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 5125
     }
     $53 = $51 + 12 | 0; //@line 5128
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 5132
     }
     $56 = $48 + 8 | 0; //@line 5135
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 5139
      HEAP32[$56 >> 2] = $51; //@line 5140
      $$3 = $48; //@line 5141
      break;
     } else {
      _abort(); //@line 5144
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 5151
    $$1382 = $17; //@line 5151
    $114 = $16; //@line 5151
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 5154
    $75 = 5676 + ($74 << 2) | 0; //@line 5155
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 5160
      if (!$$3) {
       HEAP32[1344] = HEAP32[1344] & ~(1 << $74); //@line 5167
       $$1 = $16; //@line 5168
       $$1382 = $17; //@line 5168
       $114 = $16; //@line 5168
       break L10;
      }
     } else {
      if ((HEAP32[1347] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 5175
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 5183
       if (!$$3) {
        $$1 = $16; //@line 5186
        $$1382 = $17; //@line 5186
        $114 = $16; //@line 5186
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1347] | 0; //@line 5194
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 5197
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 5201
    $92 = $16 + 16 | 0; //@line 5202
    $93 = HEAP32[$92 >> 2] | 0; //@line 5203
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 5209
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 5213
       HEAP32[$93 + 24 >> 2] = $$3; //@line 5215
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 5221
    if (!$99) {
     $$1 = $16; //@line 5224
     $$1382 = $17; //@line 5224
     $114 = $16; //@line 5224
    } else {
     if ((HEAP32[1347] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 5229
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 5233
      HEAP32[$99 + 24 >> 2] = $$3; //@line 5235
      $$1 = $16; //@line 5236
      $$1382 = $17; //@line 5236
      $114 = $16; //@line 5236
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 5242
   $$1382 = $9; //@line 5242
   $114 = $2; //@line 5242
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 5247
 }
 $115 = $10 + 4 | 0; //@line 5250
 $116 = HEAP32[$115 >> 2] | 0; //@line 5251
 if (!($116 & 1)) {
  _abort(); //@line 5255
 }
 if (!($116 & 2)) {
  if ((HEAP32[1349] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1346] | 0) + $$1382 | 0; //@line 5265
   HEAP32[1346] = $124; //@line 5266
   HEAP32[1349] = $$1; //@line 5267
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 5270
   if (($$1 | 0) != (HEAP32[1348] | 0)) {
    return;
   }
   HEAP32[1348] = 0; //@line 5276
   HEAP32[1345] = 0; //@line 5277
   return;
  }
  if ((HEAP32[1348] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1345] | 0) + $$1382 | 0; //@line 5284
   HEAP32[1345] = $132; //@line 5285
   HEAP32[1348] = $114; //@line 5286
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 5289
   HEAP32[$114 + $132 >> 2] = $132; //@line 5291
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 5295
  $138 = $116 >>> 3; //@line 5296
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 5301
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 5303
    $145 = 5412 + ($138 << 1 << 2) | 0; //@line 5305
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1347] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 5311
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 5318
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1343] = HEAP32[1343] & ~(1 << $138); //@line 5328
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 5334
    } else {
     if ((HEAP32[1347] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 5339
     }
     $160 = $143 + 8 | 0; //@line 5342
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 5346
     } else {
      _abort(); //@line 5348
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 5353
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 5354
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 5357
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 5359
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 5363
      $180 = $179 + 4 | 0; //@line 5364
      $181 = HEAP32[$180 >> 2] | 0; //@line 5365
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 5368
       if (!$183) {
        $$3400 = 0; //@line 5371
        break;
       } else {
        $$1398 = $183; //@line 5374
        $$1402 = $179; //@line 5374
       }
      } else {
       $$1398 = $181; //@line 5377
       $$1402 = $180; //@line 5377
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 5380
       $186 = HEAP32[$185 >> 2] | 0; //@line 5381
       if ($186 | 0) {
        $$1398 = $186; //@line 5384
        $$1402 = $185; //@line 5384
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 5387
       $189 = HEAP32[$188 >> 2] | 0; //@line 5388
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 5393
        $$1402 = $188; //@line 5393
       }
      }
      if ((HEAP32[1347] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 5399
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 5402
       $$3400 = $$1398; //@line 5403
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 5408
      if ((HEAP32[1347] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 5412
      }
      $173 = $170 + 12 | 0; //@line 5415
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 5419
      }
      $176 = $167 + 8 | 0; //@line 5422
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 5426
       HEAP32[$176 >> 2] = $170; //@line 5427
       $$3400 = $167; //@line 5428
       break;
      } else {
       _abort(); //@line 5431
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 5439
     $196 = 5676 + ($195 << 2) | 0; //@line 5440
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 5445
       if (!$$3400) {
        HEAP32[1344] = HEAP32[1344] & ~(1 << $195); //@line 5452
        break L108;
       }
      } else {
       if ((HEAP32[1347] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 5459
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 5467
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1347] | 0; //@line 5477
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 5480
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 5484
     $213 = $10 + 16 | 0; //@line 5485
     $214 = HEAP32[$213 >> 2] | 0; //@line 5486
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 5492
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 5496
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 5498
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 5504
     if ($220 | 0) {
      if ((HEAP32[1347] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 5510
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 5514
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 5516
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 5525
  HEAP32[$114 + $137 >> 2] = $137; //@line 5527
  if (($$1 | 0) == (HEAP32[1348] | 0)) {
   HEAP32[1345] = $137; //@line 5531
   return;
  } else {
   $$2 = $137; //@line 5534
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 5538
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 5541
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 5543
  $$2 = $$1382; //@line 5544
 }
 $235 = $$2 >>> 3; //@line 5546
 if ($$2 >>> 0 < 256) {
  $238 = 5412 + ($235 << 1 << 2) | 0; //@line 5550
  $239 = HEAP32[1343] | 0; //@line 5551
  $240 = 1 << $235; //@line 5552
  if (!($239 & $240)) {
   HEAP32[1343] = $239 | $240; //@line 5557
   $$0403 = $238; //@line 5559
   $$pre$phiZ2D = $238 + 8 | 0; //@line 5559
  } else {
   $244 = $238 + 8 | 0; //@line 5561
   $245 = HEAP32[$244 >> 2] | 0; //@line 5562
   if ((HEAP32[1347] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 5566
   } else {
    $$0403 = $245; //@line 5569
    $$pre$phiZ2D = $244; //@line 5569
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 5572
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 5574
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 5576
  HEAP32[$$1 + 12 >> 2] = $238; //@line 5578
  return;
 }
 $251 = $$2 >>> 8; //@line 5581
 if (!$251) {
  $$0396 = 0; //@line 5584
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 5588
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 5592
   $257 = $251 << $256; //@line 5593
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 5596
   $262 = $257 << $260; //@line 5598
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 5601
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 5606
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 5612
  }
 }
 $276 = 5676 + ($$0396 << 2) | 0; //@line 5615
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 5617
 HEAP32[$$1 + 20 >> 2] = 0; //@line 5620
 HEAP32[$$1 + 16 >> 2] = 0; //@line 5621
 $280 = HEAP32[1344] | 0; //@line 5622
 $281 = 1 << $$0396; //@line 5623
 do {
  if (!($280 & $281)) {
   HEAP32[1344] = $280 | $281; //@line 5629
   HEAP32[$276 >> 2] = $$1; //@line 5630
   HEAP32[$$1 + 24 >> 2] = $276; //@line 5632
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 5634
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 5636
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 5644
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 5644
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 5651
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 5655
    $301 = HEAP32[$299 >> 2] | 0; //@line 5657
    if (!$301) {
     label = 121; //@line 5660
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 5663
     $$0384 = $301; //@line 5663
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1347] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 5670
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 5673
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 5675
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 5677
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 5679
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 5684
    $309 = HEAP32[$308 >> 2] | 0; //@line 5685
    $310 = HEAP32[1347] | 0; //@line 5686
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 5692
     HEAP32[$308 >> 2] = $$1; //@line 5693
     HEAP32[$$1 + 8 >> 2] = $309; //@line 5695
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 5697
     HEAP32[$$1 + 24 >> 2] = 0; //@line 5699
     break;
    } else {
     _abort(); //@line 5702
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1351] | 0) + -1 | 0; //@line 5709
 HEAP32[1351] = $319; //@line 5710
 if (!$319) {
  $$0212$in$i = 5828; //@line 5713
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 5718
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 5724
  }
 }
 HEAP32[1351] = -1; //@line 5727
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10899
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10905
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 10914
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 10919
      $19 = $1 + 44 | 0; //@line 10920
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 10929
      $26 = $1 + 52 | 0; //@line 10930
      $27 = $1 + 53 | 0; //@line 10931
      $28 = $1 + 54 | 0; //@line 10932
      $29 = $0 + 8 | 0; //@line 10933
      $30 = $1 + 24 | 0; //@line 10934
      $$081$off0 = 0; //@line 10935
      $$084 = $0 + 16 | 0; //@line 10935
      $$085$off0 = 0; //@line 10935
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 10939
        label = 20; //@line 10940
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 10943
       HEAP8[$27 >> 0] = 0; //@line 10944
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 10945
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 10946
       if (___async) {
        label = 12; //@line 10949
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 10952
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 10956
        label = 20; //@line 10957
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 10964
         $$186$off0 = $$085$off0; //@line 10964
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 10973
           label = 20; //@line 10974
           break L10;
          } else {
           $$182$off0 = 1; //@line 10977
           $$186$off0 = $$085$off0; //@line 10977
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 10984
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 10991
          break L10;
         } else {
          $$182$off0 = 1; //@line 10994
          $$186$off0 = 1; //@line 10994
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 10999
       $$084 = $$084 + 8 | 0; //@line 10999
       $$085$off0 = $$186$off0; //@line 10999
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 130; //@line 11002
       HEAP32[$AsyncCtx15 + 4 >> 2] = $28; //@line 11004
       HEAP32[$AsyncCtx15 + 8 >> 2] = $30; //@line 11006
       HEAP32[$AsyncCtx15 + 12 >> 2] = $2; //@line 11008
       HEAP32[$AsyncCtx15 + 16 >> 2] = $13; //@line 11010
       HEAP32[$AsyncCtx15 + 20 >> 2] = $1; //@line 11012
       HEAP8[$AsyncCtx15 + 24 >> 0] = $$081$off0 & 1; //@line 11015
       HEAP8[$AsyncCtx15 + 25 >> 0] = $$085$off0 & 1; //@line 11018
       HEAP32[$AsyncCtx15 + 28 >> 2] = $$084; //@line 11020
       HEAP32[$AsyncCtx15 + 32 >> 2] = $29; //@line 11022
       HEAP32[$AsyncCtx15 + 36 >> 2] = $19; //@line 11024
       HEAP32[$AsyncCtx15 + 40 >> 2] = $27; //@line 11026
       HEAP32[$AsyncCtx15 + 44 >> 2] = $26; //@line 11028
       HEAP32[$AsyncCtx15 + 48 >> 2] = $25; //@line 11030
       HEAP8[$AsyncCtx15 + 52 >> 0] = $4 & 1; //@line 11033
       sp = STACKTOP; //@line 11034
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 11040
         $61 = $1 + 40 | 0; //@line 11041
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 11044
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 11052
           if ($$283$off0) {
            label = 25; //@line 11054
            break;
           } else {
            $69 = 4; //@line 11057
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 11064
        } else {
         $69 = 4; //@line 11066
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 11071
      }
      HEAP32[$19 >> 2] = $69; //@line 11073
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 11082
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 11087
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 11088
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 11089
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 11090
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 131; //@line 11093
    HEAP32[$AsyncCtx11 + 4 >> 2] = $73; //@line 11095
    HEAP32[$AsyncCtx11 + 8 >> 2] = $1; //@line 11097
    HEAP32[$AsyncCtx11 + 12 >> 2] = $2; //@line 11099
    HEAP32[$AsyncCtx11 + 16 >> 2] = $3; //@line 11101
    HEAP8[$AsyncCtx11 + 20 >> 0] = $4 & 1; //@line 11104
    HEAP32[$AsyncCtx11 + 24 >> 2] = $0; //@line 11106
    HEAP32[$AsyncCtx11 + 28 >> 2] = $72; //@line 11108
    sp = STACKTOP; //@line 11109
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 11112
   $81 = $0 + 24 | 0; //@line 11113
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 11117
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 11121
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 11128
       $$2 = $81; //@line 11129
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 11141
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 11142
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 11147
        $136 = $$2 + 8 | 0; //@line 11148
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 11151
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 134; //@line 11156
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 11158
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 11160
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 11162
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 11164
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 11166
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 11168
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 11170
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 11173
       sp = STACKTOP; //@line 11174
       return;
      }
      $104 = $1 + 24 | 0; //@line 11177
      $105 = $1 + 54 | 0; //@line 11178
      $$1 = $81; //@line 11179
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 11195
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 11196
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11201
       $122 = $$1 + 8 | 0; //@line 11202
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 11205
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 133; //@line 11210
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 11212
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 11214
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 11216
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 11218
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 11220
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 11222
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 11224
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 11226
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 11229
      sp = STACKTOP; //@line 11230
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 11234
    $$0 = $81; //@line 11235
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 11242
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 11243
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 11248
     $100 = $$0 + 8 | 0; //@line 11249
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 11252
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 132; //@line 11257
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 11259
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 11261
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 11263
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 11265
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 11267
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 11269
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 11272
    sp = STACKTOP; //@line 11273
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
 $n_sroa_0_0_extract_trunc = $a$0; //@line 1874
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 1875
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 1876
 $d_sroa_0_0_extract_trunc = $b$0; //@line 1877
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 1878
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 1879
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 1881
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 1884
    HEAP32[$rem + 4 >> 2] = 0; //@line 1885
   }
   $_0$1 = 0; //@line 1887
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 1888
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1889
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 1892
    $_0$0 = 0; //@line 1893
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1894
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 1896
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 1897
   $_0$1 = 0; //@line 1898
   $_0$0 = 0; //@line 1899
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1900
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 1903
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 1908
     HEAP32[$rem + 4 >> 2] = 0; //@line 1909
    }
    $_0$1 = 0; //@line 1911
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 1912
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1913
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 1917
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 1918
    }
    $_0$1 = 0; //@line 1920
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 1921
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1922
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 1924
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 1927
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 1928
    }
    $_0$1 = 0; //@line 1930
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 1931
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1932
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 1935
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 1937
    $58 = 31 - $51 | 0; //@line 1938
    $sr_1_ph = $57; //@line 1939
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 1940
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 1941
    $q_sroa_0_1_ph = 0; //@line 1942
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 1943
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 1947
    $_0$0 = 0; //@line 1948
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1949
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 1951
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 1952
   $_0$1 = 0; //@line 1953
   $_0$0 = 0; //@line 1954
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1955
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 1959
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 1961
     $126 = 31 - $119 | 0; //@line 1962
     $130 = $119 - 31 >> 31; //@line 1963
     $sr_1_ph = $125; //@line 1964
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 1965
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 1966
     $q_sroa_0_1_ph = 0; //@line 1967
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 1968
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 1972
     $_0$0 = 0; //@line 1973
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1974
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 1976
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 1977
    $_0$1 = 0; //@line 1978
    $_0$0 = 0; //@line 1979
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1980
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 1982
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 1985
    $89 = 64 - $88 | 0; //@line 1986
    $91 = 32 - $88 | 0; //@line 1987
    $92 = $91 >> 31; //@line 1988
    $95 = $88 - 32 | 0; //@line 1989
    $105 = $95 >> 31; //@line 1990
    $sr_1_ph = $88; //@line 1991
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 1992
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 1993
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 1994
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 1995
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 1999
    HEAP32[$rem + 4 >> 2] = 0; //@line 2000
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 2003
    $_0$0 = $a$0 | 0 | 0; //@line 2004
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 2005
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 2007
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 2008
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 2009
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 2010
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 2015
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 2016
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 2017
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 2018
  $carry_0_lcssa$1 = 0; //@line 2019
  $carry_0_lcssa$0 = 0; //@line 2020
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 2022
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 2023
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 2024
  $137$1 = tempRet0; //@line 2025
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 2026
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 2027
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 2028
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 2029
  $sr_1202 = $sr_1_ph; //@line 2030
  $carry_0203 = 0; //@line 2031
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 2033
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 2034
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 2035
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 2036
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 2037
   $150$1 = tempRet0; //@line 2038
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 2039
   $carry_0203 = $151$0 & 1; //@line 2040
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 2042
   $r_sroa_1_1200 = tempRet0; //@line 2043
   $sr_1202 = $sr_1202 - 1 | 0; //@line 2044
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 2056
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 2057
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 2058
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 2059
  $carry_0_lcssa$1 = 0; //@line 2060
  $carry_0_lcssa$0 = $carry_0203; //@line 2061
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 2063
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 2064
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 2067
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 2068
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 2070
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 2071
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 2072
}
function _schedule_interrupt($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $1 = 0, $10 = 0, $104 = 0, $107 = 0, $109 = 0, $11 = 0, $112 = 0, $113 = 0, $115 = 0, $118 = 0, $126 = 0, $127 = 0, $128 = 0, $130 = 0, $132 = 0, $137 = 0, $14 = 0, $144 = 0, $146 = 0, $148 = 0, $151 = 0, $153 = 0, $160 = 0, $161 = 0, $164 = 0, $166 = 0, $168 = 0, $174 = 0, $175 = 0, $179 = 0, $187 = 0, $19 = 0, $195 = 0, $198 = 0, $2 = 0, $21 = 0, $22 = 0, $24 = 0, $25 = 0, $28 = 0, $29 = 0, $35 = 0, $36 = 0, $37 = 0, $46 = 0, $47 = 0, $48 = 0, $5 = 0, $50 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $6 = 0, $60 = 0, $62 = 0, $63 = 0, $69 = 0, $70 = 0, $71 = 0, $80 = 0, $81 = 0, $82 = 0, $84 = 0, $88 = 0, $89 = 0, $95 = 0, $96 = 0, $97 = 0, $99 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx14 = 0, $AsyncCtx18 = 0, $AsyncCtx22 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1008
 $1 = $0 + 4 | 0; //@line 1009
 $2 = HEAP32[$1 >> 2] | 0; //@line 1010
 $5 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 1013
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1014
 $6 = FUNCTION_TABLE_i[$5 & 3]() | 0; //@line 1015
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 49; //@line 1018
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 1020
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 1022
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 1024
  sp = STACKTOP; //@line 1025
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1028
 $10 = HEAP32[$1 >> 2] | 0; //@line 1029
 $11 = $10 + 32 | 0; //@line 1030
 if (($6 | 0) != (HEAP32[$11 >> 2] | 0)) {
  $14 = $2 + 32 | 0; //@line 1034
  $19 = $6 - (HEAP32[$14 >> 2] | 0) & HEAP32[$2 + 12 >> 2]; //@line 1039
  HEAP32[$14 >> 2] = $6; //@line 1040
  $21 = HEAP32[$2 + 8 >> 2] | 0; //@line 1042
  L6 : do {
   if (($21 | 0) < 1e6) {
    switch ($21 | 0) {
    case 32768:
     {
      break;
     }
    default:
     {
      label = 7; //@line 1051
      break L6;
     }
    }
    $22 = ___muldi3($19 | 0, 0, 1e6, 0) | 0; //@line 1055
    $24 = _bitshift64Lshr($22 | 0, tempRet0 | 0, 15) | 0; //@line 1057
    $25 = tempRet0; //@line 1058
    $28 = $2 + 40 | 0; //@line 1061
    $29 = $28; //@line 1062
    $35 = _i64Add(HEAP32[$29 >> 2] | 0, HEAP32[$29 + 4 >> 2] | 0, $19 * 1e6 & 32704 | 0, 0) | 0; //@line 1068
    $36 = tempRet0; //@line 1069
    $37 = $28; //@line 1070
    HEAP32[$37 >> 2] = $35; //@line 1072
    HEAP32[$37 + 4 >> 2] = $36; //@line 1075
    if ($36 >>> 0 < 0 | ($36 | 0) == 0 & $35 >>> 0 < 32768) {
     $95 = $24; //@line 1082
     $96 = $25; //@line 1082
    } else {
     $46 = _i64Add($24 | 0, $25 | 0, 1, 0) | 0; //@line 1084
     $47 = tempRet0; //@line 1085
     $48 = _i64Add($35 | 0, $36 | 0, -32768, -1) | 0; //@line 1086
     $50 = $28; //@line 1088
     HEAP32[$50 >> 2] = $48; //@line 1090
     HEAP32[$50 + 4 >> 2] = tempRet0; //@line 1093
     $95 = $46; //@line 1094
     $96 = $47; //@line 1094
    }
   } else {
    switch ($21 | 0) {
    case 1e6:
     {
      $95 = $19; //@line 1099
      $96 = 0; //@line 1099
      break;
     }
    default:
     {
      label = 7; //@line 1103
     }
    }
   }
  } while (0);
  if ((label | 0) == 7) {
   $54 = ___muldi3($19 | 0, 0, 1e6, 0) | 0; //@line 1109
   $55 = tempRet0; //@line 1110
   $56 = ___udivdi3($54 | 0, $55 | 0, $21 | 0, 0) | 0; //@line 1111
   $57 = tempRet0; //@line 1112
   $58 = ___muldi3($56 | 0, $57 | 0, $21 | 0, 0) | 0; //@line 1113
   $60 = _i64Subtract($54 | 0, $55 | 0, $58 | 0, tempRet0 | 0) | 0; //@line 1115
   $62 = $2 + 40 | 0; //@line 1117
   $63 = $62; //@line 1118
   $69 = _i64Add($60 | 0, tempRet0 | 0, HEAP32[$63 >> 2] | 0, HEAP32[$63 + 4 >> 2] | 0) | 0; //@line 1124
   $70 = tempRet0; //@line 1125
   $71 = $62; //@line 1126
   HEAP32[$71 >> 2] = $69; //@line 1128
   HEAP32[$71 + 4 >> 2] = $70; //@line 1131
   if ($70 >>> 0 < 0 | ($70 | 0) == 0 & $69 >>> 0 < $21 >>> 0) {
    $95 = $56; //@line 1138
    $96 = $57; //@line 1138
   } else {
    $80 = _i64Add($56 | 0, $57 | 0, 1, 0) | 0; //@line 1140
    $81 = tempRet0; //@line 1141
    $82 = _i64Subtract($69 | 0, $70 | 0, $21 | 0, 0) | 0; //@line 1142
    $84 = $62; //@line 1144
    HEAP32[$84 >> 2] = $82; //@line 1146
    HEAP32[$84 + 4 >> 2] = tempRet0; //@line 1149
    $95 = $80; //@line 1150
    $96 = $81; //@line 1150
   }
  }
  $88 = $2 + 48 | 0; //@line 1153
  $89 = $88; //@line 1154
  $97 = _i64Add(HEAP32[$89 >> 2] | 0, HEAP32[$89 + 4 >> 2] | 0, $95 | 0, $96 | 0) | 0; //@line 1160
  $99 = $88; //@line 1162
  HEAP32[$99 >> 2] = $97; //@line 1164
  HEAP32[$99 + 4 >> 2] = tempRet0; //@line 1167
 }
 $104 = HEAP32[$10 + 4 >> 2] | 0; //@line 1170
 if (!$104) {
  $195 = (HEAP32[$2 + 16 >> 2] | 0) + (HEAP32[$2 + 32 >> 2] | 0) & HEAP32[$2 + 12 >> 2]; //@line 1180
  $198 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 1183
  $AsyncCtx22 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1184
  FUNCTION_TABLE_vi[$198 & 255]($195); //@line 1185
  if (___async) {
   HEAP32[$AsyncCtx22 >> 2] = 55; //@line 1188
   sp = STACKTOP; //@line 1189
   return;
  } else {
   _emscripten_free_async_context($AsyncCtx22 | 0); //@line 1192
   return;
  }
 }
 $107 = $10 + 48 | 0; //@line 1197
 $109 = HEAP32[$107 >> 2] | 0; //@line 1199
 $112 = HEAP32[$107 + 4 >> 2] | 0; //@line 1202
 $113 = $104; //@line 1203
 $115 = HEAP32[$113 >> 2] | 0; //@line 1205
 $118 = HEAP32[$113 + 4 >> 2] | 0; //@line 1208
 if (!($118 >>> 0 > $112 >>> 0 | ($118 | 0) == ($112 | 0) & $115 >>> 0 > $109 >>> 0)) {
  $126 = HEAP32[(HEAP32[$0 >> 2] | 0) + 20 >> 2] | 0; //@line 1217
  $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1218
  FUNCTION_TABLE_v[$126 & 15](); //@line 1219
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 50; //@line 1222
   sp = STACKTOP; //@line 1223
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1226
  return;
 }
 $127 = _i64Subtract($115 | 0, $118 | 0, $109 | 0, $112 | 0) | 0; //@line 1229
 $128 = tempRet0; //@line 1230
 $130 = HEAP32[$10 + 16 >> 2] | 0; //@line 1232
 $132 = $10 + 24 | 0; //@line 1234
 $137 = HEAP32[$132 + 4 >> 2] | 0; //@line 1239
 L29 : do {
  if ($128 >>> 0 > $137 >>> 0 | (($128 | 0) == ($137 | 0) ? $127 >>> 0 > (HEAP32[$132 >> 2] | 0) >>> 0 : 0)) {
   $$0$i = $130; //@line 1247
  } else {
   $144 = HEAP32[$10 + 8 >> 2] | 0; //@line 1250
   L31 : do {
    if (($144 | 0) < 1e6) {
     switch ($144 | 0) {
     case 32768:
      {
       break;
      }
     default:
      {
       break L31;
      }
     }
     $146 = _bitshift64Shl($127 | 0, $128 | 0, 15) | 0; //@line 1262
     $148 = ___udivdi3($146 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 1264
     $$0$i = $130 >>> 0 < $148 >>> 0 ? $130 : $148; //@line 1268
     break L29;
    } else {
     switch ($144 | 0) {
     case 1e6:
      {
       break;
      }
     default:
      {
       break L31;
      }
     }
     $$0$i = $130 >>> 0 < $127 >>> 0 ? $130 : $127; //@line 1281
     break L29;
    }
   } while (0);
   $151 = ___muldi3($127 | 0, $128 | 0, $144 | 0, 0) | 0; //@line 1285
   $153 = ___udivdi3($151 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 1287
   $$0$i = $130 >>> 0 < $153 >>> 0 ? $130 : $153; //@line 1291
  }
 } while (0);
 $160 = (HEAP32[$11 >> 2] | 0) + $$0$i & HEAP32[$10 + 12 >> 2]; //@line 1298
 $161 = $2 + 32 | 0; //@line 1299
 $164 = HEAP32[$0 >> 2] | 0; //@line 1302
 if (($160 | 0) == (HEAP32[$161 >> 2] | 0)) {
  $166 = HEAP32[$164 + 20 >> 2] | 0; //@line 1305
  $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1306
  FUNCTION_TABLE_v[$166 & 15](); //@line 1307
  if (___async) {
   HEAP32[$AsyncCtx7 >> 2] = 51; //@line 1310
   sp = STACKTOP; //@line 1311
   return;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1314
  return;
 }
 $168 = HEAP32[$164 + 16 >> 2] | 0; //@line 1318
 $AsyncCtx11 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1319
 FUNCTION_TABLE_vi[$168 & 255]($160); //@line 1320
 if (___async) {
  HEAP32[$AsyncCtx11 >> 2] = 52; //@line 1323
  HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 1325
  HEAP32[$AsyncCtx11 + 8 >> 2] = $161; //@line 1327
  HEAP32[$AsyncCtx11 + 12 >> 2] = $160; //@line 1329
  sp = STACKTOP; //@line 1330
  return;
 }
 _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1333
 $174 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 1336
 $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1337
 $175 = FUNCTION_TABLE_i[$174 & 3]() | 0; //@line 1338
 if (___async) {
  HEAP32[$AsyncCtx14 >> 2] = 53; //@line 1341
  HEAP32[$AsyncCtx14 + 4 >> 2] = $161; //@line 1343
  HEAP32[$AsyncCtx14 + 8 >> 2] = $160; //@line 1345
  HEAP32[$AsyncCtx14 + 12 >> 2] = $0; //@line 1347
  sp = STACKTOP; //@line 1348
  return;
 }
 _emscripten_free_async_context($AsyncCtx14 | 0); //@line 1351
 $179 = HEAP32[$161 >> 2] | 0; //@line 1352
 if ($160 >>> 0 > $179 >>> 0) {
  if (!($175 >>> 0 >= $160 >>> 0 | $175 >>> 0 < $179 >>> 0)) {
   return;
  }
 } else {
  if (!($175 >>> 0 >= $160 >>> 0 & $175 >>> 0 < $179 >>> 0)) {
   return;
  }
 }
 $187 = HEAP32[(HEAP32[$0 >> 2] | 0) + 20 >> 2] | 0; //@line 1371
 $AsyncCtx18 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1372
 FUNCTION_TABLE_v[$187 & 15](); //@line 1373
 if (___async) {
  HEAP32[$AsyncCtx18 >> 2] = 54; //@line 1376
  sp = STACKTOP; //@line 1377
  return;
 }
 _emscripten_free_async_context($AsyncCtx18 | 0); //@line 1380
 return;
}
function _initialize($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$037 = 0, $1 = 0, $101 = 0, $102 = 0, $103 = 0, $105 = 0, $106 = 0, $109 = 0, $115 = 0, $116 = 0, $117 = 0, $126 = 0, $127 = 0, $128 = 0, $13 = 0, $130 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $14 = 0, $140 = 0, $142 = 0, $148 = 0, $149 = 0, $150 = 0, $159 = 0, $160 = 0, $161 = 0, $163 = 0, $167 = 0, $173 = 0, $174 = 0, $175 = 0, $177 = 0, $18 = 0, $25 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $37 = 0, $39 = 0, $40 = 0, $41 = 0, $45 = 0, $46 = 0, $52 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $70 = 0, $73 = 0, $77 = 0, $78 = 0, $85 = 0, $86 = 0, $AsyncCtx = 0, $AsyncCtx12 = 0, $AsyncCtx16 = 0, $AsyncCtx2 = 0, $AsyncCtx20 = 0, $AsyncCtx6 = 0, $AsyncCtx9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 640
 $1 = $0 + 4 | 0; //@line 641
 if (HEAP8[(HEAP32[$1 >> 2] | 0) + 56 >> 0] | 0) {
  return;
 }
 $7 = HEAP32[HEAP32[$0 >> 2] >> 2] | 0; //@line 650
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 651
 FUNCTION_TABLE_v[$7 & 15](); //@line 652
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 42; //@line 655
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 657
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 659
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 661
  sp = STACKTOP; //@line 662
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 665
 $13 = HEAP32[(HEAP32[$0 >> 2] | 0) + 24 >> 2] | 0; //@line 668
 $AsyncCtx2 = _emscripten_alloc_async_context(16, sp) | 0; //@line 669
 $14 = FUNCTION_TABLE_i[$13 & 3]() | 0; //@line 670
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 43; //@line 673
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 675
  HEAP32[$AsyncCtx2 + 8 >> 2] = $1; //@line 677
  HEAP32[$AsyncCtx2 + 12 >> 2] = $0; //@line 679
  sp = STACKTOP; //@line 680
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 683
 $18 = HEAP32[$14 >> 2] | 0; //@line 684
 do {
  if (!$18) {
   $AsyncCtx20 = _emscripten_alloc_async_context(20, sp) | 0; //@line 688
   _mbed_assert_internal(1259, 1261, 41); //@line 689
   if (___async) {
    HEAP32[$AsyncCtx20 >> 2] = 44; //@line 692
    HEAP32[$AsyncCtx20 + 4 >> 2] = $0; //@line 694
    HEAP32[$AsyncCtx20 + 8 >> 2] = $1; //@line 696
    HEAP32[$AsyncCtx20 + 12 >> 2] = $0; //@line 698
    HEAP32[$AsyncCtx20 + 16 >> 2] = $14; //@line 700
    sp = STACKTOP; //@line 701
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx20 | 0); //@line 704
    $$0 = 1e6; //@line 705
    break;
   }
  } else {
   $$0 = $18; //@line 709
  }
 } while (0);
 $25 = HEAP32[$14 + 4 >> 2] | 0; //@line 713
 do {
  if (($25 + -4 | 0) >>> 0 > 28) {
   $AsyncCtx16 = _emscripten_alloc_async_context(20, sp) | 0; //@line 718
   _mbed_assert_internal(1259, 1261, 47); //@line 719
   if (___async) {
    HEAP32[$AsyncCtx16 >> 2] = 45; //@line 722
    HEAP32[$AsyncCtx16 + 4 >> 2] = $$0; //@line 724
    HEAP32[$AsyncCtx16 + 8 >> 2] = $1; //@line 726
    HEAP32[$AsyncCtx16 + 12 >> 2] = $0; //@line 728
    HEAP32[$AsyncCtx16 + 16 >> 2] = $0; //@line 730
    sp = STACKTOP; //@line 731
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx16 | 0); //@line 734
    $$037 = 32; //@line 735
    break;
   }
  } else {
   $$037 = $25; //@line 739
  }
 } while (0);
 $32 = 7 << $$037 + -4; //@line 743
 $33 = ___muldi3($32 | 0, 0, 1e6, 0) | 0; //@line 744
 $34 = tempRet0; //@line 745
 $35 = _i64Add($$0 | 0, 0, -1, -1) | 0; //@line 746
 $37 = _i64Add($35 | 0, tempRet0 | 0, $33 | 0, $34 | 0) | 0; //@line 748
 $39 = ___udivdi3($37 | 0, tempRet0 | 0, $$0 | 0, 0) | 0; //@line 750
 $40 = tempRet0; //@line 751
 $41 = HEAP32[$1 >> 2] | 0; //@line 752
 HEAP32[$41 >> 2] = 0; //@line 753
 HEAP32[$41 + 4 >> 2] = 0; //@line 755
 $45 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 758
 $AsyncCtx6 = _emscripten_alloc_async_context(40, sp) | 0; //@line 759
 $46 = FUNCTION_TABLE_i[$45 & 3]() | 0; //@line 760
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 46; //@line 763
  HEAP32[$AsyncCtx6 + 4 >> 2] = $1; //@line 765
  HEAP32[$AsyncCtx6 + 8 >> 2] = $$0; //@line 767
  HEAP32[$AsyncCtx6 + 12 >> 2] = $$037; //@line 769
  HEAP32[$AsyncCtx6 + 16 >> 2] = $32; //@line 771
  $52 = $AsyncCtx6 + 24 | 0; //@line 773
  HEAP32[$52 >> 2] = $39; //@line 775
  HEAP32[$52 + 4 >> 2] = $40; //@line 778
  HEAP32[$AsyncCtx6 + 32 >> 2] = $0; //@line 780
  HEAP32[$AsyncCtx6 + 36 >> 2] = $0; //@line 782
  sp = STACKTOP; //@line 783
  return;
 }
 _emscripten_free_async_context($AsyncCtx6 | 0); //@line 786
 $58 = HEAP32[$1 >> 2] | 0; //@line 787
 $59 = $58 + 32 | 0; //@line 788
 HEAP32[$59 >> 2] = $46; //@line 789
 $60 = $58 + 40 | 0; //@line 790
 $61 = $60; //@line 791
 HEAP32[$61 >> 2] = 0; //@line 793
 HEAP32[$61 + 4 >> 2] = 0; //@line 796
 $65 = $58 + 8 | 0; //@line 797
 HEAP32[$65 >> 2] = $$0; //@line 798
 $66 = _bitshift64Shl(1, 0, $$037 | 0) | 0; //@line 799
 $68 = _i64Add($66 | 0, tempRet0 | 0, -1, 0) | 0; //@line 801
 $70 = $58 + 12 | 0; //@line 803
 HEAP32[$70 >> 2] = $68; //@line 804
 HEAP32[$58 + 16 >> 2] = $32; //@line 806
 $73 = $58 + 24 | 0; //@line 808
 HEAP32[$73 >> 2] = $39; //@line 810
 HEAP32[$73 + 4 >> 2] = $40; //@line 813
 $77 = $58 + 48 | 0; //@line 814
 $78 = $77; //@line 815
 HEAP32[$78 >> 2] = 0; //@line 817
 HEAP32[$78 + 4 >> 2] = 0; //@line 820
 HEAP8[$58 + 56 >> 0] = 1; //@line 822
 $85 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 825
 $AsyncCtx9 = _emscripten_alloc_async_context(32, sp) | 0; //@line 826
 $86 = FUNCTION_TABLE_i[$85 & 3]() | 0; //@line 827
 if (___async) {
  HEAP32[$AsyncCtx9 >> 2] = 47; //@line 830
  HEAP32[$AsyncCtx9 + 4 >> 2] = $1; //@line 832
  HEAP32[$AsyncCtx9 + 8 >> 2] = $0; //@line 834
  HEAP32[$AsyncCtx9 + 12 >> 2] = $59; //@line 836
  HEAP32[$AsyncCtx9 + 16 >> 2] = $70; //@line 838
  HEAP32[$AsyncCtx9 + 20 >> 2] = $65; //@line 840
  HEAP32[$AsyncCtx9 + 24 >> 2] = $60; //@line 842
  HEAP32[$AsyncCtx9 + 28 >> 2] = $77; //@line 844
  sp = STACKTOP; //@line 845
  return;
 }
 _emscripten_free_async_context($AsyncCtx9 | 0); //@line 848
 if (($86 | 0) != (HEAP32[(HEAP32[$1 >> 2] | 0) + 32 >> 2] | 0)) {
  $101 = $86 - (HEAP32[$59 >> 2] | 0) & HEAP32[$70 >> 2]; //@line 857
  HEAP32[$59 >> 2] = $86; //@line 858
  $102 = HEAP32[$65 >> 2] | 0; //@line 859
  L30 : do {
   if (($102 | 0) < 1e6) {
    switch ($102 | 0) {
    case 32768:
     {
      break;
     }
    default:
     {
      label = 22; //@line 868
      break L30;
     }
    }
    $103 = ___muldi3($101 | 0, 0, 1e6, 0) | 0; //@line 872
    $105 = _bitshift64Lshr($103 | 0, tempRet0 | 0, 15) | 0; //@line 874
    $106 = tempRet0; //@line 875
    $109 = $60; //@line 878
    $115 = _i64Add(HEAP32[$109 >> 2] | 0, HEAP32[$109 + 4 >> 2] | 0, $101 * 1e6 & 32704 | 0, 0) | 0; //@line 884
    $116 = tempRet0; //@line 885
    $117 = $60; //@line 886
    HEAP32[$117 >> 2] = $115; //@line 888
    HEAP32[$117 + 4 >> 2] = $116; //@line 891
    if ($116 >>> 0 < 0 | ($116 | 0) == 0 & $115 >>> 0 < 32768) {
     $173 = $105; //@line 898
     $174 = $106; //@line 898
    } else {
     $126 = _i64Add($105 | 0, $106 | 0, 1, 0) | 0; //@line 900
     $127 = tempRet0; //@line 901
     $128 = _i64Add($115 | 0, $116 | 0, -32768, -1) | 0; //@line 902
     $130 = $60; //@line 904
     HEAP32[$130 >> 2] = $128; //@line 906
     HEAP32[$130 + 4 >> 2] = tempRet0; //@line 909
     $173 = $126; //@line 910
     $174 = $127; //@line 910
    }
   } else {
    switch ($102 | 0) {
    case 1e6:
     {
      $173 = $101; //@line 915
      $174 = 0; //@line 915
      break;
     }
    default:
     {
      label = 22; //@line 919
     }
    }
   }
  } while (0);
  if ((label | 0) == 22) {
   $134 = ___muldi3($101 | 0, 0, 1e6, 0) | 0; //@line 925
   $135 = tempRet0; //@line 926
   $136 = ___udivdi3($134 | 0, $135 | 0, $102 | 0, 0) | 0; //@line 927
   $137 = tempRet0; //@line 928
   $138 = ___muldi3($136 | 0, $137 | 0, $102 | 0, 0) | 0; //@line 929
   $140 = _i64Subtract($134 | 0, $135 | 0, $138 | 0, tempRet0 | 0) | 0; //@line 931
   $142 = $60; //@line 933
   $148 = _i64Add($140 | 0, tempRet0 | 0, HEAP32[$142 >> 2] | 0, HEAP32[$142 + 4 >> 2] | 0) | 0; //@line 939
   $149 = tempRet0; //@line 940
   $150 = $60; //@line 941
   HEAP32[$150 >> 2] = $148; //@line 943
   HEAP32[$150 + 4 >> 2] = $149; //@line 946
   if ($149 >>> 0 < 0 | ($149 | 0) == 0 & $148 >>> 0 < $102 >>> 0) {
    $173 = $136; //@line 953
    $174 = $137; //@line 953
   } else {
    $159 = _i64Add($136 | 0, $137 | 0, 1, 0) | 0; //@line 955
    $160 = tempRet0; //@line 956
    $161 = _i64Subtract($148 | 0, $149 | 0, $102 | 0, 0) | 0; //@line 957
    $163 = $60; //@line 959
    HEAP32[$163 >> 2] = $161; //@line 961
    HEAP32[$163 + 4 >> 2] = tempRet0; //@line 964
    $173 = $159; //@line 965
    $174 = $160; //@line 965
   }
  }
  $167 = $77; //@line 968
  $175 = _i64Add(HEAP32[$167 >> 2] | 0, HEAP32[$167 + 4 >> 2] | 0, $173 | 0, $174 | 0) | 0; //@line 974
  $177 = $77; //@line 976
  HEAP32[$177 >> 2] = $175; //@line 978
  HEAP32[$177 + 4 >> 2] = tempRet0; //@line 981
 }
 $AsyncCtx12 = _emscripten_alloc_async_context(4, sp) | 0; //@line 983
 _schedule_interrupt($0); //@line 984
 if (___async) {
  HEAP32[$AsyncCtx12 >> 2] = 48; //@line 987
  sp = STACKTOP; //@line 988
  return;
 }
 _emscripten_free_async_context($AsyncCtx12 | 0); //@line 991
 return;
}
function _schedule_interrupt__async_cb($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $102 = 0, $105 = 0, $107 = 0, $110 = 0, $111 = 0, $113 = 0, $116 = 0, $12 = 0, $124 = 0, $125 = 0, $126 = 0, $128 = 0, $130 = 0, $135 = 0, $142 = 0, $144 = 0, $146 = 0, $149 = 0, $151 = 0, $158 = 0, $159 = 0, $162 = 0, $164 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $177 = 0, $180 = 0, $19 = 0, $2 = 0, $20 = 0, $22 = 0, $23 = 0, $26 = 0, $27 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $44 = 0, $45 = 0, $46 = 0, $48 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $58 = 0, $60 = 0, $61 = 0, $67 = 0, $68 = 0, $69 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $82 = 0, $86 = 0, $87 = 0, $9 = 0, $93 = 0, $94 = 0, $95 = 0, $97 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12315
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12317
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12319
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12323
 $8 = HEAP32[HEAP32[$0 + 12 >> 2] >> 2] | 0; //@line 12324
 $9 = $8 + 32 | 0; //@line 12325
 if (($AsyncRetVal | 0) != (HEAP32[$9 >> 2] | 0)) {
  $12 = $2 + 32 | 0; //@line 12329
  $17 = $AsyncRetVal - (HEAP32[$12 >> 2] | 0) & HEAP32[$2 + 12 >> 2]; //@line 12334
  HEAP32[$12 >> 2] = $AsyncRetVal; //@line 12335
  $19 = HEAP32[$2 + 8 >> 2] | 0; //@line 12337
  L4 : do {
   if (($19 | 0) < 1e6) {
    switch ($19 | 0) {
    case 32768:
     {
      break;
     }
    default:
     {
      label = 6; //@line 12346
      break L4;
     }
    }
    $20 = ___muldi3($17 | 0, 0, 1e6, 0) | 0; //@line 12350
    $22 = _bitshift64Lshr($20 | 0, tempRet0 | 0, 15) | 0; //@line 12352
    $23 = tempRet0; //@line 12353
    $26 = $2 + 40 | 0; //@line 12356
    $27 = $26; //@line 12357
    $33 = _i64Add(HEAP32[$27 >> 2] | 0, HEAP32[$27 + 4 >> 2] | 0, $17 * 1e6 & 32704 | 0, 0) | 0; //@line 12363
    $34 = tempRet0; //@line 12364
    $35 = $26; //@line 12365
    HEAP32[$35 >> 2] = $33; //@line 12367
    HEAP32[$35 + 4 >> 2] = $34; //@line 12370
    if ($34 >>> 0 < 0 | ($34 | 0) == 0 & $33 >>> 0 < 32768) {
     $93 = $22; //@line 12377
     $94 = $23; //@line 12377
    } else {
     $44 = _i64Add($22 | 0, $23 | 0, 1, 0) | 0; //@line 12379
     $45 = tempRet0; //@line 12380
     $46 = _i64Add($33 | 0, $34 | 0, -32768, -1) | 0; //@line 12381
     $48 = $26; //@line 12383
     HEAP32[$48 >> 2] = $46; //@line 12385
     HEAP32[$48 + 4 >> 2] = tempRet0; //@line 12388
     $93 = $44; //@line 12389
     $94 = $45; //@line 12389
    }
   } else {
    switch ($19 | 0) {
    case 1e6:
     {
      $93 = $17; //@line 12394
      $94 = 0; //@line 12394
      break;
     }
    default:
     {
      label = 6; //@line 12398
     }
    }
   }
  } while (0);
  if ((label | 0) == 6) {
   $52 = ___muldi3($17 | 0, 0, 1e6, 0) | 0; //@line 12404
   $53 = tempRet0; //@line 12405
   $54 = ___udivdi3($52 | 0, $53 | 0, $19 | 0, 0) | 0; //@line 12406
   $55 = tempRet0; //@line 12407
   $56 = ___muldi3($54 | 0, $55 | 0, $19 | 0, 0) | 0; //@line 12408
   $58 = _i64Subtract($52 | 0, $53 | 0, $56 | 0, tempRet0 | 0) | 0; //@line 12410
   $60 = $2 + 40 | 0; //@line 12412
   $61 = $60; //@line 12413
   $67 = _i64Add($58 | 0, tempRet0 | 0, HEAP32[$61 >> 2] | 0, HEAP32[$61 + 4 >> 2] | 0) | 0; //@line 12419
   $68 = tempRet0; //@line 12420
   $69 = $60; //@line 12421
   HEAP32[$69 >> 2] = $67; //@line 12423
   HEAP32[$69 + 4 >> 2] = $68; //@line 12426
   if ($68 >>> 0 < 0 | ($68 | 0) == 0 & $67 >>> 0 < $19 >>> 0) {
    $93 = $54; //@line 12433
    $94 = $55; //@line 12433
   } else {
    $78 = _i64Add($54 | 0, $55 | 0, 1, 0) | 0; //@line 12435
    $79 = tempRet0; //@line 12436
    $80 = _i64Subtract($67 | 0, $68 | 0, $19 | 0, 0) | 0; //@line 12437
    $82 = $60; //@line 12439
    HEAP32[$82 >> 2] = $80; //@line 12441
    HEAP32[$82 + 4 >> 2] = tempRet0; //@line 12444
    $93 = $78; //@line 12445
    $94 = $79; //@line 12445
   }
  }
  $86 = $2 + 48 | 0; //@line 12448
  $87 = $86; //@line 12449
  $95 = _i64Add(HEAP32[$87 >> 2] | 0, HEAP32[$87 + 4 >> 2] | 0, $93 | 0, $94 | 0) | 0; //@line 12455
  $97 = $86; //@line 12457
  HEAP32[$97 >> 2] = $95; //@line 12459
  HEAP32[$97 + 4 >> 2] = tempRet0; //@line 12462
 }
 $102 = HEAP32[$8 + 4 >> 2] | 0; //@line 12465
 if (!$102) {
  $177 = (HEAP32[$2 + 16 >> 2] | 0) + (HEAP32[$2 + 32 >> 2] | 0) & HEAP32[$2 + 12 >> 2]; //@line 12475
  $180 = HEAP32[(HEAP32[$4 >> 2] | 0) + 16 >> 2] | 0; //@line 12478
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 12479
  FUNCTION_TABLE_vi[$180 & 255]($177); //@line 12480
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 12483
   sp = STACKTOP; //@line 12484
   return;
  }
  ___async_unwind = 0; //@line 12487
  HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 12488
  sp = STACKTOP; //@line 12489
  return;
 }
 $105 = $8 + 48 | 0; //@line 12493
 $107 = HEAP32[$105 >> 2] | 0; //@line 12495
 $110 = HEAP32[$105 + 4 >> 2] | 0; //@line 12498
 $111 = $102; //@line 12499
 $113 = HEAP32[$111 >> 2] | 0; //@line 12501
 $116 = HEAP32[$111 + 4 >> 2] | 0; //@line 12504
 if (!($116 >>> 0 > $110 >>> 0 | ($116 | 0) == ($110 | 0) & $113 >>> 0 > $107 >>> 0)) {
  $124 = HEAP32[(HEAP32[$4 >> 2] | 0) + 20 >> 2] | 0; //@line 12513
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 12514
  FUNCTION_TABLE_v[$124 & 15](); //@line 12515
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 50; //@line 12518
   sp = STACKTOP; //@line 12519
   return;
  }
  ___async_unwind = 0; //@line 12522
  HEAP32[$ReallocAsyncCtx2 >> 2] = 50; //@line 12523
  sp = STACKTOP; //@line 12524
  return;
 }
 $125 = _i64Subtract($113 | 0, $116 | 0, $107 | 0, $110 | 0) | 0; //@line 12527
 $126 = tempRet0; //@line 12528
 $128 = HEAP32[$8 + 16 >> 2] | 0; //@line 12530
 $130 = $8 + 24 | 0; //@line 12532
 $135 = HEAP32[$130 + 4 >> 2] | 0; //@line 12537
 L28 : do {
  if ($126 >>> 0 > $135 >>> 0 | (($126 | 0) == ($135 | 0) ? $125 >>> 0 > (HEAP32[$130 >> 2] | 0) >>> 0 : 0)) {
   $$0$i = $128; //@line 12545
  } else {
   $142 = HEAP32[$8 + 8 >> 2] | 0; //@line 12548
   L30 : do {
    if (($142 | 0) < 1e6) {
     switch ($142 | 0) {
     case 32768:
      {
       break;
      }
     default:
      {
       break L30;
      }
     }
     $144 = _bitshift64Shl($125 | 0, $126 | 0, 15) | 0; //@line 12560
     $146 = ___udivdi3($144 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 12562
     $$0$i = $128 >>> 0 < $146 >>> 0 ? $128 : $146; //@line 12566
     break L28;
    } else {
     switch ($142 | 0) {
     case 1e6:
      {
       break;
      }
     default:
      {
       break L30;
      }
     }
     $$0$i = $128 >>> 0 < $125 >>> 0 ? $128 : $125; //@line 12579
     break L28;
    }
   } while (0);
   $149 = ___muldi3($125 | 0, $126 | 0, $142 | 0, 0) | 0; //@line 12583
   $151 = ___udivdi3($149 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 12585
   $$0$i = $128 >>> 0 < $151 >>> 0 ? $128 : $151; //@line 12589
  }
 } while (0);
 $158 = (HEAP32[$9 >> 2] | 0) + $$0$i & HEAP32[$8 + 12 >> 2]; //@line 12596
 $159 = $2 + 32 | 0; //@line 12597
 $162 = HEAP32[$4 >> 2] | 0; //@line 12600
 if (($158 | 0) == (HEAP32[$159 >> 2] | 0)) {
  $164 = HEAP32[$162 + 20 >> 2] | 0; //@line 12603
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 12604
  FUNCTION_TABLE_v[$164 & 15](); //@line 12605
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 51; //@line 12608
   sp = STACKTOP; //@line 12609
   return;
  }
  ___async_unwind = 0; //@line 12612
  HEAP32[$ReallocAsyncCtx3 >> 2] = 51; //@line 12613
  sp = STACKTOP; //@line 12614
  return;
 } else {
  $166 = HEAP32[$162 + 16 >> 2] | 0; //@line 12618
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 12619
  FUNCTION_TABLE_vi[$166 & 255]($158); //@line 12620
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 52; //@line 12623
   $167 = $ReallocAsyncCtx4 + 4 | 0; //@line 12624
   HEAP32[$167 >> 2] = $4; //@line 12625
   $168 = $ReallocAsyncCtx4 + 8 | 0; //@line 12626
   HEAP32[$168 >> 2] = $159; //@line 12627
   $169 = $ReallocAsyncCtx4 + 12 | 0; //@line 12628
   HEAP32[$169 >> 2] = $158; //@line 12629
   sp = STACKTOP; //@line 12630
   return;
  }
  ___async_unwind = 0; //@line 12633
  HEAP32[$ReallocAsyncCtx4 >> 2] = 52; //@line 12634
  $167 = $ReallocAsyncCtx4 + 4 | 0; //@line 12635
  HEAP32[$167 >> 2] = $4; //@line 12636
  $168 = $ReallocAsyncCtx4 + 8 | 0; //@line 12637
  HEAP32[$168 >> 2] = $159; //@line 12638
  $169 = $ReallocAsyncCtx4 + 12 | 0; //@line 12639
  HEAP32[$169 >> 2] = $158; //@line 12640
  sp = STACKTOP; //@line 12641
  return;
 }
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1470
 STACKTOP = STACKTOP + 32 | 0; //@line 1471
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 1471
 $0 = sp; //@line 1472
 _gpio_init_out($0, 50); //@line 1473
 while (1) {
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1476
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1477
  _wait_ms(150); //@line 1478
  if (___async) {
   label = 3; //@line 1481
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 1484
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1486
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1487
  _wait_ms(150); //@line 1488
  if (___async) {
   label = 5; //@line 1491
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 1494
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1496
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1497
  _wait_ms(150); //@line 1498
  if (___async) {
   label = 7; //@line 1501
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 1504
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1506
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1507
  _wait_ms(150); //@line 1508
  if (___async) {
   label = 9; //@line 1511
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 1514
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1516
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1517
  _wait_ms(150); //@line 1518
  if (___async) {
   label = 11; //@line 1521
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 1524
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1526
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1527
  _wait_ms(150); //@line 1528
  if (___async) {
   label = 13; //@line 1531
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 1534
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1536
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1537
  _wait_ms(150); //@line 1538
  if (___async) {
   label = 15; //@line 1541
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 1544
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1546
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1547
  _wait_ms(150); //@line 1548
  if (___async) {
   label = 17; //@line 1551
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 1554
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1556
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1557
  _wait_ms(400); //@line 1558
  if (___async) {
   label = 19; //@line 1561
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 1564
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1566
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1567
  _wait_ms(400); //@line 1568
  if (___async) {
   label = 21; //@line 1571
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 1574
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1576
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1577
  _wait_ms(400); //@line 1578
  if (___async) {
   label = 23; //@line 1581
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 1584
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1586
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1587
  _wait_ms(400); //@line 1588
  if (___async) {
   label = 25; //@line 1591
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1594
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1596
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1597
  _wait_ms(400); //@line 1598
  if (___async) {
   label = 27; //@line 1601
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1604
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1606
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1607
  _wait_ms(400); //@line 1608
  if (___async) {
   label = 29; //@line 1611
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1614
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1616
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1617
  _wait_ms(400); //@line 1618
  if (___async) {
   label = 31; //@line 1621
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1624
  _emscripten_asm_const_iii(0, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1626
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1627
  _wait_ms(400); //@line 1628
  if (___async) {
   label = 33; //@line 1631
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1634
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 58; //@line 1638
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 1640
   sp = STACKTOP; //@line 1641
   STACKTOP = sp; //@line 1642
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 59; //@line 1646
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 1648
   sp = STACKTOP; //@line 1649
   STACKTOP = sp; //@line 1650
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 60; //@line 1654
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 1656
   sp = STACKTOP; //@line 1657
   STACKTOP = sp; //@line 1658
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 61; //@line 1662
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 1664
   sp = STACKTOP; //@line 1665
   STACKTOP = sp; //@line 1666
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 62; //@line 1670
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 1672
   sp = STACKTOP; //@line 1673
   STACKTOP = sp; //@line 1674
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 63; //@line 1678
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 1680
   sp = STACKTOP; //@line 1681
   STACKTOP = sp; //@line 1682
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 64; //@line 1686
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 1688
   sp = STACKTOP; //@line 1689
   STACKTOP = sp; //@line 1690
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 65; //@line 1694
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 1696
   sp = STACKTOP; //@line 1697
   STACKTOP = sp; //@line 1698
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 66; //@line 1702
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 1704
   sp = STACKTOP; //@line 1705
   STACKTOP = sp; //@line 1706
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 67; //@line 1710
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 1712
   sp = STACKTOP; //@line 1713
   STACKTOP = sp; //@line 1714
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 68; //@line 1718
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 1720
   sp = STACKTOP; //@line 1721
   STACKTOP = sp; //@line 1722
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 69; //@line 1726
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 1728
   sp = STACKTOP; //@line 1729
   STACKTOP = sp; //@line 1730
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 70; //@line 1734
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 1736
   sp = STACKTOP; //@line 1737
   STACKTOP = sp; //@line 1738
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 71; //@line 1742
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 1744
   sp = STACKTOP; //@line 1745
   STACKTOP = sp; //@line 1746
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 72; //@line 1750
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1752
   sp = STACKTOP; //@line 1753
   STACKTOP = sp; //@line 1754
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 73; //@line 1758
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1760
   sp = STACKTOP; //@line 1761
   STACKTOP = sp; //@line 1762
   return;
  }
 }
}
function _main() {
 var $0 = 0, $1 = 0, $13 = 0, $17 = 0, $2 = 0, $22 = 0, $25 = 0, $29 = 0, $33 = 0, $37 = 0, $40 = 0, $43 = 0, $47 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx22 = 0, $AsyncCtx25 = 0, $AsyncCtx28 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2232
 STACKTOP = STACKTOP + 48 | 0; //@line 2233
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 2233
 $0 = sp + 32 | 0; //@line 2234
 $1 = sp + 16 | 0; //@line 2235
 $2 = sp; //@line 2236
 $AsyncCtx19 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2237
 _puts(1938) | 0; //@line 2238
 if (___async) {
  HEAP32[$AsyncCtx19 >> 2] = 89; //@line 2241
  HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 2243
  HEAP32[$AsyncCtx19 + 8 >> 2] = $2; //@line 2245
  HEAP32[$AsyncCtx19 + 12 >> 2] = $1; //@line 2247
  sp = STACKTOP; //@line 2248
  STACKTOP = sp; //@line 2249
  return 0; //@line 2249
 }
 _emscripten_free_async_context($AsyncCtx19 | 0); //@line 2251
 $AsyncCtx15 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2252
 _puts(1951) | 0; //@line 2253
 if (___async) {
  HEAP32[$AsyncCtx15 >> 2] = 90; //@line 2256
  HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 2258
  HEAP32[$AsyncCtx15 + 8 >> 2] = $2; //@line 2260
  HEAP32[$AsyncCtx15 + 12 >> 2] = $1; //@line 2262
  sp = STACKTOP; //@line 2263
  STACKTOP = sp; //@line 2264
  return 0; //@line 2264
 }
 _emscripten_free_async_context($AsyncCtx15 | 0); //@line 2266
 $AsyncCtx11 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2267
 _puts(2054) | 0; //@line 2268
 if (___async) {
  HEAP32[$AsyncCtx11 >> 2] = 91; //@line 2271
  HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 2273
  HEAP32[$AsyncCtx11 + 8 >> 2] = $2; //@line 2275
  HEAP32[$AsyncCtx11 + 12 >> 2] = $1; //@line 2277
  sp = STACKTOP; //@line 2278
  STACKTOP = sp; //@line 2279
  return 0; //@line 2279
 }
 _emscripten_free_async_context($AsyncCtx11 | 0); //@line 2281
 $13 = $0 + 4 | 0; //@line 2283
 HEAP32[$13 >> 2] = 0; //@line 2285
 HEAP32[$13 + 4 >> 2] = 0; //@line 2288
 HEAP32[$0 >> 2] = 7; //@line 2289
 $17 = $0 + 12 | 0; //@line 2290
 HEAP32[$17 >> 2] = 440; //@line 2291
 $AsyncCtx25 = _emscripten_alloc_async_context(20, sp) | 0; //@line 2292
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5096, $0, 1.0); //@line 2293
 if (___async) {
  HEAP32[$AsyncCtx25 >> 2] = 92; //@line 2296
  HEAP32[$AsyncCtx25 + 4 >> 2] = $0; //@line 2298
  HEAP32[$AsyncCtx25 + 8 >> 2] = $2; //@line 2300
  HEAP32[$AsyncCtx25 + 12 >> 2] = $1; //@line 2302
  HEAP32[$AsyncCtx25 + 16 >> 2] = $17; //@line 2304
  sp = STACKTOP; //@line 2305
  STACKTOP = sp; //@line 2306
  return 0; //@line 2306
 }
 _emscripten_free_async_context($AsyncCtx25 | 0); //@line 2308
 $22 = HEAP32[$17 >> 2] | 0; //@line 2309
 do {
  if ($22 | 0) {
   $25 = HEAP32[$22 + 8 >> 2] | 0; //@line 2314
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 2315
   FUNCTION_TABLE_vi[$25 & 255]($0); //@line 2316
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 93; //@line 2319
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 2321
    HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 2323
    sp = STACKTOP; //@line 2324
    STACKTOP = sp; //@line 2325
    return 0; //@line 2325
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 2327
    break;
   }
  }
 } while (0);
 $29 = $1 + 4 | 0; //@line 2333
 HEAP32[$29 >> 2] = 0; //@line 2335
 HEAP32[$29 + 4 >> 2] = 0; //@line 2338
 HEAP32[$1 >> 2] = 8; //@line 2339
 $33 = $1 + 12 | 0; //@line 2340
 HEAP32[$33 >> 2] = 440; //@line 2341
 $AsyncCtx22 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2342
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5160, $1, 2.5); //@line 2343
 if (___async) {
  HEAP32[$AsyncCtx22 >> 2] = 94; //@line 2346
  HEAP32[$AsyncCtx22 + 4 >> 2] = $33; //@line 2348
  HEAP32[$AsyncCtx22 + 8 >> 2] = $2; //@line 2350
  HEAP32[$AsyncCtx22 + 12 >> 2] = $1; //@line 2352
  sp = STACKTOP; //@line 2353
  STACKTOP = sp; //@line 2354
  return 0; //@line 2354
 }
 _emscripten_free_async_context($AsyncCtx22 | 0); //@line 2356
 $37 = HEAP32[$33 >> 2] | 0; //@line 2357
 do {
  if ($37 | 0) {
   $40 = HEAP32[$37 + 8 >> 2] | 0; //@line 2362
   $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2363
   FUNCTION_TABLE_vi[$40 & 255]($1); //@line 2364
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 95; //@line 2367
    HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 2369
    sp = STACKTOP; //@line 2370
    STACKTOP = sp; //@line 2371
    return 0; //@line 2371
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2373
    break;
   }
  }
 } while (0);
 $43 = $2 + 4 | 0; //@line 2379
 HEAP32[$43 >> 2] = 0; //@line 2381
 HEAP32[$43 + 4 >> 2] = 0; //@line 2384
 HEAP32[$2 >> 2] = 9; //@line 2385
 $47 = $2 + 12 | 0; //@line 2386
 HEAP32[$47 >> 2] = 440; //@line 2387
 $AsyncCtx28 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2388
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5300, $2); //@line 2389
 if (___async) {
  HEAP32[$AsyncCtx28 >> 2] = 96; //@line 2392
  HEAP32[$AsyncCtx28 + 4 >> 2] = $47; //@line 2394
  HEAP32[$AsyncCtx28 + 8 >> 2] = $2; //@line 2396
  sp = STACKTOP; //@line 2397
  STACKTOP = sp; //@line 2398
  return 0; //@line 2398
 }
 _emscripten_free_async_context($AsyncCtx28 | 0); //@line 2400
 $50 = HEAP32[$47 >> 2] | 0; //@line 2401
 do {
  if ($50 | 0) {
   $53 = HEAP32[$50 + 8 >> 2] | 0; //@line 2406
   $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2407
   FUNCTION_TABLE_vi[$53 & 255]($2); //@line 2408
   if (___async) {
    HEAP32[$AsyncCtx7 >> 2] = 97; //@line 2411
    sp = STACKTOP; //@line 2412
    STACKTOP = sp; //@line 2413
    return 0; //@line 2413
   } else {
    _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2415
    break;
   }
  }
 } while (0);
 $AsyncCtx31 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2420
 _wait_ms(-1); //@line 2421
 if (___async) {
  HEAP32[$AsyncCtx31 >> 2] = 98; //@line 2424
  sp = STACKTOP; //@line 2425
  STACKTOP = sp; //@line 2426
  return 0; //@line 2426
 } else {
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 2428
  STACKTOP = sp; //@line 2429
  return 0; //@line 2429
 }
 return 0; //@line 2431
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0.0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $16 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $48 = 0, $6 = 0.0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 11592
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11596
 $6 = +HEAPF32[$0 + 12 >> 2]; //@line 11598
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11600
 $9 = $4 + 12 | 0; //@line 11602
 HEAP32[$9 >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 11603
 $10 = $6 * 1.0e6; //@line 11604
 $11 = ~~$10 >>> 0; //@line 11605
 $12 = +Math_abs($10) >= 1.0 ? $10 > 0.0 ? ~~+Math_min(+Math_floor($10 / 4294967296.0), 4294967295.0) >>> 0 : ~~+Math_ceil(($10 - +(~~$10 >>> 0)) / 4294967296.0) >>> 0 : 0; //@line 11606
 $13 = $8 + 40 | 0; //@line 11607
 do {
  if (($13 | 0) != ($4 | 0)) {
   $15 = $8 + 52 | 0; //@line 11611
   $16 = HEAP32[$15 >> 2] | 0; //@line 11612
   if ($16 | 0) {
    $19 = HEAP32[$16 + 8 >> 2] | 0; //@line 11616
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 11617
    FUNCTION_TABLE_vi[$19 & 255]($13); //@line 11618
    if (___async) {
     HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 11621
     $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 11622
     HEAP32[$20 >> 2] = $9; //@line 11623
     $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 11624
     HEAP32[$21 >> 2] = $15; //@line 11625
     $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 11626
     HEAP32[$22 >> 2] = $13; //@line 11627
     $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 11628
     HEAP32[$23 >> 2] = $4; //@line 11629
     $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 11630
     HEAP32[$24 >> 2] = $9; //@line 11631
     $25 = $ReallocAsyncCtx2 + 24 | 0; //@line 11632
     HEAP32[$25 >> 2] = $8; //@line 11633
     $26 = $ReallocAsyncCtx2 + 32 | 0; //@line 11634
     $27 = $26; //@line 11635
     $28 = $27; //@line 11636
     HEAP32[$28 >> 2] = $11; //@line 11637
     $29 = $27 + 4 | 0; //@line 11638
     $30 = $29; //@line 11639
     HEAP32[$30 >> 2] = $12; //@line 11640
     sp = STACKTOP; //@line 11641
     return;
    }
    ___async_unwind = 0; //@line 11644
    HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 11645
    $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 11646
    HEAP32[$20 >> 2] = $9; //@line 11647
    $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 11648
    HEAP32[$21 >> 2] = $15; //@line 11649
    $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 11650
    HEAP32[$22 >> 2] = $13; //@line 11651
    $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 11652
    HEAP32[$23 >> 2] = $4; //@line 11653
    $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 11654
    HEAP32[$24 >> 2] = $9; //@line 11655
    $25 = $ReallocAsyncCtx2 + 24 | 0; //@line 11656
    HEAP32[$25 >> 2] = $8; //@line 11657
    $26 = $ReallocAsyncCtx2 + 32 | 0; //@line 11658
    $27 = $26; //@line 11659
    $28 = $27; //@line 11660
    HEAP32[$28 >> 2] = $11; //@line 11661
    $29 = $27 + 4 | 0; //@line 11662
    $30 = $29; //@line 11663
    HEAP32[$30 >> 2] = $12; //@line 11664
    sp = STACKTOP; //@line 11665
    return;
   }
   $31 = HEAP32[$9 >> 2] | 0; //@line 11668
   if (!$31) {
    HEAP32[$15 >> 2] = 0; //@line 11671
    break;
   }
   $34 = HEAP32[$31 + 4 >> 2] | 0; //@line 11675
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 11676
   FUNCTION_TABLE_vii[$34 & 3]($13, $4); //@line 11677
   if (___async) {
    HEAP32[$ReallocAsyncCtx3 >> 2] = 101; //@line 11680
    $35 = $ReallocAsyncCtx3 + 4 | 0; //@line 11681
    HEAP32[$35 >> 2] = $9; //@line 11682
    $36 = $ReallocAsyncCtx3 + 8 | 0; //@line 11683
    HEAP32[$36 >> 2] = $15; //@line 11684
    $37 = $ReallocAsyncCtx3 + 12 | 0; //@line 11685
    HEAP32[$37 >> 2] = $8; //@line 11686
    $38 = $ReallocAsyncCtx3 + 16 | 0; //@line 11687
    $39 = $38; //@line 11688
    $40 = $39; //@line 11689
    HEAP32[$40 >> 2] = $11; //@line 11690
    $41 = $39 + 4 | 0; //@line 11691
    $42 = $41; //@line 11692
    HEAP32[$42 >> 2] = $12; //@line 11693
    $43 = $ReallocAsyncCtx3 + 24 | 0; //@line 11694
    HEAP32[$43 >> 2] = $9; //@line 11695
    $44 = $ReallocAsyncCtx3 + 28 | 0; //@line 11696
    HEAP32[$44 >> 2] = $4; //@line 11697
    sp = STACKTOP; //@line 11698
    return;
   }
   ___async_unwind = 0; //@line 11701
   HEAP32[$ReallocAsyncCtx3 >> 2] = 101; //@line 11702
   $35 = $ReallocAsyncCtx3 + 4 | 0; //@line 11703
   HEAP32[$35 >> 2] = $9; //@line 11704
   $36 = $ReallocAsyncCtx3 + 8 | 0; //@line 11705
   HEAP32[$36 >> 2] = $15; //@line 11706
   $37 = $ReallocAsyncCtx3 + 12 | 0; //@line 11707
   HEAP32[$37 >> 2] = $8; //@line 11708
   $38 = $ReallocAsyncCtx3 + 16 | 0; //@line 11709
   $39 = $38; //@line 11710
   $40 = $39; //@line 11711
   HEAP32[$40 >> 2] = $11; //@line 11712
   $41 = $39 + 4 | 0; //@line 11713
   $42 = $41; //@line 11714
   HEAP32[$42 >> 2] = $12; //@line 11715
   $43 = $ReallocAsyncCtx3 + 24 | 0; //@line 11716
   HEAP32[$43 >> 2] = $9; //@line 11717
   $44 = $ReallocAsyncCtx3 + 28 | 0; //@line 11718
   HEAP32[$44 >> 2] = $4; //@line 11719
   sp = STACKTOP; //@line 11720
   return;
  }
 } while (0);
 __ZN4mbed6Ticker5setupEy($8, $11, $12); //@line 11724
 $45 = HEAP32[$9 >> 2] | 0; //@line 11725
 if (!$45) {
  return;
 }
 $48 = HEAP32[$45 + 8 >> 2] | 0; //@line 11731
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 11732
 FUNCTION_TABLE_vi[$48 & 255]($4); //@line 11733
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 102; //@line 11736
  sp = STACKTOP; //@line 11737
  return;
 }
 ___async_unwind = 0; //@line 11740
 HEAP32[$ReallocAsyncCtx4 >> 2] = 102; //@line 11741
 sp = STACKTOP; //@line 11742
 return;
}
function _initialize__async_cb_29($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $27 = 0, $29 = 0, $30 = 0, $31 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 13877
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13879
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13881
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13883
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13885
 $8 = HEAP32[$AsyncRetVal >> 2] | 0; //@line 13886
 if (!$8) {
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(20) | 0; //@line 13889
  _mbed_assert_internal(1259, 1261, 41); //@line 13890
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 44; //@line 13893
   $10 = $ReallocAsyncCtx7 + 4 | 0; //@line 13894
   HEAP32[$10 >> 2] = $2; //@line 13895
   $11 = $ReallocAsyncCtx7 + 8 | 0; //@line 13896
   HEAP32[$11 >> 2] = $4; //@line 13897
   $12 = $ReallocAsyncCtx7 + 12 | 0; //@line 13898
   HEAP32[$12 >> 2] = $6; //@line 13899
   $13 = $ReallocAsyncCtx7 + 16 | 0; //@line 13900
   HEAP32[$13 >> 2] = $AsyncRetVal; //@line 13901
   sp = STACKTOP; //@line 13902
   return;
  }
  ___async_unwind = 0; //@line 13905
  HEAP32[$ReallocAsyncCtx7 >> 2] = 44; //@line 13906
  $10 = $ReallocAsyncCtx7 + 4 | 0; //@line 13907
  HEAP32[$10 >> 2] = $2; //@line 13908
  $11 = $ReallocAsyncCtx7 + 8 | 0; //@line 13909
  HEAP32[$11 >> 2] = $4; //@line 13910
  $12 = $ReallocAsyncCtx7 + 12 | 0; //@line 13911
  HEAP32[$12 >> 2] = $6; //@line 13912
  $13 = $ReallocAsyncCtx7 + 16 | 0; //@line 13913
  HEAP32[$13 >> 2] = $AsyncRetVal; //@line 13914
  sp = STACKTOP; //@line 13915
  return;
 }
 $15 = HEAP32[$AsyncRetVal + 4 >> 2] | 0; //@line 13919
 if (($15 + -4 | 0) >>> 0 > 28) {
  $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 13923
  _mbed_assert_internal(1259, 1261, 47); //@line 13924
  if (___async) {
   HEAP32[$ReallocAsyncCtx6 >> 2] = 45; //@line 13927
   $17 = $ReallocAsyncCtx6 + 4 | 0; //@line 13928
   HEAP32[$17 >> 2] = $8; //@line 13929
   $18 = $ReallocAsyncCtx6 + 8 | 0; //@line 13930
   HEAP32[$18 >> 2] = $4; //@line 13931
   $19 = $ReallocAsyncCtx6 + 12 | 0; //@line 13932
   HEAP32[$19 >> 2] = $6; //@line 13933
   $20 = $ReallocAsyncCtx6 + 16 | 0; //@line 13934
   HEAP32[$20 >> 2] = $2; //@line 13935
   sp = STACKTOP; //@line 13936
   return;
  }
  ___async_unwind = 0; //@line 13939
  HEAP32[$ReallocAsyncCtx6 >> 2] = 45; //@line 13940
  $17 = $ReallocAsyncCtx6 + 4 | 0; //@line 13941
  HEAP32[$17 >> 2] = $8; //@line 13942
  $18 = $ReallocAsyncCtx6 + 8 | 0; //@line 13943
  HEAP32[$18 >> 2] = $4; //@line 13944
  $19 = $ReallocAsyncCtx6 + 12 | 0; //@line 13945
  HEAP32[$19 >> 2] = $6; //@line 13946
  $20 = $ReallocAsyncCtx6 + 16 | 0; //@line 13947
  HEAP32[$20 >> 2] = $2; //@line 13948
  sp = STACKTOP; //@line 13949
  return;
 } else {
  $22 = 7 << $15 + -4; //@line 13953
  $23 = ___muldi3($22 | 0, 0, 1e6, 0) | 0; //@line 13954
  $24 = tempRet0; //@line 13955
  $25 = _i64Add($8 | 0, 0, -1, -1) | 0; //@line 13956
  $27 = _i64Add($25 | 0, tempRet0 | 0, $23 | 0, $24 | 0) | 0; //@line 13958
  $29 = ___udivdi3($27 | 0, tempRet0 | 0, $8 | 0, 0) | 0; //@line 13960
  $30 = tempRet0; //@line 13961
  $31 = HEAP32[$4 >> 2] | 0; //@line 13962
  HEAP32[$31 >> 2] = 0; //@line 13963
  HEAP32[$31 + 4 >> 2] = 0; //@line 13965
  $35 = HEAP32[(HEAP32[$6 >> 2] | 0) + 4 >> 2] | 0; //@line 13968
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 13969
  $36 = FUNCTION_TABLE_i[$35 & 3]() | 0; //@line 13970
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 13973
   $37 = $ReallocAsyncCtx3 + 4 | 0; //@line 13974
   HEAP32[$37 >> 2] = $4; //@line 13975
   $38 = $ReallocAsyncCtx3 + 8 | 0; //@line 13976
   HEAP32[$38 >> 2] = $8; //@line 13977
   $39 = $ReallocAsyncCtx3 + 12 | 0; //@line 13978
   HEAP32[$39 >> 2] = $15; //@line 13979
   $40 = $ReallocAsyncCtx3 + 16 | 0; //@line 13980
   HEAP32[$40 >> 2] = $22; //@line 13981
   $41 = $ReallocAsyncCtx3 + 24 | 0; //@line 13982
   $42 = $41; //@line 13983
   $43 = $42; //@line 13984
   HEAP32[$43 >> 2] = $29; //@line 13985
   $44 = $42 + 4 | 0; //@line 13986
   $45 = $44; //@line 13987
   HEAP32[$45 >> 2] = $30; //@line 13988
   $46 = $ReallocAsyncCtx3 + 32 | 0; //@line 13989
   HEAP32[$46 >> 2] = $6; //@line 13990
   $47 = $ReallocAsyncCtx3 + 36 | 0; //@line 13991
   HEAP32[$47 >> 2] = $2; //@line 13992
   sp = STACKTOP; //@line 13993
   return;
  }
  HEAP32[___async_retval >> 2] = $36; //@line 13997
  ___async_unwind = 0; //@line 13998
  HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 13999
  $37 = $ReallocAsyncCtx3 + 4 | 0; //@line 14000
  HEAP32[$37 >> 2] = $4; //@line 14001
  $38 = $ReallocAsyncCtx3 + 8 | 0; //@line 14002
  HEAP32[$38 >> 2] = $8; //@line 14003
  $39 = $ReallocAsyncCtx3 + 12 | 0; //@line 14004
  HEAP32[$39 >> 2] = $15; //@line 14005
  $40 = $ReallocAsyncCtx3 + 16 | 0; //@line 14006
  HEAP32[$40 >> 2] = $22; //@line 14007
  $41 = $ReallocAsyncCtx3 + 24 | 0; //@line 14008
  $42 = $41; //@line 14009
  $43 = $42; //@line 14010
  HEAP32[$43 >> 2] = $29; //@line 14011
  $44 = $42 + 4 | 0; //@line 14012
  $45 = $44; //@line 14013
  HEAP32[$45 >> 2] = $30; //@line 14014
  $46 = $ReallocAsyncCtx3 + 32 | 0; //@line 14015
  HEAP32[$46 >> 2] = $6; //@line 14016
  $47 = $ReallocAsyncCtx3 + 36 | 0; //@line 14017
  HEAP32[$47 >> 2] = $2; //@line 14018
  sp = STACKTOP; //@line 14019
  return;
 }
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
     FUNCTION_TABLE_vi[$12 & 255]($6); //@line 257
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 27; //@line 260
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
      HEAP32[$AsyncCtx2 >> 2] = 28; //@line 296
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
    FUNCTION_TABLE_vi[$33 & 255]($27); //@line 331
    if (___async) {
     HEAP32[$AsyncCtx5 >> 2] = 29; //@line 334
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
      HEAP32[$AsyncCtx8 >> 2] = 30; //@line 359
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
     FUNCTION_TABLE_vi[$49 & 255]($2); //@line 382
     if (___async) {
      HEAP32[$AsyncCtx11 >> 2] = 31; //@line 385
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
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = +$2;
 var $13 = 0, $14 = 0, $15 = 0.0, $16 = 0, $17 = 0, $18 = 0, $20 = 0, $21 = 0, $24 = 0, $3 = 0, $32 = 0, $36 = 0, $39 = 0, $4 = 0, $44 = 0, $5 = 0, $50 = 0, $51 = 0, $54 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 2441
 STACKTOP = STACKTOP + 16 | 0; //@line 2442
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2442
 $3 = sp; //@line 2443
 $4 = $1 + 12 | 0; //@line 2444
 $5 = HEAP32[$4 >> 2] | 0; //@line 2445
 do {
  if (!$5) {
   $14 = 0; //@line 2449
  } else {
   $8 = HEAP32[$5 + 4 >> 2] | 0; //@line 2452
   $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 2453
   FUNCTION_TABLE_vii[$8 & 3]($3, $1); //@line 2454
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 99; //@line 2457
    HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 2459
    HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 2461
    HEAPF32[$AsyncCtx + 12 >> 2] = $2; //@line 2463
    HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 2465
    sp = STACKTOP; //@line 2466
    STACKTOP = sp; //@line 2467
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 2469
    $14 = HEAP32[$4 >> 2] | 0; //@line 2471
    break;
   }
  }
 } while (0);
 $13 = $3 + 12 | 0; //@line 2476
 HEAP32[$13 >> 2] = $14; //@line 2477
 $15 = $2 * 1.0e6; //@line 2478
 $16 = ~~$15 >>> 0; //@line 2479
 $17 = +Math_abs($15) >= 1.0 ? $15 > 0.0 ? ~~+Math_min(+Math_floor($15 / 4294967296.0), 4294967295.0) >>> 0 : ~~+Math_ceil(($15 - +(~~$15 >>> 0)) / 4294967296.0) >>> 0 : 0; //@line 2480
 $18 = $0 + 40 | 0; //@line 2481
 if (($18 | 0) != ($3 | 0)) {
  $20 = $0 + 52 | 0; //@line 2484
  $21 = HEAP32[$20 >> 2] | 0; //@line 2485
  do {
   if ($21 | 0) {
    $24 = HEAP32[$21 + 8 >> 2] | 0; //@line 2490
    $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 2491
    FUNCTION_TABLE_vi[$24 & 255]($18); //@line 2492
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 100; //@line 2495
     HEAP32[$AsyncCtx3 + 4 >> 2] = $13; //@line 2497
     HEAP32[$AsyncCtx3 + 8 >> 2] = $20; //@line 2499
     HEAP32[$AsyncCtx3 + 12 >> 2] = $18; //@line 2501
     HEAP32[$AsyncCtx3 + 16 >> 2] = $3; //@line 2503
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 2505
     HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 2507
     $32 = $AsyncCtx3 + 32 | 0; //@line 2509
     HEAP32[$32 >> 2] = $16; //@line 2511
     HEAP32[$32 + 4 >> 2] = $17; //@line 2514
     sp = STACKTOP; //@line 2515
     STACKTOP = sp; //@line 2516
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2518
     break;
    }
   }
  } while (0);
  $36 = HEAP32[$13 >> 2] | 0; //@line 2523
  do {
   if (!$36) {
    $50 = 0; //@line 2527
   } else {
    $39 = HEAP32[$36 + 4 >> 2] | 0; //@line 2530
    $AsyncCtx6 = _emscripten_alloc_async_context(32, sp) | 0; //@line 2531
    FUNCTION_TABLE_vii[$39 & 3]($18, $3); //@line 2532
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 101; //@line 2535
     HEAP32[$AsyncCtx6 + 4 >> 2] = $13; //@line 2537
     HEAP32[$AsyncCtx6 + 8 >> 2] = $20; //@line 2539
     HEAP32[$AsyncCtx6 + 12 >> 2] = $0; //@line 2541
     $44 = $AsyncCtx6 + 16 | 0; //@line 2543
     HEAP32[$44 >> 2] = $16; //@line 2545
     HEAP32[$44 + 4 >> 2] = $17; //@line 2548
     HEAP32[$AsyncCtx6 + 24 >> 2] = $13; //@line 2550
     HEAP32[$AsyncCtx6 + 28 >> 2] = $3; //@line 2552
     sp = STACKTOP; //@line 2553
     STACKTOP = sp; //@line 2554
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 2556
     $50 = HEAP32[$13 >> 2] | 0; //@line 2558
     break;
    }
   }
  } while (0);
  HEAP32[$20 >> 2] = $50; //@line 2563
 }
 __ZN4mbed6Ticker5setupEy($0, $16, $17); //@line 2565
 $51 = HEAP32[$13 >> 2] | 0; //@line 2566
 if (!$51) {
  STACKTOP = sp; //@line 2569
  return;
 }
 $54 = HEAP32[$51 + 8 >> 2] | 0; //@line 2572
 $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2573
 FUNCTION_TABLE_vi[$54 & 255]($3); //@line 2574
 if (___async) {
  HEAP32[$AsyncCtx10 >> 2] = 102; //@line 2577
  sp = STACKTOP; //@line 2578
  STACKTOP = sp; //@line 2579
  return;
 }
 _emscripten_free_async_context($AsyncCtx10 | 0); //@line 2581
 STACKTOP = sp; //@line 2582
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_20($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13154
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13156
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13158
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13160
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13162
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13164
 $12 = HEAP8[$0 + 24 >> 0] & 1; //@line 13167
 $14 = HEAP8[$0 + 25 >> 0] & 1; //@line 13170
 $16 = HEAP32[$0 + 28 >> 2] | 0; //@line 13172
 $18 = HEAP32[$0 + 32 >> 2] | 0; //@line 13174
 $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 13176
 $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 13178
 $24 = HEAP32[$0 + 44 >> 2] | 0; //@line 13180
 $26 = HEAP32[$0 + 48 >> 2] | 0; //@line 13182
 $28 = HEAP8[$0 + 52 >> 0] & 1; //@line 13185
 L2 : do {
  if (!(HEAP8[$2 >> 0] | 0)) {
   do {
    if (!(HEAP8[$22 >> 0] | 0)) {
     $$182$off0 = $12; //@line 13194
     $$186$off0 = $14; //@line 13194
    } else {
     if (!(HEAP8[$24 >> 0] | 0)) {
      if (!(HEAP32[$18 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $14; //@line 13203
       $$283$off0 = 1; //@line 13203
       label = 13; //@line 13204
       break L2;
      } else {
       $$182$off0 = 1; //@line 13207
       $$186$off0 = $14; //@line 13207
       break;
      }
     }
     if ((HEAP32[$4 >> 2] | 0) == 1) {
      label = 18; //@line 13214
      break L2;
     }
     if (!(HEAP32[$18 >> 2] & 2)) {
      label = 18; //@line 13221
      break L2;
     } else {
      $$182$off0 = 1; //@line 13224
      $$186$off0 = 1; //@line 13224
     }
    }
   } while (0);
   $30 = $16 + 8 | 0; //@line 13228
   if ($30 >>> 0 < $26 >>> 0) {
    HEAP8[$24 >> 0] = 0; //@line 13231
    HEAP8[$22 >> 0] = 0; //@line 13232
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 13233
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $10, $6, $6, 1, $28); //@line 13234
    if (!___async) {
     ___async_unwind = 0; //@line 13237
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 130; //@line 13239
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 13241
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 13243
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 13245
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 13247
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 13249
    HEAP8[$ReallocAsyncCtx5 + 24 >> 0] = $$182$off0 & 1; //@line 13252
    HEAP8[$ReallocAsyncCtx5 + 25 >> 0] = $$186$off0 & 1; //@line 13255
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $30; //@line 13257
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $18; //@line 13259
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $20; //@line 13261
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $22; //@line 13263
    HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $24; //@line 13265
    HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $26; //@line 13267
    HEAP8[$ReallocAsyncCtx5 + 52 >> 0] = $28 & 1; //@line 13270
    sp = STACKTOP; //@line 13271
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 13274
    $$283$off0 = $$182$off0; //@line 13274
    label = 13; //@line 13275
   }
  } else {
   $$085$off0$reg2mem$0 = $14; //@line 13278
   $$283$off0 = $12; //@line 13278
   label = 13; //@line 13279
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$8 >> 2] = $6; //@line 13285
    $59 = $10 + 40 | 0; //@line 13286
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 13289
    if ((HEAP32[$10 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$4 >> 2] | 0) == 2) {
      HEAP8[$2 >> 0] = 1; //@line 13297
      if ($$283$off0) {
       label = 18; //@line 13299
       break;
      } else {
       $67 = 4; //@line 13302
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 13309
   } else {
    $67 = 4; //@line 13311
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 13316
 }
 HEAP32[$20 >> 2] = $67; //@line 13318
 return;
}
function _initialize__async_cb_34($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $25 = 0, $26 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $6 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 266
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 268
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 270
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 272
 $10 = HEAP32[(HEAP32[$0 + 16 >> 2] | 0) + 4 >> 2] | 0; //@line 276
 if (($10 + -4 | 0) >>> 0 > 28) {
  $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 280
  _mbed_assert_internal(1259, 1261, 47); //@line 281
  if (___async) {
   HEAP32[$ReallocAsyncCtx6 >> 2] = 45; //@line 284
   $12 = $ReallocAsyncCtx6 + 4 | 0; //@line 285
   HEAP32[$12 >> 2] = 1e6; //@line 286
   $13 = $ReallocAsyncCtx6 + 8 | 0; //@line 287
   HEAP32[$13 >> 2] = $4; //@line 288
   $14 = $ReallocAsyncCtx6 + 12 | 0; //@line 289
   HEAP32[$14 >> 2] = $6; //@line 290
   $15 = $ReallocAsyncCtx6 + 16 | 0; //@line 291
   HEAP32[$15 >> 2] = $2; //@line 292
   sp = STACKTOP; //@line 293
   return;
  }
  ___async_unwind = 0; //@line 296
  HEAP32[$ReallocAsyncCtx6 >> 2] = 45; //@line 297
  $12 = $ReallocAsyncCtx6 + 4 | 0; //@line 298
  HEAP32[$12 >> 2] = 1e6; //@line 299
  $13 = $ReallocAsyncCtx6 + 8 | 0; //@line 300
  HEAP32[$13 >> 2] = $4; //@line 301
  $14 = $ReallocAsyncCtx6 + 12 | 0; //@line 302
  HEAP32[$14 >> 2] = $6; //@line 303
  $15 = $ReallocAsyncCtx6 + 16 | 0; //@line 304
  HEAP32[$15 >> 2] = $2; //@line 305
  sp = STACKTOP; //@line 306
  return;
 } else {
  $17 = 7 << $10 + -4; //@line 310
  $18 = ___muldi3($17 | 0, 0, 1e6, 0) | 0; //@line 311
  $19 = tempRet0; //@line 312
  $20 = _i64Add(1e6, 0, -1, -1) | 0; //@line 313
  $22 = _i64Add($20 | 0, tempRet0 | 0, $18 | 0, $19 | 0) | 0; //@line 315
  $24 = ___udivdi3($22 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 317
  $25 = tempRet0; //@line 318
  $26 = HEAP32[$4 >> 2] | 0; //@line 319
  HEAP32[$26 >> 2] = 0; //@line 320
  HEAP32[$26 + 4 >> 2] = 0; //@line 322
  $30 = HEAP32[(HEAP32[$6 >> 2] | 0) + 4 >> 2] | 0; //@line 325
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 326
  $31 = FUNCTION_TABLE_i[$30 & 3]() | 0; //@line 327
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 330
   $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 331
   HEAP32[$32 >> 2] = $4; //@line 332
   $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 333
   HEAP32[$33 >> 2] = 1e6; //@line 334
   $34 = $ReallocAsyncCtx3 + 12 | 0; //@line 335
   HEAP32[$34 >> 2] = $10; //@line 336
   $35 = $ReallocAsyncCtx3 + 16 | 0; //@line 337
   HEAP32[$35 >> 2] = $17; //@line 338
   $36 = $ReallocAsyncCtx3 + 24 | 0; //@line 339
   $37 = $36; //@line 340
   $38 = $37; //@line 341
   HEAP32[$38 >> 2] = $24; //@line 342
   $39 = $37 + 4 | 0; //@line 343
   $40 = $39; //@line 344
   HEAP32[$40 >> 2] = $25; //@line 345
   $41 = $ReallocAsyncCtx3 + 32 | 0; //@line 346
   HEAP32[$41 >> 2] = $6; //@line 347
   $42 = $ReallocAsyncCtx3 + 36 | 0; //@line 348
   HEAP32[$42 >> 2] = $2; //@line 349
   sp = STACKTOP; //@line 350
   return;
  }
  HEAP32[___async_retval >> 2] = $31; //@line 354
  ___async_unwind = 0; //@line 355
  HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 356
  $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 357
  HEAP32[$32 >> 2] = $4; //@line 358
  $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 359
  HEAP32[$33 >> 2] = 1e6; //@line 360
  $34 = $ReallocAsyncCtx3 + 12 | 0; //@line 361
  HEAP32[$34 >> 2] = $10; //@line 362
  $35 = $ReallocAsyncCtx3 + 16 | 0; //@line 363
  HEAP32[$35 >> 2] = $17; //@line 364
  $36 = $ReallocAsyncCtx3 + 24 | 0; //@line 365
  $37 = $36; //@line 366
  $38 = $37; //@line 367
  HEAP32[$38 >> 2] = $24; //@line 368
  $39 = $37 + 4 | 0; //@line 369
  $40 = $39; //@line 370
  HEAP32[$40 >> 2] = $25; //@line 371
  $41 = $ReallocAsyncCtx3 + 32 | 0; //@line 372
  HEAP32[$41 >> 2] = $6; //@line 373
  $42 = $ReallocAsyncCtx3 + 36 | 0; //@line 374
  HEAP32[$42 >> 2] = $2; //@line 375
  sp = STACKTOP; //@line 376
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_19($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 12998
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13000
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13002
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13004
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13006
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 13009
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13011
 $15 = $12 + 24 | 0; //@line 13014
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$12 + 8 >> 2] | 0; //@line 13019
   if (!($18 & 2)) {
    $21 = $4 + 36 | 0; //@line 13023
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $4 + 54 | 0; //@line 13030
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 13041
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 13042
      if (!___async) {
       ___async_unwind = 0; //@line 13045
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 134; //@line 13047
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 13049
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $2; //@line 13051
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 13053
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 13055
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $4; //@line 13057
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $6; //@line 13059
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $8; //@line 13061
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $10 & 1; //@line 13064
      sp = STACKTOP; //@line 13065
      return;
     }
     $36 = $4 + 24 | 0; //@line 13068
     $37 = $4 + 54 | 0; //@line 13069
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 13084
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 13085
     if (!___async) {
      ___async_unwind = 0; //@line 13088
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 133; //@line 13090
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 13092
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $2; //@line 13094
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 13096
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 13098
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 13100
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $4; //@line 13102
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $6; //@line 13104
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $8; //@line 13106
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $10 & 1; //@line 13109
     sp = STACKTOP; //@line 13110
     return;
    }
   }
   $24 = $4 + 54 | 0; //@line 13114
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 13118
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 13119
    if (!___async) {
     ___async_unwind = 0; //@line 13122
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 132; //@line 13124
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 13126
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $2; //@line 13128
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 13130
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $4; //@line 13132
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $6; //@line 13134
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $8; //@line 13136
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $10 & 1; //@line 13139
    sp = STACKTOP; //@line 13140
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
 sp = STACKTOP; //@line 10737
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10742
 } else {
  $9 = $1 + 52 | 0; //@line 10744
  $10 = HEAP8[$9 >> 0] | 0; //@line 10745
  $11 = $1 + 53 | 0; //@line 10746
  $12 = HEAP8[$11 >> 0] | 0; //@line 10747
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 10750
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 10751
  HEAP8[$9 >> 0] = 0; //@line 10752
  HEAP8[$11 >> 0] = 0; //@line 10753
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 10754
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 10755
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 128; //@line 10758
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 10760
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 10762
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 10764
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 10766
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 10768
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 10770
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 10772
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 10774
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 10776
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 10778
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 10781
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 10783
   sp = STACKTOP; //@line 10784
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10787
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 10792
    $32 = $0 + 8 | 0; //@line 10793
    $33 = $1 + 54 | 0; //@line 10794
    $$0 = $0 + 24 | 0; //@line 10795
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
     HEAP8[$9 >> 0] = 0; //@line 10828
     HEAP8[$11 >> 0] = 0; //@line 10829
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 10830
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 10831
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 10836
     $62 = $$0 + 8 | 0; //@line 10837
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 10840
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 129; //@line 10845
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 10847
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 10849
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 10851
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 10853
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 10855
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 10857
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 10859
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 10861
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 10863
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 10865
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 10867
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 10869
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 10871
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 10874
    sp = STACKTOP; //@line 10875
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 10879
  HEAP8[$11 >> 0] = $12; //@line 10880
 }
 return;
}
function _initialize__async_cb_31($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $23 = 0, $24 = 0, $25 = 0, $27 = 0, $28 = 0, $31 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $48 = 0, $49 = 0, $50 = 0, $52 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $62 = 0, $64 = 0, $70 = 0, $71 = 0, $72 = 0, $81 = 0, $82 = 0, $83 = 0, $85 = 0, $89 = 0, $95 = 0, $96 = 0, $97 = 0, $99 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 18
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 20
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 22
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 24
 if (($AsyncRetVal | 0) != (HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 32 >> 2] | 0)) {
  $23 = $AsyncRetVal - (HEAP32[$6 >> 2] | 0) & HEAP32[HEAP32[$0 + 16 >> 2] >> 2]; //@line 33
  HEAP32[$6 >> 2] = $AsyncRetVal; //@line 34
  $24 = HEAP32[$10 >> 2] | 0; //@line 35
  L4 : do {
   if (($24 | 0) < 1e6) {
    switch ($24 | 0) {
    case 32768:
     {
      break;
     }
    default:
     {
      label = 6; //@line 44
      break L4;
     }
    }
    $25 = ___muldi3($23 | 0, 0, 1e6, 0) | 0; //@line 48
    $27 = _bitshift64Lshr($25 | 0, tempRet0 | 0, 15) | 0; //@line 50
    $28 = tempRet0; //@line 51
    $31 = $12; //@line 54
    $37 = _i64Add(HEAP32[$31 >> 2] | 0, HEAP32[$31 + 4 >> 2] | 0, $23 * 1e6 & 32704 | 0, 0) | 0; //@line 60
    $38 = tempRet0; //@line 61
    $39 = $12; //@line 62
    HEAP32[$39 >> 2] = $37; //@line 64
    HEAP32[$39 + 4 >> 2] = $38; //@line 67
    if ($38 >>> 0 < 0 | ($38 | 0) == 0 & $37 >>> 0 < 32768) {
     $95 = $27; //@line 74
     $96 = $28; //@line 74
    } else {
     $48 = _i64Add($27 | 0, $28 | 0, 1, 0) | 0; //@line 76
     $49 = tempRet0; //@line 77
     $50 = _i64Add($37 | 0, $38 | 0, -32768, -1) | 0; //@line 78
     $52 = $12; //@line 80
     HEAP32[$52 >> 2] = $50; //@line 82
     HEAP32[$52 + 4 >> 2] = tempRet0; //@line 85
     $95 = $48; //@line 86
     $96 = $49; //@line 86
    }
   } else {
    switch ($24 | 0) {
    case 1e6:
     {
      $95 = $23; //@line 91
      $96 = 0; //@line 91
      break;
     }
    default:
     {
      label = 6; //@line 95
     }
    }
   }
  } while (0);
  if ((label | 0) == 6) {
   $56 = ___muldi3($23 | 0, 0, 1e6, 0) | 0; //@line 101
   $57 = tempRet0; //@line 102
   $58 = ___udivdi3($56 | 0, $57 | 0, $24 | 0, 0) | 0; //@line 103
   $59 = tempRet0; //@line 104
   $60 = ___muldi3($58 | 0, $59 | 0, $24 | 0, 0) | 0; //@line 105
   $62 = _i64Subtract($56 | 0, $57 | 0, $60 | 0, tempRet0 | 0) | 0; //@line 107
   $64 = $12; //@line 109
   $70 = _i64Add($62 | 0, tempRet0 | 0, HEAP32[$64 >> 2] | 0, HEAP32[$64 + 4 >> 2] | 0) | 0; //@line 115
   $71 = tempRet0; //@line 116
   $72 = $12; //@line 117
   HEAP32[$72 >> 2] = $70; //@line 119
   HEAP32[$72 + 4 >> 2] = $71; //@line 122
   if ($71 >>> 0 < 0 | ($71 | 0) == 0 & $70 >>> 0 < $24 >>> 0) {
    $95 = $58; //@line 129
    $96 = $59; //@line 129
   } else {
    $81 = _i64Add($58 | 0, $59 | 0, 1, 0) | 0; //@line 131
    $82 = tempRet0; //@line 132
    $83 = _i64Subtract($70 | 0, $71 | 0, $24 | 0, 0) | 0; //@line 133
    $85 = $12; //@line 135
    HEAP32[$85 >> 2] = $83; //@line 137
    HEAP32[$85 + 4 >> 2] = tempRet0; //@line 140
    $95 = $81; //@line 141
    $96 = $82; //@line 141
   }
  }
  $89 = $14; //@line 144
  $97 = _i64Add(HEAP32[$89 >> 2] | 0, HEAP32[$89 + 4 >> 2] | 0, $95 | 0, $96 | 0) | 0; //@line 150
  $99 = $14; //@line 152
  HEAP32[$99 >> 2] = $97; //@line 154
  HEAP32[$99 + 4 >> 2] = tempRet0; //@line 157
 }
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(4) | 0; //@line 159
 _schedule_interrupt($4); //@line 160
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 48; //@line 163
  sp = STACKTOP; //@line 164
  return;
 }
 ___async_unwind = 0; //@line 167
 HEAP32[$ReallocAsyncCtx5 >> 2] = 48; //@line 168
 sp = STACKTOP; //@line 169
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7954
      $10 = HEAP32[$9 >> 2] | 0; //@line 7955
      HEAP32[$2 >> 2] = $9 + 4; //@line 7957
      HEAP32[$0 >> 2] = $10; //@line 7958
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7974
      $17 = HEAP32[$16 >> 2] | 0; //@line 7975
      HEAP32[$2 >> 2] = $16 + 4; //@line 7977
      $20 = $0; //@line 7980
      HEAP32[$20 >> 2] = $17; //@line 7982
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 7985
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8001
      $30 = HEAP32[$29 >> 2] | 0; //@line 8002
      HEAP32[$2 >> 2] = $29 + 4; //@line 8004
      $31 = $0; //@line 8005
      HEAP32[$31 >> 2] = $30; //@line 8007
      HEAP32[$31 + 4 >> 2] = 0; //@line 8010
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 8026
      $41 = $40; //@line 8027
      $43 = HEAP32[$41 >> 2] | 0; //@line 8029
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 8032
      HEAP32[$2 >> 2] = $40 + 8; //@line 8034
      $47 = $0; //@line 8035
      HEAP32[$47 >> 2] = $43; //@line 8037
      HEAP32[$47 + 4 >> 2] = $46; //@line 8040
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8056
      $57 = HEAP32[$56 >> 2] | 0; //@line 8057
      HEAP32[$2 >> 2] = $56 + 4; //@line 8059
      $59 = ($57 & 65535) << 16 >> 16; //@line 8061
      $62 = $0; //@line 8064
      HEAP32[$62 >> 2] = $59; //@line 8066
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 8069
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8085
      $72 = HEAP32[$71 >> 2] | 0; //@line 8086
      HEAP32[$2 >> 2] = $71 + 4; //@line 8088
      $73 = $0; //@line 8090
      HEAP32[$73 >> 2] = $72 & 65535; //@line 8092
      HEAP32[$73 + 4 >> 2] = 0; //@line 8095
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8111
      $83 = HEAP32[$82 >> 2] | 0; //@line 8112
      HEAP32[$2 >> 2] = $82 + 4; //@line 8114
      $85 = ($83 & 255) << 24 >> 24; //@line 8116
      $88 = $0; //@line 8119
      HEAP32[$88 >> 2] = $85; //@line 8121
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 8124
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8140
      $98 = HEAP32[$97 >> 2] | 0; //@line 8141
      HEAP32[$2 >> 2] = $97 + 4; //@line 8143
      $99 = $0; //@line 8145
      HEAP32[$99 >> 2] = $98 & 255; //@line 8147
      HEAP32[$99 + 4 >> 2] = 0; //@line 8150
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 8166
      $109 = +HEAPF64[$108 >> 3]; //@line 8167
      HEAP32[$2 >> 2] = $108 + 8; //@line 8169
      HEAPF64[$0 >> 3] = $109; //@line 8170
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 8186
      $116 = +HEAPF64[$115 >> 3]; //@line 8187
      HEAP32[$2 >> 2] = $115 + 8; //@line 8189
      HEAPF64[$0 >> 3] = $116; //@line 8190
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
 sp = STACKTOP; //@line 6854
 STACKTOP = STACKTOP + 224 | 0; //@line 6855
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 6855
 $3 = sp + 120 | 0; //@line 6856
 $4 = sp + 80 | 0; //@line 6857
 $5 = sp; //@line 6858
 $6 = sp + 136 | 0; //@line 6859
 dest = $4; //@line 6860
 stop = dest + 40 | 0; //@line 6860
 do {
  HEAP32[dest >> 2] = 0; //@line 6860
  dest = dest + 4 | 0; //@line 6860
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 6862
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 6866
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 6873
  } else {
   $43 = 0; //@line 6875
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 6877
  $14 = $13 & 32; //@line 6878
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 6884
  }
  $19 = $0 + 48 | 0; //@line 6886
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 6891
    $24 = HEAP32[$23 >> 2] | 0; //@line 6892
    HEAP32[$23 >> 2] = $6; //@line 6893
    $25 = $0 + 28 | 0; //@line 6894
    HEAP32[$25 >> 2] = $6; //@line 6895
    $26 = $0 + 20 | 0; //@line 6896
    HEAP32[$26 >> 2] = $6; //@line 6897
    HEAP32[$19 >> 2] = 80; //@line 6898
    $28 = $0 + 16 | 0; //@line 6900
    HEAP32[$28 >> 2] = $6 + 80; //@line 6901
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6902
    if (!$24) {
     $$1 = $29; //@line 6905
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 6908
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 6909
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 6910
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 110; //@line 6913
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 6915
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 6917
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 6919
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 6921
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 6923
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 6925
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 6927
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 6929
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 6931
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 6933
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 6935
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 6937
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 6939
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 6941
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 6943
      sp = STACKTOP; //@line 6944
      STACKTOP = sp; //@line 6945
      return 0; //@line 6945
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 6947
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 6950
      HEAP32[$23 >> 2] = $24; //@line 6951
      HEAP32[$19 >> 2] = 0; //@line 6952
      HEAP32[$28 >> 2] = 0; //@line 6953
      HEAP32[$25 >> 2] = 0; //@line 6954
      HEAP32[$26 >> 2] = 0; //@line 6955
      $$1 = $$; //@line 6956
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6962
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 6965
  HEAP32[$0 >> 2] = $51 | $14; //@line 6970
  if ($43 | 0) {
   ___unlockfile($0); //@line 6973
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 6975
 }
 STACKTOP = sp; //@line 6977
 return $$0 | 0; //@line 6977
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 10272
 STACKTOP = STACKTOP + 64 | 0; //@line 10273
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 10273
 $4 = sp; //@line 10274
 $5 = HEAP32[$0 >> 2] | 0; //@line 10275
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 10278
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 10280
 HEAP32[$4 >> 2] = $2; //@line 10281
 HEAP32[$4 + 4 >> 2] = $0; //@line 10283
 HEAP32[$4 + 8 >> 2] = $1; //@line 10285
 HEAP32[$4 + 12 >> 2] = $3; //@line 10287
 $14 = $4 + 16 | 0; //@line 10288
 $15 = $4 + 20 | 0; //@line 10289
 $16 = $4 + 24 | 0; //@line 10290
 $17 = $4 + 28 | 0; //@line 10291
 $18 = $4 + 32 | 0; //@line 10292
 $19 = $4 + 40 | 0; //@line 10293
 dest = $14; //@line 10294
 stop = dest + 36 | 0; //@line 10294
 do {
  HEAP32[dest >> 2] = 0; //@line 10294
  dest = dest + 4 | 0; //@line 10294
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 10294
 HEAP8[$14 + 38 >> 0] = 0; //@line 10294
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 10299
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10302
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10303
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 10304
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 120; //@line 10307
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 10309
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 10311
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 10313
    sp = STACKTOP; //@line 10314
    STACKTOP = sp; //@line 10315
    return 0; //@line 10315
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10317
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 10321
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 10325
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 10328
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 10329
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 10330
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 121; //@line 10333
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 10335
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 10337
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 10339
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 10341
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 10343
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 10345
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 10347
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 10349
    sp = STACKTOP; //@line 10350
    STACKTOP = sp; //@line 10351
    return 0; //@line 10351
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10353
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 10367
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 10375
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 10391
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 10396
  }
 } while (0);
 STACKTOP = sp; //@line 10399
 return $$0 | 0; //@line 10399
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 6726
 $7 = ($2 | 0) != 0; //@line 6730
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 6734
   $$03555 = $0; //@line 6735
   $$03654 = $2; //@line 6735
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 6740
     $$036$lcssa64 = $$03654; //@line 6740
     label = 6; //@line 6741
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 6744
    $12 = $$03654 + -1 | 0; //@line 6745
    $16 = ($12 | 0) != 0; //@line 6749
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 6752
     $$03654 = $12; //@line 6752
    } else {
     $$035$lcssa = $11; //@line 6754
     $$036$lcssa = $12; //@line 6754
     $$lcssa = $16; //@line 6754
     label = 5; //@line 6755
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 6760
   $$036$lcssa = $2; //@line 6760
   $$lcssa = $7; //@line 6760
   label = 5; //@line 6761
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 6766
   $$036$lcssa64 = $$036$lcssa; //@line 6766
   label = 6; //@line 6767
  } else {
   $$2 = $$035$lcssa; //@line 6769
   $$3 = 0; //@line 6769
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 6775
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 6778
    $$3 = $$036$lcssa64; //@line 6778
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 6780
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 6784
      $$13745 = $$036$lcssa64; //@line 6784
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 6787
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 6796
       $30 = $$13745 + -4 | 0; //@line 6797
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 6800
        $$13745 = $30; //@line 6800
       } else {
        $$0$lcssa = $29; //@line 6802
        $$137$lcssa = $30; //@line 6802
        label = 11; //@line 6803
        break L11;
       }
      }
      $$140 = $$046; //@line 6807
      $$23839 = $$13745; //@line 6807
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 6809
      $$137$lcssa = $$036$lcssa64; //@line 6809
      label = 11; //@line 6810
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 6816
      $$3 = 0; //@line 6816
      break;
     } else {
      $$140 = $$0$lcssa; //@line 6819
      $$23839 = $$137$lcssa; //@line 6819
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 6826
      $$3 = $$23839; //@line 6826
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 6829
     $$23839 = $$23839 + -1 | 0; //@line 6830
     if (!$$23839) {
      $$2 = $35; //@line 6833
      $$3 = 0; //@line 6833
      break;
     } else {
      $$140 = $35; //@line 6836
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 6844
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 6497
 do {
  if (!$0) {
   do {
    if (!(HEAP32[179] | 0)) {
     $34 = 0; //@line 6505
    } else {
     $12 = HEAP32[179] | 0; //@line 6507
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 6508
     $13 = _fflush($12) | 0; //@line 6509
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 106; //@line 6512
      sp = STACKTOP; //@line 6513
      return 0; //@line 6514
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 6516
      $34 = $13; //@line 6517
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 6523
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 6527
    } else {
     $$02327 = $$02325; //@line 6529
     $$02426 = $34; //@line 6529
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 6536
      } else {
       $28 = 0; //@line 6538
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 6546
       $25 = ___fflush_unlocked($$02327) | 0; //@line 6547
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 6552
       $$1 = $25 | $$02426; //@line 6554
      } else {
       $$1 = $$02426; //@line 6556
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 6560
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 6563
      if (!$$023) {
       $$024$lcssa = $$1; //@line 6566
       break L9;
      } else {
       $$02327 = $$023; //@line 6569
       $$02426 = $$1; //@line 6569
      }
     }
     HEAP32[$AsyncCtx >> 2] = 107; //@line 6572
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 6574
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 6576
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 6578
     sp = STACKTOP; //@line 6579
     return 0; //@line 6580
    }
   } while (0);
   ___ofl_unlock(); //@line 6583
   $$0 = $$024$lcssa; //@line 6584
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 6590
    $5 = ___fflush_unlocked($0) | 0; //@line 6591
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 104; //@line 6594
     sp = STACKTOP; //@line 6595
     return 0; //@line 6596
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 6598
     $$0 = $5; //@line 6599
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 6604
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 6605
   $7 = ___fflush_unlocked($0) | 0; //@line 6606
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 105; //@line 6609
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 6612
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 6614
    sp = STACKTOP; //@line 6615
    return 0; //@line 6616
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6618
   if ($phitmp) {
    $$0 = $7; //@line 6620
   } else {
    ___unlockfile($0); //@line 6622
    $$0 = $7; //@line 6623
   }
  }
 } while (0);
 return $$0 | 0; //@line 6627
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10454
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10460
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 10466
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 10469
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 10470
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 10471
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 124; //@line 10474
     sp = STACKTOP; //@line 10475
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10478
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 10486
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 10491
     $19 = $1 + 44 | 0; //@line 10492
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 10498
     HEAP8[$22 >> 0] = 0; //@line 10499
     $23 = $1 + 53 | 0; //@line 10500
     HEAP8[$23 >> 0] = 0; //@line 10501
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 10503
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 10506
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 10507
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 10508
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 123; //@line 10511
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 10513
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10515
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 10517
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 10519
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 10521
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 10523
      sp = STACKTOP; //@line 10524
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 10527
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 10531
      label = 13; //@line 10532
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 10537
       label = 13; //@line 10538
      } else {
       $$037$off039 = 3; //@line 10540
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 10544
      $39 = $1 + 40 | 0; //@line 10545
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 10548
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 10558
        $$037$off039 = $$037$off038; //@line 10559
       } else {
        $$037$off039 = $$037$off038; //@line 10561
       }
      } else {
       $$037$off039 = $$037$off038; //@line 10564
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 10567
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 10574
   }
  }
 } while (0);
 return;
}
function _initialize__async_cb_30($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $17 = 0, $19 = 0, $2 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $28 = 0, $29 = 0, $31 = 0, $33 = 0, $36 = 0, $4 = 0, $40 = 0, $41 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 14029
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14031
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14033
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14035
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14037
 $10 = $0 + 24 | 0; //@line 14039
 $12 = HEAP32[$10 >> 2] | 0; //@line 14041
 $15 = HEAP32[$10 + 4 >> 2] | 0; //@line 14044
 $17 = HEAP32[$0 + 32 >> 2] | 0; //@line 14046
 $19 = HEAP32[$0 + 36 >> 2] | 0; //@line 14048
 $21 = HEAP32[$2 >> 2] | 0; //@line 14051
 $22 = $21 + 32 | 0; //@line 14052
 HEAP32[$22 >> 2] = HEAP32[___async_retval >> 2]; //@line 14053
 $23 = $21 + 40 | 0; //@line 14054
 $24 = $23; //@line 14055
 HEAP32[$24 >> 2] = 0; //@line 14057
 HEAP32[$24 + 4 >> 2] = 0; //@line 14060
 $28 = $21 + 8 | 0; //@line 14061
 HEAP32[$28 >> 2] = $4; //@line 14062
 $29 = _bitshift64Shl(1, 0, $6 | 0) | 0; //@line 14063
 $31 = _i64Add($29 | 0, tempRet0 | 0, -1, 0) | 0; //@line 14065
 $33 = $21 + 12 | 0; //@line 14067
 HEAP32[$33 >> 2] = $31; //@line 14068
 HEAP32[$21 + 16 >> 2] = $8; //@line 14070
 $36 = $21 + 24 | 0; //@line 14072
 HEAP32[$36 >> 2] = $12; //@line 14074
 HEAP32[$36 + 4 >> 2] = $15; //@line 14077
 $40 = $21 + 48 | 0; //@line 14078
 $41 = $40; //@line 14079
 HEAP32[$41 >> 2] = 0; //@line 14081
 HEAP32[$41 + 4 >> 2] = 0; //@line 14084
 HEAP8[$21 + 56 >> 0] = 1; //@line 14086
 $48 = HEAP32[(HEAP32[$17 >> 2] | 0) + 4 >> 2] | 0; //@line 14089
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 14090
 $49 = FUNCTION_TABLE_i[$48 & 3]() | 0; //@line 14091
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 47; //@line 14094
  $50 = $ReallocAsyncCtx4 + 4 | 0; //@line 14095
  HEAP32[$50 >> 2] = $2; //@line 14096
  $51 = $ReallocAsyncCtx4 + 8 | 0; //@line 14097
  HEAP32[$51 >> 2] = $19; //@line 14098
  $52 = $ReallocAsyncCtx4 + 12 | 0; //@line 14099
  HEAP32[$52 >> 2] = $22; //@line 14100
  $53 = $ReallocAsyncCtx4 + 16 | 0; //@line 14101
  HEAP32[$53 >> 2] = $33; //@line 14102
  $54 = $ReallocAsyncCtx4 + 20 | 0; //@line 14103
  HEAP32[$54 >> 2] = $28; //@line 14104
  $55 = $ReallocAsyncCtx4 + 24 | 0; //@line 14105
  HEAP32[$55 >> 2] = $23; //@line 14106
  $56 = $ReallocAsyncCtx4 + 28 | 0; //@line 14107
  HEAP32[$56 >> 2] = $40; //@line 14108
  sp = STACKTOP; //@line 14109
  return;
 }
 HEAP32[___async_retval >> 2] = $49; //@line 14113
 ___async_unwind = 0; //@line 14114
 HEAP32[$ReallocAsyncCtx4 >> 2] = 47; //@line 14115
 $50 = $ReallocAsyncCtx4 + 4 | 0; //@line 14116
 HEAP32[$50 >> 2] = $2; //@line 14117
 $51 = $ReallocAsyncCtx4 + 8 | 0; //@line 14118
 HEAP32[$51 >> 2] = $19; //@line 14119
 $52 = $ReallocAsyncCtx4 + 12 | 0; //@line 14120
 HEAP32[$52 >> 2] = $22; //@line 14121
 $53 = $ReallocAsyncCtx4 + 16 | 0; //@line 14122
 HEAP32[$53 >> 2] = $33; //@line 14123
 $54 = $ReallocAsyncCtx4 + 20 | 0; //@line 14124
 HEAP32[$54 >> 2] = $28; //@line 14125
 $55 = $ReallocAsyncCtx4 + 24 | 0; //@line 14126
 HEAP32[$55 >> 2] = $23; //@line 14127
 $56 = $ReallocAsyncCtx4 + 28 | 0; //@line 14128
 HEAP32[$56 >> 2] = $40; //@line 14129
 sp = STACKTOP; //@line 14130
 return;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $12 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $29 = 0, $3 = 0, $36 = 0, $39 = 0, $40 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx14 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 9766
 STACKTOP = STACKTOP + 48 | 0; //@line 9767
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 9767
 $vararg_buffer10 = sp + 32 | 0; //@line 9768
 $vararg_buffer7 = sp + 24 | 0; //@line 9769
 $vararg_buffer3 = sp + 16 | 0; //@line 9770
 $vararg_buffer = sp; //@line 9771
 $0 = sp + 36 | 0; //@line 9772
 $1 = ___cxa_get_globals_fast() | 0; //@line 9773
 if ($1 | 0) {
  $3 = HEAP32[$1 >> 2] | 0; //@line 9776
  if ($3 | 0) {
   $7 = $3 + 48 | 0; //@line 9781
   $9 = HEAP32[$7 >> 2] | 0; //@line 9783
   $12 = HEAP32[$7 + 4 >> 2] | 0; //@line 9786
   if (!(($9 & -256 | 0) == 1126902528 & ($12 | 0) == 1129074247)) {
    HEAP32[$vararg_buffer7 >> 2] = 4653; //@line 9792
    _abort_message(4603, $vararg_buffer7); //@line 9793
   }
   if (($9 | 0) == 1126902529 & ($12 | 0) == 1129074247) {
    $22 = HEAP32[$3 + 44 >> 2] | 0; //@line 9802
   } else {
    $22 = $3 + 80 | 0; //@line 9804
   }
   HEAP32[$0 >> 2] = $22; //@line 9806
   $23 = HEAP32[$3 >> 2] | 0; //@line 9807
   $25 = HEAP32[$23 + 4 >> 2] | 0; //@line 9809
   $28 = HEAP32[(HEAP32[54] | 0) + 16 >> 2] | 0; //@line 9812
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 9813
   $29 = FUNCTION_TABLE_iiii[$28 & 7](216, $23, $0) | 0; //@line 9814
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 114; //@line 9817
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 9819
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 9821
    HEAP32[$AsyncCtx + 12 >> 2] = $25; //@line 9823
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 9825
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 9827
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 9829
    sp = STACKTOP; //@line 9830
    STACKTOP = sp; //@line 9831
    return;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 9833
   if (!$29) {
    HEAP32[$vararg_buffer3 >> 2] = 4653; //@line 9835
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 9837
    _abort_message(4562, $vararg_buffer3); //@line 9838
   }
   $36 = HEAP32[$0 >> 2] | 0; //@line 9841
   $39 = HEAP32[(HEAP32[$36 >> 2] | 0) + 8 >> 2] | 0; //@line 9844
   $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 9845
   $40 = FUNCTION_TABLE_ii[$39 & 1]($36) | 0; //@line 9846
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 115; //@line 9849
    HEAP32[$AsyncCtx14 + 4 >> 2] = $vararg_buffer; //@line 9851
    HEAP32[$AsyncCtx14 + 8 >> 2] = $25; //@line 9853
    HEAP32[$AsyncCtx14 + 12 >> 2] = $vararg_buffer; //@line 9855
    sp = STACKTOP; //@line 9856
    STACKTOP = sp; //@line 9857
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 9859
    HEAP32[$vararg_buffer >> 2] = 4653; //@line 9860
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 9862
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 9864
    _abort_message(4517, $vararg_buffer); //@line 9865
   }
  }
 }
 _abort_message(4641, $vararg_buffer10); //@line 9870
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_2($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $37 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 11750
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11752
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11754
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11756
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11758
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11760
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11762
 $14 = $0 + 32 | 0; //@line 11764
 $16 = HEAP32[$14 >> 2] | 0; //@line 11766
 $19 = HEAP32[$14 + 4 >> 2] | 0; //@line 11769
 $20 = HEAP32[$2 >> 2] | 0; //@line 11770
 if ($20 | 0) {
  $23 = HEAP32[$20 + 4 >> 2] | 0; //@line 11774
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 11775
  FUNCTION_TABLE_vii[$23 & 3]($6, $8); //@line 11776
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 101; //@line 11779
   $24 = $ReallocAsyncCtx3 + 4 | 0; //@line 11780
   HEAP32[$24 >> 2] = $10; //@line 11781
   $25 = $ReallocAsyncCtx3 + 8 | 0; //@line 11782
   HEAP32[$25 >> 2] = $4; //@line 11783
   $26 = $ReallocAsyncCtx3 + 12 | 0; //@line 11784
   HEAP32[$26 >> 2] = $12; //@line 11785
   $27 = $ReallocAsyncCtx3 + 16 | 0; //@line 11786
   $28 = $27; //@line 11787
   $29 = $28; //@line 11788
   HEAP32[$29 >> 2] = $16; //@line 11789
   $30 = $28 + 4 | 0; //@line 11790
   $31 = $30; //@line 11791
   HEAP32[$31 >> 2] = $19; //@line 11792
   $32 = $ReallocAsyncCtx3 + 24 | 0; //@line 11793
   HEAP32[$32 >> 2] = $2; //@line 11794
   $33 = $ReallocAsyncCtx3 + 28 | 0; //@line 11795
   HEAP32[$33 >> 2] = $8; //@line 11796
   sp = STACKTOP; //@line 11797
   return;
  }
  ___async_unwind = 0; //@line 11800
  HEAP32[$ReallocAsyncCtx3 >> 2] = 101; //@line 11801
  $24 = $ReallocAsyncCtx3 + 4 | 0; //@line 11802
  HEAP32[$24 >> 2] = $10; //@line 11803
  $25 = $ReallocAsyncCtx3 + 8 | 0; //@line 11804
  HEAP32[$25 >> 2] = $4; //@line 11805
  $26 = $ReallocAsyncCtx3 + 12 | 0; //@line 11806
  HEAP32[$26 >> 2] = $12; //@line 11807
  $27 = $ReallocAsyncCtx3 + 16 | 0; //@line 11808
  $28 = $27; //@line 11809
  $29 = $28; //@line 11810
  HEAP32[$29 >> 2] = $16; //@line 11811
  $30 = $28 + 4 | 0; //@line 11812
  $31 = $30; //@line 11813
  HEAP32[$31 >> 2] = $19; //@line 11814
  $32 = $ReallocAsyncCtx3 + 24 | 0; //@line 11815
  HEAP32[$32 >> 2] = $2; //@line 11816
  $33 = $ReallocAsyncCtx3 + 28 | 0; //@line 11817
  HEAP32[$33 >> 2] = $8; //@line 11818
  sp = STACKTOP; //@line 11819
  return;
 }
 HEAP32[$4 >> 2] = 0; //@line 11822
 __ZN4mbed6Ticker5setupEy($12, $16, $19); //@line 11823
 $34 = HEAP32[$2 >> 2] | 0; //@line 11824
 if (!$34) {
  return;
 }
 $37 = HEAP32[$34 + 8 >> 2] | 0; //@line 11830
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 11831
 FUNCTION_TABLE_vi[$37 & 255]($8); //@line 11832
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 102; //@line 11835
  sp = STACKTOP; //@line 11836
  return;
 }
 ___async_unwind = 0; //@line 11839
 HEAP32[$ReallocAsyncCtx4 >> 2] = 102; //@line 11840
 sp = STACKTOP; //@line 11841
 return;
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5752
 STACKTOP = STACKTOP + 48 | 0; //@line 5753
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 5753
 $vararg_buffer3 = sp + 16 | 0; //@line 5754
 $vararg_buffer = sp; //@line 5755
 $3 = sp + 32 | 0; //@line 5756
 $4 = $0 + 28 | 0; //@line 5757
 $5 = HEAP32[$4 >> 2] | 0; //@line 5758
 HEAP32[$3 >> 2] = $5; //@line 5759
 $7 = $0 + 20 | 0; //@line 5761
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 5763
 HEAP32[$3 + 4 >> 2] = $9; //@line 5764
 HEAP32[$3 + 8 >> 2] = $1; //@line 5766
 HEAP32[$3 + 12 >> 2] = $2; //@line 5768
 $12 = $9 + $2 | 0; //@line 5769
 $13 = $0 + 60 | 0; //@line 5770
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 5773
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 5775
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 5777
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 5779
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 5783
  } else {
   $$04756 = 2; //@line 5785
   $$04855 = $12; //@line 5785
   $$04954 = $3; //@line 5785
   $27 = $17; //@line 5785
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 5791
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 5793
    $38 = $27 >>> 0 > $37 >>> 0; //@line 5794
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 5796
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 5798
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 5800
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 5803
    $44 = $$150 + 4 | 0; //@line 5804
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 5807
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 5810
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 5812
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 5814
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 5816
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 5819
     break L1;
    } else {
     $$04756 = $$1; //@line 5822
     $$04954 = $$150; //@line 5822
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 5826
   HEAP32[$4 >> 2] = 0; //@line 5827
   HEAP32[$7 >> 2] = 0; //@line 5828
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 5831
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 5834
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 5839
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 5845
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 5850
  $25 = $20; //@line 5851
  HEAP32[$4 >> 2] = $25; //@line 5852
  HEAP32[$7 >> 2] = $25; //@line 5853
  $$051 = $2; //@line 5854
 }
 STACKTOP = sp; //@line 5856
 return $$051 | 0; //@line 5856
}
function _initialize__async_cb_33($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 182
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 184
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 186
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 188
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 190
 $10 = 7 << 32 + -4; //@line 192
 $11 = ___muldi3($10 | 0, 0, 1e6, 0) | 0; //@line 193
 $12 = tempRet0; //@line 194
 $13 = _i64Add($2 | 0, 0, -1, -1) | 0; //@line 195
 $15 = _i64Add($13 | 0, tempRet0 | 0, $11 | 0, $12 | 0) | 0; //@line 197
 $17 = ___udivdi3($15 | 0, tempRet0 | 0, $2 | 0, 0) | 0; //@line 199
 $18 = tempRet0; //@line 200
 $19 = HEAP32[$4 >> 2] | 0; //@line 201
 HEAP32[$19 >> 2] = 0; //@line 202
 HEAP32[$19 + 4 >> 2] = 0; //@line 204
 $23 = HEAP32[(HEAP32[$6 >> 2] | 0) + 4 >> 2] | 0; //@line 207
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 208
 $24 = FUNCTION_TABLE_i[$23 & 3]() | 0; //@line 209
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 212
  $25 = $ReallocAsyncCtx3 + 4 | 0; //@line 213
  HEAP32[$25 >> 2] = $4; //@line 214
  $26 = $ReallocAsyncCtx3 + 8 | 0; //@line 215
  HEAP32[$26 >> 2] = $2; //@line 216
  $27 = $ReallocAsyncCtx3 + 12 | 0; //@line 217
  HEAP32[$27 >> 2] = 32; //@line 218
  $28 = $ReallocAsyncCtx3 + 16 | 0; //@line 219
  HEAP32[$28 >> 2] = $10; //@line 220
  $29 = $ReallocAsyncCtx3 + 24 | 0; //@line 221
  $30 = $29; //@line 222
  $31 = $30; //@line 223
  HEAP32[$31 >> 2] = $17; //@line 224
  $32 = $30 + 4 | 0; //@line 225
  $33 = $32; //@line 226
  HEAP32[$33 >> 2] = $18; //@line 227
  $34 = $ReallocAsyncCtx3 + 32 | 0; //@line 228
  HEAP32[$34 >> 2] = $6; //@line 229
  $35 = $ReallocAsyncCtx3 + 36 | 0; //@line 230
  HEAP32[$35 >> 2] = $8; //@line 231
  sp = STACKTOP; //@line 232
  return;
 }
 HEAP32[___async_retval >> 2] = $24; //@line 236
 ___async_unwind = 0; //@line 237
 HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 238
 $25 = $ReallocAsyncCtx3 + 4 | 0; //@line 239
 HEAP32[$25 >> 2] = $4; //@line 240
 $26 = $ReallocAsyncCtx3 + 8 | 0; //@line 241
 HEAP32[$26 >> 2] = $2; //@line 242
 $27 = $ReallocAsyncCtx3 + 12 | 0; //@line 243
 HEAP32[$27 >> 2] = 32; //@line 244
 $28 = $ReallocAsyncCtx3 + 16 | 0; //@line 245
 HEAP32[$28 >> 2] = $10; //@line 246
 $29 = $ReallocAsyncCtx3 + 24 | 0; //@line 247
 $30 = $29; //@line 248
 $31 = $30; //@line 249
 HEAP32[$31 >> 2] = $17; //@line 250
 $32 = $30 + 4 | 0; //@line 251
 $33 = $32; //@line 252
 HEAP32[$33 >> 2] = $18; //@line 253
 $34 = $ReallocAsyncCtx3 + 32 | 0; //@line 254
 HEAP32[$34 >> 2] = $6; //@line 255
 $35 = $ReallocAsyncCtx3 + 36 | 0; //@line 256
 HEAP32[$35 >> 2] = $8; //@line 257
 sp = STACKTOP; //@line 258
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_9($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12194
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12198
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12200
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 12202
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12204
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 12206
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12208
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12210
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 12212
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 12214
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 12217
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 12219
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 12223
   $27 = $6 + 24 | 0; //@line 12224
   $28 = $4 + 8 | 0; //@line 12225
   $29 = $6 + 54 | 0; //@line 12226
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
    HEAP8[$10 >> 0] = 0; //@line 12256
    HEAP8[$14 >> 0] = 0; //@line 12257
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 12258
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 12259
    if (!___async) {
     ___async_unwind = 0; //@line 12262
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 129; //@line 12264
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 12266
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 12268
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 12270
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 12272
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 12274
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 12276
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 12278
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 12280
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 12282
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 12284
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 12286
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 12288
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 12290
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 12293
    sp = STACKTOP; //@line 12294
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 12299
 HEAP8[$14 >> 0] = $12; //@line 12300
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12078
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12082
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12084
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 12086
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12088
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 12090
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12092
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12094
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 12096
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 12098
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 12100
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 12102
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 12104
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 12107
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 12108
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
    HEAP8[$10 >> 0] = 0; //@line 12141
    HEAP8[$14 >> 0] = 0; //@line 12142
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 12143
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 12144
    if (!___async) {
     ___async_unwind = 0; //@line 12147
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 129; //@line 12149
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 12151
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 12153
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 12155
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 12157
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 12159
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 12161
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 12163
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 12165
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 12167
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 12169
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 12171
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 12173
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 12175
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 12178
    sp = STACKTOP; //@line 12179
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 12184
 HEAP8[$14 >> 0] = $12; //@line 12185
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 2181
 }
 ret = dest | 0; //@line 2184
 dest_end = dest + num | 0; //@line 2185
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 2189
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 2190
   dest = dest + 1 | 0; //@line 2191
   src = src + 1 | 0; //@line 2192
   num = num - 1 | 0; //@line 2193
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 2195
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 2196
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 2198
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 2199
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 2200
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 2201
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 2202
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 2203
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 2204
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 2205
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 2206
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 2207
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 2208
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 2209
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 2210
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 2211
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 2212
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 2213
   dest = dest + 64 | 0; //@line 2214
   src = src + 64 | 0; //@line 2215
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 2218
   dest = dest + 4 | 0; //@line 2219
   src = src + 4 | 0; //@line 2220
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 2224
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 2226
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 2227
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 2228
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 2229
   dest = dest + 4 | 0; //@line 2230
   src = src + 4 | 0; //@line 2231
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 2236
  dest = dest + 1 | 0; //@line 2237
  src = src + 1 | 0; //@line 2238
 }
 return ret | 0; //@line 2240
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 9955
 STACKTOP = STACKTOP + 64 | 0; //@line 9956
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 9956
 $3 = sp; //@line 9957
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 9960
 } else {
  if (!$1) {
   $$2 = 0; //@line 9964
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 9966
   $6 = ___dynamic_cast($1, 240, 224, 0) | 0; //@line 9967
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 118; //@line 9970
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 9972
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 9974
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 9976
    sp = STACKTOP; //@line 9977
    STACKTOP = sp; //@line 9978
    return 0; //@line 9978
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9980
   if (!$6) {
    $$2 = 0; //@line 9983
   } else {
    dest = $3 + 4 | 0; //@line 9986
    stop = dest + 52 | 0; //@line 9986
    do {
     HEAP32[dest >> 2] = 0; //@line 9986
     dest = dest + 4 | 0; //@line 9986
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 9987
    HEAP32[$3 + 8 >> 2] = $0; //@line 9989
    HEAP32[$3 + 12 >> 2] = -1; //@line 9991
    HEAP32[$3 + 48 >> 2] = 1; //@line 9993
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 9996
    $18 = HEAP32[$2 >> 2] | 0; //@line 9997
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 9998
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 9999
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 119; //@line 10002
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 10004
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10006
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 10008
     sp = STACKTOP; //@line 10009
     STACKTOP = sp; //@line 10010
     return 0; //@line 10010
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10012
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 10019
     $$0 = 1; //@line 10020
    } else {
     $$0 = 0; //@line 10022
    }
    $$2 = $$0; //@line 10024
   }
  }
 }
 STACKTOP = sp; //@line 10028
 return $$2 | 0; //@line 10028
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11287
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 11293
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 11297
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 11298
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 11299
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 11300
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 135; //@line 11303
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 11305
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 11307
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 11309
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 11311
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 11313
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 11315
    sp = STACKTOP; //@line 11316
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11319
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 11323
    $$0 = $0 + 24 | 0; //@line 11324
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 11326
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 11327
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 11332
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 11338
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 11341
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 136; //@line 11346
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 11348
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 11350
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 11352
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 11354
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 11356
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 11358
    sp = STACKTOP; //@line 11359
    return;
   }
  }
 } while (0);
 return;
}
function _main__async_cb_68($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $16 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 1689
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1691
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1693
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1695
 $9 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 1698
 if (!$9) {
  $16 = $6 + 4 | 0; //@line 1702
  HEAP32[$16 >> 2] = 0; //@line 1704
  HEAP32[$16 + 4 >> 2] = 0; //@line 1707
  HEAP32[$6 >> 2] = 8; //@line 1708
  $20 = $6 + 12 | 0; //@line 1709
  HEAP32[$20 >> 2] = 440; //@line 1710
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(16) | 0; //@line 1711
  __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5160, $6, 2.5); //@line 1712
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 94; //@line 1715
   $21 = $ReallocAsyncCtx7 + 4 | 0; //@line 1716
   HEAP32[$21 >> 2] = $20; //@line 1717
   $22 = $ReallocAsyncCtx7 + 8 | 0; //@line 1718
   HEAP32[$22 >> 2] = $4; //@line 1719
   $23 = $ReallocAsyncCtx7 + 12 | 0; //@line 1720
   HEAP32[$23 >> 2] = $6; //@line 1721
   sp = STACKTOP; //@line 1722
   return;
  }
  ___async_unwind = 0; //@line 1725
  HEAP32[$ReallocAsyncCtx7 >> 2] = 94; //@line 1726
  $21 = $ReallocAsyncCtx7 + 4 | 0; //@line 1727
  HEAP32[$21 >> 2] = $20; //@line 1728
  $22 = $ReallocAsyncCtx7 + 8 | 0; //@line 1729
  HEAP32[$22 >> 2] = $4; //@line 1730
  $23 = $ReallocAsyncCtx7 + 12 | 0; //@line 1731
  HEAP32[$23 >> 2] = $6; //@line 1732
  sp = STACKTOP; //@line 1733
  return;
 } else {
  $12 = HEAP32[$9 + 8 >> 2] | 0; //@line 1737
  $ReallocAsyncCtx = _emscripten_realloc_async_context(12) | 0; //@line 1738
  FUNCTION_TABLE_vi[$12 & 255]($2); //@line 1739
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 93; //@line 1742
   $13 = $ReallocAsyncCtx + 4 | 0; //@line 1743
   HEAP32[$13 >> 2] = $6; //@line 1744
   $14 = $ReallocAsyncCtx + 8 | 0; //@line 1745
   HEAP32[$14 >> 2] = $4; //@line 1746
   sp = STACKTOP; //@line 1747
   return;
  }
  ___async_unwind = 0; //@line 1750
  HEAP32[$ReallocAsyncCtx >> 2] = 93; //@line 1751
  $13 = $ReallocAsyncCtx + 4 | 0; //@line 1752
  HEAP32[$13 >> 2] = $6; //@line 1753
  $14 = $ReallocAsyncCtx + 8 | 0; //@line 1754
  HEAP32[$14 >> 2] = $4; //@line 1755
  sp = STACKTOP; //@line 1756
  return;
 }
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 6362
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 6365
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 6368
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 6371
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 6377
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 6386
     $24 = $13 >>> 2; //@line 6387
     $$090 = 0; //@line 6388
     $$094 = $7; //@line 6388
     while (1) {
      $25 = $$094 >>> 1; //@line 6390
      $26 = $$090 + $25 | 0; //@line 6391
      $27 = $26 << 1; //@line 6392
      $28 = $27 + $23 | 0; //@line 6393
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 6396
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 6400
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 6406
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 6414
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 6418
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 6424
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 6429
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 6432
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 6432
      }
     }
     $46 = $27 + $24 | 0; //@line 6435
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 6438
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 6442
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 6454
     } else {
      $$4 = 0; //@line 6456
     }
    } else {
     $$4 = 0; //@line 6459
    }
   } else {
    $$4 = 0; //@line 6462
   }
  } else {
   $$4 = 0; //@line 6465
  }
 } while (0);
 return $$4 | 0; //@line 6468
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9597
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 9602
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 9607
  } else {
   $20 = $0 & 255; //@line 9609
   $21 = $0 & 255; //@line 9610
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 9616
   } else {
    $26 = $1 + 20 | 0; //@line 9618
    $27 = HEAP32[$26 >> 2] | 0; //@line 9619
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 9625
     HEAP8[$27 >> 0] = $20; //@line 9626
     $34 = $21; //@line 9627
    } else {
     label = 12; //@line 9629
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 9634
     $32 = ___overflow($1, $0) | 0; //@line 9635
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 112; //@line 9638
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 9640
      sp = STACKTOP; //@line 9641
      return 0; //@line 9642
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 9644
      $34 = $32; //@line 9645
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 9650
   $$0 = $34; //@line 9651
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 9656
   $8 = $0 & 255; //@line 9657
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 9663
    $14 = HEAP32[$13 >> 2] | 0; //@line 9664
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 9670
     HEAP8[$14 >> 0] = $7; //@line 9671
     $$0 = $8; //@line 9672
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 9676
   $19 = ___overflow($1, $0) | 0; //@line 9677
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 111; //@line 9680
    sp = STACKTOP; //@line 9681
    return 0; //@line 9682
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9684
    $$0 = $19; //@line 9685
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 9690
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6633
 $1 = $0 + 20 | 0; //@line 6634
 $3 = $0 + 28 | 0; //@line 6636
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 6642
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 6643
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 6644
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 108; //@line 6647
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 6649
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 6651
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 6653
    sp = STACKTOP; //@line 6654
    return 0; //@line 6655
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 6657
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 6661
     break;
    } else {
     label = 5; //@line 6664
     break;
    }
   }
  } else {
   label = 5; //@line 6669
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 6673
  $14 = HEAP32[$13 >> 2] | 0; //@line 6674
  $15 = $0 + 8 | 0; //@line 6675
  $16 = HEAP32[$15 >> 2] | 0; //@line 6676
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 6684
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 6685
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 6686
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 109; //@line 6689
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 6691
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 6693
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 6695
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 6697
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 6699
     sp = STACKTOP; //@line 6700
     return 0; //@line 6701
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6703
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 6709
  HEAP32[$3 >> 2] = 0; //@line 6710
  HEAP32[$1 >> 2] = 0; //@line 6711
  HEAP32[$15 >> 2] = 0; //@line 6712
  HEAP32[$13 >> 2] = 0; //@line 6713
  $$0 = 0; //@line 6714
 }
 return $$0 | 0; //@line 6716
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 6253
 $4 = HEAP32[$3 >> 2] | 0; //@line 6254
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 6261
   label = 5; //@line 6262
  } else {
   $$1 = 0; //@line 6264
  }
 } else {
  $12 = $4; //@line 6268
  label = 5; //@line 6269
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 6273
   $10 = HEAP32[$9 >> 2] | 0; //@line 6274
   $14 = $10; //@line 6277
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 6282
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 6290
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 6294
       $$141 = $0; //@line 6294
       $$143 = $1; //@line 6294
       $31 = $14; //@line 6294
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 6297
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 6304
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 6309
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 6312
      break L5;
     }
     $$139 = $$038; //@line 6318
     $$141 = $0 + $$038 | 0; //@line 6318
     $$143 = $1 - $$038 | 0; //@line 6318
     $31 = HEAP32[$9 >> 2] | 0; //@line 6318
    } else {
     $$139 = 0; //@line 6320
     $$141 = $0; //@line 6320
     $$143 = $1; //@line 6320
     $31 = $14; //@line 6320
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 6323
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 6326
   $$1 = $$139 + $$143 | 0; //@line 6328
  }
 } while (0);
 return $$1 | 0; //@line 6331
}
function _main__async_cb_67($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $13 = 0, $17 = 0, $18 = 0, $19 = 0, $4 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 1624
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1628
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1630
 $7 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 1631
 if (!$7) {
  $13 = $4 + 4 | 0; //@line 1635
  HEAP32[$13 >> 2] = 0; //@line 1637
  HEAP32[$13 + 4 >> 2] = 0; //@line 1640
  HEAP32[$4 >> 2] = 9; //@line 1641
  $17 = $4 + 12 | 0; //@line 1642
  HEAP32[$17 >> 2] = 440; //@line 1643
  $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 1644
  __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5300, $4); //@line 1645
  if (___async) {
   HEAP32[$ReallocAsyncCtx9 >> 2] = 96; //@line 1648
   $18 = $ReallocAsyncCtx9 + 4 | 0; //@line 1649
   HEAP32[$18 >> 2] = $17; //@line 1650
   $19 = $ReallocAsyncCtx9 + 8 | 0; //@line 1651
   HEAP32[$19 >> 2] = $4; //@line 1652
   sp = STACKTOP; //@line 1653
   return;
  }
  ___async_unwind = 0; //@line 1656
  HEAP32[$ReallocAsyncCtx9 >> 2] = 96; //@line 1657
  $18 = $ReallocAsyncCtx9 + 4 | 0; //@line 1658
  HEAP32[$18 >> 2] = $17; //@line 1659
  $19 = $ReallocAsyncCtx9 + 8 | 0; //@line 1660
  HEAP32[$19 >> 2] = $4; //@line 1661
  sp = STACKTOP; //@line 1662
  return;
 } else {
  $10 = HEAP32[$7 + 8 >> 2] | 0; //@line 1666
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 1667
  FUNCTION_TABLE_vi[$10 & 255]($6); //@line 1668
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 1671
   $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 1672
   HEAP32[$11 >> 2] = $4; //@line 1673
   sp = STACKTOP; //@line 1674
   return;
  }
  ___async_unwind = 0; //@line 1677
  HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 1678
  $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 1679
  HEAP32[$11 >> 2] = $4; //@line 1680
  sp = STACKTOP; //@line 1681
  return;
 }
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_6($0) {
 $0 = $0 | 0;
 var $$phi$trans$insert = 0, $$pre10 = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 11965
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11969
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11971
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11973
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11975
 $$phi$trans$insert = (HEAP32[$0 + 4 >> 2] | 0) + 12 | 0; //@line 11976
 $$pre10 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 11977
 if (!$$pre10) {
  HEAP32[$4 >> 2] = 0; //@line 11980
  _gpio_irq_set($10 + 28 | 0, 2, 0); //@line 11982
  return;
 }
 $13 = HEAP32[$$pre10 + 4 >> 2] | 0; //@line 11986
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 11987
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 11988
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 30; //@line 11991
  $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 11992
  HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 11993
  $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 11994
  HEAP32[$15 >> 2] = $4; //@line 11995
  $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 11996
  HEAP32[$16 >> 2] = $8; //@line 11997
  $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 11998
  HEAP32[$17 >> 2] = $10; //@line 11999
  sp = STACKTOP; //@line 12000
  return;
 }
 ___async_unwind = 0; //@line 12003
 HEAP32[$ReallocAsyncCtx4 >> 2] = 30; //@line 12004
 $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 12005
 HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 12006
 $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 12007
 HEAP32[$15 >> 2] = $4; //@line 12008
 $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 12009
 HEAP32[$16 >> 2] = $8; //@line 12010
 $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 12011
 HEAP32[$17 >> 2] = $10; //@line 12012
 sp = STACKTOP; //@line 12013
 return;
}
function __GLOBAL__sub_I_main_cpp() {
 var $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2133
 HEAP32[1307] = 0; //@line 2134
 HEAP32[1308] = 0; //@line 2134
 HEAP32[1309] = 0; //@line 2134
 HEAP32[1310] = 0; //@line 2134
 HEAP32[1311] = 0; //@line 2134
 HEAP32[1312] = 0; //@line 2134
 _gpio_init_out(5228, 50); //@line 2135
 HEAP32[1313] = 0; //@line 2136
 HEAP32[1314] = 0; //@line 2136
 HEAP32[1315] = 0; //@line 2136
 HEAP32[1316] = 0; //@line 2136
 HEAP32[1317] = 0; //@line 2136
 HEAP32[1318] = 0; //@line 2136
 _gpio_init_out(5252, 52); //@line 2137
 HEAP32[1319] = 0; //@line 2138
 HEAP32[1320] = 0; //@line 2138
 HEAP32[1321] = 0; //@line 2138
 HEAP32[1322] = 0; //@line 2138
 HEAP32[1323] = 0; //@line 2138
 HEAP32[1324] = 0; //@line 2138
 _gpio_init_out(5276, 53); //@line 2139
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2140
 __ZN4mbed10TimerEventC2Ev(5096); //@line 2141
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 84; //@line 2144
  sp = STACKTOP; //@line 2145
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2148
 HEAP32[1274] = 428; //@line 2149
 HEAP32[1284] = 0; //@line 2150
 HEAP32[1285] = 0; //@line 2150
 HEAP32[1286] = 0; //@line 2150
 HEAP32[1287] = 0; //@line 2150
 HEAP8[5152] = 1; //@line 2151
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2152
 __ZN4mbed10TimerEventC2Ev(5160); //@line 2153
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 85; //@line 2156
  sp = STACKTOP; //@line 2157
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2160
  HEAP32[1300] = 0; //@line 2161
  HEAP32[1301] = 0; //@line 2161
  HEAP32[1302] = 0; //@line 2161
  HEAP32[1303] = 0; //@line 2161
  HEAP8[5216] = 1; //@line 2162
  HEAP32[1290] = 352; //@line 2163
  __ZN4mbed11InterruptInC2E7PinName(5300, 1337); //@line 2164
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_17($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12869
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12873
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12875
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12877
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12879
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12881
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12883
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12885
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 12888
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 12889
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 12905
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 12906
    if (!___async) {
     ___async_unwind = 0; //@line 12909
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 133; //@line 12911
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 12913
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 12915
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 12917
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 12919
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 12921
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 12923
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 12925
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 12927
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 12930
    sp = STACKTOP; //@line 12931
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
 sp = STACKTOP; //@line 6139
 STACKTOP = STACKTOP + 16 | 0; //@line 6140
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 6140
 $2 = sp; //@line 6141
 $3 = $1 & 255; //@line 6142
 HEAP8[$2 >> 0] = $3; //@line 6143
 $4 = $0 + 16 | 0; //@line 6144
 $5 = HEAP32[$4 >> 2] | 0; //@line 6145
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 6152
   label = 4; //@line 6153
  } else {
   $$0 = -1; //@line 6155
  }
 } else {
  $12 = $5; //@line 6158
  label = 4; //@line 6159
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 6163
   $10 = HEAP32[$9 >> 2] | 0; //@line 6164
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 6167
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 6174
     HEAP8[$10 >> 0] = $3; //@line 6175
     $$0 = $13; //@line 6176
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 6181
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 6182
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 6183
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 103; //@line 6186
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 6188
    sp = STACKTOP; //@line 6189
    STACKTOP = sp; //@line 6190
    return 0; //@line 6190
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 6192
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 6197
   } else {
    $$0 = -1; //@line 6199
   }
  }
 } while (0);
 STACKTOP = sp; //@line 6203
 return $$0 | 0; //@line 6203
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 2245
 value = value & 255; //@line 2247
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 2250
   ptr = ptr + 1 | 0; //@line 2251
  }
  aligned_end = end & -4 | 0; //@line 2254
  block_aligned_end = aligned_end - 64 | 0; //@line 2255
  value4 = value | value << 8 | value << 16 | value << 24; //@line 2256
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 2259
   HEAP32[ptr + 4 >> 2] = value4; //@line 2260
   HEAP32[ptr + 8 >> 2] = value4; //@line 2261
   HEAP32[ptr + 12 >> 2] = value4; //@line 2262
   HEAP32[ptr + 16 >> 2] = value4; //@line 2263
   HEAP32[ptr + 20 >> 2] = value4; //@line 2264
   HEAP32[ptr + 24 >> 2] = value4; //@line 2265
   HEAP32[ptr + 28 >> 2] = value4; //@line 2266
   HEAP32[ptr + 32 >> 2] = value4; //@line 2267
   HEAP32[ptr + 36 >> 2] = value4; //@line 2268
   HEAP32[ptr + 40 >> 2] = value4; //@line 2269
   HEAP32[ptr + 44 >> 2] = value4; //@line 2270
   HEAP32[ptr + 48 >> 2] = value4; //@line 2271
   HEAP32[ptr + 52 >> 2] = value4; //@line 2272
   HEAP32[ptr + 56 >> 2] = value4; //@line 2273
   HEAP32[ptr + 60 >> 2] = value4; //@line 2274
   ptr = ptr + 64 | 0; //@line 2275
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 2279
   ptr = ptr + 4 | 0; //@line 2280
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 2285
  ptr = ptr + 1 | 0; //@line 2286
 }
 return end - num | 0; //@line 2288
}
function _fflush__async_cb_52($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 914
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 916
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 918
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 922
  } else {
   $$02327 = $$02325; //@line 924
   $$02426 = $AsyncRetVal; //@line 924
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 931
    } else {
     $16 = 0; //@line 933
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 945
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 948
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 951
     break L3;
    } else {
     $$02327 = $$023; //@line 954
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 957
   $13 = ___fflush_unlocked($$02327) | 0; //@line 958
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 962
    ___async_unwind = 0; //@line 963
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 107; //@line 965
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 967
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 969
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 971
   sp = STACKTOP; //@line 972
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 976
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 978
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12806
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12810
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12812
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12814
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12816
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12818
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12820
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 12823
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 12824
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 12833
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 12834
    if (!___async) {
     ___async_unwind = 0; //@line 12837
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 134; //@line 12839
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 12841
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 12843
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 12845
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 12847
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 12849
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 12851
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 12853
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 12856
    sp = STACKTOP; //@line 12857
    return;
   }
  }
 }
 return;
}
function _main__async_cb_64($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 1522
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1524
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1526
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1528
 $8 = $2 + 4 | 0; //@line 1530
 HEAP32[$8 >> 2] = 0; //@line 1532
 HEAP32[$8 + 4 >> 2] = 0; //@line 1535
 HEAP32[$2 >> 2] = 7; //@line 1536
 $12 = $2 + 12 | 0; //@line 1537
 HEAP32[$12 >> 2] = 440; //@line 1538
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(20) | 0; //@line 1539
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5096, $2, 1.0); //@line 1540
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 92; //@line 1543
  $13 = $ReallocAsyncCtx8 + 4 | 0; //@line 1544
  HEAP32[$13 >> 2] = $2; //@line 1545
  $14 = $ReallocAsyncCtx8 + 8 | 0; //@line 1546
  HEAP32[$14 >> 2] = $4; //@line 1547
  $15 = $ReallocAsyncCtx8 + 12 | 0; //@line 1548
  HEAP32[$15 >> 2] = $6; //@line 1549
  $16 = $ReallocAsyncCtx8 + 16 | 0; //@line 1550
  HEAP32[$16 >> 2] = $12; //@line 1551
  sp = STACKTOP; //@line 1552
  return;
 }
 ___async_unwind = 0; //@line 1555
 HEAP32[$ReallocAsyncCtx8 >> 2] = 92; //@line 1556
 $13 = $ReallocAsyncCtx8 + 4 | 0; //@line 1557
 HEAP32[$13 >> 2] = $2; //@line 1558
 $14 = $ReallocAsyncCtx8 + 8 | 0; //@line 1559
 HEAP32[$14 >> 2] = $4; //@line 1560
 $15 = $ReallocAsyncCtx8 + 12 | 0; //@line 1561
 HEAP32[$15 >> 2] = $6; //@line 1562
 $16 = $ReallocAsyncCtx8 + 16 | 0; //@line 1563
 HEAP32[$16 >> 2] = $12; //@line 1564
 sp = STACKTOP; //@line 1565
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13759
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13761
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13763
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13765
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 13770
  } else {
   $9 = $4 + 4 | 0; //@line 13772
   $10 = HEAP32[$9 >> 2] | 0; //@line 13773
   $11 = $4 + 8 | 0; //@line 13774
   $12 = HEAP32[$11 >> 2] | 0; //@line 13775
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 13779
    HEAP32[$6 >> 2] = 0; //@line 13780
    HEAP32[$2 >> 2] = 0; //@line 13781
    HEAP32[$11 >> 2] = 0; //@line 13782
    HEAP32[$9 >> 2] = 0; //@line 13783
    $$0 = 0; //@line 13784
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 13791
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 13792
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 13793
   if (!___async) {
    ___async_unwind = 0; //@line 13796
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 109; //@line 13798
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 13800
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 13802
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 13804
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 13806
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 13808
   sp = STACKTOP; //@line 13809
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 13814
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11899
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11901
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11903
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11905
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11907
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11909
 $$pre = HEAP32[$2 >> 2] | 0; //@line 11910
 if (!$$pre) {
  HEAP32[$4 >> 2] = 0; //@line 11913
  _gpio_irq_set($10 + 28 | 0, 2, 1); //@line 11915
  return;
 }
 $13 = HEAP32[$$pre + 4 >> 2] | 0; //@line 11919
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 11920
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 11921
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 28; //@line 11924
  $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 11925
  HEAP32[$14 >> 2] = $2; //@line 11926
  $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 11927
  HEAP32[$15 >> 2] = $4; //@line 11928
  $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 11929
  HEAP32[$16 >> 2] = $10; //@line 11930
  sp = STACKTOP; //@line 11931
  return;
 }
 ___async_unwind = 0; //@line 11934
 HEAP32[$ReallocAsyncCtx2 >> 2] = 28; //@line 11935
 $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 11936
 HEAP32[$14 >> 2] = $2; //@line 11937
 $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 11938
 HEAP32[$15 >> 2] = $4; //@line 11939
 $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 11940
 HEAP32[$16 >> 2] = $10; //@line 11941
 sp = STACKTOP; //@line 11942
 return;
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 815
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 825
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 825
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 825
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 829
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 832
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 835
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 843
  } else {
   $20 = 0; //@line 845
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 855
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 859
  HEAP32[___async_retval >> 2] = $$1; //@line 861
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 864
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 865
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 869
  ___async_unwind = 0; //@line 870
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 107; //@line 872
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 874
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 876
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 878
 sp = STACKTOP; //@line 879
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_22($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 13410
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13412
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13414
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13416
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13418
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 13423
  return;
 }
 dest = $2 + 4 | 0; //@line 13427
 stop = dest + 52 | 0; //@line 13427
 do {
  HEAP32[dest >> 2] = 0; //@line 13427
  dest = dest + 4 | 0; //@line 13427
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 13428
 HEAP32[$2 + 8 >> 2] = $4; //@line 13430
 HEAP32[$2 + 12 >> 2] = -1; //@line 13432
 HEAP32[$2 + 48 >> 2] = 1; //@line 13434
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 13437
 $16 = HEAP32[$6 >> 2] | 0; //@line 13438
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 13439
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 13440
 if (!___async) {
  ___async_unwind = 0; //@line 13443
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 119; //@line 13445
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 13447
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 13449
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 13451
 sp = STACKTOP; //@line 13452
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 9405
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 9410
    $$0 = 1; //@line 9411
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 9424
     $$0 = 1; //@line 9425
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 9429
     $$0 = -1; //@line 9430
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 9440
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 9444
    $$0 = 2; //@line 9445
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 9457
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 9463
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 9467
    $$0 = 3; //@line 9468
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 9478
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 9484
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 9490
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 9494
    $$0 = 4; //@line 9495
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 9499
    $$0 = -1; //@line 9500
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 9505
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_18($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 12942
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12946
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12948
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12950
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12952
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12954
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 12957
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 12958
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 12964
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 12965
   if (!___async) {
    ___async_unwind = 0; //@line 12968
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 132; //@line 12970
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 12972
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 12974
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 12976
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 12978
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 12980
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 12982
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 12985
   sp = STACKTOP; //@line 12986
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
  $$0914 = $2; //@line 8289
  $8 = $0; //@line 8289
  $9 = $1; //@line 8289
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 8291
   $$0914 = $$0914 + -1 | 0; //@line 8295
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 8296
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 8297
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 8305
   }
  }
  $$010$lcssa$off0 = $8; //@line 8310
  $$09$lcssa = $$0914; //@line 8310
 } else {
  $$010$lcssa$off0 = $0; //@line 8312
  $$09$lcssa = $2; //@line 8312
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 8316
 } else {
  $$012 = $$010$lcssa$off0; //@line 8318
  $$111 = $$09$lcssa; //@line 8318
  while (1) {
   $26 = $$111 + -1 | 0; //@line 8323
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 8324
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 8328
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 8331
    $$111 = $26; //@line 8331
   }
  }
 }
 return $$1$lcssa | 0; //@line 8335
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 1428
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1430
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1432
 $6 = $2 + 4 | 0; //@line 1434
 HEAP32[$6 >> 2] = 0; //@line 1436
 HEAP32[$6 + 4 >> 2] = 0; //@line 1439
 HEAP32[$2 >> 2] = 8; //@line 1440
 $10 = $2 + 12 | 0; //@line 1441
 HEAP32[$10 >> 2] = 440; //@line 1442
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(16) | 0; //@line 1443
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5160, $2, 2.5); //@line 1444
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 94; //@line 1447
  $11 = $ReallocAsyncCtx7 + 4 | 0; //@line 1448
  HEAP32[$11 >> 2] = $10; //@line 1449
  $12 = $ReallocAsyncCtx7 + 8 | 0; //@line 1450
  HEAP32[$12 >> 2] = $4; //@line 1451
  $13 = $ReallocAsyncCtx7 + 12 | 0; //@line 1452
  HEAP32[$13 >> 2] = $2; //@line 1453
  sp = STACKTOP; //@line 1454
  return;
 }
 ___async_unwind = 0; //@line 1457
 HEAP32[$ReallocAsyncCtx7 >> 2] = 94; //@line 1458
 $11 = $ReallocAsyncCtx7 + 4 | 0; //@line 1459
 HEAP32[$11 >> 2] = $10; //@line 1460
 $12 = $ReallocAsyncCtx7 + 8 | 0; //@line 1461
 HEAP32[$12 >> 2] = $4; //@line 1462
 $13 = $ReallocAsyncCtx7 + 12 | 0; //@line 1463
 HEAP32[$13 >> 2] = $2; //@line 1464
 sp = STACKTOP; //@line 1465
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1218
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1220
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1224
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1226
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1228
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1230
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 1234
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 1237
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 1238
   if (!___async) {
    ___async_unwind = 0; //@line 1241
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 136; //@line 1243
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 1245
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 1247
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 1249
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 1251
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 1253
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 1255
   sp = STACKTOP; //@line 1256
   return;
  }
 }
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 6005
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 6010
   label = 4; //@line 6011
  } else {
   $$01519 = $0; //@line 6013
   $23 = $1; //@line 6013
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 6018
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 6021
    $23 = $6; //@line 6022
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 6026
     label = 4; //@line 6027
     break;
    } else {
     $$01519 = $6; //@line 6030
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 6036
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 6038
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 6046
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 6054
  } else {
   $$pn = $$0; //@line 6056
   while (1) {
    $19 = $$pn + 1 | 0; //@line 6058
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 6062
     break;
    } else {
     $$pn = $19; //@line 6065
    }
   }
  }
  $$sink = $$1$lcssa; //@line 6070
 }
 return $$sink - $1 | 0; //@line 6073
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 10202
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 10209
   $10 = $1 + 16 | 0; //@line 10210
   $11 = HEAP32[$10 >> 2] | 0; //@line 10211
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 10214
    HEAP32[$1 + 24 >> 2] = $4; //@line 10216
    HEAP32[$1 + 36 >> 2] = 1; //@line 10218
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 10228
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 10233
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 10236
    HEAP8[$1 + 54 >> 0] = 1; //@line 10238
    break;
   }
   $21 = $1 + 24 | 0; //@line 10241
   $22 = HEAP32[$21 >> 2] | 0; //@line 10242
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 10245
    $28 = $4; //@line 10246
   } else {
    $28 = $22; //@line 10248
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 10257
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
     FUNCTION_TABLE_vi[$7 & 255]($2 + 40 | 0); //@line 189
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 25; //@line 192
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
     FUNCTION_TABLE_vi[$12 & 255]($2 + 56 | 0); //@line 210
     if (___async) {
      HEAP32[$AsyncCtx2 >> 2] = 26; //@line 213
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
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_7($0) {
 $0 = $0 | 0;
 var $$pre$i$i4 = 0, $12 = 0, $13 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 12019
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12025
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12027
 $$pre$i$i4 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 12028
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = $$pre$i$i4; //@line 12029
 if (!$$pre$i$i4) {
  _gpio_irq_set($8 + 28 | 0, 2, 0); //@line 12033
  return;
 }
 $12 = HEAP32[$$pre$i$i4 + 8 >> 2] | 0; //@line 12038
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(12) | 0; //@line 12039
 FUNCTION_TABLE_vi[$12 & 255]($6); //@line 12040
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 12043
  $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 12044
  HEAP32[$13 >> 2] = $6; //@line 12045
  $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 12046
  HEAP32[$14 >> 2] = $8; //@line 12047
  sp = STACKTOP; //@line 12048
  return;
 }
 ___async_unwind = 0; //@line 12051
 HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 12052
 $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 12053
 HEAP32[$13 >> 2] = $6; //@line 12054
 $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 12055
 HEAP32[$14 >> 2] = $8; //@line 12056
 sp = STACKTOP; //@line 12057
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9696
 $1 = HEAP32[147] | 0; //@line 9697
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 9703
 } else {
  $19 = 0; //@line 9705
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 9711
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 9717
    $12 = HEAP32[$11 >> 2] | 0; //@line 9718
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 9724
     HEAP8[$12 >> 0] = 10; //@line 9725
     $22 = 0; //@line 9726
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 9730
   $17 = ___overflow($1, 10) | 0; //@line 9731
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 113; //@line 9734
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 9736
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 9738
    sp = STACKTOP; //@line 9739
    return 0; //@line 9740
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9742
    $22 = $17 >> 31; //@line 9744
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 9751
 }
 return $22 | 0; //@line 9753
}
function __ZN4mbed11InterruptInD0Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 108
 HEAP32[$0 >> 2] = 336; //@line 109
 _gpio_irq_free($0 + 28 | 0); //@line 111
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 113
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 119
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 120
   FUNCTION_TABLE_vi[$7 & 255]($0 + 56 | 0); //@line 121
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 23; //@line 124
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
 FUNCTION_TABLE_vi[$14 & 255]($0 + 40 | 0); //@line 146
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 24; //@line 149
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 151
  sp = STACKTOP; //@line 152
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 155
 __ZdlPv($0); //@line 156
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_58($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1266
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1272
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1274
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1276
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1278
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 1283
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 1285
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 1286
 if (!___async) {
  ___async_unwind = 0; //@line 1289
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 136; //@line 1291
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 1293
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 1295
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 1297
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 1299
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 1301
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 1303
 sp = STACKTOP; //@line 1304
 return;
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13589
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13591
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13593
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13595
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 13597
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 13599
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 4653; //@line 13604
  HEAP32[$4 + 4 >> 2] = $6; //@line 13606
  _abort_message(4562, $4); //@line 13607
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 13610
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 13613
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 13614
 $16 = FUNCTION_TABLE_ii[$15 & 1]($12) | 0; //@line 13615
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 13619
  ___async_unwind = 0; //@line 13620
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 115; //@line 13622
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 13624
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 13626
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 13628
 sp = STACKTOP; //@line 13629
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10061
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 10070
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 10075
      HEAP32[$13 >> 2] = $2; //@line 10076
      $19 = $1 + 40 | 0; //@line 10077
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 10080
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 10090
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 10094
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 10101
    }
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1018
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1020
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1022
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1026
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 1030
  label = 4; //@line 1031
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 1036
   label = 4; //@line 1037
  } else {
   $$037$off039 = 3; //@line 1039
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 1043
  $17 = $8 + 40 | 0; //@line 1044
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 1047
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 1057
    $$037$off039 = $$037$off038; //@line 1058
   } else {
    $$037$off039 = $$037$off038; //@line 1060
   }
  } else {
   $$037$off039 = $$037$off038; //@line 1063
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 1066
 return;
}
function ___strerror_l($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $7 = 0, label = 0, $$113$looptemp = 0;
 $$016 = 0; //@line 9525
 while (1) {
  if ((HEAPU8[2625 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 9532
   break;
  }
  $7 = $$016 + 1 | 0; //@line 9535
  if (($7 | 0) == 87) {
   $$01214 = 2713; //@line 9538
   $$115 = 87; //@line 9538
   label = 5; //@line 9539
   break;
  } else {
   $$016 = $7; //@line 9542
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 2713; //@line 9548
  } else {
   $$01214 = 2713; //@line 9550
   $$115 = $$016; //@line 9550
   label = 5; //@line 9551
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 9556
   $$113 = $$01214; //@line 9557
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 9561
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 9568
   if (!$$115) {
    $$012$lcssa = $$113; //@line 9571
    break;
   } else {
    $$01214 = $$113; //@line 9574
    label = 5; //@line 9575
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 9582
}
function __ZN4mbed6TickerD0Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1939
 HEAP32[$0 >> 2] = 428; //@line 1940
 $1 = $0 + 40 | 0; //@line 1941
 _emscripten_asm_const_ii(6, $1 | 0) | 0; //@line 1942
 $4 = HEAP32[$0 + 52 >> 2] | 0; //@line 1944
 do {
  if ($4 | 0) {
   $7 = HEAP32[$4 + 8 >> 2] | 0; //@line 1949
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1950
   FUNCTION_TABLE_vi[$7 & 255]($1); //@line 1951
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 77; //@line 1954
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1956
    sp = STACKTOP; //@line 1957
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 1960
    break;
   }
  }
 } while (0);
 $AsyncCtx2 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1965
 __ZN4mbed10TimerEventD2Ev($0); //@line 1966
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 78; //@line 1969
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 1971
  sp = STACKTOP; //@line 1972
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1975
  __ZdlPv($0); //@line 1976
  return;
 }
}
function __ZN4mbed7Timeout7handlerEv($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 493
 $1 = $0 + 40 | 0; //@line 494
 $2 = $0 + 52 | 0; //@line 495
 $3 = HEAP32[$2 >> 2] | 0; //@line 496
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 500
   _mbed_assert_internal(1681, 1686, 528); //@line 501
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 36; //@line 504
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 506
    HEAP32[$AsyncCtx2 + 8 >> 2] = $1; //@line 508
    sp = STACKTOP; //@line 509
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 512
    $8 = HEAP32[$2 >> 2] | 0; //@line 514
    break;
   }
  } else {
   $8 = $3; //@line 518
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 521
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 522
 FUNCTION_TABLE_vi[$7 & 255]($1); //@line 523
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 37; //@line 526
  sp = STACKTOP; //@line 527
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 530
  return;
 }
}
function __ZN4mbed11InterruptInD2Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 57
 HEAP32[$0 >> 2] = 336; //@line 58
 _gpio_irq_free($0 + 28 | 0); //@line 60
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 62
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 68
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 69
   FUNCTION_TABLE_vi[$7 & 255]($0 + 56 | 0); //@line 70
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 21; //@line 73
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
 FUNCTION_TABLE_vi[$14 & 255]($0 + 40 | 0); //@line 94
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 22; //@line 97
  sp = STACKTOP; //@line 98
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 101
 return;
}
function _main__async_cb_62($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 1471
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1473
 $4 = $2 + 4 | 0; //@line 1475
 HEAP32[$4 >> 2] = 0; //@line 1477
 HEAP32[$4 + 4 >> 2] = 0; //@line 1480
 HEAP32[$2 >> 2] = 9; //@line 1481
 $8 = $2 + 12 | 0; //@line 1482
 HEAP32[$8 >> 2] = 440; //@line 1483
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 1484
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5300, $2); //@line 1485
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 96; //@line 1488
  $9 = $ReallocAsyncCtx9 + 4 | 0; //@line 1489
  HEAP32[$9 >> 2] = $8; //@line 1490
  $10 = $ReallocAsyncCtx9 + 8 | 0; //@line 1491
  HEAP32[$10 >> 2] = $2; //@line 1492
  sp = STACKTOP; //@line 1493
  return;
 }
 ___async_unwind = 0; //@line 1496
 HEAP32[$ReallocAsyncCtx9 >> 2] = 96; //@line 1497
 $9 = $ReallocAsyncCtx9 + 4 | 0; //@line 1498
 HEAP32[$9 >> 2] = $8; //@line 1499
 $10 = $ReallocAsyncCtx9 + 8 | 0; //@line 1500
 HEAP32[$10 >> 2] = $2; //@line 1501
 sp = STACKTOP; //@line 1502
 return;
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2006
 $2 = $0 + 12 | 0; //@line 2008
 $3 = HEAP32[$2 >> 2] | 0; //@line 2009
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2013
   _mbed_assert_internal(1681, 1686, 528); //@line 2014
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 80; //@line 2017
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 2019
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 2021
    sp = STACKTOP; //@line 2022
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2025
    $8 = HEAP32[$2 >> 2] | 0; //@line 2027
    break;
   }
  } else {
   $8 = $3; //@line 2031
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 2034
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2036
 FUNCTION_TABLE_vi[$7 & 255]($0); //@line 2037
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 81; //@line 2040
  sp = STACKTOP; //@line 2041
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2044
  return;
 }
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_3($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $15 = 0, $17 = 0, $18 = 0, $21 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 11848
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11854
 $8 = $0 + 16 | 0; //@line 11856
 $10 = HEAP32[$8 >> 2] | 0; //@line 11858
 $13 = HEAP32[$8 + 4 >> 2] | 0; //@line 11861
 $15 = HEAP32[$0 + 24 >> 2] | 0; //@line 11863
 $17 = HEAP32[$0 + 28 >> 2] | 0; //@line 11865
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 11867
 __ZN4mbed6Ticker5setupEy($6, $10, $13); //@line 11868
 $18 = HEAP32[$15 >> 2] | 0; //@line 11869
 if (!$18) {
  return;
 }
 $21 = HEAP32[$18 + 8 >> 2] | 0; //@line 11875
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 11876
 FUNCTION_TABLE_vi[$21 & 255]($17); //@line 11877
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 102; //@line 11880
  sp = STACKTOP; //@line 11881
  return;
 }
 ___async_unwind = 0; //@line 11884
 HEAP32[$ReallocAsyncCtx4 >> 2] = 102; //@line 11885
 sp = STACKTOP; //@line 11886
 return;
}
function __ZN4mbed7TimeoutD0Ev($0) {
 $0 = $0 | 0;
 var $2 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 449
 HEAP32[$0 >> 2] = 428; //@line 450
 __ZN4mbed6Ticker6detachEv($0); //@line 451
 $2 = HEAP32[$0 + 52 >> 2] | 0; //@line 453
 do {
  if ($2 | 0) {
   $6 = HEAP32[$2 + 8 >> 2] | 0; //@line 459
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 460
   FUNCTION_TABLE_vi[$6 & 255]($0 + 40 | 0); //@line 461
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 34; //@line 464
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 466
    sp = STACKTOP; //@line 467
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 470
    break;
   }
  }
 } while (0);
 $AsyncCtx2 = _emscripten_alloc_async_context(8, sp) | 0; //@line 475
 __ZN4mbed10TimerEventD2Ev($0); //@line 476
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 35; //@line 479
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 481
  sp = STACKTOP; //@line 482
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 485
  __ZdlPv($0); //@line 486
  return;
 }
}
function _abort_message($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9894
 STACKTOP = STACKTOP + 16 | 0; //@line 9895
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 9895
 $1 = sp; //@line 9896
 HEAP32[$1 >> 2] = $varargs; //@line 9897
 $2 = HEAP32[115] | 0; //@line 9898
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 9899
 _vfprintf($2, $0, $1) | 0; //@line 9900
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 116; //@line 9903
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 9905
  sp = STACKTOP; //@line 9906
  STACKTOP = sp; //@line 9907
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 9909
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 9910
 _fputc(10, $2) | 0; //@line 9911
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 117; //@line 9914
  sp = STACKTOP; //@line 9915
  STACKTOP = sp; //@line 9916
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 9918
  _abort(); //@line 9919
 }
}
function __ZN4mbed6TickerD2Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1898
 HEAP32[$0 >> 2] = 428; //@line 1899
 $1 = $0 + 40 | 0; //@line 1900
 _emscripten_asm_const_ii(6, $1 | 0) | 0; //@line 1901
 $4 = HEAP32[$0 + 52 >> 2] | 0; //@line 1903
 do {
  if ($4 | 0) {
   $7 = HEAP32[$4 + 8 >> 2] | 0; //@line 1908
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1909
   FUNCTION_TABLE_vi[$7 & 255]($1); //@line 1910
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 75; //@line 1913
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1915
    sp = STACKTOP; //@line 1916
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 1919
    break;
   }
  }
 } while (0);
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1924
 __ZN4mbed10TimerEventD2Ev($0); //@line 1925
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 76; //@line 1928
  sp = STACKTOP; //@line 1929
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1932
  return;
 }
}
function _main__async_cb_69($0) {
 $0 = $0 | 0;
 var $4 = 0, $5 = 0, $8 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1763
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1767
 $5 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 1768
 if (!$5) {
  $ReallocAsyncCtx10 = _emscripten_realloc_async_context(4) | 0; //@line 1771
  _wait_ms(-1); //@line 1772
  if (___async) {
   HEAP32[$ReallocAsyncCtx10 >> 2] = 98; //@line 1775
   sp = STACKTOP; //@line 1776
   return;
  }
  ___async_unwind = 0; //@line 1779
  HEAP32[$ReallocAsyncCtx10 >> 2] = 98; //@line 1780
  sp = STACKTOP; //@line 1781
  return;
 } else {
  $8 = HEAP32[$5 + 8 >> 2] | 0; //@line 1785
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 1786
  FUNCTION_TABLE_vi[$8 & 255]($4); //@line 1787
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 97; //@line 1790
   sp = STACKTOP; //@line 1791
   return;
  }
  ___async_unwind = 0; //@line 1794
  HEAP32[$ReallocAsyncCtx3 >> 2] = 97; //@line 1795
  sp = STACKTOP; //@line 1796
  return;
 }
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11497
 STACKTOP = STACKTOP + 16 | 0; //@line 11498
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11498
 $3 = sp; //@line 11499
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 11501
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 11504
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 11505
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 11506
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 140; //@line 11509
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 11511
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 11513
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 11515
  sp = STACKTOP; //@line 11516
  STACKTOP = sp; //@line 11517
  return 0; //@line 11517
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 11519
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 11523
 }
 STACKTOP = sp; //@line 11525
 return $8 & 1 | 0; //@line 11525
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 9356
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 9356
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 9357
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 9358
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 9367
    $$016 = $9; //@line 9370
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 9370
   } else {
    $$016 = $0; //@line 9372
    $storemerge = 0; //@line 9372
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 9374
   $$0 = $$016; //@line 9375
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 9379
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 9385
   HEAP32[tempDoublePtr >> 2] = $2; //@line 9388
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 9388
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 9389
  }
 }
 return +$$0;
}
function _schedule_interrupt__async_cb_13($0) {
 $0 = $0 | 0;
 var $16 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 12692
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12696
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12698
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12700
 $8 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 12701
 if ($4 >>> 0 > $8 >>> 0) {
  if (!($AsyncRetVal >>> 0 >= $4 >>> 0 | $AsyncRetVal >>> 0 < $8 >>> 0)) {
   return;
  }
 } else {
  if (!($AsyncRetVal >>> 0 >= $4 >>> 0 & $AsyncRetVal >>> 0 < $8 >>> 0)) {
   return;
  }
 }
 $16 = HEAP32[(HEAP32[$6 >> 2] | 0) + 20 >> 2] | 0; //@line 12720
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(4) | 0; //@line 12721
 FUNCTION_TABLE_v[$16 & 15](); //@line 12722
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 54; //@line 12725
  sp = STACKTOP; //@line 12726
  return;
 }
 ___async_unwind = 0; //@line 12729
 HEAP32[$ReallocAsyncCtx6 >> 2] = 54; //@line 12730
 sp = STACKTOP; //@line 12731
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
 sp = STACKTOP; //@line 10417
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10423
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 10426
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10429
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10430
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 10431
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 122; //@line 10434
    sp = STACKTOP; //@line 10435
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10438
    break;
   }
  }
 } while (0);
 return;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1163
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1171
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1173
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1175
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1177
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1179
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1181
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1183
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 1194
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 1195
 HEAP32[$10 >> 2] = 0; //@line 1196
 HEAP32[$12 >> 2] = 0; //@line 1197
 HEAP32[$14 >> 2] = 0; //@line 1198
 HEAP32[$2 >> 2] = 0; //@line 1199
 $33 = HEAP32[$16 >> 2] | 0; //@line 1200
 HEAP32[$16 >> 2] = $33 | $18; //@line 1205
 if ($20 | 0) {
  ___unlockfile($22); //@line 1208
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 1211
 return;
}
function __ZN4mbed7TimeoutD2Ev($0) {
 $0 = $0 | 0;
 var $2 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 408
 HEAP32[$0 >> 2] = 428; //@line 409
 __ZN4mbed6Ticker6detachEv($0); //@line 410
 $2 = HEAP32[$0 + 52 >> 2] | 0; //@line 412
 do {
  if ($2 | 0) {
   $6 = HEAP32[$2 + 8 >> 2] | 0; //@line 418
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 419
   FUNCTION_TABLE_vi[$6 & 255]($0 + 40 | 0); //@line 420
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 32; //@line 423
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 425
    sp = STACKTOP; //@line 426
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 429
    break;
   }
  }
 } while (0);
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 434
 __ZN4mbed10TimerEventD2Ev($0); //@line 435
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 33; //@line 438
  sp = STACKTOP; //@line 439
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 442
  return;
 }
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$0 = 0, $14 = 0, $17 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11416
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 11418
 $8 = $7 >> 8; //@line 11419
 if (!($7 & 1)) {
  $$0 = $8; //@line 11423
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 11428
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 11430
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 11433
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11438
 FUNCTION_TABLE_viiiiii[$17 & 3]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 11439
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 138; //@line 11442
  sp = STACKTOP; //@line 11443
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11446
  return;
 }
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10586
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 10592
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 10595
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 10598
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10599
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 10600
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 125; //@line 10603
    sp = STACKTOP; //@line 10604
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10607
    break;
   }
  }
 } while (0);
 return;
}
function ___dynamic_cast__async_cb_23($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13527
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13529
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13531
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 13537
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 13552
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 13568
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 13573
    break;
   }
  default:
   {
    $$0 = 0; //@line 13577
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 13582
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $13 = 0, $16 = 0, $6 = 0, $7 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11458
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 11460
 $7 = $6 >> 8; //@line 11461
 if (!($6 & 1)) {
  $$0 = $7; //@line 11465
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 11470
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 11472
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 11475
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11480
 FUNCTION_TABLE_viiiii[$16 & 3]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 11481
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 139; //@line 11484
  sp = STACKTOP; //@line 11485
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11488
  return;
 }
}
function _ticker_remove_event($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1387
 $4 = (HEAP32[$0 + 4 >> 2] | 0) + 4 | 0; //@line 1390
 $5 = HEAP32[$4 >> 2] | 0; //@line 1391
 if (($5 | 0) == ($1 | 0)) {
  HEAP32[$4 >> 2] = HEAP32[$1 + 12 >> 2]; //@line 1396
  $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1397
  _schedule_interrupt($0); //@line 1398
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 56; //@line 1401
   sp = STACKTOP; //@line 1402
   return;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1405
  return;
 } else {
  $$0 = $5; //@line 1408
 }
 do {
  if (!$$0) {
   label = 8; //@line 1413
   break;
  }
  $10 = $$0 + 12 | 0; //@line 1416
  $$0 = HEAP32[$10 >> 2] | 0; //@line 1417
 } while (($$0 | 0) != ($1 | 0));
 if ((label | 0) == 8) {
  return;
 }
 HEAP32[$10 >> 2] = HEAP32[$1 + 12 >> 2]; //@line 1430
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11373
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 11375
 $6 = $5 >> 8; //@line 11376
 if (!($5 & 1)) {
  $$0 = $6; //@line 11380
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 11385
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 11387
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 11390
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11395
 FUNCTION_TABLE_viiii[$15 & 3]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 11396
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 137; //@line 11399
  sp = STACKTOP; //@line 11400
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11403
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
 sp = STACKTOP; //@line 8354
 STACKTOP = STACKTOP + 256 | 0; //@line 8355
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 8355
 $5 = sp; //@line 8356
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 8362
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 8366
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 8369
   $$011 = $9; //@line 8370
   do {
    _out_670($0, $5, 256); //@line 8372
    $$011 = $$011 + -256 | 0; //@line 8373
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 8382
  } else {
   $$0$lcssa = $9; //@line 8384
  }
  _out_670($0, $5, $$0$lcssa); //@line 8386
 }
 STACKTOP = sp; //@line 8388
 return;
}
function __ZN4mbed11InterruptInD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13680
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13682
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 13684
 if (!$4) {
  __ZdlPv($2); //@line 13687
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 13692
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 13693
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 13694
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 24; //@line 13697
  $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 13698
  HEAP32[$9 >> 2] = $2; //@line 13699
  sp = STACKTOP; //@line 13700
  return;
 }
 ___async_unwind = 0; //@line 13703
 HEAP32[$ReallocAsyncCtx2 >> 2] = 24; //@line 13704
 $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 13705
 HEAP32[$9 >> 2] = $2; //@line 13706
 sp = STACKTOP; //@line 13707
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5863
 STACKTOP = STACKTOP + 32 | 0; //@line 5864
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 5864
 $vararg_buffer = sp; //@line 5865
 $3 = sp + 20 | 0; //@line 5866
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 5870
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 5872
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 5874
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 5876
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 5878
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 5883
  $10 = -1; //@line 5884
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 5887
 }
 STACKTOP = sp; //@line 5889
 return $10 | 0; //@line 5889
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 1443
 STACKTOP = STACKTOP + 16 | 0; //@line 1444
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1444
 $vararg_buffer = sp; //@line 1445
 HEAP32[$vararg_buffer >> 2] = $0; //@line 1446
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 1448
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 1450
 _mbed_error_printf(1347, $vararg_buffer); //@line 1451
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1452
 _mbed_die(); //@line 1453
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 57; //@line 1456
  sp = STACKTOP; //@line 1457
  STACKTOP = sp; //@line 1458
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1460
  STACKTOP = sp; //@line 1461
  return;
 }
}
function _schedule_interrupt__async_cb_12($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 12660
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12662
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12664
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12666
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 4 >> 2] | 0; //@line 12669
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(16) | 0; //@line 12670
 $10 = FUNCTION_TABLE_i[$9 & 3]() | 0; //@line 12671
 if (!___async) {
  HEAP32[___async_retval >> 2] = $10; //@line 12675
  ___async_unwind = 0; //@line 12676
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 53; //@line 12678
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $4; //@line 12680
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $6; //@line 12682
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $2; //@line 12684
 sp = STACKTOP; //@line 12685
 return;
}
function _initialize__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13844
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13846
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13848
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13850
 $9 = HEAP32[(HEAP32[$4 >> 2] | 0) + 24 >> 2] | 0; //@line 13853
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 13854
 $10 = FUNCTION_TABLE_i[$9 & 3]() | 0; //@line 13855
 if (!___async) {
  HEAP32[___async_retval >> 2] = $10; //@line 13859
  ___async_unwind = 0; //@line 13860
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 43; //@line 13862
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 13864
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 13866
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $4; //@line 13868
 sp = STACKTOP; //@line 13869
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 10139
 $5 = HEAP32[$4 >> 2] | 0; //@line 10140
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 10144
   HEAP32[$1 + 24 >> 2] = $3; //@line 10146
   HEAP32[$1 + 36 >> 2] = 1; //@line 10148
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 10152
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 10155
    HEAP32[$1 + 24 >> 2] = 2; //@line 10157
    HEAP8[$1 + 54 >> 0] = 1; //@line 10159
    break;
   }
   $10 = $1 + 24 | 0; //@line 10162
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 10166
   }
  }
 } while (0);
 return;
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 10689
 STACKTOP = STACKTOP + 16 | 0; //@line 10690
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10690
 $vararg_buffer = sp; //@line 10691
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 10692
 FUNCTION_TABLE_v[$0 & 15](); //@line 10693
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 127; //@line 10696
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 10698
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 10700
  sp = STACKTOP; //@line 10701
  STACKTOP = sp; //@line 10702
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 10704
  _abort_message(4944, $vararg_buffer); //@line 10705
 }
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 5970
 $3 = HEAP8[$1 >> 0] | 0; //@line 5971
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 5976
  $$lcssa8 = $2; //@line 5976
 } else {
  $$011 = $1; //@line 5978
  $$0710 = $0; //@line 5978
  do {
   $$0710 = $$0710 + 1 | 0; //@line 5980
   $$011 = $$011 + 1 | 0; //@line 5981
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 5982
   $9 = HEAP8[$$011 >> 0] | 0; //@line 5983
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 5988
  $$lcssa8 = $8; //@line 5988
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 5998
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5922
 STACKTOP = STACKTOP + 32 | 0; //@line 5923
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 5923
 $vararg_buffer = sp; //@line 5924
 HEAP32[$0 + 36 >> 2] = 1; //@line 5927
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 5935
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 5937
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 5939
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 5944
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 5947
 STACKTOP = sp; //@line 5948
 return $14 | 0; //@line 5948
}
function _mbed_die__async_cb_49($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 789
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 791
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 793
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 794
 _wait_ms(150); //@line 795
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 59; //@line 798
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 799
  HEAP32[$4 >> 2] = $2; //@line 800
  sp = STACKTOP; //@line 801
  return;
 }
 ___async_unwind = 0; //@line 804
 HEAP32[$ReallocAsyncCtx15 >> 2] = 59; //@line 805
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 806
 HEAP32[$4 >> 2] = $2; //@line 807
 sp = STACKTOP; //@line 808
 return;
}
function _mbed_die__async_cb_48($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 764
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 766
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 768
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 769
 _wait_ms(150); //@line 770
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 60; //@line 773
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 774
  HEAP32[$4 >> 2] = $2; //@line 775
  sp = STACKTOP; //@line 776
  return;
 }
 ___async_unwind = 0; //@line 779
 HEAP32[$ReallocAsyncCtx14 >> 2] = 60; //@line 780
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 781
 HEAP32[$4 >> 2] = $2; //@line 782
 sp = STACKTOP; //@line 783
 return;
}
function _mbed_die__async_cb_47($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 739
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 741
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 743
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 744
 _wait_ms(150); //@line 745
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 61; //@line 748
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 749
  HEAP32[$4 >> 2] = $2; //@line 750
  sp = STACKTOP; //@line 751
  return;
 }
 ___async_unwind = 0; //@line 754
 HEAP32[$ReallocAsyncCtx13 >> 2] = 61; //@line 755
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 756
 HEAP32[$4 >> 2] = $2; //@line 757
 sp = STACKTOP; //@line 758
 return;
}
function _mbed_die__async_cb_46($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 714
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 716
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 718
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 719
 _wait_ms(150); //@line 720
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 62; //@line 723
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 724
  HEAP32[$4 >> 2] = $2; //@line 725
  sp = STACKTOP; //@line 726
  return;
 }
 ___async_unwind = 0; //@line 729
 HEAP32[$ReallocAsyncCtx12 >> 2] = 62; //@line 730
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 731
 HEAP32[$4 >> 2] = $2; //@line 732
 sp = STACKTOP; //@line 733
 return;
}
function _mbed_die__async_cb_45($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 689
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 691
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 693
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 694
 _wait_ms(150); //@line 695
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 63; //@line 698
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 699
  HEAP32[$4 >> 2] = $2; //@line 700
  sp = STACKTOP; //@line 701
  return;
 }
 ___async_unwind = 0; //@line 704
 HEAP32[$ReallocAsyncCtx11 >> 2] = 63; //@line 705
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 706
 HEAP32[$4 >> 2] = $2; //@line 707
 sp = STACKTOP; //@line 708
 return;
}
function _mbed_die__async_cb_44($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 664
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 666
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 668
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 669
 _wait_ms(150); //@line 670
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 64; //@line 673
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 674
  HEAP32[$4 >> 2] = $2; //@line 675
  sp = STACKTOP; //@line 676
  return;
 }
 ___async_unwind = 0; //@line 679
 HEAP32[$ReallocAsyncCtx10 >> 2] = 64; //@line 680
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 681
 HEAP32[$4 >> 2] = $2; //@line 682
 sp = STACKTOP; //@line 683
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 414
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 416
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 418
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 419
 _wait_ms(150); //@line 420
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 58; //@line 423
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 424
  HEAP32[$4 >> 2] = $2; //@line 425
  sp = STACKTOP; //@line 426
  return;
 }
 ___async_unwind = 0; //@line 429
 HEAP32[$ReallocAsyncCtx16 >> 2] = 58; //@line 430
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 431
 HEAP32[$4 >> 2] = $2; //@line 432
 sp = STACKTOP; //@line 433
 return;
}
function _mbed_die__async_cb_43($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 639
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 641
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 643
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 644
 _wait_ms(150); //@line 645
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 65; //@line 648
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 649
  HEAP32[$4 >> 2] = $2; //@line 650
  sp = STACKTOP; //@line 651
  return;
 }
 ___async_unwind = 0; //@line 654
 HEAP32[$ReallocAsyncCtx9 >> 2] = 65; //@line 655
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 656
 HEAP32[$4 >> 2] = $2; //@line 657
 sp = STACKTOP; //@line 658
 return;
}
function _mbed_die__async_cb_42($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 614
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 616
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 618
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 619
 _wait_ms(400); //@line 620
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 66; //@line 623
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 624
  HEAP32[$4 >> 2] = $2; //@line 625
  sp = STACKTOP; //@line 626
  return;
 }
 ___async_unwind = 0; //@line 629
 HEAP32[$ReallocAsyncCtx8 >> 2] = 66; //@line 630
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 631
 HEAP32[$4 >> 2] = $2; //@line 632
 sp = STACKTOP; //@line 633
 return;
}
function _mbed_die__async_cb_41($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 589
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 591
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 593
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 594
 _wait_ms(400); //@line 595
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 67; //@line 598
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 599
  HEAP32[$4 >> 2] = $2; //@line 600
  sp = STACKTOP; //@line 601
  return;
 }
 ___async_unwind = 0; //@line 604
 HEAP32[$ReallocAsyncCtx7 >> 2] = 67; //@line 605
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 606
 HEAP32[$4 >> 2] = $2; //@line 607
 sp = STACKTOP; //@line 608
 return;
}
function _mbed_die__async_cb_40($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 564
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 566
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 568
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 569
 _wait_ms(400); //@line 570
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 68; //@line 573
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 574
  HEAP32[$4 >> 2] = $2; //@line 575
  sp = STACKTOP; //@line 576
  return;
 }
 ___async_unwind = 0; //@line 579
 HEAP32[$ReallocAsyncCtx6 >> 2] = 68; //@line 580
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 581
 HEAP32[$4 >> 2] = $2; //@line 582
 sp = STACKTOP; //@line 583
 return;
}
function _mbed_die__async_cb_39($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 539
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 541
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 543
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 544
 _wait_ms(400); //@line 545
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 69; //@line 548
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 549
  HEAP32[$4 >> 2] = $2; //@line 550
  sp = STACKTOP; //@line 551
  return;
 }
 ___async_unwind = 0; //@line 554
 HEAP32[$ReallocAsyncCtx5 >> 2] = 69; //@line 555
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 556
 HEAP32[$4 >> 2] = $2; //@line 557
 sp = STACKTOP; //@line 558
 return;
}
function _mbed_die__async_cb_38($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 514
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 516
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 518
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 519
 _wait_ms(400); //@line 520
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 70; //@line 523
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 524
  HEAP32[$4 >> 2] = $2; //@line 525
  sp = STACKTOP; //@line 526
  return;
 }
 ___async_unwind = 0; //@line 529
 HEAP32[$ReallocAsyncCtx4 >> 2] = 70; //@line 530
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 531
 HEAP32[$4 >> 2] = $2; //@line 532
 sp = STACKTOP; //@line 533
 return;
}
function _mbed_die__async_cb_37($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 489
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 491
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 493
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 494
 _wait_ms(400); //@line 495
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 71; //@line 498
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 499
  HEAP32[$4 >> 2] = $2; //@line 500
  sp = STACKTOP; //@line 501
  return;
 }
 ___async_unwind = 0; //@line 504
 HEAP32[$ReallocAsyncCtx3 >> 2] = 71; //@line 505
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 506
 HEAP32[$4 >> 2] = $2; //@line 507
 sp = STACKTOP; //@line 508
 return;
}
function _mbed_die__async_cb_36($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 464
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 466
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 468
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 469
 _wait_ms(400); //@line 470
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 72; //@line 473
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 474
  HEAP32[$4 >> 2] = $2; //@line 475
  sp = STACKTOP; //@line 476
  return;
 }
 ___async_unwind = 0; //@line 479
 HEAP32[$ReallocAsyncCtx2 >> 2] = 72; //@line 480
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 481
 HEAP32[$4 >> 2] = $2; //@line 482
 sp = STACKTOP; //@line 483
 return;
}
function _mbed_die__async_cb_35($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 439
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 441
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 443
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 444
 _wait_ms(400); //@line 445
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 73; //@line 448
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 449
  HEAP32[$4 >> 2] = $2; //@line 450
  sp = STACKTOP; //@line 451
  return;
 }
 ___async_unwind = 0; //@line 454
 HEAP32[$ReallocAsyncCtx >> 2] = 73; //@line 455
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 456
 HEAP32[$4 >> 2] = $2; //@line 457
 sp = STACKTOP; //@line 458
 return;
}
function __ZN4mbed10TimerEventC2Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 564
 HEAP32[$0 >> 2] = 372; //@line 565
 $1 = $0 + 8 | 0; //@line 566
 HEAP32[$1 >> 2] = 0; //@line 567
 HEAP32[$1 + 4 >> 2] = 0; //@line 567
 HEAP32[$1 + 8 >> 2] = 0; //@line 567
 HEAP32[$1 + 12 >> 2] = 0; //@line 567
 $2 = _get_us_ticker_data() | 0; //@line 568
 HEAP32[$0 + 24 >> 2] = $2; //@line 570
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 571
 _ticker_set_handler($2, 9); //@line 572
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 39; //@line 575
  sp = STACKTOP; //@line 576
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 579
  return;
 }
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 2296
 newDynamicTop = oldDynamicTop + increment | 0; //@line 2297
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 2301
  ___setErrNo(12); //@line 2302
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 2306
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 2310
   ___setErrNo(12); //@line 2311
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 2315
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 6093
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 6095
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 6101
  $11 = ___fwritex($0, $4, $3) | 0; //@line 6102
  if ($phitmp) {
   $13 = $11; //@line 6104
  } else {
   ___unlockfile($3); //@line 6106
   $13 = $11; //@line 6107
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 6111
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 6115
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 6118
 }
 return $15 | 0; //@line 6120
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 8215
 } else {
  $$056 = $2; //@line 8217
  $15 = $1; //@line 8217
  $8 = $0; //@line 8217
  while (1) {
   $14 = $$056 + -1 | 0; //@line 8225
   HEAP8[$14 >> 0] = HEAPU8[2607 + ($8 & 15) >> 0] | 0 | $3; //@line 8226
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 8227
   $15 = tempRet0; //@line 8228
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 8233
    break;
   } else {
    $$056 = $14; //@line 8236
   }
  }
 }
 return $$05$lcssa | 0; //@line 8240
}
function __ZSt9terminatev() {
 var $0 = 0, $16 = 0, $17 = 0, $2 = 0, $5 = 0, sp = 0;
 sp = STACKTOP; //@line 10654
 $0 = ___cxa_get_globals_fast() | 0; //@line 10655
 if ($0 | 0) {
  $2 = HEAP32[$0 >> 2] | 0; //@line 10658
  if ($2 | 0) {
   $5 = $2 + 48 | 0; //@line 10662
   if ((HEAP32[$5 >> 2] & -256 | 0) == 1126902528 ? (HEAP32[$5 + 4 >> 2] | 0) == 1129074247 : 0) {
    $16 = HEAP32[$2 + 12 >> 2] | 0; //@line 10674
    _emscripten_alloc_async_context(4, sp) | 0; //@line 10675
    __ZSt11__terminatePFvvE($16); //@line 10676
   }
  }
 }
 $17 = __ZSt13get_terminatev() | 0; //@line 10681
 _emscripten_alloc_async_context(4, sp) | 0; //@line 10682
 __ZSt11__terminatePFvvE($17); //@line 10683
}
function __GLOBAL__sub_I_main_cpp__async_cb_27($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13738
 HEAP32[1274] = 428; //@line 13739
 HEAP32[1284] = 0; //@line 13740
 HEAP32[1285] = 0; //@line 13740
 HEAP32[1286] = 0; //@line 13740
 HEAP32[1287] = 0; //@line 13740
 HEAP8[5152] = 1; //@line 13741
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 13742
 __ZN4mbed10TimerEventC2Ev(5160); //@line 13743
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 85; //@line 13746
  sp = STACKTOP; //@line 13747
  return;
 }
 ___async_unwind = 0; //@line 13750
 HEAP32[$ReallocAsyncCtx >> 2] = 85; //@line 13751
 sp = STACKTOP; //@line 13752
 return;
}
function _main__async_cb_66($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 1597
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1599
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1601
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1603
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(16) | 0; //@line 1604
 _puts(1951) | 0; //@line 1605
 if (!___async) {
  ___async_unwind = 0; //@line 1608
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 90; //@line 1610
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 1612
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 1614
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 1616
 sp = STACKTOP; //@line 1617
 return;
}
function _main__async_cb_65($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1571
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1573
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1575
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1577
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 1578
 _puts(2054) | 0; //@line 1579
 if (!___async) {
  ___async_unwind = 0; //@line 1582
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 91; //@line 1584
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $2; //@line 1586
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $4; //@line 1588
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $6; //@line 1590
 sp = STACKTOP; //@line 1591
 return;
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 6210
 $3 = HEAP8[$1 >> 0] | 0; //@line 6212
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 6216
 $7 = HEAP32[$0 >> 2] | 0; //@line 6217
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 6222
  HEAP32[$0 + 4 >> 2] = 0; //@line 6224
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 6226
  HEAP32[$0 + 28 >> 2] = $14; //@line 6228
  HEAP32[$0 + 20 >> 2] = $14; //@line 6230
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 6236
  $$0 = 0; //@line 6237
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 6240
  $$0 = -1; //@line 6241
 }
 return $$0 | 0; //@line 6243
}
function __ZN4mbed11InterruptInD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1353
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1355
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 1357
 if (!$4) {
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 1364
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 1365
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 1366
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 22; //@line 1369
  sp = STACKTOP; //@line 1370
  return;
 }
 ___async_unwind = 0; //@line 1373
 HEAP32[$ReallocAsyncCtx2 >> 2] = 22; //@line 1374
 sp = STACKTOP; //@line 1375
 return;
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 8252
 } else {
  $$06 = $2; //@line 8254
  $11 = $1; //@line 8254
  $7 = $0; //@line 8254
  while (1) {
   $10 = $$06 + -1 | 0; //@line 8259
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 8260
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 8261
   $11 = tempRet0; //@line 8262
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 8267
    break;
   } else {
    $$06 = $10; //@line 8270
   }
  }
 }
 return $$0$lcssa | 0; //@line 8274
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11530
 do {
  if (!$0) {
   $3 = 0; //@line 11534
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11536
   $2 = ___dynamic_cast($0, 240, 296, 0) | 0; //@line 11537
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 141; //@line 11540
    sp = STACKTOP; //@line 11541
    return 0; //@line 11542
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 11544
    $3 = ($2 | 0) != 0 & 1; //@line 11547
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 11552
}
function __ZN4mbed7Timeout7handlerEv__async_cb_61($0) {
 $0 = $0 | 0;
 var $4 = 0, $5 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1393
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1397
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 1399
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 1400
 FUNCTION_TABLE_vi[$5 & 255]($4); //@line 1401
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 37; //@line 1404
  sp = STACKTOP; //@line 1405
  return;
 }
 ___async_unwind = 0; //@line 1408
 HEAP32[$ReallocAsyncCtx >> 2] = 37; //@line 1409
 sp = STACKTOP; //@line 1410
 return;
}
function _invoke_ticker__async_cb_55($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1096
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 1102
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 1103
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 1104
 FUNCTION_TABLE_vi[$5 & 255]($6); //@line 1105
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 81; //@line 1108
  sp = STACKTOP; //@line 1109
  return;
 }
 ___async_unwind = 0; //@line 1112
 HEAP32[$ReallocAsyncCtx >> 2] = 81; //@line 1113
 sp = STACKTOP; //@line 1114
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 7896
 } else {
  $$04 = 0; //@line 7898
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 7901
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 7905
   $12 = $7 + 1 | 0; //@line 7906
   HEAP32[$0 >> 2] = $12; //@line 7907
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 7913
    break;
   } else {
    $$04 = $11; //@line 7916
   }
  }
 }
 return $$0$lcssa | 0; //@line 7920
}
function ___muldi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $x_sroa_0_0_extract_trunc = 0, $y_sroa_0_0_extract_trunc = 0, $1$0 = 0, $1$1 = 0;
 $x_sroa_0_0_extract_trunc = $a$0; //@line 1829
 $y_sroa_0_0_extract_trunc = $b$0; //@line 1830
 $1$0 = ___muldsi3($x_sroa_0_0_extract_trunc, $y_sroa_0_0_extract_trunc) | 0; //@line 1831
 $1$1 = tempRet0; //@line 1832
 return (tempRet0 = (Math_imul($a$1, $y_sroa_0_0_extract_trunc) | 0) + (Math_imul($b$1, $x_sroa_0_0_extract_trunc) | 0) + $1$1 | $1$1 & 0, $1$0 | 0 | 0) | 0; //@line 1834
}
function runPostSets() {}
function ___muldsi3($a, $b) {
 $a = $a | 0;
 $b = $b | 0;
 var $1 = 0, $2 = 0, $3 = 0, $6 = 0, $8 = 0, $11 = 0, $12 = 0;
 $1 = $a & 65535; //@line 1814
 $2 = $b & 65535; //@line 1815
 $3 = Math_imul($2, $1) | 0; //@line 1816
 $6 = $a >>> 16; //@line 1817
 $8 = ($3 >>> 16) + (Math_imul($2, $6) | 0) | 0; //@line 1818
 $11 = $b >>> 16; //@line 1819
 $12 = Math_imul($11, $1) | 0; //@line 1820
 return (tempRet0 = ($8 >>> 16) + (Math_imul($11, $6) | 0) + ((($8 & 65535) + $12 | 0) >>> 16) | 0, $8 + $12 << 16 | $3 & 65535 | 0) | 0; //@line 1821
}
function _ticker_set_handler($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 608
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 609
 _initialize($0); //@line 610
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 41; //@line 613
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 615
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 617
  sp = STACKTOP; //@line 618
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 621
  HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = $1; //@line 624
  return;
 }
}
function ___fflush_unlocked__async_cb_28($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13824
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13826
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13828
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13830
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 13832
 HEAP32[$4 >> 2] = 0; //@line 13833
 HEAP32[$6 >> 2] = 0; //@line 13834
 HEAP32[$8 >> 2] = 0; //@line 13835
 HEAP32[$10 >> 2] = 0; //@line 13836
 HEAP32[___async_retval >> 2] = 0; //@line 13838
 return;
}
function __ZN4mbed7TimeoutD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13330
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13332
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 13333
 __ZN4mbed10TimerEventD2Ev($2); //@line 13334
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 33; //@line 13337
  sp = STACKTOP; //@line 13338
  return;
 }
 ___async_unwind = 0; //@line 13341
 HEAP32[$ReallocAsyncCtx2 >> 2] = 33; //@line 13342
 sp = STACKTOP; //@line 13343
 return;
}
function __ZN4mbed6TickerD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12749
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12751
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 12752
 __ZN4mbed10TimerEventD2Ev($2); //@line 12753
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 76; //@line 12756
  sp = STACKTOP; //@line 12757
  return;
 }
 ___async_unwind = 0; //@line 12760
 HEAP32[$ReallocAsyncCtx2 >> 2] = 76; //@line 12761
 sp = STACKTOP; //@line 12762
 return;
}
function __Z11toggle_led2v() {
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2191
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2192
 _puts(1903) | 0; //@line 2193
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 87; //@line 2196
  sp = STACKTOP; //@line 2197
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2200
  $2 = (_emscripten_asm_const_ii(8, HEAP32[1313] | 0) | 0) == 0 & 1; //@line 2204
  _emscripten_asm_const_iii(0, HEAP32[1313] | 0, $2 | 0) | 0; //@line 2206
  return;
 }
}
function __ZN4mbed6Ticker7handlerEv($0) {
 $0 = $0 | 0;
 var $2 = 0, $5 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1983
 $2 = HEAP32[$0 + 52 >> 2] | 0; //@line 1985
 if (!$2) {
  return;
 }
 $5 = HEAP32[$2 >> 2] | 0; //@line 1991
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1992
 FUNCTION_TABLE_vi[$5 & 255]($0 + 40 | 0); //@line 1993
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 79; //@line 1996
  sp = STACKTOP; //@line 1997
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2000
 return;
}
function __Z10blink_led1v() {
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2170
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2171
 _puts(1820) | 0; //@line 2172
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 86; //@line 2175
  sp = STACKTOP; //@line 2176
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2179
  $2 = (_emscripten_asm_const_ii(8, HEAP32[1307] | 0) | 0) == 0 & 1; //@line 2183
  _emscripten_asm_const_iii(0, HEAP32[1307] | 0, $2 | 0) | 0; //@line 2185
  return;
 }
}
function __ZN4mbed11InterruptInC2E7PinName($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $3 = 0, $4 = 0, dest = 0, stop = 0;
 HEAP32[$0 >> 2] = 336; //@line 164
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
function __ZN4mbed6TickerD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11557
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11559
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 11560
 __ZN4mbed10TimerEventD2Ev($2); //@line 11561
 if (!___async) {
  ___async_unwind = 0; //@line 11564
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 78; //@line 11566
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 11568
 sp = STACKTOP; //@line 11569
 return;
}
function __ZN4mbed10TimerEventD2Ev($0) {
 $0 = $0 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 537
 HEAP32[$0 >> 2] = 372; //@line 538
 $2 = HEAP32[$0 + 24 >> 2] | 0; //@line 540
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 542
 _ticker_remove_event($2, $0 + 8 | 0); //@line 543
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 38; //@line 546
  sp = STACKTOP; //@line 547
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 550
  return;
 }
}
function __ZN4mbed7TimeoutD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1120
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1122
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 1123
 __ZN4mbed10TimerEventD2Ev($2); //@line 1124
 if (!___async) {
  ___async_unwind = 0; //@line 1127
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 35; //@line 1129
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 1131
 sp = STACKTOP; //@line 1132
 return;
}
function _emscripten_async_resume() {
 ___async = 0; //@line 2147
 ___async_unwind = 1; //@line 2148
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 2154
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 2158
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 2162
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 2164
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5733
 STACKTOP = STACKTOP + 16 | 0; //@line 5734
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 5734
 $vararg_buffer = sp; //@line 5735
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 5739
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 5741
 STACKTOP = sp; //@line 5742
 return $5 | 0; //@line 5742
}
function __ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2071
 $1 = HEAP32[$0 >> 2] | 0; //@line 2072
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2073
 FUNCTION_TABLE_v[$1 & 15](); //@line 2074
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 82; //@line 2077
  sp = STACKTOP; //@line 2078
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2081
  return;
 }
}
function __ZN4mbed10TimerEvent3irqEj($0) {
 $0 = $0 | 0;
 var $5 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 586
 $5 = HEAP32[(HEAP32[$0 >> 2] | 0) + 8 >> 2] | 0; //@line 591
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 592
 FUNCTION_TABLE_vi[$5 & 255]($0); //@line 593
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 40; //@line 596
  sp = STACKTOP; //@line 597
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 600
  return;
 }
}
function _handle_interrupt_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1808
 $2 = HEAP32[1306] | 0; //@line 1809
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1810
 FUNCTION_TABLE_vii[$2 & 3]($0, $1); //@line 1811
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 74; //@line 1814
  sp = STACKTOP; //@line 1815
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1818
  return;
 }
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 2089
 STACKTOP = STACKTOP + 16 | 0; //@line 2090
 $rem = __stackBase__ | 0; //@line 2091
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 2092
 STACKTOP = __stackBase__; //@line 2093
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 2094
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 1859
 if ((ret | 0) < 8) return ret | 0; //@line 1860
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 1861
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 1862
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 1863
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 1864
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 1865
}
function ___cxa_get_globals_fast() {
 var $3 = 0, sp = 0;
 sp = STACKTOP; //@line 9875
 STACKTOP = STACKTOP + 16 | 0; //@line 9876
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 9876
 if (!(_pthread_once(5948, 10) | 0)) {
  $3 = _pthread_getspecific(HEAP32[1488] | 0) | 0; //@line 9882
  STACKTOP = sp; //@line 9883
  return $3 | 0; //@line 9883
 } else {
  _abort_message(4792, sp); //@line 9885
 }
 return 0; //@line 9888
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10043
 }
 return;
}
function __Z12turn_led3_onv() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2212
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2213
 _puts(1924) | 0; //@line 2214
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 88; //@line 2217
  sp = STACKTOP; //@line 2218
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2221
  _emscripten_asm_const_iii(0, HEAP32[1319] | 0, 1) | 0; //@line 2223
  return;
 }
}
function __ZL25default_terminate_handlerv__async_cb_24($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13637
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13639
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13641
 HEAP32[$2 >> 2] = 4653; //@line 13642
 HEAP32[$2 + 4 >> 2] = $4; //@line 13644
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 13646
 _abort_message(4517, $2); //@line 13647
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 990
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 992
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 993
 _fputc(10, $2) | 0; //@line 994
 if (!___async) {
  ___async_unwind = 0; //@line 997
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 117; //@line 999
 sp = STACKTOP; //@line 1000
 return;
}
function _gpio_irq_init($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0;
 if (($1 | 0) == -1) {
  $$0 = -1; //@line 1831
  return $$0 | 0; //@line 1832
 }
 HEAP32[1306] = $2; //@line 1834
 HEAP32[$0 >> 2] = $1; //@line 1835
 HEAP32[$0 + 4 >> 2] = $1; //@line 1837
 _emscripten_asm_const_iii(3, $3 | 0, $1 | 0) | 0; //@line 1838
 $$0 = 0; //@line 1839
 return $$0 | 0; //@line 1840
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13385
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 13396
  $$0 = 1; //@line 13397
 } else {
  $$0 = 0; //@line 13399
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 13403
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 10637
 STACKTOP = STACKTOP + 16 | 0; //@line 10638
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10638
 _free($0); //@line 10640
 if (!(_pthread_setspecific(HEAP32[1488] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 10645
  return;
 } else {
  _abort_message(4891, sp); //@line 10647
 }
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 10119
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2118
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2119
 _emscripten_sleep($0 | 0); //@line 2120
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 83; //@line 2123
  sp = STACKTOP; //@line 2124
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2127
  return;
 }
}
function _main__async_cb_63($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 1508
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(4) | 0; //@line 1509
 _wait_ms(-1); //@line 1510
 if (!___async) {
  ___async_unwind = 0; //@line 1513
 }
 HEAP32[$ReallocAsyncCtx10 >> 2] = 98; //@line 1515
 sp = STACKTOP; //@line 1516
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 10183
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 10187
  }
 }
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var sp = 0;
 sp = STACKTOP; //@line 10622
 STACKTOP = STACKTOP + 16 | 0; //@line 10623
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10623
 if (!(_pthread_key_create(5952, 126) | 0)) {
  STACKTOP = sp; //@line 10628
  return;
 } else {
  _abort_message(4841, sp); //@line 10630
 }
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 2123
 HEAP32[new_frame + 4 >> 2] = sp; //@line 2125
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 2127
 ___async_cur_frame = new_frame; //@line 2128
 return ___async_cur_frame + 8 | 0; //@line 2129
}
function __GLOBAL__sub_I_main_cpp__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[1300] = 0; //@line 13729
 HEAP32[1301] = 0; //@line 13729
 HEAP32[1302] = 0; //@line 13729
 HEAP32[1303] = 0; //@line 13729
 HEAP8[5216] = 1; //@line 13730
 HEAP32[1290] = 352; //@line 13731
 __ZN4mbed11InterruptInC2E7PinName(5300, 1337); //@line 13732
 return;
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 13370
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 13374
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 13377
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 2112
  return low << bits; //@line 2113
 }
 tempRet0 = low << bits - 32; //@line 2115
 return 0; //@line 2116
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 2101
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 2102
 }
 tempRet0 = 0; //@line 2104
 return high >>> bits - 32 | 0; //@line 2105
}
function _fflush__async_cb_50($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 892
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 894
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 897
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_5($0) {
 $0 = $0 | 0;
 var $6 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11954
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 11956
 _gpio_irq_set($6 + 28 | 0, 2, 1); //@line 11958
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
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 12787
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 12790
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 12793
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 13491
 } else {
  $$0 = -1; //@line 13493
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 13496
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 6340
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 6346
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 6350
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 2378
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 2135
 stackRestore(___async_cur_frame | 0); //@line 2136
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 2137
}
function _fputc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1320
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 1321
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 1323
 return;
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 1794
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 1800
 _emscripten_asm_const_iii(2, $0 | 0, $1 | 0) | 0; //@line 1801
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 9337
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 9337
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 9339
 return $1 | 0; //@line 9340
}
function _gpio_init_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 1779
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 1785
 _emscripten_asm_const_iii(1, $0 | 0, $1 | 0) | 0; //@line 1786
 return;
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 5899
  $$0 = -1; //@line 5900
 } else {
  $$0 = $0; //@line 5902
 }
 return $$0 | 0; //@line 5904
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 1852
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 1853
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 1854
}
function __ZN4mbed6Ticker5setupEy($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $4 = 0;
 $4 = ___udivdi3($1 | 0, $2 | 0, 1e3, 0) | 0; //@line 2055
 _emscripten_asm_const_iii(7, $0 + 40 | 0, $4 | 0) | 0; //@line 2057
 return;
}
function __Z11toggle_led2v__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(8, HEAP32[1313] | 0) | 0) == 0 & 1; //@line 1082
 _emscripten_asm_const_iii(0, HEAP32[1313] | 0, $3 | 0) | 0; //@line 1084
 return;
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 2371
}
function __Z10blink_led1v__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(8, HEAP32[1307] | 0) | 0) == 0 & 1; //@line 406
 _emscripten_asm_const_iii(0, HEAP32[1307] | 0, $3 | 0) | 0; //@line 408
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
 l = a + c >>> 0; //@line 1844
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 1846
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 2364
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 8397
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 8400
 }
 return $$0 | 0; //@line 8402
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 2336
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 2081
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 13513
 return;
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 6080
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 6084
}
function _gpio_irq_set($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 _emscripten_asm_const_iiii(5, HEAP32[$0 + 4 >> 2] | 0, $1 | 0, $2 | 0) | 0; //@line 1861
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 2142
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 2143
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_8($0) {
 $0 = $0 | 0;
 _gpio_irq_set((HEAP32[$0 + 8 >> 2] | 0) + 28 | 0, 2, 0); //@line 12069
 return;
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 10722
 __ZdlPv($0); //@line 10723
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 10405
 __ZdlPv($0); //@line 10406
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 6476
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 6478
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 9933
 __ZdlPv($0); //@line 9934
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 13470
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
  ___fwritex($1, $2, $0) | 0; //@line 7882
 }
 return;
}
function _ticker_set_handler__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 4 >> 2] >> 2] = HEAP32[$0 + 8 >> 2]; //@line 390
 return;
}
function b141(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 2781
}
function __ZN4mbed8CallbackIFvvEE13function_moveIPS1_EEvPvPKv($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = HEAP32[$1 >> 2]; //@line 2091
 return;
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 10130
}
function __ZSt13get_terminatev() {
 var $0 = 0;
 $0 = HEAP32[241] | 0; //@line 10712
 HEAP32[241] = $0 + 0; //@line 10714
 return $0 | 0; //@line 10716
}
function _gpio_irq_free($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iii(4, HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 1850
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
 FUNCTION_TABLE_vii[index & 3](a1 | 0, a2 | 0); //@line 2357
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
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 2169
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_54($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b139(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 2778
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __Z12turn_led3_onv__async_cb($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iii(0, HEAP32[1319] | 0, 1) | 0; //@line 1341
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 8345
}
function _fputc__async_cb_59($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1333
 return;
}
function _fflush__async_cb_51($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 907
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 2329
}
function __ZN4mbed11InterruptInD0Ev__async_cb_26($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 13716
 return;
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(4944, HEAP32[$0 + 4 >> 2] | 0); //@line 13674
}
function b9(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 2400
 return 0; //@line 2400
}
function b8(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 2397
 return 0; //@line 2397
}
function b7(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(5); //@line 2394
 return 0; //@line 2394
}
function b6(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 2391
 return 0; //@line 2391
}
function __ZN4mbed6Ticker6detachEv($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_ii(6, $0 + 40 | 0) | 0; //@line 2065
 return;
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 255](a1 | 0); //@line 2350
}
function b137(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 2775
}
function __ZN4mbed7TimeoutD0Ev__async_cb_56($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 1141
 return;
}
function __ZN4mbed6TickerD0Ev__async_cb_1($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 11578
 return;
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 9590
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_25($0) {
 $0 = $0 | 0;
 return;
}
function _main__async_cb_70($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 1805
 return;
}
function dynCall_i(index) {
 index = index | 0;
 return FUNCTION_TABLE_i[index & 3]() | 0; //@line 2322
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_4($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 15](); //@line 2343
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 return;
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 5957
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIPS1_EEvPv($0) {
 $0 = $0 | 0;
 return;
}
function b4(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 2388
 return 0; //@line 2388
}
function b135(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(3); //@line 2772
}
function b134(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(0); //@line 2769
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
 _llvm_trap(); //@line 558
}
function _abort_message__async_cb_53($0) {
 $0 = $0 | 0;
 _abort(); //@line 1007
}
function ___ofl_lock() {
 ___lock(5936); //@line 6483
 return 5944; //@line 6484
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
 ___cxa_pure_virtual(); //@line 2406
}
function __ZN4mbed11InterruptInD2Ev__async_cb_60($0) {
 $0 = $0 | 0;
 return;
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed7Timeout7handlerEv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed10TimerEvent3irqEj__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 9511
}
function __ZN4mbed6Ticker7handlerEv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 9517
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
function __ZN4mbed7TimeoutD2Ev__async_cb_21($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6TickerD2Ev__async_cb_16($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_15($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_14($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_11($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_10($0) {
 $0 = $0 | 0;
 return;
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 9759
 return;
}
function _mbed_assert_internal__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b2() {
 nullFunc_i(3); //@line 2385
 return 0; //@line 2385
}
function b1() {
 nullFunc_i(0); //@line 2382
 return 0; //@line 2382
}
function _ticker_remove_event__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _handle_interrupt_in__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___ofl_unlock() {
 ___unlock(5936); //@line 6489
 return;
}
function b132(p0) {
 p0 = p0 | 0;
 nullFunc_vi(255); //@line 2766
}
function b131(p0) {
 p0 = p0 | 0;
 nullFunc_vi(254); //@line 2763
}
function b130(p0) {
 p0 = p0 | 0;
 nullFunc_vi(253); //@line 2760
}
function b129(p0) {
 p0 = p0 | 0;
 nullFunc_vi(252); //@line 2757
}
function b128(p0) {
 p0 = p0 | 0;
 nullFunc_vi(251); //@line 2754
}
function b127(p0) {
 p0 = p0 | 0;
 nullFunc_vi(250); //@line 2751
}
function b126(p0) {
 p0 = p0 | 0;
 nullFunc_vi(249); //@line 2748
}
function b125(p0) {
 p0 = p0 | 0;
 nullFunc_vi(248); //@line 2745
}
function b124(p0) {
 p0 = p0 | 0;
 nullFunc_vi(247); //@line 2742
}
function b123(p0) {
 p0 = p0 | 0;
 nullFunc_vi(246); //@line 2739
}
function b122(p0) {
 p0 = p0 | 0;
 nullFunc_vi(245); //@line 2736
}
function b121(p0) {
 p0 = p0 | 0;
 nullFunc_vi(244); //@line 2733
}
function b120(p0) {
 p0 = p0 | 0;
 nullFunc_vi(243); //@line 2730
}
function b119(p0) {
 p0 = p0 | 0;
 nullFunc_vi(242); //@line 2727
}
function b118(p0) {
 p0 = p0 | 0;
 nullFunc_vi(241); //@line 2724
}
function b117(p0) {
 p0 = p0 | 0;
 nullFunc_vi(240); //@line 2721
}
function b116(p0) {
 p0 = p0 | 0;
 nullFunc_vi(239); //@line 2718
}
function b115(p0) {
 p0 = p0 | 0;
 nullFunc_vi(238); //@line 2715
}
function b114(p0) {
 p0 = p0 | 0;
 nullFunc_vi(237); //@line 2712
}
function b113(p0) {
 p0 = p0 | 0;
 nullFunc_vi(236); //@line 2709
}
function b112(p0) {
 p0 = p0 | 0;
 nullFunc_vi(235); //@line 2706
}
function b111(p0) {
 p0 = p0 | 0;
 nullFunc_vi(234); //@line 2703
}
function b110(p0) {
 p0 = p0 | 0;
 nullFunc_vi(233); //@line 2700
}
function b109(p0) {
 p0 = p0 | 0;
 nullFunc_vi(232); //@line 2697
}
function b108(p0) {
 p0 = p0 | 0;
 nullFunc_vi(231); //@line 2694
}
function b107(p0) {
 p0 = p0 | 0;
 nullFunc_vi(230); //@line 2691
}
function b106(p0) {
 p0 = p0 | 0;
 nullFunc_vi(229); //@line 2688
}
function b105(p0) {
 p0 = p0 | 0;
 nullFunc_vi(228); //@line 2685
}
function b104(p0) {
 p0 = p0 | 0;
 nullFunc_vi(227); //@line 2682
}
function b103(p0) {
 p0 = p0 | 0;
 nullFunc_vi(226); //@line 2679
}
function b102(p0) {
 p0 = p0 | 0;
 nullFunc_vi(225); //@line 2676
}
function b101(p0) {
 p0 = p0 | 0;
 nullFunc_vi(224); //@line 2673
}
function b100(p0) {
 p0 = p0 | 0;
 nullFunc_vi(223); //@line 2670
}
function b99(p0) {
 p0 = p0 | 0;
 nullFunc_vi(222); //@line 2667
}
function b98(p0) {
 p0 = p0 | 0;
 nullFunc_vi(221); //@line 2664
}
function b97(p0) {
 p0 = p0 | 0;
 nullFunc_vi(220); //@line 2661
}
function b96(p0) {
 p0 = p0 | 0;
 nullFunc_vi(219); //@line 2658
}
function b95(p0) {
 p0 = p0 | 0;
 nullFunc_vi(218); //@line 2655
}
function b94(p0) {
 p0 = p0 | 0;
 nullFunc_vi(217); //@line 2652
}
function b93(p0) {
 p0 = p0 | 0;
 nullFunc_vi(216); //@line 2649
}
function b92(p0) {
 p0 = p0 | 0;
 nullFunc_vi(215); //@line 2646
}
function b91(p0) {
 p0 = p0 | 0;
 nullFunc_vi(214); //@line 2643
}
function b90(p0) {
 p0 = p0 | 0;
 nullFunc_vi(213); //@line 2640
}
function b89(p0) {
 p0 = p0 | 0;
 nullFunc_vi(212); //@line 2637
}
function b88(p0) {
 p0 = p0 | 0;
 nullFunc_vi(211); //@line 2634
}
function b87(p0) {
 p0 = p0 | 0;
 nullFunc_vi(210); //@line 2631
}
function b86(p0) {
 p0 = p0 | 0;
 nullFunc_vi(209); //@line 2628
}
function b85(p0) {
 p0 = p0 | 0;
 nullFunc_vi(208); //@line 2625
}
function b84(p0) {
 p0 = p0 | 0;
 nullFunc_vi(207); //@line 2622
}
function b83(p0) {
 p0 = p0 | 0;
 nullFunc_vi(206); //@line 2619
}
function b82(p0) {
 p0 = p0 | 0;
 nullFunc_vi(205); //@line 2616
}
function b81(p0) {
 p0 = p0 | 0;
 nullFunc_vi(204); //@line 2613
}
function b80(p0) {
 p0 = p0 | 0;
 nullFunc_vi(203); //@line 2610
}
function b79(p0) {
 p0 = p0 | 0;
 nullFunc_vi(202); //@line 2607
}
function b78(p0) {
 p0 = p0 | 0;
 nullFunc_vi(201); //@line 2604
}
function b77(p0) {
 p0 = p0 | 0;
 nullFunc_vi(200); //@line 2601
}
function b76(p0) {
 p0 = p0 | 0;
 nullFunc_vi(199); //@line 2598
}
function b75(p0) {
 p0 = p0 | 0;
 nullFunc_vi(198); //@line 2595
}
function b74(p0) {
 p0 = p0 | 0;
 nullFunc_vi(197); //@line 2592
}
function b73(p0) {
 p0 = p0 | 0;
 nullFunc_vi(196); //@line 2589
}
function b72(p0) {
 p0 = p0 | 0;
 nullFunc_vi(195); //@line 2586
}
function b71(p0) {
 p0 = p0 | 0;
 nullFunc_vi(194); //@line 2583
}
function b70(p0) {
 p0 = p0 | 0;
 nullFunc_vi(193); //@line 2580
}
function b69(p0) {
 p0 = p0 | 0;
 nullFunc_vi(192); //@line 2577
}
function b68(p0) {
 p0 = p0 | 0;
 nullFunc_vi(191); //@line 2574
}
function b67(p0) {
 p0 = p0 | 0;
 nullFunc_vi(190); //@line 2571
}
function b66(p0) {
 p0 = p0 | 0;
 nullFunc_vi(189); //@line 2568
}
function b65(p0) {
 p0 = p0 | 0;
 nullFunc_vi(188); //@line 2565
}
function b64(p0) {
 p0 = p0 | 0;
 nullFunc_vi(187); //@line 2562
}
function b63(p0) {
 p0 = p0 | 0;
 nullFunc_vi(186); //@line 2559
}
function b62(p0) {
 p0 = p0 | 0;
 nullFunc_vi(185); //@line 2556
}
function b61(p0) {
 p0 = p0 | 0;
 nullFunc_vi(184); //@line 2553
}
function b60(p0) {
 p0 = p0 | 0;
 nullFunc_vi(183); //@line 2550
}
function b59(p0) {
 p0 = p0 | 0;
 nullFunc_vi(182); //@line 2547
}
function b58(p0) {
 p0 = p0 | 0;
 nullFunc_vi(181); //@line 2544
}
function b57(p0) {
 p0 = p0 | 0;
 nullFunc_vi(180); //@line 2541
}
function b56(p0) {
 p0 = p0 | 0;
 nullFunc_vi(179); //@line 2538
}
function b55(p0) {
 p0 = p0 | 0;
 nullFunc_vi(178); //@line 2535
}
function b54(p0) {
 p0 = p0 | 0;
 nullFunc_vi(177); //@line 2532
}
function b53(p0) {
 p0 = p0 | 0;
 nullFunc_vi(176); //@line 2529
}
function b52(p0) {
 p0 = p0 | 0;
 nullFunc_vi(175); //@line 2526
}
function b51(p0) {
 p0 = p0 | 0;
 nullFunc_vi(174); //@line 2523
}
function b50(p0) {
 p0 = p0 | 0;
 nullFunc_vi(173); //@line 2520
}
function b49(p0) {
 p0 = p0 | 0;
 nullFunc_vi(172); //@line 2517
}
function b48(p0) {
 p0 = p0 | 0;
 nullFunc_vi(171); //@line 2514
}
function b47(p0) {
 p0 = p0 | 0;
 nullFunc_vi(170); //@line 2511
}
function b46(p0) {
 p0 = p0 | 0;
 nullFunc_vi(169); //@line 2508
}
function b45(p0) {
 p0 = p0 | 0;
 nullFunc_vi(168); //@line 2505
}
function b44(p0) {
 p0 = p0 | 0;
 nullFunc_vi(167); //@line 2502
}
function b43(p0) {
 p0 = p0 | 0;
 nullFunc_vi(166); //@line 2499
}
function b42(p0) {
 p0 = p0 | 0;
 nullFunc_vi(165); //@line 2496
}
function b41(p0) {
 p0 = p0 | 0;
 nullFunc_vi(164); //@line 2493
}
function b40(p0) {
 p0 = p0 | 0;
 nullFunc_vi(163); //@line 2490
}
function b39(p0) {
 p0 = p0 | 0;
 nullFunc_vi(162); //@line 2487
}
function b38(p0) {
 p0 = p0 | 0;
 nullFunc_vi(161); //@line 2484
}
function b37(p0) {
 p0 = p0 | 0;
 nullFunc_vi(160); //@line 2481
}
function b36(p0) {
 p0 = p0 | 0;
 nullFunc_vi(159); //@line 2478
}
function b35(p0) {
 p0 = p0 | 0;
 nullFunc_vi(158); //@line 2475
}
function b34(p0) {
 p0 = p0 | 0;
 nullFunc_vi(157); //@line 2472
}
function b33(p0) {
 p0 = p0 | 0;
 nullFunc_vi(156); //@line 2469
}
function b32(p0) {
 p0 = p0 | 0;
 nullFunc_vi(155); //@line 2466
}
function b31(p0) {
 p0 = p0 | 0;
 nullFunc_vi(154); //@line 2463
}
function b30(p0) {
 p0 = p0 | 0;
 nullFunc_vi(153); //@line 2460
}
function b29(p0) {
 p0 = p0 | 0;
 nullFunc_vi(152); //@line 2457
}
function b28(p0) {
 p0 = p0 | 0;
 nullFunc_vi(151); //@line 2454
}
function b27(p0) {
 p0 = p0 | 0;
 nullFunc_vi(150); //@line 2451
}
function b26(p0) {
 p0 = p0 | 0;
 nullFunc_vi(149); //@line 2448
}
function b25(p0) {
 p0 = p0 | 0;
 nullFunc_vi(148); //@line 2445
}
function b24(p0) {
 p0 = p0 | 0;
 nullFunc_vi(147); //@line 2442
}
function b23(p0) {
 p0 = p0 | 0;
 nullFunc_vi(146); //@line 2439
}
function b22(p0) {
 p0 = p0 | 0;
 nullFunc_vi(145); //@line 2436
}
function b21(p0) {
 p0 = p0 | 0;
 nullFunc_vi(144); //@line 2433
}
function b20(p0) {
 p0 = p0 | 0;
 nullFunc_vi(143); //@line 2430
}
function b19(p0) {
 p0 = p0 | 0;
 nullFunc_vi(142); //@line 2427
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 5915
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 6132
}
function b18(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 2424
}
function _us_ticker_set_interrupt($0) {
 $0 = $0 | 0;
 return;
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _initialize__async_cb_32($0) {
 $0 = $0 | 0;
 return;
}
function ___clang_call_terminate__async_cb($0) {
 $0 = $0 | 0;
}
function _us_ticker_get_info() {
 return 452; //@line 2113
}
function _get_us_ticker_data() {
 return 384; //@line 1436
}
function __ZSt9terminatev__async_cb_57($0) {
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
 return 5932; //@line 5909
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
 return 0; //@line 1872
}
function _pthread_self() {
 return 720; //@line 5962
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
function b16() {
 nullFunc_v(15); //@line 2421
}
function b15() {
 nullFunc_v(14); //@line 2418
}
function b14() {
 nullFunc_v(13); //@line 2415
}
function b13() {
 nullFunc_v(12); //@line 2412
}
function b12() {
 nullFunc_v(11); //@line 2409
}
function b11() {
 nullFunc_v(0); //@line 2403
}
function _us_ticker_init() {
 return;
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_i = [b1,_us_ticker_read,_us_ticker_get_info,b2];
var FUNCTION_TABLE_ii = [b4,___stdio_close];
var FUNCTION_TABLE_iiii = [b6,___stdio_write,___stdio_seek,___stdout_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b7,b8,b9];
var FUNCTION_TABLE_v = [b11,___cxa_pure_virtual__wrapper,_us_ticker_init,_us_ticker_disable_interrupt,_us_ticker_clear_interrupt,_us_ticker_fire_interrupt,__ZL25default_terminate_handlerv,__Z10blink_led1v,__Z12turn_led3_onv,__Z11toggle_led2v,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev,b12,b13,b14,b15,b16];
var FUNCTION_TABLE_vi = [b18,__ZN4mbed11InterruptInD2Ev,__ZN4mbed11InterruptInD0Ev,__ZN4mbed7TimeoutD2Ev,__ZN4mbed7TimeoutD0Ev,__ZN4mbed7Timeout7handlerEv,__ZN4mbed10TimerEventD2Ev,__ZN4mbed10TimerEventD0Ev,_us_ticker_set_interrupt,__ZN4mbed10TimerEvent3irqEj,__ZN4mbed6TickerD2Ev,__ZN4mbed6TickerD0Ev,__ZN4mbed6Ticker7handlerEv,__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv,__ZN4mbed8CallbackIFvvEE13function_dtorIPS1_EEvPv,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed11InterruptInD2Ev__async_cb,__ZN4mbed11InterruptInD2Ev__async_cb_60,__ZN4mbed11InterruptInD0Ev__async_cb,__ZN4mbed11InterruptInD0Ev__async_cb_26,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_25,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_5
,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_6,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_7,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_8,__ZN4mbed7TimeoutD2Ev__async_cb,__ZN4mbed7TimeoutD2Ev__async_cb_21,__ZN4mbed7TimeoutD0Ev__async_cb,__ZN4mbed7TimeoutD0Ev__async_cb_56,__ZN4mbed7Timeout7handlerEv__async_cb_61,__ZN4mbed7Timeout7handlerEv__async_cb,__ZN4mbed10TimerEventD2Ev__async_cb,__ZN4mbed10TimerEventC2Ev__async_cb,__ZN4mbed10TimerEvent3irqEj__async_cb,_ticker_set_handler__async_cb,_initialize__async_cb,_initialize__async_cb_29,_initialize__async_cb_34,_initialize__async_cb_33,_initialize__async_cb_30,_initialize__async_cb_31,_initialize__async_cb_32,_schedule_interrupt__async_cb,_schedule_interrupt__async_cb_10,_schedule_interrupt__async_cb_11,_schedule_interrupt__async_cb_12,_schedule_interrupt__async_cb_13,_schedule_interrupt__async_cb_14,_schedule_interrupt__async_cb_15,_ticker_remove_event__async_cb,_mbed_assert_internal__async_cb,_mbed_die__async_cb_49
,_mbed_die__async_cb_48,_mbed_die__async_cb_47,_mbed_die__async_cb_46,_mbed_die__async_cb_45,_mbed_die__async_cb_44,_mbed_die__async_cb_43,_mbed_die__async_cb_42,_mbed_die__async_cb_41,_mbed_die__async_cb_40,_mbed_die__async_cb_39,_mbed_die__async_cb_38,_mbed_die__async_cb_37,_mbed_die__async_cb_36,_mbed_die__async_cb_35,_mbed_die__async_cb,_handle_interrupt_in__async_cb,__ZN4mbed6TickerD2Ev__async_cb,__ZN4mbed6TickerD2Ev__async_cb_16,__ZN4mbed6TickerD0Ev__async_cb,__ZN4mbed6TickerD0Ev__async_cb_1,__ZN4mbed6Ticker7handlerEv__async_cb,_invoke_ticker__async_cb_55,_invoke_ticker__async_cb,__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv__async_cb,_wait_ms__async_cb,__GLOBAL__sub_I_main_cpp__async_cb_27,__GLOBAL__sub_I_main_cpp__async_cb,__Z10blink_led1v__async_cb,__Z11toggle_led2v__async_cb,__Z12turn_led3_onv__async_cb
,_main__async_cb_66,_main__async_cb_65,_main__async_cb_64,_main__async_cb_68,_main__async_cb,_main__async_cb_67,_main__async_cb_62,_main__async_cb_69,_main__async_cb_63,_main__async_cb_70,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_2,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_3,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_4,___overflow__async_cb,_fflush__async_cb_51,_fflush__async_cb_50,_fflush__async_cb_52,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_28,_vfprintf__async_cb,_fputc__async_cb_59,_fputc__async_cb,_puts__async_cb,__ZL25default_terminate_handlerv__async_cb,__ZL25default_terminate_handlerv__async_cb_24,_abort_message__async_cb,_abort_message__async_cb_53,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_22
,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_23,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_54,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_9,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_20,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_19,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_18,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_17,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_58,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b19,b20,b21,b22,b23,b24,b25
,b26,b27,b28,b29,b30,b31,b32,b33,b34,b35,b36,b37,b38,b39,b40,b41,b42,b43,b44,b45,b46,b47,b48,b49,b50,b51,b52,b53,b54,b55
,b56,b57,b58,b59,b60,b61,b62,b63,b64,b65,b66,b67,b68,b69,b70,b71,b72,b73,b74,b75,b76,b77,b78,b79,b80,b81,b82,b83,b84,b85
,b86,b87,b88,b89,b90,b91,b92,b93,b94,b95,b96,b97,b98,b99,b100,b101,b102,b103,b104,b105,b106,b107,b108,b109,b110,b111,b112,b113,b114,b115
,b116,b117,b118,b119,b120,b121,b122,b123,b124,b125,b126,b127,b128,b129,b130,b131,b132];
var FUNCTION_TABLE_vii = [b134,__ZN4mbed8CallbackIFvvEE13function_moveIPS1_EEvPvPKv,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event,b135];
var FUNCTION_TABLE_viiii = [b137,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi];
var FUNCTION_TABLE_viiiii = [b139,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib];
var FUNCTION_TABLE_viiiiii = [b141,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib];

  return { __GLOBAL__sub_I_main_cpp: __GLOBAL__sub_I_main_cpp, ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___muldi3: ___muldi3, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _fflush: _fflush, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _invoke_ticker: _invoke_ticker, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_i: dynCall_i, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
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
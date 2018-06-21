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

STATICTOP = STATIC_BASE + 7568;
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
var debug_table_vi = ["0", "__ZN4mbed11InterruptInD2Ev", "__ZN4mbed11InterruptInD0Ev", "__ZN4mbed7TimeoutD2Ev", "__ZN4mbed7TimeoutD0Ev", "__ZN4mbed7Timeout7handlerEv", "__ZN4mbed10TimerEventD2Ev", "__ZN4mbed10TimerEventD0Ev", "_mbed_trace_default_print", "__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv", "__ZN4mbed8CallbackIFvvEE13function_dtorIPS1_EEvPv", "_us_ticker_set_interrupt", "__ZN4mbed6TickerD2Ev", "__ZN4mbed6TickerD0Ev", "__ZN4mbed6Ticker7handlerEv", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "__ZN10__cxxabiv121__vmi_class_type_infoD0Ev", "__ZN4mbed11InterruptInD2Ev__async_cb", "__ZN4mbed11InterruptInD2Ev__async_cb_9", "__ZN4mbed11InterruptInD0Ev__async_cb", "__ZN4mbed11InterruptInD0Ev__async_cb_28", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_63", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_44", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_45", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_46", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_47", "__ZN4mbed7TimeoutD2Ev__async_cb", "__ZN4mbed7TimeoutD2Ev__async_cb_8", "__ZN4mbed7TimeoutD0Ev__async_cb", "__ZN4mbed7TimeoutD0Ev__async_cb_70", "__ZN4mbed7Timeout7handlerEv__async_cb", "__ZN4mbed7Timeout7handlerEv__async_cb_74", "__ZN4mbed7Timeout7handlerEv__async_cb_72", "__ZN4mbed7Timeout7handlerEv__async_cb_73", "__ZN4mbed10TimerEventD2Ev__async_cb", "__ZN4mbed10TimerEvent3irqEj", "__ZN4mbed10TimerEventC2Ev__async_cb", "__ZN4mbed10TimerEvent3irqEj__async_cb", "_mbed_trace_default_print__async_cb", "_mbed_tracef__async_cb", "_mbed_vtracef__async_cb", "_mbed_vtracef__async_cb_25", "_mbed_vtracef__async_cb_15", "_mbed_vtracef__async_cb_16", "_mbed_vtracef__async_cb_17", "_mbed_vtracef__async_cb_24", "_mbed_vtracef__async_cb_18", "_mbed_vtracef__async_cb_23", "_mbed_vtracef__async_cb_19", "_mbed_vtracef__async_cb_20", "_mbed_vtracef__async_cb_21", "_mbed_vtracef__async_cb_22", "__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv__async_cb", "_ticker_set_handler__async_cb", "_initialize__async_cb", "_initialize__async_cb_54", "_initialize__async_cb_59", "_initialize__async_cb_58", "_initialize__async_cb_55", "_initialize__async_cb_56", "_initialize__async_cb_57", "_schedule_interrupt__async_cb", "_schedule_interrupt__async_cb_64", "_schedule_interrupt__async_cb_65", "_schedule_interrupt__async_cb_66", "_schedule_interrupt__async_cb_67", "_schedule_interrupt__async_cb_68", "_schedule_interrupt__async_cb_69", "_ticker_remove_event__async_cb", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_43", "_mbed_die__async_cb_42", "_mbed_die__async_cb_41", "_mbed_die__async_cb_40", "_mbed_die__async_cb_39", "_mbed_die__async_cb_38", "_mbed_die__async_cb_37", "_mbed_die__async_cb_36", "_mbed_die__async_cb_35", "_mbed_die__async_cb_34", "_mbed_die__async_cb_33", "_mbed_die__async_cb_32", "_mbed_die__async_cb_31", "_mbed_die__async_cb_30", "_mbed_die__async_cb_29", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_vfprintf__async_cb", "_mbed_error_vfprintf__async_cb_86", "_mbed_error_vfprintf__async_cb_85", "_handle_interrupt_in__async_cb", "_serial_putc__async_cb_71", "_serial_putc__async_cb", "__ZN4mbed6TickerD2Ev__async_cb", "__ZN4mbed6TickerD2Ev__async_cb_26", "__ZN4mbed6TickerD0Ev__async_cb", "__ZN4mbed6TickerD0Ev__async_cb_5", "__ZN4mbed6Ticker7handlerEv__async_cb", "_invoke_ticker__async_cb_84", "_invoke_ticker__async_cb", "_wait_ms__async_cb", "__GLOBAL__sub_I_main_cpp__async_cb_60", "__GLOBAL__sub_I_main_cpp__async_cb", "__Z10blink_led1v__async_cb", "__Z11toggle_led2v__async_cb", "__Z12turn_led3_onv__async_cb", "_main__async_cb_79", "_main__async_cb_78", "_main__async_cb_77", "_main__async_cb_81", "_main__async_cb", "_main__async_cb_80", "_main__async_cb_75", "_main__async_cb_82", "_main__async_cb_76", "_main__async_cb_83", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_2", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_3", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_4", "_putc__async_cb_49", "_putc__async_cb", "___overflow__async_cb", "_fflush__async_cb_13", "_fflush__async_cb_12", "_fflush__async_cb_14", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_6", "_vfprintf__async_cb", "_snprintf__async_cb", "_vsnprintf__async_cb", "_fputc__async_cb_1", "_fputc__async_cb", "_puts__async_cb", "__ZL25default_terminate_handlerv__async_cb", "__ZL25default_terminate_handlerv__async_cb_87", "_abort_message__async_cb", "_abort_message__async_cb_7", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_10", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_62", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_27", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv", "__ZSt11__terminatePFvvE__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_61", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_53", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_52", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_51", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_50", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_48", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
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
 sp = STACKTOP; //@line 4063
 STACKTOP = STACKTOP + 16 | 0; //@line 4064
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4064
 $1 = sp; //@line 4065
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 4072
   $7 = $6 >>> 3; //@line 4073
   $8 = HEAP32[1484] | 0; //@line 4074
   $9 = $8 >>> $7; //@line 4075
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 4081
    $16 = 5976 + ($14 << 1 << 2) | 0; //@line 4083
    $17 = $16 + 8 | 0; //@line 4084
    $18 = HEAP32[$17 >> 2] | 0; //@line 4085
    $19 = $18 + 8 | 0; //@line 4086
    $20 = HEAP32[$19 >> 2] | 0; //@line 4087
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1484] = $8 & ~(1 << $14); //@line 4094
     } else {
      if ((HEAP32[1488] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 4099
      }
      $27 = $20 + 12 | 0; //@line 4102
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 4106
       HEAP32[$17 >> 2] = $20; //@line 4107
       break;
      } else {
       _abort(); //@line 4110
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 4115
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 4118
    $34 = $18 + $30 + 4 | 0; //@line 4120
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 4123
    $$0 = $19; //@line 4124
    STACKTOP = sp; //@line 4125
    return $$0 | 0; //@line 4125
   }
   $37 = HEAP32[1486] | 0; //@line 4127
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 4133
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 4136
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 4139
     $49 = $47 >>> 12 & 16; //@line 4141
     $50 = $47 >>> $49; //@line 4142
     $52 = $50 >>> 5 & 8; //@line 4144
     $54 = $50 >>> $52; //@line 4146
     $56 = $54 >>> 2 & 4; //@line 4148
     $58 = $54 >>> $56; //@line 4150
     $60 = $58 >>> 1 & 2; //@line 4152
     $62 = $58 >>> $60; //@line 4154
     $64 = $62 >>> 1 & 1; //@line 4156
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 4159
     $69 = 5976 + ($67 << 1 << 2) | 0; //@line 4161
     $70 = $69 + 8 | 0; //@line 4162
     $71 = HEAP32[$70 >> 2] | 0; //@line 4163
     $72 = $71 + 8 | 0; //@line 4164
     $73 = HEAP32[$72 >> 2] | 0; //@line 4165
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 4171
       HEAP32[1484] = $77; //@line 4172
       $98 = $77; //@line 4173
      } else {
       if ((HEAP32[1488] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 4178
       }
       $80 = $73 + 12 | 0; //@line 4181
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 4185
        HEAP32[$70 >> 2] = $73; //@line 4186
        $98 = $8; //@line 4187
        break;
       } else {
        _abort(); //@line 4190
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 4195
     $84 = $83 - $6 | 0; //@line 4196
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 4199
     $87 = $71 + $6 | 0; //@line 4200
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 4203
     HEAP32[$71 + $83 >> 2] = $84; //@line 4205
     if ($37 | 0) {
      $92 = HEAP32[1489] | 0; //@line 4208
      $93 = $37 >>> 3; //@line 4209
      $95 = 5976 + ($93 << 1 << 2) | 0; //@line 4211
      $96 = 1 << $93; //@line 4212
      if (!($98 & $96)) {
       HEAP32[1484] = $98 | $96; //@line 4217
       $$0199 = $95; //@line 4219
       $$pre$phiZ2D = $95 + 8 | 0; //@line 4219
      } else {
       $101 = $95 + 8 | 0; //@line 4221
       $102 = HEAP32[$101 >> 2] | 0; //@line 4222
       if ((HEAP32[1488] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 4226
       } else {
        $$0199 = $102; //@line 4229
        $$pre$phiZ2D = $101; //@line 4229
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 4232
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 4234
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 4236
      HEAP32[$92 + 12 >> 2] = $95; //@line 4238
     }
     HEAP32[1486] = $84; //@line 4240
     HEAP32[1489] = $87; //@line 4241
     $$0 = $72; //@line 4242
     STACKTOP = sp; //@line 4243
     return $$0 | 0; //@line 4243
    }
    $108 = HEAP32[1485] | 0; //@line 4245
    if (!$108) {
     $$0197 = $6; //@line 4248
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 4252
     $114 = $112 >>> 12 & 16; //@line 4254
     $115 = $112 >>> $114; //@line 4255
     $117 = $115 >>> 5 & 8; //@line 4257
     $119 = $115 >>> $117; //@line 4259
     $121 = $119 >>> 2 & 4; //@line 4261
     $123 = $119 >>> $121; //@line 4263
     $125 = $123 >>> 1 & 2; //@line 4265
     $127 = $123 >>> $125; //@line 4267
     $129 = $127 >>> 1 & 1; //@line 4269
     $134 = HEAP32[6240 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 4274
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 4278
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4284
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 4287
      $$0193$lcssa$i = $138; //@line 4287
     } else {
      $$01926$i = $134; //@line 4289
      $$01935$i = $138; //@line 4289
      $146 = $143; //@line 4289
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 4294
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 4295
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 4296
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 4297
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4303
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 4306
        $$0193$lcssa$i = $$$0193$i; //@line 4306
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 4309
        $$01935$i = $$$0193$i; //@line 4309
       }
      }
     }
     $157 = HEAP32[1488] | 0; //@line 4313
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 4316
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 4319
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 4322
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 4326
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 4328
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 4332
       $176 = HEAP32[$175 >> 2] | 0; //@line 4333
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 4336
        $179 = HEAP32[$178 >> 2] | 0; //@line 4337
        if (!$179) {
         $$3$i = 0; //@line 4340
         break;
        } else {
         $$1196$i = $179; //@line 4343
         $$1198$i = $178; //@line 4343
        }
       } else {
        $$1196$i = $176; //@line 4346
        $$1198$i = $175; //@line 4346
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 4349
        $182 = HEAP32[$181 >> 2] | 0; //@line 4350
        if ($182 | 0) {
         $$1196$i = $182; //@line 4353
         $$1198$i = $181; //@line 4353
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 4356
        $185 = HEAP32[$184 >> 2] | 0; //@line 4357
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 4362
         $$1198$i = $184; //@line 4362
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 4367
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 4370
        $$3$i = $$1196$i; //@line 4371
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 4376
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 4379
       }
       $169 = $167 + 12 | 0; //@line 4382
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 4386
       }
       $172 = $164 + 8 | 0; //@line 4389
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 4393
        HEAP32[$172 >> 2] = $167; //@line 4394
        $$3$i = $164; //@line 4395
        break;
       } else {
        _abort(); //@line 4398
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 4407
       $191 = 6240 + ($190 << 2) | 0; //@line 4408
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 4413
         if (!$$3$i) {
          HEAP32[1485] = $108 & ~(1 << $190); //@line 4419
          break L73;
         }
        } else {
         if ((HEAP32[1488] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 4426
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 4434
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1488] | 0; //@line 4444
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 4447
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 4451
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 4453
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 4459
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 4463
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 4465
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 4471
       if ($214 | 0) {
        if ((HEAP32[1488] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 4477
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 4481
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 4483
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 4491
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 4494
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 4496
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 4499
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 4503
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 4506
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 4508
      if ($37 | 0) {
       $234 = HEAP32[1489] | 0; //@line 4511
       $235 = $37 >>> 3; //@line 4512
       $237 = 5976 + ($235 << 1 << 2) | 0; //@line 4514
       $238 = 1 << $235; //@line 4515
       if (!($8 & $238)) {
        HEAP32[1484] = $8 | $238; //@line 4520
        $$0189$i = $237; //@line 4522
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 4522
       } else {
        $242 = $237 + 8 | 0; //@line 4524
        $243 = HEAP32[$242 >> 2] | 0; //@line 4525
        if ((HEAP32[1488] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 4529
        } else {
         $$0189$i = $243; //@line 4532
         $$pre$phi$iZ2D = $242; //@line 4532
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 4535
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 4537
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 4539
       HEAP32[$234 + 12 >> 2] = $237; //@line 4541
      }
      HEAP32[1486] = $$0193$lcssa$i; //@line 4543
      HEAP32[1489] = $159; //@line 4544
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 4547
     STACKTOP = sp; //@line 4548
     return $$0 | 0; //@line 4548
    }
   } else {
    $$0197 = $6; //@line 4551
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 4556
   } else {
    $251 = $0 + 11 | 0; //@line 4558
    $252 = $251 & -8; //@line 4559
    $253 = HEAP32[1485] | 0; //@line 4560
    if (!$253) {
     $$0197 = $252; //@line 4563
    } else {
     $255 = 0 - $252 | 0; //@line 4565
     $256 = $251 >>> 8; //@line 4566
     if (!$256) {
      $$0358$i = 0; //@line 4569
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 4573
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 4577
       $262 = $256 << $261; //@line 4578
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 4581
       $267 = $262 << $265; //@line 4583
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 4586
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 4591
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 4597
      }
     }
     $282 = HEAP32[6240 + ($$0358$i << 2) >> 2] | 0; //@line 4601
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 4605
       $$3$i203 = 0; //@line 4605
       $$3350$i = $255; //@line 4605
       label = 81; //@line 4606
      } else {
       $$0342$i = 0; //@line 4613
       $$0347$i = $255; //@line 4613
       $$0353$i = $282; //@line 4613
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 4613
       $$0362$i = 0; //@line 4613
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 4618
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 4623
          $$435113$i = 0; //@line 4623
          $$435712$i = $$0353$i; //@line 4623
          label = 85; //@line 4624
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 4627
          $$1348$i = $292; //@line 4627
         }
        } else {
         $$1343$i = $$0342$i; //@line 4630
         $$1348$i = $$0347$i; //@line 4630
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 4633
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 4636
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 4640
        $302 = ($$0353$i | 0) == 0; //@line 4641
        if ($302) {
         $$2355$i = $$1363$i; //@line 4646
         $$3$i203 = $$1343$i; //@line 4646
         $$3350$i = $$1348$i; //@line 4646
         label = 81; //@line 4647
         break;
        } else {
         $$0342$i = $$1343$i; //@line 4650
         $$0347$i = $$1348$i; //@line 4650
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 4650
         $$0362$i = $$1363$i; //@line 4650
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 4660
       $309 = $253 & ($306 | 0 - $306); //@line 4663
       if (!$309) {
        $$0197 = $252; //@line 4666
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 4671
       $315 = $313 >>> 12 & 16; //@line 4673
       $316 = $313 >>> $315; //@line 4674
       $318 = $316 >>> 5 & 8; //@line 4676
       $320 = $316 >>> $318; //@line 4678
       $322 = $320 >>> 2 & 4; //@line 4680
       $324 = $320 >>> $322; //@line 4682
       $326 = $324 >>> 1 & 2; //@line 4684
       $328 = $324 >>> $326; //@line 4686
       $330 = $328 >>> 1 & 1; //@line 4688
       $$4$ph$i = 0; //@line 4694
       $$4357$ph$i = HEAP32[6240 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 4694
      } else {
       $$4$ph$i = $$3$i203; //@line 4696
       $$4357$ph$i = $$2355$i; //@line 4696
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 4700
       $$4351$lcssa$i = $$3350$i; //@line 4700
      } else {
       $$414$i = $$4$ph$i; //@line 4702
       $$435113$i = $$3350$i; //@line 4702
       $$435712$i = $$4357$ph$i; //@line 4702
       label = 85; //@line 4703
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 4708
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 4712
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 4713
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 4714
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 4715
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4721
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 4724
        $$4351$lcssa$i = $$$4351$i; //@line 4724
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 4727
        $$435113$i = $$$4351$i; //@line 4727
        label = 85; //@line 4728
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 4734
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1486] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1488] | 0; //@line 4740
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 4743
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 4746
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 4749
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 4753
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 4755
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 4759
         $371 = HEAP32[$370 >> 2] | 0; //@line 4760
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 4763
          $374 = HEAP32[$373 >> 2] | 0; //@line 4764
          if (!$374) {
           $$3372$i = 0; //@line 4767
           break;
          } else {
           $$1370$i = $374; //@line 4770
           $$1374$i = $373; //@line 4770
          }
         } else {
          $$1370$i = $371; //@line 4773
          $$1374$i = $370; //@line 4773
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 4776
          $377 = HEAP32[$376 >> 2] | 0; //@line 4777
          if ($377 | 0) {
           $$1370$i = $377; //@line 4780
           $$1374$i = $376; //@line 4780
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 4783
          $380 = HEAP32[$379 >> 2] | 0; //@line 4784
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 4789
           $$1374$i = $379; //@line 4789
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 4794
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 4797
          $$3372$i = $$1370$i; //@line 4798
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 4803
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 4806
         }
         $364 = $362 + 12 | 0; //@line 4809
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 4813
         }
         $367 = $359 + 8 | 0; //@line 4816
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 4820
          HEAP32[$367 >> 2] = $362; //@line 4821
          $$3372$i = $359; //@line 4822
          break;
         } else {
          _abort(); //@line 4825
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 4833
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 4836
         $386 = 6240 + ($385 << 2) | 0; //@line 4837
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 4842
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 4847
            HEAP32[1485] = $391; //@line 4848
            $475 = $391; //@line 4849
            break L164;
           }
          } else {
           if ((HEAP32[1488] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 4856
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 4864
            if (!$$3372$i) {
             $475 = $253; //@line 4867
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1488] | 0; //@line 4875
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 4878
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 4882
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 4884
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 4890
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 4894
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 4896
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 4902
         if (!$409) {
          $475 = $253; //@line 4905
         } else {
          if ((HEAP32[1488] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 4910
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 4914
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 4916
           $475 = $253; //@line 4917
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 4926
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 4929
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 4931
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 4934
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 4938
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 4941
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 4943
         $428 = $$4351$lcssa$i >>> 3; //@line 4944
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 5976 + ($428 << 1 << 2) | 0; //@line 4948
          $432 = HEAP32[1484] | 0; //@line 4949
          $433 = 1 << $428; //@line 4950
          if (!($432 & $433)) {
           HEAP32[1484] = $432 | $433; //@line 4955
           $$0368$i = $431; //@line 4957
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 4957
          } else {
           $437 = $431 + 8 | 0; //@line 4959
           $438 = HEAP32[$437 >> 2] | 0; //@line 4960
           if ((HEAP32[1488] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 4964
           } else {
            $$0368$i = $438; //@line 4967
            $$pre$phi$i211Z2D = $437; //@line 4967
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 4970
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 4972
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 4974
          HEAP32[$354 + 12 >> 2] = $431; //@line 4976
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 4979
         if (!$444) {
          $$0361$i = 0; //@line 4982
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 4986
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 4990
           $450 = $444 << $449; //@line 4991
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 4994
           $455 = $450 << $453; //@line 4996
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 4999
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 5004
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 5010
          }
         }
         $469 = 6240 + ($$0361$i << 2) | 0; //@line 5013
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 5015
         $471 = $354 + 16 | 0; //@line 5016
         HEAP32[$471 + 4 >> 2] = 0; //@line 5018
         HEAP32[$471 >> 2] = 0; //@line 5019
         $473 = 1 << $$0361$i; //@line 5020
         if (!($475 & $473)) {
          HEAP32[1485] = $475 | $473; //@line 5025
          HEAP32[$469 >> 2] = $354; //@line 5026
          HEAP32[$354 + 24 >> 2] = $469; //@line 5028
          HEAP32[$354 + 12 >> 2] = $354; //@line 5030
          HEAP32[$354 + 8 >> 2] = $354; //@line 5032
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 5041
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 5041
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 5048
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 5052
          $494 = HEAP32[$492 >> 2] | 0; //@line 5054
          if (!$494) {
           label = 136; //@line 5057
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 5060
           $$0345$i = $494; //@line 5060
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1488] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 5067
          } else {
           HEAP32[$492 >> 2] = $354; //@line 5070
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 5072
           HEAP32[$354 + 12 >> 2] = $354; //@line 5074
           HEAP32[$354 + 8 >> 2] = $354; //@line 5076
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 5081
          $502 = HEAP32[$501 >> 2] | 0; //@line 5082
          $503 = HEAP32[1488] | 0; //@line 5083
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 5089
           HEAP32[$501 >> 2] = $354; //@line 5090
           HEAP32[$354 + 8 >> 2] = $502; //@line 5092
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 5094
           HEAP32[$354 + 24 >> 2] = 0; //@line 5096
           break;
          } else {
           _abort(); //@line 5099
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 5106
       STACKTOP = sp; //@line 5107
       return $$0 | 0; //@line 5107
      } else {
       $$0197 = $252; //@line 5109
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1486] | 0; //@line 5116
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 5119
  $515 = HEAP32[1489] | 0; //@line 5120
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 5123
   HEAP32[1489] = $517; //@line 5124
   HEAP32[1486] = $514; //@line 5125
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 5128
   HEAP32[$515 + $512 >> 2] = $514; //@line 5130
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 5133
  } else {
   HEAP32[1486] = 0; //@line 5135
   HEAP32[1489] = 0; //@line 5136
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 5139
   $526 = $515 + $512 + 4 | 0; //@line 5141
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 5144
  }
  $$0 = $515 + 8 | 0; //@line 5147
  STACKTOP = sp; //@line 5148
  return $$0 | 0; //@line 5148
 }
 $530 = HEAP32[1487] | 0; //@line 5150
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 5153
  HEAP32[1487] = $532; //@line 5154
  $533 = HEAP32[1490] | 0; //@line 5155
  $534 = $533 + $$0197 | 0; //@line 5156
  HEAP32[1490] = $534; //@line 5157
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 5160
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 5163
  $$0 = $533 + 8 | 0; //@line 5165
  STACKTOP = sp; //@line 5166
  return $$0 | 0; //@line 5166
 }
 if (!(HEAP32[1602] | 0)) {
  HEAP32[1604] = 4096; //@line 5171
  HEAP32[1603] = 4096; //@line 5172
  HEAP32[1605] = -1; //@line 5173
  HEAP32[1606] = -1; //@line 5174
  HEAP32[1607] = 0; //@line 5175
  HEAP32[1595] = 0; //@line 5176
  HEAP32[1602] = $1 & -16 ^ 1431655768; //@line 5180
  $548 = 4096; //@line 5181
 } else {
  $548 = HEAP32[1604] | 0; //@line 5184
 }
 $545 = $$0197 + 48 | 0; //@line 5186
 $546 = $$0197 + 47 | 0; //@line 5187
 $547 = $548 + $546 | 0; //@line 5188
 $549 = 0 - $548 | 0; //@line 5189
 $550 = $547 & $549; //@line 5190
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 5193
  STACKTOP = sp; //@line 5194
  return $$0 | 0; //@line 5194
 }
 $552 = HEAP32[1594] | 0; //@line 5196
 if ($552 | 0) {
  $554 = HEAP32[1592] | 0; //@line 5199
  $555 = $554 + $550 | 0; //@line 5200
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 5205
   STACKTOP = sp; //@line 5206
   return $$0 | 0; //@line 5206
  }
 }
 L244 : do {
  if (!(HEAP32[1595] & 4)) {
   $561 = HEAP32[1490] | 0; //@line 5214
   L246 : do {
    if (!$561) {
     label = 163; //@line 5218
    } else {
     $$0$i$i = 6384; //@line 5220
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 5222
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 5225
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 5234
      if (!$570) {
       label = 163; //@line 5237
       break L246;
      } else {
       $$0$i$i = $570; //@line 5240
      }
     }
     $595 = $547 - $530 & $549; //@line 5244
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 5247
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 5255
       } else {
        $$723947$i = $595; //@line 5257
        $$748$i = $597; //@line 5257
        label = 180; //@line 5258
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 5262
       $$2253$ph$i = $595; //@line 5262
       label = 171; //@line 5263
      }
     } else {
      $$2234243136$i = 0; //@line 5266
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 5272
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 5275
     } else {
      $574 = $572; //@line 5277
      $575 = HEAP32[1603] | 0; //@line 5278
      $576 = $575 + -1 | 0; //@line 5279
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 5287
      $584 = HEAP32[1592] | 0; //@line 5288
      $585 = $$$i + $584 | 0; //@line 5289
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1594] | 0; //@line 5294
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 5301
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 5305
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 5308
        $$748$i = $572; //@line 5308
        label = 180; //@line 5309
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 5312
        $$2253$ph$i = $$$i; //@line 5312
        label = 171; //@line 5313
       }
      } else {
       $$2234243136$i = 0; //@line 5316
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 5323
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 5332
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 5335
       $$748$i = $$2247$ph$i; //@line 5335
       label = 180; //@line 5336
       break L244;
      }
     }
     $607 = HEAP32[1604] | 0; //@line 5340
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 5344
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 5347
      $$748$i = $$2247$ph$i; //@line 5347
      label = 180; //@line 5348
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 5354
      $$2234243136$i = 0; //@line 5355
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 5359
      $$748$i = $$2247$ph$i; //@line 5359
      label = 180; //@line 5360
      break L244;
     }
    }
   } while (0);
   HEAP32[1595] = HEAP32[1595] | 4; //@line 5367
   $$4236$i = $$2234243136$i; //@line 5368
   label = 178; //@line 5369
  } else {
   $$4236$i = 0; //@line 5371
   label = 178; //@line 5372
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 5378
   $621 = _sbrk(0) | 0; //@line 5379
   $627 = $621 - $620 | 0; //@line 5387
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 5389
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 5397
    $$748$i = $620; //@line 5397
    label = 180; //@line 5398
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1592] | 0) + $$723947$i | 0; //@line 5404
  HEAP32[1592] = $633; //@line 5405
  if ($633 >>> 0 > (HEAP32[1593] | 0) >>> 0) {
   HEAP32[1593] = $633; //@line 5409
  }
  $636 = HEAP32[1490] | 0; //@line 5411
  do {
   if (!$636) {
    $638 = HEAP32[1488] | 0; //@line 5415
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1488] = $$748$i; //@line 5420
    }
    HEAP32[1596] = $$748$i; //@line 5422
    HEAP32[1597] = $$723947$i; //@line 5423
    HEAP32[1599] = 0; //@line 5424
    HEAP32[1493] = HEAP32[1602]; //@line 5426
    HEAP32[1492] = -1; //@line 5427
    HEAP32[1497] = 5976; //@line 5428
    HEAP32[1496] = 5976; //@line 5429
    HEAP32[1499] = 5984; //@line 5430
    HEAP32[1498] = 5984; //@line 5431
    HEAP32[1501] = 5992; //@line 5432
    HEAP32[1500] = 5992; //@line 5433
    HEAP32[1503] = 6e3; //@line 5434
    HEAP32[1502] = 6e3; //@line 5435
    HEAP32[1505] = 6008; //@line 5436
    HEAP32[1504] = 6008; //@line 5437
    HEAP32[1507] = 6016; //@line 5438
    HEAP32[1506] = 6016; //@line 5439
    HEAP32[1509] = 6024; //@line 5440
    HEAP32[1508] = 6024; //@line 5441
    HEAP32[1511] = 6032; //@line 5442
    HEAP32[1510] = 6032; //@line 5443
    HEAP32[1513] = 6040; //@line 5444
    HEAP32[1512] = 6040; //@line 5445
    HEAP32[1515] = 6048; //@line 5446
    HEAP32[1514] = 6048; //@line 5447
    HEAP32[1517] = 6056; //@line 5448
    HEAP32[1516] = 6056; //@line 5449
    HEAP32[1519] = 6064; //@line 5450
    HEAP32[1518] = 6064; //@line 5451
    HEAP32[1521] = 6072; //@line 5452
    HEAP32[1520] = 6072; //@line 5453
    HEAP32[1523] = 6080; //@line 5454
    HEAP32[1522] = 6080; //@line 5455
    HEAP32[1525] = 6088; //@line 5456
    HEAP32[1524] = 6088; //@line 5457
    HEAP32[1527] = 6096; //@line 5458
    HEAP32[1526] = 6096; //@line 5459
    HEAP32[1529] = 6104; //@line 5460
    HEAP32[1528] = 6104; //@line 5461
    HEAP32[1531] = 6112; //@line 5462
    HEAP32[1530] = 6112; //@line 5463
    HEAP32[1533] = 6120; //@line 5464
    HEAP32[1532] = 6120; //@line 5465
    HEAP32[1535] = 6128; //@line 5466
    HEAP32[1534] = 6128; //@line 5467
    HEAP32[1537] = 6136; //@line 5468
    HEAP32[1536] = 6136; //@line 5469
    HEAP32[1539] = 6144; //@line 5470
    HEAP32[1538] = 6144; //@line 5471
    HEAP32[1541] = 6152; //@line 5472
    HEAP32[1540] = 6152; //@line 5473
    HEAP32[1543] = 6160; //@line 5474
    HEAP32[1542] = 6160; //@line 5475
    HEAP32[1545] = 6168; //@line 5476
    HEAP32[1544] = 6168; //@line 5477
    HEAP32[1547] = 6176; //@line 5478
    HEAP32[1546] = 6176; //@line 5479
    HEAP32[1549] = 6184; //@line 5480
    HEAP32[1548] = 6184; //@line 5481
    HEAP32[1551] = 6192; //@line 5482
    HEAP32[1550] = 6192; //@line 5483
    HEAP32[1553] = 6200; //@line 5484
    HEAP32[1552] = 6200; //@line 5485
    HEAP32[1555] = 6208; //@line 5486
    HEAP32[1554] = 6208; //@line 5487
    HEAP32[1557] = 6216; //@line 5488
    HEAP32[1556] = 6216; //@line 5489
    HEAP32[1559] = 6224; //@line 5490
    HEAP32[1558] = 6224; //@line 5491
    $642 = $$723947$i + -40 | 0; //@line 5492
    $644 = $$748$i + 8 | 0; //@line 5494
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 5499
    $650 = $$748$i + $649 | 0; //@line 5500
    $651 = $642 - $649 | 0; //@line 5501
    HEAP32[1490] = $650; //@line 5502
    HEAP32[1487] = $651; //@line 5503
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 5506
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 5509
    HEAP32[1491] = HEAP32[1606]; //@line 5511
   } else {
    $$024367$i = 6384; //@line 5513
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 5515
     $658 = $$024367$i + 4 | 0; //@line 5516
     $659 = HEAP32[$658 >> 2] | 0; //@line 5517
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 5521
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 5525
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 5530
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 5544
       $673 = (HEAP32[1487] | 0) + $$723947$i | 0; //@line 5546
       $675 = $636 + 8 | 0; //@line 5548
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 5553
       $681 = $636 + $680 | 0; //@line 5554
       $682 = $673 - $680 | 0; //@line 5555
       HEAP32[1490] = $681; //@line 5556
       HEAP32[1487] = $682; //@line 5557
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 5560
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 5563
       HEAP32[1491] = HEAP32[1606]; //@line 5565
       break;
      }
     }
    }
    $688 = HEAP32[1488] | 0; //@line 5570
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1488] = $$748$i; //@line 5573
     $753 = $$748$i; //@line 5574
    } else {
     $753 = $688; //@line 5576
    }
    $690 = $$748$i + $$723947$i | 0; //@line 5578
    $$124466$i = 6384; //@line 5579
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 5584
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 5588
     if (!$694) {
      $$0$i$i$i = 6384; //@line 5591
      break;
     } else {
      $$124466$i = $694; //@line 5594
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 5603
      $700 = $$124466$i + 4 | 0; //@line 5604
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 5607
      $704 = $$748$i + 8 | 0; //@line 5609
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 5615
      $712 = $690 + 8 | 0; //@line 5617
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 5623
      $722 = $710 + $$0197 | 0; //@line 5627
      $723 = $718 - $710 - $$0197 | 0; //@line 5628
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 5631
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1487] | 0) + $723 | 0; //@line 5636
        HEAP32[1487] = $728; //@line 5637
        HEAP32[1490] = $722; //@line 5638
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 5641
       } else {
        if ((HEAP32[1489] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1486] | 0) + $723 | 0; //@line 5647
         HEAP32[1486] = $734; //@line 5648
         HEAP32[1489] = $722; //@line 5649
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 5652
         HEAP32[$722 + $734 >> 2] = $734; //@line 5654
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 5658
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 5662
         $743 = $739 >>> 3; //@line 5663
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 5668
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 5670
           $750 = 5976 + ($743 << 1 << 2) | 0; //@line 5672
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 5678
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 5687
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1484] = HEAP32[1484] & ~(1 << $743); //@line 5697
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 5704
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 5708
             }
             $764 = $748 + 8 | 0; //@line 5711
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 5715
              break;
             }
             _abort(); //@line 5718
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 5723
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 5724
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 5727
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 5729
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 5733
             $783 = $782 + 4 | 0; //@line 5734
             $784 = HEAP32[$783 >> 2] | 0; //@line 5735
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 5738
              if (!$786) {
               $$3$i$i = 0; //@line 5741
               break;
              } else {
               $$1291$i$i = $786; //@line 5744
               $$1293$i$i = $782; //@line 5744
              }
             } else {
              $$1291$i$i = $784; //@line 5747
              $$1293$i$i = $783; //@line 5747
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 5750
              $789 = HEAP32[$788 >> 2] | 0; //@line 5751
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 5754
               $$1293$i$i = $788; //@line 5754
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 5757
              $792 = HEAP32[$791 >> 2] | 0; //@line 5758
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 5763
               $$1293$i$i = $791; //@line 5763
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 5768
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 5771
              $$3$i$i = $$1291$i$i; //@line 5772
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 5777
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 5780
             }
             $776 = $774 + 12 | 0; //@line 5783
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 5787
             }
             $779 = $771 + 8 | 0; //@line 5790
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 5794
              HEAP32[$779 >> 2] = $774; //@line 5795
              $$3$i$i = $771; //@line 5796
              break;
             } else {
              _abort(); //@line 5799
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 5809
           $798 = 6240 + ($797 << 2) | 0; //@line 5810
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 5815
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1485] = HEAP32[1485] & ~(1 << $797); //@line 5824
             break L311;
            } else {
             if ((HEAP32[1488] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 5830
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 5838
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1488] | 0; //@line 5848
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 5851
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 5855
           $815 = $718 + 16 | 0; //@line 5856
           $816 = HEAP32[$815 >> 2] | 0; //@line 5857
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 5863
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 5867
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 5869
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 5875
           if (!$822) {
            break;
           }
           if ((HEAP32[1488] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 5883
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 5887
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 5889
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 5896
         $$0287$i$i = $742 + $723 | 0; //@line 5896
        } else {
         $$0$i17$i = $718; //@line 5898
         $$0287$i$i = $723; //@line 5898
        }
        $830 = $$0$i17$i + 4 | 0; //@line 5900
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 5903
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 5906
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 5908
        $836 = $$0287$i$i >>> 3; //@line 5909
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 5976 + ($836 << 1 << 2) | 0; //@line 5913
         $840 = HEAP32[1484] | 0; //@line 5914
         $841 = 1 << $836; //@line 5915
         do {
          if (!($840 & $841)) {
           HEAP32[1484] = $840 | $841; //@line 5921
           $$0295$i$i = $839; //@line 5923
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 5923
          } else {
           $845 = $839 + 8 | 0; //@line 5925
           $846 = HEAP32[$845 >> 2] | 0; //@line 5926
           if ((HEAP32[1488] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 5930
            $$pre$phi$i19$iZ2D = $845; //@line 5930
            break;
           }
           _abort(); //@line 5933
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 5937
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 5939
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 5941
         HEAP32[$722 + 12 >> 2] = $839; //@line 5943
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 5946
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 5950
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 5954
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 5959
          $858 = $852 << $857; //@line 5960
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 5963
          $863 = $858 << $861; //@line 5965
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 5968
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 5973
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 5979
         }
        } while (0);
        $877 = 6240 + ($$0296$i$i << 2) | 0; //@line 5982
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 5984
        $879 = $722 + 16 | 0; //@line 5985
        HEAP32[$879 + 4 >> 2] = 0; //@line 5987
        HEAP32[$879 >> 2] = 0; //@line 5988
        $881 = HEAP32[1485] | 0; //@line 5989
        $882 = 1 << $$0296$i$i; //@line 5990
        if (!($881 & $882)) {
         HEAP32[1485] = $881 | $882; //@line 5995
         HEAP32[$877 >> 2] = $722; //@line 5996
         HEAP32[$722 + 24 >> 2] = $877; //@line 5998
         HEAP32[$722 + 12 >> 2] = $722; //@line 6000
         HEAP32[$722 + 8 >> 2] = $722; //@line 6002
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 6011
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 6011
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 6018
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 6022
         $902 = HEAP32[$900 >> 2] | 0; //@line 6024
         if (!$902) {
          label = 260; //@line 6027
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 6030
          $$0289$i$i = $902; //@line 6030
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1488] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 6037
         } else {
          HEAP32[$900 >> 2] = $722; //@line 6040
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 6042
          HEAP32[$722 + 12 >> 2] = $722; //@line 6044
          HEAP32[$722 + 8 >> 2] = $722; //@line 6046
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 6051
         $910 = HEAP32[$909 >> 2] | 0; //@line 6052
         $911 = HEAP32[1488] | 0; //@line 6053
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 6059
          HEAP32[$909 >> 2] = $722; //@line 6060
          HEAP32[$722 + 8 >> 2] = $910; //@line 6062
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 6064
          HEAP32[$722 + 24 >> 2] = 0; //@line 6066
          break;
         } else {
          _abort(); //@line 6069
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 6076
      STACKTOP = sp; //@line 6077
      return $$0 | 0; //@line 6077
     } else {
      $$0$i$i$i = 6384; //@line 6079
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 6083
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 6088
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 6096
    }
    $927 = $923 + -47 | 0; //@line 6098
    $929 = $927 + 8 | 0; //@line 6100
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 6106
    $936 = $636 + 16 | 0; //@line 6107
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 6109
    $939 = $938 + 8 | 0; //@line 6110
    $940 = $938 + 24 | 0; //@line 6111
    $941 = $$723947$i + -40 | 0; //@line 6112
    $943 = $$748$i + 8 | 0; //@line 6114
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 6119
    $949 = $$748$i + $948 | 0; //@line 6120
    $950 = $941 - $948 | 0; //@line 6121
    HEAP32[1490] = $949; //@line 6122
    HEAP32[1487] = $950; //@line 6123
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 6126
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 6129
    HEAP32[1491] = HEAP32[1606]; //@line 6131
    $956 = $938 + 4 | 0; //@line 6132
    HEAP32[$956 >> 2] = 27; //@line 6133
    HEAP32[$939 >> 2] = HEAP32[1596]; //@line 6134
    HEAP32[$939 + 4 >> 2] = HEAP32[1597]; //@line 6134
    HEAP32[$939 + 8 >> 2] = HEAP32[1598]; //@line 6134
    HEAP32[$939 + 12 >> 2] = HEAP32[1599]; //@line 6134
    HEAP32[1596] = $$748$i; //@line 6135
    HEAP32[1597] = $$723947$i; //@line 6136
    HEAP32[1599] = 0; //@line 6137
    HEAP32[1598] = $939; //@line 6138
    $958 = $940; //@line 6139
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 6141
     HEAP32[$958 >> 2] = 7; //@line 6142
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 6155
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 6158
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 6161
     HEAP32[$938 >> 2] = $964; //@line 6162
     $969 = $964 >>> 3; //@line 6163
     if ($964 >>> 0 < 256) {
      $972 = 5976 + ($969 << 1 << 2) | 0; //@line 6167
      $973 = HEAP32[1484] | 0; //@line 6168
      $974 = 1 << $969; //@line 6169
      if (!($973 & $974)) {
       HEAP32[1484] = $973 | $974; //@line 6174
       $$0211$i$i = $972; //@line 6176
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 6176
      } else {
       $978 = $972 + 8 | 0; //@line 6178
       $979 = HEAP32[$978 >> 2] | 0; //@line 6179
       if ((HEAP32[1488] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 6183
       } else {
        $$0211$i$i = $979; //@line 6186
        $$pre$phi$i$iZ2D = $978; //@line 6186
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 6189
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 6191
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 6193
      HEAP32[$636 + 12 >> 2] = $972; //@line 6195
      break;
     }
     $985 = $964 >>> 8; //@line 6198
     if (!$985) {
      $$0212$i$i = 0; //@line 6201
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 6205
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 6209
       $991 = $985 << $990; //@line 6210
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 6213
       $996 = $991 << $994; //@line 6215
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 6218
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 6223
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 6229
      }
     }
     $1010 = 6240 + ($$0212$i$i << 2) | 0; //@line 6232
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 6234
     HEAP32[$636 + 20 >> 2] = 0; //@line 6236
     HEAP32[$936 >> 2] = 0; //@line 6237
     $1013 = HEAP32[1485] | 0; //@line 6238
     $1014 = 1 << $$0212$i$i; //@line 6239
     if (!($1013 & $1014)) {
      HEAP32[1485] = $1013 | $1014; //@line 6244
      HEAP32[$1010 >> 2] = $636; //@line 6245
      HEAP32[$636 + 24 >> 2] = $1010; //@line 6247
      HEAP32[$636 + 12 >> 2] = $636; //@line 6249
      HEAP32[$636 + 8 >> 2] = $636; //@line 6251
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 6260
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 6260
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 6267
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 6271
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 6273
      if (!$1034) {
       label = 286; //@line 6276
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 6279
       $$0207$i$i = $1034; //@line 6279
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1488] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 6286
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 6289
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 6291
       HEAP32[$636 + 12 >> 2] = $636; //@line 6293
       HEAP32[$636 + 8 >> 2] = $636; //@line 6295
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 6300
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 6301
      $1043 = HEAP32[1488] | 0; //@line 6302
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 6308
       HEAP32[$1041 >> 2] = $636; //@line 6309
       HEAP32[$636 + 8 >> 2] = $1042; //@line 6311
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 6313
       HEAP32[$636 + 24 >> 2] = 0; //@line 6315
       break;
      } else {
       _abort(); //@line 6318
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1487] | 0; //@line 6325
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 6328
   HEAP32[1487] = $1054; //@line 6329
   $1055 = HEAP32[1490] | 0; //@line 6330
   $1056 = $1055 + $$0197 | 0; //@line 6331
   HEAP32[1490] = $1056; //@line 6332
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 6335
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 6338
   $$0 = $1055 + 8 | 0; //@line 6340
   STACKTOP = sp; //@line 6341
   return $$0 | 0; //@line 6341
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 6345
 $$0 = 0; //@line 6346
 STACKTOP = sp; //@line 6347
 return $$0 | 0; //@line 6347
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10069
 STACKTOP = STACKTOP + 560 | 0; //@line 10070
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 10070
 $6 = sp + 8 | 0; //@line 10071
 $7 = sp; //@line 10072
 $8 = sp + 524 | 0; //@line 10073
 $9 = $8; //@line 10074
 $10 = sp + 512 | 0; //@line 10075
 HEAP32[$7 >> 2] = 0; //@line 10076
 $11 = $10 + 12 | 0; //@line 10077
 ___DOUBLE_BITS_677($1) | 0; //@line 10078
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 10083
  $$0520 = 1; //@line 10083
  $$0521 = 3064; //@line 10083
 } else {
  $$0471 = $1; //@line 10094
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 10094
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 3065 : 3070 : 3067; //@line 10094
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 10096
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 10105
   $31 = $$0520 + 3 | 0; //@line 10110
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 10112
   _out_670($0, $$0521, $$0520); //@line 10113
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 3091 : 3095 : $27 ? 3083 : 3087, 3); //@line 10114
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 10116
   $$sink560 = $31; //@line 10117
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 10120
   $36 = $35 != 0.0; //@line 10121
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 10125
   }
   $39 = $5 | 32; //@line 10127
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 10130
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 10133
    $44 = $$0520 | 2; //@line 10134
    $46 = 12 - $3 | 0; //@line 10136
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 10141
     } else {
      $$0509585 = 8.0; //@line 10143
      $$1508586 = $46; //@line 10143
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 10145
       $$0509585 = $$0509585 * 16.0; //@line 10146
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 10161
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 10166
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 10171
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 10174
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 10177
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 10180
     HEAP8[$68 >> 0] = 48; //@line 10181
     $$0511 = $68; //@line 10182
    } else {
     $$0511 = $66; //@line 10184
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 10191
    $76 = $$0511 + -2 | 0; //@line 10194
    HEAP8[$76 >> 0] = $5 + 15; //@line 10195
    $77 = ($3 | 0) < 1; //@line 10196
    $79 = ($4 & 8 | 0) == 0; //@line 10198
    $$0523 = $8; //@line 10199
    $$2473 = $$1472; //@line 10199
    while (1) {
     $80 = ~~$$2473; //@line 10201
     $86 = $$0523 + 1 | 0; //@line 10207
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[3099 + $80 >> 0]; //@line 10208
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 10211
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 10220
      } else {
       HEAP8[$86 >> 0] = 46; //@line 10223
       $$1524 = $$0523 + 2 | 0; //@line 10224
      }
     } else {
      $$1524 = $86; //@line 10227
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 10231
     }
    }
    $$pre693 = $$1524; //@line 10237
    if (!$3) {
     label = 24; //@line 10239
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 10247
      $$sink = $3 + 2 | 0; //@line 10247
     } else {
      label = 24; //@line 10249
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 10253
     $$pre$phi691Z2D = $101; //@line 10254
     $$sink = $101; //@line 10254
    }
    $104 = $11 - $76 | 0; //@line 10258
    $106 = $104 + $44 + $$sink | 0; //@line 10260
    _pad_676($0, 32, $2, $106, $4); //@line 10261
    _out_670($0, $$0521$, $44); //@line 10262
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 10264
    _out_670($0, $8, $$pre$phi691Z2D); //@line 10265
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 10267
    _out_670($0, $76, $104); //@line 10268
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 10270
    $$sink560 = $106; //@line 10271
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 10275
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 10279
    HEAP32[$7 >> 2] = $113; //@line 10280
    $$3 = $35 * 268435456.0; //@line 10281
    $$pr = $113; //@line 10281
   } else {
    $$3 = $35; //@line 10284
    $$pr = HEAP32[$7 >> 2] | 0; //@line 10284
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 10288
   $$0498 = $$561; //@line 10289
   $$4 = $$3; //@line 10289
   do {
    $116 = ~~$$4 >>> 0; //@line 10291
    HEAP32[$$0498 >> 2] = $116; //@line 10292
    $$0498 = $$0498 + 4 | 0; //@line 10293
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 10296
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 10306
    $$1499662 = $$0498; //@line 10306
    $124 = $$pr; //@line 10306
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 10309
     $$0488655 = $$1499662 + -4 | 0; //@line 10310
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 10313
     } else {
      $$0488657 = $$0488655; //@line 10315
      $$0497656 = 0; //@line 10315
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 10318
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 10320
       $131 = tempRet0; //@line 10321
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 10322
       HEAP32[$$0488657 >> 2] = $132; //@line 10324
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 10325
       $$0488657 = $$0488657 + -4 | 0; //@line 10327
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 10337
      } else {
       $138 = $$1482663 + -4 | 0; //@line 10339
       HEAP32[$138 >> 2] = $$0497656; //@line 10340
       $$2483$ph = $138; //@line 10341
      }
     }
     $$2500 = $$1499662; //@line 10344
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 10350
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 10354
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 10360
     HEAP32[$7 >> 2] = $144; //@line 10361
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 10364
      $$1499662 = $$2500; //@line 10364
      $124 = $144; //@line 10364
     } else {
      $$1482$lcssa = $$2483$ph; //@line 10366
      $$1499$lcssa = $$2500; //@line 10366
      $$pr566 = $144; //@line 10366
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 10371
    $$1499$lcssa = $$0498; //@line 10371
    $$pr566 = $$pr; //@line 10371
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 10377
    $150 = ($39 | 0) == 102; //@line 10378
    $$3484650 = $$1482$lcssa; //@line 10379
    $$3501649 = $$1499$lcssa; //@line 10379
    $152 = $$pr566; //@line 10379
    while (1) {
     $151 = 0 - $152 | 0; //@line 10381
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 10383
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 10387
      $161 = 1e9 >>> $154; //@line 10388
      $$0487644 = 0; //@line 10389
      $$1489643 = $$3484650; //@line 10389
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 10391
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 10395
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 10396
       $$1489643 = $$1489643 + 4 | 0; //@line 10397
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 10408
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 10411
       $$4502 = $$3501649; //@line 10411
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 10414
       $$$3484700 = $$$3484; //@line 10415
       $$4502 = $$3501649 + 4 | 0; //@line 10415
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 10422
      $$4502 = $$3501649; //@line 10422
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 10424
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 10431
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 10433
     HEAP32[$7 >> 2] = $152; //@line 10434
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 10439
      $$3501$lcssa = $$$4502; //@line 10439
      break;
     } else {
      $$3484650 = $$$3484700; //@line 10437
      $$3501649 = $$$4502; //@line 10437
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 10444
    $$3501$lcssa = $$1499$lcssa; //@line 10444
   }
   $185 = $$561; //@line 10447
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 10452
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 10453
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 10456
    } else {
     $$0514639 = $189; //@line 10458
     $$0530638 = 10; //@line 10458
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 10460
      $193 = $$0514639 + 1 | 0; //@line 10461
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 10464
       break;
      } else {
       $$0514639 = $193; //@line 10467
      }
     }
    }
   } else {
    $$1515 = 0; //@line 10472
   }
   $198 = ($39 | 0) == 103; //@line 10477
   $199 = ($$540 | 0) != 0; //@line 10478
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 10481
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 10490
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 10493
    $213 = ($209 | 0) % 9 | 0; //@line 10494
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 10497
     $$1531632 = 10; //@line 10497
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 10500
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 10503
       $$1531632 = $215; //@line 10503
      } else {
       $$1531$lcssa = $215; //@line 10505
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 10510
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 10512
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 10513
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 10516
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 10519
     $$4518 = $$1515; //@line 10519
     $$8 = $$3484$lcssa; //@line 10519
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 10524
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 10525
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 10530
     if (!$$0520) {
      $$1467 = $$$564; //@line 10533
      $$1469 = $$543; //@line 10533
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 10536
      $$1467 = $230 ? -$$$564 : $$$564; //@line 10541
      $$1469 = $230 ? -$$543 : $$543; //@line 10541
     }
     $233 = $217 - $218 | 0; //@line 10543
     HEAP32[$212 >> 2] = $233; //@line 10544
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 10548
      HEAP32[$212 >> 2] = $236; //@line 10549
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 10552
       $$sink547625 = $212; //@line 10552
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 10554
        HEAP32[$$sink547625 >> 2] = 0; //@line 10555
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 10558
         HEAP32[$240 >> 2] = 0; //@line 10559
         $$6 = $240; //@line 10560
        } else {
         $$6 = $$5486626; //@line 10562
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 10565
        HEAP32[$238 >> 2] = $242; //@line 10566
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 10569
         $$sink547625 = $238; //@line 10569
        } else {
         $$5486$lcssa = $$6; //@line 10571
         $$sink547$lcssa = $238; //@line 10571
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 10576
       $$sink547$lcssa = $212; //@line 10576
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 10581
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 10582
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 10585
       $$4518 = $247; //@line 10585
       $$8 = $$5486$lcssa; //@line 10585
      } else {
       $$2516621 = $247; //@line 10587
       $$2532620 = 10; //@line 10587
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 10589
        $251 = $$2516621 + 1 | 0; //@line 10590
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 10593
         $$4518 = $251; //@line 10593
         $$8 = $$5486$lcssa; //@line 10593
         break;
        } else {
         $$2516621 = $251; //@line 10596
        }
       }
      }
     } else {
      $$4492 = $212; //@line 10601
      $$4518 = $$1515; //@line 10601
      $$8 = $$3484$lcssa; //@line 10601
     }
    }
    $253 = $$4492 + 4 | 0; //@line 10604
    $$5519$ph = $$4518; //@line 10607
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 10607
    $$9$ph = $$8; //@line 10607
   } else {
    $$5519$ph = $$1515; //@line 10609
    $$7505$ph = $$3501$lcssa; //@line 10609
    $$9$ph = $$3484$lcssa; //@line 10609
   }
   $$7505 = $$7505$ph; //@line 10611
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 10615
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 10618
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 10622
    } else {
     $$lcssa675 = 1; //@line 10624
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 10628
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 10633
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 10641
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 10641
     } else {
      $$0479 = $5 + -2 | 0; //@line 10645
      $$2476 = $$540$ + -1 | 0; //@line 10645
     }
     $267 = $4 & 8; //@line 10647
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 10652
       if (!$270) {
        $$2529 = 9; //@line 10655
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 10660
         $$3533616 = 10; //@line 10660
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 10662
          $275 = $$1528617 + 1 | 0; //@line 10663
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 10669
           break;
          } else {
           $$1528617 = $275; //@line 10667
          }
         }
        } else {
         $$2529 = 0; //@line 10674
        }
       }
      } else {
       $$2529 = 9; //@line 10678
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 10686
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 10688
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 10690
       $$1480 = $$0479; //@line 10693
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 10693
       $$pre$phi698Z2D = 0; //@line 10693
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 10697
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 10699
       $$1480 = $$0479; //@line 10702
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 10702
       $$pre$phi698Z2D = 0; //@line 10702
       break;
      }
     } else {
      $$1480 = $$0479; //@line 10706
      $$3477 = $$2476; //@line 10706
      $$pre$phi698Z2D = $267; //@line 10706
     }
    } else {
     $$1480 = $5; //@line 10710
     $$3477 = $$540; //@line 10710
     $$pre$phi698Z2D = $4 & 8; //@line 10710
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 10713
   $294 = ($292 | 0) != 0 & 1; //@line 10715
   $296 = ($$1480 | 32 | 0) == 102; //@line 10717
   if ($296) {
    $$2513 = 0; //@line 10721
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 10721
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 10724
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 10727
    $304 = $11; //@line 10728
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 10733
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 10735
      HEAP8[$308 >> 0] = 48; //@line 10736
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 10741
      } else {
       $$1512$lcssa = $308; //@line 10743
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 10748
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 10755
    $318 = $$1512$lcssa + -2 | 0; //@line 10757
    HEAP8[$318 >> 0] = $$1480; //@line 10758
    $$2513 = $318; //@line 10761
    $$pn = $304 - $318 | 0; //@line 10761
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 10766
   _pad_676($0, 32, $2, $323, $4); //@line 10767
   _out_670($0, $$0521, $$0520); //@line 10768
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 10770
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 10773
    $326 = $8 + 9 | 0; //@line 10774
    $327 = $326; //@line 10775
    $328 = $8 + 8 | 0; //@line 10776
    $$5493600 = $$0496$$9; //@line 10777
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 10780
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 10785
       $$1465 = $328; //@line 10786
      } else {
       $$1465 = $330; //@line 10788
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 10795
       $$0464597 = $330; //@line 10796
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 10798
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 10801
        } else {
         $$1465 = $335; //@line 10803
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 10808
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 10813
     $$5493600 = $$5493600 + 4 | 0; //@line 10814
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 3115, 1); //@line 10824
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 10830
     $$6494592 = $$5493600; //@line 10830
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 10833
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 10838
       $$0463587 = $347; //@line 10839
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 10841
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 10844
        } else {
         $$0463$lcssa = $351; //@line 10846
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 10851
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 10855
      $$6494592 = $$6494592 + 4 | 0; //@line 10856
      $356 = $$4478593 + -9 | 0; //@line 10857
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 10864
       break;
      } else {
       $$4478593 = $356; //@line 10862
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 10869
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 10872
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 10875
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 10878
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 10879
     $365 = $363; //@line 10880
     $366 = 0 - $9 | 0; //@line 10881
     $367 = $8 + 8 | 0; //@line 10882
     $$5605 = $$3477; //@line 10883
     $$7495604 = $$9$ph; //@line 10883
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 10886
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 10889
       $$0 = $367; //@line 10890
      } else {
       $$0 = $369; //@line 10892
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 10897
        _out_670($0, $$0, 1); //@line 10898
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 10902
         break;
        }
        _out_670($0, 3115, 1); //@line 10905
        $$2 = $375; //@line 10906
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 10910
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 10915
        $$1601 = $$0; //@line 10916
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 10918
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 10921
         } else {
          $$2 = $373; //@line 10923
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 10930
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 10933
      $381 = $$5605 - $378 | 0; //@line 10934
      $$7495604 = $$7495604 + 4 | 0; //@line 10935
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 10942
       break;
      } else {
       $$5605 = $381; //@line 10940
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 10947
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 10950
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 10954
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 10957
   $$sink560 = $323; //@line 10958
  }
 } while (0);
 STACKTOP = sp; //@line 10963
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 10963
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 8641
 STACKTOP = STACKTOP + 64 | 0; //@line 8642
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 8642
 $5 = sp + 16 | 0; //@line 8643
 $6 = sp; //@line 8644
 $7 = sp + 24 | 0; //@line 8645
 $8 = sp + 8 | 0; //@line 8646
 $9 = sp + 20 | 0; //@line 8647
 HEAP32[$5 >> 2] = $1; //@line 8648
 $10 = ($0 | 0) != 0; //@line 8649
 $11 = $7 + 40 | 0; //@line 8650
 $12 = $11; //@line 8651
 $13 = $7 + 39 | 0; //@line 8652
 $14 = $8 + 4 | 0; //@line 8653
 $$0243 = 0; //@line 8654
 $$0247 = 0; //@line 8654
 $$0269 = 0; //@line 8654
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 8663
     $$1248 = -1; //@line 8664
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 8668
     break;
    }
   } else {
    $$1248 = $$0247; //@line 8672
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 8675
  $21 = HEAP8[$20 >> 0] | 0; //@line 8676
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 8679
   break;
  } else {
   $23 = $21; //@line 8682
   $25 = $20; //@line 8682
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 8687
     $27 = $25; //@line 8687
     label = 9; //@line 8688
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 8693
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 8700
   HEAP32[$5 >> 2] = $24; //@line 8701
   $23 = HEAP8[$24 >> 0] | 0; //@line 8703
   $25 = $24; //@line 8703
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 8708
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 8713
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 8716
     $27 = $27 + 2 | 0; //@line 8717
     HEAP32[$5 >> 2] = $27; //@line 8718
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 8725
      break;
     } else {
      $$0249303 = $30; //@line 8722
      label = 9; //@line 8723
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 8733
  if ($10) {
   _out_670($0, $20, $36); //@line 8735
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 8739
   $$0247 = $$1248; //@line 8739
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 8747
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 8748
  if ($43) {
   $$0253 = -1; //@line 8750
   $$1270 = $$0269; //@line 8750
   $$sink = 1; //@line 8750
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 8760
    $$1270 = 1; //@line 8760
    $$sink = 3; //@line 8760
   } else {
    $$0253 = -1; //@line 8762
    $$1270 = $$0269; //@line 8762
    $$sink = 1; //@line 8762
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 8765
  HEAP32[$5 >> 2] = $51; //@line 8766
  $52 = HEAP8[$51 >> 0] | 0; //@line 8767
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 8769
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 8776
   $$lcssa291 = $52; //@line 8776
   $$lcssa292 = $51; //@line 8776
  } else {
   $$0262309 = 0; //@line 8778
   $60 = $52; //@line 8778
   $65 = $51; //@line 8778
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 8783
    $64 = $65 + 1 | 0; //@line 8784
    HEAP32[$5 >> 2] = $64; //@line 8785
    $66 = HEAP8[$64 >> 0] | 0; //@line 8786
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 8788
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 8795
     $$lcssa291 = $66; //@line 8795
     $$lcssa292 = $64; //@line 8795
     break;
    } else {
     $$0262309 = $63; //@line 8798
     $60 = $66; //@line 8798
     $65 = $64; //@line 8798
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 8810
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 8812
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 8817
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 8822
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 8834
     $$2271 = 1; //@line 8834
     $storemerge274 = $79 + 3 | 0; //@line 8834
    } else {
     label = 23; //@line 8836
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 8840
    if ($$1270 | 0) {
     $$0 = -1; //@line 8843
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8858
     $106 = HEAP32[$105 >> 2] | 0; //@line 8859
     HEAP32[$2 >> 2] = $105 + 4; //@line 8861
     $363 = $106; //@line 8862
    } else {
     $363 = 0; //@line 8864
    }
    $$0259 = $363; //@line 8868
    $$2271 = 0; //@line 8868
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 8868
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 8870
   $109 = ($$0259 | 0) < 0; //@line 8871
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 8876
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 8876
   $$3272 = $$2271; //@line 8876
   $115 = $storemerge274; //@line 8876
  } else {
   $112 = _getint_671($5) | 0; //@line 8878
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 8881
    break;
   }
   $$1260 = $112; //@line 8885
   $$1263 = $$0262$lcssa; //@line 8885
   $$3272 = $$1270; //@line 8885
   $115 = HEAP32[$5 >> 2] | 0; //@line 8885
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 8896
     $156 = _getint_671($5) | 0; //@line 8897
     $$0254 = $156; //@line 8899
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 8899
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 8908
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 8913
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 8918
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 8925
      $144 = $125 + 4 | 0; //@line 8929
      HEAP32[$5 >> 2] = $144; //@line 8930
      $$0254 = $140; //@line 8931
      $$pre345 = $144; //@line 8931
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 8937
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8952
     $152 = HEAP32[$151 >> 2] | 0; //@line 8953
     HEAP32[$2 >> 2] = $151 + 4; //@line 8955
     $364 = $152; //@line 8956
    } else {
     $364 = 0; //@line 8958
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 8961
    HEAP32[$5 >> 2] = $154; //@line 8962
    $$0254 = $364; //@line 8963
    $$pre345 = $154; //@line 8963
   } else {
    $$0254 = -1; //@line 8965
    $$pre345 = $115; //@line 8965
   }
  } while (0);
  $$0252 = 0; //@line 8968
  $158 = $$pre345; //@line 8968
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 8975
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 8978
   HEAP32[$5 >> 2] = $158; //@line 8979
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (2583 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 8984
   $168 = $167 & 255; //@line 8985
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 8989
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 8996
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 9000
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 9004
     break L1;
    } else {
     label = 50; //@line 9007
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 9012
     $176 = $3 + ($$0253 << 3) | 0; //@line 9014
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 9019
     $182 = $6; //@line 9020
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 9022
     HEAP32[$182 + 4 >> 2] = $181; //@line 9025
     label = 50; //@line 9026
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 9030
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 9033
    $187 = HEAP32[$5 >> 2] | 0; //@line 9035
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 9039
   if ($10) {
    $187 = $158; //@line 9041
   } else {
    $$0243 = 0; //@line 9043
    $$0247 = $$1248; //@line 9043
    $$0269 = $$3272; //@line 9043
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 9049
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 9055
  $196 = $$1263 & -65537; //@line 9058
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 9059
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9067
       $$0243 = 0; //@line 9068
       $$0247 = $$1248; //@line 9068
       $$0269 = $$3272; //@line 9068
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9074
       $$0243 = 0; //@line 9075
       $$0247 = $$1248; //@line 9075
       $$0269 = $$3272; //@line 9075
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 9083
       HEAP32[$208 >> 2] = $$1248; //@line 9085
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 9088
       $$0243 = 0; //@line 9089
       $$0247 = $$1248; //@line 9089
       $$0269 = $$3272; //@line 9089
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 9096
       $$0243 = 0; //@line 9097
       $$0247 = $$1248; //@line 9097
       $$0269 = $$3272; //@line 9097
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 9104
       $$0243 = 0; //@line 9105
       $$0247 = $$1248; //@line 9105
       $$0269 = $$3272; //@line 9105
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9111
       $$0243 = 0; //@line 9112
       $$0247 = $$1248; //@line 9112
       $$0269 = $$3272; //@line 9112
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 9120
       HEAP32[$220 >> 2] = $$1248; //@line 9122
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 9125
       $$0243 = 0; //@line 9126
       $$0247 = $$1248; //@line 9126
       $$0269 = $$3272; //@line 9126
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 9131
       $$0247 = $$1248; //@line 9131
       $$0269 = $$3272; //@line 9131
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 9141
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 9141
     $$3265 = $$1263$ | 8; //@line 9141
     label = 62; //@line 9142
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 9146
     $$1255 = $$0254; //@line 9146
     $$3265 = $$1263$; //@line 9146
     label = 62; //@line 9147
     break;
    }
   case 111:
    {
     $242 = $6; //@line 9151
     $244 = HEAP32[$242 >> 2] | 0; //@line 9153
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 9156
     $248 = _fmt_o($244, $247, $11) | 0; //@line 9157
     $252 = $12 - $248 | 0; //@line 9161
     $$0228 = $248; //@line 9166
     $$1233 = 0; //@line 9166
     $$1238 = 3047; //@line 9166
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 9166
     $$4266 = $$1263$; //@line 9166
     $281 = $244; //@line 9166
     $283 = $247; //@line 9166
     label = 68; //@line 9167
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 9171
     $258 = HEAP32[$256 >> 2] | 0; //@line 9173
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 9176
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 9179
      $264 = tempRet0; //@line 9180
      $265 = $6; //@line 9181
      HEAP32[$265 >> 2] = $263; //@line 9183
      HEAP32[$265 + 4 >> 2] = $264; //@line 9186
      $$0232 = 1; //@line 9187
      $$0237 = 3047; //@line 9187
      $275 = $263; //@line 9187
      $276 = $264; //@line 9187
      label = 67; //@line 9188
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 9200
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 3047 : 3049 : 3048; //@line 9200
      $275 = $258; //@line 9200
      $276 = $261; //@line 9200
      label = 67; //@line 9201
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 9207
     $$0232 = 0; //@line 9213
     $$0237 = 3047; //@line 9213
     $275 = HEAP32[$197 >> 2] | 0; //@line 9213
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 9213
     label = 67; //@line 9214
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 9225
     $$2 = $13; //@line 9226
     $$2234 = 0; //@line 9226
     $$2239 = 3047; //@line 9226
     $$2251 = $11; //@line 9226
     $$5 = 1; //@line 9226
     $$6268 = $196; //@line 9226
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 9233
     label = 72; //@line 9234
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 9238
     $$1 = $302 | 0 ? $302 : 3057; //@line 9241
     label = 72; //@line 9242
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 9252
     HEAP32[$14 >> 2] = 0; //@line 9253
     HEAP32[$6 >> 2] = $8; //@line 9254
     $$4258354 = -1; //@line 9255
     $365 = $8; //@line 9255
     label = 76; //@line 9256
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 9260
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 9263
      $$0240$lcssa356 = 0; //@line 9264
      label = 85; //@line 9265
     } else {
      $$4258354 = $$0254; //@line 9267
      $365 = $$pre348; //@line 9267
      label = 76; //@line 9268
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 9275
     $$0247 = $$1248; //@line 9275
     $$0269 = $$3272; //@line 9275
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 9280
     $$2234 = 0; //@line 9280
     $$2239 = 3047; //@line 9280
     $$2251 = $11; //@line 9280
     $$5 = $$0254; //@line 9280
     $$6268 = $$1263$; //@line 9280
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 9286
    $227 = $6; //@line 9287
    $229 = HEAP32[$227 >> 2] | 0; //@line 9289
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 9292
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 9294
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 9300
    $$0228 = $234; //@line 9305
    $$1233 = $or$cond278 ? 0 : 2; //@line 9305
    $$1238 = $or$cond278 ? 3047 : 3047 + ($$1236 >> 4) | 0; //@line 9305
    $$2256 = $$1255; //@line 9305
    $$4266 = $$3265; //@line 9305
    $281 = $229; //@line 9305
    $283 = $232; //@line 9305
    label = 68; //@line 9306
   } else if ((label | 0) == 67) {
    label = 0; //@line 9309
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 9311
    $$1233 = $$0232; //@line 9311
    $$1238 = $$0237; //@line 9311
    $$2256 = $$0254; //@line 9311
    $$4266 = $$1263$; //@line 9311
    $281 = $275; //@line 9311
    $283 = $276; //@line 9311
    label = 68; //@line 9312
   } else if ((label | 0) == 72) {
    label = 0; //@line 9315
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 9316
    $306 = ($305 | 0) == 0; //@line 9317
    $$2 = $$1; //@line 9324
    $$2234 = 0; //@line 9324
    $$2239 = 3047; //@line 9324
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 9324
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 9324
    $$6268 = $196; //@line 9324
   } else if ((label | 0) == 76) {
    label = 0; //@line 9327
    $$0229316 = $365; //@line 9328
    $$0240315 = 0; //@line 9328
    $$1244314 = 0; //@line 9328
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 9330
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 9333
      $$2245 = $$1244314; //@line 9333
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 9336
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 9342
      $$2245 = $320; //@line 9342
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 9346
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 9349
      $$0240315 = $325; //@line 9349
      $$1244314 = $320; //@line 9349
     } else {
      $$0240$lcssa = $325; //@line 9351
      $$2245 = $320; //@line 9351
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 9357
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 9360
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 9363
     label = 85; //@line 9364
    } else {
     $$1230327 = $365; //@line 9366
     $$1241326 = 0; //@line 9366
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 9368
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9371
       label = 85; //@line 9372
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 9375
      $$1241326 = $331 + $$1241326 | 0; //@line 9376
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9379
       label = 85; //@line 9380
       break L97;
      }
      _out_670($0, $9, $331); //@line 9384
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9389
       label = 85; //@line 9390
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 9387
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 9398
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 9404
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 9406
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 9411
   $$2 = $or$cond ? $$0228 : $11; //@line 9416
   $$2234 = $$1233; //@line 9416
   $$2239 = $$1238; //@line 9416
   $$2251 = $11; //@line 9416
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 9416
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 9416
  } else if ((label | 0) == 85) {
   label = 0; //@line 9419
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 9421
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 9424
   $$0247 = $$1248; //@line 9424
   $$0269 = $$3272; //@line 9424
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 9429
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 9431
  $345 = $$$5 + $$2234 | 0; //@line 9432
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 9434
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 9435
  _out_670($0, $$2239, $$2234); //@line 9436
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 9438
  _pad_676($0, 48, $$$5, $343, 0); //@line 9439
  _out_670($0, $$2, $343); //@line 9440
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 9442
  $$0243 = $$2261; //@line 9443
  $$0247 = $$1248; //@line 9443
  $$0269 = $$3272; //@line 9443
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 9451
    } else {
     $$2242302 = 1; //@line 9453
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 9456
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 9459
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 9463
      $356 = $$2242302 + 1 | 0; //@line 9464
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 9467
      } else {
       $$2242$lcssa = $356; //@line 9469
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 9475
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 9481
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 9487
       } else {
        $$0 = 1; //@line 9489
        break;
       }
      }
     } else {
      $$0 = 1; //@line 9494
     }
    }
   } else {
    $$0 = $$1248; //@line 9498
   }
  }
 } while (0);
 STACKTOP = sp; //@line 9502
 return $$0 | 0; //@line 9502
}
function _mbed_vtracef($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$0199 = 0, $$1$off0 = 0, $$10 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$13 = 0, $$18 = 0, $$3 = 0, $$3147 = 0, $$3147168 = 0, $$3154 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$6 = 0, $$6150 = 0, $$9 = 0, $$lobit = 0, $$pre = 0, $$sink = 0, $125 = 0, $126 = 0, $151 = 0, $157 = 0, $168 = 0, $169 = 0, $171 = 0, $181 = 0, $182 = 0, $184 = 0, $186 = 0, $194 = 0, $201 = 0, $202 = 0, $204 = 0, $206 = 0, $209 = 0, $34 = 0, $38 = 0, $4 = 0, $43 = 0, $5 = 0, $54 = 0, $55 = 0, $59 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $69 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $76 = 0, $78 = 0, $82 = 0, $89 = 0, $95 = 0, $AsyncCtx = 0, $AsyncCtx27 = 0, $AsyncCtx30 = 0, $AsyncCtx34 = 0, $AsyncCtx38 = 0, $AsyncCtx42 = 0, $AsyncCtx45 = 0, $AsyncCtx49 = 0, $AsyncCtx52 = 0, $AsyncCtx56 = 0, $AsyncCtx60 = 0, $AsyncCtx64 = 0, $extract$t159 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer12 = 0, $vararg_buffer15 = 0, $vararg_buffer18 = 0, $vararg_buffer20 = 0, $vararg_buffer23 = 0, $vararg_buffer3 = 0, $vararg_buffer6 = 0, $vararg_buffer9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 809
 STACKTOP = STACKTOP + 96 | 0; //@line 810
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(96); //@line 810
 $vararg_buffer23 = sp + 72 | 0; //@line 811
 $vararg_buffer20 = sp + 64 | 0; //@line 812
 $vararg_buffer18 = sp + 56 | 0; //@line 813
 $vararg_buffer15 = sp + 48 | 0; //@line 814
 $vararg_buffer12 = sp + 40 | 0; //@line 815
 $vararg_buffer9 = sp + 32 | 0; //@line 816
 $vararg_buffer6 = sp + 24 | 0; //@line 817
 $vararg_buffer3 = sp + 16 | 0; //@line 818
 $vararg_buffer1 = sp + 8 | 0; //@line 819
 $vararg_buffer = sp; //@line 820
 $4 = sp + 80 | 0; //@line 821
 $5 = HEAP32[93] | 0; //@line 822
 do {
  if ($5 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(104, sp) | 0; //@line 826
   FUNCTION_TABLE_v[$5 & 15](); //@line 827
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 46; //@line 830
    HEAP8[$AsyncCtx + 4 >> 0] = $0; //@line 832
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 834
    HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer23; //@line 836
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer23; //@line 838
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer1; //@line 840
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer1; //@line 842
    HEAP32[$AsyncCtx + 28 >> 2] = $vararg_buffer; //@line 844
    HEAP32[$AsyncCtx + 32 >> 2] = $vararg_buffer; //@line 846
    HEAP32[$AsyncCtx + 36 >> 2] = $4; //@line 848
    HEAP32[$AsyncCtx + 40 >> 2] = $3; //@line 850
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 852
    HEAP32[$AsyncCtx + 48 >> 2] = $vararg_buffer6; //@line 854
    HEAP32[$AsyncCtx + 52 >> 2] = $vararg_buffer6; //@line 856
    HEAP32[$AsyncCtx + 56 >> 2] = $vararg_buffer20; //@line 858
    HEAP32[$AsyncCtx + 60 >> 2] = $vararg_buffer20; //@line 860
    HEAP32[$AsyncCtx + 64 >> 2] = $vararg_buffer9; //@line 862
    HEAP32[$AsyncCtx + 68 >> 2] = $vararg_buffer9; //@line 864
    HEAP32[$AsyncCtx + 72 >> 2] = $vararg_buffer12; //@line 866
    HEAP32[$AsyncCtx + 76 >> 2] = $vararg_buffer12; //@line 868
    HEAP32[$AsyncCtx + 80 >> 2] = $vararg_buffer15; //@line 870
    HEAP32[$AsyncCtx + 84 >> 2] = $vararg_buffer15; //@line 872
    HEAP32[$AsyncCtx + 88 >> 2] = $vararg_buffer18; //@line 874
    HEAP32[$AsyncCtx + 92 >> 2] = $vararg_buffer18; //@line 876
    HEAP32[$AsyncCtx + 96 >> 2] = $vararg_buffer3; //@line 878
    HEAP32[$AsyncCtx + 100 >> 2] = $vararg_buffer3; //@line 880
    sp = STACKTOP; //@line 881
    STACKTOP = sp; //@line 882
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 884
    HEAP32[95] = (HEAP32[95] | 0) + 1; //@line 887
    break;
   }
  }
 } while (0);
 $34 = HEAP32[84] | 0; //@line 892
 do {
  if ($34 | 0) {
   HEAP8[$34 >> 0] = 0; //@line 896
   do {
    if ($0 << 24 >> 24 > -1 & ($1 | 0) != 0) {
     $38 = HEAP32[81] | 0; //@line 902
     if (HEAP8[$38 >> 0] | 0) {
      if (_strstr($38, $1) | 0) {
       $$0$i = 1; //@line 909
       break;
      }
     }
     $43 = HEAP32[82] | 0; //@line 913
     if (!(HEAP8[$43 >> 0] | 0)) {
      label = 11; //@line 917
     } else {
      if (!(_strstr($43, $1) | 0)) {
       $$0$i = 1; //@line 922
      } else {
       label = 11; //@line 924
      }
     }
    } else {
     label = 11; //@line 928
    }
   } while (0);
   if ((label | 0) == 11) {
    $$0$i = 0; //@line 932
   }
   if (!((HEAP32[91] | 0) != 0 & ((($1 | 0) == 0 | (($2 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[88] = HEAP32[86]; //@line 944
    break;
   }
   $54 = HEAPU8[320] | 0; //@line 948
   $55 = $0 & 255; //@line 949
   if ($55 & 31 & $54 | 0) {
    $59 = $54 & 64; //@line 954
    $$lobit = $59 >>> 6; //@line 955
    $60 = $$lobit & 255; //@line 956
    $64 = ($54 & 32 | 0) == 0; //@line 960
    $65 = HEAP32[85] | 0; //@line 961
    $66 = HEAP32[84] | 0; //@line 962
    $67 = $0 << 24 >> 24 == 1; //@line 963
    do {
     if ($67 | ($54 & 128 | 0) != 0) {
      $AsyncCtx64 = _emscripten_alloc_async_context(8, sp) | 0; //@line 967
      _vsnprintf($66, $65, $2, $3) | 0; //@line 968
      if (___async) {
       HEAP32[$AsyncCtx64 >> 2] = 47; //@line 971
       HEAP8[$AsyncCtx64 + 4 >> 0] = $67 & 1; //@line 974
       sp = STACKTOP; //@line 975
       STACKTOP = sp; //@line 976
       return;
      }
      _emscripten_free_async_context($AsyncCtx64 | 0); //@line 978
      $69 = HEAP32[92] | 0; //@line 979
      if (!($67 & ($69 | 0) != 0)) {
       $73 = HEAP32[91] | 0; //@line 983
       $74 = HEAP32[84] | 0; //@line 984
       $AsyncCtx34 = _emscripten_alloc_async_context(4, sp) | 0; //@line 985
       FUNCTION_TABLE_vi[$73 & 255]($74); //@line 986
       if (___async) {
        HEAP32[$AsyncCtx34 >> 2] = 50; //@line 989
        sp = STACKTOP; //@line 990
        STACKTOP = sp; //@line 991
        return;
       } else {
        _emscripten_free_async_context($AsyncCtx34 | 0); //@line 993
        break;
       }
      }
      $71 = HEAP32[84] | 0; //@line 997
      $AsyncCtx27 = _emscripten_alloc_async_context(4, sp) | 0; //@line 998
      FUNCTION_TABLE_vi[$69 & 255]($71); //@line 999
      if (___async) {
       HEAP32[$AsyncCtx27 >> 2] = 48; //@line 1002
       sp = STACKTOP; //@line 1003
       STACKTOP = sp; //@line 1004
       return;
      }
      _emscripten_free_async_context($AsyncCtx27 | 0); //@line 1006
      $72 = HEAP32[92] | 0; //@line 1007
      $AsyncCtx30 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1008
      FUNCTION_TABLE_vi[$72 & 255](1636); //@line 1009
      if (___async) {
       HEAP32[$AsyncCtx30 >> 2] = 49; //@line 1012
       sp = STACKTOP; //@line 1013
       STACKTOP = sp; //@line 1014
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx30 | 0); //@line 1016
       break;
      }
     } else {
      if (!$59) {
       $$1$off0 = ($$lobit | 0) != 0; //@line 1023
       $$1143 = $66; //@line 1023
       $$1145 = $65; //@line 1023
       $$3154 = 0; //@line 1023
       label = 38; //@line 1024
      } else {
       if ($64) {
        $$0142 = $66; //@line 1027
        $$0144 = $65; //@line 1027
       } else {
        $76 = _snprintf($66, $65, 1638, $vararg_buffer) | 0; //@line 1029
        $$ = ($76 | 0) >= ($65 | 0) ? 0 : $76; //@line 1031
        $78 = ($$ | 0) > 0; //@line 1032
        $$0142 = $78 ? $66 + $$ | 0 : $66; //@line 1037
        $$0144 = $65 - ($78 ? $$ : 0) | 0; //@line 1037
       }
       if (($$0144 | 0) > 0) {
        $82 = $55 + -2 | 0; //@line 1041
        switch ($82 >>> 1 | $82 << 31 | 0) {
        case 0:
         {
          $$sink = 1656; //@line 1047
          label = 35; //@line 1048
          break;
         }
        case 1:
         {
          $$sink = 1662; //@line 1052
          label = 35; //@line 1053
          break;
         }
        case 3:
         {
          $$sink = 1650; //@line 1057
          label = 35; //@line 1058
          break;
         }
        case 7:
         {
          $$sink = 1644; //@line 1062
          label = 35; //@line 1063
          break;
         }
        default:
         {
          $$0141 = 0; //@line 1067
          $$1152 = 0; //@line 1067
         }
        }
        if ((label | 0) == 35) {
         HEAP32[$vararg_buffer1 >> 2] = $$sink; //@line 1071
         $$0141 = $60 & 1; //@line 1074
         $$1152 = _snprintf($$0142, $$0144, 1668, $vararg_buffer1) | 0; //@line 1074
        }
        $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 1077
        $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 1079
        if (($$1152$ | 0) > 0) {
         $89 = $$0141 << 24 >> 24 == 0; //@line 1081
         $$1$off0 = $extract$t159; //@line 1086
         $$1143 = $89 ? $$0142 : $$0142 + $$1152$ | 0; //@line 1086
         $$1145 = $$0144 - ($89 ? 0 : $$1152$) | 0; //@line 1086
         $$3154 = $$1152; //@line 1086
         label = 38; //@line 1087
        } else {
         $$1$off0 = $extract$t159; //@line 1089
         $$1143 = $$0142; //@line 1089
         $$1145 = $$0144; //@line 1089
         $$3154 = $$1152$; //@line 1089
         label = 38; //@line 1090
        }
       }
      }
      L54 : do {
       if ((label | 0) == 38) {
        do {
         if (($$1145 | 0) > 0 & (HEAP32[89] | 0) != 0) {
          HEAP32[$4 >> 2] = HEAP32[$3 >> 2]; //@line 1103
          $AsyncCtx60 = _emscripten_alloc_async_context(104, sp) | 0; //@line 1104
          $95 = _vsnprintf(0, 0, $2, $4) | 0; //@line 1105
          if (___async) {
           HEAP32[$AsyncCtx60 >> 2] = 51; //@line 1108
           HEAP8[$AsyncCtx60 + 4 >> 0] = $$1$off0 & 1; //@line 1111
           HEAP32[$AsyncCtx60 + 8 >> 2] = $vararg_buffer23; //@line 1113
           HEAP32[$AsyncCtx60 + 12 >> 2] = $vararg_buffer23; //@line 1115
           HEAP32[$AsyncCtx60 + 16 >> 2] = $vararg_buffer20; //@line 1117
           HEAP32[$AsyncCtx60 + 20 >> 2] = $vararg_buffer20; //@line 1119
           HEAP32[$AsyncCtx60 + 24 >> 2] = $$3154; //@line 1121
           HEAP32[$AsyncCtx60 + 28 >> 2] = $$1143; //@line 1123
           HEAP32[$AsyncCtx60 + 32 >> 2] = $$1145; //@line 1125
           HEAP32[$AsyncCtx60 + 36 >> 2] = $55; //@line 1127
           HEAP32[$AsyncCtx60 + 40 >> 2] = $vararg_buffer6; //@line 1129
           HEAP32[$AsyncCtx60 + 44 >> 2] = $1; //@line 1131
           HEAP32[$AsyncCtx60 + 48 >> 2] = $vararg_buffer6; //@line 1133
           HEAP32[$AsyncCtx60 + 52 >> 2] = $vararg_buffer9; //@line 1135
           HEAP32[$AsyncCtx60 + 56 >> 2] = $vararg_buffer9; //@line 1137
           HEAP32[$AsyncCtx60 + 60 >> 2] = $vararg_buffer12; //@line 1139
           HEAP32[$AsyncCtx60 + 64 >> 2] = $vararg_buffer12; //@line 1141
           HEAP32[$AsyncCtx60 + 68 >> 2] = $vararg_buffer15; //@line 1143
           HEAP32[$AsyncCtx60 + 72 >> 2] = $vararg_buffer15; //@line 1145
           HEAP32[$AsyncCtx60 + 76 >> 2] = $vararg_buffer18; //@line 1147
           HEAP32[$AsyncCtx60 + 80 >> 2] = $vararg_buffer18; //@line 1149
           HEAP32[$AsyncCtx60 + 84 >> 2] = $2; //@line 1151
           HEAP32[$AsyncCtx60 + 88 >> 2] = $3; //@line 1153
           HEAP32[$AsyncCtx60 + 92 >> 2] = $vararg_buffer3; //@line 1155
           HEAP32[$AsyncCtx60 + 96 >> 2] = $vararg_buffer3; //@line 1157
           HEAP32[$AsyncCtx60 + 100 >> 2] = $4; //@line 1159
           sp = STACKTOP; //@line 1160
           STACKTOP = sp; //@line 1161
           return;
          }
          _emscripten_free_async_context($AsyncCtx60 | 0); //@line 1163
          $125 = HEAP32[89] | 0; //@line 1168
          $AsyncCtx38 = _emscripten_alloc_async_context(100, sp) | 0; //@line 1169
          $126 = FUNCTION_TABLE_ii[$125 & 1](($$3154 | 0 ? 4 : 0) + $$3154 + $95 | 0) | 0; //@line 1170
          if (___async) {
           HEAP32[$AsyncCtx38 >> 2] = 52; //@line 1173
           HEAP8[$AsyncCtx38 + 4 >> 0] = $$1$off0 & 1; //@line 1176
           HEAP32[$AsyncCtx38 + 8 >> 2] = $vararg_buffer23; //@line 1178
           HEAP32[$AsyncCtx38 + 12 >> 2] = $vararg_buffer23; //@line 1180
           HEAP32[$AsyncCtx38 + 16 >> 2] = $$1143; //@line 1182
           HEAP32[$AsyncCtx38 + 20 >> 2] = $$1145; //@line 1184
           HEAP32[$AsyncCtx38 + 24 >> 2] = $55; //@line 1186
           HEAP32[$AsyncCtx38 + 28 >> 2] = $vararg_buffer6; //@line 1188
           HEAP32[$AsyncCtx38 + 32 >> 2] = $1; //@line 1190
           HEAP32[$AsyncCtx38 + 36 >> 2] = $vararg_buffer6; //@line 1192
           HEAP32[$AsyncCtx38 + 40 >> 2] = $vararg_buffer20; //@line 1194
           HEAP32[$AsyncCtx38 + 44 >> 2] = $vararg_buffer20; //@line 1196
           HEAP32[$AsyncCtx38 + 48 >> 2] = $vararg_buffer9; //@line 1198
           HEAP32[$AsyncCtx38 + 52 >> 2] = $vararg_buffer9; //@line 1200
           HEAP32[$AsyncCtx38 + 56 >> 2] = $vararg_buffer12; //@line 1202
           HEAP32[$AsyncCtx38 + 60 >> 2] = $vararg_buffer12; //@line 1204
           HEAP32[$AsyncCtx38 + 64 >> 2] = $vararg_buffer15; //@line 1206
           HEAP32[$AsyncCtx38 + 68 >> 2] = $vararg_buffer15; //@line 1208
           HEAP32[$AsyncCtx38 + 72 >> 2] = $vararg_buffer18; //@line 1210
           HEAP32[$AsyncCtx38 + 76 >> 2] = $vararg_buffer18; //@line 1212
           HEAP32[$AsyncCtx38 + 80 >> 2] = $2; //@line 1214
           HEAP32[$AsyncCtx38 + 84 >> 2] = $3; //@line 1216
           HEAP32[$AsyncCtx38 + 88 >> 2] = $vararg_buffer3; //@line 1218
           HEAP32[$AsyncCtx38 + 92 >> 2] = $vararg_buffer3; //@line 1220
           HEAP32[$AsyncCtx38 + 96 >> 2] = $4; //@line 1222
           sp = STACKTOP; //@line 1223
           STACKTOP = sp; //@line 1224
           return;
          } else {
           _emscripten_free_async_context($AsyncCtx38 | 0); //@line 1226
           HEAP32[$vararg_buffer3 >> 2] = $126; //@line 1227
           $151 = _snprintf($$1143, $$1145, 1668, $vararg_buffer3) | 0; //@line 1228
           $$10 = ($151 | 0) >= ($$1145 | 0) ? 0 : $151; //@line 1230
           if (($$10 | 0) > 0) {
            $$3 = $$1143 + $$10 | 0; //@line 1235
            $$3147 = $$1145 - $$10 | 0; //@line 1235
            label = 44; //@line 1236
            break;
           } else {
            $$3147168 = $$1145; //@line 1239
            $$3169 = $$1143; //@line 1239
            break;
           }
          }
         } else {
          $$3 = $$1143; //@line 1244
          $$3147 = $$1145; //@line 1244
          label = 44; //@line 1245
         }
        } while (0);
        if ((label | 0) == 44) {
         if (($$3147 | 0) > 0) {
          $$3147168 = $$3147; //@line 1251
          $$3169 = $$3; //@line 1251
         } else {
          break;
         }
        }
        $157 = $55 + -2 | 0; //@line 1256
        switch ($157 >>> 1 | $157 << 31 | 0) {
        case 0:
         {
          HEAP32[$vararg_buffer6 >> 2] = $1; //@line 1262
          $$5156 = _snprintf($$3169, $$3147168, 1671, $vararg_buffer6) | 0; //@line 1264
          break;
         }
        case 1:
         {
          HEAP32[$vararg_buffer9 >> 2] = $1; //@line 1268
          $$5156 = _snprintf($$3169, $$3147168, 1686, $vararg_buffer9) | 0; //@line 1270
          break;
         }
        case 3:
         {
          HEAP32[$vararg_buffer12 >> 2] = $1; //@line 1274
          $$5156 = _snprintf($$3169, $$3147168, 1701, $vararg_buffer12) | 0; //@line 1276
          break;
         }
        case 7:
         {
          HEAP32[$vararg_buffer15 >> 2] = $1; //@line 1280
          $$5156 = _snprintf($$3169, $$3147168, 1716, $vararg_buffer15) | 0; //@line 1282
          break;
         }
        default:
         {
          $$5156 = _snprintf($$3169, $$3147168, 1731, $vararg_buffer18) | 0; //@line 1287
         }
        }
        $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 1291
        $168 = $$3169 + $$5156$ | 0; //@line 1293
        $169 = $$3147168 - $$5156$ | 0; //@line 1294
        if (($$5156$ | 0) > 0 & ($169 | 0) > 0) {
         $AsyncCtx56 = _emscripten_alloc_async_context(32, sp) | 0; //@line 1298
         $171 = _vsnprintf($168, $169, $2, $3) | 0; //@line 1299
         if (___async) {
          HEAP32[$AsyncCtx56 >> 2] = 53; //@line 1302
          HEAP8[$AsyncCtx56 + 4 >> 0] = $$1$off0 & 1; //@line 1305
          HEAP32[$AsyncCtx56 + 8 >> 2] = $vararg_buffer23; //@line 1307
          HEAP32[$AsyncCtx56 + 12 >> 2] = $vararg_buffer23; //@line 1309
          HEAP32[$AsyncCtx56 + 16 >> 2] = $169; //@line 1311
          HEAP32[$AsyncCtx56 + 20 >> 2] = $168; //@line 1313
          HEAP32[$AsyncCtx56 + 24 >> 2] = $vararg_buffer20; //@line 1315
          HEAP32[$AsyncCtx56 + 28 >> 2] = $vararg_buffer20; //@line 1317
          sp = STACKTOP; //@line 1318
          STACKTOP = sp; //@line 1319
          return;
         }
         _emscripten_free_async_context($AsyncCtx56 | 0); //@line 1321
         $$13 = ($171 | 0) >= ($169 | 0) ? 0 : $171; //@line 1323
         $181 = $168 + $$13 | 0; //@line 1325
         $182 = $169 - $$13 | 0; //@line 1326
         if (($$13 | 0) > 0) {
          $184 = HEAP32[90] | 0; //@line 1329
          do {
           if (($182 | 0) > 0 & ($184 | 0) != 0) {
            $AsyncCtx42 = _emscripten_alloc_async_context(32, sp) | 0; //@line 1334
            $186 = FUNCTION_TABLE_i[$184 & 3]() | 0; //@line 1335
            if (___async) {
             HEAP32[$AsyncCtx42 >> 2] = 54; //@line 1338
             HEAP32[$AsyncCtx42 + 4 >> 2] = $vararg_buffer20; //@line 1340
             HEAP32[$AsyncCtx42 + 8 >> 2] = $181; //@line 1342
             HEAP32[$AsyncCtx42 + 12 >> 2] = $182; //@line 1344
             HEAP32[$AsyncCtx42 + 16 >> 2] = $vararg_buffer20; //@line 1346
             HEAP8[$AsyncCtx42 + 20 >> 0] = $$1$off0 & 1; //@line 1349
             HEAP32[$AsyncCtx42 + 24 >> 2] = $vararg_buffer23; //@line 1351
             HEAP32[$AsyncCtx42 + 28 >> 2] = $vararg_buffer23; //@line 1353
             sp = STACKTOP; //@line 1354
             STACKTOP = sp; //@line 1355
             return;
            } else {
             _emscripten_free_async_context($AsyncCtx42 | 0); //@line 1357
             HEAP32[$vararg_buffer20 >> 2] = $186; //@line 1358
             $194 = _snprintf($181, $182, 1668, $vararg_buffer20) | 0; //@line 1359
             $$18 = ($194 | 0) >= ($182 | 0) ? 0 : $194; //@line 1361
             if (($$18 | 0) > 0) {
              $$6 = $181 + $$18 | 0; //@line 1366
              $$6150 = $182 - $$18 | 0; //@line 1366
              $$9 = $$18; //@line 1366
              break;
             } else {
              break L54;
             }
            }
           } else {
            $$6 = $181; //@line 1373
            $$6150 = $182; //@line 1373
            $$9 = $$13; //@line 1373
           }
          } while (0);
          if (!(($$9 | 0) < 1 | ($$6150 | 0) < 1 | $$1$off0 ^ 1)) {
           _snprintf($$6, $$6150, 1746, $vararg_buffer23) | 0; //@line 1382
          }
         }
        }
       }
      } while (0);
      $201 = HEAP32[91] | 0; //@line 1388
      $202 = HEAP32[84] | 0; //@line 1389
      $AsyncCtx45 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1390
      FUNCTION_TABLE_vi[$201 & 255]($202); //@line 1391
      if (___async) {
       HEAP32[$AsyncCtx45 >> 2] = 55; //@line 1394
       sp = STACKTOP; //@line 1395
       STACKTOP = sp; //@line 1396
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx45 | 0); //@line 1398
       break;
      }
     }
    } while (0);
    HEAP32[88] = HEAP32[86]; //@line 1404
   }
  }
 } while (0);
 $204 = HEAP32[94] | 0; //@line 1408
 if (!$204) {
  STACKTOP = sp; //@line 1411
  return;
 }
 $206 = HEAP32[95] | 0; //@line 1413
 HEAP32[95] = 0; //@line 1414
 $AsyncCtx49 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1415
 FUNCTION_TABLE_v[$204 & 15](); //@line 1416
 if (___async) {
  HEAP32[$AsyncCtx49 >> 2] = 56; //@line 1419
  HEAP32[$AsyncCtx49 + 4 >> 2] = $206; //@line 1421
  sp = STACKTOP; //@line 1422
  STACKTOP = sp; //@line 1423
  return;
 }
 _emscripten_free_async_context($AsyncCtx49 | 0); //@line 1425
 if (($206 | 0) > 1) {
  $$0199 = $206; //@line 1428
 } else {
  STACKTOP = sp; //@line 1430
  return;
 }
 while (1) {
  $209 = $$0199 + -1 | 0; //@line 1433
  $$pre = HEAP32[94] | 0; //@line 1434
  $AsyncCtx52 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1435
  FUNCTION_TABLE_v[$$pre & 15](); //@line 1436
  if (___async) {
   label = 70; //@line 1439
   break;
  }
  _emscripten_free_async_context($AsyncCtx52 | 0); //@line 1442
  if (($$0199 | 0) > 2) {
   $$0199 = $209; //@line 1445
  } else {
   label = 72; //@line 1447
   break;
  }
 }
 if ((label | 0) == 70) {
  HEAP32[$AsyncCtx52 >> 2] = 57; //@line 1452
  HEAP32[$AsyncCtx52 + 4 >> 2] = $$0199; //@line 1454
  HEAP32[$AsyncCtx52 + 8 >> 2] = $209; //@line 1456
  sp = STACKTOP; //@line 1457
  STACKTOP = sp; //@line 1458
  return;
 } else if ((label | 0) == 72) {
  STACKTOP = sp; //@line 1461
  return;
 }
}
function _initialize($0) {
 $0 = $0 | 0;
 var $$043 = 0, $$044 = 0, $$04750525456586062646668707274767880828486889092949698100102104106108 = 0, $$048 = 0, $1 = 0, $104 = 0, $105 = 0, $107 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $116 = 0, $118 = 0, $124 = 0, $125 = 0, $126 = 0, $13 = 0, $135 = 0, $136 = 0, $137 = 0, $139 = 0, $14 = 0, $143 = 0, $144 = 0, $145 = 0, $147 = 0, $149 = 0, $155 = 0, $156 = 0, $157 = 0, $166 = 0, $167 = 0, $168 = 0, $170 = 0, $174 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $184 = 0, $24 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $37 = 0, $39 = 0, $40 = 0, $41 = 0, $45 = 0, $46 = 0, $53 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $66 = 0, $67 = 0, $68 = 0, $7 = 0, $70 = 0, $72 = 0, $75 = 0, $79 = 0, $80 = 0, $87 = 0, $88 = 0, $AsyncCtx = 0, $AsyncCtx12 = 0, $AsyncCtx16 = 0, $AsyncCtx19 = 0, $AsyncCtx2 = 0, $AsyncCtx6 = 0, $AsyncCtx9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1534
 $1 = $0 + 4 | 0; //@line 1535
 if (HEAP8[(HEAP32[$1 >> 2] | 0) + 56 >> 0] | 0) {
  return;
 }
 $7 = HEAP32[HEAP32[$0 >> 2] >> 2] | 0; //@line 1544
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1545
 FUNCTION_TABLE_v[$7 & 15](); //@line 1546
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 60; //@line 1549
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 1551
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 1553
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 1555
  sp = STACKTOP; //@line 1556
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1559
 $13 = HEAP32[(HEAP32[$0 >> 2] | 0) + 24 >> 2] | 0; //@line 1562
 $AsyncCtx2 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1563
 $14 = FUNCTION_TABLE_i[$13 & 3]() | 0; //@line 1564
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 61; //@line 1567
  HEAP32[$AsyncCtx2 + 4 >> 2] = $1; //@line 1569
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1571
  HEAP32[$AsyncCtx2 + 12 >> 2] = $0; //@line 1573
  sp = STACKTOP; //@line 1574
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1577
 $18 = HEAP32[$14 >> 2] | 0; //@line 1578
 L10 : do {
  if (($18 | 0) < 32768) {
   if (($18 | 0) >= 128) {
    if (($18 | 0) < 2048) {
     switch ($18 | 0) {
     case 1024:
      {
       $$043 = 10; //@line 1588
       $$048 = $18; //@line 1588
       break L10;
       break;
      }
     case 512:
      {
       $$043 = 9; //@line 1593
       $$048 = $18; //@line 1593
       break L10;
       break;
      }
     case 256:
      {
       $$043 = 8; //@line 1598
       $$048 = $18; //@line 1598
       break L10;
       break;
      }
     case 128:
      {
       $$043 = 7; //@line 1603
       $$048 = $18; //@line 1603
       break L10;
       break;
      }
     default:
      {
       $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1608
       label = 60; //@line 1609
       break L10;
      }
     }
    }
    if (($18 | 0) < 8192) {
     switch ($18 | 0) {
     case 4096:
      {
       $$043 = 12; //@line 1618
       $$048 = $18; //@line 1618
       break L10;
       break;
      }
     case 2048:
      {
       $$043 = 11; //@line 1623
       $$048 = $18; //@line 1623
       break L10;
       break;
      }
     default:
      {
       $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1628
       label = 60; //@line 1629
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
       $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1641
       label = 60; //@line 1642
       break L10;
      }
     }
     $$043 = 13; //@line 1646
     $$048 = $18; //@line 1646
     break;
    } else {
     switch ($18 | 0) {
     case 16384:
      {
       break;
      }
     default:
      {
       $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1654
       label = 60; //@line 1655
       break L10;
      }
     }
     $$043 = 14; //@line 1659
     $$048 = $18; //@line 1659
     break;
    }
   }
   if (($18 | 0) >= 8) {
    switch ($18 | 0) {
    case 64:
     {
      $$043 = 6; //@line 1667
      $$048 = $18; //@line 1667
      break L10;
      break;
     }
    case 32:
     {
      $$043 = 5; //@line 1672
      $$048 = $18; //@line 1672
      break L10;
      break;
     }
    case 16:
     {
      $$043 = 4; //@line 1677
      $$048 = $18; //@line 1677
      break L10;
      break;
     }
    case 8:
     {
      $$043 = 3; //@line 1682
      $$048 = $18; //@line 1682
      break L10;
      break;
     }
    default:
     {
      $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1687
      label = 60; //@line 1688
      break L10;
     }
    }
   }
   if (($18 | 0) >= 2) {
    switch ($18 | 0) {
    case 4:
     {
      $$043 = 2; //@line 1697
      $$048 = $18; //@line 1697
      break L10;
      break;
     }
    case 2:
     {
      $$043 = 1; //@line 1702
      $$048 = $18; //@line 1702
      break L10;
      break;
     }
    default:
     {
      $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1707
      label = 60; //@line 1708
      break L10;
     }
    }
   }
   if (($18 | 0) < 0) {
    switch ($18 | 0) {
    case -2147483648:
     {
      $$043 = 31; //@line 1717
      $$048 = -2147483648; //@line 1717
      break L10;
      break;
     }
    default:
     {
      $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1722
      label = 60; //@line 1723
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
     $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1733
     label = 60; //@line 1734
     break L10;
    }
   }
   $AsyncCtx19 = _emscripten_alloc_async_context(20, sp) | 0; //@line 1738
   _mbed_assert_internal(1751, 1753, 41); //@line 1739
   if (___async) {
    HEAP32[$AsyncCtx19 >> 2] = 62; //@line 1742
    HEAP32[$AsyncCtx19 + 4 >> 2] = $1; //@line 1744
    HEAP32[$AsyncCtx19 + 8 >> 2] = $0; //@line 1746
    HEAP32[$AsyncCtx19 + 12 >> 2] = $14; //@line 1748
    HEAP32[$AsyncCtx19 + 16 >> 2] = $0; //@line 1750
    sp = STACKTOP; //@line 1751
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx19 | 0); //@line 1754
    $$04750525456586062646668707274767880828486889092949698100102104106108 = 1e6; //@line 1755
    label = 60; //@line 1756
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
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1773
         label = 60; //@line 1774
         break L10;
        }
       }
       $$043 = 15; //@line 1778
       $$048 = $18; //@line 1778
       break;
      } else {
       switch ($18 | 0) {
       case 65536:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1786
         label = 60; //@line 1787
         break L10;
        }
       }
       $$043 = 16; //@line 1791
       $$048 = $18; //@line 1791
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
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1802
         label = 60; //@line 1803
         break L10;
        }
       }
       $$043 = 17; //@line 1807
       $$048 = $18; //@line 1807
       break;
      } else {
       switch ($18 | 0) {
       case 262144:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1815
         label = 60; //@line 1816
         break L10;
        }
       }
       $$043 = 18; //@line 1820
       $$048 = $18; //@line 1820
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
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1834
         label = 60; //@line 1835
         break L10;
        }
       }
       $$043 = 19; //@line 1839
       $$048 = $18; //@line 1839
       break;
      } else {
       switch ($18 | 0) {
       case 1048576:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1847
         label = 60; //@line 1848
         break L10;
        }
       }
       $$043 = 20; //@line 1852
       $$048 = $18; //@line 1852
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
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1863
         label = 60; //@line 1864
         break L10;
        }
       }
       $$043 = 21; //@line 1868
       $$048 = $18; //@line 1868
       break;
      } else {
       switch ($18 | 0) {
       case 4194304:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1876
         label = 60; //@line 1877
         break L10;
        }
       }
       $$043 = 22; //@line 1881
       $$048 = $18; //@line 1881
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
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1898
         label = 60; //@line 1899
         break L10;
        }
       }
       $$043 = 23; //@line 1903
       $$048 = $18; //@line 1903
       break;
      } else {
       switch ($18 | 0) {
       case 16777216:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1911
         label = 60; //@line 1912
         break L10;
        }
       }
       $$043 = 24; //@line 1916
       $$048 = $18; //@line 1916
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
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1927
         label = 60; //@line 1928
         break L10;
        }
       }
       $$043 = 25; //@line 1932
       $$048 = $18; //@line 1932
       break;
      } else {
       switch ($18 | 0) {
       case 67108864:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1940
         label = 60; //@line 1941
         break L10;
        }
       }
       $$043 = 26; //@line 1945
       $$048 = $18; //@line 1945
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
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1959
         label = 60; //@line 1960
         break L10;
        }
       }
       $$043 = 27; //@line 1964
       $$048 = $18; //@line 1964
       break;
      } else {
       switch ($18 | 0) {
       case 268435456:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1972
         label = 60; //@line 1973
         break L10;
        }
       }
       $$043 = 28; //@line 1977
       $$048 = $18; //@line 1977
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
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 1988
         label = 60; //@line 1989
         break L10;
        }
       }
       $$043 = 29; //@line 1993
       $$048 = $18; //@line 1993
       break;
      } else {
       switch ($18 | 0) {
       case 1073741824:
        {
         break;
        }
       default:
        {
         $$04750525456586062646668707274767880828486889092949698100102104106108 = $18; //@line 2001
         label = 60; //@line 2002
         break L10;
        }
       }
       $$043 = 30; //@line 2006
       $$048 = $18; //@line 2006
       break;
      }
     }
    }
   }
  }
 } while (0);
 if ((label | 0) == 60) {
  $$043 = 0; //@line 2015
  $$048 = $$04750525456586062646668707274767880828486889092949698100102104106108; //@line 2015
 }
 $24 = HEAP32[$14 + 4 >> 2] | 0; //@line 2018
 do {
  if (($24 + -4 | 0) >>> 0 > 28) {
   $AsyncCtx16 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2023
   _mbed_assert_internal(1751, 1753, 55); //@line 2024
   if (___async) {
    HEAP32[$AsyncCtx16 >> 2] = 63; //@line 2027
    HEAP32[$AsyncCtx16 + 4 >> 2] = $$048; //@line 2029
    HEAP32[$AsyncCtx16 + 8 >> 2] = $1; //@line 2031
    HEAP32[$AsyncCtx16 + 12 >> 2] = $0; //@line 2033
    HEAP8[$AsyncCtx16 + 16 >> 0] = $$043; //@line 2035
    HEAP32[$AsyncCtx16 + 20 >> 2] = $0; //@line 2037
    sp = STACKTOP; //@line 2038
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx16 | 0); //@line 2041
    $$044 = 32; //@line 2042
    break;
   }
  } else {
   $$044 = $24; //@line 2046
  }
 } while (0);
 $32 = 7 << $$044 + -4; //@line 2050
 $33 = ___muldi3($32 | 0, 0, 1e6, 0) | 0; //@line 2051
 $34 = tempRet0; //@line 2052
 $35 = _i64Add($$048 | 0, 0, -1, -1) | 0; //@line 2053
 $37 = _i64Add($35 | 0, tempRet0 | 0, $33 | 0, $34 | 0) | 0; //@line 2055
 $39 = ___udivdi3($37 | 0, tempRet0 | 0, $$048 | 0, 0) | 0; //@line 2057
 $40 = tempRet0; //@line 2058
 $41 = HEAP32[$1 >> 2] | 0; //@line 2059
 HEAP32[$41 >> 2] = 0; //@line 2060
 HEAP32[$41 + 4 >> 2] = 0; //@line 2062
 $45 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 2065
 $AsyncCtx6 = _emscripten_alloc_async_context(40, sp) | 0; //@line 2066
 $46 = FUNCTION_TABLE_i[$45 & 3]() | 0; //@line 2067
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 64; //@line 2070
  HEAP32[$AsyncCtx6 + 4 >> 2] = $1; //@line 2072
  HEAP32[$AsyncCtx6 + 8 >> 2] = $$048; //@line 2074
  HEAP8[$AsyncCtx6 + 12 >> 0] = $$043; //@line 2076
  HEAP32[$AsyncCtx6 + 16 >> 2] = $$044; //@line 2078
  HEAP32[$AsyncCtx6 + 20 >> 2] = $32; //@line 2080
  $53 = $AsyncCtx6 + 24 | 0; //@line 2082
  HEAP32[$53 >> 2] = $39; //@line 2084
  HEAP32[$53 + 4 >> 2] = $40; //@line 2087
  HEAP32[$AsyncCtx6 + 32 >> 2] = $0; //@line 2089
  HEAP32[$AsyncCtx6 + 36 >> 2] = $0; //@line 2091
  sp = STACKTOP; //@line 2092
  return;
 }
 _emscripten_free_async_context($AsyncCtx6 | 0); //@line 2095
 $59 = HEAP32[$1 >> 2] | 0; //@line 2096
 $60 = $59 + 32 | 0; //@line 2097
 HEAP32[$60 >> 2] = $46; //@line 2098
 $61 = $59 + 40 | 0; //@line 2099
 $62 = $61; //@line 2100
 HEAP32[$62 >> 2] = 0; //@line 2102
 HEAP32[$62 + 4 >> 2] = 0; //@line 2105
 $66 = $59 + 8 | 0; //@line 2106
 HEAP32[$66 >> 2] = $$048; //@line 2107
 $67 = $59 + 57 | 0; //@line 2108
 HEAP8[$67 >> 0] = $$043; //@line 2109
 $68 = _bitshift64Shl(1, 0, $$044 | 0) | 0; //@line 2110
 $70 = _i64Add($68 | 0, tempRet0 | 0, -1, 0) | 0; //@line 2112
 $72 = $59 + 12 | 0; //@line 2114
 HEAP32[$72 >> 2] = $70; //@line 2115
 HEAP32[$59 + 16 >> 2] = $32; //@line 2117
 $75 = $59 + 24 | 0; //@line 2119
 HEAP32[$75 >> 2] = $39; //@line 2121
 HEAP32[$75 + 4 >> 2] = $40; //@line 2124
 $79 = $59 + 48 | 0; //@line 2125
 $80 = $79; //@line 2126
 HEAP32[$80 >> 2] = 0; //@line 2128
 HEAP32[$80 + 4 >> 2] = 0; //@line 2131
 HEAP8[$59 + 56 >> 0] = 1; //@line 2133
 $87 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 2136
 $AsyncCtx9 = _emscripten_alloc_async_context(36, sp) | 0; //@line 2137
 $88 = FUNCTION_TABLE_i[$87 & 3]() | 0; //@line 2138
 if (___async) {
  HEAP32[$AsyncCtx9 >> 2] = 65; //@line 2141
  HEAP32[$AsyncCtx9 + 4 >> 2] = $1; //@line 2143
  HEAP32[$AsyncCtx9 + 8 >> 2] = $0; //@line 2145
  HEAP32[$AsyncCtx9 + 12 >> 2] = $60; //@line 2147
  HEAP32[$AsyncCtx9 + 16 >> 2] = $72; //@line 2149
  HEAP32[$AsyncCtx9 + 20 >> 2] = $66; //@line 2151
  HEAP32[$AsyncCtx9 + 24 >> 2] = $79; //@line 2153
  HEAP32[$AsyncCtx9 + 28 >> 2] = $67; //@line 2155
  HEAP32[$AsyncCtx9 + 32 >> 2] = $61; //@line 2157
  sp = STACKTOP; //@line 2158
  return;
 }
 _emscripten_free_async_context($AsyncCtx9 | 0); //@line 2161
 if (($88 | 0) != (HEAP32[(HEAP32[$1 >> 2] | 0) + 32 >> 2] | 0)) {
  $104 = $88 - (HEAP32[$60 >> 2] | 0) & HEAP32[$72 >> 2]; //@line 2170
  HEAP32[$60 >> 2] = $88; //@line 2171
  $105 = HEAP32[$66 >> 2] | 0; //@line 2172
  do {
   if (($105 | 0) == 1e6) {
    $180 = $104; //@line 2176
    $181 = 0; //@line 2176
   } else {
    $107 = HEAP8[$67 >> 0] | 0; //@line 2178
    $109 = ___muldi3($104 | 0, 0, 1e6, 0) | 0; //@line 2180
    $110 = tempRet0; //@line 2181
    if (!($107 << 24 >> 24)) {
     $143 = ___udivdi3($109 | 0, $110 | 0, $105 | 0, 0) | 0; //@line 2183
     $144 = tempRet0; //@line 2184
     $145 = ___muldi3($143 | 0, $144 | 0, $105 | 0, 0) | 0; //@line 2185
     $147 = _i64Subtract($109 | 0, $110 | 0, $145 | 0, tempRet0 | 0) | 0; //@line 2187
     $149 = $61; //@line 2189
     $155 = _i64Add($147 | 0, tempRet0 | 0, HEAP32[$149 >> 2] | 0, HEAP32[$149 + 4 >> 2] | 0) | 0; //@line 2195
     $156 = tempRet0; //@line 2196
     $157 = $61; //@line 2197
     HEAP32[$157 >> 2] = $155; //@line 2199
     HEAP32[$157 + 4 >> 2] = $156; //@line 2202
     if ($156 >>> 0 < 0 | ($156 | 0) == 0 & $155 >>> 0 < $105 >>> 0) {
      $180 = $143; //@line 2209
      $181 = $144; //@line 2209
      break;
     }
     $166 = _i64Add($143 | 0, $144 | 0, 1, 0) | 0; //@line 2212
     $167 = tempRet0; //@line 2213
     $168 = _i64Subtract($155 | 0, $156 | 0, $105 | 0, 0) | 0; //@line 2214
     $170 = $61; //@line 2216
     HEAP32[$170 >> 2] = $168; //@line 2218
     HEAP32[$170 + 4 >> 2] = tempRet0; //@line 2221
     $180 = $166; //@line 2222
     $181 = $167; //@line 2222
     break;
    } else {
     $111 = $107 & 255; //@line 2225
     $112 = _bitshift64Lshr($109 | 0, $110 | 0, $111 | 0) | 0; //@line 2226
     $113 = tempRet0; //@line 2227
     $114 = _bitshift64Shl($112 | 0, $113 | 0, $111 | 0) | 0; //@line 2228
     $116 = _i64Subtract($109 | 0, $110 | 0, $114 | 0, tempRet0 | 0) | 0; //@line 2230
     $118 = $61; //@line 2232
     $124 = _i64Add(HEAP32[$118 >> 2] | 0, HEAP32[$118 + 4 >> 2] | 0, $116 | 0, tempRet0 | 0) | 0; //@line 2238
     $125 = tempRet0; //@line 2239
     $126 = $61; //@line 2240
     HEAP32[$126 >> 2] = $124; //@line 2242
     HEAP32[$126 + 4 >> 2] = $125; //@line 2245
     if ($125 >>> 0 < 0 | ($125 | 0) == 0 & $124 >>> 0 < $105 >>> 0) {
      $180 = $112; //@line 2252
      $181 = $113; //@line 2252
      break;
     }
     $135 = _i64Add($112 | 0, $113 | 0, 1, 0) | 0; //@line 2255
     $136 = tempRet0; //@line 2256
     $137 = _i64Subtract($124 | 0, $125 | 0, $105 | 0, 0) | 0; //@line 2257
     $139 = $61; //@line 2259
     HEAP32[$139 >> 2] = $137; //@line 2261
     HEAP32[$139 + 4 >> 2] = tempRet0; //@line 2264
     $180 = $135; //@line 2265
     $181 = $136; //@line 2265
     break;
    }
   }
  } while (0);
  $174 = $79; //@line 2270
  $182 = _i64Add(HEAP32[$174 >> 2] | 0, HEAP32[$174 + 4 >> 2] | 0, $180 | 0, $181 | 0) | 0; //@line 2276
  $184 = $79; //@line 2278
  HEAP32[$184 >> 2] = $182; //@line 2280
  HEAP32[$184 + 4 >> 2] = tempRet0; //@line 2283
 }
 $AsyncCtx12 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2285
 _schedule_interrupt($0); //@line 2286
 if (___async) {
  HEAP32[$AsyncCtx12 >> 2] = 66; //@line 2289
  sp = STACKTOP; //@line 2290
  return;
 }
 _emscripten_free_async_context($AsyncCtx12 | 0); //@line 2293
 return;
}
function _mbed_vtracef__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$1$off0 = 0, $$1$off0$expand_i1_val = 0, $$1$off0$expand_i1_val18 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$3154 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $$lobit = 0, $$sink = 0, $10 = 0, $102 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $136 = 0, $14 = 0, $147 = 0, $148 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $159 = 0, $160 = 0, $161 = 0, $163 = 0, $164 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $57 = 0, $6 = 0, $62 = 0, $73 = 0, $74 = 0, $78 = 0, $79 = 0, $8 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $89 = 0, $91 = 0, $95 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx11 = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx7 = 0, $ReallocAsyncCtx8 = 0, $extract$t159 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 822
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 824
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 826
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 828
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 830
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 832
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 836
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 840
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 842
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 844
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 846
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 848
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 850
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 852
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 854
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 856
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 858
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 860
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 862
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 864
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 866
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 868
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 870
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 872
 HEAP32[95] = (HEAP32[95] | 0) + 1; //@line 875
 $53 = HEAP32[84] | 0; //@line 876
 do {
  if ($53 | 0) {
   HEAP8[$53 >> 0] = 0; //@line 880
   do {
    if ($2 << 24 >> 24 > -1 & ($4 | 0) != 0) {
     $57 = HEAP32[81] | 0; //@line 886
     if (HEAP8[$57 >> 0] | 0) {
      if (_strstr($57, $4) | 0) {
       $$0$i = 1; //@line 893
       break;
      }
     }
     $62 = HEAP32[82] | 0; //@line 897
     if (!(HEAP8[$62 >> 0] | 0)) {
      label = 9; //@line 901
     } else {
      if (!(_strstr($62, $4) | 0)) {
       $$0$i = 1; //@line 906
      } else {
       label = 9; //@line 908
      }
     }
    } else {
     label = 9; //@line 912
    }
   } while (0);
   if ((label | 0) == 9) {
    $$0$i = 0; //@line 916
   }
   if (!((HEAP32[91] | 0) != 0 & ((($4 | 0) == 0 | (($22 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[88] = HEAP32[86]; //@line 928
    break;
   }
   $73 = HEAPU8[320] | 0; //@line 932
   $74 = $2 & 255; //@line 933
   if ($74 & 31 & $73 | 0) {
    $78 = $73 & 64; //@line 938
    $$lobit = $78 >>> 6; //@line 939
    $79 = $$lobit & 255; //@line 940
    $83 = ($73 & 32 | 0) == 0; //@line 944
    $84 = HEAP32[85] | 0; //@line 945
    $85 = HEAP32[84] | 0; //@line 946
    $86 = $2 << 24 >> 24 == 1; //@line 947
    if ($86 | ($73 & 128 | 0) != 0) {
     $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 950
     _vsnprintf($85, $84, $22, $20) | 0; //@line 951
     if (___async) {
      HEAP32[$ReallocAsyncCtx12 >> 2] = 47; //@line 954
      $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 955
      $$expand_i1_val = $86 & 1; //@line 956
      HEAP8[$87 >> 0] = $$expand_i1_val; //@line 957
      sp = STACKTOP; //@line 958
      return;
     }
     ___async_unwind = 0; //@line 961
     HEAP32[$ReallocAsyncCtx12 >> 2] = 47; //@line 962
     $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 963
     $$expand_i1_val = $86 & 1; //@line 964
     HEAP8[$87 >> 0] = $$expand_i1_val; //@line 965
     sp = STACKTOP; //@line 966
     return;
    }
    if (!$78) {
     $$1$off0 = ($$lobit | 0) != 0; //@line 972
     $$1143 = $85; //@line 972
     $$1145 = $84; //@line 972
     $$3154 = 0; //@line 972
     label = 28; //@line 973
    } else {
     if ($83) {
      $$0142 = $85; //@line 976
      $$0144 = $84; //@line 976
     } else {
      $89 = _snprintf($85, $84, 1638, $14) | 0; //@line 978
      $$ = ($89 | 0) >= ($84 | 0) ? 0 : $89; //@line 980
      $91 = ($$ | 0) > 0; //@line 981
      $$0142 = $91 ? $85 + $$ | 0 : $85; //@line 986
      $$0144 = $84 - ($91 ? $$ : 0) | 0; //@line 986
     }
     if (($$0144 | 0) > 0) {
      $95 = $74 + -2 | 0; //@line 990
      switch ($95 >>> 1 | $95 << 31 | 0) {
      case 0:
       {
        $$sink = 1656; //@line 996
        label = 25; //@line 997
        break;
       }
      case 1:
       {
        $$sink = 1662; //@line 1001
        label = 25; //@line 1002
        break;
       }
      case 3:
       {
        $$sink = 1650; //@line 1006
        label = 25; //@line 1007
        break;
       }
      case 7:
       {
        $$sink = 1644; //@line 1011
        label = 25; //@line 1012
        break;
       }
      default:
       {
        $$0141 = 0; //@line 1016
        $$1152 = 0; //@line 1016
       }
      }
      if ((label | 0) == 25) {
       HEAP32[$10 >> 2] = $$sink; //@line 1020
       $$0141 = $79 & 1; //@line 1023
       $$1152 = _snprintf($$0142, $$0144, 1668, $10) | 0; //@line 1023
      }
      $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 1026
      $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 1028
      if (($$1152$ | 0) > 0) {
       $102 = $$0141 << 24 >> 24 == 0; //@line 1030
       $$1$off0 = $extract$t159; //@line 1035
       $$1143 = $102 ? $$0142 : $$0142 + $$1152$ | 0; //@line 1035
       $$1145 = $$0144 - ($102 ? 0 : $$1152$) | 0; //@line 1035
       $$3154 = $$1152; //@line 1035
       label = 28; //@line 1036
      } else {
       $$1$off0 = $extract$t159; //@line 1038
       $$1143 = $$0142; //@line 1038
       $$1145 = $$0144; //@line 1038
       $$3154 = $$1152$; //@line 1038
       label = 28; //@line 1039
      }
     }
    }
    if ((label | 0) == 28) {
     if (($$1145 | 0) > 0 & (HEAP32[89] | 0) != 0) {
      HEAP32[$18 >> 2] = HEAP32[$20 >> 2]; //@line 1050
      $ReallocAsyncCtx11 = _emscripten_realloc_async_context(104) | 0; //@line 1051
      $108 = _vsnprintf(0, 0, $22, $18) | 0; //@line 1052
      if (___async) {
       HEAP32[$ReallocAsyncCtx11 >> 2] = 51; //@line 1055
       $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 1056
       $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 1057
       HEAP8[$109 >> 0] = $$1$off0$expand_i1_val; //@line 1058
       $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 1059
       HEAP32[$110 >> 2] = $6; //@line 1060
       $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 1061
       HEAP32[$111 >> 2] = $8; //@line 1062
       $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 1063
       HEAP32[$112 >> 2] = $28; //@line 1064
       $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 1065
       HEAP32[$113 >> 2] = $30; //@line 1066
       $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 1067
       HEAP32[$114 >> 2] = $$3154; //@line 1068
       $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 1069
       HEAP32[$115 >> 2] = $$1143; //@line 1070
       $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 1071
       HEAP32[$116 >> 2] = $$1145; //@line 1072
       $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 1073
       HEAP32[$117 >> 2] = $74; //@line 1074
       $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 1075
       HEAP32[$118 >> 2] = $24; //@line 1076
       $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 1077
       HEAP32[$119 >> 2] = $4; //@line 1078
       $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 1079
       HEAP32[$120 >> 2] = $26; //@line 1080
       $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 1081
       HEAP32[$121 >> 2] = $32; //@line 1082
       $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 1083
       HEAP32[$122 >> 2] = $34; //@line 1084
       $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 1085
       HEAP32[$123 >> 2] = $36; //@line 1086
       $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 1087
       HEAP32[$124 >> 2] = $38; //@line 1088
       $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 1089
       HEAP32[$125 >> 2] = $40; //@line 1090
       $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 1091
       HEAP32[$126 >> 2] = $42; //@line 1092
       $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 1093
       HEAP32[$127 >> 2] = $44; //@line 1094
       $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 1095
       HEAP32[$128 >> 2] = $46; //@line 1096
       $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 1097
       HEAP32[$129 >> 2] = $22; //@line 1098
       $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 1099
       HEAP32[$130 >> 2] = $20; //@line 1100
       $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 1101
       HEAP32[$131 >> 2] = $48; //@line 1102
       $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 1103
       HEAP32[$132 >> 2] = $50; //@line 1104
       $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 1105
       HEAP32[$133 >> 2] = $18; //@line 1106
       sp = STACKTOP; //@line 1107
       return;
      }
      HEAP32[___async_retval >> 2] = $108; //@line 1111
      ___async_unwind = 0; //@line 1112
      HEAP32[$ReallocAsyncCtx11 >> 2] = 51; //@line 1113
      $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 1114
      $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 1115
      HEAP8[$109 >> 0] = $$1$off0$expand_i1_val; //@line 1116
      $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 1117
      HEAP32[$110 >> 2] = $6; //@line 1118
      $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 1119
      HEAP32[$111 >> 2] = $8; //@line 1120
      $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 1121
      HEAP32[$112 >> 2] = $28; //@line 1122
      $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 1123
      HEAP32[$113 >> 2] = $30; //@line 1124
      $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 1125
      HEAP32[$114 >> 2] = $$3154; //@line 1126
      $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 1127
      HEAP32[$115 >> 2] = $$1143; //@line 1128
      $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 1129
      HEAP32[$116 >> 2] = $$1145; //@line 1130
      $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 1131
      HEAP32[$117 >> 2] = $74; //@line 1132
      $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 1133
      HEAP32[$118 >> 2] = $24; //@line 1134
      $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 1135
      HEAP32[$119 >> 2] = $4; //@line 1136
      $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 1137
      HEAP32[$120 >> 2] = $26; //@line 1138
      $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 1139
      HEAP32[$121 >> 2] = $32; //@line 1140
      $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 1141
      HEAP32[$122 >> 2] = $34; //@line 1142
      $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 1143
      HEAP32[$123 >> 2] = $36; //@line 1144
      $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 1145
      HEAP32[$124 >> 2] = $38; //@line 1146
      $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 1147
      HEAP32[$125 >> 2] = $40; //@line 1148
      $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 1149
      HEAP32[$126 >> 2] = $42; //@line 1150
      $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 1151
      HEAP32[$127 >> 2] = $44; //@line 1152
      $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 1153
      HEAP32[$128 >> 2] = $46; //@line 1154
      $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 1155
      HEAP32[$129 >> 2] = $22; //@line 1156
      $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 1157
      HEAP32[$130 >> 2] = $20; //@line 1158
      $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 1159
      HEAP32[$131 >> 2] = $48; //@line 1160
      $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 1161
      HEAP32[$132 >> 2] = $50; //@line 1162
      $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 1163
      HEAP32[$133 >> 2] = $18; //@line 1164
      sp = STACKTOP; //@line 1165
      return;
     }
     if (($$1145 | 0) > 0) {
      $136 = $74 + -2 | 0; //@line 1170
      switch ($136 >>> 1 | $136 << 31 | 0) {
      case 0:
       {
        HEAP32[$24 >> 2] = $4; //@line 1176
        $$5156 = _snprintf($$1143, $$1145, 1671, $24) | 0; //@line 1178
        break;
       }
      case 1:
       {
        HEAP32[$32 >> 2] = $4; //@line 1182
        $$5156 = _snprintf($$1143, $$1145, 1686, $32) | 0; //@line 1184
        break;
       }
      case 3:
       {
        HEAP32[$36 >> 2] = $4; //@line 1188
        $$5156 = _snprintf($$1143, $$1145, 1701, $36) | 0; //@line 1190
        break;
       }
      case 7:
       {
        HEAP32[$40 >> 2] = $4; //@line 1194
        $$5156 = _snprintf($$1143, $$1145, 1716, $40) | 0; //@line 1196
        break;
       }
      default:
       {
        $$5156 = _snprintf($$1143, $$1145, 1731, $44) | 0; //@line 1201
       }
      }
      $$5156$ = ($$5156 | 0) < ($$1145 | 0) ? $$5156 : 0; //@line 1205
      $147 = $$1143 + $$5156$ | 0; //@line 1207
      $148 = $$1145 - $$5156$ | 0; //@line 1208
      if (($$5156$ | 0) > 0 & ($148 | 0) > 0) {
       $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 1212
       $150 = _vsnprintf($147, $148, $22, $20) | 0; //@line 1213
       if (___async) {
        HEAP32[$ReallocAsyncCtx10 >> 2] = 53; //@line 1216
        $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 1217
        $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 1218
        HEAP8[$151 >> 0] = $$1$off0$expand_i1_val18; //@line 1219
        $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 1220
        HEAP32[$152 >> 2] = $6; //@line 1221
        $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 1222
        HEAP32[$153 >> 2] = $8; //@line 1223
        $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 1224
        HEAP32[$154 >> 2] = $148; //@line 1225
        $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 1226
        HEAP32[$155 >> 2] = $147; //@line 1227
        $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 1228
        HEAP32[$156 >> 2] = $28; //@line 1229
        $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 1230
        HEAP32[$157 >> 2] = $30; //@line 1231
        sp = STACKTOP; //@line 1232
        return;
       }
       HEAP32[___async_retval >> 2] = $150; //@line 1236
       ___async_unwind = 0; //@line 1237
       HEAP32[$ReallocAsyncCtx10 >> 2] = 53; //@line 1238
       $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 1239
       $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 1240
       HEAP8[$151 >> 0] = $$1$off0$expand_i1_val18; //@line 1241
       $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 1242
       HEAP32[$152 >> 2] = $6; //@line 1243
       $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 1244
       HEAP32[$153 >> 2] = $8; //@line 1245
       $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 1246
       HEAP32[$154 >> 2] = $148; //@line 1247
       $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 1248
       HEAP32[$155 >> 2] = $147; //@line 1249
       $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 1250
       HEAP32[$156 >> 2] = $28; //@line 1251
       $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 1252
       HEAP32[$157 >> 2] = $30; //@line 1253
       sp = STACKTOP; //@line 1254
       return;
      }
     }
    }
    $159 = HEAP32[91] | 0; //@line 1259
    $160 = HEAP32[84] | 0; //@line 1260
    $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 1261
    FUNCTION_TABLE_vi[$159 & 255]($160); //@line 1262
    if (___async) {
     HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 1265
     sp = STACKTOP; //@line 1266
     return;
    }
    ___async_unwind = 0; //@line 1269
    HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 1270
    sp = STACKTOP; //@line 1271
    return;
   }
  }
 } while (0);
 $161 = HEAP32[94] | 0; //@line 1276
 if (!$161) {
  return;
 }
 $163 = HEAP32[95] | 0; //@line 1281
 HEAP32[95] = 0; //@line 1282
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 1283
 FUNCTION_TABLE_v[$161 & 15](); //@line 1284
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 1287
  $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 1288
  HEAP32[$164 >> 2] = $163; //@line 1289
  sp = STACKTOP; //@line 1290
  return;
 }
 ___async_unwind = 0; //@line 1293
 HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 1294
 $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 1295
 HEAP32[$164 >> 2] = $163; //@line 1296
 sp = STACKTOP; //@line 1297
 return;
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 6374
 $3 = HEAP32[1488] | 0; //@line 6375
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 6378
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 6382
 $7 = $6 & 3; //@line 6383
 if (($7 | 0) == 1) {
  _abort(); //@line 6386
 }
 $9 = $6 & -8; //@line 6389
 $10 = $2 + $9 | 0; //@line 6390
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 6395
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 6401
   $17 = $13 + $9 | 0; //@line 6402
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 6405
   }
   if ((HEAP32[1489] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 6411
    $106 = HEAP32[$105 >> 2] | 0; //@line 6412
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 6416
     $$1382 = $17; //@line 6416
     $114 = $16; //@line 6416
     break;
    }
    HEAP32[1486] = $17; //@line 6419
    HEAP32[$105 >> 2] = $106 & -2; //@line 6421
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 6424
    HEAP32[$16 + $17 >> 2] = $17; //@line 6426
    return;
   }
   $21 = $13 >>> 3; //@line 6429
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 6433
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 6435
    $28 = 5976 + ($21 << 1 << 2) | 0; //@line 6437
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 6442
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 6449
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1484] = HEAP32[1484] & ~(1 << $21); //@line 6459
     $$1 = $16; //@line 6460
     $$1382 = $17; //@line 6460
     $114 = $16; //@line 6460
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 6466
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 6470
     }
     $41 = $26 + 8 | 0; //@line 6473
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 6477
     } else {
      _abort(); //@line 6479
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 6484
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 6485
    $$1 = $16; //@line 6486
    $$1382 = $17; //@line 6486
    $114 = $16; //@line 6486
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 6490
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 6492
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 6496
     $60 = $59 + 4 | 0; //@line 6497
     $61 = HEAP32[$60 >> 2] | 0; //@line 6498
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 6501
      if (!$63) {
       $$3 = 0; //@line 6504
       break;
      } else {
       $$1387 = $63; //@line 6507
       $$1390 = $59; //@line 6507
      }
     } else {
      $$1387 = $61; //@line 6510
      $$1390 = $60; //@line 6510
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 6513
      $66 = HEAP32[$65 >> 2] | 0; //@line 6514
      if ($66 | 0) {
       $$1387 = $66; //@line 6517
       $$1390 = $65; //@line 6517
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 6520
      $69 = HEAP32[$68 >> 2] | 0; //@line 6521
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 6526
       $$1390 = $68; //@line 6526
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 6531
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 6534
      $$3 = $$1387; //@line 6535
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 6540
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 6543
     }
     $53 = $51 + 12 | 0; //@line 6546
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 6550
     }
     $56 = $48 + 8 | 0; //@line 6553
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 6557
      HEAP32[$56 >> 2] = $51; //@line 6558
      $$3 = $48; //@line 6559
      break;
     } else {
      _abort(); //@line 6562
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 6569
    $$1382 = $17; //@line 6569
    $114 = $16; //@line 6569
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 6572
    $75 = 6240 + ($74 << 2) | 0; //@line 6573
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 6578
      if (!$$3) {
       HEAP32[1485] = HEAP32[1485] & ~(1 << $74); //@line 6585
       $$1 = $16; //@line 6586
       $$1382 = $17; //@line 6586
       $114 = $16; //@line 6586
       break L10;
      }
     } else {
      if ((HEAP32[1488] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 6593
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 6601
       if (!$$3) {
        $$1 = $16; //@line 6604
        $$1382 = $17; //@line 6604
        $114 = $16; //@line 6604
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1488] | 0; //@line 6612
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 6615
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 6619
    $92 = $16 + 16 | 0; //@line 6620
    $93 = HEAP32[$92 >> 2] | 0; //@line 6621
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 6627
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 6631
       HEAP32[$93 + 24 >> 2] = $$3; //@line 6633
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 6639
    if (!$99) {
     $$1 = $16; //@line 6642
     $$1382 = $17; //@line 6642
     $114 = $16; //@line 6642
    } else {
     if ((HEAP32[1488] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 6647
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 6651
      HEAP32[$99 + 24 >> 2] = $$3; //@line 6653
      $$1 = $16; //@line 6654
      $$1382 = $17; //@line 6654
      $114 = $16; //@line 6654
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 6660
   $$1382 = $9; //@line 6660
   $114 = $2; //@line 6660
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 6665
 }
 $115 = $10 + 4 | 0; //@line 6668
 $116 = HEAP32[$115 >> 2] | 0; //@line 6669
 if (!($116 & 1)) {
  _abort(); //@line 6673
 }
 if (!($116 & 2)) {
  if ((HEAP32[1490] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1487] | 0) + $$1382 | 0; //@line 6683
   HEAP32[1487] = $124; //@line 6684
   HEAP32[1490] = $$1; //@line 6685
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 6688
   if (($$1 | 0) != (HEAP32[1489] | 0)) {
    return;
   }
   HEAP32[1489] = 0; //@line 6694
   HEAP32[1486] = 0; //@line 6695
   return;
  }
  if ((HEAP32[1489] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1486] | 0) + $$1382 | 0; //@line 6702
   HEAP32[1486] = $132; //@line 6703
   HEAP32[1489] = $114; //@line 6704
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 6707
   HEAP32[$114 + $132 >> 2] = $132; //@line 6709
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 6713
  $138 = $116 >>> 3; //@line 6714
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 6719
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 6721
    $145 = 5976 + ($138 << 1 << 2) | 0; //@line 6723
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1488] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 6729
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 6736
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1484] = HEAP32[1484] & ~(1 << $138); //@line 6746
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 6752
    } else {
     if ((HEAP32[1488] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 6757
     }
     $160 = $143 + 8 | 0; //@line 6760
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 6764
     } else {
      _abort(); //@line 6766
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 6771
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 6772
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 6775
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 6777
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 6781
      $180 = $179 + 4 | 0; //@line 6782
      $181 = HEAP32[$180 >> 2] | 0; //@line 6783
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 6786
       if (!$183) {
        $$3400 = 0; //@line 6789
        break;
       } else {
        $$1398 = $183; //@line 6792
        $$1402 = $179; //@line 6792
       }
      } else {
       $$1398 = $181; //@line 6795
       $$1402 = $180; //@line 6795
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 6798
       $186 = HEAP32[$185 >> 2] | 0; //@line 6799
       if ($186 | 0) {
        $$1398 = $186; //@line 6802
        $$1402 = $185; //@line 6802
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 6805
       $189 = HEAP32[$188 >> 2] | 0; //@line 6806
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 6811
        $$1402 = $188; //@line 6811
       }
      }
      if ((HEAP32[1488] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 6817
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 6820
       $$3400 = $$1398; //@line 6821
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 6826
      if ((HEAP32[1488] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 6830
      }
      $173 = $170 + 12 | 0; //@line 6833
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 6837
      }
      $176 = $167 + 8 | 0; //@line 6840
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 6844
       HEAP32[$176 >> 2] = $170; //@line 6845
       $$3400 = $167; //@line 6846
       break;
      } else {
       _abort(); //@line 6849
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 6857
     $196 = 6240 + ($195 << 2) | 0; //@line 6858
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 6863
       if (!$$3400) {
        HEAP32[1485] = HEAP32[1485] & ~(1 << $195); //@line 6870
        break L108;
       }
      } else {
       if ((HEAP32[1488] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 6877
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 6885
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1488] | 0; //@line 6895
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 6898
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 6902
     $213 = $10 + 16 | 0; //@line 6903
     $214 = HEAP32[$213 >> 2] | 0; //@line 6904
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 6910
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 6914
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 6916
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 6922
     if ($220 | 0) {
      if ((HEAP32[1488] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 6928
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 6932
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 6934
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 6943
  HEAP32[$114 + $137 >> 2] = $137; //@line 6945
  if (($$1 | 0) == (HEAP32[1489] | 0)) {
   HEAP32[1486] = $137; //@line 6949
   return;
  } else {
   $$2 = $137; //@line 6952
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 6956
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 6959
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 6961
  $$2 = $$1382; //@line 6962
 }
 $235 = $$2 >>> 3; //@line 6964
 if ($$2 >>> 0 < 256) {
  $238 = 5976 + ($235 << 1 << 2) | 0; //@line 6968
  $239 = HEAP32[1484] | 0; //@line 6969
  $240 = 1 << $235; //@line 6970
  if (!($239 & $240)) {
   HEAP32[1484] = $239 | $240; //@line 6975
   $$0403 = $238; //@line 6977
   $$pre$phiZ2D = $238 + 8 | 0; //@line 6977
  } else {
   $244 = $238 + 8 | 0; //@line 6979
   $245 = HEAP32[$244 >> 2] | 0; //@line 6980
   if ((HEAP32[1488] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 6984
   } else {
    $$0403 = $245; //@line 6987
    $$pre$phiZ2D = $244; //@line 6987
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 6990
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 6992
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 6994
  HEAP32[$$1 + 12 >> 2] = $238; //@line 6996
  return;
 }
 $251 = $$2 >>> 8; //@line 6999
 if (!$251) {
  $$0396 = 0; //@line 7002
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 7006
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 7010
   $257 = $251 << $256; //@line 7011
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 7014
   $262 = $257 << $260; //@line 7016
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 7019
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 7024
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 7030
  }
 }
 $276 = 6240 + ($$0396 << 2) | 0; //@line 7033
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 7035
 HEAP32[$$1 + 20 >> 2] = 0; //@line 7038
 HEAP32[$$1 + 16 >> 2] = 0; //@line 7039
 $280 = HEAP32[1485] | 0; //@line 7040
 $281 = 1 << $$0396; //@line 7041
 do {
  if (!($280 & $281)) {
   HEAP32[1485] = $280 | $281; //@line 7047
   HEAP32[$276 >> 2] = $$1; //@line 7048
   HEAP32[$$1 + 24 >> 2] = $276; //@line 7050
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 7052
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 7054
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 7062
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 7062
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 7069
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 7073
    $301 = HEAP32[$299 >> 2] | 0; //@line 7075
    if (!$301) {
     label = 121; //@line 7078
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 7081
     $$0384 = $301; //@line 7081
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1488] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 7088
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 7091
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 7093
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 7095
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 7097
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 7102
    $309 = HEAP32[$308 >> 2] | 0; //@line 7103
    $310 = HEAP32[1488] | 0; //@line 7104
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 7110
     HEAP32[$308 >> 2] = $$1; //@line 7111
     HEAP32[$$1 + 8 >> 2] = $309; //@line 7113
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 7115
     HEAP32[$$1 + 24 >> 2] = 0; //@line 7117
     break;
    } else {
     _abort(); //@line 7120
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1492] | 0) + -1 | 0; //@line 7127
 HEAP32[1492] = $319; //@line 7128
 if (!$319) {
  $$0212$in$i = 6392; //@line 7131
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 7136
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 7142
  }
 }
 HEAP32[1492] = -1; //@line 7145
 return;
}
function _initialize__async_cb_54($0) {
 $0 = $0 | 0;
 var $$043 = 0, $$048 = 0, $10 = 0, $11 = 0, $12 = 0, $14 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $27 = 0, $29 = 0, $30 = 0, $31 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $6 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3493
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3495
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3497
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3499
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3501
 $8 = HEAP32[$AsyncRetVal >> 2] | 0; //@line 3502
 L2 : do {
  if (($8 | 0) < 32768) {
   if (($8 | 0) >= 128) {
    if (($8 | 0) < 2048) {
     switch ($8 | 0) {
     case 1024:
      {
       $$043 = 10; //@line 3512
       $$048 = $8; //@line 3512
       break L2;
       break;
      }
     case 512:
      {
       $$043 = 9; //@line 3517
       $$048 = $8; //@line 3517
       break L2;
       break;
      }
     case 256:
      {
       $$043 = 8; //@line 3522
       $$048 = $8; //@line 3522
       break L2;
       break;
      }
     case 128:
      {
       $$043 = 7; //@line 3527
       $$048 = $8; //@line 3527
       break L2;
       break;
      }
     default:
      {
       label = 43; //@line 3532
       break L2;
      }
     }
    }
    if (($8 | 0) < 8192) {
     switch ($8 | 0) {
     case 4096:
      {
       $$043 = 12; //@line 3541
       $$048 = $8; //@line 3541
       break L2;
       break;
      }
     case 2048:
      {
       $$043 = 11; //@line 3546
       $$048 = $8; //@line 3546
       break L2;
       break;
      }
     default:
      {
       label = 43; //@line 3551
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
       label = 43; //@line 3563
       break L2;
      }
     }
     $$043 = 13; //@line 3567
     $$048 = $8; //@line 3567
     break;
    } else {
     switch ($8 | 0) {
     case 16384:
      {
       break;
      }
     default:
      {
       label = 43; //@line 3575
       break L2;
      }
     }
     $$043 = 14; //@line 3579
     $$048 = $8; //@line 3579
     break;
    }
   }
   if (($8 | 0) >= 8) {
    switch ($8 | 0) {
    case 64:
     {
      $$043 = 6; //@line 3587
      $$048 = $8; //@line 3587
      break L2;
      break;
     }
    case 32:
     {
      $$043 = 5; //@line 3592
      $$048 = $8; //@line 3592
      break L2;
      break;
     }
    case 16:
     {
      $$043 = 4; //@line 3597
      $$048 = $8; //@line 3597
      break L2;
      break;
     }
    case 8:
     {
      $$043 = 3; //@line 3602
      $$048 = $8; //@line 3602
      break L2;
      break;
     }
    default:
     {
      label = 43; //@line 3607
      break L2;
     }
    }
   }
   if (($8 | 0) >= 2) {
    switch ($8 | 0) {
    case 4:
     {
      $$043 = 2; //@line 3616
      $$048 = $8; //@line 3616
      break L2;
      break;
     }
    case 2:
     {
      $$043 = 1; //@line 3621
      $$048 = $8; //@line 3621
      break L2;
      break;
     }
    default:
     {
      label = 43; //@line 3626
      break L2;
     }
    }
   }
   if (($8 | 0) < 0) {
    switch ($8 | 0) {
    case -2147483648:
     {
      $$043 = 31; //@line 3635
      $$048 = -2147483648; //@line 3635
      break L2;
      break;
     }
    default:
     {
      label = 43; //@line 3640
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
     label = 43; //@line 3650
     break L2;
    }
   }
   $ReallocAsyncCtx7 = _emscripten_realloc_async_context(20) | 0; //@line 3654
   _mbed_assert_internal(1751, 1753, 41); //@line 3655
   if (___async) {
    HEAP32[$ReallocAsyncCtx7 >> 2] = 62; //@line 3658
    $9 = $ReallocAsyncCtx7 + 4 | 0; //@line 3659
    HEAP32[$9 >> 2] = $2; //@line 3660
    $10 = $ReallocAsyncCtx7 + 8 | 0; //@line 3661
    HEAP32[$10 >> 2] = $4; //@line 3662
    $11 = $ReallocAsyncCtx7 + 12 | 0; //@line 3663
    HEAP32[$11 >> 2] = $AsyncRetVal; //@line 3664
    $12 = $ReallocAsyncCtx7 + 16 | 0; //@line 3665
    HEAP32[$12 >> 2] = $6; //@line 3666
    sp = STACKTOP; //@line 3667
    return;
   }
   ___async_unwind = 0; //@line 3670
   HEAP32[$ReallocAsyncCtx7 >> 2] = 62; //@line 3671
   $9 = $ReallocAsyncCtx7 + 4 | 0; //@line 3672
   HEAP32[$9 >> 2] = $2; //@line 3673
   $10 = $ReallocAsyncCtx7 + 8 | 0; //@line 3674
   HEAP32[$10 >> 2] = $4; //@line 3675
   $11 = $ReallocAsyncCtx7 + 12 | 0; //@line 3676
   HEAP32[$11 >> 2] = $AsyncRetVal; //@line 3677
   $12 = $ReallocAsyncCtx7 + 16 | 0; //@line 3678
   HEAP32[$12 >> 2] = $6; //@line 3679
   sp = STACKTOP; //@line 3680
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
         label = 43; //@line 3696
         break L2;
        }
       }
       $$043 = 15; //@line 3700
       $$048 = $8; //@line 3700
       break;
      } else {
       switch ($8 | 0) {
       case 65536:
        {
         break;
        }
       default:
        {
         label = 43; //@line 3708
         break L2;
        }
       }
       $$043 = 16; //@line 3712
       $$048 = $8; //@line 3712
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
         label = 43; //@line 3723
         break L2;
        }
       }
       $$043 = 17; //@line 3727
       $$048 = $8; //@line 3727
       break;
      } else {
       switch ($8 | 0) {
       case 262144:
        {
         break;
        }
       default:
        {
         label = 43; //@line 3735
         break L2;
        }
       }
       $$043 = 18; //@line 3739
       $$048 = $8; //@line 3739
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
         label = 43; //@line 3753
         break L2;
        }
       }
       $$043 = 19; //@line 3757
       $$048 = $8; //@line 3757
       break;
      } else {
       switch ($8 | 0) {
       case 1048576:
        {
         break;
        }
       default:
        {
         label = 43; //@line 3765
         break L2;
        }
       }
       $$043 = 20; //@line 3769
       $$048 = $8; //@line 3769
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
         label = 43; //@line 3780
         break L2;
        }
       }
       $$043 = 21; //@line 3784
       $$048 = $8; //@line 3784
       break;
      } else {
       switch ($8 | 0) {
       case 4194304:
        {
         break;
        }
       default:
        {
         label = 43; //@line 3792
         break L2;
        }
       }
       $$043 = 22; //@line 3796
       $$048 = $8; //@line 3796
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
         label = 43; //@line 3813
         break L2;
        }
       }
       $$043 = 23; //@line 3817
       $$048 = $8; //@line 3817
       break;
      } else {
       switch ($8 | 0) {
       case 16777216:
        {
         break;
        }
       default:
        {
         label = 43; //@line 3825
         break L2;
        }
       }
       $$043 = 24; //@line 3829
       $$048 = $8; //@line 3829
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
         label = 43; //@line 3840
         break L2;
        }
       }
       $$043 = 25; //@line 3844
       $$048 = $8; //@line 3844
       break;
      } else {
       switch ($8 | 0) {
       case 67108864:
        {
         break;
        }
       default:
        {
         label = 43; //@line 3852
         break L2;
        }
       }
       $$043 = 26; //@line 3856
       $$048 = $8; //@line 3856
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
         label = 43; //@line 3870
         break L2;
        }
       }
       $$043 = 27; //@line 3874
       $$048 = $8; //@line 3874
       break;
      } else {
       switch ($8 | 0) {
       case 268435456:
        {
         break;
        }
       default:
        {
         label = 43; //@line 3882
         break L2;
        }
       }
       $$043 = 28; //@line 3886
       $$048 = $8; //@line 3886
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
         label = 43; //@line 3897
         break L2;
        }
       }
       $$043 = 29; //@line 3901
       $$048 = $8; //@line 3901
       break;
      } else {
       switch ($8 | 0) {
       case 1073741824:
        {
         break;
        }
       default:
        {
         label = 43; //@line 3909
         break L2;
        }
       }
       $$043 = 30; //@line 3913
       $$048 = $8; //@line 3913
       break;
      }
     }
    }
   }
  }
 } while (0);
 if ((label | 0) == 43) {
  $$043 = 0; //@line 3922
  $$048 = $8; //@line 3922
 }
 $14 = HEAP32[$AsyncRetVal + 4 >> 2] | 0; //@line 3925
 if (($14 + -4 | 0) >>> 0 > 28) {
  $ReallocAsyncCtx6 = _emscripten_realloc_async_context(24) | 0; //@line 3929
  _mbed_assert_internal(1751, 1753, 55); //@line 3930
  if (___async) {
   HEAP32[$ReallocAsyncCtx6 >> 2] = 63; //@line 3933
   $16 = $ReallocAsyncCtx6 + 4 | 0; //@line 3934
   HEAP32[$16 >> 2] = $$048; //@line 3935
   $17 = $ReallocAsyncCtx6 + 8 | 0; //@line 3936
   HEAP32[$17 >> 2] = $2; //@line 3937
   $18 = $ReallocAsyncCtx6 + 12 | 0; //@line 3938
   HEAP32[$18 >> 2] = $4; //@line 3939
   $19 = $ReallocAsyncCtx6 + 16 | 0; //@line 3940
   HEAP8[$19 >> 0] = $$043; //@line 3941
   $20 = $ReallocAsyncCtx6 + 20 | 0; //@line 3942
   HEAP32[$20 >> 2] = $6; //@line 3943
   sp = STACKTOP; //@line 3944
   return;
  }
  ___async_unwind = 0; //@line 3947
  HEAP32[$ReallocAsyncCtx6 >> 2] = 63; //@line 3948
  $16 = $ReallocAsyncCtx6 + 4 | 0; //@line 3949
  HEAP32[$16 >> 2] = $$048; //@line 3950
  $17 = $ReallocAsyncCtx6 + 8 | 0; //@line 3951
  HEAP32[$17 >> 2] = $2; //@line 3952
  $18 = $ReallocAsyncCtx6 + 12 | 0; //@line 3953
  HEAP32[$18 >> 2] = $4; //@line 3954
  $19 = $ReallocAsyncCtx6 + 16 | 0; //@line 3955
  HEAP8[$19 >> 0] = $$043; //@line 3956
  $20 = $ReallocAsyncCtx6 + 20 | 0; //@line 3957
  HEAP32[$20 >> 2] = $6; //@line 3958
  sp = STACKTOP; //@line 3959
  return;
 } else {
  $22 = 7 << $14 + -4; //@line 3963
  $23 = ___muldi3($22 | 0, 0, 1e6, 0) | 0; //@line 3964
  $24 = tempRet0; //@line 3965
  $25 = _i64Add($$048 | 0, 0, -1, -1) | 0; //@line 3966
  $27 = _i64Add($25 | 0, tempRet0 | 0, $23 | 0, $24 | 0) | 0; //@line 3968
  $29 = ___udivdi3($27 | 0, tempRet0 | 0, $$048 | 0, 0) | 0; //@line 3970
  $30 = tempRet0; //@line 3971
  $31 = HEAP32[$2 >> 2] | 0; //@line 3972
  HEAP32[$31 >> 2] = 0; //@line 3973
  HEAP32[$31 + 4 >> 2] = 0; //@line 3975
  $35 = HEAP32[(HEAP32[$4 >> 2] | 0) + 4 >> 2] | 0; //@line 3978
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 3979
  $36 = FUNCTION_TABLE_i[$35 & 3]() | 0; //@line 3980
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 3983
   $37 = $ReallocAsyncCtx3 + 4 | 0; //@line 3984
   HEAP32[$37 >> 2] = $2; //@line 3985
   $38 = $ReallocAsyncCtx3 + 8 | 0; //@line 3986
   HEAP32[$38 >> 2] = $$048; //@line 3987
   $39 = $ReallocAsyncCtx3 + 12 | 0; //@line 3988
   HEAP8[$39 >> 0] = $$043; //@line 3989
   $40 = $ReallocAsyncCtx3 + 16 | 0; //@line 3990
   HEAP32[$40 >> 2] = $14; //@line 3991
   $41 = $ReallocAsyncCtx3 + 20 | 0; //@line 3992
   HEAP32[$41 >> 2] = $22; //@line 3993
   $42 = $ReallocAsyncCtx3 + 24 | 0; //@line 3994
   $43 = $42; //@line 3995
   $44 = $43; //@line 3996
   HEAP32[$44 >> 2] = $29; //@line 3997
   $45 = $43 + 4 | 0; //@line 3998
   $46 = $45; //@line 3999
   HEAP32[$46 >> 2] = $30; //@line 4000
   $47 = $ReallocAsyncCtx3 + 32 | 0; //@line 4001
   HEAP32[$47 >> 2] = $4; //@line 4002
   $48 = $ReallocAsyncCtx3 + 36 | 0; //@line 4003
   HEAP32[$48 >> 2] = $6; //@line 4004
   sp = STACKTOP; //@line 4005
   return;
  }
  HEAP32[___async_retval >> 2] = $36; //@line 4009
  ___async_unwind = 0; //@line 4010
  HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 4011
  $37 = $ReallocAsyncCtx3 + 4 | 0; //@line 4012
  HEAP32[$37 >> 2] = $2; //@line 4013
  $38 = $ReallocAsyncCtx3 + 8 | 0; //@line 4014
  HEAP32[$38 >> 2] = $$048; //@line 4015
  $39 = $ReallocAsyncCtx3 + 12 | 0; //@line 4016
  HEAP8[$39 >> 0] = $$043; //@line 4017
  $40 = $ReallocAsyncCtx3 + 16 | 0; //@line 4018
  HEAP32[$40 >> 2] = $14; //@line 4019
  $41 = $ReallocAsyncCtx3 + 20 | 0; //@line 4020
  HEAP32[$41 >> 2] = $22; //@line 4021
  $42 = $ReallocAsyncCtx3 + 24 | 0; //@line 4022
  $43 = $42; //@line 4023
  $44 = $43; //@line 4024
  HEAP32[$44 >> 2] = $29; //@line 4025
  $45 = $43 + 4 | 0; //@line 4026
  $46 = $45; //@line 4027
  HEAP32[$46 >> 2] = $30; //@line 4028
  $47 = $ReallocAsyncCtx3 + 32 | 0; //@line 4029
  HEAP32[$47 >> 2] = $4; //@line 4030
  $48 = $ReallocAsyncCtx3 + 36 | 0; //@line 4031
  HEAP32[$48 >> 2] = $6; //@line 4032
  sp = STACKTOP; //@line 4033
  return;
 }
}
function _twoway_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0166 = 0, $$0168 = 0, $$0169 = 0, $$0169$be = 0, $$0170 = 0, $$0175$ph$ph$lcssa216 = 0, $$0175$ph$ph$lcssa216328 = 0, $$0175$ph$ph254 = 0, $$0179242 = 0, $$0183$ph197$ph253 = 0, $$0183$ph197248 = 0, $$0183$ph260 = 0, $$0185$ph$lcssa = 0, $$0185$ph$lcssa327 = 0, $$0185$ph259 = 0, $$0187219$ph325326 = 0, $$0187263 = 0, $$1176$$0175 = 0, $$1176$ph$ph$lcssa208 = 0, $$1176$ph$ph233 = 0, $$1180222 = 0, $$1184$ph193$ph232 = 0, $$1184$ph193227 = 0, $$1184$ph239 = 0, $$1186$$0185 = 0, $$1186$ph$lcssa = 0, $$1186$ph238 = 0, $$2181$sink = 0, $$3 = 0, $$3173 = 0, $$3178 = 0, $$3182221 = 0, $$4 = 0, $$pr = 0, $10 = 0, $105 = 0, $111 = 0, $113 = 0, $118 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $14 = 0, $2 = 0, $23 = 0, $25 = 0, $27 = 0, $3 = 0, $32 = 0, $34 = 0, $37 = 0, $4 = 0, $41 = 0, $45 = 0, $50 = 0, $52 = 0, $53 = 0, $56 = 0, $60 = 0, $68 = 0, $70 = 0, $74 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $83 = 0, $86 = 0, $93 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11485
 STACKTOP = STACKTOP + 1056 | 0; //@line 11486
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(1056); //@line 11486
 $2 = sp + 1024 | 0; //@line 11487
 $3 = sp; //@line 11488
 HEAP32[$2 >> 2] = 0; //@line 11489
 HEAP32[$2 + 4 >> 2] = 0; //@line 11489
 HEAP32[$2 + 8 >> 2] = 0; //@line 11489
 HEAP32[$2 + 12 >> 2] = 0; //@line 11489
 HEAP32[$2 + 16 >> 2] = 0; //@line 11489
 HEAP32[$2 + 20 >> 2] = 0; //@line 11489
 HEAP32[$2 + 24 >> 2] = 0; //@line 11489
 HEAP32[$2 + 28 >> 2] = 0; //@line 11489
 $4 = HEAP8[$1 >> 0] | 0; //@line 11490
 L1 : do {
  if (!($4 << 24 >> 24)) {
   $$0175$ph$ph$lcssa216328 = 1; //@line 11494
   $$0185$ph$lcssa327 = -1; //@line 11494
   $$0187219$ph325326 = 0; //@line 11494
   $$1176$ph$ph$lcssa208 = 1; //@line 11494
   $$1186$ph$lcssa = -1; //@line 11494
   label = 26; //@line 11495
  } else {
   $$0187263 = 0; //@line 11497
   $10 = $4; //@line 11497
   do {
    if (!(HEAP8[$0 + $$0187263 >> 0] | 0)) {
     $$3 = 0; //@line 11503
     break L1;
    }
    $14 = $2 + ((($10 & 255) >>> 5 & 255) << 2) | 0; //@line 11511
    HEAP32[$14 >> 2] = HEAP32[$14 >> 2] | 1 << ($10 & 31); //@line 11514
    $$0187263 = $$0187263 + 1 | 0; //@line 11515
    HEAP32[$3 + (($10 & 255) << 2) >> 2] = $$0187263; //@line 11518
    $10 = HEAP8[$1 + $$0187263 >> 0] | 0; //@line 11520
   } while ($10 << 24 >> 24 != 0);
   $23 = $$0187263 >>> 0 > 1; //@line 11528
   if ($23) {
    $$0183$ph260 = 0; //@line 11530
    $$0185$ph259 = -1; //@line 11530
    $130 = 1; //@line 11530
    L6 : while (1) {
     $$0175$ph$ph254 = 1; //@line 11532
     $$0183$ph197$ph253 = $$0183$ph260; //@line 11532
     $131 = $130; //@line 11532
     while (1) {
      $$0183$ph197248 = $$0183$ph197$ph253; //@line 11534
      $132 = $131; //@line 11534
      L10 : while (1) {
       $$0179242 = 1; //@line 11536
       $25 = $132; //@line 11536
       while (1) {
        $32 = HEAP8[$1 + ($$0179242 + $$0185$ph259) >> 0] | 0; //@line 11540
        $34 = HEAP8[$1 + $25 >> 0] | 0; //@line 11542
        if ($32 << 24 >> 24 != $34 << 24 >> 24) {
         break L10;
        }
        if (($$0179242 | 0) == ($$0175$ph$ph254 | 0)) {
         break;
        }
        $$0179242 = $$0179242 + 1 | 0; //@line 11548
        $27 = $$0179242 + $$0183$ph197248 | 0; //@line 11552
        if ($27 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 11557
         $$0185$ph$lcssa = $$0185$ph259; //@line 11557
         break L6;
        } else {
         $25 = $27; //@line 11555
        }
       }
       $37 = $$0175$ph$ph254 + $$0183$ph197248 | 0; //@line 11561
       $132 = $37 + 1 | 0; //@line 11562
       if ($132 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 11567
        $$0185$ph$lcssa = $$0185$ph259; //@line 11567
        break L6;
       } else {
        $$0183$ph197248 = $37; //@line 11565
       }
      }
      $41 = $25 - $$0185$ph259 | 0; //@line 11572
      if (($32 & 255) <= ($34 & 255)) {
       break;
      }
      $131 = $25 + 1 | 0; //@line 11576
      if ($131 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216 = $41; //@line 11581
       $$0185$ph$lcssa = $$0185$ph259; //@line 11581
       break L6;
      } else {
       $$0175$ph$ph254 = $41; //@line 11579
       $$0183$ph197$ph253 = $25; //@line 11579
      }
     }
     $130 = $$0183$ph197248 + 2 | 0; //@line 11586
     if ($130 >>> 0 >= $$0187263 >>> 0) {
      $$0175$ph$ph$lcssa216 = 1; //@line 11591
      $$0185$ph$lcssa = $$0183$ph197248; //@line 11591
      break;
     } else {
      $$0183$ph260 = $$0183$ph197248 + 1 | 0; //@line 11589
      $$0185$ph259 = $$0183$ph197248; //@line 11589
     }
    }
    if ($23) {
     $$1184$ph239 = 0; //@line 11596
     $$1186$ph238 = -1; //@line 11596
     $133 = 1; //@line 11596
     while (1) {
      $$1176$ph$ph233 = 1; //@line 11598
      $$1184$ph193$ph232 = $$1184$ph239; //@line 11598
      $135 = $133; //@line 11598
      while (1) {
       $$1184$ph193227 = $$1184$ph193$ph232; //@line 11600
       $134 = $135; //@line 11600
       L25 : while (1) {
        $$1180222 = 1; //@line 11602
        $52 = $134; //@line 11602
        while (1) {
         $50 = HEAP8[$1 + ($$1180222 + $$1186$ph238) >> 0] | 0; //@line 11606
         $53 = HEAP8[$1 + $52 >> 0] | 0; //@line 11608
         if ($50 << 24 >> 24 != $53 << 24 >> 24) {
          break L25;
         }
         if (($$1180222 | 0) == ($$1176$ph$ph233 | 0)) {
          break;
         }
         $$1180222 = $$1180222 + 1 | 0; //@line 11614
         $45 = $$1180222 + $$1184$ph193227 | 0; //@line 11618
         if ($45 >>> 0 >= $$0187263 >>> 0) {
          $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11623
          $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11623
          $$0187219$ph325326 = $$0187263; //@line 11623
          $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 11623
          $$1186$ph$lcssa = $$1186$ph238; //@line 11623
          label = 26; //@line 11624
          break L1;
         } else {
          $52 = $45; //@line 11621
         }
        }
        $56 = $$1176$ph$ph233 + $$1184$ph193227 | 0; //@line 11628
        $134 = $56 + 1 | 0; //@line 11629
        if ($134 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11634
         $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11634
         $$0187219$ph325326 = $$0187263; //@line 11634
         $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 11634
         $$1186$ph$lcssa = $$1186$ph238; //@line 11634
         label = 26; //@line 11635
         break L1;
        } else {
         $$1184$ph193227 = $56; //@line 11632
        }
       }
       $60 = $52 - $$1186$ph238 | 0; //@line 11640
       if (($50 & 255) >= ($53 & 255)) {
        break;
       }
       $135 = $52 + 1 | 0; //@line 11644
       if ($135 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11649
        $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11649
        $$0187219$ph325326 = $$0187263; //@line 11649
        $$1176$ph$ph$lcssa208 = $60; //@line 11649
        $$1186$ph$lcssa = $$1186$ph238; //@line 11649
        label = 26; //@line 11650
        break L1;
       } else {
        $$1176$ph$ph233 = $60; //@line 11647
        $$1184$ph193$ph232 = $52; //@line 11647
       }
      }
      $133 = $$1184$ph193227 + 2 | 0; //@line 11655
      if ($133 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11660
       $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11660
       $$0187219$ph325326 = $$0187263; //@line 11660
       $$1176$ph$ph$lcssa208 = 1; //@line 11660
       $$1186$ph$lcssa = $$1184$ph193227; //@line 11660
       label = 26; //@line 11661
       break;
      } else {
       $$1184$ph239 = $$1184$ph193227 + 1 | 0; //@line 11658
       $$1186$ph238 = $$1184$ph193227; //@line 11658
      }
     }
    } else {
     $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11666
     $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11666
     $$0187219$ph325326 = $$0187263; //@line 11666
     $$1176$ph$ph$lcssa208 = 1; //@line 11666
     $$1186$ph$lcssa = -1; //@line 11666
     label = 26; //@line 11667
    }
   } else {
    $$0175$ph$ph$lcssa216328 = 1; //@line 11670
    $$0185$ph$lcssa327 = -1; //@line 11670
    $$0187219$ph325326 = $$0187263; //@line 11670
    $$1176$ph$ph$lcssa208 = 1; //@line 11670
    $$1186$ph$lcssa = -1; //@line 11670
    label = 26; //@line 11671
   }
  }
 } while (0);
 L35 : do {
  if ((label | 0) == 26) {
   $68 = ($$1186$ph$lcssa + 1 | 0) >>> 0 > ($$0185$ph$lcssa327 + 1 | 0) >>> 0; //@line 11679
   $$1176$$0175 = $68 ? $$1176$ph$ph$lcssa208 : $$0175$ph$ph$lcssa216328; //@line 11680
   $$1186$$0185 = $68 ? $$1186$ph$lcssa : $$0185$ph$lcssa327; //@line 11681
   $70 = $$1186$$0185 + 1 | 0; //@line 11683
   if (!(_memcmp($1, $1 + $$1176$$0175 | 0, $70) | 0)) {
    $$0168 = $$0187219$ph325326 - $$1176$$0175 | 0; //@line 11688
    $$3178 = $$1176$$0175; //@line 11688
   } else {
    $74 = $$0187219$ph325326 - $$1186$$0185 + -1 | 0; //@line 11691
    $$0168 = 0; //@line 11695
    $$3178 = ($$1186$$0185 >>> 0 > $74 >>> 0 ? $$1186$$0185 : $74) + 1 | 0; //@line 11695
   }
   $78 = $$0187219$ph325326 | 63; //@line 11697
   $79 = $$0187219$ph325326 + -1 | 0; //@line 11698
   $80 = ($$0168 | 0) != 0; //@line 11699
   $81 = $$0187219$ph325326 - $$3178 | 0; //@line 11700
   $$0166 = $0; //@line 11701
   $$0169 = 0; //@line 11701
   $$0170 = $0; //@line 11701
   while (1) {
    $83 = $$0166; //@line 11704
    do {
     if (($$0170 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
      $86 = _memchr($$0170, 0, $78) | 0; //@line 11709
      if (!$86) {
       $$3173 = $$0170 + $78 | 0; //@line 11713
       break;
      } else {
       if (($86 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
        $$3 = 0; //@line 11720
        break L35;
       } else {
        $$3173 = $86; //@line 11723
        break;
       }
      }
     } else {
      $$3173 = $$0170; //@line 11728
     }
    } while (0);
    $93 = HEAP8[$$0166 + $79 >> 0] | 0; //@line 11732
    L49 : do {
     if (!(1 << ($93 & 31) & HEAP32[$2 + ((($93 & 255) >>> 5 & 255) << 2) >> 2])) {
      $$0169$be = 0; //@line 11744
      $$2181$sink = $$0187219$ph325326; //@line 11744
     } else {
      $105 = $$0187219$ph325326 - (HEAP32[$3 + (($93 & 255) << 2) >> 2] | 0) | 0; //@line 11749
      if ($105 | 0) {
       $$0169$be = 0; //@line 11757
       $$2181$sink = $80 & ($$0169 | 0) != 0 & $105 >>> 0 < $$3178 >>> 0 ? $81 : $105; //@line 11757
       break;
      }
      $111 = $70 >>> 0 > $$0169 >>> 0 ? $70 : $$0169; //@line 11761
      $113 = HEAP8[$1 + $111 >> 0] | 0; //@line 11763
      L54 : do {
       if (!($113 << 24 >> 24)) {
        $$4 = $70; //@line 11767
       } else {
        $$3182221 = $111; //@line 11769
        $$pr = $113; //@line 11769
        while (1) {
         if ($$pr << 24 >> 24 != (HEAP8[$$0166 + $$3182221 >> 0] | 0)) {
          break;
         }
         $118 = $$3182221 + 1 | 0; //@line 11777
         $$pr = HEAP8[$1 + $118 >> 0] | 0; //@line 11779
         if (!($$pr << 24 >> 24)) {
          $$4 = $70; //@line 11782
          break L54;
         } else {
          $$3182221 = $118; //@line 11785
         }
        }
        $$0169$be = 0; //@line 11789
        $$2181$sink = $$3182221 - $$1186$$0185 | 0; //@line 11789
        break L49;
       }
      } while (0);
      while (1) {
       if ($$4 >>> 0 <= $$0169 >>> 0) {
        $$3 = $$0166; //@line 11796
        break L35;
       }
       $$4 = $$4 + -1 | 0; //@line 11799
       if ((HEAP8[$1 + $$4 >> 0] | 0) != (HEAP8[$$0166 + $$4 >> 0] | 0)) {
        $$0169$be = $$0168; //@line 11808
        $$2181$sink = $$3178; //@line 11808
        break;
       }
      }
     }
    } while (0);
    $$0166 = $$0166 + $$2181$sink | 0; //@line 11815
    $$0169 = $$0169$be; //@line 11815
    $$0170 = $$3173; //@line 11815
   }
  }
 } while (0);
 STACKTOP = sp; //@line 11819
 return $$3 | 0; //@line 11819
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13289
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 13295
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 13304
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 13309
      $19 = $1 + 44 | 0; //@line 13310
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 13319
      $26 = $1 + 52 | 0; //@line 13320
      $27 = $1 + 53 | 0; //@line 13321
      $28 = $1 + 54 | 0; //@line 13322
      $29 = $0 + 8 | 0; //@line 13323
      $30 = $1 + 24 | 0; //@line 13324
      $$081$off0 = 0; //@line 13325
      $$084 = $0 + 16 | 0; //@line 13325
      $$085$off0 = 0; //@line 13325
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 13329
        label = 20; //@line 13330
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 13333
       HEAP8[$27 >> 0] = 0; //@line 13334
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 13335
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 13336
       if (___async) {
        label = 12; //@line 13339
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 13342
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 13346
        label = 20; //@line 13347
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 13354
         $$186$off0 = $$085$off0; //@line 13354
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 13363
           label = 20; //@line 13364
           break L10;
          } else {
           $$182$off0 = 1; //@line 13367
           $$186$off0 = $$085$off0; //@line 13367
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 13374
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 13381
          break L10;
         } else {
          $$182$off0 = 1; //@line 13384
          $$186$off0 = 1; //@line 13384
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 13389
       $$084 = $$084 + 8 | 0; //@line 13389
       $$085$off0 = $$186$off0; //@line 13389
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 157; //@line 13392
       HEAP32[$AsyncCtx15 + 4 >> 2] = $30; //@line 13394
       HEAP32[$AsyncCtx15 + 8 >> 2] = $28; //@line 13396
       HEAP8[$AsyncCtx15 + 12 >> 0] = $$081$off0 & 1; //@line 13399
       HEAP8[$AsyncCtx15 + 13 >> 0] = $$085$off0 & 1; //@line 13402
       HEAP32[$AsyncCtx15 + 16 >> 2] = $2; //@line 13404
       HEAP32[$AsyncCtx15 + 20 >> 2] = $13; //@line 13406
       HEAP32[$AsyncCtx15 + 24 >> 2] = $1; //@line 13408
       HEAP32[$AsyncCtx15 + 28 >> 2] = $19; //@line 13410
       HEAP32[$AsyncCtx15 + 32 >> 2] = $27; //@line 13412
       HEAP32[$AsyncCtx15 + 36 >> 2] = $26; //@line 13414
       HEAP32[$AsyncCtx15 + 40 >> 2] = $25; //@line 13416
       HEAP8[$AsyncCtx15 + 44 >> 0] = $4 & 1; //@line 13419
       HEAP32[$AsyncCtx15 + 48 >> 2] = $29; //@line 13421
       HEAP32[$AsyncCtx15 + 52 >> 2] = $$084; //@line 13423
       sp = STACKTOP; //@line 13424
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 13430
         $61 = $1 + 40 | 0; //@line 13431
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 13434
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 13442
           if ($$283$off0) {
            label = 25; //@line 13444
            break;
           } else {
            $69 = 4; //@line 13447
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 13454
        } else {
         $69 = 4; //@line 13456
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 13461
      }
      HEAP32[$19 >> 2] = $69; //@line 13463
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 13472
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 13477
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 13478
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 13479
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 13480
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 158; //@line 13483
    HEAP32[$AsyncCtx11 + 4 >> 2] = $73; //@line 13485
    HEAP32[$AsyncCtx11 + 8 >> 2] = $1; //@line 13487
    HEAP32[$AsyncCtx11 + 12 >> 2] = $2; //@line 13489
    HEAP32[$AsyncCtx11 + 16 >> 2] = $3; //@line 13491
    HEAP8[$AsyncCtx11 + 20 >> 0] = $4 & 1; //@line 13494
    HEAP32[$AsyncCtx11 + 24 >> 2] = $0; //@line 13496
    HEAP32[$AsyncCtx11 + 28 >> 2] = $72; //@line 13498
    sp = STACKTOP; //@line 13499
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 13502
   $81 = $0 + 24 | 0; //@line 13503
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 13507
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 13511
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 13518
       $$2 = $81; //@line 13519
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 13531
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 13532
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 13537
        $136 = $$2 + 8 | 0; //@line 13538
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 13541
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 161; //@line 13546
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 13548
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 13550
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 13552
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 13554
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 13556
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 13558
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 13560
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 13563
       sp = STACKTOP; //@line 13564
       return;
      }
      $104 = $1 + 24 | 0; //@line 13567
      $105 = $1 + 54 | 0; //@line 13568
      $$1 = $81; //@line 13569
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 13585
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 13586
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13591
       $122 = $$1 + 8 | 0; //@line 13592
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 13595
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 160; //@line 13600
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 13602
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 13604
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 13606
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 13608
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 13610
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 13612
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 13614
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 13616
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 13619
      sp = STACKTOP; //@line 13620
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 13624
    $$0 = $81; //@line 13625
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 13632
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 13633
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 13638
     $100 = $$0 + 8 | 0; //@line 13639
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 13642
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 159; //@line 13647
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 13649
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 13651
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 13653
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 13655
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 13657
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 13659
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 13662
    sp = STACKTOP; //@line 13663
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
 $n_sroa_0_0_extract_trunc = $a$0; //@line 6421
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 6422
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 6423
 $d_sroa_0_0_extract_trunc = $b$0; //@line 6424
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 6425
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 6426
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 6428
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 6431
    HEAP32[$rem + 4 >> 2] = 0; //@line 6432
   }
   $_0$1 = 0; //@line 6434
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 6435
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6436
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 6439
    $_0$0 = 0; //@line 6440
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6441
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 6443
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 6444
   $_0$1 = 0; //@line 6445
   $_0$0 = 0; //@line 6446
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6447
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 6450
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 6455
     HEAP32[$rem + 4 >> 2] = 0; //@line 6456
    }
    $_0$1 = 0; //@line 6458
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 6459
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6460
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 6464
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 6465
    }
    $_0$1 = 0; //@line 6467
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 6468
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6469
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 6471
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 6474
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 6475
    }
    $_0$1 = 0; //@line 6477
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 6478
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6479
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 6482
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 6484
    $58 = 31 - $51 | 0; //@line 6485
    $sr_1_ph = $57; //@line 6486
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 6487
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 6488
    $q_sroa_0_1_ph = 0; //@line 6489
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 6490
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 6494
    $_0$0 = 0; //@line 6495
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6496
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 6498
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 6499
   $_0$1 = 0; //@line 6500
   $_0$0 = 0; //@line 6501
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6502
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 6506
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 6508
     $126 = 31 - $119 | 0; //@line 6509
     $130 = $119 - 31 >> 31; //@line 6510
     $sr_1_ph = $125; //@line 6511
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 6512
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 6513
     $q_sroa_0_1_ph = 0; //@line 6514
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 6515
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 6519
     $_0$0 = 0; //@line 6520
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6521
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 6523
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 6524
    $_0$1 = 0; //@line 6525
    $_0$0 = 0; //@line 6526
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6527
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 6529
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 6532
    $89 = 64 - $88 | 0; //@line 6533
    $91 = 32 - $88 | 0; //@line 6534
    $92 = $91 >> 31; //@line 6535
    $95 = $88 - 32 | 0; //@line 6536
    $105 = $95 >> 31; //@line 6537
    $sr_1_ph = $88; //@line 6538
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 6539
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 6540
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 6541
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 6542
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 6546
    HEAP32[$rem + 4 >> 2] = 0; //@line 6547
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 6550
    $_0$0 = $a$0 | 0 | 0; //@line 6551
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6552
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 6554
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 6555
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 6556
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6557
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 6562
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 6563
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 6564
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 6565
  $carry_0_lcssa$1 = 0; //@line 6566
  $carry_0_lcssa$0 = 0; //@line 6567
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 6569
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 6570
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 6571
  $137$1 = tempRet0; //@line 6572
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 6573
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 6574
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 6575
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 6576
  $sr_1202 = $sr_1_ph; //@line 6577
  $carry_0203 = 0; //@line 6578
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 6580
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 6581
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 6582
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 6583
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 6584
   $150$1 = tempRet0; //@line 6585
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 6586
   $carry_0203 = $151$0 & 1; //@line 6587
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 6589
   $r_sroa_1_1200 = tempRet0; //@line 6590
   $sr_1202 = $sr_1202 - 1 | 0; //@line 6591
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 6603
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 6604
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 6605
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 6606
  $carry_0_lcssa$1 = 0; //@line 6607
  $carry_0_lcssa$0 = $carry_0203; //@line 6608
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 6610
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 6611
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 6614
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 6615
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 6617
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 6618
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6619
}
function _schedule_interrupt($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $104 = 0, $109 = 0, $11 = 0, $112 = 0, $114 = 0, $117 = 0, $118 = 0, $120 = 0, $123 = 0, $131 = 0, $132 = 0, $133 = 0, $135 = 0, $137 = 0, $14 = 0, $142 = 0, $149 = 0, $153 = 0, $156 = 0, $158 = 0, $161 = 0, $163 = 0, $170 = 0, $171 = 0, $174 = 0, $176 = 0, $178 = 0, $184 = 0, $185 = 0, $189 = 0, $19 = 0, $197 = 0, $2 = 0, $205 = 0, $208 = 0, $21 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $33 = 0, $35 = 0, $36 = 0, $42 = 0, $43 = 0, $44 = 0, $5 = 0, $53 = 0, $54 = 0, $55 = 0, $57 = 0, $6 = 0, $61 = 0, $62 = 0, $63 = 0, $65 = 0, $67 = 0, $68 = 0, $74 = 0, $75 = 0, $76 = 0, $85 = 0, $86 = 0, $87 = 0, $89 = 0, $93 = 0, $94 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx14 = 0, $AsyncCtx18 = 0, $AsyncCtx22 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2310
 $1 = $0 + 4 | 0; //@line 2311
 $2 = HEAP32[$1 >> 2] | 0; //@line 2312
 $5 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 2315
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 2316
 $6 = FUNCTION_TABLE_i[$5 & 3]() | 0; //@line 2317
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 67; //@line 2320
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 2322
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 2324
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 2326
  sp = STACKTOP; //@line 2327
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2330
 $10 = HEAP32[$1 >> 2] | 0; //@line 2331
 $11 = $10 + 32 | 0; //@line 2332
 if (($6 | 0) != (HEAP32[$11 >> 2] | 0)) {
  $14 = $2 + 32 | 0; //@line 2336
  $19 = $6 - (HEAP32[$14 >> 2] | 0) & HEAP32[$2 + 12 >> 2]; //@line 2341
  HEAP32[$14 >> 2] = $6; //@line 2342
  $21 = HEAP32[$2 + 8 >> 2] | 0; //@line 2344
  do {
   if (($21 | 0) == 1e6) {
    $100 = $19; //@line 2348
    $101 = 0; //@line 2348
   } else {
    $24 = HEAP8[$2 + 57 >> 0] | 0; //@line 2351
    $26 = ___muldi3($19 | 0, 0, 1e6, 0) | 0; //@line 2353
    $27 = tempRet0; //@line 2354
    if (!($24 << 24 >> 24)) {
     $61 = ___udivdi3($26 | 0, $27 | 0, $21 | 0, 0) | 0; //@line 2356
     $62 = tempRet0; //@line 2357
     $63 = ___muldi3($61 | 0, $62 | 0, $21 | 0, 0) | 0; //@line 2358
     $65 = _i64Subtract($26 | 0, $27 | 0, $63 | 0, tempRet0 | 0) | 0; //@line 2360
     $67 = $2 + 40 | 0; //@line 2362
     $68 = $67; //@line 2363
     $74 = _i64Add($65 | 0, tempRet0 | 0, HEAP32[$68 >> 2] | 0, HEAP32[$68 + 4 >> 2] | 0) | 0; //@line 2369
     $75 = tempRet0; //@line 2370
     $76 = $67; //@line 2371
     HEAP32[$76 >> 2] = $74; //@line 2373
     HEAP32[$76 + 4 >> 2] = $75; //@line 2376
     if ($75 >>> 0 < 0 | ($75 | 0) == 0 & $74 >>> 0 < $21 >>> 0) {
      $100 = $61; //@line 2383
      $101 = $62; //@line 2383
      break;
     }
     $85 = _i64Add($61 | 0, $62 | 0, 1, 0) | 0; //@line 2386
     $86 = tempRet0; //@line 2387
     $87 = _i64Subtract($74 | 0, $75 | 0, $21 | 0, 0) | 0; //@line 2388
     $89 = $67; //@line 2390
     HEAP32[$89 >> 2] = $87; //@line 2392
     HEAP32[$89 + 4 >> 2] = tempRet0; //@line 2395
     $100 = $85; //@line 2396
     $101 = $86; //@line 2396
     break;
    } else {
     $28 = $24 & 255; //@line 2399
     $29 = _bitshift64Lshr($26 | 0, $27 | 0, $28 | 0) | 0; //@line 2400
     $30 = tempRet0; //@line 2401
     $31 = _bitshift64Shl($29 | 0, $30 | 0, $28 | 0) | 0; //@line 2402
     $33 = _i64Subtract($26 | 0, $27 | 0, $31 | 0, tempRet0 | 0) | 0; //@line 2404
     $35 = $2 + 40 | 0; //@line 2406
     $36 = $35; //@line 2407
     $42 = _i64Add(HEAP32[$36 >> 2] | 0, HEAP32[$36 + 4 >> 2] | 0, $33 | 0, tempRet0 | 0) | 0; //@line 2413
     $43 = tempRet0; //@line 2414
     $44 = $35; //@line 2415
     HEAP32[$44 >> 2] = $42; //@line 2417
     HEAP32[$44 + 4 >> 2] = $43; //@line 2420
     if ($43 >>> 0 < 0 | ($43 | 0) == 0 & $42 >>> 0 < $21 >>> 0) {
      $100 = $29; //@line 2427
      $101 = $30; //@line 2427
      break;
     }
     $53 = _i64Add($29 | 0, $30 | 0, 1, 0) | 0; //@line 2430
     $54 = tempRet0; //@line 2431
     $55 = _i64Subtract($42 | 0, $43 | 0, $21 | 0, 0) | 0; //@line 2432
     $57 = $35; //@line 2434
     HEAP32[$57 >> 2] = $55; //@line 2436
     HEAP32[$57 + 4 >> 2] = tempRet0; //@line 2439
     $100 = $53; //@line 2440
     $101 = $54; //@line 2440
     break;
    }
   }
  } while (0);
  $93 = $2 + 48 | 0; //@line 2445
  $94 = $93; //@line 2446
  $102 = _i64Add(HEAP32[$94 >> 2] | 0, HEAP32[$94 + 4 >> 2] | 0, $100 | 0, $101 | 0) | 0; //@line 2452
  $104 = $93; //@line 2454
  HEAP32[$104 >> 2] = $102; //@line 2456
  HEAP32[$104 + 4 >> 2] = tempRet0; //@line 2459
 }
 $109 = HEAP32[$10 + 4 >> 2] | 0; //@line 2462
 if (!$109) {
  $205 = (HEAP32[$2 + 16 >> 2] | 0) + (HEAP32[$2 + 32 >> 2] | 0) & HEAP32[$2 + 12 >> 2]; //@line 2472
  $208 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 2475
  $AsyncCtx22 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2476
  FUNCTION_TABLE_vi[$208 & 255]($205); //@line 2477
  if (___async) {
   HEAP32[$AsyncCtx22 >> 2] = 73; //@line 2480
   sp = STACKTOP; //@line 2481
   return;
  } else {
   _emscripten_free_async_context($AsyncCtx22 | 0); //@line 2484
   return;
  }
 }
 $112 = $10 + 48 | 0; //@line 2489
 $114 = HEAP32[$112 >> 2] | 0; //@line 2491
 $117 = HEAP32[$112 + 4 >> 2] | 0; //@line 2494
 $118 = $109; //@line 2495
 $120 = HEAP32[$118 >> 2] | 0; //@line 2497
 $123 = HEAP32[$118 + 4 >> 2] | 0; //@line 2500
 if (!($123 >>> 0 > $117 >>> 0 | ($123 | 0) == ($117 | 0) & $120 >>> 0 > $114 >>> 0)) {
  $131 = HEAP32[(HEAP32[$0 >> 2] | 0) + 20 >> 2] | 0; //@line 2509
  $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2510
  FUNCTION_TABLE_v[$131 & 15](); //@line 2511
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 68; //@line 2514
   sp = STACKTOP; //@line 2515
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2518
  return;
 }
 $132 = _i64Subtract($120 | 0, $123 | 0, $114 | 0, $117 | 0) | 0; //@line 2521
 $133 = tempRet0; //@line 2522
 $135 = HEAP32[$10 + 16 >> 2] | 0; //@line 2524
 $137 = $10 + 24 | 0; //@line 2526
 $142 = HEAP32[$137 + 4 >> 2] | 0; //@line 2531
 do {
  if ($133 >>> 0 > $142 >>> 0 | (($133 | 0) == ($142 | 0) ? $132 >>> 0 > (HEAP32[$137 >> 2] | 0) >>> 0 : 0)) {
   $$0$i = $135; //@line 2539
  } else {
   $149 = HEAP32[$10 + 8 >> 2] | 0; //@line 2542
   if (($149 | 0) == 1e6) {
    $$0$i = $135 >>> 0 < $132 >>> 0 ? $135 : $132; //@line 2547
    break;
   }
   $153 = HEAP8[$10 + 57 >> 0] | 0; //@line 2551
   if (!($153 << 24 >> 24)) {
    $161 = ___muldi3($132 | 0, $133 | 0, $149 | 0, 0) | 0; //@line 2554
    $163 = ___udivdi3($161 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 2556
    $$0$i = $135 >>> 0 < $163 >>> 0 ? $135 : $163; //@line 2560
    break;
   } else {
    $156 = _bitshift64Shl($132 | 0, $133 | 0, $153 & 255 | 0) | 0; //@line 2564
    $158 = ___udivdi3($156 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 2566
    $$0$i = $135 >>> 0 < $158 >>> 0 ? $135 : $158; //@line 2570
    break;
   }
  }
 } while (0);
 $170 = (HEAP32[$11 >> 2] | 0) + $$0$i & HEAP32[$10 + 12 >> 2]; //@line 2579
 $171 = $2 + 32 | 0; //@line 2580
 $174 = HEAP32[$0 >> 2] | 0; //@line 2583
 if (($170 | 0) == (HEAP32[$171 >> 2] | 0)) {
  $176 = HEAP32[$174 + 20 >> 2] | 0; //@line 2586
  $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2587
  FUNCTION_TABLE_v[$176 & 15](); //@line 2588
  if (___async) {
   HEAP32[$AsyncCtx7 >> 2] = 69; //@line 2591
   sp = STACKTOP; //@line 2592
   return;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2595
  return;
 }
 $178 = HEAP32[$174 + 16 >> 2] | 0; //@line 2599
 $AsyncCtx11 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2600
 FUNCTION_TABLE_vi[$178 & 255]($170); //@line 2601
 if (___async) {
  HEAP32[$AsyncCtx11 >> 2] = 70; //@line 2604
  HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 2606
  HEAP32[$AsyncCtx11 + 8 >> 2] = $171; //@line 2608
  HEAP32[$AsyncCtx11 + 12 >> 2] = $170; //@line 2610
  sp = STACKTOP; //@line 2611
  return;
 }
 _emscripten_free_async_context($AsyncCtx11 | 0); //@line 2614
 $184 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 2617
 $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2618
 $185 = FUNCTION_TABLE_i[$184 & 3]() | 0; //@line 2619
 if (___async) {
  HEAP32[$AsyncCtx14 >> 2] = 71; //@line 2622
  HEAP32[$AsyncCtx14 + 4 >> 2] = $171; //@line 2624
  HEAP32[$AsyncCtx14 + 8 >> 2] = $170; //@line 2626
  HEAP32[$AsyncCtx14 + 12 >> 2] = $0; //@line 2628
  sp = STACKTOP; //@line 2629
  return;
 }
 _emscripten_free_async_context($AsyncCtx14 | 0); //@line 2632
 $189 = HEAP32[$171 >> 2] | 0; //@line 2633
 if ($170 >>> 0 > $189 >>> 0) {
  if (!($185 >>> 0 >= $170 >>> 0 | $185 >>> 0 < $189 >>> 0)) {
   return;
  }
 } else {
  if (!($185 >>> 0 >= $170 >>> 0 & $185 >>> 0 < $189 >>> 0)) {
   return;
  }
 }
 $197 = HEAP32[(HEAP32[$0 >> 2] | 0) + 20 >> 2] | 0; //@line 2652
 $AsyncCtx18 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2653
 FUNCTION_TABLE_v[$197 & 15](); //@line 2654
 if (___async) {
  HEAP32[$AsyncCtx18 >> 2] = 72; //@line 2657
  sp = STACKTOP; //@line 2658
  return;
 }
 _emscripten_free_async_context($AsyncCtx18 | 0); //@line 2661
 return;
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2751
 STACKTOP = STACKTOP + 32 | 0; //@line 2752
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 2752
 $0 = sp; //@line 2753
 _gpio_init_out($0, 50); //@line 2754
 while (1) {
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2757
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2758
  _wait_ms(150); //@line 2759
  if (___async) {
   label = 3; //@line 2762
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 2765
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2767
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2768
  _wait_ms(150); //@line 2769
  if (___async) {
   label = 5; //@line 2772
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 2775
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2777
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2778
  _wait_ms(150); //@line 2779
  if (___async) {
   label = 7; //@line 2782
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 2785
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2787
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2788
  _wait_ms(150); //@line 2789
  if (___async) {
   label = 9; //@line 2792
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 2795
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2797
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2798
  _wait_ms(150); //@line 2799
  if (___async) {
   label = 11; //@line 2802
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 2805
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2807
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2808
  _wait_ms(150); //@line 2809
  if (___async) {
   label = 13; //@line 2812
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 2815
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2817
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2818
  _wait_ms(150); //@line 2819
  if (___async) {
   label = 15; //@line 2822
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 2825
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2827
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2828
  _wait_ms(150); //@line 2829
  if (___async) {
   label = 17; //@line 2832
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 2835
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2837
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2838
  _wait_ms(400); //@line 2839
  if (___async) {
   label = 19; //@line 2842
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 2845
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2847
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2848
  _wait_ms(400); //@line 2849
  if (___async) {
   label = 21; //@line 2852
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 2855
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2857
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2858
  _wait_ms(400); //@line 2859
  if (___async) {
   label = 23; //@line 2862
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 2865
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2867
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2868
  _wait_ms(400); //@line 2869
  if (___async) {
   label = 25; //@line 2872
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 2875
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2877
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2878
  _wait_ms(400); //@line 2879
  if (___async) {
   label = 27; //@line 2882
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 2885
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2887
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2888
  _wait_ms(400); //@line 2889
  if (___async) {
   label = 29; //@line 2892
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2895
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2897
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2898
  _wait_ms(400); //@line 2899
  if (___async) {
   label = 31; //@line 2902
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2905
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2907
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2908
  _wait_ms(400); //@line 2909
  if (___async) {
   label = 33; //@line 2912
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2915
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 76; //@line 2919
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 2921
   sp = STACKTOP; //@line 2922
   STACKTOP = sp; //@line 2923
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 77; //@line 2927
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 2929
   sp = STACKTOP; //@line 2930
   STACKTOP = sp; //@line 2931
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 78; //@line 2935
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 2937
   sp = STACKTOP; //@line 2938
   STACKTOP = sp; //@line 2939
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 79; //@line 2943
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 2945
   sp = STACKTOP; //@line 2946
   STACKTOP = sp; //@line 2947
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 80; //@line 2951
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 2953
   sp = STACKTOP; //@line 2954
   STACKTOP = sp; //@line 2955
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 81; //@line 2959
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 2961
   sp = STACKTOP; //@line 2962
   STACKTOP = sp; //@line 2963
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 82; //@line 2967
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 2969
   sp = STACKTOP; //@line 2970
   STACKTOP = sp; //@line 2971
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 83; //@line 2975
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 2977
   sp = STACKTOP; //@line 2978
   STACKTOP = sp; //@line 2979
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 84; //@line 2983
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 2985
   sp = STACKTOP; //@line 2986
   STACKTOP = sp; //@line 2987
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 85; //@line 2991
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 2993
   sp = STACKTOP; //@line 2994
   STACKTOP = sp; //@line 2995
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 86; //@line 2999
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 3001
   sp = STACKTOP; //@line 3002
   STACKTOP = sp; //@line 3003
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 87; //@line 3007
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 3009
   sp = STACKTOP; //@line 3010
   STACKTOP = sp; //@line 3011
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 88; //@line 3015
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 3017
   sp = STACKTOP; //@line 3018
   STACKTOP = sp; //@line 3019
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 89; //@line 3023
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 3025
   sp = STACKTOP; //@line 3026
   STACKTOP = sp; //@line 3027
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 90; //@line 3031
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 3033
   sp = STACKTOP; //@line 3034
   STACKTOP = sp; //@line 3035
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 91; //@line 3039
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3041
   sp = STACKTOP; //@line 3042
   STACKTOP = sp; //@line 3043
   return;
  }
 }
}
function _schedule_interrupt__async_cb($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $100 = 0, $102 = 0, $107 = 0, $110 = 0, $112 = 0, $115 = 0, $116 = 0, $118 = 0, $12 = 0, $121 = 0, $129 = 0, $130 = 0, $131 = 0, $133 = 0, $135 = 0, $140 = 0, $147 = 0, $151 = 0, $154 = 0, $156 = 0, $159 = 0, $161 = 0, $168 = 0, $169 = 0, $17 = 0, $172 = 0, $174 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $187 = 0, $19 = 0, $190 = 0, $2 = 0, $22 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $31 = 0, $33 = 0, $34 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $51 = 0, $52 = 0, $53 = 0, $55 = 0, $59 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $72 = 0, $73 = 0, $74 = 0, $8 = 0, $83 = 0, $84 = 0, $85 = 0, $87 = 0, $9 = 0, $91 = 0, $92 = 0, $98 = 0, $99 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 4951
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4953
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4955
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4959
 $8 = HEAP32[HEAP32[$0 + 12 >> 2] >> 2] | 0; //@line 4960
 $9 = $8 + 32 | 0; //@line 4961
 if (($AsyncRetVal | 0) != (HEAP32[$9 >> 2] | 0)) {
  $12 = $2 + 32 | 0; //@line 4965
  $17 = $AsyncRetVal - (HEAP32[$12 >> 2] | 0) & HEAP32[$2 + 12 >> 2]; //@line 4970
  HEAP32[$12 >> 2] = $AsyncRetVal; //@line 4971
  $19 = HEAP32[$2 + 8 >> 2] | 0; //@line 4973
  do {
   if (($19 | 0) == 1e6) {
    $98 = $17; //@line 4977
    $99 = 0; //@line 4977
   } else {
    $22 = HEAP8[$2 + 57 >> 0] | 0; //@line 4980
    $24 = ___muldi3($17 | 0, 0, 1e6, 0) | 0; //@line 4982
    $25 = tempRet0; //@line 4983
    if (!($22 << 24 >> 24)) {
     $59 = ___udivdi3($24 | 0, $25 | 0, $19 | 0, 0) | 0; //@line 4985
     $60 = tempRet0; //@line 4986
     $61 = ___muldi3($59 | 0, $60 | 0, $19 | 0, 0) | 0; //@line 4987
     $63 = _i64Subtract($24 | 0, $25 | 0, $61 | 0, tempRet0 | 0) | 0; //@line 4989
     $65 = $2 + 40 | 0; //@line 4991
     $66 = $65; //@line 4992
     $72 = _i64Add($63 | 0, tempRet0 | 0, HEAP32[$66 >> 2] | 0, HEAP32[$66 + 4 >> 2] | 0) | 0; //@line 4998
     $73 = tempRet0; //@line 4999
     $74 = $65; //@line 5000
     HEAP32[$74 >> 2] = $72; //@line 5002
     HEAP32[$74 + 4 >> 2] = $73; //@line 5005
     if ($73 >>> 0 < 0 | ($73 | 0) == 0 & $72 >>> 0 < $19 >>> 0) {
      $98 = $59; //@line 5012
      $99 = $60; //@line 5012
      break;
     }
     $83 = _i64Add($59 | 0, $60 | 0, 1, 0) | 0; //@line 5015
     $84 = tempRet0; //@line 5016
     $85 = _i64Subtract($72 | 0, $73 | 0, $19 | 0, 0) | 0; //@line 5017
     $87 = $65; //@line 5019
     HEAP32[$87 >> 2] = $85; //@line 5021
     HEAP32[$87 + 4 >> 2] = tempRet0; //@line 5024
     $98 = $83; //@line 5025
     $99 = $84; //@line 5025
     break;
    } else {
     $26 = $22 & 255; //@line 5028
     $27 = _bitshift64Lshr($24 | 0, $25 | 0, $26 | 0) | 0; //@line 5029
     $28 = tempRet0; //@line 5030
     $29 = _bitshift64Shl($27 | 0, $28 | 0, $26 | 0) | 0; //@line 5031
     $31 = _i64Subtract($24 | 0, $25 | 0, $29 | 0, tempRet0 | 0) | 0; //@line 5033
     $33 = $2 + 40 | 0; //@line 5035
     $34 = $33; //@line 5036
     $40 = _i64Add(HEAP32[$34 >> 2] | 0, HEAP32[$34 + 4 >> 2] | 0, $31 | 0, tempRet0 | 0) | 0; //@line 5042
     $41 = tempRet0; //@line 5043
     $42 = $33; //@line 5044
     HEAP32[$42 >> 2] = $40; //@line 5046
     HEAP32[$42 + 4 >> 2] = $41; //@line 5049
     if ($41 >>> 0 < 0 | ($41 | 0) == 0 & $40 >>> 0 < $19 >>> 0) {
      $98 = $27; //@line 5056
      $99 = $28; //@line 5056
      break;
     }
     $51 = _i64Add($27 | 0, $28 | 0, 1, 0) | 0; //@line 5059
     $52 = tempRet0; //@line 5060
     $53 = _i64Subtract($40 | 0, $41 | 0, $19 | 0, 0) | 0; //@line 5061
     $55 = $33; //@line 5063
     HEAP32[$55 >> 2] = $53; //@line 5065
     HEAP32[$55 + 4 >> 2] = tempRet0; //@line 5068
     $98 = $51; //@line 5069
     $99 = $52; //@line 5069
     break;
    }
   }
  } while (0);
  $91 = $2 + 48 | 0; //@line 5074
  $92 = $91; //@line 5075
  $100 = _i64Add(HEAP32[$92 >> 2] | 0, HEAP32[$92 + 4 >> 2] | 0, $98 | 0, $99 | 0) | 0; //@line 5081
  $102 = $91; //@line 5083
  HEAP32[$102 >> 2] = $100; //@line 5085
  HEAP32[$102 + 4 >> 2] = tempRet0; //@line 5088
 }
 $107 = HEAP32[$8 + 4 >> 2] | 0; //@line 5091
 if (!$107) {
  $187 = (HEAP32[$2 + 16 >> 2] | 0) + (HEAP32[$2 + 32 >> 2] | 0) & HEAP32[$2 + 12 >> 2]; //@line 5101
  $190 = HEAP32[(HEAP32[$4 >> 2] | 0) + 16 >> 2] | 0; //@line 5104
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 5105
  FUNCTION_TABLE_vi[$190 & 255]($187); //@line 5106
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 73; //@line 5109
   sp = STACKTOP; //@line 5110
   return;
  }
  ___async_unwind = 0; //@line 5113
  HEAP32[$ReallocAsyncCtx7 >> 2] = 73; //@line 5114
  sp = STACKTOP; //@line 5115
  return;
 }
 $110 = $8 + 48 | 0; //@line 5119
 $112 = HEAP32[$110 >> 2] | 0; //@line 5121
 $115 = HEAP32[$110 + 4 >> 2] | 0; //@line 5124
 $116 = $107; //@line 5125
 $118 = HEAP32[$116 >> 2] | 0; //@line 5127
 $121 = HEAP32[$116 + 4 >> 2] | 0; //@line 5130
 if (!($121 >>> 0 > $115 >>> 0 | ($121 | 0) == ($115 | 0) & $118 >>> 0 > $112 >>> 0)) {
  $129 = HEAP32[(HEAP32[$4 >> 2] | 0) + 20 >> 2] | 0; //@line 5139
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 5140
  FUNCTION_TABLE_v[$129 & 15](); //@line 5141
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 68; //@line 5144
   sp = STACKTOP; //@line 5145
   return;
  }
  ___async_unwind = 0; //@line 5148
  HEAP32[$ReallocAsyncCtx2 >> 2] = 68; //@line 5149
  sp = STACKTOP; //@line 5150
  return;
 }
 $130 = _i64Subtract($118 | 0, $121 | 0, $112 | 0, $115 | 0) | 0; //@line 5153
 $131 = tempRet0; //@line 5154
 $133 = HEAP32[$8 + 16 >> 2] | 0; //@line 5156
 $135 = $8 + 24 | 0; //@line 5158
 $140 = HEAP32[$135 + 4 >> 2] | 0; //@line 5163
 do {
  if ($131 >>> 0 > $140 >>> 0 | (($131 | 0) == ($140 | 0) ? $130 >>> 0 > (HEAP32[$135 >> 2] | 0) >>> 0 : 0)) {
   $$0$i = $133; //@line 5171
  } else {
   $147 = HEAP32[$8 + 8 >> 2] | 0; //@line 5174
   if (($147 | 0) == 1e6) {
    $$0$i = $133 >>> 0 < $130 >>> 0 ? $133 : $130; //@line 5179
    break;
   }
   $151 = HEAP8[$8 + 57 >> 0] | 0; //@line 5183
   if (!($151 << 24 >> 24)) {
    $159 = ___muldi3($130 | 0, $131 | 0, $147 | 0, 0) | 0; //@line 5186
    $161 = ___udivdi3($159 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 5188
    $$0$i = $133 >>> 0 < $161 >>> 0 ? $133 : $161; //@line 5192
    break;
   } else {
    $154 = _bitshift64Shl($130 | 0, $131 | 0, $151 & 255 | 0) | 0; //@line 5196
    $156 = ___udivdi3($154 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 5198
    $$0$i = $133 >>> 0 < $156 >>> 0 ? $133 : $156; //@line 5202
    break;
   }
  }
 } while (0);
 $168 = (HEAP32[$9 >> 2] | 0) + $$0$i & HEAP32[$8 + 12 >> 2]; //@line 5211
 $169 = $2 + 32 | 0; //@line 5212
 $172 = HEAP32[$4 >> 2] | 0; //@line 5215
 if (($168 | 0) == (HEAP32[$169 >> 2] | 0)) {
  $174 = HEAP32[$172 + 20 >> 2] | 0; //@line 5218
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 5219
  FUNCTION_TABLE_v[$174 & 15](); //@line 5220
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 69; //@line 5223
   sp = STACKTOP; //@line 5224
   return;
  }
  ___async_unwind = 0; //@line 5227
  HEAP32[$ReallocAsyncCtx3 >> 2] = 69; //@line 5228
  sp = STACKTOP; //@line 5229
  return;
 } else {
  $176 = HEAP32[$172 + 16 >> 2] | 0; //@line 5233
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 5234
  FUNCTION_TABLE_vi[$176 & 255]($168); //@line 5235
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 70; //@line 5238
   $177 = $ReallocAsyncCtx4 + 4 | 0; //@line 5239
   HEAP32[$177 >> 2] = $4; //@line 5240
   $178 = $ReallocAsyncCtx4 + 8 | 0; //@line 5241
   HEAP32[$178 >> 2] = $169; //@line 5242
   $179 = $ReallocAsyncCtx4 + 12 | 0; //@line 5243
   HEAP32[$179 >> 2] = $168; //@line 5244
   sp = STACKTOP; //@line 5245
   return;
  }
  ___async_unwind = 0; //@line 5248
  HEAP32[$ReallocAsyncCtx4 >> 2] = 70; //@line 5249
  $177 = $ReallocAsyncCtx4 + 4 | 0; //@line 5250
  HEAP32[$177 >> 2] = $4; //@line 5251
  $178 = $ReallocAsyncCtx4 + 8 | 0; //@line 5252
  HEAP32[$178 >> 2] = $169; //@line 5253
  $179 = $ReallocAsyncCtx4 + 12 | 0; //@line 5254
  HEAP32[$179 >> 2] = $168; //@line 5255
  sp = STACKTOP; //@line 5256
  return;
 }
}
function _main() {
 var $0 = 0, $1 = 0, $13 = 0, $17 = 0, $2 = 0, $22 = 0, $25 = 0, $29 = 0, $33 = 0, $37 = 0, $40 = 0, $43 = 0, $47 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx22 = 0, $AsyncCtx25 = 0, $AsyncCtx28 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 3650
 STACKTOP = STACKTOP + 48 | 0; //@line 3651
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 3651
 $0 = sp + 32 | 0; //@line 3652
 $1 = sp + 16 | 0; //@line 3653
 $2 = sp; //@line 3654
 $AsyncCtx19 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3655
 _puts(2430) | 0; //@line 3656
 if (___async) {
  HEAP32[$AsyncCtx19 >> 2] = 112; //@line 3659
  HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 3661
  HEAP32[$AsyncCtx19 + 8 >> 2] = $1; //@line 3663
  HEAP32[$AsyncCtx19 + 12 >> 2] = $2; //@line 3665
  sp = STACKTOP; //@line 3666
  STACKTOP = sp; //@line 3667
  return 0; //@line 3667
 }
 _emscripten_free_async_context($AsyncCtx19 | 0); //@line 3669
 $AsyncCtx15 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3670
 _puts(2443) | 0; //@line 3671
 if (___async) {
  HEAP32[$AsyncCtx15 >> 2] = 113; //@line 3674
  HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 3676
  HEAP32[$AsyncCtx15 + 8 >> 2] = $1; //@line 3678
  HEAP32[$AsyncCtx15 + 12 >> 2] = $2; //@line 3680
  sp = STACKTOP; //@line 3681
  STACKTOP = sp; //@line 3682
  return 0; //@line 3682
 }
 _emscripten_free_async_context($AsyncCtx15 | 0); //@line 3684
 $AsyncCtx11 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3685
 _puts(2546) | 0; //@line 3686
 if (___async) {
  HEAP32[$AsyncCtx11 >> 2] = 114; //@line 3689
  HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 3691
  HEAP32[$AsyncCtx11 + 8 >> 2] = $1; //@line 3693
  HEAP32[$AsyncCtx11 + 12 >> 2] = $2; //@line 3695
  sp = STACKTOP; //@line 3696
  STACKTOP = sp; //@line 3697
  return 0; //@line 3697
 }
 _emscripten_free_async_context($AsyncCtx11 | 0); //@line 3699
 $13 = $0 + 4 | 0; //@line 3701
 HEAP32[$13 >> 2] = 0; //@line 3703
 HEAP32[$13 + 4 >> 2] = 0; //@line 3706
 HEAP32[$0 >> 2] = 7; //@line 3707
 $17 = $0 + 12 | 0; //@line 3708
 HEAP32[$17 >> 2] = 384; //@line 3709
 $AsyncCtx25 = _emscripten_alloc_async_context(20, sp) | 0; //@line 3710
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5648, $0, 1.0); //@line 3711
 if (___async) {
  HEAP32[$AsyncCtx25 >> 2] = 115; //@line 3714
  HEAP32[$AsyncCtx25 + 4 >> 2] = $1; //@line 3716
  HEAP32[$AsyncCtx25 + 8 >> 2] = $2; //@line 3718
  HEAP32[$AsyncCtx25 + 12 >> 2] = $17; //@line 3720
  HEAP32[$AsyncCtx25 + 16 >> 2] = $0; //@line 3722
  sp = STACKTOP; //@line 3723
  STACKTOP = sp; //@line 3724
  return 0; //@line 3724
 }
 _emscripten_free_async_context($AsyncCtx25 | 0); //@line 3726
 $22 = HEAP32[$17 >> 2] | 0; //@line 3727
 do {
  if ($22 | 0) {
   $25 = HEAP32[$22 + 8 >> 2] | 0; //@line 3732
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 3733
   FUNCTION_TABLE_vi[$25 & 255]($0); //@line 3734
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 116; //@line 3737
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 3739
    HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 3741
    sp = STACKTOP; //@line 3742
    STACKTOP = sp; //@line 3743
    return 0; //@line 3743
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 3745
    break;
   }
  }
 } while (0);
 $29 = $1 + 4 | 0; //@line 3751
 HEAP32[$29 >> 2] = 0; //@line 3753
 HEAP32[$29 + 4 >> 2] = 0; //@line 3756
 HEAP32[$1 >> 2] = 8; //@line 3757
 $33 = $1 + 12 | 0; //@line 3758
 HEAP32[$33 >> 2] = 384; //@line 3759
 $AsyncCtx22 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3760
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5712, $1, 2.5); //@line 3761
 if (___async) {
  HEAP32[$AsyncCtx22 >> 2] = 117; //@line 3764
  HEAP32[$AsyncCtx22 + 4 >> 2] = $33; //@line 3766
  HEAP32[$AsyncCtx22 + 8 >> 2] = $2; //@line 3768
  HEAP32[$AsyncCtx22 + 12 >> 2] = $1; //@line 3770
  sp = STACKTOP; //@line 3771
  STACKTOP = sp; //@line 3772
  return 0; //@line 3772
 }
 _emscripten_free_async_context($AsyncCtx22 | 0); //@line 3774
 $37 = HEAP32[$33 >> 2] | 0; //@line 3775
 do {
  if ($37 | 0) {
   $40 = HEAP32[$37 + 8 >> 2] | 0; //@line 3780
   $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3781
   FUNCTION_TABLE_vi[$40 & 255]($1); //@line 3782
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 118; //@line 3785
    HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 3787
    sp = STACKTOP; //@line 3788
    STACKTOP = sp; //@line 3789
    return 0; //@line 3789
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3791
    break;
   }
  }
 } while (0);
 $43 = $2 + 4 | 0; //@line 3797
 HEAP32[$43 >> 2] = 0; //@line 3799
 HEAP32[$43 + 4 >> 2] = 0; //@line 3802
 HEAP32[$2 >> 2] = 9; //@line 3803
 $47 = $2 + 12 | 0; //@line 3804
 HEAP32[$47 >> 2] = 384; //@line 3805
 $AsyncCtx28 = _emscripten_alloc_async_context(12, sp) | 0; //@line 3806
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5864, $2); //@line 3807
 if (___async) {
  HEAP32[$AsyncCtx28 >> 2] = 119; //@line 3810
  HEAP32[$AsyncCtx28 + 4 >> 2] = $47; //@line 3812
  HEAP32[$AsyncCtx28 + 8 >> 2] = $2; //@line 3814
  sp = STACKTOP; //@line 3815
  STACKTOP = sp; //@line 3816
  return 0; //@line 3816
 }
 _emscripten_free_async_context($AsyncCtx28 | 0); //@line 3818
 $50 = HEAP32[$47 >> 2] | 0; //@line 3819
 do {
  if ($50 | 0) {
   $53 = HEAP32[$50 + 8 >> 2] | 0; //@line 3824
   $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3825
   FUNCTION_TABLE_vi[$53 & 255]($2); //@line 3826
   if (___async) {
    HEAP32[$AsyncCtx7 >> 2] = 120; //@line 3829
    sp = STACKTOP; //@line 3830
    STACKTOP = sp; //@line 3831
    return 0; //@line 3831
   } else {
    _emscripten_free_async_context($AsyncCtx7 | 0); //@line 3833
    break;
   }
  }
 } while (0);
 $AsyncCtx31 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3838
 _wait_ms(-1); //@line 3839
 if (___async) {
  HEAP32[$AsyncCtx31 >> 2] = 121; //@line 3842
  sp = STACKTOP; //@line 3843
  STACKTOP = sp; //@line 3844
  return 0; //@line 3844
 } else {
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 3846
  STACKTOP = sp; //@line 3847
  return 0; //@line 3847
 }
 return 0; //@line 3849
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0.0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $16 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $48 = 0, $6 = 0.0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 5
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9
 $6 = +HEAPF32[$0 + 12 >> 2]; //@line 11
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13
 $9 = $4 + 12 | 0; //@line 15
 HEAP32[$9 >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 16
 $10 = $6 * 1.0e6; //@line 17
 $11 = ~~$10 >>> 0; //@line 18
 $12 = +Math_abs($10) >= 1.0 ? $10 > 0.0 ? ~~+Math_min(+Math_floor($10 / 4294967296.0), 4294967295.0) >>> 0 : ~~+Math_ceil(($10 - +(~~$10 >>> 0)) / 4294967296.0) >>> 0 : 0; //@line 19
 $13 = $8 + 40 | 0; //@line 20
 do {
  if (($13 | 0) != ($4 | 0)) {
   $15 = $8 + 52 | 0; //@line 24
   $16 = HEAP32[$15 >> 2] | 0; //@line 25
   if ($16 | 0) {
    $19 = HEAP32[$16 + 8 >> 2] | 0; //@line 29
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 30
    FUNCTION_TABLE_vi[$19 & 255]($13); //@line 31
    if (___async) {
     HEAP32[$ReallocAsyncCtx2 >> 2] = 123; //@line 34
     $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 35
     HEAP32[$20 >> 2] = $9; //@line 36
     $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 37
     HEAP32[$21 >> 2] = $15; //@line 38
     $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 39
     HEAP32[$22 >> 2] = $13; //@line 40
     $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 41
     HEAP32[$23 >> 2] = $4; //@line 42
     $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 43
     HEAP32[$24 >> 2] = $9; //@line 44
     $25 = $ReallocAsyncCtx2 + 24 | 0; //@line 45
     HEAP32[$25 >> 2] = $8; //@line 46
     $26 = $ReallocAsyncCtx2 + 32 | 0; //@line 47
     $27 = $26; //@line 48
     $28 = $27; //@line 49
     HEAP32[$28 >> 2] = $11; //@line 50
     $29 = $27 + 4 | 0; //@line 51
     $30 = $29; //@line 52
     HEAP32[$30 >> 2] = $12; //@line 53
     sp = STACKTOP; //@line 54
     return;
    }
    ___async_unwind = 0; //@line 57
    HEAP32[$ReallocAsyncCtx2 >> 2] = 123; //@line 58
    $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 59
    HEAP32[$20 >> 2] = $9; //@line 60
    $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 61
    HEAP32[$21 >> 2] = $15; //@line 62
    $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 63
    HEAP32[$22 >> 2] = $13; //@line 64
    $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 65
    HEAP32[$23 >> 2] = $4; //@line 66
    $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 67
    HEAP32[$24 >> 2] = $9; //@line 68
    $25 = $ReallocAsyncCtx2 + 24 | 0; //@line 69
    HEAP32[$25 >> 2] = $8; //@line 70
    $26 = $ReallocAsyncCtx2 + 32 | 0; //@line 71
    $27 = $26; //@line 72
    $28 = $27; //@line 73
    HEAP32[$28 >> 2] = $11; //@line 74
    $29 = $27 + 4 | 0; //@line 75
    $30 = $29; //@line 76
    HEAP32[$30 >> 2] = $12; //@line 77
    sp = STACKTOP; //@line 78
    return;
   }
   $31 = HEAP32[$9 >> 2] | 0; //@line 81
   if (!$31) {
    HEAP32[$15 >> 2] = 0; //@line 84
    break;
   }
   $34 = HEAP32[$31 + 4 >> 2] | 0; //@line 88
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 89
   FUNCTION_TABLE_vii[$34 & 3]($13, $4); //@line 90
   if (___async) {
    HEAP32[$ReallocAsyncCtx3 >> 2] = 124; //@line 93
    $35 = $ReallocAsyncCtx3 + 4 | 0; //@line 94
    HEAP32[$35 >> 2] = $9; //@line 95
    $36 = $ReallocAsyncCtx3 + 8 | 0; //@line 96
    HEAP32[$36 >> 2] = $15; //@line 97
    $37 = $ReallocAsyncCtx3 + 12 | 0; //@line 98
    HEAP32[$37 >> 2] = $8; //@line 99
    $38 = $ReallocAsyncCtx3 + 16 | 0; //@line 100
    $39 = $38; //@line 101
    $40 = $39; //@line 102
    HEAP32[$40 >> 2] = $11; //@line 103
    $41 = $39 + 4 | 0; //@line 104
    $42 = $41; //@line 105
    HEAP32[$42 >> 2] = $12; //@line 106
    $43 = $ReallocAsyncCtx3 + 24 | 0; //@line 107
    HEAP32[$43 >> 2] = $9; //@line 108
    $44 = $ReallocAsyncCtx3 + 28 | 0; //@line 109
    HEAP32[$44 >> 2] = $4; //@line 110
    sp = STACKTOP; //@line 111
    return;
   }
   ___async_unwind = 0; //@line 114
   HEAP32[$ReallocAsyncCtx3 >> 2] = 124; //@line 115
   $35 = $ReallocAsyncCtx3 + 4 | 0; //@line 116
   HEAP32[$35 >> 2] = $9; //@line 117
   $36 = $ReallocAsyncCtx3 + 8 | 0; //@line 118
   HEAP32[$36 >> 2] = $15; //@line 119
   $37 = $ReallocAsyncCtx3 + 12 | 0; //@line 120
   HEAP32[$37 >> 2] = $8; //@line 121
   $38 = $ReallocAsyncCtx3 + 16 | 0; //@line 122
   $39 = $38; //@line 123
   $40 = $39; //@line 124
   HEAP32[$40 >> 2] = $11; //@line 125
   $41 = $39 + 4 | 0; //@line 126
   $42 = $41; //@line 127
   HEAP32[$42 >> 2] = $12; //@line 128
   $43 = $ReallocAsyncCtx3 + 24 | 0; //@line 129
   HEAP32[$43 >> 2] = $9; //@line 130
   $44 = $ReallocAsyncCtx3 + 28 | 0; //@line 131
   HEAP32[$44 >> 2] = $4; //@line 132
   sp = STACKTOP; //@line 133
   return;
  }
 } while (0);
 __ZN4mbed6Ticker5setupEy($8, $11, $12); //@line 137
 $45 = HEAP32[$9 >> 2] | 0; //@line 138
 if (!$45) {
  return;
 }
 $48 = HEAP32[$45 + 8 >> 2] | 0; //@line 144
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 145
 FUNCTION_TABLE_vi[$48 & 255]($4); //@line 146
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 125; //@line 149
  sp = STACKTOP; //@line 150
  return;
 }
 ___async_unwind = 0; //@line 153
 HEAP32[$ReallocAsyncCtx4 >> 2] = 125; //@line 154
 sp = STACKTOP; //@line 155
 return;
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
      HEAP32[$AsyncCtx >> 2] = 27; //@line 347
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
      HEAP32[$AsyncCtx2 >> 2] = 28; //@line 383
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
     HEAP32[$AsyncCtx5 >> 2] = 29; //@line 421
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
      HEAP32[$AsyncCtx8 >> 2] = 30; //@line 446
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
      HEAP32[$AsyncCtx11 >> 2] = 31; //@line 472
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
function _mbed_vtracef__async_cb_18($0) {
 $0 = $0 | 0;
 var $$10 = 0, $$3147168 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $28 = 0, $32 = 0, $36 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $50 = 0, $53 = 0, $54 = 0, $56 = 0, $6 = 0, $67 = 0, $68 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1385
 $2 = HEAP8[$0 + 4 >> 0] & 1; //@line 1388
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1390
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1392
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1394
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1396
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1398
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1400
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1402
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1406
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1408
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1410
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 1414
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 1418
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 1422
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 1426
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 1428
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 1430
 HEAP32[$44 >> 2] = HEAP32[___async_retval >> 2]; //@line 1437
 $50 = _snprintf($8, $10, 1668, $44) | 0; //@line 1438
 $$10 = ($50 | 0) >= ($10 | 0) ? 0 : $50; //@line 1440
 $53 = $8 + $$10 | 0; //@line 1442
 $54 = $10 - $$10 | 0; //@line 1443
 if (($$10 | 0) > 0) {
  if (($54 | 0) > 0) {
   $$3147168 = $54; //@line 1447
   $$3169 = $53; //@line 1447
   label = 4; //@line 1448
  }
 } else {
  $$3147168 = $10; //@line 1451
  $$3169 = $8; //@line 1451
  label = 4; //@line 1452
 }
 if ((label | 0) == 4) {
  $56 = $12 + -2 | 0; //@line 1455
  switch ($56 >>> 1 | $56 << 31 | 0) {
  case 0:
   {
    HEAP32[$14 >> 2] = $16; //@line 1461
    $$5156 = _snprintf($$3169, $$3147168, 1671, $14) | 0; //@line 1463
    break;
   }
  case 1:
   {
    HEAP32[$24 >> 2] = $16; //@line 1467
    $$5156 = _snprintf($$3169, $$3147168, 1686, $24) | 0; //@line 1469
    break;
   }
  case 3:
   {
    HEAP32[$28 >> 2] = $16; //@line 1473
    $$5156 = _snprintf($$3169, $$3147168, 1701, $28) | 0; //@line 1475
    break;
   }
  case 7:
   {
    HEAP32[$32 >> 2] = $16; //@line 1479
    $$5156 = _snprintf($$3169, $$3147168, 1716, $32) | 0; //@line 1481
    break;
   }
  default:
   {
    $$5156 = _snprintf($$3169, $$3147168, 1731, $36) | 0; //@line 1486
   }
  }
  $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 1490
  $67 = $$3169 + $$5156$ | 0; //@line 1492
  $68 = $$3147168 - $$5156$ | 0; //@line 1493
  if (($$5156$ | 0) > 0 & ($68 | 0) > 0) {
   $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 1497
   $70 = _vsnprintf($67, $68, $40, $42) | 0; //@line 1498
   if (___async) {
    HEAP32[$ReallocAsyncCtx10 >> 2] = 53; //@line 1501
    $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 1502
    $$expand_i1_val = $2 & 1; //@line 1503
    HEAP8[$71 >> 0] = $$expand_i1_val; //@line 1504
    $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 1505
    HEAP32[$72 >> 2] = $4; //@line 1506
    $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 1507
    HEAP32[$73 >> 2] = $6; //@line 1508
    $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 1509
    HEAP32[$74 >> 2] = $68; //@line 1510
    $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 1511
    HEAP32[$75 >> 2] = $67; //@line 1512
    $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 1513
    HEAP32[$76 >> 2] = $20; //@line 1514
    $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 1515
    HEAP32[$77 >> 2] = $22; //@line 1516
    sp = STACKTOP; //@line 1517
    return;
   }
   HEAP32[___async_retval >> 2] = $70; //@line 1521
   ___async_unwind = 0; //@line 1522
   HEAP32[$ReallocAsyncCtx10 >> 2] = 53; //@line 1523
   $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 1524
   $$expand_i1_val = $2 & 1; //@line 1525
   HEAP8[$71 >> 0] = $$expand_i1_val; //@line 1526
   $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 1527
   HEAP32[$72 >> 2] = $4; //@line 1528
   $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 1529
   HEAP32[$73 >> 2] = $6; //@line 1530
   $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 1531
   HEAP32[$74 >> 2] = $68; //@line 1532
   $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 1533
   HEAP32[$75 >> 2] = $67; //@line 1534
   $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 1535
   HEAP32[$76 >> 2] = $20; //@line 1536
   $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 1537
   HEAP32[$77 >> 2] = $22; //@line 1538
   sp = STACKTOP; //@line 1539
   return;
  }
 }
 $79 = HEAP32[91] | 0; //@line 1543
 $80 = HEAP32[84] | 0; //@line 1544
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 1545
 FUNCTION_TABLE_vi[$79 & 255]($80); //@line 1546
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 1549
  sp = STACKTOP; //@line 1550
  return;
 }
 ___async_unwind = 0; //@line 1553
 HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 1554
 sp = STACKTOP; //@line 1555
 return;
}
function _initialize__async_cb_59($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $23 = 0, $25 = 0, $26 = 0, $27 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 4419
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4421
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4423
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4427
 $10 = HEAP32[(HEAP32[$0 + 12 >> 2] | 0) + 4 >> 2] | 0; //@line 4429
 if (($10 + -4 | 0) >>> 0 > 28) {
  $ReallocAsyncCtx6 = _emscripten_realloc_async_context(24) | 0; //@line 4433
  _mbed_assert_internal(1751, 1753, 55); //@line 4434
  if (___async) {
   HEAP32[$ReallocAsyncCtx6 >> 2] = 63; //@line 4437
   $12 = $ReallocAsyncCtx6 + 4 | 0; //@line 4438
   HEAP32[$12 >> 2] = 1e6; //@line 4439
   $13 = $ReallocAsyncCtx6 + 8 | 0; //@line 4440
   HEAP32[$13 >> 2] = $2; //@line 4441
   $14 = $ReallocAsyncCtx6 + 12 | 0; //@line 4442
   HEAP32[$14 >> 2] = $4; //@line 4443
   $15 = $ReallocAsyncCtx6 + 16 | 0; //@line 4444
   HEAP8[$15 >> 0] = 0; //@line 4445
   $16 = $ReallocAsyncCtx6 + 20 | 0; //@line 4446
   HEAP32[$16 >> 2] = $8; //@line 4447
   sp = STACKTOP; //@line 4448
   return;
  }
  ___async_unwind = 0; //@line 4451
  HEAP32[$ReallocAsyncCtx6 >> 2] = 63; //@line 4452
  $12 = $ReallocAsyncCtx6 + 4 | 0; //@line 4453
  HEAP32[$12 >> 2] = 1e6; //@line 4454
  $13 = $ReallocAsyncCtx6 + 8 | 0; //@line 4455
  HEAP32[$13 >> 2] = $2; //@line 4456
  $14 = $ReallocAsyncCtx6 + 12 | 0; //@line 4457
  HEAP32[$14 >> 2] = $4; //@line 4458
  $15 = $ReallocAsyncCtx6 + 16 | 0; //@line 4459
  HEAP8[$15 >> 0] = 0; //@line 4460
  $16 = $ReallocAsyncCtx6 + 20 | 0; //@line 4461
  HEAP32[$16 >> 2] = $8; //@line 4462
  sp = STACKTOP; //@line 4463
  return;
 } else {
  $18 = 7 << $10 + -4; //@line 4467
  $19 = ___muldi3($18 | 0, 0, 1e6, 0) | 0; //@line 4468
  $20 = tempRet0; //@line 4469
  $21 = _i64Add(1e6, 0, -1, -1) | 0; //@line 4470
  $23 = _i64Add($21 | 0, tempRet0 | 0, $19 | 0, $20 | 0) | 0; //@line 4472
  $25 = ___udivdi3($23 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 4474
  $26 = tempRet0; //@line 4475
  $27 = HEAP32[$2 >> 2] | 0; //@line 4476
  HEAP32[$27 >> 2] = 0; //@line 4477
  HEAP32[$27 + 4 >> 2] = 0; //@line 4479
  $31 = HEAP32[(HEAP32[$4 >> 2] | 0) + 4 >> 2] | 0; //@line 4482
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 4483
  $32 = FUNCTION_TABLE_i[$31 & 3]() | 0; //@line 4484
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 4487
   $33 = $ReallocAsyncCtx3 + 4 | 0; //@line 4488
   HEAP32[$33 >> 2] = $2; //@line 4489
   $34 = $ReallocAsyncCtx3 + 8 | 0; //@line 4490
   HEAP32[$34 >> 2] = 1e6; //@line 4491
   $35 = $ReallocAsyncCtx3 + 12 | 0; //@line 4492
   HEAP8[$35 >> 0] = 0; //@line 4493
   $36 = $ReallocAsyncCtx3 + 16 | 0; //@line 4494
   HEAP32[$36 >> 2] = $10; //@line 4495
   $37 = $ReallocAsyncCtx3 + 20 | 0; //@line 4496
   HEAP32[$37 >> 2] = $18; //@line 4497
   $38 = $ReallocAsyncCtx3 + 24 | 0; //@line 4498
   $39 = $38; //@line 4499
   $40 = $39; //@line 4500
   HEAP32[$40 >> 2] = $25; //@line 4501
   $41 = $39 + 4 | 0; //@line 4502
   $42 = $41; //@line 4503
   HEAP32[$42 >> 2] = $26; //@line 4504
   $43 = $ReallocAsyncCtx3 + 32 | 0; //@line 4505
   HEAP32[$43 >> 2] = $4; //@line 4506
   $44 = $ReallocAsyncCtx3 + 36 | 0; //@line 4507
   HEAP32[$44 >> 2] = $8; //@line 4508
   sp = STACKTOP; //@line 4509
   return;
  }
  HEAP32[___async_retval >> 2] = $32; //@line 4513
  ___async_unwind = 0; //@line 4514
  HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 4515
  $33 = $ReallocAsyncCtx3 + 4 | 0; //@line 4516
  HEAP32[$33 >> 2] = $2; //@line 4517
  $34 = $ReallocAsyncCtx3 + 8 | 0; //@line 4518
  HEAP32[$34 >> 2] = 1e6; //@line 4519
  $35 = $ReallocAsyncCtx3 + 12 | 0; //@line 4520
  HEAP8[$35 >> 0] = 0; //@line 4521
  $36 = $ReallocAsyncCtx3 + 16 | 0; //@line 4522
  HEAP32[$36 >> 2] = $10; //@line 4523
  $37 = $ReallocAsyncCtx3 + 20 | 0; //@line 4524
  HEAP32[$37 >> 2] = $18; //@line 4525
  $38 = $ReallocAsyncCtx3 + 24 | 0; //@line 4526
  $39 = $38; //@line 4527
  $40 = $39; //@line 4528
  HEAP32[$40 >> 2] = $25; //@line 4529
  $41 = $39 + 4 | 0; //@line 4530
  $42 = $41; //@line 4531
  HEAP32[$42 >> 2] = $26; //@line 4532
  $43 = $ReallocAsyncCtx3 + 32 | 0; //@line 4533
  HEAP32[$43 >> 2] = $4; //@line 4534
  $44 = $ReallocAsyncCtx3 + 36 | 0; //@line 4535
  HEAP32[$44 >> 2] = $8; //@line 4536
  sp = STACKTOP; //@line 4537
  return;
 }
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = +$2;
 var $13 = 0, $14 = 0, $15 = 0.0, $16 = 0, $17 = 0, $18 = 0, $20 = 0, $21 = 0, $24 = 0, $3 = 0, $32 = 0, $36 = 0, $39 = 0, $4 = 0, $44 = 0, $5 = 0, $50 = 0, $51 = 0, $54 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 3859
 STACKTOP = STACKTOP + 16 | 0; //@line 3860
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3860
 $3 = sp; //@line 3861
 $4 = $1 + 12 | 0; //@line 3862
 $5 = HEAP32[$4 >> 2] | 0; //@line 3863
 do {
  if (!$5) {
   $14 = 0; //@line 3867
  } else {
   $8 = HEAP32[$5 + 4 >> 2] | 0; //@line 3870
   $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 3871
   FUNCTION_TABLE_vii[$8 & 3]($3, $1); //@line 3872
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 122; //@line 3875
    HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 3877
    HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 3879
    HEAPF32[$AsyncCtx + 12 >> 2] = $2; //@line 3881
    HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 3883
    sp = STACKTOP; //@line 3884
    STACKTOP = sp; //@line 3885
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 3887
    $14 = HEAP32[$4 >> 2] | 0; //@line 3889
    break;
   }
  }
 } while (0);
 $13 = $3 + 12 | 0; //@line 3894
 HEAP32[$13 >> 2] = $14; //@line 3895
 $15 = $2 * 1.0e6; //@line 3896
 $16 = ~~$15 >>> 0; //@line 3897
 $17 = +Math_abs($15) >= 1.0 ? $15 > 0.0 ? ~~+Math_min(+Math_floor($15 / 4294967296.0), 4294967295.0) >>> 0 : ~~+Math_ceil(($15 - +(~~$15 >>> 0)) / 4294967296.0) >>> 0 : 0; //@line 3898
 $18 = $0 + 40 | 0; //@line 3899
 if (($18 | 0) != ($3 | 0)) {
  $20 = $0 + 52 | 0; //@line 3902
  $21 = HEAP32[$20 >> 2] | 0; //@line 3903
  do {
   if ($21 | 0) {
    $24 = HEAP32[$21 + 8 >> 2] | 0; //@line 3908
    $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3909
    FUNCTION_TABLE_vi[$24 & 255]($18); //@line 3910
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 123; //@line 3913
     HEAP32[$AsyncCtx3 + 4 >> 2] = $13; //@line 3915
     HEAP32[$AsyncCtx3 + 8 >> 2] = $20; //@line 3917
     HEAP32[$AsyncCtx3 + 12 >> 2] = $18; //@line 3919
     HEAP32[$AsyncCtx3 + 16 >> 2] = $3; //@line 3921
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 3923
     HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 3925
     $32 = $AsyncCtx3 + 32 | 0; //@line 3927
     HEAP32[$32 >> 2] = $16; //@line 3929
     HEAP32[$32 + 4 >> 2] = $17; //@line 3932
     sp = STACKTOP; //@line 3933
     STACKTOP = sp; //@line 3934
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3936
     break;
    }
   }
  } while (0);
  $36 = HEAP32[$13 >> 2] | 0; //@line 3941
  do {
   if (!$36) {
    $50 = 0; //@line 3945
   } else {
    $39 = HEAP32[$36 + 4 >> 2] | 0; //@line 3948
    $AsyncCtx6 = _emscripten_alloc_async_context(32, sp) | 0; //@line 3949
    FUNCTION_TABLE_vii[$39 & 3]($18, $3); //@line 3950
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 124; //@line 3953
     HEAP32[$AsyncCtx6 + 4 >> 2] = $13; //@line 3955
     HEAP32[$AsyncCtx6 + 8 >> 2] = $20; //@line 3957
     HEAP32[$AsyncCtx6 + 12 >> 2] = $0; //@line 3959
     $44 = $AsyncCtx6 + 16 | 0; //@line 3961
     HEAP32[$44 >> 2] = $16; //@line 3963
     HEAP32[$44 + 4 >> 2] = $17; //@line 3966
     HEAP32[$AsyncCtx6 + 24 >> 2] = $13; //@line 3968
     HEAP32[$AsyncCtx6 + 28 >> 2] = $3; //@line 3970
     sp = STACKTOP; //@line 3971
     STACKTOP = sp; //@line 3972
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 3974
     $50 = HEAP32[$13 >> 2] | 0; //@line 3976
     break;
    }
   }
  } while (0);
  HEAP32[$20 >> 2] = $50; //@line 3981
 }
 __ZN4mbed6Ticker5setupEy($0, $16, $17); //@line 3983
 $51 = HEAP32[$13 >> 2] | 0; //@line 3984
 if (!$51) {
  STACKTOP = sp; //@line 3987
  return;
 }
 $54 = HEAP32[$51 + 8 >> 2] | 0; //@line 3990
 $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3991
 FUNCTION_TABLE_vi[$54 & 255]($3); //@line 3992
 if (___async) {
  HEAP32[$AsyncCtx10 >> 2] = 125; //@line 3995
  sp = STACKTOP; //@line 3996
  STACKTOP = sp; //@line 3997
  return;
 }
 _emscripten_free_async_context($AsyncCtx10 | 0); //@line 3999
 STACKTOP = sp; //@line 4000
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_53($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3238
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3240
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3242
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 3245
 $8 = HEAP8[$0 + 13 >> 0] & 1; //@line 3248
 $10 = HEAP32[$0 + 16 >> 2] | 0; //@line 3250
 $12 = HEAP32[$0 + 20 >> 2] | 0; //@line 3252
 $14 = HEAP32[$0 + 24 >> 2] | 0; //@line 3254
 $16 = HEAP32[$0 + 28 >> 2] | 0; //@line 3256
 $18 = HEAP32[$0 + 32 >> 2] | 0; //@line 3258
 $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 3260
 $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 3262
 $24 = HEAP8[$0 + 44 >> 0] & 1; //@line 3265
 $26 = HEAP32[$0 + 48 >> 2] | 0; //@line 3267
 $28 = HEAP32[$0 + 52 >> 2] | 0; //@line 3269
 L2 : do {
  if (!(HEAP8[$4 >> 0] | 0)) {
   do {
    if (!(HEAP8[$18 >> 0] | 0)) {
     $$182$off0 = $6; //@line 3278
     $$186$off0 = $8; //@line 3278
    } else {
     if (!(HEAP8[$20 >> 0] | 0)) {
      if (!(HEAP32[$26 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $8; //@line 3287
       $$283$off0 = 1; //@line 3287
       label = 13; //@line 3288
       break L2;
      } else {
       $$182$off0 = 1; //@line 3291
       $$186$off0 = $8; //@line 3291
       break;
      }
     }
     if ((HEAP32[$2 >> 2] | 0) == 1) {
      label = 18; //@line 3298
      break L2;
     }
     if (!(HEAP32[$26 >> 2] & 2)) {
      label = 18; //@line 3305
      break L2;
     } else {
      $$182$off0 = 1; //@line 3308
      $$186$off0 = 1; //@line 3308
     }
    }
   } while (0);
   $30 = $28 + 8 | 0; //@line 3312
   if ($30 >>> 0 < $22 >>> 0) {
    HEAP8[$20 >> 0] = 0; //@line 3315
    HEAP8[$18 >> 0] = 0; //@line 3316
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 3317
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $14, $10, $10, 1, $24); //@line 3318
    if (!___async) {
     ___async_unwind = 0; //@line 3321
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 157; //@line 3323
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 3325
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 3327
    HEAP8[$ReallocAsyncCtx5 + 12 >> 0] = $$182$off0 & 1; //@line 3330
    HEAP8[$ReallocAsyncCtx5 + 13 >> 0] = $$186$off0 & 1; //@line 3333
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $10; //@line 3335
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $12; //@line 3337
    HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $14; //@line 3339
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $16; //@line 3341
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $18; //@line 3343
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $20; //@line 3345
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $22; //@line 3347
    HEAP8[$ReallocAsyncCtx5 + 44 >> 0] = $24 & 1; //@line 3350
    HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $26; //@line 3352
    HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $30; //@line 3354
    sp = STACKTOP; //@line 3355
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 3358
    $$283$off0 = $$182$off0; //@line 3358
    label = 13; //@line 3359
   }
  } else {
   $$085$off0$reg2mem$0 = $8; //@line 3362
   $$283$off0 = $6; //@line 3362
   label = 13; //@line 3363
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$12 >> 2] = $10; //@line 3369
    $59 = $14 + 40 | 0; //@line 3370
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 3373
    if ((HEAP32[$14 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$2 >> 2] | 0) == 2) {
      HEAP8[$4 >> 0] = 1; //@line 3381
      if ($$283$off0) {
       label = 18; //@line 3383
       break;
      } else {
       $67 = 4; //@line 3386
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 3393
   } else {
    $67 = 4; //@line 3395
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 3400
 }
 HEAP32[$16 >> 2] = $67; //@line 3402
 return;
}
function _initialize__async_cb_56($0) {
 $0 = $0 | 0;
 var $10 = 0, $101 = 0, $102 = 0, $103 = 0, $105 = 0, $12 = 0, $14 = 0, $16 = 0, $25 = 0, $26 = 0, $28 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $37 = 0, $39 = 0, $4 = 0, $45 = 0, $46 = 0, $47 = 0, $56 = 0, $57 = 0, $58 = 0, $6 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $70 = 0, $76 = 0, $77 = 0, $78 = 0, $87 = 0, $88 = 0, $89 = 0, $91 = 0, $95 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 4163
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4167
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4169
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4173
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4175
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4177
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4179
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4181
 if (($AsyncRetVal | 0) != (HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 32 >> 2] | 0)) {
  $25 = $AsyncRetVal - (HEAP32[$6 >> 2] | 0) & HEAP32[HEAP32[$0 + 16 >> 2] >> 2]; //@line 4190
  HEAP32[$6 >> 2] = $AsyncRetVal; //@line 4191
  $26 = HEAP32[$10 >> 2] | 0; //@line 4192
  do {
   if (($26 | 0) == 1e6) {
    $101 = $25; //@line 4196
    $102 = 0; //@line 4196
   } else {
    $28 = HEAP8[$14 >> 0] | 0; //@line 4198
    $30 = ___muldi3($25 | 0, 0, 1e6, 0) | 0; //@line 4200
    $31 = tempRet0; //@line 4201
    if (!($28 << 24 >> 24)) {
     $64 = ___udivdi3($30 | 0, $31 | 0, $26 | 0, 0) | 0; //@line 4203
     $65 = tempRet0; //@line 4204
     $66 = ___muldi3($64 | 0, $65 | 0, $26 | 0, 0) | 0; //@line 4205
     $68 = _i64Subtract($30 | 0, $31 | 0, $66 | 0, tempRet0 | 0) | 0; //@line 4207
     $70 = $16; //@line 4209
     $76 = _i64Add($68 | 0, tempRet0 | 0, HEAP32[$70 >> 2] | 0, HEAP32[$70 + 4 >> 2] | 0) | 0; //@line 4215
     $77 = tempRet0; //@line 4216
     $78 = $16; //@line 4217
     HEAP32[$78 >> 2] = $76; //@line 4219
     HEAP32[$78 + 4 >> 2] = $77; //@line 4222
     if ($77 >>> 0 < 0 | ($77 | 0) == 0 & $76 >>> 0 < $26 >>> 0) {
      $101 = $64; //@line 4229
      $102 = $65; //@line 4229
      break;
     }
     $87 = _i64Add($64 | 0, $65 | 0, 1, 0) | 0; //@line 4232
     $88 = tempRet0; //@line 4233
     $89 = _i64Subtract($76 | 0, $77 | 0, $26 | 0, 0) | 0; //@line 4234
     $91 = $16; //@line 4236
     HEAP32[$91 >> 2] = $89; //@line 4238
     HEAP32[$91 + 4 >> 2] = tempRet0; //@line 4241
     $101 = $87; //@line 4242
     $102 = $88; //@line 4242
     break;
    } else {
     $32 = $28 & 255; //@line 4245
     $33 = _bitshift64Lshr($30 | 0, $31 | 0, $32 | 0) | 0; //@line 4246
     $34 = tempRet0; //@line 4247
     $35 = _bitshift64Shl($33 | 0, $34 | 0, $32 | 0) | 0; //@line 4248
     $37 = _i64Subtract($30 | 0, $31 | 0, $35 | 0, tempRet0 | 0) | 0; //@line 4250
     $39 = $16; //@line 4252
     $45 = _i64Add(HEAP32[$39 >> 2] | 0, HEAP32[$39 + 4 >> 2] | 0, $37 | 0, tempRet0 | 0) | 0; //@line 4258
     $46 = tempRet0; //@line 4259
     $47 = $16; //@line 4260
     HEAP32[$47 >> 2] = $45; //@line 4262
     HEAP32[$47 + 4 >> 2] = $46; //@line 4265
     if ($46 >>> 0 < 0 | ($46 | 0) == 0 & $45 >>> 0 < $26 >>> 0) {
      $101 = $33; //@line 4272
      $102 = $34; //@line 4272
      break;
     }
     $56 = _i64Add($33 | 0, $34 | 0, 1, 0) | 0; //@line 4275
     $57 = tempRet0; //@line 4276
     $58 = _i64Subtract($45 | 0, $46 | 0, $26 | 0, 0) | 0; //@line 4277
     $60 = $16; //@line 4279
     HEAP32[$60 >> 2] = $58; //@line 4281
     HEAP32[$60 + 4 >> 2] = tempRet0; //@line 4284
     $101 = $56; //@line 4285
     $102 = $57; //@line 4285
     break;
    }
   }
  } while (0);
  $95 = $12; //@line 4290
  $103 = _i64Add(HEAP32[$95 >> 2] | 0, HEAP32[$95 + 4 >> 2] | 0, $101 | 0, $102 | 0) | 0; //@line 4296
  $105 = $12; //@line 4298
  HEAP32[$105 >> 2] = $103; //@line 4300
  HEAP32[$105 + 4 >> 2] = tempRet0; //@line 4303
 }
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(4) | 0; //@line 4305
 _schedule_interrupt($4); //@line 4306
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 66; //@line 4309
  sp = STACKTOP; //@line 4310
  return;
 }
 ___async_unwind = 0; //@line 4313
 HEAP32[$ReallocAsyncCtx5 >> 2] = 66; //@line 4314
 sp = STACKTOP; //@line 4315
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
 sp = STACKTOP; //@line 13127
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 13132
 } else {
  $9 = $1 + 52 | 0; //@line 13134
  $10 = HEAP8[$9 >> 0] | 0; //@line 13135
  $11 = $1 + 53 | 0; //@line 13136
  $12 = HEAP8[$11 >> 0] | 0; //@line 13137
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 13140
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 13141
  HEAP8[$9 >> 0] = 0; //@line 13142
  HEAP8[$11 >> 0] = 0; //@line 13143
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 13144
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 13145
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 155; //@line 13148
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 13150
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 13152
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 13154
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 13156
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 13158
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 13160
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 13162
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 13164
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 13166
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 13168
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 13171
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 13173
   sp = STACKTOP; //@line 13174
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13177
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 13182
    $32 = $0 + 8 | 0; //@line 13183
    $33 = $1 + 54 | 0; //@line 13184
    $$0 = $0 + 24 | 0; //@line 13185
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
     HEAP8[$9 >> 0] = 0; //@line 13218
     HEAP8[$11 >> 0] = 0; //@line 13219
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 13220
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 13221
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 13226
     $62 = $$0 + 8 | 0; //@line 13227
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 13230
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 156; //@line 13235
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 13237
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 13239
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 13241
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 13243
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 13245
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 13247
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 13249
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 13251
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 13253
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 13255
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 13257
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 13259
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 13261
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 13264
    sp = STACKTOP; //@line 13265
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 13269
  HEAP8[$11 >> 0] = $12; //@line 13270
 }
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_52($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3082
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3084
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3086
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3088
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3090
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 3093
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3095
 $15 = $12 + 24 | 0; //@line 3098
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$12 + 8 >> 2] | 0; //@line 3103
   if (!($18 & 2)) {
    $21 = $4 + 36 | 0; //@line 3107
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $4 + 54 | 0; //@line 3114
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 3125
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 3126
      if (!___async) {
       ___async_unwind = 0; //@line 3129
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 161; //@line 3131
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 3133
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $2; //@line 3135
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 3137
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 3139
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $4; //@line 3141
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $6; //@line 3143
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $8; //@line 3145
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $10 & 1; //@line 3148
      sp = STACKTOP; //@line 3149
      return;
     }
     $36 = $4 + 24 | 0; //@line 3152
     $37 = $4 + 54 | 0; //@line 3153
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 3168
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 3169
     if (!___async) {
      ___async_unwind = 0; //@line 3172
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 160; //@line 3174
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 3176
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $2; //@line 3178
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 3180
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 3182
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 3184
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $4; //@line 3186
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $6; //@line 3188
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $8; //@line 3190
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $10 & 1; //@line 3193
     sp = STACKTOP; //@line 3194
     return;
    }
   }
   $24 = $4 + 54 | 0; //@line 3198
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 3202
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $4, $6, $8, $10); //@line 3203
    if (!___async) {
     ___async_unwind = 0; //@line 3206
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 159; //@line 3208
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 3210
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $2; //@line 3212
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 3214
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $4; //@line 3216
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $6; //@line 3218
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $8; //@line 3220
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $10 & 1; //@line 3223
    sp = STACKTOP; //@line 3224
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9586
      $10 = HEAP32[$9 >> 2] | 0; //@line 9587
      HEAP32[$2 >> 2] = $9 + 4; //@line 9589
      HEAP32[$0 >> 2] = $10; //@line 9590
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9606
      $17 = HEAP32[$16 >> 2] | 0; //@line 9607
      HEAP32[$2 >> 2] = $16 + 4; //@line 9609
      $20 = $0; //@line 9612
      HEAP32[$20 >> 2] = $17; //@line 9614
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 9617
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9633
      $30 = HEAP32[$29 >> 2] | 0; //@line 9634
      HEAP32[$2 >> 2] = $29 + 4; //@line 9636
      $31 = $0; //@line 9637
      HEAP32[$31 >> 2] = $30; //@line 9639
      HEAP32[$31 + 4 >> 2] = 0; //@line 9642
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9658
      $41 = $40; //@line 9659
      $43 = HEAP32[$41 >> 2] | 0; //@line 9661
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 9664
      HEAP32[$2 >> 2] = $40 + 8; //@line 9666
      $47 = $0; //@line 9667
      HEAP32[$47 >> 2] = $43; //@line 9669
      HEAP32[$47 + 4 >> 2] = $46; //@line 9672
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9688
      $57 = HEAP32[$56 >> 2] | 0; //@line 9689
      HEAP32[$2 >> 2] = $56 + 4; //@line 9691
      $59 = ($57 & 65535) << 16 >> 16; //@line 9693
      $62 = $0; //@line 9696
      HEAP32[$62 >> 2] = $59; //@line 9698
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 9701
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9717
      $72 = HEAP32[$71 >> 2] | 0; //@line 9718
      HEAP32[$2 >> 2] = $71 + 4; //@line 9720
      $73 = $0; //@line 9722
      HEAP32[$73 >> 2] = $72 & 65535; //@line 9724
      HEAP32[$73 + 4 >> 2] = 0; //@line 9727
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9743
      $83 = HEAP32[$82 >> 2] | 0; //@line 9744
      HEAP32[$2 >> 2] = $82 + 4; //@line 9746
      $85 = ($83 & 255) << 24 >> 24; //@line 9748
      $88 = $0; //@line 9751
      HEAP32[$88 >> 2] = $85; //@line 9753
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 9756
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9772
      $98 = HEAP32[$97 >> 2] | 0; //@line 9773
      HEAP32[$2 >> 2] = $97 + 4; //@line 9775
      $99 = $0; //@line 9777
      HEAP32[$99 >> 2] = $98 & 255; //@line 9779
      HEAP32[$99 + 4 >> 2] = 0; //@line 9782
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9798
      $109 = +HEAPF64[$108 >> 3]; //@line 9799
      HEAP32[$2 >> 2] = $108 + 8; //@line 9801
      HEAPF64[$0 >> 3] = $109; //@line 9802
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9818
      $116 = +HEAPF64[$115 >> 3]; //@line 9819
      HEAP32[$2 >> 2] = $115 + 8; //@line 9821
      HEAPF64[$0 >> 3] = $116; //@line 9822
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
 sp = STACKTOP; //@line 8486
 STACKTOP = STACKTOP + 224 | 0; //@line 8487
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 8487
 $3 = sp + 120 | 0; //@line 8488
 $4 = sp + 80 | 0; //@line 8489
 $5 = sp; //@line 8490
 $6 = sp + 136 | 0; //@line 8491
 dest = $4; //@line 8492
 stop = dest + 40 | 0; //@line 8492
 do {
  HEAP32[dest >> 2] = 0; //@line 8492
  dest = dest + 4 | 0; //@line 8492
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 8494
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 8498
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 8505
  } else {
   $43 = 0; //@line 8507
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 8509
  $14 = $13 & 32; //@line 8510
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 8516
  }
  $19 = $0 + 48 | 0; //@line 8518
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 8523
    $24 = HEAP32[$23 >> 2] | 0; //@line 8524
    HEAP32[$23 >> 2] = $6; //@line 8525
    $25 = $0 + 28 | 0; //@line 8526
    HEAP32[$25 >> 2] = $6; //@line 8527
    $26 = $0 + 20 | 0; //@line 8528
    HEAP32[$26 >> 2] = $6; //@line 8529
    HEAP32[$19 >> 2] = 80; //@line 8530
    $28 = $0 + 16 | 0; //@line 8532
    HEAP32[$28 >> 2] = $6 + 80; //@line 8533
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 8534
    if (!$24) {
     $$1 = $29; //@line 8537
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 8540
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 8541
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 8542
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 135; //@line 8545
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 8547
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 8549
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 8551
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 8553
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 8555
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 8557
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 8559
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 8561
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 8563
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 8565
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 8567
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 8569
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 8571
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 8573
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 8575
      sp = STACKTOP; //@line 8576
      STACKTOP = sp; //@line 8577
      return 0; //@line 8577
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 8579
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 8582
      HEAP32[$23 >> 2] = $24; //@line 8583
      HEAP32[$19 >> 2] = 0; //@line 8584
      HEAP32[$28 >> 2] = 0; //@line 8585
      HEAP32[$25 >> 2] = 0; //@line 8586
      HEAP32[$26 >> 2] = 0; //@line 8587
      $$1 = $$; //@line 8588
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 8594
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 8597
  HEAP32[$0 >> 2] = $51 | $14; //@line 8602
  if ($43 | 0) {
   ___unlockfile($0); //@line 8605
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 8607
 }
 STACKTOP = sp; //@line 8609
 return $$0 | 0; //@line 8609
}
function _initialize__async_cb_55($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $19 = 0, $2 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $30 = 0, $31 = 0, $32 = 0, $34 = 0, $36 = 0, $39 = 0, $4 = 0, $43 = 0, $44 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4043
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4045
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4047
 $6 = HEAP8[$0 + 12 >> 0] | 0; //@line 4049
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4051
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4053
 $12 = $0 + 24 | 0; //@line 4055
 $14 = HEAP32[$12 >> 2] | 0; //@line 4057
 $17 = HEAP32[$12 + 4 >> 2] | 0; //@line 4060
 $19 = HEAP32[$0 + 32 >> 2] | 0; //@line 4062
 $21 = HEAP32[$0 + 36 >> 2] | 0; //@line 4064
 $23 = HEAP32[$2 >> 2] | 0; //@line 4067
 $24 = $23 + 32 | 0; //@line 4068
 HEAP32[$24 >> 2] = HEAP32[___async_retval >> 2]; //@line 4069
 $25 = $23 + 40 | 0; //@line 4070
 $26 = $25; //@line 4071
 HEAP32[$26 >> 2] = 0; //@line 4073
 HEAP32[$26 + 4 >> 2] = 0; //@line 4076
 $30 = $23 + 8 | 0; //@line 4077
 HEAP32[$30 >> 2] = $4; //@line 4078
 $31 = $23 + 57 | 0; //@line 4079
 HEAP8[$31 >> 0] = $6; //@line 4080
 $32 = _bitshift64Shl(1, 0, $8 | 0) | 0; //@line 4081
 $34 = _i64Add($32 | 0, tempRet0 | 0, -1, 0) | 0; //@line 4083
 $36 = $23 + 12 | 0; //@line 4085
 HEAP32[$36 >> 2] = $34; //@line 4086
 HEAP32[$23 + 16 >> 2] = $10; //@line 4088
 $39 = $23 + 24 | 0; //@line 4090
 HEAP32[$39 >> 2] = $14; //@line 4092
 HEAP32[$39 + 4 >> 2] = $17; //@line 4095
 $43 = $23 + 48 | 0; //@line 4096
 $44 = $43; //@line 4097
 HEAP32[$44 >> 2] = 0; //@line 4099
 HEAP32[$44 + 4 >> 2] = 0; //@line 4102
 HEAP8[$23 + 56 >> 0] = 1; //@line 4104
 $51 = HEAP32[(HEAP32[$19 >> 2] | 0) + 4 >> 2] | 0; //@line 4107
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(36) | 0; //@line 4108
 $52 = FUNCTION_TABLE_i[$51 & 3]() | 0; //@line 4109
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 65; //@line 4112
  $53 = $ReallocAsyncCtx4 + 4 | 0; //@line 4113
  HEAP32[$53 >> 2] = $2; //@line 4114
  $54 = $ReallocAsyncCtx4 + 8 | 0; //@line 4115
  HEAP32[$54 >> 2] = $21; //@line 4116
  $55 = $ReallocAsyncCtx4 + 12 | 0; //@line 4117
  HEAP32[$55 >> 2] = $24; //@line 4118
  $56 = $ReallocAsyncCtx4 + 16 | 0; //@line 4119
  HEAP32[$56 >> 2] = $36; //@line 4120
  $57 = $ReallocAsyncCtx4 + 20 | 0; //@line 4121
  HEAP32[$57 >> 2] = $30; //@line 4122
  $58 = $ReallocAsyncCtx4 + 24 | 0; //@line 4123
  HEAP32[$58 >> 2] = $43; //@line 4124
  $59 = $ReallocAsyncCtx4 + 28 | 0; //@line 4125
  HEAP32[$59 >> 2] = $31; //@line 4126
  $60 = $ReallocAsyncCtx4 + 32 | 0; //@line 4127
  HEAP32[$60 >> 2] = $25; //@line 4128
  sp = STACKTOP; //@line 4129
  return;
 }
 HEAP32[___async_retval >> 2] = $52; //@line 4133
 ___async_unwind = 0; //@line 4134
 HEAP32[$ReallocAsyncCtx4 >> 2] = 65; //@line 4135
 $53 = $ReallocAsyncCtx4 + 4 | 0; //@line 4136
 HEAP32[$53 >> 2] = $2; //@line 4137
 $54 = $ReallocAsyncCtx4 + 8 | 0; //@line 4138
 HEAP32[$54 >> 2] = $21; //@line 4139
 $55 = $ReallocAsyncCtx4 + 12 | 0; //@line 4140
 HEAP32[$55 >> 2] = $24; //@line 4141
 $56 = $ReallocAsyncCtx4 + 16 | 0; //@line 4142
 HEAP32[$56 >> 2] = $36; //@line 4143
 $57 = $ReallocAsyncCtx4 + 20 | 0; //@line 4144
 HEAP32[$57 >> 2] = $30; //@line 4145
 $58 = $ReallocAsyncCtx4 + 24 | 0; //@line 4146
 HEAP32[$58 >> 2] = $43; //@line 4147
 $59 = $ReallocAsyncCtx4 + 28 | 0; //@line 4148
 HEAP32[$59 >> 2] = $31; //@line 4149
 $60 = $ReallocAsyncCtx4 + 32 | 0; //@line 4150
 HEAP32[$60 >> 2] = $25; //@line 4151
 sp = STACKTOP; //@line 4152
 return;
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12662
 STACKTOP = STACKTOP + 64 | 0; //@line 12663
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 12663
 $4 = sp; //@line 12664
 $5 = HEAP32[$0 >> 2] | 0; //@line 12665
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 12668
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 12670
 HEAP32[$4 >> 2] = $2; //@line 12671
 HEAP32[$4 + 4 >> 2] = $0; //@line 12673
 HEAP32[$4 + 8 >> 2] = $1; //@line 12675
 HEAP32[$4 + 12 >> 2] = $3; //@line 12677
 $14 = $4 + 16 | 0; //@line 12678
 $15 = $4 + 20 | 0; //@line 12679
 $16 = $4 + 24 | 0; //@line 12680
 $17 = $4 + 28 | 0; //@line 12681
 $18 = $4 + 32 | 0; //@line 12682
 $19 = $4 + 40 | 0; //@line 12683
 dest = $14; //@line 12684
 stop = dest + 36 | 0; //@line 12684
 do {
  HEAP32[dest >> 2] = 0; //@line 12684
  dest = dest + 4 | 0; //@line 12684
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 12684
 HEAP8[$14 + 38 >> 0] = 0; //@line 12684
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 12689
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 12692
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 12693
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 12694
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 147; //@line 12697
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 12699
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 12701
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 12703
    sp = STACKTOP; //@line 12704
    STACKTOP = sp; //@line 12705
    return 0; //@line 12705
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12707
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 12711
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 12715
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 12718
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 12719
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 12720
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 148; //@line 12723
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 12725
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 12727
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 12729
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 12731
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 12733
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 12735
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 12737
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 12739
    sp = STACKTOP; //@line 12740
    STACKTOP = sp; //@line 12741
    return 0; //@line 12741
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12743
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 12757
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 12765
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 12781
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 12786
  }
 } while (0);
 STACKTOP = sp; //@line 12789
 return $$0 | 0; //@line 12789
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 8358
 $7 = ($2 | 0) != 0; //@line 8362
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 8366
   $$03555 = $0; //@line 8367
   $$03654 = $2; //@line 8367
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 8372
     $$036$lcssa64 = $$03654; //@line 8372
     label = 6; //@line 8373
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 8376
    $12 = $$03654 + -1 | 0; //@line 8377
    $16 = ($12 | 0) != 0; //@line 8381
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 8384
     $$03654 = $12; //@line 8384
    } else {
     $$035$lcssa = $11; //@line 8386
     $$036$lcssa = $12; //@line 8386
     $$lcssa = $16; //@line 8386
     label = 5; //@line 8387
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 8392
   $$036$lcssa = $2; //@line 8392
   $$lcssa = $7; //@line 8392
   label = 5; //@line 8393
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 8398
   $$036$lcssa64 = $$036$lcssa; //@line 8398
   label = 6; //@line 8399
  } else {
   $$2 = $$035$lcssa; //@line 8401
   $$3 = 0; //@line 8401
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 8407
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 8410
    $$3 = $$036$lcssa64; //@line 8410
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 8412
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 8416
      $$13745 = $$036$lcssa64; //@line 8416
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 8419
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 8428
       $30 = $$13745 + -4 | 0; //@line 8429
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 8432
        $$13745 = $30; //@line 8432
       } else {
        $$0$lcssa = $29; //@line 8434
        $$137$lcssa = $30; //@line 8434
        label = 11; //@line 8435
        break L11;
       }
      }
      $$140 = $$046; //@line 8439
      $$23839 = $$13745; //@line 8439
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 8441
      $$137$lcssa = $$036$lcssa64; //@line 8441
      label = 11; //@line 8442
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 8448
      $$3 = 0; //@line 8448
      break;
     } else {
      $$140 = $$0$lcssa; //@line 8451
      $$23839 = $$137$lcssa; //@line 8451
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 8458
      $$3 = $$23839; //@line 8458
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 8461
     $$23839 = $$23839 + -1 | 0; //@line 8462
     if (!$$23839) {
      $$2 = $35; //@line 8465
      $$3 = 0; //@line 8465
      break;
     } else {
      $$140 = $35; //@line 8468
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 8476
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 8129
 do {
  if (!$0) {
   do {
    if (!(HEAP32[179] | 0)) {
     $34 = 0; //@line 8137
    } else {
     $12 = HEAP32[179] | 0; //@line 8139
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 8140
     $13 = _fflush($12) | 0; //@line 8141
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 131; //@line 8144
      sp = STACKTOP; //@line 8145
      return 0; //@line 8146
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 8148
      $34 = $13; //@line 8149
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 8155
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 8159
    } else {
     $$02327 = $$02325; //@line 8161
     $$02426 = $34; //@line 8161
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 8168
      } else {
       $28 = 0; //@line 8170
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8178
       $25 = ___fflush_unlocked($$02327) | 0; //@line 8179
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 8184
       $$1 = $25 | $$02426; //@line 8186
      } else {
       $$1 = $$02426; //@line 8188
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 8192
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 8195
      if (!$$023) {
       $$024$lcssa = $$1; //@line 8198
       break L9;
      } else {
       $$02327 = $$023; //@line 8201
       $$02426 = $$1; //@line 8201
      }
     }
     HEAP32[$AsyncCtx >> 2] = 132; //@line 8204
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 8206
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 8208
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 8210
     sp = STACKTOP; //@line 8211
     return 0; //@line 8212
    }
   } while (0);
   ___ofl_unlock(); //@line 8215
   $$0 = $$024$lcssa; //@line 8216
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 8222
    $5 = ___fflush_unlocked($0) | 0; //@line 8223
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 129; //@line 8226
     sp = STACKTOP; //@line 8227
     return 0; //@line 8228
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 8230
     $$0 = $5; //@line 8231
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 8236
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 8237
   $7 = ___fflush_unlocked($0) | 0; //@line 8238
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 130; //@line 8241
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 8244
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 8246
    sp = STACKTOP; //@line 8247
    return 0; //@line 8248
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8250
   if ($phitmp) {
    $$0 = $7; //@line 8252
   } else {
    ___unlockfile($0); //@line 8254
    $$0 = $7; //@line 8255
   }
  }
 } while (0);
 return $$0 | 0; //@line 8259
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12844
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12850
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 12856
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 12859
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12860
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 12861
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 151; //@line 12864
     sp = STACKTOP; //@line 12865
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12868
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 12876
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 12881
     $19 = $1 + 44 | 0; //@line 12882
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 12888
     HEAP8[$22 >> 0] = 0; //@line 12889
     $23 = $1 + 53 | 0; //@line 12890
     HEAP8[$23 >> 0] = 0; //@line 12891
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 12893
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 12896
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 12897
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 12898
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 150; //@line 12901
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 12903
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 12905
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 12907
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 12909
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 12911
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 12913
      sp = STACKTOP; //@line 12914
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 12917
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 12921
      label = 13; //@line 12922
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 12927
       label = 13; //@line 12928
      } else {
       $$037$off039 = 3; //@line 12930
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 12934
      $39 = $1 + 40 | 0; //@line 12935
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 12938
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 12948
        $$037$off039 = $$037$off038; //@line 12949
       } else {
        $$037$off039 = $$037$off038; //@line 12951
       }
      } else {
       $$037$off039 = $$037$off038; //@line 12954
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 12957
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 12964
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_23($0) {
 $0 = $0 | 0;
 var $$13 = 0, $$expand_i1_val = 0, $12 = 0, $14 = 0, $18 = 0, $19 = 0, $2 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 1715
 $2 = HEAP8[$0 + 4 >> 0] & 1; //@line 1718
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1720
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1722
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1724
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1728
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1730
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1732
 $$13 = ($AsyncRetVal | 0) >= ($8 | 0) ? 0 : $AsyncRetVal; //@line 1734
 $18 = (HEAP32[$0 + 20 >> 2] | 0) + $$13 | 0; //@line 1736
 $19 = $8 - $$13 | 0; //@line 1737
 do {
  if (($$13 | 0) > 0) {
   $21 = HEAP32[90] | 0; //@line 1741
   if (!(($19 | 0) > 0 & ($21 | 0) != 0)) {
    if (($$13 | 0) < 1 | ($19 | 0) < 1 | $2 ^ 1) {
     break;
    }
    _snprintf($18, $19, 1746, $4) | 0; //@line 1753
    break;
   }
   $ReallocAsyncCtx6 = _emscripten_realloc_async_context(32) | 0; //@line 1756
   $23 = FUNCTION_TABLE_i[$21 & 3]() | 0; //@line 1757
   if (___async) {
    HEAP32[$ReallocAsyncCtx6 >> 2] = 54; //@line 1760
    $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 1761
    HEAP32[$24 >> 2] = $12; //@line 1762
    $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 1763
    HEAP32[$25 >> 2] = $18; //@line 1764
    $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 1765
    HEAP32[$26 >> 2] = $19; //@line 1766
    $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 1767
    HEAP32[$27 >> 2] = $14; //@line 1768
    $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 1769
    $$expand_i1_val = $2 & 1; //@line 1770
    HEAP8[$28 >> 0] = $$expand_i1_val; //@line 1771
    $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 1772
    HEAP32[$29 >> 2] = $4; //@line 1773
    $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 1774
    HEAP32[$30 >> 2] = $6; //@line 1775
    sp = STACKTOP; //@line 1776
    return;
   }
   HEAP32[___async_retval >> 2] = $23; //@line 1780
   ___async_unwind = 0; //@line 1781
   HEAP32[$ReallocAsyncCtx6 >> 2] = 54; //@line 1782
   $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 1783
   HEAP32[$24 >> 2] = $12; //@line 1784
   $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 1785
   HEAP32[$25 >> 2] = $18; //@line 1786
   $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 1787
   HEAP32[$26 >> 2] = $19; //@line 1788
   $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 1789
   HEAP32[$27 >> 2] = $14; //@line 1790
   $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 1791
   $$expand_i1_val = $2 & 1; //@line 1792
   HEAP8[$28 >> 0] = $$expand_i1_val; //@line 1793
   $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 1794
   HEAP32[$29 >> 2] = $4; //@line 1795
   $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 1796
   HEAP32[$30 >> 2] = $6; //@line 1797
   sp = STACKTOP; //@line 1798
   return;
  }
 } while (0);
 $34 = HEAP32[91] | 0; //@line 1802
 $35 = HEAP32[84] | 0; //@line 1803
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 1804
 FUNCTION_TABLE_vi[$34 & 255]($35); //@line 1805
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 1808
  sp = STACKTOP; //@line 1809
  return;
 }
 ___async_unwind = 0; //@line 1812
 HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 1813
 sp = STACKTOP; //@line 1814
 return;
}
function _mbed_vtracef__async_cb_24($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 1824
 $2 = HEAP8[$0 + 4 >> 0] & 1; //@line 1827
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1829
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1831
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1833
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1835
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1837
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1839
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1841
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1843
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1845
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1847
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1849
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 1851
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 1853
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 1855
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 1857
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 1859
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 1861
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 1863
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 1865
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 1867
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 1869
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 1871
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 1873
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 1875
 $55 = ($12 | 0 ? 4 : 0) + $12 + (HEAP32[___async_retval >> 2] | 0) | 0; //@line 1881
 $56 = HEAP32[89] | 0; //@line 1882
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(100) | 0; //@line 1883
 $57 = FUNCTION_TABLE_ii[$56 & 1]($55) | 0; //@line 1884
 if (!___async) {
  HEAP32[___async_retval >> 2] = $57; //@line 1888
  ___async_unwind = 0; //@line 1889
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 52; //@line 1891
 HEAP8[$ReallocAsyncCtx5 + 4 >> 0] = $2 & 1; //@line 1894
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 1896
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 1898
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $14; //@line 1900
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $16; //@line 1902
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $18; //@line 1904
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $20; //@line 1906
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $22; //@line 1908
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $24; //@line 1910
 HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $8; //@line 1912
 HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $10; //@line 1914
 HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $26; //@line 1916
 HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $28; //@line 1918
 HEAP32[$ReallocAsyncCtx5 + 56 >> 2] = $30; //@line 1920
 HEAP32[$ReallocAsyncCtx5 + 60 >> 2] = $32; //@line 1922
 HEAP32[$ReallocAsyncCtx5 + 64 >> 2] = $34; //@line 1924
 HEAP32[$ReallocAsyncCtx5 + 68 >> 2] = $36; //@line 1926
 HEAP32[$ReallocAsyncCtx5 + 72 >> 2] = $38; //@line 1928
 HEAP32[$ReallocAsyncCtx5 + 76 >> 2] = $40; //@line 1930
 HEAP32[$ReallocAsyncCtx5 + 80 >> 2] = $42; //@line 1932
 HEAP32[$ReallocAsyncCtx5 + 84 >> 2] = $44; //@line 1934
 HEAP32[$ReallocAsyncCtx5 + 88 >> 2] = $46; //@line 1936
 HEAP32[$ReallocAsyncCtx5 + 92 >> 2] = $48; //@line 1938
 HEAP32[$ReallocAsyncCtx5 + 96 >> 2] = $50; //@line 1940
 sp = STACKTOP; //@line 1941
 return;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $12 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $29 = 0, $3 = 0, $36 = 0, $39 = 0, $40 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx14 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 12156
 STACKTOP = STACKTOP + 48 | 0; //@line 12157
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 12157
 $vararg_buffer10 = sp + 32 | 0; //@line 12158
 $vararg_buffer7 = sp + 24 | 0; //@line 12159
 $vararg_buffer3 = sp + 16 | 0; //@line 12160
 $vararg_buffer = sp; //@line 12161
 $0 = sp + 36 | 0; //@line 12162
 $1 = ___cxa_get_globals_fast() | 0; //@line 12163
 if ($1 | 0) {
  $3 = HEAP32[$1 >> 2] | 0; //@line 12166
  if ($3 | 0) {
   $7 = $3 + 48 | 0; //@line 12171
   $9 = HEAP32[$7 >> 2] | 0; //@line 12173
   $12 = HEAP32[$7 + 4 >> 2] | 0; //@line 12176
   if (!(($9 & -256 | 0) == 1126902528 & ($12 | 0) == 1129074247)) {
    HEAP32[$vararg_buffer7 >> 2] = 5145; //@line 12182
    _abort_message(5095, $vararg_buffer7); //@line 12183
   }
   if (($9 | 0) == 1126902529 & ($12 | 0) == 1129074247) {
    $22 = HEAP32[$3 + 44 >> 2] | 0; //@line 12192
   } else {
    $22 = $3 + 80 | 0; //@line 12194
   }
   HEAP32[$0 >> 2] = $22; //@line 12196
   $23 = HEAP32[$3 >> 2] | 0; //@line 12197
   $25 = HEAP32[$23 + 4 >> 2] | 0; //@line 12199
   $28 = HEAP32[(HEAP32[38] | 0) + 16 >> 2] | 0; //@line 12202
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 12203
   $29 = FUNCTION_TABLE_iiii[$28 & 7](152, $23, $0) | 0; //@line 12204
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 141; //@line 12207
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 12209
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 12211
    HEAP32[$AsyncCtx + 12 >> 2] = $25; //@line 12213
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 12215
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 12217
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 12219
    sp = STACKTOP; //@line 12220
    STACKTOP = sp; //@line 12221
    return;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 12223
   if (!$29) {
    HEAP32[$vararg_buffer3 >> 2] = 5145; //@line 12225
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 12227
    _abort_message(5054, $vararg_buffer3); //@line 12228
   }
   $36 = HEAP32[$0 >> 2] | 0; //@line 12231
   $39 = HEAP32[(HEAP32[$36 >> 2] | 0) + 8 >> 2] | 0; //@line 12234
   $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 12235
   $40 = FUNCTION_TABLE_ii[$39 & 1]($36) | 0; //@line 12236
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 142; //@line 12239
    HEAP32[$AsyncCtx14 + 4 >> 2] = $vararg_buffer; //@line 12241
    HEAP32[$AsyncCtx14 + 8 >> 2] = $25; //@line 12243
    HEAP32[$AsyncCtx14 + 12 >> 2] = $vararg_buffer; //@line 12245
    sp = STACKTOP; //@line 12246
    STACKTOP = sp; //@line 12247
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 12249
    HEAP32[$vararg_buffer >> 2] = 5145; //@line 12250
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 12252
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 12254
    _abort_message(5009, $vararg_buffer); //@line 12255
   }
  }
 }
 _abort_message(5133, $vararg_buffer10); //@line 12260
}
function _initialize__async_cb_58($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $17 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4329
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4331
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4333
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4335
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 4337
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4339
 $12 = 7 << 32 + -4; //@line 4341
 $13 = ___muldi3($12 | 0, 0, 1e6, 0) | 0; //@line 4342
 $14 = tempRet0; //@line 4343
 $15 = _i64Add($2 | 0, 0, -1, -1) | 0; //@line 4344
 $17 = _i64Add($15 | 0, tempRet0 | 0, $13 | 0, $14 | 0) | 0; //@line 4346
 $19 = ___udivdi3($17 | 0, tempRet0 | 0, $2 | 0, 0) | 0; //@line 4348
 $20 = tempRet0; //@line 4349
 $21 = HEAP32[$4 >> 2] | 0; //@line 4350
 HEAP32[$21 >> 2] = 0; //@line 4351
 HEAP32[$21 + 4 >> 2] = 0; //@line 4353
 $25 = HEAP32[(HEAP32[$6 >> 2] | 0) + 4 >> 2] | 0; //@line 4356
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 4357
 $26 = FUNCTION_TABLE_i[$25 & 3]() | 0; //@line 4358
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 4361
  $27 = $ReallocAsyncCtx3 + 4 | 0; //@line 4362
  HEAP32[$27 >> 2] = $4; //@line 4363
  $28 = $ReallocAsyncCtx3 + 8 | 0; //@line 4364
  HEAP32[$28 >> 2] = $2; //@line 4365
  $29 = $ReallocAsyncCtx3 + 12 | 0; //@line 4366
  HEAP8[$29 >> 0] = $8; //@line 4367
  $30 = $ReallocAsyncCtx3 + 16 | 0; //@line 4368
  HEAP32[$30 >> 2] = 32; //@line 4369
  $31 = $ReallocAsyncCtx3 + 20 | 0; //@line 4370
  HEAP32[$31 >> 2] = $12; //@line 4371
  $32 = $ReallocAsyncCtx3 + 24 | 0; //@line 4372
  $33 = $32; //@line 4373
  $34 = $33; //@line 4374
  HEAP32[$34 >> 2] = $19; //@line 4375
  $35 = $33 + 4 | 0; //@line 4376
  $36 = $35; //@line 4377
  HEAP32[$36 >> 2] = $20; //@line 4378
  $37 = $ReallocAsyncCtx3 + 32 | 0; //@line 4379
  HEAP32[$37 >> 2] = $6; //@line 4380
  $38 = $ReallocAsyncCtx3 + 36 | 0; //@line 4381
  HEAP32[$38 >> 2] = $10; //@line 4382
  sp = STACKTOP; //@line 4383
  return;
 }
 HEAP32[___async_retval >> 2] = $26; //@line 4387
 ___async_unwind = 0; //@line 4388
 HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 4389
 $27 = $ReallocAsyncCtx3 + 4 | 0; //@line 4390
 HEAP32[$27 >> 2] = $4; //@line 4391
 $28 = $ReallocAsyncCtx3 + 8 | 0; //@line 4392
 HEAP32[$28 >> 2] = $2; //@line 4393
 $29 = $ReallocAsyncCtx3 + 12 | 0; //@line 4394
 HEAP8[$29 >> 0] = $8; //@line 4395
 $30 = $ReallocAsyncCtx3 + 16 | 0; //@line 4396
 HEAP32[$30 >> 2] = 32; //@line 4397
 $31 = $ReallocAsyncCtx3 + 20 | 0; //@line 4398
 HEAP32[$31 >> 2] = $12; //@line 4399
 $32 = $ReallocAsyncCtx3 + 24 | 0; //@line 4400
 $33 = $32; //@line 4401
 $34 = $33; //@line 4402
 HEAP32[$34 >> 2] = $19; //@line 4403
 $35 = $33 + 4 | 0; //@line 4404
 $36 = $35; //@line 4405
 HEAP32[$36 >> 2] = $20; //@line 4406
 $37 = $ReallocAsyncCtx3 + 32 | 0; //@line 4407
 HEAP32[$37 >> 2] = $6; //@line 4408
 $38 = $ReallocAsyncCtx3 + 36 | 0; //@line 4409
 HEAP32[$38 >> 2] = $10; //@line 4410
 sp = STACKTOP; //@line 4411
 return;
}
function _mbed_error_vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 6057
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6059
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6061
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6063
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[1445] | 0)) {
  _serial_init(5784, 2, 3); //@line 6071
 }
 $9 = HEAP8[$4 >> 0] | 0; //@line 6073
 if (0 == 13 | $9 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 6079
  _serial_putc(5784, $9 << 24 >> 24); //@line 6080
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 6083
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 6084
   HEAP32[$18 >> 2] = 0; //@line 6085
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 6086
   HEAP32[$19 >> 2] = $AsyncRetVal; //@line 6087
   $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 6088
   HEAP32[$20 >> 2] = $2; //@line 6089
   $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 6090
   HEAP8[$21 >> 0] = $9; //@line 6091
   $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 6092
   HEAP32[$22 >> 2] = $4; //@line 6093
   sp = STACKTOP; //@line 6094
   return;
  }
  ___async_unwind = 0; //@line 6097
  HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 6098
  $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 6099
  HEAP32[$18 >> 2] = 0; //@line 6100
  $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 6101
  HEAP32[$19 >> 2] = $AsyncRetVal; //@line 6102
  $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 6103
  HEAP32[$20 >> 2] = $2; //@line 6104
  $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 6105
  HEAP8[$21 >> 0] = $9; //@line 6106
  $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 6107
  HEAP32[$22 >> 2] = $4; //@line 6108
  sp = STACKTOP; //@line 6109
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 6112
  _serial_putc(5784, 13); //@line 6113
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 94; //@line 6116
   $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 6117
   HEAP8[$12 >> 0] = $9; //@line 6118
   $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 6119
   HEAP32[$13 >> 2] = 0; //@line 6120
   $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 6121
   HEAP32[$14 >> 2] = $AsyncRetVal; //@line 6122
   $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 6123
   HEAP32[$15 >> 2] = $2; //@line 6124
   $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 6125
   HEAP32[$16 >> 2] = $4; //@line 6126
   sp = STACKTOP; //@line 6127
   return;
  }
  ___async_unwind = 0; //@line 6130
  HEAP32[$ReallocAsyncCtx3 >> 2] = 94; //@line 6131
  $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 6132
  HEAP8[$12 >> 0] = $9; //@line 6133
  $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 6134
  HEAP32[$13 >> 2] = 0; //@line 6135
  $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 6136
  HEAP32[$14 >> 2] = $AsyncRetVal; //@line 6137
  $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 6138
  HEAP32[$15 >> 2] = $2; //@line 6139
  $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 6140
  HEAP32[$16 >> 2] = $4; //@line 6141
  sp = STACKTOP; //@line 6142
  return;
 }
}
function _mbed_error_vfprintf__async_cb_85($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 6150
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6154
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6156
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6160
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 6161
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP8[$10 + $12 >> 0] | 0; //@line 6167
 if ((HEAP8[$0 + 16 >> 0] | 0) == 13 | $13 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 6173
  _serial_putc(5784, $13 << 24 >> 24); //@line 6174
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 6177
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 6178
   HEAP32[$22 >> 2] = $12; //@line 6179
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 6180
   HEAP32[$23 >> 2] = $4; //@line 6181
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 6182
   HEAP32[$24 >> 2] = $6; //@line 6183
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 6184
   HEAP8[$25 >> 0] = $13; //@line 6185
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 6186
   HEAP32[$26 >> 2] = $10; //@line 6187
   sp = STACKTOP; //@line 6188
   return;
  }
  ___async_unwind = 0; //@line 6191
  HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 6192
  $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 6193
  HEAP32[$22 >> 2] = $12; //@line 6194
  $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 6195
  HEAP32[$23 >> 2] = $4; //@line 6196
  $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 6197
  HEAP32[$24 >> 2] = $6; //@line 6198
  $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 6199
  HEAP8[$25 >> 0] = $13; //@line 6200
  $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 6201
  HEAP32[$26 >> 2] = $10; //@line 6202
  sp = STACKTOP; //@line 6203
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 6206
  _serial_putc(5784, 13); //@line 6207
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 94; //@line 6210
   $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 6211
   HEAP8[$16 >> 0] = $13; //@line 6212
   $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 6213
   HEAP32[$17 >> 2] = $12; //@line 6214
   $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 6215
   HEAP32[$18 >> 2] = $4; //@line 6216
   $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 6217
   HEAP32[$19 >> 2] = $6; //@line 6218
   $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 6219
   HEAP32[$20 >> 2] = $10; //@line 6220
   sp = STACKTOP; //@line 6221
   return;
  }
  ___async_unwind = 0; //@line 6224
  HEAP32[$ReallocAsyncCtx3 >> 2] = 94; //@line 6225
  $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 6226
  HEAP8[$16 >> 0] = $13; //@line 6227
  $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 6228
  HEAP32[$17 >> 2] = $12; //@line 6229
  $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 6230
  HEAP32[$18 >> 2] = $4; //@line 6231
  $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 6232
  HEAP32[$19 >> 2] = $6; //@line 6233
  $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 6234
  HEAP32[$20 >> 2] = $10; //@line 6235
  sp = STACKTOP; //@line 6236
  return;
 }
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_2($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $37 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 163
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 165
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 167
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 169
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 171
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 173
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 175
 $14 = $0 + 32 | 0; //@line 177
 $16 = HEAP32[$14 >> 2] | 0; //@line 179
 $19 = HEAP32[$14 + 4 >> 2] | 0; //@line 182
 $20 = HEAP32[$2 >> 2] | 0; //@line 183
 if ($20 | 0) {
  $23 = HEAP32[$20 + 4 >> 2] | 0; //@line 187
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 188
  FUNCTION_TABLE_vii[$23 & 3]($6, $8); //@line 189
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 124; //@line 192
   $24 = $ReallocAsyncCtx3 + 4 | 0; //@line 193
   HEAP32[$24 >> 2] = $10; //@line 194
   $25 = $ReallocAsyncCtx3 + 8 | 0; //@line 195
   HEAP32[$25 >> 2] = $4; //@line 196
   $26 = $ReallocAsyncCtx3 + 12 | 0; //@line 197
   HEAP32[$26 >> 2] = $12; //@line 198
   $27 = $ReallocAsyncCtx3 + 16 | 0; //@line 199
   $28 = $27; //@line 200
   $29 = $28; //@line 201
   HEAP32[$29 >> 2] = $16; //@line 202
   $30 = $28 + 4 | 0; //@line 203
   $31 = $30; //@line 204
   HEAP32[$31 >> 2] = $19; //@line 205
   $32 = $ReallocAsyncCtx3 + 24 | 0; //@line 206
   HEAP32[$32 >> 2] = $2; //@line 207
   $33 = $ReallocAsyncCtx3 + 28 | 0; //@line 208
   HEAP32[$33 >> 2] = $8; //@line 209
   sp = STACKTOP; //@line 210
   return;
  }
  ___async_unwind = 0; //@line 213
  HEAP32[$ReallocAsyncCtx3 >> 2] = 124; //@line 214
  $24 = $ReallocAsyncCtx3 + 4 | 0; //@line 215
  HEAP32[$24 >> 2] = $10; //@line 216
  $25 = $ReallocAsyncCtx3 + 8 | 0; //@line 217
  HEAP32[$25 >> 2] = $4; //@line 218
  $26 = $ReallocAsyncCtx3 + 12 | 0; //@line 219
  HEAP32[$26 >> 2] = $12; //@line 220
  $27 = $ReallocAsyncCtx3 + 16 | 0; //@line 221
  $28 = $27; //@line 222
  $29 = $28; //@line 223
  HEAP32[$29 >> 2] = $16; //@line 224
  $30 = $28 + 4 | 0; //@line 225
  $31 = $30; //@line 226
  HEAP32[$31 >> 2] = $19; //@line 227
  $32 = $ReallocAsyncCtx3 + 24 | 0; //@line 228
  HEAP32[$32 >> 2] = $2; //@line 229
  $33 = $ReallocAsyncCtx3 + 28 | 0; //@line 230
  HEAP32[$33 >> 2] = $8; //@line 231
  sp = STACKTOP; //@line 232
  return;
 }
 HEAP32[$4 >> 2] = 0; //@line 235
 __ZN4mbed6Ticker5setupEy($12, $16, $19); //@line 236
 $34 = HEAP32[$2 >> 2] | 0; //@line 237
 if (!$34) {
  return;
 }
 $37 = HEAP32[$34 + 8 >> 2] | 0; //@line 243
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 244
 FUNCTION_TABLE_vi[$37 & 255]($8); //@line 245
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 125; //@line 248
  sp = STACKTOP; //@line 249
  return;
 }
 ___async_unwind = 0; //@line 252
 HEAP32[$ReallocAsyncCtx4 >> 2] = 125; //@line 253
 sp = STACKTOP; //@line 254
 return;
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7170
 STACKTOP = STACKTOP + 48 | 0; //@line 7171
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 7171
 $vararg_buffer3 = sp + 16 | 0; //@line 7172
 $vararg_buffer = sp; //@line 7173
 $3 = sp + 32 | 0; //@line 7174
 $4 = $0 + 28 | 0; //@line 7175
 $5 = HEAP32[$4 >> 2] | 0; //@line 7176
 HEAP32[$3 >> 2] = $5; //@line 7177
 $7 = $0 + 20 | 0; //@line 7179
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 7181
 HEAP32[$3 + 4 >> 2] = $9; //@line 7182
 HEAP32[$3 + 8 >> 2] = $1; //@line 7184
 HEAP32[$3 + 12 >> 2] = $2; //@line 7186
 $12 = $9 + $2 | 0; //@line 7187
 $13 = $0 + 60 | 0; //@line 7188
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 7191
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 7193
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 7195
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 7197
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 7201
  } else {
   $$04756 = 2; //@line 7203
   $$04855 = $12; //@line 7203
   $$04954 = $3; //@line 7203
   $27 = $17; //@line 7203
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 7209
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 7211
    $38 = $27 >>> 0 > $37 >>> 0; //@line 7212
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 7214
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 7216
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 7218
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 7221
    $44 = $$150 + 4 | 0; //@line 7222
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 7225
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 7228
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 7230
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 7232
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 7234
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 7237
     break L1;
    } else {
     $$04756 = $$1; //@line 7240
     $$04954 = $$150; //@line 7240
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 7244
   HEAP32[$4 >> 2] = 0; //@line 7245
   HEAP32[$7 >> 2] = 0; //@line 7246
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 7249
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 7252
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 7257
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 7263
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 7268
  $25 = $20; //@line 7269
  HEAP32[$4 >> 2] = $25; //@line 7270
  HEAP32[$7 >> 2] = $25; //@line 7271
  $$051 = $2; //@line 7272
 }
 STACKTOP = sp; //@line 7274
 return $$051 | 0; //@line 7274
}
function __ZN4mbed7Timeout7handlerEv($0) {
 $0 = $0 | 0;
 var $1 = 0, $12 = 0, $13 = 0, $14 = 0, $18 = 0, $19 = 0, $2 = 0, $22 = 0, $25 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx6 = 0, $AsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 581
 STACKTOP = STACKTOP + 16 | 0; //@line 582
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 582
 $1 = sp; //@line 583
 $2 = $0 + 52 | 0; //@line 584
 $3 = HEAP32[$2 >> 2] | 0; //@line 585
 do {
  if (!$3) {
   $13 = 0; //@line 589
  } else {
   $7 = HEAP32[$3 + 4 >> 2] | 0; //@line 593
   $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 594
   FUNCTION_TABLE_vii[$7 & 3]($1, $0 + 40 | 0); //@line 595
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 36; //@line 598
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 600
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 602
    HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 604
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 606
    sp = STACKTOP; //@line 607
    STACKTOP = sp; //@line 608
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 610
    $13 = HEAP32[$2 >> 2] | 0; //@line 612
    break;
   }
  }
 } while (0);
 $12 = $1 + 12 | 0; //@line 617
 HEAP32[$12 >> 2] = $13; //@line 618
 __ZN4mbed6Ticker6detachEv($0); //@line 619
 $14 = HEAP32[$12 >> 2] | 0; //@line 620
 do {
  if (!$14) {
   $AsyncCtx9 = _emscripten_alloc_async_context(12, sp) | 0; //@line 624
   _mbed_assert_internal(2173, 2178, 528); //@line 625
   if (___async) {
    HEAP32[$AsyncCtx9 >> 2] = 37; //@line 628
    HEAP32[$AsyncCtx9 + 4 >> 2] = $12; //@line 630
    HEAP32[$AsyncCtx9 + 8 >> 2] = $1; //@line 632
    sp = STACKTOP; //@line 633
    STACKTOP = sp; //@line 634
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx9 | 0); //@line 636
    $19 = HEAP32[$12 >> 2] | 0; //@line 638
    break;
   }
  } else {
   $19 = $14; //@line 642
  }
 } while (0);
 $18 = HEAP32[$19 >> 2] | 0; //@line 645
 $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 646
 FUNCTION_TABLE_vi[$18 & 255]($1); //@line 647
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 38; //@line 650
  HEAP32[$AsyncCtx2 + 4 >> 2] = $12; //@line 652
  HEAP32[$AsyncCtx2 + 8 >> 2] = $1; //@line 654
  sp = STACKTOP; //@line 655
  STACKTOP = sp; //@line 656
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 658
 $22 = HEAP32[$12 >> 2] | 0; //@line 659
 if (!$22) {
  STACKTOP = sp; //@line 662
  return;
 }
 $25 = HEAP32[$22 + 8 >> 2] | 0; //@line 665
 $AsyncCtx6 = _emscripten_alloc_async_context(8, sp) | 0; //@line 666
 FUNCTION_TABLE_vi[$25 & 255]($1); //@line 667
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 39; //@line 670
  HEAP32[$AsyncCtx6 + 4 >> 2] = $1; //@line 672
  sp = STACKTOP; //@line 673
  STACKTOP = sp; //@line 674
  return;
 }
 _emscripten_free_async_context($AsyncCtx6 | 0); //@line 676
 STACKTOP = sp; //@line 677
 return;
}
function _mbed_error_vfprintf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$01213 = 0, $$014 = 0, $2 = 0, $24 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0, $$01213$looptemp = 0;
 sp = STACKTOP; //@line 3075
 STACKTOP = STACKTOP + 128 | 0; //@line 3076
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 3076
 $2 = sp; //@line 3077
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 3078
 $3 = _vsnprintf($2, 128, $0, $1) | 0; //@line 3079
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 93; //@line 3082
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 3084
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 3086
  sp = STACKTOP; //@line 3087
  STACKTOP = sp; //@line 3088
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3090
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 3093
  return;
 }
 if (!(HEAP32[1445] | 0)) {
  _serial_init(5784, 2, 3); //@line 3098
  $$01213 = 0; //@line 3099
  $$014 = 0; //@line 3099
 } else {
  $$01213 = 0; //@line 3101
  $$014 = 0; //@line 3101
 }
 while (1) {
  $$01213$looptemp = $$01213;
  $$01213 = HEAP8[$2 + $$014 >> 0] | 0; //@line 3105
  if (!($$01213$looptemp << 24 >> 24 == 13 | $$01213 << 24 >> 24 != 10)) {
   $AsyncCtx7 = _emscripten_alloc_async_context(24, sp) | 0; //@line 3110
   _serial_putc(5784, 13); //@line 3111
   if (___async) {
    label = 8; //@line 3114
    break;
   }
   _emscripten_free_async_context($AsyncCtx7 | 0); //@line 3117
  }
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 3120
  _serial_putc(5784, $$01213 << 24 >> 24); //@line 3121
  if (___async) {
   label = 11; //@line 3124
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3127
  $24 = $$014 + 1 | 0; //@line 3128
  if (($24 | 0) == ($3 | 0)) {
   label = 13; //@line 3131
   break;
  } else {
   $$014 = $24; //@line 3134
  }
 }
 if ((label | 0) == 8) {
  HEAP32[$AsyncCtx7 >> 2] = 94; //@line 3138
  HEAP8[$AsyncCtx7 + 4 >> 0] = $$01213; //@line 3140
  HEAP32[$AsyncCtx7 + 8 >> 2] = $$014; //@line 3142
  HEAP32[$AsyncCtx7 + 12 >> 2] = $3; //@line 3144
  HEAP32[$AsyncCtx7 + 16 >> 2] = $2; //@line 3146
  HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 3148
  sp = STACKTOP; //@line 3149
  STACKTOP = sp; //@line 3150
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx3 >> 2] = 95; //@line 3153
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$014; //@line 3155
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 3157
  HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 3159
  HEAP8[$AsyncCtx3 + 16 >> 0] = $$01213; //@line 3161
  HEAP32[$AsyncCtx3 + 20 >> 2] = $2; //@line 3163
  sp = STACKTOP; //@line 3164
  STACKTOP = sp; //@line 3165
  return;
 } else if ((label | 0) == 13) {
  STACKTOP = sp; //@line 3168
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_61($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4731
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4735
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4737
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 4739
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4741
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 4743
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4745
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4747
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4749
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 4751
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 4754
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 4756
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 4760
   $27 = $6 + 24 | 0; //@line 4761
   $28 = $4 + 8 | 0; //@line 4762
   $29 = $6 + 54 | 0; //@line 4763
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
    HEAP8[$10 >> 0] = 0; //@line 4793
    HEAP8[$14 >> 0] = 0; //@line 4794
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 4795
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 4796
    if (!___async) {
     ___async_unwind = 0; //@line 4799
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 156; //@line 4801
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 4803
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 4805
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 4807
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 4809
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 4811
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 4813
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 4815
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 4817
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 4819
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 4821
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 4823
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 4825
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 4827
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 4830
    sp = STACKTOP; //@line 4831
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 4836
 HEAP8[$14 >> 0] = $12; //@line 4837
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4615
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4619
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4621
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 4623
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4625
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 4627
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4629
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4631
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4633
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 4635
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 4637
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 4639
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 4641
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 4644
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 4645
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
    HEAP8[$10 >> 0] = 0; //@line 4678
    HEAP8[$14 >> 0] = 0; //@line 4679
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 4680
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 4681
    if (!___async) {
     ___async_unwind = 0; //@line 4684
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 156; //@line 4686
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 4688
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 4690
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 4692
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 4694
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 4696
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 4698
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 4700
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 4702
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 4704
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 4706
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 4708
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 4710
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 4712
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 4715
    sp = STACKTOP; //@line 4716
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 4721
 HEAP8[$14 >> 0] = $12; //@line 4722
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 6728
 }
 ret = dest | 0; //@line 6731
 dest_end = dest + num | 0; //@line 6732
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 6736
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 6737
   dest = dest + 1 | 0; //@line 6738
   src = src + 1 | 0; //@line 6739
   num = num - 1 | 0; //@line 6740
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 6742
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 6743
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 6745
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 6746
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 6747
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 6748
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 6749
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 6750
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 6751
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 6752
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 6753
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 6754
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 6755
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 6756
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 6757
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 6758
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 6759
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 6760
   dest = dest + 64 | 0; //@line 6761
   src = src + 64 | 0; //@line 6762
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 6765
   dest = dest + 4 | 0; //@line 6766
   src = src + 4 | 0; //@line 6767
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 6771
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 6773
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 6774
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 6775
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 6776
   dest = dest + 4 | 0; //@line 6777
   src = src + 4 | 0; //@line 6778
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 6783
  dest = dest + 1 | 0; //@line 6784
  src = src + 1 | 0; //@line 6785
 }
 return ret | 0; //@line 6787
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12345
 STACKTOP = STACKTOP + 64 | 0; //@line 12346
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 12346
 $3 = sp; //@line 12347
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 12350
 } else {
  if (!$1) {
   $$2 = 0; //@line 12354
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 12356
   $6 = ___dynamic_cast($1, 176, 160, 0) | 0; //@line 12357
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 145; //@line 12360
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 12362
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 12364
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 12366
    sp = STACKTOP; //@line 12367
    STACKTOP = sp; //@line 12368
    return 0; //@line 12368
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12370
   if (!$6) {
    $$2 = 0; //@line 12373
   } else {
    dest = $3 + 4 | 0; //@line 12376
    stop = dest + 52 | 0; //@line 12376
    do {
     HEAP32[dest >> 2] = 0; //@line 12376
     dest = dest + 4 | 0; //@line 12376
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 12377
    HEAP32[$3 + 8 >> 2] = $0; //@line 12379
    HEAP32[$3 + 12 >> 2] = -1; //@line 12381
    HEAP32[$3 + 48 >> 2] = 1; //@line 12383
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 12386
    $18 = HEAP32[$2 >> 2] | 0; //@line 12387
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 12388
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 12389
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 146; //@line 12392
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 12394
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 12396
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 12398
     sp = STACKTOP; //@line 12399
     STACKTOP = sp; //@line 12400
     return 0; //@line 12400
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12402
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 12409
     $$0 = 1; //@line 12410
    } else {
     $$0 = 0; //@line 12412
    }
    $$2 = $$0; //@line 12414
   }
  }
 }
 STACKTOP = sp; //@line 12418
 return $$2 | 0; //@line 12418
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 11891
 STACKTOP = STACKTOP + 128 | 0; //@line 11892
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 11892
 $4 = sp + 124 | 0; //@line 11893
 $5 = sp; //@line 11894
 dest = $5; //@line 11895
 src = 964; //@line 11895
 stop = dest + 124 | 0; //@line 11895
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 11895
  dest = dest + 4 | 0; //@line 11895
  src = src + 4 | 0; //@line 11895
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 11901
   $$015 = 1; //@line 11901
   label = 4; //@line 11902
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 11905
   $$0 = -1; //@line 11906
  }
 } else {
  $$014 = $0; //@line 11909
  $$015 = $1; //@line 11909
  label = 4; //@line 11910
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 11914
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 11916
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 11918
  $14 = $5 + 20 | 0; //@line 11919
  HEAP32[$14 >> 2] = $$014; //@line 11920
  HEAP32[$5 + 44 >> 2] = $$014; //@line 11922
  $16 = $$014 + $$$015 | 0; //@line 11923
  $17 = $5 + 16 | 0; //@line 11924
  HEAP32[$17 >> 2] = $16; //@line 11925
  HEAP32[$5 + 28 >> 2] = $16; //@line 11927
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 11928
  $19 = _vfprintf($5, $2, $3) | 0; //@line 11929
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 137; //@line 11932
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 11934
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 11936
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 11938
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 11940
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 11942
   sp = STACKTOP; //@line 11943
   STACKTOP = sp; //@line 11944
   return 0; //@line 11944
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11946
  if (!$$$015) {
   $$0 = $19; //@line 11949
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 11951
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 11956
   $$0 = $19; //@line 11957
  }
 }
 STACKTOP = sp; //@line 11960
 return $$0 | 0; //@line 11960
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13677
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 13683
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 13687
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 13688
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 13689
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 13690
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 162; //@line 13693
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 13695
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 13697
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 13699
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 13701
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 13703
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 13705
    sp = STACKTOP; //@line 13706
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13709
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 13713
    $$0 = $0 + 24 | 0; //@line 13714
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 13716
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 13717
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 13722
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 13728
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 13731
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 163; //@line 13736
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 13738
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 13740
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 13742
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 13744
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 13746
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 13748
    sp = STACKTOP; //@line 13749
    return;
   }
  }
 } while (0);
 return;
}
function _main__async_cb_81($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $16 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 5904
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5906
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5908
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5912
 $9 = HEAP32[HEAP32[$0 + 12 >> 2] >> 2] | 0; //@line 5913
 if (!$9) {
  $16 = $2 + 4 | 0; //@line 5917
  HEAP32[$16 >> 2] = 0; //@line 5919
  HEAP32[$16 + 4 >> 2] = 0; //@line 5922
  HEAP32[$2 >> 2] = 8; //@line 5923
  $20 = $2 + 12 | 0; //@line 5924
  HEAP32[$20 >> 2] = 384; //@line 5925
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(16) | 0; //@line 5926
  __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5712, $2, 2.5); //@line 5927
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 117; //@line 5930
   $21 = $ReallocAsyncCtx7 + 4 | 0; //@line 5931
   HEAP32[$21 >> 2] = $20; //@line 5932
   $22 = $ReallocAsyncCtx7 + 8 | 0; //@line 5933
   HEAP32[$22 >> 2] = $4; //@line 5934
   $23 = $ReallocAsyncCtx7 + 12 | 0; //@line 5935
   HEAP32[$23 >> 2] = $2; //@line 5936
   sp = STACKTOP; //@line 5937
   return;
  }
  ___async_unwind = 0; //@line 5940
  HEAP32[$ReallocAsyncCtx7 >> 2] = 117; //@line 5941
  $21 = $ReallocAsyncCtx7 + 4 | 0; //@line 5942
  HEAP32[$21 >> 2] = $20; //@line 5943
  $22 = $ReallocAsyncCtx7 + 8 | 0; //@line 5944
  HEAP32[$22 >> 2] = $4; //@line 5945
  $23 = $ReallocAsyncCtx7 + 12 | 0; //@line 5946
  HEAP32[$23 >> 2] = $2; //@line 5947
  sp = STACKTOP; //@line 5948
  return;
 } else {
  $12 = HEAP32[$9 + 8 >> 2] | 0; //@line 5952
  $ReallocAsyncCtx = _emscripten_realloc_async_context(12) | 0; //@line 5953
  FUNCTION_TABLE_vi[$12 & 255]($8); //@line 5954
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 116; //@line 5957
   $13 = $ReallocAsyncCtx + 4 | 0; //@line 5958
   HEAP32[$13 >> 2] = $2; //@line 5959
   $14 = $ReallocAsyncCtx + 8 | 0; //@line 5960
   HEAP32[$14 >> 2] = $4; //@line 5961
   sp = STACKTOP; //@line 5962
   return;
  }
  ___async_unwind = 0; //@line 5965
  HEAP32[$ReallocAsyncCtx >> 2] = 116; //@line 5966
  $13 = $ReallocAsyncCtx + 4 | 0; //@line 5967
  HEAP32[$13 >> 2] = $2; //@line 5968
  $14 = $ReallocAsyncCtx + 8 | 0; //@line 5969
  HEAP32[$14 >> 2] = $4; //@line 5970
  sp = STACKTOP; //@line 5971
  return;
 }
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11987
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 11992
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 11997
  } else {
   $20 = $0 & 255; //@line 11999
   $21 = $0 & 255; //@line 12000
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 12006
   } else {
    $26 = $1 + 20 | 0; //@line 12008
    $27 = HEAP32[$26 >> 2] | 0; //@line 12009
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 12015
     HEAP8[$27 >> 0] = $20; //@line 12016
     $34 = $21; //@line 12017
    } else {
     label = 12; //@line 12019
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12024
     $32 = ___overflow($1, $0) | 0; //@line 12025
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 139; //@line 12028
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 12030
      sp = STACKTOP; //@line 12031
      return 0; //@line 12032
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 12034
      $34 = $32; //@line 12035
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 12040
   $$0 = $34; //@line 12041
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 12046
   $8 = $0 & 255; //@line 12047
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 12053
    $14 = HEAP32[$13 >> 2] | 0; //@line 12054
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 12060
     HEAP8[$14 >> 0] = $7; //@line 12061
     $$0 = $8; //@line 12062
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12066
   $19 = ___overflow($1, $0) | 0; //@line 12067
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 138; //@line 12070
    sp = STACKTOP; //@line 12071
    return 0; //@line 12072
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12074
    $$0 = $19; //@line 12075
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 12080
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 7880
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 7883
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 7886
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 7889
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 7895
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 7904
     $24 = $13 >>> 2; //@line 7905
     $$090 = 0; //@line 7906
     $$094 = $7; //@line 7906
     while (1) {
      $25 = $$094 >>> 1; //@line 7908
      $26 = $$090 + $25 | 0; //@line 7909
      $27 = $26 << 1; //@line 7910
      $28 = $27 + $23 | 0; //@line 7911
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 7914
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 7918
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 7924
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 7932
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 7936
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 7942
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 7947
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 7950
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 7950
      }
     }
     $46 = $27 + $24 | 0; //@line 7953
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 7956
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 7960
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 7972
     } else {
      $$4 = 0; //@line 7974
     }
    } else {
     $$4 = 0; //@line 7977
    }
   } else {
    $$4 = 0; //@line 7980
   }
  } else {
   $$4 = 0; //@line 7983
  }
 } while (0);
 return $$4 | 0; //@line 7986
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7545
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 7550
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 7555
  } else {
   $20 = $0 & 255; //@line 7557
   $21 = $0 & 255; //@line 7558
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 7564
   } else {
    $26 = $1 + 20 | 0; //@line 7566
    $27 = HEAP32[$26 >> 2] | 0; //@line 7567
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 7573
     HEAP8[$27 >> 0] = $20; //@line 7574
     $34 = $21; //@line 7575
    } else {
     label = 12; //@line 7577
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7582
     $32 = ___overflow($1, $0) | 0; //@line 7583
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 127; //@line 7586
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 7588
      sp = STACKTOP; //@line 7589
      return 0; //@line 7590
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 7592
      $34 = $32; //@line 7593
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 7598
   $$0 = $34; //@line 7599
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 7604
   $8 = $0 & 255; //@line 7605
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 7611
    $14 = HEAP32[$13 >> 2] | 0; //@line 7612
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 7618
     HEAP8[$14 >> 0] = $7; //@line 7619
     $$0 = $8; //@line 7620
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7624
   $19 = ___overflow($1, $0) | 0; //@line 7625
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 126; //@line 7628
    sp = STACKTOP; //@line 7629
    return 0; //@line 7630
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7632
    $$0 = $19; //@line 7633
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 7638
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8265
 $1 = $0 + 20 | 0; //@line 8266
 $3 = $0 + 28 | 0; //@line 8268
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 8274
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8275
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 8276
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 133; //@line 8279
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 8281
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 8283
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 8285
    sp = STACKTOP; //@line 8286
    return 0; //@line 8287
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 8289
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 8293
     break;
    } else {
     label = 5; //@line 8296
     break;
    }
   }
  } else {
   label = 5; //@line 8301
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 8305
  $14 = HEAP32[$13 >> 2] | 0; //@line 8306
  $15 = $0 + 8 | 0; //@line 8307
  $16 = HEAP32[$15 >> 2] | 0; //@line 8308
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 8316
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 8317
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 8318
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 134; //@line 8321
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 8323
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 8325
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 8327
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 8329
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 8331
     sp = STACKTOP; //@line 8332
     return 0; //@line 8333
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8335
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 8341
  HEAP32[$3 >> 2] = 0; //@line 8342
  HEAP32[$1 >> 2] = 0; //@line 8343
  HEAP32[$15 >> 2] = 0; //@line 8344
  HEAP32[$13 >> 2] = 0; //@line 8345
  $$0 = 0; //@line 8346
 }
 return $$0 | 0; //@line 8348
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
 _mbed_tracef(16, 1212, 1240, $vararg_buffer); //@line 92
 _emscripten_asm_const_i(0) | 0; //@line 93
 $10 = HEAP32[$0 + 752 >> 2] | 0; //@line 95
 if (($10 | 0) != ($6 | 0)) {
  HEAP32[$vararg_buffer4 >> 2] = $10; //@line 98
  HEAP32[$vararg_buffer4 + 4 >> 2] = $6; //@line 100
  _mbed_tracef(16, 1212, 1322, $vararg_buffer4); //@line 101
  STACKTOP = sp; //@line 102
  return;
 }
 $13 = HEAP32[$0 + 756 >> 2] | 0; //@line 105
 if (($13 | 0) != ($7 | 0)) {
  HEAP32[$vararg_buffer8 >> 2] = $13; //@line 108
  HEAP32[$vararg_buffer8 + 4 >> 2] = $7; //@line 110
  _mbed_tracef(16, 1212, 1369, $vararg_buffer8); //@line 111
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
  _mbed_tracef(16, 1212, 1416, $vararg_buffer12); //@line 137
  STACKTOP = sp; //@line 138
  return;
 }
}
function __ZN4mbed7Timeout7handlerEv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 5516
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5522
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5524
 $9 = (HEAP32[$0 + 8 >> 2] | 0) + 12 | 0; //@line 5526
 HEAP32[$9 >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 5527
 __ZN4mbed6Ticker6detachEv($6); //@line 5528
 $10 = HEAP32[$9 >> 2] | 0; //@line 5529
 if (!$10) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(12) | 0; //@line 5532
  _mbed_assert_internal(2173, 2178, 528); //@line 5533
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 37; //@line 5536
   $12 = $ReallocAsyncCtx4 + 4 | 0; //@line 5537
   HEAP32[$12 >> 2] = $9; //@line 5538
   $13 = $ReallocAsyncCtx4 + 8 | 0; //@line 5539
   HEAP32[$13 >> 2] = $8; //@line 5540
   sp = STACKTOP; //@line 5541
   return;
  }
  ___async_unwind = 0; //@line 5544
  HEAP32[$ReallocAsyncCtx4 >> 2] = 37; //@line 5545
  $12 = $ReallocAsyncCtx4 + 4 | 0; //@line 5546
  HEAP32[$12 >> 2] = $9; //@line 5547
  $13 = $ReallocAsyncCtx4 + 8 | 0; //@line 5548
  HEAP32[$13 >> 2] = $8; //@line 5549
  sp = STACKTOP; //@line 5550
  return;
 } else {
  $14 = HEAP32[$10 >> 2] | 0; //@line 5553
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 5554
  FUNCTION_TABLE_vi[$14 & 255]($8); //@line 5555
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 38; //@line 5558
   $15 = $ReallocAsyncCtx2 + 4 | 0; //@line 5559
   HEAP32[$15 >> 2] = $9; //@line 5560
   $16 = $ReallocAsyncCtx2 + 8 | 0; //@line 5561
   HEAP32[$16 >> 2] = $8; //@line 5562
   sp = STACKTOP; //@line 5563
   return;
  }
  ___async_unwind = 0; //@line 5566
  HEAP32[$ReallocAsyncCtx2 >> 2] = 38; //@line 5567
  $15 = $ReallocAsyncCtx2 + 4 | 0; //@line 5568
  HEAP32[$15 >> 2] = $9; //@line 5569
  $16 = $ReallocAsyncCtx2 + 8 | 0; //@line 5570
  HEAP32[$16 >> 2] = $8; //@line 5571
  sp = STACKTOP; //@line 5572
  return;
 }
}
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 8029
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 8035
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 8041
   } else {
    $7 = $1 & 255; //@line 8043
    $$03039 = $0; //@line 8044
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 8046
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 8051
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 8054
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 8059
      break;
     } else {
      $$03039 = $13; //@line 8062
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 8066
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 8067
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 8075
     $25 = $18; //@line 8075
     while (1) {
      $24 = $25 ^ $17; //@line 8077
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 8084
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 8087
      $25 = HEAP32[$31 >> 2] | 0; //@line 8088
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 8097
       break;
      } else {
       $$02936 = $31; //@line 8095
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 8102
    }
   } while (0);
   $38 = $1 & 255; //@line 8105
   $$1 = $$029$lcssa; //@line 8106
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 8108
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 8114
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 8117
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 8122
}
function _main__async_cb_80($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $13 = 0, $17 = 0, $18 = 0, $19 = 0, $4 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 5839
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5843
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5845
 $7 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 5846
 if (!$7) {
  $13 = $4 + 4 | 0; //@line 5850
  HEAP32[$13 >> 2] = 0; //@line 5852
  HEAP32[$13 + 4 >> 2] = 0; //@line 5855
  HEAP32[$4 >> 2] = 9; //@line 5856
  $17 = $4 + 12 | 0; //@line 5857
  HEAP32[$17 >> 2] = 384; //@line 5858
  $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 5859
  __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5864, $4); //@line 5860
  if (___async) {
   HEAP32[$ReallocAsyncCtx9 >> 2] = 119; //@line 5863
   $18 = $ReallocAsyncCtx9 + 4 | 0; //@line 5864
   HEAP32[$18 >> 2] = $17; //@line 5865
   $19 = $ReallocAsyncCtx9 + 8 | 0; //@line 5866
   HEAP32[$19 >> 2] = $4; //@line 5867
   sp = STACKTOP; //@line 5868
   return;
  }
  ___async_unwind = 0; //@line 5871
  HEAP32[$ReallocAsyncCtx9 >> 2] = 119; //@line 5872
  $18 = $ReallocAsyncCtx9 + 4 | 0; //@line 5873
  HEAP32[$18 >> 2] = $17; //@line 5874
  $19 = $ReallocAsyncCtx9 + 8 | 0; //@line 5875
  HEAP32[$19 >> 2] = $4; //@line 5876
  sp = STACKTOP; //@line 5877
  return;
 } else {
  $10 = HEAP32[$7 + 8 >> 2] | 0; //@line 5881
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 5882
  FUNCTION_TABLE_vi[$10 & 255]($6); //@line 5883
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 118; //@line 5886
   $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 5887
   HEAP32[$11 >> 2] = $4; //@line 5888
   sp = STACKTOP; //@line 5889
   return;
  }
  ___async_unwind = 0; //@line 5892
  HEAP32[$ReallocAsyncCtx2 >> 2] = 118; //@line 5893
  $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 5894
  HEAP32[$11 >> 2] = $4; //@line 5895
  sp = STACKTOP; //@line 5896
  return;
 }
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 7771
 $4 = HEAP32[$3 >> 2] | 0; //@line 7772
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 7779
   label = 5; //@line 7780
  } else {
   $$1 = 0; //@line 7782
  }
 } else {
  $12 = $4; //@line 7786
  label = 5; //@line 7787
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 7791
   $10 = HEAP32[$9 >> 2] | 0; //@line 7792
   $14 = $10; //@line 7795
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 7800
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 7808
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 7812
       $$141 = $0; //@line 7812
       $$143 = $1; //@line 7812
       $31 = $14; //@line 7812
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 7815
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 7822
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 7827
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 7830
      break L5;
     }
     $$139 = $$038; //@line 7836
     $$141 = $0 + $$038 | 0; //@line 7836
     $$143 = $1 - $$038 | 0; //@line 7836
     $31 = HEAP32[$9 >> 2] | 0; //@line 7836
    } else {
     $$139 = 0; //@line 7838
     $$141 = $0; //@line 7838
     $$143 = $1; //@line 7838
     $31 = $14; //@line 7838
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 7841
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 7844
   $$1 = $$139 + $$143 | 0; //@line 7846
  }
 } while (0);
 return $$1 | 0; //@line 7849
}
function __GLOBAL__sub_I_main_cpp() {
 var $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3551
 HEAP32[1448] = 0; //@line 3552
 HEAP32[1449] = 0; //@line 3552
 HEAP32[1450] = 0; //@line 3552
 HEAP32[1451] = 0; //@line 3552
 HEAP32[1452] = 0; //@line 3552
 HEAP32[1453] = 0; //@line 3552
 _gpio_init_out(5792, 50); //@line 3553
 HEAP32[1454] = 0; //@line 3554
 HEAP32[1455] = 0; //@line 3554
 HEAP32[1456] = 0; //@line 3554
 HEAP32[1457] = 0; //@line 3554
 HEAP32[1458] = 0; //@line 3554
 HEAP32[1459] = 0; //@line 3554
 _gpio_init_out(5816, 52); //@line 3555
 HEAP32[1460] = 0; //@line 3556
 HEAP32[1461] = 0; //@line 3556
 HEAP32[1462] = 0; //@line 3556
 HEAP32[1463] = 0; //@line 3556
 HEAP32[1464] = 0; //@line 3556
 HEAP32[1465] = 0; //@line 3556
 _gpio_init_out(5840, 53); //@line 3557
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3558
 __ZN4mbed10TimerEventC2Ev(5648); //@line 3559
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 107; //@line 3562
  sp = STACKTOP; //@line 3563
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3566
 HEAP32[1412] = 440; //@line 3567
 HEAP32[1422] = 0; //@line 3568
 HEAP32[1423] = 0; //@line 3568
 HEAP32[1424] = 0; //@line 3568
 HEAP32[1425] = 0; //@line 3568
 HEAP8[5704] = 1; //@line 3569
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3570
 __ZN4mbed10TimerEventC2Ev(5712); //@line 3571
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 108; //@line 3574
  sp = STACKTOP; //@line 3575
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3578
  HEAP32[1438] = 0; //@line 3579
  HEAP32[1439] = 0; //@line 3579
  HEAP32[1440] = 0; //@line 3579
  HEAP32[1441] = 0; //@line 3579
  HEAP8[5768] = 1; //@line 3580
  HEAP32[1428] = 288; //@line 3581
  __ZN4mbed11InterruptInC2E7PinName(5864, 1337); //@line 3582
  return;
 }
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_45($0) {
 $0 = $0 | 0;
 var $$phi$trans$insert = 0, $$pre10 = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 2587
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2591
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2593
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2595
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2597
 $$phi$trans$insert = (HEAP32[$0 + 4 >> 2] | 0) + 12 | 0; //@line 2598
 $$pre10 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 2599
 if (!$$pre10) {
  HEAP32[$4 >> 2] = 0; //@line 2602
  _gpio_irq_set($10 + 28 | 0, 2, 0); //@line 2604
  return;
 }
 $13 = HEAP32[$$pre10 + 4 >> 2] | 0; //@line 2608
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 2609
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 2610
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 30; //@line 2613
  $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 2614
  HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 2615
  $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 2616
  HEAP32[$15 >> 2] = $4; //@line 2617
  $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 2618
  HEAP32[$16 >> 2] = $8; //@line 2619
  $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 2620
  HEAP32[$17 >> 2] = $10; //@line 2621
  sp = STACKTOP; //@line 2622
  return;
 }
 ___async_unwind = 0; //@line 2625
 HEAP32[$ReallocAsyncCtx4 >> 2] = 30; //@line 2626
 $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 2627
 HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 2628
 $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 2629
 HEAP32[$15 >> 2] = $4; //@line 2630
 $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 2631
 HEAP32[$16 >> 2] = $8; //@line 2632
 $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 2633
 HEAP32[$17 >> 2] = $10; //@line 2634
 sp = STACKTOP; //@line 2635
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_50($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2953
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2957
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2959
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2961
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2963
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2965
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2967
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2969
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 2972
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 2973
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 2989
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 2990
    if (!___async) {
     ___async_unwind = 0; //@line 2993
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 160; //@line 2995
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 2997
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 2999
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 3001
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 3003
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 3005
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 3007
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 3009
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 3011
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 3014
    sp = STACKTOP; //@line 3015
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
 sp = STACKTOP; //@line 7657
 STACKTOP = STACKTOP + 16 | 0; //@line 7658
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7658
 $2 = sp; //@line 7659
 $3 = $1 & 255; //@line 7660
 HEAP8[$2 >> 0] = $3; //@line 7661
 $4 = $0 + 16 | 0; //@line 7662
 $5 = HEAP32[$4 >> 2] | 0; //@line 7663
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 7670
   label = 4; //@line 7671
  } else {
   $$0 = -1; //@line 7673
  }
 } else {
  $12 = $5; //@line 7676
  label = 4; //@line 7677
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 7681
   $10 = HEAP32[$9 >> 2] | 0; //@line 7682
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 7685
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 7692
     HEAP8[$10 >> 0] = $3; //@line 7693
     $$0 = $13; //@line 7694
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 7699
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7700
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 7701
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 128; //@line 7704
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 7706
    sp = STACKTOP; //@line 7707
    STACKTOP = sp; //@line 7708
    return 0; //@line 7708
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 7710
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 7715
   } else {
    $$0 = -1; //@line 7717
   }
  }
 } while (0);
 STACKTOP = sp; //@line 7721
 return $$0 | 0; //@line 7721
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 6792
 value = value & 255; //@line 6794
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 6797
   ptr = ptr + 1 | 0; //@line 6798
  }
  aligned_end = end & -4 | 0; //@line 6801
  block_aligned_end = aligned_end - 64 | 0; //@line 6802
  value4 = value | value << 8 | value << 16 | value << 24; //@line 6803
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 6806
   HEAP32[ptr + 4 >> 2] = value4; //@line 6807
   HEAP32[ptr + 8 >> 2] = value4; //@line 6808
   HEAP32[ptr + 12 >> 2] = value4; //@line 6809
   HEAP32[ptr + 16 >> 2] = value4; //@line 6810
   HEAP32[ptr + 20 >> 2] = value4; //@line 6811
   HEAP32[ptr + 24 >> 2] = value4; //@line 6812
   HEAP32[ptr + 28 >> 2] = value4; //@line 6813
   HEAP32[ptr + 32 >> 2] = value4; //@line 6814
   HEAP32[ptr + 36 >> 2] = value4; //@line 6815
   HEAP32[ptr + 40 >> 2] = value4; //@line 6816
   HEAP32[ptr + 44 >> 2] = value4; //@line 6817
   HEAP32[ptr + 48 >> 2] = value4; //@line 6818
   HEAP32[ptr + 52 >> 2] = value4; //@line 6819
   HEAP32[ptr + 56 >> 2] = value4; //@line 6820
   HEAP32[ptr + 60 >> 2] = value4; //@line 6821
   ptr = ptr + 64 | 0; //@line 6822
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 6826
   ptr = ptr + 4 | 0; //@line 6827
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 6832
  ptr = ptr + 1 | 0; //@line 6833
 }
 return end - num | 0; //@line 6835
}
function _fflush__async_cb_14($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 736
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 738
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 740
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 744
  } else {
   $$02327 = $$02325; //@line 746
   $$02426 = $AsyncRetVal; //@line 746
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 753
    } else {
     $16 = 0; //@line 755
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 767
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 770
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 773
     break L3;
    } else {
     $$02327 = $$023; //@line 776
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 779
   $13 = ___fflush_unlocked($$02327) | 0; //@line 780
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 784
    ___async_unwind = 0; //@line 785
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 132; //@line 787
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 789
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 791
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 793
   sp = STACKTOP; //@line 794
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 798
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 800
 return;
}
function _main__async_cb_77($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 5737
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5739
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5741
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5743
 $8 = $2 + 4 | 0; //@line 5745
 HEAP32[$8 >> 2] = 0; //@line 5747
 HEAP32[$8 + 4 >> 2] = 0; //@line 5750
 HEAP32[$2 >> 2] = 7; //@line 5751
 $12 = $2 + 12 | 0; //@line 5752
 HEAP32[$12 >> 2] = 384; //@line 5753
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(20) | 0; //@line 5754
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5648, $2, 1.0); //@line 5755
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 115; //@line 5758
  $13 = $ReallocAsyncCtx8 + 4 | 0; //@line 5759
  HEAP32[$13 >> 2] = $4; //@line 5760
  $14 = $ReallocAsyncCtx8 + 8 | 0; //@line 5761
  HEAP32[$14 >> 2] = $6; //@line 5762
  $15 = $ReallocAsyncCtx8 + 12 | 0; //@line 5763
  HEAP32[$15 >> 2] = $12; //@line 5764
  $16 = $ReallocAsyncCtx8 + 16 | 0; //@line 5765
  HEAP32[$16 >> 2] = $2; //@line 5766
  sp = STACKTOP; //@line 5767
  return;
 }
 ___async_unwind = 0; //@line 5770
 HEAP32[$ReallocAsyncCtx8 >> 2] = 115; //@line 5771
 $13 = $ReallocAsyncCtx8 + 4 | 0; //@line 5772
 HEAP32[$13 >> 2] = $4; //@line 5773
 $14 = $ReallocAsyncCtx8 + 8 | 0; //@line 5774
 HEAP32[$14 >> 2] = $6; //@line 5775
 $15 = $ReallocAsyncCtx8 + 12 | 0; //@line 5776
 HEAP32[$15 >> 2] = $12; //@line 5777
 $16 = $ReallocAsyncCtx8 + 16 | 0; //@line 5778
 HEAP32[$16 >> 2] = $2; //@line 5779
 sp = STACKTOP; //@line 5780
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2890
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2894
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2896
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2898
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2900
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2902
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2904
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 2907
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 2908
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 2917
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 2918
    if (!___async) {
     ___async_unwind = 0; //@line 2921
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 161; //@line 2923
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 2925
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 2927
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 2929
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 2931
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 2933
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 2935
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 2937
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 2940
    sp = STACKTOP; //@line 2941
    return;
   }
  }
 }
 return;
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 637
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 647
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 647
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 647
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 651
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 654
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 657
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 665
  } else {
   $20 = 0; //@line 667
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 677
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 681
  HEAP32[___async_retval >> 2] = $$1; //@line 683
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 686
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 687
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 691
  ___async_unwind = 0; //@line 692
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 132; //@line 694
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 696
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 698
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 700
 sp = STACKTOP; //@line 701
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2521
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2523
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2525
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2527
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2529
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2531
 $$pre = HEAP32[$2 >> 2] | 0; //@line 2532
 if (!$$pre) {
  HEAP32[$4 >> 2] = 0; //@line 2535
  _gpio_irq_set($10 + 28 | 0, 2, 1); //@line 2537
  return;
 }
 $13 = HEAP32[$$pre + 4 >> 2] | 0; //@line 2541
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 2542
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 2543
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 28; //@line 2546
  $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 2547
  HEAP32[$14 >> 2] = $2; //@line 2548
  $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 2549
  HEAP32[$15 >> 2] = $4; //@line 2550
  $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 2551
  HEAP32[$16 >> 2] = $10; //@line 2552
  sp = STACKTOP; //@line 2553
  return;
 }
 ___async_unwind = 0; //@line 2556
 HEAP32[$ReallocAsyncCtx2 >> 2] = 28; //@line 2557
 $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 2558
 HEAP32[$14 >> 2] = $2; //@line 2559
 $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 2560
 HEAP32[$15 >> 2] = $4; //@line 2561
 $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 2562
 HEAP32[$16 >> 2] = $10; //@line 2563
 sp = STACKTOP; //@line 2564
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 339
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 341
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 343
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 345
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 350
  } else {
   $9 = $4 + 4 | 0; //@line 352
   $10 = HEAP32[$9 >> 2] | 0; //@line 353
   $11 = $4 + 8 | 0; //@line 354
   $12 = HEAP32[$11 >> 2] | 0; //@line 355
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 359
    HEAP32[$6 >> 2] = 0; //@line 360
    HEAP32[$2 >> 2] = 0; //@line 361
    HEAP32[$11 >> 2] = 0; //@line 362
    HEAP32[$9 >> 2] = 0; //@line 363
    $$0 = 0; //@line 364
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 371
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 372
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 373
   if (!___async) {
    ___async_unwind = 0; //@line 376
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 134; //@line 378
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 380
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 382
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 384
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 386
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 388
   sp = STACKTOP; //@line 389
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 394
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 11037
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 11042
    $$0 = 1; //@line 11043
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 11056
     $$0 = 1; //@line 11057
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 11061
     $$0 = -1; //@line 11062
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 11072
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 11076
    $$0 = 2; //@line 11077
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 11089
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 11095
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 11099
    $$0 = 3; //@line 11100
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 11110
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 11116
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 11122
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 11126
    $$0 = 4; //@line 11127
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 11131
    $$0 = -1; //@line 11132
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 11137
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_51($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3026
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3030
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3032
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3034
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3036
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3038
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 3041
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 3042
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 3048
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 3049
   if (!___async) {
    ___async_unwind = 0; //@line 3052
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 159; //@line 3054
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 3056
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 3058
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 3060
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 3062
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 3064
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 3066
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 3069
   sp = STACKTOP; //@line 3070
   return;
  }
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_10($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 570
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 572
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 574
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 576
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 578
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 583
  return;
 }
 dest = $2 + 4 | 0; //@line 587
 stop = dest + 52 | 0; //@line 587
 do {
  HEAP32[dest >> 2] = 0; //@line 587
  dest = dest + 4 | 0; //@line 587
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 588
 HEAP32[$2 + 8 >> 2] = $4; //@line 590
 HEAP32[$2 + 12 >> 2] = -1; //@line 592
 HEAP32[$2 + 48 >> 2] = 1; //@line 594
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 597
 $16 = HEAP32[$6 >> 2] | 0; //@line 598
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 599
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 600
 if (!___async) {
  ___async_unwind = 0; //@line 603
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 146; //@line 605
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 607
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 609
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 611
 sp = STACKTOP; //@line 612
 return;
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 9921
  $8 = $0; //@line 9921
  $9 = $1; //@line 9921
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 9923
   $$0914 = $$0914 + -1 | 0; //@line 9927
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 9928
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 9929
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 9937
   }
  }
  $$010$lcssa$off0 = $8; //@line 9942
  $$09$lcssa = $$0914; //@line 9942
 } else {
  $$010$lcssa$off0 = $0; //@line 9944
  $$09$lcssa = $2; //@line 9944
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 9948
 } else {
  $$012 = $$010$lcssa$off0; //@line 9950
  $$111 = $$09$lcssa; //@line 9950
  while (1) {
   $26 = $$111 + -1 | 0; //@line 9955
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 9956
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 9960
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 9963
    $$111 = $26; //@line 9963
   }
  }
 }
 return $$1$lcssa | 0; //@line 9967
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 5643
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5645
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5647
 $6 = $2 + 4 | 0; //@line 5649
 HEAP32[$6 >> 2] = 0; //@line 5651
 HEAP32[$6 + 4 >> 2] = 0; //@line 5654
 HEAP32[$2 >> 2] = 8; //@line 5655
 $10 = $2 + 12 | 0; //@line 5656
 HEAP32[$10 >> 2] = 384; //@line 5657
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(16) | 0; //@line 5658
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5712, $2, 2.5); //@line 5659
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 117; //@line 5662
  $11 = $ReallocAsyncCtx7 + 4 | 0; //@line 5663
  HEAP32[$11 >> 2] = $10; //@line 5664
  $12 = $ReallocAsyncCtx7 + 8 | 0; //@line 5665
  HEAP32[$12 >> 2] = $4; //@line 5666
  $13 = $ReallocAsyncCtx7 + 12 | 0; //@line 5667
  HEAP32[$13 >> 2] = $2; //@line 5668
  sp = STACKTOP; //@line 5669
  return;
 }
 ___async_unwind = 0; //@line 5672
 HEAP32[$ReallocAsyncCtx7 >> 2] = 117; //@line 5673
 $11 = $ReallocAsyncCtx7 + 4 | 0; //@line 5674
 HEAP32[$11 >> 2] = $10; //@line 5675
 $12 = $ReallocAsyncCtx7 + 8 | 0; //@line 5676
 HEAP32[$12 >> 2] = $4; //@line 5677
 $13 = $ReallocAsyncCtx7 + 12 | 0; //@line 5678
 HEAP32[$13 >> 2] = $2; //@line 5679
 sp = STACKTOP; //@line 5680
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2698
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2700
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2704
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2706
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2708
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2710
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 2714
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 2717
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 2718
   if (!___async) {
    ___async_unwind = 0; //@line 2721
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 163; //@line 2723
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 2725
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 2727
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 2729
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 2731
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 2733
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 2735
   sp = STACKTOP; //@line 2736
   return;
  }
 }
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 7423
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 7428
   label = 4; //@line 7429
  } else {
   $$01519 = $0; //@line 7431
   $23 = $1; //@line 7431
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 7436
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 7439
    $23 = $6; //@line 7440
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 7444
     label = 4; //@line 7445
     break;
    } else {
     $$01519 = $6; //@line 7448
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 7454
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 7456
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 7464
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 7472
  } else {
   $$pn = $$0; //@line 7474
   while (1) {
    $19 = $$pn + 1 | 0; //@line 7476
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 7480
     break;
    } else {
     $$pn = $19; //@line 7483
    }
   }
  }
  $$sink = $$1$lcssa; //@line 7488
 }
 return $$sink - $1 | 0; //@line 7491
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 12592
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 12599
   $10 = $1 + 16 | 0; //@line 12600
   $11 = HEAP32[$10 >> 2] | 0; //@line 12601
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 12604
    HEAP32[$1 + 24 >> 2] = $4; //@line 12606
    HEAP32[$1 + 36 >> 2] = 1; //@line 12608
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 12618
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 12623
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 12626
    HEAP8[$1 + 54 >> 0] = 1; //@line 12628
    break;
   }
   $21 = $1 + 24 | 0; //@line 12631
   $22 = HEAP32[$21 >> 2] | 0; //@line 12632
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 12635
    $28 = $4; //@line 12636
   } else {
    $28 = $22; //@line 12638
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 12647
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
      HEAP32[$AsyncCtx >> 2] = 25; //@line 279
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
      HEAP32[$AsyncCtx2 >> 2] = 26; //@line 300
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
 sp = STACKTOP; //@line 12086
 $1 = HEAP32[147] | 0; //@line 12087
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 12093
 } else {
  $19 = 0; //@line 12095
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 12101
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 12107
    $12 = HEAP32[$11 >> 2] | 0; //@line 12108
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 12114
     HEAP8[$12 >> 0] = 10; //@line 12115
     $22 = 0; //@line 12116
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 12120
   $17 = ___overflow($1, 10) | 0; //@line 12121
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 140; //@line 12124
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 12126
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 12128
    sp = STACKTOP; //@line 12129
    return 0; //@line 12130
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12132
    $22 = $17 >> 31; //@line 12134
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 12141
 }
 return $22 | 0; //@line 12143
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_46($0) {
 $0 = $0 | 0;
 var $$pre$i$i4 = 0, $12 = 0, $13 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 2641
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2647
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2649
 $$pre$i$i4 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 2650
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = $$pre$i$i4; //@line 2651
 if (!$$pre$i$i4) {
  _gpio_irq_set($8 + 28 | 0, 2, 0); //@line 2655
  return;
 }
 $12 = HEAP32[$$pre$i$i4 + 8 >> 2] | 0; //@line 2660
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(12) | 0; //@line 2661
 FUNCTION_TABLE_vi[$12 & 255]($6); //@line 2662
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 2665
  $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 2666
  HEAP32[$13 >> 2] = $6; //@line 2667
  $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 2668
  HEAP32[$14 >> 2] = $8; //@line 2669
  sp = STACKTOP; //@line 2670
  return;
 }
 ___async_unwind = 0; //@line 2673
 HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 2674
 $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 2675
 HEAP32[$13 >> 2] = $6; //@line 2676
 $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 2677
 HEAP32[$14 >> 2] = $8; //@line 2678
 sp = STACKTOP; //@line 2679
 return;
}
function __ZN4mbed11InterruptInD0Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 195
 HEAP32[$0 >> 2] = 272; //@line 196
 _gpio_irq_free($0 + 28 | 0); //@line 198
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 200
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 206
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 207
   FUNCTION_TABLE_vi[$7 & 255]($0 + 56 | 0); //@line 208
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 23; //@line 211
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
  HEAP32[$AsyncCtx3 >> 2] = 24; //@line 236
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 238
  sp = STACKTOP; //@line 239
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 242
 __ZdlPv($0); //@line 243
 return;
}
function _mbed_vtracef__async_cb_19($0) {
 $0 = $0 | 0;
 var $$18 = 0, $10 = 0, $12 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 1562
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1564
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1566
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1568
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 1573
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1575
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 1580
 $16 = _snprintf($4, $6, 1668, $2) | 0; //@line 1581
 $$18 = ($16 | 0) >= ($6 | 0) ? 0 : $16; //@line 1583
 $19 = $4 + $$18 | 0; //@line 1585
 $20 = $6 - $$18 | 0; //@line 1586
 if (($$18 | 0) > 0) {
  if (!(($$18 | 0) < 1 | ($20 | 0) < 1 | $10 ^ 1)) {
   _snprintf($19, $20, 1746, $12) | 0; //@line 1594
  }
 }
 $23 = HEAP32[91] | 0; //@line 1597
 $24 = HEAP32[84] | 0; //@line 1598
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 1599
 FUNCTION_TABLE_vi[$23 & 255]($24); //@line 1600
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 1603
  sp = STACKTOP; //@line 1604
  return;
 }
 ___async_unwind = 0; //@line 1607
 HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 1608
 sp = STACKTOP; //@line 1609
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_48($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2746
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2752
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2754
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2756
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2758
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 2763
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 2765
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 2766
 if (!___async) {
  ___async_unwind = 0; //@line 2769
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 163; //@line 2771
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 2773
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 2775
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 2777
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 2779
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 2781
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 2783
 sp = STACKTOP; //@line 2784
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12451
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 12460
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 12465
      HEAP32[$13 >> 2] = $2; //@line 12466
      $19 = $1 + 40 | 0; //@line 12467
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 12470
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 12480
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 12484
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 12491
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
 $$016 = 0; //@line 11157
 while (1) {
  if ((HEAPU8[3117 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 11164
   break;
  }
  $7 = $$016 + 1 | 0; //@line 11167
  if (($7 | 0) == 87) {
   $$01214 = 3205; //@line 11170
   $$115 = 87; //@line 11170
   label = 5; //@line 11171
   break;
  } else {
   $$016 = $7; //@line 11174
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 3205; //@line 11180
  } else {
   $$01214 = 3205; //@line 11182
   $$115 = $$016; //@line 11182
   label = 5; //@line 11183
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 11188
   $$113 = $$01214; //@line 11189
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 11193
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 11200
   if (!$$115) {
    $$012$lcssa = $$113; //@line 11203
    break;
   } else {
    $$01214 = $$113; //@line 11206
    label = 5; //@line 11207
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 11214
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6294
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6296
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6298
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6300
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 6302
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 6304
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 5145; //@line 6309
  HEAP32[$4 + 4 >> 2] = $6; //@line 6311
  _abort_message(5054, $4); //@line 6312
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 6315
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 6318
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 6319
 $16 = FUNCTION_TABLE_ii[$15 & 1]($12) | 0; //@line 6320
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 6324
  ___async_unwind = 0; //@line 6325
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 142; //@line 6327
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 6329
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 6331
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 6333
 sp = STACKTOP; //@line 6334
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2018
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2020
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2022
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2026
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 2030
  label = 4; //@line 2031
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 2036
   label = 4; //@line 2037
  } else {
   $$037$off039 = 3; //@line 2039
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 2043
  $17 = $8 + 40 | 0; //@line 2044
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 2047
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 2057
    $$037$off039 = $$037$off038; //@line 2058
   } else {
    $$037$off039 = $$037$off038; //@line 2060
   }
  } else {
   $$037$off039 = $$037$off038; //@line 2063
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 2066
 return;
}
function _strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $2 = 0, $5 = 0;
 $2 = HEAP8[$1 >> 0] | 0; //@line 11230
 do {
  if (!($2 << 24 >> 24)) {
   $$0 = $0; //@line 11234
  } else {
   $5 = _strchr($0, $2 << 24 >> 24) | 0; //@line 11237
   if (!$5) {
    $$0 = 0; //@line 11240
   } else {
    if (!(HEAP8[$1 + 1 >> 0] | 0)) {
     $$0 = $5; //@line 11246
    } else {
     if (!(HEAP8[$5 + 1 >> 0] | 0)) {
      $$0 = 0; //@line 11252
     } else {
      if (!(HEAP8[$1 + 2 >> 0] | 0)) {
       $$0 = _twobyte_strstr($5, $1) | 0; //@line 11259
       break;
      }
      if (!(HEAP8[$5 + 2 >> 0] | 0)) {
       $$0 = 0; //@line 11266
      } else {
       if (!(HEAP8[$1 + 3 >> 0] | 0)) {
        $$0 = _threebyte_strstr($5, $1) | 0; //@line 11273
        break;
       }
       if (!(HEAP8[$5 + 3 >> 0] | 0)) {
        $$0 = 0; //@line 11280
       } else {
        if (!(HEAP8[$1 + 4 >> 0] | 0)) {
         $$0 = _fourbyte_strstr($5, $1) | 0; //@line 11287
         break;
        } else {
         $$0 = _twoway_strstr($5, $1) | 0; //@line 11291
         break;
        }
       }
      }
     }
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 11301
}
function __ZN4mbed11InterruptInD2Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 144
 HEAP32[$0 >> 2] = 272; //@line 145
 _gpio_irq_free($0 + 28 | 0); //@line 147
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 149
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 155
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 156
   FUNCTION_TABLE_vi[$7 & 255]($0 + 56 | 0); //@line 157
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 21; //@line 160
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
  HEAP32[$AsyncCtx3 >> 2] = 22; //@line 184
  sp = STACKTOP; //@line 185
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 188
 return;
}
function __ZN4mbed6TickerD0Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3389
 HEAP32[$0 >> 2] = 440; //@line 3390
 $1 = $0 + 40 | 0; //@line 3391
 _emscripten_asm_const_ii(8, $1 | 0) | 0; //@line 3392
 $4 = HEAP32[$0 + 52 >> 2] | 0; //@line 3394
 do {
  if ($4 | 0) {
   $7 = HEAP32[$4 + 8 >> 2] | 0; //@line 3399
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3400
   FUNCTION_TABLE_vi[$7 & 255]($1); //@line 3401
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 101; //@line 3404
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3406
    sp = STACKTOP; //@line 3407
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 3410
    break;
   }
  }
 } while (0);
 $AsyncCtx2 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3415
 __ZN4mbed10TimerEventD2Ev($0); //@line 3416
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 102; //@line 3419
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 3421
  sp = STACKTOP; //@line 3422
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 3425
  __ZdlPv($0); //@line 3426
  return;
 }
}
function _fourbyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$lcssa = 0, $$sink21$lcssa = 0, $$sink2123 = 0, $18 = 0, $32 = 0, $33 = 0, $35 = 0, $39 = 0, $40 = 0, $41 = 0;
 $18 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8 | (HEAPU8[$1 + 3 >> 0] | 0); //@line 11426
 $32 = $0 + 3 | 0; //@line 11440
 $33 = HEAP8[$32 >> 0] | 0; //@line 11441
 $35 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | (HEAPU8[$0 + 2 >> 0] | 0) << 8 | $33 & 255; //@line 11443
 if ($33 << 24 >> 24 == 0 | ($35 | 0) == ($18 | 0)) {
  $$lcssa = $33; //@line 11448
  $$sink21$lcssa = $32; //@line 11448
 } else {
  $$sink2123 = $32; //@line 11450
  $39 = $35; //@line 11450
  while (1) {
   $40 = $$sink2123 + 1 | 0; //@line 11453
   $41 = HEAP8[$40 >> 0] | 0; //@line 11454
   $39 = $39 << 8 | $41 & 255; //@line 11456
   if ($41 << 24 >> 24 == 0 | ($39 | 0) == ($18 | 0)) {
    $$lcssa = $41; //@line 11461
    $$sink21$lcssa = $40; //@line 11461
    break;
   } else {
    $$sink2123 = $40; //@line 11464
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$sink21$lcssa + -3 | 0 : 0) | 0; //@line 11471
}
function _main__async_cb_75($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 5686
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5688
 $4 = $2 + 4 | 0; //@line 5690
 HEAP32[$4 >> 2] = 0; //@line 5692
 HEAP32[$4 + 4 >> 2] = 0; //@line 5695
 HEAP32[$2 >> 2] = 9; //@line 5696
 $8 = $2 + 12 | 0; //@line 5697
 HEAP32[$8 >> 2] = 384; //@line 5698
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 5699
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5864, $2); //@line 5700
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 119; //@line 5703
  $9 = $ReallocAsyncCtx9 + 4 | 0; //@line 5704
  HEAP32[$9 >> 2] = $8; //@line 5705
  $10 = $ReallocAsyncCtx9 + 8 | 0; //@line 5706
  HEAP32[$10 >> 2] = $2; //@line 5707
  sp = STACKTOP; //@line 5708
  return;
 }
 ___async_unwind = 0; //@line 5711
 HEAP32[$ReallocAsyncCtx9 >> 2] = 119; //@line 5712
 $9 = $ReallocAsyncCtx9 + 4 | 0; //@line 5713
 HEAP32[$9 >> 2] = $8; //@line 5714
 $10 = $ReallocAsyncCtx9 + 8 | 0; //@line 5715
 HEAP32[$10 >> 2] = $2; //@line 5716
 sp = STACKTOP; //@line 5717
 return;
}
function _mbed_vtracef__async_cb_25($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1947
 $3 = HEAP32[92] | 0; //@line 1951
 if (HEAP8[$0 + 4 >> 0] & 1 & ($3 | 0) != 0) {
  $5 = HEAP32[84] | 0; //@line 1955
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 1956
  FUNCTION_TABLE_vi[$3 & 255]($5); //@line 1957
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 48; //@line 1960
   sp = STACKTOP; //@line 1961
   return;
  }
  ___async_unwind = 0; //@line 1964
  HEAP32[$ReallocAsyncCtx2 >> 2] = 48; //@line 1965
  sp = STACKTOP; //@line 1966
  return;
 } else {
  $6 = HEAP32[91] | 0; //@line 1969
  $7 = HEAP32[84] | 0; //@line 1970
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 1971
  FUNCTION_TABLE_vi[$6 & 255]($7); //@line 1972
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 50; //@line 1975
   sp = STACKTOP; //@line 1976
   return;
  }
  ___async_unwind = 0; //@line 1979
  HEAP32[$ReallocAsyncCtx4 >> 2] = 50; //@line 1980
  sp = STACKTOP; //@line 1981
  return;
 }
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3456
 $2 = $0 + 12 | 0; //@line 3458
 $3 = HEAP32[$2 >> 2] | 0; //@line 3459
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 3463
   _mbed_assert_internal(2173, 2178, 528); //@line 3464
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 104; //@line 3467
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 3469
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 3471
    sp = STACKTOP; //@line 3472
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 3475
    $8 = HEAP32[$2 >> 2] | 0; //@line 3477
    break;
   }
  } else {
   $8 = $3; //@line 3481
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 3484
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3486
 FUNCTION_TABLE_vi[$7 & 255]($0); //@line 3487
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 105; //@line 3490
  sp = STACKTOP; //@line 3491
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3494
  return;
 }
}
function _abort_message($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12284
 STACKTOP = STACKTOP + 16 | 0; //@line 12285
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12285
 $1 = sp; //@line 12286
 HEAP32[$1 >> 2] = $varargs; //@line 12287
 $2 = HEAP32[115] | 0; //@line 12288
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12289
 _vfprintf($2, $0, $1) | 0; //@line 12290
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 143; //@line 12293
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 12295
  sp = STACKTOP; //@line 12296
  STACKTOP = sp; //@line 12297
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 12299
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12300
 _fputc(10, $2) | 0; //@line 12301
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 144; //@line 12304
  sp = STACKTOP; //@line 12305
  STACKTOP = sp; //@line 12306
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 12308
  _abort(); //@line 12309
 }
}
function __ZN4mbed7TimeoutD0Ev($0) {
 $0 = $0 | 0;
 var $2 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 536
 HEAP32[$0 >> 2] = 440; //@line 537
 __ZN4mbed6Ticker6detachEv($0); //@line 538
 $2 = HEAP32[$0 + 52 >> 2] | 0; //@line 540
 do {
  if ($2 | 0) {
   $6 = HEAP32[$2 + 8 >> 2] | 0; //@line 546
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 547
   FUNCTION_TABLE_vi[$6 & 255]($0 + 40 | 0); //@line 548
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 34; //@line 551
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 553
    sp = STACKTOP; //@line 554
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 557
    break;
   }
  }
 } while (0);
 $AsyncCtx2 = _emscripten_alloc_async_context(8, sp) | 0; //@line 562
 __ZN4mbed10TimerEventD2Ev($0); //@line 563
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 35; //@line 566
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 568
  sp = STACKTOP; //@line 569
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 572
  __ZdlPv($0); //@line 573
  return;
 }
}
function _threebyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$016$lcssa = 0, $$01618 = 0, $$019 = 0, $$lcssa = 0, $14 = 0, $23 = 0, $24 = 0, $27 = 0, $30 = 0, $31 = 0;
 $14 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8; //@line 11360
 $23 = $0 + 2 | 0; //@line 11369
 $24 = HEAP8[$23 >> 0] | 0; //@line 11370
 $27 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | ($24 & 255) << 8; //@line 11373
 if (($27 | 0) == ($14 | 0) | $24 << 24 >> 24 == 0) {
  $$016$lcssa = $23; //@line 11378
  $$lcssa = $24; //@line 11378
 } else {
  $$01618 = $23; //@line 11380
  $$019 = $27; //@line 11380
  while (1) {
   $30 = $$01618 + 1 | 0; //@line 11382
   $31 = HEAP8[$30 >> 0] | 0; //@line 11383
   $$019 = ($$019 | $31 & 255) << 8; //@line 11386
   if (($$019 | 0) == ($14 | 0) | $31 << 24 >> 24 == 0) {
    $$016$lcssa = $30; //@line 11391
    $$lcssa = $31; //@line 11391
    break;
   } else {
    $$01618 = $30; //@line 11394
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$016$lcssa + -2 | 0 : 0) | 0; //@line 11401
}
function __ZN4mbed6TickerD2Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3348
 HEAP32[$0 >> 2] = 440; //@line 3349
 $1 = $0 + 40 | 0; //@line 3350
 _emscripten_asm_const_ii(8, $1 | 0) | 0; //@line 3351
 $4 = HEAP32[$0 + 52 >> 2] | 0; //@line 3353
 do {
  if ($4 | 0) {
   $7 = HEAP32[$4 + 8 >> 2] | 0; //@line 3358
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3359
   FUNCTION_TABLE_vi[$7 & 255]($1); //@line 3360
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 99; //@line 3363
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3365
    sp = STACKTOP; //@line 3366
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 3369
    break;
   }
  }
 } while (0);
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3374
 __ZN4mbed10TimerEventD2Ev($0); //@line 3375
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 100; //@line 3378
  sp = STACKTOP; //@line 3379
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 3382
  return;
 }
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_3($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $15 = 0, $17 = 0, $18 = 0, $21 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 261
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 267
 $8 = $0 + 16 | 0; //@line 269
 $10 = HEAP32[$8 >> 2] | 0; //@line 271
 $13 = HEAP32[$8 + 4 >> 2] | 0; //@line 274
 $15 = HEAP32[$0 + 24 >> 2] | 0; //@line 276
 $17 = HEAP32[$0 + 28 >> 2] | 0; //@line 278
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 280
 __ZN4mbed6Ticker5setupEy($6, $10, $13); //@line 281
 $18 = HEAP32[$15 >> 2] | 0; //@line 282
 if (!$18) {
  return;
 }
 $21 = HEAP32[$18 + 8 >> 2] | 0; //@line 288
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 289
 FUNCTION_TABLE_vi[$21 & 255]($17); //@line 290
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 125; //@line 293
  sp = STACKTOP; //@line 294
  return;
 }
 ___async_unwind = 0; //@line 297
 HEAP32[$ReallocAsyncCtx4 >> 2] = 125; //@line 298
 sp = STACKTOP; //@line 299
 return;
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 10988
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 10988
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 10989
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 10990
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 10999
    $$016 = $9; //@line 11002
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 11002
   } else {
    $$016 = $0; //@line 11004
    $storemerge = 0; //@line 11004
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 11006
   $$0 = $$016; //@line 11007
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 11011
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 11017
   HEAP32[tempDoublePtr >> 2] = $2; //@line 11020
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 11020
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 11021
  }
 }
 return +$$0;
}
function _main__async_cb_82($0) {
 $0 = $0 | 0;
 var $4 = 0, $5 = 0, $8 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5978
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5982
 $5 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 5983
 if (!$5) {
  $ReallocAsyncCtx10 = _emscripten_realloc_async_context(4) | 0; //@line 5986
  _wait_ms(-1); //@line 5987
  if (___async) {
   HEAP32[$ReallocAsyncCtx10 >> 2] = 121; //@line 5990
   sp = STACKTOP; //@line 5991
   return;
  }
  ___async_unwind = 0; //@line 5994
  HEAP32[$ReallocAsyncCtx10 >> 2] = 121; //@line 5995
  sp = STACKTOP; //@line 5996
  return;
 } else {
  $8 = HEAP32[$5 + 8 >> 2] | 0; //@line 6000
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 6001
  FUNCTION_TABLE_vi[$8 & 255]($4); //@line 6002
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 120; //@line 6005
   sp = STACKTOP; //@line 6006
   return;
  }
  ___async_unwind = 0; //@line 6009
  HEAP32[$ReallocAsyncCtx3 >> 2] = 120; //@line 6010
  sp = STACKTOP; //@line 6011
  return;
 }
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13887
 STACKTOP = STACKTOP + 16 | 0; //@line 13888
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13888
 $3 = sp; //@line 13889
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 13891
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 13894
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 13895
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 13896
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 167; //@line 13899
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 13901
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 13903
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 13905
  sp = STACKTOP; //@line 13906
  STACKTOP = sp; //@line 13907
  return 0; //@line 13907
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 13909
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 13913
 }
 STACKTOP = sp; //@line 13915
 return $8 & 1 | 0; //@line 13915
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $10 = 0, $13 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12807
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 12813
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 12816
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 12819
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 12820
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 12821
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 149; //@line 12824
    sp = STACKTOP; //@line 12825
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12828
    break;
   }
  }
 } while (0);
 return;
}
function _schedule_interrupt__async_cb_67($0) {
 $0 = $0 | 0;
 var $16 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 5307
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5311
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5313
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5315
 $8 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 5316
 if ($4 >>> 0 > $8 >>> 0) {
  if (!($AsyncRetVal >>> 0 >= $4 >>> 0 | $AsyncRetVal >>> 0 < $8 >>> 0)) {
   return;
  }
 } else {
  if (!($AsyncRetVal >>> 0 >= $4 >>> 0 & $AsyncRetVal >>> 0 < $8 >>> 0)) {
   return;
  }
 }
 $16 = HEAP32[(HEAP32[$6 >> 2] | 0) + 20 >> 2] | 0; //@line 5335
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(4) | 0; //@line 5336
 FUNCTION_TABLE_v[$16 & 15](); //@line 5337
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 72; //@line 5340
  sp = STACKTOP; //@line 5341
  return;
 }
 ___async_unwind = 0; //@line 5344
 HEAP32[$ReallocAsyncCtx6 >> 2] = 72; //@line 5345
 sp = STACKTOP; //@line 5346
 return;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2806
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2814
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2816
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2818
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2820
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2822
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2824
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 2826
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 2837
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 2838
 HEAP32[$10 >> 2] = 0; //@line 2839
 HEAP32[$12 >> 2] = 0; //@line 2840
 HEAP32[$14 >> 2] = 0; //@line 2841
 HEAP32[$2 >> 2] = 0; //@line 2842
 $33 = HEAP32[$16 >> 2] | 0; //@line 2843
 HEAP32[$16 >> 2] = $33 | $18; //@line 2848
 if ($20 | 0) {
  ___unlockfile($22); //@line 2851
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 2854
 return;
}
function __ZN4mbed7TimeoutD2Ev($0) {
 $0 = $0 | 0;
 var $2 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 495
 HEAP32[$0 >> 2] = 440; //@line 496
 __ZN4mbed6Ticker6detachEv($0); //@line 497
 $2 = HEAP32[$0 + 52 >> 2] | 0; //@line 499
 do {
  if ($2 | 0) {
   $6 = HEAP32[$2 + 8 >> 2] | 0; //@line 505
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 506
   FUNCTION_TABLE_vi[$6 & 255]($0 + 40 | 0); //@line 507
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 32; //@line 510
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 512
    sp = STACKTOP; //@line 513
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 516
    break;
   }
  }
 } while (0);
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 521
 __ZN4mbed10TimerEventD2Ev($0); //@line 522
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 33; //@line 525
  sp = STACKTOP; //@line 526
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 529
  return;
 }
}
function _mbed_vtracef__async_cb_22($0) {
 $0 = $0 | 0;
 var $$pre = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 1678
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1682
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 2) {
  return;
 }
 $5 = $4 + -1 | 0; //@line 1687
 $$pre = HEAP32[94] | 0; //@line 1688
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 1689
 FUNCTION_TABLE_v[$$pre & 15](); //@line 1690
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 57; //@line 1693
  $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 1694
  HEAP32[$6 >> 2] = $4; //@line 1695
  $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 1696
  HEAP32[$7 >> 2] = $5; //@line 1697
  sp = STACKTOP; //@line 1698
  return;
 }
 ___async_unwind = 0; //@line 1701
 HEAP32[$ReallocAsyncCtx9 >> 2] = 57; //@line 1702
 $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 1703
 HEAP32[$6 >> 2] = $4; //@line 1704
 $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 1705
 HEAP32[$7 >> 2] = $5; //@line 1706
 sp = STACKTOP; //@line 1707
 return;
}
function _mbed_vtracef__async_cb_21($0) {
 $0 = $0 | 0;
 var $$pre = 0, $2 = 0, $4 = 0, $5 = 0, $6 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 1645
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1647
 if (($2 | 0) <= 1) {
  return;
 }
 $4 = $2 + -1 | 0; //@line 1652
 $$pre = HEAP32[94] | 0; //@line 1653
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 1654
 FUNCTION_TABLE_v[$$pre & 15](); //@line 1655
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 57; //@line 1658
  $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 1659
  HEAP32[$5 >> 2] = $2; //@line 1660
  $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 1661
  HEAP32[$6 >> 2] = $4; //@line 1662
  sp = STACKTOP; //@line 1663
  return;
 }
 ___async_unwind = 0; //@line 1666
 HEAP32[$ReallocAsyncCtx9 >> 2] = 57; //@line 1667
 $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 1668
 HEAP32[$5 >> 2] = $2; //@line 1669
 $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 1670
 HEAP32[$6 >> 2] = $4; //@line 1671
 sp = STACKTOP; //@line 1672
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
 sp = STACKTOP; //@line 13806
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 13808
 $8 = $7 >> 8; //@line 13809
 if (!($7 & 1)) {
  $$0 = $8; //@line 13813
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 13818
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 13820
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 13823
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13828
 FUNCTION_TABLE_viiiiii[$17 & 3]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 13829
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 165; //@line 13832
  sp = STACKTOP; //@line 13833
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13836
  return;
 }
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12976
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 12982
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 12985
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 12988
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 12989
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 12990
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 152; //@line 12993
    sp = STACKTOP; //@line 12994
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12997
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
 sp = STACKTOP; //@line 13848
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 13850
 $7 = $6 >> 8; //@line 13851
 if (!($6 & 1)) {
  $$0 = $7; //@line 13855
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 13860
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 13862
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 13865
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13870
 FUNCTION_TABLE_viiiii[$16 & 3]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 13871
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 166; //@line 13874
  sp = STACKTOP; //@line 13875
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13878
  return;
 }
}
function _ticker_remove_event($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2668
 $4 = (HEAP32[$0 + 4 >> 2] | 0) + 4 | 0; //@line 2671
 $5 = HEAP32[$4 >> 2] | 0; //@line 2672
 if (($5 | 0) == ($1 | 0)) {
  HEAP32[$4 >> 2] = HEAP32[$1 + 12 >> 2]; //@line 2677
  $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2678
  _schedule_interrupt($0); //@line 2679
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 74; //@line 2682
   sp = STACKTOP; //@line 2683
   return;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2686
  return;
 } else {
  $$0 = $5; //@line 2689
 }
 do {
  if (!$$0) {
   label = 8; //@line 2694
   break;
  }
  $10 = $$0 + 12 | 0; //@line 2697
  $$0 = HEAP32[$10 >> 2] | 0; //@line 2698
 } while (($$0 | 0) != ($1 | 0));
 if ((label | 0) == 8) {
  return;
 }
 HEAP32[$10 >> 2] = HEAP32[$1 + 12 >> 2]; //@line 2711
 return;
}
function ___dynamic_cast__async_cb_62($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4868
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4870
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4872
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4878
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 4893
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 4909
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 4914
    break;
   }
  default:
   {
    $$0 = 0; //@line 4918
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 4923
 return;
}
function _mbed_error_vfprintf__async_cb_86($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6243
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 6245
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6247
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6249
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6251
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6253
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 6255
 _serial_putc(5784, $2 << 24 >> 24); //@line 6256
 if (!___async) {
  ___async_unwind = 0; //@line 6259
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 6261
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 6263
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 6265
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $8; //@line 6267
 HEAP8[$ReallocAsyncCtx2 + 16 >> 0] = $2; //@line 6269
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 6271
 sp = STACKTOP; //@line 6272
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13763
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 13765
 $6 = $5 >> 8; //@line 13766
 if (!($5 & 1)) {
  $$0 = $6; //@line 13770
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 13775
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 13777
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 13780
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13785
 FUNCTION_TABLE_viiii[$15 & 3]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 13786
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 164; //@line 13789
  sp = STACKTOP; //@line 13790
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13793
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
 sp = STACKTOP; //@line 9986
 STACKTOP = STACKTOP + 256 | 0; //@line 9987
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 9987
 $5 = sp; //@line 9988
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 9994
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 9998
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 10001
   $$011 = $9; //@line 10002
   do {
    _out_670($0, $5, 256); //@line 10004
    $$011 = $$011 + -256 | 0; //@line 10005
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 10014
  } else {
   $$0$lcssa = $9; //@line 10016
  }
  _out_670($0, $5, $$0$lcssa); //@line 10018
 }
 STACKTOP = sp; //@line 10020
 return;
}
function __ZN4mbed11InterruptInD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2078
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2080
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 2082
 if (!$4) {
  __ZdlPv($2); //@line 2085
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 2090
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 2091
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 2092
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 24; //@line 2095
  $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 2096
  HEAP32[$9 >> 2] = $2; //@line 2097
  sp = STACKTOP; //@line 2098
  return;
 }
 ___async_unwind = 0; //@line 2101
 HEAP32[$ReallocAsyncCtx2 >> 2] = 24; //@line 2102
 $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 2103
 HEAP32[$9 >> 2] = $2; //@line 2104
 sp = STACKTOP; //@line 2105
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7281
 STACKTOP = STACKTOP + 32 | 0; //@line 7282
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 7282
 $vararg_buffer = sp; //@line 7283
 $3 = sp + 20 | 0; //@line 7284
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 7288
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 7290
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 7292
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 7294
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 7296
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 7301
  $10 = -1; //@line 7302
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 7305
 }
 STACKTOP = sp; //@line 7307
 return $10 | 0; //@line 7307
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 2724
 STACKTOP = STACKTOP + 16 | 0; //@line 2725
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2725
 $vararg_buffer = sp; //@line 2726
 HEAP32[$vararg_buffer >> 2] = $0; //@line 2727
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 2729
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 2731
 _mbed_error_printf(1839, $vararg_buffer); //@line 2732
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2733
 _mbed_die(); //@line 2734
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 75; //@line 2737
  sp = STACKTOP; //@line 2738
  STACKTOP = sp; //@line 2739
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2741
  STACKTOP = sp; //@line 2742
  return;
 }
}
function __ZN4mbed7Timeout7handlerEv__async_cb_72($0) {
 $0 = $0 | 0;
 var $4 = 0, $5 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5579
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5583
 $5 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 5584
 if (!$5) {
  return;
 }
 $8 = HEAP32[$5 + 8 >> 2] | 0; //@line 5590
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 5591
 FUNCTION_TABLE_vi[$8 & 255]($4); //@line 5592
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 39; //@line 5595
  $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 5596
  HEAP32[$9 >> 2] = $4; //@line 5597
  sp = STACKTOP; //@line 5598
  return;
 }
 ___async_unwind = 0; //@line 5601
 HEAP32[$ReallocAsyncCtx3 >> 2] = 39; //@line 5602
 $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 5603
 HEAP32[$9 >> 2] = $4; //@line 5604
 sp = STACKTOP; //@line 5605
 return;
}
function _snprintf($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11865
 STACKTOP = STACKTOP + 16 | 0; //@line 11866
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11866
 $3 = sp; //@line 11867
 HEAP32[$3 >> 2] = $varargs; //@line 11868
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 11869
 $4 = _vsnprintf($0, $1, $2, $3) | 0; //@line 11870
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 136; //@line 11873
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 11875
  sp = STACKTOP; //@line 11876
  STACKTOP = sp; //@line 11877
  return 0; //@line 11877
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11879
  STACKTOP = sp; //@line 11880
  return $4 | 0; //@line 11880
 }
 return 0; //@line 11882
}
function _schedule_interrupt__async_cb_66($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 5275
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5277
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5279
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5281
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 4 >> 2] | 0; //@line 5284
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(16) | 0; //@line 5285
 $10 = FUNCTION_TABLE_i[$9 & 3]() | 0; //@line 5286
 if (!___async) {
  HEAP32[___async_retval >> 2] = $10; //@line 5290
  ___async_unwind = 0; //@line 5291
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 71; //@line 5293
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $4; //@line 5295
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $6; //@line 5297
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $2; //@line 5299
 sp = STACKTOP; //@line 5300
 return;
}
function _initialize__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3458
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3460
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3462
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3464
 $9 = HEAP32[(HEAP32[$4 >> 2] | 0) + 24 >> 2] | 0; //@line 3467
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 3468
 $10 = FUNCTION_TABLE_i[$9 & 3]() | 0; //@line 3469
 if (!___async) {
  HEAP32[___async_retval >> 2] = $10; //@line 3473
  ___async_unwind = 0; //@line 3474
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 61; //@line 3476
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 3478
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 3480
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 3482
 sp = STACKTOP; //@line 3483
 return;
}
function _mbed_vtracef__async_cb_20($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 1615
 HEAP32[88] = HEAP32[86]; //@line 1617
 $2 = HEAP32[94] | 0; //@line 1618
 if (!$2) {
  return;
 }
 $4 = HEAP32[95] | 0; //@line 1623
 HEAP32[95] = 0; //@line 1624
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 1625
 FUNCTION_TABLE_v[$2 & 15](); //@line 1626
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 1629
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 1630
  HEAP32[$5 >> 2] = $4; //@line 1631
  sp = STACKTOP; //@line 1632
  return;
 }
 ___async_unwind = 0; //@line 1635
 HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 1636
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 1637
 HEAP32[$5 >> 2] = $4; //@line 1638
 sp = STACKTOP; //@line 1639
 return;
}
function _mbed_vtracef__async_cb_17($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 1351
 HEAP32[88] = HEAP32[86]; //@line 1353
 $2 = HEAP32[94] | 0; //@line 1354
 if (!$2) {
  return;
 }
 $4 = HEAP32[95] | 0; //@line 1359
 HEAP32[95] = 0; //@line 1360
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 1361
 FUNCTION_TABLE_v[$2 & 15](); //@line 1362
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 1365
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 1366
  HEAP32[$5 >> 2] = $4; //@line 1367
  sp = STACKTOP; //@line 1368
  return;
 }
 ___async_unwind = 0; //@line 1371
 HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 1372
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 1373
 HEAP32[$5 >> 2] = $4; //@line 1374
 sp = STACKTOP; //@line 1375
 return;
}
function _mbed_vtracef__async_cb_16($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 1321
 HEAP32[88] = HEAP32[86]; //@line 1323
 $2 = HEAP32[94] | 0; //@line 1324
 if (!$2) {
  return;
 }
 $4 = HEAP32[95] | 0; //@line 1329
 HEAP32[95] = 0; //@line 1330
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 1331
 FUNCTION_TABLE_v[$2 & 15](); //@line 1332
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 1335
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 1336
  HEAP32[$5 >> 2] = $4; //@line 1337
  sp = STACKTOP; //@line 1338
  return;
 }
 ___async_unwind = 0; //@line 1341
 HEAP32[$ReallocAsyncCtx8 >> 2] = 56; //@line 1342
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 1343
 HEAP32[$5 >> 2] = $4; //@line 1344
 sp = STACKTOP; //@line 1345
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 12529
 $5 = HEAP32[$4 >> 2] | 0; //@line 12530
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 12534
   HEAP32[$1 + 24 >> 2] = $3; //@line 12536
   HEAP32[$1 + 36 >> 2] = 1; //@line 12538
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 12542
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 12545
    HEAP32[$1 + 24 >> 2] = 2; //@line 12547
    HEAP8[$1 + 54 >> 0] = 1; //@line 12549
    break;
   }
   $10 = $1 + 24 | 0; //@line 12552
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 12556
   }
  }
 } while (0);
 return;
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 13079
 STACKTOP = STACKTOP + 16 | 0; //@line 13080
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13080
 $vararg_buffer = sp; //@line 13081
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 13082
 FUNCTION_TABLE_v[$0 & 15](); //@line 13083
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 154; //@line 13086
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 13088
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 13090
  sp = STACKTOP; //@line 13091
  STACKTOP = sp; //@line 13092
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13094
  _abort_message(5436, $vararg_buffer); //@line 13095
 }
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 7388
 $3 = HEAP8[$1 >> 0] | 0; //@line 7389
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 7394
  $$lcssa8 = $2; //@line 7394
 } else {
  $$011 = $1; //@line 7396
  $$0710 = $0; //@line 7396
  do {
   $$0710 = $$0710 + 1 | 0; //@line 7398
   $$011 = $$011 + 1 | 0; //@line 7399
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 7400
   $9 = HEAP8[$$011 >> 0] | 0; //@line 7401
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 7406
  $$lcssa8 = $8; //@line 7406
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 7416
}
function _memcmp($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $14 = 0, $4 = 0, $5 = 0;
 L1 : do {
  if (!$2) {
   $14 = 0; //@line 11830
  } else {
   $$01318 = $0; //@line 11832
   $$01417 = $2; //@line 11832
   $$019 = $1; //@line 11832
   while (1) {
    $4 = HEAP8[$$01318 >> 0] | 0; //@line 11834
    $5 = HEAP8[$$019 >> 0] | 0; //@line 11835
    if ($4 << 24 >> 24 != $5 << 24 >> 24) {
     break;
    }
    $$01417 = $$01417 + -1 | 0; //@line 11840
    if (!$$01417) {
     $14 = 0; //@line 11845
     break L1;
    } else {
     $$01318 = $$01318 + 1 | 0; //@line 11848
     $$019 = $$019 + 1 | 0; //@line 11848
    }
   }
   $14 = ($4 & 255) - ($5 & 255) | 0; //@line 11854
  }
 } while (0);
 return $14 | 0; //@line 11857
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3289
 $2 = HEAP32[147] | 0; //@line 3290
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3291
 _putc($1, $2) | 0; //@line 3292
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 97; //@line 3295
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 3297
  sp = STACKTOP; //@line 3298
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3301
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3302
 _fflush($2) | 0; //@line 3303
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 98; //@line 3306
  sp = STACKTOP; //@line 3307
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3310
  return;
 }
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7340
 STACKTOP = STACKTOP + 32 | 0; //@line 7341
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 7341
 $vararg_buffer = sp; //@line 7342
 HEAP32[$0 + 36 >> 2] = 1; //@line 7345
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 7353
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 7355
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 7357
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 7362
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 7365
 STACKTOP = sp; //@line 7366
 return $14 | 0; //@line 7366
}
function _mbed_die__async_cb_43($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 2495
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2497
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2499
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 2500
 _wait_ms(150); //@line 2501
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 77; //@line 2504
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 2505
  HEAP32[$4 >> 2] = $2; //@line 2506
  sp = STACKTOP; //@line 2507
  return;
 }
 ___async_unwind = 0; //@line 2510
 HEAP32[$ReallocAsyncCtx15 >> 2] = 77; //@line 2511
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 2512
 HEAP32[$4 >> 2] = $2; //@line 2513
 sp = STACKTOP; //@line 2514
 return;
}
function _mbed_die__async_cb_42($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 2470
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2472
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2474
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 2475
 _wait_ms(150); //@line 2476
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 78; //@line 2479
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 2480
  HEAP32[$4 >> 2] = $2; //@line 2481
  sp = STACKTOP; //@line 2482
  return;
 }
 ___async_unwind = 0; //@line 2485
 HEAP32[$ReallocAsyncCtx14 >> 2] = 78; //@line 2486
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 2487
 HEAP32[$4 >> 2] = $2; //@line 2488
 sp = STACKTOP; //@line 2489
 return;
}
function _mbed_die__async_cb_41($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 2445
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2447
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2449
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 2450
 _wait_ms(150); //@line 2451
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 79; //@line 2454
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 2455
  HEAP32[$4 >> 2] = $2; //@line 2456
  sp = STACKTOP; //@line 2457
  return;
 }
 ___async_unwind = 0; //@line 2460
 HEAP32[$ReallocAsyncCtx13 >> 2] = 79; //@line 2461
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 2462
 HEAP32[$4 >> 2] = $2; //@line 2463
 sp = STACKTOP; //@line 2464
 return;
}
function _mbed_die__async_cb_40($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 2420
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2422
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2424
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 2425
 _wait_ms(150); //@line 2426
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 80; //@line 2429
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 2430
  HEAP32[$4 >> 2] = $2; //@line 2431
  sp = STACKTOP; //@line 2432
  return;
 }
 ___async_unwind = 0; //@line 2435
 HEAP32[$ReallocAsyncCtx12 >> 2] = 80; //@line 2436
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 2437
 HEAP32[$4 >> 2] = $2; //@line 2438
 sp = STACKTOP; //@line 2439
 return;
}
function _mbed_die__async_cb_39($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 2395
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2397
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2399
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 2400
 _wait_ms(150); //@line 2401
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 81; //@line 2404
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 2405
  HEAP32[$4 >> 2] = $2; //@line 2406
  sp = STACKTOP; //@line 2407
  return;
 }
 ___async_unwind = 0; //@line 2410
 HEAP32[$ReallocAsyncCtx11 >> 2] = 81; //@line 2411
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 2412
 HEAP32[$4 >> 2] = $2; //@line 2413
 sp = STACKTOP; //@line 2414
 return;
}
function _mbed_die__async_cb_38($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 2370
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2372
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2374
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 2375
 _wait_ms(150); //@line 2376
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 82; //@line 2379
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 2380
  HEAP32[$4 >> 2] = $2; //@line 2381
  sp = STACKTOP; //@line 2382
  return;
 }
 ___async_unwind = 0; //@line 2385
 HEAP32[$ReallocAsyncCtx10 >> 2] = 82; //@line 2386
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 2387
 HEAP32[$4 >> 2] = $2; //@line 2388
 sp = STACKTOP; //@line 2389
 return;
}
function _mbed_tracef($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 771
 STACKTOP = STACKTOP + 16 | 0; //@line 772
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 772
 $3 = sp; //@line 773
 HEAP32[$3 >> 2] = $varargs; //@line 774
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 775
 _mbed_vtracef($0, $1, $2, $3); //@line 776
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 45; //@line 779
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 781
  sp = STACKTOP; //@line 782
  STACKTOP = sp; //@line 783
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 785
  STACKTOP = sp; //@line 786
  return;
 }
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 2120
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2122
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2124
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 2125
 _wait_ms(150); //@line 2126
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 76; //@line 2129
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 2130
  HEAP32[$4 >> 2] = $2; //@line 2131
  sp = STACKTOP; //@line 2132
  return;
 }
 ___async_unwind = 0; //@line 2135
 HEAP32[$ReallocAsyncCtx16 >> 2] = 76; //@line 2136
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 2137
 HEAP32[$4 >> 2] = $2; //@line 2138
 sp = STACKTOP; //@line 2139
 return;
}
function _mbed_die__async_cb_37($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 2345
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2347
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2349
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 2350
 _wait_ms(150); //@line 2351
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 83; //@line 2354
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 2355
  HEAP32[$4 >> 2] = $2; //@line 2356
  sp = STACKTOP; //@line 2357
  return;
 }
 ___async_unwind = 0; //@line 2360
 HEAP32[$ReallocAsyncCtx9 >> 2] = 83; //@line 2361
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 2362
 HEAP32[$4 >> 2] = $2; //@line 2363
 sp = STACKTOP; //@line 2364
 return;
}
function _mbed_die__async_cb_36($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 2320
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2322
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2324
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 2325
 _wait_ms(400); //@line 2326
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 84; //@line 2329
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 2330
  HEAP32[$4 >> 2] = $2; //@line 2331
  sp = STACKTOP; //@line 2332
  return;
 }
 ___async_unwind = 0; //@line 2335
 HEAP32[$ReallocAsyncCtx8 >> 2] = 84; //@line 2336
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 2337
 HEAP32[$4 >> 2] = $2; //@line 2338
 sp = STACKTOP; //@line 2339
 return;
}
function _mbed_die__async_cb_35($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2295
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2297
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2299
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 2300
 _wait_ms(400); //@line 2301
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 85; //@line 2304
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 2305
  HEAP32[$4 >> 2] = $2; //@line 2306
  sp = STACKTOP; //@line 2307
  return;
 }
 ___async_unwind = 0; //@line 2310
 HEAP32[$ReallocAsyncCtx7 >> 2] = 85; //@line 2311
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 2312
 HEAP32[$4 >> 2] = $2; //@line 2313
 sp = STACKTOP; //@line 2314
 return;
}
function _mbed_die__async_cb_34($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 2270
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2272
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2274
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 2275
 _wait_ms(400); //@line 2276
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 86; //@line 2279
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 2280
  HEAP32[$4 >> 2] = $2; //@line 2281
  sp = STACKTOP; //@line 2282
  return;
 }
 ___async_unwind = 0; //@line 2285
 HEAP32[$ReallocAsyncCtx6 >> 2] = 86; //@line 2286
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 2287
 HEAP32[$4 >> 2] = $2; //@line 2288
 sp = STACKTOP; //@line 2289
 return;
}
function _mbed_die__async_cb_33($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 2245
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2247
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2249
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 2250
 _wait_ms(400); //@line 2251
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 87; //@line 2254
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 2255
  HEAP32[$4 >> 2] = $2; //@line 2256
  sp = STACKTOP; //@line 2257
  return;
 }
 ___async_unwind = 0; //@line 2260
 HEAP32[$ReallocAsyncCtx5 >> 2] = 87; //@line 2261
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 2262
 HEAP32[$4 >> 2] = $2; //@line 2263
 sp = STACKTOP; //@line 2264
 return;
}
function _mbed_die__async_cb_32($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 2220
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2222
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2224
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 2225
 _wait_ms(400); //@line 2226
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 88; //@line 2229
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 2230
  HEAP32[$4 >> 2] = $2; //@line 2231
  sp = STACKTOP; //@line 2232
  return;
 }
 ___async_unwind = 0; //@line 2235
 HEAP32[$ReallocAsyncCtx4 >> 2] = 88; //@line 2236
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 2237
 HEAP32[$4 >> 2] = $2; //@line 2238
 sp = STACKTOP; //@line 2239
 return;
}
function _mbed_die__async_cb_31($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2195
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2197
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2199
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 2200
 _wait_ms(400); //@line 2201
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 89; //@line 2204
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 2205
  HEAP32[$4 >> 2] = $2; //@line 2206
  sp = STACKTOP; //@line 2207
  return;
 }
 ___async_unwind = 0; //@line 2210
 HEAP32[$ReallocAsyncCtx3 >> 2] = 89; //@line 2211
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 2212
 HEAP32[$4 >> 2] = $2; //@line 2213
 sp = STACKTOP; //@line 2214
 return;
}
function _mbed_die__async_cb_30($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2170
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2172
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2174
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 2175
 _wait_ms(400); //@line 2176
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 90; //@line 2179
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 2180
  HEAP32[$4 >> 2] = $2; //@line 2181
  sp = STACKTOP; //@line 2182
  return;
 }
 ___async_unwind = 0; //@line 2185
 HEAP32[$ReallocAsyncCtx2 >> 2] = 90; //@line 2186
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 2187
 HEAP32[$4 >> 2] = $2; //@line 2188
 sp = STACKTOP; //@line 2189
 return;
}
function _mbed_die__async_cb_29($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2145
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2147
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2149
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 2150
 _wait_ms(400); //@line 2151
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 91; //@line 2154
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 2155
  HEAP32[$4 >> 2] = $2; //@line 2156
  sp = STACKTOP; //@line 2157
  return;
 }
 ___async_unwind = 0; //@line 2160
 HEAP32[$ReallocAsyncCtx >> 2] = 91; //@line 2161
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 2162
 HEAP32[$4 >> 2] = $2; //@line 2163
 sp = STACKTOP; //@line 2164
 return;
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3052
 STACKTOP = STACKTOP + 16 | 0; //@line 3053
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3053
 $1 = sp; //@line 3054
 HEAP32[$1 >> 2] = $varargs; //@line 3055
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3056
 _mbed_error_vfprintf($0, $1); //@line 3057
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 92; //@line 3060
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 3062
  sp = STACKTOP; //@line 3063
  STACKTOP = sp; //@line 3064
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3066
  STACKTOP = sp; //@line 3067
  return;
 }
}
function __ZN4mbed10TimerEventC2Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 709
 HEAP32[$0 >> 2] = 308; //@line 710
 $1 = $0 + 8 | 0; //@line 711
 HEAP32[$1 >> 2] = 0; //@line 712
 HEAP32[$1 + 4 >> 2] = 0; //@line 712
 HEAP32[$1 + 8 >> 2] = 0; //@line 712
 HEAP32[$1 + 12 >> 2] = 0; //@line 712
 $2 = _get_us_ticker_data() | 0; //@line 713
 HEAP32[$0 + 24 >> 2] = $2; //@line 715
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 716
 _ticker_set_handler($2, 41); //@line 717
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 42; //@line 720
  sp = STACKTOP; //@line 721
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 724
  return;
 }
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 6843
 newDynamicTop = oldDynamicTop + increment | 0; //@line 6844
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 6848
  ___setErrNo(12); //@line 6849
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 6853
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 6857
   ___setErrNo(12); //@line 6858
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 6862
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 7511
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 7513
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 7519
  $11 = ___fwritex($0, $4, $3) | 0; //@line 7520
  if ($phitmp) {
   $13 = $11; //@line 7522
  } else {
   ___unlockfile($3); //@line 7524
   $13 = $11; //@line 7525
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 7529
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 7533
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 7536
 }
 return $15 | 0; //@line 7538
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 9847
 } else {
  $$056 = $2; //@line 9849
  $15 = $1; //@line 9849
  $8 = $0; //@line 9849
  while (1) {
   $14 = $$056 + -1 | 0; //@line 9857
   HEAP8[$14 >> 0] = HEAPU8[3099 + ($8 & 15) >> 0] | 0 | $3; //@line 9858
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 9859
   $15 = tempRet0; //@line 9860
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 9865
    break;
   } else {
    $$056 = $14; //@line 9868
   }
  }
 }
 return $$05$lcssa | 0; //@line 9872
}
function __ZSt9terminatev() {
 var $0 = 0, $16 = 0, $17 = 0, $2 = 0, $5 = 0, sp = 0;
 sp = STACKTOP; //@line 13044
 $0 = ___cxa_get_globals_fast() | 0; //@line 13045
 if ($0 | 0) {
  $2 = HEAP32[$0 >> 2] | 0; //@line 13048
  if ($2 | 0) {
   $5 = $2 + 48 | 0; //@line 13052
   if ((HEAP32[$5 >> 2] & -256 | 0) == 1126902528 ? (HEAP32[$5 + 4 >> 2] | 0) == 1129074247 : 0) {
    $16 = HEAP32[$2 + 12 >> 2] | 0; //@line 13064
    _emscripten_alloc_async_context(4, sp) | 0; //@line 13065
    __ZSt11__terminatePFvvE($16); //@line 13066
   }
  }
 }
 $17 = __ZSt13get_terminatev() | 0; //@line 13071
 _emscripten_alloc_async_context(4, sp) | 0; //@line 13072
 __ZSt11__terminatePFvvE($17); //@line 13073
}
function _main__async_cb_79($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 5812
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5814
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5816
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5818
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(16) | 0; //@line 5819
 _puts(2443) | 0; //@line 5820
 if (!___async) {
  ___async_unwind = 0; //@line 5823
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 113; //@line 5825
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 5827
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 5829
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 5831
 sp = STACKTOP; //@line 5832
 return;
}
function _main__async_cb_78($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 5786
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5788
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5790
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5792
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 5793
 _puts(2546) | 0; //@line 5794
 if (!___async) {
  ___async_unwind = 0; //@line 5797
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 114; //@line 5799
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $2; //@line 5801
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $4; //@line 5803
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $6; //@line 5805
 sp = STACKTOP; //@line 5806
 return;
}
function __GLOBAL__sub_I_main_cpp__async_cb_60($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4592
 HEAP32[1412] = 440; //@line 4593
 HEAP32[1422] = 0; //@line 4594
 HEAP32[1423] = 0; //@line 4594
 HEAP32[1424] = 0; //@line 4594
 HEAP32[1425] = 0; //@line 4594
 HEAP8[5704] = 1; //@line 4595
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 4596
 __ZN4mbed10TimerEventC2Ev(5712); //@line 4597
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 108; //@line 4600
  sp = STACKTOP; //@line 4601
  return;
 }
 ___async_unwind = 0; //@line 4604
 HEAP32[$ReallocAsyncCtx >> 2] = 108; //@line 4605
 sp = STACKTOP; //@line 4606
 return;
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 7728
 $3 = HEAP8[$1 >> 0] | 0; //@line 7730
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 7734
 $7 = HEAP32[$0 >> 2] | 0; //@line 7735
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 7740
  HEAP32[$0 + 4 >> 2] = 0; //@line 7742
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 7744
  HEAP32[$0 + 28 >> 2] = $14; //@line 7746
  HEAP32[$0 + 20 >> 2] = $14; //@line 7748
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 7754
  $$0 = 0; //@line 7755
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 7758
  $$0 = -1; //@line 7759
 }
 return $$0 | 0; //@line 7761
}
function __ZN4mbed7Timeout7handlerEv__async_cb_74($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5619
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5621
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5623
 $5 = HEAP32[HEAP32[$2 >> 2] >> 2] | 0; //@line 5625
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 5626
 FUNCTION_TABLE_vi[$5 & 255]($4); //@line 5627
 if (!___async) {
  ___async_unwind = 0; //@line 5630
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 38; //@line 5632
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 5634
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 5636
 sp = STACKTOP; //@line 5637
 return;
}
function __ZN4mbed11InterruptInD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 478
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 480
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 482
 if (!$4) {
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 489
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 490
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 491
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 22; //@line 494
  sp = STACKTOP; //@line 495
  return;
 }
 ___async_unwind = 0; //@line 498
 HEAP32[$ReallocAsyncCtx2 >> 2] = 22; //@line 499
 sp = STACKTOP; //@line 500
 return;
}
function _twobyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$sink$in = 0, $$sink17$sink = 0, $11 = 0, $12 = 0, $8 = 0;
 $8 = (HEAPU8[$1 >> 0] | 0) << 8 | (HEAPU8[$1 + 1 >> 0] | 0); //@line 11315
 $$sink$in = HEAPU8[$0 >> 0] | 0; //@line 11318
 $$sink17$sink = $0; //@line 11318
 while (1) {
  $11 = $$sink17$sink + 1 | 0; //@line 11320
  $12 = HEAP8[$11 >> 0] | 0; //@line 11321
  if (!($12 << 24 >> 24)) {
   break;
  }
  $$sink$in = $$sink$in << 8 & 65280 | $12 & 255; //@line 11329
  if (($$sink$in | 0) == ($8 | 0)) {
   break;
  } else {
   $$sink17$sink = $11; //@line 11334
  }
 }
 return ($12 << 24 >> 24 ? $$sink17$sink : 0) | 0; //@line 11339
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 9884
 } else {
  $$06 = $2; //@line 9886
  $11 = $1; //@line 9886
  $7 = $0; //@line 9886
  while (1) {
   $10 = $$06 + -1 | 0; //@line 9891
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 9892
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 9893
   $11 = tempRet0; //@line 9894
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 9899
    break;
   } else {
    $$06 = $10; //@line 9902
   }
  }
 }
 return $$0$lcssa | 0; //@line 9906
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13920
 do {
  if (!$0) {
   $3 = 0; //@line 13924
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13926
   $2 = ___dynamic_cast($0, 176, 232, 0) | 0; //@line 13927
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 168; //@line 13930
    sp = STACKTOP; //@line 13931
    return 0; //@line 13932
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 13934
    $3 = ($2 | 0) != 0 & 1; //@line 13937
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 13942
}
function _invoke_ticker__async_cb_84($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6032
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 6038
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 6039
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 6040
 FUNCTION_TABLE_vi[$5 & 255]($6); //@line 6041
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 105; //@line 6044
  sp = STACKTOP; //@line 6045
  return;
 }
 ___async_unwind = 0; //@line 6048
 HEAP32[$ReallocAsyncCtx >> 2] = 105; //@line 6049
 sp = STACKTOP; //@line 6050
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 9528
 } else {
  $$04 = 0; //@line 9530
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 9533
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 9537
   $12 = $7 + 1 | 0; //@line 9538
   HEAP32[$0 >> 2] = $12; //@line 9539
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 9545
    break;
   } else {
    $$04 = $11; //@line 9548
   }
  }
 }
 return $$0$lcssa | 0; //@line 9552
}
function ___muldi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $x_sroa_0_0_extract_trunc = 0, $y_sroa_0_0_extract_trunc = 0, $1$0 = 0, $1$1 = 0;
 $x_sroa_0_0_extract_trunc = $a$0; //@line 6376
 $y_sroa_0_0_extract_trunc = $b$0; //@line 6377
 $1$0 = ___muldsi3($x_sroa_0_0_extract_trunc, $y_sroa_0_0_extract_trunc) | 0; //@line 6378
 $1$1 = tempRet0; //@line 6379
 return (tempRet0 = (Math_imul($a$1, $y_sroa_0_0_extract_trunc) | 0) + (Math_imul($b$1, $x_sroa_0_0_extract_trunc) | 0) + $1$1 | $1$1 & 0, $1$0 | 0 | 0) | 0; //@line 6381
}
function runPostSets() {}
function ___muldsi3($a, $b) {
 $a = $a | 0;
 $b = $b | 0;
 var $1 = 0, $2 = 0, $3 = 0, $6 = 0, $8 = 0, $11 = 0, $12 = 0;
 $1 = $a & 65535; //@line 6361
 $2 = $b & 65535; //@line 6362
 $3 = Math_imul($2, $1) | 0; //@line 6363
 $6 = $a >>> 16; //@line 6364
 $8 = ($3 >>> 16) + (Math_imul($2, $6) | 0) | 0; //@line 6365
 $11 = $b >>> 16; //@line 6366
 $12 = Math_imul($11, $1) | 0; //@line 6367
 return (tempRet0 = ($8 >>> 16) + (Math_imul($11, $6) | 0) + ((($8 & 65535) + $12 | 0) >>> 16) | 0, $8 + $12 << 16 | $3 & 65535 | 0) | 0; //@line 6368
}
function _ticker_set_handler($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1500
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1501
 _initialize($0); //@line 1502
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 59; //@line 1505
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1507
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 1509
  sp = STACKTOP; //@line 1510
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1513
  HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = $1; //@line 1516
  return;
 }
}
function __Z11toggle_led2v() {
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3609
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3610
 _puts(2395) | 0; //@line 3611
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 110; //@line 3614
  sp = STACKTOP; //@line 3615
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3618
  $2 = (_emscripten_asm_const_ii(10, HEAP32[1454] | 0) | 0) == 0 & 1; //@line 3622
  _emscripten_asm_const_iii(2, HEAP32[1454] | 0, $2 | 0) | 0; //@line 3624
  return;
 }
}
function __Z10blink_led1v() {
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3588
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3589
 _puts(2312) | 0; //@line 3590
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 109; //@line 3593
  sp = STACKTOP; //@line 3594
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3597
  $2 = (_emscripten_asm_const_ii(10, HEAP32[1448] | 0) | 0) == 0 & 1; //@line 3601
  _emscripten_asm_const_iii(2, HEAP32[1448] | 0, $2 | 0) | 0; //@line 3603
  return;
 }
}
function __ZN4mbed6Ticker7handlerEv($0) {
 $0 = $0 | 0;
 var $2 = 0, $5 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3433
 $2 = HEAP32[$0 + 52 >> 2] | 0; //@line 3435
 if (!$2) {
  return;
 }
 $5 = HEAP32[$2 >> 2] | 0; //@line 3441
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3442
 FUNCTION_TABLE_vi[$5 & 255]($0 + 40 | 0); //@line 3443
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 103; //@line 3446
  sp = STACKTOP; //@line 3447
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3450
 return;
}
function __ZN4mbed6TickerD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1988
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1990
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 1991
 __ZN4mbed10TimerEventD2Ev($2); //@line 1992
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 1995
  sp = STACKTOP; //@line 1996
  return;
 }
 ___async_unwind = 0; //@line 1999
 HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 2000
 sp = STACKTOP; //@line 2001
 return;
}
function ___fflush_unlocked__async_cb_6($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 404
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 406
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 408
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 410
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 412
 HEAP32[$4 >> 2] = 0; //@line 413
 HEAP32[$6 >> 2] = 0; //@line 414
 HEAP32[$8 >> 2] = 0; //@line 415
 HEAP32[$10 >> 2] = 0; //@line 416
 HEAP32[___async_retval >> 2] = 0; //@line 418
 return;
}
function __ZN4mbed7TimeoutD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 447
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 449
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 450
 __ZN4mbed10TimerEventD2Ev($2); //@line 451
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 33; //@line 454
  sp = STACKTOP; //@line 455
  return;
 }
 ___async_unwind = 0; //@line 458
 HEAP32[$ReallocAsyncCtx2 >> 2] = 33; //@line 459
 sp = STACKTOP; //@line 460
 return;
}
function _mbed_vtracef__async_cb_15($0) {
 $0 = $0 | 0;
 var $1 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1303
 $1 = HEAP32[92] | 0; //@line 1304
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 1305
 FUNCTION_TABLE_vi[$1 & 255](1636); //@line 1306
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 49; //@line 1309
  sp = STACKTOP; //@line 1310
  return;
 }
 ___async_unwind = 0; //@line 1313
 HEAP32[$ReallocAsyncCtx3 >> 2] = 49; //@line 1314
 sp = STACKTOP; //@line 1315
 return;
}
function __ZN4mbed11InterruptInC2E7PinName($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $3 = 0, $4 = 0, dest = 0, stop = 0;
 HEAP32[$0 >> 2] = 272; //@line 251
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
function _serial_putc__async_cb_71($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5483
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5485
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 5486
 _fflush($2) | 0; //@line 5487
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 98; //@line 5490
  sp = STACKTOP; //@line 5491
  return;
 }
 ___async_unwind = 0; //@line 5494
 HEAP32[$ReallocAsyncCtx >> 2] = 98; //@line 5495
 sp = STACKTOP; //@line 5496
 return;
}
function __ZN4mbed10TimerEventD2Ev($0) {
 $0 = $0 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 682
 HEAP32[$0 >> 2] = 308; //@line 683
 $2 = HEAP32[$0 + 24 >> 2] | 0; //@line 685
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 687
 _ticker_remove_event($2, $0 + 8 | 0); //@line 688
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 40; //@line 691
  sp = STACKTOP; //@line 692
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 695
  return;
 }
}
function __ZN4mbed7TimeoutD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5398
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5400
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 5401
 __ZN4mbed10TimerEventD2Ev($2); //@line 5402
 if (!___async) {
  ___async_unwind = 0; //@line 5405
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 35; //@line 5407
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 5409
 sp = STACKTOP; //@line 5410
 return;
}
function _emscripten_async_resume() {
 ___async = 0; //@line 6694
 ___async_unwind = 1; //@line 6695
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 6701
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 6705
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 6709
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 6711
 }
}
function __ZN4mbed6TickerD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 311
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 313
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 314
 __ZN4mbed10TimerEventD2Ev($2); //@line 315
 if (!___async) {
  ___async_unwind = 0; //@line 318
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 102; //@line 320
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 322
 sp = STACKTOP; //@line 323
 return;
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7151
 STACKTOP = STACKTOP + 16 | 0; //@line 7152
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7152
 $vararg_buffer = sp; //@line 7153
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 7157
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 7159
 STACKTOP = sp; //@line 7160
 return $5 | 0; //@line 7160
}
function __ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1467
 $1 = HEAP32[$0 >> 2] | 0; //@line 1468
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1469
 FUNCTION_TABLE_v[$1 & 15](); //@line 1470
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 58; //@line 1473
  sp = STACKTOP; //@line 1474
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1477
  return;
 }
}
function __ZN4mbed10TimerEvent3irqEj($0) {
 $0 = $0 | 0;
 var $5 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 731
 $5 = HEAP32[(HEAP32[$0 >> 2] | 0) + 8 >> 2] | 0; //@line 736
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 737
 FUNCTION_TABLE_vi[$5 & 255]($0); //@line 738
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 43; //@line 741
  sp = STACKTOP; //@line 742
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 745
  return;
 }
}
function _handle_interrupt_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3205
 $2 = HEAP32[1444] | 0; //@line 3206
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3207
 FUNCTION_TABLE_vii[$2 & 3]($0, $1); //@line 3208
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 96; //@line 3211
  sp = STACKTOP; //@line 3212
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3215
  return;
 }
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 6636
 STACKTOP = STACKTOP + 16 | 0; //@line 6637
 $rem = __stackBase__ | 0; //@line 6638
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 6639
 STACKTOP = __stackBase__; //@line 6640
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 6641
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 6406
 if ((ret | 0) < 8) return ret | 0; //@line 6407
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 6408
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 6409
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 6410
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 6411
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 6412
}
function ___cxa_get_globals_fast() {
 var $3 = 0, sp = 0;
 sp = STACKTOP; //@line 12265
 STACKTOP = STACKTOP + 16 | 0; //@line 12266
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12266
 if (!(_pthread_once(6512, 10) | 0)) {
  $3 = _pthread_getspecific(HEAP32[1629] | 0) | 0; //@line 12272
  STACKTOP = sp; //@line 12273
  return $3 | 0; //@line 12273
 } else {
  _abort_message(5284, sp); //@line 12275
 }
 return 0; //@line 12278
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 12433
 }
 return;
}
function __Z12turn_led3_onv() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3630
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3631
 _puts(2416) | 0; //@line 3632
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 111; //@line 3635
  sp = STACKTOP; //@line 3636
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3639
  _emscripten_asm_const_iii(2, HEAP32[1460] | 0, 1) | 0; //@line 3641
  return;
 }
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 11970
 $6 = HEAP32[$5 >> 2] | 0; //@line 11971
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 11972
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 11974
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 11976
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 11979
 return $2 | 0; //@line 11980
}
function __ZL25default_terminate_handlerv__async_cb_87($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6342
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6344
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6346
 HEAP32[$2 >> 2] = 5145; //@line 6347
 HEAP32[$2 + 4 >> 2] = $4; //@line 6349
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 6351
 _abort_message(5009, $2); //@line 6352
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 424
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 426
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 427
 _fputc(10, $2) | 0; //@line 428
 if (!___async) {
  ___async_unwind = 0; //@line 431
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 144; //@line 433
 sp = STACKTOP; //@line 434
 return;
}
function _gpio_irq_init($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0;
 if (($1 | 0) == -1) {
  $$0 = -1; //@line 3228
  return $$0 | 0; //@line 3229
 }
 HEAP32[1444] = $2; //@line 3231
 HEAP32[$0 >> 2] = $1; //@line 3232
 HEAP32[$0 + 4 >> 2] = $1; //@line 3234
 _emscripten_asm_const_iii(5, $3 | 0, $1 | 0) | 0; //@line 3235
 $$0 = 0; //@line 3236
 return $$0 | 0; //@line 3237
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 13027
 STACKTOP = STACKTOP + 16 | 0; //@line 13028
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13028
 _free($0); //@line 13030
 if (!(_pthread_setspecific(HEAP32[1629] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 13035
  return;
 } else {
  _abort_message(5383, sp); //@line 13037
 }
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3435
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 3438
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 3443
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 3446
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 545
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 556
  $$0 = 1; //@line 557
 } else {
  $$0 = 0; //@line 559
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 563
 return;
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 3268
 HEAP32[$0 >> 2] = $1; //@line 3269
 HEAP32[1445] = 1; //@line 3270
 $4 = $0; //@line 3271
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 3276
 $10 = 5784; //@line 3277
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 3279
 HEAP32[$10 + 4 >> 2] = $9; //@line 3282
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 12509
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3536
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3537
 _emscripten_sleep($0 | 0); //@line 3538
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 106; //@line 3541
  sp = STACKTOP; //@line 3542
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3545
  return;
 }
}
function _mbed_trace_default_print($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 752
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 753
 _puts($0) | 0; //@line 754
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 44; //@line 757
  sp = STACKTOP; //@line 758
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 761
  return;
 }
}
function _main__async_cb_76($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 5723
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(4) | 0; //@line 5724
 _wait_ms(-1); //@line 5725
 if (!___async) {
  ___async_unwind = 0; //@line 5728
 }
 HEAP32[$ReallocAsyncCtx10 >> 2] = 121; //@line 5730
 sp = STACKTOP; //@line 5731
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 12573
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 12577
  }
 }
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var sp = 0;
 sp = STACKTOP; //@line 13012
 STACKTOP = STACKTOP + 16 | 0; //@line 13013
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13013
 if (!(_pthread_key_create(6516, 153) | 0)) {
  STACKTOP = sp; //@line 13018
  return;
 } else {
  _abort_message(5333, sp); //@line 13020
 }
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 6670
 HEAP32[new_frame + 4 >> 2] = sp; //@line 6672
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 6674
 ___async_cur_frame = new_frame; //@line 6675
 return ___async_cur_frame + 8 | 0; //@line 6676
}
function __GLOBAL__sub_I_main_cpp__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[1438] = 0; //@line 4583
 HEAP32[1439] = 0; //@line 4583
 HEAP32[1440] = 0; //@line 4583
 HEAP32[1441] = 0; //@line 4583
 HEAP8[5768] = 1; //@line 4584
 HEAP32[1428] = 288; //@line 4585
 __ZN4mbed11InterruptInC2E7PinName(5864, 1337); //@line 4586
 return;
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 5373
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 5377
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 5380
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 6659
  return low << bits; //@line 6660
 }
 tempRet0 = low << bits - 32; //@line 6662
 return 0; //@line 6663
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 6648
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 6649
 }
 tempRet0 = 0; //@line 6651
 return high >>> bits - 32 | 0; //@line 6652
}
function _fflush__async_cb_12($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 714
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 716
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 719
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_44($0) {
 $0 = $0 | 0;
 var $6 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2576
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 2578
 _gpio_irq_set($6 + 28 | 0, 2, 1); //@line 2580
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
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 531
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 534
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 537
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 4571
 } else {
  $$0 = -1; //@line 4573
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 4576
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 7858
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 7864
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 7868
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 6925
}
function _fputc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13957
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 13958
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 13960
 return;
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 6682
 stackRestore(___async_cur_frame | 0); //@line 6683
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 6684
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2864
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 2865
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 2867
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 10969
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 10969
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 10971
 return $1 | 0; //@line 10972
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 3191
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 3197
 _emscripten_asm_const_iii(4, $0 | 0, $1 | 0) | 0; //@line 3198
 return;
}
function _gpio_init_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 3176
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 3182
 _emscripten_asm_const_iii(3, $0 | 0, $1 | 0) | 0; //@line 3183
 return;
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 7317
  $$0 = -1; //@line 7318
 } else {
  $$0 = $0; //@line 7320
 }
 return $$0 | 0; //@line 7322
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 6399
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 6400
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 6401
}
function __ZN4mbed6Ticker5setupEy($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $4 = 0;
 $4 = ___udivdi3($1 | 0, $2 | 0, 1e3, 0) | 0; //@line 3505
 _emscripten_asm_const_iii(9, $0 + 40 | 0, $4 | 0) | 0; //@line 3507
 return;
}
function __Z11toggle_led2v__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(10, HEAP32[1454] | 0) | 0) == 0 & 1; //@line 5457
 _emscripten_asm_const_iii(2, HEAP32[1454] | 0, $3 | 0) | 0; //@line 5459
 return;
}
function __Z10blink_led1v__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(10, HEAP32[1448] | 0) | 0) == 0 & 1; //@line 5390
 _emscripten_asm_const_iii(2, HEAP32[1448] | 0, $3 | 0) | 0; //@line 5392
 return;
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 6918
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
 l = a + c >>> 0; //@line 6391
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 6393
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 6911
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 10029
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 10032
 }
 return $$0 | 0; //@line 10034
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 8003
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 8008
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 6883
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 6628
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 7498
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 7502
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 4854
 return;
}
function _gpio_irq_set($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 _emscripten_asm_const_iiii(7, HEAP32[$0 + 4 >> 2] | 0, $1 | 0, $2 | 0) | 0; //@line 3258
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 6689
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 6690
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_47($0) {
 $0 = $0 | 0;
 _gpio_irq_set((HEAP32[$0 + 8 >> 2] | 0) + 28 | 0, 2, 0); //@line 2691
 return;
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 13112
 __ZdlPv($0); //@line 13113
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 12795
 __ZdlPv($0); //@line 12796
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 7994
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 7996
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 12323
 __ZdlPv($0); //@line 12324
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
 HEAP32[HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 4 >> 2] >> 2] = HEAP32[$0 + 8 >> 2]; //@line 5509
 return;
}
function _out_670($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 if (!(HEAP32[$0 >> 2] & 32)) {
  ___fwritex($1, $2, $0) | 0; //@line 9514
 }
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 4556
 return;
}
function b113(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 7244
}
function __ZN4mbed8CallbackIFvvEE13function_moveIPS1_EEvPvPKv($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = HEAP32[$1 >> 2]; //@line 1487
 return;
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 12520
}
function __ZSt13get_terminatev() {
 var $0 = 0;
 $0 = HEAP32[272] | 0; //@line 13102
 HEAP32[272] = $0 + 0; //@line 13104
 return $0 | 0; //@line 13106
}
function _gpio_irq_free($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iii(6, HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 3247
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
 FUNCTION_TABLE_vii[index & 3](a1 | 0, a2 | 0); //@line 6904
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
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 6716
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_27($0) {
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
 nullFunc_viiiii(0); //@line 7241
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __Z12turn_led3_onv__async_cb($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iii(2, HEAP32[1460] | 0, 1) | 0; //@line 5447
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 9977
}
function _snprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 5431
 return;
}
function _fputc__async_cb_1($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 13970
 return;
}
function _fflush__async_cb_13($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 729
 return;
}
function _putc__async_cb_49($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 2877
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 6876
}
function __ZN4mbed11InterruptInD0Ev__async_cb_28($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 2114
 return;
}
function b8(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 6944
 return 0; //@line 6944
}
function b7(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 6941
 return 0; //@line 6941
}
function b6(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 6938
 return 0; //@line 6938
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(5436, HEAP32[$0 + 4 >> 2] | 0); //@line 6287
}
function __ZN4mbed6Ticker6detachEv($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_ii(8, $0 + 40 | 0) | 0; //@line 3515
 return;
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 255](a1 | 0); //@line 6897
}
function b109(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 7238
}
function __ZN4mbed7TimeoutD0Ev__async_cb_70($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 5419
 return;
}
function __ZN4mbed6TickerD0Ev__async_cb_5($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 332
 return;
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 11222
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_63($0) {
 $0 = $0 | 0;
 return;
}
function _main__async_cb_83($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 6020
 return;
}
function dynCall_i(index) {
 index = index | 0;
 return FUNCTION_TABLE_i[index & 3]() | 0; //@line 6869
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
 FUNCTION_TABLE_v[index & 15](); //@line 6890
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 7375
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIPS1_EEvPv($0) {
 $0 = $0 | 0;
 return;
}
function b4(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 6935
 return 0; //@line 6935
}
function b107(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(3); //@line 7235
}
function b106(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(0); //@line 7232
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
 _llvm_trap(); //@line 703
}
function ___ofl_lock() {
 ___lock(6500); //@line 8013
 return 6508; //@line 8014
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
function _abort_message__async_cb_7($0) {
 $0 = $0 | 0;
 _abort(); //@line 441
}
function ___cxa_pure_virtual__wrapper() {
 ___cxa_pure_virtual(); //@line 6950
}
function __ZN4mbed7Timeout7handlerEv__async_cb_73($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed11InterruptInD2Ev__async_cb_9($0) {
 $0 = $0 | 0;
 return;
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 11143
}
function __ZN4mbed10TimerEvent3irqEj__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 11149
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
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 12149
 return;
}
function __ZN4mbed7TimeoutD2Ev__async_cb_8($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6TickerD2Ev__async_cb_26($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_69($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_68($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_65($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_64($0) {
 $0 = $0 | 0;
 return;
}
function _mbed_assert_internal__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b2() {
 nullFunc_i(3); //@line 6932
 return 0; //@line 6932
}
function b1() {
 nullFunc_i(0); //@line 6929
 return 0; //@line 6929
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
 ___unlock(6500); //@line 8019
 return;
}
function b104(p0) {
 p0 = p0 | 0;
 nullFunc_vi(255); //@line 7229
}
function b103(p0) {
 p0 = p0 | 0;
 nullFunc_vi(254); //@line 7226
}
function b102(p0) {
 p0 = p0 | 0;
 nullFunc_vi(253); //@line 7223
}
function b101(p0) {
 p0 = p0 | 0;
 nullFunc_vi(252); //@line 7220
}
function b100(p0) {
 p0 = p0 | 0;
 nullFunc_vi(251); //@line 7217
}
function b99(p0) {
 p0 = p0 | 0;
 nullFunc_vi(250); //@line 7214
}
function b98(p0) {
 p0 = p0 | 0;
 nullFunc_vi(249); //@line 7211
}
function b97(p0) {
 p0 = p0 | 0;
 nullFunc_vi(248); //@line 7208
}
function b96(p0) {
 p0 = p0 | 0;
 nullFunc_vi(247); //@line 7205
}
function b95(p0) {
 p0 = p0 | 0;
 nullFunc_vi(246); //@line 7202
}
function b94(p0) {
 p0 = p0 | 0;
 nullFunc_vi(245); //@line 7199
}
function b93(p0) {
 p0 = p0 | 0;
 nullFunc_vi(244); //@line 7196
}
function b92(p0) {
 p0 = p0 | 0;
 nullFunc_vi(243); //@line 7193
}
function b91(p0) {
 p0 = p0 | 0;
 nullFunc_vi(242); //@line 7190
}
function b90(p0) {
 p0 = p0 | 0;
 nullFunc_vi(241); //@line 7187
}
function b89(p0) {
 p0 = p0 | 0;
 nullFunc_vi(240); //@line 7184
}
function b88(p0) {
 p0 = p0 | 0;
 nullFunc_vi(239); //@line 7181
}
function b87(p0) {
 p0 = p0 | 0;
 nullFunc_vi(238); //@line 7178
}
function b86(p0) {
 p0 = p0 | 0;
 nullFunc_vi(237); //@line 7175
}
function b85(p0) {
 p0 = p0 | 0;
 nullFunc_vi(236); //@line 7172
}
function b84(p0) {
 p0 = p0 | 0;
 nullFunc_vi(235); //@line 7169
}
function b83(p0) {
 p0 = p0 | 0;
 nullFunc_vi(234); //@line 7166
}
function b82(p0) {
 p0 = p0 | 0;
 nullFunc_vi(233); //@line 7163
}
function b81(p0) {
 p0 = p0 | 0;
 nullFunc_vi(232); //@line 7160
}
function b80(p0) {
 p0 = p0 | 0;
 nullFunc_vi(231); //@line 7157
}
function b79(p0) {
 p0 = p0 | 0;
 nullFunc_vi(230); //@line 7154
}
function b78(p0) {
 p0 = p0 | 0;
 nullFunc_vi(229); //@line 7151
}
function b77(p0) {
 p0 = p0 | 0;
 nullFunc_vi(228); //@line 7148
}
function b76(p0) {
 p0 = p0 | 0;
 nullFunc_vi(227); //@line 7145
}
function b75(p0) {
 p0 = p0 | 0;
 nullFunc_vi(226); //@line 7142
}
function b74(p0) {
 p0 = p0 | 0;
 nullFunc_vi(225); //@line 7139
}
function b73(p0) {
 p0 = p0 | 0;
 nullFunc_vi(224); //@line 7136
}
function b72(p0) {
 p0 = p0 | 0;
 nullFunc_vi(223); //@line 7133
}
function b71(p0) {
 p0 = p0 | 0;
 nullFunc_vi(222); //@line 7130
}
function b70(p0) {
 p0 = p0 | 0;
 nullFunc_vi(221); //@line 7127
}
function b69(p0) {
 p0 = p0 | 0;
 nullFunc_vi(220); //@line 7124
}
function b68(p0) {
 p0 = p0 | 0;
 nullFunc_vi(219); //@line 7121
}
function b67(p0) {
 p0 = p0 | 0;
 nullFunc_vi(218); //@line 7118
}
function b66(p0) {
 p0 = p0 | 0;
 nullFunc_vi(217); //@line 7115
}
function b65(p0) {
 p0 = p0 | 0;
 nullFunc_vi(216); //@line 7112
}
function b64(p0) {
 p0 = p0 | 0;
 nullFunc_vi(215); //@line 7109
}
function b63(p0) {
 p0 = p0 | 0;
 nullFunc_vi(214); //@line 7106
}
function b62(p0) {
 p0 = p0 | 0;
 nullFunc_vi(213); //@line 7103
}
function b61(p0) {
 p0 = p0 | 0;
 nullFunc_vi(212); //@line 7100
}
function b60(p0) {
 p0 = p0 | 0;
 nullFunc_vi(211); //@line 7097
}
function b59(p0) {
 p0 = p0 | 0;
 nullFunc_vi(210); //@line 7094
}
function b58(p0) {
 p0 = p0 | 0;
 nullFunc_vi(209); //@line 7091
}
function b57(p0) {
 p0 = p0 | 0;
 nullFunc_vi(208); //@line 7088
}
function b56(p0) {
 p0 = p0 | 0;
 nullFunc_vi(207); //@line 7085
}
function b55(p0) {
 p0 = p0 | 0;
 nullFunc_vi(206); //@line 7082
}
function b54(p0) {
 p0 = p0 | 0;
 nullFunc_vi(205); //@line 7079
}
function b53(p0) {
 p0 = p0 | 0;
 nullFunc_vi(204); //@line 7076
}
function b52(p0) {
 p0 = p0 | 0;
 nullFunc_vi(203); //@line 7073
}
function b51(p0) {
 p0 = p0 | 0;
 nullFunc_vi(202); //@line 7070
}
function b50(p0) {
 p0 = p0 | 0;
 nullFunc_vi(201); //@line 7067
}
function b49(p0) {
 p0 = p0 | 0;
 nullFunc_vi(200); //@line 7064
}
function b48(p0) {
 p0 = p0 | 0;
 nullFunc_vi(199); //@line 7061
}
function b47(p0) {
 p0 = p0 | 0;
 nullFunc_vi(198); //@line 7058
}
function b46(p0) {
 p0 = p0 | 0;
 nullFunc_vi(197); //@line 7055
}
function b45(p0) {
 p0 = p0 | 0;
 nullFunc_vi(196); //@line 7052
}
function b44(p0) {
 p0 = p0 | 0;
 nullFunc_vi(195); //@line 7049
}
function b43(p0) {
 p0 = p0 | 0;
 nullFunc_vi(194); //@line 7046
}
function b42(p0) {
 p0 = p0 | 0;
 nullFunc_vi(193); //@line 7043
}
function b41(p0) {
 p0 = p0 | 0;
 nullFunc_vi(192); //@line 7040
}
function b40(p0) {
 p0 = p0 | 0;
 nullFunc_vi(191); //@line 7037
}
function b39(p0) {
 p0 = p0 | 0;
 nullFunc_vi(190); //@line 7034
}
function b38(p0) {
 p0 = p0 | 0;
 nullFunc_vi(189); //@line 7031
}
function b37(p0) {
 p0 = p0 | 0;
 nullFunc_vi(188); //@line 7028
}
function b36(p0) {
 p0 = p0 | 0;
 nullFunc_vi(187); //@line 7025
}
function b35(p0) {
 p0 = p0 | 0;
 nullFunc_vi(186); //@line 7022
}
function b34(p0) {
 p0 = p0 | 0;
 nullFunc_vi(185); //@line 7019
}
function b33(p0) {
 p0 = p0 | 0;
 nullFunc_vi(184); //@line 7016
}
function b32(p0) {
 p0 = p0 | 0;
 nullFunc_vi(183); //@line 7013
}
function b31(p0) {
 p0 = p0 | 0;
 nullFunc_vi(182); //@line 7010
}
function b30(p0) {
 p0 = p0 | 0;
 nullFunc_vi(181); //@line 7007
}
function b29(p0) {
 p0 = p0 | 0;
 nullFunc_vi(180); //@line 7004
}
function b28(p0) {
 p0 = p0 | 0;
 nullFunc_vi(179); //@line 7001
}
function b27(p0) {
 p0 = p0 | 0;
 nullFunc_vi(178); //@line 6998
}
function b26(p0) {
 p0 = p0 | 0;
 nullFunc_vi(177); //@line 6995
}
function b25(p0) {
 p0 = p0 | 0;
 nullFunc_vi(176); //@line 6992
}
function b24(p0) {
 p0 = p0 | 0;
 nullFunc_vi(175); //@line 6989
}
function b23(p0) {
 p0 = p0 | 0;
 nullFunc_vi(174); //@line 6986
}
function b22(p0) {
 p0 = p0 | 0;
 nullFunc_vi(173); //@line 6983
}
function b21(p0) {
 p0 = p0 | 0;
 nullFunc_vi(172); //@line 6980
}
function b20(p0) {
 p0 = p0 | 0;
 nullFunc_vi(171); //@line 6977
}
function b19(p0) {
 p0 = p0 | 0;
 nullFunc_vi(170); //@line 6974
}
function b18(p0) {
 p0 = p0 | 0;
 nullFunc_vi(169); //@line 6971
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 7333
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 7650
}
function b17(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 6968
}
function _us_ticker_set_interrupt($0) {
 $0 = $0 | 0;
 return;
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _initialize__async_cb_57($0) {
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
 return 452; //@line 3531
}
function _get_us_ticker_data() {
 return 396; //@line 2717
}
function __ZSt9terminatev__async_cb_11($0) {
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
 return 6496; //@line 7327
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
 return 0; //@line 3322
}
function _pthread_self() {
 return 720; //@line 7380
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
 nullFunc_v(15); //@line 6965
}
function b14() {
 nullFunc_v(14); //@line 6962
}
function b13() {
 nullFunc_v(13); //@line 6959
}
function b12() {
 nullFunc_v(12); //@line 6956
}
function b11() {
 nullFunc_v(11); //@line 6953
}
function b10() {
 nullFunc_v(0); //@line 6947
}
function _us_ticker_init() {
 return;
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_i = [b1,_us_ticker_read,_us_ticker_get_info,b2];
var FUNCTION_TABLE_ii = [b4,___stdio_close];
var FUNCTION_TABLE_iiii = [b6,___stdio_write,___stdio_seek,___stdout_write,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b7,b8];
var FUNCTION_TABLE_v = [b10,___cxa_pure_virtual__wrapper,_us_ticker_init,_us_ticker_disable_interrupt,_us_ticker_clear_interrupt,_us_ticker_fire_interrupt,__ZL25default_terminate_handlerv,__Z10blink_led1v,__Z12turn_led3_onv,__Z11toggle_led2v,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev,b11,b12,b13,b14,b15];
var FUNCTION_TABLE_vi = [b17,__ZN4mbed11InterruptInD2Ev,__ZN4mbed11InterruptInD0Ev,__ZN4mbed7TimeoutD2Ev,__ZN4mbed7TimeoutD0Ev,__ZN4mbed7Timeout7handlerEv,__ZN4mbed10TimerEventD2Ev,__ZN4mbed10TimerEventD0Ev,_mbed_trace_default_print,__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv,__ZN4mbed8CallbackIFvvEE13function_dtorIPS1_EEvPv,_us_ticker_set_interrupt,__ZN4mbed6TickerD2Ev,__ZN4mbed6TickerD0Ev,__ZN4mbed6Ticker7handlerEv,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed11InterruptInD2Ev__async_cb,__ZN4mbed11InterruptInD2Ev__async_cb_9,__ZN4mbed11InterruptInD0Ev__async_cb,__ZN4mbed11InterruptInD0Ev__async_cb_28,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_63,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_44
,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_45,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_46,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_47,__ZN4mbed7TimeoutD2Ev__async_cb,__ZN4mbed7TimeoutD2Ev__async_cb_8,__ZN4mbed7TimeoutD0Ev__async_cb,__ZN4mbed7TimeoutD0Ev__async_cb_70,__ZN4mbed7Timeout7handlerEv__async_cb,__ZN4mbed7Timeout7handlerEv__async_cb_74,__ZN4mbed7Timeout7handlerEv__async_cb_72,__ZN4mbed7Timeout7handlerEv__async_cb_73,__ZN4mbed10TimerEventD2Ev__async_cb,__ZN4mbed10TimerEvent3irqEj,__ZN4mbed10TimerEventC2Ev__async_cb,__ZN4mbed10TimerEvent3irqEj__async_cb,_mbed_trace_default_print__async_cb,_mbed_tracef__async_cb,_mbed_vtracef__async_cb,_mbed_vtracef__async_cb_25,_mbed_vtracef__async_cb_15,_mbed_vtracef__async_cb_16,_mbed_vtracef__async_cb_17,_mbed_vtracef__async_cb_24,_mbed_vtracef__async_cb_18,_mbed_vtracef__async_cb_23,_mbed_vtracef__async_cb_19,_mbed_vtracef__async_cb_20,_mbed_vtracef__async_cb_21,_mbed_vtracef__async_cb_22,__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv__async_cb
,_ticker_set_handler__async_cb,_initialize__async_cb,_initialize__async_cb_54,_initialize__async_cb_59,_initialize__async_cb_58,_initialize__async_cb_55,_initialize__async_cb_56,_initialize__async_cb_57,_schedule_interrupt__async_cb,_schedule_interrupt__async_cb_64,_schedule_interrupt__async_cb_65,_schedule_interrupt__async_cb_66,_schedule_interrupt__async_cb_67,_schedule_interrupt__async_cb_68,_schedule_interrupt__async_cb_69,_ticker_remove_event__async_cb,_mbed_assert_internal__async_cb,_mbed_die__async_cb_43,_mbed_die__async_cb_42,_mbed_die__async_cb_41,_mbed_die__async_cb_40,_mbed_die__async_cb_39,_mbed_die__async_cb_38,_mbed_die__async_cb_37,_mbed_die__async_cb_36,_mbed_die__async_cb_35,_mbed_die__async_cb_34,_mbed_die__async_cb_33,_mbed_die__async_cb_32,_mbed_die__async_cb_31
,_mbed_die__async_cb_30,_mbed_die__async_cb_29,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_vfprintf__async_cb,_mbed_error_vfprintf__async_cb_86,_mbed_error_vfprintf__async_cb_85,_handle_interrupt_in__async_cb,_serial_putc__async_cb_71,_serial_putc__async_cb,__ZN4mbed6TickerD2Ev__async_cb,__ZN4mbed6TickerD2Ev__async_cb_26,__ZN4mbed6TickerD0Ev__async_cb,__ZN4mbed6TickerD0Ev__async_cb_5,__ZN4mbed6Ticker7handlerEv__async_cb,_invoke_ticker__async_cb_84,_invoke_ticker__async_cb,_wait_ms__async_cb,__GLOBAL__sub_I_main_cpp__async_cb_60,__GLOBAL__sub_I_main_cpp__async_cb,__Z10blink_led1v__async_cb,__Z11toggle_led2v__async_cb,__Z12turn_led3_onv__async_cb,_main__async_cb_79,_main__async_cb_78,_main__async_cb_77,_main__async_cb_81,_main__async_cb,_main__async_cb_80,_main__async_cb_75
,_main__async_cb_82,_main__async_cb_76,_main__async_cb_83,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_2,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_3,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_4,_putc__async_cb_49,_putc__async_cb,___overflow__async_cb,_fflush__async_cb_13,_fflush__async_cb_12,_fflush__async_cb_14,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_6,_vfprintf__async_cb,_snprintf__async_cb,_vsnprintf__async_cb,_fputc__async_cb_1,_fputc__async_cb,_puts__async_cb,__ZL25default_terminate_handlerv__async_cb,__ZL25default_terminate_handlerv__async_cb_87,_abort_message__async_cb,_abort_message__async_cb_7,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_10,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_62
,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_27,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_61,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_53,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_52,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_51,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_50,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_48,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b18,b19,b20,b21,b22,b23,b24,b25,b26,b27
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
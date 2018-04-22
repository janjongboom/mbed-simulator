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

STATICTOP = STATIC_BASE + 7136;
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
var debug_table_vi = ["0", "__ZN4mbed11InterruptInD2Ev", "__ZN4mbed11InterruptInD0Ev", "__ZN4mbed7TimeoutD2Ev", "__ZN4mbed7TimeoutD0Ev", "__ZN4mbed7Timeout7handlerEv", "__ZN4mbed10TimerEventD2Ev", "__ZN4mbed10TimerEventD0Ev", "_us_ticker_set_interrupt", "__ZN4mbed10TimerEvent3irqEj", "__ZN4mbed6TickerD2Ev", "__ZN4mbed6TickerD0Ev", "__ZN4mbed6Ticker7handlerEv", "__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv", "__ZN4mbed8CallbackIFvvEE13function_dtorIPS1_EEvPv", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "__ZN10__cxxabiv121__vmi_class_type_infoD0Ev", "__ZN4mbed11InterruptInD2Ev__async_cb", "__ZN4mbed11InterruptInD2Ev__async_cb_49", "__ZN4mbed11InterruptInD0Ev__async_cb", "__ZN4mbed11InterruptInD0Ev__async_cb_43", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_65", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_50", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_51", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_52", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_53", "__ZN4mbed7TimeoutD2Ev__async_cb", "__ZN4mbed7TimeoutD2Ev__async_cb_40", "__ZN4mbed7TimeoutD0Ev__async_cb", "__ZN4mbed7TimeoutD0Ev__async_cb_18", "__ZN4mbed7Timeout7handlerEv__async_cb_5", "__ZN4mbed7Timeout7handlerEv__async_cb", "__ZN4mbed10TimerEventD2Ev__async_cb", "__ZN4mbed10TimerEventC2Ev__async_cb", "__ZN4mbed10TimerEvent3irqEj__async_cb", "_ticker_set_handler__async_cb", "_initialize__async_cb", "_initialize__async_cb_66", "_initialize__async_cb_71", "_initialize__async_cb_70", "_initialize__async_cb_67", "_initialize__async_cb_68", "_initialize__async_cb_69", "_schedule_interrupt__async_cb", "_schedule_interrupt__async_cb_55", "_schedule_interrupt__async_cb_56", "_schedule_interrupt__async_cb_57", "_schedule_interrupt__async_cb_58", "_schedule_interrupt__async_cb_59", "_schedule_interrupt__async_cb_60", "_ticker_remove_event__async_cb", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_34", "_mbed_die__async_cb_33", "_mbed_die__async_cb_32", "_mbed_die__async_cb_31", "_mbed_die__async_cb_30", "_mbed_die__async_cb_29", "_mbed_die__async_cb_28", "_mbed_die__async_cb_27", "_mbed_die__async_cb_26", "_mbed_die__async_cb_25", "_mbed_die__async_cb_24", "_mbed_die__async_cb_23", "_mbed_die__async_cb_22", "_mbed_die__async_cb_21", "_mbed_die__async_cb_20", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_printf__async_cb_64", "_handle_interrupt_in__async_cb", "_serial_putc__async_cb_8", "_serial_putc__async_cb", "__ZN4mbed6TickerD2Ev__async_cb", "__ZN4mbed6TickerD2Ev__async_cb_72", "__ZN4mbed6TickerD0Ev__async_cb", "__ZN4mbed6TickerD0Ev__async_cb_7", "__ZN4mbed6Ticker7handlerEv__async_cb", "_invoke_ticker__async_cb_41", "_invoke_ticker__async_cb", "__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv__async_cb", "_wait_ms__async_cb", "__GLOBAL__sub_I_main_cpp__async_cb_62", "__GLOBAL__sub_I_main_cpp__async_cb", "__Z10blink_led1v__async_cb", "__Z11toggle_led2v__async_cb", "__Z12turn_led3_onv__async_cb", "_main__async_cb_13", "_main__async_cb_12", "_main__async_cb_11", "_main__async_cb_15", "_main__async_cb", "_main__async_cb_14", "_main__async_cb_9", "_main__async_cb_16", "_main__async_cb_10", "_main__async_cb_17", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_2", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_3", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_4", "_putc__async_cb_42", "_putc__async_cb", "___overflow__async_cb", "_fflush__async_cb_47", "_fflush__async_cb_46", "_fflush__async_cb_48", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_61", "_vfprintf__async_cb", "_vsnprintf__async_cb", "_fputc__async_cb_1", "_fputc__async_cb", "_puts__async_cb", "__ZL25default_terminate_handlerv__async_cb", "__ZL25default_terminate_handlerv__async_cb_63", "_abort_message__async_cb", "_abort_message__async_cb_35", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_6", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_73", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_54", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv", "__ZSt11__terminatePFvvE__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_19", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_39", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_38", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_37", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_36", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_44", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
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
 sp = STACKTOP; //@line 2768
 STACKTOP = STACKTOP + 16 | 0; //@line 2769
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2769
 $1 = sp; //@line 2770
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 2777
   $7 = $6 >>> 3; //@line 2778
   $8 = HEAP32[1376] | 0; //@line 2779
   $9 = $8 >>> $7; //@line 2780
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 2786
    $16 = 5544 + ($14 << 1 << 2) | 0; //@line 2788
    $17 = $16 + 8 | 0; //@line 2789
    $18 = HEAP32[$17 >> 2] | 0; //@line 2790
    $19 = $18 + 8 | 0; //@line 2791
    $20 = HEAP32[$19 >> 2] | 0; //@line 2792
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1376] = $8 & ~(1 << $14); //@line 2799
     } else {
      if ((HEAP32[1380] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 2804
      }
      $27 = $20 + 12 | 0; //@line 2807
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 2811
       HEAP32[$17 >> 2] = $20; //@line 2812
       break;
      } else {
       _abort(); //@line 2815
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 2820
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 2823
    $34 = $18 + $30 + 4 | 0; //@line 2825
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 2828
    $$0 = $19; //@line 2829
    STACKTOP = sp; //@line 2830
    return $$0 | 0; //@line 2830
   }
   $37 = HEAP32[1378] | 0; //@line 2832
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 2838
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 2841
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 2844
     $49 = $47 >>> 12 & 16; //@line 2846
     $50 = $47 >>> $49; //@line 2847
     $52 = $50 >>> 5 & 8; //@line 2849
     $54 = $50 >>> $52; //@line 2851
     $56 = $54 >>> 2 & 4; //@line 2853
     $58 = $54 >>> $56; //@line 2855
     $60 = $58 >>> 1 & 2; //@line 2857
     $62 = $58 >>> $60; //@line 2859
     $64 = $62 >>> 1 & 1; //@line 2861
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 2864
     $69 = 5544 + ($67 << 1 << 2) | 0; //@line 2866
     $70 = $69 + 8 | 0; //@line 2867
     $71 = HEAP32[$70 >> 2] | 0; //@line 2868
     $72 = $71 + 8 | 0; //@line 2869
     $73 = HEAP32[$72 >> 2] | 0; //@line 2870
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 2876
       HEAP32[1376] = $77; //@line 2877
       $98 = $77; //@line 2878
      } else {
       if ((HEAP32[1380] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 2883
       }
       $80 = $73 + 12 | 0; //@line 2886
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 2890
        HEAP32[$70 >> 2] = $73; //@line 2891
        $98 = $8; //@line 2892
        break;
       } else {
        _abort(); //@line 2895
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 2900
     $84 = $83 - $6 | 0; //@line 2901
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 2904
     $87 = $71 + $6 | 0; //@line 2905
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 2908
     HEAP32[$71 + $83 >> 2] = $84; //@line 2910
     if ($37 | 0) {
      $92 = HEAP32[1381] | 0; //@line 2913
      $93 = $37 >>> 3; //@line 2914
      $95 = 5544 + ($93 << 1 << 2) | 0; //@line 2916
      $96 = 1 << $93; //@line 2917
      if (!($98 & $96)) {
       HEAP32[1376] = $98 | $96; //@line 2922
       $$0199 = $95; //@line 2924
       $$pre$phiZ2D = $95 + 8 | 0; //@line 2924
      } else {
       $101 = $95 + 8 | 0; //@line 2926
       $102 = HEAP32[$101 >> 2] | 0; //@line 2927
       if ((HEAP32[1380] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 2931
       } else {
        $$0199 = $102; //@line 2934
        $$pre$phiZ2D = $101; //@line 2934
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 2937
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 2939
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 2941
      HEAP32[$92 + 12 >> 2] = $95; //@line 2943
     }
     HEAP32[1378] = $84; //@line 2945
     HEAP32[1381] = $87; //@line 2946
     $$0 = $72; //@line 2947
     STACKTOP = sp; //@line 2948
     return $$0 | 0; //@line 2948
    }
    $108 = HEAP32[1377] | 0; //@line 2950
    if (!$108) {
     $$0197 = $6; //@line 2953
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 2957
     $114 = $112 >>> 12 & 16; //@line 2959
     $115 = $112 >>> $114; //@line 2960
     $117 = $115 >>> 5 & 8; //@line 2962
     $119 = $115 >>> $117; //@line 2964
     $121 = $119 >>> 2 & 4; //@line 2966
     $123 = $119 >>> $121; //@line 2968
     $125 = $123 >>> 1 & 2; //@line 2970
     $127 = $123 >>> $125; //@line 2972
     $129 = $127 >>> 1 & 1; //@line 2974
     $134 = HEAP32[5808 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 2979
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 2983
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2989
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 2992
      $$0193$lcssa$i = $138; //@line 2992
     } else {
      $$01926$i = $134; //@line 2994
      $$01935$i = $138; //@line 2994
      $146 = $143; //@line 2994
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 2999
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 3000
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 3001
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 3002
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 3008
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 3011
        $$0193$lcssa$i = $$$0193$i; //@line 3011
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 3014
        $$01935$i = $$$0193$i; //@line 3014
       }
      }
     }
     $157 = HEAP32[1380] | 0; //@line 3018
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 3021
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 3024
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 3027
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 3031
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 3033
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 3037
       $176 = HEAP32[$175 >> 2] | 0; //@line 3038
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 3041
        $179 = HEAP32[$178 >> 2] | 0; //@line 3042
        if (!$179) {
         $$3$i = 0; //@line 3045
         break;
        } else {
         $$1196$i = $179; //@line 3048
         $$1198$i = $178; //@line 3048
        }
       } else {
        $$1196$i = $176; //@line 3051
        $$1198$i = $175; //@line 3051
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 3054
        $182 = HEAP32[$181 >> 2] | 0; //@line 3055
        if ($182 | 0) {
         $$1196$i = $182; //@line 3058
         $$1198$i = $181; //@line 3058
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 3061
        $185 = HEAP32[$184 >> 2] | 0; //@line 3062
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 3067
         $$1198$i = $184; //@line 3067
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 3072
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 3075
        $$3$i = $$1196$i; //@line 3076
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 3081
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 3084
       }
       $169 = $167 + 12 | 0; //@line 3087
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 3091
       }
       $172 = $164 + 8 | 0; //@line 3094
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 3098
        HEAP32[$172 >> 2] = $167; //@line 3099
        $$3$i = $164; //@line 3100
        break;
       } else {
        _abort(); //@line 3103
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 3112
       $191 = 5808 + ($190 << 2) | 0; //@line 3113
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 3118
         if (!$$3$i) {
          HEAP32[1377] = $108 & ~(1 << $190); //@line 3124
          break L73;
         }
        } else {
         if ((HEAP32[1380] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 3131
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 3139
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1380] | 0; //@line 3149
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 3152
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 3156
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 3158
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 3164
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 3168
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 3170
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 3176
       if ($214 | 0) {
        if ((HEAP32[1380] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 3182
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 3186
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 3188
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 3196
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 3199
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 3201
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 3204
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 3208
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 3211
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 3213
      if ($37 | 0) {
       $234 = HEAP32[1381] | 0; //@line 3216
       $235 = $37 >>> 3; //@line 3217
       $237 = 5544 + ($235 << 1 << 2) | 0; //@line 3219
       $238 = 1 << $235; //@line 3220
       if (!($8 & $238)) {
        HEAP32[1376] = $8 | $238; //@line 3225
        $$0189$i = $237; //@line 3227
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 3227
       } else {
        $242 = $237 + 8 | 0; //@line 3229
        $243 = HEAP32[$242 >> 2] | 0; //@line 3230
        if ((HEAP32[1380] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 3234
        } else {
         $$0189$i = $243; //@line 3237
         $$pre$phi$iZ2D = $242; //@line 3237
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 3240
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 3242
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 3244
       HEAP32[$234 + 12 >> 2] = $237; //@line 3246
      }
      HEAP32[1378] = $$0193$lcssa$i; //@line 3248
      HEAP32[1381] = $159; //@line 3249
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 3252
     STACKTOP = sp; //@line 3253
     return $$0 | 0; //@line 3253
    }
   } else {
    $$0197 = $6; //@line 3256
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 3261
   } else {
    $251 = $0 + 11 | 0; //@line 3263
    $252 = $251 & -8; //@line 3264
    $253 = HEAP32[1377] | 0; //@line 3265
    if (!$253) {
     $$0197 = $252; //@line 3268
    } else {
     $255 = 0 - $252 | 0; //@line 3270
     $256 = $251 >>> 8; //@line 3271
     if (!$256) {
      $$0358$i = 0; //@line 3274
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 3278
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 3282
       $262 = $256 << $261; //@line 3283
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 3286
       $267 = $262 << $265; //@line 3288
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 3291
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 3296
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 3302
      }
     }
     $282 = HEAP32[5808 + ($$0358$i << 2) >> 2] | 0; //@line 3306
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 3310
       $$3$i203 = 0; //@line 3310
       $$3350$i = $255; //@line 3310
       label = 81; //@line 3311
      } else {
       $$0342$i = 0; //@line 3318
       $$0347$i = $255; //@line 3318
       $$0353$i = $282; //@line 3318
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 3318
       $$0362$i = 0; //@line 3318
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 3323
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 3328
          $$435113$i = 0; //@line 3328
          $$435712$i = $$0353$i; //@line 3328
          label = 85; //@line 3329
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 3332
          $$1348$i = $292; //@line 3332
         }
        } else {
         $$1343$i = $$0342$i; //@line 3335
         $$1348$i = $$0347$i; //@line 3335
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 3338
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 3341
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 3345
        $302 = ($$0353$i | 0) == 0; //@line 3346
        if ($302) {
         $$2355$i = $$1363$i; //@line 3351
         $$3$i203 = $$1343$i; //@line 3351
         $$3350$i = $$1348$i; //@line 3351
         label = 81; //@line 3352
         break;
        } else {
         $$0342$i = $$1343$i; //@line 3355
         $$0347$i = $$1348$i; //@line 3355
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 3355
         $$0362$i = $$1363$i; //@line 3355
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 3365
       $309 = $253 & ($306 | 0 - $306); //@line 3368
       if (!$309) {
        $$0197 = $252; //@line 3371
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 3376
       $315 = $313 >>> 12 & 16; //@line 3378
       $316 = $313 >>> $315; //@line 3379
       $318 = $316 >>> 5 & 8; //@line 3381
       $320 = $316 >>> $318; //@line 3383
       $322 = $320 >>> 2 & 4; //@line 3385
       $324 = $320 >>> $322; //@line 3387
       $326 = $324 >>> 1 & 2; //@line 3389
       $328 = $324 >>> $326; //@line 3391
       $330 = $328 >>> 1 & 1; //@line 3393
       $$4$ph$i = 0; //@line 3399
       $$4357$ph$i = HEAP32[5808 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 3399
      } else {
       $$4$ph$i = $$3$i203; //@line 3401
       $$4357$ph$i = $$2355$i; //@line 3401
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 3405
       $$4351$lcssa$i = $$3350$i; //@line 3405
      } else {
       $$414$i = $$4$ph$i; //@line 3407
       $$435113$i = $$3350$i; //@line 3407
       $$435712$i = $$4357$ph$i; //@line 3407
       label = 85; //@line 3408
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 3413
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 3417
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 3418
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 3419
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 3420
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 3426
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 3429
        $$4351$lcssa$i = $$$4351$i; //@line 3429
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 3432
        $$435113$i = $$$4351$i; //@line 3432
        label = 85; //@line 3433
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 3439
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1378] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1380] | 0; //@line 3445
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 3448
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 3451
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 3454
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 3458
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 3460
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 3464
         $371 = HEAP32[$370 >> 2] | 0; //@line 3465
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 3468
          $374 = HEAP32[$373 >> 2] | 0; //@line 3469
          if (!$374) {
           $$3372$i = 0; //@line 3472
           break;
          } else {
           $$1370$i = $374; //@line 3475
           $$1374$i = $373; //@line 3475
          }
         } else {
          $$1370$i = $371; //@line 3478
          $$1374$i = $370; //@line 3478
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 3481
          $377 = HEAP32[$376 >> 2] | 0; //@line 3482
          if ($377 | 0) {
           $$1370$i = $377; //@line 3485
           $$1374$i = $376; //@line 3485
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 3488
          $380 = HEAP32[$379 >> 2] | 0; //@line 3489
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 3494
           $$1374$i = $379; //@line 3494
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 3499
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 3502
          $$3372$i = $$1370$i; //@line 3503
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 3508
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 3511
         }
         $364 = $362 + 12 | 0; //@line 3514
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 3518
         }
         $367 = $359 + 8 | 0; //@line 3521
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 3525
          HEAP32[$367 >> 2] = $362; //@line 3526
          $$3372$i = $359; //@line 3527
          break;
         } else {
          _abort(); //@line 3530
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 3538
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 3541
         $386 = 5808 + ($385 << 2) | 0; //@line 3542
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 3547
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 3552
            HEAP32[1377] = $391; //@line 3553
            $475 = $391; //@line 3554
            break L164;
           }
          } else {
           if ((HEAP32[1380] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 3561
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 3569
            if (!$$3372$i) {
             $475 = $253; //@line 3572
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1380] | 0; //@line 3580
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 3583
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 3587
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 3589
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 3595
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 3599
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 3601
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 3607
         if (!$409) {
          $475 = $253; //@line 3610
         } else {
          if ((HEAP32[1380] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 3615
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 3619
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 3621
           $475 = $253; //@line 3622
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 3631
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 3634
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 3636
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 3639
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 3643
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 3646
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 3648
         $428 = $$4351$lcssa$i >>> 3; //@line 3649
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 5544 + ($428 << 1 << 2) | 0; //@line 3653
          $432 = HEAP32[1376] | 0; //@line 3654
          $433 = 1 << $428; //@line 3655
          if (!($432 & $433)) {
           HEAP32[1376] = $432 | $433; //@line 3660
           $$0368$i = $431; //@line 3662
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 3662
          } else {
           $437 = $431 + 8 | 0; //@line 3664
           $438 = HEAP32[$437 >> 2] | 0; //@line 3665
           if ((HEAP32[1380] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 3669
           } else {
            $$0368$i = $438; //@line 3672
            $$pre$phi$i211Z2D = $437; //@line 3672
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 3675
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 3677
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 3679
          HEAP32[$354 + 12 >> 2] = $431; //@line 3681
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 3684
         if (!$444) {
          $$0361$i = 0; //@line 3687
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 3691
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 3695
           $450 = $444 << $449; //@line 3696
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 3699
           $455 = $450 << $453; //@line 3701
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 3704
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 3709
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 3715
          }
         }
         $469 = 5808 + ($$0361$i << 2) | 0; //@line 3718
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 3720
         $471 = $354 + 16 | 0; //@line 3721
         HEAP32[$471 + 4 >> 2] = 0; //@line 3723
         HEAP32[$471 >> 2] = 0; //@line 3724
         $473 = 1 << $$0361$i; //@line 3725
         if (!($475 & $473)) {
          HEAP32[1377] = $475 | $473; //@line 3730
          HEAP32[$469 >> 2] = $354; //@line 3731
          HEAP32[$354 + 24 >> 2] = $469; //@line 3733
          HEAP32[$354 + 12 >> 2] = $354; //@line 3735
          HEAP32[$354 + 8 >> 2] = $354; //@line 3737
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 3746
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 3746
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 3753
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 3757
          $494 = HEAP32[$492 >> 2] | 0; //@line 3759
          if (!$494) {
           label = 136; //@line 3762
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 3765
           $$0345$i = $494; //@line 3765
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1380] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 3772
          } else {
           HEAP32[$492 >> 2] = $354; //@line 3775
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 3777
           HEAP32[$354 + 12 >> 2] = $354; //@line 3779
           HEAP32[$354 + 8 >> 2] = $354; //@line 3781
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 3786
          $502 = HEAP32[$501 >> 2] | 0; //@line 3787
          $503 = HEAP32[1380] | 0; //@line 3788
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 3794
           HEAP32[$501 >> 2] = $354; //@line 3795
           HEAP32[$354 + 8 >> 2] = $502; //@line 3797
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 3799
           HEAP32[$354 + 24 >> 2] = 0; //@line 3801
           break;
          } else {
           _abort(); //@line 3804
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 3811
       STACKTOP = sp; //@line 3812
       return $$0 | 0; //@line 3812
      } else {
       $$0197 = $252; //@line 3814
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1378] | 0; //@line 3821
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 3824
  $515 = HEAP32[1381] | 0; //@line 3825
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 3828
   HEAP32[1381] = $517; //@line 3829
   HEAP32[1378] = $514; //@line 3830
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 3833
   HEAP32[$515 + $512 >> 2] = $514; //@line 3835
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 3838
  } else {
   HEAP32[1378] = 0; //@line 3840
   HEAP32[1381] = 0; //@line 3841
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 3844
   $526 = $515 + $512 + 4 | 0; //@line 3846
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 3849
  }
  $$0 = $515 + 8 | 0; //@line 3852
  STACKTOP = sp; //@line 3853
  return $$0 | 0; //@line 3853
 }
 $530 = HEAP32[1379] | 0; //@line 3855
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 3858
  HEAP32[1379] = $532; //@line 3859
  $533 = HEAP32[1382] | 0; //@line 3860
  $534 = $533 + $$0197 | 0; //@line 3861
  HEAP32[1382] = $534; //@line 3862
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 3865
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 3868
  $$0 = $533 + 8 | 0; //@line 3870
  STACKTOP = sp; //@line 3871
  return $$0 | 0; //@line 3871
 }
 if (!(HEAP32[1494] | 0)) {
  HEAP32[1496] = 4096; //@line 3876
  HEAP32[1495] = 4096; //@line 3877
  HEAP32[1497] = -1; //@line 3878
  HEAP32[1498] = -1; //@line 3879
  HEAP32[1499] = 0; //@line 3880
  HEAP32[1487] = 0; //@line 3881
  HEAP32[1494] = $1 & -16 ^ 1431655768; //@line 3885
  $548 = 4096; //@line 3886
 } else {
  $548 = HEAP32[1496] | 0; //@line 3889
 }
 $545 = $$0197 + 48 | 0; //@line 3891
 $546 = $$0197 + 47 | 0; //@line 3892
 $547 = $548 + $546 | 0; //@line 3893
 $549 = 0 - $548 | 0; //@line 3894
 $550 = $547 & $549; //@line 3895
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 3898
  STACKTOP = sp; //@line 3899
  return $$0 | 0; //@line 3899
 }
 $552 = HEAP32[1486] | 0; //@line 3901
 if ($552 | 0) {
  $554 = HEAP32[1484] | 0; //@line 3904
  $555 = $554 + $550 | 0; //@line 3905
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 3910
   STACKTOP = sp; //@line 3911
   return $$0 | 0; //@line 3911
  }
 }
 L244 : do {
  if (!(HEAP32[1487] & 4)) {
   $561 = HEAP32[1382] | 0; //@line 3919
   L246 : do {
    if (!$561) {
     label = 163; //@line 3923
    } else {
     $$0$i$i = 5952; //@line 3925
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 3927
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 3930
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 3939
      if (!$570) {
       label = 163; //@line 3942
       break L246;
      } else {
       $$0$i$i = $570; //@line 3945
      }
     }
     $595 = $547 - $530 & $549; //@line 3949
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 3952
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 3960
       } else {
        $$723947$i = $595; //@line 3962
        $$748$i = $597; //@line 3962
        label = 180; //@line 3963
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 3967
       $$2253$ph$i = $595; //@line 3967
       label = 171; //@line 3968
      }
     } else {
      $$2234243136$i = 0; //@line 3971
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 3977
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 3980
     } else {
      $574 = $572; //@line 3982
      $575 = HEAP32[1495] | 0; //@line 3983
      $576 = $575 + -1 | 0; //@line 3984
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 3992
      $584 = HEAP32[1484] | 0; //@line 3993
      $585 = $$$i + $584 | 0; //@line 3994
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1486] | 0; //@line 3999
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 4006
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 4010
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 4013
        $$748$i = $572; //@line 4013
        label = 180; //@line 4014
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 4017
        $$2253$ph$i = $$$i; //@line 4017
        label = 171; //@line 4018
       }
      } else {
       $$2234243136$i = 0; //@line 4021
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 4028
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 4037
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 4040
       $$748$i = $$2247$ph$i; //@line 4040
       label = 180; //@line 4041
       break L244;
      }
     }
     $607 = HEAP32[1496] | 0; //@line 4045
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 4049
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 4052
      $$748$i = $$2247$ph$i; //@line 4052
      label = 180; //@line 4053
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 4059
      $$2234243136$i = 0; //@line 4060
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 4064
      $$748$i = $$2247$ph$i; //@line 4064
      label = 180; //@line 4065
      break L244;
     }
    }
   } while (0);
   HEAP32[1487] = HEAP32[1487] | 4; //@line 4072
   $$4236$i = $$2234243136$i; //@line 4073
   label = 178; //@line 4074
  } else {
   $$4236$i = 0; //@line 4076
   label = 178; //@line 4077
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 4083
   $621 = _sbrk(0) | 0; //@line 4084
   $627 = $621 - $620 | 0; //@line 4092
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 4094
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 4102
    $$748$i = $620; //@line 4102
    label = 180; //@line 4103
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1484] | 0) + $$723947$i | 0; //@line 4109
  HEAP32[1484] = $633; //@line 4110
  if ($633 >>> 0 > (HEAP32[1485] | 0) >>> 0) {
   HEAP32[1485] = $633; //@line 4114
  }
  $636 = HEAP32[1382] | 0; //@line 4116
  do {
   if (!$636) {
    $638 = HEAP32[1380] | 0; //@line 4120
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1380] = $$748$i; //@line 4125
    }
    HEAP32[1488] = $$748$i; //@line 4127
    HEAP32[1489] = $$723947$i; //@line 4128
    HEAP32[1491] = 0; //@line 4129
    HEAP32[1385] = HEAP32[1494]; //@line 4131
    HEAP32[1384] = -1; //@line 4132
    HEAP32[1389] = 5544; //@line 4133
    HEAP32[1388] = 5544; //@line 4134
    HEAP32[1391] = 5552; //@line 4135
    HEAP32[1390] = 5552; //@line 4136
    HEAP32[1393] = 5560; //@line 4137
    HEAP32[1392] = 5560; //@line 4138
    HEAP32[1395] = 5568; //@line 4139
    HEAP32[1394] = 5568; //@line 4140
    HEAP32[1397] = 5576; //@line 4141
    HEAP32[1396] = 5576; //@line 4142
    HEAP32[1399] = 5584; //@line 4143
    HEAP32[1398] = 5584; //@line 4144
    HEAP32[1401] = 5592; //@line 4145
    HEAP32[1400] = 5592; //@line 4146
    HEAP32[1403] = 5600; //@line 4147
    HEAP32[1402] = 5600; //@line 4148
    HEAP32[1405] = 5608; //@line 4149
    HEAP32[1404] = 5608; //@line 4150
    HEAP32[1407] = 5616; //@line 4151
    HEAP32[1406] = 5616; //@line 4152
    HEAP32[1409] = 5624; //@line 4153
    HEAP32[1408] = 5624; //@line 4154
    HEAP32[1411] = 5632; //@line 4155
    HEAP32[1410] = 5632; //@line 4156
    HEAP32[1413] = 5640; //@line 4157
    HEAP32[1412] = 5640; //@line 4158
    HEAP32[1415] = 5648; //@line 4159
    HEAP32[1414] = 5648; //@line 4160
    HEAP32[1417] = 5656; //@line 4161
    HEAP32[1416] = 5656; //@line 4162
    HEAP32[1419] = 5664; //@line 4163
    HEAP32[1418] = 5664; //@line 4164
    HEAP32[1421] = 5672; //@line 4165
    HEAP32[1420] = 5672; //@line 4166
    HEAP32[1423] = 5680; //@line 4167
    HEAP32[1422] = 5680; //@line 4168
    HEAP32[1425] = 5688; //@line 4169
    HEAP32[1424] = 5688; //@line 4170
    HEAP32[1427] = 5696; //@line 4171
    HEAP32[1426] = 5696; //@line 4172
    HEAP32[1429] = 5704; //@line 4173
    HEAP32[1428] = 5704; //@line 4174
    HEAP32[1431] = 5712; //@line 4175
    HEAP32[1430] = 5712; //@line 4176
    HEAP32[1433] = 5720; //@line 4177
    HEAP32[1432] = 5720; //@line 4178
    HEAP32[1435] = 5728; //@line 4179
    HEAP32[1434] = 5728; //@line 4180
    HEAP32[1437] = 5736; //@line 4181
    HEAP32[1436] = 5736; //@line 4182
    HEAP32[1439] = 5744; //@line 4183
    HEAP32[1438] = 5744; //@line 4184
    HEAP32[1441] = 5752; //@line 4185
    HEAP32[1440] = 5752; //@line 4186
    HEAP32[1443] = 5760; //@line 4187
    HEAP32[1442] = 5760; //@line 4188
    HEAP32[1445] = 5768; //@line 4189
    HEAP32[1444] = 5768; //@line 4190
    HEAP32[1447] = 5776; //@line 4191
    HEAP32[1446] = 5776; //@line 4192
    HEAP32[1449] = 5784; //@line 4193
    HEAP32[1448] = 5784; //@line 4194
    HEAP32[1451] = 5792; //@line 4195
    HEAP32[1450] = 5792; //@line 4196
    $642 = $$723947$i + -40 | 0; //@line 4197
    $644 = $$748$i + 8 | 0; //@line 4199
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 4204
    $650 = $$748$i + $649 | 0; //@line 4205
    $651 = $642 - $649 | 0; //@line 4206
    HEAP32[1382] = $650; //@line 4207
    HEAP32[1379] = $651; //@line 4208
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 4211
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 4214
    HEAP32[1383] = HEAP32[1498]; //@line 4216
   } else {
    $$024367$i = 5952; //@line 4218
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 4220
     $658 = $$024367$i + 4 | 0; //@line 4221
     $659 = HEAP32[$658 >> 2] | 0; //@line 4222
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 4226
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 4230
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 4235
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 4249
       $673 = (HEAP32[1379] | 0) + $$723947$i | 0; //@line 4251
       $675 = $636 + 8 | 0; //@line 4253
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 4258
       $681 = $636 + $680 | 0; //@line 4259
       $682 = $673 - $680 | 0; //@line 4260
       HEAP32[1382] = $681; //@line 4261
       HEAP32[1379] = $682; //@line 4262
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 4265
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 4268
       HEAP32[1383] = HEAP32[1498]; //@line 4270
       break;
      }
     }
    }
    $688 = HEAP32[1380] | 0; //@line 4275
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1380] = $$748$i; //@line 4278
     $753 = $$748$i; //@line 4279
    } else {
     $753 = $688; //@line 4281
    }
    $690 = $$748$i + $$723947$i | 0; //@line 4283
    $$124466$i = 5952; //@line 4284
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 4289
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 4293
     if (!$694) {
      $$0$i$i$i = 5952; //@line 4296
      break;
     } else {
      $$124466$i = $694; //@line 4299
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 4308
      $700 = $$124466$i + 4 | 0; //@line 4309
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 4312
      $704 = $$748$i + 8 | 0; //@line 4314
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 4320
      $712 = $690 + 8 | 0; //@line 4322
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 4328
      $722 = $710 + $$0197 | 0; //@line 4332
      $723 = $718 - $710 - $$0197 | 0; //@line 4333
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 4336
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1379] | 0) + $723 | 0; //@line 4341
        HEAP32[1379] = $728; //@line 4342
        HEAP32[1382] = $722; //@line 4343
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 4346
       } else {
        if ((HEAP32[1381] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1378] | 0) + $723 | 0; //@line 4352
         HEAP32[1378] = $734; //@line 4353
         HEAP32[1381] = $722; //@line 4354
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 4357
         HEAP32[$722 + $734 >> 2] = $734; //@line 4359
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 4363
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 4367
         $743 = $739 >>> 3; //@line 4368
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 4373
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 4375
           $750 = 5544 + ($743 << 1 << 2) | 0; //@line 4377
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 4383
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 4392
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1376] = HEAP32[1376] & ~(1 << $743); //@line 4402
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 4409
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 4413
             }
             $764 = $748 + 8 | 0; //@line 4416
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 4420
              break;
             }
             _abort(); //@line 4423
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 4428
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 4429
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 4432
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 4434
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 4438
             $783 = $782 + 4 | 0; //@line 4439
             $784 = HEAP32[$783 >> 2] | 0; //@line 4440
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 4443
              if (!$786) {
               $$3$i$i = 0; //@line 4446
               break;
              } else {
               $$1291$i$i = $786; //@line 4449
               $$1293$i$i = $782; //@line 4449
              }
             } else {
              $$1291$i$i = $784; //@line 4452
              $$1293$i$i = $783; //@line 4452
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 4455
              $789 = HEAP32[$788 >> 2] | 0; //@line 4456
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 4459
               $$1293$i$i = $788; //@line 4459
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 4462
              $792 = HEAP32[$791 >> 2] | 0; //@line 4463
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 4468
               $$1293$i$i = $791; //@line 4468
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 4473
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 4476
              $$3$i$i = $$1291$i$i; //@line 4477
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 4482
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 4485
             }
             $776 = $774 + 12 | 0; //@line 4488
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 4492
             }
             $779 = $771 + 8 | 0; //@line 4495
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 4499
              HEAP32[$779 >> 2] = $774; //@line 4500
              $$3$i$i = $771; //@line 4501
              break;
             } else {
              _abort(); //@line 4504
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 4514
           $798 = 5808 + ($797 << 2) | 0; //@line 4515
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 4520
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1377] = HEAP32[1377] & ~(1 << $797); //@line 4529
             break L311;
            } else {
             if ((HEAP32[1380] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 4535
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 4543
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1380] | 0; //@line 4553
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 4556
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 4560
           $815 = $718 + 16 | 0; //@line 4561
           $816 = HEAP32[$815 >> 2] | 0; //@line 4562
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 4568
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 4572
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 4574
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 4580
           if (!$822) {
            break;
           }
           if ((HEAP32[1380] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 4588
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 4592
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 4594
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 4601
         $$0287$i$i = $742 + $723 | 0; //@line 4601
        } else {
         $$0$i17$i = $718; //@line 4603
         $$0287$i$i = $723; //@line 4603
        }
        $830 = $$0$i17$i + 4 | 0; //@line 4605
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 4608
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 4611
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 4613
        $836 = $$0287$i$i >>> 3; //@line 4614
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 5544 + ($836 << 1 << 2) | 0; //@line 4618
         $840 = HEAP32[1376] | 0; //@line 4619
         $841 = 1 << $836; //@line 4620
         do {
          if (!($840 & $841)) {
           HEAP32[1376] = $840 | $841; //@line 4626
           $$0295$i$i = $839; //@line 4628
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 4628
          } else {
           $845 = $839 + 8 | 0; //@line 4630
           $846 = HEAP32[$845 >> 2] | 0; //@line 4631
           if ((HEAP32[1380] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 4635
            $$pre$phi$i19$iZ2D = $845; //@line 4635
            break;
           }
           _abort(); //@line 4638
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 4642
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 4644
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 4646
         HEAP32[$722 + 12 >> 2] = $839; //@line 4648
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 4651
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 4655
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 4659
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 4664
          $858 = $852 << $857; //@line 4665
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 4668
          $863 = $858 << $861; //@line 4670
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 4673
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 4678
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 4684
         }
        } while (0);
        $877 = 5808 + ($$0296$i$i << 2) | 0; //@line 4687
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 4689
        $879 = $722 + 16 | 0; //@line 4690
        HEAP32[$879 + 4 >> 2] = 0; //@line 4692
        HEAP32[$879 >> 2] = 0; //@line 4693
        $881 = HEAP32[1377] | 0; //@line 4694
        $882 = 1 << $$0296$i$i; //@line 4695
        if (!($881 & $882)) {
         HEAP32[1377] = $881 | $882; //@line 4700
         HEAP32[$877 >> 2] = $722; //@line 4701
         HEAP32[$722 + 24 >> 2] = $877; //@line 4703
         HEAP32[$722 + 12 >> 2] = $722; //@line 4705
         HEAP32[$722 + 8 >> 2] = $722; //@line 4707
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 4716
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 4716
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 4723
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 4727
         $902 = HEAP32[$900 >> 2] | 0; //@line 4729
         if (!$902) {
          label = 260; //@line 4732
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 4735
          $$0289$i$i = $902; //@line 4735
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1380] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 4742
         } else {
          HEAP32[$900 >> 2] = $722; //@line 4745
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 4747
          HEAP32[$722 + 12 >> 2] = $722; //@line 4749
          HEAP32[$722 + 8 >> 2] = $722; //@line 4751
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 4756
         $910 = HEAP32[$909 >> 2] | 0; //@line 4757
         $911 = HEAP32[1380] | 0; //@line 4758
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 4764
          HEAP32[$909 >> 2] = $722; //@line 4765
          HEAP32[$722 + 8 >> 2] = $910; //@line 4767
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 4769
          HEAP32[$722 + 24 >> 2] = 0; //@line 4771
          break;
         } else {
          _abort(); //@line 4774
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 4781
      STACKTOP = sp; //@line 4782
      return $$0 | 0; //@line 4782
     } else {
      $$0$i$i$i = 5952; //@line 4784
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 4788
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 4793
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 4801
    }
    $927 = $923 + -47 | 0; //@line 4803
    $929 = $927 + 8 | 0; //@line 4805
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 4811
    $936 = $636 + 16 | 0; //@line 4812
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 4814
    $939 = $938 + 8 | 0; //@line 4815
    $940 = $938 + 24 | 0; //@line 4816
    $941 = $$723947$i + -40 | 0; //@line 4817
    $943 = $$748$i + 8 | 0; //@line 4819
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 4824
    $949 = $$748$i + $948 | 0; //@line 4825
    $950 = $941 - $948 | 0; //@line 4826
    HEAP32[1382] = $949; //@line 4827
    HEAP32[1379] = $950; //@line 4828
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 4831
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 4834
    HEAP32[1383] = HEAP32[1498]; //@line 4836
    $956 = $938 + 4 | 0; //@line 4837
    HEAP32[$956 >> 2] = 27; //@line 4838
    HEAP32[$939 >> 2] = HEAP32[1488]; //@line 4839
    HEAP32[$939 + 4 >> 2] = HEAP32[1489]; //@line 4839
    HEAP32[$939 + 8 >> 2] = HEAP32[1490]; //@line 4839
    HEAP32[$939 + 12 >> 2] = HEAP32[1491]; //@line 4839
    HEAP32[1488] = $$748$i; //@line 4840
    HEAP32[1489] = $$723947$i; //@line 4841
    HEAP32[1491] = 0; //@line 4842
    HEAP32[1490] = $939; //@line 4843
    $958 = $940; //@line 4844
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 4846
     HEAP32[$958 >> 2] = 7; //@line 4847
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 4860
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 4863
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 4866
     HEAP32[$938 >> 2] = $964; //@line 4867
     $969 = $964 >>> 3; //@line 4868
     if ($964 >>> 0 < 256) {
      $972 = 5544 + ($969 << 1 << 2) | 0; //@line 4872
      $973 = HEAP32[1376] | 0; //@line 4873
      $974 = 1 << $969; //@line 4874
      if (!($973 & $974)) {
       HEAP32[1376] = $973 | $974; //@line 4879
       $$0211$i$i = $972; //@line 4881
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 4881
      } else {
       $978 = $972 + 8 | 0; //@line 4883
       $979 = HEAP32[$978 >> 2] | 0; //@line 4884
       if ((HEAP32[1380] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 4888
       } else {
        $$0211$i$i = $979; //@line 4891
        $$pre$phi$i$iZ2D = $978; //@line 4891
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 4894
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 4896
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 4898
      HEAP32[$636 + 12 >> 2] = $972; //@line 4900
      break;
     }
     $985 = $964 >>> 8; //@line 4903
     if (!$985) {
      $$0212$i$i = 0; //@line 4906
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 4910
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 4914
       $991 = $985 << $990; //@line 4915
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 4918
       $996 = $991 << $994; //@line 4920
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 4923
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 4928
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 4934
      }
     }
     $1010 = 5808 + ($$0212$i$i << 2) | 0; //@line 4937
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 4939
     HEAP32[$636 + 20 >> 2] = 0; //@line 4941
     HEAP32[$936 >> 2] = 0; //@line 4942
     $1013 = HEAP32[1377] | 0; //@line 4943
     $1014 = 1 << $$0212$i$i; //@line 4944
     if (!($1013 & $1014)) {
      HEAP32[1377] = $1013 | $1014; //@line 4949
      HEAP32[$1010 >> 2] = $636; //@line 4950
      HEAP32[$636 + 24 >> 2] = $1010; //@line 4952
      HEAP32[$636 + 12 >> 2] = $636; //@line 4954
      HEAP32[$636 + 8 >> 2] = $636; //@line 4956
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 4965
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 4965
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 4972
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 4976
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 4978
      if (!$1034) {
       label = 286; //@line 4981
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 4984
       $$0207$i$i = $1034; //@line 4984
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1380] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 4991
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 4994
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 4996
       HEAP32[$636 + 12 >> 2] = $636; //@line 4998
       HEAP32[$636 + 8 >> 2] = $636; //@line 5000
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 5005
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 5006
      $1043 = HEAP32[1380] | 0; //@line 5007
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 5013
       HEAP32[$1041 >> 2] = $636; //@line 5014
       HEAP32[$636 + 8 >> 2] = $1042; //@line 5016
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 5018
       HEAP32[$636 + 24 >> 2] = 0; //@line 5020
       break;
      } else {
       _abort(); //@line 5023
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1379] | 0; //@line 5030
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 5033
   HEAP32[1379] = $1054; //@line 5034
   $1055 = HEAP32[1382] | 0; //@line 5035
   $1056 = $1055 + $$0197 | 0; //@line 5036
   HEAP32[1382] = $1056; //@line 5037
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 5040
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 5043
   $$0 = $1055 + 8 | 0; //@line 5045
   STACKTOP = sp; //@line 5046
   return $$0 | 0; //@line 5046
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 5050
 $$0 = 0; //@line 5051
 STACKTOP = sp; //@line 5052
 return $$0 | 0; //@line 5052
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8660
 STACKTOP = STACKTOP + 560 | 0; //@line 8661
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 8661
 $6 = sp + 8 | 0; //@line 8662
 $7 = sp; //@line 8663
 $8 = sp + 524 | 0; //@line 8664
 $9 = $8; //@line 8665
 $10 = sp + 512 | 0; //@line 8666
 HEAP32[$7 >> 2] = 0; //@line 8667
 $11 = $10 + 12 | 0; //@line 8668
 ___DOUBLE_BITS_677($1) | 0; //@line 8669
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 8674
  $$0520 = 1; //@line 8674
  $$0521 = 2696; //@line 8674
 } else {
  $$0471 = $1; //@line 8685
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 8685
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 2697 : 2702 : 2699; //@line 8685
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 8687
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 8696
   $31 = $$0520 + 3 | 0; //@line 8701
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 8703
   _out_670($0, $$0521, $$0520); //@line 8704
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 2723 : 2727 : $27 ? 2715 : 2719, 3); //@line 8705
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 8707
   $$sink560 = $31; //@line 8708
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 8711
   $36 = $35 != 0.0; //@line 8712
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 8716
   }
   $39 = $5 | 32; //@line 8718
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 8721
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 8724
    $44 = $$0520 | 2; //@line 8725
    $46 = 12 - $3 | 0; //@line 8727
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 8732
     } else {
      $$0509585 = 8.0; //@line 8734
      $$1508586 = $46; //@line 8734
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 8736
       $$0509585 = $$0509585 * 16.0; //@line 8737
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 8752
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 8757
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 8762
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 8765
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 8768
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 8771
     HEAP8[$68 >> 0] = 48; //@line 8772
     $$0511 = $68; //@line 8773
    } else {
     $$0511 = $66; //@line 8775
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 8782
    $76 = $$0511 + -2 | 0; //@line 8785
    HEAP8[$76 >> 0] = $5 + 15; //@line 8786
    $77 = ($3 | 0) < 1; //@line 8787
    $79 = ($4 & 8 | 0) == 0; //@line 8789
    $$0523 = $8; //@line 8790
    $$2473 = $$1472; //@line 8790
    while (1) {
     $80 = ~~$$2473; //@line 8792
     $86 = $$0523 + 1 | 0; //@line 8798
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[2731 + $80 >> 0]; //@line 8799
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 8802
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 8811
      } else {
       HEAP8[$86 >> 0] = 46; //@line 8814
       $$1524 = $$0523 + 2 | 0; //@line 8815
      }
     } else {
      $$1524 = $86; //@line 8818
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 8822
     }
    }
    $$pre693 = $$1524; //@line 8828
    if (!$3) {
     label = 24; //@line 8830
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 8838
      $$sink = $3 + 2 | 0; //@line 8838
     } else {
      label = 24; //@line 8840
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 8844
     $$pre$phi691Z2D = $101; //@line 8845
     $$sink = $101; //@line 8845
    }
    $104 = $11 - $76 | 0; //@line 8849
    $106 = $104 + $44 + $$sink | 0; //@line 8851
    _pad_676($0, 32, $2, $106, $4); //@line 8852
    _out_670($0, $$0521$, $44); //@line 8853
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 8855
    _out_670($0, $8, $$pre$phi691Z2D); //@line 8856
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 8858
    _out_670($0, $76, $104); //@line 8859
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 8861
    $$sink560 = $106; //@line 8862
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 8866
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 8870
    HEAP32[$7 >> 2] = $113; //@line 8871
    $$3 = $35 * 268435456.0; //@line 8872
    $$pr = $113; //@line 8872
   } else {
    $$3 = $35; //@line 8875
    $$pr = HEAP32[$7 >> 2] | 0; //@line 8875
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 8879
   $$0498 = $$561; //@line 8880
   $$4 = $$3; //@line 8880
   do {
    $116 = ~~$$4 >>> 0; //@line 8882
    HEAP32[$$0498 >> 2] = $116; //@line 8883
    $$0498 = $$0498 + 4 | 0; //@line 8884
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 8887
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 8897
    $$1499662 = $$0498; //@line 8897
    $124 = $$pr; //@line 8897
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 8900
     $$0488655 = $$1499662 + -4 | 0; //@line 8901
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 8904
     } else {
      $$0488657 = $$0488655; //@line 8906
      $$0497656 = 0; //@line 8906
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 8909
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 8911
       $131 = tempRet0; //@line 8912
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 8913
       HEAP32[$$0488657 >> 2] = $132; //@line 8915
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 8916
       $$0488657 = $$0488657 + -4 | 0; //@line 8918
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 8928
      } else {
       $138 = $$1482663 + -4 | 0; //@line 8930
       HEAP32[$138 >> 2] = $$0497656; //@line 8931
       $$2483$ph = $138; //@line 8932
      }
     }
     $$2500 = $$1499662; //@line 8935
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 8941
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 8945
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 8951
     HEAP32[$7 >> 2] = $144; //@line 8952
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 8955
      $$1499662 = $$2500; //@line 8955
      $124 = $144; //@line 8955
     } else {
      $$1482$lcssa = $$2483$ph; //@line 8957
      $$1499$lcssa = $$2500; //@line 8957
      $$pr566 = $144; //@line 8957
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 8962
    $$1499$lcssa = $$0498; //@line 8962
    $$pr566 = $$pr; //@line 8962
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 8968
    $150 = ($39 | 0) == 102; //@line 8969
    $$3484650 = $$1482$lcssa; //@line 8970
    $$3501649 = $$1499$lcssa; //@line 8970
    $152 = $$pr566; //@line 8970
    while (1) {
     $151 = 0 - $152 | 0; //@line 8972
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 8974
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 8978
      $161 = 1e9 >>> $154; //@line 8979
      $$0487644 = 0; //@line 8980
      $$1489643 = $$3484650; //@line 8980
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 8982
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 8986
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 8987
       $$1489643 = $$1489643 + 4 | 0; //@line 8988
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 8999
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 9002
       $$4502 = $$3501649; //@line 9002
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 9005
       $$$3484700 = $$$3484; //@line 9006
       $$4502 = $$3501649 + 4 | 0; //@line 9006
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 9013
      $$4502 = $$3501649; //@line 9013
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 9015
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 9022
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 9024
     HEAP32[$7 >> 2] = $152; //@line 9025
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 9030
      $$3501$lcssa = $$$4502; //@line 9030
      break;
     } else {
      $$3484650 = $$$3484700; //@line 9028
      $$3501649 = $$$4502; //@line 9028
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 9035
    $$3501$lcssa = $$1499$lcssa; //@line 9035
   }
   $185 = $$561; //@line 9038
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 9043
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 9044
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 9047
    } else {
     $$0514639 = $189; //@line 9049
     $$0530638 = 10; //@line 9049
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 9051
      $193 = $$0514639 + 1 | 0; //@line 9052
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 9055
       break;
      } else {
       $$0514639 = $193; //@line 9058
      }
     }
    }
   } else {
    $$1515 = 0; //@line 9063
   }
   $198 = ($39 | 0) == 103; //@line 9068
   $199 = ($$540 | 0) != 0; //@line 9069
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 9072
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 9081
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 9084
    $213 = ($209 | 0) % 9 | 0; //@line 9085
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 9088
     $$1531632 = 10; //@line 9088
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 9091
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 9094
       $$1531632 = $215; //@line 9094
      } else {
       $$1531$lcssa = $215; //@line 9096
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 9101
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 9103
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 9104
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 9107
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 9110
     $$4518 = $$1515; //@line 9110
     $$8 = $$3484$lcssa; //@line 9110
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 9115
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 9116
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 9121
     if (!$$0520) {
      $$1467 = $$$564; //@line 9124
      $$1469 = $$543; //@line 9124
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 9127
      $$1467 = $230 ? -$$$564 : $$$564; //@line 9132
      $$1469 = $230 ? -$$543 : $$543; //@line 9132
     }
     $233 = $217 - $218 | 0; //@line 9134
     HEAP32[$212 >> 2] = $233; //@line 9135
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 9139
      HEAP32[$212 >> 2] = $236; //@line 9140
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 9143
       $$sink547625 = $212; //@line 9143
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 9145
        HEAP32[$$sink547625 >> 2] = 0; //@line 9146
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 9149
         HEAP32[$240 >> 2] = 0; //@line 9150
         $$6 = $240; //@line 9151
        } else {
         $$6 = $$5486626; //@line 9153
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 9156
        HEAP32[$238 >> 2] = $242; //@line 9157
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 9160
         $$sink547625 = $238; //@line 9160
        } else {
         $$5486$lcssa = $$6; //@line 9162
         $$sink547$lcssa = $238; //@line 9162
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 9167
       $$sink547$lcssa = $212; //@line 9167
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 9172
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 9173
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 9176
       $$4518 = $247; //@line 9176
       $$8 = $$5486$lcssa; //@line 9176
      } else {
       $$2516621 = $247; //@line 9178
       $$2532620 = 10; //@line 9178
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 9180
        $251 = $$2516621 + 1 | 0; //@line 9181
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 9184
         $$4518 = $251; //@line 9184
         $$8 = $$5486$lcssa; //@line 9184
         break;
        } else {
         $$2516621 = $251; //@line 9187
        }
       }
      }
     } else {
      $$4492 = $212; //@line 9192
      $$4518 = $$1515; //@line 9192
      $$8 = $$3484$lcssa; //@line 9192
     }
    }
    $253 = $$4492 + 4 | 0; //@line 9195
    $$5519$ph = $$4518; //@line 9198
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 9198
    $$9$ph = $$8; //@line 9198
   } else {
    $$5519$ph = $$1515; //@line 9200
    $$7505$ph = $$3501$lcssa; //@line 9200
    $$9$ph = $$3484$lcssa; //@line 9200
   }
   $$7505 = $$7505$ph; //@line 9202
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 9206
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 9209
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 9213
    } else {
     $$lcssa675 = 1; //@line 9215
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 9219
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 9224
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 9232
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 9232
     } else {
      $$0479 = $5 + -2 | 0; //@line 9236
      $$2476 = $$540$ + -1 | 0; //@line 9236
     }
     $267 = $4 & 8; //@line 9238
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 9243
       if (!$270) {
        $$2529 = 9; //@line 9246
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 9251
         $$3533616 = 10; //@line 9251
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 9253
          $275 = $$1528617 + 1 | 0; //@line 9254
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 9260
           break;
          } else {
           $$1528617 = $275; //@line 9258
          }
         }
        } else {
         $$2529 = 0; //@line 9265
        }
       }
      } else {
       $$2529 = 9; //@line 9269
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 9277
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 9279
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 9281
       $$1480 = $$0479; //@line 9284
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 9284
       $$pre$phi698Z2D = 0; //@line 9284
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 9288
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 9290
       $$1480 = $$0479; //@line 9293
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 9293
       $$pre$phi698Z2D = 0; //@line 9293
       break;
      }
     } else {
      $$1480 = $$0479; //@line 9297
      $$3477 = $$2476; //@line 9297
      $$pre$phi698Z2D = $267; //@line 9297
     }
    } else {
     $$1480 = $5; //@line 9301
     $$3477 = $$540; //@line 9301
     $$pre$phi698Z2D = $4 & 8; //@line 9301
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 9304
   $294 = ($292 | 0) != 0 & 1; //@line 9306
   $296 = ($$1480 | 32 | 0) == 102; //@line 9308
   if ($296) {
    $$2513 = 0; //@line 9312
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 9312
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 9315
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 9318
    $304 = $11; //@line 9319
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 9324
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 9326
      HEAP8[$308 >> 0] = 48; //@line 9327
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 9332
      } else {
       $$1512$lcssa = $308; //@line 9334
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 9339
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 9346
    $318 = $$1512$lcssa + -2 | 0; //@line 9348
    HEAP8[$318 >> 0] = $$1480; //@line 9349
    $$2513 = $318; //@line 9352
    $$pn = $304 - $318 | 0; //@line 9352
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 9357
   _pad_676($0, 32, $2, $323, $4); //@line 9358
   _out_670($0, $$0521, $$0520); //@line 9359
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 9361
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 9364
    $326 = $8 + 9 | 0; //@line 9365
    $327 = $326; //@line 9366
    $328 = $8 + 8 | 0; //@line 9367
    $$5493600 = $$0496$$9; //@line 9368
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 9371
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 9376
       $$1465 = $328; //@line 9377
      } else {
       $$1465 = $330; //@line 9379
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 9386
       $$0464597 = $330; //@line 9387
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 9389
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 9392
        } else {
         $$1465 = $335; //@line 9394
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 9399
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 9404
     $$5493600 = $$5493600 + 4 | 0; //@line 9405
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 2747, 1); //@line 9415
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 9421
     $$6494592 = $$5493600; //@line 9421
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 9424
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 9429
       $$0463587 = $347; //@line 9430
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 9432
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 9435
        } else {
         $$0463$lcssa = $351; //@line 9437
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 9442
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 9446
      $$6494592 = $$6494592 + 4 | 0; //@line 9447
      $356 = $$4478593 + -9 | 0; //@line 9448
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 9455
       break;
      } else {
       $$4478593 = $356; //@line 9453
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 9460
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 9463
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 9466
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 9469
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 9470
     $365 = $363; //@line 9471
     $366 = 0 - $9 | 0; //@line 9472
     $367 = $8 + 8 | 0; //@line 9473
     $$5605 = $$3477; //@line 9474
     $$7495604 = $$9$ph; //@line 9474
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 9477
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 9480
       $$0 = $367; //@line 9481
      } else {
       $$0 = $369; //@line 9483
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 9488
        _out_670($0, $$0, 1); //@line 9489
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 9493
         break;
        }
        _out_670($0, 2747, 1); //@line 9496
        $$2 = $375; //@line 9497
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 9501
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 9506
        $$1601 = $$0; //@line 9507
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 9509
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 9512
         } else {
          $$2 = $373; //@line 9514
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 9521
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 9524
      $381 = $$5605 - $378 | 0; //@line 9525
      $$7495604 = $$7495604 + 4 | 0; //@line 9526
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 9533
       break;
      } else {
       $$5605 = $381; //@line 9531
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 9538
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 9541
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 9545
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 9548
   $$sink560 = $323; //@line 9549
  }
 } while (0);
 STACKTOP = sp; //@line 9554
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 9554
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 7232
 STACKTOP = STACKTOP + 64 | 0; //@line 7233
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 7233
 $5 = sp + 16 | 0; //@line 7234
 $6 = sp; //@line 7235
 $7 = sp + 24 | 0; //@line 7236
 $8 = sp + 8 | 0; //@line 7237
 $9 = sp + 20 | 0; //@line 7238
 HEAP32[$5 >> 2] = $1; //@line 7239
 $10 = ($0 | 0) != 0; //@line 7240
 $11 = $7 + 40 | 0; //@line 7241
 $12 = $11; //@line 7242
 $13 = $7 + 39 | 0; //@line 7243
 $14 = $8 + 4 | 0; //@line 7244
 $$0243 = 0; //@line 7245
 $$0247 = 0; //@line 7245
 $$0269 = 0; //@line 7245
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 7254
     $$1248 = -1; //@line 7255
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 7259
     break;
    }
   } else {
    $$1248 = $$0247; //@line 7263
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 7266
  $21 = HEAP8[$20 >> 0] | 0; //@line 7267
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 7270
   break;
  } else {
   $23 = $21; //@line 7273
   $25 = $20; //@line 7273
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 7278
     $27 = $25; //@line 7278
     label = 9; //@line 7279
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 7284
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 7291
   HEAP32[$5 >> 2] = $24; //@line 7292
   $23 = HEAP8[$24 >> 0] | 0; //@line 7294
   $25 = $24; //@line 7294
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 7299
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 7304
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 7307
     $27 = $27 + 2 | 0; //@line 7308
     HEAP32[$5 >> 2] = $27; //@line 7309
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 7316
      break;
     } else {
      $$0249303 = $30; //@line 7313
      label = 9; //@line 7314
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 7324
  if ($10) {
   _out_670($0, $20, $36); //@line 7326
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 7330
   $$0247 = $$1248; //@line 7330
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 7338
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 7339
  if ($43) {
   $$0253 = -1; //@line 7341
   $$1270 = $$0269; //@line 7341
   $$sink = 1; //@line 7341
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 7351
    $$1270 = 1; //@line 7351
    $$sink = 3; //@line 7351
   } else {
    $$0253 = -1; //@line 7353
    $$1270 = $$0269; //@line 7353
    $$sink = 1; //@line 7353
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 7356
  HEAP32[$5 >> 2] = $51; //@line 7357
  $52 = HEAP8[$51 >> 0] | 0; //@line 7358
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 7360
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 7367
   $$lcssa291 = $52; //@line 7367
   $$lcssa292 = $51; //@line 7367
  } else {
   $$0262309 = 0; //@line 7369
   $60 = $52; //@line 7369
   $65 = $51; //@line 7369
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 7374
    $64 = $65 + 1 | 0; //@line 7375
    HEAP32[$5 >> 2] = $64; //@line 7376
    $66 = HEAP8[$64 >> 0] | 0; //@line 7377
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 7379
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 7386
     $$lcssa291 = $66; //@line 7386
     $$lcssa292 = $64; //@line 7386
     break;
    } else {
     $$0262309 = $63; //@line 7389
     $60 = $66; //@line 7389
     $65 = $64; //@line 7389
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 7401
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 7403
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 7408
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 7413
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 7425
     $$2271 = 1; //@line 7425
     $storemerge274 = $79 + 3 | 0; //@line 7425
    } else {
     label = 23; //@line 7427
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 7431
    if ($$1270 | 0) {
     $$0 = -1; //@line 7434
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7449
     $106 = HEAP32[$105 >> 2] | 0; //@line 7450
     HEAP32[$2 >> 2] = $105 + 4; //@line 7452
     $363 = $106; //@line 7453
    } else {
     $363 = 0; //@line 7455
    }
    $$0259 = $363; //@line 7459
    $$2271 = 0; //@line 7459
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 7459
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 7461
   $109 = ($$0259 | 0) < 0; //@line 7462
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 7467
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 7467
   $$3272 = $$2271; //@line 7467
   $115 = $storemerge274; //@line 7467
  } else {
   $112 = _getint_671($5) | 0; //@line 7469
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 7472
    break;
   }
   $$1260 = $112; //@line 7476
   $$1263 = $$0262$lcssa; //@line 7476
   $$3272 = $$1270; //@line 7476
   $115 = HEAP32[$5 >> 2] | 0; //@line 7476
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 7487
     $156 = _getint_671($5) | 0; //@line 7488
     $$0254 = $156; //@line 7490
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 7490
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 7499
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 7504
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 7509
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 7516
      $144 = $125 + 4 | 0; //@line 7520
      HEAP32[$5 >> 2] = $144; //@line 7521
      $$0254 = $140; //@line 7522
      $$pre345 = $144; //@line 7522
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 7528
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7543
     $152 = HEAP32[$151 >> 2] | 0; //@line 7544
     HEAP32[$2 >> 2] = $151 + 4; //@line 7546
     $364 = $152; //@line 7547
    } else {
     $364 = 0; //@line 7549
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 7552
    HEAP32[$5 >> 2] = $154; //@line 7553
    $$0254 = $364; //@line 7554
    $$pre345 = $154; //@line 7554
   } else {
    $$0254 = -1; //@line 7556
    $$pre345 = $115; //@line 7556
   }
  } while (0);
  $$0252 = 0; //@line 7559
  $158 = $$pre345; //@line 7559
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 7566
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 7569
   HEAP32[$5 >> 2] = $158; //@line 7570
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (2215 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 7575
   $168 = $167 & 255; //@line 7576
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 7580
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 7587
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 7591
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 7595
     break L1;
    } else {
     label = 50; //@line 7598
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 7603
     $176 = $3 + ($$0253 << 3) | 0; //@line 7605
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 7610
     $182 = $6; //@line 7611
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 7613
     HEAP32[$182 + 4 >> 2] = $181; //@line 7616
     label = 50; //@line 7617
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 7621
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 7624
    $187 = HEAP32[$5 >> 2] | 0; //@line 7626
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 7630
   if ($10) {
    $187 = $158; //@line 7632
   } else {
    $$0243 = 0; //@line 7634
    $$0247 = $$1248; //@line 7634
    $$0269 = $$3272; //@line 7634
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 7640
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 7646
  $196 = $$1263 & -65537; //@line 7649
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 7650
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7658
       $$0243 = 0; //@line 7659
       $$0247 = $$1248; //@line 7659
       $$0269 = $$3272; //@line 7659
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7665
       $$0243 = 0; //@line 7666
       $$0247 = $$1248; //@line 7666
       $$0269 = $$3272; //@line 7666
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 7674
       HEAP32[$208 >> 2] = $$1248; //@line 7676
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 7679
       $$0243 = 0; //@line 7680
       $$0247 = $$1248; //@line 7680
       $$0269 = $$3272; //@line 7680
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 7687
       $$0243 = 0; //@line 7688
       $$0247 = $$1248; //@line 7688
       $$0269 = $$3272; //@line 7688
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 7695
       $$0243 = 0; //@line 7696
       $$0247 = $$1248; //@line 7696
       $$0269 = $$3272; //@line 7696
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 7702
       $$0243 = 0; //@line 7703
       $$0247 = $$1248; //@line 7703
       $$0269 = $$3272; //@line 7703
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 7711
       HEAP32[$220 >> 2] = $$1248; //@line 7713
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 7716
       $$0243 = 0; //@line 7717
       $$0247 = $$1248; //@line 7717
       $$0269 = $$3272; //@line 7717
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 7722
       $$0247 = $$1248; //@line 7722
       $$0269 = $$3272; //@line 7722
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 7732
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 7732
     $$3265 = $$1263$ | 8; //@line 7732
     label = 62; //@line 7733
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 7737
     $$1255 = $$0254; //@line 7737
     $$3265 = $$1263$; //@line 7737
     label = 62; //@line 7738
     break;
    }
   case 111:
    {
     $242 = $6; //@line 7742
     $244 = HEAP32[$242 >> 2] | 0; //@line 7744
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 7747
     $248 = _fmt_o($244, $247, $11) | 0; //@line 7748
     $252 = $12 - $248 | 0; //@line 7752
     $$0228 = $248; //@line 7757
     $$1233 = 0; //@line 7757
     $$1238 = 2679; //@line 7757
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 7757
     $$4266 = $$1263$; //@line 7757
     $281 = $244; //@line 7757
     $283 = $247; //@line 7757
     label = 68; //@line 7758
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 7762
     $258 = HEAP32[$256 >> 2] | 0; //@line 7764
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 7767
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 7770
      $264 = tempRet0; //@line 7771
      $265 = $6; //@line 7772
      HEAP32[$265 >> 2] = $263; //@line 7774
      HEAP32[$265 + 4 >> 2] = $264; //@line 7777
      $$0232 = 1; //@line 7778
      $$0237 = 2679; //@line 7778
      $275 = $263; //@line 7778
      $276 = $264; //@line 7778
      label = 67; //@line 7779
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 7791
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 2679 : 2681 : 2680; //@line 7791
      $275 = $258; //@line 7791
      $276 = $261; //@line 7791
      label = 67; //@line 7792
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 7798
     $$0232 = 0; //@line 7804
     $$0237 = 2679; //@line 7804
     $275 = HEAP32[$197 >> 2] | 0; //@line 7804
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 7804
     label = 67; //@line 7805
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 7816
     $$2 = $13; //@line 7817
     $$2234 = 0; //@line 7817
     $$2239 = 2679; //@line 7817
     $$2251 = $11; //@line 7817
     $$5 = 1; //@line 7817
     $$6268 = $196; //@line 7817
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 7824
     label = 72; //@line 7825
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 7829
     $$1 = $302 | 0 ? $302 : 2689; //@line 7832
     label = 72; //@line 7833
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 7843
     HEAP32[$14 >> 2] = 0; //@line 7844
     HEAP32[$6 >> 2] = $8; //@line 7845
     $$4258354 = -1; //@line 7846
     $365 = $8; //@line 7846
     label = 76; //@line 7847
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 7851
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 7854
      $$0240$lcssa356 = 0; //@line 7855
      label = 85; //@line 7856
     } else {
      $$4258354 = $$0254; //@line 7858
      $365 = $$pre348; //@line 7858
      label = 76; //@line 7859
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 7866
     $$0247 = $$1248; //@line 7866
     $$0269 = $$3272; //@line 7866
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 7871
     $$2234 = 0; //@line 7871
     $$2239 = 2679; //@line 7871
     $$2251 = $11; //@line 7871
     $$5 = $$0254; //@line 7871
     $$6268 = $$1263$; //@line 7871
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 7877
    $227 = $6; //@line 7878
    $229 = HEAP32[$227 >> 2] | 0; //@line 7880
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 7883
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 7885
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 7891
    $$0228 = $234; //@line 7896
    $$1233 = $or$cond278 ? 0 : 2; //@line 7896
    $$1238 = $or$cond278 ? 2679 : 2679 + ($$1236 >> 4) | 0; //@line 7896
    $$2256 = $$1255; //@line 7896
    $$4266 = $$3265; //@line 7896
    $281 = $229; //@line 7896
    $283 = $232; //@line 7896
    label = 68; //@line 7897
   } else if ((label | 0) == 67) {
    label = 0; //@line 7900
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 7902
    $$1233 = $$0232; //@line 7902
    $$1238 = $$0237; //@line 7902
    $$2256 = $$0254; //@line 7902
    $$4266 = $$1263$; //@line 7902
    $281 = $275; //@line 7902
    $283 = $276; //@line 7902
    label = 68; //@line 7903
   } else if ((label | 0) == 72) {
    label = 0; //@line 7906
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 7907
    $306 = ($305 | 0) == 0; //@line 7908
    $$2 = $$1; //@line 7915
    $$2234 = 0; //@line 7915
    $$2239 = 2679; //@line 7915
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 7915
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 7915
    $$6268 = $196; //@line 7915
   } else if ((label | 0) == 76) {
    label = 0; //@line 7918
    $$0229316 = $365; //@line 7919
    $$0240315 = 0; //@line 7919
    $$1244314 = 0; //@line 7919
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 7921
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 7924
      $$2245 = $$1244314; //@line 7924
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 7927
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 7933
      $$2245 = $320; //@line 7933
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 7937
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 7940
      $$0240315 = $325; //@line 7940
      $$1244314 = $320; //@line 7940
     } else {
      $$0240$lcssa = $325; //@line 7942
      $$2245 = $320; //@line 7942
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 7948
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 7951
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 7954
     label = 85; //@line 7955
    } else {
     $$1230327 = $365; //@line 7957
     $$1241326 = 0; //@line 7957
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 7959
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7962
       label = 85; //@line 7963
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 7966
      $$1241326 = $331 + $$1241326 | 0; //@line 7967
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7970
       label = 85; //@line 7971
       break L97;
      }
      _out_670($0, $9, $331); //@line 7975
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7980
       label = 85; //@line 7981
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 7978
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 7989
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 7995
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 7997
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 8002
   $$2 = $or$cond ? $$0228 : $11; //@line 8007
   $$2234 = $$1233; //@line 8007
   $$2239 = $$1238; //@line 8007
   $$2251 = $11; //@line 8007
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 8007
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 8007
  } else if ((label | 0) == 85) {
   label = 0; //@line 8010
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 8012
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 8015
   $$0247 = $$1248; //@line 8015
   $$0269 = $$3272; //@line 8015
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 8020
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 8022
  $345 = $$$5 + $$2234 | 0; //@line 8023
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 8025
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 8026
  _out_670($0, $$2239, $$2234); //@line 8027
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 8029
  _pad_676($0, 48, $$$5, $343, 0); //@line 8030
  _out_670($0, $$2, $343); //@line 8031
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 8033
  $$0243 = $$2261; //@line 8034
  $$0247 = $$1248; //@line 8034
  $$0269 = $$3272; //@line 8034
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 8042
    } else {
     $$2242302 = 1; //@line 8044
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 8047
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 8050
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 8054
      $356 = $$2242302 + 1 | 0; //@line 8055
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 8058
      } else {
       $$2242$lcssa = $356; //@line 8060
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 8066
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 8072
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 8078
       } else {
        $$0 = 1; //@line 8080
        break;
       }
      }
     } else {
      $$0 = 1; //@line 8085
     }
    }
   } else {
    $$0 = $$1248; //@line 8089
   }
  }
 } while (0);
 STACKTOP = sp; //@line 8093
 return $$0 | 0; //@line 8093
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 5079
 $3 = HEAP32[1380] | 0; //@line 5080
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 5083
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 5087
 $7 = $6 & 3; //@line 5088
 if (($7 | 0) == 1) {
  _abort(); //@line 5091
 }
 $9 = $6 & -8; //@line 5094
 $10 = $2 + $9 | 0; //@line 5095
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 5100
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 5106
   $17 = $13 + $9 | 0; //@line 5107
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 5110
   }
   if ((HEAP32[1381] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 5116
    $106 = HEAP32[$105 >> 2] | 0; //@line 5117
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 5121
     $$1382 = $17; //@line 5121
     $114 = $16; //@line 5121
     break;
    }
    HEAP32[1378] = $17; //@line 5124
    HEAP32[$105 >> 2] = $106 & -2; //@line 5126
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 5129
    HEAP32[$16 + $17 >> 2] = $17; //@line 5131
    return;
   }
   $21 = $13 >>> 3; //@line 5134
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 5138
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 5140
    $28 = 5544 + ($21 << 1 << 2) | 0; //@line 5142
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 5147
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 5154
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1376] = HEAP32[1376] & ~(1 << $21); //@line 5164
     $$1 = $16; //@line 5165
     $$1382 = $17; //@line 5165
     $114 = $16; //@line 5165
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 5171
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 5175
     }
     $41 = $26 + 8 | 0; //@line 5178
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 5182
     } else {
      _abort(); //@line 5184
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 5189
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 5190
    $$1 = $16; //@line 5191
    $$1382 = $17; //@line 5191
    $114 = $16; //@line 5191
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 5195
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 5197
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 5201
     $60 = $59 + 4 | 0; //@line 5202
     $61 = HEAP32[$60 >> 2] | 0; //@line 5203
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 5206
      if (!$63) {
       $$3 = 0; //@line 5209
       break;
      } else {
       $$1387 = $63; //@line 5212
       $$1390 = $59; //@line 5212
      }
     } else {
      $$1387 = $61; //@line 5215
      $$1390 = $60; //@line 5215
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 5218
      $66 = HEAP32[$65 >> 2] | 0; //@line 5219
      if ($66 | 0) {
       $$1387 = $66; //@line 5222
       $$1390 = $65; //@line 5222
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 5225
      $69 = HEAP32[$68 >> 2] | 0; //@line 5226
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 5231
       $$1390 = $68; //@line 5231
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 5236
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 5239
      $$3 = $$1387; //@line 5240
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 5245
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 5248
     }
     $53 = $51 + 12 | 0; //@line 5251
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 5255
     }
     $56 = $48 + 8 | 0; //@line 5258
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 5262
      HEAP32[$56 >> 2] = $51; //@line 5263
      $$3 = $48; //@line 5264
      break;
     } else {
      _abort(); //@line 5267
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 5274
    $$1382 = $17; //@line 5274
    $114 = $16; //@line 5274
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 5277
    $75 = 5808 + ($74 << 2) | 0; //@line 5278
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 5283
      if (!$$3) {
       HEAP32[1377] = HEAP32[1377] & ~(1 << $74); //@line 5290
       $$1 = $16; //@line 5291
       $$1382 = $17; //@line 5291
       $114 = $16; //@line 5291
       break L10;
      }
     } else {
      if ((HEAP32[1380] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 5298
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 5306
       if (!$$3) {
        $$1 = $16; //@line 5309
        $$1382 = $17; //@line 5309
        $114 = $16; //@line 5309
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1380] | 0; //@line 5317
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 5320
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 5324
    $92 = $16 + 16 | 0; //@line 5325
    $93 = HEAP32[$92 >> 2] | 0; //@line 5326
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 5332
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 5336
       HEAP32[$93 + 24 >> 2] = $$3; //@line 5338
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 5344
    if (!$99) {
     $$1 = $16; //@line 5347
     $$1382 = $17; //@line 5347
     $114 = $16; //@line 5347
    } else {
     if ((HEAP32[1380] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 5352
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 5356
      HEAP32[$99 + 24 >> 2] = $$3; //@line 5358
      $$1 = $16; //@line 5359
      $$1382 = $17; //@line 5359
      $114 = $16; //@line 5359
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 5365
   $$1382 = $9; //@line 5365
   $114 = $2; //@line 5365
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 5370
 }
 $115 = $10 + 4 | 0; //@line 5373
 $116 = HEAP32[$115 >> 2] | 0; //@line 5374
 if (!($116 & 1)) {
  _abort(); //@line 5378
 }
 if (!($116 & 2)) {
  if ((HEAP32[1382] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1379] | 0) + $$1382 | 0; //@line 5388
   HEAP32[1379] = $124; //@line 5389
   HEAP32[1382] = $$1; //@line 5390
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 5393
   if (($$1 | 0) != (HEAP32[1381] | 0)) {
    return;
   }
   HEAP32[1381] = 0; //@line 5399
   HEAP32[1378] = 0; //@line 5400
   return;
  }
  if ((HEAP32[1381] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1378] | 0) + $$1382 | 0; //@line 5407
   HEAP32[1378] = $132; //@line 5408
   HEAP32[1381] = $114; //@line 5409
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 5412
   HEAP32[$114 + $132 >> 2] = $132; //@line 5414
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 5418
  $138 = $116 >>> 3; //@line 5419
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 5424
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 5426
    $145 = 5544 + ($138 << 1 << 2) | 0; //@line 5428
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1380] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 5434
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 5441
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1376] = HEAP32[1376] & ~(1 << $138); //@line 5451
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 5457
    } else {
     if ((HEAP32[1380] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 5462
     }
     $160 = $143 + 8 | 0; //@line 5465
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 5469
     } else {
      _abort(); //@line 5471
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 5476
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 5477
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 5480
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 5482
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 5486
      $180 = $179 + 4 | 0; //@line 5487
      $181 = HEAP32[$180 >> 2] | 0; //@line 5488
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 5491
       if (!$183) {
        $$3400 = 0; //@line 5494
        break;
       } else {
        $$1398 = $183; //@line 5497
        $$1402 = $179; //@line 5497
       }
      } else {
       $$1398 = $181; //@line 5500
       $$1402 = $180; //@line 5500
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 5503
       $186 = HEAP32[$185 >> 2] | 0; //@line 5504
       if ($186 | 0) {
        $$1398 = $186; //@line 5507
        $$1402 = $185; //@line 5507
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 5510
       $189 = HEAP32[$188 >> 2] | 0; //@line 5511
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 5516
        $$1402 = $188; //@line 5516
       }
      }
      if ((HEAP32[1380] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 5522
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 5525
       $$3400 = $$1398; //@line 5526
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 5531
      if ((HEAP32[1380] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 5535
      }
      $173 = $170 + 12 | 0; //@line 5538
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 5542
      }
      $176 = $167 + 8 | 0; //@line 5545
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 5549
       HEAP32[$176 >> 2] = $170; //@line 5550
       $$3400 = $167; //@line 5551
       break;
      } else {
       _abort(); //@line 5554
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 5562
     $196 = 5808 + ($195 << 2) | 0; //@line 5563
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 5568
       if (!$$3400) {
        HEAP32[1377] = HEAP32[1377] & ~(1 << $195); //@line 5575
        break L108;
       }
      } else {
       if ((HEAP32[1380] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 5582
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 5590
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1380] | 0; //@line 5600
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 5603
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 5607
     $213 = $10 + 16 | 0; //@line 5608
     $214 = HEAP32[$213 >> 2] | 0; //@line 5609
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 5615
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 5619
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 5621
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 5627
     if ($220 | 0) {
      if ((HEAP32[1380] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 5633
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 5637
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 5639
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 5648
  HEAP32[$114 + $137 >> 2] = $137; //@line 5650
  if (($$1 | 0) == (HEAP32[1381] | 0)) {
   HEAP32[1378] = $137; //@line 5654
   return;
  } else {
   $$2 = $137; //@line 5657
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 5661
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 5664
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 5666
  $$2 = $$1382; //@line 5667
 }
 $235 = $$2 >>> 3; //@line 5669
 if ($$2 >>> 0 < 256) {
  $238 = 5544 + ($235 << 1 << 2) | 0; //@line 5673
  $239 = HEAP32[1376] | 0; //@line 5674
  $240 = 1 << $235; //@line 5675
  if (!($239 & $240)) {
   HEAP32[1376] = $239 | $240; //@line 5680
   $$0403 = $238; //@line 5682
   $$pre$phiZ2D = $238 + 8 | 0; //@line 5682
  } else {
   $244 = $238 + 8 | 0; //@line 5684
   $245 = HEAP32[$244 >> 2] | 0; //@line 5685
   if ((HEAP32[1380] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 5689
   } else {
    $$0403 = $245; //@line 5692
    $$pre$phiZ2D = $244; //@line 5692
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 5695
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 5697
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 5699
  HEAP32[$$1 + 12 >> 2] = $238; //@line 5701
  return;
 }
 $251 = $$2 >>> 8; //@line 5704
 if (!$251) {
  $$0396 = 0; //@line 5707
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 5711
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 5715
   $257 = $251 << $256; //@line 5716
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 5719
   $262 = $257 << $260; //@line 5721
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 5724
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 5729
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 5735
  }
 }
 $276 = 5808 + ($$0396 << 2) | 0; //@line 5738
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 5740
 HEAP32[$$1 + 20 >> 2] = 0; //@line 5743
 HEAP32[$$1 + 16 >> 2] = 0; //@line 5744
 $280 = HEAP32[1377] | 0; //@line 5745
 $281 = 1 << $$0396; //@line 5746
 do {
  if (!($280 & $281)) {
   HEAP32[1377] = $280 | $281; //@line 5752
   HEAP32[$276 >> 2] = $$1; //@line 5753
   HEAP32[$$1 + 24 >> 2] = $276; //@line 5755
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 5757
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 5759
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 5767
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 5767
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 5774
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 5778
    $301 = HEAP32[$299 >> 2] | 0; //@line 5780
    if (!$301) {
     label = 121; //@line 5783
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 5786
     $$0384 = $301; //@line 5786
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1380] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 5793
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 5796
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 5798
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 5800
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 5802
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 5807
    $309 = HEAP32[$308 >> 2] | 0; //@line 5808
    $310 = HEAP32[1380] | 0; //@line 5809
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 5815
     HEAP32[$308 >> 2] = $$1; //@line 5816
     HEAP32[$$1 + 8 >> 2] = $309; //@line 5818
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 5820
     HEAP32[$$1 + 24 >> 2] = 0; //@line 5822
     break;
    } else {
     _abort(); //@line 5825
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1384] | 0) + -1 | 0; //@line 5832
 HEAP32[1384] = $319; //@line 5833
 if (!$319) {
  $$0212$in$i = 5960; //@line 5836
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 5841
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 5847
  }
 }
 HEAP32[1384] = -1; //@line 5850
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11220
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 11226
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 11235
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 11240
      $19 = $1 + 44 | 0; //@line 11241
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 11250
      $26 = $1 + 52 | 0; //@line 11251
      $27 = $1 + 53 | 0; //@line 11252
      $28 = $1 + 54 | 0; //@line 11253
      $29 = $0 + 8 | 0; //@line 11254
      $30 = $1 + 24 | 0; //@line 11255
      $$081$off0 = 0; //@line 11256
      $$084 = $0 + 16 | 0; //@line 11256
      $$085$off0 = 0; //@line 11256
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 11260
        label = 20; //@line 11261
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 11264
       HEAP8[$27 >> 0] = 0; //@line 11265
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 11266
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 11267
       if (___async) {
        label = 12; //@line 11270
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 11273
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 11277
        label = 20; //@line 11278
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 11285
         $$186$off0 = $$085$off0; //@line 11285
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 11294
           label = 20; //@line 11295
           break L10;
          } else {
           $$182$off0 = 1; //@line 11298
           $$186$off0 = $$085$off0; //@line 11298
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 11305
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 11312
          break L10;
         } else {
          $$182$off0 = 1; //@line 11315
          $$186$off0 = 1; //@line 11315
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 11320
       $$084 = $$084 + 8 | 0; //@line 11320
       $$085$off0 = $$186$off0; //@line 11320
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 137; //@line 11323
       HEAP32[$AsyncCtx15 + 4 >> 2] = $19; //@line 11325
       HEAP32[$AsyncCtx15 + 8 >> 2] = $28; //@line 11327
       HEAP32[$AsyncCtx15 + 12 >> 2] = $30; //@line 11329
       HEAP32[$AsyncCtx15 + 16 >> 2] = $2; //@line 11331
       HEAP32[$AsyncCtx15 + 20 >> 2] = $13; //@line 11333
       HEAP32[$AsyncCtx15 + 24 >> 2] = $1; //@line 11335
       HEAP32[$AsyncCtx15 + 28 >> 2] = $25; //@line 11337
       HEAP8[$AsyncCtx15 + 32 >> 0] = $$085$off0 & 1; //@line 11340
       HEAP8[$AsyncCtx15 + 33 >> 0] = $$081$off0 & 1; //@line 11343
       HEAP32[$AsyncCtx15 + 36 >> 2] = $$084; //@line 11345
       HEAP32[$AsyncCtx15 + 40 >> 2] = $29; //@line 11347
       HEAP32[$AsyncCtx15 + 44 >> 2] = $26; //@line 11349
       HEAP32[$AsyncCtx15 + 48 >> 2] = $27; //@line 11351
       HEAP8[$AsyncCtx15 + 52 >> 0] = $4 & 1; //@line 11354
       sp = STACKTOP; //@line 11355
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 11361
         $61 = $1 + 40 | 0; //@line 11362
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 11365
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 11373
           if ($$283$off0) {
            label = 25; //@line 11375
            break;
           } else {
            $69 = 4; //@line 11378
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 11385
        } else {
         $69 = 4; //@line 11387
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 11392
      }
      HEAP32[$19 >> 2] = $69; //@line 11394
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 11403
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 11408
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 11409
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 11410
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 11411
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 138; //@line 11414
    HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 11416
    HEAP32[$AsyncCtx11 + 8 >> 2] = $73; //@line 11418
    HEAP32[$AsyncCtx11 + 12 >> 2] = $1; //@line 11420
    HEAP32[$AsyncCtx11 + 16 >> 2] = $2; //@line 11422
    HEAP32[$AsyncCtx11 + 20 >> 2] = $3; //@line 11424
    HEAP8[$AsyncCtx11 + 24 >> 0] = $4 & 1; //@line 11427
    HEAP32[$AsyncCtx11 + 28 >> 2] = $72; //@line 11429
    sp = STACKTOP; //@line 11430
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 11433
   $81 = $0 + 24 | 0; //@line 11434
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 11438
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 11442
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 11449
       $$2 = $81; //@line 11450
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 11462
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 11463
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 11468
        $136 = $$2 + 8 | 0; //@line 11469
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 11472
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 141; //@line 11477
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 11479
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 11481
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 11483
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 11485
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 11487
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 11489
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 11491
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 11494
       sp = STACKTOP; //@line 11495
       return;
      }
      $104 = $1 + 24 | 0; //@line 11498
      $105 = $1 + 54 | 0; //@line 11499
      $$1 = $81; //@line 11500
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 11516
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 11517
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11522
       $122 = $$1 + 8 | 0; //@line 11523
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 11526
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 140; //@line 11531
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 11533
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 11535
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 11537
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 11539
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 11541
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 11543
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 11545
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 11547
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 11550
      sp = STACKTOP; //@line 11551
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 11555
    $$0 = $81; //@line 11556
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 11563
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 11564
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 11569
     $100 = $$0 + 8 | 0; //@line 11570
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 11573
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 139; //@line 11578
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 11580
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 11582
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 11584
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 11586
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 11588
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 11590
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 11593
    sp = STACKTOP; //@line 11594
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
 $n_sroa_0_0_extract_trunc = $a$0; //@line 1857
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 1858
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 1859
 $d_sroa_0_0_extract_trunc = $b$0; //@line 1860
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 1861
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 1862
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 1864
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 1867
    HEAP32[$rem + 4 >> 2] = 0; //@line 1868
   }
   $_0$1 = 0; //@line 1870
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 1871
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1872
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 1875
    $_0$0 = 0; //@line 1876
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1877
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 1879
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 1880
   $_0$1 = 0; //@line 1881
   $_0$0 = 0; //@line 1882
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1883
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 1886
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 1891
     HEAP32[$rem + 4 >> 2] = 0; //@line 1892
    }
    $_0$1 = 0; //@line 1894
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 1895
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1896
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 1900
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 1901
    }
    $_0$1 = 0; //@line 1903
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 1904
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1905
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 1907
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 1910
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 1911
    }
    $_0$1 = 0; //@line 1913
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 1914
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1915
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 1918
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 1920
    $58 = 31 - $51 | 0; //@line 1921
    $sr_1_ph = $57; //@line 1922
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 1923
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 1924
    $q_sroa_0_1_ph = 0; //@line 1925
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 1926
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 1930
    $_0$0 = 0; //@line 1931
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1932
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 1934
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 1935
   $_0$1 = 0; //@line 1936
   $_0$0 = 0; //@line 1937
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1938
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 1942
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 1944
     $126 = 31 - $119 | 0; //@line 1945
     $130 = $119 - 31 >> 31; //@line 1946
     $sr_1_ph = $125; //@line 1947
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 1948
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 1949
     $q_sroa_0_1_ph = 0; //@line 1950
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 1951
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 1955
     $_0$0 = 0; //@line 1956
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1957
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 1959
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 1960
    $_0$1 = 0; //@line 1961
    $_0$0 = 0; //@line 1962
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1963
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 1965
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 1968
    $89 = 64 - $88 | 0; //@line 1969
    $91 = 32 - $88 | 0; //@line 1970
    $92 = $91 >> 31; //@line 1971
    $95 = $88 - 32 | 0; //@line 1972
    $105 = $95 >> 31; //@line 1973
    $sr_1_ph = $88; //@line 1974
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 1975
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 1976
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 1977
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 1978
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 1982
    HEAP32[$rem + 4 >> 2] = 0; //@line 1983
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 1986
    $_0$0 = $a$0 | 0 | 0; //@line 1987
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1988
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 1990
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 1991
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 1992
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 1993
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 1998
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 1999
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 2000
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 2001
  $carry_0_lcssa$1 = 0; //@line 2002
  $carry_0_lcssa$0 = 0; //@line 2003
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 2005
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 2006
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 2007
  $137$1 = tempRet0; //@line 2008
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 2009
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 2010
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 2011
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 2012
  $sr_1202 = $sr_1_ph; //@line 2013
  $carry_0203 = 0; //@line 2014
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 2016
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 2017
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 2018
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 2019
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 2020
   $150$1 = tempRet0; //@line 2021
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 2022
   $carry_0203 = $151$0 & 1; //@line 2023
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 2025
   $r_sroa_1_1200 = tempRet0; //@line 2026
   $sr_1202 = $sr_1202 - 1 | 0; //@line 2027
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 2039
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 2040
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 2041
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 2042
  $carry_0_lcssa$1 = 0; //@line 2043
  $carry_0_lcssa$0 = $carry_0203; //@line 2044
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 2046
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 2047
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 2050
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 2051
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 2053
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 2054
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 2055
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
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1020
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 1022
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
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 657
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 659
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 661
  sp = STACKTOP; //@line 662
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 665
 $13 = HEAP32[(HEAP32[$0 >> 2] | 0) + 24 >> 2] | 0; //@line 668
 $AsyncCtx2 = _emscripten_alloc_async_context(16, sp) | 0; //@line 669
 $14 = FUNCTION_TABLE_i[$13 & 3]() | 0; //@line 670
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 43; //@line 673
  HEAP32[$AsyncCtx2 + 4 >> 2] = $1; //@line 675
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 677
  HEAP32[$AsyncCtx2 + 12 >> 2] = $0; //@line 679
  sp = STACKTOP; //@line 680
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 683
 $18 = HEAP32[$14 >> 2] | 0; //@line 684
 do {
  if (!$18) {
   $AsyncCtx20 = _emscripten_alloc_async_context(20, sp) | 0; //@line 688
   _mbed_assert_internal(1383, 1385, 41); //@line 689
   if (___async) {
    HEAP32[$AsyncCtx20 >> 2] = 44; //@line 692
    HEAP32[$AsyncCtx20 + 4 >> 2] = $1; //@line 694
    HEAP32[$AsyncCtx20 + 8 >> 2] = $0; //@line 696
    HEAP32[$AsyncCtx20 + 12 >> 2] = $14; //@line 698
    HEAP32[$AsyncCtx20 + 16 >> 2] = $0; //@line 700
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
   _mbed_assert_internal(1383, 1385, 47); //@line 719
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
function _schedule_interrupt__async_cb($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $102 = 0, $105 = 0, $107 = 0, $110 = 0, $111 = 0, $113 = 0, $116 = 0, $12 = 0, $124 = 0, $125 = 0, $126 = 0, $128 = 0, $130 = 0, $135 = 0, $142 = 0, $144 = 0, $146 = 0, $149 = 0, $151 = 0, $158 = 0, $159 = 0, $162 = 0, $164 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $177 = 0, $180 = 0, $19 = 0, $2 = 0, $20 = 0, $22 = 0, $23 = 0, $26 = 0, $27 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $44 = 0, $45 = 0, $46 = 0, $48 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $58 = 0, $60 = 0, $61 = 0, $67 = 0, $68 = 0, $69 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $82 = 0, $86 = 0, $87 = 0, $9 = 0, $93 = 0, $94 = 0, $95 = 0, $97 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 209
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 211
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 213
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 217
 $8 = HEAP32[HEAP32[$0 + 12 >> 2] >> 2] | 0; //@line 218
 $9 = $8 + 32 | 0; //@line 219
 if (($AsyncRetVal | 0) != (HEAP32[$9 >> 2] | 0)) {
  $12 = $4 + 32 | 0; //@line 223
  $17 = $AsyncRetVal - (HEAP32[$12 >> 2] | 0) & HEAP32[$4 + 12 >> 2]; //@line 228
  HEAP32[$12 >> 2] = $AsyncRetVal; //@line 229
  $19 = HEAP32[$4 + 8 >> 2] | 0; //@line 231
  L4 : do {
   if (($19 | 0) < 1e6) {
    switch ($19 | 0) {
    case 32768:
     {
      break;
     }
    default:
     {
      label = 6; //@line 240
      break L4;
     }
    }
    $20 = ___muldi3($17 | 0, 0, 1e6, 0) | 0; //@line 244
    $22 = _bitshift64Lshr($20 | 0, tempRet0 | 0, 15) | 0; //@line 246
    $23 = tempRet0; //@line 247
    $26 = $4 + 40 | 0; //@line 250
    $27 = $26; //@line 251
    $33 = _i64Add(HEAP32[$27 >> 2] | 0, HEAP32[$27 + 4 >> 2] | 0, $17 * 1e6 & 32704 | 0, 0) | 0; //@line 257
    $34 = tempRet0; //@line 258
    $35 = $26; //@line 259
    HEAP32[$35 >> 2] = $33; //@line 261
    HEAP32[$35 + 4 >> 2] = $34; //@line 264
    if ($34 >>> 0 < 0 | ($34 | 0) == 0 & $33 >>> 0 < 32768) {
     $93 = $22; //@line 271
     $94 = $23; //@line 271
    } else {
     $44 = _i64Add($22 | 0, $23 | 0, 1, 0) | 0; //@line 273
     $45 = tempRet0; //@line 274
     $46 = _i64Add($33 | 0, $34 | 0, -32768, -1) | 0; //@line 275
     $48 = $26; //@line 277
     HEAP32[$48 >> 2] = $46; //@line 279
     HEAP32[$48 + 4 >> 2] = tempRet0; //@line 282
     $93 = $44; //@line 283
     $94 = $45; //@line 283
    }
   } else {
    switch ($19 | 0) {
    case 1e6:
     {
      $93 = $17; //@line 288
      $94 = 0; //@line 288
      break;
     }
    default:
     {
      label = 6; //@line 292
     }
    }
   }
  } while (0);
  if ((label | 0) == 6) {
   $52 = ___muldi3($17 | 0, 0, 1e6, 0) | 0; //@line 298
   $53 = tempRet0; //@line 299
   $54 = ___udivdi3($52 | 0, $53 | 0, $19 | 0, 0) | 0; //@line 300
   $55 = tempRet0; //@line 301
   $56 = ___muldi3($54 | 0, $55 | 0, $19 | 0, 0) | 0; //@line 302
   $58 = _i64Subtract($52 | 0, $53 | 0, $56 | 0, tempRet0 | 0) | 0; //@line 304
   $60 = $4 + 40 | 0; //@line 306
   $61 = $60; //@line 307
   $67 = _i64Add($58 | 0, tempRet0 | 0, HEAP32[$61 >> 2] | 0, HEAP32[$61 + 4 >> 2] | 0) | 0; //@line 313
   $68 = tempRet0; //@line 314
   $69 = $60; //@line 315
   HEAP32[$69 >> 2] = $67; //@line 317
   HEAP32[$69 + 4 >> 2] = $68; //@line 320
   if ($68 >>> 0 < 0 | ($68 | 0) == 0 & $67 >>> 0 < $19 >>> 0) {
    $93 = $54; //@line 327
    $94 = $55; //@line 327
   } else {
    $78 = _i64Add($54 | 0, $55 | 0, 1, 0) | 0; //@line 329
    $79 = tempRet0; //@line 330
    $80 = _i64Subtract($67 | 0, $68 | 0, $19 | 0, 0) | 0; //@line 331
    $82 = $60; //@line 333
    HEAP32[$82 >> 2] = $80; //@line 335
    HEAP32[$82 + 4 >> 2] = tempRet0; //@line 338
    $93 = $78; //@line 339
    $94 = $79; //@line 339
   }
  }
  $86 = $4 + 48 | 0; //@line 342
  $87 = $86; //@line 343
  $95 = _i64Add(HEAP32[$87 >> 2] | 0, HEAP32[$87 + 4 >> 2] | 0, $93 | 0, $94 | 0) | 0; //@line 349
  $97 = $86; //@line 351
  HEAP32[$97 >> 2] = $95; //@line 353
  HEAP32[$97 + 4 >> 2] = tempRet0; //@line 356
 }
 $102 = HEAP32[$8 + 4 >> 2] | 0; //@line 359
 if (!$102) {
  $177 = (HEAP32[$4 + 16 >> 2] | 0) + (HEAP32[$4 + 32 >> 2] | 0) & HEAP32[$4 + 12 >> 2]; //@line 369
  $180 = HEAP32[(HEAP32[$2 >> 2] | 0) + 16 >> 2] | 0; //@line 372
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 373
  FUNCTION_TABLE_vi[$180 & 255]($177); //@line 374
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 377
   sp = STACKTOP; //@line 378
   return;
  }
  ___async_unwind = 0; //@line 381
  HEAP32[$ReallocAsyncCtx7 >> 2] = 55; //@line 382
  sp = STACKTOP; //@line 383
  return;
 }
 $105 = $8 + 48 | 0; //@line 387
 $107 = HEAP32[$105 >> 2] | 0; //@line 389
 $110 = HEAP32[$105 + 4 >> 2] | 0; //@line 392
 $111 = $102; //@line 393
 $113 = HEAP32[$111 >> 2] | 0; //@line 395
 $116 = HEAP32[$111 + 4 >> 2] | 0; //@line 398
 if (!($116 >>> 0 > $110 >>> 0 | ($116 | 0) == ($110 | 0) & $113 >>> 0 > $107 >>> 0)) {
  $124 = HEAP32[(HEAP32[$2 >> 2] | 0) + 20 >> 2] | 0; //@line 407
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 408
  FUNCTION_TABLE_v[$124 & 15](); //@line 409
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 50; //@line 412
   sp = STACKTOP; //@line 413
   return;
  }
  ___async_unwind = 0; //@line 416
  HEAP32[$ReallocAsyncCtx2 >> 2] = 50; //@line 417
  sp = STACKTOP; //@line 418
  return;
 }
 $125 = _i64Subtract($113 | 0, $116 | 0, $107 | 0, $110 | 0) | 0; //@line 421
 $126 = tempRet0; //@line 422
 $128 = HEAP32[$8 + 16 >> 2] | 0; //@line 424
 $130 = $8 + 24 | 0; //@line 426
 $135 = HEAP32[$130 + 4 >> 2] | 0; //@line 431
 L28 : do {
  if ($126 >>> 0 > $135 >>> 0 | (($126 | 0) == ($135 | 0) ? $125 >>> 0 > (HEAP32[$130 >> 2] | 0) >>> 0 : 0)) {
   $$0$i = $128; //@line 439
  } else {
   $142 = HEAP32[$8 + 8 >> 2] | 0; //@line 442
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
     $144 = _bitshift64Shl($125 | 0, $126 | 0, 15) | 0; //@line 454
     $146 = ___udivdi3($144 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 456
     $$0$i = $128 >>> 0 < $146 >>> 0 ? $128 : $146; //@line 460
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
     $$0$i = $128 >>> 0 < $125 >>> 0 ? $128 : $125; //@line 473
     break L28;
    }
   } while (0);
   $149 = ___muldi3($125 | 0, $126 | 0, $142 | 0, 0) | 0; //@line 477
   $151 = ___udivdi3($149 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 479
   $$0$i = $128 >>> 0 < $151 >>> 0 ? $128 : $151; //@line 483
  }
 } while (0);
 $158 = (HEAP32[$9 >> 2] | 0) + $$0$i & HEAP32[$8 + 12 >> 2]; //@line 490
 $159 = $4 + 32 | 0; //@line 491
 $162 = HEAP32[$2 >> 2] | 0; //@line 494
 if (($158 | 0) == (HEAP32[$159 >> 2] | 0)) {
  $164 = HEAP32[$162 + 20 >> 2] | 0; //@line 497
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 498
  FUNCTION_TABLE_v[$164 & 15](); //@line 499
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 51; //@line 502
   sp = STACKTOP; //@line 503
   return;
  }
  ___async_unwind = 0; //@line 506
  HEAP32[$ReallocAsyncCtx3 >> 2] = 51; //@line 507
  sp = STACKTOP; //@line 508
  return;
 } else {
  $166 = HEAP32[$162 + 16 >> 2] | 0; //@line 512
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 513
  FUNCTION_TABLE_vi[$166 & 255]($158); //@line 514
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 52; //@line 517
   $167 = $ReallocAsyncCtx4 + 4 | 0; //@line 518
   HEAP32[$167 >> 2] = $2; //@line 519
   $168 = $ReallocAsyncCtx4 + 8 | 0; //@line 520
   HEAP32[$168 >> 2] = $159; //@line 521
   $169 = $ReallocAsyncCtx4 + 12 | 0; //@line 522
   HEAP32[$169 >> 2] = $158; //@line 523
   sp = STACKTOP; //@line 524
   return;
  }
  ___async_unwind = 0; //@line 527
  HEAP32[$ReallocAsyncCtx4 >> 2] = 52; //@line 528
  $167 = $ReallocAsyncCtx4 + 4 | 0; //@line 529
  HEAP32[$167 >> 2] = $2; //@line 530
  $168 = $ReallocAsyncCtx4 + 8 | 0; //@line 531
  HEAP32[$168 >> 2] = $159; //@line 532
  $169 = $ReallocAsyncCtx4 + 12 | 0; //@line 533
  HEAP32[$169 >> 2] = $158; //@line 534
  sp = STACKTOP; //@line 535
  return;
 }
}
function _main() {
 var $0 = 0, $1 = 0, $13 = 0, $17 = 0, $2 = 0, $22 = 0, $25 = 0, $29 = 0, $33 = 0, $37 = 0, $40 = 0, $43 = 0, $47 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx22 = 0, $AsyncCtx25 = 0, $AsyncCtx28 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2355
 STACKTOP = STACKTOP + 48 | 0; //@line 2356
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 2356
 $0 = sp + 32 | 0; //@line 2357
 $1 = sp + 16 | 0; //@line 2358
 $2 = sp; //@line 2359
 $AsyncCtx19 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2360
 _puts(2062) | 0; //@line 2361
 if (___async) {
  HEAP32[$AsyncCtx19 >> 2] = 93; //@line 2364
  HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 2366
  HEAP32[$AsyncCtx19 + 8 >> 2] = $1; //@line 2368
  HEAP32[$AsyncCtx19 + 12 >> 2] = $2; //@line 2370
  sp = STACKTOP; //@line 2371
  STACKTOP = sp; //@line 2372
  return 0; //@line 2372
 }
 _emscripten_free_async_context($AsyncCtx19 | 0); //@line 2374
 $AsyncCtx15 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2375
 _puts(2075) | 0; //@line 2376
 if (___async) {
  HEAP32[$AsyncCtx15 >> 2] = 94; //@line 2379
  HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 2381
  HEAP32[$AsyncCtx15 + 8 >> 2] = $1; //@line 2383
  HEAP32[$AsyncCtx15 + 12 >> 2] = $2; //@line 2385
  sp = STACKTOP; //@line 2386
  STACKTOP = sp; //@line 2387
  return 0; //@line 2387
 }
 _emscripten_free_async_context($AsyncCtx15 | 0); //@line 2389
 $AsyncCtx11 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2390
 _puts(2178) | 0; //@line 2391
 if (___async) {
  HEAP32[$AsyncCtx11 >> 2] = 95; //@line 2394
  HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 2396
  HEAP32[$AsyncCtx11 + 8 >> 2] = $1; //@line 2398
  HEAP32[$AsyncCtx11 + 12 >> 2] = $2; //@line 2400
  sp = STACKTOP; //@line 2401
  STACKTOP = sp; //@line 2402
  return 0; //@line 2402
 }
 _emscripten_free_async_context($AsyncCtx11 | 0); //@line 2404
 $13 = $0 + 4 | 0; //@line 2406
 HEAP32[$13 >> 2] = 0; //@line 2408
 HEAP32[$13 + 4 >> 2] = 0; //@line 2411
 HEAP32[$0 >> 2] = 7; //@line 2412
 $17 = $0 + 12 | 0; //@line 2413
 HEAP32[$17 >> 2] = 440; //@line 2414
 $AsyncCtx25 = _emscripten_alloc_async_context(20, sp) | 0; //@line 2415
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5216, $0, 1.0); //@line 2416
 if (___async) {
  HEAP32[$AsyncCtx25 >> 2] = 96; //@line 2419
  HEAP32[$AsyncCtx25 + 4 >> 2] = $17; //@line 2421
  HEAP32[$AsyncCtx25 + 8 >> 2] = $1; //@line 2423
  HEAP32[$AsyncCtx25 + 12 >> 2] = $0; //@line 2425
  HEAP32[$AsyncCtx25 + 16 >> 2] = $2; //@line 2427
  sp = STACKTOP; //@line 2428
  STACKTOP = sp; //@line 2429
  return 0; //@line 2429
 }
 _emscripten_free_async_context($AsyncCtx25 | 0); //@line 2431
 $22 = HEAP32[$17 >> 2] | 0; //@line 2432
 do {
  if ($22 | 0) {
   $25 = HEAP32[$22 + 8 >> 2] | 0; //@line 2437
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 2438
   FUNCTION_TABLE_vi[$25 & 255]($0); //@line 2439
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 97; //@line 2442
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 2444
    HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 2446
    sp = STACKTOP; //@line 2447
    STACKTOP = sp; //@line 2448
    return 0; //@line 2448
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 2450
    break;
   }
  }
 } while (0);
 $29 = $1 + 4 | 0; //@line 2456
 HEAP32[$29 >> 2] = 0; //@line 2458
 HEAP32[$29 + 4 >> 2] = 0; //@line 2461
 HEAP32[$1 >> 2] = 8; //@line 2462
 $33 = $1 + 12 | 0; //@line 2463
 HEAP32[$33 >> 2] = 440; //@line 2464
 $AsyncCtx22 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2465
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5280, $1, 2.5); //@line 2466
 if (___async) {
  HEAP32[$AsyncCtx22 >> 2] = 98; //@line 2469
  HEAP32[$AsyncCtx22 + 4 >> 2] = $33; //@line 2471
  HEAP32[$AsyncCtx22 + 8 >> 2] = $2; //@line 2473
  HEAP32[$AsyncCtx22 + 12 >> 2] = $1; //@line 2475
  sp = STACKTOP; //@line 2476
  STACKTOP = sp; //@line 2477
  return 0; //@line 2477
 }
 _emscripten_free_async_context($AsyncCtx22 | 0); //@line 2479
 $37 = HEAP32[$33 >> 2] | 0; //@line 2480
 do {
  if ($37 | 0) {
   $40 = HEAP32[$37 + 8 >> 2] | 0; //@line 2485
   $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2486
   FUNCTION_TABLE_vi[$40 & 255]($1); //@line 2487
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 99; //@line 2490
    HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 2492
    sp = STACKTOP; //@line 2493
    STACKTOP = sp; //@line 2494
    return 0; //@line 2494
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2496
    break;
   }
  }
 } while (0);
 $43 = $2 + 4 | 0; //@line 2502
 HEAP32[$43 >> 2] = 0; //@line 2504
 HEAP32[$43 + 4 >> 2] = 0; //@line 2507
 HEAP32[$2 >> 2] = 9; //@line 2508
 $47 = $2 + 12 | 0; //@line 2509
 HEAP32[$47 >> 2] = 440; //@line 2510
 $AsyncCtx28 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2511
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5432, $2); //@line 2512
 if (___async) {
  HEAP32[$AsyncCtx28 >> 2] = 100; //@line 2515
  HEAP32[$AsyncCtx28 + 4 >> 2] = $47; //@line 2517
  HEAP32[$AsyncCtx28 + 8 >> 2] = $2; //@line 2519
  sp = STACKTOP; //@line 2520
  STACKTOP = sp; //@line 2521
  return 0; //@line 2521
 }
 _emscripten_free_async_context($AsyncCtx28 | 0); //@line 2523
 $50 = HEAP32[$47 >> 2] | 0; //@line 2524
 do {
  if ($50 | 0) {
   $53 = HEAP32[$50 + 8 >> 2] | 0; //@line 2529
   $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2530
   FUNCTION_TABLE_vi[$53 & 255]($2); //@line 2531
   if (___async) {
    HEAP32[$AsyncCtx7 >> 2] = 101; //@line 2534
    sp = STACKTOP; //@line 2535
    STACKTOP = sp; //@line 2536
    return 0; //@line 2536
   } else {
    _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2538
    break;
   }
  }
 } while (0);
 $AsyncCtx31 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2543
 _wait_ms(-1); //@line 2544
 if (___async) {
  HEAP32[$AsyncCtx31 >> 2] = 102; //@line 2547
  sp = STACKTOP; //@line 2548
  STACKTOP = sp; //@line 2549
  return 0; //@line 2549
 } else {
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 2551
  STACKTOP = sp; //@line 2552
  return 0; //@line 2552
 }
 return 0; //@line 2554
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0.0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $16 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $48 = 0, $6 = 0.0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 11937
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11941
 $6 = +HEAPF32[$0 + 12 >> 2]; //@line 11943
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11945
 $9 = $4 + 12 | 0; //@line 11947
 HEAP32[$9 >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 11948
 $10 = $6 * 1.0e6; //@line 11949
 $11 = ~~$10 >>> 0; //@line 11950
 $12 = +Math_abs($10) >= 1.0 ? $10 > 0.0 ? ~~+Math_min(+Math_floor($10 / 4294967296.0), 4294967295.0) >>> 0 : ~~+Math_ceil(($10 - +(~~$10 >>> 0)) / 4294967296.0) >>> 0 : 0; //@line 11951
 $13 = $8 + 40 | 0; //@line 11952
 do {
  if (($13 | 0) != ($4 | 0)) {
   $15 = $8 + 52 | 0; //@line 11956
   $16 = HEAP32[$15 >> 2] | 0; //@line 11957
   if ($16 | 0) {
    $19 = HEAP32[$16 + 8 >> 2] | 0; //@line 11961
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 11962
    FUNCTION_TABLE_vi[$19 & 255]($13); //@line 11963
    if (___async) {
     HEAP32[$ReallocAsyncCtx2 >> 2] = 104; //@line 11966
     $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 11967
     HEAP32[$20 >> 2] = $9; //@line 11968
     $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 11969
     HEAP32[$21 >> 2] = $15; //@line 11970
     $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 11971
     HEAP32[$22 >> 2] = $13; //@line 11972
     $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 11973
     HEAP32[$23 >> 2] = $4; //@line 11974
     $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 11975
     HEAP32[$24 >> 2] = $9; //@line 11976
     $25 = $ReallocAsyncCtx2 + 24 | 0; //@line 11977
     HEAP32[$25 >> 2] = $8; //@line 11978
     $26 = $ReallocAsyncCtx2 + 32 | 0; //@line 11979
     $27 = $26; //@line 11980
     $28 = $27; //@line 11981
     HEAP32[$28 >> 2] = $11; //@line 11982
     $29 = $27 + 4 | 0; //@line 11983
     $30 = $29; //@line 11984
     HEAP32[$30 >> 2] = $12; //@line 11985
     sp = STACKTOP; //@line 11986
     return;
    }
    ___async_unwind = 0; //@line 11989
    HEAP32[$ReallocAsyncCtx2 >> 2] = 104; //@line 11990
    $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 11991
    HEAP32[$20 >> 2] = $9; //@line 11992
    $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 11993
    HEAP32[$21 >> 2] = $15; //@line 11994
    $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 11995
    HEAP32[$22 >> 2] = $13; //@line 11996
    $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 11997
    HEAP32[$23 >> 2] = $4; //@line 11998
    $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 11999
    HEAP32[$24 >> 2] = $9; //@line 12000
    $25 = $ReallocAsyncCtx2 + 24 | 0; //@line 12001
    HEAP32[$25 >> 2] = $8; //@line 12002
    $26 = $ReallocAsyncCtx2 + 32 | 0; //@line 12003
    $27 = $26; //@line 12004
    $28 = $27; //@line 12005
    HEAP32[$28 >> 2] = $11; //@line 12006
    $29 = $27 + 4 | 0; //@line 12007
    $30 = $29; //@line 12008
    HEAP32[$30 >> 2] = $12; //@line 12009
    sp = STACKTOP; //@line 12010
    return;
   }
   $31 = HEAP32[$9 >> 2] | 0; //@line 12013
   if (!$31) {
    HEAP32[$15 >> 2] = 0; //@line 12016
    break;
   }
   $34 = HEAP32[$31 + 4 >> 2] | 0; //@line 12020
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 12021
   FUNCTION_TABLE_vii[$34 & 3]($13, $4); //@line 12022
   if (___async) {
    HEAP32[$ReallocAsyncCtx3 >> 2] = 105; //@line 12025
    $35 = $ReallocAsyncCtx3 + 4 | 0; //@line 12026
    HEAP32[$35 >> 2] = $9; //@line 12027
    $36 = $ReallocAsyncCtx3 + 8 | 0; //@line 12028
    HEAP32[$36 >> 2] = $15; //@line 12029
    $37 = $ReallocAsyncCtx3 + 12 | 0; //@line 12030
    HEAP32[$37 >> 2] = $8; //@line 12031
    $38 = $ReallocAsyncCtx3 + 16 | 0; //@line 12032
    $39 = $38; //@line 12033
    $40 = $39; //@line 12034
    HEAP32[$40 >> 2] = $11; //@line 12035
    $41 = $39 + 4 | 0; //@line 12036
    $42 = $41; //@line 12037
    HEAP32[$42 >> 2] = $12; //@line 12038
    $43 = $ReallocAsyncCtx3 + 24 | 0; //@line 12039
    HEAP32[$43 >> 2] = $9; //@line 12040
    $44 = $ReallocAsyncCtx3 + 28 | 0; //@line 12041
    HEAP32[$44 >> 2] = $4; //@line 12042
    sp = STACKTOP; //@line 12043
    return;
   }
   ___async_unwind = 0; //@line 12046
   HEAP32[$ReallocAsyncCtx3 >> 2] = 105; //@line 12047
   $35 = $ReallocAsyncCtx3 + 4 | 0; //@line 12048
   HEAP32[$35 >> 2] = $9; //@line 12049
   $36 = $ReallocAsyncCtx3 + 8 | 0; //@line 12050
   HEAP32[$36 >> 2] = $15; //@line 12051
   $37 = $ReallocAsyncCtx3 + 12 | 0; //@line 12052
   HEAP32[$37 >> 2] = $8; //@line 12053
   $38 = $ReallocAsyncCtx3 + 16 | 0; //@line 12054
   $39 = $38; //@line 12055
   $40 = $39; //@line 12056
   HEAP32[$40 >> 2] = $11; //@line 12057
   $41 = $39 + 4 | 0; //@line 12058
   $42 = $41; //@line 12059
   HEAP32[$42 >> 2] = $12; //@line 12060
   $43 = $ReallocAsyncCtx3 + 24 | 0; //@line 12061
   HEAP32[$43 >> 2] = $9; //@line 12062
   $44 = $ReallocAsyncCtx3 + 28 | 0; //@line 12063
   HEAP32[$44 >> 2] = $4; //@line 12064
   sp = STACKTOP; //@line 12065
   return;
  }
 } while (0);
 __ZN4mbed6Ticker5setupEy($8, $11, $12); //@line 12069
 $45 = HEAP32[$9 >> 2] | 0; //@line 12070
 if (!$45) {
  return;
 }
 $48 = HEAP32[$45 + 8 >> 2] | 0; //@line 12076
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 12077
 FUNCTION_TABLE_vi[$48 & 255]($4); //@line 12078
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 106; //@line 12081
  sp = STACKTOP; //@line 12082
  return;
 }
 ___async_unwind = 0; //@line 12085
 HEAP32[$ReallocAsyncCtx4 >> 2] = 106; //@line 12086
 sp = STACKTOP; //@line 12087
 return;
}
function _initialize__async_cb_66($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $27 = 0, $29 = 0, $30 = 0, $31 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 1044
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1046
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1048
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1050
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1052
 $8 = HEAP32[$AsyncRetVal >> 2] | 0; //@line 1053
 if (!$8) {
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(20) | 0; //@line 1056
  _mbed_assert_internal(1383, 1385, 41); //@line 1057
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 44; //@line 1060
   $10 = $ReallocAsyncCtx7 + 4 | 0; //@line 1061
   HEAP32[$10 >> 2] = $2; //@line 1062
   $11 = $ReallocAsyncCtx7 + 8 | 0; //@line 1063
   HEAP32[$11 >> 2] = $4; //@line 1064
   $12 = $ReallocAsyncCtx7 + 12 | 0; //@line 1065
   HEAP32[$12 >> 2] = $AsyncRetVal; //@line 1066
   $13 = $ReallocAsyncCtx7 + 16 | 0; //@line 1067
   HEAP32[$13 >> 2] = $6; //@line 1068
   sp = STACKTOP; //@line 1069
   return;
  }
  ___async_unwind = 0; //@line 1072
  HEAP32[$ReallocAsyncCtx7 >> 2] = 44; //@line 1073
  $10 = $ReallocAsyncCtx7 + 4 | 0; //@line 1074
  HEAP32[$10 >> 2] = $2; //@line 1075
  $11 = $ReallocAsyncCtx7 + 8 | 0; //@line 1076
  HEAP32[$11 >> 2] = $4; //@line 1077
  $12 = $ReallocAsyncCtx7 + 12 | 0; //@line 1078
  HEAP32[$12 >> 2] = $AsyncRetVal; //@line 1079
  $13 = $ReallocAsyncCtx7 + 16 | 0; //@line 1080
  HEAP32[$13 >> 2] = $6; //@line 1081
  sp = STACKTOP; //@line 1082
  return;
 }
 $15 = HEAP32[$AsyncRetVal + 4 >> 2] | 0; //@line 1086
 if (($15 + -4 | 0) >>> 0 > 28) {
  $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 1090
  _mbed_assert_internal(1383, 1385, 47); //@line 1091
  if (___async) {
   HEAP32[$ReallocAsyncCtx6 >> 2] = 45; //@line 1094
   $17 = $ReallocAsyncCtx6 + 4 | 0; //@line 1095
   HEAP32[$17 >> 2] = $8; //@line 1096
   $18 = $ReallocAsyncCtx6 + 8 | 0; //@line 1097
   HEAP32[$18 >> 2] = $2; //@line 1098
   $19 = $ReallocAsyncCtx6 + 12 | 0; //@line 1099
   HEAP32[$19 >> 2] = $4; //@line 1100
   $20 = $ReallocAsyncCtx6 + 16 | 0; //@line 1101
   HEAP32[$20 >> 2] = $6; //@line 1102
   sp = STACKTOP; //@line 1103
   return;
  }
  ___async_unwind = 0; //@line 1106
  HEAP32[$ReallocAsyncCtx6 >> 2] = 45; //@line 1107
  $17 = $ReallocAsyncCtx6 + 4 | 0; //@line 1108
  HEAP32[$17 >> 2] = $8; //@line 1109
  $18 = $ReallocAsyncCtx6 + 8 | 0; //@line 1110
  HEAP32[$18 >> 2] = $2; //@line 1111
  $19 = $ReallocAsyncCtx6 + 12 | 0; //@line 1112
  HEAP32[$19 >> 2] = $4; //@line 1113
  $20 = $ReallocAsyncCtx6 + 16 | 0; //@line 1114
  HEAP32[$20 >> 2] = $6; //@line 1115
  sp = STACKTOP; //@line 1116
  return;
 } else {
  $22 = 7 << $15 + -4; //@line 1120
  $23 = ___muldi3($22 | 0, 0, 1e6, 0) | 0; //@line 1121
  $24 = tempRet0; //@line 1122
  $25 = _i64Add($8 | 0, 0, -1, -1) | 0; //@line 1123
  $27 = _i64Add($25 | 0, tempRet0 | 0, $23 | 0, $24 | 0) | 0; //@line 1125
  $29 = ___udivdi3($27 | 0, tempRet0 | 0, $8 | 0, 0) | 0; //@line 1127
  $30 = tempRet0; //@line 1128
  $31 = HEAP32[$2 >> 2] | 0; //@line 1129
  HEAP32[$31 >> 2] = 0; //@line 1130
  HEAP32[$31 + 4 >> 2] = 0; //@line 1132
  $35 = HEAP32[(HEAP32[$4 >> 2] | 0) + 4 >> 2] | 0; //@line 1135
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 1136
  $36 = FUNCTION_TABLE_i[$35 & 3]() | 0; //@line 1137
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 1140
   $37 = $ReallocAsyncCtx3 + 4 | 0; //@line 1141
   HEAP32[$37 >> 2] = $2; //@line 1142
   $38 = $ReallocAsyncCtx3 + 8 | 0; //@line 1143
   HEAP32[$38 >> 2] = $8; //@line 1144
   $39 = $ReallocAsyncCtx3 + 12 | 0; //@line 1145
   HEAP32[$39 >> 2] = $15; //@line 1146
   $40 = $ReallocAsyncCtx3 + 16 | 0; //@line 1147
   HEAP32[$40 >> 2] = $22; //@line 1148
   $41 = $ReallocAsyncCtx3 + 24 | 0; //@line 1149
   $42 = $41; //@line 1150
   $43 = $42; //@line 1151
   HEAP32[$43 >> 2] = $29; //@line 1152
   $44 = $42 + 4 | 0; //@line 1153
   $45 = $44; //@line 1154
   HEAP32[$45 >> 2] = $30; //@line 1155
   $46 = $ReallocAsyncCtx3 + 32 | 0; //@line 1156
   HEAP32[$46 >> 2] = $4; //@line 1157
   $47 = $ReallocAsyncCtx3 + 36 | 0; //@line 1158
   HEAP32[$47 >> 2] = $6; //@line 1159
   sp = STACKTOP; //@line 1160
   return;
  }
  HEAP32[___async_retval >> 2] = $36; //@line 1164
  ___async_unwind = 0; //@line 1165
  HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 1166
  $37 = $ReallocAsyncCtx3 + 4 | 0; //@line 1167
  HEAP32[$37 >> 2] = $2; //@line 1168
  $38 = $ReallocAsyncCtx3 + 8 | 0; //@line 1169
  HEAP32[$38 >> 2] = $8; //@line 1170
  $39 = $ReallocAsyncCtx3 + 12 | 0; //@line 1171
  HEAP32[$39 >> 2] = $15; //@line 1172
  $40 = $ReallocAsyncCtx3 + 16 | 0; //@line 1173
  HEAP32[$40 >> 2] = $22; //@line 1174
  $41 = $ReallocAsyncCtx3 + 24 | 0; //@line 1175
  $42 = $41; //@line 1176
  $43 = $42; //@line 1177
  HEAP32[$43 >> 2] = $29; //@line 1178
  $44 = $42 + 4 | 0; //@line 1179
  $45 = $44; //@line 1180
  HEAP32[$45 >> 2] = $30; //@line 1181
  $46 = $ReallocAsyncCtx3 + 32 | 0; //@line 1182
  HEAP32[$46 >> 2] = $4; //@line 1183
  $47 = $ReallocAsyncCtx3 + 36 | 0; //@line 1184
  HEAP32[$47 >> 2] = $6; //@line 1185
  sp = STACKTOP; //@line 1186
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
 sp = STACKTOP; //@line 2564
 STACKTOP = STACKTOP + 16 | 0; //@line 2565
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2565
 $3 = sp; //@line 2566
 $4 = $1 + 12 | 0; //@line 2567
 $5 = HEAP32[$4 >> 2] | 0; //@line 2568
 do {
  if (!$5) {
   $14 = 0; //@line 2572
  } else {
   $8 = HEAP32[$5 + 4 >> 2] | 0; //@line 2575
   $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 2576
   FUNCTION_TABLE_vii[$8 & 3]($3, $1); //@line 2577
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 103; //@line 2580
    HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 2582
    HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 2584
    HEAPF32[$AsyncCtx + 12 >> 2] = $2; //@line 2586
    HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 2588
    sp = STACKTOP; //@line 2589
    STACKTOP = sp; //@line 2590
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 2592
    $14 = HEAP32[$4 >> 2] | 0; //@line 2594
    break;
   }
  }
 } while (0);
 $13 = $3 + 12 | 0; //@line 2599
 HEAP32[$13 >> 2] = $14; //@line 2600
 $15 = $2 * 1.0e6; //@line 2601
 $16 = ~~$15 >>> 0; //@line 2602
 $17 = +Math_abs($15) >= 1.0 ? $15 > 0.0 ? ~~+Math_min(+Math_floor($15 / 4294967296.0), 4294967295.0) >>> 0 : ~~+Math_ceil(($15 - +(~~$15 >>> 0)) / 4294967296.0) >>> 0 : 0; //@line 2603
 $18 = $0 + 40 | 0; //@line 2604
 if (($18 | 0) != ($3 | 0)) {
  $20 = $0 + 52 | 0; //@line 2607
  $21 = HEAP32[$20 >> 2] | 0; //@line 2608
  do {
   if ($21 | 0) {
    $24 = HEAP32[$21 + 8 >> 2] | 0; //@line 2613
    $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 2614
    FUNCTION_TABLE_vi[$24 & 255]($18); //@line 2615
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 104; //@line 2618
     HEAP32[$AsyncCtx3 + 4 >> 2] = $13; //@line 2620
     HEAP32[$AsyncCtx3 + 8 >> 2] = $20; //@line 2622
     HEAP32[$AsyncCtx3 + 12 >> 2] = $18; //@line 2624
     HEAP32[$AsyncCtx3 + 16 >> 2] = $3; //@line 2626
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 2628
     HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 2630
     $32 = $AsyncCtx3 + 32 | 0; //@line 2632
     HEAP32[$32 >> 2] = $16; //@line 2634
     HEAP32[$32 + 4 >> 2] = $17; //@line 2637
     sp = STACKTOP; //@line 2638
     STACKTOP = sp; //@line 2639
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2641
     break;
    }
   }
  } while (0);
  $36 = HEAP32[$13 >> 2] | 0; //@line 2646
  do {
   if (!$36) {
    $50 = 0; //@line 2650
   } else {
    $39 = HEAP32[$36 + 4 >> 2] | 0; //@line 2653
    $AsyncCtx6 = _emscripten_alloc_async_context(32, sp) | 0; //@line 2654
    FUNCTION_TABLE_vii[$39 & 3]($18, $3); //@line 2655
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 105; //@line 2658
     HEAP32[$AsyncCtx6 + 4 >> 2] = $13; //@line 2660
     HEAP32[$AsyncCtx6 + 8 >> 2] = $20; //@line 2662
     HEAP32[$AsyncCtx6 + 12 >> 2] = $0; //@line 2664
     $44 = $AsyncCtx6 + 16 | 0; //@line 2666
     HEAP32[$44 >> 2] = $16; //@line 2668
     HEAP32[$44 + 4 >> 2] = $17; //@line 2671
     HEAP32[$AsyncCtx6 + 24 >> 2] = $13; //@line 2673
     HEAP32[$AsyncCtx6 + 28 >> 2] = $3; //@line 2675
     sp = STACKTOP; //@line 2676
     STACKTOP = sp; //@line 2677
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 2679
     $50 = HEAP32[$13 >> 2] | 0; //@line 2681
     break;
    }
   }
  } while (0);
  HEAP32[$20 >> 2] = $50; //@line 2686
 }
 __ZN4mbed6Ticker5setupEy($0, $16, $17); //@line 2688
 $51 = HEAP32[$13 >> 2] | 0; //@line 2689
 if (!$51) {
  STACKTOP = sp; //@line 2692
  return;
 }
 $54 = HEAP32[$51 + 8 >> 2] | 0; //@line 2695
 $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2696
 FUNCTION_TABLE_vi[$54 & 255]($3); //@line 2697
 if (___async) {
  HEAP32[$AsyncCtx10 >> 2] = 106; //@line 2700
  sp = STACKTOP; //@line 2701
  STACKTOP = sp; //@line 2702
  return;
 }
 _emscripten_free_async_context($AsyncCtx10 | 0); //@line 2704
 STACKTOP = sp; //@line 2705
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_39($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13855
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13857
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13859
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13861
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13863
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13865
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13867
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 13869
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 13872
 $18 = HEAP8[$0 + 33 >> 0] & 1; //@line 13875
 $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 13877
 $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 13879
 $24 = HEAP32[$0 + 44 >> 2] | 0; //@line 13881
 $26 = HEAP32[$0 + 48 >> 2] | 0; //@line 13883
 $28 = HEAP8[$0 + 52 >> 0] & 1; //@line 13886
 L2 : do {
  if (!(HEAP8[$4 >> 0] | 0)) {
   do {
    if (!(HEAP8[$26 >> 0] | 0)) {
     $$182$off0 = $18; //@line 13895
     $$186$off0 = $16; //@line 13895
    } else {
     if (!(HEAP8[$24 >> 0] | 0)) {
      if (!(HEAP32[$22 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $16; //@line 13904
       $$283$off0 = 1; //@line 13904
       label = 13; //@line 13905
       break L2;
      } else {
       $$182$off0 = 1; //@line 13908
       $$186$off0 = $16; //@line 13908
       break;
      }
     }
     if ((HEAP32[$6 >> 2] | 0) == 1) {
      label = 18; //@line 13915
      break L2;
     }
     if (!(HEAP32[$22 >> 2] & 2)) {
      label = 18; //@line 13922
      break L2;
     } else {
      $$182$off0 = 1; //@line 13925
      $$186$off0 = 1; //@line 13925
     }
    }
   } while (0);
   $30 = $20 + 8 | 0; //@line 13929
   if ($30 >>> 0 < $14 >>> 0) {
    HEAP8[$24 >> 0] = 0; //@line 13932
    HEAP8[$26 >> 0] = 0; //@line 13933
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 13934
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $12, $8, $8, 1, $28); //@line 13935
    if (!___async) {
     ___async_unwind = 0; //@line 13938
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 137; //@line 13940
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 13942
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 13944
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 13946
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 13948
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 13950
    HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $12; //@line 13952
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 13954
    HEAP8[$ReallocAsyncCtx5 + 32 >> 0] = $$186$off0 & 1; //@line 13957
    HEAP8[$ReallocAsyncCtx5 + 33 >> 0] = $$182$off0 & 1; //@line 13960
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $30; //@line 13962
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $22; //@line 13964
    HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $24; //@line 13966
    HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $26; //@line 13968
    HEAP8[$ReallocAsyncCtx5 + 52 >> 0] = $28 & 1; //@line 13971
    sp = STACKTOP; //@line 13972
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 13975
    $$283$off0 = $$182$off0; //@line 13975
    label = 13; //@line 13976
   }
  } else {
   $$085$off0$reg2mem$0 = $16; //@line 13979
   $$283$off0 = $18; //@line 13979
   label = 13; //@line 13980
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$10 >> 2] = $8; //@line 13986
    $59 = $12 + 40 | 0; //@line 13987
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 13990
    if ((HEAP32[$12 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$6 >> 2] | 0) == 2) {
      HEAP8[$4 >> 0] = 1; //@line 13998
      if ($$283$off0) {
       label = 18; //@line 14000
       break;
      } else {
       $67 = 4; //@line 14003
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 14010
   } else {
    $67 = 4; //@line 14012
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 14017
 }
 HEAP32[$2 >> 2] = $67; //@line 14019
 return;
}
function _initialize__async_cb_71($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $25 = 0, $26 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 1566
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1568
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1570
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1574
 $10 = HEAP32[(HEAP32[$0 + 12 >> 2] | 0) + 4 >> 2] | 0; //@line 1576
 if (($10 + -4 | 0) >>> 0 > 28) {
  $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 1580
  _mbed_assert_internal(1383, 1385, 47); //@line 1581
  if (___async) {
   HEAP32[$ReallocAsyncCtx6 >> 2] = 45; //@line 1584
   $12 = $ReallocAsyncCtx6 + 4 | 0; //@line 1585
   HEAP32[$12 >> 2] = 1e6; //@line 1586
   $13 = $ReallocAsyncCtx6 + 8 | 0; //@line 1587
   HEAP32[$13 >> 2] = $2; //@line 1588
   $14 = $ReallocAsyncCtx6 + 12 | 0; //@line 1589
   HEAP32[$14 >> 2] = $4; //@line 1590
   $15 = $ReallocAsyncCtx6 + 16 | 0; //@line 1591
   HEAP32[$15 >> 2] = $8; //@line 1592
   sp = STACKTOP; //@line 1593
   return;
  }
  ___async_unwind = 0; //@line 1596
  HEAP32[$ReallocAsyncCtx6 >> 2] = 45; //@line 1597
  $12 = $ReallocAsyncCtx6 + 4 | 0; //@line 1598
  HEAP32[$12 >> 2] = 1e6; //@line 1599
  $13 = $ReallocAsyncCtx6 + 8 | 0; //@line 1600
  HEAP32[$13 >> 2] = $2; //@line 1601
  $14 = $ReallocAsyncCtx6 + 12 | 0; //@line 1602
  HEAP32[$14 >> 2] = $4; //@line 1603
  $15 = $ReallocAsyncCtx6 + 16 | 0; //@line 1604
  HEAP32[$15 >> 2] = $8; //@line 1605
  sp = STACKTOP; //@line 1606
  return;
 } else {
  $17 = 7 << $10 + -4; //@line 1610
  $18 = ___muldi3($17 | 0, 0, 1e6, 0) | 0; //@line 1611
  $19 = tempRet0; //@line 1612
  $20 = _i64Add(1e6, 0, -1, -1) | 0; //@line 1613
  $22 = _i64Add($20 | 0, tempRet0 | 0, $18 | 0, $19 | 0) | 0; //@line 1615
  $24 = ___udivdi3($22 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 1617
  $25 = tempRet0; //@line 1618
  $26 = HEAP32[$2 >> 2] | 0; //@line 1619
  HEAP32[$26 >> 2] = 0; //@line 1620
  HEAP32[$26 + 4 >> 2] = 0; //@line 1622
  $30 = HEAP32[(HEAP32[$4 >> 2] | 0) + 4 >> 2] | 0; //@line 1625
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 1626
  $31 = FUNCTION_TABLE_i[$30 & 3]() | 0; //@line 1627
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 1630
   $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 1631
   HEAP32[$32 >> 2] = $2; //@line 1632
   $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 1633
   HEAP32[$33 >> 2] = 1e6; //@line 1634
   $34 = $ReallocAsyncCtx3 + 12 | 0; //@line 1635
   HEAP32[$34 >> 2] = $10; //@line 1636
   $35 = $ReallocAsyncCtx3 + 16 | 0; //@line 1637
   HEAP32[$35 >> 2] = $17; //@line 1638
   $36 = $ReallocAsyncCtx3 + 24 | 0; //@line 1639
   $37 = $36; //@line 1640
   $38 = $37; //@line 1641
   HEAP32[$38 >> 2] = $24; //@line 1642
   $39 = $37 + 4 | 0; //@line 1643
   $40 = $39; //@line 1644
   HEAP32[$40 >> 2] = $25; //@line 1645
   $41 = $ReallocAsyncCtx3 + 32 | 0; //@line 1646
   HEAP32[$41 >> 2] = $4; //@line 1647
   $42 = $ReallocAsyncCtx3 + 36 | 0; //@line 1648
   HEAP32[$42 >> 2] = $8; //@line 1649
   sp = STACKTOP; //@line 1650
   return;
  }
  HEAP32[___async_retval >> 2] = $31; //@line 1654
  ___async_unwind = 0; //@line 1655
  HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 1656
  $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 1657
  HEAP32[$32 >> 2] = $2; //@line 1658
  $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 1659
  HEAP32[$33 >> 2] = 1e6; //@line 1660
  $34 = $ReallocAsyncCtx3 + 12 | 0; //@line 1661
  HEAP32[$34 >> 2] = $10; //@line 1662
  $35 = $ReallocAsyncCtx3 + 16 | 0; //@line 1663
  HEAP32[$35 >> 2] = $17; //@line 1664
  $36 = $ReallocAsyncCtx3 + 24 | 0; //@line 1665
  $37 = $36; //@line 1666
  $38 = $37; //@line 1667
  HEAP32[$38 >> 2] = $24; //@line 1668
  $39 = $37 + 4 | 0; //@line 1669
  $40 = $39; //@line 1670
  HEAP32[$40 >> 2] = $25; //@line 1671
  $41 = $ReallocAsyncCtx3 + 32 | 0; //@line 1672
  HEAP32[$41 >> 2] = $4; //@line 1673
  $42 = $ReallocAsyncCtx3 + 36 | 0; //@line 1674
  HEAP32[$42 >> 2] = $8; //@line 1675
  sp = STACKTOP; //@line 1676
  return;
 }
}
function _initialize__async_cb_68($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $23 = 0, $24 = 0, $25 = 0, $27 = 0, $28 = 0, $31 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $48 = 0, $49 = 0, $50 = 0, $52 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $62 = 0, $64 = 0, $70 = 0, $71 = 0, $72 = 0, $81 = 0, $82 = 0, $83 = 0, $85 = 0, $89 = 0, $95 = 0, $96 = 0, $97 = 0, $99 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1308
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1312
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1314
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1318
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1320
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1322
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1324
 if (($AsyncRetVal | 0) != (HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 32 >> 2] | 0)) {
  $23 = $AsyncRetVal - (HEAP32[$6 >> 2] | 0) & HEAP32[HEAP32[$0 + 16 >> 2] >> 2]; //@line 1333
  HEAP32[$6 >> 2] = $AsyncRetVal; //@line 1334
  $24 = HEAP32[$10 >> 2] | 0; //@line 1335
  L4 : do {
   if (($24 | 0) < 1e6) {
    switch ($24 | 0) {
    case 32768:
     {
      break;
     }
    default:
     {
      label = 6; //@line 1344
      break L4;
     }
    }
    $25 = ___muldi3($23 | 0, 0, 1e6, 0) | 0; //@line 1348
    $27 = _bitshift64Lshr($25 | 0, tempRet0 | 0, 15) | 0; //@line 1350
    $28 = tempRet0; //@line 1351
    $31 = $12; //@line 1354
    $37 = _i64Add(HEAP32[$31 >> 2] | 0, HEAP32[$31 + 4 >> 2] | 0, $23 * 1e6 & 32704 | 0, 0) | 0; //@line 1360
    $38 = tempRet0; //@line 1361
    $39 = $12; //@line 1362
    HEAP32[$39 >> 2] = $37; //@line 1364
    HEAP32[$39 + 4 >> 2] = $38; //@line 1367
    if ($38 >>> 0 < 0 | ($38 | 0) == 0 & $37 >>> 0 < 32768) {
     $95 = $27; //@line 1374
     $96 = $28; //@line 1374
    } else {
     $48 = _i64Add($27 | 0, $28 | 0, 1, 0) | 0; //@line 1376
     $49 = tempRet0; //@line 1377
     $50 = _i64Add($37 | 0, $38 | 0, -32768, -1) | 0; //@line 1378
     $52 = $12; //@line 1380
     HEAP32[$52 >> 2] = $50; //@line 1382
     HEAP32[$52 + 4 >> 2] = tempRet0; //@line 1385
     $95 = $48; //@line 1386
     $96 = $49; //@line 1386
    }
   } else {
    switch ($24 | 0) {
    case 1e6:
     {
      $95 = $23; //@line 1391
      $96 = 0; //@line 1391
      break;
     }
    default:
     {
      label = 6; //@line 1395
     }
    }
   }
  } while (0);
  if ((label | 0) == 6) {
   $56 = ___muldi3($23 | 0, 0, 1e6, 0) | 0; //@line 1401
   $57 = tempRet0; //@line 1402
   $58 = ___udivdi3($56 | 0, $57 | 0, $24 | 0, 0) | 0; //@line 1403
   $59 = tempRet0; //@line 1404
   $60 = ___muldi3($58 | 0, $59 | 0, $24 | 0, 0) | 0; //@line 1405
   $62 = _i64Subtract($56 | 0, $57 | 0, $60 | 0, tempRet0 | 0) | 0; //@line 1407
   $64 = $12; //@line 1409
   $70 = _i64Add($62 | 0, tempRet0 | 0, HEAP32[$64 >> 2] | 0, HEAP32[$64 + 4 >> 2] | 0) | 0; //@line 1415
   $71 = tempRet0; //@line 1416
   $72 = $12; //@line 1417
   HEAP32[$72 >> 2] = $70; //@line 1419
   HEAP32[$72 + 4 >> 2] = $71; //@line 1422
   if ($71 >>> 0 < 0 | ($71 | 0) == 0 & $70 >>> 0 < $24 >>> 0) {
    $95 = $58; //@line 1429
    $96 = $59; //@line 1429
   } else {
    $81 = _i64Add($58 | 0, $59 | 0, 1, 0) | 0; //@line 1431
    $82 = tempRet0; //@line 1432
    $83 = _i64Subtract($70 | 0, $71 | 0, $24 | 0, 0) | 0; //@line 1433
    $85 = $12; //@line 1435
    HEAP32[$85 >> 2] = $83; //@line 1437
    HEAP32[$85 + 4 >> 2] = tempRet0; //@line 1440
    $95 = $81; //@line 1441
    $96 = $82; //@line 1441
   }
  }
  $89 = $14; //@line 1444
  $97 = _i64Add(HEAP32[$89 >> 2] | 0, HEAP32[$89 + 4 >> 2] | 0, $95 | 0, $96 | 0) | 0; //@line 1450
  $99 = $14; //@line 1452
  HEAP32[$99 >> 2] = $97; //@line 1454
  HEAP32[$99 + 4 >> 2] = tempRet0; //@line 1457
 }
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(4) | 0; //@line 1459
 _schedule_interrupt($4); //@line 1460
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 48; //@line 1463
  sp = STACKTOP; //@line 1464
  return;
 }
 ___async_unwind = 0; //@line 1467
 HEAP32[$ReallocAsyncCtx5 >> 2] = 48; //@line 1468
 sp = STACKTOP; //@line 1469
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_38($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13699
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13701
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13703
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13705
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13707
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13709
 $12 = HEAP8[$0 + 24 >> 0] & 1; //@line 13712
 $15 = $2 + 24 | 0; //@line 13715
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$2 + 8 >> 2] | 0; //@line 13720
   if (!($18 & 2)) {
    $21 = $6 + 36 | 0; //@line 13724
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $6 + 54 | 0; //@line 13731
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 13742
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $6, $8, $10, $12); //@line 13743
      if (!___async) {
       ___async_unwind = 0; //@line 13746
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 141; //@line 13748
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 13750
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 13752
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 13754
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 13756
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $6; //@line 13758
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $8; //@line 13760
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $10; //@line 13762
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $12 & 1; //@line 13765
      sp = STACKTOP; //@line 13766
      return;
     }
     $36 = $6 + 24 | 0; //@line 13769
     $37 = $6 + 54 | 0; //@line 13770
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 13785
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $6, $8, $10, $12); //@line 13786
     if (!___async) {
      ___async_unwind = 0; //@line 13789
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 140; //@line 13791
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 13793
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 13795
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 13797
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 13799
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 13801
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $6; //@line 13803
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $8; //@line 13805
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $10; //@line 13807
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $12 & 1; //@line 13810
     sp = STACKTOP; //@line 13811
     return;
    }
   }
   $24 = $6 + 54 | 0; //@line 13815
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 13819
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $6, $8, $10, $12); //@line 13820
    if (!___async) {
     ___async_unwind = 0; //@line 13823
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 139; //@line 13825
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 13827
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 13829
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 13831
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $6; //@line 13833
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $8; //@line 13835
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $10; //@line 13837
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $12 & 1; //@line 13840
    sp = STACKTOP; //@line 13841
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
 sp = STACKTOP; //@line 11058
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 11063
 } else {
  $9 = $1 + 52 | 0; //@line 11065
  $10 = HEAP8[$9 >> 0] | 0; //@line 11066
  $11 = $1 + 53 | 0; //@line 11067
  $12 = HEAP8[$11 >> 0] | 0; //@line 11068
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 11071
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 11072
  HEAP8[$9 >> 0] = 0; //@line 11073
  HEAP8[$11 >> 0] = 0; //@line 11074
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 11075
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 11076
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 135; //@line 11079
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 11081
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 11083
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 11085
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 11087
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 11089
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 11091
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 11093
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 11095
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 11097
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 11099
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 11102
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 11104
   sp = STACKTOP; //@line 11105
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11108
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 11113
    $32 = $0 + 8 | 0; //@line 11114
    $33 = $1 + 54 | 0; //@line 11115
    $$0 = $0 + 24 | 0; //@line 11116
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
     HEAP8[$9 >> 0] = 0; //@line 11149
     HEAP8[$11 >> 0] = 0; //@line 11150
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 11151
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 11152
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 11157
     $62 = $$0 + 8 | 0; //@line 11158
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 11161
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 136; //@line 11166
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 11168
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 11170
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 11172
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 11174
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 11176
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 11178
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 11180
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 11182
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 11184
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 11186
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 11188
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 11190
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 11192
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 11195
    sp = STACKTOP; //@line 11196
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 11200
  HEAP8[$11 >> 0] = $12; //@line 11201
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8177
      $10 = HEAP32[$9 >> 2] | 0; //@line 8178
      HEAP32[$2 >> 2] = $9 + 4; //@line 8180
      HEAP32[$0 >> 2] = $10; //@line 8181
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8197
      $17 = HEAP32[$16 >> 2] | 0; //@line 8198
      HEAP32[$2 >> 2] = $16 + 4; //@line 8200
      $20 = $0; //@line 8203
      HEAP32[$20 >> 2] = $17; //@line 8205
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 8208
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8224
      $30 = HEAP32[$29 >> 2] | 0; //@line 8225
      HEAP32[$2 >> 2] = $29 + 4; //@line 8227
      $31 = $0; //@line 8228
      HEAP32[$31 >> 2] = $30; //@line 8230
      HEAP32[$31 + 4 >> 2] = 0; //@line 8233
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 8249
      $41 = $40; //@line 8250
      $43 = HEAP32[$41 >> 2] | 0; //@line 8252
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 8255
      HEAP32[$2 >> 2] = $40 + 8; //@line 8257
      $47 = $0; //@line 8258
      HEAP32[$47 >> 2] = $43; //@line 8260
      HEAP32[$47 + 4 >> 2] = $46; //@line 8263
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8279
      $57 = HEAP32[$56 >> 2] | 0; //@line 8280
      HEAP32[$2 >> 2] = $56 + 4; //@line 8282
      $59 = ($57 & 65535) << 16 >> 16; //@line 8284
      $62 = $0; //@line 8287
      HEAP32[$62 >> 2] = $59; //@line 8289
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 8292
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8308
      $72 = HEAP32[$71 >> 2] | 0; //@line 8309
      HEAP32[$2 >> 2] = $71 + 4; //@line 8311
      $73 = $0; //@line 8313
      HEAP32[$73 >> 2] = $72 & 65535; //@line 8315
      HEAP32[$73 + 4 >> 2] = 0; //@line 8318
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8334
      $83 = HEAP32[$82 >> 2] | 0; //@line 8335
      HEAP32[$2 >> 2] = $82 + 4; //@line 8337
      $85 = ($83 & 255) << 24 >> 24; //@line 8339
      $88 = $0; //@line 8342
      HEAP32[$88 >> 2] = $85; //@line 8344
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 8347
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8363
      $98 = HEAP32[$97 >> 2] | 0; //@line 8364
      HEAP32[$2 >> 2] = $97 + 4; //@line 8366
      $99 = $0; //@line 8368
      HEAP32[$99 >> 2] = $98 & 255; //@line 8370
      HEAP32[$99 + 4 >> 2] = 0; //@line 8373
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 8389
      $109 = +HEAPF64[$108 >> 3]; //@line 8390
      HEAP32[$2 >> 2] = $108 + 8; //@line 8392
      HEAPF64[$0 >> 3] = $109; //@line 8393
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 8409
      $116 = +HEAPF64[$115 >> 3]; //@line 8410
      HEAP32[$2 >> 2] = $115 + 8; //@line 8412
      HEAPF64[$0 >> 3] = $116; //@line 8413
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
 sp = STACKTOP; //@line 7077
 STACKTOP = STACKTOP + 224 | 0; //@line 7078
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 7078
 $3 = sp + 120 | 0; //@line 7079
 $4 = sp + 80 | 0; //@line 7080
 $5 = sp; //@line 7081
 $6 = sp + 136 | 0; //@line 7082
 dest = $4; //@line 7083
 stop = dest + 40 | 0; //@line 7083
 do {
  HEAP32[dest >> 2] = 0; //@line 7083
  dest = dest + 4 | 0; //@line 7083
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 7085
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 7089
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 7096
  } else {
   $43 = 0; //@line 7098
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 7100
  $14 = $13 & 32; //@line 7101
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 7107
  }
  $19 = $0 + 48 | 0; //@line 7109
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 7114
    $24 = HEAP32[$23 >> 2] | 0; //@line 7115
    HEAP32[$23 >> 2] = $6; //@line 7116
    $25 = $0 + 28 | 0; //@line 7117
    HEAP32[$25 >> 2] = $6; //@line 7118
    $26 = $0 + 20 | 0; //@line 7119
    HEAP32[$26 >> 2] = $6; //@line 7120
    HEAP32[$19 >> 2] = 80; //@line 7121
    $28 = $0 + 16 | 0; //@line 7123
    HEAP32[$28 >> 2] = $6 + 80; //@line 7124
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 7125
    if (!$24) {
     $$1 = $29; //@line 7128
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 7131
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 7132
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 7133
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 116; //@line 7136
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 7138
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 7140
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 7142
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 7144
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 7146
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 7148
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 7150
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 7152
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 7154
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 7156
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 7158
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 7160
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 7162
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 7164
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 7166
      sp = STACKTOP; //@line 7167
      STACKTOP = sp; //@line 7168
      return 0; //@line 7168
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 7170
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 7173
      HEAP32[$23 >> 2] = $24; //@line 7174
      HEAP32[$19 >> 2] = 0; //@line 7175
      HEAP32[$28 >> 2] = 0; //@line 7176
      HEAP32[$25 >> 2] = 0; //@line 7177
      HEAP32[$26 >> 2] = 0; //@line 7178
      $$1 = $$; //@line 7179
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 7185
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 7188
  HEAP32[$0 >> 2] = $51 | $14; //@line 7193
  if ($43 | 0) {
   ___unlockfile($0); //@line 7196
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 7198
 }
 STACKTOP = sp; //@line 7200
 return $$0 | 0; //@line 7200
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 10593
 STACKTOP = STACKTOP + 64 | 0; //@line 10594
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 10594
 $4 = sp; //@line 10595
 $5 = HEAP32[$0 >> 2] | 0; //@line 10596
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 10599
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 10601
 HEAP32[$4 >> 2] = $2; //@line 10602
 HEAP32[$4 + 4 >> 2] = $0; //@line 10604
 HEAP32[$4 + 8 >> 2] = $1; //@line 10606
 HEAP32[$4 + 12 >> 2] = $3; //@line 10608
 $14 = $4 + 16 | 0; //@line 10609
 $15 = $4 + 20 | 0; //@line 10610
 $16 = $4 + 24 | 0; //@line 10611
 $17 = $4 + 28 | 0; //@line 10612
 $18 = $4 + 32 | 0; //@line 10613
 $19 = $4 + 40 | 0; //@line 10614
 dest = $14; //@line 10615
 stop = dest + 36 | 0; //@line 10615
 do {
  HEAP32[dest >> 2] = 0; //@line 10615
  dest = dest + 4 | 0; //@line 10615
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 10615
 HEAP8[$14 + 38 >> 0] = 0; //@line 10615
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 10620
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10623
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10624
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 10625
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 127; //@line 10628
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 10630
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 10632
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 10634
    sp = STACKTOP; //@line 10635
    STACKTOP = sp; //@line 10636
    return 0; //@line 10636
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10638
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 10642
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 10646
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 10649
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 10650
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 10651
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 128; //@line 10654
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 10656
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 10658
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 10660
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 10662
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 10664
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 10666
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 10668
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 10670
    sp = STACKTOP; //@line 10671
    STACKTOP = sp; //@line 10672
    return 0; //@line 10672
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10674
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 10688
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 10696
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 10712
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 10717
  }
 } while (0);
 STACKTOP = sp; //@line 10720
 return $$0 | 0; //@line 10720
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 6949
 $7 = ($2 | 0) != 0; //@line 6953
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 6957
   $$03555 = $0; //@line 6958
   $$03654 = $2; //@line 6958
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 6963
     $$036$lcssa64 = $$03654; //@line 6963
     label = 6; //@line 6964
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 6967
    $12 = $$03654 + -1 | 0; //@line 6968
    $16 = ($12 | 0) != 0; //@line 6972
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 6975
     $$03654 = $12; //@line 6975
    } else {
     $$035$lcssa = $11; //@line 6977
     $$036$lcssa = $12; //@line 6977
     $$lcssa = $16; //@line 6977
     label = 5; //@line 6978
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 6983
   $$036$lcssa = $2; //@line 6983
   $$lcssa = $7; //@line 6983
   label = 5; //@line 6984
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 6989
   $$036$lcssa64 = $$036$lcssa; //@line 6989
   label = 6; //@line 6990
  } else {
   $$2 = $$035$lcssa; //@line 6992
   $$3 = 0; //@line 6992
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 6998
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 7001
    $$3 = $$036$lcssa64; //@line 7001
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 7003
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 7007
      $$13745 = $$036$lcssa64; //@line 7007
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 7010
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 7019
       $30 = $$13745 + -4 | 0; //@line 7020
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 7023
        $$13745 = $30; //@line 7023
       } else {
        $$0$lcssa = $29; //@line 7025
        $$137$lcssa = $30; //@line 7025
        label = 11; //@line 7026
        break L11;
       }
      }
      $$140 = $$046; //@line 7030
      $$23839 = $$13745; //@line 7030
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 7032
      $$137$lcssa = $$036$lcssa64; //@line 7032
      label = 11; //@line 7033
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 7039
      $$3 = 0; //@line 7039
      break;
     } else {
      $$140 = $$0$lcssa; //@line 7042
      $$23839 = $$137$lcssa; //@line 7042
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 7049
      $$3 = $$23839; //@line 7049
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 7052
     $$23839 = $$23839 + -1 | 0; //@line 7053
     if (!$$23839) {
      $$2 = $35; //@line 7056
      $$3 = 0; //@line 7056
      break;
     } else {
      $$140 = $35; //@line 7059
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 7067
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 6720
 do {
  if (!$0) {
   do {
    if (!(HEAP32[179] | 0)) {
     $34 = 0; //@line 6728
    } else {
     $12 = HEAP32[179] | 0; //@line 6730
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 6731
     $13 = _fflush($12) | 0; //@line 6732
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 112; //@line 6735
      sp = STACKTOP; //@line 6736
      return 0; //@line 6737
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 6739
      $34 = $13; //@line 6740
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 6746
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 6750
    } else {
     $$02327 = $$02325; //@line 6752
     $$02426 = $34; //@line 6752
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 6759
      } else {
       $28 = 0; //@line 6761
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 6769
       $25 = ___fflush_unlocked($$02327) | 0; //@line 6770
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 6775
       $$1 = $25 | $$02426; //@line 6777
      } else {
       $$1 = $$02426; //@line 6779
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 6783
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 6786
      if (!$$023) {
       $$024$lcssa = $$1; //@line 6789
       break L9;
      } else {
       $$02327 = $$023; //@line 6792
       $$02426 = $$1; //@line 6792
      }
     }
     HEAP32[$AsyncCtx >> 2] = 113; //@line 6795
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 6797
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 6799
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 6801
     sp = STACKTOP; //@line 6802
     return 0; //@line 6803
    }
   } while (0);
   ___ofl_unlock(); //@line 6806
   $$0 = $$024$lcssa; //@line 6807
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 6813
    $5 = ___fflush_unlocked($0) | 0; //@line 6814
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 110; //@line 6817
     sp = STACKTOP; //@line 6818
     return 0; //@line 6819
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 6821
     $$0 = $5; //@line 6822
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 6827
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 6828
   $7 = ___fflush_unlocked($0) | 0; //@line 6829
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 111; //@line 6832
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 6835
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 6837
    sp = STACKTOP; //@line 6838
    return 0; //@line 6839
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6841
   if ($phitmp) {
    $$0 = $7; //@line 6843
   } else {
    ___unlockfile($0); //@line 6845
    $$0 = $7; //@line 6846
   }
  }
 } while (0);
 return $$0 | 0; //@line 6850
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10775
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10781
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 10787
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 10790
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 10791
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 10792
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 131; //@line 10795
     sp = STACKTOP; //@line 10796
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10799
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 10807
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 10812
     $19 = $1 + 44 | 0; //@line 10813
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 10819
     HEAP8[$22 >> 0] = 0; //@line 10820
     $23 = $1 + 53 | 0; //@line 10821
     HEAP8[$23 >> 0] = 0; //@line 10822
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 10824
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 10827
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 10828
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 10829
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 130; //@line 10832
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 10834
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10836
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 10838
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 10840
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 10842
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 10844
      sp = STACKTOP; //@line 10845
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 10848
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 10852
      label = 13; //@line 10853
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 10858
       label = 13; //@line 10859
      } else {
       $$037$off039 = 3; //@line 10861
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 10865
      $39 = $1 + 40 | 0; //@line 10866
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 10869
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 10879
        $$037$off039 = $$037$off038; //@line 10880
       } else {
        $$037$off039 = $$037$off038; //@line 10882
       }
      } else {
       $$037$off039 = $$037$off038; //@line 10885
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 10888
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 10895
   }
  }
 } while (0);
 return;
}
function _initialize__async_cb_67($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $17 = 0, $19 = 0, $2 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $28 = 0, $29 = 0, $31 = 0, $33 = 0, $36 = 0, $4 = 0, $40 = 0, $41 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1196
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1198
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1200
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1202
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1204
 $10 = $0 + 24 | 0; //@line 1206
 $12 = HEAP32[$10 >> 2] | 0; //@line 1208
 $15 = HEAP32[$10 + 4 >> 2] | 0; //@line 1211
 $17 = HEAP32[$0 + 32 >> 2] | 0; //@line 1213
 $19 = HEAP32[$0 + 36 >> 2] | 0; //@line 1215
 $21 = HEAP32[$2 >> 2] | 0; //@line 1218
 $22 = $21 + 32 | 0; //@line 1219
 HEAP32[$22 >> 2] = HEAP32[___async_retval >> 2]; //@line 1220
 $23 = $21 + 40 | 0; //@line 1221
 $24 = $23; //@line 1222
 HEAP32[$24 >> 2] = 0; //@line 1224
 HEAP32[$24 + 4 >> 2] = 0; //@line 1227
 $28 = $21 + 8 | 0; //@line 1228
 HEAP32[$28 >> 2] = $4; //@line 1229
 $29 = _bitshift64Shl(1, 0, $6 | 0) | 0; //@line 1230
 $31 = _i64Add($29 | 0, tempRet0 | 0, -1, 0) | 0; //@line 1232
 $33 = $21 + 12 | 0; //@line 1234
 HEAP32[$33 >> 2] = $31; //@line 1235
 HEAP32[$21 + 16 >> 2] = $8; //@line 1237
 $36 = $21 + 24 | 0; //@line 1239
 HEAP32[$36 >> 2] = $12; //@line 1241
 HEAP32[$36 + 4 >> 2] = $15; //@line 1244
 $40 = $21 + 48 | 0; //@line 1245
 $41 = $40; //@line 1246
 HEAP32[$41 >> 2] = 0; //@line 1248
 HEAP32[$41 + 4 >> 2] = 0; //@line 1251
 HEAP8[$21 + 56 >> 0] = 1; //@line 1253
 $48 = HEAP32[(HEAP32[$17 >> 2] | 0) + 4 >> 2] | 0; //@line 1256
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 1257
 $49 = FUNCTION_TABLE_i[$48 & 3]() | 0; //@line 1258
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 47; //@line 1261
  $50 = $ReallocAsyncCtx4 + 4 | 0; //@line 1262
  HEAP32[$50 >> 2] = $2; //@line 1263
  $51 = $ReallocAsyncCtx4 + 8 | 0; //@line 1264
  HEAP32[$51 >> 2] = $19; //@line 1265
  $52 = $ReallocAsyncCtx4 + 12 | 0; //@line 1266
  HEAP32[$52 >> 2] = $22; //@line 1267
  $53 = $ReallocAsyncCtx4 + 16 | 0; //@line 1268
  HEAP32[$53 >> 2] = $33; //@line 1269
  $54 = $ReallocAsyncCtx4 + 20 | 0; //@line 1270
  HEAP32[$54 >> 2] = $28; //@line 1271
  $55 = $ReallocAsyncCtx4 + 24 | 0; //@line 1272
  HEAP32[$55 >> 2] = $23; //@line 1273
  $56 = $ReallocAsyncCtx4 + 28 | 0; //@line 1274
  HEAP32[$56 >> 2] = $40; //@line 1275
  sp = STACKTOP; //@line 1276
  return;
 }
 HEAP32[___async_retval >> 2] = $49; //@line 1280
 ___async_unwind = 0; //@line 1281
 HEAP32[$ReallocAsyncCtx4 >> 2] = 47; //@line 1282
 $50 = $ReallocAsyncCtx4 + 4 | 0; //@line 1283
 HEAP32[$50 >> 2] = $2; //@line 1284
 $51 = $ReallocAsyncCtx4 + 8 | 0; //@line 1285
 HEAP32[$51 >> 2] = $19; //@line 1286
 $52 = $ReallocAsyncCtx4 + 12 | 0; //@line 1287
 HEAP32[$52 >> 2] = $22; //@line 1288
 $53 = $ReallocAsyncCtx4 + 16 | 0; //@line 1289
 HEAP32[$53 >> 2] = $33; //@line 1290
 $54 = $ReallocAsyncCtx4 + 20 | 0; //@line 1291
 HEAP32[$54 >> 2] = $28; //@line 1292
 $55 = $ReallocAsyncCtx4 + 24 | 0; //@line 1293
 HEAP32[$55 >> 2] = $23; //@line 1294
 $56 = $ReallocAsyncCtx4 + 28 | 0; //@line 1295
 HEAP32[$56 >> 2] = $40; //@line 1296
 sp = STACKTOP; //@line 1297
 return;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $12 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $29 = 0, $3 = 0, $36 = 0, $39 = 0, $40 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx14 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 10087
 STACKTOP = STACKTOP + 48 | 0; //@line 10088
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 10088
 $vararg_buffer10 = sp + 32 | 0; //@line 10089
 $vararg_buffer7 = sp + 24 | 0; //@line 10090
 $vararg_buffer3 = sp + 16 | 0; //@line 10091
 $vararg_buffer = sp; //@line 10092
 $0 = sp + 36 | 0; //@line 10093
 $1 = ___cxa_get_globals_fast() | 0; //@line 10094
 if ($1 | 0) {
  $3 = HEAP32[$1 >> 2] | 0; //@line 10097
  if ($3 | 0) {
   $7 = $3 + 48 | 0; //@line 10102
   $9 = HEAP32[$7 >> 2] | 0; //@line 10104
   $12 = HEAP32[$7 + 4 >> 2] | 0; //@line 10107
   if (!(($9 & -256 | 0) == 1126902528 & ($12 | 0) == 1129074247)) {
    HEAP32[$vararg_buffer7 >> 2] = 4777; //@line 10113
    _abort_message(4727, $vararg_buffer7); //@line 10114
   }
   if (($9 | 0) == 1126902529 & ($12 | 0) == 1129074247) {
    $22 = HEAP32[$3 + 44 >> 2] | 0; //@line 10123
   } else {
    $22 = $3 + 80 | 0; //@line 10125
   }
   HEAP32[$0 >> 2] = $22; //@line 10127
   $23 = HEAP32[$3 >> 2] | 0; //@line 10128
   $25 = HEAP32[$23 + 4 >> 2] | 0; //@line 10130
   $28 = HEAP32[(HEAP32[54] | 0) + 16 >> 2] | 0; //@line 10133
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 10134
   $29 = FUNCTION_TABLE_iiii[$28 & 7](216, $23, $0) | 0; //@line 10135
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 121; //@line 10138
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 10140
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 10142
    HEAP32[$AsyncCtx + 12 >> 2] = $25; //@line 10144
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 10146
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 10148
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 10150
    sp = STACKTOP; //@line 10151
    STACKTOP = sp; //@line 10152
    return;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 10154
   if (!$29) {
    HEAP32[$vararg_buffer3 >> 2] = 4777; //@line 10156
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 10158
    _abort_message(4686, $vararg_buffer3); //@line 10159
   }
   $36 = HEAP32[$0 >> 2] | 0; //@line 10162
   $39 = HEAP32[(HEAP32[$36 >> 2] | 0) + 8 >> 2] | 0; //@line 10165
   $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 10166
   $40 = FUNCTION_TABLE_ii[$39 & 1]($36) | 0; //@line 10167
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 122; //@line 10170
    HEAP32[$AsyncCtx14 + 4 >> 2] = $vararg_buffer; //@line 10172
    HEAP32[$AsyncCtx14 + 8 >> 2] = $25; //@line 10174
    HEAP32[$AsyncCtx14 + 12 >> 2] = $vararg_buffer; //@line 10176
    sp = STACKTOP; //@line 10177
    STACKTOP = sp; //@line 10178
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 10180
    HEAP32[$vararg_buffer >> 2] = 4777; //@line 10181
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 10183
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 10185
    _abort_message(4641, $vararg_buffer); //@line 10186
   }
  }
 }
 _abort_message(4765, $vararg_buffer10); //@line 10191
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_2($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $37 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 12095
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12097
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12099
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12101
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12103
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12105
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12107
 $14 = $0 + 32 | 0; //@line 12109
 $16 = HEAP32[$14 >> 2] | 0; //@line 12111
 $19 = HEAP32[$14 + 4 >> 2] | 0; //@line 12114
 $20 = HEAP32[$2 >> 2] | 0; //@line 12115
 if ($20 | 0) {
  $23 = HEAP32[$20 + 4 >> 2] | 0; //@line 12119
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 12120
  FUNCTION_TABLE_vii[$23 & 3]($6, $8); //@line 12121
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 105; //@line 12124
   $24 = $ReallocAsyncCtx3 + 4 | 0; //@line 12125
   HEAP32[$24 >> 2] = $10; //@line 12126
   $25 = $ReallocAsyncCtx3 + 8 | 0; //@line 12127
   HEAP32[$25 >> 2] = $4; //@line 12128
   $26 = $ReallocAsyncCtx3 + 12 | 0; //@line 12129
   HEAP32[$26 >> 2] = $12; //@line 12130
   $27 = $ReallocAsyncCtx3 + 16 | 0; //@line 12131
   $28 = $27; //@line 12132
   $29 = $28; //@line 12133
   HEAP32[$29 >> 2] = $16; //@line 12134
   $30 = $28 + 4 | 0; //@line 12135
   $31 = $30; //@line 12136
   HEAP32[$31 >> 2] = $19; //@line 12137
   $32 = $ReallocAsyncCtx3 + 24 | 0; //@line 12138
   HEAP32[$32 >> 2] = $2; //@line 12139
   $33 = $ReallocAsyncCtx3 + 28 | 0; //@line 12140
   HEAP32[$33 >> 2] = $8; //@line 12141
   sp = STACKTOP; //@line 12142
   return;
  }
  ___async_unwind = 0; //@line 12145
  HEAP32[$ReallocAsyncCtx3 >> 2] = 105; //@line 12146
  $24 = $ReallocAsyncCtx3 + 4 | 0; //@line 12147
  HEAP32[$24 >> 2] = $10; //@line 12148
  $25 = $ReallocAsyncCtx3 + 8 | 0; //@line 12149
  HEAP32[$25 >> 2] = $4; //@line 12150
  $26 = $ReallocAsyncCtx3 + 12 | 0; //@line 12151
  HEAP32[$26 >> 2] = $12; //@line 12152
  $27 = $ReallocAsyncCtx3 + 16 | 0; //@line 12153
  $28 = $27; //@line 12154
  $29 = $28; //@line 12155
  HEAP32[$29 >> 2] = $16; //@line 12156
  $30 = $28 + 4 | 0; //@line 12157
  $31 = $30; //@line 12158
  HEAP32[$31 >> 2] = $19; //@line 12159
  $32 = $ReallocAsyncCtx3 + 24 | 0; //@line 12160
  HEAP32[$32 >> 2] = $2; //@line 12161
  $33 = $ReallocAsyncCtx3 + 28 | 0; //@line 12162
  HEAP32[$33 >> 2] = $8; //@line 12163
  sp = STACKTOP; //@line 12164
  return;
 }
 HEAP32[$4 >> 2] = 0; //@line 12167
 __ZN4mbed6Ticker5setupEy($12, $16, $19); //@line 12168
 $34 = HEAP32[$2 >> 2] | 0; //@line 12169
 if (!$34) {
  return;
 }
 $37 = HEAP32[$34 + 8 >> 2] | 0; //@line 12175
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 12176
 FUNCTION_TABLE_vi[$37 & 255]($8); //@line 12177
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 106; //@line 12180
  sp = STACKTOP; //@line 12181
  return;
 }
 ___async_unwind = 0; //@line 12184
 HEAP32[$ReallocAsyncCtx4 >> 2] = 106; //@line 12185
 sp = STACKTOP; //@line 12186
 return;
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5875
 STACKTOP = STACKTOP + 48 | 0; //@line 5876
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 5876
 $vararg_buffer3 = sp + 16 | 0; //@line 5877
 $vararg_buffer = sp; //@line 5878
 $3 = sp + 32 | 0; //@line 5879
 $4 = $0 + 28 | 0; //@line 5880
 $5 = HEAP32[$4 >> 2] | 0; //@line 5881
 HEAP32[$3 >> 2] = $5; //@line 5882
 $7 = $0 + 20 | 0; //@line 5884
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 5886
 HEAP32[$3 + 4 >> 2] = $9; //@line 5887
 HEAP32[$3 + 8 >> 2] = $1; //@line 5889
 HEAP32[$3 + 12 >> 2] = $2; //@line 5891
 $12 = $9 + $2 | 0; //@line 5892
 $13 = $0 + 60 | 0; //@line 5893
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 5896
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 5898
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 5900
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 5902
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 5906
  } else {
   $$04756 = 2; //@line 5908
   $$04855 = $12; //@line 5908
   $$04954 = $3; //@line 5908
   $27 = $17; //@line 5908
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 5914
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 5916
    $38 = $27 >>> 0 > $37 >>> 0; //@line 5917
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 5919
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 5921
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 5923
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 5926
    $44 = $$150 + 4 | 0; //@line 5927
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 5930
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 5933
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 5935
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 5937
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 5939
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 5942
     break L1;
    } else {
     $$04756 = $$1; //@line 5945
     $$04954 = $$150; //@line 5945
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 5949
   HEAP32[$4 >> 2] = 0; //@line 5950
   HEAP32[$7 >> 2] = 0; //@line 5951
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 5954
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 5957
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 5962
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 5968
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 5973
  $25 = $20; //@line 5974
  HEAP32[$4 >> 2] = $25; //@line 5975
  HEAP32[$7 >> 2] = $25; //@line 5976
  $$051 = $2; //@line 5977
 }
 STACKTOP = sp; //@line 5979
 return $$051 | 0; //@line 5979
}
function _initialize__async_cb_70($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1482
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1484
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1486
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1488
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1490
 $10 = 7 << 32 + -4; //@line 1492
 $11 = ___muldi3($10 | 0, 0, 1e6, 0) | 0; //@line 1493
 $12 = tempRet0; //@line 1494
 $13 = _i64Add($2 | 0, 0, -1, -1) | 0; //@line 1495
 $15 = _i64Add($13 | 0, tempRet0 | 0, $11 | 0, $12 | 0) | 0; //@line 1497
 $17 = ___udivdi3($15 | 0, tempRet0 | 0, $2 | 0, 0) | 0; //@line 1499
 $18 = tempRet0; //@line 1500
 $19 = HEAP32[$4 >> 2] | 0; //@line 1501
 HEAP32[$19 >> 2] = 0; //@line 1502
 HEAP32[$19 + 4 >> 2] = 0; //@line 1504
 $23 = HEAP32[(HEAP32[$6 >> 2] | 0) + 4 >> 2] | 0; //@line 1507
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 1508
 $24 = FUNCTION_TABLE_i[$23 & 3]() | 0; //@line 1509
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 1512
  $25 = $ReallocAsyncCtx3 + 4 | 0; //@line 1513
  HEAP32[$25 >> 2] = $4; //@line 1514
  $26 = $ReallocAsyncCtx3 + 8 | 0; //@line 1515
  HEAP32[$26 >> 2] = $2; //@line 1516
  $27 = $ReallocAsyncCtx3 + 12 | 0; //@line 1517
  HEAP32[$27 >> 2] = 32; //@line 1518
  $28 = $ReallocAsyncCtx3 + 16 | 0; //@line 1519
  HEAP32[$28 >> 2] = $10; //@line 1520
  $29 = $ReallocAsyncCtx3 + 24 | 0; //@line 1521
  $30 = $29; //@line 1522
  $31 = $30; //@line 1523
  HEAP32[$31 >> 2] = $17; //@line 1524
  $32 = $30 + 4 | 0; //@line 1525
  $33 = $32; //@line 1526
  HEAP32[$33 >> 2] = $18; //@line 1527
  $34 = $ReallocAsyncCtx3 + 32 | 0; //@line 1528
  HEAP32[$34 >> 2] = $6; //@line 1529
  $35 = $ReallocAsyncCtx3 + 36 | 0; //@line 1530
  HEAP32[$35 >> 2] = $8; //@line 1531
  sp = STACKTOP; //@line 1532
  return;
 }
 HEAP32[___async_retval >> 2] = $24; //@line 1536
 ___async_unwind = 0; //@line 1537
 HEAP32[$ReallocAsyncCtx3 >> 2] = 46; //@line 1538
 $25 = $ReallocAsyncCtx3 + 4 | 0; //@line 1539
 HEAP32[$25 >> 2] = $4; //@line 1540
 $26 = $ReallocAsyncCtx3 + 8 | 0; //@line 1541
 HEAP32[$26 >> 2] = $2; //@line 1542
 $27 = $ReallocAsyncCtx3 + 12 | 0; //@line 1543
 HEAP32[$27 >> 2] = 32; //@line 1544
 $28 = $ReallocAsyncCtx3 + 16 | 0; //@line 1545
 HEAP32[$28 >> 2] = $10; //@line 1546
 $29 = $ReallocAsyncCtx3 + 24 | 0; //@line 1547
 $30 = $29; //@line 1548
 $31 = $30; //@line 1549
 HEAP32[$31 >> 2] = $17; //@line 1550
 $32 = $30 + 4 | 0; //@line 1551
 $33 = $32; //@line 1552
 HEAP32[$33 >> 2] = $18; //@line 1553
 $34 = $ReallocAsyncCtx3 + 32 | 0; //@line 1554
 HEAP32[$34 >> 2] = $6; //@line 1555
 $35 = $ReallocAsyncCtx3 + 36 | 0; //@line 1556
 HEAP32[$35 >> 2] = $8; //@line 1557
 sp = STACKTOP; //@line 1558
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_19($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12946
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12950
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12952
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 12954
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12956
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 12958
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12960
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12962
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 12964
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 12966
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 12969
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 12971
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 12975
   $27 = $6 + 24 | 0; //@line 12976
   $28 = $4 + 8 | 0; //@line 12977
   $29 = $6 + 54 | 0; //@line 12978
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
    HEAP8[$10 >> 0] = 0; //@line 13008
    HEAP8[$14 >> 0] = 0; //@line 13009
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 13010
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 13011
    if (!___async) {
     ___async_unwind = 0; //@line 13014
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 136; //@line 13016
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 13018
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 13020
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 13022
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 13024
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 13026
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 13028
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 13030
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 13032
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 13034
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 13036
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 13038
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 13040
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 13042
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 13045
    sp = STACKTOP; //@line 13046
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 13051
 HEAP8[$14 >> 0] = $12; //@line 13052
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12830
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12834
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12836
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 12838
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12840
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 12842
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12844
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12846
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 12848
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 12850
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 12852
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 12854
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 12856
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 12859
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 12860
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
    HEAP8[$10 >> 0] = 0; //@line 12893
    HEAP8[$14 >> 0] = 0; //@line 12894
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 12895
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 12896
    if (!___async) {
     ___async_unwind = 0; //@line 12899
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 136; //@line 12901
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 12903
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 12905
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 12907
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 12909
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 12911
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 12913
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 12915
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 12917
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 12919
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 12921
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 12923
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 12925
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 12927
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 12930
    sp = STACKTOP; //@line 12931
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 12936
 HEAP8[$14 >> 0] = $12; //@line 12937
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 2164
 }
 ret = dest | 0; //@line 2167
 dest_end = dest + num | 0; //@line 2168
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 2172
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 2173
   dest = dest + 1 | 0; //@line 2174
   src = src + 1 | 0; //@line 2175
   num = num - 1 | 0; //@line 2176
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 2178
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 2179
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 2181
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 2182
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 2183
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 2184
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 2185
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 2186
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 2187
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 2188
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 2189
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 2190
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 2191
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 2192
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 2193
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 2194
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 2195
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 2196
   dest = dest + 64 | 0; //@line 2197
   src = src + 64 | 0; //@line 2198
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 2201
   dest = dest + 4 | 0; //@line 2202
   src = src + 4 | 0; //@line 2203
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 2207
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 2209
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 2210
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 2211
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 2212
   dest = dest + 4 | 0; //@line 2213
   src = src + 4 | 0; //@line 2214
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 2219
  dest = dest + 1 | 0; //@line 2220
  src = src + 1 | 0; //@line 2221
 }
 return ret | 0; //@line 2223
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 10276
 STACKTOP = STACKTOP + 64 | 0; //@line 10277
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 10277
 $3 = sp; //@line 10278
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 10281
 } else {
  if (!$1) {
   $$2 = 0; //@line 10285
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 10287
   $6 = ___dynamic_cast($1, 240, 224, 0) | 0; //@line 10288
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 125; //@line 10291
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 10293
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 10295
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 10297
    sp = STACKTOP; //@line 10298
    STACKTOP = sp; //@line 10299
    return 0; //@line 10299
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10301
   if (!$6) {
    $$2 = 0; //@line 10304
   } else {
    dest = $3 + 4 | 0; //@line 10307
    stop = dest + 52 | 0; //@line 10307
    do {
     HEAP32[dest >> 2] = 0; //@line 10307
     dest = dest + 4 | 0; //@line 10307
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 10308
    HEAP32[$3 + 8 >> 2] = $0; //@line 10310
    HEAP32[$3 + 12 >> 2] = -1; //@line 10312
    HEAP32[$3 + 48 >> 2] = 1; //@line 10314
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 10317
    $18 = HEAP32[$2 >> 2] | 0; //@line 10318
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10319
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 10320
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 126; //@line 10323
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 10325
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10327
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 10329
     sp = STACKTOP; //@line 10330
     STACKTOP = sp; //@line 10331
     return 0; //@line 10331
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10333
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 10340
     $$0 = 1; //@line 10341
    } else {
     $$0 = 0; //@line 10343
    }
    $$2 = $$0; //@line 10345
   }
  }
 }
 STACKTOP = sp; //@line 10349
 return $$2 | 0; //@line 10349
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11608
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 11614
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 11618
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 11619
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 11620
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 11621
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 142; //@line 11624
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 11626
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 11628
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 11630
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 11632
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 11634
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 11636
    sp = STACKTOP; //@line 11637
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11640
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 11644
    $$0 = $0 + 24 | 0; //@line 11645
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 11647
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 11648
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 11653
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 11659
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 11662
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 143; //@line 11667
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 11669
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 11671
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 11673
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 11675
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 11677
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 11679
    sp = STACKTOP; //@line 11680
    return;
   }
  }
 } while (0);
 return;
}
function _main__async_cb_15($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $16 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $4 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 12678
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12682
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12684
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12686
 $9 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 12687
 if (!$9) {
  $16 = $4 + 4 | 0; //@line 12691
  HEAP32[$16 >> 2] = 0; //@line 12693
  HEAP32[$16 + 4 >> 2] = 0; //@line 12696
  HEAP32[$4 >> 2] = 8; //@line 12697
  $20 = $4 + 12 | 0; //@line 12698
  HEAP32[$20 >> 2] = 440; //@line 12699
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(16) | 0; //@line 12700
  __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5280, $4, 2.5); //@line 12701
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 98; //@line 12704
   $21 = $ReallocAsyncCtx7 + 4 | 0; //@line 12705
   HEAP32[$21 >> 2] = $20; //@line 12706
   $22 = $ReallocAsyncCtx7 + 8 | 0; //@line 12707
   HEAP32[$22 >> 2] = $8; //@line 12708
   $23 = $ReallocAsyncCtx7 + 12 | 0; //@line 12709
   HEAP32[$23 >> 2] = $4; //@line 12710
   sp = STACKTOP; //@line 12711
   return;
  }
  ___async_unwind = 0; //@line 12714
  HEAP32[$ReallocAsyncCtx7 >> 2] = 98; //@line 12715
  $21 = $ReallocAsyncCtx7 + 4 | 0; //@line 12716
  HEAP32[$21 >> 2] = $20; //@line 12717
  $22 = $ReallocAsyncCtx7 + 8 | 0; //@line 12718
  HEAP32[$22 >> 2] = $8; //@line 12719
  $23 = $ReallocAsyncCtx7 + 12 | 0; //@line 12720
  HEAP32[$23 >> 2] = $4; //@line 12721
  sp = STACKTOP; //@line 12722
  return;
 } else {
  $12 = HEAP32[$9 + 8 >> 2] | 0; //@line 12726
  $ReallocAsyncCtx = _emscripten_realloc_async_context(12) | 0; //@line 12727
  FUNCTION_TABLE_vi[$12 & 255]($6); //@line 12728
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 97; //@line 12731
   $13 = $ReallocAsyncCtx + 4 | 0; //@line 12732
   HEAP32[$13 >> 2] = $4; //@line 12733
   $14 = $ReallocAsyncCtx + 8 | 0; //@line 12734
   HEAP32[$14 >> 2] = $8; //@line 12735
   sp = STACKTOP; //@line 12736
   return;
  }
  ___async_unwind = 0; //@line 12739
  HEAP32[$ReallocAsyncCtx >> 2] = 97; //@line 12740
  $13 = $ReallocAsyncCtx + 4 | 0; //@line 12741
  HEAP32[$13 >> 2] = $4; //@line 12742
  $14 = $ReallocAsyncCtx + 8 | 0; //@line 12743
  HEAP32[$14 >> 2] = $8; //@line 12744
  sp = STACKTOP; //@line 12745
  return;
 }
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 9822
 STACKTOP = STACKTOP + 128 | 0; //@line 9823
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 9823
 $4 = sp + 124 | 0; //@line 9824
 $5 = sp; //@line 9825
 dest = $5; //@line 9826
 src = 964; //@line 9826
 stop = dest + 124 | 0; //@line 9826
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 9826
  dest = dest + 4 | 0; //@line 9826
  src = src + 4 | 0; //@line 9826
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 9832
   $$015 = 1; //@line 9832
   label = 4; //@line 9833
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 9836
   $$0 = -1; //@line 9837
  }
 } else {
  $$014 = $0; //@line 9840
  $$015 = $1; //@line 9840
  label = 4; //@line 9841
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 9845
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 9847
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 9849
  $14 = $5 + 20 | 0; //@line 9850
  HEAP32[$14 >> 2] = $$014; //@line 9851
  HEAP32[$5 + 44 >> 2] = $$014; //@line 9853
  $16 = $$014 + $$$015 | 0; //@line 9854
  $17 = $5 + 16 | 0; //@line 9855
  HEAP32[$17 >> 2] = $16; //@line 9856
  HEAP32[$5 + 28 >> 2] = $16; //@line 9858
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 9859
  $19 = _vfprintf($5, $2, $3) | 0; //@line 9860
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 117; //@line 9863
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 9865
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 9867
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 9869
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 9871
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 9873
   sp = STACKTOP; //@line 9874
   STACKTOP = sp; //@line 9875
   return 0; //@line 9875
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 9877
  if (!$$$015) {
   $$0 = $19; //@line 9880
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 9882
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 9887
   $$0 = $19; //@line 9888
  }
 }
 STACKTOP = sp; //@line 9891
 return $$0 | 0; //@line 9891
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 6585
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 6588
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 6591
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 6594
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 6600
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 6609
     $24 = $13 >>> 2; //@line 6610
     $$090 = 0; //@line 6611
     $$094 = $7; //@line 6611
     while (1) {
      $25 = $$094 >>> 1; //@line 6613
      $26 = $$090 + $25 | 0; //@line 6614
      $27 = $26 << 1; //@line 6615
      $28 = $27 + $23 | 0; //@line 6616
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 6619
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 6623
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 6629
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 6637
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 6641
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 6647
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 6652
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 6655
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 6655
      }
     }
     $46 = $27 + $24 | 0; //@line 6658
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 6661
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 6665
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 6677
     } else {
      $$4 = 0; //@line 6679
     }
    } else {
     $$4 = 0; //@line 6682
    }
   } else {
    $$4 = 0; //@line 6685
   }
  } else {
   $$4 = 0; //@line 6688
  }
 } while (0);
 return $$4 | 0; //@line 6691
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9918
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 9923
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 9928
  } else {
   $20 = $0 & 255; //@line 9930
   $21 = $0 & 255; //@line 9931
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 9937
   } else {
    $26 = $1 + 20 | 0; //@line 9939
    $27 = HEAP32[$26 >> 2] | 0; //@line 9940
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 9946
     HEAP8[$27 >> 0] = $20; //@line 9947
     $34 = $21; //@line 9948
    } else {
     label = 12; //@line 9950
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 9955
     $32 = ___overflow($1, $0) | 0; //@line 9956
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 119; //@line 9959
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 9961
      sp = STACKTOP; //@line 9962
      return 0; //@line 9963
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 9965
      $34 = $32; //@line 9966
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 9971
   $$0 = $34; //@line 9972
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 9977
   $8 = $0 & 255; //@line 9978
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 9984
    $14 = HEAP32[$13 >> 2] | 0; //@line 9985
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 9991
     HEAP8[$14 >> 0] = $7; //@line 9992
     $$0 = $8; //@line 9993
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 9997
   $19 = ___overflow($1, $0) | 0; //@line 9998
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 118; //@line 10001
    sp = STACKTOP; //@line 10002
    return 0; //@line 10003
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10005
    $$0 = $19; //@line 10006
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 10011
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6250
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 6255
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 6260
  } else {
   $20 = $0 & 255; //@line 6262
   $21 = $0 & 255; //@line 6263
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 6269
   } else {
    $26 = $1 + 20 | 0; //@line 6271
    $27 = HEAP32[$26 >> 2] | 0; //@line 6272
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 6278
     HEAP8[$27 >> 0] = $20; //@line 6279
     $34 = $21; //@line 6280
    } else {
     label = 12; //@line 6282
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 6287
     $32 = ___overflow($1, $0) | 0; //@line 6288
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 108; //@line 6291
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 6293
      sp = STACKTOP; //@line 6294
      return 0; //@line 6295
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 6297
      $34 = $32; //@line 6298
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 6303
   $$0 = $34; //@line 6304
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 6309
   $8 = $0 & 255; //@line 6310
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 6316
    $14 = HEAP32[$13 >> 2] | 0; //@line 6317
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 6323
     HEAP8[$14 >> 0] = $7; //@line 6324
     $$0 = $8; //@line 6325
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 6329
   $19 = ___overflow($1, $0) | 0; //@line 6330
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 107; //@line 6333
    sp = STACKTOP; //@line 6334
    return 0; //@line 6335
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6337
    $$0 = $19; //@line 6338
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 6343
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6856
 $1 = $0 + 20 | 0; //@line 6857
 $3 = $0 + 28 | 0; //@line 6859
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 6865
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 6866
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 6867
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 114; //@line 6870
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 6872
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 6874
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 6876
    sp = STACKTOP; //@line 6877
    return 0; //@line 6878
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 6880
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 6884
     break;
    } else {
     label = 5; //@line 6887
     break;
    }
   }
  } else {
   label = 5; //@line 6892
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 6896
  $14 = HEAP32[$13 >> 2] | 0; //@line 6897
  $15 = $0 + 8 | 0; //@line 6898
  $16 = HEAP32[$15 >> 2] | 0; //@line 6899
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 6907
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 6908
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 6909
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 115; //@line 6912
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 6914
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 6916
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 6918
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 6920
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 6922
     sp = STACKTOP; //@line 6923
     return 0; //@line 6924
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6926
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 6932
  HEAP32[$3 >> 2] = 0; //@line 6933
  HEAP32[$1 >> 2] = 0; //@line 6934
  HEAP32[$15 >> 2] = 0; //@line 6935
  HEAP32[$13 >> 2] = 0; //@line 6936
  $$0 = 0; //@line 6937
 }
 return $$0 | 0; //@line 6939
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $$09$i = 0, $1 = 0, $12 = 0, $18 = 0, $2 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1772
 STACKTOP = STACKTOP + 144 | 0; //@line 1773
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(144); //@line 1773
 $1 = sp + 16 | 0; //@line 1774
 $2 = sp; //@line 1775
 HEAP32[$2 >> 2] = $varargs; //@line 1776
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1777
 $3 = _vsnprintf($1, 128, $0, $2) | 0; //@line 1778
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 74; //@line 1781
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 1783
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 1785
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 1787
  sp = STACKTOP; //@line 1788
  STACKTOP = sp; //@line 1789
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1791
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 1794
  return;
 }
 if (!(HEAP32[1337] | 0)) {
  _serial_init(5352, 2, 3); //@line 1799
  $$09$i = 0; //@line 1800
 } else {
  $$09$i = 0; //@line 1802
 }
 while (1) {
  $12 = HEAP8[$1 + $$09$i >> 0] | 0; //@line 1807
  $AsyncCtx2 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1808
  _serial_putc(5352, $12); //@line 1809
  if (___async) {
   label = 7; //@line 1812
   break;
  }
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1815
  $18 = $$09$i + 1 | 0; //@line 1816
  if (($18 | 0) == ($3 | 0)) {
   label = 9; //@line 1819
   break;
  } else {
   $$09$i = $18; //@line 1822
  }
 }
 if ((label | 0) == 7) {
  HEAP32[$AsyncCtx2 >> 2] = 75; //@line 1826
  HEAP32[$AsyncCtx2 + 4 >> 2] = $$09$i; //@line 1828
  HEAP32[$AsyncCtx2 + 8 >> 2] = $3; //@line 1830
  HEAP32[$AsyncCtx2 + 12 >> 2] = $1; //@line 1832
  HEAP32[$AsyncCtx2 + 16 >> 2] = $2; //@line 1834
  HEAP32[$AsyncCtx2 + 20 >> 2] = $1; //@line 1836
  sp = STACKTOP; //@line 1837
  STACKTOP = sp; //@line 1838
  return;
 } else if ((label | 0) == 9) {
  STACKTOP = sp; //@line 1841
  return;
 }
}
function _main__async_cb_14($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $13 = 0, $17 = 0, $18 = 0, $19 = 0, $4 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 12613
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12617
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12619
 $7 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 12620
 if (!$7) {
  $13 = $4 + 4 | 0; //@line 12624
  HEAP32[$13 >> 2] = 0; //@line 12626
  HEAP32[$13 + 4 >> 2] = 0; //@line 12629
  HEAP32[$4 >> 2] = 9; //@line 12630
  $17 = $4 + 12 | 0; //@line 12631
  HEAP32[$17 >> 2] = 440; //@line 12632
  $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 12633
  __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5432, $4); //@line 12634
  if (___async) {
   HEAP32[$ReallocAsyncCtx9 >> 2] = 100; //@line 12637
   $18 = $ReallocAsyncCtx9 + 4 | 0; //@line 12638
   HEAP32[$18 >> 2] = $17; //@line 12639
   $19 = $ReallocAsyncCtx9 + 8 | 0; //@line 12640
   HEAP32[$19 >> 2] = $4; //@line 12641
   sp = STACKTOP; //@line 12642
   return;
  }
  ___async_unwind = 0; //@line 12645
  HEAP32[$ReallocAsyncCtx9 >> 2] = 100; //@line 12646
  $18 = $ReallocAsyncCtx9 + 4 | 0; //@line 12647
  HEAP32[$18 >> 2] = $17; //@line 12648
  $19 = $ReallocAsyncCtx9 + 8 | 0; //@line 12649
  HEAP32[$19 >> 2] = $4; //@line 12650
  sp = STACKTOP; //@line 12651
  return;
 } else {
  $10 = HEAP32[$7 + 8 >> 2] | 0; //@line 12655
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 12656
  FUNCTION_TABLE_vi[$10 & 255]($6); //@line 12657
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 99; //@line 12660
   $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 12661
   HEAP32[$11 >> 2] = $4; //@line 12662
   sp = STACKTOP; //@line 12663
   return;
  }
  ___async_unwind = 0; //@line 12666
  HEAP32[$ReallocAsyncCtx2 >> 2] = 99; //@line 12667
  $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 12668
  HEAP32[$11 >> 2] = $4; //@line 12669
  sp = STACKTOP; //@line 12670
  return;
 }
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 6476
 $4 = HEAP32[$3 >> 2] | 0; //@line 6477
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 6484
   label = 5; //@line 6485
  } else {
   $$1 = 0; //@line 6487
  }
 } else {
  $12 = $4; //@line 6491
  label = 5; //@line 6492
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 6496
   $10 = HEAP32[$9 >> 2] | 0; //@line 6497
   $14 = $10; //@line 6500
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 6505
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 6513
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 6517
       $$141 = $0; //@line 6517
       $$143 = $1; //@line 6517
       $31 = $14; //@line 6517
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 6520
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 6527
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 6532
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 6535
      break L5;
     }
     $$139 = $$038; //@line 6541
     $$141 = $0 + $$038 | 0; //@line 6541
     $$143 = $1 - $$038 | 0; //@line 6541
     $31 = HEAP32[$9 >> 2] | 0; //@line 6541
    } else {
     $$139 = 0; //@line 6543
     $$141 = $0; //@line 6543
     $$143 = $1; //@line 6543
     $31 = $14; //@line 6543
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 6546
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 6549
   $$1 = $$139 + $$143 | 0; //@line 6551
  }
 } while (0);
 return $$1 | 0; //@line 6554
}
function __GLOBAL__sub_I_main_cpp() {
 var $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2256
 HEAP32[1340] = 0; //@line 2257
 HEAP32[1341] = 0; //@line 2257
 HEAP32[1342] = 0; //@line 2257
 HEAP32[1343] = 0; //@line 2257
 HEAP32[1344] = 0; //@line 2257
 HEAP32[1345] = 0; //@line 2257
 _gpio_init_out(5360, 50); //@line 2258
 HEAP32[1346] = 0; //@line 2259
 HEAP32[1347] = 0; //@line 2259
 HEAP32[1348] = 0; //@line 2259
 HEAP32[1349] = 0; //@line 2259
 HEAP32[1350] = 0; //@line 2259
 HEAP32[1351] = 0; //@line 2259
 _gpio_init_out(5384, 52); //@line 2260
 HEAP32[1352] = 0; //@line 2261
 HEAP32[1353] = 0; //@line 2261
 HEAP32[1354] = 0; //@line 2261
 HEAP32[1355] = 0; //@line 2261
 HEAP32[1356] = 0; //@line 2261
 HEAP32[1357] = 0; //@line 2261
 _gpio_init_out(5408, 53); //@line 2262
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2263
 __ZN4mbed10TimerEventC2Ev(5216); //@line 2264
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 88; //@line 2267
  sp = STACKTOP; //@line 2268
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2271
 HEAP32[1304] = 428; //@line 2272
 HEAP32[1314] = 0; //@line 2273
 HEAP32[1315] = 0; //@line 2273
 HEAP32[1316] = 0; //@line 2273
 HEAP32[1317] = 0; //@line 2273
 HEAP8[5272] = 1; //@line 2274
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2275
 __ZN4mbed10TimerEventC2Ev(5280); //@line 2276
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 89; //@line 2279
  sp = STACKTOP; //@line 2280
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2283
  HEAP32[1330] = 0; //@line 2284
  HEAP32[1331] = 0; //@line 2284
  HEAP32[1332] = 0; //@line 2284
  HEAP32[1333] = 0; //@line 2284
  HEAP8[5336] = 1; //@line 2285
  HEAP32[1320] = 352; //@line 2286
  __ZN4mbed11InterruptInC2E7PinName(5432, 1337); //@line 2287
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_36($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13570
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13574
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13576
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13578
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13580
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13582
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 13584
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 13586
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 13589
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 13590
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 13606
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 13607
    if (!___async) {
     ___async_unwind = 0; //@line 13610
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 140; //@line 13612
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 13614
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 13616
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 13618
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 13620
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 13622
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 13624
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 13626
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 13628
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 13631
    sp = STACKTOP; //@line 13632
    return;
   }
  }
 } while (0);
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_51($0) {
 $0 = $0 | 0;
 var $$phi$trans$insert = 0, $$pre10 = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 14
 $$phi$trans$insert = (HEAP32[$0 + 4 >> 2] | 0) + 12 | 0; //@line 15
 $$pre10 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 16
 if (!$$pre10) {
  HEAP32[$4 >> 2] = 0; //@line 19
  _gpio_irq_set($10 + 28 | 0, 2, 0); //@line 21
  return;
 }
 $13 = HEAP32[$$pre10 + 4 >> 2] | 0; //@line 25
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 26
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 27
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 30; //@line 30
  $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 31
  HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 32
  $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 33
  HEAP32[$15 >> 2] = $4; //@line 34
  $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 35
  HEAP32[$16 >> 2] = $8; //@line 36
  $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 37
  HEAP32[$17 >> 2] = $10; //@line 38
  sp = STACKTOP; //@line 39
  return;
 }
 ___async_unwind = 0; //@line 42
 HEAP32[$ReallocAsyncCtx4 >> 2] = 30; //@line 43
 $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 44
 HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 45
 $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 46
 HEAP32[$15 >> 2] = $4; //@line 47
 $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 48
 HEAP32[$16 >> 2] = $8; //@line 49
 $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 50
 HEAP32[$17 >> 2] = $10; //@line 51
 sp = STACKTOP; //@line 52
 return;
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6362
 STACKTOP = STACKTOP + 16 | 0; //@line 6363
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 6363
 $2 = sp; //@line 6364
 $3 = $1 & 255; //@line 6365
 HEAP8[$2 >> 0] = $3; //@line 6366
 $4 = $0 + 16 | 0; //@line 6367
 $5 = HEAP32[$4 >> 2] | 0; //@line 6368
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 6375
   label = 4; //@line 6376
  } else {
   $$0 = -1; //@line 6378
  }
 } else {
  $12 = $5; //@line 6381
  label = 4; //@line 6382
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 6386
   $10 = HEAP32[$9 >> 2] | 0; //@line 6387
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 6390
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 6397
     HEAP8[$10 >> 0] = $3; //@line 6398
     $$0 = $13; //@line 6399
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 6404
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 6405
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 6406
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 109; //@line 6409
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 6411
    sp = STACKTOP; //@line 6412
    STACKTOP = sp; //@line 6413
    return 0; //@line 6413
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 6415
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 6420
   } else {
    $$0 = -1; //@line 6422
   }
  }
 } while (0);
 STACKTOP = sp; //@line 6426
 return $$0 | 0; //@line 6426
}
function _fflush__async_cb_48($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14463
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 14465
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 14467
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 14471
  } else {
   $$02327 = $$02325; //@line 14473
   $$02426 = $AsyncRetVal; //@line 14473
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 14480
    } else {
     $16 = 0; //@line 14482
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 14494
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 14497
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 14500
     break L3;
    } else {
     $$02327 = $$023; //@line 14503
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 14506
   $13 = ___fflush_unlocked($$02327) | 0; //@line 14507
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 14511
    ___async_unwind = 0; //@line 14512
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 113; //@line 14514
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 14516
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 14518
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 14520
   sp = STACKTOP; //@line 14521
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 14525
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 14527
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 2228
 value = value & 255; //@line 2230
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 2233
   ptr = ptr + 1 | 0; //@line 2234
  }
  aligned_end = end & -4 | 0; //@line 2237
  block_aligned_end = aligned_end - 64 | 0; //@line 2238
  value4 = value | value << 8 | value << 16 | value << 24; //@line 2239
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 2242
   HEAP32[ptr + 4 >> 2] = value4; //@line 2243
   HEAP32[ptr + 8 >> 2] = value4; //@line 2244
   HEAP32[ptr + 12 >> 2] = value4; //@line 2245
   HEAP32[ptr + 16 >> 2] = value4; //@line 2246
   HEAP32[ptr + 20 >> 2] = value4; //@line 2247
   HEAP32[ptr + 24 >> 2] = value4; //@line 2248
   HEAP32[ptr + 28 >> 2] = value4; //@line 2249
   HEAP32[ptr + 32 >> 2] = value4; //@line 2250
   HEAP32[ptr + 36 >> 2] = value4; //@line 2251
   HEAP32[ptr + 40 >> 2] = value4; //@line 2252
   HEAP32[ptr + 44 >> 2] = value4; //@line 2253
   HEAP32[ptr + 48 >> 2] = value4; //@line 2254
   HEAP32[ptr + 52 >> 2] = value4; //@line 2255
   HEAP32[ptr + 56 >> 2] = value4; //@line 2256
   HEAP32[ptr + 60 >> 2] = value4; //@line 2257
   ptr = ptr + 64 | 0; //@line 2258
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 2262
   ptr = ptr + 4 | 0; //@line 2263
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 2268
  ptr = ptr + 1 | 0; //@line 2269
 }
 return end - num | 0; //@line 2271
}
function _main__async_cb_11($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 12511
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12513
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12515
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12517
 $8 = $2 + 4 | 0; //@line 12519
 HEAP32[$8 >> 2] = 0; //@line 12521
 HEAP32[$8 + 4 >> 2] = 0; //@line 12524
 HEAP32[$2 >> 2] = 7; //@line 12525
 $12 = $2 + 12 | 0; //@line 12526
 HEAP32[$12 >> 2] = 440; //@line 12527
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(20) | 0; //@line 12528
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5216, $2, 1.0); //@line 12529
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 96; //@line 12532
  $13 = $ReallocAsyncCtx8 + 4 | 0; //@line 12533
  HEAP32[$13 >> 2] = $12; //@line 12534
  $14 = $ReallocAsyncCtx8 + 8 | 0; //@line 12535
  HEAP32[$14 >> 2] = $4; //@line 12536
  $15 = $ReallocAsyncCtx8 + 12 | 0; //@line 12537
  HEAP32[$15 >> 2] = $2; //@line 12538
  $16 = $ReallocAsyncCtx8 + 16 | 0; //@line 12539
  HEAP32[$16 >> 2] = $6; //@line 12540
  sp = STACKTOP; //@line 12541
  return;
 }
 ___async_unwind = 0; //@line 12544
 HEAP32[$ReallocAsyncCtx8 >> 2] = 96; //@line 12545
 $13 = $ReallocAsyncCtx8 + 4 | 0; //@line 12546
 HEAP32[$13 >> 2] = $12; //@line 12547
 $14 = $ReallocAsyncCtx8 + 8 | 0; //@line 12548
 HEAP32[$14 >> 2] = $4; //@line 12549
 $15 = $ReallocAsyncCtx8 + 12 | 0; //@line 12550
 HEAP32[$15 >> 2] = $2; //@line 12551
 $16 = $ReallocAsyncCtx8 + 16 | 0; //@line 12552
 HEAP32[$16 >> 2] = $6; //@line 12553
 sp = STACKTOP; //@line 12554
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13507
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13511
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13513
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13515
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13517
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13519
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 13521
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 13524
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 13525
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 13534
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 13535
    if (!___async) {
     ___async_unwind = 0; //@line 13538
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 141; //@line 13540
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 13542
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 13544
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 13546
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 13548
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 13550
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 13552
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 13554
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 13557
    sp = STACKTOP; //@line 13558
    return;
   }
  }
 }
 return;
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 14364
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 14374
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 14374
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 14374
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 14378
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 14381
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 14384
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 14392
  } else {
   $20 = 0; //@line 14394
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 14404
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 14408
  HEAP32[___async_retval >> 2] = $$1; //@line 14410
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 14413
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 14414
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 14418
  ___async_unwind = 0; //@line 14419
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 113; //@line 14421
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 14423
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 14425
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 14427
 sp = STACKTOP; //@line 14428
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 14574
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14576
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14578
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14580
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14582
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 14584
 $$pre = HEAP32[$2 >> 2] | 0; //@line 14585
 if (!$$pre) {
  HEAP32[$4 >> 2] = 0; //@line 14588
  _gpio_irq_set($10 + 28 | 0, 2, 1); //@line 14590
  return;
 }
 $13 = HEAP32[$$pre + 4 >> 2] | 0; //@line 14594
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 14595
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 14596
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 28; //@line 14599
  $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 14600
  HEAP32[$14 >> 2] = $2; //@line 14601
  $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 14602
  HEAP32[$15 >> 2] = $4; //@line 14603
  $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 14604
  HEAP32[$16 >> 2] = $10; //@line 14605
  sp = STACKTOP; //@line 14606
  return;
 }
 ___async_unwind = 0; //@line 14609
 HEAP32[$ReallocAsyncCtx2 >> 2] = 28; //@line 14610
 $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 14611
 HEAP32[$14 >> 2] = $2; //@line 14612
 $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 14613
 HEAP32[$15 >> 2] = $4; //@line 14614
 $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 14615
 HEAP32[$16 >> 2] = $10; //@line 14616
 sp = STACKTOP; //@line 14617
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 656
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 658
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 660
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 662
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 667
  } else {
   $9 = $4 + 4 | 0; //@line 669
   $10 = HEAP32[$9 >> 2] | 0; //@line 670
   $11 = $4 + 8 | 0; //@line 671
   $12 = HEAP32[$11 >> 2] | 0; //@line 672
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 676
    HEAP32[$6 >> 2] = 0; //@line 677
    HEAP32[$2 >> 2] = 0; //@line 678
    HEAP32[$11 >> 2] = 0; //@line 679
    HEAP32[$9 >> 2] = 0; //@line 680
    $$0 = 0; //@line 681
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 688
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 689
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 690
   if (!___async) {
    ___async_unwind = 0; //@line 693
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 115; //@line 695
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 697
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 699
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 701
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 703
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 705
   sp = STACKTOP; //@line 706
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 711
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_6($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12311
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12313
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12315
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12317
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12319
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 12324
  return;
 }
 dest = $2 + 4 | 0; //@line 12328
 stop = dest + 52 | 0; //@line 12328
 do {
  HEAP32[dest >> 2] = 0; //@line 12328
  dest = dest + 4 | 0; //@line 12328
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 12329
 HEAP32[$2 + 8 >> 2] = $4; //@line 12331
 HEAP32[$2 + 12 >> 2] = -1; //@line 12333
 HEAP32[$2 + 48 >> 2] = 1; //@line 12335
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 12338
 $16 = HEAP32[$6 >> 2] | 0; //@line 12339
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 12340
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 12341
 if (!___async) {
  ___async_unwind = 0; //@line 12344
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 126; //@line 12346
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 12348
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 12350
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 12352
 sp = STACKTOP; //@line 12353
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 9628
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 9633
    $$0 = 1; //@line 9634
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 9647
     $$0 = 1; //@line 9648
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 9652
     $$0 = -1; //@line 9653
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 9663
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 9667
    $$0 = 2; //@line 9668
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 9680
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 9686
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 9690
    $$0 = 3; //@line 9691
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 9701
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 9707
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 9713
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 9717
    $$0 = 4; //@line 9718
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 9722
    $$0 = -1; //@line 9723
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 9728
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_37($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13643
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13647
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13649
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13651
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 13653
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 13655
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 13658
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 13659
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 13665
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 13666
   if (!___async) {
    ___async_unwind = 0; //@line 13669
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 139; //@line 13671
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 13673
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 13675
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 13677
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 13679
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 13681
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 13683
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 13686
   sp = STACKTOP; //@line 13687
   return;
  }
 }
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 12417
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12419
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12421
 $6 = $2 + 4 | 0; //@line 12423
 HEAP32[$6 >> 2] = 0; //@line 12425
 HEAP32[$6 + 4 >> 2] = 0; //@line 12428
 HEAP32[$2 >> 2] = 8; //@line 12429
 $10 = $2 + 12 | 0; //@line 12430
 HEAP32[$10 >> 2] = 440; //@line 12431
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(16) | 0; //@line 12432
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5280, $2, 2.5); //@line 12433
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 98; //@line 12436
  $11 = $ReallocAsyncCtx7 + 4 | 0; //@line 12437
  HEAP32[$11 >> 2] = $10; //@line 12438
  $12 = $ReallocAsyncCtx7 + 8 | 0; //@line 12439
  HEAP32[$12 >> 2] = $4; //@line 12440
  $13 = $ReallocAsyncCtx7 + 12 | 0; //@line 12441
  HEAP32[$13 >> 2] = $2; //@line 12442
  sp = STACKTOP; //@line 12443
  return;
 }
 ___async_unwind = 0; //@line 12446
 HEAP32[$ReallocAsyncCtx7 >> 2] = 98; //@line 12447
 $11 = $ReallocAsyncCtx7 + 4 | 0; //@line 12448
 HEAP32[$11 >> 2] = $10; //@line 12449
 $12 = $ReallocAsyncCtx7 + 8 | 0; //@line 12450
 HEAP32[$12 >> 2] = $4; //@line 12451
 $13 = $ReallocAsyncCtx7 + 12 | 0; //@line 12452
 HEAP32[$13 >> 2] = $2; //@line 12453
 sp = STACKTOP; //@line 12454
 return;
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 8512
  $8 = $0; //@line 8512
  $9 = $1; //@line 8512
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 8514
   $$0914 = $$0914 + -1 | 0; //@line 8518
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 8519
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 8520
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 8528
   }
  }
  $$010$lcssa$off0 = $8; //@line 8533
  $$09$lcssa = $$0914; //@line 8533
 } else {
  $$010$lcssa$off0 = $0; //@line 8535
  $$09$lcssa = $2; //@line 8535
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 8539
 } else {
  $$012 = $$010$lcssa$off0; //@line 8541
  $$111 = $$09$lcssa; //@line 8541
  while (1) {
   $26 = $$111 + -1 | 0; //@line 8546
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 8547
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 8551
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 8554
    $$111 = $26; //@line 8554
   }
  }
 }
 return $$1$lcssa | 0; //@line 8558
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14223
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14225
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14229
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14231
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 14233
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 14235
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 14239
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 14242
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 14243
   if (!___async) {
    ___async_unwind = 0; //@line 14246
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 143; //@line 14248
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 14250
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 14252
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 14254
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 14256
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 14258
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 14260
   sp = STACKTOP; //@line 14261
   return;
  }
 }
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 6128
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 6133
   label = 4; //@line 6134
  } else {
   $$01519 = $0; //@line 6136
   $23 = $1; //@line 6136
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 6141
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 6144
    $23 = $6; //@line 6145
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 6149
     label = 4; //@line 6150
     break;
    } else {
     $$01519 = $6; //@line 6153
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 6159
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 6161
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 6169
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 6177
  } else {
   $$pn = $$0; //@line 6179
   while (1) {
    $19 = $$pn + 1 | 0; //@line 6181
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 6185
     break;
    } else {
     $$pn = $19; //@line 6188
    }
   }
  }
  $$sink = $$1$lcssa; //@line 6193
 }
 return $$sink - $1 | 0; //@line 6196
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 10523
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 10530
   $10 = $1 + 16 | 0; //@line 10531
   $11 = HEAP32[$10 >> 2] | 0; //@line 10532
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 10535
    HEAP32[$1 + 24 >> 2] = $4; //@line 10537
    HEAP32[$1 + 36 >> 2] = 1; //@line 10539
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 10549
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 10554
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 10557
    HEAP8[$1 + 54 >> 0] = 1; //@line 10559
    break;
   }
   $21 = $1 + 24 | 0; //@line 10562
   $22 = HEAP32[$21 >> 2] | 0; //@line 10563
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 10566
    $28 = $4; //@line 10567
   } else {
    $28 = $22; //@line 10569
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 10578
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
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10017
 $1 = HEAP32[147] | 0; //@line 10018
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 10024
 } else {
  $19 = 0; //@line 10026
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 10032
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 10038
    $12 = HEAP32[$11 >> 2] | 0; //@line 10039
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 10045
     HEAP8[$12 >> 0] = 10; //@line 10046
     $22 = 0; //@line 10047
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 10051
   $17 = ___overflow($1, 10) | 0; //@line 10052
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 120; //@line 10055
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 10057
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 10059
    sp = STACKTOP; //@line 10060
    return 0; //@line 10061
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10063
    $22 = $17 >> 31; //@line 10065
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 10072
 }
 return $22 | 0; //@line 10074
}
function __ZN4mbed11InterruptInD0Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 99
 HEAP32[$0 >> 2] = 336; //@line 100
 _gpio_irq_free($0 + 28 | 0); //@line 102
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 104
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 110
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 111
   FUNCTION_TABLE_vi[$7 & 255]($0 + 56 | 0); //@line 112
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 23; //@line 115
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
 FUNCTION_TABLE_vi[$14 & 255]($0 + 40 | 0); //@line 137
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 24; //@line 140
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 142
  sp = STACKTOP; //@line 143
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 146
 __ZdlPv($0); //@line 147
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_44($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14271
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14277
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14279
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 14281
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 14283
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 14288
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 14290
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 14291
 if (!___async) {
  ___async_unwind = 0; //@line 14294
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 143; //@line 14296
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 14298
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 14300
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 14302
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 14304
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 14306
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 14308
 sp = STACKTOP; //@line 14309
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_52($0) {
 $0 = $0 | 0;
 var $$pre$i$i4 = 0, $12 = 0, $13 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 58
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 64
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 66
 $$pre$i$i4 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 67
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = $$pre$i$i4; //@line 68
 if (!$$pre$i$i4) {
  _gpio_irq_set($8 + 28 | 0, 2, 0); //@line 72
  return;
 }
 $12 = HEAP32[$$pre$i$i4 + 8 >> 2] | 0; //@line 77
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(12) | 0; //@line 78
 FUNCTION_TABLE_vi[$12 & 255]($6); //@line 79
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 82
  $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 83
  HEAP32[$13 >> 2] = $6; //@line 84
  $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 85
  HEAP32[$14 >> 2] = $8; //@line 86
  sp = STACKTOP; //@line 87
  return;
 }
 ___async_unwind = 0; //@line 90
 HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 91
 $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 92
 HEAP32[$13 >> 2] = $6; //@line 93
 $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 94
 HEAP32[$14 >> 2] = $8; //@line 95
 sp = STACKTOP; //@line 96
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10382
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 10391
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 10396
      HEAP32[$13 >> 2] = $2; //@line 10397
      $19 = $1 + 40 | 0; //@line 10398
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 10401
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 10411
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 10415
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 10422
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
 $$016 = 0; //@line 9748
 while (1) {
  if ((HEAPU8[2749 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 9755
   break;
  }
  $7 = $$016 + 1 | 0; //@line 9758
  if (($7 | 0) == 87) {
   $$01214 = 2837; //@line 9761
   $$115 = 87; //@line 9761
   label = 5; //@line 9762
   break;
  } else {
   $$016 = $7; //@line 9765
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 2837; //@line 9771
  } else {
   $$01214 = 2837; //@line 9773
   $$115 = $$016; //@line 9773
   label = 5; //@line 9774
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 9779
   $$113 = $$01214; //@line 9780
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 9784
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 9791
   if (!$$115) {
    $$012$lcssa = $$113; //@line 9794
    break;
   } else {
    $$01214 = $$113; //@line 9797
    label = 5; //@line 9798
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 9805
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 808
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 810
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 812
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 814
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 816
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 818
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 4777; //@line 823
  HEAP32[$4 + 4 >> 2] = $6; //@line 825
  _abort_message(4686, $4); //@line 826
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 829
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 832
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 833
 $16 = FUNCTION_TABLE_ii[$15 & 1]($12) | 0; //@line 834
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 838
  ___async_unwind = 0; //@line 839
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 122; //@line 841
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 843
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 845
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 847
 sp = STACKTOP; //@line 848
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 128
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 130
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 132
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 136
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 140
  label = 4; //@line 141
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 146
   label = 4; //@line 147
  } else {
   $$037$off039 = 3; //@line 149
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 153
  $17 = $8 + 40 | 0; //@line 154
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 157
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 167
    $$037$off039 = $$037$off038; //@line 168
   } else {
    $$037$off039 = $$037$off038; //@line 170
   }
  } else {
   $$037$off039 = $$037$off038; //@line 173
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 176
 return;
}
function __ZN4mbed6TickerD0Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2062
 HEAP32[$0 >> 2] = 428; //@line 2063
 $1 = $0 + 40 | 0; //@line 2064
 _emscripten_asm_const_ii(6, $1 | 0) | 0; //@line 2065
 $4 = HEAP32[$0 + 52 >> 2] | 0; //@line 2067
 do {
  if ($4 | 0) {
   $7 = HEAP32[$4 + 8 >> 2] | 0; //@line 2072
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2073
   FUNCTION_TABLE_vi[$7 & 255]($1); //@line 2074
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 81; //@line 2077
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2079
    sp = STACKTOP; //@line 2080
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 2083
    break;
   }
  }
 } while (0);
 $AsyncCtx2 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2088
 __ZN4mbed10TimerEventD2Ev($0); //@line 2089
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 82; //@line 2092
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 2094
  sp = STACKTOP; //@line 2095
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2098
  __ZdlPv($0); //@line 2099
  return;
 }
}
function _main__async_cb_9($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 12460
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12462
 $4 = $2 + 4 | 0; //@line 12464
 HEAP32[$4 >> 2] = 0; //@line 12466
 HEAP32[$4 + 4 >> 2] = 0; //@line 12469
 HEAP32[$2 >> 2] = 9; //@line 12470
 $8 = $2 + 12 | 0; //@line 12471
 HEAP32[$8 >> 2] = 440; //@line 12472
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 12473
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5432, $2); //@line 12474
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 100; //@line 12477
  $9 = $ReallocAsyncCtx9 + 4 | 0; //@line 12478
  HEAP32[$9 >> 2] = $8; //@line 12479
  $10 = $ReallocAsyncCtx9 + 8 | 0; //@line 12480
  HEAP32[$10 >> 2] = $2; //@line 12481
  sp = STACKTOP; //@line 12482
  return;
 }
 ___async_unwind = 0; //@line 12485
 HEAP32[$ReallocAsyncCtx9 >> 2] = 100; //@line 12486
 $9 = $ReallocAsyncCtx9 + 4 | 0; //@line 12487
 HEAP32[$9 >> 2] = $8; //@line 12488
 $10 = $ReallocAsyncCtx9 + 8 | 0; //@line 12489
 HEAP32[$10 >> 2] = $2; //@line 12490
 sp = STACKTOP; //@line 12491
 return;
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
   _mbed_assert_internal(1805, 1810, 528); //@line 501
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
 sp = STACKTOP; //@line 48
 HEAP32[$0 >> 2] = 336; //@line 49
 _gpio_irq_free($0 + 28 | 0); //@line 51
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 53
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 59
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 60
   FUNCTION_TABLE_vi[$7 & 255]($0 + 56 | 0); //@line 61
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 21; //@line 64
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
 FUNCTION_TABLE_vi[$14 & 255]($0 + 40 | 0); //@line 85
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 22; //@line 88
  sp = STACKTOP; //@line 89
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 92
 return;
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2129
 $2 = $0 + 12 | 0; //@line 2131
 $3 = HEAP32[$2 >> 2] | 0; //@line 2132
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2136
   _mbed_assert_internal(1805, 1810, 528); //@line 2137
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 84; //@line 2140
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 2142
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 2144
    sp = STACKTOP; //@line 2145
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2148
    $8 = HEAP32[$2 >> 2] | 0; //@line 2150
    break;
   }
  } else {
   $8 = $3; //@line 2154
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 2157
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2159
 FUNCTION_TABLE_vi[$7 & 255]($0); //@line 2160
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 85; //@line 2163
  sp = STACKTOP; //@line 2164
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2167
  return;
 }
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_3($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $15 = 0, $17 = 0, $18 = 0, $21 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 12193
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12199
 $8 = $0 + 16 | 0; //@line 12201
 $10 = HEAP32[$8 >> 2] | 0; //@line 12203
 $13 = HEAP32[$8 + 4 >> 2] | 0; //@line 12206
 $15 = HEAP32[$0 + 24 >> 2] | 0; //@line 12208
 $17 = HEAP32[$0 + 28 >> 2] | 0; //@line 12210
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 12212
 __ZN4mbed6Ticker5setupEy($6, $10, $13); //@line 12213
 $18 = HEAP32[$15 >> 2] | 0; //@line 12214
 if (!$18) {
  return;
 }
 $21 = HEAP32[$18 + 8 >> 2] | 0; //@line 12220
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 12221
 FUNCTION_TABLE_vi[$21 & 255]($17); //@line 12222
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 106; //@line 12225
  sp = STACKTOP; //@line 12226
  return;
 }
 ___async_unwind = 0; //@line 12229
 HEAP32[$ReallocAsyncCtx4 >> 2] = 106; //@line 12230
 sp = STACKTOP; //@line 12231
 return;
}
function _abort_message($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 10215
 STACKTOP = STACKTOP + 16 | 0; //@line 10216
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10216
 $1 = sp; //@line 10217
 HEAP32[$1 >> 2] = $varargs; //@line 10218
 $2 = HEAP32[115] | 0; //@line 10219
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 10220
 _vfprintf($2, $0, $1) | 0; //@line 10221
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 123; //@line 10224
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 10226
  sp = STACKTOP; //@line 10227
  STACKTOP = sp; //@line 10228
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 10230
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 10231
 _fputc(10, $2) | 0; //@line 10232
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 124; //@line 10235
  sp = STACKTOP; //@line 10236
  STACKTOP = sp; //@line 10237
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 10239
  _abort(); //@line 10240
 }
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
function _main__async_cb_16($0) {
 $0 = $0 | 0;
 var $4 = 0, $5 = 0, $8 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 12752
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12756
 $5 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 12757
 if (!$5) {
  $ReallocAsyncCtx10 = _emscripten_realloc_async_context(4) | 0; //@line 12760
  _wait_ms(-1); //@line 12761
  if (___async) {
   HEAP32[$ReallocAsyncCtx10 >> 2] = 102; //@line 12764
   sp = STACKTOP; //@line 12765
   return;
  }
  ___async_unwind = 0; //@line 12768
  HEAP32[$ReallocAsyncCtx10 >> 2] = 102; //@line 12769
  sp = STACKTOP; //@line 12770
  return;
 } else {
  $8 = HEAP32[$5 + 8 >> 2] | 0; //@line 12774
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 12775
  FUNCTION_TABLE_vi[$8 & 255]($4); //@line 12776
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 101; //@line 12779
   sp = STACKTOP; //@line 12780
   return;
  }
  ___async_unwind = 0; //@line 12783
  HEAP32[$ReallocAsyncCtx3 >> 2] = 101; //@line 12784
  sp = STACKTOP; //@line 12785
  return;
 }
}
function __ZN4mbed6TickerD2Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2021
 HEAP32[$0 >> 2] = 428; //@line 2022
 $1 = $0 + 40 | 0; //@line 2023
 _emscripten_asm_const_ii(6, $1 | 0) | 0; //@line 2024
 $4 = HEAP32[$0 + 52 >> 2] | 0; //@line 2026
 do {
  if ($4 | 0) {
   $7 = HEAP32[$4 + 8 >> 2] | 0; //@line 2031
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2032
   FUNCTION_TABLE_vi[$7 & 255]($1); //@line 2033
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 79; //@line 2036
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2038
    sp = STACKTOP; //@line 2039
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 2042
    break;
   }
  }
 } while (0);
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2047
 __ZN4mbed10TimerEventD2Ev($0); //@line 2048
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 80; //@line 2051
  sp = STACKTOP; //@line 2052
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2055
  return;
 }
}
function _mbed_error_printf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 873
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 875
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 877
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 879
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 881
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[1337] | 0)) {
  _serial_init(5352, 2, 3); //@line 889
 }
 $12 = HEAP8[$6 >> 0] | 0; //@line 892
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 893
 _serial_putc(5352, $12); //@line 894
 if (!___async) {
  ___async_unwind = 0; //@line 897
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 75; //@line 899
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = 0; //@line 901
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $AsyncRetVal; //@line 903
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 905
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $4; //@line 907
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $6; //@line 909
 sp = STACKTOP; //@line 910
 return;
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11818
 STACKTOP = STACKTOP + 16 | 0; //@line 11819
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11819
 $3 = sp; //@line 11820
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 11822
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 11825
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 11826
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 11827
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 147; //@line 11830
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 11832
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 11834
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 11836
  sp = STACKTOP; //@line 11837
  STACKTOP = sp; //@line 11838
  return 0; //@line 11838
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 11840
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 11844
 }
 STACKTOP = sp; //@line 11846
 return $8 & 1 | 0; //@line 11846
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 9579
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 9579
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 9580
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 9581
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 9590
    $$016 = $9; //@line 9593
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 9593
   } else {
    $$016 = $0; //@line 9595
    $storemerge = 0; //@line 9595
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 9597
   $$0 = $$016; //@line 9598
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 9602
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 9608
   HEAP32[tempDoublePtr >> 2] = $2; //@line 9611
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 9611
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 9612
  }
 }
 return +$$0;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14060
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 14068
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 14070
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 14072
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 14074
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 14076
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 14078
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 14080
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 14091
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 14092
 HEAP32[$10 >> 2] = 0; //@line 14093
 HEAP32[$12 >> 2] = 0; //@line 14094
 HEAP32[$14 >> 2] = 0; //@line 14095
 HEAP32[$2 >> 2] = 0; //@line 14096
 $33 = HEAP32[$16 >> 2] | 0; //@line 14097
 HEAP32[$16 >> 2] = $33 | $18; //@line 14102
 if ($20 | 0) {
  ___unlockfile($22); //@line 14105
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 14108
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
 sp = STACKTOP; //@line 10738
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10744
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 10747
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10750
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10751
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 10752
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 129; //@line 10755
    sp = STACKTOP; //@line 10756
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10759
    break;
   }
  }
 } while (0);
 return;
}
function _mbed_error_printf__async_cb_64($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 917
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 921
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 923
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 925
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 927
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 928
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $14 = HEAP8[$10 + $12 >> 0] | 0; //@line 935
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 936
 _serial_putc(5352, $14); //@line 937
 if (!___async) {
  ___async_unwind = 0; //@line 940
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 75; //@line 942
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $12; //@line 944
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 946
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 948
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 950
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 952
 sp = STACKTOP; //@line 953
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
function _schedule_interrupt__async_cb_58($0) {
 $0 = $0 | 0;
 var $16 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 586
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 590
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 592
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 594
 $8 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 595
 if ($4 >>> 0 > $8 >>> 0) {
  if (!($AsyncRetVal >>> 0 >= $4 >>> 0 | $AsyncRetVal >>> 0 < $8 >>> 0)) {
   return;
  }
 } else {
  if (!($AsyncRetVal >>> 0 >= $4 >>> 0 & $AsyncRetVal >>> 0 < $8 >>> 0)) {
   return;
  }
 }
 $16 = HEAP32[(HEAP32[$6 >> 2] | 0) + 20 >> 2] | 0; //@line 614
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(4) | 0; //@line 615
 FUNCTION_TABLE_v[$16 & 15](); //@line 616
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 54; //@line 619
  sp = STACKTOP; //@line 620
  return;
 }
 ___async_unwind = 0; //@line 623
 HEAP32[$ReallocAsyncCtx6 >> 2] = 54; //@line 624
 sp = STACKTOP; //@line 625
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
 sp = STACKTOP; //@line 11737
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 11739
 $8 = $7 >> 8; //@line 11740
 if (!($7 & 1)) {
  $$0 = $8; //@line 11744
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 11749
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 11751
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 11754
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11759
 FUNCTION_TABLE_viiiiii[$17 & 3]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 11760
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 145; //@line 11763
  sp = STACKTOP; //@line 11764
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11767
  return;
 }
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10907
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 10913
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 10916
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 10919
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10920
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 10921
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 132; //@line 10924
    sp = STACKTOP; //@line 10925
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10928
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
 sp = STACKTOP; //@line 11779
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 11781
 $7 = $6 >> 8; //@line 11782
 if (!($6 & 1)) {
  $$0 = $7; //@line 11786
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 11791
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 11793
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 11796
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11801
 FUNCTION_TABLE_viiiii[$16 & 3]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 11802
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 146; //@line 11805
  sp = STACKTOP; //@line 11806
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11809
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
function ___dynamic_cast__async_cb_73($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1733
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1735
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1737
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1743
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 1758
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 1774
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 1779
    break;
   }
  default:
   {
    $$0 = 0; //@line 1783
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 1788
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11694
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 11696
 $6 = $5 >> 8; //@line 11697
 if (!($5 & 1)) {
  $$0 = $6; //@line 11701
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 11706
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 11708
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 11711
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11716
 FUNCTION_TABLE_viiii[$15 & 3]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 11717
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 144; //@line 11720
  sp = STACKTOP; //@line 11721
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11724
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
 sp = STACKTOP; //@line 8577
 STACKTOP = STACKTOP + 256 | 0; //@line 8578
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 8578
 $5 = sp; //@line 8579
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 8585
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 8589
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 8592
   $$011 = $9; //@line 8593
   do {
    _out_670($0, $5, 256); //@line 8595
    $$011 = $$011 + -256 | 0; //@line 8596
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 8605
  } else {
   $$0$lcssa = $9; //@line 8607
  }
  _out_670($0, $5, $$0$lcssa); //@line 8609
 }
 STACKTOP = sp; //@line 8611
 return;
}
function __ZN4mbed11InterruptInD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 14180
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14182
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 14184
 if (!$4) {
  __ZdlPv($2); //@line 14187
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 14192
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 14193
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 14194
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 24; //@line 14197
  $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 14198
  HEAP32[$9 >> 2] = $2; //@line 14199
  sp = STACKTOP; //@line 14200
  return;
 }
 ___async_unwind = 0; //@line 14203
 HEAP32[$ReallocAsyncCtx2 >> 2] = 24; //@line 14204
 $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 14205
 HEAP32[$9 >> 2] = $2; //@line 14206
 sp = STACKTOP; //@line 14207
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5986
 STACKTOP = STACKTOP + 32 | 0; //@line 5987
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 5987
 $vararg_buffer = sp; //@line 5988
 $3 = sp + 20 | 0; //@line 5989
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 5993
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 5995
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 5997
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 5999
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 6001
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 6006
  $10 = -1; //@line 6007
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 6010
 }
 STACKTOP = sp; //@line 6012
 return $10 | 0; //@line 6012
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
 _mbed_error_printf(1471, $vararg_buffer); //@line 1451
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
function _initialize__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1011
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1013
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1015
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1017
 $9 = HEAP32[(HEAP32[$4 >> 2] | 0) + 24 >> 2] | 0; //@line 1020
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 1021
 $10 = FUNCTION_TABLE_i[$9 & 3]() | 0; //@line 1022
 if (!___async) {
  HEAP32[___async_retval >> 2] = $10; //@line 1026
  ___async_unwind = 0; //@line 1027
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 43; //@line 1029
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 1031
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 1033
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 1035
 sp = STACKTOP; //@line 1036
 return;
}
function _schedule_interrupt__async_cb_57($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 554
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 556
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 558
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 560
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 4 >> 2] | 0; //@line 563
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(16) | 0; //@line 564
 $10 = FUNCTION_TABLE_i[$9 & 3]() | 0; //@line 565
 if (!___async) {
  HEAP32[___async_retval >> 2] = $10; //@line 569
  ___async_unwind = 0; //@line 570
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 53; //@line 572
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $4; //@line 574
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $6; //@line 576
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $2; //@line 578
 sp = STACKTOP; //@line 579
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 10460
 $5 = HEAP32[$4 >> 2] | 0; //@line 10461
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 10465
   HEAP32[$1 + 24 >> 2] = $3; //@line 10467
   HEAP32[$1 + 36 >> 2] = 1; //@line 10469
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 10473
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 10476
    HEAP32[$1 + 24 >> 2] = 2; //@line 10478
    HEAP8[$1 + 54 >> 0] = 1; //@line 10480
    break;
   }
   $10 = $1 + 24 | 0; //@line 10483
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 10487
   }
  }
 } while (0);
 return;
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 11010
 STACKTOP = STACKTOP + 16 | 0; //@line 11011
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11011
 $vararg_buffer = sp; //@line 11012
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 11013
 FUNCTION_TABLE_v[$0 & 15](); //@line 11014
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 134; //@line 11017
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 11019
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 11021
  sp = STACKTOP; //@line 11022
  STACKTOP = sp; //@line 11023
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11025
  _abort_message(5068, $vararg_buffer); //@line 11026
 }
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 6093
 $3 = HEAP8[$1 >> 0] | 0; //@line 6094
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 6099
  $$lcssa8 = $2; //@line 6099
 } else {
  $$011 = $1; //@line 6101
  $$0710 = $0; //@line 6101
  do {
   $$0710 = $$0710 + 1 | 0; //@line 6103
   $$011 = $$011 + 1 | 0; //@line 6104
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 6105
   $9 = HEAP8[$$011 >> 0] | 0; //@line 6106
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 6111
  $$lcssa8 = $8; //@line 6111
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 6121
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1962
 $2 = HEAP32[147] | 0; //@line 1963
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1964
 _putc($1, $2) | 0; //@line 1965
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 77; //@line 1968
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 1970
  sp = STACKTOP; //@line 1971
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1974
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1975
 _fflush($2) | 0; //@line 1976
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 78; //@line 1979
  sp = STACKTOP; //@line 1980
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1983
  return;
 }
}
function _mbed_die__async_cb_34($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 13452
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13454
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13456
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 13457
 _wait_ms(150); //@line 13458
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 59; //@line 13461
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 13462
  HEAP32[$4 >> 2] = $2; //@line 13463
  sp = STACKTOP; //@line 13464
  return;
 }
 ___async_unwind = 0; //@line 13467
 HEAP32[$ReallocAsyncCtx15 >> 2] = 59; //@line 13468
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 13469
 HEAP32[$4 >> 2] = $2; //@line 13470
 sp = STACKTOP; //@line 13471
 return;
}
function _mbed_die__async_cb_33($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 13427
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13429
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13431
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 13432
 _wait_ms(150); //@line 13433
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 60; //@line 13436
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 13437
  HEAP32[$4 >> 2] = $2; //@line 13438
  sp = STACKTOP; //@line 13439
  return;
 }
 ___async_unwind = 0; //@line 13442
 HEAP32[$ReallocAsyncCtx14 >> 2] = 60; //@line 13443
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 13444
 HEAP32[$4 >> 2] = $2; //@line 13445
 sp = STACKTOP; //@line 13446
 return;
}
function _mbed_die__async_cb_32($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 13402
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13404
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13406
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 13407
 _wait_ms(150); //@line 13408
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 61; //@line 13411
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 13412
  HEAP32[$4 >> 2] = $2; //@line 13413
  sp = STACKTOP; //@line 13414
  return;
 }
 ___async_unwind = 0; //@line 13417
 HEAP32[$ReallocAsyncCtx13 >> 2] = 61; //@line 13418
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 13419
 HEAP32[$4 >> 2] = $2; //@line 13420
 sp = STACKTOP; //@line 13421
 return;
}
function _mbed_die__async_cb_31($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 13377
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13379
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13381
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 13382
 _wait_ms(150); //@line 13383
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 62; //@line 13386
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 13387
  HEAP32[$4 >> 2] = $2; //@line 13388
  sp = STACKTOP; //@line 13389
  return;
 }
 ___async_unwind = 0; //@line 13392
 HEAP32[$ReallocAsyncCtx12 >> 2] = 62; //@line 13393
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 13394
 HEAP32[$4 >> 2] = $2; //@line 13395
 sp = STACKTOP; //@line 13396
 return;
}
function _mbed_die__async_cb_30($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 13352
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13354
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13356
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 13357
 _wait_ms(150); //@line 13358
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 63; //@line 13361
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 13362
  HEAP32[$4 >> 2] = $2; //@line 13363
  sp = STACKTOP; //@line 13364
  return;
 }
 ___async_unwind = 0; //@line 13367
 HEAP32[$ReallocAsyncCtx11 >> 2] = 63; //@line 13368
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 13369
 HEAP32[$4 >> 2] = $2; //@line 13370
 sp = STACKTOP; //@line 13371
 return;
}
function _mbed_die__async_cb_29($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 13327
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13329
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13331
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 13332
 _wait_ms(150); //@line 13333
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 64; //@line 13336
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 13337
  HEAP32[$4 >> 2] = $2; //@line 13338
  sp = STACKTOP; //@line 13339
  return;
 }
 ___async_unwind = 0; //@line 13342
 HEAP32[$ReallocAsyncCtx10 >> 2] = 64; //@line 13343
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 13344
 HEAP32[$4 >> 2] = $2; //@line 13345
 sp = STACKTOP; //@line 13346
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 13077
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13079
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13081
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 13082
 _wait_ms(150); //@line 13083
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 58; //@line 13086
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 13087
  HEAP32[$4 >> 2] = $2; //@line 13088
  sp = STACKTOP; //@line 13089
  return;
 }
 ___async_unwind = 0; //@line 13092
 HEAP32[$ReallocAsyncCtx16 >> 2] = 58; //@line 13093
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 13094
 HEAP32[$4 >> 2] = $2; //@line 13095
 sp = STACKTOP; //@line 13096
 return;
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 6045
 STACKTOP = STACKTOP + 32 | 0; //@line 6046
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 6046
 $vararg_buffer = sp; //@line 6047
 HEAP32[$0 + 36 >> 2] = 1; //@line 6050
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 6058
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 6060
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 6062
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 6067
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 6070
 STACKTOP = sp; //@line 6071
 return $14 | 0; //@line 6071
}
function _mbed_die__async_cb_28($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 13302
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13304
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13306
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 13307
 _wait_ms(150); //@line 13308
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 65; //@line 13311
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 13312
  HEAP32[$4 >> 2] = $2; //@line 13313
  sp = STACKTOP; //@line 13314
  return;
 }
 ___async_unwind = 0; //@line 13317
 HEAP32[$ReallocAsyncCtx9 >> 2] = 65; //@line 13318
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 13319
 HEAP32[$4 >> 2] = $2; //@line 13320
 sp = STACKTOP; //@line 13321
 return;
}
function _mbed_die__async_cb_27($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 13277
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13279
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13281
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 13282
 _wait_ms(400); //@line 13283
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 66; //@line 13286
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 13287
  HEAP32[$4 >> 2] = $2; //@line 13288
  sp = STACKTOP; //@line 13289
  return;
 }
 ___async_unwind = 0; //@line 13292
 HEAP32[$ReallocAsyncCtx8 >> 2] = 66; //@line 13293
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 13294
 HEAP32[$4 >> 2] = $2; //@line 13295
 sp = STACKTOP; //@line 13296
 return;
}
function _mbed_die__async_cb_26($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 13252
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13254
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13256
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 13257
 _wait_ms(400); //@line 13258
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 67; //@line 13261
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 13262
  HEAP32[$4 >> 2] = $2; //@line 13263
  sp = STACKTOP; //@line 13264
  return;
 }
 ___async_unwind = 0; //@line 13267
 HEAP32[$ReallocAsyncCtx7 >> 2] = 67; //@line 13268
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 13269
 HEAP32[$4 >> 2] = $2; //@line 13270
 sp = STACKTOP; //@line 13271
 return;
}
function _mbed_die__async_cb_25($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 13227
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13229
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13231
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 13232
 _wait_ms(400); //@line 13233
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 68; //@line 13236
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 13237
  HEAP32[$4 >> 2] = $2; //@line 13238
  sp = STACKTOP; //@line 13239
  return;
 }
 ___async_unwind = 0; //@line 13242
 HEAP32[$ReallocAsyncCtx6 >> 2] = 68; //@line 13243
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 13244
 HEAP32[$4 >> 2] = $2; //@line 13245
 sp = STACKTOP; //@line 13246
 return;
}
function _mbed_die__async_cb_24($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 13202
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13204
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13206
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 13207
 _wait_ms(400); //@line 13208
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 69; //@line 13211
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 13212
  HEAP32[$4 >> 2] = $2; //@line 13213
  sp = STACKTOP; //@line 13214
  return;
 }
 ___async_unwind = 0; //@line 13217
 HEAP32[$ReallocAsyncCtx5 >> 2] = 69; //@line 13218
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 13219
 HEAP32[$4 >> 2] = $2; //@line 13220
 sp = STACKTOP; //@line 13221
 return;
}
function _mbed_die__async_cb_23($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 13177
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13179
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13181
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 13182
 _wait_ms(400); //@line 13183
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 70; //@line 13186
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 13187
  HEAP32[$4 >> 2] = $2; //@line 13188
  sp = STACKTOP; //@line 13189
  return;
 }
 ___async_unwind = 0; //@line 13192
 HEAP32[$ReallocAsyncCtx4 >> 2] = 70; //@line 13193
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 13194
 HEAP32[$4 >> 2] = $2; //@line 13195
 sp = STACKTOP; //@line 13196
 return;
}
function _mbed_die__async_cb_22($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13152
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13154
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13156
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 13157
 _wait_ms(400); //@line 13158
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 71; //@line 13161
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 13162
  HEAP32[$4 >> 2] = $2; //@line 13163
  sp = STACKTOP; //@line 13164
  return;
 }
 ___async_unwind = 0; //@line 13167
 HEAP32[$ReallocAsyncCtx3 >> 2] = 71; //@line 13168
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 13169
 HEAP32[$4 >> 2] = $2; //@line 13170
 sp = STACKTOP; //@line 13171
 return;
}
function _mbed_die__async_cb_21($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13127
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13129
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 13131
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 13132
 _wait_ms(400); //@line 13133
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 72; //@line 13136
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 13137
  HEAP32[$4 >> 2] = $2; //@line 13138
  sp = STACKTOP; //@line 13139
  return;
 }
 ___async_unwind = 0; //@line 13142
 HEAP32[$ReallocAsyncCtx2 >> 2] = 72; //@line 13143
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 13144
 HEAP32[$4 >> 2] = $2; //@line 13145
 sp = STACKTOP; //@line 13146
 return;
}
function _mbed_die__async_cb_20($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13102
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13104
 _emscripten_asm_const_iii(0, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 13106
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 13107
 _wait_ms(400); //@line 13108
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 73; //@line 13111
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 13112
  HEAP32[$4 >> 2] = $2; //@line 13113
  sp = STACKTOP; //@line 13114
  return;
 }
 ___async_unwind = 0; //@line 13117
 HEAP32[$ReallocAsyncCtx >> 2] = 73; //@line 13118
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 13119
 HEAP32[$4 >> 2] = $2; //@line 13120
 sp = STACKTOP; //@line 13121
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
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 2279
 newDynamicTop = oldDynamicTop + increment | 0; //@line 2280
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 2284
  ___setErrNo(12); //@line 2285
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 2289
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 2293
   ___setErrNo(12); //@line 2294
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 2298
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 6216
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 6218
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 6224
  $11 = ___fwritex($0, $4, $3) | 0; //@line 6225
  if ($phitmp) {
   $13 = $11; //@line 6227
  } else {
   ___unlockfile($3); //@line 6229
   $13 = $11; //@line 6230
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 6234
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 6238
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 6241
 }
 return $15 | 0; //@line 6243
}
function _main__async_cb_13($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 12586
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12588
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12590
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12592
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(16) | 0; //@line 12593
 _puts(2075) | 0; //@line 12594
 if (!___async) {
  ___async_unwind = 0; //@line 12597
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 94; //@line 12599
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 12601
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 12603
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 12605
 sp = STACKTOP; //@line 12606
 return;
}
function _main__async_cb_12($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 12560
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12562
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12564
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12566
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 12567
 _puts(2178) | 0; //@line 12568
 if (!___async) {
  ___async_unwind = 0; //@line 12571
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 95; //@line 12573
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $2; //@line 12575
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $4; //@line 12577
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $6; //@line 12579
 sp = STACKTOP; //@line 12580
 return;
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 8438
 } else {
  $$056 = $2; //@line 8440
  $15 = $1; //@line 8440
  $8 = $0; //@line 8440
  while (1) {
   $14 = $$056 + -1 | 0; //@line 8448
   HEAP8[$14 >> 0] = HEAPU8[2731 + ($8 & 15) >> 0] | 0 | $3; //@line 8449
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 8450
   $15 = tempRet0; //@line 8451
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 8456
    break;
   } else {
    $$056 = $14; //@line 8459
   }
  }
 }
 return $$05$lcssa | 0; //@line 8463
}
function __ZSt9terminatev() {
 var $0 = 0, $16 = 0, $17 = 0, $2 = 0, $5 = 0, sp = 0;
 sp = STACKTOP; //@line 10975
 $0 = ___cxa_get_globals_fast() | 0; //@line 10976
 if ($0 | 0) {
  $2 = HEAP32[$0 >> 2] | 0; //@line 10979
  if ($2 | 0) {
   $5 = $2 + 48 | 0; //@line 10983
   if ((HEAP32[$5 >> 2] & -256 | 0) == 1126902528 ? (HEAP32[$5 + 4 >> 2] | 0) == 1129074247 : 0) {
    $16 = HEAP32[$2 + 12 >> 2] | 0; //@line 10995
    _emscripten_alloc_async_context(4, sp) | 0; //@line 10996
    __ZSt11__terminatePFvvE($16); //@line 10997
   }
  }
 }
 $17 = __ZSt13get_terminatev() | 0; //@line 11002
 _emscripten_alloc_async_context(4, sp) | 0; //@line 11003
 __ZSt11__terminatePFvvE($17); //@line 11004
}
function __ZN4mbed11InterruptInD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 14533
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14535
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 14537
 if (!$4) {
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 14544
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 14545
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 14546
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 22; //@line 14549
  sp = STACKTOP; //@line 14550
  return;
 }
 ___async_unwind = 0; //@line 14553
 HEAP32[$ReallocAsyncCtx2 >> 2] = 22; //@line 14554
 sp = STACKTOP; //@line 14555
 return;
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 6433
 $3 = HEAP8[$1 >> 0] | 0; //@line 6435
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 6439
 $7 = HEAP32[$0 >> 2] | 0; //@line 6440
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 6445
  HEAP32[$0 + 4 >> 2] = 0; //@line 6447
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 6449
  HEAP32[$0 + 28 >> 2] = $14; //@line 6451
  HEAP32[$0 + 20 >> 2] = $14; //@line 6453
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 6459
  $$0 = 0; //@line 6460
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 6463
  $$0 = -1; //@line 6464
 }
 return $$0 | 0; //@line 6466
}
function __GLOBAL__sub_I_main_cpp__async_cb_62($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 769
 HEAP32[1304] = 428; //@line 770
 HEAP32[1314] = 0; //@line 771
 HEAP32[1315] = 0; //@line 771
 HEAP32[1316] = 0; //@line 771
 HEAP32[1317] = 0; //@line 771
 HEAP8[5272] = 1; //@line 772
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 773
 __ZN4mbed10TimerEventC2Ev(5280); //@line 774
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 89; //@line 777
  sp = STACKTOP; //@line 778
  return;
 }
 ___async_unwind = 0; //@line 781
 HEAP32[$ReallocAsyncCtx >> 2] = 89; //@line 782
 sp = STACKTOP; //@line 783
 return;
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 8475
 } else {
  $$06 = $2; //@line 8477
  $11 = $1; //@line 8477
  $7 = $0; //@line 8477
  while (1) {
   $10 = $$06 + -1 | 0; //@line 8482
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 8483
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 8484
   $11 = tempRet0; //@line 8485
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 8490
    break;
   } else {
    $$06 = $10; //@line 8493
   }
  }
 }
 return $$0$lcssa | 0; //@line 8497
}
function __ZN4mbed7Timeout7handlerEv__async_cb_5($0) {
 $0 = $0 | 0;
 var $4 = 0, $5 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12249
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12253
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 12255
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 12256
 FUNCTION_TABLE_vi[$5 & 255]($4); //@line 12257
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 37; //@line 12260
  sp = STACKTOP; //@line 12261
  return;
 }
 ___async_unwind = 0; //@line 12264
 HEAP32[$ReallocAsyncCtx >> 2] = 37; //@line 12265
 sp = STACKTOP; //@line 12266
 return;
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11851
 do {
  if (!$0) {
   $3 = 0; //@line 11855
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11857
   $2 = ___dynamic_cast($0, 240, 296, 0) | 0; //@line 11858
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 148; //@line 11861
    sp = STACKTOP; //@line 11862
    return 0; //@line 11863
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 11865
    $3 = ($2 | 0) != 0 & 1; //@line 11868
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 11873
}
function _invoke_ticker__async_cb_41($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14133
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 14139
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 14140
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 14141
 FUNCTION_TABLE_vi[$5 & 255]($6); //@line 14142
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 85; //@line 14145
  sp = STACKTOP; //@line 14146
  return;
 }
 ___async_unwind = 0; //@line 14149
 HEAP32[$ReallocAsyncCtx >> 2] = 85; //@line 14150
 sp = STACKTOP; //@line 14151
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 8119
 } else {
  $$04 = 0; //@line 8121
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 8124
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 8128
   $12 = $7 + 1 | 0; //@line 8129
   HEAP32[$0 >> 2] = $12; //@line 8130
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 8136
    break;
   } else {
    $$04 = $11; //@line 8139
   }
  }
 }
 return $$0$lcssa | 0; //@line 8143
}
function ___muldi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $x_sroa_0_0_extract_trunc = 0, $y_sroa_0_0_extract_trunc = 0, $1$0 = 0, $1$1 = 0;
 $x_sroa_0_0_extract_trunc = $a$0; //@line 1812
 $y_sroa_0_0_extract_trunc = $b$0; //@line 1813
 $1$0 = ___muldsi3($x_sroa_0_0_extract_trunc, $y_sroa_0_0_extract_trunc) | 0; //@line 1814
 $1$1 = tempRet0; //@line 1815
 return (tempRet0 = (Math_imul($a$1, $y_sroa_0_0_extract_trunc) | 0) + (Math_imul($b$1, $x_sroa_0_0_extract_trunc) | 0) + $1$1 | $1$1 & 0, $1$0 | 0 | 0) | 0; //@line 1817
}
function runPostSets() {}
function ___muldsi3($a, $b) {
 $a = $a | 0;
 $b = $b | 0;
 var $1 = 0, $2 = 0, $3 = 0, $6 = 0, $8 = 0, $11 = 0, $12 = 0;
 $1 = $a & 65535; //@line 1797
 $2 = $b & 65535; //@line 1798
 $3 = Math_imul($2, $1) | 0; //@line 1799
 $6 = $a >>> 16; //@line 1800
 $8 = ($3 >>> 16) + (Math_imul($2, $6) | 0) | 0; //@line 1801
 $11 = $b >>> 16; //@line 1802
 $12 = Math_imul($11, $1) | 0; //@line 1803
 return (tempRet0 = ($8 >>> 16) + (Math_imul($11, $6) | 0) + ((($8 & 65535) + $12 | 0) >>> 16) | 0, $8 + $12 << 16 | $3 & 65535 | 0) | 0; //@line 1804
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
function __ZN4mbed7TimeoutD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 14031
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14033
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 14034
 __ZN4mbed10TimerEventD2Ev($2); //@line 14035
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 33; //@line 14038
  sp = STACKTOP; //@line 14039
  return;
 }
 ___async_unwind = 0; //@line 14042
 HEAP32[$ReallocAsyncCtx2 >> 2] = 33; //@line 14043
 sp = STACKTOP; //@line 14044
 return;
}
function __Z11toggle_led2v() {
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2314
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2315
 _puts(2027) | 0; //@line 2316
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 91; //@line 2319
  sp = STACKTOP; //@line 2320
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2323
  $2 = (_emscripten_asm_const_ii(8, HEAP32[1346] | 0) | 0) == 0 & 1; //@line 2327
  _emscripten_asm_const_iii(0, HEAP32[1346] | 0, $2 | 0) | 0; //@line 2329
  return;
 }
}
function __ZN4mbed6Ticker7handlerEv($0) {
 $0 = $0 | 0;
 var $2 = 0, $5 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2106
 $2 = HEAP32[$0 + 52 >> 2] | 0; //@line 2108
 if (!$2) {
  return;
 }
 $5 = HEAP32[$2 >> 2] | 0; //@line 2114
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2115
 FUNCTION_TABLE_vi[$5 & 255]($0 + 40 | 0); //@line 2116
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 83; //@line 2119
  sp = STACKTOP; //@line 2120
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2123
 return;
}
function __Z10blink_led1v() {
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2293
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2294
 _puts(1944) | 0; //@line 2295
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 90; //@line 2298
  sp = STACKTOP; //@line 2299
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2302
  $2 = (_emscripten_asm_const_ii(8, HEAP32[1340] | 0) | 0) == 0 & 1; //@line 2306
  _emscripten_asm_const_iii(0, HEAP32[1340] | 0, $2 | 0) | 0; //@line 2308
  return;
 }
}
function __ZN4mbed6TickerD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1683
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1685
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 1686
 __ZN4mbed10TimerEventD2Ev($2); //@line 1687
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 80; //@line 1690
  sp = STACKTOP; //@line 1691
  return;
 }
 ___async_unwind = 0; //@line 1694
 HEAP32[$ReallocAsyncCtx2 >> 2] = 80; //@line 1695
 sp = STACKTOP; //@line 1696
 return;
}
function ___fflush_unlocked__async_cb_61($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 721
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 723
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 725
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 727
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 729
 HEAP32[$4 >> 2] = 0; //@line 730
 HEAP32[$6 >> 2] = 0; //@line 731
 HEAP32[$8 >> 2] = 0; //@line 732
 HEAP32[$10 >> 2] = 0; //@line 733
 HEAP32[___async_retval >> 2] = 0; //@line 735
 return;
}
function _serial_putc__async_cb_8($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12392
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12394
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 12395
 _fflush($2) | 0; //@line 12396
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 78; //@line 12399
  sp = STACKTOP; //@line 12400
  return;
 }
 ___async_unwind = 0; //@line 12403
 HEAP32[$ReallocAsyncCtx >> 2] = 78; //@line 12404
 sp = STACKTOP; //@line 12405
 return;
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
function __ZN4mbed7TimeoutD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12800
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12802
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 12803
 __ZN4mbed10TimerEventD2Ev($2); //@line 12804
 if (!___async) {
  ___async_unwind = 0; //@line 12807
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 35; //@line 12809
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 12811
 sp = STACKTOP; //@line 12812
 return;
}
function __ZN4mbed6TickerD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12359
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12361
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 12362
 __ZN4mbed10TimerEventD2Ev($2); //@line 12363
 if (!___async) {
  ___async_unwind = 0; //@line 12366
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 82; //@line 12368
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 12370
 sp = STACKTOP; //@line 12371
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
function _emscripten_async_resume() {
 ___async = 0; //@line 2130
 ___async_unwind = 1; //@line 2131
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 2137
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 2141
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 2145
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 2147
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5856
 STACKTOP = STACKTOP + 16 | 0; //@line 5857
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 5857
 $vararg_buffer = sp; //@line 5858
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 5862
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 5864
 STACKTOP = sp; //@line 5865
 return $5 | 0; //@line 5865
}
function __ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2194
 $1 = HEAP32[$0 >> 2] | 0; //@line 2195
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2196
 FUNCTION_TABLE_v[$1 & 15](); //@line 2197
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 86; //@line 2200
  sp = STACKTOP; //@line 2201
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2204
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
 sp = STACKTOP; //@line 1878
 $2 = HEAP32[1336] | 0; //@line 1879
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1880
 FUNCTION_TABLE_vii[$2 & 3]($0, $1); //@line 1881
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 76; //@line 1884
  sp = STACKTOP; //@line 1885
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1888
  return;
 }
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 2072
 STACKTOP = STACKTOP + 16 | 0; //@line 2073
 $rem = __stackBase__ | 0; //@line 2074
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 2075
 STACKTOP = __stackBase__; //@line 2076
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 2077
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 1842
 if ((ret | 0) < 8) return ret | 0; //@line 1843
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 1844
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 1845
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 1846
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 1847
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 1848
}
function ___cxa_get_globals_fast() {
 var $3 = 0, sp = 0;
 sp = STACKTOP; //@line 10196
 STACKTOP = STACKTOP + 16 | 0; //@line 10197
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10197
 if (!(_pthread_once(6080, 10) | 0)) {
  $3 = _pthread_getspecific(HEAP32[1521] | 0) | 0; //@line 10203
  STACKTOP = sp; //@line 10204
  return $3 | 0; //@line 10204
 } else {
  _abort_message(4916, sp); //@line 10206
 }
 return 0; //@line 10209
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10364
 }
 return;
}
function __Z12turn_led3_onv() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2335
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2336
 _puts(2048) | 0; //@line 2337
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 92; //@line 2340
  sp = STACKTOP; //@line 2341
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2344
  _emscripten_asm_const_iii(0, HEAP32[1352] | 0, 1) | 0; //@line 2346
  return;
 }
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13483
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13485
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 13486
 _fputc(10, $2) | 0; //@line 13487
 if (!___async) {
  ___async_unwind = 0; //@line 13490
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 124; //@line 13492
 sp = STACKTOP; //@line 13493
 return;
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 9901
 $6 = HEAP32[$5 >> 2] | 0; //@line 9902
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 9903
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 9905
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 9907
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 9910
 return $2 | 0; //@line 9911
}
function __ZL25default_terminate_handlerv__async_cb_63($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 856
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 858
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 860
 HEAP32[$2 >> 2] = 4777; //@line 861
 HEAP32[$2 + 4 >> 2] = $4; //@line 863
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 865
 _abort_message(4641, $2); //@line 866
}
function _gpio_irq_init($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0;
 if (($1 | 0) == -1) {
  $$0 = -1; //@line 1901
  return $$0 | 0; //@line 1902
 }
 HEAP32[1336] = $2; //@line 1904
 HEAP32[$0 >> 2] = $1; //@line 1905
 HEAP32[$0 + 4 >> 2] = $1; //@line 1907
 _emscripten_asm_const_iii(3, $3 | 0, $1 | 0) | 0; //@line 1908
 $$0 = 0; //@line 1909
 return $$0 | 0; //@line 1910
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12286
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 12297
  $$0 = 1; //@line 12298
 } else {
  $$0 = 0; //@line 12300
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 12304
 return;
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 14334
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 14337
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 14342
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 14345
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 10958
 STACKTOP = STACKTOP + 16 | 0; //@line 10959
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10959
 _free($0); //@line 10961
 if (!(_pthread_setspecific(HEAP32[1521] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 10966
  return;
 } else {
  _abort_message(5015, sp); //@line 10968
 }
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 1941
 HEAP32[$0 >> 2] = $1; //@line 1942
 HEAP32[1337] = 1; //@line 1943
 $4 = $0; //@line 1944
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 1949
 $10 = 5352; //@line 1950
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 1952
 HEAP32[$10 + 4 >> 2] = $9; //@line 1955
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 10440
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2241
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2242
 _emscripten_sleep($0 | 0); //@line 2243
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 87; //@line 2246
  sp = STACKTOP; //@line 2247
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2250
  return;
 }
}
function _main__async_cb_10($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 12497
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(4) | 0; //@line 12498
 _wait_ms(-1); //@line 12499
 if (!___async) {
  ___async_unwind = 0; //@line 12502
 }
 HEAP32[$ReallocAsyncCtx10 >> 2] = 102; //@line 12504
 sp = STACKTOP; //@line 12505
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 10504
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 10508
  }
 }
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var sp = 0;
 sp = STACKTOP; //@line 10943
 STACKTOP = STACKTOP + 16 | 0; //@line 10944
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10944
 if (!(_pthread_key_create(6084, 133) | 0)) {
  STACKTOP = sp; //@line 10949
  return;
 } else {
  _abort_message(4965, sp); //@line 10951
 }
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 2106
 HEAP32[new_frame + 4 >> 2] = sp; //@line 2108
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 2110
 ___async_cur_frame = new_frame; //@line 2111
 return ___async_cur_frame + 8 | 0; //@line 2112
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 11922
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 11926
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 11929
 return;
}
function __GLOBAL__sub_I_main_cpp__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[1330] = 0; //@line 760
 HEAP32[1331] = 0; //@line 760
 HEAP32[1332] = 0; //@line 760
 HEAP32[1333] = 0; //@line 760
 HEAP8[5336] = 1; //@line 761
 HEAP32[1320] = 352; //@line 762
 __ZN4mbed11InterruptInC2E7PinName(5432, 1337); //@line 763
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 2095
  return low << bits; //@line 2096
 }
 tempRet0 = low << bits - 32; //@line 2098
 return 0; //@line 2099
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 2084
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 2085
 }
 tempRet0 = 0; //@line 2087
 return high >>> bits - 32 | 0; //@line 2088
}
function _fflush__async_cb_46($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 14441
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 14443
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 14446
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_50($0) {
 $0 = $0 | 0;
 var $6 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14629
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 14631
 _gpio_irq_set($6 + 28 | 0, 2, 1); //@line 14633
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
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 13065
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 13068
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 13071
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 1000
 } else {
  $$0 = -1; //@line 1002
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 1005
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 6563
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 6569
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 6573
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 2361
}
function _fputc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11894
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 11895
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 11897
 return;
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 14161
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 14162
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 14164
 return;
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 2118
 stackRestore(___async_cur_frame | 0); //@line 2119
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 2120
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 1864
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 1870
 _emscripten_asm_const_iii(2, $0 | 0, $1 | 0) | 0; //@line 1871
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 9560
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 9560
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 9562
 return $1 | 0; //@line 9563
}
function _gpio_init_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 1849
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 1855
 _emscripten_asm_const_iii(1, $0 | 0, $1 | 0) | 0; //@line 1856
 return;
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 6022
  $$0 = -1; //@line 6023
 } else {
  $$0 = $0; //@line 6025
 }
 return $$0 | 0; //@line 6027
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 1835
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 1836
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 1837
}
function __ZN4mbed6Ticker5setupEy($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $4 = 0;
 $4 = ___udivdi3($1 | 0, $2 | 0, 1e3, 0) | 0; //@line 2178
 _emscripten_asm_const_iii(7, $0 + 40 | 0, $4 | 0) | 0; //@line 2180
 return;
}
function __Z11toggle_led2v__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(8, HEAP32[1346] | 0) | 0) == 0 & 1; //@line 11882
 _emscripten_asm_const_iii(0, HEAP32[1346] | 0, $3 | 0) | 0; //@line 11884
 return;
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 2354
}
function __Z10blink_led1v__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(8, HEAP32[1340] | 0) | 0) == 0 & 1; //@line 647
 _emscripten_asm_const_iii(0, HEAP32[1340] | 0, $3 | 0) | 0; //@line 649
 return;
}
function ___clang_call_terminate($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 153
 ___cxa_begin_catch($0 | 0) | 0; //@line 154
 _emscripten_alloc_async_context(4, sp) | 0; //@line 155
 __ZSt9terminatev(); //@line 156
}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 1827
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 1829
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 2347
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 8620
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 8623
 }
 return $$0 | 0; //@line 8625
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 2319
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 2064
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 6203
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 6207
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 1719
 return;
}
function _gpio_irq_set($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 _emscripten_asm_const_iiii(5, HEAP32[$0 + 4 >> 2] | 0, $1 | 0, $2 | 0) | 0; //@line 1931
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 2125
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 2126
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_53($0) {
 $0 = $0 | 0;
 _gpio_irq_set((HEAP32[$0 + 8 >> 2] | 0) + 28 | 0, 2, 0); //@line 108
 return;
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 11043
 __ZdlPv($0); //@line 11044
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 10726
 __ZdlPv($0); //@line 10727
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 6699
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 6701
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 10254
 __ZdlPv($0); //@line 10255
 return;
}
function _ticker_set_handler__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 4 >> 2] >> 2] = HEAP32[$0 + 8 >> 2]; //@line 14121
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 12278
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
  ___fwritex($1, $2, $0) | 0; //@line 8105
 }
 return;
}
function b133(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 2740
}
function __ZN4mbed8CallbackIFvvEE13function_moveIPS1_EEvPvPKv($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = HEAP32[$1 >> 2]; //@line 2214
 return;
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 10451
}
function __ZSt13get_terminatev() {
 var $0 = 0;
 $0 = HEAP32[272] | 0; //@line 11033
 HEAP32[272] = $0 + 0; //@line 11035
 return $0 | 0; //@line 11037
}
function _gpio_irq_free($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iii(4, HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 1920
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
 FUNCTION_TABLE_vii[index & 3](a1 | 0, a2 | 0); //@line 2340
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
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 2152
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_54($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b131(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 2737
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _fflush__async_cb_47($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 14456
 return;
}
function __Z12turn_led3_onv__async_cb($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iii(0, HEAP32[1352] | 0, 1) | 0; //@line 979
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 8568
}
function _putc__async_cb_42($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 14174
 return;
}
function _fputc__async_cb_1($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 11907
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 2312
}
function __ZN4mbed11InterruptInD0Ev__async_cb_43($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 14216
 return;
}
function b8(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 2380
 return 0; //@line 2380
}
function b7(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 2377
 return 0; //@line 2377
}
function b6(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 2374
 return 0; //@line 2374
}
function __ZN4mbed6Ticker6detachEv($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_ii(6, $0 + 40 | 0) | 0; //@line 2188
 return;
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(5068, HEAP32[$0 + 4 >> 2] | 0); //@line 117
}
function __ZN4mbed7TimeoutD0Ev__async_cb_18($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 12821
 return;
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 255](a1 | 0); //@line 2333
}
function b129(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 2734
}
function __ZN4mbed6TickerD0Ev__async_cb_7($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 12380
 return;
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 9813
}
function _main__async_cb_17($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 12794
 return;
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_65($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_i(index) {
 index = index | 0;
 return FUNCTION_TABLE_i[index & 3]() | 0; //@line 2305
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
 FUNCTION_TABLE_v[index & 15](); //@line 2326
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 6080
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIPS1_EEvPv($0) {
 $0 = $0 | 0;
 return;
}
function b4(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 2371
 return 0; //@line 2371
}
function b127(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(3); //@line 2731
}
function b126(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(0); //@line 2728
}
function _abort_message__async_cb_35($0) {
 $0 = $0 | 0;
 _abort(); //@line 13500
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
function ___ofl_lock() {
 ___lock(6068); //@line 6706
 return 6076; //@line 6707
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
 ___cxa_pure_virtual(); //@line 2386
}
function __ZN4mbed11InterruptInD2Ev__async_cb_49($0) {
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
 return _pthread_self() | 0; //@line 9734
}
function __ZN4mbed6Ticker7handlerEv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 9740
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
function __ZN4mbed7TimeoutD2Ev__async_cb_40($0) {
 $0 = $0 | 0;
 return;
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 10080
 return;
}
function __ZN4mbed6TickerD2Ev__async_cb_72($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_60($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_59($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_56($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_55($0) {
 $0 = $0 | 0;
 return;
}
function _mbed_assert_internal__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b2() {
 nullFunc_i(3); //@line 2368
 return 0; //@line 2368
}
function b1() {
 nullFunc_i(0); //@line 2365
 return 0; //@line 2365
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
 ___unlock(6068); //@line 6712
 return;
}
function b124(p0) {
 p0 = p0 | 0;
 nullFunc_vi(255); //@line 2725
}
function b123(p0) {
 p0 = p0 | 0;
 nullFunc_vi(254); //@line 2722
}
function b122(p0) {
 p0 = p0 | 0;
 nullFunc_vi(253); //@line 2719
}
function b121(p0) {
 p0 = p0 | 0;
 nullFunc_vi(252); //@line 2716
}
function b120(p0) {
 p0 = p0 | 0;
 nullFunc_vi(251); //@line 2713
}
function b119(p0) {
 p0 = p0 | 0;
 nullFunc_vi(250); //@line 2710
}
function b118(p0) {
 p0 = p0 | 0;
 nullFunc_vi(249); //@line 2707
}
function b117(p0) {
 p0 = p0 | 0;
 nullFunc_vi(248); //@line 2704
}
function b116(p0) {
 p0 = p0 | 0;
 nullFunc_vi(247); //@line 2701
}
function b115(p0) {
 p0 = p0 | 0;
 nullFunc_vi(246); //@line 2698
}
function b114(p0) {
 p0 = p0 | 0;
 nullFunc_vi(245); //@line 2695
}
function b113(p0) {
 p0 = p0 | 0;
 nullFunc_vi(244); //@line 2692
}
function b112(p0) {
 p0 = p0 | 0;
 nullFunc_vi(243); //@line 2689
}
function b111(p0) {
 p0 = p0 | 0;
 nullFunc_vi(242); //@line 2686
}
function b110(p0) {
 p0 = p0 | 0;
 nullFunc_vi(241); //@line 2683
}
function b109(p0) {
 p0 = p0 | 0;
 nullFunc_vi(240); //@line 2680
}
function b108(p0) {
 p0 = p0 | 0;
 nullFunc_vi(239); //@line 2677
}
function b107(p0) {
 p0 = p0 | 0;
 nullFunc_vi(238); //@line 2674
}
function b106(p0) {
 p0 = p0 | 0;
 nullFunc_vi(237); //@line 2671
}
function b105(p0) {
 p0 = p0 | 0;
 nullFunc_vi(236); //@line 2668
}
function b104(p0) {
 p0 = p0 | 0;
 nullFunc_vi(235); //@line 2665
}
function b103(p0) {
 p0 = p0 | 0;
 nullFunc_vi(234); //@line 2662
}
function b102(p0) {
 p0 = p0 | 0;
 nullFunc_vi(233); //@line 2659
}
function b101(p0) {
 p0 = p0 | 0;
 nullFunc_vi(232); //@line 2656
}
function b100(p0) {
 p0 = p0 | 0;
 nullFunc_vi(231); //@line 2653
}
function b99(p0) {
 p0 = p0 | 0;
 nullFunc_vi(230); //@line 2650
}
function b98(p0) {
 p0 = p0 | 0;
 nullFunc_vi(229); //@line 2647
}
function b97(p0) {
 p0 = p0 | 0;
 nullFunc_vi(228); //@line 2644
}
function b96(p0) {
 p0 = p0 | 0;
 nullFunc_vi(227); //@line 2641
}
function b95(p0) {
 p0 = p0 | 0;
 nullFunc_vi(226); //@line 2638
}
function b94(p0) {
 p0 = p0 | 0;
 nullFunc_vi(225); //@line 2635
}
function b93(p0) {
 p0 = p0 | 0;
 nullFunc_vi(224); //@line 2632
}
function b92(p0) {
 p0 = p0 | 0;
 nullFunc_vi(223); //@line 2629
}
function b91(p0) {
 p0 = p0 | 0;
 nullFunc_vi(222); //@line 2626
}
function b90(p0) {
 p0 = p0 | 0;
 nullFunc_vi(221); //@line 2623
}
function b89(p0) {
 p0 = p0 | 0;
 nullFunc_vi(220); //@line 2620
}
function b88(p0) {
 p0 = p0 | 0;
 nullFunc_vi(219); //@line 2617
}
function b87(p0) {
 p0 = p0 | 0;
 nullFunc_vi(218); //@line 2614
}
function b86(p0) {
 p0 = p0 | 0;
 nullFunc_vi(217); //@line 2611
}
function b85(p0) {
 p0 = p0 | 0;
 nullFunc_vi(216); //@line 2608
}
function b84(p0) {
 p0 = p0 | 0;
 nullFunc_vi(215); //@line 2605
}
function b83(p0) {
 p0 = p0 | 0;
 nullFunc_vi(214); //@line 2602
}
function b82(p0) {
 p0 = p0 | 0;
 nullFunc_vi(213); //@line 2599
}
function b81(p0) {
 p0 = p0 | 0;
 nullFunc_vi(212); //@line 2596
}
function b80(p0) {
 p0 = p0 | 0;
 nullFunc_vi(211); //@line 2593
}
function b79(p0) {
 p0 = p0 | 0;
 nullFunc_vi(210); //@line 2590
}
function b78(p0) {
 p0 = p0 | 0;
 nullFunc_vi(209); //@line 2587
}
function b77(p0) {
 p0 = p0 | 0;
 nullFunc_vi(208); //@line 2584
}
function b76(p0) {
 p0 = p0 | 0;
 nullFunc_vi(207); //@line 2581
}
function b75(p0) {
 p0 = p0 | 0;
 nullFunc_vi(206); //@line 2578
}
function b74(p0) {
 p0 = p0 | 0;
 nullFunc_vi(205); //@line 2575
}
function b73(p0) {
 p0 = p0 | 0;
 nullFunc_vi(204); //@line 2572
}
function b72(p0) {
 p0 = p0 | 0;
 nullFunc_vi(203); //@line 2569
}
function b71(p0) {
 p0 = p0 | 0;
 nullFunc_vi(202); //@line 2566
}
function b70(p0) {
 p0 = p0 | 0;
 nullFunc_vi(201); //@line 2563
}
function b69(p0) {
 p0 = p0 | 0;
 nullFunc_vi(200); //@line 2560
}
function b68(p0) {
 p0 = p0 | 0;
 nullFunc_vi(199); //@line 2557
}
function b67(p0) {
 p0 = p0 | 0;
 nullFunc_vi(198); //@line 2554
}
function b66(p0) {
 p0 = p0 | 0;
 nullFunc_vi(197); //@line 2551
}
function b65(p0) {
 p0 = p0 | 0;
 nullFunc_vi(196); //@line 2548
}
function b64(p0) {
 p0 = p0 | 0;
 nullFunc_vi(195); //@line 2545
}
function b63(p0) {
 p0 = p0 | 0;
 nullFunc_vi(194); //@line 2542
}
function b62(p0) {
 p0 = p0 | 0;
 nullFunc_vi(193); //@line 2539
}
function b61(p0) {
 p0 = p0 | 0;
 nullFunc_vi(192); //@line 2536
}
function b60(p0) {
 p0 = p0 | 0;
 nullFunc_vi(191); //@line 2533
}
function b59(p0) {
 p0 = p0 | 0;
 nullFunc_vi(190); //@line 2530
}
function b58(p0) {
 p0 = p0 | 0;
 nullFunc_vi(189); //@line 2527
}
function b57(p0) {
 p0 = p0 | 0;
 nullFunc_vi(188); //@line 2524
}
function b56(p0) {
 p0 = p0 | 0;
 nullFunc_vi(187); //@line 2521
}
function b55(p0) {
 p0 = p0 | 0;
 nullFunc_vi(186); //@line 2518
}
function b54(p0) {
 p0 = p0 | 0;
 nullFunc_vi(185); //@line 2515
}
function b53(p0) {
 p0 = p0 | 0;
 nullFunc_vi(184); //@line 2512
}
function b52(p0) {
 p0 = p0 | 0;
 nullFunc_vi(183); //@line 2509
}
function b51(p0) {
 p0 = p0 | 0;
 nullFunc_vi(182); //@line 2506
}
function b50(p0) {
 p0 = p0 | 0;
 nullFunc_vi(181); //@line 2503
}
function b49(p0) {
 p0 = p0 | 0;
 nullFunc_vi(180); //@line 2500
}
function b48(p0) {
 p0 = p0 | 0;
 nullFunc_vi(179); //@line 2497
}
function b47(p0) {
 p0 = p0 | 0;
 nullFunc_vi(178); //@line 2494
}
function b46(p0) {
 p0 = p0 | 0;
 nullFunc_vi(177); //@line 2491
}
function b45(p0) {
 p0 = p0 | 0;
 nullFunc_vi(176); //@line 2488
}
function b44(p0) {
 p0 = p0 | 0;
 nullFunc_vi(175); //@line 2485
}
function b43(p0) {
 p0 = p0 | 0;
 nullFunc_vi(174); //@line 2482
}
function b42(p0) {
 p0 = p0 | 0;
 nullFunc_vi(173); //@line 2479
}
function b41(p0) {
 p0 = p0 | 0;
 nullFunc_vi(172); //@line 2476
}
function b40(p0) {
 p0 = p0 | 0;
 nullFunc_vi(171); //@line 2473
}
function b39(p0) {
 p0 = p0 | 0;
 nullFunc_vi(170); //@line 2470
}
function b38(p0) {
 p0 = p0 | 0;
 nullFunc_vi(169); //@line 2467
}
function b37(p0) {
 p0 = p0 | 0;
 nullFunc_vi(168); //@line 2464
}
function b36(p0) {
 p0 = p0 | 0;
 nullFunc_vi(167); //@line 2461
}
function b35(p0) {
 p0 = p0 | 0;
 nullFunc_vi(166); //@line 2458
}
function b34(p0) {
 p0 = p0 | 0;
 nullFunc_vi(165); //@line 2455
}
function b33(p0) {
 p0 = p0 | 0;
 nullFunc_vi(164); //@line 2452
}
function b32(p0) {
 p0 = p0 | 0;
 nullFunc_vi(163); //@line 2449
}
function b31(p0) {
 p0 = p0 | 0;
 nullFunc_vi(162); //@line 2446
}
function b30(p0) {
 p0 = p0 | 0;
 nullFunc_vi(161); //@line 2443
}
function b29(p0) {
 p0 = p0 | 0;
 nullFunc_vi(160); //@line 2440
}
function b28(p0) {
 p0 = p0 | 0;
 nullFunc_vi(159); //@line 2437
}
function b27(p0) {
 p0 = p0 | 0;
 nullFunc_vi(158); //@line 2434
}
function b26(p0) {
 p0 = p0 | 0;
 nullFunc_vi(157); //@line 2431
}
function b25(p0) {
 p0 = p0 | 0;
 nullFunc_vi(156); //@line 2428
}
function b24(p0) {
 p0 = p0 | 0;
 nullFunc_vi(155); //@line 2425
}
function b23(p0) {
 p0 = p0 | 0;
 nullFunc_vi(154); //@line 2422
}
function b22(p0) {
 p0 = p0 | 0;
 nullFunc_vi(153); //@line 2419
}
function b21(p0) {
 p0 = p0 | 0;
 nullFunc_vi(152); //@line 2416
}
function b20(p0) {
 p0 = p0 | 0;
 nullFunc_vi(151); //@line 2413
}
function b19(p0) {
 p0 = p0 | 0;
 nullFunc_vi(150); //@line 2410
}
function b18(p0) {
 p0 = p0 | 0;
 nullFunc_vi(149); //@line 2407
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 6038
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 6355
}
function b17(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 2404
}
function _us_ticker_set_interrupt($0) {
 $0 = $0 | 0;
 return;
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _initialize__async_cb_69($0) {
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
function _us_ticker_get_info() {
 return 452; //@line 2236
}
function _get_us_ticker_data() {
 return 384; //@line 1436
}
function __ZSt9terminatev__async_cb_45($0) {
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
 return 6064; //@line 6032
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
 return 0; //@line 1995
}
function _pthread_self() {
 return 720; //@line 6085
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
 nullFunc_v(15); //@line 2401
}
function b14() {
 nullFunc_v(14); //@line 2398
}
function b13() {
 nullFunc_v(13); //@line 2395
}
function b12() {
 nullFunc_v(12); //@line 2392
}
function b11() {
 nullFunc_v(11); //@line 2389
}
function b10() {
 nullFunc_v(0); //@line 2383
}
function _us_ticker_init() {
 return;
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_i = [b1,_us_ticker_read,_us_ticker_get_info,b2];
var FUNCTION_TABLE_ii = [b4,___stdio_close];
var FUNCTION_TABLE_iiii = [b6,___stdio_write,___stdio_seek,___stdout_write,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b7,b8];
var FUNCTION_TABLE_v = [b10,___cxa_pure_virtual__wrapper,_us_ticker_init,_us_ticker_disable_interrupt,_us_ticker_clear_interrupt,_us_ticker_fire_interrupt,__ZL25default_terminate_handlerv,__Z10blink_led1v,__Z12turn_led3_onv,__Z11toggle_led2v,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev,b11,b12,b13,b14,b15];
var FUNCTION_TABLE_vi = [b17,__ZN4mbed11InterruptInD2Ev,__ZN4mbed11InterruptInD0Ev,__ZN4mbed7TimeoutD2Ev,__ZN4mbed7TimeoutD0Ev,__ZN4mbed7Timeout7handlerEv,__ZN4mbed10TimerEventD2Ev,__ZN4mbed10TimerEventD0Ev,_us_ticker_set_interrupt,__ZN4mbed10TimerEvent3irqEj,__ZN4mbed6TickerD2Ev,__ZN4mbed6TickerD0Ev,__ZN4mbed6Ticker7handlerEv,__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv,__ZN4mbed8CallbackIFvvEE13function_dtorIPS1_EEvPv,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed11InterruptInD2Ev__async_cb,__ZN4mbed11InterruptInD2Ev__async_cb_49,__ZN4mbed11InterruptInD0Ev__async_cb,__ZN4mbed11InterruptInD0Ev__async_cb_43,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_65,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_50
,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_51,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_52,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_53,__ZN4mbed7TimeoutD2Ev__async_cb,__ZN4mbed7TimeoutD2Ev__async_cb_40,__ZN4mbed7TimeoutD0Ev__async_cb,__ZN4mbed7TimeoutD0Ev__async_cb_18,__ZN4mbed7Timeout7handlerEv__async_cb_5,__ZN4mbed7Timeout7handlerEv__async_cb,__ZN4mbed10TimerEventD2Ev__async_cb,__ZN4mbed10TimerEventC2Ev__async_cb,__ZN4mbed10TimerEvent3irqEj__async_cb,_ticker_set_handler__async_cb,_initialize__async_cb,_initialize__async_cb_66,_initialize__async_cb_71,_initialize__async_cb_70,_initialize__async_cb_67,_initialize__async_cb_68,_initialize__async_cb_69,_schedule_interrupt__async_cb,_schedule_interrupt__async_cb_55,_schedule_interrupt__async_cb_56,_schedule_interrupt__async_cb_57,_schedule_interrupt__async_cb_58,_schedule_interrupt__async_cb_59,_schedule_interrupt__async_cb_60,_ticker_remove_event__async_cb,_mbed_assert_internal__async_cb,_mbed_die__async_cb_34
,_mbed_die__async_cb_33,_mbed_die__async_cb_32,_mbed_die__async_cb_31,_mbed_die__async_cb_30,_mbed_die__async_cb_29,_mbed_die__async_cb_28,_mbed_die__async_cb_27,_mbed_die__async_cb_26,_mbed_die__async_cb_25,_mbed_die__async_cb_24,_mbed_die__async_cb_23,_mbed_die__async_cb_22,_mbed_die__async_cb_21,_mbed_die__async_cb_20,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_printf__async_cb_64,_handle_interrupt_in__async_cb,_serial_putc__async_cb_8,_serial_putc__async_cb,__ZN4mbed6TickerD2Ev__async_cb,__ZN4mbed6TickerD2Ev__async_cb_72,__ZN4mbed6TickerD0Ev__async_cb,__ZN4mbed6TickerD0Ev__async_cb_7,__ZN4mbed6Ticker7handlerEv__async_cb,_invoke_ticker__async_cb_41,_invoke_ticker__async_cb,__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv__async_cb,_wait_ms__async_cb,__GLOBAL__sub_I_main_cpp__async_cb_62
,__GLOBAL__sub_I_main_cpp__async_cb,__Z10blink_led1v__async_cb,__Z11toggle_led2v__async_cb,__Z12turn_led3_onv__async_cb,_main__async_cb_13,_main__async_cb_12,_main__async_cb_11,_main__async_cb_15,_main__async_cb,_main__async_cb_14,_main__async_cb_9,_main__async_cb_16,_main__async_cb_10,_main__async_cb_17,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_2,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_3,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_4,_putc__async_cb_42,_putc__async_cb,___overflow__async_cb,_fflush__async_cb_47,_fflush__async_cb_46,_fflush__async_cb_48,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_61,_vfprintf__async_cb,_vsnprintf__async_cb,_fputc__async_cb_1
,_fputc__async_cb,_puts__async_cb,__ZL25default_terminate_handlerv__async_cb,__ZL25default_terminate_handlerv__async_cb_63,_abort_message__async_cb,_abort_message__async_cb_35,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_6,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_73,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_54,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_19,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_39,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_38,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_37,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_36,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_44,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb
,b18,b19,b20,b21,b22,b23,b24,b25,b26,b27,b28,b29,b30,b31,b32,b33,b34,b35,b36,b37,b38,b39,b40,b41,b42,b43,b44,b45,b46,b47
,b48,b49,b50,b51,b52,b53,b54,b55,b56,b57,b58,b59,b60,b61,b62,b63,b64,b65,b66,b67,b68,b69,b70,b71,b72,b73,b74,b75,b76,b77
,b78,b79,b80,b81,b82,b83,b84,b85,b86,b87,b88,b89,b90,b91,b92,b93,b94,b95,b96,b97,b98,b99,b100,b101,b102,b103,b104,b105,b106,b107
,b108,b109,b110,b111,b112,b113,b114,b115,b116,b117,b118,b119,b120,b121,b122,b123,b124];
var FUNCTION_TABLE_vii = [b126,__ZN4mbed8CallbackIFvvEE13function_moveIPS1_EEvPvPKv,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event,b127];
var FUNCTION_TABLE_viiii = [b129,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi];
var FUNCTION_TABLE_viiiii = [b131,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib];
var FUNCTION_TABLE_viiiiii = [b133,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib];

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
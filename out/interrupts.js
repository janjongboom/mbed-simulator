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
var debug_table_vi = ["0", "__ZN4mbed11InterruptInD2Ev", "__ZN4mbed11InterruptInD0Ev", "__ZN4mbed7TimeoutD2Ev", "__ZN4mbed7TimeoutD0Ev", "__ZN4mbed7Timeout7handlerEv", "__ZN4mbed10TimerEventD2Ev", "__ZN4mbed10TimerEventD0Ev", "_mbed_trace_default_print", "_us_ticker_set_interrupt", "__ZN4mbed10TimerEvent3irqEj", "__ZN4mbed6TickerD2Ev", "__ZN4mbed6TickerD0Ev", "__ZN4mbed6Ticker7handlerEv", "__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv", "__ZN4mbed8CallbackIFvvEE13function_dtorIPS1_EEvPv", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "__ZN10__cxxabiv121__vmi_class_type_infoD0Ev", "__ZN4mbed11InterruptInD2Ev__async_cb", "__ZN4mbed11InterruptInD2Ev__async_cb_63", "__ZN4mbed11InterruptInD0Ev__async_cb", "__ZN4mbed11InterruptInD0Ev__async_cb_75", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_14", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_28", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_29", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_30", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_31", "__ZN4mbed7TimeoutD2Ev__async_cb", "__ZN4mbed7TimeoutD2Ev__async_cb_58", "__ZN4mbed7TimeoutD0Ev__async_cb", "__ZN4mbed7TimeoutD0Ev__async_cb_85", "__ZN4mbed7Timeout7handlerEv__async_cb_83", "__ZN4mbed7Timeout7handlerEv__async_cb", "__ZN4mbed10TimerEventD2Ev__async_cb", "__ZN4mbed10TimerEventC2Ev__async_cb", "__ZN4mbed10TimerEvent3irqEj__async_cb", "_mbed_trace_default_print__async_cb", "_mbed_tracef__async_cb", "_mbed_vtracef__async_cb", "_mbed_vtracef__async_cb_25", "_mbed_vtracef__async_cb_15", "_mbed_vtracef__async_cb_16", "_mbed_vtracef__async_cb_17", "_mbed_vtracef__async_cb_24", "_mbed_vtracef__async_cb_18", "_mbed_vtracef__async_cb_23", "_mbed_vtracef__async_cb_19", "_mbed_vtracef__async_cb_20", "_mbed_vtracef__async_cb_21", "_mbed_vtracef__async_cb_22", "_ticker_set_handler__async_cb", "_initialize__async_cb", "_initialize__async_cb_77", "_initialize__async_cb_82", "_initialize__async_cb_81", "_initialize__async_cb_78", "_initialize__async_cb_79", "_initialize__async_cb_80", "_schedule_interrupt__async_cb", "_schedule_interrupt__async_cb_64", "_schedule_interrupt__async_cb_65", "_schedule_interrupt__async_cb_66", "_schedule_interrupt__async_cb_67", "_schedule_interrupt__async_cb_68", "_schedule_interrupt__async_cb_69", "_ticker_remove_event__async_cb", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_46", "_mbed_die__async_cb_45", "_mbed_die__async_cb_44", "_mbed_die__async_cb_43", "_mbed_die__async_cb_42", "_mbed_die__async_cb_41", "_mbed_die__async_cb_40", "_mbed_die__async_cb_39", "_mbed_die__async_cb_38", "_mbed_die__async_cb_37", "_mbed_die__async_cb_36", "_mbed_die__async_cb_35", "_mbed_die__async_cb_34", "_mbed_die__async_cb_33", "_mbed_die__async_cb_32", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_vfprintf__async_cb", "_mbed_error_vfprintf__async_cb_54", "_mbed_error_vfprintf__async_cb_53", "_handle_interrupt_in__async_cb", "_serial_putc__async_cb_57", "_serial_putc__async_cb", "__ZN4mbed6TickerD2Ev__async_cb", "__ZN4mbed6TickerD2Ev__async_cb_49", "__ZN4mbed6TickerD0Ev__async_cb", "__ZN4mbed6TickerD0Ev__async_cb_26", "__ZN4mbed6Ticker7handlerEv__async_cb", "_invoke_ticker__async_cb_55", "_invoke_ticker__async_cb", "__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv__async_cb", "_wait_ms__async_cb", "__GLOBAL__sub_I_main_cpp__async_cb_47", "__GLOBAL__sub_I_main_cpp__async_cb", "__Z10blink_led1v__async_cb", "__Z11toggle_led2v__async_cb", "__Z12turn_led3_onv__async_cb", "_main__async_cb_9", "_main__async_cb_8", "_main__async_cb_7", "_main__async_cb_11", "_main__async_cb", "_main__async_cb_10", "_main__async_cb_5", "_main__async_cb_12", "_main__async_cb_6", "_main__async_cb_13", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_70", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_71", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_72", "_putc__async_cb_56", "_putc__async_cb", "___overflow__async_cb", "_fflush__async_cb_2", "_fflush__async_cb_1", "_fflush__async_cb_3", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_84", "_vfprintf__async_cb", "_snprintf__async_cb", "_vsnprintf__async_cb", "_fputc__async_cb_4", "_fputc__async_cb", "_puts__async_cb", "__ZL25default_terminate_handlerv__async_cb", "__ZL25default_terminate_handlerv__async_cb_51", "_abort_message__async_cb", "_abort_message__async_cb_52", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_27", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_50", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_74", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv", "__ZSt11__terminatePFvvE__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_48", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_62", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_61", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_60", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_59", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_76", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
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
 sp = STACKTOP; //@line 3616
 STACKTOP = STACKTOP + 16 | 0; //@line 3617
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3617
 $1 = sp; //@line 3618
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 3625
   $7 = $6 >>> 3; //@line 3626
   $8 = HEAP32[1484] | 0; //@line 3627
   $9 = $8 >>> $7; //@line 3628
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 3634
    $16 = 5976 + ($14 << 1 << 2) | 0; //@line 3636
    $17 = $16 + 8 | 0; //@line 3637
    $18 = HEAP32[$17 >> 2] | 0; //@line 3638
    $19 = $18 + 8 | 0; //@line 3639
    $20 = HEAP32[$19 >> 2] | 0; //@line 3640
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1484] = $8 & ~(1 << $14); //@line 3647
     } else {
      if ((HEAP32[1488] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 3652
      }
      $27 = $20 + 12 | 0; //@line 3655
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 3659
       HEAP32[$17 >> 2] = $20; //@line 3660
       break;
      } else {
       _abort(); //@line 3663
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 3668
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 3671
    $34 = $18 + $30 + 4 | 0; //@line 3673
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 3676
    $$0 = $19; //@line 3677
    STACKTOP = sp; //@line 3678
    return $$0 | 0; //@line 3678
   }
   $37 = HEAP32[1486] | 0; //@line 3680
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 3686
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 3689
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 3692
     $49 = $47 >>> 12 & 16; //@line 3694
     $50 = $47 >>> $49; //@line 3695
     $52 = $50 >>> 5 & 8; //@line 3697
     $54 = $50 >>> $52; //@line 3699
     $56 = $54 >>> 2 & 4; //@line 3701
     $58 = $54 >>> $56; //@line 3703
     $60 = $58 >>> 1 & 2; //@line 3705
     $62 = $58 >>> $60; //@line 3707
     $64 = $62 >>> 1 & 1; //@line 3709
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 3712
     $69 = 5976 + ($67 << 1 << 2) | 0; //@line 3714
     $70 = $69 + 8 | 0; //@line 3715
     $71 = HEAP32[$70 >> 2] | 0; //@line 3716
     $72 = $71 + 8 | 0; //@line 3717
     $73 = HEAP32[$72 >> 2] | 0; //@line 3718
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 3724
       HEAP32[1484] = $77; //@line 3725
       $98 = $77; //@line 3726
      } else {
       if ((HEAP32[1488] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 3731
       }
       $80 = $73 + 12 | 0; //@line 3734
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 3738
        HEAP32[$70 >> 2] = $73; //@line 3739
        $98 = $8; //@line 3740
        break;
       } else {
        _abort(); //@line 3743
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 3748
     $84 = $83 - $6 | 0; //@line 3749
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 3752
     $87 = $71 + $6 | 0; //@line 3753
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 3756
     HEAP32[$71 + $83 >> 2] = $84; //@line 3758
     if ($37 | 0) {
      $92 = HEAP32[1489] | 0; //@line 3761
      $93 = $37 >>> 3; //@line 3762
      $95 = 5976 + ($93 << 1 << 2) | 0; //@line 3764
      $96 = 1 << $93; //@line 3765
      if (!($98 & $96)) {
       HEAP32[1484] = $98 | $96; //@line 3770
       $$0199 = $95; //@line 3772
       $$pre$phiZ2D = $95 + 8 | 0; //@line 3772
      } else {
       $101 = $95 + 8 | 0; //@line 3774
       $102 = HEAP32[$101 >> 2] | 0; //@line 3775
       if ((HEAP32[1488] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 3779
       } else {
        $$0199 = $102; //@line 3782
        $$pre$phiZ2D = $101; //@line 3782
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 3785
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 3787
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 3789
      HEAP32[$92 + 12 >> 2] = $95; //@line 3791
     }
     HEAP32[1486] = $84; //@line 3793
     HEAP32[1489] = $87; //@line 3794
     $$0 = $72; //@line 3795
     STACKTOP = sp; //@line 3796
     return $$0 | 0; //@line 3796
    }
    $108 = HEAP32[1485] | 0; //@line 3798
    if (!$108) {
     $$0197 = $6; //@line 3801
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 3805
     $114 = $112 >>> 12 & 16; //@line 3807
     $115 = $112 >>> $114; //@line 3808
     $117 = $115 >>> 5 & 8; //@line 3810
     $119 = $115 >>> $117; //@line 3812
     $121 = $119 >>> 2 & 4; //@line 3814
     $123 = $119 >>> $121; //@line 3816
     $125 = $123 >>> 1 & 2; //@line 3818
     $127 = $123 >>> $125; //@line 3820
     $129 = $127 >>> 1 & 1; //@line 3822
     $134 = HEAP32[6240 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 3827
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 3831
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 3837
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 3840
      $$0193$lcssa$i = $138; //@line 3840
     } else {
      $$01926$i = $134; //@line 3842
      $$01935$i = $138; //@line 3842
      $146 = $143; //@line 3842
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 3847
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 3848
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 3849
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 3850
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 3856
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 3859
        $$0193$lcssa$i = $$$0193$i; //@line 3859
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 3862
        $$01935$i = $$$0193$i; //@line 3862
       }
      }
     }
     $157 = HEAP32[1488] | 0; //@line 3866
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 3869
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 3872
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 3875
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 3879
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 3881
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 3885
       $176 = HEAP32[$175 >> 2] | 0; //@line 3886
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 3889
        $179 = HEAP32[$178 >> 2] | 0; //@line 3890
        if (!$179) {
         $$3$i = 0; //@line 3893
         break;
        } else {
         $$1196$i = $179; //@line 3896
         $$1198$i = $178; //@line 3896
        }
       } else {
        $$1196$i = $176; //@line 3899
        $$1198$i = $175; //@line 3899
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 3902
        $182 = HEAP32[$181 >> 2] | 0; //@line 3903
        if ($182 | 0) {
         $$1196$i = $182; //@line 3906
         $$1198$i = $181; //@line 3906
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 3909
        $185 = HEAP32[$184 >> 2] | 0; //@line 3910
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 3915
         $$1198$i = $184; //@line 3915
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 3920
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 3923
        $$3$i = $$1196$i; //@line 3924
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 3929
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 3932
       }
       $169 = $167 + 12 | 0; //@line 3935
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 3939
       }
       $172 = $164 + 8 | 0; //@line 3942
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 3946
        HEAP32[$172 >> 2] = $167; //@line 3947
        $$3$i = $164; //@line 3948
        break;
       } else {
        _abort(); //@line 3951
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 3960
       $191 = 6240 + ($190 << 2) | 0; //@line 3961
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 3966
         if (!$$3$i) {
          HEAP32[1485] = $108 & ~(1 << $190); //@line 3972
          break L73;
         }
        } else {
         if ((HEAP32[1488] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 3979
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 3987
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1488] | 0; //@line 3997
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 4000
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 4004
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 4006
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 4012
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 4016
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 4018
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 4024
       if ($214 | 0) {
        if ((HEAP32[1488] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 4030
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 4034
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 4036
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 4044
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 4047
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 4049
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 4052
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 4056
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 4059
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 4061
      if ($37 | 0) {
       $234 = HEAP32[1489] | 0; //@line 4064
       $235 = $37 >>> 3; //@line 4065
       $237 = 5976 + ($235 << 1 << 2) | 0; //@line 4067
       $238 = 1 << $235; //@line 4068
       if (!($8 & $238)) {
        HEAP32[1484] = $8 | $238; //@line 4073
        $$0189$i = $237; //@line 4075
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 4075
       } else {
        $242 = $237 + 8 | 0; //@line 4077
        $243 = HEAP32[$242 >> 2] | 0; //@line 4078
        if ((HEAP32[1488] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 4082
        } else {
         $$0189$i = $243; //@line 4085
         $$pre$phi$iZ2D = $242; //@line 4085
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 4088
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 4090
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 4092
       HEAP32[$234 + 12 >> 2] = $237; //@line 4094
      }
      HEAP32[1486] = $$0193$lcssa$i; //@line 4096
      HEAP32[1489] = $159; //@line 4097
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 4100
     STACKTOP = sp; //@line 4101
     return $$0 | 0; //@line 4101
    }
   } else {
    $$0197 = $6; //@line 4104
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 4109
   } else {
    $251 = $0 + 11 | 0; //@line 4111
    $252 = $251 & -8; //@line 4112
    $253 = HEAP32[1485] | 0; //@line 4113
    if (!$253) {
     $$0197 = $252; //@line 4116
    } else {
     $255 = 0 - $252 | 0; //@line 4118
     $256 = $251 >>> 8; //@line 4119
     if (!$256) {
      $$0358$i = 0; //@line 4122
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 4126
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 4130
       $262 = $256 << $261; //@line 4131
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 4134
       $267 = $262 << $265; //@line 4136
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 4139
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 4144
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 4150
      }
     }
     $282 = HEAP32[6240 + ($$0358$i << 2) >> 2] | 0; //@line 4154
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 4158
       $$3$i203 = 0; //@line 4158
       $$3350$i = $255; //@line 4158
       label = 81; //@line 4159
      } else {
       $$0342$i = 0; //@line 4166
       $$0347$i = $255; //@line 4166
       $$0353$i = $282; //@line 4166
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 4166
       $$0362$i = 0; //@line 4166
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 4171
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 4176
          $$435113$i = 0; //@line 4176
          $$435712$i = $$0353$i; //@line 4176
          label = 85; //@line 4177
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 4180
          $$1348$i = $292; //@line 4180
         }
        } else {
         $$1343$i = $$0342$i; //@line 4183
         $$1348$i = $$0347$i; //@line 4183
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 4186
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 4189
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 4193
        $302 = ($$0353$i | 0) == 0; //@line 4194
        if ($302) {
         $$2355$i = $$1363$i; //@line 4199
         $$3$i203 = $$1343$i; //@line 4199
         $$3350$i = $$1348$i; //@line 4199
         label = 81; //@line 4200
         break;
        } else {
         $$0342$i = $$1343$i; //@line 4203
         $$0347$i = $$1348$i; //@line 4203
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 4203
         $$0362$i = $$1363$i; //@line 4203
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 4213
       $309 = $253 & ($306 | 0 - $306); //@line 4216
       if (!$309) {
        $$0197 = $252; //@line 4219
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 4224
       $315 = $313 >>> 12 & 16; //@line 4226
       $316 = $313 >>> $315; //@line 4227
       $318 = $316 >>> 5 & 8; //@line 4229
       $320 = $316 >>> $318; //@line 4231
       $322 = $320 >>> 2 & 4; //@line 4233
       $324 = $320 >>> $322; //@line 4235
       $326 = $324 >>> 1 & 2; //@line 4237
       $328 = $324 >>> $326; //@line 4239
       $330 = $328 >>> 1 & 1; //@line 4241
       $$4$ph$i = 0; //@line 4247
       $$4357$ph$i = HEAP32[6240 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 4247
      } else {
       $$4$ph$i = $$3$i203; //@line 4249
       $$4357$ph$i = $$2355$i; //@line 4249
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 4253
       $$4351$lcssa$i = $$3350$i; //@line 4253
      } else {
       $$414$i = $$4$ph$i; //@line 4255
       $$435113$i = $$3350$i; //@line 4255
       $$435712$i = $$4357$ph$i; //@line 4255
       label = 85; //@line 4256
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 4261
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 4265
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 4266
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 4267
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 4268
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4274
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 4277
        $$4351$lcssa$i = $$$4351$i; //@line 4277
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 4280
        $$435113$i = $$$4351$i; //@line 4280
        label = 85; //@line 4281
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 4287
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1486] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1488] | 0; //@line 4293
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 4296
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 4299
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 4302
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 4306
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 4308
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 4312
         $371 = HEAP32[$370 >> 2] | 0; //@line 4313
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 4316
          $374 = HEAP32[$373 >> 2] | 0; //@line 4317
          if (!$374) {
           $$3372$i = 0; //@line 4320
           break;
          } else {
           $$1370$i = $374; //@line 4323
           $$1374$i = $373; //@line 4323
          }
         } else {
          $$1370$i = $371; //@line 4326
          $$1374$i = $370; //@line 4326
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 4329
          $377 = HEAP32[$376 >> 2] | 0; //@line 4330
          if ($377 | 0) {
           $$1370$i = $377; //@line 4333
           $$1374$i = $376; //@line 4333
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 4336
          $380 = HEAP32[$379 >> 2] | 0; //@line 4337
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 4342
           $$1374$i = $379; //@line 4342
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 4347
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 4350
          $$3372$i = $$1370$i; //@line 4351
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 4356
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 4359
         }
         $364 = $362 + 12 | 0; //@line 4362
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 4366
         }
         $367 = $359 + 8 | 0; //@line 4369
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 4373
          HEAP32[$367 >> 2] = $362; //@line 4374
          $$3372$i = $359; //@line 4375
          break;
         } else {
          _abort(); //@line 4378
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 4386
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 4389
         $386 = 6240 + ($385 << 2) | 0; //@line 4390
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 4395
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 4400
            HEAP32[1485] = $391; //@line 4401
            $475 = $391; //@line 4402
            break L164;
           }
          } else {
           if ((HEAP32[1488] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 4409
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 4417
            if (!$$3372$i) {
             $475 = $253; //@line 4420
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1488] | 0; //@line 4428
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 4431
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 4435
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 4437
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 4443
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 4447
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 4449
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 4455
         if (!$409) {
          $475 = $253; //@line 4458
         } else {
          if ((HEAP32[1488] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 4463
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 4467
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 4469
           $475 = $253; //@line 4470
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 4479
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 4482
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 4484
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 4487
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 4491
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 4494
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 4496
         $428 = $$4351$lcssa$i >>> 3; //@line 4497
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 5976 + ($428 << 1 << 2) | 0; //@line 4501
          $432 = HEAP32[1484] | 0; //@line 4502
          $433 = 1 << $428; //@line 4503
          if (!($432 & $433)) {
           HEAP32[1484] = $432 | $433; //@line 4508
           $$0368$i = $431; //@line 4510
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 4510
          } else {
           $437 = $431 + 8 | 0; //@line 4512
           $438 = HEAP32[$437 >> 2] | 0; //@line 4513
           if ((HEAP32[1488] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 4517
           } else {
            $$0368$i = $438; //@line 4520
            $$pre$phi$i211Z2D = $437; //@line 4520
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 4523
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 4525
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 4527
          HEAP32[$354 + 12 >> 2] = $431; //@line 4529
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 4532
         if (!$444) {
          $$0361$i = 0; //@line 4535
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 4539
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 4543
           $450 = $444 << $449; //@line 4544
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 4547
           $455 = $450 << $453; //@line 4549
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 4552
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 4557
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 4563
          }
         }
         $469 = 6240 + ($$0361$i << 2) | 0; //@line 4566
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 4568
         $471 = $354 + 16 | 0; //@line 4569
         HEAP32[$471 + 4 >> 2] = 0; //@line 4571
         HEAP32[$471 >> 2] = 0; //@line 4572
         $473 = 1 << $$0361$i; //@line 4573
         if (!($475 & $473)) {
          HEAP32[1485] = $475 | $473; //@line 4578
          HEAP32[$469 >> 2] = $354; //@line 4579
          HEAP32[$354 + 24 >> 2] = $469; //@line 4581
          HEAP32[$354 + 12 >> 2] = $354; //@line 4583
          HEAP32[$354 + 8 >> 2] = $354; //@line 4585
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 4594
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 4594
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 4601
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 4605
          $494 = HEAP32[$492 >> 2] | 0; //@line 4607
          if (!$494) {
           label = 136; //@line 4610
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 4613
           $$0345$i = $494; //@line 4613
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1488] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 4620
          } else {
           HEAP32[$492 >> 2] = $354; //@line 4623
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 4625
           HEAP32[$354 + 12 >> 2] = $354; //@line 4627
           HEAP32[$354 + 8 >> 2] = $354; //@line 4629
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 4634
          $502 = HEAP32[$501 >> 2] | 0; //@line 4635
          $503 = HEAP32[1488] | 0; //@line 4636
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 4642
           HEAP32[$501 >> 2] = $354; //@line 4643
           HEAP32[$354 + 8 >> 2] = $502; //@line 4645
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 4647
           HEAP32[$354 + 24 >> 2] = 0; //@line 4649
           break;
          } else {
           _abort(); //@line 4652
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 4659
       STACKTOP = sp; //@line 4660
       return $$0 | 0; //@line 4660
      } else {
       $$0197 = $252; //@line 4662
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1486] | 0; //@line 4669
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 4672
  $515 = HEAP32[1489] | 0; //@line 4673
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 4676
   HEAP32[1489] = $517; //@line 4677
   HEAP32[1486] = $514; //@line 4678
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 4681
   HEAP32[$515 + $512 >> 2] = $514; //@line 4683
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 4686
  } else {
   HEAP32[1486] = 0; //@line 4688
   HEAP32[1489] = 0; //@line 4689
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 4692
   $526 = $515 + $512 + 4 | 0; //@line 4694
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 4697
  }
  $$0 = $515 + 8 | 0; //@line 4700
  STACKTOP = sp; //@line 4701
  return $$0 | 0; //@line 4701
 }
 $530 = HEAP32[1487] | 0; //@line 4703
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 4706
  HEAP32[1487] = $532; //@line 4707
  $533 = HEAP32[1490] | 0; //@line 4708
  $534 = $533 + $$0197 | 0; //@line 4709
  HEAP32[1490] = $534; //@line 4710
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 4713
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 4716
  $$0 = $533 + 8 | 0; //@line 4718
  STACKTOP = sp; //@line 4719
  return $$0 | 0; //@line 4719
 }
 if (!(HEAP32[1602] | 0)) {
  HEAP32[1604] = 4096; //@line 4724
  HEAP32[1603] = 4096; //@line 4725
  HEAP32[1605] = -1; //@line 4726
  HEAP32[1606] = -1; //@line 4727
  HEAP32[1607] = 0; //@line 4728
  HEAP32[1595] = 0; //@line 4729
  HEAP32[1602] = $1 & -16 ^ 1431655768; //@line 4733
  $548 = 4096; //@line 4734
 } else {
  $548 = HEAP32[1604] | 0; //@line 4737
 }
 $545 = $$0197 + 48 | 0; //@line 4739
 $546 = $$0197 + 47 | 0; //@line 4740
 $547 = $548 + $546 | 0; //@line 4741
 $549 = 0 - $548 | 0; //@line 4742
 $550 = $547 & $549; //@line 4743
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 4746
  STACKTOP = sp; //@line 4747
  return $$0 | 0; //@line 4747
 }
 $552 = HEAP32[1594] | 0; //@line 4749
 if ($552 | 0) {
  $554 = HEAP32[1592] | 0; //@line 4752
  $555 = $554 + $550 | 0; //@line 4753
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 4758
   STACKTOP = sp; //@line 4759
   return $$0 | 0; //@line 4759
  }
 }
 L244 : do {
  if (!(HEAP32[1595] & 4)) {
   $561 = HEAP32[1490] | 0; //@line 4767
   L246 : do {
    if (!$561) {
     label = 163; //@line 4771
    } else {
     $$0$i$i = 6384; //@line 4773
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 4775
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 4778
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 4787
      if (!$570) {
       label = 163; //@line 4790
       break L246;
      } else {
       $$0$i$i = $570; //@line 4793
      }
     }
     $595 = $547 - $530 & $549; //@line 4797
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 4800
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 4808
       } else {
        $$723947$i = $595; //@line 4810
        $$748$i = $597; //@line 4810
        label = 180; //@line 4811
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 4815
       $$2253$ph$i = $595; //@line 4815
       label = 171; //@line 4816
      }
     } else {
      $$2234243136$i = 0; //@line 4819
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 4825
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 4828
     } else {
      $574 = $572; //@line 4830
      $575 = HEAP32[1603] | 0; //@line 4831
      $576 = $575 + -1 | 0; //@line 4832
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 4840
      $584 = HEAP32[1592] | 0; //@line 4841
      $585 = $$$i + $584 | 0; //@line 4842
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1594] | 0; //@line 4847
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 4854
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 4858
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 4861
        $$748$i = $572; //@line 4861
        label = 180; //@line 4862
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 4865
        $$2253$ph$i = $$$i; //@line 4865
        label = 171; //@line 4866
       }
      } else {
       $$2234243136$i = 0; //@line 4869
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 4876
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 4885
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 4888
       $$748$i = $$2247$ph$i; //@line 4888
       label = 180; //@line 4889
       break L244;
      }
     }
     $607 = HEAP32[1604] | 0; //@line 4893
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 4897
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 4900
      $$748$i = $$2247$ph$i; //@line 4900
      label = 180; //@line 4901
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 4907
      $$2234243136$i = 0; //@line 4908
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 4912
      $$748$i = $$2247$ph$i; //@line 4912
      label = 180; //@line 4913
      break L244;
     }
    }
   } while (0);
   HEAP32[1595] = HEAP32[1595] | 4; //@line 4920
   $$4236$i = $$2234243136$i; //@line 4921
   label = 178; //@line 4922
  } else {
   $$4236$i = 0; //@line 4924
   label = 178; //@line 4925
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 4931
   $621 = _sbrk(0) | 0; //@line 4932
   $627 = $621 - $620 | 0; //@line 4940
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 4942
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 4950
    $$748$i = $620; //@line 4950
    label = 180; //@line 4951
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1592] | 0) + $$723947$i | 0; //@line 4957
  HEAP32[1592] = $633; //@line 4958
  if ($633 >>> 0 > (HEAP32[1593] | 0) >>> 0) {
   HEAP32[1593] = $633; //@line 4962
  }
  $636 = HEAP32[1490] | 0; //@line 4964
  do {
   if (!$636) {
    $638 = HEAP32[1488] | 0; //@line 4968
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1488] = $$748$i; //@line 4973
    }
    HEAP32[1596] = $$748$i; //@line 4975
    HEAP32[1597] = $$723947$i; //@line 4976
    HEAP32[1599] = 0; //@line 4977
    HEAP32[1493] = HEAP32[1602]; //@line 4979
    HEAP32[1492] = -1; //@line 4980
    HEAP32[1497] = 5976; //@line 4981
    HEAP32[1496] = 5976; //@line 4982
    HEAP32[1499] = 5984; //@line 4983
    HEAP32[1498] = 5984; //@line 4984
    HEAP32[1501] = 5992; //@line 4985
    HEAP32[1500] = 5992; //@line 4986
    HEAP32[1503] = 6e3; //@line 4987
    HEAP32[1502] = 6e3; //@line 4988
    HEAP32[1505] = 6008; //@line 4989
    HEAP32[1504] = 6008; //@line 4990
    HEAP32[1507] = 6016; //@line 4991
    HEAP32[1506] = 6016; //@line 4992
    HEAP32[1509] = 6024; //@line 4993
    HEAP32[1508] = 6024; //@line 4994
    HEAP32[1511] = 6032; //@line 4995
    HEAP32[1510] = 6032; //@line 4996
    HEAP32[1513] = 6040; //@line 4997
    HEAP32[1512] = 6040; //@line 4998
    HEAP32[1515] = 6048; //@line 4999
    HEAP32[1514] = 6048; //@line 5000
    HEAP32[1517] = 6056; //@line 5001
    HEAP32[1516] = 6056; //@line 5002
    HEAP32[1519] = 6064; //@line 5003
    HEAP32[1518] = 6064; //@line 5004
    HEAP32[1521] = 6072; //@line 5005
    HEAP32[1520] = 6072; //@line 5006
    HEAP32[1523] = 6080; //@line 5007
    HEAP32[1522] = 6080; //@line 5008
    HEAP32[1525] = 6088; //@line 5009
    HEAP32[1524] = 6088; //@line 5010
    HEAP32[1527] = 6096; //@line 5011
    HEAP32[1526] = 6096; //@line 5012
    HEAP32[1529] = 6104; //@line 5013
    HEAP32[1528] = 6104; //@line 5014
    HEAP32[1531] = 6112; //@line 5015
    HEAP32[1530] = 6112; //@line 5016
    HEAP32[1533] = 6120; //@line 5017
    HEAP32[1532] = 6120; //@line 5018
    HEAP32[1535] = 6128; //@line 5019
    HEAP32[1534] = 6128; //@line 5020
    HEAP32[1537] = 6136; //@line 5021
    HEAP32[1536] = 6136; //@line 5022
    HEAP32[1539] = 6144; //@line 5023
    HEAP32[1538] = 6144; //@line 5024
    HEAP32[1541] = 6152; //@line 5025
    HEAP32[1540] = 6152; //@line 5026
    HEAP32[1543] = 6160; //@line 5027
    HEAP32[1542] = 6160; //@line 5028
    HEAP32[1545] = 6168; //@line 5029
    HEAP32[1544] = 6168; //@line 5030
    HEAP32[1547] = 6176; //@line 5031
    HEAP32[1546] = 6176; //@line 5032
    HEAP32[1549] = 6184; //@line 5033
    HEAP32[1548] = 6184; //@line 5034
    HEAP32[1551] = 6192; //@line 5035
    HEAP32[1550] = 6192; //@line 5036
    HEAP32[1553] = 6200; //@line 5037
    HEAP32[1552] = 6200; //@line 5038
    HEAP32[1555] = 6208; //@line 5039
    HEAP32[1554] = 6208; //@line 5040
    HEAP32[1557] = 6216; //@line 5041
    HEAP32[1556] = 6216; //@line 5042
    HEAP32[1559] = 6224; //@line 5043
    HEAP32[1558] = 6224; //@line 5044
    $642 = $$723947$i + -40 | 0; //@line 5045
    $644 = $$748$i + 8 | 0; //@line 5047
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 5052
    $650 = $$748$i + $649 | 0; //@line 5053
    $651 = $642 - $649 | 0; //@line 5054
    HEAP32[1490] = $650; //@line 5055
    HEAP32[1487] = $651; //@line 5056
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 5059
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 5062
    HEAP32[1491] = HEAP32[1606]; //@line 5064
   } else {
    $$024367$i = 6384; //@line 5066
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 5068
     $658 = $$024367$i + 4 | 0; //@line 5069
     $659 = HEAP32[$658 >> 2] | 0; //@line 5070
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 5074
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 5078
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 5083
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 5097
       $673 = (HEAP32[1487] | 0) + $$723947$i | 0; //@line 5099
       $675 = $636 + 8 | 0; //@line 5101
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 5106
       $681 = $636 + $680 | 0; //@line 5107
       $682 = $673 - $680 | 0; //@line 5108
       HEAP32[1490] = $681; //@line 5109
       HEAP32[1487] = $682; //@line 5110
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 5113
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 5116
       HEAP32[1491] = HEAP32[1606]; //@line 5118
       break;
      }
     }
    }
    $688 = HEAP32[1488] | 0; //@line 5123
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1488] = $$748$i; //@line 5126
     $753 = $$748$i; //@line 5127
    } else {
     $753 = $688; //@line 5129
    }
    $690 = $$748$i + $$723947$i | 0; //@line 5131
    $$124466$i = 6384; //@line 5132
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 5137
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 5141
     if (!$694) {
      $$0$i$i$i = 6384; //@line 5144
      break;
     } else {
      $$124466$i = $694; //@line 5147
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 5156
      $700 = $$124466$i + 4 | 0; //@line 5157
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 5160
      $704 = $$748$i + 8 | 0; //@line 5162
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 5168
      $712 = $690 + 8 | 0; //@line 5170
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 5176
      $722 = $710 + $$0197 | 0; //@line 5180
      $723 = $718 - $710 - $$0197 | 0; //@line 5181
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 5184
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1487] | 0) + $723 | 0; //@line 5189
        HEAP32[1487] = $728; //@line 5190
        HEAP32[1490] = $722; //@line 5191
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 5194
       } else {
        if ((HEAP32[1489] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1486] | 0) + $723 | 0; //@line 5200
         HEAP32[1486] = $734; //@line 5201
         HEAP32[1489] = $722; //@line 5202
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 5205
         HEAP32[$722 + $734 >> 2] = $734; //@line 5207
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 5211
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 5215
         $743 = $739 >>> 3; //@line 5216
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 5221
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 5223
           $750 = 5976 + ($743 << 1 << 2) | 0; //@line 5225
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 5231
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 5240
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1484] = HEAP32[1484] & ~(1 << $743); //@line 5250
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 5257
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 5261
             }
             $764 = $748 + 8 | 0; //@line 5264
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 5268
              break;
             }
             _abort(); //@line 5271
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 5276
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 5277
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 5280
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 5282
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 5286
             $783 = $782 + 4 | 0; //@line 5287
             $784 = HEAP32[$783 >> 2] | 0; //@line 5288
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 5291
              if (!$786) {
               $$3$i$i = 0; //@line 5294
               break;
              } else {
               $$1291$i$i = $786; //@line 5297
               $$1293$i$i = $782; //@line 5297
              }
             } else {
              $$1291$i$i = $784; //@line 5300
              $$1293$i$i = $783; //@line 5300
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 5303
              $789 = HEAP32[$788 >> 2] | 0; //@line 5304
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 5307
               $$1293$i$i = $788; //@line 5307
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 5310
              $792 = HEAP32[$791 >> 2] | 0; //@line 5311
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 5316
               $$1293$i$i = $791; //@line 5316
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 5321
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 5324
              $$3$i$i = $$1291$i$i; //@line 5325
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 5330
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 5333
             }
             $776 = $774 + 12 | 0; //@line 5336
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 5340
             }
             $779 = $771 + 8 | 0; //@line 5343
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 5347
              HEAP32[$779 >> 2] = $774; //@line 5348
              $$3$i$i = $771; //@line 5349
              break;
             } else {
              _abort(); //@line 5352
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 5362
           $798 = 6240 + ($797 << 2) | 0; //@line 5363
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 5368
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1485] = HEAP32[1485] & ~(1 << $797); //@line 5377
             break L311;
            } else {
             if ((HEAP32[1488] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 5383
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 5391
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1488] | 0; //@line 5401
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 5404
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 5408
           $815 = $718 + 16 | 0; //@line 5409
           $816 = HEAP32[$815 >> 2] | 0; //@line 5410
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 5416
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 5420
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 5422
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 5428
           if (!$822) {
            break;
           }
           if ((HEAP32[1488] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 5436
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 5440
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 5442
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 5449
         $$0287$i$i = $742 + $723 | 0; //@line 5449
        } else {
         $$0$i17$i = $718; //@line 5451
         $$0287$i$i = $723; //@line 5451
        }
        $830 = $$0$i17$i + 4 | 0; //@line 5453
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 5456
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 5459
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 5461
        $836 = $$0287$i$i >>> 3; //@line 5462
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 5976 + ($836 << 1 << 2) | 0; //@line 5466
         $840 = HEAP32[1484] | 0; //@line 5467
         $841 = 1 << $836; //@line 5468
         do {
          if (!($840 & $841)) {
           HEAP32[1484] = $840 | $841; //@line 5474
           $$0295$i$i = $839; //@line 5476
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 5476
          } else {
           $845 = $839 + 8 | 0; //@line 5478
           $846 = HEAP32[$845 >> 2] | 0; //@line 5479
           if ((HEAP32[1488] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 5483
            $$pre$phi$i19$iZ2D = $845; //@line 5483
            break;
           }
           _abort(); //@line 5486
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 5490
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 5492
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 5494
         HEAP32[$722 + 12 >> 2] = $839; //@line 5496
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 5499
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 5503
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 5507
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 5512
          $858 = $852 << $857; //@line 5513
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 5516
          $863 = $858 << $861; //@line 5518
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 5521
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 5526
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 5532
         }
        } while (0);
        $877 = 6240 + ($$0296$i$i << 2) | 0; //@line 5535
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 5537
        $879 = $722 + 16 | 0; //@line 5538
        HEAP32[$879 + 4 >> 2] = 0; //@line 5540
        HEAP32[$879 >> 2] = 0; //@line 5541
        $881 = HEAP32[1485] | 0; //@line 5542
        $882 = 1 << $$0296$i$i; //@line 5543
        if (!($881 & $882)) {
         HEAP32[1485] = $881 | $882; //@line 5548
         HEAP32[$877 >> 2] = $722; //@line 5549
         HEAP32[$722 + 24 >> 2] = $877; //@line 5551
         HEAP32[$722 + 12 >> 2] = $722; //@line 5553
         HEAP32[$722 + 8 >> 2] = $722; //@line 5555
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 5564
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 5564
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 5571
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 5575
         $902 = HEAP32[$900 >> 2] | 0; //@line 5577
         if (!$902) {
          label = 260; //@line 5580
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 5583
          $$0289$i$i = $902; //@line 5583
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1488] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 5590
         } else {
          HEAP32[$900 >> 2] = $722; //@line 5593
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 5595
          HEAP32[$722 + 12 >> 2] = $722; //@line 5597
          HEAP32[$722 + 8 >> 2] = $722; //@line 5599
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 5604
         $910 = HEAP32[$909 >> 2] | 0; //@line 5605
         $911 = HEAP32[1488] | 0; //@line 5606
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 5612
          HEAP32[$909 >> 2] = $722; //@line 5613
          HEAP32[$722 + 8 >> 2] = $910; //@line 5615
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 5617
          HEAP32[$722 + 24 >> 2] = 0; //@line 5619
          break;
         } else {
          _abort(); //@line 5622
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 5629
      STACKTOP = sp; //@line 5630
      return $$0 | 0; //@line 5630
     } else {
      $$0$i$i$i = 6384; //@line 5632
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 5636
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 5641
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 5649
    }
    $927 = $923 + -47 | 0; //@line 5651
    $929 = $927 + 8 | 0; //@line 5653
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 5659
    $936 = $636 + 16 | 0; //@line 5660
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 5662
    $939 = $938 + 8 | 0; //@line 5663
    $940 = $938 + 24 | 0; //@line 5664
    $941 = $$723947$i + -40 | 0; //@line 5665
    $943 = $$748$i + 8 | 0; //@line 5667
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 5672
    $949 = $$748$i + $948 | 0; //@line 5673
    $950 = $941 - $948 | 0; //@line 5674
    HEAP32[1490] = $949; //@line 5675
    HEAP32[1487] = $950; //@line 5676
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 5679
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 5682
    HEAP32[1491] = HEAP32[1606]; //@line 5684
    $956 = $938 + 4 | 0; //@line 5685
    HEAP32[$956 >> 2] = 27; //@line 5686
    HEAP32[$939 >> 2] = HEAP32[1596]; //@line 5687
    HEAP32[$939 + 4 >> 2] = HEAP32[1597]; //@line 5687
    HEAP32[$939 + 8 >> 2] = HEAP32[1598]; //@line 5687
    HEAP32[$939 + 12 >> 2] = HEAP32[1599]; //@line 5687
    HEAP32[1596] = $$748$i; //@line 5688
    HEAP32[1597] = $$723947$i; //@line 5689
    HEAP32[1599] = 0; //@line 5690
    HEAP32[1598] = $939; //@line 5691
    $958 = $940; //@line 5692
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 5694
     HEAP32[$958 >> 2] = 7; //@line 5695
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 5708
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 5711
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 5714
     HEAP32[$938 >> 2] = $964; //@line 5715
     $969 = $964 >>> 3; //@line 5716
     if ($964 >>> 0 < 256) {
      $972 = 5976 + ($969 << 1 << 2) | 0; //@line 5720
      $973 = HEAP32[1484] | 0; //@line 5721
      $974 = 1 << $969; //@line 5722
      if (!($973 & $974)) {
       HEAP32[1484] = $973 | $974; //@line 5727
       $$0211$i$i = $972; //@line 5729
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 5729
      } else {
       $978 = $972 + 8 | 0; //@line 5731
       $979 = HEAP32[$978 >> 2] | 0; //@line 5732
       if ((HEAP32[1488] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 5736
       } else {
        $$0211$i$i = $979; //@line 5739
        $$pre$phi$i$iZ2D = $978; //@line 5739
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 5742
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 5744
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 5746
      HEAP32[$636 + 12 >> 2] = $972; //@line 5748
      break;
     }
     $985 = $964 >>> 8; //@line 5751
     if (!$985) {
      $$0212$i$i = 0; //@line 5754
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 5758
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 5762
       $991 = $985 << $990; //@line 5763
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 5766
       $996 = $991 << $994; //@line 5768
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 5771
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 5776
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 5782
      }
     }
     $1010 = 6240 + ($$0212$i$i << 2) | 0; //@line 5785
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 5787
     HEAP32[$636 + 20 >> 2] = 0; //@line 5789
     HEAP32[$936 >> 2] = 0; //@line 5790
     $1013 = HEAP32[1485] | 0; //@line 5791
     $1014 = 1 << $$0212$i$i; //@line 5792
     if (!($1013 & $1014)) {
      HEAP32[1485] = $1013 | $1014; //@line 5797
      HEAP32[$1010 >> 2] = $636; //@line 5798
      HEAP32[$636 + 24 >> 2] = $1010; //@line 5800
      HEAP32[$636 + 12 >> 2] = $636; //@line 5802
      HEAP32[$636 + 8 >> 2] = $636; //@line 5804
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 5813
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 5813
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 5820
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 5824
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 5826
      if (!$1034) {
       label = 286; //@line 5829
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 5832
       $$0207$i$i = $1034; //@line 5832
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1488] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 5839
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 5842
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 5844
       HEAP32[$636 + 12 >> 2] = $636; //@line 5846
       HEAP32[$636 + 8 >> 2] = $636; //@line 5848
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 5853
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 5854
      $1043 = HEAP32[1488] | 0; //@line 5855
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 5861
       HEAP32[$1041 >> 2] = $636; //@line 5862
       HEAP32[$636 + 8 >> 2] = $1042; //@line 5864
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 5866
       HEAP32[$636 + 24 >> 2] = 0; //@line 5868
       break;
      } else {
       _abort(); //@line 5871
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1487] | 0; //@line 5878
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 5881
   HEAP32[1487] = $1054; //@line 5882
   $1055 = HEAP32[1490] | 0; //@line 5883
   $1056 = $1055 + $$0197 | 0; //@line 5884
   HEAP32[1490] = $1056; //@line 5885
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 5888
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 5891
   $$0 = $1055 + 8 | 0; //@line 5893
   STACKTOP = sp; //@line 5894
   return $$0 | 0; //@line 5894
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 5898
 $$0 = 0; //@line 5899
 STACKTOP = sp; //@line 5900
 return $$0 | 0; //@line 5900
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9622
 STACKTOP = STACKTOP + 560 | 0; //@line 9623
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 9623
 $6 = sp + 8 | 0; //@line 9624
 $7 = sp; //@line 9625
 $8 = sp + 524 | 0; //@line 9626
 $9 = $8; //@line 9627
 $10 = sp + 512 | 0; //@line 9628
 HEAP32[$7 >> 2] = 0; //@line 9629
 $11 = $10 + 12 | 0; //@line 9630
 ___DOUBLE_BITS_677($1) | 0; //@line 9631
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 9636
  $$0520 = 1; //@line 9636
  $$0521 = 3128; //@line 9636
 } else {
  $$0471 = $1; //@line 9647
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 9647
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 3129 : 3134 : 3131; //@line 9647
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 9649
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 9658
   $31 = $$0520 + 3 | 0; //@line 9663
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 9665
   _out_670($0, $$0521, $$0520); //@line 9666
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 3155 : 3159 : $27 ? 3147 : 3151, 3); //@line 9667
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 9669
   $$sink560 = $31; //@line 9670
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 9673
   $36 = $35 != 0.0; //@line 9674
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 9678
   }
   $39 = $5 | 32; //@line 9680
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 9683
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 9686
    $44 = $$0520 | 2; //@line 9687
    $46 = 12 - $3 | 0; //@line 9689
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 9694
     } else {
      $$0509585 = 8.0; //@line 9696
      $$1508586 = $46; //@line 9696
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 9698
       $$0509585 = $$0509585 * 16.0; //@line 9699
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 9714
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 9719
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 9724
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 9727
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 9730
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 9733
     HEAP8[$68 >> 0] = 48; //@line 9734
     $$0511 = $68; //@line 9735
    } else {
     $$0511 = $66; //@line 9737
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 9744
    $76 = $$0511 + -2 | 0; //@line 9747
    HEAP8[$76 >> 0] = $5 + 15; //@line 9748
    $77 = ($3 | 0) < 1; //@line 9749
    $79 = ($4 & 8 | 0) == 0; //@line 9751
    $$0523 = $8; //@line 9752
    $$2473 = $$1472; //@line 9752
    while (1) {
     $80 = ~~$$2473; //@line 9754
     $86 = $$0523 + 1 | 0; //@line 9760
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[3163 + $80 >> 0]; //@line 9761
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 9764
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 9773
      } else {
       HEAP8[$86 >> 0] = 46; //@line 9776
       $$1524 = $$0523 + 2 | 0; //@line 9777
      }
     } else {
      $$1524 = $86; //@line 9780
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 9784
     }
    }
    $$pre693 = $$1524; //@line 9790
    if (!$3) {
     label = 24; //@line 9792
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 9800
      $$sink = $3 + 2 | 0; //@line 9800
     } else {
      label = 24; //@line 9802
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 9806
     $$pre$phi691Z2D = $101; //@line 9807
     $$sink = $101; //@line 9807
    }
    $104 = $11 - $76 | 0; //@line 9811
    $106 = $104 + $44 + $$sink | 0; //@line 9813
    _pad_676($0, 32, $2, $106, $4); //@line 9814
    _out_670($0, $$0521$, $44); //@line 9815
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 9817
    _out_670($0, $8, $$pre$phi691Z2D); //@line 9818
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 9820
    _out_670($0, $76, $104); //@line 9821
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 9823
    $$sink560 = $106; //@line 9824
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 9828
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 9832
    HEAP32[$7 >> 2] = $113; //@line 9833
    $$3 = $35 * 268435456.0; //@line 9834
    $$pr = $113; //@line 9834
   } else {
    $$3 = $35; //@line 9837
    $$pr = HEAP32[$7 >> 2] | 0; //@line 9837
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 9841
   $$0498 = $$561; //@line 9842
   $$4 = $$3; //@line 9842
   do {
    $116 = ~~$$4 >>> 0; //@line 9844
    HEAP32[$$0498 >> 2] = $116; //@line 9845
    $$0498 = $$0498 + 4 | 0; //@line 9846
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 9849
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 9859
    $$1499662 = $$0498; //@line 9859
    $124 = $$pr; //@line 9859
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 9862
     $$0488655 = $$1499662 + -4 | 0; //@line 9863
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 9866
     } else {
      $$0488657 = $$0488655; //@line 9868
      $$0497656 = 0; //@line 9868
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 9871
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 9873
       $131 = tempRet0; //@line 9874
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 9875
       HEAP32[$$0488657 >> 2] = $132; //@line 9877
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 9878
       $$0488657 = $$0488657 + -4 | 0; //@line 9880
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 9890
      } else {
       $138 = $$1482663 + -4 | 0; //@line 9892
       HEAP32[$138 >> 2] = $$0497656; //@line 9893
       $$2483$ph = $138; //@line 9894
      }
     }
     $$2500 = $$1499662; //@line 9897
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 9903
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 9907
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 9913
     HEAP32[$7 >> 2] = $144; //@line 9914
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 9917
      $$1499662 = $$2500; //@line 9917
      $124 = $144; //@line 9917
     } else {
      $$1482$lcssa = $$2483$ph; //@line 9919
      $$1499$lcssa = $$2500; //@line 9919
      $$pr566 = $144; //@line 9919
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 9924
    $$1499$lcssa = $$0498; //@line 9924
    $$pr566 = $$pr; //@line 9924
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 9930
    $150 = ($39 | 0) == 102; //@line 9931
    $$3484650 = $$1482$lcssa; //@line 9932
    $$3501649 = $$1499$lcssa; //@line 9932
    $152 = $$pr566; //@line 9932
    while (1) {
     $151 = 0 - $152 | 0; //@line 9934
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 9936
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 9940
      $161 = 1e9 >>> $154; //@line 9941
      $$0487644 = 0; //@line 9942
      $$1489643 = $$3484650; //@line 9942
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 9944
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 9948
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 9949
       $$1489643 = $$1489643 + 4 | 0; //@line 9950
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 9961
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 9964
       $$4502 = $$3501649; //@line 9964
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 9967
       $$$3484700 = $$$3484; //@line 9968
       $$4502 = $$3501649 + 4 | 0; //@line 9968
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 9975
      $$4502 = $$3501649; //@line 9975
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 9977
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 9984
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 9986
     HEAP32[$7 >> 2] = $152; //@line 9987
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 9992
      $$3501$lcssa = $$$4502; //@line 9992
      break;
     } else {
      $$3484650 = $$$3484700; //@line 9990
      $$3501649 = $$$4502; //@line 9990
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 9997
    $$3501$lcssa = $$1499$lcssa; //@line 9997
   }
   $185 = $$561; //@line 10000
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 10005
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 10006
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 10009
    } else {
     $$0514639 = $189; //@line 10011
     $$0530638 = 10; //@line 10011
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 10013
      $193 = $$0514639 + 1 | 0; //@line 10014
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 10017
       break;
      } else {
       $$0514639 = $193; //@line 10020
      }
     }
    }
   } else {
    $$1515 = 0; //@line 10025
   }
   $198 = ($39 | 0) == 103; //@line 10030
   $199 = ($$540 | 0) != 0; //@line 10031
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 10034
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 10043
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 10046
    $213 = ($209 | 0) % 9 | 0; //@line 10047
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 10050
     $$1531632 = 10; //@line 10050
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 10053
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 10056
       $$1531632 = $215; //@line 10056
      } else {
       $$1531$lcssa = $215; //@line 10058
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 10063
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 10065
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 10066
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 10069
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 10072
     $$4518 = $$1515; //@line 10072
     $$8 = $$3484$lcssa; //@line 10072
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 10077
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 10078
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 10083
     if (!$$0520) {
      $$1467 = $$$564; //@line 10086
      $$1469 = $$543; //@line 10086
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 10089
      $$1467 = $230 ? -$$$564 : $$$564; //@line 10094
      $$1469 = $230 ? -$$543 : $$543; //@line 10094
     }
     $233 = $217 - $218 | 0; //@line 10096
     HEAP32[$212 >> 2] = $233; //@line 10097
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 10101
      HEAP32[$212 >> 2] = $236; //@line 10102
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 10105
       $$sink547625 = $212; //@line 10105
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 10107
        HEAP32[$$sink547625 >> 2] = 0; //@line 10108
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 10111
         HEAP32[$240 >> 2] = 0; //@line 10112
         $$6 = $240; //@line 10113
        } else {
         $$6 = $$5486626; //@line 10115
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 10118
        HEAP32[$238 >> 2] = $242; //@line 10119
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 10122
         $$sink547625 = $238; //@line 10122
        } else {
         $$5486$lcssa = $$6; //@line 10124
         $$sink547$lcssa = $238; //@line 10124
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 10129
       $$sink547$lcssa = $212; //@line 10129
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 10134
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 10135
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 10138
       $$4518 = $247; //@line 10138
       $$8 = $$5486$lcssa; //@line 10138
      } else {
       $$2516621 = $247; //@line 10140
       $$2532620 = 10; //@line 10140
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 10142
        $251 = $$2516621 + 1 | 0; //@line 10143
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 10146
         $$4518 = $251; //@line 10146
         $$8 = $$5486$lcssa; //@line 10146
         break;
        } else {
         $$2516621 = $251; //@line 10149
        }
       }
      }
     } else {
      $$4492 = $212; //@line 10154
      $$4518 = $$1515; //@line 10154
      $$8 = $$3484$lcssa; //@line 10154
     }
    }
    $253 = $$4492 + 4 | 0; //@line 10157
    $$5519$ph = $$4518; //@line 10160
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 10160
    $$9$ph = $$8; //@line 10160
   } else {
    $$5519$ph = $$1515; //@line 10162
    $$7505$ph = $$3501$lcssa; //@line 10162
    $$9$ph = $$3484$lcssa; //@line 10162
   }
   $$7505 = $$7505$ph; //@line 10164
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 10168
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 10171
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 10175
    } else {
     $$lcssa675 = 1; //@line 10177
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 10181
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 10186
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 10194
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 10194
     } else {
      $$0479 = $5 + -2 | 0; //@line 10198
      $$2476 = $$540$ + -1 | 0; //@line 10198
     }
     $267 = $4 & 8; //@line 10200
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 10205
       if (!$270) {
        $$2529 = 9; //@line 10208
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 10213
         $$3533616 = 10; //@line 10213
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 10215
          $275 = $$1528617 + 1 | 0; //@line 10216
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 10222
           break;
          } else {
           $$1528617 = $275; //@line 10220
          }
         }
        } else {
         $$2529 = 0; //@line 10227
        }
       }
      } else {
       $$2529 = 9; //@line 10231
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 10239
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 10241
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 10243
       $$1480 = $$0479; //@line 10246
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 10246
       $$pre$phi698Z2D = 0; //@line 10246
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 10250
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 10252
       $$1480 = $$0479; //@line 10255
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 10255
       $$pre$phi698Z2D = 0; //@line 10255
       break;
      }
     } else {
      $$1480 = $$0479; //@line 10259
      $$3477 = $$2476; //@line 10259
      $$pre$phi698Z2D = $267; //@line 10259
     }
    } else {
     $$1480 = $5; //@line 10263
     $$3477 = $$540; //@line 10263
     $$pre$phi698Z2D = $4 & 8; //@line 10263
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 10266
   $294 = ($292 | 0) != 0 & 1; //@line 10268
   $296 = ($$1480 | 32 | 0) == 102; //@line 10270
   if ($296) {
    $$2513 = 0; //@line 10274
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 10274
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 10277
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 10280
    $304 = $11; //@line 10281
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 10286
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 10288
      HEAP8[$308 >> 0] = 48; //@line 10289
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 10294
      } else {
       $$1512$lcssa = $308; //@line 10296
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 10301
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 10308
    $318 = $$1512$lcssa + -2 | 0; //@line 10310
    HEAP8[$318 >> 0] = $$1480; //@line 10311
    $$2513 = $318; //@line 10314
    $$pn = $304 - $318 | 0; //@line 10314
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 10319
   _pad_676($0, 32, $2, $323, $4); //@line 10320
   _out_670($0, $$0521, $$0520); //@line 10321
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 10323
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 10326
    $326 = $8 + 9 | 0; //@line 10327
    $327 = $326; //@line 10328
    $328 = $8 + 8 | 0; //@line 10329
    $$5493600 = $$0496$$9; //@line 10330
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 10333
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 10338
       $$1465 = $328; //@line 10339
      } else {
       $$1465 = $330; //@line 10341
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 10348
       $$0464597 = $330; //@line 10349
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 10351
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 10354
        } else {
         $$1465 = $335; //@line 10356
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 10361
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 10366
     $$5493600 = $$5493600 + 4 | 0; //@line 10367
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 3179, 1); //@line 10377
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 10383
     $$6494592 = $$5493600; //@line 10383
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 10386
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 10391
       $$0463587 = $347; //@line 10392
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 10394
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 10397
        } else {
         $$0463$lcssa = $351; //@line 10399
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 10404
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 10408
      $$6494592 = $$6494592 + 4 | 0; //@line 10409
      $356 = $$4478593 + -9 | 0; //@line 10410
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 10417
       break;
      } else {
       $$4478593 = $356; //@line 10415
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 10422
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 10425
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 10428
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 10431
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 10432
     $365 = $363; //@line 10433
     $366 = 0 - $9 | 0; //@line 10434
     $367 = $8 + 8 | 0; //@line 10435
     $$5605 = $$3477; //@line 10436
     $$7495604 = $$9$ph; //@line 10436
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 10439
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 10442
       $$0 = $367; //@line 10443
      } else {
       $$0 = $369; //@line 10445
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 10450
        _out_670($0, $$0, 1); //@line 10451
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 10455
         break;
        }
        _out_670($0, 3179, 1); //@line 10458
        $$2 = $375; //@line 10459
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 10463
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 10468
        $$1601 = $$0; //@line 10469
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 10471
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 10474
         } else {
          $$2 = $373; //@line 10476
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 10483
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 10486
      $381 = $$5605 - $378 | 0; //@line 10487
      $$7495604 = $$7495604 + 4 | 0; //@line 10488
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 10495
       break;
      } else {
       $$5605 = $381; //@line 10493
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 10500
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 10503
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 10507
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 10510
   $$sink560 = $323; //@line 10511
  }
 } while (0);
 STACKTOP = sp; //@line 10516
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 10516
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 8194
 STACKTOP = STACKTOP + 64 | 0; //@line 8195
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 8195
 $5 = sp + 16 | 0; //@line 8196
 $6 = sp; //@line 8197
 $7 = sp + 24 | 0; //@line 8198
 $8 = sp + 8 | 0; //@line 8199
 $9 = sp + 20 | 0; //@line 8200
 HEAP32[$5 >> 2] = $1; //@line 8201
 $10 = ($0 | 0) != 0; //@line 8202
 $11 = $7 + 40 | 0; //@line 8203
 $12 = $11; //@line 8204
 $13 = $7 + 39 | 0; //@line 8205
 $14 = $8 + 4 | 0; //@line 8206
 $$0243 = 0; //@line 8207
 $$0247 = 0; //@line 8207
 $$0269 = 0; //@line 8207
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 8216
     $$1248 = -1; //@line 8217
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 8221
     break;
    }
   } else {
    $$1248 = $$0247; //@line 8225
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 8228
  $21 = HEAP8[$20 >> 0] | 0; //@line 8229
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 8232
   break;
  } else {
   $23 = $21; //@line 8235
   $25 = $20; //@line 8235
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 8240
     $27 = $25; //@line 8240
     label = 9; //@line 8241
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 8246
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 8253
   HEAP32[$5 >> 2] = $24; //@line 8254
   $23 = HEAP8[$24 >> 0] | 0; //@line 8256
   $25 = $24; //@line 8256
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 8261
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 8266
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 8269
     $27 = $27 + 2 | 0; //@line 8270
     HEAP32[$5 >> 2] = $27; //@line 8271
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 8278
      break;
     } else {
      $$0249303 = $30; //@line 8275
      label = 9; //@line 8276
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 8286
  if ($10) {
   _out_670($0, $20, $36); //@line 8288
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 8292
   $$0247 = $$1248; //@line 8292
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 8300
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 8301
  if ($43) {
   $$0253 = -1; //@line 8303
   $$1270 = $$0269; //@line 8303
   $$sink = 1; //@line 8303
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 8313
    $$1270 = 1; //@line 8313
    $$sink = 3; //@line 8313
   } else {
    $$0253 = -1; //@line 8315
    $$1270 = $$0269; //@line 8315
    $$sink = 1; //@line 8315
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 8318
  HEAP32[$5 >> 2] = $51; //@line 8319
  $52 = HEAP8[$51 >> 0] | 0; //@line 8320
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 8322
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 8329
   $$lcssa291 = $52; //@line 8329
   $$lcssa292 = $51; //@line 8329
  } else {
   $$0262309 = 0; //@line 8331
   $60 = $52; //@line 8331
   $65 = $51; //@line 8331
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 8336
    $64 = $65 + 1 | 0; //@line 8337
    HEAP32[$5 >> 2] = $64; //@line 8338
    $66 = HEAP8[$64 >> 0] | 0; //@line 8339
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 8341
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 8348
     $$lcssa291 = $66; //@line 8348
     $$lcssa292 = $64; //@line 8348
     break;
    } else {
     $$0262309 = $63; //@line 8351
     $60 = $66; //@line 8351
     $65 = $64; //@line 8351
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 8363
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 8365
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 8370
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 8375
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 8387
     $$2271 = 1; //@line 8387
     $storemerge274 = $79 + 3 | 0; //@line 8387
    } else {
     label = 23; //@line 8389
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 8393
    if ($$1270 | 0) {
     $$0 = -1; //@line 8396
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8411
     $106 = HEAP32[$105 >> 2] | 0; //@line 8412
     HEAP32[$2 >> 2] = $105 + 4; //@line 8414
     $363 = $106; //@line 8415
    } else {
     $363 = 0; //@line 8417
    }
    $$0259 = $363; //@line 8421
    $$2271 = 0; //@line 8421
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 8421
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 8423
   $109 = ($$0259 | 0) < 0; //@line 8424
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 8429
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 8429
   $$3272 = $$2271; //@line 8429
   $115 = $storemerge274; //@line 8429
  } else {
   $112 = _getint_671($5) | 0; //@line 8431
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 8434
    break;
   }
   $$1260 = $112; //@line 8438
   $$1263 = $$0262$lcssa; //@line 8438
   $$3272 = $$1270; //@line 8438
   $115 = HEAP32[$5 >> 2] | 0; //@line 8438
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 8449
     $156 = _getint_671($5) | 0; //@line 8450
     $$0254 = $156; //@line 8452
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 8452
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 8461
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 8466
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 8471
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 8478
      $144 = $125 + 4 | 0; //@line 8482
      HEAP32[$5 >> 2] = $144; //@line 8483
      $$0254 = $140; //@line 8484
      $$pre345 = $144; //@line 8484
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 8490
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8505
     $152 = HEAP32[$151 >> 2] | 0; //@line 8506
     HEAP32[$2 >> 2] = $151 + 4; //@line 8508
     $364 = $152; //@line 8509
    } else {
     $364 = 0; //@line 8511
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 8514
    HEAP32[$5 >> 2] = $154; //@line 8515
    $$0254 = $364; //@line 8516
    $$pre345 = $154; //@line 8516
   } else {
    $$0254 = -1; //@line 8518
    $$pre345 = $115; //@line 8518
   }
  } while (0);
  $$0252 = 0; //@line 8521
  $158 = $$pre345; //@line 8521
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 8528
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 8531
   HEAP32[$5 >> 2] = $158; //@line 8532
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (2647 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 8537
   $168 = $167 & 255; //@line 8538
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 8542
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 8549
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 8553
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 8557
     break L1;
    } else {
     label = 50; //@line 8560
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 8565
     $176 = $3 + ($$0253 << 3) | 0; //@line 8567
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 8572
     $182 = $6; //@line 8573
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 8575
     HEAP32[$182 + 4 >> 2] = $181; //@line 8578
     label = 50; //@line 8579
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 8583
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 8586
    $187 = HEAP32[$5 >> 2] | 0; //@line 8588
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 8592
   if ($10) {
    $187 = $158; //@line 8594
   } else {
    $$0243 = 0; //@line 8596
    $$0247 = $$1248; //@line 8596
    $$0269 = $$3272; //@line 8596
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 8602
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 8608
  $196 = $$1263 & -65537; //@line 8611
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 8612
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 8620
       $$0243 = 0; //@line 8621
       $$0247 = $$1248; //@line 8621
       $$0269 = $$3272; //@line 8621
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 8627
       $$0243 = 0; //@line 8628
       $$0247 = $$1248; //@line 8628
       $$0269 = $$3272; //@line 8628
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 8636
       HEAP32[$208 >> 2] = $$1248; //@line 8638
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 8641
       $$0243 = 0; //@line 8642
       $$0247 = $$1248; //@line 8642
       $$0269 = $$3272; //@line 8642
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 8649
       $$0243 = 0; //@line 8650
       $$0247 = $$1248; //@line 8650
       $$0269 = $$3272; //@line 8650
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 8657
       $$0243 = 0; //@line 8658
       $$0247 = $$1248; //@line 8658
       $$0269 = $$3272; //@line 8658
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 8664
       $$0243 = 0; //@line 8665
       $$0247 = $$1248; //@line 8665
       $$0269 = $$3272; //@line 8665
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 8673
       HEAP32[$220 >> 2] = $$1248; //@line 8675
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 8678
       $$0243 = 0; //@line 8679
       $$0247 = $$1248; //@line 8679
       $$0269 = $$3272; //@line 8679
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 8684
       $$0247 = $$1248; //@line 8684
       $$0269 = $$3272; //@line 8684
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 8694
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 8694
     $$3265 = $$1263$ | 8; //@line 8694
     label = 62; //@line 8695
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 8699
     $$1255 = $$0254; //@line 8699
     $$3265 = $$1263$; //@line 8699
     label = 62; //@line 8700
     break;
    }
   case 111:
    {
     $242 = $6; //@line 8704
     $244 = HEAP32[$242 >> 2] | 0; //@line 8706
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 8709
     $248 = _fmt_o($244, $247, $11) | 0; //@line 8710
     $252 = $12 - $248 | 0; //@line 8714
     $$0228 = $248; //@line 8719
     $$1233 = 0; //@line 8719
     $$1238 = 3111; //@line 8719
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 8719
     $$4266 = $$1263$; //@line 8719
     $281 = $244; //@line 8719
     $283 = $247; //@line 8719
     label = 68; //@line 8720
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 8724
     $258 = HEAP32[$256 >> 2] | 0; //@line 8726
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 8729
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 8732
      $264 = tempRet0; //@line 8733
      $265 = $6; //@line 8734
      HEAP32[$265 >> 2] = $263; //@line 8736
      HEAP32[$265 + 4 >> 2] = $264; //@line 8739
      $$0232 = 1; //@line 8740
      $$0237 = 3111; //@line 8740
      $275 = $263; //@line 8740
      $276 = $264; //@line 8740
      label = 67; //@line 8741
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 8753
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 3111 : 3113 : 3112; //@line 8753
      $275 = $258; //@line 8753
      $276 = $261; //@line 8753
      label = 67; //@line 8754
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 8760
     $$0232 = 0; //@line 8766
     $$0237 = 3111; //@line 8766
     $275 = HEAP32[$197 >> 2] | 0; //@line 8766
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 8766
     label = 67; //@line 8767
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 8778
     $$2 = $13; //@line 8779
     $$2234 = 0; //@line 8779
     $$2239 = 3111; //@line 8779
     $$2251 = $11; //@line 8779
     $$5 = 1; //@line 8779
     $$6268 = $196; //@line 8779
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 8786
     label = 72; //@line 8787
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 8791
     $$1 = $302 | 0 ? $302 : 3121; //@line 8794
     label = 72; //@line 8795
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 8805
     HEAP32[$14 >> 2] = 0; //@line 8806
     HEAP32[$6 >> 2] = $8; //@line 8807
     $$4258354 = -1; //@line 8808
     $365 = $8; //@line 8808
     label = 76; //@line 8809
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 8813
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 8816
      $$0240$lcssa356 = 0; //@line 8817
      label = 85; //@line 8818
     } else {
      $$4258354 = $$0254; //@line 8820
      $365 = $$pre348; //@line 8820
      label = 76; //@line 8821
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 8828
     $$0247 = $$1248; //@line 8828
     $$0269 = $$3272; //@line 8828
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 8833
     $$2234 = 0; //@line 8833
     $$2239 = 3111; //@line 8833
     $$2251 = $11; //@line 8833
     $$5 = $$0254; //@line 8833
     $$6268 = $$1263$; //@line 8833
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 8839
    $227 = $6; //@line 8840
    $229 = HEAP32[$227 >> 2] | 0; //@line 8842
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 8845
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 8847
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 8853
    $$0228 = $234; //@line 8858
    $$1233 = $or$cond278 ? 0 : 2; //@line 8858
    $$1238 = $or$cond278 ? 3111 : 3111 + ($$1236 >> 4) | 0; //@line 8858
    $$2256 = $$1255; //@line 8858
    $$4266 = $$3265; //@line 8858
    $281 = $229; //@line 8858
    $283 = $232; //@line 8858
    label = 68; //@line 8859
   } else if ((label | 0) == 67) {
    label = 0; //@line 8862
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 8864
    $$1233 = $$0232; //@line 8864
    $$1238 = $$0237; //@line 8864
    $$2256 = $$0254; //@line 8864
    $$4266 = $$1263$; //@line 8864
    $281 = $275; //@line 8864
    $283 = $276; //@line 8864
    label = 68; //@line 8865
   } else if ((label | 0) == 72) {
    label = 0; //@line 8868
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 8869
    $306 = ($305 | 0) == 0; //@line 8870
    $$2 = $$1; //@line 8877
    $$2234 = 0; //@line 8877
    $$2239 = 3111; //@line 8877
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 8877
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 8877
    $$6268 = $196; //@line 8877
   } else if ((label | 0) == 76) {
    label = 0; //@line 8880
    $$0229316 = $365; //@line 8881
    $$0240315 = 0; //@line 8881
    $$1244314 = 0; //@line 8881
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 8883
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 8886
      $$2245 = $$1244314; //@line 8886
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 8889
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 8895
      $$2245 = $320; //@line 8895
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 8899
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 8902
      $$0240315 = $325; //@line 8902
      $$1244314 = $320; //@line 8902
     } else {
      $$0240$lcssa = $325; //@line 8904
      $$2245 = $320; //@line 8904
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 8910
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 8913
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 8916
     label = 85; //@line 8917
    } else {
     $$1230327 = $365; //@line 8919
     $$1241326 = 0; //@line 8919
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 8921
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 8924
       label = 85; //@line 8925
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 8928
      $$1241326 = $331 + $$1241326 | 0; //@line 8929
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 8932
       label = 85; //@line 8933
       break L97;
      }
      _out_670($0, $9, $331); //@line 8937
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 8942
       label = 85; //@line 8943
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 8940
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 8951
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 8957
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 8959
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 8964
   $$2 = $or$cond ? $$0228 : $11; //@line 8969
   $$2234 = $$1233; //@line 8969
   $$2239 = $$1238; //@line 8969
   $$2251 = $11; //@line 8969
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 8969
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 8969
  } else if ((label | 0) == 85) {
   label = 0; //@line 8972
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 8974
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 8977
   $$0247 = $$1248; //@line 8977
   $$0269 = $$3272; //@line 8977
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 8982
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 8984
  $345 = $$$5 + $$2234 | 0; //@line 8985
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 8987
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 8988
  _out_670($0, $$2239, $$2234); //@line 8989
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 8991
  _pad_676($0, 48, $$$5, $343, 0); //@line 8992
  _out_670($0, $$2, $343); //@line 8993
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 8995
  $$0243 = $$2261; //@line 8996
  $$0247 = $$1248; //@line 8996
  $$0269 = $$3272; //@line 8996
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 9004
    } else {
     $$2242302 = 1; //@line 9006
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 9009
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 9012
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 9016
      $356 = $$2242302 + 1 | 0; //@line 9017
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 9020
      } else {
       $$2242$lcssa = $356; //@line 9022
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 9028
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 9034
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 9040
       } else {
        $$0 = 1; //@line 9042
        break;
       }
      }
     } else {
      $$0 = 1; //@line 9047
     }
    }
   } else {
    $$0 = $$1248; //@line 9051
   }
  }
 } while (0);
 STACKTOP = sp; //@line 9055
 return $$0 | 0; //@line 9055
}
function _mbed_vtracef($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$0199 = 0, $$1$off0 = 0, $$10 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$13 = 0, $$18 = 0, $$3 = 0, $$3147 = 0, $$3147168 = 0, $$3154 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$6 = 0, $$6150 = 0, $$9 = 0, $$lobit = 0, $$pre = 0, $$sink = 0, $125 = 0, $126 = 0, $151 = 0, $157 = 0, $168 = 0, $169 = 0, $171 = 0, $181 = 0, $182 = 0, $184 = 0, $186 = 0, $194 = 0, $201 = 0, $202 = 0, $204 = 0, $206 = 0, $209 = 0, $34 = 0, $38 = 0, $4 = 0, $43 = 0, $5 = 0, $54 = 0, $55 = 0, $59 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $69 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $76 = 0, $78 = 0, $82 = 0, $89 = 0, $95 = 0, $AsyncCtx = 0, $AsyncCtx27 = 0, $AsyncCtx30 = 0, $AsyncCtx34 = 0, $AsyncCtx38 = 0, $AsyncCtx42 = 0, $AsyncCtx45 = 0, $AsyncCtx49 = 0, $AsyncCtx52 = 0, $AsyncCtx56 = 0, $AsyncCtx60 = 0, $AsyncCtx64 = 0, $extract$t159 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer12 = 0, $vararg_buffer15 = 0, $vararg_buffer18 = 0, $vararg_buffer20 = 0, $vararg_buffer23 = 0, $vararg_buffer3 = 0, $vararg_buffer6 = 0, $vararg_buffer9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 751
 STACKTOP = STACKTOP + 96 | 0; //@line 752
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(96); //@line 752
 $vararg_buffer23 = sp + 72 | 0; //@line 753
 $vararg_buffer20 = sp + 64 | 0; //@line 754
 $vararg_buffer18 = sp + 56 | 0; //@line 755
 $vararg_buffer15 = sp + 48 | 0; //@line 756
 $vararg_buffer12 = sp + 40 | 0; //@line 757
 $vararg_buffer9 = sp + 32 | 0; //@line 758
 $vararg_buffer6 = sp + 24 | 0; //@line 759
 $vararg_buffer3 = sp + 16 | 0; //@line 760
 $vararg_buffer1 = sp + 8 | 0; //@line 761
 $vararg_buffer = sp; //@line 762
 $4 = sp + 80 | 0; //@line 763
 $5 = HEAP32[109] | 0; //@line 764
 do {
  if ($5 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(104, sp) | 0; //@line 768
   FUNCTION_TABLE_v[$5 & 15](); //@line 769
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 44; //@line 772
    HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 774
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 776
    HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer20; //@line 778
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer20; //@line 780
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer1; //@line 782
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer1; //@line 784
    HEAP32[$AsyncCtx + 28 >> 2] = $4; //@line 786
    HEAP32[$AsyncCtx + 32 >> 2] = $3; //@line 788
    HEAP32[$AsyncCtx + 36 >> 2] = $2; //@line 790
    HEAP32[$AsyncCtx + 40 >> 2] = $vararg_buffer3; //@line 792
    HEAP32[$AsyncCtx + 44 >> 2] = $vararg_buffer3; //@line 794
    HEAP32[$AsyncCtx + 48 >> 2] = $vararg_buffer9; //@line 796
    HEAP32[$AsyncCtx + 52 >> 2] = $1; //@line 798
    HEAP32[$AsyncCtx + 56 >> 2] = $vararg_buffer9; //@line 800
    HEAP32[$AsyncCtx + 60 >> 2] = $vararg_buffer6; //@line 802
    HEAP32[$AsyncCtx + 64 >> 2] = $vararg_buffer6; //@line 804
    HEAP32[$AsyncCtx + 68 >> 2] = $vararg_buffer18; //@line 806
    HEAP32[$AsyncCtx + 72 >> 2] = $vararg_buffer18; //@line 808
    HEAP32[$AsyncCtx + 76 >> 2] = $vararg_buffer12; //@line 810
    HEAP32[$AsyncCtx + 80 >> 2] = $vararg_buffer12; //@line 812
    HEAP8[$AsyncCtx + 84 >> 0] = $0; //@line 814
    HEAP32[$AsyncCtx + 88 >> 2] = $vararg_buffer15; //@line 816
    HEAP32[$AsyncCtx + 92 >> 2] = $vararg_buffer15; //@line 818
    HEAP32[$AsyncCtx + 96 >> 2] = $vararg_buffer23; //@line 820
    HEAP32[$AsyncCtx + 100 >> 2] = $vararg_buffer23; //@line 822
    sp = STACKTOP; //@line 823
    STACKTOP = sp; //@line 824
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 826
    HEAP32[111] = (HEAP32[111] | 0) + 1; //@line 829
    break;
   }
  }
 } while (0);
 $34 = HEAP32[100] | 0; //@line 834
 do {
  if ($34 | 0) {
   HEAP8[$34 >> 0] = 0; //@line 838
   do {
    if ($0 << 24 >> 24 > -1 & ($1 | 0) != 0) {
     $38 = HEAP32[97] | 0; //@line 844
     if (HEAP8[$38 >> 0] | 0) {
      if (_strstr($38, $1) | 0) {
       $$0$i = 1; //@line 851
       break;
      }
     }
     $43 = HEAP32[98] | 0; //@line 855
     if (!(HEAP8[$43 >> 0] | 0)) {
      label = 11; //@line 859
     } else {
      if (!(_strstr($43, $1) | 0)) {
       $$0$i = 1; //@line 864
      } else {
       label = 11; //@line 866
      }
     }
    } else {
     label = 11; //@line 870
    }
   } while (0);
   if ((label | 0) == 11) {
    $$0$i = 0; //@line 874
   }
   if (!((HEAP32[107] | 0) != 0 & ((($1 | 0) == 0 | (($2 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[104] = HEAP32[102]; //@line 886
    break;
   }
   $54 = HEAPU8[384] | 0; //@line 890
   $55 = $0 & 255; //@line 891
   if ($55 & 31 & $54 | 0) {
    $59 = $54 & 64; //@line 896
    $$lobit = $59 >>> 6; //@line 897
    $60 = $$lobit & 255; //@line 898
    $64 = ($54 & 32 | 0) == 0; //@line 902
    $65 = HEAP32[101] | 0; //@line 903
    $66 = HEAP32[100] | 0; //@line 904
    $67 = $0 << 24 >> 24 == 1; //@line 905
    do {
     if ($67 | ($54 & 128 | 0) != 0) {
      $AsyncCtx64 = _emscripten_alloc_async_context(8, sp) | 0; //@line 909
      _vsnprintf($66, $65, $2, $3) | 0; //@line 910
      if (___async) {
       HEAP32[$AsyncCtx64 >> 2] = 45; //@line 913
       HEAP8[$AsyncCtx64 + 4 >> 0] = $67 & 1; //@line 916
       sp = STACKTOP; //@line 917
       STACKTOP = sp; //@line 918
       return;
      }
      _emscripten_free_async_context($AsyncCtx64 | 0); //@line 920
      $69 = HEAP32[108] | 0; //@line 921
      if (!($67 & ($69 | 0) != 0)) {
       $73 = HEAP32[107] | 0; //@line 925
       $74 = HEAP32[100] | 0; //@line 926
       $AsyncCtx34 = _emscripten_alloc_async_context(4, sp) | 0; //@line 927
       FUNCTION_TABLE_vi[$73 & 255]($74); //@line 928
       if (___async) {
        HEAP32[$AsyncCtx34 >> 2] = 48; //@line 931
        sp = STACKTOP; //@line 932
        STACKTOP = sp; //@line 933
        return;
       } else {
        _emscripten_free_async_context($AsyncCtx34 | 0); //@line 935
        break;
       }
      }
      $71 = HEAP32[100] | 0; //@line 939
      $AsyncCtx27 = _emscripten_alloc_async_context(4, sp) | 0; //@line 940
      FUNCTION_TABLE_vi[$69 & 255]($71); //@line 941
      if (___async) {
       HEAP32[$AsyncCtx27 >> 2] = 46; //@line 944
       sp = STACKTOP; //@line 945
       STACKTOP = sp; //@line 946
       return;
      }
      _emscripten_free_async_context($AsyncCtx27 | 0); //@line 948
      $72 = HEAP32[108] | 0; //@line 949
      $AsyncCtx30 = _emscripten_alloc_async_context(4, sp) | 0; //@line 950
      FUNCTION_TABLE_vi[$72 & 255](1700); //@line 951
      if (___async) {
       HEAP32[$AsyncCtx30 >> 2] = 47; //@line 954
       sp = STACKTOP; //@line 955
       STACKTOP = sp; //@line 956
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx30 | 0); //@line 958
       break;
      }
     } else {
      if (!$59) {
       $$1$off0 = ($$lobit | 0) != 0; //@line 965
       $$1143 = $66; //@line 965
       $$1145 = $65; //@line 965
       $$3154 = 0; //@line 965
       label = 38; //@line 966
      } else {
       if ($64) {
        $$0142 = $66; //@line 969
        $$0144 = $65; //@line 969
       } else {
        $76 = _snprintf($66, $65, 1702, $vararg_buffer) | 0; //@line 971
        $$ = ($76 | 0) >= ($65 | 0) ? 0 : $76; //@line 973
        $78 = ($$ | 0) > 0; //@line 974
        $$0142 = $78 ? $66 + $$ | 0 : $66; //@line 979
        $$0144 = $65 - ($78 ? $$ : 0) | 0; //@line 979
       }
       if (($$0144 | 0) > 0) {
        $82 = $55 + -2 | 0; //@line 983
        switch ($82 >>> 1 | $82 << 31 | 0) {
        case 0:
         {
          $$sink = 1720; //@line 989
          label = 35; //@line 990
          break;
         }
        case 1:
         {
          $$sink = 1726; //@line 994
          label = 35; //@line 995
          break;
         }
        case 3:
         {
          $$sink = 1714; //@line 999
          label = 35; //@line 1000
          break;
         }
        case 7:
         {
          $$sink = 1708; //@line 1004
          label = 35; //@line 1005
          break;
         }
        default:
         {
          $$0141 = 0; //@line 1009
          $$1152 = 0; //@line 1009
         }
        }
        if ((label | 0) == 35) {
         HEAP32[$vararg_buffer1 >> 2] = $$sink; //@line 1013
         $$0141 = $60 & 1; //@line 1016
         $$1152 = _snprintf($$0142, $$0144, 1732, $vararg_buffer1) | 0; //@line 1016
        }
        $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 1019
        $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 1021
        if (($$1152$ | 0) > 0) {
         $89 = $$0141 << 24 >> 24 == 0; //@line 1023
         $$1$off0 = $extract$t159; //@line 1028
         $$1143 = $89 ? $$0142 : $$0142 + $$1152$ | 0; //@line 1028
         $$1145 = $$0144 - ($89 ? 0 : $$1152$) | 0; //@line 1028
         $$3154 = $$1152; //@line 1028
         label = 38; //@line 1029
        } else {
         $$1$off0 = $extract$t159; //@line 1031
         $$1143 = $$0142; //@line 1031
         $$1145 = $$0144; //@line 1031
         $$3154 = $$1152$; //@line 1031
         label = 38; //@line 1032
        }
       }
      }
      L54 : do {
       if ((label | 0) == 38) {
        do {
         if (($$1145 | 0) > 0 & (HEAP32[105] | 0) != 0) {
          HEAP32[$4 >> 2] = HEAP32[$3 >> 2]; //@line 1045
          $AsyncCtx60 = _emscripten_alloc_async_context(104, sp) | 0; //@line 1046
          $95 = _vsnprintf(0, 0, $2, $4) | 0; //@line 1047
          if (___async) {
           HEAP32[$AsyncCtx60 >> 2] = 49; //@line 1050
           HEAP32[$AsyncCtx60 + 4 >> 2] = $vararg_buffer20; //@line 1052
           HEAP32[$AsyncCtx60 + 8 >> 2] = $vararg_buffer20; //@line 1054
           HEAP8[$AsyncCtx60 + 12 >> 0] = $$1$off0 & 1; //@line 1057
           HEAP32[$AsyncCtx60 + 16 >> 2] = $vararg_buffer23; //@line 1059
           HEAP32[$AsyncCtx60 + 20 >> 2] = $vararg_buffer23; //@line 1061
           HEAP32[$AsyncCtx60 + 24 >> 2] = $vararg_buffer3; //@line 1063
           HEAP32[$AsyncCtx60 + 28 >> 2] = $$1143; //@line 1065
           HEAP32[$AsyncCtx60 + 32 >> 2] = $$1145; //@line 1067
           HEAP32[$AsyncCtx60 + 36 >> 2] = $vararg_buffer3; //@line 1069
           HEAP32[$AsyncCtx60 + 40 >> 2] = $4; //@line 1071
           HEAP32[$AsyncCtx60 + 44 >> 2] = $55; //@line 1073
           HEAP32[$AsyncCtx60 + 48 >> 2] = $vararg_buffer9; //@line 1075
           HEAP32[$AsyncCtx60 + 52 >> 2] = $1; //@line 1077
           HEAP32[$AsyncCtx60 + 56 >> 2] = $vararg_buffer9; //@line 1079
           HEAP32[$AsyncCtx60 + 60 >> 2] = $vararg_buffer6; //@line 1081
           HEAP32[$AsyncCtx60 + 64 >> 2] = $vararg_buffer6; //@line 1083
           HEAP32[$AsyncCtx60 + 68 >> 2] = $vararg_buffer18; //@line 1085
           HEAP32[$AsyncCtx60 + 72 >> 2] = $vararg_buffer18; //@line 1087
           HEAP32[$AsyncCtx60 + 76 >> 2] = $vararg_buffer12; //@line 1089
           HEAP32[$AsyncCtx60 + 80 >> 2] = $vararg_buffer12; //@line 1091
           HEAP32[$AsyncCtx60 + 84 >> 2] = $vararg_buffer15; //@line 1093
           HEAP32[$AsyncCtx60 + 88 >> 2] = $vararg_buffer15; //@line 1095
           HEAP32[$AsyncCtx60 + 92 >> 2] = $2; //@line 1097
           HEAP32[$AsyncCtx60 + 96 >> 2] = $3; //@line 1099
           HEAP32[$AsyncCtx60 + 100 >> 2] = $$3154; //@line 1101
           sp = STACKTOP; //@line 1102
           STACKTOP = sp; //@line 1103
           return;
          }
          _emscripten_free_async_context($AsyncCtx60 | 0); //@line 1105
          $125 = HEAP32[105] | 0; //@line 1110
          $AsyncCtx38 = _emscripten_alloc_async_context(100, sp) | 0; //@line 1111
          $126 = FUNCTION_TABLE_ii[$125 & 1](($$3154 | 0 ? 4 : 0) + $$3154 + $95 | 0) | 0; //@line 1112
          if (___async) {
           HEAP32[$AsyncCtx38 >> 2] = 50; //@line 1115
           HEAP32[$AsyncCtx38 + 4 >> 2] = $vararg_buffer20; //@line 1117
           HEAP32[$AsyncCtx38 + 8 >> 2] = $vararg_buffer20; //@line 1119
           HEAP32[$AsyncCtx38 + 12 >> 2] = $vararg_buffer3; //@line 1121
           HEAP32[$AsyncCtx38 + 16 >> 2] = $$1143; //@line 1123
           HEAP32[$AsyncCtx38 + 20 >> 2] = $$1145; //@line 1125
           HEAP32[$AsyncCtx38 + 24 >> 2] = $vararg_buffer3; //@line 1127
           HEAP32[$AsyncCtx38 + 28 >> 2] = $4; //@line 1129
           HEAP32[$AsyncCtx38 + 32 >> 2] = $55; //@line 1131
           HEAP32[$AsyncCtx38 + 36 >> 2] = $vararg_buffer9; //@line 1133
           HEAP32[$AsyncCtx38 + 40 >> 2] = $1; //@line 1135
           HEAP32[$AsyncCtx38 + 44 >> 2] = $vararg_buffer9; //@line 1137
           HEAP32[$AsyncCtx38 + 48 >> 2] = $vararg_buffer6; //@line 1139
           HEAP32[$AsyncCtx38 + 52 >> 2] = $vararg_buffer6; //@line 1141
           HEAP32[$AsyncCtx38 + 56 >> 2] = $vararg_buffer18; //@line 1143
           HEAP32[$AsyncCtx38 + 60 >> 2] = $vararg_buffer18; //@line 1145
           HEAP32[$AsyncCtx38 + 64 >> 2] = $vararg_buffer12; //@line 1147
           HEAP32[$AsyncCtx38 + 68 >> 2] = $vararg_buffer12; //@line 1149
           HEAP32[$AsyncCtx38 + 72 >> 2] = $vararg_buffer15; //@line 1151
           HEAP32[$AsyncCtx38 + 76 >> 2] = $vararg_buffer15; //@line 1153
           HEAP8[$AsyncCtx38 + 80 >> 0] = $$1$off0 & 1; //@line 1156
           HEAP32[$AsyncCtx38 + 84 >> 2] = $2; //@line 1158
           HEAP32[$AsyncCtx38 + 88 >> 2] = $3; //@line 1160
           HEAP32[$AsyncCtx38 + 92 >> 2] = $vararg_buffer23; //@line 1162
           HEAP32[$AsyncCtx38 + 96 >> 2] = $vararg_buffer23; //@line 1164
           sp = STACKTOP; //@line 1165
           STACKTOP = sp; //@line 1166
           return;
          } else {
           _emscripten_free_async_context($AsyncCtx38 | 0); //@line 1168
           HEAP32[$vararg_buffer3 >> 2] = $126; //@line 1169
           $151 = _snprintf($$1143, $$1145, 1732, $vararg_buffer3) | 0; //@line 1170
           $$10 = ($151 | 0) >= ($$1145 | 0) ? 0 : $151; //@line 1172
           if (($$10 | 0) > 0) {
            $$3 = $$1143 + $$10 | 0; //@line 1177
            $$3147 = $$1145 - $$10 | 0; //@line 1177
            label = 44; //@line 1178
            break;
           } else {
            $$3147168 = $$1145; //@line 1181
            $$3169 = $$1143; //@line 1181
            break;
           }
          }
         } else {
          $$3 = $$1143; //@line 1186
          $$3147 = $$1145; //@line 1186
          label = 44; //@line 1187
         }
        } while (0);
        if ((label | 0) == 44) {
         if (($$3147 | 0) > 0) {
          $$3147168 = $$3147; //@line 1193
          $$3169 = $$3; //@line 1193
         } else {
          break;
         }
        }
        $157 = $55 + -2 | 0; //@line 1198
        switch ($157 >>> 1 | $157 << 31 | 0) {
        case 0:
         {
          HEAP32[$vararg_buffer6 >> 2] = $1; //@line 1204
          $$5156 = _snprintf($$3169, $$3147168, 1735, $vararg_buffer6) | 0; //@line 1206
          break;
         }
        case 1:
         {
          HEAP32[$vararg_buffer9 >> 2] = $1; //@line 1210
          $$5156 = _snprintf($$3169, $$3147168, 1750, $vararg_buffer9) | 0; //@line 1212
          break;
         }
        case 3:
         {
          HEAP32[$vararg_buffer12 >> 2] = $1; //@line 1216
          $$5156 = _snprintf($$3169, $$3147168, 1765, $vararg_buffer12) | 0; //@line 1218
          break;
         }
        case 7:
         {
          HEAP32[$vararg_buffer15 >> 2] = $1; //@line 1222
          $$5156 = _snprintf($$3169, $$3147168, 1780, $vararg_buffer15) | 0; //@line 1224
          break;
         }
        default:
         {
          $$5156 = _snprintf($$3169, $$3147168, 1795, $vararg_buffer18) | 0; //@line 1229
         }
        }
        $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 1233
        $168 = $$3169 + $$5156$ | 0; //@line 1235
        $169 = $$3147168 - $$5156$ | 0; //@line 1236
        if (($$5156$ | 0) > 0 & ($169 | 0) > 0) {
         $AsyncCtx56 = _emscripten_alloc_async_context(32, sp) | 0; //@line 1240
         $171 = _vsnprintf($168, $169, $2, $3) | 0; //@line 1241
         if (___async) {
          HEAP32[$AsyncCtx56 >> 2] = 51; //@line 1244
          HEAP32[$AsyncCtx56 + 4 >> 2] = $vararg_buffer20; //@line 1246
          HEAP32[$AsyncCtx56 + 8 >> 2] = $vararg_buffer20; //@line 1248
          HEAP8[$AsyncCtx56 + 12 >> 0] = $$1$off0 & 1; //@line 1251
          HEAP32[$AsyncCtx56 + 16 >> 2] = $vararg_buffer23; //@line 1253
          HEAP32[$AsyncCtx56 + 20 >> 2] = $vararg_buffer23; //@line 1255
          HEAP32[$AsyncCtx56 + 24 >> 2] = $169; //@line 1257
          HEAP32[$AsyncCtx56 + 28 >> 2] = $168; //@line 1259
          sp = STACKTOP; //@line 1260
          STACKTOP = sp; //@line 1261
          return;
         }
         _emscripten_free_async_context($AsyncCtx56 | 0); //@line 1263
         $$13 = ($171 | 0) >= ($169 | 0) ? 0 : $171; //@line 1265
         $181 = $168 + $$13 | 0; //@line 1267
         $182 = $169 - $$13 | 0; //@line 1268
         if (($$13 | 0) > 0) {
          $184 = HEAP32[106] | 0; //@line 1271
          do {
           if (($182 | 0) > 0 & ($184 | 0) != 0) {
            $AsyncCtx42 = _emscripten_alloc_async_context(32, sp) | 0; //@line 1276
            $186 = FUNCTION_TABLE_i[$184 & 3]() | 0; //@line 1277
            if (___async) {
             HEAP32[$AsyncCtx42 >> 2] = 52; //@line 1280
             HEAP32[$AsyncCtx42 + 4 >> 2] = $vararg_buffer20; //@line 1282
             HEAP32[$AsyncCtx42 + 8 >> 2] = $181; //@line 1284
             HEAP32[$AsyncCtx42 + 12 >> 2] = $182; //@line 1286
             HEAP32[$AsyncCtx42 + 16 >> 2] = $vararg_buffer20; //@line 1288
             HEAP8[$AsyncCtx42 + 20 >> 0] = $$1$off0 & 1; //@line 1291
             HEAP32[$AsyncCtx42 + 24 >> 2] = $vararg_buffer23; //@line 1293
             HEAP32[$AsyncCtx42 + 28 >> 2] = $vararg_buffer23; //@line 1295
             sp = STACKTOP; //@line 1296
             STACKTOP = sp; //@line 1297
             return;
            } else {
             _emscripten_free_async_context($AsyncCtx42 | 0); //@line 1299
             HEAP32[$vararg_buffer20 >> 2] = $186; //@line 1300
             $194 = _snprintf($181, $182, 1732, $vararg_buffer20) | 0; //@line 1301
             $$18 = ($194 | 0) >= ($182 | 0) ? 0 : $194; //@line 1303
             if (($$18 | 0) > 0) {
              $$6 = $181 + $$18 | 0; //@line 1308
              $$6150 = $182 - $$18 | 0; //@line 1308
              $$9 = $$18; //@line 1308
              break;
             } else {
              break L54;
             }
            }
           } else {
            $$6 = $181; //@line 1315
            $$6150 = $182; //@line 1315
            $$9 = $$13; //@line 1315
           }
          } while (0);
          if (!(($$9 | 0) < 1 | ($$6150 | 0) < 1 | $$1$off0 ^ 1)) {
           _snprintf($$6, $$6150, 1810, $vararg_buffer23) | 0; //@line 1324
          }
         }
        }
       }
      } while (0);
      $201 = HEAP32[107] | 0; //@line 1330
      $202 = HEAP32[100] | 0; //@line 1331
      $AsyncCtx45 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1332
      FUNCTION_TABLE_vi[$201 & 255]($202); //@line 1333
      if (___async) {
       HEAP32[$AsyncCtx45 >> 2] = 53; //@line 1336
       sp = STACKTOP; //@line 1337
       STACKTOP = sp; //@line 1338
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx45 | 0); //@line 1340
       break;
      }
     }
    } while (0);
    HEAP32[104] = HEAP32[102]; //@line 1346
   }
  }
 } while (0);
 $204 = HEAP32[110] | 0; //@line 1350
 if (!$204) {
  STACKTOP = sp; //@line 1353
  return;
 }
 $206 = HEAP32[111] | 0; //@line 1355
 HEAP32[111] = 0; //@line 1356
 $AsyncCtx49 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1357
 FUNCTION_TABLE_v[$204 & 15](); //@line 1358
 if (___async) {
  HEAP32[$AsyncCtx49 >> 2] = 54; //@line 1361
  HEAP32[$AsyncCtx49 + 4 >> 2] = $206; //@line 1363
  sp = STACKTOP; //@line 1364
  STACKTOP = sp; //@line 1365
  return;
 }
 _emscripten_free_async_context($AsyncCtx49 | 0); //@line 1367
 if (($206 | 0) > 1) {
  $$0199 = $206; //@line 1370
 } else {
  STACKTOP = sp; //@line 1372
  return;
 }
 while (1) {
  $209 = $$0199 + -1 | 0; //@line 1375
  $$pre = HEAP32[110] | 0; //@line 1376
  $AsyncCtx52 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1377
  FUNCTION_TABLE_v[$$pre & 15](); //@line 1378
  if (___async) {
   label = 70; //@line 1381
   break;
  }
  _emscripten_free_async_context($AsyncCtx52 | 0); //@line 1384
  if (($$0199 | 0) > 2) {
   $$0199 = $209; //@line 1387
  } else {
   label = 72; //@line 1389
   break;
  }
 }
 if ((label | 0) == 70) {
  HEAP32[$AsyncCtx52 >> 2] = 55; //@line 1394
  HEAP32[$AsyncCtx52 + 4 >> 2] = $$0199; //@line 1396
  HEAP32[$AsyncCtx52 + 8 >> 2] = $209; //@line 1398
  sp = STACKTOP; //@line 1399
  STACKTOP = sp; //@line 1400
  return;
 } else if ((label | 0) == 72) {
  STACKTOP = sp; //@line 1403
  return;
 }
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 5927
 $3 = HEAP32[1488] | 0; //@line 5928
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 5931
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 5935
 $7 = $6 & 3; //@line 5936
 if (($7 | 0) == 1) {
  _abort(); //@line 5939
 }
 $9 = $6 & -8; //@line 5942
 $10 = $2 + $9 | 0; //@line 5943
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 5948
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 5954
   $17 = $13 + $9 | 0; //@line 5955
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 5958
   }
   if ((HEAP32[1489] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 5964
    $106 = HEAP32[$105 >> 2] | 0; //@line 5965
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 5969
     $$1382 = $17; //@line 5969
     $114 = $16; //@line 5969
     break;
    }
    HEAP32[1486] = $17; //@line 5972
    HEAP32[$105 >> 2] = $106 & -2; //@line 5974
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 5977
    HEAP32[$16 + $17 >> 2] = $17; //@line 5979
    return;
   }
   $21 = $13 >>> 3; //@line 5982
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 5986
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 5988
    $28 = 5976 + ($21 << 1 << 2) | 0; //@line 5990
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 5995
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 6002
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1484] = HEAP32[1484] & ~(1 << $21); //@line 6012
     $$1 = $16; //@line 6013
     $$1382 = $17; //@line 6013
     $114 = $16; //@line 6013
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 6019
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 6023
     }
     $41 = $26 + 8 | 0; //@line 6026
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 6030
     } else {
      _abort(); //@line 6032
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 6037
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 6038
    $$1 = $16; //@line 6039
    $$1382 = $17; //@line 6039
    $114 = $16; //@line 6039
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 6043
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 6045
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 6049
     $60 = $59 + 4 | 0; //@line 6050
     $61 = HEAP32[$60 >> 2] | 0; //@line 6051
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 6054
      if (!$63) {
       $$3 = 0; //@line 6057
       break;
      } else {
       $$1387 = $63; //@line 6060
       $$1390 = $59; //@line 6060
      }
     } else {
      $$1387 = $61; //@line 6063
      $$1390 = $60; //@line 6063
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 6066
      $66 = HEAP32[$65 >> 2] | 0; //@line 6067
      if ($66 | 0) {
       $$1387 = $66; //@line 6070
       $$1390 = $65; //@line 6070
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 6073
      $69 = HEAP32[$68 >> 2] | 0; //@line 6074
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 6079
       $$1390 = $68; //@line 6079
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 6084
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 6087
      $$3 = $$1387; //@line 6088
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 6093
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 6096
     }
     $53 = $51 + 12 | 0; //@line 6099
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 6103
     }
     $56 = $48 + 8 | 0; //@line 6106
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 6110
      HEAP32[$56 >> 2] = $51; //@line 6111
      $$3 = $48; //@line 6112
      break;
     } else {
      _abort(); //@line 6115
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 6122
    $$1382 = $17; //@line 6122
    $114 = $16; //@line 6122
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 6125
    $75 = 6240 + ($74 << 2) | 0; //@line 6126
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 6131
      if (!$$3) {
       HEAP32[1485] = HEAP32[1485] & ~(1 << $74); //@line 6138
       $$1 = $16; //@line 6139
       $$1382 = $17; //@line 6139
       $114 = $16; //@line 6139
       break L10;
      }
     } else {
      if ((HEAP32[1488] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 6146
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 6154
       if (!$$3) {
        $$1 = $16; //@line 6157
        $$1382 = $17; //@line 6157
        $114 = $16; //@line 6157
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1488] | 0; //@line 6165
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 6168
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 6172
    $92 = $16 + 16 | 0; //@line 6173
    $93 = HEAP32[$92 >> 2] | 0; //@line 6174
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 6180
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 6184
       HEAP32[$93 + 24 >> 2] = $$3; //@line 6186
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 6192
    if (!$99) {
     $$1 = $16; //@line 6195
     $$1382 = $17; //@line 6195
     $114 = $16; //@line 6195
    } else {
     if ((HEAP32[1488] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 6200
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 6204
      HEAP32[$99 + 24 >> 2] = $$3; //@line 6206
      $$1 = $16; //@line 6207
      $$1382 = $17; //@line 6207
      $114 = $16; //@line 6207
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 6213
   $$1382 = $9; //@line 6213
   $114 = $2; //@line 6213
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 6218
 }
 $115 = $10 + 4 | 0; //@line 6221
 $116 = HEAP32[$115 >> 2] | 0; //@line 6222
 if (!($116 & 1)) {
  _abort(); //@line 6226
 }
 if (!($116 & 2)) {
  if ((HEAP32[1490] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1487] | 0) + $$1382 | 0; //@line 6236
   HEAP32[1487] = $124; //@line 6237
   HEAP32[1490] = $$1; //@line 6238
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 6241
   if (($$1 | 0) != (HEAP32[1489] | 0)) {
    return;
   }
   HEAP32[1489] = 0; //@line 6247
   HEAP32[1486] = 0; //@line 6248
   return;
  }
  if ((HEAP32[1489] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1486] | 0) + $$1382 | 0; //@line 6255
   HEAP32[1486] = $132; //@line 6256
   HEAP32[1489] = $114; //@line 6257
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 6260
   HEAP32[$114 + $132 >> 2] = $132; //@line 6262
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 6266
  $138 = $116 >>> 3; //@line 6267
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 6272
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 6274
    $145 = 5976 + ($138 << 1 << 2) | 0; //@line 6276
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1488] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 6282
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 6289
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1484] = HEAP32[1484] & ~(1 << $138); //@line 6299
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 6305
    } else {
     if ((HEAP32[1488] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 6310
     }
     $160 = $143 + 8 | 0; //@line 6313
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 6317
     } else {
      _abort(); //@line 6319
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 6324
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 6325
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 6328
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 6330
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 6334
      $180 = $179 + 4 | 0; //@line 6335
      $181 = HEAP32[$180 >> 2] | 0; //@line 6336
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 6339
       if (!$183) {
        $$3400 = 0; //@line 6342
        break;
       } else {
        $$1398 = $183; //@line 6345
        $$1402 = $179; //@line 6345
       }
      } else {
       $$1398 = $181; //@line 6348
       $$1402 = $180; //@line 6348
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 6351
       $186 = HEAP32[$185 >> 2] | 0; //@line 6352
       if ($186 | 0) {
        $$1398 = $186; //@line 6355
        $$1402 = $185; //@line 6355
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 6358
       $189 = HEAP32[$188 >> 2] | 0; //@line 6359
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 6364
        $$1402 = $188; //@line 6364
       }
      }
      if ((HEAP32[1488] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 6370
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 6373
       $$3400 = $$1398; //@line 6374
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 6379
      if ((HEAP32[1488] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 6383
      }
      $173 = $170 + 12 | 0; //@line 6386
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 6390
      }
      $176 = $167 + 8 | 0; //@line 6393
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 6397
       HEAP32[$176 >> 2] = $170; //@line 6398
       $$3400 = $167; //@line 6399
       break;
      } else {
       _abort(); //@line 6402
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 6410
     $196 = 6240 + ($195 << 2) | 0; //@line 6411
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 6416
       if (!$$3400) {
        HEAP32[1485] = HEAP32[1485] & ~(1 << $195); //@line 6423
        break L108;
       }
      } else {
       if ((HEAP32[1488] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 6430
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 6438
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1488] | 0; //@line 6448
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 6451
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 6455
     $213 = $10 + 16 | 0; //@line 6456
     $214 = HEAP32[$213 >> 2] | 0; //@line 6457
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 6463
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 6467
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 6469
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 6475
     if ($220 | 0) {
      if ((HEAP32[1488] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 6481
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 6485
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 6487
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 6496
  HEAP32[$114 + $137 >> 2] = $137; //@line 6498
  if (($$1 | 0) == (HEAP32[1489] | 0)) {
   HEAP32[1486] = $137; //@line 6502
   return;
  } else {
   $$2 = $137; //@line 6505
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 6509
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 6512
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 6514
  $$2 = $$1382; //@line 6515
 }
 $235 = $$2 >>> 3; //@line 6517
 if ($$2 >>> 0 < 256) {
  $238 = 5976 + ($235 << 1 << 2) | 0; //@line 6521
  $239 = HEAP32[1484] | 0; //@line 6522
  $240 = 1 << $235; //@line 6523
  if (!($239 & $240)) {
   HEAP32[1484] = $239 | $240; //@line 6528
   $$0403 = $238; //@line 6530
   $$pre$phiZ2D = $238 + 8 | 0; //@line 6530
  } else {
   $244 = $238 + 8 | 0; //@line 6532
   $245 = HEAP32[$244 >> 2] | 0; //@line 6533
   if ((HEAP32[1488] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 6537
   } else {
    $$0403 = $245; //@line 6540
    $$pre$phiZ2D = $244; //@line 6540
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 6543
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 6545
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 6547
  HEAP32[$$1 + 12 >> 2] = $238; //@line 6549
  return;
 }
 $251 = $$2 >>> 8; //@line 6552
 if (!$251) {
  $$0396 = 0; //@line 6555
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 6559
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 6563
   $257 = $251 << $256; //@line 6564
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 6567
   $262 = $257 << $260; //@line 6569
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 6572
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 6577
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 6583
  }
 }
 $276 = 6240 + ($$0396 << 2) | 0; //@line 6586
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 6588
 HEAP32[$$1 + 20 >> 2] = 0; //@line 6591
 HEAP32[$$1 + 16 >> 2] = 0; //@line 6592
 $280 = HEAP32[1485] | 0; //@line 6593
 $281 = 1 << $$0396; //@line 6594
 do {
  if (!($280 & $281)) {
   HEAP32[1485] = $280 | $281; //@line 6600
   HEAP32[$276 >> 2] = $$1; //@line 6601
   HEAP32[$$1 + 24 >> 2] = $276; //@line 6603
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 6605
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 6607
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 6615
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 6615
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 6622
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 6626
    $301 = HEAP32[$299 >> 2] | 0; //@line 6628
    if (!$301) {
     label = 121; //@line 6631
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 6634
     $$0384 = $301; //@line 6634
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1488] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 6641
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 6644
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 6646
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 6648
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 6650
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 6655
    $309 = HEAP32[$308 >> 2] | 0; //@line 6656
    $310 = HEAP32[1488] | 0; //@line 6657
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 6663
     HEAP32[$308 >> 2] = $$1; //@line 6664
     HEAP32[$$1 + 8 >> 2] = $309; //@line 6666
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 6668
     HEAP32[$$1 + 24 >> 2] = 0; //@line 6670
     break;
    } else {
     _abort(); //@line 6673
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1492] | 0) + -1 | 0; //@line 6680
 HEAP32[1492] = $319; //@line 6681
 if (!$319) {
  $$0212$in$i = 6392; //@line 6684
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 6689
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 6695
  }
 }
 HEAP32[1492] = -1; //@line 6698
 return;
}
function _mbed_vtracef__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$1$off0 = 0, $$1$off0$expand_i1_val = 0, $$1$off0$expand_i1_val18 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$3154 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $$lobit = 0, $$sink = 0, $10 = 0, $102 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $136 = 0, $14 = 0, $147 = 0, $148 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $163 = 0, $164 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $57 = 0, $6 = 0, $62 = 0, $73 = 0, $74 = 0, $78 = 0, $79 = 0, $8 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $89 = 0, $91 = 0, $95 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx11 = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx7 = 0, $ReallocAsyncCtx8 = 0, $extract$t159 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 231
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 233
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 237
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 239
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 241
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 245
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 247
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 249
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 251
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 253
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 255
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 257
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 259
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 261
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 263
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 265
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 267
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 269
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 271
 $42 = HEAP8[$0 + 84 >> 0] | 0; //@line 273
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 275
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 277
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 279
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 281
 HEAP32[111] = (HEAP32[111] | 0) + 1; //@line 284
 $53 = HEAP32[100] | 0; //@line 285
 do {
  if ($53 | 0) {
   HEAP8[$53 >> 0] = 0; //@line 289
   do {
    if ($42 << 24 >> 24 > -1 & ($26 | 0) != 0) {
     $57 = HEAP32[97] | 0; //@line 295
     if (HEAP8[$57 >> 0] | 0) {
      if (_strstr($57, $26) | 0) {
       $$0$i = 1; //@line 302
       break;
      }
     }
     $62 = HEAP32[98] | 0; //@line 306
     if (!(HEAP8[$62 >> 0] | 0)) {
      label = 9; //@line 310
     } else {
      if (!(_strstr($62, $26) | 0)) {
       $$0$i = 1; //@line 315
      } else {
       label = 9; //@line 317
      }
     }
    } else {
     label = 9; //@line 321
    }
   } while (0);
   if ((label | 0) == 9) {
    $$0$i = 0; //@line 325
   }
   if (!((HEAP32[107] | 0) != 0 & ((($26 | 0) == 0 | (($18 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[104] = HEAP32[102]; //@line 337
    break;
   }
   $73 = HEAPU8[384] | 0; //@line 341
   $74 = $42 & 255; //@line 342
   if ($74 & 31 & $73 | 0) {
    $78 = $73 & 64; //@line 347
    $$lobit = $78 >>> 6; //@line 348
    $79 = $$lobit & 255; //@line 349
    $83 = ($73 & 32 | 0) == 0; //@line 353
    $84 = HEAP32[101] | 0; //@line 354
    $85 = HEAP32[100] | 0; //@line 355
    $86 = $42 << 24 >> 24 == 1; //@line 356
    if ($86 | ($73 & 128 | 0) != 0) {
     $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 359
     _vsnprintf($85, $84, $18, $16) | 0; //@line 360
     if (___async) {
      HEAP32[$ReallocAsyncCtx12 >> 2] = 45; //@line 363
      $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 364
      $$expand_i1_val = $86 & 1; //@line 365
      HEAP8[$87 >> 0] = $$expand_i1_val; //@line 366
      sp = STACKTOP; //@line 367
      return;
     }
     ___async_unwind = 0; //@line 370
     HEAP32[$ReallocAsyncCtx12 >> 2] = 45; //@line 371
     $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 372
     $$expand_i1_val = $86 & 1; //@line 373
     HEAP8[$87 >> 0] = $$expand_i1_val; //@line 374
     sp = STACKTOP; //@line 375
     return;
    }
    if (!$78) {
     $$1$off0 = ($$lobit | 0) != 0; //@line 381
     $$1143 = $85; //@line 381
     $$1145 = $84; //@line 381
     $$3154 = 0; //@line 381
     label = 28; //@line 382
    } else {
     if ($83) {
      $$0142 = $85; //@line 385
      $$0144 = $84; //@line 385
     } else {
      $89 = _snprintf($85, $84, 1702, $2) | 0; //@line 387
      $$ = ($89 | 0) >= ($84 | 0) ? 0 : $89; //@line 389
      $91 = ($$ | 0) > 0; //@line 390
      $$0142 = $91 ? $85 + $$ | 0 : $85; //@line 395
      $$0144 = $84 - ($91 ? $$ : 0) | 0; //@line 395
     }
     if (($$0144 | 0) > 0) {
      $95 = $74 + -2 | 0; //@line 399
      switch ($95 >>> 1 | $95 << 31 | 0) {
      case 0:
       {
        $$sink = 1720; //@line 405
        label = 25; //@line 406
        break;
       }
      case 1:
       {
        $$sink = 1726; //@line 410
        label = 25; //@line 411
        break;
       }
      case 3:
       {
        $$sink = 1714; //@line 415
        label = 25; //@line 416
        break;
       }
      case 7:
       {
        $$sink = 1708; //@line 420
        label = 25; //@line 421
        break;
       }
      default:
       {
        $$0141 = 0; //@line 425
        $$1152 = 0; //@line 425
       }
      }
      if ((label | 0) == 25) {
       HEAP32[$10 >> 2] = $$sink; //@line 429
       $$0141 = $79 & 1; //@line 432
       $$1152 = _snprintf($$0142, $$0144, 1732, $10) | 0; //@line 432
      }
      $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 435
      $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 437
      if (($$1152$ | 0) > 0) {
       $102 = $$0141 << 24 >> 24 == 0; //@line 439
       $$1$off0 = $extract$t159; //@line 444
       $$1143 = $102 ? $$0142 : $$0142 + $$1152$ | 0; //@line 444
       $$1145 = $$0144 - ($102 ? 0 : $$1152$) | 0; //@line 444
       $$3154 = $$1152; //@line 444
       label = 28; //@line 445
      } else {
       $$1$off0 = $extract$t159; //@line 447
       $$1143 = $$0142; //@line 447
       $$1145 = $$0144; //@line 447
       $$3154 = $$1152$; //@line 447
       label = 28; //@line 448
      }
     }
    }
    if ((label | 0) == 28) {
     if (($$1145 | 0) > 0 & (HEAP32[105] | 0) != 0) {
      HEAP32[$14 >> 2] = HEAP32[$16 >> 2]; //@line 459
      $ReallocAsyncCtx11 = _emscripten_realloc_async_context(104) | 0; //@line 460
      $108 = _vsnprintf(0, 0, $18, $14) | 0; //@line 461
      if (___async) {
       HEAP32[$ReallocAsyncCtx11 >> 2] = 49; //@line 464
       $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 465
       HEAP32[$109 >> 2] = $6; //@line 466
       $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 467
       HEAP32[$110 >> 2] = $8; //@line 468
       $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 469
       $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 470
       HEAP8[$111 >> 0] = $$1$off0$expand_i1_val; //@line 471
       $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 472
       HEAP32[$112 >> 2] = $48; //@line 473
       $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 474
       HEAP32[$113 >> 2] = $50; //@line 475
       $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 476
       HEAP32[$114 >> 2] = $20; //@line 477
       $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 478
       HEAP32[$115 >> 2] = $$1143; //@line 479
       $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 480
       HEAP32[$116 >> 2] = $$1145; //@line 481
       $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 482
       HEAP32[$117 >> 2] = $22; //@line 483
       $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 484
       HEAP32[$118 >> 2] = $14; //@line 485
       $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 486
       HEAP32[$119 >> 2] = $74; //@line 487
       $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 488
       HEAP32[$120 >> 2] = $24; //@line 489
       $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 490
       HEAP32[$121 >> 2] = $26; //@line 491
       $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 492
       HEAP32[$122 >> 2] = $28; //@line 493
       $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 494
       HEAP32[$123 >> 2] = $30; //@line 495
       $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 496
       HEAP32[$124 >> 2] = $32; //@line 497
       $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 498
       HEAP32[$125 >> 2] = $34; //@line 499
       $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 500
       HEAP32[$126 >> 2] = $36; //@line 501
       $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 502
       HEAP32[$127 >> 2] = $38; //@line 503
       $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 504
       HEAP32[$128 >> 2] = $40; //@line 505
       $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 506
       HEAP32[$129 >> 2] = $44; //@line 507
       $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 508
       HEAP32[$130 >> 2] = $46; //@line 509
       $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 510
       HEAP32[$131 >> 2] = $18; //@line 511
       $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 512
       HEAP32[$132 >> 2] = $16; //@line 513
       $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 514
       HEAP32[$133 >> 2] = $$3154; //@line 515
       sp = STACKTOP; //@line 516
       return;
      }
      HEAP32[___async_retval >> 2] = $108; //@line 520
      ___async_unwind = 0; //@line 521
      HEAP32[$ReallocAsyncCtx11 >> 2] = 49; //@line 522
      $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 523
      HEAP32[$109 >> 2] = $6; //@line 524
      $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 525
      HEAP32[$110 >> 2] = $8; //@line 526
      $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 527
      $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 528
      HEAP8[$111 >> 0] = $$1$off0$expand_i1_val; //@line 529
      $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 530
      HEAP32[$112 >> 2] = $48; //@line 531
      $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 532
      HEAP32[$113 >> 2] = $50; //@line 533
      $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 534
      HEAP32[$114 >> 2] = $20; //@line 535
      $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 536
      HEAP32[$115 >> 2] = $$1143; //@line 537
      $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 538
      HEAP32[$116 >> 2] = $$1145; //@line 539
      $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 540
      HEAP32[$117 >> 2] = $22; //@line 541
      $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 542
      HEAP32[$118 >> 2] = $14; //@line 543
      $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 544
      HEAP32[$119 >> 2] = $74; //@line 545
      $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 546
      HEAP32[$120 >> 2] = $24; //@line 547
      $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 548
      HEAP32[$121 >> 2] = $26; //@line 549
      $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 550
      HEAP32[$122 >> 2] = $28; //@line 551
      $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 552
      HEAP32[$123 >> 2] = $30; //@line 553
      $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 554
      HEAP32[$124 >> 2] = $32; //@line 555
      $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 556
      HEAP32[$125 >> 2] = $34; //@line 557
      $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 558
      HEAP32[$126 >> 2] = $36; //@line 559
      $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 560
      HEAP32[$127 >> 2] = $38; //@line 561
      $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 562
      HEAP32[$128 >> 2] = $40; //@line 563
      $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 564
      HEAP32[$129 >> 2] = $44; //@line 565
      $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 566
      HEAP32[$130 >> 2] = $46; //@line 567
      $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 568
      HEAP32[$131 >> 2] = $18; //@line 569
      $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 570
      HEAP32[$132 >> 2] = $16; //@line 571
      $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 572
      HEAP32[$133 >> 2] = $$3154; //@line 573
      sp = STACKTOP; //@line 574
      return;
     }
     if (($$1145 | 0) > 0) {
      $136 = $74 + -2 | 0; //@line 579
      switch ($136 >>> 1 | $136 << 31 | 0) {
      case 0:
       {
        HEAP32[$30 >> 2] = $26; //@line 585
        $$5156 = _snprintf($$1143, $$1145, 1735, $30) | 0; //@line 587
        break;
       }
      case 1:
       {
        HEAP32[$24 >> 2] = $26; //@line 591
        $$5156 = _snprintf($$1143, $$1145, 1750, $24) | 0; //@line 593
        break;
       }
      case 3:
       {
        HEAP32[$38 >> 2] = $26; //@line 597
        $$5156 = _snprintf($$1143, $$1145, 1765, $38) | 0; //@line 599
        break;
       }
      case 7:
       {
        HEAP32[$44 >> 2] = $26; //@line 603
        $$5156 = _snprintf($$1143, $$1145, 1780, $44) | 0; //@line 605
        break;
       }
      default:
       {
        $$5156 = _snprintf($$1143, $$1145, 1795, $34) | 0; //@line 610
       }
      }
      $$5156$ = ($$5156 | 0) < ($$1145 | 0) ? $$5156 : 0; //@line 614
      $147 = $$1143 + $$5156$ | 0; //@line 616
      $148 = $$1145 - $$5156$ | 0; //@line 617
      if (($$5156$ | 0) > 0 & ($148 | 0) > 0) {
       $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 621
       $150 = _vsnprintf($147, $148, $18, $16) | 0; //@line 622
       if (___async) {
        HEAP32[$ReallocAsyncCtx10 >> 2] = 51; //@line 625
        $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 626
        HEAP32[$151 >> 2] = $6; //@line 627
        $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 628
        HEAP32[$152 >> 2] = $8; //@line 629
        $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 630
        $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 631
        HEAP8[$153 >> 0] = $$1$off0$expand_i1_val18; //@line 632
        $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 633
        HEAP32[$154 >> 2] = $48; //@line 634
        $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 635
        HEAP32[$155 >> 2] = $50; //@line 636
        $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 637
        HEAP32[$156 >> 2] = $148; //@line 638
        $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 639
        HEAP32[$157 >> 2] = $147; //@line 640
        sp = STACKTOP; //@line 641
        return;
       }
       HEAP32[___async_retval >> 2] = $150; //@line 645
       ___async_unwind = 0; //@line 646
       HEAP32[$ReallocAsyncCtx10 >> 2] = 51; //@line 647
       $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 648
       HEAP32[$151 >> 2] = $6; //@line 649
       $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 650
       HEAP32[$152 >> 2] = $8; //@line 651
       $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 652
       $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 653
       HEAP8[$153 >> 0] = $$1$off0$expand_i1_val18; //@line 654
       $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 655
       HEAP32[$154 >> 2] = $48; //@line 656
       $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 657
       HEAP32[$155 >> 2] = $50; //@line 658
       $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 659
       HEAP32[$156 >> 2] = $148; //@line 660
       $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 661
       HEAP32[$157 >> 2] = $147; //@line 662
       sp = STACKTOP; //@line 663
       return;
      }
     }
    }
    $159 = HEAP32[107] | 0; //@line 668
    $160 = HEAP32[100] | 0; //@line 669
    $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 670
    FUNCTION_TABLE_vi[$159 & 255]($160); //@line 671
    if (___async) {
     HEAP32[$ReallocAsyncCtx7 >> 2] = 53; //@line 674
     sp = STACKTOP; //@line 675
     return;
    }
    ___async_unwind = 0; //@line 678
    HEAP32[$ReallocAsyncCtx7 >> 2] = 53; //@line 679
    sp = STACKTOP; //@line 680
    return;
   }
  }
 } while (0);
 $161 = HEAP32[110] | 0; //@line 685
 if (!$161) {
  return;
 }
 $163 = HEAP32[111] | 0; //@line 690
 HEAP32[111] = 0; //@line 691
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 692
 FUNCTION_TABLE_v[$161 & 15](); //@line 693
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 54; //@line 696
  $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 697
  HEAP32[$164 >> 2] = $163; //@line 698
  sp = STACKTOP; //@line 699
  return;
 }
 ___async_unwind = 0; //@line 702
 HEAP32[$ReallocAsyncCtx8 >> 2] = 54; //@line 703
 $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 704
 HEAP32[$164 >> 2] = $163; //@line 705
 sp = STACKTOP; //@line 706
 return;
}
function _twoway_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0166 = 0, $$0168 = 0, $$0169 = 0, $$0169$be = 0, $$0170 = 0, $$0175$ph$ph$lcssa216 = 0, $$0175$ph$ph$lcssa216328 = 0, $$0175$ph$ph254 = 0, $$0179242 = 0, $$0183$ph197$ph253 = 0, $$0183$ph197248 = 0, $$0183$ph260 = 0, $$0185$ph$lcssa = 0, $$0185$ph$lcssa327 = 0, $$0185$ph259 = 0, $$0187219$ph325326 = 0, $$0187263 = 0, $$1176$$0175 = 0, $$1176$ph$ph$lcssa208 = 0, $$1176$ph$ph233 = 0, $$1180222 = 0, $$1184$ph193$ph232 = 0, $$1184$ph193227 = 0, $$1184$ph239 = 0, $$1186$$0185 = 0, $$1186$ph$lcssa = 0, $$1186$ph238 = 0, $$2181$sink = 0, $$3 = 0, $$3173 = 0, $$3178 = 0, $$3182221 = 0, $$4 = 0, $$pr = 0, $10 = 0, $105 = 0, $111 = 0, $113 = 0, $118 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $14 = 0, $2 = 0, $23 = 0, $25 = 0, $27 = 0, $3 = 0, $32 = 0, $34 = 0, $37 = 0, $4 = 0, $41 = 0, $45 = 0, $50 = 0, $52 = 0, $53 = 0, $56 = 0, $60 = 0, $68 = 0, $70 = 0, $74 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $83 = 0, $86 = 0, $93 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11038
 STACKTOP = STACKTOP + 1056 | 0; //@line 11039
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(1056); //@line 11039
 $2 = sp + 1024 | 0; //@line 11040
 $3 = sp; //@line 11041
 HEAP32[$2 >> 2] = 0; //@line 11042
 HEAP32[$2 + 4 >> 2] = 0; //@line 11042
 HEAP32[$2 + 8 >> 2] = 0; //@line 11042
 HEAP32[$2 + 12 >> 2] = 0; //@line 11042
 HEAP32[$2 + 16 >> 2] = 0; //@line 11042
 HEAP32[$2 + 20 >> 2] = 0; //@line 11042
 HEAP32[$2 + 24 >> 2] = 0; //@line 11042
 HEAP32[$2 + 28 >> 2] = 0; //@line 11042
 $4 = HEAP8[$1 >> 0] | 0; //@line 11043
 L1 : do {
  if (!($4 << 24 >> 24)) {
   $$0175$ph$ph$lcssa216328 = 1; //@line 11047
   $$0185$ph$lcssa327 = -1; //@line 11047
   $$0187219$ph325326 = 0; //@line 11047
   $$1176$ph$ph$lcssa208 = 1; //@line 11047
   $$1186$ph$lcssa = -1; //@line 11047
   label = 26; //@line 11048
  } else {
   $$0187263 = 0; //@line 11050
   $10 = $4; //@line 11050
   do {
    if (!(HEAP8[$0 + $$0187263 >> 0] | 0)) {
     $$3 = 0; //@line 11056
     break L1;
    }
    $14 = $2 + ((($10 & 255) >>> 5 & 255) << 2) | 0; //@line 11064
    HEAP32[$14 >> 2] = HEAP32[$14 >> 2] | 1 << ($10 & 31); //@line 11067
    $$0187263 = $$0187263 + 1 | 0; //@line 11068
    HEAP32[$3 + (($10 & 255) << 2) >> 2] = $$0187263; //@line 11071
    $10 = HEAP8[$1 + $$0187263 >> 0] | 0; //@line 11073
   } while ($10 << 24 >> 24 != 0);
   $23 = $$0187263 >>> 0 > 1; //@line 11081
   if ($23) {
    $$0183$ph260 = 0; //@line 11083
    $$0185$ph259 = -1; //@line 11083
    $130 = 1; //@line 11083
    L6 : while (1) {
     $$0175$ph$ph254 = 1; //@line 11085
     $$0183$ph197$ph253 = $$0183$ph260; //@line 11085
     $131 = $130; //@line 11085
     while (1) {
      $$0183$ph197248 = $$0183$ph197$ph253; //@line 11087
      $132 = $131; //@line 11087
      L10 : while (1) {
       $$0179242 = 1; //@line 11089
       $25 = $132; //@line 11089
       while (1) {
        $32 = HEAP8[$1 + ($$0179242 + $$0185$ph259) >> 0] | 0; //@line 11093
        $34 = HEAP8[$1 + $25 >> 0] | 0; //@line 11095
        if ($32 << 24 >> 24 != $34 << 24 >> 24) {
         break L10;
        }
        if (($$0179242 | 0) == ($$0175$ph$ph254 | 0)) {
         break;
        }
        $$0179242 = $$0179242 + 1 | 0; //@line 11101
        $27 = $$0179242 + $$0183$ph197248 | 0; //@line 11105
        if ($27 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 11110
         $$0185$ph$lcssa = $$0185$ph259; //@line 11110
         break L6;
        } else {
         $25 = $27; //@line 11108
        }
       }
       $37 = $$0175$ph$ph254 + $$0183$ph197248 | 0; //@line 11114
       $132 = $37 + 1 | 0; //@line 11115
       if ($132 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 11120
        $$0185$ph$lcssa = $$0185$ph259; //@line 11120
        break L6;
       } else {
        $$0183$ph197248 = $37; //@line 11118
       }
      }
      $41 = $25 - $$0185$ph259 | 0; //@line 11125
      if (($32 & 255) <= ($34 & 255)) {
       break;
      }
      $131 = $25 + 1 | 0; //@line 11129
      if ($131 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216 = $41; //@line 11134
       $$0185$ph$lcssa = $$0185$ph259; //@line 11134
       break L6;
      } else {
       $$0175$ph$ph254 = $41; //@line 11132
       $$0183$ph197$ph253 = $25; //@line 11132
      }
     }
     $130 = $$0183$ph197248 + 2 | 0; //@line 11139
     if ($130 >>> 0 >= $$0187263 >>> 0) {
      $$0175$ph$ph$lcssa216 = 1; //@line 11144
      $$0185$ph$lcssa = $$0183$ph197248; //@line 11144
      break;
     } else {
      $$0183$ph260 = $$0183$ph197248 + 1 | 0; //@line 11142
      $$0185$ph259 = $$0183$ph197248; //@line 11142
     }
    }
    if ($23) {
     $$1184$ph239 = 0; //@line 11149
     $$1186$ph238 = -1; //@line 11149
     $133 = 1; //@line 11149
     while (1) {
      $$1176$ph$ph233 = 1; //@line 11151
      $$1184$ph193$ph232 = $$1184$ph239; //@line 11151
      $135 = $133; //@line 11151
      while (1) {
       $$1184$ph193227 = $$1184$ph193$ph232; //@line 11153
       $134 = $135; //@line 11153
       L25 : while (1) {
        $$1180222 = 1; //@line 11155
        $52 = $134; //@line 11155
        while (1) {
         $50 = HEAP8[$1 + ($$1180222 + $$1186$ph238) >> 0] | 0; //@line 11159
         $53 = HEAP8[$1 + $52 >> 0] | 0; //@line 11161
         if ($50 << 24 >> 24 != $53 << 24 >> 24) {
          break L25;
         }
         if (($$1180222 | 0) == ($$1176$ph$ph233 | 0)) {
          break;
         }
         $$1180222 = $$1180222 + 1 | 0; //@line 11167
         $45 = $$1180222 + $$1184$ph193227 | 0; //@line 11171
         if ($45 >>> 0 >= $$0187263 >>> 0) {
          $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11176
          $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11176
          $$0187219$ph325326 = $$0187263; //@line 11176
          $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 11176
          $$1186$ph$lcssa = $$1186$ph238; //@line 11176
          label = 26; //@line 11177
          break L1;
         } else {
          $52 = $45; //@line 11174
         }
        }
        $56 = $$1176$ph$ph233 + $$1184$ph193227 | 0; //@line 11181
        $134 = $56 + 1 | 0; //@line 11182
        if ($134 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11187
         $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11187
         $$0187219$ph325326 = $$0187263; //@line 11187
         $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 11187
         $$1186$ph$lcssa = $$1186$ph238; //@line 11187
         label = 26; //@line 11188
         break L1;
        } else {
         $$1184$ph193227 = $56; //@line 11185
        }
       }
       $60 = $52 - $$1186$ph238 | 0; //@line 11193
       if (($50 & 255) >= ($53 & 255)) {
        break;
       }
       $135 = $52 + 1 | 0; //@line 11197
       if ($135 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11202
        $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11202
        $$0187219$ph325326 = $$0187263; //@line 11202
        $$1176$ph$ph$lcssa208 = $60; //@line 11202
        $$1186$ph$lcssa = $$1186$ph238; //@line 11202
        label = 26; //@line 11203
        break L1;
       } else {
        $$1176$ph$ph233 = $60; //@line 11200
        $$1184$ph193$ph232 = $52; //@line 11200
       }
      }
      $133 = $$1184$ph193227 + 2 | 0; //@line 11208
      if ($133 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11213
       $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11213
       $$0187219$ph325326 = $$0187263; //@line 11213
       $$1176$ph$ph$lcssa208 = 1; //@line 11213
       $$1186$ph$lcssa = $$1184$ph193227; //@line 11213
       label = 26; //@line 11214
       break;
      } else {
       $$1184$ph239 = $$1184$ph193227 + 1 | 0; //@line 11211
       $$1186$ph238 = $$1184$ph193227; //@line 11211
      }
     }
    } else {
     $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11219
     $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11219
     $$0187219$ph325326 = $$0187263; //@line 11219
     $$1176$ph$ph$lcssa208 = 1; //@line 11219
     $$1186$ph$lcssa = -1; //@line 11219
     label = 26; //@line 11220
    }
   } else {
    $$0175$ph$ph$lcssa216328 = 1; //@line 11223
    $$0185$ph$lcssa327 = -1; //@line 11223
    $$0187219$ph325326 = $$0187263; //@line 11223
    $$1176$ph$ph$lcssa208 = 1; //@line 11223
    $$1186$ph$lcssa = -1; //@line 11223
    label = 26; //@line 11224
   }
  }
 } while (0);
 L35 : do {
  if ((label | 0) == 26) {
   $68 = ($$1186$ph$lcssa + 1 | 0) >>> 0 > ($$0185$ph$lcssa327 + 1 | 0) >>> 0; //@line 11232
   $$1176$$0175 = $68 ? $$1176$ph$ph$lcssa208 : $$0175$ph$ph$lcssa216328; //@line 11233
   $$1186$$0185 = $68 ? $$1186$ph$lcssa : $$0185$ph$lcssa327; //@line 11234
   $70 = $$1186$$0185 + 1 | 0; //@line 11236
   if (!(_memcmp($1, $1 + $$1176$$0175 | 0, $70) | 0)) {
    $$0168 = $$0187219$ph325326 - $$1176$$0175 | 0; //@line 11241
    $$3178 = $$1176$$0175; //@line 11241
   } else {
    $74 = $$0187219$ph325326 - $$1186$$0185 + -1 | 0; //@line 11244
    $$0168 = 0; //@line 11248
    $$3178 = ($$1186$$0185 >>> 0 > $74 >>> 0 ? $$1186$$0185 : $74) + 1 | 0; //@line 11248
   }
   $78 = $$0187219$ph325326 | 63; //@line 11250
   $79 = $$0187219$ph325326 + -1 | 0; //@line 11251
   $80 = ($$0168 | 0) != 0; //@line 11252
   $81 = $$0187219$ph325326 - $$3178 | 0; //@line 11253
   $$0166 = $0; //@line 11254
   $$0169 = 0; //@line 11254
   $$0170 = $0; //@line 11254
   while (1) {
    $83 = $$0166; //@line 11257
    do {
     if (($$0170 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
      $86 = _memchr($$0170, 0, $78) | 0; //@line 11262
      if (!$86) {
       $$3173 = $$0170 + $78 | 0; //@line 11266
       break;
      } else {
       if (($86 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
        $$3 = 0; //@line 11273
        break L35;
       } else {
        $$3173 = $86; //@line 11276
        break;
       }
      }
     } else {
      $$3173 = $$0170; //@line 11281
     }
    } while (0);
    $93 = HEAP8[$$0166 + $79 >> 0] | 0; //@line 11285
    L49 : do {
     if (!(1 << ($93 & 31) & HEAP32[$2 + ((($93 & 255) >>> 5 & 255) << 2) >> 2])) {
      $$0169$be = 0; //@line 11297
      $$2181$sink = $$0187219$ph325326; //@line 11297
     } else {
      $105 = $$0187219$ph325326 - (HEAP32[$3 + (($93 & 255) << 2) >> 2] | 0) | 0; //@line 11302
      if ($105 | 0) {
       $$0169$be = 0; //@line 11310
       $$2181$sink = $80 & ($$0169 | 0) != 0 & $105 >>> 0 < $$3178 >>> 0 ? $81 : $105; //@line 11310
       break;
      }
      $111 = $70 >>> 0 > $$0169 >>> 0 ? $70 : $$0169; //@line 11314
      $113 = HEAP8[$1 + $111 >> 0] | 0; //@line 11316
      L54 : do {
       if (!($113 << 24 >> 24)) {
        $$4 = $70; //@line 11320
       } else {
        $$3182221 = $111; //@line 11322
        $$pr = $113; //@line 11322
        while (1) {
         if ($$pr << 24 >> 24 != (HEAP8[$$0166 + $$3182221 >> 0] | 0)) {
          break;
         }
         $118 = $$3182221 + 1 | 0; //@line 11330
         $$pr = HEAP8[$1 + $118 >> 0] | 0; //@line 11332
         if (!($$pr << 24 >> 24)) {
          $$4 = $70; //@line 11335
          break L54;
         } else {
          $$3182221 = $118; //@line 11338
         }
        }
        $$0169$be = 0; //@line 11342
        $$2181$sink = $$3182221 - $$1186$$0185 | 0; //@line 11342
        break L49;
       }
      } while (0);
      while (1) {
       if ($$4 >>> 0 <= $$0169 >>> 0) {
        $$3 = $$0166; //@line 11349
        break L35;
       }
       $$4 = $$4 + -1 | 0; //@line 11352
       if ((HEAP8[$1 + $$4 >> 0] | 0) != (HEAP8[$$0166 + $$4 >> 0] | 0)) {
        $$0169$be = $$0168; //@line 11361
        $$2181$sink = $$3178; //@line 11361
        break;
       }
      }
     }
    } while (0);
    $$0166 = $$0166 + $$2181$sink | 0; //@line 11368
    $$0169 = $$0169$be; //@line 11368
    $$0170 = $$3173; //@line 11368
   }
  }
 } while (0);
 STACKTOP = sp; //@line 11372
 return $$3 | 0; //@line 11372
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12842
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12848
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 12857
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 12862
      $19 = $1 + 44 | 0; //@line 12863
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 12872
      $26 = $1 + 52 | 0; //@line 12873
      $27 = $1 + 53 | 0; //@line 12874
      $28 = $1 + 54 | 0; //@line 12875
      $29 = $0 + 8 | 0; //@line 12876
      $30 = $1 + 24 | 0; //@line 12877
      $$081$off0 = 0; //@line 12878
      $$084 = $0 + 16 | 0; //@line 12878
      $$085$off0 = 0; //@line 12878
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 12882
        label = 20; //@line 12883
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 12886
       HEAP8[$27 >> 0] = 0; //@line 12887
       $AsyncCtx15 = _emscripten_alloc_async_context(52, sp) | 0; //@line 12888
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 12889
       if (___async) {
        label = 12; //@line 12892
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 12895
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 12899
        label = 20; //@line 12900
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 12907
         $$186$off0 = $$085$off0; //@line 12907
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 12916
           label = 20; //@line 12917
           break L10;
          } else {
           $$182$off0 = 1; //@line 12920
           $$186$off0 = $$085$off0; //@line 12920
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 12927
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 12934
          break L10;
         } else {
          $$182$off0 = 1; //@line 12937
          $$186$off0 = 1; //@line 12937
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 12942
       $$084 = $$084 + 8 | 0; //@line 12942
       $$085$off0 = $$186$off0; //@line 12942
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 155; //@line 12945
       HEAP32[$AsyncCtx15 + 4 >> 2] = $26; //@line 12947
       HEAP32[$AsyncCtx15 + 8 >> 2] = $30; //@line 12949
       HEAP32[$AsyncCtx15 + 12 >> 2] = $27; //@line 12951
       HEAP32[$AsyncCtx15 + 16 >> 2] = $1; //@line 12953
       HEAP32[$AsyncCtx15 + 20 >> 2] = $2; //@line 12955
       HEAP8[$AsyncCtx15 + 24 >> 0] = $4 & 1; //@line 12958
       HEAP8[$AsyncCtx15 + 25 >> 0] = $$085$off0 & 1; //@line 12961
       HEAP8[$AsyncCtx15 + 26 >> 0] = $$081$off0 & 1; //@line 12964
       HEAP32[$AsyncCtx15 + 28 >> 2] = $$084; //@line 12966
       HEAP32[$AsyncCtx15 + 32 >> 2] = $29; //@line 12968
       HEAP32[$AsyncCtx15 + 36 >> 2] = $28; //@line 12970
       HEAP32[$AsyncCtx15 + 40 >> 2] = $13; //@line 12972
       HEAP32[$AsyncCtx15 + 44 >> 2] = $19; //@line 12974
       HEAP32[$AsyncCtx15 + 48 >> 2] = $25; //@line 12976
       sp = STACKTOP; //@line 12977
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 12983
         $61 = $1 + 40 | 0; //@line 12984
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 12987
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 12995
           if ($$283$off0) {
            label = 25; //@line 12997
            break;
           } else {
            $69 = 4; //@line 13000
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 13007
        } else {
         $69 = 4; //@line 13009
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 13014
      }
      HEAP32[$19 >> 2] = $69; //@line 13016
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 13025
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 13030
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 13031
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 13032
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 13033
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 156; //@line 13036
    HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 13038
    HEAP32[$AsyncCtx11 + 8 >> 2] = $72; //@line 13040
    HEAP32[$AsyncCtx11 + 12 >> 2] = $73; //@line 13042
    HEAP32[$AsyncCtx11 + 16 >> 2] = $1; //@line 13044
    HEAP32[$AsyncCtx11 + 20 >> 2] = $2; //@line 13046
    HEAP32[$AsyncCtx11 + 24 >> 2] = $3; //@line 13048
    HEAP8[$AsyncCtx11 + 28 >> 0] = $4 & 1; //@line 13051
    sp = STACKTOP; //@line 13052
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 13055
   $81 = $0 + 24 | 0; //@line 13056
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 13060
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 13064
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 13071
       $$2 = $81; //@line 13072
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 13084
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 13085
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 13090
        $136 = $$2 + 8 | 0; //@line 13091
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 13094
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 159; //@line 13099
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 13101
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 13103
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 13105
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 13107
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 13109
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 13111
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 13113
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 13116
       sp = STACKTOP; //@line 13117
       return;
      }
      $104 = $1 + 24 | 0; //@line 13120
      $105 = $1 + 54 | 0; //@line 13121
      $$1 = $81; //@line 13122
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 13138
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 13139
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13144
       $122 = $$1 + 8 | 0; //@line 13145
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 13148
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 158; //@line 13153
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 13155
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 13157
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 13159
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 13161
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 13163
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 13165
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 13167
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 13169
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 13172
      sp = STACKTOP; //@line 13173
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 13177
    $$0 = $81; //@line 13178
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 13185
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 13186
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 13191
     $100 = $$0 + 8 | 0; //@line 13192
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 13195
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 157; //@line 13200
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 13202
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 13204
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 13206
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 13208
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 13210
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 13212
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 13215
    sp = STACKTOP; //@line 13216
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
 $n_sroa_0_0_extract_trunc = $a$0; //@line 5497
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 5498
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 5499
 $d_sroa_0_0_extract_trunc = $b$0; //@line 5500
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 5501
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 5502
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 5504
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 5507
    HEAP32[$rem + 4 >> 2] = 0; //@line 5508
   }
   $_0$1 = 0; //@line 5510
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 5511
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5512
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 5515
    $_0$0 = 0; //@line 5516
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5517
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 5519
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 5520
   $_0$1 = 0; //@line 5521
   $_0$0 = 0; //@line 5522
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5523
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 5526
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 5531
     HEAP32[$rem + 4 >> 2] = 0; //@line 5532
    }
    $_0$1 = 0; //@line 5534
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 5535
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5536
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 5540
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 5541
    }
    $_0$1 = 0; //@line 5543
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 5544
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5545
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 5547
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 5550
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 5551
    }
    $_0$1 = 0; //@line 5553
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 5554
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5555
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 5558
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 5560
    $58 = 31 - $51 | 0; //@line 5561
    $sr_1_ph = $57; //@line 5562
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 5563
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 5564
    $q_sroa_0_1_ph = 0; //@line 5565
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 5566
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 5570
    $_0$0 = 0; //@line 5571
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5572
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 5574
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 5575
   $_0$1 = 0; //@line 5576
   $_0$0 = 0; //@line 5577
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5578
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 5582
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 5584
     $126 = 31 - $119 | 0; //@line 5585
     $130 = $119 - 31 >> 31; //@line 5586
     $sr_1_ph = $125; //@line 5587
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 5588
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 5589
     $q_sroa_0_1_ph = 0; //@line 5590
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 5591
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 5595
     $_0$0 = 0; //@line 5596
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5597
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 5599
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 5600
    $_0$1 = 0; //@line 5601
    $_0$0 = 0; //@line 5602
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5603
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 5605
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 5608
    $89 = 64 - $88 | 0; //@line 5609
    $91 = 32 - $88 | 0; //@line 5610
    $92 = $91 >> 31; //@line 5611
    $95 = $88 - 32 | 0; //@line 5612
    $105 = $95 >> 31; //@line 5613
    $sr_1_ph = $88; //@line 5614
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 5615
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 5616
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 5617
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 5618
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 5622
    HEAP32[$rem + 4 >> 2] = 0; //@line 5623
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 5626
    $_0$0 = $a$0 | 0 | 0; //@line 5627
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5628
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 5630
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 5631
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 5632
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5633
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 5638
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 5639
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 5640
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 5641
  $carry_0_lcssa$1 = 0; //@line 5642
  $carry_0_lcssa$0 = 0; //@line 5643
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 5645
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 5646
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 5647
  $137$1 = tempRet0; //@line 5648
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 5649
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 5650
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 5651
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 5652
  $sr_1202 = $sr_1_ph; //@line 5653
  $carry_0203 = 0; //@line 5654
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 5656
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 5657
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 5658
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 5659
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 5660
   $150$1 = tempRet0; //@line 5661
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 5662
   $carry_0203 = $151$0 & 1; //@line 5663
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 5665
   $r_sroa_1_1200 = tempRet0; //@line 5666
   $sr_1202 = $sr_1202 - 1 | 0; //@line 5667
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 5679
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 5680
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 5681
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 5682
  $carry_0_lcssa$1 = 0; //@line 5683
  $carry_0_lcssa$0 = $carry_0203; //@line 5684
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 5686
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 5687
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 5690
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 5691
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 5693
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 5694
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5695
}
function _initialize($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$037 = 0, $1 = 0, $101 = 0, $102 = 0, $103 = 0, $105 = 0, $106 = 0, $109 = 0, $115 = 0, $116 = 0, $117 = 0, $126 = 0, $127 = 0, $128 = 0, $13 = 0, $130 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $14 = 0, $140 = 0, $142 = 0, $148 = 0, $149 = 0, $150 = 0, $159 = 0, $160 = 0, $161 = 0, $163 = 0, $167 = 0, $173 = 0, $174 = 0, $175 = 0, $177 = 0, $18 = 0, $25 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $37 = 0, $39 = 0, $40 = 0, $41 = 0, $45 = 0, $46 = 0, $52 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $70 = 0, $73 = 0, $77 = 0, $78 = 0, $85 = 0, $86 = 0, $AsyncCtx = 0, $AsyncCtx12 = 0, $AsyncCtx16 = 0, $AsyncCtx2 = 0, $AsyncCtx20 = 0, $AsyncCtx6 = 0, $AsyncCtx9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1442
 $1 = $0 + 4 | 0; //@line 1443
 if (HEAP8[(HEAP32[$1 >> 2] | 0) + 56 >> 0] | 0) {
  return;
 }
 $7 = HEAP32[HEAP32[$0 >> 2] >> 2] | 0; //@line 1452
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1453
 FUNCTION_TABLE_v[$7 & 15](); //@line 1454
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 57; //@line 1457
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1459
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 1461
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 1463
  sp = STACKTOP; //@line 1464
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1467
 $13 = HEAP32[(HEAP32[$0 >> 2] | 0) + 24 >> 2] | 0; //@line 1470
 $AsyncCtx2 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1471
 $14 = FUNCTION_TABLE_i[$13 & 3]() | 0; //@line 1472
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 58; //@line 1475
  HEAP32[$AsyncCtx2 + 4 >> 2] = $1; //@line 1477
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1479
  HEAP32[$AsyncCtx2 + 12 >> 2] = $0; //@line 1481
  sp = STACKTOP; //@line 1482
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1485
 $18 = HEAP32[$14 >> 2] | 0; //@line 1486
 do {
  if (!$18) {
   $AsyncCtx20 = _emscripten_alloc_async_context(20, sp) | 0; //@line 1490
   _mbed_assert_internal(1815, 1817, 41); //@line 1491
   if (___async) {
    HEAP32[$AsyncCtx20 >> 2] = 59; //@line 1494
    HEAP32[$AsyncCtx20 + 4 >> 2] = $1; //@line 1496
    HEAP32[$AsyncCtx20 + 8 >> 2] = $0; //@line 1498
    HEAP32[$AsyncCtx20 + 12 >> 2] = $0; //@line 1500
    HEAP32[$AsyncCtx20 + 16 >> 2] = $14; //@line 1502
    sp = STACKTOP; //@line 1503
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx20 | 0); //@line 1506
    $$0 = 1e6; //@line 1507
    break;
   }
  } else {
   $$0 = $18; //@line 1511
  }
 } while (0);
 $25 = HEAP32[$14 + 4 >> 2] | 0; //@line 1515
 do {
  if (($25 + -4 | 0) >>> 0 > 28) {
   $AsyncCtx16 = _emscripten_alloc_async_context(20, sp) | 0; //@line 1520
   _mbed_assert_internal(1815, 1817, 47); //@line 1521
   if (___async) {
    HEAP32[$AsyncCtx16 >> 2] = 60; //@line 1524
    HEAP32[$AsyncCtx16 + 4 >> 2] = $$0; //@line 1526
    HEAP32[$AsyncCtx16 + 8 >> 2] = $1; //@line 1528
    HEAP32[$AsyncCtx16 + 12 >> 2] = $0; //@line 1530
    HEAP32[$AsyncCtx16 + 16 >> 2] = $0; //@line 1532
    sp = STACKTOP; //@line 1533
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx16 | 0); //@line 1536
    $$037 = 32; //@line 1537
    break;
   }
  } else {
   $$037 = $25; //@line 1541
  }
 } while (0);
 $32 = 7 << $$037 + -4; //@line 1545
 $33 = ___muldi3($32 | 0, 0, 1e6, 0) | 0; //@line 1546
 $34 = tempRet0; //@line 1547
 $35 = _i64Add($$0 | 0, 0, -1, -1) | 0; //@line 1548
 $37 = _i64Add($35 | 0, tempRet0 | 0, $33 | 0, $34 | 0) | 0; //@line 1550
 $39 = ___udivdi3($37 | 0, tempRet0 | 0, $$0 | 0, 0) | 0; //@line 1552
 $40 = tempRet0; //@line 1553
 $41 = HEAP32[$1 >> 2] | 0; //@line 1554
 HEAP32[$41 >> 2] = 0; //@line 1555
 HEAP32[$41 + 4 >> 2] = 0; //@line 1557
 $45 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 1560
 $AsyncCtx6 = _emscripten_alloc_async_context(40, sp) | 0; //@line 1561
 $46 = FUNCTION_TABLE_i[$45 & 3]() | 0; //@line 1562
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 61; //@line 1565
  HEAP32[$AsyncCtx6 + 4 >> 2] = $1; //@line 1567
  HEAP32[$AsyncCtx6 + 8 >> 2] = $$0; //@line 1569
  HEAP32[$AsyncCtx6 + 12 >> 2] = $$037; //@line 1571
  HEAP32[$AsyncCtx6 + 16 >> 2] = $32; //@line 1573
  $52 = $AsyncCtx6 + 24 | 0; //@line 1575
  HEAP32[$52 >> 2] = $39; //@line 1577
  HEAP32[$52 + 4 >> 2] = $40; //@line 1580
  HEAP32[$AsyncCtx6 + 32 >> 2] = $0; //@line 1582
  HEAP32[$AsyncCtx6 + 36 >> 2] = $0; //@line 1584
  sp = STACKTOP; //@line 1585
  return;
 }
 _emscripten_free_async_context($AsyncCtx6 | 0); //@line 1588
 $58 = HEAP32[$1 >> 2] | 0; //@line 1589
 $59 = $58 + 32 | 0; //@line 1590
 HEAP32[$59 >> 2] = $46; //@line 1591
 $60 = $58 + 40 | 0; //@line 1592
 $61 = $60; //@line 1593
 HEAP32[$61 >> 2] = 0; //@line 1595
 HEAP32[$61 + 4 >> 2] = 0; //@line 1598
 $65 = $58 + 8 | 0; //@line 1599
 HEAP32[$65 >> 2] = $$0; //@line 1600
 $66 = _bitshift64Shl(1, 0, $$037 | 0) | 0; //@line 1601
 $68 = _i64Add($66 | 0, tempRet0 | 0, -1, 0) | 0; //@line 1603
 $70 = $58 + 12 | 0; //@line 1605
 HEAP32[$70 >> 2] = $68; //@line 1606
 HEAP32[$58 + 16 >> 2] = $32; //@line 1608
 $73 = $58 + 24 | 0; //@line 1610
 HEAP32[$73 >> 2] = $39; //@line 1612
 HEAP32[$73 + 4 >> 2] = $40; //@line 1615
 $77 = $58 + 48 | 0; //@line 1616
 $78 = $77; //@line 1617
 HEAP32[$78 >> 2] = 0; //@line 1619
 HEAP32[$78 + 4 >> 2] = 0; //@line 1622
 HEAP8[$58 + 56 >> 0] = 1; //@line 1624
 $85 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 1627
 $AsyncCtx9 = _emscripten_alloc_async_context(32, sp) | 0; //@line 1628
 $86 = FUNCTION_TABLE_i[$85 & 3]() | 0; //@line 1629
 if (___async) {
  HEAP32[$AsyncCtx9 >> 2] = 62; //@line 1632
  HEAP32[$AsyncCtx9 + 4 >> 2] = $1; //@line 1634
  HEAP32[$AsyncCtx9 + 8 >> 2] = $0; //@line 1636
  HEAP32[$AsyncCtx9 + 12 >> 2] = $59; //@line 1638
  HEAP32[$AsyncCtx9 + 16 >> 2] = $70; //@line 1640
  HEAP32[$AsyncCtx9 + 20 >> 2] = $65; //@line 1642
  HEAP32[$AsyncCtx9 + 24 >> 2] = $60; //@line 1644
  HEAP32[$AsyncCtx9 + 28 >> 2] = $77; //@line 1646
  sp = STACKTOP; //@line 1647
  return;
 }
 _emscripten_free_async_context($AsyncCtx9 | 0); //@line 1650
 if (($86 | 0) != (HEAP32[(HEAP32[$1 >> 2] | 0) + 32 >> 2] | 0)) {
  $101 = $86 - (HEAP32[$59 >> 2] | 0) & HEAP32[$70 >> 2]; //@line 1659
  HEAP32[$59 >> 2] = $86; //@line 1660
  $102 = HEAP32[$65 >> 2] | 0; //@line 1661
  L30 : do {
   if (($102 | 0) < 1e6) {
    switch ($102 | 0) {
    case 32768:
     {
      break;
     }
    default:
     {
      label = 22; //@line 1670
      break L30;
     }
    }
    $103 = ___muldi3($101 | 0, 0, 1e6, 0) | 0; //@line 1674
    $105 = _bitshift64Lshr($103 | 0, tempRet0 | 0, 15) | 0; //@line 1676
    $106 = tempRet0; //@line 1677
    $109 = $60; //@line 1680
    $115 = _i64Add(HEAP32[$109 >> 2] | 0, HEAP32[$109 + 4 >> 2] | 0, $101 * 1e6 & 32704 | 0, 0) | 0; //@line 1686
    $116 = tempRet0; //@line 1687
    $117 = $60; //@line 1688
    HEAP32[$117 >> 2] = $115; //@line 1690
    HEAP32[$117 + 4 >> 2] = $116; //@line 1693
    if ($116 >>> 0 < 0 | ($116 | 0) == 0 & $115 >>> 0 < 32768) {
     $173 = $105; //@line 1700
     $174 = $106; //@line 1700
    } else {
     $126 = _i64Add($105 | 0, $106 | 0, 1, 0) | 0; //@line 1702
     $127 = tempRet0; //@line 1703
     $128 = _i64Add($115 | 0, $116 | 0, -32768, -1) | 0; //@line 1704
     $130 = $60; //@line 1706
     HEAP32[$130 >> 2] = $128; //@line 1708
     HEAP32[$130 + 4 >> 2] = tempRet0; //@line 1711
     $173 = $126; //@line 1712
     $174 = $127; //@line 1712
    }
   } else {
    switch ($102 | 0) {
    case 1e6:
     {
      $173 = $101; //@line 1717
      $174 = 0; //@line 1717
      break;
     }
    default:
     {
      label = 22; //@line 1721
     }
    }
   }
  } while (0);
  if ((label | 0) == 22) {
   $134 = ___muldi3($101 | 0, 0, 1e6, 0) | 0; //@line 1727
   $135 = tempRet0; //@line 1728
   $136 = ___udivdi3($134 | 0, $135 | 0, $102 | 0, 0) | 0; //@line 1729
   $137 = tempRet0; //@line 1730
   $138 = ___muldi3($136 | 0, $137 | 0, $102 | 0, 0) | 0; //@line 1731
   $140 = _i64Subtract($134 | 0, $135 | 0, $138 | 0, tempRet0 | 0) | 0; //@line 1733
   $142 = $60; //@line 1735
   $148 = _i64Add($140 | 0, tempRet0 | 0, HEAP32[$142 >> 2] | 0, HEAP32[$142 + 4 >> 2] | 0) | 0; //@line 1741
   $149 = tempRet0; //@line 1742
   $150 = $60; //@line 1743
   HEAP32[$150 >> 2] = $148; //@line 1745
   HEAP32[$150 + 4 >> 2] = $149; //@line 1748
   if ($149 >>> 0 < 0 | ($149 | 0) == 0 & $148 >>> 0 < $102 >>> 0) {
    $173 = $136; //@line 1755
    $174 = $137; //@line 1755
   } else {
    $159 = _i64Add($136 | 0, $137 | 0, 1, 0) | 0; //@line 1757
    $160 = tempRet0; //@line 1758
    $161 = _i64Subtract($148 | 0, $149 | 0, $102 | 0, 0) | 0; //@line 1759
    $163 = $60; //@line 1761
    HEAP32[$163 >> 2] = $161; //@line 1763
    HEAP32[$163 + 4 >> 2] = tempRet0; //@line 1766
    $173 = $159; //@line 1767
    $174 = $160; //@line 1767
   }
  }
  $167 = $77; //@line 1770
  $175 = _i64Add(HEAP32[$167 >> 2] | 0, HEAP32[$167 + 4 >> 2] | 0, $173 | 0, $174 | 0) | 0; //@line 1776
  $177 = $77; //@line 1778
  HEAP32[$177 >> 2] = $175; //@line 1780
  HEAP32[$177 + 4 >> 2] = tempRet0; //@line 1783
 }
 $AsyncCtx12 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1785
 _schedule_interrupt($0); //@line 1786
 if (___async) {
  HEAP32[$AsyncCtx12 >> 2] = 63; //@line 1789
  sp = STACKTOP; //@line 1790
  return;
 }
 _emscripten_free_async_context($AsyncCtx12 | 0); //@line 1793
 return;
}
function _schedule_interrupt($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $1 = 0, $10 = 0, $104 = 0, $107 = 0, $109 = 0, $11 = 0, $112 = 0, $113 = 0, $115 = 0, $118 = 0, $126 = 0, $127 = 0, $128 = 0, $130 = 0, $132 = 0, $137 = 0, $14 = 0, $144 = 0, $146 = 0, $148 = 0, $151 = 0, $153 = 0, $160 = 0, $161 = 0, $164 = 0, $166 = 0, $168 = 0, $174 = 0, $175 = 0, $179 = 0, $187 = 0, $19 = 0, $195 = 0, $198 = 0, $2 = 0, $21 = 0, $22 = 0, $24 = 0, $25 = 0, $28 = 0, $29 = 0, $35 = 0, $36 = 0, $37 = 0, $46 = 0, $47 = 0, $48 = 0, $5 = 0, $50 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $6 = 0, $60 = 0, $62 = 0, $63 = 0, $69 = 0, $70 = 0, $71 = 0, $80 = 0, $81 = 0, $82 = 0, $84 = 0, $88 = 0, $89 = 0, $95 = 0, $96 = 0, $97 = 0, $99 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx14 = 0, $AsyncCtx18 = 0, $AsyncCtx22 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1810
 $1 = $0 + 4 | 0; //@line 1811
 $2 = HEAP32[$1 >> 2] | 0; //@line 1812
 $5 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 1815
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1816
 $6 = FUNCTION_TABLE_i[$5 & 3]() | 0; //@line 1817
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 64; //@line 1820
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 1822
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 1824
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 1826
  sp = STACKTOP; //@line 1827
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1830
 $10 = HEAP32[$1 >> 2] | 0; //@line 1831
 $11 = $10 + 32 | 0; //@line 1832
 if (($6 | 0) != (HEAP32[$11 >> 2] | 0)) {
  $14 = $2 + 32 | 0; //@line 1836
  $19 = $6 - (HEAP32[$14 >> 2] | 0) & HEAP32[$2 + 12 >> 2]; //@line 1841
  HEAP32[$14 >> 2] = $6; //@line 1842
  $21 = HEAP32[$2 + 8 >> 2] | 0; //@line 1844
  L6 : do {
   if (($21 | 0) < 1e6) {
    switch ($21 | 0) {
    case 32768:
     {
      break;
     }
    default:
     {
      label = 7; //@line 1853
      break L6;
     }
    }
    $22 = ___muldi3($19 | 0, 0, 1e6, 0) | 0; //@line 1857
    $24 = _bitshift64Lshr($22 | 0, tempRet0 | 0, 15) | 0; //@line 1859
    $25 = tempRet0; //@line 1860
    $28 = $2 + 40 | 0; //@line 1863
    $29 = $28; //@line 1864
    $35 = _i64Add(HEAP32[$29 >> 2] | 0, HEAP32[$29 + 4 >> 2] | 0, $19 * 1e6 & 32704 | 0, 0) | 0; //@line 1870
    $36 = tempRet0; //@line 1871
    $37 = $28; //@line 1872
    HEAP32[$37 >> 2] = $35; //@line 1874
    HEAP32[$37 + 4 >> 2] = $36; //@line 1877
    if ($36 >>> 0 < 0 | ($36 | 0) == 0 & $35 >>> 0 < 32768) {
     $95 = $24; //@line 1884
     $96 = $25; //@line 1884
    } else {
     $46 = _i64Add($24 | 0, $25 | 0, 1, 0) | 0; //@line 1886
     $47 = tempRet0; //@line 1887
     $48 = _i64Add($35 | 0, $36 | 0, -32768, -1) | 0; //@line 1888
     $50 = $28; //@line 1890
     HEAP32[$50 >> 2] = $48; //@line 1892
     HEAP32[$50 + 4 >> 2] = tempRet0; //@line 1895
     $95 = $46; //@line 1896
     $96 = $47; //@line 1896
    }
   } else {
    switch ($21 | 0) {
    case 1e6:
     {
      $95 = $19; //@line 1901
      $96 = 0; //@line 1901
      break;
     }
    default:
     {
      label = 7; //@line 1905
     }
    }
   }
  } while (0);
  if ((label | 0) == 7) {
   $54 = ___muldi3($19 | 0, 0, 1e6, 0) | 0; //@line 1911
   $55 = tempRet0; //@line 1912
   $56 = ___udivdi3($54 | 0, $55 | 0, $21 | 0, 0) | 0; //@line 1913
   $57 = tempRet0; //@line 1914
   $58 = ___muldi3($56 | 0, $57 | 0, $21 | 0, 0) | 0; //@line 1915
   $60 = _i64Subtract($54 | 0, $55 | 0, $58 | 0, tempRet0 | 0) | 0; //@line 1917
   $62 = $2 + 40 | 0; //@line 1919
   $63 = $62; //@line 1920
   $69 = _i64Add($60 | 0, tempRet0 | 0, HEAP32[$63 >> 2] | 0, HEAP32[$63 + 4 >> 2] | 0) | 0; //@line 1926
   $70 = tempRet0; //@line 1927
   $71 = $62; //@line 1928
   HEAP32[$71 >> 2] = $69; //@line 1930
   HEAP32[$71 + 4 >> 2] = $70; //@line 1933
   if ($70 >>> 0 < 0 | ($70 | 0) == 0 & $69 >>> 0 < $21 >>> 0) {
    $95 = $56; //@line 1940
    $96 = $57; //@line 1940
   } else {
    $80 = _i64Add($56 | 0, $57 | 0, 1, 0) | 0; //@line 1942
    $81 = tempRet0; //@line 1943
    $82 = _i64Subtract($69 | 0, $70 | 0, $21 | 0, 0) | 0; //@line 1944
    $84 = $62; //@line 1946
    HEAP32[$84 >> 2] = $82; //@line 1948
    HEAP32[$84 + 4 >> 2] = tempRet0; //@line 1951
    $95 = $80; //@line 1952
    $96 = $81; //@line 1952
   }
  }
  $88 = $2 + 48 | 0; //@line 1955
  $89 = $88; //@line 1956
  $97 = _i64Add(HEAP32[$89 >> 2] | 0, HEAP32[$89 + 4 >> 2] | 0, $95 | 0, $96 | 0) | 0; //@line 1962
  $99 = $88; //@line 1964
  HEAP32[$99 >> 2] = $97; //@line 1966
  HEAP32[$99 + 4 >> 2] = tempRet0; //@line 1969
 }
 $104 = HEAP32[$10 + 4 >> 2] | 0; //@line 1972
 if (!$104) {
  $195 = (HEAP32[$2 + 16 >> 2] | 0) + (HEAP32[$2 + 32 >> 2] | 0) & HEAP32[$2 + 12 >> 2]; //@line 1982
  $198 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 1985
  $AsyncCtx22 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1986
  FUNCTION_TABLE_vi[$198 & 255]($195); //@line 1987
  if (___async) {
   HEAP32[$AsyncCtx22 >> 2] = 70; //@line 1990
   sp = STACKTOP; //@line 1991
   return;
  } else {
   _emscripten_free_async_context($AsyncCtx22 | 0); //@line 1994
   return;
  }
 }
 $107 = $10 + 48 | 0; //@line 1999
 $109 = HEAP32[$107 >> 2] | 0; //@line 2001
 $112 = HEAP32[$107 + 4 >> 2] | 0; //@line 2004
 $113 = $104; //@line 2005
 $115 = HEAP32[$113 >> 2] | 0; //@line 2007
 $118 = HEAP32[$113 + 4 >> 2] | 0; //@line 2010
 if (!($118 >>> 0 > $112 >>> 0 | ($118 | 0) == ($112 | 0) & $115 >>> 0 > $109 >>> 0)) {
  $126 = HEAP32[(HEAP32[$0 >> 2] | 0) + 20 >> 2] | 0; //@line 2019
  $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2020
  FUNCTION_TABLE_v[$126 & 15](); //@line 2021
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 65; //@line 2024
   sp = STACKTOP; //@line 2025
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2028
  return;
 }
 $127 = _i64Subtract($115 | 0, $118 | 0, $109 | 0, $112 | 0) | 0; //@line 2031
 $128 = tempRet0; //@line 2032
 $130 = HEAP32[$10 + 16 >> 2] | 0; //@line 2034
 $132 = $10 + 24 | 0; //@line 2036
 $137 = HEAP32[$132 + 4 >> 2] | 0; //@line 2041
 L29 : do {
  if ($128 >>> 0 > $137 >>> 0 | (($128 | 0) == ($137 | 0) ? $127 >>> 0 > (HEAP32[$132 >> 2] | 0) >>> 0 : 0)) {
   $$0$i = $130; //@line 2049
  } else {
   $144 = HEAP32[$10 + 8 >> 2] | 0; //@line 2052
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
     $146 = _bitshift64Shl($127 | 0, $128 | 0, 15) | 0; //@line 2064
     $148 = ___udivdi3($146 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 2066
     $$0$i = $130 >>> 0 < $148 >>> 0 ? $130 : $148; //@line 2070
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
     $$0$i = $130 >>> 0 < $127 >>> 0 ? $130 : $127; //@line 2083
     break L29;
    }
   } while (0);
   $151 = ___muldi3($127 | 0, $128 | 0, $144 | 0, 0) | 0; //@line 2087
   $153 = ___udivdi3($151 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 2089
   $$0$i = $130 >>> 0 < $153 >>> 0 ? $130 : $153; //@line 2093
  }
 } while (0);
 $160 = (HEAP32[$11 >> 2] | 0) + $$0$i & HEAP32[$10 + 12 >> 2]; //@line 2100
 $161 = $2 + 32 | 0; //@line 2101
 $164 = HEAP32[$0 >> 2] | 0; //@line 2104
 if (($160 | 0) == (HEAP32[$161 >> 2] | 0)) {
  $166 = HEAP32[$164 + 20 >> 2] | 0; //@line 2107
  $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2108
  FUNCTION_TABLE_v[$166 & 15](); //@line 2109
  if (___async) {
   HEAP32[$AsyncCtx7 >> 2] = 66; //@line 2112
   sp = STACKTOP; //@line 2113
   return;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2116
  return;
 }
 $168 = HEAP32[$164 + 16 >> 2] | 0; //@line 2120
 $AsyncCtx11 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2121
 FUNCTION_TABLE_vi[$168 & 255]($160); //@line 2122
 if (___async) {
  HEAP32[$AsyncCtx11 >> 2] = 67; //@line 2125
  HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 2127
  HEAP32[$AsyncCtx11 + 8 >> 2] = $161; //@line 2129
  HEAP32[$AsyncCtx11 + 12 >> 2] = $160; //@line 2131
  sp = STACKTOP; //@line 2132
  return;
 }
 _emscripten_free_async_context($AsyncCtx11 | 0); //@line 2135
 $174 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 2138
 $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2139
 $175 = FUNCTION_TABLE_i[$174 & 3]() | 0; //@line 2140
 if (___async) {
  HEAP32[$AsyncCtx14 >> 2] = 68; //@line 2143
  HEAP32[$AsyncCtx14 + 4 >> 2] = $161; //@line 2145
  HEAP32[$AsyncCtx14 + 8 >> 2] = $160; //@line 2147
  HEAP32[$AsyncCtx14 + 12 >> 2] = $0; //@line 2149
  sp = STACKTOP; //@line 2150
  return;
 }
 _emscripten_free_async_context($AsyncCtx14 | 0); //@line 2153
 $179 = HEAP32[$161 >> 2] | 0; //@line 2154
 if ($160 >>> 0 > $179 >>> 0) {
  if (!($175 >>> 0 >= $160 >>> 0 | $175 >>> 0 < $179 >>> 0)) {
   return;
  }
 } else {
  if (!($175 >>> 0 >= $160 >>> 0 & $175 >>> 0 < $179 >>> 0)) {
   return;
  }
 }
 $187 = HEAP32[(HEAP32[$0 >> 2] | 0) + 20 >> 2] | 0; //@line 2173
 $AsyncCtx18 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2174
 FUNCTION_TABLE_v[$187 & 15](); //@line 2175
 if (___async) {
  HEAP32[$AsyncCtx18 >> 2] = 69; //@line 2178
  sp = STACKTOP; //@line 2179
  return;
 }
 _emscripten_free_async_context($AsyncCtx18 | 0); //@line 2182
 return;
}
function _schedule_interrupt__async_cb($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $102 = 0, $105 = 0, $107 = 0, $110 = 0, $111 = 0, $113 = 0, $116 = 0, $12 = 0, $124 = 0, $125 = 0, $126 = 0, $128 = 0, $130 = 0, $135 = 0, $142 = 0, $144 = 0, $146 = 0, $149 = 0, $151 = 0, $158 = 0, $159 = 0, $162 = 0, $164 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $177 = 0, $180 = 0, $19 = 0, $2 = 0, $20 = 0, $22 = 0, $23 = 0, $26 = 0, $27 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $44 = 0, $45 = 0, $46 = 0, $48 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $58 = 0, $60 = 0, $61 = 0, $67 = 0, $68 = 0, $69 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $82 = 0, $86 = 0, $87 = 0, $9 = 0, $93 = 0, $94 = 0, $95 = 0, $97 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3578
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3580
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3582
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3586
 $8 = HEAP32[HEAP32[$0 + 12 >> 2] >> 2] | 0; //@line 3587
 $9 = $8 + 32 | 0; //@line 3588
 if (($AsyncRetVal | 0) != (HEAP32[$9 >> 2] | 0)) {
  $12 = $2 + 32 | 0; //@line 3592
  $17 = $AsyncRetVal - (HEAP32[$12 >> 2] | 0) & HEAP32[$2 + 12 >> 2]; //@line 3597
  HEAP32[$12 >> 2] = $AsyncRetVal; //@line 3598
  $19 = HEAP32[$2 + 8 >> 2] | 0; //@line 3600
  L4 : do {
   if (($19 | 0) < 1e6) {
    switch ($19 | 0) {
    case 32768:
     {
      break;
     }
    default:
     {
      label = 6; //@line 3609
      break L4;
     }
    }
    $20 = ___muldi3($17 | 0, 0, 1e6, 0) | 0; //@line 3613
    $22 = _bitshift64Lshr($20 | 0, tempRet0 | 0, 15) | 0; //@line 3615
    $23 = tempRet0; //@line 3616
    $26 = $2 + 40 | 0; //@line 3619
    $27 = $26; //@line 3620
    $33 = _i64Add(HEAP32[$27 >> 2] | 0, HEAP32[$27 + 4 >> 2] | 0, $17 * 1e6 & 32704 | 0, 0) | 0; //@line 3626
    $34 = tempRet0; //@line 3627
    $35 = $26; //@line 3628
    HEAP32[$35 >> 2] = $33; //@line 3630
    HEAP32[$35 + 4 >> 2] = $34; //@line 3633
    if ($34 >>> 0 < 0 | ($34 | 0) == 0 & $33 >>> 0 < 32768) {
     $93 = $22; //@line 3640
     $94 = $23; //@line 3640
    } else {
     $44 = _i64Add($22 | 0, $23 | 0, 1, 0) | 0; //@line 3642
     $45 = tempRet0; //@line 3643
     $46 = _i64Add($33 | 0, $34 | 0, -32768, -1) | 0; //@line 3644
     $48 = $26; //@line 3646
     HEAP32[$48 >> 2] = $46; //@line 3648
     HEAP32[$48 + 4 >> 2] = tempRet0; //@line 3651
     $93 = $44; //@line 3652
     $94 = $45; //@line 3652
    }
   } else {
    switch ($19 | 0) {
    case 1e6:
     {
      $93 = $17; //@line 3657
      $94 = 0; //@line 3657
      break;
     }
    default:
     {
      label = 6; //@line 3661
     }
    }
   }
  } while (0);
  if ((label | 0) == 6) {
   $52 = ___muldi3($17 | 0, 0, 1e6, 0) | 0; //@line 3667
   $53 = tempRet0; //@line 3668
   $54 = ___udivdi3($52 | 0, $53 | 0, $19 | 0, 0) | 0; //@line 3669
   $55 = tempRet0; //@line 3670
   $56 = ___muldi3($54 | 0, $55 | 0, $19 | 0, 0) | 0; //@line 3671
   $58 = _i64Subtract($52 | 0, $53 | 0, $56 | 0, tempRet0 | 0) | 0; //@line 3673
   $60 = $2 + 40 | 0; //@line 3675
   $61 = $60; //@line 3676
   $67 = _i64Add($58 | 0, tempRet0 | 0, HEAP32[$61 >> 2] | 0, HEAP32[$61 + 4 >> 2] | 0) | 0; //@line 3682
   $68 = tempRet0; //@line 3683
   $69 = $60; //@line 3684
   HEAP32[$69 >> 2] = $67; //@line 3686
   HEAP32[$69 + 4 >> 2] = $68; //@line 3689
   if ($68 >>> 0 < 0 | ($68 | 0) == 0 & $67 >>> 0 < $19 >>> 0) {
    $93 = $54; //@line 3696
    $94 = $55; //@line 3696
   } else {
    $78 = _i64Add($54 | 0, $55 | 0, 1, 0) | 0; //@line 3698
    $79 = tempRet0; //@line 3699
    $80 = _i64Subtract($67 | 0, $68 | 0, $19 | 0, 0) | 0; //@line 3700
    $82 = $60; //@line 3702
    HEAP32[$82 >> 2] = $80; //@line 3704
    HEAP32[$82 + 4 >> 2] = tempRet0; //@line 3707
    $93 = $78; //@line 3708
    $94 = $79; //@line 3708
   }
  }
  $86 = $2 + 48 | 0; //@line 3711
  $87 = $86; //@line 3712
  $95 = _i64Add(HEAP32[$87 >> 2] | 0, HEAP32[$87 + 4 >> 2] | 0, $93 | 0, $94 | 0) | 0; //@line 3718
  $97 = $86; //@line 3720
  HEAP32[$97 >> 2] = $95; //@line 3722
  HEAP32[$97 + 4 >> 2] = tempRet0; //@line 3725
 }
 $102 = HEAP32[$8 + 4 >> 2] | 0; //@line 3728
 if (!$102) {
  $177 = (HEAP32[$2 + 16 >> 2] | 0) + (HEAP32[$2 + 32 >> 2] | 0) & HEAP32[$2 + 12 >> 2]; //@line 3738
  $180 = HEAP32[(HEAP32[$4 >> 2] | 0) + 16 >> 2] | 0; //@line 3741
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 3742
  FUNCTION_TABLE_vi[$180 & 255]($177); //@line 3743
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 70; //@line 3746
   sp = STACKTOP; //@line 3747
   return;
  }
  ___async_unwind = 0; //@line 3750
  HEAP32[$ReallocAsyncCtx7 >> 2] = 70; //@line 3751
  sp = STACKTOP; //@line 3752
  return;
 }
 $105 = $8 + 48 | 0; //@line 3756
 $107 = HEAP32[$105 >> 2] | 0; //@line 3758
 $110 = HEAP32[$105 + 4 >> 2] | 0; //@line 3761
 $111 = $102; //@line 3762
 $113 = HEAP32[$111 >> 2] | 0; //@line 3764
 $116 = HEAP32[$111 + 4 >> 2] | 0; //@line 3767
 if (!($116 >>> 0 > $110 >>> 0 | ($116 | 0) == ($110 | 0) & $113 >>> 0 > $107 >>> 0)) {
  $124 = HEAP32[(HEAP32[$4 >> 2] | 0) + 20 >> 2] | 0; //@line 3776
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 3777
  FUNCTION_TABLE_v[$124 & 15](); //@line 3778
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 65; //@line 3781
   sp = STACKTOP; //@line 3782
   return;
  }
  ___async_unwind = 0; //@line 3785
  HEAP32[$ReallocAsyncCtx2 >> 2] = 65; //@line 3786
  sp = STACKTOP; //@line 3787
  return;
 }
 $125 = _i64Subtract($113 | 0, $116 | 0, $107 | 0, $110 | 0) | 0; //@line 3790
 $126 = tempRet0; //@line 3791
 $128 = HEAP32[$8 + 16 >> 2] | 0; //@line 3793
 $130 = $8 + 24 | 0; //@line 3795
 $135 = HEAP32[$130 + 4 >> 2] | 0; //@line 3800
 L28 : do {
  if ($126 >>> 0 > $135 >>> 0 | (($126 | 0) == ($135 | 0) ? $125 >>> 0 > (HEAP32[$130 >> 2] | 0) >>> 0 : 0)) {
   $$0$i = $128; //@line 3808
  } else {
   $142 = HEAP32[$8 + 8 >> 2] | 0; //@line 3811
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
     $144 = _bitshift64Shl($125 | 0, $126 | 0, 15) | 0; //@line 3823
     $146 = ___udivdi3($144 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 3825
     $$0$i = $128 >>> 0 < $146 >>> 0 ? $128 : $146; //@line 3829
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
     $$0$i = $128 >>> 0 < $125 >>> 0 ? $128 : $125; //@line 3842
     break L28;
    }
   } while (0);
   $149 = ___muldi3($125 | 0, $126 | 0, $142 | 0, 0) | 0; //@line 3846
   $151 = ___udivdi3($149 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 3848
   $$0$i = $128 >>> 0 < $151 >>> 0 ? $128 : $151; //@line 3852
  }
 } while (0);
 $158 = (HEAP32[$9 >> 2] | 0) + $$0$i & HEAP32[$8 + 12 >> 2]; //@line 3859
 $159 = $2 + 32 | 0; //@line 3860
 $162 = HEAP32[$4 >> 2] | 0; //@line 3863
 if (($158 | 0) == (HEAP32[$159 >> 2] | 0)) {
  $164 = HEAP32[$162 + 20 >> 2] | 0; //@line 3866
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 3867
  FUNCTION_TABLE_v[$164 & 15](); //@line 3868
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 66; //@line 3871
   sp = STACKTOP; //@line 3872
   return;
  }
  ___async_unwind = 0; //@line 3875
  HEAP32[$ReallocAsyncCtx3 >> 2] = 66; //@line 3876
  sp = STACKTOP; //@line 3877
  return;
 } else {
  $166 = HEAP32[$162 + 16 >> 2] | 0; //@line 3881
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 3882
  FUNCTION_TABLE_vi[$166 & 255]($158); //@line 3883
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 67; //@line 3886
   $167 = $ReallocAsyncCtx4 + 4 | 0; //@line 3887
   HEAP32[$167 >> 2] = $4; //@line 3888
   $168 = $ReallocAsyncCtx4 + 8 | 0; //@line 3889
   HEAP32[$168 >> 2] = $159; //@line 3890
   $169 = $ReallocAsyncCtx4 + 12 | 0; //@line 3891
   HEAP32[$169 >> 2] = $158; //@line 3892
   sp = STACKTOP; //@line 3893
   return;
  }
  ___async_unwind = 0; //@line 3896
  HEAP32[$ReallocAsyncCtx4 >> 2] = 67; //@line 3897
  $167 = $ReallocAsyncCtx4 + 4 | 0; //@line 3898
  HEAP32[$167 >> 2] = $4; //@line 3899
  $168 = $ReallocAsyncCtx4 + 8 | 0; //@line 3900
  HEAP32[$168 >> 2] = $159; //@line 3901
  $169 = $ReallocAsyncCtx4 + 12 | 0; //@line 3902
  HEAP32[$169 >> 2] = $158; //@line 3903
  sp = STACKTOP; //@line 3904
  return;
 }
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2272
 STACKTOP = STACKTOP + 32 | 0; //@line 2273
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 2273
 $0 = sp; //@line 2274
 _gpio_init_out($0, 50); //@line 2275
 while (1) {
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2278
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2279
  _wait_ms(150); //@line 2280
  if (___async) {
   label = 3; //@line 2283
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 2286
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2288
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2289
  _wait_ms(150); //@line 2290
  if (___async) {
   label = 5; //@line 2293
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 2296
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2298
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2299
  _wait_ms(150); //@line 2300
  if (___async) {
   label = 7; //@line 2303
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 2306
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2308
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2309
  _wait_ms(150); //@line 2310
  if (___async) {
   label = 9; //@line 2313
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 2316
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2318
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2319
  _wait_ms(150); //@line 2320
  if (___async) {
   label = 11; //@line 2323
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 2326
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2328
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2329
  _wait_ms(150); //@line 2330
  if (___async) {
   label = 13; //@line 2333
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 2336
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2338
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2339
  _wait_ms(150); //@line 2340
  if (___async) {
   label = 15; //@line 2343
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 2346
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2348
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2349
  _wait_ms(150); //@line 2350
  if (___async) {
   label = 17; //@line 2353
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 2356
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2358
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2359
  _wait_ms(400); //@line 2360
  if (___async) {
   label = 19; //@line 2363
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 2366
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2368
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2369
  _wait_ms(400); //@line 2370
  if (___async) {
   label = 21; //@line 2373
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 2376
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2378
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2379
  _wait_ms(400); //@line 2380
  if (___async) {
   label = 23; //@line 2383
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 2386
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2388
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2389
  _wait_ms(400); //@line 2390
  if (___async) {
   label = 25; //@line 2393
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 2396
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2398
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2399
  _wait_ms(400); //@line 2400
  if (___async) {
   label = 27; //@line 2403
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 2406
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2408
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2409
  _wait_ms(400); //@line 2410
  if (___async) {
   label = 29; //@line 2413
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2416
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2418
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2419
  _wait_ms(400); //@line 2420
  if (___async) {
   label = 31; //@line 2423
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2426
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2428
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2429
  _wait_ms(400); //@line 2430
  if (___async) {
   label = 33; //@line 2433
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2436
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 73; //@line 2440
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 2442
   sp = STACKTOP; //@line 2443
   STACKTOP = sp; //@line 2444
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 74; //@line 2448
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 2450
   sp = STACKTOP; //@line 2451
   STACKTOP = sp; //@line 2452
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 75; //@line 2456
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 2458
   sp = STACKTOP; //@line 2459
   STACKTOP = sp; //@line 2460
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 76; //@line 2464
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 2466
   sp = STACKTOP; //@line 2467
   STACKTOP = sp; //@line 2468
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 77; //@line 2472
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 2474
   sp = STACKTOP; //@line 2475
   STACKTOP = sp; //@line 2476
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 78; //@line 2480
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 2482
   sp = STACKTOP; //@line 2483
   STACKTOP = sp; //@line 2484
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 79; //@line 2488
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 2490
   sp = STACKTOP; //@line 2491
   STACKTOP = sp; //@line 2492
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 80; //@line 2496
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 2498
   sp = STACKTOP; //@line 2499
   STACKTOP = sp; //@line 2500
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 81; //@line 2504
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 2506
   sp = STACKTOP; //@line 2507
   STACKTOP = sp; //@line 2508
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 82; //@line 2512
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 2514
   sp = STACKTOP; //@line 2515
   STACKTOP = sp; //@line 2516
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 83; //@line 2520
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 2522
   sp = STACKTOP; //@line 2523
   STACKTOP = sp; //@line 2524
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 84; //@line 2528
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 2530
   sp = STACKTOP; //@line 2531
   STACKTOP = sp; //@line 2532
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 85; //@line 2536
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 2538
   sp = STACKTOP; //@line 2539
   STACKTOP = sp; //@line 2540
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 86; //@line 2544
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 2546
   sp = STACKTOP; //@line 2547
   STACKTOP = sp; //@line 2548
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 87; //@line 2552
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2554
   sp = STACKTOP; //@line 2555
   STACKTOP = sp; //@line 2556
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 88; //@line 2560
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2562
   sp = STACKTOP; //@line 2563
   STACKTOP = sp; //@line 2564
   return;
  }
 }
}
function _main() {
 var $0 = 0, $1 = 0, $13 = 0, $17 = 0, $2 = 0, $22 = 0, $25 = 0, $29 = 0, $33 = 0, $37 = 0, $40 = 0, $43 = 0, $47 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx22 = 0, $AsyncCtx25 = 0, $AsyncCtx28 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 3203
 STACKTOP = STACKTOP + 48 | 0; //@line 3204
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 3204
 $0 = sp + 32 | 0; //@line 3205
 $1 = sp + 16 | 0; //@line 3206
 $2 = sp; //@line 3207
 $AsyncCtx19 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3208
 _puts(2494) | 0; //@line 3209
 if (___async) {
  HEAP32[$AsyncCtx19 >> 2] = 110; //@line 3212
  HEAP32[$AsyncCtx19 + 4 >> 2] = $2; //@line 3214
  HEAP32[$AsyncCtx19 + 8 >> 2] = $0; //@line 3216
  HEAP32[$AsyncCtx19 + 12 >> 2] = $1; //@line 3218
  sp = STACKTOP; //@line 3219
  STACKTOP = sp; //@line 3220
  return 0; //@line 3220
 }
 _emscripten_free_async_context($AsyncCtx19 | 0); //@line 3222
 $AsyncCtx15 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3223
 _puts(2507) | 0; //@line 3224
 if (___async) {
  HEAP32[$AsyncCtx15 >> 2] = 111; //@line 3227
  HEAP32[$AsyncCtx15 + 4 >> 2] = $2; //@line 3229
  HEAP32[$AsyncCtx15 + 8 >> 2] = $0; //@line 3231
  HEAP32[$AsyncCtx15 + 12 >> 2] = $1; //@line 3233
  sp = STACKTOP; //@line 3234
  STACKTOP = sp; //@line 3235
  return 0; //@line 3235
 }
 _emscripten_free_async_context($AsyncCtx15 | 0); //@line 3237
 $AsyncCtx11 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3238
 _puts(2610) | 0; //@line 3239
 if (___async) {
  HEAP32[$AsyncCtx11 >> 2] = 112; //@line 3242
  HEAP32[$AsyncCtx11 + 4 >> 2] = $2; //@line 3244
  HEAP32[$AsyncCtx11 + 8 >> 2] = $0; //@line 3246
  HEAP32[$AsyncCtx11 + 12 >> 2] = $1; //@line 3248
  sp = STACKTOP; //@line 3249
  STACKTOP = sp; //@line 3250
  return 0; //@line 3250
 }
 _emscripten_free_async_context($AsyncCtx11 | 0); //@line 3252
 $13 = $0 + 4 | 0; //@line 3254
 HEAP32[$13 >> 2] = 0; //@line 3256
 HEAP32[$13 + 4 >> 2] = 0; //@line 3259
 HEAP32[$0 >> 2] = 7; //@line 3260
 $17 = $0 + 12 | 0; //@line 3261
 HEAP32[$17 >> 2] = 504; //@line 3262
 $AsyncCtx25 = _emscripten_alloc_async_context(20, sp) | 0; //@line 3263
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5648, $0, 1.0); //@line 3264
 if (___async) {
  HEAP32[$AsyncCtx25 >> 2] = 113; //@line 3267
  HEAP32[$AsyncCtx25 + 4 >> 2] = $2; //@line 3269
  HEAP32[$AsyncCtx25 + 8 >> 2] = $1; //@line 3271
  HEAP32[$AsyncCtx25 + 12 >> 2] = $17; //@line 3273
  HEAP32[$AsyncCtx25 + 16 >> 2] = $0; //@line 3275
  sp = STACKTOP; //@line 3276
  STACKTOP = sp; //@line 3277
  return 0; //@line 3277
 }
 _emscripten_free_async_context($AsyncCtx25 | 0); //@line 3279
 $22 = HEAP32[$17 >> 2] | 0; //@line 3280
 do {
  if ($22 | 0) {
   $25 = HEAP32[$22 + 8 >> 2] | 0; //@line 3285
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 3286
   FUNCTION_TABLE_vi[$25 & 255]($0); //@line 3287
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 114; //@line 3290
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 3292
    HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 3294
    sp = STACKTOP; //@line 3295
    STACKTOP = sp; //@line 3296
    return 0; //@line 3296
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 3298
    break;
   }
  }
 } while (0);
 $29 = $1 + 4 | 0; //@line 3304
 HEAP32[$29 >> 2] = 0; //@line 3306
 HEAP32[$29 + 4 >> 2] = 0; //@line 3309
 HEAP32[$1 >> 2] = 8; //@line 3310
 $33 = $1 + 12 | 0; //@line 3311
 HEAP32[$33 >> 2] = 504; //@line 3312
 $AsyncCtx22 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3313
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5712, $1, 2.5); //@line 3314
 if (___async) {
  HEAP32[$AsyncCtx22 >> 2] = 115; //@line 3317
  HEAP32[$AsyncCtx22 + 4 >> 2] = $33; //@line 3319
  HEAP32[$AsyncCtx22 + 8 >> 2] = $2; //@line 3321
  HEAP32[$AsyncCtx22 + 12 >> 2] = $1; //@line 3323
  sp = STACKTOP; //@line 3324
  STACKTOP = sp; //@line 3325
  return 0; //@line 3325
 }
 _emscripten_free_async_context($AsyncCtx22 | 0); //@line 3327
 $37 = HEAP32[$33 >> 2] | 0; //@line 3328
 do {
  if ($37 | 0) {
   $40 = HEAP32[$37 + 8 >> 2] | 0; //@line 3333
   $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3334
   FUNCTION_TABLE_vi[$40 & 255]($1); //@line 3335
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 116; //@line 3338
    HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 3340
    sp = STACKTOP; //@line 3341
    STACKTOP = sp; //@line 3342
    return 0; //@line 3342
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3344
    break;
   }
  }
 } while (0);
 $43 = $2 + 4 | 0; //@line 3350
 HEAP32[$43 >> 2] = 0; //@line 3352
 HEAP32[$43 + 4 >> 2] = 0; //@line 3355
 HEAP32[$2 >> 2] = 9; //@line 3356
 $47 = $2 + 12 | 0; //@line 3357
 HEAP32[$47 >> 2] = 504; //@line 3358
 $AsyncCtx28 = _emscripten_alloc_async_context(12, sp) | 0; //@line 3359
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5864, $2); //@line 3360
 if (___async) {
  HEAP32[$AsyncCtx28 >> 2] = 117; //@line 3363
  HEAP32[$AsyncCtx28 + 4 >> 2] = $47; //@line 3365
  HEAP32[$AsyncCtx28 + 8 >> 2] = $2; //@line 3367
  sp = STACKTOP; //@line 3368
  STACKTOP = sp; //@line 3369
  return 0; //@line 3369
 }
 _emscripten_free_async_context($AsyncCtx28 | 0); //@line 3371
 $50 = HEAP32[$47 >> 2] | 0; //@line 3372
 do {
  if ($50 | 0) {
   $53 = HEAP32[$50 + 8 >> 2] | 0; //@line 3377
   $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3378
   FUNCTION_TABLE_vi[$53 & 255]($2); //@line 3379
   if (___async) {
    HEAP32[$AsyncCtx7 >> 2] = 118; //@line 3382
    sp = STACKTOP; //@line 3383
    STACKTOP = sp; //@line 3384
    return 0; //@line 3384
   } else {
    _emscripten_free_async_context($AsyncCtx7 | 0); //@line 3386
    break;
   }
  }
 } while (0);
 $AsyncCtx31 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3391
 _wait_ms(-1); //@line 3392
 if (___async) {
  HEAP32[$AsyncCtx31 >> 2] = 119; //@line 3395
  sp = STACKTOP; //@line 3396
  STACKTOP = sp; //@line 3397
  return 0; //@line 3397
 } else {
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 3399
  STACKTOP = sp; //@line 3400
  return 0; //@line 3400
 }
 return 0; //@line 3402
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0.0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $16 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $48 = 0, $6 = 0.0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4014
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4018
 $6 = +HEAPF32[$0 + 12 >> 2]; //@line 4020
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4022
 $9 = $4 + 12 | 0; //@line 4024
 HEAP32[$9 >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 4025
 $10 = $6 * 1.0e6; //@line 4026
 $11 = ~~$10 >>> 0; //@line 4027
 $12 = +Math_abs($10) >= 1.0 ? $10 > 0.0 ? ~~+Math_min(+Math_floor($10 / 4294967296.0), 4294967295.0) >>> 0 : ~~+Math_ceil(($10 - +(~~$10 >>> 0)) / 4294967296.0) >>> 0 : 0; //@line 4028
 $13 = $8 + 40 | 0; //@line 4029
 do {
  if (($13 | 0) != ($4 | 0)) {
   $15 = $8 + 52 | 0; //@line 4033
   $16 = HEAP32[$15 >> 2] | 0; //@line 4034
   if ($16 | 0) {
    $19 = HEAP32[$16 + 8 >> 2] | 0; //@line 4038
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 4039
    FUNCTION_TABLE_vi[$19 & 255]($13); //@line 4040
    if (___async) {
     HEAP32[$ReallocAsyncCtx2 >> 2] = 121; //@line 4043
     $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 4044
     HEAP32[$20 >> 2] = $9; //@line 4045
     $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 4046
     HEAP32[$21 >> 2] = $15; //@line 4047
     $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 4048
     HEAP32[$22 >> 2] = $13; //@line 4049
     $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 4050
     HEAP32[$23 >> 2] = $4; //@line 4051
     $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 4052
     HEAP32[$24 >> 2] = $9; //@line 4053
     $25 = $ReallocAsyncCtx2 + 24 | 0; //@line 4054
     HEAP32[$25 >> 2] = $8; //@line 4055
     $26 = $ReallocAsyncCtx2 + 32 | 0; //@line 4056
     $27 = $26; //@line 4057
     $28 = $27; //@line 4058
     HEAP32[$28 >> 2] = $11; //@line 4059
     $29 = $27 + 4 | 0; //@line 4060
     $30 = $29; //@line 4061
     HEAP32[$30 >> 2] = $12; //@line 4062
     sp = STACKTOP; //@line 4063
     return;
    }
    ___async_unwind = 0; //@line 4066
    HEAP32[$ReallocAsyncCtx2 >> 2] = 121; //@line 4067
    $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 4068
    HEAP32[$20 >> 2] = $9; //@line 4069
    $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 4070
    HEAP32[$21 >> 2] = $15; //@line 4071
    $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 4072
    HEAP32[$22 >> 2] = $13; //@line 4073
    $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 4074
    HEAP32[$23 >> 2] = $4; //@line 4075
    $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 4076
    HEAP32[$24 >> 2] = $9; //@line 4077
    $25 = $ReallocAsyncCtx2 + 24 | 0; //@line 4078
    HEAP32[$25 >> 2] = $8; //@line 4079
    $26 = $ReallocAsyncCtx2 + 32 | 0; //@line 4080
    $27 = $26; //@line 4081
    $28 = $27; //@line 4082
    HEAP32[$28 >> 2] = $11; //@line 4083
    $29 = $27 + 4 | 0; //@line 4084
    $30 = $29; //@line 4085
    HEAP32[$30 >> 2] = $12; //@line 4086
    sp = STACKTOP; //@line 4087
    return;
   }
   $31 = HEAP32[$9 >> 2] | 0; //@line 4090
   if (!$31) {
    HEAP32[$15 >> 2] = 0; //@line 4093
    break;
   }
   $34 = HEAP32[$31 + 4 >> 2] | 0; //@line 4097
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 4098
   FUNCTION_TABLE_vii[$34 & 3]($13, $4); //@line 4099
   if (___async) {
    HEAP32[$ReallocAsyncCtx3 >> 2] = 122; //@line 4102
    $35 = $ReallocAsyncCtx3 + 4 | 0; //@line 4103
    HEAP32[$35 >> 2] = $9; //@line 4104
    $36 = $ReallocAsyncCtx3 + 8 | 0; //@line 4105
    HEAP32[$36 >> 2] = $15; //@line 4106
    $37 = $ReallocAsyncCtx3 + 12 | 0; //@line 4107
    HEAP32[$37 >> 2] = $8; //@line 4108
    $38 = $ReallocAsyncCtx3 + 16 | 0; //@line 4109
    $39 = $38; //@line 4110
    $40 = $39; //@line 4111
    HEAP32[$40 >> 2] = $11; //@line 4112
    $41 = $39 + 4 | 0; //@line 4113
    $42 = $41; //@line 4114
    HEAP32[$42 >> 2] = $12; //@line 4115
    $43 = $ReallocAsyncCtx3 + 24 | 0; //@line 4116
    HEAP32[$43 >> 2] = $9; //@line 4117
    $44 = $ReallocAsyncCtx3 + 28 | 0; //@line 4118
    HEAP32[$44 >> 2] = $4; //@line 4119
    sp = STACKTOP; //@line 4120
    return;
   }
   ___async_unwind = 0; //@line 4123
   HEAP32[$ReallocAsyncCtx3 >> 2] = 122; //@line 4124
   $35 = $ReallocAsyncCtx3 + 4 | 0; //@line 4125
   HEAP32[$35 >> 2] = $9; //@line 4126
   $36 = $ReallocAsyncCtx3 + 8 | 0; //@line 4127
   HEAP32[$36 >> 2] = $15; //@line 4128
   $37 = $ReallocAsyncCtx3 + 12 | 0; //@line 4129
   HEAP32[$37 >> 2] = $8; //@line 4130
   $38 = $ReallocAsyncCtx3 + 16 | 0; //@line 4131
   $39 = $38; //@line 4132
   $40 = $39; //@line 4133
   HEAP32[$40 >> 2] = $11; //@line 4134
   $41 = $39 + 4 | 0; //@line 4135
   $42 = $41; //@line 4136
   HEAP32[$42 >> 2] = $12; //@line 4137
   $43 = $ReallocAsyncCtx3 + 24 | 0; //@line 4138
   HEAP32[$43 >> 2] = $9; //@line 4139
   $44 = $ReallocAsyncCtx3 + 28 | 0; //@line 4140
   HEAP32[$44 >> 2] = $4; //@line 4141
   sp = STACKTOP; //@line 4142
   return;
  }
 } while (0);
 __ZN4mbed6Ticker5setupEy($8, $11, $12); //@line 4146
 $45 = HEAP32[$9 >> 2] | 0; //@line 4147
 if (!$45) {
  return;
 }
 $48 = HEAP32[$45 + 8 >> 2] | 0; //@line 4153
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 4154
 FUNCTION_TABLE_vi[$48 & 255]($4); //@line 4155
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 123; //@line 4158
  sp = STACKTOP; //@line 4159
  return;
 }
 ___async_unwind = 0; //@line 4162
 HEAP32[$ReallocAsyncCtx4 >> 2] = 123; //@line 4163
 sp = STACKTOP; //@line 4164
 return;
}
function _initialize__async_cb_77($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $27 = 0, $29 = 0, $30 = 0, $31 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 4641
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4643
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4645
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4647
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4649
 $8 = HEAP32[$AsyncRetVal >> 2] | 0; //@line 4650
 if (!$8) {
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(20) | 0; //@line 4653
  _mbed_assert_internal(1815, 1817, 41); //@line 4654
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 59; //@line 4657
   $10 = $ReallocAsyncCtx7 + 4 | 0; //@line 4658
   HEAP32[$10 >> 2] = $2; //@line 4659
   $11 = $ReallocAsyncCtx7 + 8 | 0; //@line 4660
   HEAP32[$11 >> 2] = $6; //@line 4661
   $12 = $ReallocAsyncCtx7 + 12 | 0; //@line 4662
   HEAP32[$12 >> 2] = $4; //@line 4663
   $13 = $ReallocAsyncCtx7 + 16 | 0; //@line 4664
   HEAP32[$13 >> 2] = $AsyncRetVal; //@line 4665
   sp = STACKTOP; //@line 4666
   return;
  }
  ___async_unwind = 0; //@line 4669
  HEAP32[$ReallocAsyncCtx7 >> 2] = 59; //@line 4670
  $10 = $ReallocAsyncCtx7 + 4 | 0; //@line 4671
  HEAP32[$10 >> 2] = $2; //@line 4672
  $11 = $ReallocAsyncCtx7 + 8 | 0; //@line 4673
  HEAP32[$11 >> 2] = $6; //@line 4674
  $12 = $ReallocAsyncCtx7 + 12 | 0; //@line 4675
  HEAP32[$12 >> 2] = $4; //@line 4676
  $13 = $ReallocAsyncCtx7 + 16 | 0; //@line 4677
  HEAP32[$13 >> 2] = $AsyncRetVal; //@line 4678
  sp = STACKTOP; //@line 4679
  return;
 }
 $15 = HEAP32[$AsyncRetVal + 4 >> 2] | 0; //@line 4683
 if (($15 + -4 | 0) >>> 0 > 28) {
  $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 4687
  _mbed_assert_internal(1815, 1817, 47); //@line 4688
  if (___async) {
   HEAP32[$ReallocAsyncCtx6 >> 2] = 60; //@line 4691
   $17 = $ReallocAsyncCtx6 + 4 | 0; //@line 4692
   HEAP32[$17 >> 2] = $8; //@line 4693
   $18 = $ReallocAsyncCtx6 + 8 | 0; //@line 4694
   HEAP32[$18 >> 2] = $2; //@line 4695
   $19 = $ReallocAsyncCtx6 + 12 | 0; //@line 4696
   HEAP32[$19 >> 2] = $4; //@line 4697
   $20 = $ReallocAsyncCtx6 + 16 | 0; //@line 4698
   HEAP32[$20 >> 2] = $6; //@line 4699
   sp = STACKTOP; //@line 4700
   return;
  }
  ___async_unwind = 0; //@line 4703
  HEAP32[$ReallocAsyncCtx6 >> 2] = 60; //@line 4704
  $17 = $ReallocAsyncCtx6 + 4 | 0; //@line 4705
  HEAP32[$17 >> 2] = $8; //@line 4706
  $18 = $ReallocAsyncCtx6 + 8 | 0; //@line 4707
  HEAP32[$18 >> 2] = $2; //@line 4708
  $19 = $ReallocAsyncCtx6 + 12 | 0; //@line 4709
  HEAP32[$19 >> 2] = $4; //@line 4710
  $20 = $ReallocAsyncCtx6 + 16 | 0; //@line 4711
  HEAP32[$20 >> 2] = $6; //@line 4712
  sp = STACKTOP; //@line 4713
  return;
 } else {
  $22 = 7 << $15 + -4; //@line 4717
  $23 = ___muldi3($22 | 0, 0, 1e6, 0) | 0; //@line 4718
  $24 = tempRet0; //@line 4719
  $25 = _i64Add($8 | 0, 0, -1, -1) | 0; //@line 4720
  $27 = _i64Add($25 | 0, tempRet0 | 0, $23 | 0, $24 | 0) | 0; //@line 4722
  $29 = ___udivdi3($27 | 0, tempRet0 | 0, $8 | 0, 0) | 0; //@line 4724
  $30 = tempRet0; //@line 4725
  $31 = HEAP32[$2 >> 2] | 0; //@line 4726
  HEAP32[$31 >> 2] = 0; //@line 4727
  HEAP32[$31 + 4 >> 2] = 0; //@line 4729
  $35 = HEAP32[(HEAP32[$4 >> 2] | 0) + 4 >> 2] | 0; //@line 4732
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 4733
  $36 = FUNCTION_TABLE_i[$35 & 3]() | 0; //@line 4734
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 61; //@line 4737
   $37 = $ReallocAsyncCtx3 + 4 | 0; //@line 4738
   HEAP32[$37 >> 2] = $2; //@line 4739
   $38 = $ReallocAsyncCtx3 + 8 | 0; //@line 4740
   HEAP32[$38 >> 2] = $8; //@line 4741
   $39 = $ReallocAsyncCtx3 + 12 | 0; //@line 4742
   HEAP32[$39 >> 2] = $15; //@line 4743
   $40 = $ReallocAsyncCtx3 + 16 | 0; //@line 4744
   HEAP32[$40 >> 2] = $22; //@line 4745
   $41 = $ReallocAsyncCtx3 + 24 | 0; //@line 4746
   $42 = $41; //@line 4747
   $43 = $42; //@line 4748
   HEAP32[$43 >> 2] = $29; //@line 4749
   $44 = $42 + 4 | 0; //@line 4750
   $45 = $44; //@line 4751
   HEAP32[$45 >> 2] = $30; //@line 4752
   $46 = $ReallocAsyncCtx3 + 32 | 0; //@line 4753
   HEAP32[$46 >> 2] = $4; //@line 4754
   $47 = $ReallocAsyncCtx3 + 36 | 0; //@line 4755
   HEAP32[$47 >> 2] = $6; //@line 4756
   sp = STACKTOP; //@line 4757
   return;
  }
  HEAP32[___async_retval >> 2] = $36; //@line 4761
  ___async_unwind = 0; //@line 4762
  HEAP32[$ReallocAsyncCtx3 >> 2] = 61; //@line 4763
  $37 = $ReallocAsyncCtx3 + 4 | 0; //@line 4764
  HEAP32[$37 >> 2] = $2; //@line 4765
  $38 = $ReallocAsyncCtx3 + 8 | 0; //@line 4766
  HEAP32[$38 >> 2] = $8; //@line 4767
  $39 = $ReallocAsyncCtx3 + 12 | 0; //@line 4768
  HEAP32[$39 >> 2] = $15; //@line 4769
  $40 = $ReallocAsyncCtx3 + 16 | 0; //@line 4770
  HEAP32[$40 >> 2] = $22; //@line 4771
  $41 = $ReallocAsyncCtx3 + 24 | 0; //@line 4772
  $42 = $41; //@line 4773
  $43 = $42; //@line 4774
  HEAP32[$43 >> 2] = $29; //@line 4775
  $44 = $42 + 4 | 0; //@line 4776
  $45 = $44; //@line 4777
  HEAP32[$45 >> 2] = $30; //@line 4778
  $46 = $ReallocAsyncCtx3 + 32 | 0; //@line 4779
  HEAP32[$46 >> 2] = $4; //@line 4780
  $47 = $ReallocAsyncCtx3 + 36 | 0; //@line 4781
  HEAP32[$47 >> 2] = $6; //@line 4782
  sp = STACKTOP; //@line 4783
  return;
 }
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
      HEAP32[$AsyncCtx >> 2] = 28; //@line 347
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
      HEAP32[$AsyncCtx2 >> 2] = 29; //@line 383
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
     HEAP32[$AsyncCtx5 >> 2] = 30; //@line 421
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
      HEAP32[$AsyncCtx8 >> 2] = 31; //@line 446
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
      HEAP32[$AsyncCtx11 >> 2] = 32; //@line 472
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
 var $$10 = 0, $$3147168 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $10 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $24 = 0, $28 = 0, $32 = 0, $36 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $54 = 0, $56 = 0, $6 = 0, $67 = 0, $68 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 794
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 796
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 798
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 800
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 802
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 804
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 810
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 812
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 814
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 818
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 822
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 826
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 830
 $40 = HEAP8[$0 + 80 >> 0] & 1; //@line 835
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 837
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 839
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 841
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 843
 HEAP32[$6 >> 2] = HEAP32[___async_retval >> 2]; //@line 846
 $50 = _snprintf($8, $10, 1732, $6) | 0; //@line 847
 $$10 = ($50 | 0) >= ($10 | 0) ? 0 : $50; //@line 849
 $53 = $8 + $$10 | 0; //@line 851
 $54 = $10 - $$10 | 0; //@line 852
 if (($$10 | 0) > 0) {
  if (($54 | 0) > 0) {
   $$3147168 = $54; //@line 856
   $$3169 = $53; //@line 856
   label = 4; //@line 857
  }
 } else {
  $$3147168 = $10; //@line 860
  $$3169 = $8; //@line 860
  label = 4; //@line 861
 }
 if ((label | 0) == 4) {
  $56 = $16 + -2 | 0; //@line 864
  switch ($56 >>> 1 | $56 << 31 | 0) {
  case 0:
   {
    HEAP32[$24 >> 2] = $20; //@line 870
    $$5156 = _snprintf($$3169, $$3147168, 1735, $24) | 0; //@line 872
    break;
   }
  case 1:
   {
    HEAP32[$18 >> 2] = $20; //@line 876
    $$5156 = _snprintf($$3169, $$3147168, 1750, $18) | 0; //@line 878
    break;
   }
  case 3:
   {
    HEAP32[$32 >> 2] = $20; //@line 882
    $$5156 = _snprintf($$3169, $$3147168, 1765, $32) | 0; //@line 884
    break;
   }
  case 7:
   {
    HEAP32[$36 >> 2] = $20; //@line 888
    $$5156 = _snprintf($$3169, $$3147168, 1780, $36) | 0; //@line 890
    break;
   }
  default:
   {
    $$5156 = _snprintf($$3169, $$3147168, 1795, $28) | 0; //@line 895
   }
  }
  $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 899
  $67 = $$3169 + $$5156$ | 0; //@line 901
  $68 = $$3147168 - $$5156$ | 0; //@line 902
  if (($$5156$ | 0) > 0 & ($68 | 0) > 0) {
   $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 906
   $70 = _vsnprintf($67, $68, $42, $44) | 0; //@line 907
   if (___async) {
    HEAP32[$ReallocAsyncCtx10 >> 2] = 51; //@line 910
    $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 911
    HEAP32[$71 >> 2] = $2; //@line 912
    $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 913
    HEAP32[$72 >> 2] = $4; //@line 914
    $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 915
    $$expand_i1_val = $40 & 1; //@line 916
    HEAP8[$73 >> 0] = $$expand_i1_val; //@line 917
    $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 918
    HEAP32[$74 >> 2] = $46; //@line 919
    $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 920
    HEAP32[$75 >> 2] = $48; //@line 921
    $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 922
    HEAP32[$76 >> 2] = $68; //@line 923
    $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 924
    HEAP32[$77 >> 2] = $67; //@line 925
    sp = STACKTOP; //@line 926
    return;
   }
   HEAP32[___async_retval >> 2] = $70; //@line 930
   ___async_unwind = 0; //@line 931
   HEAP32[$ReallocAsyncCtx10 >> 2] = 51; //@line 932
   $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 933
   HEAP32[$71 >> 2] = $2; //@line 934
   $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 935
   HEAP32[$72 >> 2] = $4; //@line 936
   $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 937
   $$expand_i1_val = $40 & 1; //@line 938
   HEAP8[$73 >> 0] = $$expand_i1_val; //@line 939
   $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 940
   HEAP32[$74 >> 2] = $46; //@line 941
   $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 942
   HEAP32[$75 >> 2] = $48; //@line 943
   $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 944
   HEAP32[$76 >> 2] = $68; //@line 945
   $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 946
   HEAP32[$77 >> 2] = $67; //@line 947
   sp = STACKTOP; //@line 948
   return;
  }
 }
 $79 = HEAP32[107] | 0; //@line 952
 $80 = HEAP32[100] | 0; //@line 953
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 954
 FUNCTION_TABLE_vi[$79 & 255]($80); //@line 955
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 53; //@line 958
  sp = STACKTOP; //@line 959
  return;
 }
 ___async_unwind = 0; //@line 962
 HEAP32[$ReallocAsyncCtx7 >> 2] = 53; //@line 963
 sp = STACKTOP; //@line 964
 return;
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = +$2;
 var $13 = 0, $14 = 0, $15 = 0.0, $16 = 0, $17 = 0, $18 = 0, $20 = 0, $21 = 0, $24 = 0, $3 = 0, $32 = 0, $36 = 0, $39 = 0, $4 = 0, $44 = 0, $5 = 0, $50 = 0, $51 = 0, $54 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 3412
 STACKTOP = STACKTOP + 16 | 0; //@line 3413
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3413
 $3 = sp; //@line 3414
 $4 = $1 + 12 | 0; //@line 3415
 $5 = HEAP32[$4 >> 2] | 0; //@line 3416
 do {
  if (!$5) {
   $14 = 0; //@line 3420
  } else {
   $8 = HEAP32[$5 + 4 >> 2] | 0; //@line 3423
   $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 3424
   FUNCTION_TABLE_vii[$8 & 3]($3, $1); //@line 3425
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 120; //@line 3428
    HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 3430
    HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 3432
    HEAPF32[$AsyncCtx + 12 >> 2] = $2; //@line 3434
    HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 3436
    sp = STACKTOP; //@line 3437
    STACKTOP = sp; //@line 3438
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 3440
    $14 = HEAP32[$4 >> 2] | 0; //@line 3442
    break;
   }
  }
 } while (0);
 $13 = $3 + 12 | 0; //@line 3447
 HEAP32[$13 >> 2] = $14; //@line 3448
 $15 = $2 * 1.0e6; //@line 3449
 $16 = ~~$15 >>> 0; //@line 3450
 $17 = +Math_abs($15) >= 1.0 ? $15 > 0.0 ? ~~+Math_min(+Math_floor($15 / 4294967296.0), 4294967295.0) >>> 0 : ~~+Math_ceil(($15 - +(~~$15 >>> 0)) / 4294967296.0) >>> 0 : 0; //@line 3451
 $18 = $0 + 40 | 0; //@line 3452
 if (($18 | 0) != ($3 | 0)) {
  $20 = $0 + 52 | 0; //@line 3455
  $21 = HEAP32[$20 >> 2] | 0; //@line 3456
  do {
   if ($21 | 0) {
    $24 = HEAP32[$21 + 8 >> 2] | 0; //@line 3461
    $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3462
    FUNCTION_TABLE_vi[$24 & 255]($18); //@line 3463
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 121; //@line 3466
     HEAP32[$AsyncCtx3 + 4 >> 2] = $13; //@line 3468
     HEAP32[$AsyncCtx3 + 8 >> 2] = $20; //@line 3470
     HEAP32[$AsyncCtx3 + 12 >> 2] = $18; //@line 3472
     HEAP32[$AsyncCtx3 + 16 >> 2] = $3; //@line 3474
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 3476
     HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 3478
     $32 = $AsyncCtx3 + 32 | 0; //@line 3480
     HEAP32[$32 >> 2] = $16; //@line 3482
     HEAP32[$32 + 4 >> 2] = $17; //@line 3485
     sp = STACKTOP; //@line 3486
     STACKTOP = sp; //@line 3487
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3489
     break;
    }
   }
  } while (0);
  $36 = HEAP32[$13 >> 2] | 0; //@line 3494
  do {
   if (!$36) {
    $50 = 0; //@line 3498
   } else {
    $39 = HEAP32[$36 + 4 >> 2] | 0; //@line 3501
    $AsyncCtx6 = _emscripten_alloc_async_context(32, sp) | 0; //@line 3502
    FUNCTION_TABLE_vii[$39 & 3]($18, $3); //@line 3503
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 122; //@line 3506
     HEAP32[$AsyncCtx6 + 4 >> 2] = $13; //@line 3508
     HEAP32[$AsyncCtx6 + 8 >> 2] = $20; //@line 3510
     HEAP32[$AsyncCtx6 + 12 >> 2] = $0; //@line 3512
     $44 = $AsyncCtx6 + 16 | 0; //@line 3514
     HEAP32[$44 >> 2] = $16; //@line 3516
     HEAP32[$44 + 4 >> 2] = $17; //@line 3519
     HEAP32[$AsyncCtx6 + 24 >> 2] = $13; //@line 3521
     HEAP32[$AsyncCtx6 + 28 >> 2] = $3; //@line 3523
     sp = STACKTOP; //@line 3524
     STACKTOP = sp; //@line 3525
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 3527
     $50 = HEAP32[$13 >> 2] | 0; //@line 3529
     break;
    }
   }
  } while (0);
  HEAP32[$20 >> 2] = $50; //@line 3534
 }
 __ZN4mbed6Ticker5setupEy($0, $16, $17); //@line 3536
 $51 = HEAP32[$13 >> 2] | 0; //@line 3537
 if (!$51) {
  STACKTOP = sp; //@line 3540
  return;
 }
 $54 = HEAP32[$51 + 8 >> 2] | 0; //@line 3543
 $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3544
 FUNCTION_TABLE_vi[$54 & 255]($3); //@line 3545
 if (___async) {
  HEAP32[$AsyncCtx10 >> 2] = 123; //@line 3548
  sp = STACKTOP; //@line 3549
  STACKTOP = sp; //@line 3550
  return;
 }
 _emscripten_free_async_context($AsyncCtx10 | 0); //@line 3552
 STACKTOP = sp; //@line 3553
 return;
}
function _initialize__async_cb_82($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $25 = 0, $26 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $6 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 5163
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5165
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5167
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5169
 $10 = HEAP32[(HEAP32[$0 + 16 >> 2] | 0) + 4 >> 2] | 0; //@line 5173
 if (($10 + -4 | 0) >>> 0 > 28) {
  $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 5177
  _mbed_assert_internal(1815, 1817, 47); //@line 5178
  if (___async) {
   HEAP32[$ReallocAsyncCtx6 >> 2] = 60; //@line 5181
   $12 = $ReallocAsyncCtx6 + 4 | 0; //@line 5182
   HEAP32[$12 >> 2] = 1e6; //@line 5183
   $13 = $ReallocAsyncCtx6 + 8 | 0; //@line 5184
   HEAP32[$13 >> 2] = $2; //@line 5185
   $14 = $ReallocAsyncCtx6 + 12 | 0; //@line 5186
   HEAP32[$14 >> 2] = $6; //@line 5187
   $15 = $ReallocAsyncCtx6 + 16 | 0; //@line 5188
   HEAP32[$15 >> 2] = $4; //@line 5189
   sp = STACKTOP; //@line 5190
   return;
  }
  ___async_unwind = 0; //@line 5193
  HEAP32[$ReallocAsyncCtx6 >> 2] = 60; //@line 5194
  $12 = $ReallocAsyncCtx6 + 4 | 0; //@line 5195
  HEAP32[$12 >> 2] = 1e6; //@line 5196
  $13 = $ReallocAsyncCtx6 + 8 | 0; //@line 5197
  HEAP32[$13 >> 2] = $2; //@line 5198
  $14 = $ReallocAsyncCtx6 + 12 | 0; //@line 5199
  HEAP32[$14 >> 2] = $6; //@line 5200
  $15 = $ReallocAsyncCtx6 + 16 | 0; //@line 5201
  HEAP32[$15 >> 2] = $4; //@line 5202
  sp = STACKTOP; //@line 5203
  return;
 } else {
  $17 = 7 << $10 + -4; //@line 5207
  $18 = ___muldi3($17 | 0, 0, 1e6, 0) | 0; //@line 5208
  $19 = tempRet0; //@line 5209
  $20 = _i64Add(1e6, 0, -1, -1) | 0; //@line 5210
  $22 = _i64Add($20 | 0, tempRet0 | 0, $18 | 0, $19 | 0) | 0; //@line 5212
  $24 = ___udivdi3($22 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 5214
  $25 = tempRet0; //@line 5215
  $26 = HEAP32[$2 >> 2] | 0; //@line 5216
  HEAP32[$26 >> 2] = 0; //@line 5217
  HEAP32[$26 + 4 >> 2] = 0; //@line 5219
  $30 = HEAP32[(HEAP32[$6 >> 2] | 0) + 4 >> 2] | 0; //@line 5222
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 5223
  $31 = FUNCTION_TABLE_i[$30 & 3]() | 0; //@line 5224
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 61; //@line 5227
   $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 5228
   HEAP32[$32 >> 2] = $2; //@line 5229
   $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 5230
   HEAP32[$33 >> 2] = 1e6; //@line 5231
   $34 = $ReallocAsyncCtx3 + 12 | 0; //@line 5232
   HEAP32[$34 >> 2] = $10; //@line 5233
   $35 = $ReallocAsyncCtx3 + 16 | 0; //@line 5234
   HEAP32[$35 >> 2] = $17; //@line 5235
   $36 = $ReallocAsyncCtx3 + 24 | 0; //@line 5236
   $37 = $36; //@line 5237
   $38 = $37; //@line 5238
   HEAP32[$38 >> 2] = $24; //@line 5239
   $39 = $37 + 4 | 0; //@line 5240
   $40 = $39; //@line 5241
   HEAP32[$40 >> 2] = $25; //@line 5242
   $41 = $ReallocAsyncCtx3 + 32 | 0; //@line 5243
   HEAP32[$41 >> 2] = $6; //@line 5244
   $42 = $ReallocAsyncCtx3 + 36 | 0; //@line 5245
   HEAP32[$42 >> 2] = $4; //@line 5246
   sp = STACKTOP; //@line 5247
   return;
  }
  HEAP32[___async_retval >> 2] = $31; //@line 5251
  ___async_unwind = 0; //@line 5252
  HEAP32[$ReallocAsyncCtx3 >> 2] = 61; //@line 5253
  $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 5254
  HEAP32[$32 >> 2] = $2; //@line 5255
  $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 5256
  HEAP32[$33 >> 2] = 1e6; //@line 5257
  $34 = $ReallocAsyncCtx3 + 12 | 0; //@line 5258
  HEAP32[$34 >> 2] = $10; //@line 5259
  $35 = $ReallocAsyncCtx3 + 16 | 0; //@line 5260
  HEAP32[$35 >> 2] = $17; //@line 5261
  $36 = $ReallocAsyncCtx3 + 24 | 0; //@line 5262
  $37 = $36; //@line 5263
  $38 = $37; //@line 5264
  HEAP32[$38 >> 2] = $24; //@line 5265
  $39 = $37 + 4 | 0; //@line 5266
  $40 = $39; //@line 5267
  HEAP32[$40 >> 2] = $25; //@line 5268
  $41 = $ReallocAsyncCtx3 + 32 | 0; //@line 5269
  HEAP32[$41 >> 2] = $6; //@line 5270
  $42 = $ReallocAsyncCtx3 + 36 | 0; //@line 5271
  HEAP32[$42 >> 2] = $4; //@line 5272
  sp = STACKTOP; //@line 5273
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_62($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3365
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3367
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3369
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3371
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3373
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3375
 $12 = HEAP8[$0 + 24 >> 0] & 1; //@line 3378
 $14 = HEAP8[$0 + 25 >> 0] & 1; //@line 3381
 $16 = HEAP8[$0 + 26 >> 0] & 1; //@line 3384
 $18 = HEAP32[$0 + 28 >> 2] | 0; //@line 3386
 $20 = HEAP32[$0 + 32 >> 2] | 0; //@line 3388
 $22 = HEAP32[$0 + 36 >> 2] | 0; //@line 3390
 $24 = HEAP32[$0 + 40 >> 2] | 0; //@line 3392
 $26 = HEAP32[$0 + 44 >> 2] | 0; //@line 3394
 $28 = HEAP32[$0 + 48 >> 2] | 0; //@line 3396
 L2 : do {
  if (!(HEAP8[$22 >> 0] | 0)) {
   do {
    if (!(HEAP8[$6 >> 0] | 0)) {
     $$182$off0 = $16; //@line 3405
     $$186$off0 = $14; //@line 3405
    } else {
     if (!(HEAP8[$2 >> 0] | 0)) {
      if (!(HEAP32[$20 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $14; //@line 3414
       $$283$off0 = 1; //@line 3414
       label = 13; //@line 3415
       break L2;
      } else {
       $$182$off0 = 1; //@line 3418
       $$186$off0 = $14; //@line 3418
       break;
      }
     }
     if ((HEAP32[$4 >> 2] | 0) == 1) {
      label = 18; //@line 3425
      break L2;
     }
     if (!(HEAP32[$20 >> 2] & 2)) {
      label = 18; //@line 3432
      break L2;
     } else {
      $$182$off0 = 1; //@line 3435
      $$186$off0 = 1; //@line 3435
     }
    }
   } while (0);
   $30 = $18 + 8 | 0; //@line 3439
   if ($30 >>> 0 < $28 >>> 0) {
    HEAP8[$2 >> 0] = 0; //@line 3442
    HEAP8[$6 >> 0] = 0; //@line 3443
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(52) | 0; //@line 3444
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $8, $10, $10, 1, $12); //@line 3445
    if (!___async) {
     ___async_unwind = 0; //@line 3448
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 155; //@line 3450
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 3452
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 3454
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 3456
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 3458
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 3460
    HEAP8[$ReallocAsyncCtx5 + 24 >> 0] = $12 & 1; //@line 3463
    HEAP8[$ReallocAsyncCtx5 + 25 >> 0] = $$186$off0 & 1; //@line 3466
    HEAP8[$ReallocAsyncCtx5 + 26 >> 0] = $$182$off0 & 1; //@line 3469
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $30; //@line 3471
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $20; //@line 3473
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $22; //@line 3475
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $24; //@line 3477
    HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $26; //@line 3479
    HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $28; //@line 3481
    sp = STACKTOP; //@line 3482
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 3485
    $$283$off0 = $$182$off0; //@line 3485
    label = 13; //@line 3486
   }
  } else {
   $$085$off0$reg2mem$0 = $14; //@line 3489
   $$283$off0 = $16; //@line 3489
   label = 13; //@line 3490
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$24 >> 2] = $10; //@line 3496
    $59 = $8 + 40 | 0; //@line 3497
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 3500
    if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$4 >> 2] | 0) == 2) {
      HEAP8[$22 >> 0] = 1; //@line 3508
      if ($$283$off0) {
       label = 18; //@line 3510
       break;
      } else {
       $67 = 4; //@line 3513
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 3520
   } else {
    $67 = 4; //@line 3522
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 3527
 }
 HEAP32[$26 >> 2] = $67; //@line 3529
 return;
}
function _initialize__async_cb_79($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $23 = 0, $24 = 0, $25 = 0, $27 = 0, $28 = 0, $31 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $48 = 0, $49 = 0, $50 = 0, $52 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $62 = 0, $64 = 0, $70 = 0, $71 = 0, $72 = 0, $81 = 0, $82 = 0, $83 = 0, $85 = 0, $89 = 0, $95 = 0, $96 = 0, $97 = 0, $99 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4905
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4909
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4911
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4915
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4917
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4919
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4921
 if (($AsyncRetVal | 0) != (HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 32 >> 2] | 0)) {
  $23 = $AsyncRetVal - (HEAP32[$6 >> 2] | 0) & HEAP32[HEAP32[$0 + 16 >> 2] >> 2]; //@line 4930
  HEAP32[$6 >> 2] = $AsyncRetVal; //@line 4931
  $24 = HEAP32[$10 >> 2] | 0; //@line 4932
  L4 : do {
   if (($24 | 0) < 1e6) {
    switch ($24 | 0) {
    case 32768:
     {
      break;
     }
    default:
     {
      label = 6; //@line 4941
      break L4;
     }
    }
    $25 = ___muldi3($23 | 0, 0, 1e6, 0) | 0; //@line 4945
    $27 = _bitshift64Lshr($25 | 0, tempRet0 | 0, 15) | 0; //@line 4947
    $28 = tempRet0; //@line 4948
    $31 = $12; //@line 4951
    $37 = _i64Add(HEAP32[$31 >> 2] | 0, HEAP32[$31 + 4 >> 2] | 0, $23 * 1e6 & 32704 | 0, 0) | 0; //@line 4957
    $38 = tempRet0; //@line 4958
    $39 = $12; //@line 4959
    HEAP32[$39 >> 2] = $37; //@line 4961
    HEAP32[$39 + 4 >> 2] = $38; //@line 4964
    if ($38 >>> 0 < 0 | ($38 | 0) == 0 & $37 >>> 0 < 32768) {
     $95 = $27; //@line 4971
     $96 = $28; //@line 4971
    } else {
     $48 = _i64Add($27 | 0, $28 | 0, 1, 0) | 0; //@line 4973
     $49 = tempRet0; //@line 4974
     $50 = _i64Add($37 | 0, $38 | 0, -32768, -1) | 0; //@line 4975
     $52 = $12; //@line 4977
     HEAP32[$52 >> 2] = $50; //@line 4979
     HEAP32[$52 + 4 >> 2] = tempRet0; //@line 4982
     $95 = $48; //@line 4983
     $96 = $49; //@line 4983
    }
   } else {
    switch ($24 | 0) {
    case 1e6:
     {
      $95 = $23; //@line 4988
      $96 = 0; //@line 4988
      break;
     }
    default:
     {
      label = 6; //@line 4992
     }
    }
   }
  } while (0);
  if ((label | 0) == 6) {
   $56 = ___muldi3($23 | 0, 0, 1e6, 0) | 0; //@line 4998
   $57 = tempRet0; //@line 4999
   $58 = ___udivdi3($56 | 0, $57 | 0, $24 | 0, 0) | 0; //@line 5000
   $59 = tempRet0; //@line 5001
   $60 = ___muldi3($58 | 0, $59 | 0, $24 | 0, 0) | 0; //@line 5002
   $62 = _i64Subtract($56 | 0, $57 | 0, $60 | 0, tempRet0 | 0) | 0; //@line 5004
   $64 = $12; //@line 5006
   $70 = _i64Add($62 | 0, tempRet0 | 0, HEAP32[$64 >> 2] | 0, HEAP32[$64 + 4 >> 2] | 0) | 0; //@line 5012
   $71 = tempRet0; //@line 5013
   $72 = $12; //@line 5014
   HEAP32[$72 >> 2] = $70; //@line 5016
   HEAP32[$72 + 4 >> 2] = $71; //@line 5019
   if ($71 >>> 0 < 0 | ($71 | 0) == 0 & $70 >>> 0 < $24 >>> 0) {
    $95 = $58; //@line 5026
    $96 = $59; //@line 5026
   } else {
    $81 = _i64Add($58 | 0, $59 | 0, 1, 0) | 0; //@line 5028
    $82 = tempRet0; //@line 5029
    $83 = _i64Subtract($70 | 0, $71 | 0, $24 | 0, 0) | 0; //@line 5030
    $85 = $12; //@line 5032
    HEAP32[$85 >> 2] = $83; //@line 5034
    HEAP32[$85 + 4 >> 2] = tempRet0; //@line 5037
    $95 = $81; //@line 5038
    $96 = $82; //@line 5038
   }
  }
  $89 = $14; //@line 5041
  $97 = _i64Add(HEAP32[$89 >> 2] | 0, HEAP32[$89 + 4 >> 2] | 0, $95 | 0, $96 | 0) | 0; //@line 5047
  $99 = $14; //@line 5049
  HEAP32[$99 >> 2] = $97; //@line 5051
  HEAP32[$99 + 4 >> 2] = tempRet0; //@line 5054
 }
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(4) | 0; //@line 5056
 _schedule_interrupt($4); //@line 5057
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 63; //@line 5060
  sp = STACKTOP; //@line 5061
  return;
 }
 ___async_unwind = 0; //@line 5064
 HEAP32[$ReallocAsyncCtx5 >> 2] = 63; //@line 5065
 sp = STACKTOP; //@line 5066
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
 sp = STACKTOP; //@line 12680
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 12685
 } else {
  $9 = $1 + 52 | 0; //@line 12687
  $10 = HEAP8[$9 >> 0] | 0; //@line 12688
  $11 = $1 + 53 | 0; //@line 12689
  $12 = HEAP8[$11 >> 0] | 0; //@line 12690
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 12693
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 12694
  HEAP8[$9 >> 0] = 0; //@line 12695
  HEAP8[$11 >> 0] = 0; //@line 12696
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 12697
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 12698
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 153; //@line 12701
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 12703
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 12705
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 12707
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 12709
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 12711
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 12713
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 12715
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 12717
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 12719
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 12721
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 12724
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 12726
   sp = STACKTOP; //@line 12727
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12730
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 12735
    $32 = $0 + 8 | 0; //@line 12736
    $33 = $1 + 54 | 0; //@line 12737
    $$0 = $0 + 24 | 0; //@line 12738
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
     HEAP8[$9 >> 0] = 0; //@line 12771
     HEAP8[$11 >> 0] = 0; //@line 12772
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 12773
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 12774
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 12779
     $62 = $$0 + 8 | 0; //@line 12780
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 12783
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 154; //@line 12788
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 12790
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 12792
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 12794
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 12796
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 12798
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 12800
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 12802
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 12804
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 12806
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 12808
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 12810
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 12812
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 12814
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 12817
    sp = STACKTOP; //@line 12818
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 12822
  HEAP8[$11 >> 0] = $12; //@line 12823
 }
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_61($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3209
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3211
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3215
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3217
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3219
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3221
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 3224
 $15 = $2 + 24 | 0; //@line 3225
 do {
  if ((HEAP32[$0 + 8 >> 2] | 0) > 1) {
   $18 = HEAP32[$2 + 8 >> 2] | 0; //@line 3230
   if (!($18 & 2)) {
    $21 = $8 + 36 | 0; //@line 3234
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $8 + 54 | 0; //@line 3241
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 3252
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $8, $10, $12, $14); //@line 3253
      if (!___async) {
       ___async_unwind = 0; //@line 3256
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 159; //@line 3258
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 3260
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 3262
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 3264
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 3266
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 3268
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 3270
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $12; //@line 3272
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $14 & 1; //@line 3275
      sp = STACKTOP; //@line 3276
      return;
     }
     $36 = $8 + 24 | 0; //@line 3279
     $37 = $8 + 54 | 0; //@line 3280
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 3295
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $8, $10, $12, $14); //@line 3296
     if (!___async) {
      ___async_unwind = 0; //@line 3299
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 158; //@line 3301
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 3303
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 3305
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 3307
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 3309
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 3311
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $8; //@line 3313
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $10; //@line 3315
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $12; //@line 3317
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $14 & 1; //@line 3320
     sp = STACKTOP; //@line 3321
     return;
    }
   }
   $24 = $8 + 54 | 0; //@line 3325
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 3329
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $8, $10, $12, $14); //@line 3330
    if (!___async) {
     ___async_unwind = 0; //@line 3333
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 157; //@line 3335
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 3337
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $6; //@line 3339
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 3341
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 3343
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 3345
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 3347
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 3350
    sp = STACKTOP; //@line 3351
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9139
      $10 = HEAP32[$9 >> 2] | 0; //@line 9140
      HEAP32[$2 >> 2] = $9 + 4; //@line 9142
      HEAP32[$0 >> 2] = $10; //@line 9143
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9159
      $17 = HEAP32[$16 >> 2] | 0; //@line 9160
      HEAP32[$2 >> 2] = $16 + 4; //@line 9162
      $20 = $0; //@line 9165
      HEAP32[$20 >> 2] = $17; //@line 9167
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 9170
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9186
      $30 = HEAP32[$29 >> 2] | 0; //@line 9187
      HEAP32[$2 >> 2] = $29 + 4; //@line 9189
      $31 = $0; //@line 9190
      HEAP32[$31 >> 2] = $30; //@line 9192
      HEAP32[$31 + 4 >> 2] = 0; //@line 9195
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9211
      $41 = $40; //@line 9212
      $43 = HEAP32[$41 >> 2] | 0; //@line 9214
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 9217
      HEAP32[$2 >> 2] = $40 + 8; //@line 9219
      $47 = $0; //@line 9220
      HEAP32[$47 >> 2] = $43; //@line 9222
      HEAP32[$47 + 4 >> 2] = $46; //@line 9225
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9241
      $57 = HEAP32[$56 >> 2] | 0; //@line 9242
      HEAP32[$2 >> 2] = $56 + 4; //@line 9244
      $59 = ($57 & 65535) << 16 >> 16; //@line 9246
      $62 = $0; //@line 9249
      HEAP32[$62 >> 2] = $59; //@line 9251
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 9254
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9270
      $72 = HEAP32[$71 >> 2] | 0; //@line 9271
      HEAP32[$2 >> 2] = $71 + 4; //@line 9273
      $73 = $0; //@line 9275
      HEAP32[$73 >> 2] = $72 & 65535; //@line 9277
      HEAP32[$73 + 4 >> 2] = 0; //@line 9280
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9296
      $83 = HEAP32[$82 >> 2] | 0; //@line 9297
      HEAP32[$2 >> 2] = $82 + 4; //@line 9299
      $85 = ($83 & 255) << 24 >> 24; //@line 9301
      $88 = $0; //@line 9304
      HEAP32[$88 >> 2] = $85; //@line 9306
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 9309
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9325
      $98 = HEAP32[$97 >> 2] | 0; //@line 9326
      HEAP32[$2 >> 2] = $97 + 4; //@line 9328
      $99 = $0; //@line 9330
      HEAP32[$99 >> 2] = $98 & 255; //@line 9332
      HEAP32[$99 + 4 >> 2] = 0; //@line 9335
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9351
      $109 = +HEAPF64[$108 >> 3]; //@line 9352
      HEAP32[$2 >> 2] = $108 + 8; //@line 9354
      HEAPF64[$0 >> 3] = $109; //@line 9355
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9371
      $116 = +HEAPF64[$115 >> 3]; //@line 9372
      HEAP32[$2 >> 2] = $115 + 8; //@line 9374
      HEAPF64[$0 >> 3] = $116; //@line 9375
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
 sp = STACKTOP; //@line 8039
 STACKTOP = STACKTOP + 224 | 0; //@line 8040
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 8040
 $3 = sp + 120 | 0; //@line 8041
 $4 = sp + 80 | 0; //@line 8042
 $5 = sp; //@line 8043
 $6 = sp + 136 | 0; //@line 8044
 dest = $4; //@line 8045
 stop = dest + 40 | 0; //@line 8045
 do {
  HEAP32[dest >> 2] = 0; //@line 8045
  dest = dest + 4 | 0; //@line 8045
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 8047
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 8051
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 8058
  } else {
   $43 = 0; //@line 8060
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 8062
  $14 = $13 & 32; //@line 8063
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 8069
  }
  $19 = $0 + 48 | 0; //@line 8071
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 8076
    $24 = HEAP32[$23 >> 2] | 0; //@line 8077
    HEAP32[$23 >> 2] = $6; //@line 8078
    $25 = $0 + 28 | 0; //@line 8079
    HEAP32[$25 >> 2] = $6; //@line 8080
    $26 = $0 + 20 | 0; //@line 8081
    HEAP32[$26 >> 2] = $6; //@line 8082
    HEAP32[$19 >> 2] = 80; //@line 8083
    $28 = $0 + 16 | 0; //@line 8085
    HEAP32[$28 >> 2] = $6 + 80; //@line 8086
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 8087
    if (!$24) {
     $$1 = $29; //@line 8090
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 8093
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 8094
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 8095
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 133; //@line 8098
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 8100
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 8102
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 8104
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 8106
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 8108
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 8110
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 8112
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 8114
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 8116
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 8118
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 8120
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 8122
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 8124
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 8126
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 8128
      sp = STACKTOP; //@line 8129
      STACKTOP = sp; //@line 8130
      return 0; //@line 8130
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 8132
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 8135
      HEAP32[$23 >> 2] = $24; //@line 8136
      HEAP32[$19 >> 2] = 0; //@line 8137
      HEAP32[$28 >> 2] = 0; //@line 8138
      HEAP32[$25 >> 2] = 0; //@line 8139
      HEAP32[$26 >> 2] = 0; //@line 8140
      $$1 = $$; //@line 8141
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 8147
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 8150
  HEAP32[$0 >> 2] = $51 | $14; //@line 8155
  if ($43 | 0) {
   ___unlockfile($0); //@line 8158
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 8160
 }
 STACKTOP = sp; //@line 8162
 return $$0 | 0; //@line 8162
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12215
 STACKTOP = STACKTOP + 64 | 0; //@line 12216
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 12216
 $4 = sp; //@line 12217
 $5 = HEAP32[$0 >> 2] | 0; //@line 12218
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 12221
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 12223
 HEAP32[$4 >> 2] = $2; //@line 12224
 HEAP32[$4 + 4 >> 2] = $0; //@line 12226
 HEAP32[$4 + 8 >> 2] = $1; //@line 12228
 HEAP32[$4 + 12 >> 2] = $3; //@line 12230
 $14 = $4 + 16 | 0; //@line 12231
 $15 = $4 + 20 | 0; //@line 12232
 $16 = $4 + 24 | 0; //@line 12233
 $17 = $4 + 28 | 0; //@line 12234
 $18 = $4 + 32 | 0; //@line 12235
 $19 = $4 + 40 | 0; //@line 12236
 dest = $14; //@line 12237
 stop = dest + 36 | 0; //@line 12237
 do {
  HEAP32[dest >> 2] = 0; //@line 12237
  dest = dest + 4 | 0; //@line 12237
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 12237
 HEAP8[$14 + 38 >> 0] = 0; //@line 12237
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 12242
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 12245
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 12246
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 12247
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 145; //@line 12250
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 12252
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 12254
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 12256
    sp = STACKTOP; //@line 12257
    STACKTOP = sp; //@line 12258
    return 0; //@line 12258
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12260
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 12264
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 12268
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 12271
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 12272
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 12273
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 146; //@line 12276
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 12278
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 12280
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 12282
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 12284
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 12286
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 12288
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 12290
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 12292
    sp = STACKTOP; //@line 12293
    STACKTOP = sp; //@line 12294
    return 0; //@line 12294
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12296
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 12310
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 12318
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 12334
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 12339
  }
 } while (0);
 STACKTOP = sp; //@line 12342
 return $$0 | 0; //@line 12342
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 7911
 $7 = ($2 | 0) != 0; //@line 7915
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 7919
   $$03555 = $0; //@line 7920
   $$03654 = $2; //@line 7920
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 7925
     $$036$lcssa64 = $$03654; //@line 7925
     label = 6; //@line 7926
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 7929
    $12 = $$03654 + -1 | 0; //@line 7930
    $16 = ($12 | 0) != 0; //@line 7934
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 7937
     $$03654 = $12; //@line 7937
    } else {
     $$035$lcssa = $11; //@line 7939
     $$036$lcssa = $12; //@line 7939
     $$lcssa = $16; //@line 7939
     label = 5; //@line 7940
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 7945
   $$036$lcssa = $2; //@line 7945
   $$lcssa = $7; //@line 7945
   label = 5; //@line 7946
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 7951
   $$036$lcssa64 = $$036$lcssa; //@line 7951
   label = 6; //@line 7952
  } else {
   $$2 = $$035$lcssa; //@line 7954
   $$3 = 0; //@line 7954
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 7960
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 7963
    $$3 = $$036$lcssa64; //@line 7963
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 7965
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 7969
      $$13745 = $$036$lcssa64; //@line 7969
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 7972
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 7981
       $30 = $$13745 + -4 | 0; //@line 7982
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 7985
        $$13745 = $30; //@line 7985
       } else {
        $$0$lcssa = $29; //@line 7987
        $$137$lcssa = $30; //@line 7987
        label = 11; //@line 7988
        break L11;
       }
      }
      $$140 = $$046; //@line 7992
      $$23839 = $$13745; //@line 7992
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 7994
      $$137$lcssa = $$036$lcssa64; //@line 7994
      label = 11; //@line 7995
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 8001
      $$3 = 0; //@line 8001
      break;
     } else {
      $$140 = $$0$lcssa; //@line 8004
      $$23839 = $$137$lcssa; //@line 8004
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 8011
      $$3 = $$23839; //@line 8011
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 8014
     $$23839 = $$23839 + -1 | 0; //@line 8015
     if (!$$23839) {
      $$2 = $35; //@line 8018
      $$3 = 0; //@line 8018
      break;
     } else {
      $$140 = $35; //@line 8021
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 8029
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 7682
 do {
  if (!$0) {
   do {
    if (!(HEAP32[195] | 0)) {
     $34 = 0; //@line 7690
    } else {
     $12 = HEAP32[195] | 0; //@line 7692
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7693
     $13 = _fflush($12) | 0; //@line 7694
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 129; //@line 7697
      sp = STACKTOP; //@line 7698
      return 0; //@line 7699
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 7701
      $34 = $13; //@line 7702
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 7708
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 7712
    } else {
     $$02327 = $$02325; //@line 7714
     $$02426 = $34; //@line 7714
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 7721
      } else {
       $28 = 0; //@line 7723
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 7731
       $25 = ___fflush_unlocked($$02327) | 0; //@line 7732
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 7737
       $$1 = $25 | $$02426; //@line 7739
      } else {
       $$1 = $$02426; //@line 7741
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 7745
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 7748
      if (!$$023) {
       $$024$lcssa = $$1; //@line 7751
       break L9;
      } else {
       $$02327 = $$023; //@line 7754
       $$02426 = $$1; //@line 7754
      }
     }
     HEAP32[$AsyncCtx >> 2] = 130; //@line 7757
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 7759
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 7761
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 7763
     sp = STACKTOP; //@line 7764
     return 0; //@line 7765
    }
   } while (0);
   ___ofl_unlock(); //@line 7768
   $$0 = $$024$lcssa; //@line 7769
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7775
    $5 = ___fflush_unlocked($0) | 0; //@line 7776
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 127; //@line 7779
     sp = STACKTOP; //@line 7780
     return 0; //@line 7781
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 7783
     $$0 = $5; //@line 7784
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 7789
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 7790
   $7 = ___fflush_unlocked($0) | 0; //@line 7791
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 128; //@line 7794
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 7797
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 7799
    sp = STACKTOP; //@line 7800
    return 0; //@line 7801
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7803
   if ($phitmp) {
    $$0 = $7; //@line 7805
   } else {
    ___unlockfile($0); //@line 7807
    $$0 = $7; //@line 7808
   }
  }
 } while (0);
 return $$0 | 0; //@line 7812
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12397
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12403
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 12409
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 12412
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12413
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 12414
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 149; //@line 12417
     sp = STACKTOP; //@line 12418
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12421
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 12429
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 12434
     $19 = $1 + 44 | 0; //@line 12435
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 12441
     HEAP8[$22 >> 0] = 0; //@line 12442
     $23 = $1 + 53 | 0; //@line 12443
     HEAP8[$23 >> 0] = 0; //@line 12444
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 12446
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 12449
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 12450
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 12451
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 148; //@line 12454
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 12456
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 12458
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 12460
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 12462
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 12464
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 12466
      sp = STACKTOP; //@line 12467
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 12470
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 12474
      label = 13; //@line 12475
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 12480
       label = 13; //@line 12481
      } else {
       $$037$off039 = 3; //@line 12483
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 12487
      $39 = $1 + 40 | 0; //@line 12488
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 12491
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 12501
        $$037$off039 = $$037$off038; //@line 12502
       } else {
        $$037$off039 = $$037$off038; //@line 12504
       }
      } else {
       $$037$off039 = $$037$off038; //@line 12507
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 12510
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 12517
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_23($0) {
 $0 = $0 | 0;
 var $$13 = 0, $$expand_i1_val = 0, $10 = 0, $12 = 0, $18 = 0, $19 = 0, $2 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 1124
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1126
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1128
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 1131
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1133
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1135
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1137
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1141
 $$13 = ($AsyncRetVal | 0) >= ($12 | 0) ? 0 : $AsyncRetVal; //@line 1143
 $18 = (HEAP32[$0 + 28 >> 2] | 0) + $$13 | 0; //@line 1145
 $19 = $12 - $$13 | 0; //@line 1146
 do {
  if (($$13 | 0) > 0) {
   $21 = HEAP32[106] | 0; //@line 1150
   if (!(($19 | 0) > 0 & ($21 | 0) != 0)) {
    if (($$13 | 0) < 1 | ($19 | 0) < 1 | $6 ^ 1) {
     break;
    }
    _snprintf($18, $19, 1810, $8) | 0; //@line 1162
    break;
   }
   $ReallocAsyncCtx6 = _emscripten_realloc_async_context(32) | 0; //@line 1165
   $23 = FUNCTION_TABLE_i[$21 & 3]() | 0; //@line 1166
   if (___async) {
    HEAP32[$ReallocAsyncCtx6 >> 2] = 52; //@line 1169
    $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 1170
    HEAP32[$24 >> 2] = $2; //@line 1171
    $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 1172
    HEAP32[$25 >> 2] = $18; //@line 1173
    $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 1174
    HEAP32[$26 >> 2] = $19; //@line 1175
    $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 1176
    HEAP32[$27 >> 2] = $4; //@line 1177
    $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 1178
    $$expand_i1_val = $6 & 1; //@line 1179
    HEAP8[$28 >> 0] = $$expand_i1_val; //@line 1180
    $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 1181
    HEAP32[$29 >> 2] = $8; //@line 1182
    $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 1183
    HEAP32[$30 >> 2] = $10; //@line 1184
    sp = STACKTOP; //@line 1185
    return;
   }
   HEAP32[___async_retval >> 2] = $23; //@line 1189
   ___async_unwind = 0; //@line 1190
   HEAP32[$ReallocAsyncCtx6 >> 2] = 52; //@line 1191
   $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 1192
   HEAP32[$24 >> 2] = $2; //@line 1193
   $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 1194
   HEAP32[$25 >> 2] = $18; //@line 1195
   $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 1196
   HEAP32[$26 >> 2] = $19; //@line 1197
   $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 1198
   HEAP32[$27 >> 2] = $4; //@line 1199
   $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 1200
   $$expand_i1_val = $6 & 1; //@line 1201
   HEAP8[$28 >> 0] = $$expand_i1_val; //@line 1202
   $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 1203
   HEAP32[$29 >> 2] = $8; //@line 1204
   $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 1205
   HEAP32[$30 >> 2] = $10; //@line 1206
   sp = STACKTOP; //@line 1207
   return;
  }
 } while (0);
 $34 = HEAP32[107] | 0; //@line 1211
 $35 = HEAP32[100] | 0; //@line 1212
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 1213
 FUNCTION_TABLE_vi[$34 & 255]($35); //@line 1214
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 53; //@line 1217
  sp = STACKTOP; //@line 1218
  return;
 }
 ___async_unwind = 0; //@line 1221
 HEAP32[$ReallocAsyncCtx7 >> 2] = 53; //@line 1222
 sp = STACKTOP; //@line 1223
 return;
}
function _mbed_vtracef__async_cb_24($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 1233
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1235
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1237
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 1240
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1242
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1244
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1246
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1248
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1250
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1252
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1254
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1256
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1258
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 1260
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 1262
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 1264
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 1266
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 1268
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 1270
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 1272
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 1274
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 1276
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 1278
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 1280
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 1282
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 1284
 $55 = ($50 | 0 ? 4 : 0) + $50 + (HEAP32[___async_retval >> 2] | 0) | 0; //@line 1290
 $56 = HEAP32[105] | 0; //@line 1291
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(100) | 0; //@line 1292
 $57 = FUNCTION_TABLE_ii[$56 & 1]($55) | 0; //@line 1293
 if (!___async) {
  HEAP32[___async_retval >> 2] = $57; //@line 1297
  ___async_unwind = 0; //@line 1298
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 50; //@line 1300
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 1302
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 1304
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $12; //@line 1306
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $14; //@line 1308
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $16; //@line 1310
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $18; //@line 1312
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $20; //@line 1314
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $22; //@line 1316
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $24; //@line 1318
 HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $26; //@line 1320
 HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $28; //@line 1322
 HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $30; //@line 1324
 HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $32; //@line 1326
 HEAP32[$ReallocAsyncCtx5 + 56 >> 2] = $34; //@line 1328
 HEAP32[$ReallocAsyncCtx5 + 60 >> 2] = $36; //@line 1330
 HEAP32[$ReallocAsyncCtx5 + 64 >> 2] = $38; //@line 1332
 HEAP32[$ReallocAsyncCtx5 + 68 >> 2] = $40; //@line 1334
 HEAP32[$ReallocAsyncCtx5 + 72 >> 2] = $42; //@line 1336
 HEAP32[$ReallocAsyncCtx5 + 76 >> 2] = $44; //@line 1338
 HEAP8[$ReallocAsyncCtx5 + 80 >> 0] = $6 & 1; //@line 1341
 HEAP32[$ReallocAsyncCtx5 + 84 >> 2] = $46; //@line 1343
 HEAP32[$ReallocAsyncCtx5 + 88 >> 2] = $48; //@line 1345
 HEAP32[$ReallocAsyncCtx5 + 92 >> 2] = $8; //@line 1347
 HEAP32[$ReallocAsyncCtx5 + 96 >> 2] = $10; //@line 1349
 sp = STACKTOP; //@line 1350
 return;
}
function _initialize__async_cb_78($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $17 = 0, $19 = 0, $2 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $28 = 0, $29 = 0, $31 = 0, $33 = 0, $36 = 0, $4 = 0, $40 = 0, $41 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4793
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4795
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4797
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4799
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4801
 $10 = $0 + 24 | 0; //@line 4803
 $12 = HEAP32[$10 >> 2] | 0; //@line 4805
 $15 = HEAP32[$10 + 4 >> 2] | 0; //@line 4808
 $17 = HEAP32[$0 + 32 >> 2] | 0; //@line 4810
 $19 = HEAP32[$0 + 36 >> 2] | 0; //@line 4812
 $21 = HEAP32[$2 >> 2] | 0; //@line 4815
 $22 = $21 + 32 | 0; //@line 4816
 HEAP32[$22 >> 2] = HEAP32[___async_retval >> 2]; //@line 4817
 $23 = $21 + 40 | 0; //@line 4818
 $24 = $23; //@line 4819
 HEAP32[$24 >> 2] = 0; //@line 4821
 HEAP32[$24 + 4 >> 2] = 0; //@line 4824
 $28 = $21 + 8 | 0; //@line 4825
 HEAP32[$28 >> 2] = $4; //@line 4826
 $29 = _bitshift64Shl(1, 0, $6 | 0) | 0; //@line 4827
 $31 = _i64Add($29 | 0, tempRet0 | 0, -1, 0) | 0; //@line 4829
 $33 = $21 + 12 | 0; //@line 4831
 HEAP32[$33 >> 2] = $31; //@line 4832
 HEAP32[$21 + 16 >> 2] = $8; //@line 4834
 $36 = $21 + 24 | 0; //@line 4836
 HEAP32[$36 >> 2] = $12; //@line 4838
 HEAP32[$36 + 4 >> 2] = $15; //@line 4841
 $40 = $21 + 48 | 0; //@line 4842
 $41 = $40; //@line 4843
 HEAP32[$41 >> 2] = 0; //@line 4845
 HEAP32[$41 + 4 >> 2] = 0; //@line 4848
 HEAP8[$21 + 56 >> 0] = 1; //@line 4850
 $48 = HEAP32[(HEAP32[$17 >> 2] | 0) + 4 >> 2] | 0; //@line 4853
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 4854
 $49 = FUNCTION_TABLE_i[$48 & 3]() | 0; //@line 4855
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 62; //@line 4858
  $50 = $ReallocAsyncCtx4 + 4 | 0; //@line 4859
  HEAP32[$50 >> 2] = $2; //@line 4860
  $51 = $ReallocAsyncCtx4 + 8 | 0; //@line 4861
  HEAP32[$51 >> 2] = $19; //@line 4862
  $52 = $ReallocAsyncCtx4 + 12 | 0; //@line 4863
  HEAP32[$52 >> 2] = $22; //@line 4864
  $53 = $ReallocAsyncCtx4 + 16 | 0; //@line 4865
  HEAP32[$53 >> 2] = $33; //@line 4866
  $54 = $ReallocAsyncCtx4 + 20 | 0; //@line 4867
  HEAP32[$54 >> 2] = $28; //@line 4868
  $55 = $ReallocAsyncCtx4 + 24 | 0; //@line 4869
  HEAP32[$55 >> 2] = $23; //@line 4870
  $56 = $ReallocAsyncCtx4 + 28 | 0; //@line 4871
  HEAP32[$56 >> 2] = $40; //@line 4872
  sp = STACKTOP; //@line 4873
  return;
 }
 HEAP32[___async_retval >> 2] = $49; //@line 4877
 ___async_unwind = 0; //@line 4878
 HEAP32[$ReallocAsyncCtx4 >> 2] = 62; //@line 4879
 $50 = $ReallocAsyncCtx4 + 4 | 0; //@line 4880
 HEAP32[$50 >> 2] = $2; //@line 4881
 $51 = $ReallocAsyncCtx4 + 8 | 0; //@line 4882
 HEAP32[$51 >> 2] = $19; //@line 4883
 $52 = $ReallocAsyncCtx4 + 12 | 0; //@line 4884
 HEAP32[$52 >> 2] = $22; //@line 4885
 $53 = $ReallocAsyncCtx4 + 16 | 0; //@line 4886
 HEAP32[$53 >> 2] = $33; //@line 4887
 $54 = $ReallocAsyncCtx4 + 20 | 0; //@line 4888
 HEAP32[$54 >> 2] = $28; //@line 4889
 $55 = $ReallocAsyncCtx4 + 24 | 0; //@line 4890
 HEAP32[$55 >> 2] = $23; //@line 4891
 $56 = $ReallocAsyncCtx4 + 28 | 0; //@line 4892
 HEAP32[$56 >> 2] = $40; //@line 4893
 sp = STACKTOP; //@line 4894
 return;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $12 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $29 = 0, $3 = 0, $36 = 0, $39 = 0, $40 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx14 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 11709
 STACKTOP = STACKTOP + 48 | 0; //@line 11710
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 11710
 $vararg_buffer10 = sp + 32 | 0; //@line 11711
 $vararg_buffer7 = sp + 24 | 0; //@line 11712
 $vararg_buffer3 = sp + 16 | 0; //@line 11713
 $vararg_buffer = sp; //@line 11714
 $0 = sp + 36 | 0; //@line 11715
 $1 = ___cxa_get_globals_fast() | 0; //@line 11716
 if ($1 | 0) {
  $3 = HEAP32[$1 >> 2] | 0; //@line 11719
  if ($3 | 0) {
   $7 = $3 + 48 | 0; //@line 11724
   $9 = HEAP32[$7 >> 2] | 0; //@line 11726
   $12 = HEAP32[$7 + 4 >> 2] | 0; //@line 11729
   if (!(($9 & -256 | 0) == 1126902528 & ($12 | 0) == 1129074247)) {
    HEAP32[$vararg_buffer7 >> 2] = 5209; //@line 11735
    _abort_message(5159, $vararg_buffer7); //@line 11736
   }
   if (($9 | 0) == 1126902529 & ($12 | 0) == 1129074247) {
    $22 = HEAP32[$3 + 44 >> 2] | 0; //@line 11745
   } else {
    $22 = $3 + 80 | 0; //@line 11747
   }
   HEAP32[$0 >> 2] = $22; //@line 11749
   $23 = HEAP32[$3 >> 2] | 0; //@line 11750
   $25 = HEAP32[$23 + 4 >> 2] | 0; //@line 11752
   $28 = HEAP32[(HEAP32[54] | 0) + 16 >> 2] | 0; //@line 11755
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 11756
   $29 = FUNCTION_TABLE_iiii[$28 & 7](216, $23, $0) | 0; //@line 11757
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 139; //@line 11760
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 11762
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 11764
    HEAP32[$AsyncCtx + 12 >> 2] = $25; //@line 11766
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 11768
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 11770
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 11772
    sp = STACKTOP; //@line 11773
    STACKTOP = sp; //@line 11774
    return;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 11776
   if (!$29) {
    HEAP32[$vararg_buffer3 >> 2] = 5209; //@line 11778
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 11780
    _abort_message(5118, $vararg_buffer3); //@line 11781
   }
   $36 = HEAP32[$0 >> 2] | 0; //@line 11784
   $39 = HEAP32[(HEAP32[$36 >> 2] | 0) + 8 >> 2] | 0; //@line 11787
   $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 11788
   $40 = FUNCTION_TABLE_ii[$39 & 1]($36) | 0; //@line 11789
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 140; //@line 11792
    HEAP32[$AsyncCtx14 + 4 >> 2] = $vararg_buffer; //@line 11794
    HEAP32[$AsyncCtx14 + 8 >> 2] = $25; //@line 11796
    HEAP32[$AsyncCtx14 + 12 >> 2] = $vararg_buffer; //@line 11798
    sp = STACKTOP; //@line 11799
    STACKTOP = sp; //@line 11800
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 11802
    HEAP32[$vararg_buffer >> 2] = 5209; //@line 11803
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 11805
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 11807
    _abort_message(5073, $vararg_buffer); //@line 11808
   }
  }
 }
 _abort_message(5197, $vararg_buffer10); //@line 11813
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_70($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $37 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4172
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4174
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4176
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4178
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4180
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4182
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4184
 $14 = $0 + 32 | 0; //@line 4186
 $16 = HEAP32[$14 >> 2] | 0; //@line 4188
 $19 = HEAP32[$14 + 4 >> 2] | 0; //@line 4191
 $20 = HEAP32[$2 >> 2] | 0; //@line 4192
 if ($20 | 0) {
  $23 = HEAP32[$20 + 4 >> 2] | 0; //@line 4196
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 4197
  FUNCTION_TABLE_vii[$23 & 3]($6, $8); //@line 4198
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 122; //@line 4201
   $24 = $ReallocAsyncCtx3 + 4 | 0; //@line 4202
   HEAP32[$24 >> 2] = $10; //@line 4203
   $25 = $ReallocAsyncCtx3 + 8 | 0; //@line 4204
   HEAP32[$25 >> 2] = $4; //@line 4205
   $26 = $ReallocAsyncCtx3 + 12 | 0; //@line 4206
   HEAP32[$26 >> 2] = $12; //@line 4207
   $27 = $ReallocAsyncCtx3 + 16 | 0; //@line 4208
   $28 = $27; //@line 4209
   $29 = $28; //@line 4210
   HEAP32[$29 >> 2] = $16; //@line 4211
   $30 = $28 + 4 | 0; //@line 4212
   $31 = $30; //@line 4213
   HEAP32[$31 >> 2] = $19; //@line 4214
   $32 = $ReallocAsyncCtx3 + 24 | 0; //@line 4215
   HEAP32[$32 >> 2] = $2; //@line 4216
   $33 = $ReallocAsyncCtx3 + 28 | 0; //@line 4217
   HEAP32[$33 >> 2] = $8; //@line 4218
   sp = STACKTOP; //@line 4219
   return;
  }
  ___async_unwind = 0; //@line 4222
  HEAP32[$ReallocAsyncCtx3 >> 2] = 122; //@line 4223
  $24 = $ReallocAsyncCtx3 + 4 | 0; //@line 4224
  HEAP32[$24 >> 2] = $10; //@line 4225
  $25 = $ReallocAsyncCtx3 + 8 | 0; //@line 4226
  HEAP32[$25 >> 2] = $4; //@line 4227
  $26 = $ReallocAsyncCtx3 + 12 | 0; //@line 4228
  HEAP32[$26 >> 2] = $12; //@line 4229
  $27 = $ReallocAsyncCtx3 + 16 | 0; //@line 4230
  $28 = $27; //@line 4231
  $29 = $28; //@line 4232
  HEAP32[$29 >> 2] = $16; //@line 4233
  $30 = $28 + 4 | 0; //@line 4234
  $31 = $30; //@line 4235
  HEAP32[$31 >> 2] = $19; //@line 4236
  $32 = $ReallocAsyncCtx3 + 24 | 0; //@line 4237
  HEAP32[$32 >> 2] = $2; //@line 4238
  $33 = $ReallocAsyncCtx3 + 28 | 0; //@line 4239
  HEAP32[$33 >> 2] = $8; //@line 4240
  sp = STACKTOP; //@line 4241
  return;
 }
 HEAP32[$4 >> 2] = 0; //@line 4244
 __ZN4mbed6Ticker5setupEy($12, $16, $19); //@line 4245
 $34 = HEAP32[$2 >> 2] | 0; //@line 4246
 if (!$34) {
  return;
 }
 $37 = HEAP32[$34 + 8 >> 2] | 0; //@line 4252
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 4253
 FUNCTION_TABLE_vi[$37 & 255]($8); //@line 4254
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 123; //@line 4257
  sp = STACKTOP; //@line 4258
  return;
 }
 ___async_unwind = 0; //@line 4261
 HEAP32[$ReallocAsyncCtx4 >> 2] = 123; //@line 4262
 sp = STACKTOP; //@line 4263
 return;
}
function _mbed_error_vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2667
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2669
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2671
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2673
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[1445] | 0)) {
  _serial_init(5784, 2, 3); //@line 2681
 }
 $9 = HEAP8[$4 >> 0] | 0; //@line 2683
 if (0 == 13 | $9 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 2689
  _serial_putc(5784, $9 << 24 >> 24); //@line 2690
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 92; //@line 2693
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 2694
   HEAP32[$18 >> 2] = 0; //@line 2695
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 2696
   HEAP32[$19 >> 2] = $AsyncRetVal; //@line 2697
   $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 2698
   HEAP32[$20 >> 2] = $2; //@line 2699
   $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 2700
   HEAP8[$21 >> 0] = $9; //@line 2701
   $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 2702
   HEAP32[$22 >> 2] = $4; //@line 2703
   sp = STACKTOP; //@line 2704
   return;
  }
  ___async_unwind = 0; //@line 2707
  HEAP32[$ReallocAsyncCtx2 >> 2] = 92; //@line 2708
  $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 2709
  HEAP32[$18 >> 2] = 0; //@line 2710
  $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 2711
  HEAP32[$19 >> 2] = $AsyncRetVal; //@line 2712
  $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 2713
  HEAP32[$20 >> 2] = $2; //@line 2714
  $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 2715
  HEAP8[$21 >> 0] = $9; //@line 2716
  $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 2717
  HEAP32[$22 >> 2] = $4; //@line 2718
  sp = STACKTOP; //@line 2719
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 2722
  _serial_putc(5784, 13); //@line 2723
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 91; //@line 2726
   $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 2727
   HEAP8[$12 >> 0] = $9; //@line 2728
   $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 2729
   HEAP32[$13 >> 2] = 0; //@line 2730
   $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 2731
   HEAP32[$14 >> 2] = $AsyncRetVal; //@line 2732
   $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 2733
   HEAP32[$15 >> 2] = $2; //@line 2734
   $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 2735
   HEAP32[$16 >> 2] = $4; //@line 2736
   sp = STACKTOP; //@line 2737
   return;
  }
  ___async_unwind = 0; //@line 2740
  HEAP32[$ReallocAsyncCtx3 >> 2] = 91; //@line 2741
  $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 2742
  HEAP8[$12 >> 0] = $9; //@line 2743
  $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 2744
  HEAP32[$13 >> 2] = 0; //@line 2745
  $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 2746
  HEAP32[$14 >> 2] = $AsyncRetVal; //@line 2747
  $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 2748
  HEAP32[$15 >> 2] = $2; //@line 2749
  $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 2750
  HEAP32[$16 >> 2] = $4; //@line 2751
  sp = STACKTOP; //@line 2752
  return;
 }
}
function _mbed_error_vfprintf__async_cb_53($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2760
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2764
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2766
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2770
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 2771
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP8[$10 + $12 >> 0] | 0; //@line 2777
 if ((HEAP8[$0 + 16 >> 0] | 0) == 13 | $13 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 2783
  _serial_putc(5784, $13 << 24 >> 24); //@line 2784
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 92; //@line 2787
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 2788
   HEAP32[$22 >> 2] = $12; //@line 2789
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 2790
   HEAP32[$23 >> 2] = $4; //@line 2791
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 2792
   HEAP32[$24 >> 2] = $6; //@line 2793
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 2794
   HEAP8[$25 >> 0] = $13; //@line 2795
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 2796
   HEAP32[$26 >> 2] = $10; //@line 2797
   sp = STACKTOP; //@line 2798
   return;
  }
  ___async_unwind = 0; //@line 2801
  HEAP32[$ReallocAsyncCtx2 >> 2] = 92; //@line 2802
  $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 2803
  HEAP32[$22 >> 2] = $12; //@line 2804
  $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 2805
  HEAP32[$23 >> 2] = $4; //@line 2806
  $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 2807
  HEAP32[$24 >> 2] = $6; //@line 2808
  $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 2809
  HEAP8[$25 >> 0] = $13; //@line 2810
  $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 2811
  HEAP32[$26 >> 2] = $10; //@line 2812
  sp = STACKTOP; //@line 2813
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 2816
  _serial_putc(5784, 13); //@line 2817
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 91; //@line 2820
   $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 2821
   HEAP8[$16 >> 0] = $13; //@line 2822
   $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 2823
   HEAP32[$17 >> 2] = $12; //@line 2824
   $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 2825
   HEAP32[$18 >> 2] = $4; //@line 2826
   $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 2827
   HEAP32[$19 >> 2] = $6; //@line 2828
   $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 2829
   HEAP32[$20 >> 2] = $10; //@line 2830
   sp = STACKTOP; //@line 2831
   return;
  }
  ___async_unwind = 0; //@line 2834
  HEAP32[$ReallocAsyncCtx3 >> 2] = 91; //@line 2835
  $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 2836
  HEAP8[$16 >> 0] = $13; //@line 2837
  $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 2838
  HEAP32[$17 >> 2] = $12; //@line 2839
  $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 2840
  HEAP32[$18 >> 2] = $4; //@line 2841
  $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 2842
  HEAP32[$19 >> 2] = $6; //@line 2843
  $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 2844
  HEAP32[$20 >> 2] = $10; //@line 2845
  sp = STACKTOP; //@line 2846
  return;
 }
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6723
 STACKTOP = STACKTOP + 48 | 0; //@line 6724
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 6724
 $vararg_buffer3 = sp + 16 | 0; //@line 6725
 $vararg_buffer = sp; //@line 6726
 $3 = sp + 32 | 0; //@line 6727
 $4 = $0 + 28 | 0; //@line 6728
 $5 = HEAP32[$4 >> 2] | 0; //@line 6729
 HEAP32[$3 >> 2] = $5; //@line 6730
 $7 = $0 + 20 | 0; //@line 6732
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 6734
 HEAP32[$3 + 4 >> 2] = $9; //@line 6735
 HEAP32[$3 + 8 >> 2] = $1; //@line 6737
 HEAP32[$3 + 12 >> 2] = $2; //@line 6739
 $12 = $9 + $2 | 0; //@line 6740
 $13 = $0 + 60 | 0; //@line 6741
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 6744
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 6746
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 6748
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 6750
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 6754
  } else {
   $$04756 = 2; //@line 6756
   $$04855 = $12; //@line 6756
   $$04954 = $3; //@line 6756
   $27 = $17; //@line 6756
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 6762
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 6764
    $38 = $27 >>> 0 > $37 >>> 0; //@line 6765
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 6767
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 6769
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 6771
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 6774
    $44 = $$150 + 4 | 0; //@line 6775
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 6778
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 6781
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 6783
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 6785
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 6787
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 6790
     break L1;
    } else {
     $$04756 = $$1; //@line 6793
     $$04954 = $$150; //@line 6793
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 6797
   HEAP32[$4 >> 2] = 0; //@line 6798
   HEAP32[$7 >> 2] = 0; //@line 6799
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 6802
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 6805
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 6810
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 6816
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 6821
  $25 = $20; //@line 6822
  HEAP32[$4 >> 2] = $25; //@line 6823
  HEAP32[$7 >> 2] = $25; //@line 6824
  $$051 = $2; //@line 6825
 }
 STACKTOP = sp; //@line 6827
 return $$051 | 0; //@line 6827
}
function _initialize__async_cb_81($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5079
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5081
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5083
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5085
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5087
 $10 = 7 << 32 + -4; //@line 5089
 $11 = ___muldi3($10 | 0, 0, 1e6, 0) | 0; //@line 5090
 $12 = tempRet0; //@line 5091
 $13 = _i64Add($2 | 0, 0, -1, -1) | 0; //@line 5092
 $15 = _i64Add($13 | 0, tempRet0 | 0, $11 | 0, $12 | 0) | 0; //@line 5094
 $17 = ___udivdi3($15 | 0, tempRet0 | 0, $2 | 0, 0) | 0; //@line 5096
 $18 = tempRet0; //@line 5097
 $19 = HEAP32[$4 >> 2] | 0; //@line 5098
 HEAP32[$19 >> 2] = 0; //@line 5099
 HEAP32[$19 + 4 >> 2] = 0; //@line 5101
 $23 = HEAP32[(HEAP32[$6 >> 2] | 0) + 4 >> 2] | 0; //@line 5104
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 5105
 $24 = FUNCTION_TABLE_i[$23 & 3]() | 0; //@line 5106
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 61; //@line 5109
  $25 = $ReallocAsyncCtx3 + 4 | 0; //@line 5110
  HEAP32[$25 >> 2] = $4; //@line 5111
  $26 = $ReallocAsyncCtx3 + 8 | 0; //@line 5112
  HEAP32[$26 >> 2] = $2; //@line 5113
  $27 = $ReallocAsyncCtx3 + 12 | 0; //@line 5114
  HEAP32[$27 >> 2] = 32; //@line 5115
  $28 = $ReallocAsyncCtx3 + 16 | 0; //@line 5116
  HEAP32[$28 >> 2] = $10; //@line 5117
  $29 = $ReallocAsyncCtx3 + 24 | 0; //@line 5118
  $30 = $29; //@line 5119
  $31 = $30; //@line 5120
  HEAP32[$31 >> 2] = $17; //@line 5121
  $32 = $30 + 4 | 0; //@line 5122
  $33 = $32; //@line 5123
  HEAP32[$33 >> 2] = $18; //@line 5124
  $34 = $ReallocAsyncCtx3 + 32 | 0; //@line 5125
  HEAP32[$34 >> 2] = $6; //@line 5126
  $35 = $ReallocAsyncCtx3 + 36 | 0; //@line 5127
  HEAP32[$35 >> 2] = $8; //@line 5128
  sp = STACKTOP; //@line 5129
  return;
 }
 HEAP32[___async_retval >> 2] = $24; //@line 5133
 ___async_unwind = 0; //@line 5134
 HEAP32[$ReallocAsyncCtx3 >> 2] = 61; //@line 5135
 $25 = $ReallocAsyncCtx3 + 4 | 0; //@line 5136
 HEAP32[$25 >> 2] = $4; //@line 5137
 $26 = $ReallocAsyncCtx3 + 8 | 0; //@line 5138
 HEAP32[$26 >> 2] = $2; //@line 5139
 $27 = $ReallocAsyncCtx3 + 12 | 0; //@line 5140
 HEAP32[$27 >> 2] = 32; //@line 5141
 $28 = $ReallocAsyncCtx3 + 16 | 0; //@line 5142
 HEAP32[$28 >> 2] = $10; //@line 5143
 $29 = $ReallocAsyncCtx3 + 24 | 0; //@line 5144
 $30 = $29; //@line 5145
 $31 = $30; //@line 5146
 HEAP32[$31 >> 2] = $17; //@line 5147
 $32 = $30 + 4 | 0; //@line 5148
 $33 = $32; //@line 5149
 HEAP32[$33 >> 2] = $18; //@line 5150
 $34 = $ReallocAsyncCtx3 + 32 | 0; //@line 5151
 HEAP32[$34 >> 2] = $6; //@line 5152
 $35 = $ReallocAsyncCtx3 + 36 | 0; //@line 5153
 HEAP32[$35 >> 2] = $8; //@line 5154
 sp = STACKTOP; //@line 5155
 return;
}
function _mbed_error_vfprintf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$01213 = 0, $$014 = 0, $2 = 0, $24 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0, $$01213$looptemp = 0;
 sp = STACKTOP; //@line 2596
 STACKTOP = STACKTOP + 128 | 0; //@line 2597
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 2597
 $2 = sp; //@line 2598
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 2599
 $3 = _vsnprintf($2, 128, $0, $1) | 0; //@line 2600
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 90; //@line 2603
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 2605
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 2607
  sp = STACKTOP; //@line 2608
  STACKTOP = sp; //@line 2609
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2611
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 2614
  return;
 }
 if (!(HEAP32[1445] | 0)) {
  _serial_init(5784, 2, 3); //@line 2619
  $$01213 = 0; //@line 2620
  $$014 = 0; //@line 2620
 } else {
  $$01213 = 0; //@line 2622
  $$014 = 0; //@line 2622
 }
 while (1) {
  $$01213$looptemp = $$01213;
  $$01213 = HEAP8[$2 + $$014 >> 0] | 0; //@line 2626
  if (!($$01213$looptemp << 24 >> 24 == 13 | $$01213 << 24 >> 24 != 10)) {
   $AsyncCtx7 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2631
   _serial_putc(5784, 13); //@line 2632
   if (___async) {
    label = 8; //@line 2635
    break;
   }
   _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2638
  }
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2641
  _serial_putc(5784, $$01213 << 24 >> 24); //@line 2642
  if (___async) {
   label = 11; //@line 2645
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2648
  $24 = $$014 + 1 | 0; //@line 2649
  if (($24 | 0) == ($3 | 0)) {
   label = 13; //@line 2652
   break;
  } else {
   $$014 = $24; //@line 2655
  }
 }
 if ((label | 0) == 8) {
  HEAP32[$AsyncCtx7 >> 2] = 91; //@line 2659
  HEAP8[$AsyncCtx7 + 4 >> 0] = $$01213; //@line 2661
  HEAP32[$AsyncCtx7 + 8 >> 2] = $$014; //@line 2663
  HEAP32[$AsyncCtx7 + 12 >> 2] = $3; //@line 2665
  HEAP32[$AsyncCtx7 + 16 >> 2] = $2; //@line 2667
  HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 2669
  sp = STACKTOP; //@line 2670
  STACKTOP = sp; //@line 2671
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx3 >> 2] = 92; //@line 2674
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$014; //@line 2676
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 2678
  HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 2680
  HEAP8[$AsyncCtx3 + 16 >> 0] = $$01213; //@line 2682
  HEAP32[$AsyncCtx3 + 20 >> 2] = $2; //@line 2684
  sp = STACKTOP; //@line 2685
  STACKTOP = sp; //@line 2686
  return;
 } else if ((label | 0) == 13) {
  STACKTOP = sp; //@line 2689
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_48($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2270
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2274
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2276
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 2278
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2280
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 2282
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2284
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2286
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2288
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2290
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 2293
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 2295
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 2299
   $27 = $6 + 24 | 0; //@line 2300
   $28 = $4 + 8 | 0; //@line 2301
   $29 = $6 + 54 | 0; //@line 2302
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
    HEAP8[$10 >> 0] = 0; //@line 2332
    HEAP8[$14 >> 0] = 0; //@line 2333
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 2334
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 2335
    if (!___async) {
     ___async_unwind = 0; //@line 2338
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 154; //@line 2340
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 2342
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 2344
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 2346
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 2348
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 2350
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 2352
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 2354
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 2356
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 2358
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 2360
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 2362
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 2364
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 2366
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 2369
    sp = STACKTOP; //@line 2370
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 2375
 HEAP8[$14 >> 0] = $12; //@line 2376
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2154
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2158
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2160
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 2162
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2164
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 2166
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2168
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2170
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2172
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2174
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 2176
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 2178
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 2180
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 2183
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 2184
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
    HEAP8[$10 >> 0] = 0; //@line 2217
    HEAP8[$14 >> 0] = 0; //@line 2218
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 2219
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 2220
    if (!___async) {
     ___async_unwind = 0; //@line 2223
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 154; //@line 2225
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 2227
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 2229
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 2231
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 2233
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 2235
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 2237
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 2239
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 2241
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 2243
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 2245
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 2247
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 2249
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 2251
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 2254
    sp = STACKTOP; //@line 2255
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 2260
 HEAP8[$14 >> 0] = $12; //@line 2261
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 5804
 }
 ret = dest | 0; //@line 5807
 dest_end = dest + num | 0; //@line 5808
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 5812
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 5813
   dest = dest + 1 | 0; //@line 5814
   src = src + 1 | 0; //@line 5815
   num = num - 1 | 0; //@line 5816
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 5818
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 5819
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 5821
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 5822
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 5823
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 5824
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 5825
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 5826
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 5827
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 5828
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 5829
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 5830
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 5831
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 5832
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 5833
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 5834
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 5835
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 5836
   dest = dest + 64 | 0; //@line 5837
   src = src + 64 | 0; //@line 5838
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 5841
   dest = dest + 4 | 0; //@line 5842
   src = src + 4 | 0; //@line 5843
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 5847
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 5849
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 5850
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 5851
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 5852
   dest = dest + 4 | 0; //@line 5853
   src = src + 4 | 0; //@line 5854
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 5859
  dest = dest + 1 | 0; //@line 5860
  src = src + 1 | 0; //@line 5861
 }
 return ret | 0; //@line 5863
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 11898
 STACKTOP = STACKTOP + 64 | 0; //@line 11899
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 11899
 $3 = sp; //@line 11900
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 11903
 } else {
  if (!$1) {
   $$2 = 0; //@line 11907
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 11909
   $6 = ___dynamic_cast($1, 240, 224, 0) | 0; //@line 11910
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 143; //@line 11913
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 11915
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 11917
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 11919
    sp = STACKTOP; //@line 11920
    STACKTOP = sp; //@line 11921
    return 0; //@line 11921
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11923
   if (!$6) {
    $$2 = 0; //@line 11926
   } else {
    dest = $3 + 4 | 0; //@line 11929
    stop = dest + 52 | 0; //@line 11929
    do {
     HEAP32[dest >> 2] = 0; //@line 11929
     dest = dest + 4 | 0; //@line 11929
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 11930
    HEAP32[$3 + 8 >> 2] = $0; //@line 11932
    HEAP32[$3 + 12 >> 2] = -1; //@line 11934
    HEAP32[$3 + 48 >> 2] = 1; //@line 11936
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 11939
    $18 = HEAP32[$2 >> 2] | 0; //@line 11940
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 11941
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 11942
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 144; //@line 11945
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 11947
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 11949
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 11951
     sp = STACKTOP; //@line 11952
     STACKTOP = sp; //@line 11953
     return 0; //@line 11953
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 11955
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 11962
     $$0 = 1; //@line 11963
    } else {
     $$0 = 0; //@line 11965
    }
    $$2 = $$0; //@line 11967
   }
  }
 }
 STACKTOP = sp; //@line 11971
 return $$2 | 0; //@line 11971
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 11444
 STACKTOP = STACKTOP + 128 | 0; //@line 11445
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 11445
 $4 = sp + 124 | 0; //@line 11446
 $5 = sp; //@line 11447
 dest = $5; //@line 11448
 src = 1028; //@line 11448
 stop = dest + 124 | 0; //@line 11448
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 11448
  dest = dest + 4 | 0; //@line 11448
  src = src + 4 | 0; //@line 11448
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 11454
   $$015 = 1; //@line 11454
   label = 4; //@line 11455
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 11458
   $$0 = -1; //@line 11459
  }
 } else {
  $$014 = $0; //@line 11462
  $$015 = $1; //@line 11462
  label = 4; //@line 11463
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 11467
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 11469
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 11471
  $14 = $5 + 20 | 0; //@line 11472
  HEAP32[$14 >> 2] = $$014; //@line 11473
  HEAP32[$5 + 44 >> 2] = $$014; //@line 11475
  $16 = $$014 + $$$015 | 0; //@line 11476
  $17 = $5 + 16 | 0; //@line 11477
  HEAP32[$17 >> 2] = $16; //@line 11478
  HEAP32[$5 + 28 >> 2] = $16; //@line 11480
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 11481
  $19 = _vfprintf($5, $2, $3) | 0; //@line 11482
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 135; //@line 11485
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 11487
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 11489
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 11491
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 11493
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 11495
   sp = STACKTOP; //@line 11496
   STACKTOP = sp; //@line 11497
   return 0; //@line 11497
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11499
  if (!$$$015) {
   $$0 = $19; //@line 11502
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 11504
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 11509
   $$0 = $19; //@line 11510
  }
 }
 STACKTOP = sp; //@line 11513
 return $$0 | 0; //@line 11513
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13230
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 13236
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 13240
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 13241
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 13242
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 13243
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 160; //@line 13246
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 13248
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 13250
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 13252
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 13254
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 13256
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 13258
    sp = STACKTOP; //@line 13259
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13262
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 13266
    $$0 = $0 + 24 | 0; //@line 13267
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 13269
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 13270
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 13275
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 13281
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 13284
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 161; //@line 13289
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 13291
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 13293
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 13295
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 13297
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 13299
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 13301
    sp = STACKTOP; //@line 13302
    return;
   }
  }
 } while (0);
 return;
}
function _main__async_cb_11($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $16 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 69
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 71
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 73
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 77
 $9 = HEAP32[HEAP32[$0 + 12 >> 2] >> 2] | 0; //@line 78
 if (!$9) {
  $16 = $4 + 4 | 0; //@line 82
  HEAP32[$16 >> 2] = 0; //@line 84
  HEAP32[$16 + 4 >> 2] = 0; //@line 87
  HEAP32[$4 >> 2] = 8; //@line 88
  $20 = $4 + 12 | 0; //@line 89
  HEAP32[$20 >> 2] = 504; //@line 90
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(16) | 0; //@line 91
  __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5712, $4, 2.5); //@line 92
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 115; //@line 95
   $21 = $ReallocAsyncCtx7 + 4 | 0; //@line 96
   HEAP32[$21 >> 2] = $20; //@line 97
   $22 = $ReallocAsyncCtx7 + 8 | 0; //@line 98
   HEAP32[$22 >> 2] = $2; //@line 99
   $23 = $ReallocAsyncCtx7 + 12 | 0; //@line 100
   HEAP32[$23 >> 2] = $4; //@line 101
   sp = STACKTOP; //@line 102
   return;
  }
  ___async_unwind = 0; //@line 105
  HEAP32[$ReallocAsyncCtx7 >> 2] = 115; //@line 106
  $21 = $ReallocAsyncCtx7 + 4 | 0; //@line 107
  HEAP32[$21 >> 2] = $20; //@line 108
  $22 = $ReallocAsyncCtx7 + 8 | 0; //@line 109
  HEAP32[$22 >> 2] = $2; //@line 110
  $23 = $ReallocAsyncCtx7 + 12 | 0; //@line 111
  HEAP32[$23 >> 2] = $4; //@line 112
  sp = STACKTOP; //@line 113
  return;
 } else {
  $12 = HEAP32[$9 + 8 >> 2] | 0; //@line 117
  $ReallocAsyncCtx = _emscripten_realloc_async_context(12) | 0; //@line 118
  FUNCTION_TABLE_vi[$12 & 255]($8); //@line 119
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 114; //@line 122
   $13 = $ReallocAsyncCtx + 4 | 0; //@line 123
   HEAP32[$13 >> 2] = $4; //@line 124
   $14 = $ReallocAsyncCtx + 8 | 0; //@line 125
   HEAP32[$14 >> 2] = $2; //@line 126
   sp = STACKTOP; //@line 127
   return;
  }
  ___async_unwind = 0; //@line 130
  HEAP32[$ReallocAsyncCtx >> 2] = 114; //@line 131
  $13 = $ReallocAsyncCtx + 4 | 0; //@line 132
  HEAP32[$13 >> 2] = $4; //@line 133
  $14 = $ReallocAsyncCtx + 8 | 0; //@line 134
  HEAP32[$14 >> 2] = $2; //@line 135
  sp = STACKTOP; //@line 136
  return;
 }
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11540
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 11545
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 11550
  } else {
   $20 = $0 & 255; //@line 11552
   $21 = $0 & 255; //@line 11553
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 11559
   } else {
    $26 = $1 + 20 | 0; //@line 11561
    $27 = HEAP32[$26 >> 2] | 0; //@line 11562
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 11568
     HEAP8[$27 >> 0] = $20; //@line 11569
     $34 = $21; //@line 11570
    } else {
     label = 12; //@line 11572
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 11577
     $32 = ___overflow($1, $0) | 0; //@line 11578
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 137; //@line 11581
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 11583
      sp = STACKTOP; //@line 11584
      return 0; //@line 11585
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 11587
      $34 = $32; //@line 11588
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 11593
   $$0 = $34; //@line 11594
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 11599
   $8 = $0 & 255; //@line 11600
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 11606
    $14 = HEAP32[$13 >> 2] | 0; //@line 11607
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 11613
     HEAP8[$14 >> 0] = $7; //@line 11614
     $$0 = $8; //@line 11615
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 11619
   $19 = ___overflow($1, $0) | 0; //@line 11620
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 136; //@line 11623
    sp = STACKTOP; //@line 11624
    return 0; //@line 11625
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11627
    $$0 = $19; //@line 11628
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 11633
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 7433
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 7436
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 7439
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 7442
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 7448
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 7457
     $24 = $13 >>> 2; //@line 7458
     $$090 = 0; //@line 7459
     $$094 = $7; //@line 7459
     while (1) {
      $25 = $$094 >>> 1; //@line 7461
      $26 = $$090 + $25 | 0; //@line 7462
      $27 = $26 << 1; //@line 7463
      $28 = $27 + $23 | 0; //@line 7464
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 7467
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 7471
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 7477
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 7485
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 7489
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 7495
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 7500
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 7503
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 7503
      }
     }
     $46 = $27 + $24 | 0; //@line 7506
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 7509
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 7513
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 7525
     } else {
      $$4 = 0; //@line 7527
     }
    } else {
     $$4 = 0; //@line 7530
    }
   } else {
    $$4 = 0; //@line 7533
   }
  } else {
   $$4 = 0; //@line 7536
  }
 } while (0);
 return $$4 | 0; //@line 7539
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7098
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 7103
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 7108
  } else {
   $20 = $0 & 255; //@line 7110
   $21 = $0 & 255; //@line 7111
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 7117
   } else {
    $26 = $1 + 20 | 0; //@line 7119
    $27 = HEAP32[$26 >> 2] | 0; //@line 7120
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 7126
     HEAP8[$27 >> 0] = $20; //@line 7127
     $34 = $21; //@line 7128
    } else {
     label = 12; //@line 7130
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7135
     $32 = ___overflow($1, $0) | 0; //@line 7136
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 125; //@line 7139
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 7141
      sp = STACKTOP; //@line 7142
      return 0; //@line 7143
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 7145
      $34 = $32; //@line 7146
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 7151
   $$0 = $34; //@line 7152
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 7157
   $8 = $0 & 255; //@line 7158
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 7164
    $14 = HEAP32[$13 >> 2] | 0; //@line 7165
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 7171
     HEAP8[$14 >> 0] = $7; //@line 7172
     $$0 = $8; //@line 7173
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7177
   $19 = ___overflow($1, $0) | 0; //@line 7178
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 124; //@line 7181
    sp = STACKTOP; //@line 7182
    return 0; //@line 7183
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7185
    $$0 = $19; //@line 7186
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 7191
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7818
 $1 = $0 + 20 | 0; //@line 7819
 $3 = $0 + 28 | 0; //@line 7821
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 7827
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 7828
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 7829
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 131; //@line 7832
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 7834
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 7836
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 7838
    sp = STACKTOP; //@line 7839
    return 0; //@line 7840
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7842
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 7846
     break;
    } else {
     label = 5; //@line 7849
     break;
    }
   }
  } else {
   label = 5; //@line 7854
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 7858
  $14 = HEAP32[$13 >> 2] | 0; //@line 7859
  $15 = $0 + 8 | 0; //@line 7860
  $16 = HEAP32[$15 >> 2] | 0; //@line 7861
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 7869
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 7870
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 7871
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 132; //@line 7874
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 7876
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 7878
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 7880
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 7882
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 7884
     sp = STACKTOP; //@line 7885
     return 0; //@line 7886
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7888
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 7894
  HEAP32[$3 >> 2] = 0; //@line 7895
  HEAP32[$1 >> 2] = 0; //@line 7896
  HEAP32[$15 >> 2] = 0; //@line 7897
  HEAP32[$13 >> 2] = 0; //@line 7898
  $$0 = 0; //@line 7899
 }
 return $$0 | 0; //@line 7901
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
 _mbed_tracef(16, 1276, 1304, $vararg_buffer); //@line 92
 _emscripten_asm_const_i(0) | 0; //@line 93
 $10 = HEAP32[$0 + 752 >> 2] | 0; //@line 95
 if (($10 | 0) != ($6 | 0)) {
  HEAP32[$vararg_buffer4 >> 2] = $10; //@line 98
  HEAP32[$vararg_buffer4 + 4 >> 2] = $6; //@line 100
  _mbed_tracef(16, 1276, 1386, $vararg_buffer4); //@line 101
  STACKTOP = sp; //@line 102
  return;
 }
 $13 = HEAP32[$0 + 756 >> 2] | 0; //@line 105
 if (($13 | 0) != ($7 | 0)) {
  HEAP32[$vararg_buffer8 >> 2] = $13; //@line 108
  HEAP32[$vararg_buffer8 + 4 >> 2] = $7; //@line 110
  _mbed_tracef(16, 1276, 1433, $vararg_buffer8); //@line 111
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
  _mbed_tracef(16, 1276, 1480, $vararg_buffer12); //@line 137
  STACKTOP = sp; //@line 138
  return;
 }
}
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 7582
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 7588
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 7594
   } else {
    $7 = $1 & 255; //@line 7596
    $$03039 = $0; //@line 7597
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 7599
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 7604
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 7607
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 7612
      break;
     } else {
      $$03039 = $13; //@line 7615
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 7619
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 7620
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 7628
     $25 = $18; //@line 7628
     while (1) {
      $24 = $25 ^ $17; //@line 7630
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 7637
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 7640
      $25 = HEAP32[$31 >> 2] | 0; //@line 7641
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 7650
       break;
      } else {
       $$02936 = $31; //@line 7648
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 7655
    }
   } while (0);
   $38 = $1 & 255; //@line 7658
   $$1 = $$029$lcssa; //@line 7659
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 7661
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 7667
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 7670
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 7675
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 7324
 $4 = HEAP32[$3 >> 2] | 0; //@line 7325
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 7332
   label = 5; //@line 7333
  } else {
   $$1 = 0; //@line 7335
  }
 } else {
  $12 = $4; //@line 7339
  label = 5; //@line 7340
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 7344
   $10 = HEAP32[$9 >> 2] | 0; //@line 7345
   $14 = $10; //@line 7348
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 7353
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 7361
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 7365
       $$141 = $0; //@line 7365
       $$143 = $1; //@line 7365
       $31 = $14; //@line 7365
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 7368
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 7375
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 7380
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 7383
      break L5;
     }
     $$139 = $$038; //@line 7389
     $$141 = $0 + $$038 | 0; //@line 7389
     $$143 = $1 - $$038 | 0; //@line 7389
     $31 = HEAP32[$9 >> 2] | 0; //@line 7389
    } else {
     $$139 = 0; //@line 7391
     $$141 = $0; //@line 7391
     $$143 = $1; //@line 7391
     $31 = $14; //@line 7391
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 7394
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 7397
   $$1 = $$139 + $$143 | 0; //@line 7399
  }
 } while (0);
 return $$1 | 0; //@line 7402
}
function _main__async_cb_10($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $13 = 0, $17 = 0, $18 = 0, $19 = 0, $4 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 4
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10
 $7 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 11
 if (!$7) {
  $13 = $4 + 4 | 0; //@line 15
  HEAP32[$13 >> 2] = 0; //@line 17
  HEAP32[$13 + 4 >> 2] = 0; //@line 20
  HEAP32[$4 >> 2] = 9; //@line 21
  $17 = $4 + 12 | 0; //@line 22
  HEAP32[$17 >> 2] = 504; //@line 23
  $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 24
  __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5864, $4); //@line 25
  if (___async) {
   HEAP32[$ReallocAsyncCtx9 >> 2] = 117; //@line 28
   $18 = $ReallocAsyncCtx9 + 4 | 0; //@line 29
   HEAP32[$18 >> 2] = $17; //@line 30
   $19 = $ReallocAsyncCtx9 + 8 | 0; //@line 31
   HEAP32[$19 >> 2] = $4; //@line 32
   sp = STACKTOP; //@line 33
   return;
  }
  ___async_unwind = 0; //@line 36
  HEAP32[$ReallocAsyncCtx9 >> 2] = 117; //@line 37
  $18 = $ReallocAsyncCtx9 + 4 | 0; //@line 38
  HEAP32[$18 >> 2] = $17; //@line 39
  $19 = $ReallocAsyncCtx9 + 8 | 0; //@line 40
  HEAP32[$19 >> 2] = $4; //@line 41
  sp = STACKTOP; //@line 42
  return;
 } else {
  $10 = HEAP32[$7 + 8 >> 2] | 0; //@line 46
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 47
  FUNCTION_TABLE_vi[$10 & 255]($6); //@line 48
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 116; //@line 51
   $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 52
   HEAP32[$11 >> 2] = $4; //@line 53
   sp = STACKTOP; //@line 54
   return;
  }
  ___async_unwind = 0; //@line 57
  HEAP32[$ReallocAsyncCtx2 >> 2] = 116; //@line 58
  $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 59
  HEAP32[$11 >> 2] = $4; //@line 60
  sp = STACKTOP; //@line 61
  return;
 }
}
function __GLOBAL__sub_I_main_cpp() {
 var $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3104
 HEAP32[1448] = 0; //@line 3105
 HEAP32[1449] = 0; //@line 3105
 HEAP32[1450] = 0; //@line 3105
 HEAP32[1451] = 0; //@line 3105
 HEAP32[1452] = 0; //@line 3105
 HEAP32[1453] = 0; //@line 3105
 _gpio_init_out(5792, 50); //@line 3106
 HEAP32[1454] = 0; //@line 3107
 HEAP32[1455] = 0; //@line 3107
 HEAP32[1456] = 0; //@line 3107
 HEAP32[1457] = 0; //@line 3107
 HEAP32[1458] = 0; //@line 3107
 HEAP32[1459] = 0; //@line 3107
 _gpio_init_out(5816, 52); //@line 3108
 HEAP32[1460] = 0; //@line 3109
 HEAP32[1461] = 0; //@line 3109
 HEAP32[1462] = 0; //@line 3109
 HEAP32[1463] = 0; //@line 3109
 HEAP32[1464] = 0; //@line 3109
 HEAP32[1465] = 0; //@line 3109
 _gpio_init_out(5840, 53); //@line 3110
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3111
 __ZN4mbed10TimerEventC2Ev(5648); //@line 3112
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 105; //@line 3115
  sp = STACKTOP; //@line 3116
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3119
 HEAP32[1412] = 492; //@line 3120
 HEAP32[1422] = 0; //@line 3121
 HEAP32[1423] = 0; //@line 3121
 HEAP32[1424] = 0; //@line 3121
 HEAP32[1425] = 0; //@line 3121
 HEAP8[5704] = 1; //@line 3122
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3123
 __ZN4mbed10TimerEventC2Ev(5712); //@line 3124
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 106; //@line 3127
  sp = STACKTOP; //@line 3128
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3131
  HEAP32[1438] = 0; //@line 3132
  HEAP32[1439] = 0; //@line 3132
  HEAP32[1440] = 0; //@line 3132
  HEAP32[1441] = 0; //@line 3132
  HEAP8[5768] = 1; //@line 3133
  HEAP32[1428] = 352; //@line 3134
  __ZN4mbed11InterruptInC2E7PinName(5864, 1337); //@line 3135
  return;
 }
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_29($0) {
 $0 = $0 | 0;
 var $$phi$trans$insert = 0, $$pre10 = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1611
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1615
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1617
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1619
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1621
 $$phi$trans$insert = (HEAP32[$0 + 4 >> 2] | 0) + 12 | 0; //@line 1622
 $$pre10 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 1623
 if (!$$pre10) {
  HEAP32[$4 >> 2] = 0; //@line 1626
  _gpio_irq_set($10 + 28 | 0, 2, 0); //@line 1628
  return;
 }
 $13 = HEAP32[$$pre10 + 4 >> 2] | 0; //@line 1632
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 1633
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 1634
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 31; //@line 1637
  $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 1638
  HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 1639
  $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 1640
  HEAP32[$15 >> 2] = $4; //@line 1641
  $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 1642
  HEAP32[$16 >> 2] = $8; //@line 1643
  $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 1644
  HEAP32[$17 >> 2] = $10; //@line 1645
  sp = STACKTOP; //@line 1646
  return;
 }
 ___async_unwind = 0; //@line 1649
 HEAP32[$ReallocAsyncCtx4 >> 2] = 31; //@line 1650
 $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 1651
 HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 1652
 $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 1653
 HEAP32[$15 >> 2] = $4; //@line 1654
 $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 1655
 HEAP32[$16 >> 2] = $8; //@line 1656
 $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 1657
 HEAP32[$17 >> 2] = $10; //@line 1658
 sp = STACKTOP; //@line 1659
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_59($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3080
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3084
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3086
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3088
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3090
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3092
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3094
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3096
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 3099
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 3100
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 3116
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 3117
    if (!___async) {
     ___async_unwind = 0; //@line 3120
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 158; //@line 3122
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 3124
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 3126
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 3128
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 3130
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 3132
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 3134
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 3136
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 3138
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 3141
    sp = STACKTOP; //@line 3142
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
 sp = STACKTOP; //@line 7210
 STACKTOP = STACKTOP + 16 | 0; //@line 7211
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7211
 $2 = sp; //@line 7212
 $3 = $1 & 255; //@line 7213
 HEAP8[$2 >> 0] = $3; //@line 7214
 $4 = $0 + 16 | 0; //@line 7215
 $5 = HEAP32[$4 >> 2] | 0; //@line 7216
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 7223
   label = 4; //@line 7224
  } else {
   $$0 = -1; //@line 7226
  }
 } else {
  $12 = $5; //@line 7229
  label = 4; //@line 7230
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 7234
   $10 = HEAP32[$9 >> 2] | 0; //@line 7235
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 7238
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 7245
     HEAP8[$10 >> 0] = $3; //@line 7246
     $$0 = $13; //@line 7247
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 7252
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7253
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 7254
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 126; //@line 7257
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 7259
    sp = STACKTOP; //@line 7260
    STACKTOP = sp; //@line 7261
    return 0; //@line 7261
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 7263
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 7268
   } else {
    $$0 = -1; //@line 7270
   }
  }
 } while (0);
 STACKTOP = sp; //@line 7274
 return $$0 | 0; //@line 7274
}
function _fflush__async_cb_3($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13600
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13602
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 13604
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 13608
  } else {
   $$02327 = $$02325; //@line 13610
   $$02426 = $AsyncRetVal; //@line 13610
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 13617
    } else {
     $16 = 0; //@line 13619
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 13631
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 13634
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 13637
     break L3;
    } else {
     $$02327 = $$023; //@line 13640
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 13643
   $13 = ___fflush_unlocked($$02327) | 0; //@line 13644
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 13648
    ___async_unwind = 0; //@line 13649
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 130; //@line 13651
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 13653
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 13655
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 13657
   sp = STACKTOP; //@line 13658
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 13662
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 13664
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 5868
 value = value & 255; //@line 5870
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 5873
   ptr = ptr + 1 | 0; //@line 5874
  }
  aligned_end = end & -4 | 0; //@line 5877
  block_aligned_end = aligned_end - 64 | 0; //@line 5878
  value4 = value | value << 8 | value << 16 | value << 24; //@line 5879
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 5882
   HEAP32[ptr + 4 >> 2] = value4; //@line 5883
   HEAP32[ptr + 8 >> 2] = value4; //@line 5884
   HEAP32[ptr + 12 >> 2] = value4; //@line 5885
   HEAP32[ptr + 16 >> 2] = value4; //@line 5886
   HEAP32[ptr + 20 >> 2] = value4; //@line 5887
   HEAP32[ptr + 24 >> 2] = value4; //@line 5888
   HEAP32[ptr + 28 >> 2] = value4; //@line 5889
   HEAP32[ptr + 32 >> 2] = value4; //@line 5890
   HEAP32[ptr + 36 >> 2] = value4; //@line 5891
   HEAP32[ptr + 40 >> 2] = value4; //@line 5892
   HEAP32[ptr + 44 >> 2] = value4; //@line 5893
   HEAP32[ptr + 48 >> 2] = value4; //@line 5894
   HEAP32[ptr + 52 >> 2] = value4; //@line 5895
   HEAP32[ptr + 56 >> 2] = value4; //@line 5896
   HEAP32[ptr + 60 >> 2] = value4; //@line 5897
   ptr = ptr + 64 | 0; //@line 5898
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 5902
   ptr = ptr + 4 | 0; //@line 5903
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 5908
  ptr = ptr + 1 | 0; //@line 5909
 }
 return end - num | 0; //@line 5911
}
function _main__async_cb_7($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 13865
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13867
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13869
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13871
 $8 = $4 + 4 | 0; //@line 13873
 HEAP32[$8 >> 2] = 0; //@line 13875
 HEAP32[$8 + 4 >> 2] = 0; //@line 13878
 HEAP32[$4 >> 2] = 7; //@line 13879
 $12 = $4 + 12 | 0; //@line 13880
 HEAP32[$12 >> 2] = 504; //@line 13881
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(20) | 0; //@line 13882
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5648, $4, 1.0); //@line 13883
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 113; //@line 13886
  $13 = $ReallocAsyncCtx8 + 4 | 0; //@line 13887
  HEAP32[$13 >> 2] = $2; //@line 13888
  $14 = $ReallocAsyncCtx8 + 8 | 0; //@line 13889
  HEAP32[$14 >> 2] = $6; //@line 13890
  $15 = $ReallocAsyncCtx8 + 12 | 0; //@line 13891
  HEAP32[$15 >> 2] = $12; //@line 13892
  $16 = $ReallocAsyncCtx8 + 16 | 0; //@line 13893
  HEAP32[$16 >> 2] = $4; //@line 13894
  sp = STACKTOP; //@line 13895
  return;
 }
 ___async_unwind = 0; //@line 13898
 HEAP32[$ReallocAsyncCtx8 >> 2] = 113; //@line 13899
 $13 = $ReallocAsyncCtx8 + 4 | 0; //@line 13900
 HEAP32[$13 >> 2] = $2; //@line 13901
 $14 = $ReallocAsyncCtx8 + 8 | 0; //@line 13902
 HEAP32[$14 >> 2] = $6; //@line 13903
 $15 = $ReallocAsyncCtx8 + 12 | 0; //@line 13904
 HEAP32[$15 >> 2] = $12; //@line 13905
 $16 = $ReallocAsyncCtx8 + 16 | 0; //@line 13906
 HEAP32[$16 >> 2] = $4; //@line 13907
 sp = STACKTOP; //@line 13908
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3017
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3021
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3023
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3025
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3027
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3029
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3031
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 3034
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 3035
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 3044
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 3045
    if (!___async) {
     ___async_unwind = 0; //@line 3048
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 159; //@line 3050
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 3052
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 3054
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 3056
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 3058
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 3060
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 3062
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 3064
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 3067
    sp = STACKTOP; //@line 3068
    return;
   }
  }
 }
 return;
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13501
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 13511
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 13511
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 13511
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 13515
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 13518
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 13521
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 13529
  } else {
   $20 = 0; //@line 13531
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 13541
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 13545
  HEAP32[___async_retval >> 2] = $$1; //@line 13547
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 13550
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 13551
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 13555
  ___async_unwind = 0; //@line 13556
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 130; //@line 13558
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 13560
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 13562
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 13564
 sp = STACKTOP; //@line 13565
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5310
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5312
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5314
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5316
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 5321
  } else {
   $9 = $4 + 4 | 0; //@line 5323
   $10 = HEAP32[$9 >> 2] | 0; //@line 5324
   $11 = $4 + 8 | 0; //@line 5325
   $12 = HEAP32[$11 >> 2] | 0; //@line 5326
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 5330
    HEAP32[$6 >> 2] = 0; //@line 5331
    HEAP32[$2 >> 2] = 0; //@line 5332
    HEAP32[$11 >> 2] = 0; //@line 5333
    HEAP32[$9 >> 2] = 0; //@line 5334
    $$0 = 0; //@line 5335
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 5342
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 5343
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 5344
   if (!___async) {
    ___async_unwind = 0; //@line 5347
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 132; //@line 5349
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 5351
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 5353
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 5355
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 5357
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 5359
   sp = STACKTOP; //@line 5360
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 5365
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1545
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1547
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1549
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1551
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1553
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1555
 $$pre = HEAP32[$2 >> 2] | 0; //@line 1556
 if (!$$pre) {
  HEAP32[$4 >> 2] = 0; //@line 1559
  _gpio_irq_set($10 + 28 | 0, 2, 1); //@line 1561
  return;
 }
 $13 = HEAP32[$$pre + 4 >> 2] | 0; //@line 1565
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 1566
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 1567
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 1570
  $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 1571
  HEAP32[$14 >> 2] = $2; //@line 1572
  $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 1573
  HEAP32[$15 >> 2] = $4; //@line 1574
  $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 1575
  HEAP32[$16 >> 2] = $10; //@line 1576
  sp = STACKTOP; //@line 1577
  return;
 }
 ___async_unwind = 0; //@line 1580
 HEAP32[$ReallocAsyncCtx2 >> 2] = 29; //@line 1581
 $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 1582
 HEAP32[$14 >> 2] = $2; //@line 1583
 $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 1584
 HEAP32[$15 >> 2] = $4; //@line 1585
 $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 1586
 HEAP32[$16 >> 2] = $10; //@line 1587
 sp = STACKTOP; //@line 1588
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 10590
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 10595
    $$0 = 1; //@line 10596
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 10609
     $$0 = 1; //@line 10610
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 10614
     $$0 = -1; //@line 10615
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 10625
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 10629
    $$0 = 2; //@line 10630
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 10642
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 10648
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 10652
    $$0 = 3; //@line 10653
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 10663
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 10669
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 10675
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 10679
    $$0 = 4; //@line 10680
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 10684
    $$0 = -1; //@line 10685
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 10690
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_27($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 1490
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1492
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1494
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1496
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1498
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 1503
  return;
 }
 dest = $2 + 4 | 0; //@line 1507
 stop = dest + 52 | 0; //@line 1507
 do {
  HEAP32[dest >> 2] = 0; //@line 1507
  dest = dest + 4 | 0; //@line 1507
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 1508
 HEAP32[$2 + 8 >> 2] = $4; //@line 1510
 HEAP32[$2 + 12 >> 2] = -1; //@line 1512
 HEAP32[$2 + 48 >> 2] = 1; //@line 1514
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 1517
 $16 = HEAP32[$6 >> 2] | 0; //@line 1518
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 1519
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 1520
 if (!___async) {
  ___async_unwind = 0; //@line 1523
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 144; //@line 1525
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 1527
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 1529
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 1531
 sp = STACKTOP; //@line 1532
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_60($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3153
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3157
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3159
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3161
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3163
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3165
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 3168
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 3169
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 3175
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 3176
   if (!___async) {
    ___async_unwind = 0; //@line 3179
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 157; //@line 3181
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 3183
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 3185
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 3187
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 3189
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 3191
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 3193
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 3196
   sp = STACKTOP; //@line 3197
   return;
  }
 }
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 13771
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13773
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13775
 $6 = $2 + 4 | 0; //@line 13777
 HEAP32[$6 >> 2] = 0; //@line 13779
 HEAP32[$6 + 4 >> 2] = 0; //@line 13782
 HEAP32[$2 >> 2] = 8; //@line 13783
 $10 = $2 + 12 | 0; //@line 13784
 HEAP32[$10 >> 2] = 504; //@line 13785
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(16) | 0; //@line 13786
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5712, $2, 2.5); //@line 13787
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 115; //@line 13790
  $11 = $ReallocAsyncCtx7 + 4 | 0; //@line 13791
  HEAP32[$11 >> 2] = $10; //@line 13792
  $12 = $ReallocAsyncCtx7 + 8 | 0; //@line 13793
  HEAP32[$12 >> 2] = $4; //@line 13794
  $13 = $ReallocAsyncCtx7 + 12 | 0; //@line 13795
  HEAP32[$13 >> 2] = $2; //@line 13796
  sp = STACKTOP; //@line 13797
  return;
 }
 ___async_unwind = 0; //@line 13800
 HEAP32[$ReallocAsyncCtx7 >> 2] = 115; //@line 13801
 $11 = $ReallocAsyncCtx7 + 4 | 0; //@line 13802
 HEAP32[$11 >> 2] = $10; //@line 13803
 $12 = $ReallocAsyncCtx7 + 8 | 0; //@line 13804
 HEAP32[$12 >> 2] = $4; //@line 13805
 $13 = $ReallocAsyncCtx7 + 12 | 0; //@line 13806
 HEAP32[$13 >> 2] = $2; //@line 13807
 sp = STACKTOP; //@line 13808
 return;
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 9474
  $8 = $0; //@line 9474
  $9 = $1; //@line 9474
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 9476
   $$0914 = $$0914 + -1 | 0; //@line 9480
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 9481
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 9482
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 9490
   }
  }
  $$010$lcssa$off0 = $8; //@line 9495
  $$09$lcssa = $$0914; //@line 9495
 } else {
  $$010$lcssa$off0 = $0; //@line 9497
  $$09$lcssa = $2; //@line 9497
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 9501
 } else {
  $$012 = $$010$lcssa$off0; //@line 9503
  $$111 = $$09$lcssa; //@line 9503
  while (1) {
   $26 = $$111 + -1 | 0; //@line 9508
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 9509
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 9513
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 9516
    $$111 = $26; //@line 9516
   }
  }
 }
 return $$1$lcssa | 0; //@line 9520
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4510
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4512
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4516
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4518
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4520
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4522
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 4526
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 4529
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 4530
   if (!___async) {
    ___async_unwind = 0; //@line 4533
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 161; //@line 4535
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 4537
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 4539
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 4541
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 4543
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 4545
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 4547
   sp = STACKTOP; //@line 4548
   return;
  }
 }
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 6976
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 6981
   label = 4; //@line 6982
  } else {
   $$01519 = $0; //@line 6984
   $23 = $1; //@line 6984
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 6989
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 6992
    $23 = $6; //@line 6993
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 6997
     label = 4; //@line 6998
     break;
    } else {
     $$01519 = $6; //@line 7001
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 7007
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 7009
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 7017
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 7025
  } else {
   $$pn = $$0; //@line 7027
   while (1) {
    $19 = $$pn + 1 | 0; //@line 7029
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 7033
     break;
    } else {
     $$pn = $19; //@line 7036
    }
   }
  }
  $$sink = $$1$lcssa; //@line 7041
 }
 return $$sink - $1 | 0; //@line 7044
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 12145
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 12152
   $10 = $1 + 16 | 0; //@line 12153
   $11 = HEAP32[$10 >> 2] | 0; //@line 12154
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 12157
    HEAP32[$1 + 24 >> 2] = $4; //@line 12159
    HEAP32[$1 + 36 >> 2] = 1; //@line 12161
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 12171
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 12176
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 12179
    HEAP8[$1 + 54 >> 0] = 1; //@line 12181
    break;
   }
   $21 = $1 + 24 | 0; //@line 12184
   $22 = HEAP32[$21 >> 2] | 0; //@line 12185
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 12188
    $28 = $4; //@line 12189
   } else {
    $28 = $22; //@line 12191
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 12200
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
      HEAP32[$AsyncCtx >> 2] = 26; //@line 279
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
      HEAP32[$AsyncCtx2 >> 2] = 27; //@line 300
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
 sp = STACKTOP; //@line 11639
 $1 = HEAP32[163] | 0; //@line 11640
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 11646
 } else {
  $19 = 0; //@line 11648
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 11654
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 11660
    $12 = HEAP32[$11 >> 2] | 0; //@line 11661
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 11667
     HEAP8[$12 >> 0] = 10; //@line 11668
     $22 = 0; //@line 11669
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 11673
   $17 = ___overflow($1, 10) | 0; //@line 11674
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 138; //@line 11677
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 11679
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 11681
    sp = STACKTOP; //@line 11682
    return 0; //@line 11683
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 11685
    $22 = $17 >> 31; //@line 11687
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 11694
 }
 return $22 | 0; //@line 11696
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_30($0) {
 $0 = $0 | 0;
 var $$pre$i$i4 = 0, $12 = 0, $13 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 1665
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1671
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1673
 $$pre$i$i4 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 1674
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = $$pre$i$i4; //@line 1675
 if (!$$pre$i$i4) {
  _gpio_irq_set($8 + 28 | 0, 2, 0); //@line 1679
  return;
 }
 $12 = HEAP32[$$pre$i$i4 + 8 >> 2] | 0; //@line 1684
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(12) | 0; //@line 1685
 FUNCTION_TABLE_vi[$12 & 255]($6); //@line 1686
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 32; //@line 1689
  $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 1690
  HEAP32[$13 >> 2] = $6; //@line 1691
  $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 1692
  HEAP32[$14 >> 2] = $8; //@line 1693
  sp = STACKTOP; //@line 1694
  return;
 }
 ___async_unwind = 0; //@line 1697
 HEAP32[$ReallocAsyncCtx5 >> 2] = 32; //@line 1698
 $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 1699
 HEAP32[$13 >> 2] = $6; //@line 1700
 $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 1701
 HEAP32[$14 >> 2] = $8; //@line 1702
 sp = STACKTOP; //@line 1703
 return;
}
function __ZN4mbed11InterruptInD0Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 195
 HEAP32[$0 >> 2] = 336; //@line 196
 _gpio_irq_free($0 + 28 | 0); //@line 198
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 200
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 206
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 207
   FUNCTION_TABLE_vi[$7 & 255]($0 + 56 | 0); //@line 208
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 24; //@line 211
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
  HEAP32[$AsyncCtx3 >> 2] = 25; //@line 236
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
 sp = STACKTOP; //@line 971
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 973
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 975
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 977
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 982
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 984
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 989
 $16 = _snprintf($4, $6, 1732, $2) | 0; //@line 990
 $$18 = ($16 | 0) >= ($6 | 0) ? 0 : $16; //@line 992
 $19 = $4 + $$18 | 0; //@line 994
 $20 = $6 - $$18 | 0; //@line 995
 if (($$18 | 0) > 0) {
  if (!(($$18 | 0) < 1 | ($20 | 0) < 1 | $10 ^ 1)) {
   _snprintf($19, $20, 1810, $12) | 0; //@line 1003
  }
 }
 $23 = HEAP32[107] | 0; //@line 1006
 $24 = HEAP32[100] | 0; //@line 1007
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 1008
 FUNCTION_TABLE_vi[$23 & 255]($24); //@line 1009
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 53; //@line 1012
  sp = STACKTOP; //@line 1013
  return;
 }
 ___async_unwind = 0; //@line 1016
 HEAP32[$ReallocAsyncCtx7 >> 2] = 53; //@line 1017
 sp = STACKTOP; //@line 1018
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_76($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4558
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4564
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4566
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4568
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4570
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 4575
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 4577
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 4578
 if (!___async) {
  ___async_unwind = 0; //@line 4581
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 161; //@line 4583
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 4585
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 4587
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 4589
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 4591
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 4593
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 4595
 sp = STACKTOP; //@line 4596
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12004
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 12013
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 12018
      HEAP32[$13 >> 2] = $2; //@line 12019
      $19 = $1 + 40 | 0; //@line 12020
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 12023
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 12033
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 12037
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 12044
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
 $$016 = 0; //@line 10710
 while (1) {
  if ((HEAPU8[3181 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 10717
   break;
  }
  $7 = $$016 + 1 | 0; //@line 10720
  if (($7 | 0) == 87) {
   $$01214 = 3269; //@line 10723
   $$115 = 87; //@line 10723
   label = 5; //@line 10724
   break;
  } else {
   $$016 = $7; //@line 10727
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 3269; //@line 10733
  } else {
   $$01214 = 3269; //@line 10735
   $$115 = $$016; //@line 10735
   label = 5; //@line 10736
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 10741
   $$113 = $$01214; //@line 10742
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 10746
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 10753
   if (!$$115) {
    $$012$lcssa = $$113; //@line 10756
    break;
   } else {
    $$01214 = $$113; //@line 10759
    label = 5; //@line 10760
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 10767
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2564
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2566
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2568
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2570
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 2572
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 2574
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 5209; //@line 2579
  HEAP32[$4 + 4 >> 2] = $6; //@line 2581
  _abort_message(5118, $4); //@line 2582
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 2585
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 2588
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 2589
 $16 = FUNCTION_TABLE_ii[$15 & 1]($12) | 0; //@line 2590
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 2594
  ___async_unwind = 0; //@line 2595
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 140; //@line 2597
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 2599
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 2601
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 2603
 sp = STACKTOP; //@line 2604
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4343
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4345
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4347
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4351
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 4355
  label = 4; //@line 4356
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 4361
   label = 4; //@line 4362
  } else {
   $$037$off039 = 3; //@line 4364
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 4368
  $17 = $8 + 40 | 0; //@line 4369
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 4372
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 4382
    $$037$off039 = $$037$off038; //@line 4383
   } else {
    $$037$off039 = $$037$off038; //@line 4385
   }
  } else {
   $$037$off039 = $$037$off038; //@line 4388
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 4391
 return;
}
function _strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $2 = 0, $5 = 0;
 $2 = HEAP8[$1 >> 0] | 0; //@line 10783
 do {
  if (!($2 << 24 >> 24)) {
   $$0 = $0; //@line 10787
  } else {
   $5 = _strchr($0, $2 << 24 >> 24) | 0; //@line 10790
   if (!$5) {
    $$0 = 0; //@line 10793
   } else {
    if (!(HEAP8[$1 + 1 >> 0] | 0)) {
     $$0 = $5; //@line 10799
    } else {
     if (!(HEAP8[$5 + 1 >> 0] | 0)) {
      $$0 = 0; //@line 10805
     } else {
      if (!(HEAP8[$1 + 2 >> 0] | 0)) {
       $$0 = _twobyte_strstr($5, $1) | 0; //@line 10812
       break;
      }
      if (!(HEAP8[$5 + 2 >> 0] | 0)) {
       $$0 = 0; //@line 10819
      } else {
       if (!(HEAP8[$1 + 3 >> 0] | 0)) {
        $$0 = _threebyte_strstr($5, $1) | 0; //@line 10826
        break;
       }
       if (!(HEAP8[$5 + 3 >> 0] | 0)) {
        $$0 = 0; //@line 10833
       } else {
        if (!(HEAP8[$1 + 4 >> 0] | 0)) {
         $$0 = _fourbyte_strstr($5, $1) | 0; //@line 10840
         break;
        } else {
         $$0 = _twoway_strstr($5, $1) | 0; //@line 10844
         break;
        }
       }
      }
     }
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 10854
}
function __ZN4mbed11InterruptInD2Ev($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 144
 HEAP32[$0 >> 2] = 336; //@line 145
 _gpio_irq_free($0 + 28 | 0); //@line 147
 $3 = HEAP32[$0 + 68 >> 2] | 0; //@line 149
 do {
  if ($3 | 0) {
   $7 = HEAP32[$3 + 8 >> 2] | 0; //@line 155
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 156
   FUNCTION_TABLE_vi[$7 & 255]($0 + 56 | 0); //@line 157
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 22; //@line 160
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
  HEAP32[$AsyncCtx3 >> 2] = 23; //@line 184
  sp = STACKTOP; //@line 185
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 188
 return;
}
function __ZN4mbed6TickerD0Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2910
 HEAP32[$0 >> 2] = 492; //@line 2911
 $1 = $0 + 40 | 0; //@line 2912
 _emscripten_asm_const_ii(8, $1 | 0) | 0; //@line 2913
 $4 = HEAP32[$0 + 52 >> 2] | 0; //@line 2915
 do {
  if ($4 | 0) {
   $7 = HEAP32[$4 + 8 >> 2] | 0; //@line 2920
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2921
   FUNCTION_TABLE_vi[$7 & 255]($1); //@line 2922
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 98; //@line 2925
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2927
    sp = STACKTOP; //@line 2928
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 2931
    break;
   }
  }
 } while (0);
 $AsyncCtx2 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2936
 __ZN4mbed10TimerEventD2Ev($0); //@line 2937
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 99; //@line 2940
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 2942
  sp = STACKTOP; //@line 2943
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2946
  __ZdlPv($0); //@line 2947
  return;
 }
}
function _main__async_cb_5($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 13814
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13816
 $4 = $2 + 4 | 0; //@line 13818
 HEAP32[$4 >> 2] = 0; //@line 13820
 HEAP32[$4 + 4 >> 2] = 0; //@line 13823
 HEAP32[$2 >> 2] = 9; //@line 13824
 $8 = $2 + 12 | 0; //@line 13825
 HEAP32[$8 >> 2] = 504; //@line 13826
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 13827
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5864, $2); //@line 13828
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 117; //@line 13831
  $9 = $ReallocAsyncCtx9 + 4 | 0; //@line 13832
  HEAP32[$9 >> 2] = $8; //@line 13833
  $10 = $ReallocAsyncCtx9 + 8 | 0; //@line 13834
  HEAP32[$10 >> 2] = $2; //@line 13835
  sp = STACKTOP; //@line 13836
  return;
 }
 ___async_unwind = 0; //@line 13839
 HEAP32[$ReallocAsyncCtx9 >> 2] = 117; //@line 13840
 $9 = $ReallocAsyncCtx9 + 4 | 0; //@line 13841
 HEAP32[$9 >> 2] = $8; //@line 13842
 $10 = $ReallocAsyncCtx9 + 8 | 0; //@line 13843
 HEAP32[$10 >> 2] = $2; //@line 13844
 sp = STACKTOP; //@line 13845
 return;
}
function _fourbyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$lcssa = 0, $$sink21$lcssa = 0, $$sink2123 = 0, $18 = 0, $32 = 0, $33 = 0, $35 = 0, $39 = 0, $40 = 0, $41 = 0;
 $18 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8 | (HEAPU8[$1 + 3 >> 0] | 0); //@line 10979
 $32 = $0 + 3 | 0; //@line 10993
 $33 = HEAP8[$32 >> 0] | 0; //@line 10994
 $35 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | (HEAPU8[$0 + 2 >> 0] | 0) << 8 | $33 & 255; //@line 10996
 if ($33 << 24 >> 24 == 0 | ($35 | 0) == ($18 | 0)) {
  $$lcssa = $33; //@line 11001
  $$sink21$lcssa = $32; //@line 11001
 } else {
  $$sink2123 = $32; //@line 11003
  $39 = $35; //@line 11003
  while (1) {
   $40 = $$sink2123 + 1 | 0; //@line 11006
   $41 = HEAP8[$40 >> 0] | 0; //@line 11007
   $39 = $39 << 8 | $41 & 255; //@line 11009
   if ($41 << 24 >> 24 == 0 | ($39 | 0) == ($18 | 0)) {
    $$lcssa = $41; //@line 11014
    $$sink21$lcssa = $40; //@line 11014
    break;
   } else {
    $$sink2123 = $40; //@line 11017
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$sink21$lcssa + -3 | 0 : 0) | 0; //@line 11024
}
function __ZN4mbed7Timeout7handlerEv($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 580
 $1 = $0 + 40 | 0; //@line 581
 $2 = $0 + 52 | 0; //@line 582
 $3 = HEAP32[$2 >> 2] | 0; //@line 583
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 587
   _mbed_assert_internal(2237, 2242, 528); //@line 588
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 37; //@line 591
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 593
    HEAP32[$AsyncCtx2 + 8 >> 2] = $1; //@line 595
    sp = STACKTOP; //@line 596
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 599
    $8 = HEAP32[$2 >> 2] | 0; //@line 601
    break;
   }
  } else {
   $8 = $3; //@line 605
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 608
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 609
 FUNCTION_TABLE_vi[$7 & 255]($1); //@line 610
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 38; //@line 613
  sp = STACKTOP; //@line 614
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 617
  return;
 }
}
function _mbed_vtracef__async_cb_25($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1356
 $3 = HEAP32[108] | 0; //@line 1360
 if (HEAP8[$0 + 4 >> 0] & 1 & ($3 | 0) != 0) {
  $5 = HEAP32[100] | 0; //@line 1364
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 1365
  FUNCTION_TABLE_vi[$3 & 255]($5); //@line 1366
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 46; //@line 1369
   sp = STACKTOP; //@line 1370
   return;
  }
  ___async_unwind = 0; //@line 1373
  HEAP32[$ReallocAsyncCtx2 >> 2] = 46; //@line 1374
  sp = STACKTOP; //@line 1375
  return;
 } else {
  $6 = HEAP32[107] | 0; //@line 1378
  $7 = HEAP32[100] | 0; //@line 1379
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 1380
  FUNCTION_TABLE_vi[$6 & 255]($7); //@line 1381
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 48; //@line 1384
   sp = STACKTOP; //@line 1385
   return;
  }
  ___async_unwind = 0; //@line 1388
  HEAP32[$ReallocAsyncCtx4 >> 2] = 48; //@line 1389
  sp = STACKTOP; //@line 1390
  return;
 }
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2977
 $2 = $0 + 12 | 0; //@line 2979
 $3 = HEAP32[$2 >> 2] | 0; //@line 2980
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2984
   _mbed_assert_internal(2237, 2242, 528); //@line 2985
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 101; //@line 2988
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 2990
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 2992
    sp = STACKTOP; //@line 2993
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2996
    $8 = HEAP32[$2 >> 2] | 0; //@line 2998
    break;
   }
  } else {
   $8 = $3; //@line 3002
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 3005
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3007
 FUNCTION_TABLE_vi[$7 & 255]($0); //@line 3008
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 102; //@line 3011
  sp = STACKTOP; //@line 3012
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3015
  return;
 }
}
function _abort_message($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11837
 STACKTOP = STACKTOP + 16 | 0; //@line 11838
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11838
 $1 = sp; //@line 11839
 HEAP32[$1 >> 2] = $varargs; //@line 11840
 $2 = HEAP32[131] | 0; //@line 11841
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 11842
 _vfprintf($2, $0, $1) | 0; //@line 11843
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 141; //@line 11846
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 11848
  sp = STACKTOP; //@line 11849
  STACKTOP = sp; //@line 11850
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 11852
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 11853
 _fputc(10, $2) | 0; //@line 11854
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 142; //@line 11857
  sp = STACKTOP; //@line 11858
  STACKTOP = sp; //@line 11859
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 11861
  _abort(); //@line 11862
 }
}
function __ZN4mbed7TimeoutD0Ev($0) {
 $0 = $0 | 0;
 var $2 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 536
 HEAP32[$0 >> 2] = 492; //@line 537
 __ZN4mbed6Ticker6detachEv($0); //@line 538
 $2 = HEAP32[$0 + 52 >> 2] | 0; //@line 540
 do {
  if ($2 | 0) {
   $6 = HEAP32[$2 + 8 >> 2] | 0; //@line 546
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 547
   FUNCTION_TABLE_vi[$6 & 255]($0 + 40 | 0); //@line 548
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 35; //@line 551
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
  HEAP32[$AsyncCtx2 >> 2] = 36; //@line 566
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 568
  sp = STACKTOP; //@line 569
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 572
  __ZdlPv($0); //@line 573
  return;
 }
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_71($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $15 = 0, $17 = 0, $18 = 0, $21 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4270
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4276
 $8 = $0 + 16 | 0; //@line 4278
 $10 = HEAP32[$8 >> 2] | 0; //@line 4280
 $13 = HEAP32[$8 + 4 >> 2] | 0; //@line 4283
 $15 = HEAP32[$0 + 24 >> 2] | 0; //@line 4285
 $17 = HEAP32[$0 + 28 >> 2] | 0; //@line 4287
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 4289
 __ZN4mbed6Ticker5setupEy($6, $10, $13); //@line 4290
 $18 = HEAP32[$15 >> 2] | 0; //@line 4291
 if (!$18) {
  return;
 }
 $21 = HEAP32[$18 + 8 >> 2] | 0; //@line 4297
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 4298
 FUNCTION_TABLE_vi[$21 & 255]($17); //@line 4299
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 123; //@line 4302
  sp = STACKTOP; //@line 4303
  return;
 }
 ___async_unwind = 0; //@line 4306
 HEAP32[$ReallocAsyncCtx4 >> 2] = 123; //@line 4307
 sp = STACKTOP; //@line 4308
 return;
}
function _threebyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$016$lcssa = 0, $$01618 = 0, $$019 = 0, $$lcssa = 0, $14 = 0, $23 = 0, $24 = 0, $27 = 0, $30 = 0, $31 = 0;
 $14 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8; //@line 10913
 $23 = $0 + 2 | 0; //@line 10922
 $24 = HEAP8[$23 >> 0] | 0; //@line 10923
 $27 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | ($24 & 255) << 8; //@line 10926
 if (($27 | 0) == ($14 | 0) | $24 << 24 >> 24 == 0) {
  $$016$lcssa = $23; //@line 10931
  $$lcssa = $24; //@line 10931
 } else {
  $$01618 = $23; //@line 10933
  $$019 = $27; //@line 10933
  while (1) {
   $30 = $$01618 + 1 | 0; //@line 10935
   $31 = HEAP8[$30 >> 0] | 0; //@line 10936
   $$019 = ($$019 | $31 & 255) << 8; //@line 10939
   if (($$019 | 0) == ($14 | 0) | $31 << 24 >> 24 == 0) {
    $$016$lcssa = $30; //@line 10944
    $$lcssa = $31; //@line 10944
    break;
   } else {
    $$01618 = $30; //@line 10947
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$016$lcssa + -2 | 0 : 0) | 0; //@line 10954
}
function __ZN4mbed6TickerD2Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2869
 HEAP32[$0 >> 2] = 492; //@line 2870
 $1 = $0 + 40 | 0; //@line 2871
 _emscripten_asm_const_ii(8, $1 | 0) | 0; //@line 2872
 $4 = HEAP32[$0 + 52 >> 2] | 0; //@line 2874
 do {
  if ($4 | 0) {
   $7 = HEAP32[$4 + 8 >> 2] | 0; //@line 2879
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2880
   FUNCTION_TABLE_vi[$7 & 255]($1); //@line 2881
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 96; //@line 2884
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2886
    sp = STACKTOP; //@line 2887
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 2890
    break;
   }
  }
 } while (0);
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2895
 __ZN4mbed10TimerEventD2Ev($0); //@line 2896
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 97; //@line 2899
  sp = STACKTOP; //@line 2900
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2903
  return;
 }
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 10541
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 10541
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 10542
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 10543
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 10552
    $$016 = $9; //@line 10555
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 10555
   } else {
    $$016 = $0; //@line 10557
    $storemerge = 0; //@line 10557
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 10559
   $$0 = $$016; //@line 10560
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 10564
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 10570
   HEAP32[tempDoublePtr >> 2] = $2; //@line 10573
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 10573
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 10574
  }
 }
 return +$$0;
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13440
 STACKTOP = STACKTOP + 16 | 0; //@line 13441
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13441
 $3 = sp; //@line 13442
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 13444
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 13447
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 13448
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 13449
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 165; //@line 13452
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 13454
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 13456
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 13458
  sp = STACKTOP; //@line 13459
  STACKTOP = sp; //@line 13460
  return 0; //@line 13460
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 13462
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 13466
 }
 STACKTOP = sp; //@line 13468
 return $8 & 1 | 0; //@line 13468
}
function _main__async_cb_12($0) {
 $0 = $0 | 0;
 var $4 = 0, $5 = 0, $8 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 143
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 147
 $5 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 148
 if (!$5) {
  $ReallocAsyncCtx10 = _emscripten_realloc_async_context(4) | 0; //@line 151
  _wait_ms(-1); //@line 152
  if (___async) {
   HEAP32[$ReallocAsyncCtx10 >> 2] = 119; //@line 155
   sp = STACKTOP; //@line 156
   return;
  }
  ___async_unwind = 0; //@line 159
  HEAP32[$ReallocAsyncCtx10 >> 2] = 119; //@line 160
  sp = STACKTOP; //@line 161
  return;
 } else {
  $8 = HEAP32[$5 + 8 >> 2] | 0; //@line 165
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 166
  FUNCTION_TABLE_vi[$8 & 255]($4); //@line 167
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 118; //@line 170
   sp = STACKTOP; //@line 171
   return;
  }
  ___async_unwind = 0; //@line 174
  HEAP32[$ReallocAsyncCtx3 >> 2] = 118; //@line 175
  sp = STACKTOP; //@line 176
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
 sp = STACKTOP; //@line 12360
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 12366
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 12369
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 12372
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 12373
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 12374
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 147; //@line 12377
    sp = STACKTOP; //@line 12378
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12381
    break;
   }
  }
 } while (0);
 return;
}
function _schedule_interrupt__async_cb_67($0) {
 $0 = $0 | 0;
 var $16 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 3955
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3959
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3961
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3963
 $8 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 3964
 if ($4 >>> 0 > $8 >>> 0) {
  if (!($AsyncRetVal >>> 0 >= $4 >>> 0 | $AsyncRetVal >>> 0 < $8 >>> 0)) {
   return;
  }
 } else {
  if (!($AsyncRetVal >>> 0 >= $4 >>> 0 & $AsyncRetVal >>> 0 < $8 >>> 0)) {
   return;
  }
 }
 $16 = HEAP32[(HEAP32[$6 >> 2] | 0) + 20 >> 2] | 0; //@line 3983
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(4) | 0; //@line 3984
 FUNCTION_TABLE_v[$16 & 15](); //@line 3985
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 69; //@line 3988
  sp = STACKTOP; //@line 3989
  return;
 }
 ___async_unwind = 0; //@line 3992
 HEAP32[$ReallocAsyncCtx6 >> 2] = 69; //@line 3993
 sp = STACKTOP; //@line 3994
 return;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4449
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4457
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4459
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4461
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4463
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4465
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 4467
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 4469
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 4480
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 4481
 HEAP32[$10 >> 2] = 0; //@line 4482
 HEAP32[$12 >> 2] = 0; //@line 4483
 HEAP32[$14 >> 2] = 0; //@line 4484
 HEAP32[$2 >> 2] = 0; //@line 4485
 $33 = HEAP32[$16 >> 2] | 0; //@line 4486
 HEAP32[$16 >> 2] = $33 | $18; //@line 4491
 if ($20 | 0) {
  ___unlockfile($22); //@line 4494
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 4497
 return;
}
function _mbed_vtracef__async_cb_22($0) {
 $0 = $0 | 0;
 var $$pre = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 1087
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1091
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 2) {
  return;
 }
 $5 = $4 + -1 | 0; //@line 1096
 $$pre = HEAP32[110] | 0; //@line 1097
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 1098
 FUNCTION_TABLE_v[$$pre & 15](); //@line 1099
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 55; //@line 1102
  $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 1103
  HEAP32[$6 >> 2] = $4; //@line 1104
  $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 1105
  HEAP32[$7 >> 2] = $5; //@line 1106
  sp = STACKTOP; //@line 1107
  return;
 }
 ___async_unwind = 0; //@line 1110
 HEAP32[$ReallocAsyncCtx9 >> 2] = 55; //@line 1111
 $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 1112
 HEAP32[$6 >> 2] = $4; //@line 1113
 $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 1114
 HEAP32[$7 >> 2] = $5; //@line 1115
 sp = STACKTOP; //@line 1116
 return;
}
function __ZN4mbed7TimeoutD2Ev($0) {
 $0 = $0 | 0;
 var $2 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 495
 HEAP32[$0 >> 2] = 492; //@line 496
 __ZN4mbed6Ticker6detachEv($0); //@line 497
 $2 = HEAP32[$0 + 52 >> 2] | 0; //@line 499
 do {
  if ($2 | 0) {
   $6 = HEAP32[$2 + 8 >> 2] | 0; //@line 505
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 506
   FUNCTION_TABLE_vi[$6 & 255]($0 + 40 | 0); //@line 507
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 33; //@line 510
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
  HEAP32[$AsyncCtx2 >> 2] = 34; //@line 525
  sp = STACKTOP; //@line 526
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 529
  return;
 }
}
function _mbed_vtracef__async_cb_21($0) {
 $0 = $0 | 0;
 var $$pre = 0, $2 = 0, $4 = 0, $5 = 0, $6 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 1054
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1056
 if (($2 | 0) <= 1) {
  return;
 }
 $4 = $2 + -1 | 0; //@line 1061
 $$pre = HEAP32[110] | 0; //@line 1062
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 1063
 FUNCTION_TABLE_v[$$pre & 15](); //@line 1064
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 55; //@line 1067
  $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 1068
  HEAP32[$5 >> 2] = $2; //@line 1069
  $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 1070
  HEAP32[$6 >> 2] = $4; //@line 1071
  sp = STACKTOP; //@line 1072
  return;
 }
 ___async_unwind = 0; //@line 1075
 HEAP32[$ReallocAsyncCtx9 >> 2] = 55; //@line 1076
 $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 1077
 HEAP32[$5 >> 2] = $2; //@line 1078
 $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 1079
 HEAP32[$6 >> 2] = $4; //@line 1080
 sp = STACKTOP; //@line 1081
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
 sp = STACKTOP; //@line 13359
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 13361
 $8 = $7 >> 8; //@line 13362
 if (!($7 & 1)) {
  $$0 = $8; //@line 13366
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 13371
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 13373
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 13376
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13381
 FUNCTION_TABLE_viiiiii[$17 & 3]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 13382
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 163; //@line 13385
  sp = STACKTOP; //@line 13386
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13389
  return;
 }
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12529
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 12535
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 12538
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 12541
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 12542
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 12543
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 150; //@line 12546
    sp = STACKTOP; //@line 12547
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12550
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
 sp = STACKTOP; //@line 13401
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 13403
 $7 = $6 >> 8; //@line 13404
 if (!($6 & 1)) {
  $$0 = $7; //@line 13408
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 13413
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 13415
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 13418
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13423
 FUNCTION_TABLE_viiiii[$16 & 3]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 13424
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 164; //@line 13427
  sp = STACKTOP; //@line 13428
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13431
  return;
 }
}
function _ticker_remove_event($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2189
 $4 = (HEAP32[$0 + 4 >> 2] | 0) + 4 | 0; //@line 2192
 $5 = HEAP32[$4 >> 2] | 0; //@line 2193
 if (($5 | 0) == ($1 | 0)) {
  HEAP32[$4 >> 2] = HEAP32[$1 + 12 >> 2]; //@line 2198
  $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2199
  _schedule_interrupt($0); //@line 2200
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 71; //@line 2203
   sp = STACKTOP; //@line 2204
   return;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2207
  return;
 } else {
  $$0 = $5; //@line 2210
 }
 do {
  if (!$$0) {
   label = 8; //@line 2215
   break;
  }
  $10 = $$0 + 12 | 0; //@line 2218
  $$0 = HEAP32[$10 >> 2] | 0; //@line 2219
 } while (($$0 | 0) != ($1 | 0));
 if ((label | 0) == 8) {
  return;
 }
 HEAP32[$10 >> 2] = HEAP32[$1 + 12 >> 2]; //@line 2232
 return;
}
function ___dynamic_cast__async_cb_50($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2468
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2470
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2472
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2478
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 2493
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 2509
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 2514
    break;
   }
  default:
   {
    $$0 = 0; //@line 2518
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 2523
 return;
}
function _mbed_error_vfprintf__async_cb_54($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2853
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 2855
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2857
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2859
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2861
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2863
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 2865
 _serial_putc(5784, $2 << 24 >> 24); //@line 2866
 if (!___async) {
  ___async_unwind = 0; //@line 2869
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 92; //@line 2871
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 2873
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 2875
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $8; //@line 2877
 HEAP8[$ReallocAsyncCtx2 + 16 >> 0] = $2; //@line 2879
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 2881
 sp = STACKTOP; //@line 2882
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13316
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 13318
 $6 = $5 >> 8; //@line 13319
 if (!($5 & 1)) {
  $$0 = $6; //@line 13323
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 13328
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 13330
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 13333
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13338
 FUNCTION_TABLE_viiii[$15 & 3]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 13339
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 162; //@line 13342
  sp = STACKTOP; //@line 13343
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13346
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
 sp = STACKTOP; //@line 9539
 STACKTOP = STACKTOP + 256 | 0; //@line 9540
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 9540
 $5 = sp; //@line 9541
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 9547
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 9551
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 9554
   $$011 = $9; //@line 9555
   do {
    _out_670($0, $5, 256); //@line 9557
    $$011 = $$011 + -256 | 0; //@line 9558
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 9567
  } else {
   $$0$lcssa = $9; //@line 9569
  }
  _out_670($0, $5, $$0$lcssa); //@line 9571
 }
 STACKTOP = sp; //@line 9573
 return;
}
function __ZN4mbed11InterruptInD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4403
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4405
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 4407
 if (!$4) {
  __ZdlPv($2); //@line 4410
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 4415
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 4416
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 4417
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 25; //@line 4420
  $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 4421
  HEAP32[$9 >> 2] = $2; //@line 4422
  sp = STACKTOP; //@line 4423
  return;
 }
 ___async_unwind = 0; //@line 4426
 HEAP32[$ReallocAsyncCtx2 >> 2] = 25; //@line 4427
 $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 4428
 HEAP32[$9 >> 2] = $2; //@line 4429
 sp = STACKTOP; //@line 4430
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 6834
 STACKTOP = STACKTOP + 32 | 0; //@line 6835
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 6835
 $vararg_buffer = sp; //@line 6836
 $3 = sp + 20 | 0; //@line 6837
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 6841
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 6843
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 6845
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 6847
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 6849
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 6854
  $10 = -1; //@line 6855
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 6858
 }
 STACKTOP = sp; //@line 6860
 return $10 | 0; //@line 6860
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 2245
 STACKTOP = STACKTOP + 16 | 0; //@line 2246
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2246
 $vararg_buffer = sp; //@line 2247
 HEAP32[$vararg_buffer >> 2] = $0; //@line 2248
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 2250
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 2252
 _mbed_error_printf(1903, $vararg_buffer); //@line 2253
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2254
 _mbed_die(); //@line 2255
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 72; //@line 2258
  sp = STACKTOP; //@line 2259
  STACKTOP = sp; //@line 2260
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2262
  STACKTOP = sp; //@line 2263
  return;
 }
}
function _snprintf($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11418
 STACKTOP = STACKTOP + 16 | 0; //@line 11419
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11419
 $3 = sp; //@line 11420
 HEAP32[$3 >> 2] = $varargs; //@line 11421
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 11422
 $4 = _vsnprintf($0, $1, $2, $3) | 0; //@line 11423
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 134; //@line 11426
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 11428
  sp = STACKTOP; //@line 11429
  STACKTOP = sp; //@line 11430
  return 0; //@line 11430
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11432
  STACKTOP = sp; //@line 11433
  return $4 | 0; //@line 11433
 }
 return 0; //@line 11435
}
function _schedule_interrupt__async_cb_66($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 3923
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3925
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3927
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3929
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 4 >> 2] | 0; //@line 3932
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(16) | 0; //@line 3933
 $10 = FUNCTION_TABLE_i[$9 & 3]() | 0; //@line 3934
 if (!___async) {
  HEAP32[___async_retval >> 2] = $10; //@line 3938
  ___async_unwind = 0; //@line 3939
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 68; //@line 3941
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $4; //@line 3943
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $6; //@line 3945
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $2; //@line 3947
 sp = STACKTOP; //@line 3948
 return;
}
function _initialize__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4608
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4610
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4612
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4614
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 24 >> 2] | 0; //@line 4617
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 4618
 $10 = FUNCTION_TABLE_i[$9 & 3]() | 0; //@line 4619
 if (!___async) {
  HEAP32[___async_retval >> 2] = $10; //@line 4623
  ___async_unwind = 0; //@line 4624
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 58; //@line 4626
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 4628
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $2; //@line 4630
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 4632
 sp = STACKTOP; //@line 4633
 return;
}
function _mbed_vtracef__async_cb_20($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 1024
 HEAP32[104] = HEAP32[102]; //@line 1026
 $2 = HEAP32[110] | 0; //@line 1027
 if (!$2) {
  return;
 }
 $4 = HEAP32[111] | 0; //@line 1032
 HEAP32[111] = 0; //@line 1033
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 1034
 FUNCTION_TABLE_v[$2 & 15](); //@line 1035
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 54; //@line 1038
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 1039
  HEAP32[$5 >> 2] = $4; //@line 1040
  sp = STACKTOP; //@line 1041
  return;
 }
 ___async_unwind = 0; //@line 1044
 HEAP32[$ReallocAsyncCtx8 >> 2] = 54; //@line 1045
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 1046
 HEAP32[$5 >> 2] = $4; //@line 1047
 sp = STACKTOP; //@line 1048
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 12082
 $5 = HEAP32[$4 >> 2] | 0; //@line 12083
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 12087
   HEAP32[$1 + 24 >> 2] = $3; //@line 12089
   HEAP32[$1 + 36 >> 2] = 1; //@line 12091
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 12095
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 12098
    HEAP32[$1 + 24 >> 2] = 2; //@line 12100
    HEAP8[$1 + 54 >> 0] = 1; //@line 12102
    break;
   }
   $10 = $1 + 24 | 0; //@line 12105
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 12109
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_17($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 760
 HEAP32[104] = HEAP32[102]; //@line 762
 $2 = HEAP32[110] | 0; //@line 763
 if (!$2) {
  return;
 }
 $4 = HEAP32[111] | 0; //@line 768
 HEAP32[111] = 0; //@line 769
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 770
 FUNCTION_TABLE_v[$2 & 15](); //@line 771
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 54; //@line 774
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 775
  HEAP32[$5 >> 2] = $4; //@line 776
  sp = STACKTOP; //@line 777
  return;
 }
 ___async_unwind = 0; //@line 780
 HEAP32[$ReallocAsyncCtx8 >> 2] = 54; //@line 781
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 782
 HEAP32[$5 >> 2] = $4; //@line 783
 sp = STACKTOP; //@line 784
 return;
}
function _mbed_vtracef__async_cb_16($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 730
 HEAP32[104] = HEAP32[102]; //@line 732
 $2 = HEAP32[110] | 0; //@line 733
 if (!$2) {
  return;
 }
 $4 = HEAP32[111] | 0; //@line 738
 HEAP32[111] = 0; //@line 739
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 740
 FUNCTION_TABLE_v[$2 & 15](); //@line 741
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 54; //@line 744
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 745
  HEAP32[$5 >> 2] = $4; //@line 746
  sp = STACKTOP; //@line 747
  return;
 }
 ___async_unwind = 0; //@line 750
 HEAP32[$ReallocAsyncCtx8 >> 2] = 54; //@line 751
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 752
 HEAP32[$5 >> 2] = $4; //@line 753
 sp = STACKTOP; //@line 754
 return;
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 12632
 STACKTOP = STACKTOP + 16 | 0; //@line 12633
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12633
 $vararg_buffer = sp; //@line 12634
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 12635
 FUNCTION_TABLE_v[$0 & 15](); //@line 12636
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 152; //@line 12639
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 12641
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 12643
  sp = STACKTOP; //@line 12644
  STACKTOP = sp; //@line 12645
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 12647
  _abort_message(5500, $vararg_buffer); //@line 12648
 }
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 6941
 $3 = HEAP8[$1 >> 0] | 0; //@line 6942
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 6947
  $$lcssa8 = $2; //@line 6947
 } else {
  $$011 = $1; //@line 6949
  $$0710 = $0; //@line 6949
  do {
   $$0710 = $$0710 + 1 | 0; //@line 6951
   $$011 = $$011 + 1 | 0; //@line 6952
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 6953
   $9 = HEAP8[$$011 >> 0] | 0; //@line 6954
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 6959
  $$lcssa8 = $8; //@line 6959
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 6969
}
function _memcmp($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $14 = 0, $4 = 0, $5 = 0;
 L1 : do {
  if (!$2) {
   $14 = 0; //@line 11383
  } else {
   $$01318 = $0; //@line 11385
   $$01417 = $2; //@line 11385
   $$019 = $1; //@line 11385
   while (1) {
    $4 = HEAP8[$$01318 >> 0] | 0; //@line 11387
    $5 = HEAP8[$$019 >> 0] | 0; //@line 11388
    if ($4 << 24 >> 24 != $5 << 24 >> 24) {
     break;
    }
    $$01417 = $$01417 + -1 | 0; //@line 11393
    if (!$$01417) {
     $14 = 0; //@line 11398
     break L1;
    } else {
     $$01318 = $$01318 + 1 | 0; //@line 11401
     $$019 = $$019 + 1 | 0; //@line 11401
    }
   }
   $14 = ($4 & 255) - ($5 & 255) | 0; //@line 11407
  }
 } while (0);
 return $14 | 0; //@line 11410
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2810
 $2 = HEAP32[163] | 0; //@line 2811
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2812
 _putc($1, $2) | 0; //@line 2813
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 94; //@line 2816
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 2818
  sp = STACKTOP; //@line 2819
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2822
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2823
 _fflush($2) | 0; //@line 2824
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 95; //@line 2827
  sp = STACKTOP; //@line 2828
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2831
  return;
 }
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 6893
 STACKTOP = STACKTOP + 32 | 0; //@line 6894
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 6894
 $vararg_buffer = sp; //@line 6895
 HEAP32[$0 + 36 >> 2] = 1; //@line 6898
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 6906
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 6908
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 6910
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 6915
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 6918
 STACKTOP = sp; //@line 6919
 return $14 | 0; //@line 6919
}
function _mbed_die__async_cb_46($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 2096
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2098
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2100
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 2101
 _wait_ms(150); //@line 2102
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 74; //@line 2105
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 2106
  HEAP32[$4 >> 2] = $2; //@line 2107
  sp = STACKTOP; //@line 2108
  return;
 }
 ___async_unwind = 0; //@line 2111
 HEAP32[$ReallocAsyncCtx15 >> 2] = 74; //@line 2112
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 2113
 HEAP32[$4 >> 2] = $2; //@line 2114
 sp = STACKTOP; //@line 2115
 return;
}
function _mbed_die__async_cb_45($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 2071
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2073
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2075
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 2076
 _wait_ms(150); //@line 2077
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 75; //@line 2080
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 2081
  HEAP32[$4 >> 2] = $2; //@line 2082
  sp = STACKTOP; //@line 2083
  return;
 }
 ___async_unwind = 0; //@line 2086
 HEAP32[$ReallocAsyncCtx14 >> 2] = 75; //@line 2087
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 2088
 HEAP32[$4 >> 2] = $2; //@line 2089
 sp = STACKTOP; //@line 2090
 return;
}
function _mbed_die__async_cb_44($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 2046
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2048
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2050
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 2051
 _wait_ms(150); //@line 2052
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 76; //@line 2055
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 2056
  HEAP32[$4 >> 2] = $2; //@line 2057
  sp = STACKTOP; //@line 2058
  return;
 }
 ___async_unwind = 0; //@line 2061
 HEAP32[$ReallocAsyncCtx13 >> 2] = 76; //@line 2062
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 2063
 HEAP32[$4 >> 2] = $2; //@line 2064
 sp = STACKTOP; //@line 2065
 return;
}
function _mbed_die__async_cb_43($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 2021
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2023
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 2025
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 2026
 _wait_ms(150); //@line 2027
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 77; //@line 2030
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 2031
  HEAP32[$4 >> 2] = $2; //@line 2032
  sp = STACKTOP; //@line 2033
  return;
 }
 ___async_unwind = 0; //@line 2036
 HEAP32[$ReallocAsyncCtx12 >> 2] = 77; //@line 2037
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 2038
 HEAP32[$4 >> 2] = $2; //@line 2039
 sp = STACKTOP; //@line 2040
 return;
}
function _mbed_die__async_cb_42($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 1996
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1998
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 2000
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 2001
 _wait_ms(150); //@line 2002
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 78; //@line 2005
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 2006
  HEAP32[$4 >> 2] = $2; //@line 2007
  sp = STACKTOP; //@line 2008
  return;
 }
 ___async_unwind = 0; //@line 2011
 HEAP32[$ReallocAsyncCtx11 >> 2] = 78; //@line 2012
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 2013
 HEAP32[$4 >> 2] = $2; //@line 2014
 sp = STACKTOP; //@line 2015
 return;
}
function _mbed_die__async_cb_41($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 1971
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1973
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 1975
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 1976
 _wait_ms(150); //@line 1977
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 79; //@line 1980
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 1981
  HEAP32[$4 >> 2] = $2; //@line 1982
  sp = STACKTOP; //@line 1983
  return;
 }
 ___async_unwind = 0; //@line 1986
 HEAP32[$ReallocAsyncCtx10 >> 2] = 79; //@line 1987
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 1988
 HEAP32[$4 >> 2] = $2; //@line 1989
 sp = STACKTOP; //@line 1990
 return;
}
function _mbed_tracef($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 713
 STACKTOP = STACKTOP + 16 | 0; //@line 714
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 714
 $3 = sp; //@line 715
 HEAP32[$3 >> 2] = $varargs; //@line 716
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 717
 _mbed_vtracef($0, $1, $2, $3); //@line 718
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 43; //@line 721
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 723
  sp = STACKTOP; //@line 724
  STACKTOP = sp; //@line 725
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 727
  STACKTOP = sp; //@line 728
  return;
 }
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 1721
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1723
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 1725
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 1726
 _wait_ms(150); //@line 1727
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 73; //@line 1730
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 1731
  HEAP32[$4 >> 2] = $2; //@line 1732
  sp = STACKTOP; //@line 1733
  return;
 }
 ___async_unwind = 0; //@line 1736
 HEAP32[$ReallocAsyncCtx16 >> 2] = 73; //@line 1737
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 1738
 HEAP32[$4 >> 2] = $2; //@line 1739
 sp = STACKTOP; //@line 1740
 return;
}
function _mbed_die__async_cb_40($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 1946
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1948
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 1950
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 1951
 _wait_ms(150); //@line 1952
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 80; //@line 1955
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 1956
  HEAP32[$4 >> 2] = $2; //@line 1957
  sp = STACKTOP; //@line 1958
  return;
 }
 ___async_unwind = 0; //@line 1961
 HEAP32[$ReallocAsyncCtx9 >> 2] = 80; //@line 1962
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 1963
 HEAP32[$4 >> 2] = $2; //@line 1964
 sp = STACKTOP; //@line 1965
 return;
}
function _mbed_die__async_cb_39($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 1921
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1923
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 1925
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 1926
 _wait_ms(400); //@line 1927
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 81; //@line 1930
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 1931
  HEAP32[$4 >> 2] = $2; //@line 1932
  sp = STACKTOP; //@line 1933
  return;
 }
 ___async_unwind = 0; //@line 1936
 HEAP32[$ReallocAsyncCtx8 >> 2] = 81; //@line 1937
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 1938
 HEAP32[$4 >> 2] = $2; //@line 1939
 sp = STACKTOP; //@line 1940
 return;
}
function _mbed_die__async_cb_38($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 1896
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1898
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 1900
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 1901
 _wait_ms(400); //@line 1902
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 82; //@line 1905
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 1906
  HEAP32[$4 >> 2] = $2; //@line 1907
  sp = STACKTOP; //@line 1908
  return;
 }
 ___async_unwind = 0; //@line 1911
 HEAP32[$ReallocAsyncCtx7 >> 2] = 82; //@line 1912
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 1913
 HEAP32[$4 >> 2] = $2; //@line 1914
 sp = STACKTOP; //@line 1915
 return;
}
function _mbed_die__async_cb_37($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 1871
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1873
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 1875
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 1876
 _wait_ms(400); //@line 1877
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 83; //@line 1880
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 1881
  HEAP32[$4 >> 2] = $2; //@line 1882
  sp = STACKTOP; //@line 1883
  return;
 }
 ___async_unwind = 0; //@line 1886
 HEAP32[$ReallocAsyncCtx6 >> 2] = 83; //@line 1887
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 1888
 HEAP32[$4 >> 2] = $2; //@line 1889
 sp = STACKTOP; //@line 1890
 return;
}
function _mbed_die__async_cb_36($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 1846
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1848
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 1850
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 1851
 _wait_ms(400); //@line 1852
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 84; //@line 1855
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 1856
  HEAP32[$4 >> 2] = $2; //@line 1857
  sp = STACKTOP; //@line 1858
  return;
 }
 ___async_unwind = 0; //@line 1861
 HEAP32[$ReallocAsyncCtx5 >> 2] = 84; //@line 1862
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 1863
 HEAP32[$4 >> 2] = $2; //@line 1864
 sp = STACKTOP; //@line 1865
 return;
}
function _mbed_die__async_cb_35($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1821
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1823
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 1825
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 1826
 _wait_ms(400); //@line 1827
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 85; //@line 1830
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 1831
  HEAP32[$4 >> 2] = $2; //@line 1832
  sp = STACKTOP; //@line 1833
  return;
 }
 ___async_unwind = 0; //@line 1836
 HEAP32[$ReallocAsyncCtx4 >> 2] = 85; //@line 1837
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 1838
 HEAP32[$4 >> 2] = $2; //@line 1839
 sp = STACKTOP; //@line 1840
 return;
}
function _mbed_die__async_cb_34($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1796
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1798
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 1800
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 1801
 _wait_ms(400); //@line 1802
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 1805
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 1806
  HEAP32[$4 >> 2] = $2; //@line 1807
  sp = STACKTOP; //@line 1808
  return;
 }
 ___async_unwind = 0; //@line 1811
 HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 1812
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 1813
 HEAP32[$4 >> 2] = $2; //@line 1814
 sp = STACKTOP; //@line 1815
 return;
}
function _mbed_die__async_cb_33($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1771
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1773
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 1775
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 1776
 _wait_ms(400); //@line 1777
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 87; //@line 1780
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 1781
  HEAP32[$4 >> 2] = $2; //@line 1782
  sp = STACKTOP; //@line 1783
  return;
 }
 ___async_unwind = 0; //@line 1786
 HEAP32[$ReallocAsyncCtx2 >> 2] = 87; //@line 1787
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 1788
 HEAP32[$4 >> 2] = $2; //@line 1789
 sp = STACKTOP; //@line 1790
 return;
}
function _mbed_die__async_cb_32($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1746
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1748
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 1750
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 1751
 _wait_ms(400); //@line 1752
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 88; //@line 1755
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 1756
  HEAP32[$4 >> 2] = $2; //@line 1757
  sp = STACKTOP; //@line 1758
  return;
 }
 ___async_unwind = 0; //@line 1761
 HEAP32[$ReallocAsyncCtx >> 2] = 88; //@line 1762
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 1763
 HEAP32[$4 >> 2] = $2; //@line 1764
 sp = STACKTOP; //@line 1765
 return;
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2573
 STACKTOP = STACKTOP + 16 | 0; //@line 2574
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2574
 $1 = sp; //@line 2575
 HEAP32[$1 >> 2] = $varargs; //@line 2576
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2577
 _mbed_error_vfprintf($0, $1); //@line 2578
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 89; //@line 2581
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 2583
  sp = STACKTOP; //@line 2584
  STACKTOP = sp; //@line 2585
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2587
  STACKTOP = sp; //@line 2588
  return;
 }
}
function __ZN4mbed10TimerEventC2Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 651
 HEAP32[$0 >> 2] = 372; //@line 652
 $1 = $0 + 8 | 0; //@line 653
 HEAP32[$1 >> 2] = 0; //@line 654
 HEAP32[$1 + 4 >> 2] = 0; //@line 654
 HEAP32[$1 + 8 >> 2] = 0; //@line 654
 HEAP32[$1 + 12 >> 2] = 0; //@line 654
 $2 = _get_us_ticker_data() | 0; //@line 655
 HEAP32[$0 + 24 >> 2] = $2; //@line 657
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 658
 _ticker_set_handler($2, 10); //@line 659
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 40; //@line 662
  sp = STACKTOP; //@line 663
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 666
  return;
 }
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 5919
 newDynamicTop = oldDynamicTop + increment | 0; //@line 5920
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 5924
  ___setErrNo(12); //@line 5925
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 5929
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 5933
   ___setErrNo(12); //@line 5934
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 5938
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 7064
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 7066
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 7072
  $11 = ___fwritex($0, $4, $3) | 0; //@line 7073
  if ($phitmp) {
   $13 = $11; //@line 7075
  } else {
   ___unlockfile($3); //@line 7077
   $13 = $11; //@line 7078
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 7082
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 7086
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 7089
 }
 return $15 | 0; //@line 7091
}
function _main__async_cb_9($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 13940
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13942
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13944
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13946
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(16) | 0; //@line 13947
 _puts(2507) | 0; //@line 13948
 if (!___async) {
  ___async_unwind = 0; //@line 13951
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 111; //@line 13953
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 13955
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 13957
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 13959
 sp = STACKTOP; //@line 13960
 return;
}
function _main__async_cb_8($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 13914
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13916
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 13918
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 13920
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 13921
 _puts(2610) | 0; //@line 13922
 if (!___async) {
  ___async_unwind = 0; //@line 13925
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 112; //@line 13927
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $2; //@line 13929
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $4; //@line 13931
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $6; //@line 13933
 sp = STACKTOP; //@line 13934
 return;
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 9400
 } else {
  $$056 = $2; //@line 9402
  $15 = $1; //@line 9402
  $8 = $0; //@line 9402
  while (1) {
   $14 = $$056 + -1 | 0; //@line 9410
   HEAP8[$14 >> 0] = HEAPU8[3163 + ($8 & 15) >> 0] | 0 | $3; //@line 9411
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 9412
   $15 = tempRet0; //@line 9413
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 9418
    break;
   } else {
    $$056 = $14; //@line 9421
   }
  }
 }
 return $$05$lcssa | 0; //@line 9425
}
function __ZSt9terminatev() {
 var $0 = 0, $16 = 0, $17 = 0, $2 = 0, $5 = 0, sp = 0;
 sp = STACKTOP; //@line 12597
 $0 = ___cxa_get_globals_fast() | 0; //@line 12598
 if ($0 | 0) {
  $2 = HEAP32[$0 >> 2] | 0; //@line 12601
  if ($2 | 0) {
   $5 = $2 + 48 | 0; //@line 12605
   if ((HEAP32[$5 >> 2] & -256 | 0) == 1126902528 ? (HEAP32[$5 + 4 >> 2] | 0) == 1129074247 : 0) {
    $16 = HEAP32[$2 + 12 >> 2] | 0; //@line 12617
    _emscripten_alloc_async_context(4, sp) | 0; //@line 12618
    __ZSt11__terminatePFvvE($16); //@line 12619
   }
  }
 }
 $17 = __ZSt13get_terminatev() | 0; //@line 12624
 _emscripten_alloc_async_context(4, sp) | 0; //@line 12625
 __ZSt11__terminatePFvvE($17); //@line 12626
}
function __GLOBAL__sub_I_main_cpp__async_cb_47($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2131
 HEAP32[1412] = 492; //@line 2132
 HEAP32[1422] = 0; //@line 2133
 HEAP32[1423] = 0; //@line 2133
 HEAP32[1424] = 0; //@line 2133
 HEAP32[1425] = 0; //@line 2133
 HEAP8[5704] = 1; //@line 2134
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 2135
 __ZN4mbed10TimerEventC2Ev(5712); //@line 2136
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 106; //@line 2139
  sp = STACKTOP; //@line 2140
  return;
 }
 ___async_unwind = 0; //@line 2143
 HEAP32[$ReallocAsyncCtx >> 2] = 106; //@line 2144
 sp = STACKTOP; //@line 2145
 return;
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 7281
 $3 = HEAP8[$1 >> 0] | 0; //@line 7283
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 7287
 $7 = HEAP32[$0 >> 2] | 0; //@line 7288
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 7293
  HEAP32[$0 + 4 >> 2] = 0; //@line 7295
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 7297
  HEAP32[$0 + 28 >> 2] = $14; //@line 7299
  HEAP32[$0 + 20 >> 2] = $14; //@line 7301
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 7307
  $$0 = 0; //@line 7308
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 7311
  $$0 = -1; //@line 7312
 }
 return $$0 | 0; //@line 7314
}
function __ZN4mbed11InterruptInD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3535
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3537
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 3539
 if (!$4) {
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 3546
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 3547
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 3548
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 23; //@line 3551
  sp = STACKTOP; //@line 3552
  return;
 }
 ___async_unwind = 0; //@line 3555
 HEAP32[$ReallocAsyncCtx2 >> 2] = 23; //@line 3556
 sp = STACKTOP; //@line 3557
 return;
}
function _twobyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$sink$in = 0, $$sink17$sink = 0, $11 = 0, $12 = 0, $8 = 0;
 $8 = (HEAPU8[$1 >> 0] | 0) << 8 | (HEAPU8[$1 + 1 >> 0] | 0); //@line 10868
 $$sink$in = HEAPU8[$0 >> 0] | 0; //@line 10871
 $$sink17$sink = $0; //@line 10871
 while (1) {
  $11 = $$sink17$sink + 1 | 0; //@line 10873
  $12 = HEAP8[$11 >> 0] | 0; //@line 10874
  if (!($12 << 24 >> 24)) {
   break;
  }
  $$sink$in = $$sink$in << 8 & 65280 | $12 & 255; //@line 10882
  if (($$sink$in | 0) == ($8 | 0)) {
   break;
  } else {
   $$sink17$sink = $11; //@line 10887
  }
 }
 return ($12 << 24 >> 24 ? $$sink17$sink : 0) | 0; //@line 10892
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 9437
 } else {
  $$06 = $2; //@line 9439
  $11 = $1; //@line 9439
  $7 = $0; //@line 9439
  while (1) {
   $10 = $$06 + -1 | 0; //@line 9444
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 9445
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 9446
   $11 = tempRet0; //@line 9447
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 9452
    break;
   } else {
    $$06 = $10; //@line 9455
   }
  }
 }
 return $$0$lcssa | 0; //@line 9459
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13473
 do {
  if (!$0) {
   $3 = 0; //@line 13477
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13479
   $2 = ___dynamic_cast($0, 240, 296, 0) | 0; //@line 13480
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 166; //@line 13483
    sp = STACKTOP; //@line 13484
    return 0; //@line 13485
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 13487
    $3 = ($2 | 0) != 0 & 1; //@line 13490
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 13495
}
function __ZN4mbed7Timeout7handlerEv__async_cb_83($0) {
 $0 = $0 | 0;
 var $4 = 0, $5 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5286
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5290
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 5292
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 5293
 FUNCTION_TABLE_vi[$5 & 255]($4); //@line 5294
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 38; //@line 5297
  sp = STACKTOP; //@line 5298
  return;
 }
 ___async_unwind = 0; //@line 5301
 HEAP32[$ReallocAsyncCtx >> 2] = 38; //@line 5302
 sp = STACKTOP; //@line 5303
 return;
}
function _invoke_ticker__async_cb_55($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2907
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 2913
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 2914
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 2915
 FUNCTION_TABLE_vi[$5 & 255]($6); //@line 2916
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 102; //@line 2919
  sp = STACKTOP; //@line 2920
  return;
 }
 ___async_unwind = 0; //@line 2923
 HEAP32[$ReallocAsyncCtx >> 2] = 102; //@line 2924
 sp = STACKTOP; //@line 2925
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 9081
 } else {
  $$04 = 0; //@line 9083
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 9086
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 9090
   $12 = $7 + 1 | 0; //@line 9091
   HEAP32[$0 >> 2] = $12; //@line 9092
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 9098
    break;
   } else {
    $$04 = $11; //@line 9101
   }
  }
 }
 return $$0$lcssa | 0; //@line 9105
}
function ___muldi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $x_sroa_0_0_extract_trunc = 0, $y_sroa_0_0_extract_trunc = 0, $1$0 = 0, $1$1 = 0;
 $x_sroa_0_0_extract_trunc = $a$0; //@line 5452
 $y_sroa_0_0_extract_trunc = $b$0; //@line 5453
 $1$0 = ___muldsi3($x_sroa_0_0_extract_trunc, $y_sroa_0_0_extract_trunc) | 0; //@line 5454
 $1$1 = tempRet0; //@line 5455
 return (tempRet0 = (Math_imul($a$1, $y_sroa_0_0_extract_trunc) | 0) + (Math_imul($b$1, $x_sroa_0_0_extract_trunc) | 0) + $1$1 | $1$1 & 0, $1$0 | 0 | 0) | 0; //@line 5457
}
function runPostSets() {}
function ___muldsi3($a, $b) {
 $a = $a | 0;
 $b = $b | 0;
 var $1 = 0, $2 = 0, $3 = 0, $6 = 0, $8 = 0, $11 = 0, $12 = 0;
 $1 = $a & 65535; //@line 5437
 $2 = $b & 65535; //@line 5438
 $3 = Math_imul($2, $1) | 0; //@line 5439
 $6 = $a >>> 16; //@line 5440
 $8 = ($3 >>> 16) + (Math_imul($2, $6) | 0) | 0; //@line 5441
 $11 = $b >>> 16; //@line 5442
 $12 = Math_imul($11, $1) | 0; //@line 5443
 return (tempRet0 = ($8 >>> 16) + (Math_imul($11, $6) | 0) + ((($8 & 65535) + $12 | 0) >>> 16) | 0, $8 + $12 << 16 | $3 & 65535 | 0) | 0; //@line 5444
}
function _ticker_set_handler($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1410
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1411
 _initialize($0); //@line 1412
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 56; //@line 1415
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1417
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 1419
  sp = STACKTOP; //@line 1420
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1423
  HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = $1; //@line 1426
  return;
 }
}
function __Z11toggle_led2v() {
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3162
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3163
 _puts(2459) | 0; //@line 3164
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 108; //@line 3167
  sp = STACKTOP; //@line 3168
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3171
  $2 = (_emscripten_asm_const_ii(10, HEAP32[1454] | 0) | 0) == 0 & 1; //@line 3175
  _emscripten_asm_const_iii(2, HEAP32[1454] | 0, $2 | 0) | 0; //@line 3177
  return;
 }
}
function __Z10blink_led1v() {
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3141
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3142
 _puts(2376) | 0; //@line 3143
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 107; //@line 3146
  sp = STACKTOP; //@line 3147
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3150
  $2 = (_emscripten_asm_const_ii(10, HEAP32[1448] | 0) | 0) == 0 & 1; //@line 3154
  _emscripten_asm_const_iii(2, HEAP32[1448] | 0, $2 | 0) | 0; //@line 3156
  return;
 }
}
function ___fflush_unlocked__async_cb_84($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5375
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5377
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5379
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5381
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 5383
 HEAP32[$4 >> 2] = 0; //@line 5384
 HEAP32[$6 >> 2] = 0; //@line 5385
 HEAP32[$8 >> 2] = 0; //@line 5386
 HEAP32[$10 >> 2] = 0; //@line 5387
 HEAP32[___async_retval >> 2] = 0; //@line 5389
 return;
}
function __ZN4mbed6Ticker7handlerEv($0) {
 $0 = $0 | 0;
 var $2 = 0, $5 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2954
 $2 = HEAP32[$0 + 52 >> 2] | 0; //@line 2956
 if (!$2) {
  return;
 }
 $5 = HEAP32[$2 >> 2] | 0; //@line 2962
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2963
 FUNCTION_TABLE_vi[$5 & 255]($0 + 40 | 0); //@line 2964
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 100; //@line 2967
  sp = STACKTOP; //@line 2968
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2971
 return;
}
function __ZN4mbed7TimeoutD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2985
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2987
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 2988
 __ZN4mbed10TimerEventD2Ev($2); //@line 2989
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 34; //@line 2992
  sp = STACKTOP; //@line 2993
  return;
 }
 ___async_unwind = 0; //@line 2996
 HEAP32[$ReallocAsyncCtx2 >> 2] = 34; //@line 2997
 sp = STACKTOP; //@line 2998
 return;
}
function __ZN4mbed6TickerD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2400
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2402
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 2403
 __ZN4mbed10TimerEventD2Ev($2); //@line 2404
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 97; //@line 2407
  sp = STACKTOP; //@line 2408
  return;
 }
 ___async_unwind = 0; //@line 2411
 HEAP32[$ReallocAsyncCtx2 >> 2] = 97; //@line 2412
 sp = STACKTOP; //@line 2413
 return;
}
function _mbed_vtracef__async_cb_15($0) {
 $0 = $0 | 0;
 var $1 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 712
 $1 = HEAP32[108] | 0; //@line 713
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 714
 FUNCTION_TABLE_vi[$1 & 255](1700); //@line 715
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 47; //@line 718
  sp = STACKTOP; //@line 719
  return;
 }
 ___async_unwind = 0; //@line 722
 HEAP32[$ReallocAsyncCtx3 >> 2] = 47; //@line 723
 sp = STACKTOP; //@line 724
 return;
}
function __ZN4mbed11InterruptInC2E7PinName($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $3 = 0, $4 = 0, dest = 0, stop = 0;
 HEAP32[$0 >> 2] = 336; //@line 251
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
function _serial_putc__async_cb_57($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2960
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2962
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 2963
 _fflush($2) | 0; //@line 2964
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 95; //@line 2967
  sp = STACKTOP; //@line 2968
  return;
 }
 ___async_unwind = 0; //@line 2971
 HEAP32[$ReallocAsyncCtx >> 2] = 95; //@line 2972
 sp = STACKTOP; //@line 2973
 return;
}
function __ZN4mbed10TimerEventD2Ev($0) {
 $0 = $0 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 624
 HEAP32[$0 >> 2] = 372; //@line 625
 $2 = HEAP32[$0 + 24 >> 2] | 0; //@line 627
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 629
 _ticker_remove_event($2, $0 + 8 | 0); //@line 630
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 39; //@line 633
  sp = STACKTOP; //@line 634
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 637
  return;
 }
}
function __ZN4mbed7TimeoutD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5395
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5397
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 5398
 __ZN4mbed10TimerEventD2Ev($2); //@line 5399
 if (!___async) {
  ___async_unwind = 0; //@line 5402
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 36; //@line 5404
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 5406
 sp = STACKTOP; //@line 5407
 return;
}
function __ZN4mbed6TickerD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1397
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1399
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 1400
 __ZN4mbed10TimerEventD2Ev($2); //@line 1401
 if (!___async) {
  ___async_unwind = 0; //@line 1404
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 99; //@line 1406
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 1408
 sp = STACKTOP; //@line 1409
 return;
}
function _emscripten_async_resume() {
 ___async = 0; //@line 5770
 ___async_unwind = 1; //@line 5771
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 5777
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 5781
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 5785
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 5787
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 6704
 STACKTOP = STACKTOP + 16 | 0; //@line 6705
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 6705
 $vararg_buffer = sp; //@line 6706
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 6710
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 6712
 STACKTOP = sp; //@line 6713
 return $5 | 0; //@line 6713
}
function __ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3042
 $1 = HEAP32[$0 >> 2] | 0; //@line 3043
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3044
 FUNCTION_TABLE_v[$1 & 15](); //@line 3045
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 103; //@line 3048
  sp = STACKTOP; //@line 3049
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3052
  return;
 }
}
function __ZN4mbed10TimerEvent3irqEj($0) {
 $0 = $0 | 0;
 var $5 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 673
 $5 = HEAP32[(HEAP32[$0 >> 2] | 0) + 8 >> 2] | 0; //@line 678
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 679
 FUNCTION_TABLE_vi[$5 & 255]($0); //@line 680
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 41; //@line 683
  sp = STACKTOP; //@line 684
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 687
  return;
 }
}
function _handle_interrupt_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2726
 $2 = HEAP32[1444] | 0; //@line 2727
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2728
 FUNCTION_TABLE_vii[$2 & 3]($0, $1); //@line 2729
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 93; //@line 2732
  sp = STACKTOP; //@line 2733
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2736
  return;
 }
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 5712
 STACKTOP = STACKTOP + 16 | 0; //@line 5713
 $rem = __stackBase__ | 0; //@line 5714
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 5715
 STACKTOP = __stackBase__; //@line 5716
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 5717
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 5482
 if ((ret | 0) < 8) return ret | 0; //@line 5483
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 5484
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 5485
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 5486
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 5487
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 5488
}
function ___cxa_get_globals_fast() {
 var $3 = 0, sp = 0;
 sp = STACKTOP; //@line 11818
 STACKTOP = STACKTOP + 16 | 0; //@line 11819
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11819
 if (!(_pthread_once(6512, 10) | 0)) {
  $3 = _pthread_getspecific(HEAP32[1629] | 0) | 0; //@line 11825
  STACKTOP = sp; //@line 11826
  return $3 | 0; //@line 11826
 } else {
  _abort_message(5348, sp); //@line 11828
 }
 return 0; //@line 11831
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 11986
 }
 return;
}
function __Z12turn_led3_onv() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3183
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3184
 _puts(2480) | 0; //@line 3185
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 109; //@line 3188
  sp = STACKTOP; //@line 3189
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3192
  _emscripten_asm_const_iii(2, HEAP32[1460] | 0, 1) | 0; //@line 3194
  return;
 }
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 11523
 $6 = HEAP32[$5 >> 2] | 0; //@line 11524
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 11525
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 11527
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 11529
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 11532
 return $2 | 0; //@line 11533
}
function __ZL25default_terminate_handlerv__async_cb_51($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2612
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2614
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2616
 HEAP32[$2 >> 2] = 5209; //@line 2617
 HEAP32[$2 + 4 >> 2] = $4; //@line 2619
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 2621
 _abort_message(5073, $2); //@line 2622
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2637
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2639
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 2640
 _fputc(10, $2) | 0; //@line 2641
 if (!___async) {
  ___async_unwind = 0; //@line 2644
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 142; //@line 2646
 sp = STACKTOP; //@line 2647
 return;
}
function _gpio_irq_init($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0;
 if (($1 | 0) == -1) {
  $$0 = -1; //@line 2749
  return $$0 | 0; //@line 2750
 }
 HEAP32[1444] = $2; //@line 2752
 HEAP32[$0 >> 2] = $1; //@line 2753
 HEAP32[$0 + 4 >> 2] = $1; //@line 2755
 _emscripten_asm_const_iii(5, $3 | 0, $1 | 0) | 0; //@line 2756
 $$0 = 0; //@line 2757
 return $$0 | 0; //@line 2758
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13683
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 13686
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 13691
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 13694
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 12580
 STACKTOP = STACKTOP + 16 | 0; //@line 12581
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12581
 _free($0); //@line 12583
 if (!(_pthread_setspecific(HEAP32[1629] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 12588
  return;
 } else {
  _abort_message(5447, sp); //@line 12590
 }
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1465
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 1476
  $$0 = 1; //@line 1477
 } else {
  $$0 = 0; //@line 1479
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 1483
 return;
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 2789
 HEAP32[$0 >> 2] = $1; //@line 2790
 HEAP32[1445] = 1; //@line 2791
 $4 = $0; //@line 2792
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 2797
 $10 = 5784; //@line 2798
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 2800
 HEAP32[$10 + 4 >> 2] = $9; //@line 2803
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 12062
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3089
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3090
 _emscripten_sleep($0 | 0); //@line 3091
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 104; //@line 3094
  sp = STACKTOP; //@line 3095
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3098
  return;
 }
}
function _mbed_trace_default_print($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 694
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 695
 _puts($0) | 0; //@line 696
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 42; //@line 699
  sp = STACKTOP; //@line 700
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 703
  return;
 }
}
function _main__async_cb_6($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 13851
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(4) | 0; //@line 13852
 _wait_ms(-1); //@line 13853
 if (!___async) {
  ___async_unwind = 0; //@line 13856
 }
 HEAP32[$ReallocAsyncCtx10 >> 2] = 119; //@line 13858
 sp = STACKTOP; //@line 13859
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 12126
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 12130
  }
 }
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var sp = 0;
 sp = STACKTOP; //@line 12565
 STACKTOP = STACKTOP + 16 | 0; //@line 12566
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12566
 if (!(_pthread_key_create(6516, 151) | 0)) {
  STACKTOP = sp; //@line 12571
  return;
 } else {
  _abort_message(5397, sp); //@line 12573
 }
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 5746
 HEAP32[new_frame + 4 >> 2] = sp; //@line 5748
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 5750
 ___async_cur_frame = new_frame; //@line 5751
 return ___async_cur_frame + 8 | 0; //@line 5752
}
function __GLOBAL__sub_I_main_cpp__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[1438] = 0; //@line 2122
 HEAP32[1439] = 0; //@line 2122
 HEAP32[1440] = 0; //@line 2122
 HEAP32[1441] = 0; //@line 2122
 HEAP8[5768] = 1; //@line 2123
 HEAP32[1428] = 352; //@line 2124
 __ZN4mbed11InterruptInC2E7PinName(5864, 1337); //@line 2125
 return;
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 2550
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 2554
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 2557
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 5735
  return low << bits; //@line 5736
 }
 tempRet0 = low << bits - 32; //@line 5738
 return 0; //@line 5739
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 5724
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 5725
 }
 tempRet0 = 0; //@line 5727
 return high >>> bits - 32 | 0; //@line 5728
}
function _fflush__async_cb_1($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13578
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 13580
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 13583
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_28($0) {
 $0 = $0 | 0;
 var $6 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1600
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 1602
 _gpio_irq_set($6 + 28 | 0, 2, 1); //@line 1604
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
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 1431
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 1434
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 1437
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 1452
 } else {
  $$0 = -1; //@line 1454
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 1457
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 7411
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 7417
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 7421
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 6001
}
function _fputc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13752
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 13753
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 13755
 return;
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 5758
 stackRestore(___async_cur_frame | 0); //@line 5759
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 5760
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2935
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 2936
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 2938
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 10522
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 10522
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 10524
 return $1 | 0; //@line 10525
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 2712
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 2718
 _emscripten_asm_const_iii(4, $0 | 0, $1 | 0) | 0; //@line 2719
 return;
}
function _gpio_init_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 2697
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 2703
 _emscripten_asm_const_iii(3, $0 | 0, $1 | 0) | 0; //@line 2704
 return;
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 6870
  $$0 = -1; //@line 6871
 } else {
  $$0 = $0; //@line 6873
 }
 return $$0 | 0; //@line 6875
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 5475
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 5476
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 5477
}
function __ZN4mbed6Ticker5setupEy($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $4 = 0;
 $4 = ___udivdi3($1 | 0, $2 | 0, 1e3, 0) | 0; //@line 3026
 _emscripten_asm_const_iii(9, $0 + 40 | 0, $4 | 0) | 0; //@line 3028
 return;
}
function __Z11toggle_led2v__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(10, HEAP32[1454] | 0) | 0) == 0 & 1; //@line 2533
 _emscripten_asm_const_iii(2, HEAP32[1454] | 0, $3 | 0) | 0; //@line 2535
 return;
}
function __Z10blink_led1v__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(10, HEAP32[1448] | 0) | 0) == 0 & 1; //@line 2429
 _emscripten_asm_const_iii(2, HEAP32[1448] | 0, $3 | 0) | 0; //@line 2431
 return;
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 5994
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
 l = a + c >>> 0; //@line 5467
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 5469
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 5987
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 7556
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 7561
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 9582
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 9585
 }
 return $$0 | 0; //@line 9587
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 5959
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 5704
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 7051
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 7055
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 2454
 return;
}
function _gpio_irq_set($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 _emscripten_asm_const_iiii(7, HEAP32[$0 + 4 >> 2] | 0, $1 | 0, $2 | 0) | 0; //@line 2779
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 5765
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 5766
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_31($0) {
 $0 = $0 | 0;
 _gpio_irq_set((HEAP32[$0 + 8 >> 2] | 0) + 28 | 0, 2, 0); //@line 1715
 return;
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 12665
 __ZdlPv($0); //@line 12666
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 12348
 __ZdlPv($0); //@line 12349
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 7547
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 7549
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 11876
 __ZdlPv($0); //@line 11877
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
 HEAP32[HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 4 >> 2] >> 2] = HEAP32[$0 + 8 >> 2]; //@line 2895
 return;
}
function _out_670($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 if (!(HEAP32[$0 >> 2] & 32)) {
  ___fwritex($1, $2, $0) | 0; //@line 9067
 }
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 2388
 return;
}
function b115(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 6326
}
function __ZN4mbed8CallbackIFvvEE13function_moveIPS1_EEvPvPKv($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = HEAP32[$1 >> 2]; //@line 3062
 return;
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 12073
}
function __ZSt13get_terminatev() {
 var $0 = 0;
 $0 = HEAP32[288] | 0; //@line 12655
 HEAP32[288] = $0 + 0; //@line 12657
 return $0 | 0; //@line 12659
}
function _gpio_irq_free($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iii(6, HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 2768
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
 FUNCTION_TABLE_vii[index & 3](a1 | 0, a2 | 0); //@line 5980
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
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 5792
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_74($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b113(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 6323
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __Z12turn_led3_onv__async_cb($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iii(2, HEAP32[1460] | 0, 1) | 0; //@line 13716
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 9530
}
function _fflush__async_cb_2($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 13593
 return;
}
function _fputc__async_cb_4($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 13765
 return;
}
function _snprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 197
 return;
}
function _putc__async_cb_56($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 2948
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 5952
}
function __ZN4mbed11InterruptInD0Ev__async_cb_75($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 4439
 return;
}
function b8(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 6020
 return 0; //@line 6020
}
function b7(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 6017
 return 0; //@line 6017
}
function b6(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 6014
 return 0; //@line 6014
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(5500, HEAP32[$0 + 4 >> 2] | 0); //@line 2631
}
function __ZN4mbed6Ticker6detachEv($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_ii(8, $0 + 40 | 0) | 0; //@line 3036
 return;
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 255](a1 | 0); //@line 5973
}
function b111(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 6320
}
function __ZN4mbed7TimeoutD0Ev__async_cb_85($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 5416
 return;
}
function __ZN4mbed6TickerD0Ev__async_cb_26($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 1418
 return;
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 10775
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_14($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_i(index) {
 index = index | 0;
 return FUNCTION_TABLE_i[index & 3]() | 0; //@line 5945
}
function _main__async_cb_13($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 185
 return;
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_72($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 15](); //@line 5966
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 6928
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIPS1_EEvPv($0) {
 $0 = $0 | 0;
 return;
}
function b4(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 6011
 return 0; //@line 6011
}
function b109(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(3); //@line 6317
}
function b108(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(0); //@line 6314
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
 _llvm_trap(); //@line 645
}
function _abort_message__async_cb_52($0) {
 $0 = $0 | 0;
 _abort(); //@line 2654
}
function ___ofl_lock() {
 ___lock(6500); //@line 7566
 return 6508; //@line 7567
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
 ___cxa_pure_virtual(); //@line 6026
}
function __ZN4mbed11InterruptInD2Ev__async_cb_63($0) {
 $0 = $0 | 0;
 return;
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 10696
}
function __ZN4mbed7Timeout7handlerEv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed10TimerEvent3irqEj__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 10702
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
function __ZN4mbed7TimeoutD2Ev__async_cb_58($0) {
 $0 = $0 | 0;
 return;
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 11702
 return;
}
function __ZN4mbed6TickerD2Ev__async_cb_49($0) {
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
 nullFunc_i(3); //@line 6008
 return 0; //@line 6008
}
function b1() {
 nullFunc_i(0); //@line 6005
 return 0; //@line 6005
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
 ___unlock(6500); //@line 7572
 return;
}
function b106(p0) {
 p0 = p0 | 0;
 nullFunc_vi(255); //@line 6311
}
function b105(p0) {
 p0 = p0 | 0;
 nullFunc_vi(254); //@line 6308
}
function b104(p0) {
 p0 = p0 | 0;
 nullFunc_vi(253); //@line 6305
}
function b103(p0) {
 p0 = p0 | 0;
 nullFunc_vi(252); //@line 6302
}
function b102(p0) {
 p0 = p0 | 0;
 nullFunc_vi(251); //@line 6299
}
function b101(p0) {
 p0 = p0 | 0;
 nullFunc_vi(250); //@line 6296
}
function b100(p0) {
 p0 = p0 | 0;
 nullFunc_vi(249); //@line 6293
}
function b99(p0) {
 p0 = p0 | 0;
 nullFunc_vi(248); //@line 6290
}
function b98(p0) {
 p0 = p0 | 0;
 nullFunc_vi(247); //@line 6287
}
function b97(p0) {
 p0 = p0 | 0;
 nullFunc_vi(246); //@line 6284
}
function b96(p0) {
 p0 = p0 | 0;
 nullFunc_vi(245); //@line 6281
}
function b95(p0) {
 p0 = p0 | 0;
 nullFunc_vi(244); //@line 6278
}
function b94(p0) {
 p0 = p0 | 0;
 nullFunc_vi(243); //@line 6275
}
function b93(p0) {
 p0 = p0 | 0;
 nullFunc_vi(242); //@line 6272
}
function b92(p0) {
 p0 = p0 | 0;
 nullFunc_vi(241); //@line 6269
}
function b91(p0) {
 p0 = p0 | 0;
 nullFunc_vi(240); //@line 6266
}
function b90(p0) {
 p0 = p0 | 0;
 nullFunc_vi(239); //@line 6263
}
function b89(p0) {
 p0 = p0 | 0;
 nullFunc_vi(238); //@line 6260
}
function b88(p0) {
 p0 = p0 | 0;
 nullFunc_vi(237); //@line 6257
}
function b87(p0) {
 p0 = p0 | 0;
 nullFunc_vi(236); //@line 6254
}
function b86(p0) {
 p0 = p0 | 0;
 nullFunc_vi(235); //@line 6251
}
function b85(p0) {
 p0 = p0 | 0;
 nullFunc_vi(234); //@line 6248
}
function b84(p0) {
 p0 = p0 | 0;
 nullFunc_vi(233); //@line 6245
}
function b83(p0) {
 p0 = p0 | 0;
 nullFunc_vi(232); //@line 6242
}
function b82(p0) {
 p0 = p0 | 0;
 nullFunc_vi(231); //@line 6239
}
function b81(p0) {
 p0 = p0 | 0;
 nullFunc_vi(230); //@line 6236
}
function b80(p0) {
 p0 = p0 | 0;
 nullFunc_vi(229); //@line 6233
}
function b79(p0) {
 p0 = p0 | 0;
 nullFunc_vi(228); //@line 6230
}
function b78(p0) {
 p0 = p0 | 0;
 nullFunc_vi(227); //@line 6227
}
function b77(p0) {
 p0 = p0 | 0;
 nullFunc_vi(226); //@line 6224
}
function b76(p0) {
 p0 = p0 | 0;
 nullFunc_vi(225); //@line 6221
}
function b75(p0) {
 p0 = p0 | 0;
 nullFunc_vi(224); //@line 6218
}
function b74(p0) {
 p0 = p0 | 0;
 nullFunc_vi(223); //@line 6215
}
function b73(p0) {
 p0 = p0 | 0;
 nullFunc_vi(222); //@line 6212
}
function b72(p0) {
 p0 = p0 | 0;
 nullFunc_vi(221); //@line 6209
}
function b71(p0) {
 p0 = p0 | 0;
 nullFunc_vi(220); //@line 6206
}
function b70(p0) {
 p0 = p0 | 0;
 nullFunc_vi(219); //@line 6203
}
function b69(p0) {
 p0 = p0 | 0;
 nullFunc_vi(218); //@line 6200
}
function b68(p0) {
 p0 = p0 | 0;
 nullFunc_vi(217); //@line 6197
}
function b67(p0) {
 p0 = p0 | 0;
 nullFunc_vi(216); //@line 6194
}
function b66(p0) {
 p0 = p0 | 0;
 nullFunc_vi(215); //@line 6191
}
function b65(p0) {
 p0 = p0 | 0;
 nullFunc_vi(214); //@line 6188
}
function b64(p0) {
 p0 = p0 | 0;
 nullFunc_vi(213); //@line 6185
}
function b63(p0) {
 p0 = p0 | 0;
 nullFunc_vi(212); //@line 6182
}
function b62(p0) {
 p0 = p0 | 0;
 nullFunc_vi(211); //@line 6179
}
function b61(p0) {
 p0 = p0 | 0;
 nullFunc_vi(210); //@line 6176
}
function b60(p0) {
 p0 = p0 | 0;
 nullFunc_vi(209); //@line 6173
}
function b59(p0) {
 p0 = p0 | 0;
 nullFunc_vi(208); //@line 6170
}
function b58(p0) {
 p0 = p0 | 0;
 nullFunc_vi(207); //@line 6167
}
function b57(p0) {
 p0 = p0 | 0;
 nullFunc_vi(206); //@line 6164
}
function b56(p0) {
 p0 = p0 | 0;
 nullFunc_vi(205); //@line 6161
}
function b55(p0) {
 p0 = p0 | 0;
 nullFunc_vi(204); //@line 6158
}
function b54(p0) {
 p0 = p0 | 0;
 nullFunc_vi(203); //@line 6155
}
function b53(p0) {
 p0 = p0 | 0;
 nullFunc_vi(202); //@line 6152
}
function b52(p0) {
 p0 = p0 | 0;
 nullFunc_vi(201); //@line 6149
}
function b51(p0) {
 p0 = p0 | 0;
 nullFunc_vi(200); //@line 6146
}
function b50(p0) {
 p0 = p0 | 0;
 nullFunc_vi(199); //@line 6143
}
function b49(p0) {
 p0 = p0 | 0;
 nullFunc_vi(198); //@line 6140
}
function b48(p0) {
 p0 = p0 | 0;
 nullFunc_vi(197); //@line 6137
}
function b47(p0) {
 p0 = p0 | 0;
 nullFunc_vi(196); //@line 6134
}
function b46(p0) {
 p0 = p0 | 0;
 nullFunc_vi(195); //@line 6131
}
function b45(p0) {
 p0 = p0 | 0;
 nullFunc_vi(194); //@line 6128
}
function b44(p0) {
 p0 = p0 | 0;
 nullFunc_vi(193); //@line 6125
}
function b43(p0) {
 p0 = p0 | 0;
 nullFunc_vi(192); //@line 6122
}
function b42(p0) {
 p0 = p0 | 0;
 nullFunc_vi(191); //@line 6119
}
function b41(p0) {
 p0 = p0 | 0;
 nullFunc_vi(190); //@line 6116
}
function b40(p0) {
 p0 = p0 | 0;
 nullFunc_vi(189); //@line 6113
}
function b39(p0) {
 p0 = p0 | 0;
 nullFunc_vi(188); //@line 6110
}
function b38(p0) {
 p0 = p0 | 0;
 nullFunc_vi(187); //@line 6107
}
function b37(p0) {
 p0 = p0 | 0;
 nullFunc_vi(186); //@line 6104
}
function b36(p0) {
 p0 = p0 | 0;
 nullFunc_vi(185); //@line 6101
}
function b35(p0) {
 p0 = p0 | 0;
 nullFunc_vi(184); //@line 6098
}
function b34(p0) {
 p0 = p0 | 0;
 nullFunc_vi(183); //@line 6095
}
function b33(p0) {
 p0 = p0 | 0;
 nullFunc_vi(182); //@line 6092
}
function b32(p0) {
 p0 = p0 | 0;
 nullFunc_vi(181); //@line 6089
}
function b31(p0) {
 p0 = p0 | 0;
 nullFunc_vi(180); //@line 6086
}
function b30(p0) {
 p0 = p0 | 0;
 nullFunc_vi(179); //@line 6083
}
function b29(p0) {
 p0 = p0 | 0;
 nullFunc_vi(178); //@line 6080
}
function b28(p0) {
 p0 = p0 | 0;
 nullFunc_vi(177); //@line 6077
}
function b27(p0) {
 p0 = p0 | 0;
 nullFunc_vi(176); //@line 6074
}
function b26(p0) {
 p0 = p0 | 0;
 nullFunc_vi(175); //@line 6071
}
function b25(p0) {
 p0 = p0 | 0;
 nullFunc_vi(174); //@line 6068
}
function b24(p0) {
 p0 = p0 | 0;
 nullFunc_vi(173); //@line 6065
}
function b23(p0) {
 p0 = p0 | 0;
 nullFunc_vi(172); //@line 6062
}
function b22(p0) {
 p0 = p0 | 0;
 nullFunc_vi(171); //@line 6059
}
function b21(p0) {
 p0 = p0 | 0;
 nullFunc_vi(170); //@line 6056
}
function b20(p0) {
 p0 = p0 | 0;
 nullFunc_vi(169); //@line 6053
}
function b19(p0) {
 p0 = p0 | 0;
 nullFunc_vi(168); //@line 6050
}
function b18(p0) {
 p0 = p0 | 0;
 nullFunc_vi(167); //@line 6047
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 6886
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 7203
}
function b17(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 6044
}
function _us_ticker_set_interrupt($0) {
 $0 = $0 | 0;
 return;
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _initialize__async_cb_80($0) {
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
 return 516; //@line 3084
}
function _get_us_ticker_data() {
 return 448; //@line 2238
}
function __ZSt9terminatev__async_cb_73($0) {
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
 return 6496; //@line 6880
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
 return 0; //@line 2843
}
function _pthread_self() {
 return 784; //@line 6933
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
 nullFunc_v(15); //@line 6041
}
function b14() {
 nullFunc_v(14); //@line 6038
}
function b13() {
 nullFunc_v(13); //@line 6035
}
function b12() {
 nullFunc_v(12); //@line 6032
}
function b11() {
 nullFunc_v(11); //@line 6029
}
function b10() {
 nullFunc_v(0); //@line 6023
}
function _us_ticker_init() {
 return;
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_i = [b1,_us_ticker_read,_us_ticker_get_info,b2];
var FUNCTION_TABLE_ii = [b4,___stdio_close];
var FUNCTION_TABLE_iiii = [b6,___stdio_write,___stdio_seek,___stdout_write,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b7,b8];
var FUNCTION_TABLE_v = [b10,___cxa_pure_virtual__wrapper,_us_ticker_init,_us_ticker_disable_interrupt,_us_ticker_clear_interrupt,_us_ticker_fire_interrupt,__ZL25default_terminate_handlerv,__Z10blink_led1v,__Z12turn_led3_onv,__Z11toggle_led2v,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev,b11,b12,b13,b14,b15];
var FUNCTION_TABLE_vi = [b17,__ZN4mbed11InterruptInD2Ev,__ZN4mbed11InterruptInD0Ev,__ZN4mbed7TimeoutD2Ev,__ZN4mbed7TimeoutD0Ev,__ZN4mbed7Timeout7handlerEv,__ZN4mbed10TimerEventD2Ev,__ZN4mbed10TimerEventD0Ev,_mbed_trace_default_print,_us_ticker_set_interrupt,__ZN4mbed10TimerEvent3irqEj,__ZN4mbed6TickerD2Ev,__ZN4mbed6TickerD0Ev,__ZN4mbed6Ticker7handlerEv,__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv,__ZN4mbed8CallbackIFvvEE13function_dtorIPS1_EEvPv,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed11InterruptInD2Ev__async_cb,__ZN4mbed11InterruptInD2Ev__async_cb_63,__ZN4mbed11InterruptInD0Ev__async_cb,__ZN4mbed11InterruptInD0Ev__async_cb_75,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_14,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb
,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_28,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_29,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_30,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_31,__ZN4mbed7TimeoutD2Ev__async_cb,__ZN4mbed7TimeoutD2Ev__async_cb_58,__ZN4mbed7TimeoutD0Ev__async_cb,__ZN4mbed7TimeoutD0Ev__async_cb_85,__ZN4mbed7Timeout7handlerEv__async_cb_83,__ZN4mbed7Timeout7handlerEv__async_cb,__ZN4mbed10TimerEventD2Ev__async_cb,__ZN4mbed10TimerEventC2Ev__async_cb,__ZN4mbed10TimerEvent3irqEj__async_cb,_mbed_trace_default_print__async_cb,_mbed_tracef__async_cb,_mbed_vtracef__async_cb,_mbed_vtracef__async_cb_25,_mbed_vtracef__async_cb_15,_mbed_vtracef__async_cb_16,_mbed_vtracef__async_cb_17,_mbed_vtracef__async_cb_24,_mbed_vtracef__async_cb_18,_mbed_vtracef__async_cb_23,_mbed_vtracef__async_cb_19,_mbed_vtracef__async_cb_20,_mbed_vtracef__async_cb_21,_mbed_vtracef__async_cb_22,_ticker_set_handler__async_cb,_initialize__async_cb,_initialize__async_cb_77
,_initialize__async_cb_82,_initialize__async_cb_81,_initialize__async_cb_78,_initialize__async_cb_79,_initialize__async_cb_80,_schedule_interrupt__async_cb,_schedule_interrupt__async_cb_64,_schedule_interrupt__async_cb_65,_schedule_interrupt__async_cb_66,_schedule_interrupt__async_cb_67,_schedule_interrupt__async_cb_68,_schedule_interrupt__async_cb_69,_ticker_remove_event__async_cb,_mbed_assert_internal__async_cb,_mbed_die__async_cb_46,_mbed_die__async_cb_45,_mbed_die__async_cb_44,_mbed_die__async_cb_43,_mbed_die__async_cb_42,_mbed_die__async_cb_41,_mbed_die__async_cb_40,_mbed_die__async_cb_39,_mbed_die__async_cb_38,_mbed_die__async_cb_37,_mbed_die__async_cb_36,_mbed_die__async_cb_35,_mbed_die__async_cb_34,_mbed_die__async_cb_33,_mbed_die__async_cb_32,_mbed_die__async_cb
,_mbed_error_printf__async_cb,_mbed_error_vfprintf__async_cb,_mbed_error_vfprintf__async_cb_54,_mbed_error_vfprintf__async_cb_53,_handle_interrupt_in__async_cb,_serial_putc__async_cb_57,_serial_putc__async_cb,__ZN4mbed6TickerD2Ev__async_cb,__ZN4mbed6TickerD2Ev__async_cb_49,__ZN4mbed6TickerD0Ev__async_cb,__ZN4mbed6TickerD0Ev__async_cb_26,__ZN4mbed6Ticker7handlerEv__async_cb,_invoke_ticker__async_cb_55,_invoke_ticker__async_cb,__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv__async_cb,_wait_ms__async_cb,__GLOBAL__sub_I_main_cpp__async_cb_47,__GLOBAL__sub_I_main_cpp__async_cb,__Z10blink_led1v__async_cb,__Z11toggle_led2v__async_cb,__Z12turn_led3_onv__async_cb,_main__async_cb_9,_main__async_cb_8,_main__async_cb_7,_main__async_cb_11,_main__async_cb,_main__async_cb_10,_main__async_cb_5,_main__async_cb_12,_main__async_cb_6
,_main__async_cb_13,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_70,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_71,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_72,_putc__async_cb_56,_putc__async_cb,___overflow__async_cb,_fflush__async_cb_2,_fflush__async_cb_1,_fflush__async_cb_3,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_84,_vfprintf__async_cb,_snprintf__async_cb,_vsnprintf__async_cb,_fputc__async_cb_4,_fputc__async_cb,_puts__async_cb,__ZL25default_terminate_handlerv__async_cb,__ZL25default_terminate_handlerv__async_cb_51,_abort_message__async_cb,_abort_message__async_cb_52,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_27,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_50,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb
,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_74,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_48,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_62,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_61,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_60,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_59,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_76,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b18,b19,b20,b21,b22,b23,b24,b25,b26,b27,b28,b29
,b30,b31,b32,b33,b34,b35,b36,b37,b38,b39,b40,b41,b42,b43,b44,b45,b46,b47,b48,b49,b50,b51,b52,b53,b54,b55,b56,b57,b58,b59
,b60,b61,b62,b63,b64,b65,b66,b67,b68,b69,b70,b71,b72,b73,b74,b75,b76,b77,b78,b79,b80,b81,b82,b83,b84,b85,b86,b87,b88,b89
,b90,b91,b92,b93,b94,b95,b96,b97,b98,b99,b100,b101,b102,b103,b104,b105,b106];
var FUNCTION_TABLE_vii = [b108,__ZN4mbed8CallbackIFvvEE13function_moveIPS1_EEvPvPKv,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event,b109];
var FUNCTION_TABLE_viiii = [b111,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi];
var FUNCTION_TABLE_viiiii = [b113,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib];
var FUNCTION_TABLE_viiiiii = [b115,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib];

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
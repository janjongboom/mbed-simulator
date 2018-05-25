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
var debug_table_vi = ["0", "__ZN4mbed11InterruptInD2Ev", "__ZN4mbed11InterruptInD0Ev", "__ZN4mbed7TimeoutD2Ev", "__ZN4mbed7TimeoutD0Ev", "__ZN4mbed7Timeout7handlerEv", "__ZN4mbed10TimerEventD2Ev", "__ZN4mbed10TimerEventD0Ev", "_mbed_trace_default_print", "__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv", "__ZN4mbed8CallbackIFvvEE13function_dtorIPS1_EEvPv", "_us_ticker_set_interrupt", "__ZN4mbed6TickerD2Ev", "__ZN4mbed6TickerD0Ev", "__ZN4mbed6Ticker7handlerEv", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "__ZN10__cxxabiv121__vmi_class_type_infoD0Ev", "__ZN4mbed11InterruptInD2Ev__async_cb", "__ZN4mbed11InterruptInD2Ev__async_cb_1", "__ZN4mbed11InterruptInD0Ev__async_cb", "__ZN4mbed11InterruptInD0Ev__async_cb_18", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb", "__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_56", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_57", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_58", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_59", "__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_60", "__ZN4mbed7TimeoutD2Ev__async_cb", "__ZN4mbed7TimeoutD2Ev__async_cb_71", "__ZN4mbed7TimeoutD0Ev__async_cb", "__ZN4mbed7TimeoutD0Ev__async_cb_20", "__ZN4mbed7Timeout7handlerEv__async_cb", "__ZN4mbed7Timeout7handlerEv__async_cb_33", "__ZN4mbed7Timeout7handlerEv__async_cb_31", "__ZN4mbed7Timeout7handlerEv__async_cb_32", "__ZN4mbed10TimerEventD2Ev__async_cb", "__ZN4mbed10TimerEvent3irqEj", "__ZN4mbed10TimerEventC2Ev__async_cb", "__ZN4mbed10TimerEvent3irqEj__async_cb", "_mbed_trace_default_print__async_cb", "_mbed_tracef__async_cb", "_mbed_vtracef__async_cb", "_mbed_vtracef__async_cb_17", "_mbed_vtracef__async_cb_7", "_mbed_vtracef__async_cb_8", "_mbed_vtracef__async_cb_9", "_mbed_vtracef__async_cb_16", "_mbed_vtracef__async_cb_10", "_mbed_vtracef__async_cb_15", "_mbed_vtracef__async_cb_11", "_mbed_vtracef__async_cb_12", "_mbed_vtracef__async_cb_13", "_mbed_vtracef__async_cb_14", "__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv__async_cb", "_ticker_set_handler__async_cb", "_initialize__async_cb", "_initialize__async_cb_24", "_initialize__async_cb_29", "_initialize__async_cb_28", "_initialize__async_cb_25", "_initialize__async_cb_26", "_initialize__async_cb_27", "_schedule_interrupt__async_cb", "_schedule_interrupt__async_cb_48", "_schedule_interrupt__async_cb_49", "_schedule_interrupt__async_cb_50", "_schedule_interrupt__async_cb_51", "_schedule_interrupt__async_cb_52", "_schedule_interrupt__async_cb_53", "_ticker_remove_event__async_cb", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_87", "_mbed_die__async_cb_86", "_mbed_die__async_cb_85", "_mbed_die__async_cb_84", "_mbed_die__async_cb_83", "_mbed_die__async_cb_82", "_mbed_die__async_cb_81", "_mbed_die__async_cb_80", "_mbed_die__async_cb_79", "_mbed_die__async_cb_78", "_mbed_die__async_cb_77", "_mbed_die__async_cb_76", "_mbed_die__async_cb_75", "_mbed_die__async_cb_74", "_mbed_die__async_cb_73", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_vfprintf__async_cb", "_mbed_error_vfprintf__async_cb_23", "_mbed_error_vfprintf__async_cb_22", "_handle_interrupt_in__async_cb", "_serial_putc__async_cb_21", "_serial_putc__async_cb", "__ZN4mbed6TickerD2Ev__async_cb", "__ZN4mbed6TickerD2Ev__async_cb_70", "__ZN4mbed6TickerD0Ev__async_cb", "__ZN4mbed6TickerD0Ev__async_cb_66", "__ZN4mbed6Ticker7handlerEv__async_cb", "_invoke_ticker__async_cb_5", "_invoke_ticker__async_cb", "_wait_ms__async_cb", "__GLOBAL__sub_I_main_cpp__async_cb_67", "__GLOBAL__sub_I_main_cpp__async_cb", "__Z10blink_led1v__async_cb", "__Z11toggle_led2v__async_cb", "__Z12turn_led3_onv__async_cb", "_main__async_cb_38", "_main__async_cb_37", "_main__async_cb_36", "_main__async_cb_40", "_main__async_cb", "_main__async_cb_39", "_main__async_cb_34", "_main__async_cb_41", "_main__async_cb_35", "_main__async_cb_42", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_62", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_63", "__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_64", "_putc__async_cb_72", "_putc__async_cb", "___overflow__async_cb", "_fflush__async_cb_3", "_fflush__async_cb_2", "_fflush__async_cb_4", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_19", "_vfprintf__async_cb", "_snprintf__async_cb", "_vsnprintf__async_cb", "_fputc__async_cb_69", "_fputc__async_cb", "_puts__async_cb", "__ZL25default_terminate_handlerv__async_cb", "__ZL25default_terminate_handlerv__async_cb_54", "_abort_message__async_cb", "_abort_message__async_cb_6", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_65", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_43", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_61", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv", "__ZSt11__terminatePFvvE__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_30", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_47", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_46", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_45", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_44", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_55", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
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
 sp = STACKTOP; //@line 3674
 STACKTOP = STACKTOP + 16 | 0; //@line 3675
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3675
 $1 = sp; //@line 3676
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 3683
   $7 = $6 >>> 3; //@line 3684
   $8 = HEAP32[1484] | 0; //@line 3685
   $9 = $8 >>> $7; //@line 3686
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 3692
    $16 = 5976 + ($14 << 1 << 2) | 0; //@line 3694
    $17 = $16 + 8 | 0; //@line 3695
    $18 = HEAP32[$17 >> 2] | 0; //@line 3696
    $19 = $18 + 8 | 0; //@line 3697
    $20 = HEAP32[$19 >> 2] | 0; //@line 3698
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1484] = $8 & ~(1 << $14); //@line 3705
     } else {
      if ((HEAP32[1488] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 3710
      }
      $27 = $20 + 12 | 0; //@line 3713
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 3717
       HEAP32[$17 >> 2] = $20; //@line 3718
       break;
      } else {
       _abort(); //@line 3721
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 3726
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 3729
    $34 = $18 + $30 + 4 | 0; //@line 3731
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 3734
    $$0 = $19; //@line 3735
    STACKTOP = sp; //@line 3736
    return $$0 | 0; //@line 3736
   }
   $37 = HEAP32[1486] | 0; //@line 3738
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 3744
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 3747
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 3750
     $49 = $47 >>> 12 & 16; //@line 3752
     $50 = $47 >>> $49; //@line 3753
     $52 = $50 >>> 5 & 8; //@line 3755
     $54 = $50 >>> $52; //@line 3757
     $56 = $54 >>> 2 & 4; //@line 3759
     $58 = $54 >>> $56; //@line 3761
     $60 = $58 >>> 1 & 2; //@line 3763
     $62 = $58 >>> $60; //@line 3765
     $64 = $62 >>> 1 & 1; //@line 3767
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 3770
     $69 = 5976 + ($67 << 1 << 2) | 0; //@line 3772
     $70 = $69 + 8 | 0; //@line 3773
     $71 = HEAP32[$70 >> 2] | 0; //@line 3774
     $72 = $71 + 8 | 0; //@line 3775
     $73 = HEAP32[$72 >> 2] | 0; //@line 3776
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 3782
       HEAP32[1484] = $77; //@line 3783
       $98 = $77; //@line 3784
      } else {
       if ((HEAP32[1488] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 3789
       }
       $80 = $73 + 12 | 0; //@line 3792
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 3796
        HEAP32[$70 >> 2] = $73; //@line 3797
        $98 = $8; //@line 3798
        break;
       } else {
        _abort(); //@line 3801
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 3806
     $84 = $83 - $6 | 0; //@line 3807
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 3810
     $87 = $71 + $6 | 0; //@line 3811
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 3814
     HEAP32[$71 + $83 >> 2] = $84; //@line 3816
     if ($37 | 0) {
      $92 = HEAP32[1489] | 0; //@line 3819
      $93 = $37 >>> 3; //@line 3820
      $95 = 5976 + ($93 << 1 << 2) | 0; //@line 3822
      $96 = 1 << $93; //@line 3823
      if (!($98 & $96)) {
       HEAP32[1484] = $98 | $96; //@line 3828
       $$0199 = $95; //@line 3830
       $$pre$phiZ2D = $95 + 8 | 0; //@line 3830
      } else {
       $101 = $95 + 8 | 0; //@line 3832
       $102 = HEAP32[$101 >> 2] | 0; //@line 3833
       if ((HEAP32[1488] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 3837
       } else {
        $$0199 = $102; //@line 3840
        $$pre$phiZ2D = $101; //@line 3840
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 3843
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 3845
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 3847
      HEAP32[$92 + 12 >> 2] = $95; //@line 3849
     }
     HEAP32[1486] = $84; //@line 3851
     HEAP32[1489] = $87; //@line 3852
     $$0 = $72; //@line 3853
     STACKTOP = sp; //@line 3854
     return $$0 | 0; //@line 3854
    }
    $108 = HEAP32[1485] | 0; //@line 3856
    if (!$108) {
     $$0197 = $6; //@line 3859
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 3863
     $114 = $112 >>> 12 & 16; //@line 3865
     $115 = $112 >>> $114; //@line 3866
     $117 = $115 >>> 5 & 8; //@line 3868
     $119 = $115 >>> $117; //@line 3870
     $121 = $119 >>> 2 & 4; //@line 3872
     $123 = $119 >>> $121; //@line 3874
     $125 = $123 >>> 1 & 2; //@line 3876
     $127 = $123 >>> $125; //@line 3878
     $129 = $127 >>> 1 & 1; //@line 3880
     $134 = HEAP32[6240 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 3885
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 3889
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 3895
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 3898
      $$0193$lcssa$i = $138; //@line 3898
     } else {
      $$01926$i = $134; //@line 3900
      $$01935$i = $138; //@line 3900
      $146 = $143; //@line 3900
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 3905
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 3906
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 3907
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 3908
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 3914
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 3917
        $$0193$lcssa$i = $$$0193$i; //@line 3917
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 3920
        $$01935$i = $$$0193$i; //@line 3920
       }
      }
     }
     $157 = HEAP32[1488] | 0; //@line 3924
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 3927
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 3930
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 3933
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 3937
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 3939
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 3943
       $176 = HEAP32[$175 >> 2] | 0; //@line 3944
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 3947
        $179 = HEAP32[$178 >> 2] | 0; //@line 3948
        if (!$179) {
         $$3$i = 0; //@line 3951
         break;
        } else {
         $$1196$i = $179; //@line 3954
         $$1198$i = $178; //@line 3954
        }
       } else {
        $$1196$i = $176; //@line 3957
        $$1198$i = $175; //@line 3957
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 3960
        $182 = HEAP32[$181 >> 2] | 0; //@line 3961
        if ($182 | 0) {
         $$1196$i = $182; //@line 3964
         $$1198$i = $181; //@line 3964
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 3967
        $185 = HEAP32[$184 >> 2] | 0; //@line 3968
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 3973
         $$1198$i = $184; //@line 3973
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 3978
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 3981
        $$3$i = $$1196$i; //@line 3982
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 3987
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 3990
       }
       $169 = $167 + 12 | 0; //@line 3993
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 3997
       }
       $172 = $164 + 8 | 0; //@line 4000
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 4004
        HEAP32[$172 >> 2] = $167; //@line 4005
        $$3$i = $164; //@line 4006
        break;
       } else {
        _abort(); //@line 4009
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 4018
       $191 = 6240 + ($190 << 2) | 0; //@line 4019
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 4024
         if (!$$3$i) {
          HEAP32[1485] = $108 & ~(1 << $190); //@line 4030
          break L73;
         }
        } else {
         if ((HEAP32[1488] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 4037
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 4045
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1488] | 0; //@line 4055
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 4058
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 4062
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 4064
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 4070
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 4074
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 4076
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 4082
       if ($214 | 0) {
        if ((HEAP32[1488] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 4088
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 4092
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 4094
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 4102
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 4105
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 4107
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 4110
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 4114
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 4117
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 4119
      if ($37 | 0) {
       $234 = HEAP32[1489] | 0; //@line 4122
       $235 = $37 >>> 3; //@line 4123
       $237 = 5976 + ($235 << 1 << 2) | 0; //@line 4125
       $238 = 1 << $235; //@line 4126
       if (!($8 & $238)) {
        HEAP32[1484] = $8 | $238; //@line 4131
        $$0189$i = $237; //@line 4133
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 4133
       } else {
        $242 = $237 + 8 | 0; //@line 4135
        $243 = HEAP32[$242 >> 2] | 0; //@line 4136
        if ((HEAP32[1488] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 4140
        } else {
         $$0189$i = $243; //@line 4143
         $$pre$phi$iZ2D = $242; //@line 4143
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 4146
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 4148
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 4150
       HEAP32[$234 + 12 >> 2] = $237; //@line 4152
      }
      HEAP32[1486] = $$0193$lcssa$i; //@line 4154
      HEAP32[1489] = $159; //@line 4155
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 4158
     STACKTOP = sp; //@line 4159
     return $$0 | 0; //@line 4159
    }
   } else {
    $$0197 = $6; //@line 4162
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 4167
   } else {
    $251 = $0 + 11 | 0; //@line 4169
    $252 = $251 & -8; //@line 4170
    $253 = HEAP32[1485] | 0; //@line 4171
    if (!$253) {
     $$0197 = $252; //@line 4174
    } else {
     $255 = 0 - $252 | 0; //@line 4176
     $256 = $251 >>> 8; //@line 4177
     if (!$256) {
      $$0358$i = 0; //@line 4180
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 4184
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 4188
       $262 = $256 << $261; //@line 4189
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 4192
       $267 = $262 << $265; //@line 4194
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 4197
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 4202
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 4208
      }
     }
     $282 = HEAP32[6240 + ($$0358$i << 2) >> 2] | 0; //@line 4212
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 4216
       $$3$i203 = 0; //@line 4216
       $$3350$i = $255; //@line 4216
       label = 81; //@line 4217
      } else {
       $$0342$i = 0; //@line 4224
       $$0347$i = $255; //@line 4224
       $$0353$i = $282; //@line 4224
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 4224
       $$0362$i = 0; //@line 4224
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 4229
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 4234
          $$435113$i = 0; //@line 4234
          $$435712$i = $$0353$i; //@line 4234
          label = 85; //@line 4235
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 4238
          $$1348$i = $292; //@line 4238
         }
        } else {
         $$1343$i = $$0342$i; //@line 4241
         $$1348$i = $$0347$i; //@line 4241
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 4244
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 4247
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 4251
        $302 = ($$0353$i | 0) == 0; //@line 4252
        if ($302) {
         $$2355$i = $$1363$i; //@line 4257
         $$3$i203 = $$1343$i; //@line 4257
         $$3350$i = $$1348$i; //@line 4257
         label = 81; //@line 4258
         break;
        } else {
         $$0342$i = $$1343$i; //@line 4261
         $$0347$i = $$1348$i; //@line 4261
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 4261
         $$0362$i = $$1363$i; //@line 4261
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 4271
       $309 = $253 & ($306 | 0 - $306); //@line 4274
       if (!$309) {
        $$0197 = $252; //@line 4277
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 4282
       $315 = $313 >>> 12 & 16; //@line 4284
       $316 = $313 >>> $315; //@line 4285
       $318 = $316 >>> 5 & 8; //@line 4287
       $320 = $316 >>> $318; //@line 4289
       $322 = $320 >>> 2 & 4; //@line 4291
       $324 = $320 >>> $322; //@line 4293
       $326 = $324 >>> 1 & 2; //@line 4295
       $328 = $324 >>> $326; //@line 4297
       $330 = $328 >>> 1 & 1; //@line 4299
       $$4$ph$i = 0; //@line 4305
       $$4357$ph$i = HEAP32[6240 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 4305
      } else {
       $$4$ph$i = $$3$i203; //@line 4307
       $$4357$ph$i = $$2355$i; //@line 4307
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 4311
       $$4351$lcssa$i = $$3350$i; //@line 4311
      } else {
       $$414$i = $$4$ph$i; //@line 4313
       $$435113$i = $$3350$i; //@line 4313
       $$435712$i = $$4357$ph$i; //@line 4313
       label = 85; //@line 4314
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 4319
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 4323
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 4324
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 4325
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 4326
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4332
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 4335
        $$4351$lcssa$i = $$$4351$i; //@line 4335
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 4338
        $$435113$i = $$$4351$i; //@line 4338
        label = 85; //@line 4339
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 4345
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1486] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1488] | 0; //@line 4351
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 4354
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 4357
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 4360
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 4364
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 4366
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 4370
         $371 = HEAP32[$370 >> 2] | 0; //@line 4371
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 4374
          $374 = HEAP32[$373 >> 2] | 0; //@line 4375
          if (!$374) {
           $$3372$i = 0; //@line 4378
           break;
          } else {
           $$1370$i = $374; //@line 4381
           $$1374$i = $373; //@line 4381
          }
         } else {
          $$1370$i = $371; //@line 4384
          $$1374$i = $370; //@line 4384
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 4387
          $377 = HEAP32[$376 >> 2] | 0; //@line 4388
          if ($377 | 0) {
           $$1370$i = $377; //@line 4391
           $$1374$i = $376; //@line 4391
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 4394
          $380 = HEAP32[$379 >> 2] | 0; //@line 4395
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 4400
           $$1374$i = $379; //@line 4400
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 4405
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 4408
          $$3372$i = $$1370$i; //@line 4409
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 4414
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 4417
         }
         $364 = $362 + 12 | 0; //@line 4420
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 4424
         }
         $367 = $359 + 8 | 0; //@line 4427
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 4431
          HEAP32[$367 >> 2] = $362; //@line 4432
          $$3372$i = $359; //@line 4433
          break;
         } else {
          _abort(); //@line 4436
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 4444
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 4447
         $386 = 6240 + ($385 << 2) | 0; //@line 4448
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 4453
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 4458
            HEAP32[1485] = $391; //@line 4459
            $475 = $391; //@line 4460
            break L164;
           }
          } else {
           if ((HEAP32[1488] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 4467
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 4475
            if (!$$3372$i) {
             $475 = $253; //@line 4478
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1488] | 0; //@line 4486
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 4489
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 4493
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 4495
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 4501
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 4505
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 4507
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 4513
         if (!$409) {
          $475 = $253; //@line 4516
         } else {
          if ((HEAP32[1488] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 4521
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 4525
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 4527
           $475 = $253; //@line 4528
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 4537
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 4540
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 4542
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 4545
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 4549
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 4552
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 4554
         $428 = $$4351$lcssa$i >>> 3; //@line 4555
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 5976 + ($428 << 1 << 2) | 0; //@line 4559
          $432 = HEAP32[1484] | 0; //@line 4560
          $433 = 1 << $428; //@line 4561
          if (!($432 & $433)) {
           HEAP32[1484] = $432 | $433; //@line 4566
           $$0368$i = $431; //@line 4568
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 4568
          } else {
           $437 = $431 + 8 | 0; //@line 4570
           $438 = HEAP32[$437 >> 2] | 0; //@line 4571
           if ((HEAP32[1488] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 4575
           } else {
            $$0368$i = $438; //@line 4578
            $$pre$phi$i211Z2D = $437; //@line 4578
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 4581
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 4583
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 4585
          HEAP32[$354 + 12 >> 2] = $431; //@line 4587
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 4590
         if (!$444) {
          $$0361$i = 0; //@line 4593
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 4597
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 4601
           $450 = $444 << $449; //@line 4602
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 4605
           $455 = $450 << $453; //@line 4607
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 4610
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 4615
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 4621
          }
         }
         $469 = 6240 + ($$0361$i << 2) | 0; //@line 4624
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 4626
         $471 = $354 + 16 | 0; //@line 4627
         HEAP32[$471 + 4 >> 2] = 0; //@line 4629
         HEAP32[$471 >> 2] = 0; //@line 4630
         $473 = 1 << $$0361$i; //@line 4631
         if (!($475 & $473)) {
          HEAP32[1485] = $475 | $473; //@line 4636
          HEAP32[$469 >> 2] = $354; //@line 4637
          HEAP32[$354 + 24 >> 2] = $469; //@line 4639
          HEAP32[$354 + 12 >> 2] = $354; //@line 4641
          HEAP32[$354 + 8 >> 2] = $354; //@line 4643
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 4652
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 4652
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 4659
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 4663
          $494 = HEAP32[$492 >> 2] | 0; //@line 4665
          if (!$494) {
           label = 136; //@line 4668
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 4671
           $$0345$i = $494; //@line 4671
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1488] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 4678
          } else {
           HEAP32[$492 >> 2] = $354; //@line 4681
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 4683
           HEAP32[$354 + 12 >> 2] = $354; //@line 4685
           HEAP32[$354 + 8 >> 2] = $354; //@line 4687
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 4692
          $502 = HEAP32[$501 >> 2] | 0; //@line 4693
          $503 = HEAP32[1488] | 0; //@line 4694
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 4700
           HEAP32[$501 >> 2] = $354; //@line 4701
           HEAP32[$354 + 8 >> 2] = $502; //@line 4703
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 4705
           HEAP32[$354 + 24 >> 2] = 0; //@line 4707
           break;
          } else {
           _abort(); //@line 4710
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 4717
       STACKTOP = sp; //@line 4718
       return $$0 | 0; //@line 4718
      } else {
       $$0197 = $252; //@line 4720
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1486] | 0; //@line 4727
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 4730
  $515 = HEAP32[1489] | 0; //@line 4731
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 4734
   HEAP32[1489] = $517; //@line 4735
   HEAP32[1486] = $514; //@line 4736
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 4739
   HEAP32[$515 + $512 >> 2] = $514; //@line 4741
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 4744
  } else {
   HEAP32[1486] = 0; //@line 4746
   HEAP32[1489] = 0; //@line 4747
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 4750
   $526 = $515 + $512 + 4 | 0; //@line 4752
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 4755
  }
  $$0 = $515 + 8 | 0; //@line 4758
  STACKTOP = sp; //@line 4759
  return $$0 | 0; //@line 4759
 }
 $530 = HEAP32[1487] | 0; //@line 4761
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 4764
  HEAP32[1487] = $532; //@line 4765
  $533 = HEAP32[1490] | 0; //@line 4766
  $534 = $533 + $$0197 | 0; //@line 4767
  HEAP32[1490] = $534; //@line 4768
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 4771
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 4774
  $$0 = $533 + 8 | 0; //@line 4776
  STACKTOP = sp; //@line 4777
  return $$0 | 0; //@line 4777
 }
 if (!(HEAP32[1602] | 0)) {
  HEAP32[1604] = 4096; //@line 4782
  HEAP32[1603] = 4096; //@line 4783
  HEAP32[1605] = -1; //@line 4784
  HEAP32[1606] = -1; //@line 4785
  HEAP32[1607] = 0; //@line 4786
  HEAP32[1595] = 0; //@line 4787
  HEAP32[1602] = $1 & -16 ^ 1431655768; //@line 4791
  $548 = 4096; //@line 4792
 } else {
  $548 = HEAP32[1604] | 0; //@line 4795
 }
 $545 = $$0197 + 48 | 0; //@line 4797
 $546 = $$0197 + 47 | 0; //@line 4798
 $547 = $548 + $546 | 0; //@line 4799
 $549 = 0 - $548 | 0; //@line 4800
 $550 = $547 & $549; //@line 4801
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 4804
  STACKTOP = sp; //@line 4805
  return $$0 | 0; //@line 4805
 }
 $552 = HEAP32[1594] | 0; //@line 4807
 if ($552 | 0) {
  $554 = HEAP32[1592] | 0; //@line 4810
  $555 = $554 + $550 | 0; //@line 4811
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 4816
   STACKTOP = sp; //@line 4817
   return $$0 | 0; //@line 4817
  }
 }
 L244 : do {
  if (!(HEAP32[1595] & 4)) {
   $561 = HEAP32[1490] | 0; //@line 4825
   L246 : do {
    if (!$561) {
     label = 163; //@line 4829
    } else {
     $$0$i$i = 6384; //@line 4831
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 4833
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 4836
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 4845
      if (!$570) {
       label = 163; //@line 4848
       break L246;
      } else {
       $$0$i$i = $570; //@line 4851
      }
     }
     $595 = $547 - $530 & $549; //@line 4855
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 4858
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 4866
       } else {
        $$723947$i = $595; //@line 4868
        $$748$i = $597; //@line 4868
        label = 180; //@line 4869
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 4873
       $$2253$ph$i = $595; //@line 4873
       label = 171; //@line 4874
      }
     } else {
      $$2234243136$i = 0; //@line 4877
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 4883
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 4886
     } else {
      $574 = $572; //@line 4888
      $575 = HEAP32[1603] | 0; //@line 4889
      $576 = $575 + -1 | 0; //@line 4890
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 4898
      $584 = HEAP32[1592] | 0; //@line 4899
      $585 = $$$i + $584 | 0; //@line 4900
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1594] | 0; //@line 4905
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 4912
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 4916
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 4919
        $$748$i = $572; //@line 4919
        label = 180; //@line 4920
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 4923
        $$2253$ph$i = $$$i; //@line 4923
        label = 171; //@line 4924
       }
      } else {
       $$2234243136$i = 0; //@line 4927
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 4934
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 4943
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 4946
       $$748$i = $$2247$ph$i; //@line 4946
       label = 180; //@line 4947
       break L244;
      }
     }
     $607 = HEAP32[1604] | 0; //@line 4951
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 4955
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 4958
      $$748$i = $$2247$ph$i; //@line 4958
      label = 180; //@line 4959
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 4965
      $$2234243136$i = 0; //@line 4966
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 4970
      $$748$i = $$2247$ph$i; //@line 4970
      label = 180; //@line 4971
      break L244;
     }
    }
   } while (0);
   HEAP32[1595] = HEAP32[1595] | 4; //@line 4978
   $$4236$i = $$2234243136$i; //@line 4979
   label = 178; //@line 4980
  } else {
   $$4236$i = 0; //@line 4982
   label = 178; //@line 4983
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 4989
   $621 = _sbrk(0) | 0; //@line 4990
   $627 = $621 - $620 | 0; //@line 4998
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 5000
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 5008
    $$748$i = $620; //@line 5008
    label = 180; //@line 5009
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1592] | 0) + $$723947$i | 0; //@line 5015
  HEAP32[1592] = $633; //@line 5016
  if ($633 >>> 0 > (HEAP32[1593] | 0) >>> 0) {
   HEAP32[1593] = $633; //@line 5020
  }
  $636 = HEAP32[1490] | 0; //@line 5022
  do {
   if (!$636) {
    $638 = HEAP32[1488] | 0; //@line 5026
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1488] = $$748$i; //@line 5031
    }
    HEAP32[1596] = $$748$i; //@line 5033
    HEAP32[1597] = $$723947$i; //@line 5034
    HEAP32[1599] = 0; //@line 5035
    HEAP32[1493] = HEAP32[1602]; //@line 5037
    HEAP32[1492] = -1; //@line 5038
    HEAP32[1497] = 5976; //@line 5039
    HEAP32[1496] = 5976; //@line 5040
    HEAP32[1499] = 5984; //@line 5041
    HEAP32[1498] = 5984; //@line 5042
    HEAP32[1501] = 5992; //@line 5043
    HEAP32[1500] = 5992; //@line 5044
    HEAP32[1503] = 6e3; //@line 5045
    HEAP32[1502] = 6e3; //@line 5046
    HEAP32[1505] = 6008; //@line 5047
    HEAP32[1504] = 6008; //@line 5048
    HEAP32[1507] = 6016; //@line 5049
    HEAP32[1506] = 6016; //@line 5050
    HEAP32[1509] = 6024; //@line 5051
    HEAP32[1508] = 6024; //@line 5052
    HEAP32[1511] = 6032; //@line 5053
    HEAP32[1510] = 6032; //@line 5054
    HEAP32[1513] = 6040; //@line 5055
    HEAP32[1512] = 6040; //@line 5056
    HEAP32[1515] = 6048; //@line 5057
    HEAP32[1514] = 6048; //@line 5058
    HEAP32[1517] = 6056; //@line 5059
    HEAP32[1516] = 6056; //@line 5060
    HEAP32[1519] = 6064; //@line 5061
    HEAP32[1518] = 6064; //@line 5062
    HEAP32[1521] = 6072; //@line 5063
    HEAP32[1520] = 6072; //@line 5064
    HEAP32[1523] = 6080; //@line 5065
    HEAP32[1522] = 6080; //@line 5066
    HEAP32[1525] = 6088; //@line 5067
    HEAP32[1524] = 6088; //@line 5068
    HEAP32[1527] = 6096; //@line 5069
    HEAP32[1526] = 6096; //@line 5070
    HEAP32[1529] = 6104; //@line 5071
    HEAP32[1528] = 6104; //@line 5072
    HEAP32[1531] = 6112; //@line 5073
    HEAP32[1530] = 6112; //@line 5074
    HEAP32[1533] = 6120; //@line 5075
    HEAP32[1532] = 6120; //@line 5076
    HEAP32[1535] = 6128; //@line 5077
    HEAP32[1534] = 6128; //@line 5078
    HEAP32[1537] = 6136; //@line 5079
    HEAP32[1536] = 6136; //@line 5080
    HEAP32[1539] = 6144; //@line 5081
    HEAP32[1538] = 6144; //@line 5082
    HEAP32[1541] = 6152; //@line 5083
    HEAP32[1540] = 6152; //@line 5084
    HEAP32[1543] = 6160; //@line 5085
    HEAP32[1542] = 6160; //@line 5086
    HEAP32[1545] = 6168; //@line 5087
    HEAP32[1544] = 6168; //@line 5088
    HEAP32[1547] = 6176; //@line 5089
    HEAP32[1546] = 6176; //@line 5090
    HEAP32[1549] = 6184; //@line 5091
    HEAP32[1548] = 6184; //@line 5092
    HEAP32[1551] = 6192; //@line 5093
    HEAP32[1550] = 6192; //@line 5094
    HEAP32[1553] = 6200; //@line 5095
    HEAP32[1552] = 6200; //@line 5096
    HEAP32[1555] = 6208; //@line 5097
    HEAP32[1554] = 6208; //@line 5098
    HEAP32[1557] = 6216; //@line 5099
    HEAP32[1556] = 6216; //@line 5100
    HEAP32[1559] = 6224; //@line 5101
    HEAP32[1558] = 6224; //@line 5102
    $642 = $$723947$i + -40 | 0; //@line 5103
    $644 = $$748$i + 8 | 0; //@line 5105
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 5110
    $650 = $$748$i + $649 | 0; //@line 5111
    $651 = $642 - $649 | 0; //@line 5112
    HEAP32[1490] = $650; //@line 5113
    HEAP32[1487] = $651; //@line 5114
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 5117
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 5120
    HEAP32[1491] = HEAP32[1606]; //@line 5122
   } else {
    $$024367$i = 6384; //@line 5124
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 5126
     $658 = $$024367$i + 4 | 0; //@line 5127
     $659 = HEAP32[$658 >> 2] | 0; //@line 5128
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 5132
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 5136
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 5141
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 5155
       $673 = (HEAP32[1487] | 0) + $$723947$i | 0; //@line 5157
       $675 = $636 + 8 | 0; //@line 5159
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 5164
       $681 = $636 + $680 | 0; //@line 5165
       $682 = $673 - $680 | 0; //@line 5166
       HEAP32[1490] = $681; //@line 5167
       HEAP32[1487] = $682; //@line 5168
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 5171
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 5174
       HEAP32[1491] = HEAP32[1606]; //@line 5176
       break;
      }
     }
    }
    $688 = HEAP32[1488] | 0; //@line 5181
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1488] = $$748$i; //@line 5184
     $753 = $$748$i; //@line 5185
    } else {
     $753 = $688; //@line 5187
    }
    $690 = $$748$i + $$723947$i | 0; //@line 5189
    $$124466$i = 6384; //@line 5190
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 5195
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 5199
     if (!$694) {
      $$0$i$i$i = 6384; //@line 5202
      break;
     } else {
      $$124466$i = $694; //@line 5205
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 5214
      $700 = $$124466$i + 4 | 0; //@line 5215
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 5218
      $704 = $$748$i + 8 | 0; //@line 5220
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 5226
      $712 = $690 + 8 | 0; //@line 5228
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 5234
      $722 = $710 + $$0197 | 0; //@line 5238
      $723 = $718 - $710 - $$0197 | 0; //@line 5239
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 5242
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1487] | 0) + $723 | 0; //@line 5247
        HEAP32[1487] = $728; //@line 5248
        HEAP32[1490] = $722; //@line 5249
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 5252
       } else {
        if ((HEAP32[1489] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1486] | 0) + $723 | 0; //@line 5258
         HEAP32[1486] = $734; //@line 5259
         HEAP32[1489] = $722; //@line 5260
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 5263
         HEAP32[$722 + $734 >> 2] = $734; //@line 5265
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 5269
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 5273
         $743 = $739 >>> 3; //@line 5274
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 5279
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 5281
           $750 = 5976 + ($743 << 1 << 2) | 0; //@line 5283
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 5289
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 5298
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1484] = HEAP32[1484] & ~(1 << $743); //@line 5308
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 5315
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 5319
             }
             $764 = $748 + 8 | 0; //@line 5322
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 5326
              break;
             }
             _abort(); //@line 5329
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 5334
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 5335
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 5338
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 5340
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 5344
             $783 = $782 + 4 | 0; //@line 5345
             $784 = HEAP32[$783 >> 2] | 0; //@line 5346
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 5349
              if (!$786) {
               $$3$i$i = 0; //@line 5352
               break;
              } else {
               $$1291$i$i = $786; //@line 5355
               $$1293$i$i = $782; //@line 5355
              }
             } else {
              $$1291$i$i = $784; //@line 5358
              $$1293$i$i = $783; //@line 5358
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 5361
              $789 = HEAP32[$788 >> 2] | 0; //@line 5362
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 5365
               $$1293$i$i = $788; //@line 5365
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 5368
              $792 = HEAP32[$791 >> 2] | 0; //@line 5369
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 5374
               $$1293$i$i = $791; //@line 5374
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 5379
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 5382
              $$3$i$i = $$1291$i$i; //@line 5383
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 5388
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 5391
             }
             $776 = $774 + 12 | 0; //@line 5394
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 5398
             }
             $779 = $771 + 8 | 0; //@line 5401
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 5405
              HEAP32[$779 >> 2] = $774; //@line 5406
              $$3$i$i = $771; //@line 5407
              break;
             } else {
              _abort(); //@line 5410
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 5420
           $798 = 6240 + ($797 << 2) | 0; //@line 5421
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 5426
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1485] = HEAP32[1485] & ~(1 << $797); //@line 5435
             break L311;
            } else {
             if ((HEAP32[1488] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 5441
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 5449
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1488] | 0; //@line 5459
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 5462
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 5466
           $815 = $718 + 16 | 0; //@line 5467
           $816 = HEAP32[$815 >> 2] | 0; //@line 5468
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 5474
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 5478
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 5480
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 5486
           if (!$822) {
            break;
           }
           if ((HEAP32[1488] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 5494
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 5498
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 5500
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 5507
         $$0287$i$i = $742 + $723 | 0; //@line 5507
        } else {
         $$0$i17$i = $718; //@line 5509
         $$0287$i$i = $723; //@line 5509
        }
        $830 = $$0$i17$i + 4 | 0; //@line 5511
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 5514
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 5517
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 5519
        $836 = $$0287$i$i >>> 3; //@line 5520
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 5976 + ($836 << 1 << 2) | 0; //@line 5524
         $840 = HEAP32[1484] | 0; //@line 5525
         $841 = 1 << $836; //@line 5526
         do {
          if (!($840 & $841)) {
           HEAP32[1484] = $840 | $841; //@line 5532
           $$0295$i$i = $839; //@line 5534
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 5534
          } else {
           $845 = $839 + 8 | 0; //@line 5536
           $846 = HEAP32[$845 >> 2] | 0; //@line 5537
           if ((HEAP32[1488] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 5541
            $$pre$phi$i19$iZ2D = $845; //@line 5541
            break;
           }
           _abort(); //@line 5544
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 5548
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 5550
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 5552
         HEAP32[$722 + 12 >> 2] = $839; //@line 5554
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 5557
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 5561
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 5565
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 5570
          $858 = $852 << $857; //@line 5571
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 5574
          $863 = $858 << $861; //@line 5576
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 5579
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 5584
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 5590
         }
        } while (0);
        $877 = 6240 + ($$0296$i$i << 2) | 0; //@line 5593
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 5595
        $879 = $722 + 16 | 0; //@line 5596
        HEAP32[$879 + 4 >> 2] = 0; //@line 5598
        HEAP32[$879 >> 2] = 0; //@line 5599
        $881 = HEAP32[1485] | 0; //@line 5600
        $882 = 1 << $$0296$i$i; //@line 5601
        if (!($881 & $882)) {
         HEAP32[1485] = $881 | $882; //@line 5606
         HEAP32[$877 >> 2] = $722; //@line 5607
         HEAP32[$722 + 24 >> 2] = $877; //@line 5609
         HEAP32[$722 + 12 >> 2] = $722; //@line 5611
         HEAP32[$722 + 8 >> 2] = $722; //@line 5613
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 5622
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 5622
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 5629
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 5633
         $902 = HEAP32[$900 >> 2] | 0; //@line 5635
         if (!$902) {
          label = 260; //@line 5638
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 5641
          $$0289$i$i = $902; //@line 5641
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1488] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 5648
         } else {
          HEAP32[$900 >> 2] = $722; //@line 5651
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 5653
          HEAP32[$722 + 12 >> 2] = $722; //@line 5655
          HEAP32[$722 + 8 >> 2] = $722; //@line 5657
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 5662
         $910 = HEAP32[$909 >> 2] | 0; //@line 5663
         $911 = HEAP32[1488] | 0; //@line 5664
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 5670
          HEAP32[$909 >> 2] = $722; //@line 5671
          HEAP32[$722 + 8 >> 2] = $910; //@line 5673
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 5675
          HEAP32[$722 + 24 >> 2] = 0; //@line 5677
          break;
         } else {
          _abort(); //@line 5680
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 5687
      STACKTOP = sp; //@line 5688
      return $$0 | 0; //@line 5688
     } else {
      $$0$i$i$i = 6384; //@line 5690
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 5694
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 5699
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 5707
    }
    $927 = $923 + -47 | 0; //@line 5709
    $929 = $927 + 8 | 0; //@line 5711
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 5717
    $936 = $636 + 16 | 0; //@line 5718
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 5720
    $939 = $938 + 8 | 0; //@line 5721
    $940 = $938 + 24 | 0; //@line 5722
    $941 = $$723947$i + -40 | 0; //@line 5723
    $943 = $$748$i + 8 | 0; //@line 5725
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 5730
    $949 = $$748$i + $948 | 0; //@line 5731
    $950 = $941 - $948 | 0; //@line 5732
    HEAP32[1490] = $949; //@line 5733
    HEAP32[1487] = $950; //@line 5734
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 5737
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 5740
    HEAP32[1491] = HEAP32[1606]; //@line 5742
    $956 = $938 + 4 | 0; //@line 5743
    HEAP32[$956 >> 2] = 27; //@line 5744
    HEAP32[$939 >> 2] = HEAP32[1596]; //@line 5745
    HEAP32[$939 + 4 >> 2] = HEAP32[1597]; //@line 5745
    HEAP32[$939 + 8 >> 2] = HEAP32[1598]; //@line 5745
    HEAP32[$939 + 12 >> 2] = HEAP32[1599]; //@line 5745
    HEAP32[1596] = $$748$i; //@line 5746
    HEAP32[1597] = $$723947$i; //@line 5747
    HEAP32[1599] = 0; //@line 5748
    HEAP32[1598] = $939; //@line 5749
    $958 = $940; //@line 5750
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 5752
     HEAP32[$958 >> 2] = 7; //@line 5753
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 5766
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 5769
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 5772
     HEAP32[$938 >> 2] = $964; //@line 5773
     $969 = $964 >>> 3; //@line 5774
     if ($964 >>> 0 < 256) {
      $972 = 5976 + ($969 << 1 << 2) | 0; //@line 5778
      $973 = HEAP32[1484] | 0; //@line 5779
      $974 = 1 << $969; //@line 5780
      if (!($973 & $974)) {
       HEAP32[1484] = $973 | $974; //@line 5785
       $$0211$i$i = $972; //@line 5787
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 5787
      } else {
       $978 = $972 + 8 | 0; //@line 5789
       $979 = HEAP32[$978 >> 2] | 0; //@line 5790
       if ((HEAP32[1488] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 5794
       } else {
        $$0211$i$i = $979; //@line 5797
        $$pre$phi$i$iZ2D = $978; //@line 5797
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 5800
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 5802
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 5804
      HEAP32[$636 + 12 >> 2] = $972; //@line 5806
      break;
     }
     $985 = $964 >>> 8; //@line 5809
     if (!$985) {
      $$0212$i$i = 0; //@line 5812
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 5816
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 5820
       $991 = $985 << $990; //@line 5821
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 5824
       $996 = $991 << $994; //@line 5826
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 5829
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 5834
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 5840
      }
     }
     $1010 = 6240 + ($$0212$i$i << 2) | 0; //@line 5843
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 5845
     HEAP32[$636 + 20 >> 2] = 0; //@line 5847
     HEAP32[$936 >> 2] = 0; //@line 5848
     $1013 = HEAP32[1485] | 0; //@line 5849
     $1014 = 1 << $$0212$i$i; //@line 5850
     if (!($1013 & $1014)) {
      HEAP32[1485] = $1013 | $1014; //@line 5855
      HEAP32[$1010 >> 2] = $636; //@line 5856
      HEAP32[$636 + 24 >> 2] = $1010; //@line 5858
      HEAP32[$636 + 12 >> 2] = $636; //@line 5860
      HEAP32[$636 + 8 >> 2] = $636; //@line 5862
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 5871
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 5871
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 5878
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 5882
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 5884
      if (!$1034) {
       label = 286; //@line 5887
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 5890
       $$0207$i$i = $1034; //@line 5890
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1488] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 5897
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 5900
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 5902
       HEAP32[$636 + 12 >> 2] = $636; //@line 5904
       HEAP32[$636 + 8 >> 2] = $636; //@line 5906
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 5911
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 5912
      $1043 = HEAP32[1488] | 0; //@line 5913
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 5919
       HEAP32[$1041 >> 2] = $636; //@line 5920
       HEAP32[$636 + 8 >> 2] = $1042; //@line 5922
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 5924
       HEAP32[$636 + 24 >> 2] = 0; //@line 5926
       break;
      } else {
       _abort(); //@line 5929
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1487] | 0; //@line 5936
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 5939
   HEAP32[1487] = $1054; //@line 5940
   $1055 = HEAP32[1490] | 0; //@line 5941
   $1056 = $1055 + $$0197 | 0; //@line 5942
   HEAP32[1490] = $1056; //@line 5943
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 5946
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 5949
   $$0 = $1055 + 8 | 0; //@line 5951
   STACKTOP = sp; //@line 5952
   return $$0 | 0; //@line 5952
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 5956
 $$0 = 0; //@line 5957
 STACKTOP = sp; //@line 5958
 return $$0 | 0; //@line 5958
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9680
 STACKTOP = STACKTOP + 560 | 0; //@line 9681
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 9681
 $6 = sp + 8 | 0; //@line 9682
 $7 = sp; //@line 9683
 $8 = sp + 524 | 0; //@line 9684
 $9 = $8; //@line 9685
 $10 = sp + 512 | 0; //@line 9686
 HEAP32[$7 >> 2] = 0; //@line 9687
 $11 = $10 + 12 | 0; //@line 9688
 ___DOUBLE_BITS_677($1) | 0; //@line 9689
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 9694
  $$0520 = 1; //@line 9694
  $$0521 = 3064; //@line 9694
 } else {
  $$0471 = $1; //@line 9705
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 9705
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 3065 : 3070 : 3067; //@line 9705
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 9707
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 9716
   $31 = $$0520 + 3 | 0; //@line 9721
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 9723
   _out_670($0, $$0521, $$0520); //@line 9724
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 3091 : 3095 : $27 ? 3083 : 3087, 3); //@line 9725
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 9727
   $$sink560 = $31; //@line 9728
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 9731
   $36 = $35 != 0.0; //@line 9732
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 9736
   }
   $39 = $5 | 32; //@line 9738
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 9741
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 9744
    $44 = $$0520 | 2; //@line 9745
    $46 = 12 - $3 | 0; //@line 9747
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 9752
     } else {
      $$0509585 = 8.0; //@line 9754
      $$1508586 = $46; //@line 9754
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 9756
       $$0509585 = $$0509585 * 16.0; //@line 9757
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 9772
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 9777
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 9782
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 9785
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 9788
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 9791
     HEAP8[$68 >> 0] = 48; //@line 9792
     $$0511 = $68; //@line 9793
    } else {
     $$0511 = $66; //@line 9795
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 9802
    $76 = $$0511 + -2 | 0; //@line 9805
    HEAP8[$76 >> 0] = $5 + 15; //@line 9806
    $77 = ($3 | 0) < 1; //@line 9807
    $79 = ($4 & 8 | 0) == 0; //@line 9809
    $$0523 = $8; //@line 9810
    $$2473 = $$1472; //@line 9810
    while (1) {
     $80 = ~~$$2473; //@line 9812
     $86 = $$0523 + 1 | 0; //@line 9818
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[3099 + $80 >> 0]; //@line 9819
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 9822
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 9831
      } else {
       HEAP8[$86 >> 0] = 46; //@line 9834
       $$1524 = $$0523 + 2 | 0; //@line 9835
      }
     } else {
      $$1524 = $86; //@line 9838
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 9842
     }
    }
    $$pre693 = $$1524; //@line 9848
    if (!$3) {
     label = 24; //@line 9850
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 9858
      $$sink = $3 + 2 | 0; //@line 9858
     } else {
      label = 24; //@line 9860
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 9864
     $$pre$phi691Z2D = $101; //@line 9865
     $$sink = $101; //@line 9865
    }
    $104 = $11 - $76 | 0; //@line 9869
    $106 = $104 + $44 + $$sink | 0; //@line 9871
    _pad_676($0, 32, $2, $106, $4); //@line 9872
    _out_670($0, $$0521$, $44); //@line 9873
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 9875
    _out_670($0, $8, $$pre$phi691Z2D); //@line 9876
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 9878
    _out_670($0, $76, $104); //@line 9879
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 9881
    $$sink560 = $106; //@line 9882
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 9886
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 9890
    HEAP32[$7 >> 2] = $113; //@line 9891
    $$3 = $35 * 268435456.0; //@line 9892
    $$pr = $113; //@line 9892
   } else {
    $$3 = $35; //@line 9895
    $$pr = HEAP32[$7 >> 2] | 0; //@line 9895
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 9899
   $$0498 = $$561; //@line 9900
   $$4 = $$3; //@line 9900
   do {
    $116 = ~~$$4 >>> 0; //@line 9902
    HEAP32[$$0498 >> 2] = $116; //@line 9903
    $$0498 = $$0498 + 4 | 0; //@line 9904
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 9907
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 9917
    $$1499662 = $$0498; //@line 9917
    $124 = $$pr; //@line 9917
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 9920
     $$0488655 = $$1499662 + -4 | 0; //@line 9921
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 9924
     } else {
      $$0488657 = $$0488655; //@line 9926
      $$0497656 = 0; //@line 9926
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 9929
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 9931
       $131 = tempRet0; //@line 9932
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 9933
       HEAP32[$$0488657 >> 2] = $132; //@line 9935
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 9936
       $$0488657 = $$0488657 + -4 | 0; //@line 9938
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 9948
      } else {
       $138 = $$1482663 + -4 | 0; //@line 9950
       HEAP32[$138 >> 2] = $$0497656; //@line 9951
       $$2483$ph = $138; //@line 9952
      }
     }
     $$2500 = $$1499662; //@line 9955
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 9961
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 9965
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 9971
     HEAP32[$7 >> 2] = $144; //@line 9972
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 9975
      $$1499662 = $$2500; //@line 9975
      $124 = $144; //@line 9975
     } else {
      $$1482$lcssa = $$2483$ph; //@line 9977
      $$1499$lcssa = $$2500; //@line 9977
      $$pr566 = $144; //@line 9977
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 9982
    $$1499$lcssa = $$0498; //@line 9982
    $$pr566 = $$pr; //@line 9982
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 9988
    $150 = ($39 | 0) == 102; //@line 9989
    $$3484650 = $$1482$lcssa; //@line 9990
    $$3501649 = $$1499$lcssa; //@line 9990
    $152 = $$pr566; //@line 9990
    while (1) {
     $151 = 0 - $152 | 0; //@line 9992
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 9994
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 9998
      $161 = 1e9 >>> $154; //@line 9999
      $$0487644 = 0; //@line 10000
      $$1489643 = $$3484650; //@line 10000
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 10002
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 10006
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 10007
       $$1489643 = $$1489643 + 4 | 0; //@line 10008
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 10019
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 10022
       $$4502 = $$3501649; //@line 10022
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 10025
       $$$3484700 = $$$3484; //@line 10026
       $$4502 = $$3501649 + 4 | 0; //@line 10026
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 10033
      $$4502 = $$3501649; //@line 10033
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 10035
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 10042
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 10044
     HEAP32[$7 >> 2] = $152; //@line 10045
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 10050
      $$3501$lcssa = $$$4502; //@line 10050
      break;
     } else {
      $$3484650 = $$$3484700; //@line 10048
      $$3501649 = $$$4502; //@line 10048
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 10055
    $$3501$lcssa = $$1499$lcssa; //@line 10055
   }
   $185 = $$561; //@line 10058
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 10063
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 10064
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 10067
    } else {
     $$0514639 = $189; //@line 10069
     $$0530638 = 10; //@line 10069
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 10071
      $193 = $$0514639 + 1 | 0; //@line 10072
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 10075
       break;
      } else {
       $$0514639 = $193; //@line 10078
      }
     }
    }
   } else {
    $$1515 = 0; //@line 10083
   }
   $198 = ($39 | 0) == 103; //@line 10088
   $199 = ($$540 | 0) != 0; //@line 10089
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 10092
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 10101
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 10104
    $213 = ($209 | 0) % 9 | 0; //@line 10105
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 10108
     $$1531632 = 10; //@line 10108
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 10111
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 10114
       $$1531632 = $215; //@line 10114
      } else {
       $$1531$lcssa = $215; //@line 10116
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 10121
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 10123
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 10124
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 10127
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 10130
     $$4518 = $$1515; //@line 10130
     $$8 = $$3484$lcssa; //@line 10130
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 10135
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 10136
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 10141
     if (!$$0520) {
      $$1467 = $$$564; //@line 10144
      $$1469 = $$543; //@line 10144
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 10147
      $$1467 = $230 ? -$$$564 : $$$564; //@line 10152
      $$1469 = $230 ? -$$543 : $$543; //@line 10152
     }
     $233 = $217 - $218 | 0; //@line 10154
     HEAP32[$212 >> 2] = $233; //@line 10155
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 10159
      HEAP32[$212 >> 2] = $236; //@line 10160
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 10163
       $$sink547625 = $212; //@line 10163
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 10165
        HEAP32[$$sink547625 >> 2] = 0; //@line 10166
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 10169
         HEAP32[$240 >> 2] = 0; //@line 10170
         $$6 = $240; //@line 10171
        } else {
         $$6 = $$5486626; //@line 10173
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 10176
        HEAP32[$238 >> 2] = $242; //@line 10177
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 10180
         $$sink547625 = $238; //@line 10180
        } else {
         $$5486$lcssa = $$6; //@line 10182
         $$sink547$lcssa = $238; //@line 10182
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 10187
       $$sink547$lcssa = $212; //@line 10187
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 10192
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 10193
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 10196
       $$4518 = $247; //@line 10196
       $$8 = $$5486$lcssa; //@line 10196
      } else {
       $$2516621 = $247; //@line 10198
       $$2532620 = 10; //@line 10198
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 10200
        $251 = $$2516621 + 1 | 0; //@line 10201
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 10204
         $$4518 = $251; //@line 10204
         $$8 = $$5486$lcssa; //@line 10204
         break;
        } else {
         $$2516621 = $251; //@line 10207
        }
       }
      }
     } else {
      $$4492 = $212; //@line 10212
      $$4518 = $$1515; //@line 10212
      $$8 = $$3484$lcssa; //@line 10212
     }
    }
    $253 = $$4492 + 4 | 0; //@line 10215
    $$5519$ph = $$4518; //@line 10218
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 10218
    $$9$ph = $$8; //@line 10218
   } else {
    $$5519$ph = $$1515; //@line 10220
    $$7505$ph = $$3501$lcssa; //@line 10220
    $$9$ph = $$3484$lcssa; //@line 10220
   }
   $$7505 = $$7505$ph; //@line 10222
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 10226
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 10229
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 10233
    } else {
     $$lcssa675 = 1; //@line 10235
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 10239
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 10244
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 10252
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 10252
     } else {
      $$0479 = $5 + -2 | 0; //@line 10256
      $$2476 = $$540$ + -1 | 0; //@line 10256
     }
     $267 = $4 & 8; //@line 10258
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 10263
       if (!$270) {
        $$2529 = 9; //@line 10266
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 10271
         $$3533616 = 10; //@line 10271
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 10273
          $275 = $$1528617 + 1 | 0; //@line 10274
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 10280
           break;
          } else {
           $$1528617 = $275; //@line 10278
          }
         }
        } else {
         $$2529 = 0; //@line 10285
        }
       }
      } else {
       $$2529 = 9; //@line 10289
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 10297
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 10299
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 10301
       $$1480 = $$0479; //@line 10304
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 10304
       $$pre$phi698Z2D = 0; //@line 10304
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 10308
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 10310
       $$1480 = $$0479; //@line 10313
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 10313
       $$pre$phi698Z2D = 0; //@line 10313
       break;
      }
     } else {
      $$1480 = $$0479; //@line 10317
      $$3477 = $$2476; //@line 10317
      $$pre$phi698Z2D = $267; //@line 10317
     }
    } else {
     $$1480 = $5; //@line 10321
     $$3477 = $$540; //@line 10321
     $$pre$phi698Z2D = $4 & 8; //@line 10321
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 10324
   $294 = ($292 | 0) != 0 & 1; //@line 10326
   $296 = ($$1480 | 32 | 0) == 102; //@line 10328
   if ($296) {
    $$2513 = 0; //@line 10332
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 10332
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 10335
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 10338
    $304 = $11; //@line 10339
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 10344
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 10346
      HEAP8[$308 >> 0] = 48; //@line 10347
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 10352
      } else {
       $$1512$lcssa = $308; //@line 10354
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 10359
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 10366
    $318 = $$1512$lcssa + -2 | 0; //@line 10368
    HEAP8[$318 >> 0] = $$1480; //@line 10369
    $$2513 = $318; //@line 10372
    $$pn = $304 - $318 | 0; //@line 10372
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 10377
   _pad_676($0, 32, $2, $323, $4); //@line 10378
   _out_670($0, $$0521, $$0520); //@line 10379
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 10381
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 10384
    $326 = $8 + 9 | 0; //@line 10385
    $327 = $326; //@line 10386
    $328 = $8 + 8 | 0; //@line 10387
    $$5493600 = $$0496$$9; //@line 10388
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 10391
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 10396
       $$1465 = $328; //@line 10397
      } else {
       $$1465 = $330; //@line 10399
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 10406
       $$0464597 = $330; //@line 10407
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 10409
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 10412
        } else {
         $$1465 = $335; //@line 10414
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 10419
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 10424
     $$5493600 = $$5493600 + 4 | 0; //@line 10425
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 3115, 1); //@line 10435
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 10441
     $$6494592 = $$5493600; //@line 10441
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 10444
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 10449
       $$0463587 = $347; //@line 10450
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 10452
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 10455
        } else {
         $$0463$lcssa = $351; //@line 10457
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 10462
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 10466
      $$6494592 = $$6494592 + 4 | 0; //@line 10467
      $356 = $$4478593 + -9 | 0; //@line 10468
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 10475
       break;
      } else {
       $$4478593 = $356; //@line 10473
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 10480
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 10483
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 10486
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 10489
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 10490
     $365 = $363; //@line 10491
     $366 = 0 - $9 | 0; //@line 10492
     $367 = $8 + 8 | 0; //@line 10493
     $$5605 = $$3477; //@line 10494
     $$7495604 = $$9$ph; //@line 10494
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 10497
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 10500
       $$0 = $367; //@line 10501
      } else {
       $$0 = $369; //@line 10503
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 10508
        _out_670($0, $$0, 1); //@line 10509
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 10513
         break;
        }
        _out_670($0, 3115, 1); //@line 10516
        $$2 = $375; //@line 10517
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 10521
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 10526
        $$1601 = $$0; //@line 10527
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 10529
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 10532
         } else {
          $$2 = $373; //@line 10534
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 10541
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 10544
      $381 = $$5605 - $378 | 0; //@line 10545
      $$7495604 = $$7495604 + 4 | 0; //@line 10546
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 10553
       break;
      } else {
       $$5605 = $381; //@line 10551
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 10558
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 10561
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 10565
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 10568
   $$sink560 = $323; //@line 10569
  }
 } while (0);
 STACKTOP = sp; //@line 10574
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 10574
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 8252
 STACKTOP = STACKTOP + 64 | 0; //@line 8253
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 8253
 $5 = sp + 16 | 0; //@line 8254
 $6 = sp; //@line 8255
 $7 = sp + 24 | 0; //@line 8256
 $8 = sp + 8 | 0; //@line 8257
 $9 = sp + 20 | 0; //@line 8258
 HEAP32[$5 >> 2] = $1; //@line 8259
 $10 = ($0 | 0) != 0; //@line 8260
 $11 = $7 + 40 | 0; //@line 8261
 $12 = $11; //@line 8262
 $13 = $7 + 39 | 0; //@line 8263
 $14 = $8 + 4 | 0; //@line 8264
 $$0243 = 0; //@line 8265
 $$0247 = 0; //@line 8265
 $$0269 = 0; //@line 8265
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 8274
     $$1248 = -1; //@line 8275
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 8279
     break;
    }
   } else {
    $$1248 = $$0247; //@line 8283
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 8286
  $21 = HEAP8[$20 >> 0] | 0; //@line 8287
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 8290
   break;
  } else {
   $23 = $21; //@line 8293
   $25 = $20; //@line 8293
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 8298
     $27 = $25; //@line 8298
     label = 9; //@line 8299
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 8304
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 8311
   HEAP32[$5 >> 2] = $24; //@line 8312
   $23 = HEAP8[$24 >> 0] | 0; //@line 8314
   $25 = $24; //@line 8314
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 8319
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 8324
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 8327
     $27 = $27 + 2 | 0; //@line 8328
     HEAP32[$5 >> 2] = $27; //@line 8329
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 8336
      break;
     } else {
      $$0249303 = $30; //@line 8333
      label = 9; //@line 8334
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 8344
  if ($10) {
   _out_670($0, $20, $36); //@line 8346
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 8350
   $$0247 = $$1248; //@line 8350
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 8358
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 8359
  if ($43) {
   $$0253 = -1; //@line 8361
   $$1270 = $$0269; //@line 8361
   $$sink = 1; //@line 8361
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 8371
    $$1270 = 1; //@line 8371
    $$sink = 3; //@line 8371
   } else {
    $$0253 = -1; //@line 8373
    $$1270 = $$0269; //@line 8373
    $$sink = 1; //@line 8373
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 8376
  HEAP32[$5 >> 2] = $51; //@line 8377
  $52 = HEAP8[$51 >> 0] | 0; //@line 8378
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 8380
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 8387
   $$lcssa291 = $52; //@line 8387
   $$lcssa292 = $51; //@line 8387
  } else {
   $$0262309 = 0; //@line 8389
   $60 = $52; //@line 8389
   $65 = $51; //@line 8389
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 8394
    $64 = $65 + 1 | 0; //@line 8395
    HEAP32[$5 >> 2] = $64; //@line 8396
    $66 = HEAP8[$64 >> 0] | 0; //@line 8397
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 8399
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 8406
     $$lcssa291 = $66; //@line 8406
     $$lcssa292 = $64; //@line 8406
     break;
    } else {
     $$0262309 = $63; //@line 8409
     $60 = $66; //@line 8409
     $65 = $64; //@line 8409
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 8421
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 8423
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 8428
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 8433
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 8445
     $$2271 = 1; //@line 8445
     $storemerge274 = $79 + 3 | 0; //@line 8445
    } else {
     label = 23; //@line 8447
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 8451
    if ($$1270 | 0) {
     $$0 = -1; //@line 8454
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8469
     $106 = HEAP32[$105 >> 2] | 0; //@line 8470
     HEAP32[$2 >> 2] = $105 + 4; //@line 8472
     $363 = $106; //@line 8473
    } else {
     $363 = 0; //@line 8475
    }
    $$0259 = $363; //@line 8479
    $$2271 = 0; //@line 8479
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 8479
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 8481
   $109 = ($$0259 | 0) < 0; //@line 8482
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 8487
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 8487
   $$3272 = $$2271; //@line 8487
   $115 = $storemerge274; //@line 8487
  } else {
   $112 = _getint_671($5) | 0; //@line 8489
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 8492
    break;
   }
   $$1260 = $112; //@line 8496
   $$1263 = $$0262$lcssa; //@line 8496
   $$3272 = $$1270; //@line 8496
   $115 = HEAP32[$5 >> 2] | 0; //@line 8496
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 8507
     $156 = _getint_671($5) | 0; //@line 8508
     $$0254 = $156; //@line 8510
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 8510
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 8519
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 8524
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 8529
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 8536
      $144 = $125 + 4 | 0; //@line 8540
      HEAP32[$5 >> 2] = $144; //@line 8541
      $$0254 = $140; //@line 8542
      $$pre345 = $144; //@line 8542
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 8548
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 8563
     $152 = HEAP32[$151 >> 2] | 0; //@line 8564
     HEAP32[$2 >> 2] = $151 + 4; //@line 8566
     $364 = $152; //@line 8567
    } else {
     $364 = 0; //@line 8569
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 8572
    HEAP32[$5 >> 2] = $154; //@line 8573
    $$0254 = $364; //@line 8574
    $$pre345 = $154; //@line 8574
   } else {
    $$0254 = -1; //@line 8576
    $$pre345 = $115; //@line 8576
   }
  } while (0);
  $$0252 = 0; //@line 8579
  $158 = $$pre345; //@line 8579
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 8586
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 8589
   HEAP32[$5 >> 2] = $158; //@line 8590
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (2583 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 8595
   $168 = $167 & 255; //@line 8596
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 8600
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 8607
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 8611
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 8615
     break L1;
    } else {
     label = 50; //@line 8618
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 8623
     $176 = $3 + ($$0253 << 3) | 0; //@line 8625
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 8630
     $182 = $6; //@line 8631
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 8633
     HEAP32[$182 + 4 >> 2] = $181; //@line 8636
     label = 50; //@line 8637
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 8641
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 8644
    $187 = HEAP32[$5 >> 2] | 0; //@line 8646
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 8650
   if ($10) {
    $187 = $158; //@line 8652
   } else {
    $$0243 = 0; //@line 8654
    $$0247 = $$1248; //@line 8654
    $$0269 = $$3272; //@line 8654
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 8660
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 8666
  $196 = $$1263 & -65537; //@line 8669
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 8670
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 8678
       $$0243 = 0; //@line 8679
       $$0247 = $$1248; //@line 8679
       $$0269 = $$3272; //@line 8679
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 8685
       $$0243 = 0; //@line 8686
       $$0247 = $$1248; //@line 8686
       $$0269 = $$3272; //@line 8686
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 8694
       HEAP32[$208 >> 2] = $$1248; //@line 8696
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 8699
       $$0243 = 0; //@line 8700
       $$0247 = $$1248; //@line 8700
       $$0269 = $$3272; //@line 8700
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 8707
       $$0243 = 0; //@line 8708
       $$0247 = $$1248; //@line 8708
       $$0269 = $$3272; //@line 8708
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 8715
       $$0243 = 0; //@line 8716
       $$0247 = $$1248; //@line 8716
       $$0269 = $$3272; //@line 8716
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 8722
       $$0243 = 0; //@line 8723
       $$0247 = $$1248; //@line 8723
       $$0269 = $$3272; //@line 8723
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 8731
       HEAP32[$220 >> 2] = $$1248; //@line 8733
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 8736
       $$0243 = 0; //@line 8737
       $$0247 = $$1248; //@line 8737
       $$0269 = $$3272; //@line 8737
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 8742
       $$0247 = $$1248; //@line 8742
       $$0269 = $$3272; //@line 8742
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 8752
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 8752
     $$3265 = $$1263$ | 8; //@line 8752
     label = 62; //@line 8753
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 8757
     $$1255 = $$0254; //@line 8757
     $$3265 = $$1263$; //@line 8757
     label = 62; //@line 8758
     break;
    }
   case 111:
    {
     $242 = $6; //@line 8762
     $244 = HEAP32[$242 >> 2] | 0; //@line 8764
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 8767
     $248 = _fmt_o($244, $247, $11) | 0; //@line 8768
     $252 = $12 - $248 | 0; //@line 8772
     $$0228 = $248; //@line 8777
     $$1233 = 0; //@line 8777
     $$1238 = 3047; //@line 8777
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 8777
     $$4266 = $$1263$; //@line 8777
     $281 = $244; //@line 8777
     $283 = $247; //@line 8777
     label = 68; //@line 8778
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 8782
     $258 = HEAP32[$256 >> 2] | 0; //@line 8784
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 8787
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 8790
      $264 = tempRet0; //@line 8791
      $265 = $6; //@line 8792
      HEAP32[$265 >> 2] = $263; //@line 8794
      HEAP32[$265 + 4 >> 2] = $264; //@line 8797
      $$0232 = 1; //@line 8798
      $$0237 = 3047; //@line 8798
      $275 = $263; //@line 8798
      $276 = $264; //@line 8798
      label = 67; //@line 8799
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 8811
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 3047 : 3049 : 3048; //@line 8811
      $275 = $258; //@line 8811
      $276 = $261; //@line 8811
      label = 67; //@line 8812
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 8818
     $$0232 = 0; //@line 8824
     $$0237 = 3047; //@line 8824
     $275 = HEAP32[$197 >> 2] | 0; //@line 8824
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 8824
     label = 67; //@line 8825
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 8836
     $$2 = $13; //@line 8837
     $$2234 = 0; //@line 8837
     $$2239 = 3047; //@line 8837
     $$2251 = $11; //@line 8837
     $$5 = 1; //@line 8837
     $$6268 = $196; //@line 8837
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 8844
     label = 72; //@line 8845
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 8849
     $$1 = $302 | 0 ? $302 : 3057; //@line 8852
     label = 72; //@line 8853
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 8863
     HEAP32[$14 >> 2] = 0; //@line 8864
     HEAP32[$6 >> 2] = $8; //@line 8865
     $$4258354 = -1; //@line 8866
     $365 = $8; //@line 8866
     label = 76; //@line 8867
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 8871
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 8874
      $$0240$lcssa356 = 0; //@line 8875
      label = 85; //@line 8876
     } else {
      $$4258354 = $$0254; //@line 8878
      $365 = $$pre348; //@line 8878
      label = 76; //@line 8879
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 8886
     $$0247 = $$1248; //@line 8886
     $$0269 = $$3272; //@line 8886
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 8891
     $$2234 = 0; //@line 8891
     $$2239 = 3047; //@line 8891
     $$2251 = $11; //@line 8891
     $$5 = $$0254; //@line 8891
     $$6268 = $$1263$; //@line 8891
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 8897
    $227 = $6; //@line 8898
    $229 = HEAP32[$227 >> 2] | 0; //@line 8900
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 8903
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 8905
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 8911
    $$0228 = $234; //@line 8916
    $$1233 = $or$cond278 ? 0 : 2; //@line 8916
    $$1238 = $or$cond278 ? 3047 : 3047 + ($$1236 >> 4) | 0; //@line 8916
    $$2256 = $$1255; //@line 8916
    $$4266 = $$3265; //@line 8916
    $281 = $229; //@line 8916
    $283 = $232; //@line 8916
    label = 68; //@line 8917
   } else if ((label | 0) == 67) {
    label = 0; //@line 8920
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 8922
    $$1233 = $$0232; //@line 8922
    $$1238 = $$0237; //@line 8922
    $$2256 = $$0254; //@line 8922
    $$4266 = $$1263$; //@line 8922
    $281 = $275; //@line 8922
    $283 = $276; //@line 8922
    label = 68; //@line 8923
   } else if ((label | 0) == 72) {
    label = 0; //@line 8926
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 8927
    $306 = ($305 | 0) == 0; //@line 8928
    $$2 = $$1; //@line 8935
    $$2234 = 0; //@line 8935
    $$2239 = 3047; //@line 8935
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 8935
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 8935
    $$6268 = $196; //@line 8935
   } else if ((label | 0) == 76) {
    label = 0; //@line 8938
    $$0229316 = $365; //@line 8939
    $$0240315 = 0; //@line 8939
    $$1244314 = 0; //@line 8939
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 8941
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 8944
      $$2245 = $$1244314; //@line 8944
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 8947
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 8953
      $$2245 = $320; //@line 8953
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 8957
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 8960
      $$0240315 = $325; //@line 8960
      $$1244314 = $320; //@line 8960
     } else {
      $$0240$lcssa = $325; //@line 8962
      $$2245 = $320; //@line 8962
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 8968
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 8971
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 8974
     label = 85; //@line 8975
    } else {
     $$1230327 = $365; //@line 8977
     $$1241326 = 0; //@line 8977
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 8979
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 8982
       label = 85; //@line 8983
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 8986
      $$1241326 = $331 + $$1241326 | 0; //@line 8987
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 8990
       label = 85; //@line 8991
       break L97;
      }
      _out_670($0, $9, $331); //@line 8995
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9000
       label = 85; //@line 9001
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 8998
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 9009
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 9015
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 9017
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 9022
   $$2 = $or$cond ? $$0228 : $11; //@line 9027
   $$2234 = $$1233; //@line 9027
   $$2239 = $$1238; //@line 9027
   $$2251 = $11; //@line 9027
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 9027
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 9027
  } else if ((label | 0) == 85) {
   label = 0; //@line 9030
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 9032
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 9035
   $$0247 = $$1248; //@line 9035
   $$0269 = $$3272; //@line 9035
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 9040
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 9042
  $345 = $$$5 + $$2234 | 0; //@line 9043
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 9045
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 9046
  _out_670($0, $$2239, $$2234); //@line 9047
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 9049
  _pad_676($0, 48, $$$5, $343, 0); //@line 9050
  _out_670($0, $$2, $343); //@line 9051
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 9053
  $$0243 = $$2261; //@line 9054
  $$0247 = $$1248; //@line 9054
  $$0269 = $$3272; //@line 9054
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 9062
    } else {
     $$2242302 = 1; //@line 9064
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 9067
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 9070
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 9074
      $356 = $$2242302 + 1 | 0; //@line 9075
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 9078
      } else {
       $$2242$lcssa = $356; //@line 9080
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 9086
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 9092
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 9098
       } else {
        $$0 = 1; //@line 9100
        break;
       }
      }
     } else {
      $$0 = 1; //@line 9105
     }
    }
   } else {
    $$0 = $$1248; //@line 9109
   }
  }
 } while (0);
 STACKTOP = sp; //@line 9113
 return $$0 | 0; //@line 9113
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
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer23; //@line 834
    HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer23; //@line 836
    HEAP32[$AsyncCtx + 16 >> 2] = $2; //@line 838
    HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 840
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer3; //@line 842
    HEAP32[$AsyncCtx + 28 >> 2] = $vararg_buffer3; //@line 844
    HEAP32[$AsyncCtx + 32 >> 2] = $3; //@line 846
    HEAP32[$AsyncCtx + 36 >> 2] = $vararg_buffer; //@line 848
    HEAP32[$AsyncCtx + 40 >> 2] = $vararg_buffer; //@line 850
    HEAP32[$AsyncCtx + 44 >> 2] = $vararg_buffer20; //@line 852
    HEAP32[$AsyncCtx + 48 >> 2] = $vararg_buffer20; //@line 854
    HEAP32[$AsyncCtx + 52 >> 2] = $vararg_buffer1; //@line 856
    HEAP32[$AsyncCtx + 56 >> 2] = $vararg_buffer1; //@line 858
    HEAP32[$AsyncCtx + 60 >> 2] = $vararg_buffer6; //@line 860
    HEAP32[$AsyncCtx + 64 >> 2] = $vararg_buffer6; //@line 862
    HEAP32[$AsyncCtx + 68 >> 2] = $4; //@line 864
    HEAP32[$AsyncCtx + 72 >> 2] = $vararg_buffer18; //@line 866
    HEAP32[$AsyncCtx + 76 >> 2] = $vararg_buffer18; //@line 868
    HEAP32[$AsyncCtx + 80 >> 2] = $vararg_buffer15; //@line 870
    HEAP32[$AsyncCtx + 84 >> 2] = $vararg_buffer15; //@line 872
    HEAP32[$AsyncCtx + 88 >> 2] = $vararg_buffer12; //@line 874
    HEAP32[$AsyncCtx + 92 >> 2] = $vararg_buffer12; //@line 876
    HEAP32[$AsyncCtx + 96 >> 2] = $vararg_buffer9; //@line 878
    HEAP32[$AsyncCtx + 100 >> 2] = $vararg_buffer9; //@line 880
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
           HEAP32[$AsyncCtx60 + 4 >> 2] = $vararg_buffer20; //@line 1110
           HEAP32[$AsyncCtx60 + 8 >> 2] = $vararg_buffer20; //@line 1112
           HEAP8[$AsyncCtx60 + 12 >> 0] = $$1$off0 & 1; //@line 1115
           HEAP32[$AsyncCtx60 + 16 >> 2] = $vararg_buffer23; //@line 1117
           HEAP32[$AsyncCtx60 + 20 >> 2] = $vararg_buffer23; //@line 1119
           HEAP32[$AsyncCtx60 + 24 >> 2] = $vararg_buffer3; //@line 1121
           HEAP32[$AsyncCtx60 + 28 >> 2] = $$1143; //@line 1123
           HEAP32[$AsyncCtx60 + 32 >> 2] = $$1145; //@line 1125
           HEAP32[$AsyncCtx60 + 36 >> 2] = $vararg_buffer3; //@line 1127
           HEAP32[$AsyncCtx60 + 40 >> 2] = $4; //@line 1129
           HEAP32[$AsyncCtx60 + 44 >> 2] = $vararg_buffer6; //@line 1131
           HEAP32[$AsyncCtx60 + 48 >> 2] = $1; //@line 1133
           HEAP32[$AsyncCtx60 + 52 >> 2] = $vararg_buffer6; //@line 1135
           HEAP32[$AsyncCtx60 + 56 >> 2] = $55; //@line 1137
           HEAP32[$AsyncCtx60 + 60 >> 2] = $vararg_buffer18; //@line 1139
           HEAP32[$AsyncCtx60 + 64 >> 2] = $vararg_buffer18; //@line 1141
           HEAP32[$AsyncCtx60 + 68 >> 2] = $vararg_buffer15; //@line 1143
           HEAP32[$AsyncCtx60 + 72 >> 2] = $vararg_buffer15; //@line 1145
           HEAP32[$AsyncCtx60 + 76 >> 2] = $vararg_buffer12; //@line 1147
           HEAP32[$AsyncCtx60 + 80 >> 2] = $vararg_buffer12; //@line 1149
           HEAP32[$AsyncCtx60 + 84 >> 2] = $vararg_buffer9; //@line 1151
           HEAP32[$AsyncCtx60 + 88 >> 2] = $vararg_buffer9; //@line 1153
           HEAP32[$AsyncCtx60 + 92 >> 2] = $2; //@line 1155
           HEAP32[$AsyncCtx60 + 96 >> 2] = $3; //@line 1157
           HEAP32[$AsyncCtx60 + 100 >> 2] = $$3154; //@line 1159
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
           HEAP32[$AsyncCtx38 + 4 >> 2] = $vararg_buffer23; //@line 1175
           HEAP32[$AsyncCtx38 + 8 >> 2] = $vararg_buffer23; //@line 1177
           HEAP8[$AsyncCtx38 + 12 >> 0] = $$1$off0 & 1; //@line 1180
           HEAP32[$AsyncCtx38 + 16 >> 2] = $vararg_buffer3; //@line 1182
           HEAP32[$AsyncCtx38 + 20 >> 2] = $$1143; //@line 1184
           HEAP32[$AsyncCtx38 + 24 >> 2] = $$1145; //@line 1186
           HEAP32[$AsyncCtx38 + 28 >> 2] = $vararg_buffer3; //@line 1188
           HEAP32[$AsyncCtx38 + 32 >> 2] = $4; //@line 1190
           HEAP32[$AsyncCtx38 + 36 >> 2] = $vararg_buffer20; //@line 1192
           HEAP32[$AsyncCtx38 + 40 >> 2] = $vararg_buffer20; //@line 1194
           HEAP32[$AsyncCtx38 + 44 >> 2] = $vararg_buffer6; //@line 1196
           HEAP32[$AsyncCtx38 + 48 >> 2] = $1; //@line 1198
           HEAP32[$AsyncCtx38 + 52 >> 2] = $vararg_buffer6; //@line 1200
           HEAP32[$AsyncCtx38 + 56 >> 2] = $55; //@line 1202
           HEAP32[$AsyncCtx38 + 60 >> 2] = $vararg_buffer18; //@line 1204
           HEAP32[$AsyncCtx38 + 64 >> 2] = $vararg_buffer18; //@line 1206
           HEAP32[$AsyncCtx38 + 68 >> 2] = $vararg_buffer15; //@line 1208
           HEAP32[$AsyncCtx38 + 72 >> 2] = $vararg_buffer15; //@line 1210
           HEAP32[$AsyncCtx38 + 76 >> 2] = $vararg_buffer12; //@line 1212
           HEAP32[$AsyncCtx38 + 80 >> 2] = $vararg_buffer12; //@line 1214
           HEAP32[$AsyncCtx38 + 84 >> 2] = $vararg_buffer9; //@line 1216
           HEAP32[$AsyncCtx38 + 88 >> 2] = $vararg_buffer9; //@line 1218
           HEAP32[$AsyncCtx38 + 92 >> 2] = $2; //@line 1220
           HEAP32[$AsyncCtx38 + 96 >> 2] = $3; //@line 1222
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
          HEAP32[$AsyncCtx56 + 4 >> 2] = $vararg_buffer20; //@line 1304
          HEAP32[$AsyncCtx56 + 8 >> 2] = $vararg_buffer20; //@line 1306
          HEAP8[$AsyncCtx56 + 12 >> 0] = $$1$off0 & 1; //@line 1309
          HEAP32[$AsyncCtx56 + 16 >> 2] = $vararg_buffer23; //@line 1311
          HEAP32[$AsyncCtx56 + 20 >> 2] = $vararg_buffer23; //@line 1313
          HEAP32[$AsyncCtx56 + 24 >> 2] = $169; //@line 1315
          HEAP32[$AsyncCtx56 + 28 >> 2] = $168; //@line 1317
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
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 5985
 $3 = HEAP32[1488] | 0; //@line 5986
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 5989
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 5993
 $7 = $6 & 3; //@line 5994
 if (($7 | 0) == 1) {
  _abort(); //@line 5997
 }
 $9 = $6 & -8; //@line 6000
 $10 = $2 + $9 | 0; //@line 6001
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 6006
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 6012
   $17 = $13 + $9 | 0; //@line 6013
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 6016
   }
   if ((HEAP32[1489] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 6022
    $106 = HEAP32[$105 >> 2] | 0; //@line 6023
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 6027
     $$1382 = $17; //@line 6027
     $114 = $16; //@line 6027
     break;
    }
    HEAP32[1486] = $17; //@line 6030
    HEAP32[$105 >> 2] = $106 & -2; //@line 6032
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 6035
    HEAP32[$16 + $17 >> 2] = $17; //@line 6037
    return;
   }
   $21 = $13 >>> 3; //@line 6040
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 6044
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 6046
    $28 = 5976 + ($21 << 1 << 2) | 0; //@line 6048
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 6053
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 6060
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1484] = HEAP32[1484] & ~(1 << $21); //@line 6070
     $$1 = $16; //@line 6071
     $$1382 = $17; //@line 6071
     $114 = $16; //@line 6071
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 6077
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 6081
     }
     $41 = $26 + 8 | 0; //@line 6084
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 6088
     } else {
      _abort(); //@line 6090
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 6095
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 6096
    $$1 = $16; //@line 6097
    $$1382 = $17; //@line 6097
    $114 = $16; //@line 6097
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 6101
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 6103
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 6107
     $60 = $59 + 4 | 0; //@line 6108
     $61 = HEAP32[$60 >> 2] | 0; //@line 6109
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 6112
      if (!$63) {
       $$3 = 0; //@line 6115
       break;
      } else {
       $$1387 = $63; //@line 6118
       $$1390 = $59; //@line 6118
      }
     } else {
      $$1387 = $61; //@line 6121
      $$1390 = $60; //@line 6121
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 6124
      $66 = HEAP32[$65 >> 2] | 0; //@line 6125
      if ($66 | 0) {
       $$1387 = $66; //@line 6128
       $$1390 = $65; //@line 6128
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 6131
      $69 = HEAP32[$68 >> 2] | 0; //@line 6132
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 6137
       $$1390 = $68; //@line 6137
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 6142
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 6145
      $$3 = $$1387; //@line 6146
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 6151
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 6154
     }
     $53 = $51 + 12 | 0; //@line 6157
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 6161
     }
     $56 = $48 + 8 | 0; //@line 6164
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 6168
      HEAP32[$56 >> 2] = $51; //@line 6169
      $$3 = $48; //@line 6170
      break;
     } else {
      _abort(); //@line 6173
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 6180
    $$1382 = $17; //@line 6180
    $114 = $16; //@line 6180
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 6183
    $75 = 6240 + ($74 << 2) | 0; //@line 6184
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 6189
      if (!$$3) {
       HEAP32[1485] = HEAP32[1485] & ~(1 << $74); //@line 6196
       $$1 = $16; //@line 6197
       $$1382 = $17; //@line 6197
       $114 = $16; //@line 6197
       break L10;
      }
     } else {
      if ((HEAP32[1488] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 6204
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 6212
       if (!$$3) {
        $$1 = $16; //@line 6215
        $$1382 = $17; //@line 6215
        $114 = $16; //@line 6215
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1488] | 0; //@line 6223
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 6226
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 6230
    $92 = $16 + 16 | 0; //@line 6231
    $93 = HEAP32[$92 >> 2] | 0; //@line 6232
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 6238
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 6242
       HEAP32[$93 + 24 >> 2] = $$3; //@line 6244
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 6250
    if (!$99) {
     $$1 = $16; //@line 6253
     $$1382 = $17; //@line 6253
     $114 = $16; //@line 6253
    } else {
     if ((HEAP32[1488] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 6258
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 6262
      HEAP32[$99 + 24 >> 2] = $$3; //@line 6264
      $$1 = $16; //@line 6265
      $$1382 = $17; //@line 6265
      $114 = $16; //@line 6265
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 6271
   $$1382 = $9; //@line 6271
   $114 = $2; //@line 6271
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 6276
 }
 $115 = $10 + 4 | 0; //@line 6279
 $116 = HEAP32[$115 >> 2] | 0; //@line 6280
 if (!($116 & 1)) {
  _abort(); //@line 6284
 }
 if (!($116 & 2)) {
  if ((HEAP32[1490] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1487] | 0) + $$1382 | 0; //@line 6294
   HEAP32[1487] = $124; //@line 6295
   HEAP32[1490] = $$1; //@line 6296
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 6299
   if (($$1 | 0) != (HEAP32[1489] | 0)) {
    return;
   }
   HEAP32[1489] = 0; //@line 6305
   HEAP32[1486] = 0; //@line 6306
   return;
  }
  if ((HEAP32[1489] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1486] | 0) + $$1382 | 0; //@line 6313
   HEAP32[1486] = $132; //@line 6314
   HEAP32[1489] = $114; //@line 6315
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 6318
   HEAP32[$114 + $132 >> 2] = $132; //@line 6320
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 6324
  $138 = $116 >>> 3; //@line 6325
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 6330
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 6332
    $145 = 5976 + ($138 << 1 << 2) | 0; //@line 6334
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1488] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 6340
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 6347
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1484] = HEAP32[1484] & ~(1 << $138); //@line 6357
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 6363
    } else {
     if ((HEAP32[1488] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 6368
     }
     $160 = $143 + 8 | 0; //@line 6371
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 6375
     } else {
      _abort(); //@line 6377
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 6382
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 6383
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 6386
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 6388
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 6392
      $180 = $179 + 4 | 0; //@line 6393
      $181 = HEAP32[$180 >> 2] | 0; //@line 6394
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 6397
       if (!$183) {
        $$3400 = 0; //@line 6400
        break;
       } else {
        $$1398 = $183; //@line 6403
        $$1402 = $179; //@line 6403
       }
      } else {
       $$1398 = $181; //@line 6406
       $$1402 = $180; //@line 6406
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 6409
       $186 = HEAP32[$185 >> 2] | 0; //@line 6410
       if ($186 | 0) {
        $$1398 = $186; //@line 6413
        $$1402 = $185; //@line 6413
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 6416
       $189 = HEAP32[$188 >> 2] | 0; //@line 6417
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 6422
        $$1402 = $188; //@line 6422
       }
      }
      if ((HEAP32[1488] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 6428
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 6431
       $$3400 = $$1398; //@line 6432
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 6437
      if ((HEAP32[1488] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 6441
      }
      $173 = $170 + 12 | 0; //@line 6444
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 6448
      }
      $176 = $167 + 8 | 0; //@line 6451
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 6455
       HEAP32[$176 >> 2] = $170; //@line 6456
       $$3400 = $167; //@line 6457
       break;
      } else {
       _abort(); //@line 6460
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 6468
     $196 = 6240 + ($195 << 2) | 0; //@line 6469
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 6474
       if (!$$3400) {
        HEAP32[1485] = HEAP32[1485] & ~(1 << $195); //@line 6481
        break L108;
       }
      } else {
       if ((HEAP32[1488] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 6488
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 6496
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1488] | 0; //@line 6506
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 6509
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 6513
     $213 = $10 + 16 | 0; //@line 6514
     $214 = HEAP32[$213 >> 2] | 0; //@line 6515
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 6521
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 6525
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 6527
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 6533
     if ($220 | 0) {
      if ((HEAP32[1488] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 6539
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 6543
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 6545
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 6554
  HEAP32[$114 + $137 >> 2] = $137; //@line 6556
  if (($$1 | 0) == (HEAP32[1489] | 0)) {
   HEAP32[1486] = $137; //@line 6560
   return;
  } else {
   $$2 = $137; //@line 6563
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 6567
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 6570
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 6572
  $$2 = $$1382; //@line 6573
 }
 $235 = $$2 >>> 3; //@line 6575
 if ($$2 >>> 0 < 256) {
  $238 = 5976 + ($235 << 1 << 2) | 0; //@line 6579
  $239 = HEAP32[1484] | 0; //@line 6580
  $240 = 1 << $235; //@line 6581
  if (!($239 & $240)) {
   HEAP32[1484] = $239 | $240; //@line 6586
   $$0403 = $238; //@line 6588
   $$pre$phiZ2D = $238 + 8 | 0; //@line 6588
  } else {
   $244 = $238 + 8 | 0; //@line 6590
   $245 = HEAP32[$244 >> 2] | 0; //@line 6591
   if ((HEAP32[1488] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 6595
   } else {
    $$0403 = $245; //@line 6598
    $$pre$phiZ2D = $244; //@line 6598
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 6601
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 6603
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 6605
  HEAP32[$$1 + 12 >> 2] = $238; //@line 6607
  return;
 }
 $251 = $$2 >>> 8; //@line 6610
 if (!$251) {
  $$0396 = 0; //@line 6613
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 6617
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 6621
   $257 = $251 << $256; //@line 6622
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 6625
   $262 = $257 << $260; //@line 6627
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 6630
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 6635
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 6641
  }
 }
 $276 = 6240 + ($$0396 << 2) | 0; //@line 6644
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 6646
 HEAP32[$$1 + 20 >> 2] = 0; //@line 6649
 HEAP32[$$1 + 16 >> 2] = 0; //@line 6650
 $280 = HEAP32[1485] | 0; //@line 6651
 $281 = 1 << $$0396; //@line 6652
 do {
  if (!($280 & $281)) {
   HEAP32[1485] = $280 | $281; //@line 6658
   HEAP32[$276 >> 2] = $$1; //@line 6659
   HEAP32[$$1 + 24 >> 2] = $276; //@line 6661
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 6663
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 6665
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 6673
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 6673
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 6680
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 6684
    $301 = HEAP32[$299 >> 2] | 0; //@line 6686
    if (!$301) {
     label = 121; //@line 6689
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 6692
     $$0384 = $301; //@line 6692
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1488] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 6699
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 6702
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 6704
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 6706
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 6708
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 6713
    $309 = HEAP32[$308 >> 2] | 0; //@line 6714
    $310 = HEAP32[1488] | 0; //@line 6715
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 6721
     HEAP32[$308 >> 2] = $$1; //@line 6722
     HEAP32[$$1 + 8 >> 2] = $309; //@line 6724
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 6726
     HEAP32[$$1 + 24 >> 2] = 0; //@line 6728
     break;
    } else {
     _abort(); //@line 6731
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1492] | 0) + -1 | 0; //@line 6738
 HEAP32[1492] = $319; //@line 6739
 if (!$319) {
  $$0212$in$i = 6392; //@line 6742
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 6747
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 6753
  }
 }
 HEAP32[1492] = -1; //@line 6756
 return;
}
function _mbed_vtracef__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$1$off0 = 0, $$1$off0$expand_i1_val = 0, $$1$off0$expand_i1_val18 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$3154 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $$lobit = 0, $$sink = 0, $10 = 0, $102 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $136 = 0, $14 = 0, $147 = 0, $148 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $163 = 0, $164 = 0, $18 = 0, $2 = 0, $22 = 0, $24 = 0, $26 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $57 = 0, $6 = 0, $62 = 0, $73 = 0, $74 = 0, $78 = 0, $79 = 0, $8 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $89 = 0, $91 = 0, $95 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx11 = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx7 = 0, $ReallocAsyncCtx8 = 0, $extract$t159 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 15
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 17
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 19
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 21
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 23
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 25
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 27
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 29
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 31
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 35
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 37
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 39
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
 HEAP32[95] = (HEAP32[95] | 0) + 1; //@line 66
 $53 = HEAP32[84] | 0; //@line 67
 do {
  if ($53 | 0) {
   HEAP8[$53 >> 0] = 0; //@line 71
   do {
    if ($2 << 24 >> 24 > -1 & ($10 | 0) != 0) {
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
   if (!((HEAP32[91] | 0) != 0 & ((($10 | 0) == 0 | (($8 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[88] = HEAP32[86]; //@line 119
    break;
   }
   $73 = HEAPU8[320] | 0; //@line 123
   $74 = $2 & 255; //@line 124
   if ($74 & 31 & $73 | 0) {
    $78 = $73 & 64; //@line 129
    $$lobit = $78 >>> 6; //@line 130
    $79 = $$lobit & 255; //@line 131
    $83 = ($73 & 32 | 0) == 0; //@line 135
    $84 = HEAP32[85] | 0; //@line 136
    $85 = HEAP32[84] | 0; //@line 137
    $86 = $2 << 24 >> 24 == 1; //@line 138
    if ($86 | ($73 & 128 | 0) != 0) {
     $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 141
     _vsnprintf($85, $84, $8, $16) | 0; //@line 142
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
      $89 = _snprintf($85, $84, 1638, $18) | 0; //@line 169
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
        $$sink = 1656; //@line 187
        label = 25; //@line 188
        break;
       }
      case 1:
       {
        $$sink = 1662; //@line 192
        label = 25; //@line 193
        break;
       }
      case 3:
       {
        $$sink = 1650; //@line 197
        label = 25; //@line 198
        break;
       }
      case 7:
       {
        $$sink = 1644; //@line 202
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
       HEAP32[$26 >> 2] = $$sink; //@line 211
       $$0141 = $79 & 1; //@line 214
       $$1152 = _snprintf($$0142, $$0144, 1668, $26) | 0; //@line 214
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
      HEAP32[$34 >> 2] = HEAP32[$16 >> 2]; //@line 241
      $ReallocAsyncCtx11 = _emscripten_realloc_async_context(104) | 0; //@line 242
      $108 = _vsnprintf(0, 0, $8, $34) | 0; //@line 243
      if (___async) {
       HEAP32[$ReallocAsyncCtx11 >> 2] = 51; //@line 246
       $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 247
       HEAP32[$109 >> 2] = $22; //@line 248
       $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 249
       HEAP32[$110 >> 2] = $24; //@line 250
       $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 251
       $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 252
       HEAP8[$111 >> 0] = $$1$off0$expand_i1_val; //@line 253
       $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 254
       HEAP32[$112 >> 2] = $4; //@line 255
       $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 256
       HEAP32[$113 >> 2] = $6; //@line 257
       $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 258
       HEAP32[$114 >> 2] = $12; //@line 259
       $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 260
       HEAP32[$115 >> 2] = $$1143; //@line 261
       $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 262
       HEAP32[$116 >> 2] = $$1145; //@line 263
       $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 264
       HEAP32[$117 >> 2] = $14; //@line 265
       $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 266
       HEAP32[$118 >> 2] = $34; //@line 267
       $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 268
       HEAP32[$119 >> 2] = $30; //@line 269
       $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 270
       HEAP32[$120 >> 2] = $10; //@line 271
       $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 272
       HEAP32[$121 >> 2] = $32; //@line 273
       $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 274
       HEAP32[$122 >> 2] = $74; //@line 275
       $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 276
       HEAP32[$123 >> 2] = $36; //@line 277
       $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 278
       HEAP32[$124 >> 2] = $38; //@line 279
       $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 280
       HEAP32[$125 >> 2] = $40; //@line 281
       $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 282
       HEAP32[$126 >> 2] = $42; //@line 283
       $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 284
       HEAP32[$127 >> 2] = $44; //@line 285
       $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 286
       HEAP32[$128 >> 2] = $46; //@line 287
       $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 288
       HEAP32[$129 >> 2] = $48; //@line 289
       $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 290
       HEAP32[$130 >> 2] = $50; //@line 291
       $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 292
       HEAP32[$131 >> 2] = $8; //@line 293
       $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 294
       HEAP32[$132 >> 2] = $16; //@line 295
       $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 296
       HEAP32[$133 >> 2] = $$3154; //@line 297
       sp = STACKTOP; //@line 298
       return;
      }
      HEAP32[___async_retval >> 2] = $108; //@line 302
      ___async_unwind = 0; //@line 303
      HEAP32[$ReallocAsyncCtx11 >> 2] = 51; //@line 304
      $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 305
      HEAP32[$109 >> 2] = $22; //@line 306
      $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 307
      HEAP32[$110 >> 2] = $24; //@line 308
      $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 309
      $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 310
      HEAP8[$111 >> 0] = $$1$off0$expand_i1_val; //@line 311
      $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 312
      HEAP32[$112 >> 2] = $4; //@line 313
      $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 314
      HEAP32[$113 >> 2] = $6; //@line 315
      $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 316
      HEAP32[$114 >> 2] = $12; //@line 317
      $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 318
      HEAP32[$115 >> 2] = $$1143; //@line 319
      $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 320
      HEAP32[$116 >> 2] = $$1145; //@line 321
      $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 322
      HEAP32[$117 >> 2] = $14; //@line 323
      $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 324
      HEAP32[$118 >> 2] = $34; //@line 325
      $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 326
      HEAP32[$119 >> 2] = $30; //@line 327
      $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 328
      HEAP32[$120 >> 2] = $10; //@line 329
      $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 330
      HEAP32[$121 >> 2] = $32; //@line 331
      $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 332
      HEAP32[$122 >> 2] = $74; //@line 333
      $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 334
      HEAP32[$123 >> 2] = $36; //@line 335
      $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 336
      HEAP32[$124 >> 2] = $38; //@line 337
      $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 338
      HEAP32[$125 >> 2] = $40; //@line 339
      $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 340
      HEAP32[$126 >> 2] = $42; //@line 341
      $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 342
      HEAP32[$127 >> 2] = $44; //@line 343
      $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 344
      HEAP32[$128 >> 2] = $46; //@line 345
      $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 346
      HEAP32[$129 >> 2] = $48; //@line 347
      $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 348
      HEAP32[$130 >> 2] = $50; //@line 349
      $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 350
      HEAP32[$131 >> 2] = $8; //@line 351
      $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 352
      HEAP32[$132 >> 2] = $16; //@line 353
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
        $$5156 = _snprintf($$1143, $$1145, 1671, $30) | 0; //@line 369
        break;
       }
      case 1:
       {
        HEAP32[$48 >> 2] = $10; //@line 373
        $$5156 = _snprintf($$1143, $$1145, 1686, $48) | 0; //@line 375
        break;
       }
      case 3:
       {
        HEAP32[$44 >> 2] = $10; //@line 379
        $$5156 = _snprintf($$1143, $$1145, 1701, $44) | 0; //@line 381
        break;
       }
      case 7:
       {
        HEAP32[$40 >> 2] = $10; //@line 385
        $$5156 = _snprintf($$1143, $$1145, 1716, $40) | 0; //@line 387
        break;
       }
      default:
       {
        $$5156 = _snprintf($$1143, $$1145, 1731, $36) | 0; //@line 392
       }
      }
      $$5156$ = ($$5156 | 0) < ($$1145 | 0) ? $$5156 : 0; //@line 396
      $147 = $$1143 + $$5156$ | 0; //@line 398
      $148 = $$1145 - $$5156$ | 0; //@line 399
      if (($$5156$ | 0) > 0 & ($148 | 0) > 0) {
       $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 403
       $150 = _vsnprintf($147, $148, $8, $16) | 0; //@line 404
       if (___async) {
        HEAP32[$ReallocAsyncCtx10 >> 2] = 53; //@line 407
        $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 408
        HEAP32[$151 >> 2] = $22; //@line 409
        $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 410
        HEAP32[$152 >> 2] = $24; //@line 411
        $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 412
        $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 413
        HEAP8[$153 >> 0] = $$1$off0$expand_i1_val18; //@line 414
        $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 415
        HEAP32[$154 >> 2] = $4; //@line 416
        $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 417
        HEAP32[$155 >> 2] = $6; //@line 418
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
       HEAP32[$151 >> 2] = $22; //@line 431
       $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 432
       HEAP32[$152 >> 2] = $24; //@line 433
       $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 434
       $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 435
       HEAP8[$153 >> 0] = $$1$off0$expand_i1_val18; //@line 436
       $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 437
       HEAP32[$154 >> 2] = $4; //@line 438
       $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 439
       HEAP32[$155 >> 2] = $6; //@line 440
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
function _twoway_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0166 = 0, $$0168 = 0, $$0169 = 0, $$0169$be = 0, $$0170 = 0, $$0175$ph$ph$lcssa216 = 0, $$0175$ph$ph$lcssa216328 = 0, $$0175$ph$ph254 = 0, $$0179242 = 0, $$0183$ph197$ph253 = 0, $$0183$ph197248 = 0, $$0183$ph260 = 0, $$0185$ph$lcssa = 0, $$0185$ph$lcssa327 = 0, $$0185$ph259 = 0, $$0187219$ph325326 = 0, $$0187263 = 0, $$1176$$0175 = 0, $$1176$ph$ph$lcssa208 = 0, $$1176$ph$ph233 = 0, $$1180222 = 0, $$1184$ph193$ph232 = 0, $$1184$ph193227 = 0, $$1184$ph239 = 0, $$1186$$0185 = 0, $$1186$ph$lcssa = 0, $$1186$ph238 = 0, $$2181$sink = 0, $$3 = 0, $$3173 = 0, $$3178 = 0, $$3182221 = 0, $$4 = 0, $$pr = 0, $10 = 0, $105 = 0, $111 = 0, $113 = 0, $118 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $14 = 0, $2 = 0, $23 = 0, $25 = 0, $27 = 0, $3 = 0, $32 = 0, $34 = 0, $37 = 0, $4 = 0, $41 = 0, $45 = 0, $50 = 0, $52 = 0, $53 = 0, $56 = 0, $60 = 0, $68 = 0, $70 = 0, $74 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $83 = 0, $86 = 0, $93 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11096
 STACKTOP = STACKTOP + 1056 | 0; //@line 11097
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(1056); //@line 11097
 $2 = sp + 1024 | 0; //@line 11098
 $3 = sp; //@line 11099
 HEAP32[$2 >> 2] = 0; //@line 11100
 HEAP32[$2 + 4 >> 2] = 0; //@line 11100
 HEAP32[$2 + 8 >> 2] = 0; //@line 11100
 HEAP32[$2 + 12 >> 2] = 0; //@line 11100
 HEAP32[$2 + 16 >> 2] = 0; //@line 11100
 HEAP32[$2 + 20 >> 2] = 0; //@line 11100
 HEAP32[$2 + 24 >> 2] = 0; //@line 11100
 HEAP32[$2 + 28 >> 2] = 0; //@line 11100
 $4 = HEAP8[$1 >> 0] | 0; //@line 11101
 L1 : do {
  if (!($4 << 24 >> 24)) {
   $$0175$ph$ph$lcssa216328 = 1; //@line 11105
   $$0185$ph$lcssa327 = -1; //@line 11105
   $$0187219$ph325326 = 0; //@line 11105
   $$1176$ph$ph$lcssa208 = 1; //@line 11105
   $$1186$ph$lcssa = -1; //@line 11105
   label = 26; //@line 11106
  } else {
   $$0187263 = 0; //@line 11108
   $10 = $4; //@line 11108
   do {
    if (!(HEAP8[$0 + $$0187263 >> 0] | 0)) {
     $$3 = 0; //@line 11114
     break L1;
    }
    $14 = $2 + ((($10 & 255) >>> 5 & 255) << 2) | 0; //@line 11122
    HEAP32[$14 >> 2] = HEAP32[$14 >> 2] | 1 << ($10 & 31); //@line 11125
    $$0187263 = $$0187263 + 1 | 0; //@line 11126
    HEAP32[$3 + (($10 & 255) << 2) >> 2] = $$0187263; //@line 11129
    $10 = HEAP8[$1 + $$0187263 >> 0] | 0; //@line 11131
   } while ($10 << 24 >> 24 != 0);
   $23 = $$0187263 >>> 0 > 1; //@line 11139
   if ($23) {
    $$0183$ph260 = 0; //@line 11141
    $$0185$ph259 = -1; //@line 11141
    $130 = 1; //@line 11141
    L6 : while (1) {
     $$0175$ph$ph254 = 1; //@line 11143
     $$0183$ph197$ph253 = $$0183$ph260; //@line 11143
     $131 = $130; //@line 11143
     while (1) {
      $$0183$ph197248 = $$0183$ph197$ph253; //@line 11145
      $132 = $131; //@line 11145
      L10 : while (1) {
       $$0179242 = 1; //@line 11147
       $25 = $132; //@line 11147
       while (1) {
        $32 = HEAP8[$1 + ($$0179242 + $$0185$ph259) >> 0] | 0; //@line 11151
        $34 = HEAP8[$1 + $25 >> 0] | 0; //@line 11153
        if ($32 << 24 >> 24 != $34 << 24 >> 24) {
         break L10;
        }
        if (($$0179242 | 0) == ($$0175$ph$ph254 | 0)) {
         break;
        }
        $$0179242 = $$0179242 + 1 | 0; //@line 11159
        $27 = $$0179242 + $$0183$ph197248 | 0; //@line 11163
        if ($27 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 11168
         $$0185$ph$lcssa = $$0185$ph259; //@line 11168
         break L6;
        } else {
         $25 = $27; //@line 11166
        }
       }
       $37 = $$0175$ph$ph254 + $$0183$ph197248 | 0; //@line 11172
       $132 = $37 + 1 | 0; //@line 11173
       if ($132 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 11178
        $$0185$ph$lcssa = $$0185$ph259; //@line 11178
        break L6;
       } else {
        $$0183$ph197248 = $37; //@line 11176
       }
      }
      $41 = $25 - $$0185$ph259 | 0; //@line 11183
      if (($32 & 255) <= ($34 & 255)) {
       break;
      }
      $131 = $25 + 1 | 0; //@line 11187
      if ($131 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216 = $41; //@line 11192
       $$0185$ph$lcssa = $$0185$ph259; //@line 11192
       break L6;
      } else {
       $$0175$ph$ph254 = $41; //@line 11190
       $$0183$ph197$ph253 = $25; //@line 11190
      }
     }
     $130 = $$0183$ph197248 + 2 | 0; //@line 11197
     if ($130 >>> 0 >= $$0187263 >>> 0) {
      $$0175$ph$ph$lcssa216 = 1; //@line 11202
      $$0185$ph$lcssa = $$0183$ph197248; //@line 11202
      break;
     } else {
      $$0183$ph260 = $$0183$ph197248 + 1 | 0; //@line 11200
      $$0185$ph259 = $$0183$ph197248; //@line 11200
     }
    }
    if ($23) {
     $$1184$ph239 = 0; //@line 11207
     $$1186$ph238 = -1; //@line 11207
     $133 = 1; //@line 11207
     while (1) {
      $$1176$ph$ph233 = 1; //@line 11209
      $$1184$ph193$ph232 = $$1184$ph239; //@line 11209
      $135 = $133; //@line 11209
      while (1) {
       $$1184$ph193227 = $$1184$ph193$ph232; //@line 11211
       $134 = $135; //@line 11211
       L25 : while (1) {
        $$1180222 = 1; //@line 11213
        $52 = $134; //@line 11213
        while (1) {
         $50 = HEAP8[$1 + ($$1180222 + $$1186$ph238) >> 0] | 0; //@line 11217
         $53 = HEAP8[$1 + $52 >> 0] | 0; //@line 11219
         if ($50 << 24 >> 24 != $53 << 24 >> 24) {
          break L25;
         }
         if (($$1180222 | 0) == ($$1176$ph$ph233 | 0)) {
          break;
         }
         $$1180222 = $$1180222 + 1 | 0; //@line 11225
         $45 = $$1180222 + $$1184$ph193227 | 0; //@line 11229
         if ($45 >>> 0 >= $$0187263 >>> 0) {
          $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11234
          $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11234
          $$0187219$ph325326 = $$0187263; //@line 11234
          $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 11234
          $$1186$ph$lcssa = $$1186$ph238; //@line 11234
          label = 26; //@line 11235
          break L1;
         } else {
          $52 = $45; //@line 11232
         }
        }
        $56 = $$1176$ph$ph233 + $$1184$ph193227 | 0; //@line 11239
        $134 = $56 + 1 | 0; //@line 11240
        if ($134 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11245
         $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11245
         $$0187219$ph325326 = $$0187263; //@line 11245
         $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 11245
         $$1186$ph$lcssa = $$1186$ph238; //@line 11245
         label = 26; //@line 11246
         break L1;
        } else {
         $$1184$ph193227 = $56; //@line 11243
        }
       }
       $60 = $52 - $$1186$ph238 | 0; //@line 11251
       if (($50 & 255) >= ($53 & 255)) {
        break;
       }
       $135 = $52 + 1 | 0; //@line 11255
       if ($135 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11260
        $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11260
        $$0187219$ph325326 = $$0187263; //@line 11260
        $$1176$ph$ph$lcssa208 = $60; //@line 11260
        $$1186$ph$lcssa = $$1186$ph238; //@line 11260
        label = 26; //@line 11261
        break L1;
       } else {
        $$1176$ph$ph233 = $60; //@line 11258
        $$1184$ph193$ph232 = $52; //@line 11258
       }
      }
      $133 = $$1184$ph193227 + 2 | 0; //@line 11266
      if ($133 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11271
       $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11271
       $$0187219$ph325326 = $$0187263; //@line 11271
       $$1176$ph$ph$lcssa208 = 1; //@line 11271
       $$1186$ph$lcssa = $$1184$ph193227; //@line 11271
       label = 26; //@line 11272
       break;
      } else {
       $$1184$ph239 = $$1184$ph193227 + 1 | 0; //@line 11269
       $$1186$ph238 = $$1184$ph193227; //@line 11269
      }
     }
    } else {
     $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 11277
     $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 11277
     $$0187219$ph325326 = $$0187263; //@line 11277
     $$1176$ph$ph$lcssa208 = 1; //@line 11277
     $$1186$ph$lcssa = -1; //@line 11277
     label = 26; //@line 11278
    }
   } else {
    $$0175$ph$ph$lcssa216328 = 1; //@line 11281
    $$0185$ph$lcssa327 = -1; //@line 11281
    $$0187219$ph325326 = $$0187263; //@line 11281
    $$1176$ph$ph$lcssa208 = 1; //@line 11281
    $$1186$ph$lcssa = -1; //@line 11281
    label = 26; //@line 11282
   }
  }
 } while (0);
 L35 : do {
  if ((label | 0) == 26) {
   $68 = ($$1186$ph$lcssa + 1 | 0) >>> 0 > ($$0185$ph$lcssa327 + 1 | 0) >>> 0; //@line 11290
   $$1176$$0175 = $68 ? $$1176$ph$ph$lcssa208 : $$0175$ph$ph$lcssa216328; //@line 11291
   $$1186$$0185 = $68 ? $$1186$ph$lcssa : $$0185$ph$lcssa327; //@line 11292
   $70 = $$1186$$0185 + 1 | 0; //@line 11294
   if (!(_memcmp($1, $1 + $$1176$$0175 | 0, $70) | 0)) {
    $$0168 = $$0187219$ph325326 - $$1176$$0175 | 0; //@line 11299
    $$3178 = $$1176$$0175; //@line 11299
   } else {
    $74 = $$0187219$ph325326 - $$1186$$0185 + -1 | 0; //@line 11302
    $$0168 = 0; //@line 11306
    $$3178 = ($$1186$$0185 >>> 0 > $74 >>> 0 ? $$1186$$0185 : $74) + 1 | 0; //@line 11306
   }
   $78 = $$0187219$ph325326 | 63; //@line 11308
   $79 = $$0187219$ph325326 + -1 | 0; //@line 11309
   $80 = ($$0168 | 0) != 0; //@line 11310
   $81 = $$0187219$ph325326 - $$3178 | 0; //@line 11311
   $$0166 = $0; //@line 11312
   $$0169 = 0; //@line 11312
   $$0170 = $0; //@line 11312
   while (1) {
    $83 = $$0166; //@line 11315
    do {
     if (($$0170 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
      $86 = _memchr($$0170, 0, $78) | 0; //@line 11320
      if (!$86) {
       $$3173 = $$0170 + $78 | 0; //@line 11324
       break;
      } else {
       if (($86 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
        $$3 = 0; //@line 11331
        break L35;
       } else {
        $$3173 = $86; //@line 11334
        break;
       }
      }
     } else {
      $$3173 = $$0170; //@line 11339
     }
    } while (0);
    $93 = HEAP8[$$0166 + $79 >> 0] | 0; //@line 11343
    L49 : do {
     if (!(1 << ($93 & 31) & HEAP32[$2 + ((($93 & 255) >>> 5 & 255) << 2) >> 2])) {
      $$0169$be = 0; //@line 11355
      $$2181$sink = $$0187219$ph325326; //@line 11355
     } else {
      $105 = $$0187219$ph325326 - (HEAP32[$3 + (($93 & 255) << 2) >> 2] | 0) | 0; //@line 11360
      if ($105 | 0) {
       $$0169$be = 0; //@line 11368
       $$2181$sink = $80 & ($$0169 | 0) != 0 & $105 >>> 0 < $$3178 >>> 0 ? $81 : $105; //@line 11368
       break;
      }
      $111 = $70 >>> 0 > $$0169 >>> 0 ? $70 : $$0169; //@line 11372
      $113 = HEAP8[$1 + $111 >> 0] | 0; //@line 11374
      L54 : do {
       if (!($113 << 24 >> 24)) {
        $$4 = $70; //@line 11378
       } else {
        $$3182221 = $111; //@line 11380
        $$pr = $113; //@line 11380
        while (1) {
         if ($$pr << 24 >> 24 != (HEAP8[$$0166 + $$3182221 >> 0] | 0)) {
          break;
         }
         $118 = $$3182221 + 1 | 0; //@line 11388
         $$pr = HEAP8[$1 + $118 >> 0] | 0; //@line 11390
         if (!($$pr << 24 >> 24)) {
          $$4 = $70; //@line 11393
          break L54;
         } else {
          $$3182221 = $118; //@line 11396
         }
        }
        $$0169$be = 0; //@line 11400
        $$2181$sink = $$3182221 - $$1186$$0185 | 0; //@line 11400
        break L49;
       }
      } while (0);
      while (1) {
       if ($$4 >>> 0 <= $$0169 >>> 0) {
        $$3 = $$0166; //@line 11407
        break L35;
       }
       $$4 = $$4 + -1 | 0; //@line 11410
       if ((HEAP8[$1 + $$4 >> 0] | 0) != (HEAP8[$$0166 + $$4 >> 0] | 0)) {
        $$0169$be = $$0168; //@line 11419
        $$2181$sink = $$3178; //@line 11419
        break;
       }
      }
     }
    } while (0);
    $$0166 = $$0166 + $$2181$sink | 0; //@line 11426
    $$0169 = $$0169$be; //@line 11426
    $$0170 = $$3173; //@line 11426
   }
  }
 } while (0);
 STACKTOP = sp; //@line 11430
 return $$3 | 0; //@line 11430
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12900
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12906
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 12915
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 12920
      $19 = $1 + 44 | 0; //@line 12921
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 12930
      $26 = $1 + 52 | 0; //@line 12931
      $27 = $1 + 53 | 0; //@line 12932
      $28 = $1 + 54 | 0; //@line 12933
      $29 = $0 + 8 | 0; //@line 12934
      $30 = $1 + 24 | 0; //@line 12935
      $$081$off0 = 0; //@line 12936
      $$084 = $0 + 16 | 0; //@line 12936
      $$085$off0 = 0; //@line 12936
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 12940
        label = 20; //@line 12941
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 12944
       HEAP8[$27 >> 0] = 0; //@line 12945
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 12946
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 12947
       if (___async) {
        label = 12; //@line 12950
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 12953
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 12957
        label = 20; //@line 12958
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 12965
         $$186$off0 = $$085$off0; //@line 12965
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 12974
           label = 20; //@line 12975
           break L10;
          } else {
           $$182$off0 = 1; //@line 12978
           $$186$off0 = $$085$off0; //@line 12978
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 12985
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 12992
          break L10;
         } else {
          $$182$off0 = 1; //@line 12995
          $$186$off0 = 1; //@line 12995
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 13000
       $$084 = $$084 + 8 | 0; //@line 13000
       $$085$off0 = $$186$off0; //@line 13000
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 157; //@line 13003
       HEAP32[$AsyncCtx15 + 4 >> 2] = $19; //@line 13005
       HEAP8[$AsyncCtx15 + 8 >> 0] = $$081$off0 & 1; //@line 13008
       HEAP8[$AsyncCtx15 + 9 >> 0] = $$085$off0 & 1; //@line 13011
       HEAP32[$AsyncCtx15 + 12 >> 2] = $$084; //@line 13013
       HEAP32[$AsyncCtx15 + 16 >> 2] = $29; //@line 13015
       HEAP32[$AsyncCtx15 + 20 >> 2] = $28; //@line 13017
       HEAP32[$AsyncCtx15 + 24 >> 2] = $30; //@line 13019
       HEAP32[$AsyncCtx15 + 28 >> 2] = $2; //@line 13021
       HEAP32[$AsyncCtx15 + 32 >> 2] = $13; //@line 13023
       HEAP32[$AsyncCtx15 + 36 >> 2] = $1; //@line 13025
       HEAP32[$AsyncCtx15 + 40 >> 2] = $25; //@line 13027
       HEAP32[$AsyncCtx15 + 44 >> 2] = $26; //@line 13029
       HEAP32[$AsyncCtx15 + 48 >> 2] = $27; //@line 13031
       HEAP8[$AsyncCtx15 + 52 >> 0] = $4 & 1; //@line 13034
       sp = STACKTOP; //@line 13035
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 13041
         $61 = $1 + 40 | 0; //@line 13042
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 13045
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 13053
           if ($$283$off0) {
            label = 25; //@line 13055
            break;
           } else {
            $69 = 4; //@line 13058
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 13065
        } else {
         $69 = 4; //@line 13067
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 13072
      }
      HEAP32[$19 >> 2] = $69; //@line 13074
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 13083
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 13088
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 13089
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 13090
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 13091
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 158; //@line 13094
    HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 13096
    HEAP32[$AsyncCtx11 + 8 >> 2] = $72; //@line 13098
    HEAP32[$AsyncCtx11 + 12 >> 2] = $1; //@line 13100
    HEAP32[$AsyncCtx11 + 16 >> 2] = $2; //@line 13102
    HEAP32[$AsyncCtx11 + 20 >> 2] = $3; //@line 13104
    HEAP8[$AsyncCtx11 + 24 >> 0] = $4 & 1; //@line 13107
    HEAP32[$AsyncCtx11 + 28 >> 2] = $73; //@line 13109
    sp = STACKTOP; //@line 13110
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 13113
   $81 = $0 + 24 | 0; //@line 13114
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 13118
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 13122
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 13129
       $$2 = $81; //@line 13130
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 13142
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 13143
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 13148
        $136 = $$2 + 8 | 0; //@line 13149
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 13152
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 161; //@line 13157
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 13159
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 13161
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 13163
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 13165
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 13167
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 13169
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 13171
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 13174
       sp = STACKTOP; //@line 13175
       return;
      }
      $104 = $1 + 24 | 0; //@line 13178
      $105 = $1 + 54 | 0; //@line 13179
      $$1 = $81; //@line 13180
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 13196
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 13197
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13202
       $122 = $$1 + 8 | 0; //@line 13203
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 13206
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 160; //@line 13211
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 13213
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 13215
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 13217
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 13219
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 13221
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 13223
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 13225
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 13227
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 13230
      sp = STACKTOP; //@line 13231
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 13235
    $$0 = $81; //@line 13236
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 13243
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 13244
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 13249
     $100 = $$0 + 8 | 0; //@line 13250
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 13253
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 159; //@line 13258
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 13260
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 13262
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 13264
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 13266
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 13268
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 13270
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 13273
    sp = STACKTOP; //@line 13274
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
 $n_sroa_0_0_extract_trunc = $a$0; //@line 5757
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 5758
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 5759
 $d_sroa_0_0_extract_trunc = $b$0; //@line 5760
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 5761
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 5762
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 5764
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 5767
    HEAP32[$rem + 4 >> 2] = 0; //@line 5768
   }
   $_0$1 = 0; //@line 5770
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 5771
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5772
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 5775
    $_0$0 = 0; //@line 5776
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5777
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 5779
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 5780
   $_0$1 = 0; //@line 5781
   $_0$0 = 0; //@line 5782
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5783
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 5786
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 5791
     HEAP32[$rem + 4 >> 2] = 0; //@line 5792
    }
    $_0$1 = 0; //@line 5794
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 5795
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5796
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 5800
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 5801
    }
    $_0$1 = 0; //@line 5803
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 5804
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5805
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 5807
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 5810
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 5811
    }
    $_0$1 = 0; //@line 5813
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 5814
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5815
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 5818
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 5820
    $58 = 31 - $51 | 0; //@line 5821
    $sr_1_ph = $57; //@line 5822
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 5823
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 5824
    $q_sroa_0_1_ph = 0; //@line 5825
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 5826
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 5830
    $_0$0 = 0; //@line 5831
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5832
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 5834
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 5835
   $_0$1 = 0; //@line 5836
   $_0$0 = 0; //@line 5837
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5838
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 5842
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 5844
     $126 = 31 - $119 | 0; //@line 5845
     $130 = $119 - 31 >> 31; //@line 5846
     $sr_1_ph = $125; //@line 5847
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 5848
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 5849
     $q_sroa_0_1_ph = 0; //@line 5850
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 5851
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 5855
     $_0$0 = 0; //@line 5856
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5857
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 5859
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 5860
    $_0$1 = 0; //@line 5861
    $_0$0 = 0; //@line 5862
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5863
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 5865
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 5868
    $89 = 64 - $88 | 0; //@line 5869
    $91 = 32 - $88 | 0; //@line 5870
    $92 = $91 >> 31; //@line 5871
    $95 = $88 - 32 | 0; //@line 5872
    $105 = $95 >> 31; //@line 5873
    $sr_1_ph = $88; //@line 5874
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 5875
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 5876
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 5877
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 5878
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 5882
    HEAP32[$rem + 4 >> 2] = 0; //@line 5883
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 5886
    $_0$0 = $a$0 | 0 | 0; //@line 5887
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5888
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 5890
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 5891
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 5892
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5893
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 5898
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 5899
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 5900
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 5901
  $carry_0_lcssa$1 = 0; //@line 5902
  $carry_0_lcssa$0 = 0; //@line 5903
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 5905
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 5906
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 5907
  $137$1 = tempRet0; //@line 5908
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 5909
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 5910
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 5911
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 5912
  $sr_1202 = $sr_1_ph; //@line 5913
  $carry_0203 = 0; //@line 5914
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 5916
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 5917
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 5918
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 5919
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 5920
   $150$1 = tempRet0; //@line 5921
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 5922
   $carry_0203 = $151$0 & 1; //@line 5923
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 5925
   $r_sroa_1_1200 = tempRet0; //@line 5926
   $sr_1202 = $sr_1202 - 1 | 0; //@line 5927
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 5939
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 5940
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 5941
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 5942
  $carry_0_lcssa$1 = 0; //@line 5943
  $carry_0_lcssa$0 = $carry_0203; //@line 5944
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 5946
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 5947
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 5950
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 5951
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 5953
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 5954
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 5955
}
function _initialize($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$037 = 0, $1 = 0, $101 = 0, $102 = 0, $103 = 0, $105 = 0, $106 = 0, $109 = 0, $115 = 0, $116 = 0, $117 = 0, $126 = 0, $127 = 0, $128 = 0, $13 = 0, $130 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $14 = 0, $140 = 0, $142 = 0, $148 = 0, $149 = 0, $150 = 0, $159 = 0, $160 = 0, $161 = 0, $163 = 0, $167 = 0, $173 = 0, $174 = 0, $175 = 0, $177 = 0, $18 = 0, $25 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $37 = 0, $39 = 0, $40 = 0, $41 = 0, $45 = 0, $46 = 0, $52 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $70 = 0, $73 = 0, $77 = 0, $78 = 0, $85 = 0, $86 = 0, $AsyncCtx = 0, $AsyncCtx12 = 0, $AsyncCtx16 = 0, $AsyncCtx2 = 0, $AsyncCtx20 = 0, $AsyncCtx6 = 0, $AsyncCtx9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1532
 $1 = $0 + 4 | 0; //@line 1533
 if (HEAP8[(HEAP32[$1 >> 2] | 0) + 56 >> 0] | 0) {
  return;
 }
 $7 = HEAP32[HEAP32[$0 >> 2] >> 2] | 0; //@line 1542
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1543
 FUNCTION_TABLE_v[$7 & 15](); //@line 1544
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 60; //@line 1547
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1549
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 1551
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 1553
  sp = STACKTOP; //@line 1554
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1557
 $13 = HEAP32[(HEAP32[$0 >> 2] | 0) + 24 >> 2] | 0; //@line 1560
 $AsyncCtx2 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1561
 $14 = FUNCTION_TABLE_i[$13 & 3]() | 0; //@line 1562
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 61; //@line 1565
  HEAP32[$AsyncCtx2 + 4 >> 2] = $1; //@line 1567
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1569
  HEAP32[$AsyncCtx2 + 12 >> 2] = $0; //@line 1571
  sp = STACKTOP; //@line 1572
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1575
 $18 = HEAP32[$14 >> 2] | 0; //@line 1576
 do {
  if (!$18) {
   $AsyncCtx20 = _emscripten_alloc_async_context(20, sp) | 0; //@line 1580
   _mbed_assert_internal(1751, 1753, 41); //@line 1581
   if (___async) {
    HEAP32[$AsyncCtx20 >> 2] = 62; //@line 1584
    HEAP32[$AsyncCtx20 + 4 >> 2] = $1; //@line 1586
    HEAP32[$AsyncCtx20 + 8 >> 2] = $0; //@line 1588
    HEAP32[$AsyncCtx20 + 12 >> 2] = $0; //@line 1590
    HEAP32[$AsyncCtx20 + 16 >> 2] = $14; //@line 1592
    sp = STACKTOP; //@line 1593
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx20 | 0); //@line 1596
    $$0 = 1e6; //@line 1597
    break;
   }
  } else {
   $$0 = $18; //@line 1601
  }
 } while (0);
 $25 = HEAP32[$14 + 4 >> 2] | 0; //@line 1605
 do {
  if (($25 + -4 | 0) >>> 0 > 28) {
   $AsyncCtx16 = _emscripten_alloc_async_context(20, sp) | 0; //@line 1610
   _mbed_assert_internal(1751, 1753, 47); //@line 1611
   if (___async) {
    HEAP32[$AsyncCtx16 >> 2] = 63; //@line 1614
    HEAP32[$AsyncCtx16 + 4 >> 2] = $$0; //@line 1616
    HEAP32[$AsyncCtx16 + 8 >> 2] = $1; //@line 1618
    HEAP32[$AsyncCtx16 + 12 >> 2] = $0; //@line 1620
    HEAP32[$AsyncCtx16 + 16 >> 2] = $0; //@line 1622
    sp = STACKTOP; //@line 1623
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx16 | 0); //@line 1626
    $$037 = 32; //@line 1627
    break;
   }
  } else {
   $$037 = $25; //@line 1631
  }
 } while (0);
 $32 = 7 << $$037 + -4; //@line 1635
 $33 = ___muldi3($32 | 0, 0, 1e6, 0) | 0; //@line 1636
 $34 = tempRet0; //@line 1637
 $35 = _i64Add($$0 | 0, 0, -1, -1) | 0; //@line 1638
 $37 = _i64Add($35 | 0, tempRet0 | 0, $33 | 0, $34 | 0) | 0; //@line 1640
 $39 = ___udivdi3($37 | 0, tempRet0 | 0, $$0 | 0, 0) | 0; //@line 1642
 $40 = tempRet0; //@line 1643
 $41 = HEAP32[$1 >> 2] | 0; //@line 1644
 HEAP32[$41 >> 2] = 0; //@line 1645
 HEAP32[$41 + 4 >> 2] = 0; //@line 1647
 $45 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 1650
 $AsyncCtx6 = _emscripten_alloc_async_context(40, sp) | 0; //@line 1651
 $46 = FUNCTION_TABLE_i[$45 & 3]() | 0; //@line 1652
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 64; //@line 1655
  HEAP32[$AsyncCtx6 + 4 >> 2] = $1; //@line 1657
  HEAP32[$AsyncCtx6 + 8 >> 2] = $$0; //@line 1659
  HEAP32[$AsyncCtx6 + 12 >> 2] = $$037; //@line 1661
  HEAP32[$AsyncCtx6 + 16 >> 2] = $32; //@line 1663
  $52 = $AsyncCtx6 + 24 | 0; //@line 1665
  HEAP32[$52 >> 2] = $39; //@line 1667
  HEAP32[$52 + 4 >> 2] = $40; //@line 1670
  HEAP32[$AsyncCtx6 + 32 >> 2] = $0; //@line 1672
  HEAP32[$AsyncCtx6 + 36 >> 2] = $0; //@line 1674
  sp = STACKTOP; //@line 1675
  return;
 }
 _emscripten_free_async_context($AsyncCtx6 | 0); //@line 1678
 $58 = HEAP32[$1 >> 2] | 0; //@line 1679
 $59 = $58 + 32 | 0; //@line 1680
 HEAP32[$59 >> 2] = $46; //@line 1681
 $60 = $58 + 40 | 0; //@line 1682
 $61 = $60; //@line 1683
 HEAP32[$61 >> 2] = 0; //@line 1685
 HEAP32[$61 + 4 >> 2] = 0; //@line 1688
 $65 = $58 + 8 | 0; //@line 1689
 HEAP32[$65 >> 2] = $$0; //@line 1690
 $66 = _bitshift64Shl(1, 0, $$037 | 0) | 0; //@line 1691
 $68 = _i64Add($66 | 0, tempRet0 | 0, -1, 0) | 0; //@line 1693
 $70 = $58 + 12 | 0; //@line 1695
 HEAP32[$70 >> 2] = $68; //@line 1696
 HEAP32[$58 + 16 >> 2] = $32; //@line 1698
 $73 = $58 + 24 | 0; //@line 1700
 HEAP32[$73 >> 2] = $39; //@line 1702
 HEAP32[$73 + 4 >> 2] = $40; //@line 1705
 $77 = $58 + 48 | 0; //@line 1706
 $78 = $77; //@line 1707
 HEAP32[$78 >> 2] = 0; //@line 1709
 HEAP32[$78 + 4 >> 2] = 0; //@line 1712
 HEAP8[$58 + 56 >> 0] = 1; //@line 1714
 $85 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 1717
 $AsyncCtx9 = _emscripten_alloc_async_context(32, sp) | 0; //@line 1718
 $86 = FUNCTION_TABLE_i[$85 & 3]() | 0; //@line 1719
 if (___async) {
  HEAP32[$AsyncCtx9 >> 2] = 65; //@line 1722
  HEAP32[$AsyncCtx9 + 4 >> 2] = $1; //@line 1724
  HEAP32[$AsyncCtx9 + 8 >> 2] = $0; //@line 1726
  HEAP32[$AsyncCtx9 + 12 >> 2] = $59; //@line 1728
  HEAP32[$AsyncCtx9 + 16 >> 2] = $70; //@line 1730
  HEAP32[$AsyncCtx9 + 20 >> 2] = $65; //@line 1732
  HEAP32[$AsyncCtx9 + 24 >> 2] = $60; //@line 1734
  HEAP32[$AsyncCtx9 + 28 >> 2] = $77; //@line 1736
  sp = STACKTOP; //@line 1737
  return;
 }
 _emscripten_free_async_context($AsyncCtx9 | 0); //@line 1740
 if (($86 | 0) != (HEAP32[(HEAP32[$1 >> 2] | 0) + 32 >> 2] | 0)) {
  $101 = $86 - (HEAP32[$59 >> 2] | 0) & HEAP32[$70 >> 2]; //@line 1749
  HEAP32[$59 >> 2] = $86; //@line 1750
  $102 = HEAP32[$65 >> 2] | 0; //@line 1751
  L30 : do {
   if (($102 | 0) < 1e6) {
    switch ($102 | 0) {
    case 32768:
     {
      break;
     }
    default:
     {
      label = 22; //@line 1760
      break L30;
     }
    }
    $103 = ___muldi3($101 | 0, 0, 1e6, 0) | 0; //@line 1764
    $105 = _bitshift64Lshr($103 | 0, tempRet0 | 0, 15) | 0; //@line 1766
    $106 = tempRet0; //@line 1767
    $109 = $60; //@line 1770
    $115 = _i64Add(HEAP32[$109 >> 2] | 0, HEAP32[$109 + 4 >> 2] | 0, $101 * 1e6 & 32704 | 0, 0) | 0; //@line 1776
    $116 = tempRet0; //@line 1777
    $117 = $60; //@line 1778
    HEAP32[$117 >> 2] = $115; //@line 1780
    HEAP32[$117 + 4 >> 2] = $116; //@line 1783
    if ($116 >>> 0 < 0 | ($116 | 0) == 0 & $115 >>> 0 < 32768) {
     $173 = $105; //@line 1790
     $174 = $106; //@line 1790
    } else {
     $126 = _i64Add($105 | 0, $106 | 0, 1, 0) | 0; //@line 1792
     $127 = tempRet0; //@line 1793
     $128 = _i64Add($115 | 0, $116 | 0, -32768, -1) | 0; //@line 1794
     $130 = $60; //@line 1796
     HEAP32[$130 >> 2] = $128; //@line 1798
     HEAP32[$130 + 4 >> 2] = tempRet0; //@line 1801
     $173 = $126; //@line 1802
     $174 = $127; //@line 1802
    }
   } else {
    switch ($102 | 0) {
    case 1e6:
     {
      $173 = $101; //@line 1807
      $174 = 0; //@line 1807
      break;
     }
    default:
     {
      label = 22; //@line 1811
     }
    }
   }
  } while (0);
  if ((label | 0) == 22) {
   $134 = ___muldi3($101 | 0, 0, 1e6, 0) | 0; //@line 1817
   $135 = tempRet0; //@line 1818
   $136 = ___udivdi3($134 | 0, $135 | 0, $102 | 0, 0) | 0; //@line 1819
   $137 = tempRet0; //@line 1820
   $138 = ___muldi3($136 | 0, $137 | 0, $102 | 0, 0) | 0; //@line 1821
   $140 = _i64Subtract($134 | 0, $135 | 0, $138 | 0, tempRet0 | 0) | 0; //@line 1823
   $142 = $60; //@line 1825
   $148 = _i64Add($140 | 0, tempRet0 | 0, HEAP32[$142 >> 2] | 0, HEAP32[$142 + 4 >> 2] | 0) | 0; //@line 1831
   $149 = tempRet0; //@line 1832
   $150 = $60; //@line 1833
   HEAP32[$150 >> 2] = $148; //@line 1835
   HEAP32[$150 + 4 >> 2] = $149; //@line 1838
   if ($149 >>> 0 < 0 | ($149 | 0) == 0 & $148 >>> 0 < $102 >>> 0) {
    $173 = $136; //@line 1845
    $174 = $137; //@line 1845
   } else {
    $159 = _i64Add($136 | 0, $137 | 0, 1, 0) | 0; //@line 1847
    $160 = tempRet0; //@line 1848
    $161 = _i64Subtract($148 | 0, $149 | 0, $102 | 0, 0) | 0; //@line 1849
    $163 = $60; //@line 1851
    HEAP32[$163 >> 2] = $161; //@line 1853
    HEAP32[$163 + 4 >> 2] = tempRet0; //@line 1856
    $173 = $159; //@line 1857
    $174 = $160; //@line 1857
   }
  }
  $167 = $77; //@line 1860
  $175 = _i64Add(HEAP32[$167 >> 2] | 0, HEAP32[$167 + 4 >> 2] | 0, $173 | 0, $174 | 0) | 0; //@line 1866
  $177 = $77; //@line 1868
  HEAP32[$177 >> 2] = $175; //@line 1870
  HEAP32[$177 + 4 >> 2] = tempRet0; //@line 1873
 }
 $AsyncCtx12 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1875
 _schedule_interrupt($0); //@line 1876
 if (___async) {
  HEAP32[$AsyncCtx12 >> 2] = 66; //@line 1879
  sp = STACKTOP; //@line 1880
  return;
 }
 _emscripten_free_async_context($AsyncCtx12 | 0); //@line 1883
 return;
}
function _schedule_interrupt($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $1 = 0, $10 = 0, $104 = 0, $107 = 0, $109 = 0, $11 = 0, $112 = 0, $113 = 0, $115 = 0, $118 = 0, $126 = 0, $127 = 0, $128 = 0, $130 = 0, $132 = 0, $137 = 0, $14 = 0, $144 = 0, $146 = 0, $148 = 0, $151 = 0, $153 = 0, $160 = 0, $161 = 0, $164 = 0, $166 = 0, $168 = 0, $174 = 0, $175 = 0, $179 = 0, $187 = 0, $19 = 0, $195 = 0, $198 = 0, $2 = 0, $21 = 0, $22 = 0, $24 = 0, $25 = 0, $28 = 0, $29 = 0, $35 = 0, $36 = 0, $37 = 0, $46 = 0, $47 = 0, $48 = 0, $5 = 0, $50 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $6 = 0, $60 = 0, $62 = 0, $63 = 0, $69 = 0, $70 = 0, $71 = 0, $80 = 0, $81 = 0, $82 = 0, $84 = 0, $88 = 0, $89 = 0, $95 = 0, $96 = 0, $97 = 0, $99 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx14 = 0, $AsyncCtx18 = 0, $AsyncCtx22 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1900
 $1 = $0 + 4 | 0; //@line 1901
 $2 = HEAP32[$1 >> 2] | 0; //@line 1902
 $5 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 1905
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1906
 $6 = FUNCTION_TABLE_i[$5 & 3]() | 0; //@line 1907
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 67; //@line 1910
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1912
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 1914
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 1916
  sp = STACKTOP; //@line 1917
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1920
 $10 = HEAP32[$1 >> 2] | 0; //@line 1921
 $11 = $10 + 32 | 0; //@line 1922
 if (($6 | 0) != (HEAP32[$11 >> 2] | 0)) {
  $14 = $2 + 32 | 0; //@line 1926
  $19 = $6 - (HEAP32[$14 >> 2] | 0) & HEAP32[$2 + 12 >> 2]; //@line 1931
  HEAP32[$14 >> 2] = $6; //@line 1932
  $21 = HEAP32[$2 + 8 >> 2] | 0; //@line 1934
  L6 : do {
   if (($21 | 0) < 1e6) {
    switch ($21 | 0) {
    case 32768:
     {
      break;
     }
    default:
     {
      label = 7; //@line 1943
      break L6;
     }
    }
    $22 = ___muldi3($19 | 0, 0, 1e6, 0) | 0; //@line 1947
    $24 = _bitshift64Lshr($22 | 0, tempRet0 | 0, 15) | 0; //@line 1949
    $25 = tempRet0; //@line 1950
    $28 = $2 + 40 | 0; //@line 1953
    $29 = $28; //@line 1954
    $35 = _i64Add(HEAP32[$29 >> 2] | 0, HEAP32[$29 + 4 >> 2] | 0, $19 * 1e6 & 32704 | 0, 0) | 0; //@line 1960
    $36 = tempRet0; //@line 1961
    $37 = $28; //@line 1962
    HEAP32[$37 >> 2] = $35; //@line 1964
    HEAP32[$37 + 4 >> 2] = $36; //@line 1967
    if ($36 >>> 0 < 0 | ($36 | 0) == 0 & $35 >>> 0 < 32768) {
     $95 = $24; //@line 1974
     $96 = $25; //@line 1974
    } else {
     $46 = _i64Add($24 | 0, $25 | 0, 1, 0) | 0; //@line 1976
     $47 = tempRet0; //@line 1977
     $48 = _i64Add($35 | 0, $36 | 0, -32768, -1) | 0; //@line 1978
     $50 = $28; //@line 1980
     HEAP32[$50 >> 2] = $48; //@line 1982
     HEAP32[$50 + 4 >> 2] = tempRet0; //@line 1985
     $95 = $46; //@line 1986
     $96 = $47; //@line 1986
    }
   } else {
    switch ($21 | 0) {
    case 1e6:
     {
      $95 = $19; //@line 1991
      $96 = 0; //@line 1991
      break;
     }
    default:
     {
      label = 7; //@line 1995
     }
    }
   }
  } while (0);
  if ((label | 0) == 7) {
   $54 = ___muldi3($19 | 0, 0, 1e6, 0) | 0; //@line 2001
   $55 = tempRet0; //@line 2002
   $56 = ___udivdi3($54 | 0, $55 | 0, $21 | 0, 0) | 0; //@line 2003
   $57 = tempRet0; //@line 2004
   $58 = ___muldi3($56 | 0, $57 | 0, $21 | 0, 0) | 0; //@line 2005
   $60 = _i64Subtract($54 | 0, $55 | 0, $58 | 0, tempRet0 | 0) | 0; //@line 2007
   $62 = $2 + 40 | 0; //@line 2009
   $63 = $62; //@line 2010
   $69 = _i64Add($60 | 0, tempRet0 | 0, HEAP32[$63 >> 2] | 0, HEAP32[$63 + 4 >> 2] | 0) | 0; //@line 2016
   $70 = tempRet0; //@line 2017
   $71 = $62; //@line 2018
   HEAP32[$71 >> 2] = $69; //@line 2020
   HEAP32[$71 + 4 >> 2] = $70; //@line 2023
   if ($70 >>> 0 < 0 | ($70 | 0) == 0 & $69 >>> 0 < $21 >>> 0) {
    $95 = $56; //@line 2030
    $96 = $57; //@line 2030
   } else {
    $80 = _i64Add($56 | 0, $57 | 0, 1, 0) | 0; //@line 2032
    $81 = tempRet0; //@line 2033
    $82 = _i64Subtract($69 | 0, $70 | 0, $21 | 0, 0) | 0; //@line 2034
    $84 = $62; //@line 2036
    HEAP32[$84 >> 2] = $82; //@line 2038
    HEAP32[$84 + 4 >> 2] = tempRet0; //@line 2041
    $95 = $80; //@line 2042
    $96 = $81; //@line 2042
   }
  }
  $88 = $2 + 48 | 0; //@line 2045
  $89 = $88; //@line 2046
  $97 = _i64Add(HEAP32[$89 >> 2] | 0, HEAP32[$89 + 4 >> 2] | 0, $95 | 0, $96 | 0) | 0; //@line 2052
  $99 = $88; //@line 2054
  HEAP32[$99 >> 2] = $97; //@line 2056
  HEAP32[$99 + 4 >> 2] = tempRet0; //@line 2059
 }
 $104 = HEAP32[$10 + 4 >> 2] | 0; //@line 2062
 if (!$104) {
  $195 = (HEAP32[$2 + 16 >> 2] | 0) + (HEAP32[$2 + 32 >> 2] | 0) & HEAP32[$2 + 12 >> 2]; //@line 2072
  $198 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 2075
  $AsyncCtx22 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2076
  FUNCTION_TABLE_vi[$198 & 255]($195); //@line 2077
  if (___async) {
   HEAP32[$AsyncCtx22 >> 2] = 73; //@line 2080
   sp = STACKTOP; //@line 2081
   return;
  } else {
   _emscripten_free_async_context($AsyncCtx22 | 0); //@line 2084
   return;
  }
 }
 $107 = $10 + 48 | 0; //@line 2089
 $109 = HEAP32[$107 >> 2] | 0; //@line 2091
 $112 = HEAP32[$107 + 4 >> 2] | 0; //@line 2094
 $113 = $104; //@line 2095
 $115 = HEAP32[$113 >> 2] | 0; //@line 2097
 $118 = HEAP32[$113 + 4 >> 2] | 0; //@line 2100
 if (!($118 >>> 0 > $112 >>> 0 | ($118 | 0) == ($112 | 0) & $115 >>> 0 > $109 >>> 0)) {
  $126 = HEAP32[(HEAP32[$0 >> 2] | 0) + 20 >> 2] | 0; //@line 2109
  $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2110
  FUNCTION_TABLE_v[$126 & 15](); //@line 2111
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 68; //@line 2114
   sp = STACKTOP; //@line 2115
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2118
  return;
 }
 $127 = _i64Subtract($115 | 0, $118 | 0, $109 | 0, $112 | 0) | 0; //@line 2121
 $128 = tempRet0; //@line 2122
 $130 = HEAP32[$10 + 16 >> 2] | 0; //@line 2124
 $132 = $10 + 24 | 0; //@line 2126
 $137 = HEAP32[$132 + 4 >> 2] | 0; //@line 2131
 L29 : do {
  if ($128 >>> 0 > $137 >>> 0 | (($128 | 0) == ($137 | 0) ? $127 >>> 0 > (HEAP32[$132 >> 2] | 0) >>> 0 : 0)) {
   $$0$i = $130; //@line 2139
  } else {
   $144 = HEAP32[$10 + 8 >> 2] | 0; //@line 2142
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
     $146 = _bitshift64Shl($127 | 0, $128 | 0, 15) | 0; //@line 2154
     $148 = ___udivdi3($146 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 2156
     $$0$i = $130 >>> 0 < $148 >>> 0 ? $130 : $148; //@line 2160
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
     $$0$i = $130 >>> 0 < $127 >>> 0 ? $130 : $127; //@line 2173
     break L29;
    }
   } while (0);
   $151 = ___muldi3($127 | 0, $128 | 0, $144 | 0, 0) | 0; //@line 2177
   $153 = ___udivdi3($151 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 2179
   $$0$i = $130 >>> 0 < $153 >>> 0 ? $130 : $153; //@line 2183
  }
 } while (0);
 $160 = (HEAP32[$11 >> 2] | 0) + $$0$i & HEAP32[$10 + 12 >> 2]; //@line 2190
 $161 = $2 + 32 | 0; //@line 2191
 $164 = HEAP32[$0 >> 2] | 0; //@line 2194
 if (($160 | 0) == (HEAP32[$161 >> 2] | 0)) {
  $166 = HEAP32[$164 + 20 >> 2] | 0; //@line 2197
  $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2198
  FUNCTION_TABLE_v[$166 & 15](); //@line 2199
  if (___async) {
   HEAP32[$AsyncCtx7 >> 2] = 69; //@line 2202
   sp = STACKTOP; //@line 2203
   return;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2206
  return;
 }
 $168 = HEAP32[$164 + 16 >> 2] | 0; //@line 2210
 $AsyncCtx11 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2211
 FUNCTION_TABLE_vi[$168 & 255]($160); //@line 2212
 if (___async) {
  HEAP32[$AsyncCtx11 >> 2] = 70; //@line 2215
  HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 2217
  HEAP32[$AsyncCtx11 + 8 >> 2] = $161; //@line 2219
  HEAP32[$AsyncCtx11 + 12 >> 2] = $160; //@line 2221
  sp = STACKTOP; //@line 2222
  return;
 }
 _emscripten_free_async_context($AsyncCtx11 | 0); //@line 2225
 $174 = HEAP32[(HEAP32[$0 >> 2] | 0) + 4 >> 2] | 0; //@line 2228
 $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2229
 $175 = FUNCTION_TABLE_i[$174 & 3]() | 0; //@line 2230
 if (___async) {
  HEAP32[$AsyncCtx14 >> 2] = 71; //@line 2233
  HEAP32[$AsyncCtx14 + 4 >> 2] = $161; //@line 2235
  HEAP32[$AsyncCtx14 + 8 >> 2] = $160; //@line 2237
  HEAP32[$AsyncCtx14 + 12 >> 2] = $0; //@line 2239
  sp = STACKTOP; //@line 2240
  return;
 }
 _emscripten_free_async_context($AsyncCtx14 | 0); //@line 2243
 $179 = HEAP32[$161 >> 2] | 0; //@line 2244
 if ($160 >>> 0 > $179 >>> 0) {
  if (!($175 >>> 0 >= $160 >>> 0 | $175 >>> 0 < $179 >>> 0)) {
   return;
  }
 } else {
  if (!($175 >>> 0 >= $160 >>> 0 & $175 >>> 0 < $179 >>> 0)) {
   return;
  }
 }
 $187 = HEAP32[(HEAP32[$0 >> 2] | 0) + 20 >> 2] | 0; //@line 2263
 $AsyncCtx18 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2264
 FUNCTION_TABLE_v[$187 & 15](); //@line 2265
 if (___async) {
  HEAP32[$AsyncCtx18 >> 2] = 72; //@line 2268
  sp = STACKTOP; //@line 2269
  return;
 }
 _emscripten_free_async_context($AsyncCtx18 | 0); //@line 2272
 return;
}
function _schedule_interrupt__async_cb($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $102 = 0, $105 = 0, $107 = 0, $110 = 0, $111 = 0, $113 = 0, $116 = 0, $12 = 0, $124 = 0, $125 = 0, $126 = 0, $128 = 0, $130 = 0, $135 = 0, $142 = 0, $144 = 0, $146 = 0, $149 = 0, $151 = 0, $158 = 0, $159 = 0, $162 = 0, $164 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $177 = 0, $180 = 0, $19 = 0, $2 = 0, $20 = 0, $22 = 0, $23 = 0, $26 = 0, $27 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $44 = 0, $45 = 0, $46 = 0, $48 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $58 = 0, $60 = 0, $61 = 0, $67 = 0, $68 = 0, $69 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $82 = 0, $86 = 0, $87 = 0, $9 = 0, $93 = 0, $94 = 0, $95 = 0, $97 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3734
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3736
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3738
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3742
 $8 = HEAP32[HEAP32[$0 + 12 >> 2] >> 2] | 0; //@line 3743
 $9 = $8 + 32 | 0; //@line 3744
 if (($AsyncRetVal | 0) != (HEAP32[$9 >> 2] | 0)) {
  $12 = $4 + 32 | 0; //@line 3748
  $17 = $AsyncRetVal - (HEAP32[$12 >> 2] | 0) & HEAP32[$4 + 12 >> 2]; //@line 3753
  HEAP32[$12 >> 2] = $AsyncRetVal; //@line 3754
  $19 = HEAP32[$4 + 8 >> 2] | 0; //@line 3756
  L4 : do {
   if (($19 | 0) < 1e6) {
    switch ($19 | 0) {
    case 32768:
     {
      break;
     }
    default:
     {
      label = 6; //@line 3765
      break L4;
     }
    }
    $20 = ___muldi3($17 | 0, 0, 1e6, 0) | 0; //@line 3769
    $22 = _bitshift64Lshr($20 | 0, tempRet0 | 0, 15) | 0; //@line 3771
    $23 = tempRet0; //@line 3772
    $26 = $4 + 40 | 0; //@line 3775
    $27 = $26; //@line 3776
    $33 = _i64Add(HEAP32[$27 >> 2] | 0, HEAP32[$27 + 4 >> 2] | 0, $17 * 1e6 & 32704 | 0, 0) | 0; //@line 3782
    $34 = tempRet0; //@line 3783
    $35 = $26; //@line 3784
    HEAP32[$35 >> 2] = $33; //@line 3786
    HEAP32[$35 + 4 >> 2] = $34; //@line 3789
    if ($34 >>> 0 < 0 | ($34 | 0) == 0 & $33 >>> 0 < 32768) {
     $93 = $22; //@line 3796
     $94 = $23; //@line 3796
    } else {
     $44 = _i64Add($22 | 0, $23 | 0, 1, 0) | 0; //@line 3798
     $45 = tempRet0; //@line 3799
     $46 = _i64Add($33 | 0, $34 | 0, -32768, -1) | 0; //@line 3800
     $48 = $26; //@line 3802
     HEAP32[$48 >> 2] = $46; //@line 3804
     HEAP32[$48 + 4 >> 2] = tempRet0; //@line 3807
     $93 = $44; //@line 3808
     $94 = $45; //@line 3808
    }
   } else {
    switch ($19 | 0) {
    case 1e6:
     {
      $93 = $17; //@line 3813
      $94 = 0; //@line 3813
      break;
     }
    default:
     {
      label = 6; //@line 3817
     }
    }
   }
  } while (0);
  if ((label | 0) == 6) {
   $52 = ___muldi3($17 | 0, 0, 1e6, 0) | 0; //@line 3823
   $53 = tempRet0; //@line 3824
   $54 = ___udivdi3($52 | 0, $53 | 0, $19 | 0, 0) | 0; //@line 3825
   $55 = tempRet0; //@line 3826
   $56 = ___muldi3($54 | 0, $55 | 0, $19 | 0, 0) | 0; //@line 3827
   $58 = _i64Subtract($52 | 0, $53 | 0, $56 | 0, tempRet0 | 0) | 0; //@line 3829
   $60 = $4 + 40 | 0; //@line 3831
   $61 = $60; //@line 3832
   $67 = _i64Add($58 | 0, tempRet0 | 0, HEAP32[$61 >> 2] | 0, HEAP32[$61 + 4 >> 2] | 0) | 0; //@line 3838
   $68 = tempRet0; //@line 3839
   $69 = $60; //@line 3840
   HEAP32[$69 >> 2] = $67; //@line 3842
   HEAP32[$69 + 4 >> 2] = $68; //@line 3845
   if ($68 >>> 0 < 0 | ($68 | 0) == 0 & $67 >>> 0 < $19 >>> 0) {
    $93 = $54; //@line 3852
    $94 = $55; //@line 3852
   } else {
    $78 = _i64Add($54 | 0, $55 | 0, 1, 0) | 0; //@line 3854
    $79 = tempRet0; //@line 3855
    $80 = _i64Subtract($67 | 0, $68 | 0, $19 | 0, 0) | 0; //@line 3856
    $82 = $60; //@line 3858
    HEAP32[$82 >> 2] = $80; //@line 3860
    HEAP32[$82 + 4 >> 2] = tempRet0; //@line 3863
    $93 = $78; //@line 3864
    $94 = $79; //@line 3864
   }
  }
  $86 = $4 + 48 | 0; //@line 3867
  $87 = $86; //@line 3868
  $95 = _i64Add(HEAP32[$87 >> 2] | 0, HEAP32[$87 + 4 >> 2] | 0, $93 | 0, $94 | 0) | 0; //@line 3874
  $97 = $86; //@line 3876
  HEAP32[$97 >> 2] = $95; //@line 3878
  HEAP32[$97 + 4 >> 2] = tempRet0; //@line 3881
 }
 $102 = HEAP32[$8 + 4 >> 2] | 0; //@line 3884
 if (!$102) {
  $177 = (HEAP32[$4 + 16 >> 2] | 0) + (HEAP32[$4 + 32 >> 2] | 0) & HEAP32[$4 + 12 >> 2]; //@line 3894
  $180 = HEAP32[(HEAP32[$2 >> 2] | 0) + 16 >> 2] | 0; //@line 3897
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 3898
  FUNCTION_TABLE_vi[$180 & 255]($177); //@line 3899
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 73; //@line 3902
   sp = STACKTOP; //@line 3903
   return;
  }
  ___async_unwind = 0; //@line 3906
  HEAP32[$ReallocAsyncCtx7 >> 2] = 73; //@line 3907
  sp = STACKTOP; //@line 3908
  return;
 }
 $105 = $8 + 48 | 0; //@line 3912
 $107 = HEAP32[$105 >> 2] | 0; //@line 3914
 $110 = HEAP32[$105 + 4 >> 2] | 0; //@line 3917
 $111 = $102; //@line 3918
 $113 = HEAP32[$111 >> 2] | 0; //@line 3920
 $116 = HEAP32[$111 + 4 >> 2] | 0; //@line 3923
 if (!($116 >>> 0 > $110 >>> 0 | ($116 | 0) == ($110 | 0) & $113 >>> 0 > $107 >>> 0)) {
  $124 = HEAP32[(HEAP32[$2 >> 2] | 0) + 20 >> 2] | 0; //@line 3932
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 3933
  FUNCTION_TABLE_v[$124 & 15](); //@line 3934
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 68; //@line 3937
   sp = STACKTOP; //@line 3938
   return;
  }
  ___async_unwind = 0; //@line 3941
  HEAP32[$ReallocAsyncCtx2 >> 2] = 68; //@line 3942
  sp = STACKTOP; //@line 3943
  return;
 }
 $125 = _i64Subtract($113 | 0, $116 | 0, $107 | 0, $110 | 0) | 0; //@line 3946
 $126 = tempRet0; //@line 3947
 $128 = HEAP32[$8 + 16 >> 2] | 0; //@line 3949
 $130 = $8 + 24 | 0; //@line 3951
 $135 = HEAP32[$130 + 4 >> 2] | 0; //@line 3956
 L28 : do {
  if ($126 >>> 0 > $135 >>> 0 | (($126 | 0) == ($135 | 0) ? $125 >>> 0 > (HEAP32[$130 >> 2] | 0) >>> 0 : 0)) {
   $$0$i = $128; //@line 3964
  } else {
   $142 = HEAP32[$8 + 8 >> 2] | 0; //@line 3967
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
     $144 = _bitshift64Shl($125 | 0, $126 | 0, 15) | 0; //@line 3979
     $146 = ___udivdi3($144 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 3981
     $$0$i = $128 >>> 0 < $146 >>> 0 ? $128 : $146; //@line 3985
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
     $$0$i = $128 >>> 0 < $125 >>> 0 ? $128 : $125; //@line 3998
     break L28;
    }
   } while (0);
   $149 = ___muldi3($125 | 0, $126 | 0, $142 | 0, 0) | 0; //@line 4002
   $151 = ___udivdi3($149 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 4004
   $$0$i = $128 >>> 0 < $151 >>> 0 ? $128 : $151; //@line 4008
  }
 } while (0);
 $158 = (HEAP32[$9 >> 2] | 0) + $$0$i & HEAP32[$8 + 12 >> 2]; //@line 4015
 $159 = $4 + 32 | 0; //@line 4016
 $162 = HEAP32[$2 >> 2] | 0; //@line 4019
 if (($158 | 0) == (HEAP32[$159 >> 2] | 0)) {
  $164 = HEAP32[$162 + 20 >> 2] | 0; //@line 4022
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 4023
  FUNCTION_TABLE_v[$164 & 15](); //@line 4024
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 69; //@line 4027
   sp = STACKTOP; //@line 4028
   return;
  }
  ___async_unwind = 0; //@line 4031
  HEAP32[$ReallocAsyncCtx3 >> 2] = 69; //@line 4032
  sp = STACKTOP; //@line 4033
  return;
 } else {
  $166 = HEAP32[$162 + 16 >> 2] | 0; //@line 4037
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 4038
  FUNCTION_TABLE_vi[$166 & 255]($158); //@line 4039
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 70; //@line 4042
   $167 = $ReallocAsyncCtx4 + 4 | 0; //@line 4043
   HEAP32[$167 >> 2] = $2; //@line 4044
   $168 = $ReallocAsyncCtx4 + 8 | 0; //@line 4045
   HEAP32[$168 >> 2] = $159; //@line 4046
   $169 = $ReallocAsyncCtx4 + 12 | 0; //@line 4047
   HEAP32[$169 >> 2] = $158; //@line 4048
   sp = STACKTOP; //@line 4049
   return;
  }
  ___async_unwind = 0; //@line 4052
  HEAP32[$ReallocAsyncCtx4 >> 2] = 70; //@line 4053
  $167 = $ReallocAsyncCtx4 + 4 | 0; //@line 4054
  HEAP32[$167 >> 2] = $2; //@line 4055
  $168 = $ReallocAsyncCtx4 + 8 | 0; //@line 4056
  HEAP32[$168 >> 2] = $159; //@line 4057
  $169 = $ReallocAsyncCtx4 + 12 | 0; //@line 4058
  HEAP32[$169 >> 2] = $158; //@line 4059
  sp = STACKTOP; //@line 4060
  return;
 }
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2362
 STACKTOP = STACKTOP + 32 | 0; //@line 2363
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 2363
 $0 = sp; //@line 2364
 _gpio_init_out($0, 50); //@line 2365
 while (1) {
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2368
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2369
  _wait_ms(150); //@line 2370
  if (___async) {
   label = 3; //@line 2373
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 2376
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2378
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2379
  _wait_ms(150); //@line 2380
  if (___async) {
   label = 5; //@line 2383
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 2386
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2388
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2389
  _wait_ms(150); //@line 2390
  if (___async) {
   label = 7; //@line 2393
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 2396
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2398
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2399
  _wait_ms(150); //@line 2400
  if (___async) {
   label = 9; //@line 2403
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 2406
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2408
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2409
  _wait_ms(150); //@line 2410
  if (___async) {
   label = 11; //@line 2413
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 2416
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2418
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2419
  _wait_ms(150); //@line 2420
  if (___async) {
   label = 13; //@line 2423
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 2426
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2428
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2429
  _wait_ms(150); //@line 2430
  if (___async) {
   label = 15; //@line 2433
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 2436
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2438
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2439
  _wait_ms(150); //@line 2440
  if (___async) {
   label = 17; //@line 2443
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 2446
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2448
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2449
  _wait_ms(400); //@line 2450
  if (___async) {
   label = 19; //@line 2453
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 2456
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2458
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2459
  _wait_ms(400); //@line 2460
  if (___async) {
   label = 21; //@line 2463
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 2466
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2468
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2469
  _wait_ms(400); //@line 2470
  if (___async) {
   label = 23; //@line 2473
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 2476
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2478
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2479
  _wait_ms(400); //@line 2480
  if (___async) {
   label = 25; //@line 2483
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 2486
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2488
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2489
  _wait_ms(400); //@line 2490
  if (___async) {
   label = 27; //@line 2493
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 2496
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2498
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2499
  _wait_ms(400); //@line 2500
  if (___async) {
   label = 29; //@line 2503
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2506
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2508
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2509
  _wait_ms(400); //@line 2510
  if (___async) {
   label = 31; //@line 2513
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2516
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2518
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2519
  _wait_ms(400); //@line 2520
  if (___async) {
   label = 33; //@line 2523
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2526
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 76; //@line 2530
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 2532
   sp = STACKTOP; //@line 2533
   STACKTOP = sp; //@line 2534
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 77; //@line 2538
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 2540
   sp = STACKTOP; //@line 2541
   STACKTOP = sp; //@line 2542
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 78; //@line 2546
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 2548
   sp = STACKTOP; //@line 2549
   STACKTOP = sp; //@line 2550
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 79; //@line 2554
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 2556
   sp = STACKTOP; //@line 2557
   STACKTOP = sp; //@line 2558
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 80; //@line 2562
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 2564
   sp = STACKTOP; //@line 2565
   STACKTOP = sp; //@line 2566
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 81; //@line 2570
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 2572
   sp = STACKTOP; //@line 2573
   STACKTOP = sp; //@line 2574
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 82; //@line 2578
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 2580
   sp = STACKTOP; //@line 2581
   STACKTOP = sp; //@line 2582
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 83; //@line 2586
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 2588
   sp = STACKTOP; //@line 2589
   STACKTOP = sp; //@line 2590
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 84; //@line 2594
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 2596
   sp = STACKTOP; //@line 2597
   STACKTOP = sp; //@line 2598
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 85; //@line 2602
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 2604
   sp = STACKTOP; //@line 2605
   STACKTOP = sp; //@line 2606
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 86; //@line 2610
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 2612
   sp = STACKTOP; //@line 2613
   STACKTOP = sp; //@line 2614
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 87; //@line 2618
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 2620
   sp = STACKTOP; //@line 2621
   STACKTOP = sp; //@line 2622
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 88; //@line 2626
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 2628
   sp = STACKTOP; //@line 2629
   STACKTOP = sp; //@line 2630
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 89; //@line 2634
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 2636
   sp = STACKTOP; //@line 2637
   STACKTOP = sp; //@line 2638
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 90; //@line 2642
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2644
   sp = STACKTOP; //@line 2645
   STACKTOP = sp; //@line 2646
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 91; //@line 2650
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2652
   sp = STACKTOP; //@line 2653
   STACKTOP = sp; //@line 2654
   return;
  }
 }
}
function _main() {
 var $0 = 0, $1 = 0, $13 = 0, $17 = 0, $2 = 0, $22 = 0, $25 = 0, $29 = 0, $33 = 0, $37 = 0, $40 = 0, $43 = 0, $47 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx22 = 0, $AsyncCtx25 = 0, $AsyncCtx28 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 3261
 STACKTOP = STACKTOP + 48 | 0; //@line 3262
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 3262
 $0 = sp + 32 | 0; //@line 3263
 $1 = sp + 16 | 0; //@line 3264
 $2 = sp; //@line 3265
 $AsyncCtx19 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3266
 _puts(2430) | 0; //@line 3267
 if (___async) {
  HEAP32[$AsyncCtx19 >> 2] = 112; //@line 3270
  HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 3272
  HEAP32[$AsyncCtx19 + 8 >> 2] = $1; //@line 3274
  HEAP32[$AsyncCtx19 + 12 >> 2] = $2; //@line 3276
  sp = STACKTOP; //@line 3277
  STACKTOP = sp; //@line 3278
  return 0; //@line 3278
 }
 _emscripten_free_async_context($AsyncCtx19 | 0); //@line 3280
 $AsyncCtx15 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3281
 _puts(2443) | 0; //@line 3282
 if (___async) {
  HEAP32[$AsyncCtx15 >> 2] = 113; //@line 3285
  HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 3287
  HEAP32[$AsyncCtx15 + 8 >> 2] = $1; //@line 3289
  HEAP32[$AsyncCtx15 + 12 >> 2] = $2; //@line 3291
  sp = STACKTOP; //@line 3292
  STACKTOP = sp; //@line 3293
  return 0; //@line 3293
 }
 _emscripten_free_async_context($AsyncCtx15 | 0); //@line 3295
 $AsyncCtx11 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3296
 _puts(2546) | 0; //@line 3297
 if (___async) {
  HEAP32[$AsyncCtx11 >> 2] = 114; //@line 3300
  HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 3302
  HEAP32[$AsyncCtx11 + 8 >> 2] = $1; //@line 3304
  HEAP32[$AsyncCtx11 + 12 >> 2] = $2; //@line 3306
  sp = STACKTOP; //@line 3307
  STACKTOP = sp; //@line 3308
  return 0; //@line 3308
 }
 _emscripten_free_async_context($AsyncCtx11 | 0); //@line 3310
 $13 = $0 + 4 | 0; //@line 3312
 HEAP32[$13 >> 2] = 0; //@line 3314
 HEAP32[$13 + 4 >> 2] = 0; //@line 3317
 HEAP32[$0 >> 2] = 7; //@line 3318
 $17 = $0 + 12 | 0; //@line 3319
 HEAP32[$17 >> 2] = 384; //@line 3320
 $AsyncCtx25 = _emscripten_alloc_async_context(20, sp) | 0; //@line 3321
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5648, $0, 1.0); //@line 3322
 if (___async) {
  HEAP32[$AsyncCtx25 >> 2] = 115; //@line 3325
  HEAP32[$AsyncCtx25 + 4 >> 2] = $17; //@line 3327
  HEAP32[$AsyncCtx25 + 8 >> 2] = $0; //@line 3329
  HEAP32[$AsyncCtx25 + 12 >> 2] = $1; //@line 3331
  HEAP32[$AsyncCtx25 + 16 >> 2] = $2; //@line 3333
  sp = STACKTOP; //@line 3334
  STACKTOP = sp; //@line 3335
  return 0; //@line 3335
 }
 _emscripten_free_async_context($AsyncCtx25 | 0); //@line 3337
 $22 = HEAP32[$17 >> 2] | 0; //@line 3338
 do {
  if ($22 | 0) {
   $25 = HEAP32[$22 + 8 >> 2] | 0; //@line 3343
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 3344
   FUNCTION_TABLE_vi[$25 & 255]($0); //@line 3345
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 116; //@line 3348
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 3350
    HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 3352
    sp = STACKTOP; //@line 3353
    STACKTOP = sp; //@line 3354
    return 0; //@line 3354
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 3356
    break;
   }
  }
 } while (0);
 $29 = $1 + 4 | 0; //@line 3362
 HEAP32[$29 >> 2] = 0; //@line 3364
 HEAP32[$29 + 4 >> 2] = 0; //@line 3367
 HEAP32[$1 >> 2] = 8; //@line 3368
 $33 = $1 + 12 | 0; //@line 3369
 HEAP32[$33 >> 2] = 384; //@line 3370
 $AsyncCtx22 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3371
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5712, $1, 2.5); //@line 3372
 if (___async) {
  HEAP32[$AsyncCtx22 >> 2] = 117; //@line 3375
  HEAP32[$AsyncCtx22 + 4 >> 2] = $33; //@line 3377
  HEAP32[$AsyncCtx22 + 8 >> 2] = $2; //@line 3379
  HEAP32[$AsyncCtx22 + 12 >> 2] = $1; //@line 3381
  sp = STACKTOP; //@line 3382
  STACKTOP = sp; //@line 3383
  return 0; //@line 3383
 }
 _emscripten_free_async_context($AsyncCtx22 | 0); //@line 3385
 $37 = HEAP32[$33 >> 2] | 0; //@line 3386
 do {
  if ($37 | 0) {
   $40 = HEAP32[$37 + 8 >> 2] | 0; //@line 3391
   $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3392
   FUNCTION_TABLE_vi[$40 & 255]($1); //@line 3393
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 118; //@line 3396
    HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 3398
    sp = STACKTOP; //@line 3399
    STACKTOP = sp; //@line 3400
    return 0; //@line 3400
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3402
    break;
   }
  }
 } while (0);
 $43 = $2 + 4 | 0; //@line 3408
 HEAP32[$43 >> 2] = 0; //@line 3410
 HEAP32[$43 + 4 >> 2] = 0; //@line 3413
 HEAP32[$2 >> 2] = 9; //@line 3414
 $47 = $2 + 12 | 0; //@line 3415
 HEAP32[$47 >> 2] = 384; //@line 3416
 $AsyncCtx28 = _emscripten_alloc_async_context(12, sp) | 0; //@line 3417
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5864, $2); //@line 3418
 if (___async) {
  HEAP32[$AsyncCtx28 >> 2] = 119; //@line 3421
  HEAP32[$AsyncCtx28 + 4 >> 2] = $47; //@line 3423
  HEAP32[$AsyncCtx28 + 8 >> 2] = $2; //@line 3425
  sp = STACKTOP; //@line 3426
  STACKTOP = sp; //@line 3427
  return 0; //@line 3427
 }
 _emscripten_free_async_context($AsyncCtx28 | 0); //@line 3429
 $50 = HEAP32[$47 >> 2] | 0; //@line 3430
 do {
  if ($50 | 0) {
   $53 = HEAP32[$50 + 8 >> 2] | 0; //@line 3435
   $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3436
   FUNCTION_TABLE_vi[$53 & 255]($2); //@line 3437
   if (___async) {
    HEAP32[$AsyncCtx7 >> 2] = 120; //@line 3440
    sp = STACKTOP; //@line 3441
    STACKTOP = sp; //@line 3442
    return 0; //@line 3442
   } else {
    _emscripten_free_async_context($AsyncCtx7 | 0); //@line 3444
    break;
   }
  }
 } while (0);
 $AsyncCtx31 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3449
 _wait_ms(-1); //@line 3450
 if (___async) {
  HEAP32[$AsyncCtx31 >> 2] = 121; //@line 3453
  sp = STACKTOP; //@line 3454
  STACKTOP = sp; //@line 3455
  return 0; //@line 3455
 } else {
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 3457
  STACKTOP = sp; //@line 3458
  return 0; //@line 3458
 }
 return 0; //@line 3460
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0.0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $16 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $48 = 0, $6 = 0.0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4631
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4635
 $6 = +HEAPF32[$0 + 12 >> 2]; //@line 4637
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4639
 $9 = $4 + 12 | 0; //@line 4641
 HEAP32[$9 >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 4642
 $10 = $6 * 1.0e6; //@line 4643
 $11 = ~~$10 >>> 0; //@line 4644
 $12 = +Math_abs($10) >= 1.0 ? $10 > 0.0 ? ~~+Math_min(+Math_floor($10 / 4294967296.0), 4294967295.0) >>> 0 : ~~+Math_ceil(($10 - +(~~$10 >>> 0)) / 4294967296.0) >>> 0 : 0; //@line 4645
 $13 = $8 + 40 | 0; //@line 4646
 do {
  if (($13 | 0) != ($4 | 0)) {
   $15 = $8 + 52 | 0; //@line 4650
   $16 = HEAP32[$15 >> 2] | 0; //@line 4651
   if ($16 | 0) {
    $19 = HEAP32[$16 + 8 >> 2] | 0; //@line 4655
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 4656
    FUNCTION_TABLE_vi[$19 & 255]($13); //@line 4657
    if (___async) {
     HEAP32[$ReallocAsyncCtx2 >> 2] = 123; //@line 4660
     $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 4661
     HEAP32[$20 >> 2] = $9; //@line 4662
     $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 4663
     HEAP32[$21 >> 2] = $15; //@line 4664
     $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 4665
     HEAP32[$22 >> 2] = $13; //@line 4666
     $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 4667
     HEAP32[$23 >> 2] = $4; //@line 4668
     $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 4669
     HEAP32[$24 >> 2] = $9; //@line 4670
     $25 = $ReallocAsyncCtx2 + 24 | 0; //@line 4671
     HEAP32[$25 >> 2] = $8; //@line 4672
     $26 = $ReallocAsyncCtx2 + 32 | 0; //@line 4673
     $27 = $26; //@line 4674
     $28 = $27; //@line 4675
     HEAP32[$28 >> 2] = $11; //@line 4676
     $29 = $27 + 4 | 0; //@line 4677
     $30 = $29; //@line 4678
     HEAP32[$30 >> 2] = $12; //@line 4679
     sp = STACKTOP; //@line 4680
     return;
    }
    ___async_unwind = 0; //@line 4683
    HEAP32[$ReallocAsyncCtx2 >> 2] = 123; //@line 4684
    $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 4685
    HEAP32[$20 >> 2] = $9; //@line 4686
    $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 4687
    HEAP32[$21 >> 2] = $15; //@line 4688
    $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 4689
    HEAP32[$22 >> 2] = $13; //@line 4690
    $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 4691
    HEAP32[$23 >> 2] = $4; //@line 4692
    $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 4693
    HEAP32[$24 >> 2] = $9; //@line 4694
    $25 = $ReallocAsyncCtx2 + 24 | 0; //@line 4695
    HEAP32[$25 >> 2] = $8; //@line 4696
    $26 = $ReallocAsyncCtx2 + 32 | 0; //@line 4697
    $27 = $26; //@line 4698
    $28 = $27; //@line 4699
    HEAP32[$28 >> 2] = $11; //@line 4700
    $29 = $27 + 4 | 0; //@line 4701
    $30 = $29; //@line 4702
    HEAP32[$30 >> 2] = $12; //@line 4703
    sp = STACKTOP; //@line 4704
    return;
   }
   $31 = HEAP32[$9 >> 2] | 0; //@line 4707
   if (!$31) {
    HEAP32[$15 >> 2] = 0; //@line 4710
    break;
   }
   $34 = HEAP32[$31 + 4 >> 2] | 0; //@line 4714
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 4715
   FUNCTION_TABLE_vii[$34 & 3]($13, $4); //@line 4716
   if (___async) {
    HEAP32[$ReallocAsyncCtx3 >> 2] = 124; //@line 4719
    $35 = $ReallocAsyncCtx3 + 4 | 0; //@line 4720
    HEAP32[$35 >> 2] = $9; //@line 4721
    $36 = $ReallocAsyncCtx3 + 8 | 0; //@line 4722
    HEAP32[$36 >> 2] = $15; //@line 4723
    $37 = $ReallocAsyncCtx3 + 12 | 0; //@line 4724
    HEAP32[$37 >> 2] = $8; //@line 4725
    $38 = $ReallocAsyncCtx3 + 16 | 0; //@line 4726
    $39 = $38; //@line 4727
    $40 = $39; //@line 4728
    HEAP32[$40 >> 2] = $11; //@line 4729
    $41 = $39 + 4 | 0; //@line 4730
    $42 = $41; //@line 4731
    HEAP32[$42 >> 2] = $12; //@line 4732
    $43 = $ReallocAsyncCtx3 + 24 | 0; //@line 4733
    HEAP32[$43 >> 2] = $9; //@line 4734
    $44 = $ReallocAsyncCtx3 + 28 | 0; //@line 4735
    HEAP32[$44 >> 2] = $4; //@line 4736
    sp = STACKTOP; //@line 4737
    return;
   }
   ___async_unwind = 0; //@line 4740
   HEAP32[$ReallocAsyncCtx3 >> 2] = 124; //@line 4741
   $35 = $ReallocAsyncCtx3 + 4 | 0; //@line 4742
   HEAP32[$35 >> 2] = $9; //@line 4743
   $36 = $ReallocAsyncCtx3 + 8 | 0; //@line 4744
   HEAP32[$36 >> 2] = $15; //@line 4745
   $37 = $ReallocAsyncCtx3 + 12 | 0; //@line 4746
   HEAP32[$37 >> 2] = $8; //@line 4747
   $38 = $ReallocAsyncCtx3 + 16 | 0; //@line 4748
   $39 = $38; //@line 4749
   $40 = $39; //@line 4750
   HEAP32[$40 >> 2] = $11; //@line 4751
   $41 = $39 + 4 | 0; //@line 4752
   $42 = $41; //@line 4753
   HEAP32[$42 >> 2] = $12; //@line 4754
   $43 = $ReallocAsyncCtx3 + 24 | 0; //@line 4755
   HEAP32[$43 >> 2] = $9; //@line 4756
   $44 = $ReallocAsyncCtx3 + 28 | 0; //@line 4757
   HEAP32[$44 >> 2] = $4; //@line 4758
   sp = STACKTOP; //@line 4759
   return;
  }
 } while (0);
 __ZN4mbed6Ticker5setupEy($8, $11, $12); //@line 4763
 $45 = HEAP32[$9 >> 2] | 0; //@line 4764
 if (!$45) {
  return;
 }
 $48 = HEAP32[$45 + 8 >> 2] | 0; //@line 4770
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 4771
 FUNCTION_TABLE_vi[$48 & 255]($4); //@line 4772
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 125; //@line 4775
  sp = STACKTOP; //@line 4776
  return;
 }
 ___async_unwind = 0; //@line 4779
 HEAP32[$ReallocAsyncCtx4 >> 2] = 125; //@line 4780
 sp = STACKTOP; //@line 4781
 return;
}
function _initialize__async_cb_24($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $27 = 0, $29 = 0, $30 = 0, $31 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 1679
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1681
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1683
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1685
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1687
 $8 = HEAP32[$AsyncRetVal >> 2] | 0; //@line 1688
 if (!$8) {
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(20) | 0; //@line 1691
  _mbed_assert_internal(1751, 1753, 41); //@line 1692
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 62; //@line 1695
   $10 = $ReallocAsyncCtx7 + 4 | 0; //@line 1696
   HEAP32[$10 >> 2] = $2; //@line 1697
   $11 = $ReallocAsyncCtx7 + 8 | 0; //@line 1698
   HEAP32[$11 >> 2] = $6; //@line 1699
   $12 = $ReallocAsyncCtx7 + 12 | 0; //@line 1700
   HEAP32[$12 >> 2] = $4; //@line 1701
   $13 = $ReallocAsyncCtx7 + 16 | 0; //@line 1702
   HEAP32[$13 >> 2] = $AsyncRetVal; //@line 1703
   sp = STACKTOP; //@line 1704
   return;
  }
  ___async_unwind = 0; //@line 1707
  HEAP32[$ReallocAsyncCtx7 >> 2] = 62; //@line 1708
  $10 = $ReallocAsyncCtx7 + 4 | 0; //@line 1709
  HEAP32[$10 >> 2] = $2; //@line 1710
  $11 = $ReallocAsyncCtx7 + 8 | 0; //@line 1711
  HEAP32[$11 >> 2] = $6; //@line 1712
  $12 = $ReallocAsyncCtx7 + 12 | 0; //@line 1713
  HEAP32[$12 >> 2] = $4; //@line 1714
  $13 = $ReallocAsyncCtx7 + 16 | 0; //@line 1715
  HEAP32[$13 >> 2] = $AsyncRetVal; //@line 1716
  sp = STACKTOP; //@line 1717
  return;
 }
 $15 = HEAP32[$AsyncRetVal + 4 >> 2] | 0; //@line 1721
 if (($15 + -4 | 0) >>> 0 > 28) {
  $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 1725
  _mbed_assert_internal(1751, 1753, 47); //@line 1726
  if (___async) {
   HEAP32[$ReallocAsyncCtx6 >> 2] = 63; //@line 1729
   $17 = $ReallocAsyncCtx6 + 4 | 0; //@line 1730
   HEAP32[$17 >> 2] = $8; //@line 1731
   $18 = $ReallocAsyncCtx6 + 8 | 0; //@line 1732
   HEAP32[$18 >> 2] = $2; //@line 1733
   $19 = $ReallocAsyncCtx6 + 12 | 0; //@line 1734
   HEAP32[$19 >> 2] = $6; //@line 1735
   $20 = $ReallocAsyncCtx6 + 16 | 0; //@line 1736
   HEAP32[$20 >> 2] = $4; //@line 1737
   sp = STACKTOP; //@line 1738
   return;
  }
  ___async_unwind = 0; //@line 1741
  HEAP32[$ReallocAsyncCtx6 >> 2] = 63; //@line 1742
  $17 = $ReallocAsyncCtx6 + 4 | 0; //@line 1743
  HEAP32[$17 >> 2] = $8; //@line 1744
  $18 = $ReallocAsyncCtx6 + 8 | 0; //@line 1745
  HEAP32[$18 >> 2] = $2; //@line 1746
  $19 = $ReallocAsyncCtx6 + 12 | 0; //@line 1747
  HEAP32[$19 >> 2] = $6; //@line 1748
  $20 = $ReallocAsyncCtx6 + 16 | 0; //@line 1749
  HEAP32[$20 >> 2] = $4; //@line 1750
  sp = STACKTOP; //@line 1751
  return;
 } else {
  $22 = 7 << $15 + -4; //@line 1755
  $23 = ___muldi3($22 | 0, 0, 1e6, 0) | 0; //@line 1756
  $24 = tempRet0; //@line 1757
  $25 = _i64Add($8 | 0, 0, -1, -1) | 0; //@line 1758
  $27 = _i64Add($25 | 0, tempRet0 | 0, $23 | 0, $24 | 0) | 0; //@line 1760
  $29 = ___udivdi3($27 | 0, tempRet0 | 0, $8 | 0, 0) | 0; //@line 1762
  $30 = tempRet0; //@line 1763
  $31 = HEAP32[$2 >> 2] | 0; //@line 1764
  HEAP32[$31 >> 2] = 0; //@line 1765
  HEAP32[$31 + 4 >> 2] = 0; //@line 1767
  $35 = HEAP32[(HEAP32[$6 >> 2] | 0) + 4 >> 2] | 0; //@line 1770
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 1771
  $36 = FUNCTION_TABLE_i[$35 & 3]() | 0; //@line 1772
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 1775
   $37 = $ReallocAsyncCtx3 + 4 | 0; //@line 1776
   HEAP32[$37 >> 2] = $2; //@line 1777
   $38 = $ReallocAsyncCtx3 + 8 | 0; //@line 1778
   HEAP32[$38 >> 2] = $8; //@line 1779
   $39 = $ReallocAsyncCtx3 + 12 | 0; //@line 1780
   HEAP32[$39 >> 2] = $15; //@line 1781
   $40 = $ReallocAsyncCtx3 + 16 | 0; //@line 1782
   HEAP32[$40 >> 2] = $22; //@line 1783
   $41 = $ReallocAsyncCtx3 + 24 | 0; //@line 1784
   $42 = $41; //@line 1785
   $43 = $42; //@line 1786
   HEAP32[$43 >> 2] = $29; //@line 1787
   $44 = $42 + 4 | 0; //@line 1788
   $45 = $44; //@line 1789
   HEAP32[$45 >> 2] = $30; //@line 1790
   $46 = $ReallocAsyncCtx3 + 32 | 0; //@line 1791
   HEAP32[$46 >> 2] = $6; //@line 1792
   $47 = $ReallocAsyncCtx3 + 36 | 0; //@line 1793
   HEAP32[$47 >> 2] = $4; //@line 1794
   sp = STACKTOP; //@line 1795
   return;
  }
  HEAP32[___async_retval >> 2] = $36; //@line 1799
  ___async_unwind = 0; //@line 1800
  HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 1801
  $37 = $ReallocAsyncCtx3 + 4 | 0; //@line 1802
  HEAP32[$37 >> 2] = $2; //@line 1803
  $38 = $ReallocAsyncCtx3 + 8 | 0; //@line 1804
  HEAP32[$38 >> 2] = $8; //@line 1805
  $39 = $ReallocAsyncCtx3 + 12 | 0; //@line 1806
  HEAP32[$39 >> 2] = $15; //@line 1807
  $40 = $ReallocAsyncCtx3 + 16 | 0; //@line 1808
  HEAP32[$40 >> 2] = $22; //@line 1809
  $41 = $ReallocAsyncCtx3 + 24 | 0; //@line 1810
  $42 = $41; //@line 1811
  $43 = $42; //@line 1812
  HEAP32[$43 >> 2] = $29; //@line 1813
  $44 = $42 + 4 | 0; //@line 1814
  $45 = $44; //@line 1815
  HEAP32[$45 >> 2] = $30; //@line 1816
  $46 = $ReallocAsyncCtx3 + 32 | 0; //@line 1817
  HEAP32[$46 >> 2] = $6; //@line 1818
  $47 = $ReallocAsyncCtx3 + 36 | 0; //@line 1819
  HEAP32[$47 >> 2] = $4; //@line 1820
  sp = STACKTOP; //@line 1821
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
function _mbed_vtracef__async_cb_10($0) {
 $0 = $0 | 0;
 var $$10 = 0, $$3147168 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $10 = 0, $12 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $28 = 0, $30 = 0, $34 = 0, $38 = 0, $4 = 0, $42 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $54 = 0, $56 = 0, $6 = 0, $67 = 0, $68 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 576
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 578
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 580
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 583
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 585
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 587
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 589
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 595
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 597
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 599
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 601
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 605
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 607
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 611
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 615
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 619
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 623
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 625
 HEAP32[$8 >> 2] = HEAP32[___async_retval >> 2]; //@line 628
 $50 = _snprintf($10, $12, 1668, $8) | 0; //@line 629
 $$10 = ($50 | 0) >= ($12 | 0) ? 0 : $50; //@line 631
 $53 = $10 + $$10 | 0; //@line 633
 $54 = $12 - $$10 | 0; //@line 634
 if (($$10 | 0) > 0) {
  if (($54 | 0) > 0) {
   $$3147168 = $54; //@line 638
   $$3169 = $53; //@line 638
   label = 4; //@line 639
  }
 } else {
  $$3147168 = $12; //@line 642
  $$3169 = $10; //@line 642
  label = 4; //@line 643
 }
 if ((label | 0) == 4) {
  $56 = $28 + -2 | 0; //@line 646
  switch ($56 >>> 1 | $56 << 31 | 0) {
  case 0:
   {
    HEAP32[$22 >> 2] = $24; //@line 652
    $$5156 = _snprintf($$3169, $$3147168, 1671, $22) | 0; //@line 654
    break;
   }
  case 1:
   {
    HEAP32[$42 >> 2] = $24; //@line 658
    $$5156 = _snprintf($$3169, $$3147168, 1686, $42) | 0; //@line 660
    break;
   }
  case 3:
   {
    HEAP32[$38 >> 2] = $24; //@line 664
    $$5156 = _snprintf($$3169, $$3147168, 1701, $38) | 0; //@line 666
    break;
   }
  case 7:
   {
    HEAP32[$34 >> 2] = $24; //@line 670
    $$5156 = _snprintf($$3169, $$3147168, 1716, $34) | 0; //@line 672
    break;
   }
  default:
   {
    $$5156 = _snprintf($$3169, $$3147168, 1731, $30) | 0; //@line 677
   }
  }
  $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 681
  $67 = $$3169 + $$5156$ | 0; //@line 683
  $68 = $$3147168 - $$5156$ | 0; //@line 684
  if (($$5156$ | 0) > 0 & ($68 | 0) > 0) {
   $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 688
   $70 = _vsnprintf($67, $68, $46, $48) | 0; //@line 689
   if (___async) {
    HEAP32[$ReallocAsyncCtx10 >> 2] = 53; //@line 692
    $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 693
    HEAP32[$71 >> 2] = $18; //@line 694
    $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 695
    HEAP32[$72 >> 2] = $20; //@line 696
    $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 697
    $$expand_i1_val = $6 & 1; //@line 698
    HEAP8[$73 >> 0] = $$expand_i1_val; //@line 699
    $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 700
    HEAP32[$74 >> 2] = $2; //@line 701
    $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 702
    HEAP32[$75 >> 2] = $4; //@line 703
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
   HEAP32[$71 >> 2] = $18; //@line 716
   $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 717
   HEAP32[$72 >> 2] = $20; //@line 718
   $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 719
   $$expand_i1_val = $6 & 1; //@line 720
   HEAP8[$73 >> 0] = $$expand_i1_val; //@line 721
   $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 722
   HEAP32[$74 >> 2] = $2; //@line 723
   $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 724
   HEAP32[$75 >> 2] = $4; //@line 725
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
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = +$2;
 var $13 = 0, $14 = 0, $15 = 0.0, $16 = 0, $17 = 0, $18 = 0, $20 = 0, $21 = 0, $24 = 0, $3 = 0, $32 = 0, $36 = 0, $39 = 0, $4 = 0, $44 = 0, $5 = 0, $50 = 0, $51 = 0, $54 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 3470
 STACKTOP = STACKTOP + 16 | 0; //@line 3471
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3471
 $3 = sp; //@line 3472
 $4 = $1 + 12 | 0; //@line 3473
 $5 = HEAP32[$4 >> 2] | 0; //@line 3474
 do {
  if (!$5) {
   $14 = 0; //@line 3478
  } else {
   $8 = HEAP32[$5 + 4 >> 2] | 0; //@line 3481
   $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 3482
   FUNCTION_TABLE_vii[$8 & 3]($3, $1); //@line 3483
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 122; //@line 3486
    HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 3488
    HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 3490
    HEAPF32[$AsyncCtx + 12 >> 2] = $2; //@line 3492
    HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 3494
    sp = STACKTOP; //@line 3495
    STACKTOP = sp; //@line 3496
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 3498
    $14 = HEAP32[$4 >> 2] | 0; //@line 3500
    break;
   }
  }
 } while (0);
 $13 = $3 + 12 | 0; //@line 3505
 HEAP32[$13 >> 2] = $14; //@line 3506
 $15 = $2 * 1.0e6; //@line 3507
 $16 = ~~$15 >>> 0; //@line 3508
 $17 = +Math_abs($15) >= 1.0 ? $15 > 0.0 ? ~~+Math_min(+Math_floor($15 / 4294967296.0), 4294967295.0) >>> 0 : ~~+Math_ceil(($15 - +(~~$15 >>> 0)) / 4294967296.0) >>> 0 : 0; //@line 3509
 $18 = $0 + 40 | 0; //@line 3510
 if (($18 | 0) != ($3 | 0)) {
  $20 = $0 + 52 | 0; //@line 3513
  $21 = HEAP32[$20 >> 2] | 0; //@line 3514
  do {
   if ($21 | 0) {
    $24 = HEAP32[$21 + 8 >> 2] | 0; //@line 3519
    $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3520
    FUNCTION_TABLE_vi[$24 & 255]($18); //@line 3521
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 123; //@line 3524
     HEAP32[$AsyncCtx3 + 4 >> 2] = $13; //@line 3526
     HEAP32[$AsyncCtx3 + 8 >> 2] = $20; //@line 3528
     HEAP32[$AsyncCtx3 + 12 >> 2] = $18; //@line 3530
     HEAP32[$AsyncCtx3 + 16 >> 2] = $3; //@line 3532
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 3534
     HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 3536
     $32 = $AsyncCtx3 + 32 | 0; //@line 3538
     HEAP32[$32 >> 2] = $16; //@line 3540
     HEAP32[$32 + 4 >> 2] = $17; //@line 3543
     sp = STACKTOP; //@line 3544
     STACKTOP = sp; //@line 3545
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3547
     break;
    }
   }
  } while (0);
  $36 = HEAP32[$13 >> 2] | 0; //@line 3552
  do {
   if (!$36) {
    $50 = 0; //@line 3556
   } else {
    $39 = HEAP32[$36 + 4 >> 2] | 0; //@line 3559
    $AsyncCtx6 = _emscripten_alloc_async_context(32, sp) | 0; //@line 3560
    FUNCTION_TABLE_vii[$39 & 3]($18, $3); //@line 3561
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 124; //@line 3564
     HEAP32[$AsyncCtx6 + 4 >> 2] = $13; //@line 3566
     HEAP32[$AsyncCtx6 + 8 >> 2] = $20; //@line 3568
     HEAP32[$AsyncCtx6 + 12 >> 2] = $0; //@line 3570
     $44 = $AsyncCtx6 + 16 | 0; //@line 3572
     HEAP32[$44 >> 2] = $16; //@line 3574
     HEAP32[$44 + 4 >> 2] = $17; //@line 3577
     HEAP32[$AsyncCtx6 + 24 >> 2] = $13; //@line 3579
     HEAP32[$AsyncCtx6 + 28 >> 2] = $3; //@line 3581
     sp = STACKTOP; //@line 3582
     STACKTOP = sp; //@line 3583
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 3585
     $50 = HEAP32[$13 >> 2] | 0; //@line 3587
     break;
    }
   }
  } while (0);
  HEAP32[$20 >> 2] = $50; //@line 3592
 }
 __ZN4mbed6Ticker5setupEy($0, $16, $17); //@line 3594
 $51 = HEAP32[$13 >> 2] | 0; //@line 3595
 if (!$51) {
  STACKTOP = sp; //@line 3598
  return;
 }
 $54 = HEAP32[$51 + 8 >> 2] | 0; //@line 3601
 $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3602
 FUNCTION_TABLE_vi[$54 & 255]($3); //@line 3603
 if (___async) {
  HEAP32[$AsyncCtx10 >> 2] = 125; //@line 3606
  sp = STACKTOP; //@line 3607
  STACKTOP = sp; //@line 3608
  return;
 }
 _emscripten_free_async_context($AsyncCtx10 | 0); //@line 3610
 STACKTOP = sp; //@line 3611
 return;
}
function _initialize__async_cb_29($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $25 = 0, $26 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $6 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 2201
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2203
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2205
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2207
 $10 = HEAP32[(HEAP32[$0 + 16 >> 2] | 0) + 4 >> 2] | 0; //@line 2211
 if (($10 + -4 | 0) >>> 0 > 28) {
  $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 2215
  _mbed_assert_internal(1751, 1753, 47); //@line 2216
  if (___async) {
   HEAP32[$ReallocAsyncCtx6 >> 2] = 63; //@line 2219
   $12 = $ReallocAsyncCtx6 + 4 | 0; //@line 2220
   HEAP32[$12 >> 2] = 1e6; //@line 2221
   $13 = $ReallocAsyncCtx6 + 8 | 0; //@line 2222
   HEAP32[$13 >> 2] = $2; //@line 2223
   $14 = $ReallocAsyncCtx6 + 12 | 0; //@line 2224
   HEAP32[$14 >> 2] = $4; //@line 2225
   $15 = $ReallocAsyncCtx6 + 16 | 0; //@line 2226
   HEAP32[$15 >> 2] = $6; //@line 2227
   sp = STACKTOP; //@line 2228
   return;
  }
  ___async_unwind = 0; //@line 2231
  HEAP32[$ReallocAsyncCtx6 >> 2] = 63; //@line 2232
  $12 = $ReallocAsyncCtx6 + 4 | 0; //@line 2233
  HEAP32[$12 >> 2] = 1e6; //@line 2234
  $13 = $ReallocAsyncCtx6 + 8 | 0; //@line 2235
  HEAP32[$13 >> 2] = $2; //@line 2236
  $14 = $ReallocAsyncCtx6 + 12 | 0; //@line 2237
  HEAP32[$14 >> 2] = $4; //@line 2238
  $15 = $ReallocAsyncCtx6 + 16 | 0; //@line 2239
  HEAP32[$15 >> 2] = $6; //@line 2240
  sp = STACKTOP; //@line 2241
  return;
 } else {
  $17 = 7 << $10 + -4; //@line 2245
  $18 = ___muldi3($17 | 0, 0, 1e6, 0) | 0; //@line 2246
  $19 = tempRet0; //@line 2247
  $20 = _i64Add(1e6, 0, -1, -1) | 0; //@line 2248
  $22 = _i64Add($20 | 0, tempRet0 | 0, $18 | 0, $19 | 0) | 0; //@line 2250
  $24 = ___udivdi3($22 | 0, tempRet0 | 0, 1e6, 0) | 0; //@line 2252
  $25 = tempRet0; //@line 2253
  $26 = HEAP32[$2 >> 2] | 0; //@line 2254
  HEAP32[$26 >> 2] = 0; //@line 2255
  HEAP32[$26 + 4 >> 2] = 0; //@line 2257
  $30 = HEAP32[(HEAP32[$4 >> 2] | 0) + 4 >> 2] | 0; //@line 2260
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 2261
  $31 = FUNCTION_TABLE_i[$30 & 3]() | 0; //@line 2262
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 2265
   $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 2266
   HEAP32[$32 >> 2] = $2; //@line 2267
   $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 2268
   HEAP32[$33 >> 2] = 1e6; //@line 2269
   $34 = $ReallocAsyncCtx3 + 12 | 0; //@line 2270
   HEAP32[$34 >> 2] = $10; //@line 2271
   $35 = $ReallocAsyncCtx3 + 16 | 0; //@line 2272
   HEAP32[$35 >> 2] = $17; //@line 2273
   $36 = $ReallocAsyncCtx3 + 24 | 0; //@line 2274
   $37 = $36; //@line 2275
   $38 = $37; //@line 2276
   HEAP32[$38 >> 2] = $24; //@line 2277
   $39 = $37 + 4 | 0; //@line 2278
   $40 = $39; //@line 2279
   HEAP32[$40 >> 2] = $25; //@line 2280
   $41 = $ReallocAsyncCtx3 + 32 | 0; //@line 2281
   HEAP32[$41 >> 2] = $4; //@line 2282
   $42 = $ReallocAsyncCtx3 + 36 | 0; //@line 2283
   HEAP32[$42 >> 2] = $6; //@line 2284
   sp = STACKTOP; //@line 2285
   return;
  }
  HEAP32[___async_retval >> 2] = $31; //@line 2289
  ___async_unwind = 0; //@line 2290
  HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 2291
  $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 2292
  HEAP32[$32 >> 2] = $2; //@line 2293
  $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 2294
  HEAP32[$33 >> 2] = 1e6; //@line 2295
  $34 = $ReallocAsyncCtx3 + 12 | 0; //@line 2296
  HEAP32[$34 >> 2] = $10; //@line 2297
  $35 = $ReallocAsyncCtx3 + 16 | 0; //@line 2298
  HEAP32[$35 >> 2] = $17; //@line 2299
  $36 = $ReallocAsyncCtx3 + 24 | 0; //@line 2300
  $37 = $36; //@line 2301
  $38 = $37; //@line 2302
  HEAP32[$38 >> 2] = $24; //@line 2303
  $39 = $37 + 4 | 0; //@line 2304
  $40 = $39; //@line 2305
  HEAP32[$40 >> 2] = $25; //@line 2306
  $41 = $ReallocAsyncCtx3 + 32 | 0; //@line 2307
  HEAP32[$41 >> 2] = $4; //@line 2308
  $42 = $ReallocAsyncCtx3 + 36 | 0; //@line 2309
  HEAP32[$42 >> 2] = $6; //@line 2310
  sp = STACKTOP; //@line 2311
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_47($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3521
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3523
 $4 = HEAP8[$0 + 8 >> 0] & 1; //@line 3526
 $6 = HEAP8[$0 + 9 >> 0] & 1; //@line 3529
 $8 = HEAP32[$0 + 12 >> 2] | 0; //@line 3531
 $10 = HEAP32[$0 + 16 >> 2] | 0; //@line 3533
 $12 = HEAP32[$0 + 20 >> 2] | 0; //@line 3535
 $14 = HEAP32[$0 + 24 >> 2] | 0; //@line 3537
 $16 = HEAP32[$0 + 28 >> 2] | 0; //@line 3539
 $18 = HEAP32[$0 + 32 >> 2] | 0; //@line 3541
 $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 3543
 $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 3545
 $24 = HEAP32[$0 + 44 >> 2] | 0; //@line 3547
 $26 = HEAP32[$0 + 48 >> 2] | 0; //@line 3549
 $28 = HEAP8[$0 + 52 >> 0] & 1; //@line 3552
 L2 : do {
  if (!(HEAP8[$12 >> 0] | 0)) {
   do {
    if (!(HEAP8[$26 >> 0] | 0)) {
     $$182$off0 = $4; //@line 3561
     $$186$off0 = $6; //@line 3561
    } else {
     if (!(HEAP8[$24 >> 0] | 0)) {
      if (!(HEAP32[$10 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $6; //@line 3570
       $$283$off0 = 1; //@line 3570
       label = 13; //@line 3571
       break L2;
      } else {
       $$182$off0 = 1; //@line 3574
       $$186$off0 = $6; //@line 3574
       break;
      }
     }
     if ((HEAP32[$14 >> 2] | 0) == 1) {
      label = 18; //@line 3581
      break L2;
     }
     if (!(HEAP32[$10 >> 2] & 2)) {
      label = 18; //@line 3588
      break L2;
     } else {
      $$182$off0 = 1; //@line 3591
      $$186$off0 = 1; //@line 3591
     }
    }
   } while (0);
   $30 = $8 + 8 | 0; //@line 3595
   if ($30 >>> 0 < $22 >>> 0) {
    HEAP8[$24 >> 0] = 0; //@line 3598
    HEAP8[$26 >> 0] = 0; //@line 3599
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 3600
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $20, $16, $16, 1, $28); //@line 3601
    if (!___async) {
     ___async_unwind = 0; //@line 3604
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 157; //@line 3606
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 3608
    HEAP8[$ReallocAsyncCtx5 + 8 >> 0] = $$182$off0 & 1; //@line 3611
    HEAP8[$ReallocAsyncCtx5 + 9 >> 0] = $$186$off0 & 1; //@line 3614
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $30; //@line 3616
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $10; //@line 3618
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $12; //@line 3620
    HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $14; //@line 3622
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $16; //@line 3624
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $18; //@line 3626
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $20; //@line 3628
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $22; //@line 3630
    HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $24; //@line 3632
    HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $26; //@line 3634
    HEAP8[$ReallocAsyncCtx5 + 52 >> 0] = $28 & 1; //@line 3637
    sp = STACKTOP; //@line 3638
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 3641
    $$283$off0 = $$182$off0; //@line 3641
    label = 13; //@line 3642
   }
  } else {
   $$085$off0$reg2mem$0 = $6; //@line 3645
   $$283$off0 = $4; //@line 3645
   label = 13; //@line 3646
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$18 >> 2] = $16; //@line 3652
    $59 = $20 + 40 | 0; //@line 3653
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 3656
    if ((HEAP32[$20 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$14 >> 2] | 0) == 2) {
      HEAP8[$12 >> 0] = 1; //@line 3664
      if ($$283$off0) {
       label = 18; //@line 3666
       break;
      } else {
       $67 = 4; //@line 3669
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 3676
   } else {
    $67 = 4; //@line 3678
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 3683
 }
 HEAP32[$2 >> 2] = $67; //@line 3685
 return;
}
function _initialize__async_cb_26($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $23 = 0, $24 = 0, $25 = 0, $27 = 0, $28 = 0, $31 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $48 = 0, $49 = 0, $50 = 0, $52 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $62 = 0, $64 = 0, $70 = 0, $71 = 0, $72 = 0, $81 = 0, $82 = 0, $83 = 0, $85 = 0, $89 = 0, $95 = 0, $96 = 0, $97 = 0, $99 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1943
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1947
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1949
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1953
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1955
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1957
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1959
 if (($AsyncRetVal | 0) != (HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 32 >> 2] | 0)) {
  $23 = $AsyncRetVal - (HEAP32[$6 >> 2] | 0) & HEAP32[HEAP32[$0 + 16 >> 2] >> 2]; //@line 1968
  HEAP32[$6 >> 2] = $AsyncRetVal; //@line 1969
  $24 = HEAP32[$10 >> 2] | 0; //@line 1970
  L4 : do {
   if (($24 | 0) < 1e6) {
    switch ($24 | 0) {
    case 32768:
     {
      break;
     }
    default:
     {
      label = 6; //@line 1979
      break L4;
     }
    }
    $25 = ___muldi3($23 | 0, 0, 1e6, 0) | 0; //@line 1983
    $27 = _bitshift64Lshr($25 | 0, tempRet0 | 0, 15) | 0; //@line 1985
    $28 = tempRet0; //@line 1986
    $31 = $12; //@line 1989
    $37 = _i64Add(HEAP32[$31 >> 2] | 0, HEAP32[$31 + 4 >> 2] | 0, $23 * 1e6 & 32704 | 0, 0) | 0; //@line 1995
    $38 = tempRet0; //@line 1996
    $39 = $12; //@line 1997
    HEAP32[$39 >> 2] = $37; //@line 1999
    HEAP32[$39 + 4 >> 2] = $38; //@line 2002
    if ($38 >>> 0 < 0 | ($38 | 0) == 0 & $37 >>> 0 < 32768) {
     $95 = $27; //@line 2009
     $96 = $28; //@line 2009
    } else {
     $48 = _i64Add($27 | 0, $28 | 0, 1, 0) | 0; //@line 2011
     $49 = tempRet0; //@line 2012
     $50 = _i64Add($37 | 0, $38 | 0, -32768, -1) | 0; //@line 2013
     $52 = $12; //@line 2015
     HEAP32[$52 >> 2] = $50; //@line 2017
     HEAP32[$52 + 4 >> 2] = tempRet0; //@line 2020
     $95 = $48; //@line 2021
     $96 = $49; //@line 2021
    }
   } else {
    switch ($24 | 0) {
    case 1e6:
     {
      $95 = $23; //@line 2026
      $96 = 0; //@line 2026
      break;
     }
    default:
     {
      label = 6; //@line 2030
     }
    }
   }
  } while (0);
  if ((label | 0) == 6) {
   $56 = ___muldi3($23 | 0, 0, 1e6, 0) | 0; //@line 2036
   $57 = tempRet0; //@line 2037
   $58 = ___udivdi3($56 | 0, $57 | 0, $24 | 0, 0) | 0; //@line 2038
   $59 = tempRet0; //@line 2039
   $60 = ___muldi3($58 | 0, $59 | 0, $24 | 0, 0) | 0; //@line 2040
   $62 = _i64Subtract($56 | 0, $57 | 0, $60 | 0, tempRet0 | 0) | 0; //@line 2042
   $64 = $12; //@line 2044
   $70 = _i64Add($62 | 0, tempRet0 | 0, HEAP32[$64 >> 2] | 0, HEAP32[$64 + 4 >> 2] | 0) | 0; //@line 2050
   $71 = tempRet0; //@line 2051
   $72 = $12; //@line 2052
   HEAP32[$72 >> 2] = $70; //@line 2054
   HEAP32[$72 + 4 >> 2] = $71; //@line 2057
   if ($71 >>> 0 < 0 | ($71 | 0) == 0 & $70 >>> 0 < $24 >>> 0) {
    $95 = $58; //@line 2064
    $96 = $59; //@line 2064
   } else {
    $81 = _i64Add($58 | 0, $59 | 0, 1, 0) | 0; //@line 2066
    $82 = tempRet0; //@line 2067
    $83 = _i64Subtract($70 | 0, $71 | 0, $24 | 0, 0) | 0; //@line 2068
    $85 = $12; //@line 2070
    HEAP32[$85 >> 2] = $83; //@line 2072
    HEAP32[$85 + 4 >> 2] = tempRet0; //@line 2075
    $95 = $81; //@line 2076
    $96 = $82; //@line 2076
   }
  }
  $89 = $14; //@line 2079
  $97 = _i64Add(HEAP32[$89 >> 2] | 0, HEAP32[$89 + 4 >> 2] | 0, $95 | 0, $96 | 0) | 0; //@line 2085
  $99 = $14; //@line 2087
  HEAP32[$99 >> 2] = $97; //@line 2089
  HEAP32[$99 + 4 >> 2] = tempRet0; //@line 2092
 }
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(4) | 0; //@line 2094
 _schedule_interrupt($4); //@line 2095
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 66; //@line 2098
  sp = STACKTOP; //@line 2099
  return;
 }
 ___async_unwind = 0; //@line 2102
 HEAP32[$ReallocAsyncCtx5 >> 2] = 66; //@line 2103
 sp = STACKTOP; //@line 2104
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
 sp = STACKTOP; //@line 12738
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 12743
 } else {
  $9 = $1 + 52 | 0; //@line 12745
  $10 = HEAP8[$9 >> 0] | 0; //@line 12746
  $11 = $1 + 53 | 0; //@line 12747
  $12 = HEAP8[$11 >> 0] | 0; //@line 12748
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 12751
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 12752
  HEAP8[$9 >> 0] = 0; //@line 12753
  HEAP8[$11 >> 0] = 0; //@line 12754
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 12755
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 12756
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 155; //@line 12759
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 12761
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 12763
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 12765
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 12767
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 12769
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 12771
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 12773
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 12775
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 12777
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 12779
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 12782
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 12784
   sp = STACKTOP; //@line 12785
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12788
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 12793
    $32 = $0 + 8 | 0; //@line 12794
    $33 = $1 + 54 | 0; //@line 12795
    $$0 = $0 + 24 | 0; //@line 12796
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
     HEAP8[$9 >> 0] = 0; //@line 12829
     HEAP8[$11 >> 0] = 0; //@line 12830
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 12831
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 12832
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 12837
     $62 = $$0 + 8 | 0; //@line 12838
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 12841
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 156; //@line 12846
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 12848
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 12850
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 12852
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 12854
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 12856
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 12858
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 12860
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 12862
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 12864
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 12866
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 12868
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 12870
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 12872
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 12875
    sp = STACKTOP; //@line 12876
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 12880
  HEAP8[$11 >> 0] = $12; //@line 12881
 }
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_46($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3365
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3367
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3371
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3373
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3375
 $12 = HEAP8[$0 + 24 >> 0] & 1; //@line 3378
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3380
 $15 = $2 + 24 | 0; //@line 3381
 do {
  if ((HEAP32[$0 + 8 >> 2] | 0) > 1) {
   $18 = HEAP32[$2 + 8 >> 2] | 0; //@line 3386
   if (!($18 & 2)) {
    $21 = $6 + 36 | 0; //@line 3390
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $6 + 54 | 0; //@line 3397
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 3408
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $6, $8, $10, $12); //@line 3409
      if (!___async) {
       ___async_unwind = 0; //@line 3412
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 161; //@line 3414
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 3416
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 3418
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 3420
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 3422
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $6; //@line 3424
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $8; //@line 3426
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $10; //@line 3428
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $12 & 1; //@line 3431
      sp = STACKTOP; //@line 3432
      return;
     }
     $36 = $6 + 24 | 0; //@line 3435
     $37 = $6 + 54 | 0; //@line 3436
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 3451
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $6, $8, $10, $12); //@line 3452
     if (!___async) {
      ___async_unwind = 0; //@line 3455
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 160; //@line 3457
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 3459
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $14; //@line 3461
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 3463
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 3465
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 3467
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $6; //@line 3469
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $8; //@line 3471
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $10; //@line 3473
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $12 & 1; //@line 3476
     sp = STACKTOP; //@line 3477
     return;
    }
   }
   $24 = $6 + 54 | 0; //@line 3481
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 3485
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $6, $8, $10, $12); //@line 3486
    if (!___async) {
     ___async_unwind = 0; //@line 3489
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 159; //@line 3491
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 3493
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $14; //@line 3495
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 3497
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $6; //@line 3499
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $8; //@line 3501
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $10; //@line 3503
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $12 & 1; //@line 3506
    sp = STACKTOP; //@line 3507
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9197
      $10 = HEAP32[$9 >> 2] | 0; //@line 9198
      HEAP32[$2 >> 2] = $9 + 4; //@line 9200
      HEAP32[$0 >> 2] = $10; //@line 9201
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9217
      $17 = HEAP32[$16 >> 2] | 0; //@line 9218
      HEAP32[$2 >> 2] = $16 + 4; //@line 9220
      $20 = $0; //@line 9223
      HEAP32[$20 >> 2] = $17; //@line 9225
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 9228
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9244
      $30 = HEAP32[$29 >> 2] | 0; //@line 9245
      HEAP32[$2 >> 2] = $29 + 4; //@line 9247
      $31 = $0; //@line 9248
      HEAP32[$31 >> 2] = $30; //@line 9250
      HEAP32[$31 + 4 >> 2] = 0; //@line 9253
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9269
      $41 = $40; //@line 9270
      $43 = HEAP32[$41 >> 2] | 0; //@line 9272
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 9275
      HEAP32[$2 >> 2] = $40 + 8; //@line 9277
      $47 = $0; //@line 9278
      HEAP32[$47 >> 2] = $43; //@line 9280
      HEAP32[$47 + 4 >> 2] = $46; //@line 9283
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9299
      $57 = HEAP32[$56 >> 2] | 0; //@line 9300
      HEAP32[$2 >> 2] = $56 + 4; //@line 9302
      $59 = ($57 & 65535) << 16 >> 16; //@line 9304
      $62 = $0; //@line 9307
      HEAP32[$62 >> 2] = $59; //@line 9309
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 9312
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9328
      $72 = HEAP32[$71 >> 2] | 0; //@line 9329
      HEAP32[$2 >> 2] = $71 + 4; //@line 9331
      $73 = $0; //@line 9333
      HEAP32[$73 >> 2] = $72 & 65535; //@line 9335
      HEAP32[$73 + 4 >> 2] = 0; //@line 9338
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9354
      $83 = HEAP32[$82 >> 2] | 0; //@line 9355
      HEAP32[$2 >> 2] = $82 + 4; //@line 9357
      $85 = ($83 & 255) << 24 >> 24; //@line 9359
      $88 = $0; //@line 9362
      HEAP32[$88 >> 2] = $85; //@line 9364
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 9367
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9383
      $98 = HEAP32[$97 >> 2] | 0; //@line 9384
      HEAP32[$2 >> 2] = $97 + 4; //@line 9386
      $99 = $0; //@line 9388
      HEAP32[$99 >> 2] = $98 & 255; //@line 9390
      HEAP32[$99 + 4 >> 2] = 0; //@line 9393
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9409
      $109 = +HEAPF64[$108 >> 3]; //@line 9410
      HEAP32[$2 >> 2] = $108 + 8; //@line 9412
      HEAPF64[$0 >> 3] = $109; //@line 9413
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 9429
      $116 = +HEAPF64[$115 >> 3]; //@line 9430
      HEAP32[$2 >> 2] = $115 + 8; //@line 9432
      HEAPF64[$0 >> 3] = $116; //@line 9433
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
 sp = STACKTOP; //@line 8097
 STACKTOP = STACKTOP + 224 | 0; //@line 8098
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 8098
 $3 = sp + 120 | 0; //@line 8099
 $4 = sp + 80 | 0; //@line 8100
 $5 = sp; //@line 8101
 $6 = sp + 136 | 0; //@line 8102
 dest = $4; //@line 8103
 stop = dest + 40 | 0; //@line 8103
 do {
  HEAP32[dest >> 2] = 0; //@line 8103
  dest = dest + 4 | 0; //@line 8103
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 8105
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 8109
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 8116
  } else {
   $43 = 0; //@line 8118
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 8120
  $14 = $13 & 32; //@line 8121
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 8127
  }
  $19 = $0 + 48 | 0; //@line 8129
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 8134
    $24 = HEAP32[$23 >> 2] | 0; //@line 8135
    HEAP32[$23 >> 2] = $6; //@line 8136
    $25 = $0 + 28 | 0; //@line 8137
    HEAP32[$25 >> 2] = $6; //@line 8138
    $26 = $0 + 20 | 0; //@line 8139
    HEAP32[$26 >> 2] = $6; //@line 8140
    HEAP32[$19 >> 2] = 80; //@line 8141
    $28 = $0 + 16 | 0; //@line 8143
    HEAP32[$28 >> 2] = $6 + 80; //@line 8144
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 8145
    if (!$24) {
     $$1 = $29; //@line 8148
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 8151
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 8152
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 8153
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 135; //@line 8156
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 8158
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 8160
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 8162
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 8164
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 8166
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 8168
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 8170
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 8172
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 8174
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 8176
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 8178
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 8180
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 8182
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 8184
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 8186
      sp = STACKTOP; //@line 8187
      STACKTOP = sp; //@line 8188
      return 0; //@line 8188
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 8190
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 8193
      HEAP32[$23 >> 2] = $24; //@line 8194
      HEAP32[$19 >> 2] = 0; //@line 8195
      HEAP32[$28 >> 2] = 0; //@line 8196
      HEAP32[$25 >> 2] = 0; //@line 8197
      HEAP32[$26 >> 2] = 0; //@line 8198
      $$1 = $$; //@line 8199
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 8205
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 8208
  HEAP32[$0 >> 2] = $51 | $14; //@line 8213
  if ($43 | 0) {
   ___unlockfile($0); //@line 8216
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 8218
 }
 STACKTOP = sp; //@line 8220
 return $$0 | 0; //@line 8220
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12273
 STACKTOP = STACKTOP + 64 | 0; //@line 12274
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 12274
 $4 = sp; //@line 12275
 $5 = HEAP32[$0 >> 2] | 0; //@line 12276
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 12279
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 12281
 HEAP32[$4 >> 2] = $2; //@line 12282
 HEAP32[$4 + 4 >> 2] = $0; //@line 12284
 HEAP32[$4 + 8 >> 2] = $1; //@line 12286
 HEAP32[$4 + 12 >> 2] = $3; //@line 12288
 $14 = $4 + 16 | 0; //@line 12289
 $15 = $4 + 20 | 0; //@line 12290
 $16 = $4 + 24 | 0; //@line 12291
 $17 = $4 + 28 | 0; //@line 12292
 $18 = $4 + 32 | 0; //@line 12293
 $19 = $4 + 40 | 0; //@line 12294
 dest = $14; //@line 12295
 stop = dest + 36 | 0; //@line 12295
 do {
  HEAP32[dest >> 2] = 0; //@line 12295
  dest = dest + 4 | 0; //@line 12295
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 12295
 HEAP8[$14 + 38 >> 0] = 0; //@line 12295
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 12300
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 12303
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 12304
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 12305
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 147; //@line 12308
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 12310
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 12312
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 12314
    sp = STACKTOP; //@line 12315
    STACKTOP = sp; //@line 12316
    return 0; //@line 12316
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12318
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 12322
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 12326
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 12329
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 12330
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 12331
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 148; //@line 12334
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 12336
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 12338
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 12340
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 12342
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 12344
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 12346
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 12348
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 12350
    sp = STACKTOP; //@line 12351
    STACKTOP = sp; //@line 12352
    return 0; //@line 12352
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12354
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 12368
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 12376
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 12392
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 12397
  }
 } while (0);
 STACKTOP = sp; //@line 12400
 return $$0 | 0; //@line 12400
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 7969
 $7 = ($2 | 0) != 0; //@line 7973
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 7977
   $$03555 = $0; //@line 7978
   $$03654 = $2; //@line 7978
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 7983
     $$036$lcssa64 = $$03654; //@line 7983
     label = 6; //@line 7984
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 7987
    $12 = $$03654 + -1 | 0; //@line 7988
    $16 = ($12 | 0) != 0; //@line 7992
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 7995
     $$03654 = $12; //@line 7995
    } else {
     $$035$lcssa = $11; //@line 7997
     $$036$lcssa = $12; //@line 7997
     $$lcssa = $16; //@line 7997
     label = 5; //@line 7998
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 8003
   $$036$lcssa = $2; //@line 8003
   $$lcssa = $7; //@line 8003
   label = 5; //@line 8004
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 8009
   $$036$lcssa64 = $$036$lcssa; //@line 8009
   label = 6; //@line 8010
  } else {
   $$2 = $$035$lcssa; //@line 8012
   $$3 = 0; //@line 8012
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 8018
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 8021
    $$3 = $$036$lcssa64; //@line 8021
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 8023
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 8027
      $$13745 = $$036$lcssa64; //@line 8027
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 8030
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 8039
       $30 = $$13745 + -4 | 0; //@line 8040
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 8043
        $$13745 = $30; //@line 8043
       } else {
        $$0$lcssa = $29; //@line 8045
        $$137$lcssa = $30; //@line 8045
        label = 11; //@line 8046
        break L11;
       }
      }
      $$140 = $$046; //@line 8050
      $$23839 = $$13745; //@line 8050
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 8052
      $$137$lcssa = $$036$lcssa64; //@line 8052
      label = 11; //@line 8053
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 8059
      $$3 = 0; //@line 8059
      break;
     } else {
      $$140 = $$0$lcssa; //@line 8062
      $$23839 = $$137$lcssa; //@line 8062
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 8069
      $$3 = $$23839; //@line 8069
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 8072
     $$23839 = $$23839 + -1 | 0; //@line 8073
     if (!$$23839) {
      $$2 = $35; //@line 8076
      $$3 = 0; //@line 8076
      break;
     } else {
      $$140 = $35; //@line 8079
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 8087
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 7740
 do {
  if (!$0) {
   do {
    if (!(HEAP32[179] | 0)) {
     $34 = 0; //@line 7748
    } else {
     $12 = HEAP32[179] | 0; //@line 7750
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7751
     $13 = _fflush($12) | 0; //@line 7752
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 131; //@line 7755
      sp = STACKTOP; //@line 7756
      return 0; //@line 7757
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 7759
      $34 = $13; //@line 7760
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 7766
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 7770
    } else {
     $$02327 = $$02325; //@line 7772
     $$02426 = $34; //@line 7772
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 7779
      } else {
       $28 = 0; //@line 7781
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 7789
       $25 = ___fflush_unlocked($$02327) | 0; //@line 7790
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 7795
       $$1 = $25 | $$02426; //@line 7797
      } else {
       $$1 = $$02426; //@line 7799
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 7803
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 7806
      if (!$$023) {
       $$024$lcssa = $$1; //@line 7809
       break L9;
      } else {
       $$02327 = $$023; //@line 7812
       $$02426 = $$1; //@line 7812
      }
     }
     HEAP32[$AsyncCtx >> 2] = 132; //@line 7815
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 7817
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 7819
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 7821
     sp = STACKTOP; //@line 7822
     return 0; //@line 7823
    }
   } while (0);
   ___ofl_unlock(); //@line 7826
   $$0 = $$024$lcssa; //@line 7827
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7833
    $5 = ___fflush_unlocked($0) | 0; //@line 7834
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 129; //@line 7837
     sp = STACKTOP; //@line 7838
     return 0; //@line 7839
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 7841
     $$0 = $5; //@line 7842
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 7847
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 7848
   $7 = ___fflush_unlocked($0) | 0; //@line 7849
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 130; //@line 7852
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 7855
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 7857
    sp = STACKTOP; //@line 7858
    return 0; //@line 7859
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7861
   if ($phitmp) {
    $$0 = $7; //@line 7863
   } else {
    ___unlockfile($0); //@line 7865
    $$0 = $7; //@line 7866
   }
  }
 } while (0);
 return $$0 | 0; //@line 7870
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12455
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12461
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 12467
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 12470
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12471
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 12472
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 151; //@line 12475
     sp = STACKTOP; //@line 12476
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12479
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 12487
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 12492
     $19 = $1 + 44 | 0; //@line 12493
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 12499
     HEAP8[$22 >> 0] = 0; //@line 12500
     $23 = $1 + 53 | 0; //@line 12501
     HEAP8[$23 >> 0] = 0; //@line 12502
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 12504
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 12507
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 12508
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 12509
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 150; //@line 12512
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 12514
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 12516
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 12518
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 12520
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 12522
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 12524
      sp = STACKTOP; //@line 12525
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 12528
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 12532
      label = 13; //@line 12533
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 12538
       label = 13; //@line 12539
      } else {
       $$037$off039 = 3; //@line 12541
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 12545
      $39 = $1 + 40 | 0; //@line 12546
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 12549
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 12559
        $$037$off039 = $$037$off038; //@line 12560
       } else {
        $$037$off039 = $$037$off038; //@line 12562
       }
      } else {
       $$037$off039 = $$037$off038; //@line 12565
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 12568
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 12575
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_16($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 1015
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1017
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1019
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 1022
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1024
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1026
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1028
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1030
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1032
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1034
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1036
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
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $8; //@line 1084
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $10; //@line 1086
 HEAP8[$ReallocAsyncCtx5 + 12 >> 0] = $6 & 1; //@line 1089
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $12; //@line 1091
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $14; //@line 1093
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $16; //@line 1095
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $18; //@line 1097
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $20; //@line 1099
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $2; //@line 1101
 HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $4; //@line 1103
 HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $22; //@line 1105
 HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $24; //@line 1107
 HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $26; //@line 1109
 HEAP32[$ReallocAsyncCtx5 + 56 >> 2] = $28; //@line 1111
 HEAP32[$ReallocAsyncCtx5 + 60 >> 2] = $30; //@line 1113
 HEAP32[$ReallocAsyncCtx5 + 64 >> 2] = $32; //@line 1115
 HEAP32[$ReallocAsyncCtx5 + 68 >> 2] = $34; //@line 1117
 HEAP32[$ReallocAsyncCtx5 + 72 >> 2] = $36; //@line 1119
 HEAP32[$ReallocAsyncCtx5 + 76 >> 2] = $38; //@line 1121
 HEAP32[$ReallocAsyncCtx5 + 80 >> 2] = $40; //@line 1123
 HEAP32[$ReallocAsyncCtx5 + 84 >> 2] = $42; //@line 1125
 HEAP32[$ReallocAsyncCtx5 + 88 >> 2] = $44; //@line 1127
 HEAP32[$ReallocAsyncCtx5 + 92 >> 2] = $46; //@line 1129
 HEAP32[$ReallocAsyncCtx5 + 96 >> 2] = $48; //@line 1131
 sp = STACKTOP; //@line 1132
 return;
}
function _initialize__async_cb_25($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $17 = 0, $19 = 0, $2 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $28 = 0, $29 = 0, $31 = 0, $33 = 0, $36 = 0, $4 = 0, $40 = 0, $41 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1831
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1833
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1835
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1837
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1839
 $10 = $0 + 24 | 0; //@line 1841
 $12 = HEAP32[$10 >> 2] | 0; //@line 1843
 $15 = HEAP32[$10 + 4 >> 2] | 0; //@line 1846
 $17 = HEAP32[$0 + 32 >> 2] | 0; //@line 1848
 $19 = HEAP32[$0 + 36 >> 2] | 0; //@line 1850
 $21 = HEAP32[$2 >> 2] | 0; //@line 1853
 $22 = $21 + 32 | 0; //@line 1854
 HEAP32[$22 >> 2] = HEAP32[___async_retval >> 2]; //@line 1855
 $23 = $21 + 40 | 0; //@line 1856
 $24 = $23; //@line 1857
 HEAP32[$24 >> 2] = 0; //@line 1859
 HEAP32[$24 + 4 >> 2] = 0; //@line 1862
 $28 = $21 + 8 | 0; //@line 1863
 HEAP32[$28 >> 2] = $4; //@line 1864
 $29 = _bitshift64Shl(1, 0, $6 | 0) | 0; //@line 1865
 $31 = _i64Add($29 | 0, tempRet0 | 0, -1, 0) | 0; //@line 1867
 $33 = $21 + 12 | 0; //@line 1869
 HEAP32[$33 >> 2] = $31; //@line 1870
 HEAP32[$21 + 16 >> 2] = $8; //@line 1872
 $36 = $21 + 24 | 0; //@line 1874
 HEAP32[$36 >> 2] = $12; //@line 1876
 HEAP32[$36 + 4 >> 2] = $15; //@line 1879
 $40 = $21 + 48 | 0; //@line 1880
 $41 = $40; //@line 1881
 HEAP32[$41 >> 2] = 0; //@line 1883
 HEAP32[$41 + 4 >> 2] = 0; //@line 1886
 HEAP8[$21 + 56 >> 0] = 1; //@line 1888
 $48 = HEAP32[(HEAP32[$17 >> 2] | 0) + 4 >> 2] | 0; //@line 1891
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(32) | 0; //@line 1892
 $49 = FUNCTION_TABLE_i[$48 & 3]() | 0; //@line 1893
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 65; //@line 1896
  $50 = $ReallocAsyncCtx4 + 4 | 0; //@line 1897
  HEAP32[$50 >> 2] = $2; //@line 1898
  $51 = $ReallocAsyncCtx4 + 8 | 0; //@line 1899
  HEAP32[$51 >> 2] = $19; //@line 1900
  $52 = $ReallocAsyncCtx4 + 12 | 0; //@line 1901
  HEAP32[$52 >> 2] = $22; //@line 1902
  $53 = $ReallocAsyncCtx4 + 16 | 0; //@line 1903
  HEAP32[$53 >> 2] = $33; //@line 1904
  $54 = $ReallocAsyncCtx4 + 20 | 0; //@line 1905
  HEAP32[$54 >> 2] = $28; //@line 1906
  $55 = $ReallocAsyncCtx4 + 24 | 0; //@line 1907
  HEAP32[$55 >> 2] = $23; //@line 1908
  $56 = $ReallocAsyncCtx4 + 28 | 0; //@line 1909
  HEAP32[$56 >> 2] = $40; //@line 1910
  sp = STACKTOP; //@line 1911
  return;
 }
 HEAP32[___async_retval >> 2] = $49; //@line 1915
 ___async_unwind = 0; //@line 1916
 HEAP32[$ReallocAsyncCtx4 >> 2] = 65; //@line 1917
 $50 = $ReallocAsyncCtx4 + 4 | 0; //@line 1918
 HEAP32[$50 >> 2] = $2; //@line 1919
 $51 = $ReallocAsyncCtx4 + 8 | 0; //@line 1920
 HEAP32[$51 >> 2] = $19; //@line 1921
 $52 = $ReallocAsyncCtx4 + 12 | 0; //@line 1922
 HEAP32[$52 >> 2] = $22; //@line 1923
 $53 = $ReallocAsyncCtx4 + 16 | 0; //@line 1924
 HEAP32[$53 >> 2] = $33; //@line 1925
 $54 = $ReallocAsyncCtx4 + 20 | 0; //@line 1926
 HEAP32[$54 >> 2] = $28; //@line 1927
 $55 = $ReallocAsyncCtx4 + 24 | 0; //@line 1928
 HEAP32[$55 >> 2] = $23; //@line 1929
 $56 = $ReallocAsyncCtx4 + 28 | 0; //@line 1930
 HEAP32[$56 >> 2] = $40; //@line 1931
 sp = STACKTOP; //@line 1932
 return;
}
function _mbed_vtracef__async_cb_15($0) {
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
   $21 = HEAP32[90] | 0; //@line 932
   if (!(($19 | 0) > 0 & ($21 | 0) != 0)) {
    if (($$13 | 0) < 1 | ($19 | 0) < 1 | $6 ^ 1) {
     break;
    }
    _snprintf($18, $19, 1746, $8) | 0; //@line 944
    break;
   }
   $ReallocAsyncCtx6 = _emscripten_realloc_async_context(32) | 0; //@line 947
   $23 = FUNCTION_TABLE_i[$21 & 3]() | 0; //@line 948
   if (___async) {
    HEAP32[$ReallocAsyncCtx6 >> 2] = 54; //@line 951
    $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 952
    HEAP32[$24 >> 2] = $2; //@line 953
    $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 954
    HEAP32[$25 >> 2] = $18; //@line 955
    $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 956
    HEAP32[$26 >> 2] = $19; //@line 957
    $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 958
    HEAP32[$27 >> 2] = $4; //@line 959
    $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 960
    $$expand_i1_val = $6 & 1; //@line 961
    HEAP8[$28 >> 0] = $$expand_i1_val; //@line 962
    $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 963
    HEAP32[$29 >> 2] = $8; //@line 964
    $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 965
    HEAP32[$30 >> 2] = $10; //@line 966
    sp = STACKTOP; //@line 967
    return;
   }
   HEAP32[___async_retval >> 2] = $23; //@line 971
   ___async_unwind = 0; //@line 972
   HEAP32[$ReallocAsyncCtx6 >> 2] = 54; //@line 973
   $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 974
   HEAP32[$24 >> 2] = $2; //@line 975
   $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 976
   HEAP32[$25 >> 2] = $18; //@line 977
   $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 978
   HEAP32[$26 >> 2] = $19; //@line 979
   $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 980
   HEAP32[$27 >> 2] = $4; //@line 981
   $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 982
   $$expand_i1_val = $6 & 1; //@line 983
   HEAP8[$28 >> 0] = $$expand_i1_val; //@line 984
   $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 985
   HEAP32[$29 >> 2] = $8; //@line 986
   $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 987
   HEAP32[$30 >> 2] = $10; //@line 988
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
 sp = STACKTOP; //@line 11767
 STACKTOP = STACKTOP + 48 | 0; //@line 11768
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 11768
 $vararg_buffer10 = sp + 32 | 0; //@line 11769
 $vararg_buffer7 = sp + 24 | 0; //@line 11770
 $vararg_buffer3 = sp + 16 | 0; //@line 11771
 $vararg_buffer = sp; //@line 11772
 $0 = sp + 36 | 0; //@line 11773
 $1 = ___cxa_get_globals_fast() | 0; //@line 11774
 if ($1 | 0) {
  $3 = HEAP32[$1 >> 2] | 0; //@line 11777
  if ($3 | 0) {
   $7 = $3 + 48 | 0; //@line 11782
   $9 = HEAP32[$7 >> 2] | 0; //@line 11784
   $12 = HEAP32[$7 + 4 >> 2] | 0; //@line 11787
   if (!(($9 & -256 | 0) == 1126902528 & ($12 | 0) == 1129074247)) {
    HEAP32[$vararg_buffer7 >> 2] = 5145; //@line 11793
    _abort_message(5095, $vararg_buffer7); //@line 11794
   }
   if (($9 | 0) == 1126902529 & ($12 | 0) == 1129074247) {
    $22 = HEAP32[$3 + 44 >> 2] | 0; //@line 11803
   } else {
    $22 = $3 + 80 | 0; //@line 11805
   }
   HEAP32[$0 >> 2] = $22; //@line 11807
   $23 = HEAP32[$3 >> 2] | 0; //@line 11808
   $25 = HEAP32[$23 + 4 >> 2] | 0; //@line 11810
   $28 = HEAP32[(HEAP32[38] | 0) + 16 >> 2] | 0; //@line 11813
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 11814
   $29 = FUNCTION_TABLE_iiii[$28 & 7](152, $23, $0) | 0; //@line 11815
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 141; //@line 11818
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 11820
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 11822
    HEAP32[$AsyncCtx + 12 >> 2] = $25; //@line 11824
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 11826
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 11828
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 11830
    sp = STACKTOP; //@line 11831
    STACKTOP = sp; //@line 11832
    return;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 11834
   if (!$29) {
    HEAP32[$vararg_buffer3 >> 2] = 5145; //@line 11836
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 11838
    _abort_message(5054, $vararg_buffer3); //@line 11839
   }
   $36 = HEAP32[$0 >> 2] | 0; //@line 11842
   $39 = HEAP32[(HEAP32[$36 >> 2] | 0) + 8 >> 2] | 0; //@line 11845
   $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 11846
   $40 = FUNCTION_TABLE_ii[$39 & 1]($36) | 0; //@line 11847
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 142; //@line 11850
    HEAP32[$AsyncCtx14 + 4 >> 2] = $vararg_buffer; //@line 11852
    HEAP32[$AsyncCtx14 + 8 >> 2] = $25; //@line 11854
    HEAP32[$AsyncCtx14 + 12 >> 2] = $vararg_buffer; //@line 11856
    sp = STACKTOP; //@line 11857
    STACKTOP = sp; //@line 11858
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 11860
    HEAP32[$vararg_buffer >> 2] = 5145; //@line 11861
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 11863
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 11865
    _abort_message(5009, $vararg_buffer); //@line 11866
   }
  }
 }
 _abort_message(5133, $vararg_buffer10); //@line 11871
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_62($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $37 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4789
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4791
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4793
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4795
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4797
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4799
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4801
 $14 = $0 + 32 | 0; //@line 4803
 $16 = HEAP32[$14 >> 2] | 0; //@line 4805
 $19 = HEAP32[$14 + 4 >> 2] | 0; //@line 4808
 $20 = HEAP32[$2 >> 2] | 0; //@line 4809
 if ($20 | 0) {
  $23 = HEAP32[$20 + 4 >> 2] | 0; //@line 4813
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 4814
  FUNCTION_TABLE_vii[$23 & 3]($6, $8); //@line 4815
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 124; //@line 4818
   $24 = $ReallocAsyncCtx3 + 4 | 0; //@line 4819
   HEAP32[$24 >> 2] = $10; //@line 4820
   $25 = $ReallocAsyncCtx3 + 8 | 0; //@line 4821
   HEAP32[$25 >> 2] = $4; //@line 4822
   $26 = $ReallocAsyncCtx3 + 12 | 0; //@line 4823
   HEAP32[$26 >> 2] = $12; //@line 4824
   $27 = $ReallocAsyncCtx3 + 16 | 0; //@line 4825
   $28 = $27; //@line 4826
   $29 = $28; //@line 4827
   HEAP32[$29 >> 2] = $16; //@line 4828
   $30 = $28 + 4 | 0; //@line 4829
   $31 = $30; //@line 4830
   HEAP32[$31 >> 2] = $19; //@line 4831
   $32 = $ReallocAsyncCtx3 + 24 | 0; //@line 4832
   HEAP32[$32 >> 2] = $2; //@line 4833
   $33 = $ReallocAsyncCtx3 + 28 | 0; //@line 4834
   HEAP32[$33 >> 2] = $8; //@line 4835
   sp = STACKTOP; //@line 4836
   return;
  }
  ___async_unwind = 0; //@line 4839
  HEAP32[$ReallocAsyncCtx3 >> 2] = 124; //@line 4840
  $24 = $ReallocAsyncCtx3 + 4 | 0; //@line 4841
  HEAP32[$24 >> 2] = $10; //@line 4842
  $25 = $ReallocAsyncCtx3 + 8 | 0; //@line 4843
  HEAP32[$25 >> 2] = $4; //@line 4844
  $26 = $ReallocAsyncCtx3 + 12 | 0; //@line 4845
  HEAP32[$26 >> 2] = $12; //@line 4846
  $27 = $ReallocAsyncCtx3 + 16 | 0; //@line 4847
  $28 = $27; //@line 4848
  $29 = $28; //@line 4849
  HEAP32[$29 >> 2] = $16; //@line 4850
  $30 = $28 + 4 | 0; //@line 4851
  $31 = $30; //@line 4852
  HEAP32[$31 >> 2] = $19; //@line 4853
  $32 = $ReallocAsyncCtx3 + 24 | 0; //@line 4854
  HEAP32[$32 >> 2] = $2; //@line 4855
  $33 = $ReallocAsyncCtx3 + 28 | 0; //@line 4856
  HEAP32[$33 >> 2] = $8; //@line 4857
  sp = STACKTOP; //@line 4858
  return;
 }
 HEAP32[$4 >> 2] = 0; //@line 4861
 __ZN4mbed6Ticker5setupEy($12, $16, $19); //@line 4862
 $34 = HEAP32[$2 >> 2] | 0; //@line 4863
 if (!$34) {
  return;
 }
 $37 = HEAP32[$34 + 8 >> 2] | 0; //@line 4869
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 4870
 FUNCTION_TABLE_vi[$37 & 255]($8); //@line 4871
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 125; //@line 4874
  sp = STACKTOP; //@line 4875
  return;
 }
 ___async_unwind = 0; //@line 4878
 HEAP32[$ReallocAsyncCtx4 >> 2] = 125; //@line 4879
 sp = STACKTOP; //@line 4880
 return;
}
function _mbed_error_vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1419
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1421
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1423
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1425
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[1445] | 0)) {
  _serial_init(5784, 2, 3); //@line 1433
 }
 $9 = HEAP8[$4 >> 0] | 0; //@line 1435
 if (0 == 13 | $9 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 1441
  _serial_putc(5784, $9 << 24 >> 24); //@line 1442
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 1445
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 1446
   HEAP32[$18 >> 2] = 0; //@line 1447
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 1448
   HEAP32[$19 >> 2] = $AsyncRetVal; //@line 1449
   $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 1450
   HEAP32[$20 >> 2] = $2; //@line 1451
   $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 1452
   HEAP8[$21 >> 0] = $9; //@line 1453
   $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 1454
   HEAP32[$22 >> 2] = $4; //@line 1455
   sp = STACKTOP; //@line 1456
   return;
  }
  ___async_unwind = 0; //@line 1459
  HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 1460
  $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 1461
  HEAP32[$18 >> 2] = 0; //@line 1462
  $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 1463
  HEAP32[$19 >> 2] = $AsyncRetVal; //@line 1464
  $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 1465
  HEAP32[$20 >> 2] = $2; //@line 1466
  $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 1467
  HEAP8[$21 >> 0] = $9; //@line 1468
  $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 1469
  HEAP32[$22 >> 2] = $4; //@line 1470
  sp = STACKTOP; //@line 1471
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 1474
  _serial_putc(5784, 13); //@line 1475
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 94; //@line 1478
   $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 1479
   HEAP8[$12 >> 0] = $9; //@line 1480
   $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 1481
   HEAP32[$13 >> 2] = 0; //@line 1482
   $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 1483
   HEAP32[$14 >> 2] = $AsyncRetVal; //@line 1484
   $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 1485
   HEAP32[$15 >> 2] = $2; //@line 1486
   $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 1487
   HEAP32[$16 >> 2] = $4; //@line 1488
   sp = STACKTOP; //@line 1489
   return;
  }
  ___async_unwind = 0; //@line 1492
  HEAP32[$ReallocAsyncCtx3 >> 2] = 94; //@line 1493
  $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 1494
  HEAP8[$12 >> 0] = $9; //@line 1495
  $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 1496
  HEAP32[$13 >> 2] = 0; //@line 1497
  $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 1498
  HEAP32[$14 >> 2] = $AsyncRetVal; //@line 1499
  $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 1500
  HEAP32[$15 >> 2] = $2; //@line 1501
  $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 1502
  HEAP32[$16 >> 2] = $4; //@line 1503
  sp = STACKTOP; //@line 1504
  return;
 }
}
function _mbed_error_vfprintf__async_cb_22($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1512
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1516
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1518
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1522
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 1523
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP8[$10 + $12 >> 0] | 0; //@line 1529
 if ((HEAP8[$0 + 16 >> 0] | 0) == 13 | $13 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 1535
  _serial_putc(5784, $13 << 24 >> 24); //@line 1536
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 1539
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 1540
   HEAP32[$22 >> 2] = $12; //@line 1541
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 1542
   HEAP32[$23 >> 2] = $4; //@line 1543
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 1544
   HEAP32[$24 >> 2] = $6; //@line 1545
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 1546
   HEAP8[$25 >> 0] = $13; //@line 1547
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 1548
   HEAP32[$26 >> 2] = $10; //@line 1549
   sp = STACKTOP; //@line 1550
   return;
  }
  ___async_unwind = 0; //@line 1553
  HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 1554
  $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 1555
  HEAP32[$22 >> 2] = $12; //@line 1556
  $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 1557
  HEAP32[$23 >> 2] = $4; //@line 1558
  $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 1559
  HEAP32[$24 >> 2] = $6; //@line 1560
  $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 1561
  HEAP8[$25 >> 0] = $13; //@line 1562
  $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 1563
  HEAP32[$26 >> 2] = $10; //@line 1564
  sp = STACKTOP; //@line 1565
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 1568
  _serial_putc(5784, 13); //@line 1569
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 94; //@line 1572
   $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 1573
   HEAP8[$16 >> 0] = $13; //@line 1574
   $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 1575
   HEAP32[$17 >> 2] = $12; //@line 1576
   $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 1577
   HEAP32[$18 >> 2] = $4; //@line 1578
   $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 1579
   HEAP32[$19 >> 2] = $6; //@line 1580
   $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 1581
   HEAP32[$20 >> 2] = $10; //@line 1582
   sp = STACKTOP; //@line 1583
   return;
  }
  ___async_unwind = 0; //@line 1586
  HEAP32[$ReallocAsyncCtx3 >> 2] = 94; //@line 1587
  $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 1588
  HEAP8[$16 >> 0] = $13; //@line 1589
  $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 1590
  HEAP32[$17 >> 2] = $12; //@line 1591
  $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 1592
  HEAP32[$18 >> 2] = $4; //@line 1593
  $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 1594
  HEAP32[$19 >> 2] = $6; //@line 1595
  $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 1596
  HEAP32[$20 >> 2] = $10; //@line 1597
  sp = STACKTOP; //@line 1598
  return;
 }
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6781
 STACKTOP = STACKTOP + 48 | 0; //@line 6782
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 6782
 $vararg_buffer3 = sp + 16 | 0; //@line 6783
 $vararg_buffer = sp; //@line 6784
 $3 = sp + 32 | 0; //@line 6785
 $4 = $0 + 28 | 0; //@line 6786
 $5 = HEAP32[$4 >> 2] | 0; //@line 6787
 HEAP32[$3 >> 2] = $5; //@line 6788
 $7 = $0 + 20 | 0; //@line 6790
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 6792
 HEAP32[$3 + 4 >> 2] = $9; //@line 6793
 HEAP32[$3 + 8 >> 2] = $1; //@line 6795
 HEAP32[$3 + 12 >> 2] = $2; //@line 6797
 $12 = $9 + $2 | 0; //@line 6798
 $13 = $0 + 60 | 0; //@line 6799
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 6802
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 6804
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 6806
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 6808
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 6812
  } else {
   $$04756 = 2; //@line 6814
   $$04855 = $12; //@line 6814
   $$04954 = $3; //@line 6814
   $27 = $17; //@line 6814
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 6820
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 6822
    $38 = $27 >>> 0 > $37 >>> 0; //@line 6823
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 6825
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 6827
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 6829
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 6832
    $44 = $$150 + 4 | 0; //@line 6833
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 6836
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 6839
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 6841
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 6843
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 6845
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 6848
     break L1;
    } else {
     $$04756 = $$1; //@line 6851
     $$04954 = $$150; //@line 6851
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 6855
   HEAP32[$4 >> 2] = 0; //@line 6856
   HEAP32[$7 >> 2] = 0; //@line 6857
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 6860
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 6863
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 6868
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 6874
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 6879
  $25 = $20; //@line 6880
  HEAP32[$4 >> 2] = $25; //@line 6881
  HEAP32[$7 >> 2] = $25; //@line 6882
  $$051 = $2; //@line 6883
 }
 STACKTOP = sp; //@line 6885
 return $$051 | 0; //@line 6885
}
function _initialize__async_cb_28($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $15 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2117
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2119
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2121
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2123
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2125
 $10 = 7 << 32 + -4; //@line 2127
 $11 = ___muldi3($10 | 0, 0, 1e6, 0) | 0; //@line 2128
 $12 = tempRet0; //@line 2129
 $13 = _i64Add($2 | 0, 0, -1, -1) | 0; //@line 2130
 $15 = _i64Add($13 | 0, tempRet0 | 0, $11 | 0, $12 | 0) | 0; //@line 2132
 $17 = ___udivdi3($15 | 0, tempRet0 | 0, $2 | 0, 0) | 0; //@line 2134
 $18 = tempRet0; //@line 2135
 $19 = HEAP32[$4 >> 2] | 0; //@line 2136
 HEAP32[$19 >> 2] = 0; //@line 2137
 HEAP32[$19 + 4 >> 2] = 0; //@line 2139
 $23 = HEAP32[(HEAP32[$6 >> 2] | 0) + 4 >> 2] | 0; //@line 2142
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(40) | 0; //@line 2143
 $24 = FUNCTION_TABLE_i[$23 & 3]() | 0; //@line 2144
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 2147
  $25 = $ReallocAsyncCtx3 + 4 | 0; //@line 2148
  HEAP32[$25 >> 2] = $4; //@line 2149
  $26 = $ReallocAsyncCtx3 + 8 | 0; //@line 2150
  HEAP32[$26 >> 2] = $2; //@line 2151
  $27 = $ReallocAsyncCtx3 + 12 | 0; //@line 2152
  HEAP32[$27 >> 2] = 32; //@line 2153
  $28 = $ReallocAsyncCtx3 + 16 | 0; //@line 2154
  HEAP32[$28 >> 2] = $10; //@line 2155
  $29 = $ReallocAsyncCtx3 + 24 | 0; //@line 2156
  $30 = $29; //@line 2157
  $31 = $30; //@line 2158
  HEAP32[$31 >> 2] = $17; //@line 2159
  $32 = $30 + 4 | 0; //@line 2160
  $33 = $32; //@line 2161
  HEAP32[$33 >> 2] = $18; //@line 2162
  $34 = $ReallocAsyncCtx3 + 32 | 0; //@line 2163
  HEAP32[$34 >> 2] = $6; //@line 2164
  $35 = $ReallocAsyncCtx3 + 36 | 0; //@line 2165
  HEAP32[$35 >> 2] = $8; //@line 2166
  sp = STACKTOP; //@line 2167
  return;
 }
 HEAP32[___async_retval >> 2] = $24; //@line 2171
 ___async_unwind = 0; //@line 2172
 HEAP32[$ReallocAsyncCtx3 >> 2] = 64; //@line 2173
 $25 = $ReallocAsyncCtx3 + 4 | 0; //@line 2174
 HEAP32[$25 >> 2] = $4; //@line 2175
 $26 = $ReallocAsyncCtx3 + 8 | 0; //@line 2176
 HEAP32[$26 >> 2] = $2; //@line 2177
 $27 = $ReallocAsyncCtx3 + 12 | 0; //@line 2178
 HEAP32[$27 >> 2] = 32; //@line 2179
 $28 = $ReallocAsyncCtx3 + 16 | 0; //@line 2180
 HEAP32[$28 >> 2] = $10; //@line 2181
 $29 = $ReallocAsyncCtx3 + 24 | 0; //@line 2182
 $30 = $29; //@line 2183
 $31 = $30; //@line 2184
 HEAP32[$31 >> 2] = $17; //@line 2185
 $32 = $30 + 4 | 0; //@line 2186
 $33 = $32; //@line 2187
 HEAP32[$33 >> 2] = $18; //@line 2188
 $34 = $ReallocAsyncCtx3 + 32 | 0; //@line 2189
 HEAP32[$34 >> 2] = $6; //@line 2190
 $35 = $ReallocAsyncCtx3 + 36 | 0; //@line 2191
 HEAP32[$35 >> 2] = $8; //@line 2192
 sp = STACKTOP; //@line 2193
 return;
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
 sp = STACKTOP; //@line 2686
 STACKTOP = STACKTOP + 128 | 0; //@line 2687
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 2687
 $2 = sp; //@line 2688
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 2689
 $3 = _vsnprintf($2, 128, $0, $1) | 0; //@line 2690
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 93; //@line 2693
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 2695
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 2697
  sp = STACKTOP; //@line 2698
  STACKTOP = sp; //@line 2699
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2701
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 2704
  return;
 }
 if (!(HEAP32[1445] | 0)) {
  _serial_init(5784, 2, 3); //@line 2709
  $$01213 = 0; //@line 2710
  $$014 = 0; //@line 2710
 } else {
  $$01213 = 0; //@line 2712
  $$014 = 0; //@line 2712
 }
 while (1) {
  $$01213$looptemp = $$01213;
  $$01213 = HEAP8[$2 + $$014 >> 0] | 0; //@line 2716
  if (!($$01213$looptemp << 24 >> 24 == 13 | $$01213 << 24 >> 24 != 10)) {
   $AsyncCtx7 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2721
   _serial_putc(5784, 13); //@line 2722
   if (___async) {
    label = 8; //@line 2725
    break;
   }
   _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2728
  }
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2731
  _serial_putc(5784, $$01213 << 24 >> 24); //@line 2732
  if (___async) {
   label = 11; //@line 2735
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2738
  $24 = $$014 + 1 | 0; //@line 2739
  if (($24 | 0) == ($3 | 0)) {
   label = 13; //@line 2742
   break;
  } else {
   $$014 = $24; //@line 2745
  }
 }
 if ((label | 0) == 8) {
  HEAP32[$AsyncCtx7 >> 2] = 94; //@line 2749
  HEAP8[$AsyncCtx7 + 4 >> 0] = $$01213; //@line 2751
  HEAP32[$AsyncCtx7 + 8 >> 2] = $$014; //@line 2753
  HEAP32[$AsyncCtx7 + 12 >> 2] = $3; //@line 2755
  HEAP32[$AsyncCtx7 + 16 >> 2] = $2; //@line 2757
  HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 2759
  sp = STACKTOP; //@line 2760
  STACKTOP = sp; //@line 2761
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx3 >> 2] = 95; //@line 2764
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$014; //@line 2766
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 2768
  HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 2770
  HEAP8[$AsyncCtx3 + 16 >> 0] = $$01213; //@line 2772
  HEAP32[$AsyncCtx3 + 20 >> 2] = $2; //@line 2774
  sp = STACKTOP; //@line 2775
  STACKTOP = sp; //@line 2776
  return;
 } else if ((label | 0) == 13) {
  STACKTOP = sp; //@line 2779
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_30($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2437
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2441
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2443
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 2445
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2447
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 2449
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2451
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2453
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2455
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2457
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 2460
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 2462
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 2466
   $27 = $6 + 24 | 0; //@line 2467
   $28 = $4 + 8 | 0; //@line 2468
   $29 = $6 + 54 | 0; //@line 2469
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
    HEAP8[$10 >> 0] = 0; //@line 2499
    HEAP8[$14 >> 0] = 0; //@line 2500
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 2501
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 2502
    if (!___async) {
     ___async_unwind = 0; //@line 2505
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 156; //@line 2507
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 2509
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 2511
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 2513
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 2515
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 2517
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 2519
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 2521
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 2523
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 2525
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 2527
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 2529
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 2531
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 2533
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 2536
    sp = STACKTOP; //@line 2537
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 2542
 HEAP8[$14 >> 0] = $12; //@line 2543
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2321
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2325
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2327
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 2329
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2331
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 2333
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2335
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2337
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2339
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2341
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 2343
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 2345
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 2347
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 2350
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 2351
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
    HEAP8[$10 >> 0] = 0; //@line 2384
    HEAP8[$14 >> 0] = 0; //@line 2385
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 2386
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 2387
    if (!___async) {
     ___async_unwind = 0; //@line 2390
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 156; //@line 2392
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 2394
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 2396
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 2398
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 2400
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 2402
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 2404
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 2406
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 2408
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 2410
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 2412
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 2414
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 2416
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 2418
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 2421
    sp = STACKTOP; //@line 2422
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 2427
 HEAP8[$14 >> 0] = $12; //@line 2428
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 6064
 }
 ret = dest | 0; //@line 6067
 dest_end = dest + num | 0; //@line 6068
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 6072
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 6073
   dest = dest + 1 | 0; //@line 6074
   src = src + 1 | 0; //@line 6075
   num = num - 1 | 0; //@line 6076
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 6078
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 6079
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 6081
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 6082
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 6083
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 6084
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 6085
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 6086
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 6087
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 6088
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 6089
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 6090
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 6091
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 6092
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 6093
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 6094
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 6095
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 6096
   dest = dest + 64 | 0; //@line 6097
   src = src + 64 | 0; //@line 6098
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 6101
   dest = dest + 4 | 0; //@line 6102
   src = src + 4 | 0; //@line 6103
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 6107
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 6109
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 6110
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 6111
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 6112
   dest = dest + 4 | 0; //@line 6113
   src = src + 4 | 0; //@line 6114
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 6119
  dest = dest + 1 | 0; //@line 6120
  src = src + 1 | 0; //@line 6121
 }
 return ret | 0; //@line 6123
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 11956
 STACKTOP = STACKTOP + 64 | 0; //@line 11957
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 11957
 $3 = sp; //@line 11958
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 11961
 } else {
  if (!$1) {
   $$2 = 0; //@line 11965
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 11967
   $6 = ___dynamic_cast($1, 176, 160, 0) | 0; //@line 11968
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 145; //@line 11971
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 11973
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 11975
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 11977
    sp = STACKTOP; //@line 11978
    STACKTOP = sp; //@line 11979
    return 0; //@line 11979
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11981
   if (!$6) {
    $$2 = 0; //@line 11984
   } else {
    dest = $3 + 4 | 0; //@line 11987
    stop = dest + 52 | 0; //@line 11987
    do {
     HEAP32[dest >> 2] = 0; //@line 11987
     dest = dest + 4 | 0; //@line 11987
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 11988
    HEAP32[$3 + 8 >> 2] = $0; //@line 11990
    HEAP32[$3 + 12 >> 2] = -1; //@line 11992
    HEAP32[$3 + 48 >> 2] = 1; //@line 11994
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 11997
    $18 = HEAP32[$2 >> 2] | 0; //@line 11998
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 11999
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 12000
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 146; //@line 12003
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 12005
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 12007
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 12009
     sp = STACKTOP; //@line 12010
     STACKTOP = sp; //@line 12011
     return 0; //@line 12011
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12013
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 12020
     $$0 = 1; //@line 12021
    } else {
     $$0 = 0; //@line 12023
    }
    $$2 = $$0; //@line 12025
   }
  }
 }
 STACKTOP = sp; //@line 12029
 return $$2 | 0; //@line 12029
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 11502
 STACKTOP = STACKTOP + 128 | 0; //@line 11503
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 11503
 $4 = sp + 124 | 0; //@line 11504
 $5 = sp; //@line 11505
 dest = $5; //@line 11506
 src = 964; //@line 11506
 stop = dest + 124 | 0; //@line 11506
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 11506
  dest = dest + 4 | 0; //@line 11506
  src = src + 4 | 0; //@line 11506
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 11512
   $$015 = 1; //@line 11512
   label = 4; //@line 11513
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 11516
   $$0 = -1; //@line 11517
  }
 } else {
  $$014 = $0; //@line 11520
  $$015 = $1; //@line 11520
  label = 4; //@line 11521
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 11525
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 11527
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 11529
  $14 = $5 + 20 | 0; //@line 11530
  HEAP32[$14 >> 2] = $$014; //@line 11531
  HEAP32[$5 + 44 >> 2] = $$014; //@line 11533
  $16 = $$014 + $$$015 | 0; //@line 11534
  $17 = $5 + 16 | 0; //@line 11535
  HEAP32[$17 >> 2] = $16; //@line 11536
  HEAP32[$5 + 28 >> 2] = $16; //@line 11538
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 11539
  $19 = _vfprintf($5, $2, $3) | 0; //@line 11540
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 137; //@line 11543
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 11545
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 11547
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 11549
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 11551
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 11553
   sp = STACKTOP; //@line 11554
   STACKTOP = sp; //@line 11555
   return 0; //@line 11555
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11557
  if (!$$$015) {
   $$0 = $19; //@line 11560
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 11562
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 11567
   $$0 = $19; //@line 11568
  }
 }
 STACKTOP = sp; //@line 11571
 return $$0 | 0; //@line 11571
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13288
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 13294
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 13298
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 13299
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 13300
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 13301
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 162; //@line 13304
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 13306
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 13308
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 13310
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 13312
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 13314
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 13316
    sp = STACKTOP; //@line 13317
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13320
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 13324
    $$0 = $0 + 24 | 0; //@line 13325
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 13327
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 13328
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 13333
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 13339
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 13342
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 163; //@line 13347
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 13349
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 13351
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 13353
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 13355
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 13357
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 13359
    sp = STACKTOP; //@line 13360
    return;
   }
  }
 } while (0);
 return;
}
function _main__async_cb_40($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $16 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $4 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2938
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2942
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2944
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2946
 $9 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 2947
 if (!$9) {
  $16 = $6 + 4 | 0; //@line 2951
  HEAP32[$16 >> 2] = 0; //@line 2953
  HEAP32[$16 + 4 >> 2] = 0; //@line 2956
  HEAP32[$6 >> 2] = 8; //@line 2957
  $20 = $6 + 12 | 0; //@line 2958
  HEAP32[$20 >> 2] = 384; //@line 2959
  $ReallocAsyncCtx7 = _emscripten_realloc_async_context(16) | 0; //@line 2960
  __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5712, $6, 2.5); //@line 2961
  if (___async) {
   HEAP32[$ReallocAsyncCtx7 >> 2] = 117; //@line 2964
   $21 = $ReallocAsyncCtx7 + 4 | 0; //@line 2965
   HEAP32[$21 >> 2] = $20; //@line 2966
   $22 = $ReallocAsyncCtx7 + 8 | 0; //@line 2967
   HEAP32[$22 >> 2] = $8; //@line 2968
   $23 = $ReallocAsyncCtx7 + 12 | 0; //@line 2969
   HEAP32[$23 >> 2] = $6; //@line 2970
   sp = STACKTOP; //@line 2971
   return;
  }
  ___async_unwind = 0; //@line 2974
  HEAP32[$ReallocAsyncCtx7 >> 2] = 117; //@line 2975
  $21 = $ReallocAsyncCtx7 + 4 | 0; //@line 2976
  HEAP32[$21 >> 2] = $20; //@line 2977
  $22 = $ReallocAsyncCtx7 + 8 | 0; //@line 2978
  HEAP32[$22 >> 2] = $8; //@line 2979
  $23 = $ReallocAsyncCtx7 + 12 | 0; //@line 2980
  HEAP32[$23 >> 2] = $6; //@line 2981
  sp = STACKTOP; //@line 2982
  return;
 } else {
  $12 = HEAP32[$9 + 8 >> 2] | 0; //@line 2986
  $ReallocAsyncCtx = _emscripten_realloc_async_context(12) | 0; //@line 2987
  FUNCTION_TABLE_vi[$12 & 255]($4); //@line 2988
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 116; //@line 2991
   $13 = $ReallocAsyncCtx + 4 | 0; //@line 2992
   HEAP32[$13 >> 2] = $6; //@line 2993
   $14 = $ReallocAsyncCtx + 8 | 0; //@line 2994
   HEAP32[$14 >> 2] = $8; //@line 2995
   sp = STACKTOP; //@line 2996
   return;
  }
  ___async_unwind = 0; //@line 2999
  HEAP32[$ReallocAsyncCtx >> 2] = 116; //@line 3000
  $13 = $ReallocAsyncCtx + 4 | 0; //@line 3001
  HEAP32[$13 >> 2] = $6; //@line 3002
  $14 = $ReallocAsyncCtx + 8 | 0; //@line 3003
  HEAP32[$14 >> 2] = $8; //@line 3004
  sp = STACKTOP; //@line 3005
  return;
 }
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11598
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 11603
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 11608
  } else {
   $20 = $0 & 255; //@line 11610
   $21 = $0 & 255; //@line 11611
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 11617
   } else {
    $26 = $1 + 20 | 0; //@line 11619
    $27 = HEAP32[$26 >> 2] | 0; //@line 11620
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 11626
     HEAP8[$27 >> 0] = $20; //@line 11627
     $34 = $21; //@line 11628
    } else {
     label = 12; //@line 11630
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 11635
     $32 = ___overflow($1, $0) | 0; //@line 11636
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 139; //@line 11639
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 11641
      sp = STACKTOP; //@line 11642
      return 0; //@line 11643
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 11645
      $34 = $32; //@line 11646
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 11651
   $$0 = $34; //@line 11652
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 11657
   $8 = $0 & 255; //@line 11658
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 11664
    $14 = HEAP32[$13 >> 2] | 0; //@line 11665
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 11671
     HEAP8[$14 >> 0] = $7; //@line 11672
     $$0 = $8; //@line 11673
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 11677
   $19 = ___overflow($1, $0) | 0; //@line 11678
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 138; //@line 11681
    sp = STACKTOP; //@line 11682
    return 0; //@line 11683
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 11685
    $$0 = $19; //@line 11686
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 11691
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 7491
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 7494
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 7497
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 7500
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 7506
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 7515
     $24 = $13 >>> 2; //@line 7516
     $$090 = 0; //@line 7517
     $$094 = $7; //@line 7517
     while (1) {
      $25 = $$094 >>> 1; //@line 7519
      $26 = $$090 + $25 | 0; //@line 7520
      $27 = $26 << 1; //@line 7521
      $28 = $27 + $23 | 0; //@line 7522
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 7525
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 7529
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 7535
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 7543
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 7547
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 7553
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 7558
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 7561
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 7561
      }
     }
     $46 = $27 + $24 | 0; //@line 7564
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 7567
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 7571
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 7583
     } else {
      $$4 = 0; //@line 7585
     }
    } else {
     $$4 = 0; //@line 7588
    }
   } else {
    $$4 = 0; //@line 7591
   }
  } else {
   $$4 = 0; //@line 7594
  }
 } while (0);
 return $$4 | 0; //@line 7597
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7156
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 7161
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 7166
  } else {
   $20 = $0 & 255; //@line 7168
   $21 = $0 & 255; //@line 7169
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 7175
   } else {
    $26 = $1 + 20 | 0; //@line 7177
    $27 = HEAP32[$26 >> 2] | 0; //@line 7178
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 7184
     HEAP8[$27 >> 0] = $20; //@line 7185
     $34 = $21; //@line 7186
    } else {
     label = 12; //@line 7188
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7193
     $32 = ___overflow($1, $0) | 0; //@line 7194
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 127; //@line 7197
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 7199
      sp = STACKTOP; //@line 7200
      return 0; //@line 7201
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 7203
      $34 = $32; //@line 7204
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 7209
   $$0 = $34; //@line 7210
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 7215
   $8 = $0 & 255; //@line 7216
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 7222
    $14 = HEAP32[$13 >> 2] | 0; //@line 7223
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 7229
     HEAP8[$14 >> 0] = $7; //@line 7230
     $$0 = $8; //@line 7231
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 7235
   $19 = ___overflow($1, $0) | 0; //@line 7236
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 126; //@line 7239
    sp = STACKTOP; //@line 7240
    return 0; //@line 7241
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7243
    $$0 = $19; //@line 7244
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 7249
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7876
 $1 = $0 + 20 | 0; //@line 7877
 $3 = $0 + 28 | 0; //@line 7879
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 7885
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 7886
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 7887
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 133; //@line 7890
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 7892
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 7894
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 7896
    sp = STACKTOP; //@line 7897
    return 0; //@line 7898
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 7900
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 7904
     break;
    } else {
     label = 5; //@line 7907
     break;
    }
   }
  } else {
   label = 5; //@line 7912
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 7916
  $14 = HEAP32[$13 >> 2] | 0; //@line 7917
  $15 = $0 + 8 | 0; //@line 7918
  $16 = HEAP32[$15 >> 2] | 0; //@line 7919
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 7927
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 7928
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 7929
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 134; //@line 7932
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 7934
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 7936
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 7938
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 7940
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 7942
     sp = STACKTOP; //@line 7943
     return 0; //@line 7944
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 7946
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 7952
  HEAP32[$3 >> 2] = 0; //@line 7953
  HEAP32[$1 >> 2] = 0; //@line 7954
  HEAP32[$15 >> 2] = 0; //@line 7955
  HEAP32[$13 >> 2] = 0; //@line 7956
  $$0 = 0; //@line 7957
 }
 return $$0 | 0; //@line 7959
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
 sp = STACKTOP; //@line 2550
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2556
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2558
 $9 = (HEAP32[$0 + 8 >> 2] | 0) + 12 | 0; //@line 2560
 HEAP32[$9 >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 2561
 __ZN4mbed6Ticker6detachEv($6); //@line 2562
 $10 = HEAP32[$9 >> 2] | 0; //@line 2563
 if (!$10) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(12) | 0; //@line 2566
  _mbed_assert_internal(2173, 2178, 528); //@line 2567
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 37; //@line 2570
   $12 = $ReallocAsyncCtx4 + 4 | 0; //@line 2571
   HEAP32[$12 >> 2] = $9; //@line 2572
   $13 = $ReallocAsyncCtx4 + 8 | 0; //@line 2573
   HEAP32[$13 >> 2] = $8; //@line 2574
   sp = STACKTOP; //@line 2575
   return;
  }
  ___async_unwind = 0; //@line 2578
  HEAP32[$ReallocAsyncCtx4 >> 2] = 37; //@line 2579
  $12 = $ReallocAsyncCtx4 + 4 | 0; //@line 2580
  HEAP32[$12 >> 2] = $9; //@line 2581
  $13 = $ReallocAsyncCtx4 + 8 | 0; //@line 2582
  HEAP32[$13 >> 2] = $8; //@line 2583
  sp = STACKTOP; //@line 2584
  return;
 } else {
  $14 = HEAP32[$10 >> 2] | 0; //@line 2587
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 2588
  FUNCTION_TABLE_vi[$14 & 255]($8); //@line 2589
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 38; //@line 2592
   $15 = $ReallocAsyncCtx2 + 4 | 0; //@line 2593
   HEAP32[$15 >> 2] = $9; //@line 2594
   $16 = $ReallocAsyncCtx2 + 8 | 0; //@line 2595
   HEAP32[$16 >> 2] = $8; //@line 2596
   sp = STACKTOP; //@line 2597
   return;
  }
  ___async_unwind = 0; //@line 2600
  HEAP32[$ReallocAsyncCtx2 >> 2] = 38; //@line 2601
  $15 = $ReallocAsyncCtx2 + 4 | 0; //@line 2602
  HEAP32[$15 >> 2] = $9; //@line 2603
  $16 = $ReallocAsyncCtx2 + 8 | 0; //@line 2604
  HEAP32[$16 >> 2] = $8; //@line 2605
  sp = STACKTOP; //@line 2606
  return;
 }
}
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 7640
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 7646
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 7652
   } else {
    $7 = $1 & 255; //@line 7654
    $$03039 = $0; //@line 7655
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 7657
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 7662
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 7665
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 7670
      break;
     } else {
      $$03039 = $13; //@line 7673
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 7677
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 7678
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 7686
     $25 = $18; //@line 7686
     while (1) {
      $24 = $25 ^ $17; //@line 7688
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 7695
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 7698
      $25 = HEAP32[$31 >> 2] | 0; //@line 7699
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 7708
       break;
      } else {
       $$02936 = $31; //@line 7706
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 7713
    }
   } while (0);
   $38 = $1 & 255; //@line 7716
   $$1 = $$029$lcssa; //@line 7717
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 7719
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 7725
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 7728
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 7733
}
function _main__async_cb_39($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $13 = 0, $17 = 0, $18 = 0, $19 = 0, $4 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 2873
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2877
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2879
 $7 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 2880
 if (!$7) {
  $13 = $4 + 4 | 0; //@line 2884
  HEAP32[$13 >> 2] = 0; //@line 2886
  HEAP32[$13 + 4 >> 2] = 0; //@line 2889
  HEAP32[$4 >> 2] = 9; //@line 2890
  $17 = $4 + 12 | 0; //@line 2891
  HEAP32[$17 >> 2] = 384; //@line 2892
  $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 2893
  __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5864, $4); //@line 2894
  if (___async) {
   HEAP32[$ReallocAsyncCtx9 >> 2] = 119; //@line 2897
   $18 = $ReallocAsyncCtx9 + 4 | 0; //@line 2898
   HEAP32[$18 >> 2] = $17; //@line 2899
   $19 = $ReallocAsyncCtx9 + 8 | 0; //@line 2900
   HEAP32[$19 >> 2] = $4; //@line 2901
   sp = STACKTOP; //@line 2902
   return;
  }
  ___async_unwind = 0; //@line 2905
  HEAP32[$ReallocAsyncCtx9 >> 2] = 119; //@line 2906
  $18 = $ReallocAsyncCtx9 + 4 | 0; //@line 2907
  HEAP32[$18 >> 2] = $17; //@line 2908
  $19 = $ReallocAsyncCtx9 + 8 | 0; //@line 2909
  HEAP32[$19 >> 2] = $4; //@line 2910
  sp = STACKTOP; //@line 2911
  return;
 } else {
  $10 = HEAP32[$7 + 8 >> 2] | 0; //@line 2915
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 2916
  FUNCTION_TABLE_vi[$10 & 255]($6); //@line 2917
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 118; //@line 2920
   $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 2921
   HEAP32[$11 >> 2] = $4; //@line 2922
   sp = STACKTOP; //@line 2923
   return;
  }
  ___async_unwind = 0; //@line 2926
  HEAP32[$ReallocAsyncCtx2 >> 2] = 118; //@line 2927
  $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 2928
  HEAP32[$11 >> 2] = $4; //@line 2929
  sp = STACKTOP; //@line 2930
  return;
 }
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 7382
 $4 = HEAP32[$3 >> 2] | 0; //@line 7383
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 7390
   label = 5; //@line 7391
  } else {
   $$1 = 0; //@line 7393
  }
 } else {
  $12 = $4; //@line 7397
  label = 5; //@line 7398
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 7402
   $10 = HEAP32[$9 >> 2] | 0; //@line 7403
   $14 = $10; //@line 7406
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 7411
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 7419
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 7423
       $$141 = $0; //@line 7423
       $$143 = $1; //@line 7423
       $31 = $14; //@line 7423
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 7426
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 7433
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 7438
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 7441
      break L5;
     }
     $$139 = $$038; //@line 7447
     $$141 = $0 + $$038 | 0; //@line 7447
     $$143 = $1 - $$038 | 0; //@line 7447
     $31 = HEAP32[$9 >> 2] | 0; //@line 7447
    } else {
     $$139 = 0; //@line 7449
     $$141 = $0; //@line 7449
     $$143 = $1; //@line 7449
     $31 = $14; //@line 7449
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 7452
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 7455
   $$1 = $$139 + $$143 | 0; //@line 7457
  }
 } while (0);
 return $$1 | 0; //@line 7460
}
function __GLOBAL__sub_I_main_cpp() {
 var $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3162
 HEAP32[1448] = 0; //@line 3163
 HEAP32[1449] = 0; //@line 3163
 HEAP32[1450] = 0; //@line 3163
 HEAP32[1451] = 0; //@line 3163
 HEAP32[1452] = 0; //@line 3163
 HEAP32[1453] = 0; //@line 3163
 _gpio_init_out(5792, 50); //@line 3164
 HEAP32[1454] = 0; //@line 3165
 HEAP32[1455] = 0; //@line 3165
 HEAP32[1456] = 0; //@line 3165
 HEAP32[1457] = 0; //@line 3165
 HEAP32[1458] = 0; //@line 3165
 HEAP32[1459] = 0; //@line 3165
 _gpio_init_out(5816, 52); //@line 3166
 HEAP32[1460] = 0; //@line 3167
 HEAP32[1461] = 0; //@line 3167
 HEAP32[1462] = 0; //@line 3167
 HEAP32[1463] = 0; //@line 3167
 HEAP32[1464] = 0; //@line 3167
 HEAP32[1465] = 0; //@line 3167
 _gpio_init_out(5840, 53); //@line 3168
 $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3169
 __ZN4mbed10TimerEventC2Ev(5648); //@line 3170
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 107; //@line 3173
  sp = STACKTOP; //@line 3174
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3177
 HEAP32[1412] = 440; //@line 3178
 HEAP32[1422] = 0; //@line 3179
 HEAP32[1423] = 0; //@line 3179
 HEAP32[1424] = 0; //@line 3179
 HEAP32[1425] = 0; //@line 3179
 HEAP8[5704] = 1; //@line 3180
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3181
 __ZN4mbed10TimerEventC2Ev(5712); //@line 3182
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 108; //@line 3185
  sp = STACKTOP; //@line 3186
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3189
  HEAP32[1438] = 0; //@line 3190
  HEAP32[1439] = 0; //@line 3190
  HEAP32[1440] = 0; //@line 3190
  HEAP32[1441] = 0; //@line 3190
  HEAP8[5768] = 1; //@line 3191
  HEAP32[1428] = 288; //@line 3192
  __ZN4mbed11InterruptInC2E7PinName(5864, 1337); //@line 3193
  return;
 }
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_58($0) {
 $0 = $0 | 0;
 var $$phi$trans$insert = 0, $$pre10 = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4429
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4433
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4435
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4437
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4439
 $$phi$trans$insert = (HEAP32[$0 + 4 >> 2] | 0) + 12 | 0; //@line 4440
 $$pre10 = HEAP32[$$phi$trans$insert >> 2] | 0; //@line 4441
 if (!$$pre10) {
  HEAP32[$4 >> 2] = 0; //@line 4444
  _gpio_irq_set($10 + 28 | 0, 2, 0); //@line 4446
  return;
 }
 $13 = HEAP32[$$pre10 + 4 >> 2] | 0; //@line 4450
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 4451
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 4452
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 30; //@line 4455
  $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 4456
  HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 4457
  $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 4458
  HEAP32[$15 >> 2] = $4; //@line 4459
  $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 4460
  HEAP32[$16 >> 2] = $8; //@line 4461
  $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 4462
  HEAP32[$17 >> 2] = $10; //@line 4463
  sp = STACKTOP; //@line 4464
  return;
 }
 ___async_unwind = 0; //@line 4467
 HEAP32[$ReallocAsyncCtx4 >> 2] = 30; //@line 4468
 $14 = $ReallocAsyncCtx4 + 4 | 0; //@line 4469
 HEAP32[$14 >> 2] = $$phi$trans$insert; //@line 4470
 $15 = $ReallocAsyncCtx4 + 8 | 0; //@line 4471
 HEAP32[$15 >> 2] = $4; //@line 4472
 $16 = $ReallocAsyncCtx4 + 12 | 0; //@line 4473
 HEAP32[$16 >> 2] = $8; //@line 4474
 $17 = $ReallocAsyncCtx4 + 16 | 0; //@line 4475
 HEAP32[$17 >> 2] = $10; //@line 4476
 sp = STACKTOP; //@line 4477
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_44($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3236
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3240
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3242
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3244
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3246
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3248
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3250
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3252
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 3255
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 3256
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 3272
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 3273
    if (!___async) {
     ___async_unwind = 0; //@line 3276
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 160; //@line 3278
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 3280
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 3282
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 3284
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 3286
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 3288
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 3290
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 3292
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 3294
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 3297
    sp = STACKTOP; //@line 3298
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
 sp = STACKTOP; //@line 7268
 STACKTOP = STACKTOP + 16 | 0; //@line 7269
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7269
 $2 = sp; //@line 7270
 $3 = $1 & 255; //@line 7271
 HEAP8[$2 >> 0] = $3; //@line 7272
 $4 = $0 + 16 | 0; //@line 7273
 $5 = HEAP32[$4 >> 2] | 0; //@line 7274
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 7281
   label = 4; //@line 7282
  } else {
   $$0 = -1; //@line 7284
  }
 } else {
  $12 = $5; //@line 7287
  label = 4; //@line 7288
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 7292
   $10 = HEAP32[$9 >> 2] | 0; //@line 7293
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 7296
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 7303
     HEAP8[$10 >> 0] = $3; //@line 7304
     $$0 = $13; //@line 7305
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 7310
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7311
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 7312
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 128; //@line 7315
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 7317
    sp = STACKTOP; //@line 7318
    STACKTOP = sp; //@line 7319
    return 0; //@line 7319
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 7321
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 7326
   } else {
    $$0 = -1; //@line 7328
   }
  }
 } while (0);
 STACKTOP = sp; //@line 7332
 return $$0 | 0; //@line 7332
}
function _fflush__async_cb_4($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13692
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13694
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 13696
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 13700
  } else {
   $$02327 = $$02325; //@line 13702
   $$02426 = $AsyncRetVal; //@line 13702
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 13709
    } else {
     $16 = 0; //@line 13711
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 13723
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 13726
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 13729
     break L3;
    } else {
     $$02327 = $$023; //@line 13732
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 13735
   $13 = ___fflush_unlocked($$02327) | 0; //@line 13736
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 13740
    ___async_unwind = 0; //@line 13741
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 132; //@line 13743
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 13745
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 13747
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 13749
   sp = STACKTOP; //@line 13750
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 13754
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 13756
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 6128
 value = value & 255; //@line 6130
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 6133
   ptr = ptr + 1 | 0; //@line 6134
  }
  aligned_end = end & -4 | 0; //@line 6137
  block_aligned_end = aligned_end - 64 | 0; //@line 6138
  value4 = value | value << 8 | value << 16 | value << 24; //@line 6139
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 6142
   HEAP32[ptr + 4 >> 2] = value4; //@line 6143
   HEAP32[ptr + 8 >> 2] = value4; //@line 6144
   HEAP32[ptr + 12 >> 2] = value4; //@line 6145
   HEAP32[ptr + 16 >> 2] = value4; //@line 6146
   HEAP32[ptr + 20 >> 2] = value4; //@line 6147
   HEAP32[ptr + 24 >> 2] = value4; //@line 6148
   HEAP32[ptr + 28 >> 2] = value4; //@line 6149
   HEAP32[ptr + 32 >> 2] = value4; //@line 6150
   HEAP32[ptr + 36 >> 2] = value4; //@line 6151
   HEAP32[ptr + 40 >> 2] = value4; //@line 6152
   HEAP32[ptr + 44 >> 2] = value4; //@line 6153
   HEAP32[ptr + 48 >> 2] = value4; //@line 6154
   HEAP32[ptr + 52 >> 2] = value4; //@line 6155
   HEAP32[ptr + 56 >> 2] = value4; //@line 6156
   HEAP32[ptr + 60 >> 2] = value4; //@line 6157
   ptr = ptr + 64 | 0; //@line 6158
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 6162
   ptr = ptr + 4 | 0; //@line 6163
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 6168
  ptr = ptr + 1 | 0; //@line 6169
 }
 return end - num | 0; //@line 6171
}
function _main__async_cb_36($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 2771
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2773
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2775
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2777
 $8 = $2 + 4 | 0; //@line 2779
 HEAP32[$8 >> 2] = 0; //@line 2781
 HEAP32[$8 + 4 >> 2] = 0; //@line 2784
 HEAP32[$2 >> 2] = 7; //@line 2785
 $12 = $2 + 12 | 0; //@line 2786
 HEAP32[$12 >> 2] = 384; //@line 2787
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(20) | 0; //@line 2788
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5648, $2, 1.0); //@line 2789
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 115; //@line 2792
  $13 = $ReallocAsyncCtx8 + 4 | 0; //@line 2793
  HEAP32[$13 >> 2] = $12; //@line 2794
  $14 = $ReallocAsyncCtx8 + 8 | 0; //@line 2795
  HEAP32[$14 >> 2] = $2; //@line 2796
  $15 = $ReallocAsyncCtx8 + 12 | 0; //@line 2797
  HEAP32[$15 >> 2] = $4; //@line 2798
  $16 = $ReallocAsyncCtx8 + 16 | 0; //@line 2799
  HEAP32[$16 >> 2] = $6; //@line 2800
  sp = STACKTOP; //@line 2801
  return;
 }
 ___async_unwind = 0; //@line 2804
 HEAP32[$ReallocAsyncCtx8 >> 2] = 115; //@line 2805
 $13 = $ReallocAsyncCtx8 + 4 | 0; //@line 2806
 HEAP32[$13 >> 2] = $12; //@line 2807
 $14 = $ReallocAsyncCtx8 + 8 | 0; //@line 2808
 HEAP32[$14 >> 2] = $2; //@line 2809
 $15 = $ReallocAsyncCtx8 + 12 | 0; //@line 2810
 HEAP32[$15 >> 2] = $4; //@line 2811
 $16 = $ReallocAsyncCtx8 + 16 | 0; //@line 2812
 HEAP32[$16 >> 2] = $6; //@line 2813
 sp = STACKTOP; //@line 2814
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3173
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3177
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3179
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3181
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3183
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3185
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3187
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 3190
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 3191
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 3200
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 3201
    if (!___async) {
     ___async_unwind = 0; //@line 3204
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 161; //@line 3206
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 3208
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 3210
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 3212
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 3214
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 3216
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 3218
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 3220
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 3223
    sp = STACKTOP; //@line 3224
    return;
   }
  }
 }
 return;
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13593
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 13603
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 13603
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 13603
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 13607
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 13610
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 13613
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 13621
  } else {
   $20 = 0; //@line 13623
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 13633
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 13637
  HEAP32[___async_retval >> 2] = $$1; //@line 13639
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 13642
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 13643
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 13647
  ___async_unwind = 0; //@line 13648
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 132; //@line 13650
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 13652
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 13654
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 13656
 sp = STACKTOP; //@line 13657
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1228
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1230
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1232
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1234
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 1239
  } else {
   $9 = $4 + 4 | 0; //@line 1241
   $10 = HEAP32[$9 >> 2] | 0; //@line 1242
   $11 = $4 + 8 | 0; //@line 1243
   $12 = HEAP32[$11 >> 2] | 0; //@line 1244
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 1248
    HEAP32[$6 >> 2] = 0; //@line 1249
    HEAP32[$2 >> 2] = 0; //@line 1250
    HEAP32[$11 >> 2] = 0; //@line 1251
    HEAP32[$9 >> 2] = 0; //@line 1252
    $$0 = 0; //@line 1253
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 1260
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 1261
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 1262
   if (!___async) {
    ___async_unwind = 0; //@line 1265
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 134; //@line 1267
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 1269
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 1271
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 1273
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 1275
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 1277
   sp = STACKTOP; //@line 1278
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 1283
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4363
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4365
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4367
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4369
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4371
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4373
 $$pre = HEAP32[$2 >> 2] | 0; //@line 4374
 if (!$$pre) {
  HEAP32[$4 >> 2] = 0; //@line 4377
  _gpio_irq_set($10 + 28 | 0, 2, 1); //@line 4379
  return;
 }
 $13 = HEAP32[$$pre + 4 >> 2] | 0; //@line 4383
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 4384
 FUNCTION_TABLE_vii[$13 & 3]($6, $8); //@line 4385
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 28; //@line 4388
  $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 4389
  HEAP32[$14 >> 2] = $2; //@line 4390
  $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 4391
  HEAP32[$15 >> 2] = $4; //@line 4392
  $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 4393
  HEAP32[$16 >> 2] = $10; //@line 4394
  sp = STACKTOP; //@line 4395
  return;
 }
 ___async_unwind = 0; //@line 4398
 HEAP32[$ReallocAsyncCtx2 >> 2] = 28; //@line 4399
 $14 = $ReallocAsyncCtx2 + 4 | 0; //@line 4400
 HEAP32[$14 >> 2] = $2; //@line 4401
 $15 = $ReallocAsyncCtx2 + 8 | 0; //@line 4402
 HEAP32[$15 >> 2] = $4; //@line 4403
 $16 = $ReallocAsyncCtx2 + 12 | 0; //@line 4404
 HEAP32[$16 >> 2] = $10; //@line 4405
 sp = STACKTOP; //@line 4406
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 10648
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 10653
    $$0 = 1; //@line 10654
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 10667
     $$0 = 1; //@line 10668
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 10672
     $$0 = -1; //@line 10673
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 10683
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 10687
    $$0 = 2; //@line 10688
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 10700
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 10706
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 10710
    $$0 = 3; //@line 10711
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 10721
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 10727
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 10733
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 10737
    $$0 = 4; //@line 10738
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 10742
    $$0 = -1; //@line 10743
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 10748
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_65($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 4964
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4966
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4968
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4970
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4972
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 4977
  return;
 }
 dest = $2 + 4 | 0; //@line 4981
 stop = dest + 52 | 0; //@line 4981
 do {
  HEAP32[dest >> 2] = 0; //@line 4981
  dest = dest + 4 | 0; //@line 4981
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 4982
 HEAP32[$2 + 8 >> 2] = $4; //@line 4984
 HEAP32[$2 + 12 >> 2] = -1; //@line 4986
 HEAP32[$2 + 48 >> 2] = 1; //@line 4988
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 4991
 $16 = HEAP32[$6 >> 2] | 0; //@line 4992
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 4993
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 4994
 if (!___async) {
  ___async_unwind = 0; //@line 4997
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 146; //@line 4999
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 5001
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 5003
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 5005
 sp = STACKTOP; //@line 5006
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_45($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3309
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3313
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3315
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3317
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3319
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3321
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 3324
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 3325
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 3331
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 3332
   if (!___async) {
    ___async_unwind = 0; //@line 3335
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 159; //@line 3337
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 3339
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 3341
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 3343
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 3345
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 3347
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 3349
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 3352
   sp = STACKTOP; //@line 3353
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
  $$0914 = $2; //@line 9532
  $8 = $0; //@line 9532
  $9 = $1; //@line 9532
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 9534
   $$0914 = $$0914 + -1 | 0; //@line 9538
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 9539
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 9540
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 9548
   }
  }
  $$010$lcssa$off0 = $8; //@line 9553
  $$09$lcssa = $$0914; //@line 9553
 } else {
  $$010$lcssa$off0 = $0; //@line 9555
  $$09$lcssa = $2; //@line 9555
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 9559
 } else {
  $$012 = $$010$lcssa$off0; //@line 9561
  $$111 = $$09$lcssa; //@line 9561
  while (1) {
   $26 = $$111 + -1 | 0; //@line 9566
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 9567
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 9571
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 9574
    $$111 = $26; //@line 9574
   }
  }
 }
 return $$1$lcssa | 0; //@line 9578
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2677
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2679
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2681
 $6 = $2 + 4 | 0; //@line 2683
 HEAP32[$6 >> 2] = 0; //@line 2685
 HEAP32[$6 + 4 >> 2] = 0; //@line 2688
 HEAP32[$2 >> 2] = 8; //@line 2689
 $10 = $2 + 12 | 0; //@line 2690
 HEAP32[$10 >> 2] = 384; //@line 2691
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(16) | 0; //@line 2692
 __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf(5712, $2, 2.5); //@line 2693
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 117; //@line 2696
  $11 = $ReallocAsyncCtx7 + 4 | 0; //@line 2697
  HEAP32[$11 >> 2] = $10; //@line 2698
  $12 = $ReallocAsyncCtx7 + 8 | 0; //@line 2699
  HEAP32[$12 >> 2] = $4; //@line 2700
  $13 = $ReallocAsyncCtx7 + 12 | 0; //@line 2701
  HEAP32[$13 >> 2] = $2; //@line 2702
  sp = STACKTOP; //@line 2703
  return;
 }
 ___async_unwind = 0; //@line 2706
 HEAP32[$ReallocAsyncCtx7 >> 2] = 117; //@line 2707
 $11 = $ReallocAsyncCtx7 + 4 | 0; //@line 2708
 HEAP32[$11 >> 2] = $10; //@line 2709
 $12 = $ReallocAsyncCtx7 + 8 | 0; //@line 2710
 HEAP32[$12 >> 2] = $4; //@line 2711
 $13 = $ReallocAsyncCtx7 + 12 | 0; //@line 2712
 HEAP32[$13 >> 2] = $2; //@line 2713
 sp = STACKTOP; //@line 2714
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4234
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4236
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4240
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4242
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4244
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4246
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 4250
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 4253
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 4254
   if (!___async) {
    ___async_unwind = 0; //@line 4257
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 163; //@line 4259
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 4261
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 4263
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 4265
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 4267
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 4269
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 4271
   sp = STACKTOP; //@line 4272
   return;
  }
 }
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 7034
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 7039
   label = 4; //@line 7040
  } else {
   $$01519 = $0; //@line 7042
   $23 = $1; //@line 7042
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 7047
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 7050
    $23 = $6; //@line 7051
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 7055
     label = 4; //@line 7056
     break;
    } else {
     $$01519 = $6; //@line 7059
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 7065
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 7067
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 7075
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 7083
  } else {
   $$pn = $$0; //@line 7085
   while (1) {
    $19 = $$pn + 1 | 0; //@line 7087
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 7091
     break;
    } else {
     $$pn = $19; //@line 7094
    }
   }
  }
  $$sink = $$1$lcssa; //@line 7099
 }
 return $$sink - $1 | 0; //@line 7102
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 12203
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 12210
   $10 = $1 + 16 | 0; //@line 12211
   $11 = HEAP32[$10 >> 2] | 0; //@line 12212
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 12215
    HEAP32[$1 + 24 >> 2] = $4; //@line 12217
    HEAP32[$1 + 36 >> 2] = 1; //@line 12219
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 12229
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 12234
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 12237
    HEAP8[$1 + 54 >> 0] = 1; //@line 12239
    break;
   }
   $21 = $1 + 24 | 0; //@line 12242
   $22 = HEAP32[$21 >> 2] | 0; //@line 12243
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 12246
    $28 = $4; //@line 12247
   } else {
    $28 = $22; //@line 12249
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 12258
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
 sp = STACKTOP; //@line 11697
 $1 = HEAP32[147] | 0; //@line 11698
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 11704
 } else {
  $19 = 0; //@line 11706
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 11712
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 11718
    $12 = HEAP32[$11 >> 2] | 0; //@line 11719
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 11725
     HEAP8[$12 >> 0] = 10; //@line 11726
     $22 = 0; //@line 11727
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 11731
   $17 = ___overflow($1, 10) | 0; //@line 11732
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 140; //@line 11735
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 11737
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 11739
    sp = STACKTOP; //@line 11740
    return 0; //@line 11741
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 11743
    $22 = $17 >> 31; //@line 11745
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 11752
 }
 return $22 | 0; //@line 11754
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_59($0) {
 $0 = $0 | 0;
 var $$pre$i$i4 = 0, $12 = 0, $13 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 4483
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4489
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4491
 $$pre$i$i4 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 4492
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = $$pre$i$i4; //@line 4493
 if (!$$pre$i$i4) {
  _gpio_irq_set($8 + 28 | 0, 2, 0); //@line 4497
  return;
 }
 $12 = HEAP32[$$pre$i$i4 + 8 >> 2] | 0; //@line 4502
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(12) | 0; //@line 4503
 FUNCTION_TABLE_vi[$12 & 255]($6); //@line 4504
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 4507
  $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 4508
  HEAP32[$13 >> 2] = $6; //@line 4509
  $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 4510
  HEAP32[$14 >> 2] = $8; //@line 4511
  sp = STACKTOP; //@line 4512
  return;
 }
 ___async_unwind = 0; //@line 4515
 HEAP32[$ReallocAsyncCtx5 >> 2] = 31; //@line 4516
 $13 = $ReallocAsyncCtx5 + 4 | 0; //@line 4517
 HEAP32[$13 >> 2] = $6; //@line 4518
 $14 = $ReallocAsyncCtx5 + 8 | 0; //@line 4519
 HEAP32[$14 >> 2] = $8; //@line 4520
 sp = STACKTOP; //@line 4521
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
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_55($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4282
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4288
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4290
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4292
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4294
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 4299
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 4301
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 4302
 if (!___async) {
  ___async_unwind = 0; //@line 4305
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 163; //@line 4307
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 4309
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 4311
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 4313
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 4315
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 4317
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 4319
 sp = STACKTOP; //@line 4320
 return;
}
function _mbed_vtracef__async_cb_11($0) {
 $0 = $0 | 0;
 var $$18 = 0, $10 = 0, $12 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 753
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 755
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 757
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 759
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 764
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 766
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 771
 $16 = _snprintf($4, $6, 1668, $2) | 0; //@line 772
 $$18 = ($16 | 0) >= ($6 | 0) ? 0 : $16; //@line 774
 $19 = $4 + $$18 | 0; //@line 776
 $20 = $6 - $$18 | 0; //@line 777
 if (($$18 | 0) > 0) {
  if (!(($$18 | 0) < 1 | ($20 | 0) < 1 | $10 ^ 1)) {
   _snprintf($19, $20, 1746, $12) | 0; //@line 785
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12062
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 12071
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 12076
      HEAP32[$13 >> 2] = $2; //@line 12077
      $19 = $1 + 40 | 0; //@line 12078
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 12081
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 12091
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 12095
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 12102
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
 $$016 = 0; //@line 10768
 while (1) {
  if ((HEAPU8[3117 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 10775
   break;
  }
  $7 = $$016 + 1 | 0; //@line 10778
  if (($7 | 0) == 87) {
   $$01214 = 3205; //@line 10781
   $$115 = 87; //@line 10781
   label = 5; //@line 10782
   break;
  } else {
   $$016 = $7; //@line 10785
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 3205; //@line 10791
  } else {
   $$01214 = 3205; //@line 10793
   $$115 = $$016; //@line 10793
   label = 5; //@line 10794
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 10799
   $$113 = $$01214; //@line 10800
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 10804
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 10811
   if (!$$115) {
    $$012$lcssa = $$113; //@line 10814
    break;
   } else {
    $$01214 = $$113; //@line 10817
    label = 5; //@line 10818
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 10825
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4169
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4171
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4173
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4175
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 4177
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 4179
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 5145; //@line 4184
  HEAP32[$4 + 4 >> 2] = $6; //@line 4186
  _abort_message(5054, $4); //@line 4187
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 4190
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 4193
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 4194
 $16 = FUNCTION_TABLE_ii[$15 & 1]($12) | 0; //@line 4195
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 4199
  ___async_unwind = 0; //@line 4200
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 142; //@line 4202
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 4204
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 4206
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 4208
 sp = STACKTOP; //@line 4209
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4544
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4546
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4548
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4552
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 4556
  label = 4; //@line 4557
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 4562
   label = 4; //@line 4563
  } else {
   $$037$off039 = 3; //@line 4565
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 4569
  $17 = $8 + 40 | 0; //@line 4570
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 4573
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 4583
    $$037$off039 = $$037$off038; //@line 4584
   } else {
    $$037$off039 = $$037$off038; //@line 4586
   }
  } else {
   $$037$off039 = $$037$off038; //@line 4589
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 4592
 return;
}
function _strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $2 = 0, $5 = 0;
 $2 = HEAP8[$1 >> 0] | 0; //@line 10841
 do {
  if (!($2 << 24 >> 24)) {
   $$0 = $0; //@line 10845
  } else {
   $5 = _strchr($0, $2 << 24 >> 24) | 0; //@line 10848
   if (!$5) {
    $$0 = 0; //@line 10851
   } else {
    if (!(HEAP8[$1 + 1 >> 0] | 0)) {
     $$0 = $5; //@line 10857
    } else {
     if (!(HEAP8[$5 + 1 >> 0] | 0)) {
      $$0 = 0; //@line 10863
     } else {
      if (!(HEAP8[$1 + 2 >> 0] | 0)) {
       $$0 = _twobyte_strstr($5, $1) | 0; //@line 10870
       break;
      }
      if (!(HEAP8[$5 + 2 >> 0] | 0)) {
       $$0 = 0; //@line 10877
      } else {
       if (!(HEAP8[$1 + 3 >> 0] | 0)) {
        $$0 = _threebyte_strstr($5, $1) | 0; //@line 10884
        break;
       }
       if (!(HEAP8[$5 + 3 >> 0] | 0)) {
        $$0 = 0; //@line 10891
       } else {
        if (!(HEAP8[$1 + 4 >> 0] | 0)) {
         $$0 = _fourbyte_strstr($5, $1) | 0; //@line 10898
         break;
        } else {
         $$0 = _twoway_strstr($5, $1) | 0; //@line 10902
         break;
        }
       }
      }
     }
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 10912
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
 sp = STACKTOP; //@line 3000
 HEAP32[$0 >> 2] = 440; //@line 3001
 $1 = $0 + 40 | 0; //@line 3002
 _emscripten_asm_const_ii(8, $1 | 0) | 0; //@line 3003
 $4 = HEAP32[$0 + 52 >> 2] | 0; //@line 3005
 do {
  if ($4 | 0) {
   $7 = HEAP32[$4 + 8 >> 2] | 0; //@line 3010
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3011
   FUNCTION_TABLE_vi[$7 & 255]($1); //@line 3012
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 101; //@line 3015
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3017
    sp = STACKTOP; //@line 3018
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 3021
    break;
   }
  }
 } while (0);
 $AsyncCtx2 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3026
 __ZN4mbed10TimerEventD2Ev($0); //@line 3027
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 102; //@line 3030
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 3032
  sp = STACKTOP; //@line 3033
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 3036
  __ZdlPv($0); //@line 3037
  return;
 }
}
function _fourbyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$lcssa = 0, $$sink21$lcssa = 0, $$sink2123 = 0, $18 = 0, $32 = 0, $33 = 0, $35 = 0, $39 = 0, $40 = 0, $41 = 0;
 $18 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8 | (HEAPU8[$1 + 3 >> 0] | 0); //@line 11037
 $32 = $0 + 3 | 0; //@line 11051
 $33 = HEAP8[$32 >> 0] | 0; //@line 11052
 $35 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | (HEAPU8[$0 + 2 >> 0] | 0) << 8 | $33 & 255; //@line 11054
 if ($33 << 24 >> 24 == 0 | ($35 | 0) == ($18 | 0)) {
  $$lcssa = $33; //@line 11059
  $$sink21$lcssa = $32; //@line 11059
 } else {
  $$sink2123 = $32; //@line 11061
  $39 = $35; //@line 11061
  while (1) {
   $40 = $$sink2123 + 1 | 0; //@line 11064
   $41 = HEAP8[$40 >> 0] | 0; //@line 11065
   $39 = $39 << 8 | $41 & 255; //@line 11067
   if ($41 << 24 >> 24 == 0 | ($39 | 0) == ($18 | 0)) {
    $$lcssa = $41; //@line 11072
    $$sink21$lcssa = $40; //@line 11072
    break;
   } else {
    $$sink2123 = $40; //@line 11075
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$sink21$lcssa + -3 | 0 : 0) | 0; //@line 11082
}
function _main__async_cb_34($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 2720
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2722
 $4 = $2 + 4 | 0; //@line 2724
 HEAP32[$4 >> 2] = 0; //@line 2726
 HEAP32[$4 + 4 >> 2] = 0; //@line 2729
 HEAP32[$2 >> 2] = 9; //@line 2730
 $8 = $2 + 12 | 0; //@line 2731
 HEAP32[$8 >> 2] = 384; //@line 2732
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 2733
 __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE(5864, $2); //@line 2734
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 119; //@line 2737
  $9 = $ReallocAsyncCtx9 + 4 | 0; //@line 2738
  HEAP32[$9 >> 2] = $8; //@line 2739
  $10 = $ReallocAsyncCtx9 + 8 | 0; //@line 2740
  HEAP32[$10 >> 2] = $2; //@line 2741
  sp = STACKTOP; //@line 2742
  return;
 }
 ___async_unwind = 0; //@line 2745
 HEAP32[$ReallocAsyncCtx9 >> 2] = 119; //@line 2746
 $9 = $ReallocAsyncCtx9 + 4 | 0; //@line 2747
 HEAP32[$9 >> 2] = $8; //@line 2748
 $10 = $ReallocAsyncCtx9 + 8 | 0; //@line 2749
 HEAP32[$10 >> 2] = $2; //@line 2750
 sp = STACKTOP; //@line 2751
 return;
}
function _mbed_vtracef__async_cb_17($0) {
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
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3067
 $2 = $0 + 12 | 0; //@line 3069
 $3 = HEAP32[$2 >> 2] | 0; //@line 3070
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 3074
   _mbed_assert_internal(2173, 2178, 528); //@line 3075
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 104; //@line 3078
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 3080
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 3082
    sp = STACKTOP; //@line 3083
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 3086
    $8 = HEAP32[$2 >> 2] | 0; //@line 3088
    break;
   }
  } else {
   $8 = $3; //@line 3092
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 3095
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3097
 FUNCTION_TABLE_vi[$7 & 255]($0); //@line 3098
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 105; //@line 3101
  sp = STACKTOP; //@line 3102
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3105
  return;
 }
}
function _abort_message($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11895
 STACKTOP = STACKTOP + 16 | 0; //@line 11896
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11896
 $1 = sp; //@line 11897
 HEAP32[$1 >> 2] = $varargs; //@line 11898
 $2 = HEAP32[115] | 0; //@line 11899
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 11900
 _vfprintf($2, $0, $1) | 0; //@line 11901
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 143; //@line 11904
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 11906
  sp = STACKTOP; //@line 11907
  STACKTOP = sp; //@line 11908
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 11910
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 11911
 _fputc(10, $2) | 0; //@line 11912
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 144; //@line 11915
  sp = STACKTOP; //@line 11916
  STACKTOP = sp; //@line 11917
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 11919
  _abort(); //@line 11920
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
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_63($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $15 = 0, $17 = 0, $18 = 0, $21 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4887
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4893
 $8 = $0 + 16 | 0; //@line 4895
 $10 = HEAP32[$8 >> 2] | 0; //@line 4897
 $13 = HEAP32[$8 + 4 >> 2] | 0; //@line 4900
 $15 = HEAP32[$0 + 24 >> 2] | 0; //@line 4902
 $17 = HEAP32[$0 + 28 >> 2] | 0; //@line 4904
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 4906
 __ZN4mbed6Ticker5setupEy($6, $10, $13); //@line 4907
 $18 = HEAP32[$15 >> 2] | 0; //@line 4908
 if (!$18) {
  return;
 }
 $21 = HEAP32[$18 + 8 >> 2] | 0; //@line 4914
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 4915
 FUNCTION_TABLE_vi[$21 & 255]($17); //@line 4916
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 125; //@line 4919
  sp = STACKTOP; //@line 4920
  return;
 }
 ___async_unwind = 0; //@line 4923
 HEAP32[$ReallocAsyncCtx4 >> 2] = 125; //@line 4924
 sp = STACKTOP; //@line 4925
 return;
}
function _threebyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$016$lcssa = 0, $$01618 = 0, $$019 = 0, $$lcssa = 0, $14 = 0, $23 = 0, $24 = 0, $27 = 0, $30 = 0, $31 = 0;
 $14 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8; //@line 10971
 $23 = $0 + 2 | 0; //@line 10980
 $24 = HEAP8[$23 >> 0] | 0; //@line 10981
 $27 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | ($24 & 255) << 8; //@line 10984
 if (($27 | 0) == ($14 | 0) | $24 << 24 >> 24 == 0) {
  $$016$lcssa = $23; //@line 10989
  $$lcssa = $24; //@line 10989
 } else {
  $$01618 = $23; //@line 10991
  $$019 = $27; //@line 10991
  while (1) {
   $30 = $$01618 + 1 | 0; //@line 10993
   $31 = HEAP8[$30 >> 0] | 0; //@line 10994
   $$019 = ($$019 | $31 & 255) << 8; //@line 10997
   if (($$019 | 0) == ($14 | 0) | $31 << 24 >> 24 == 0) {
    $$016$lcssa = $30; //@line 11002
    $$lcssa = $31; //@line 11002
    break;
   } else {
    $$01618 = $30; //@line 11005
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$016$lcssa + -2 | 0 : 0) | 0; //@line 11012
}
function __ZN4mbed6TickerD2Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2959
 HEAP32[$0 >> 2] = 440; //@line 2960
 $1 = $0 + 40 | 0; //@line 2961
 _emscripten_asm_const_ii(8, $1 | 0) | 0; //@line 2962
 $4 = HEAP32[$0 + 52 >> 2] | 0; //@line 2964
 do {
  if ($4 | 0) {
   $7 = HEAP32[$4 + 8 >> 2] | 0; //@line 2969
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2970
   FUNCTION_TABLE_vi[$7 & 255]($1); //@line 2971
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 99; //@line 2974
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2976
    sp = STACKTOP; //@line 2977
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 2980
    break;
   }
  }
 } while (0);
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2985
 __ZN4mbed10TimerEventD2Ev($0); //@line 2986
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 100; //@line 2989
  sp = STACKTOP; //@line 2990
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2993
  return;
 }
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 10599
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 10599
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 10600
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 10601
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 10610
    $$016 = $9; //@line 10613
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 10613
   } else {
    $$016 = $0; //@line 10615
    $storemerge = 0; //@line 10615
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 10617
   $$0 = $$016; //@line 10618
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 10622
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 10628
   HEAP32[tempDoublePtr >> 2] = $2; //@line 10631
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 10631
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 10632
  }
 }
 return +$$0;
}
function _main__async_cb_41($0) {
 $0 = $0 | 0;
 var $4 = 0, $5 = 0, $8 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3012
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3016
 $5 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 3017
 if (!$5) {
  $ReallocAsyncCtx10 = _emscripten_realloc_async_context(4) | 0; //@line 3020
  _wait_ms(-1); //@line 3021
  if (___async) {
   HEAP32[$ReallocAsyncCtx10 >> 2] = 121; //@line 3024
   sp = STACKTOP; //@line 3025
   return;
  }
  ___async_unwind = 0; //@line 3028
  HEAP32[$ReallocAsyncCtx10 >> 2] = 121; //@line 3029
  sp = STACKTOP; //@line 3030
  return;
 } else {
  $8 = HEAP32[$5 + 8 >> 2] | 0; //@line 3034
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 3035
  FUNCTION_TABLE_vi[$8 & 255]($4); //@line 3036
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 120; //@line 3039
   sp = STACKTOP; //@line 3040
   return;
  }
  ___async_unwind = 0; //@line 3043
  HEAP32[$ReallocAsyncCtx3 >> 2] = 120; //@line 3044
  sp = STACKTOP; //@line 3045
  return;
 }
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13498
 STACKTOP = STACKTOP + 16 | 0; //@line 13499
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13499
 $3 = sp; //@line 13500
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 13502
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 13505
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 13506
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 13507
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 167; //@line 13510
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 13512
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 13514
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 13516
  sp = STACKTOP; //@line 13517
  STACKTOP = sp; //@line 13518
  return 0; //@line 13518
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 13520
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 13524
 }
 STACKTOP = sp; //@line 13526
 return $8 & 1 | 0; //@line 13526
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $10 = 0, $13 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12418
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 12424
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 12427
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 12430
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 12431
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 12432
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 149; //@line 12435
    sp = STACKTOP; //@line 12436
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12439
    break;
   }
  }
 } while (0);
 return;
}
function _schedule_interrupt__async_cb_51($0) {
 $0 = $0 | 0;
 var $16 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 4111
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4115
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4117
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4119
 $8 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 4120
 if ($4 >>> 0 > $8 >>> 0) {
  if (!($AsyncRetVal >>> 0 >= $4 >>> 0 | $AsyncRetVal >>> 0 < $8 >>> 0)) {
   return;
  }
 } else {
  if (!($AsyncRetVal >>> 0 >= $4 >>> 0 & $AsyncRetVal >>> 0 < $8 >>> 0)) {
   return;
  }
 }
 $16 = HEAP32[(HEAP32[$6 >> 2] | 0) + 20 >> 2] | 0; //@line 4139
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(4) | 0; //@line 4140
 FUNCTION_TABLE_v[$16 & 15](); //@line 4141
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 72; //@line 4144
  sp = STACKTOP; //@line 4145
  return;
 }
 ___async_unwind = 0; //@line 4148
 HEAP32[$ReallocAsyncCtx6 >> 2] = 72; //@line 4149
 sp = STACKTOP; //@line 4150
 return;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5178
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5186
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5188
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 5190
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 5192
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 5194
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 5196
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 5198
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 5209
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 5210
 HEAP32[$10 >> 2] = 0; //@line 5211
 HEAP32[$12 >> 2] = 0; //@line 5212
 HEAP32[$14 >> 2] = 0; //@line 5213
 HEAP32[$2 >> 2] = 0; //@line 5214
 $33 = HEAP32[$16 >> 2] | 0; //@line 5215
 HEAP32[$16 >> 2] = $33 | $18; //@line 5220
 if ($20 | 0) {
  ___unlockfile($22); //@line 5223
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 5226
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
function _mbed_vtracef__async_cb_14($0) {
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
function _mbed_vtracef__async_cb_13($0) {
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
 sp = STACKTOP; //@line 13417
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 13419
 $8 = $7 >> 8; //@line 13420
 if (!($7 & 1)) {
  $$0 = $8; //@line 13424
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 13429
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 13431
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 13434
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13439
 FUNCTION_TABLE_viiiiii[$17 & 3]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 13440
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 165; //@line 13443
  sp = STACKTOP; //@line 13444
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13447
  return;
 }
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12587
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 12593
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 12596
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 12599
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 12600
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 12601
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 152; //@line 12604
    sp = STACKTOP; //@line 12605
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12608
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
 sp = STACKTOP; //@line 13459
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 13461
 $7 = $6 >> 8; //@line 13462
 if (!($6 & 1)) {
  $$0 = $7; //@line 13466
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 13471
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 13473
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 13476
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13481
 FUNCTION_TABLE_viiiii[$16 & 3]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 13482
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 166; //@line 13485
  sp = STACKTOP; //@line 13486
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13489
  return;
 }
}
function _ticker_remove_event($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2279
 $4 = (HEAP32[$0 + 4 >> 2] | 0) + 4 | 0; //@line 2282
 $5 = HEAP32[$4 >> 2] | 0; //@line 2283
 if (($5 | 0) == ($1 | 0)) {
  HEAP32[$4 >> 2] = HEAP32[$1 + 12 >> 2]; //@line 2288
  $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2289
  _schedule_interrupt($0); //@line 2290
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 74; //@line 2293
   sp = STACKTOP; //@line 2294
   return;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2297
  return;
 } else {
  $$0 = $5; //@line 2300
 }
 do {
  if (!$$0) {
   label = 8; //@line 2305
   break;
  }
  $10 = $$0 + 12 | 0; //@line 2308
  $$0 = HEAP32[$10 >> 2] | 0; //@line 2309
 } while (($$0 | 0) != ($1 | 0));
 if ((label | 0) == 8) {
  return;
 }
 HEAP32[$10 >> 2] = HEAP32[$1 + 12 >> 2]; //@line 2322
 return;
}
function ___dynamic_cast__async_cb_43($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3091
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3093
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3095
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3101
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 3116
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 3132
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 3137
    break;
   }
  default:
   {
    $$0 = 0; //@line 3141
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 3146
 return;
}
function _mbed_error_vfprintf__async_cb_23($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1605
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 1607
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1609
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1611
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1613
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1615
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 1617
 _serial_putc(5784, $2 << 24 >> 24); //@line 1618
 if (!___async) {
  ___async_unwind = 0; //@line 1621
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 1623
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 1625
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 1627
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $8; //@line 1629
 HEAP8[$ReallocAsyncCtx2 + 16 >> 0] = $2; //@line 1631
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 1633
 sp = STACKTOP; //@line 1634
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13374
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 13376
 $6 = $5 >> 8; //@line 13377
 if (!($5 & 1)) {
  $$0 = $6; //@line 13381
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 13386
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 13388
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 13391
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13396
 FUNCTION_TABLE_viiii[$15 & 3]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 13397
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 164; //@line 13400
  sp = STACKTOP; //@line 13401
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13404
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
 sp = STACKTOP; //@line 9597
 STACKTOP = STACKTOP + 256 | 0; //@line 9598
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 9598
 $5 = sp; //@line 9599
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 9605
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 9609
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 9612
   $$011 = $9; //@line 9613
   do {
    _out_670($0, $5, 256); //@line 9615
    $$011 = $$011 + -256 | 0; //@line 9616
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 9625
  } else {
   $$0$lcssa = $9; //@line 9627
  }
  _out_670($0, $5, $$0$lcssa); //@line 9629
 }
 STACKTOP = sp; //@line 9631
 return;
}
function __ZN4mbed11InterruptInD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1185
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1187
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 1189
 if (!$4) {
  __ZdlPv($2); //@line 1192
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 1197
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 1198
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 1199
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 24; //@line 1202
  $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 1203
  HEAP32[$9 >> 2] = $2; //@line 1204
  sp = STACKTOP; //@line 1205
  return;
 }
 ___async_unwind = 0; //@line 1208
 HEAP32[$ReallocAsyncCtx2 >> 2] = 24; //@line 1209
 $9 = $ReallocAsyncCtx2 + 4 | 0; //@line 1210
 HEAP32[$9 >> 2] = $2; //@line 1211
 sp = STACKTOP; //@line 1212
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 6892
 STACKTOP = STACKTOP + 32 | 0; //@line 6893
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 6893
 $vararg_buffer = sp; //@line 6894
 $3 = sp + 20 | 0; //@line 6895
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 6899
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 6901
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 6903
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 6905
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 6907
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 6912
  $10 = -1; //@line 6913
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 6916
 }
 STACKTOP = sp; //@line 6918
 return $10 | 0; //@line 6918
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 2335
 STACKTOP = STACKTOP + 16 | 0; //@line 2336
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2336
 $vararg_buffer = sp; //@line 2337
 HEAP32[$vararg_buffer >> 2] = $0; //@line 2338
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 2340
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 2342
 _mbed_error_printf(1839, $vararg_buffer); //@line 2343
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2344
 _mbed_die(); //@line 2345
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 75; //@line 2348
  sp = STACKTOP; //@line 2349
  STACKTOP = sp; //@line 2350
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2352
  STACKTOP = sp; //@line 2353
  return;
 }
}
function __ZN4mbed7Timeout7handlerEv__async_cb_31($0) {
 $0 = $0 | 0;
 var $4 = 0, $5 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2613
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2617
 $5 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 2618
 if (!$5) {
  return;
 }
 $8 = HEAP32[$5 + 8 >> 2] | 0; //@line 2624
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 2625
 FUNCTION_TABLE_vi[$8 & 255]($4); //@line 2626
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 39; //@line 2629
  $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 2630
  HEAP32[$9 >> 2] = $4; //@line 2631
  sp = STACKTOP; //@line 2632
  return;
 }
 ___async_unwind = 0; //@line 2635
 HEAP32[$ReallocAsyncCtx3 >> 2] = 39; //@line 2636
 $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 2637
 HEAP32[$9 >> 2] = $4; //@line 2638
 sp = STACKTOP; //@line 2639
 return;
}
function _snprintf($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11476
 STACKTOP = STACKTOP + 16 | 0; //@line 11477
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11477
 $3 = sp; //@line 11478
 HEAP32[$3 >> 2] = $varargs; //@line 11479
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 11480
 $4 = _vsnprintf($0, $1, $2, $3) | 0; //@line 11481
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 136; //@line 11484
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 11486
  sp = STACKTOP; //@line 11487
  STACKTOP = sp; //@line 11488
  return 0; //@line 11488
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11490
  STACKTOP = sp; //@line 11491
  return $4 | 0; //@line 11491
 }
 return 0; //@line 11493
}
function _schedule_interrupt__async_cb_50($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 4079
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4081
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4083
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4085
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 4 >> 2] | 0; //@line 4088
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(16) | 0; //@line 4089
 $10 = FUNCTION_TABLE_i[$9 & 3]() | 0; //@line 4090
 if (!___async) {
  HEAP32[___async_retval >> 2] = $10; //@line 4094
  ___async_unwind = 0; //@line 4095
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 71; //@line 4097
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $4; //@line 4099
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $6; //@line 4101
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $2; //@line 4103
 sp = STACKTOP; //@line 4104
 return;
}
function _initialize__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1646
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1648
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1650
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1652
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 24 >> 2] | 0; //@line 1655
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 1656
 $10 = FUNCTION_TABLE_i[$9 & 3]() | 0; //@line 1657
 if (!___async) {
  HEAP32[___async_retval >> 2] = $10; //@line 1661
  ___async_unwind = 0; //@line 1662
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 61; //@line 1664
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 1666
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 1668
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 1670
 sp = STACKTOP; //@line 1671
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 12140
 $5 = HEAP32[$4 >> 2] | 0; //@line 12141
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 12145
   HEAP32[$1 + 24 >> 2] = $3; //@line 12147
   HEAP32[$1 + 36 >> 2] = 1; //@line 12149
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 12153
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 12156
    HEAP32[$1 + 24 >> 2] = 2; //@line 12158
    HEAP8[$1 + 54 >> 0] = 1; //@line 12160
    break;
   }
   $10 = $1 + 24 | 0; //@line 12163
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 12167
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_12($0) {
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
function _mbed_vtracef__async_cb_9($0) {
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
function _mbed_vtracef__async_cb_8($0) {
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
 sp = STACKTOP; //@line 12690
 STACKTOP = STACKTOP + 16 | 0; //@line 12691
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12691
 $vararg_buffer = sp; //@line 12692
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 12693
 FUNCTION_TABLE_v[$0 & 15](); //@line 12694
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 154; //@line 12697
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 12699
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 12701
  sp = STACKTOP; //@line 12702
  STACKTOP = sp; //@line 12703
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 12705
  _abort_message(5436, $vararg_buffer); //@line 12706
 }
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 6999
 $3 = HEAP8[$1 >> 0] | 0; //@line 7000
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 7005
  $$lcssa8 = $2; //@line 7005
 } else {
  $$011 = $1; //@line 7007
  $$0710 = $0; //@line 7007
  do {
   $$0710 = $$0710 + 1 | 0; //@line 7009
   $$011 = $$011 + 1 | 0; //@line 7010
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 7011
   $9 = HEAP8[$$011 >> 0] | 0; //@line 7012
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 7017
  $$lcssa8 = $8; //@line 7017
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 7027
}
function _memcmp($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $14 = 0, $4 = 0, $5 = 0;
 L1 : do {
  if (!$2) {
   $14 = 0; //@line 11441
  } else {
   $$01318 = $0; //@line 11443
   $$01417 = $2; //@line 11443
   $$019 = $1; //@line 11443
   while (1) {
    $4 = HEAP8[$$01318 >> 0] | 0; //@line 11445
    $5 = HEAP8[$$019 >> 0] | 0; //@line 11446
    if ($4 << 24 >> 24 != $5 << 24 >> 24) {
     break;
    }
    $$01417 = $$01417 + -1 | 0; //@line 11451
    if (!$$01417) {
     $14 = 0; //@line 11456
     break L1;
    } else {
     $$01318 = $$01318 + 1 | 0; //@line 11459
     $$019 = $$019 + 1 | 0; //@line 11459
    }
   }
   $14 = ($4 & 255) - ($5 & 255) | 0; //@line 11465
  }
 } while (0);
 return $14 | 0; //@line 11468
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2900
 $2 = HEAP32[147] | 0; //@line 2901
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2902
 _putc($1, $2) | 0; //@line 2903
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 97; //@line 2906
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 2908
  sp = STACKTOP; //@line 2909
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2912
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2913
 _fflush($2) | 0; //@line 2914
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 98; //@line 2917
  sp = STACKTOP; //@line 2918
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2921
  return;
 }
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 6951
 STACKTOP = STACKTOP + 32 | 0; //@line 6952
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 6952
 $vararg_buffer = sp; //@line 6953
 HEAP32[$0 + 36 >> 2] = 1; //@line 6956
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 6964
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 6966
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 6968
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 6973
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 6976
 STACKTOP = sp; //@line 6977
 return $14 | 0; //@line 6977
}
function _mbed_die__async_cb_87($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 5655
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5657
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5659
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 5660
 _wait_ms(150); //@line 5661
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 77; //@line 5664
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 5665
  HEAP32[$4 >> 2] = $2; //@line 5666
  sp = STACKTOP; //@line 5667
  return;
 }
 ___async_unwind = 0; //@line 5670
 HEAP32[$ReallocAsyncCtx15 >> 2] = 77; //@line 5671
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 5672
 HEAP32[$4 >> 2] = $2; //@line 5673
 sp = STACKTOP; //@line 5674
 return;
}
function _mbed_die__async_cb_86($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 5630
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5632
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5634
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 5635
 _wait_ms(150); //@line 5636
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 78; //@line 5639
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 5640
  HEAP32[$4 >> 2] = $2; //@line 5641
  sp = STACKTOP; //@line 5642
  return;
 }
 ___async_unwind = 0; //@line 5645
 HEAP32[$ReallocAsyncCtx14 >> 2] = 78; //@line 5646
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 5647
 HEAP32[$4 >> 2] = $2; //@line 5648
 sp = STACKTOP; //@line 5649
 return;
}
function _mbed_die__async_cb_85($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 5605
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5607
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5609
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 5610
 _wait_ms(150); //@line 5611
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 79; //@line 5614
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 5615
  HEAP32[$4 >> 2] = $2; //@line 5616
  sp = STACKTOP; //@line 5617
  return;
 }
 ___async_unwind = 0; //@line 5620
 HEAP32[$ReallocAsyncCtx13 >> 2] = 79; //@line 5621
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 5622
 HEAP32[$4 >> 2] = $2; //@line 5623
 sp = STACKTOP; //@line 5624
 return;
}
function _mbed_die__async_cb_84($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 5580
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5582
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5584
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 5585
 _wait_ms(150); //@line 5586
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 80; //@line 5589
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 5590
  HEAP32[$4 >> 2] = $2; //@line 5591
  sp = STACKTOP; //@line 5592
  return;
 }
 ___async_unwind = 0; //@line 5595
 HEAP32[$ReallocAsyncCtx12 >> 2] = 80; //@line 5596
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 5597
 HEAP32[$4 >> 2] = $2; //@line 5598
 sp = STACKTOP; //@line 5599
 return;
}
function _mbed_die__async_cb_83($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 5555
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5557
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5559
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 5560
 _wait_ms(150); //@line 5561
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 81; //@line 5564
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 5565
  HEAP32[$4 >> 2] = $2; //@line 5566
  sp = STACKTOP; //@line 5567
  return;
 }
 ___async_unwind = 0; //@line 5570
 HEAP32[$ReallocAsyncCtx11 >> 2] = 81; //@line 5571
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 5572
 HEAP32[$4 >> 2] = $2; //@line 5573
 sp = STACKTOP; //@line 5574
 return;
}
function _mbed_die__async_cb_82($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 5530
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5532
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5534
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 5535
 _wait_ms(150); //@line 5536
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 82; //@line 5539
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 5540
  HEAP32[$4 >> 2] = $2; //@line 5541
  sp = STACKTOP; //@line 5542
  return;
 }
 ___async_unwind = 0; //@line 5545
 HEAP32[$ReallocAsyncCtx10 >> 2] = 82; //@line 5546
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 5547
 HEAP32[$4 >> 2] = $2; //@line 5548
 sp = STACKTOP; //@line 5549
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
 sp = STACKTOP; //@line 5280
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5282
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5284
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 5285
 _wait_ms(150); //@line 5286
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 76; //@line 5289
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 5290
  HEAP32[$4 >> 2] = $2; //@line 5291
  sp = STACKTOP; //@line 5292
  return;
 }
 ___async_unwind = 0; //@line 5295
 HEAP32[$ReallocAsyncCtx16 >> 2] = 76; //@line 5296
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 5297
 HEAP32[$4 >> 2] = $2; //@line 5298
 sp = STACKTOP; //@line 5299
 return;
}
function _mbed_die__async_cb_81($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 5505
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5507
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5509
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 5510
 _wait_ms(150); //@line 5511
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 83; //@line 5514
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 5515
  HEAP32[$4 >> 2] = $2; //@line 5516
  sp = STACKTOP; //@line 5517
  return;
 }
 ___async_unwind = 0; //@line 5520
 HEAP32[$ReallocAsyncCtx9 >> 2] = 83; //@line 5521
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 5522
 HEAP32[$4 >> 2] = $2; //@line 5523
 sp = STACKTOP; //@line 5524
 return;
}
function _mbed_die__async_cb_80($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 5480
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5482
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5484
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 5485
 _wait_ms(400); //@line 5486
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 84; //@line 5489
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 5490
  HEAP32[$4 >> 2] = $2; //@line 5491
  sp = STACKTOP; //@line 5492
  return;
 }
 ___async_unwind = 0; //@line 5495
 HEAP32[$ReallocAsyncCtx8 >> 2] = 84; //@line 5496
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 5497
 HEAP32[$4 >> 2] = $2; //@line 5498
 sp = STACKTOP; //@line 5499
 return;
}
function _mbed_die__async_cb_79($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 5455
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5457
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5459
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 5460
 _wait_ms(400); //@line 5461
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 85; //@line 5464
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 5465
  HEAP32[$4 >> 2] = $2; //@line 5466
  sp = STACKTOP; //@line 5467
  return;
 }
 ___async_unwind = 0; //@line 5470
 HEAP32[$ReallocAsyncCtx7 >> 2] = 85; //@line 5471
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 5472
 HEAP32[$4 >> 2] = $2; //@line 5473
 sp = STACKTOP; //@line 5474
 return;
}
function _mbed_die__async_cb_78($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 5430
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5432
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5434
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 5435
 _wait_ms(400); //@line 5436
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 86; //@line 5439
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 5440
  HEAP32[$4 >> 2] = $2; //@line 5441
  sp = STACKTOP; //@line 5442
  return;
 }
 ___async_unwind = 0; //@line 5445
 HEAP32[$ReallocAsyncCtx6 >> 2] = 86; //@line 5446
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 5447
 HEAP32[$4 >> 2] = $2; //@line 5448
 sp = STACKTOP; //@line 5449
 return;
}
function _mbed_die__async_cb_77($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 5405
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5407
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5409
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 5410
 _wait_ms(400); //@line 5411
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 87; //@line 5414
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 5415
  HEAP32[$4 >> 2] = $2; //@line 5416
  sp = STACKTOP; //@line 5417
  return;
 }
 ___async_unwind = 0; //@line 5420
 HEAP32[$ReallocAsyncCtx5 >> 2] = 87; //@line 5421
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 5422
 HEAP32[$4 >> 2] = $2; //@line 5423
 sp = STACKTOP; //@line 5424
 return;
}
function _mbed_die__async_cb_76($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 5380
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5382
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5384
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 5385
 _wait_ms(400); //@line 5386
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 88; //@line 5389
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 5390
  HEAP32[$4 >> 2] = $2; //@line 5391
  sp = STACKTOP; //@line 5392
  return;
 }
 ___async_unwind = 0; //@line 5395
 HEAP32[$ReallocAsyncCtx4 >> 2] = 88; //@line 5396
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 5397
 HEAP32[$4 >> 2] = $2; //@line 5398
 sp = STACKTOP; //@line 5399
 return;
}
function _mbed_die__async_cb_75($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5355
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5357
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5359
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 5360
 _wait_ms(400); //@line 5361
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 89; //@line 5364
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 5365
  HEAP32[$4 >> 2] = $2; //@line 5366
  sp = STACKTOP; //@line 5367
  return;
 }
 ___async_unwind = 0; //@line 5370
 HEAP32[$ReallocAsyncCtx3 >> 2] = 89; //@line 5371
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 5372
 HEAP32[$4 >> 2] = $2; //@line 5373
 sp = STACKTOP; //@line 5374
 return;
}
function _mbed_die__async_cb_74($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5330
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5332
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5334
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 5335
 _wait_ms(400); //@line 5336
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 90; //@line 5339
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 5340
  HEAP32[$4 >> 2] = $2; //@line 5341
  sp = STACKTOP; //@line 5342
  return;
 }
 ___async_unwind = 0; //@line 5345
 HEAP32[$ReallocAsyncCtx2 >> 2] = 90; //@line 5346
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 5347
 HEAP32[$4 >> 2] = $2; //@line 5348
 sp = STACKTOP; //@line 5349
 return;
}
function _mbed_die__async_cb_73($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5305
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5307
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5309
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 5310
 _wait_ms(400); //@line 5311
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 91; //@line 5314
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 5315
  HEAP32[$4 >> 2] = $2; //@line 5316
  sp = STACKTOP; //@line 5317
  return;
 }
 ___async_unwind = 0; //@line 5320
 HEAP32[$ReallocAsyncCtx >> 2] = 91; //@line 5321
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 5322
 HEAP32[$4 >> 2] = $2; //@line 5323
 sp = STACKTOP; //@line 5324
 return;
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2663
 STACKTOP = STACKTOP + 16 | 0; //@line 2664
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2664
 $1 = sp; //@line 2665
 HEAP32[$1 >> 2] = $varargs; //@line 2666
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2667
 _mbed_error_vfprintf($0, $1); //@line 2668
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 92; //@line 2671
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 2673
  sp = STACKTOP; //@line 2674
  STACKTOP = sp; //@line 2675
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2677
  STACKTOP = sp; //@line 2678
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
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 6179
 newDynamicTop = oldDynamicTop + increment | 0; //@line 6180
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 6184
  ___setErrNo(12); //@line 6185
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 6189
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 6193
   ___setErrNo(12); //@line 6194
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 6198
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 7122
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 7124
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 7130
  $11 = ___fwritex($0, $4, $3) | 0; //@line 7131
  if ($phitmp) {
   $13 = $11; //@line 7133
  } else {
   ___unlockfile($3); //@line 7135
   $13 = $11; //@line 7136
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 7140
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 7144
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 7147
 }
 return $15 | 0; //@line 7149
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 9458
 } else {
  $$056 = $2; //@line 9460
  $15 = $1; //@line 9460
  $8 = $0; //@line 9460
  while (1) {
   $14 = $$056 + -1 | 0; //@line 9468
   HEAP8[$14 >> 0] = HEAPU8[3099 + ($8 & 15) >> 0] | 0 | $3; //@line 9469
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 9470
   $15 = tempRet0; //@line 9471
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 9476
    break;
   } else {
    $$056 = $14; //@line 9479
   }
  }
 }
 return $$05$lcssa | 0; //@line 9483
}
function __ZSt9terminatev() {
 var $0 = 0, $16 = 0, $17 = 0, $2 = 0, $5 = 0, sp = 0;
 sp = STACKTOP; //@line 12655
 $0 = ___cxa_get_globals_fast() | 0; //@line 12656
 if ($0 | 0) {
  $2 = HEAP32[$0 >> 2] | 0; //@line 12659
  if ($2 | 0) {
   $5 = $2 + 48 | 0; //@line 12663
   if ((HEAP32[$5 >> 2] & -256 | 0) == 1126902528 ? (HEAP32[$5 + 4 >> 2] | 0) == 1129074247 : 0) {
    $16 = HEAP32[$2 + 12 >> 2] | 0; //@line 12675
    _emscripten_alloc_async_context(4, sp) | 0; //@line 12676
    __ZSt11__terminatePFvvE($16); //@line 12677
   }
  }
 }
 $17 = __ZSt13get_terminatev() | 0; //@line 12682
 _emscripten_alloc_async_context(4, sp) | 0; //@line 12683
 __ZSt11__terminatePFvvE($17); //@line 12684
}
function __ZN4mbed11InterruptInD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13558
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13560
 $4 = HEAP32[$2 + 52 >> 2] | 0; //@line 13562
 if (!$4) {
  return;
 }
 $8 = HEAP32[$4 + 8 >> 2] | 0; //@line 13569
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 13570
 FUNCTION_TABLE_vi[$8 & 255]($2 + 40 | 0); //@line 13571
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 22; //@line 13574
  sp = STACKTOP; //@line 13575
  return;
 }
 ___async_unwind = 0; //@line 13578
 HEAP32[$ReallocAsyncCtx2 >> 2] = 22; //@line 13579
 sp = STACKTOP; //@line 13580
 return;
}
function _main__async_cb_38($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 2846
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2848
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2850
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2852
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(16) | 0; //@line 2853
 _puts(2443) | 0; //@line 2854
 if (!___async) {
  ___async_unwind = 0; //@line 2857
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 113; //@line 2859
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 2861
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 2863
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 2865
 sp = STACKTOP; //@line 2866
 return;
}
function _main__async_cb_37($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 2820
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2822
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2824
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2826
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 2827
 _puts(2546) | 0; //@line 2828
 if (!___async) {
  ___async_unwind = 0; //@line 2831
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 114; //@line 2833
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $2; //@line 2835
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $4; //@line 2837
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $6; //@line 2839
 sp = STACKTOP; //@line 2840
 return;
}
function __GLOBAL__sub_I_main_cpp__async_cb_67($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5061
 HEAP32[1412] = 440; //@line 5062
 HEAP32[1422] = 0; //@line 5063
 HEAP32[1423] = 0; //@line 5063
 HEAP32[1424] = 0; //@line 5063
 HEAP32[1425] = 0; //@line 5063
 HEAP8[5704] = 1; //@line 5064
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 5065
 __ZN4mbed10TimerEventC2Ev(5712); //@line 5066
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 108; //@line 5069
  sp = STACKTOP; //@line 5070
  return;
 }
 ___async_unwind = 0; //@line 5073
 HEAP32[$ReallocAsyncCtx >> 2] = 108; //@line 5074
 sp = STACKTOP; //@line 5075
 return;
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 7339
 $3 = HEAP8[$1 >> 0] | 0; //@line 7341
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 7345
 $7 = HEAP32[$0 >> 2] | 0; //@line 7346
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 7351
  HEAP32[$0 + 4 >> 2] = 0; //@line 7353
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 7355
  HEAP32[$0 + 28 >> 2] = $14; //@line 7357
  HEAP32[$0 + 20 >> 2] = $14; //@line 7359
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 7365
  $$0 = 0; //@line 7366
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 7369
  $$0 = -1; //@line 7370
 }
 return $$0 | 0; //@line 7372
}
function __ZN4mbed7Timeout7handlerEv__async_cb_33($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2653
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2655
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2657
 $5 = HEAP32[HEAP32[$2 >> 2] >> 2] | 0; //@line 2659
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 2660
 FUNCTION_TABLE_vi[$5 & 255]($4); //@line 2661
 if (!___async) {
  ___async_unwind = 0; //@line 2664
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 38; //@line 2666
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 2668
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 2670
 sp = STACKTOP; //@line 2671
 return;
}
function _twobyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$sink$in = 0, $$sink17$sink = 0, $11 = 0, $12 = 0, $8 = 0;
 $8 = (HEAPU8[$1 >> 0] | 0) << 8 | (HEAPU8[$1 + 1 >> 0] | 0); //@line 10926
 $$sink$in = HEAPU8[$0 >> 0] | 0; //@line 10929
 $$sink17$sink = $0; //@line 10929
 while (1) {
  $11 = $$sink17$sink + 1 | 0; //@line 10931
  $12 = HEAP8[$11 >> 0] | 0; //@line 10932
  if (!($12 << 24 >> 24)) {
   break;
  }
  $$sink$in = $$sink$in << 8 & 65280 | $12 & 255; //@line 10940
  if (($$sink$in | 0) == ($8 | 0)) {
   break;
  } else {
   $$sink17$sink = $11; //@line 10945
  }
 }
 return ($12 << 24 >> 24 ? $$sink17$sink : 0) | 0; //@line 10950
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 9495
 } else {
  $$06 = $2; //@line 9497
  $11 = $1; //@line 9497
  $7 = $0; //@line 9497
  while (1) {
   $10 = $$06 + -1 | 0; //@line 9502
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 9503
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 9504
   $11 = tempRet0; //@line 9505
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 9510
    break;
   } else {
    $$06 = $10; //@line 9513
   }
  }
 }
 return $$0$lcssa | 0; //@line 9517
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13531
 do {
  if (!$0) {
   $3 = 0; //@line 13535
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13537
   $2 = ___dynamic_cast($0, 176, 232, 0) | 0; //@line 13538
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 168; //@line 13541
    sp = STACKTOP; //@line 13542
    return 0; //@line 13543
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 13545
    $3 = ($2 | 0) != 0 & 1; //@line 13548
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 13553
}
function _invoke_ticker__async_cb_5($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13816
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 13822
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 13823
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 13824
 FUNCTION_TABLE_vi[$5 & 255]($6); //@line 13825
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 105; //@line 13828
  sp = STACKTOP; //@line 13829
  return;
 }
 ___async_unwind = 0; //@line 13832
 HEAP32[$ReallocAsyncCtx >> 2] = 105; //@line 13833
 sp = STACKTOP; //@line 13834
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 9139
 } else {
  $$04 = 0; //@line 9141
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 9144
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 9148
   $12 = $7 + 1 | 0; //@line 9149
   HEAP32[$0 >> 2] = $12; //@line 9150
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 9156
    break;
   } else {
    $$04 = $11; //@line 9159
   }
  }
 }
 return $$0$lcssa | 0; //@line 9163
}
function ___muldi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $x_sroa_0_0_extract_trunc = 0, $y_sroa_0_0_extract_trunc = 0, $1$0 = 0, $1$1 = 0;
 $x_sroa_0_0_extract_trunc = $a$0; //@line 5712
 $y_sroa_0_0_extract_trunc = $b$0; //@line 5713
 $1$0 = ___muldsi3($x_sroa_0_0_extract_trunc, $y_sroa_0_0_extract_trunc) | 0; //@line 5714
 $1$1 = tempRet0; //@line 5715
 return (tempRet0 = (Math_imul($a$1, $y_sroa_0_0_extract_trunc) | 0) + (Math_imul($b$1, $x_sroa_0_0_extract_trunc) | 0) + $1$1 | $1$1 & 0, $1$0 | 0 | 0) | 0; //@line 5717
}
function runPostSets() {}
function ___muldsi3($a, $b) {
 $a = $a | 0;
 $b = $b | 0;
 var $1 = 0, $2 = 0, $3 = 0, $6 = 0, $8 = 0, $11 = 0, $12 = 0;
 $1 = $a & 65535; //@line 5697
 $2 = $b & 65535; //@line 5698
 $3 = Math_imul($2, $1) | 0; //@line 5699
 $6 = $a >>> 16; //@line 5700
 $8 = ($3 >>> 16) + (Math_imul($2, $6) | 0) | 0; //@line 5701
 $11 = $b >>> 16; //@line 5702
 $12 = Math_imul($11, $1) | 0; //@line 5703
 return (tempRet0 = ($8 >>> 16) + (Math_imul($11, $6) | 0) + ((($8 & 65535) + $12 | 0) >>> 16) | 0, $8 + $12 << 16 | $3 & 65535 | 0) | 0; //@line 5704
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
 sp = STACKTOP; //@line 3220
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3221
 _puts(2395) | 0; //@line 3222
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 110; //@line 3225
  sp = STACKTOP; //@line 3226
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3229
  $2 = (_emscripten_asm_const_ii(10, HEAP32[1454] | 0) | 0) == 0 & 1; //@line 3233
  _emscripten_asm_const_iii(2, HEAP32[1454] | 0, $2 | 0) | 0; //@line 3235
  return;
 }
}
function __Z10blink_led1v() {
 var $2 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3199
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3200
 _puts(2312) | 0; //@line 3201
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 109; //@line 3204
  sp = STACKTOP; //@line 3205
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3208
  $2 = (_emscripten_asm_const_ii(10, HEAP32[1448] | 0) | 0) == 0 & 1; //@line 3212
  _emscripten_asm_const_iii(2, HEAP32[1448] | 0, $2 | 0) | 0; //@line 3214
  return;
 }
}
function ___fflush_unlocked__async_cb_19($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1293
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1295
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1297
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1299
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 1301
 HEAP32[$4 >> 2] = 0; //@line 1302
 HEAP32[$6 >> 2] = 0; //@line 1303
 HEAP32[$8 >> 2] = 0; //@line 1304
 HEAP32[$10 >> 2] = 0; //@line 1305
 HEAP32[___async_retval >> 2] = 0; //@line 1307
 return;
}
function __ZN4mbed6Ticker7handlerEv($0) {
 $0 = $0 | 0;
 var $2 = 0, $5 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3044
 $2 = HEAP32[$0 + 52 >> 2] | 0; //@line 3046
 if (!$2) {
  return;
 }
 $5 = HEAP32[$2 >> 2] | 0; //@line 3052
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3053
 FUNCTION_TABLE_vi[$5 & 255]($0 + 40 | 0); //@line 3054
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 103; //@line 3057
  sp = STACKTOP; //@line 3058
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3061
 return;
}
function __ZN4mbed6TickerD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5140
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5142
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 5143
 __ZN4mbed10TimerEventD2Ev($2); //@line 5144
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 5147
  sp = STACKTOP; //@line 5148
  return;
 }
 ___async_unwind = 0; //@line 5151
 HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 5152
 sp = STACKTOP; //@line 5153
 return;
}
function __ZN4mbed7TimeoutD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5232
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5234
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 5235
 __ZN4mbed10TimerEventD2Ev($2); //@line 5236
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 33; //@line 5239
  sp = STACKTOP; //@line 5240
  return;
 }
 ___async_unwind = 0; //@line 5243
 HEAP32[$ReallocAsyncCtx2 >> 2] = 33; //@line 5244
 sp = STACKTOP; //@line 5245
 return;
}
function _mbed_vtracef__async_cb_7($0) {
 $0 = $0 | 0;
 var $1 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 494
 $1 = HEAP32[92] | 0; //@line 495
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 496
 FUNCTION_TABLE_vi[$1 & 255](1636); //@line 497
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
function _serial_putc__async_cb_21($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1358
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1360
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 1361
 _fflush($2) | 0; //@line 1362
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 98; //@line 1365
  sp = STACKTOP; //@line 1366
  return;
 }
 ___async_unwind = 0; //@line 1369
 HEAP32[$ReallocAsyncCtx >> 2] = 98; //@line 1370
 sp = STACKTOP; //@line 1371
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
 sp = STACKTOP; //@line 1325
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1327
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 1328
 __ZN4mbed10TimerEventD2Ev($2); //@line 1329
 if (!___async) {
  ___async_unwind = 0; //@line 1332
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 35; //@line 1334
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 1336
 sp = STACKTOP; //@line 1337
 return;
}
function __ZN4mbed6TickerD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5018
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5020
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 5021
 __ZN4mbed10TimerEventD2Ev($2); //@line 5022
 if (!___async) {
  ___async_unwind = 0; //@line 5025
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 102; //@line 5027
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 5029
 sp = STACKTOP; //@line 5030
 return;
}
function _emscripten_async_resume() {
 ___async = 0; //@line 6030
 ___async_unwind = 1; //@line 6031
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 6037
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 6041
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 6045
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 6047
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 6762
 STACKTOP = STACKTOP + 16 | 0; //@line 6763
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 6763
 $vararg_buffer = sp; //@line 6764
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 6768
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 6770
 STACKTOP = sp; //@line 6771
 return $5 | 0; //@line 6771
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
 sp = STACKTOP; //@line 2816
 $2 = HEAP32[1444] | 0; //@line 2817
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2818
 FUNCTION_TABLE_vii[$2 & 3]($0, $1); //@line 2819
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 96; //@line 2822
  sp = STACKTOP; //@line 2823
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2826
  return;
 }
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 5972
 STACKTOP = STACKTOP + 16 | 0; //@line 5973
 $rem = __stackBase__ | 0; //@line 5974
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 5975
 STACKTOP = __stackBase__; //@line 5976
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 5977
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 5742
 if ((ret | 0) < 8) return ret | 0; //@line 5743
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 5744
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 5745
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 5746
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 5747
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 5748
}
function ___cxa_get_globals_fast() {
 var $3 = 0, sp = 0;
 sp = STACKTOP; //@line 11876
 STACKTOP = STACKTOP + 16 | 0; //@line 11877
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11877
 if (!(_pthread_once(6512, 10) | 0)) {
  $3 = _pthread_getspecific(HEAP32[1629] | 0) | 0; //@line 11883
  STACKTOP = sp; //@line 11884
  return $3 | 0; //@line 11884
 } else {
  _abort_message(5284, sp); //@line 11886
 }
 return 0; //@line 11889
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 12044
 }
 return;
}
function __Z12turn_led3_onv() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3241
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3242
 _puts(2416) | 0; //@line 3243
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 111; //@line 3246
  sp = STACKTOP; //@line 3247
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3250
  _emscripten_asm_const_iii(2, HEAP32[1460] | 0, 1) | 0; //@line 3252
  return;
 }
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 11581
 $6 = HEAP32[$5 >> 2] | 0; //@line 11582
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 11583
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 11585
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 11587
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 11590
 return $2 | 0; //@line 11591
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 13840
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 13842
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 13843
 _fputc(10, $2) | 0; //@line 13844
 if (!___async) {
  ___async_unwind = 0; //@line 13847
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 144; //@line 13849
 sp = STACKTOP; //@line 13850
 return;
}
function __ZL25default_terminate_handlerv__async_cb_54($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4217
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4219
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4221
 HEAP32[$2 >> 2] = 5145; //@line 4222
 HEAP32[$2 + 4 >> 2] = $4; //@line 4224
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 4226
 _abort_message(5009, $2); //@line 4227
}
function _gpio_irq_init($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0;
 if (($1 | 0) == -1) {
  $$0 = -1; //@line 2839
  return $$0 | 0; //@line 2840
 }
 HEAP32[1444] = $2; //@line 2842
 HEAP32[$0 >> 2] = $1; //@line 2843
 HEAP32[$0 + 4 >> 2] = $1; //@line 2845
 _emscripten_asm_const_iii(5, $3 | 0, $1 | 0) | 0; //@line 2846
 $$0 = 0; //@line 2847
 return $$0 | 0; //@line 2848
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13781
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 13784
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 13789
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 13792
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 12638
 STACKTOP = STACKTOP + 16 | 0; //@line 12639
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12639
 _free($0); //@line 12641
 if (!(_pthread_setspecific(HEAP32[1629] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 12646
  return;
 } else {
  _abort_message(5383, sp); //@line 12648
 }
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4939
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 4950
  $$0 = 1; //@line 4951
 } else {
  $$0 = 0; //@line 4953
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 4957
 return;
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 2879
 HEAP32[$0 >> 2] = $1; //@line 2880
 HEAP32[1445] = 1; //@line 2881
 $4 = $0; //@line 2882
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 2887
 $10 = 5784; //@line 2888
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 2890
 HEAP32[$10 + 4 >> 2] = $9; //@line 2893
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 12120
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3147
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3148
 _emscripten_sleep($0 | 0); //@line 3149
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 106; //@line 3152
  sp = STACKTOP; //@line 3153
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3156
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
function _main__async_cb_35($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 2757
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(4) | 0; //@line 2758
 _wait_ms(-1); //@line 2759
 if (!___async) {
  ___async_unwind = 0; //@line 2762
 }
 HEAP32[$ReallocAsyncCtx10 >> 2] = 121; //@line 2764
 sp = STACKTOP; //@line 2765
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 12184
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 12188
  }
 }
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var sp = 0;
 sp = STACKTOP; //@line 12623
 STACKTOP = STACKTOP + 16 | 0; //@line 12624
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12624
 if (!(_pthread_key_create(6516, 153) | 0)) {
  STACKTOP = sp; //@line 12629
  return;
 } else {
  _abort_message(5333, sp); //@line 12631
 }
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 6006
 HEAP32[new_frame + 4 >> 2] = sp; //@line 6008
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 6010
 ___async_cur_frame = new_frame; //@line 6011
 return ___async_cur_frame + 8 | 0; //@line 6012
}
function __GLOBAL__sub_I_main_cpp__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[1438] = 0; //@line 5052
 HEAP32[1439] = 0; //@line 5052
 HEAP32[1440] = 0; //@line 5052
 HEAP32[1441] = 0; //@line 5052
 HEAP8[5768] = 1; //@line 5053
 HEAP32[1428] = 288; //@line 5054
 __ZN4mbed11InterruptInC2E7PinName(5864, 1337); //@line 5055
 return;
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 1399
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 1403
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 1406
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 5995
  return low << bits; //@line 5996
 }
 tempRet0 = low << bits - 32; //@line 5998
 return 0; //@line 5999
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 5984
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 5985
 }
 tempRet0 = 0; //@line 5987
 return high >>> bits - 32 | 0; //@line 5988
}
function _fflush__async_cb_2($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13670
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 13672
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 13675
 return;
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_57($0) {
 $0 = $0 | 0;
 var $6 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4418
 HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 4420
 _gpio_irq_set($6 + 28 | 0, 2, 1); //@line 4422
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
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 4617
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 4620
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 4623
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 3161
 } else {
  $$0 = -1; //@line 3163
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 3166
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 7469
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 7475
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 7479
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 6261
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 6018
 stackRestore(___async_cur_frame | 0); //@line 6019
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 6020
}
function _fputc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5121
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 5122
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 5124
 return;
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5261
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 5262
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 5264
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 10580
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 10580
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 10582
 return $1 | 0; //@line 10583
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 2802
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 2808
 _emscripten_asm_const_iii(4, $0 | 0, $1 | 0) | 0; //@line 2809
 return;
}
function _gpio_init_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 2787
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 2793
 _emscripten_asm_const_iii(3, $0 | 0, $1 | 0) | 0; //@line 2794
 return;
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 6928
  $$0 = -1; //@line 6929
 } else {
  $$0 = $0; //@line 6931
 }
 return $$0 | 0; //@line 6933
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 5735
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 5736
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 5737
}
function __ZN4mbed6Ticker5setupEy($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $4 = 0;
 $4 = ___udivdi3($1 | 0, $2 | 0, 1e3, 0) | 0; //@line 3116
 _emscripten_asm_const_iii(9, $0 + 40 | 0, $4 | 0) | 0; //@line 3118
 return;
}
function __Z11toggle_led2v__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(10, HEAP32[1454] | 0) | 0) == 0 & 1; //@line 13802
 _emscripten_asm_const_iii(2, HEAP32[1454] | 0, $3 | 0) | 0; //@line 13804
 return;
}
function __Z10blink_led1v__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0;
 $3 = (_emscripten_asm_const_ii(10, HEAP32[1448] | 0) | 0) == 0 & 1; //@line 1317
 _emscripten_asm_const_iii(2, HEAP32[1448] | 0, $3 | 0) | 0; //@line 1319
 return;
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 6254
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
 l = a + c >>> 0; //@line 5727
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 5729
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 6247
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 7614
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 7619
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 9640
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 9643
 }
 return $$0 | 0; //@line 9645
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 6219
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 5964
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 7109
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 7113
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 3077
 return;
}
function _gpio_irq_set($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 _emscripten_asm_const_iiii(7, HEAP32[$0 + 4 >> 2] | 0, $1 | 0, $2 | 0) | 0; //@line 2869
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 6025
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 6026
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_60($0) {
 $0 = $0 | 0;
 _gpio_irq_set((HEAP32[$0 + 8 >> 2] | 0) + 28 | 0, 2, 0); //@line 4533
 return;
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 12723
 __ZdlPv($0); //@line 12724
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 12406
 __ZdlPv($0); //@line 12407
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 7605
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 7607
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 11934
 __ZdlPv($0); //@line 11935
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
 HEAP32[HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 4 >> 2] >> 2] = HEAP32[$0 + 8 >> 2]; //@line 1384
 return;
}
function _out_670($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 if (!(HEAP32[$0 >> 2] & 32)) {
  ___fwritex($1, $2, $0) | 0; //@line 9125
 }
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 3697
 return;
}
function b113(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 6580
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
 return ($0 | 0) == ($1 | 0) | 0; //@line 12131
}
function __ZSt13get_terminatev() {
 var $0 = 0;
 $0 = HEAP32[272] | 0; //@line 12713
 HEAP32[272] = $0 + 0; //@line 12715
 return $0 | 0; //@line 12717
}
function _gpio_irq_free($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iii(6, HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 2858
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
 FUNCTION_TABLE_vii[index & 3](a1 | 0, a2 | 0); //@line 6240
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
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 6052
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_61($0) {
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
 nullFunc_viiiii(0); //@line 6577
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __Z12turn_led3_onv__async_cb($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iii(2, HEAP32[1460] | 0, 1) | 0; //@line 3713
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 9588
}
function _fflush__async_cb_3($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 13685
 return;
}
function _snprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 4332
 return;
}
function _fputc__async_cb_69($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 5134
 return;
}
function _putc__async_cb_72($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 5274
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 6212
}
function __ZN4mbed11InterruptInD0Ev__async_cb_18($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 1221
 return;
}
function b8(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 6280
 return 0; //@line 6280
}
function b7(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 6277
 return 0; //@line 6277
}
function b6(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 6274
 return 0; //@line 6274
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(5436, HEAP32[$0 + 4 >> 2] | 0); //@line 5168
}
function __ZN4mbed6Ticker6detachEv($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_ii(8, $0 + 40 | 0) | 0; //@line 3126
 return;
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 255](a1 | 0); //@line 6233
}
function b109(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 6574
}
function __ZN4mbed7TimeoutD0Ev__async_cb_20($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 1346
 return;
}
function __ZN4mbed6TickerD0Ev__async_cb_66($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 5039
 return;
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 10833
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_56($0) {
 $0 = $0 | 0;
 return;
}
function _main__async_cb_42($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 3054
 return;
}
function dynCall_i(index) {
 index = index | 0;
 return FUNCTION_TABLE_i[index & 3]() | 0; //@line 6205
}
function __ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_64($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 15](); //@line 6226
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 6986
}
function __ZN4mbed8CallbackIFvvEE13function_dtorIPS1_EEvPv($0) {
 $0 = $0 | 0;
 return;
}
function b4(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 6271
 return 0; //@line 6271
}
function b107(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(3); //@line 6571
}
function b106(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(0); //@line 6568
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
function _abort_message__async_cb_6($0) {
 $0 = $0 | 0;
 _abort(); //@line 13857
}
function ___ofl_lock() {
 ___lock(6500); //@line 7624
 return 6508; //@line 7625
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
 ___cxa_pure_virtual(); //@line 6286
}
function __ZN4mbed7Timeout7handlerEv__async_cb_32($0) {
 $0 = $0 | 0;
 return;
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
 return _pthread_self() | 0; //@line 10754
}
function __ZN4mbed10TimerEvent3irqEj__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 10760
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
function __ZN4mbed7TimeoutD2Ev__async_cb_71($0) {
 $0 = $0 | 0;
 return;
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 11760
 return;
}
function __ZN4mbed6TickerD2Ev__async_cb_70($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_53($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_52($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_49($0) {
 $0 = $0 | 0;
 return;
}
function _schedule_interrupt__async_cb_48($0) {
 $0 = $0 | 0;
 return;
}
function _mbed_assert_internal__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b2() {
 nullFunc_i(3); //@line 6268
 return 0; //@line 6268
}
function b1() {
 nullFunc_i(0); //@line 6265
 return 0; //@line 6265
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
 ___unlock(6500); //@line 7630
 return;
}
function b104(p0) {
 p0 = p0 | 0;
 nullFunc_vi(255); //@line 6565
}
function b103(p0) {
 p0 = p0 | 0;
 nullFunc_vi(254); //@line 6562
}
function b102(p0) {
 p0 = p0 | 0;
 nullFunc_vi(253); //@line 6559
}
function b101(p0) {
 p0 = p0 | 0;
 nullFunc_vi(252); //@line 6556
}
function b100(p0) {
 p0 = p0 | 0;
 nullFunc_vi(251); //@line 6553
}
function b99(p0) {
 p0 = p0 | 0;
 nullFunc_vi(250); //@line 6550
}
function b98(p0) {
 p0 = p0 | 0;
 nullFunc_vi(249); //@line 6547
}
function b97(p0) {
 p0 = p0 | 0;
 nullFunc_vi(248); //@line 6544
}
function b96(p0) {
 p0 = p0 | 0;
 nullFunc_vi(247); //@line 6541
}
function b95(p0) {
 p0 = p0 | 0;
 nullFunc_vi(246); //@line 6538
}
function b94(p0) {
 p0 = p0 | 0;
 nullFunc_vi(245); //@line 6535
}
function b93(p0) {
 p0 = p0 | 0;
 nullFunc_vi(244); //@line 6532
}
function b92(p0) {
 p0 = p0 | 0;
 nullFunc_vi(243); //@line 6529
}
function b91(p0) {
 p0 = p0 | 0;
 nullFunc_vi(242); //@line 6526
}
function b90(p0) {
 p0 = p0 | 0;
 nullFunc_vi(241); //@line 6523
}
function b89(p0) {
 p0 = p0 | 0;
 nullFunc_vi(240); //@line 6520
}
function b88(p0) {
 p0 = p0 | 0;
 nullFunc_vi(239); //@line 6517
}
function b87(p0) {
 p0 = p0 | 0;
 nullFunc_vi(238); //@line 6514
}
function b86(p0) {
 p0 = p0 | 0;
 nullFunc_vi(237); //@line 6511
}
function b85(p0) {
 p0 = p0 | 0;
 nullFunc_vi(236); //@line 6508
}
function b84(p0) {
 p0 = p0 | 0;
 nullFunc_vi(235); //@line 6505
}
function b83(p0) {
 p0 = p0 | 0;
 nullFunc_vi(234); //@line 6502
}
function b82(p0) {
 p0 = p0 | 0;
 nullFunc_vi(233); //@line 6499
}
function b81(p0) {
 p0 = p0 | 0;
 nullFunc_vi(232); //@line 6496
}
function b80(p0) {
 p0 = p0 | 0;
 nullFunc_vi(231); //@line 6493
}
function b79(p0) {
 p0 = p0 | 0;
 nullFunc_vi(230); //@line 6490
}
function b78(p0) {
 p0 = p0 | 0;
 nullFunc_vi(229); //@line 6487
}
function b77(p0) {
 p0 = p0 | 0;
 nullFunc_vi(228); //@line 6484
}
function b76(p0) {
 p0 = p0 | 0;
 nullFunc_vi(227); //@line 6481
}
function b75(p0) {
 p0 = p0 | 0;
 nullFunc_vi(226); //@line 6478
}
function b74(p0) {
 p0 = p0 | 0;
 nullFunc_vi(225); //@line 6475
}
function b73(p0) {
 p0 = p0 | 0;
 nullFunc_vi(224); //@line 6472
}
function b72(p0) {
 p0 = p0 | 0;
 nullFunc_vi(223); //@line 6469
}
function b71(p0) {
 p0 = p0 | 0;
 nullFunc_vi(222); //@line 6466
}
function b70(p0) {
 p0 = p0 | 0;
 nullFunc_vi(221); //@line 6463
}
function b69(p0) {
 p0 = p0 | 0;
 nullFunc_vi(220); //@line 6460
}
function b68(p0) {
 p0 = p0 | 0;
 nullFunc_vi(219); //@line 6457
}
function b67(p0) {
 p0 = p0 | 0;
 nullFunc_vi(218); //@line 6454
}
function b66(p0) {
 p0 = p0 | 0;
 nullFunc_vi(217); //@line 6451
}
function b65(p0) {
 p0 = p0 | 0;
 nullFunc_vi(216); //@line 6448
}
function b64(p0) {
 p0 = p0 | 0;
 nullFunc_vi(215); //@line 6445
}
function b63(p0) {
 p0 = p0 | 0;
 nullFunc_vi(214); //@line 6442
}
function b62(p0) {
 p0 = p0 | 0;
 nullFunc_vi(213); //@line 6439
}
function b61(p0) {
 p0 = p0 | 0;
 nullFunc_vi(212); //@line 6436
}
function b60(p0) {
 p0 = p0 | 0;
 nullFunc_vi(211); //@line 6433
}
function b59(p0) {
 p0 = p0 | 0;
 nullFunc_vi(210); //@line 6430
}
function b58(p0) {
 p0 = p0 | 0;
 nullFunc_vi(209); //@line 6427
}
function b57(p0) {
 p0 = p0 | 0;
 nullFunc_vi(208); //@line 6424
}
function b56(p0) {
 p0 = p0 | 0;
 nullFunc_vi(207); //@line 6421
}
function b55(p0) {
 p0 = p0 | 0;
 nullFunc_vi(206); //@line 6418
}
function b54(p0) {
 p0 = p0 | 0;
 nullFunc_vi(205); //@line 6415
}
function b53(p0) {
 p0 = p0 | 0;
 nullFunc_vi(204); //@line 6412
}
function b52(p0) {
 p0 = p0 | 0;
 nullFunc_vi(203); //@line 6409
}
function b51(p0) {
 p0 = p0 | 0;
 nullFunc_vi(202); //@line 6406
}
function b50(p0) {
 p0 = p0 | 0;
 nullFunc_vi(201); //@line 6403
}
function b49(p0) {
 p0 = p0 | 0;
 nullFunc_vi(200); //@line 6400
}
function b48(p0) {
 p0 = p0 | 0;
 nullFunc_vi(199); //@line 6397
}
function b47(p0) {
 p0 = p0 | 0;
 nullFunc_vi(198); //@line 6394
}
function b46(p0) {
 p0 = p0 | 0;
 nullFunc_vi(197); //@line 6391
}
function b45(p0) {
 p0 = p0 | 0;
 nullFunc_vi(196); //@line 6388
}
function b44(p0) {
 p0 = p0 | 0;
 nullFunc_vi(195); //@line 6385
}
function b43(p0) {
 p0 = p0 | 0;
 nullFunc_vi(194); //@line 6382
}
function b42(p0) {
 p0 = p0 | 0;
 nullFunc_vi(193); //@line 6379
}
function b41(p0) {
 p0 = p0 | 0;
 nullFunc_vi(192); //@line 6376
}
function b40(p0) {
 p0 = p0 | 0;
 nullFunc_vi(191); //@line 6373
}
function b39(p0) {
 p0 = p0 | 0;
 nullFunc_vi(190); //@line 6370
}
function b38(p0) {
 p0 = p0 | 0;
 nullFunc_vi(189); //@line 6367
}
function b37(p0) {
 p0 = p0 | 0;
 nullFunc_vi(188); //@line 6364
}
function b36(p0) {
 p0 = p0 | 0;
 nullFunc_vi(187); //@line 6361
}
function b35(p0) {
 p0 = p0 | 0;
 nullFunc_vi(186); //@line 6358
}
function b34(p0) {
 p0 = p0 | 0;
 nullFunc_vi(185); //@line 6355
}
function b33(p0) {
 p0 = p0 | 0;
 nullFunc_vi(184); //@line 6352
}
function b32(p0) {
 p0 = p0 | 0;
 nullFunc_vi(183); //@line 6349
}
function b31(p0) {
 p0 = p0 | 0;
 nullFunc_vi(182); //@line 6346
}
function b30(p0) {
 p0 = p0 | 0;
 nullFunc_vi(181); //@line 6343
}
function b29(p0) {
 p0 = p0 | 0;
 nullFunc_vi(180); //@line 6340
}
function b28(p0) {
 p0 = p0 | 0;
 nullFunc_vi(179); //@line 6337
}
function b27(p0) {
 p0 = p0 | 0;
 nullFunc_vi(178); //@line 6334
}
function b26(p0) {
 p0 = p0 | 0;
 nullFunc_vi(177); //@line 6331
}
function b25(p0) {
 p0 = p0 | 0;
 nullFunc_vi(176); //@line 6328
}
function b24(p0) {
 p0 = p0 | 0;
 nullFunc_vi(175); //@line 6325
}
function b23(p0) {
 p0 = p0 | 0;
 nullFunc_vi(174); //@line 6322
}
function b22(p0) {
 p0 = p0 | 0;
 nullFunc_vi(173); //@line 6319
}
function b21(p0) {
 p0 = p0 | 0;
 nullFunc_vi(172); //@line 6316
}
function b20(p0) {
 p0 = p0 | 0;
 nullFunc_vi(171); //@line 6313
}
function b19(p0) {
 p0 = p0 | 0;
 nullFunc_vi(170); //@line 6310
}
function b18(p0) {
 p0 = p0 | 0;
 nullFunc_vi(169); //@line 6307
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 6944
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 7261
}
function b17(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 6304
}
function _us_ticker_set_interrupt($0) {
 $0 = $0 | 0;
 return;
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _initialize__async_cb_27($0) {
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
 return 452; //@line 3142
}
function _get_us_ticker_data() {
 return 396; //@line 2328
}
function __ZSt9terminatev__async_cb_68($0) {
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
 return 6496; //@line 6938
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
 return 0; //@line 2933
}
function _pthread_self() {
 return 720; //@line 6991
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
 nullFunc_v(15); //@line 6301
}
function b14() {
 nullFunc_v(14); //@line 6298
}
function b13() {
 nullFunc_v(13); //@line 6295
}
function b12() {
 nullFunc_v(12); //@line 6292
}
function b11() {
 nullFunc_v(11); //@line 6289
}
function b10() {
 nullFunc_v(0); //@line 6283
}
function _us_ticker_init() {
 return;
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_i = [b1,_us_ticker_read,_us_ticker_get_info,b2];
var FUNCTION_TABLE_ii = [b4,___stdio_close];
var FUNCTION_TABLE_iiii = [b6,___stdio_write,___stdio_seek,___stdout_write,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b7,b8];
var FUNCTION_TABLE_v = [b10,___cxa_pure_virtual__wrapper,_us_ticker_init,_us_ticker_disable_interrupt,_us_ticker_clear_interrupt,_us_ticker_fire_interrupt,__ZL25default_terminate_handlerv,__Z10blink_led1v,__Z12turn_led3_onv,__Z11toggle_led2v,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev,b11,b12,b13,b14,b15];
var FUNCTION_TABLE_vi = [b17,__ZN4mbed11InterruptInD2Ev,__ZN4mbed11InterruptInD0Ev,__ZN4mbed7TimeoutD2Ev,__ZN4mbed7TimeoutD0Ev,__ZN4mbed7Timeout7handlerEv,__ZN4mbed10TimerEventD2Ev,__ZN4mbed10TimerEventD0Ev,_mbed_trace_default_print,__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv,__ZN4mbed8CallbackIFvvEE13function_dtorIPS1_EEvPv,_us_ticker_set_interrupt,__ZN4mbed6TickerD2Ev,__ZN4mbed6TickerD0Ev,__ZN4mbed6Ticker7handlerEv,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed11InterruptInD2Ev__async_cb,__ZN4mbed11InterruptInD2Ev__async_cb_1,__ZN4mbed11InterruptInD0Ev__async_cb,__ZN4mbed11InterruptInD0Ev__async_cb_18,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb,__ZN4mbed11InterruptIn12_irq_handlerEj14gpio_irq_event__async_cb_56,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_57
,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_58,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_59,__ZN4mbed11InterruptIn4fallENS_8CallbackIFvvEEE__async_cb_60,__ZN4mbed7TimeoutD2Ev__async_cb,__ZN4mbed7TimeoutD2Ev__async_cb_71,__ZN4mbed7TimeoutD0Ev__async_cb,__ZN4mbed7TimeoutD0Ev__async_cb_20,__ZN4mbed7Timeout7handlerEv__async_cb,__ZN4mbed7Timeout7handlerEv__async_cb_33,__ZN4mbed7Timeout7handlerEv__async_cb_31,__ZN4mbed7Timeout7handlerEv__async_cb_32,__ZN4mbed10TimerEventD2Ev__async_cb,__ZN4mbed10TimerEvent3irqEj,__ZN4mbed10TimerEventC2Ev__async_cb,__ZN4mbed10TimerEvent3irqEj__async_cb,_mbed_trace_default_print__async_cb,_mbed_tracef__async_cb,_mbed_vtracef__async_cb,_mbed_vtracef__async_cb_17,_mbed_vtracef__async_cb_7,_mbed_vtracef__async_cb_8,_mbed_vtracef__async_cb_9,_mbed_vtracef__async_cb_16,_mbed_vtracef__async_cb_10,_mbed_vtracef__async_cb_15,_mbed_vtracef__async_cb_11,_mbed_vtracef__async_cb_12,_mbed_vtracef__async_cb_13,_mbed_vtracef__async_cb_14,__ZN4mbed8CallbackIFvvEE13function_callIPS1_EEvPKv__async_cb
,_ticker_set_handler__async_cb,_initialize__async_cb,_initialize__async_cb_24,_initialize__async_cb_29,_initialize__async_cb_28,_initialize__async_cb_25,_initialize__async_cb_26,_initialize__async_cb_27,_schedule_interrupt__async_cb,_schedule_interrupt__async_cb_48,_schedule_interrupt__async_cb_49,_schedule_interrupt__async_cb_50,_schedule_interrupt__async_cb_51,_schedule_interrupt__async_cb_52,_schedule_interrupt__async_cb_53,_ticker_remove_event__async_cb,_mbed_assert_internal__async_cb,_mbed_die__async_cb_87,_mbed_die__async_cb_86,_mbed_die__async_cb_85,_mbed_die__async_cb_84,_mbed_die__async_cb_83,_mbed_die__async_cb_82,_mbed_die__async_cb_81,_mbed_die__async_cb_80,_mbed_die__async_cb_79,_mbed_die__async_cb_78,_mbed_die__async_cb_77,_mbed_die__async_cb_76,_mbed_die__async_cb_75
,_mbed_die__async_cb_74,_mbed_die__async_cb_73,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_vfprintf__async_cb,_mbed_error_vfprintf__async_cb_23,_mbed_error_vfprintf__async_cb_22,_handle_interrupt_in__async_cb,_serial_putc__async_cb_21,_serial_putc__async_cb,__ZN4mbed6TickerD2Ev__async_cb,__ZN4mbed6TickerD2Ev__async_cb_70,__ZN4mbed6TickerD0Ev__async_cb,__ZN4mbed6TickerD0Ev__async_cb_66,__ZN4mbed6Ticker7handlerEv__async_cb,_invoke_ticker__async_cb_5,_invoke_ticker__async_cb,_wait_ms__async_cb,__GLOBAL__sub_I_main_cpp__async_cb_67,__GLOBAL__sub_I_main_cpp__async_cb,__Z10blink_led1v__async_cb,__Z11toggle_led2v__async_cb,__Z12turn_led3_onv__async_cb,_main__async_cb_38,_main__async_cb_37,_main__async_cb_36,_main__async_cb_40,_main__async_cb,_main__async_cb_39,_main__async_cb_34
,_main__async_cb_41,_main__async_cb_35,_main__async_cb_42,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_62,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_63,__ZN4mbed6Ticker6attachENS_8CallbackIFvvEEEf__async_cb_64,_putc__async_cb_72,_putc__async_cb,___overflow__async_cb,_fflush__async_cb_3,_fflush__async_cb_2,_fflush__async_cb_4,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_19,_vfprintf__async_cb,_snprintf__async_cb,_vsnprintf__async_cb,_fputc__async_cb_69,_fputc__async_cb,_puts__async_cb,__ZL25default_terminate_handlerv__async_cb,__ZL25default_terminate_handlerv__async_cb_54,_abort_message__async_cb,_abort_message__async_cb_6,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_65,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_43
,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_61,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_30,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_47,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_46,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_45,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_44,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_55,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b18,b19,b20,b21,b22,b23,b24,b25,b26,b27
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
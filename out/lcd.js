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
 function($0, $1) { MbedJSHal.gpio.init_out($0, $1, 0); },
 function($0, $1, $2, $3) { window.MbedJSHal.C12832.update_display($0, $1, $2, new Uint8Array(Module.HEAPU8.buffer, $3, 4096)); },
 function($0, $1, $2) { window.MbedJSHal.C12832.init($0, $1, $2); },
 function($0) { console.log("TextDisplay putc", $0); }];

function _emscripten_asm_const_iii(code, a0, a1) {
  return ASM_CONSTS[code](a0, a1);
}

function _emscripten_asm_const_i(code) {
  return ASM_CONSTS[code]();
}

function _emscripten_asm_const_ii(code, a0) {
  return ASM_CONSTS[code](a0);
}

function _emscripten_asm_const_iiii(code, a0, a1, a2) {
  return ASM_CONSTS[code](a0, a1, a2);
}

function _emscripten_asm_const_iiiii(code, a0, a1, a2, a3) {
  return ASM_CONSTS[code](a0, a1, a2, a3);
}




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 15664;
/* global initializers */  __ATINIT__.push({ func: function() { __GLOBAL__sub_I_main_cpp() } });


memoryInitializer = "lcd.js.mem";





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

  
  
  
  var ERRNO_CODES={EPERM:1,ENOENT:2,ESRCH:3,EINTR:4,EIO:5,ENXIO:6,E2BIG:7,ENOEXEC:8,EBADF:9,ECHILD:10,EAGAIN:11,EWOULDBLOCK:11,ENOMEM:12,EACCES:13,EFAULT:14,ENOTBLK:15,EBUSY:16,EEXIST:17,EXDEV:18,ENODEV:19,ENOTDIR:20,EISDIR:21,EINVAL:22,ENFILE:23,EMFILE:24,ENOTTY:25,ETXTBSY:26,EFBIG:27,ENOSPC:28,ESPIPE:29,EROFS:30,EMLINK:31,EPIPE:32,EDOM:33,ERANGE:34,ENOMSG:42,EIDRM:43,ECHRNG:44,EL2NSYNC:45,EL3HLT:46,EL3RST:47,ELNRNG:48,EUNATCH:49,ENOCSI:50,EL2HLT:51,EDEADLK:35,ENOLCK:37,EBADE:52,EBADR:53,EXFULL:54,ENOANO:55,EBADRQC:56,EBADSLT:57,EDEADLOCK:35,EBFONT:59,ENOSTR:60,ENODATA:61,ETIME:62,ENOSR:63,ENONET:64,ENOPKG:65,EREMOTE:66,ENOLINK:67,EADV:68,ESRMNT:69,ECOMM:70,EPROTO:71,EMULTIHOP:72,EDOTDOT:73,EBADMSG:74,ENOTUNIQ:76,EBADFD:77,EREMCHG:78,ELIBACC:79,ELIBBAD:80,ELIBSCN:81,ELIBMAX:82,ELIBEXEC:83,ENOSYS:38,ENOTEMPTY:39,ENAMETOOLONG:36,ELOOP:40,EOPNOTSUPP:95,EPFNOSUPPORT:96,ECONNRESET:104,ENOBUFS:105,EAFNOSUPPORT:97,EPROTOTYPE:91,ENOTSOCK:88,ENOPROTOOPT:92,ESHUTDOWN:108,ECONNREFUSED:111,EADDRINUSE:98,ECONNABORTED:103,ENETUNREACH:101,ENETDOWN:100,ETIMEDOUT:110,EHOSTDOWN:112,EHOSTUNREACH:113,EINPROGRESS:115,EALREADY:114,EDESTADDRREQ:89,EMSGSIZE:90,EPROTONOSUPPORT:93,ESOCKTNOSUPPORT:94,EADDRNOTAVAIL:99,ENETRESET:102,EISCONN:106,ENOTCONN:107,ETOOMANYREFS:109,EUSERS:87,EDQUOT:122,ESTALE:116,ENOTSUP:95,ENOMEDIUM:123,EILSEQ:84,EOVERFLOW:75,ECANCELED:125,ENOTRECOVERABLE:131,EOWNERDEAD:130,ESTRPIPE:86};
  
  var ERRNO_MESSAGES={0:"Success",1:"Not super-user",2:"No such file or directory",3:"No such process",4:"Interrupted system call",5:"I/O error",6:"No such device or address",7:"Arg list too long",8:"Exec format error",9:"Bad file number",10:"No children",11:"No more processes",12:"Not enough core",13:"Permission denied",14:"Bad address",15:"Block device required",16:"Mount device busy",17:"File exists",18:"Cross-device link",19:"No such device",20:"Not a directory",21:"Is a directory",22:"Invalid argument",23:"Too many open files in system",24:"Too many open files",25:"Not a typewriter",26:"Text file busy",27:"File too large",28:"No space left on device",29:"Illegal seek",30:"Read only file system",31:"Too many links",32:"Broken pipe",33:"Math arg out of domain of func",34:"Math result not representable",35:"File locking deadlock error",36:"File or path name too long",37:"No record locks available",38:"Function not implemented",39:"Directory not empty",40:"Too many symbolic links",42:"No message of desired type",43:"Identifier removed",44:"Channel number out of range",45:"Level 2 not synchronized",46:"Level 3 halted",47:"Level 3 reset",48:"Link number out of range",49:"Protocol driver not attached",50:"No CSI structure available",51:"Level 2 halted",52:"Invalid exchange",53:"Invalid request descriptor",54:"Exchange full",55:"No anode",56:"Invalid request code",57:"Invalid slot",59:"Bad font file fmt",60:"Device not a stream",61:"No data (for no delay io)",62:"Timer expired",63:"Out of streams resources",64:"Machine is not on the network",65:"Package not installed",66:"The object is remote",67:"The link has been severed",68:"Advertise error",69:"Srmount error",70:"Communication error on send",71:"Protocol error",72:"Multihop attempted",73:"Cross mount point (not really error)",74:"Trying to read unreadable message",75:"Value too large for defined data type",76:"Given log. name not unique",77:"f.d. invalid for this operation",78:"Remote address changed",79:"Can   access a needed shared lib",80:"Accessing a corrupted shared lib",81:".lib section in a.out corrupted",82:"Attempting to link in too many libs",83:"Attempting to exec a shared library",84:"Illegal byte sequence",86:"Streams pipe error",87:"Too many users",88:"Socket operation on non-socket",89:"Destination address required",90:"Message too long",91:"Protocol wrong type for socket",92:"Protocol not available",93:"Unknown protocol",94:"Socket type not supported",95:"Not supported",96:"Protocol family not supported",97:"Address family not supported by protocol family",98:"Address already in use",99:"Address not available",100:"Network interface is not configured",101:"Network is unreachable",102:"Connection reset by network",103:"Connection aborted",104:"Connection reset by peer",105:"No buffer space available",106:"Socket is already connected",107:"Socket is not connected",108:"Can't send after socket shutdown",109:"Too many references",110:"Connection timed out",111:"Connection refused",112:"Host is down",113:"Host is unreachable",114:"Socket already connected",115:"Connection already in progress",116:"Stale file handle",122:"Quota exceeded",123:"No medium (in tape drive)",125:"Operation canceled",130:"Previous owner died",131:"State not recoverable"};
  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      else Module.printErr('failed to set errno from JS');
      return value;
    }
  
  var PATH={splitPath:function (filename) {
        var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return splitPathRe.exec(filename).slice(1);
      },normalizeArray:function (parts, allowAboveRoot) {
        // if the path tries to go above the root, `up` ends up > 0
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
          var last = parts[i];
          if (last === '.') {
            parts.splice(i, 1);
          } else if (last === '..') {
            parts.splice(i, 1);
            up++;
          } else if (up) {
            parts.splice(i, 1);
            up--;
          }
        }
        // if the path is allowed to go above the root, restore leading ..s
        if (allowAboveRoot) {
          for (; up; up--) {
            parts.unshift('..');
          }
        }
        return parts;
      },normalize:function (path) {
        var isAbsolute = path.charAt(0) === '/',
            trailingSlash = path.substr(-1) === '/';
        // Normalize the path
        path = PATH.normalizeArray(path.split('/').filter(function(p) {
          return !!p;
        }), !isAbsolute).join('/');
        if (!path && !isAbsolute) {
          path = '.';
        }
        if (path && trailingSlash) {
          path += '/';
        }
        return (isAbsolute ? '/' : '') + path;
      },dirname:function (path) {
        var result = PATH.splitPath(path),
            root = result[0],
            dir = result[1];
        if (!root && !dir) {
          // No dirname whatsoever
          return '.';
        }
        if (dir) {
          // It has a dirname, strip trailing slash
          dir = dir.substr(0, dir.length - 1);
        }
        return root + dir;
      },basename:function (path) {
        // EMSCRIPTEN return '/'' for '/', not an empty string
        if (path === '/') return '/';
        var lastSlash = path.lastIndexOf('/');
        if (lastSlash === -1) return path;
        return path.substr(lastSlash+1);
      },extname:function (path) {
        return PATH.splitPath(path)[3];
      },join:function () {
        var paths = Array.prototype.slice.call(arguments, 0);
        return PATH.normalize(paths.join('/'));
      },join2:function (l, r) {
        return PATH.normalize(l + '/' + r);
      },resolve:function () {
        var resolvedPath = '',
          resolvedAbsolute = false;
        for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
          var path = (i >= 0) ? arguments[i] : FS.cwd();
          // Skip empty and invalid entries
          if (typeof path !== 'string') {
            throw new TypeError('Arguments to path.resolve must be strings');
          } else if (!path) {
            return ''; // an invalid portion invalidates the whole thing
          }
          resolvedPath = path + '/' + resolvedPath;
          resolvedAbsolute = path.charAt(0) === '/';
        }
        // At this point the path should be resolved to a full absolute path, but
        // handle relative paths to be safe (might happen when process.cwd() fails)
        resolvedPath = PATH.normalizeArray(resolvedPath.split('/').filter(function(p) {
          return !!p;
        }), !resolvedAbsolute).join('/');
        return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
      },relative:function (from, to) {
        from = PATH.resolve(from).substr(1);
        to = PATH.resolve(to).substr(1);
        function trim(arr) {
          var start = 0;
          for (; start < arr.length; start++) {
            if (arr[start] !== '') break;
          }
          var end = arr.length - 1;
          for (; end >= 0; end--) {
            if (arr[end] !== '') break;
          }
          if (start > end) return [];
          return arr.slice(start, end - start + 1);
        }
        var fromParts = trim(from.split('/'));
        var toParts = trim(to.split('/'));
        var length = Math.min(fromParts.length, toParts.length);
        var samePartsLength = length;
        for (var i = 0; i < length; i++) {
          if (fromParts[i] !== toParts[i]) {
            samePartsLength = i;
            break;
          }
        }
        var outputParts = [];
        for (var i = samePartsLength; i < fromParts.length; i++) {
          outputParts.push('..');
        }
        outputParts = outputParts.concat(toParts.slice(samePartsLength));
        return outputParts.join('/');
      }};
  
  var TTY={ttys:[],init:function () {
        // https://github.com/kripken/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // currently, FS.init does not distinguish if process.stdin is a file or TTY
        //   // device, it always assumes it's a TTY device. because of this, we're forcing
        //   // process.stdin to UTF8 encoding to at least make stdin reading compatible
        //   // with text files until FS.init can be refactored.
        //   process['stdin']['setEncoding']('utf8');
        // }
      },shutdown:function () {
        // https://github.com/kripken/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // inolen: any idea as to why node -e 'process.stdin.read()' wouldn't exit immediately (with process.stdin being a tty)?
        //   // isaacs: because now it's reading from the stream, you've expressed interest in it, so that read() kicks off a _read() which creates a ReadReq operation
        //   // inolen: I thought read() in that case was a synchronous operation that just grabbed some amount of buffered data if it exists?
        //   // isaacs: it is. but it also triggers a _read() call, which calls readStart() on the handle
        //   // isaacs: do process.stdin.pause() and i'd think it'd probably close the pending call
        //   process['stdin']['pause']();
        // }
      },register:function (dev, ops) {
        TTY.ttys[dev] = { input: [], output: [], ops: ops };
        FS.registerDevice(dev, TTY.stream_ops);
      },stream_ops:{open:function (stream) {
          var tty = TTY.ttys[stream.node.rdev];
          if (!tty) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
          }
          stream.tty = tty;
          stream.seekable = false;
        },close:function (stream) {
          // flush any pending line data
          stream.tty.ops.flush(stream.tty);
        },flush:function (stream) {
          stream.tty.ops.flush(stream.tty);
        },read:function (stream, buffer, offset, length, pos /* ignored */) {
          if (!stream.tty || !stream.tty.ops.get_char) {
            throw new FS.ErrnoError(ERRNO_CODES.ENXIO);
          }
          var bytesRead = 0;
          for (var i = 0; i < length; i++) {
            var result;
            try {
              result = stream.tty.ops.get_char(stream.tty);
            } catch (e) {
              throw new FS.ErrnoError(ERRNO_CODES.EIO);
            }
            if (result === undefined && bytesRead === 0) {
              throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
            }
            if (result === null || result === undefined) break;
            bytesRead++;
            buffer[offset+i] = result;
          }
          if (bytesRead) {
            stream.node.timestamp = Date.now();
          }
          return bytesRead;
        },write:function (stream, buffer, offset, length, pos) {
          if (!stream.tty || !stream.tty.ops.put_char) {
            throw new FS.ErrnoError(ERRNO_CODES.ENXIO);
          }
          for (var i = 0; i < length; i++) {
            try {
              stream.tty.ops.put_char(stream.tty, buffer[offset+i]);
            } catch (e) {
              throw new FS.ErrnoError(ERRNO_CODES.EIO);
            }
          }
          if (length) {
            stream.node.timestamp = Date.now();
          }
          return i;
        }},default_tty_ops:{get_char:function (tty) {
          if (!tty.input.length) {
            var result = null;
            if (ENVIRONMENT_IS_NODE) {
              // we will read data by chunks of BUFSIZE
              var BUFSIZE = 256;
              var buf = new Buffer(BUFSIZE);
              var bytesRead = 0;
  
              var isPosixPlatform = (process.platform != 'win32'); // Node doesn't offer a direct check, so test by exclusion
  
              var fd = process.stdin.fd;
              if (isPosixPlatform) {
                // Linux and Mac cannot use process.stdin.fd (which isn't set up as sync)
                var usingDevice = false;
                try {
                  fd = fs.openSync('/dev/stdin', 'r');
                  usingDevice = true;
                } catch (e) {}
              }
  
              try {
                bytesRead = fs.readSync(fd, buf, 0, BUFSIZE, null);
              } catch(e) {
                // Cross-platform differences: on Windows, reading EOF throws an exception, but on other OSes,
                // reading EOF returns 0. Uniformize behavior by treating the EOF exception to return 0.
                if (e.toString().indexOf('EOF') != -1) bytesRead = 0;
                else throw e;
              }
  
              if (usingDevice) { fs.closeSync(fd); }
              if (bytesRead > 0) {
                result = buf.slice(0, bytesRead).toString('utf-8');
              } else {
                result = null;
              }
  
            } else if (typeof window != 'undefined' &&
              typeof window.prompt == 'function') {
              // Browser.
              result = window.prompt('Input: ');  // returns null on cancel
              if (result !== null) {
                result += '\n';
              }
            } else if (typeof readline == 'function') {
              // Command line.
              result = readline();
              if (result !== null) {
                result += '\n';
              }
            }
            if (!result) {
              return null;
            }
            tty.input = intArrayFromString(result, true);
          }
          return tty.input.shift();
        },put_char:function (tty, val) {
          if (val === null || val === 10) {
            Module['print'](UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val); // val == 0 would cut text output off in the middle.
          }
        },flush:function (tty) {
          if (tty.output && tty.output.length > 0) {
            Module['print'](UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          }
        }},default_tty1_ops:{put_char:function (tty, val) {
          if (val === null || val === 10) {
            Module['printErr'](UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val);
          }
        },flush:function (tty) {
          if (tty.output && tty.output.length > 0) {
            Module['printErr'](UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          }
        }}};
  
  var MEMFS={ops_table:null,mount:function (mount) {
        return MEMFS.createNode(null, '/', 16384 | 511 /* 0777 */, 0);
      },createNode:function (parent, name, mode, dev) {
        if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
          // no supported
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (!MEMFS.ops_table) {
          MEMFS.ops_table = {
            dir: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr,
                lookup: MEMFS.node_ops.lookup,
                mknod: MEMFS.node_ops.mknod,
                rename: MEMFS.node_ops.rename,
                unlink: MEMFS.node_ops.unlink,
                rmdir: MEMFS.node_ops.rmdir,
                readdir: MEMFS.node_ops.readdir,
                symlink: MEMFS.node_ops.symlink
              },
              stream: {
                llseek: MEMFS.stream_ops.llseek
              }
            },
            file: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr
              },
              stream: {
                llseek: MEMFS.stream_ops.llseek,
                read: MEMFS.stream_ops.read,
                write: MEMFS.stream_ops.write,
                allocate: MEMFS.stream_ops.allocate,
                mmap: MEMFS.stream_ops.mmap,
                msync: MEMFS.stream_ops.msync
              }
            },
            link: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr,
                readlink: MEMFS.node_ops.readlink
              },
              stream: {}
            },
            chrdev: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr
              },
              stream: FS.chrdev_stream_ops
            }
          };
        }
        var node = FS.createNode(parent, name, mode, dev);
        if (FS.isDir(node.mode)) {
          node.node_ops = MEMFS.ops_table.dir.node;
          node.stream_ops = MEMFS.ops_table.dir.stream;
          node.contents = {};
        } else if (FS.isFile(node.mode)) {
          node.node_ops = MEMFS.ops_table.file.node;
          node.stream_ops = MEMFS.ops_table.file.stream;
          node.usedBytes = 0; // The actual number of bytes used in the typed array, as opposed to contents.length which gives the whole capacity.
          // When the byte data of the file is populated, this will point to either a typed array, or a normal JS array. Typed arrays are preferred
          // for performance, and used by default. However, typed arrays are not resizable like normal JS arrays are, so there is a small disk size
          // penalty involved for appending file writes that continuously grow a file similar to std::vector capacity vs used -scheme.
          node.contents = null; 
        } else if (FS.isLink(node.mode)) {
          node.node_ops = MEMFS.ops_table.link.node;
          node.stream_ops = MEMFS.ops_table.link.stream;
        } else if (FS.isChrdev(node.mode)) {
          node.node_ops = MEMFS.ops_table.chrdev.node;
          node.stream_ops = MEMFS.ops_table.chrdev.stream;
        }
        node.timestamp = Date.now();
        // add the new node to the parent
        if (parent) {
          parent.contents[name] = node;
        }
        return node;
      },getFileDataAsRegularArray:function (node) {
        if (node.contents && node.contents.subarray) {
          var arr = [];
          for (var i = 0; i < node.usedBytes; ++i) arr.push(node.contents[i]);
          return arr; // Returns a copy of the original data.
        }
        return node.contents; // No-op, the file contents are already in a JS array. Return as-is.
      },getFileDataAsTypedArray:function (node) {
        if (!node.contents) return new Uint8Array;
        if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes); // Make sure to not return excess unused bytes.
        return new Uint8Array(node.contents);
      },expandFileStorage:function (node, newCapacity) {
        // If we are asked to expand the size of a file that already exists, revert to using a standard JS array to store the file
        // instead of a typed array. This makes resizing the array more flexible because we can just .push() elements at the back to
        // increase the size.
        if (node.contents && node.contents.subarray && newCapacity > node.contents.length) {
          node.contents = MEMFS.getFileDataAsRegularArray(node);
          node.usedBytes = node.contents.length; // We might be writing to a lazy-loaded file which had overridden this property, so force-reset it.
        }
  
        if (!node.contents || node.contents.subarray) { // Keep using a typed array if creating a new storage, or if old one was a typed array as well.
          var prevCapacity = node.contents ? node.contents.length : 0;
          if (prevCapacity >= newCapacity) return; // No need to expand, the storage was already large enough.
          // Don't expand strictly to the given requested limit if it's only a very small increase, but instead geometrically grow capacity.
          // For small filesizes (<1MB), perform size*2 geometric increase, but for large sizes, do a much more conservative size*1.125 increase to
          // avoid overshooting the allocation cap by a very large margin.
          var CAPACITY_DOUBLING_MAX = 1024 * 1024;
          newCapacity = Math.max(newCapacity, (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2.0 : 1.125)) | 0);
          if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256); // At minimum allocate 256b for each file when expanding.
          var oldContents = node.contents;
          node.contents = new Uint8Array(newCapacity); // Allocate new storage.
          if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0); // Copy old data over to the new storage.
          return;
        }
        // Not using a typed array to back the file storage. Use a standard JS array instead.
        if (!node.contents && newCapacity > 0) node.contents = [];
        while (node.contents.length < newCapacity) node.contents.push(0);
      },resizeFileStorage:function (node, newSize) {
        if (node.usedBytes == newSize) return;
        if (newSize == 0) {
          node.contents = null; // Fully decommit when requesting a resize to zero.
          node.usedBytes = 0;
          return;
        }
        if (!node.contents || node.contents.subarray) { // Resize a typed array if that is being used as the backing store.
          var oldContents = node.contents;
          node.contents = new Uint8Array(new ArrayBuffer(newSize)); // Allocate new storage.
          if (oldContents) {
            node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes))); // Copy old data over to the new storage.
          }
          node.usedBytes = newSize;
          return;
        }
        // Backing with a JS array.
        if (!node.contents) node.contents = [];
        if (node.contents.length > newSize) node.contents.length = newSize;
        else while (node.contents.length < newSize) node.contents.push(0);
        node.usedBytes = newSize;
      },node_ops:{getattr:function (node) {
          var attr = {};
          // device numbers reuse inode numbers.
          attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
          attr.ino = node.id;
          attr.mode = node.mode;
          attr.nlink = 1;
          attr.uid = 0;
          attr.gid = 0;
          attr.rdev = node.rdev;
          if (FS.isDir(node.mode)) {
            attr.size = 4096;
          } else if (FS.isFile(node.mode)) {
            attr.size = node.usedBytes;
          } else if (FS.isLink(node.mode)) {
            attr.size = node.link.length;
          } else {
            attr.size = 0;
          }
          attr.atime = new Date(node.timestamp);
          attr.mtime = new Date(node.timestamp);
          attr.ctime = new Date(node.timestamp);
          // NOTE: In our implementation, st_blocks = Math.ceil(st_size/st_blksize),
          //       but this is not required by the standard.
          attr.blksize = 4096;
          attr.blocks = Math.ceil(attr.size / attr.blksize);
          return attr;
        },setattr:function (node, attr) {
          if (attr.mode !== undefined) {
            node.mode = attr.mode;
          }
          if (attr.timestamp !== undefined) {
            node.timestamp = attr.timestamp;
          }
          if (attr.size !== undefined) {
            MEMFS.resizeFileStorage(node, attr.size);
          }
        },lookup:function (parent, name) {
          throw FS.genericErrors[ERRNO_CODES.ENOENT];
        },mknod:function (parent, name, mode, dev) {
          return MEMFS.createNode(parent, name, mode, dev);
        },rename:function (old_node, new_dir, new_name) {
          // if we're overwriting a directory at new_name, make sure it's empty.
          if (FS.isDir(old_node.mode)) {
            var new_node;
            try {
              new_node = FS.lookupNode(new_dir, new_name);
            } catch (e) {
            }
            if (new_node) {
              for (var i in new_node.contents) {
                throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
              }
            }
          }
          // do the internal rewiring
          delete old_node.parent.contents[old_node.name];
          old_node.name = new_name;
          new_dir.contents[new_name] = old_node;
          old_node.parent = new_dir;
        },unlink:function (parent, name) {
          delete parent.contents[name];
        },rmdir:function (parent, name) {
          var node = FS.lookupNode(parent, name);
          for (var i in node.contents) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
          }
          delete parent.contents[name];
        },readdir:function (node) {
          var entries = ['.', '..']
          for (var key in node.contents) {
            if (!node.contents.hasOwnProperty(key)) {
              continue;
            }
            entries.push(key);
          }
          return entries;
        },symlink:function (parent, newname, oldpath) {
          var node = MEMFS.createNode(parent, newname, 511 /* 0777 */ | 40960, 0);
          node.link = oldpath;
          return node;
        },readlink:function (node) {
          if (!FS.isLink(node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
          return node.link;
        }},stream_ops:{read:function (stream, buffer, offset, length, position) {
          var contents = stream.node.contents;
          if (position >= stream.node.usedBytes) return 0;
          var size = Math.min(stream.node.usedBytes - position, length);
          assert(size >= 0);
          if (size > 8 && contents.subarray) { // non-trivial, and typed array
            buffer.set(contents.subarray(position, position + size), offset);
          } else {
            for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i];
          }
          return size;
        },write:function (stream, buffer, offset, length, position, canOwn) {
          if (!length) return 0;
          var node = stream.node;
          node.timestamp = Date.now();
  
          if (buffer.subarray && (!node.contents || node.contents.subarray)) { // This write is from a typed array to a typed array?
            if (canOwn) {
              assert(position === 0, 'canOwn must imply no weird position inside the file');
              node.contents = buffer.subarray(offset, offset + length);
              node.usedBytes = length;
              return length;
            } else if (node.usedBytes === 0 && position === 0) { // If this is a simple first write to an empty file, do a fast set since we don't need to care about old data.
              node.contents = new Uint8Array(buffer.subarray(offset, offset + length));
              node.usedBytes = length;
              return length;
            } else if (position + length <= node.usedBytes) { // Writing to an already allocated and used subrange of the file?
              node.contents.set(buffer.subarray(offset, offset + length), position);
              return length;
            }
          }
  
          // Appending to an existing file and we need to reallocate, or source data did not come as a typed array.
          MEMFS.expandFileStorage(node, position+length);
          if (node.contents.subarray && buffer.subarray) node.contents.set(buffer.subarray(offset, offset + length), position); // Use typed array write if available.
          else {
            for (var i = 0; i < length; i++) {
             node.contents[position + i] = buffer[offset + i]; // Or fall back to manual write if not.
            }
          }
          node.usedBytes = Math.max(node.usedBytes, position+length);
          return length;
        },llseek:function (stream, offset, whence) {
          var position = offset;
          if (whence === 1) {  // SEEK_CUR.
            position += stream.position;
          } else if (whence === 2) {  // SEEK_END.
            if (FS.isFile(stream.node.mode)) {
              position += stream.node.usedBytes;
            }
          }
          if (position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
          return position;
        },allocate:function (stream, offset, length) {
          MEMFS.expandFileStorage(stream.node, offset + length);
          stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length);
        },mmap:function (stream, buffer, offset, length, position, prot, flags) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
          }
          var ptr;
          var allocated;
          var contents = stream.node.contents;
          // Only make a new copy when MAP_PRIVATE is specified.
          if ( !(flags & 2) &&
                (contents.buffer === buffer || contents.buffer === buffer.buffer) ) {
            // We can't emulate MAP_SHARED when the file is not backed by the buffer
            // we're mapping to (e.g. the HEAP buffer).
            allocated = false;
            ptr = contents.byteOffset;
          } else {
            // Try to avoid unnecessary slices.
            if (position > 0 || position + length < stream.node.usedBytes) {
              if (contents.subarray) {
                contents = contents.subarray(position, position + length);
              } else {
                contents = Array.prototype.slice.call(contents, position, position + length);
              }
            }
            allocated = true;
            ptr = _malloc(length);
            if (!ptr) {
              throw new FS.ErrnoError(ERRNO_CODES.ENOMEM);
            }
            buffer.set(contents, ptr);
          }
          return { ptr: ptr, allocated: allocated };
        },msync:function (stream, buffer, offset, length, mmapFlags) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
          }
          if (mmapFlags & 2) {
            // MAP_PRIVATE calls need not to be synced back to underlying fs
            return 0;
          }
  
          var bytesWritten = MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
          // should we check if bytesWritten and length are the same?
          return 0;
        }}};
  
  var IDBFS={dbs:{},indexedDB:function () {
        if (typeof indexedDB !== 'undefined') return indexedDB;
        var ret = null;
        if (typeof window === 'object') ret = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
        assert(ret, 'IDBFS used, but indexedDB not supported');
        return ret;
      },DB_VERSION:21,DB_STORE_NAME:"FILE_DATA",mount:function (mount) {
        // reuse all of the core MEMFS functionality
        return MEMFS.mount.apply(null, arguments);
      },syncfs:function (mount, populate, callback) {
        IDBFS.getLocalSet(mount, function(err, local) {
          if (err) return callback(err);
  
          IDBFS.getRemoteSet(mount, function(err, remote) {
            if (err) return callback(err);
  
            var src = populate ? remote : local;
            var dst = populate ? local : remote;
  
            IDBFS.reconcile(src, dst, callback);
          });
        });
      },getDB:function (name, callback) {
        // check the cache first
        var db = IDBFS.dbs[name];
        if (db) {
          return callback(null, db);
        }
  
        var req;
        try {
          req = IDBFS.indexedDB().open(name, IDBFS.DB_VERSION);
        } catch (e) {
          return callback(e);
        }
        if (!req) {
          return callback("Unable to connect to IndexedDB");
        }
        req.onupgradeneeded = function(e) {
          var db = e.target.result;
          var transaction = e.target.transaction;
  
          var fileStore;
  
          if (db.objectStoreNames.contains(IDBFS.DB_STORE_NAME)) {
            fileStore = transaction.objectStore(IDBFS.DB_STORE_NAME);
          } else {
            fileStore = db.createObjectStore(IDBFS.DB_STORE_NAME);
          }
  
          if (!fileStore.indexNames.contains('timestamp')) {
            fileStore.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
        req.onsuccess = function() {
          db = req.result;
  
          // add to the cache
          IDBFS.dbs[name] = db;
          callback(null, db);
        };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },getLocalSet:function (mount, callback) {
        var entries = {};
  
        function isRealDir(p) {
          return p !== '.' && p !== '..';
        };
        function toAbsolute(root) {
          return function(p) {
            return PATH.join2(root, p);
          }
        };
  
        var check = FS.readdir(mount.mountpoint).filter(isRealDir).map(toAbsolute(mount.mountpoint));
  
        while (check.length) {
          var path = check.pop();
          var stat;
  
          try {
            stat = FS.stat(path);
          } catch (e) {
            return callback(e);
          }
  
          if (FS.isDir(stat.mode)) {
            check.push.apply(check, FS.readdir(path).filter(isRealDir).map(toAbsolute(path)));
          }
  
          entries[path] = { timestamp: stat.mtime };
        }
  
        return callback(null, { type: 'local', entries: entries });
      },getRemoteSet:function (mount, callback) {
        var entries = {};
  
        IDBFS.getDB(mount.mountpoint, function(err, db) {
          if (err) return callback(err);
  
          try {
            var transaction = db.transaction([IDBFS.DB_STORE_NAME], 'readonly');
            transaction.onerror = function(e) {
              callback(this.error);
              e.preventDefault();
            };
  
            var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
            var index = store.index('timestamp');
  
            index.openKeyCursor().onsuccess = function(event) {
              var cursor = event.target.result;
  
              if (!cursor) {
                return callback(null, { type: 'remote', db: db, entries: entries });
              }
  
              entries[cursor.primaryKey] = { timestamp: cursor.key };
  
              cursor.continue();
            };
          } catch (e) {
            return callback(e);
          }
        });
      },loadLocalEntry:function (path, callback) {
        var stat, node;
  
        try {
          var lookup = FS.lookupPath(path);
          node = lookup.node;
          stat = FS.stat(path);
        } catch (e) {
          return callback(e);
        }
  
        if (FS.isDir(stat.mode)) {
          return callback(null, { timestamp: stat.mtime, mode: stat.mode });
        } else if (FS.isFile(stat.mode)) {
          // Performance consideration: storing a normal JavaScript array to a IndexedDB is much slower than storing a typed array.
          // Therefore always convert the file contents to a typed array first before writing the data to IndexedDB.
          node.contents = MEMFS.getFileDataAsTypedArray(node);
          return callback(null, { timestamp: stat.mtime, mode: stat.mode, contents: node.contents });
        } else {
          return callback(new Error('node type not supported'));
        }
      },storeLocalEntry:function (path, entry, callback) {
        try {
          if (FS.isDir(entry.mode)) {
            FS.mkdir(path, entry.mode);
          } else if (FS.isFile(entry.mode)) {
            FS.writeFile(path, entry.contents, { canOwn: true });
          } else {
            return callback(new Error('node type not supported'));
          }
  
          FS.chmod(path, entry.mode);
          FS.utime(path, entry.timestamp, entry.timestamp);
        } catch (e) {
          return callback(e);
        }
  
        callback(null);
      },removeLocalEntry:function (path, callback) {
        try {
          var lookup = FS.lookupPath(path);
          var stat = FS.stat(path);
  
          if (FS.isDir(stat.mode)) {
            FS.rmdir(path);
          } else if (FS.isFile(stat.mode)) {
            FS.unlink(path);
          }
        } catch (e) {
          return callback(e);
        }
  
        callback(null);
      },loadRemoteEntry:function (store, path, callback) {
        var req = store.get(path);
        req.onsuccess = function(event) { callback(null, event.target.result); };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },storeRemoteEntry:function (store, path, entry, callback) {
        var req = store.put(entry, path);
        req.onsuccess = function() { callback(null); };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },removeRemoteEntry:function (store, path, callback) {
        var req = store.delete(path);
        req.onsuccess = function() { callback(null); };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },reconcile:function (src, dst, callback) {
        var total = 0;
  
        var create = [];
        Object.keys(src.entries).forEach(function (key) {
          var e = src.entries[key];
          var e2 = dst.entries[key];
          if (!e2 || e.timestamp > e2.timestamp) {
            create.push(key);
            total++;
          }
        });
  
        var remove = [];
        Object.keys(dst.entries).forEach(function (key) {
          var e = dst.entries[key];
          var e2 = src.entries[key];
          if (!e2) {
            remove.push(key);
            total++;
          }
        });
  
        if (!total) {
          return callback(null);
        }
  
        var errored = false;
        var completed = 0;
        var db = src.type === 'remote' ? src.db : dst.db;
        var transaction = db.transaction([IDBFS.DB_STORE_NAME], 'readwrite');
        var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
  
        function done(err) {
          if (err) {
            if (!done.errored) {
              done.errored = true;
              return callback(err);
            }
            return;
          }
          if (++completed >= total) {
            return callback(null);
          }
        };
  
        transaction.onerror = function(e) {
          done(this.error);
          e.preventDefault();
        };
  
        // sort paths in ascending order so directory entries are created
        // before the files inside them
        create.sort().forEach(function (path) {
          if (dst.type === 'local') {
            IDBFS.loadRemoteEntry(store, path, function (err, entry) {
              if (err) return done(err);
              IDBFS.storeLocalEntry(path, entry, done);
            });
          } else {
            IDBFS.loadLocalEntry(path, function (err, entry) {
              if (err) return done(err);
              IDBFS.storeRemoteEntry(store, path, entry, done);
            });
          }
        });
  
        // sort paths in descending order so files are deleted before their
        // parent directories
        remove.sort().reverse().forEach(function(path) {
          if (dst.type === 'local') {
            IDBFS.removeLocalEntry(path, done);
          } else {
            IDBFS.removeRemoteEntry(store, path, done);
          }
        });
      }};
  
  var NODEFS={isWindows:false,staticInit:function () {
        NODEFS.isWindows = !!process.platform.match(/^win/);
        var flags = process["binding"]("constants");
        // Node.js 4 compatibility: it has no namespaces for constants
        if (flags["fs"]) {
          flags = flags["fs"];
        }
        NODEFS.flagsForNodeMap = {
          "1024": flags["O_APPEND"],
          "64": flags["O_CREAT"],
          "128": flags["O_EXCL"],
          "0": flags["O_RDONLY"],
          "2": flags["O_RDWR"],
          "4096": flags["O_SYNC"],
          "512": flags["O_TRUNC"],
          "1": flags["O_WRONLY"]
        };
      },bufferFrom:function (arrayBuffer) {
        // Node.js < 4.5 compatibility: Buffer.from does not support ArrayBuffer
        // Buffer.from before 4.5 was just a method inherited from Uint8Array
        // Buffer.alloc has been added with Buffer.from together, so check it instead
        return Buffer.alloc ? Buffer.from(arrayBuffer) : new Buffer(arrayBuffer);
      },mount:function (mount) {
        assert(ENVIRONMENT_IS_NODE);
        return NODEFS.createNode(null, '/', NODEFS.getMode(mount.opts.root), 0);
      },createNode:function (parent, name, mode, dev) {
        if (!FS.isDir(mode) && !FS.isFile(mode) && !FS.isLink(mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var node = FS.createNode(parent, name, mode);
        node.node_ops = NODEFS.node_ops;
        node.stream_ops = NODEFS.stream_ops;
        return node;
      },getMode:function (path) {
        var stat;
        try {
          stat = fs.lstatSync(path);
          if (NODEFS.isWindows) {
            // Node.js on Windows never represents permission bit 'x', so
            // propagate read bits to execute bits
            stat.mode = stat.mode | ((stat.mode & 292) >> 2);
          }
        } catch (e) {
          if (!e.code) throw e;
          throw new FS.ErrnoError(ERRNO_CODES[e.code]);
        }
        return stat.mode;
      },realPath:function (node) {
        var parts = [];
        while (node.parent !== node) {
          parts.push(node.name);
          node = node.parent;
        }
        parts.push(node.mount.opts.root);
        parts.reverse();
        return PATH.join.apply(null, parts);
      },flagsForNode:function (flags) {
        flags &= ~0x200000 /*O_PATH*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x800 /*O_NONBLOCK*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x8000 /*O_LARGEFILE*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x80000 /*O_CLOEXEC*/; // Some applications may pass it; it makes no sense for a single process.
        var newFlags = 0;
        for (var k in NODEFS.flagsForNodeMap) {
          if (flags & k) {
            newFlags |= NODEFS.flagsForNodeMap[k];
            flags ^= k;
          }
        }
  
        if (!flags) {
          return newFlags;
        } else {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
      },node_ops:{getattr:function (node) {
          var path = NODEFS.realPath(node);
          var stat;
          try {
            stat = fs.lstatSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
          // node.js v0.10.20 doesn't report blksize and blocks on Windows. Fake them with default blksize of 4096.
          // See http://support.microsoft.com/kb/140365
          if (NODEFS.isWindows && !stat.blksize) {
            stat.blksize = 4096;
          }
          if (NODEFS.isWindows && !stat.blocks) {
            stat.blocks = (stat.size+stat.blksize-1)/stat.blksize|0;
          }
          return {
            dev: stat.dev,
            ino: stat.ino,
            mode: stat.mode,
            nlink: stat.nlink,
            uid: stat.uid,
            gid: stat.gid,
            rdev: stat.rdev,
            size: stat.size,
            atime: stat.atime,
            mtime: stat.mtime,
            ctime: stat.ctime,
            blksize: stat.blksize,
            blocks: stat.blocks
          };
        },setattr:function (node, attr) {
          var path = NODEFS.realPath(node);
          try {
            if (attr.mode !== undefined) {
              fs.chmodSync(path, attr.mode);
              // update the common node structure mode as well
              node.mode = attr.mode;
            }
            if (attr.timestamp !== undefined) {
              var date = new Date(attr.timestamp);
              fs.utimesSync(path, date, date);
            }
            if (attr.size !== undefined) {
              fs.truncateSync(path, attr.size);
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },lookup:function (parent, name) {
          var path = PATH.join2(NODEFS.realPath(parent), name);
          var mode = NODEFS.getMode(path);
          return NODEFS.createNode(parent, name, mode);
        },mknod:function (parent, name, mode, dev) {
          var node = NODEFS.createNode(parent, name, mode, dev);
          // create the backing node for this in the fs root as well
          var path = NODEFS.realPath(node);
          try {
            if (FS.isDir(node.mode)) {
              fs.mkdirSync(path, node.mode);
            } else {
              fs.writeFileSync(path, '', { mode: node.mode });
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
          return node;
        },rename:function (oldNode, newDir, newName) {
          var oldPath = NODEFS.realPath(oldNode);
          var newPath = PATH.join2(NODEFS.realPath(newDir), newName);
          try {
            fs.renameSync(oldPath, newPath);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },unlink:function (parent, name) {
          var path = PATH.join2(NODEFS.realPath(parent), name);
          try {
            fs.unlinkSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },rmdir:function (parent, name) {
          var path = PATH.join2(NODEFS.realPath(parent), name);
          try {
            fs.rmdirSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },readdir:function (node) {
          var path = NODEFS.realPath(node);
          try {
            return fs.readdirSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },symlink:function (parent, newName, oldPath) {
          var newPath = PATH.join2(NODEFS.realPath(parent), newName);
          try {
            fs.symlinkSync(oldPath, newPath);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },readlink:function (node) {
          var path = NODEFS.realPath(node);
          try {
            path = fs.readlinkSync(path);
            path = NODEJS_PATH.relative(NODEJS_PATH.resolve(node.mount.opts.root), path);
            return path;
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        }},stream_ops:{open:function (stream) {
          var path = NODEFS.realPath(stream.node);
          try {
            if (FS.isFile(stream.node.mode)) {
              stream.nfd = fs.openSync(path, NODEFS.flagsForNode(stream.flags));
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },close:function (stream) {
          try {
            if (FS.isFile(stream.node.mode) && stream.nfd) {
              fs.closeSync(stream.nfd);
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },read:function (stream, buffer, offset, length, position) {
          // Node.js < 6 compatibility: node errors on 0 length reads
          if (length === 0) return 0;
          try {
            return fs.readSync(stream.nfd, NODEFS.bufferFrom(buffer.buffer), offset, length, position);
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },write:function (stream, buffer, offset, length, position) {
          try {
            return fs.writeSync(stream.nfd, NODEFS.bufferFrom(buffer.buffer), offset, length, position);
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },llseek:function (stream, offset, whence) {
          var position = offset;
          if (whence === 1) {  // SEEK_CUR.
            position += stream.position;
          } else if (whence === 2) {  // SEEK_END.
            if (FS.isFile(stream.node.mode)) {
              try {
                var stat = fs.fstatSync(stream.nfd);
                position += stat.size;
              } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
              }
            }
          }
  
          if (position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
  
          return position;
        }}};
  
  var WORKERFS={DIR_MODE:16895,FILE_MODE:33279,reader:null,mount:function (mount) {
        assert(ENVIRONMENT_IS_WORKER);
        if (!WORKERFS.reader) WORKERFS.reader = new FileReaderSync();
        var root = WORKERFS.createNode(null, '/', WORKERFS.DIR_MODE, 0);
        var createdParents = {};
        function ensureParent(path) {
          // return the parent node, creating subdirs as necessary
          var parts = path.split('/');
          var parent = root;
          for (var i = 0; i < parts.length-1; i++) {
            var curr = parts.slice(0, i+1).join('/');
            // Issue 4254: Using curr as a node name will prevent the node
            // from being found in FS.nameTable when FS.open is called on
            // a path which holds a child of this node,
            // given that all FS functions assume node names
            // are just their corresponding parts within their given path,
            // rather than incremental aggregates which include their parent's
            // directories.
            if (!createdParents[curr]) {
              createdParents[curr] = WORKERFS.createNode(parent, parts[i], WORKERFS.DIR_MODE, 0);
            }
            parent = createdParents[curr];
          }
          return parent;
        }
        function base(path) {
          var parts = path.split('/');
          return parts[parts.length-1];
        }
        // We also accept FileList here, by using Array.prototype
        Array.prototype.forEach.call(mount.opts["files"] || [], function(file) {
          WORKERFS.createNode(ensureParent(file.name), base(file.name), WORKERFS.FILE_MODE, 0, file, file.lastModifiedDate);
        });
        (mount.opts["blobs"] || []).forEach(function(obj) {
          WORKERFS.createNode(ensureParent(obj["name"]), base(obj["name"]), WORKERFS.FILE_MODE, 0, obj["data"]);
        });
        (mount.opts["packages"] || []).forEach(function(pack) {
          pack['metadata'].files.forEach(function(file) {
            var name = file.filename.substr(1); // remove initial slash
            WORKERFS.createNode(ensureParent(name), base(name), WORKERFS.FILE_MODE, 0, pack['blob'].slice(file.start, file.end));
          });
        });
        return root;
      },createNode:function (parent, name, mode, dev, contents, mtime) {
        var node = FS.createNode(parent, name, mode);
        node.mode = mode;
        node.node_ops = WORKERFS.node_ops;
        node.stream_ops = WORKERFS.stream_ops;
        node.timestamp = (mtime || new Date).getTime();
        assert(WORKERFS.FILE_MODE !== WORKERFS.DIR_MODE);
        if (mode === WORKERFS.FILE_MODE) {
          node.size = contents.size;
          node.contents = contents;
        } else {
          node.size = 4096;
          node.contents = {};
        }
        if (parent) {
          parent.contents[name] = node;
        }
        return node;
      },node_ops:{getattr:function (node) {
          return {
            dev: 1,
            ino: undefined,
            mode: node.mode,
            nlink: 1,
            uid: 0,
            gid: 0,
            rdev: undefined,
            size: node.size,
            atime: new Date(node.timestamp),
            mtime: new Date(node.timestamp),
            ctime: new Date(node.timestamp),
            blksize: 4096,
            blocks: Math.ceil(node.size / 4096),
          };
        },setattr:function (node, attr) {
          if (attr.mode !== undefined) {
            node.mode = attr.mode;
          }
          if (attr.timestamp !== undefined) {
            node.timestamp = attr.timestamp;
          }
        },lookup:function (parent, name) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        },mknod:function (parent, name, mode, dev) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },rename:function (oldNode, newDir, newName) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },unlink:function (parent, name) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },rmdir:function (parent, name) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },readdir:function (node) {
          var entries = ['.', '..'];
          for (var key in node.contents) {
            if (!node.contents.hasOwnProperty(key)) {
              continue;
            }
            entries.push(key);
          }
          return entries;
        },symlink:function (parent, newName, oldPath) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },readlink:function (node) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }},stream_ops:{read:function (stream, buffer, offset, length, position) {
          if (position >= stream.node.size) return 0;
          var chunk = stream.node.contents.slice(position, position + length);
          var ab = WORKERFS.reader.readAsArrayBuffer(chunk);
          buffer.set(new Uint8Array(ab), offset);
          return chunk.size;
        },write:function (stream, buffer, offset, length, position) {
          throw new FS.ErrnoError(ERRNO_CODES.EIO);
        },llseek:function (stream, offset, whence) {
          var position = offset;
          if (whence === 1) {  // SEEK_CUR.
            position += stream.position;
          } else if (whence === 2) {  // SEEK_END.
            if (FS.isFile(stream.node.mode)) {
              position += stream.node.size;
            }
          }
          if (position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
          return position;
        }}};
  
  var _stdin=STATICTOP; STATICTOP += 16;;
  
  var _stdout=STATICTOP; STATICTOP += 16;;
  
  var _stderr=STATICTOP; STATICTOP += 16;;var FS={root:null,mounts:[],devices:{},streams:[],nextInode:1,nameTable:null,currentPath:"/",initialized:false,ignorePermissions:true,trackingDelegate:{},tracking:{openFlags:{READ:1,WRITE:2}},ErrnoError:null,genericErrors:{},filesystems:null,syncFSRequests:0,handleFSError:function (e) {
        if (!(e instanceof FS.ErrnoError)) throw e + ' : ' + stackTrace();
        return ___setErrNo(e.errno);
      },lookupPath:function (path, opts) {
        path = PATH.resolve(FS.cwd(), path);
        opts = opts || {};
  
        if (!path) return { path: '', node: null };
  
        var defaults = {
          follow_mount: true,
          recurse_count: 0
        };
        for (var key in defaults) {
          if (opts[key] === undefined) {
            opts[key] = defaults[key];
          }
        }
  
        if (opts.recurse_count > 8) {  // max recursive lookup of 8
          throw new FS.ErrnoError(ERRNO_CODES.ELOOP);
        }
  
        // split the path
        var parts = PATH.normalizeArray(path.split('/').filter(function(p) {
          return !!p;
        }), false);
  
        // start at the root
        var current = FS.root;
        var current_path = '/';
  
        for (var i = 0; i < parts.length; i++) {
          var islast = (i === parts.length-1);
          if (islast && opts.parent) {
            // stop resolving
            break;
          }
  
          current = FS.lookupNode(current, parts[i]);
          current_path = PATH.join2(current_path, parts[i]);
  
          // jump to the mount's root node if this is a mountpoint
          if (FS.isMountpoint(current)) {
            if (!islast || (islast && opts.follow_mount)) {
              current = current.mounted.root;
            }
          }
  
          // by default, lookupPath will not follow a symlink if it is the final path component.
          // setting opts.follow = true will override this behavior.
          if (!islast || opts.follow) {
            var count = 0;
            while (FS.isLink(current.mode)) {
              var link = FS.readlink(current_path);
              current_path = PATH.resolve(PATH.dirname(current_path), link);
  
              var lookup = FS.lookupPath(current_path, { recurse_count: opts.recurse_count });
              current = lookup.node;
  
              if (count++ > 40) {  // limit max consecutive symlinks to 40 (SYMLOOP_MAX).
                throw new FS.ErrnoError(ERRNO_CODES.ELOOP);
              }
            }
          }
        }
  
        return { path: current_path, node: current };
      },getPath:function (node) {
        var path;
        while (true) {
          if (FS.isRoot(node)) {
            var mount = node.mount.mountpoint;
            if (!path) return mount;
            return mount[mount.length-1] !== '/' ? mount + '/' + path : mount + path;
          }
          path = path ? node.name + '/' + path : node.name;
          node = node.parent;
        }
      },hashName:function (parentid, name) {
        var hash = 0;
  
  
        for (var i = 0; i < name.length; i++) {
          hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
        }
        return ((parentid + hash) >>> 0) % FS.nameTable.length;
      },hashAddNode:function (node) {
        var hash = FS.hashName(node.parent.id, node.name);
        node.name_next = FS.nameTable[hash];
        FS.nameTable[hash] = node;
      },hashRemoveNode:function (node) {
        var hash = FS.hashName(node.parent.id, node.name);
        if (FS.nameTable[hash] === node) {
          FS.nameTable[hash] = node.name_next;
        } else {
          var current = FS.nameTable[hash];
          while (current) {
            if (current.name_next === node) {
              current.name_next = node.name_next;
              break;
            }
            current = current.name_next;
          }
        }
      },lookupNode:function (parent, name) {
        var err = FS.mayLookup(parent);
        if (err) {
          throw new FS.ErrnoError(err, parent);
        }
        var hash = FS.hashName(parent.id, name);
        for (var node = FS.nameTable[hash]; node; node = node.name_next) {
          var nodeName = node.name;
          if (node.parent.id === parent.id && nodeName === name) {
            return node;
          }
        }
        // if we failed to find it in the cache, call into the VFS
        return FS.lookup(parent, name);
      },createNode:function (parent, name, mode, rdev) {
        if (!FS.FSNode) {
          FS.FSNode = function(parent, name, mode, rdev) {
            if (!parent) {
              parent = this;  // root node sets parent to itself
            }
            this.parent = parent;
            this.mount = parent.mount;
            this.mounted = null;
            this.id = FS.nextInode++;
            this.name = name;
            this.mode = mode;
            this.node_ops = {};
            this.stream_ops = {};
            this.rdev = rdev;
          };
  
          FS.FSNode.prototype = {};
  
          // compatibility
          var readMode = 292 | 73;
          var writeMode = 146;
  
          // NOTE we must use Object.defineProperties instead of individual calls to
          // Object.defineProperty in order to make closure compiler happy
          Object.defineProperties(FS.FSNode.prototype, {
            read: {
              get: function() { return (this.mode & readMode) === readMode; },
              set: function(val) { val ? this.mode |= readMode : this.mode &= ~readMode; }
            },
            write: {
              get: function() { return (this.mode & writeMode) === writeMode; },
              set: function(val) { val ? this.mode |= writeMode : this.mode &= ~writeMode; }
            },
            isFolder: {
              get: function() { return FS.isDir(this.mode); }
            },
            isDevice: {
              get: function() { return FS.isChrdev(this.mode); }
            }
          });
        }
  
        var node = new FS.FSNode(parent, name, mode, rdev);
  
        FS.hashAddNode(node);
  
        return node;
      },destroyNode:function (node) {
        FS.hashRemoveNode(node);
      },isRoot:function (node) {
        return node === node.parent;
      },isMountpoint:function (node) {
        return !!node.mounted;
      },isFile:function (mode) {
        return (mode & 61440) === 32768;
      },isDir:function (mode) {
        return (mode & 61440) === 16384;
      },isLink:function (mode) {
        return (mode & 61440) === 40960;
      },isChrdev:function (mode) {
        return (mode & 61440) === 8192;
      },isBlkdev:function (mode) {
        return (mode & 61440) === 24576;
      },isFIFO:function (mode) {
        return (mode & 61440) === 4096;
      },isSocket:function (mode) {
        return (mode & 49152) === 49152;
      },flagModes:{"r":0,"rs":1052672,"r+":2,"w":577,"wx":705,"xw":705,"w+":578,"wx+":706,"xw+":706,"a":1089,"ax":1217,"xa":1217,"a+":1090,"ax+":1218,"xa+":1218},modeStringToFlags:function (str) {
        var flags = FS.flagModes[str];
        if (typeof flags === 'undefined') {
          throw new Error('Unknown file open mode: ' + str);
        }
        return flags;
      },flagsToPermissionString:function (flag) {
        var perms = ['r', 'w', 'rw'][flag & 3];
        if ((flag & 512)) {
          perms += 'w';
        }
        return perms;
      },nodePermissions:function (node, perms) {
        if (FS.ignorePermissions) {
          return 0;
        }
        // return 0 if any user, group or owner bits are set.
        if (perms.indexOf('r') !== -1 && !(node.mode & 292)) {
          return ERRNO_CODES.EACCES;
        } else if (perms.indexOf('w') !== -1 && !(node.mode & 146)) {
          return ERRNO_CODES.EACCES;
        } else if (perms.indexOf('x') !== -1 && !(node.mode & 73)) {
          return ERRNO_CODES.EACCES;
        }
        return 0;
      },mayLookup:function (dir) {
        var err = FS.nodePermissions(dir, 'x');
        if (err) return err;
        if (!dir.node_ops.lookup) return ERRNO_CODES.EACCES;
        return 0;
      },mayCreate:function (dir, name) {
        try {
          var node = FS.lookupNode(dir, name);
          return ERRNO_CODES.EEXIST;
        } catch (e) {
        }
        return FS.nodePermissions(dir, 'wx');
      },mayDelete:function (dir, name, isdir) {
        var node;
        try {
          node = FS.lookupNode(dir, name);
        } catch (e) {
          return e.errno;
        }
        var err = FS.nodePermissions(dir, 'wx');
        if (err) {
          return err;
        }
        if (isdir) {
          if (!FS.isDir(node.mode)) {
            return ERRNO_CODES.ENOTDIR;
          }
          if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
            return ERRNO_CODES.EBUSY;
          }
        } else {
          if (FS.isDir(node.mode)) {
            return ERRNO_CODES.EISDIR;
          }
        }
        return 0;
      },mayOpen:function (node, flags) {
        if (!node) {
          return ERRNO_CODES.ENOENT;
        }
        if (FS.isLink(node.mode)) {
          return ERRNO_CODES.ELOOP;
        } else if (FS.isDir(node.mode)) {
          if (FS.flagsToPermissionString(flags) !== 'r' || // opening for write
              (flags & 512)) { // TODO: check for O_SEARCH? (== search for dir only)
            return ERRNO_CODES.EISDIR;
          }
        }
        return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
      },MAX_OPEN_FDS:4096,nextfd:function (fd_start, fd_end) {
        fd_start = fd_start || 0;
        fd_end = fd_end || FS.MAX_OPEN_FDS;
        for (var fd = fd_start; fd <= fd_end; fd++) {
          if (!FS.streams[fd]) {
            return fd;
          }
        }
        throw new FS.ErrnoError(ERRNO_CODES.EMFILE);
      },getStream:function (fd) {
        return FS.streams[fd];
      },createStream:function (stream, fd_start, fd_end) {
        if (!FS.FSStream) {
          FS.FSStream = function(){};
          FS.FSStream.prototype = {};
          // compatibility
          Object.defineProperties(FS.FSStream.prototype, {
            object: {
              get: function() { return this.node; },
              set: function(val) { this.node = val; }
            },
            isRead: {
              get: function() { return (this.flags & 2097155) !== 1; }
            },
            isWrite: {
              get: function() { return (this.flags & 2097155) !== 0; }
            },
            isAppend: {
              get: function() { return (this.flags & 1024); }
            }
          });
        }
        // clone it, so we can return an instance of FSStream
        var newStream = new FS.FSStream();
        for (var p in stream) {
          newStream[p] = stream[p];
        }
        stream = newStream;
        var fd = FS.nextfd(fd_start, fd_end);
        stream.fd = fd;
        FS.streams[fd] = stream;
        return stream;
      },closeStream:function (fd) {
        FS.streams[fd] = null;
      },chrdev_stream_ops:{open:function (stream) {
          var device = FS.getDevice(stream.node.rdev);
          // override node's stream ops with the device's
          stream.stream_ops = device.stream_ops;
          // forward the open call
          if (stream.stream_ops.open) {
            stream.stream_ops.open(stream);
          }
        },llseek:function () {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }},major:function (dev) {
        return ((dev) >> 8);
      },minor:function (dev) {
        return ((dev) & 0xff);
      },makedev:function (ma, mi) {
        return ((ma) << 8 | (mi));
      },registerDevice:function (dev, ops) {
        FS.devices[dev] = { stream_ops: ops };
      },getDevice:function (dev) {
        return FS.devices[dev];
      },getMounts:function (mount) {
        var mounts = [];
        var check = [mount];
  
        while (check.length) {
          var m = check.pop();
  
          mounts.push(m);
  
          check.push.apply(check, m.mounts);
        }
  
        return mounts;
      },syncfs:function (populate, callback) {
        if (typeof(populate) === 'function') {
          callback = populate;
          populate = false;
        }
  
        FS.syncFSRequests++;
  
        if (FS.syncFSRequests > 1) {
          console.log('warning: ' + FS.syncFSRequests + ' FS.syncfs operations in flight at once, probably just doing extra work');
        }
  
        var mounts = FS.getMounts(FS.root.mount);
        var completed = 0;
  
        function doCallback(err) {
          assert(FS.syncFSRequests > 0);
          FS.syncFSRequests--;
          return callback(err);
        }
  
        function done(err) {
          if (err) {
            if (!done.errored) {
              done.errored = true;
              return doCallback(err);
            }
            return;
          }
          if (++completed >= mounts.length) {
            doCallback(null);
          }
        };
  
        // sync all mounts
        mounts.forEach(function (mount) {
          if (!mount.type.syncfs) {
            return done(null);
          }
          mount.type.syncfs(mount, populate, done);
        });
      },mount:function (type, opts, mountpoint) {
        var root = mountpoint === '/';
        var pseudo = !mountpoint;
        var node;
  
        if (root && FS.root) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        } else if (!root && !pseudo) {
          var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
          mountpoint = lookup.path;  // use the absolute path
          node = lookup.node;
  
          if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
          }
  
          if (!FS.isDir(node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
          }
        }
  
        var mount = {
          type: type,
          opts: opts,
          mountpoint: mountpoint,
          mounts: []
        };
  
        // create a root node for the fs
        var mountRoot = type.mount(mount);
        mountRoot.mount = mount;
        mount.root = mountRoot;
  
        if (root) {
          FS.root = mountRoot;
        } else if (node) {
          // set as a mountpoint
          node.mounted = mount;
  
          // add the new mount to the current mount's children
          if (node.mount) {
            node.mount.mounts.push(mount);
          }
        }
  
        return mountRoot;
      },unmount:function (mountpoint) {
        var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
        if (!FS.isMountpoint(lookup.node)) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
  
        // destroy the nodes for this mount, and all its child mounts
        var node = lookup.node;
        var mount = node.mounted;
        var mounts = FS.getMounts(mount);
  
        Object.keys(FS.nameTable).forEach(function (hash) {
          var current = FS.nameTable[hash];
  
          while (current) {
            var next = current.name_next;
  
            if (mounts.indexOf(current.mount) !== -1) {
              FS.destroyNode(current);
            }
  
            current = next;
          }
        });
  
        // no longer a mountpoint
        node.mounted = null;
  
        // remove this mount from the child mounts
        var idx = node.mount.mounts.indexOf(mount);
        assert(idx !== -1);
        node.mount.mounts.splice(idx, 1);
      },lookup:function (parent, name) {
        return parent.node_ops.lookup(parent, name);
      },mknod:function (path, mode, dev) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        if (!name || name === '.' || name === '..') {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var err = FS.mayCreate(parent, name);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.mknod) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        return parent.node_ops.mknod(parent, name, mode, dev);
      },create:function (path, mode) {
        mode = mode !== undefined ? mode : 438 /* 0666 */;
        mode &= 4095;
        mode |= 32768;
        return FS.mknod(path, mode, 0);
      },mkdir:function (path, mode) {
        mode = mode !== undefined ? mode : 511 /* 0777 */;
        mode &= 511 | 512;
        mode |= 16384;
        return FS.mknod(path, mode, 0);
      },mkdirTree:function (path, mode) {
        var dirs = path.split('/');
        var d = '';
        for (var i = 0; i < dirs.length; ++i) {
          if (!dirs[i]) continue;
          d += '/' + dirs[i];
          try {
            FS.mkdir(d, mode);
          } catch(e) {
            if (e.errno != ERRNO_CODES.EEXIST) throw e;
          }
        }
      },mkdev:function (path, mode, dev) {
        if (typeof(dev) === 'undefined') {
          dev = mode;
          mode = 438 /* 0666 */;
        }
        mode |= 8192;
        return FS.mknod(path, mode, dev);
      },symlink:function (oldpath, newpath) {
        if (!PATH.resolve(oldpath)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        var lookup = FS.lookupPath(newpath, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        var newname = PATH.basename(newpath);
        var err = FS.mayCreate(parent, newname);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.symlink) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        return parent.node_ops.symlink(parent, newname, oldpath);
      },rename:function (old_path, new_path) {
        var old_dirname = PATH.dirname(old_path);
        var new_dirname = PATH.dirname(new_path);
        var old_name = PATH.basename(old_path);
        var new_name = PATH.basename(new_path);
        // parents must exist
        var lookup, old_dir, new_dir;
        try {
          lookup = FS.lookupPath(old_path, { parent: true });
          old_dir = lookup.node;
          lookup = FS.lookupPath(new_path, { parent: true });
          new_dir = lookup.node;
        } catch (e) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        if (!old_dir || !new_dir) throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        // need to be part of the same mount
        if (old_dir.mount !== new_dir.mount) {
          throw new FS.ErrnoError(ERRNO_CODES.EXDEV);
        }
        // source must exist
        var old_node = FS.lookupNode(old_dir, old_name);
        // old path should not be an ancestor of the new path
        var relative = PATH.relative(old_path, new_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        // new path should not be an ancestor of the old path
        relative = PATH.relative(new_path, old_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
        }
        // see if the new path already exists
        var new_node;
        try {
          new_node = FS.lookupNode(new_dir, new_name);
        } catch (e) {
          // not fatal
        }
        // early out if nothing needs to change
        if (old_node === new_node) {
          return;
        }
        // we'll need to delete the old entry
        var isdir = FS.isDir(old_node.mode);
        var err = FS.mayDelete(old_dir, old_name, isdir);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        // need delete permissions if we'll be overwriting.
        // need create permissions if new doesn't already exist.
        err = new_node ?
          FS.mayDelete(new_dir, new_name, isdir) :
          FS.mayCreate(new_dir, new_name);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!old_dir.node_ops.rename) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isMountpoint(old_node) || (new_node && FS.isMountpoint(new_node))) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        // if we are going to change the parent, check write permissions
        if (new_dir !== old_dir) {
          err = FS.nodePermissions(old_dir, 'w');
          if (err) {
            throw new FS.ErrnoError(err);
          }
        }
        try {
          if (FS.trackingDelegate['willMovePath']) {
            FS.trackingDelegate['willMovePath'](old_path, new_path);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['willMovePath']('"+old_path+"', '"+new_path+"') threw an exception: " + e.message);
        }
        // remove the node from the lookup hash
        FS.hashRemoveNode(old_node);
        // do the underlying fs rename
        try {
          old_dir.node_ops.rename(old_node, new_dir, new_name);
        } catch (e) {
          throw e;
        } finally {
          // add the node back to the hash (in case node_ops.rename
          // changed its name)
          FS.hashAddNode(old_node);
        }
        try {
          if (FS.trackingDelegate['onMovePath']) FS.trackingDelegate['onMovePath'](old_path, new_path);
        } catch(e) {
          console.log("FS.trackingDelegate['onMovePath']('"+old_path+"', '"+new_path+"') threw an exception: " + e.message);
        }
      },rmdir:function (path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var err = FS.mayDelete(parent, name, true);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.rmdir) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        try {
          if (FS.trackingDelegate['willDeletePath']) {
            FS.trackingDelegate['willDeletePath'](path);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['willDeletePath']('"+path+"') threw an exception: " + e.message);
        }
        parent.node_ops.rmdir(parent, name);
        FS.destroyNode(node);
        try {
          if (FS.trackingDelegate['onDeletePath']) FS.trackingDelegate['onDeletePath'](path);
        } catch(e) {
          console.log("FS.trackingDelegate['onDeletePath']('"+path+"') threw an exception: " + e.message);
        }
      },readdir:function (path) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        if (!node.node_ops.readdir) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
        }
        return node.node_ops.readdir(node);
      },unlink:function (path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var err = FS.mayDelete(parent, name, false);
        if (err) {
          // According to POSIX, we should map EISDIR to EPERM, but
          // we instead do what Linux does (and we must, as we use
          // the musl linux libc).
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.unlink) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        try {
          if (FS.trackingDelegate['willDeletePath']) {
            FS.trackingDelegate['willDeletePath'](path);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['willDeletePath']('"+path+"') threw an exception: " + e.message);
        }
        parent.node_ops.unlink(parent, name);
        FS.destroyNode(node);
        try {
          if (FS.trackingDelegate['onDeletePath']) FS.trackingDelegate['onDeletePath'](path);
        } catch(e) {
          console.log("FS.trackingDelegate['onDeletePath']('"+path+"') threw an exception: " + e.message);
        }
      },readlink:function (path) {
        var lookup = FS.lookupPath(path);
        var link = lookup.node;
        if (!link) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        if (!link.node_ops.readlink) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        return PATH.resolve(FS.getPath(link.parent), link.node_ops.readlink(link));
      },stat:function (path, dontFollow) {
        var lookup = FS.lookupPath(path, { follow: !dontFollow });
        var node = lookup.node;
        if (!node) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        if (!node.node_ops.getattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        return node.node_ops.getattr(node);
      },lstat:function (path) {
        return FS.stat(path, true);
      },chmod:function (path, mode, dontFollow) {
        var node;
        if (typeof path === 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        node.node_ops.setattr(node, {
          mode: (mode & 4095) | (node.mode & ~4095),
          timestamp: Date.now()
        });
      },lchmod:function (path, mode) {
        FS.chmod(path, mode, true);
      },fchmod:function (fd, mode) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        FS.chmod(stream.node, mode);
      },chown:function (path, uid, gid, dontFollow) {
        var node;
        if (typeof path === 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        node.node_ops.setattr(node, {
          timestamp: Date.now()
          // we ignore the uid / gid for now
        });
      },lchown:function (path, uid, gid) {
        FS.chown(path, uid, gid, true);
      },fchown:function (fd, uid, gid) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        FS.chown(stream.node, uid, gid);
      },truncate:function (path, len) {
        if (len < 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var node;
        if (typeof path === 'string') {
          var lookup = FS.lookupPath(path, { follow: true });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isDir(node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
        }
        if (!FS.isFile(node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var err = FS.nodePermissions(node, 'w');
        if (err) {
          throw new FS.ErrnoError(err);
        }
        node.node_ops.setattr(node, {
          size: len,
          timestamp: Date.now()
        });
      },ftruncate:function (fd, len) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        FS.truncate(stream.node, len);
      },utime:function (path, atime, mtime) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        node.node_ops.setattr(node, {
          timestamp: Math.max(atime, mtime)
        });
      },open:function (path, flags, mode, fd_start, fd_end) {
        if (path === "") {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        flags = typeof flags === 'string' ? FS.modeStringToFlags(flags) : flags;
        mode = typeof mode === 'undefined' ? 438 /* 0666 */ : mode;
        if ((flags & 64)) {
          mode = (mode & 4095) | 32768;
        } else {
          mode = 0;
        }
        var node;
        if (typeof path === 'object') {
          node = path;
        } else {
          path = PATH.normalize(path);
          try {
            var lookup = FS.lookupPath(path, {
              follow: !(flags & 131072)
            });
            node = lookup.node;
          } catch (e) {
            // ignore
          }
        }
        // perhaps we need to create the node
        var created = false;
        if ((flags & 64)) {
          if (node) {
            // if O_CREAT and O_EXCL are set, error out if the node already exists
            if ((flags & 128)) {
              throw new FS.ErrnoError(ERRNO_CODES.EEXIST);
            }
          } else {
            // node doesn't exist, try to create it
            node = FS.mknod(path, mode, 0);
            created = true;
          }
        }
        if (!node) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        // can't truncate a device
        if (FS.isChrdev(node.mode)) {
          flags &= ~512;
        }
        // if asked only for a directory, then this must be one
        if ((flags & 65536) && !FS.isDir(node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
        }
        // check permissions, if this is not a file we just created now (it is ok to
        // create and write to a file with read-only permissions; it is read-only
        // for later use)
        if (!created) {
          var err = FS.mayOpen(node, flags);
          if (err) {
            throw new FS.ErrnoError(err);
          }
        }
        // do truncation if necessary
        if ((flags & 512)) {
          FS.truncate(node, 0);
        }
        // we've already handled these, don't pass down to the underlying vfs
        flags &= ~(128 | 512);
  
        // register the stream with the filesystem
        var stream = FS.createStream({
          node: node,
          path: FS.getPath(node),  // we want the absolute path to the node
          flags: flags,
          seekable: true,
          position: 0,
          stream_ops: node.stream_ops,
          // used by the file family libc calls (fopen, fwrite, ferror, etc.)
          ungotten: [],
          error: false
        }, fd_start, fd_end);
        // call the new stream's open function
        if (stream.stream_ops.open) {
          stream.stream_ops.open(stream);
        }
        if (Module['logReadFiles'] && !(flags & 1)) {
          if (!FS.readFiles) FS.readFiles = {};
          if (!(path in FS.readFiles)) {
            FS.readFiles[path] = 1;
            Module['printErr']('read file: ' + path);
          }
        }
        try {
          if (FS.trackingDelegate['onOpenFile']) {
            var trackingFlags = 0;
            if ((flags & 2097155) !== 1) {
              trackingFlags |= FS.tracking.openFlags.READ;
            }
            if ((flags & 2097155) !== 0) {
              trackingFlags |= FS.tracking.openFlags.WRITE;
            }
            FS.trackingDelegate['onOpenFile'](path, trackingFlags);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['onOpenFile']('"+path+"', flags) threw an exception: " + e.message);
        }
        return stream;
      },close:function (stream) {
        if (stream.getdents) stream.getdents = null; // free readdir state
        try {
          if (stream.stream_ops.close) {
            stream.stream_ops.close(stream);
          }
        } catch (e) {
          throw e;
        } finally {
          FS.closeStream(stream.fd);
        }
      },llseek:function (stream, offset, whence) {
        if (!stream.seekable || !stream.stream_ops.llseek) {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }
        stream.position = stream.stream_ops.llseek(stream, offset, whence);
        stream.ungotten = [];
        return stream.position;
      },read:function (stream, buffer, offset, length, position) {
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
        }
        if (!stream.stream_ops.read) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var seeking = typeof position !== 'undefined';
        if (!seeking) {
          position = stream.position;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }
        var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
        if (!seeking) stream.position += bytesRead;
        return bytesRead;
      },write:function (stream, buffer, offset, length, position, canOwn) {
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
        }
        if (!stream.stream_ops.write) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if (stream.flags & 1024) {
          // seek to the end before writing in append mode
          FS.llseek(stream, 0, 2);
        }
        var seeking = typeof position !== 'undefined';
        if (!seeking) {
          position = stream.position;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }
        var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
        if (!seeking) stream.position += bytesWritten;
        try {
          if (stream.path && FS.trackingDelegate['onWriteToFile']) FS.trackingDelegate['onWriteToFile'](stream.path);
        } catch(e) {
          console.log("FS.trackingDelegate['onWriteToFile']('"+path+"') threw an exception: " + e.message);
        }
        return bytesWritten;
      },allocate:function (stream, offset, length) {
        if (offset < 0 || length <= 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (!FS.isFile(stream.node.mode) && !FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
        }
        if (!stream.stream_ops.allocate) {
          throw new FS.ErrnoError(ERRNO_CODES.EOPNOTSUPP);
        }
        stream.stream_ops.allocate(stream, offset, length);
      },mmap:function (stream, buffer, offset, length, position, prot, flags) {
        // TODO if PROT is PROT_WRITE, make sure we have write access
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(ERRNO_CODES.EACCES);
        }
        if (!stream.stream_ops.mmap) {
          throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
        }
        return stream.stream_ops.mmap(stream, buffer, offset, length, position, prot, flags);
      },msync:function (stream, buffer, offset, length, mmapFlags) {
        if (!stream || !stream.stream_ops.msync) {
          return 0;
        }
        return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
      },munmap:function (stream) {
        return 0;
      },ioctl:function (stream, cmd, arg) {
        if (!stream.stream_ops.ioctl) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTTY);
        }
        return stream.stream_ops.ioctl(stream, cmd, arg);
      },readFile:function (path, opts) {
        opts = opts || {};
        opts.flags = opts.flags || 'r';
        opts.encoding = opts.encoding || 'binary';
        if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
          throw new Error('Invalid encoding type "' + opts.encoding + '"');
        }
        var ret;
        var stream = FS.open(path, opts.flags);
        var stat = FS.stat(path);
        var length = stat.size;
        var buf = new Uint8Array(length);
        FS.read(stream, buf, 0, length, 0);
        if (opts.encoding === 'utf8') {
          ret = UTF8ArrayToString(buf, 0);
        } else if (opts.encoding === 'binary') {
          ret = buf;
        }
        FS.close(stream);
        return ret;
      },writeFile:function (path, data, opts) {
        opts = opts || {};
        opts.flags = opts.flags || 'w';
        var stream = FS.open(path, opts.flags, opts.mode);
        if (typeof data === 'string') {
          var buf = new Uint8Array(lengthBytesUTF8(data)+1);
          var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
          FS.write(stream, buf, 0, actualNumBytes, undefined, opts.canOwn);
        } else if (ArrayBuffer.isView(data)) {
          FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn);
        } else {
          throw new Error('Unsupported data type');
        }
        FS.close(stream);
      },cwd:function () {
        return FS.currentPath;
      },chdir:function (path) {
        var lookup = FS.lookupPath(path, { follow: true });
        if (lookup.node === null) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        if (!FS.isDir(lookup.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
        }
        var err = FS.nodePermissions(lookup.node, 'x');
        if (err) {
          throw new FS.ErrnoError(err);
        }
        FS.currentPath = lookup.path;
      },createDefaultDirectories:function () {
        FS.mkdir('/tmp');
        FS.mkdir('/home');
        FS.mkdir('/home/web_user');
      },createDefaultDevices:function () {
        // create /dev
        FS.mkdir('/dev');
        // setup /dev/null
        FS.registerDevice(FS.makedev(1, 3), {
          read: function() { return 0; },
          write: function(stream, buffer, offset, length, pos) { return length; }
        });
        FS.mkdev('/dev/null', FS.makedev(1, 3));
        // setup /dev/tty and /dev/tty1
        // stderr needs to print output using Module['printErr']
        // so we register a second tty just for it.
        TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
        TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
        FS.mkdev('/dev/tty', FS.makedev(5, 0));
        FS.mkdev('/dev/tty1', FS.makedev(6, 0));
        // setup /dev/[u]random
        var random_device;
        if (typeof crypto !== 'undefined') {
          // for modern web browsers
          var randomBuffer = new Uint8Array(1);
          random_device = function() { crypto.getRandomValues(randomBuffer); return randomBuffer[0]; };
        } else if (ENVIRONMENT_IS_NODE) {
          // for nodejs
          random_device = function() { return require('crypto')['randomBytes'](1)[0]; };
        } else {
          // default for ES5 platforms
          random_device = function() { return (Math.random()*256)|0; };
        }
        FS.createDevice('/dev', 'random', random_device);
        FS.createDevice('/dev', 'urandom', random_device);
        // we're not going to emulate the actual shm device,
        // just create the tmp dirs that reside in it commonly
        FS.mkdir('/dev/shm');
        FS.mkdir('/dev/shm/tmp');
      },createSpecialDirectories:function () {
        // create /proc/self/fd which allows /proc/self/fd/6 => readlink gives the name of the stream for fd 6 (see test_unistd_ttyname)
        FS.mkdir('/proc');
        FS.mkdir('/proc/self');
        FS.mkdir('/proc/self/fd');
        FS.mount({
          mount: function() {
            var node = FS.createNode('/proc/self', 'fd', 16384 | 511 /* 0777 */, 73);
            node.node_ops = {
              lookup: function(parent, name) {
                var fd = +name;
                var stream = FS.getStream(fd);
                if (!stream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
                var ret = {
                  parent: null,
                  mount: { mountpoint: 'fake' },
                  node_ops: { readlink: function() { return stream.path } }
                };
                ret.parent = ret; // make it look like a simple root node
                return ret;
              }
            };
            return node;
          }
        }, {}, '/proc/self/fd');
      },createStandardStreams:function () {
        // TODO deprecate the old functionality of a single
        // input / output callback and that utilizes FS.createDevice
        // and instead require a unique set of stream ops
  
        // by default, we symlink the standard streams to the
        // default tty devices. however, if the standard streams
        // have been overwritten we create a unique device for
        // them instead.
        if (Module['stdin']) {
          FS.createDevice('/dev', 'stdin', Module['stdin']);
        } else {
          FS.symlink('/dev/tty', '/dev/stdin');
        }
        if (Module['stdout']) {
          FS.createDevice('/dev', 'stdout', null, Module['stdout']);
        } else {
          FS.symlink('/dev/tty', '/dev/stdout');
        }
        if (Module['stderr']) {
          FS.createDevice('/dev', 'stderr', null, Module['stderr']);
        } else {
          FS.symlink('/dev/tty1', '/dev/stderr');
        }
  
        // open default streams for the stdin, stdout and stderr devices
        var stdin = FS.open('/dev/stdin', 'r');
        assert(stdin.fd === 0, 'invalid handle for stdin (' + stdin.fd + ')');
  
        var stdout = FS.open('/dev/stdout', 'w');
        assert(stdout.fd === 1, 'invalid handle for stdout (' + stdout.fd + ')');
  
        var stderr = FS.open('/dev/stderr', 'w');
        assert(stderr.fd === 2, 'invalid handle for stderr (' + stderr.fd + ')');
      },ensureErrnoError:function () {
        if (FS.ErrnoError) return;
        FS.ErrnoError = function ErrnoError(errno, node) {
          //Module.printErr(stackTrace()); // useful for debugging
          this.node = node;
          this.setErrno = function(errno) {
            this.errno = errno;
            for (var key in ERRNO_CODES) {
              if (ERRNO_CODES[key] === errno) {
                this.code = key;
                break;
              }
            }
          };
          this.setErrno(errno);
          this.message = ERRNO_MESSAGES[errno];
          // Node.js compatibility: assigning on this.stack fails on Node 4 (but fixed on Node 8)
          if (this.stack) Object.defineProperty(this, "stack", { value: (new Error).stack, writable: true });
          if (this.stack) this.stack = demangleAll(this.stack);
        };
        FS.ErrnoError.prototype = new Error();
        FS.ErrnoError.prototype.constructor = FS.ErrnoError;
        // Some errors may happen quite a bit, to avoid overhead we reuse them (and suffer a lack of stack info)
        [ERRNO_CODES.ENOENT].forEach(function(code) {
          FS.genericErrors[code] = new FS.ErrnoError(code);
          FS.genericErrors[code].stack = '<generic error, no stack>';
        });
      },staticInit:function () {
        FS.ensureErrnoError();
  
        FS.nameTable = new Array(4096);
  
        FS.mount(MEMFS, {}, '/');
  
        FS.createDefaultDirectories();
        FS.createDefaultDevices();
        FS.createSpecialDirectories();
  
        FS.filesystems = {
          'MEMFS': MEMFS,
          'IDBFS': IDBFS,
          'NODEFS': NODEFS,
          'WORKERFS': WORKERFS,
        };
      },init:function (input, output, error) {
        assert(!FS.init.initialized, 'FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)');
        FS.init.initialized = true;
  
        FS.ensureErrnoError();
  
        // Allow Module.stdin etc. to provide defaults, if none explicitly passed to us here
        Module['stdin'] = input || Module['stdin'];
        Module['stdout'] = output || Module['stdout'];
        Module['stderr'] = error || Module['stderr'];
  
        FS.createStandardStreams();
      },quit:function () {
        FS.init.initialized = false;
        // force-flush all streams, so we get musl std streams printed out
        var fflush = Module['_fflush'];
        if (fflush) fflush(0);
        // close all of our streams
        for (var i = 0; i < FS.streams.length; i++) {
          var stream = FS.streams[i];
          if (!stream) {
            continue;
          }
          FS.close(stream);
        }
      },getMode:function (canRead, canWrite) {
        var mode = 0;
        if (canRead) mode |= 292 | 73;
        if (canWrite) mode |= 146;
        return mode;
      },joinPath:function (parts, forceRelative) {
        var path = PATH.join.apply(null, parts);
        if (forceRelative && path[0] == '/') path = path.substr(1);
        return path;
      },absolutePath:function (relative, base) {
        return PATH.resolve(base, relative);
      },standardizePath:function (path) {
        return PATH.normalize(path);
      },findObject:function (path, dontResolveLastLink) {
        var ret = FS.analyzePath(path, dontResolveLastLink);
        if (ret.exists) {
          return ret.object;
        } else {
          ___setErrNo(ret.error);
          return null;
        }
      },analyzePath:function (path, dontResolveLastLink) {
        // operate from within the context of the symlink's target
        try {
          var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          path = lookup.path;
        } catch (e) {
        }
        var ret = {
          isRoot: false, exists: false, error: 0, name: null, path: null, object: null,
          parentExists: false, parentPath: null, parentObject: null
        };
        try {
          var lookup = FS.lookupPath(path, { parent: true });
          ret.parentExists = true;
          ret.parentPath = lookup.path;
          ret.parentObject = lookup.node;
          ret.name = PATH.basename(path);
          lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          ret.exists = true;
          ret.path = lookup.path;
          ret.object = lookup.node;
          ret.name = lookup.node.name;
          ret.isRoot = lookup.path === '/';
        } catch (e) {
          ret.error = e.errno;
        };
        return ret;
      },createFolder:function (parent, name, canRead, canWrite) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(canRead, canWrite);
        return FS.mkdir(path, mode);
      },createPath:function (parent, path, canRead, canWrite) {
        parent = typeof parent === 'string' ? parent : FS.getPath(parent);
        var parts = path.split('/').reverse();
        while (parts.length) {
          var part = parts.pop();
          if (!part) continue;
          var current = PATH.join2(parent, part);
          try {
            FS.mkdir(current);
          } catch (e) {
            // ignore EEXIST
          }
          parent = current;
        }
        return current;
      },createFile:function (parent, name, properties, canRead, canWrite) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(canRead, canWrite);
        return FS.create(path, mode);
      },createDataFile:function (parent, name, data, canRead, canWrite, canOwn) {
        var path = name ? PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name) : parent;
        var mode = FS.getMode(canRead, canWrite);
        var node = FS.create(path, mode);
        if (data) {
          if (typeof data === 'string') {
            var arr = new Array(data.length);
            for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
            data = arr;
          }
          // make sure we can write to the file
          FS.chmod(node, mode | 146);
          var stream = FS.open(node, 'w');
          FS.write(stream, data, 0, data.length, 0, canOwn);
          FS.close(stream);
          FS.chmod(node, mode);
        }
        return node;
      },createDevice:function (parent, name, input, output) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(!!input, !!output);
        if (!FS.createDevice.major) FS.createDevice.major = 64;
        var dev = FS.makedev(FS.createDevice.major++, 0);
        // Create a fake device that a set of stream ops to emulate
        // the old behavior.
        FS.registerDevice(dev, {
          open: function(stream) {
            stream.seekable = false;
          },
          close: function(stream) {
            // flush any pending line data
            if (output && output.buffer && output.buffer.length) {
              output(10);
            }
          },
          read: function(stream, buffer, offset, length, pos /* ignored */) {
            var bytesRead = 0;
            for (var i = 0; i < length; i++) {
              var result;
              try {
                result = input();
              } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES.EIO);
              }
              if (result === undefined && bytesRead === 0) {
                throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
              }
              if (result === null || result === undefined) break;
              bytesRead++;
              buffer[offset+i] = result;
            }
            if (bytesRead) {
              stream.node.timestamp = Date.now();
            }
            return bytesRead;
          },
          write: function(stream, buffer, offset, length, pos) {
            for (var i = 0; i < length; i++) {
              try {
                output(buffer[offset+i]);
              } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES.EIO);
              }
            }
            if (length) {
              stream.node.timestamp = Date.now();
            }
            return i;
          }
        });
        return FS.mkdev(path, mode, dev);
      },createLink:function (parent, name, target, canRead, canWrite) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        return FS.symlink(target, path);
      },forceLoadFile:function (obj) {
        if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
        var success = true;
        if (typeof XMLHttpRequest !== 'undefined') {
          throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
        } else if (Module['read']) {
          // Command-line.
          try {
            // WARNING: Can't read binary files in V8's d8 or tracemonkey's js, as
            //          read() will try to parse UTF8.
            obj.contents = intArrayFromString(Module['read'](obj.url), true);
            obj.usedBytes = obj.contents.length;
          } catch (e) {
            success = false;
          }
        } else {
          throw new Error('Cannot load without read() or XMLHttpRequest.');
        }
        if (!success) ___setErrNo(ERRNO_CODES.EIO);
        return success;
      },createLazyFile:function (parent, name, url, canRead, canWrite) {
        // Lazy chunked Uint8Array (implements get and length from Uint8Array). Actual getting is abstracted away for eventual reuse.
        function LazyUint8Array() {
          this.lengthKnown = false;
          this.chunks = []; // Loaded chunks. Index is the chunk number
        }
        LazyUint8Array.prototype.get = function LazyUint8Array_get(idx) {
          if (idx > this.length-1 || idx < 0) {
            return undefined;
          }
          var chunkOffset = idx % this.chunkSize;
          var chunkNum = (idx / this.chunkSize)|0;
          return this.getter(chunkNum)[chunkOffset];
        }
        LazyUint8Array.prototype.setDataGetter = function LazyUint8Array_setDataGetter(getter) {
          this.getter = getter;
        }
        LazyUint8Array.prototype.cacheLength = function LazyUint8Array_cacheLength() {
          // Find length
          var xhr = new XMLHttpRequest();
          xhr.open('HEAD', url, false);
          xhr.send(null);
          if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
          var datalength = Number(xhr.getResponseHeader("Content-length"));
          var header;
          var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
          var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";
  
          var chunkSize = 1024*1024; // Chunk size in bytes
  
          if (!hasByteServing) chunkSize = datalength;
  
          // Function to get a range from the remote URL.
          var doXHR = (function(from, to) {
            if (from > to) throw new Error("invalid range (" + from + ", " + to + ") or no bytes requested!");
            if (to > datalength-1) throw new Error("only " + datalength + " bytes available! programmer error!");
  
            // TODO: Use mozResponseArrayBuffer, responseStream, etc. if available.
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, false);
            if (datalength !== chunkSize) xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
  
            // Some hints to the browser that we want binary data.
            if (typeof Uint8Array != 'undefined') xhr.responseType = 'arraybuffer';
            if (xhr.overrideMimeType) {
              xhr.overrideMimeType('text/plain; charset=x-user-defined');
            }
  
            xhr.send(null);
            if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
            if (xhr.response !== undefined) {
              return new Uint8Array(xhr.response || []);
            } else {
              return intArrayFromString(xhr.responseText || '', true);
            }
          });
          var lazyArray = this;
          lazyArray.setDataGetter(function(chunkNum) {
            var start = chunkNum * chunkSize;
            var end = (chunkNum+1) * chunkSize - 1; // including this byte
            end = Math.min(end, datalength-1); // if datalength-1 is selected, this is the last block
            if (typeof(lazyArray.chunks[chunkNum]) === "undefined") {
              lazyArray.chunks[chunkNum] = doXHR(start, end);
            }
            if (typeof(lazyArray.chunks[chunkNum]) === "undefined") throw new Error("doXHR failed!");
            return lazyArray.chunks[chunkNum];
          });
  
          if (usesGzip || !datalength) {
            // if the server uses gzip or doesn't supply the length, we have to download the whole file to get the (uncompressed) length
            chunkSize = datalength = 1; // this will force getter(0)/doXHR do download the whole file
            datalength = this.getter(0).length;
            chunkSize = datalength;
            console.log("LazyFiles on gzip forces download of the whole file when length is accessed");
          }
  
          this._length = datalength;
          this._chunkSize = chunkSize;
          this.lengthKnown = true;
        }
        if (typeof XMLHttpRequest !== 'undefined') {
          if (!ENVIRONMENT_IS_WORKER) throw 'Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc';
          var lazyArray = new LazyUint8Array();
          Object.defineProperties(lazyArray, {
            length: {
              get: function() {
                if(!this.lengthKnown) {
                  this.cacheLength();
                }
                return this._length;
              }
            },
            chunkSize: {
              get: function() {
                if(!this.lengthKnown) {
                  this.cacheLength();
                }
                return this._chunkSize;
              }
            }
          });
  
          var properties = { isDevice: false, contents: lazyArray };
        } else {
          var properties = { isDevice: false, url: url };
        }
  
        var node = FS.createFile(parent, name, properties, canRead, canWrite);
        // This is a total hack, but I want to get this lazy file code out of the
        // core of MEMFS. If we want to keep this lazy file concept I feel it should
        // be its own thin LAZYFS proxying calls to MEMFS.
        if (properties.contents) {
          node.contents = properties.contents;
        } else if (properties.url) {
          node.contents = null;
          node.url = properties.url;
        }
        // Add a function that defers querying the file size until it is asked the first time.
        Object.defineProperties(node, {
          usedBytes: {
            get: function() { return this.contents.length; }
          }
        });
        // override each stream op with one that tries to force load the lazy file first
        var stream_ops = {};
        var keys = Object.keys(node.stream_ops);
        keys.forEach(function(key) {
          var fn = node.stream_ops[key];
          stream_ops[key] = function forceLoadLazyFile() {
            if (!FS.forceLoadFile(node)) {
              throw new FS.ErrnoError(ERRNO_CODES.EIO);
            }
            return fn.apply(null, arguments);
          };
        });
        // use a custom read function
        stream_ops.read = function stream_ops_read(stream, buffer, offset, length, position) {
          if (!FS.forceLoadFile(node)) {
            throw new FS.ErrnoError(ERRNO_CODES.EIO);
          }
          var contents = stream.node.contents;
          if (position >= contents.length)
            return 0;
          var size = Math.min(contents.length - position, length);
          assert(size >= 0);
          if (contents.slice) { // normal array
            for (var i = 0; i < size; i++) {
              buffer[offset + i] = contents[position + i];
            }
          } else {
            for (var i = 0; i < size; i++) { // LazyUint8Array from sync binary XHR
              buffer[offset + i] = contents.get(position + i);
            }
          }
          return size;
        };
        node.stream_ops = stream_ops;
        return node;
      },createPreloadedFile:function (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) {
        Browser.init(); // XXX perhaps this method should move onto Browser?
        // TODO we should allow people to just pass in a complete filename instead
        // of parent and name being that we just join them anyways
        var fullname = name ? PATH.resolve(PATH.join2(parent, name)) : parent;
        var dep = getUniqueRunDependency('cp ' + fullname); // might have several active requests for the same fullname
        function processData(byteArray) {
          function finish(byteArray) {
            if (preFinish) preFinish();
            if (!dontCreateFile) {
              FS.createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
            }
            if (onload) onload();
            removeRunDependency(dep);
          }
          var handled = false;
          Module['preloadPlugins'].forEach(function(plugin) {
            if (handled) return;
            if (plugin['canHandle'](fullname)) {
              plugin['handle'](byteArray, fullname, finish, function() {
                if (onerror) onerror();
                removeRunDependency(dep);
              });
              handled = true;
            }
          });
          if (!handled) finish(byteArray);
        }
        addRunDependency(dep);
        if (typeof url == 'string') {
          Browser.asyncLoad(url, function(byteArray) {
            processData(byteArray);
          }, onerror);
        } else {
          processData(url);
        }
      },indexedDB:function () {
        return window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
      },DB_NAME:function () {
        return 'EM_FS_' + window.location.pathname;
      },DB_VERSION:20,DB_STORE_NAME:"FILE_DATA",saveFilesToDB:function (paths, onload, onerror) {
        onload = onload || function(){};
        onerror = onerror || function(){};
        var indexedDB = FS.indexedDB();
        try {
          var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
        } catch (e) {
          return onerror(e);
        }
        openRequest.onupgradeneeded = function openRequest_onupgradeneeded() {
          console.log('creating db');
          var db = openRequest.result;
          db.createObjectStore(FS.DB_STORE_NAME);
        };
        openRequest.onsuccess = function openRequest_onsuccess() {
          var db = openRequest.result;
          var transaction = db.transaction([FS.DB_STORE_NAME], 'readwrite');
          var files = transaction.objectStore(FS.DB_STORE_NAME);
          var ok = 0, fail = 0, total = paths.length;
          function finish() {
            if (fail == 0) onload(); else onerror();
          }
          paths.forEach(function(path) {
            var putRequest = files.put(FS.analyzePath(path).object.contents, path);
            putRequest.onsuccess = function putRequest_onsuccess() { ok++; if (ok + fail == total) finish() };
            putRequest.onerror = function putRequest_onerror() { fail++; if (ok + fail == total) finish() };
          });
          transaction.onerror = onerror;
        };
        openRequest.onerror = onerror;
      },loadFilesFromDB:function (paths, onload, onerror) {
        onload = onload || function(){};
        onerror = onerror || function(){};
        var indexedDB = FS.indexedDB();
        try {
          var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
        } catch (e) {
          return onerror(e);
        }
        openRequest.onupgradeneeded = onerror; // no database to load from
        openRequest.onsuccess = function openRequest_onsuccess() {
          var db = openRequest.result;
          try {
            var transaction = db.transaction([FS.DB_STORE_NAME], 'readonly');
          } catch(e) {
            onerror(e);
            return;
          }
          var files = transaction.objectStore(FS.DB_STORE_NAME);
          var ok = 0, fail = 0, total = paths.length;
          function finish() {
            if (fail == 0) onload(); else onerror();
          }
          paths.forEach(function(path) {
            var getRequest = files.get(path);
            getRequest.onsuccess = function getRequest_onsuccess() {
              if (FS.analyzePath(path).exists) {
                FS.unlink(path);
              }
              FS.createDataFile(PATH.dirname(path), PATH.basename(path), getRequest.result, true, true, true);
              ok++;
              if (ok + fail == total) finish();
            };
            getRequest.onerror = function getRequest_onerror() { fail++; if (ok + fail == total) finish() };
          });
          transaction.onerror = onerror;
        };
        openRequest.onerror = onerror;
      }};var SYSCALLS={DEFAULT_POLLMASK:5,mappings:{},umask:511,calculateAt:function (dirfd, path) {
        if (path[0] !== '/') {
          // relative path
          var dir;
          if (dirfd === -100) {
            dir = FS.cwd();
          } else {
            var dirstream = FS.getStream(dirfd);
            if (!dirstream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
            dir = dirstream.path;
          }
          path = PATH.join2(dir, path);
        }
        return path;
      },doStat:function (func, path, buf) {
        try {
          var stat = func(path);
        } catch (e) {
          if (e && e.node && PATH.normalize(path) !== PATH.normalize(FS.getPath(e.node))) {
            // an error occurred while trying to look up the path; we should just report ENOTDIR
            return -ERRNO_CODES.ENOTDIR;
          }
          throw e;
        }
        HEAP32[((buf)>>2)]=stat.dev;
        HEAP32[(((buf)+(4))>>2)]=0;
        HEAP32[(((buf)+(8))>>2)]=stat.ino;
        HEAP32[(((buf)+(12))>>2)]=stat.mode;
        HEAP32[(((buf)+(16))>>2)]=stat.nlink;
        HEAP32[(((buf)+(20))>>2)]=stat.uid;
        HEAP32[(((buf)+(24))>>2)]=stat.gid;
        HEAP32[(((buf)+(28))>>2)]=stat.rdev;
        HEAP32[(((buf)+(32))>>2)]=0;
        HEAP32[(((buf)+(36))>>2)]=stat.size;
        HEAP32[(((buf)+(40))>>2)]=4096;
        HEAP32[(((buf)+(44))>>2)]=stat.blocks;
        HEAP32[(((buf)+(48))>>2)]=(stat.atime.getTime() / 1000)|0;
        HEAP32[(((buf)+(52))>>2)]=0;
        HEAP32[(((buf)+(56))>>2)]=(stat.mtime.getTime() / 1000)|0;
        HEAP32[(((buf)+(60))>>2)]=0;
        HEAP32[(((buf)+(64))>>2)]=(stat.ctime.getTime() / 1000)|0;
        HEAP32[(((buf)+(68))>>2)]=0;
        HEAP32[(((buf)+(72))>>2)]=stat.ino;
        return 0;
      },doMsync:function (addr, stream, len, flags) {
        var buffer = new Uint8Array(HEAPU8.subarray(addr, addr + len));
        FS.msync(stream, buffer, 0, len, flags);
      },doMkdir:function (path, mode) {
        // remove a trailing slash, if one - /a/b/ has basename of '', but
        // we want to create b in the context of this function
        path = PATH.normalize(path);
        if (path[path.length-1] === '/') path = path.substr(0, path.length-1);
        FS.mkdir(path, mode, 0);
        return 0;
      },doMknod:function (path, mode, dev) {
        // we don't want this in the JS API as it uses mknod to create all nodes.
        switch (mode & 61440) {
          case 32768:
          case 8192:
          case 24576:
          case 4096:
          case 49152:
            break;
          default: return -ERRNO_CODES.EINVAL;
        }
        FS.mknod(path, mode, dev);
        return 0;
      },doReadlink:function (path, buf, bufsize) {
        if (bufsize <= 0) return -ERRNO_CODES.EINVAL;
        var ret = FS.readlink(path);
  
        var len = Math.min(bufsize, lengthBytesUTF8(ret));
        var endChar = HEAP8[buf+len];
        stringToUTF8(ret, buf, bufsize+1);
        // readlink is one of the rare functions that write out a C string, but does never append a null to the output buffer(!)
        // stringToUTF8() always appends a null byte, so restore the character under the null byte after the write.
        HEAP8[buf+len] = endChar;
  
        return len;
      },doAccess:function (path, amode) {
        if (amode & ~7) {
          // need a valid mode
          return -ERRNO_CODES.EINVAL;
        }
        var node;
        var lookup = FS.lookupPath(path, { follow: true });
        node = lookup.node;
        var perms = '';
        if (amode & 4) perms += 'r';
        if (amode & 2) perms += 'w';
        if (amode & 1) perms += 'x';
        if (perms /* otherwise, they've just passed F_OK */ && FS.nodePermissions(node, perms)) {
          return -ERRNO_CODES.EACCES;
        }
        return 0;
      },doDup:function (path, flags, suggestFD) {
        var suggest = FS.getStream(suggestFD);
        if (suggest) FS.close(suggest);
        return FS.open(path, flags, 0, suggestFD, suggestFD).fd;
      },doReadv:function (stream, iov, iovcnt, offset) {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
          var ptr = HEAP32[(((iov)+(i*8))>>2)];
          var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
          var curr = FS.read(stream, HEAP8,ptr, len, offset);
          if (curr < 0) return -1;
          ret += curr;
          if (curr < len) break; // nothing more to read
        }
        return ret;
      },doWritev:function (stream, iov, iovcnt, offset) {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
          var ptr = HEAP32[(((iov)+(i*8))>>2)];
          var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
          var curr = FS.write(stream, HEAP8,ptr, len, offset);
          if (curr < 0) return -1;
          ret += curr;
        }
        return ret;
      },varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },getStreamFromFD:function () {
        var stream = FS.getStream(SYSCALLS.get());
        if (!stream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        return stream;
      },getSocketFromFD:function () {
        var socket = SOCKFS.getSocket(SYSCALLS.get());
        if (!socket) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        return socket;
      },getSocketAddress:function (allowNull) {
        var addrp = SYSCALLS.get(), addrlen = SYSCALLS.get();
        if (allowNull && addrp === 0) return null;
        var info = __read_sockaddr(addrp, addrlen);
        if (info.errno) throw new FS.ErrnoError(info.errno);
        info.addr = DNS.lookup_addr(info.addr) || info.addr;
        return info;
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

  function ___syscall145(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // readv
      var stream = SYSCALLS.getStreamFromFD(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      return SYSCALLS.doReadv(stream, iov, iovcnt);
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      var stream = SYSCALLS.getStreamFromFD(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      return SYSCALLS.doWritev(stream, iov, iovcnt);
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall221(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // fcntl64
      var stream = SYSCALLS.getStreamFromFD(), cmd = SYSCALLS.get();
      switch (cmd) {
        case 0: {
          var arg = SYSCALLS.get();
          if (arg < 0) {
            return -ERRNO_CODES.EINVAL;
          }
          var newStream;
          newStream = FS.open(stream.path, stream.flags, 0, arg);
          return newStream.fd;
        }
        case 1:
        case 2:
          return 0;  // FD_CLOEXEC makes no sense for a single process.
        case 3:
          return stream.flags;
        case 4: {
          var arg = SYSCALLS.get();
          stream.flags |= arg;
          return 0;
        }
        case 12:
        case 12: {
          var arg = SYSCALLS.get();
          var offset = 0;
          // We're always unlocked.
          HEAP16[(((arg)+(offset))>>1)]=2;
          return 0;
        }
        case 13:
        case 14:
        case 13:
        case 14:
          return 0; // Pretend that the locking is successful.
        case 16:
        case 8:
          return -ERRNO_CODES.EINVAL; // These are for sockets. We don't have them fully implemented yet.
        case 9:
          // musl trusts getown return values, due to a bug where they must be, as they overlap with errors. just return -1 here, so fnctl() returns that, and we set errno ourselves.
          ___setErrNo(ERRNO_CODES.EINVAL);
          return -1;
        default: {
          return -ERRNO_CODES.EINVAL;
        }
      }
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall330(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // dup3
      var old = SYSCALLS.getStreamFromFD(), suggestFD = SYSCALLS.get(), flags = SYSCALLS.get();
      assert(!flags);
      if (old.fd === suggestFD) return -ERRNO_CODES.EINVAL;
      return SYSCALLS.doDup(old.path, old.flags, suggestFD);
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall5(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // open
      var pathname = SYSCALLS.getStr(), flags = SYSCALLS.get(), mode = SYSCALLS.get() // optional TODO
      var stream = FS.open(pathname, flags, mode);
      return stream.fd;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      var stream = SYSCALLS.getStreamFromFD(), op = SYSCALLS.get();
      switch (op) {
        case 21509:
        case 21505: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0;
        }
        case 21510:
        case 21511:
        case 21512:
        case 21506:
        case 21507:
        case 21508: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0; // no-op, not actually adjusting terminal settings
        }
        case 21519: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          var argp = SYSCALLS.get();
          HEAP32[((argp)>>2)]=0;
          return 0;
        }
        case 21520: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return -ERRNO_CODES.EINVAL; // not supported
        }
        case 21531: {
          var argp = SYSCALLS.get();
          return FS.ioctl(stream, op, argp);
        }
        case 21523: {
          // TODO: in theory we should write to the winsize struct that gets
          // passed in, but for now musl doesn't read anything on it
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0;
        }
        default: abort('bad ioctl syscall ' + op);
      }
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

  function ___syscall63(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // dup2
      var old = SYSCALLS.getStreamFromFD(), suggestFD = SYSCALLS.get();
      if (old.fd === suggestFD) return suggestFD;
      return SYSCALLS.doDup(old.path, old.flags, suggestFD);
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



   

  function _llvm_returnaddress() {
  Module['printErr']('missing function: llvm_returnaddress'); abort(-1);
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

  
  var PTHREAD_SPECIFIC_NEXT_KEY=1;function _pthread_key_create(key, destructor) {
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

   
FS.staticInit();__ATINIT__.unshift(function() { if (!Module["noFSInit"] && !FS.init.initialized) FS.init() });__ATMAIN__.push(function() { FS.ignorePermissions = false });__ATEXIT__.push(function() { FS.quit() });;
__ATINIT__.unshift(function() { TTY.init() });__ATEXIT__.push(function() { TTY.shutdown() });;
if (ENVIRONMENT_IS_NODE) { var fs = require("fs"); var NODEJS_PATH = require("path"); NODEFS.staticInit(); };
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
var debug_table_ii = ["0", "__ZN4mbed10FileHandle4syncEv", "__ZN4mbed10FileHandle6isattyEv", "__ZN4mbed10FileHandle4tellEv", "__ZN4mbed10FileHandle4sizeEv", "__ZN4mbed10FileHandle5fsyncEv", "__ZN4mbed10FileHandle4flenEv", "__ZNK4mbed10FileHandle11is_blockingEv", "__ZN4mbed6Stream5closeEv", "__ZN4mbed6Stream4syncEv", "__ZN4mbed6Stream6isattyEv", "__ZN4mbed6Stream4tellEv", "__ZN4mbed6Stream4sizeEv", "__ZN11TextDisplay5_getcEv", "__ZN6C128324rowsEv", "__ZN6C128327columnsEv", "__ZN6C128325widthEv", "__ZN6C128326heightEv", "__ZN15GraphicsDisplay4rowsEv", "__ZN15GraphicsDisplay7columnsEv", "___stdio_close", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
var debug_table_iii = ["0", "__ZN4mbed10FileHandle12set_blockingEb", "__ZNK4mbed10FileHandle4pollEs", "__ZN6C128325_putcEi", "__ZN11TextDisplay5claimEP8_IO_FILE", "__ZN11TextDisplay5_putcEi", "0", "0"];
var debug_table_iiii = ["0", "__ZN4mbed10FileHandle5lseekEii", "__ZN4mbed6Stream4readEPvj", "__ZN4mbed6Stream5writeEPKvj", "__ZN4mbed6Stream4seekEii", "___stdio_write", "___stdio_seek", "___stdout_write", "_sn_write", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv", "___stdio_read", "0", "0", "0", "0", "0"];
var debug_table_v = ["0", "___cxa_pure_virtual", "__ZL25default_terminate_handlerv", "__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev"];
var debug_table_vi = ["0", "_mbed_trace_default_print", "__ZN4mbed8FileBaseD2Ev", "__ZN4mbed8FileBaseD0Ev", "__ZN4mbed11NonCopyableINS_10FileHandleEED2Ev", "__ZN4mbed10FileHandleD0Ev", "__ZN4mbed10FileHandle6rewindEv", "__ZN4mbed6StreamD2Ev", "__ZN4mbed6StreamD0Ev", "__ZN4mbed6Stream6rewindEv", "__ZN4mbed6Stream4lockEv", "__ZN4mbed6Stream6unlockEv", "__ZThn4_N4mbed6StreamD1Ev", "__ZThn4_N4mbed6StreamD0Ev", "__ZN6C12832D0Ev", "__ZN6C128326_flushEv", "__ZN6C128323clsEv", "__ZThn4_N6C12832D1Ev", "__ZThn4_N6C12832D0Ev", "__ZN15GraphicsDisplayD0Ev", "__ZN15GraphicsDisplay3clsEv", "__ZThn4_N15GraphicsDisplayD1Ev", "__ZThn4_N15GraphicsDisplayD0Ev", "__ZN11TextDisplayD0Ev", "__ZN11TextDisplay3clsEv", "__ZThn4_N11TextDisplayD1Ev", "__ZThn4_N11TextDisplayD0Ev", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "__ZN10__cxxabiv121__vmi_class_type_infoD0Ev", "__ZN4mbed10FileHandle5lseekEii__async_cb", "__ZN4mbed10FileHandle5fsyncEv__async_cb", "__ZN4mbed10FileHandle4flenEv__async_cb", "_mbed_trace_default_print__async_cb", "_mbed_tracef__async_cb", "_mbed_vtracef__async_cb", "_mbed_vtracef__async_cb_53", "_mbed_vtracef__async_cb_43", "_mbed_vtracef__async_cb_44", "_mbed_vtracef__async_cb_45", "_mbed_vtracef__async_cb_52", "_mbed_vtracef__async_cb_46", "_mbed_vtracef__async_cb_51", "_mbed_vtracef__async_cb_47", "_mbed_vtracef__async_cb_48", "_mbed_vtracef__async_cb_49", "_mbed_vtracef__async_cb_50", "__ZN4mbed8FileBaseD2Ev__async_cb_99", "__ZN4mbed8FileBaseD2Ev__async_cb", "__ZN4mbed8FileBaseD2Ev__async_cb_100", "__ZN4mbed8FileBaseD0Ev__async_cb_108", "__ZN4mbed8FileBaseD0Ev__async_cb", "__ZN4mbed8FileBaseD0Ev__async_cb_109", "__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb_84", "__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb", "__ZN4mbed10FileHandle4tellEv__async_cb", "__ZN4mbed10FileHandle6rewindEv__async_cb", "__ZN4mbed10FileHandle4sizeEv__async_cb", "__ZN4mbed10FileHandle4sizeEv__async_cb_105", "__ZN4mbed10FileHandle4sizeEv__async_cb_106", "__ZN4mbed6StreamD2Ev__async_cb", "__ZN4mbed6StreamD2Ev__async_cb_98", "__ZN4mbed6Stream4readEPvj__async_cb", "__ZN4mbed6Stream4readEPvj__async_cb_25", "__ZN4mbed6Stream4readEPvj__async_cb_26", "__ZN4mbed6Stream5writeEPKvj__async_cb", "__ZN4mbed6Stream5writeEPKvj__async_cb_54", "__ZN4mbed6Stream5writeEPKvj__async_cb_55", "__ZThn4_N4mbed6StreamD1Ev__async_cb", "__ZThn4_N4mbed6StreamD1Ev__async_cb_15", "__ZN4mbed6StreamC2EPKc__async_cb_63", "__ZN4mbed6StreamC2EPKc__async_cb", "__ZN4mbed6StreamC2EPKc__async_cb_64", "__ZN4mbed6Stream4putcEi__async_cb", "__ZN4mbed6Stream4putcEi__async_cb_62", "__ZN4mbed6Stream4putcEi__async_cb_60", "__ZN4mbed6Stream4putcEi__async_cb_61", "__ZN4mbed6Stream6printfEPKcz__async_cb", "__ZN4mbed6Stream6printfEPKcz__async_cb_12", "__ZN4mbed6Stream6printfEPKcz__async_cb_9", "__ZN4mbed6Stream6printfEPKcz__async_cb_10", "__ZN4mbed6Stream6printfEPKcz__async_cb_11", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_41", "_mbed_die__async_cb_40", "_mbed_die__async_cb_39", "_mbed_die__async_cb_38", "_mbed_die__async_cb_37", "_mbed_die__async_cb_36", "_mbed_die__async_cb_35", "_mbed_die__async_cb_34", "_mbed_die__async_cb_33", "_mbed_die__async_cb_32", "_mbed_die__async_cb_31", "_mbed_die__async_cb_30", "_mbed_die__async_cb_29", "_mbed_die__async_cb_28", "_mbed_die__async_cb_27", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_vfprintf__async_cb", "_mbed_error_vfprintf__async_cb_19", "_mbed_error_vfprintf__async_cb_18", "_mbed_error__async_cb_23", "___WFI__async_cb", "_serial_putc__async_cb_24", "_serial_putc__async_cb", "_invoke_ticker__async_cb_2", "_invoke_ticker__async_cb", "__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb_59", "__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb", "_exit__async_cb", "__ZN4mbed6fdopenEPNS_10FileHandleEPKc__async_cb", "_wait__async_cb", "_wait_ms__async_cb", "__ZN6C12832D0Ev__async_cb", "__ZN6C128325_putcEi__async_cb", "__ZN6C128325_putcEi__async_cb_65", "__ZN6C128329characterEiii__async_cb", "__ZN6C128329characterEiii__async_cb_95", "__ZN6C128329characterEiii__async_cb_96", "__ZN6C128329characterEiii__async_cb_97", "__ZN6C128324rowsEv__async_cb", "__ZN6C128327columnsEv__async_cb", "__ZThn4_N6C12832D1Ev__async_cb", "__ZThn4_N6C12832D0Ev__async_cb", "__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_66", "__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb", "__ZN6C128328print_bmE6Bitmapii__async_cb", "__ZN6C128328print_bmE6Bitmapii__async_cb_20", "__ZN15GraphicsDisplay9characterEiii__async_cb", "__ZN15GraphicsDisplay4rowsEv__async_cb", "__ZN15GraphicsDisplay7columnsEv__async_cb", "__ZN15GraphicsDisplay3clsEv__async_cb", "__ZN15GraphicsDisplay3clsEv__async_cb_81", "__ZN15GraphicsDisplay3clsEv__async_cb_82", "__ZN15GraphicsDisplay4putpEi__async_cb", "__ZN15GraphicsDisplay4fillEiiiii__async_cb", "__ZN15GraphicsDisplay4fillEiiiii__async_cb_21", "__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb", "__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb_17", "__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb", "__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb_7", "__ZThn4_N15GraphicsDisplayD1Ev__async_cb", "__ZN15GraphicsDisplayC2EPKc__async_cb_86", "__ZN15GraphicsDisplayC2EPKc__async_cb", "__ZN11TextDisplay5_putcEi__async_cb", "__ZN11TextDisplay5_putcEi__async_cb_56", "__ZN11TextDisplay5_putcEi__async_cb_57", "__ZN11TextDisplay5_putcEi__async_cb_58", "__ZN11TextDisplay5claimEP8_IO_FILE__async_cb_83", "__ZN11TextDisplay5claimEP8_IO_FILE__async_cb", "__ZN11TextDisplay3clsEv__async_cb", "__ZN11TextDisplay3clsEv__async_cb_88", "__ZN11TextDisplay3clsEv__async_cb_89", "__ZN11TextDisplay3clsEv__async_cb_92", "__ZN11TextDisplay3clsEv__async_cb_90", "__ZN11TextDisplay3clsEv__async_cb_91", "__ZThn4_N11TextDisplayD1Ev__async_cb", "__ZN11TextDisplayC2EPKc__async_cb_42", "__ZN11TextDisplayC2EPKc__async_cb", "__GLOBAL__sub_I_main_cpp__async_cb", "_main__async_cb_68", "_main__async_cb_67", "_main__async_cb_76", "_main__async_cb_75", "_main__async_cb_80", "_main__async_cb_74", "_main__async_cb_73", "_main__async_cb_79", "_main__async_cb_72", "_main__async_cb_71", "_main__async_cb_78", "_main__async_cb_70", "_main__async_cb_69", "_main__async_cb_77", "_main__async_cb", "_putc__async_cb_22", "_putc__async_cb", "___overflow__async_cb", "_fclose__async_cb_107", "_fclose__async_cb", "_fflush__async_cb_103", "_fflush__async_cb_102", "_fflush__async_cb_104", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_93", "_vfprintf__async_cb", "_snprintf__async_cb", "_vsnprintf__async_cb", "_sprintf__async_cb", "_vsprintf__async_cb", "_freopen__async_cb", "_freopen__async_cb_112", "_freopen__async_cb_111", "_freopen__async_cb_110", "_fputc__async_cb_85", "_fputc__async_cb", "_puts__async_cb", "__Znwj__async_cb", "__Znaj__async_cb", "__ZL25default_terminate_handlerv__async_cb", "__ZL25default_terminate_handlerv__async_cb_14", "_abort_message__async_cb", "_abort_message__async_cb_16", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_8", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_1", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_94", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv", "__ZSt11__terminatePFvvE__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_13", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_6", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_5", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_4", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_3", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_101", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
var debug_table_vii = ["0", "__ZN4mbed10FileHandle5sigioENS_8CallbackIFvvEEE", "__ZN11TextDisplay10foregroundEt", "__ZN11TextDisplay10backgroundEt", "__ZN15GraphicsDisplay4putpEi", "0", "0", "0"];
var debug_table_viii = ["0", "__ZN6C128326locateEii", "__ZN11TextDisplay6locateEii", "0"];
var debug_table_viiii = ["0", "__ZN6C128329characterEiii", "__ZN6C128325pixelEiii", "__ZN15GraphicsDisplay9characterEiii", "__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "0"];
var debug_table_viiiii = ["0", "__ZN15GraphicsDisplay6windowEiiii", "__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "0", "0", "0"];
var debug_table_viiiiii = ["0", "__ZN15GraphicsDisplay4fillEiiiii", "__ZN15GraphicsDisplay4blitEiiiiPKi", "__ZN15GraphicsDisplay7blitbitEiiiiPKc", "__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "0"];
function nullFunc_i(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'i'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: ii: " + debug_table_ii[x] + "  iii: " + debug_table_iii[x] + "  iiii: " + debug_table_iiii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  vii: " + debug_table_vii[x] + "  viii: " + debug_table_viii[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  "); abort(x) }

function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: i: " + debug_table_i[x] + "  iii: " + debug_table_iii[x] + "  iiii: " + debug_table_iiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viii: " + debug_table_viii[x] + "  v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  "); abort(x) }

function nullFunc_iii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'iii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  i: " + debug_table_i[x] + "  viii: " + debug_table_viii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  v: " + debug_table_v[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  "); abort(x) }

function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: iii: " + debug_table_iii[x] + "  ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  viii: " + debug_table_viii[x] + "  viiii: " + debug_table_viiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  "); abort(x) }

function nullFunc_v(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  vii: " + debug_table_vii[x] + "  viii: " + debug_table_viii[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  i: " + debug_table_i[x] + "  ii: " + debug_table_ii[x] + "  iii: " + debug_table_iii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: v: " + debug_table_v[x] + "  vii: " + debug_table_vii[x] + "  viii: " + debug_table_viii[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  i: " + debug_table_i[x] + "  ii: " + debug_table_ii[x] + "  iii: " + debug_table_iii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_vii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'vii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  viii: " + debug_table_viii[x] + "  v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  ii: " + debug_table_ii[x] + "  iii: " + debug_table_iii[x] + "  i: " + debug_table_i[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_viii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiii: " + debug_table_viiii[x] + "  v: " + debug_table_v[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  iii: " + debug_table_iii[x] + "  ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  i: " + debug_table_i[x] + "  "); abort(x) }

function nullFunc_viiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viii: " + debug_table_viii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  iii: " + debug_table_iii[x] + "  ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  "); abort(x) }

function nullFunc_viiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viii: " + debug_table_viii[x] + "  viiii: " + debug_table_viiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  iii: " + debug_table_iii[x] + "  ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  "); abort(x) }

function nullFunc_viiiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viii: " + debug_table_viii[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  iii: " + debug_table_iii[x] + "  ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  "); abort(x) }

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

function invoke_iii(index,a1,a2) {
  try {
    return Module["dynCall_iii"](index,a1,a2);
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

function invoke_viii(index,a1,a2,a3) {
  try {
    Module["dynCall_viii"](index,a1,a2,a3);
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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_i": nullFunc_i, "nullFunc_ii": nullFunc_ii, "nullFunc_iii": nullFunc_iii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_v": nullFunc_v, "nullFunc_vi": nullFunc_vi, "nullFunc_vii": nullFunc_vii, "nullFunc_viii": nullFunc_viii, "nullFunc_viiii": nullFunc_viiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "invoke_i": invoke_i, "invoke_ii": invoke_ii, "invoke_iii": invoke_iii, "invoke_iiii": invoke_iiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_viii": invoke_viii, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "___cxa_begin_catch": ___cxa_begin_catch, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "___cxa_pure_virtual": ___cxa_pure_virtual, "___gxx_personality_v0": ___gxx_personality_v0, "___lock": ___lock, "___resumeException": ___resumeException, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall145": ___syscall145, "___syscall146": ___syscall146, "___syscall221": ___syscall221, "___syscall330": ___syscall330, "___syscall5": ___syscall5, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___syscall63": ___syscall63, "___unlock": ___unlock, "_abort": _abort, "_emscripten_asm_const_i": _emscripten_asm_const_i, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_asm_const_iiii": _emscripten_asm_const_iiii, "_emscripten_asm_const_iiiii": _emscripten_asm_const_iiiii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "_llvm_returnaddress": _llvm_returnaddress, "_llvm_trap": _llvm_trap, "_pthread_getspecific": _pthread_getspecific, "_pthread_key_create": _pthread_key_create, "_pthread_once": _pthread_once, "_pthread_setspecific": _pthread_setspecific, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
  var nullFunc_iii=env.nullFunc_iii;
  var nullFunc_iiii=env.nullFunc_iiii;
  var nullFunc_v=env.nullFunc_v;
  var nullFunc_vi=env.nullFunc_vi;
  var nullFunc_vii=env.nullFunc_vii;
  var nullFunc_viii=env.nullFunc_viii;
  var nullFunc_viiii=env.nullFunc_viiii;
  var nullFunc_viiiii=env.nullFunc_viiiii;
  var nullFunc_viiiiii=env.nullFunc_viiiiii;
  var invoke_i=env.invoke_i;
  var invoke_ii=env.invoke_ii;
  var invoke_iii=env.invoke_iii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_v=env.invoke_v;
  var invoke_vi=env.invoke_vi;
  var invoke_vii=env.invoke_vii;
  var invoke_viii=env.invoke_viii;
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
  var ___syscall145=env.___syscall145;
  var ___syscall146=env.___syscall146;
  var ___syscall221=env.___syscall221;
  var ___syscall330=env.___syscall330;
  var ___syscall5=env.___syscall5;
  var ___syscall54=env.___syscall54;
  var ___syscall6=env.___syscall6;
  var ___syscall63=env.___syscall63;
  var ___unlock=env.___unlock;
  var _abort=env._abort;
  var _emscripten_asm_const_i=env._emscripten_asm_const_i;
  var _emscripten_asm_const_ii=env._emscripten_asm_const_ii;
  var _emscripten_asm_const_iii=env._emscripten_asm_const_iii;
  var _emscripten_asm_const_iiii=env._emscripten_asm_const_iiii;
  var _emscripten_asm_const_iiiii=env._emscripten_asm_const_iiiii;
  var _emscripten_get_now=env._emscripten_get_now;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var _emscripten_set_main_loop=env._emscripten_set_main_loop;
  var _emscripten_set_main_loop_timing=env._emscripten_set_main_loop_timing;
  var _emscripten_sleep=env._emscripten_sleep;
  var _llvm_returnaddress=env._llvm_returnaddress;
  var _llvm_trap=env._llvm_trap;
  var _pthread_getspecific=env._pthread_getspecific;
  var _pthread_key_create=env._pthread_key_create;
  var _pthread_once=env._pthread_once;
  var _pthread_setspecific=env._pthread_setspecific;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS
function _malloc($0) {
 $0 = $0 | 0;
 var $$$0192$i = 0, $$$0193$i = 0, $$$4351$i = 0, $$$i = 0, $$0 = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i17$i = 0, $$0189$i = 0, $$0192$lcssa$i = 0, $$01926$i = 0, $$0193$lcssa$i = 0, $$01935$i = 0, $$0197 = 0, $$0199 = 0, $$0206$i$i = 0, $$0207$i$i = 0, $$0211$i$i = 0, $$0212$i$i = 0, $$024367$i = 0, $$0287$i$i = 0, $$0288$i$i = 0, $$0289$i$i = 0, $$0295$i$i = 0, $$0296$i$i = 0, $$0342$i = 0, $$0344$i = 0, $$0345$i = 0, $$0347$i = 0, $$0353$i = 0, $$0358$i = 0, $$0359$i = 0, $$0361$i = 0, $$0362$i = 0, $$0368$i = 0, $$1196$i = 0, $$1198$i = 0, $$124466$i = 0, $$1291$i$i = 0, $$1293$i$i = 0, $$1343$i = 0, $$1348$i = 0, $$1363$i = 0, $$1370$i = 0, $$1374$i = 0, $$2234243136$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2355$i = 0, $$3$i = 0, $$3$i$i = 0, $$3$i203 = 0, $$3350$i = 0, $$3372$i = 0, $$4$lcssa$i = 0, $$4$ph$i = 0, $$414$i = 0, $$4236$i = 0, $$4351$lcssa$i = 0, $$435113$i = 0, $$4357$$4$i = 0, $$4357$ph$i = 0, $$435712$i = 0, $$723947$i = 0, $$748$i = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i19$iZ2D = 0, $$pre$phi$i211Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phi11$i$iZ2D = 0, $$pre$phiZ2D = 0, $1 = 0, $1004 = 0, $101 = 0, $1010 = 0, $1013 = 0, $1014 = 0, $102 = 0, $1032 = 0, $1034 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1052 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $108 = 0, $112 = 0, $114 = 0, $115 = 0, $117 = 0, $119 = 0, $121 = 0, $123 = 0, $125 = 0, $127 = 0, $129 = 0, $134 = 0, $138 = 0, $14 = 0, $143 = 0, $146 = 0, $149 = 0, $150 = 0, $157 = 0, $159 = 0, $16 = 0, $162 = 0, $164 = 0, $167 = 0, $169 = 0, $17 = 0, $172 = 0, $175 = 0, $176 = 0, $178 = 0, $179 = 0, $18 = 0, $181 = 0, $182 = 0, $184 = 0, $185 = 0, $19 = 0, $190 = 0, $191 = 0, $20 = 0, $204 = 0, $208 = 0, $214 = 0, $221 = 0, $225 = 0, $234 = 0, $235 = 0, $237 = 0, $238 = 0, $242 = 0, $243 = 0, $251 = 0, $252 = 0, $253 = 0, $255 = 0, $256 = 0, $261 = 0, $262 = 0, $265 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $282 = 0, $292 = 0, $296 = 0, $30 = 0, $302 = 0, $306 = 0, $309 = 0, $313 = 0, $315 = 0, $316 = 0, $318 = 0, $320 = 0, $322 = 0, $324 = 0, $326 = 0, $328 = 0, $330 = 0, $34 = 0, $340 = 0, $341 = 0, $352 = 0, $354 = 0, $357 = 0, $359 = 0, $362 = 0, $364 = 0, $367 = 0, $37 = 0, $370 = 0, $371 = 0, $373 = 0, $374 = 0, $376 = 0, $377 = 0, $379 = 0, $380 = 0, $385 = 0, $386 = 0, $391 = 0, $399 = 0, $403 = 0, $409 = 0, $41 = 0, $416 = 0, $420 = 0, $428 = 0, $431 = 0, $432 = 0, $433 = 0, $437 = 0, $438 = 0, $44 = 0, $444 = 0, $449 = 0, $450 = 0, $453 = 0, $455 = 0, $458 = 0, $463 = 0, $469 = 0, $47 = 0, $471 = 0, $473 = 0, $475 = 0, $49 = 0, $492 = 0, $494 = 0, $50 = 0, $501 = 0, $502 = 0, $503 = 0, $512 = 0, $514 = 0, $515 = 0, $517 = 0, $52 = 0, $526 = 0, $530 = 0, $532 = 0, $533 = 0, $534 = 0, $54 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $550 = 0, $552 = 0, $554 = 0, $555 = 0, $56 = 0, $561 = 0, $563 = 0, $565 = 0, $570 = 0, $572 = 0, $574 = 0, $575 = 0, $576 = 0, $58 = 0, $584 = 0, $585 = 0, $588 = 0, $592 = 0, $595 = 0, $597 = 0, $6 = 0, $60 = 0, $603 = 0, $607 = 0, $611 = 0, $62 = 0, $620 = 0, $621 = 0, $627 = 0, $629 = 0, $633 = 0, $636 = 0, $638 = 0, $64 = 0, $642 = 0, $644 = 0, $649 = 0, $650 = 0, $651 = 0, $657 = 0, $658 = 0, $659 = 0, $663 = 0, $67 = 0, $673 = 0, $675 = 0, $680 = 0, $681 = 0, $682 = 0, $688 = 0, $69 = 0, $690 = 0, $694 = 0, $7 = 0, $70 = 0, $700 = 0, $704 = 0, $71 = 0, $710 = 0, $712 = 0, $718 = 0, $72 = 0, $722 = 0, $723 = 0, $728 = 0, $73 = 0, $734 = 0, $739 = 0, $742 = 0, $743 = 0, $746 = 0, $748 = 0, $750 = 0, $753 = 0, $764 = 0, $769 = 0, $77 = 0, $771 = 0, $774 = 0, $776 = 0, $779 = 0, $782 = 0, $783 = 0, $784 = 0, $786 = 0, $788 = 0, $789 = 0, $791 = 0, $792 = 0, $797 = 0, $798 = 0, $8 = 0, $80 = 0, $812 = 0, $815 = 0, $816 = 0, $822 = 0, $83 = 0, $830 = 0, $836 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $845 = 0, $846 = 0, $852 = 0, $857 = 0, $858 = 0, $861 = 0, $863 = 0, $866 = 0, $87 = 0, $871 = 0, $877 = 0, $879 = 0, $881 = 0, $882 = 0, $9 = 0, $900 = 0, $902 = 0, $909 = 0, $910 = 0, $911 = 0, $919 = 0, $92 = 0, $923 = 0, $927 = 0, $929 = 0, $93 = 0, $935 = 0, $936 = 0, $938 = 0, $939 = 0, $940 = 0, $941 = 0, $943 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $956 = 0, $958 = 0, $96 = 0, $964 = 0, $969 = 0, $972 = 0, $973 = 0, $974 = 0, $978 = 0, $979 = 0, $98 = 0, $985 = 0, $990 = 0, $991 = 0, $994 = 0, $996 = 0, $999 = 0, label = 0, sp = 0, $958$looptemp = 0;
 sp = STACKTOP; //@line 5363
 STACKTOP = STACKTOP + 16 | 0; //@line 5364
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 5364
 $1 = sp; //@line 5365
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 5372
   $7 = $6 >>> 3; //@line 5373
   $8 = HEAP32[3507] | 0; //@line 5374
   $9 = $8 >>> $7; //@line 5375
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 5381
    $16 = 14068 + ($14 << 1 << 2) | 0; //@line 5383
    $17 = $16 + 8 | 0; //@line 5384
    $18 = HEAP32[$17 >> 2] | 0; //@line 5385
    $19 = $18 + 8 | 0; //@line 5386
    $20 = HEAP32[$19 >> 2] | 0; //@line 5387
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[3507] = $8 & ~(1 << $14); //@line 5394
     } else {
      if ((HEAP32[3511] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 5399
      }
      $27 = $20 + 12 | 0; //@line 5402
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 5406
       HEAP32[$17 >> 2] = $20; //@line 5407
       break;
      } else {
       _abort(); //@line 5410
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 5415
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 5418
    $34 = $18 + $30 + 4 | 0; //@line 5420
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 5423
    $$0 = $19; //@line 5424
    STACKTOP = sp; //@line 5425
    return $$0 | 0; //@line 5425
   }
   $37 = HEAP32[3509] | 0; //@line 5427
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 5433
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 5436
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 5439
     $49 = $47 >>> 12 & 16; //@line 5441
     $50 = $47 >>> $49; //@line 5442
     $52 = $50 >>> 5 & 8; //@line 5444
     $54 = $50 >>> $52; //@line 5446
     $56 = $54 >>> 2 & 4; //@line 5448
     $58 = $54 >>> $56; //@line 5450
     $60 = $58 >>> 1 & 2; //@line 5452
     $62 = $58 >>> $60; //@line 5454
     $64 = $62 >>> 1 & 1; //@line 5456
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 5459
     $69 = 14068 + ($67 << 1 << 2) | 0; //@line 5461
     $70 = $69 + 8 | 0; //@line 5462
     $71 = HEAP32[$70 >> 2] | 0; //@line 5463
     $72 = $71 + 8 | 0; //@line 5464
     $73 = HEAP32[$72 >> 2] | 0; //@line 5465
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 5471
       HEAP32[3507] = $77; //@line 5472
       $98 = $77; //@line 5473
      } else {
       if ((HEAP32[3511] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 5478
       }
       $80 = $73 + 12 | 0; //@line 5481
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 5485
        HEAP32[$70 >> 2] = $73; //@line 5486
        $98 = $8; //@line 5487
        break;
       } else {
        _abort(); //@line 5490
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 5495
     $84 = $83 - $6 | 0; //@line 5496
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 5499
     $87 = $71 + $6 | 0; //@line 5500
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 5503
     HEAP32[$71 + $83 >> 2] = $84; //@line 5505
     if ($37 | 0) {
      $92 = HEAP32[3512] | 0; //@line 5508
      $93 = $37 >>> 3; //@line 5509
      $95 = 14068 + ($93 << 1 << 2) | 0; //@line 5511
      $96 = 1 << $93; //@line 5512
      if (!($98 & $96)) {
       HEAP32[3507] = $98 | $96; //@line 5517
       $$0199 = $95; //@line 5519
       $$pre$phiZ2D = $95 + 8 | 0; //@line 5519
      } else {
       $101 = $95 + 8 | 0; //@line 5521
       $102 = HEAP32[$101 >> 2] | 0; //@line 5522
       if ((HEAP32[3511] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 5526
       } else {
        $$0199 = $102; //@line 5529
        $$pre$phiZ2D = $101; //@line 5529
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 5532
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 5534
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 5536
      HEAP32[$92 + 12 >> 2] = $95; //@line 5538
     }
     HEAP32[3509] = $84; //@line 5540
     HEAP32[3512] = $87; //@line 5541
     $$0 = $72; //@line 5542
     STACKTOP = sp; //@line 5543
     return $$0 | 0; //@line 5543
    }
    $108 = HEAP32[3508] | 0; //@line 5545
    if (!$108) {
     $$0197 = $6; //@line 5548
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 5552
     $114 = $112 >>> 12 & 16; //@line 5554
     $115 = $112 >>> $114; //@line 5555
     $117 = $115 >>> 5 & 8; //@line 5557
     $119 = $115 >>> $117; //@line 5559
     $121 = $119 >>> 2 & 4; //@line 5561
     $123 = $119 >>> $121; //@line 5563
     $125 = $123 >>> 1 & 2; //@line 5565
     $127 = $123 >>> $125; //@line 5567
     $129 = $127 >>> 1 & 1; //@line 5569
     $134 = HEAP32[14332 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 5574
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 5578
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 5584
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 5587
      $$0193$lcssa$i = $138; //@line 5587
     } else {
      $$01926$i = $134; //@line 5589
      $$01935$i = $138; //@line 5589
      $146 = $143; //@line 5589
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 5594
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 5595
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 5596
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 5597
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 5603
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 5606
        $$0193$lcssa$i = $$$0193$i; //@line 5606
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 5609
        $$01935$i = $$$0193$i; //@line 5609
       }
      }
     }
     $157 = HEAP32[3511] | 0; //@line 5613
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 5616
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 5619
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 5622
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 5626
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 5628
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 5632
       $176 = HEAP32[$175 >> 2] | 0; //@line 5633
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 5636
        $179 = HEAP32[$178 >> 2] | 0; //@line 5637
        if (!$179) {
         $$3$i = 0; //@line 5640
         break;
        } else {
         $$1196$i = $179; //@line 5643
         $$1198$i = $178; //@line 5643
        }
       } else {
        $$1196$i = $176; //@line 5646
        $$1198$i = $175; //@line 5646
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 5649
        $182 = HEAP32[$181 >> 2] | 0; //@line 5650
        if ($182 | 0) {
         $$1196$i = $182; //@line 5653
         $$1198$i = $181; //@line 5653
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 5656
        $185 = HEAP32[$184 >> 2] | 0; //@line 5657
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 5662
         $$1198$i = $184; //@line 5662
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 5667
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 5670
        $$3$i = $$1196$i; //@line 5671
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 5676
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 5679
       }
       $169 = $167 + 12 | 0; //@line 5682
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 5686
       }
       $172 = $164 + 8 | 0; //@line 5689
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 5693
        HEAP32[$172 >> 2] = $167; //@line 5694
        $$3$i = $164; //@line 5695
        break;
       } else {
        _abort(); //@line 5698
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 5707
       $191 = 14332 + ($190 << 2) | 0; //@line 5708
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 5713
         if (!$$3$i) {
          HEAP32[3508] = $108 & ~(1 << $190); //@line 5719
          break L73;
         }
        } else {
         if ((HEAP32[3511] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 5726
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 5734
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[3511] | 0; //@line 5744
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 5747
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 5751
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 5753
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 5759
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 5763
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 5765
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 5771
       if ($214 | 0) {
        if ((HEAP32[3511] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 5777
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 5781
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 5783
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 5791
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 5794
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 5796
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 5799
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 5803
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 5806
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 5808
      if ($37 | 0) {
       $234 = HEAP32[3512] | 0; //@line 5811
       $235 = $37 >>> 3; //@line 5812
       $237 = 14068 + ($235 << 1 << 2) | 0; //@line 5814
       $238 = 1 << $235; //@line 5815
       if (!($8 & $238)) {
        HEAP32[3507] = $8 | $238; //@line 5820
        $$0189$i = $237; //@line 5822
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 5822
       } else {
        $242 = $237 + 8 | 0; //@line 5824
        $243 = HEAP32[$242 >> 2] | 0; //@line 5825
        if ((HEAP32[3511] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 5829
        } else {
         $$0189$i = $243; //@line 5832
         $$pre$phi$iZ2D = $242; //@line 5832
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 5835
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 5837
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 5839
       HEAP32[$234 + 12 >> 2] = $237; //@line 5841
      }
      HEAP32[3509] = $$0193$lcssa$i; //@line 5843
      HEAP32[3512] = $159; //@line 5844
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 5847
     STACKTOP = sp; //@line 5848
     return $$0 | 0; //@line 5848
    }
   } else {
    $$0197 = $6; //@line 5851
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 5856
   } else {
    $251 = $0 + 11 | 0; //@line 5858
    $252 = $251 & -8; //@line 5859
    $253 = HEAP32[3508] | 0; //@line 5860
    if (!$253) {
     $$0197 = $252; //@line 5863
    } else {
     $255 = 0 - $252 | 0; //@line 5865
     $256 = $251 >>> 8; //@line 5866
     if (!$256) {
      $$0358$i = 0; //@line 5869
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 5873
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 5877
       $262 = $256 << $261; //@line 5878
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 5881
       $267 = $262 << $265; //@line 5883
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 5886
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 5891
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 5897
      }
     }
     $282 = HEAP32[14332 + ($$0358$i << 2) >> 2] | 0; //@line 5901
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 5905
       $$3$i203 = 0; //@line 5905
       $$3350$i = $255; //@line 5905
       label = 81; //@line 5906
      } else {
       $$0342$i = 0; //@line 5913
       $$0347$i = $255; //@line 5913
       $$0353$i = $282; //@line 5913
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 5913
       $$0362$i = 0; //@line 5913
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 5918
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 5923
          $$435113$i = 0; //@line 5923
          $$435712$i = $$0353$i; //@line 5923
          label = 85; //@line 5924
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 5927
          $$1348$i = $292; //@line 5927
         }
        } else {
         $$1343$i = $$0342$i; //@line 5930
         $$1348$i = $$0347$i; //@line 5930
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 5933
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 5936
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 5940
        $302 = ($$0353$i | 0) == 0; //@line 5941
        if ($302) {
         $$2355$i = $$1363$i; //@line 5946
         $$3$i203 = $$1343$i; //@line 5946
         $$3350$i = $$1348$i; //@line 5946
         label = 81; //@line 5947
         break;
        } else {
         $$0342$i = $$1343$i; //@line 5950
         $$0347$i = $$1348$i; //@line 5950
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 5950
         $$0362$i = $$1363$i; //@line 5950
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 5960
       $309 = $253 & ($306 | 0 - $306); //@line 5963
       if (!$309) {
        $$0197 = $252; //@line 5966
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 5971
       $315 = $313 >>> 12 & 16; //@line 5973
       $316 = $313 >>> $315; //@line 5974
       $318 = $316 >>> 5 & 8; //@line 5976
       $320 = $316 >>> $318; //@line 5978
       $322 = $320 >>> 2 & 4; //@line 5980
       $324 = $320 >>> $322; //@line 5982
       $326 = $324 >>> 1 & 2; //@line 5984
       $328 = $324 >>> $326; //@line 5986
       $330 = $328 >>> 1 & 1; //@line 5988
       $$4$ph$i = 0; //@line 5994
       $$4357$ph$i = HEAP32[14332 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 5994
      } else {
       $$4$ph$i = $$3$i203; //@line 5996
       $$4357$ph$i = $$2355$i; //@line 5996
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 6000
       $$4351$lcssa$i = $$3350$i; //@line 6000
      } else {
       $$414$i = $$4$ph$i; //@line 6002
       $$435113$i = $$3350$i; //@line 6002
       $$435712$i = $$4357$ph$i; //@line 6002
       label = 85; //@line 6003
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 6008
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 6012
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 6013
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 6014
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 6015
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 6021
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 6024
        $$4351$lcssa$i = $$$4351$i; //@line 6024
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 6027
        $$435113$i = $$$4351$i; //@line 6027
        label = 85; //@line 6028
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 6034
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[3509] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[3511] | 0; //@line 6040
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 6043
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 6046
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 6049
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 6053
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 6055
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 6059
         $371 = HEAP32[$370 >> 2] | 0; //@line 6060
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 6063
          $374 = HEAP32[$373 >> 2] | 0; //@line 6064
          if (!$374) {
           $$3372$i = 0; //@line 6067
           break;
          } else {
           $$1370$i = $374; //@line 6070
           $$1374$i = $373; //@line 6070
          }
         } else {
          $$1370$i = $371; //@line 6073
          $$1374$i = $370; //@line 6073
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 6076
          $377 = HEAP32[$376 >> 2] | 0; //@line 6077
          if ($377 | 0) {
           $$1370$i = $377; //@line 6080
           $$1374$i = $376; //@line 6080
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 6083
          $380 = HEAP32[$379 >> 2] | 0; //@line 6084
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 6089
           $$1374$i = $379; //@line 6089
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 6094
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 6097
          $$3372$i = $$1370$i; //@line 6098
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 6103
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 6106
         }
         $364 = $362 + 12 | 0; //@line 6109
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 6113
         }
         $367 = $359 + 8 | 0; //@line 6116
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 6120
          HEAP32[$367 >> 2] = $362; //@line 6121
          $$3372$i = $359; //@line 6122
          break;
         } else {
          _abort(); //@line 6125
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 6133
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 6136
         $386 = 14332 + ($385 << 2) | 0; //@line 6137
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 6142
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 6147
            HEAP32[3508] = $391; //@line 6148
            $475 = $391; //@line 6149
            break L164;
           }
          } else {
           if ((HEAP32[3511] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 6156
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 6164
            if (!$$3372$i) {
             $475 = $253; //@line 6167
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[3511] | 0; //@line 6175
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 6178
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 6182
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 6184
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 6190
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 6194
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 6196
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 6202
         if (!$409) {
          $475 = $253; //@line 6205
         } else {
          if ((HEAP32[3511] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 6210
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 6214
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 6216
           $475 = $253; //@line 6217
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 6226
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 6229
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 6231
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 6234
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 6238
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 6241
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 6243
         $428 = $$4351$lcssa$i >>> 3; //@line 6244
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 14068 + ($428 << 1 << 2) | 0; //@line 6248
          $432 = HEAP32[3507] | 0; //@line 6249
          $433 = 1 << $428; //@line 6250
          if (!($432 & $433)) {
           HEAP32[3507] = $432 | $433; //@line 6255
           $$0368$i = $431; //@line 6257
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 6257
          } else {
           $437 = $431 + 8 | 0; //@line 6259
           $438 = HEAP32[$437 >> 2] | 0; //@line 6260
           if ((HEAP32[3511] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 6264
           } else {
            $$0368$i = $438; //@line 6267
            $$pre$phi$i211Z2D = $437; //@line 6267
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 6270
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 6272
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 6274
          HEAP32[$354 + 12 >> 2] = $431; //@line 6276
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 6279
         if (!$444) {
          $$0361$i = 0; //@line 6282
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 6286
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 6290
           $450 = $444 << $449; //@line 6291
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 6294
           $455 = $450 << $453; //@line 6296
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 6299
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 6304
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 6310
          }
         }
         $469 = 14332 + ($$0361$i << 2) | 0; //@line 6313
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 6315
         $471 = $354 + 16 | 0; //@line 6316
         HEAP32[$471 + 4 >> 2] = 0; //@line 6318
         HEAP32[$471 >> 2] = 0; //@line 6319
         $473 = 1 << $$0361$i; //@line 6320
         if (!($475 & $473)) {
          HEAP32[3508] = $475 | $473; //@line 6325
          HEAP32[$469 >> 2] = $354; //@line 6326
          HEAP32[$354 + 24 >> 2] = $469; //@line 6328
          HEAP32[$354 + 12 >> 2] = $354; //@line 6330
          HEAP32[$354 + 8 >> 2] = $354; //@line 6332
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 6341
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 6341
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 6348
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 6352
          $494 = HEAP32[$492 >> 2] | 0; //@line 6354
          if (!$494) {
           label = 136; //@line 6357
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 6360
           $$0345$i = $494; //@line 6360
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[3511] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 6367
          } else {
           HEAP32[$492 >> 2] = $354; //@line 6370
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 6372
           HEAP32[$354 + 12 >> 2] = $354; //@line 6374
           HEAP32[$354 + 8 >> 2] = $354; //@line 6376
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 6381
          $502 = HEAP32[$501 >> 2] | 0; //@line 6382
          $503 = HEAP32[3511] | 0; //@line 6383
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 6389
           HEAP32[$501 >> 2] = $354; //@line 6390
           HEAP32[$354 + 8 >> 2] = $502; //@line 6392
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 6394
           HEAP32[$354 + 24 >> 2] = 0; //@line 6396
           break;
          } else {
           _abort(); //@line 6399
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 6406
       STACKTOP = sp; //@line 6407
       return $$0 | 0; //@line 6407
      } else {
       $$0197 = $252; //@line 6409
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[3509] | 0; //@line 6416
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 6419
  $515 = HEAP32[3512] | 0; //@line 6420
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 6423
   HEAP32[3512] = $517; //@line 6424
   HEAP32[3509] = $514; //@line 6425
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 6428
   HEAP32[$515 + $512 >> 2] = $514; //@line 6430
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 6433
  } else {
   HEAP32[3509] = 0; //@line 6435
   HEAP32[3512] = 0; //@line 6436
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 6439
   $526 = $515 + $512 + 4 | 0; //@line 6441
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 6444
  }
  $$0 = $515 + 8 | 0; //@line 6447
  STACKTOP = sp; //@line 6448
  return $$0 | 0; //@line 6448
 }
 $530 = HEAP32[3510] | 0; //@line 6450
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 6453
  HEAP32[3510] = $532; //@line 6454
  $533 = HEAP32[3513] | 0; //@line 6455
  $534 = $533 + $$0197 | 0; //@line 6456
  HEAP32[3513] = $534; //@line 6457
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 6460
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 6463
  $$0 = $533 + 8 | 0; //@line 6465
  STACKTOP = sp; //@line 6466
  return $$0 | 0; //@line 6466
 }
 if (!(HEAP32[3625] | 0)) {
  HEAP32[3627] = 4096; //@line 6471
  HEAP32[3626] = 4096; //@line 6472
  HEAP32[3628] = -1; //@line 6473
  HEAP32[3629] = -1; //@line 6474
  HEAP32[3630] = 0; //@line 6475
  HEAP32[3618] = 0; //@line 6476
  HEAP32[3625] = $1 & -16 ^ 1431655768; //@line 6480
  $548 = 4096; //@line 6481
 } else {
  $548 = HEAP32[3627] | 0; //@line 6484
 }
 $545 = $$0197 + 48 | 0; //@line 6486
 $546 = $$0197 + 47 | 0; //@line 6487
 $547 = $548 + $546 | 0; //@line 6488
 $549 = 0 - $548 | 0; //@line 6489
 $550 = $547 & $549; //@line 6490
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 6493
  STACKTOP = sp; //@line 6494
  return $$0 | 0; //@line 6494
 }
 $552 = HEAP32[3617] | 0; //@line 6496
 if ($552 | 0) {
  $554 = HEAP32[3615] | 0; //@line 6499
  $555 = $554 + $550 | 0; //@line 6500
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 6505
   STACKTOP = sp; //@line 6506
   return $$0 | 0; //@line 6506
  }
 }
 L244 : do {
  if (!(HEAP32[3618] & 4)) {
   $561 = HEAP32[3513] | 0; //@line 6514
   L246 : do {
    if (!$561) {
     label = 163; //@line 6518
    } else {
     $$0$i$i = 14476; //@line 6520
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 6522
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 6525
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 6534
      if (!$570) {
       label = 163; //@line 6537
       break L246;
      } else {
       $$0$i$i = $570; //@line 6540
      }
     }
     $595 = $547 - $530 & $549; //@line 6544
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 6547
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 6555
       } else {
        $$723947$i = $595; //@line 6557
        $$748$i = $597; //@line 6557
        label = 180; //@line 6558
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 6562
       $$2253$ph$i = $595; //@line 6562
       label = 171; //@line 6563
      }
     } else {
      $$2234243136$i = 0; //@line 6566
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 6572
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 6575
     } else {
      $574 = $572; //@line 6577
      $575 = HEAP32[3626] | 0; //@line 6578
      $576 = $575 + -1 | 0; //@line 6579
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 6587
      $584 = HEAP32[3615] | 0; //@line 6588
      $585 = $$$i + $584 | 0; //@line 6589
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[3617] | 0; //@line 6594
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 6601
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 6605
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 6608
        $$748$i = $572; //@line 6608
        label = 180; //@line 6609
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 6612
        $$2253$ph$i = $$$i; //@line 6612
        label = 171; //@line 6613
       }
      } else {
       $$2234243136$i = 0; //@line 6616
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 6623
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 6632
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 6635
       $$748$i = $$2247$ph$i; //@line 6635
       label = 180; //@line 6636
       break L244;
      }
     }
     $607 = HEAP32[3627] | 0; //@line 6640
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 6644
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 6647
      $$748$i = $$2247$ph$i; //@line 6647
      label = 180; //@line 6648
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 6654
      $$2234243136$i = 0; //@line 6655
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 6659
      $$748$i = $$2247$ph$i; //@line 6659
      label = 180; //@line 6660
      break L244;
     }
    }
   } while (0);
   HEAP32[3618] = HEAP32[3618] | 4; //@line 6667
   $$4236$i = $$2234243136$i; //@line 6668
   label = 178; //@line 6669
  } else {
   $$4236$i = 0; //@line 6671
   label = 178; //@line 6672
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 6678
   $621 = _sbrk(0) | 0; //@line 6679
   $627 = $621 - $620 | 0; //@line 6687
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 6689
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 6697
    $$748$i = $620; //@line 6697
    label = 180; //@line 6698
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[3615] | 0) + $$723947$i | 0; //@line 6704
  HEAP32[3615] = $633; //@line 6705
  if ($633 >>> 0 > (HEAP32[3616] | 0) >>> 0) {
   HEAP32[3616] = $633; //@line 6709
  }
  $636 = HEAP32[3513] | 0; //@line 6711
  do {
   if (!$636) {
    $638 = HEAP32[3511] | 0; //@line 6715
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[3511] = $$748$i; //@line 6720
    }
    HEAP32[3619] = $$748$i; //@line 6722
    HEAP32[3620] = $$723947$i; //@line 6723
    HEAP32[3622] = 0; //@line 6724
    HEAP32[3516] = HEAP32[3625]; //@line 6726
    HEAP32[3515] = -1; //@line 6727
    HEAP32[3520] = 14068; //@line 6728
    HEAP32[3519] = 14068; //@line 6729
    HEAP32[3522] = 14076; //@line 6730
    HEAP32[3521] = 14076; //@line 6731
    HEAP32[3524] = 14084; //@line 6732
    HEAP32[3523] = 14084; //@line 6733
    HEAP32[3526] = 14092; //@line 6734
    HEAP32[3525] = 14092; //@line 6735
    HEAP32[3528] = 14100; //@line 6736
    HEAP32[3527] = 14100; //@line 6737
    HEAP32[3530] = 14108; //@line 6738
    HEAP32[3529] = 14108; //@line 6739
    HEAP32[3532] = 14116; //@line 6740
    HEAP32[3531] = 14116; //@line 6741
    HEAP32[3534] = 14124; //@line 6742
    HEAP32[3533] = 14124; //@line 6743
    HEAP32[3536] = 14132; //@line 6744
    HEAP32[3535] = 14132; //@line 6745
    HEAP32[3538] = 14140; //@line 6746
    HEAP32[3537] = 14140; //@line 6747
    HEAP32[3540] = 14148; //@line 6748
    HEAP32[3539] = 14148; //@line 6749
    HEAP32[3542] = 14156; //@line 6750
    HEAP32[3541] = 14156; //@line 6751
    HEAP32[3544] = 14164; //@line 6752
    HEAP32[3543] = 14164; //@line 6753
    HEAP32[3546] = 14172; //@line 6754
    HEAP32[3545] = 14172; //@line 6755
    HEAP32[3548] = 14180; //@line 6756
    HEAP32[3547] = 14180; //@line 6757
    HEAP32[3550] = 14188; //@line 6758
    HEAP32[3549] = 14188; //@line 6759
    HEAP32[3552] = 14196; //@line 6760
    HEAP32[3551] = 14196; //@line 6761
    HEAP32[3554] = 14204; //@line 6762
    HEAP32[3553] = 14204; //@line 6763
    HEAP32[3556] = 14212; //@line 6764
    HEAP32[3555] = 14212; //@line 6765
    HEAP32[3558] = 14220; //@line 6766
    HEAP32[3557] = 14220; //@line 6767
    HEAP32[3560] = 14228; //@line 6768
    HEAP32[3559] = 14228; //@line 6769
    HEAP32[3562] = 14236; //@line 6770
    HEAP32[3561] = 14236; //@line 6771
    HEAP32[3564] = 14244; //@line 6772
    HEAP32[3563] = 14244; //@line 6773
    HEAP32[3566] = 14252; //@line 6774
    HEAP32[3565] = 14252; //@line 6775
    HEAP32[3568] = 14260; //@line 6776
    HEAP32[3567] = 14260; //@line 6777
    HEAP32[3570] = 14268; //@line 6778
    HEAP32[3569] = 14268; //@line 6779
    HEAP32[3572] = 14276; //@line 6780
    HEAP32[3571] = 14276; //@line 6781
    HEAP32[3574] = 14284; //@line 6782
    HEAP32[3573] = 14284; //@line 6783
    HEAP32[3576] = 14292; //@line 6784
    HEAP32[3575] = 14292; //@line 6785
    HEAP32[3578] = 14300; //@line 6786
    HEAP32[3577] = 14300; //@line 6787
    HEAP32[3580] = 14308; //@line 6788
    HEAP32[3579] = 14308; //@line 6789
    HEAP32[3582] = 14316; //@line 6790
    HEAP32[3581] = 14316; //@line 6791
    $642 = $$723947$i + -40 | 0; //@line 6792
    $644 = $$748$i + 8 | 0; //@line 6794
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 6799
    $650 = $$748$i + $649 | 0; //@line 6800
    $651 = $642 - $649 | 0; //@line 6801
    HEAP32[3513] = $650; //@line 6802
    HEAP32[3510] = $651; //@line 6803
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 6806
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 6809
    HEAP32[3514] = HEAP32[3629]; //@line 6811
   } else {
    $$024367$i = 14476; //@line 6813
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 6815
     $658 = $$024367$i + 4 | 0; //@line 6816
     $659 = HEAP32[$658 >> 2] | 0; //@line 6817
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 6821
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 6825
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 6830
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 6844
       $673 = (HEAP32[3510] | 0) + $$723947$i | 0; //@line 6846
       $675 = $636 + 8 | 0; //@line 6848
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 6853
       $681 = $636 + $680 | 0; //@line 6854
       $682 = $673 - $680 | 0; //@line 6855
       HEAP32[3513] = $681; //@line 6856
       HEAP32[3510] = $682; //@line 6857
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 6860
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 6863
       HEAP32[3514] = HEAP32[3629]; //@line 6865
       break;
      }
     }
    }
    $688 = HEAP32[3511] | 0; //@line 6870
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[3511] = $$748$i; //@line 6873
     $753 = $$748$i; //@line 6874
    } else {
     $753 = $688; //@line 6876
    }
    $690 = $$748$i + $$723947$i | 0; //@line 6878
    $$124466$i = 14476; //@line 6879
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 6884
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 6888
     if (!$694) {
      $$0$i$i$i = 14476; //@line 6891
      break;
     } else {
      $$124466$i = $694; //@line 6894
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 6903
      $700 = $$124466$i + 4 | 0; //@line 6904
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 6907
      $704 = $$748$i + 8 | 0; //@line 6909
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 6915
      $712 = $690 + 8 | 0; //@line 6917
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 6923
      $722 = $710 + $$0197 | 0; //@line 6927
      $723 = $718 - $710 - $$0197 | 0; //@line 6928
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 6931
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[3510] | 0) + $723 | 0; //@line 6936
        HEAP32[3510] = $728; //@line 6937
        HEAP32[3513] = $722; //@line 6938
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 6941
       } else {
        if ((HEAP32[3512] | 0) == ($718 | 0)) {
         $734 = (HEAP32[3509] | 0) + $723 | 0; //@line 6947
         HEAP32[3509] = $734; //@line 6948
         HEAP32[3512] = $722; //@line 6949
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 6952
         HEAP32[$722 + $734 >> 2] = $734; //@line 6954
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 6958
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 6962
         $743 = $739 >>> 3; //@line 6963
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 6968
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 6970
           $750 = 14068 + ($743 << 1 << 2) | 0; //@line 6972
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 6978
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 6987
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[3507] = HEAP32[3507] & ~(1 << $743); //@line 6997
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 7004
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 7008
             }
             $764 = $748 + 8 | 0; //@line 7011
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 7015
              break;
             }
             _abort(); //@line 7018
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 7023
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 7024
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 7027
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 7029
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 7033
             $783 = $782 + 4 | 0; //@line 7034
             $784 = HEAP32[$783 >> 2] | 0; //@line 7035
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 7038
              if (!$786) {
               $$3$i$i = 0; //@line 7041
               break;
              } else {
               $$1291$i$i = $786; //@line 7044
               $$1293$i$i = $782; //@line 7044
              }
             } else {
              $$1291$i$i = $784; //@line 7047
              $$1293$i$i = $783; //@line 7047
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 7050
              $789 = HEAP32[$788 >> 2] | 0; //@line 7051
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 7054
               $$1293$i$i = $788; //@line 7054
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 7057
              $792 = HEAP32[$791 >> 2] | 0; //@line 7058
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 7063
               $$1293$i$i = $791; //@line 7063
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 7068
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 7071
              $$3$i$i = $$1291$i$i; //@line 7072
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 7077
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 7080
             }
             $776 = $774 + 12 | 0; //@line 7083
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 7087
             }
             $779 = $771 + 8 | 0; //@line 7090
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 7094
              HEAP32[$779 >> 2] = $774; //@line 7095
              $$3$i$i = $771; //@line 7096
              break;
             } else {
              _abort(); //@line 7099
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 7109
           $798 = 14332 + ($797 << 2) | 0; //@line 7110
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 7115
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[3508] = HEAP32[3508] & ~(1 << $797); //@line 7124
             break L311;
            } else {
             if ((HEAP32[3511] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 7130
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 7138
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[3511] | 0; //@line 7148
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 7151
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 7155
           $815 = $718 + 16 | 0; //@line 7156
           $816 = HEAP32[$815 >> 2] | 0; //@line 7157
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 7163
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 7167
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 7169
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 7175
           if (!$822) {
            break;
           }
           if ((HEAP32[3511] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 7183
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 7187
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 7189
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 7196
         $$0287$i$i = $742 + $723 | 0; //@line 7196
        } else {
         $$0$i17$i = $718; //@line 7198
         $$0287$i$i = $723; //@line 7198
        }
        $830 = $$0$i17$i + 4 | 0; //@line 7200
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 7203
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 7206
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 7208
        $836 = $$0287$i$i >>> 3; //@line 7209
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 14068 + ($836 << 1 << 2) | 0; //@line 7213
         $840 = HEAP32[3507] | 0; //@line 7214
         $841 = 1 << $836; //@line 7215
         do {
          if (!($840 & $841)) {
           HEAP32[3507] = $840 | $841; //@line 7221
           $$0295$i$i = $839; //@line 7223
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 7223
          } else {
           $845 = $839 + 8 | 0; //@line 7225
           $846 = HEAP32[$845 >> 2] | 0; //@line 7226
           if ((HEAP32[3511] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 7230
            $$pre$phi$i19$iZ2D = $845; //@line 7230
            break;
           }
           _abort(); //@line 7233
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 7237
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 7239
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 7241
         HEAP32[$722 + 12 >> 2] = $839; //@line 7243
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 7246
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 7250
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 7254
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 7259
          $858 = $852 << $857; //@line 7260
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 7263
          $863 = $858 << $861; //@line 7265
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 7268
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 7273
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 7279
         }
        } while (0);
        $877 = 14332 + ($$0296$i$i << 2) | 0; //@line 7282
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 7284
        $879 = $722 + 16 | 0; //@line 7285
        HEAP32[$879 + 4 >> 2] = 0; //@line 7287
        HEAP32[$879 >> 2] = 0; //@line 7288
        $881 = HEAP32[3508] | 0; //@line 7289
        $882 = 1 << $$0296$i$i; //@line 7290
        if (!($881 & $882)) {
         HEAP32[3508] = $881 | $882; //@line 7295
         HEAP32[$877 >> 2] = $722; //@line 7296
         HEAP32[$722 + 24 >> 2] = $877; //@line 7298
         HEAP32[$722 + 12 >> 2] = $722; //@line 7300
         HEAP32[$722 + 8 >> 2] = $722; //@line 7302
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 7311
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 7311
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 7318
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 7322
         $902 = HEAP32[$900 >> 2] | 0; //@line 7324
         if (!$902) {
          label = 260; //@line 7327
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 7330
          $$0289$i$i = $902; //@line 7330
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[3511] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 7337
         } else {
          HEAP32[$900 >> 2] = $722; //@line 7340
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 7342
          HEAP32[$722 + 12 >> 2] = $722; //@line 7344
          HEAP32[$722 + 8 >> 2] = $722; //@line 7346
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 7351
         $910 = HEAP32[$909 >> 2] | 0; //@line 7352
         $911 = HEAP32[3511] | 0; //@line 7353
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 7359
          HEAP32[$909 >> 2] = $722; //@line 7360
          HEAP32[$722 + 8 >> 2] = $910; //@line 7362
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 7364
          HEAP32[$722 + 24 >> 2] = 0; //@line 7366
          break;
         } else {
          _abort(); //@line 7369
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 7376
      STACKTOP = sp; //@line 7377
      return $$0 | 0; //@line 7377
     } else {
      $$0$i$i$i = 14476; //@line 7379
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 7383
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 7388
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 7396
    }
    $927 = $923 + -47 | 0; //@line 7398
    $929 = $927 + 8 | 0; //@line 7400
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 7406
    $936 = $636 + 16 | 0; //@line 7407
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 7409
    $939 = $938 + 8 | 0; //@line 7410
    $940 = $938 + 24 | 0; //@line 7411
    $941 = $$723947$i + -40 | 0; //@line 7412
    $943 = $$748$i + 8 | 0; //@line 7414
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 7419
    $949 = $$748$i + $948 | 0; //@line 7420
    $950 = $941 - $948 | 0; //@line 7421
    HEAP32[3513] = $949; //@line 7422
    HEAP32[3510] = $950; //@line 7423
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 7426
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 7429
    HEAP32[3514] = HEAP32[3629]; //@line 7431
    $956 = $938 + 4 | 0; //@line 7432
    HEAP32[$956 >> 2] = 27; //@line 7433
    HEAP32[$939 >> 2] = HEAP32[3619]; //@line 7434
    HEAP32[$939 + 4 >> 2] = HEAP32[3620]; //@line 7434
    HEAP32[$939 + 8 >> 2] = HEAP32[3621]; //@line 7434
    HEAP32[$939 + 12 >> 2] = HEAP32[3622]; //@line 7434
    HEAP32[3619] = $$748$i; //@line 7435
    HEAP32[3620] = $$723947$i; //@line 7436
    HEAP32[3622] = 0; //@line 7437
    HEAP32[3621] = $939; //@line 7438
    $958 = $940; //@line 7439
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 7441
     HEAP32[$958 >> 2] = 7; //@line 7442
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 7455
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 7458
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 7461
     HEAP32[$938 >> 2] = $964; //@line 7462
     $969 = $964 >>> 3; //@line 7463
     if ($964 >>> 0 < 256) {
      $972 = 14068 + ($969 << 1 << 2) | 0; //@line 7467
      $973 = HEAP32[3507] | 0; //@line 7468
      $974 = 1 << $969; //@line 7469
      if (!($973 & $974)) {
       HEAP32[3507] = $973 | $974; //@line 7474
       $$0211$i$i = $972; //@line 7476
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 7476
      } else {
       $978 = $972 + 8 | 0; //@line 7478
       $979 = HEAP32[$978 >> 2] | 0; //@line 7479
       if ((HEAP32[3511] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 7483
       } else {
        $$0211$i$i = $979; //@line 7486
        $$pre$phi$i$iZ2D = $978; //@line 7486
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 7489
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 7491
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 7493
      HEAP32[$636 + 12 >> 2] = $972; //@line 7495
      break;
     }
     $985 = $964 >>> 8; //@line 7498
     if (!$985) {
      $$0212$i$i = 0; //@line 7501
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 7505
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 7509
       $991 = $985 << $990; //@line 7510
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 7513
       $996 = $991 << $994; //@line 7515
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 7518
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 7523
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 7529
      }
     }
     $1010 = 14332 + ($$0212$i$i << 2) | 0; //@line 7532
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 7534
     HEAP32[$636 + 20 >> 2] = 0; //@line 7536
     HEAP32[$936 >> 2] = 0; //@line 7537
     $1013 = HEAP32[3508] | 0; //@line 7538
     $1014 = 1 << $$0212$i$i; //@line 7539
     if (!($1013 & $1014)) {
      HEAP32[3508] = $1013 | $1014; //@line 7544
      HEAP32[$1010 >> 2] = $636; //@line 7545
      HEAP32[$636 + 24 >> 2] = $1010; //@line 7547
      HEAP32[$636 + 12 >> 2] = $636; //@line 7549
      HEAP32[$636 + 8 >> 2] = $636; //@line 7551
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 7560
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 7560
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 7567
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 7571
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 7573
      if (!$1034) {
       label = 286; //@line 7576
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 7579
       $$0207$i$i = $1034; //@line 7579
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[3511] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 7586
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 7589
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 7591
       HEAP32[$636 + 12 >> 2] = $636; //@line 7593
       HEAP32[$636 + 8 >> 2] = $636; //@line 7595
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 7600
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 7601
      $1043 = HEAP32[3511] | 0; //@line 7602
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 7608
       HEAP32[$1041 >> 2] = $636; //@line 7609
       HEAP32[$636 + 8 >> 2] = $1042; //@line 7611
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 7613
       HEAP32[$636 + 24 >> 2] = 0; //@line 7615
       break;
      } else {
       _abort(); //@line 7618
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[3510] | 0; //@line 7625
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 7628
   HEAP32[3510] = $1054; //@line 7629
   $1055 = HEAP32[3513] | 0; //@line 7630
   $1056 = $1055 + $$0197 | 0; //@line 7631
   HEAP32[3513] = $1056; //@line 7632
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 7635
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 7638
   $$0 = $1055 + 8 | 0; //@line 7640
   STACKTOP = sp; //@line 7641
   return $$0 | 0; //@line 7641
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 7645
 $$0 = 0; //@line 7646
 STACKTOP = sp; //@line 7647
 return $$0 | 0; //@line 7647
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11799
 STACKTOP = STACKTOP + 560 | 0; //@line 11800
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 11800
 $6 = sp + 8 | 0; //@line 11801
 $7 = sp; //@line 11802
 $8 = sp + 524 | 0; //@line 11803
 $9 = $8; //@line 11804
 $10 = sp + 512 | 0; //@line 11805
 HEAP32[$7 >> 2] = 0; //@line 11806
 $11 = $10 + 12 | 0; //@line 11807
 ___DOUBLE_BITS_677($1) | 0; //@line 11808
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 11813
  $$0520 = 1; //@line 11813
  $$0521 = 7128; //@line 11813
 } else {
  $$0471 = $1; //@line 11824
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 11824
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 7129 : 7134 : 7131; //@line 11824
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 11826
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 11835
   $31 = $$0520 + 3 | 0; //@line 11840
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 11842
   _out_670($0, $$0521, $$0520); //@line 11843
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 7155 : 7159 : $27 ? 7147 : 7151, 3); //@line 11844
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 11846
   $$sink560 = $31; //@line 11847
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 11850
   $36 = $35 != 0.0; //@line 11851
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 11855
   }
   $39 = $5 | 32; //@line 11857
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 11860
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 11863
    $44 = $$0520 | 2; //@line 11864
    $46 = 12 - $3 | 0; //@line 11866
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 11871
     } else {
      $$0509585 = 8.0; //@line 11873
      $$1508586 = $46; //@line 11873
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 11875
       $$0509585 = $$0509585 * 16.0; //@line 11876
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 11891
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 11896
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 11901
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 11904
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 11907
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 11910
     HEAP8[$68 >> 0] = 48; //@line 11911
     $$0511 = $68; //@line 11912
    } else {
     $$0511 = $66; //@line 11914
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 11921
    $76 = $$0511 + -2 | 0; //@line 11924
    HEAP8[$76 >> 0] = $5 + 15; //@line 11925
    $77 = ($3 | 0) < 1; //@line 11926
    $79 = ($4 & 8 | 0) == 0; //@line 11928
    $$0523 = $8; //@line 11929
    $$2473 = $$1472; //@line 11929
    while (1) {
     $80 = ~~$$2473; //@line 11931
     $86 = $$0523 + 1 | 0; //@line 11937
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[7163 + $80 >> 0]; //@line 11938
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 11941
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 11950
      } else {
       HEAP8[$86 >> 0] = 46; //@line 11953
       $$1524 = $$0523 + 2 | 0; //@line 11954
      }
     } else {
      $$1524 = $86; //@line 11957
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 11961
     }
    }
    $$pre693 = $$1524; //@line 11967
    if (!$3) {
     label = 24; //@line 11969
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 11977
      $$sink = $3 + 2 | 0; //@line 11977
     } else {
      label = 24; //@line 11979
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 11983
     $$pre$phi691Z2D = $101; //@line 11984
     $$sink = $101; //@line 11984
    }
    $104 = $11 - $76 | 0; //@line 11988
    $106 = $104 + $44 + $$sink | 0; //@line 11990
    _pad_676($0, 32, $2, $106, $4); //@line 11991
    _out_670($0, $$0521$, $44); //@line 11992
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 11994
    _out_670($0, $8, $$pre$phi691Z2D); //@line 11995
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 11997
    _out_670($0, $76, $104); //@line 11998
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 12000
    $$sink560 = $106; //@line 12001
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 12005
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 12009
    HEAP32[$7 >> 2] = $113; //@line 12010
    $$3 = $35 * 268435456.0; //@line 12011
    $$pr = $113; //@line 12011
   } else {
    $$3 = $35; //@line 12014
    $$pr = HEAP32[$7 >> 2] | 0; //@line 12014
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 12018
   $$0498 = $$561; //@line 12019
   $$4 = $$3; //@line 12019
   do {
    $116 = ~~$$4 >>> 0; //@line 12021
    HEAP32[$$0498 >> 2] = $116; //@line 12022
    $$0498 = $$0498 + 4 | 0; //@line 12023
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 12026
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 12036
    $$1499662 = $$0498; //@line 12036
    $124 = $$pr; //@line 12036
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 12039
     $$0488655 = $$1499662 + -4 | 0; //@line 12040
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 12043
     } else {
      $$0488657 = $$0488655; //@line 12045
      $$0497656 = 0; //@line 12045
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 12048
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 12050
       $131 = tempRet0; //@line 12051
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 12052
       HEAP32[$$0488657 >> 2] = $132; //@line 12054
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 12055
       $$0488657 = $$0488657 + -4 | 0; //@line 12057
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 12067
      } else {
       $138 = $$1482663 + -4 | 0; //@line 12069
       HEAP32[$138 >> 2] = $$0497656; //@line 12070
       $$2483$ph = $138; //@line 12071
      }
     }
     $$2500 = $$1499662; //@line 12074
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 12080
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 12084
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 12090
     HEAP32[$7 >> 2] = $144; //@line 12091
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 12094
      $$1499662 = $$2500; //@line 12094
      $124 = $144; //@line 12094
     } else {
      $$1482$lcssa = $$2483$ph; //@line 12096
      $$1499$lcssa = $$2500; //@line 12096
      $$pr566 = $144; //@line 12096
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 12101
    $$1499$lcssa = $$0498; //@line 12101
    $$pr566 = $$pr; //@line 12101
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 12107
    $150 = ($39 | 0) == 102; //@line 12108
    $$3484650 = $$1482$lcssa; //@line 12109
    $$3501649 = $$1499$lcssa; //@line 12109
    $152 = $$pr566; //@line 12109
    while (1) {
     $151 = 0 - $152 | 0; //@line 12111
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 12113
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 12117
      $161 = 1e9 >>> $154; //@line 12118
      $$0487644 = 0; //@line 12119
      $$1489643 = $$3484650; //@line 12119
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 12121
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 12125
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 12126
       $$1489643 = $$1489643 + 4 | 0; //@line 12127
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 12138
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 12141
       $$4502 = $$3501649; //@line 12141
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 12144
       $$$3484700 = $$$3484; //@line 12145
       $$4502 = $$3501649 + 4 | 0; //@line 12145
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 12152
      $$4502 = $$3501649; //@line 12152
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 12154
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 12161
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 12163
     HEAP32[$7 >> 2] = $152; //@line 12164
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 12169
      $$3501$lcssa = $$$4502; //@line 12169
      break;
     } else {
      $$3484650 = $$$3484700; //@line 12167
      $$3501649 = $$$4502; //@line 12167
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 12174
    $$3501$lcssa = $$1499$lcssa; //@line 12174
   }
   $185 = $$561; //@line 12177
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 12182
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 12183
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 12186
    } else {
     $$0514639 = $189; //@line 12188
     $$0530638 = 10; //@line 12188
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 12190
      $193 = $$0514639 + 1 | 0; //@line 12191
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 12194
       break;
      } else {
       $$0514639 = $193; //@line 12197
      }
     }
    }
   } else {
    $$1515 = 0; //@line 12202
   }
   $198 = ($39 | 0) == 103; //@line 12207
   $199 = ($$540 | 0) != 0; //@line 12208
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 12211
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 12220
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 12223
    $213 = ($209 | 0) % 9 | 0; //@line 12224
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 12227
     $$1531632 = 10; //@line 12227
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 12230
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 12233
       $$1531632 = $215; //@line 12233
      } else {
       $$1531$lcssa = $215; //@line 12235
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 12240
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 12242
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 12243
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 12246
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 12249
     $$4518 = $$1515; //@line 12249
     $$8 = $$3484$lcssa; //@line 12249
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 12254
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 12255
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 12260
     if (!$$0520) {
      $$1467 = $$$564; //@line 12263
      $$1469 = $$543; //@line 12263
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 12266
      $$1467 = $230 ? -$$$564 : $$$564; //@line 12271
      $$1469 = $230 ? -$$543 : $$543; //@line 12271
     }
     $233 = $217 - $218 | 0; //@line 12273
     HEAP32[$212 >> 2] = $233; //@line 12274
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 12278
      HEAP32[$212 >> 2] = $236; //@line 12279
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 12282
       $$sink547625 = $212; //@line 12282
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 12284
        HEAP32[$$sink547625 >> 2] = 0; //@line 12285
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 12288
         HEAP32[$240 >> 2] = 0; //@line 12289
         $$6 = $240; //@line 12290
        } else {
         $$6 = $$5486626; //@line 12292
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 12295
        HEAP32[$238 >> 2] = $242; //@line 12296
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 12299
         $$sink547625 = $238; //@line 12299
        } else {
         $$5486$lcssa = $$6; //@line 12301
         $$sink547$lcssa = $238; //@line 12301
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 12306
       $$sink547$lcssa = $212; //@line 12306
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 12311
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 12312
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 12315
       $$4518 = $247; //@line 12315
       $$8 = $$5486$lcssa; //@line 12315
      } else {
       $$2516621 = $247; //@line 12317
       $$2532620 = 10; //@line 12317
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 12319
        $251 = $$2516621 + 1 | 0; //@line 12320
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 12323
         $$4518 = $251; //@line 12323
         $$8 = $$5486$lcssa; //@line 12323
         break;
        } else {
         $$2516621 = $251; //@line 12326
        }
       }
      }
     } else {
      $$4492 = $212; //@line 12331
      $$4518 = $$1515; //@line 12331
      $$8 = $$3484$lcssa; //@line 12331
     }
    }
    $253 = $$4492 + 4 | 0; //@line 12334
    $$5519$ph = $$4518; //@line 12337
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 12337
    $$9$ph = $$8; //@line 12337
   } else {
    $$5519$ph = $$1515; //@line 12339
    $$7505$ph = $$3501$lcssa; //@line 12339
    $$9$ph = $$3484$lcssa; //@line 12339
   }
   $$7505 = $$7505$ph; //@line 12341
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 12345
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 12348
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 12352
    } else {
     $$lcssa675 = 1; //@line 12354
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 12358
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 12363
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 12371
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 12371
     } else {
      $$0479 = $5 + -2 | 0; //@line 12375
      $$2476 = $$540$ + -1 | 0; //@line 12375
     }
     $267 = $4 & 8; //@line 12377
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 12382
       if (!$270) {
        $$2529 = 9; //@line 12385
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 12390
         $$3533616 = 10; //@line 12390
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 12392
          $275 = $$1528617 + 1 | 0; //@line 12393
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 12399
           break;
          } else {
           $$1528617 = $275; //@line 12397
          }
         }
        } else {
         $$2529 = 0; //@line 12404
        }
       }
      } else {
       $$2529 = 9; //@line 12408
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 12416
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 12418
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 12420
       $$1480 = $$0479; //@line 12423
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 12423
       $$pre$phi698Z2D = 0; //@line 12423
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 12427
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 12429
       $$1480 = $$0479; //@line 12432
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 12432
       $$pre$phi698Z2D = 0; //@line 12432
       break;
      }
     } else {
      $$1480 = $$0479; //@line 12436
      $$3477 = $$2476; //@line 12436
      $$pre$phi698Z2D = $267; //@line 12436
     }
    } else {
     $$1480 = $5; //@line 12440
     $$3477 = $$540; //@line 12440
     $$pre$phi698Z2D = $4 & 8; //@line 12440
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 12443
   $294 = ($292 | 0) != 0 & 1; //@line 12445
   $296 = ($$1480 | 32 | 0) == 102; //@line 12447
   if ($296) {
    $$2513 = 0; //@line 12451
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 12451
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 12454
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 12457
    $304 = $11; //@line 12458
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 12463
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 12465
      HEAP8[$308 >> 0] = 48; //@line 12466
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 12471
      } else {
       $$1512$lcssa = $308; //@line 12473
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 12478
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 12485
    $318 = $$1512$lcssa + -2 | 0; //@line 12487
    HEAP8[$318 >> 0] = $$1480; //@line 12488
    $$2513 = $318; //@line 12491
    $$pn = $304 - $318 | 0; //@line 12491
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 12496
   _pad_676($0, 32, $2, $323, $4); //@line 12497
   _out_670($0, $$0521, $$0520); //@line 12498
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 12500
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 12503
    $326 = $8 + 9 | 0; //@line 12504
    $327 = $326; //@line 12505
    $328 = $8 + 8 | 0; //@line 12506
    $$5493600 = $$0496$$9; //@line 12507
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 12510
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 12515
       $$1465 = $328; //@line 12516
      } else {
       $$1465 = $330; //@line 12518
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 12525
       $$0464597 = $330; //@line 12526
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 12528
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 12531
        } else {
         $$1465 = $335; //@line 12533
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 12538
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 12543
     $$5493600 = $$5493600 + 4 | 0; //@line 12544
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 7179, 1); //@line 12554
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 12560
     $$6494592 = $$5493600; //@line 12560
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 12563
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 12568
       $$0463587 = $347; //@line 12569
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 12571
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 12574
        } else {
         $$0463$lcssa = $351; //@line 12576
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 12581
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 12585
      $$6494592 = $$6494592 + 4 | 0; //@line 12586
      $356 = $$4478593 + -9 | 0; //@line 12587
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 12594
       break;
      } else {
       $$4478593 = $356; //@line 12592
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 12599
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 12602
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 12605
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 12608
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 12609
     $365 = $363; //@line 12610
     $366 = 0 - $9 | 0; //@line 12611
     $367 = $8 + 8 | 0; //@line 12612
     $$5605 = $$3477; //@line 12613
     $$7495604 = $$9$ph; //@line 12613
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 12616
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 12619
       $$0 = $367; //@line 12620
      } else {
       $$0 = $369; //@line 12622
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 12627
        _out_670($0, $$0, 1); //@line 12628
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 12632
         break;
        }
        _out_670($0, 7179, 1); //@line 12635
        $$2 = $375; //@line 12636
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 12640
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 12645
        $$1601 = $$0; //@line 12646
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 12648
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 12651
         } else {
          $$2 = $373; //@line 12653
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 12660
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 12663
      $381 = $$5605 - $378 | 0; //@line 12664
      $$7495604 = $$7495604 + 4 | 0; //@line 12665
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 12672
       break;
      } else {
       $$5605 = $381; //@line 12670
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 12677
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 12680
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 12684
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 12687
   $$sink560 = $323; //@line 12688
  }
 } while (0);
 STACKTOP = sp; //@line 12693
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 12693
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 10371
 STACKTOP = STACKTOP + 64 | 0; //@line 10372
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 10372
 $5 = sp + 16 | 0; //@line 10373
 $6 = sp; //@line 10374
 $7 = sp + 24 | 0; //@line 10375
 $8 = sp + 8 | 0; //@line 10376
 $9 = sp + 20 | 0; //@line 10377
 HEAP32[$5 >> 2] = $1; //@line 10378
 $10 = ($0 | 0) != 0; //@line 10379
 $11 = $7 + 40 | 0; //@line 10380
 $12 = $11; //@line 10381
 $13 = $7 + 39 | 0; //@line 10382
 $14 = $8 + 4 | 0; //@line 10383
 $$0243 = 0; //@line 10384
 $$0247 = 0; //@line 10384
 $$0269 = 0; //@line 10384
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 10393
     $$1248 = -1; //@line 10394
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 10398
     break;
    }
   } else {
    $$1248 = $$0247; //@line 10402
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 10405
  $21 = HEAP8[$20 >> 0] | 0; //@line 10406
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 10409
   break;
  } else {
   $23 = $21; //@line 10412
   $25 = $20; //@line 10412
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 10417
     $27 = $25; //@line 10417
     label = 9; //@line 10418
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 10423
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 10430
   HEAP32[$5 >> 2] = $24; //@line 10431
   $23 = HEAP8[$24 >> 0] | 0; //@line 10433
   $25 = $24; //@line 10433
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 10438
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 10443
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 10446
     $27 = $27 + 2 | 0; //@line 10447
     HEAP32[$5 >> 2] = $27; //@line 10448
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 10455
      break;
     } else {
      $$0249303 = $30; //@line 10452
      label = 9; //@line 10453
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 10463
  if ($10) {
   _out_670($0, $20, $36); //@line 10465
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 10469
   $$0247 = $$1248; //@line 10469
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 10477
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 10478
  if ($43) {
   $$0253 = -1; //@line 10480
   $$1270 = $$0269; //@line 10480
   $$sink = 1; //@line 10480
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 10490
    $$1270 = 1; //@line 10490
    $$sink = 3; //@line 10490
   } else {
    $$0253 = -1; //@line 10492
    $$1270 = $$0269; //@line 10492
    $$sink = 1; //@line 10492
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 10495
  HEAP32[$5 >> 2] = $51; //@line 10496
  $52 = HEAP8[$51 >> 0] | 0; //@line 10497
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 10499
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 10506
   $$lcssa291 = $52; //@line 10506
   $$lcssa292 = $51; //@line 10506
  } else {
   $$0262309 = 0; //@line 10508
   $60 = $52; //@line 10508
   $65 = $51; //@line 10508
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 10513
    $64 = $65 + 1 | 0; //@line 10514
    HEAP32[$5 >> 2] = $64; //@line 10515
    $66 = HEAP8[$64 >> 0] | 0; //@line 10516
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 10518
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 10525
     $$lcssa291 = $66; //@line 10525
     $$lcssa292 = $64; //@line 10525
     break;
    } else {
     $$0262309 = $63; //@line 10528
     $60 = $66; //@line 10528
     $65 = $64; //@line 10528
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 10540
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 10542
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 10547
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 10552
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 10564
     $$2271 = 1; //@line 10564
     $storemerge274 = $79 + 3 | 0; //@line 10564
    } else {
     label = 23; //@line 10566
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 10570
    if ($$1270 | 0) {
     $$0 = -1; //@line 10573
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10588
     $106 = HEAP32[$105 >> 2] | 0; //@line 10589
     HEAP32[$2 >> 2] = $105 + 4; //@line 10591
     $363 = $106; //@line 10592
    } else {
     $363 = 0; //@line 10594
    }
    $$0259 = $363; //@line 10598
    $$2271 = 0; //@line 10598
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 10598
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 10600
   $109 = ($$0259 | 0) < 0; //@line 10601
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 10606
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 10606
   $$3272 = $$2271; //@line 10606
   $115 = $storemerge274; //@line 10606
  } else {
   $112 = _getint_671($5) | 0; //@line 10608
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 10611
    break;
   }
   $$1260 = $112; //@line 10615
   $$1263 = $$0262$lcssa; //@line 10615
   $$3272 = $$1270; //@line 10615
   $115 = HEAP32[$5 >> 2] | 0; //@line 10615
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 10626
     $156 = _getint_671($5) | 0; //@line 10627
     $$0254 = $156; //@line 10629
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 10629
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 10638
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 10643
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 10648
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 10655
      $144 = $125 + 4 | 0; //@line 10659
      HEAP32[$5 >> 2] = $144; //@line 10660
      $$0254 = $140; //@line 10661
      $$pre345 = $144; //@line 10661
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 10667
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10682
     $152 = HEAP32[$151 >> 2] | 0; //@line 10683
     HEAP32[$2 >> 2] = $151 + 4; //@line 10685
     $364 = $152; //@line 10686
    } else {
     $364 = 0; //@line 10688
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 10691
    HEAP32[$5 >> 2] = $154; //@line 10692
    $$0254 = $364; //@line 10693
    $$pre345 = $154; //@line 10693
   } else {
    $$0254 = -1; //@line 10695
    $$pre345 = $115; //@line 10695
   }
  } while (0);
  $$0252 = 0; //@line 10698
  $158 = $$pre345; //@line 10698
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 10705
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 10708
   HEAP32[$5 >> 2] = $158; //@line 10709
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (6647 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 10714
   $168 = $167 & 255; //@line 10715
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 10719
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 10726
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 10730
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 10734
     break L1;
    } else {
     label = 50; //@line 10737
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 10742
     $176 = $3 + ($$0253 << 3) | 0; //@line 10744
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 10749
     $182 = $6; //@line 10750
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 10752
     HEAP32[$182 + 4 >> 2] = $181; //@line 10755
     label = 50; //@line 10756
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 10760
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 10763
    $187 = HEAP32[$5 >> 2] | 0; //@line 10765
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 10769
   if ($10) {
    $187 = $158; //@line 10771
   } else {
    $$0243 = 0; //@line 10773
    $$0247 = $$1248; //@line 10773
    $$0269 = $$3272; //@line 10773
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 10779
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 10785
  $196 = $$1263 & -65537; //@line 10788
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 10789
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 10797
       $$0243 = 0; //@line 10798
       $$0247 = $$1248; //@line 10798
       $$0269 = $$3272; //@line 10798
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 10804
       $$0243 = 0; //@line 10805
       $$0247 = $$1248; //@line 10805
       $$0269 = $$3272; //@line 10805
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 10813
       HEAP32[$208 >> 2] = $$1248; //@line 10815
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 10818
       $$0243 = 0; //@line 10819
       $$0247 = $$1248; //@line 10819
       $$0269 = $$3272; //@line 10819
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 10826
       $$0243 = 0; //@line 10827
       $$0247 = $$1248; //@line 10827
       $$0269 = $$3272; //@line 10827
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 10834
       $$0243 = 0; //@line 10835
       $$0247 = $$1248; //@line 10835
       $$0269 = $$3272; //@line 10835
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 10841
       $$0243 = 0; //@line 10842
       $$0247 = $$1248; //@line 10842
       $$0269 = $$3272; //@line 10842
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 10850
       HEAP32[$220 >> 2] = $$1248; //@line 10852
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 10855
       $$0243 = 0; //@line 10856
       $$0247 = $$1248; //@line 10856
       $$0269 = $$3272; //@line 10856
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 10861
       $$0247 = $$1248; //@line 10861
       $$0269 = $$3272; //@line 10861
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 10871
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 10871
     $$3265 = $$1263$ | 8; //@line 10871
     label = 62; //@line 10872
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 10876
     $$1255 = $$0254; //@line 10876
     $$3265 = $$1263$; //@line 10876
     label = 62; //@line 10877
     break;
    }
   case 111:
    {
     $242 = $6; //@line 10881
     $244 = HEAP32[$242 >> 2] | 0; //@line 10883
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 10886
     $248 = _fmt_o($244, $247, $11) | 0; //@line 10887
     $252 = $12 - $248 | 0; //@line 10891
     $$0228 = $248; //@line 10896
     $$1233 = 0; //@line 10896
     $$1238 = 7111; //@line 10896
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 10896
     $$4266 = $$1263$; //@line 10896
     $281 = $244; //@line 10896
     $283 = $247; //@line 10896
     label = 68; //@line 10897
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 10901
     $258 = HEAP32[$256 >> 2] | 0; //@line 10903
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 10906
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 10909
      $264 = tempRet0; //@line 10910
      $265 = $6; //@line 10911
      HEAP32[$265 >> 2] = $263; //@line 10913
      HEAP32[$265 + 4 >> 2] = $264; //@line 10916
      $$0232 = 1; //@line 10917
      $$0237 = 7111; //@line 10917
      $275 = $263; //@line 10917
      $276 = $264; //@line 10917
      label = 67; //@line 10918
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 10930
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 7111 : 7113 : 7112; //@line 10930
      $275 = $258; //@line 10930
      $276 = $261; //@line 10930
      label = 67; //@line 10931
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 10937
     $$0232 = 0; //@line 10943
     $$0237 = 7111; //@line 10943
     $275 = HEAP32[$197 >> 2] | 0; //@line 10943
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 10943
     label = 67; //@line 10944
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 10955
     $$2 = $13; //@line 10956
     $$2234 = 0; //@line 10956
     $$2239 = 7111; //@line 10956
     $$2251 = $11; //@line 10956
     $$5 = 1; //@line 10956
     $$6268 = $196; //@line 10956
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 10963
     label = 72; //@line 10964
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 10968
     $$1 = $302 | 0 ? $302 : 7121; //@line 10971
     label = 72; //@line 10972
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 10982
     HEAP32[$14 >> 2] = 0; //@line 10983
     HEAP32[$6 >> 2] = $8; //@line 10984
     $$4258354 = -1; //@line 10985
     $365 = $8; //@line 10985
     label = 76; //@line 10986
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 10990
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 10993
      $$0240$lcssa356 = 0; //@line 10994
      label = 85; //@line 10995
     } else {
      $$4258354 = $$0254; //@line 10997
      $365 = $$pre348; //@line 10997
      label = 76; //@line 10998
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 11005
     $$0247 = $$1248; //@line 11005
     $$0269 = $$3272; //@line 11005
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 11010
     $$2234 = 0; //@line 11010
     $$2239 = 7111; //@line 11010
     $$2251 = $11; //@line 11010
     $$5 = $$0254; //@line 11010
     $$6268 = $$1263$; //@line 11010
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 11016
    $227 = $6; //@line 11017
    $229 = HEAP32[$227 >> 2] | 0; //@line 11019
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 11022
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 11024
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 11030
    $$0228 = $234; //@line 11035
    $$1233 = $or$cond278 ? 0 : 2; //@line 11035
    $$1238 = $or$cond278 ? 7111 : 7111 + ($$1236 >> 4) | 0; //@line 11035
    $$2256 = $$1255; //@line 11035
    $$4266 = $$3265; //@line 11035
    $281 = $229; //@line 11035
    $283 = $232; //@line 11035
    label = 68; //@line 11036
   } else if ((label | 0) == 67) {
    label = 0; //@line 11039
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 11041
    $$1233 = $$0232; //@line 11041
    $$1238 = $$0237; //@line 11041
    $$2256 = $$0254; //@line 11041
    $$4266 = $$1263$; //@line 11041
    $281 = $275; //@line 11041
    $283 = $276; //@line 11041
    label = 68; //@line 11042
   } else if ((label | 0) == 72) {
    label = 0; //@line 11045
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 11046
    $306 = ($305 | 0) == 0; //@line 11047
    $$2 = $$1; //@line 11054
    $$2234 = 0; //@line 11054
    $$2239 = 7111; //@line 11054
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 11054
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 11054
    $$6268 = $196; //@line 11054
   } else if ((label | 0) == 76) {
    label = 0; //@line 11057
    $$0229316 = $365; //@line 11058
    $$0240315 = 0; //@line 11058
    $$1244314 = 0; //@line 11058
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 11060
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 11063
      $$2245 = $$1244314; //@line 11063
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 11066
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 11072
      $$2245 = $320; //@line 11072
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 11076
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 11079
      $$0240315 = $325; //@line 11079
      $$1244314 = $320; //@line 11079
     } else {
      $$0240$lcssa = $325; //@line 11081
      $$2245 = $320; //@line 11081
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 11087
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 11090
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 11093
     label = 85; //@line 11094
    } else {
     $$1230327 = $365; //@line 11096
     $$1241326 = 0; //@line 11096
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 11098
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 11101
       label = 85; //@line 11102
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 11105
      $$1241326 = $331 + $$1241326 | 0; //@line 11106
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 11109
       label = 85; //@line 11110
       break L97;
      }
      _out_670($0, $9, $331); //@line 11114
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 11119
       label = 85; //@line 11120
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 11117
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 11128
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 11134
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 11136
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 11141
   $$2 = $or$cond ? $$0228 : $11; //@line 11146
   $$2234 = $$1233; //@line 11146
   $$2239 = $$1238; //@line 11146
   $$2251 = $11; //@line 11146
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 11146
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 11146
  } else if ((label | 0) == 85) {
   label = 0; //@line 11149
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 11151
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 11154
   $$0247 = $$1248; //@line 11154
   $$0269 = $$3272; //@line 11154
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 11159
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 11161
  $345 = $$$5 + $$2234 | 0; //@line 11162
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 11164
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 11165
  _out_670($0, $$2239, $$2234); //@line 11166
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 11168
  _pad_676($0, 48, $$$5, $343, 0); //@line 11169
  _out_670($0, $$2, $343); //@line 11170
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 11172
  $$0243 = $$2261; //@line 11173
  $$0247 = $$1248; //@line 11173
  $$0269 = $$3272; //@line 11173
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 11181
    } else {
     $$2242302 = 1; //@line 11183
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 11186
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 11189
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 11193
      $356 = $$2242302 + 1 | 0; //@line 11194
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 11197
      } else {
       $$2242$lcssa = $356; //@line 11199
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 11205
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 11211
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 11217
       } else {
        $$0 = 1; //@line 11219
        break;
       }
      }
     } else {
      $$0 = 1; //@line 11224
     }
    }
   } else {
    $$0 = $$1248; //@line 11228
   }
  }
 } while (0);
 STACKTOP = sp; //@line 11232
 return $$0 | 0; //@line 11232
}
function _mbed_vtracef($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$0199 = 0, $$1$off0 = 0, $$10 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$13 = 0, $$18 = 0, $$3 = 0, $$3147 = 0, $$3147168 = 0, $$3154 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$6 = 0, $$6150 = 0, $$9 = 0, $$lobit = 0, $$pre = 0, $$sink = 0, $125 = 0, $126 = 0, $151 = 0, $157 = 0, $168 = 0, $169 = 0, $171 = 0, $181 = 0, $182 = 0, $184 = 0, $186 = 0, $194 = 0, $201 = 0, $202 = 0, $204 = 0, $206 = 0, $209 = 0, $34 = 0, $38 = 0, $4 = 0, $43 = 0, $5 = 0, $54 = 0, $55 = 0, $59 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $69 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $76 = 0, $78 = 0, $82 = 0, $89 = 0, $95 = 0, $AsyncCtx = 0, $AsyncCtx27 = 0, $AsyncCtx30 = 0, $AsyncCtx34 = 0, $AsyncCtx38 = 0, $AsyncCtx42 = 0, $AsyncCtx45 = 0, $AsyncCtx49 = 0, $AsyncCtx52 = 0, $AsyncCtx56 = 0, $AsyncCtx60 = 0, $AsyncCtx64 = 0, $extract$t159 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer12 = 0, $vararg_buffer15 = 0, $vararg_buffer18 = 0, $vararg_buffer20 = 0, $vararg_buffer23 = 0, $vararg_buffer3 = 0, $vararg_buffer6 = 0, $vararg_buffer9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 291
 STACKTOP = STACKTOP + 96 | 0; //@line 292
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(96); //@line 292
 $vararg_buffer23 = sp + 72 | 0; //@line 293
 $vararg_buffer20 = sp + 64 | 0; //@line 294
 $vararg_buffer18 = sp + 56 | 0; //@line 295
 $vararg_buffer15 = sp + 48 | 0; //@line 296
 $vararg_buffer12 = sp + 40 | 0; //@line 297
 $vararg_buffer9 = sp + 32 | 0; //@line 298
 $vararg_buffer6 = sp + 24 | 0; //@line 299
 $vararg_buffer3 = sp + 16 | 0; //@line 300
 $vararg_buffer1 = sp + 8 | 0; //@line 301
 $vararg_buffer = sp; //@line 302
 $4 = sp + 80 | 0; //@line 303
 $5 = HEAP32[93] | 0; //@line 304
 do {
  if ($5 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(104, sp) | 0; //@line 308
   FUNCTION_TABLE_v[$5 & 3](); //@line 309
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 38; //@line 312
    HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer15; //@line 314
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 316
    HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer15; //@line 318
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer18; //@line 320
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer18; //@line 322
    HEAP8[$AsyncCtx + 24 >> 0] = $0; //@line 324
    HEAP32[$AsyncCtx + 28 >> 2] = $vararg_buffer9; //@line 326
    HEAP32[$AsyncCtx + 32 >> 2] = $vararg_buffer9; //@line 328
    HEAP32[$AsyncCtx + 36 >> 2] = $vararg_buffer12; //@line 330
    HEAP32[$AsyncCtx + 40 >> 2] = $vararg_buffer12; //@line 332
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 334
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 336
    HEAP32[$AsyncCtx + 52 >> 2] = $vararg_buffer23; //@line 338
    HEAP32[$AsyncCtx + 56 >> 2] = $vararg_buffer23; //@line 340
    HEAP32[$AsyncCtx + 60 >> 2] = $vararg_buffer; //@line 342
    HEAP32[$AsyncCtx + 64 >> 2] = $vararg_buffer; //@line 344
    HEAP32[$AsyncCtx + 68 >> 2] = $vararg_buffer3; //@line 346
    HEAP32[$AsyncCtx + 72 >> 2] = $vararg_buffer3; //@line 348
    HEAP32[$AsyncCtx + 76 >> 2] = $vararg_buffer20; //@line 350
    HEAP32[$AsyncCtx + 80 >> 2] = $vararg_buffer20; //@line 352
    HEAP32[$AsyncCtx + 84 >> 2] = $vararg_buffer1; //@line 354
    HEAP32[$AsyncCtx + 88 >> 2] = $vararg_buffer1; //@line 356
    HEAP32[$AsyncCtx + 92 >> 2] = $4; //@line 358
    HEAP32[$AsyncCtx + 96 >> 2] = $vararg_buffer6; //@line 360
    HEAP32[$AsyncCtx + 100 >> 2] = $vararg_buffer6; //@line 362
    sp = STACKTOP; //@line 363
    STACKTOP = sp; //@line 364
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 366
    HEAP32[95] = (HEAP32[95] | 0) + 1; //@line 369
    break;
   }
  }
 } while (0);
 $34 = HEAP32[84] | 0; //@line 374
 do {
  if ($34 | 0) {
   HEAP8[$34 >> 0] = 0; //@line 378
   do {
    if ($0 << 24 >> 24 > -1 & ($1 | 0) != 0) {
     $38 = HEAP32[81] | 0; //@line 384
     if (HEAP8[$38 >> 0] | 0) {
      if (_strstr($38, $1) | 0) {
       $$0$i = 1; //@line 391
       break;
      }
     }
     $43 = HEAP32[82] | 0; //@line 395
     if (!(HEAP8[$43 >> 0] | 0)) {
      label = 11; //@line 399
     } else {
      if (!(_strstr($43, $1) | 0)) {
       $$0$i = 1; //@line 404
      } else {
       label = 11; //@line 406
      }
     }
    } else {
     label = 11; //@line 410
    }
   } while (0);
   if ((label | 0) == 11) {
    $$0$i = 0; //@line 414
   }
   if (!((HEAP32[91] | 0) != 0 & ((($1 | 0) == 0 | (($2 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[88] = HEAP32[86]; //@line 426
    break;
   }
   $54 = HEAPU8[320] | 0; //@line 430
   $55 = $0 & 255; //@line 431
   if ($55 & 31 & $54 | 0) {
    $59 = $54 & 64; //@line 436
    $$lobit = $59 >>> 6; //@line 437
    $60 = $$lobit & 255; //@line 438
    $64 = ($54 & 32 | 0) == 0; //@line 442
    $65 = HEAP32[85] | 0; //@line 443
    $66 = HEAP32[84] | 0; //@line 444
    $67 = $0 << 24 >> 24 == 1; //@line 445
    do {
     if ($67 | ($54 & 128 | 0) != 0) {
      $AsyncCtx64 = _emscripten_alloc_async_context(8, sp) | 0; //@line 449
      _vsnprintf($66, $65, $2, $3) | 0; //@line 450
      if (___async) {
       HEAP32[$AsyncCtx64 >> 2] = 39; //@line 453
       HEAP8[$AsyncCtx64 + 4 >> 0] = $67 & 1; //@line 456
       sp = STACKTOP; //@line 457
       STACKTOP = sp; //@line 458
       return;
      }
      _emscripten_free_async_context($AsyncCtx64 | 0); //@line 460
      $69 = HEAP32[92] | 0; //@line 461
      if (!($67 & ($69 | 0) != 0)) {
       $73 = HEAP32[91] | 0; //@line 465
       $74 = HEAP32[84] | 0; //@line 466
       $AsyncCtx34 = _emscripten_alloc_async_context(4, sp) | 0; //@line 467
       FUNCTION_TABLE_vi[$73 & 255]($74); //@line 468
       if (___async) {
        HEAP32[$AsyncCtx34 >> 2] = 42; //@line 471
        sp = STACKTOP; //@line 472
        STACKTOP = sp; //@line 473
        return;
       } else {
        _emscripten_free_async_context($AsyncCtx34 | 0); //@line 475
        break;
       }
      }
      $71 = HEAP32[84] | 0; //@line 479
      $AsyncCtx27 = _emscripten_alloc_async_context(4, sp) | 0; //@line 480
      FUNCTION_TABLE_vi[$69 & 255]($71); //@line 481
      if (___async) {
       HEAP32[$AsyncCtx27 >> 2] = 40; //@line 484
       sp = STACKTOP; //@line 485
       STACKTOP = sp; //@line 486
       return;
      }
      _emscripten_free_async_context($AsyncCtx27 | 0); //@line 488
      $72 = HEAP32[92] | 0; //@line 489
      $AsyncCtx30 = _emscripten_alloc_async_context(4, sp) | 0; //@line 490
      FUNCTION_TABLE_vi[$72 & 255](2189); //@line 491
      if (___async) {
       HEAP32[$AsyncCtx30 >> 2] = 41; //@line 494
       sp = STACKTOP; //@line 495
       STACKTOP = sp; //@line 496
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx30 | 0); //@line 498
       break;
      }
     } else {
      if (!$59) {
       $$1$off0 = ($$lobit | 0) != 0; //@line 505
       $$1143 = $66; //@line 505
       $$1145 = $65; //@line 505
       $$3154 = 0; //@line 505
       label = 38; //@line 506
      } else {
       if ($64) {
        $$0142 = $66; //@line 509
        $$0144 = $65; //@line 509
       } else {
        $76 = _snprintf($66, $65, 2191, $vararg_buffer) | 0; //@line 511
        $$ = ($76 | 0) >= ($65 | 0) ? 0 : $76; //@line 513
        $78 = ($$ | 0) > 0; //@line 514
        $$0142 = $78 ? $66 + $$ | 0 : $66; //@line 519
        $$0144 = $65 - ($78 ? $$ : 0) | 0; //@line 519
       }
       if (($$0144 | 0) > 0) {
        $82 = $55 + -2 | 0; //@line 523
        switch ($82 >>> 1 | $82 << 31 | 0) {
        case 0:
         {
          $$sink = 2209; //@line 529
          label = 35; //@line 530
          break;
         }
        case 1:
         {
          $$sink = 2215; //@line 534
          label = 35; //@line 535
          break;
         }
        case 3:
         {
          $$sink = 2203; //@line 539
          label = 35; //@line 540
          break;
         }
        case 7:
         {
          $$sink = 2197; //@line 544
          label = 35; //@line 545
          break;
         }
        default:
         {
          $$0141 = 0; //@line 549
          $$1152 = 0; //@line 549
         }
        }
        if ((label | 0) == 35) {
         HEAP32[$vararg_buffer1 >> 2] = $$sink; //@line 553
         $$0141 = $60 & 1; //@line 556
         $$1152 = _snprintf($$0142, $$0144, 2221, $vararg_buffer1) | 0; //@line 556
        }
        $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 559
        $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 561
        if (($$1152$ | 0) > 0) {
         $89 = $$0141 << 24 >> 24 == 0; //@line 563
         $$1$off0 = $extract$t159; //@line 568
         $$1143 = $89 ? $$0142 : $$0142 + $$1152$ | 0; //@line 568
         $$1145 = $$0144 - ($89 ? 0 : $$1152$) | 0; //@line 568
         $$3154 = $$1152; //@line 568
         label = 38; //@line 569
        } else {
         $$1$off0 = $extract$t159; //@line 571
         $$1143 = $$0142; //@line 571
         $$1145 = $$0144; //@line 571
         $$3154 = $$1152$; //@line 571
         label = 38; //@line 572
        }
       }
      }
      L54 : do {
       if ((label | 0) == 38) {
        do {
         if (($$1145 | 0) > 0 & (HEAP32[89] | 0) != 0) {
          HEAP32[$4 >> 2] = HEAP32[$3 >> 2]; //@line 585
          $AsyncCtx60 = _emscripten_alloc_async_context(104, sp) | 0; //@line 586
          $95 = _vsnprintf(0, 0, $2, $4) | 0; //@line 587
          if (___async) {
           HEAP32[$AsyncCtx60 >> 2] = 43; //@line 590
           HEAP32[$AsyncCtx60 + 4 >> 2] = $vararg_buffer15; //@line 592
           HEAP32[$AsyncCtx60 + 8 >> 2] = $1; //@line 594
           HEAP32[$AsyncCtx60 + 12 >> 2] = $vararg_buffer15; //@line 596
           HEAP32[$AsyncCtx60 + 16 >> 2] = $vararg_buffer20; //@line 598
           HEAP32[$AsyncCtx60 + 20 >> 2] = $vararg_buffer20; //@line 600
           HEAP8[$AsyncCtx60 + 24 >> 0] = $$1$off0 & 1; //@line 603
           HEAP32[$AsyncCtx60 + 28 >> 2] = $vararg_buffer23; //@line 605
           HEAP32[$AsyncCtx60 + 32 >> 2] = $vararg_buffer23; //@line 607
           HEAP32[$AsyncCtx60 + 36 >> 2] = $vararg_buffer18; //@line 609
           HEAP32[$AsyncCtx60 + 40 >> 2] = $vararg_buffer18; //@line 611
           HEAP32[$AsyncCtx60 + 44 >> 2] = $vararg_buffer9; //@line 613
           HEAP32[$AsyncCtx60 + 48 >> 2] = $vararg_buffer9; //@line 615
           HEAP32[$AsyncCtx60 + 52 >> 2] = $vararg_buffer12; //@line 617
           HEAP32[$AsyncCtx60 + 56 >> 2] = $vararg_buffer12; //@line 619
           HEAP32[$AsyncCtx60 + 60 >> 2] = $$3154; //@line 621
           HEAP32[$AsyncCtx60 + 64 >> 2] = $2; //@line 623
           HEAP32[$AsyncCtx60 + 68 >> 2] = $3; //@line 625
           HEAP32[$AsyncCtx60 + 72 >> 2] = $vararg_buffer3; //@line 627
           HEAP32[$AsyncCtx60 + 76 >> 2] = $$1143; //@line 629
           HEAP32[$AsyncCtx60 + 80 >> 2] = $$1145; //@line 631
           HEAP32[$AsyncCtx60 + 84 >> 2] = $vararg_buffer3; //@line 633
           HEAP32[$AsyncCtx60 + 88 >> 2] = $4; //@line 635
           HEAP32[$AsyncCtx60 + 92 >> 2] = $vararg_buffer6; //@line 637
           HEAP32[$AsyncCtx60 + 96 >> 2] = $vararg_buffer6; //@line 639
           HEAP32[$AsyncCtx60 + 100 >> 2] = $55; //@line 641
           sp = STACKTOP; //@line 642
           STACKTOP = sp; //@line 643
           return;
          }
          _emscripten_free_async_context($AsyncCtx60 | 0); //@line 645
          $125 = HEAP32[89] | 0; //@line 650
          $AsyncCtx38 = _emscripten_alloc_async_context(100, sp) | 0; //@line 651
          $126 = FUNCTION_TABLE_ii[$125 & 31](($$3154 | 0 ? 4 : 0) + $$3154 + $95 | 0) | 0; //@line 652
          if (___async) {
           HEAP32[$AsyncCtx38 >> 2] = 44; //@line 655
           HEAP32[$AsyncCtx38 + 4 >> 2] = $vararg_buffer15; //@line 657
           HEAP32[$AsyncCtx38 + 8 >> 2] = $1; //@line 659
           HEAP32[$AsyncCtx38 + 12 >> 2] = $vararg_buffer15; //@line 661
           HEAP32[$AsyncCtx38 + 16 >> 2] = $vararg_buffer18; //@line 663
           HEAP32[$AsyncCtx38 + 20 >> 2] = $vararg_buffer18; //@line 665
           HEAP32[$AsyncCtx38 + 24 >> 2] = $vararg_buffer9; //@line 667
           HEAP32[$AsyncCtx38 + 28 >> 2] = $vararg_buffer9; //@line 669
           HEAP32[$AsyncCtx38 + 32 >> 2] = $vararg_buffer12; //@line 671
           HEAP32[$AsyncCtx38 + 36 >> 2] = $vararg_buffer12; //@line 673
           HEAP32[$AsyncCtx38 + 40 >> 2] = $2; //@line 675
           HEAP32[$AsyncCtx38 + 44 >> 2] = $3; //@line 677
           HEAP8[$AsyncCtx38 + 48 >> 0] = $$1$off0 & 1; //@line 680
           HEAP32[$AsyncCtx38 + 52 >> 2] = $vararg_buffer23; //@line 682
           HEAP32[$AsyncCtx38 + 56 >> 2] = $vararg_buffer23; //@line 684
           HEAP32[$AsyncCtx38 + 60 >> 2] = $vararg_buffer3; //@line 686
           HEAP32[$AsyncCtx38 + 64 >> 2] = $$1143; //@line 688
           HEAP32[$AsyncCtx38 + 68 >> 2] = $$1145; //@line 690
           HEAP32[$AsyncCtx38 + 72 >> 2] = $vararg_buffer3; //@line 692
           HEAP32[$AsyncCtx38 + 76 >> 2] = $4; //@line 694
           HEAP32[$AsyncCtx38 + 80 >> 2] = $vararg_buffer20; //@line 696
           HEAP32[$AsyncCtx38 + 84 >> 2] = $vararg_buffer20; //@line 698
           HEAP32[$AsyncCtx38 + 88 >> 2] = $vararg_buffer6; //@line 700
           HEAP32[$AsyncCtx38 + 92 >> 2] = $vararg_buffer6; //@line 702
           HEAP32[$AsyncCtx38 + 96 >> 2] = $55; //@line 704
           sp = STACKTOP; //@line 705
           STACKTOP = sp; //@line 706
           return;
          } else {
           _emscripten_free_async_context($AsyncCtx38 | 0); //@line 708
           HEAP32[$vararg_buffer3 >> 2] = $126; //@line 709
           $151 = _snprintf($$1143, $$1145, 2221, $vararg_buffer3) | 0; //@line 710
           $$10 = ($151 | 0) >= ($$1145 | 0) ? 0 : $151; //@line 712
           if (($$10 | 0) > 0) {
            $$3 = $$1143 + $$10 | 0; //@line 717
            $$3147 = $$1145 - $$10 | 0; //@line 717
            label = 44; //@line 718
            break;
           } else {
            $$3147168 = $$1145; //@line 721
            $$3169 = $$1143; //@line 721
            break;
           }
          }
         } else {
          $$3 = $$1143; //@line 726
          $$3147 = $$1145; //@line 726
          label = 44; //@line 727
         }
        } while (0);
        if ((label | 0) == 44) {
         if (($$3147 | 0) > 0) {
          $$3147168 = $$3147; //@line 733
          $$3169 = $$3; //@line 733
         } else {
          break;
         }
        }
        $157 = $55 + -2 | 0; //@line 738
        switch ($157 >>> 1 | $157 << 31 | 0) {
        case 0:
         {
          HEAP32[$vararg_buffer6 >> 2] = $1; //@line 744
          $$5156 = _snprintf($$3169, $$3147168, 2224, $vararg_buffer6) | 0; //@line 746
          break;
         }
        case 1:
         {
          HEAP32[$vararg_buffer9 >> 2] = $1; //@line 750
          $$5156 = _snprintf($$3169, $$3147168, 2239, $vararg_buffer9) | 0; //@line 752
          break;
         }
        case 3:
         {
          HEAP32[$vararg_buffer12 >> 2] = $1; //@line 756
          $$5156 = _snprintf($$3169, $$3147168, 2254, $vararg_buffer12) | 0; //@line 758
          break;
         }
        case 7:
         {
          HEAP32[$vararg_buffer15 >> 2] = $1; //@line 762
          $$5156 = _snprintf($$3169, $$3147168, 2269, $vararg_buffer15) | 0; //@line 764
          break;
         }
        default:
         {
          $$5156 = _snprintf($$3169, $$3147168, 2284, $vararg_buffer18) | 0; //@line 769
         }
        }
        $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 773
        $168 = $$3169 + $$5156$ | 0; //@line 775
        $169 = $$3147168 - $$5156$ | 0; //@line 776
        if (($$5156$ | 0) > 0 & ($169 | 0) > 0) {
         $AsyncCtx56 = _emscripten_alloc_async_context(32, sp) | 0; //@line 780
         $171 = _vsnprintf($168, $169, $2, $3) | 0; //@line 781
         if (___async) {
          HEAP32[$AsyncCtx56 >> 2] = 45; //@line 784
          HEAP32[$AsyncCtx56 + 4 >> 2] = $vararg_buffer20; //@line 786
          HEAP32[$AsyncCtx56 + 8 >> 2] = $vararg_buffer20; //@line 788
          HEAP8[$AsyncCtx56 + 12 >> 0] = $$1$off0 & 1; //@line 791
          HEAP32[$AsyncCtx56 + 16 >> 2] = $vararg_buffer23; //@line 793
          HEAP32[$AsyncCtx56 + 20 >> 2] = $vararg_buffer23; //@line 795
          HEAP32[$AsyncCtx56 + 24 >> 2] = $169; //@line 797
          HEAP32[$AsyncCtx56 + 28 >> 2] = $168; //@line 799
          sp = STACKTOP; //@line 800
          STACKTOP = sp; //@line 801
          return;
         }
         _emscripten_free_async_context($AsyncCtx56 | 0); //@line 803
         $$13 = ($171 | 0) >= ($169 | 0) ? 0 : $171; //@line 805
         $181 = $168 + $$13 | 0; //@line 807
         $182 = $169 - $$13 | 0; //@line 808
         if (($$13 | 0) > 0) {
          $184 = HEAP32[90] | 0; //@line 811
          do {
           if (($182 | 0) > 0 & ($184 | 0) != 0) {
            $AsyncCtx42 = _emscripten_alloc_async_context(32, sp) | 0; //@line 816
            $186 = FUNCTION_TABLE_i[$184 & 0]() | 0; //@line 817
            if (___async) {
             HEAP32[$AsyncCtx42 >> 2] = 46; //@line 820
             HEAP32[$AsyncCtx42 + 4 >> 2] = $vararg_buffer20; //@line 822
             HEAP32[$AsyncCtx42 + 8 >> 2] = $181; //@line 824
             HEAP32[$AsyncCtx42 + 12 >> 2] = $182; //@line 826
             HEAP32[$AsyncCtx42 + 16 >> 2] = $vararg_buffer20; //@line 828
             HEAP8[$AsyncCtx42 + 20 >> 0] = $$1$off0 & 1; //@line 831
             HEAP32[$AsyncCtx42 + 24 >> 2] = $vararg_buffer23; //@line 833
             HEAP32[$AsyncCtx42 + 28 >> 2] = $vararg_buffer23; //@line 835
             sp = STACKTOP; //@line 836
             STACKTOP = sp; //@line 837
             return;
            } else {
             _emscripten_free_async_context($AsyncCtx42 | 0); //@line 839
             HEAP32[$vararg_buffer20 >> 2] = $186; //@line 840
             $194 = _snprintf($181, $182, 2221, $vararg_buffer20) | 0; //@line 841
             $$18 = ($194 | 0) >= ($182 | 0) ? 0 : $194; //@line 843
             if (($$18 | 0) > 0) {
              $$6 = $181 + $$18 | 0; //@line 848
              $$6150 = $182 - $$18 | 0; //@line 848
              $$9 = $$18; //@line 848
              break;
             } else {
              break L54;
             }
            }
           } else {
            $$6 = $181; //@line 855
            $$6150 = $182; //@line 855
            $$9 = $$13; //@line 855
           }
          } while (0);
          if (!(($$9 | 0) < 1 | ($$6150 | 0) < 1 | $$1$off0 ^ 1)) {
           _snprintf($$6, $$6150, 2299, $vararg_buffer23) | 0; //@line 864
          }
         }
        }
       }
      } while (0);
      $201 = HEAP32[91] | 0; //@line 870
      $202 = HEAP32[84] | 0; //@line 871
      $AsyncCtx45 = _emscripten_alloc_async_context(4, sp) | 0; //@line 872
      FUNCTION_TABLE_vi[$201 & 255]($202); //@line 873
      if (___async) {
       HEAP32[$AsyncCtx45 >> 2] = 47; //@line 876
       sp = STACKTOP; //@line 877
       STACKTOP = sp; //@line 878
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx45 | 0); //@line 880
       break;
      }
     }
    } while (0);
    HEAP32[88] = HEAP32[86]; //@line 886
   }
  }
 } while (0);
 $204 = HEAP32[94] | 0; //@line 890
 if (!$204) {
  STACKTOP = sp; //@line 893
  return;
 }
 $206 = HEAP32[95] | 0; //@line 895
 HEAP32[95] = 0; //@line 896
 $AsyncCtx49 = _emscripten_alloc_async_context(8, sp) | 0; //@line 897
 FUNCTION_TABLE_v[$204 & 3](); //@line 898
 if (___async) {
  HEAP32[$AsyncCtx49 >> 2] = 48; //@line 901
  HEAP32[$AsyncCtx49 + 4 >> 2] = $206; //@line 903
  sp = STACKTOP; //@line 904
  STACKTOP = sp; //@line 905
  return;
 }
 _emscripten_free_async_context($AsyncCtx49 | 0); //@line 907
 if (($206 | 0) > 1) {
  $$0199 = $206; //@line 910
 } else {
  STACKTOP = sp; //@line 912
  return;
 }
 while (1) {
  $209 = $$0199 + -1 | 0; //@line 915
  $$pre = HEAP32[94] | 0; //@line 916
  $AsyncCtx52 = _emscripten_alloc_async_context(12, sp) | 0; //@line 917
  FUNCTION_TABLE_v[$$pre & 3](); //@line 918
  if (___async) {
   label = 70; //@line 921
   break;
  }
  _emscripten_free_async_context($AsyncCtx52 | 0); //@line 924
  if (($$0199 | 0) > 2) {
   $$0199 = $209; //@line 927
  } else {
   label = 72; //@line 929
   break;
  }
 }
 if ((label | 0) == 70) {
  HEAP32[$AsyncCtx52 >> 2] = 49; //@line 934
  HEAP32[$AsyncCtx52 + 4 >> 2] = $$0199; //@line 936
  HEAP32[$AsyncCtx52 + 8 >> 2] = $209; //@line 938
  sp = STACKTOP; //@line 939
  STACKTOP = sp; //@line 940
  return;
 } else if ((label | 0) == 72) {
  STACKTOP = sp; //@line 943
  return;
 }
}
function _main() {
 var $$027 = 0, $$1 = 0, $122 = 0, $51 = 0, $81 = 0, $AsyncCtx = 0, $AsyncCtx13 = 0, $AsyncCtx17 = 0, $AsyncCtx21 = 0, $AsyncCtx25 = 0, $AsyncCtx29 = 0, $AsyncCtx33 = 0, $AsyncCtx37 = 0, $AsyncCtx41 = 0, $AsyncCtx44 = 0, $AsyncCtx48 = 0, $AsyncCtx51 = 0, $AsyncCtx54 = 0, $AsyncCtx57 = 0, $AsyncCtx9 = 0, $bitmSan3$byval_copy76 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer3 = 0, $vararg_buffer5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4800
 STACKTOP = STACKTOP + 48 | 0; //@line 4801
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 4801
 $bitmSan3$byval_copy76 = sp + 32 | 0; //@line 4802
 $vararg_buffer5 = sp + 24 | 0; //@line 4803
 $vararg_buffer3 = sp + 16 | 0; //@line 4804
 $vararg_buffer1 = sp + 8 | 0; //@line 4805
 $vararg_buffer = sp; //@line 4806
 $AsyncCtx13 = _emscripten_alloc_async_context(36, sp) | 0; //@line 4807
 _puts(6545) | 0; //@line 4808
 if (___async) {
  HEAP32[$AsyncCtx13 >> 2] = 165; //@line 4811
  HEAP32[$AsyncCtx13 + 4 >> 2] = $vararg_buffer; //@line 4813
  HEAP32[$AsyncCtx13 + 8 >> 2] = $vararg_buffer; //@line 4815
  HEAP32[$AsyncCtx13 + 12 >> 2] = $vararg_buffer1; //@line 4817
  HEAP32[$AsyncCtx13 + 16 >> 2] = $vararg_buffer1; //@line 4819
  HEAP32[$AsyncCtx13 + 20 >> 2] = $vararg_buffer3; //@line 4821
  HEAP32[$AsyncCtx13 + 24 >> 2] = $vararg_buffer3; //@line 4823
  HEAP32[$AsyncCtx13 + 28 >> 2] = $vararg_buffer5; //@line 4825
  HEAP32[$AsyncCtx13 + 32 >> 2] = $vararg_buffer5; //@line 4827
  sp = STACKTOP; //@line 4828
  STACKTOP = sp; //@line 4829
  return 0; //@line 4829
 }
 _emscripten_free_async_context($AsyncCtx13 | 0); //@line 4831
 $AsyncCtx9 = _emscripten_alloc_async_context(36, sp) | 0; //@line 4832
 _puts(6567) | 0; //@line 4833
 if (___async) {
  HEAP32[$AsyncCtx9 >> 2] = 166; //@line 4836
  HEAP32[$AsyncCtx9 + 4 >> 2] = $vararg_buffer; //@line 4838
  HEAP32[$AsyncCtx9 + 8 >> 2] = $vararg_buffer; //@line 4840
  HEAP32[$AsyncCtx9 + 12 >> 2] = $vararg_buffer1; //@line 4842
  HEAP32[$AsyncCtx9 + 16 >> 2] = $vararg_buffer1; //@line 4844
  HEAP32[$AsyncCtx9 + 20 >> 2] = $vararg_buffer3; //@line 4846
  HEAP32[$AsyncCtx9 + 24 >> 2] = $vararg_buffer3; //@line 4848
  HEAP32[$AsyncCtx9 + 28 >> 2] = $vararg_buffer5; //@line 4850
  HEAP32[$AsyncCtx9 + 32 >> 2] = $vararg_buffer5; //@line 4852
  sp = STACKTOP; //@line 4853
  STACKTOP = sp; //@line 4854
  return 0; //@line 4854
 }
 _emscripten_free_async_context($AsyncCtx9 | 0); //@line 4856
 __ZN6C128323clsEv(9844); //@line 4857
 $AsyncCtx44 = _emscripten_alloc_async_context(36, sp) | 0; //@line 4858
 HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[277]; //@line 4859
 HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[278]; //@line 4859
 HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[279]; //@line 4859
 HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[280]; //@line 4859
 __ZN6C128328print_bmE6Bitmapii(9844, $bitmSan3$byval_copy76, 95, 0); //@line 4860
 if (___async) {
  HEAP32[$AsyncCtx44 >> 2] = 167; //@line 4863
  HEAP32[$AsyncCtx44 + 4 >> 2] = $vararg_buffer; //@line 4865
  HEAP32[$AsyncCtx44 + 8 >> 2] = $vararg_buffer; //@line 4867
  HEAP32[$AsyncCtx44 + 12 >> 2] = $vararg_buffer1; //@line 4869
  HEAP32[$AsyncCtx44 + 16 >> 2] = $vararg_buffer1; //@line 4871
  HEAP32[$AsyncCtx44 + 20 >> 2] = $vararg_buffer3; //@line 4873
  HEAP32[$AsyncCtx44 + 24 >> 2] = $vararg_buffer3; //@line 4875
  HEAP32[$AsyncCtx44 + 28 >> 2] = $vararg_buffer5; //@line 4877
  HEAP32[$AsyncCtx44 + 32 >> 2] = $vararg_buffer5; //@line 4879
  sp = STACKTOP; //@line 4880
  STACKTOP = sp; //@line 4881
  return 0; //@line 4881
 }
 _emscripten_free_async_context($AsyncCtx44 | 0); //@line 4883
 __ZN6C1283211copy_to_lcdEv(9844); //@line 4884
 __ZN6C128327setmodeEi(9844, 1); //@line 4885
 $$027 = -15; //@line 4886
 while (1) {
  $AsyncCtx41 = _emscripten_alloc_async_context(40, sp) | 0; //@line 4888
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[281]; //@line 4889
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[282]; //@line 4889
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[283]; //@line 4889
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[284]; //@line 4889
  __ZN6C128328print_bmE6Bitmapii(9844, $bitmSan3$byval_copy76, $$027, 2); //@line 4890
  if (___async) {
   label = 9; //@line 4893
   break;
  }
  _emscripten_free_async_context($AsyncCtx41 | 0); //@line 4896
  $AsyncCtx57 = _emscripten_alloc_async_context(40, sp) | 0; //@line 4897
  _wait(.20000000298023224); //@line 4898
  if (___async) {
   label = 11; //@line 4901
   break;
  }
  _emscripten_free_async_context($AsyncCtx57 | 0); //@line 4904
  __ZN6C1283211copy_to_lcdEv(9844); //@line 4905
  $AsyncCtx37 = _emscripten_alloc_async_context(40, sp) | 0; //@line 4906
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[281]; //@line 4907
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[282]; //@line 4907
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[283]; //@line 4907
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[284]; //@line 4907
  __ZN6C128328print_bmE6Bitmapii(9844, $bitmSan3$byval_copy76, $$027, 2); //@line 4908
  if (___async) {
   label = 13; //@line 4911
   break;
  }
  _emscripten_free_async_context($AsyncCtx37 | 0); //@line 4914
  $51 = $$027 + 3 | 0; //@line 4915
  $AsyncCtx33 = _emscripten_alloc_async_context(44, sp) | 0; //@line 4916
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[285]; //@line 4917
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[286]; //@line 4917
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[287]; //@line 4917
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[288]; //@line 4917
  __ZN6C128328print_bmE6Bitmapii(9844, $bitmSan3$byval_copy76, $51, 2); //@line 4918
  if (___async) {
   label = 15; //@line 4921
   break;
  }
  _emscripten_free_async_context($AsyncCtx33 | 0); //@line 4924
  $AsyncCtx54 = _emscripten_alloc_async_context(44, sp) | 0; //@line 4925
  _wait(.20000000298023224); //@line 4926
  if (___async) {
   label = 17; //@line 4929
   break;
  }
  _emscripten_free_async_context($AsyncCtx54 | 0); //@line 4932
  __ZN6C1283211copy_to_lcdEv(9844); //@line 4933
  $AsyncCtx29 = _emscripten_alloc_async_context(40, sp) | 0; //@line 4934
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[285]; //@line 4935
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[286]; //@line 4935
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[287]; //@line 4935
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[288]; //@line 4935
  __ZN6C128328print_bmE6Bitmapii(9844, $bitmSan3$byval_copy76, $51, 2); //@line 4936
  if (___async) {
   label = 19; //@line 4939
   break;
  }
  _emscripten_free_async_context($AsyncCtx29 | 0); //@line 4942
  $81 = $$027 + 6 | 0; //@line 4943
  $AsyncCtx25 = _emscripten_alloc_async_context(44, sp) | 0; //@line 4944
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[289]; //@line 4945
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[290]; //@line 4945
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[291]; //@line 4945
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[292]; //@line 4945
  __ZN6C128328print_bmE6Bitmapii(9844, $bitmSan3$byval_copy76, $81, 2); //@line 4946
  if (___async) {
   label = 21; //@line 4949
   break;
  }
  _emscripten_free_async_context($AsyncCtx25 | 0); //@line 4952
  $AsyncCtx51 = _emscripten_alloc_async_context(44, sp) | 0; //@line 4953
  _wait(.20000000298023224); //@line 4954
  if (___async) {
   label = 23; //@line 4957
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 4960
  __ZN6C1283211copy_to_lcdEv(9844); //@line 4961
  $AsyncCtx21 = _emscripten_alloc_async_context(40, sp) | 0; //@line 4962
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[289]; //@line 4963
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[290]; //@line 4963
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[291]; //@line 4963
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[292]; //@line 4963
  __ZN6C128328print_bmE6Bitmapii(9844, $bitmSan3$byval_copy76, $81, 2); //@line 4964
  if (___async) {
   label = 25; //@line 4967
   break;
  }
  _emscripten_free_async_context($AsyncCtx21 | 0); //@line 4970
  if (($$027 | 0) < 66) {
   $$027 = $$027 + 9 | 0; //@line 4974
  } else {
   label = 27; //@line 4976
   break;
  }
 }
 switch (label | 0) {
 case 9:
  {
   HEAP32[$AsyncCtx41 >> 2] = 168; //@line 4982
   HEAP32[$AsyncCtx41 + 4 >> 2] = $$027; //@line 4984
   HEAP32[$AsyncCtx41 + 8 >> 2] = $vararg_buffer; //@line 4986
   HEAP32[$AsyncCtx41 + 12 >> 2] = $vararg_buffer; //@line 4988
   HEAP32[$AsyncCtx41 + 16 >> 2] = $vararg_buffer1; //@line 4990
   HEAP32[$AsyncCtx41 + 20 >> 2] = $vararg_buffer1; //@line 4992
   HEAP32[$AsyncCtx41 + 24 >> 2] = $vararg_buffer3; //@line 4994
   HEAP32[$AsyncCtx41 + 28 >> 2] = $vararg_buffer3; //@line 4996
   HEAP32[$AsyncCtx41 + 32 >> 2] = $vararg_buffer5; //@line 4998
   HEAP32[$AsyncCtx41 + 36 >> 2] = $vararg_buffer5; //@line 5000
   sp = STACKTOP; //@line 5001
   STACKTOP = sp; //@line 5002
   return 0; //@line 5002
  }
 case 11:
  {
   HEAP32[$AsyncCtx57 >> 2] = 169; //@line 5006
   HEAP32[$AsyncCtx57 + 4 >> 2] = $vararg_buffer3; //@line 5008
   HEAP32[$AsyncCtx57 + 8 >> 2] = $vararg_buffer3; //@line 5010
   HEAP32[$AsyncCtx57 + 12 >> 2] = $vararg_buffer5; //@line 5012
   HEAP32[$AsyncCtx57 + 16 >> 2] = $vararg_buffer5; //@line 5014
   HEAP32[$AsyncCtx57 + 20 >> 2] = $vararg_buffer; //@line 5016
   HEAP32[$AsyncCtx57 + 24 >> 2] = $vararg_buffer; //@line 5018
   HEAP32[$AsyncCtx57 + 28 >> 2] = $vararg_buffer1; //@line 5020
   HEAP32[$AsyncCtx57 + 32 >> 2] = $vararg_buffer1; //@line 5022
   HEAP32[$AsyncCtx57 + 36 >> 2] = $$027; //@line 5024
   sp = STACKTOP; //@line 5025
   STACKTOP = sp; //@line 5026
   return 0; //@line 5026
  }
 case 13:
  {
   HEAP32[$AsyncCtx37 >> 2] = 170; //@line 5030
   HEAP32[$AsyncCtx37 + 4 >> 2] = $$027; //@line 5032
   HEAP32[$AsyncCtx37 + 8 >> 2] = $vararg_buffer; //@line 5034
   HEAP32[$AsyncCtx37 + 12 >> 2] = $vararg_buffer; //@line 5036
   HEAP32[$AsyncCtx37 + 16 >> 2] = $vararg_buffer1; //@line 5038
   HEAP32[$AsyncCtx37 + 20 >> 2] = $vararg_buffer1; //@line 5040
   HEAP32[$AsyncCtx37 + 24 >> 2] = $vararg_buffer3; //@line 5042
   HEAP32[$AsyncCtx37 + 28 >> 2] = $vararg_buffer3; //@line 5044
   HEAP32[$AsyncCtx37 + 32 >> 2] = $vararg_buffer5; //@line 5046
   HEAP32[$AsyncCtx37 + 36 >> 2] = $vararg_buffer5; //@line 5048
   sp = STACKTOP; //@line 5049
   STACKTOP = sp; //@line 5050
   return 0; //@line 5050
  }
 case 15:
  {
   HEAP32[$AsyncCtx33 >> 2] = 171; //@line 5054
   HEAP32[$AsyncCtx33 + 4 >> 2] = $51; //@line 5056
   HEAP32[$AsyncCtx33 + 8 >> 2] = $$027; //@line 5058
   HEAP32[$AsyncCtx33 + 12 >> 2] = $vararg_buffer; //@line 5060
   HEAP32[$AsyncCtx33 + 16 >> 2] = $vararg_buffer; //@line 5062
   HEAP32[$AsyncCtx33 + 20 >> 2] = $vararg_buffer1; //@line 5064
   HEAP32[$AsyncCtx33 + 24 >> 2] = $vararg_buffer1; //@line 5066
   HEAP32[$AsyncCtx33 + 28 >> 2] = $vararg_buffer3; //@line 5068
   HEAP32[$AsyncCtx33 + 32 >> 2] = $vararg_buffer3; //@line 5070
   HEAP32[$AsyncCtx33 + 36 >> 2] = $vararg_buffer5; //@line 5072
   HEAP32[$AsyncCtx33 + 40 >> 2] = $vararg_buffer5; //@line 5074
   sp = STACKTOP; //@line 5075
   STACKTOP = sp; //@line 5076
   return 0; //@line 5076
  }
 case 17:
  {
   HEAP32[$AsyncCtx54 >> 2] = 172; //@line 5080
   HEAP32[$AsyncCtx54 + 4 >> 2] = $vararg_buffer3; //@line 5082
   HEAP32[$AsyncCtx54 + 8 >> 2] = $vararg_buffer3; //@line 5084
   HEAP32[$AsyncCtx54 + 12 >> 2] = $vararg_buffer5; //@line 5086
   HEAP32[$AsyncCtx54 + 16 >> 2] = $vararg_buffer5; //@line 5088
   HEAP32[$AsyncCtx54 + 20 >> 2] = $vararg_buffer; //@line 5090
   HEAP32[$AsyncCtx54 + 24 >> 2] = $vararg_buffer; //@line 5092
   HEAP32[$AsyncCtx54 + 28 >> 2] = $vararg_buffer1; //@line 5094
   HEAP32[$AsyncCtx54 + 32 >> 2] = $vararg_buffer1; //@line 5096
   HEAP32[$AsyncCtx54 + 36 >> 2] = $51; //@line 5098
   HEAP32[$AsyncCtx54 + 40 >> 2] = $$027; //@line 5100
   sp = STACKTOP; //@line 5101
   STACKTOP = sp; //@line 5102
   return 0; //@line 5102
  }
 case 19:
  {
   HEAP32[$AsyncCtx29 >> 2] = 173; //@line 5106
   HEAP32[$AsyncCtx29 + 4 >> 2] = $$027; //@line 5108
   HEAP32[$AsyncCtx29 + 8 >> 2] = $vararg_buffer; //@line 5110
   HEAP32[$AsyncCtx29 + 12 >> 2] = $vararg_buffer; //@line 5112
   HEAP32[$AsyncCtx29 + 16 >> 2] = $vararg_buffer1; //@line 5114
   HEAP32[$AsyncCtx29 + 20 >> 2] = $vararg_buffer1; //@line 5116
   HEAP32[$AsyncCtx29 + 24 >> 2] = $vararg_buffer3; //@line 5118
   HEAP32[$AsyncCtx29 + 28 >> 2] = $vararg_buffer3; //@line 5120
   HEAP32[$AsyncCtx29 + 32 >> 2] = $vararg_buffer5; //@line 5122
   HEAP32[$AsyncCtx29 + 36 >> 2] = $vararg_buffer5; //@line 5124
   sp = STACKTOP; //@line 5125
   STACKTOP = sp; //@line 5126
   return 0; //@line 5126
  }
 case 21:
  {
   HEAP32[$AsyncCtx25 >> 2] = 174; //@line 5130
   HEAP32[$AsyncCtx25 + 4 >> 2] = $81; //@line 5132
   HEAP32[$AsyncCtx25 + 8 >> 2] = $vararg_buffer; //@line 5134
   HEAP32[$AsyncCtx25 + 12 >> 2] = $vararg_buffer; //@line 5136
   HEAP32[$AsyncCtx25 + 16 >> 2] = $vararg_buffer1; //@line 5138
   HEAP32[$AsyncCtx25 + 20 >> 2] = $vararg_buffer1; //@line 5140
   HEAP32[$AsyncCtx25 + 24 >> 2] = $$027; //@line 5142
   HEAP32[$AsyncCtx25 + 28 >> 2] = $vararg_buffer3; //@line 5144
   HEAP32[$AsyncCtx25 + 32 >> 2] = $vararg_buffer3; //@line 5146
   HEAP32[$AsyncCtx25 + 36 >> 2] = $vararg_buffer5; //@line 5148
   HEAP32[$AsyncCtx25 + 40 >> 2] = $vararg_buffer5; //@line 5150
   sp = STACKTOP; //@line 5151
   STACKTOP = sp; //@line 5152
   return 0; //@line 5152
  }
 case 23:
  {
   HEAP32[$AsyncCtx51 >> 2] = 175; //@line 5156
   HEAP32[$AsyncCtx51 + 4 >> 2] = $vararg_buffer3; //@line 5158
   HEAP32[$AsyncCtx51 + 8 >> 2] = $vararg_buffer3; //@line 5160
   HEAP32[$AsyncCtx51 + 12 >> 2] = $vararg_buffer5; //@line 5162
   HEAP32[$AsyncCtx51 + 16 >> 2] = $vararg_buffer5; //@line 5164
   HEAP32[$AsyncCtx51 + 20 >> 2] = $vararg_buffer; //@line 5166
   HEAP32[$AsyncCtx51 + 24 >> 2] = $vararg_buffer; //@line 5168
   HEAP32[$AsyncCtx51 + 28 >> 2] = $vararg_buffer1; //@line 5170
   HEAP32[$AsyncCtx51 + 32 >> 2] = $vararg_buffer1; //@line 5172
   HEAP32[$AsyncCtx51 + 36 >> 2] = $81; //@line 5174
   HEAP32[$AsyncCtx51 + 40 >> 2] = $$027; //@line 5176
   sp = STACKTOP; //@line 5177
   STACKTOP = sp; //@line 5178
   return 0; //@line 5178
  }
 case 25:
  {
   HEAP32[$AsyncCtx21 >> 2] = 176; //@line 5182
   HEAP32[$AsyncCtx21 + 4 >> 2] = $vararg_buffer; //@line 5184
   HEAP32[$AsyncCtx21 + 8 >> 2] = $vararg_buffer; //@line 5186
   HEAP32[$AsyncCtx21 + 12 >> 2] = $vararg_buffer1; //@line 5188
   HEAP32[$AsyncCtx21 + 16 >> 2] = $vararg_buffer1; //@line 5190
   HEAP32[$AsyncCtx21 + 20 >> 2] = $$027; //@line 5192
   HEAP32[$AsyncCtx21 + 24 >> 2] = $vararg_buffer3; //@line 5194
   HEAP32[$AsyncCtx21 + 28 >> 2] = $vararg_buffer3; //@line 5196
   HEAP32[$AsyncCtx21 + 32 >> 2] = $vararg_buffer5; //@line 5198
   HEAP32[$AsyncCtx21 + 36 >> 2] = $vararg_buffer5; //@line 5200
   sp = STACKTOP; //@line 5201
   STACKTOP = sp; //@line 5202
   return 0; //@line 5202
  }
 case 27:
  {
   $AsyncCtx17 = _emscripten_alloc_async_context(36, sp) | 0; //@line 5206
   HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[289]; //@line 5207
   HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[290]; //@line 5207
   HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[291]; //@line 5207
   HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[292]; //@line 5207
   __ZN6C128328print_bmE6Bitmapii(9844, $bitmSan3$byval_copy76, 75, 2); //@line 5208
   if (___async) {
    HEAP32[$AsyncCtx17 >> 2] = 177; //@line 5211
    HEAP32[$AsyncCtx17 + 4 >> 2] = $vararg_buffer; //@line 5213
    HEAP32[$AsyncCtx17 + 8 >> 2] = $vararg_buffer; //@line 5215
    HEAP32[$AsyncCtx17 + 12 >> 2] = $vararg_buffer1; //@line 5217
    HEAP32[$AsyncCtx17 + 16 >> 2] = $vararg_buffer1; //@line 5219
    HEAP32[$AsyncCtx17 + 20 >> 2] = $vararg_buffer3; //@line 5221
    HEAP32[$AsyncCtx17 + 24 >> 2] = $vararg_buffer3; //@line 5223
    HEAP32[$AsyncCtx17 + 28 >> 2] = $vararg_buffer5; //@line 5225
    HEAP32[$AsyncCtx17 + 32 >> 2] = $vararg_buffer5; //@line 5227
    sp = STACKTOP; //@line 5228
    STACKTOP = sp; //@line 5229
    return 0; //@line 5229
   }
   _emscripten_free_async_context($AsyncCtx17 | 0); //@line 5231
   __ZN6C1283211set_auto_upEj(9844, 0); //@line 5232
   $$1 = -20; //@line 5233
   while (1) {
    __ZN6C128326locateEii(9844, 5, $$1); //@line 5236
    __ZN4mbed6Stream6printfEPKcz(9844, 6621, $vararg_buffer) | 0; //@line 5237
    $122 = $$1 + 12 | 0; //@line 5238
    __ZN6C128326locateEii(9844, 5, $122); //@line 5239
    __ZN4mbed6Stream6printfEPKcz(9844, 6627, $vararg_buffer1) | 0; //@line 5240
    __ZN6C1283211copy_to_lcdEv(9844); //@line 5241
    if (($$1 | 0) >= 5) {
     break;
    }
    __ZN6C128326locateEii(9844, 5, $$1); //@line 5245
    $AsyncCtx48 = _emscripten_alloc_async_context(44, sp) | 0; //@line 5246
    _wait(.20000000298023224); //@line 5247
    if (___async) {
     label = 32; //@line 5250
     break;
    }
    _emscripten_free_async_context($AsyncCtx48 | 0); //@line 5253
    __ZN4mbed6Stream6printfEPKcz(9844, 6621, $vararg_buffer3) | 0; //@line 5254
    __ZN6C128326locateEii(9844, 5, $122); //@line 5255
    __ZN4mbed6Stream6printfEPKcz(9844, 6627, $vararg_buffer5) | 0; //@line 5256
    __ZN6C1283211copy_to_lcdEv(9844); //@line 5257
    $$1 = $$1 + 2 | 0; //@line 5259
   }
   if ((label | 0) == 32) {
    HEAP32[$AsyncCtx48 >> 2] = 178; //@line 5262
    HEAP32[$AsyncCtx48 + 4 >> 2] = $vararg_buffer3; //@line 5264
    HEAP32[$AsyncCtx48 + 8 >> 2] = $vararg_buffer3; //@line 5266
    HEAP32[$AsyncCtx48 + 12 >> 2] = $122; //@line 5268
    HEAP32[$AsyncCtx48 + 16 >> 2] = $vararg_buffer5; //@line 5270
    HEAP32[$AsyncCtx48 + 20 >> 2] = $vararg_buffer5; //@line 5272
    HEAP32[$AsyncCtx48 + 24 >> 2] = $$1; //@line 5274
    HEAP32[$AsyncCtx48 + 28 >> 2] = $vararg_buffer; //@line 5276
    HEAP32[$AsyncCtx48 + 32 >> 2] = $vararg_buffer; //@line 5278
    HEAP32[$AsyncCtx48 + 36 >> 2] = $vararg_buffer1; //@line 5280
    HEAP32[$AsyncCtx48 + 40 >> 2] = $vararg_buffer1; //@line 5282
    sp = STACKTOP; //@line 5283
    STACKTOP = sp; //@line 5284
    return 0; //@line 5284
   }
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 5286
   _puts(6637) | 0; //@line 5287
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 179; //@line 5290
    sp = STACKTOP; //@line 5291
    STACKTOP = sp; //@line 5292
    return 0; //@line 5292
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5294
    STACKTOP = sp; //@line 5295
    return 0; //@line 5295
   }
   break;
  }
 }
 return 0; //@line 5300
}
function _mbed_vtracef__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$1$off0 = 0, $$1$off0$expand_i1_val = 0, $$1$off0$expand_i1_val18 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$3154 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $$lobit = 0, $$sink = 0, $10 = 0, $102 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $136 = 0, $14 = 0, $147 = 0, $148 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $163 = 0, $164 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $57 = 0, $6 = 0, $62 = 0, $73 = 0, $74 = 0, $78 = 0, $79 = 0, $8 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $89 = 0, $91 = 0, $95 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx11 = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx7 = 0, $ReallocAsyncCtx8 = 0, $extract$t159 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6227
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6229
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6231
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6233
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6235
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6237
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 6239
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6241
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 6243
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 6245
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 6247
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 6249
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 6251
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 6253
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 6255
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 6257
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 6261
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 6263
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 6265
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 6267
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 6269
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 6273
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 6275
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 6277
 HEAP32[95] = (HEAP32[95] | 0) + 1; //@line 6280
 $53 = HEAP32[84] | 0; //@line 6281
 do {
  if ($53 | 0) {
   HEAP8[$53 >> 0] = 0; //@line 6285
   do {
    if ($12 << 24 >> 24 > -1 & ($4 | 0) != 0) {
     $57 = HEAP32[81] | 0; //@line 6291
     if (HEAP8[$57 >> 0] | 0) {
      if (_strstr($57, $4) | 0) {
       $$0$i = 1; //@line 6298
       break;
      }
     }
     $62 = HEAP32[82] | 0; //@line 6302
     if (!(HEAP8[$62 >> 0] | 0)) {
      label = 9; //@line 6306
     } else {
      if (!(_strstr($62, $4) | 0)) {
       $$0$i = 1; //@line 6311
      } else {
       label = 9; //@line 6313
      }
     }
    } else {
     label = 9; //@line 6317
    }
   } while (0);
   if ((label | 0) == 9) {
    $$0$i = 0; //@line 6321
   }
   if (!((HEAP32[91] | 0) != 0 & ((($4 | 0) == 0 | (($22 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[88] = HEAP32[86]; //@line 6333
    break;
   }
   $73 = HEAPU8[320] | 0; //@line 6337
   $74 = $12 & 255; //@line 6338
   if ($74 & 31 & $73 | 0) {
    $78 = $73 & 64; //@line 6343
    $$lobit = $78 >>> 6; //@line 6344
    $79 = $$lobit & 255; //@line 6345
    $83 = ($73 & 32 | 0) == 0; //@line 6349
    $84 = HEAP32[85] | 0; //@line 6350
    $85 = HEAP32[84] | 0; //@line 6351
    $86 = $12 << 24 >> 24 == 1; //@line 6352
    if ($86 | ($73 & 128 | 0) != 0) {
     $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 6355
     _vsnprintf($85, $84, $22, $24) | 0; //@line 6356
     if (___async) {
      HEAP32[$ReallocAsyncCtx12 >> 2] = 39; //@line 6359
      $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 6360
      $$expand_i1_val = $86 & 1; //@line 6361
      HEAP8[$87 >> 0] = $$expand_i1_val; //@line 6362
      sp = STACKTOP; //@line 6363
      return;
     }
     ___async_unwind = 0; //@line 6366
     HEAP32[$ReallocAsyncCtx12 >> 2] = 39; //@line 6367
     $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 6368
     $$expand_i1_val = $86 & 1; //@line 6369
     HEAP8[$87 >> 0] = $$expand_i1_val; //@line 6370
     sp = STACKTOP; //@line 6371
     return;
    }
    if (!$78) {
     $$1$off0 = ($$lobit | 0) != 0; //@line 6377
     $$1143 = $85; //@line 6377
     $$1145 = $84; //@line 6377
     $$3154 = 0; //@line 6377
     label = 28; //@line 6378
    } else {
     if ($83) {
      $$0142 = $85; //@line 6381
      $$0144 = $84; //@line 6381
     } else {
      $89 = _snprintf($85, $84, 2191, $30) | 0; //@line 6383
      $$ = ($89 | 0) >= ($84 | 0) ? 0 : $89; //@line 6385
      $91 = ($$ | 0) > 0; //@line 6386
      $$0142 = $91 ? $85 + $$ | 0 : $85; //@line 6391
      $$0144 = $84 - ($91 ? $$ : 0) | 0; //@line 6391
     }
     if (($$0144 | 0) > 0) {
      $95 = $74 + -2 | 0; //@line 6395
      switch ($95 >>> 1 | $95 << 31 | 0) {
      case 0:
       {
        $$sink = 2209; //@line 6401
        label = 25; //@line 6402
        break;
       }
      case 1:
       {
        $$sink = 2215; //@line 6406
        label = 25; //@line 6407
        break;
       }
      case 3:
       {
        $$sink = 2203; //@line 6411
        label = 25; //@line 6412
        break;
       }
      case 7:
       {
        $$sink = 2197; //@line 6416
        label = 25; //@line 6417
        break;
       }
      default:
       {
        $$0141 = 0; //@line 6421
        $$1152 = 0; //@line 6421
       }
      }
      if ((label | 0) == 25) {
       HEAP32[$42 >> 2] = $$sink; //@line 6425
       $$0141 = $79 & 1; //@line 6428
       $$1152 = _snprintf($$0142, $$0144, 2221, $42) | 0; //@line 6428
      }
      $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 6431
      $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 6433
      if (($$1152$ | 0) > 0) {
       $102 = $$0141 << 24 >> 24 == 0; //@line 6435
       $$1$off0 = $extract$t159; //@line 6440
       $$1143 = $102 ? $$0142 : $$0142 + $$1152$ | 0; //@line 6440
       $$1145 = $$0144 - ($102 ? 0 : $$1152$) | 0; //@line 6440
       $$3154 = $$1152; //@line 6440
       label = 28; //@line 6441
      } else {
       $$1$off0 = $extract$t159; //@line 6443
       $$1143 = $$0142; //@line 6443
       $$1145 = $$0144; //@line 6443
       $$3154 = $$1152$; //@line 6443
       label = 28; //@line 6444
      }
     }
    }
    if ((label | 0) == 28) {
     if (($$1145 | 0) > 0 & (HEAP32[89] | 0) != 0) {
      HEAP32[$46 >> 2] = HEAP32[$24 >> 2]; //@line 6455
      $ReallocAsyncCtx11 = _emscripten_realloc_async_context(104) | 0; //@line 6456
      $108 = _vsnprintf(0, 0, $22, $46) | 0; //@line 6457
      if (___async) {
       HEAP32[$ReallocAsyncCtx11 >> 2] = 43; //@line 6460
       $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 6461
       HEAP32[$109 >> 2] = $2; //@line 6462
       $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 6463
       HEAP32[$110 >> 2] = $4; //@line 6464
       $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 6465
       HEAP32[$111 >> 2] = $6; //@line 6466
       $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 6467
       HEAP32[$112 >> 2] = $38; //@line 6468
       $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 6469
       HEAP32[$113 >> 2] = $40; //@line 6470
       $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 6471
       $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 6472
       HEAP8[$114 >> 0] = $$1$off0$expand_i1_val; //@line 6473
       $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 6474
       HEAP32[$115 >> 2] = $26; //@line 6475
       $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 6476
       HEAP32[$116 >> 2] = $28; //@line 6477
       $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 6478
       HEAP32[$117 >> 2] = $8; //@line 6479
       $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 6480
       HEAP32[$118 >> 2] = $10; //@line 6481
       $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 6482
       HEAP32[$119 >> 2] = $14; //@line 6483
       $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 6484
       HEAP32[$120 >> 2] = $16; //@line 6485
       $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 6486
       HEAP32[$121 >> 2] = $18; //@line 6487
       $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 6488
       HEAP32[$122 >> 2] = $20; //@line 6489
       $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 6490
       HEAP32[$123 >> 2] = $$3154; //@line 6491
       $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 6492
       HEAP32[$124 >> 2] = $22; //@line 6493
       $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 6494
       HEAP32[$125 >> 2] = $24; //@line 6495
       $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 6496
       HEAP32[$126 >> 2] = $34; //@line 6497
       $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 6498
       HEAP32[$127 >> 2] = $$1143; //@line 6499
       $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 6500
       HEAP32[$128 >> 2] = $$1145; //@line 6501
       $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 6502
       HEAP32[$129 >> 2] = $36; //@line 6503
       $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 6504
       HEAP32[$130 >> 2] = $46; //@line 6505
       $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 6506
       HEAP32[$131 >> 2] = $48; //@line 6507
       $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 6508
       HEAP32[$132 >> 2] = $50; //@line 6509
       $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 6510
       HEAP32[$133 >> 2] = $74; //@line 6511
       sp = STACKTOP; //@line 6512
       return;
      }
      HEAP32[___async_retval >> 2] = $108; //@line 6516
      ___async_unwind = 0; //@line 6517
      HEAP32[$ReallocAsyncCtx11 >> 2] = 43; //@line 6518
      $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 6519
      HEAP32[$109 >> 2] = $2; //@line 6520
      $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 6521
      HEAP32[$110 >> 2] = $4; //@line 6522
      $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 6523
      HEAP32[$111 >> 2] = $6; //@line 6524
      $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 6525
      HEAP32[$112 >> 2] = $38; //@line 6526
      $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 6527
      HEAP32[$113 >> 2] = $40; //@line 6528
      $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 6529
      $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 6530
      HEAP8[$114 >> 0] = $$1$off0$expand_i1_val; //@line 6531
      $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 6532
      HEAP32[$115 >> 2] = $26; //@line 6533
      $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 6534
      HEAP32[$116 >> 2] = $28; //@line 6535
      $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 6536
      HEAP32[$117 >> 2] = $8; //@line 6537
      $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 6538
      HEAP32[$118 >> 2] = $10; //@line 6539
      $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 6540
      HEAP32[$119 >> 2] = $14; //@line 6541
      $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 6542
      HEAP32[$120 >> 2] = $16; //@line 6543
      $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 6544
      HEAP32[$121 >> 2] = $18; //@line 6545
      $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 6546
      HEAP32[$122 >> 2] = $20; //@line 6547
      $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 6548
      HEAP32[$123 >> 2] = $$3154; //@line 6549
      $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 6550
      HEAP32[$124 >> 2] = $22; //@line 6551
      $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 6552
      HEAP32[$125 >> 2] = $24; //@line 6553
      $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 6554
      HEAP32[$126 >> 2] = $34; //@line 6555
      $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 6556
      HEAP32[$127 >> 2] = $$1143; //@line 6557
      $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 6558
      HEAP32[$128 >> 2] = $$1145; //@line 6559
      $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 6560
      HEAP32[$129 >> 2] = $36; //@line 6561
      $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 6562
      HEAP32[$130 >> 2] = $46; //@line 6563
      $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 6564
      HEAP32[$131 >> 2] = $48; //@line 6565
      $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 6566
      HEAP32[$132 >> 2] = $50; //@line 6567
      $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 6568
      HEAP32[$133 >> 2] = $74; //@line 6569
      sp = STACKTOP; //@line 6570
      return;
     }
     if (($$1145 | 0) > 0) {
      $136 = $74 + -2 | 0; //@line 6575
      switch ($136 >>> 1 | $136 << 31 | 0) {
      case 0:
       {
        HEAP32[$48 >> 2] = $4; //@line 6581
        $$5156 = _snprintf($$1143, $$1145, 2224, $48) | 0; //@line 6583
        break;
       }
      case 1:
       {
        HEAP32[$14 >> 2] = $4; //@line 6587
        $$5156 = _snprintf($$1143, $$1145, 2239, $14) | 0; //@line 6589
        break;
       }
      case 3:
       {
        HEAP32[$18 >> 2] = $4; //@line 6593
        $$5156 = _snprintf($$1143, $$1145, 2254, $18) | 0; //@line 6595
        break;
       }
      case 7:
       {
        HEAP32[$2 >> 2] = $4; //@line 6599
        $$5156 = _snprintf($$1143, $$1145, 2269, $2) | 0; //@line 6601
        break;
       }
      default:
       {
        $$5156 = _snprintf($$1143, $$1145, 2284, $8) | 0; //@line 6606
       }
      }
      $$5156$ = ($$5156 | 0) < ($$1145 | 0) ? $$5156 : 0; //@line 6610
      $147 = $$1143 + $$5156$ | 0; //@line 6612
      $148 = $$1145 - $$5156$ | 0; //@line 6613
      if (($$5156$ | 0) > 0 & ($148 | 0) > 0) {
       $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 6617
       $150 = _vsnprintf($147, $148, $22, $24) | 0; //@line 6618
       if (___async) {
        HEAP32[$ReallocAsyncCtx10 >> 2] = 45; //@line 6621
        $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 6622
        HEAP32[$151 >> 2] = $38; //@line 6623
        $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 6624
        HEAP32[$152 >> 2] = $40; //@line 6625
        $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 6626
        $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 6627
        HEAP8[$153 >> 0] = $$1$off0$expand_i1_val18; //@line 6628
        $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 6629
        HEAP32[$154 >> 2] = $26; //@line 6630
        $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 6631
        HEAP32[$155 >> 2] = $28; //@line 6632
        $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 6633
        HEAP32[$156 >> 2] = $148; //@line 6634
        $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 6635
        HEAP32[$157 >> 2] = $147; //@line 6636
        sp = STACKTOP; //@line 6637
        return;
       }
       HEAP32[___async_retval >> 2] = $150; //@line 6641
       ___async_unwind = 0; //@line 6642
       HEAP32[$ReallocAsyncCtx10 >> 2] = 45; //@line 6643
       $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 6644
       HEAP32[$151 >> 2] = $38; //@line 6645
       $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 6646
       HEAP32[$152 >> 2] = $40; //@line 6647
       $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 6648
       $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 6649
       HEAP8[$153 >> 0] = $$1$off0$expand_i1_val18; //@line 6650
       $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 6651
       HEAP32[$154 >> 2] = $26; //@line 6652
       $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 6653
       HEAP32[$155 >> 2] = $28; //@line 6654
       $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 6655
       HEAP32[$156 >> 2] = $148; //@line 6656
       $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 6657
       HEAP32[$157 >> 2] = $147; //@line 6658
       sp = STACKTOP; //@line 6659
       return;
      }
     }
    }
    $159 = HEAP32[91] | 0; //@line 6664
    $160 = HEAP32[84] | 0; //@line 6665
    $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 6666
    FUNCTION_TABLE_vi[$159 & 255]($160); //@line 6667
    if (___async) {
     HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 6670
     sp = STACKTOP; //@line 6671
     return;
    }
    ___async_unwind = 0; //@line 6674
    HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 6675
    sp = STACKTOP; //@line 6676
    return;
   }
  }
 } while (0);
 $161 = HEAP32[94] | 0; //@line 6681
 if (!$161) {
  return;
 }
 $163 = HEAP32[95] | 0; //@line 6686
 HEAP32[95] = 0; //@line 6687
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 6688
 FUNCTION_TABLE_v[$161 & 3](); //@line 6689
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 6692
  $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 6693
  HEAP32[$164 >> 2] = $163; //@line 6694
  sp = STACKTOP; //@line 6695
  return;
 }
 ___async_unwind = 0; //@line 6698
 HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 6699
 $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 6700
 HEAP32[$164 >> 2] = $163; //@line 6701
 sp = STACKTOP; //@line 6702
 return;
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 7674
 $3 = HEAP32[3511] | 0; //@line 7675
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 7678
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 7682
 $7 = $6 & 3; //@line 7683
 if (($7 | 0) == 1) {
  _abort(); //@line 7686
 }
 $9 = $6 & -8; //@line 7689
 $10 = $2 + $9 | 0; //@line 7690
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 7695
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 7701
   $17 = $13 + $9 | 0; //@line 7702
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 7705
   }
   if ((HEAP32[3512] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 7711
    $106 = HEAP32[$105 >> 2] | 0; //@line 7712
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 7716
     $$1382 = $17; //@line 7716
     $114 = $16; //@line 7716
     break;
    }
    HEAP32[3509] = $17; //@line 7719
    HEAP32[$105 >> 2] = $106 & -2; //@line 7721
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 7724
    HEAP32[$16 + $17 >> 2] = $17; //@line 7726
    return;
   }
   $21 = $13 >>> 3; //@line 7729
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 7733
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 7735
    $28 = 14068 + ($21 << 1 << 2) | 0; //@line 7737
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 7742
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 7749
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[3507] = HEAP32[3507] & ~(1 << $21); //@line 7759
     $$1 = $16; //@line 7760
     $$1382 = $17; //@line 7760
     $114 = $16; //@line 7760
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 7766
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 7770
     }
     $41 = $26 + 8 | 0; //@line 7773
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 7777
     } else {
      _abort(); //@line 7779
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 7784
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 7785
    $$1 = $16; //@line 7786
    $$1382 = $17; //@line 7786
    $114 = $16; //@line 7786
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 7790
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 7792
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 7796
     $60 = $59 + 4 | 0; //@line 7797
     $61 = HEAP32[$60 >> 2] | 0; //@line 7798
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 7801
      if (!$63) {
       $$3 = 0; //@line 7804
       break;
      } else {
       $$1387 = $63; //@line 7807
       $$1390 = $59; //@line 7807
      }
     } else {
      $$1387 = $61; //@line 7810
      $$1390 = $60; //@line 7810
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 7813
      $66 = HEAP32[$65 >> 2] | 0; //@line 7814
      if ($66 | 0) {
       $$1387 = $66; //@line 7817
       $$1390 = $65; //@line 7817
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 7820
      $69 = HEAP32[$68 >> 2] | 0; //@line 7821
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 7826
       $$1390 = $68; //@line 7826
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 7831
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 7834
      $$3 = $$1387; //@line 7835
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 7840
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 7843
     }
     $53 = $51 + 12 | 0; //@line 7846
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 7850
     }
     $56 = $48 + 8 | 0; //@line 7853
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 7857
      HEAP32[$56 >> 2] = $51; //@line 7858
      $$3 = $48; //@line 7859
      break;
     } else {
      _abort(); //@line 7862
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 7869
    $$1382 = $17; //@line 7869
    $114 = $16; //@line 7869
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 7872
    $75 = 14332 + ($74 << 2) | 0; //@line 7873
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 7878
      if (!$$3) {
       HEAP32[3508] = HEAP32[3508] & ~(1 << $74); //@line 7885
       $$1 = $16; //@line 7886
       $$1382 = $17; //@line 7886
       $114 = $16; //@line 7886
       break L10;
      }
     } else {
      if ((HEAP32[3511] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 7893
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 7901
       if (!$$3) {
        $$1 = $16; //@line 7904
        $$1382 = $17; //@line 7904
        $114 = $16; //@line 7904
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[3511] | 0; //@line 7912
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 7915
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 7919
    $92 = $16 + 16 | 0; //@line 7920
    $93 = HEAP32[$92 >> 2] | 0; //@line 7921
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 7927
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 7931
       HEAP32[$93 + 24 >> 2] = $$3; //@line 7933
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 7939
    if (!$99) {
     $$1 = $16; //@line 7942
     $$1382 = $17; //@line 7942
     $114 = $16; //@line 7942
    } else {
     if ((HEAP32[3511] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 7947
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 7951
      HEAP32[$99 + 24 >> 2] = $$3; //@line 7953
      $$1 = $16; //@line 7954
      $$1382 = $17; //@line 7954
      $114 = $16; //@line 7954
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 7960
   $$1382 = $9; //@line 7960
   $114 = $2; //@line 7960
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 7965
 }
 $115 = $10 + 4 | 0; //@line 7968
 $116 = HEAP32[$115 >> 2] | 0; //@line 7969
 if (!($116 & 1)) {
  _abort(); //@line 7973
 }
 if (!($116 & 2)) {
  if ((HEAP32[3513] | 0) == ($10 | 0)) {
   $124 = (HEAP32[3510] | 0) + $$1382 | 0; //@line 7983
   HEAP32[3510] = $124; //@line 7984
   HEAP32[3513] = $$1; //@line 7985
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 7988
   if (($$1 | 0) != (HEAP32[3512] | 0)) {
    return;
   }
   HEAP32[3512] = 0; //@line 7994
   HEAP32[3509] = 0; //@line 7995
   return;
  }
  if ((HEAP32[3512] | 0) == ($10 | 0)) {
   $132 = (HEAP32[3509] | 0) + $$1382 | 0; //@line 8002
   HEAP32[3509] = $132; //@line 8003
   HEAP32[3512] = $114; //@line 8004
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 8007
   HEAP32[$114 + $132 >> 2] = $132; //@line 8009
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 8013
  $138 = $116 >>> 3; //@line 8014
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 8019
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 8021
    $145 = 14068 + ($138 << 1 << 2) | 0; //@line 8023
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[3511] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 8029
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 8036
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[3507] = HEAP32[3507] & ~(1 << $138); //@line 8046
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 8052
    } else {
     if ((HEAP32[3511] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 8057
     }
     $160 = $143 + 8 | 0; //@line 8060
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 8064
     } else {
      _abort(); //@line 8066
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 8071
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 8072
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 8075
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 8077
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 8081
      $180 = $179 + 4 | 0; //@line 8082
      $181 = HEAP32[$180 >> 2] | 0; //@line 8083
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 8086
       if (!$183) {
        $$3400 = 0; //@line 8089
        break;
       } else {
        $$1398 = $183; //@line 8092
        $$1402 = $179; //@line 8092
       }
      } else {
       $$1398 = $181; //@line 8095
       $$1402 = $180; //@line 8095
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 8098
       $186 = HEAP32[$185 >> 2] | 0; //@line 8099
       if ($186 | 0) {
        $$1398 = $186; //@line 8102
        $$1402 = $185; //@line 8102
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 8105
       $189 = HEAP32[$188 >> 2] | 0; //@line 8106
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 8111
        $$1402 = $188; //@line 8111
       }
      }
      if ((HEAP32[3511] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 8117
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 8120
       $$3400 = $$1398; //@line 8121
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 8126
      if ((HEAP32[3511] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 8130
      }
      $173 = $170 + 12 | 0; //@line 8133
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 8137
      }
      $176 = $167 + 8 | 0; //@line 8140
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 8144
       HEAP32[$176 >> 2] = $170; //@line 8145
       $$3400 = $167; //@line 8146
       break;
      } else {
       _abort(); //@line 8149
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 8157
     $196 = 14332 + ($195 << 2) | 0; //@line 8158
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 8163
       if (!$$3400) {
        HEAP32[3508] = HEAP32[3508] & ~(1 << $195); //@line 8170
        break L108;
       }
      } else {
       if ((HEAP32[3511] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 8177
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 8185
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[3511] | 0; //@line 8195
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 8198
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 8202
     $213 = $10 + 16 | 0; //@line 8203
     $214 = HEAP32[$213 >> 2] | 0; //@line 8204
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 8210
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 8214
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 8216
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 8222
     if ($220 | 0) {
      if ((HEAP32[3511] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 8228
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 8232
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 8234
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 8243
  HEAP32[$114 + $137 >> 2] = $137; //@line 8245
  if (($$1 | 0) == (HEAP32[3512] | 0)) {
   HEAP32[3509] = $137; //@line 8249
   return;
  } else {
   $$2 = $137; //@line 8252
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 8256
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 8259
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 8261
  $$2 = $$1382; //@line 8262
 }
 $235 = $$2 >>> 3; //@line 8264
 if ($$2 >>> 0 < 256) {
  $238 = 14068 + ($235 << 1 << 2) | 0; //@line 8268
  $239 = HEAP32[3507] | 0; //@line 8269
  $240 = 1 << $235; //@line 8270
  if (!($239 & $240)) {
   HEAP32[3507] = $239 | $240; //@line 8275
   $$0403 = $238; //@line 8277
   $$pre$phiZ2D = $238 + 8 | 0; //@line 8277
  } else {
   $244 = $238 + 8 | 0; //@line 8279
   $245 = HEAP32[$244 >> 2] | 0; //@line 8280
   if ((HEAP32[3511] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 8284
   } else {
    $$0403 = $245; //@line 8287
    $$pre$phiZ2D = $244; //@line 8287
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 8290
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 8292
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 8294
  HEAP32[$$1 + 12 >> 2] = $238; //@line 8296
  return;
 }
 $251 = $$2 >>> 8; //@line 8299
 if (!$251) {
  $$0396 = 0; //@line 8302
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 8306
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 8310
   $257 = $251 << $256; //@line 8311
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 8314
   $262 = $257 << $260; //@line 8316
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 8319
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 8324
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 8330
  }
 }
 $276 = 14332 + ($$0396 << 2) | 0; //@line 8333
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 8335
 HEAP32[$$1 + 20 >> 2] = 0; //@line 8338
 HEAP32[$$1 + 16 >> 2] = 0; //@line 8339
 $280 = HEAP32[3508] | 0; //@line 8340
 $281 = 1 << $$0396; //@line 8341
 do {
  if (!($280 & $281)) {
   HEAP32[3508] = $280 | $281; //@line 8347
   HEAP32[$276 >> 2] = $$1; //@line 8348
   HEAP32[$$1 + 24 >> 2] = $276; //@line 8350
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 8352
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 8354
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 8362
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 8362
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 8369
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 8373
    $301 = HEAP32[$299 >> 2] | 0; //@line 8375
    if (!$301) {
     label = 121; //@line 8378
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 8381
     $$0384 = $301; //@line 8381
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[3511] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 8388
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 8391
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 8393
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 8395
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 8397
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 8402
    $309 = HEAP32[$308 >> 2] | 0; //@line 8403
    $310 = HEAP32[3511] | 0; //@line 8404
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 8410
     HEAP32[$308 >> 2] = $$1; //@line 8411
     HEAP32[$$1 + 8 >> 2] = $309; //@line 8413
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 8415
     HEAP32[$$1 + 24 >> 2] = 0; //@line 8417
     break;
    } else {
     _abort(); //@line 8420
    }
   }
  }
 } while (0);
 $319 = (HEAP32[3515] | 0) + -1 | 0; //@line 8427
 HEAP32[3515] = $319; //@line 8428
 if (!$319) {
  $$0212$in$i = 14484; //@line 8431
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 8436
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 8442
  }
 }
 HEAP32[3515] = -1; //@line 8445
 return;
}
function _twoway_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0166 = 0, $$0168 = 0, $$0169 = 0, $$0169$be = 0, $$0170 = 0, $$0175$ph$ph$lcssa216 = 0, $$0175$ph$ph$lcssa216328 = 0, $$0175$ph$ph254 = 0, $$0179242 = 0, $$0183$ph197$ph253 = 0, $$0183$ph197248 = 0, $$0183$ph260 = 0, $$0185$ph$lcssa = 0, $$0185$ph$lcssa327 = 0, $$0185$ph259 = 0, $$0187219$ph325326 = 0, $$0187263 = 0, $$1176$$0175 = 0, $$1176$ph$ph$lcssa208 = 0, $$1176$ph$ph233 = 0, $$1180222 = 0, $$1184$ph193$ph232 = 0, $$1184$ph193227 = 0, $$1184$ph239 = 0, $$1186$$0185 = 0, $$1186$ph$lcssa = 0, $$1186$ph238 = 0, $$2181$sink = 0, $$3 = 0, $$3173 = 0, $$3178 = 0, $$3182221 = 0, $$4 = 0, $$pr = 0, $10 = 0, $105 = 0, $111 = 0, $113 = 0, $118 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $14 = 0, $2 = 0, $23 = 0, $25 = 0, $27 = 0, $3 = 0, $32 = 0, $34 = 0, $37 = 0, $4 = 0, $41 = 0, $45 = 0, $50 = 0, $52 = 0, $53 = 0, $56 = 0, $60 = 0, $68 = 0, $70 = 0, $74 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $83 = 0, $86 = 0, $93 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12
 STACKTOP = STACKTOP + 1056 | 0; //@line 13
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(1056); //@line 13
 $2 = sp + 1024 | 0; //@line 14
 $3 = sp; //@line 15
 HEAP32[$2 >> 2] = 0; //@line 16
 HEAP32[$2 + 4 >> 2] = 0; //@line 16
 HEAP32[$2 + 8 >> 2] = 0; //@line 16
 HEAP32[$2 + 12 >> 2] = 0; //@line 16
 HEAP32[$2 + 16 >> 2] = 0; //@line 16
 HEAP32[$2 + 20 >> 2] = 0; //@line 16
 HEAP32[$2 + 24 >> 2] = 0; //@line 16
 HEAP32[$2 + 28 >> 2] = 0; //@line 16
 $4 = HEAP8[$1 >> 0] | 0; //@line 17
 L1 : do {
  if (!($4 << 24 >> 24)) {
   $$0175$ph$ph$lcssa216328 = 1; //@line 21
   $$0185$ph$lcssa327 = -1; //@line 21
   $$0187219$ph325326 = 0; //@line 21
   $$1176$ph$ph$lcssa208 = 1; //@line 21
   $$1186$ph$lcssa = -1; //@line 21
   label = 26; //@line 22
  } else {
   $$0187263 = 0; //@line 24
   $10 = $4; //@line 24
   do {
    if (!(HEAP8[$0 + $$0187263 >> 0] | 0)) {
     $$3 = 0; //@line 30
     break L1;
    }
    $14 = $2 + ((($10 & 255) >>> 5 & 255) << 2) | 0; //@line 38
    HEAP32[$14 >> 2] = HEAP32[$14 >> 2] | 1 << ($10 & 31); //@line 41
    $$0187263 = $$0187263 + 1 | 0; //@line 42
    HEAP32[$3 + (($10 & 255) << 2) >> 2] = $$0187263; //@line 45
    $10 = HEAP8[$1 + $$0187263 >> 0] | 0; //@line 47
   } while ($10 << 24 >> 24 != 0);
   $23 = $$0187263 >>> 0 > 1; //@line 55
   if ($23) {
    $$0183$ph260 = 0; //@line 57
    $$0185$ph259 = -1; //@line 57
    $130 = 1; //@line 57
    L6 : while (1) {
     $$0175$ph$ph254 = 1; //@line 59
     $$0183$ph197$ph253 = $$0183$ph260; //@line 59
     $131 = $130; //@line 59
     while (1) {
      $$0183$ph197248 = $$0183$ph197$ph253; //@line 61
      $132 = $131; //@line 61
      L10 : while (1) {
       $$0179242 = 1; //@line 63
       $25 = $132; //@line 63
       while (1) {
        $32 = HEAP8[$1 + ($$0179242 + $$0185$ph259) >> 0] | 0; //@line 67
        $34 = HEAP8[$1 + $25 >> 0] | 0; //@line 69
        if ($32 << 24 >> 24 != $34 << 24 >> 24) {
         break L10;
        }
        if (($$0179242 | 0) == ($$0175$ph$ph254 | 0)) {
         break;
        }
        $$0179242 = $$0179242 + 1 | 0; //@line 75
        $27 = $$0179242 + $$0183$ph197248 | 0; //@line 79
        if ($27 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 84
         $$0185$ph$lcssa = $$0185$ph259; //@line 84
         break L6;
        } else {
         $25 = $27; //@line 82
        }
       }
       $37 = $$0175$ph$ph254 + $$0183$ph197248 | 0; //@line 88
       $132 = $37 + 1 | 0; //@line 89
       if ($132 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 94
        $$0185$ph$lcssa = $$0185$ph259; //@line 94
        break L6;
       } else {
        $$0183$ph197248 = $37; //@line 92
       }
      }
      $41 = $25 - $$0185$ph259 | 0; //@line 99
      if (($32 & 255) <= ($34 & 255)) {
       break;
      }
      $131 = $25 + 1 | 0; //@line 103
      if ($131 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216 = $41; //@line 108
       $$0185$ph$lcssa = $$0185$ph259; //@line 108
       break L6;
      } else {
       $$0175$ph$ph254 = $41; //@line 106
       $$0183$ph197$ph253 = $25; //@line 106
      }
     }
     $130 = $$0183$ph197248 + 2 | 0; //@line 113
     if ($130 >>> 0 >= $$0187263 >>> 0) {
      $$0175$ph$ph$lcssa216 = 1; //@line 118
      $$0185$ph$lcssa = $$0183$ph197248; //@line 118
      break;
     } else {
      $$0183$ph260 = $$0183$ph197248 + 1 | 0; //@line 116
      $$0185$ph259 = $$0183$ph197248; //@line 116
     }
    }
    if ($23) {
     $$1184$ph239 = 0; //@line 123
     $$1186$ph238 = -1; //@line 123
     $133 = 1; //@line 123
     while (1) {
      $$1176$ph$ph233 = 1; //@line 125
      $$1184$ph193$ph232 = $$1184$ph239; //@line 125
      $135 = $133; //@line 125
      while (1) {
       $$1184$ph193227 = $$1184$ph193$ph232; //@line 127
       $134 = $135; //@line 127
       L25 : while (1) {
        $$1180222 = 1; //@line 129
        $52 = $134; //@line 129
        while (1) {
         $50 = HEAP8[$1 + ($$1180222 + $$1186$ph238) >> 0] | 0; //@line 133
         $53 = HEAP8[$1 + $52 >> 0] | 0; //@line 135
         if ($50 << 24 >> 24 != $53 << 24 >> 24) {
          break L25;
         }
         if (($$1180222 | 0) == ($$1176$ph$ph233 | 0)) {
          break;
         }
         $$1180222 = $$1180222 + 1 | 0; //@line 141
         $45 = $$1180222 + $$1184$ph193227 | 0; //@line 145
         if ($45 >>> 0 >= $$0187263 >>> 0) {
          $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 150
          $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 150
          $$0187219$ph325326 = $$0187263; //@line 150
          $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 150
          $$1186$ph$lcssa = $$1186$ph238; //@line 150
          label = 26; //@line 151
          break L1;
         } else {
          $52 = $45; //@line 148
         }
        }
        $56 = $$1176$ph$ph233 + $$1184$ph193227 | 0; //@line 155
        $134 = $56 + 1 | 0; //@line 156
        if ($134 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 161
         $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 161
         $$0187219$ph325326 = $$0187263; //@line 161
         $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 161
         $$1186$ph$lcssa = $$1186$ph238; //@line 161
         label = 26; //@line 162
         break L1;
        } else {
         $$1184$ph193227 = $56; //@line 159
        }
       }
       $60 = $52 - $$1186$ph238 | 0; //@line 167
       if (($50 & 255) >= ($53 & 255)) {
        break;
       }
       $135 = $52 + 1 | 0; //@line 171
       if ($135 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 176
        $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 176
        $$0187219$ph325326 = $$0187263; //@line 176
        $$1176$ph$ph$lcssa208 = $60; //@line 176
        $$1186$ph$lcssa = $$1186$ph238; //@line 176
        label = 26; //@line 177
        break L1;
       } else {
        $$1176$ph$ph233 = $60; //@line 174
        $$1184$ph193$ph232 = $52; //@line 174
       }
      }
      $133 = $$1184$ph193227 + 2 | 0; //@line 182
      if ($133 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 187
       $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 187
       $$0187219$ph325326 = $$0187263; //@line 187
       $$1176$ph$ph$lcssa208 = 1; //@line 187
       $$1186$ph$lcssa = $$1184$ph193227; //@line 187
       label = 26; //@line 188
       break;
      } else {
       $$1184$ph239 = $$1184$ph193227 + 1 | 0; //@line 185
       $$1186$ph238 = $$1184$ph193227; //@line 185
      }
     }
    } else {
     $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 193
     $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 193
     $$0187219$ph325326 = $$0187263; //@line 193
     $$1176$ph$ph$lcssa208 = 1; //@line 193
     $$1186$ph$lcssa = -1; //@line 193
     label = 26; //@line 194
    }
   } else {
    $$0175$ph$ph$lcssa216328 = 1; //@line 197
    $$0185$ph$lcssa327 = -1; //@line 197
    $$0187219$ph325326 = $$0187263; //@line 197
    $$1176$ph$ph$lcssa208 = 1; //@line 197
    $$1186$ph$lcssa = -1; //@line 197
    label = 26; //@line 198
   }
  }
 } while (0);
 L35 : do {
  if ((label | 0) == 26) {
   $68 = ($$1186$ph$lcssa + 1 | 0) >>> 0 > ($$0185$ph$lcssa327 + 1 | 0) >>> 0; //@line 206
   $$1176$$0175 = $68 ? $$1176$ph$ph$lcssa208 : $$0175$ph$ph$lcssa216328; //@line 207
   $$1186$$0185 = $68 ? $$1186$ph$lcssa : $$0185$ph$lcssa327; //@line 208
   $70 = $$1186$$0185 + 1 | 0; //@line 210
   if (!(_memcmp($1, $1 + $$1176$$0175 | 0, $70) | 0)) {
    $$0168 = $$0187219$ph325326 - $$1176$$0175 | 0; //@line 215
    $$3178 = $$1176$$0175; //@line 215
   } else {
    $74 = $$0187219$ph325326 - $$1186$$0185 + -1 | 0; //@line 218
    $$0168 = 0; //@line 222
    $$3178 = ($$1186$$0185 >>> 0 > $74 >>> 0 ? $$1186$$0185 : $74) + 1 | 0; //@line 222
   }
   $78 = $$0187219$ph325326 | 63; //@line 224
   $79 = $$0187219$ph325326 + -1 | 0; //@line 225
   $80 = ($$0168 | 0) != 0; //@line 226
   $81 = $$0187219$ph325326 - $$3178 | 0; //@line 227
   $$0166 = $0; //@line 228
   $$0169 = 0; //@line 228
   $$0170 = $0; //@line 228
   while (1) {
    $83 = $$0166; //@line 231
    do {
     if (($$0170 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
      $86 = _memchr($$0170, 0, $78) | 0; //@line 236
      if (!$86) {
       $$3173 = $$0170 + $78 | 0; //@line 240
       break;
      } else {
       if (($86 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
        $$3 = 0; //@line 247
        break L35;
       } else {
        $$3173 = $86; //@line 250
        break;
       }
      }
     } else {
      $$3173 = $$0170; //@line 255
     }
    } while (0);
    $93 = HEAP8[$$0166 + $79 >> 0] | 0; //@line 259
    L49 : do {
     if (!(1 << ($93 & 31) & HEAP32[$2 + ((($93 & 255) >>> 5 & 255) << 2) >> 2])) {
      $$0169$be = 0; //@line 271
      $$2181$sink = $$0187219$ph325326; //@line 271
     } else {
      $105 = $$0187219$ph325326 - (HEAP32[$3 + (($93 & 255) << 2) >> 2] | 0) | 0; //@line 276
      if ($105 | 0) {
       $$0169$be = 0; //@line 284
       $$2181$sink = $80 & ($$0169 | 0) != 0 & $105 >>> 0 < $$3178 >>> 0 ? $81 : $105; //@line 284
       break;
      }
      $111 = $70 >>> 0 > $$0169 >>> 0 ? $70 : $$0169; //@line 288
      $113 = HEAP8[$1 + $111 >> 0] | 0; //@line 290
      L54 : do {
       if (!($113 << 24 >> 24)) {
        $$4 = $70; //@line 294
       } else {
        $$3182221 = $111; //@line 296
        $$pr = $113; //@line 296
        while (1) {
         if ($$pr << 24 >> 24 != (HEAP8[$$0166 + $$3182221 >> 0] | 0)) {
          break;
         }
         $118 = $$3182221 + 1 | 0; //@line 304
         $$pr = HEAP8[$1 + $118 >> 0] | 0; //@line 306
         if (!($$pr << 24 >> 24)) {
          $$4 = $70; //@line 309
          break L54;
         } else {
          $$3182221 = $118; //@line 312
         }
        }
        $$0169$be = 0; //@line 316
        $$2181$sink = $$3182221 - $$1186$$0185 | 0; //@line 316
        break L49;
       }
      } while (0);
      while (1) {
       if ($$4 >>> 0 <= $$0169 >>> 0) {
        $$3 = $$0166; //@line 323
        break L35;
       }
       $$4 = $$4 + -1 | 0; //@line 326
       if ((HEAP8[$1 + $$4 >> 0] | 0) != (HEAP8[$$0166 + $$4 >> 0] | 0)) {
        $$0169$be = $$0168; //@line 335
        $$2181$sink = $$3178; //@line 335
        break;
       }
      }
     }
    } while (0);
    $$0166 = $$0166 + $$2181$sink | 0; //@line 342
    $$0169 = $$0169$be; //@line 342
    $$0170 = $$3173; //@line 342
   }
  }
 } while (0);
 STACKTOP = sp; //@line 346
 return $$3 | 0; //@line 346
}
function __ZN6C128329characterEiii__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $12 = 0, $14 = 0, $16 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $31 = 0, $33 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $56 = 0, $57 = 0, $6 = 0, $62 = 0, $64 = 0, $65 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 9761
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9763
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9765
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9767
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9769
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9771
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 9773
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 9775
 $16 = HEAP8[$0 + 32 >> 0] | 0; //@line 9777
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 9781
 $22 = HEAP8[$0 + 44 >> 0] | 0; //@line 9783
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 9785
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 9787
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 9789
 if ((HEAP32[$0 + 36 >> 2] | 0) >>> 0 > (HEAP32[___async_retval >> 2] | 0) >>> 0) {
  HEAP32[$4 >> 2] = 0; //@line 9794
  $31 = $6 + 64 | 0; //@line 9795
  $33 = (HEAP32[$31 >> 2] | 0) + $8 | 0; //@line 9797
  HEAP32[$31 >> 2] = $33; //@line 9798
  $36 = HEAP32[(HEAP32[$10 >> 2] | 0) + 132 >> 2] | 0; //@line 9801
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(60) | 0; //@line 9802
  $37 = FUNCTION_TABLE_ii[$36 & 31]($6) | 0; //@line 9803
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 122; //@line 9806
   $38 = $ReallocAsyncCtx2 + 4 | 0; //@line 9807
   HEAP32[$38 >> 2] = $2; //@line 9808
   $39 = $ReallocAsyncCtx2 + 8 | 0; //@line 9809
   HEAP32[$39 >> 2] = $33; //@line 9810
   $40 = $ReallocAsyncCtx2 + 12 | 0; //@line 9811
   HEAP32[$40 >> 2] = $12; //@line 9812
   $41 = $ReallocAsyncCtx2 + 16 | 0; //@line 9813
   HEAP32[$41 >> 2] = $14; //@line 9814
   $42 = $ReallocAsyncCtx2 + 20 | 0; //@line 9815
   HEAP8[$42 >> 0] = $16; //@line 9816
   $43 = $ReallocAsyncCtx2 + 24 | 0; //@line 9817
   HEAP32[$43 >> 2] = $31; //@line 9818
   $44 = $ReallocAsyncCtx2 + 28 | 0; //@line 9819
   HEAP32[$44 >> 2] = $4; //@line 9820
   $45 = $ReallocAsyncCtx2 + 32 | 0; //@line 9821
   HEAP8[$45 >> 0] = $22; //@line 9822
   $46 = $ReallocAsyncCtx2 + 36 | 0; //@line 9823
   HEAP32[$46 >> 2] = $6; //@line 9824
   $47 = $ReallocAsyncCtx2 + 40 | 0; //@line 9825
   HEAP32[$47 >> 2] = $24; //@line 9826
   $48 = $ReallocAsyncCtx2 + 44 | 0; //@line 9827
   HEAP32[$48 >> 2] = $26; //@line 9828
   $49 = $ReallocAsyncCtx2 + 48 | 0; //@line 9829
   HEAP32[$49 >> 2] = $28; //@line 9830
   $50 = $ReallocAsyncCtx2 + 52 | 0; //@line 9831
   HEAP32[$50 >> 2] = $20; //@line 9832
   $51 = $ReallocAsyncCtx2 + 56 | 0; //@line 9833
   HEAP32[$51 >> 2] = $8; //@line 9834
   sp = STACKTOP; //@line 9835
   return;
  }
  HEAP32[___async_retval >> 2] = $37; //@line 9839
  ___async_unwind = 0; //@line 9840
  HEAP32[$ReallocAsyncCtx2 >> 2] = 122; //@line 9841
  $38 = $ReallocAsyncCtx2 + 4 | 0; //@line 9842
  HEAP32[$38 >> 2] = $2; //@line 9843
  $39 = $ReallocAsyncCtx2 + 8 | 0; //@line 9844
  HEAP32[$39 >> 2] = $33; //@line 9845
  $40 = $ReallocAsyncCtx2 + 12 | 0; //@line 9846
  HEAP32[$40 >> 2] = $12; //@line 9847
  $41 = $ReallocAsyncCtx2 + 16 | 0; //@line 9848
  HEAP32[$41 >> 2] = $14; //@line 9849
  $42 = $ReallocAsyncCtx2 + 20 | 0; //@line 9850
  HEAP8[$42 >> 0] = $16; //@line 9851
  $43 = $ReallocAsyncCtx2 + 24 | 0; //@line 9852
  HEAP32[$43 >> 2] = $31; //@line 9853
  $44 = $ReallocAsyncCtx2 + 28 | 0; //@line 9854
  HEAP32[$44 >> 2] = $4; //@line 9855
  $45 = $ReallocAsyncCtx2 + 32 | 0; //@line 9856
  HEAP8[$45 >> 0] = $22; //@line 9857
  $46 = $ReallocAsyncCtx2 + 36 | 0; //@line 9858
  HEAP32[$46 >> 2] = $6; //@line 9859
  $47 = $ReallocAsyncCtx2 + 40 | 0; //@line 9860
  HEAP32[$47 >> 2] = $24; //@line 9861
  $48 = $ReallocAsyncCtx2 + 44 | 0; //@line 9862
  HEAP32[$48 >> 2] = $26; //@line 9863
  $49 = $ReallocAsyncCtx2 + 48 | 0; //@line 9864
  HEAP32[$49 >> 2] = $28; //@line 9865
  $50 = $ReallocAsyncCtx2 + 52 | 0; //@line 9866
  HEAP32[$50 >> 2] = $20; //@line 9867
  $51 = $ReallocAsyncCtx2 + 56 | 0; //@line 9868
  HEAP32[$51 >> 2] = $8; //@line 9869
  sp = STACKTOP; //@line 9870
  return;
 }
 $56 = (HEAP32[$2 >> 2] | 0) + ((Math_imul($12 + -32 | 0, $14) | 0) + 4) | 0; //@line 9877
 $57 = HEAP8[$56 >> 0] | 0; //@line 9878
 if ($16 << 24 >> 24) {
  if ($22 << 24 >> 24) {
   $62 = (0 >>> 3 & 31) + 1 | 0; //@line 9885
   $64 = 1 << 0; //@line 9887
   $65 = 0 + $24 | 0; //@line 9888
   $75 = HEAP32[(HEAP32[$6 >> 2] | 0) + 124 >> 2] | 0; //@line 9898
   $76 = 0 + $28 | 0; //@line 9899
   if (!($64 & (HEAPU8[$56 + ($62 + 0) >> 0] | 0))) {
    $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 9901
    FUNCTION_TABLE_viiii[$75 & 7]($6, $76, $65, 0); //@line 9902
    if (___async) {
     HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 9905
     $92 = $ReallocAsyncCtx4 + 4 | 0; //@line 9906
     HEAP32[$92 >> 2] = 0; //@line 9907
     $93 = $ReallocAsyncCtx4 + 8 | 0; //@line 9908
     HEAP32[$93 >> 2] = $20; //@line 9909
     $94 = $ReallocAsyncCtx4 + 12 | 0; //@line 9910
     HEAP32[$94 >> 2] = 0; //@line 9911
     $95 = $ReallocAsyncCtx4 + 16 | 0; //@line 9912
     HEAP32[$95 >> 2] = $8; //@line 9913
     $96 = $ReallocAsyncCtx4 + 20 | 0; //@line 9914
     HEAP32[$96 >> 2] = $26; //@line 9915
     $97 = $ReallocAsyncCtx4 + 24 | 0; //@line 9916
     HEAP32[$97 >> 2] = $62; //@line 9917
     $98 = $ReallocAsyncCtx4 + 28 | 0; //@line 9918
     HEAP32[$98 >> 2] = $56; //@line 9919
     $99 = $ReallocAsyncCtx4 + 32 | 0; //@line 9920
     HEAP32[$99 >> 2] = $64; //@line 9921
     $100 = $ReallocAsyncCtx4 + 36 | 0; //@line 9922
     HEAP32[$100 >> 2] = $6; //@line 9923
     $101 = $ReallocAsyncCtx4 + 40 | 0; //@line 9924
     HEAP32[$101 >> 2] = $28; //@line 9925
     $102 = $ReallocAsyncCtx4 + 44 | 0; //@line 9926
     HEAP32[$102 >> 2] = $6; //@line 9927
     $103 = $ReallocAsyncCtx4 + 48 | 0; //@line 9928
     HEAP32[$103 >> 2] = $65; //@line 9929
     $104 = $ReallocAsyncCtx4 + 52 | 0; //@line 9930
     HEAP8[$104 >> 0] = $57; //@line 9931
     $105 = $ReallocAsyncCtx4 + 56 | 0; //@line 9932
     HEAP32[$105 >> 2] = $4; //@line 9933
     $106 = $ReallocAsyncCtx4 + 60 | 0; //@line 9934
     HEAP32[$106 >> 2] = $24; //@line 9935
     sp = STACKTOP; //@line 9936
     return;
    }
    ___async_unwind = 0; //@line 9939
    HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 9940
    $92 = $ReallocAsyncCtx4 + 4 | 0; //@line 9941
    HEAP32[$92 >> 2] = 0; //@line 9942
    $93 = $ReallocAsyncCtx4 + 8 | 0; //@line 9943
    HEAP32[$93 >> 2] = $20; //@line 9944
    $94 = $ReallocAsyncCtx4 + 12 | 0; //@line 9945
    HEAP32[$94 >> 2] = 0; //@line 9946
    $95 = $ReallocAsyncCtx4 + 16 | 0; //@line 9947
    HEAP32[$95 >> 2] = $8; //@line 9948
    $96 = $ReallocAsyncCtx4 + 20 | 0; //@line 9949
    HEAP32[$96 >> 2] = $26; //@line 9950
    $97 = $ReallocAsyncCtx4 + 24 | 0; //@line 9951
    HEAP32[$97 >> 2] = $62; //@line 9952
    $98 = $ReallocAsyncCtx4 + 28 | 0; //@line 9953
    HEAP32[$98 >> 2] = $56; //@line 9954
    $99 = $ReallocAsyncCtx4 + 32 | 0; //@line 9955
    HEAP32[$99 >> 2] = $64; //@line 9956
    $100 = $ReallocAsyncCtx4 + 36 | 0; //@line 9957
    HEAP32[$100 >> 2] = $6; //@line 9958
    $101 = $ReallocAsyncCtx4 + 40 | 0; //@line 9959
    HEAP32[$101 >> 2] = $28; //@line 9960
    $102 = $ReallocAsyncCtx4 + 44 | 0; //@line 9961
    HEAP32[$102 >> 2] = $6; //@line 9962
    $103 = $ReallocAsyncCtx4 + 48 | 0; //@line 9963
    HEAP32[$103 >> 2] = $65; //@line 9964
    $104 = $ReallocAsyncCtx4 + 52 | 0; //@line 9965
    HEAP8[$104 >> 0] = $57; //@line 9966
    $105 = $ReallocAsyncCtx4 + 56 | 0; //@line 9967
    HEAP32[$105 >> 2] = $4; //@line 9968
    $106 = $ReallocAsyncCtx4 + 60 | 0; //@line 9969
    HEAP32[$106 >> 2] = $24; //@line 9970
    sp = STACKTOP; //@line 9971
    return;
   } else {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 9974
    FUNCTION_TABLE_viiii[$75 & 7]($6, $76, $65, 1); //@line 9975
    if (___async) {
     HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 9978
     $77 = $ReallocAsyncCtx3 + 4 | 0; //@line 9979
     HEAP32[$77 >> 2] = 0; //@line 9980
     $78 = $ReallocAsyncCtx3 + 8 | 0; //@line 9981
     HEAP32[$78 >> 2] = $20; //@line 9982
     $79 = $ReallocAsyncCtx3 + 12 | 0; //@line 9983
     HEAP32[$79 >> 2] = 0; //@line 9984
     $80 = $ReallocAsyncCtx3 + 16 | 0; //@line 9985
     HEAP32[$80 >> 2] = $8; //@line 9986
     $81 = $ReallocAsyncCtx3 + 20 | 0; //@line 9987
     HEAP32[$81 >> 2] = $26; //@line 9988
     $82 = $ReallocAsyncCtx3 + 24 | 0; //@line 9989
     HEAP32[$82 >> 2] = $62; //@line 9990
     $83 = $ReallocAsyncCtx3 + 28 | 0; //@line 9991
     HEAP32[$83 >> 2] = $56; //@line 9992
     $84 = $ReallocAsyncCtx3 + 32 | 0; //@line 9993
     HEAP32[$84 >> 2] = $64; //@line 9994
     $85 = $ReallocAsyncCtx3 + 36 | 0; //@line 9995
     HEAP32[$85 >> 2] = $6; //@line 9996
     $86 = $ReallocAsyncCtx3 + 40 | 0; //@line 9997
     HEAP32[$86 >> 2] = $28; //@line 9998
     $87 = $ReallocAsyncCtx3 + 44 | 0; //@line 9999
     HEAP32[$87 >> 2] = $6; //@line 10000
     $88 = $ReallocAsyncCtx3 + 48 | 0; //@line 10001
     HEAP32[$88 >> 2] = $65; //@line 10002
     $89 = $ReallocAsyncCtx3 + 52 | 0; //@line 10003
     HEAP8[$89 >> 0] = $57; //@line 10004
     $90 = $ReallocAsyncCtx3 + 56 | 0; //@line 10005
     HEAP32[$90 >> 2] = $4; //@line 10006
     $91 = $ReallocAsyncCtx3 + 60 | 0; //@line 10007
     HEAP32[$91 >> 2] = $24; //@line 10008
     sp = STACKTOP; //@line 10009
     return;
    }
    ___async_unwind = 0; //@line 10012
    HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 10013
    $77 = $ReallocAsyncCtx3 + 4 | 0; //@line 10014
    HEAP32[$77 >> 2] = 0; //@line 10015
    $78 = $ReallocAsyncCtx3 + 8 | 0; //@line 10016
    HEAP32[$78 >> 2] = $20; //@line 10017
    $79 = $ReallocAsyncCtx3 + 12 | 0; //@line 10018
    HEAP32[$79 >> 2] = 0; //@line 10019
    $80 = $ReallocAsyncCtx3 + 16 | 0; //@line 10020
    HEAP32[$80 >> 2] = $8; //@line 10021
    $81 = $ReallocAsyncCtx3 + 20 | 0; //@line 10022
    HEAP32[$81 >> 2] = $26; //@line 10023
    $82 = $ReallocAsyncCtx3 + 24 | 0; //@line 10024
    HEAP32[$82 >> 2] = $62; //@line 10025
    $83 = $ReallocAsyncCtx3 + 28 | 0; //@line 10026
    HEAP32[$83 >> 2] = $56; //@line 10027
    $84 = $ReallocAsyncCtx3 + 32 | 0; //@line 10028
    HEAP32[$84 >> 2] = $64; //@line 10029
    $85 = $ReallocAsyncCtx3 + 36 | 0; //@line 10030
    HEAP32[$85 >> 2] = $6; //@line 10031
    $86 = $ReallocAsyncCtx3 + 40 | 0; //@line 10032
    HEAP32[$86 >> 2] = $28; //@line 10033
    $87 = $ReallocAsyncCtx3 + 44 | 0; //@line 10034
    HEAP32[$87 >> 2] = $6; //@line 10035
    $88 = $ReallocAsyncCtx3 + 48 | 0; //@line 10036
    HEAP32[$88 >> 2] = $65; //@line 10037
    $89 = $ReallocAsyncCtx3 + 52 | 0; //@line 10038
    HEAP8[$89 >> 0] = $57; //@line 10039
    $90 = $ReallocAsyncCtx3 + 56 | 0; //@line 10040
    HEAP32[$90 >> 2] = $4; //@line 10041
    $91 = $ReallocAsyncCtx3 + 60 | 0; //@line 10042
    HEAP32[$91 >> 2] = $24; //@line 10043
    sp = STACKTOP; //@line 10044
    return;
   }
  }
 }
 HEAP32[$4 >> 2] = (HEAP32[$4 >> 2] | 0) + ($57 & 255); //@line 10052
 return;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 $rem = $rem | 0;
 var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $_0$0 = 0, $_0$1 = 0, $q_sroa_1_1198$looptemp = 0;
 $n_sroa_0_0_extract_trunc = $a$0; //@line 11702
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 11703
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 11704
 $d_sroa_0_0_extract_trunc = $b$0; //@line 11705
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 11706
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 11707
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 11709
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 11712
    HEAP32[$rem + 4 >> 2] = 0; //@line 11713
   }
   $_0$1 = 0; //@line 11715
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 11716
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 11717
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 11720
    $_0$0 = 0; //@line 11721
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 11722
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 11724
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 11725
   $_0$1 = 0; //@line 11726
   $_0$0 = 0; //@line 11727
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 11728
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 11731
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 11736
     HEAP32[$rem + 4 >> 2] = 0; //@line 11737
    }
    $_0$1 = 0; //@line 11739
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 11740
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 11741
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 11745
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 11746
    }
    $_0$1 = 0; //@line 11748
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 11749
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 11750
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 11752
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 11755
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 11756
    }
    $_0$1 = 0; //@line 11758
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 11759
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 11760
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 11763
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 11765
    $58 = 31 - $51 | 0; //@line 11766
    $sr_1_ph = $57; //@line 11767
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 11768
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 11769
    $q_sroa_0_1_ph = 0; //@line 11770
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 11771
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 11775
    $_0$0 = 0; //@line 11776
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 11777
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 11779
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 11780
   $_0$1 = 0; //@line 11781
   $_0$0 = 0; //@line 11782
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 11783
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 11787
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 11789
     $126 = 31 - $119 | 0; //@line 11790
     $130 = $119 - 31 >> 31; //@line 11791
     $sr_1_ph = $125; //@line 11792
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 11793
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 11794
     $q_sroa_0_1_ph = 0; //@line 11795
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 11796
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 11800
     $_0$0 = 0; //@line 11801
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 11802
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 11804
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 11805
    $_0$1 = 0; //@line 11806
    $_0$0 = 0; //@line 11807
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 11808
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 11810
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 11813
    $89 = 64 - $88 | 0; //@line 11814
    $91 = 32 - $88 | 0; //@line 11815
    $92 = $91 >> 31; //@line 11816
    $95 = $88 - 32 | 0; //@line 11817
    $105 = $95 >> 31; //@line 11818
    $sr_1_ph = $88; //@line 11819
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 11820
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 11821
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 11822
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 11823
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 11827
    HEAP32[$rem + 4 >> 2] = 0; //@line 11828
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 11831
    $_0$0 = $a$0 | 0 | 0; //@line 11832
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 11833
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 11835
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 11836
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 11837
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 11838
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 11843
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 11844
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 11845
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 11846
  $carry_0_lcssa$1 = 0; //@line 11847
  $carry_0_lcssa$0 = 0; //@line 11848
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 11850
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 11851
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 11852
  $137$1 = tempRet0; //@line 11853
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 11854
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 11855
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 11856
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 11857
  $sr_1202 = $sr_1_ph; //@line 11858
  $carry_0203 = 0; //@line 11859
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 11861
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 11862
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 11863
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 11864
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 11865
   $150$1 = tempRet0; //@line 11866
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 11867
   $carry_0203 = $151$0 & 1; //@line 11868
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 11870
   $r_sroa_1_1200 = tempRet0; //@line 11871
   $sr_1202 = $sr_1202 - 1 | 0; //@line 11872
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 11884
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 11885
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 11886
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 11887
  $carry_0_lcssa$1 = 0; //@line 11888
  $carry_0_lcssa$0 = $carry_0203; //@line 11889
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 11891
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 11892
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 11895
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 11896
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 11898
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 11899
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 11900
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2205
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 2211
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 2220
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 2225
      $19 = $1 + 44 | 0; //@line 2226
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 2235
      $26 = $1 + 52 | 0; //@line 2236
      $27 = $1 + 53 | 0; //@line 2237
      $28 = $1 + 54 | 0; //@line 2238
      $29 = $0 + 8 | 0; //@line 2239
      $30 = $1 + 24 | 0; //@line 2240
      $$081$off0 = 0; //@line 2241
      $$084 = $0 + 16 | 0; //@line 2241
      $$085$off0 = 0; //@line 2241
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 2245
        label = 20; //@line 2246
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 2249
       HEAP8[$27 >> 0] = 0; //@line 2250
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 2251
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 2252
       if (___async) {
        label = 12; //@line 2255
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 2258
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 2262
        label = 20; //@line 2263
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 2270
         $$186$off0 = $$085$off0; //@line 2270
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 2279
           label = 20; //@line 2280
           break L10;
          } else {
           $$182$off0 = 1; //@line 2283
           $$186$off0 = $$085$off0; //@line 2283
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 2290
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 2297
          break L10;
         } else {
          $$182$off0 = 1; //@line 2300
          $$186$off0 = 1; //@line 2300
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 2305
       $$084 = $$084 + 8 | 0; //@line 2305
       $$085$off0 = $$186$off0; //@line 2305
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 221; //@line 2308
       HEAP32[$AsyncCtx15 + 4 >> 2] = $2; //@line 2310
       HEAP32[$AsyncCtx15 + 8 >> 2] = $13; //@line 2312
       HEAP32[$AsyncCtx15 + 12 >> 2] = $1; //@line 2314
       HEAP8[$AsyncCtx15 + 16 >> 0] = $$081$off0 & 1; //@line 2317
       HEAP8[$AsyncCtx15 + 17 >> 0] = $$085$off0 & 1; //@line 2320
       HEAP32[$AsyncCtx15 + 20 >> 2] = $28; //@line 2322
       HEAP32[$AsyncCtx15 + 24 >> 2] = $30; //@line 2324
       HEAP32[$AsyncCtx15 + 28 >> 2] = $19; //@line 2326
       HEAP32[$AsyncCtx15 + 32 >> 2] = $26; //@line 2328
       HEAP32[$AsyncCtx15 + 36 >> 2] = $27; //@line 2330
       HEAP8[$AsyncCtx15 + 40 >> 0] = $4 & 1; //@line 2333
       HEAP32[$AsyncCtx15 + 44 >> 2] = $25; //@line 2335
       HEAP32[$AsyncCtx15 + 48 >> 2] = $29; //@line 2337
       HEAP32[$AsyncCtx15 + 52 >> 2] = $$084; //@line 2339
       sp = STACKTOP; //@line 2340
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 2346
         $61 = $1 + 40 | 0; //@line 2347
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 2350
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 2358
           if ($$283$off0) {
            label = 25; //@line 2360
            break;
           } else {
            $69 = 4; //@line 2363
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 2370
        } else {
         $69 = 4; //@line 2372
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 2377
      }
      HEAP32[$19 >> 2] = $69; //@line 2379
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 2388
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 2393
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 2394
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 2395
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 2396
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 222; //@line 2399
    HEAP32[$AsyncCtx11 + 4 >> 2] = $1; //@line 2401
    HEAP32[$AsyncCtx11 + 8 >> 2] = $0; //@line 2403
    HEAP32[$AsyncCtx11 + 12 >> 2] = $2; //@line 2405
    HEAP32[$AsyncCtx11 + 16 >> 2] = $3; //@line 2407
    HEAP8[$AsyncCtx11 + 20 >> 0] = $4 & 1; //@line 2410
    HEAP32[$AsyncCtx11 + 24 >> 2] = $73; //@line 2412
    HEAP32[$AsyncCtx11 + 28 >> 2] = $72; //@line 2414
    sp = STACKTOP; //@line 2415
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 2418
   $81 = $0 + 24 | 0; //@line 2419
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 2423
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 2427
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 2434
       $$2 = $81; //@line 2435
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 2447
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 2448
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 2453
        $136 = $$2 + 8 | 0; //@line 2454
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 2457
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 225; //@line 2462
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 2464
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 2466
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 2468
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 2470
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 2472
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 2474
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 2476
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 2479
       sp = STACKTOP; //@line 2480
       return;
      }
      $104 = $1 + 24 | 0; //@line 2483
      $105 = $1 + 54 | 0; //@line 2484
      $$1 = $81; //@line 2485
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 2501
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 2502
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2507
       $122 = $$1 + 8 | 0; //@line 2508
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 2511
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 224; //@line 2516
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 2518
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 2520
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 2522
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 2524
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 2526
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 2528
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 2530
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 2532
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 2535
      sp = STACKTOP; //@line 2536
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 2540
    $$0 = $81; //@line 2541
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 2548
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 2549
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2554
     $100 = $$0 + 8 | 0; //@line 2555
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 2558
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 223; //@line 2563
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 2565
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 2567
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 2569
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 2571
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 2573
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 2575
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 2578
    sp = STACKTOP; //@line 2579
    return;
   }
  }
 } while (0);
 return;
}
function __ZN6C128329characterEiii__async_cb_97($0) {
 $0 = $0 | 0;
 var $$04142$us = 0, $$043$us$reg2mem$0 = 0, $$reg2mem$0 = 0, $$reg2mem17$0 = 0, $$reg2mem21$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $4 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 10512
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10516
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10518
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10520
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10522
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10524
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 10526
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 10528
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 10530
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 10532
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 10534
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 10536
 $26 = HEAP8[$0 + 52 >> 0] | 0; //@line 10538
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 10540
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 10542
 $79 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 10543
 do {
  if (($79 | 0) == ($4 | 0)) {
   $32 = $6 + 1 | 0; //@line 10547
   if (($32 | 0) != ($8 | 0)) {
    $$04142$us = 0; //@line 10556
    $$043$us$reg2mem$0 = $32; //@line 10556
    $$reg2mem$0 = ($32 >>> 3 & 31) + 1 | 0; //@line 10556
    $$reg2mem17$0 = 1 << ($32 & 7); //@line 10556
    $$reg2mem21$0 = $32 + $30 | 0; //@line 10556
    break;
   }
   HEAP32[$28 >> 2] = (HEAP32[$28 >> 2] | 0) + ($26 & 255); //@line 10562
   return;
  } else {
   $$04142$us = $79; //@line 10565
   $$043$us$reg2mem$0 = $6; //@line 10565
   $$reg2mem$0 = $12; //@line 10565
   $$reg2mem17$0 = $16; //@line 10565
   $$reg2mem21$0 = $24; //@line 10565
  }
 } while (0);
 $44 = ($$reg2mem17$0 & (HEAPU8[$14 + ($$reg2mem$0 + (Math_imul($$04142$us, $10) | 0)) >> 0] | 0) | 0) == 0; //@line 10574
 $47 = HEAP32[(HEAP32[$18 >> 2] | 0) + 124 >> 2] | 0; //@line 10577
 $48 = $$04142$us + $20 | 0; //@line 10578
 if ($44) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 10580
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 0); //@line 10581
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 10584
   $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 10585
   HEAP32[$64 >> 2] = $$04142$us; //@line 10586
   $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 10587
   HEAP32[$65 >> 2] = $4; //@line 10588
   $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 10589
   HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 10590
   $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 10591
   HEAP32[$67 >> 2] = $8; //@line 10592
   $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 10593
   HEAP32[$68 >> 2] = $10; //@line 10594
   $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 10595
   HEAP32[$69 >> 2] = $$reg2mem$0; //@line 10596
   $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 10597
   HEAP32[$70 >> 2] = $14; //@line 10598
   $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 10599
   HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 10600
   $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 10601
   HEAP32[$72 >> 2] = $18; //@line 10602
   $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 10603
   HEAP32[$73 >> 2] = $20; //@line 10604
   $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 10605
   HEAP32[$74 >> 2] = $22; //@line 10606
   $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 10607
   HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 10608
   $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 10609
   HEAP8[$76 >> 0] = $26; //@line 10610
   $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 10611
   HEAP32[$77 >> 2] = $28; //@line 10612
   $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 10613
   HEAP32[$78 >> 2] = $30; //@line 10614
   sp = STACKTOP; //@line 10615
   return;
  }
  ___async_unwind = 0; //@line 10618
  HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 10619
  $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 10620
  HEAP32[$64 >> 2] = $$04142$us; //@line 10621
  $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 10622
  HEAP32[$65 >> 2] = $4; //@line 10623
  $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 10624
  HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 10625
  $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 10626
  HEAP32[$67 >> 2] = $8; //@line 10627
  $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 10628
  HEAP32[$68 >> 2] = $10; //@line 10629
  $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 10630
  HEAP32[$69 >> 2] = $$reg2mem$0; //@line 10631
  $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 10632
  HEAP32[$70 >> 2] = $14; //@line 10633
  $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 10634
  HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 10635
  $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 10636
  HEAP32[$72 >> 2] = $18; //@line 10637
  $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 10638
  HEAP32[$73 >> 2] = $20; //@line 10639
  $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 10640
  HEAP32[$74 >> 2] = $22; //@line 10641
  $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 10642
  HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 10643
  $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 10644
  HEAP8[$76 >> 0] = $26; //@line 10645
  $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 10646
  HEAP32[$77 >> 2] = $28; //@line 10647
  $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 10648
  HEAP32[$78 >> 2] = $30; //@line 10649
  sp = STACKTOP; //@line 10650
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 10653
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 1); //@line 10654
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 10657
   $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 10658
   HEAP32[$49 >> 2] = $$04142$us; //@line 10659
   $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 10660
   HEAP32[$50 >> 2] = $4; //@line 10661
   $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 10662
   HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 10663
   $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 10664
   HEAP32[$52 >> 2] = $8; //@line 10665
   $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 10666
   HEAP32[$53 >> 2] = $10; //@line 10667
   $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 10668
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 10669
   $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 10670
   HEAP32[$55 >> 2] = $14; //@line 10671
   $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 10672
   HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 10673
   $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 10674
   HEAP32[$57 >> 2] = $18; //@line 10675
   $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 10676
   HEAP32[$58 >> 2] = $20; //@line 10677
   $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 10678
   HEAP32[$59 >> 2] = $22; //@line 10679
   $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 10680
   HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 10681
   $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 10682
   HEAP8[$61 >> 0] = $26; //@line 10683
   $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 10684
   HEAP32[$62 >> 2] = $28; //@line 10685
   $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 10686
   HEAP32[$63 >> 2] = $30; //@line 10687
   sp = STACKTOP; //@line 10688
   return;
  }
  ___async_unwind = 0; //@line 10691
  HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 10692
  $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 10693
  HEAP32[$49 >> 2] = $$04142$us; //@line 10694
  $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 10695
  HEAP32[$50 >> 2] = $4; //@line 10696
  $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 10697
  HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 10698
  $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 10699
  HEAP32[$52 >> 2] = $8; //@line 10700
  $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 10701
  HEAP32[$53 >> 2] = $10; //@line 10702
  $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 10703
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 10704
  $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 10705
  HEAP32[$55 >> 2] = $14; //@line 10706
  $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 10707
  HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 10708
  $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 10709
  HEAP32[$57 >> 2] = $18; //@line 10710
  $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 10711
  HEAP32[$58 >> 2] = $20; //@line 10712
  $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 10713
  HEAP32[$59 >> 2] = $22; //@line 10714
  $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 10715
  HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 10716
  $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 10717
  HEAP8[$61 >> 0] = $26; //@line 10718
  $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 10719
  HEAP32[$62 >> 2] = $28; //@line 10720
  $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 10721
  HEAP32[$63 >> 2] = $30; //@line 10722
  sp = STACKTOP; //@line 10723
  return;
 }
}
function __ZN6C128329characterEiii__async_cb_96($0) {
 $0 = $0 | 0;
 var $$04142$us = 0, $$043$us$reg2mem$0 = 0, $$reg2mem$0 = 0, $$reg2mem17$0 = 0, $$reg2mem21$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $4 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 10290
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 10294
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10296
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10298
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10300
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10302
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 10304
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 10306
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 10308
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 10310
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 10312
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 10314
 $26 = HEAP8[$0 + 52 >> 0] | 0; //@line 10316
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 10318
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 10320
 $79 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 10321
 do {
  if (($79 | 0) == ($4 | 0)) {
   $32 = $6 + 1 | 0; //@line 10325
   if (($32 | 0) != ($8 | 0)) {
    $$04142$us = 0; //@line 10334
    $$043$us$reg2mem$0 = $32; //@line 10334
    $$reg2mem$0 = ($32 >>> 3 & 31) + 1 | 0; //@line 10334
    $$reg2mem17$0 = 1 << ($32 & 7); //@line 10334
    $$reg2mem21$0 = $32 + $30 | 0; //@line 10334
    break;
   }
   HEAP32[$28 >> 2] = (HEAP32[$28 >> 2] | 0) + ($26 & 255); //@line 10340
   return;
  } else {
   $$04142$us = $79; //@line 10343
   $$043$us$reg2mem$0 = $6; //@line 10343
   $$reg2mem$0 = $12; //@line 10343
   $$reg2mem17$0 = $16; //@line 10343
   $$reg2mem21$0 = $24; //@line 10343
  }
 } while (0);
 $44 = ($$reg2mem17$0 & (HEAPU8[$14 + ($$reg2mem$0 + (Math_imul($$04142$us, $10) | 0)) >> 0] | 0) | 0) == 0; //@line 10352
 $47 = HEAP32[(HEAP32[$18 >> 2] | 0) + 124 >> 2] | 0; //@line 10355
 $48 = $$04142$us + $20 | 0; //@line 10356
 if ($44) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 10358
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 0); //@line 10359
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 10362
   $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 10363
   HEAP32[$64 >> 2] = $$04142$us; //@line 10364
   $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 10365
   HEAP32[$65 >> 2] = $4; //@line 10366
   $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 10367
   HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 10368
   $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 10369
   HEAP32[$67 >> 2] = $8; //@line 10370
   $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 10371
   HEAP32[$68 >> 2] = $10; //@line 10372
   $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 10373
   HEAP32[$69 >> 2] = $$reg2mem$0; //@line 10374
   $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 10375
   HEAP32[$70 >> 2] = $14; //@line 10376
   $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 10377
   HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 10378
   $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 10379
   HEAP32[$72 >> 2] = $18; //@line 10380
   $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 10381
   HEAP32[$73 >> 2] = $20; //@line 10382
   $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 10383
   HEAP32[$74 >> 2] = $22; //@line 10384
   $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 10385
   HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 10386
   $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 10387
   HEAP8[$76 >> 0] = $26; //@line 10388
   $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 10389
   HEAP32[$77 >> 2] = $28; //@line 10390
   $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 10391
   HEAP32[$78 >> 2] = $30; //@line 10392
   sp = STACKTOP; //@line 10393
   return;
  }
  ___async_unwind = 0; //@line 10396
  HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 10397
  $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 10398
  HEAP32[$64 >> 2] = $$04142$us; //@line 10399
  $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 10400
  HEAP32[$65 >> 2] = $4; //@line 10401
  $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 10402
  HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 10403
  $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 10404
  HEAP32[$67 >> 2] = $8; //@line 10405
  $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 10406
  HEAP32[$68 >> 2] = $10; //@line 10407
  $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 10408
  HEAP32[$69 >> 2] = $$reg2mem$0; //@line 10409
  $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 10410
  HEAP32[$70 >> 2] = $14; //@line 10411
  $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 10412
  HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 10413
  $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 10414
  HEAP32[$72 >> 2] = $18; //@line 10415
  $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 10416
  HEAP32[$73 >> 2] = $20; //@line 10417
  $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 10418
  HEAP32[$74 >> 2] = $22; //@line 10419
  $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 10420
  HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 10421
  $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 10422
  HEAP8[$76 >> 0] = $26; //@line 10423
  $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 10424
  HEAP32[$77 >> 2] = $28; //@line 10425
  $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 10426
  HEAP32[$78 >> 2] = $30; //@line 10427
  sp = STACKTOP; //@line 10428
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 10431
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 1); //@line 10432
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 10435
   $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 10436
   HEAP32[$49 >> 2] = $$04142$us; //@line 10437
   $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 10438
   HEAP32[$50 >> 2] = $4; //@line 10439
   $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 10440
   HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 10441
   $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 10442
   HEAP32[$52 >> 2] = $8; //@line 10443
   $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 10444
   HEAP32[$53 >> 2] = $10; //@line 10445
   $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 10446
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 10447
   $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 10448
   HEAP32[$55 >> 2] = $14; //@line 10449
   $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 10450
   HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 10451
   $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 10452
   HEAP32[$57 >> 2] = $18; //@line 10453
   $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 10454
   HEAP32[$58 >> 2] = $20; //@line 10455
   $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 10456
   HEAP32[$59 >> 2] = $22; //@line 10457
   $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 10458
   HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 10459
   $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 10460
   HEAP8[$61 >> 0] = $26; //@line 10461
   $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 10462
   HEAP32[$62 >> 2] = $28; //@line 10463
   $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 10464
   HEAP32[$63 >> 2] = $30; //@line 10465
   sp = STACKTOP; //@line 10466
   return;
  }
  ___async_unwind = 0; //@line 10469
  HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 10470
  $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 10471
  HEAP32[$49 >> 2] = $$04142$us; //@line 10472
  $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 10473
  HEAP32[$50 >> 2] = $4; //@line 10474
  $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 10475
  HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 10476
  $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 10477
  HEAP32[$52 >> 2] = $8; //@line 10478
  $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 10479
  HEAP32[$53 >> 2] = $10; //@line 10480
  $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 10481
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 10482
  $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 10483
  HEAP32[$55 >> 2] = $14; //@line 10484
  $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 10485
  HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 10486
  $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 10487
  HEAP32[$57 >> 2] = $18; //@line 10488
  $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 10489
  HEAP32[$58 >> 2] = $20; //@line 10490
  $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 10491
  HEAP32[$59 >> 2] = $22; //@line 10492
  $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 10493
  HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 10494
  $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 10495
  HEAP8[$61 >> 0] = $26; //@line 10496
  $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 10497
  HEAP32[$62 >> 2] = $28; //@line 10498
  $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 10499
  HEAP32[$63 >> 2] = $30; //@line 10500
  sp = STACKTOP; //@line 10501
  return;
 }
}
function __ZN6C128329characterEiii__async_cb_95($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $39 = 0, $40 = 0, $45 = 0, $47 = 0, $48 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 10062
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10068
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10070
 $10 = HEAP8[$0 + 20 >> 0] | 0; //@line 10072
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 10076
 $16 = HEAP8[$0 + 32 >> 0] | 0; //@line 10078
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 10080
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 10082
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 10084
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 10086
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 10088
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 10090
 $30 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 10093
 if ((HEAP32[$0 + 8 >> 2] | 0) >>> 0 >= ((HEAP32[___async_retval >> 2] | 0) - (HEAPU8[$30 + 2 >> 0] | 0) | 0) >>> 0) {
  HEAP32[HEAP32[$0 + 24 >> 2] >> 2] = 0; //@line 10100
 }
 $39 = $30 + ((Math_imul($6 + -32 | 0, $8) | 0) + 4) | 0; //@line 10105
 $40 = HEAP8[$39 >> 0] | 0; //@line 10106
 if ($10 << 24 >> 24) {
  if ($16 << 24 >> 24) {
   $45 = (0 >>> 3 & 31) + 1 | 0; //@line 10113
   $47 = 1 << 0; //@line 10115
   $48 = 0 + $20 | 0; //@line 10116
   $58 = HEAP32[(HEAP32[$18 >> 2] | 0) + 124 >> 2] | 0; //@line 10126
   $59 = 0 + $24 | 0; //@line 10127
   if (!($47 & (HEAPU8[$39 + ($45 + 0) >> 0] | 0))) {
    $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 10129
    FUNCTION_TABLE_viiii[$58 & 7]($18, $59, $48, 0); //@line 10130
    if (___async) {
     HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 10133
     $75 = $ReallocAsyncCtx4 + 4 | 0; //@line 10134
     HEAP32[$75 >> 2] = 0; //@line 10135
     $76 = $ReallocAsyncCtx4 + 8 | 0; //@line 10136
     HEAP32[$76 >> 2] = $26; //@line 10137
     $77 = $ReallocAsyncCtx4 + 12 | 0; //@line 10138
     HEAP32[$77 >> 2] = 0; //@line 10139
     $78 = $ReallocAsyncCtx4 + 16 | 0; //@line 10140
     HEAP32[$78 >> 2] = $28; //@line 10141
     $79 = $ReallocAsyncCtx4 + 20 | 0; //@line 10142
     HEAP32[$79 >> 2] = $22; //@line 10143
     $80 = $ReallocAsyncCtx4 + 24 | 0; //@line 10144
     HEAP32[$80 >> 2] = $45; //@line 10145
     $81 = $ReallocAsyncCtx4 + 28 | 0; //@line 10146
     HEAP32[$81 >> 2] = $39; //@line 10147
     $82 = $ReallocAsyncCtx4 + 32 | 0; //@line 10148
     HEAP32[$82 >> 2] = $47; //@line 10149
     $83 = $ReallocAsyncCtx4 + 36 | 0; //@line 10150
     HEAP32[$83 >> 2] = $18; //@line 10151
     $84 = $ReallocAsyncCtx4 + 40 | 0; //@line 10152
     HEAP32[$84 >> 2] = $24; //@line 10153
     $85 = $ReallocAsyncCtx4 + 44 | 0; //@line 10154
     HEAP32[$85 >> 2] = $18; //@line 10155
     $86 = $ReallocAsyncCtx4 + 48 | 0; //@line 10156
     HEAP32[$86 >> 2] = $48; //@line 10157
     $87 = $ReallocAsyncCtx4 + 52 | 0; //@line 10158
     HEAP8[$87 >> 0] = $40; //@line 10159
     $88 = $ReallocAsyncCtx4 + 56 | 0; //@line 10160
     HEAP32[$88 >> 2] = $14; //@line 10161
     $89 = $ReallocAsyncCtx4 + 60 | 0; //@line 10162
     HEAP32[$89 >> 2] = $20; //@line 10163
     sp = STACKTOP; //@line 10164
     return;
    }
    ___async_unwind = 0; //@line 10167
    HEAP32[$ReallocAsyncCtx4 >> 2] = 124; //@line 10168
    $75 = $ReallocAsyncCtx4 + 4 | 0; //@line 10169
    HEAP32[$75 >> 2] = 0; //@line 10170
    $76 = $ReallocAsyncCtx4 + 8 | 0; //@line 10171
    HEAP32[$76 >> 2] = $26; //@line 10172
    $77 = $ReallocAsyncCtx4 + 12 | 0; //@line 10173
    HEAP32[$77 >> 2] = 0; //@line 10174
    $78 = $ReallocAsyncCtx4 + 16 | 0; //@line 10175
    HEAP32[$78 >> 2] = $28; //@line 10176
    $79 = $ReallocAsyncCtx4 + 20 | 0; //@line 10177
    HEAP32[$79 >> 2] = $22; //@line 10178
    $80 = $ReallocAsyncCtx4 + 24 | 0; //@line 10179
    HEAP32[$80 >> 2] = $45; //@line 10180
    $81 = $ReallocAsyncCtx4 + 28 | 0; //@line 10181
    HEAP32[$81 >> 2] = $39; //@line 10182
    $82 = $ReallocAsyncCtx4 + 32 | 0; //@line 10183
    HEAP32[$82 >> 2] = $47; //@line 10184
    $83 = $ReallocAsyncCtx4 + 36 | 0; //@line 10185
    HEAP32[$83 >> 2] = $18; //@line 10186
    $84 = $ReallocAsyncCtx4 + 40 | 0; //@line 10187
    HEAP32[$84 >> 2] = $24; //@line 10188
    $85 = $ReallocAsyncCtx4 + 44 | 0; //@line 10189
    HEAP32[$85 >> 2] = $18; //@line 10190
    $86 = $ReallocAsyncCtx4 + 48 | 0; //@line 10191
    HEAP32[$86 >> 2] = $48; //@line 10192
    $87 = $ReallocAsyncCtx4 + 52 | 0; //@line 10193
    HEAP8[$87 >> 0] = $40; //@line 10194
    $88 = $ReallocAsyncCtx4 + 56 | 0; //@line 10195
    HEAP32[$88 >> 2] = $14; //@line 10196
    $89 = $ReallocAsyncCtx4 + 60 | 0; //@line 10197
    HEAP32[$89 >> 2] = $20; //@line 10198
    sp = STACKTOP; //@line 10199
    return;
   } else {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 10202
    FUNCTION_TABLE_viiii[$58 & 7]($18, $59, $48, 1); //@line 10203
    if (___async) {
     HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 10206
     $60 = $ReallocAsyncCtx3 + 4 | 0; //@line 10207
     HEAP32[$60 >> 2] = 0; //@line 10208
     $61 = $ReallocAsyncCtx3 + 8 | 0; //@line 10209
     HEAP32[$61 >> 2] = $26; //@line 10210
     $62 = $ReallocAsyncCtx3 + 12 | 0; //@line 10211
     HEAP32[$62 >> 2] = 0; //@line 10212
     $63 = $ReallocAsyncCtx3 + 16 | 0; //@line 10213
     HEAP32[$63 >> 2] = $28; //@line 10214
     $64 = $ReallocAsyncCtx3 + 20 | 0; //@line 10215
     HEAP32[$64 >> 2] = $22; //@line 10216
     $65 = $ReallocAsyncCtx3 + 24 | 0; //@line 10217
     HEAP32[$65 >> 2] = $45; //@line 10218
     $66 = $ReallocAsyncCtx3 + 28 | 0; //@line 10219
     HEAP32[$66 >> 2] = $39; //@line 10220
     $67 = $ReallocAsyncCtx3 + 32 | 0; //@line 10221
     HEAP32[$67 >> 2] = $47; //@line 10222
     $68 = $ReallocAsyncCtx3 + 36 | 0; //@line 10223
     HEAP32[$68 >> 2] = $18; //@line 10224
     $69 = $ReallocAsyncCtx3 + 40 | 0; //@line 10225
     HEAP32[$69 >> 2] = $24; //@line 10226
     $70 = $ReallocAsyncCtx3 + 44 | 0; //@line 10227
     HEAP32[$70 >> 2] = $18; //@line 10228
     $71 = $ReallocAsyncCtx3 + 48 | 0; //@line 10229
     HEAP32[$71 >> 2] = $48; //@line 10230
     $72 = $ReallocAsyncCtx3 + 52 | 0; //@line 10231
     HEAP8[$72 >> 0] = $40; //@line 10232
     $73 = $ReallocAsyncCtx3 + 56 | 0; //@line 10233
     HEAP32[$73 >> 2] = $14; //@line 10234
     $74 = $ReallocAsyncCtx3 + 60 | 0; //@line 10235
     HEAP32[$74 >> 2] = $20; //@line 10236
     sp = STACKTOP; //@line 10237
     return;
    }
    ___async_unwind = 0; //@line 10240
    HEAP32[$ReallocAsyncCtx3 >> 2] = 123; //@line 10241
    $60 = $ReallocAsyncCtx3 + 4 | 0; //@line 10242
    HEAP32[$60 >> 2] = 0; //@line 10243
    $61 = $ReallocAsyncCtx3 + 8 | 0; //@line 10244
    HEAP32[$61 >> 2] = $26; //@line 10245
    $62 = $ReallocAsyncCtx3 + 12 | 0; //@line 10246
    HEAP32[$62 >> 2] = 0; //@line 10247
    $63 = $ReallocAsyncCtx3 + 16 | 0; //@line 10248
    HEAP32[$63 >> 2] = $28; //@line 10249
    $64 = $ReallocAsyncCtx3 + 20 | 0; //@line 10250
    HEAP32[$64 >> 2] = $22; //@line 10251
    $65 = $ReallocAsyncCtx3 + 24 | 0; //@line 10252
    HEAP32[$65 >> 2] = $45; //@line 10253
    $66 = $ReallocAsyncCtx3 + 28 | 0; //@line 10254
    HEAP32[$66 >> 2] = $39; //@line 10255
    $67 = $ReallocAsyncCtx3 + 32 | 0; //@line 10256
    HEAP32[$67 >> 2] = $47; //@line 10257
    $68 = $ReallocAsyncCtx3 + 36 | 0; //@line 10258
    HEAP32[$68 >> 2] = $18; //@line 10259
    $69 = $ReallocAsyncCtx3 + 40 | 0; //@line 10260
    HEAP32[$69 >> 2] = $24; //@line 10261
    $70 = $ReallocAsyncCtx3 + 44 | 0; //@line 10262
    HEAP32[$70 >> 2] = $18; //@line 10263
    $71 = $ReallocAsyncCtx3 + 48 | 0; //@line 10264
    HEAP32[$71 >> 2] = $48; //@line 10265
    $72 = $ReallocAsyncCtx3 + 52 | 0; //@line 10266
    HEAP8[$72 >> 0] = $40; //@line 10267
    $73 = $ReallocAsyncCtx3 + 56 | 0; //@line 10268
    HEAP32[$73 >> 2] = $14; //@line 10269
    $74 = $ReallocAsyncCtx3 + 60 | 0; //@line 10270
    HEAP32[$74 >> 2] = $20; //@line 10271
    sp = STACKTOP; //@line 10272
    return;
   }
  }
 }
 HEAP32[$14 >> 2] = (HEAP32[$14 >> 2] | 0) + ($40 & 255); //@line 10280
 return;
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1995
 STACKTOP = STACKTOP + 32 | 0; //@line 1996
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 1996
 $0 = sp; //@line 1997
 _gpio_init_out($0, 50); //@line 1998
 while (1) {
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2001
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2002
  _wait_ms(150); //@line 2003
  if (___async) {
   label = 3; //@line 2006
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 2009
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2011
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2012
  _wait_ms(150); //@line 2013
  if (___async) {
   label = 5; //@line 2016
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 2019
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2021
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2022
  _wait_ms(150); //@line 2023
  if (___async) {
   label = 7; //@line 2026
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 2029
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2031
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2032
  _wait_ms(150); //@line 2033
  if (___async) {
   label = 9; //@line 2036
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 2039
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2041
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2042
  _wait_ms(150); //@line 2043
  if (___async) {
   label = 11; //@line 2046
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 2049
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2051
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2052
  _wait_ms(150); //@line 2053
  if (___async) {
   label = 13; //@line 2056
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 2059
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2061
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2062
  _wait_ms(150); //@line 2063
  if (___async) {
   label = 15; //@line 2066
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 2069
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2071
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2072
  _wait_ms(150); //@line 2073
  if (___async) {
   label = 17; //@line 2076
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 2079
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2081
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2082
  _wait_ms(400); //@line 2083
  if (___async) {
   label = 19; //@line 2086
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 2089
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2091
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2092
  _wait_ms(400); //@line 2093
  if (___async) {
   label = 21; //@line 2096
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 2099
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2101
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2102
  _wait_ms(400); //@line 2103
  if (___async) {
   label = 23; //@line 2106
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 2109
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2111
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2112
  _wait_ms(400); //@line 2113
  if (___async) {
   label = 25; //@line 2116
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 2119
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2121
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2122
  _wait_ms(400); //@line 2123
  if (___async) {
   label = 27; //@line 2126
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 2129
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2131
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2132
  _wait_ms(400); //@line 2133
  if (___async) {
   label = 29; //@line 2136
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2139
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 2141
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2142
  _wait_ms(400); //@line 2143
  if (___async) {
   label = 31; //@line 2146
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2149
  _emscripten_asm_const_iii(2, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 2151
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2152
  _wait_ms(400); //@line 2153
  if (___async) {
   label = 33; //@line 2156
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2159
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 86; //@line 2163
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 2165
   sp = STACKTOP; //@line 2166
   STACKTOP = sp; //@line 2167
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 87; //@line 2171
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 2173
   sp = STACKTOP; //@line 2174
   STACKTOP = sp; //@line 2175
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 88; //@line 2179
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 2181
   sp = STACKTOP; //@line 2182
   STACKTOP = sp; //@line 2183
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 89; //@line 2187
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 2189
   sp = STACKTOP; //@line 2190
   STACKTOP = sp; //@line 2191
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 90; //@line 2195
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 2197
   sp = STACKTOP; //@line 2198
   STACKTOP = sp; //@line 2199
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 91; //@line 2203
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 2205
   sp = STACKTOP; //@line 2206
   STACKTOP = sp; //@line 2207
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 92; //@line 2211
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 2213
   sp = STACKTOP; //@line 2214
   STACKTOP = sp; //@line 2215
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 93; //@line 2219
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 2221
   sp = STACKTOP; //@line 2222
   STACKTOP = sp; //@line 2223
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 94; //@line 2227
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 2229
   sp = STACKTOP; //@line 2230
   STACKTOP = sp; //@line 2231
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 95; //@line 2235
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 2237
   sp = STACKTOP; //@line 2238
   STACKTOP = sp; //@line 2239
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 96; //@line 2243
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 2245
   sp = STACKTOP; //@line 2246
   STACKTOP = sp; //@line 2247
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 97; //@line 2251
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 2253
   sp = STACKTOP; //@line 2254
   STACKTOP = sp; //@line 2255
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 98; //@line 2259
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 2261
   sp = STACKTOP; //@line 2262
   STACKTOP = sp; //@line 2263
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 99; //@line 2267
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 2269
   sp = STACKTOP; //@line 2270
   STACKTOP = sp; //@line 2271
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 100; //@line 2275
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2277
   sp = STACKTOP; //@line 2278
   STACKTOP = sp; //@line 2279
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 101; //@line 2283
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2285
   sp = STACKTOP; //@line 2286
   STACKTOP = sp; //@line 2287
   return;
  }
 }
}
function __ZN6C128329characterEiii($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$04142$us = 0, $$043$us = 0, $10 = 0, $11 = 0, $122 = 0, $123 = 0, $13 = 0, $14 = 0, $17 = 0, $18 = 0, $20 = 0, $23 = 0, $24 = 0, $40 = 0, $42 = 0, $45 = 0, $46 = 0, $5 = 0, $6 = 0, $61 = 0, $70 = 0, $71 = 0, $72 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $87 = 0, $90 = 0, $91 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3058
 if (($3 + -31 | 0) >>> 0 > 96) {
  return;
 }
 $5 = $0 + 48 | 0; //@line 3064
 $6 = HEAP32[$5 >> 2] | 0; //@line 3065
 $8 = HEAPU8[$6 >> 0] | 0; //@line 3067
 $10 = HEAP8[$6 + 1 >> 0] | 0; //@line 3069
 $11 = $10 & 255; //@line 3070
 $13 = HEAP8[$6 + 2 >> 0] | 0; //@line 3072
 $14 = $13 & 255; //@line 3073
 $17 = HEAPU8[$6 + 3 >> 0] | 0; //@line 3076
 $18 = $0 + 60 | 0; //@line 3077
 $20 = (HEAP32[$18 >> 2] | 0) + $11 | 0; //@line 3079
 $23 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 3082
 $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 3083
 $24 = FUNCTION_TABLE_ii[$23 & 31]($0) | 0; //@line 3084
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 121; //@line 3087
  HEAP32[$AsyncCtx + 4 >> 2] = $5; //@line 3089
  HEAP32[$AsyncCtx + 8 >> 2] = $18; //@line 3091
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 3093
  HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 3095
  HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 3097
  HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 3099
  HEAP32[$AsyncCtx + 28 >> 2] = $8; //@line 3101
  HEAP8[$AsyncCtx + 32 >> 0] = $13; //@line 3103
  HEAP32[$AsyncCtx + 36 >> 2] = $20; //@line 3105
  HEAP32[$AsyncCtx + 40 >> 2] = $11; //@line 3107
  HEAP8[$AsyncCtx + 44 >> 0] = $10; //@line 3109
  HEAP32[$AsyncCtx + 48 >> 2] = $2; //@line 3111
  HEAP32[$AsyncCtx + 52 >> 2] = $17; //@line 3113
  HEAP32[$AsyncCtx + 56 >> 2] = $1; //@line 3115
  sp = STACKTOP; //@line 3116
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3119
 if ($20 >>> 0 > $24 >>> 0) {
  HEAP32[$18 >> 2] = 0; //@line 3122
  $40 = $0 + 64 | 0; //@line 3123
  $42 = (HEAP32[$40 >> 2] | 0) + $14 | 0; //@line 3125
  HEAP32[$40 >> 2] = $42; //@line 3126
  $45 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 3129
  $AsyncCtx3 = _emscripten_alloc_async_context(60, sp) | 0; //@line 3130
  $46 = FUNCTION_TABLE_ii[$45 & 31]($0) | 0; //@line 3131
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 122; //@line 3134
   HEAP32[$AsyncCtx3 + 4 >> 2] = $5; //@line 3136
   HEAP32[$AsyncCtx3 + 8 >> 2] = $42; //@line 3138
   HEAP32[$AsyncCtx3 + 12 >> 2] = $3; //@line 3140
   HEAP32[$AsyncCtx3 + 16 >> 2] = $8; //@line 3142
   HEAP8[$AsyncCtx3 + 20 >> 0] = $13; //@line 3144
   HEAP32[$AsyncCtx3 + 24 >> 2] = $40; //@line 3146
   HEAP32[$AsyncCtx3 + 28 >> 2] = $18; //@line 3148
   HEAP8[$AsyncCtx3 + 32 >> 0] = $10; //@line 3150
   HEAP32[$AsyncCtx3 + 36 >> 2] = $0; //@line 3152
   HEAP32[$AsyncCtx3 + 40 >> 2] = $2; //@line 3154
   HEAP32[$AsyncCtx3 + 44 >> 2] = $17; //@line 3156
   HEAP32[$AsyncCtx3 + 48 >> 2] = $1; //@line 3158
   HEAP32[$AsyncCtx3 + 52 >> 2] = $11; //@line 3160
   HEAP32[$AsyncCtx3 + 56 >> 2] = $14; //@line 3162
   sp = STACKTOP; //@line 3163
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3166
  $61 = HEAP32[$5 >> 2] | 0; //@line 3167
  if ($42 >>> 0 < ($46 - (HEAPU8[$61 + 2 >> 0] | 0) | 0) >>> 0) {
   $71 = $61; //@line 3174
  } else {
   HEAP32[$40 >> 2] = 0; //@line 3176
   $71 = $61; //@line 3177
  }
 } else {
  $71 = HEAP32[$5 >> 2] | 0; //@line 3181
 }
 $70 = $71 + ((Math_imul($3 + -32 | 0, $8) | 0) + 4) | 0; //@line 3186
 $72 = HEAP8[$70 >> 0] | 0; //@line 3187
 L15 : do {
  if ($13 << 24 >> 24) {
   if ($10 << 24 >> 24) {
    $$043$us = 0; //@line 3193
    L17 : while (1) {
     $77 = ($$043$us >>> 3 & 31) + 1 | 0; //@line 3197
     $79 = 1 << ($$043$us & 7); //@line 3199
     $80 = $$043$us + $2 | 0; //@line 3200
     $$04142$us = 0; //@line 3201
     while (1) {
      $87 = ($79 & (HEAPU8[$70 + ($77 + (Math_imul($$04142$us, $17) | 0)) >> 0] | 0) | 0) == 0; //@line 3209
      $90 = HEAP32[(HEAP32[$0 >> 2] | 0) + 124 >> 2] | 0; //@line 3212
      $91 = $$04142$us + $1 | 0; //@line 3213
      if ($87) {
       $AsyncCtx11 = _emscripten_alloc_async_context(64, sp) | 0; //@line 3215
       FUNCTION_TABLE_viiii[$90 & 7]($0, $91, $80, 0); //@line 3216
       if (___async) {
        label = 18; //@line 3219
        break L17;
       }
       _emscripten_free_async_context($AsyncCtx11 | 0); //@line 3222
      } else {
       $AsyncCtx7 = _emscripten_alloc_async_context(64, sp) | 0; //@line 3224
       FUNCTION_TABLE_viiii[$90 & 7]($0, $91, $80, 1); //@line 3225
       if (___async) {
        label = 15; //@line 3228
        break L17;
       }
       _emscripten_free_async_context($AsyncCtx7 | 0); //@line 3231
      }
      $122 = $$04142$us + 1 | 0; //@line 3233
      if (($122 | 0) == ($11 | 0)) {
       break;
      } else {
       $$04142$us = $122; //@line 3238
      }
     }
     $123 = $$043$us + 1 | 0; //@line 3241
     if (($123 | 0) == ($14 | 0)) {
      break L15;
     } else {
      $$043$us = $123; //@line 3246
     }
    }
    if ((label | 0) == 15) {
     HEAP32[$AsyncCtx7 >> 2] = 123; //@line 3250
     HEAP32[$AsyncCtx7 + 4 >> 2] = $$04142$us; //@line 3252
     HEAP32[$AsyncCtx7 + 8 >> 2] = $11; //@line 3254
     HEAP32[$AsyncCtx7 + 12 >> 2] = $$043$us; //@line 3256
     HEAP32[$AsyncCtx7 + 16 >> 2] = $14; //@line 3258
     HEAP32[$AsyncCtx7 + 20 >> 2] = $17; //@line 3260
     HEAP32[$AsyncCtx7 + 24 >> 2] = $77; //@line 3262
     HEAP32[$AsyncCtx7 + 28 >> 2] = $70; //@line 3264
     HEAP32[$AsyncCtx7 + 32 >> 2] = $79; //@line 3266
     HEAP32[$AsyncCtx7 + 36 >> 2] = $0; //@line 3268
     HEAP32[$AsyncCtx7 + 40 >> 2] = $1; //@line 3270
     HEAP32[$AsyncCtx7 + 44 >> 2] = $0; //@line 3272
     HEAP32[$AsyncCtx7 + 48 >> 2] = $80; //@line 3274
     HEAP8[$AsyncCtx7 + 52 >> 0] = $72; //@line 3276
     HEAP32[$AsyncCtx7 + 56 >> 2] = $18; //@line 3278
     HEAP32[$AsyncCtx7 + 60 >> 2] = $2; //@line 3280
     sp = STACKTOP; //@line 3281
     return;
    } else if ((label | 0) == 18) {
     HEAP32[$AsyncCtx11 >> 2] = 124; //@line 3285
     HEAP32[$AsyncCtx11 + 4 >> 2] = $$04142$us; //@line 3287
     HEAP32[$AsyncCtx11 + 8 >> 2] = $11; //@line 3289
     HEAP32[$AsyncCtx11 + 12 >> 2] = $$043$us; //@line 3291
     HEAP32[$AsyncCtx11 + 16 >> 2] = $14; //@line 3293
     HEAP32[$AsyncCtx11 + 20 >> 2] = $17; //@line 3295
     HEAP32[$AsyncCtx11 + 24 >> 2] = $77; //@line 3297
     HEAP32[$AsyncCtx11 + 28 >> 2] = $70; //@line 3299
     HEAP32[$AsyncCtx11 + 32 >> 2] = $79; //@line 3301
     HEAP32[$AsyncCtx11 + 36 >> 2] = $0; //@line 3303
     HEAP32[$AsyncCtx11 + 40 >> 2] = $1; //@line 3305
     HEAP32[$AsyncCtx11 + 44 >> 2] = $0; //@line 3307
     HEAP32[$AsyncCtx11 + 48 >> 2] = $80; //@line 3309
     HEAP8[$AsyncCtx11 + 52 >> 0] = $72; //@line 3311
     HEAP32[$AsyncCtx11 + 56 >> 2] = $18; //@line 3313
     HEAP32[$AsyncCtx11 + 60 >> 2] = $2; //@line 3315
     sp = STACKTOP; //@line 3316
     return;
    }
   }
  }
 } while (0);
 HEAP32[$18 >> 2] = (HEAP32[$18 >> 2] | 0) + ($72 & 255); //@line 3325
 return;
}
function __ZN6C128328print_bmE6Bitmapii__async_cb_20($0) {
 $0 = $0 | 0;
 var $$02225$us$reg2mem$0 = 0, $$02225$us$reg2mem$1 = 0, $$023$us30 = 0, $$reg2mem$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $24 = 0, $26 = 0, $4 = 0, $40 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5066
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5070
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5072
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5074
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5076
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5078
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 5080
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 5082
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 5084
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 5086
 $66 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 5089
 if (($66 | 0) < ($4 | 0)) {
  $$02225$us$reg2mem$0 = $8; //@line 5092
  $$023$us30 = $66; //@line 5092
  $$reg2mem$0 = HEAP32[$0 + 44 >> 2] | 0; //@line 5092
  label = 3; //@line 5093
 } else {
  $$02225$us$reg2mem$1 = $8; //@line 5095
 }
 while (1) {
  if ((label | 0) == 3) {
   label = 0; //@line 5099
   $26 = $$023$us30 + $6 | 0; //@line 5100
   if (($26 | 0) > 127) {
    $$02225$us$reg2mem$1 = $$02225$us$reg2mem$0; //@line 5103
   } else {
    break;
   }
  }
  $24 = $$02225$us$reg2mem$1 + 1 | 0; //@line 5108
  if (($24 | 0) >= ($10 | 0)) {
   label = 14; //@line 5111
   break;
  }
  $23 = $24 + $12 | 0; //@line 5114
  if (($23 | 0) > 31) {
   $$02225$us$reg2mem$1 = $24; //@line 5117
  } else {
   $$02225$us$reg2mem$0 = $24; //@line 5119
   $$023$us30 = 0; //@line 5119
   $$reg2mem$0 = $23; //@line 5119
   label = 3; //@line 5120
  }
 }
 if ((label | 0) == 14) {
  return;
 }
 $40 = (128 >>> ($$023$us30 & 7) & HEAP8[(HEAP32[$14 >> 2] | 0) + ((Math_imul(HEAP32[$16 >> 2] | 0, $$02225$us$reg2mem$0) | 0) + ($$023$us30 >>> 3 & 31)) >> 0] | 0) == 0; //@line 5138
 $43 = HEAP32[(HEAP32[$18 >> 2] | 0) + 124 >> 2] | 0; //@line 5141
 if ($40) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(48) | 0; //@line 5143
  FUNCTION_TABLE_viiii[$43 & 7]($20, $26, $$reg2mem$0, 0); //@line 5144
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 132; //@line 5147
   $55 = $ReallocAsyncCtx2 + 4 | 0; //@line 5148
   HEAP32[$55 >> 2] = $$023$us30; //@line 5149
   $56 = $ReallocAsyncCtx2 + 8 | 0; //@line 5150
   HEAP32[$56 >> 2] = $4; //@line 5151
   $57 = $ReallocAsyncCtx2 + 12 | 0; //@line 5152
   HEAP32[$57 >> 2] = $6; //@line 5153
   $58 = $ReallocAsyncCtx2 + 16 | 0; //@line 5154
   HEAP32[$58 >> 2] = $$02225$us$reg2mem$0; //@line 5155
   $59 = $ReallocAsyncCtx2 + 20 | 0; //@line 5156
   HEAP32[$59 >> 2] = $10; //@line 5157
   $60 = $ReallocAsyncCtx2 + 24 | 0; //@line 5158
   HEAP32[$60 >> 2] = $12; //@line 5159
   $61 = $ReallocAsyncCtx2 + 28 | 0; //@line 5160
   HEAP32[$61 >> 2] = $14; //@line 5161
   $62 = $ReallocAsyncCtx2 + 32 | 0; //@line 5162
   HEAP32[$62 >> 2] = $16; //@line 5163
   $63 = $ReallocAsyncCtx2 + 36 | 0; //@line 5164
   HEAP32[$63 >> 2] = $18; //@line 5165
   $64 = $ReallocAsyncCtx2 + 40 | 0; //@line 5166
   HEAP32[$64 >> 2] = $20; //@line 5167
   $65 = $ReallocAsyncCtx2 + 44 | 0; //@line 5168
   HEAP32[$65 >> 2] = $$reg2mem$0; //@line 5169
   sp = STACKTOP; //@line 5170
   return;
  }
  ___async_unwind = 0; //@line 5173
  HEAP32[$ReallocAsyncCtx2 >> 2] = 132; //@line 5174
  $55 = $ReallocAsyncCtx2 + 4 | 0; //@line 5175
  HEAP32[$55 >> 2] = $$023$us30; //@line 5176
  $56 = $ReallocAsyncCtx2 + 8 | 0; //@line 5177
  HEAP32[$56 >> 2] = $4; //@line 5178
  $57 = $ReallocAsyncCtx2 + 12 | 0; //@line 5179
  HEAP32[$57 >> 2] = $6; //@line 5180
  $58 = $ReallocAsyncCtx2 + 16 | 0; //@line 5181
  HEAP32[$58 >> 2] = $$02225$us$reg2mem$0; //@line 5182
  $59 = $ReallocAsyncCtx2 + 20 | 0; //@line 5183
  HEAP32[$59 >> 2] = $10; //@line 5184
  $60 = $ReallocAsyncCtx2 + 24 | 0; //@line 5185
  HEAP32[$60 >> 2] = $12; //@line 5186
  $61 = $ReallocAsyncCtx2 + 28 | 0; //@line 5187
  HEAP32[$61 >> 2] = $14; //@line 5188
  $62 = $ReallocAsyncCtx2 + 32 | 0; //@line 5189
  HEAP32[$62 >> 2] = $16; //@line 5190
  $63 = $ReallocAsyncCtx2 + 36 | 0; //@line 5191
  HEAP32[$63 >> 2] = $18; //@line 5192
  $64 = $ReallocAsyncCtx2 + 40 | 0; //@line 5193
  HEAP32[$64 >> 2] = $20; //@line 5194
  $65 = $ReallocAsyncCtx2 + 44 | 0; //@line 5195
  HEAP32[$65 >> 2] = $$reg2mem$0; //@line 5196
  sp = STACKTOP; //@line 5197
  return;
 } else {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(48) | 0; //@line 5200
  FUNCTION_TABLE_viiii[$43 & 7]($20, $26, $$reg2mem$0, 1); //@line 5201
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 131; //@line 5204
   $44 = $ReallocAsyncCtx + 4 | 0; //@line 5205
   HEAP32[$44 >> 2] = $$023$us30; //@line 5206
   $45 = $ReallocAsyncCtx + 8 | 0; //@line 5207
   HEAP32[$45 >> 2] = $4; //@line 5208
   $46 = $ReallocAsyncCtx + 12 | 0; //@line 5209
   HEAP32[$46 >> 2] = $6; //@line 5210
   $47 = $ReallocAsyncCtx + 16 | 0; //@line 5211
   HEAP32[$47 >> 2] = $$02225$us$reg2mem$0; //@line 5212
   $48 = $ReallocAsyncCtx + 20 | 0; //@line 5213
   HEAP32[$48 >> 2] = $10; //@line 5214
   $49 = $ReallocAsyncCtx + 24 | 0; //@line 5215
   HEAP32[$49 >> 2] = $12; //@line 5216
   $50 = $ReallocAsyncCtx + 28 | 0; //@line 5217
   HEAP32[$50 >> 2] = $14; //@line 5218
   $51 = $ReallocAsyncCtx + 32 | 0; //@line 5219
   HEAP32[$51 >> 2] = $16; //@line 5220
   $52 = $ReallocAsyncCtx + 36 | 0; //@line 5221
   HEAP32[$52 >> 2] = $18; //@line 5222
   $53 = $ReallocAsyncCtx + 40 | 0; //@line 5223
   HEAP32[$53 >> 2] = $20; //@line 5224
   $54 = $ReallocAsyncCtx + 44 | 0; //@line 5225
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 5226
   sp = STACKTOP; //@line 5227
   return;
  }
  ___async_unwind = 0; //@line 5230
  HEAP32[$ReallocAsyncCtx >> 2] = 131; //@line 5231
  $44 = $ReallocAsyncCtx + 4 | 0; //@line 5232
  HEAP32[$44 >> 2] = $$023$us30; //@line 5233
  $45 = $ReallocAsyncCtx + 8 | 0; //@line 5234
  HEAP32[$45 >> 2] = $4; //@line 5235
  $46 = $ReallocAsyncCtx + 12 | 0; //@line 5236
  HEAP32[$46 >> 2] = $6; //@line 5237
  $47 = $ReallocAsyncCtx + 16 | 0; //@line 5238
  HEAP32[$47 >> 2] = $$02225$us$reg2mem$0; //@line 5239
  $48 = $ReallocAsyncCtx + 20 | 0; //@line 5240
  HEAP32[$48 >> 2] = $10; //@line 5241
  $49 = $ReallocAsyncCtx + 24 | 0; //@line 5242
  HEAP32[$49 >> 2] = $12; //@line 5243
  $50 = $ReallocAsyncCtx + 28 | 0; //@line 5244
  HEAP32[$50 >> 2] = $14; //@line 5245
  $51 = $ReallocAsyncCtx + 32 | 0; //@line 5246
  HEAP32[$51 >> 2] = $16; //@line 5247
  $52 = $ReallocAsyncCtx + 36 | 0; //@line 5248
  HEAP32[$52 >> 2] = $18; //@line 5249
  $53 = $ReallocAsyncCtx + 40 | 0; //@line 5250
  HEAP32[$53 >> 2] = $20; //@line 5251
  $54 = $ReallocAsyncCtx + 44 | 0; //@line 5252
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 5253
  sp = STACKTOP; //@line 5254
  return;
 }
}
function __ZN6C128328print_bmE6Bitmapii__async_cb($0) {
 $0 = $0 | 0;
 var $$02225$us$reg2mem$0 = 0, $$02225$us$reg2mem$1 = 0, $$023$us30 = 0, $$reg2mem$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $24 = 0, $26 = 0, $4 = 0, $40 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4868
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4872
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4874
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4876
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4878
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4880
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4882
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4884
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4886
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 4888
 $66 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 4891
 if (($66 | 0) < ($4 | 0)) {
  $$02225$us$reg2mem$0 = $8; //@line 4894
  $$023$us30 = $66; //@line 4894
  $$reg2mem$0 = HEAP32[$0 + 44 >> 2] | 0; //@line 4894
  label = 3; //@line 4895
 } else {
  $$02225$us$reg2mem$1 = $8; //@line 4897
 }
 while (1) {
  if ((label | 0) == 3) {
   label = 0; //@line 4901
   $26 = $$023$us30 + $6 | 0; //@line 4902
   if (($26 | 0) > 127) {
    $$02225$us$reg2mem$1 = $$02225$us$reg2mem$0; //@line 4905
   } else {
    break;
   }
  }
  $24 = $$02225$us$reg2mem$1 + 1 | 0; //@line 4910
  if (($24 | 0) >= ($10 | 0)) {
   label = 14; //@line 4913
   break;
  }
  $23 = $24 + $12 | 0; //@line 4916
  if (($23 | 0) > 31) {
   $$02225$us$reg2mem$1 = $24; //@line 4919
  } else {
   $$02225$us$reg2mem$0 = $24; //@line 4921
   $$023$us30 = 0; //@line 4921
   $$reg2mem$0 = $23; //@line 4921
   label = 3; //@line 4922
  }
 }
 if ((label | 0) == 14) {
  return;
 }
 $40 = (128 >>> ($$023$us30 & 7) & HEAP8[(HEAP32[$14 >> 2] | 0) + ((Math_imul(HEAP32[$16 >> 2] | 0, $$02225$us$reg2mem$0) | 0) + ($$023$us30 >>> 3 & 31)) >> 0] | 0) == 0; //@line 4940
 $43 = HEAP32[(HEAP32[$18 >> 2] | 0) + 124 >> 2] | 0; //@line 4943
 if ($40) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(48) | 0; //@line 4945
  FUNCTION_TABLE_viiii[$43 & 7]($20, $26, $$reg2mem$0, 0); //@line 4946
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 132; //@line 4949
   $55 = $ReallocAsyncCtx2 + 4 | 0; //@line 4950
   HEAP32[$55 >> 2] = $$023$us30; //@line 4951
   $56 = $ReallocAsyncCtx2 + 8 | 0; //@line 4952
   HEAP32[$56 >> 2] = $4; //@line 4953
   $57 = $ReallocAsyncCtx2 + 12 | 0; //@line 4954
   HEAP32[$57 >> 2] = $6; //@line 4955
   $58 = $ReallocAsyncCtx2 + 16 | 0; //@line 4956
   HEAP32[$58 >> 2] = $$02225$us$reg2mem$0; //@line 4957
   $59 = $ReallocAsyncCtx2 + 20 | 0; //@line 4958
   HEAP32[$59 >> 2] = $10; //@line 4959
   $60 = $ReallocAsyncCtx2 + 24 | 0; //@line 4960
   HEAP32[$60 >> 2] = $12; //@line 4961
   $61 = $ReallocAsyncCtx2 + 28 | 0; //@line 4962
   HEAP32[$61 >> 2] = $14; //@line 4963
   $62 = $ReallocAsyncCtx2 + 32 | 0; //@line 4964
   HEAP32[$62 >> 2] = $16; //@line 4965
   $63 = $ReallocAsyncCtx2 + 36 | 0; //@line 4966
   HEAP32[$63 >> 2] = $18; //@line 4967
   $64 = $ReallocAsyncCtx2 + 40 | 0; //@line 4968
   HEAP32[$64 >> 2] = $20; //@line 4969
   $65 = $ReallocAsyncCtx2 + 44 | 0; //@line 4970
   HEAP32[$65 >> 2] = $$reg2mem$0; //@line 4971
   sp = STACKTOP; //@line 4972
   return;
  }
  ___async_unwind = 0; //@line 4975
  HEAP32[$ReallocAsyncCtx2 >> 2] = 132; //@line 4976
  $55 = $ReallocAsyncCtx2 + 4 | 0; //@line 4977
  HEAP32[$55 >> 2] = $$023$us30; //@line 4978
  $56 = $ReallocAsyncCtx2 + 8 | 0; //@line 4979
  HEAP32[$56 >> 2] = $4; //@line 4980
  $57 = $ReallocAsyncCtx2 + 12 | 0; //@line 4981
  HEAP32[$57 >> 2] = $6; //@line 4982
  $58 = $ReallocAsyncCtx2 + 16 | 0; //@line 4983
  HEAP32[$58 >> 2] = $$02225$us$reg2mem$0; //@line 4984
  $59 = $ReallocAsyncCtx2 + 20 | 0; //@line 4985
  HEAP32[$59 >> 2] = $10; //@line 4986
  $60 = $ReallocAsyncCtx2 + 24 | 0; //@line 4987
  HEAP32[$60 >> 2] = $12; //@line 4988
  $61 = $ReallocAsyncCtx2 + 28 | 0; //@line 4989
  HEAP32[$61 >> 2] = $14; //@line 4990
  $62 = $ReallocAsyncCtx2 + 32 | 0; //@line 4991
  HEAP32[$62 >> 2] = $16; //@line 4992
  $63 = $ReallocAsyncCtx2 + 36 | 0; //@line 4993
  HEAP32[$63 >> 2] = $18; //@line 4994
  $64 = $ReallocAsyncCtx2 + 40 | 0; //@line 4995
  HEAP32[$64 >> 2] = $20; //@line 4996
  $65 = $ReallocAsyncCtx2 + 44 | 0; //@line 4997
  HEAP32[$65 >> 2] = $$reg2mem$0; //@line 4998
  sp = STACKTOP; //@line 4999
  return;
 } else {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(48) | 0; //@line 5002
  FUNCTION_TABLE_viiii[$43 & 7]($20, $26, $$reg2mem$0, 1); //@line 5003
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 131; //@line 5006
   $44 = $ReallocAsyncCtx + 4 | 0; //@line 5007
   HEAP32[$44 >> 2] = $$023$us30; //@line 5008
   $45 = $ReallocAsyncCtx + 8 | 0; //@line 5009
   HEAP32[$45 >> 2] = $4; //@line 5010
   $46 = $ReallocAsyncCtx + 12 | 0; //@line 5011
   HEAP32[$46 >> 2] = $6; //@line 5012
   $47 = $ReallocAsyncCtx + 16 | 0; //@line 5013
   HEAP32[$47 >> 2] = $$02225$us$reg2mem$0; //@line 5014
   $48 = $ReallocAsyncCtx + 20 | 0; //@line 5015
   HEAP32[$48 >> 2] = $10; //@line 5016
   $49 = $ReallocAsyncCtx + 24 | 0; //@line 5017
   HEAP32[$49 >> 2] = $12; //@line 5018
   $50 = $ReallocAsyncCtx + 28 | 0; //@line 5019
   HEAP32[$50 >> 2] = $14; //@line 5020
   $51 = $ReallocAsyncCtx + 32 | 0; //@line 5021
   HEAP32[$51 >> 2] = $16; //@line 5022
   $52 = $ReallocAsyncCtx + 36 | 0; //@line 5023
   HEAP32[$52 >> 2] = $18; //@line 5024
   $53 = $ReallocAsyncCtx + 40 | 0; //@line 5025
   HEAP32[$53 >> 2] = $20; //@line 5026
   $54 = $ReallocAsyncCtx + 44 | 0; //@line 5027
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 5028
   sp = STACKTOP; //@line 5029
   return;
  }
  ___async_unwind = 0; //@line 5032
  HEAP32[$ReallocAsyncCtx >> 2] = 131; //@line 5033
  $44 = $ReallocAsyncCtx + 4 | 0; //@line 5034
  HEAP32[$44 >> 2] = $$023$us30; //@line 5035
  $45 = $ReallocAsyncCtx + 8 | 0; //@line 5036
  HEAP32[$45 >> 2] = $4; //@line 5037
  $46 = $ReallocAsyncCtx + 12 | 0; //@line 5038
  HEAP32[$46 >> 2] = $6; //@line 5039
  $47 = $ReallocAsyncCtx + 16 | 0; //@line 5040
  HEAP32[$47 >> 2] = $$02225$us$reg2mem$0; //@line 5041
  $48 = $ReallocAsyncCtx + 20 | 0; //@line 5042
  HEAP32[$48 >> 2] = $10; //@line 5043
  $49 = $ReallocAsyncCtx + 24 | 0; //@line 5044
  HEAP32[$49 >> 2] = $12; //@line 5045
  $50 = $ReallocAsyncCtx + 28 | 0; //@line 5046
  HEAP32[$50 >> 2] = $14; //@line 5047
  $51 = $ReallocAsyncCtx + 32 | 0; //@line 5048
  HEAP32[$51 >> 2] = $16; //@line 5049
  $52 = $ReallocAsyncCtx + 36 | 0; //@line 5050
  HEAP32[$52 >> 2] = $18; //@line 5051
  $53 = $ReallocAsyncCtx + 40 | 0; //@line 5052
  HEAP32[$53 >> 2] = $20; //@line 5053
  $54 = $ReallocAsyncCtx + 44 | 0; //@line 5054
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 5055
  sp = STACKTOP; //@line 5056
  return;
 }
}
function _mbed_error($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $13 = 0, $18 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $5 = 0, $AsyncCtx48 = 0, $vararg_buffer = 0, $vararg_buffer11 = 0, $vararg_buffer14 = 0, $vararg_buffer17 = 0, $vararg_buffer20 = 0, $vararg_buffer23 = 0, $vararg_buffer26 = 0, $vararg_buffer29 = 0, $vararg_buffer3 = 0, $vararg_buffer32 = 0, $vararg_buffer35 = 0, $vararg_buffer38 = 0, $vararg_buffer45 = 0, $vararg_buffer5 = 0, $vararg_buffer8 = 0, sp = 0;
 sp = STACKTOP; //@line 2425
 STACKTOP = STACKTOP + 176 | 0; //@line 2426
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(176); //@line 2426
 $vararg_buffer45 = sp + 136 | 0; //@line 2427
 $vararg_buffer38 = sp + 112 | 0; //@line 2428
 $vararg_buffer35 = sp + 104 | 0; //@line 2429
 $vararg_buffer32 = sp + 96 | 0; //@line 2430
 $vararg_buffer29 = sp + 88 | 0; //@line 2431
 $vararg_buffer26 = sp + 80 | 0; //@line 2432
 $vararg_buffer23 = sp + 72 | 0; //@line 2433
 $vararg_buffer20 = sp + 64 | 0; //@line 2434
 $vararg_buffer17 = sp + 56 | 0; //@line 2435
 $vararg_buffer14 = sp + 48 | 0; //@line 2436
 $vararg_buffer11 = sp + 40 | 0; //@line 2437
 $vararg_buffer8 = sp + 32 | 0; //@line 2438
 $vararg_buffer5 = sp + 24 | 0; //@line 2439
 $vararg_buffer3 = sp + 16 | 0; //@line 2440
 $vararg_buffer = sp; //@line 2441
 $5 = sp + 144 | 0; //@line 2442
 if ((HEAP8[14616] | 0) == 1) {
  while (1) {}
 }
 HEAP8[14616] = 1; //@line 2451
 HEAP32[2415] = (HEAP32[2415] | 0) + 1; //@line 2454
 HEAP32[$5 >> 2] = ($0 | 0) > -1 ? -2130771711 : $0; //@line 2455
 HEAP32[$5 + 4 >> 2] = _llvm_returnaddress(0) | 0; //@line 2459
 HEAP32[$5 + 8 >> 2] = $2; //@line 2461
 HEAP32[2416] = HEAP32[$5 >> 2]; //@line 2462
 HEAP32[2417] = HEAP32[$5 + 4 >> 2]; //@line 2462
 HEAP32[2418] = HEAP32[$5 + 8 >> 2]; //@line 2462
 HEAP32[2419] = HEAP32[$5 + 12 >> 2]; //@line 2462
 HEAP32[2420] = HEAP32[$5 + 16 >> 2]; //@line 2462
 HEAP32[2421] = HEAP32[$5 + 20 >> 2]; //@line 2462
 HEAP32[2422] = HEAP32[$5 + 24 >> 2]; //@line 2462
 HEAP32[2423] = HEAP32[$5 + 28 >> 2]; //@line 2462
 _mbed_error_hist_put($5) | 0; //@line 2463
 HEAP8[14616] = 0; //@line 2464
 $13 = HEAP32[2416] | 0; //@line 2465
 $18 = ($13 & 1610612736 | 0) == 1610612736 ? 0 - $13 | 0 : $13 & 65535; //@line 2470
 HEAP32[$vararg_buffer >> 2] = $13; //@line 2473
 HEAP32[$vararg_buffer + 4 >> 2] = $18; //@line 2475
 HEAP32[$vararg_buffer + 8 >> 2] = $13 >>> 16 & 255; //@line 2477
 _mbed_error_printf(2623, $vararg_buffer); //@line 2478
 if (($18 + -317 | 0) >>> 0 < 4) {
  _mbed_error_printf($1, $vararg_buffer3); //@line 2482
  HEAP32[$vararg_buffer5 >> 2] = HEAP32[2418]; //@line 2484
  _mbed_error_printf(2704, $vararg_buffer5); //@line 2485
 } else {
  switch ($18 | 0) {
  case 305:
   {
    HEAP32[$vararg_buffer8 >> 2] = HEAP32[2418]; //@line 2490
    _mbed_error_printf(2721, $vararg_buffer8); //@line 2491
    break;
   }
  case 306:
   {
    HEAP32[$vararg_buffer11 >> 2] = HEAP32[2418]; //@line 2496
    _mbed_error_printf(2742, $vararg_buffer11); //@line 2497
    break;
   }
  case 307:
   {
    HEAP32[$vararg_buffer14 >> 2] = HEAP32[2418]; //@line 2502
    _mbed_error_printf(2757, $vararg_buffer14); //@line 2503
    break;
   }
  case 308:
   {
    HEAP32[$vararg_buffer17 >> 2] = HEAP32[2418]; //@line 2508
    _mbed_error_printf(2771, $vararg_buffer17); //@line 2509
    break;
   }
  case 309:
   {
    HEAP32[$vararg_buffer20 >> 2] = HEAP32[2418]; //@line 2514
    _mbed_error_printf(2789, $vararg_buffer20); //@line 2515
    break;
   }
  case 311:
   {
    HEAP32[$vararg_buffer23 >> 2] = HEAP32[2418]; //@line 2520
    _mbed_error_printf(2808, $vararg_buffer23); //@line 2521
    break;
   }
  case 310:
   {
    HEAP32[$vararg_buffer26 >> 2] = HEAP32[2418]; //@line 2526
    _mbed_error_printf(2827, $vararg_buffer26); //@line 2527
    break;
   }
  case 312:
   {
    HEAP32[$vararg_buffer29 >> 2] = HEAP32[2418]; //@line 2532
    _mbed_error_printf(2841, $vararg_buffer29); //@line 2533
    break;
   }
  default:
   {}
  }
  HEAP32[$vararg_buffer32 >> 2] = 0; //@line 2539
  _mbed_error_printf($1, $vararg_buffer32); //@line 2540
  HEAP32[$vararg_buffer35 >> 2] = HEAP32[2417]; //@line 2542
  _mbed_error_printf(2862, $vararg_buffer35); //@line 2543
  $34 = HEAP32[2419] | 0; //@line 2545
  $35 = HEAP32[2420] | 0; //@line 2546
  $36 = HEAP32[2421] | 0; //@line 2547
  $37 = HEAP32[2422] | 0; //@line 2548
  HEAP32[$vararg_buffer38 >> 2] = HEAP32[2418]; //@line 2549
  HEAP32[$vararg_buffer38 + 4 >> 2] = $34; //@line 2551
  HEAP32[$vararg_buffer38 + 8 >> 2] = $35; //@line 2553
  HEAP32[$vararg_buffer38 + 12 >> 2] = $36; //@line 2555
  HEAP32[$vararg_buffer38 + 16 >> 2] = $37; //@line 2557
  _mbed_error_printf(2878, $vararg_buffer38); //@line 2558
 }
 _mbed_error_printf(2966, $vararg_buffer45); //@line 2560
 if (!(_core_util_is_isr_active() | 0)) {
  if (_core_util_are_interrupts_enabled() | 0) {
   _emscripten_alloc_async_context(4, sp) | 0; //@line 2565
   _exit(1); //@line 2566
  }
 }
 while (1) {
  $AsyncCtx48 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2571
  ___WFI(); //@line 2572
  if (___async) {
   break;
  }
  _emscripten_free_async_context($AsyncCtx48 | 0); //@line 2577
 }
 HEAP32[$AsyncCtx48 >> 2] = 106; //@line 2579
 sp = STACKTOP; //@line 2580
 STACKTOP = sp; //@line 2581
 return 0; //@line 2581
}
function _mbed_vtracef__async_cb_46($0) {
 $0 = $0 | 0;
 var $$10 = 0, $$3147168 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $12 = 0, $16 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $48 = 0, $50 = 0, $53 = 0, $54 = 0, $56 = 0, $67 = 0, $68 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6790
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6792
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6794
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6798
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6802
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 6806
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 6810
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 6812
 $24 = HEAP8[$0 + 48 >> 0] & 1; //@line 6815
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 6817
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 6819
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 6821
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 6823
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 6825
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 6831
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 6833
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 6835
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 6839
 HEAP32[$30 >> 2] = HEAP32[___async_retval >> 2]; //@line 6842
 $50 = _snprintf($32, $34, 2221, $30) | 0; //@line 6843
 $$10 = ($50 | 0) >= ($34 | 0) ? 0 : $50; //@line 6845
 $53 = $32 + $$10 | 0; //@line 6847
 $54 = $34 - $$10 | 0; //@line 6848
 if (($$10 | 0) > 0) {
  if (($54 | 0) > 0) {
   $$3147168 = $54; //@line 6852
   $$3169 = $53; //@line 6852
   label = 4; //@line 6853
  }
 } else {
  $$3147168 = $34; //@line 6856
  $$3169 = $32; //@line 6856
  label = 4; //@line 6857
 }
 if ((label | 0) == 4) {
  $56 = $48 + -2 | 0; //@line 6860
  switch ($56 >>> 1 | $56 << 31 | 0) {
  case 0:
   {
    HEAP32[$44 >> 2] = $4; //@line 6866
    $$5156 = _snprintf($$3169, $$3147168, 2224, $44) | 0; //@line 6868
    break;
   }
  case 1:
   {
    HEAP32[$12 >> 2] = $4; //@line 6872
    $$5156 = _snprintf($$3169, $$3147168, 2239, $12) | 0; //@line 6874
    break;
   }
  case 3:
   {
    HEAP32[$16 >> 2] = $4; //@line 6878
    $$5156 = _snprintf($$3169, $$3147168, 2254, $16) | 0; //@line 6880
    break;
   }
  case 7:
   {
    HEAP32[$2 >> 2] = $4; //@line 6884
    $$5156 = _snprintf($$3169, $$3147168, 2269, $2) | 0; //@line 6886
    break;
   }
  default:
   {
    $$5156 = _snprintf($$3169, $$3147168, 2284, $8) | 0; //@line 6891
   }
  }
  $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 6895
  $67 = $$3169 + $$5156$ | 0; //@line 6897
  $68 = $$3147168 - $$5156$ | 0; //@line 6898
  if (($$5156$ | 0) > 0 & ($68 | 0) > 0) {
   $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 6902
   $70 = _vsnprintf($67, $68, $20, $22) | 0; //@line 6903
   if (___async) {
    HEAP32[$ReallocAsyncCtx10 >> 2] = 45; //@line 6906
    $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 6907
    HEAP32[$71 >> 2] = $40; //@line 6908
    $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 6909
    HEAP32[$72 >> 2] = $42; //@line 6910
    $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 6911
    $$expand_i1_val = $24 & 1; //@line 6912
    HEAP8[$73 >> 0] = $$expand_i1_val; //@line 6913
    $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 6914
    HEAP32[$74 >> 2] = $26; //@line 6915
    $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 6916
    HEAP32[$75 >> 2] = $28; //@line 6917
    $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 6918
    HEAP32[$76 >> 2] = $68; //@line 6919
    $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 6920
    HEAP32[$77 >> 2] = $67; //@line 6921
    sp = STACKTOP; //@line 6922
    return;
   }
   HEAP32[___async_retval >> 2] = $70; //@line 6926
   ___async_unwind = 0; //@line 6927
   HEAP32[$ReallocAsyncCtx10 >> 2] = 45; //@line 6928
   $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 6929
   HEAP32[$71 >> 2] = $40; //@line 6930
   $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 6931
   HEAP32[$72 >> 2] = $42; //@line 6932
   $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 6933
   $$expand_i1_val = $24 & 1; //@line 6934
   HEAP8[$73 >> 0] = $$expand_i1_val; //@line 6935
   $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 6936
   HEAP32[$74 >> 2] = $26; //@line 6937
   $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 6938
   HEAP32[$75 >> 2] = $28; //@line 6939
   $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 6940
   HEAP32[$76 >> 2] = $68; //@line 6941
   $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 6942
   HEAP32[$77 >> 2] = $67; //@line 6943
   sp = STACKTOP; //@line 6944
   return;
  }
 }
 $79 = HEAP32[91] | 0; //@line 6948
 $80 = HEAP32[84] | 0; //@line 6949
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 6950
 FUNCTION_TABLE_vi[$79 & 255]($80); //@line 6951
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 6954
  sp = STACKTOP; //@line 6955
  return;
 }
 ___async_unwind = 0; //@line 6958
 HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 6959
 sp = STACKTOP; //@line 6960
 return;
}
function _freopen($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$pre = 0, $17 = 0, $27 = 0, $29 = 0, $3 = 0, $30 = 0, $32 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx14 = 0, $AsyncCtx18 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 628
 STACKTOP = STACKTOP + 32 | 0; //@line 629
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 629
 $vararg_buffer3 = sp + 16 | 0; //@line 630
 $vararg_buffer = sp; //@line 631
 $3 = ___fmodeflags($1) | 0; //@line 632
 if ((HEAP32[$2 + 76 >> 2] | 0) > -1) {
  $17 = ___lockfile($2) | 0; //@line 638
 } else {
  $17 = 0; //@line 640
 }
 $AsyncCtx = _emscripten_alloc_async_context(40, sp) | 0; //@line 642
 _fflush($2) | 0; //@line 643
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 196; //@line 646
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 648
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 650
  HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer3; //@line 652
  HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 654
  HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 656
  HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 658
  HEAP32[$AsyncCtx + 28 >> 2] = $0; //@line 660
  HEAP32[$AsyncCtx + 32 >> 2] = $1; //@line 662
  HEAP32[$AsyncCtx + 36 >> 2] = $17; //@line 664
  sp = STACKTOP; //@line 665
  STACKTOP = sp; //@line 666
  return 0; //@line 666
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 668
 do {
  if (!$0) {
   $$pre = $2 + 60 | 0; //@line 674
   if ($3 & 524288 | 0) {
    HEAP32[$vararg_buffer >> 2] = HEAP32[$$pre >> 2]; //@line 677
    HEAP32[$vararg_buffer + 4 >> 2] = 2; //@line 679
    HEAP32[$vararg_buffer + 8 >> 2] = 1; //@line 681
    ___syscall221(221, $vararg_buffer | 0) | 0; //@line 682
   }
   HEAP32[$vararg_buffer3 >> 2] = HEAP32[$$pre >> 2]; //@line 686
   HEAP32[$vararg_buffer3 + 4 >> 2] = 4; //@line 688
   HEAP32[$vararg_buffer3 + 8 >> 2] = $3 & -524481; //@line 690
   if ((___syscall_ret(___syscall221(221, $vararg_buffer3 | 0) | 0) | 0) < 0) {
    label = 21; //@line 695
   } else {
    label = 16; //@line 697
   }
  } else {
   $27 = _fopen($0, $1) | 0; //@line 700
   if (!$27) {
    label = 21; //@line 703
   } else {
    $29 = $27 + 60 | 0; //@line 705
    $30 = HEAP32[$29 >> 2] | 0; //@line 706
    $32 = HEAP32[$2 + 60 >> 2] | 0; //@line 708
    if (($30 | 0) == ($32 | 0)) {
     HEAP32[$29 >> 2] = -1; //@line 711
    } else {
     if ((___dup3($30, $32, $3 & 524288) | 0) < 0) {
      $AsyncCtx14 = _emscripten_alloc_async_context(8, sp) | 0; //@line 717
      _fclose($27) | 0; //@line 718
      if (___async) {
       HEAP32[$AsyncCtx14 >> 2] = 198; //@line 721
       HEAP32[$AsyncCtx14 + 4 >> 2] = $2; //@line 723
       sp = STACKTOP; //@line 724
       STACKTOP = sp; //@line 725
       return 0; //@line 725
      } else {
       _emscripten_free_async_context($AsyncCtx14 | 0); //@line 727
       label = 21; //@line 728
       break;
      }
     }
    }
    HEAP32[$2 >> 2] = HEAP32[$2 >> 2] & 1 | HEAP32[$27 >> 2]; //@line 737
    HEAP32[$2 + 32 >> 2] = HEAP32[$27 + 32 >> 2]; //@line 741
    HEAP32[$2 + 36 >> 2] = HEAP32[$27 + 36 >> 2]; //@line 745
    HEAP32[$2 + 40 >> 2] = HEAP32[$27 + 40 >> 2]; //@line 749
    HEAP32[$2 + 12 >> 2] = HEAP32[$27 + 12 >> 2]; //@line 753
    $AsyncCtx18 = _emscripten_alloc_async_context(12, sp) | 0; //@line 754
    _fclose($27) | 0; //@line 755
    if (___async) {
     HEAP32[$AsyncCtx18 >> 2] = 197; //@line 758
     HEAP32[$AsyncCtx18 + 4 >> 2] = $17; //@line 760
     HEAP32[$AsyncCtx18 + 8 >> 2] = $2; //@line 762
     sp = STACKTOP; //@line 763
     STACKTOP = sp; //@line 764
     return 0; //@line 764
    } else {
     _emscripten_free_async_context($AsyncCtx18 | 0); //@line 766
     label = 16; //@line 767
     break;
    }
   }
  }
 } while (0);
 do {
  if ((label | 0) == 16) {
   if (!$17) {
    $$0 = $2; //@line 777
   } else {
    ___unlockfile($2); //@line 779
    $$0 = $2; //@line 780
   }
  } else if ((label | 0) == 21) {
   $AsyncCtx10 = _emscripten_alloc_async_context(8, sp) | 0; //@line 784
   _fclose($2) | 0; //@line 785
   if (___async) {
    HEAP32[$AsyncCtx10 >> 2] = 199; //@line 788
    HEAP32[$AsyncCtx10 + 4 >> 2] = $2; //@line 790
    sp = STACKTOP; //@line 791
    STACKTOP = sp; //@line 792
    return 0; //@line 792
   } else {
    _emscripten_free_async_context($AsyncCtx10 | 0); //@line 794
    $$0 = 0; //@line 795
    break;
   }
  }
 } while (0);
 STACKTOP = sp; //@line 800
 return $$0 | 0; //@line 800
}
function __ZN4mbed6Stream6printfEPKcz($0, $1, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $varargs = $varargs | 0;
 var $$09 = 0, $13 = 0, $2 = 0, $22 = 0, $3 = 0, $30 = 0, $36 = 0, $39 = 0, $48 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx12 = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 1823
 STACKTOP = STACKTOP + 4112 | 0; //@line 1824
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(4112); //@line 1824
 $2 = sp; //@line 1825
 $3 = sp + 16 | 0; //@line 1826
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 1829
 $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 1830
 FUNCTION_TABLE_vi[$6 & 255]($0); //@line 1831
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 80; //@line 1834
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 1836
  HEAP32[$AsyncCtx + 8 >> 2] = $varargs; //@line 1838
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 1840
  HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 1842
  HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 1844
  HEAP32[$AsyncCtx + 24 >> 2] = $0; //@line 1846
  sp = STACKTOP; //@line 1847
  STACKTOP = sp; //@line 1848
  return 0; //@line 1848
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1850
 HEAP32[$2 >> 2] = $varargs; //@line 1851
 _memset($3 | 0, 0, 4096) | 0; //@line 1852
 $AsyncCtx12 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1853
 $13 = _vsprintf($3, $1, $2) | 0; //@line 1854
 if (___async) {
  HEAP32[$AsyncCtx12 >> 2] = 81; //@line 1857
  HEAP32[$AsyncCtx12 + 4 >> 2] = $0; //@line 1859
  HEAP32[$AsyncCtx12 + 8 >> 2] = $0; //@line 1861
  HEAP32[$AsyncCtx12 + 12 >> 2] = $3; //@line 1863
  HEAP32[$AsyncCtx12 + 16 >> 2] = $2; //@line 1865
  HEAP32[$AsyncCtx12 + 20 >> 2] = $3; //@line 1867
  sp = STACKTOP; //@line 1868
  STACKTOP = sp; //@line 1869
  return 0; //@line 1869
 }
 _emscripten_free_async_context($AsyncCtx12 | 0); //@line 1871
 L7 : do {
  if (($13 | 0) > 0) {
   $$09 = 0; //@line 1875
   while (1) {
    $36 = HEAP32[(HEAP32[$0 >> 2] | 0) + 72 >> 2] | 0; //@line 1879
    $39 = HEAP8[$3 + $$09 >> 0] | 0; //@line 1882
    $AsyncCtx9 = _emscripten_alloc_async_context(36, sp) | 0; //@line 1883
    FUNCTION_TABLE_iii[$36 & 7]($0, $39) | 0; //@line 1884
    if (___async) {
     break;
    }
    _emscripten_free_async_context($AsyncCtx9 | 0); //@line 1889
    $48 = $$09 + 1 | 0; //@line 1890
    if (($48 | 0) == ($13 | 0)) {
     break L7;
    } else {
     $$09 = $48; //@line 1895
    }
   }
   HEAP32[$AsyncCtx9 >> 2] = 84; //@line 1898
   HEAP32[$AsyncCtx9 + 4 >> 2] = $$09; //@line 1900
   HEAP32[$AsyncCtx9 + 8 >> 2] = $13; //@line 1902
   HEAP32[$AsyncCtx9 + 12 >> 2] = $0; //@line 1904
   HEAP32[$AsyncCtx9 + 16 >> 2] = $0; //@line 1906
   HEAP32[$AsyncCtx9 + 20 >> 2] = $0; //@line 1908
   HEAP32[$AsyncCtx9 + 24 >> 2] = $3; //@line 1910
   HEAP32[$AsyncCtx9 + 28 >> 2] = $3; //@line 1912
   HEAP32[$AsyncCtx9 + 32 >> 2] = $2; //@line 1914
   sp = STACKTOP; //@line 1915
   STACKTOP = sp; //@line 1916
   return 0; //@line 1916
  }
 } while (0);
 $22 = HEAP32[(HEAP32[$0 >> 2] | 0) + 80 >> 2] | 0; //@line 1921
 $AsyncCtx2 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1922
 FUNCTION_TABLE_vi[$22 & 255]($0); //@line 1923
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 82; //@line 1926
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 1928
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1930
  HEAP32[$AsyncCtx2 + 12 >> 2] = $3; //@line 1932
  HEAP32[$AsyncCtx2 + 16 >> 2] = $2; //@line 1934
  HEAP32[$AsyncCtx2 + 20 >> 2] = $13; //@line 1936
  sp = STACKTOP; //@line 1937
  STACKTOP = sp; //@line 1938
  return 0; //@line 1938
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1940
 $30 = HEAP32[(HEAP32[$0 >> 2] | 0) + 88 >> 2] | 0; //@line 1943
 $AsyncCtx5 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1944
 FUNCTION_TABLE_vi[$30 & 255]($0); //@line 1945
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 83; //@line 1948
  HEAP32[$AsyncCtx5 + 4 >> 2] = $3; //@line 1950
  HEAP32[$AsyncCtx5 + 8 >> 2] = $2; //@line 1952
  HEAP32[$AsyncCtx5 + 12 >> 2] = $13; //@line 1954
  sp = STACKTOP; //@line 1955
  STACKTOP = sp; //@line 1956
  return 0; //@line 1956
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 1958
  STACKTOP = sp; //@line 1959
  return $13 | 0; //@line 1959
 }
 return 0; //@line 1961
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_6($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3353
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3355
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3357
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3359
 $8 = HEAP8[$0 + 16 >> 0] & 1; //@line 3362
 $10 = HEAP8[$0 + 17 >> 0] & 1; //@line 3365
 $12 = HEAP32[$0 + 20 >> 2] | 0; //@line 3367
 $14 = HEAP32[$0 + 24 >> 2] | 0; //@line 3369
 $16 = HEAP32[$0 + 28 >> 2] | 0; //@line 3371
 $18 = HEAP32[$0 + 32 >> 2] | 0; //@line 3373
 $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 3375
 $22 = HEAP8[$0 + 40 >> 0] & 1; //@line 3378
 $24 = HEAP32[$0 + 44 >> 2] | 0; //@line 3380
 $26 = HEAP32[$0 + 48 >> 2] | 0; //@line 3382
 $28 = HEAP32[$0 + 52 >> 2] | 0; //@line 3384
 L2 : do {
  if (!(HEAP8[$12 >> 0] | 0)) {
   do {
    if (!(HEAP8[$20 >> 0] | 0)) {
     $$182$off0 = $8; //@line 3393
     $$186$off0 = $10; //@line 3393
    } else {
     if (!(HEAP8[$18 >> 0] | 0)) {
      if (!(HEAP32[$26 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $10; //@line 3402
       $$283$off0 = 1; //@line 3402
       label = 13; //@line 3403
       break L2;
      } else {
       $$182$off0 = 1; //@line 3406
       $$186$off0 = $10; //@line 3406
       break;
      }
     }
     if ((HEAP32[$14 >> 2] | 0) == 1) {
      label = 18; //@line 3413
      break L2;
     }
     if (!(HEAP32[$26 >> 2] & 2)) {
      label = 18; //@line 3420
      break L2;
     } else {
      $$182$off0 = 1; //@line 3423
      $$186$off0 = 1; //@line 3423
     }
    }
   } while (0);
   $30 = $28 + 8 | 0; //@line 3427
   if ($30 >>> 0 < $24 >>> 0) {
    HEAP8[$18 >> 0] = 0; //@line 3430
    HEAP8[$20 >> 0] = 0; //@line 3431
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 3432
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $6, $2, $2, 1, $22); //@line 3433
    if (!___async) {
     ___async_unwind = 0; //@line 3436
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 221; //@line 3438
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 3440
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 3442
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 3444
    HEAP8[$ReallocAsyncCtx5 + 16 >> 0] = $$182$off0 & 1; //@line 3447
    HEAP8[$ReallocAsyncCtx5 + 17 >> 0] = $$186$off0 & 1; //@line 3450
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $12; //@line 3452
    HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $14; //@line 3454
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $16; //@line 3456
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $18; //@line 3458
    HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $20; //@line 3460
    HEAP8[$ReallocAsyncCtx5 + 40 >> 0] = $22 & 1; //@line 3463
    HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $24; //@line 3465
    HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $26; //@line 3467
    HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $30; //@line 3469
    sp = STACKTOP; //@line 3470
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 3473
    $$283$off0 = $$182$off0; //@line 3473
    label = 13; //@line 3474
   }
  } else {
   $$085$off0$reg2mem$0 = $10; //@line 3477
   $$283$off0 = $8; //@line 3477
   label = 13; //@line 3478
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$4 >> 2] = $2; //@line 3484
    $59 = $6 + 40 | 0; //@line 3485
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 3488
    if ((HEAP32[$6 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$14 >> 2] | 0) == 2) {
      HEAP8[$12 >> 0] = 1; //@line 3496
      if ($$283$off0) {
       label = 18; //@line 3498
       break;
      } else {
       $67 = 4; //@line 3501
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 3508
   } else {
    $67 = 4; //@line 3510
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 3515
 }
 HEAP32[$16 >> 2] = $67; //@line 3517
 return;
}
function _main__async_cb_70($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx4 = 0, $bitmSan3$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 8382
 STACKTOP = STACKTOP + 16 | 0; //@line 8383
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 8383
 $bitmSan3$byval_copy = sp; //@line 8384
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8386
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8388
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8390
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8392
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8394
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8396
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8398
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8400
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 8402
 $19 = $10 + 9 | 0; //@line 8403
 if (($10 | 0) < 66) {
  $ReallocAsyncCtx10 = _emscripten_realloc_async_context(40) | 0; //@line 8406
  HEAP32[$bitmSan3$byval_copy >> 2] = HEAP32[281]; //@line 8407
  HEAP32[$bitmSan3$byval_copy + 4 >> 2] = HEAP32[282]; //@line 8407
  HEAP32[$bitmSan3$byval_copy + 8 >> 2] = HEAP32[283]; //@line 8407
  HEAP32[$bitmSan3$byval_copy + 12 >> 2] = HEAP32[284]; //@line 8407
  __ZN6C128328print_bmE6Bitmapii(9844, $bitmSan3$byval_copy, $19, 2); //@line 8408
  if (!___async) {
   ___async_unwind = 0; //@line 8411
  }
  HEAP32[$ReallocAsyncCtx10 >> 2] = 168; //@line 8413
  HEAP32[$ReallocAsyncCtx10 + 4 >> 2] = $19; //@line 8415
  HEAP32[$ReallocAsyncCtx10 + 8 >> 2] = $2; //@line 8417
  HEAP32[$ReallocAsyncCtx10 + 12 >> 2] = $4; //@line 8419
  HEAP32[$ReallocAsyncCtx10 + 16 >> 2] = $6; //@line 8421
  HEAP32[$ReallocAsyncCtx10 + 20 >> 2] = $8; //@line 8423
  HEAP32[$ReallocAsyncCtx10 + 24 >> 2] = $12; //@line 8425
  HEAP32[$ReallocAsyncCtx10 + 28 >> 2] = $14; //@line 8427
  HEAP32[$ReallocAsyncCtx10 + 32 >> 2] = $16; //@line 8429
  HEAP32[$ReallocAsyncCtx10 + 36 >> 2] = $18; //@line 8431
  sp = STACKTOP; //@line 8432
  STACKTOP = sp; //@line 8433
  return;
 }
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(36) | 0; //@line 8435
 HEAP32[$bitmSan3$byval_copy >> 2] = HEAP32[289]; //@line 8436
 HEAP32[$bitmSan3$byval_copy + 4 >> 2] = HEAP32[290]; //@line 8436
 HEAP32[$bitmSan3$byval_copy + 8 >> 2] = HEAP32[291]; //@line 8436
 HEAP32[$bitmSan3$byval_copy + 12 >> 2] = HEAP32[292]; //@line 8436
 __ZN6C128328print_bmE6Bitmapii(9844, $bitmSan3$byval_copy, 75, 2); //@line 8437
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 177; //@line 8440
  $30 = $ReallocAsyncCtx4 + 4 | 0; //@line 8441
  HEAP32[$30 >> 2] = $2; //@line 8442
  $31 = $ReallocAsyncCtx4 + 8 | 0; //@line 8443
  HEAP32[$31 >> 2] = $4; //@line 8444
  $32 = $ReallocAsyncCtx4 + 12 | 0; //@line 8445
  HEAP32[$32 >> 2] = $6; //@line 8446
  $33 = $ReallocAsyncCtx4 + 16 | 0; //@line 8447
  HEAP32[$33 >> 2] = $8; //@line 8448
  $34 = $ReallocAsyncCtx4 + 20 | 0; //@line 8449
  HEAP32[$34 >> 2] = $12; //@line 8450
  $35 = $ReallocAsyncCtx4 + 24 | 0; //@line 8451
  HEAP32[$35 >> 2] = $14; //@line 8452
  $36 = $ReallocAsyncCtx4 + 28 | 0; //@line 8453
  HEAP32[$36 >> 2] = $16; //@line 8454
  $37 = $ReallocAsyncCtx4 + 32 | 0; //@line 8455
  HEAP32[$37 >> 2] = $18; //@line 8456
  sp = STACKTOP; //@line 8457
  STACKTOP = sp; //@line 8458
  return;
 }
 ___async_unwind = 0; //@line 8460
 HEAP32[$ReallocAsyncCtx4 >> 2] = 177; //@line 8461
 $30 = $ReallocAsyncCtx4 + 4 | 0; //@line 8462
 HEAP32[$30 >> 2] = $2; //@line 8463
 $31 = $ReallocAsyncCtx4 + 8 | 0; //@line 8464
 HEAP32[$31 >> 2] = $4; //@line 8465
 $32 = $ReallocAsyncCtx4 + 12 | 0; //@line 8466
 HEAP32[$32 >> 2] = $6; //@line 8467
 $33 = $ReallocAsyncCtx4 + 16 | 0; //@line 8468
 HEAP32[$33 >> 2] = $8; //@line 8469
 $34 = $ReallocAsyncCtx4 + 20 | 0; //@line 8470
 HEAP32[$34 >> 2] = $12; //@line 8471
 $35 = $ReallocAsyncCtx4 + 24 | 0; //@line 8472
 HEAP32[$35 >> 2] = $14; //@line 8473
 $36 = $ReallocAsyncCtx4 + 28 | 0; //@line 8474
 HEAP32[$36 >> 2] = $16; //@line 8475
 $37 = $ReallocAsyncCtx4 + 32 | 0; //@line 8476
 HEAP32[$37 >> 2] = $18; //@line 8477
 sp = STACKTOP; //@line 8478
 STACKTOP = sp; //@line 8479
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_11($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $27 = 0, $29 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 3933
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3937
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3939
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3941
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3943
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3945
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3947
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3949
 $29 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 3950
 if (($29 | 0) == ($4 | 0)) {
  $19 = HEAP32[(HEAP32[$6 >> 2] | 0) + 80 >> 2] | 0; //@line 3955
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 3956
  FUNCTION_TABLE_vi[$19 & 255]($8); //@line 3957
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 82; //@line 3960
   $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 3961
   HEAP32[$20 >> 2] = $6; //@line 3962
   $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 3963
   HEAP32[$21 >> 2] = $8; //@line 3964
   $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 3965
   HEAP32[$22 >> 2] = $14; //@line 3966
   $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 3967
   HEAP32[$23 >> 2] = $16; //@line 3968
   $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 3969
   HEAP32[$24 >> 2] = $4; //@line 3970
   sp = STACKTOP; //@line 3971
   return;
  }
  ___async_unwind = 0; //@line 3974
  HEAP32[$ReallocAsyncCtx2 >> 2] = 82; //@line 3975
  $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 3976
  HEAP32[$20 >> 2] = $6; //@line 3977
  $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 3978
  HEAP32[$21 >> 2] = $8; //@line 3979
  $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 3980
  HEAP32[$22 >> 2] = $14; //@line 3981
  $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 3982
  HEAP32[$23 >> 2] = $16; //@line 3983
  $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 3984
  HEAP32[$24 >> 2] = $4; //@line 3985
  sp = STACKTOP; //@line 3986
  return;
 } else {
  $27 = HEAP32[(HEAP32[$10 >> 2] | 0) + 72 >> 2] | 0; //@line 3991
  $31 = HEAP8[$12 + $29 >> 0] | 0; //@line 3994
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(36) | 0; //@line 3995
  FUNCTION_TABLE_iii[$27 & 7]($8, $31) | 0; //@line 3996
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 84; //@line 3999
   $32 = $ReallocAsyncCtx4 + 4 | 0; //@line 4000
   HEAP32[$32 >> 2] = $29; //@line 4001
   $33 = $ReallocAsyncCtx4 + 8 | 0; //@line 4002
   HEAP32[$33 >> 2] = $4; //@line 4003
   $34 = $ReallocAsyncCtx4 + 12 | 0; //@line 4004
   HEAP32[$34 >> 2] = $6; //@line 4005
   $35 = $ReallocAsyncCtx4 + 16 | 0; //@line 4006
   HEAP32[$35 >> 2] = $8; //@line 4007
   $36 = $ReallocAsyncCtx4 + 20 | 0; //@line 4008
   HEAP32[$36 >> 2] = $10; //@line 4009
   $37 = $ReallocAsyncCtx4 + 24 | 0; //@line 4010
   HEAP32[$37 >> 2] = $12; //@line 4011
   $38 = $ReallocAsyncCtx4 + 28 | 0; //@line 4012
   HEAP32[$38 >> 2] = $14; //@line 4013
   $39 = $ReallocAsyncCtx4 + 32 | 0; //@line 4014
   HEAP32[$39 >> 2] = $16; //@line 4015
   sp = STACKTOP; //@line 4016
   return;
  }
  ___async_unwind = 0; //@line 4019
  HEAP32[$ReallocAsyncCtx4 >> 2] = 84; //@line 4020
  $32 = $ReallocAsyncCtx4 + 4 | 0; //@line 4021
  HEAP32[$32 >> 2] = $29; //@line 4022
  $33 = $ReallocAsyncCtx4 + 8 | 0; //@line 4023
  HEAP32[$33 >> 2] = $4; //@line 4024
  $34 = $ReallocAsyncCtx4 + 12 | 0; //@line 4025
  HEAP32[$34 >> 2] = $6; //@line 4026
  $35 = $ReallocAsyncCtx4 + 16 | 0; //@line 4027
  HEAP32[$35 >> 2] = $8; //@line 4028
  $36 = $ReallocAsyncCtx4 + 20 | 0; //@line 4029
  HEAP32[$36 >> 2] = $10; //@line 4030
  $37 = $ReallocAsyncCtx4 + 24 | 0; //@line 4031
  HEAP32[$37 >> 2] = $12; //@line 4032
  $38 = $ReallocAsyncCtx4 + 28 | 0; //@line 4033
  HEAP32[$38 >> 2] = $14; //@line 4034
  $39 = $ReallocAsyncCtx4 + 32 | 0; //@line 4035
  HEAP32[$39 >> 2] = $16; //@line 4036
  sp = STACKTOP; //@line 4037
  return;
 }
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 11316
      $10 = HEAP32[$9 >> 2] | 0; //@line 11317
      HEAP32[$2 >> 2] = $9 + 4; //@line 11319
      HEAP32[$0 >> 2] = $10; //@line 11320
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 11336
      $17 = HEAP32[$16 >> 2] | 0; //@line 11337
      HEAP32[$2 >> 2] = $16 + 4; //@line 11339
      $20 = $0; //@line 11342
      HEAP32[$20 >> 2] = $17; //@line 11344
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 11347
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 11363
      $30 = HEAP32[$29 >> 2] | 0; //@line 11364
      HEAP32[$2 >> 2] = $29 + 4; //@line 11366
      $31 = $0; //@line 11367
      HEAP32[$31 >> 2] = $30; //@line 11369
      HEAP32[$31 + 4 >> 2] = 0; //@line 11372
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 11388
      $41 = $40; //@line 11389
      $43 = HEAP32[$41 >> 2] | 0; //@line 11391
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 11394
      HEAP32[$2 >> 2] = $40 + 8; //@line 11396
      $47 = $0; //@line 11397
      HEAP32[$47 >> 2] = $43; //@line 11399
      HEAP32[$47 + 4 >> 2] = $46; //@line 11402
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 11418
      $57 = HEAP32[$56 >> 2] | 0; //@line 11419
      HEAP32[$2 >> 2] = $56 + 4; //@line 11421
      $59 = ($57 & 65535) << 16 >> 16; //@line 11423
      $62 = $0; //@line 11426
      HEAP32[$62 >> 2] = $59; //@line 11428
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 11431
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 11447
      $72 = HEAP32[$71 >> 2] | 0; //@line 11448
      HEAP32[$2 >> 2] = $71 + 4; //@line 11450
      $73 = $0; //@line 11452
      HEAP32[$73 >> 2] = $72 & 65535; //@line 11454
      HEAP32[$73 + 4 >> 2] = 0; //@line 11457
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 11473
      $83 = HEAP32[$82 >> 2] | 0; //@line 11474
      HEAP32[$2 >> 2] = $82 + 4; //@line 11476
      $85 = ($83 & 255) << 24 >> 24; //@line 11478
      $88 = $0; //@line 11481
      HEAP32[$88 >> 2] = $85; //@line 11483
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 11486
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 11502
      $98 = HEAP32[$97 >> 2] | 0; //@line 11503
      HEAP32[$2 >> 2] = $97 + 4; //@line 11505
      $99 = $0; //@line 11507
      HEAP32[$99 >> 2] = $98 & 255; //@line 11509
      HEAP32[$99 + 4 >> 2] = 0; //@line 11512
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 11528
      $109 = +HEAPF64[$108 >> 3]; //@line 11529
      HEAP32[$2 >> 2] = $108 + 8; //@line 11531
      HEAPF64[$0 >> 3] = $109; //@line 11532
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 11548
      $116 = +HEAPF64[$115 >> 3]; //@line 11549
      HEAP32[$2 >> 2] = $115 + 8; //@line 11551
      HEAPF64[$0 >> 3] = $116; //@line 11552
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
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_5($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3197
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3199
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3201
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3203
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3205
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 3208
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3210
 $15 = $4 + 24 | 0; //@line 3213
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$4 + 8 >> 2] | 0; //@line 3218
   if (!($18 & 2)) {
    $21 = $2 + 36 | 0; //@line 3222
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $2 + 54 | 0; //@line 3229
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 3240
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $6, $8, $10); //@line 3241
      if (!___async) {
       ___async_unwind = 0; //@line 3244
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 225; //@line 3246
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 3248
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $12; //@line 3250
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 3252
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 3254
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $2; //@line 3256
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $6; //@line 3258
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $8; //@line 3260
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $10 & 1; //@line 3263
      sp = STACKTOP; //@line 3264
      return;
     }
     $36 = $2 + 24 | 0; //@line 3267
     $37 = $2 + 54 | 0; //@line 3268
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 3283
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $6, $8, $10); //@line 3284
     if (!___async) {
      ___async_unwind = 0; //@line 3287
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 224; //@line 3289
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 3291
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $12; //@line 3293
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 3295
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 3297
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 3299
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $2; //@line 3301
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $6; //@line 3303
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $8; //@line 3305
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $10 & 1; //@line 3308
     sp = STACKTOP; //@line 3309
     return;
    }
   }
   $24 = $2 + 54 | 0; //@line 3313
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 3317
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $2, $6, $8, $10); //@line 3318
    if (!___async) {
     ___async_unwind = 0; //@line 3321
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 223; //@line 3323
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 3325
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $12; //@line 3327
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 3329
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $2; //@line 3331
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $6; //@line 3333
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $8; //@line 3335
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $10 & 1; //@line 3338
    sp = STACKTOP; //@line 3339
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
 sp = STACKTOP; //@line 2043
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 2048
 } else {
  $9 = $1 + 52 | 0; //@line 2050
  $10 = HEAP8[$9 >> 0] | 0; //@line 2051
  $11 = $1 + 53 | 0; //@line 2052
  $12 = HEAP8[$11 >> 0] | 0; //@line 2053
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 2056
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 2057
  HEAP8[$9 >> 0] = 0; //@line 2058
  HEAP8[$11 >> 0] = 0; //@line 2059
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 2060
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 2061
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 219; //@line 2064
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 2066
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 2068
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 2070
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 2072
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 2074
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 2076
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 2078
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 2080
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 2082
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 2084
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 2087
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 2089
   sp = STACKTOP; //@line 2090
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2093
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 2098
    $32 = $0 + 8 | 0; //@line 2099
    $33 = $1 + 54 | 0; //@line 2100
    $$0 = $0 + 24 | 0; //@line 2101
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
     HEAP8[$9 >> 0] = 0; //@line 2134
     HEAP8[$11 >> 0] = 0; //@line 2135
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 2136
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 2137
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 2142
     $62 = $$0 + 8 | 0; //@line 2143
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 2146
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 220; //@line 2151
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 2153
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 2155
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 2157
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 2159
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 2161
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 2163
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 2165
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 2167
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 2169
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 2171
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 2173
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 2175
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 2177
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 2180
    sp = STACKTOP; //@line 2181
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 2185
  HEAP8[$11 >> 0] = $12; //@line 2186
 }
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_12($0) {
 $0 = $0 | 0;
 var $10 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4045
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4047
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4049
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4051
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4053
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4055
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4057
 if (($AsyncRetVal | 0) <= 0) {
  $15 = HEAP32[(HEAP32[$4 >> 2] | 0) + 80 >> 2] | 0; //@line 4062
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 4063
  FUNCTION_TABLE_vi[$15 & 255]($2); //@line 4064
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 82; //@line 4067
   $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 4068
   HEAP32[$16 >> 2] = $4; //@line 4069
   $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 4070
   HEAP32[$17 >> 2] = $2; //@line 4071
   $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 4072
   HEAP32[$18 >> 2] = $6; //@line 4073
   $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 4074
   HEAP32[$19 >> 2] = $8; //@line 4075
   $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 4076
   HEAP32[$20 >> 2] = $AsyncRetVal; //@line 4077
   sp = STACKTOP; //@line 4078
   return;
  }
  ___async_unwind = 0; //@line 4081
  HEAP32[$ReallocAsyncCtx2 >> 2] = 82; //@line 4082
  $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 4083
  HEAP32[$16 >> 2] = $4; //@line 4084
  $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 4085
  HEAP32[$17 >> 2] = $2; //@line 4086
  $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 4087
  HEAP32[$18 >> 2] = $6; //@line 4088
  $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 4089
  HEAP32[$19 >> 2] = $8; //@line 4090
  $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 4091
  HEAP32[$20 >> 2] = $AsyncRetVal; //@line 4092
  sp = STACKTOP; //@line 4093
  return;
 }
 $23 = HEAP32[(HEAP32[$2 >> 2] | 0) + 72 >> 2] | 0; //@line 4098
 $25 = HEAP8[$10 >> 0] | 0; //@line 4100
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(36) | 0; //@line 4101
 FUNCTION_TABLE_iii[$23 & 7]($2, $25) | 0; //@line 4102
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 84; //@line 4105
  $26 = $ReallocAsyncCtx4 + 4 | 0; //@line 4106
  HEAP32[$26 >> 2] = 0; //@line 4107
  $27 = $ReallocAsyncCtx4 + 8 | 0; //@line 4108
  HEAP32[$27 >> 2] = $AsyncRetVal; //@line 4109
  $28 = $ReallocAsyncCtx4 + 12 | 0; //@line 4110
  HEAP32[$28 >> 2] = $4; //@line 4111
  $29 = $ReallocAsyncCtx4 + 16 | 0; //@line 4112
  HEAP32[$29 >> 2] = $2; //@line 4113
  $30 = $ReallocAsyncCtx4 + 20 | 0; //@line 4114
  HEAP32[$30 >> 2] = $2; //@line 4115
  $31 = $ReallocAsyncCtx4 + 24 | 0; //@line 4116
  HEAP32[$31 >> 2] = $10; //@line 4117
  $32 = $ReallocAsyncCtx4 + 28 | 0; //@line 4118
  HEAP32[$32 >> 2] = $6; //@line 4119
  $33 = $ReallocAsyncCtx4 + 32 | 0; //@line 4120
  HEAP32[$33 >> 2] = $8; //@line 4121
  sp = STACKTOP; //@line 4122
  return;
 }
 ___async_unwind = 0; //@line 4125
 HEAP32[$ReallocAsyncCtx4 >> 2] = 84; //@line 4126
 $26 = $ReallocAsyncCtx4 + 4 | 0; //@line 4127
 HEAP32[$26 >> 2] = 0; //@line 4128
 $27 = $ReallocAsyncCtx4 + 8 | 0; //@line 4129
 HEAP32[$27 >> 2] = $AsyncRetVal; //@line 4130
 $28 = $ReallocAsyncCtx4 + 12 | 0; //@line 4131
 HEAP32[$28 >> 2] = $4; //@line 4132
 $29 = $ReallocAsyncCtx4 + 16 | 0; //@line 4133
 HEAP32[$29 >> 2] = $2; //@line 4134
 $30 = $ReallocAsyncCtx4 + 20 | 0; //@line 4135
 HEAP32[$30 >> 2] = $2; //@line 4136
 $31 = $ReallocAsyncCtx4 + 24 | 0; //@line 4137
 HEAP32[$31 >> 2] = $10; //@line 4138
 $32 = $ReallocAsyncCtx4 + 28 | 0; //@line 4139
 HEAP32[$32 >> 2] = $6; //@line 4140
 $33 = $ReallocAsyncCtx4 + 32 | 0; //@line 4141
 HEAP32[$33 >> 2] = $8; //@line 4142
 sp = STACKTOP; //@line 4143
 return;
}
function __ZN11TextDisplay3clsEv($0) {
 $0 = $0 | 0;
 var $$03 = 0, $13 = 0, $14 = 0, $24 = 0, $27 = 0, $28 = 0, $3 = 0, $35 = 0, $36 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx12 = 0, $AsyncCtx16 = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4515
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 112 >> 2] | 0; //@line 4518
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 4519
 FUNCTION_TABLE_viii[$3 & 3]($0, 0, 0); //@line 4520
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 155; //@line 4523
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 4525
  sp = STACKTOP; //@line 4526
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 4529
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 100 >> 2] | 0; //@line 4532
 $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 4533
 $8 = FUNCTION_TABLE_ii[$7 & 31]($0) | 0; //@line 4534
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 156; //@line 4537
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 4539
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 4541
  sp = STACKTOP; //@line 4542
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 4545
 $13 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 4548
 $AsyncCtx5 = _emscripten_alloc_async_context(16, sp) | 0; //@line 4549
 $14 = FUNCTION_TABLE_ii[$13 & 31]($0) | 0; //@line 4550
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 157; //@line 4553
  HEAP32[$AsyncCtx5 + 4 >> 2] = $8; //@line 4555
  HEAP32[$AsyncCtx5 + 8 >> 2] = $0; //@line 4557
  HEAP32[$AsyncCtx5 + 12 >> 2] = $0; //@line 4559
  sp = STACKTOP; //@line 4560
  return;
 }
 _emscripten_free_async_context($AsyncCtx5 | 0); //@line 4563
 if ((Math_imul($14, $8) | 0) <= 0) {
  return;
 }
 $$03 = 0; //@line 4569
 while (1) {
  $AsyncCtx16 = _emscripten_alloc_async_context(20, sp) | 0; //@line 4571
  __ZN4mbed6Stream4putcEi($0, 32) | 0; //@line 4572
  if (___async) {
   label = 11; //@line 4575
   break;
  }
  _emscripten_free_async_context($AsyncCtx16 | 0); //@line 4578
  $24 = $$03 + 1 | 0; //@line 4579
  $27 = HEAP32[(HEAP32[$0 >> 2] | 0) + 100 >> 2] | 0; //@line 4582
  $AsyncCtx9 = _emscripten_alloc_async_context(20, sp) | 0; //@line 4583
  $28 = FUNCTION_TABLE_ii[$27 & 31]($0) | 0; //@line 4584
  if (___async) {
   label = 13; //@line 4587
   break;
  }
  _emscripten_free_async_context($AsyncCtx9 | 0); //@line 4590
  $35 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 4593
  $AsyncCtx12 = _emscripten_alloc_async_context(24, sp) | 0; //@line 4594
  $36 = FUNCTION_TABLE_ii[$35 & 31]($0) | 0; //@line 4595
  if (___async) {
   label = 15; //@line 4598
   break;
  }
  _emscripten_free_async_context($AsyncCtx12 | 0); //@line 4601
  if (($24 | 0) < (Math_imul($36, $28) | 0)) {
   $$03 = $24; //@line 4605
  } else {
   label = 9; //@line 4607
   break;
  }
 }
 if ((label | 0) == 9) {
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx16 >> 2] = 158; //@line 4615
  HEAP32[$AsyncCtx16 + 4 >> 2] = $$03; //@line 4617
  HEAP32[$AsyncCtx16 + 8 >> 2] = $0; //@line 4619
  HEAP32[$AsyncCtx16 + 12 >> 2] = $0; //@line 4621
  HEAP32[$AsyncCtx16 + 16 >> 2] = $0; //@line 4623
  sp = STACKTOP; //@line 4624
  return;
 } else if ((label | 0) == 13) {
  HEAP32[$AsyncCtx9 >> 2] = 159; //@line 4628
  HEAP32[$AsyncCtx9 + 4 >> 2] = $0; //@line 4630
  HEAP32[$AsyncCtx9 + 8 >> 2] = $0; //@line 4632
  HEAP32[$AsyncCtx9 + 12 >> 2] = $24; //@line 4634
  HEAP32[$AsyncCtx9 + 16 >> 2] = $0; //@line 4636
  sp = STACKTOP; //@line 4637
  return;
 } else if ((label | 0) == 15) {
  HEAP32[$AsyncCtx12 >> 2] = 160; //@line 4641
  HEAP32[$AsyncCtx12 + 4 >> 2] = $28; //@line 4643
  HEAP32[$AsyncCtx12 + 8 >> 2] = $24; //@line 4645
  HEAP32[$AsyncCtx12 + 12 >> 2] = $0; //@line 4647
  HEAP32[$AsyncCtx12 + 16 >> 2] = $0; //@line 4649
  HEAP32[$AsyncCtx12 + 20 >> 2] = $0; //@line 4651
  sp = STACKTOP; //@line 4652
  return;
 }
}
function _vfprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $$0 = 0, $$1 = 0, $13 = 0, $14 = 0, $19 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $28 = 0, $29 = 0, $3 = 0, $32 = 0, $4 = 0, $43 = 0, $5 = 0, $51 = 0, $6 = 0, $AsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 10216
 STACKTOP = STACKTOP + 224 | 0; //@line 10217
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 10217
 $3 = sp + 120 | 0; //@line 10218
 $4 = sp + 80 | 0; //@line 10219
 $5 = sp; //@line 10220
 $6 = sp + 136 | 0; //@line 10221
 dest = $4; //@line 10222
 stop = dest + 40 | 0; //@line 10222
 do {
  HEAP32[dest >> 2] = 0; //@line 10222
  dest = dest + 4 | 0; //@line 10222
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 10224
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 10228
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 10235
  } else {
   $43 = 0; //@line 10237
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 10239
  $14 = $13 & 32; //@line 10240
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 10246
  }
  $19 = $0 + 48 | 0; //@line 10248
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 10253
    $24 = HEAP32[$23 >> 2] | 0; //@line 10254
    HEAP32[$23 >> 2] = $6; //@line 10255
    $25 = $0 + 28 | 0; //@line 10256
    HEAP32[$25 >> 2] = $6; //@line 10257
    $26 = $0 + 20 | 0; //@line 10258
    HEAP32[$26 >> 2] = $6; //@line 10259
    HEAP32[$19 >> 2] = 80; //@line 10260
    $28 = $0 + 16 | 0; //@line 10262
    HEAP32[$28 >> 2] = $6 + 80; //@line 10263
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 10264
    if (!$24) {
     $$1 = $29; //@line 10267
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 10270
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 10271
     FUNCTION_TABLE_iiii[$32 & 15]($0, 0, 0) | 0; //@line 10272
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 191; //@line 10275
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 10277
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 10279
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 10281
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 10283
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 10285
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 10287
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 10289
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 10291
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 10293
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 10295
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 10297
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 10299
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 10301
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 10303
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 10305
      sp = STACKTOP; //@line 10306
      STACKTOP = sp; //@line 10307
      return 0; //@line 10307
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 10309
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 10312
      HEAP32[$23 >> 2] = $24; //@line 10313
      HEAP32[$19 >> 2] = 0; //@line 10314
      HEAP32[$28 >> 2] = 0; //@line 10315
      HEAP32[$25 >> 2] = 0; //@line 10316
      HEAP32[$26 >> 2] = 0; //@line 10317
      $$1 = $$; //@line 10318
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 10324
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 10327
  HEAP32[$0 >> 2] = $51 | $14; //@line 10332
  if ($43 | 0) {
   ___unlockfile($0); //@line 10335
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 10337
 }
 STACKTOP = sp; //@line 10339
 return $$0 | 0; //@line 10339
}
function __ZN11TextDisplay5_putcEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $11 = 0, $12 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $25 = 0, $31 = 0, $32 = 0, $35 = 0, $36 = 0, $45 = 0, $46 = 0, $49 = 0, $5 = 0, $50 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 4331
 _emscripten_asm_const_ii(6, $1 | 0) | 0; //@line 4332
 if (($1 | 0) == 10) {
  HEAP16[$0 + 24 >> 1] = 0; //@line 4336
  $5 = $0 + 26 | 0; //@line 4337
  $7 = (HEAP16[$5 >> 1] | 0) + 1 << 16 >> 16; //@line 4339
  HEAP16[$5 >> 1] = $7; //@line 4340
  $8 = $7 & 65535; //@line 4341
  $11 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 4344
  $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 4345
  $12 = FUNCTION_TABLE_ii[$11 & 31]($0) | 0; //@line 4346
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 149; //@line 4349
   HEAP32[$AsyncCtx + 4 >> 2] = $8; //@line 4351
   HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 4353
   HEAP32[$AsyncCtx + 12 >> 2] = $5; //@line 4355
   sp = STACKTOP; //@line 4356
   return 0; //@line 4357
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4359
  if (($12 | 0) > ($8 | 0)) {
   return $1 | 0; //@line 4362
  }
  HEAP16[$5 >> 1] = 0; //@line 4364
  return $1 | 0; //@line 4365
 }
 $19 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 4369
 $20 = $0 + 24 | 0; //@line 4370
 $22 = HEAPU16[$20 >> 1] | 0; //@line 4372
 $23 = $0 + 26 | 0; //@line 4373
 $25 = HEAPU16[$23 >> 1] | 0; //@line 4375
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 4376
 FUNCTION_TABLE_viiii[$19 & 7]($0, $22, $25, $1); //@line 4377
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 150; //@line 4380
  HEAP32[$AsyncCtx3 + 4 >> 2] = $20; //@line 4382
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 4384
  HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 4386
  HEAP32[$AsyncCtx3 + 16 >> 2] = $23; //@line 4388
  sp = STACKTOP; //@line 4389
  return 0; //@line 4390
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4392
 $31 = (HEAP16[$20 >> 1] | 0) + 1 << 16 >> 16; //@line 4394
 HEAP16[$20 >> 1] = $31; //@line 4395
 $32 = $31 & 65535; //@line 4396
 $35 = HEAP32[(HEAP32[$0 >> 2] | 0) + 100 >> 2] | 0; //@line 4399
 $AsyncCtx6 = _emscripten_alloc_async_context(28, sp) | 0; //@line 4400
 $36 = FUNCTION_TABLE_ii[$35 & 31]($0) | 0; //@line 4401
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 151; //@line 4404
  HEAP32[$AsyncCtx6 + 4 >> 2] = $32; //@line 4406
  HEAP32[$AsyncCtx6 + 8 >> 2] = $1; //@line 4408
  HEAP32[$AsyncCtx6 + 12 >> 2] = $20; //@line 4410
  HEAP32[$AsyncCtx6 + 16 >> 2] = $23; //@line 4412
  HEAP32[$AsyncCtx6 + 20 >> 2] = $0; //@line 4414
  HEAP32[$AsyncCtx6 + 24 >> 2] = $0; //@line 4416
  sp = STACKTOP; //@line 4417
  return 0; //@line 4418
 }
 _emscripten_free_async_context($AsyncCtx6 | 0); //@line 4420
 if (($36 | 0) > ($32 | 0)) {
  return $1 | 0; //@line 4423
 }
 HEAP16[$20 >> 1] = 0; //@line 4425
 $45 = (HEAP16[$23 >> 1] | 0) + 1 << 16 >> 16; //@line 4427
 HEAP16[$23 >> 1] = $45; //@line 4428
 $46 = $45 & 65535; //@line 4429
 $49 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 4432
 $AsyncCtx10 = _emscripten_alloc_async_context(16, sp) | 0; //@line 4433
 $50 = FUNCTION_TABLE_ii[$49 & 31]($0) | 0; //@line 4434
 if (___async) {
  HEAP32[$AsyncCtx10 >> 2] = 152; //@line 4437
  HEAP32[$AsyncCtx10 + 4 >> 2] = $46; //@line 4439
  HEAP32[$AsyncCtx10 + 8 >> 2] = $1; //@line 4441
  HEAP32[$AsyncCtx10 + 12 >> 2] = $23; //@line 4443
  sp = STACKTOP; //@line 4444
  return 0; //@line 4445
 }
 _emscripten_free_async_context($AsyncCtx10 | 0); //@line 4447
 if (($50 | 0) > ($46 | 0)) {
  return $1 | 0; //@line 4450
 }
 HEAP16[$23 >> 1] = 0; //@line 4452
 return $1 | 0; //@line 4453
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 1578
 STACKTOP = STACKTOP + 64 | 0; //@line 1579
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 1579
 $4 = sp; //@line 1580
 $5 = HEAP32[$0 >> 2] | 0; //@line 1581
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 1584
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 1586
 HEAP32[$4 >> 2] = $2; //@line 1587
 HEAP32[$4 + 4 >> 2] = $0; //@line 1589
 HEAP32[$4 + 8 >> 2] = $1; //@line 1591
 HEAP32[$4 + 12 >> 2] = $3; //@line 1593
 $14 = $4 + 16 | 0; //@line 1594
 $15 = $4 + 20 | 0; //@line 1595
 $16 = $4 + 24 | 0; //@line 1596
 $17 = $4 + 28 | 0; //@line 1597
 $18 = $4 + 32 | 0; //@line 1598
 $19 = $4 + 40 | 0; //@line 1599
 dest = $14; //@line 1600
 stop = dest + 36 | 0; //@line 1600
 do {
  HEAP32[dest >> 2] = 0; //@line 1600
  dest = dest + 4 | 0; //@line 1600
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 1600
 HEAP8[$14 + 38 >> 0] = 0; //@line 1600
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 1605
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 1608
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1609
   FUNCTION_TABLE_viiiiii[$24 & 7]($10, $4, $8, $8, 1, 0); //@line 1610
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 211; //@line 1613
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 1615
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 1617
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 1619
    sp = STACKTOP; //@line 1620
    STACKTOP = sp; //@line 1621
    return 0; //@line 1621
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 1623
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 1627
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 1631
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 1634
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 1635
   FUNCTION_TABLE_viiiii[$33 & 7]($10, $4, $8, 1, 0); //@line 1636
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 212; //@line 1639
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 1641
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 1643
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 1645
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 1647
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 1649
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 1651
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 1653
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 1655
    sp = STACKTOP; //@line 1656
    STACKTOP = sp; //@line 1657
    return 0; //@line 1657
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1659
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 1673
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 1681
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 1697
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 1702
  }
 } while (0);
 STACKTOP = sp; //@line 1705
 return $$0 | 0; //@line 1705
}
function __ZN6C128328print_bmE6Bitmapii($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$02225 = 0, $$02225$us = 0, $$023$us30 = 0, $10 = 0, $11 = 0, $13 = 0, $27 = 0, $30 = 0, $5 = 0, $53 = 0, $55 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3639
 $5 = HEAP32[$1 + 4 >> 2] | 0; //@line 3641
 if (($5 | 0) <= 0) {
  return;
 }
 $7 = HEAP32[$1 >> 2] | 0; //@line 3646
 $9 = $1 + 12 | 0; //@line 3648
 $10 = $1 + 8 | 0; //@line 3649
 if (($7 | 0) > 0) {
  $$02225$us = 0; //@line 3651
 } else {
  $$02225 = 0; //@line 3653
  do {
   $$02225 = $$02225 + 1 | 0; //@line 3655
  } while (($$02225 | 0) < ($5 | 0));
  return;
 }
 L8 : while (1) {
  $11 = $$02225$us + $3 | 0; //@line 3666
  L10 : do {
   if (($11 | 0) <= 31) {
    $$023$us30 = 0; //@line 3670
    while (1) {
     $13 = $$023$us30 + $2 | 0; //@line 3672
     if (($13 | 0) > 127) {
      break L10;
     }
     $27 = (128 >>> ($$023$us30 & 7) & HEAP8[(HEAP32[$9 >> 2] | 0) + ((Math_imul(HEAP32[$10 >> 2] | 0, $$02225$us) | 0) + ($$023$us30 >>> 3 & 31)) >> 0] | 0) == 0; //@line 3689
     $30 = HEAP32[(HEAP32[$0 >> 2] | 0) + 124 >> 2] | 0; //@line 3692
     if ($27) {
      $AsyncCtx3 = _emscripten_alloc_async_context(48, sp) | 0; //@line 3694
      FUNCTION_TABLE_viiii[$30 & 7]($0, $13, $11, 0); //@line 3695
      if (___async) {
       label = 10; //@line 3698
       break L8;
      }
      _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3701
     } else {
      $AsyncCtx = _emscripten_alloc_async_context(48, sp) | 0; //@line 3703
      FUNCTION_TABLE_viiii[$30 & 7]($0, $13, $11, 1); //@line 3704
      if (___async) {
       label = 7; //@line 3707
       break L8;
      }
      _emscripten_free_async_context($AsyncCtx | 0); //@line 3710
     }
     $53 = $$023$us30 + 1 | 0; //@line 3712
     if (($53 | 0) < ($7 | 0)) {
      $$023$us30 = $53; //@line 3715
     } else {
      break;
     }
    }
   }
  } while (0);
  $55 = $$02225$us + 1 | 0; //@line 3722
  if (($55 | 0) < ($5 | 0)) {
   $$02225$us = $55; //@line 3725
  } else {
   label = 15; //@line 3727
   break;
  }
 }
 if ((label | 0) == 7) {
  HEAP32[$AsyncCtx >> 2] = 131; //@line 3732
  HEAP32[$AsyncCtx + 4 >> 2] = $$023$us30; //@line 3734
  HEAP32[$AsyncCtx + 8 >> 2] = $7; //@line 3736
  HEAP32[$AsyncCtx + 12 >> 2] = $2; //@line 3738
  HEAP32[$AsyncCtx + 16 >> 2] = $$02225$us; //@line 3740
  HEAP32[$AsyncCtx + 20 >> 2] = $5; //@line 3742
  HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 3744
  HEAP32[$AsyncCtx + 28 >> 2] = $9; //@line 3746
  HEAP32[$AsyncCtx + 32 >> 2] = $10; //@line 3748
  HEAP32[$AsyncCtx + 36 >> 2] = $0; //@line 3750
  HEAP32[$AsyncCtx + 40 >> 2] = $0; //@line 3752
  HEAP32[$AsyncCtx + 44 >> 2] = $11; //@line 3754
  sp = STACKTOP; //@line 3755
  return;
 } else if ((label | 0) == 10) {
  HEAP32[$AsyncCtx3 >> 2] = 132; //@line 3759
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$023$us30; //@line 3761
  HEAP32[$AsyncCtx3 + 8 >> 2] = $7; //@line 3763
  HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 3765
  HEAP32[$AsyncCtx3 + 16 >> 2] = $$02225$us; //@line 3767
  HEAP32[$AsyncCtx3 + 20 >> 2] = $5; //@line 3769
  HEAP32[$AsyncCtx3 + 24 >> 2] = $3; //@line 3771
  HEAP32[$AsyncCtx3 + 28 >> 2] = $9; //@line 3773
  HEAP32[$AsyncCtx3 + 32 >> 2] = $10; //@line 3775
  HEAP32[$AsyncCtx3 + 36 >> 2] = $0; //@line 3777
  HEAP32[$AsyncCtx3 + 40 >> 2] = $0; //@line 3779
  HEAP32[$AsyncCtx3 + 44 >> 2] = $11; //@line 3781
  sp = STACKTOP; //@line 3782
  return;
 } else if ((label | 0) == 15) {
  return;
 }
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 10088
 $7 = ($2 | 0) != 0; //@line 10092
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 10096
   $$03555 = $0; //@line 10097
   $$03654 = $2; //@line 10097
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 10102
     $$036$lcssa64 = $$03654; //@line 10102
     label = 6; //@line 10103
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 10106
    $12 = $$03654 + -1 | 0; //@line 10107
    $16 = ($12 | 0) != 0; //@line 10111
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 10114
     $$03654 = $12; //@line 10114
    } else {
     $$035$lcssa = $11; //@line 10116
     $$036$lcssa = $12; //@line 10116
     $$lcssa = $16; //@line 10116
     label = 5; //@line 10117
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 10122
   $$036$lcssa = $2; //@line 10122
   $$lcssa = $7; //@line 10122
   label = 5; //@line 10123
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 10128
   $$036$lcssa64 = $$036$lcssa; //@line 10128
   label = 6; //@line 10129
  } else {
   $$2 = $$035$lcssa; //@line 10131
   $$3 = 0; //@line 10131
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 10137
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 10140
    $$3 = $$036$lcssa64; //@line 10140
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 10142
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 10146
      $$13745 = $$036$lcssa64; //@line 10146
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 10149
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 10158
       $30 = $$13745 + -4 | 0; //@line 10159
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 10162
        $$13745 = $30; //@line 10162
       } else {
        $$0$lcssa = $29; //@line 10164
        $$137$lcssa = $30; //@line 10164
        label = 11; //@line 10165
        break L11;
       }
      }
      $$140 = $$046; //@line 10169
      $$23839 = $$13745; //@line 10169
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 10171
      $$137$lcssa = $$036$lcssa64; //@line 10171
      label = 11; //@line 10172
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 10178
      $$3 = 0; //@line 10178
      break;
     } else {
      $$140 = $$0$lcssa; //@line 10181
      $$23839 = $$137$lcssa; //@line 10181
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 10188
      $$3 = $$23839; //@line 10188
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 10191
     $$23839 = $$23839 + -1 | 0; //@line 10192
     if (!$$23839) {
      $$2 = $35; //@line 10195
      $$3 = 0; //@line 10195
      break;
     } else {
      $$140 = $35; //@line 10198
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 10206
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 9859
 do {
  if (!$0) {
   do {
    if (!(HEAP32[357] | 0)) {
     $34 = 0; //@line 9867
    } else {
     $12 = HEAP32[357] | 0; //@line 9869
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 9870
     $13 = _fflush($12) | 0; //@line 9871
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 187; //@line 9874
      sp = STACKTOP; //@line 9875
      return 0; //@line 9876
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 9878
      $34 = $13; //@line 9879
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 9885
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 9889
    } else {
     $$02327 = $$02325; //@line 9891
     $$02426 = $34; //@line 9891
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 9898
      } else {
       $28 = 0; //@line 9900
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 9908
       $25 = ___fflush_unlocked($$02327) | 0; //@line 9909
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 9914
       $$1 = $25 | $$02426; //@line 9916
      } else {
       $$1 = $$02426; //@line 9918
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 9922
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 9925
      if (!$$023) {
       $$024$lcssa = $$1; //@line 9928
       break L9;
      } else {
       $$02327 = $$023; //@line 9931
       $$02426 = $$1; //@line 9931
      }
     }
     HEAP32[$AsyncCtx >> 2] = 188; //@line 9934
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 9936
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 9938
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 9940
     sp = STACKTOP; //@line 9941
     return 0; //@line 9942
    }
   } while (0);
   ___ofl_unlock(); //@line 9945
   $$0 = $$024$lcssa; //@line 9946
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 9952
    $5 = ___fflush_unlocked($0) | 0; //@line 9953
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 185; //@line 9956
     sp = STACKTOP; //@line 9957
     return 0; //@line 9958
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 9960
     $$0 = $5; //@line 9961
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 9966
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 9967
   $7 = ___fflush_unlocked($0) | 0; //@line 9968
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 186; //@line 9971
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 9974
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 9976
    sp = STACKTOP; //@line 9977
    return 0; //@line 9978
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9980
   if ($phitmp) {
    $$0 = $7; //@line 9982
   } else {
    ___unlockfile($0); //@line 9984
    $$0 = $7; //@line 9985
   }
  }
 } while (0);
 return $$0 | 0; //@line 9989
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1760
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 1766
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 1772
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 1775
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1776
    FUNCTION_TABLE_viiiii[$53 & 7]($50, $1, $2, $3, $4); //@line 1777
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 215; //@line 1780
     sp = STACKTOP; //@line 1781
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1784
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 1792
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 1797
     $19 = $1 + 44 | 0; //@line 1798
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 1804
     HEAP8[$22 >> 0] = 0; //@line 1805
     $23 = $1 + 53 | 0; //@line 1806
     HEAP8[$23 >> 0] = 0; //@line 1807
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 1809
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 1812
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 1813
     FUNCTION_TABLE_viiiiii[$28 & 7]($25, $1, $2, $2, 1, $4); //@line 1814
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 214; //@line 1817
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 1819
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 1821
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 1823
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 1825
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 1827
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 1829
      sp = STACKTOP; //@line 1830
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 1833
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 1837
      label = 13; //@line 1838
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 1843
       label = 13; //@line 1844
      } else {
       $$037$off039 = 3; //@line 1846
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 1850
      $39 = $1 + 40 | 0; //@line 1851
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 1854
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 1864
        $$037$off039 = $$037$off038; //@line 1865
       } else {
        $$037$off039 = $$037$off038; //@line 1867
       }
      } else {
       $$037$off039 = $$037$off038; //@line 1870
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 1873
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 1880
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_51($0) {
 $0 = $0 | 0;
 var $$13 = 0, $$expand_i1_val = 0, $10 = 0, $12 = 0, $18 = 0, $19 = 0, $2 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 7120
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7122
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7124
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 7127
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7129
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7131
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 7133
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 7137
 $$13 = ($AsyncRetVal | 0) >= ($12 | 0) ? 0 : $AsyncRetVal; //@line 7139
 $18 = (HEAP32[$0 + 28 >> 2] | 0) + $$13 | 0; //@line 7141
 $19 = $12 - $$13 | 0; //@line 7142
 do {
  if (($$13 | 0) > 0) {
   $21 = HEAP32[90] | 0; //@line 7146
   if (!(($19 | 0) > 0 & ($21 | 0) != 0)) {
    if (($$13 | 0) < 1 | ($19 | 0) < 1 | $6 ^ 1) {
     break;
    }
    _snprintf($18, $19, 2299, $8) | 0; //@line 7158
    break;
   }
   $ReallocAsyncCtx6 = _emscripten_realloc_async_context(32) | 0; //@line 7161
   $23 = FUNCTION_TABLE_i[$21 & 0]() | 0; //@line 7162
   if (___async) {
    HEAP32[$ReallocAsyncCtx6 >> 2] = 46; //@line 7165
    $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 7166
    HEAP32[$24 >> 2] = $2; //@line 7167
    $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 7168
    HEAP32[$25 >> 2] = $18; //@line 7169
    $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 7170
    HEAP32[$26 >> 2] = $19; //@line 7171
    $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 7172
    HEAP32[$27 >> 2] = $4; //@line 7173
    $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 7174
    $$expand_i1_val = $6 & 1; //@line 7175
    HEAP8[$28 >> 0] = $$expand_i1_val; //@line 7176
    $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 7177
    HEAP32[$29 >> 2] = $8; //@line 7178
    $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 7179
    HEAP32[$30 >> 2] = $10; //@line 7180
    sp = STACKTOP; //@line 7181
    return;
   }
   HEAP32[___async_retval >> 2] = $23; //@line 7185
   ___async_unwind = 0; //@line 7186
   HEAP32[$ReallocAsyncCtx6 >> 2] = 46; //@line 7187
   $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 7188
   HEAP32[$24 >> 2] = $2; //@line 7189
   $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 7190
   HEAP32[$25 >> 2] = $18; //@line 7191
   $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 7192
   HEAP32[$26 >> 2] = $19; //@line 7193
   $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 7194
   HEAP32[$27 >> 2] = $4; //@line 7195
   $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 7196
   $$expand_i1_val = $6 & 1; //@line 7197
   HEAP8[$28 >> 0] = $$expand_i1_val; //@line 7198
   $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 7199
   HEAP32[$29 >> 2] = $8; //@line 7200
   $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 7201
   HEAP32[$30 >> 2] = $10; //@line 7202
   sp = STACKTOP; //@line 7203
   return;
  }
 } while (0);
 $34 = HEAP32[91] | 0; //@line 7207
 $35 = HEAP32[84] | 0; //@line 7208
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 7209
 FUNCTION_TABLE_vi[$34 & 255]($35); //@line 7210
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 7213
  sp = STACKTOP; //@line 7214
  return;
 }
 ___async_unwind = 0; //@line 7217
 HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 7218
 sp = STACKTOP; //@line 7219
 return;
}
function _mbed_vtracef__async_cb_52($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 7229
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7231
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7233
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7235
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7237
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7239
 $12 = HEAP8[$0 + 24 >> 0] & 1; //@line 7242
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 7244
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 7246
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 7248
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 7250
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 7252
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 7254
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 7256
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 7258
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 7260
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 7262
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 7264
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 7266
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 7268
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 7270
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 7272
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 7274
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 7276
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 7278
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 7280
 $55 = ($30 | 0 ? 4 : 0) + $30 + (HEAP32[___async_retval >> 2] | 0) | 0; //@line 7286
 $56 = HEAP32[89] | 0; //@line 7287
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(100) | 0; //@line 7288
 $57 = FUNCTION_TABLE_ii[$56 & 31]($55) | 0; //@line 7289
 if (!___async) {
  HEAP32[___async_retval >> 2] = $57; //@line 7293
  ___async_unwind = 0; //@line 7294
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 44; //@line 7296
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 7298
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 7300
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 7302
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $18; //@line 7304
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $20; //@line 7306
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $22; //@line 7308
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $24; //@line 7310
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $26; //@line 7312
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $28; //@line 7314
 HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $32; //@line 7316
 HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $34; //@line 7318
 HEAP8[$ReallocAsyncCtx5 + 48 >> 0] = $12 & 1; //@line 7321
 HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $14; //@line 7323
 HEAP32[$ReallocAsyncCtx5 + 56 >> 2] = $16; //@line 7325
 HEAP32[$ReallocAsyncCtx5 + 60 >> 2] = $36; //@line 7327
 HEAP32[$ReallocAsyncCtx5 + 64 >> 2] = $38; //@line 7329
 HEAP32[$ReallocAsyncCtx5 + 68 >> 2] = $40; //@line 7331
 HEAP32[$ReallocAsyncCtx5 + 72 >> 2] = $42; //@line 7333
 HEAP32[$ReallocAsyncCtx5 + 76 >> 2] = $44; //@line 7335
 HEAP32[$ReallocAsyncCtx5 + 80 >> 2] = $8; //@line 7337
 HEAP32[$ReallocAsyncCtx5 + 84 >> 2] = $10; //@line 7339
 HEAP32[$ReallocAsyncCtx5 + 88 >> 2] = $46; //@line 7341
 HEAP32[$ReallocAsyncCtx5 + 92 >> 2] = $48; //@line 7343
 HEAP32[$ReallocAsyncCtx5 + 96 >> 2] = $50; //@line 7345
 sp = STACKTOP; //@line 7346
 return;
}
function __ZN4mbed6Stream4readEPvj__async_cb_25($0) {
 $0 = $0 | 0;
 var $$016$lcssa = 0, $10 = 0, $12 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5584
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5586
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5588
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5590
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5592
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5594
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5596
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5598
 if (($AsyncRetVal | 0) == -1) {
  $$016$lcssa = $4; //@line 5601
 } else {
  $20 = $4 + 1 | 0; //@line 5604
  HEAP8[$4 >> 0] = $AsyncRetVal; //@line 5605
  if (($20 | 0) == ($6 | 0)) {
   $$016$lcssa = $6; //@line 5608
  } else {
   $16 = HEAP32[(HEAP32[$12 >> 2] | 0) + 76 >> 2] | 0; //@line 5612
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 5613
   $17 = FUNCTION_TABLE_ii[$16 & 31]($10) | 0; //@line 5614
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 66; //@line 5617
    $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 5618
    HEAP32[$18 >> 2] = $2; //@line 5619
    $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 5620
    HEAP32[$19 >> 2] = $20; //@line 5621
    $21 = $ReallocAsyncCtx2 + 12 | 0; //@line 5622
    HEAP32[$21 >> 2] = $6; //@line 5623
    $22 = $ReallocAsyncCtx2 + 16 | 0; //@line 5624
    HEAP32[$22 >> 2] = $8; //@line 5625
    $23 = $ReallocAsyncCtx2 + 20 | 0; //@line 5626
    HEAP32[$23 >> 2] = $10; //@line 5627
    $24 = $ReallocAsyncCtx2 + 24 | 0; //@line 5628
    HEAP32[$24 >> 2] = $12; //@line 5629
    sp = STACKTOP; //@line 5630
    return;
   }
   HEAP32[___async_retval >> 2] = $17; //@line 5634
   ___async_unwind = 0; //@line 5635
   HEAP32[$ReallocAsyncCtx2 >> 2] = 66; //@line 5636
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 5637
   HEAP32[$18 >> 2] = $2; //@line 5638
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 5639
   HEAP32[$19 >> 2] = $20; //@line 5640
   $21 = $ReallocAsyncCtx2 + 12 | 0; //@line 5641
   HEAP32[$21 >> 2] = $6; //@line 5642
   $22 = $ReallocAsyncCtx2 + 16 | 0; //@line 5643
   HEAP32[$22 >> 2] = $8; //@line 5644
   $23 = $ReallocAsyncCtx2 + 20 | 0; //@line 5645
   HEAP32[$23 >> 2] = $10; //@line 5646
   $24 = $ReallocAsyncCtx2 + 24 | 0; //@line 5647
   HEAP32[$24 >> 2] = $12; //@line 5648
   sp = STACKTOP; //@line 5649
   return;
  }
 }
 $31 = HEAP32[(HEAP32[$8 >> 2] | 0) + 88 >> 2] | 0; //@line 5655
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 5656
 FUNCTION_TABLE_vi[$31 & 255]($10); //@line 5657
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 67; //@line 5660
  $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 5661
  HEAP32[$32 >> 2] = $$016$lcssa; //@line 5662
  $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 5663
  HEAP32[$33 >> 2] = $2; //@line 5664
  sp = STACKTOP; //@line 5665
  return;
 }
 ___async_unwind = 0; //@line 5668
 HEAP32[$ReallocAsyncCtx3 >> 2] = 67; //@line 5669
 $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 5670
 HEAP32[$32 >> 2] = $$016$lcssa; //@line 5671
 $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 5672
 HEAP32[$33 >> 2] = $2; //@line 5673
 sp = STACKTOP; //@line 5674
 return;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $12 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $29 = 0, $3 = 0, $36 = 0, $39 = 0, $40 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx14 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 1072
 STACKTOP = STACKTOP + 48 | 0; //@line 1073
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 1073
 $vararg_buffer10 = sp + 32 | 0; //@line 1074
 $vararg_buffer7 = sp + 24 | 0; //@line 1075
 $vararg_buffer3 = sp + 16 | 0; //@line 1076
 $vararg_buffer = sp; //@line 1077
 $0 = sp + 36 | 0; //@line 1078
 $1 = ___cxa_get_globals_fast() | 0; //@line 1079
 if ($1 | 0) {
  $3 = HEAP32[$1 >> 2] | 0; //@line 1082
  if ($3 | 0) {
   $7 = $3 + 48 | 0; //@line 1087
   $9 = HEAP32[$7 >> 2] | 0; //@line 1089
   $12 = HEAP32[$7 + 4 >> 2] | 0; //@line 1092
   if (!(($9 & -256 | 0) == 1126902528 & ($12 | 0) == 1129074247)) {
    HEAP32[$vararg_buffer7 >> 2] = 9209; //@line 1098
    _abort_message(9159, $vararg_buffer7); //@line 1099
   }
   if (($9 | 0) == 1126902529 & ($12 | 0) == 1129074247) {
    $22 = HEAP32[$3 + 44 >> 2] | 0; //@line 1108
   } else {
    $22 = $3 + 80 | 0; //@line 1110
   }
   HEAP32[$0 >> 2] = $22; //@line 1112
   $23 = HEAP32[$3 >> 2] | 0; //@line 1113
   $25 = HEAP32[$23 + 4 >> 2] | 0; //@line 1115
   $28 = HEAP32[(HEAP32[52] | 0) + 16 >> 2] | 0; //@line 1118
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 1119
   $29 = FUNCTION_TABLE_iiii[$28 & 15](208, $23, $0) | 0; //@line 1120
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 205; //@line 1123
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1125
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 1127
    HEAP32[$AsyncCtx + 12 >> 2] = $25; //@line 1129
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 1131
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 1133
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 1135
    sp = STACKTOP; //@line 1136
    STACKTOP = sp; //@line 1137
    return;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 1139
   if (!$29) {
    HEAP32[$vararg_buffer3 >> 2] = 9209; //@line 1141
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 1143
    _abort_message(9118, $vararg_buffer3); //@line 1144
   }
   $36 = HEAP32[$0 >> 2] | 0; //@line 1147
   $39 = HEAP32[(HEAP32[$36 >> 2] | 0) + 8 >> 2] | 0; //@line 1150
   $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1151
   $40 = FUNCTION_TABLE_ii[$39 & 31]($36) | 0; //@line 1152
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 206; //@line 1155
    HEAP32[$AsyncCtx14 + 4 >> 2] = $vararg_buffer; //@line 1157
    HEAP32[$AsyncCtx14 + 8 >> 2] = $25; //@line 1159
    HEAP32[$AsyncCtx14 + 12 >> 2] = $vararg_buffer; //@line 1161
    sp = STACKTOP; //@line 1162
    STACKTOP = sp; //@line 1163
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 1165
    HEAP32[$vararg_buffer >> 2] = 9209; //@line 1166
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 1168
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 1170
    _abort_message(9073, $vararg_buffer); //@line 1171
   }
  }
 }
 _abort_message(9197, $vararg_buffer10); //@line 1176
}
function __ZN4mbed6Stream5writeEPKvj__async_cb_54($0) {
 $0 = $0 | 0;
 var $$1 = 0, $10 = 0, $12 = 0, $17 = 0, $18 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 7513
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7515
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7517
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7519
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7521
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7523
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 7525
 if ((HEAP32[___async_retval >> 2] | 0) == -1) {
  $$1 = $2; //@line 7530
 } else {
  if (($2 | 0) == ($4 | 0)) {
   $$1 = $4; //@line 7534
  } else {
   $17 = HEAP32[(HEAP32[$12 >> 2] | 0) + 72 >> 2] | 0; //@line 7538
   $18 = $2 + 1 | 0; //@line 7539
   $20 = HEAP8[$2 >> 0] | 0; //@line 7541
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 7542
   $21 = FUNCTION_TABLE_iii[$17 & 7]($8, $20) | 0; //@line 7543
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 69; //@line 7546
    $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 7547
    HEAP32[$22 >> 2] = $18; //@line 7548
    $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 7549
    HEAP32[$23 >> 2] = $4; //@line 7550
    $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 7551
    HEAP32[$24 >> 2] = $6; //@line 7552
    $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 7553
    HEAP32[$25 >> 2] = $8; //@line 7554
    $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 7555
    HEAP32[$26 >> 2] = $10; //@line 7556
    $27 = $ReallocAsyncCtx2 + 24 | 0; //@line 7557
    HEAP32[$27 >> 2] = $12; //@line 7558
    sp = STACKTOP; //@line 7559
    return;
   }
   HEAP32[___async_retval >> 2] = $21; //@line 7563
   ___async_unwind = 0; //@line 7564
   HEAP32[$ReallocAsyncCtx2 >> 2] = 69; //@line 7565
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 7566
   HEAP32[$22 >> 2] = $18; //@line 7567
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 7568
   HEAP32[$23 >> 2] = $4; //@line 7569
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 7570
   HEAP32[$24 >> 2] = $6; //@line 7571
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 7572
   HEAP32[$25 >> 2] = $8; //@line 7573
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 7574
   HEAP32[$26 >> 2] = $10; //@line 7575
   $27 = $ReallocAsyncCtx2 + 24 | 0; //@line 7576
   HEAP32[$27 >> 2] = $12; //@line 7577
   sp = STACKTOP; //@line 7578
   return;
  }
 }
 $32 = HEAP32[(HEAP32[$6 >> 2] | 0) + 88 >> 2] | 0; //@line 7584
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 7585
 FUNCTION_TABLE_vi[$32 & 255]($8); //@line 7586
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 70; //@line 7589
  $33 = $ReallocAsyncCtx3 + 4 | 0; //@line 7590
  HEAP32[$33 >> 2] = $$1; //@line 7591
  $34 = $ReallocAsyncCtx3 + 8 | 0; //@line 7592
  HEAP32[$34 >> 2] = $10; //@line 7593
  sp = STACKTOP; //@line 7594
  return;
 }
 ___async_unwind = 0; //@line 7597
 HEAP32[$ReallocAsyncCtx3 >> 2] = 70; //@line 7598
 $33 = $ReallocAsyncCtx3 + 4 | 0; //@line 7599
 HEAP32[$33 >> 2] = $$1; //@line 7600
 $34 = $ReallocAsyncCtx3 + 8 | 0; //@line 7601
 HEAP32[$34 >> 2] = $10; //@line 7602
 sp = STACKTOP; //@line 7603
 return;
}
function _mbed_error_vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4632
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4634
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4636
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4638
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[2456] | 0)) {
  _serial_init(9828, 2, 3); //@line 4646
 }
 $9 = HEAP8[$4 >> 0] | 0; //@line 4648
 if (0 == 13 | $9 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 4654
  _serial_putc(9828, $9 << 24 >> 24); //@line 4655
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 105; //@line 4658
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 4659
   HEAP32[$18 >> 2] = 0; //@line 4660
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 4661
   HEAP32[$19 >> 2] = $AsyncRetVal; //@line 4662
   $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 4663
   HEAP32[$20 >> 2] = $2; //@line 4664
   $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 4665
   HEAP8[$21 >> 0] = $9; //@line 4666
   $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 4667
   HEAP32[$22 >> 2] = $4; //@line 4668
   sp = STACKTOP; //@line 4669
   return;
  }
  ___async_unwind = 0; //@line 4672
  HEAP32[$ReallocAsyncCtx2 >> 2] = 105; //@line 4673
  $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 4674
  HEAP32[$18 >> 2] = 0; //@line 4675
  $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 4676
  HEAP32[$19 >> 2] = $AsyncRetVal; //@line 4677
  $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 4678
  HEAP32[$20 >> 2] = $2; //@line 4679
  $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 4680
  HEAP8[$21 >> 0] = $9; //@line 4681
  $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 4682
  HEAP32[$22 >> 2] = $4; //@line 4683
  sp = STACKTOP; //@line 4684
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 4687
  _serial_putc(9828, 13); //@line 4688
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 104; //@line 4691
   $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 4692
   HEAP8[$12 >> 0] = $9; //@line 4693
   $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 4694
   HEAP32[$13 >> 2] = 0; //@line 4695
   $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 4696
   HEAP32[$14 >> 2] = $AsyncRetVal; //@line 4697
   $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 4698
   HEAP32[$15 >> 2] = $2; //@line 4699
   $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 4700
   HEAP32[$16 >> 2] = $4; //@line 4701
   sp = STACKTOP; //@line 4702
   return;
  }
  ___async_unwind = 0; //@line 4705
  HEAP32[$ReallocAsyncCtx3 >> 2] = 104; //@line 4706
  $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 4707
  HEAP8[$12 >> 0] = $9; //@line 4708
  $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 4709
  HEAP32[$13 >> 2] = 0; //@line 4710
  $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 4711
  HEAP32[$14 >> 2] = $AsyncRetVal; //@line 4712
  $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 4713
  HEAP32[$15 >> 2] = $2; //@line 4714
  $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 4715
  HEAP32[$16 >> 2] = $4; //@line 4716
  sp = STACKTOP; //@line 4717
  return;
 }
}
function _mbed_error_vfprintf__async_cb_18($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4725
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4729
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4731
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4735
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 4736
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP8[$10 + $12 >> 0] | 0; //@line 4742
 if ((HEAP8[$0 + 16 >> 0] | 0) == 13 | $13 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 4748
  _serial_putc(9828, $13 << 24 >> 24); //@line 4749
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 105; //@line 4752
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 4753
   HEAP32[$22 >> 2] = $12; //@line 4754
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 4755
   HEAP32[$23 >> 2] = $4; //@line 4756
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 4757
   HEAP32[$24 >> 2] = $6; //@line 4758
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 4759
   HEAP8[$25 >> 0] = $13; //@line 4760
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 4761
   HEAP32[$26 >> 2] = $10; //@line 4762
   sp = STACKTOP; //@line 4763
   return;
  }
  ___async_unwind = 0; //@line 4766
  HEAP32[$ReallocAsyncCtx2 >> 2] = 105; //@line 4767
  $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 4768
  HEAP32[$22 >> 2] = $12; //@line 4769
  $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 4770
  HEAP32[$23 >> 2] = $4; //@line 4771
  $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 4772
  HEAP32[$24 >> 2] = $6; //@line 4773
  $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 4774
  HEAP8[$25 >> 0] = $13; //@line 4775
  $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 4776
  HEAP32[$26 >> 2] = $10; //@line 4777
  sp = STACKTOP; //@line 4778
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 4781
  _serial_putc(9828, 13); //@line 4782
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 104; //@line 4785
   $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 4786
   HEAP8[$16 >> 0] = $13; //@line 4787
   $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 4788
   HEAP32[$17 >> 2] = $12; //@line 4789
   $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 4790
   HEAP32[$18 >> 2] = $4; //@line 4791
   $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 4792
   HEAP32[$19 >> 2] = $6; //@line 4793
   $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 4794
   HEAP32[$20 >> 2] = $10; //@line 4795
   sp = STACKTOP; //@line 4796
   return;
  }
  ___async_unwind = 0; //@line 4799
  HEAP32[$ReallocAsyncCtx3 >> 2] = 104; //@line 4800
  $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 4801
  HEAP8[$16 >> 0] = $13; //@line 4802
  $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 4803
  HEAP32[$17 >> 2] = $12; //@line 4804
  $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 4805
  HEAP32[$18 >> 2] = $4; //@line 4806
  $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 4807
  HEAP32[$19 >> 2] = $6; //@line 4808
  $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 4809
  HEAP32[$20 >> 2] = $10; //@line 4810
  sp = STACKTOP; //@line 4811
  return;
 }
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8470
 STACKTOP = STACKTOP + 48 | 0; //@line 8471
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 8471
 $vararg_buffer3 = sp + 16 | 0; //@line 8472
 $vararg_buffer = sp; //@line 8473
 $3 = sp + 32 | 0; //@line 8474
 $4 = $0 + 28 | 0; //@line 8475
 $5 = HEAP32[$4 >> 2] | 0; //@line 8476
 HEAP32[$3 >> 2] = $5; //@line 8477
 $7 = $0 + 20 | 0; //@line 8479
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 8481
 HEAP32[$3 + 4 >> 2] = $9; //@line 8482
 HEAP32[$3 + 8 >> 2] = $1; //@line 8484
 HEAP32[$3 + 12 >> 2] = $2; //@line 8486
 $12 = $9 + $2 | 0; //@line 8487
 $13 = $0 + 60 | 0; //@line 8488
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 8491
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 8493
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 8495
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 8497
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 8501
  } else {
   $$04756 = 2; //@line 8503
   $$04855 = $12; //@line 8503
   $$04954 = $3; //@line 8503
   $27 = $17; //@line 8503
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 8509
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 8511
    $38 = $27 >>> 0 > $37 >>> 0; //@line 8512
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 8514
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 8516
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 8518
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 8521
    $44 = $$150 + 4 | 0; //@line 8522
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 8525
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 8528
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 8530
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 8532
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 8534
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 8537
     break L1;
    } else {
     $$04756 = $$1; //@line 8540
     $$04954 = $$150; //@line 8540
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 8544
   HEAP32[$4 >> 2] = 0; //@line 8545
   HEAP32[$7 >> 2] = 0; //@line 8546
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 8549
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 8552
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 8557
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 8563
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 8568
  $25 = $20; //@line 8569
  HEAP32[$4 >> 2] = $25; //@line 8570
  HEAP32[$7 >> 2] = $25; //@line 8571
  $$051 = $2; //@line 8572
 }
 STACKTOP = sp; //@line 8574
 return $$051 | 0; //@line 8574
}
function _freopen__async_cb($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $28 = 0, $30 = 0, $31 = 0, $33 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 11479
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11481
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11483
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11485
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11489
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 11493
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 11495
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 11497
 if (!$14) {
  $$pre = $4 + 60 | 0; //@line 11502
  if ($2 & 524288 | 0) {
   HEAP32[$10 >> 2] = HEAP32[$$pre >> 2]; //@line 11505
   HEAP32[$10 + 4 >> 2] = 2; //@line 11507
   HEAP32[$10 + 8 >> 2] = 1; //@line 11509
   ___syscall221(221, $10 | 0) | 0; //@line 11510
  }
  HEAP32[$6 >> 2] = HEAP32[$$pre >> 2]; //@line 11514
  HEAP32[$6 + 4 >> 2] = 4; //@line 11516
  HEAP32[$6 + 8 >> 2] = $2 & -524481; //@line 11518
  if ((___syscall_ret(___syscall221(221, $6 | 0) | 0) | 0) >= 0) {
   if ($18 | 0) {
    ___unlockfile($4); //@line 11525
   }
   HEAP32[___async_retval >> 2] = $4; //@line 11528
   return;
  }
 } else {
  $28 = _fopen($14, $16) | 0; //@line 11532
  if ($28 | 0) {
   $30 = $28 + 60 | 0; //@line 11535
   $31 = HEAP32[$30 >> 2] | 0; //@line 11536
   $33 = HEAP32[$4 + 60 >> 2] | 0; //@line 11538
   if (($31 | 0) == ($33 | 0)) {
    HEAP32[$30 >> 2] = -1; //@line 11541
   } else {
    if ((___dup3($31, $33, $2 & 524288) | 0) < 0) {
     $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 11547
     _fclose($28) | 0; //@line 11548
     if (!___async) {
      ___async_unwind = 0; //@line 11551
     }
     HEAP32[$ReallocAsyncCtx3 >> 2] = 198; //@line 11553
     HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $4; //@line 11555
     sp = STACKTOP; //@line 11556
     return;
    }
   }
   HEAP32[$4 >> 2] = HEAP32[$4 >> 2] & 1 | HEAP32[$28 >> 2]; //@line 11564
   HEAP32[$4 + 32 >> 2] = HEAP32[$28 + 32 >> 2]; //@line 11568
   HEAP32[$4 + 36 >> 2] = HEAP32[$28 + 36 >> 2]; //@line 11572
   HEAP32[$4 + 40 >> 2] = HEAP32[$28 + 40 >> 2]; //@line 11576
   HEAP32[$4 + 12 >> 2] = HEAP32[$28 + 12 >> 2]; //@line 11580
   $ReallocAsyncCtx4 = _emscripten_realloc_async_context(12) | 0; //@line 11581
   _fclose($28) | 0; //@line 11582
   if (!___async) {
    ___async_unwind = 0; //@line 11585
   }
   HEAP32[$ReallocAsyncCtx4 >> 2] = 197; //@line 11587
   HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $18; //@line 11589
   HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $4; //@line 11591
   sp = STACKTOP; //@line 11592
   return;
  }
 }
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 11596
 _fclose($4) | 0; //@line 11597
 if (!___async) {
  ___async_unwind = 0; //@line 11600
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 199; //@line 11602
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 11604
 sp = STACKTOP; //@line 11605
 return;
}
function __ZN4mbed6Stream5writeEPKvj__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $26 = 0, $27 = 0, $28 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 7427
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7429
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7431
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7433
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7435
 if (($4 | 0) == ($6 | 0)) {
  $26 = HEAP32[(HEAP32[$8 >> 2] | 0) + 88 >> 2] | 0; //@line 7440
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 7441
  FUNCTION_TABLE_vi[$26 & 255]($2); //@line 7442
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 70; //@line 7445
   $27 = $ReallocAsyncCtx3 + 4 | 0; //@line 7446
   HEAP32[$27 >> 2] = $6; //@line 7447
   $28 = $ReallocAsyncCtx3 + 8 | 0; //@line 7448
   HEAP32[$28 >> 2] = $4; //@line 7449
   sp = STACKTOP; //@line 7450
   return;
  }
  ___async_unwind = 0; //@line 7453
  HEAP32[$ReallocAsyncCtx3 >> 2] = 70; //@line 7454
  $27 = $ReallocAsyncCtx3 + 4 | 0; //@line 7455
  HEAP32[$27 >> 2] = $6; //@line 7456
  $28 = $ReallocAsyncCtx3 + 8 | 0; //@line 7457
  HEAP32[$28 >> 2] = $4; //@line 7458
  sp = STACKTOP; //@line 7459
  return;
 } else {
  $12 = HEAP32[(HEAP32[$2 >> 2] | 0) + 72 >> 2] | 0; //@line 7464
  $13 = $4 + 1 | 0; //@line 7465
  $15 = HEAP8[$4 >> 0] | 0; //@line 7467
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 7468
  $16 = FUNCTION_TABLE_iii[$12 & 7]($2, $15) | 0; //@line 7469
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 69; //@line 7472
   $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 7473
   HEAP32[$17 >> 2] = $13; //@line 7474
   $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 7475
   HEAP32[$18 >> 2] = $6; //@line 7476
   $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 7477
   HEAP32[$19 >> 2] = $8; //@line 7478
   $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 7479
   HEAP32[$20 >> 2] = $2; //@line 7480
   $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 7481
   HEAP32[$21 >> 2] = $4; //@line 7482
   $22 = $ReallocAsyncCtx2 + 24 | 0; //@line 7483
   HEAP32[$22 >> 2] = $2; //@line 7484
   sp = STACKTOP; //@line 7485
   return;
  }
  HEAP32[___async_retval >> 2] = $16; //@line 7489
  ___async_unwind = 0; //@line 7490
  HEAP32[$ReallocAsyncCtx2 >> 2] = 69; //@line 7491
  $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 7492
  HEAP32[$17 >> 2] = $13; //@line 7493
  $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 7494
  HEAP32[$18 >> 2] = $6; //@line 7495
  $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 7496
  HEAP32[$19 >> 2] = $8; //@line 7497
  $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 7498
  HEAP32[$20 >> 2] = $2; //@line 7499
  $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 7500
  HEAP32[$21 >> 2] = $4; //@line 7501
  $22 = $ReallocAsyncCtx2 + 24 | 0; //@line 7502
  HEAP32[$22 >> 2] = $2; //@line 7503
  sp = STACKTOP; //@line 7504
  return;
 }
}
function __ZN4mbed6Stream4readEPvj__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $25 = 0, $26 = 0, $27 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5499
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5501
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5505
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5507
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5509
 if (!(HEAP32[$0 + 8 >> 2] | 0)) {
  $25 = HEAP32[(HEAP32[$10 >> 2] | 0) + 88 >> 2] | 0; //@line 5514
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 5515
  FUNCTION_TABLE_vi[$25 & 255]($2); //@line 5516
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 67; //@line 5519
   $26 = $ReallocAsyncCtx3 + 4 | 0; //@line 5520
   HEAP32[$26 >> 2] = $6; //@line 5521
   $27 = $ReallocAsyncCtx3 + 8 | 0; //@line 5522
   HEAP32[$27 >> 2] = $6; //@line 5523
   sp = STACKTOP; //@line 5524
   return;
  }
  ___async_unwind = 0; //@line 5527
  HEAP32[$ReallocAsyncCtx3 >> 2] = 67; //@line 5528
  $26 = $ReallocAsyncCtx3 + 4 | 0; //@line 5529
  HEAP32[$26 >> 2] = $6; //@line 5530
  $27 = $ReallocAsyncCtx3 + 8 | 0; //@line 5531
  HEAP32[$27 >> 2] = $6; //@line 5532
  sp = STACKTOP; //@line 5533
  return;
 } else {
  $14 = HEAP32[(HEAP32[$2 >> 2] | 0) + 76 >> 2] | 0; //@line 5538
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 5539
  $15 = FUNCTION_TABLE_ii[$14 & 31]($2) | 0; //@line 5540
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 66; //@line 5543
   $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 5544
   HEAP32[$16 >> 2] = $6; //@line 5545
   $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 5546
   HEAP32[$17 >> 2] = $6; //@line 5547
   $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 5548
   HEAP32[$18 >> 2] = $8; //@line 5549
   $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 5550
   HEAP32[$19 >> 2] = $10; //@line 5551
   $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 5552
   HEAP32[$20 >> 2] = $2; //@line 5553
   $21 = $ReallocAsyncCtx2 + 24 | 0; //@line 5554
   HEAP32[$21 >> 2] = $2; //@line 5555
   sp = STACKTOP; //@line 5556
   return;
  }
  HEAP32[___async_retval >> 2] = $15; //@line 5560
  ___async_unwind = 0; //@line 5561
  HEAP32[$ReallocAsyncCtx2 >> 2] = 66; //@line 5562
  $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 5563
  HEAP32[$16 >> 2] = $6; //@line 5564
  $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 5565
  HEAP32[$17 >> 2] = $6; //@line 5566
  $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 5567
  HEAP32[$18 >> 2] = $8; //@line 5568
  $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 5569
  HEAP32[$19 >> 2] = $10; //@line 5570
  $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 5571
  HEAP32[$20 >> 2] = $2; //@line 5572
  $21 = $ReallocAsyncCtx2 + 24 | 0; //@line 5573
  HEAP32[$21 >> 2] = $2; //@line 5574
  sp = STACKTOP; //@line 5575
  return;
 }
}
function _mbed_error_vfprintf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$01213 = 0, $$014 = 0, $2 = 0, $24 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0, $$01213$looptemp = 0;
 sp = STACKTOP; //@line 2319
 STACKTOP = STACKTOP + 128 | 0; //@line 2320
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 2320
 $2 = sp; //@line 2321
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 2322
 $3 = _vsnprintf($2, 128, $0, $1) | 0; //@line 2323
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 103; //@line 2326
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 2328
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 2330
  sp = STACKTOP; //@line 2331
  STACKTOP = sp; //@line 2332
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2334
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 2337
  return;
 }
 if (!(HEAP32[2456] | 0)) {
  _serial_init(9828, 2, 3); //@line 2342
  $$01213 = 0; //@line 2343
  $$014 = 0; //@line 2343
 } else {
  $$01213 = 0; //@line 2345
  $$014 = 0; //@line 2345
 }
 while (1) {
  $$01213$looptemp = $$01213;
  $$01213 = HEAP8[$2 + $$014 >> 0] | 0; //@line 2349
  if (!($$01213$looptemp << 24 >> 24 == 13 | $$01213 << 24 >> 24 != 10)) {
   $AsyncCtx7 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2354
   _serial_putc(9828, 13); //@line 2355
   if (___async) {
    label = 8; //@line 2358
    break;
   }
   _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2361
  }
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2364
  _serial_putc(9828, $$01213 << 24 >> 24); //@line 2365
  if (___async) {
   label = 11; //@line 2368
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2371
  $24 = $$014 + 1 | 0; //@line 2372
  if (($24 | 0) == ($3 | 0)) {
   label = 13; //@line 2375
   break;
  } else {
   $$014 = $24; //@line 2378
  }
 }
 if ((label | 0) == 8) {
  HEAP32[$AsyncCtx7 >> 2] = 104; //@line 2382
  HEAP8[$AsyncCtx7 + 4 >> 0] = $$01213; //@line 2384
  HEAP32[$AsyncCtx7 + 8 >> 2] = $$014; //@line 2386
  HEAP32[$AsyncCtx7 + 12 >> 2] = $3; //@line 2388
  HEAP32[$AsyncCtx7 + 16 >> 2] = $2; //@line 2390
  HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 2392
  sp = STACKTOP; //@line 2393
  STACKTOP = sp; //@line 2394
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx3 >> 2] = 105; //@line 2397
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$014; //@line 2399
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 2401
  HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 2403
  HEAP8[$AsyncCtx3 + 16 >> 0] = $$01213; //@line 2405
  HEAP32[$AsyncCtx3 + 20 >> 2] = $2; //@line 2407
  sp = STACKTOP; //@line 2408
  STACKTOP = sp; //@line 2409
  return;
 } else if ((label | 0) == 13) {
  STACKTOP = sp; //@line 2412
  return;
 }
}
function ___fdopen($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $19 = 0, $2 = 0, $24 = 0, $29 = 0, $31 = 0, $8 = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 9514
 STACKTOP = STACKTOP + 64 | 0; //@line 9515
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 9515
 $vararg_buffer12 = sp + 40 | 0; //@line 9516
 $vararg_buffer7 = sp + 24 | 0; //@line 9517
 $vararg_buffer3 = sp + 16 | 0; //@line 9518
 $vararg_buffer = sp; //@line 9519
 $2 = sp + 56 | 0; //@line 9520
 if (!(_strchr(6643, HEAP8[$1 >> 0] | 0) | 0)) {
  HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 9527
  $$0 = 0; //@line 9528
 } else {
  $8 = _malloc(1156) | 0; //@line 9530
  if (!$8) {
   $$0 = 0; //@line 9533
  } else {
   _memset($8 | 0, 0, 124) | 0; //@line 9535
   if (!(_strchr($1, 43) | 0)) {
    HEAP32[$8 >> 2] = (HEAP8[$1 >> 0] | 0) == 114 ? 8 : 4; //@line 9542
   }
   if (_strchr($1, 101) | 0) {
    HEAP32[$vararg_buffer >> 2] = $0; //@line 9547
    HEAP32[$vararg_buffer + 4 >> 2] = 2; //@line 9549
    HEAP32[$vararg_buffer + 8 >> 2] = 1; //@line 9551
    ___syscall221(221, $vararg_buffer | 0) | 0; //@line 9552
   }
   if ((HEAP8[$1 >> 0] | 0) == 97) {
    HEAP32[$vararg_buffer3 >> 2] = $0; //@line 9557
    HEAP32[$vararg_buffer3 + 4 >> 2] = 3; //@line 9559
    $19 = ___syscall221(221, $vararg_buffer3 | 0) | 0; //@line 9560
    if (!($19 & 1024)) {
     HEAP32[$vararg_buffer7 >> 2] = $0; //@line 9565
     HEAP32[$vararg_buffer7 + 4 >> 2] = 4; //@line 9567
     HEAP32[$vararg_buffer7 + 8 >> 2] = $19 | 1024; //@line 9569
     ___syscall221(221, $vararg_buffer7 | 0) | 0; //@line 9570
    }
    $24 = HEAP32[$8 >> 2] | 128; //@line 9573
    HEAP32[$8 >> 2] = $24; //@line 9574
    $31 = $24; //@line 9575
   } else {
    $31 = HEAP32[$8 >> 2] | 0; //@line 9578
   }
   HEAP32[$8 + 60 >> 2] = $0; //@line 9581
   HEAP32[$8 + 44 >> 2] = $8 + 132; //@line 9584
   HEAP32[$8 + 48 >> 2] = 1024; //@line 9586
   $29 = $8 + 75 | 0; //@line 9587
   HEAP8[$29 >> 0] = -1; //@line 9588
   if (!($31 & 8)) {
    HEAP32[$vararg_buffer12 >> 2] = $0; //@line 9593
    HEAP32[$vararg_buffer12 + 4 >> 2] = 21523; //@line 9595
    HEAP32[$vararg_buffer12 + 8 >> 2] = $2; //@line 9597
    if (!(___syscall54(54, $vararg_buffer12 | 0) | 0)) {
     HEAP8[$29 >> 0] = 10; //@line 9601
    }
   }
   HEAP32[$8 + 32 >> 2] = 10; //@line 9605
   HEAP32[$8 + 36 >> 2] = 5; //@line 9607
   HEAP32[$8 + 40 >> 2] = 6; //@line 9609
   HEAP32[$8 + 12 >> 2] = 20; //@line 9611
   if (!(HEAP32[3632] | 0)) {
    HEAP32[$8 + 76 >> 2] = -1; //@line 9616
   }
   ___ofl_add($8) | 0; //@line 9618
   $$0 = $8; //@line 9619
  }
 }
 STACKTOP = sp; //@line 9622
 return $$0 | 0; //@line 9622
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 12009
 }
 ret = dest | 0; //@line 12012
 dest_end = dest + num | 0; //@line 12013
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 12017
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 12018
   dest = dest + 1 | 0; //@line 12019
   src = src + 1 | 0; //@line 12020
   num = num - 1 | 0; //@line 12021
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 12023
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 12024
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 12026
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 12027
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 12028
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 12029
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 12030
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 12031
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 12032
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 12033
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 12034
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 12035
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 12036
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 12037
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 12038
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 12039
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 12040
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 12041
   dest = dest + 64 | 0; //@line 12042
   src = src + 64 | 0; //@line 12043
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 12046
   dest = dest + 4 | 0; //@line 12047
   src = src + 4 | 0; //@line 12048
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 12052
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 12054
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 12055
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 12056
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 12057
   dest = dest + 4 | 0; //@line 12058
   src = src + 4 | 0; //@line 12059
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 12064
  dest = dest + 1 | 0; //@line 12065
  src = src + 1 | 0; //@line 12066
 }
 return ret | 0; //@line 12068
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_13($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4268
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4272
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4274
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 4276
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4278
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 4280
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4282
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4284
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4286
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 4288
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 4291
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 4293
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 4297
   $27 = $6 + 24 | 0; //@line 4298
   $28 = $4 + 8 | 0; //@line 4299
   $29 = $6 + 54 | 0; //@line 4300
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
    HEAP8[$10 >> 0] = 0; //@line 4330
    HEAP8[$14 >> 0] = 0; //@line 4331
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 4332
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 4333
    if (!___async) {
     ___async_unwind = 0; //@line 4336
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 220; //@line 4338
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 4340
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 4342
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 4344
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 4346
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 4348
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 4350
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 4352
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 4354
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 4356
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 4358
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 4360
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 4362
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 4364
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 4367
    sp = STACKTOP; //@line 4368
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 4373
 HEAP8[$14 >> 0] = $12; //@line 4374
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4152
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4156
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4158
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 4160
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4162
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 4164
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4166
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4168
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4170
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 4172
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 4174
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 4176
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 4178
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 4181
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 4182
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
    HEAP8[$10 >> 0] = 0; //@line 4215
    HEAP8[$14 >> 0] = 0; //@line 4216
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 4217
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 4218
    if (!___async) {
     ___async_unwind = 0; //@line 4221
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 220; //@line 4223
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 4225
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 4227
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 4229
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 4231
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 4233
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 4235
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 4237
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 4239
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 4241
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 4243
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 4245
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 4247
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 4249
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 4252
    sp = STACKTOP; //@line 4253
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 4258
 HEAP8[$14 >> 0] = $12; //@line 4259
 return;
}
function __ZN4mbed6Stream4readEPvj($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$016$lcssa = 0, $$01617 = 0, $15 = 0, $16 = 0, $25 = 0, $29 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 1396
 $3 = $1 + $2 | 0; //@line 1397
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 1400
 $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 1401
 FUNCTION_TABLE_vi[$6 & 255]($0); //@line 1402
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 65; //@line 1405
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1407
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 1409
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 1411
  HEAP32[$AsyncCtx + 16 >> 2] = $3; //@line 1413
  HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 1415
  sp = STACKTOP; //@line 1416
  return 0; //@line 1417
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1419
 L4 : do {
  if (!$2) {
   $$016$lcssa = $1; //@line 1423
  } else {
   $$01617 = $1; //@line 1425
   while (1) {
    $15 = HEAP32[(HEAP32[$0 >> 2] | 0) + 76 >> 2] | 0; //@line 1429
    $AsyncCtx2 = _emscripten_alloc_async_context(28, sp) | 0; //@line 1430
    $16 = FUNCTION_TABLE_ii[$15 & 31]($0) | 0; //@line 1431
    if (___async) {
     break;
    }
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1436
    if (($16 | 0) == -1) {
     $$016$lcssa = $$01617; //@line 1439
     break L4;
    }
    $25 = $$01617 + 1 | 0; //@line 1443
    HEAP8[$$01617 >> 0] = $16; //@line 1444
    if (($25 | 0) == ($3 | 0)) {
     $$016$lcssa = $3; //@line 1447
     break L4;
    } else {
     $$01617 = $25; //@line 1450
    }
   }
   HEAP32[$AsyncCtx2 >> 2] = 66; //@line 1453
   HEAP32[$AsyncCtx2 + 4 >> 2] = $1; //@line 1455
   HEAP32[$AsyncCtx2 + 8 >> 2] = $$01617; //@line 1457
   HEAP32[$AsyncCtx2 + 12 >> 2] = $3; //@line 1459
   HEAP32[$AsyncCtx2 + 16 >> 2] = $0; //@line 1461
   HEAP32[$AsyncCtx2 + 20 >> 2] = $0; //@line 1463
   HEAP32[$AsyncCtx2 + 24 >> 2] = $0; //@line 1465
   sp = STACKTOP; //@line 1466
   return 0; //@line 1467
  }
 } while (0);
 $29 = HEAP32[(HEAP32[$0 >> 2] | 0) + 88 >> 2] | 0; //@line 1472
 $AsyncCtx5 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1473
 FUNCTION_TABLE_vi[$29 & 255]($0); //@line 1474
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 67; //@line 1477
  HEAP32[$AsyncCtx5 + 4 >> 2] = $$016$lcssa; //@line 1479
  HEAP32[$AsyncCtx5 + 8 >> 2] = $1; //@line 1481
  sp = STACKTOP; //@line 1482
  return 0; //@line 1483
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 1485
  return $$016$lcssa - $1 | 0; //@line 1489
 }
 return 0; //@line 1491
}
function _main__async_cb_77($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $23 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 8814
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8816
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8818
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8820
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8822
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8824
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8826
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8828
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8830
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 8832
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 8834
 __ZN4mbed6Stream6printfEPKcz(9844, 6621, $2) | 0; //@line 8835
 __ZN6C128326locateEii(9844, 5, $6); //@line 8836
 __ZN4mbed6Stream6printfEPKcz(9844, 6627, $8) | 0; //@line 8837
 __ZN6C1283211copy_to_lcdEv(9844); //@line 8838
 $22 = $12 + 2 | 0; //@line 8839
 __ZN6C128326locateEii(9844, 5, $22); //@line 8841
 __ZN4mbed6Stream6printfEPKcz(9844, 6621, $14) | 0; //@line 8842
 $23 = $22 + 12 | 0; //@line 8843
 __ZN6C128326locateEii(9844, 5, $23); //@line 8844
 __ZN4mbed6Stream6printfEPKcz(9844, 6627, $18) | 0; //@line 8845
 __ZN6C1283211copy_to_lcdEv(9844); //@line 8846
 if (($22 | 0) < 5) {
  __ZN6C128326locateEii(9844, 5, $22); //@line 8848
  $ReallocAsyncCtx12 = _emscripten_realloc_async_context(44) | 0; //@line 8849
  _wait(.20000000298023224); //@line 8850
  if (!___async) {
   ___async_unwind = 0; //@line 8853
  }
  HEAP32[$ReallocAsyncCtx12 >> 2] = 178; //@line 8855
  HEAP32[$ReallocAsyncCtx12 + 4 >> 2] = $2; //@line 8857
  HEAP32[$ReallocAsyncCtx12 + 8 >> 2] = $4; //@line 8859
  HEAP32[$ReallocAsyncCtx12 + 12 >> 2] = $23; //@line 8861
  HEAP32[$ReallocAsyncCtx12 + 16 >> 2] = $8; //@line 8863
  HEAP32[$ReallocAsyncCtx12 + 20 >> 2] = $10; //@line 8865
  HEAP32[$ReallocAsyncCtx12 + 24 >> 2] = $22; //@line 8867
  HEAP32[$ReallocAsyncCtx12 + 28 >> 2] = $14; //@line 8869
  HEAP32[$ReallocAsyncCtx12 + 32 >> 2] = $16; //@line 8871
  HEAP32[$ReallocAsyncCtx12 + 36 >> 2] = $18; //@line 8873
  HEAP32[$ReallocAsyncCtx12 + 40 >> 2] = $20; //@line 8875
  sp = STACKTOP; //@line 8876
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 8879
 _puts(6637) | 0; //@line 8880
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 179; //@line 8883
  sp = STACKTOP; //@line 8884
  return;
 }
 ___async_unwind = 0; //@line 8887
 HEAP32[$ReallocAsyncCtx >> 2] = 179; //@line 8888
 sp = STACKTOP; //@line 8889
 return;
}
function __ZN4mbed6Stream5writeEPKvj($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$1 = 0, $14 = 0, $15 = 0, $17 = 0, $18 = 0, $28 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1500
 $3 = $1 + $2 | 0; //@line 1501
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 1504
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 1505
 FUNCTION_TABLE_vi[$6 & 255]($0); //@line 1506
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 68; //@line 1509
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1511
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 1513
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 1515
  HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 1517
  sp = STACKTOP; //@line 1518
  return 0; //@line 1519
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1521
 $$0 = $1; //@line 1522
 while (1) {
  if (($$0 | 0) == ($3 | 0)) {
   $$1 = $3; //@line 1526
   break;
  }
  $14 = HEAP32[(HEAP32[$0 >> 2] | 0) + 72 >> 2] | 0; //@line 1531
  $15 = $$0 + 1 | 0; //@line 1532
  $17 = HEAP8[$$0 >> 0] | 0; //@line 1534
  $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 1535
  $18 = FUNCTION_TABLE_iii[$14 & 7]($0, $17) | 0; //@line 1536
  if (___async) {
   label = 6; //@line 1539
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1542
  if (($18 | 0) == -1) {
   $$1 = $15; //@line 1545
   break;
  } else {
   $$0 = $15; //@line 1548
  }
 }
 if ((label | 0) == 6) {
  HEAP32[$AsyncCtx3 >> 2] = 69; //@line 1552
  HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 1554
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 1556
  HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 1558
  HEAP32[$AsyncCtx3 + 16 >> 2] = $0; //@line 1560
  HEAP32[$AsyncCtx3 + 20 >> 2] = $1; //@line 1562
  HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 1564
  sp = STACKTOP; //@line 1565
  return 0; //@line 1566
 }
 $28 = HEAP32[(HEAP32[$0 >> 2] | 0) + 88 >> 2] | 0; //@line 1570
 $AsyncCtx7 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1571
 FUNCTION_TABLE_vi[$28 & 255]($0); //@line 1572
 if (___async) {
  HEAP32[$AsyncCtx7 >> 2] = 70; //@line 1575
  HEAP32[$AsyncCtx7 + 4 >> 2] = $$1; //@line 1577
  HEAP32[$AsyncCtx7 + 8 >> 2] = $1; //@line 1579
  sp = STACKTOP; //@line 1580
  return 0; //@line 1581
 } else {
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1583
  return $$1 - $1 | 0; //@line 1587
 }
 return 0; //@line 1589
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 1261
 STACKTOP = STACKTOP + 64 | 0; //@line 1262
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 1262
 $3 = sp; //@line 1263
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 1266
 } else {
  if (!$1) {
   $$2 = 0; //@line 1270
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1272
   $6 = ___dynamic_cast($1, 232, 216, 0) | 0; //@line 1273
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 209; //@line 1276
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 1278
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 1280
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 1282
    sp = STACKTOP; //@line 1283
    STACKTOP = sp; //@line 1284
    return 0; //@line 1284
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1286
   if (!$6) {
    $$2 = 0; //@line 1289
   } else {
    dest = $3 + 4 | 0; //@line 1292
    stop = dest + 52 | 0; //@line 1292
    do {
     HEAP32[dest >> 2] = 0; //@line 1292
     dest = dest + 4 | 0; //@line 1292
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 1293
    HEAP32[$3 + 8 >> 2] = $0; //@line 1295
    HEAP32[$3 + 12 >> 2] = -1; //@line 1297
    HEAP32[$3 + 48 >> 2] = 1; //@line 1299
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 1302
    $18 = HEAP32[$2 >> 2] | 0; //@line 1303
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1304
    FUNCTION_TABLE_viiii[$17 & 7]($6, $3, $18, 1); //@line 1305
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 210; //@line 1308
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 1310
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 1312
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 1314
     sp = STACKTOP; //@line 1315
     STACKTOP = sp; //@line 1316
     return 0; //@line 1316
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 1318
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 1325
     $$0 = 1; //@line 1326
    } else {
     $$0 = 0; //@line 1328
    }
    $$2 = $$0; //@line 1330
   }
  }
 }
 STACKTOP = sp; //@line 1334
 return $$2 | 0; //@line 1334
}
function __ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb_7($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $25 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3600
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3604
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3606
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3608
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3610
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3612
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3614
 $16 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 3615
 if (($16 | 0) == ($4 | 0)) {
  return;
 }
 $25 = HEAPU16[((128 >>> ($16 & 7) & HEAP8[$6 + ($16 >> 3) >> 0] | 0) == 0 ? $8 : $10) >> 1] | 0; //@line 3630
 $28 = HEAP32[(HEAP32[$12 >> 2] | 0) + 140 >> 2] | 0; //@line 3633
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(32) | 0; //@line 3634
 FUNCTION_TABLE_vii[$28 & 7]($14, $25); //@line 3635
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 145; //@line 3638
  $29 = $ReallocAsyncCtx2 + 4 | 0; //@line 3639
  HEAP32[$29 >> 2] = $16; //@line 3640
  $30 = $ReallocAsyncCtx2 + 8 | 0; //@line 3641
  HEAP32[$30 >> 2] = $4; //@line 3642
  $31 = $ReallocAsyncCtx2 + 12 | 0; //@line 3643
  HEAP32[$31 >> 2] = $6; //@line 3644
  $32 = $ReallocAsyncCtx2 + 16 | 0; //@line 3645
  HEAP32[$32 >> 2] = $8; //@line 3646
  $33 = $ReallocAsyncCtx2 + 20 | 0; //@line 3647
  HEAP32[$33 >> 2] = $10; //@line 3648
  $34 = $ReallocAsyncCtx2 + 24 | 0; //@line 3649
  HEAP32[$34 >> 2] = $12; //@line 3650
  $35 = $ReallocAsyncCtx2 + 28 | 0; //@line 3651
  HEAP32[$35 >> 2] = $14; //@line 3652
  sp = STACKTOP; //@line 3653
  return;
 }
 ___async_unwind = 0; //@line 3656
 HEAP32[$ReallocAsyncCtx2 >> 2] = 145; //@line 3657
 $29 = $ReallocAsyncCtx2 + 4 | 0; //@line 3658
 HEAP32[$29 >> 2] = $16; //@line 3659
 $30 = $ReallocAsyncCtx2 + 8 | 0; //@line 3660
 HEAP32[$30 >> 2] = $4; //@line 3661
 $31 = $ReallocAsyncCtx2 + 12 | 0; //@line 3662
 HEAP32[$31 >> 2] = $6; //@line 3663
 $32 = $ReallocAsyncCtx2 + 16 | 0; //@line 3664
 HEAP32[$32 >> 2] = $8; //@line 3665
 $33 = $ReallocAsyncCtx2 + 20 | 0; //@line 3666
 HEAP32[$33 >> 2] = $10; //@line 3667
 $34 = $ReallocAsyncCtx2 + 24 | 0; //@line 3668
 HEAP32[$34 >> 2] = $12; //@line 3669
 $35 = $ReallocAsyncCtx2 + 28 | 0; //@line 3670
 HEAP32[$35 >> 2] = $14; //@line 3671
 sp = STACKTOP; //@line 3672
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2593
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 2599
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 2603
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 2604
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 2605
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 2606
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 226; //@line 2609
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 2611
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 2613
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 2615
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 2617
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 2619
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 2621
    sp = STACKTOP; //@line 2622
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2625
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 2629
    $$0 = $0 + 24 | 0; //@line 2630
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 2632
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 2633
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 2638
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 2644
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 2647
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 227; //@line 2652
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 2654
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 2656
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 2658
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 2660
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 2662
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 2664
    sp = STACKTOP; //@line 2665
    return;
   }
  }
 } while (0);
 return;
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 418
 STACKTOP = STACKTOP + 128 | 0; //@line 419
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 419
 $4 = sp + 124 | 0; //@line 420
 $5 = sp; //@line 421
 dest = $5; //@line 422
 src = 1676; //@line 422
 stop = dest + 124 | 0; //@line 422
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 422
  dest = dest + 4 | 0; //@line 422
  src = src + 4 | 0; //@line 422
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 428
   $$015 = 1; //@line 428
   label = 4; //@line 429
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 432
   $$0 = -1; //@line 433
  }
 } else {
  $$014 = $0; //@line 436
  $$015 = $1; //@line 436
  label = 4; //@line 437
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 441
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 443
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 445
  $14 = $5 + 20 | 0; //@line 446
  HEAP32[$14 >> 2] = $$014; //@line 447
  HEAP32[$5 + 44 >> 2] = $$014; //@line 449
  $16 = $$014 + $$$015 | 0; //@line 450
  $17 = $5 + 16 | 0; //@line 451
  HEAP32[$17 >> 2] = $16; //@line 452
  HEAP32[$5 + 28 >> 2] = $16; //@line 454
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 455
  $19 = _vfprintf($5, $2, $3) | 0; //@line 456
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 193; //@line 459
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 461
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 463
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 465
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 467
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 469
   sp = STACKTOP; //@line 470
   STACKTOP = sp; //@line 471
   return 0; //@line 471
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 473
  if (!$$$015) {
   $$0 = $19; //@line 476
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 478
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 483
   $$0 = $19; //@line 484
  }
 }
 STACKTOP = sp; //@line 487
 return $$0 | 0; //@line 487
}
function __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_66($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $17 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8134
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8136
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8138
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8140
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8142
 HEAP32[$2 >> 2] = 608; //@line 8143
 HEAP32[$2 + 4 >> 2] = 772; //@line 8145
 $10 = $2 + 4172 | 0; //@line 8146
 HEAP32[$10 >> 2] = $4; //@line 8147
 $11 = $2 + 4176 | 0; //@line 8148
 HEAP32[$11 >> 2] = $6; //@line 8149
 $12 = $2 + 4180 | 0; //@line 8150
 HEAP32[$12 >> 2] = $8; //@line 8151
 _emscripten_asm_const_iiii(5, $4 | 0, $6 | 0, $8 | 0) | 0; //@line 8152
 HEAP32[$2 + 56 >> 2] = 1; //@line 8154
 HEAP32[$2 + 52 >> 2] = 0; //@line 8156
 HEAP32[$2 + 60 >> 2] = 0; //@line 8158
 $17 = $2 + 68 | 0; //@line 8159
 _memset($17 | 0, 0, 4096) | 0; //@line 8160
 $20 = HEAP32[(HEAP32[$2 >> 2] | 0) + 112 >> 2] | 0; //@line 8163
 $ReallocAsyncCtx = _emscripten_realloc_async_context(24) | 0; //@line 8164
 FUNCTION_TABLE_viii[$20 & 3]($2, 0, 0); //@line 8165
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 130; //@line 8168
  $21 = $ReallocAsyncCtx + 4 | 0; //@line 8169
  HEAP32[$21 >> 2] = $2; //@line 8170
  $22 = $ReallocAsyncCtx + 8 | 0; //@line 8171
  HEAP32[$22 >> 2] = $10; //@line 8172
  $23 = $ReallocAsyncCtx + 12 | 0; //@line 8173
  HEAP32[$23 >> 2] = $11; //@line 8174
  $24 = $ReallocAsyncCtx + 16 | 0; //@line 8175
  HEAP32[$24 >> 2] = $12; //@line 8176
  $25 = $ReallocAsyncCtx + 20 | 0; //@line 8177
  HEAP32[$25 >> 2] = $17; //@line 8178
  sp = STACKTOP; //@line 8179
  return;
 }
 ___async_unwind = 0; //@line 8182
 HEAP32[$ReallocAsyncCtx >> 2] = 130; //@line 8183
 $21 = $ReallocAsyncCtx + 4 | 0; //@line 8184
 HEAP32[$21 >> 2] = $2; //@line 8185
 $22 = $ReallocAsyncCtx + 8 | 0; //@line 8186
 HEAP32[$22 >> 2] = $10; //@line 8187
 $23 = $ReallocAsyncCtx + 12 | 0; //@line 8188
 HEAP32[$23 >> 2] = $11; //@line 8189
 $24 = $ReallocAsyncCtx + 16 | 0; //@line 8190
 HEAP32[$24 >> 2] = $12; //@line 8191
 $25 = $ReallocAsyncCtx + 20 | 0; //@line 8192
 HEAP32[$25 >> 2] = $17; //@line 8193
 sp = STACKTOP; //@line 8194
 return;
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 9292
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 9295
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 9298
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 9301
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 9307
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 9316
     $24 = $13 >>> 2; //@line 9317
     $$090 = 0; //@line 9318
     $$094 = $7; //@line 9318
     while (1) {
      $25 = $$094 >>> 1; //@line 9320
      $26 = $$090 + $25 | 0; //@line 9321
      $27 = $26 << 1; //@line 9322
      $28 = $27 + $23 | 0; //@line 9323
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 9326
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 9330
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 9336
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 9344
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 9348
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 9354
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 9359
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 9362
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 9362
      }
     }
     $46 = $27 + $24 | 0; //@line 9365
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 9368
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 9372
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 9384
     } else {
      $$4 = 0; //@line 9386
     }
    } else {
     $$4 = 0; //@line 9389
    }
   } else {
    $$4 = 0; //@line 9392
   }
  } else {
   $$4 = 0; //@line 9395
  }
 } while (0);
 return $$4 | 0; //@line 9398
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9995
 $1 = $0 + 20 | 0; //@line 9996
 $3 = $0 + 28 | 0; //@line 9998
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 10004
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10005
   FUNCTION_TABLE_iiii[$7 & 15]($0, 0, 0) | 0; //@line 10006
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 189; //@line 10009
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 10011
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 10013
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 10015
    sp = STACKTOP; //@line 10016
    return 0; //@line 10017
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10019
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 10023
     break;
    } else {
     label = 5; //@line 10026
     break;
    }
   }
  } else {
   label = 5; //@line 10031
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 10035
  $14 = HEAP32[$13 >> 2] | 0; //@line 10036
  $15 = $0 + 8 | 0; //@line 10037
  $16 = HEAP32[$15 >> 2] | 0; //@line 10038
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 10046
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 10047
    FUNCTION_TABLE_iiii[$22 & 15]($0, $14 - $16 | 0, 1) | 0; //@line 10048
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 190; //@line 10051
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 10053
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 10055
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 10057
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 10059
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 10061
     sp = STACKTOP; //@line 10062
     return 0; //@line 10063
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10065
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 10071
  HEAP32[$3 >> 2] = 0; //@line 10072
  HEAP32[$1 >> 2] = 0; //@line 10073
  HEAP32[$15 >> 2] = 0; //@line 10074
  HEAP32[$13 >> 2] = 0; //@line 10075
  $$0 = 0; //@line 10076
 }
 return $$0 | 0; //@line 10078
}
function __ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb($0) {
 $0 = $0 | 0;
 var $11 = 0, $12 = 0, $22 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3524
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3530
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3532
 $9 = Math_imul(HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 3533
 if (($9 | 0) <= 0) {
  return;
 }
 $11 = $6 + 28 | 0; //@line 3538
 $12 = $6 + 30 | 0; //@line 3539
 $22 = HEAPU16[((128 >>> 0 & HEAP8[$8 + 0 >> 0] | 0) == 0 ? $12 : $11) >> 1] | 0; //@line 3550
 $25 = HEAP32[(HEAP32[$6 >> 2] | 0) + 140 >> 2] | 0; //@line 3553
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(32) | 0; //@line 3554
 FUNCTION_TABLE_vii[$25 & 7]($6, $22); //@line 3555
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 145; //@line 3558
  $26 = $ReallocAsyncCtx2 + 4 | 0; //@line 3559
  HEAP32[$26 >> 2] = 0; //@line 3560
  $27 = $ReallocAsyncCtx2 + 8 | 0; //@line 3561
  HEAP32[$27 >> 2] = $9; //@line 3562
  $28 = $ReallocAsyncCtx2 + 12 | 0; //@line 3563
  HEAP32[$28 >> 2] = $8; //@line 3564
  $29 = $ReallocAsyncCtx2 + 16 | 0; //@line 3565
  HEAP32[$29 >> 2] = $12; //@line 3566
  $30 = $ReallocAsyncCtx2 + 20 | 0; //@line 3567
  HEAP32[$30 >> 2] = $11; //@line 3568
  $31 = $ReallocAsyncCtx2 + 24 | 0; //@line 3569
  HEAP32[$31 >> 2] = $6; //@line 3570
  $32 = $ReallocAsyncCtx2 + 28 | 0; //@line 3571
  HEAP32[$32 >> 2] = $6; //@line 3572
  sp = STACKTOP; //@line 3573
  return;
 }
 ___async_unwind = 0; //@line 3576
 HEAP32[$ReallocAsyncCtx2 >> 2] = 145; //@line 3577
 $26 = $ReallocAsyncCtx2 + 4 | 0; //@line 3578
 HEAP32[$26 >> 2] = 0; //@line 3579
 $27 = $ReallocAsyncCtx2 + 8 | 0; //@line 3580
 HEAP32[$27 >> 2] = $9; //@line 3581
 $28 = $ReallocAsyncCtx2 + 12 | 0; //@line 3582
 HEAP32[$28 >> 2] = $8; //@line 3583
 $29 = $ReallocAsyncCtx2 + 16 | 0; //@line 3584
 HEAP32[$29 >> 2] = $12; //@line 3585
 $30 = $ReallocAsyncCtx2 + 20 | 0; //@line 3586
 HEAP32[$30 >> 2] = $11; //@line 3587
 $31 = $ReallocAsyncCtx2 + 24 | 0; //@line 3588
 HEAP32[$31 >> 2] = $6; //@line 3589
 $32 = $ReallocAsyncCtx2 + 28 | 0; //@line 3590
 HEAP32[$32 >> 2] = $6; //@line 3591
 sp = STACKTOP; //@line 3592
 return;
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8919
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 8924
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 8929
  } else {
   $20 = $0 & 255; //@line 8931
   $21 = $0 & 255; //@line 8932
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 8938
   } else {
    $26 = $1 + 20 | 0; //@line 8940
    $27 = HEAP32[$26 >> 2] | 0; //@line 8941
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 8947
     HEAP8[$27 >> 0] = $20; //@line 8948
     $34 = $21; //@line 8949
    } else {
     label = 12; //@line 8951
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 8956
     $32 = ___overflow($1, $0) | 0; //@line 8957
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 181; //@line 8960
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 8962
      sp = STACKTOP; //@line 8963
      return 0; //@line 8964
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 8966
      $34 = $32; //@line 8967
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 8972
   $$0 = $34; //@line 8973
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 8978
   $8 = $0 & 255; //@line 8979
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 8985
    $14 = HEAP32[$13 >> 2] | 0; //@line 8986
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 8992
     HEAP8[$14 >> 0] = $7; //@line 8993
     $$0 = $8; //@line 8994
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 8998
   $19 = ___overflow($1, $0) | 0; //@line 8999
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 180; //@line 9002
    sp = STACKTOP; //@line 9003
    return 0; //@line 9004
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9006
    $$0 = $19; //@line 9007
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 9012
}
function __ZN4mbed8FileBaseD0Ev($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $1 = 0, $12 = 0, $17 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 1052
 HEAP32[$0 >> 2] = 392; //@line 1053
 $1 = HEAP32[2413] | 0; //@line 1054
 do {
  if (!$1) {
   HEAP32[2413] = 9656; //@line 1058
  } else {
   if (($1 | 0) != 9656) {
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1062
    _mbed_assert_internal(3120, 3140, 93); //@line 1063
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 53; //@line 1066
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1068
     sp = STACKTOP; //@line 1069
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1072
     break;
    }
   }
  }
 } while (0);
 do {
  if (HEAP32[$0 + 8 >> 2] | 0) {
   $8 = HEAP32[2412] | 0; //@line 1083
   if (($8 | 0) == ($0 | 0)) {
    HEAP32[2412] = HEAP32[$0 + 4 >> 2]; //@line 1088
    break;
   } else {
    $$0$i = $8; //@line 1091
   }
   do {
    $12 = $$0$i + 4 | 0; //@line 1094
    $$0$i = HEAP32[$12 >> 2] | 0; //@line 1095
   } while (($$0$i | 0) != ($0 | 0));
   HEAP32[$12 >> 2] = HEAP32[$0 + 4 >> 2]; //@line 1105
  }
 } while (0);
 $17 = HEAP32[2413] | 0; //@line 1108
 do {
  if (!$17) {
   HEAP32[2413] = 9656; //@line 1112
  } else {
   if (($17 | 0) != 9656) {
    $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1116
    _mbed_assert_internal(3120, 3140, 93); //@line 1117
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 54; //@line 1120
     HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1122
     sp = STACKTOP; //@line 1123
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx | 0); //@line 1126
     break;
    }
   }
  }
 } while (0);
 if (HEAP32[$0 + 12 >> 2] | 0) {
  __ZdlPv($0); //@line 1136
  return;
 }
 $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1140
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($0 + -4 | 0); //@line 1141
 if (___async) {
  HEAP32[$AsyncCtx7 >> 2] = 55; //@line 1144
  HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 1146
  sp = STACKTOP; //@line 1147
  return;
 }
 _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1150
 __ZdlPv($0); //@line 1151
 return;
}
function _main__async_cb_69($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 8307
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8309
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8311
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8313
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8315
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8317
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8319
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8321
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8323
 __ZN6C1283211set_auto_upEj(9844, 0); //@line 8324
 __ZN6C128326locateEii(9844, 5, -20); //@line 8326
 __ZN4mbed6Stream6printfEPKcz(9844, 6621, $2) | 0; //@line 8327
 $18 = -20 + 12 | 0; //@line 8328
 __ZN6C128326locateEii(9844, 5, $18); //@line 8329
 __ZN4mbed6Stream6printfEPKcz(9844, 6627, $6) | 0; //@line 8330
 __ZN6C1283211copy_to_lcdEv(9844); //@line 8331
 if (-20 < 5) {
  __ZN6C128326locateEii(9844, 5, -20); //@line 8333
  $ReallocAsyncCtx12 = _emscripten_realloc_async_context(44) | 0; //@line 8334
  _wait(.20000000298023224); //@line 8335
  if (!___async) {
   ___async_unwind = 0; //@line 8338
  }
  HEAP32[$ReallocAsyncCtx12 >> 2] = 178; //@line 8340
  HEAP32[$ReallocAsyncCtx12 + 4 >> 2] = $10; //@line 8342
  HEAP32[$ReallocAsyncCtx12 + 8 >> 2] = $12; //@line 8344
  HEAP32[$ReallocAsyncCtx12 + 12 >> 2] = $18; //@line 8346
  HEAP32[$ReallocAsyncCtx12 + 16 >> 2] = $14; //@line 8348
  HEAP32[$ReallocAsyncCtx12 + 20 >> 2] = $16; //@line 8350
  HEAP32[$ReallocAsyncCtx12 + 24 >> 2] = -20; //@line 8352
  HEAP32[$ReallocAsyncCtx12 + 28 >> 2] = $2; //@line 8354
  HEAP32[$ReallocAsyncCtx12 + 32 >> 2] = $4; //@line 8356
  HEAP32[$ReallocAsyncCtx12 + 36 >> 2] = $6; //@line 8358
  HEAP32[$ReallocAsyncCtx12 + 40 >> 2] = $8; //@line 8360
  sp = STACKTOP; //@line 8361
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 8364
 _puts(6637) | 0; //@line 8365
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 179; //@line 8368
  sp = STACKTOP; //@line 8369
  return;
 }
 ___async_unwind = 0; //@line 8372
 HEAP32[$ReallocAsyncCtx >> 2] = 179; //@line 8373
 sp = STACKTOP; //@line 8374
 return;
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 844
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 849
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 854
  } else {
   $20 = $0 & 255; //@line 856
   $21 = $0 & 255; //@line 857
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 863
   } else {
    $26 = $1 + 20 | 0; //@line 865
    $27 = HEAP32[$26 >> 2] | 0; //@line 866
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 872
     HEAP8[$27 >> 0] = $20; //@line 873
     $34 = $21; //@line 874
    } else {
     label = 12; //@line 876
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 881
     $32 = ___overflow($1, $0) | 0; //@line 882
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 201; //@line 885
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 887
      sp = STACKTOP; //@line 888
      return 0; //@line 889
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 891
      $34 = $32; //@line 892
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 897
   $$0 = $34; //@line 898
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 903
   $8 = $0 & 255; //@line 904
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 910
    $14 = HEAP32[$13 >> 2] | 0; //@line 911
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 917
     HEAP8[$14 >> 0] = $7; //@line 918
     $$0 = $8; //@line 919
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 923
   $19 = ___overflow($1, $0) | 0; //@line 924
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 200; //@line 927
    sp = STACKTOP; //@line 928
    return 0; //@line 929
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 931
    $$0 = $19; //@line 932
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 937
}
function __ZN4mbed6Stream4putcEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $15 = 0, $16 = 0, $21 = 0, $4 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 1745
 $4 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 1748
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1749
 FUNCTION_TABLE_vi[$4 & 255]($0); //@line 1750
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 76; //@line 1753
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1755
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 1757
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 1759
  sp = STACKTOP; //@line 1760
  return 0; //@line 1761
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1763
 $9 = HEAP32[$0 + 20 >> 2] | 0; //@line 1765
 $AsyncCtx9 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1766
 _fflush($9) | 0; //@line 1767
 if (___async) {
  HEAP32[$AsyncCtx9 >> 2] = 77; //@line 1770
  HEAP32[$AsyncCtx9 + 4 >> 2] = $0; //@line 1772
  HEAP32[$AsyncCtx9 + 8 >> 2] = $1; //@line 1774
  HEAP32[$AsyncCtx9 + 12 >> 2] = $0; //@line 1776
  sp = STACKTOP; //@line 1777
  return 0; //@line 1778
 }
 _emscripten_free_async_context($AsyncCtx9 | 0); //@line 1780
 $15 = HEAP32[(HEAP32[$0 >> 2] | 0) + 72 >> 2] | 0; //@line 1783
 $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1784
 $16 = FUNCTION_TABLE_iii[$15 & 7]($0, $1) | 0; //@line 1785
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 78; //@line 1788
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 1790
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1792
  sp = STACKTOP; //@line 1793
  return 0; //@line 1794
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1796
 $21 = HEAP32[(HEAP32[$0 >> 2] | 0) + 88 >> 2] | 0; //@line 1799
 $AsyncCtx5 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1800
 FUNCTION_TABLE_vi[$21 & 255]($0); //@line 1801
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 79; //@line 1804
  HEAP32[$AsyncCtx5 + 4 >> 2] = $16; //@line 1806
  sp = STACKTOP; //@line 1807
  return 0; //@line 1808
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 1810
  return $16 | 0; //@line 1811
 }
 return 0; //@line 1813
}
function __ZN15GraphicsDisplay7blitbitEiiiiPKc($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$019 = 0, $13 = 0, $15 = 0, $16 = 0, $26 = 0, $29 = 0, $37 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4172
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 136 >> 2] | 0; //@line 4175
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 4176
 FUNCTION_TABLE_viiiii[$8 & 7]($0, $1, $2, $3, $4); //@line 4177
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 144; //@line 4180
  HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 4182
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 4184
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 4186
  HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 4188
  sp = STACKTOP; //@line 4189
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 4192
 $13 = Math_imul($4, $3) | 0; //@line 4193
 if (($13 | 0) <= 0) {
  return;
 }
 $15 = $0 + 28 | 0; //@line 4198
 $16 = $0 + 30 | 0; //@line 4199
 $$019 = 0; //@line 4200
 while (1) {
  $26 = HEAPU16[((128 >>> ($$019 & 7) & HEAP8[$5 + ($$019 >> 3) >> 0] | 0) == 0 ? $16 : $15) >> 1] | 0; //@line 4212
  $29 = HEAP32[(HEAP32[$0 >> 2] | 0) + 140 >> 2] | 0; //@line 4215
  $AsyncCtx3 = _emscripten_alloc_async_context(32, sp) | 0; //@line 4216
  FUNCTION_TABLE_vii[$29 & 7]($0, $26); //@line 4217
  if (___async) {
   label = 7; //@line 4220
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4223
  $37 = $$019 + 1 | 0; //@line 4224
  if (($37 | 0) == ($13 | 0)) {
   label = 5; //@line 4227
   break;
  } else {
   $$019 = $37; //@line 4230
  }
 }
 if ((label | 0) == 5) {
  return;
 } else if ((label | 0) == 7) {
  HEAP32[$AsyncCtx3 >> 2] = 145; //@line 4237
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$019; //@line 4239
  HEAP32[$AsyncCtx3 + 8 >> 2] = $13; //@line 4241
  HEAP32[$AsyncCtx3 + 12 >> 2] = $5; //@line 4243
  HEAP32[$AsyncCtx3 + 16 >> 2] = $16; //@line 4245
  HEAP32[$AsyncCtx3 + 20 >> 2] = $15; //@line 4247
  HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 4249
  HEAP32[$AsyncCtx3 + 28 >> 2] = $0; //@line 4251
  sp = STACKTOP; //@line 4252
  return;
 }
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
 _mbed_tracef(16, 1936, 1964, $vararg_buffer); //@line 92
 _emscripten_asm_const_i(0) | 0; //@line 93
 $10 = HEAP32[$0 + 752 >> 2] | 0; //@line 95
 if (($10 | 0) != ($6 | 0)) {
  HEAP32[$vararg_buffer4 >> 2] = $10; //@line 98
  HEAP32[$vararg_buffer4 + 4 >> 2] = $6; //@line 100
  _mbed_tracef(16, 1936, 2046, $vararg_buffer4); //@line 101
  STACKTOP = sp; //@line 102
  return;
 }
 $13 = HEAP32[$0 + 756 >> 2] | 0; //@line 105
 if (($13 | 0) != ($7 | 0)) {
  HEAP32[$vararg_buffer8 >> 2] = $13; //@line 108
  HEAP32[$vararg_buffer8 + 4 >> 2] = $7; //@line 110
  _mbed_tracef(16, 1936, 2093, $vararg_buffer8); //@line 111
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
  _mbed_tracef(16, 1936, 2140, $vararg_buffer12); //@line 137
  STACKTOP = sp; //@line 138
  return;
 }
}
function __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc($0, $1, $2, $3, $4, $5, $6) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 $6 = $6 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3529
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 3530
 __ZN15GraphicsDisplayC2EPKc($0, $6); //@line 3531
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 129; //@line 3534
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 3536
  HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 3538
  HEAP32[$AsyncCtx3 + 12 >> 2] = $3; //@line 3540
  HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 3542
  sp = STACKTOP; //@line 3543
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3546
 HEAP32[$0 >> 2] = 608; //@line 3547
 HEAP32[$0 + 4 >> 2] = 772; //@line 3549
 $12 = $0 + 4172 | 0; //@line 3550
 HEAP32[$12 >> 2] = $1; //@line 3551
 $13 = $0 + 4176 | 0; //@line 3552
 HEAP32[$13 >> 2] = $3; //@line 3553
 $14 = $0 + 4180 | 0; //@line 3554
 HEAP32[$14 >> 2] = $2; //@line 3555
 _emscripten_asm_const_iiii(5, $1 | 0, $3 | 0, $2 | 0) | 0; //@line 3556
 HEAP32[$0 + 56 >> 2] = 1; //@line 3558
 HEAP32[$0 + 52 >> 2] = 0; //@line 3560
 HEAP32[$0 + 60 >> 2] = 0; //@line 3562
 $19 = $0 + 68 | 0; //@line 3563
 _memset($19 | 0, 0, 4096) | 0; //@line 3564
 $22 = HEAP32[(HEAP32[$0 >> 2] | 0) + 112 >> 2] | 0; //@line 3567
 $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 3568
 FUNCTION_TABLE_viii[$22 & 3]($0, 0, 0); //@line 3569
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 130; //@line 3572
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3574
  HEAP32[$AsyncCtx + 8 >> 2] = $12; //@line 3576
  HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 3578
  HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 3580
  HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 3582
  sp = STACKTOP; //@line 3583
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3586
  HEAP32[$0 + 48 >> 2] = 3386; //@line 3588
  _emscripten_asm_const_iiiii(4, HEAP32[$12 >> 2] | 0, HEAP32[$13 >> 2] | 0, HEAP32[$14 >> 2] | 0, $19 | 0) | 0; //@line 3592
  return;
 }
}
function _fclose($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $15 = 0, $21 = 0, $25 = 0, $27 = 0, $28 = 0, $33 = 0, $35 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 9761
 if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
  $25 = ___lockfile($0) | 0; //@line 9767
 } else {
  $25 = 0; //@line 9769
 }
 ___unlist_locked_file($0); //@line 9771
 $7 = (HEAP32[$0 >> 2] & 1 | 0) != 0; //@line 9774
 if (!$7) {
  $8 = ___ofl_lock() | 0; //@line 9776
  $10 = HEAP32[$0 + 52 >> 2] | 0; //@line 9778
  $$pre = $0 + 56 | 0; //@line 9781
  if ($10 | 0) {
   HEAP32[$10 + 56 >> 2] = HEAP32[$$pre >> 2]; //@line 9785
  }
  $15 = HEAP32[$$pre >> 2] | 0; //@line 9787
  if ($15 | 0) {
   HEAP32[$15 + 52 >> 2] = $10; //@line 9792
  }
  if ((HEAP32[$8 >> 2] | 0) == ($0 | 0)) {
   HEAP32[$8 >> 2] = $15; //@line 9797
  }
  ___ofl_unlock(); //@line 9799
 }
 $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 9801
 $21 = _fflush($0) | 0; //@line 9802
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 183; //@line 9805
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 9807
  HEAP8[$AsyncCtx3 + 8 >> 0] = $7 & 1; //@line 9810
  HEAP32[$AsyncCtx3 + 12 >> 2] = $25; //@line 9812
  sp = STACKTOP; //@line 9813
  return 0; //@line 9814
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9816
 $27 = HEAP32[$0 + 12 >> 2] | 0; //@line 9818
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 9819
 $28 = FUNCTION_TABLE_ii[$27 & 31]($0) | 0; //@line 9820
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 184; //@line 9823
  HEAP32[$AsyncCtx + 4 >> 2] = $21; //@line 9825
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 9827
  HEAP8[$AsyncCtx + 12 >> 0] = $7 & 1; //@line 9830
  HEAP32[$AsyncCtx + 16 >> 2] = $25; //@line 9832
  sp = STACKTOP; //@line 9833
  return 0; //@line 9834
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 9836
 $33 = $28 | $21; //@line 9837
 $35 = HEAP32[$0 + 92 >> 2] | 0; //@line 9839
 if ($35 | 0) {
  _free($35); //@line 9842
 }
 if ($7) {
  if ($25 | 0) {
   ___unlockfile($0); //@line 9847
  }
 } else {
  _free($0); //@line 9850
 }
 return $33 | 0; //@line 9852
}
function __ZN6C128325_putcEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $11 = 0, $14 = 0, $15 = 0, $28 = 0, $30 = 0, $32 = 0, $4 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2948
 if (($1 | 0) == 10) {
  HEAP32[$0 + 60 >> 2] = 0; //@line 2952
  $4 = $0 + 64 | 0; //@line 2953
  $6 = $0 + 48 | 0; //@line 2955
  $11 = (HEAP32[$4 >> 2] | 0) + (HEAPU8[(HEAP32[$6 >> 2] | 0) + 2 >> 0] | 0) | 0; //@line 2960
  HEAP32[$4 >> 2] = $11; //@line 2961
  $14 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 2964
  $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 2965
  $15 = FUNCTION_TABLE_ii[$14 & 31]($0) | 0; //@line 2966
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 119; //@line 2969
   HEAP32[$AsyncCtx + 4 >> 2] = $6; //@line 2971
   HEAP32[$AsyncCtx + 8 >> 2] = $11; //@line 2973
   HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 2975
   HEAP32[$AsyncCtx + 16 >> 2] = $4; //@line 2977
   sp = STACKTOP; //@line 2978
   return 0; //@line 2979
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2981
  if ($11 >>> 0 < ($15 - (HEAPU8[(HEAP32[$6 >> 2] | 0) + 2 >> 0] | 0) | 0) >>> 0) {
   return $1 | 0; //@line 2989
  }
  HEAP32[$4 >> 2] = 0; //@line 2991
  return $1 | 0; //@line 2992
 } else {
  $28 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 2996
  $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 2998
  $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 3000
  $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 3001
  FUNCTION_TABLE_viiii[$28 & 7]($0, $30, $32, $1); //@line 3002
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 120; //@line 3005
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 3007
   HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 3009
   sp = STACKTOP; //@line 3010
   return 0; //@line 3011
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3013
  if (!(HEAP32[$0 + 4168 >> 2] | 0)) {
   return $1 | 0; //@line 3018
  }
  _emscripten_asm_const_iiiii(4, HEAP32[$0 + 4172 >> 2] | 0, HEAP32[$0 + 4176 >> 2] | 0, HEAP32[$0 + 4180 >> 2] | 0, $0 + 68 | 0) | 0; //@line 3027
  return $1 | 0; //@line 3028
 }
 return 0; //@line 3030
}
function __ZN4mbed8FileBaseD2Ev($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $12 = 0, $17 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 950
 HEAP32[$0 >> 2] = 392; //@line 951
 $1 = HEAP32[2413] | 0; //@line 952
 do {
  if (!$1) {
   HEAP32[2413] = 9656; //@line 956
  } else {
   if (($1 | 0) != 9656) {
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 960
    _mbed_assert_internal(3120, 3140, 93); //@line 961
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 50; //@line 964
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 966
     sp = STACKTOP; //@line 967
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 970
     break;
    }
   }
  }
 } while (0);
 do {
  if (HEAP32[$0 + 8 >> 2] | 0) {
   $8 = HEAP32[2412] | 0; //@line 981
   if (($8 | 0) == ($0 | 0)) {
    HEAP32[2412] = HEAP32[$0 + 4 >> 2]; //@line 986
    break;
   } else {
    $$0 = $8; //@line 989
   }
   do {
    $12 = $$0 + 4 | 0; //@line 992
    $$0 = HEAP32[$12 >> 2] | 0; //@line 993
   } while (($$0 | 0) != ($0 | 0));
   HEAP32[$12 >> 2] = HEAP32[$0 + 4 >> 2]; //@line 1003
  }
 } while (0);
 $17 = HEAP32[2413] | 0; //@line 1006
 do {
  if (!$17) {
   HEAP32[2413] = 9656; //@line 1010
  } else {
   if (($17 | 0) != 9656) {
    $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1014
    _mbed_assert_internal(3120, 3140, 93); //@line 1015
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 51; //@line 1018
     HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1020
     sp = STACKTOP; //@line 1021
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx | 0); //@line 1024
     break;
    }
   }
  }
 } while (0);
 if (HEAP32[$0 + 12 >> 2] | 0) {
  return;
 }
 $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1037
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($0 + -4 | 0); //@line 1038
 if (___async) {
  HEAP32[$AsyncCtx7 >> 2] = 52; //@line 1041
  sp = STACKTOP; //@line 1042
  return;
 }
 _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1045
 return;
}
function __ZN4mbed8FileBaseD0Ev__async_cb_108($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $10 = 0, $15 = 0, $18 = 0, $2 = 0, $23 = 0, $6 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11381
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11383
 do {
  if (HEAP32[$2 + 8 >> 2] | 0) {
   $6 = HEAP32[2412] | 0; //@line 11389
   if (($6 | 0) == ($2 | 0)) {
    HEAP32[2412] = HEAP32[$2 + 4 >> 2]; //@line 11394
    break;
   } else {
    $$0$i = $6; //@line 11397
   }
   do {
    $10 = $$0$i + 4 | 0; //@line 11400
    $$0$i = HEAP32[$10 >> 2] | 0; //@line 11401
   } while (($$0$i | 0) != ($2 | 0));
   HEAP32[$10 >> 2] = HEAP32[$2 + 4 >> 2]; //@line 11411
  }
 } while (0);
 $15 = HEAP32[2413] | 0; //@line 11414
 if (!$15) {
  HEAP32[2413] = 9656; //@line 11417
 } else {
  if (($15 | 0) != 9656) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 11421
   _mbed_assert_internal(3120, 3140, 93); //@line 11422
   if (___async) {
    HEAP32[$ReallocAsyncCtx >> 2] = 54; //@line 11425
    $18 = $ReallocAsyncCtx + 4 | 0; //@line 11426
    HEAP32[$18 >> 2] = $2; //@line 11427
    sp = STACKTOP; //@line 11428
    return;
   }
   ___async_unwind = 0; //@line 11431
   HEAP32[$ReallocAsyncCtx >> 2] = 54; //@line 11432
   $18 = $ReallocAsyncCtx + 4 | 0; //@line 11433
   HEAP32[$18 >> 2] = $2; //@line 11434
   sp = STACKTOP; //@line 11435
   return;
  }
 }
 if (HEAP32[$2 + 12 >> 2] | 0) {
  __ZdlPv($2); //@line 11443
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 11447
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 11448
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 55; //@line 11451
  $23 = $ReallocAsyncCtx3 + 4 | 0; //@line 11452
  HEAP32[$23 >> 2] = $2; //@line 11453
  sp = STACKTOP; //@line 11454
  return;
 }
 ___async_unwind = 0; //@line 11457
 HEAP32[$ReallocAsyncCtx3 >> 2] = 55; //@line 11458
 $23 = $ReallocAsyncCtx3 + 4 | 0; //@line 11459
 HEAP32[$23 >> 2] = $2; //@line 11460
 sp = STACKTOP; //@line 11461
 return;
}
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 9661
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 9667
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 9673
   } else {
    $7 = $1 & 255; //@line 9675
    $$03039 = $0; //@line 9676
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 9678
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 9683
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 9686
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 9691
      break;
     } else {
      $$03039 = $13; //@line 9694
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 9698
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 9699
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 9707
     $25 = $18; //@line 9707
     while (1) {
      $24 = $25 ^ $17; //@line 9709
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 9716
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 9719
      $25 = HEAP32[$31 >> 2] | 0; //@line 9720
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 9729
       break;
      } else {
       $$02936 = $31; //@line 9727
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 9734
    }
   } while (0);
   $38 = $1 & 255; //@line 9737
   $$1 = $$029$lcssa; //@line 9738
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 9740
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 9746
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 9749
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 9754
}
function _main__async_cb_79($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx7 = 0, $bitmSan2$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 8953
 STACKTOP = STACKTOP + 16 | 0; //@line 8954
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 8954
 $bitmSan2$byval_copy = sp; //@line 8955
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8957
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8959
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8961
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8963
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8965
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8967
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8969
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8971
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 8973
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 8975
 __ZN6C1283211copy_to_lcdEv(9844); //@line 8976
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(40) | 0; //@line 8977
 HEAP32[$bitmSan2$byval_copy >> 2] = HEAP32[285]; //@line 8978
 HEAP32[$bitmSan2$byval_copy + 4 >> 2] = HEAP32[286]; //@line 8978
 HEAP32[$bitmSan2$byval_copy + 8 >> 2] = HEAP32[287]; //@line 8978
 HEAP32[$bitmSan2$byval_copy + 12 >> 2] = HEAP32[288]; //@line 8978
 __ZN6C128328print_bmE6Bitmapii(9844, $bitmSan2$byval_copy, $18, 2); //@line 8979
 if (!___async) {
  ___async_unwind = 0; //@line 8982
 }
 HEAP32[$ReallocAsyncCtx7 >> 2] = 173; //@line 8984
 HEAP32[$ReallocAsyncCtx7 + 4 >> 2] = $20; //@line 8986
 HEAP32[$ReallocAsyncCtx7 + 8 >> 2] = $10; //@line 8988
 HEAP32[$ReallocAsyncCtx7 + 12 >> 2] = $12; //@line 8990
 HEAP32[$ReallocAsyncCtx7 + 16 >> 2] = $14; //@line 8992
 HEAP32[$ReallocAsyncCtx7 + 20 >> 2] = $16; //@line 8994
 HEAP32[$ReallocAsyncCtx7 + 24 >> 2] = $2; //@line 8996
 HEAP32[$ReallocAsyncCtx7 + 28 >> 2] = $4; //@line 8998
 HEAP32[$ReallocAsyncCtx7 + 32 >> 2] = $6; //@line 9000
 HEAP32[$ReallocAsyncCtx7 + 36 >> 2] = $8; //@line 9002
 sp = STACKTOP; //@line 9003
 STACKTOP = sp; //@line 9004
 return;
}
function _main__async_cb_78($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, $bitmSan3$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 8896
 STACKTOP = STACKTOP + 16 | 0; //@line 8897
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 8897
 $bitmSan3$byval_copy = sp; //@line 8898
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8900
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8902
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8904
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8906
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8908
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8910
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8912
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8914
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 8916
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 8918
 __ZN6C1283211copy_to_lcdEv(9844); //@line 8919
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(40) | 0; //@line 8920
 HEAP32[$bitmSan3$byval_copy >> 2] = HEAP32[289]; //@line 8921
 HEAP32[$bitmSan3$byval_copy + 4 >> 2] = HEAP32[290]; //@line 8921
 HEAP32[$bitmSan3$byval_copy + 8 >> 2] = HEAP32[291]; //@line 8921
 HEAP32[$bitmSan3$byval_copy + 12 >> 2] = HEAP32[292]; //@line 8921
 __ZN6C128328print_bmE6Bitmapii(9844, $bitmSan3$byval_copy, $18, 2); //@line 8922
 if (!___async) {
  ___async_unwind = 0; //@line 8925
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 176; //@line 8927
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $10; //@line 8929
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $12; //@line 8931
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $14; //@line 8933
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $16; //@line 8935
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $20; //@line 8937
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $2; //@line 8939
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $4; //@line 8941
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $6; //@line 8943
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $8; //@line 8945
 sp = STACKTOP; //@line 8946
 STACKTOP = sp; //@line 8947
 return;
}
function _main__async_cb_74($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx8 = 0, $bitmSan2$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 8652
 STACKTOP = STACKTOP + 16 | 0; //@line 8653
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 8653
 $bitmSan2$byval_copy = sp; //@line 8654
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8656
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8658
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8660
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8662
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8664
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8666
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8668
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8670
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 8672
 $19 = $2 + 3 | 0; //@line 8673
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(44) | 0; //@line 8674
 HEAP32[$bitmSan2$byval_copy >> 2] = HEAP32[285]; //@line 8675
 HEAP32[$bitmSan2$byval_copy + 4 >> 2] = HEAP32[286]; //@line 8675
 HEAP32[$bitmSan2$byval_copy + 8 >> 2] = HEAP32[287]; //@line 8675
 HEAP32[$bitmSan2$byval_copy + 12 >> 2] = HEAP32[288]; //@line 8675
 __ZN6C128328print_bmE6Bitmapii(9844, $bitmSan2$byval_copy, $19, 2); //@line 8676
 if (!___async) {
  ___async_unwind = 0; //@line 8679
 }
 HEAP32[$ReallocAsyncCtx8 >> 2] = 171; //@line 8681
 HEAP32[$ReallocAsyncCtx8 + 4 >> 2] = $19; //@line 8683
 HEAP32[$ReallocAsyncCtx8 + 8 >> 2] = $2; //@line 8685
 HEAP32[$ReallocAsyncCtx8 + 12 >> 2] = $4; //@line 8687
 HEAP32[$ReallocAsyncCtx8 + 16 >> 2] = $6; //@line 8689
 HEAP32[$ReallocAsyncCtx8 + 20 >> 2] = $8; //@line 8691
 HEAP32[$ReallocAsyncCtx8 + 24 >> 2] = $10; //@line 8693
 HEAP32[$ReallocAsyncCtx8 + 28 >> 2] = $12; //@line 8695
 HEAP32[$ReallocAsyncCtx8 + 32 >> 2] = $14; //@line 8697
 HEAP32[$ReallocAsyncCtx8 + 36 >> 2] = $16; //@line 8699
 HEAP32[$ReallocAsyncCtx8 + 40 >> 2] = $18; //@line 8701
 sp = STACKTOP; //@line 8702
 STACKTOP = sp; //@line 8703
 return;
}
function _main__async_cb_72($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx6 = 0, $bitmSan3$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 8540
 STACKTOP = STACKTOP + 16 | 0; //@line 8541
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 8541
 $bitmSan3$byval_copy = sp; //@line 8542
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8544
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8546
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8548
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8550
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8552
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8554
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8556
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8558
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 8560
 $19 = $2 + 6 | 0; //@line 8561
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(44) | 0; //@line 8562
 HEAP32[$bitmSan3$byval_copy >> 2] = HEAP32[289]; //@line 8563
 HEAP32[$bitmSan3$byval_copy + 4 >> 2] = HEAP32[290]; //@line 8563
 HEAP32[$bitmSan3$byval_copy + 8 >> 2] = HEAP32[291]; //@line 8563
 HEAP32[$bitmSan3$byval_copy + 12 >> 2] = HEAP32[292]; //@line 8563
 __ZN6C128328print_bmE6Bitmapii(9844, $bitmSan3$byval_copy, $19, 2); //@line 8564
 if (!___async) {
  ___async_unwind = 0; //@line 8567
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 174; //@line 8569
 HEAP32[$ReallocAsyncCtx6 + 4 >> 2] = $19; //@line 8571
 HEAP32[$ReallocAsyncCtx6 + 8 >> 2] = $4; //@line 8573
 HEAP32[$ReallocAsyncCtx6 + 12 >> 2] = $6; //@line 8575
 HEAP32[$ReallocAsyncCtx6 + 16 >> 2] = $8; //@line 8577
 HEAP32[$ReallocAsyncCtx6 + 20 >> 2] = $10; //@line 8579
 HEAP32[$ReallocAsyncCtx6 + 24 >> 2] = $2; //@line 8581
 HEAP32[$ReallocAsyncCtx6 + 28 >> 2] = $12; //@line 8583
 HEAP32[$ReallocAsyncCtx6 + 32 >> 2] = $14; //@line 8585
 HEAP32[$ReallocAsyncCtx6 + 36 >> 2] = $16; //@line 8587
 HEAP32[$ReallocAsyncCtx6 + 40 >> 2] = $18; //@line 8589
 sp = STACKTOP; //@line 8590
 STACKTOP = sp; //@line 8591
 return;
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 9183
 $4 = HEAP32[$3 >> 2] | 0; //@line 9184
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 9191
   label = 5; //@line 9192
  } else {
   $$1 = 0; //@line 9194
  }
 } else {
  $12 = $4; //@line 9198
  label = 5; //@line 9199
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 9203
   $10 = HEAP32[$9 >> 2] | 0; //@line 9204
   $14 = $10; //@line 9207
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 15]($2, $0, $1) | 0; //@line 9212
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 9220
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 9224
       $$141 = $0; //@line 9224
       $$143 = $1; //@line 9224
       $31 = $14; //@line 9224
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 9227
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 9234
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 15]($2, $0, $$038) | 0; //@line 9239
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 9242
      break L5;
     }
     $$139 = $$038; //@line 9248
     $$141 = $0 + $$038 | 0; //@line 9248
     $$143 = $1 - $$038 | 0; //@line 9248
     $31 = HEAP32[$9 >> 2] | 0; //@line 9248
    } else {
     $$139 = 0; //@line 9250
     $$141 = $0; //@line 9250
     $$143 = $1; //@line 9250
     $31 = $14; //@line 9250
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 9253
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 9256
   $$1 = $$139 + $$143 | 0; //@line 9258
  }
 } while (0);
 return $$1 | 0; //@line 9261
}
function _main__async_cb_76($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx10 = 0, $bitmSan1$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 8760
 STACKTOP = STACKTOP + 16 | 0; //@line 8761
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 8761
 $bitmSan1$byval_copy = sp; //@line 8762
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8764
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8766
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8768
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8770
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8772
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8774
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8776
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8778
 __ZN6C1283211copy_to_lcdEv(9844); //@line 8779
 __ZN6C128327setmodeEi(9844, 1); //@line 8780
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(40) | 0; //@line 8781
 HEAP32[$bitmSan1$byval_copy >> 2] = HEAP32[281]; //@line 8782
 HEAP32[$bitmSan1$byval_copy + 4 >> 2] = HEAP32[282]; //@line 8782
 HEAP32[$bitmSan1$byval_copy + 8 >> 2] = HEAP32[283]; //@line 8782
 HEAP32[$bitmSan1$byval_copy + 12 >> 2] = HEAP32[284]; //@line 8782
 __ZN6C128328print_bmE6Bitmapii(9844, $bitmSan1$byval_copy, -15, 2); //@line 8783
 if (!___async) {
  ___async_unwind = 0; //@line 8786
 }
 HEAP32[$ReallocAsyncCtx10 >> 2] = 168; //@line 8788
 HEAP32[$ReallocAsyncCtx10 + 4 >> 2] = -15; //@line 8790
 HEAP32[$ReallocAsyncCtx10 + 8 >> 2] = $2; //@line 8792
 HEAP32[$ReallocAsyncCtx10 + 12 >> 2] = $4; //@line 8794
 HEAP32[$ReallocAsyncCtx10 + 16 >> 2] = $6; //@line 8796
 HEAP32[$ReallocAsyncCtx10 + 20 >> 2] = $8; //@line 8798
 HEAP32[$ReallocAsyncCtx10 + 24 >> 2] = $10; //@line 8800
 HEAP32[$ReallocAsyncCtx10 + 28 >> 2] = $12; //@line 8802
 HEAP32[$ReallocAsyncCtx10 + 32 >> 2] = $14; //@line 8804
 HEAP32[$ReallocAsyncCtx10 + 36 >> 2] = $16; //@line 8806
 sp = STACKTOP; //@line 8807
 STACKTOP = sp; //@line 8808
 return;
}
function _main__async_cb_80($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx9 = 0, $bitmSan1$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 9010
 STACKTOP = STACKTOP + 16 | 0; //@line 9011
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 9011
 $bitmSan1$byval_copy = sp; //@line 9012
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9014
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9016
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9018
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9020
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9022
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 9024
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 9026
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 9028
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 9030
 __ZN6C1283211copy_to_lcdEv(9844); //@line 9031
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(40) | 0; //@line 9032
 HEAP32[$bitmSan1$byval_copy >> 2] = HEAP32[281]; //@line 9033
 HEAP32[$bitmSan1$byval_copy + 4 >> 2] = HEAP32[282]; //@line 9033
 HEAP32[$bitmSan1$byval_copy + 8 >> 2] = HEAP32[283]; //@line 9033
 HEAP32[$bitmSan1$byval_copy + 12 >> 2] = HEAP32[284]; //@line 9033
 __ZN6C128328print_bmE6Bitmapii(9844, $bitmSan1$byval_copy, $18, 2); //@line 9034
 if (!___async) {
  ___async_unwind = 0; //@line 9037
 }
 HEAP32[$ReallocAsyncCtx9 >> 2] = 170; //@line 9039
 HEAP32[$ReallocAsyncCtx9 + 4 >> 2] = $18; //@line 9041
 HEAP32[$ReallocAsyncCtx9 + 8 >> 2] = $10; //@line 9043
 HEAP32[$ReallocAsyncCtx9 + 12 >> 2] = $12; //@line 9045
 HEAP32[$ReallocAsyncCtx9 + 16 >> 2] = $14; //@line 9047
 HEAP32[$ReallocAsyncCtx9 + 20 >> 2] = $16; //@line 9049
 HEAP32[$ReallocAsyncCtx9 + 24 >> 2] = $2; //@line 9051
 HEAP32[$ReallocAsyncCtx9 + 28 >> 2] = $4; //@line 9053
 HEAP32[$ReallocAsyncCtx9 + 32 >> 2] = $6; //@line 9055
 HEAP32[$ReallocAsyncCtx9 + 36 >> 2] = $8; //@line 9057
 sp = STACKTOP; //@line 9058
 STACKTOP = sp; //@line 9059
 return;
}
function __ZN15GraphicsDisplay4blitEiiiiPKi($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$011 = 0, $13 = 0, $17 = 0, $19 = 0, $25 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4093
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 136 >> 2] | 0; //@line 4096
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 4097
 FUNCTION_TABLE_viiiii[$8 & 7]($0, $1, $2, $3, $4); //@line 4098
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 142; //@line 4101
  HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 4103
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 4105
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 4107
  HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 4109
  sp = STACKTOP; //@line 4110
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 4113
 $13 = Math_imul($4, $3) | 0; //@line 4114
 if (($13 | 0) <= 0) {
  return;
 }
 $$011 = 0; //@line 4119
 while (1) {
  $17 = HEAP32[(HEAP32[$0 >> 2] | 0) + 140 >> 2] | 0; //@line 4123
  $19 = HEAP32[$5 + ($$011 << 2) >> 2] | 0; //@line 4125
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 4126
  FUNCTION_TABLE_vii[$17 & 7]($0, $19); //@line 4127
  if (___async) {
   label = 7; //@line 4130
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4133
  $25 = $$011 + 1 | 0; //@line 4134
  if (($25 | 0) == ($13 | 0)) {
   label = 5; //@line 4137
   break;
  } else {
   $$011 = $25; //@line 4140
  }
 }
 if ((label | 0) == 5) {
  return;
 } else if ((label | 0) == 7) {
  HEAP32[$AsyncCtx3 >> 2] = 143; //@line 4147
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$011; //@line 4149
  HEAP32[$AsyncCtx3 + 8 >> 2] = $13; //@line 4151
  HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 4153
  HEAP32[$AsyncCtx3 + 16 >> 2] = $5; //@line 4155
  HEAP32[$AsyncCtx3 + 20 >> 2] = $0; //@line 4157
  sp = STACKTOP; //@line 4158
  return;
 }
}
function __ZN11TextDisplayC2EPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $12 = 0, $13 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4717
 STACKTOP = STACKTOP + 16 | 0; //@line 4718
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4718
 $vararg_buffer = sp; //@line 4719
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 4720
 __ZN4mbed6StreamC2EPKc($0, $1); //@line 4721
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 162; //@line 4724
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 4726
  HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 4728
  HEAP32[$AsyncCtx3 + 12 >> 2] = $vararg_buffer; //@line 4730
  HEAP32[$AsyncCtx3 + 16 >> 2] = $vararg_buffer; //@line 4732
  sp = STACKTOP; //@line 4733
  STACKTOP = sp; //@line 4734
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4736
 HEAP32[$0 >> 2] = 968; //@line 4737
 HEAP32[$0 + 4 >> 2] = 1100; //@line 4739
 HEAP16[$0 + 26 >> 1] = 0; //@line 4741
 HEAP16[$0 + 24 >> 1] = 0; //@line 4743
 if (!$1) {
  HEAP32[$0 + 32 >> 2] = 0; //@line 4747
  STACKTOP = sp; //@line 4748
  return;
 }
 $12 = (_strlen($1) | 0) + 2 | 0; //@line 4751
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 4752
 $13 = __Znaj($12) | 0; //@line 4753
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 163; //@line 4756
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 4758
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 4760
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 4762
  HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer; //@line 4764
  sp = STACKTOP; //@line 4765
  STACKTOP = sp; //@line 4766
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 4768
 HEAP32[$0 + 32 >> 2] = $13; //@line 4770
 HEAP32[$vararg_buffer >> 2] = $1; //@line 4771
 _sprintf($13, 6151, $vararg_buffer) | 0; //@line 4772
 STACKTOP = sp; //@line 4773
 return;
}
function __ZN15GraphicsDisplay4blitEiiiiPKi__async_cb_17($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4574
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4578
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4580
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4582
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4584
 $15 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 4585
 if (($15 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 140 >> 2] | 0; //@line 4592
 $16 = HEAP32[$8 + ($15 << 2) >> 2] | 0; //@line 4594
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 4595
 FUNCTION_TABLE_vii[$13 & 7]($10, $16); //@line 4596
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 143; //@line 4599
  $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 4600
  HEAP32[$17 >> 2] = $15; //@line 4601
  $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 4602
  HEAP32[$18 >> 2] = $4; //@line 4603
  $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 4604
  HEAP32[$19 >> 2] = $6; //@line 4605
  $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 4606
  HEAP32[$20 >> 2] = $8; //@line 4607
  $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 4608
  HEAP32[$21 >> 2] = $10; //@line 4609
  sp = STACKTOP; //@line 4610
  return;
 }
 ___async_unwind = 0; //@line 4613
 HEAP32[$ReallocAsyncCtx2 >> 2] = 143; //@line 4614
 $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 4615
 HEAP32[$17 >> 2] = $15; //@line 4616
 $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 4617
 HEAP32[$18 >> 2] = $4; //@line 4618
 $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 4619
 HEAP32[$19 >> 2] = $6; //@line 4620
 $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 4621
 HEAP32[$20 >> 2] = $8; //@line 4622
 $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 4623
 HEAP32[$21 >> 2] = $10; //@line 4624
 sp = STACKTOP; //@line 4625
 return;
}
function __ZN15GraphicsDisplay4fillEiiiii($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$010 = 0, $13 = 0, $17 = 0, $23 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4017
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 136 >> 2] | 0; //@line 4020
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 4021
 FUNCTION_TABLE_viiiii[$8 & 7]($0, $1, $2, $3, $4); //@line 4022
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 140; //@line 4025
  HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 4027
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 4029
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 4031
  HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 4033
  sp = STACKTOP; //@line 4034
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 4037
 $13 = Math_imul($4, $3) | 0; //@line 4038
 if (($13 | 0) <= 0) {
  return;
 }
 $$010 = 0; //@line 4043
 while (1) {
  $17 = HEAP32[(HEAP32[$0 >> 2] | 0) + 140 >> 2] | 0; //@line 4047
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 4048
  FUNCTION_TABLE_vii[$17 & 7]($0, $5); //@line 4049
  if (___async) {
   label = 7; //@line 4052
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4055
  $23 = $$010 + 1 | 0; //@line 4056
  if (($23 | 0) == ($13 | 0)) {
   label = 5; //@line 4059
   break;
  } else {
   $$010 = $23; //@line 4062
  }
 }
 if ((label | 0) == 5) {
  return;
 } else if ((label | 0) == 7) {
  HEAP32[$AsyncCtx3 >> 2] = 141; //@line 4069
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$010; //@line 4071
  HEAP32[$AsyncCtx3 + 8 >> 2] = $13; //@line 4073
  HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 4075
  HEAP32[$AsyncCtx3 + 16 >> 2] = $0; //@line 4077
  HEAP32[$AsyncCtx3 + 20 >> 2] = $5; //@line 4079
  sp = STACKTOP; //@line 4080
  return;
 }
}
function _main__async_cb_67($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx11 = 0, $bitmTree$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 8209
 STACKTOP = STACKTOP + 16 | 0; //@line 8210
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 8210
 $bitmTree$byval_copy = sp; //@line 8211
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8213
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8215
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8217
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8219
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8221
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8223
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8225
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8227
 __ZN6C128323clsEv(9844); //@line 8228
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(36) | 0; //@line 8229
 HEAP32[$bitmTree$byval_copy >> 2] = HEAP32[277]; //@line 8230
 HEAP32[$bitmTree$byval_copy + 4 >> 2] = HEAP32[278]; //@line 8230
 HEAP32[$bitmTree$byval_copy + 8 >> 2] = HEAP32[279]; //@line 8230
 HEAP32[$bitmTree$byval_copy + 12 >> 2] = HEAP32[280]; //@line 8230
 __ZN6C128328print_bmE6Bitmapii(9844, $bitmTree$byval_copy, 95, 0); //@line 8231
 if (!___async) {
  ___async_unwind = 0; //@line 8234
 }
 HEAP32[$ReallocAsyncCtx11 >> 2] = 167; //@line 8236
 HEAP32[$ReallocAsyncCtx11 + 4 >> 2] = $2; //@line 8238
 HEAP32[$ReallocAsyncCtx11 + 8 >> 2] = $4; //@line 8240
 HEAP32[$ReallocAsyncCtx11 + 12 >> 2] = $6; //@line 8242
 HEAP32[$ReallocAsyncCtx11 + 16 >> 2] = $8; //@line 8244
 HEAP32[$ReallocAsyncCtx11 + 20 >> 2] = $10; //@line 8246
 HEAP32[$ReallocAsyncCtx11 + 24 >> 2] = $12; //@line 8248
 HEAP32[$ReallocAsyncCtx11 + 28 >> 2] = $14; //@line 8250
 HEAP32[$ReallocAsyncCtx11 + 32 >> 2] = $16; //@line 8252
 sp = STACKTOP; //@line 8253
 STACKTOP = sp; //@line 8254
 return;
}
function __ZN4mbed8FileBaseD2Ev__async_cb_99($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $15 = 0, $18 = 0, $2 = 0, $6 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 10806
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10808
 do {
  if (HEAP32[$2 + 8 >> 2] | 0) {
   $6 = HEAP32[2412] | 0; //@line 10814
   if (($6 | 0) == ($2 | 0)) {
    HEAP32[2412] = HEAP32[$2 + 4 >> 2]; //@line 10819
    break;
   } else {
    $$0 = $6; //@line 10822
   }
   do {
    $10 = $$0 + 4 | 0; //@line 10825
    $$0 = HEAP32[$10 >> 2] | 0; //@line 10826
   } while (($$0 | 0) != ($2 | 0));
   HEAP32[$10 >> 2] = HEAP32[$2 + 4 >> 2]; //@line 10836
  }
 } while (0);
 $15 = HEAP32[2413] | 0; //@line 10839
 if (!$15) {
  HEAP32[2413] = 9656; //@line 10842
 } else {
  if (($15 | 0) != 9656) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 10846
   _mbed_assert_internal(3120, 3140, 93); //@line 10847
   if (___async) {
    HEAP32[$ReallocAsyncCtx >> 2] = 51; //@line 10850
    $18 = $ReallocAsyncCtx + 4 | 0; //@line 10851
    HEAP32[$18 >> 2] = $2; //@line 10852
    sp = STACKTOP; //@line 10853
    return;
   }
   ___async_unwind = 0; //@line 10856
   HEAP32[$ReallocAsyncCtx >> 2] = 51; //@line 10857
   $18 = $ReallocAsyncCtx + 4 | 0; //@line 10858
   HEAP32[$18 >> 2] = $2; //@line 10859
   sp = STACKTOP; //@line 10860
   return;
  }
 }
 if (HEAP32[$2 + 12 >> 2] | 0) {
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 10871
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 10872
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 52; //@line 10875
  sp = STACKTOP; //@line 10876
  return;
 }
 ___async_unwind = 0; //@line 10879
 HEAP32[$ReallocAsyncCtx3 >> 2] = 52; //@line 10880
 sp = STACKTOP; //@line 10881
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_3($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3068
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3072
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3074
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3076
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3078
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3080
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3082
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3084
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 3087
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 3088
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 3104
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 3105
    if (!___async) {
     ___async_unwind = 0; //@line 3108
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 224; //@line 3110
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 3112
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 3114
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 3116
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 3118
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 3120
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 3122
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 3124
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 3126
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 3129
    sp = STACKTOP; //@line 3130
    return;
   }
  }
 } while (0);
 return;
}
function __ZN4mbed10FileHandle4sizeEv($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $17 = 0, $3 = 0, $4 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 1292
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 1295
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1296
 $4 = FUNCTION_TABLE_iiii[$3 & 15]($0, 0, 1) | 0; //@line 1297
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 60; //@line 1300
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1302
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 1304
  sp = STACKTOP; //@line 1305
  return 0; //@line 1306
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1308
 if (($4 | 0) < 0) {
  $$0 = $4; //@line 1311
  return $$0 | 0; //@line 1312
 }
 $10 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 1316
 $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1317
 $11 = FUNCTION_TABLE_iiii[$10 & 15]($0, 0, 2) | 0; //@line 1318
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 61; //@line 1321
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1323
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 1325
  HEAP32[$AsyncCtx3 + 12 >> 2] = $4; //@line 1327
  sp = STACKTOP; //@line 1328
  return 0; //@line 1329
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1331
 $17 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 1334
 $AsyncCtx6 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1335
 FUNCTION_TABLE_iiii[$17 & 15]($0, $4, 0) | 0; //@line 1336
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 62; //@line 1339
  HEAP32[$AsyncCtx6 + 4 >> 2] = $11; //@line 1341
  sp = STACKTOP; //@line 1342
  return 0; //@line 1343
 }
 _emscripten_free_async_context($AsyncCtx6 | 0); //@line 1345
 $$0 = $11; //@line 1346
 return $$0 | 0; //@line 1347
}
function __ZN11TextDisplay5_putcEi__async_cb_57($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $16 = 0, $17 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 7689
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7693
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7695
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7697
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 7699
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 7701
 if ((HEAP32[___async_retval >> 2] | 0) > (HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP32[___async_retval >> 2] = $4; //@line 7707
  return;
 }
 HEAP16[$6 >> 1] = 0; //@line 7710
 $16 = (HEAP16[$8 >> 1] | 0) + 1 << 16 >> 16; //@line 7712
 HEAP16[$8 >> 1] = $16; //@line 7713
 $17 = $16 & 65535; //@line 7714
 $20 = HEAP32[(HEAP32[$10 >> 2] | 0) + 96 >> 2] | 0; //@line 7717
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 7718
 $21 = FUNCTION_TABLE_ii[$20 & 31]($12) | 0; //@line 7719
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 152; //@line 7722
  $22 = $ReallocAsyncCtx4 + 4 | 0; //@line 7723
  HEAP32[$22 >> 2] = $17; //@line 7724
  $23 = $ReallocAsyncCtx4 + 8 | 0; //@line 7725
  HEAP32[$23 >> 2] = $4; //@line 7726
  $24 = $ReallocAsyncCtx4 + 12 | 0; //@line 7727
  HEAP32[$24 >> 2] = $8; //@line 7728
  sp = STACKTOP; //@line 7729
  return;
 }
 HEAP32[___async_retval >> 2] = $21; //@line 7733
 ___async_unwind = 0; //@line 7734
 HEAP32[$ReallocAsyncCtx4 >> 2] = 152; //@line 7735
 $22 = $ReallocAsyncCtx4 + 4 | 0; //@line 7736
 HEAP32[$22 >> 2] = $17; //@line 7737
 $23 = $ReallocAsyncCtx4 + 8 | 0; //@line 7738
 HEAP32[$23 >> 2] = $4; //@line 7739
 $24 = $ReallocAsyncCtx4 + 12 | 0; //@line 7740
 HEAP32[$24 >> 2] = $8; //@line 7741
 sp = STACKTOP; //@line 7742
 return;
}
function ___dup3($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$sink = 0, $5 = 0, $6 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 557
 STACKTOP = STACKTOP + 48 | 0; //@line 558
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 558
 $vararg_buffer7 = sp + 24 | 0; //@line 559
 $vararg_buffer3 = sp + 16 | 0; //@line 560
 $vararg_buffer = sp; //@line 561
 L1 : do {
  if (($0 | 0) == ($1 | 0)) {
   $$sink = -22; //@line 565
  } else {
   $5 = ($2 & 524288 | 0) != 0; //@line 568
   L3 : do {
    if ($5) {
     while (1) {
      HEAP32[$vararg_buffer >> 2] = $0; //@line 572
      HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 574
      HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 576
      $6 = ___syscall330(330, $vararg_buffer | 0) | 0; //@line 577
      switch ($6 | 0) {
      case -38:
       {
        break L3;
        break;
       }
      case -16:
       {
        break;
       }
      default:
       {
        $$sink = $6; //@line 587
        break L1;
       }
      }
     }
    }
   } while (0);
   do {
    HEAP32[$vararg_buffer3 >> 2] = $0; //@line 595
    HEAP32[$vararg_buffer3 + 4 >> 2] = $1; //@line 597
    $7 = ___syscall63(63, $vararg_buffer3 | 0) | 0; //@line 598
   } while (($7 | 0) == -16);
   if ($5) {
    HEAP32[$vararg_buffer7 >> 2] = $1; //@line 605
    HEAP32[$vararg_buffer7 + 4 >> 2] = 2; //@line 607
    HEAP32[$vararg_buffer7 + 8 >> 2] = 1; //@line 609
    ___syscall221(221, $vararg_buffer7 | 0) | 0; //@line 610
    $$sink = $7; //@line 611
   } else {
    $$sink = $7; //@line 613
   }
  }
 } while (0);
 $9 = ___syscall_ret($$sink) | 0; //@line 617
 STACKTOP = sp; //@line 618
 return $9 | 0; //@line 618
}
function __ZN11TextDisplayC2EPKc__async_cb_42($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6153
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6155
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6157
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6159
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6161
 HEAP32[$2 >> 2] = 968; //@line 6162
 HEAP32[$2 + 4 >> 2] = 1100; //@line 6164
 HEAP16[$2 + 26 >> 1] = 0; //@line 6166
 HEAP16[$2 + 24 >> 1] = 0; //@line 6168
 if (!$4) {
  HEAP32[$2 + 32 >> 2] = 0; //@line 6172
  return;
 }
 $15 = (_strlen($4) | 0) + 2 | 0; //@line 6176
 $ReallocAsyncCtx = _emscripten_realloc_async_context(20) | 0; //@line 6177
 $16 = __Znaj($15) | 0; //@line 6178
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 163; //@line 6181
  $17 = $ReallocAsyncCtx + 4 | 0; //@line 6182
  HEAP32[$17 >> 2] = $2; //@line 6183
  $18 = $ReallocAsyncCtx + 8 | 0; //@line 6184
  HEAP32[$18 >> 2] = $6; //@line 6185
  $19 = $ReallocAsyncCtx + 12 | 0; //@line 6186
  HEAP32[$19 >> 2] = $4; //@line 6187
  $20 = $ReallocAsyncCtx + 16 | 0; //@line 6188
  HEAP32[$20 >> 2] = $8; //@line 6189
  sp = STACKTOP; //@line 6190
  return;
 }
 HEAP32[___async_retval >> 2] = $16; //@line 6194
 ___async_unwind = 0; //@line 6195
 HEAP32[$ReallocAsyncCtx >> 2] = 163; //@line 6196
 $17 = $ReallocAsyncCtx + 4 | 0; //@line 6197
 HEAP32[$17 >> 2] = $2; //@line 6198
 $18 = $ReallocAsyncCtx + 8 | 0; //@line 6199
 HEAP32[$18 >> 2] = $6; //@line 6200
 $19 = $ReallocAsyncCtx + 12 | 0; //@line 6201
 HEAP32[$19 >> 2] = $4; //@line 6202
 $20 = $ReallocAsyncCtx + 16 | 0; //@line 6203
 HEAP32[$20 >> 2] = $8; //@line 6204
 sp = STACKTOP; //@line 6205
 return;
}
function ___stdio_read($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$cast = 0, $11 = 0, $18 = 0, $24 = 0, $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 8642
 STACKTOP = STACKTOP + 32 | 0; //@line 8643
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 8643
 $vararg_buffer = sp; //@line 8644
 $3 = sp + 16 | 0; //@line 8645
 HEAP32[$3 >> 2] = $1; //@line 8646
 $4 = $3 + 4 | 0; //@line 8647
 $5 = $0 + 48 | 0; //@line 8648
 $6 = HEAP32[$5 >> 2] | 0; //@line 8649
 HEAP32[$4 >> 2] = $2 - (($6 | 0) != 0 & 1); //@line 8653
 $11 = $0 + 44 | 0; //@line 8655
 HEAP32[$3 + 8 >> 2] = HEAP32[$11 >> 2]; //@line 8657
 HEAP32[$3 + 12 >> 2] = $6; //@line 8659
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 8663
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 8665
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 8667
 $18 = ___syscall_ret(___syscall145(145, $vararg_buffer | 0) | 0) | 0; //@line 8669
 if (($18 | 0) < 1) {
  HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | $18 & 48 ^ 16; //@line 8676
  $$0 = $18; //@line 8677
 } else {
  $24 = HEAP32[$4 >> 2] | 0; //@line 8679
  if ($18 >>> 0 > $24 >>> 0) {
   $27 = HEAP32[$11 >> 2] | 0; //@line 8683
   $28 = $0 + 4 | 0; //@line 8684
   HEAP32[$28 >> 2] = $27; //@line 8685
   $$cast = $27; //@line 8686
   HEAP32[$0 + 8 >> 2] = $$cast + ($18 - $24); //@line 8689
   if (!(HEAP32[$5 >> 2] | 0)) {
    $$0 = $2; //@line 8693
   } else {
    HEAP32[$28 >> 2] = $$cast + 1; //@line 8696
    HEAP8[$1 + ($2 + -1) >> 0] = HEAP8[$$cast >> 0] | 0; //@line 8700
    $$0 = $2; //@line 8701
   }
  } else {
   $$0 = $18; //@line 8704
  }
 }
 STACKTOP = sp; //@line 8707
 return $$0 | 0; //@line 8707
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9069
 STACKTOP = STACKTOP + 16 | 0; //@line 9070
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 9070
 $2 = sp; //@line 9071
 $3 = $1 & 255; //@line 9072
 HEAP8[$2 >> 0] = $3; //@line 9073
 $4 = $0 + 16 | 0; //@line 9074
 $5 = HEAP32[$4 >> 2] | 0; //@line 9075
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 9082
   label = 4; //@line 9083
  } else {
   $$0 = -1; //@line 9085
  }
 } else {
  $12 = $5; //@line 9088
  label = 4; //@line 9089
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 9093
   $10 = HEAP32[$9 >> 2] | 0; //@line 9094
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 9097
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 9104
     HEAP8[$10 >> 0] = $3; //@line 9105
     $$0 = $13; //@line 9106
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 9111
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 9112
   $21 = FUNCTION_TABLE_iiii[$20 & 15]($0, $2, 1) | 0; //@line 9113
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 182; //@line 9116
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 9118
    sp = STACKTOP; //@line 9119
    STACKTOP = sp; //@line 9120
    return 0; //@line 9120
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 9122
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 9127
   } else {
    $$0 = -1; //@line 9129
   }
  }
 } while (0);
 STACKTOP = sp; //@line 9133
 return $$0 | 0; //@line 9133
}
function _fflush__async_cb_104($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11094
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11096
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 11098
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 11102
  } else {
   $$02327 = $$02325; //@line 11104
   $$02426 = $AsyncRetVal; //@line 11104
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 11111
    } else {
     $16 = 0; //@line 11113
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 11125
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 11128
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 11131
     break L3;
    } else {
     $$02327 = $$023; //@line 11134
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 11137
   $13 = ___fflush_unlocked($$02327) | 0; //@line 11138
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 11142
    ___async_unwind = 0; //@line 11143
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 188; //@line 11145
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 11147
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 11149
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 11151
   sp = STACKTOP; //@line 11152
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 11156
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 11158
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 12073
 value = value & 255; //@line 12075
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 12078
   ptr = ptr + 1 | 0; //@line 12079
  }
  aligned_end = end & -4 | 0; //@line 12082
  block_aligned_end = aligned_end - 64 | 0; //@line 12083
  value4 = value | value << 8 | value << 16 | value << 24; //@line 12084
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 12087
   HEAP32[ptr + 4 >> 2] = value4; //@line 12088
   HEAP32[ptr + 8 >> 2] = value4; //@line 12089
   HEAP32[ptr + 12 >> 2] = value4; //@line 12090
   HEAP32[ptr + 16 >> 2] = value4; //@line 12091
   HEAP32[ptr + 20 >> 2] = value4; //@line 12092
   HEAP32[ptr + 24 >> 2] = value4; //@line 12093
   HEAP32[ptr + 28 >> 2] = value4; //@line 12094
   HEAP32[ptr + 32 >> 2] = value4; //@line 12095
   HEAP32[ptr + 36 >> 2] = value4; //@line 12096
   HEAP32[ptr + 40 >> 2] = value4; //@line 12097
   HEAP32[ptr + 44 >> 2] = value4; //@line 12098
   HEAP32[ptr + 48 >> 2] = value4; //@line 12099
   HEAP32[ptr + 52 >> 2] = value4; //@line 12100
   HEAP32[ptr + 56 >> 2] = value4; //@line 12101
   HEAP32[ptr + 60 >> 2] = value4; //@line 12102
   ptr = ptr + 64 | 0; //@line 12103
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 12107
   ptr = ptr + 4 | 0; //@line 12108
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 12113
  ptr = ptr + 1 | 0; //@line 12114
 }
 return end - num | 0; //@line 12116
}
function __ZN15GraphicsDisplay3clsEv($0) {
 $0 = $0 | 0;
 var $1 = 0, $12 = 0, $13 = 0, $19 = 0, $3 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 3868
 $1 = HEAP32[$0 >> 2] | 0; //@line 3869
 $3 = HEAP32[$1 + 144 >> 2] | 0; //@line 3871
 $5 = HEAP32[$1 + 128 >> 2] | 0; //@line 3873
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 3874
 $6 = FUNCTION_TABLE_ii[$5 & 31]($0) | 0; //@line 3875
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 136; //@line 3878
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3880
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 3882
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 3884
  sp = STACKTOP; //@line 3885
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3888
 $12 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 3891
 $AsyncCtx2 = _emscripten_alloc_async_context(16, sp) | 0; //@line 3892
 $13 = FUNCTION_TABLE_ii[$12 & 31]($0) | 0; //@line 3893
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 137; //@line 3896
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 3898
  HEAP32[$AsyncCtx2 + 8 >> 2] = $6; //@line 3900
  HEAP32[$AsyncCtx2 + 12 >> 2] = $3; //@line 3902
  sp = STACKTOP; //@line 3903
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 3906
 $19 = HEAPU16[$0 + 30 >> 1] | 0; //@line 3909
 $AsyncCtx5 = _emscripten_alloc_async_context(4, sp) | 0; //@line 3910
 FUNCTION_TABLE_viiiiii[$3 & 7]($0, 0, 0, $6, $13, $19); //@line 3911
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 138; //@line 3914
  sp = STACKTOP; //@line 3915
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 3918
  return;
 }
}
function __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1159
 HEAP32[$0 >> 2] = 392; //@line 1160
 $3 = $0 + 4 | 0; //@line 1161
 HEAP32[$3 >> 2] = 0; //@line 1162
 HEAP32[$0 + 8 >> 2] = $1; //@line 1164
 HEAP32[$0 + 12 >> 2] = $2; //@line 1166
 $6 = HEAP32[2413] | 0; //@line 1167
 do {
  if (!$6) {
   HEAP32[2413] = 9656; //@line 1171
  } else {
   if (($6 | 0) != 9656) {
    $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1175
    _mbed_assert_internal(3120, 3140, 93); //@line 1176
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 56; //@line 1179
     HEAP32[$AsyncCtx3 + 4 >> 2] = $1; //@line 1181
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 1183
     HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 1185
     sp = STACKTOP; //@line 1186
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1189
     break;
    }
   }
  }
 } while (0);
 if (!$1) {
  HEAP32[$3 >> 2] = 0; //@line 1197
 } else {
  HEAP32[$3 >> 2] = HEAP32[2412]; //@line 1200
  HEAP32[2412] = $0; //@line 1201
 }
 $14 = HEAP32[2413] | 0; //@line 1203
 if (!$14) {
  HEAP32[2413] = 9656; //@line 1206
  return;
 }
 if (($14 | 0) == 9656) {
  return;
 }
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1213
 _mbed_assert_internal(3120, 3140, 93); //@line 1214
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 57; //@line 1217
  sp = STACKTOP; //@line 1218
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1221
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3005
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3009
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3011
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3013
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3015
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3017
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3019
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 3022
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 3023
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 3032
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 3033
    if (!___async) {
     ___async_unwind = 0; //@line 3036
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 225; //@line 3038
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 3040
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 3042
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 3044
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 3046
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 3048
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 3050
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 3052
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 3055
    sp = STACKTOP; //@line 3056
    return;
   }
  }
 }
 return;
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10995
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 11005
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 11005
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 11005
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 11009
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 11012
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 11015
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 11023
  } else {
   $20 = 0; //@line 11025
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 11035
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 11039
  HEAP32[___async_retval >> 2] = $$1; //@line 11041
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 11044
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 11045
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 11049
  ___async_unwind = 0; //@line 11050
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 188; //@line 11052
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 11054
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 11056
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 11058
 sp = STACKTOP; //@line 11059
 return;
}
function __ZN4mbed6StreamC2EPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $6 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 1691
 HEAP32[$0 >> 2] = 408; //@line 1692
 $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1694
 __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE($0 + 4 | 0, $1, 0); //@line 1695
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 73; //@line 1698
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1700
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 1702
  sp = STACKTOP; //@line 1703
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1706
 HEAP32[$0 >> 2] = 488; //@line 1707
 HEAP32[$0 + 4 >> 2] = 588; //@line 1709
 $6 = $0 + 20 | 0; //@line 1710
 HEAP32[$6 >> 2] = 0; //@line 1711
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1712
 $7 = __ZN4mbed6fdopenEPNS_10FileHandleEPKc($0, 2518) | 0; //@line 1713
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 74; //@line 1716
  HEAP32[$AsyncCtx + 4 >> 2] = $6; //@line 1718
  sp = STACKTOP; //@line 1719
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1722
 HEAP32[$6 >> 2] = $7; //@line 1723
 if ($7 | 0) {
  __ZN4mbed26mbed_set_unbuffered_streamEP8_IO_FILE($7); //@line 1726
  return;
 }
 $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1729
 _mbed_error(-2147417831, 2521, 0, 0, 0) | 0; //@line 1730
 if (___async) {
  HEAP32[$AsyncCtx7 >> 2] = 75; //@line 1733
  sp = STACKTOP; //@line 1734
  return;
 }
 _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1737
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9598
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9600
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9602
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9604
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 9609
  } else {
   $9 = $4 + 4 | 0; //@line 9611
   $10 = HEAP32[$9 >> 2] | 0; //@line 9612
   $11 = $4 + 8 | 0; //@line 9613
   $12 = HEAP32[$11 >> 2] | 0; //@line 9614
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 9618
    HEAP32[$6 >> 2] = 0; //@line 9619
    HEAP32[$2 >> 2] = 0; //@line 9620
    HEAP32[$11 >> 2] = 0; //@line 9621
    HEAP32[$9 >> 2] = 0; //@line 9622
    $$0 = 0; //@line 9623
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 9630
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 9631
   FUNCTION_TABLE_iiii[$18 & 15]($4, $10 - $12 | 0, 1) | 0; //@line 9632
   if (!___async) {
    ___async_unwind = 0; //@line 9635
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 190; //@line 9637
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 9639
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 9641
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 9643
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 9645
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 9647
   sp = STACKTOP; //@line 9648
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 9653
 return;
}
function __ZN4mbed10FileHandle4sizeEv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11164
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11166
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11168
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11170
 if (($AsyncRetVal | 0) < 0) {
  HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 11174
  return;
 }
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 16 >> 2] | 0; //@line 11179
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 11180
 $10 = FUNCTION_TABLE_iiii[$9 & 15]($4, 0, 2) | 0; //@line 11181
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 61; //@line 11184
  $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 11185
  HEAP32[$11 >> 2] = $2; //@line 11186
  $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 11187
  HEAP32[$12 >> 2] = $4; //@line 11188
  $13 = $ReallocAsyncCtx2 + 12 | 0; //@line 11189
  HEAP32[$13 >> 2] = $AsyncRetVal; //@line 11190
  sp = STACKTOP; //@line 11191
  return;
 }
 HEAP32[___async_retval >> 2] = $10; //@line 11195
 ___async_unwind = 0; //@line 11196
 HEAP32[$ReallocAsyncCtx2 >> 2] = 61; //@line 11197
 $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 11198
 HEAP32[$11 >> 2] = $2; //@line 11199
 $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 11200
 HEAP32[$12 >> 2] = $4; //@line 11201
 $13 = $ReallocAsyncCtx2 + 12 | 0; //@line 11202
 HEAP32[$13 >> 2] = $AsyncRetVal; //@line 11203
 sp = STACKTOP; //@line 11204
 return;
}
function _main__async_cb_73($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 8597
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8599
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8601
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8603
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8605
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8607
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8609
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8611
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8613
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 8615
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 8617
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(44) | 0; //@line 8618
 _wait(.20000000298023224); //@line 8619
 if (!___async) {
  ___async_unwind = 0; //@line 8622
 }
 HEAP32[$ReallocAsyncCtx14 >> 2] = 172; //@line 8624
 HEAP32[$ReallocAsyncCtx14 + 4 >> 2] = $14; //@line 8626
 HEAP32[$ReallocAsyncCtx14 + 8 >> 2] = $16; //@line 8628
 HEAP32[$ReallocAsyncCtx14 + 12 >> 2] = $18; //@line 8630
 HEAP32[$ReallocAsyncCtx14 + 16 >> 2] = $20; //@line 8632
 HEAP32[$ReallocAsyncCtx14 + 20 >> 2] = $6; //@line 8634
 HEAP32[$ReallocAsyncCtx14 + 24 >> 2] = $8; //@line 8636
 HEAP32[$ReallocAsyncCtx14 + 28 >> 2] = $10; //@line 8638
 HEAP32[$ReallocAsyncCtx14 + 32 >> 2] = $12; //@line 8640
 HEAP32[$ReallocAsyncCtx14 + 36 >> 2] = $2; //@line 8642
 HEAP32[$ReallocAsyncCtx14 + 40 >> 2] = $4; //@line 8644
 sp = STACKTOP; //@line 8645
 return;
}
function _main__async_cb_71($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 8485
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8487
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8489
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8491
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8493
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8495
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8497
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8499
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8501
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 8503
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 8505
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(44) | 0; //@line 8506
 _wait(.20000000298023224); //@line 8507
 if (!___async) {
  ___async_unwind = 0; //@line 8510
 }
 HEAP32[$ReallocAsyncCtx13 >> 2] = 175; //@line 8512
 HEAP32[$ReallocAsyncCtx13 + 4 >> 2] = $14; //@line 8514
 HEAP32[$ReallocAsyncCtx13 + 8 >> 2] = $16; //@line 8516
 HEAP32[$ReallocAsyncCtx13 + 12 >> 2] = $18; //@line 8518
 HEAP32[$ReallocAsyncCtx13 + 16 >> 2] = $20; //@line 8520
 HEAP32[$ReallocAsyncCtx13 + 20 >> 2] = $4; //@line 8522
 HEAP32[$ReallocAsyncCtx13 + 24 >> 2] = $6; //@line 8524
 HEAP32[$ReallocAsyncCtx13 + 28 >> 2] = $8; //@line 8526
 HEAP32[$ReallocAsyncCtx13 + 32 >> 2] = $10; //@line 8528
 HEAP32[$ReallocAsyncCtx13 + 36 >> 2] = $2; //@line 8530
 HEAP32[$ReallocAsyncCtx13 + 40 >> 2] = $12; //@line 8532
 sp = STACKTOP; //@line 8533
 return;
}
function _fopen($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $11 = 0, $15 = 0, $7 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_buffer8 = 0, sp = 0;
 sp = STACKTOP; //@line 9415
 STACKTOP = STACKTOP + 48 | 0; //@line 9416
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 9416
 $vararg_buffer8 = sp + 32 | 0; //@line 9417
 $vararg_buffer3 = sp + 16 | 0; //@line 9418
 $vararg_buffer = sp; //@line 9419
 if (!(_strchr(6643, HEAP8[$1 >> 0] | 0) | 0)) {
  HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 9426
  $$0 = 0; //@line 9427
 } else {
  $7 = ___fmodeflags($1) | 0; //@line 9429
  HEAP32[$vararg_buffer >> 2] = $0; //@line 9432
  HEAP32[$vararg_buffer + 4 >> 2] = $7 | 32768; //@line 9434
  HEAP32[$vararg_buffer + 8 >> 2] = 438; //@line 9436
  $11 = ___syscall_ret(___syscall5(5, $vararg_buffer | 0) | 0) | 0; //@line 9438
  if (($11 | 0) < 0) {
   $$0 = 0; //@line 9441
  } else {
   if ($7 & 524288 | 0) {
    HEAP32[$vararg_buffer3 >> 2] = $11; //@line 9446
    HEAP32[$vararg_buffer3 + 4 >> 2] = 2; //@line 9448
    HEAP32[$vararg_buffer3 + 8 >> 2] = 1; //@line 9450
    ___syscall221(221, $vararg_buffer3 | 0) | 0; //@line 9451
   }
   $15 = ___fdopen($11, $1) | 0; //@line 9453
   if (!$15) {
    HEAP32[$vararg_buffer8 >> 2] = $11; //@line 9456
    ___syscall6(6, $vararg_buffer8 | 0) | 0; //@line 9457
    $$0 = 0; //@line 9458
   } else {
    $$0 = $15; //@line 9460
   }
  }
 }
 STACKTOP = sp; //@line 9464
 return $$0 | 0; //@line 9464
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 12767
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 12772
    $$0 = 1; //@line 12773
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 12786
     $$0 = 1; //@line 12787
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 12791
     $$0 = -1; //@line 12792
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 12802
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 12806
    $$0 = 2; //@line 12807
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 12819
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 12825
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 12829
    $$0 = 3; //@line 12830
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 12840
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 12846
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 12852
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 12856
    $$0 = 4; //@line 12857
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 12861
    $$0 = -1; //@line 12862
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 12867
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_8($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 3795
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3797
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3799
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3801
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3803
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 3808
  return;
 }
 dest = $2 + 4 | 0; //@line 3812
 stop = dest + 52 | 0; //@line 3812
 do {
  HEAP32[dest >> 2] = 0; //@line 3812
  dest = dest + 4 | 0; //@line 3812
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 3813
 HEAP32[$2 + 8 >> 2] = $4; //@line 3815
 HEAP32[$2 + 12 >> 2] = -1; //@line 3817
 HEAP32[$2 + 48 >> 2] = 1; //@line 3819
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 3822
 $16 = HEAP32[$6 >> 2] | 0; //@line 3823
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 3824
 FUNCTION_TABLE_viiii[$15 & 7]($AsyncRetVal, $2, $16, 1); //@line 3825
 if (!___async) {
  ___async_unwind = 0; //@line 3828
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 210; //@line 3830
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 3832
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 3834
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 3836
 sp = STACKTOP; //@line 3837
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_4($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3141
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3145
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3147
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3149
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3151
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3153
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 3156
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 3157
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 3163
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 3164
   if (!___async) {
    ___async_unwind = 0; //@line 3167
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 223; //@line 3169
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 3171
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 3173
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 3175
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 3177
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 3179
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 3181
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 3184
   sp = STACKTOP; //@line 3185
   return;
  }
 }
 return;
}
function __ZN4mbed6fdopenEPNS_10FileHandleEPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0$$sroa_idx = 0, $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2854
 STACKTOP = STACKTOP + 16 | 0; //@line 2855
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2855
 $2 = sp; //@line 2856
 HEAP8[$2 >> 0] = 58; //@line 2857
 $$0$$sroa_idx = $2 + 1 | 0; //@line 2858
 HEAP8[$$0$$sroa_idx >> 0] = $0; //@line 2859
 HEAP8[$$0$$sroa_idx + 1 >> 0] = $0 >> 8; //@line 2859
 HEAP8[$$0$$sroa_idx + 2 >> 0] = $0 >> 16; //@line 2859
 HEAP8[$$0$$sroa_idx + 3 >> 0] = $0 >> 24; //@line 2859
 $3 = _fopen($2, $1) | 0; //@line 2860
 if (!$3) {
  STACKTOP = sp; //@line 2863
  return $3 | 0; //@line 2863
 }
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 28 >> 2] | 0; //@line 2867
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 2868
 $8 = FUNCTION_TABLE_ii[$7 & 31]($0) | 0; //@line 2869
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 115; //@line 2872
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 2874
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 2876
  sp = STACKTOP; //@line 2877
  STACKTOP = sp; //@line 2878
  return 0; //@line 2878
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2880
 if (!$8) {
  STACKTOP = sp; //@line 2883
  return $3 | 0; //@line 2883
 }
 _setbuf($3, 0); //@line 2885
 STACKTOP = sp; //@line 2886
 return $3 | 0; //@line 2886
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 11651
  $8 = $0; //@line 11651
  $9 = $1; //@line 11651
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 11653
   $$0914 = $$0914 + -1 | 0; //@line 11657
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 11658
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 11659
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 11667
   }
  }
  $$010$lcssa$off0 = $8; //@line 11672
  $$09$lcssa = $$0914; //@line 11672
 } else {
  $$010$lcssa$off0 = $0; //@line 11674
  $$09$lcssa = $2; //@line 11674
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 11678
 } else {
  $$012 = $$010$lcssa$off0; //@line 11680
  $$111 = $$09$lcssa; //@line 11680
  while (1) {
   $26 = $$111 + -1 | 0; //@line 11685
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 11686
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 11690
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 11693
    $$111 = $26; //@line 11693
   }
  }
 }
 return $$1$lcssa | 0; //@line 11697
}
function _main__async_cb_75($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 8709
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8711
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8713
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8715
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8717
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8719
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8721
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8723
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8725
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 8727
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(40) | 0; //@line 8728
 _wait(.20000000298023224); //@line 8729
 if (!___async) {
  ___async_unwind = 0; //@line 8732
 }
 HEAP32[$ReallocAsyncCtx15 >> 2] = 169; //@line 8734
 HEAP32[$ReallocAsyncCtx15 + 4 >> 2] = $12; //@line 8736
 HEAP32[$ReallocAsyncCtx15 + 8 >> 2] = $14; //@line 8738
 HEAP32[$ReallocAsyncCtx15 + 12 >> 2] = $16; //@line 8740
 HEAP32[$ReallocAsyncCtx15 + 16 >> 2] = $18; //@line 8742
 HEAP32[$ReallocAsyncCtx15 + 20 >> 2] = $4; //@line 8744
 HEAP32[$ReallocAsyncCtx15 + 24 >> 2] = $6; //@line 8746
 HEAP32[$ReallocAsyncCtx15 + 28 >> 2] = $8; //@line 8748
 HEAP32[$ReallocAsyncCtx15 + 32 >> 2] = $10; //@line 8750
 HEAP32[$ReallocAsyncCtx15 + 36 >> 2] = $2; //@line 8752
 sp = STACKTOP; //@line 8753
 return;
}
function __ZN4mbed17remove_filehandleEPNS_10FileHandleE($0) {
 $0 = $0 | 0;
 var $1 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2759
 $1 = HEAP32[2459] | 0; //@line 2760
 do {
  if (!$1) {
   HEAP32[2459] = 9840; //@line 2764
  } else {
   if (($1 | 0) != 9840) {
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2768
    _mbed_assert_internal(3120, 3140, 93); //@line 2769
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 112; //@line 2772
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2774
     sp = STACKTOP; //@line 2775
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2778
     break;
    }
   }
  }
 } while (0);
 if ((HEAP32[481] | 0) == ($0 | 0)) {
  HEAP32[481] = 0; //@line 2787
 }
 if ((HEAP32[482] | 0) == ($0 | 0)) {
  HEAP32[482] = 0; //@line 2792
 }
 if ((HEAP32[483] | 0) == ($0 | 0)) {
  HEAP32[483] = 0; //@line 2797
 }
 $8 = HEAP32[2459] | 0; //@line 2799
 if (!$8) {
  HEAP32[2459] = 9840; //@line 2802
  return;
 }
 if (($8 | 0) == 9840) {
  return;
 }
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2809
 _mbed_assert_internal(3120, 3140, 93); //@line 2810
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 113; //@line 2813
  sp = STACKTOP; //@line 2814
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2817
 return;
}
function __ZN11TextDisplay5claimEP8_IO_FILE($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $12 = 0, $13 = 0, $3 = 0, $6 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4465
 $3 = HEAP32[$0 + 32 >> 2] | 0; //@line 4467
 if (!$3) {
  _fwrite(6008, 85, 1, HEAP32[293] | 0) | 0; //@line 4471
  $$0 = 0; //@line 4472
  return $$0 | 0; //@line 4473
 }
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 4475
 $6 = _freopen($3, 6094, $1) | 0; //@line 4476
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 153; //@line 4479
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 4481
  sp = STACKTOP; //@line 4482
  return 0; //@line 4483
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4485
 if (!$6) {
  $$0 = 0; //@line 4488
  return $$0 | 0; //@line 4489
 }
 $9 = HEAP32[325] | 0; //@line 4491
 $12 = HEAP32[(HEAP32[$0 >> 2] | 0) + 100 >> 2] | 0; //@line 4494
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 4495
 $13 = FUNCTION_TABLE_ii[$12 & 31]($0) | 0; //@line 4496
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 154; //@line 4499
  HEAP32[$AsyncCtx + 4 >> 2] = $9; //@line 4501
  sp = STACKTOP; //@line 4502
  return 0; //@line 4503
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 4505
 _setvbuf($9, 0, 1, $13) | 0; //@line 4506
 $$0 = 1; //@line 4507
 return $$0 | 0; //@line 4508
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10894
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10896
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10900
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10902
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10904
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10906
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 10910
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 10913
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 10914
   if (!___async) {
    ___async_unwind = 0; //@line 10917
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 227; //@line 10919
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 10921
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 10923
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 10925
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 10927
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 10929
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 10931
   sp = STACKTOP; //@line 10932
   return;
  }
 }
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 8797
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 8802
   label = 4; //@line 8803
  } else {
   $$01519 = $0; //@line 8805
   $23 = $1; //@line 8805
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 8810
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 8813
    $23 = $6; //@line 8814
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 8818
     label = 4; //@line 8819
     break;
    } else {
     $$01519 = $6; //@line 8822
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 8828
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 8830
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 8838
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 8846
  } else {
   $$pn = $$0; //@line 8848
   while (1) {
    $19 = $$pn + 1 | 0; //@line 8850
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 8854
     break;
    } else {
     $$pn = $19; //@line 8857
    }
   }
  }
  $$sink = $$1$lcssa; //@line 8862
 }
 return $$sink - $1 | 0; //@line 8865
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 1508
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 1515
   $10 = $1 + 16 | 0; //@line 1516
   $11 = HEAP32[$10 >> 2] | 0; //@line 1517
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 1520
    HEAP32[$1 + 24 >> 2] = $4; //@line 1522
    HEAP32[$1 + 36 >> 2] = 1; //@line 1524
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 1534
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 1539
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 1542
    HEAP8[$1 + 54 >> 0] = 1; //@line 1544
    break;
   }
   $21 = $1 + 24 | 0; //@line 1547
   $22 = HEAP32[$21 >> 2] | 0; //@line 1548
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 1551
    $28 = $4; //@line 1552
   } else {
    $28 = $22; //@line 1554
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 1563
   }
  }
 } while (0);
 return;
}
function __ZN15GraphicsDisplay4putpEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $10 = 0, $15 = 0, $22 = 0, $4 = 0, $5 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3957
 $4 = HEAP32[(HEAP32[$0 >> 2] | 0) + 124 >> 2] | 0; //@line 3960
 $5 = $0 + 36 | 0; //@line 3961
 $7 = HEAP16[$5 >> 1] | 0; //@line 3963
 $8 = $0 + 38 | 0; //@line 3964
 $10 = HEAP16[$8 >> 1] | 0; //@line 3966
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 3967
 FUNCTION_TABLE_viiii[$4 & 7]($0, $7, $10, $1); //@line 3968
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 139; //@line 3971
  HEAP32[$AsyncCtx + 4 >> 2] = $5; //@line 3973
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 3975
  HEAP32[$AsyncCtx + 12 >> 2] = $8; //@line 3977
  sp = STACKTOP; //@line 3978
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3981
 $15 = (HEAP16[$5 >> 1] | 0) + 1 << 16 >> 16; //@line 3983
 HEAP16[$5 >> 1] = $15; //@line 3984
 if ($15 << 16 >> 16 <= (HEAP16[$0 + 42 >> 1] | 0)) {
  return;
 }
 HEAP16[$5 >> 1] = HEAP16[$0 + 40 >> 1] | 0; //@line 3993
 $22 = (HEAP16[$8 >> 1] | 0) + 1 << 16 >> 16; //@line 3995
 HEAP16[$8 >> 1] = $22; //@line 3996
 if ($22 << 16 >> 16 <= (HEAP16[$0 + 46 >> 1] | 0)) {
  return;
 }
 HEAP16[$8 >> 1] = HEAP16[$0 + 44 >> 1] | 0; //@line 4005
 return;
}
function _mbed_vtracef__async_cb_47($0) {
 $0 = $0 | 0;
 var $$18 = 0, $10 = 0, $12 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 6967
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6969
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6971
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6973
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 6978
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6980
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 6985
 $16 = _snprintf($4, $6, 2221, $2) | 0; //@line 6986
 $$18 = ($16 | 0) >= ($6 | 0) ? 0 : $16; //@line 6988
 $19 = $4 + $$18 | 0; //@line 6990
 $20 = $6 - $$18 | 0; //@line 6991
 if (($$18 | 0) > 0) {
  if (!(($$18 | 0) < 1 | ($20 | 0) < 1 | $10 ^ 1)) {
   _snprintf($19, $20, 2299, $12) | 0; //@line 6999
  }
 }
 $23 = HEAP32[91] | 0; //@line 7002
 $24 = HEAP32[84] | 0; //@line 7003
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 7004
 FUNCTION_TABLE_vi[$23 & 255]($24); //@line 7005
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 7008
  sp = STACKTOP; //@line 7009
  return;
 }
 ___async_unwind = 0; //@line 7012
 HEAP32[$ReallocAsyncCtx7 >> 2] = 47; //@line 7013
 sp = STACKTOP; //@line 7014
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_101($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10942
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 10948
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 10950
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10952
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10954
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 10959
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 10961
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 10962
 if (!___async) {
  ___async_unwind = 0; //@line 10965
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 227; //@line 10967
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 10969
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 10971
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 10973
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 10975
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 10977
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 10979
 sp = STACKTOP; //@line 10980
 return;
}
function _main__async_cb_68($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 8260
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8262
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8264
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8266
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8268
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8270
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 8272
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 8274
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 8276
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(36) | 0; //@line 8277
 _puts(6567) | 0; //@line 8278
 if (!___async) {
  ___async_unwind = 0; //@line 8281
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 166; //@line 8283
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 8285
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 8287
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 8289
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 8291
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 8293
 HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 8295
 HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 8297
 HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 8299
 sp = STACKTOP; //@line 8300
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 943
 $1 = HEAP32[325] | 0; //@line 944
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 950
 } else {
  $19 = 0; //@line 952
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 958
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 964
    $12 = HEAP32[$11 >> 2] | 0; //@line 965
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 971
     HEAP8[$12 >> 0] = 10; //@line 972
     $22 = 0; //@line 973
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 977
   $17 = ___overflow($1, 10) | 0; //@line 978
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 202; //@line 981
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 983
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 985
    sp = STACKTOP; //@line 986
    return 0; //@line 987
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 989
    $22 = $17 >> 31; //@line 991
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 998
 }
 return $22 | 0; //@line 1000
}
function __ZN11TextDisplay5_putcEi__async_cb_56($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $15 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 7645
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7647
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7649
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7651
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 7653
 $10 = (HEAP16[$2 >> 1] | 0) + 1 << 16 >> 16; //@line 7655
 HEAP16[$2 >> 1] = $10; //@line 7656
 $14 = HEAP32[(HEAP32[$4 >> 2] | 0) + 100 >> 2] | 0; //@line 7660
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(28) | 0; //@line 7661
 $15 = FUNCTION_TABLE_ii[$14 & 31]($4) | 0; //@line 7662
 if (!___async) {
  HEAP32[___async_retval >> 2] = $15; //@line 7666
  ___async_unwind = 0; //@line 7667
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 151; //@line 7669
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $10 & 65535; //@line 7671
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $6; //@line 7673
 HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $2; //@line 7675
 HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 7677
 HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $4; //@line 7679
 HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $4; //@line 7681
 sp = STACKTOP; //@line 7682
 return;
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4397
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4399
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4401
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4403
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 4405
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 4407
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 9209; //@line 4412
  HEAP32[$4 + 4 >> 2] = $6; //@line 4414
  _abort_message(9118, $4); //@line 4415
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 4418
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 4421
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 4422
 $16 = FUNCTION_TABLE_ii[$15 & 31]($12) | 0; //@line 4423
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 4427
  ___async_unwind = 0; //@line 4428
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 206; //@line 4430
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 4432
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 4434
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 4436
 sp = STACKTOP; //@line 4437
 return;
}
function ___strerror_l($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $7 = 0, label = 0, $$113$looptemp = 0;
 $$016 = 0; //@line 12887
 while (1) {
  if ((HEAPU8[7181 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 12894
   break;
  }
  $7 = $$016 + 1 | 0; //@line 12897
  if (($7 | 0) == 87) {
   $$01214 = 7269; //@line 12900
   $$115 = 87; //@line 12900
   label = 5; //@line 12901
   break;
  } else {
   $$016 = $7; //@line 12904
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 7269; //@line 12910
  } else {
   $$01214 = 7269; //@line 12912
   $$115 = $$016; //@line 12912
   label = 5; //@line 12913
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 12918
   $$113 = $$01214; //@line 12919
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 12923
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 12930
   if (!$$115) {
    $$012$lcssa = $$113; //@line 12933
    break;
   } else {
    $$01214 = $$113; //@line 12936
    label = 5; //@line 12937
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 12944
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 1367
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 1376
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 1381
      HEAP32[$13 >> 2] = $2; //@line 1382
      $19 = $1 + 40 | 0; //@line 1383
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 1386
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 1396
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 1400
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 1407
    }
   }
  }
 } while (0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9696
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9698
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9700
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 9704
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 9708
  label = 4; //@line 9709
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 9714
   label = 4; //@line 9715
  } else {
   $$037$off039 = 3; //@line 9717
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 9721
  $17 = $8 + 40 | 0; //@line 9722
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 9725
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 9735
    $$037$off039 = $$037$off038; //@line 9736
   } else {
    $$037$off039 = $$037$off038; //@line 9738
   }
  } else {
   $$037$off039 = $$037$off038; //@line 9741
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 9744
 return;
}
function _strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $2 = 0, $5 = 0;
 $2 = HEAP8[$1 >> 0] | 0; //@line 12960
 do {
  if (!($2 << 24 >> 24)) {
   $$0 = $0; //@line 12964
  } else {
   $5 = _strchr($0, $2 << 24 >> 24) | 0; //@line 12967
   if (!$5) {
    $$0 = 0; //@line 12970
   } else {
    if (!(HEAP8[$1 + 1 >> 0] | 0)) {
     $$0 = $5; //@line 12976
    } else {
     if (!(HEAP8[$5 + 1 >> 0] | 0)) {
      $$0 = 0; //@line 12982
     } else {
      if (!(HEAP8[$1 + 2 >> 0] | 0)) {
       $$0 = _twobyte_strstr($5, $1) | 0; //@line 12989
       break;
      }
      if (!(HEAP8[$5 + 2 >> 0] | 0)) {
       $$0 = 0; //@line 12996
      } else {
       if (!(HEAP8[$1 + 3 >> 0] | 0)) {
        $$0 = _threebyte_strstr($5, $1) | 0; //@line 13003
        break;
       }
       if (!(HEAP8[$5 + 3 >> 0] | 0)) {
        $$0 = 0; //@line 13010
       } else {
        if (!(HEAP8[$1 + 4 >> 0] | 0)) {
         $$0 = _fourbyte_strstr($5, $1) | 0; //@line 13017
         break;
        } else {
         $$0 = _twoway_strstr($5, $1) | 0; //@line 13021
         break;
        }
       }
      }
     }
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 13031
}
function __ZN4mbed6Stream4putcEi__async_cb_62($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 7916
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7918
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7920
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7922
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 72 >> 2] | 0; //@line 7925
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 7926
 $10 = FUNCTION_TABLE_iii[$9 & 7]($2, $4) | 0; //@line 7927
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 78; //@line 7930
  $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 7931
  HEAP32[$11 >> 2] = $6; //@line 7932
  $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 7933
  HEAP32[$12 >> 2] = $2; //@line 7934
  sp = STACKTOP; //@line 7935
  return;
 }
 HEAP32[___async_retval >> 2] = $10; //@line 7939
 ___async_unwind = 0; //@line 7940
 HEAP32[$ReallocAsyncCtx2 >> 2] = 78; //@line 7941
 $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 7942
 HEAP32[$11 >> 2] = $6; //@line 7943
 $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 7944
 HEAP32[$12 >> 2] = $2; //@line 7945
 sp = STACKTOP; //@line 7946
 return;
}
function _fourbyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$lcssa = 0, $$sink21$lcssa = 0, $$sink2123 = 0, $18 = 0, $32 = 0, $33 = 0, $35 = 0, $39 = 0, $40 = 0, $41 = 0;
 $18 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8 | (HEAPU8[$1 + 3 >> 0] | 0); //@line 13156
 $32 = $0 + 3 | 0; //@line 13170
 $33 = HEAP8[$32 >> 0] | 0; //@line 13171
 $35 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | (HEAPU8[$0 + 2 >> 0] | 0) << 8 | $33 & 255; //@line 13173
 if ($33 << 24 >> 24 == 0 | ($35 | 0) == ($18 | 0)) {
  $$lcssa = $33; //@line 13178
  $$sink21$lcssa = $32; //@line 13178
 } else {
  $$sink2123 = $32; //@line 13180
  $39 = $35; //@line 13180
  while (1) {
   $40 = $$sink2123 + 1 | 0; //@line 13183
   $41 = HEAP8[$40 >> 0] | 0; //@line 13184
   $39 = $39 << 8 | $41 & 255; //@line 13186
   if ($41 << 24 >> 24 == 0 | ($39 | 0) == ($18 | 0)) {
    $$lcssa = $41; //@line 13191
    $$sink21$lcssa = $40; //@line 13191
    break;
   } else {
    $$sink2123 = $40; //@line 13194
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$sink21$lcssa + -3 | 0 : 0) | 0; //@line 13201
}
function __ZN11TextDisplay3clsEv__async_cb_90($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 9471
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9473
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9475
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9477
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9479
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9481
 $12 = HEAP32[(HEAP32[$2 >> 2] | 0) + 96 >> 2] | 0; //@line 9484
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(24) | 0; //@line 9485
 $13 = FUNCTION_TABLE_ii[$12 & 31]($4) | 0; //@line 9486
 if (!___async) {
  HEAP32[___async_retval >> 2] = $13; //@line 9490
  ___async_unwind = 0; //@line 9491
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 160; //@line 9493
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $AsyncRetVal; //@line 9495
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $6; //@line 9497
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $8; //@line 9499
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $2; //@line 9501
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $4; //@line 9503
 sp = STACKTOP; //@line 9504
 return;
}
function _mbed_vtracef__async_cb_53($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 7352
 $3 = HEAP32[92] | 0; //@line 7356
 if (HEAP8[$0 + 4 >> 0] & 1 & ($3 | 0) != 0) {
  $5 = HEAP32[84] | 0; //@line 7360
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 7361
  FUNCTION_TABLE_vi[$3 & 255]($5); //@line 7362
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 40; //@line 7365
   sp = STACKTOP; //@line 7366
   return;
  }
  ___async_unwind = 0; //@line 7369
  HEAP32[$ReallocAsyncCtx2 >> 2] = 40; //@line 7370
  sp = STACKTOP; //@line 7371
  return;
 } else {
  $6 = HEAP32[91] | 0; //@line 7374
  $7 = HEAP32[84] | 0; //@line 7375
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 7376
  FUNCTION_TABLE_vi[$6 & 255]($7); //@line 7377
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 42; //@line 7380
   sp = STACKTOP; //@line 7381
   return;
  }
  ___async_unwind = 0; //@line 7384
  HEAP32[$ReallocAsyncCtx4 >> 2] = 42; //@line 7385
  sp = STACKTOP; //@line 7386
  return;
 }
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2694
 $2 = $0 + 12 | 0; //@line 2696
 $3 = HEAP32[$2 >> 2] | 0; //@line 2697
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2701
   _mbed_assert_internal(3031, 3036, 528); //@line 2702
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 110; //@line 2705
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 2707
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 2709
    sp = STACKTOP; //@line 2710
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2713
    $8 = HEAP32[$2 >> 2] | 0; //@line 2715
    break;
   }
  } else {
   $8 = $3; //@line 2719
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 2722
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2724
 FUNCTION_TABLE_vi[$7 & 255]($0); //@line 2725
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 111; //@line 2728
  sp = STACKTOP; //@line 2729
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2732
  return;
 }
}
function __ZN4mbed6Stream6printfEPKcz__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 3844
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3846
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3850
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3852
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3854
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3856
 HEAP32[$2 >> 2] = HEAP32[$0 + 8 >> 2]; //@line 3857
 _memset($6 | 0, 0, 4096) | 0; //@line 3858
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(24) | 0; //@line 3859
 $13 = _vsprintf($6, $8, $2) | 0; //@line 3860
 if (!___async) {
  HEAP32[___async_retval >> 2] = $13; //@line 3864
  ___async_unwind = 0; //@line 3865
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 81; //@line 3867
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $10; //@line 3869
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $12; //@line 3871
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 3873
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $2; //@line 3875
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $6; //@line 3877
 sp = STACKTOP; //@line 3878
 return;
}
function __ZN15GraphicsDisplay4fillEiiiii__async_cb_21($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $15 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5358
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5362
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5364
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5366
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5368
 $15 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 5369
 if (($15 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 140 >> 2] | 0; //@line 5376
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 5377
 FUNCTION_TABLE_vii[$13 & 7]($8, $10); //@line 5378
 if (!___async) {
  ___async_unwind = 0; //@line 5381
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 141; //@line 5383
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 5385
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 5387
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 5389
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 5391
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 5393
 sp = STACKTOP; //@line 5394
 return;
}
function _abort_message($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1200
 STACKTOP = STACKTOP + 16 | 0; //@line 1201
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1201
 $1 = sp; //@line 1202
 HEAP32[$1 >> 2] = $varargs; //@line 1203
 $2 = HEAP32[293] | 0; //@line 1204
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1205
 _vfprintf($2, $0, $1) | 0; //@line 1206
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 207; //@line 1209
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 1211
  sp = STACKTOP; //@line 1212
  STACKTOP = sp; //@line 1213
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1215
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1216
 _fputc(10, $2) | 0; //@line 1217
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 208; //@line 1220
  sp = STACKTOP; //@line 1221
  STACKTOP = sp; //@line 1222
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1224
  _abort(); //@line 1225
 }
}
function _threebyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$016$lcssa = 0, $$01618 = 0, $$019 = 0, $$lcssa = 0, $14 = 0, $23 = 0, $24 = 0, $27 = 0, $30 = 0, $31 = 0;
 $14 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8; //@line 13090
 $23 = $0 + 2 | 0; //@line 13099
 $24 = HEAP8[$23 >> 0] | 0; //@line 13100
 $27 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | ($24 & 255) << 8; //@line 13103
 if (($27 | 0) == ($14 | 0) | $24 << 24 >> 24 == 0) {
  $$016$lcssa = $23; //@line 13108
  $$lcssa = $24; //@line 13108
 } else {
  $$01618 = $23; //@line 13110
  $$019 = $27; //@line 13110
  while (1) {
   $30 = $$01618 + 1 | 0; //@line 13112
   $31 = HEAP8[$30 >> 0] | 0; //@line 13113
   $$019 = ($$019 | $31 & 255) << 8; //@line 13116
   if (($$019 | 0) == ($14 | 0) | $31 << 24 >> 24 == 0) {
    $$016$lcssa = $30; //@line 13121
    $$lcssa = $31; //@line 13121
    break;
   } else {
    $$01618 = $30; //@line 13124
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$016$lcssa + -2 | 0 : 0) | 0; //@line 13131
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 12718
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 12718
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 12719
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 12720
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 12729
    $$016 = $9; //@line 12732
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 12732
   } else {
    $$016 = $0; //@line 12734
    $storemerge = 0; //@line 12734
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 12736
   $$0 = $$016; //@line 12737
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 12741
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 12747
   HEAP32[tempDoublePtr >> 2] = $2; //@line 12750
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 12750
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 12751
  }
 }
 return +$$0;
}
function __ZN15GraphicsDisplay4blitEiiiiPKi__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $14 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4532
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4538
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4540
 $9 = Math_imul(HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 4541
 if (($9 | 0) <= 0) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 140 >> 2] | 0; //@line 4548
 $14 = HEAP32[$8 >> 2] | 0; //@line 4549
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 4550
 FUNCTION_TABLE_vii[$13 & 7]($6, $14); //@line 4551
 if (!___async) {
  ___async_unwind = 0; //@line 4554
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 143; //@line 4556
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = 0; //@line 4558
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $9; //@line 4560
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 4562
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 4564
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $6; //@line 4566
 sp = STACKTOP; //@line 4567
 return;
}
function __ZN15GraphicsDisplayC2EPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4284
 $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 4285
 __ZN11TextDisplayC2EPKc($0, $1); //@line 4286
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 147; //@line 4289
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 4291
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 4293
  sp = STACKTOP; //@line 4294
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 4297
 HEAP32[$0 >> 2] = 788; //@line 4298
 HEAP32[$0 + 4 >> 2] = 952; //@line 4300
 __ZN11TextDisplay10foregroundEt($0, -1); //@line 4301
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 120 >> 2] | 0; //@line 4304
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4305
 FUNCTION_TABLE_vii[$7 & 7]($0, 0); //@line 4306
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 148; //@line 4309
  sp = STACKTOP; //@line 4310
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4313
  return;
 }
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2812
 STACKTOP = STACKTOP + 16 | 0; //@line 2813
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2813
 $3 = sp; //@line 2814
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 2816
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 2819
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 2820
 $8 = FUNCTION_TABLE_iiii[$7 & 15]($0, $1, $3) | 0; //@line 2821
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 231; //@line 2824
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 2826
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 2828
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 2830
  sp = STACKTOP; //@line 2831
  STACKTOP = sp; //@line 2832
  return 0; //@line 2832
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2834
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 2838
 }
 STACKTOP = sp; //@line 2840
 return $8 & 1 | 0; //@line 2840
}
function __ZN11TextDisplay3clsEv__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9372
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9374
 $5 = HEAP32[(HEAP32[$2 >> 2] | 0) + 100 >> 2] | 0; //@line 9377
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 9378
 $6 = FUNCTION_TABLE_ii[$5 & 31]($2) | 0; //@line 9379
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 156; //@line 9382
  $7 = $ReallocAsyncCtx2 + 4 | 0; //@line 9383
  HEAP32[$7 >> 2] = $2; //@line 9384
  $8 = $ReallocAsyncCtx2 + 8 | 0; //@line 9385
  HEAP32[$8 >> 2] = $2; //@line 9386
  sp = STACKTOP; //@line 9387
  return;
 }
 HEAP32[___async_retval >> 2] = $6; //@line 9391
 ___async_unwind = 0; //@line 9392
 HEAP32[$ReallocAsyncCtx2 >> 2] = 156; //@line 9393
 $7 = $ReallocAsyncCtx2 + 4 | 0; //@line 9394
 HEAP32[$7 >> 2] = $2; //@line 9395
 $8 = $ReallocAsyncCtx2 + 8 | 0; //@line 9396
 HEAP32[$8 >> 2] = $2; //@line 9397
 sp = STACKTOP; //@line 9398
 return;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3714
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3722
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3724
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3726
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3728
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3730
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 3732
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 3734
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 3745
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 3746
 HEAP32[$10 >> 2] = 0; //@line 3747
 HEAP32[$12 >> 2] = 0; //@line 3748
 HEAP32[$14 >> 2] = 0; //@line 3749
 HEAP32[$2 >> 2] = 0; //@line 3750
 $33 = HEAP32[$16 >> 2] | 0; //@line 3751
 HEAP32[$16 >> 2] = $33 | $18; //@line 3756
 if ($20 | 0) {
  ___unlockfile($22); //@line 3759
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 3762
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
 sp = STACKTOP; //@line 1723
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 1729
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 1732
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 1735
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1736
   FUNCTION_TABLE_viiiiii[$13 & 7]($10, $1, $2, $3, $4, $5); //@line 1737
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 213; //@line 1740
    sp = STACKTOP; //@line 1741
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 1744
    break;
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_50($0) {
 $0 = $0 | 0;
 var $$pre = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 7083
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7087
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 2) {
  return;
 }
 $5 = $4 + -1 | 0; //@line 7092
 $$pre = HEAP32[94] | 0; //@line 7093
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 7094
 FUNCTION_TABLE_v[$$pre & 3](); //@line 7095
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 49; //@line 7098
  $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 7099
  HEAP32[$6 >> 2] = $4; //@line 7100
  $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 7101
  HEAP32[$7 >> 2] = $5; //@line 7102
  sp = STACKTOP; //@line 7103
  return;
 }
 ___async_unwind = 0; //@line 7106
 HEAP32[$ReallocAsyncCtx9 >> 2] = 49; //@line 7107
 $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 7108
 HEAP32[$6 >> 2] = $4; //@line 7109
 $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 7110
 HEAP32[$7 >> 2] = $5; //@line 7111
 sp = STACKTOP; //@line 7112
 return;
}
function __ZN11TextDisplay5claimEP8_IO_FILE__async_cb_83($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $5 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9180
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9182
 if (!(HEAP32[___async_retval >> 2] | 0)) {
  HEAP8[___async_retval >> 0] = 0; //@line 9189
  return;
 }
 $5 = HEAP32[325] | 0; //@line 9192
 $8 = HEAP32[(HEAP32[$2 >> 2] | 0) + 100 >> 2] | 0; //@line 9195
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 9196
 $9 = FUNCTION_TABLE_ii[$8 & 31]($2) | 0; //@line 9197
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 154; //@line 9200
  $10 = $ReallocAsyncCtx + 4 | 0; //@line 9201
  HEAP32[$10 >> 2] = $5; //@line 9202
  sp = STACKTOP; //@line 9203
  return;
 }
 HEAP32[___async_retval >> 2] = $9; //@line 9207
 ___async_unwind = 0; //@line 9208
 HEAP32[$ReallocAsyncCtx >> 2] = 154; //@line 9209
 $10 = $ReallocAsyncCtx + 4 | 0; //@line 9210
 HEAP32[$10 >> 2] = $5; //@line 9211
 sp = STACKTOP; //@line 9212
 return;
}
function _mbed_vtracef__async_cb_49($0) {
 $0 = $0 | 0;
 var $$pre = 0, $2 = 0, $4 = 0, $5 = 0, $6 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 7050
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7052
 if (($2 | 0) <= 1) {
  return;
 }
 $4 = $2 + -1 | 0; //@line 7057
 $$pre = HEAP32[94] | 0; //@line 7058
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 7059
 FUNCTION_TABLE_v[$$pre & 3](); //@line 7060
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 49; //@line 7063
  $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 7064
  HEAP32[$5 >> 2] = $2; //@line 7065
  $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 7066
  HEAP32[$6 >> 2] = $4; //@line 7067
  sp = STACKTOP; //@line 7068
  return;
 }
 ___async_unwind = 0; //@line 7071
 HEAP32[$ReallocAsyncCtx9 >> 2] = 49; //@line 7072
 $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 7073
 HEAP32[$5 >> 2] = $2; //@line 7074
 $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 7075
 HEAP32[$6 >> 2] = $4; //@line 7076
 sp = STACKTOP; //@line 7077
 return;
}
function __ZN4mbed10FileHandle4sizeEv__async_cb_105($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11210
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11214
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11216
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11218
 $10 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 16 >> 2] | 0; //@line 11221
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 11222
 FUNCTION_TABLE_iiii[$10 & 15]($4, $6, 0) | 0; //@line 11223
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 62; //@line 11226
  $11 = $ReallocAsyncCtx3 + 4 | 0; //@line 11227
  HEAP32[$11 >> 2] = $AsyncRetVal; //@line 11228
  sp = STACKTOP; //@line 11229
  return;
 }
 ___async_unwind = 0; //@line 11232
 HEAP32[$ReallocAsyncCtx3 >> 2] = 62; //@line 11233
 $11 = $ReallocAsyncCtx3 + 4 | 0; //@line 11234
 HEAP32[$11 >> 2] = $AsyncRetVal; //@line 11235
 sp = STACKTOP; //@line 11236
 return;
}
function __ZN15GraphicsDisplay4fillEiiiii__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5317
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5323
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5325
 $9 = Math_imul(HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 5326
 if (($9 | 0) <= 0) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 140 >> 2] | 0; //@line 5333
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 5334
 FUNCTION_TABLE_vii[$13 & 7]($6, $8); //@line 5335
 if (!___async) {
  ___async_unwind = 0; //@line 5338
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 141; //@line 5340
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = 0; //@line 5342
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $9; //@line 5344
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 5346
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $6; //@line 5348
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $8; //@line 5350
 sp = STACKTOP; //@line 5351
 return;
}
function _fclose__async_cb_107($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11313
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11315
 $4 = HEAP8[$0 + 8 >> 0] & 1; //@line 11318
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11320
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11322
 $9 = HEAP32[$2 + 12 >> 2] | 0; //@line 11324
 $ReallocAsyncCtx = _emscripten_realloc_async_context(20) | 0; //@line 11325
 $10 = FUNCTION_TABLE_ii[$9 & 31]($2) | 0; //@line 11326
 if (!___async) {
  HEAP32[___async_retval >> 2] = $10; //@line 11330
  ___async_unwind = 0; //@line 11331
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 184; //@line 11333
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $AsyncRetVal; //@line 11335
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $2; //@line 11337
 HEAP8[$ReallocAsyncCtx + 12 >> 0] = $4 & 1; //@line 11340
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 11342
 sp = STACKTOP; //@line 11343
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_92($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $4 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 9551
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9555
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9557
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9559
 $9 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 9560
 $12 = HEAP32[(HEAP32[$4 >> 2] | 0) + 100 >> 2] | 0; //@line 9563
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 9564
 $13 = FUNCTION_TABLE_ii[$12 & 31]($6) | 0; //@line 9565
 if (!___async) {
  HEAP32[___async_retval >> 2] = $13; //@line 9569
  ___async_unwind = 0; //@line 9570
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 159; //@line 9572
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $4; //@line 9574
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $6; //@line 9576
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $9; //@line 9578
 HEAP32[$ReallocAsyncCtx4 + 16 >> 2] = $8; //@line 9580
 sp = STACKTOP; //@line 9581
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
 sp = STACKTOP; //@line 2722
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 2724
 $8 = $7 >> 8; //@line 2725
 if (!($7 & 1)) {
  $$0 = $8; //@line 2729
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 2734
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 2736
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 2739
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2744
 FUNCTION_TABLE_viiiiii[$17 & 7]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 2745
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 229; //@line 2748
  sp = STACKTOP; //@line 2749
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2752
  return;
 }
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1892
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 1898
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 1901
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 1904
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1905
   FUNCTION_TABLE_viiii[$11 & 7]($8, $1, $2, $3); //@line 1906
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 216; //@line 1909
    sp = STACKTOP; //@line 1910
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 1913
    break;
   }
  }
 } while (0);
 return;
}
function __ZN4mbed6StreamC2EPKc__async_cb_63($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $7 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 8015
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8019
 HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = 488; //@line 8020
 HEAP32[$4 + 4 >> 2] = 588; //@line 8022
 $6 = $4 + 20 | 0; //@line 8023
 HEAP32[$6 >> 2] = 0; //@line 8024
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 8025
 $7 = __ZN4mbed6fdopenEPNS_10FileHandleEPKc($4, 2518) | 0; //@line 8026
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 74; //@line 8029
  $8 = $ReallocAsyncCtx + 4 | 0; //@line 8030
  HEAP32[$8 >> 2] = $6; //@line 8031
  sp = STACKTOP; //@line 8032
  return;
 }
 HEAP32[___async_retval >> 2] = $7; //@line 8036
 ___async_unwind = 0; //@line 8037
 HEAP32[$ReallocAsyncCtx >> 2] = 74; //@line 8038
 $8 = $ReallocAsyncCtx + 4 | 0; //@line 8039
 HEAP32[$8 >> 2] = $6; //@line 8040
 sp = STACKTOP; //@line 8041
 return;
}
function __Znwj($0) {
 $0 = $0 | 0;
 var $$ = 0, $$lcssa = 0, $2 = 0, $4 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1005
 $$ = ($0 | 0) == 0 ? 1 : $0; //@line 1007
 while (1) {
  $2 = _malloc($$) | 0; //@line 1009
  if ($2 | 0) {
   $$lcssa = $2; //@line 1012
   label = 7; //@line 1013
   break;
  }
  $4 = __ZSt15get_new_handlerv() | 0; //@line 1016
  if (!$4) {
   $$lcssa = 0; //@line 1019
   label = 7; //@line 1020
   break;
  }
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1023
  FUNCTION_TABLE_v[$4 & 3](); //@line 1024
  if (___async) {
   label = 5; //@line 1027
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1030
 }
 if ((label | 0) == 5) {
  HEAP32[$AsyncCtx >> 2] = 203; //@line 1033
  HEAP32[$AsyncCtx + 4 >> 2] = $$; //@line 1035
  sp = STACKTOP; //@line 1036
  return 0; //@line 1037
 } else if ((label | 0) == 7) {
  return $$lcssa | 0; //@line 1040
 }
 return 0; //@line 1042
}
function __ZN11TextDisplay3clsEv__async_cb_91($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 9511
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9515
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9517
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9519
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9521
 if (($4 | 0) >= (Math_imul(HEAP32[___async_retval >> 2] | 0, HEAP32[$0 + 4 >> 2] | 0) | 0)) {
  return;
 }
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 9529
 __ZN4mbed6Stream4putcEi($6, 32) | 0; //@line 9530
 if (!___async) {
  ___async_unwind = 0; //@line 9533
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 158; //@line 9535
 HEAP32[$ReallocAsyncCtx6 + 4 >> 2] = $4; //@line 9537
 HEAP32[$ReallocAsyncCtx6 + 8 >> 2] = $8; //@line 9539
 HEAP32[$ReallocAsyncCtx6 + 12 >> 2] = $10; //@line 9541
 HEAP32[$ReallocAsyncCtx6 + 16 >> 2] = $6; //@line 9543
 sp = STACKTOP; //@line 9544
 return;
}
function __ZThn4_N4mbed6StreamD1Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $4 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1650
 $1 = $0 + -4 | 0; //@line 1651
 HEAP32[$1 >> 2] = 488; //@line 1652
 $2 = $1 + 4 | 0; //@line 1653
 HEAP32[$2 >> 2] = 588; //@line 1654
 $4 = HEAP32[$1 + 20 >> 2] | 0; //@line 1656
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1657
 _fclose($4) | 0; //@line 1658
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 71; //@line 1661
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 1663
  sp = STACKTOP; //@line 1664
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1667
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1668
 __ZN4mbed8FileBaseD2Ev($2); //@line 1669
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 72; //@line 1672
  sp = STACKTOP; //@line 1673
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1676
  return;
 }
}
function ___dynamic_cast__async_cb_1($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2913
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2915
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2917
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2923
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 2938
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 2954
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 2959
    break;
   }
  default:
   {
    $$0 = 0; //@line 2963
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 2968
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $13 = 0, $16 = 0, $6 = 0, $7 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2764
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 2766
 $7 = $6 >> 8; //@line 2767
 if (!($6 & 1)) {
  $$0 = $7; //@line 2771
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 2776
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 2778
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 2781
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2786
 FUNCTION_TABLE_viiiii[$16 & 7]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 2787
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 230; //@line 2790
  sp = STACKTOP; //@line 2791
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2794
  return;
 }
}
function _mbed_error_vfprintf__async_cb_19($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4818
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 4820
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4822
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4824
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4826
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4828
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 4830
 _serial_putc(9828, $2 << 24 >> 24); //@line 4831
 if (!___async) {
  ___async_unwind = 0; //@line 4834
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 105; //@line 4836
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 4838
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 4840
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $8; //@line 4842
 HEAP8[$ReallocAsyncCtx2 + 16 >> 0] = $2; //@line 4844
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 4846
 sp = STACKTOP; //@line 4847
 return;
}
function __ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb_59($0) {
 $0 = $0 | 0;
 var $2 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7774
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7776
 if ((HEAP32[481] | 0) == ($2 | 0)) {
  HEAP32[481] = 0; //@line 7780
 }
 if ((HEAP32[482] | 0) == ($2 | 0)) {
  HEAP32[482] = 0; //@line 7785
 }
 if ((HEAP32[483] | 0) == ($2 | 0)) {
  HEAP32[483] = 0; //@line 7790
 }
 $6 = HEAP32[2459] | 0; //@line 7792
 if (!$6) {
  HEAP32[2459] = 9840; //@line 7795
  return;
 }
 if (($6 | 0) == 9840) {
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 7802
 _mbed_assert_internal(3120, 3140, 93); //@line 7803
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 113; //@line 7806
  sp = STACKTOP; //@line 7807
  return;
 }
 ___async_unwind = 0; //@line 7810
 HEAP32[$ReallocAsyncCtx >> 2] = 113; //@line 7811
 sp = STACKTOP; //@line 7812
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2679
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 2681
 $6 = $5 >> 8; //@line 2682
 if (!($5 & 1)) {
  $$0 = $6; //@line 2686
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 2691
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 2693
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 2696
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2701
 FUNCTION_TABLE_viiii[$15 & 7]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 2702
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 228; //@line 2705
  sp = STACKTOP; //@line 2706
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2709
  return;
 }
}
function __ZN15GraphicsDisplay3clsEv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 9092
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9096
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9098
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9100
 $10 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 132 >> 2] | 0; //@line 9103
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 9104
 $11 = FUNCTION_TABLE_ii[$10 & 31]($4) | 0; //@line 9105
 if (!___async) {
  HEAP32[___async_retval >> 2] = $11; //@line 9109
  ___async_unwind = 0; //@line 9110
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 137; //@line 9112
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 9114
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $AsyncRetVal; //@line 9116
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 9118
 sp = STACKTOP; //@line 9119
 return;
}
function __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb_84($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9224
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9228
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9230
 if (!(HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP32[$4 >> 2] = 0; //@line 9233
 } else {
  HEAP32[$4 >> 2] = HEAP32[2412]; //@line 9236
  HEAP32[2412] = $6; //@line 9237
 }
 $9 = HEAP32[2413] | 0; //@line 9239
 if (!$9) {
  HEAP32[2413] = 9656; //@line 9242
  return;
 }
 if (($9 | 0) == 9656) {
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 9249
 _mbed_assert_internal(3120, 3140, 93); //@line 9250
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 57; //@line 9253
  sp = STACKTOP; //@line 9254
  return;
 }
 ___async_unwind = 0; //@line 9257
 HEAP32[$ReallocAsyncCtx >> 2] = 57; //@line 9258
 sp = STACKTOP; //@line 9259
 return;
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 11716
 STACKTOP = STACKTOP + 256 | 0; //@line 11717
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 11717
 $5 = sp; //@line 11718
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 11724
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 11728
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 11731
   $$011 = $9; //@line 11732
   do {
    _out_670($0, $5, 256); //@line 11734
    $$011 = $$011 + -256 | 0; //@line 11735
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 11744
  } else {
   $$0$lcssa = $9; //@line 11746
  }
  _out_670($0, $5, $$0$lcssa); //@line 11748
 }
 STACKTOP = sp; //@line 11750
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb_60($0) {
 $0 = $0 | 0;
 var $4 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 7876
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7880
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 7882
 $8 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 88 >> 2] | 0; //@line 7885
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 7886
 FUNCTION_TABLE_vi[$8 & 255]($4); //@line 7887
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 79; //@line 7890
  $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 7891
  HEAP32[$9 >> 2] = $AsyncRetVal; //@line 7892
  sp = STACKTOP; //@line 7893
  return;
 }
 ___async_unwind = 0; //@line 7896
 HEAP32[$ReallocAsyncCtx3 >> 2] = 79; //@line 7897
 $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 7898
 HEAP32[$9 >> 2] = $AsyncRetVal; //@line 7899
 sp = STACKTOP; //@line 7900
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_88($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 9404
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9406
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9408
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9410
 $8 = HEAP32[(HEAP32[$2 >> 2] | 0) + 96 >> 2] | 0; //@line 9413
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 9414
 $9 = FUNCTION_TABLE_ii[$8 & 31]($4) | 0; //@line 9415
 if (!___async) {
  HEAP32[___async_retval >> 2] = $9; //@line 9419
  ___async_unwind = 0; //@line 9420
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 157; //@line 9422
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $AsyncRetVal; //@line 9424
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 9426
 HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $2; //@line 9428
 sp = STACKTOP; //@line 9429
 return;
}
function __ZN4mbed6StreamD2Ev($0) {
 $0 = $0 | 0;
 var $3 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1352
 HEAP32[$0 >> 2] = 488; //@line 1353
 HEAP32[$0 + 4 >> 2] = 588; //@line 1355
 $3 = HEAP32[$0 + 20 >> 2] | 0; //@line 1357
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1358
 _fclose($3) | 0; //@line 1359
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 63; //@line 1362
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1364
  sp = STACKTOP; //@line 1365
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1368
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1370
 __ZN4mbed8FileBaseD2Ev($0 + 4 | 0); //@line 1371
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 64; //@line 1374
  sp = STACKTOP; //@line 1375
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1378
  return;
 }
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_9($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3884
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3888
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3890
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3892
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3894
 $13 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 88 >> 2] | 0; //@line 3897
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 3898
 FUNCTION_TABLE_vi[$13 & 255]($4); //@line 3899
 if (!___async) {
  ___async_unwind = 0; //@line 3902
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 83; //@line 3904
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $6; //@line 3906
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $8; //@line 3908
 HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $10; //@line 3910
 sp = STACKTOP; //@line 3911
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 8581
 STACKTOP = STACKTOP + 32 | 0; //@line 8582
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 8582
 $vararg_buffer = sp; //@line 8583
 $3 = sp + 20 | 0; //@line 8584
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 8588
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 8590
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 8592
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 8594
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 8596
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 8601
  $10 = -1; //@line 8602
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 8605
 }
 STACKTOP = sp; //@line 8607
 return $10 | 0; //@line 8607
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 1968
 STACKTOP = STACKTOP + 16 | 0; //@line 1969
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1969
 $vararg_buffer = sp; //@line 1970
 HEAP32[$vararg_buffer >> 2] = $0; //@line 1971
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 1973
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 1975
 _mbed_error_printf(2540, $vararg_buffer); //@line 1976
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1977
 _mbed_die(); //@line 1978
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 85; //@line 1981
  sp = STACKTOP; //@line 1982
  STACKTOP = sp; //@line 1983
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1985
  STACKTOP = sp; //@line 1986
  return;
 }
}
function __ZN11TextDisplay3clsEv__async_cb_89($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 9435
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9439
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9441
 if ((Math_imul(HEAP32[___async_retval >> 2] | 0, HEAP32[$0 + 4 >> 2] | 0) | 0) <= 0) {
  return;
 }
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 9449
 __ZN4mbed6Stream4putcEi($4, 32) | 0; //@line 9450
 if (!___async) {
  ___async_unwind = 0; //@line 9453
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 158; //@line 9455
 HEAP32[$ReallocAsyncCtx6 + 4 >> 2] = 0; //@line 9457
 HEAP32[$ReallocAsyncCtx6 + 8 >> 2] = $6; //@line 9459
 HEAP32[$ReallocAsyncCtx6 + 12 >> 2] = $4; //@line 9461
 HEAP32[$ReallocAsyncCtx6 + 16 >> 2] = $4; //@line 9463
 sp = STACKTOP; //@line 9464
 return;
}
function _snprintf($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 392
 STACKTOP = STACKTOP + 16 | 0; //@line 393
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 393
 $3 = sp; //@line 394
 HEAP32[$3 >> 2] = $varargs; //@line 395
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 396
 $4 = _vsnprintf($0, $1, $2, $3) | 0; //@line 397
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 192; //@line 400
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 402
  sp = STACKTOP; //@line 403
  STACKTOP = sp; //@line 404
  return 0; //@line 404
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 406
  STACKTOP = sp; //@line 407
  return $4 | 0; //@line 407
 }
 return 0; //@line 409
}
function _mbed_vtracef__async_cb_48($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 7020
 HEAP32[88] = HEAP32[86]; //@line 7022
 $2 = HEAP32[94] | 0; //@line 7023
 if (!$2) {
  return;
 }
 $4 = HEAP32[95] | 0; //@line 7028
 HEAP32[95] = 0; //@line 7029
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 7030
 FUNCTION_TABLE_v[$2 & 3](); //@line 7031
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 7034
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 7035
  HEAP32[$5 >> 2] = $4; //@line 7036
  sp = STACKTOP; //@line 7037
  return;
 }
 ___async_unwind = 0; //@line 7040
 HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 7041
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 7042
 HEAP32[$5 >> 2] = $4; //@line 7043
 sp = STACKTOP; //@line 7044
 return;
}
function _mbed_vtracef__async_cb_45($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 6756
 HEAP32[88] = HEAP32[86]; //@line 6758
 $2 = HEAP32[94] | 0; //@line 6759
 if (!$2) {
  return;
 }
 $4 = HEAP32[95] | 0; //@line 6764
 HEAP32[95] = 0; //@line 6765
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 6766
 FUNCTION_TABLE_v[$2 & 3](); //@line 6767
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 6770
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 6771
  HEAP32[$5 >> 2] = $4; //@line 6772
  sp = STACKTOP; //@line 6773
  return;
 }
 ___async_unwind = 0; //@line 6776
 HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 6777
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 6778
 HEAP32[$5 >> 2] = $4; //@line 6779
 sp = STACKTOP; //@line 6780
 return;
}
function _mbed_vtracef__async_cb_44($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 6726
 HEAP32[88] = HEAP32[86]; //@line 6728
 $2 = HEAP32[94] | 0; //@line 6729
 if (!$2) {
  return;
 }
 $4 = HEAP32[95] | 0; //@line 6734
 HEAP32[95] = 0; //@line 6735
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 6736
 FUNCTION_TABLE_v[$2 & 3](); //@line 6737
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 6740
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 6741
  HEAP32[$5 >> 2] = $4; //@line 6742
  sp = STACKTOP; //@line 6743
  return;
 }
 ___async_unwind = 0; //@line 6746
 HEAP32[$ReallocAsyncCtx8 >> 2] = 48; //@line 6747
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 6748
 HEAP32[$5 >> 2] = $4; //@line 6749
 sp = STACKTOP; //@line 6750
 return;
}
function __ZN4mbed8FileBaseD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $7 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11349
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11351
 if (HEAP32[$2 + 12 >> 2] | 0) {
  __ZdlPv($2); //@line 11356
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 11360
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 11361
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 55; //@line 11364
  $7 = $ReallocAsyncCtx3 + 4 | 0; //@line 11365
  HEAP32[$7 >> 2] = $2; //@line 11366
  sp = STACKTOP; //@line 11367
  return;
 }
 ___async_unwind = 0; //@line 11370
 HEAP32[$ReallocAsyncCtx3 >> 2] = 55; //@line 11371
 $7 = $ReallocAsyncCtx3 + 4 | 0; //@line 11372
 HEAP32[$7 >> 2] = $2; //@line 11373
 sp = STACKTOP; //@line 11374
 return;
}
function __ZN15GraphicsDisplay3clsEv__async_cb_81($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 9125
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9127
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9129
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9131
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9133
 $10 = HEAPU16[$2 + 30 >> 1] | 0; //@line 9136
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 9137
 FUNCTION_TABLE_viiiiii[$6 & 7]($2, 0, 0, $4, $AsyncRetVal, $10); //@line 9138
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 138; //@line 9141
  sp = STACKTOP; //@line 9142
  return;
 }
 ___async_unwind = 0; //@line 9145
 HEAP32[$ReallocAsyncCtx3 >> 2] = 138; //@line 9146
 sp = STACKTOP; //@line 9147
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 1445
 $5 = HEAP32[$4 >> 2] | 0; //@line 1446
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 1450
   HEAP32[$1 + 24 >> 2] = $3; //@line 1452
   HEAP32[$1 + 36 >> 2] = 1; //@line 1454
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 1458
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 1461
    HEAP32[$1 + 24 >> 2] = 2; //@line 1463
    HEAP8[$1 + 54 >> 0] = 1; //@line 1465
    break;
   }
   $10 = $1 + 24 | 0; //@line 1468
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 1472
   }
  }
 } while (0);
 return;
}
function _mbed_error_hist_put($0) {
 $0 = $0 | 0;
 var $$0 = 0, $3 = 0, $5 = 0;
 if (!$0) {
  $$0 = -2130771711; //@line 2589
  return $$0 | 0; //@line 2590
 }
 $3 = (HEAP32[149] | 0) + 1 | 0; //@line 2593
 HEAP32[149] = $3; //@line 2594
 $5 = 9696 + ((($3 | 0) % 4 | 0) << 5) | 0; //@line 2596
 HEAP32[$5 >> 2] = HEAP32[$0 >> 2]; //@line 2597
 HEAP32[$5 + 4 >> 2] = HEAP32[$0 + 4 >> 2]; //@line 2597
 HEAP32[$5 + 8 >> 2] = HEAP32[$0 + 8 >> 2]; //@line 2597
 HEAP32[$5 + 12 >> 2] = HEAP32[$0 + 12 >> 2]; //@line 2597
 HEAP32[$5 + 16 >> 2] = HEAP32[$0 + 16 >> 2]; //@line 2597
 HEAP32[$5 + 20 >> 2] = HEAP32[$0 + 20 >> 2]; //@line 2597
 HEAP32[$5 + 24 >> 2] = HEAP32[$0 + 24 >> 2]; //@line 2597
 HEAP32[$5 + 28 >> 2] = HEAP32[$0 + 28 >> 2]; //@line 2597
 $$0 = 0; //@line 2598
 return $$0 | 0; //@line 2599
}
function _sprintf($0, $1, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $varargs = $varargs | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 514
 STACKTOP = STACKTOP + 16 | 0; //@line 515
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 515
 $2 = sp; //@line 516
 HEAP32[$2 >> 2] = $varargs; //@line 517
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 518
 $3 = _vsprintf($0, $1, $2) | 0; //@line 519
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 194; //@line 522
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 524
  sp = STACKTOP; //@line 525
  STACKTOP = sp; //@line 526
  return 0; //@line 526
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 528
  STACKTOP = sp; //@line 529
  return $3 | 0; //@line 529
 }
 return 0; //@line 531
}
function __ZN15GraphicsDisplayC2EPKc__async_cb_86($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9306
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 9308
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9310
 HEAP32[$2 >> 2] = 788; //@line 9311
 HEAP32[$2 + 4 >> 2] = 952; //@line 9313
 __ZN11TextDisplay10foregroundEt($4, -1); //@line 9314
 $8 = HEAP32[(HEAP32[$2 >> 2] | 0) + 120 >> 2] | 0; //@line 9317
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 9318
 FUNCTION_TABLE_vii[$8 & 7]($4, 0); //@line 9319
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 148; //@line 9322
  sp = STACKTOP; //@line 9323
  return;
 }
 ___async_unwind = 0; //@line 9326
 HEAP32[$ReallocAsyncCtx >> 2] = 148; //@line 9327
 sp = STACKTOP; //@line 9328
 return;
}
function __Znwj__async_cb($0) {
 $0 = $0 | 0;
 var $$lcssa = 0, $2 = 0, $3 = 0, $5 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 7393
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7395
 $3 = _malloc($2) | 0; //@line 7396
 if (!$3) {
  $5 = __ZSt15get_new_handlerv() | 0; //@line 7399
  if (!$5) {
   $$lcssa = 0; //@line 7402
  } else {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 7404
   FUNCTION_TABLE_v[$5 & 3](); //@line 7405
   if (!___async) {
    ___async_unwind = 0; //@line 7408
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 203; //@line 7410
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 7412
   sp = STACKTOP; //@line 7413
   return;
  }
 } else {
  $$lcssa = $3; //@line 7417
 }
 HEAP32[___async_retval >> 2] = $$lcssa; //@line 7420
 return;
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2666
 $2 = HEAP32[325] | 0; //@line 2667
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2668
 _putc($1, $2) | 0; //@line 2669
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 108; //@line 2672
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 2674
  sp = STACKTOP; //@line 2675
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2678
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2679
 _fflush($2) | 0; //@line 2680
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 109; //@line 2683
  sp = STACKTOP; //@line 2684
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2687
  return;
 }
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 8762
 $3 = HEAP8[$1 >> 0] | 0; //@line 8763
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 8768
  $$lcssa8 = $2; //@line 8768
 } else {
  $$011 = $1; //@line 8770
  $$0710 = $0; //@line 8770
  do {
   $$0710 = $$0710 + 1 | 0; //@line 8772
   $$011 = $$011 + 1 | 0; //@line 8773
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 8774
   $9 = HEAP8[$$011 >> 0] | 0; //@line 8775
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 8780
  $$lcssa8 = $8; //@line 8780
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 8790
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 1995
 STACKTOP = STACKTOP + 16 | 0; //@line 1996
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1996
 $vararg_buffer = sp; //@line 1997
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1998
 FUNCTION_TABLE_v[$0 & 3](); //@line 1999
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 218; //@line 2002
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 2004
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 2006
  sp = STACKTOP; //@line 2007
  STACKTOP = sp; //@line 2008
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2010
  _abort_message(9500, $vararg_buffer); //@line 2011
 }
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 8714
 STACKTOP = STACKTOP + 32 | 0; //@line 8715
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 8715
 $vararg_buffer = sp; //@line 8716
 HEAP32[$0 + 36 >> 2] = 5; //@line 8719
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 8727
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 8729
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 8731
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 8736
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 8739
 STACKTOP = sp; //@line 8740
 return $14 | 0; //@line 8740
}
function _mbed_die__async_cb_41($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 6070
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6072
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 6074
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 6075
 _wait_ms(150); //@line 6076
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 87; //@line 6079
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 6080
  HEAP32[$4 >> 2] = $2; //@line 6081
  sp = STACKTOP; //@line 6082
  return;
 }
 ___async_unwind = 0; //@line 6085
 HEAP32[$ReallocAsyncCtx15 >> 2] = 87; //@line 6086
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 6087
 HEAP32[$4 >> 2] = $2; //@line 6088
 sp = STACKTOP; //@line 6089
 return;
}
function _mbed_die__async_cb_40($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 6045
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6047
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 6049
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 6050
 _wait_ms(150); //@line 6051
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 88; //@line 6054
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 6055
  HEAP32[$4 >> 2] = $2; //@line 6056
  sp = STACKTOP; //@line 6057
  return;
 }
 ___async_unwind = 0; //@line 6060
 HEAP32[$ReallocAsyncCtx14 >> 2] = 88; //@line 6061
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 6062
 HEAP32[$4 >> 2] = $2; //@line 6063
 sp = STACKTOP; //@line 6064
 return;
}
function _mbed_die__async_cb_39($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 6020
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6022
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 6024
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 6025
 _wait_ms(150); //@line 6026
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 89; //@line 6029
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 6030
  HEAP32[$4 >> 2] = $2; //@line 6031
  sp = STACKTOP; //@line 6032
  return;
 }
 ___async_unwind = 0; //@line 6035
 HEAP32[$ReallocAsyncCtx13 >> 2] = 89; //@line 6036
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 6037
 HEAP32[$4 >> 2] = $2; //@line 6038
 sp = STACKTOP; //@line 6039
 return;
}
function _mbed_die__async_cb_38($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 5995
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5997
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5999
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 6000
 _wait_ms(150); //@line 6001
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 90; //@line 6004
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 6005
  HEAP32[$4 >> 2] = $2; //@line 6006
  sp = STACKTOP; //@line 6007
  return;
 }
 ___async_unwind = 0; //@line 6010
 HEAP32[$ReallocAsyncCtx12 >> 2] = 90; //@line 6011
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 6012
 HEAP32[$4 >> 2] = $2; //@line 6013
 sp = STACKTOP; //@line 6014
 return;
}
function _mbed_die__async_cb_37($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 5970
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5972
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5974
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 5975
 _wait_ms(150); //@line 5976
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 91; //@line 5979
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 5980
  HEAP32[$4 >> 2] = $2; //@line 5981
  sp = STACKTOP; //@line 5982
  return;
 }
 ___async_unwind = 0; //@line 5985
 HEAP32[$ReallocAsyncCtx11 >> 2] = 91; //@line 5986
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 5987
 HEAP32[$4 >> 2] = $2; //@line 5988
 sp = STACKTOP; //@line 5989
 return;
}
function _mbed_die__async_cb_36($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 5945
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5947
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5949
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 5950
 _wait_ms(150); //@line 5951
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 92; //@line 5954
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 5955
  HEAP32[$4 >> 2] = $2; //@line 5956
  sp = STACKTOP; //@line 5957
  return;
 }
 ___async_unwind = 0; //@line 5960
 HEAP32[$ReallocAsyncCtx10 >> 2] = 92; //@line 5961
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 5962
 HEAP32[$4 >> 2] = $2; //@line 5963
 sp = STACKTOP; //@line 5964
 return;
}
function _memcmp($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $14 = 0, $4 = 0, $5 = 0;
 L1 : do {
  if (!$2) {
   $14 = 0; //@line 357
  } else {
   $$01318 = $0; //@line 359
   $$01417 = $2; //@line 359
   $$019 = $1; //@line 359
   while (1) {
    $4 = HEAP8[$$01318 >> 0] | 0; //@line 361
    $5 = HEAP8[$$019 >> 0] | 0; //@line 362
    if ($4 << 24 >> 24 != $5 << 24 >> 24) {
     break;
    }
    $$01417 = $$01417 + -1 | 0; //@line 367
    if (!$$01417) {
     $14 = 0; //@line 372
     break L1;
    } else {
     $$01318 = $$01318 + 1 | 0; //@line 375
     $$019 = $$019 + 1 | 0; //@line 375
    }
   }
   $14 = ($4 & 255) - ($5 & 255) | 0; //@line 381
  }
 } while (0);
 return $14 | 0; //@line 384
}
function _mbed_tracef($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 253
 STACKTOP = STACKTOP + 16 | 0; //@line 254
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 254
 $3 = sp; //@line 255
 HEAP32[$3 >> 2] = $varargs; //@line 256
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 257
 _mbed_vtracef($0, $1, $2, $3); //@line 258
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 37; //@line 261
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 263
  sp = STACKTOP; //@line 264
  STACKTOP = sp; //@line 265
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 267
  STACKTOP = sp; //@line 268
  return;
 }
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 5695
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5697
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5699
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 5700
 _wait_ms(150); //@line 5701
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 86; //@line 5704
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 5705
  HEAP32[$4 >> 2] = $2; //@line 5706
  sp = STACKTOP; //@line 5707
  return;
 }
 ___async_unwind = 0; //@line 5710
 HEAP32[$ReallocAsyncCtx16 >> 2] = 86; //@line 5711
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 5712
 HEAP32[$4 >> 2] = $2; //@line 5713
 sp = STACKTOP; //@line 5714
 return;
}
function __ZN4mbed6StreamC2EPKc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 7988
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 7992
 HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = $AsyncRetVal; //@line 7993
 if ($AsyncRetVal | 0) {
  __ZN4mbed26mbed_set_unbuffered_streamEP8_IO_FILE($AsyncRetVal); //@line 7996
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 7999
 _mbed_error(-2147417831, 2521, 0, 0, 0) | 0; //@line 8000
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 75; //@line 8003
  sp = STACKTOP; //@line 8004
  return;
 }
 ___async_unwind = 0; //@line 8007
 HEAP32[$ReallocAsyncCtx3 >> 2] = 75; //@line 8008
 sp = STACKTOP; //@line 8009
 return;
}
function _mbed_die__async_cb_28($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5745
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5747
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5749
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 5750
 _wait_ms(400); //@line 5751
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 5754
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 5755
  HEAP32[$4 >> 2] = $2; //@line 5756
  sp = STACKTOP; //@line 5757
  return;
 }
 ___async_unwind = 0; //@line 5760
 HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 5761
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 5762
 HEAP32[$4 >> 2] = $2; //@line 5763
 sp = STACKTOP; //@line 5764
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 7848
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 7850
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7852
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 7854
 $8 = HEAP32[$2 + 20 >> 2] | 0; //@line 7856
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 7857
 _fflush($8) | 0; //@line 7858
 if (!___async) {
  ___async_unwind = 0; //@line 7861
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 77; //@line 7863
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $2; //@line 7865
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $4; //@line 7867
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $6; //@line 7869
 sp = STACKTOP; //@line 7870
 return;
}
function _mbed_die__async_cb_35($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 5920
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5922
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5924
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 5925
 _wait_ms(150); //@line 5926
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 93; //@line 5929
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 5930
  HEAP32[$4 >> 2] = $2; //@line 5931
  sp = STACKTOP; //@line 5932
  return;
 }
 ___async_unwind = 0; //@line 5935
 HEAP32[$ReallocAsyncCtx9 >> 2] = 93; //@line 5936
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 5937
 HEAP32[$4 >> 2] = $2; //@line 5938
 sp = STACKTOP; //@line 5939
 return;
}
function _mbed_die__async_cb_34($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 5895
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5897
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5899
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 5900
 _wait_ms(400); //@line 5901
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 94; //@line 5904
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 5905
  HEAP32[$4 >> 2] = $2; //@line 5906
  sp = STACKTOP; //@line 5907
  return;
 }
 ___async_unwind = 0; //@line 5910
 HEAP32[$ReallocAsyncCtx8 >> 2] = 94; //@line 5911
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 5912
 HEAP32[$4 >> 2] = $2; //@line 5913
 sp = STACKTOP; //@line 5914
 return;
}
function _mbed_die__async_cb_33($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 5870
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5872
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5874
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 5875
 _wait_ms(400); //@line 5876
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 95; //@line 5879
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 5880
  HEAP32[$4 >> 2] = $2; //@line 5881
  sp = STACKTOP; //@line 5882
  return;
 }
 ___async_unwind = 0; //@line 5885
 HEAP32[$ReallocAsyncCtx7 >> 2] = 95; //@line 5886
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 5887
 HEAP32[$4 >> 2] = $2; //@line 5888
 sp = STACKTOP; //@line 5889
 return;
}
function _mbed_die__async_cb_32($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 5845
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5847
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5849
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 5850
 _wait_ms(400); //@line 5851
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 96; //@line 5854
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 5855
  HEAP32[$4 >> 2] = $2; //@line 5856
  sp = STACKTOP; //@line 5857
  return;
 }
 ___async_unwind = 0; //@line 5860
 HEAP32[$ReallocAsyncCtx6 >> 2] = 96; //@line 5861
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 5862
 HEAP32[$4 >> 2] = $2; //@line 5863
 sp = STACKTOP; //@line 5864
 return;
}
function _mbed_die__async_cb_31($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 5820
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5822
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5824
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 5825
 _wait_ms(400); //@line 5826
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 97; //@line 5829
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 5830
  HEAP32[$4 >> 2] = $2; //@line 5831
  sp = STACKTOP; //@line 5832
  return;
 }
 ___async_unwind = 0; //@line 5835
 HEAP32[$ReallocAsyncCtx5 >> 2] = 97; //@line 5836
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 5837
 HEAP32[$4 >> 2] = $2; //@line 5838
 sp = STACKTOP; //@line 5839
 return;
}
function _mbed_die__async_cb_30($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 5795
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5797
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 5799
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 5800
 _wait_ms(400); //@line 5801
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 98; //@line 5804
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 5805
  HEAP32[$4 >> 2] = $2; //@line 5806
  sp = STACKTOP; //@line 5807
  return;
 }
 ___async_unwind = 0; //@line 5810
 HEAP32[$ReallocAsyncCtx4 >> 2] = 98; //@line 5811
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 5812
 HEAP32[$4 >> 2] = $2; //@line 5813
 sp = STACKTOP; //@line 5814
 return;
}
function _mbed_die__async_cb_29($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5770
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5772
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5774
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 5775
 _wait_ms(400); //@line 5776
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 99; //@line 5779
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 5780
  HEAP32[$4 >> 2] = $2; //@line 5781
  sp = STACKTOP; //@line 5782
  return;
 }
 ___async_unwind = 0; //@line 5785
 HEAP32[$ReallocAsyncCtx3 >> 2] = 99; //@line 5786
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 5787
 HEAP32[$4 >> 2] = $2; //@line 5788
 sp = STACKTOP; //@line 5789
 return;
}
function _mbed_die__async_cb_27($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5720
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5722
 _emscripten_asm_const_iii(2, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 5724
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 5725
 _wait_ms(400); //@line 5726
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 101; //@line 5729
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 5730
  HEAP32[$4 >> 2] = $2; //@line 5731
  sp = STACKTOP; //@line 5732
  return;
 }
 ___async_unwind = 0; //@line 5735
 HEAP32[$ReallocAsyncCtx >> 2] = 101; //@line 5736
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 5737
 HEAP32[$4 >> 2] = $2; //@line 5738
 sp = STACKTOP; //@line 5739
 return;
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2296
 STACKTOP = STACKTOP + 16 | 0; //@line 2297
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2297
 $1 = sp; //@line 2298
 HEAP32[$1 >> 2] = $varargs; //@line 2299
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2300
 _mbed_error_vfprintf($0, $1); //@line 2301
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 102; //@line 2304
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 2306
  sp = STACKTOP; //@line 2307
  STACKTOP = sp; //@line 2308
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2310
  STACKTOP = sp; //@line 2311
  return;
 }
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 12124
 newDynamicTop = oldDynamicTop + increment | 0; //@line 12125
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 12129
  ___setErrNo(12); //@line 12130
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 12134
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 12138
   ___setErrNo(12); //@line 12139
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 12143
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 11577
 } else {
  $$056 = $2; //@line 11579
  $15 = $1; //@line 11579
  $8 = $0; //@line 11579
  while (1) {
   $14 = $$056 + -1 | 0; //@line 11587
   HEAP8[$14 >> 0] = HEAPU8[7163 + ($8 & 15) >> 0] | 0 | $3; //@line 11588
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 11589
   $15 = tempRet0; //@line 11590
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 11595
    break;
   } else {
    $$056 = $14; //@line 11598
   }
  }
 }
 return $$05$lcssa | 0; //@line 11602
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 8885
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 8887
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 8893
  $11 = ___fwritex($0, $4, $3) | 0; //@line 8894
  if ($phitmp) {
   $13 = $11; //@line 8896
  } else {
   ___unlockfile($3); //@line 8898
   $13 = $11; //@line 8899
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 8903
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 8907
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 8910
 }
 return $15 | 0; //@line 8912
}
function __ZN15GraphicsDisplay4putpEi__async_cb($0) {
 $0 = $0 | 0;
 var $15 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6098
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6100
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6102
 $8 = (HEAP16[$2 >> 1] | 0) + 1 << 16 >> 16; //@line 6104
 HEAP16[$2 >> 1] = $8; //@line 6105
 if ($8 << 16 >> 16 <= (HEAP16[$4 + 42 >> 1] | 0)) {
  return;
 }
 HEAP16[$2 >> 1] = HEAP16[$4 + 40 >> 1] | 0; //@line 6114
 $15 = (HEAP16[$6 >> 1] | 0) + 1 << 16 >> 16; //@line 6116
 HEAP16[$6 >> 1] = $15; //@line 6117
 if ($15 << 16 >> 16 <= (HEAP16[$4 + 46 >> 1] | 0)) {
  return;
 }
 HEAP16[$6 >> 1] = HEAP16[$4 + 44 >> 1] | 0; //@line 6126
 return;
}
function __ZSt9terminatev() {
 var $0 = 0, $16 = 0, $17 = 0, $2 = 0, $5 = 0, sp = 0;
 sp = STACKTOP; //@line 1960
 $0 = ___cxa_get_globals_fast() | 0; //@line 1961
 if ($0 | 0) {
  $2 = HEAP32[$0 >> 2] | 0; //@line 1964
  if ($2 | 0) {
   $5 = $2 + 48 | 0; //@line 1968
   if ((HEAP32[$5 >> 2] & -256 | 0) == 1126902528 ? (HEAP32[$5 + 4 >> 2] | 0) == 1129074247 : 0) {
    $16 = HEAP32[$2 + 12 >> 2] | 0; //@line 1980
    _emscripten_alloc_async_context(4, sp) | 0; //@line 1981
    __ZSt11__terminatePFvvE($16); //@line 1982
   }
  }
 }
 $17 = __ZSt13get_terminatev() | 0; //@line 1987
 _emscripten_alloc_async_context(4, sp) | 0; //@line 1988
 __ZSt11__terminatePFvvE($17); //@line 1989
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 9140
 $3 = HEAP8[$1 >> 0] | 0; //@line 9142
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 9146
 $7 = HEAP32[$0 >> 2] | 0; //@line 9147
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 9152
  HEAP32[$0 + 4 >> 2] = 0; //@line 9154
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 9156
  HEAP32[$0 + 28 >> 2] = $14; //@line 9158
  HEAP32[$0 + 20 >> 2] = $14; //@line 9160
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 9166
  $$0 = 0; //@line 9167
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 9170
  $$0 = -1; //@line 9171
 }
 return $$0 | 0; //@line 9173
}
function __ZN6C128327columnsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3359
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 3362
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3363
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 3364
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 126; //@line 3367
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3369
  sp = STACKTOP; //@line 3370
  return 0; //@line 3371
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3373
  return ($4 | 0) / (HEAPU8[(HEAP32[$0 + 48 >> 2] | 0) + 1 >> 0] | 0 | 0) | 0 | 0; //@line 3380
 }
 return 0; //@line 3382
}
function __ZN6C128324rowsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3331
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 3334
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3335
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 3336
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 125; //@line 3339
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3341
  sp = STACKTOP; //@line 3342
  return 0; //@line 3343
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3345
  return ($4 | 0) / (HEAPU8[(HEAP32[$0 + 48 >> 2] | 0) + 2 >> 0] | 0 | 0) | 0 | 0; //@line 3352
 }
 return 0; //@line 3354
}
function _twobyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$sink$in = 0, $$sink17$sink = 0, $11 = 0, $12 = 0, $8 = 0;
 $8 = (HEAPU8[$1 >> 0] | 0) << 8 | (HEAPU8[$1 + 1 >> 0] | 0); //@line 13045
 $$sink$in = HEAPU8[$0 >> 0] | 0; //@line 13048
 $$sink17$sink = $0; //@line 13048
 while (1) {
  $11 = $$sink17$sink + 1 | 0; //@line 13050
  $12 = HEAP8[$11 >> 0] | 0; //@line 13051
  if (!($12 << 24 >> 24)) {
   break;
  }
  $$sink$in = $$sink$in << 8 & 65280 | $12 & 255; //@line 13059
  if (($$sink$in | 0) == ($8 | 0)) {
   break;
  } else {
   $$sink17$sink = $11; //@line 13064
  }
 }
 return ($12 << 24 >> 24 ? $$sink17$sink : 0) | 0; //@line 13069
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 11614
 } else {
  $$06 = $2; //@line 11616
  $11 = $1; //@line 11616
  $7 = $0; //@line 11616
  while (1) {
   $10 = $$06 + -1 | 0; //@line 11621
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 11622
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 11623
   $11 = tempRet0; //@line 11624
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 11629
    break;
   } else {
    $$06 = $10; //@line 11632
   }
  }
 }
 return $$0$lcssa | 0; //@line 11636
}
function ___fmodeflags($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$0$ = 0, $$2 = 0, $$2$ = 0, $$4 = 0, $2 = 0, $3 = 0, $6 = 0, $9 = 0;
 $2 = (_strchr($0, 43) | 0) == 0; //@line 9484
 $3 = HEAP8[$0 >> 0] | 0; //@line 9485
 $$0 = $2 ? $3 << 24 >> 24 != 114 & 1 : 2; //@line 9488
 $6 = (_strchr($0, 120) | 0) == 0; //@line 9490
 $$0$ = $6 ? $$0 : $$0 | 128; //@line 9492
 $9 = (_strchr($0, 101) | 0) == 0; //@line 9494
 $$2 = $9 ? $$0$ : $$0$ | 524288; //@line 9496
 $$2$ = $3 << 24 >> 24 == 114 ? $$2 : $$2 | 64; //@line 9499
 $$4 = $3 << 24 >> 24 == 119 ? $$2$ | 512 : $$2$; //@line 9502
 return ($3 << 24 >> 24 == 97 ? $$4 | 1024 : $$4) | 0; //@line 9506
}
function __ZN4mbed8FileBaseD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 10779
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10781
 if (HEAP32[$2 + 12 >> 2] | 0) {
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 10789
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 10790
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 52; //@line 10793
  sp = STACKTOP; //@line 10794
  return;
 }
 ___async_unwind = 0; //@line 10797
 HEAP32[$ReallocAsyncCtx3 >> 2] = 52; //@line 10798
 sp = STACKTOP; //@line 10799
 return;
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2845
 do {
  if (!$0) {
   $3 = 0; //@line 2849
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2851
   $2 = ___dynamic_cast($0, 232, 288, 0) | 0; //@line 2852
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 232; //@line 2855
    sp = STACKTOP; //@line 2856
    return 0; //@line 2857
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 2859
    $3 = ($2 | 0) != 0 & 1; //@line 2862
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 2867
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 11258
 } else {
  $$04 = 0; //@line 11260
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 11263
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 11267
   $12 = $7 + 1 | 0; //@line 11268
   HEAP32[$0 >> 2] = $12; //@line 11269
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 11275
    break;
   } else {
    $$04 = $11; //@line 11278
   }
  }
 }
 return $$0$lcssa | 0; //@line 11282
}
function _invoke_ticker__async_cb_2($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2980
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 2986
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 2987
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 2988
 FUNCTION_TABLE_vi[$5 & 255]($6); //@line 2989
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 111; //@line 2992
  sp = STACKTOP; //@line 2993
  return;
 }
 ___async_unwind = 0; //@line 2996
 HEAP32[$ReallocAsyncCtx >> 2] = 111; //@line 2997
 sp = STACKTOP; //@line 2998
 return;
}
function __ZN15GraphicsDisplay9characterEiii($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3802
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 152 >> 2] | 0; //@line 3805
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3810
 FUNCTION_TABLE_viiiiii[$6 & 7]($0, $1 << 3, $2 << 3, 8, 8, 5214 + ($3 + -31 << 3) | 0); //@line 3811
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 133; //@line 3814
  sp = STACKTOP; //@line 3815
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3818
  return;
 }
}
function __ZN4mbed10FileHandle5lseekEii($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 146
 $5 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 149
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 150
 $6 = FUNCTION_TABLE_iiii[$5 & 15]($0, $1, $2) | 0; //@line 151
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 33; //@line 154
  sp = STACKTOP; //@line 155
  return 0; //@line 156
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 158
  return $6 | 0; //@line 159
 }
 return 0; //@line 161
}
function __ZN15GraphicsDisplay7columnsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3846
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 3849
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3850
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 3851
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 135; //@line 3854
  sp = STACKTOP; //@line 3855
  return 0; //@line 3856
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3858
  return ($4 | 0) / 8 | 0 | 0; //@line 3860
 }
 return 0; //@line 3862
}
function __ZN15GraphicsDisplay4rowsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3825
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 3828
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3829
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 3830
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 134; //@line 3833
  sp = STACKTOP; //@line 3834
  return 0; //@line 3835
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3837
  return ($4 | 0) / 8 | 0 | 0; //@line 3839
 }
 return 0; //@line 3841
}
function __ZN4mbed10FileHandle4tellEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1252
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 1255
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1256
 $4 = FUNCTION_TABLE_iiii[$3 & 15]($0, 0, 1) | 0; //@line 1257
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 58; //@line 1260
  sp = STACKTOP; //@line 1261
  return 0; //@line 1262
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1264
  return $4 | 0; //@line 1265
 }
 return 0; //@line 1267
}
function _fclose__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11282
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 11285
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11287
 $10 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 11290
 $12 = HEAP32[$4 + 92 >> 2] | 0; //@line 11292
 if ($12 | 0) {
  _free($12); //@line 11295
 }
 if ($6) {
  if ($8 | 0) {
   ___unlockfile($4); //@line 11300
  }
 } else {
  _free($4); //@line 11303
 }
 HEAP32[___async_retval >> 2] = $10; //@line 11306
 return;
}
function __ZN4mbed10FileHandle5fsyncEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 166
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 24 >> 2] | 0; //@line 169
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 170
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 171
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 34; //@line 174
  sp = STACKTOP; //@line 175
  return 0; //@line 176
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 178
  return $4 | 0; //@line 179
 }
 return 0; //@line 181
}
function __ZN4mbed10FileHandle4flenEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 186
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 40 >> 2] | 0; //@line 189
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 190
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 191
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 35; //@line 194
  sp = STACKTOP; //@line 195
  return 0; //@line 196
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 198
  return $4 | 0; //@line 199
 }
 return 0; //@line 201
}
function __ZN4mbed6StreamD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 10741
 $3 = (HEAP32[$0 + 4 >> 2] | 0) + 4 | 0; //@line 10744
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 10745
 __ZN4mbed8FileBaseD2Ev($3); //@line 10746
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 64; //@line 10749
  sp = STACKTOP; //@line 10750
  return;
 }
 ___async_unwind = 0; //@line 10753
 HEAP32[$ReallocAsyncCtx2 >> 2] = 64; //@line 10754
 sp = STACKTOP; //@line 10755
 return;
}
function ___fflush_unlocked__async_cb_93($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 9663
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 9665
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 9667
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 9669
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 9671
 HEAP32[$4 >> 2] = 0; //@line 9672
 HEAP32[$6 >> 2] = 0; //@line 9673
 HEAP32[$8 >> 2] = 0; //@line 9674
 HEAP32[$10 >> 2] = 0; //@line 9675
 HEAP32[___async_retval >> 2] = 0; //@line 9677
 return;
}
function __ZN6C128325_putcEi__async_cb($0) {
 $0 = $0 | 0;
 var $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8059
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8061
 if ((HEAP32[$0 + 8 >> 2] | 0) >>> 0 < ((HEAP32[___async_retval >> 2] | 0) - (HEAPU8[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 2 >> 0] | 0) | 0) >>> 0) {
  $16 = ___async_retval; //@line 8071
  HEAP32[$16 >> 2] = $6; //@line 8072
  return;
 }
 HEAP32[$8 >> 2] = 0; //@line 8075
 $16 = ___async_retval; //@line 8076
 HEAP32[$16 >> 2] = $6; //@line 8077
 return;
}
function __ZN6C128325_putcEi__async_cb_65($0) {
 $0 = $0 | 0;
 var $16 = 0, $2 = 0, $4 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 8085
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8087
 if (!(HEAP32[$2 + 4168 >> 2] | 0)) {
  $16 = ___async_retval; //@line 8092
  HEAP32[$16 >> 2] = $4; //@line 8093
  return;
 }
 _emscripten_asm_const_iiiii(4, HEAP32[$2 + 4172 >> 2] | 0, HEAP32[$2 + 4176 >> 2] | 0, HEAP32[$2 + 4180 >> 2] | 0, $2 + 68 | 0) | 0; //@line 8103
 $16 = ___async_retval; //@line 8104
 HEAP32[$16 >> 2] = $4; //@line 8105
 return;
}
function __ZThn4_N4mbed6StreamD1Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4483
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4485
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 4486
 __ZN4mbed8FileBaseD2Ev($2); //@line 4487
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 72; //@line 4490
  sp = STACKTOP; //@line 4491
  return;
 }
 ___async_unwind = 0; //@line 4494
 HEAP32[$ReallocAsyncCtx2 >> 2] = 72; //@line 4495
 sp = STACKTOP; //@line 4496
 return;
}
function _mbed_vtracef__async_cb_43($0) {
 $0 = $0 | 0;
 var $1 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 6708
 $1 = HEAP32[92] | 0; //@line 6709
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 6710
 FUNCTION_TABLE_vi[$1 & 255](2189); //@line 6711
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 41; //@line 6714
  sp = STACKTOP; //@line 6715
  return;
 }
 ___async_unwind = 0; //@line 6718
 HEAP32[$ReallocAsyncCtx3 >> 2] = 41; //@line 6719
 sp = STACKTOP; //@line 6720
 return;
}
function ___unlist_locked_file($0) {
 $0 = $0 | 0;
 var $$pre = 0, $$sink = 0, $10 = 0, $5 = 0;
 if (HEAP32[$0 + 68 >> 2] | 0) {
  $5 = HEAP32[$0 + 116 >> 2] | 0; //@line 9023
  $$pre = $0 + 112 | 0; //@line 9026
  if ($5 | 0) {
   HEAP32[$5 + 112 >> 2] = HEAP32[$$pre >> 2]; //@line 9030
  }
  $10 = HEAP32[$$pre >> 2] | 0; //@line 9032
  if (!$10) {
   $$sink = (___pthread_self_699() | 0) + 232 | 0; //@line 9037
  } else {
   $$sink = $10 + 116 | 0; //@line 9040
  }
  HEAP32[$$sink >> 2] = $5; //@line 9042
 }
 return;
}
function __ZThn4_N6C12832D0Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3502
 $1 = $0 + -4 | 0; //@line 3503
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3504
 __ZN4mbed6StreamD2Ev($1); //@line 3505
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 128; //@line 3508
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 3510
  sp = STACKTOP; //@line 3511
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3514
  __ZdlPv($1); //@line 3515
  return;
 }
}
function _serial_putc__async_cb_24($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5479
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5481
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 5482
 _fflush($2) | 0; //@line 5483
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 109; //@line 5486
  sp = STACKTOP; //@line 5487
  return;
 }
 ___async_unwind = 0; //@line 5490
 HEAP32[$ReallocAsyncCtx >> 2] = 109; //@line 5491
 sp = STACKTOP; //@line 5492
 return;
}
function _vsprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 538
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 539
 $3 = _vsnprintf($0, 2147483647, $1, $2) | 0; //@line 540
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 195; //@line 543
  sp = STACKTOP; //@line 544
  return 0; //@line 545
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 547
  return $3 | 0; //@line 548
 }
 return 0; //@line 550
}
function __ZN4mbed10FileHandle6rewindEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1272
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 1275
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1276
 FUNCTION_TABLE_iiii[$3 & 15]($0, 0, 0) | 0; //@line 1277
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 59; //@line 1280
  sp = STACKTOP; //@line 1281
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1284
  return;
 }
}
function _emscripten_async_resume() {
 ___async = 0; //@line 11975
 ___async_unwind = 1; //@line 11976
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 11982
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 11986
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 11990
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 11992
 }
}
function __ZN15GraphicsDisplay6windowEiiii($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $5 = 0, $7 = 0;
 $5 = $1 & 65535; //@line 3930
 HEAP16[$0 + 36 >> 1] = $5; //@line 3932
 $7 = $2 & 65535; //@line 3933
 HEAP16[$0 + 38 >> 1] = $7; //@line 3935
 HEAP16[$0 + 40 >> 1] = $5; //@line 3937
 HEAP16[$0 + 42 >> 1] = $1 + 65535 + $3; //@line 3942
 HEAP16[$0 + 44 >> 1] = $7; //@line 3944
 HEAP16[$0 + 46 >> 1] = $2 + 65535 + $4; //@line 3949
 return;
}
function __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 8115
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 8117
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 8119
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 8121
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 48 >> 2] = 3386; //@line 8123
 _emscripten_asm_const_iiiii(4, HEAP32[$4 >> 2] | 0, HEAP32[$6 >> 2] | 0, HEAP32[$8 >> 2] | 0, $10 | 0) | 0; //@line 8127
 return;
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 8451
 STACKTOP = STACKTOP + 16 | 0; //@line 8452
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 8452
 $vararg_buffer = sp; //@line 8453
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 8457
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 8459
 STACKTOP = sp; //@line 8460
 return $5 | 0; //@line 8460
}
function _freopen__async_cb_111($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11619
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11621
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 11622
 _fclose($2) | 0; //@line 11623
 if (!___async) {
  ___async_unwind = 0; //@line 11626
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 199; //@line 11628
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 11630
 sp = STACKTOP; //@line 11631
 return;
}
function __ZN6C12832D0Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2926
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2927
 __ZN4mbed6StreamD2Ev($0); //@line 2928
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 118; //@line 2931
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2933
  sp = STACKTOP; //@line 2934
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2937
  __ZdlPv($0); //@line 2938
  return;
 }
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 11917
 STACKTOP = STACKTOP + 16 | 0; //@line 11918
 $rem = __stackBase__ | 0; //@line 11919
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 11920
 STACKTOP = __stackBase__; //@line 11921
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 11922
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 11687
 if ((ret | 0) < 8) return ret | 0; //@line 11688
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 11689
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 11690
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 11691
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 11692
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 11693
}
function __Znaj($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1047
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1048
 $1 = __Znwj($0) | 0; //@line 1049
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 204; //@line 1052
  sp = STACKTOP; //@line 1053
  return 0; //@line 1054
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1056
  return $1 | 0; //@line 1057
 }
 return 0; //@line 1059
}
function _exit($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2823
 do {
  if ($0 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2827
   _mbed_die(); //@line 2828
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 114; //@line 2831
    sp = STACKTOP; //@line 2832
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 2835
    break;
   }
  }
 } while (0);
 while (1) {}
}
function ___cxa_get_globals_fast() {
 var $3 = 0, sp = 0;
 sp = STACKTOP; //@line 1181
 STACKTOP = STACKTOP + 16 | 0; //@line 1182
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1182
 if (!(_pthread_once(14604, 3) | 0)) {
  $3 = _pthread_getspecific(HEAP32[3652] | 0) | 0; //@line 1188
  STACKTOP = sp; //@line 1189
  return $3 | 0; //@line 1189
 } else {
  _abort_message(9348, sp); //@line 1191
 }
 return 0; //@line 1194
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 1349
 }
 return;
}
function __ZN6C128325pixelEiii($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $17 = 0;
 if ($1 >>> 0 > 128 | $2 >>> 0 > 32) {
  return;
 }
 if (!(HEAP32[$0 + 52 >> 2] | 0)) {
  HEAP8[($2 << 7) + $1 + ($0 + 68) >> 0] = ($3 | 0) != 0 & 1; //@line 3433
  return;
 }
 $17 = ($2 << 7) + $1 + ($0 + 68) | 0; //@line 3439
 if (($3 | 0) != 1) {
  return;
 }
 HEAP8[$17 >> 0] = HEAP8[$17 >> 0] ^ 1; //@line 3445
 return;
}
function __ZL25default_terminate_handlerv__async_cb_14($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4445
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4447
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4449
 HEAP32[$2 >> 2] = 9209; //@line 4450
 HEAP32[$2 + 4 >> 2] = $4; //@line 4452
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 4454
 _abort_message(9073, $2); //@line 4455
}
function __GLOBAL__sub_I_main_cpp() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4777
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4778
 __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc(9844, 9, 7, 8, 6, 18, 6541); //@line 4779
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 164; //@line 4782
  sp = STACKTOP; //@line 4783
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4786
  return;
 }
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4508
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4510
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 4511
 _fputc(10, $2) | 0; //@line 4512
 if (!___async) {
  ___async_unwind = 0; //@line 4515
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 208; //@line 4517
 sp = STACKTOP; //@line 4518
 return;
}
function __ZN11TextDisplayC2EPKc__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $AsyncRetVal = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6136
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6138
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 6142
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 32 >> 2] = $AsyncRetVal; //@line 6144
 HEAP32[$4 >> 2] = $6; //@line 6145
 _sprintf($AsyncRetVal, 6151, $4) | 0; //@line 6146
 return;
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 497
 $6 = HEAP32[$5 >> 2] | 0; //@line 498
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 499
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 501
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 503
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 506
 return $2 | 0; //@line 507
}
function __ZThn4_N15GraphicsDisplayD1Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4259
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4261
 __ZN4mbed6StreamD2Ev($0 + -4 | 0); //@line 4262
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 146; //@line 4265
  sp = STACKTOP; //@line 4266
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4269
  return;
 }
}
function __ZThn4_N11TextDisplayD1Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4691
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4693
 __ZN4mbed6StreamD2Ev($0 + -4 | 0); //@line 4694
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 161; //@line 4697
  sp = STACKTOP; //@line 4698
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 4701
  return;
 }
}
function _wait($0) {
 $0 = +$0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2891
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2895
 _emscripten_sleep((~~($0 * 1.0e6) | 0) / 1e3 | 0 | 0); //@line 2896
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 116; //@line 2899
  sp = STACKTOP; //@line 2900
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2903
  return;
 }
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5280
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 5283
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 5288
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 5291
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3770
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 3781
  $$0 = 1; //@line 3782
 } else {
  $$0 = 0; //@line 3784
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 3788
 return;
}
function _setvbuf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $4 = 0;
 $4 = $0 + 75 | 0; //@line 819
 HEAP8[$4 >> 0] = -1; //@line 820
 switch ($2 | 0) {
 case 2:
  {
   HEAP32[$0 + 48 >> 2] = 0; //@line 824
   break;
  }
 case 1:
  {
   HEAP8[$4 >> 0] = 10; //@line 828
   break;
  }
 default:
  {}
 }
 HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 64; //@line 836
 return 0; //@line 837
}
function __ZThn4_N6C12832D1Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3485
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3487
 __ZN4mbed6StreamD2Ev($0 + -4 | 0); //@line 3488
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 127; //@line 3491
  sp = STACKTOP; //@line 3492
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3495
  return;
 }
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 1943
 STACKTOP = STACKTOP + 16 | 0; //@line 1944
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1944
 _free($0); //@line 1946
 if (!(_pthread_setspecific(HEAP32[3652] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 1951
  return;
 } else {
  _abort_message(9447, sp); //@line 1953
 }
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 2645
 HEAP32[$0 >> 2] = $1; //@line 2646
 HEAP32[2456] = 1; //@line 2647
 $4 = $0; //@line 2648
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 2653
 $10 = 9828; //@line 2654
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 2656
 HEAP32[$10 + 4 >> 2] = $9; //@line 2659
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 1425
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2910
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2911
 _emscripten_sleep($0 | 0); //@line 2912
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 117; //@line 2915
  sp = STACKTOP; //@line 2916
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2919
  return;
 }
}
function _mbed_trace_default_print($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 234
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 235
 _puts($0) | 0; //@line 236
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 36; //@line 239
  sp = STACKTOP; //@line 240
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 243
  return;
 }
}
function _mbed_error__async_cb_23($0) {
 $0 = $0 | 0;
 var $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5459
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 5460
 ___WFI(); //@line 5461
 if (!___async) {
  ___async_unwind = 0; //@line 5464
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 106; //@line 5466
 sp = STACKTOP; //@line 5467
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 1489
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 1493
  }
 }
 return;
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 11951
 HEAP32[new_frame + 4 >> 2] = sp; //@line 11953
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 11955
 ___async_cur_frame = new_frame; //@line 11956
 return ___async_cur_frame + 8 | 0; //@line 11957
}
function ___WFI() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2603
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2604
 _wait_ms(100); //@line 2605
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 107; //@line 2608
  sp = STACKTOP; //@line 2609
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2612
  return;
 }
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var sp = 0;
 sp = STACKTOP; //@line 1928
 STACKTOP = STACKTOP + 16 | 0; //@line 1929
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1929
 if (!(_pthread_key_create(14608, 217) | 0)) {
  STACKTOP = sp; //@line 1934
  return;
 } else {
  _abort_message(9397, sp); //@line 1936
 }
}
function ___ofl_add($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0;
 $1 = ___ofl_lock() | 0; //@line 9628
 HEAP32[$0 + 56 >> 2] = HEAP32[$1 >> 2]; //@line 9631
 $4 = HEAP32[$1 >> 2] | 0; //@line 9632
 if ($4 | 0) {
  HEAP32[$4 + 52 >> 2] = $0; //@line 9636
 }
 HEAP32[$1 >> 2] = $0; //@line 9638
 ___ofl_unlock(); //@line 9639
 return $0 | 0; //@line 9640
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 11940
  return low << bits; //@line 11941
 }
 tempRet0 = low << bits - 32; //@line 11943
 return 0; //@line 11944
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 4470
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 4474
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 4477
 return;
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 11929
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 11930
 }
 tempRet0 = 0; //@line 11932
 return high >>> bits - 32 | 0; //@line 11933
}
function __ZN11TextDisplay5_putcEi__async_cb_58($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7752
 if ((HEAP32[___async_retval >> 2] | 0) <= (HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP16[HEAP32[$0 + 12 >> 2] >> 1] = 0; //@line 7759
 }
 HEAP32[___async_retval >> 2] = $4; //@line 7762
 return;
}
function __ZN11TextDisplay5_putcEi__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 7628
 if ((HEAP32[___async_retval >> 2] | 0) <= (HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP16[HEAP32[$0 + 12 >> 2] >> 1] = 0; //@line 7635
 }
 HEAP32[___async_retval >> 2] = $4; //@line 7638
 return;
}
function _fflush__async_cb_102($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11072
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 11074
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 11077
 return;
}
function __ZN6C128323clsEv($0) {
 $0 = $0 | 0;
 var $1 = 0;
 $1 = $0 + 68 | 0; //@line 3388
 _memset($1 | 0, 0, 4096) | 0; //@line 3389
 _emscripten_asm_const_iiiii(4, HEAP32[$0 + 4172 >> 2] | 0, HEAP32[$0 + 4176 >> 2] | 0, HEAP32[$0 + 4180 >> 2] | 0, $1 | 0) | 0; //@line 3396
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
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 5304
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 5307
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 5310
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 11267
 } else {
  $$0 = -1; //@line 11269
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 11272
 return;
}
function __ZN4mbed6fdopenEPNS_10FileHandleEPKc__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5410
 if (HEAP32[___async_retval >> 2] | 0) {
  _setbuf($4, 0); //@line 5415
 }
 HEAP32[___async_retval >> 2] = $4; //@line 5418
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 9270
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 9276
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 9280
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 7](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 12220
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 11963
 stackRestore(___async_cur_frame | 0); //@line 11964
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 11965
}
function _fputc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 9281
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 9282
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 9284
 return;
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5428
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 5429
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 5431
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 12699
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 12699
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 12701
 return $1 | 0; //@line 12702
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 2621
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 2627
 _emscripten_asm_const_iii(3, $0 | 0, $1 | 0) | 0; //@line 2628
 return;
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 11680
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 11681
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 11682
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 8617
  $$0 = -1; //@line 8618
 } else {
  $$0 = $0; //@line 8620
 }
 return $$0 | 0; //@line 8622
}
function __ZN6C128326heightEv($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 switch (HEAP32[$0 + 56 >> 2] | 0) {
 case 2:
 case 0:
  {
   $$0 = 128; //@line 3473
   break;
  }
 default:
  {
   $$0 = 32; //@line 3477
  }
 }
 return $$0 | 0; //@line 3480
}
function __ZN6C128325widthEv($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 switch (HEAP32[$0 + 56 >> 2] | 0) {
 case 2:
 case 0:
  {
   $$0 = 32; //@line 3456
   break;
  }
 default:
  {
   $$0 = 128; //@line 3460
  }
 }
 return $$0 | 0; //@line 3463
}
function _freopen__async_cb_112($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11641
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile($4); //@line 11644
 }
 HEAP32[___async_retval >> 2] = $4; //@line 11647
 return;
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 11672
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 11674
}
function __ZN6C128327columnsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / (HEAPU8[(HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 48 >> 2] | 0) + 1 >> 0] | 0 | 0) | 0; //@line 7836
 return;
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 7](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 12213
}
function __ZN6C128324rowsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / (HEAPU8[(HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 48 >> 2] | 0) + 2 >> 0] | 0 | 0) | 0; //@line 9076
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
function __ZN11TextDisplay5claimEP8_IO_FILE__async_cb($0) {
 $0 = $0 | 0;
 _setvbuf(HEAP32[$0 + 4 >> 2] | 0, 0, 1, HEAP32[___async_retval >> 2] | 0) | 0; //@line 9171
 HEAP8[___async_retval >> 0] = 1; //@line 9174
 return;
}
function __ZN6C1283211copy_to_lcdEv($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iiiii(4, HEAP32[$0 + 4172 >> 2] | 0, HEAP32[$0 + 4176 >> 2] | 0, HEAP32[$0 + 4180 >> 2] | 0, $0 + 68 | 0) | 0; //@line 3607
 return;
}
function __ZN6C128326_flushEv($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iiiii(4, HEAP32[$0 + 4172 >> 2] | 0, HEAP32[$0 + 4176 >> 2] | 0, HEAP32[$0 + 4180 >> 2] | 0, $0 + 68 | 0) | 0; //@line 3043
 return;
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 7](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 12206
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 11759
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 11762
 }
 return $$0 | 0; //@line 11764
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 9471
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 9476
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 15](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 12171
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 11909
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 8872
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 8876
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 2899
 return;
}
function __ZN11TextDisplay6locateEii($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 HEAP16[$0 + 24 >> 1] = $1; //@line 4664
 HEAP16[$0 + 26 >> 1] = $2; //@line 4667
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 11970
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 11971
}
function __ZN4mbed6Stream5writeEPKvj__async_cb_55($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[$0 + 4 >> 2] | 0) - (HEAP32[$0 + 8 >> 2] | 0); //@line 7618
 return;
}
function __ZN6C128326locateEii($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 HEAP32[$0 + 60 >> 2] = $1; //@line 3406
 HEAP32[$0 + 64 >> 2] = $2; //@line 3408
 return;
}
function __ZN4mbed6Stream4readEPvj__async_cb_26($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[$0 + 4 >> 2] | 0) - (HEAP32[$0 + 8 >> 2] | 0); //@line 5689
 return;
}
function dynCall_viii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 FUNCTION_TABLE_viii[index & 3](a1 | 0, a2 | 0, a3 | 0); //@line 12199
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN15GraphicsDisplay7columnsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / 8 | 0; //@line 9366
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 9406
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 9408
}
function __ZN15GraphicsDisplay4rowsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / 8 | 0; //@line 10735
 return;
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 2028
 __ZdlPv($0); //@line 2029
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 1711
 __ZdlPv($0); //@line 1712
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 1239
 __ZdlPv($0); //@line 1240
 return;
}
function _out_670($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 if (!(HEAP32[$0 >> 2] & 32)) {
  ___fwritex($1, $2, $0) | 0; //@line 11244
 }
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
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 3704
 return;
}
function dynCall_iii(index, a1, a2) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 return FUNCTION_TABLE_iii[index & 7](a1 | 0, a2 | 0) | 0; //@line 12164
}
function b71(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(7); //@line 12407
}
function b70(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 12404
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 1436
}
function __ZN4mbed10FileHandle5lseekEii__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 9591
 return;
}
function __ZSt15get_new_handlerv() {
 var $0 = 0;
 $0 = HEAP32[3653] | 0; //@line 2801
 HEAP32[3653] = $0 + 0; //@line 2803
 return $0 | 0; //@line 2805
}
function __ZN4mbed10FileHandle5fsyncEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 4390
 return;
}
function __ZN4mbed10FileHandle4tellEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 9086
 return;
}
function __ZN4mbed10FileHandle4flenEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 2876
 return;
}
function __ZSt13get_terminatev() {
 var $0 = 0;
 $0 = HEAP32[450] | 0; //@line 2018
 HEAP32[450] = $0 + 0; //@line 2020
 return $0 | 0; //@line 2022
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_vii(index, a1, a2) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 FUNCTION_TABLE_vii[index & 7](a1 | 0, a2 | 0); //@line 12192
}
function __ZN4mbed10FileHandle4sizeEv__async_cb_106($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 11246
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_10($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 12 >> 2]; //@line 3925
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 11997
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_94($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN6C1283211set_auto_upEj($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + 4168 >> 2] = ($1 | 0) != 0 & 1; //@line 3627
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb_61($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 7910
 return;
}
function b68(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(7); //@line 12401
}
function b67(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(6); //@line 12398
}
function b66(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(5); //@line 12395
}
function b65(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 12392
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _fflush__async_cb_103($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 11087
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 11707
}
function _vsprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 3692
 return;
}
function _sprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 10773
 return;
}
function _snprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 9271
 return;
}
function _fputc__async_cb_85($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 9294
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 31](a1 | 0) | 0; //@line 12157
}
function _putc__async_cb_22($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 5441
 return;
}
function __Znaj__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 3682
 return;
}
function __ZN11TextDisplay10foregroundEt($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP16[$0 + 28 >> 1] = $1; //@line 4676
 return;
}
function __ZN11TextDisplay10backgroundEt($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP16[$0 + 30 >> 1] = $1; //@line 4685
 return;
}
function b25(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(15); //@line 12287
 return 0; //@line 12287
}
function b24(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(14); //@line 12284
 return 0; //@line 12284
}
function b23(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(13); //@line 12281
 return 0; //@line 12281
}
function b22(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(12); //@line 12278
 return 0; //@line 12278
}
function b21(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(11); //@line 12275
 return 0; //@line 12275
}
function b20(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 12272
 return 0; //@line 12272
}
function __ZN4mbed10FileHandle12set_blockingEb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ($1 ? 0 : -25) | 0; //@line 209
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(9500, HEAP32[$0 + 4 >> 2] | 0); //@line 7961
}
function __ZN4mbed8FileBaseD0Ev__async_cb_109($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 11470
 return;
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 255](a1 | 0); //@line 12185
}
function b63(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(7); //@line 12389
}
function b62(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 12386
}
function _setbuf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 _setvbuf($0, $1, $1 | 0 ? 0 : 2, 1024) | 0; //@line 809
 return;
}
function __ZN6C128327setmodeEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + 52 >> 2] = $1; //@line 3616
 return;
}
function __ZThn4_N6C12832D0Ev__async_cb($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 9343
 return;
}
function __ZN4mbed26mbed_set_unbuffered_streamEP8_IO_FILE($0) {
 $0 = $0 | 0;
 _setbuf($0, 0); //@line 2847
 return;
}
function __ZN4mbed6Stream4seekEii($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return 0; //@line 1597
}
function __ZN6C12832D0Ev__async_cb($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 7970
 return;
}
function _freopen__async_cb_110($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 11613
 return;
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 12952
}
function b18(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_iii(7); //@line 12269
 return 0; //@line 12269
}
function b17(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_iii(6); //@line 12266
 return 0; //@line 12266
}
function b16(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_iii(0); //@line 12263
 return 0; //@line 12263
}
function dynCall_i(index) {
 index = index | 0;
 return FUNCTION_TABLE_i[index & 0]() | 0; //@line 12150
}
function __ZN4mbed10FileHandle5sigioENS_8CallbackIFvvEEE($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return;
}
function b60(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_viii(3); //@line 12383
}
function b59(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_viii(0); //@line 12380
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 8202
 return;
}
function __ZNK4mbed10FileHandle4pollEs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return 17; //@line 222
}
function __ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 3](); //@line 12178
}
function b14(p0) {
 p0 = p0 | 0;
 nullFunc_ii(31); //@line 12260
 return 0; //@line 12260
}
function b13(p0) {
 p0 = p0 | 0;
 nullFunc_ii(30); //@line 12257
 return 0; //@line 12257
}
function b12(p0) {
 p0 = p0 | 0;
 nullFunc_ii(29); //@line 12254
 return 0; //@line 12254
}
function b11(p0) {
 p0 = p0 | 0;
 nullFunc_ii(28); //@line 12251
 return 0; //@line 12251
}
function b10(p0) {
 p0 = p0 | 0;
 nullFunc_ii(27); //@line 12248
 return 0; //@line 12248
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 8749
}
function __ZNK4mbed10FileHandle11is_blockingEv($0) {
 $0 = $0 | 0;
 return 1; //@line 215
}
function b9(p0) {
 p0 = p0 | 0;
 nullFunc_ii(26); //@line 12245
 return 0; //@line 12245
}
function b8(p0) {
 p0 = p0 | 0;
 nullFunc_ii(25); //@line 12242
 return 0; //@line 12242
}
function b7(p0) {
 p0 = p0 | 0;
 nullFunc_ii(24); //@line 12239
 return 0; //@line 12239
}
function b6(p0) {
 p0 = p0 | 0;
 nullFunc_ii(23); //@line 12236
 return 0; //@line 12236
}
function b5(p0) {
 p0 = p0 | 0;
 nullFunc_ii(22); //@line 12233
 return 0; //@line 12233
}
function b4(p0) {
 p0 = p0 | 0;
 nullFunc_ii(21); //@line 12230
 return 0; //@line 12230
}
function b3(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 12227
 return 0; //@line 12227
}
function __ZThn4_N15GraphicsDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 4277
}
function __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZThn4_N11TextDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 4709
}
function __ZN4mbed10FileHandle6isattyEv($0) {
 $0 = $0 | 0;
 return 0; //@line 1247
}
function __ZN15GraphicsDisplay9characterEiii__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b57(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(7); //@line 12377
}
function b56(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(6); //@line 12374
}
function b55(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(5); //@line 12371
}
function b54(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(0); //@line 12368
}
function ___ofl_lock() {
 ___lock(14592); //@line 9645
 return 14600; //@line 9646
}
function __ZThn4_N4mbed6StreamD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 1684
}
function __ZN4mbed11NonCopyableINS_10FileHandleEED2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed10FileHandleD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 1234
}
function __ZN15GraphicsDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 3793
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed10FileHandle4syncEv($0) {
 $0 = $0 | 0;
 return 0; //@line 1241
}
function _abort_message__async_cb_16($0) {
 $0 = $0 | 0;
 _abort(); //@line 4525
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
 ___cxa_pure_virtual(); //@line 12293
}
function __ZThn4_N15GraphicsDisplayD1Ev__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Stream6isattyEv($0) {
 $0 = $0 | 0;
 return 0; //@line 1615
}
function __ZN4mbed10FileHandle6rewindEv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN15GraphicsDisplay3clsEv__async_cb_82($0) {
 $0 = $0 | 0;
 return;
}
function __ZN11TextDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 4321
}
function __ZN4mbed6StreamD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 1386
}
function __ZN4mbed6Stream5closeEv($0) {
 $0 = $0 | 0;
 return 0; //@line 1603
}
function __ZThn4_N4mbed6StreamD1Ev__async_cb_15($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Stream4tellEv($0) {
 $0 = $0 | 0;
 return 0; //@line 1621
}
function __ZN4mbed6Stream4syncEv($0) {
 $0 = $0 | 0;
 return 0; //@line 1609
}
function __ZN4mbed6Stream4sizeEv($0) {
 $0 = $0 | 0;
 return 0; //@line 1633
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 12873
}
function __ZN15GraphicsDisplayC2EPKc__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 12879
}
function ___pthread_self_699() {
 return _pthread_self() | 0; //@line 9056
}
function __ZThn4_N11TextDisplayD1Ev__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed8FileBaseD2Ev__async_cb_100($0) {
 $0 = $0 | 0;
 return;
}
function _mbed_trace_default_print__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6StreamC2EPKc__async_cb_64($0) {
 $0 = $0 | 0;
 return;
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 16
}
function __GLOBAL__sub_I_main_cpp__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6StreamD2Ev__async_cb_98($0) {
 $0 = $0 | 0;
 return;
}
function b1() {
 nullFunc_i(0); //@line 12224
 return 0; //@line 12224
}
function _core_util_are_interrupts_enabled() {
 return 1; //@line 2739
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 1065
 return;
}
function _mbed_assert_internal__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZThn4_N6C12832D1Ev__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _handle_interrupt_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
}
function ___ofl_unlock() {
 ___unlock(14592); //@line 9651
 return;
}
function _mbed_error_printf__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN11TextDisplay5_getcEv($0) {
 $0 = $0 | 0;
 return -1;
}
function b52(p0) {
 p0 = p0 | 0;
 nullFunc_vi(255); //@line 12365
}
function b51(p0) {
 p0 = p0 | 0;
 nullFunc_vi(254); //@line 12362
}
function b50(p0) {
 p0 = p0 | 0;
 nullFunc_vi(253); //@line 12359
}
function b49(p0) {
 p0 = p0 | 0;
 nullFunc_vi(252); //@line 12356
}
function b48(p0) {
 p0 = p0 | 0;
 nullFunc_vi(251); //@line 12353
}
function b47(p0) {
 p0 = p0 | 0;
 nullFunc_vi(250); //@line 12350
}
function b46(p0) {
 p0 = p0 | 0;
 nullFunc_vi(249); //@line 12347
}
function b45(p0) {
 p0 = p0 | 0;
 nullFunc_vi(248); //@line 12344
}
function b44(p0) {
 p0 = p0 | 0;
 nullFunc_vi(247); //@line 12341
}
function b43(p0) {
 p0 = p0 | 0;
 nullFunc_vi(246); //@line 12338
}
function b42(p0) {
 p0 = p0 | 0;
 nullFunc_vi(245); //@line 12335
}
function b41(p0) {
 p0 = p0 | 0;
 nullFunc_vi(244); //@line 12332
}
function b40(p0) {
 p0 = p0 | 0;
 nullFunc_vi(243); //@line 12329
}
function b39(p0) {
 p0 = p0 | 0;
 nullFunc_vi(242); //@line 12326
}
function b38(p0) {
 p0 = p0 | 0;
 nullFunc_vi(241); //@line 12323
}
function b37(p0) {
 p0 = p0 | 0;
 nullFunc_vi(240); //@line 12320
}
function b36(p0) {
 p0 = p0 | 0;
 nullFunc_vi(239); //@line 12317
}
function b35(p0) {
 p0 = p0 | 0;
 nullFunc_vi(238); //@line 12314
}
function b34(p0) {
 p0 = p0 | 0;
 nullFunc_vi(237); //@line 12311
}
function b33(p0) {
 p0 = p0 | 0;
 nullFunc_vi(236); //@line 12308
}
function b32(p0) {
 p0 = p0 | 0;
 nullFunc_vi(235); //@line 12305
}
function b31(p0) {
 p0 = p0 | 0;
 nullFunc_vi(234); //@line 12302
}
function b30(p0) {
 p0 = p0 | 0;
 nullFunc_vi(233); //@line 12299
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 8633
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 9062
}
function b29(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 12296
}
function __ZN4mbed6Stream6unlockEv($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Stream6rewindEv($0) {
 $0 = $0 | 0;
 return;
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___clang_call_terminate__async_cb($0) {
 $0 = $0 | 0;
}
function _core_util_is_isr_active() {
 return 0; //@line 2744
}
function __ZN4mbed6Stream4lockEv($0) {
 $0 = $0 | 0;
 return;
}
function _serial_putc__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _mbed_tracef__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _exit__async_cb($0) {
 $0 = $0 | 0;
 while (1) {}
}
function ___errno_location() {
 return 14588; //@line 8627
}
function __ZSt9terminatev__async_cb_87($0) {
 $0 = $0 | 0;
}
function __ZNSt9type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function getTempRet0() {
 return tempRet0 | 0; //@line 42
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
function ___WFI__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _wait__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _pthread_self() {
 return 1432; //@line 8754
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function _mbed_error__async_cb($0) {
 $0 = $0 | 0;
}
function setAsync() {
 ___async = 1; //@line 26
}
function b27() {
 nullFunc_v(0); //@line 12290
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_i = [b1];
var FUNCTION_TABLE_ii = [b3,__ZN4mbed10FileHandle4syncEv,__ZN4mbed10FileHandle6isattyEv,__ZN4mbed10FileHandle4tellEv,__ZN4mbed10FileHandle4sizeEv,__ZN4mbed10FileHandle5fsyncEv,__ZN4mbed10FileHandle4flenEv,__ZNK4mbed10FileHandle11is_blockingEv,__ZN4mbed6Stream5closeEv,__ZN4mbed6Stream4syncEv,__ZN4mbed6Stream6isattyEv,__ZN4mbed6Stream4tellEv,__ZN4mbed6Stream4sizeEv,__ZN11TextDisplay5_getcEv,__ZN6C128324rowsEv,__ZN6C128327columnsEv,__ZN6C128325widthEv,__ZN6C128326heightEv,__ZN15GraphicsDisplay4rowsEv,__ZN15GraphicsDisplay7columnsEv,___stdio_close,b4,b5,b6,b7,b8,b9,b10,b11
,b12,b13,b14];
var FUNCTION_TABLE_iii = [b16,__ZN4mbed10FileHandle12set_blockingEb,__ZNK4mbed10FileHandle4pollEs,__ZN6C128325_putcEi,__ZN11TextDisplay5claimEP8_IO_FILE,__ZN11TextDisplay5_putcEi,b17,b18];
var FUNCTION_TABLE_iiii = [b20,__ZN4mbed10FileHandle5lseekEii,__ZN4mbed6Stream4readEPvj,__ZN4mbed6Stream5writeEPKvj,__ZN4mbed6Stream4seekEii,___stdio_write,___stdio_seek,___stdout_write,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,___stdio_read,b21,b22,b23,b24,b25];
var FUNCTION_TABLE_v = [b27,___cxa_pure_virtual__wrapper,__ZL25default_terminate_handlerv,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev];
var FUNCTION_TABLE_vi = [b29,_mbed_trace_default_print,__ZN4mbed8FileBaseD2Ev,__ZN4mbed8FileBaseD0Ev,__ZN4mbed11NonCopyableINS_10FileHandleEED2Ev,__ZN4mbed10FileHandleD0Ev,__ZN4mbed10FileHandle6rewindEv,__ZN4mbed6StreamD2Ev,__ZN4mbed6StreamD0Ev,__ZN4mbed6Stream6rewindEv,__ZN4mbed6Stream4lockEv,__ZN4mbed6Stream6unlockEv,__ZThn4_N4mbed6StreamD1Ev,__ZThn4_N4mbed6StreamD0Ev,__ZN6C12832D0Ev,__ZN6C128326_flushEv,__ZN6C128323clsEv,__ZThn4_N6C12832D1Ev,__ZThn4_N6C12832D0Ev,__ZN15GraphicsDisplayD0Ev,__ZN15GraphicsDisplay3clsEv,__ZThn4_N15GraphicsDisplayD1Ev,__ZThn4_N15GraphicsDisplayD0Ev,__ZN11TextDisplayD0Ev,__ZN11TextDisplay3clsEv,__ZThn4_N11TextDisplayD1Ev,__ZThn4_N11TextDisplayD0Ev,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev
,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN4mbed10FileHandle5lseekEii__async_cb,__ZN4mbed10FileHandle5fsyncEv__async_cb,__ZN4mbed10FileHandle4flenEv__async_cb,_mbed_trace_default_print__async_cb,_mbed_tracef__async_cb,_mbed_vtracef__async_cb,_mbed_vtracef__async_cb_53,_mbed_vtracef__async_cb_43,_mbed_vtracef__async_cb_44,_mbed_vtracef__async_cb_45,_mbed_vtracef__async_cb_52,_mbed_vtracef__async_cb_46,_mbed_vtracef__async_cb_51,_mbed_vtracef__async_cb_47,_mbed_vtracef__async_cb_48,_mbed_vtracef__async_cb_49,_mbed_vtracef__async_cb_50,__ZN4mbed8FileBaseD2Ev__async_cb_99,__ZN4mbed8FileBaseD2Ev__async_cb,__ZN4mbed8FileBaseD2Ev__async_cb_100,__ZN4mbed8FileBaseD0Ev__async_cb_108,__ZN4mbed8FileBaseD0Ev__async_cb,__ZN4mbed8FileBaseD0Ev__async_cb_109,__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb_84,__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb,__ZN4mbed10FileHandle4tellEv__async_cb
,__ZN4mbed10FileHandle6rewindEv__async_cb,__ZN4mbed10FileHandle4sizeEv__async_cb,__ZN4mbed10FileHandle4sizeEv__async_cb_105,__ZN4mbed10FileHandle4sizeEv__async_cb_106,__ZN4mbed6StreamD2Ev__async_cb,__ZN4mbed6StreamD2Ev__async_cb_98,__ZN4mbed6Stream4readEPvj__async_cb,__ZN4mbed6Stream4readEPvj__async_cb_25,__ZN4mbed6Stream4readEPvj__async_cb_26,__ZN4mbed6Stream5writeEPKvj__async_cb,__ZN4mbed6Stream5writeEPKvj__async_cb_54,__ZN4mbed6Stream5writeEPKvj__async_cb_55,__ZThn4_N4mbed6StreamD1Ev__async_cb,__ZThn4_N4mbed6StreamD1Ev__async_cb_15,__ZN4mbed6StreamC2EPKc__async_cb_63,__ZN4mbed6StreamC2EPKc__async_cb,__ZN4mbed6StreamC2EPKc__async_cb_64,__ZN4mbed6Stream4putcEi__async_cb,__ZN4mbed6Stream4putcEi__async_cb_62,__ZN4mbed6Stream4putcEi__async_cb_60,__ZN4mbed6Stream4putcEi__async_cb_61,__ZN4mbed6Stream6printfEPKcz__async_cb,__ZN4mbed6Stream6printfEPKcz__async_cb_12,__ZN4mbed6Stream6printfEPKcz__async_cb_9,__ZN4mbed6Stream6printfEPKcz__async_cb_10,__ZN4mbed6Stream6printfEPKcz__async_cb_11,_mbed_assert_internal__async_cb,_mbed_die__async_cb_41,_mbed_die__async_cb_40,_mbed_die__async_cb_39
,_mbed_die__async_cb_38,_mbed_die__async_cb_37,_mbed_die__async_cb_36,_mbed_die__async_cb_35,_mbed_die__async_cb_34,_mbed_die__async_cb_33,_mbed_die__async_cb_32,_mbed_die__async_cb_31,_mbed_die__async_cb_30,_mbed_die__async_cb_29,_mbed_die__async_cb_28,_mbed_die__async_cb_27,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_vfprintf__async_cb,_mbed_error_vfprintf__async_cb_19,_mbed_error_vfprintf__async_cb_18,_mbed_error__async_cb_23,___WFI__async_cb,_serial_putc__async_cb_24,_serial_putc__async_cb,_invoke_ticker__async_cb_2,_invoke_ticker__async_cb,__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb_59,__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb,_exit__async_cb,__ZN4mbed6fdopenEPNS_10FileHandleEPKc__async_cb,_wait__async_cb,_wait_ms__async_cb,__ZN6C12832D0Ev__async_cb
,__ZN6C128325_putcEi__async_cb,__ZN6C128325_putcEi__async_cb_65,__ZN6C128329characterEiii__async_cb,__ZN6C128329characterEiii__async_cb_95,__ZN6C128329characterEiii__async_cb_96,__ZN6C128329characterEiii__async_cb_97,__ZN6C128324rowsEv__async_cb,__ZN6C128327columnsEv__async_cb,__ZThn4_N6C12832D1Ev__async_cb,__ZThn4_N6C12832D0Ev__async_cb,__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_66,__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb,__ZN6C128328print_bmE6Bitmapii__async_cb,__ZN6C128328print_bmE6Bitmapii__async_cb_20,__ZN15GraphicsDisplay9characterEiii__async_cb,__ZN15GraphicsDisplay4rowsEv__async_cb,__ZN15GraphicsDisplay7columnsEv__async_cb,__ZN15GraphicsDisplay3clsEv__async_cb,__ZN15GraphicsDisplay3clsEv__async_cb_81,__ZN15GraphicsDisplay3clsEv__async_cb_82,__ZN15GraphicsDisplay4putpEi__async_cb,__ZN15GraphicsDisplay4fillEiiiii__async_cb,__ZN15GraphicsDisplay4fillEiiiii__async_cb_21,__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb,__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb_17,__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb,__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb_7,__ZThn4_N15GraphicsDisplayD1Ev__async_cb,__ZN15GraphicsDisplayC2EPKc__async_cb_86,__ZN15GraphicsDisplayC2EPKc__async_cb
,__ZN11TextDisplay5_putcEi__async_cb,__ZN11TextDisplay5_putcEi__async_cb_56,__ZN11TextDisplay5_putcEi__async_cb_57,__ZN11TextDisplay5_putcEi__async_cb_58,__ZN11TextDisplay5claimEP8_IO_FILE__async_cb_83,__ZN11TextDisplay5claimEP8_IO_FILE__async_cb,__ZN11TextDisplay3clsEv__async_cb,__ZN11TextDisplay3clsEv__async_cb_88,__ZN11TextDisplay3clsEv__async_cb_89,__ZN11TextDisplay3clsEv__async_cb_92,__ZN11TextDisplay3clsEv__async_cb_90,__ZN11TextDisplay3clsEv__async_cb_91,__ZThn4_N11TextDisplayD1Ev__async_cb,__ZN11TextDisplayC2EPKc__async_cb_42,__ZN11TextDisplayC2EPKc__async_cb,__GLOBAL__sub_I_main_cpp__async_cb,_main__async_cb_68,_main__async_cb_67,_main__async_cb_76,_main__async_cb_75,_main__async_cb_80,_main__async_cb_74,_main__async_cb_73,_main__async_cb_79,_main__async_cb_72,_main__async_cb_71,_main__async_cb_78,_main__async_cb_70,_main__async_cb_69,_main__async_cb_77
,_main__async_cb,_putc__async_cb_22,_putc__async_cb,___overflow__async_cb,_fclose__async_cb_107,_fclose__async_cb,_fflush__async_cb_103,_fflush__async_cb_102,_fflush__async_cb_104,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_93,_vfprintf__async_cb,_snprintf__async_cb,_vsnprintf__async_cb,_sprintf__async_cb,_vsprintf__async_cb,_freopen__async_cb,_freopen__async_cb_112,_freopen__async_cb_111,_freopen__async_cb_110,_fputc__async_cb_85,_fputc__async_cb,_puts__async_cb,__Znwj__async_cb,__Znaj__async_cb,__ZL25default_terminate_handlerv__async_cb,__ZL25default_terminate_handlerv__async_cb_14,_abort_message__async_cb,_abort_message__async_cb_16
,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_8,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_1,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_94,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_13,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_6,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_5,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_4,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_3,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_101,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b30,b31,b32,b33,b34,b35
,b36,b37,b38,b39,b40,b41,b42,b43,b44,b45,b46,b47,b48,b49,b50,b51,b52];
var FUNCTION_TABLE_vii = [b54,__ZN4mbed10FileHandle5sigioENS_8CallbackIFvvEEE,__ZN11TextDisplay10foregroundEt,__ZN11TextDisplay10backgroundEt,__ZN15GraphicsDisplay4putpEi,b55,b56,b57];
var FUNCTION_TABLE_viii = [b59,__ZN6C128326locateEii,__ZN11TextDisplay6locateEii,b60];
var FUNCTION_TABLE_viiii = [b62,__ZN6C128329characterEiii,__ZN6C128325pixelEiii,__ZN15GraphicsDisplay9characterEiii,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b63];
var FUNCTION_TABLE_viiiii = [b65,__ZN15GraphicsDisplay6windowEiiii,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b66,b67,b68];
var FUNCTION_TABLE_viiiiii = [b70,__ZN15GraphicsDisplay4fillEiiiii,__ZN15GraphicsDisplay4blitEiiiiPKi,__ZN15GraphicsDisplay7blitbitEiiiiPKc,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b71];

  return { __GLOBAL__sub_I_main_cpp: __GLOBAL__sub_I_main_cpp, ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _fflush: _fflush, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _handle_lora_downlink: _handle_lora_downlink, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _invoke_ticker: _invoke_ticker, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_i: dynCall_i, dynCall_ii: dynCall_ii, dynCall_iii: dynCall_iii, dynCall_iiii: dynCall_iiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_viii: dynCall_viii, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
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
var dynCall_iii = Module["dynCall_iii"] = asm["dynCall_iii"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
var dynCall_viii = Module["dynCall_viii"] = asm["dynCall_viii"];
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
    var flush = Module['_fflush'];
    if (flush) flush(0);
    // also flush in the JS FS layer
    var hasFS = true;
    if (hasFS) {
      ['stdout', 'stderr'].forEach(function(name) {
        var info = FS.analyzePath('/dev/' + name);
        if (!info) return;
        var stream = info.object;
        var rdev = stream.rdev;
        var tty = TTY.ttys[rdev];
        if (tty && tty.output && tty.output.length) {
          has = true;
        }
      });
    }
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






//# sourceMappingURL=lcd.js.map
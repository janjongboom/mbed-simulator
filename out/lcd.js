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

var ASM_CONSTS = [function($0, $1, $2, $3) { window.MbedJSHal.C12832.update_display($0, $1, $2, new Uint8Array(Module.HEAPU8.buffer, $3, 4096)); },
 function($0, $1, $2) { window.MbedJSHal.C12832.init($0, $1, $2); },
 function($0) { console.log("TextDisplay putc", $0); },
 function($0, $1) { MbedJSHal.gpio.write($0, $1); },
 function($0, $1) { MbedJSHal.gpio.init_out($0, $1, 0); }];

function _emscripten_asm_const_iii(code, a0, a1) {
  return ASM_CONSTS[code](a0, a1);
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

STATICTOP = STATIC_BASE + 14688;
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



var debug_table_ii = ["0", "__ZN4mbed6Stream5closeEv", "__ZN4mbed6Stream4syncEv", "__ZN4mbed6Stream6isattyEv", "__ZN4mbed6Stream4tellEv", "__ZN4mbed6Stream4sizeEv", "__ZN4mbed10FileHandle5fsyncEv", "__ZN4mbed10FileHandle4flenEv", "__ZN11TextDisplay5_getcEv", "__ZN6C128324rowsEv", "__ZN6C128327columnsEv", "__ZN6C128325widthEv", "__ZN6C128326heightEv", "__ZN15GraphicsDisplay4rowsEv", "__ZN15GraphicsDisplay7columnsEv", "__ZN4mbed10FileHandle4syncEv", "__ZN4mbed10FileHandle6isattyEv", "__ZN4mbed10FileHandle4tellEv", "__ZN4mbed10FileHandle4sizeEv", "___stdio_close", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
var debug_table_iii = ["0", "__ZN4mbed10FileHandle12set_blockingEb", "__ZNK4mbed10FileHandle4pollEs", "__ZN6C128325_putcEi", "__ZN11TextDisplay5claimEP8_IO_FILE", "__ZN11TextDisplay5_putcEi", "0", "0"];
var debug_table_iiii = ["0", "__ZN4mbed6Stream4readEPvj", "__ZN4mbed6Stream5writeEPKvj", "__ZN4mbed6Stream4seekEii", "__ZN4mbed10FileHandle5lseekEii", "___stdio_write", "___stdio_seek", "___stdout_write", "_sn_write", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv", "___stdio_read", "0", "0", "0", "0", "0"];
var debug_table_v = ["0", "___cxa_pure_virtual", "__ZL25default_terminate_handlerv", "__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev"];
var debug_table_vi = ["0", "__ZN4mbed6StreamD2Ev", "__ZN6C12832D0Ev", "__ZN4mbed6Stream6rewindEv", "__ZN6C128326_flushEv", "__ZN4mbed6Stream4lockEv", "__ZN4mbed6Stream6unlockEv", "__ZN6C128323clsEv", "__ZThn4_N6C12832D1Ev", "__ZThn4_N6C12832D0Ev", "__ZN15GraphicsDisplayD0Ev", "__ZN15GraphicsDisplay3clsEv", "__ZThn4_N15GraphicsDisplayD1Ev", "__ZThn4_N15GraphicsDisplayD0Ev", "__ZN11TextDisplayD0Ev", "__ZN11TextDisplay3clsEv", "__ZThn4_N11TextDisplayD1Ev", "__ZThn4_N11TextDisplayD0Ev", "__ZN4mbed8FileBaseD2Ev", "__ZN4mbed8FileBaseD0Ev", "__ZN4mbed11NonCopyableINS_10FileHandleEED2Ev", "__ZN4mbed10FileHandleD0Ev", "__ZN4mbed10FileHandle6rewindEv", "__ZN4mbed6StreamD0Ev", "__ZThn4_N4mbed6StreamD1Ev", "__ZThn4_N4mbed6StreamD0Ev", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "__ZN10__cxxabiv121__vmi_class_type_infoD0Ev", "__ZN6C12832D0Ev__async_cb", "__ZN4mbed10FileHandle5lseekEii__async_cb", "__ZN4mbed10FileHandle5fsyncEv__async_cb", "__ZN4mbed10FileHandle4flenEv__async_cb", "__ZN6C128325_putcEi__async_cb", "__ZN6C128325_putcEi__async_cb_90", "__ZN6C128329characterEiii__async_cb", "__ZN6C128329characterEiii__async_cb_18", "__ZN6C128329characterEiii__async_cb_19", "__ZN6C128329characterEiii__async_cb_20", "__ZN6C128324rowsEv__async_cb", "__ZN6C128327columnsEv__async_cb", "__ZThn4_N6C12832D1Ev__async_cb", "__ZThn4_N6C12832D0Ev__async_cb", "__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_91", "__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb", "__ZN6C128328print_bmE6Bitmapii__async_cb", "__ZN6C128328print_bmE6Bitmapii__async_cb_65", "__ZN15GraphicsDisplay9characterEiii__async_cb", "__ZN15GraphicsDisplay4rowsEv__async_cb", "__ZN15GraphicsDisplay7columnsEv__async_cb", "__ZN15GraphicsDisplay3clsEv__async_cb", "__ZN15GraphicsDisplay3clsEv__async_cb_2", "__ZN15GraphicsDisplay3clsEv__async_cb_3", "__ZN15GraphicsDisplay4putpEi__async_cb", "__ZN15GraphicsDisplay4fillEiiiii__async_cb", "__ZN15GraphicsDisplay4fillEiiiii__async_cb_32", "__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb", "__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb_95", "__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb", "__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb_79", "__ZThn4_N15GraphicsDisplayD1Ev__async_cb", "__ZN15GraphicsDisplayC2EPKc__async_cb_21", "__ZN15GraphicsDisplayC2EPKc__async_cb", "__ZN11TextDisplay5_putcEi__async_cb", "__ZN11TextDisplay5_putcEi__async_cb_70", "__ZN11TextDisplay5_putcEi__async_cb_71", "__ZN11TextDisplay5_putcEi__async_cb_72", "__ZN11TextDisplay5claimEP8_IO_FILE__async_cb_94", "__ZN11TextDisplay5claimEP8_IO_FILE__async_cb", "__ZN11TextDisplay3clsEv__async_cb", "__ZN11TextDisplay3clsEv__async_cb_80", "__ZN11TextDisplay3clsEv__async_cb_81", "__ZN11TextDisplay3clsEv__async_cb_84", "__ZN11TextDisplay3clsEv__async_cb_82", "__ZN11TextDisplay3clsEv__async_cb_83", "__ZThn4_N11TextDisplayD1Ev__async_cb", "__ZN11TextDisplayC2EPKc__async_cb_78", "__ZN11TextDisplayC2EPKc__async_cb", "__ZN4mbed8FileBaseD2Ev__async_cb_74", "__ZN4mbed8FileBaseD2Ev__async_cb", "__ZN4mbed8FileBaseD2Ev__async_cb_75", "__ZN4mbed8FileBaseD0Ev__async_cb_68", "__ZN4mbed8FileBaseD0Ev__async_cb", "__ZN4mbed8FileBaseD0Ev__async_cb_69", "__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb_14", "__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb", "__ZN4mbed10FileHandle4tellEv__async_cb", "__ZN4mbed10FileHandle6rewindEv__async_cb", "__ZN4mbed10FileHandle4sizeEv__async_cb", "__ZN4mbed10FileHandle4sizeEv__async_cb_22", "__ZN4mbed10FileHandle4sizeEv__async_cb_23", "__ZN4mbed6StreamD2Ev__async_cb", "__ZN4mbed6StreamD2Ev__async_cb_67", "__ZN4mbed6Stream4readEPvj__async_cb", "__ZN4mbed6Stream4readEPvj__async_cb_15", "__ZN4mbed6Stream4readEPvj__async_cb_16", "__ZN4mbed6Stream5writeEPKvj__async_cb", "__ZN4mbed6Stream5writeEPKvj__async_cb_8", "__ZN4mbed6Stream5writeEPKvj__async_cb_9", "__ZThn4_N4mbed6StreamD1Ev__async_cb", "__ZThn4_N4mbed6StreamD1Ev__async_cb_13", "__ZN4mbed6StreamC2EPKc__async_cb_5", "__ZN4mbed6StreamC2EPKc__async_cb", "__ZN4mbed6Stream4putcEi__async_cb", "__ZN4mbed6Stream4putcEi__async_cb_12", "__ZN4mbed6Stream4putcEi__async_cb_10", "__ZN4mbed6Stream4putcEi__async_cb_11", "__ZN4mbed6Stream6printfEPKcz__async_cb", "__ZN4mbed6Stream6printfEPKcz__async_cb_27", "__ZN4mbed6Stream6printfEPKcz__async_cb_24", "__ZN4mbed6Stream6printfEPKcz__async_cb_25", "__ZN4mbed6Stream6printfEPKcz__async_cb_26", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_64", "_mbed_die__async_cb_63", "_mbed_die__async_cb_62", "_mbed_die__async_cb_61", "_mbed_die__async_cb_60", "_mbed_die__async_cb_59", "_mbed_die__async_cb_58", "_mbed_die__async_cb_57", "_mbed_die__async_cb_56", "_mbed_die__async_cb_55", "_mbed_die__async_cb_54", "_mbed_die__async_cb_53", "_mbed_die__async_cb_52", "_mbed_die__async_cb_51", "_mbed_die__async_cb_50", "_mbed_die__async_cb", "_invoke_ticker__async_cb_92", "_invoke_ticker__async_cb", "__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb_85", "__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb", "_exit__async_cb", "__ZN4mbed6fdopenEPNS_10FileHandleEPKc__async_cb", "_wait__async_cb", "_wait_ms__async_cb", "__GLOBAL__sub_I_main_cpp__async_cb", "_main__async_cb_34", "_main__async_cb_33", "_main__async_cb_42", "_main__async_cb_41", "_main__async_cb_46", "_main__async_cb_40", "_main__async_cb_39", "_main__async_cb_45", "_main__async_cb_38", "_main__async_cb_37", "_main__async_cb_44", "_main__async_cb_36", "_main__async_cb_35", "_main__async_cb_43", "_main__async_cb", "___overflow__async_cb", "_fclose__async_cb_66", "_fclose__async_cb", "_fflush__async_cb_48", "_fflush__async_cb_47", "_fflush__async_cb_49", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_93", "_vfprintf__async_cb", "_vsnprintf__async_cb", "_sprintf__async_cb", "_vsprintf__async_cb", "_freopen__async_cb", "_freopen__async_cb_30", "_freopen__async_cb_29", "_freopen__async_cb_28", "_fputc__async_cb_17", "_fputc__async_cb", "_puts__async_cb", "__Znwj__async_cb", "__Znaj__async_cb", "__ZL25default_terminate_handlerv__async_cb", "__ZL25default_terminate_handlerv__async_cb_76", "_abort_message__async_cb", "_abort_message__async_cb_6", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_4", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_7", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_73", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv", "__ZSt11__terminatePFvvE__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_1", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_89", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_88", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_87", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_86", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_77", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
var debug_table_vii = ["0", "__ZN4mbed10FileHandle5sigioENS_8CallbackIFvvEEE", "__ZN11TextDisplay10foregroundEt", "__ZN11TextDisplay10backgroundEt", "__ZN15GraphicsDisplay4putpEi", "0", "0", "0"];
var debug_table_viii = ["0", "__ZN6C128326locateEii", "__ZN11TextDisplay6locateEii", "0"];
var debug_table_viiii = ["0", "__ZN6C128329characterEiii", "__ZN6C128325pixelEiii", "__ZN15GraphicsDisplay9characterEiii", "__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "0"];
var debug_table_viiiii = ["0", "__ZN15GraphicsDisplay6windowEiiii", "__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "0", "0", "0"];
var debug_table_viiiiii = ["0", "__ZN15GraphicsDisplay4fillEiiiii", "__ZN15GraphicsDisplay4blitEiiiiPKi", "__ZN15GraphicsDisplay7blitbitEiiiiPKc", "__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "0"];
function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: iii: " + debug_table_iii[x] + "  iiii: " + debug_table_iiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viii: " + debug_table_viii[x] + "  v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  "); abort(x) }

function nullFunc_iii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'iii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  viii: " + debug_table_viii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  v: " + debug_table_v[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  "); abort(x) }

function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: iii: " + debug_table_iii[x] + "  ii: " + debug_table_ii[x] + "  viii: " + debug_table_viii[x] + "  viiii: " + debug_table_viiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  "); abort(x) }

function nullFunc_v(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  vii: " + debug_table_vii[x] + "  viii: " + debug_table_viii[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  ii: " + debug_table_ii[x] + "  iii: " + debug_table_iii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: v: " + debug_table_v[x] + "  vii: " + debug_table_vii[x] + "  viii: " + debug_table_viii[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  ii: " + debug_table_ii[x] + "  iii: " + debug_table_iii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_vii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'vii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  viii: " + debug_table_viii[x] + "  v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  ii: " + debug_table_ii[x] + "  iii: " + debug_table_iii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_viii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiii: " + debug_table_viiii[x] + "  v: " + debug_table_v[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  iii: " + debug_table_iii[x] + "  ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_viiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viii: " + debug_table_viii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  iii: " + debug_table_iii[x] + "  ii: " + debug_table_ii[x] + "  "); abort(x) }

function nullFunc_viiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viii: " + debug_table_viii[x] + "  viiii: " + debug_table_viiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  iii: " + debug_table_iii[x] + "  ii: " + debug_table_ii[x] + "  "); abort(x) }

function nullFunc_viiiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viii: " + debug_table_viii[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  vii: " + debug_table_vii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  iii: " + debug_table_iii[x] + "  ii: " + debug_table_ii[x] + "  "); abort(x) }

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

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_ii": nullFunc_ii, "nullFunc_iii": nullFunc_iii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_v": nullFunc_v, "nullFunc_vi": nullFunc_vi, "nullFunc_vii": nullFunc_vii, "nullFunc_viii": nullFunc_viii, "nullFunc_viiii": nullFunc_viiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "invoke_ii": invoke_ii, "invoke_iii": invoke_iii, "invoke_iiii": invoke_iiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_viii": invoke_viii, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "___cxa_begin_catch": ___cxa_begin_catch, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "___cxa_pure_virtual": ___cxa_pure_virtual, "___gxx_personality_v0": ___gxx_personality_v0, "___lock": ___lock, "___resumeException": ___resumeException, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall145": ___syscall145, "___syscall146": ___syscall146, "___syscall221": ___syscall221, "___syscall330": ___syscall330, "___syscall5": ___syscall5, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___syscall63": ___syscall63, "___unlock": ___unlock, "_abort": _abort, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_asm_const_iiii": _emscripten_asm_const_iiii, "_emscripten_asm_const_iiiii": _emscripten_asm_const_iiiii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "_llvm_trap": _llvm_trap, "_pthread_getspecific": _pthread_getspecific, "_pthread_key_create": _pthread_key_create, "_pthread_once": _pthread_once, "_pthread_setspecific": _pthread_setspecific, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
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
  var _emscripten_asm_const_ii=env._emscripten_asm_const_ii;
  var _emscripten_asm_const_iii=env._emscripten_asm_const_iii;
  var _emscripten_asm_const_iiii=env._emscripten_asm_const_iiii;
  var _emscripten_asm_const_iiiii=env._emscripten_asm_const_iiiii;
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
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS
function _malloc($0) {
 $0 = $0 | 0;
 var $$$0192$i = 0, $$$0193$i = 0, $$$4351$i = 0, $$$i = 0, $$0 = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i17$i = 0, $$0189$i = 0, $$0192$lcssa$i = 0, $$01926$i = 0, $$0193$lcssa$i = 0, $$01935$i = 0, $$0197 = 0, $$0199 = 0, $$0206$i$i = 0, $$0207$i$i = 0, $$0211$i$i = 0, $$0212$i$i = 0, $$024367$i = 0, $$0287$i$i = 0, $$0288$i$i = 0, $$0289$i$i = 0, $$0295$i$i = 0, $$0296$i$i = 0, $$0342$i = 0, $$0344$i = 0, $$0345$i = 0, $$0347$i = 0, $$0353$i = 0, $$0358$i = 0, $$0359$i = 0, $$0361$i = 0, $$0362$i = 0, $$0368$i = 0, $$1196$i = 0, $$1198$i = 0, $$124466$i = 0, $$1291$i$i = 0, $$1293$i$i = 0, $$1343$i = 0, $$1348$i = 0, $$1363$i = 0, $$1370$i = 0, $$1374$i = 0, $$2234243136$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2355$i = 0, $$3$i = 0, $$3$i$i = 0, $$3$i203 = 0, $$3350$i = 0, $$3372$i = 0, $$4$lcssa$i = 0, $$4$ph$i = 0, $$414$i = 0, $$4236$i = 0, $$4351$lcssa$i = 0, $$435113$i = 0, $$4357$$4$i = 0, $$4357$ph$i = 0, $$435712$i = 0, $$723947$i = 0, $$748$i = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i19$iZ2D = 0, $$pre$phi$i211Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phi11$i$iZ2D = 0, $$pre$phiZ2D = 0, $1 = 0, $1004 = 0, $101 = 0, $1010 = 0, $1013 = 0, $1014 = 0, $102 = 0, $1032 = 0, $1034 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1052 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $108 = 0, $112 = 0, $114 = 0, $115 = 0, $117 = 0, $119 = 0, $121 = 0, $123 = 0, $125 = 0, $127 = 0, $129 = 0, $134 = 0, $138 = 0, $14 = 0, $143 = 0, $146 = 0, $149 = 0, $150 = 0, $157 = 0, $159 = 0, $16 = 0, $162 = 0, $164 = 0, $167 = 0, $169 = 0, $17 = 0, $172 = 0, $175 = 0, $176 = 0, $178 = 0, $179 = 0, $18 = 0, $181 = 0, $182 = 0, $184 = 0, $185 = 0, $19 = 0, $190 = 0, $191 = 0, $20 = 0, $204 = 0, $208 = 0, $214 = 0, $221 = 0, $225 = 0, $234 = 0, $235 = 0, $237 = 0, $238 = 0, $242 = 0, $243 = 0, $251 = 0, $252 = 0, $253 = 0, $255 = 0, $256 = 0, $261 = 0, $262 = 0, $265 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $282 = 0, $292 = 0, $296 = 0, $30 = 0, $302 = 0, $306 = 0, $309 = 0, $313 = 0, $315 = 0, $316 = 0, $318 = 0, $320 = 0, $322 = 0, $324 = 0, $326 = 0, $328 = 0, $330 = 0, $34 = 0, $340 = 0, $341 = 0, $352 = 0, $354 = 0, $357 = 0, $359 = 0, $362 = 0, $364 = 0, $367 = 0, $37 = 0, $370 = 0, $371 = 0, $373 = 0, $374 = 0, $376 = 0, $377 = 0, $379 = 0, $380 = 0, $385 = 0, $386 = 0, $391 = 0, $399 = 0, $403 = 0, $409 = 0, $41 = 0, $416 = 0, $420 = 0, $428 = 0, $431 = 0, $432 = 0, $433 = 0, $437 = 0, $438 = 0, $44 = 0, $444 = 0, $449 = 0, $450 = 0, $453 = 0, $455 = 0, $458 = 0, $463 = 0, $469 = 0, $47 = 0, $471 = 0, $473 = 0, $475 = 0, $49 = 0, $492 = 0, $494 = 0, $50 = 0, $501 = 0, $502 = 0, $503 = 0, $512 = 0, $514 = 0, $515 = 0, $517 = 0, $52 = 0, $526 = 0, $530 = 0, $532 = 0, $533 = 0, $534 = 0, $54 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $550 = 0, $552 = 0, $554 = 0, $555 = 0, $56 = 0, $561 = 0, $563 = 0, $565 = 0, $570 = 0, $572 = 0, $574 = 0, $575 = 0, $576 = 0, $58 = 0, $584 = 0, $585 = 0, $588 = 0, $592 = 0, $595 = 0, $597 = 0, $6 = 0, $60 = 0, $603 = 0, $607 = 0, $611 = 0, $62 = 0, $620 = 0, $621 = 0, $627 = 0, $629 = 0, $633 = 0, $636 = 0, $638 = 0, $64 = 0, $642 = 0, $644 = 0, $649 = 0, $650 = 0, $651 = 0, $657 = 0, $658 = 0, $659 = 0, $663 = 0, $67 = 0, $673 = 0, $675 = 0, $680 = 0, $681 = 0, $682 = 0, $688 = 0, $69 = 0, $690 = 0, $694 = 0, $7 = 0, $70 = 0, $700 = 0, $704 = 0, $71 = 0, $710 = 0, $712 = 0, $718 = 0, $72 = 0, $722 = 0, $723 = 0, $728 = 0, $73 = 0, $734 = 0, $739 = 0, $742 = 0, $743 = 0, $746 = 0, $748 = 0, $750 = 0, $753 = 0, $764 = 0, $769 = 0, $77 = 0, $771 = 0, $774 = 0, $776 = 0, $779 = 0, $782 = 0, $783 = 0, $784 = 0, $786 = 0, $788 = 0, $789 = 0, $791 = 0, $792 = 0, $797 = 0, $798 = 0, $8 = 0, $80 = 0, $812 = 0, $815 = 0, $816 = 0, $822 = 0, $83 = 0, $830 = 0, $836 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $845 = 0, $846 = 0, $852 = 0, $857 = 0, $858 = 0, $861 = 0, $863 = 0, $866 = 0, $87 = 0, $871 = 0, $877 = 0, $879 = 0, $881 = 0, $882 = 0, $9 = 0, $900 = 0, $902 = 0, $909 = 0, $910 = 0, $911 = 0, $919 = 0, $92 = 0, $923 = 0, $927 = 0, $929 = 0, $93 = 0, $935 = 0, $936 = 0, $938 = 0, $939 = 0, $940 = 0, $941 = 0, $943 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $956 = 0, $958 = 0, $96 = 0, $964 = 0, $969 = 0, $972 = 0, $973 = 0, $974 = 0, $978 = 0, $979 = 0, $98 = 0, $985 = 0, $990 = 0, $991 = 0, $994 = 0, $996 = 0, $999 = 0, label = 0, sp = 0, $958$looptemp = 0;
 sp = STACKTOP; //@line 4202
 STACKTOP = STACKTOP + 16 | 0; //@line 4203
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4203
 $1 = sp; //@line 4204
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 4211
   $7 = $6 >>> 3; //@line 4212
   $8 = HEAP32[3261] | 0; //@line 4213
   $9 = $8 >>> $7; //@line 4214
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 4220
    $16 = 13084 + ($14 << 1 << 2) | 0; //@line 4222
    $17 = $16 + 8 | 0; //@line 4223
    $18 = HEAP32[$17 >> 2] | 0; //@line 4224
    $19 = $18 + 8 | 0; //@line 4225
    $20 = HEAP32[$19 >> 2] | 0; //@line 4226
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[3261] = $8 & ~(1 << $14); //@line 4233
     } else {
      if ((HEAP32[3265] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 4238
      }
      $27 = $20 + 12 | 0; //@line 4241
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 4245
       HEAP32[$17 >> 2] = $20; //@line 4246
       break;
      } else {
       _abort(); //@line 4249
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 4254
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 4257
    $34 = $18 + $30 + 4 | 0; //@line 4259
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 4262
    $$0 = $19; //@line 4263
    STACKTOP = sp; //@line 4264
    return $$0 | 0; //@line 4264
   }
   $37 = HEAP32[3263] | 0; //@line 4266
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 4272
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 4275
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 4278
     $49 = $47 >>> 12 & 16; //@line 4280
     $50 = $47 >>> $49; //@line 4281
     $52 = $50 >>> 5 & 8; //@line 4283
     $54 = $50 >>> $52; //@line 4285
     $56 = $54 >>> 2 & 4; //@line 4287
     $58 = $54 >>> $56; //@line 4289
     $60 = $58 >>> 1 & 2; //@line 4291
     $62 = $58 >>> $60; //@line 4293
     $64 = $62 >>> 1 & 1; //@line 4295
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 4298
     $69 = 13084 + ($67 << 1 << 2) | 0; //@line 4300
     $70 = $69 + 8 | 0; //@line 4301
     $71 = HEAP32[$70 >> 2] | 0; //@line 4302
     $72 = $71 + 8 | 0; //@line 4303
     $73 = HEAP32[$72 >> 2] | 0; //@line 4304
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 4310
       HEAP32[3261] = $77; //@line 4311
       $98 = $77; //@line 4312
      } else {
       if ((HEAP32[3265] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 4317
       }
       $80 = $73 + 12 | 0; //@line 4320
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 4324
        HEAP32[$70 >> 2] = $73; //@line 4325
        $98 = $8; //@line 4326
        break;
       } else {
        _abort(); //@line 4329
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 4334
     $84 = $83 - $6 | 0; //@line 4335
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 4338
     $87 = $71 + $6 | 0; //@line 4339
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 4342
     HEAP32[$71 + $83 >> 2] = $84; //@line 4344
     if ($37 | 0) {
      $92 = HEAP32[3266] | 0; //@line 4347
      $93 = $37 >>> 3; //@line 4348
      $95 = 13084 + ($93 << 1 << 2) | 0; //@line 4350
      $96 = 1 << $93; //@line 4351
      if (!($98 & $96)) {
       HEAP32[3261] = $98 | $96; //@line 4356
       $$0199 = $95; //@line 4358
       $$pre$phiZ2D = $95 + 8 | 0; //@line 4358
      } else {
       $101 = $95 + 8 | 0; //@line 4360
       $102 = HEAP32[$101 >> 2] | 0; //@line 4361
       if ((HEAP32[3265] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 4365
       } else {
        $$0199 = $102; //@line 4368
        $$pre$phiZ2D = $101; //@line 4368
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 4371
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 4373
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 4375
      HEAP32[$92 + 12 >> 2] = $95; //@line 4377
     }
     HEAP32[3263] = $84; //@line 4379
     HEAP32[3266] = $87; //@line 4380
     $$0 = $72; //@line 4381
     STACKTOP = sp; //@line 4382
     return $$0 | 0; //@line 4382
    }
    $108 = HEAP32[3262] | 0; //@line 4384
    if (!$108) {
     $$0197 = $6; //@line 4387
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 4391
     $114 = $112 >>> 12 & 16; //@line 4393
     $115 = $112 >>> $114; //@line 4394
     $117 = $115 >>> 5 & 8; //@line 4396
     $119 = $115 >>> $117; //@line 4398
     $121 = $119 >>> 2 & 4; //@line 4400
     $123 = $119 >>> $121; //@line 4402
     $125 = $123 >>> 1 & 2; //@line 4404
     $127 = $123 >>> $125; //@line 4406
     $129 = $127 >>> 1 & 1; //@line 4408
     $134 = HEAP32[13348 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 4413
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 4417
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4423
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 4426
      $$0193$lcssa$i = $138; //@line 4426
     } else {
      $$01926$i = $134; //@line 4428
      $$01935$i = $138; //@line 4428
      $146 = $143; //@line 4428
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 4433
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 4434
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 4435
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 4436
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4442
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 4445
        $$0193$lcssa$i = $$$0193$i; //@line 4445
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 4448
        $$01935$i = $$$0193$i; //@line 4448
       }
      }
     }
     $157 = HEAP32[3265] | 0; //@line 4452
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 4455
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 4458
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 4461
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 4465
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 4467
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 4471
       $176 = HEAP32[$175 >> 2] | 0; //@line 4472
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 4475
        $179 = HEAP32[$178 >> 2] | 0; //@line 4476
        if (!$179) {
         $$3$i = 0; //@line 4479
         break;
        } else {
         $$1196$i = $179; //@line 4482
         $$1198$i = $178; //@line 4482
        }
       } else {
        $$1196$i = $176; //@line 4485
        $$1198$i = $175; //@line 4485
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 4488
        $182 = HEAP32[$181 >> 2] | 0; //@line 4489
        if ($182 | 0) {
         $$1196$i = $182; //@line 4492
         $$1198$i = $181; //@line 4492
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 4495
        $185 = HEAP32[$184 >> 2] | 0; //@line 4496
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 4501
         $$1198$i = $184; //@line 4501
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 4506
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 4509
        $$3$i = $$1196$i; //@line 4510
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 4515
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 4518
       }
       $169 = $167 + 12 | 0; //@line 4521
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 4525
       }
       $172 = $164 + 8 | 0; //@line 4528
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 4532
        HEAP32[$172 >> 2] = $167; //@line 4533
        $$3$i = $164; //@line 4534
        break;
       } else {
        _abort(); //@line 4537
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 4546
       $191 = 13348 + ($190 << 2) | 0; //@line 4547
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 4552
         if (!$$3$i) {
          HEAP32[3262] = $108 & ~(1 << $190); //@line 4558
          break L73;
         }
        } else {
         if ((HEAP32[3265] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 4565
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 4573
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[3265] | 0; //@line 4583
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 4586
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 4590
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 4592
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 4598
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 4602
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 4604
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 4610
       if ($214 | 0) {
        if ((HEAP32[3265] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 4616
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 4620
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 4622
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 4630
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 4633
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 4635
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 4638
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 4642
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 4645
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 4647
      if ($37 | 0) {
       $234 = HEAP32[3266] | 0; //@line 4650
       $235 = $37 >>> 3; //@line 4651
       $237 = 13084 + ($235 << 1 << 2) | 0; //@line 4653
       $238 = 1 << $235; //@line 4654
       if (!($8 & $238)) {
        HEAP32[3261] = $8 | $238; //@line 4659
        $$0189$i = $237; //@line 4661
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 4661
       } else {
        $242 = $237 + 8 | 0; //@line 4663
        $243 = HEAP32[$242 >> 2] | 0; //@line 4664
        if ((HEAP32[3265] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 4668
        } else {
         $$0189$i = $243; //@line 4671
         $$pre$phi$iZ2D = $242; //@line 4671
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 4674
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 4676
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 4678
       HEAP32[$234 + 12 >> 2] = $237; //@line 4680
      }
      HEAP32[3263] = $$0193$lcssa$i; //@line 4682
      HEAP32[3266] = $159; //@line 4683
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 4686
     STACKTOP = sp; //@line 4687
     return $$0 | 0; //@line 4687
    }
   } else {
    $$0197 = $6; //@line 4690
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 4695
   } else {
    $251 = $0 + 11 | 0; //@line 4697
    $252 = $251 & -8; //@line 4698
    $253 = HEAP32[3262] | 0; //@line 4699
    if (!$253) {
     $$0197 = $252; //@line 4702
    } else {
     $255 = 0 - $252 | 0; //@line 4704
     $256 = $251 >>> 8; //@line 4705
     if (!$256) {
      $$0358$i = 0; //@line 4708
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 4712
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 4716
       $262 = $256 << $261; //@line 4717
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 4720
       $267 = $262 << $265; //@line 4722
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 4725
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 4730
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 4736
      }
     }
     $282 = HEAP32[13348 + ($$0358$i << 2) >> 2] | 0; //@line 4740
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 4744
       $$3$i203 = 0; //@line 4744
       $$3350$i = $255; //@line 4744
       label = 81; //@line 4745
      } else {
       $$0342$i = 0; //@line 4752
       $$0347$i = $255; //@line 4752
       $$0353$i = $282; //@line 4752
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 4752
       $$0362$i = 0; //@line 4752
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 4757
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 4762
          $$435113$i = 0; //@line 4762
          $$435712$i = $$0353$i; //@line 4762
          label = 85; //@line 4763
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 4766
          $$1348$i = $292; //@line 4766
         }
        } else {
         $$1343$i = $$0342$i; //@line 4769
         $$1348$i = $$0347$i; //@line 4769
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 4772
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 4775
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 4779
        $302 = ($$0353$i | 0) == 0; //@line 4780
        if ($302) {
         $$2355$i = $$1363$i; //@line 4785
         $$3$i203 = $$1343$i; //@line 4785
         $$3350$i = $$1348$i; //@line 4785
         label = 81; //@line 4786
         break;
        } else {
         $$0342$i = $$1343$i; //@line 4789
         $$0347$i = $$1348$i; //@line 4789
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 4789
         $$0362$i = $$1363$i; //@line 4789
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 4799
       $309 = $253 & ($306 | 0 - $306); //@line 4802
       if (!$309) {
        $$0197 = $252; //@line 4805
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 4810
       $315 = $313 >>> 12 & 16; //@line 4812
       $316 = $313 >>> $315; //@line 4813
       $318 = $316 >>> 5 & 8; //@line 4815
       $320 = $316 >>> $318; //@line 4817
       $322 = $320 >>> 2 & 4; //@line 4819
       $324 = $320 >>> $322; //@line 4821
       $326 = $324 >>> 1 & 2; //@line 4823
       $328 = $324 >>> $326; //@line 4825
       $330 = $328 >>> 1 & 1; //@line 4827
       $$4$ph$i = 0; //@line 4833
       $$4357$ph$i = HEAP32[13348 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 4833
      } else {
       $$4$ph$i = $$3$i203; //@line 4835
       $$4357$ph$i = $$2355$i; //@line 4835
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 4839
       $$4351$lcssa$i = $$3350$i; //@line 4839
      } else {
       $$414$i = $$4$ph$i; //@line 4841
       $$435113$i = $$3350$i; //@line 4841
       $$435712$i = $$4357$ph$i; //@line 4841
       label = 85; //@line 4842
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 4847
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 4851
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 4852
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 4853
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 4854
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 4860
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 4863
        $$4351$lcssa$i = $$$4351$i; //@line 4863
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 4866
        $$435113$i = $$$4351$i; //@line 4866
        label = 85; //@line 4867
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 4873
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[3263] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[3265] | 0; //@line 4879
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 4882
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 4885
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 4888
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 4892
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 4894
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 4898
         $371 = HEAP32[$370 >> 2] | 0; //@line 4899
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 4902
          $374 = HEAP32[$373 >> 2] | 0; //@line 4903
          if (!$374) {
           $$3372$i = 0; //@line 4906
           break;
          } else {
           $$1370$i = $374; //@line 4909
           $$1374$i = $373; //@line 4909
          }
         } else {
          $$1370$i = $371; //@line 4912
          $$1374$i = $370; //@line 4912
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 4915
          $377 = HEAP32[$376 >> 2] | 0; //@line 4916
          if ($377 | 0) {
           $$1370$i = $377; //@line 4919
           $$1374$i = $376; //@line 4919
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 4922
          $380 = HEAP32[$379 >> 2] | 0; //@line 4923
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 4928
           $$1374$i = $379; //@line 4928
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 4933
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 4936
          $$3372$i = $$1370$i; //@line 4937
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 4942
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 4945
         }
         $364 = $362 + 12 | 0; //@line 4948
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 4952
         }
         $367 = $359 + 8 | 0; //@line 4955
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 4959
          HEAP32[$367 >> 2] = $362; //@line 4960
          $$3372$i = $359; //@line 4961
          break;
         } else {
          _abort(); //@line 4964
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 4972
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 4975
         $386 = 13348 + ($385 << 2) | 0; //@line 4976
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 4981
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 4986
            HEAP32[3262] = $391; //@line 4987
            $475 = $391; //@line 4988
            break L164;
           }
          } else {
           if ((HEAP32[3265] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 4995
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 5003
            if (!$$3372$i) {
             $475 = $253; //@line 5006
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[3265] | 0; //@line 5014
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 5017
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 5021
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 5023
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 5029
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 5033
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 5035
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 5041
         if (!$409) {
          $475 = $253; //@line 5044
         } else {
          if ((HEAP32[3265] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 5049
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 5053
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 5055
           $475 = $253; //@line 5056
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 5065
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 5068
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 5070
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 5073
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 5077
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 5080
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 5082
         $428 = $$4351$lcssa$i >>> 3; //@line 5083
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 13084 + ($428 << 1 << 2) | 0; //@line 5087
          $432 = HEAP32[3261] | 0; //@line 5088
          $433 = 1 << $428; //@line 5089
          if (!($432 & $433)) {
           HEAP32[3261] = $432 | $433; //@line 5094
           $$0368$i = $431; //@line 5096
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 5096
          } else {
           $437 = $431 + 8 | 0; //@line 5098
           $438 = HEAP32[$437 >> 2] | 0; //@line 5099
           if ((HEAP32[3265] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 5103
           } else {
            $$0368$i = $438; //@line 5106
            $$pre$phi$i211Z2D = $437; //@line 5106
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 5109
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 5111
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 5113
          HEAP32[$354 + 12 >> 2] = $431; //@line 5115
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 5118
         if (!$444) {
          $$0361$i = 0; //@line 5121
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 5125
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 5129
           $450 = $444 << $449; //@line 5130
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 5133
           $455 = $450 << $453; //@line 5135
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 5138
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 5143
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 5149
          }
         }
         $469 = 13348 + ($$0361$i << 2) | 0; //@line 5152
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 5154
         $471 = $354 + 16 | 0; //@line 5155
         HEAP32[$471 + 4 >> 2] = 0; //@line 5157
         HEAP32[$471 >> 2] = 0; //@line 5158
         $473 = 1 << $$0361$i; //@line 5159
         if (!($475 & $473)) {
          HEAP32[3262] = $475 | $473; //@line 5164
          HEAP32[$469 >> 2] = $354; //@line 5165
          HEAP32[$354 + 24 >> 2] = $469; //@line 5167
          HEAP32[$354 + 12 >> 2] = $354; //@line 5169
          HEAP32[$354 + 8 >> 2] = $354; //@line 5171
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 5180
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 5180
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 5187
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 5191
          $494 = HEAP32[$492 >> 2] | 0; //@line 5193
          if (!$494) {
           label = 136; //@line 5196
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 5199
           $$0345$i = $494; //@line 5199
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[3265] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 5206
          } else {
           HEAP32[$492 >> 2] = $354; //@line 5209
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 5211
           HEAP32[$354 + 12 >> 2] = $354; //@line 5213
           HEAP32[$354 + 8 >> 2] = $354; //@line 5215
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 5220
          $502 = HEAP32[$501 >> 2] | 0; //@line 5221
          $503 = HEAP32[3265] | 0; //@line 5222
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 5228
           HEAP32[$501 >> 2] = $354; //@line 5229
           HEAP32[$354 + 8 >> 2] = $502; //@line 5231
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 5233
           HEAP32[$354 + 24 >> 2] = 0; //@line 5235
           break;
          } else {
           _abort(); //@line 5238
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 5245
       STACKTOP = sp; //@line 5246
       return $$0 | 0; //@line 5246
      } else {
       $$0197 = $252; //@line 5248
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[3263] | 0; //@line 5255
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 5258
  $515 = HEAP32[3266] | 0; //@line 5259
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 5262
   HEAP32[3266] = $517; //@line 5263
   HEAP32[3263] = $514; //@line 5264
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 5267
   HEAP32[$515 + $512 >> 2] = $514; //@line 5269
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 5272
  } else {
   HEAP32[3263] = 0; //@line 5274
   HEAP32[3266] = 0; //@line 5275
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 5278
   $526 = $515 + $512 + 4 | 0; //@line 5280
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 5283
  }
  $$0 = $515 + 8 | 0; //@line 5286
  STACKTOP = sp; //@line 5287
  return $$0 | 0; //@line 5287
 }
 $530 = HEAP32[3264] | 0; //@line 5289
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 5292
  HEAP32[3264] = $532; //@line 5293
  $533 = HEAP32[3267] | 0; //@line 5294
  $534 = $533 + $$0197 | 0; //@line 5295
  HEAP32[3267] = $534; //@line 5296
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 5299
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 5302
  $$0 = $533 + 8 | 0; //@line 5304
  STACKTOP = sp; //@line 5305
  return $$0 | 0; //@line 5305
 }
 if (!(HEAP32[3379] | 0)) {
  HEAP32[3381] = 4096; //@line 5310
  HEAP32[3380] = 4096; //@line 5311
  HEAP32[3382] = -1; //@line 5312
  HEAP32[3383] = -1; //@line 5313
  HEAP32[3384] = 0; //@line 5314
  HEAP32[3372] = 0; //@line 5315
  HEAP32[3379] = $1 & -16 ^ 1431655768; //@line 5319
  $548 = 4096; //@line 5320
 } else {
  $548 = HEAP32[3381] | 0; //@line 5323
 }
 $545 = $$0197 + 48 | 0; //@line 5325
 $546 = $$0197 + 47 | 0; //@line 5326
 $547 = $548 + $546 | 0; //@line 5327
 $549 = 0 - $548 | 0; //@line 5328
 $550 = $547 & $549; //@line 5329
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 5332
  STACKTOP = sp; //@line 5333
  return $$0 | 0; //@line 5333
 }
 $552 = HEAP32[3371] | 0; //@line 5335
 if ($552 | 0) {
  $554 = HEAP32[3369] | 0; //@line 5338
  $555 = $554 + $550 | 0; //@line 5339
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 5344
   STACKTOP = sp; //@line 5345
   return $$0 | 0; //@line 5345
  }
 }
 L244 : do {
  if (!(HEAP32[3372] & 4)) {
   $561 = HEAP32[3267] | 0; //@line 5353
   L246 : do {
    if (!$561) {
     label = 163; //@line 5357
    } else {
     $$0$i$i = 13492; //@line 5359
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 5361
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 5364
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 5373
      if (!$570) {
       label = 163; //@line 5376
       break L246;
      } else {
       $$0$i$i = $570; //@line 5379
      }
     }
     $595 = $547 - $530 & $549; //@line 5383
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 5386
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 5394
       } else {
        $$723947$i = $595; //@line 5396
        $$748$i = $597; //@line 5396
        label = 180; //@line 5397
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 5401
       $$2253$ph$i = $595; //@line 5401
       label = 171; //@line 5402
      }
     } else {
      $$2234243136$i = 0; //@line 5405
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 5411
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 5414
     } else {
      $574 = $572; //@line 5416
      $575 = HEAP32[3380] | 0; //@line 5417
      $576 = $575 + -1 | 0; //@line 5418
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 5426
      $584 = HEAP32[3369] | 0; //@line 5427
      $585 = $$$i + $584 | 0; //@line 5428
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[3371] | 0; //@line 5433
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 5440
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 5444
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 5447
        $$748$i = $572; //@line 5447
        label = 180; //@line 5448
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 5451
        $$2253$ph$i = $$$i; //@line 5451
        label = 171; //@line 5452
       }
      } else {
       $$2234243136$i = 0; //@line 5455
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 5462
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 5471
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 5474
       $$748$i = $$2247$ph$i; //@line 5474
       label = 180; //@line 5475
       break L244;
      }
     }
     $607 = HEAP32[3381] | 0; //@line 5479
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 5483
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 5486
      $$748$i = $$2247$ph$i; //@line 5486
      label = 180; //@line 5487
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 5493
      $$2234243136$i = 0; //@line 5494
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 5498
      $$748$i = $$2247$ph$i; //@line 5498
      label = 180; //@line 5499
      break L244;
     }
    }
   } while (0);
   HEAP32[3372] = HEAP32[3372] | 4; //@line 5506
   $$4236$i = $$2234243136$i; //@line 5507
   label = 178; //@line 5508
  } else {
   $$4236$i = 0; //@line 5510
   label = 178; //@line 5511
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 5517
   $621 = _sbrk(0) | 0; //@line 5518
   $627 = $621 - $620 | 0; //@line 5526
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 5528
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 5536
    $$748$i = $620; //@line 5536
    label = 180; //@line 5537
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[3369] | 0) + $$723947$i | 0; //@line 5543
  HEAP32[3369] = $633; //@line 5544
  if ($633 >>> 0 > (HEAP32[3370] | 0) >>> 0) {
   HEAP32[3370] = $633; //@line 5548
  }
  $636 = HEAP32[3267] | 0; //@line 5550
  do {
   if (!$636) {
    $638 = HEAP32[3265] | 0; //@line 5554
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[3265] = $$748$i; //@line 5559
    }
    HEAP32[3373] = $$748$i; //@line 5561
    HEAP32[3374] = $$723947$i; //@line 5562
    HEAP32[3376] = 0; //@line 5563
    HEAP32[3270] = HEAP32[3379]; //@line 5565
    HEAP32[3269] = -1; //@line 5566
    HEAP32[3274] = 13084; //@line 5567
    HEAP32[3273] = 13084; //@line 5568
    HEAP32[3276] = 13092; //@line 5569
    HEAP32[3275] = 13092; //@line 5570
    HEAP32[3278] = 13100; //@line 5571
    HEAP32[3277] = 13100; //@line 5572
    HEAP32[3280] = 13108; //@line 5573
    HEAP32[3279] = 13108; //@line 5574
    HEAP32[3282] = 13116; //@line 5575
    HEAP32[3281] = 13116; //@line 5576
    HEAP32[3284] = 13124; //@line 5577
    HEAP32[3283] = 13124; //@line 5578
    HEAP32[3286] = 13132; //@line 5579
    HEAP32[3285] = 13132; //@line 5580
    HEAP32[3288] = 13140; //@line 5581
    HEAP32[3287] = 13140; //@line 5582
    HEAP32[3290] = 13148; //@line 5583
    HEAP32[3289] = 13148; //@line 5584
    HEAP32[3292] = 13156; //@line 5585
    HEAP32[3291] = 13156; //@line 5586
    HEAP32[3294] = 13164; //@line 5587
    HEAP32[3293] = 13164; //@line 5588
    HEAP32[3296] = 13172; //@line 5589
    HEAP32[3295] = 13172; //@line 5590
    HEAP32[3298] = 13180; //@line 5591
    HEAP32[3297] = 13180; //@line 5592
    HEAP32[3300] = 13188; //@line 5593
    HEAP32[3299] = 13188; //@line 5594
    HEAP32[3302] = 13196; //@line 5595
    HEAP32[3301] = 13196; //@line 5596
    HEAP32[3304] = 13204; //@line 5597
    HEAP32[3303] = 13204; //@line 5598
    HEAP32[3306] = 13212; //@line 5599
    HEAP32[3305] = 13212; //@line 5600
    HEAP32[3308] = 13220; //@line 5601
    HEAP32[3307] = 13220; //@line 5602
    HEAP32[3310] = 13228; //@line 5603
    HEAP32[3309] = 13228; //@line 5604
    HEAP32[3312] = 13236; //@line 5605
    HEAP32[3311] = 13236; //@line 5606
    HEAP32[3314] = 13244; //@line 5607
    HEAP32[3313] = 13244; //@line 5608
    HEAP32[3316] = 13252; //@line 5609
    HEAP32[3315] = 13252; //@line 5610
    HEAP32[3318] = 13260; //@line 5611
    HEAP32[3317] = 13260; //@line 5612
    HEAP32[3320] = 13268; //@line 5613
    HEAP32[3319] = 13268; //@line 5614
    HEAP32[3322] = 13276; //@line 5615
    HEAP32[3321] = 13276; //@line 5616
    HEAP32[3324] = 13284; //@line 5617
    HEAP32[3323] = 13284; //@line 5618
    HEAP32[3326] = 13292; //@line 5619
    HEAP32[3325] = 13292; //@line 5620
    HEAP32[3328] = 13300; //@line 5621
    HEAP32[3327] = 13300; //@line 5622
    HEAP32[3330] = 13308; //@line 5623
    HEAP32[3329] = 13308; //@line 5624
    HEAP32[3332] = 13316; //@line 5625
    HEAP32[3331] = 13316; //@line 5626
    HEAP32[3334] = 13324; //@line 5627
    HEAP32[3333] = 13324; //@line 5628
    HEAP32[3336] = 13332; //@line 5629
    HEAP32[3335] = 13332; //@line 5630
    $642 = $$723947$i + -40 | 0; //@line 5631
    $644 = $$748$i + 8 | 0; //@line 5633
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 5638
    $650 = $$748$i + $649 | 0; //@line 5639
    $651 = $642 - $649 | 0; //@line 5640
    HEAP32[3267] = $650; //@line 5641
    HEAP32[3264] = $651; //@line 5642
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 5645
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 5648
    HEAP32[3268] = HEAP32[3383]; //@line 5650
   } else {
    $$024367$i = 13492; //@line 5652
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 5654
     $658 = $$024367$i + 4 | 0; //@line 5655
     $659 = HEAP32[$658 >> 2] | 0; //@line 5656
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 5660
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 5664
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 5669
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 5683
       $673 = (HEAP32[3264] | 0) + $$723947$i | 0; //@line 5685
       $675 = $636 + 8 | 0; //@line 5687
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 5692
       $681 = $636 + $680 | 0; //@line 5693
       $682 = $673 - $680 | 0; //@line 5694
       HEAP32[3267] = $681; //@line 5695
       HEAP32[3264] = $682; //@line 5696
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 5699
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 5702
       HEAP32[3268] = HEAP32[3383]; //@line 5704
       break;
      }
     }
    }
    $688 = HEAP32[3265] | 0; //@line 5709
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[3265] = $$748$i; //@line 5712
     $753 = $$748$i; //@line 5713
    } else {
     $753 = $688; //@line 5715
    }
    $690 = $$748$i + $$723947$i | 0; //@line 5717
    $$124466$i = 13492; //@line 5718
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 5723
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 5727
     if (!$694) {
      $$0$i$i$i = 13492; //@line 5730
      break;
     } else {
      $$124466$i = $694; //@line 5733
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 5742
      $700 = $$124466$i + 4 | 0; //@line 5743
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 5746
      $704 = $$748$i + 8 | 0; //@line 5748
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 5754
      $712 = $690 + 8 | 0; //@line 5756
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 5762
      $722 = $710 + $$0197 | 0; //@line 5766
      $723 = $718 - $710 - $$0197 | 0; //@line 5767
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 5770
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[3264] | 0) + $723 | 0; //@line 5775
        HEAP32[3264] = $728; //@line 5776
        HEAP32[3267] = $722; //@line 5777
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 5780
       } else {
        if ((HEAP32[3266] | 0) == ($718 | 0)) {
         $734 = (HEAP32[3263] | 0) + $723 | 0; //@line 5786
         HEAP32[3263] = $734; //@line 5787
         HEAP32[3266] = $722; //@line 5788
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 5791
         HEAP32[$722 + $734 >> 2] = $734; //@line 5793
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 5797
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 5801
         $743 = $739 >>> 3; //@line 5802
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 5807
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 5809
           $750 = 13084 + ($743 << 1 << 2) | 0; //@line 5811
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 5817
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 5826
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[3261] = HEAP32[3261] & ~(1 << $743); //@line 5836
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 5843
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 5847
             }
             $764 = $748 + 8 | 0; //@line 5850
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 5854
              break;
             }
             _abort(); //@line 5857
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 5862
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 5863
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 5866
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 5868
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 5872
             $783 = $782 + 4 | 0; //@line 5873
             $784 = HEAP32[$783 >> 2] | 0; //@line 5874
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 5877
              if (!$786) {
               $$3$i$i = 0; //@line 5880
               break;
              } else {
               $$1291$i$i = $786; //@line 5883
               $$1293$i$i = $782; //@line 5883
              }
             } else {
              $$1291$i$i = $784; //@line 5886
              $$1293$i$i = $783; //@line 5886
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 5889
              $789 = HEAP32[$788 >> 2] | 0; //@line 5890
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 5893
               $$1293$i$i = $788; //@line 5893
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 5896
              $792 = HEAP32[$791 >> 2] | 0; //@line 5897
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 5902
               $$1293$i$i = $791; //@line 5902
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 5907
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 5910
              $$3$i$i = $$1291$i$i; //@line 5911
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 5916
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 5919
             }
             $776 = $774 + 12 | 0; //@line 5922
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 5926
             }
             $779 = $771 + 8 | 0; //@line 5929
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 5933
              HEAP32[$779 >> 2] = $774; //@line 5934
              $$3$i$i = $771; //@line 5935
              break;
             } else {
              _abort(); //@line 5938
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 5948
           $798 = 13348 + ($797 << 2) | 0; //@line 5949
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 5954
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[3262] = HEAP32[3262] & ~(1 << $797); //@line 5963
             break L311;
            } else {
             if ((HEAP32[3265] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 5969
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 5977
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[3265] | 0; //@line 5987
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 5990
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 5994
           $815 = $718 + 16 | 0; //@line 5995
           $816 = HEAP32[$815 >> 2] | 0; //@line 5996
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 6002
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 6006
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 6008
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 6014
           if (!$822) {
            break;
           }
           if ((HEAP32[3265] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 6022
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 6026
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 6028
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 6035
         $$0287$i$i = $742 + $723 | 0; //@line 6035
        } else {
         $$0$i17$i = $718; //@line 6037
         $$0287$i$i = $723; //@line 6037
        }
        $830 = $$0$i17$i + 4 | 0; //@line 6039
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 6042
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 6045
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 6047
        $836 = $$0287$i$i >>> 3; //@line 6048
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 13084 + ($836 << 1 << 2) | 0; //@line 6052
         $840 = HEAP32[3261] | 0; //@line 6053
         $841 = 1 << $836; //@line 6054
         do {
          if (!($840 & $841)) {
           HEAP32[3261] = $840 | $841; //@line 6060
           $$0295$i$i = $839; //@line 6062
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 6062
          } else {
           $845 = $839 + 8 | 0; //@line 6064
           $846 = HEAP32[$845 >> 2] | 0; //@line 6065
           if ((HEAP32[3265] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 6069
            $$pre$phi$i19$iZ2D = $845; //@line 6069
            break;
           }
           _abort(); //@line 6072
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 6076
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 6078
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 6080
         HEAP32[$722 + 12 >> 2] = $839; //@line 6082
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 6085
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 6089
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 6093
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 6098
          $858 = $852 << $857; //@line 6099
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 6102
          $863 = $858 << $861; //@line 6104
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 6107
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 6112
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 6118
         }
        } while (0);
        $877 = 13348 + ($$0296$i$i << 2) | 0; //@line 6121
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 6123
        $879 = $722 + 16 | 0; //@line 6124
        HEAP32[$879 + 4 >> 2] = 0; //@line 6126
        HEAP32[$879 >> 2] = 0; //@line 6127
        $881 = HEAP32[3262] | 0; //@line 6128
        $882 = 1 << $$0296$i$i; //@line 6129
        if (!($881 & $882)) {
         HEAP32[3262] = $881 | $882; //@line 6134
         HEAP32[$877 >> 2] = $722; //@line 6135
         HEAP32[$722 + 24 >> 2] = $877; //@line 6137
         HEAP32[$722 + 12 >> 2] = $722; //@line 6139
         HEAP32[$722 + 8 >> 2] = $722; //@line 6141
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 6150
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 6150
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 6157
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 6161
         $902 = HEAP32[$900 >> 2] | 0; //@line 6163
         if (!$902) {
          label = 260; //@line 6166
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 6169
          $$0289$i$i = $902; //@line 6169
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[3265] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 6176
         } else {
          HEAP32[$900 >> 2] = $722; //@line 6179
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 6181
          HEAP32[$722 + 12 >> 2] = $722; //@line 6183
          HEAP32[$722 + 8 >> 2] = $722; //@line 6185
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 6190
         $910 = HEAP32[$909 >> 2] | 0; //@line 6191
         $911 = HEAP32[3265] | 0; //@line 6192
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 6198
          HEAP32[$909 >> 2] = $722; //@line 6199
          HEAP32[$722 + 8 >> 2] = $910; //@line 6201
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 6203
          HEAP32[$722 + 24 >> 2] = 0; //@line 6205
          break;
         } else {
          _abort(); //@line 6208
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 6215
      STACKTOP = sp; //@line 6216
      return $$0 | 0; //@line 6216
     } else {
      $$0$i$i$i = 13492; //@line 6218
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 6222
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 6227
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 6235
    }
    $927 = $923 + -47 | 0; //@line 6237
    $929 = $927 + 8 | 0; //@line 6239
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 6245
    $936 = $636 + 16 | 0; //@line 6246
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 6248
    $939 = $938 + 8 | 0; //@line 6249
    $940 = $938 + 24 | 0; //@line 6250
    $941 = $$723947$i + -40 | 0; //@line 6251
    $943 = $$748$i + 8 | 0; //@line 6253
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 6258
    $949 = $$748$i + $948 | 0; //@line 6259
    $950 = $941 - $948 | 0; //@line 6260
    HEAP32[3267] = $949; //@line 6261
    HEAP32[3264] = $950; //@line 6262
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 6265
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 6268
    HEAP32[3268] = HEAP32[3383]; //@line 6270
    $956 = $938 + 4 | 0; //@line 6271
    HEAP32[$956 >> 2] = 27; //@line 6272
    HEAP32[$939 >> 2] = HEAP32[3373]; //@line 6273
    HEAP32[$939 + 4 >> 2] = HEAP32[3374]; //@line 6273
    HEAP32[$939 + 8 >> 2] = HEAP32[3375]; //@line 6273
    HEAP32[$939 + 12 >> 2] = HEAP32[3376]; //@line 6273
    HEAP32[3373] = $$748$i; //@line 6274
    HEAP32[3374] = $$723947$i; //@line 6275
    HEAP32[3376] = 0; //@line 6276
    HEAP32[3375] = $939; //@line 6277
    $958 = $940; //@line 6278
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 6280
     HEAP32[$958 >> 2] = 7; //@line 6281
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 6294
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 6297
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 6300
     HEAP32[$938 >> 2] = $964; //@line 6301
     $969 = $964 >>> 3; //@line 6302
     if ($964 >>> 0 < 256) {
      $972 = 13084 + ($969 << 1 << 2) | 0; //@line 6306
      $973 = HEAP32[3261] | 0; //@line 6307
      $974 = 1 << $969; //@line 6308
      if (!($973 & $974)) {
       HEAP32[3261] = $973 | $974; //@line 6313
       $$0211$i$i = $972; //@line 6315
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 6315
      } else {
       $978 = $972 + 8 | 0; //@line 6317
       $979 = HEAP32[$978 >> 2] | 0; //@line 6318
       if ((HEAP32[3265] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 6322
       } else {
        $$0211$i$i = $979; //@line 6325
        $$pre$phi$i$iZ2D = $978; //@line 6325
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 6328
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 6330
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 6332
      HEAP32[$636 + 12 >> 2] = $972; //@line 6334
      break;
     }
     $985 = $964 >>> 8; //@line 6337
     if (!$985) {
      $$0212$i$i = 0; //@line 6340
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 6344
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 6348
       $991 = $985 << $990; //@line 6349
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 6352
       $996 = $991 << $994; //@line 6354
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 6357
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 6362
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 6368
      }
     }
     $1010 = 13348 + ($$0212$i$i << 2) | 0; //@line 6371
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 6373
     HEAP32[$636 + 20 >> 2] = 0; //@line 6375
     HEAP32[$936 >> 2] = 0; //@line 6376
     $1013 = HEAP32[3262] | 0; //@line 6377
     $1014 = 1 << $$0212$i$i; //@line 6378
     if (!($1013 & $1014)) {
      HEAP32[3262] = $1013 | $1014; //@line 6383
      HEAP32[$1010 >> 2] = $636; //@line 6384
      HEAP32[$636 + 24 >> 2] = $1010; //@line 6386
      HEAP32[$636 + 12 >> 2] = $636; //@line 6388
      HEAP32[$636 + 8 >> 2] = $636; //@line 6390
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 6399
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 6399
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 6406
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 6410
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 6412
      if (!$1034) {
       label = 286; //@line 6415
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 6418
       $$0207$i$i = $1034; //@line 6418
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[3265] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 6425
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 6428
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 6430
       HEAP32[$636 + 12 >> 2] = $636; //@line 6432
       HEAP32[$636 + 8 >> 2] = $636; //@line 6434
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 6439
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 6440
      $1043 = HEAP32[3265] | 0; //@line 6441
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 6447
       HEAP32[$1041 >> 2] = $636; //@line 6448
       HEAP32[$636 + 8 >> 2] = $1042; //@line 6450
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 6452
       HEAP32[$636 + 24 >> 2] = 0; //@line 6454
       break;
      } else {
       _abort(); //@line 6457
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[3264] | 0; //@line 6464
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 6467
   HEAP32[3264] = $1054; //@line 6468
   $1055 = HEAP32[3267] | 0; //@line 6469
   $1056 = $1055 + $$0197 | 0; //@line 6470
   HEAP32[3267] = $1056; //@line 6471
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 6474
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 6477
   $$0 = $1055 + 8 | 0; //@line 6479
   STACKTOP = sp; //@line 6480
   return $$0 | 0; //@line 6480
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 6484
 $$0 = 0; //@line 6485
 STACKTOP = sp; //@line 6486
 return $$0 | 0; //@line 6486
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10538
 STACKTOP = STACKTOP + 560 | 0; //@line 10539
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 10539
 $6 = sp + 8 | 0; //@line 10540
 $7 = sp; //@line 10541
 $8 = sp + 524 | 0; //@line 10542
 $9 = $8; //@line 10543
 $10 = sp + 512 | 0; //@line 10544
 HEAP32[$7 >> 2] = 0; //@line 10545
 $11 = $10 + 12 | 0; //@line 10546
 ___DOUBLE_BITS_677($1) | 0; //@line 10547
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 10552
  $$0520 = 1; //@line 10552
  $$0521 = 6316; //@line 10552
 } else {
  $$0471 = $1; //@line 10563
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 10563
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 6317 : 6322 : 6319; //@line 10563
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 10565
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 10574
   $31 = $$0520 + 3 | 0; //@line 10579
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 10581
   _out_670($0, $$0521, $$0520); //@line 10582
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 6343 : 6347 : $27 ? 6335 : 6339, 3); //@line 10583
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 10585
   $$sink560 = $31; //@line 10586
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 10589
   $36 = $35 != 0.0; //@line 10590
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 10594
   }
   $39 = $5 | 32; //@line 10596
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 10599
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 10602
    $44 = $$0520 | 2; //@line 10603
    $46 = 12 - $3 | 0; //@line 10605
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 10610
     } else {
      $$0509585 = 8.0; //@line 10612
      $$1508586 = $46; //@line 10612
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 10614
       $$0509585 = $$0509585 * 16.0; //@line 10615
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 10630
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 10635
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 10640
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 10643
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 10646
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 10649
     HEAP8[$68 >> 0] = 48; //@line 10650
     $$0511 = $68; //@line 10651
    } else {
     $$0511 = $66; //@line 10653
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 10660
    $76 = $$0511 + -2 | 0; //@line 10663
    HEAP8[$76 >> 0] = $5 + 15; //@line 10664
    $77 = ($3 | 0) < 1; //@line 10665
    $79 = ($4 & 8 | 0) == 0; //@line 10667
    $$0523 = $8; //@line 10668
    $$2473 = $$1472; //@line 10668
    while (1) {
     $80 = ~~$$2473; //@line 10670
     $86 = $$0523 + 1 | 0; //@line 10676
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[6351 + $80 >> 0]; //@line 10677
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 10680
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 10689
      } else {
       HEAP8[$86 >> 0] = 46; //@line 10692
       $$1524 = $$0523 + 2 | 0; //@line 10693
      }
     } else {
      $$1524 = $86; //@line 10696
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 10700
     }
    }
    $$pre693 = $$1524; //@line 10706
    if (!$3) {
     label = 24; //@line 10708
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 10716
      $$sink = $3 + 2 | 0; //@line 10716
     } else {
      label = 24; //@line 10718
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 10722
     $$pre$phi691Z2D = $101; //@line 10723
     $$sink = $101; //@line 10723
    }
    $104 = $11 - $76 | 0; //@line 10727
    $106 = $104 + $44 + $$sink | 0; //@line 10729
    _pad_676($0, 32, $2, $106, $4); //@line 10730
    _out_670($0, $$0521$, $44); //@line 10731
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 10733
    _out_670($0, $8, $$pre$phi691Z2D); //@line 10734
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 10736
    _out_670($0, $76, $104); //@line 10737
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 10739
    $$sink560 = $106; //@line 10740
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 10744
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 10748
    HEAP32[$7 >> 2] = $113; //@line 10749
    $$3 = $35 * 268435456.0; //@line 10750
    $$pr = $113; //@line 10750
   } else {
    $$3 = $35; //@line 10753
    $$pr = HEAP32[$7 >> 2] | 0; //@line 10753
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 10757
   $$0498 = $$561; //@line 10758
   $$4 = $$3; //@line 10758
   do {
    $116 = ~~$$4 >>> 0; //@line 10760
    HEAP32[$$0498 >> 2] = $116; //@line 10761
    $$0498 = $$0498 + 4 | 0; //@line 10762
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 10765
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 10775
    $$1499662 = $$0498; //@line 10775
    $124 = $$pr; //@line 10775
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 10778
     $$0488655 = $$1499662 + -4 | 0; //@line 10779
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 10782
     } else {
      $$0488657 = $$0488655; //@line 10784
      $$0497656 = 0; //@line 10784
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 10787
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 10789
       $131 = tempRet0; //@line 10790
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 10791
       HEAP32[$$0488657 >> 2] = $132; //@line 10793
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 10794
       $$0488657 = $$0488657 + -4 | 0; //@line 10796
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 10806
      } else {
       $138 = $$1482663 + -4 | 0; //@line 10808
       HEAP32[$138 >> 2] = $$0497656; //@line 10809
       $$2483$ph = $138; //@line 10810
      }
     }
     $$2500 = $$1499662; //@line 10813
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 10819
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 10823
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 10829
     HEAP32[$7 >> 2] = $144; //@line 10830
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 10833
      $$1499662 = $$2500; //@line 10833
      $124 = $144; //@line 10833
     } else {
      $$1482$lcssa = $$2483$ph; //@line 10835
      $$1499$lcssa = $$2500; //@line 10835
      $$pr566 = $144; //@line 10835
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 10840
    $$1499$lcssa = $$0498; //@line 10840
    $$pr566 = $$pr; //@line 10840
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 10846
    $150 = ($39 | 0) == 102; //@line 10847
    $$3484650 = $$1482$lcssa; //@line 10848
    $$3501649 = $$1499$lcssa; //@line 10848
    $152 = $$pr566; //@line 10848
    while (1) {
     $151 = 0 - $152 | 0; //@line 10850
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 10852
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 10856
      $161 = 1e9 >>> $154; //@line 10857
      $$0487644 = 0; //@line 10858
      $$1489643 = $$3484650; //@line 10858
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 10860
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 10864
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 10865
       $$1489643 = $$1489643 + 4 | 0; //@line 10866
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 10877
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 10880
       $$4502 = $$3501649; //@line 10880
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 10883
       $$$3484700 = $$$3484; //@line 10884
       $$4502 = $$3501649 + 4 | 0; //@line 10884
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 10891
      $$4502 = $$3501649; //@line 10891
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 10893
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 10900
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 10902
     HEAP32[$7 >> 2] = $152; //@line 10903
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 10908
      $$3501$lcssa = $$$4502; //@line 10908
      break;
     } else {
      $$3484650 = $$$3484700; //@line 10906
      $$3501649 = $$$4502; //@line 10906
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 10913
    $$3501$lcssa = $$1499$lcssa; //@line 10913
   }
   $185 = $$561; //@line 10916
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 10921
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 10922
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 10925
    } else {
     $$0514639 = $189; //@line 10927
     $$0530638 = 10; //@line 10927
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 10929
      $193 = $$0514639 + 1 | 0; //@line 10930
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 10933
       break;
      } else {
       $$0514639 = $193; //@line 10936
      }
     }
    }
   } else {
    $$1515 = 0; //@line 10941
   }
   $198 = ($39 | 0) == 103; //@line 10946
   $199 = ($$540 | 0) != 0; //@line 10947
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 10950
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 10959
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 10962
    $213 = ($209 | 0) % 9 | 0; //@line 10963
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 10966
     $$1531632 = 10; //@line 10966
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 10969
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 10972
       $$1531632 = $215; //@line 10972
      } else {
       $$1531$lcssa = $215; //@line 10974
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 10979
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 10981
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 10982
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 10985
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 10988
     $$4518 = $$1515; //@line 10988
     $$8 = $$3484$lcssa; //@line 10988
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 10993
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 10994
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 10999
     if (!$$0520) {
      $$1467 = $$$564; //@line 11002
      $$1469 = $$543; //@line 11002
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 11005
      $$1467 = $230 ? -$$$564 : $$$564; //@line 11010
      $$1469 = $230 ? -$$543 : $$543; //@line 11010
     }
     $233 = $217 - $218 | 0; //@line 11012
     HEAP32[$212 >> 2] = $233; //@line 11013
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 11017
      HEAP32[$212 >> 2] = $236; //@line 11018
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 11021
       $$sink547625 = $212; //@line 11021
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 11023
        HEAP32[$$sink547625 >> 2] = 0; //@line 11024
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 11027
         HEAP32[$240 >> 2] = 0; //@line 11028
         $$6 = $240; //@line 11029
        } else {
         $$6 = $$5486626; //@line 11031
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 11034
        HEAP32[$238 >> 2] = $242; //@line 11035
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 11038
         $$sink547625 = $238; //@line 11038
        } else {
         $$5486$lcssa = $$6; //@line 11040
         $$sink547$lcssa = $238; //@line 11040
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 11045
       $$sink547$lcssa = $212; //@line 11045
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 11050
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 11051
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 11054
       $$4518 = $247; //@line 11054
       $$8 = $$5486$lcssa; //@line 11054
      } else {
       $$2516621 = $247; //@line 11056
       $$2532620 = 10; //@line 11056
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 11058
        $251 = $$2516621 + 1 | 0; //@line 11059
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 11062
         $$4518 = $251; //@line 11062
         $$8 = $$5486$lcssa; //@line 11062
         break;
        } else {
         $$2516621 = $251; //@line 11065
        }
       }
      }
     } else {
      $$4492 = $212; //@line 11070
      $$4518 = $$1515; //@line 11070
      $$8 = $$3484$lcssa; //@line 11070
     }
    }
    $253 = $$4492 + 4 | 0; //@line 11073
    $$5519$ph = $$4518; //@line 11076
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 11076
    $$9$ph = $$8; //@line 11076
   } else {
    $$5519$ph = $$1515; //@line 11078
    $$7505$ph = $$3501$lcssa; //@line 11078
    $$9$ph = $$3484$lcssa; //@line 11078
   }
   $$7505 = $$7505$ph; //@line 11080
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 11084
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 11087
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 11091
    } else {
     $$lcssa675 = 1; //@line 11093
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 11097
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 11102
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 11110
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 11110
     } else {
      $$0479 = $5 + -2 | 0; //@line 11114
      $$2476 = $$540$ + -1 | 0; //@line 11114
     }
     $267 = $4 & 8; //@line 11116
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 11121
       if (!$270) {
        $$2529 = 9; //@line 11124
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 11129
         $$3533616 = 10; //@line 11129
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 11131
          $275 = $$1528617 + 1 | 0; //@line 11132
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 11138
           break;
          } else {
           $$1528617 = $275; //@line 11136
          }
         }
        } else {
         $$2529 = 0; //@line 11143
        }
       }
      } else {
       $$2529 = 9; //@line 11147
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 11155
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 11157
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 11159
       $$1480 = $$0479; //@line 11162
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 11162
       $$pre$phi698Z2D = 0; //@line 11162
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 11166
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 11168
       $$1480 = $$0479; //@line 11171
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 11171
       $$pre$phi698Z2D = 0; //@line 11171
       break;
      }
     } else {
      $$1480 = $$0479; //@line 11175
      $$3477 = $$2476; //@line 11175
      $$pre$phi698Z2D = $267; //@line 11175
     }
    } else {
     $$1480 = $5; //@line 11179
     $$3477 = $$540; //@line 11179
     $$pre$phi698Z2D = $4 & 8; //@line 11179
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 11182
   $294 = ($292 | 0) != 0 & 1; //@line 11184
   $296 = ($$1480 | 32 | 0) == 102; //@line 11186
   if ($296) {
    $$2513 = 0; //@line 11190
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 11190
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 11193
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 11196
    $304 = $11; //@line 11197
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 11202
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 11204
      HEAP8[$308 >> 0] = 48; //@line 11205
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 11210
      } else {
       $$1512$lcssa = $308; //@line 11212
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 11217
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 11224
    $318 = $$1512$lcssa + -2 | 0; //@line 11226
    HEAP8[$318 >> 0] = $$1480; //@line 11227
    $$2513 = $318; //@line 11230
    $$pn = $304 - $318 | 0; //@line 11230
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 11235
   _pad_676($0, 32, $2, $323, $4); //@line 11236
   _out_670($0, $$0521, $$0520); //@line 11237
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 11239
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 11242
    $326 = $8 + 9 | 0; //@line 11243
    $327 = $326; //@line 11244
    $328 = $8 + 8 | 0; //@line 11245
    $$5493600 = $$0496$$9; //@line 11246
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 11249
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 11254
       $$1465 = $328; //@line 11255
      } else {
       $$1465 = $330; //@line 11257
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 11264
       $$0464597 = $330; //@line 11265
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 11267
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 11270
        } else {
         $$1465 = $335; //@line 11272
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 11277
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 11282
     $$5493600 = $$5493600 + 4 | 0; //@line 11283
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 6367, 1); //@line 11293
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 11299
     $$6494592 = $$5493600; //@line 11299
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 11302
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 11307
       $$0463587 = $347; //@line 11308
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 11310
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 11313
        } else {
         $$0463$lcssa = $351; //@line 11315
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 11320
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 11324
      $$6494592 = $$6494592 + 4 | 0; //@line 11325
      $356 = $$4478593 + -9 | 0; //@line 11326
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 11333
       break;
      } else {
       $$4478593 = $356; //@line 11331
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 11338
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 11341
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 11344
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 11347
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 11348
     $365 = $363; //@line 11349
     $366 = 0 - $9 | 0; //@line 11350
     $367 = $8 + 8 | 0; //@line 11351
     $$5605 = $$3477; //@line 11352
     $$7495604 = $$9$ph; //@line 11352
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 11355
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 11358
       $$0 = $367; //@line 11359
      } else {
       $$0 = $369; //@line 11361
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 11366
        _out_670($0, $$0, 1); //@line 11367
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 11371
         break;
        }
        _out_670($0, 6367, 1); //@line 11374
        $$2 = $375; //@line 11375
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 11379
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 11384
        $$1601 = $$0; //@line 11385
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 11387
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 11390
         } else {
          $$2 = $373; //@line 11392
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 11399
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 11402
      $381 = $$5605 - $378 | 0; //@line 11403
      $$7495604 = $$7495604 + 4 | 0; //@line 11404
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 11411
       break;
      } else {
       $$5605 = $381; //@line 11409
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 11416
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 11419
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 11423
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 11426
   $$sink560 = $323; //@line 11427
  }
 } while (0);
 STACKTOP = sp; //@line 11432
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 11432
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 9110
 STACKTOP = STACKTOP + 64 | 0; //@line 9111
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 9111
 $5 = sp + 16 | 0; //@line 9112
 $6 = sp; //@line 9113
 $7 = sp + 24 | 0; //@line 9114
 $8 = sp + 8 | 0; //@line 9115
 $9 = sp + 20 | 0; //@line 9116
 HEAP32[$5 >> 2] = $1; //@line 9117
 $10 = ($0 | 0) != 0; //@line 9118
 $11 = $7 + 40 | 0; //@line 9119
 $12 = $11; //@line 9120
 $13 = $7 + 39 | 0; //@line 9121
 $14 = $8 + 4 | 0; //@line 9122
 $$0243 = 0; //@line 9123
 $$0247 = 0; //@line 9123
 $$0269 = 0; //@line 9123
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 9132
     $$1248 = -1; //@line 9133
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 9137
     break;
    }
   } else {
    $$1248 = $$0247; //@line 9141
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 9144
  $21 = HEAP8[$20 >> 0] | 0; //@line 9145
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 9148
   break;
  } else {
   $23 = $21; //@line 9151
   $25 = $20; //@line 9151
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 9156
     $27 = $25; //@line 9156
     label = 9; //@line 9157
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 9162
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 9169
   HEAP32[$5 >> 2] = $24; //@line 9170
   $23 = HEAP8[$24 >> 0] | 0; //@line 9172
   $25 = $24; //@line 9172
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 9177
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 9182
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 9185
     $27 = $27 + 2 | 0; //@line 9186
     HEAP32[$5 >> 2] = $27; //@line 9187
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 9194
      break;
     } else {
      $$0249303 = $30; //@line 9191
      label = 9; //@line 9192
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 9202
  if ($10) {
   _out_670($0, $20, $36); //@line 9204
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 9208
   $$0247 = $$1248; //@line 9208
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 9216
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 9217
  if ($43) {
   $$0253 = -1; //@line 9219
   $$1270 = $$0269; //@line 9219
   $$sink = 1; //@line 9219
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 9229
    $$1270 = 1; //@line 9229
    $$sink = 3; //@line 9229
   } else {
    $$0253 = -1; //@line 9231
    $$1270 = $$0269; //@line 9231
    $$sink = 1; //@line 9231
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 9234
  HEAP32[$5 >> 2] = $51; //@line 9235
  $52 = HEAP8[$51 >> 0] | 0; //@line 9236
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 9238
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 9245
   $$lcssa291 = $52; //@line 9245
   $$lcssa292 = $51; //@line 9245
  } else {
   $$0262309 = 0; //@line 9247
   $60 = $52; //@line 9247
   $65 = $51; //@line 9247
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 9252
    $64 = $65 + 1 | 0; //@line 9253
    HEAP32[$5 >> 2] = $64; //@line 9254
    $66 = HEAP8[$64 >> 0] | 0; //@line 9255
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 9257
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 9264
     $$lcssa291 = $66; //@line 9264
     $$lcssa292 = $64; //@line 9264
     break;
    } else {
     $$0262309 = $63; //@line 9267
     $60 = $66; //@line 9267
     $65 = $64; //@line 9267
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 9279
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 9281
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 9286
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 9291
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 9303
     $$2271 = 1; //@line 9303
     $storemerge274 = $79 + 3 | 0; //@line 9303
    } else {
     label = 23; //@line 9305
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 9309
    if ($$1270 | 0) {
     $$0 = -1; //@line 9312
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9327
     $106 = HEAP32[$105 >> 2] | 0; //@line 9328
     HEAP32[$2 >> 2] = $105 + 4; //@line 9330
     $363 = $106; //@line 9331
    } else {
     $363 = 0; //@line 9333
    }
    $$0259 = $363; //@line 9337
    $$2271 = 0; //@line 9337
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 9337
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 9339
   $109 = ($$0259 | 0) < 0; //@line 9340
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 9345
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 9345
   $$3272 = $$2271; //@line 9345
   $115 = $storemerge274; //@line 9345
  } else {
   $112 = _getint_671($5) | 0; //@line 9347
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 9350
    break;
   }
   $$1260 = $112; //@line 9354
   $$1263 = $$0262$lcssa; //@line 9354
   $$3272 = $$1270; //@line 9354
   $115 = HEAP32[$5 >> 2] | 0; //@line 9354
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 9365
     $156 = _getint_671($5) | 0; //@line 9366
     $$0254 = $156; //@line 9368
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 9368
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 9377
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 9382
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 9387
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 9394
      $144 = $125 + 4 | 0; //@line 9398
      HEAP32[$5 >> 2] = $144; //@line 9399
      $$0254 = $140; //@line 9400
      $$pre345 = $144; //@line 9400
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 9406
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 9421
     $152 = HEAP32[$151 >> 2] | 0; //@line 9422
     HEAP32[$2 >> 2] = $151 + 4; //@line 9424
     $364 = $152; //@line 9425
    } else {
     $364 = 0; //@line 9427
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 9430
    HEAP32[$5 >> 2] = $154; //@line 9431
    $$0254 = $364; //@line 9432
    $$pre345 = $154; //@line 9432
   } else {
    $$0254 = -1; //@line 9434
    $$pre345 = $115; //@line 9434
   }
  } while (0);
  $$0252 = 0; //@line 9437
  $158 = $$pre345; //@line 9437
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 9444
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 9447
   HEAP32[$5 >> 2] = $158; //@line 9448
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (5835 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 9453
   $168 = $167 & 255; //@line 9454
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 9458
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 9465
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 9469
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 9473
     break L1;
    } else {
     label = 50; //@line 9476
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 9481
     $176 = $3 + ($$0253 << 3) | 0; //@line 9483
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 9488
     $182 = $6; //@line 9489
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 9491
     HEAP32[$182 + 4 >> 2] = $181; //@line 9494
     label = 50; //@line 9495
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 9499
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 9502
    $187 = HEAP32[$5 >> 2] | 0; //@line 9504
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 9508
   if ($10) {
    $187 = $158; //@line 9510
   } else {
    $$0243 = 0; //@line 9512
    $$0247 = $$1248; //@line 9512
    $$0269 = $$3272; //@line 9512
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 9518
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 9524
  $196 = $$1263 & -65537; //@line 9527
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 9528
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9536
       $$0243 = 0; //@line 9537
       $$0247 = $$1248; //@line 9537
       $$0269 = $$3272; //@line 9537
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9543
       $$0243 = 0; //@line 9544
       $$0247 = $$1248; //@line 9544
       $$0269 = $$3272; //@line 9544
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 9552
       HEAP32[$208 >> 2] = $$1248; //@line 9554
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 9557
       $$0243 = 0; //@line 9558
       $$0247 = $$1248; //@line 9558
       $$0269 = $$3272; //@line 9558
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 9565
       $$0243 = 0; //@line 9566
       $$0247 = $$1248; //@line 9566
       $$0269 = $$3272; //@line 9566
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 9573
       $$0243 = 0; //@line 9574
       $$0247 = $$1248; //@line 9574
       $$0269 = $$3272; //@line 9574
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 9580
       $$0243 = 0; //@line 9581
       $$0247 = $$1248; //@line 9581
       $$0269 = $$3272; //@line 9581
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 9589
       HEAP32[$220 >> 2] = $$1248; //@line 9591
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 9594
       $$0243 = 0; //@line 9595
       $$0247 = $$1248; //@line 9595
       $$0269 = $$3272; //@line 9595
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 9600
       $$0247 = $$1248; //@line 9600
       $$0269 = $$3272; //@line 9600
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 9610
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 9610
     $$3265 = $$1263$ | 8; //@line 9610
     label = 62; //@line 9611
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 9615
     $$1255 = $$0254; //@line 9615
     $$3265 = $$1263$; //@line 9615
     label = 62; //@line 9616
     break;
    }
   case 111:
    {
     $242 = $6; //@line 9620
     $244 = HEAP32[$242 >> 2] | 0; //@line 9622
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 9625
     $248 = _fmt_o($244, $247, $11) | 0; //@line 9626
     $252 = $12 - $248 | 0; //@line 9630
     $$0228 = $248; //@line 9635
     $$1233 = 0; //@line 9635
     $$1238 = 6299; //@line 9635
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 9635
     $$4266 = $$1263$; //@line 9635
     $281 = $244; //@line 9635
     $283 = $247; //@line 9635
     label = 68; //@line 9636
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 9640
     $258 = HEAP32[$256 >> 2] | 0; //@line 9642
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 9645
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 9648
      $264 = tempRet0; //@line 9649
      $265 = $6; //@line 9650
      HEAP32[$265 >> 2] = $263; //@line 9652
      HEAP32[$265 + 4 >> 2] = $264; //@line 9655
      $$0232 = 1; //@line 9656
      $$0237 = 6299; //@line 9656
      $275 = $263; //@line 9656
      $276 = $264; //@line 9656
      label = 67; //@line 9657
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 9669
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 6299 : 6301 : 6300; //@line 9669
      $275 = $258; //@line 9669
      $276 = $261; //@line 9669
      label = 67; //@line 9670
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 9676
     $$0232 = 0; //@line 9682
     $$0237 = 6299; //@line 9682
     $275 = HEAP32[$197 >> 2] | 0; //@line 9682
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 9682
     label = 67; //@line 9683
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 9694
     $$2 = $13; //@line 9695
     $$2234 = 0; //@line 9695
     $$2239 = 6299; //@line 9695
     $$2251 = $11; //@line 9695
     $$5 = 1; //@line 9695
     $$6268 = $196; //@line 9695
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 9702
     label = 72; //@line 9703
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 9707
     $$1 = $302 | 0 ? $302 : 6309; //@line 9710
     label = 72; //@line 9711
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 9721
     HEAP32[$14 >> 2] = 0; //@line 9722
     HEAP32[$6 >> 2] = $8; //@line 9723
     $$4258354 = -1; //@line 9724
     $365 = $8; //@line 9724
     label = 76; //@line 9725
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 9729
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 9732
      $$0240$lcssa356 = 0; //@line 9733
      label = 85; //@line 9734
     } else {
      $$4258354 = $$0254; //@line 9736
      $365 = $$pre348; //@line 9736
      label = 76; //@line 9737
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
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 9744
     $$0247 = $$1248; //@line 9744
     $$0269 = $$3272; //@line 9744
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 9749
     $$2234 = 0; //@line 9749
     $$2239 = 6299; //@line 9749
     $$2251 = $11; //@line 9749
     $$5 = $$0254; //@line 9749
     $$6268 = $$1263$; //@line 9749
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 9755
    $227 = $6; //@line 9756
    $229 = HEAP32[$227 >> 2] | 0; //@line 9758
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 9761
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 9763
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 9769
    $$0228 = $234; //@line 9774
    $$1233 = $or$cond278 ? 0 : 2; //@line 9774
    $$1238 = $or$cond278 ? 6299 : 6299 + ($$1236 >> 4) | 0; //@line 9774
    $$2256 = $$1255; //@line 9774
    $$4266 = $$3265; //@line 9774
    $281 = $229; //@line 9774
    $283 = $232; //@line 9774
    label = 68; //@line 9775
   } else if ((label | 0) == 67) {
    label = 0; //@line 9778
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 9780
    $$1233 = $$0232; //@line 9780
    $$1238 = $$0237; //@line 9780
    $$2256 = $$0254; //@line 9780
    $$4266 = $$1263$; //@line 9780
    $281 = $275; //@line 9780
    $283 = $276; //@line 9780
    label = 68; //@line 9781
   } else if ((label | 0) == 72) {
    label = 0; //@line 9784
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 9785
    $306 = ($305 | 0) == 0; //@line 9786
    $$2 = $$1; //@line 9793
    $$2234 = 0; //@line 9793
    $$2239 = 6299; //@line 9793
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 9793
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 9793
    $$6268 = $196; //@line 9793
   } else if ((label | 0) == 76) {
    label = 0; //@line 9796
    $$0229316 = $365; //@line 9797
    $$0240315 = 0; //@line 9797
    $$1244314 = 0; //@line 9797
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 9799
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 9802
      $$2245 = $$1244314; //@line 9802
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 9805
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 9811
      $$2245 = $320; //@line 9811
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 9815
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 9818
      $$0240315 = $325; //@line 9818
      $$1244314 = $320; //@line 9818
     } else {
      $$0240$lcssa = $325; //@line 9820
      $$2245 = $320; //@line 9820
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 9826
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 9829
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 9832
     label = 85; //@line 9833
    } else {
     $$1230327 = $365; //@line 9835
     $$1241326 = 0; //@line 9835
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 9837
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9840
       label = 85; //@line 9841
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 9844
      $$1241326 = $331 + $$1241326 | 0; //@line 9845
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9848
       label = 85; //@line 9849
       break L97;
      }
      _out_670($0, $9, $331); //@line 9853
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 9858
       label = 85; //@line 9859
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 9856
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 9867
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 9873
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 9875
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 9880
   $$2 = $or$cond ? $$0228 : $11; //@line 9885
   $$2234 = $$1233; //@line 9885
   $$2239 = $$1238; //@line 9885
   $$2251 = $11; //@line 9885
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 9885
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 9885
  } else if ((label | 0) == 85) {
   label = 0; //@line 9888
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 9890
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 9893
   $$0247 = $$1248; //@line 9893
   $$0269 = $$3272; //@line 9893
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 9898
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 9900
  $345 = $$$5 + $$2234 | 0; //@line 9901
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 9903
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 9904
  _out_670($0, $$2239, $$2234); //@line 9905
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 9907
  _pad_676($0, 48, $$$5, $343, 0); //@line 9908
  _out_670($0, $$2, $343); //@line 9909
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 9911
  $$0243 = $$2261; //@line 9912
  $$0247 = $$1248; //@line 9912
  $$0269 = $$3272; //@line 9912
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 9920
    } else {
     $$2242302 = 1; //@line 9922
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 9925
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 9928
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 9932
      $356 = $$2242302 + 1 | 0; //@line 9933
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 9936
      } else {
       $$2242$lcssa = $356; //@line 9938
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 9944
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 9950
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 9956
       } else {
        $$0 = 1; //@line 9958
        break;
       }
      }
     } else {
      $$0 = 1; //@line 9963
     }
    }
   } else {
    $$0 = $$1248; //@line 9967
   }
  }
 } while (0);
 STACKTOP = sp; //@line 9971
 return $$0 | 0; //@line 9971
}
function _main() {
 var $$027 = 0, $$1 = 0, $122 = 0, $51 = 0, $81 = 0, $AsyncCtx = 0, $AsyncCtx13 = 0, $AsyncCtx17 = 0, $AsyncCtx21 = 0, $AsyncCtx25 = 0, $AsyncCtx29 = 0, $AsyncCtx33 = 0, $AsyncCtx37 = 0, $AsyncCtx41 = 0, $AsyncCtx44 = 0, $AsyncCtx48 = 0, $AsyncCtx51 = 0, $AsyncCtx54 = 0, $AsyncCtx57 = 0, $AsyncCtx9 = 0, $bitmSan3$byval_copy76 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer3 = 0, $vararg_buffer5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3639
 STACKTOP = STACKTOP + 48 | 0; //@line 3640
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 3640
 $bitmSan3$byval_copy76 = sp + 32 | 0; //@line 3641
 $vararg_buffer5 = sp + 24 | 0; //@line 3642
 $vararg_buffer3 = sp + 16 | 0; //@line 3643
 $vararg_buffer1 = sp + 8 | 0; //@line 3644
 $vararg_buffer = sp; //@line 3645
 $AsyncCtx13 = _emscripten_alloc_async_context(36, sp) | 0; //@line 3646
 _puts(5733) | 0; //@line 3647
 if (___async) {
  HEAP32[$AsyncCtx13 >> 2] = 141; //@line 3650
  HEAP32[$AsyncCtx13 + 4 >> 2] = $vararg_buffer; //@line 3652
  HEAP32[$AsyncCtx13 + 8 >> 2] = $vararg_buffer; //@line 3654
  HEAP32[$AsyncCtx13 + 12 >> 2] = $vararg_buffer1; //@line 3656
  HEAP32[$AsyncCtx13 + 16 >> 2] = $vararg_buffer1; //@line 3658
  HEAP32[$AsyncCtx13 + 20 >> 2] = $vararg_buffer3; //@line 3660
  HEAP32[$AsyncCtx13 + 24 >> 2] = $vararg_buffer3; //@line 3662
  HEAP32[$AsyncCtx13 + 28 >> 2] = $vararg_buffer5; //@line 3664
  HEAP32[$AsyncCtx13 + 32 >> 2] = $vararg_buffer5; //@line 3666
  sp = STACKTOP; //@line 3667
  STACKTOP = sp; //@line 3668
  return 0; //@line 3668
 }
 _emscripten_free_async_context($AsyncCtx13 | 0); //@line 3670
 $AsyncCtx9 = _emscripten_alloc_async_context(36, sp) | 0; //@line 3671
 _puts(5755) | 0; //@line 3672
 if (___async) {
  HEAP32[$AsyncCtx9 >> 2] = 142; //@line 3675
  HEAP32[$AsyncCtx9 + 4 >> 2] = $vararg_buffer; //@line 3677
  HEAP32[$AsyncCtx9 + 8 >> 2] = $vararg_buffer; //@line 3679
  HEAP32[$AsyncCtx9 + 12 >> 2] = $vararg_buffer1; //@line 3681
  HEAP32[$AsyncCtx9 + 16 >> 2] = $vararg_buffer1; //@line 3683
  HEAP32[$AsyncCtx9 + 20 >> 2] = $vararg_buffer3; //@line 3685
  HEAP32[$AsyncCtx9 + 24 >> 2] = $vararg_buffer3; //@line 3687
  HEAP32[$AsyncCtx9 + 28 >> 2] = $vararg_buffer5; //@line 3689
  HEAP32[$AsyncCtx9 + 32 >> 2] = $vararg_buffer5; //@line 3691
  sp = STACKTOP; //@line 3692
  STACKTOP = sp; //@line 3693
  return 0; //@line 3693
 }
 _emscripten_free_async_context($AsyncCtx9 | 0); //@line 3695
 __ZN6C128323clsEv(8860); //@line 3696
 $AsyncCtx44 = _emscripten_alloc_async_context(36, sp) | 0; //@line 3697
 HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[255]; //@line 3698
 HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[256]; //@line 3698
 HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[257]; //@line 3698
 HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[258]; //@line 3698
 __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy76, 95, 0); //@line 3699
 if (___async) {
  HEAP32[$AsyncCtx44 >> 2] = 143; //@line 3702
  HEAP32[$AsyncCtx44 + 4 >> 2] = $vararg_buffer; //@line 3704
  HEAP32[$AsyncCtx44 + 8 >> 2] = $vararg_buffer; //@line 3706
  HEAP32[$AsyncCtx44 + 12 >> 2] = $vararg_buffer1; //@line 3708
  HEAP32[$AsyncCtx44 + 16 >> 2] = $vararg_buffer1; //@line 3710
  HEAP32[$AsyncCtx44 + 20 >> 2] = $vararg_buffer3; //@line 3712
  HEAP32[$AsyncCtx44 + 24 >> 2] = $vararg_buffer3; //@line 3714
  HEAP32[$AsyncCtx44 + 28 >> 2] = $vararg_buffer5; //@line 3716
  HEAP32[$AsyncCtx44 + 32 >> 2] = $vararg_buffer5; //@line 3718
  sp = STACKTOP; //@line 3719
  STACKTOP = sp; //@line 3720
  return 0; //@line 3720
 }
 _emscripten_free_async_context($AsyncCtx44 | 0); //@line 3722
 __ZN6C1283211copy_to_lcdEv(8860); //@line 3723
 __ZN6C128327setmodeEi(8860, 1); //@line 3724
 $$027 = -15; //@line 3725
 while (1) {
  $AsyncCtx41 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3727
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[259]; //@line 3728
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[260]; //@line 3728
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[261]; //@line 3728
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[262]; //@line 3728
  __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy76, $$027, 2); //@line 3729
  if (___async) {
   label = 9; //@line 3732
   break;
  }
  _emscripten_free_async_context($AsyncCtx41 | 0); //@line 3735
  $AsyncCtx57 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3736
  _wait(.20000000298023224); //@line 3737
  if (___async) {
   label = 11; //@line 3740
   break;
  }
  _emscripten_free_async_context($AsyncCtx57 | 0); //@line 3743
  __ZN6C1283211copy_to_lcdEv(8860); //@line 3744
  $AsyncCtx37 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3745
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[259]; //@line 3746
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[260]; //@line 3746
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[261]; //@line 3746
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[262]; //@line 3746
  __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy76, $$027, 2); //@line 3747
  if (___async) {
   label = 13; //@line 3750
   break;
  }
  _emscripten_free_async_context($AsyncCtx37 | 0); //@line 3753
  $51 = $$027 + 3 | 0; //@line 3754
  $AsyncCtx33 = _emscripten_alloc_async_context(44, sp) | 0; //@line 3755
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[263]; //@line 3756
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[264]; //@line 3756
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[265]; //@line 3756
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[266]; //@line 3756
  __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy76, $51, 2); //@line 3757
  if (___async) {
   label = 15; //@line 3760
   break;
  }
  _emscripten_free_async_context($AsyncCtx33 | 0); //@line 3763
  $AsyncCtx54 = _emscripten_alloc_async_context(44, sp) | 0; //@line 3764
  _wait(.20000000298023224); //@line 3765
  if (___async) {
   label = 17; //@line 3768
   break;
  }
  _emscripten_free_async_context($AsyncCtx54 | 0); //@line 3771
  __ZN6C1283211copy_to_lcdEv(8860); //@line 3772
  $AsyncCtx29 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3773
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[263]; //@line 3774
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[264]; //@line 3774
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[265]; //@line 3774
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[266]; //@line 3774
  __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy76, $51, 2); //@line 3775
  if (___async) {
   label = 19; //@line 3778
   break;
  }
  _emscripten_free_async_context($AsyncCtx29 | 0); //@line 3781
  $81 = $$027 + 6 | 0; //@line 3782
  $AsyncCtx25 = _emscripten_alloc_async_context(44, sp) | 0; //@line 3783
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[267]; //@line 3784
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[268]; //@line 3784
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[269]; //@line 3784
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[270]; //@line 3784
  __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy76, $81, 2); //@line 3785
  if (___async) {
   label = 21; //@line 3788
   break;
  }
  _emscripten_free_async_context($AsyncCtx25 | 0); //@line 3791
  $AsyncCtx51 = _emscripten_alloc_async_context(44, sp) | 0; //@line 3792
  _wait(.20000000298023224); //@line 3793
  if (___async) {
   label = 23; //@line 3796
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 3799
  __ZN6C1283211copy_to_lcdEv(8860); //@line 3800
  $AsyncCtx21 = _emscripten_alloc_async_context(40, sp) | 0; //@line 3801
  HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[267]; //@line 3802
  HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[268]; //@line 3802
  HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[269]; //@line 3802
  HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[270]; //@line 3802
  __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy76, $81, 2); //@line 3803
  if (___async) {
   label = 25; //@line 3806
   break;
  }
  _emscripten_free_async_context($AsyncCtx21 | 0); //@line 3809
  if (($$027 | 0) < 66) {
   $$027 = $$027 + 9 | 0; //@line 3813
  } else {
   label = 27; //@line 3815
   break;
  }
 }
 switch (label | 0) {
 case 9:
  {
   HEAP32[$AsyncCtx41 >> 2] = 144; //@line 3821
   HEAP32[$AsyncCtx41 + 4 >> 2] = $$027; //@line 3823
   HEAP32[$AsyncCtx41 + 8 >> 2] = $vararg_buffer; //@line 3825
   HEAP32[$AsyncCtx41 + 12 >> 2] = $vararg_buffer; //@line 3827
   HEAP32[$AsyncCtx41 + 16 >> 2] = $vararg_buffer1; //@line 3829
   HEAP32[$AsyncCtx41 + 20 >> 2] = $vararg_buffer1; //@line 3831
   HEAP32[$AsyncCtx41 + 24 >> 2] = $vararg_buffer3; //@line 3833
   HEAP32[$AsyncCtx41 + 28 >> 2] = $vararg_buffer3; //@line 3835
   HEAP32[$AsyncCtx41 + 32 >> 2] = $vararg_buffer5; //@line 3837
   HEAP32[$AsyncCtx41 + 36 >> 2] = $vararg_buffer5; //@line 3839
   sp = STACKTOP; //@line 3840
   STACKTOP = sp; //@line 3841
   return 0; //@line 3841
  }
 case 11:
  {
   HEAP32[$AsyncCtx57 >> 2] = 145; //@line 3845
   HEAP32[$AsyncCtx57 + 4 >> 2] = $$027; //@line 3847
   HEAP32[$AsyncCtx57 + 8 >> 2] = $vararg_buffer; //@line 3849
   HEAP32[$AsyncCtx57 + 12 >> 2] = $vararg_buffer; //@line 3851
   HEAP32[$AsyncCtx57 + 16 >> 2] = $vararg_buffer1; //@line 3853
   HEAP32[$AsyncCtx57 + 20 >> 2] = $vararg_buffer1; //@line 3855
   HEAP32[$AsyncCtx57 + 24 >> 2] = $vararg_buffer3; //@line 3857
   HEAP32[$AsyncCtx57 + 28 >> 2] = $vararg_buffer3; //@line 3859
   HEAP32[$AsyncCtx57 + 32 >> 2] = $vararg_buffer5; //@line 3861
   HEAP32[$AsyncCtx57 + 36 >> 2] = $vararg_buffer5; //@line 3863
   sp = STACKTOP; //@line 3864
   STACKTOP = sp; //@line 3865
   return 0; //@line 3865
  }
 case 13:
  {
   HEAP32[$AsyncCtx37 >> 2] = 146; //@line 3869
   HEAP32[$AsyncCtx37 + 4 >> 2] = $$027; //@line 3871
   HEAP32[$AsyncCtx37 + 8 >> 2] = $vararg_buffer; //@line 3873
   HEAP32[$AsyncCtx37 + 12 >> 2] = $vararg_buffer; //@line 3875
   HEAP32[$AsyncCtx37 + 16 >> 2] = $vararg_buffer1; //@line 3877
   HEAP32[$AsyncCtx37 + 20 >> 2] = $vararg_buffer1; //@line 3879
   HEAP32[$AsyncCtx37 + 24 >> 2] = $vararg_buffer3; //@line 3881
   HEAP32[$AsyncCtx37 + 28 >> 2] = $vararg_buffer3; //@line 3883
   HEAP32[$AsyncCtx37 + 32 >> 2] = $vararg_buffer5; //@line 3885
   HEAP32[$AsyncCtx37 + 36 >> 2] = $vararg_buffer5; //@line 3887
   sp = STACKTOP; //@line 3888
   STACKTOP = sp; //@line 3889
   return 0; //@line 3889
  }
 case 15:
  {
   HEAP32[$AsyncCtx33 >> 2] = 147; //@line 3893
   HEAP32[$AsyncCtx33 + 4 >> 2] = $$027; //@line 3895
   HEAP32[$AsyncCtx33 + 8 >> 2] = $vararg_buffer; //@line 3897
   HEAP32[$AsyncCtx33 + 12 >> 2] = $vararg_buffer; //@line 3899
   HEAP32[$AsyncCtx33 + 16 >> 2] = $vararg_buffer1; //@line 3901
   HEAP32[$AsyncCtx33 + 20 >> 2] = $vararg_buffer1; //@line 3903
   HEAP32[$AsyncCtx33 + 24 >> 2] = $vararg_buffer3; //@line 3905
   HEAP32[$AsyncCtx33 + 28 >> 2] = $vararg_buffer3; //@line 3907
   HEAP32[$AsyncCtx33 + 32 >> 2] = $vararg_buffer5; //@line 3909
   HEAP32[$AsyncCtx33 + 36 >> 2] = $vararg_buffer5; //@line 3911
   HEAP32[$AsyncCtx33 + 40 >> 2] = $51; //@line 3913
   sp = STACKTOP; //@line 3914
   STACKTOP = sp; //@line 3915
   return 0; //@line 3915
  }
 case 17:
  {
   HEAP32[$AsyncCtx54 >> 2] = 148; //@line 3919
   HEAP32[$AsyncCtx54 + 4 >> 2] = $$027; //@line 3921
   HEAP32[$AsyncCtx54 + 8 >> 2] = $vararg_buffer; //@line 3923
   HEAP32[$AsyncCtx54 + 12 >> 2] = $vararg_buffer; //@line 3925
   HEAP32[$AsyncCtx54 + 16 >> 2] = $vararg_buffer1; //@line 3927
   HEAP32[$AsyncCtx54 + 20 >> 2] = $vararg_buffer1; //@line 3929
   HEAP32[$AsyncCtx54 + 24 >> 2] = $vararg_buffer3; //@line 3931
   HEAP32[$AsyncCtx54 + 28 >> 2] = $vararg_buffer3; //@line 3933
   HEAP32[$AsyncCtx54 + 32 >> 2] = $vararg_buffer5; //@line 3935
   HEAP32[$AsyncCtx54 + 36 >> 2] = $vararg_buffer5; //@line 3937
   HEAP32[$AsyncCtx54 + 40 >> 2] = $51; //@line 3939
   sp = STACKTOP; //@line 3940
   STACKTOP = sp; //@line 3941
   return 0; //@line 3941
  }
 case 19:
  {
   HEAP32[$AsyncCtx29 >> 2] = 149; //@line 3945
   HEAP32[$AsyncCtx29 + 4 >> 2] = $$027; //@line 3947
   HEAP32[$AsyncCtx29 + 8 >> 2] = $vararg_buffer; //@line 3949
   HEAP32[$AsyncCtx29 + 12 >> 2] = $vararg_buffer; //@line 3951
   HEAP32[$AsyncCtx29 + 16 >> 2] = $vararg_buffer1; //@line 3953
   HEAP32[$AsyncCtx29 + 20 >> 2] = $vararg_buffer1; //@line 3955
   HEAP32[$AsyncCtx29 + 24 >> 2] = $vararg_buffer3; //@line 3957
   HEAP32[$AsyncCtx29 + 28 >> 2] = $vararg_buffer3; //@line 3959
   HEAP32[$AsyncCtx29 + 32 >> 2] = $vararg_buffer5; //@line 3961
   HEAP32[$AsyncCtx29 + 36 >> 2] = $vararg_buffer5; //@line 3963
   sp = STACKTOP; //@line 3964
   STACKTOP = sp; //@line 3965
   return 0; //@line 3965
  }
 case 21:
  {
   HEAP32[$AsyncCtx25 >> 2] = 150; //@line 3969
   HEAP32[$AsyncCtx25 + 4 >> 2] = $vararg_buffer; //@line 3971
   HEAP32[$AsyncCtx25 + 8 >> 2] = $vararg_buffer; //@line 3973
   HEAP32[$AsyncCtx25 + 12 >> 2] = $vararg_buffer1; //@line 3975
   HEAP32[$AsyncCtx25 + 16 >> 2] = $vararg_buffer1; //@line 3977
   HEAP32[$AsyncCtx25 + 20 >> 2] = $$027; //@line 3979
   HEAP32[$AsyncCtx25 + 24 >> 2] = $vararg_buffer3; //@line 3981
   HEAP32[$AsyncCtx25 + 28 >> 2] = $vararg_buffer3; //@line 3983
   HEAP32[$AsyncCtx25 + 32 >> 2] = $vararg_buffer5; //@line 3985
   HEAP32[$AsyncCtx25 + 36 >> 2] = $vararg_buffer5; //@line 3987
   HEAP32[$AsyncCtx25 + 40 >> 2] = $81; //@line 3989
   sp = STACKTOP; //@line 3990
   STACKTOP = sp; //@line 3991
   return 0; //@line 3991
  }
 case 23:
  {
   HEAP32[$AsyncCtx51 >> 2] = 151; //@line 3995
   HEAP32[$AsyncCtx51 + 4 >> 2] = $vararg_buffer; //@line 3997
   HEAP32[$AsyncCtx51 + 8 >> 2] = $vararg_buffer; //@line 3999
   HEAP32[$AsyncCtx51 + 12 >> 2] = $vararg_buffer1; //@line 4001
   HEAP32[$AsyncCtx51 + 16 >> 2] = $vararg_buffer1; //@line 4003
   HEAP32[$AsyncCtx51 + 20 >> 2] = $vararg_buffer3; //@line 4005
   HEAP32[$AsyncCtx51 + 24 >> 2] = $vararg_buffer3; //@line 4007
   HEAP32[$AsyncCtx51 + 28 >> 2] = $vararg_buffer5; //@line 4009
   HEAP32[$AsyncCtx51 + 32 >> 2] = $vararg_buffer5; //@line 4011
   HEAP32[$AsyncCtx51 + 36 >> 2] = $$027; //@line 4013
   HEAP32[$AsyncCtx51 + 40 >> 2] = $81; //@line 4015
   sp = STACKTOP; //@line 4016
   STACKTOP = sp; //@line 4017
   return 0; //@line 4017
  }
 case 25:
  {
   HEAP32[$AsyncCtx21 >> 2] = 152; //@line 4021
   HEAP32[$AsyncCtx21 + 4 >> 2] = $vararg_buffer; //@line 4023
   HEAP32[$AsyncCtx21 + 8 >> 2] = $vararg_buffer; //@line 4025
   HEAP32[$AsyncCtx21 + 12 >> 2] = $vararg_buffer1; //@line 4027
   HEAP32[$AsyncCtx21 + 16 >> 2] = $vararg_buffer1; //@line 4029
   HEAP32[$AsyncCtx21 + 20 >> 2] = $$027; //@line 4031
   HEAP32[$AsyncCtx21 + 24 >> 2] = $vararg_buffer3; //@line 4033
   HEAP32[$AsyncCtx21 + 28 >> 2] = $vararg_buffer3; //@line 4035
   HEAP32[$AsyncCtx21 + 32 >> 2] = $vararg_buffer5; //@line 4037
   HEAP32[$AsyncCtx21 + 36 >> 2] = $vararg_buffer5; //@line 4039
   sp = STACKTOP; //@line 4040
   STACKTOP = sp; //@line 4041
   return 0; //@line 4041
  }
 case 27:
  {
   $AsyncCtx17 = _emscripten_alloc_async_context(36, sp) | 0; //@line 4045
   HEAP32[$bitmSan3$byval_copy76 >> 2] = HEAP32[267]; //@line 4046
   HEAP32[$bitmSan3$byval_copy76 + 4 >> 2] = HEAP32[268]; //@line 4046
   HEAP32[$bitmSan3$byval_copy76 + 8 >> 2] = HEAP32[269]; //@line 4046
   HEAP32[$bitmSan3$byval_copy76 + 12 >> 2] = HEAP32[270]; //@line 4046
   __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy76, 75, 2); //@line 4047
   if (___async) {
    HEAP32[$AsyncCtx17 >> 2] = 153; //@line 4050
    HEAP32[$AsyncCtx17 + 4 >> 2] = $vararg_buffer; //@line 4052
    HEAP32[$AsyncCtx17 + 8 >> 2] = $vararg_buffer; //@line 4054
    HEAP32[$AsyncCtx17 + 12 >> 2] = $vararg_buffer1; //@line 4056
    HEAP32[$AsyncCtx17 + 16 >> 2] = $vararg_buffer1; //@line 4058
    HEAP32[$AsyncCtx17 + 20 >> 2] = $vararg_buffer3; //@line 4060
    HEAP32[$AsyncCtx17 + 24 >> 2] = $vararg_buffer3; //@line 4062
    HEAP32[$AsyncCtx17 + 28 >> 2] = $vararg_buffer5; //@line 4064
    HEAP32[$AsyncCtx17 + 32 >> 2] = $vararg_buffer5; //@line 4066
    sp = STACKTOP; //@line 4067
    STACKTOP = sp; //@line 4068
    return 0; //@line 4068
   }
   _emscripten_free_async_context($AsyncCtx17 | 0); //@line 4070
   __ZN6C1283211set_auto_upEj(8860, 0); //@line 4071
   $$1 = -20; //@line 4072
   while (1) {
    __ZN6C128326locateEii(8860, 5, $$1); //@line 4075
    __ZN4mbed6Stream6printfEPKcz(8860, 5809, $vararg_buffer) | 0; //@line 4076
    $122 = $$1 + 12 | 0; //@line 4077
    __ZN6C128326locateEii(8860, 5, $122); //@line 4078
    __ZN4mbed6Stream6printfEPKcz(8860, 5815, $vararg_buffer1) | 0; //@line 4079
    __ZN6C1283211copy_to_lcdEv(8860); //@line 4080
    if (($$1 | 0) >= 5) {
     break;
    }
    __ZN6C128326locateEii(8860, 5, $$1); //@line 4084
    $AsyncCtx48 = _emscripten_alloc_async_context(44, sp) | 0; //@line 4085
    _wait(.20000000298023224); //@line 4086
    if (___async) {
     label = 32; //@line 4089
     break;
    }
    _emscripten_free_async_context($AsyncCtx48 | 0); //@line 4092
    __ZN4mbed6Stream6printfEPKcz(8860, 5809, $vararg_buffer3) | 0; //@line 4093
    __ZN6C128326locateEii(8860, 5, $122); //@line 4094
    __ZN4mbed6Stream6printfEPKcz(8860, 5815, $vararg_buffer5) | 0; //@line 4095
    __ZN6C1283211copy_to_lcdEv(8860); //@line 4096
    $$1 = $$1 + 2 | 0; //@line 4098
   }
   if ((label | 0) == 32) {
    HEAP32[$AsyncCtx48 >> 2] = 154; //@line 4101
    HEAP32[$AsyncCtx48 + 4 >> 2] = $vararg_buffer3; //@line 4103
    HEAP32[$AsyncCtx48 + 8 >> 2] = $vararg_buffer3; //@line 4105
    HEAP32[$AsyncCtx48 + 12 >> 2] = $122; //@line 4107
    HEAP32[$AsyncCtx48 + 16 >> 2] = $vararg_buffer5; //@line 4109
    HEAP32[$AsyncCtx48 + 20 >> 2] = $vararg_buffer5; //@line 4111
    HEAP32[$AsyncCtx48 + 24 >> 2] = $$1; //@line 4113
    HEAP32[$AsyncCtx48 + 28 >> 2] = $vararg_buffer; //@line 4115
    HEAP32[$AsyncCtx48 + 32 >> 2] = $vararg_buffer; //@line 4117
    HEAP32[$AsyncCtx48 + 36 >> 2] = $vararg_buffer1; //@line 4119
    HEAP32[$AsyncCtx48 + 40 >> 2] = $vararg_buffer1; //@line 4121
    sp = STACKTOP; //@line 4122
    STACKTOP = sp; //@line 4123
    return 0; //@line 4123
   }
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 4125
   _puts(5825) | 0; //@line 4126
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 155; //@line 4129
    sp = STACKTOP; //@line 4130
    STACKTOP = sp; //@line 4131
    return 0; //@line 4131
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 4133
    STACKTOP = sp; //@line 4134
    return 0; //@line 4134
   }
   break;
  }
 }
 return 0; //@line 4139
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 6513
 $3 = HEAP32[3265] | 0; //@line 6514
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 6517
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 6521
 $7 = $6 & 3; //@line 6522
 if (($7 | 0) == 1) {
  _abort(); //@line 6525
 }
 $9 = $6 & -8; //@line 6528
 $10 = $2 + $9 | 0; //@line 6529
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 6534
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 6540
   $17 = $13 + $9 | 0; //@line 6541
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 6544
   }
   if ((HEAP32[3266] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 6550
    $106 = HEAP32[$105 >> 2] | 0; //@line 6551
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 6555
     $$1382 = $17; //@line 6555
     $114 = $16; //@line 6555
     break;
    }
    HEAP32[3263] = $17; //@line 6558
    HEAP32[$105 >> 2] = $106 & -2; //@line 6560
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 6563
    HEAP32[$16 + $17 >> 2] = $17; //@line 6565
    return;
   }
   $21 = $13 >>> 3; //@line 6568
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 6572
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 6574
    $28 = 13084 + ($21 << 1 << 2) | 0; //@line 6576
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 6581
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 6588
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[3261] = HEAP32[3261] & ~(1 << $21); //@line 6598
     $$1 = $16; //@line 6599
     $$1382 = $17; //@line 6599
     $114 = $16; //@line 6599
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 6605
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 6609
     }
     $41 = $26 + 8 | 0; //@line 6612
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 6616
     } else {
      _abort(); //@line 6618
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 6623
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 6624
    $$1 = $16; //@line 6625
    $$1382 = $17; //@line 6625
    $114 = $16; //@line 6625
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 6629
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 6631
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 6635
     $60 = $59 + 4 | 0; //@line 6636
     $61 = HEAP32[$60 >> 2] | 0; //@line 6637
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 6640
      if (!$63) {
       $$3 = 0; //@line 6643
       break;
      } else {
       $$1387 = $63; //@line 6646
       $$1390 = $59; //@line 6646
      }
     } else {
      $$1387 = $61; //@line 6649
      $$1390 = $60; //@line 6649
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 6652
      $66 = HEAP32[$65 >> 2] | 0; //@line 6653
      if ($66 | 0) {
       $$1387 = $66; //@line 6656
       $$1390 = $65; //@line 6656
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 6659
      $69 = HEAP32[$68 >> 2] | 0; //@line 6660
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 6665
       $$1390 = $68; //@line 6665
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 6670
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 6673
      $$3 = $$1387; //@line 6674
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 6679
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 6682
     }
     $53 = $51 + 12 | 0; //@line 6685
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 6689
     }
     $56 = $48 + 8 | 0; //@line 6692
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 6696
      HEAP32[$56 >> 2] = $51; //@line 6697
      $$3 = $48; //@line 6698
      break;
     } else {
      _abort(); //@line 6701
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 6708
    $$1382 = $17; //@line 6708
    $114 = $16; //@line 6708
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 6711
    $75 = 13348 + ($74 << 2) | 0; //@line 6712
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 6717
      if (!$$3) {
       HEAP32[3262] = HEAP32[3262] & ~(1 << $74); //@line 6724
       $$1 = $16; //@line 6725
       $$1382 = $17; //@line 6725
       $114 = $16; //@line 6725
       break L10;
      }
     } else {
      if ((HEAP32[3265] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 6732
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 6740
       if (!$$3) {
        $$1 = $16; //@line 6743
        $$1382 = $17; //@line 6743
        $114 = $16; //@line 6743
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[3265] | 0; //@line 6751
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 6754
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 6758
    $92 = $16 + 16 | 0; //@line 6759
    $93 = HEAP32[$92 >> 2] | 0; //@line 6760
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 6766
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 6770
       HEAP32[$93 + 24 >> 2] = $$3; //@line 6772
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 6778
    if (!$99) {
     $$1 = $16; //@line 6781
     $$1382 = $17; //@line 6781
     $114 = $16; //@line 6781
    } else {
     if ((HEAP32[3265] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 6786
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 6790
      HEAP32[$99 + 24 >> 2] = $$3; //@line 6792
      $$1 = $16; //@line 6793
      $$1382 = $17; //@line 6793
      $114 = $16; //@line 6793
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 6799
   $$1382 = $9; //@line 6799
   $114 = $2; //@line 6799
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 6804
 }
 $115 = $10 + 4 | 0; //@line 6807
 $116 = HEAP32[$115 >> 2] | 0; //@line 6808
 if (!($116 & 1)) {
  _abort(); //@line 6812
 }
 if (!($116 & 2)) {
  if ((HEAP32[3267] | 0) == ($10 | 0)) {
   $124 = (HEAP32[3264] | 0) + $$1382 | 0; //@line 6822
   HEAP32[3264] = $124; //@line 6823
   HEAP32[3267] = $$1; //@line 6824
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 6827
   if (($$1 | 0) != (HEAP32[3266] | 0)) {
    return;
   }
   HEAP32[3266] = 0; //@line 6833
   HEAP32[3263] = 0; //@line 6834
   return;
  }
  if ((HEAP32[3266] | 0) == ($10 | 0)) {
   $132 = (HEAP32[3263] | 0) + $$1382 | 0; //@line 6841
   HEAP32[3263] = $132; //@line 6842
   HEAP32[3266] = $114; //@line 6843
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 6846
   HEAP32[$114 + $132 >> 2] = $132; //@line 6848
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 6852
  $138 = $116 >>> 3; //@line 6853
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 6858
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 6860
    $145 = 13084 + ($138 << 1 << 2) | 0; //@line 6862
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[3265] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 6868
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 6875
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[3261] = HEAP32[3261] & ~(1 << $138); //@line 6885
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 6891
    } else {
     if ((HEAP32[3265] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 6896
     }
     $160 = $143 + 8 | 0; //@line 6899
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 6903
     } else {
      _abort(); //@line 6905
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 6910
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 6911
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 6914
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 6916
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 6920
      $180 = $179 + 4 | 0; //@line 6921
      $181 = HEAP32[$180 >> 2] | 0; //@line 6922
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 6925
       if (!$183) {
        $$3400 = 0; //@line 6928
        break;
       } else {
        $$1398 = $183; //@line 6931
        $$1402 = $179; //@line 6931
       }
      } else {
       $$1398 = $181; //@line 6934
       $$1402 = $180; //@line 6934
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 6937
       $186 = HEAP32[$185 >> 2] | 0; //@line 6938
       if ($186 | 0) {
        $$1398 = $186; //@line 6941
        $$1402 = $185; //@line 6941
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 6944
       $189 = HEAP32[$188 >> 2] | 0; //@line 6945
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 6950
        $$1402 = $188; //@line 6950
       }
      }
      if ((HEAP32[3265] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 6956
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 6959
       $$3400 = $$1398; //@line 6960
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 6965
      if ((HEAP32[3265] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 6969
      }
      $173 = $170 + 12 | 0; //@line 6972
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 6976
      }
      $176 = $167 + 8 | 0; //@line 6979
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 6983
       HEAP32[$176 >> 2] = $170; //@line 6984
       $$3400 = $167; //@line 6985
       break;
      } else {
       _abort(); //@line 6988
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 6996
     $196 = 13348 + ($195 << 2) | 0; //@line 6997
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 7002
       if (!$$3400) {
        HEAP32[3262] = HEAP32[3262] & ~(1 << $195); //@line 7009
        break L108;
       }
      } else {
       if ((HEAP32[3265] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 7016
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 7024
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[3265] | 0; //@line 7034
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 7037
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 7041
     $213 = $10 + 16 | 0; //@line 7042
     $214 = HEAP32[$213 >> 2] | 0; //@line 7043
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 7049
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 7053
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 7055
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 7061
     if ($220 | 0) {
      if ((HEAP32[3265] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 7067
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 7071
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 7073
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 7082
  HEAP32[$114 + $137 >> 2] = $137; //@line 7084
  if (($$1 | 0) == (HEAP32[3266] | 0)) {
   HEAP32[3263] = $137; //@line 7088
   return;
  } else {
   $$2 = $137; //@line 7091
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 7095
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 7098
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 7100
  $$2 = $$1382; //@line 7101
 }
 $235 = $$2 >>> 3; //@line 7103
 if ($$2 >>> 0 < 256) {
  $238 = 13084 + ($235 << 1 << 2) | 0; //@line 7107
  $239 = HEAP32[3261] | 0; //@line 7108
  $240 = 1 << $235; //@line 7109
  if (!($239 & $240)) {
   HEAP32[3261] = $239 | $240; //@line 7114
   $$0403 = $238; //@line 7116
   $$pre$phiZ2D = $238 + 8 | 0; //@line 7116
  } else {
   $244 = $238 + 8 | 0; //@line 7118
   $245 = HEAP32[$244 >> 2] | 0; //@line 7119
   if ((HEAP32[3265] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 7123
   } else {
    $$0403 = $245; //@line 7126
    $$pre$phiZ2D = $244; //@line 7126
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 7129
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 7131
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 7133
  HEAP32[$$1 + 12 >> 2] = $238; //@line 7135
  return;
 }
 $251 = $$2 >>> 8; //@line 7138
 if (!$251) {
  $$0396 = 0; //@line 7141
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 7145
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 7149
   $257 = $251 << $256; //@line 7150
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 7153
   $262 = $257 << $260; //@line 7155
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 7158
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 7163
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 7169
  }
 }
 $276 = 13348 + ($$0396 << 2) | 0; //@line 7172
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 7174
 HEAP32[$$1 + 20 >> 2] = 0; //@line 7177
 HEAP32[$$1 + 16 >> 2] = 0; //@line 7178
 $280 = HEAP32[3262] | 0; //@line 7179
 $281 = 1 << $$0396; //@line 7180
 do {
  if (!($280 & $281)) {
   HEAP32[3262] = $280 | $281; //@line 7186
   HEAP32[$276 >> 2] = $$1; //@line 7187
   HEAP32[$$1 + 24 >> 2] = $276; //@line 7189
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 7191
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 7193
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 7201
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 7201
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 7208
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 7212
    $301 = HEAP32[$299 >> 2] | 0; //@line 7214
    if (!$301) {
     label = 121; //@line 7217
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 7220
     $$0384 = $301; //@line 7220
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[3265] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 7227
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 7230
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 7232
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 7234
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 7236
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 7241
    $309 = HEAP32[$308 >> 2] | 0; //@line 7242
    $310 = HEAP32[3265] | 0; //@line 7243
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 7249
     HEAP32[$308 >> 2] = $$1; //@line 7250
     HEAP32[$$1 + 8 >> 2] = $309; //@line 7252
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 7254
     HEAP32[$$1 + 24 >> 2] = 0; //@line 7256
     break;
    } else {
     _abort(); //@line 7259
    }
   }
  }
 } while (0);
 $319 = (HEAP32[3269] | 0) + -1 | 0; //@line 7266
 HEAP32[3269] = $319; //@line 7267
 if (!$319) {
  $$0212$in$i = 13500; //@line 7270
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 7275
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 7281
  }
 }
 HEAP32[3269] = -1; //@line 7284
 return;
}
function __ZN6C128329characterEiii__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $31 = 0, $33 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $56 = 0, $57 = 0, $6 = 0, $62 = 0, $64 = 0, $65 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 760
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 762
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 764
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 766
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 768
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 770
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 772
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 774
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 776
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 778
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 780
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 782
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 784
 $26 = HEAP8[$0 + 52 >> 0] | 0; //@line 786
 if ((HEAP32[$0 + 56 >> 2] | 0) >>> 0 > (HEAP32[___async_retval >> 2] | 0) >>> 0) {
  HEAP32[$6 >> 2] = 0; //@line 793
  $31 = $4 + 64 | 0; //@line 794
  $33 = (HEAP32[$31 >> 2] | 0) + $8 | 0; //@line 796
  HEAP32[$31 >> 2] = $33; //@line 797
  $36 = HEAP32[(HEAP32[$20 >> 2] | 0) + 128 >> 2] | 0; //@line 800
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(60) | 0; //@line 801
  $37 = FUNCTION_TABLE_ii[$36 & 31]($4) | 0; //@line 802
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 39; //@line 805
   $38 = $ReallocAsyncCtx2 + 4 | 0; //@line 806
   HEAP32[$38 >> 2] = $18; //@line 807
   $39 = $ReallocAsyncCtx2 + 8 | 0; //@line 808
   HEAP32[$39 >> 2] = $33; //@line 809
   $40 = $ReallocAsyncCtx2 + 12 | 0; //@line 810
   HEAP32[$40 >> 2] = $22; //@line 811
   $41 = $ReallocAsyncCtx2 + 16 | 0; //@line 812
   HEAP32[$41 >> 2] = $24; //@line 813
   $42 = $ReallocAsyncCtx2 + 20 | 0; //@line 814
   HEAP8[$42 >> 0] = $26; //@line 815
   $43 = $ReallocAsyncCtx2 + 24 | 0; //@line 816
   HEAP32[$43 >> 2] = $31; //@line 817
   $44 = $ReallocAsyncCtx2 + 28 | 0; //@line 818
   HEAP32[$44 >> 2] = $6; //@line 819
   $45 = $ReallocAsyncCtx2 + 32 | 0; //@line 820
   HEAP8[$45 >> 0] = $12; //@line 821
   $46 = $ReallocAsyncCtx2 + 36 | 0; //@line 822
   HEAP32[$46 >> 2] = $4; //@line 823
   $47 = $ReallocAsyncCtx2 + 40 | 0; //@line 824
   HEAP32[$47 >> 2] = $10; //@line 825
   $48 = $ReallocAsyncCtx2 + 44 | 0; //@line 826
   HEAP32[$48 >> 2] = $14; //@line 827
   $49 = $ReallocAsyncCtx2 + 48 | 0; //@line 828
   HEAP32[$49 >> 2] = $16; //@line 829
   $50 = $ReallocAsyncCtx2 + 52 | 0; //@line 830
   HEAP32[$50 >> 2] = $2; //@line 831
   $51 = $ReallocAsyncCtx2 + 56 | 0; //@line 832
   HEAP32[$51 >> 2] = $8; //@line 833
   sp = STACKTOP; //@line 834
   return;
  }
  HEAP32[___async_retval >> 2] = $37; //@line 838
  ___async_unwind = 0; //@line 839
  HEAP32[$ReallocAsyncCtx2 >> 2] = 39; //@line 840
  $38 = $ReallocAsyncCtx2 + 4 | 0; //@line 841
  HEAP32[$38 >> 2] = $18; //@line 842
  $39 = $ReallocAsyncCtx2 + 8 | 0; //@line 843
  HEAP32[$39 >> 2] = $33; //@line 844
  $40 = $ReallocAsyncCtx2 + 12 | 0; //@line 845
  HEAP32[$40 >> 2] = $22; //@line 846
  $41 = $ReallocAsyncCtx2 + 16 | 0; //@line 847
  HEAP32[$41 >> 2] = $24; //@line 848
  $42 = $ReallocAsyncCtx2 + 20 | 0; //@line 849
  HEAP8[$42 >> 0] = $26; //@line 850
  $43 = $ReallocAsyncCtx2 + 24 | 0; //@line 851
  HEAP32[$43 >> 2] = $31; //@line 852
  $44 = $ReallocAsyncCtx2 + 28 | 0; //@line 853
  HEAP32[$44 >> 2] = $6; //@line 854
  $45 = $ReallocAsyncCtx2 + 32 | 0; //@line 855
  HEAP8[$45 >> 0] = $12; //@line 856
  $46 = $ReallocAsyncCtx2 + 36 | 0; //@line 857
  HEAP32[$46 >> 2] = $4; //@line 858
  $47 = $ReallocAsyncCtx2 + 40 | 0; //@line 859
  HEAP32[$47 >> 2] = $10; //@line 860
  $48 = $ReallocAsyncCtx2 + 44 | 0; //@line 861
  HEAP32[$48 >> 2] = $14; //@line 862
  $49 = $ReallocAsyncCtx2 + 48 | 0; //@line 863
  HEAP32[$49 >> 2] = $16; //@line 864
  $50 = $ReallocAsyncCtx2 + 52 | 0; //@line 865
  HEAP32[$50 >> 2] = $2; //@line 866
  $51 = $ReallocAsyncCtx2 + 56 | 0; //@line 867
  HEAP32[$51 >> 2] = $8; //@line 868
  sp = STACKTOP; //@line 869
  return;
 }
 $56 = (HEAP32[$18 >> 2] | 0) + ((Math_imul($22 + -32 | 0, $24) | 0) + 4) | 0; //@line 876
 $57 = HEAP8[$56 >> 0] | 0; //@line 877
 if ($26 << 24 >> 24) {
  if ($12 << 24 >> 24) {
   $62 = (0 >>> 3 & 31) + 1 | 0; //@line 884
   $64 = 1 << 0; //@line 886
   $65 = 0 + $10 | 0; //@line 887
   $75 = HEAP32[(HEAP32[$4 >> 2] | 0) + 120 >> 2] | 0; //@line 897
   $76 = 0 + $16 | 0; //@line 898
   if (!($64 & (HEAPU8[$56 + ($62 + 0) >> 0] | 0))) {
    $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 900
    FUNCTION_TABLE_viiii[$75 & 7]($4, $76, $65, 0); //@line 901
    if (___async) {
     HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 904
     $92 = $ReallocAsyncCtx4 + 4 | 0; //@line 905
     HEAP32[$92 >> 2] = 0; //@line 906
     $93 = $ReallocAsyncCtx4 + 8 | 0; //@line 907
     HEAP32[$93 >> 2] = $2; //@line 908
     $94 = $ReallocAsyncCtx4 + 12 | 0; //@line 909
     HEAP32[$94 >> 2] = 0; //@line 910
     $95 = $ReallocAsyncCtx4 + 16 | 0; //@line 911
     HEAP32[$95 >> 2] = $8; //@line 912
     $96 = $ReallocAsyncCtx4 + 20 | 0; //@line 913
     HEAP32[$96 >> 2] = $14; //@line 914
     $97 = $ReallocAsyncCtx4 + 24 | 0; //@line 915
     HEAP32[$97 >> 2] = $62; //@line 916
     $98 = $ReallocAsyncCtx4 + 28 | 0; //@line 917
     HEAP32[$98 >> 2] = $56; //@line 918
     $99 = $ReallocAsyncCtx4 + 32 | 0; //@line 919
     HEAP32[$99 >> 2] = $64; //@line 920
     $100 = $ReallocAsyncCtx4 + 36 | 0; //@line 921
     HEAP32[$100 >> 2] = $4; //@line 922
     $101 = $ReallocAsyncCtx4 + 40 | 0; //@line 923
     HEAP32[$101 >> 2] = $16; //@line 924
     $102 = $ReallocAsyncCtx4 + 44 | 0; //@line 925
     HEAP32[$102 >> 2] = $4; //@line 926
     $103 = $ReallocAsyncCtx4 + 48 | 0; //@line 927
     HEAP32[$103 >> 2] = $65; //@line 928
     $104 = $ReallocAsyncCtx4 + 52 | 0; //@line 929
     HEAP8[$104 >> 0] = $57; //@line 930
     $105 = $ReallocAsyncCtx4 + 56 | 0; //@line 931
     HEAP32[$105 >> 2] = $6; //@line 932
     $106 = $ReallocAsyncCtx4 + 60 | 0; //@line 933
     HEAP32[$106 >> 2] = $10; //@line 934
     sp = STACKTOP; //@line 935
     return;
    }
    ___async_unwind = 0; //@line 938
    HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 939
    $92 = $ReallocAsyncCtx4 + 4 | 0; //@line 940
    HEAP32[$92 >> 2] = 0; //@line 941
    $93 = $ReallocAsyncCtx4 + 8 | 0; //@line 942
    HEAP32[$93 >> 2] = $2; //@line 943
    $94 = $ReallocAsyncCtx4 + 12 | 0; //@line 944
    HEAP32[$94 >> 2] = 0; //@line 945
    $95 = $ReallocAsyncCtx4 + 16 | 0; //@line 946
    HEAP32[$95 >> 2] = $8; //@line 947
    $96 = $ReallocAsyncCtx4 + 20 | 0; //@line 948
    HEAP32[$96 >> 2] = $14; //@line 949
    $97 = $ReallocAsyncCtx4 + 24 | 0; //@line 950
    HEAP32[$97 >> 2] = $62; //@line 951
    $98 = $ReallocAsyncCtx4 + 28 | 0; //@line 952
    HEAP32[$98 >> 2] = $56; //@line 953
    $99 = $ReallocAsyncCtx4 + 32 | 0; //@line 954
    HEAP32[$99 >> 2] = $64; //@line 955
    $100 = $ReallocAsyncCtx4 + 36 | 0; //@line 956
    HEAP32[$100 >> 2] = $4; //@line 957
    $101 = $ReallocAsyncCtx4 + 40 | 0; //@line 958
    HEAP32[$101 >> 2] = $16; //@line 959
    $102 = $ReallocAsyncCtx4 + 44 | 0; //@line 960
    HEAP32[$102 >> 2] = $4; //@line 961
    $103 = $ReallocAsyncCtx4 + 48 | 0; //@line 962
    HEAP32[$103 >> 2] = $65; //@line 963
    $104 = $ReallocAsyncCtx4 + 52 | 0; //@line 964
    HEAP8[$104 >> 0] = $57; //@line 965
    $105 = $ReallocAsyncCtx4 + 56 | 0; //@line 966
    HEAP32[$105 >> 2] = $6; //@line 967
    $106 = $ReallocAsyncCtx4 + 60 | 0; //@line 968
    HEAP32[$106 >> 2] = $10; //@line 969
    sp = STACKTOP; //@line 970
    return;
   } else {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 973
    FUNCTION_TABLE_viiii[$75 & 7]($4, $76, $65, 1); //@line 974
    if (___async) {
     HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 977
     $77 = $ReallocAsyncCtx3 + 4 | 0; //@line 978
     HEAP32[$77 >> 2] = 0; //@line 979
     $78 = $ReallocAsyncCtx3 + 8 | 0; //@line 980
     HEAP32[$78 >> 2] = $2; //@line 981
     $79 = $ReallocAsyncCtx3 + 12 | 0; //@line 982
     HEAP32[$79 >> 2] = 0; //@line 983
     $80 = $ReallocAsyncCtx3 + 16 | 0; //@line 984
     HEAP32[$80 >> 2] = $8; //@line 985
     $81 = $ReallocAsyncCtx3 + 20 | 0; //@line 986
     HEAP32[$81 >> 2] = $14; //@line 987
     $82 = $ReallocAsyncCtx3 + 24 | 0; //@line 988
     HEAP32[$82 >> 2] = $62; //@line 989
     $83 = $ReallocAsyncCtx3 + 28 | 0; //@line 990
     HEAP32[$83 >> 2] = $56; //@line 991
     $84 = $ReallocAsyncCtx3 + 32 | 0; //@line 992
     HEAP32[$84 >> 2] = $64; //@line 993
     $85 = $ReallocAsyncCtx3 + 36 | 0; //@line 994
     HEAP32[$85 >> 2] = $4; //@line 995
     $86 = $ReallocAsyncCtx3 + 40 | 0; //@line 996
     HEAP32[$86 >> 2] = $16; //@line 997
     $87 = $ReallocAsyncCtx3 + 44 | 0; //@line 998
     HEAP32[$87 >> 2] = $4; //@line 999
     $88 = $ReallocAsyncCtx3 + 48 | 0; //@line 1000
     HEAP32[$88 >> 2] = $65; //@line 1001
     $89 = $ReallocAsyncCtx3 + 52 | 0; //@line 1002
     HEAP8[$89 >> 0] = $57; //@line 1003
     $90 = $ReallocAsyncCtx3 + 56 | 0; //@line 1004
     HEAP32[$90 >> 2] = $6; //@line 1005
     $91 = $ReallocAsyncCtx3 + 60 | 0; //@line 1006
     HEAP32[$91 >> 2] = $10; //@line 1007
     sp = STACKTOP; //@line 1008
     return;
    }
    ___async_unwind = 0; //@line 1011
    HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 1012
    $77 = $ReallocAsyncCtx3 + 4 | 0; //@line 1013
    HEAP32[$77 >> 2] = 0; //@line 1014
    $78 = $ReallocAsyncCtx3 + 8 | 0; //@line 1015
    HEAP32[$78 >> 2] = $2; //@line 1016
    $79 = $ReallocAsyncCtx3 + 12 | 0; //@line 1017
    HEAP32[$79 >> 2] = 0; //@line 1018
    $80 = $ReallocAsyncCtx3 + 16 | 0; //@line 1019
    HEAP32[$80 >> 2] = $8; //@line 1020
    $81 = $ReallocAsyncCtx3 + 20 | 0; //@line 1021
    HEAP32[$81 >> 2] = $14; //@line 1022
    $82 = $ReallocAsyncCtx3 + 24 | 0; //@line 1023
    HEAP32[$82 >> 2] = $62; //@line 1024
    $83 = $ReallocAsyncCtx3 + 28 | 0; //@line 1025
    HEAP32[$83 >> 2] = $56; //@line 1026
    $84 = $ReallocAsyncCtx3 + 32 | 0; //@line 1027
    HEAP32[$84 >> 2] = $64; //@line 1028
    $85 = $ReallocAsyncCtx3 + 36 | 0; //@line 1029
    HEAP32[$85 >> 2] = $4; //@line 1030
    $86 = $ReallocAsyncCtx3 + 40 | 0; //@line 1031
    HEAP32[$86 >> 2] = $16; //@line 1032
    $87 = $ReallocAsyncCtx3 + 44 | 0; //@line 1033
    HEAP32[$87 >> 2] = $4; //@line 1034
    $88 = $ReallocAsyncCtx3 + 48 | 0; //@line 1035
    HEAP32[$88 >> 2] = $65; //@line 1036
    $89 = $ReallocAsyncCtx3 + 52 | 0; //@line 1037
    HEAP8[$89 >> 0] = $57; //@line 1038
    $90 = $ReallocAsyncCtx3 + 56 | 0; //@line 1039
    HEAP32[$90 >> 2] = $6; //@line 1040
    $91 = $ReallocAsyncCtx3 + 60 | 0; //@line 1041
    HEAP32[$91 >> 2] = $10; //@line 1042
    sp = STACKTOP; //@line 1043
    return;
   }
  }
 }
 HEAP32[$6 >> 2] = (HEAP32[$6 >> 2] | 0) + ($57 & 255); //@line 1051
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $100 = 0, $104 = 0, $105 = 0, $106 = 0, $122 = 0, $13 = 0, $136 = 0, $19 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $61 = 0, $69 = 0, $72 = 0, $73 = 0, $81 = 0, $84 = 0, $87 = 0, $90 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13487
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 13493
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 13502
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 13507
      $19 = $1 + 44 | 0; //@line 13508
      if ((HEAP32[$19 >> 2] | 0) == 4) {
       break;
      }
      $25 = $0 + 16 + (HEAP32[$0 + 12 >> 2] << 3) | 0; //@line 13517
      $26 = $1 + 52 | 0; //@line 13518
      $27 = $1 + 53 | 0; //@line 13519
      $28 = $1 + 54 | 0; //@line 13520
      $29 = $0 + 8 | 0; //@line 13521
      $30 = $1 + 24 | 0; //@line 13522
      $$081$off0 = 0; //@line 13523
      $$084 = $0 + 16 | 0; //@line 13523
      $$085$off0 = 0; //@line 13523
      L10 : while (1) {
       if ($$084 >>> 0 >= $25 >>> 0) {
        $$283$off0 = $$081$off0; //@line 13527
        label = 20; //@line 13528
        break;
       }
       HEAP8[$26 >> 0] = 0; //@line 13531
       HEAP8[$27 >> 0] = 0; //@line 13532
       $AsyncCtx15 = _emscripten_alloc_async_context(56, sp) | 0; //@line 13533
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084, $1, $2, $2, 1, $4); //@line 13534
       if (___async) {
        label = 12; //@line 13537
        break;
       }
       _emscripten_free_async_context($AsyncCtx15 | 0); //@line 13540
       if (HEAP8[$28 >> 0] | 0) {
        $$283$off0 = $$081$off0; //@line 13544
        label = 20; //@line 13545
        break;
       }
       do {
        if (!(HEAP8[$27 >> 0] | 0)) {
         $$182$off0 = $$081$off0; //@line 13552
         $$186$off0 = $$085$off0; //@line 13552
        } else {
         if (!(HEAP8[$26 >> 0] | 0)) {
          if (!(HEAP32[$29 >> 2] & 1)) {
           $$283$off0 = 1; //@line 13561
           label = 20; //@line 13562
           break L10;
          } else {
           $$182$off0 = 1; //@line 13565
           $$186$off0 = $$085$off0; //@line 13565
           break;
          }
         }
         if ((HEAP32[$30 >> 2] | 0) == 1) {
          label = 25; //@line 13572
          break L10;
         }
         if (!(HEAP32[$29 >> 2] & 2)) {
          label = 25; //@line 13579
          break L10;
         } else {
          $$182$off0 = 1; //@line 13582
          $$186$off0 = 1; //@line 13582
         }
        }
       } while (0);
       $$081$off0 = $$182$off0; //@line 13587
       $$084 = $$084 + 8 | 0; //@line 13587
       $$085$off0 = $$186$off0; //@line 13587
      }
      if ((label | 0) == 12) {
       HEAP32[$AsyncCtx15 >> 2] = 194; //@line 13590
       HEAP32[$AsyncCtx15 + 4 >> 2] = $28; //@line 13592
       HEAP32[$AsyncCtx15 + 8 >> 2] = $19; //@line 13594
       HEAP32[$AsyncCtx15 + 12 >> 2] = $2; //@line 13596
       HEAP32[$AsyncCtx15 + 16 >> 2] = $13; //@line 13598
       HEAP32[$AsyncCtx15 + 20 >> 2] = $1; //@line 13600
       HEAP32[$AsyncCtx15 + 24 >> 2] = $30; //@line 13602
       HEAP32[$AsyncCtx15 + 28 >> 2] = $25; //@line 13604
       HEAP32[$AsyncCtx15 + 32 >> 2] = $29; //@line 13606
       HEAP8[$AsyncCtx15 + 36 >> 0] = $$081$off0 & 1; //@line 13609
       HEAP8[$AsyncCtx15 + 37 >> 0] = $$085$off0 & 1; //@line 13612
       HEAP32[$AsyncCtx15 + 40 >> 2] = $$084; //@line 13614
       HEAP32[$AsyncCtx15 + 44 >> 2] = $27; //@line 13616
       HEAP32[$AsyncCtx15 + 48 >> 2] = $26; //@line 13618
       HEAP8[$AsyncCtx15 + 52 >> 0] = $4 & 1; //@line 13621
       sp = STACKTOP; //@line 13622
       return;
      }
      do {
       if ((label | 0) == 20) {
        if (!$$085$off0) {
         HEAP32[$13 >> 2] = $2; //@line 13628
         $61 = $1 + 40 | 0; //@line 13629
         HEAP32[$61 >> 2] = (HEAP32[$61 >> 2] | 0) + 1; //@line 13632
         if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
          if ((HEAP32[$30 >> 2] | 0) == 2) {
           HEAP8[$28 >> 0] = 1; //@line 13640
           if ($$283$off0) {
            label = 25; //@line 13642
            break;
           } else {
            $69 = 4; //@line 13645
            break;
           }
          }
         }
        }
        if ($$283$off0) {
         label = 25; //@line 13652
        } else {
         $69 = 4; //@line 13654
        }
       }
      } while (0);
      if ((label | 0) == 25) {
       $69 = 3; //@line 13659
      }
      HEAP32[$19 >> 2] = $69; //@line 13661
      break;
     }
    }
    if (($3 | 0) != 1) {
     break;
    }
    HEAP32[$1 + 32 >> 2] = 1; //@line 13670
    break;
   }
   $72 = HEAP32[$0 + 12 >> 2] | 0; //@line 13675
   $73 = $0 + 16 + ($72 << 3) | 0; //@line 13676
   $AsyncCtx11 = _emscripten_alloc_async_context(32, sp) | 0; //@line 13677
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0 + 16 | 0, $1, $2, $3, $4); //@line 13678
   if (___async) {
    HEAP32[$AsyncCtx11 >> 2] = 195; //@line 13681
    HEAP32[$AsyncCtx11 + 4 >> 2] = $73; //@line 13683
    HEAP32[$AsyncCtx11 + 8 >> 2] = $0; //@line 13685
    HEAP32[$AsyncCtx11 + 12 >> 2] = $1; //@line 13687
    HEAP32[$AsyncCtx11 + 16 >> 2] = $2; //@line 13689
    HEAP32[$AsyncCtx11 + 20 >> 2] = $3; //@line 13691
    HEAP8[$AsyncCtx11 + 24 >> 0] = $4 & 1; //@line 13694
    HEAP32[$AsyncCtx11 + 28 >> 2] = $72; //@line 13696
    sp = STACKTOP; //@line 13697
    return;
   }
   _emscripten_free_async_context($AsyncCtx11 | 0); //@line 13700
   $81 = $0 + 24 | 0; //@line 13701
   if (($72 | 0) > 1) {
    $84 = HEAP32[$0 + 8 >> 2] | 0; //@line 13705
    if (!($84 & 2)) {
     $87 = $1 + 36 | 0; //@line 13709
     if ((HEAP32[$87 >> 2] | 0) != 1) {
      if (!($84 & 1)) {
       $106 = $1 + 54 | 0; //@line 13716
       $$2 = $81; //@line 13717
       while (1) {
        if (HEAP8[$106 >> 0] | 0) {
         break L1;
        }
        if ((HEAP32[$87 >> 2] | 0) == 1) {
         break L1;
        }
        $AsyncCtx = _emscripten_alloc_async_context(36, sp) | 0; //@line 13729
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2, $1, $2, $3, $4); //@line 13730
        if (___async) {
         break;
        }
        _emscripten_free_async_context($AsyncCtx | 0); //@line 13735
        $136 = $$2 + 8 | 0; //@line 13736
        if ($136 >>> 0 < $73 >>> 0) {
         $$2 = $136; //@line 13739
        } else {
         break L1;
        }
       }
       HEAP32[$AsyncCtx >> 2] = 198; //@line 13744
       HEAP32[$AsyncCtx + 4 >> 2] = $$2; //@line 13746
       HEAP32[$AsyncCtx + 8 >> 2] = $73; //@line 13748
       HEAP32[$AsyncCtx + 12 >> 2] = $106; //@line 13750
       HEAP32[$AsyncCtx + 16 >> 2] = $87; //@line 13752
       HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 13754
       HEAP32[$AsyncCtx + 24 >> 2] = $2; //@line 13756
       HEAP32[$AsyncCtx + 28 >> 2] = $3; //@line 13758
       HEAP8[$AsyncCtx + 32 >> 0] = $4 & 1; //@line 13761
       sp = STACKTOP; //@line 13762
       return;
      }
      $104 = $1 + 24 | 0; //@line 13765
      $105 = $1 + 54 | 0; //@line 13766
      $$1 = $81; //@line 13767
      while (1) {
       if (HEAP8[$105 >> 0] | 0) {
        break L1;
       }
       if ((HEAP32[$87 >> 2] | 0) == 1) {
        if ((HEAP32[$104 >> 2] | 0) == 1) {
         break L1;
        }
       }
       $AsyncCtx3 = _emscripten_alloc_async_context(40, sp) | 0; //@line 13783
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1, $1, $2, $3, $4); //@line 13784
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13789
       $122 = $$1 + 8 | 0; //@line 13790
       if ($122 >>> 0 < $73 >>> 0) {
        $$1 = $122; //@line 13793
       } else {
        break L1;
       }
      }
      HEAP32[$AsyncCtx3 >> 2] = 197; //@line 13798
      HEAP32[$AsyncCtx3 + 4 >> 2] = $$1; //@line 13800
      HEAP32[$AsyncCtx3 + 8 >> 2] = $73; //@line 13802
      HEAP32[$AsyncCtx3 + 12 >> 2] = $105; //@line 13804
      HEAP32[$AsyncCtx3 + 16 >> 2] = $87; //@line 13806
      HEAP32[$AsyncCtx3 + 20 >> 2] = $104; //@line 13808
      HEAP32[$AsyncCtx3 + 24 >> 2] = $1; //@line 13810
      HEAP32[$AsyncCtx3 + 28 >> 2] = $2; //@line 13812
      HEAP32[$AsyncCtx3 + 32 >> 2] = $3; //@line 13814
      HEAP8[$AsyncCtx3 + 36 >> 0] = $4 & 1; //@line 13817
      sp = STACKTOP; //@line 13818
      return;
     }
    }
    $90 = $1 + 54 | 0; //@line 13822
    $$0 = $81; //@line 13823
    while (1) {
     if (HEAP8[$90 >> 0] | 0) {
      break L1;
     }
     $AsyncCtx7 = _emscripten_alloc_async_context(32, sp) | 0; //@line 13830
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0, $1, $2, $3, $4); //@line 13831
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx7 | 0); //@line 13836
     $100 = $$0 + 8 | 0; //@line 13837
     if ($100 >>> 0 < $73 >>> 0) {
      $$0 = $100; //@line 13840
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx7 >> 2] = 196; //@line 13845
    HEAP32[$AsyncCtx7 + 4 >> 2] = $$0; //@line 13847
    HEAP32[$AsyncCtx7 + 8 >> 2] = $73; //@line 13849
    HEAP32[$AsyncCtx7 + 12 >> 2] = $90; //@line 13851
    HEAP32[$AsyncCtx7 + 16 >> 2] = $1; //@line 13853
    HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 13855
    HEAP32[$AsyncCtx7 + 24 >> 2] = $3; //@line 13857
    HEAP8[$AsyncCtx7 + 28 >> 0] = $4 & 1; //@line 13860
    sp = STACKTOP; //@line 13861
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
 $n_sroa_0_0_extract_trunc = $a$0; //@line 6714
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 6715
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 6716
 $d_sroa_0_0_extract_trunc = $b$0; //@line 6717
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 6718
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 6719
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 6721
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 6724
    HEAP32[$rem + 4 >> 2] = 0; //@line 6725
   }
   $_0$1 = 0; //@line 6727
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 6728
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6729
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 6732
    $_0$0 = 0; //@line 6733
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6734
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 6736
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 6737
   $_0$1 = 0; //@line 6738
   $_0$0 = 0; //@line 6739
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6740
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 6743
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 6748
     HEAP32[$rem + 4 >> 2] = 0; //@line 6749
    }
    $_0$1 = 0; //@line 6751
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 6752
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6753
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 6757
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 6758
    }
    $_0$1 = 0; //@line 6760
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 6761
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6762
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 6764
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 6767
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 6768
    }
    $_0$1 = 0; //@line 6770
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 6771
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6772
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 6775
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 6777
    $58 = 31 - $51 | 0; //@line 6778
    $sr_1_ph = $57; //@line 6779
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 6780
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 6781
    $q_sroa_0_1_ph = 0; //@line 6782
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 6783
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 6787
    $_0$0 = 0; //@line 6788
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6789
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 6791
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 6792
   $_0$1 = 0; //@line 6793
   $_0$0 = 0; //@line 6794
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6795
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 6799
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 6801
     $126 = 31 - $119 | 0; //@line 6802
     $130 = $119 - 31 >> 31; //@line 6803
     $sr_1_ph = $125; //@line 6804
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 6805
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 6806
     $q_sroa_0_1_ph = 0; //@line 6807
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 6808
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 6812
     $_0$0 = 0; //@line 6813
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6814
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 6816
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 6817
    $_0$1 = 0; //@line 6818
    $_0$0 = 0; //@line 6819
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6820
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 6822
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 6825
    $89 = 64 - $88 | 0; //@line 6826
    $91 = 32 - $88 | 0; //@line 6827
    $92 = $91 >> 31; //@line 6828
    $95 = $88 - 32 | 0; //@line 6829
    $105 = $95 >> 31; //@line 6830
    $sr_1_ph = $88; //@line 6831
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 6832
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 6833
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 6834
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 6835
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 6839
    HEAP32[$rem + 4 >> 2] = 0; //@line 6840
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 6843
    $_0$0 = $a$0 | 0 | 0; //@line 6844
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6845
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 6847
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 6848
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 6849
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6850
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 6855
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 6856
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 6857
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 6858
  $carry_0_lcssa$1 = 0; //@line 6859
  $carry_0_lcssa$0 = 0; //@line 6860
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 6862
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 6863
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 6864
  $137$1 = tempRet0; //@line 6865
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 6866
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 6867
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 6868
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 6869
  $sr_1202 = $sr_1_ph; //@line 6870
  $carry_0203 = 0; //@line 6871
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 6873
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 6874
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 6875
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 6876
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 6877
   $150$1 = tempRet0; //@line 6878
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 6879
   $carry_0203 = $151$0 & 1; //@line 6880
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 6882
   $r_sroa_1_1200 = tempRet0; //@line 6883
   $sr_1202 = $sr_1202 - 1 | 0; //@line 6884
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 6896
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 6897
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 6898
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 6899
  $carry_0_lcssa$1 = 0; //@line 6900
  $carry_0_lcssa$0 = $carry_0203; //@line 6901
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 6903
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 6904
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 6907
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 6908
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 6910
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 6911
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 6912
}
function __ZN6C128329characterEiii__async_cb_20($0) {
 $0 = $0 | 0;
 var $$04142$us = 0, $$043$us$reg2mem$0 = 0, $$reg2mem$0 = 0, $$reg2mem17$0 = 0, $$reg2mem21$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $4 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1511
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1515
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1517
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1519
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1521
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1523
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1525
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1527
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1529
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1531
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1533
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1535
 $26 = HEAP8[$0 + 52 >> 0] | 0; //@line 1537
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 1539
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 1541
 $79 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 1542
 do {
  if (($79 | 0) == ($4 | 0)) {
   $32 = $6 + 1 | 0; //@line 1546
   if (($32 | 0) != ($8 | 0)) {
    $$04142$us = 0; //@line 1555
    $$043$us$reg2mem$0 = $32; //@line 1555
    $$reg2mem$0 = ($32 >>> 3 & 31) + 1 | 0; //@line 1555
    $$reg2mem17$0 = 1 << ($32 & 7); //@line 1555
    $$reg2mem21$0 = $32 + $30 | 0; //@line 1555
    break;
   }
   HEAP32[$28 >> 2] = (HEAP32[$28 >> 2] | 0) + ($26 & 255); //@line 1561
   return;
  } else {
   $$04142$us = $79; //@line 1564
   $$043$us$reg2mem$0 = $6; //@line 1564
   $$reg2mem$0 = $12; //@line 1564
   $$reg2mem17$0 = $16; //@line 1564
   $$reg2mem21$0 = $24; //@line 1564
  }
 } while (0);
 $44 = ($$reg2mem17$0 & (HEAPU8[$14 + ($$reg2mem$0 + (Math_imul($$04142$us, $10) | 0)) >> 0] | 0) | 0) == 0; //@line 1573
 $47 = HEAP32[(HEAP32[$18 >> 2] | 0) + 120 >> 2] | 0; //@line 1576
 $48 = $$04142$us + $20 | 0; //@line 1577
 if ($44) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 1579
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 0); //@line 1580
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 1583
   $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 1584
   HEAP32[$64 >> 2] = $$04142$us; //@line 1585
   $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 1586
   HEAP32[$65 >> 2] = $4; //@line 1587
   $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 1588
   HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 1589
   $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 1590
   HEAP32[$67 >> 2] = $8; //@line 1591
   $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 1592
   HEAP32[$68 >> 2] = $10; //@line 1593
   $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 1594
   HEAP32[$69 >> 2] = $$reg2mem$0; //@line 1595
   $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 1596
   HEAP32[$70 >> 2] = $14; //@line 1597
   $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 1598
   HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 1599
   $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 1600
   HEAP32[$72 >> 2] = $18; //@line 1601
   $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 1602
   HEAP32[$73 >> 2] = $20; //@line 1603
   $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 1604
   HEAP32[$74 >> 2] = $22; //@line 1605
   $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 1606
   HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 1607
   $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 1608
   HEAP8[$76 >> 0] = $26; //@line 1609
   $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 1610
   HEAP32[$77 >> 2] = $28; //@line 1611
   $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 1612
   HEAP32[$78 >> 2] = $30; //@line 1613
   sp = STACKTOP; //@line 1614
   return;
  }
  ___async_unwind = 0; //@line 1617
  HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 1618
  $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 1619
  HEAP32[$64 >> 2] = $$04142$us; //@line 1620
  $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 1621
  HEAP32[$65 >> 2] = $4; //@line 1622
  $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 1623
  HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 1624
  $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 1625
  HEAP32[$67 >> 2] = $8; //@line 1626
  $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 1627
  HEAP32[$68 >> 2] = $10; //@line 1628
  $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 1629
  HEAP32[$69 >> 2] = $$reg2mem$0; //@line 1630
  $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 1631
  HEAP32[$70 >> 2] = $14; //@line 1632
  $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 1633
  HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 1634
  $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 1635
  HEAP32[$72 >> 2] = $18; //@line 1636
  $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 1637
  HEAP32[$73 >> 2] = $20; //@line 1638
  $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 1639
  HEAP32[$74 >> 2] = $22; //@line 1640
  $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 1641
  HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 1642
  $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 1643
  HEAP8[$76 >> 0] = $26; //@line 1644
  $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 1645
  HEAP32[$77 >> 2] = $28; //@line 1646
  $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 1647
  HEAP32[$78 >> 2] = $30; //@line 1648
  sp = STACKTOP; //@line 1649
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 1652
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 1); //@line 1653
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 1656
   $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 1657
   HEAP32[$49 >> 2] = $$04142$us; //@line 1658
   $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 1659
   HEAP32[$50 >> 2] = $4; //@line 1660
   $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 1661
   HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 1662
   $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 1663
   HEAP32[$52 >> 2] = $8; //@line 1664
   $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 1665
   HEAP32[$53 >> 2] = $10; //@line 1666
   $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 1667
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 1668
   $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 1669
   HEAP32[$55 >> 2] = $14; //@line 1670
   $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 1671
   HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 1672
   $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 1673
   HEAP32[$57 >> 2] = $18; //@line 1674
   $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 1675
   HEAP32[$58 >> 2] = $20; //@line 1676
   $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 1677
   HEAP32[$59 >> 2] = $22; //@line 1678
   $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 1679
   HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 1680
   $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 1681
   HEAP8[$61 >> 0] = $26; //@line 1682
   $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 1683
   HEAP32[$62 >> 2] = $28; //@line 1684
   $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 1685
   HEAP32[$63 >> 2] = $30; //@line 1686
   sp = STACKTOP; //@line 1687
   return;
  }
  ___async_unwind = 0; //@line 1690
  HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 1691
  $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 1692
  HEAP32[$49 >> 2] = $$04142$us; //@line 1693
  $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 1694
  HEAP32[$50 >> 2] = $4; //@line 1695
  $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 1696
  HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 1697
  $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 1698
  HEAP32[$52 >> 2] = $8; //@line 1699
  $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 1700
  HEAP32[$53 >> 2] = $10; //@line 1701
  $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 1702
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 1703
  $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 1704
  HEAP32[$55 >> 2] = $14; //@line 1705
  $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 1706
  HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 1707
  $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 1708
  HEAP32[$57 >> 2] = $18; //@line 1709
  $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 1710
  HEAP32[$58 >> 2] = $20; //@line 1711
  $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 1712
  HEAP32[$59 >> 2] = $22; //@line 1713
  $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 1714
  HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 1715
  $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 1716
  HEAP8[$61 >> 0] = $26; //@line 1717
  $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 1718
  HEAP32[$62 >> 2] = $28; //@line 1719
  $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 1720
  HEAP32[$63 >> 2] = $30; //@line 1721
  sp = STACKTOP; //@line 1722
  return;
 }
}
function __ZN6C128329characterEiii__async_cb_19($0) {
 $0 = $0 | 0;
 var $$04142$us = 0, $$043$us$reg2mem$0 = 0, $$reg2mem$0 = 0, $$reg2mem17$0 = 0, $$reg2mem21$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $4 = 0, $44 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1289
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1293
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1295
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1297
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1299
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1301
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1303
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 1305
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1307
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1309
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1311
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1313
 $26 = HEAP8[$0 + 52 >> 0] | 0; //@line 1315
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 1317
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 1319
 $79 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 1320
 do {
  if (($79 | 0) == ($4 | 0)) {
   $32 = $6 + 1 | 0; //@line 1324
   if (($32 | 0) != ($8 | 0)) {
    $$04142$us = 0; //@line 1333
    $$043$us$reg2mem$0 = $32; //@line 1333
    $$reg2mem$0 = ($32 >>> 3 & 31) + 1 | 0; //@line 1333
    $$reg2mem17$0 = 1 << ($32 & 7); //@line 1333
    $$reg2mem21$0 = $32 + $30 | 0; //@line 1333
    break;
   }
   HEAP32[$28 >> 2] = (HEAP32[$28 >> 2] | 0) + ($26 & 255); //@line 1339
   return;
  } else {
   $$04142$us = $79; //@line 1342
   $$043$us$reg2mem$0 = $6; //@line 1342
   $$reg2mem$0 = $12; //@line 1342
   $$reg2mem17$0 = $16; //@line 1342
   $$reg2mem21$0 = $24; //@line 1342
  }
 } while (0);
 $44 = ($$reg2mem17$0 & (HEAPU8[$14 + ($$reg2mem$0 + (Math_imul($$04142$us, $10) | 0)) >> 0] | 0) | 0) == 0; //@line 1351
 $47 = HEAP32[(HEAP32[$18 >> 2] | 0) + 120 >> 2] | 0; //@line 1354
 $48 = $$04142$us + $20 | 0; //@line 1355
 if ($44) {
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 1357
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 0); //@line 1358
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 1361
   $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 1362
   HEAP32[$64 >> 2] = $$04142$us; //@line 1363
   $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 1364
   HEAP32[$65 >> 2] = $4; //@line 1365
   $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 1366
   HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 1367
   $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 1368
   HEAP32[$67 >> 2] = $8; //@line 1369
   $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 1370
   HEAP32[$68 >> 2] = $10; //@line 1371
   $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 1372
   HEAP32[$69 >> 2] = $$reg2mem$0; //@line 1373
   $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 1374
   HEAP32[$70 >> 2] = $14; //@line 1375
   $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 1376
   HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 1377
   $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 1378
   HEAP32[$72 >> 2] = $18; //@line 1379
   $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 1380
   HEAP32[$73 >> 2] = $20; //@line 1381
   $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 1382
   HEAP32[$74 >> 2] = $22; //@line 1383
   $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 1384
   HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 1385
   $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 1386
   HEAP8[$76 >> 0] = $26; //@line 1387
   $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 1388
   HEAP32[$77 >> 2] = $28; //@line 1389
   $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 1390
   HEAP32[$78 >> 2] = $30; //@line 1391
   sp = STACKTOP; //@line 1392
   return;
  }
  ___async_unwind = 0; //@line 1395
  HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 1396
  $64 = $ReallocAsyncCtx4 + 4 | 0; //@line 1397
  HEAP32[$64 >> 2] = $$04142$us; //@line 1398
  $65 = $ReallocAsyncCtx4 + 8 | 0; //@line 1399
  HEAP32[$65 >> 2] = $4; //@line 1400
  $66 = $ReallocAsyncCtx4 + 12 | 0; //@line 1401
  HEAP32[$66 >> 2] = $$043$us$reg2mem$0; //@line 1402
  $67 = $ReallocAsyncCtx4 + 16 | 0; //@line 1403
  HEAP32[$67 >> 2] = $8; //@line 1404
  $68 = $ReallocAsyncCtx4 + 20 | 0; //@line 1405
  HEAP32[$68 >> 2] = $10; //@line 1406
  $69 = $ReallocAsyncCtx4 + 24 | 0; //@line 1407
  HEAP32[$69 >> 2] = $$reg2mem$0; //@line 1408
  $70 = $ReallocAsyncCtx4 + 28 | 0; //@line 1409
  HEAP32[$70 >> 2] = $14; //@line 1410
  $71 = $ReallocAsyncCtx4 + 32 | 0; //@line 1411
  HEAP32[$71 >> 2] = $$reg2mem17$0; //@line 1412
  $72 = $ReallocAsyncCtx4 + 36 | 0; //@line 1413
  HEAP32[$72 >> 2] = $18; //@line 1414
  $73 = $ReallocAsyncCtx4 + 40 | 0; //@line 1415
  HEAP32[$73 >> 2] = $20; //@line 1416
  $74 = $ReallocAsyncCtx4 + 44 | 0; //@line 1417
  HEAP32[$74 >> 2] = $22; //@line 1418
  $75 = $ReallocAsyncCtx4 + 48 | 0; //@line 1419
  HEAP32[$75 >> 2] = $$reg2mem21$0; //@line 1420
  $76 = $ReallocAsyncCtx4 + 52 | 0; //@line 1421
  HEAP8[$76 >> 0] = $26; //@line 1422
  $77 = $ReallocAsyncCtx4 + 56 | 0; //@line 1423
  HEAP32[$77 >> 2] = $28; //@line 1424
  $78 = $ReallocAsyncCtx4 + 60 | 0; //@line 1425
  HEAP32[$78 >> 2] = $30; //@line 1426
  sp = STACKTOP; //@line 1427
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 1430
  FUNCTION_TABLE_viiii[$47 & 7]($22, $48, $$reg2mem21$0, 1); //@line 1431
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 1434
   $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 1435
   HEAP32[$49 >> 2] = $$04142$us; //@line 1436
   $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 1437
   HEAP32[$50 >> 2] = $4; //@line 1438
   $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 1439
   HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 1440
   $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 1441
   HEAP32[$52 >> 2] = $8; //@line 1442
   $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 1443
   HEAP32[$53 >> 2] = $10; //@line 1444
   $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 1445
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 1446
   $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 1447
   HEAP32[$55 >> 2] = $14; //@line 1448
   $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 1449
   HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 1450
   $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 1451
   HEAP32[$57 >> 2] = $18; //@line 1452
   $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 1453
   HEAP32[$58 >> 2] = $20; //@line 1454
   $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 1455
   HEAP32[$59 >> 2] = $22; //@line 1456
   $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 1457
   HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 1458
   $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 1459
   HEAP8[$61 >> 0] = $26; //@line 1460
   $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 1461
   HEAP32[$62 >> 2] = $28; //@line 1462
   $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 1463
   HEAP32[$63 >> 2] = $30; //@line 1464
   sp = STACKTOP; //@line 1465
   return;
  }
  ___async_unwind = 0; //@line 1468
  HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 1469
  $49 = $ReallocAsyncCtx3 + 4 | 0; //@line 1470
  HEAP32[$49 >> 2] = $$04142$us; //@line 1471
  $50 = $ReallocAsyncCtx3 + 8 | 0; //@line 1472
  HEAP32[$50 >> 2] = $4; //@line 1473
  $51 = $ReallocAsyncCtx3 + 12 | 0; //@line 1474
  HEAP32[$51 >> 2] = $$043$us$reg2mem$0; //@line 1475
  $52 = $ReallocAsyncCtx3 + 16 | 0; //@line 1476
  HEAP32[$52 >> 2] = $8; //@line 1477
  $53 = $ReallocAsyncCtx3 + 20 | 0; //@line 1478
  HEAP32[$53 >> 2] = $10; //@line 1479
  $54 = $ReallocAsyncCtx3 + 24 | 0; //@line 1480
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 1481
  $55 = $ReallocAsyncCtx3 + 28 | 0; //@line 1482
  HEAP32[$55 >> 2] = $14; //@line 1483
  $56 = $ReallocAsyncCtx3 + 32 | 0; //@line 1484
  HEAP32[$56 >> 2] = $$reg2mem17$0; //@line 1485
  $57 = $ReallocAsyncCtx3 + 36 | 0; //@line 1486
  HEAP32[$57 >> 2] = $18; //@line 1487
  $58 = $ReallocAsyncCtx3 + 40 | 0; //@line 1488
  HEAP32[$58 >> 2] = $20; //@line 1489
  $59 = $ReallocAsyncCtx3 + 44 | 0; //@line 1490
  HEAP32[$59 >> 2] = $22; //@line 1491
  $60 = $ReallocAsyncCtx3 + 48 | 0; //@line 1492
  HEAP32[$60 >> 2] = $$reg2mem21$0; //@line 1493
  $61 = $ReallocAsyncCtx3 + 52 | 0; //@line 1494
  HEAP8[$61 >> 0] = $26; //@line 1495
  $62 = $ReallocAsyncCtx3 + 56 | 0; //@line 1496
  HEAP32[$62 >> 2] = $28; //@line 1497
  $63 = $ReallocAsyncCtx3 + 60 | 0; //@line 1498
  HEAP32[$63 >> 2] = $30; //@line 1499
  sp = STACKTOP; //@line 1500
  return;
 }
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3045
 STACKTOP = STACKTOP + 32 | 0; //@line 3046
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 3046
 $0 = sp; //@line 3047
 _gpio_init_out($0, 50); //@line 3048
 while (1) {
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 3051
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3052
  _wait_ms(150); //@line 3053
  if (___async) {
   label = 3; //@line 3056
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 3059
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 3061
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3062
  _wait_ms(150); //@line 3063
  if (___async) {
   label = 5; //@line 3066
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 3069
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 3071
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3072
  _wait_ms(150); //@line 3073
  if (___async) {
   label = 7; //@line 3076
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 3079
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 3081
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3082
  _wait_ms(150); //@line 3083
  if (___async) {
   label = 9; //@line 3086
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 3089
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 3091
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3092
  _wait_ms(150); //@line 3093
  if (___async) {
   label = 11; //@line 3096
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 3099
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 3101
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3102
  _wait_ms(150); //@line 3103
  if (___async) {
   label = 13; //@line 3106
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 3109
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 3111
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3112
  _wait_ms(150); //@line 3113
  if (___async) {
   label = 15; //@line 3116
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 3119
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 3121
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3122
  _wait_ms(150); //@line 3123
  if (___async) {
   label = 17; //@line 3126
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 3129
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 3131
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3132
  _wait_ms(400); //@line 3133
  if (___async) {
   label = 19; //@line 3136
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 3139
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 3141
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3142
  _wait_ms(400); //@line 3143
  if (___async) {
   label = 21; //@line 3146
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 3149
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 3151
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3152
  _wait_ms(400); //@line 3153
  if (___async) {
   label = 23; //@line 3156
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 3159
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 3161
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3162
  _wait_ms(400); //@line 3163
  if (___async) {
   label = 25; //@line 3166
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 3169
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 3171
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3172
  _wait_ms(400); //@line 3173
  if (___async) {
   label = 27; //@line 3176
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 3179
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 3181
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3182
  _wait_ms(400); //@line 3183
  if (___async) {
   label = 29; //@line 3186
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 3189
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 3191
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3192
  _wait_ms(400); //@line 3193
  if (___async) {
   label = 31; //@line 3196
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3199
  _emscripten_asm_const_iii(3, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 3201
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 3202
  _wait_ms(400); //@line 3203
  if (___async) {
   label = 33; //@line 3206
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3209
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 116; //@line 3213
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 3215
   sp = STACKTOP; //@line 3216
   STACKTOP = sp; //@line 3217
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 117; //@line 3221
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 3223
   sp = STACKTOP; //@line 3224
   STACKTOP = sp; //@line 3225
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 118; //@line 3229
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 3231
   sp = STACKTOP; //@line 3232
   STACKTOP = sp; //@line 3233
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 119; //@line 3237
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 3239
   sp = STACKTOP; //@line 3240
   STACKTOP = sp; //@line 3241
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 120; //@line 3245
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 3247
   sp = STACKTOP; //@line 3248
   STACKTOP = sp; //@line 3249
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 121; //@line 3253
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 3255
   sp = STACKTOP; //@line 3256
   STACKTOP = sp; //@line 3257
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 122; //@line 3261
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 3263
   sp = STACKTOP; //@line 3264
   STACKTOP = sp; //@line 3265
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 123; //@line 3269
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 3271
   sp = STACKTOP; //@line 3272
   STACKTOP = sp; //@line 3273
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 124; //@line 3277
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 3279
   sp = STACKTOP; //@line 3280
   STACKTOP = sp; //@line 3281
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 125; //@line 3285
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 3287
   sp = STACKTOP; //@line 3288
   STACKTOP = sp; //@line 3289
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 126; //@line 3293
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 3295
   sp = STACKTOP; //@line 3296
   STACKTOP = sp; //@line 3297
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 127; //@line 3301
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 3303
   sp = STACKTOP; //@line 3304
   STACKTOP = sp; //@line 3305
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 128; //@line 3309
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 3311
   sp = STACKTOP; //@line 3312
   STACKTOP = sp; //@line 3313
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 129; //@line 3317
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 3319
   sp = STACKTOP; //@line 3320
   STACKTOP = sp; //@line 3321
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 130; //@line 3325
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 3327
   sp = STACKTOP; //@line 3328
   STACKTOP = sp; //@line 3329
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 131; //@line 3333
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 3335
   sp = STACKTOP; //@line 3336
   STACKTOP = sp; //@line 3337
   return;
  }
 }
}
function __ZN6C128329characterEiii__async_cb_18($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $39 = 0, $40 = 0, $45 = 0, $47 = 0, $48 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 1061
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1067
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1069
 $10 = HEAP8[$0 + 20 >> 0] | 0; //@line 1071
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 1075
 $16 = HEAP8[$0 + 32 >> 0] | 0; //@line 1077
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 1079
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 1081
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 1083
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 1085
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 1087
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 1089
 $30 = HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0; //@line 1092
 if ((HEAP32[$0 + 8 >> 2] | 0) >>> 0 >= ((HEAP32[___async_retval >> 2] | 0) - (HEAPU8[$30 + 2 >> 0] | 0) | 0) >>> 0) {
  HEAP32[HEAP32[$0 + 24 >> 2] >> 2] = 0; //@line 1099
 }
 $39 = $30 + ((Math_imul($6 + -32 | 0, $8) | 0) + 4) | 0; //@line 1104
 $40 = HEAP8[$39 >> 0] | 0; //@line 1105
 if ($10 << 24 >> 24) {
  if ($16 << 24 >> 24) {
   $45 = (0 >>> 3 & 31) + 1 | 0; //@line 1112
   $47 = 1 << 0; //@line 1114
   $48 = 0 + $20 | 0; //@line 1115
   $58 = HEAP32[(HEAP32[$18 >> 2] | 0) + 120 >> 2] | 0; //@line 1125
   $59 = 0 + $24 | 0; //@line 1126
   if (!($47 & (HEAPU8[$39 + ($45 + 0) >> 0] | 0))) {
    $ReallocAsyncCtx4 = _emscripten_realloc_async_context(64) | 0; //@line 1128
    FUNCTION_TABLE_viiii[$58 & 7]($18, $59, $48, 0); //@line 1129
    if (___async) {
     HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 1132
     $75 = $ReallocAsyncCtx4 + 4 | 0; //@line 1133
     HEAP32[$75 >> 2] = 0; //@line 1134
     $76 = $ReallocAsyncCtx4 + 8 | 0; //@line 1135
     HEAP32[$76 >> 2] = $26; //@line 1136
     $77 = $ReallocAsyncCtx4 + 12 | 0; //@line 1137
     HEAP32[$77 >> 2] = 0; //@line 1138
     $78 = $ReallocAsyncCtx4 + 16 | 0; //@line 1139
     HEAP32[$78 >> 2] = $28; //@line 1140
     $79 = $ReallocAsyncCtx4 + 20 | 0; //@line 1141
     HEAP32[$79 >> 2] = $22; //@line 1142
     $80 = $ReallocAsyncCtx4 + 24 | 0; //@line 1143
     HEAP32[$80 >> 2] = $45; //@line 1144
     $81 = $ReallocAsyncCtx4 + 28 | 0; //@line 1145
     HEAP32[$81 >> 2] = $39; //@line 1146
     $82 = $ReallocAsyncCtx4 + 32 | 0; //@line 1147
     HEAP32[$82 >> 2] = $47; //@line 1148
     $83 = $ReallocAsyncCtx4 + 36 | 0; //@line 1149
     HEAP32[$83 >> 2] = $18; //@line 1150
     $84 = $ReallocAsyncCtx4 + 40 | 0; //@line 1151
     HEAP32[$84 >> 2] = $24; //@line 1152
     $85 = $ReallocAsyncCtx4 + 44 | 0; //@line 1153
     HEAP32[$85 >> 2] = $18; //@line 1154
     $86 = $ReallocAsyncCtx4 + 48 | 0; //@line 1155
     HEAP32[$86 >> 2] = $48; //@line 1156
     $87 = $ReallocAsyncCtx4 + 52 | 0; //@line 1157
     HEAP8[$87 >> 0] = $40; //@line 1158
     $88 = $ReallocAsyncCtx4 + 56 | 0; //@line 1159
     HEAP32[$88 >> 2] = $14; //@line 1160
     $89 = $ReallocAsyncCtx4 + 60 | 0; //@line 1161
     HEAP32[$89 >> 2] = $20; //@line 1162
     sp = STACKTOP; //@line 1163
     return;
    }
    ___async_unwind = 0; //@line 1166
    HEAP32[$ReallocAsyncCtx4 >> 2] = 41; //@line 1167
    $75 = $ReallocAsyncCtx4 + 4 | 0; //@line 1168
    HEAP32[$75 >> 2] = 0; //@line 1169
    $76 = $ReallocAsyncCtx4 + 8 | 0; //@line 1170
    HEAP32[$76 >> 2] = $26; //@line 1171
    $77 = $ReallocAsyncCtx4 + 12 | 0; //@line 1172
    HEAP32[$77 >> 2] = 0; //@line 1173
    $78 = $ReallocAsyncCtx4 + 16 | 0; //@line 1174
    HEAP32[$78 >> 2] = $28; //@line 1175
    $79 = $ReallocAsyncCtx4 + 20 | 0; //@line 1176
    HEAP32[$79 >> 2] = $22; //@line 1177
    $80 = $ReallocAsyncCtx4 + 24 | 0; //@line 1178
    HEAP32[$80 >> 2] = $45; //@line 1179
    $81 = $ReallocAsyncCtx4 + 28 | 0; //@line 1180
    HEAP32[$81 >> 2] = $39; //@line 1181
    $82 = $ReallocAsyncCtx4 + 32 | 0; //@line 1182
    HEAP32[$82 >> 2] = $47; //@line 1183
    $83 = $ReallocAsyncCtx4 + 36 | 0; //@line 1184
    HEAP32[$83 >> 2] = $18; //@line 1185
    $84 = $ReallocAsyncCtx4 + 40 | 0; //@line 1186
    HEAP32[$84 >> 2] = $24; //@line 1187
    $85 = $ReallocAsyncCtx4 + 44 | 0; //@line 1188
    HEAP32[$85 >> 2] = $18; //@line 1189
    $86 = $ReallocAsyncCtx4 + 48 | 0; //@line 1190
    HEAP32[$86 >> 2] = $48; //@line 1191
    $87 = $ReallocAsyncCtx4 + 52 | 0; //@line 1192
    HEAP8[$87 >> 0] = $40; //@line 1193
    $88 = $ReallocAsyncCtx4 + 56 | 0; //@line 1194
    HEAP32[$88 >> 2] = $14; //@line 1195
    $89 = $ReallocAsyncCtx4 + 60 | 0; //@line 1196
    HEAP32[$89 >> 2] = $20; //@line 1197
    sp = STACKTOP; //@line 1198
    return;
   } else {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(64) | 0; //@line 1201
    FUNCTION_TABLE_viiii[$58 & 7]($18, $59, $48, 1); //@line 1202
    if (___async) {
     HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 1205
     $60 = $ReallocAsyncCtx3 + 4 | 0; //@line 1206
     HEAP32[$60 >> 2] = 0; //@line 1207
     $61 = $ReallocAsyncCtx3 + 8 | 0; //@line 1208
     HEAP32[$61 >> 2] = $26; //@line 1209
     $62 = $ReallocAsyncCtx3 + 12 | 0; //@line 1210
     HEAP32[$62 >> 2] = 0; //@line 1211
     $63 = $ReallocAsyncCtx3 + 16 | 0; //@line 1212
     HEAP32[$63 >> 2] = $28; //@line 1213
     $64 = $ReallocAsyncCtx3 + 20 | 0; //@line 1214
     HEAP32[$64 >> 2] = $22; //@line 1215
     $65 = $ReallocAsyncCtx3 + 24 | 0; //@line 1216
     HEAP32[$65 >> 2] = $45; //@line 1217
     $66 = $ReallocAsyncCtx3 + 28 | 0; //@line 1218
     HEAP32[$66 >> 2] = $39; //@line 1219
     $67 = $ReallocAsyncCtx3 + 32 | 0; //@line 1220
     HEAP32[$67 >> 2] = $47; //@line 1221
     $68 = $ReallocAsyncCtx3 + 36 | 0; //@line 1222
     HEAP32[$68 >> 2] = $18; //@line 1223
     $69 = $ReallocAsyncCtx3 + 40 | 0; //@line 1224
     HEAP32[$69 >> 2] = $24; //@line 1225
     $70 = $ReallocAsyncCtx3 + 44 | 0; //@line 1226
     HEAP32[$70 >> 2] = $18; //@line 1227
     $71 = $ReallocAsyncCtx3 + 48 | 0; //@line 1228
     HEAP32[$71 >> 2] = $48; //@line 1229
     $72 = $ReallocAsyncCtx3 + 52 | 0; //@line 1230
     HEAP8[$72 >> 0] = $40; //@line 1231
     $73 = $ReallocAsyncCtx3 + 56 | 0; //@line 1232
     HEAP32[$73 >> 2] = $14; //@line 1233
     $74 = $ReallocAsyncCtx3 + 60 | 0; //@line 1234
     HEAP32[$74 >> 2] = $20; //@line 1235
     sp = STACKTOP; //@line 1236
     return;
    }
    ___async_unwind = 0; //@line 1239
    HEAP32[$ReallocAsyncCtx3 >> 2] = 40; //@line 1240
    $60 = $ReallocAsyncCtx3 + 4 | 0; //@line 1241
    HEAP32[$60 >> 2] = 0; //@line 1242
    $61 = $ReallocAsyncCtx3 + 8 | 0; //@line 1243
    HEAP32[$61 >> 2] = $26; //@line 1244
    $62 = $ReallocAsyncCtx3 + 12 | 0; //@line 1245
    HEAP32[$62 >> 2] = 0; //@line 1246
    $63 = $ReallocAsyncCtx3 + 16 | 0; //@line 1247
    HEAP32[$63 >> 2] = $28; //@line 1248
    $64 = $ReallocAsyncCtx3 + 20 | 0; //@line 1249
    HEAP32[$64 >> 2] = $22; //@line 1250
    $65 = $ReallocAsyncCtx3 + 24 | 0; //@line 1251
    HEAP32[$65 >> 2] = $45; //@line 1252
    $66 = $ReallocAsyncCtx3 + 28 | 0; //@line 1253
    HEAP32[$66 >> 2] = $39; //@line 1254
    $67 = $ReallocAsyncCtx3 + 32 | 0; //@line 1255
    HEAP32[$67 >> 2] = $47; //@line 1256
    $68 = $ReallocAsyncCtx3 + 36 | 0; //@line 1257
    HEAP32[$68 >> 2] = $18; //@line 1258
    $69 = $ReallocAsyncCtx3 + 40 | 0; //@line 1259
    HEAP32[$69 >> 2] = $24; //@line 1260
    $70 = $ReallocAsyncCtx3 + 44 | 0; //@line 1261
    HEAP32[$70 >> 2] = $18; //@line 1262
    $71 = $ReallocAsyncCtx3 + 48 | 0; //@line 1263
    HEAP32[$71 >> 2] = $48; //@line 1264
    $72 = $ReallocAsyncCtx3 + 52 | 0; //@line 1265
    HEAP8[$72 >> 0] = $40; //@line 1266
    $73 = $ReallocAsyncCtx3 + 56 | 0; //@line 1267
    HEAP32[$73 >> 2] = $14; //@line 1268
    $74 = $ReallocAsyncCtx3 + 60 | 0; //@line 1269
    HEAP32[$74 >> 2] = $20; //@line 1270
    sp = STACKTOP; //@line 1271
    return;
   }
  }
 }
 HEAP32[$14 >> 2] = (HEAP32[$14 >> 2] | 0) + ($40 & 255); //@line 1279
 return;
}
function __ZN6C128329characterEiii($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$04142$us = 0, $$043$us = 0, $10 = 0, $11 = 0, $122 = 0, $123 = 0, $13 = 0, $14 = 0, $17 = 0, $18 = 0, $20 = 0, $23 = 0, $24 = 0, $40 = 0, $42 = 0, $45 = 0, $46 = 0, $5 = 0, $6 = 0, $61 = 0, $70 = 0, $71 = 0, $72 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $87 = 0, $90 = 0, $91 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 275
 if (($3 + -31 | 0) >>> 0 > 96) {
  return;
 }
 $5 = $0 + 48 | 0; //@line 281
 $6 = HEAP32[$5 >> 2] | 0; //@line 282
 $8 = HEAPU8[$6 >> 0] | 0; //@line 284
 $10 = HEAP8[$6 + 1 >> 0] | 0; //@line 286
 $11 = $10 & 255; //@line 287
 $13 = HEAP8[$6 + 2 >> 0] | 0; //@line 289
 $14 = $13 & 255; //@line 290
 $17 = HEAPU8[$6 + 3 >> 0] | 0; //@line 293
 $18 = $0 + 60 | 0; //@line 294
 $20 = (HEAP32[$18 >> 2] | 0) + $11 | 0; //@line 296
 $23 = HEAP32[(HEAP32[$0 >> 2] | 0) + 124 >> 2] | 0; //@line 299
 $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 300
 $24 = FUNCTION_TABLE_ii[$23 & 31]($0) | 0; //@line 301
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 38; //@line 304
  HEAP32[$AsyncCtx + 4 >> 2] = $11; //@line 306
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 308
  HEAP32[$AsyncCtx + 12 >> 2] = $18; //@line 310
  HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 312
  HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 314
  HEAP8[$AsyncCtx + 24 >> 0] = $10; //@line 316
  HEAP32[$AsyncCtx + 28 >> 2] = $17; //@line 318
  HEAP32[$AsyncCtx + 32 >> 2] = $1; //@line 320
  HEAP32[$AsyncCtx + 36 >> 2] = $5; //@line 322
  HEAP32[$AsyncCtx + 40 >> 2] = $0; //@line 324
  HEAP32[$AsyncCtx + 44 >> 2] = $3; //@line 326
  HEAP32[$AsyncCtx + 48 >> 2] = $8; //@line 328
  HEAP8[$AsyncCtx + 52 >> 0] = $13; //@line 330
  HEAP32[$AsyncCtx + 56 >> 2] = $20; //@line 332
  sp = STACKTOP; //@line 333
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 336
 if ($20 >>> 0 > $24 >>> 0) {
  HEAP32[$18 >> 2] = 0; //@line 339
  $40 = $0 + 64 | 0; //@line 340
  $42 = (HEAP32[$40 >> 2] | 0) + $14 | 0; //@line 342
  HEAP32[$40 >> 2] = $42; //@line 343
  $45 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 346
  $AsyncCtx3 = _emscripten_alloc_async_context(60, sp) | 0; //@line 347
  $46 = FUNCTION_TABLE_ii[$45 & 31]($0) | 0; //@line 348
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 39; //@line 351
   HEAP32[$AsyncCtx3 + 4 >> 2] = $5; //@line 353
   HEAP32[$AsyncCtx3 + 8 >> 2] = $42; //@line 355
   HEAP32[$AsyncCtx3 + 12 >> 2] = $3; //@line 357
   HEAP32[$AsyncCtx3 + 16 >> 2] = $8; //@line 359
   HEAP8[$AsyncCtx3 + 20 >> 0] = $13; //@line 361
   HEAP32[$AsyncCtx3 + 24 >> 2] = $40; //@line 363
   HEAP32[$AsyncCtx3 + 28 >> 2] = $18; //@line 365
   HEAP8[$AsyncCtx3 + 32 >> 0] = $10; //@line 367
   HEAP32[$AsyncCtx3 + 36 >> 2] = $0; //@line 369
   HEAP32[$AsyncCtx3 + 40 >> 2] = $2; //@line 371
   HEAP32[$AsyncCtx3 + 44 >> 2] = $17; //@line 373
   HEAP32[$AsyncCtx3 + 48 >> 2] = $1; //@line 375
   HEAP32[$AsyncCtx3 + 52 >> 2] = $11; //@line 377
   HEAP32[$AsyncCtx3 + 56 >> 2] = $14; //@line 379
   sp = STACKTOP; //@line 380
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 383
  $61 = HEAP32[$5 >> 2] | 0; //@line 384
  if ($42 >>> 0 < ($46 - (HEAPU8[$61 + 2 >> 0] | 0) | 0) >>> 0) {
   $71 = $61; //@line 391
  } else {
   HEAP32[$40 >> 2] = 0; //@line 393
   $71 = $61; //@line 394
  }
 } else {
  $71 = HEAP32[$5 >> 2] | 0; //@line 398
 }
 $70 = $71 + ((Math_imul($3 + -32 | 0, $8) | 0) + 4) | 0; //@line 403
 $72 = HEAP8[$70 >> 0] | 0; //@line 404
 L15 : do {
  if ($13 << 24 >> 24) {
   if ($10 << 24 >> 24) {
    $$043$us = 0; //@line 410
    L17 : while (1) {
     $77 = ($$043$us >>> 3 & 31) + 1 | 0; //@line 414
     $79 = 1 << ($$043$us & 7); //@line 416
     $80 = $$043$us + $2 | 0; //@line 417
     $$04142$us = 0; //@line 418
     while (1) {
      $87 = ($79 & (HEAPU8[$70 + ($77 + (Math_imul($$04142$us, $17) | 0)) >> 0] | 0) | 0) == 0; //@line 426
      $90 = HEAP32[(HEAP32[$0 >> 2] | 0) + 120 >> 2] | 0; //@line 429
      $91 = $$04142$us + $1 | 0; //@line 430
      if ($87) {
       $AsyncCtx11 = _emscripten_alloc_async_context(64, sp) | 0; //@line 432
       FUNCTION_TABLE_viiii[$90 & 7]($0, $91, $80, 0); //@line 433
       if (___async) {
        label = 18; //@line 436
        break L17;
       }
       _emscripten_free_async_context($AsyncCtx11 | 0); //@line 439
      } else {
       $AsyncCtx7 = _emscripten_alloc_async_context(64, sp) | 0; //@line 441
       FUNCTION_TABLE_viiii[$90 & 7]($0, $91, $80, 1); //@line 442
       if (___async) {
        label = 15; //@line 445
        break L17;
       }
       _emscripten_free_async_context($AsyncCtx7 | 0); //@line 448
      }
      $122 = $$04142$us + 1 | 0; //@line 450
      if (($122 | 0) == ($11 | 0)) {
       break;
      } else {
       $$04142$us = $122; //@line 455
      }
     }
     $123 = $$043$us + 1 | 0; //@line 458
     if (($123 | 0) == ($14 | 0)) {
      break L15;
     } else {
      $$043$us = $123; //@line 463
     }
    }
    if ((label | 0) == 15) {
     HEAP32[$AsyncCtx7 >> 2] = 40; //@line 467
     HEAP32[$AsyncCtx7 + 4 >> 2] = $$04142$us; //@line 469
     HEAP32[$AsyncCtx7 + 8 >> 2] = $11; //@line 471
     HEAP32[$AsyncCtx7 + 12 >> 2] = $$043$us; //@line 473
     HEAP32[$AsyncCtx7 + 16 >> 2] = $14; //@line 475
     HEAP32[$AsyncCtx7 + 20 >> 2] = $17; //@line 477
     HEAP32[$AsyncCtx7 + 24 >> 2] = $77; //@line 479
     HEAP32[$AsyncCtx7 + 28 >> 2] = $70; //@line 481
     HEAP32[$AsyncCtx7 + 32 >> 2] = $79; //@line 483
     HEAP32[$AsyncCtx7 + 36 >> 2] = $0; //@line 485
     HEAP32[$AsyncCtx7 + 40 >> 2] = $1; //@line 487
     HEAP32[$AsyncCtx7 + 44 >> 2] = $0; //@line 489
     HEAP32[$AsyncCtx7 + 48 >> 2] = $80; //@line 491
     HEAP8[$AsyncCtx7 + 52 >> 0] = $72; //@line 493
     HEAP32[$AsyncCtx7 + 56 >> 2] = $18; //@line 495
     HEAP32[$AsyncCtx7 + 60 >> 2] = $2; //@line 497
     sp = STACKTOP; //@line 498
     return;
    } else if ((label | 0) == 18) {
     HEAP32[$AsyncCtx11 >> 2] = 41; //@line 502
     HEAP32[$AsyncCtx11 + 4 >> 2] = $$04142$us; //@line 504
     HEAP32[$AsyncCtx11 + 8 >> 2] = $11; //@line 506
     HEAP32[$AsyncCtx11 + 12 >> 2] = $$043$us; //@line 508
     HEAP32[$AsyncCtx11 + 16 >> 2] = $14; //@line 510
     HEAP32[$AsyncCtx11 + 20 >> 2] = $17; //@line 512
     HEAP32[$AsyncCtx11 + 24 >> 2] = $77; //@line 514
     HEAP32[$AsyncCtx11 + 28 >> 2] = $70; //@line 516
     HEAP32[$AsyncCtx11 + 32 >> 2] = $79; //@line 518
     HEAP32[$AsyncCtx11 + 36 >> 2] = $0; //@line 520
     HEAP32[$AsyncCtx11 + 40 >> 2] = $1; //@line 522
     HEAP32[$AsyncCtx11 + 44 >> 2] = $0; //@line 524
     HEAP32[$AsyncCtx11 + 48 >> 2] = $80; //@line 526
     HEAP8[$AsyncCtx11 + 52 >> 0] = $72; //@line 528
     HEAP32[$AsyncCtx11 + 56 >> 2] = $18; //@line 530
     HEAP32[$AsyncCtx11 + 60 >> 2] = $2; //@line 532
     sp = STACKTOP; //@line 533
     return;
    }
   }
  }
 } while (0);
 HEAP32[$18 >> 2] = (HEAP32[$18 >> 2] | 0) + ($72 & 255); //@line 542
 return;
}
function __ZN6C128328print_bmE6Bitmapii__async_cb_65($0) {
 $0 = $0 | 0;
 var $$02225$us$reg2mem$0 = 0, $$02225$us$reg2mem$1 = 0, $$023$us30 = 0, $$reg2mem$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $24 = 0, $26 = 0, $4 = 0, $40 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4171
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4175
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4177
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4179
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4181
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4183
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 4185
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 4187
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 4189
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 4191
 $66 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 4194
 if (($66 | 0) < ($4 | 0)) {
  $$02225$us$reg2mem$0 = $8; //@line 4197
  $$023$us30 = $66; //@line 4197
  $$reg2mem$0 = HEAP32[$0 + 44 >> 2] | 0; //@line 4197
  label = 3; //@line 4198
 } else {
  $$02225$us$reg2mem$1 = $8; //@line 4200
 }
 while (1) {
  if ((label | 0) == 3) {
   label = 0; //@line 4204
   $26 = $$023$us30 + $6 | 0; //@line 4205
   if (($26 | 0) > 127) {
    $$02225$us$reg2mem$1 = $$02225$us$reg2mem$0; //@line 4208
   } else {
    break;
   }
  }
  $24 = $$02225$us$reg2mem$1 + 1 | 0; //@line 4213
  if (($24 | 0) >= ($10 | 0)) {
   label = 14; //@line 4216
   break;
  }
  $23 = $24 + $12 | 0; //@line 4219
  if (($23 | 0) > 31) {
   $$02225$us$reg2mem$1 = $24; //@line 4222
  } else {
   $$02225$us$reg2mem$0 = $24; //@line 4224
   $$023$us30 = 0; //@line 4224
   $$reg2mem$0 = $23; //@line 4224
   label = 3; //@line 4225
  }
 }
 if ((label | 0) == 14) {
  return;
 }
 $40 = (128 >>> ($$023$us30 & 7) & HEAP8[(HEAP32[$14 >> 2] | 0) + ((Math_imul(HEAP32[$16 >> 2] | 0, $$02225$us$reg2mem$0) | 0) + ($$023$us30 >>> 3 & 31)) >> 0] | 0) == 0; //@line 4243
 $43 = HEAP32[(HEAP32[$18 >> 2] | 0) + 120 >> 2] | 0; //@line 4246
 if ($40) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(48) | 0; //@line 4248
  FUNCTION_TABLE_viiii[$43 & 7]($20, $26, $$reg2mem$0, 0); //@line 4249
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 49; //@line 4252
   $55 = $ReallocAsyncCtx2 + 4 | 0; //@line 4253
   HEAP32[$55 >> 2] = $$023$us30; //@line 4254
   $56 = $ReallocAsyncCtx2 + 8 | 0; //@line 4255
   HEAP32[$56 >> 2] = $4; //@line 4256
   $57 = $ReallocAsyncCtx2 + 12 | 0; //@line 4257
   HEAP32[$57 >> 2] = $6; //@line 4258
   $58 = $ReallocAsyncCtx2 + 16 | 0; //@line 4259
   HEAP32[$58 >> 2] = $$02225$us$reg2mem$0; //@line 4260
   $59 = $ReallocAsyncCtx2 + 20 | 0; //@line 4261
   HEAP32[$59 >> 2] = $10; //@line 4262
   $60 = $ReallocAsyncCtx2 + 24 | 0; //@line 4263
   HEAP32[$60 >> 2] = $12; //@line 4264
   $61 = $ReallocAsyncCtx2 + 28 | 0; //@line 4265
   HEAP32[$61 >> 2] = $14; //@line 4266
   $62 = $ReallocAsyncCtx2 + 32 | 0; //@line 4267
   HEAP32[$62 >> 2] = $16; //@line 4268
   $63 = $ReallocAsyncCtx2 + 36 | 0; //@line 4269
   HEAP32[$63 >> 2] = $18; //@line 4270
   $64 = $ReallocAsyncCtx2 + 40 | 0; //@line 4271
   HEAP32[$64 >> 2] = $20; //@line 4272
   $65 = $ReallocAsyncCtx2 + 44 | 0; //@line 4273
   HEAP32[$65 >> 2] = $$reg2mem$0; //@line 4274
   sp = STACKTOP; //@line 4275
   return;
  }
  ___async_unwind = 0; //@line 4278
  HEAP32[$ReallocAsyncCtx2 >> 2] = 49; //@line 4279
  $55 = $ReallocAsyncCtx2 + 4 | 0; //@line 4280
  HEAP32[$55 >> 2] = $$023$us30; //@line 4281
  $56 = $ReallocAsyncCtx2 + 8 | 0; //@line 4282
  HEAP32[$56 >> 2] = $4; //@line 4283
  $57 = $ReallocAsyncCtx2 + 12 | 0; //@line 4284
  HEAP32[$57 >> 2] = $6; //@line 4285
  $58 = $ReallocAsyncCtx2 + 16 | 0; //@line 4286
  HEAP32[$58 >> 2] = $$02225$us$reg2mem$0; //@line 4287
  $59 = $ReallocAsyncCtx2 + 20 | 0; //@line 4288
  HEAP32[$59 >> 2] = $10; //@line 4289
  $60 = $ReallocAsyncCtx2 + 24 | 0; //@line 4290
  HEAP32[$60 >> 2] = $12; //@line 4291
  $61 = $ReallocAsyncCtx2 + 28 | 0; //@line 4292
  HEAP32[$61 >> 2] = $14; //@line 4293
  $62 = $ReallocAsyncCtx2 + 32 | 0; //@line 4294
  HEAP32[$62 >> 2] = $16; //@line 4295
  $63 = $ReallocAsyncCtx2 + 36 | 0; //@line 4296
  HEAP32[$63 >> 2] = $18; //@line 4297
  $64 = $ReallocAsyncCtx2 + 40 | 0; //@line 4298
  HEAP32[$64 >> 2] = $20; //@line 4299
  $65 = $ReallocAsyncCtx2 + 44 | 0; //@line 4300
  HEAP32[$65 >> 2] = $$reg2mem$0; //@line 4301
  sp = STACKTOP; //@line 4302
  return;
 } else {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(48) | 0; //@line 4305
  FUNCTION_TABLE_viiii[$43 & 7]($20, $26, $$reg2mem$0, 1); //@line 4306
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 48; //@line 4309
   $44 = $ReallocAsyncCtx + 4 | 0; //@line 4310
   HEAP32[$44 >> 2] = $$023$us30; //@line 4311
   $45 = $ReallocAsyncCtx + 8 | 0; //@line 4312
   HEAP32[$45 >> 2] = $4; //@line 4313
   $46 = $ReallocAsyncCtx + 12 | 0; //@line 4314
   HEAP32[$46 >> 2] = $6; //@line 4315
   $47 = $ReallocAsyncCtx + 16 | 0; //@line 4316
   HEAP32[$47 >> 2] = $$02225$us$reg2mem$0; //@line 4317
   $48 = $ReallocAsyncCtx + 20 | 0; //@line 4318
   HEAP32[$48 >> 2] = $10; //@line 4319
   $49 = $ReallocAsyncCtx + 24 | 0; //@line 4320
   HEAP32[$49 >> 2] = $12; //@line 4321
   $50 = $ReallocAsyncCtx + 28 | 0; //@line 4322
   HEAP32[$50 >> 2] = $14; //@line 4323
   $51 = $ReallocAsyncCtx + 32 | 0; //@line 4324
   HEAP32[$51 >> 2] = $16; //@line 4325
   $52 = $ReallocAsyncCtx + 36 | 0; //@line 4326
   HEAP32[$52 >> 2] = $18; //@line 4327
   $53 = $ReallocAsyncCtx + 40 | 0; //@line 4328
   HEAP32[$53 >> 2] = $20; //@line 4329
   $54 = $ReallocAsyncCtx + 44 | 0; //@line 4330
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 4331
   sp = STACKTOP; //@line 4332
   return;
  }
  ___async_unwind = 0; //@line 4335
  HEAP32[$ReallocAsyncCtx >> 2] = 48; //@line 4336
  $44 = $ReallocAsyncCtx + 4 | 0; //@line 4337
  HEAP32[$44 >> 2] = $$023$us30; //@line 4338
  $45 = $ReallocAsyncCtx + 8 | 0; //@line 4339
  HEAP32[$45 >> 2] = $4; //@line 4340
  $46 = $ReallocAsyncCtx + 12 | 0; //@line 4341
  HEAP32[$46 >> 2] = $6; //@line 4342
  $47 = $ReallocAsyncCtx + 16 | 0; //@line 4343
  HEAP32[$47 >> 2] = $$02225$us$reg2mem$0; //@line 4344
  $48 = $ReallocAsyncCtx + 20 | 0; //@line 4345
  HEAP32[$48 >> 2] = $10; //@line 4346
  $49 = $ReallocAsyncCtx + 24 | 0; //@line 4347
  HEAP32[$49 >> 2] = $12; //@line 4348
  $50 = $ReallocAsyncCtx + 28 | 0; //@line 4349
  HEAP32[$50 >> 2] = $14; //@line 4350
  $51 = $ReallocAsyncCtx + 32 | 0; //@line 4351
  HEAP32[$51 >> 2] = $16; //@line 4352
  $52 = $ReallocAsyncCtx + 36 | 0; //@line 4353
  HEAP32[$52 >> 2] = $18; //@line 4354
  $53 = $ReallocAsyncCtx + 40 | 0; //@line 4355
  HEAP32[$53 >> 2] = $20; //@line 4356
  $54 = $ReallocAsyncCtx + 44 | 0; //@line 4357
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 4358
  sp = STACKTOP; //@line 4359
  return;
 }
}
function __ZN6C128328print_bmE6Bitmapii__async_cb($0) {
 $0 = $0 | 0;
 var $$02225$us$reg2mem$0 = 0, $$02225$us$reg2mem$1 = 0, $$023$us30 = 0, $$reg2mem$0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $24 = 0, $26 = 0, $4 = 0, $40 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3973
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3977
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3979
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3981
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3983
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3985
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3987
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3989
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3991
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 3993
 $66 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 3996
 if (($66 | 0) < ($4 | 0)) {
  $$02225$us$reg2mem$0 = $8; //@line 3999
  $$023$us30 = $66; //@line 3999
  $$reg2mem$0 = HEAP32[$0 + 44 >> 2] | 0; //@line 3999
  label = 3; //@line 4000
 } else {
  $$02225$us$reg2mem$1 = $8; //@line 4002
 }
 while (1) {
  if ((label | 0) == 3) {
   label = 0; //@line 4006
   $26 = $$023$us30 + $6 | 0; //@line 4007
   if (($26 | 0) > 127) {
    $$02225$us$reg2mem$1 = $$02225$us$reg2mem$0; //@line 4010
   } else {
    break;
   }
  }
  $24 = $$02225$us$reg2mem$1 + 1 | 0; //@line 4015
  if (($24 | 0) >= ($10 | 0)) {
   label = 14; //@line 4018
   break;
  }
  $23 = $24 + $12 | 0; //@line 4021
  if (($23 | 0) > 31) {
   $$02225$us$reg2mem$1 = $24; //@line 4024
  } else {
   $$02225$us$reg2mem$0 = $24; //@line 4026
   $$023$us30 = 0; //@line 4026
   $$reg2mem$0 = $23; //@line 4026
   label = 3; //@line 4027
  }
 }
 if ((label | 0) == 14) {
  return;
 }
 $40 = (128 >>> ($$023$us30 & 7) & HEAP8[(HEAP32[$14 >> 2] | 0) + ((Math_imul(HEAP32[$16 >> 2] | 0, $$02225$us$reg2mem$0) | 0) + ($$023$us30 >>> 3 & 31)) >> 0] | 0) == 0; //@line 4045
 $43 = HEAP32[(HEAP32[$18 >> 2] | 0) + 120 >> 2] | 0; //@line 4048
 if ($40) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(48) | 0; //@line 4050
  FUNCTION_TABLE_viiii[$43 & 7]($20, $26, $$reg2mem$0, 0); //@line 4051
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 49; //@line 4054
   $55 = $ReallocAsyncCtx2 + 4 | 0; //@line 4055
   HEAP32[$55 >> 2] = $$023$us30; //@line 4056
   $56 = $ReallocAsyncCtx2 + 8 | 0; //@line 4057
   HEAP32[$56 >> 2] = $4; //@line 4058
   $57 = $ReallocAsyncCtx2 + 12 | 0; //@line 4059
   HEAP32[$57 >> 2] = $6; //@line 4060
   $58 = $ReallocAsyncCtx2 + 16 | 0; //@line 4061
   HEAP32[$58 >> 2] = $$02225$us$reg2mem$0; //@line 4062
   $59 = $ReallocAsyncCtx2 + 20 | 0; //@line 4063
   HEAP32[$59 >> 2] = $10; //@line 4064
   $60 = $ReallocAsyncCtx2 + 24 | 0; //@line 4065
   HEAP32[$60 >> 2] = $12; //@line 4066
   $61 = $ReallocAsyncCtx2 + 28 | 0; //@line 4067
   HEAP32[$61 >> 2] = $14; //@line 4068
   $62 = $ReallocAsyncCtx2 + 32 | 0; //@line 4069
   HEAP32[$62 >> 2] = $16; //@line 4070
   $63 = $ReallocAsyncCtx2 + 36 | 0; //@line 4071
   HEAP32[$63 >> 2] = $18; //@line 4072
   $64 = $ReallocAsyncCtx2 + 40 | 0; //@line 4073
   HEAP32[$64 >> 2] = $20; //@line 4074
   $65 = $ReallocAsyncCtx2 + 44 | 0; //@line 4075
   HEAP32[$65 >> 2] = $$reg2mem$0; //@line 4076
   sp = STACKTOP; //@line 4077
   return;
  }
  ___async_unwind = 0; //@line 4080
  HEAP32[$ReallocAsyncCtx2 >> 2] = 49; //@line 4081
  $55 = $ReallocAsyncCtx2 + 4 | 0; //@line 4082
  HEAP32[$55 >> 2] = $$023$us30; //@line 4083
  $56 = $ReallocAsyncCtx2 + 8 | 0; //@line 4084
  HEAP32[$56 >> 2] = $4; //@line 4085
  $57 = $ReallocAsyncCtx2 + 12 | 0; //@line 4086
  HEAP32[$57 >> 2] = $6; //@line 4087
  $58 = $ReallocAsyncCtx2 + 16 | 0; //@line 4088
  HEAP32[$58 >> 2] = $$02225$us$reg2mem$0; //@line 4089
  $59 = $ReallocAsyncCtx2 + 20 | 0; //@line 4090
  HEAP32[$59 >> 2] = $10; //@line 4091
  $60 = $ReallocAsyncCtx2 + 24 | 0; //@line 4092
  HEAP32[$60 >> 2] = $12; //@line 4093
  $61 = $ReallocAsyncCtx2 + 28 | 0; //@line 4094
  HEAP32[$61 >> 2] = $14; //@line 4095
  $62 = $ReallocAsyncCtx2 + 32 | 0; //@line 4096
  HEAP32[$62 >> 2] = $16; //@line 4097
  $63 = $ReallocAsyncCtx2 + 36 | 0; //@line 4098
  HEAP32[$63 >> 2] = $18; //@line 4099
  $64 = $ReallocAsyncCtx2 + 40 | 0; //@line 4100
  HEAP32[$64 >> 2] = $20; //@line 4101
  $65 = $ReallocAsyncCtx2 + 44 | 0; //@line 4102
  HEAP32[$65 >> 2] = $$reg2mem$0; //@line 4103
  sp = STACKTOP; //@line 4104
  return;
 } else {
  $ReallocAsyncCtx = _emscripten_realloc_async_context(48) | 0; //@line 4107
  FUNCTION_TABLE_viiii[$43 & 7]($20, $26, $$reg2mem$0, 1); //@line 4108
  if (___async) {
   HEAP32[$ReallocAsyncCtx >> 2] = 48; //@line 4111
   $44 = $ReallocAsyncCtx + 4 | 0; //@line 4112
   HEAP32[$44 >> 2] = $$023$us30; //@line 4113
   $45 = $ReallocAsyncCtx + 8 | 0; //@line 4114
   HEAP32[$45 >> 2] = $4; //@line 4115
   $46 = $ReallocAsyncCtx + 12 | 0; //@line 4116
   HEAP32[$46 >> 2] = $6; //@line 4117
   $47 = $ReallocAsyncCtx + 16 | 0; //@line 4118
   HEAP32[$47 >> 2] = $$02225$us$reg2mem$0; //@line 4119
   $48 = $ReallocAsyncCtx + 20 | 0; //@line 4120
   HEAP32[$48 >> 2] = $10; //@line 4121
   $49 = $ReallocAsyncCtx + 24 | 0; //@line 4122
   HEAP32[$49 >> 2] = $12; //@line 4123
   $50 = $ReallocAsyncCtx + 28 | 0; //@line 4124
   HEAP32[$50 >> 2] = $14; //@line 4125
   $51 = $ReallocAsyncCtx + 32 | 0; //@line 4126
   HEAP32[$51 >> 2] = $16; //@line 4127
   $52 = $ReallocAsyncCtx + 36 | 0; //@line 4128
   HEAP32[$52 >> 2] = $18; //@line 4129
   $53 = $ReallocAsyncCtx + 40 | 0; //@line 4130
   HEAP32[$53 >> 2] = $20; //@line 4131
   $54 = $ReallocAsyncCtx + 44 | 0; //@line 4132
   HEAP32[$54 >> 2] = $$reg2mem$0; //@line 4133
   sp = STACKTOP; //@line 4134
   return;
  }
  ___async_unwind = 0; //@line 4137
  HEAP32[$ReallocAsyncCtx >> 2] = 48; //@line 4138
  $44 = $ReallocAsyncCtx + 4 | 0; //@line 4139
  HEAP32[$44 >> 2] = $$023$us30; //@line 4140
  $45 = $ReallocAsyncCtx + 8 | 0; //@line 4141
  HEAP32[$45 >> 2] = $4; //@line 4142
  $46 = $ReallocAsyncCtx + 12 | 0; //@line 4143
  HEAP32[$46 >> 2] = $6; //@line 4144
  $47 = $ReallocAsyncCtx + 16 | 0; //@line 4145
  HEAP32[$47 >> 2] = $$02225$us$reg2mem$0; //@line 4146
  $48 = $ReallocAsyncCtx + 20 | 0; //@line 4147
  HEAP32[$48 >> 2] = $10; //@line 4148
  $49 = $ReallocAsyncCtx + 24 | 0; //@line 4149
  HEAP32[$49 >> 2] = $12; //@line 4150
  $50 = $ReallocAsyncCtx + 28 | 0; //@line 4151
  HEAP32[$50 >> 2] = $14; //@line 4152
  $51 = $ReallocAsyncCtx + 32 | 0; //@line 4153
  HEAP32[$51 >> 2] = $16; //@line 4154
  $52 = $ReallocAsyncCtx + 36 | 0; //@line 4155
  HEAP32[$52 >> 2] = $18; //@line 4156
  $53 = $ReallocAsyncCtx + 40 | 0; //@line 4157
  HEAP32[$53 >> 2] = $20; //@line 4158
  $54 = $ReallocAsyncCtx + 44 | 0; //@line 4159
  HEAP32[$54 >> 2] = $$reg2mem$0; //@line 4160
  sp = STACKTOP; //@line 4161
  return;
 }
}
function _freopen($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$pre = 0, $11 = 0, $27 = 0, $29 = 0, $3 = 0, $30 = 0, $32 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx14 = 0, $AsyncCtx18 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11910
 STACKTOP = STACKTOP + 32 | 0; //@line 11911
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 11911
 $vararg_buffer3 = sp + 16 | 0; //@line 11912
 $vararg_buffer = sp; //@line 11913
 $3 = ___fmodeflags($1) | 0; //@line 11914
 if ((HEAP32[$2 + 76 >> 2] | 0) > -1) {
  $11 = ___lockfile($2) | 0; //@line 11920
 } else {
  $11 = 0; //@line 11922
 }
 $AsyncCtx = _emscripten_alloc_async_context(40, sp) | 0; //@line 11924
 _fflush($2) | 0; //@line 11925
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 169; //@line 11928
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 11930
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 11932
  HEAP32[$AsyncCtx + 12 >> 2] = $11; //@line 11934
  HEAP32[$AsyncCtx + 16 >> 2] = $3; //@line 11936
  HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 11938
  HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer3; //@line 11940
  HEAP32[$AsyncCtx + 28 >> 2] = $vararg_buffer3; //@line 11942
  HEAP32[$AsyncCtx + 32 >> 2] = $vararg_buffer; //@line 11944
  HEAP32[$AsyncCtx + 36 >> 2] = $vararg_buffer; //@line 11946
  sp = STACKTOP; //@line 11947
  STACKTOP = sp; //@line 11948
  return 0; //@line 11948
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 11950
 do {
  if (!$0) {
   $$pre = $2 + 60 | 0; //@line 11956
   if ($3 & 524288 | 0) {
    HEAP32[$vararg_buffer >> 2] = HEAP32[$$pre >> 2]; //@line 11959
    HEAP32[$vararg_buffer + 4 >> 2] = 2; //@line 11961
    HEAP32[$vararg_buffer + 8 >> 2] = 1; //@line 11963
    ___syscall221(221, $vararg_buffer | 0) | 0; //@line 11964
   }
   HEAP32[$vararg_buffer3 >> 2] = HEAP32[$$pre >> 2]; //@line 11968
   HEAP32[$vararg_buffer3 + 4 >> 2] = 4; //@line 11970
   HEAP32[$vararg_buffer3 + 8 >> 2] = $3 & -524481; //@line 11972
   if ((___syscall_ret(___syscall221(221, $vararg_buffer3 | 0) | 0) | 0) < 0) {
    label = 21; //@line 11977
   } else {
    label = 16; //@line 11979
   }
  } else {
   $27 = _fopen($0, $1) | 0; //@line 11982
   if (!$27) {
    label = 21; //@line 11985
   } else {
    $29 = $27 + 60 | 0; //@line 11987
    $30 = HEAP32[$29 >> 2] | 0; //@line 11988
    $32 = HEAP32[$2 + 60 >> 2] | 0; //@line 11990
    if (($30 | 0) == ($32 | 0)) {
     HEAP32[$29 >> 2] = -1; //@line 11993
    } else {
     if ((___dup3($30, $32, $3 & 524288) | 0) < 0) {
      $AsyncCtx14 = _emscripten_alloc_async_context(8, sp) | 0; //@line 11999
      _fclose($27) | 0; //@line 12000
      if (___async) {
       HEAP32[$AsyncCtx14 >> 2] = 171; //@line 12003
       HEAP32[$AsyncCtx14 + 4 >> 2] = $2; //@line 12005
       sp = STACKTOP; //@line 12006
       STACKTOP = sp; //@line 12007
       return 0; //@line 12007
      } else {
       _emscripten_free_async_context($AsyncCtx14 | 0); //@line 12009
       label = 21; //@line 12010
       break;
      }
     }
    }
    HEAP32[$2 >> 2] = HEAP32[$2 >> 2] & 1 | HEAP32[$27 >> 2]; //@line 12019
    HEAP32[$2 + 32 >> 2] = HEAP32[$27 + 32 >> 2]; //@line 12023
    HEAP32[$2 + 36 >> 2] = HEAP32[$27 + 36 >> 2]; //@line 12027
    HEAP32[$2 + 40 >> 2] = HEAP32[$27 + 40 >> 2]; //@line 12031
    HEAP32[$2 + 12 >> 2] = HEAP32[$27 + 12 >> 2]; //@line 12035
    $AsyncCtx18 = _emscripten_alloc_async_context(12, sp) | 0; //@line 12036
    _fclose($27) | 0; //@line 12037
    if (___async) {
     HEAP32[$AsyncCtx18 >> 2] = 170; //@line 12040
     HEAP32[$AsyncCtx18 + 4 >> 2] = $11; //@line 12042
     HEAP32[$AsyncCtx18 + 8 >> 2] = $2; //@line 12044
     sp = STACKTOP; //@line 12045
     STACKTOP = sp; //@line 12046
     return 0; //@line 12046
    } else {
     _emscripten_free_async_context($AsyncCtx18 | 0); //@line 12048
     label = 16; //@line 12049
     break;
    }
   }
  }
 } while (0);
 do {
  if ((label | 0) == 16) {
   if (!$11) {
    $$0 = $2; //@line 12059
   } else {
    ___unlockfile($2); //@line 12061
    $$0 = $2; //@line 12062
   }
  } else if ((label | 0) == 21) {
   $AsyncCtx10 = _emscripten_alloc_async_context(8, sp) | 0; //@line 12066
   _fclose($2) | 0; //@line 12067
   if (___async) {
    HEAP32[$AsyncCtx10 >> 2] = 172; //@line 12070
    HEAP32[$AsyncCtx10 + 4 >> 2] = $2; //@line 12072
    sp = STACKTOP; //@line 12073
    STACKTOP = sp; //@line 12074
    return 0; //@line 12074
   } else {
    _emscripten_free_async_context($AsyncCtx10 | 0); //@line 12076
    $$0 = 0; //@line 12077
    break;
   }
  }
 } while (0);
 STACKTOP = sp; //@line 12082
 return $$0 | 0; //@line 12082
}
function __ZN4mbed6Stream6printfEPKcz($0, $1, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $varargs = $varargs | 0;
 var $$09 = 0, $13 = 0, $2 = 0, $22 = 0, $3 = 0, $30 = 0, $36 = 0, $39 = 0, $48 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx12 = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 2873
 STACKTOP = STACKTOP + 4112 | 0; //@line 2874
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(4112); //@line 2874
 $2 = sp; //@line 2875
 $3 = sp + 16 | 0; //@line 2876
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 80 >> 2] | 0; //@line 2879
 $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 2880
 FUNCTION_TABLE_vi[$6 & 255]($0); //@line 2881
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 110; //@line 2884
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 2886
  HEAP32[$AsyncCtx + 8 >> 2] = $varargs; //@line 2888
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 2890
  HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 2892
  HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 2894
  HEAP32[$AsyncCtx + 24 >> 2] = $0; //@line 2896
  sp = STACKTOP; //@line 2897
  STACKTOP = sp; //@line 2898
  return 0; //@line 2898
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2900
 HEAP32[$2 >> 2] = $varargs; //@line 2901
 _memset($3 | 0, 0, 4096) | 0; //@line 2902
 $AsyncCtx12 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2903
 $13 = _vsprintf($3, $1, $2) | 0; //@line 2904
 if (___async) {
  HEAP32[$AsyncCtx12 >> 2] = 111; //@line 2907
  HEAP32[$AsyncCtx12 + 4 >> 2] = $0; //@line 2909
  HEAP32[$AsyncCtx12 + 8 >> 2] = $0; //@line 2911
  HEAP32[$AsyncCtx12 + 12 >> 2] = $3; //@line 2913
  HEAP32[$AsyncCtx12 + 16 >> 2] = $2; //@line 2915
  HEAP32[$AsyncCtx12 + 20 >> 2] = $3; //@line 2917
  sp = STACKTOP; //@line 2918
  STACKTOP = sp; //@line 2919
  return 0; //@line 2919
 }
 _emscripten_free_async_context($AsyncCtx12 | 0); //@line 2921
 L7 : do {
  if (($13 | 0) > 0) {
   $$09 = 0; //@line 2925
   while (1) {
    $36 = HEAP32[(HEAP32[$0 >> 2] | 0) + 68 >> 2] | 0; //@line 2929
    $39 = HEAP8[$3 + $$09 >> 0] | 0; //@line 2932
    $AsyncCtx9 = _emscripten_alloc_async_context(36, sp) | 0; //@line 2933
    FUNCTION_TABLE_iii[$36 & 7]($0, $39) | 0; //@line 2934
    if (___async) {
     break;
    }
    _emscripten_free_async_context($AsyncCtx9 | 0); //@line 2939
    $48 = $$09 + 1 | 0; //@line 2940
    if (($48 | 0) == ($13 | 0)) {
     break L7;
    } else {
     $$09 = $48; //@line 2945
    }
   }
   HEAP32[$AsyncCtx9 >> 2] = 114; //@line 2948
   HEAP32[$AsyncCtx9 + 4 >> 2] = $$09; //@line 2950
   HEAP32[$AsyncCtx9 + 8 >> 2] = $13; //@line 2952
   HEAP32[$AsyncCtx9 + 12 >> 2] = $0; //@line 2954
   HEAP32[$AsyncCtx9 + 16 >> 2] = $0; //@line 2956
   HEAP32[$AsyncCtx9 + 20 >> 2] = $0; //@line 2958
   HEAP32[$AsyncCtx9 + 24 >> 2] = $3; //@line 2960
   HEAP32[$AsyncCtx9 + 28 >> 2] = $3; //@line 2962
   HEAP32[$AsyncCtx9 + 32 >> 2] = $2; //@line 2964
   sp = STACKTOP; //@line 2965
   STACKTOP = sp; //@line 2966
   return 0; //@line 2966
  }
 } while (0);
 $22 = HEAP32[(HEAP32[$0 >> 2] | 0) + 76 >> 2] | 0; //@line 2971
 $AsyncCtx2 = _emscripten_alloc_async_context(24, sp) | 0; //@line 2972
 FUNCTION_TABLE_vi[$22 & 255]($0); //@line 2973
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 112; //@line 2976
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 2978
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 2980
  HEAP32[$AsyncCtx2 + 12 >> 2] = $3; //@line 2982
  HEAP32[$AsyncCtx2 + 16 >> 2] = $2; //@line 2984
  HEAP32[$AsyncCtx2 + 20 >> 2] = $13; //@line 2986
  sp = STACKTOP; //@line 2987
  STACKTOP = sp; //@line 2988
  return 0; //@line 2988
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2990
 $30 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 2993
 $AsyncCtx5 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2994
 FUNCTION_TABLE_vi[$30 & 255]($0); //@line 2995
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 113; //@line 2998
  HEAP32[$AsyncCtx5 + 4 >> 2] = $3; //@line 3000
  HEAP32[$AsyncCtx5 + 8 >> 2] = $2; //@line 3002
  HEAP32[$AsyncCtx5 + 12 >> 2] = $13; //@line 3004
  sp = STACKTOP; //@line 3005
  STACKTOP = sp; //@line 3006
  return 0; //@line 3006
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 3008
  STACKTOP = sp; //@line 3009
  return $13 | 0; //@line 3009
 }
 return 0; //@line 3011
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_89($0) {
 $0 = $0 | 0;
 var $$085$off0$reg2mem$0 = 0, $$182$off0 = 0, $$186$off0 = 0, $$283$off0 = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $4 = 0, $59 = 0, $6 = 0, $67 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 6058
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6060
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6062
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6064
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6066
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6068
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 6070
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 6072
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 6074
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 6077
 $20 = HEAP8[$0 + 37 >> 0] & 1; //@line 6080
 $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 6082
 $24 = HEAP32[$0 + 44 >> 2] | 0; //@line 6084
 $26 = HEAP32[$0 + 48 >> 2] | 0; //@line 6086
 $28 = HEAP8[$0 + 52 >> 0] & 1; //@line 6089
 L2 : do {
  if (!(HEAP8[$2 >> 0] | 0)) {
   do {
    if (!(HEAP8[$24 >> 0] | 0)) {
     $$182$off0 = $18; //@line 6098
     $$186$off0 = $20; //@line 6098
    } else {
     if (!(HEAP8[$26 >> 0] | 0)) {
      if (!(HEAP32[$16 >> 2] & 1)) {
       $$085$off0$reg2mem$0 = $20; //@line 6107
       $$283$off0 = 1; //@line 6107
       label = 13; //@line 6108
       break L2;
      } else {
       $$182$off0 = 1; //@line 6111
       $$186$off0 = $20; //@line 6111
       break;
      }
     }
     if ((HEAP32[$12 >> 2] | 0) == 1) {
      label = 18; //@line 6118
      break L2;
     }
     if (!(HEAP32[$16 >> 2] & 2)) {
      label = 18; //@line 6125
      break L2;
     } else {
      $$182$off0 = 1; //@line 6128
      $$186$off0 = 1; //@line 6128
     }
    }
   } while (0);
   $30 = $22 + 8 | 0; //@line 6132
   if ($30 >>> 0 < $14 >>> 0) {
    HEAP8[$26 >> 0] = 0; //@line 6135
    HEAP8[$24 >> 0] = 0; //@line 6136
    $ReallocAsyncCtx5 = _emscripten_realloc_async_context(56) | 0; //@line 6137
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($30, $10, $6, $6, 1, $28); //@line 6138
    if (!___async) {
     ___async_unwind = 0; //@line 6141
    }
    HEAP32[$ReallocAsyncCtx5 >> 2] = 194; //@line 6143
    HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 6145
    HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 6147
    HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 6149
    HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 6151
    HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 6153
    HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $12; //@line 6155
    HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 6157
    HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $16; //@line 6159
    HEAP8[$ReallocAsyncCtx5 + 36 >> 0] = $$182$off0 & 1; //@line 6162
    HEAP8[$ReallocAsyncCtx5 + 37 >> 0] = $$186$off0 & 1; //@line 6165
    HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $30; //@line 6167
    HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $24; //@line 6169
    HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $26; //@line 6171
    HEAP8[$ReallocAsyncCtx5 + 52 >> 0] = $28 & 1; //@line 6174
    sp = STACKTOP; //@line 6175
    return;
   } else {
    $$085$off0$reg2mem$0 = $$186$off0; //@line 6178
    $$283$off0 = $$182$off0; //@line 6178
    label = 13; //@line 6179
   }
  } else {
   $$085$off0$reg2mem$0 = $20; //@line 6182
   $$283$off0 = $18; //@line 6182
   label = 13; //@line 6183
  }
 } while (0);
 do {
  if ((label | 0) == 13) {
   if (!$$085$off0$reg2mem$0) {
    HEAP32[$8 >> 2] = $6; //@line 6189
    $59 = $10 + 40 | 0; //@line 6190
    HEAP32[$59 >> 2] = (HEAP32[$59 >> 2] | 0) + 1; //@line 6193
    if ((HEAP32[$10 + 36 >> 2] | 0) == 1) {
     if ((HEAP32[$12 >> 2] | 0) == 2) {
      HEAP8[$2 >> 0] = 1; //@line 6201
      if ($$283$off0) {
       label = 18; //@line 6203
       break;
      } else {
       $67 = 4; //@line 6206
       break;
      }
     }
    }
   }
   if ($$283$off0) {
    label = 18; //@line 6213
   } else {
    $67 = 4; //@line 6215
   }
  }
 } while (0);
 if ((label | 0) == 18) {
  $67 = 3; //@line 6220
 }
 HEAP32[$4 >> 2] = $67; //@line 6222
 return;
}
function _main__async_cb_36($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx4 = 0, $bitmSan3$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 2722
 STACKTOP = STACKTOP + 16 | 0; //@line 2723
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2723
 $bitmSan3$byval_copy = sp; //@line 2724
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2726
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2728
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2730
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2732
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2734
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2736
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2738
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2740
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2742
 $19 = $10 + 9 | 0; //@line 2743
 if (($10 | 0) < 66) {
  $ReallocAsyncCtx10 = _emscripten_realloc_async_context(40) | 0; //@line 2746
  HEAP32[$bitmSan3$byval_copy >> 2] = HEAP32[259]; //@line 2747
  HEAP32[$bitmSan3$byval_copy + 4 >> 2] = HEAP32[260]; //@line 2747
  HEAP32[$bitmSan3$byval_copy + 8 >> 2] = HEAP32[261]; //@line 2747
  HEAP32[$bitmSan3$byval_copy + 12 >> 2] = HEAP32[262]; //@line 2747
  __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy, $19, 2); //@line 2748
  if (!___async) {
   ___async_unwind = 0; //@line 2751
  }
  HEAP32[$ReallocAsyncCtx10 >> 2] = 144; //@line 2753
  HEAP32[$ReallocAsyncCtx10 + 4 >> 2] = $19; //@line 2755
  HEAP32[$ReallocAsyncCtx10 + 8 >> 2] = $2; //@line 2757
  HEAP32[$ReallocAsyncCtx10 + 12 >> 2] = $4; //@line 2759
  HEAP32[$ReallocAsyncCtx10 + 16 >> 2] = $6; //@line 2761
  HEAP32[$ReallocAsyncCtx10 + 20 >> 2] = $8; //@line 2763
  HEAP32[$ReallocAsyncCtx10 + 24 >> 2] = $12; //@line 2765
  HEAP32[$ReallocAsyncCtx10 + 28 >> 2] = $14; //@line 2767
  HEAP32[$ReallocAsyncCtx10 + 32 >> 2] = $16; //@line 2769
  HEAP32[$ReallocAsyncCtx10 + 36 >> 2] = $18; //@line 2771
  sp = STACKTOP; //@line 2772
  STACKTOP = sp; //@line 2773
  return;
 }
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(36) | 0; //@line 2775
 HEAP32[$bitmSan3$byval_copy >> 2] = HEAP32[267]; //@line 2776
 HEAP32[$bitmSan3$byval_copy + 4 >> 2] = HEAP32[268]; //@line 2776
 HEAP32[$bitmSan3$byval_copy + 8 >> 2] = HEAP32[269]; //@line 2776
 HEAP32[$bitmSan3$byval_copy + 12 >> 2] = HEAP32[270]; //@line 2776
 __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy, 75, 2); //@line 2777
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 153; //@line 2780
  $30 = $ReallocAsyncCtx4 + 4 | 0; //@line 2781
  HEAP32[$30 >> 2] = $2; //@line 2782
  $31 = $ReallocAsyncCtx4 + 8 | 0; //@line 2783
  HEAP32[$31 >> 2] = $4; //@line 2784
  $32 = $ReallocAsyncCtx4 + 12 | 0; //@line 2785
  HEAP32[$32 >> 2] = $6; //@line 2786
  $33 = $ReallocAsyncCtx4 + 16 | 0; //@line 2787
  HEAP32[$33 >> 2] = $8; //@line 2788
  $34 = $ReallocAsyncCtx4 + 20 | 0; //@line 2789
  HEAP32[$34 >> 2] = $12; //@line 2790
  $35 = $ReallocAsyncCtx4 + 24 | 0; //@line 2791
  HEAP32[$35 >> 2] = $14; //@line 2792
  $36 = $ReallocAsyncCtx4 + 28 | 0; //@line 2793
  HEAP32[$36 >> 2] = $16; //@line 2794
  $37 = $ReallocAsyncCtx4 + 32 | 0; //@line 2795
  HEAP32[$37 >> 2] = $18; //@line 2796
  sp = STACKTOP; //@line 2797
  STACKTOP = sp; //@line 2798
  return;
 }
 ___async_unwind = 0; //@line 2800
 HEAP32[$ReallocAsyncCtx4 >> 2] = 153; //@line 2801
 $30 = $ReallocAsyncCtx4 + 4 | 0; //@line 2802
 HEAP32[$30 >> 2] = $2; //@line 2803
 $31 = $ReallocAsyncCtx4 + 8 | 0; //@line 2804
 HEAP32[$31 >> 2] = $4; //@line 2805
 $32 = $ReallocAsyncCtx4 + 12 | 0; //@line 2806
 HEAP32[$32 >> 2] = $6; //@line 2807
 $33 = $ReallocAsyncCtx4 + 16 | 0; //@line 2808
 HEAP32[$33 >> 2] = $8; //@line 2809
 $34 = $ReallocAsyncCtx4 + 20 | 0; //@line 2810
 HEAP32[$34 >> 2] = $12; //@line 2811
 $35 = $ReallocAsyncCtx4 + 24 | 0; //@line 2812
 HEAP32[$35 >> 2] = $14; //@line 2813
 $36 = $ReallocAsyncCtx4 + 28 | 0; //@line 2814
 HEAP32[$36 >> 2] = $16; //@line 2815
 $37 = $ReallocAsyncCtx4 + 32 | 0; //@line 2816
 HEAP32[$37 >> 2] = $18; //@line 2817
 sp = STACKTOP; //@line 2818
 STACKTOP = sp; //@line 2819
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_26($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $27 = 0, $29 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 2026
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2030
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2032
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2034
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2036
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2038
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2040
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2042
 $29 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 2043
 if (($29 | 0) == ($4 | 0)) {
  $19 = HEAP32[(HEAP32[$6 >> 2] | 0) + 76 >> 2] | 0; //@line 2048
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 2049
  FUNCTION_TABLE_vi[$19 & 255]($8); //@line 2050
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 112; //@line 2053
   $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 2054
   HEAP32[$20 >> 2] = $6; //@line 2055
   $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 2056
   HEAP32[$21 >> 2] = $8; //@line 2057
   $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 2058
   HEAP32[$22 >> 2] = $14; //@line 2059
   $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 2060
   HEAP32[$23 >> 2] = $16; //@line 2061
   $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 2062
   HEAP32[$24 >> 2] = $4; //@line 2063
   sp = STACKTOP; //@line 2064
   return;
  }
  ___async_unwind = 0; //@line 2067
  HEAP32[$ReallocAsyncCtx2 >> 2] = 112; //@line 2068
  $20 = $ReallocAsyncCtx2 + 4 | 0; //@line 2069
  HEAP32[$20 >> 2] = $6; //@line 2070
  $21 = $ReallocAsyncCtx2 + 8 | 0; //@line 2071
  HEAP32[$21 >> 2] = $8; //@line 2072
  $22 = $ReallocAsyncCtx2 + 12 | 0; //@line 2073
  HEAP32[$22 >> 2] = $14; //@line 2074
  $23 = $ReallocAsyncCtx2 + 16 | 0; //@line 2075
  HEAP32[$23 >> 2] = $16; //@line 2076
  $24 = $ReallocAsyncCtx2 + 20 | 0; //@line 2077
  HEAP32[$24 >> 2] = $4; //@line 2078
  sp = STACKTOP; //@line 2079
  return;
 } else {
  $27 = HEAP32[(HEAP32[$10 >> 2] | 0) + 68 >> 2] | 0; //@line 2084
  $31 = HEAP8[$12 + $29 >> 0] | 0; //@line 2087
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(36) | 0; //@line 2088
  FUNCTION_TABLE_iii[$27 & 7]($8, $31) | 0; //@line 2089
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 114; //@line 2092
   $32 = $ReallocAsyncCtx4 + 4 | 0; //@line 2093
   HEAP32[$32 >> 2] = $29; //@line 2094
   $33 = $ReallocAsyncCtx4 + 8 | 0; //@line 2095
   HEAP32[$33 >> 2] = $4; //@line 2096
   $34 = $ReallocAsyncCtx4 + 12 | 0; //@line 2097
   HEAP32[$34 >> 2] = $6; //@line 2098
   $35 = $ReallocAsyncCtx4 + 16 | 0; //@line 2099
   HEAP32[$35 >> 2] = $8; //@line 2100
   $36 = $ReallocAsyncCtx4 + 20 | 0; //@line 2101
   HEAP32[$36 >> 2] = $10; //@line 2102
   $37 = $ReallocAsyncCtx4 + 24 | 0; //@line 2103
   HEAP32[$37 >> 2] = $12; //@line 2104
   $38 = $ReallocAsyncCtx4 + 28 | 0; //@line 2105
   HEAP32[$38 >> 2] = $14; //@line 2106
   $39 = $ReallocAsyncCtx4 + 32 | 0; //@line 2107
   HEAP32[$39 >> 2] = $16; //@line 2108
   sp = STACKTOP; //@line 2109
   return;
  }
  ___async_unwind = 0; //@line 2112
  HEAP32[$ReallocAsyncCtx4 >> 2] = 114; //@line 2113
  $32 = $ReallocAsyncCtx4 + 4 | 0; //@line 2114
  HEAP32[$32 >> 2] = $29; //@line 2115
  $33 = $ReallocAsyncCtx4 + 8 | 0; //@line 2116
  HEAP32[$33 >> 2] = $4; //@line 2117
  $34 = $ReallocAsyncCtx4 + 12 | 0; //@line 2118
  HEAP32[$34 >> 2] = $6; //@line 2119
  $35 = $ReallocAsyncCtx4 + 16 | 0; //@line 2120
  HEAP32[$35 >> 2] = $8; //@line 2121
  $36 = $ReallocAsyncCtx4 + 20 | 0; //@line 2122
  HEAP32[$36 >> 2] = $10; //@line 2123
  $37 = $ReallocAsyncCtx4 + 24 | 0; //@line 2124
  HEAP32[$37 >> 2] = $12; //@line 2125
  $38 = $ReallocAsyncCtx4 + 28 | 0; //@line 2126
  HEAP32[$38 >> 2] = $14; //@line 2127
  $39 = $ReallocAsyncCtx4 + 32 | 0; //@line 2128
  HEAP32[$39 >> 2] = $16; //@line 2129
  sp = STACKTOP; //@line 2130
  return;
 }
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $15 = 0, $16 = 0, $31 = 0, $32 = 0, $33 = 0, $62 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13325
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 13330
 } else {
  $9 = $1 + 52 | 0; //@line 13332
  $10 = HEAP8[$9 >> 0] | 0; //@line 13333
  $11 = $1 + 53 | 0; //@line 13334
  $12 = HEAP8[$11 >> 0] | 0; //@line 13335
  $15 = HEAP32[$0 + 12 >> 2] | 0; //@line 13338
  $16 = $0 + 16 + ($15 << 3) | 0; //@line 13339
  HEAP8[$9 >> 0] = 0; //@line 13340
  HEAP8[$11 >> 0] = 0; //@line 13341
  $AsyncCtx3 = _emscripten_alloc_async_context(52, sp) | 0; //@line 13342
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0 + 16 | 0, $1, $2, $3, $4, $5); //@line 13343
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 192; //@line 13346
   HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 13348
   HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 13350
   HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 13352
   HEAP8[$AsyncCtx3 + 16 >> 0] = $10; //@line 13354
   HEAP32[$AsyncCtx3 + 20 >> 2] = $9; //@line 13356
   HEAP8[$AsyncCtx3 + 24 >> 0] = $12; //@line 13358
   HEAP32[$AsyncCtx3 + 28 >> 2] = $11; //@line 13360
   HEAP32[$AsyncCtx3 + 32 >> 2] = $2; //@line 13362
   HEAP32[$AsyncCtx3 + 36 >> 2] = $3; //@line 13364
   HEAP32[$AsyncCtx3 + 40 >> 2] = $4; //@line 13366
   HEAP8[$AsyncCtx3 + 44 >> 0] = $5 & 1; //@line 13369
   HEAP32[$AsyncCtx3 + 48 >> 2] = $16; //@line 13371
   sp = STACKTOP; //@line 13372
   return;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13375
  L7 : do {
   if (($15 | 0) > 1) {
    $31 = $1 + 24 | 0; //@line 13380
    $32 = $0 + 8 | 0; //@line 13381
    $33 = $1 + 54 | 0; //@line 13382
    $$0 = $0 + 24 | 0; //@line 13383
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
     HEAP8[$9 >> 0] = 0; //@line 13416
     HEAP8[$11 >> 0] = 0; //@line 13417
     $AsyncCtx = _emscripten_alloc_async_context(60, sp) | 0; //@line 13418
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0, $1, $2, $3, $4, $5); //@line 13419
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 13424
     $62 = $$0 + 8 | 0; //@line 13425
     if ($62 >>> 0 < $16 >>> 0) {
      $$0 = $62; //@line 13428
     } else {
      break L7;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 193; //@line 13433
    HEAP32[$AsyncCtx + 4 >> 2] = $$0; //@line 13435
    HEAP32[$AsyncCtx + 8 >> 2] = $16; //@line 13437
    HEAP32[$AsyncCtx + 12 >> 2] = $33; //@line 13439
    HEAP8[$AsyncCtx + 16 >> 0] = $10; //@line 13441
    HEAP32[$AsyncCtx + 20 >> 2] = $9; //@line 13443
    HEAP8[$AsyncCtx + 24 >> 0] = $12; //@line 13445
    HEAP32[$AsyncCtx + 28 >> 2] = $11; //@line 13447
    HEAP32[$AsyncCtx + 32 >> 2] = $31; //@line 13449
    HEAP32[$AsyncCtx + 36 >> 2] = $32; //@line 13451
    HEAP32[$AsyncCtx + 40 >> 2] = $1; //@line 13453
    HEAP32[$AsyncCtx + 44 >> 2] = $2; //@line 13455
    HEAP32[$AsyncCtx + 48 >> 2] = $3; //@line 13457
    HEAP32[$AsyncCtx + 52 >> 2] = $4; //@line 13459
    HEAP8[$AsyncCtx + 56 >> 0] = $5 & 1; //@line 13462
    sp = STACKTOP; //@line 13463
    return;
   }
  } while (0);
  HEAP8[$9 >> 0] = $10; //@line 13467
  HEAP8[$11 >> 0] = $12; //@line 13468
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
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10055
      $10 = HEAP32[$9 >> 2] | 0; //@line 10056
      HEAP32[$2 >> 2] = $9 + 4; //@line 10058
      HEAP32[$0 >> 2] = $10; //@line 10059
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10075
      $17 = HEAP32[$16 >> 2] | 0; //@line 10076
      HEAP32[$2 >> 2] = $16 + 4; //@line 10078
      $20 = $0; //@line 10081
      HEAP32[$20 >> 2] = $17; //@line 10083
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 10086
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10102
      $30 = HEAP32[$29 >> 2] | 0; //@line 10103
      HEAP32[$2 >> 2] = $29 + 4; //@line 10105
      $31 = $0; //@line 10106
      HEAP32[$31 >> 2] = $30; //@line 10108
      HEAP32[$31 + 4 >> 2] = 0; //@line 10111
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 10127
      $41 = $40; //@line 10128
      $43 = HEAP32[$41 >> 2] | 0; //@line 10130
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 10133
      HEAP32[$2 >> 2] = $40 + 8; //@line 10135
      $47 = $0; //@line 10136
      HEAP32[$47 >> 2] = $43; //@line 10138
      HEAP32[$47 + 4 >> 2] = $46; //@line 10141
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10157
      $57 = HEAP32[$56 >> 2] | 0; //@line 10158
      HEAP32[$2 >> 2] = $56 + 4; //@line 10160
      $59 = ($57 & 65535) << 16 >> 16; //@line 10162
      $62 = $0; //@line 10165
      HEAP32[$62 >> 2] = $59; //@line 10167
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 10170
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10186
      $72 = HEAP32[$71 >> 2] | 0; //@line 10187
      HEAP32[$2 >> 2] = $71 + 4; //@line 10189
      $73 = $0; //@line 10191
      HEAP32[$73 >> 2] = $72 & 65535; //@line 10193
      HEAP32[$73 + 4 >> 2] = 0; //@line 10196
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10212
      $83 = HEAP32[$82 >> 2] | 0; //@line 10213
      HEAP32[$2 >> 2] = $82 + 4; //@line 10215
      $85 = ($83 & 255) << 24 >> 24; //@line 10217
      $88 = $0; //@line 10220
      HEAP32[$88 >> 2] = $85; //@line 10222
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 10225
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 10241
      $98 = HEAP32[$97 >> 2] | 0; //@line 10242
      HEAP32[$2 >> 2] = $97 + 4; //@line 10244
      $99 = $0; //@line 10246
      HEAP32[$99 >> 2] = $98 & 255; //@line 10248
      HEAP32[$99 + 4 >> 2] = 0; //@line 10251
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 10267
      $109 = +HEAPF64[$108 >> 3]; //@line 10268
      HEAP32[$2 >> 2] = $108 + 8; //@line 10270
      HEAPF64[$0 >> 3] = $109; //@line 10271
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 10287
      $116 = +HEAPF64[$115 >> 3]; //@line 10288
      HEAP32[$2 >> 2] = $115 + 8; //@line 10290
      HEAPF64[$0 >> 3] = $116; //@line 10291
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
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_88($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $18 = 0, $2 = 0, $21 = 0, $24 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5902
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5904
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5906
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5908
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5910
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5912
 $12 = HEAP8[$0 + 24 >> 0] & 1; //@line 5915
 $15 = $4 + 24 | 0; //@line 5918
 do {
  if ((HEAP32[$0 + 28 >> 2] | 0) > 1) {
   $18 = HEAP32[$4 + 8 >> 2] | 0; //@line 5923
   if (!($18 & 2)) {
    $21 = $6 + 36 | 0; //@line 5927
    if ((HEAP32[$21 >> 2] | 0) != 1) {
     if (!($18 & 1)) {
      $38 = $6 + 54 | 0; //@line 5934
      if (HEAP8[$38 >> 0] | 0) {
       break;
      }
      if ((HEAP32[$21 >> 2] | 0) == 1) {
       break;
      }
      $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 5945
      __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $6, $8, $10, $12); //@line 5946
      if (!___async) {
       ___async_unwind = 0; //@line 5949
      }
      HEAP32[$ReallocAsyncCtx >> 2] = 198; //@line 5951
      HEAP32[$ReallocAsyncCtx + 4 >> 2] = $15; //@line 5953
      HEAP32[$ReallocAsyncCtx + 8 >> 2] = $2; //@line 5955
      HEAP32[$ReallocAsyncCtx + 12 >> 2] = $38; //@line 5957
      HEAP32[$ReallocAsyncCtx + 16 >> 2] = $21; //@line 5959
      HEAP32[$ReallocAsyncCtx + 20 >> 2] = $6; //@line 5961
      HEAP32[$ReallocAsyncCtx + 24 >> 2] = $8; //@line 5963
      HEAP32[$ReallocAsyncCtx + 28 >> 2] = $10; //@line 5965
      HEAP8[$ReallocAsyncCtx + 32 >> 0] = $12 & 1; //@line 5968
      sp = STACKTOP; //@line 5969
      return;
     }
     $36 = $6 + 24 | 0; //@line 5972
     $37 = $6 + 54 | 0; //@line 5973
     if (HEAP8[$37 >> 0] | 0) {
      break;
     }
     if ((HEAP32[$21 >> 2] | 0) == 1) {
      if ((HEAP32[$36 >> 2] | 0) == 1) {
       break;
      }
     }
     $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 5988
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $6, $8, $10, $12); //@line 5989
     if (!___async) {
      ___async_unwind = 0; //@line 5992
     }
     HEAP32[$ReallocAsyncCtx2 >> 2] = 197; //@line 5994
     HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 5996
     HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $2; //@line 5998
     HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $37; //@line 6000
     HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $21; //@line 6002
     HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $36; //@line 6004
     HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $6; //@line 6006
     HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $8; //@line 6008
     HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $10; //@line 6010
     HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $12 & 1; //@line 6013
     sp = STACKTOP; //@line 6014
     return;
    }
   }
   $24 = $6 + 54 | 0; //@line 6018
   if (!(HEAP8[$24 >> 0] | 0)) {
    $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 6022
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15, $6, $8, $10, $12); //@line 6023
    if (!___async) {
     ___async_unwind = 0; //@line 6026
    }
    HEAP32[$ReallocAsyncCtx3 >> 2] = 196; //@line 6028
    HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $15; //@line 6030
    HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $2; //@line 6032
    HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $24; //@line 6034
    HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $6; //@line 6036
    HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $8; //@line 6038
    HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $10; //@line 6040
    HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $12 & 1; //@line 6043
    sp = STACKTOP; //@line 6044
    return;
   }
  }
 } while (0);
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_27($0) {
 $0 = $0 | 0;
 var $10 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 2138
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2140
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2142
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2144
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2146
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2148
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 2150
 if (($AsyncRetVal | 0) <= 0) {
  $15 = HEAP32[(HEAP32[$4 >> 2] | 0) + 76 >> 2] | 0; //@line 2155
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 2156
  FUNCTION_TABLE_vi[$15 & 255]($2); //@line 2157
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 112; //@line 2160
   $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 2161
   HEAP32[$16 >> 2] = $4; //@line 2162
   $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 2163
   HEAP32[$17 >> 2] = $2; //@line 2164
   $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 2165
   HEAP32[$18 >> 2] = $6; //@line 2166
   $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 2167
   HEAP32[$19 >> 2] = $8; //@line 2168
   $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 2169
   HEAP32[$20 >> 2] = $AsyncRetVal; //@line 2170
   sp = STACKTOP; //@line 2171
   return;
  }
  ___async_unwind = 0; //@line 2174
  HEAP32[$ReallocAsyncCtx2 >> 2] = 112; //@line 2175
  $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 2176
  HEAP32[$16 >> 2] = $4; //@line 2177
  $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 2178
  HEAP32[$17 >> 2] = $2; //@line 2179
  $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 2180
  HEAP32[$18 >> 2] = $6; //@line 2181
  $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 2182
  HEAP32[$19 >> 2] = $8; //@line 2183
  $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 2184
  HEAP32[$20 >> 2] = $AsyncRetVal; //@line 2185
  sp = STACKTOP; //@line 2186
  return;
 }
 $23 = HEAP32[(HEAP32[$2 >> 2] | 0) + 68 >> 2] | 0; //@line 2191
 $25 = HEAP8[$10 >> 0] | 0; //@line 2193
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(36) | 0; //@line 2194
 FUNCTION_TABLE_iii[$23 & 7]($2, $25) | 0; //@line 2195
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 114; //@line 2198
  $26 = $ReallocAsyncCtx4 + 4 | 0; //@line 2199
  HEAP32[$26 >> 2] = 0; //@line 2200
  $27 = $ReallocAsyncCtx4 + 8 | 0; //@line 2201
  HEAP32[$27 >> 2] = $AsyncRetVal; //@line 2202
  $28 = $ReallocAsyncCtx4 + 12 | 0; //@line 2203
  HEAP32[$28 >> 2] = $4; //@line 2204
  $29 = $ReallocAsyncCtx4 + 16 | 0; //@line 2205
  HEAP32[$29 >> 2] = $2; //@line 2206
  $30 = $ReallocAsyncCtx4 + 20 | 0; //@line 2207
  HEAP32[$30 >> 2] = $2; //@line 2208
  $31 = $ReallocAsyncCtx4 + 24 | 0; //@line 2209
  HEAP32[$31 >> 2] = $10; //@line 2210
  $32 = $ReallocAsyncCtx4 + 28 | 0; //@line 2211
  HEAP32[$32 >> 2] = $6; //@line 2212
  $33 = $ReallocAsyncCtx4 + 32 | 0; //@line 2213
  HEAP32[$33 >> 2] = $8; //@line 2214
  sp = STACKTOP; //@line 2215
  return;
 }
 ___async_unwind = 0; //@line 2218
 HEAP32[$ReallocAsyncCtx4 >> 2] = 114; //@line 2219
 $26 = $ReallocAsyncCtx4 + 4 | 0; //@line 2220
 HEAP32[$26 >> 2] = 0; //@line 2221
 $27 = $ReallocAsyncCtx4 + 8 | 0; //@line 2222
 HEAP32[$27 >> 2] = $AsyncRetVal; //@line 2223
 $28 = $ReallocAsyncCtx4 + 12 | 0; //@line 2224
 HEAP32[$28 >> 2] = $4; //@line 2225
 $29 = $ReallocAsyncCtx4 + 16 | 0; //@line 2226
 HEAP32[$29 >> 2] = $2; //@line 2227
 $30 = $ReallocAsyncCtx4 + 20 | 0; //@line 2228
 HEAP32[$30 >> 2] = $2; //@line 2229
 $31 = $ReallocAsyncCtx4 + 24 | 0; //@line 2230
 HEAP32[$31 >> 2] = $10; //@line 2231
 $32 = $ReallocAsyncCtx4 + 28 | 0; //@line 2232
 HEAP32[$32 >> 2] = $6; //@line 2233
 $33 = $ReallocAsyncCtx4 + 32 | 0; //@line 2234
 HEAP32[$33 >> 2] = $8; //@line 2235
 sp = STACKTOP; //@line 2236
 return;
}
function __ZN11TextDisplay3clsEv($0) {
 $0 = $0 | 0;
 var $$03 = 0, $13 = 0, $14 = 0, $24 = 0, $27 = 0, $28 = 0, $3 = 0, $35 = 0, $36 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx12 = 0, $AsyncCtx16 = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1741
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 108 >> 2] | 0; //@line 1744
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1745
 FUNCTION_TABLE_viii[$3 & 3]($0, 0, 0); //@line 1746
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 72; //@line 1749
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1751
  sp = STACKTOP; //@line 1752
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1755
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 1758
 $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1759
 $8 = FUNCTION_TABLE_ii[$7 & 31]($0) | 0; //@line 1760
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 73; //@line 1763
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 1765
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1767
  sp = STACKTOP; //@line 1768
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1771
 $13 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 1774
 $AsyncCtx5 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1775
 $14 = FUNCTION_TABLE_ii[$13 & 31]($0) | 0; //@line 1776
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 74; //@line 1779
  HEAP32[$AsyncCtx5 + 4 >> 2] = $8; //@line 1781
  HEAP32[$AsyncCtx5 + 8 >> 2] = $0; //@line 1783
  HEAP32[$AsyncCtx5 + 12 >> 2] = $0; //@line 1785
  sp = STACKTOP; //@line 1786
  return;
 }
 _emscripten_free_async_context($AsyncCtx5 | 0); //@line 1789
 if ((Math_imul($14, $8) | 0) <= 0) {
  return;
 }
 $$03 = 0; //@line 1795
 while (1) {
  $AsyncCtx16 = _emscripten_alloc_async_context(20, sp) | 0; //@line 1797
  __ZN4mbed6Stream4putcEi($0, 32) | 0; //@line 1798
  if (___async) {
   label = 11; //@line 1801
   break;
  }
  _emscripten_free_async_context($AsyncCtx16 | 0); //@line 1804
  $24 = $$03 + 1 | 0; //@line 1805
  $27 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 1808
  $AsyncCtx9 = _emscripten_alloc_async_context(20, sp) | 0; //@line 1809
  $28 = FUNCTION_TABLE_ii[$27 & 31]($0) | 0; //@line 1810
  if (___async) {
   label = 13; //@line 1813
   break;
  }
  _emscripten_free_async_context($AsyncCtx9 | 0); //@line 1816
  $35 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 1819
  $AsyncCtx12 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1820
  $36 = FUNCTION_TABLE_ii[$35 & 31]($0) | 0; //@line 1821
  if (___async) {
   label = 15; //@line 1824
   break;
  }
  _emscripten_free_async_context($AsyncCtx12 | 0); //@line 1827
  if (($24 | 0) < (Math_imul($36, $28) | 0)) {
   $$03 = $24; //@line 1831
  } else {
   label = 9; //@line 1833
   break;
  }
 }
 if ((label | 0) == 9) {
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx16 >> 2] = 75; //@line 1841
  HEAP32[$AsyncCtx16 + 4 >> 2] = $$03; //@line 1843
  HEAP32[$AsyncCtx16 + 8 >> 2] = $0; //@line 1845
  HEAP32[$AsyncCtx16 + 12 >> 2] = $0; //@line 1847
  HEAP32[$AsyncCtx16 + 16 >> 2] = $0; //@line 1849
  sp = STACKTOP; //@line 1850
  return;
 } else if ((label | 0) == 13) {
  HEAP32[$AsyncCtx9 >> 2] = 76; //@line 1854
  HEAP32[$AsyncCtx9 + 4 >> 2] = $0; //@line 1856
  HEAP32[$AsyncCtx9 + 8 >> 2] = $0; //@line 1858
  HEAP32[$AsyncCtx9 + 12 >> 2] = $24; //@line 1860
  HEAP32[$AsyncCtx9 + 16 >> 2] = $0; //@line 1862
  sp = STACKTOP; //@line 1863
  return;
 } else if ((label | 0) == 15) {
  HEAP32[$AsyncCtx12 >> 2] = 77; //@line 1867
  HEAP32[$AsyncCtx12 + 4 >> 2] = $28; //@line 1869
  HEAP32[$AsyncCtx12 + 8 >> 2] = $24; //@line 1871
  HEAP32[$AsyncCtx12 + 12 >> 2] = $0; //@line 1873
  HEAP32[$AsyncCtx12 + 16 >> 2] = $0; //@line 1875
  HEAP32[$AsyncCtx12 + 20 >> 2] = $0; //@line 1877
  sp = STACKTOP; //@line 1878
  return;
 }
}
function __ZN11TextDisplay5_putcEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $11 = 0, $12 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $25 = 0, $31 = 0, $32 = 0, $35 = 0, $36 = 0, $45 = 0, $46 = 0, $49 = 0, $5 = 0, $50 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 1557
 _emscripten_asm_const_ii(2, $1 | 0) | 0; //@line 1558
 if (($1 | 0) == 10) {
  HEAP16[$0 + 24 >> 1] = 0; //@line 1562
  $5 = $0 + 26 | 0; //@line 1563
  $7 = (HEAP16[$5 >> 1] | 0) + 1 << 16 >> 16; //@line 1565
  HEAP16[$5 >> 1] = $7; //@line 1566
  $8 = $7 & 65535; //@line 1567
  $11 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 1570
  $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1571
  $12 = FUNCTION_TABLE_ii[$11 & 31]($0) | 0; //@line 1572
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 66; //@line 1575
   HEAP32[$AsyncCtx + 4 >> 2] = $8; //@line 1577
   HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 1579
   HEAP32[$AsyncCtx + 12 >> 2] = $5; //@line 1581
   sp = STACKTOP; //@line 1582
   return 0; //@line 1583
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1585
  if (($12 | 0) > ($8 | 0)) {
   return $1 | 0; //@line 1588
  }
  HEAP16[$5 >> 1] = 0; //@line 1590
  return $1 | 0; //@line 1591
 }
 $19 = HEAP32[(HEAP32[$0 >> 2] | 0) + 88 >> 2] | 0; //@line 1595
 $20 = $0 + 24 | 0; //@line 1596
 $22 = HEAPU16[$20 >> 1] | 0; //@line 1598
 $23 = $0 + 26 | 0; //@line 1599
 $25 = HEAPU16[$23 >> 1] | 0; //@line 1601
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 1602
 FUNCTION_TABLE_viiii[$19 & 7]($0, $22, $25, $1); //@line 1603
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 67; //@line 1606
  HEAP32[$AsyncCtx3 + 4 >> 2] = $20; //@line 1608
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 1610
  HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 1612
  HEAP32[$AsyncCtx3 + 16 >> 2] = $23; //@line 1614
  sp = STACKTOP; //@line 1615
  return 0; //@line 1616
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1618
 $31 = (HEAP16[$20 >> 1] | 0) + 1 << 16 >> 16; //@line 1620
 HEAP16[$20 >> 1] = $31; //@line 1621
 $32 = $31 & 65535; //@line 1622
 $35 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 1625
 $AsyncCtx6 = _emscripten_alloc_async_context(28, sp) | 0; //@line 1626
 $36 = FUNCTION_TABLE_ii[$35 & 31]($0) | 0; //@line 1627
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 68; //@line 1630
  HEAP32[$AsyncCtx6 + 4 >> 2] = $32; //@line 1632
  HEAP32[$AsyncCtx6 + 8 >> 2] = $1; //@line 1634
  HEAP32[$AsyncCtx6 + 12 >> 2] = $20; //@line 1636
  HEAP32[$AsyncCtx6 + 16 >> 2] = $23; //@line 1638
  HEAP32[$AsyncCtx6 + 20 >> 2] = $0; //@line 1640
  HEAP32[$AsyncCtx6 + 24 >> 2] = $0; //@line 1642
  sp = STACKTOP; //@line 1643
  return 0; //@line 1644
 }
 _emscripten_free_async_context($AsyncCtx6 | 0); //@line 1646
 if (($36 | 0) > ($32 | 0)) {
  return $1 | 0; //@line 1649
 }
 HEAP16[$20 >> 1] = 0; //@line 1651
 $45 = (HEAP16[$23 >> 1] | 0) + 1 << 16 >> 16; //@line 1653
 HEAP16[$23 >> 1] = $45; //@line 1654
 $46 = $45 & 65535; //@line 1655
 $49 = HEAP32[(HEAP32[$0 >> 2] | 0) + 92 >> 2] | 0; //@line 1658
 $AsyncCtx10 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1659
 $50 = FUNCTION_TABLE_ii[$49 & 31]($0) | 0; //@line 1660
 if (___async) {
  HEAP32[$AsyncCtx10 >> 2] = 69; //@line 1663
  HEAP32[$AsyncCtx10 + 4 >> 2] = $46; //@line 1665
  HEAP32[$AsyncCtx10 + 8 >> 2] = $1; //@line 1667
  HEAP32[$AsyncCtx10 + 12 >> 2] = $23; //@line 1669
  sp = STACKTOP; //@line 1670
  return 0; //@line 1671
 }
 _emscripten_free_async_context($AsyncCtx10 | 0); //@line 1673
 if (($50 | 0) > ($46 | 0)) {
  return $1 | 0; //@line 1676
 }
 HEAP16[$23 >> 1] = 0; //@line 1678
 return $1 | 0; //@line 1679
}
function _vfprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $$0 = 0, $$1 = 0, $13 = 0, $14 = 0, $19 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $28 = 0, $29 = 0, $3 = 0, $32 = 0, $4 = 0, $43 = 0, $5 = 0, $51 = 0, $6 = 0, $AsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 8955
 STACKTOP = STACKTOP + 224 | 0; //@line 8956
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 8956
 $3 = sp + 120 | 0; //@line 8957
 $4 = sp + 80 | 0; //@line 8958
 $5 = sp; //@line 8959
 $6 = sp + 136 | 0; //@line 8960
 dest = $4; //@line 8961
 stop = dest + 40 | 0; //@line 8961
 do {
  HEAP32[dest >> 2] = 0; //@line 8961
  dest = dest + 4 | 0; //@line 8961
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 8963
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 8967
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 8974
  } else {
   $43 = 0; //@line 8976
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 8978
  $14 = $13 & 32; //@line 8979
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 8985
  }
  $19 = $0 + 48 | 0; //@line 8987
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 8992
    $24 = HEAP32[$23 >> 2] | 0; //@line 8993
    HEAP32[$23 >> 2] = $6; //@line 8994
    $25 = $0 + 28 | 0; //@line 8995
    HEAP32[$25 >> 2] = $6; //@line 8996
    $26 = $0 + 20 | 0; //@line 8997
    HEAP32[$26 >> 2] = $6; //@line 8998
    HEAP32[$19 >> 2] = 80; //@line 8999
    $28 = $0 + 16 | 0; //@line 9001
    HEAP32[$28 >> 2] = $6 + 80; //@line 9002
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 9003
    if (!$24) {
     $$1 = $29; //@line 9006
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 9009
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 9010
     FUNCTION_TABLE_iiii[$32 & 15]($0, 0, 0) | 0; //@line 9011
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 165; //@line 9014
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 9016
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 9018
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 9020
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 9022
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 9024
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 9026
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 9028
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 9030
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 9032
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 9034
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 9036
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 9038
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 9040
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 9042
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 9044
      sp = STACKTOP; //@line 9045
      STACKTOP = sp; //@line 9046
      return 0; //@line 9046
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 9048
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 9051
      HEAP32[$23 >> 2] = $24; //@line 9052
      HEAP32[$19 >> 2] = 0; //@line 9053
      HEAP32[$28 >> 2] = 0; //@line 9054
      HEAP32[$25 >> 2] = 0; //@line 9055
      HEAP32[$26 >> 2] = 0; //@line 9056
      $$1 = $$; //@line 9057
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 9063
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 9066
  HEAP32[$0 >> 2] = $51 | $14; //@line 9071
  if ($43 | 0) {
   ___unlockfile($0); //@line 9074
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 9076
 }
 STACKTOP = sp; //@line 9078
 return $$0 | 0; //@line 9078
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12860
 STACKTOP = STACKTOP + 64 | 0; //@line 12861
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 12861
 $4 = sp; //@line 12862
 $5 = HEAP32[$0 >> 2] | 0; //@line 12863
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 12866
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 12868
 HEAP32[$4 >> 2] = $2; //@line 12869
 HEAP32[$4 + 4 >> 2] = $0; //@line 12871
 HEAP32[$4 + 8 >> 2] = $1; //@line 12873
 HEAP32[$4 + 12 >> 2] = $3; //@line 12875
 $14 = $4 + 16 | 0; //@line 12876
 $15 = $4 + 20 | 0; //@line 12877
 $16 = $4 + 24 | 0; //@line 12878
 $17 = $4 + 28 | 0; //@line 12879
 $18 = $4 + 32 | 0; //@line 12880
 $19 = $4 + 40 | 0; //@line 12881
 dest = $14; //@line 12882
 stop = dest + 36 | 0; //@line 12882
 do {
  HEAP32[dest >> 2] = 0; //@line 12882
  dest = dest + 4 | 0; //@line 12882
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 12882
 HEAP8[$14 + 38 >> 0] = 0; //@line 12882
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 12887
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 12890
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 12891
   FUNCTION_TABLE_viiiiii[$24 & 7]($10, $4, $8, $8, 1, 0); //@line 12892
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 184; //@line 12895
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 12897
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 12899
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 12901
    sp = STACKTOP; //@line 12902
    STACKTOP = sp; //@line 12903
    return 0; //@line 12903
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12905
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 12909
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 12913
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 12916
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 12917
   FUNCTION_TABLE_viiiii[$33 & 7]($10, $4, $8, 1, 0); //@line 12918
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 185; //@line 12921
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 12923
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 12925
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 12927
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 12929
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 12931
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 12933
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 12935
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 12937
    sp = STACKTOP; //@line 12938
    STACKTOP = sp; //@line 12939
    return 0; //@line 12939
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12941
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 12955
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 12963
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 12979
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 12984
  }
 } while (0);
 STACKTOP = sp; //@line 12987
 return $$0 | 0; //@line 12987
}
function __ZN6C128328print_bmE6Bitmapii($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$02225 = 0, $$02225$us = 0, $$023$us30 = 0, $10 = 0, $11 = 0, $13 = 0, $27 = 0, $30 = 0, $5 = 0, $53 = 0, $55 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 865
 $5 = HEAP32[$1 + 4 >> 2] | 0; //@line 867
 if (($5 | 0) <= 0) {
  return;
 }
 $7 = HEAP32[$1 >> 2] | 0; //@line 872
 $9 = $1 + 12 | 0; //@line 874
 $10 = $1 + 8 | 0; //@line 875
 if (($7 | 0) > 0) {
  $$02225$us = 0; //@line 877
 } else {
  $$02225 = 0; //@line 879
  do {
   $$02225 = $$02225 + 1 | 0; //@line 881
  } while (($$02225 | 0) < ($5 | 0));
  return;
 }
 L8 : while (1) {
  $11 = $$02225$us + $3 | 0; //@line 892
  L10 : do {
   if (($11 | 0) <= 31) {
    $$023$us30 = 0; //@line 896
    while (1) {
     $13 = $$023$us30 + $2 | 0; //@line 898
     if (($13 | 0) > 127) {
      break L10;
     }
     $27 = (128 >>> ($$023$us30 & 7) & HEAP8[(HEAP32[$9 >> 2] | 0) + ((Math_imul(HEAP32[$10 >> 2] | 0, $$02225$us) | 0) + ($$023$us30 >>> 3 & 31)) >> 0] | 0) == 0; //@line 915
     $30 = HEAP32[(HEAP32[$0 >> 2] | 0) + 120 >> 2] | 0; //@line 918
     if ($27) {
      $AsyncCtx3 = _emscripten_alloc_async_context(48, sp) | 0; //@line 920
      FUNCTION_TABLE_viiii[$30 & 7]($0, $13, $11, 0); //@line 921
      if (___async) {
       label = 10; //@line 924
       break L8;
      }
      _emscripten_free_async_context($AsyncCtx3 | 0); //@line 927
     } else {
      $AsyncCtx = _emscripten_alloc_async_context(48, sp) | 0; //@line 929
      FUNCTION_TABLE_viiii[$30 & 7]($0, $13, $11, 1); //@line 930
      if (___async) {
       label = 7; //@line 933
       break L8;
      }
      _emscripten_free_async_context($AsyncCtx | 0); //@line 936
     }
     $53 = $$023$us30 + 1 | 0; //@line 938
     if (($53 | 0) < ($7 | 0)) {
      $$023$us30 = $53; //@line 941
     } else {
      break;
     }
    }
   }
  } while (0);
  $55 = $$02225$us + 1 | 0; //@line 948
  if (($55 | 0) < ($5 | 0)) {
   $$02225$us = $55; //@line 951
  } else {
   label = 15; //@line 953
   break;
  }
 }
 if ((label | 0) == 7) {
  HEAP32[$AsyncCtx >> 2] = 48; //@line 958
  HEAP32[$AsyncCtx + 4 >> 2] = $$023$us30; //@line 960
  HEAP32[$AsyncCtx + 8 >> 2] = $7; //@line 962
  HEAP32[$AsyncCtx + 12 >> 2] = $2; //@line 964
  HEAP32[$AsyncCtx + 16 >> 2] = $$02225$us; //@line 966
  HEAP32[$AsyncCtx + 20 >> 2] = $5; //@line 968
  HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 970
  HEAP32[$AsyncCtx + 28 >> 2] = $9; //@line 972
  HEAP32[$AsyncCtx + 32 >> 2] = $10; //@line 974
  HEAP32[$AsyncCtx + 36 >> 2] = $0; //@line 976
  HEAP32[$AsyncCtx + 40 >> 2] = $0; //@line 978
  HEAP32[$AsyncCtx + 44 >> 2] = $11; //@line 980
  sp = STACKTOP; //@line 981
  return;
 } else if ((label | 0) == 10) {
  HEAP32[$AsyncCtx3 >> 2] = 49; //@line 985
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$023$us30; //@line 987
  HEAP32[$AsyncCtx3 + 8 >> 2] = $7; //@line 989
  HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 991
  HEAP32[$AsyncCtx3 + 16 >> 2] = $$02225$us; //@line 993
  HEAP32[$AsyncCtx3 + 20 >> 2] = $5; //@line 995
  HEAP32[$AsyncCtx3 + 24 >> 2] = $3; //@line 997
  HEAP32[$AsyncCtx3 + 28 >> 2] = $9; //@line 999
  HEAP32[$AsyncCtx3 + 32 >> 2] = $10; //@line 1001
  HEAP32[$AsyncCtx3 + 36 >> 2] = $0; //@line 1003
  HEAP32[$AsyncCtx3 + 40 >> 2] = $0; //@line 1005
  HEAP32[$AsyncCtx3 + 44 >> 2] = $11; //@line 1007
  sp = STACKTOP; //@line 1008
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
 $3 = $1 & 255; //@line 8827
 $7 = ($2 | 0) != 0; //@line 8831
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 8835
   $$03555 = $0; //@line 8836
   $$03654 = $2; //@line 8836
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 8841
     $$036$lcssa64 = $$03654; //@line 8841
     label = 6; //@line 8842
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 8845
    $12 = $$03654 + -1 | 0; //@line 8846
    $16 = ($12 | 0) != 0; //@line 8850
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 8853
     $$03654 = $12; //@line 8853
    } else {
     $$035$lcssa = $11; //@line 8855
     $$036$lcssa = $12; //@line 8855
     $$lcssa = $16; //@line 8855
     label = 5; //@line 8856
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 8861
   $$036$lcssa = $2; //@line 8861
   $$lcssa = $7; //@line 8861
   label = 5; //@line 8862
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 8867
   $$036$lcssa64 = $$036$lcssa; //@line 8867
   label = 6; //@line 8868
  } else {
   $$2 = $$035$lcssa; //@line 8870
   $$3 = 0; //@line 8870
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 8876
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 8879
    $$3 = $$036$lcssa64; //@line 8879
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 8881
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 8885
      $$13745 = $$036$lcssa64; //@line 8885
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 8888
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 8897
       $30 = $$13745 + -4 | 0; //@line 8898
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 8901
        $$13745 = $30; //@line 8901
       } else {
        $$0$lcssa = $29; //@line 8903
        $$137$lcssa = $30; //@line 8903
        label = 11; //@line 8904
        break L11;
       }
      }
      $$140 = $$046; //@line 8908
      $$23839 = $$13745; //@line 8908
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 8910
      $$137$lcssa = $$036$lcssa64; //@line 8910
      label = 11; //@line 8911
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 8917
      $$3 = 0; //@line 8917
      break;
     } else {
      $$140 = $$0$lcssa; //@line 8920
      $$23839 = $$137$lcssa; //@line 8920
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 8927
      $$3 = $$23839; //@line 8927
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 8930
     $$23839 = $$23839 + -1 | 0; //@line 8931
     if (!$$23839) {
      $$2 = $35; //@line 8934
      $$3 = 0; //@line 8934
      break;
     } else {
      $$140 = $35; //@line 8937
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 8945
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 8598
 do {
  if (!$0) {
   do {
    if (!(HEAP32[335] | 0)) {
     $34 = 0; //@line 8606
    } else {
     $12 = HEAP32[335] | 0; //@line 8608
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 8609
     $13 = _fflush($12) | 0; //@line 8610
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 161; //@line 8613
      sp = STACKTOP; //@line 8614
      return 0; //@line 8615
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 8617
      $34 = $13; //@line 8618
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 8624
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 8628
    } else {
     $$02327 = $$02325; //@line 8630
     $$02426 = $34; //@line 8630
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 8637
      } else {
       $28 = 0; //@line 8639
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8647
       $25 = ___fflush_unlocked($$02327) | 0; //@line 8648
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 8653
       $$1 = $25 | $$02426; //@line 8655
      } else {
       $$1 = $$02426; //@line 8657
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 8661
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 8664
      if (!$$023) {
       $$024$lcssa = $$1; //@line 8667
       break L9;
      } else {
       $$02327 = $$023; //@line 8670
       $$02426 = $$1; //@line 8670
      }
     }
     HEAP32[$AsyncCtx >> 2] = 162; //@line 8673
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 8675
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 8677
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 8679
     sp = STACKTOP; //@line 8680
     return 0; //@line 8681
    }
   } while (0);
   ___ofl_unlock(); //@line 8684
   $$0 = $$024$lcssa; //@line 8685
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 8691
    $5 = ___fflush_unlocked($0) | 0; //@line 8692
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 159; //@line 8695
     sp = STACKTOP; //@line 8696
     return 0; //@line 8697
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 8699
     $$0 = $5; //@line 8700
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 8705
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 8706
   $7 = ___fflush_unlocked($0) | 0; //@line 8707
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 160; //@line 8710
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 8713
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 8715
    sp = STACKTOP; //@line 8716
    return 0; //@line 8717
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8719
   if ($phitmp) {
    $$0 = $7; //@line 8721
   } else {
    ___unlockfile($0); //@line 8723
    $$0 = $7; //@line 8724
   }
  }
 } while (0);
 return $$0 | 0; //@line 8728
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 13042
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 13048
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 13054
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 13057
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 13058
    FUNCTION_TABLE_viiiii[$53 & 7]($50, $1, $2, $3, $4); //@line 13059
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 188; //@line 13062
     sp = STACKTOP; //@line 13063
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13066
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 13074
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 13079
     $19 = $1 + 44 | 0; //@line 13080
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 13086
     HEAP8[$22 >> 0] = 0; //@line 13087
     $23 = $1 + 53 | 0; //@line 13088
     HEAP8[$23 >> 0] = 0; //@line 13089
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 13091
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 13094
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 13095
     FUNCTION_TABLE_viiiiii[$28 & 7]($25, $1, $2, $2, 1, $4); //@line 13096
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 187; //@line 13099
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 13101
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 13103
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 13105
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 13107
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 13109
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 13111
      sp = STACKTOP; //@line 13112
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 13115
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 13119
      label = 13; //@line 13120
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 13125
       label = 13; //@line 13126
      } else {
       $$037$off039 = 3; //@line 13128
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 13132
      $39 = $1 + 40 | 0; //@line 13133
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 13136
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 13146
        $$037$off039 = $$037$off038; //@line 13147
       } else {
        $$037$off039 = $$037$off038; //@line 13149
       }
      } else {
       $$037$off039 = $$037$off038; //@line 13152
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 13155
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 13162
   }
  }
 } while (0);
 return;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $12 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $29 = 0, $3 = 0, $36 = 0, $39 = 0, $40 = 0, $7 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx14 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 12354
 STACKTOP = STACKTOP + 48 | 0; //@line 12355
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 12355
 $vararg_buffer10 = sp + 32 | 0; //@line 12356
 $vararg_buffer7 = sp + 24 | 0; //@line 12357
 $vararg_buffer3 = sp + 16 | 0; //@line 12358
 $vararg_buffer = sp; //@line 12359
 $0 = sp + 36 | 0; //@line 12360
 $1 = ___cxa_get_globals_fast() | 0; //@line 12361
 if ($1 | 0) {
  $3 = HEAP32[$1 >> 2] | 0; //@line 12364
  if ($3 | 0) {
   $7 = $3 + 48 | 0; //@line 12369
   $9 = HEAP32[$7 >> 2] | 0; //@line 12371
   $12 = HEAP32[$7 + 4 >> 2] | 0; //@line 12374
   if (!(($9 & -256 | 0) == 1126902528 & ($12 | 0) == 1129074247)) {
    HEAP32[$vararg_buffer7 >> 2] = 8397; //@line 12380
    _abort_message(8347, $vararg_buffer7); //@line 12381
   }
   if (($9 | 0) == 1126902529 & ($12 | 0) == 1129074247) {
    $22 = HEAP32[$3 + 44 >> 2] | 0; //@line 12390
   } else {
    $22 = $3 + 80 | 0; //@line 12392
   }
   HEAP32[$0 >> 2] = $22; //@line 12394
   $23 = HEAP32[$3 >> 2] | 0; //@line 12395
   $25 = HEAP32[$23 + 4 >> 2] | 0; //@line 12397
   $28 = HEAP32[(HEAP32[52] | 0) + 16 >> 2] | 0; //@line 12400
   $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 12401
   $29 = FUNCTION_TABLE_iiii[$28 & 15](208, $23, $0) | 0; //@line 12402
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 178; //@line 12405
    HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 12407
    HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer3; //@line 12409
    HEAP32[$AsyncCtx + 12 >> 2] = $25; //@line 12411
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer3; //@line 12413
    HEAP32[$AsyncCtx + 20 >> 2] = $vararg_buffer; //@line 12415
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer; //@line 12417
    sp = STACKTOP; //@line 12418
    STACKTOP = sp; //@line 12419
    return;
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 12421
   if (!$29) {
    HEAP32[$vararg_buffer3 >> 2] = 8397; //@line 12423
    HEAP32[$vararg_buffer3 + 4 >> 2] = $25; //@line 12425
    _abort_message(8306, $vararg_buffer3); //@line 12426
   }
   $36 = HEAP32[$0 >> 2] | 0; //@line 12429
   $39 = HEAP32[(HEAP32[$36 >> 2] | 0) + 8 >> 2] | 0; //@line 12432
   $AsyncCtx14 = _emscripten_alloc_async_context(16, sp) | 0; //@line 12433
   $40 = FUNCTION_TABLE_ii[$39 & 31]($36) | 0; //@line 12434
   if (___async) {
    HEAP32[$AsyncCtx14 >> 2] = 179; //@line 12437
    HEAP32[$AsyncCtx14 + 4 >> 2] = $vararg_buffer; //@line 12439
    HEAP32[$AsyncCtx14 + 8 >> 2] = $25; //@line 12441
    HEAP32[$AsyncCtx14 + 12 >> 2] = $vararg_buffer; //@line 12443
    sp = STACKTOP; //@line 12444
    STACKTOP = sp; //@line 12445
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx14 | 0); //@line 12447
    HEAP32[$vararg_buffer >> 2] = 8397; //@line 12448
    HEAP32[$vararg_buffer + 4 >> 2] = $25; //@line 12450
    HEAP32[$vararg_buffer + 8 >> 2] = $40; //@line 12452
    _abort_message(8261, $vararg_buffer); //@line 12453
   }
  }
 }
 _abort_message(8385, $vararg_buffer10); //@line 12458
}
function __ZN4mbed6Stream4readEPvj__async_cb_15($0) {
 $0 = $0 | 0;
 var $$016$lcssa = 0, $10 = 0, $12 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 569
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 571
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 573
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 575
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 577
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 579
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 581
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 583
 if (($AsyncRetVal | 0) == -1) {
  $$016$lcssa = $4; //@line 586
 } else {
  $20 = $4 + 1 | 0; //@line 589
  HEAP8[$4 >> 0] = $AsyncRetVal; //@line 590
  if (($20 | 0) == ($6 | 0)) {
   $$016$lcssa = $6; //@line 593
  } else {
   $16 = HEAP32[(HEAP32[$12 >> 2] | 0) + 72 >> 2] | 0; //@line 597
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 598
   $17 = FUNCTION_TABLE_ii[$16 & 31]($10) | 0; //@line 599
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 97; //@line 602
    $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 603
    HEAP32[$18 >> 2] = $2; //@line 604
    $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 605
    HEAP32[$19 >> 2] = $20; //@line 606
    $21 = $ReallocAsyncCtx2 + 12 | 0; //@line 607
    HEAP32[$21 >> 2] = $6; //@line 608
    $22 = $ReallocAsyncCtx2 + 16 | 0; //@line 609
    HEAP32[$22 >> 2] = $8; //@line 610
    $23 = $ReallocAsyncCtx2 + 20 | 0; //@line 611
    HEAP32[$23 >> 2] = $10; //@line 612
    $24 = $ReallocAsyncCtx2 + 24 | 0; //@line 613
    HEAP32[$24 >> 2] = $12; //@line 614
    sp = STACKTOP; //@line 615
    return;
   }
   HEAP32[___async_retval >> 2] = $17; //@line 619
   ___async_unwind = 0; //@line 620
   HEAP32[$ReallocAsyncCtx2 >> 2] = 97; //@line 621
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 622
   HEAP32[$18 >> 2] = $2; //@line 623
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 624
   HEAP32[$19 >> 2] = $20; //@line 625
   $21 = $ReallocAsyncCtx2 + 12 | 0; //@line 626
   HEAP32[$21 >> 2] = $6; //@line 627
   $22 = $ReallocAsyncCtx2 + 16 | 0; //@line 628
   HEAP32[$22 >> 2] = $8; //@line 629
   $23 = $ReallocAsyncCtx2 + 20 | 0; //@line 630
   HEAP32[$23 >> 2] = $10; //@line 631
   $24 = $ReallocAsyncCtx2 + 24 | 0; //@line 632
   HEAP32[$24 >> 2] = $12; //@line 633
   sp = STACKTOP; //@line 634
   return;
  }
 }
 $31 = HEAP32[(HEAP32[$8 >> 2] | 0) + 84 >> 2] | 0; //@line 640
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 641
 FUNCTION_TABLE_vi[$31 & 255]($10); //@line 642
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 98; //@line 645
  $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 646
  HEAP32[$32 >> 2] = $$016$lcssa; //@line 647
  $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 648
  HEAP32[$33 >> 2] = $2; //@line 649
  sp = STACKTOP; //@line 650
  return;
 }
 ___async_unwind = 0; //@line 653
 HEAP32[$ReallocAsyncCtx3 >> 2] = 98; //@line 654
 $32 = $ReallocAsyncCtx3 + 4 | 0; //@line 655
 HEAP32[$32 >> 2] = $$016$lcssa; //@line 656
 $33 = $ReallocAsyncCtx3 + 8 | 0; //@line 657
 HEAP32[$33 >> 2] = $2; //@line 658
 sp = STACKTOP; //@line 659
 return;
}
function __ZN4mbed6Stream5writeEPKvj__async_cb_8($0) {
 $0 = $0 | 0;
 var $$1 = 0, $10 = 0, $12 = 0, $17 = 0, $18 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 165
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 167
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 169
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 171
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 173
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 175
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 177
 if ((HEAP32[___async_retval >> 2] | 0) == -1) {
  $$1 = $2; //@line 182
 } else {
  if (($2 | 0) == ($4 | 0)) {
   $$1 = $4; //@line 186
  } else {
   $17 = HEAP32[(HEAP32[$12 >> 2] | 0) + 68 >> 2] | 0; //@line 190
   $18 = $2 + 1 | 0; //@line 191
   $20 = HEAP8[$2 >> 0] | 0; //@line 193
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 194
   $21 = FUNCTION_TABLE_iii[$17 & 7]($8, $20) | 0; //@line 195
   if (___async) {
    HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 198
    $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 199
    HEAP32[$22 >> 2] = $18; //@line 200
    $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 201
    HEAP32[$23 >> 2] = $4; //@line 202
    $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 203
    HEAP32[$24 >> 2] = $6; //@line 204
    $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 205
    HEAP32[$25 >> 2] = $8; //@line 206
    $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 207
    HEAP32[$26 >> 2] = $10; //@line 208
    $27 = $ReallocAsyncCtx2 + 24 | 0; //@line 209
    HEAP32[$27 >> 2] = $12; //@line 210
    sp = STACKTOP; //@line 211
    return;
   }
   HEAP32[___async_retval >> 2] = $21; //@line 215
   ___async_unwind = 0; //@line 216
   HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 217
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 218
   HEAP32[$22 >> 2] = $18; //@line 219
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 220
   HEAP32[$23 >> 2] = $4; //@line 221
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 222
   HEAP32[$24 >> 2] = $6; //@line 223
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 224
   HEAP32[$25 >> 2] = $8; //@line 225
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 226
   HEAP32[$26 >> 2] = $10; //@line 227
   $27 = $ReallocAsyncCtx2 + 24 | 0; //@line 228
   HEAP32[$27 >> 2] = $12; //@line 229
   sp = STACKTOP; //@line 230
   return;
  }
 }
 $32 = HEAP32[(HEAP32[$6 >> 2] | 0) + 84 >> 2] | 0; //@line 236
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 237
 FUNCTION_TABLE_vi[$32 & 255]($8); //@line 238
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 101; //@line 241
  $33 = $ReallocAsyncCtx3 + 4 | 0; //@line 242
  HEAP32[$33 >> 2] = $$1; //@line 243
  $34 = $ReallocAsyncCtx3 + 8 | 0; //@line 244
  HEAP32[$34 >> 2] = $10; //@line 245
  sp = STACKTOP; //@line 246
  return;
 }
 ___async_unwind = 0; //@line 249
 HEAP32[$ReallocAsyncCtx3 >> 2] = 101; //@line 250
 $33 = $ReallocAsyncCtx3 + 4 | 0; //@line 251
 HEAP32[$33 >> 2] = $$1; //@line 252
 $34 = $ReallocAsyncCtx3 + 8 | 0; //@line 253
 HEAP32[$34 >> 2] = $10; //@line 254
 sp = STACKTOP; //@line 255
 return;
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7309
 STACKTOP = STACKTOP + 48 | 0; //@line 7310
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 7310
 $vararg_buffer3 = sp + 16 | 0; //@line 7311
 $vararg_buffer = sp; //@line 7312
 $3 = sp + 32 | 0; //@line 7313
 $4 = $0 + 28 | 0; //@line 7314
 $5 = HEAP32[$4 >> 2] | 0; //@line 7315
 HEAP32[$3 >> 2] = $5; //@line 7316
 $7 = $0 + 20 | 0; //@line 7318
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 7320
 HEAP32[$3 + 4 >> 2] = $9; //@line 7321
 HEAP32[$3 + 8 >> 2] = $1; //@line 7323
 HEAP32[$3 + 12 >> 2] = $2; //@line 7325
 $12 = $9 + $2 | 0; //@line 7326
 $13 = $0 + 60 | 0; //@line 7327
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 7330
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 7332
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 7334
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 7336
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 7340
  } else {
   $$04756 = 2; //@line 7342
   $$04855 = $12; //@line 7342
   $$04954 = $3; //@line 7342
   $27 = $17; //@line 7342
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 7348
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 7350
    $38 = $27 >>> 0 > $37 >>> 0; //@line 7351
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 7353
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 7355
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 7357
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 7360
    $44 = $$150 + 4 | 0; //@line 7361
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 7364
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 7367
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 7369
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 7371
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 7373
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 7376
     break L1;
    } else {
     $$04756 = $$1; //@line 7379
     $$04954 = $$150; //@line 7379
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 7383
   HEAP32[$4 >> 2] = 0; //@line 7384
   HEAP32[$7 >> 2] = 0; //@line 7385
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 7388
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 7391
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 7396
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 7402
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 7407
  $25 = $20; //@line 7408
  HEAP32[$4 >> 2] = $25; //@line 7409
  HEAP32[$7 >> 2] = $25; //@line 7410
  $$051 = $2; //@line 7411
 }
 STACKTOP = sp; //@line 7413
 return $$051 | 0; //@line 7413
}
function _freopen__async_cb($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $12 = 0, $16 = 0, $2 = 0, $28 = 0, $30 = 0, $31 = 0, $33 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 2245
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2247
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2249
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2251
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2253
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2255
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2257
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2261
 if (!$4) {
  $$pre = $2 + 60 | 0; //@line 2268
  if ($8 & 524288 | 0) {
   HEAP32[$16 >> 2] = HEAP32[$$pre >> 2]; //@line 2271
   HEAP32[$16 + 4 >> 2] = 2; //@line 2273
   HEAP32[$16 + 8 >> 2] = 1; //@line 2275
   ___syscall221(221, $16 | 0) | 0; //@line 2276
  }
  HEAP32[$12 >> 2] = HEAP32[$$pre >> 2]; //@line 2280
  HEAP32[$12 + 4 >> 2] = 4; //@line 2282
  HEAP32[$12 + 8 >> 2] = $8 & -524481; //@line 2284
  if ((___syscall_ret(___syscall221(221, $12 | 0) | 0) | 0) >= 0) {
   if ($6 | 0) {
    ___unlockfile($2); //@line 2291
   }
   HEAP32[___async_retval >> 2] = $2; //@line 2294
   return;
  }
 } else {
  $28 = _fopen($4, $10) | 0; //@line 2298
  if ($28 | 0) {
   $30 = $28 + 60 | 0; //@line 2301
   $31 = HEAP32[$30 >> 2] | 0; //@line 2302
   $33 = HEAP32[$2 + 60 >> 2] | 0; //@line 2304
   if (($31 | 0) == ($33 | 0)) {
    HEAP32[$30 >> 2] = -1; //@line 2307
   } else {
    if ((___dup3($31, $33, $8 & 524288) | 0) < 0) {
     $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 2313
     _fclose($28) | 0; //@line 2314
     if (!___async) {
      ___async_unwind = 0; //@line 2317
     }
     HEAP32[$ReallocAsyncCtx3 >> 2] = 171; //@line 2319
     HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $2; //@line 2321
     sp = STACKTOP; //@line 2322
     return;
    }
   }
   HEAP32[$2 >> 2] = HEAP32[$2 >> 2] & 1 | HEAP32[$28 >> 2]; //@line 2330
   HEAP32[$2 + 32 >> 2] = HEAP32[$28 + 32 >> 2]; //@line 2334
   HEAP32[$2 + 36 >> 2] = HEAP32[$28 + 36 >> 2]; //@line 2338
   HEAP32[$2 + 40 >> 2] = HEAP32[$28 + 40 >> 2]; //@line 2342
   HEAP32[$2 + 12 >> 2] = HEAP32[$28 + 12 >> 2]; //@line 2346
   $ReallocAsyncCtx4 = _emscripten_realloc_async_context(12) | 0; //@line 2347
   _fclose($28) | 0; //@line 2348
   if (!___async) {
    ___async_unwind = 0; //@line 2351
   }
   HEAP32[$ReallocAsyncCtx4 >> 2] = 170; //@line 2353
   HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $6; //@line 2355
   HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $2; //@line 2357
   sp = STACKTOP; //@line 2358
   return;
  }
 }
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 2362
 _fclose($2) | 0; //@line 2363
 if (!___async) {
  ___async_unwind = 0; //@line 2366
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 172; //@line 2368
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 2370
 sp = STACKTOP; //@line 2371
 return;
}
function __ZN4mbed6Stream5writeEPKvj__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $26 = 0, $27 = 0, $28 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 79
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 81
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 83
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 85
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 87
 if (($4 | 0) == ($6 | 0)) {
  $26 = HEAP32[(HEAP32[$8 >> 2] | 0) + 84 >> 2] | 0; //@line 92
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 93
  FUNCTION_TABLE_vi[$26 & 255]($2); //@line 94
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 101; //@line 97
   $27 = $ReallocAsyncCtx3 + 4 | 0; //@line 98
   HEAP32[$27 >> 2] = $6; //@line 99
   $28 = $ReallocAsyncCtx3 + 8 | 0; //@line 100
   HEAP32[$28 >> 2] = $4; //@line 101
   sp = STACKTOP; //@line 102
   return;
  }
  ___async_unwind = 0; //@line 105
  HEAP32[$ReallocAsyncCtx3 >> 2] = 101; //@line 106
  $27 = $ReallocAsyncCtx3 + 4 | 0; //@line 107
  HEAP32[$27 >> 2] = $6; //@line 108
  $28 = $ReallocAsyncCtx3 + 8 | 0; //@line 109
  HEAP32[$28 >> 2] = $4; //@line 110
  sp = STACKTOP; //@line 111
  return;
 } else {
  $12 = HEAP32[(HEAP32[$2 >> 2] | 0) + 68 >> 2] | 0; //@line 116
  $13 = $4 + 1 | 0; //@line 117
  $15 = HEAP8[$4 >> 0] | 0; //@line 119
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 120
  $16 = FUNCTION_TABLE_iii[$12 & 7]($2, $15) | 0; //@line 121
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 124
   $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 125
   HEAP32[$17 >> 2] = $13; //@line 126
   $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 127
   HEAP32[$18 >> 2] = $6; //@line 128
   $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 129
   HEAP32[$19 >> 2] = $8; //@line 130
   $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 131
   HEAP32[$20 >> 2] = $2; //@line 132
   $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 133
   HEAP32[$21 >> 2] = $4; //@line 134
   $22 = $ReallocAsyncCtx2 + 24 | 0; //@line 135
   HEAP32[$22 >> 2] = $2; //@line 136
   sp = STACKTOP; //@line 137
   return;
  }
  HEAP32[___async_retval >> 2] = $16; //@line 141
  ___async_unwind = 0; //@line 142
  HEAP32[$ReallocAsyncCtx2 >> 2] = 100; //@line 143
  $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 144
  HEAP32[$17 >> 2] = $13; //@line 145
  $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 146
  HEAP32[$18 >> 2] = $6; //@line 147
  $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 148
  HEAP32[$19 >> 2] = $8; //@line 149
  $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 150
  HEAP32[$20 >> 2] = $2; //@line 151
  $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 152
  HEAP32[$21 >> 2] = $4; //@line 153
  $22 = $ReallocAsyncCtx2 + 24 | 0; //@line 154
  HEAP32[$22 >> 2] = $2; //@line 155
  sp = STACKTOP; //@line 156
  return;
 }
}
function __ZN4mbed6Stream4readEPvj__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $25 = 0, $26 = 0, $27 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 484
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 486
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 490
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 492
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 494
 if (!(HEAP32[$0 + 8 >> 2] | 0)) {
  $25 = HEAP32[(HEAP32[$10 >> 2] | 0) + 84 >> 2] | 0; //@line 499
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(12) | 0; //@line 500
  FUNCTION_TABLE_vi[$25 & 255]($2); //@line 501
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 98; //@line 504
   $26 = $ReallocAsyncCtx3 + 4 | 0; //@line 505
   HEAP32[$26 >> 2] = $6; //@line 506
   $27 = $ReallocAsyncCtx3 + 8 | 0; //@line 507
   HEAP32[$27 >> 2] = $6; //@line 508
   sp = STACKTOP; //@line 509
   return;
  }
  ___async_unwind = 0; //@line 512
  HEAP32[$ReallocAsyncCtx3 >> 2] = 98; //@line 513
  $26 = $ReallocAsyncCtx3 + 4 | 0; //@line 514
  HEAP32[$26 >> 2] = $6; //@line 515
  $27 = $ReallocAsyncCtx3 + 8 | 0; //@line 516
  HEAP32[$27 >> 2] = $6; //@line 517
  sp = STACKTOP; //@line 518
  return;
 } else {
  $14 = HEAP32[(HEAP32[$2 >> 2] | 0) + 72 >> 2] | 0; //@line 523
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(28) | 0; //@line 524
  $15 = FUNCTION_TABLE_ii[$14 & 31]($2) | 0; //@line 525
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 97; //@line 528
   $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 529
   HEAP32[$16 >> 2] = $6; //@line 530
   $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 531
   HEAP32[$17 >> 2] = $6; //@line 532
   $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 533
   HEAP32[$18 >> 2] = $8; //@line 534
   $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 535
   HEAP32[$19 >> 2] = $10; //@line 536
   $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 537
   HEAP32[$20 >> 2] = $2; //@line 538
   $21 = $ReallocAsyncCtx2 + 24 | 0; //@line 539
   HEAP32[$21 >> 2] = $2; //@line 540
   sp = STACKTOP; //@line 541
   return;
  }
  HEAP32[___async_retval >> 2] = $15; //@line 545
  ___async_unwind = 0; //@line 546
  HEAP32[$ReallocAsyncCtx2 >> 2] = 97; //@line 547
  $16 = $ReallocAsyncCtx2 + 4 | 0; //@line 548
  HEAP32[$16 >> 2] = $6; //@line 549
  $17 = $ReallocAsyncCtx2 + 8 | 0; //@line 550
  HEAP32[$17 >> 2] = $6; //@line 551
  $18 = $ReallocAsyncCtx2 + 12 | 0; //@line 552
  HEAP32[$18 >> 2] = $8; //@line 553
  $19 = $ReallocAsyncCtx2 + 16 | 0; //@line 554
  HEAP32[$19 >> 2] = $10; //@line 555
  $20 = $ReallocAsyncCtx2 + 20 | 0; //@line 556
  HEAP32[$20 >> 2] = $2; //@line 557
  $21 = $ReallocAsyncCtx2 + 24 | 0; //@line 558
  HEAP32[$21 >> 2] = $2; //@line 559
  sp = STACKTOP; //@line 560
  return;
 }
}
function ___fdopen($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $19 = 0, $2 = 0, $24 = 0, $29 = 0, $31 = 0, $8 = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 8253
 STACKTOP = STACKTOP + 64 | 0; //@line 8254
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 8254
 $vararg_buffer12 = sp + 40 | 0; //@line 8255
 $vararg_buffer7 = sp + 24 | 0; //@line 8256
 $vararg_buffer3 = sp + 16 | 0; //@line 8257
 $vararg_buffer = sp; //@line 8258
 $2 = sp + 56 | 0; //@line 8259
 if (!(_strchr(5831, HEAP8[$1 >> 0] | 0) | 0)) {
  HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 8266
  $$0 = 0; //@line 8267
 } else {
  $8 = _malloc(1156) | 0; //@line 8269
  if (!$8) {
   $$0 = 0; //@line 8272
  } else {
   _memset($8 | 0, 0, 124) | 0; //@line 8274
   if (!(_strchr($1, 43) | 0)) {
    HEAP32[$8 >> 2] = (HEAP8[$1 >> 0] | 0) == 114 ? 8 : 4; //@line 8281
   }
   if (_strchr($1, 101) | 0) {
    HEAP32[$vararg_buffer >> 2] = $0; //@line 8286
    HEAP32[$vararg_buffer + 4 >> 2] = 2; //@line 8288
    HEAP32[$vararg_buffer + 8 >> 2] = 1; //@line 8290
    ___syscall221(221, $vararg_buffer | 0) | 0; //@line 8291
   }
   if ((HEAP8[$1 >> 0] | 0) == 97) {
    HEAP32[$vararg_buffer3 >> 2] = $0; //@line 8296
    HEAP32[$vararg_buffer3 + 4 >> 2] = 3; //@line 8298
    $19 = ___syscall221(221, $vararg_buffer3 | 0) | 0; //@line 8299
    if (!($19 & 1024)) {
     HEAP32[$vararg_buffer7 >> 2] = $0; //@line 8304
     HEAP32[$vararg_buffer7 + 4 >> 2] = 4; //@line 8306
     HEAP32[$vararg_buffer7 + 8 >> 2] = $19 | 1024; //@line 8308
     ___syscall221(221, $vararg_buffer7 | 0) | 0; //@line 8309
    }
    $24 = HEAP32[$8 >> 2] | 128; //@line 8312
    HEAP32[$8 >> 2] = $24; //@line 8313
    $31 = $24; //@line 8314
   } else {
    $31 = HEAP32[$8 >> 2] | 0; //@line 8317
   }
   HEAP32[$8 + 60 >> 2] = $0; //@line 8320
   HEAP32[$8 + 44 >> 2] = $8 + 132; //@line 8323
   HEAP32[$8 + 48 >> 2] = 1024; //@line 8325
   $29 = $8 + 75 | 0; //@line 8326
   HEAP8[$29 >> 0] = -1; //@line 8327
   if (!($31 & 8)) {
    HEAP32[$vararg_buffer12 >> 2] = $0; //@line 8332
    HEAP32[$vararg_buffer12 + 4 >> 2] = 21523; //@line 8334
    HEAP32[$vararg_buffer12 + 8 >> 2] = $2; //@line 8336
    if (!(___syscall54(54, $vararg_buffer12 | 0) | 0)) {
     HEAP8[$29 >> 0] = 10; //@line 8340
    }
   }
   HEAP32[$8 + 32 >> 2] = 10; //@line 8344
   HEAP32[$8 + 36 >> 2] = 5; //@line 8346
   HEAP32[$8 + 40 >> 2] = 6; //@line 8348
   HEAP32[$8 + 12 >> 2] = 19; //@line 8350
   if (!(HEAP32[3386] | 0)) {
    HEAP32[$8 + 76 >> 2] = -1; //@line 8355
   }
   ___ofl_add($8) | 0; //@line 8357
   $$0 = $8; //@line 8358
  }
 }
 STACKTOP = sp; //@line 8361
 return $$0 | 0; //@line 8361
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_1($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14273
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14277
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14279
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 14281
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 14283
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 14285
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 14287
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 14289
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 14291
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 14293
 $22 = HEAP8[$0 + 44 >> 0] & 1; //@line 14296
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 14298
 do {
  if ((HEAP32[$0 + 4 >> 2] | 0) > 1) {
   $26 = $4 + 24 | 0; //@line 14302
   $27 = $6 + 24 | 0; //@line 14303
   $28 = $4 + 8 | 0; //@line 14304
   $29 = $6 + 54 | 0; //@line 14305
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
    HEAP8[$10 >> 0] = 0; //@line 14335
    HEAP8[$14 >> 0] = 0; //@line 14336
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 14337
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($26, $6, $16, $18, $20, $22); //@line 14338
    if (!___async) {
     ___async_unwind = 0; //@line 14341
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 193; //@line 14343
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $26; //@line 14345
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $24; //@line 14347
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $29; //@line 14349
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 14351
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 14353
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 14355
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 14357
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $27; //@line 14359
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $28; //@line 14361
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $6; //@line 14363
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $16; //@line 14365
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $18; //@line 14367
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $20; //@line 14369
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $22 & 1; //@line 14372
    sp = STACKTOP; //@line 14373
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 14378
 HEAP8[$14 >> 0] = $12; //@line 14379
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $4 = 0, $43 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14157
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14161
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14163
 $8 = HEAP8[$0 + 16 >> 0] | 0; //@line 14165
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 14167
 $12 = HEAP8[$0 + 24 >> 0] | 0; //@line 14169
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 14171
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 14173
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 14175
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 14177
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 14179
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 14181
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 14183
 $28 = HEAP8[$0 + 56 >> 0] & 1; //@line 14186
 $43 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 14187
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
    HEAP8[$10 >> 0] = 0; //@line 14220
    HEAP8[$14 >> 0] = 0; //@line 14221
    $ReallocAsyncCtx = _emscripten_realloc_async_context(60) | 0; //@line 14222
    __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($43, $20, $22, $24, $26, $28); //@line 14223
    if (!___async) {
     ___async_unwind = 0; //@line 14226
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 193; //@line 14228
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $43; //@line 14230
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 14232
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 14234
    HEAP8[$ReallocAsyncCtx + 16 >> 0] = $8; //@line 14236
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 14238
    HEAP8[$ReallocAsyncCtx + 24 >> 0] = $12; //@line 14240
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 14242
    HEAP32[$ReallocAsyncCtx + 32 >> 2] = $16; //@line 14244
    HEAP32[$ReallocAsyncCtx + 36 >> 2] = $18; //@line 14246
    HEAP32[$ReallocAsyncCtx + 40 >> 2] = $20; //@line 14248
    HEAP32[$ReallocAsyncCtx + 44 >> 2] = $22; //@line 14250
    HEAP32[$ReallocAsyncCtx + 48 >> 2] = $24; //@line 14252
    HEAP32[$ReallocAsyncCtx + 52 >> 2] = $26; //@line 14254
    HEAP8[$ReallocAsyncCtx + 56 >> 0] = $28 & 1; //@line 14257
    sp = STACKTOP; //@line 14258
    return;
   }
  }
 } while (0);
 HEAP8[$10 >> 0] = $8; //@line 14263
 HEAP8[$14 >> 0] = $12; //@line 14264
 return;
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 7021
 }
 ret = dest | 0; //@line 7024
 dest_end = dest + num | 0; //@line 7025
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 7029
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 7030
   dest = dest + 1 | 0; //@line 7031
   src = src + 1 | 0; //@line 7032
   num = num - 1 | 0; //@line 7033
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 7035
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 7036
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 7038
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 7039
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 7040
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 7041
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 7042
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 7043
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 7044
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 7045
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 7046
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 7047
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 7048
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 7049
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 7050
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 7051
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 7052
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 7053
   dest = dest + 64 | 0; //@line 7054
   src = src + 64 | 0; //@line 7055
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 7058
   dest = dest + 4 | 0; //@line 7059
   src = src + 4 | 0; //@line 7060
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 7064
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 7066
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 7067
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 7068
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 7069
   dest = dest + 4 | 0; //@line 7070
   src = src + 4 | 0; //@line 7071
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 7076
  dest = dest + 1 | 0; //@line 7077
  src = src + 1 | 0; //@line 7078
 }
 return ret | 0; //@line 7080
}
function __ZN4mbed6Stream4readEPvj($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$016$lcssa = 0, $$01617 = 0, $15 = 0, $16 = 0, $25 = 0, $29 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 2451
 $3 = $1 + $2 | 0; //@line 2452
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 80 >> 2] | 0; //@line 2455
 $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 2456
 FUNCTION_TABLE_vi[$6 & 255]($0); //@line 2457
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 96; //@line 2460
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2462
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 2464
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 2466
  HEAP32[$AsyncCtx + 16 >> 2] = $3; //@line 2468
  HEAP32[$AsyncCtx + 20 >> 2] = $0; //@line 2470
  sp = STACKTOP; //@line 2471
  return 0; //@line 2472
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2474
 L4 : do {
  if (!$2) {
   $$016$lcssa = $1; //@line 2478
  } else {
   $$01617 = $1; //@line 2480
   while (1) {
    $15 = HEAP32[(HEAP32[$0 >> 2] | 0) + 72 >> 2] | 0; //@line 2484
    $AsyncCtx2 = _emscripten_alloc_async_context(28, sp) | 0; //@line 2485
    $16 = FUNCTION_TABLE_ii[$15 & 31]($0) | 0; //@line 2486
    if (___async) {
     break;
    }
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2491
    if (($16 | 0) == -1) {
     $$016$lcssa = $$01617; //@line 2494
     break L4;
    }
    $25 = $$01617 + 1 | 0; //@line 2498
    HEAP8[$$01617 >> 0] = $16; //@line 2499
    if (($25 | 0) == ($3 | 0)) {
     $$016$lcssa = $3; //@line 2502
     break L4;
    } else {
     $$01617 = $25; //@line 2505
    }
   }
   HEAP32[$AsyncCtx2 >> 2] = 97; //@line 2508
   HEAP32[$AsyncCtx2 + 4 >> 2] = $1; //@line 2510
   HEAP32[$AsyncCtx2 + 8 >> 2] = $$01617; //@line 2512
   HEAP32[$AsyncCtx2 + 12 >> 2] = $3; //@line 2514
   HEAP32[$AsyncCtx2 + 16 >> 2] = $0; //@line 2516
   HEAP32[$AsyncCtx2 + 20 >> 2] = $0; //@line 2518
   HEAP32[$AsyncCtx2 + 24 >> 2] = $0; //@line 2520
   sp = STACKTOP; //@line 2521
   return 0; //@line 2522
  }
 } while (0);
 $29 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 2527
 $AsyncCtx5 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2528
 FUNCTION_TABLE_vi[$29 & 255]($0); //@line 2529
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 98; //@line 2532
  HEAP32[$AsyncCtx5 + 4 >> 2] = $$016$lcssa; //@line 2534
  HEAP32[$AsyncCtx5 + 8 >> 2] = $1; //@line 2536
  sp = STACKTOP; //@line 2537
  return 0; //@line 2538
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 2540
  return $$016$lcssa - $1 | 0; //@line 2544
 }
 return 0; //@line 2546
}
function _main__async_cb_43($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $23 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 3154
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3156
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3158
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3160
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3162
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3164
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3166
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3168
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3170
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3172
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 3174
 __ZN4mbed6Stream6printfEPKcz(8860, 5809, $2) | 0; //@line 3175
 __ZN6C128326locateEii(8860, 5, $6); //@line 3176
 __ZN4mbed6Stream6printfEPKcz(8860, 5815, $8) | 0; //@line 3177
 __ZN6C1283211copy_to_lcdEv(8860); //@line 3178
 $22 = $12 + 2 | 0; //@line 3179
 __ZN6C128326locateEii(8860, 5, $22); //@line 3181
 __ZN4mbed6Stream6printfEPKcz(8860, 5809, $14) | 0; //@line 3182
 $23 = $22 + 12 | 0; //@line 3183
 __ZN6C128326locateEii(8860, 5, $23); //@line 3184
 __ZN4mbed6Stream6printfEPKcz(8860, 5815, $18) | 0; //@line 3185
 __ZN6C1283211copy_to_lcdEv(8860); //@line 3186
 if (($22 | 0) < 5) {
  __ZN6C128326locateEii(8860, 5, $22); //@line 3188
  $ReallocAsyncCtx12 = _emscripten_realloc_async_context(44) | 0; //@line 3189
  _wait(.20000000298023224); //@line 3190
  if (!___async) {
   ___async_unwind = 0; //@line 3193
  }
  HEAP32[$ReallocAsyncCtx12 >> 2] = 154; //@line 3195
  HEAP32[$ReallocAsyncCtx12 + 4 >> 2] = $2; //@line 3197
  HEAP32[$ReallocAsyncCtx12 + 8 >> 2] = $4; //@line 3199
  HEAP32[$ReallocAsyncCtx12 + 12 >> 2] = $23; //@line 3201
  HEAP32[$ReallocAsyncCtx12 + 16 >> 2] = $8; //@line 3203
  HEAP32[$ReallocAsyncCtx12 + 20 >> 2] = $10; //@line 3205
  HEAP32[$ReallocAsyncCtx12 + 24 >> 2] = $22; //@line 3207
  HEAP32[$ReallocAsyncCtx12 + 28 >> 2] = $14; //@line 3209
  HEAP32[$ReallocAsyncCtx12 + 32 >> 2] = $16; //@line 3211
  HEAP32[$ReallocAsyncCtx12 + 36 >> 2] = $18; //@line 3213
  HEAP32[$ReallocAsyncCtx12 + 40 >> 2] = $20; //@line 3215
  sp = STACKTOP; //@line 3216
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 3219
 _puts(5825) | 0; //@line 3220
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 155; //@line 3223
  sp = STACKTOP; //@line 3224
  return;
 }
 ___async_unwind = 0; //@line 3227
 HEAP32[$ReallocAsyncCtx >> 2] = 155; //@line 3228
 sp = STACKTOP; //@line 3229
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 12543
 STACKTOP = STACKTOP + 64 | 0; //@line 12544
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 12544
 $3 = sp; //@line 12545
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 12548
 } else {
  if (!$1) {
   $$2 = 0; //@line 12552
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 12554
   $6 = ___dynamic_cast($1, 232, 216, 0) | 0; //@line 12555
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 182; //@line 12558
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 12560
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 12562
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 12564
    sp = STACKTOP; //@line 12565
    STACKTOP = sp; //@line 12566
    return 0; //@line 12566
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12568
   if (!$6) {
    $$2 = 0; //@line 12571
   } else {
    dest = $3 + 4 | 0; //@line 12574
    stop = dest + 52 | 0; //@line 12574
    do {
     HEAP32[dest >> 2] = 0; //@line 12574
     dest = dest + 4 | 0; //@line 12574
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 12575
    HEAP32[$3 + 8 >> 2] = $0; //@line 12577
    HEAP32[$3 + 12 >> 2] = -1; //@line 12579
    HEAP32[$3 + 48 >> 2] = 1; //@line 12581
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 12584
    $18 = HEAP32[$2 >> 2] | 0; //@line 12585
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 12586
    FUNCTION_TABLE_viiii[$17 & 7]($6, $3, $18, 1); //@line 12587
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 183; //@line 12590
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 12592
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 12594
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 12596
     sp = STACKTOP; //@line 12597
     STACKTOP = sp; //@line 12598
     return 0; //@line 12598
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12600
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 12607
     $$0 = 1; //@line 12608
    } else {
     $$0 = 0; //@line 12610
    }
    $$2 = $$0; //@line 12612
   }
  }
 }
 STACKTOP = sp; //@line 12616
 return $$2 | 0; //@line 12616
}
function __ZN4mbed6Stream5writeEPKvj($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$1 = 0, $14 = 0, $15 = 0, $17 = 0, $18 = 0, $28 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 2555
 $3 = $1 + $2 | 0; //@line 2556
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 80 >> 2] | 0; //@line 2559
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 2560
 FUNCTION_TABLE_vi[$6 & 255]($0); //@line 2561
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 99; //@line 2564
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2566
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 2568
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 2570
  HEAP32[$AsyncCtx + 16 >> 2] = $0; //@line 2572
  sp = STACKTOP; //@line 2573
  return 0; //@line 2574
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2576
 $$0 = $1; //@line 2577
 while (1) {
  if (($$0 | 0) == ($3 | 0)) {
   $$1 = $3; //@line 2581
   break;
  }
  $14 = HEAP32[(HEAP32[$0 >> 2] | 0) + 68 >> 2] | 0; //@line 2586
  $15 = $$0 + 1 | 0; //@line 2587
  $17 = HEAP8[$$0 >> 0] | 0; //@line 2589
  $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 2590
  $18 = FUNCTION_TABLE_iii[$14 & 7]($0, $17) | 0; //@line 2591
  if (___async) {
   label = 6; //@line 2594
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2597
  if (($18 | 0) == -1) {
   $$1 = $15; //@line 2600
   break;
  } else {
   $$0 = $15; //@line 2603
  }
 }
 if ((label | 0) == 6) {
  HEAP32[$AsyncCtx3 >> 2] = 100; //@line 2607
  HEAP32[$AsyncCtx3 + 4 >> 2] = $15; //@line 2609
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 2611
  HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 2613
  HEAP32[$AsyncCtx3 + 16 >> 2] = $0; //@line 2615
  HEAP32[$AsyncCtx3 + 20 >> 2] = $1; //@line 2617
  HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 2619
  sp = STACKTOP; //@line 2620
  return 0; //@line 2621
 }
 $28 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 2625
 $AsyncCtx7 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2626
 FUNCTION_TABLE_vi[$28 & 255]($0); //@line 2627
 if (___async) {
  HEAP32[$AsyncCtx7 >> 2] = 101; //@line 2630
  HEAP32[$AsyncCtx7 + 4 >> 2] = $$1; //@line 2632
  HEAP32[$AsyncCtx7 + 8 >> 2] = $1; //@line 2634
  sp = STACKTOP; //@line 2635
  return 0; //@line 2636
 } else {
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2638
  return $$1 - $1 | 0; //@line 2642
 }
 return 0; //@line 2644
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 11700
 STACKTOP = STACKTOP + 128 | 0; //@line 11701
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 11701
 $4 = sp + 124 | 0; //@line 11702
 $5 = sp; //@line 11703
 dest = $5; //@line 11704
 src = 1588; //@line 11704
 stop = dest + 124 | 0; //@line 11704
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 11704
  dest = dest + 4 | 0; //@line 11704
  src = src + 4 | 0; //@line 11704
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 11710
   $$015 = 1; //@line 11710
   label = 4; //@line 11711
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 11714
   $$0 = -1; //@line 11715
  }
 } else {
  $$014 = $0; //@line 11718
  $$015 = $1; //@line 11718
  label = 4; //@line 11719
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 11723
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 11725
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 11727
  $14 = $5 + 20 | 0; //@line 11728
  HEAP32[$14 >> 2] = $$014; //@line 11729
  HEAP32[$5 + 44 >> 2] = $$014; //@line 11731
  $16 = $$014 + $$$015 | 0; //@line 11732
  $17 = $5 + 16 | 0; //@line 11733
  HEAP32[$17 >> 2] = $16; //@line 11734
  HEAP32[$5 + 28 >> 2] = $16; //@line 11736
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 11737
  $19 = _vfprintf($5, $2, $3) | 0; //@line 11738
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 166; //@line 11741
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 11743
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 11745
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 11747
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 11749
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 11751
   sp = STACKTOP; //@line 11752
   STACKTOP = sp; //@line 11753
   return 0; //@line 11753
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11755
  if (!$$$015) {
   $$0 = $19; //@line 11758
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 11760
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 11765
   $$0 = $19; //@line 11766
  }
 }
 STACKTOP = sp; //@line 11769
 return $$0 | 0; //@line 11769
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $19 = 0, $28 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 13875
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 13881
  } else {
   $9 = HEAP32[$0 + 12 >> 2] | 0; //@line 13885
   $10 = $0 + 16 + ($9 << 3) | 0; //@line 13886
   $AsyncCtx3 = _emscripten_alloc_async_context(28, sp) | 0; //@line 13887
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0 + 16 | 0, $1, $2, $3); //@line 13888
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 199; //@line 13891
    HEAP32[$AsyncCtx3 + 4 >> 2] = $9; //@line 13893
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 13895
    HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 13897
    HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 13899
    HEAP32[$AsyncCtx3 + 20 >> 2] = $3; //@line 13901
    HEAP32[$AsyncCtx3 + 24 >> 2] = $10; //@line 13903
    sp = STACKTOP; //@line 13904
    return;
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 13907
   if (($9 | 0) > 1) {
    $19 = $1 + 54 | 0; //@line 13911
    $$0 = $0 + 24 | 0; //@line 13912
    while (1) {
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 13914
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0, $1, $2, $3); //@line 13915
     if (___async) {
      break;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 13920
     if (HEAP8[$19 >> 0] | 0) {
      break L1;
     }
     $28 = $$0 + 8 | 0; //@line 13926
     if ($28 >>> 0 < $10 >>> 0) {
      $$0 = $28; //@line 13929
     } else {
      break L1;
     }
    }
    HEAP32[$AsyncCtx >> 2] = 200; //@line 13934
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 13936
    HEAP32[$AsyncCtx + 8 >> 2] = $$0; //@line 13938
    HEAP32[$AsyncCtx + 12 >> 2] = $10; //@line 13940
    HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 13942
    HEAP32[$AsyncCtx + 20 >> 2] = $2; //@line 13944
    HEAP32[$AsyncCtx + 24 >> 2] = $3; //@line 13946
    sp = STACKTOP; //@line 13947
    return;
   }
  }
 } while (0);
 return;
}
function __ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb_79($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $25 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5343
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5347
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5349
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5351
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5353
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5355
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 5357
 $16 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 5358
 if (($16 | 0) == ($4 | 0)) {
  return;
 }
 $25 = HEAPU16[((128 >>> ($16 & 7) & HEAP8[$6 + ($16 >> 3) >> 0] | 0) == 0 ? $8 : $10) >> 1] | 0; //@line 5373
 $28 = HEAP32[(HEAP32[$12 >> 2] | 0) + 136 >> 2] | 0; //@line 5376
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(32) | 0; //@line 5377
 FUNCTION_TABLE_vii[$28 & 7]($14, $25); //@line 5378
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 62; //@line 5381
  $29 = $ReallocAsyncCtx2 + 4 | 0; //@line 5382
  HEAP32[$29 >> 2] = $16; //@line 5383
  $30 = $ReallocAsyncCtx2 + 8 | 0; //@line 5384
  HEAP32[$30 >> 2] = $4; //@line 5385
  $31 = $ReallocAsyncCtx2 + 12 | 0; //@line 5386
  HEAP32[$31 >> 2] = $6; //@line 5387
  $32 = $ReallocAsyncCtx2 + 16 | 0; //@line 5388
  HEAP32[$32 >> 2] = $8; //@line 5389
  $33 = $ReallocAsyncCtx2 + 20 | 0; //@line 5390
  HEAP32[$33 >> 2] = $10; //@line 5391
  $34 = $ReallocAsyncCtx2 + 24 | 0; //@line 5392
  HEAP32[$34 >> 2] = $12; //@line 5393
  $35 = $ReallocAsyncCtx2 + 28 | 0; //@line 5394
  HEAP32[$35 >> 2] = $14; //@line 5395
  sp = STACKTOP; //@line 5396
  return;
 }
 ___async_unwind = 0; //@line 5399
 HEAP32[$ReallocAsyncCtx2 >> 2] = 62; //@line 5400
 $29 = $ReallocAsyncCtx2 + 4 | 0; //@line 5401
 HEAP32[$29 >> 2] = $16; //@line 5402
 $30 = $ReallocAsyncCtx2 + 8 | 0; //@line 5403
 HEAP32[$30 >> 2] = $4; //@line 5404
 $31 = $ReallocAsyncCtx2 + 12 | 0; //@line 5405
 HEAP32[$31 >> 2] = $6; //@line 5406
 $32 = $ReallocAsyncCtx2 + 16 | 0; //@line 5407
 HEAP32[$32 >> 2] = $8; //@line 5408
 $33 = $ReallocAsyncCtx2 + 20 | 0; //@line 5409
 HEAP32[$33 >> 2] = $10; //@line 5410
 $34 = $ReallocAsyncCtx2 + 24 | 0; //@line 5411
 HEAP32[$34 >> 2] = $12; //@line 5412
 $35 = $ReallocAsyncCtx2 + 28 | 0; //@line 5413
 HEAP32[$35 >> 2] = $14; //@line 5414
 sp = STACKTOP; //@line 5415
 return;
}
function __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_91($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $17 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6327
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6329
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6331
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6333
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6335
 HEAP32[$2 >> 2] = 328; //@line 6336
 HEAP32[$2 + 4 >> 2] = 488; //@line 6338
 $10 = $2 + 4172 | 0; //@line 6339
 HEAP32[$10 >> 2] = $4; //@line 6340
 $11 = $2 + 4176 | 0; //@line 6341
 HEAP32[$11 >> 2] = $6; //@line 6342
 $12 = $2 + 4180 | 0; //@line 6343
 HEAP32[$12 >> 2] = $8; //@line 6344
 _emscripten_asm_const_iiii(1, $4 | 0, $6 | 0, $8 | 0) | 0; //@line 6345
 HEAP32[$2 + 56 >> 2] = 1; //@line 6347
 HEAP32[$2 + 52 >> 2] = 0; //@line 6349
 HEAP32[$2 + 60 >> 2] = 0; //@line 6351
 $17 = $2 + 68 | 0; //@line 6352
 _memset($17 | 0, 0, 4096) | 0; //@line 6353
 $20 = HEAP32[(HEAP32[$2 >> 2] | 0) + 108 >> 2] | 0; //@line 6356
 $ReallocAsyncCtx = _emscripten_realloc_async_context(24) | 0; //@line 6357
 FUNCTION_TABLE_viii[$20 & 3]($2, 0, 0); //@line 6358
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 47; //@line 6361
  $21 = $ReallocAsyncCtx + 4 | 0; //@line 6362
  HEAP32[$21 >> 2] = $2; //@line 6363
  $22 = $ReallocAsyncCtx + 8 | 0; //@line 6364
  HEAP32[$22 >> 2] = $10; //@line 6365
  $23 = $ReallocAsyncCtx + 12 | 0; //@line 6366
  HEAP32[$23 >> 2] = $11; //@line 6367
  $24 = $ReallocAsyncCtx + 16 | 0; //@line 6368
  HEAP32[$24 >> 2] = $12; //@line 6369
  $25 = $ReallocAsyncCtx + 20 | 0; //@line 6370
  HEAP32[$25 >> 2] = $17; //@line 6371
  sp = STACKTOP; //@line 6372
  return;
 }
 ___async_unwind = 0; //@line 6375
 HEAP32[$ReallocAsyncCtx >> 2] = 47; //@line 6376
 $21 = $ReallocAsyncCtx + 4 | 0; //@line 6377
 HEAP32[$21 >> 2] = $2; //@line 6378
 $22 = $ReallocAsyncCtx + 8 | 0; //@line 6379
 HEAP32[$22 >> 2] = $10; //@line 6380
 $23 = $ReallocAsyncCtx + 12 | 0; //@line 6381
 HEAP32[$23 >> 2] = $11; //@line 6382
 $24 = $ReallocAsyncCtx + 16 | 0; //@line 6383
 HEAP32[$24 >> 2] = $12; //@line 6384
 $25 = $ReallocAsyncCtx + 20 | 0; //@line 6385
 HEAP32[$25 >> 2] = $17; //@line 6386
 sp = STACKTOP; //@line 6387
 return;
}
function _fputc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12126
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 12131
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 12136
  } else {
   $20 = $0 & 255; //@line 12138
   $21 = $0 & 255; //@line 12139
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 12145
   } else {
    $26 = $1 + 20 | 0; //@line 12147
    $27 = HEAP32[$26 >> 2] | 0; //@line 12148
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 12154
     HEAP8[$27 >> 0] = $20; //@line 12155
     $34 = $21; //@line 12156
    } else {
     label = 12; //@line 12158
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12163
     $32 = ___overflow($1, $0) | 0; //@line 12164
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 174; //@line 12167
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 12169
      sp = STACKTOP; //@line 12170
      return 0; //@line 12171
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 12173
      $34 = $32; //@line 12174
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 12179
   $$0 = $34; //@line 12180
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 12185
   $8 = $0 & 255; //@line 12186
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 12192
    $14 = HEAP32[$13 >> 2] | 0; //@line 12193
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 12199
     HEAP8[$14 >> 0] = $7; //@line 12200
     $$0 = $8; //@line 12201
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12205
   $19 = ___overflow($1, $0) | 0; //@line 12206
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 173; //@line 12209
    sp = STACKTOP; //@line 12210
    return 0; //@line 12211
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 12213
    $$0 = $19; //@line 12214
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 12219
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 8031
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 8034
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 8037
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 8040
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 8046
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 8055
     $24 = $13 >>> 2; //@line 8056
     $$090 = 0; //@line 8057
     $$094 = $7; //@line 8057
     while (1) {
      $25 = $$094 >>> 1; //@line 8059
      $26 = $$090 + $25 | 0; //@line 8060
      $27 = $26 << 1; //@line 8061
      $28 = $27 + $23 | 0; //@line 8062
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 8065
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 8069
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 8075
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 8083
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 8087
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 8093
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 8098
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 8101
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 8101
      }
     }
     $46 = $27 + $24 | 0; //@line 8104
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 8107
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 8111
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 8123
     } else {
      $$4 = 0; //@line 8125
     }
    } else {
     $$4 = 0; //@line 8128
    }
   } else {
    $$4 = 0; //@line 8131
   }
  } else {
   $$4 = 0; //@line 8134
  }
 } while (0);
 return $$4 | 0; //@line 8137
}
function __ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb($0) {
 $0 = $0 | 0;
 var $11 = 0, $12 = 0, $22 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5267
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5273
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5275
 $9 = Math_imul(HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 5276
 if (($9 | 0) <= 0) {
  return;
 }
 $11 = $6 + 28 | 0; //@line 5281
 $12 = $6 + 30 | 0; //@line 5282
 $22 = HEAPU16[((128 >>> 0 & HEAP8[$8 + 0 >> 0] | 0) == 0 ? $12 : $11) >> 1] | 0; //@line 5293
 $25 = HEAP32[(HEAP32[$6 >> 2] | 0) + 136 >> 2] | 0; //@line 5296
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(32) | 0; //@line 5297
 FUNCTION_TABLE_vii[$25 & 7]($6, $22); //@line 5298
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 62; //@line 5301
  $26 = $ReallocAsyncCtx2 + 4 | 0; //@line 5302
  HEAP32[$26 >> 2] = 0; //@line 5303
  $27 = $ReallocAsyncCtx2 + 8 | 0; //@line 5304
  HEAP32[$27 >> 2] = $9; //@line 5305
  $28 = $ReallocAsyncCtx2 + 12 | 0; //@line 5306
  HEAP32[$28 >> 2] = $8; //@line 5307
  $29 = $ReallocAsyncCtx2 + 16 | 0; //@line 5308
  HEAP32[$29 >> 2] = $12; //@line 5309
  $30 = $ReallocAsyncCtx2 + 20 | 0; //@line 5310
  HEAP32[$30 >> 2] = $11; //@line 5311
  $31 = $ReallocAsyncCtx2 + 24 | 0; //@line 5312
  HEAP32[$31 >> 2] = $6; //@line 5313
  $32 = $ReallocAsyncCtx2 + 28 | 0; //@line 5314
  HEAP32[$32 >> 2] = $6; //@line 5315
  sp = STACKTOP; //@line 5316
  return;
 }
 ___async_unwind = 0; //@line 5319
 HEAP32[$ReallocAsyncCtx2 >> 2] = 62; //@line 5320
 $26 = $ReallocAsyncCtx2 + 4 | 0; //@line 5321
 HEAP32[$26 >> 2] = 0; //@line 5322
 $27 = $ReallocAsyncCtx2 + 8 | 0; //@line 5323
 HEAP32[$27 >> 2] = $9; //@line 5324
 $28 = $ReallocAsyncCtx2 + 12 | 0; //@line 5325
 HEAP32[$28 >> 2] = $8; //@line 5326
 $29 = $ReallocAsyncCtx2 + 16 | 0; //@line 5327
 HEAP32[$29 >> 2] = $12; //@line 5328
 $30 = $ReallocAsyncCtx2 + 20 | 0; //@line 5329
 HEAP32[$30 >> 2] = $11; //@line 5330
 $31 = $ReallocAsyncCtx2 + 24 | 0; //@line 5331
 HEAP32[$31 >> 2] = $6; //@line 5332
 $32 = $ReallocAsyncCtx2 + 28 | 0; //@line 5333
 HEAP32[$32 >> 2] = $6; //@line 5334
 sp = STACKTOP; //@line 5335
 return;
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 8734
 $1 = $0 + 20 | 0; //@line 8735
 $3 = $0 + 28 | 0; //@line 8737
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 8743
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 8744
   FUNCTION_TABLE_iiii[$7 & 15]($0, 0, 0) | 0; //@line 8745
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 163; //@line 8748
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 8750
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 8752
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 8754
    sp = STACKTOP; //@line 8755
    return 0; //@line 8756
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 8758
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 8762
     break;
    } else {
     label = 5; //@line 8765
     break;
    }
   }
  } else {
   label = 5; //@line 8770
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 8774
  $14 = HEAP32[$13 >> 2] | 0; //@line 8775
  $15 = $0 + 8 | 0; //@line 8776
  $16 = HEAP32[$15 >> 2] | 0; //@line 8777
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 8785
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 8786
    FUNCTION_TABLE_iiii[$22 & 15]($0, $14 - $16 | 0, 1) | 0; //@line 8787
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 164; //@line 8790
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 8792
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 8794
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 8796
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 8798
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 8800
     sp = STACKTOP; //@line 8801
     return 0; //@line 8802
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8804
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 8810
  HEAP32[$3 >> 2] = 0; //@line 8811
  HEAP32[$1 >> 2] = 0; //@line 8812
  HEAP32[$15 >> 2] = 0; //@line 8813
  HEAP32[$13 >> 2] = 0; //@line 8814
  $$0 = 0; //@line 8815
 }
 return $$0 | 0; //@line 8817
}
function __ZN4mbed8FileBaseD0Ev($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $1 = 0, $12 = 0, $17 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2107
 HEAP32[$0 >> 2] = 824; //@line 2108
 $1 = HEAP32[2211] | 0; //@line 2109
 do {
  if (!$1) {
   HEAP32[2211] = 8848; //@line 2113
  } else {
   if (($1 | 0) != 8848) {
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2117
    _mbed_assert_internal(5235, 5255, 93); //@line 2118
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 84; //@line 2121
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2123
     sp = STACKTOP; //@line 2124
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2127
     break;
    }
   }
  }
 } while (0);
 do {
  if (HEAP32[$0 + 8 >> 2] | 0) {
   $8 = HEAP32[2210] | 0; //@line 2138
   if (($8 | 0) == ($0 | 0)) {
    HEAP32[2210] = HEAP32[$0 + 4 >> 2]; //@line 2143
    break;
   } else {
    $$0$i = $8; //@line 2146
   }
   do {
    $12 = $$0$i + 4 | 0; //@line 2149
    $$0$i = HEAP32[$12 >> 2] | 0; //@line 2150
   } while (($$0$i | 0) != ($0 | 0));
   HEAP32[$12 >> 2] = HEAP32[$0 + 4 >> 2]; //@line 2160
  }
 } while (0);
 $17 = HEAP32[2211] | 0; //@line 2163
 do {
  if (!$17) {
   HEAP32[2211] = 8848; //@line 2167
  } else {
   if (($17 | 0) != 8848) {
    $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2171
    _mbed_assert_internal(5235, 5255, 93); //@line 2172
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 85; //@line 2175
     HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2177
     sp = STACKTOP; //@line 2178
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx | 0); //@line 2181
     break;
    }
   }
  }
 } while (0);
 if (HEAP32[$0 + 12 >> 2] | 0) {
  __ZdlPv($0); //@line 2191
  return;
 }
 $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2195
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($0 + -4 | 0); //@line 2196
 if (___async) {
  HEAP32[$AsyncCtx7 >> 2] = 86; //@line 2199
  HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 2201
  sp = STACKTOP; //@line 2202
  return;
 }
 _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2205
 __ZdlPv($0); //@line 2206
 return;
}
function _main__async_cb_35($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 2647
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2649
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2651
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2653
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2655
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2657
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2659
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2661
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2663
 __ZN6C1283211set_auto_upEj(8860, 0); //@line 2664
 __ZN6C128326locateEii(8860, 5, -20); //@line 2666
 __ZN4mbed6Stream6printfEPKcz(8860, 5809, $2) | 0; //@line 2667
 $18 = -20 + 12 | 0; //@line 2668
 __ZN6C128326locateEii(8860, 5, $18); //@line 2669
 __ZN4mbed6Stream6printfEPKcz(8860, 5815, $6) | 0; //@line 2670
 __ZN6C1283211copy_to_lcdEv(8860); //@line 2671
 if (-20 < 5) {
  __ZN6C128326locateEii(8860, 5, -20); //@line 2673
  $ReallocAsyncCtx12 = _emscripten_realloc_async_context(44) | 0; //@line 2674
  _wait(.20000000298023224); //@line 2675
  if (!___async) {
   ___async_unwind = 0; //@line 2678
  }
  HEAP32[$ReallocAsyncCtx12 >> 2] = 154; //@line 2680
  HEAP32[$ReallocAsyncCtx12 + 4 >> 2] = $10; //@line 2682
  HEAP32[$ReallocAsyncCtx12 + 8 >> 2] = $12; //@line 2684
  HEAP32[$ReallocAsyncCtx12 + 12 >> 2] = $18; //@line 2686
  HEAP32[$ReallocAsyncCtx12 + 16 >> 2] = $14; //@line 2688
  HEAP32[$ReallocAsyncCtx12 + 20 >> 2] = $16; //@line 2690
  HEAP32[$ReallocAsyncCtx12 + 24 >> 2] = -20; //@line 2692
  HEAP32[$ReallocAsyncCtx12 + 28 >> 2] = $2; //@line 2694
  HEAP32[$ReallocAsyncCtx12 + 32 >> 2] = $4; //@line 2696
  HEAP32[$ReallocAsyncCtx12 + 36 >> 2] = $6; //@line 2698
  HEAP32[$ReallocAsyncCtx12 + 40 >> 2] = $8; //@line 2700
  sp = STACKTOP; //@line 2701
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 2704
 _puts(5825) | 0; //@line 2705
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 155; //@line 2708
  sp = STACKTOP; //@line 2709
  return;
 }
 ___async_unwind = 0; //@line 2712
 HEAP32[$ReallocAsyncCtx >> 2] = 155; //@line 2713
 sp = STACKTOP; //@line 2714
 return;
}
function __ZN4mbed6Stream4putcEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $15 = 0, $16 = 0, $21 = 0, $4 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, $AsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 2795
 $4 = HEAP32[(HEAP32[$0 >> 2] | 0) + 80 >> 2] | 0; //@line 2798
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 2799
 FUNCTION_TABLE_vi[$4 & 255]($0); //@line 2800
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 106; //@line 2803
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2805
  HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 2807
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 2809
  sp = STACKTOP; //@line 2810
  return 0; //@line 2811
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2813
 $9 = HEAP32[$0 + 20 >> 2] | 0; //@line 2815
 $AsyncCtx9 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2816
 _fflush($9) | 0; //@line 2817
 if (___async) {
  HEAP32[$AsyncCtx9 >> 2] = 107; //@line 2820
  HEAP32[$AsyncCtx9 + 4 >> 2] = $0; //@line 2822
  HEAP32[$AsyncCtx9 + 8 >> 2] = $1; //@line 2824
  HEAP32[$AsyncCtx9 + 12 >> 2] = $0; //@line 2826
  sp = STACKTOP; //@line 2827
  return 0; //@line 2828
 }
 _emscripten_free_async_context($AsyncCtx9 | 0); //@line 2830
 $15 = HEAP32[(HEAP32[$0 >> 2] | 0) + 68 >> 2] | 0; //@line 2833
 $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 2834
 $16 = FUNCTION_TABLE_iii[$15 & 7]($0, $1) | 0; //@line 2835
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 108; //@line 2838
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 2840
  HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 2842
  sp = STACKTOP; //@line 2843
  return 0; //@line 2844
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2846
 $21 = HEAP32[(HEAP32[$0 >> 2] | 0) + 84 >> 2] | 0; //@line 2849
 $AsyncCtx5 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2850
 FUNCTION_TABLE_vi[$21 & 255]($0); //@line 2851
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 109; //@line 2854
  HEAP32[$AsyncCtx5 + 4 >> 2] = $16; //@line 2856
  sp = STACKTOP; //@line 2857
  return 0; //@line 2858
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 2860
  return $16 | 0; //@line 2861
 }
 return 0; //@line 2863
}
function __ZN15GraphicsDisplay7blitbitEiiiiPKc($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$019 = 0, $13 = 0, $15 = 0, $16 = 0, $26 = 0, $29 = 0, $37 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1398
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 1401
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 1402
 FUNCTION_TABLE_viiiii[$8 & 7]($0, $1, $2, $3, $4); //@line 1403
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 61; //@line 1406
  HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 1408
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 1410
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 1412
  HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 1414
  sp = STACKTOP; //@line 1415
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1418
 $13 = Math_imul($4, $3) | 0; //@line 1419
 if (($13 | 0) <= 0) {
  return;
 }
 $15 = $0 + 28 | 0; //@line 1424
 $16 = $0 + 30 | 0; //@line 1425
 $$019 = 0; //@line 1426
 while (1) {
  $26 = HEAPU16[((128 >>> ($$019 & 7) & HEAP8[$5 + ($$019 >> 3) >> 0] | 0) == 0 ? $16 : $15) >> 1] | 0; //@line 1438
  $29 = HEAP32[(HEAP32[$0 >> 2] | 0) + 136 >> 2] | 0; //@line 1441
  $AsyncCtx3 = _emscripten_alloc_async_context(32, sp) | 0; //@line 1442
  FUNCTION_TABLE_vii[$29 & 7]($0, $26); //@line 1443
  if (___async) {
   label = 7; //@line 1446
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1449
  $37 = $$019 + 1 | 0; //@line 1450
  if (($37 | 0) == ($13 | 0)) {
   label = 5; //@line 1453
   break;
  } else {
   $$019 = $37; //@line 1456
  }
 }
 if ((label | 0) == 5) {
  return;
 } else if ((label | 0) == 7) {
  HEAP32[$AsyncCtx3 >> 2] = 62; //@line 1463
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$019; //@line 1465
  HEAP32[$AsyncCtx3 + 8 >> 2] = $13; //@line 1467
  HEAP32[$AsyncCtx3 + 12 >> 2] = $5; //@line 1469
  HEAP32[$AsyncCtx3 + 16 >> 2] = $16; //@line 1471
  HEAP32[$AsyncCtx3 + 20 >> 2] = $15; //@line 1473
  HEAP32[$AsyncCtx3 + 24 >> 2] = $0; //@line 1475
  HEAP32[$AsyncCtx3 + 28 >> 2] = $0; //@line 1477
  sp = STACKTOP; //@line 1478
  return;
 }
}
function _fclose($0) {
 $0 = $0 | 0;
 var $$pre = 0, $10 = 0, $15 = 0, $21 = 0, $25 = 0, $27 = 0, $28 = 0, $33 = 0, $35 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 8500
 if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
  $25 = ___lockfile($0) | 0; //@line 8506
 } else {
  $25 = 0; //@line 8508
 }
 ___unlist_locked_file($0); //@line 8510
 $7 = (HEAP32[$0 >> 2] & 1 | 0) != 0; //@line 8513
 if (!$7) {
  $8 = ___ofl_lock() | 0; //@line 8515
  $10 = HEAP32[$0 + 52 >> 2] | 0; //@line 8517
  $$pre = $0 + 56 | 0; //@line 8520
  if ($10 | 0) {
   HEAP32[$10 + 56 >> 2] = HEAP32[$$pre >> 2]; //@line 8524
  }
  $15 = HEAP32[$$pre >> 2] | 0; //@line 8526
  if ($15 | 0) {
   HEAP32[$15 + 52 >> 2] = $10; //@line 8531
  }
  if ((HEAP32[$8 >> 2] | 0) == ($0 | 0)) {
   HEAP32[$8 >> 2] = $15; //@line 8536
  }
  ___ofl_unlock(); //@line 8538
 }
 $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 8540
 $21 = _fflush($0) | 0; //@line 8541
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 157; //@line 8544
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 8546
  HEAP8[$AsyncCtx3 + 8 >> 0] = $7 & 1; //@line 8549
  HEAP32[$AsyncCtx3 + 12 >> 2] = $25; //@line 8551
  sp = STACKTOP; //@line 8552
  return 0; //@line 8553
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 8555
 $27 = HEAP32[$0 + 12 >> 2] | 0; //@line 8557
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 8558
 $28 = FUNCTION_TABLE_ii[$27 & 31]($0) | 0; //@line 8559
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 158; //@line 8562
  HEAP32[$AsyncCtx + 4 >> 2] = $21; //@line 8564
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 8566
  HEAP8[$AsyncCtx + 12 >> 0] = $7 & 1; //@line 8569
  HEAP32[$AsyncCtx + 16 >> 2] = $25; //@line 8571
  sp = STACKTOP; //@line 8572
  return 0; //@line 8573
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 8575
 $33 = $28 | $21; //@line 8576
 $35 = HEAP32[$0 + 92 >> 2] | 0; //@line 8578
 if ($35 | 0) {
  _free($35); //@line 8581
 }
 if ($7) {
  if ($25 | 0) {
   ___unlockfile($0); //@line 8586
  }
 } else {
  _free($0); //@line 8589
 }
 return $33 | 0; //@line 8591
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
 sp = STACKTOP; //@line 746
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 747
 __ZN15GraphicsDisplayC2EPKc($0, $6); //@line 748
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 46; //@line 751
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 753
  HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 755
  HEAP32[$AsyncCtx3 + 12 >> 2] = $3; //@line 757
  HEAP32[$AsyncCtx3 + 16 >> 2] = $2; //@line 759
  sp = STACKTOP; //@line 760
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 763
 HEAP32[$0 >> 2] = 328; //@line 764
 HEAP32[$0 + 4 >> 2] = 488; //@line 766
 $12 = $0 + 4172 | 0; //@line 767
 HEAP32[$12 >> 2] = $1; //@line 768
 $13 = $0 + 4176 | 0; //@line 769
 HEAP32[$13 >> 2] = $3; //@line 770
 $14 = $0 + 4180 | 0; //@line 771
 HEAP32[$14 >> 2] = $2; //@line 772
 _emscripten_asm_const_iiii(1, $1 | 0, $3 | 0, $2 | 0) | 0; //@line 773
 HEAP32[$0 + 56 >> 2] = 1; //@line 775
 HEAP32[$0 + 52 >> 2] = 0; //@line 777
 HEAP32[$0 + 60 >> 2] = 0; //@line 779
 $19 = $0 + 68 | 0; //@line 780
 _memset($19 | 0, 0, 4096) | 0; //@line 781
 $22 = HEAP32[(HEAP32[$0 >> 2] | 0) + 108 >> 2] | 0; //@line 784
 $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 785
 FUNCTION_TABLE_viii[$22 & 3]($0, 0, 0); //@line 786
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 47; //@line 789
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 791
  HEAP32[$AsyncCtx + 8 >> 2] = $12; //@line 793
  HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 795
  HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 797
  HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 799
  sp = STACKTOP; //@line 800
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 803
  HEAP32[$0 + 48 >> 2] = 2006; //@line 805
  _emscripten_asm_const_iiiii(0, HEAP32[$12 >> 2] | 0, HEAP32[$13 >> 2] | 0, HEAP32[$14 >> 2] | 0, $19 | 0) | 0; //@line 809
  return;
 }
}
function __ZN4mbed8FileBaseD2Ev($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $12 = 0, $17 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 2005
 HEAP32[$0 >> 2] = 824; //@line 2006
 $1 = HEAP32[2211] | 0; //@line 2007
 do {
  if (!$1) {
   HEAP32[2211] = 8848; //@line 2011
  } else {
   if (($1 | 0) != 8848) {
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2015
    _mbed_assert_internal(5235, 5255, 93); //@line 2016
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 81; //@line 2019
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2021
     sp = STACKTOP; //@line 2022
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2025
     break;
    }
   }
  }
 } while (0);
 do {
  if (HEAP32[$0 + 8 >> 2] | 0) {
   $8 = HEAP32[2210] | 0; //@line 2036
   if (($8 | 0) == ($0 | 0)) {
    HEAP32[2210] = HEAP32[$0 + 4 >> 2]; //@line 2041
    break;
   } else {
    $$0 = $8; //@line 2044
   }
   do {
    $12 = $$0 + 4 | 0; //@line 2047
    $$0 = HEAP32[$12 >> 2] | 0; //@line 2048
   } while (($$0 | 0) != ($0 | 0));
   HEAP32[$12 >> 2] = HEAP32[$0 + 4 >> 2]; //@line 2058
  }
 } while (0);
 $17 = HEAP32[2211] | 0; //@line 2061
 do {
  if (!$17) {
   HEAP32[2211] = 8848; //@line 2065
  } else {
   if (($17 | 0) != 8848) {
    $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2069
    _mbed_assert_internal(5235, 5255, 93); //@line 2070
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 82; //@line 2073
     HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2075
     sp = STACKTOP; //@line 2076
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx | 0); //@line 2079
     break;
    }
   }
  }
 } while (0);
 if (HEAP32[$0 + 12 >> 2] | 0) {
  return;
 }
 $AsyncCtx7 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2092
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($0 + -4 | 0); //@line 2093
 if (___async) {
  HEAP32[$AsyncCtx7 >> 2] = 83; //@line 2096
  sp = STACKTOP; //@line 2097
  return;
 }
 _emscripten_free_async_context($AsyncCtx7 | 0); //@line 2100
 return;
}
function __ZN6C128325_putcEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $11 = 0, $14 = 0, $15 = 0, $28 = 0, $30 = 0, $32 = 0, $4 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 153
 if (($1 | 0) == 10) {
  HEAP32[$0 + 60 >> 2] = 0; //@line 157
  $4 = $0 + 64 | 0; //@line 158
  $6 = $0 + 48 | 0; //@line 160
  $11 = (HEAP32[$4 >> 2] | 0) + (HEAPU8[(HEAP32[$6 >> 2] | 0) + 2 >> 0] | 0) | 0; //@line 165
  HEAP32[$4 >> 2] = $11; //@line 166
  $14 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 169
  $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 170
  $15 = FUNCTION_TABLE_ii[$14 & 31]($0) | 0; //@line 171
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 36; //@line 174
   HEAP32[$AsyncCtx + 4 >> 2] = $6; //@line 176
   HEAP32[$AsyncCtx + 8 >> 2] = $11; //@line 178
   HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 180
   HEAP32[$AsyncCtx + 16 >> 2] = $4; //@line 182
   sp = STACKTOP; //@line 183
   return 0; //@line 184
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 186
  if ($11 >>> 0 < ($15 - (HEAPU8[(HEAP32[$6 >> 2] | 0) + 2 >> 0] | 0) | 0) >>> 0) {
   return $1 | 0; //@line 194
  }
  HEAP32[$4 >> 2] = 0; //@line 196
  return $1 | 0; //@line 197
 } else {
  $28 = HEAP32[(HEAP32[$0 >> 2] | 0) + 88 >> 2] | 0; //@line 201
  $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 203
  $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 205
  $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 206
  FUNCTION_TABLE_viiii[$28 & 7]($0, $30, $32, $1); //@line 207
  if (___async) {
   HEAP32[$AsyncCtx3 >> 2] = 37; //@line 210
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 212
   HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 214
   sp = STACKTOP; //@line 215
   return 0; //@line 216
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 218
  if (!(HEAP32[$0 + 4168 >> 2] | 0)) {
   return $1 | 0; //@line 223
  }
  _emscripten_asm_const_iiiii(0, HEAP32[$0 + 4172 >> 2] | 0, HEAP32[$0 + 4176 >> 2] | 0, HEAP32[$0 + 4180 >> 2] | 0, $0 + 68 | 0) | 0; //@line 232
  return $1 | 0; //@line 233
 }
 return 0; //@line 235
}
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 8400
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 8406
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 8412
   } else {
    $7 = $1 & 255; //@line 8414
    $$03039 = $0; //@line 8415
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 8417
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 8422
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 8425
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 8430
      break;
     } else {
      $$03039 = $13; //@line 8433
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 8437
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 8438
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 8446
     $25 = $18; //@line 8446
     while (1) {
      $24 = $25 ^ $17; //@line 8448
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 8455
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 8458
      $25 = HEAP32[$31 >> 2] | 0; //@line 8459
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 8468
       break;
      } else {
       $$02936 = $31; //@line 8466
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 8473
    }
   } while (0);
   $38 = $1 & 255; //@line 8476
   $$1 = $$029$lcssa; //@line 8477
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 8479
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 8485
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 8488
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 8493
}
function __ZN4mbed8FileBaseD0Ev__async_cb_68($0) {
 $0 = $0 | 0;
 var $$0$i = 0, $10 = 0, $15 = 0, $18 = 0, $2 = 0, $23 = 0, $6 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4519
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4521
 do {
  if (HEAP32[$2 + 8 >> 2] | 0) {
   $6 = HEAP32[2210] | 0; //@line 4527
   if (($6 | 0) == ($2 | 0)) {
    HEAP32[2210] = HEAP32[$2 + 4 >> 2]; //@line 4532
    break;
   } else {
    $$0$i = $6; //@line 4535
   }
   do {
    $10 = $$0$i + 4 | 0; //@line 4538
    $$0$i = HEAP32[$10 >> 2] | 0; //@line 4539
   } while (($$0$i | 0) != ($2 | 0));
   HEAP32[$10 >> 2] = HEAP32[$2 + 4 >> 2]; //@line 4549
  }
 } while (0);
 $15 = HEAP32[2211] | 0; //@line 4552
 if (!$15) {
  HEAP32[2211] = 8848; //@line 4555
 } else {
  if (($15 | 0) != 8848) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 4559
   _mbed_assert_internal(5235, 5255, 93); //@line 4560
   if (___async) {
    HEAP32[$ReallocAsyncCtx >> 2] = 85; //@line 4563
    $18 = $ReallocAsyncCtx + 4 | 0; //@line 4564
    HEAP32[$18 >> 2] = $2; //@line 4565
    sp = STACKTOP; //@line 4566
    return;
   }
   ___async_unwind = 0; //@line 4569
   HEAP32[$ReallocAsyncCtx >> 2] = 85; //@line 4570
   $18 = $ReallocAsyncCtx + 4 | 0; //@line 4571
   HEAP32[$18 >> 2] = $2; //@line 4572
   sp = STACKTOP; //@line 4573
   return;
  }
 }
 if (HEAP32[$2 + 12 >> 2] | 0) {
  __ZdlPv($2); //@line 4581
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 4585
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 4586
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 4589
  $23 = $ReallocAsyncCtx3 + 4 | 0; //@line 4590
  HEAP32[$23 >> 2] = $2; //@line 4591
  sp = STACKTOP; //@line 4592
  return;
 }
 ___async_unwind = 0; //@line 4595
 HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 4596
 $23 = $ReallocAsyncCtx3 + 4 | 0; //@line 4597
 HEAP32[$23 >> 2] = $2; //@line 4598
 sp = STACKTOP; //@line 4599
 return;
}
function _main__async_cb_45($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx7 = 0, $bitmSan2$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 3293
 STACKTOP = STACKTOP + 16 | 0; //@line 3294
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3294
 $bitmSan2$byval_copy = sp; //@line 3295
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3297
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3299
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3301
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3303
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3305
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3307
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3309
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3311
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3313
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 3315
 __ZN6C1283211copy_to_lcdEv(8860); //@line 3316
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(40) | 0; //@line 3317
 HEAP32[$bitmSan2$byval_copy >> 2] = HEAP32[263]; //@line 3318
 HEAP32[$bitmSan2$byval_copy + 4 >> 2] = HEAP32[264]; //@line 3318
 HEAP32[$bitmSan2$byval_copy + 8 >> 2] = HEAP32[265]; //@line 3318
 HEAP32[$bitmSan2$byval_copy + 12 >> 2] = HEAP32[266]; //@line 3318
 __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan2$byval_copy, $20, 2); //@line 3319
 if (!___async) {
  ___async_unwind = 0; //@line 3322
 }
 HEAP32[$ReallocAsyncCtx7 >> 2] = 149; //@line 3324
 HEAP32[$ReallocAsyncCtx7 + 4 >> 2] = $2; //@line 3326
 HEAP32[$ReallocAsyncCtx7 + 8 >> 2] = $4; //@line 3328
 HEAP32[$ReallocAsyncCtx7 + 12 >> 2] = $6; //@line 3330
 HEAP32[$ReallocAsyncCtx7 + 16 >> 2] = $8; //@line 3332
 HEAP32[$ReallocAsyncCtx7 + 20 >> 2] = $10; //@line 3334
 HEAP32[$ReallocAsyncCtx7 + 24 >> 2] = $12; //@line 3336
 HEAP32[$ReallocAsyncCtx7 + 28 >> 2] = $14; //@line 3338
 HEAP32[$ReallocAsyncCtx7 + 32 >> 2] = $16; //@line 3340
 HEAP32[$ReallocAsyncCtx7 + 36 >> 2] = $18; //@line 3342
 sp = STACKTOP; //@line 3343
 STACKTOP = sp; //@line 3344
 return;
}
function _main__async_cb_44($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, $bitmSan3$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 3236
 STACKTOP = STACKTOP + 16 | 0; //@line 3237
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3237
 $bitmSan3$byval_copy = sp; //@line 3238
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3240
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3242
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3244
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3246
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3248
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3250
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3252
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3254
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3256
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 3258
 __ZN6C1283211copy_to_lcdEv(8860); //@line 3259
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(40) | 0; //@line 3260
 HEAP32[$bitmSan3$byval_copy >> 2] = HEAP32[267]; //@line 3261
 HEAP32[$bitmSan3$byval_copy + 4 >> 2] = HEAP32[268]; //@line 3261
 HEAP32[$bitmSan3$byval_copy + 8 >> 2] = HEAP32[269]; //@line 3261
 HEAP32[$bitmSan3$byval_copy + 12 >> 2] = HEAP32[270]; //@line 3261
 __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy, $20, 2); //@line 3262
 if (!___async) {
  ___async_unwind = 0; //@line 3265
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 152; //@line 3267
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 3269
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 3271
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 3273
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 3275
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $18; //@line 3277
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $10; //@line 3279
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $12; //@line 3281
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $14; //@line 3283
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $16; //@line 3285
 sp = STACKTOP; //@line 3286
 STACKTOP = sp; //@line 3287
 return;
}
function _main__async_cb_40($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx8 = 0, $bitmSan2$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 2992
 STACKTOP = STACKTOP + 16 | 0; //@line 2993
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2993
 $bitmSan2$byval_copy = sp; //@line 2994
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2996
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2998
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3000
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3002
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3004
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3006
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3008
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3010
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3012
 $19 = $2 + 3 | 0; //@line 3013
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(44) | 0; //@line 3014
 HEAP32[$bitmSan2$byval_copy >> 2] = HEAP32[263]; //@line 3015
 HEAP32[$bitmSan2$byval_copy + 4 >> 2] = HEAP32[264]; //@line 3015
 HEAP32[$bitmSan2$byval_copy + 8 >> 2] = HEAP32[265]; //@line 3015
 HEAP32[$bitmSan2$byval_copy + 12 >> 2] = HEAP32[266]; //@line 3015
 __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan2$byval_copy, $19, 2); //@line 3016
 if (!___async) {
  ___async_unwind = 0; //@line 3019
 }
 HEAP32[$ReallocAsyncCtx8 >> 2] = 147; //@line 3021
 HEAP32[$ReallocAsyncCtx8 + 4 >> 2] = $2; //@line 3023
 HEAP32[$ReallocAsyncCtx8 + 8 >> 2] = $4; //@line 3025
 HEAP32[$ReallocAsyncCtx8 + 12 >> 2] = $6; //@line 3027
 HEAP32[$ReallocAsyncCtx8 + 16 >> 2] = $8; //@line 3029
 HEAP32[$ReallocAsyncCtx8 + 20 >> 2] = $10; //@line 3031
 HEAP32[$ReallocAsyncCtx8 + 24 >> 2] = $12; //@line 3033
 HEAP32[$ReallocAsyncCtx8 + 28 >> 2] = $14; //@line 3035
 HEAP32[$ReallocAsyncCtx8 + 32 >> 2] = $16; //@line 3037
 HEAP32[$ReallocAsyncCtx8 + 36 >> 2] = $18; //@line 3039
 HEAP32[$ReallocAsyncCtx8 + 40 >> 2] = $19; //@line 3041
 sp = STACKTOP; //@line 3042
 STACKTOP = sp; //@line 3043
 return;
}
function _main__async_cb_38($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx6 = 0, $bitmSan3$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 2880
 STACKTOP = STACKTOP + 16 | 0; //@line 2881
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2881
 $bitmSan3$byval_copy = sp; //@line 2882
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2884
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2886
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2888
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2890
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2892
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2894
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2896
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2898
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2900
 $19 = $2 + 6 | 0; //@line 2901
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(44) | 0; //@line 2902
 HEAP32[$bitmSan3$byval_copy >> 2] = HEAP32[267]; //@line 2903
 HEAP32[$bitmSan3$byval_copy + 4 >> 2] = HEAP32[268]; //@line 2903
 HEAP32[$bitmSan3$byval_copy + 8 >> 2] = HEAP32[269]; //@line 2903
 HEAP32[$bitmSan3$byval_copy + 12 >> 2] = HEAP32[270]; //@line 2903
 __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan3$byval_copy, $19, 2); //@line 2904
 if (!___async) {
  ___async_unwind = 0; //@line 2907
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 150; //@line 2909
 HEAP32[$ReallocAsyncCtx6 + 4 >> 2] = $4; //@line 2911
 HEAP32[$ReallocAsyncCtx6 + 8 >> 2] = $6; //@line 2913
 HEAP32[$ReallocAsyncCtx6 + 12 >> 2] = $8; //@line 2915
 HEAP32[$ReallocAsyncCtx6 + 16 >> 2] = $10; //@line 2917
 HEAP32[$ReallocAsyncCtx6 + 20 >> 2] = $2; //@line 2919
 HEAP32[$ReallocAsyncCtx6 + 24 >> 2] = $12; //@line 2921
 HEAP32[$ReallocAsyncCtx6 + 28 >> 2] = $14; //@line 2923
 HEAP32[$ReallocAsyncCtx6 + 32 >> 2] = $16; //@line 2925
 HEAP32[$ReallocAsyncCtx6 + 36 >> 2] = $18; //@line 2927
 HEAP32[$ReallocAsyncCtx6 + 40 >> 2] = $19; //@line 2929
 sp = STACKTOP; //@line 2930
 STACKTOP = sp; //@line 2931
 return;
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 7922
 $4 = HEAP32[$3 >> 2] | 0; //@line 7923
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 7930
   label = 5; //@line 7931
  } else {
   $$1 = 0; //@line 7933
  }
 } else {
  $12 = $4; //@line 7937
  label = 5; //@line 7938
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 7942
   $10 = HEAP32[$9 >> 2] | 0; //@line 7943
   $14 = $10; //@line 7946
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 15]($2, $0, $1) | 0; //@line 7951
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 7959
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 7963
       $$141 = $0; //@line 7963
       $$143 = $1; //@line 7963
       $31 = $14; //@line 7963
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 7966
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 7973
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 15]($2, $0, $$038) | 0; //@line 7978
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 7981
      break L5;
     }
     $$139 = $$038; //@line 7987
     $$141 = $0 + $$038 | 0; //@line 7987
     $$143 = $1 - $$038 | 0; //@line 7987
     $31 = HEAP32[$9 >> 2] | 0; //@line 7987
    } else {
     $$139 = 0; //@line 7989
     $$141 = $0; //@line 7989
     $$143 = $1; //@line 7989
     $31 = $14; //@line 7989
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 7992
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 7995
   $$1 = $$139 + $$143 | 0; //@line 7997
  }
 } while (0);
 return $$1 | 0; //@line 8000
}
function _main__async_cb_42($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx10 = 0, $bitmSan1$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 3100
 STACKTOP = STACKTOP + 16 | 0; //@line 3101
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3101
 $bitmSan1$byval_copy = sp; //@line 3102
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3104
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3106
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3108
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3110
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3112
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3114
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3116
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3118
 __ZN6C1283211copy_to_lcdEv(8860); //@line 3119
 __ZN6C128327setmodeEi(8860, 1); //@line 3120
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(40) | 0; //@line 3121
 HEAP32[$bitmSan1$byval_copy >> 2] = HEAP32[259]; //@line 3122
 HEAP32[$bitmSan1$byval_copy + 4 >> 2] = HEAP32[260]; //@line 3122
 HEAP32[$bitmSan1$byval_copy + 8 >> 2] = HEAP32[261]; //@line 3122
 HEAP32[$bitmSan1$byval_copy + 12 >> 2] = HEAP32[262]; //@line 3122
 __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan1$byval_copy, -15, 2); //@line 3123
 if (!___async) {
  ___async_unwind = 0; //@line 3126
 }
 HEAP32[$ReallocAsyncCtx10 >> 2] = 144; //@line 3128
 HEAP32[$ReallocAsyncCtx10 + 4 >> 2] = -15; //@line 3130
 HEAP32[$ReallocAsyncCtx10 + 8 >> 2] = $2; //@line 3132
 HEAP32[$ReallocAsyncCtx10 + 12 >> 2] = $4; //@line 3134
 HEAP32[$ReallocAsyncCtx10 + 16 >> 2] = $6; //@line 3136
 HEAP32[$ReallocAsyncCtx10 + 20 >> 2] = $8; //@line 3138
 HEAP32[$ReallocAsyncCtx10 + 24 >> 2] = $10; //@line 3140
 HEAP32[$ReallocAsyncCtx10 + 28 >> 2] = $12; //@line 3142
 HEAP32[$ReallocAsyncCtx10 + 32 >> 2] = $14; //@line 3144
 HEAP32[$ReallocAsyncCtx10 + 36 >> 2] = $16; //@line 3146
 sp = STACKTOP; //@line 3147
 STACKTOP = sp; //@line 3148
 return;
}
function _main__async_cb_46($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx9 = 0, $bitmSan1$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 3350
 STACKTOP = STACKTOP + 16 | 0; //@line 3351
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3351
 $bitmSan1$byval_copy = sp; //@line 3352
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3354
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3356
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3358
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3360
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3362
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3364
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3366
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3368
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3370
 __ZN6C1283211copy_to_lcdEv(8860); //@line 3371
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(40) | 0; //@line 3372
 HEAP32[$bitmSan1$byval_copy >> 2] = HEAP32[259]; //@line 3373
 HEAP32[$bitmSan1$byval_copy + 4 >> 2] = HEAP32[260]; //@line 3373
 HEAP32[$bitmSan1$byval_copy + 8 >> 2] = HEAP32[261]; //@line 3373
 HEAP32[$bitmSan1$byval_copy + 12 >> 2] = HEAP32[262]; //@line 3373
 __ZN6C128328print_bmE6Bitmapii(8860, $bitmSan1$byval_copy, $2, 2); //@line 3374
 if (!___async) {
  ___async_unwind = 0; //@line 3377
 }
 HEAP32[$ReallocAsyncCtx9 >> 2] = 146; //@line 3379
 HEAP32[$ReallocAsyncCtx9 + 4 >> 2] = $2; //@line 3381
 HEAP32[$ReallocAsyncCtx9 + 8 >> 2] = $4; //@line 3383
 HEAP32[$ReallocAsyncCtx9 + 12 >> 2] = $6; //@line 3385
 HEAP32[$ReallocAsyncCtx9 + 16 >> 2] = $8; //@line 3387
 HEAP32[$ReallocAsyncCtx9 + 20 >> 2] = $10; //@line 3389
 HEAP32[$ReallocAsyncCtx9 + 24 >> 2] = $12; //@line 3391
 HEAP32[$ReallocAsyncCtx9 + 28 >> 2] = $14; //@line 3393
 HEAP32[$ReallocAsyncCtx9 + 32 >> 2] = $16; //@line 3395
 HEAP32[$ReallocAsyncCtx9 + 36 >> 2] = $18; //@line 3397
 sp = STACKTOP; //@line 3398
 STACKTOP = sp; //@line 3399
 return;
}
function __ZN4mbed6StreamC2EPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $8 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 2735
 STACKTOP = STACKTOP + 16 | 0; //@line 2736
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2736
 $vararg_buffer = sp; //@line 2737
 HEAP32[$0 >> 2] = 840; //@line 2738
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 2740
 __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE($0 + 4 | 0, $1, 0); //@line 2741
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 104; //@line 2744
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2746
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 2748
  HEAP32[$AsyncCtx3 + 12 >> 2] = $vararg_buffer; //@line 2750
  HEAP32[$AsyncCtx3 + 16 >> 2] = $vararg_buffer; //@line 2752
  sp = STACKTOP; //@line 2753
  STACKTOP = sp; //@line 2754
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2756
 HEAP32[$0 >> 2] = 916; //@line 2757
 HEAP32[$0 + 4 >> 2] = 1012; //@line 2759
 $8 = $0 + 20 | 0; //@line 2760
 HEAP32[$8 >> 2] = 0; //@line 2761
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 2762
 $9 = __ZN4mbed6fdopenEPNS_10FileHandleEPKc($0, 4989) | 0; //@line 2763
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 105; //@line 2766
  HEAP32[$AsyncCtx + 4 >> 2] = $8; //@line 2768
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 2770
  HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer; //@line 2772
  sp = STACKTOP; //@line 2773
  STACKTOP = sp; //@line 2774
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2776
 HEAP32[$8 >> 2] = $9; //@line 2777
 if (!$9) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[(___errno_location() | 0) >> 2]; //@line 2782
  _error(4992, $vararg_buffer); //@line 2783
  STACKTOP = sp; //@line 2784
  return;
 } else {
  __ZN4mbed26mbed_set_unbuffered_streamEP8_IO_FILE($9); //@line 2786
  STACKTOP = sp; //@line 2787
  return;
 }
}
function __ZN15GraphicsDisplay4blitEiiiiPKi($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$011 = 0, $13 = 0, $17 = 0, $19 = 0, $25 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1319
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 1322
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 1323
 FUNCTION_TABLE_viiiii[$8 & 7]($0, $1, $2, $3, $4); //@line 1324
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 59; //@line 1327
  HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 1329
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 1331
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 1333
  HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 1335
  sp = STACKTOP; //@line 1336
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1339
 $13 = Math_imul($4, $3) | 0; //@line 1340
 if (($13 | 0) <= 0) {
  return;
 }
 $$011 = 0; //@line 1345
 while (1) {
  $17 = HEAP32[(HEAP32[$0 >> 2] | 0) + 136 >> 2] | 0; //@line 1349
  $19 = HEAP32[$5 + ($$011 << 2) >> 2] | 0; //@line 1351
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1352
  FUNCTION_TABLE_vii[$17 & 7]($0, $19); //@line 1353
  if (___async) {
   label = 7; //@line 1356
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1359
  $25 = $$011 + 1 | 0; //@line 1360
  if (($25 | 0) == ($13 | 0)) {
   label = 5; //@line 1363
   break;
  } else {
   $$011 = $25; //@line 1366
  }
 }
 if ((label | 0) == 5) {
  return;
 } else if ((label | 0) == 7) {
  HEAP32[$AsyncCtx3 >> 2] = 60; //@line 1373
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$011; //@line 1375
  HEAP32[$AsyncCtx3 + 8 >> 2] = $13; //@line 1377
  HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 1379
  HEAP32[$AsyncCtx3 + 16 >> 2] = $5; //@line 1381
  HEAP32[$AsyncCtx3 + 20 >> 2] = $0; //@line 1383
  sp = STACKTOP; //@line 1384
  return;
 }
}
function __ZN11TextDisplayC2EPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $12 = 0, $13 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 1943
 STACKTOP = STACKTOP + 16 | 0; //@line 1944
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1944
 $vararg_buffer = sp; //@line 1945
 $AsyncCtx3 = _emscripten_alloc_async_context(20, sp) | 0; //@line 1946
 __ZN4mbed6StreamC2EPKc($0, $1); //@line 1947
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 79; //@line 1950
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1952
  HEAP32[$AsyncCtx3 + 8 >> 2] = $1; //@line 1954
  HEAP32[$AsyncCtx3 + 12 >> 2] = $vararg_buffer; //@line 1956
  HEAP32[$AsyncCtx3 + 16 >> 2] = $vararg_buffer; //@line 1958
  sp = STACKTOP; //@line 1959
  STACKTOP = sp; //@line 1960
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1962
 HEAP32[$0 >> 2] = 680; //@line 1963
 HEAP32[$0 + 4 >> 2] = 808; //@line 1965
 HEAP16[$0 + 26 >> 1] = 0; //@line 1967
 HEAP16[$0 + 24 >> 1] = 0; //@line 1969
 if (!$1) {
  HEAP32[$0 + 32 >> 2] = 0; //@line 1973
  STACKTOP = sp; //@line 1974
  return;
 }
 $12 = (_strlen($1) | 0) + 2 | 0; //@line 1977
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 1978
 $13 = __Znaj($12) | 0; //@line 1979
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 80; //@line 1982
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1984
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 1986
  HEAP32[$AsyncCtx + 12 >> 2] = $1; //@line 1988
  HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer; //@line 1990
  sp = STACKTOP; //@line 1991
  STACKTOP = sp; //@line 1992
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1994
 HEAP32[$0 + 32 >> 2] = $13; //@line 1996
 HEAP32[$vararg_buffer >> 2] = $1; //@line 1997
 _sprintf($13, 4771, $vararg_buffer) | 0; //@line 1998
 STACKTOP = sp; //@line 1999
 return;
}
function __ZN15GraphicsDisplay4blitEiiiiPKi__async_cb_95($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6620
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6624
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6626
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6628
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6630
 $15 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 6631
 if (($15 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 136 >> 2] | 0; //@line 6638
 $16 = HEAP32[$8 + ($15 << 2) >> 2] | 0; //@line 6640
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 6641
 FUNCTION_TABLE_vii[$13 & 7]($10, $16); //@line 6642
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 60; //@line 6645
  $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 6646
  HEAP32[$17 >> 2] = $15; //@line 6647
  $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 6648
  HEAP32[$18 >> 2] = $4; //@line 6649
  $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 6650
  HEAP32[$19 >> 2] = $6; //@line 6651
  $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 6652
  HEAP32[$20 >> 2] = $8; //@line 6653
  $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 6654
  HEAP32[$21 >> 2] = $10; //@line 6655
  sp = STACKTOP; //@line 6656
  return;
 }
 ___async_unwind = 0; //@line 6659
 HEAP32[$ReallocAsyncCtx2 >> 2] = 60; //@line 6660
 $17 = $ReallocAsyncCtx2 + 4 | 0; //@line 6661
 HEAP32[$17 >> 2] = $15; //@line 6662
 $18 = $ReallocAsyncCtx2 + 8 | 0; //@line 6663
 HEAP32[$18 >> 2] = $4; //@line 6664
 $19 = $ReallocAsyncCtx2 + 12 | 0; //@line 6665
 HEAP32[$19 >> 2] = $6; //@line 6666
 $20 = $ReallocAsyncCtx2 + 16 | 0; //@line 6667
 HEAP32[$20 >> 2] = $8; //@line 6668
 $21 = $ReallocAsyncCtx2 + 20 | 0; //@line 6669
 HEAP32[$21 >> 2] = $10; //@line 6670
 sp = STACKTOP; //@line 6671
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
 sp = STACKTOP; //@line 1243
 $8 = HEAP32[(HEAP32[$0 >> 2] | 0) + 132 >> 2] | 0; //@line 1246
 $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 1247
 FUNCTION_TABLE_viiiii[$8 & 7]($0, $1, $2, $3, $4); //@line 1248
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 57; //@line 1251
  HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 1253
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 1255
  HEAP32[$AsyncCtx + 12 >> 2] = $0; //@line 1257
  HEAP32[$AsyncCtx + 16 >> 2] = $5; //@line 1259
  sp = STACKTOP; //@line 1260
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1263
 $13 = Math_imul($4, $3) | 0; //@line 1264
 if (($13 | 0) <= 0) {
  return;
 }
 $$010 = 0; //@line 1269
 while (1) {
  $17 = HEAP32[(HEAP32[$0 >> 2] | 0) + 136 >> 2] | 0; //@line 1273
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1274
  FUNCTION_TABLE_vii[$17 & 7]($0, $5); //@line 1275
  if (___async) {
   label = 7; //@line 1278
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1281
  $23 = $$010 + 1 | 0; //@line 1282
  if (($23 | 0) == ($13 | 0)) {
   label = 5; //@line 1285
   break;
  } else {
   $$010 = $23; //@line 1288
  }
 }
 if ((label | 0) == 5) {
  return;
 } else if ((label | 0) == 7) {
  HEAP32[$AsyncCtx3 >> 2] = 58; //@line 1295
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$010; //@line 1297
  HEAP32[$AsyncCtx3 + 8 >> 2] = $13; //@line 1299
  HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 1301
  HEAP32[$AsyncCtx3 + 16 >> 2] = $0; //@line 1303
  HEAP32[$AsyncCtx3 + 20 >> 2] = $5; //@line 1305
  sp = STACKTOP; //@line 1306
  return;
 }
}
function _main__async_cb_33($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx11 = 0, $bitmTree$byval_copy = 0, sp = 0;
 sp = STACKTOP; //@line 2549
 STACKTOP = STACKTOP + 16 | 0; //@line 2550
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 2550
 $bitmTree$byval_copy = sp; //@line 2551
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2553
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2555
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2557
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2559
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2561
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2563
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2565
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2567
 __ZN6C128323clsEv(8860); //@line 2568
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(36) | 0; //@line 2569
 HEAP32[$bitmTree$byval_copy >> 2] = HEAP32[255]; //@line 2570
 HEAP32[$bitmTree$byval_copy + 4 >> 2] = HEAP32[256]; //@line 2570
 HEAP32[$bitmTree$byval_copy + 8 >> 2] = HEAP32[257]; //@line 2570
 HEAP32[$bitmTree$byval_copy + 12 >> 2] = HEAP32[258]; //@line 2570
 __ZN6C128328print_bmE6Bitmapii(8860, $bitmTree$byval_copy, 95, 0); //@line 2571
 if (!___async) {
  ___async_unwind = 0; //@line 2574
 }
 HEAP32[$ReallocAsyncCtx11 >> 2] = 143; //@line 2576
 HEAP32[$ReallocAsyncCtx11 + 4 >> 2] = $2; //@line 2578
 HEAP32[$ReallocAsyncCtx11 + 8 >> 2] = $4; //@line 2580
 HEAP32[$ReallocAsyncCtx11 + 12 >> 2] = $6; //@line 2582
 HEAP32[$ReallocAsyncCtx11 + 16 >> 2] = $8; //@line 2584
 HEAP32[$ReallocAsyncCtx11 + 20 >> 2] = $10; //@line 2586
 HEAP32[$ReallocAsyncCtx11 + 24 >> 2] = $12; //@line 2588
 HEAP32[$ReallocAsyncCtx11 + 28 >> 2] = $14; //@line 2590
 HEAP32[$ReallocAsyncCtx11 + 32 >> 2] = $16; //@line 2592
 sp = STACKTOP; //@line 2593
 STACKTOP = sp; //@line 2594
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_86($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $25 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5773
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5777
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5779
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5781
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5783
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5785
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 5787
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 5789
 $18 = HEAP8[$0 + 36 >> 0] & 1; //@line 5792
 $25 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 5793
 do {
  if ($25 >>> 0 < $4 >>> 0) {
   if (!(HEAP8[$6 >> 0] | 0)) {
    if ((HEAP32[$8 >> 2] | 0) == 1) {
     if ((HEAP32[$10 >> 2] | 0) == 1) {
      break;
     }
    }
    $ReallocAsyncCtx2 = _emscripten_realloc_async_context(40) | 0; //@line 5809
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($25, $12, $14, $16, $18); //@line 5810
    if (!___async) {
     ___async_unwind = 0; //@line 5813
    }
    HEAP32[$ReallocAsyncCtx2 >> 2] = 197; //@line 5815
    HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $25; //@line 5817
    HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 5819
    HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 5821
    HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 5823
    HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 5825
    HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 5827
    HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 5829
    HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 5831
    HEAP8[$ReallocAsyncCtx2 + 36 >> 0] = $18 & 1; //@line 5834
    sp = STACKTOP; //@line 5835
    return;
   }
  }
 } while (0);
 return;
}
function ___dup3($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$sink = 0, $5 = 0, $6 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 11839
 STACKTOP = STACKTOP + 48 | 0; //@line 11840
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 11840
 $vararg_buffer7 = sp + 24 | 0; //@line 11841
 $vararg_buffer3 = sp + 16 | 0; //@line 11842
 $vararg_buffer = sp; //@line 11843
 L1 : do {
  if (($0 | 0) == ($1 | 0)) {
   $$sink = -22; //@line 11847
  } else {
   $5 = ($2 & 524288 | 0) != 0; //@line 11850
   L3 : do {
    if ($5) {
     while (1) {
      HEAP32[$vararg_buffer >> 2] = $0; //@line 11854
      HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 11856
      HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 11858
      $6 = ___syscall330(330, $vararg_buffer | 0) | 0; //@line 11859
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
        $$sink = $6; //@line 11869
        break L1;
       }
      }
     }
    }
   } while (0);
   do {
    HEAP32[$vararg_buffer3 >> 2] = $0; //@line 11877
    HEAP32[$vararg_buffer3 + 4 >> 2] = $1; //@line 11879
    $7 = ___syscall63(63, $vararg_buffer3 | 0) | 0; //@line 11880
   } while (($7 | 0) == -16);
   if ($5) {
    HEAP32[$vararg_buffer7 >> 2] = $1; //@line 11887
    HEAP32[$vararg_buffer7 + 4 >> 2] = 2; //@line 11889
    HEAP32[$vararg_buffer7 + 8 >> 2] = 1; //@line 11891
    ___syscall221(221, $vararg_buffer7 | 0) | 0; //@line 11892
    $$sink = $7; //@line 11893
   } else {
    $$sink = $7; //@line 11895
   }
  }
 } while (0);
 $9 = ___syscall_ret($$sink) | 0; //@line 11899
 STACKTOP = sp; //@line 11900
 return $9 | 0; //@line 11900
}
function __ZN4mbed8FileBaseD2Ev__async_cb_74($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $15 = 0, $18 = 0, $2 = 0, $6 = 0, $ReallocAsyncCtx = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4865
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4867
 do {
  if (HEAP32[$2 + 8 >> 2] | 0) {
   $6 = HEAP32[2210] | 0; //@line 4873
   if (($6 | 0) == ($2 | 0)) {
    HEAP32[2210] = HEAP32[$2 + 4 >> 2]; //@line 4878
    break;
   } else {
    $$0 = $6; //@line 4881
   }
   do {
    $10 = $$0 + 4 | 0; //@line 4884
    $$0 = HEAP32[$10 >> 2] | 0; //@line 4885
   } while (($$0 | 0) != ($2 | 0));
   HEAP32[$10 >> 2] = HEAP32[$2 + 4 >> 2]; //@line 4895
  }
 } while (0);
 $15 = HEAP32[2211] | 0; //@line 4898
 if (!$15) {
  HEAP32[2211] = 8848; //@line 4901
 } else {
  if (($15 | 0) != 8848) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 4905
   _mbed_assert_internal(5235, 5255, 93); //@line 4906
   if (___async) {
    HEAP32[$ReallocAsyncCtx >> 2] = 82; //@line 4909
    $18 = $ReallocAsyncCtx + 4 | 0; //@line 4910
    HEAP32[$18 >> 2] = $2; //@line 4911
    sp = STACKTOP; //@line 4912
    return;
   }
   ___async_unwind = 0; //@line 4915
   HEAP32[$ReallocAsyncCtx >> 2] = 82; //@line 4916
   $18 = $ReallocAsyncCtx + 4 | 0; //@line 4917
   HEAP32[$18 >> 2] = $2; //@line 4918
   sp = STACKTOP; //@line 4919
   return;
  }
 }
 if (HEAP32[$2 + 12 >> 2] | 0) {
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 4930
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 4931
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 83; //@line 4934
  sp = STACKTOP; //@line 4935
  return;
 }
 ___async_unwind = 0; //@line 4938
 HEAP32[$ReallocAsyncCtx3 >> 2] = 83; //@line 4939
 sp = STACKTOP; //@line 4940
 return;
}
function __ZN4mbed10FileHandle4sizeEv($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $17 = 0, $3 = 0, $4 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 2347
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 2350
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 2351
 $4 = FUNCTION_TABLE_iiii[$3 & 15]($0, 0, 1) | 0; //@line 2352
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 91; //@line 2355
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2357
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 2359
  sp = STACKTOP; //@line 2360
  return 0; //@line 2361
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2363
 if (($4 | 0) < 0) {
  $$0 = $4; //@line 2366
  return $$0 | 0; //@line 2367
 }
 $10 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 2371
 $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2372
 $11 = FUNCTION_TABLE_iiii[$10 & 15]($0, 0, 2) | 0; //@line 2373
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 92; //@line 2376
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 2378
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 2380
  HEAP32[$AsyncCtx3 + 12 >> 2] = $4; //@line 2382
  sp = STACKTOP; //@line 2383
  return 0; //@line 2384
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2386
 $17 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 2389
 $AsyncCtx6 = _emscripten_alloc_async_context(8, sp) | 0; //@line 2390
 FUNCTION_TABLE_iiii[$17 & 15]($0, $4, 0) | 0; //@line 2391
 if (___async) {
  HEAP32[$AsyncCtx6 >> 2] = 93; //@line 2394
  HEAP32[$AsyncCtx6 + 4 >> 2] = $11; //@line 2396
  sp = STACKTOP; //@line 2397
  return 0; //@line 2398
 }
 _emscripten_free_async_context($AsyncCtx6 | 0); //@line 2400
 $$0 = $11; //@line 2401
 return $$0 | 0; //@line 2402
}
function __ZN11TextDisplay5_putcEi__async_cb_71($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $16 = 0, $17 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 4694
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4698
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4700
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4702
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 4704
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4706
 if ((HEAP32[___async_retval >> 2] | 0) > (HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP32[___async_retval >> 2] = $4; //@line 4712
  return;
 }
 HEAP16[$6 >> 1] = 0; //@line 4715
 $16 = (HEAP16[$8 >> 1] | 0) + 1 << 16 >> 16; //@line 4717
 HEAP16[$8 >> 1] = $16; //@line 4718
 $17 = $16 & 65535; //@line 4719
 $20 = HEAP32[(HEAP32[$10 >> 2] | 0) + 92 >> 2] | 0; //@line 4722
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 4723
 $21 = FUNCTION_TABLE_ii[$20 & 31]($12) | 0; //@line 4724
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 69; //@line 4727
  $22 = $ReallocAsyncCtx4 + 4 | 0; //@line 4728
  HEAP32[$22 >> 2] = $17; //@line 4729
  $23 = $ReallocAsyncCtx4 + 8 | 0; //@line 4730
  HEAP32[$23 >> 2] = $4; //@line 4731
  $24 = $ReallocAsyncCtx4 + 12 | 0; //@line 4732
  HEAP32[$24 >> 2] = $8; //@line 4733
  sp = STACKTOP; //@line 4734
  return;
 }
 HEAP32[___async_retval >> 2] = $21; //@line 4738
 ___async_unwind = 0; //@line 4739
 HEAP32[$ReallocAsyncCtx4 >> 2] = 69; //@line 4740
 $22 = $ReallocAsyncCtx4 + 4 | 0; //@line 4741
 HEAP32[$22 >> 2] = $17; //@line 4742
 $23 = $ReallocAsyncCtx4 + 8 | 0; //@line 4743
 HEAP32[$23 >> 2] = $4; //@line 4744
 $24 = $ReallocAsyncCtx4 + 12 | 0; //@line 4745
 HEAP32[$24 >> 2] = $8; //@line 4746
 sp = STACKTOP; //@line 4747
 return;
}
function __ZN11TextDisplayC2EPKc__async_cb_78($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5208
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5210
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5212
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5214
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5216
 HEAP32[$2 >> 2] = 680; //@line 5217
 HEAP32[$2 + 4 >> 2] = 808; //@line 5219
 HEAP16[$2 + 26 >> 1] = 0; //@line 5221
 HEAP16[$2 + 24 >> 1] = 0; //@line 5223
 if (!$4) {
  HEAP32[$2 + 32 >> 2] = 0; //@line 5227
  return;
 }
 $15 = (_strlen($4) | 0) + 2 | 0; //@line 5231
 $ReallocAsyncCtx = _emscripten_realloc_async_context(20) | 0; //@line 5232
 $16 = __Znaj($15) | 0; //@line 5233
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 80; //@line 5236
  $17 = $ReallocAsyncCtx + 4 | 0; //@line 5237
  HEAP32[$17 >> 2] = $2; //@line 5238
  $18 = $ReallocAsyncCtx + 8 | 0; //@line 5239
  HEAP32[$18 >> 2] = $6; //@line 5240
  $19 = $ReallocAsyncCtx + 12 | 0; //@line 5241
  HEAP32[$19 >> 2] = $4; //@line 5242
  $20 = $ReallocAsyncCtx + 16 | 0; //@line 5243
  HEAP32[$20 >> 2] = $8; //@line 5244
  sp = STACKTOP; //@line 5245
  return;
 }
 HEAP32[___async_retval >> 2] = $16; //@line 5249
 ___async_unwind = 0; //@line 5250
 HEAP32[$ReallocAsyncCtx >> 2] = 80; //@line 5251
 $17 = $ReallocAsyncCtx + 4 | 0; //@line 5252
 HEAP32[$17 >> 2] = $2; //@line 5253
 $18 = $ReallocAsyncCtx + 8 | 0; //@line 5254
 HEAP32[$18 >> 2] = $6; //@line 5255
 $19 = $ReallocAsyncCtx + 12 | 0; //@line 5256
 HEAP32[$19 >> 2] = $4; //@line 5257
 $20 = $ReallocAsyncCtx + 16 | 0; //@line 5258
 HEAP32[$20 >> 2] = $8; //@line 5259
 sp = STACKTOP; //@line 5260
 return;
}
function ___stdio_read($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$cast = 0, $11 = 0, $18 = 0, $24 = 0, $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7481
 STACKTOP = STACKTOP + 32 | 0; //@line 7482
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 7482
 $vararg_buffer = sp; //@line 7483
 $3 = sp + 16 | 0; //@line 7484
 HEAP32[$3 >> 2] = $1; //@line 7485
 $4 = $3 + 4 | 0; //@line 7486
 $5 = $0 + 48 | 0; //@line 7487
 $6 = HEAP32[$5 >> 2] | 0; //@line 7488
 HEAP32[$4 >> 2] = $2 - (($6 | 0) != 0 & 1); //@line 7492
 $11 = $0 + 44 | 0; //@line 7494
 HEAP32[$3 + 8 >> 2] = HEAP32[$11 >> 2]; //@line 7496
 HEAP32[$3 + 12 >> 2] = $6; //@line 7498
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 7502
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 7504
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 7506
 $18 = ___syscall_ret(___syscall145(145, $vararg_buffer | 0) | 0) | 0; //@line 7508
 if (($18 | 0) < 1) {
  HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | $18 & 48 ^ 16; //@line 7515
  $$0 = $18; //@line 7516
 } else {
  $24 = HEAP32[$4 >> 2] | 0; //@line 7518
  if ($18 >>> 0 > $24 >>> 0) {
   $27 = HEAP32[$11 >> 2] | 0; //@line 7522
   $28 = $0 + 4 | 0; //@line 7523
   HEAP32[$28 >> 2] = $27; //@line 7524
   $$cast = $27; //@line 7525
   HEAP32[$0 + 8 >> 2] = $$cast + ($18 - $24); //@line 7528
   if (!(HEAP32[$5 >> 2] | 0)) {
    $$0 = $2; //@line 7532
   } else {
    HEAP32[$28 >> 2] = $$cast + 1; //@line 7535
    HEAP8[$1 + ($2 + -1) >> 0] = HEAP8[$$cast >> 0] | 0; //@line 7539
    $$0 = $2; //@line 7540
   }
  } else {
   $$0 = $18; //@line 7543
  }
 }
 STACKTOP = sp; //@line 7546
 return $$0 | 0; //@line 7546
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7808
 STACKTOP = STACKTOP + 16 | 0; //@line 7809
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7809
 $2 = sp; //@line 7810
 $3 = $1 & 255; //@line 7811
 HEAP8[$2 >> 0] = $3; //@line 7812
 $4 = $0 + 16 | 0; //@line 7813
 $5 = HEAP32[$4 >> 2] | 0; //@line 7814
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 7821
   label = 4; //@line 7822
  } else {
   $$0 = -1; //@line 7824
  }
 } else {
  $12 = $5; //@line 7827
  label = 4; //@line 7828
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 7832
   $10 = HEAP32[$9 >> 2] | 0; //@line 7833
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 7836
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 7843
     HEAP8[$10 >> 0] = $3; //@line 7844
     $$0 = $13; //@line 7845
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 7850
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 7851
   $21 = FUNCTION_TABLE_iiii[$20 & 15]($0, $2, 1) | 0; //@line 7852
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 156; //@line 7855
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 7857
    sp = STACKTOP; //@line 7858
    STACKTOP = sp; //@line 7859
    return 0; //@line 7859
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 7861
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 7866
   } else {
    $$0 = -1; //@line 7868
   }
  }
 } while (0);
 STACKTOP = sp; //@line 7872
 return $$0 | 0; //@line 7872
}
function _fflush__async_cb_49($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3510
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3512
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 3514
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 3518
  } else {
   $$02327 = $$02325; //@line 3520
   $$02426 = $AsyncRetVal; //@line 3520
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 3527
    } else {
     $16 = 0; //@line 3529
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 3541
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 3544
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 3547
     break L3;
    } else {
     $$02327 = $$023; //@line 3550
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 3553
   $13 = ___fflush_unlocked($$02327) | 0; //@line 3554
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 3558
    ___async_unwind = 0; //@line 3559
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 162; //@line 3561
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 3563
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 3565
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 3567
   sp = STACKTOP; //@line 3568
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 3572
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 3574
 return;
}
function __ZN15GraphicsDisplay3clsEv($0) {
 $0 = $0 | 0;
 var $1 = 0, $12 = 0, $13 = 0, $19 = 0, $3 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, $AsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 1094
 $1 = HEAP32[$0 >> 2] | 0; //@line 1095
 $3 = HEAP32[$1 + 140 >> 2] | 0; //@line 1097
 $5 = HEAP32[$1 + 124 >> 2] | 0; //@line 1099
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1100
 $6 = FUNCTION_TABLE_ii[$5 & 31]($0) | 0; //@line 1101
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 53; //@line 1104
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1106
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 1108
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 1110
  sp = STACKTOP; //@line 1111
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1114
 $12 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 1117
 $AsyncCtx2 = _emscripten_alloc_async_context(16, sp) | 0; //@line 1118
 $13 = FUNCTION_TABLE_ii[$12 & 31]($0) | 0; //@line 1119
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 54; //@line 1122
  HEAP32[$AsyncCtx2 + 4 >> 2] = $0; //@line 1124
  HEAP32[$AsyncCtx2 + 8 >> 2] = $6; //@line 1126
  HEAP32[$AsyncCtx2 + 12 >> 2] = $3; //@line 1128
  sp = STACKTOP; //@line 1129
  return;
 }
 _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1132
 $19 = HEAPU16[$0 + 30 >> 1] | 0; //@line 1135
 $AsyncCtx5 = _emscripten_alloc_async_context(4, sp) | 0; //@line 1136
 FUNCTION_TABLE_viiiiii[$3 & 7]($0, 0, 0, $6, $13, $19); //@line 1137
 if (___async) {
  HEAP32[$AsyncCtx5 >> 2] = 55; //@line 1140
  sp = STACKTOP; //@line 1141
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx5 | 0); //@line 1144
  return;
 }
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 7085
 value = value & 255; //@line 7087
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 7090
   ptr = ptr + 1 | 0; //@line 7091
  }
  aligned_end = end & -4 | 0; //@line 7094
  block_aligned_end = aligned_end - 64 | 0; //@line 7095
  value4 = value | value << 8 | value << 16 | value << 24; //@line 7096
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 7099
   HEAP32[ptr + 4 >> 2] = value4; //@line 7100
   HEAP32[ptr + 8 >> 2] = value4; //@line 7101
   HEAP32[ptr + 12 >> 2] = value4; //@line 7102
   HEAP32[ptr + 16 >> 2] = value4; //@line 7103
   HEAP32[ptr + 20 >> 2] = value4; //@line 7104
   HEAP32[ptr + 24 >> 2] = value4; //@line 7105
   HEAP32[ptr + 28 >> 2] = value4; //@line 7106
   HEAP32[ptr + 32 >> 2] = value4; //@line 7107
   HEAP32[ptr + 36 >> 2] = value4; //@line 7108
   HEAP32[ptr + 40 >> 2] = value4; //@line 7109
   HEAP32[ptr + 44 >> 2] = value4; //@line 7110
   HEAP32[ptr + 48 >> 2] = value4; //@line 7111
   HEAP32[ptr + 52 >> 2] = value4; //@line 7112
   HEAP32[ptr + 56 >> 2] = value4; //@line 7113
   HEAP32[ptr + 60 >> 2] = value4; //@line 7114
   ptr = ptr + 64 | 0; //@line 7115
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 7119
   ptr = ptr + 4 | 0; //@line 7120
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 7125
  ptr = ptr + 1 | 0; //@line 7126
 }
 return end - num | 0; //@line 7128
}
function __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 2214
 HEAP32[$0 >> 2] = 824; //@line 2215
 $3 = $0 + 4 | 0; //@line 2216
 HEAP32[$3 >> 2] = 0; //@line 2217
 HEAP32[$0 + 8 >> 2] = $1; //@line 2219
 HEAP32[$0 + 12 >> 2] = $2; //@line 2221
 $6 = HEAP32[2211] | 0; //@line 2222
 do {
  if (!$6) {
   HEAP32[2211] = 8848; //@line 2226
  } else {
   if (($6 | 0) != 8848) {
    $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 2230
    _mbed_assert_internal(5235, 5255, 93); //@line 2231
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 87; //@line 2234
     HEAP32[$AsyncCtx3 + 4 >> 2] = $1; //@line 2236
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 2238
     HEAP32[$AsyncCtx3 + 12 >> 2] = $0; //@line 2240
     sp = STACKTOP; //@line 2241
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 2244
     break;
    }
   }
  }
 } while (0);
 if (!$1) {
  HEAP32[$3 >> 2] = 0; //@line 2252
 } else {
  HEAP32[$3 >> 2] = HEAP32[2210]; //@line 2255
  HEAP32[2210] = $0; //@line 2256
 }
 $14 = HEAP32[2211] | 0; //@line 2258
 if (!$14) {
  HEAP32[2211] = 8848; //@line 2261
  return;
 }
 if (($14 | 0) == 8848) {
  return;
 }
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2268
 _mbed_assert_internal(5235, 5255, 93); //@line 2269
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 88; //@line 2272
  sp = STACKTOP; //@line 2273
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2276
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $21 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5710
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5714
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5716
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5718
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5720
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5722
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 5724
 $16 = HEAP8[$0 + 32 >> 0] & 1; //@line 5727
 $21 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 5728
 if ($21 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   if ((HEAP32[$8 >> 2] | 0) != 1) {
    $ReallocAsyncCtx = _emscripten_realloc_async_context(36) | 0; //@line 5737
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($21, $10, $12, $14, $16); //@line 5738
    if (!___async) {
     ___async_unwind = 0; //@line 5741
    }
    HEAP32[$ReallocAsyncCtx >> 2] = 198; //@line 5743
    HEAP32[$ReallocAsyncCtx + 4 >> 2] = $21; //@line 5745
    HEAP32[$ReallocAsyncCtx + 8 >> 2] = $4; //@line 5747
    HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 5749
    HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 5751
    HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 5753
    HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 5755
    HEAP32[$ReallocAsyncCtx + 28 >> 2] = $14; //@line 5757
    HEAP8[$ReallocAsyncCtx + 32 >> 0] = $16 & 1; //@line 5760
    sp = STACKTOP; //@line 5761
    return;
   }
  }
 }
 return;
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 3411
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 3421
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 3421
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 3421
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 3425
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 3428
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 3431
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 3439
  } else {
   $20 = 0; //@line 3441
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 3451
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 3455
  HEAP32[___async_retval >> 2] = $$1; //@line 3457
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 3460
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 3461
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 3465
  ___async_unwind = 0; //@line 3466
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 162; //@line 3468
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 3470
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 3472
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 3474
 sp = STACKTOP; //@line 3475
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6440
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6442
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6444
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6446
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 6451
  } else {
   $9 = $4 + 4 | 0; //@line 6453
   $10 = HEAP32[$9 >> 2] | 0; //@line 6454
   $11 = $4 + 8 | 0; //@line 6455
   $12 = HEAP32[$11 >> 2] | 0; //@line 6456
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 6460
    HEAP32[$6 >> 2] = 0; //@line 6461
    HEAP32[$2 >> 2] = 0; //@line 6462
    HEAP32[$11 >> 2] = 0; //@line 6463
    HEAP32[$9 >> 2] = 0; //@line 6464
    $$0 = 0; //@line 6465
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 6472
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 6473
   FUNCTION_TABLE_iiii[$18 & 15]($4, $10 - $12 | 0, 1) | 0; //@line 6474
   if (!___async) {
    ___async_unwind = 0; //@line 6477
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 164; //@line 6479
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 6481
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 6483
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 6485
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 6487
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 6489
   sp = STACKTOP; //@line 6490
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 6495
 return;
}
function _main__async_cb_39($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 2937
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2939
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2941
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2943
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2945
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2947
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2949
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2951
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2953
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2955
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2957
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(44) | 0; //@line 2958
 _wait(.20000000298023224); //@line 2959
 if (!___async) {
  ___async_unwind = 0; //@line 2962
 }
 HEAP32[$ReallocAsyncCtx14 >> 2] = 148; //@line 2964
 HEAP32[$ReallocAsyncCtx14 + 4 >> 2] = $2; //@line 2966
 HEAP32[$ReallocAsyncCtx14 + 8 >> 2] = $4; //@line 2968
 HEAP32[$ReallocAsyncCtx14 + 12 >> 2] = $6; //@line 2970
 HEAP32[$ReallocAsyncCtx14 + 16 >> 2] = $8; //@line 2972
 HEAP32[$ReallocAsyncCtx14 + 20 >> 2] = $10; //@line 2974
 HEAP32[$ReallocAsyncCtx14 + 24 >> 2] = $12; //@line 2976
 HEAP32[$ReallocAsyncCtx14 + 28 >> 2] = $14; //@line 2978
 HEAP32[$ReallocAsyncCtx14 + 32 >> 2] = $16; //@line 2980
 HEAP32[$ReallocAsyncCtx14 + 36 >> 2] = $18; //@line 2982
 HEAP32[$ReallocAsyncCtx14 + 40 >> 2] = $20; //@line 2984
 sp = STACKTOP; //@line 2985
 return;
}
function _main__async_cb_37($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 2825
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2827
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2829
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2831
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2833
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2835
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2837
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2839
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2841
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 2843
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 2845
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(44) | 0; //@line 2846
 _wait(.20000000298023224); //@line 2847
 if (!___async) {
  ___async_unwind = 0; //@line 2850
 }
 HEAP32[$ReallocAsyncCtx13 >> 2] = 151; //@line 2852
 HEAP32[$ReallocAsyncCtx13 + 4 >> 2] = $2; //@line 2854
 HEAP32[$ReallocAsyncCtx13 + 8 >> 2] = $4; //@line 2856
 HEAP32[$ReallocAsyncCtx13 + 12 >> 2] = $6; //@line 2858
 HEAP32[$ReallocAsyncCtx13 + 16 >> 2] = $8; //@line 2860
 HEAP32[$ReallocAsyncCtx13 + 20 >> 2] = $12; //@line 2862
 HEAP32[$ReallocAsyncCtx13 + 24 >> 2] = $14; //@line 2864
 HEAP32[$ReallocAsyncCtx13 + 28 >> 2] = $16; //@line 2866
 HEAP32[$ReallocAsyncCtx13 + 32 >> 2] = $18; //@line 2868
 HEAP32[$ReallocAsyncCtx13 + 36 >> 2] = $10; //@line 2870
 HEAP32[$ReallocAsyncCtx13 + 40 >> 2] = $20; //@line 2872
 sp = STACKTOP; //@line 2873
 return;
}
function _fopen($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $11 = 0, $15 = 0, $7 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_buffer8 = 0, sp = 0;
 sp = STACKTOP; //@line 8154
 STACKTOP = STACKTOP + 48 | 0; //@line 8155
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 8155
 $vararg_buffer8 = sp + 32 | 0; //@line 8156
 $vararg_buffer3 = sp + 16 | 0; //@line 8157
 $vararg_buffer = sp; //@line 8158
 if (!(_strchr(5831, HEAP8[$1 >> 0] | 0) | 0)) {
  HEAP32[(___errno_location() | 0) >> 2] = 22; //@line 8165
  $$0 = 0; //@line 8166
 } else {
  $7 = ___fmodeflags($1) | 0; //@line 8168
  HEAP32[$vararg_buffer >> 2] = $0; //@line 8171
  HEAP32[$vararg_buffer + 4 >> 2] = $7 | 32768; //@line 8173
  HEAP32[$vararg_buffer + 8 >> 2] = 438; //@line 8175
  $11 = ___syscall_ret(___syscall5(5, $vararg_buffer | 0) | 0) | 0; //@line 8177
  if (($11 | 0) < 0) {
   $$0 = 0; //@line 8180
  } else {
   if ($7 & 524288 | 0) {
    HEAP32[$vararg_buffer3 >> 2] = $11; //@line 8185
    HEAP32[$vararg_buffer3 + 4 >> 2] = 2; //@line 8187
    HEAP32[$vararg_buffer3 + 8 >> 2] = 1; //@line 8189
    ___syscall221(221, $vararg_buffer3 | 0) | 0; //@line 8190
   }
   $15 = ___fdopen($11, $1) | 0; //@line 8192
   if (!$15) {
    HEAP32[$vararg_buffer8 >> 2] = $11; //@line 8195
    ___syscall6(6, $vararg_buffer8 | 0) | 0; //@line 8196
    $$0 = 0; //@line 8197
   } else {
    $$0 = $15; //@line 8199
   }
  }
 }
 STACKTOP = sp; //@line 8203
 return $$0 | 0; //@line 8203
}
function __ZN4mbed10FileHandle4sizeEv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1810
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1812
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1814
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1816
 if (($AsyncRetVal | 0) < 0) {
  HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 1820
  return;
 }
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 16 >> 2] | 0; //@line 1825
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 1826
 $10 = FUNCTION_TABLE_iiii[$9 & 15]($4, 0, 2) | 0; //@line 1827
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 92; //@line 1830
  $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 1831
  HEAP32[$11 >> 2] = $2; //@line 1832
  $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 1833
  HEAP32[$12 >> 2] = $4; //@line 1834
  $13 = $ReallocAsyncCtx2 + 12 | 0; //@line 1835
  HEAP32[$13 >> 2] = $AsyncRetVal; //@line 1836
  sp = STACKTOP; //@line 1837
  return;
 }
 HEAP32[___async_retval >> 2] = $10; //@line 1841
 ___async_unwind = 0; //@line 1842
 HEAP32[$ReallocAsyncCtx2 >> 2] = 92; //@line 1843
 $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 1844
 HEAP32[$11 >> 2] = $2; //@line 1845
 $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 1846
 HEAP32[$12 >> 2] = $4; //@line 1847
 $13 = $ReallocAsyncCtx2 + 12 | 0; //@line 1848
 HEAP32[$13 >> 2] = $AsyncRetVal; //@line 1849
 sp = STACKTOP; //@line 1850
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 11506
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 11511
    $$0 = 1; //@line 11512
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 11525
     $$0 = 1; //@line 11526
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 11530
     $$0 = -1; //@line 11531
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 11541
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 11545
    $$0 = 2; //@line 11546
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 11558
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 11564
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 11568
    $$0 = 3; //@line 11569
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 11579
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 11585
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 11591
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 11595
    $$0 = 4; //@line 11596
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 11600
    $$0 = -1; //@line 11601
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 11606
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_4($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 14549
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14551
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14553
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14555
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 14557
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 14562
  return;
 }
 dest = $2 + 4 | 0; //@line 14566
 stop = dest + 52 | 0; //@line 14566
 do {
  HEAP32[dest >> 2] = 0; //@line 14566
  dest = dest + 4 | 0; //@line 14566
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 14567
 HEAP32[$2 + 8 >> 2] = $4; //@line 14569
 HEAP32[$2 + 12 >> 2] = -1; //@line 14571
 HEAP32[$2 + 48 >> 2] = 1; //@line 14573
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 14576
 $16 = HEAP32[$6 >> 2] | 0; //@line 14577
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 14578
 FUNCTION_TABLE_viiii[$15 & 7]($AsyncRetVal, $2, $16, 1); //@line 14579
 if (!___async) {
  ___async_unwind = 0; //@line 14582
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 183; //@line 14584
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 14586
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 14588
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 14590
 sp = STACKTOP; //@line 14591
 return;
}
function __ZN4mbed6StreamC2EPKc__async_cb_5($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14622
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14626
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14628
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 14630
 HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = 916; //@line 14631
 HEAP32[$4 + 4 >> 2] = 1012; //@line 14633
 $10 = $4 + 20 | 0; //@line 14634
 HEAP32[$10 >> 2] = 0; //@line 14635
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 14636
 $11 = __ZN4mbed6fdopenEPNS_10FileHandleEPKc($4, 4989) | 0; //@line 14637
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 105; //@line 14640
  $12 = $ReallocAsyncCtx + 4 | 0; //@line 14641
  HEAP32[$12 >> 2] = $10; //@line 14642
  $13 = $ReallocAsyncCtx + 8 | 0; //@line 14643
  HEAP32[$13 >> 2] = $6; //@line 14644
  $14 = $ReallocAsyncCtx + 12 | 0; //@line 14645
  HEAP32[$14 >> 2] = $8; //@line 14646
  sp = STACKTOP; //@line 14647
  return;
 }
 HEAP32[___async_retval >> 2] = $11; //@line 14651
 ___async_unwind = 0; //@line 14652
 HEAP32[$ReallocAsyncCtx >> 2] = 105; //@line 14653
 $12 = $ReallocAsyncCtx + 4 | 0; //@line 14654
 HEAP32[$12 >> 2] = $10; //@line 14655
 $13 = $ReallocAsyncCtx + 8 | 0; //@line 14656
 HEAP32[$13 >> 2] = $6; //@line 14657
 $14 = $ReallocAsyncCtx + 12 | 0; //@line 14658
 HEAP32[$14 >> 2] = $8; //@line 14659
 sp = STACKTOP; //@line 14660
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_87($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5846
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5850
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5852
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5854
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5856
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5858
 $14 = HEAP8[$0 + 28 >> 0] & 1; //@line 5861
 $17 = (HEAP32[$0 + 4 >> 2] | 0) + 8 | 0; //@line 5862
 if ($17 >>> 0 < $4 >>> 0) {
  if (!(HEAP8[$6 >> 0] | 0)) {
   $ReallocAsyncCtx3 = _emscripten_realloc_async_context(32) | 0; //@line 5868
   __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($17, $8, $10, $12, $14); //@line 5869
   if (!___async) {
    ___async_unwind = 0; //@line 5872
   }
   HEAP32[$ReallocAsyncCtx3 >> 2] = 196; //@line 5874
   HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $17; //@line 5876
   HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 5878
   HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $6; //@line 5880
   HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 5882
   HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $10; //@line 5884
   HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $12; //@line 5886
   HEAP8[$ReallocAsyncCtx3 + 28 >> 0] = $14 & 1; //@line 5889
   sp = STACKTOP; //@line 5890
   return;
  }
 }
 return;
}
function __ZN4mbed6fdopenEPNS_10FileHandleEPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0$$sroa_idx = 0, $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3545
 STACKTOP = STACKTOP + 16 | 0; //@line 3546
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3546
 $2 = sp; //@line 3547
 HEAP8[$2 >> 0] = 58; //@line 3548
 $$0$$sroa_idx = $2 + 1 | 0; //@line 3549
 HEAP8[$$0$$sroa_idx >> 0] = $0; //@line 3550
 HEAP8[$$0$$sroa_idx + 1 >> 0] = $0 >> 8; //@line 3550
 HEAP8[$$0$$sroa_idx + 2 >> 0] = $0 >> 16; //@line 3550
 HEAP8[$$0$$sroa_idx + 3 >> 0] = $0 >> 24; //@line 3550
 $3 = _fopen($2, $1) | 0; //@line 3551
 if (!$3) {
  STACKTOP = sp; //@line 3554
  return $3 | 0; //@line 3554
 }
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 28 >> 2] | 0; //@line 3558
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 3559
 $8 = FUNCTION_TABLE_ii[$7 & 31]($0) | 0; //@line 3560
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 137; //@line 3563
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 3565
  HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 3567
  sp = STACKTOP; //@line 3568
  STACKTOP = sp; //@line 3569
  return 0; //@line 3569
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3571
 if (!$8) {
  STACKTOP = sp; //@line 3574
  return $3 | 0; //@line 3574
 }
 _setbuf($3, 0); //@line 3576
 STACKTOP = sp; //@line 3577
 return $3 | 0; //@line 3577
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 10390
  $8 = $0; //@line 10390
  $9 = $1; //@line 10390
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 10392
   $$0914 = $$0914 + -1 | 0; //@line 10396
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 10397
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 10398
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 10406
   }
  }
  $$010$lcssa$off0 = $8; //@line 10411
  $$09$lcssa = $$0914; //@line 10411
 } else {
  $$010$lcssa$off0 = $0; //@line 10413
  $$09$lcssa = $2; //@line 10413
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 10417
 } else {
  $$012 = $$010$lcssa$off0; //@line 10419
  $$111 = $$09$lcssa; //@line 10419
  while (1) {
   $26 = $$111 + -1 | 0; //@line 10424
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 10425
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 10429
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 10432
    $$111 = $26; //@line 10432
   }
  }
 }
 return $$1$lcssa | 0; //@line 10436
}
function _main__async_cb_41($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 3049
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3051
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 3053
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 3055
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 3057
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 3059
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 3061
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 3063
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 3065
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 3067
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(40) | 0; //@line 3068
 _wait(.20000000298023224); //@line 3069
 if (!___async) {
  ___async_unwind = 0; //@line 3072
 }
 HEAP32[$ReallocAsyncCtx15 >> 2] = 145; //@line 3074
 HEAP32[$ReallocAsyncCtx15 + 4 >> 2] = $2; //@line 3076
 HEAP32[$ReallocAsyncCtx15 + 8 >> 2] = $4; //@line 3078
 HEAP32[$ReallocAsyncCtx15 + 12 >> 2] = $6; //@line 3080
 HEAP32[$ReallocAsyncCtx15 + 16 >> 2] = $8; //@line 3082
 HEAP32[$ReallocAsyncCtx15 + 20 >> 2] = $10; //@line 3084
 HEAP32[$ReallocAsyncCtx15 + 24 >> 2] = $12; //@line 3086
 HEAP32[$ReallocAsyncCtx15 + 28 >> 2] = $14; //@line 3088
 HEAP32[$ReallocAsyncCtx15 + 32 >> 2] = $16; //@line 3090
 HEAP32[$ReallocAsyncCtx15 + 36 >> 2] = $18; //@line 3092
 sp = STACKTOP; //@line 3093
 return;
}
function __ZN4mbed17remove_filehandleEPNS_10FileHandleE($0) {
 $0 = $0 | 0;
 var $1 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3450
 $1 = HEAP32[2213] | 0; //@line 3451
 do {
  if (!$1) {
   HEAP32[2213] = 8856; //@line 3455
  } else {
   if (($1 | 0) != 8856) {
    $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 3459
    _mbed_assert_internal(5235, 5255, 93); //@line 3460
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 134; //@line 3463
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 3465
     sp = STACKTOP; //@line 3466
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 3469
     break;
    }
   }
  }
 } while (0);
 if ((HEAP32[459] | 0) == ($0 | 0)) {
  HEAP32[459] = 0; //@line 3478
 }
 if ((HEAP32[460] | 0) == ($0 | 0)) {
  HEAP32[460] = 0; //@line 3483
 }
 if ((HEAP32[461] | 0) == ($0 | 0)) {
  HEAP32[461] = 0; //@line 3488
 }
 $8 = HEAP32[2213] | 0; //@line 3490
 if (!$8) {
  HEAP32[2213] = 8856; //@line 3493
  return;
 }
 if (($8 | 0) == 8856) {
  return;
 }
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3500
 _mbed_assert_internal(5235, 5255, 93); //@line 3501
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 135; //@line 3504
  sp = STACKTOP; //@line 3505
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 3508
 return;
}
function __ZN11TextDisplay5claimEP8_IO_FILE($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $12 = 0, $13 = 0, $3 = 0, $6 = 0, $9 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1691
 $3 = HEAP32[$0 + 32 >> 2] | 0; //@line 1693
 if (!$3) {
  _fwrite(4628, 85, 1, HEAP32[271] | 0) | 0; //@line 1697
  $$0 = 0; //@line 1698
  return $$0 | 0; //@line 1699
 }
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1701
 $6 = _freopen($3, 4714, $1) | 0; //@line 1702
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 70; //@line 1705
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1707
  sp = STACKTOP; //@line 1708
  return 0; //@line 1709
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1711
 if (!$6) {
  $$0 = 0; //@line 1714
  return $$0 | 0; //@line 1715
 }
 $9 = HEAP32[303] | 0; //@line 1717
 $12 = HEAP32[(HEAP32[$0 >> 2] | 0) + 96 >> 2] | 0; //@line 1720
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1721
 $13 = FUNCTION_TABLE_ii[$12 & 31]($0) | 0; //@line 1722
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 71; //@line 1725
  HEAP32[$AsyncCtx + 4 >> 2] = $9; //@line 1727
  sp = STACKTOP; //@line 1728
  return 0; //@line 1729
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1731
 _setvbuf($9, 0, 1, $13) | 0; //@line 1732
 $$0 = 1; //@line 1733
 return $$0 | 0; //@line 1734
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5037
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5039
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5043
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5045
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5047
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5049
 if (!(HEAP8[$2 >> 0] | 0)) {
  $13 = (HEAP32[$0 + 8 >> 2] | 0) + 8 | 0; //@line 5053
  if ($13 >>> 0 < $6 >>> 0) {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 5056
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($13, $8, $10, $12); //@line 5057
   if (!___async) {
    ___async_unwind = 0; //@line 5060
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 200; //@line 5062
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 5064
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $13; //@line 5066
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $6; //@line 5068
   HEAP32[$ReallocAsyncCtx + 16 >> 2] = $8; //@line 5070
   HEAP32[$ReallocAsyncCtx + 20 >> 2] = $10; //@line 5072
   HEAP32[$ReallocAsyncCtx + 24 >> 2] = $12; //@line 5074
   sp = STACKTOP; //@line 5075
   return;
  }
 }
 return;
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 7636
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 7641
   label = 4; //@line 7642
  } else {
   $$01519 = $0; //@line 7644
   $23 = $1; //@line 7644
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 7649
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 7652
    $23 = $6; //@line 7653
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 7657
     label = 4; //@line 7658
     break;
    } else {
     $$01519 = $6; //@line 7661
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 7667
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 7669
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 7677
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 7685
  } else {
   $$pn = $$0; //@line 7687
   while (1) {
    $19 = $$pn + 1 | 0; //@line 7689
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 7693
     break;
    } else {
     $$pn = $19; //@line 7696
    }
   }
  }
  $$sink = $$1$lcssa; //@line 7701
 }
 return $$sink - $1 | 0; //@line 7704
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 12790
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 12797
   $10 = $1 + 16 | 0; //@line 12798
   $11 = HEAP32[$10 >> 2] | 0; //@line 12799
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 12802
    HEAP32[$1 + 24 >> 2] = $4; //@line 12804
    HEAP32[$1 + 36 >> 2] = 1; //@line 12806
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 12816
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 12821
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 12824
    HEAP8[$1 + 54 >> 0] = 1; //@line 12826
    break;
   }
   $21 = $1 + 24 | 0; //@line 12829
   $22 = HEAP32[$21 >> 2] | 0; //@line 12830
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 12833
    $28 = $4; //@line 12834
   } else {
    $28 = $22; //@line 12836
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 12845
   }
  }
 } while (0);
 return;
}
function __ZN15GraphicsDisplay4putpEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $10 = 0, $15 = 0, $22 = 0, $4 = 0, $5 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1183
 $4 = HEAP32[(HEAP32[$0 >> 2] | 0) + 120 >> 2] | 0; //@line 1186
 $5 = $0 + 36 | 0; //@line 1187
 $7 = HEAP16[$5 >> 1] | 0; //@line 1189
 $8 = $0 + 38 | 0; //@line 1190
 $10 = HEAP16[$8 >> 1] | 0; //@line 1192
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 1193
 FUNCTION_TABLE_viiii[$4 & 7]($0, $7, $10, $1); //@line 1194
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 56; //@line 1197
  HEAP32[$AsyncCtx + 4 >> 2] = $5; //@line 1199
  HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 1201
  HEAP32[$AsyncCtx + 12 >> 2] = $8; //@line 1203
  sp = STACKTOP; //@line 1204
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1207
 $15 = (HEAP16[$5 >> 1] | 0) + 1 << 16 >> 16; //@line 1209
 HEAP16[$5 >> 1] = $15; //@line 1210
 if ($15 << 16 >> 16 <= (HEAP16[$0 + 42 >> 1] | 0)) {
  return;
 }
 HEAP16[$5 >> 1] = HEAP16[$0 + 40 >> 1] | 0; //@line 1219
 $22 = (HEAP16[$8 >> 1] | 0) + 1 << 16 >> 16; //@line 1221
 HEAP16[$8 >> 1] = $22; //@line 1222
 if ($22 << 16 >> 16 <= (HEAP16[$0 + 46 >> 1] | 0)) {
  return;
 }
 HEAP16[$8 >> 1] = HEAP16[$0 + 44 >> 1] | 0; //@line 1231
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12225
 $1 = HEAP32[303] | 0; //@line 12226
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 12232
 } else {
  $19 = 0; //@line 12234
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 12240
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 12246
    $12 = HEAP32[$11 >> 2] | 0; //@line 12247
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 12253
     HEAP8[$12 >> 0] = 10; //@line 12254
     $22 = 0; //@line 12255
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 12259
   $17 = ___overflow($1, 10) | 0; //@line 12260
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 175; //@line 12263
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 12265
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 12267
    sp = STACKTOP; //@line 12268
    return 0; //@line 12269
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 12271
    $22 = $17 >> 31; //@line 12273
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 12280
 }
 return $22 | 0; //@line 12282
}
function _main__async_cb_34($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2600
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2602
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2604
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2606
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2608
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2610
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 2612
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 2614
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 2616
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(36) | 0; //@line 2617
 _puts(5755) | 0; //@line 2618
 if (!___async) {
  ___async_unwind = 0; //@line 2621
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 142; //@line 2623
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 2625
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 2627
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 2629
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 2631
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 2633
 HEAP32[$ReallocAsyncCtx2 + 24 >> 2] = $12; //@line 2635
 HEAP32[$ReallocAsyncCtx2 + 28 >> 2] = $14; //@line 2637
 HEAP32[$ReallocAsyncCtx2 + 32 >> 2] = $16; //@line 2639
 sp = STACKTOP; //@line 2640
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_77($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5085
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5091
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5093
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5095
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5097
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 1) {
  return;
 }
 $14 = (HEAP32[$0 + 8 >> 2] | 0) + 24 | 0; //@line 5102
 $ReallocAsyncCtx = _emscripten_realloc_async_context(28) | 0; //@line 5104
 __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($14, $6, $8, $10); //@line 5105
 if (!___async) {
  ___async_unwind = 0; //@line 5108
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 200; //@line 5110
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $6 + 54; //@line 5112
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $14; //@line 5114
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $12; //@line 5116
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 5118
 HEAP32[$ReallocAsyncCtx + 20 >> 2] = $8; //@line 5120
 HEAP32[$ReallocAsyncCtx + 24 >> 2] = $10; //@line 5122
 sp = STACKTOP; //@line 5123
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
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 12649
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 12658
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 12663
      HEAP32[$13 >> 2] = $2; //@line 12664
      $19 = $1 + 40 | 0; //@line 12665
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 12668
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 12678
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 12682
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 12689
    }
   }
  }
 } while (0);
 return;
}
function __ZN11TextDisplay5_putcEi__async_cb_70($0) {
 $0 = $0 | 0;
 var $10 = 0, $14 = 0, $15 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4650
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4652
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4654
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4656
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4658
 $10 = (HEAP16[$2 >> 1] | 0) + 1 << 16 >> 16; //@line 4660
 HEAP16[$2 >> 1] = $10; //@line 4661
 $14 = HEAP32[(HEAP32[$4 >> 2] | 0) + 96 >> 2] | 0; //@line 4665
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(28) | 0; //@line 4666
 $15 = FUNCTION_TABLE_ii[$14 & 31]($4) | 0; //@line 4667
 if (!___async) {
  HEAP32[___async_retval >> 2] = $15; //@line 4671
  ___async_unwind = 0; //@line 4672
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 68; //@line 4674
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $10 & 65535; //@line 4676
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $6; //@line 4678
 HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $2; //@line 4680
 HEAP32[$ReallocAsyncCtx3 + 16 >> 2] = $8; //@line 4682
 HEAP32[$ReallocAsyncCtx3 + 20 >> 2] = $4; //@line 4684
 HEAP32[$ReallocAsyncCtx3 + 24 >> 2] = $4; //@line 4686
 sp = STACKTOP; //@line 4687
 return;
}
function __ZL25default_terminate_handlerv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4960
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4962
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4964
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4966
 $8 = HEAP32[$0 + 20 >> 2] | 0; //@line 4968
 $10 = HEAP32[$0 + 24 >> 2] | 0; //@line 4970
 if (!(HEAP8[___async_retval >> 0] & 1)) {
  HEAP32[$4 >> 2] = 8397; //@line 4975
  HEAP32[$4 + 4 >> 2] = $6; //@line 4977
  _abort_message(8306, $4); //@line 4978
 }
 $12 = HEAP32[$2 >> 2] | 0; //@line 4981
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 8 >> 2] | 0; //@line 4984
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 4985
 $16 = FUNCTION_TABLE_ii[$15 & 31]($12) | 0; //@line 4986
 if (!___async) {
  HEAP32[___async_retval >> 2] = $16; //@line 4990
  ___async_unwind = 0; //@line 4991
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 179; //@line 4993
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $8; //@line 4995
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 4997
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $10; //@line 4999
 sp = STACKTOP; //@line 5000
 return;
}
function ___strerror_l($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $7 = 0, label = 0, $$113$looptemp = 0;
 $$016 = 0; //@line 11626
 while (1) {
  if ((HEAPU8[6369 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 11633
   break;
  }
  $7 = $$016 + 1 | 0; //@line 11636
  if (($7 | 0) == 87) {
   $$01214 = 6457; //@line 11639
   $$115 = 87; //@line 11639
   label = 5; //@line 11640
   break;
  } else {
   $$016 = $7; //@line 11643
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 6457; //@line 11649
  } else {
   $$01214 = 6457; //@line 11651
   $$115 = $$016; //@line 11651
   label = 5; //@line 11652
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 11657
   $$113 = $$01214; //@line 11658
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 11662
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 11669
   if (!$$115) {
    $$012$lcssa = $$113; //@line 11672
    break;
   } else {
    $$01214 = $$113; //@line 11675
    label = 5; //@line 11676
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 11683
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4778
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4780
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4782
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 4786
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 4790
  label = 4; //@line 4791
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 4796
   label = 4; //@line 4797
  } else {
   $$037$off039 = 3; //@line 4799
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 4803
  $17 = $8 + 40 | 0; //@line 4804
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 4807
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 4817
    $$037$off039 = $$037$off038; //@line 4818
   } else {
    $$037$off039 = $$037$off038; //@line 4820
   }
  } else {
   $$037$off039 = $$037$off038; //@line 4823
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 4826
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb_12($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 344
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 346
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 348
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 350
 $9 = HEAP32[(HEAP32[$2 >> 2] | 0) + 68 >> 2] | 0; //@line 353
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 354
 $10 = FUNCTION_TABLE_iii[$9 & 7]($2, $4) | 0; //@line 355
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 108; //@line 358
  $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 359
  HEAP32[$11 >> 2] = $6; //@line 360
  $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 361
  HEAP32[$12 >> 2] = $2; //@line 362
  sp = STACKTOP; //@line 363
  return;
 }
 HEAP32[___async_retval >> 2] = $10; //@line 367
 ___async_unwind = 0; //@line 368
 HEAP32[$ReallocAsyncCtx2 >> 2] = 108; //@line 369
 $11 = $ReallocAsyncCtx2 + 4 | 0; //@line 370
 HEAP32[$11 >> 2] = $6; //@line 371
 $12 = $ReallocAsyncCtx2 + 8 | 0; //@line 372
 HEAP32[$12 >> 2] = $2; //@line 373
 sp = STACKTOP; //@line 374
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_82($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 5543
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5545
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5547
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5549
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5551
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5553
 $12 = HEAP32[(HEAP32[$2 >> 2] | 0) + 92 >> 2] | 0; //@line 5556
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(24) | 0; //@line 5557
 $13 = FUNCTION_TABLE_ii[$12 & 31]($4) | 0; //@line 5558
 if (!___async) {
  HEAP32[___async_retval >> 2] = $13; //@line 5562
  ___async_unwind = 0; //@line 5563
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 77; //@line 5565
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $AsyncRetVal; //@line 5567
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $6; //@line 5569
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $8; //@line 5571
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $2; //@line 5573
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $4; //@line 5575
 sp = STACKTOP; //@line 5576
 return;
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3400
 $2 = $0 + 12 | 0; //@line 3402
 $3 = HEAP32[$2 >> 2] | 0; //@line 3403
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 3407
   _mbed_assert_internal(5146, 5151, 528); //@line 3408
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 132; //@line 3411
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 3413
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 3415
    sp = STACKTOP; //@line 3416
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 3419
    $8 = HEAP32[$2 >> 2] | 0; //@line 3421
    break;
   }
  } else {
   $8 = $3; //@line 3425
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 3428
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3430
 FUNCTION_TABLE_vi[$7 & 255]($0); //@line 3431
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 133; //@line 3434
  sp = STACKTOP; //@line 3435
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3438
  return;
 }
}
function __ZN4mbed6Stream6printfEPKcz__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $2 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 1937
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1939
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1943
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1945
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1947
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 1949
 HEAP32[$2 >> 2] = HEAP32[$0 + 8 >> 2]; //@line 1950
 _memset($6 | 0, 0, 4096) | 0; //@line 1951
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(24) | 0; //@line 1952
 $13 = _vsprintf($6, $8, $2) | 0; //@line 1953
 if (!___async) {
  HEAP32[___async_retval >> 2] = $13; //@line 1957
  ___async_unwind = 0; //@line 1958
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 111; //@line 1960
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $10; //@line 1962
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $12; //@line 1964
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 1966
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $2; //@line 1968
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $6; //@line 1970
 sp = STACKTOP; //@line 1971
 return;
}
function _abort_message($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $2 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 12482
 STACKTOP = STACKTOP + 16 | 0; //@line 12483
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12483
 $1 = sp; //@line 12484
 HEAP32[$1 >> 2] = $varargs; //@line 12485
 $2 = HEAP32[271] | 0; //@line 12486
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12487
 _vfprintf($2, $0, $1) | 0; //@line 12488
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 180; //@line 12491
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 12493
  sp = STACKTOP; //@line 12494
  STACKTOP = sp; //@line 12495
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 12497
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 12498
 _fputc(10, $2) | 0; //@line 12499
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 181; //@line 12502
  sp = STACKTOP; //@line 12503
  STACKTOP = sp; //@line 12504
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 12506
  _abort(); //@line 12507
 }
}
function __ZN15GraphicsDisplay4fillEiiiii__async_cb_32($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $15 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2492
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2496
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2498
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2500
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 2502
 $15 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 2503
 if (($15 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 136 >> 2] | 0; //@line 2510
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 2511
 FUNCTION_TABLE_vii[$13 & 7]($8, $10); //@line 2512
 if (!___async) {
  ___async_unwind = 0; //@line 2515
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 58; //@line 2517
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $15; //@line 2519
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $4; //@line 2521
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 2523
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 2525
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 2527
 sp = STACKTOP; //@line 2528
 return;
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 11457
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 11457
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 11458
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 11459
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 11468
    $$016 = $9; //@line 11471
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 11471
   } else {
    $$016 = $0; //@line 11473
    $storemerge = 0; //@line 11473
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 11475
   $$0 = $$016; //@line 11476
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 11480
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 11486
   HEAP32[tempDoublePtr >> 2] = $2; //@line 11489
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 11489
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 11490
  }
 }
 return +$$0;
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14094
 STACKTOP = STACKTOP + 16 | 0; //@line 14095
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 14095
 $3 = sp; //@line 14096
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 14098
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 14101
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 14102
 $8 = FUNCTION_TABLE_iiii[$7 & 15]($0, $1, $3) | 0; //@line 14103
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 204; //@line 14106
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 14108
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 14110
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 14112
  sp = STACKTOP; //@line 14113
  STACKTOP = sp; //@line 14114
  return 0; //@line 14114
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 14116
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 14120
 }
 STACKTOP = sp; //@line 14122
 return $8 & 1 | 0; //@line 14122
}
function __ZN15GraphicsDisplay4blitEiiiiPKi__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $14 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 6578
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6584
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6586
 $9 = Math_imul(HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 6587
 if (($9 | 0) <= 0) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 136 >> 2] | 0; //@line 6594
 $14 = HEAP32[$8 >> 2] | 0; //@line 6595
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 6596
 FUNCTION_TABLE_vii[$13 & 7]($6, $14); //@line 6597
 if (!___async) {
  ___async_unwind = 0; //@line 6600
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 60; //@line 6602
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = 0; //@line 6604
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $9; //@line 6606
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 6608
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $8; //@line 6610
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $6; //@line 6612
 sp = STACKTOP; //@line 6613
 return;
}
function __ZN15GraphicsDisplayC2EPKc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1510
 $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1511
 __ZN11TextDisplayC2EPKc($0, $1); //@line 1512
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 64; //@line 1515
  HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1517
  HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 1519
  sp = STACKTOP; //@line 1520
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1523
 HEAP32[$0 >> 2] = 504; //@line 1524
 HEAP32[$0 + 4 >> 2] = 664; //@line 1526
 __ZN11TextDisplay10foregroundEt($0, -1); //@line 1527
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 116 >> 2] | 0; //@line 1530
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1531
 FUNCTION_TABLE_vii[$7 & 7]($0, 0); //@line 1532
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 65; //@line 1535
  sp = STACKTOP; //@line 1536
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1539
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
 sp = STACKTOP; //@line 13005
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 13011
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 13014
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 13017
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13018
   FUNCTION_TABLE_viiiiii[$13 & 7]($10, $1, $2, $3, $4, $5); //@line 13019
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 186; //@line 13022
    sp = STACKTOP; //@line 13023
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 13026
    break;
   }
  }
 } while (0);
 return;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5133
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5141
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 5143
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 5145
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 5147
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 5149
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 5151
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 5153
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 5164
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 5165
 HEAP32[$10 >> 2] = 0; //@line 5166
 HEAP32[$12 >> 2] = 0; //@line 5167
 HEAP32[$14 >> 2] = 0; //@line 5168
 HEAP32[$2 >> 2] = 0; //@line 5169
 $33 = HEAP32[$16 >> 2] | 0; //@line 5170
 HEAP32[$16 >> 2] = $33 | $18; //@line 5175
 if ($20 | 0) {
  ___unlockfile($22); //@line 5178
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 5181
 return;
}
function __ZN11TextDisplay3clsEv__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 5444
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5446
 $5 = HEAP32[(HEAP32[$2 >> 2] | 0) + 96 >> 2] | 0; //@line 5449
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(12) | 0; //@line 5450
 $6 = FUNCTION_TABLE_ii[$5 & 31]($2) | 0; //@line 5451
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 73; //@line 5454
  $7 = $ReallocAsyncCtx2 + 4 | 0; //@line 5455
  HEAP32[$7 >> 2] = $2; //@line 5456
  $8 = $ReallocAsyncCtx2 + 8 | 0; //@line 5457
  HEAP32[$8 >> 2] = $2; //@line 5458
  sp = STACKTOP; //@line 5459
  return;
 }
 HEAP32[___async_retval >> 2] = $6; //@line 5463
 ___async_unwind = 0; //@line 5464
 HEAP32[$ReallocAsyncCtx2 >> 2] = 73; //@line 5465
 $7 = $ReallocAsyncCtx2 + 4 | 0; //@line 5466
 HEAP32[$7 >> 2] = $2; //@line 5467
 $8 = $ReallocAsyncCtx2 + 8 | 0; //@line 5468
 HEAP32[$8 >> 2] = $2; //@line 5469
 sp = STACKTOP; //@line 5470
 return;
}
function __ZN11TextDisplay5claimEP8_IO_FILE__async_cb_94($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $5 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6539
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6541
 if (!(HEAP32[___async_retval >> 2] | 0)) {
  HEAP8[___async_retval >> 0] = 0; //@line 6548
  return;
 }
 $5 = HEAP32[303] | 0; //@line 6551
 $8 = HEAP32[(HEAP32[$2 >> 2] | 0) + 96 >> 2] | 0; //@line 6554
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 6555
 $9 = FUNCTION_TABLE_ii[$8 & 31]($2) | 0; //@line 6556
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 71; //@line 6559
  $10 = $ReallocAsyncCtx + 4 | 0; //@line 6560
  HEAP32[$10 >> 2] = $5; //@line 6561
  sp = STACKTOP; //@line 6562
  return;
 }
 HEAP32[___async_retval >> 2] = $9; //@line 6566
 ___async_unwind = 0; //@line 6567
 HEAP32[$ReallocAsyncCtx >> 2] = 71; //@line 6568
 $10 = $ReallocAsyncCtx + 4 | 0; //@line 6569
 HEAP32[$10 >> 2] = $5; //@line 6570
 sp = STACKTOP; //@line 6571
 return;
}
function __ZN15GraphicsDisplay4fillEiiiii__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2451
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 2457
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 2459
 $9 = Math_imul(HEAP32[$0 + 4 >> 2] | 0, HEAP32[$0 + 8 >> 2] | 0) | 0; //@line 2460
 if (($9 | 0) <= 0) {
  return;
 }
 $13 = HEAP32[(HEAP32[$6 >> 2] | 0) + 136 >> 2] | 0; //@line 2467
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 2468
 FUNCTION_TABLE_vii[$13 & 7]($6, $8); //@line 2469
 if (!___async) {
  ___async_unwind = 0; //@line 2472
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 58; //@line 2474
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = 0; //@line 2476
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $9; //@line 2478
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 2480
 HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $6; //@line 2482
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $8; //@line 2484
 sp = STACKTOP; //@line 2485
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_84($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $4 = 0, $6 = 0, $8 = 0, $9 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 5623
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5627
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5629
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5631
 $9 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 5632
 $12 = HEAP32[(HEAP32[$4 >> 2] | 0) + 96 >> 2] | 0; //@line 5635
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(20) | 0; //@line 5636
 $13 = FUNCTION_TABLE_ii[$12 & 31]($6) | 0; //@line 5637
 if (!___async) {
  HEAP32[___async_retval >> 2] = $13; //@line 5641
  ___async_unwind = 0; //@line 5642
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 76; //@line 5644
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $4; //@line 5646
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $6; //@line 5648
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $9; //@line 5650
 HEAP32[$ReallocAsyncCtx4 + 16 >> 2] = $8; //@line 5652
 sp = STACKTOP; //@line 5653
 return;
}
function __ZN4mbed10FileHandle4sizeEv__async_cb_22($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1856
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1860
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1862
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 1864
 $10 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 16 >> 2] | 0; //@line 1867
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 1868
 FUNCTION_TABLE_iiii[$10 & 15]($4, $6, 0) | 0; //@line 1869
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 93; //@line 1872
  $11 = $ReallocAsyncCtx3 + 4 | 0; //@line 1873
  HEAP32[$11 >> 2] = $AsyncRetVal; //@line 1874
  sp = STACKTOP; //@line 1875
  return;
 }
 ___async_unwind = 0; //@line 1878
 HEAP32[$ReallocAsyncCtx3 >> 2] = 93; //@line 1879
 $11 = $ReallocAsyncCtx3 + 4 | 0; //@line 1880
 HEAP32[$11 >> 2] = $AsyncRetVal; //@line 1881
 sp = STACKTOP; //@line 1882
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
 sp = STACKTOP; //@line 14004
 $7 = HEAP32[$0 + 4 >> 2] | 0; //@line 14006
 $8 = $7 >> 8; //@line 14007
 if (!($7 & 1)) {
  $$0 = $8; //@line 14011
 } else {
  $$0 = HEAP32[(HEAP32[$3 >> 2] | 0) + $8 >> 2] | 0; //@line 14016
 }
 $14 = HEAP32[$0 >> 2] | 0; //@line 14018
 $17 = HEAP32[(HEAP32[$14 >> 2] | 0) + 20 >> 2] | 0; //@line 14021
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 14026
 FUNCTION_TABLE_viiiiii[$17 & 7]($14, $1, $2, $3 + $$0 | 0, $7 & 2 | 0 ? $4 : 2, $5); //@line 14027
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 202; //@line 14030
  sp = STACKTOP; //@line 14031
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 14034
  return;
 }
}
function __Znwj($0) {
 $0 = $0 | 0;
 var $$ = 0, $$lcssa = 0, $2 = 0, $4 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12287
 $$ = ($0 | 0) == 0 ? 1 : $0; //@line 12289
 while (1) {
  $2 = _malloc($$) | 0; //@line 12291
  if ($2 | 0) {
   $$lcssa = $2; //@line 12294
   label = 7; //@line 12295
   break;
  }
  $4 = __ZSt15get_new_handlerv() | 0; //@line 12298
  if (!$4) {
   $$lcssa = 0; //@line 12301
   label = 7; //@line 12302
   break;
  }
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 12305
  FUNCTION_TABLE_v[$4 & 3](); //@line 12306
  if (___async) {
   label = 5; //@line 12309
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 12312
 }
 if ((label | 0) == 5) {
  HEAP32[$AsyncCtx >> 2] = 176; //@line 12315
  HEAP32[$AsyncCtx + 4 >> 2] = $$; //@line 12317
  sp = STACKTOP; //@line 12318
  return 0; //@line 12319
 } else if ((label | 0) == 7) {
  return $$lcssa | 0; //@line 12322
 }
 return 0; //@line 12324
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13174
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 13180
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 13183
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 13186
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13187
   FUNCTION_TABLE_viiii[$11 & 7]($8, $1, $2, $3); //@line 13188
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 189; //@line 13191
    sp = STACKTOP; //@line 13192
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 13195
    break;
   }
  }
 } while (0);
 return;
}
function _fclose__async_cb_66($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 4401
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4403
 $4 = HEAP8[$0 + 8 >> 0] & 1; //@line 4406
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 4408
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 4410
 $9 = HEAP32[$2 + 12 >> 2] | 0; //@line 4412
 $ReallocAsyncCtx = _emscripten_realloc_async_context(20) | 0; //@line 4413
 $10 = FUNCTION_TABLE_ii[$9 & 31]($2) | 0; //@line 4414
 if (!___async) {
  HEAP32[___async_retval >> 2] = $10; //@line 4418
  ___async_unwind = 0; //@line 4419
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 158; //@line 4421
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $AsyncRetVal; //@line 4423
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $2; //@line 4425
 HEAP8[$ReallocAsyncCtx + 12 >> 0] = $4 & 1; //@line 4428
 HEAP32[$ReallocAsyncCtx + 16 >> 2] = $6; //@line 4430
 sp = STACKTOP; //@line 4431
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0 = 0, $13 = 0, $16 = 0, $6 = 0, $7 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14046
 $6 = HEAP32[$0 + 4 >> 2] | 0; //@line 14048
 $7 = $6 >> 8; //@line 14049
 if (!($6 & 1)) {
  $$0 = $7; //@line 14053
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $7 >> 2] | 0; //@line 14058
 }
 $13 = HEAP32[$0 >> 2] | 0; //@line 14060
 $16 = HEAP32[(HEAP32[$13 >> 2] | 0) + 24 >> 2] | 0; //@line 14063
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 14068
 FUNCTION_TABLE_viiiii[$16 & 7]($13, $1, $2 + $$0 | 0, $6 & 2 | 0 ? $3 : 2, $4); //@line 14069
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 203; //@line 14072
  sp = STACKTOP; //@line 14073
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 14076
  return;
 }
}
function __ZThn4_N4mbed6StreamD1Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $2 = 0, $4 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2693
 $1 = $0 + -4 | 0; //@line 2694
 HEAP32[$1 >> 2] = 916; //@line 2695
 $2 = $1 + 4 | 0; //@line 2696
 HEAP32[$2 >> 2] = 1012; //@line 2697
 $4 = HEAP32[$1 + 20 >> 2] | 0; //@line 2699
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2700
 _fclose($4) | 0; //@line 2701
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 102; //@line 2704
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 2706
  sp = STACKTOP; //@line 2707
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2710
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2711
 __ZN4mbed8FileBaseD2Ev($2); //@line 2712
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 103; //@line 2715
  sp = STACKTOP; //@line 2716
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2719
  return;
 }
}
function __ZN11TextDisplay3clsEv__async_cb_83($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 5583
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5587
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5589
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 5591
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 5593
 if (($4 | 0) >= (Math_imul(HEAP32[___async_retval >> 2] | 0, HEAP32[$0 + 4 >> 2] | 0) | 0)) {
  return;
 }
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 5601
 __ZN4mbed6Stream4putcEi($6, 32) | 0; //@line 5602
 if (!___async) {
  ___async_unwind = 0; //@line 5605
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 75; //@line 5607
 HEAP32[$ReallocAsyncCtx6 + 4 >> 2] = $4; //@line 5609
 HEAP32[$ReallocAsyncCtx6 + 8 >> 2] = $8; //@line 5611
 HEAP32[$ReallocAsyncCtx6 + 12 >> 2] = $10; //@line 5613
 HEAP32[$ReallocAsyncCtx6 + 16 >> 2] = $6; //@line 5615
 sp = STACKTOP; //@line 5616
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $12 = 0, $15 = 0, $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13961
 $5 = HEAP32[$0 + 4 >> 2] | 0; //@line 13963
 $6 = $5 >> 8; //@line 13964
 if (!($5 & 1)) {
  $$0 = $6; //@line 13968
 } else {
  $$0 = HEAP32[(HEAP32[$2 >> 2] | 0) + $6 >> 2] | 0; //@line 13973
 }
 $12 = HEAP32[$0 >> 2] | 0; //@line 13975
 $15 = HEAP32[(HEAP32[$12 >> 2] | 0) + 28 >> 2] | 0; //@line 13978
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 13983
 FUNCTION_TABLE_viiii[$15 & 7]($12, $1, $2 + $$0 | 0, $5 & 2 | 0 ? $3 : 2); //@line 13984
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 201; //@line 13987
  sp = STACKTOP; //@line 13988
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13991
  return;
 }
}
function __ZN15GraphicsDisplay3clsEv__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $11 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 14385
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14389
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14391
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 14393
 $10 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 128 >> 2] | 0; //@line 14396
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(16) | 0; //@line 14397
 $11 = FUNCTION_TABLE_ii[$10 & 31]($4) | 0; //@line 14398
 if (!___async) {
  HEAP32[___async_retval >> 2] = $11; //@line 14402
  ___async_unwind = 0; //@line 14403
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 54; //@line 14405
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 14407
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $AsyncRetVal; //@line 14409
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $6; //@line 14411
 sp = STACKTOP; //@line 14412
 return;
}
function __ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb_85($0) {
 $0 = $0 | 0;
 var $2 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 5665
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5667
 if ((HEAP32[459] | 0) == ($2 | 0)) {
  HEAP32[459] = 0; //@line 5671
 }
 if ((HEAP32[460] | 0) == ($2 | 0)) {
  HEAP32[460] = 0; //@line 5676
 }
 if ((HEAP32[461] | 0) == ($2 | 0)) {
  HEAP32[461] = 0; //@line 5681
 }
 $6 = HEAP32[2213] | 0; //@line 5683
 if (!$6) {
  HEAP32[2213] = 8856; //@line 5686
  return;
 }
 if (($6 | 0) == 8856) {
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 5693
 _mbed_assert_internal(5235, 5255, 93); //@line 5694
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 135; //@line 5697
  sp = STACKTOP; //@line 5698
  return;
 }
 ___async_unwind = 0; //@line 5701
 HEAP32[$ReallocAsyncCtx >> 2] = 135; //@line 5702
 sp = STACKTOP; //@line 5703
 return;
}
function ___dynamic_cast__async_cb_7($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 13
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 15
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 21
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 36
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 52
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 57
    break;
   }
  default:
   {
    $$0 = 0; //@line 61
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 66
 return;
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 10455
 STACKTOP = STACKTOP + 256 | 0; //@line 10456
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 10456
 $5 = sp; //@line 10457
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 10463
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 10467
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 10470
   $$011 = $9; //@line 10471
   do {
    _out_670($0, $5, 256); //@line 10473
    $$011 = $$011 + -256 | 0; //@line 10474
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 10483
  } else {
   $$0$lcssa = $9; //@line 10485
  }
  _out_670($0, $5, $$0$lcssa); //@line 10487
 }
 STACKTOP = sp; //@line 10489
 return;
}
function __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb_14($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 442
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 446
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 448
 if (!(HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP32[$4 >> 2] = 0; //@line 451
 } else {
  HEAP32[$4 >> 2] = HEAP32[2210]; //@line 454
  HEAP32[2210] = $6; //@line 455
 }
 $9 = HEAP32[2211] | 0; //@line 457
 if (!$9) {
  HEAP32[2211] = 8848; //@line 460
  return;
 }
 if (($9 | 0) == 8848) {
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 467
 _mbed_assert_internal(5235, 5255, 93); //@line 468
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 88; //@line 471
  sp = STACKTOP; //@line 472
  return;
 }
 ___async_unwind = 0; //@line 475
 HEAP32[$ReallocAsyncCtx >> 2] = 88; //@line 476
 sp = STACKTOP; //@line 477
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_80($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 5476
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5478
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5480
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5482
 $8 = HEAP32[(HEAP32[$2 >> 2] | 0) + 92 >> 2] | 0; //@line 5485
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 5486
 $9 = FUNCTION_TABLE_ii[$8 & 31]($4) | 0; //@line 5487
 if (!___async) {
  HEAP32[___async_retval >> 2] = $9; //@line 5491
  ___async_unwind = 0; //@line 5492
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 74; //@line 5494
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $AsyncRetVal; //@line 5496
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $4; //@line 5498
 HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $2; //@line 5500
 sp = STACKTOP; //@line 5501
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb_10($0) {
 $0 = $0 | 0;
 var $4 = 0, $8 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 304
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 308
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 310
 $8 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 84 >> 2] | 0; //@line 313
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 314
 FUNCTION_TABLE_vi[$8 & 255]($4); //@line 315
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 109; //@line 318
  $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 319
  HEAP32[$9 >> 2] = $AsyncRetVal; //@line 320
  sp = STACKTOP; //@line 321
  return;
 }
 ___async_unwind = 0; //@line 324
 HEAP32[$ReallocAsyncCtx3 >> 2] = 109; //@line 325
 $9 = $ReallocAsyncCtx3 + 4 | 0; //@line 326
 HEAP32[$9 >> 2] = $AsyncRetVal; //@line 327
 sp = STACKTOP; //@line 328
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_24($0) {
 $0 = $0 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1977
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1981
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 1983
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 1985
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 1987
 $13 = HEAP32[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 84 >> 2] | 0; //@line 1990
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(16) | 0; //@line 1991
 FUNCTION_TABLE_vi[$13 & 255]($4); //@line 1992
 if (!___async) {
  ___async_unwind = 0; //@line 1995
 }
 HEAP32[$ReallocAsyncCtx3 >> 2] = 113; //@line 1997
 HEAP32[$ReallocAsyncCtx3 + 4 >> 2] = $6; //@line 1999
 HEAP32[$ReallocAsyncCtx3 + 8 >> 2] = $8; //@line 2001
 HEAP32[$ReallocAsyncCtx3 + 12 >> 2] = $10; //@line 2003
 sp = STACKTOP; //@line 2004
 return;
}
function __ZN4mbed6StreamD2Ev($0) {
 $0 = $0 | 0;
 var $3 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2407
 HEAP32[$0 >> 2] = 916; //@line 2408
 HEAP32[$0 + 4 >> 2] = 1012; //@line 2410
 $3 = HEAP32[$0 + 20 >> 2] | 0; //@line 2412
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 2413
 _fclose($3) | 0; //@line 2414
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 94; //@line 2417
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 2419
  sp = STACKTOP; //@line 2420
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 2423
 $AsyncCtx2 = _emscripten_alloc_async_context(4, sp) | 0; //@line 2425
 __ZN4mbed8FileBaseD2Ev($0 + 4 | 0); //@line 2426
 if (___async) {
  HEAP32[$AsyncCtx2 >> 2] = 95; //@line 2429
  sp = STACKTOP; //@line 2430
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx2 | 0); //@line 2433
  return;
 }
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7420
 STACKTOP = STACKTOP + 32 | 0; //@line 7421
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 7421
 $vararg_buffer = sp; //@line 7422
 $3 = sp + 20 | 0; //@line 7423
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 7427
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 7429
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 7431
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 7433
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 7435
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 7440
  $10 = -1; //@line 7441
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 7444
 }
 STACKTOP = sp; //@line 7446
 return $10 | 0; //@line 7446
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 3018
 STACKTOP = STACKTOP + 16 | 0; //@line 3019
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3019
 $vararg_buffer = sp; //@line 3020
 HEAP32[$vararg_buffer >> 2] = $0; //@line 3021
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 3023
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 3025
 _mbed_error_printf(5023, $vararg_buffer); //@line 3026
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3027
 _mbed_die(); //@line 3028
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 115; //@line 3031
  sp = STACKTOP; //@line 3032
  STACKTOP = sp; //@line 3033
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3035
  STACKTOP = sp; //@line 3036
  return;
 }
}
function _sprintf($0, $1, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $varargs = $varargs | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11796
 STACKTOP = STACKTOP + 16 | 0; //@line 11797
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 11797
 $2 = sp; //@line 11798
 HEAP32[$2 >> 2] = $varargs; //@line 11799
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 11800
 $3 = _vsprintf($0, $1, $2) | 0; //@line 11801
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 167; //@line 11804
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 11806
  sp = STACKTOP; //@line 11807
  STACKTOP = sp; //@line 11808
  return 0; //@line 11808
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11810
  STACKTOP = sp; //@line 11811
  return $3 | 0; //@line 11811
 }
 return 0; //@line 11813
}
function __ZN15GraphicsDisplay3clsEv__async_cb_2($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 14418
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14420
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14422
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14424
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 14426
 $10 = HEAPU16[$2 + 30 >> 1] | 0; //@line 14429
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 14430
 FUNCTION_TABLE_viiiiii[$6 & 7]($2, 0, 0, $4, $AsyncRetVal, $10); //@line 14431
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 55; //@line 14434
  sp = STACKTOP; //@line 14435
  return;
 }
 ___async_unwind = 0; //@line 14438
 HEAP32[$ReallocAsyncCtx3 >> 2] = 55; //@line 14439
 sp = STACKTOP; //@line 14440
 return;
}
function __ZN11TextDisplay3clsEv__async_cb_81($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 5507
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5511
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5513
 if ((Math_imul(HEAP32[___async_retval >> 2] | 0, HEAP32[$0 + 4 >> 2] | 0) | 0) <= 0) {
  return;
 }
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(20) | 0; //@line 5521
 __ZN4mbed6Stream4putcEi($4, 32) | 0; //@line 5522
 if (!___async) {
  ___async_unwind = 0; //@line 5525
 }
 HEAP32[$ReallocAsyncCtx6 >> 2] = 75; //@line 5527
 HEAP32[$ReallocAsyncCtx6 + 4 >> 2] = 0; //@line 5529
 HEAP32[$ReallocAsyncCtx6 + 8 >> 2] = $6; //@line 5531
 HEAP32[$ReallocAsyncCtx6 + 12 >> 2] = $4; //@line 5533
 HEAP32[$ReallocAsyncCtx6 + 16 >> 2] = $4; //@line 5535
 sp = STACKTOP; //@line 5536
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 12727
 $5 = HEAP32[$4 >> 2] | 0; //@line 12728
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 12732
   HEAP32[$1 + 24 >> 2] = $3; //@line 12734
   HEAP32[$1 + 36 >> 2] = 1; //@line 12736
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 12740
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 12743
    HEAP32[$1 + 24 >> 2] = 2; //@line 12745
    HEAP8[$1 + 54 >> 0] = 1; //@line 12747
    break;
   }
   $10 = $1 + 24 | 0; //@line 12750
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 12754
   }
  }
 } while (0);
 return;
}
function __ZN4mbed8FileBaseD0Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $7 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4487
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4489
 if (HEAP32[$2 + 12 >> 2] | 0) {
  __ZdlPv($2); //@line 4494
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 4498
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 4499
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 4502
  $7 = $ReallocAsyncCtx3 + 4 | 0; //@line 4503
  HEAP32[$7 >> 2] = $2; //@line 4504
  sp = STACKTOP; //@line 4505
  return;
 }
 ___async_unwind = 0; //@line 4508
 HEAP32[$ReallocAsyncCtx3 >> 2] = 86; //@line 4509
 $7 = $ReallocAsyncCtx3 + 4 | 0; //@line 4510
 HEAP32[$7 >> 2] = $2; //@line 4511
 sp = STACKTOP; //@line 4512
 return;
}
function __ZN15GraphicsDisplayC2EPKc__async_cb_21($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $8 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1735
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 1737
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 1739
 HEAP32[$2 >> 2] = 504; //@line 1740
 HEAP32[$2 + 4 >> 2] = 664; //@line 1742
 __ZN11TextDisplay10foregroundEt($4, -1); //@line 1743
 $8 = HEAP32[(HEAP32[$2 >> 2] | 0) + 116 >> 2] | 0; //@line 1746
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 1747
 FUNCTION_TABLE_vii[$8 & 7]($4, 0); //@line 1748
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 65; //@line 1751
  sp = STACKTOP; //@line 1752
  return;
 }
 ___async_unwind = 0; //@line 1755
 HEAP32[$ReallocAsyncCtx >> 2] = 65; //@line 1756
 sp = STACKTOP; //@line 1757
 return;
}
function __Znwj__async_cb($0) {
 $0 = $0 | 0;
 var $$lcssa = 0, $2 = 0, $3 = 0, $5 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14489
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14491
 $3 = _malloc($2) | 0; //@line 14492
 if (!$3) {
  $5 = __ZSt15get_new_handlerv() | 0; //@line 14495
  if (!$5) {
   $$lcssa = 0; //@line 14498
  } else {
   $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 14500
   FUNCTION_TABLE_v[$5 & 3](); //@line 14501
   if (!___async) {
    ___async_unwind = 0; //@line 14504
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 176; //@line 14506
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 14508
   sp = STACKTOP; //@line 14509
   return;
  }
 } else {
  $$lcssa = $3; //@line 14513
 }
 HEAP32[___async_retval >> 2] = $$lcssa; //@line 14516
 return;
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 13277
 STACKTOP = STACKTOP + 16 | 0; //@line 13278
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13278
 $vararg_buffer = sp; //@line 13279
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 13280
 FUNCTION_TABLE_v[$0 & 3](); //@line 13281
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 191; //@line 13284
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer; //@line 13286
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer; //@line 13288
  sp = STACKTOP; //@line 13289
  STACKTOP = sp; //@line 13290
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 13292
  _abort_message(8688, $vararg_buffer); //@line 13293
 }
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 7601
 $3 = HEAP8[$1 >> 0] | 0; //@line 7602
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 7607
  $$lcssa8 = $2; //@line 7607
 } else {
  $$011 = $1; //@line 7609
  $$0710 = $0; //@line 7609
  do {
   $$0710 = $$0710 + 1 | 0; //@line 7611
   $$011 = $$011 + 1 | 0; //@line 7612
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 7613
   $9 = HEAP8[$$011 >> 0] | 0; //@line 7614
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 7619
  $$lcssa8 = $8; //@line 7619
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 7629
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7553
 STACKTOP = STACKTOP + 32 | 0; //@line 7554
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 7554
 $vararg_buffer = sp; //@line 7555
 HEAP32[$0 + 36 >> 2] = 5; //@line 7558
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 7566
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 7568
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 7570
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 7575
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 7578
 STACKTOP = sp; //@line 7579
 return $14 | 0; //@line 7579
}
function _mbed_die__async_cb_63($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 3925
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3927
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 3929
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 3930
 _wait_ms(150); //@line 3931
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 118; //@line 3934
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 3935
  HEAP32[$4 >> 2] = $2; //@line 3936
  sp = STACKTOP; //@line 3937
  return;
 }
 ___async_unwind = 0; //@line 3940
 HEAP32[$ReallocAsyncCtx14 >> 2] = 118; //@line 3941
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 3942
 HEAP32[$4 >> 2] = $2; //@line 3943
 sp = STACKTOP; //@line 3944
 return;
}
function _mbed_die__async_cb_62($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 3900
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3902
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 3904
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 3905
 _wait_ms(150); //@line 3906
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 119; //@line 3909
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 3910
  HEAP32[$4 >> 2] = $2; //@line 3911
  sp = STACKTOP; //@line 3912
  return;
 }
 ___async_unwind = 0; //@line 3915
 HEAP32[$ReallocAsyncCtx13 >> 2] = 119; //@line 3916
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 3917
 HEAP32[$4 >> 2] = $2; //@line 3918
 sp = STACKTOP; //@line 3919
 return;
}
function _mbed_die__async_cb_61($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 3875
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3877
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 3879
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 3880
 _wait_ms(150); //@line 3881
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 120; //@line 3884
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 3885
  HEAP32[$4 >> 2] = $2; //@line 3886
  sp = STACKTOP; //@line 3887
  return;
 }
 ___async_unwind = 0; //@line 3890
 HEAP32[$ReallocAsyncCtx12 >> 2] = 120; //@line 3891
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 3892
 HEAP32[$4 >> 2] = $2; //@line 3893
 sp = STACKTOP; //@line 3894
 return;
}
function _mbed_die__async_cb_60($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 3850
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3852
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 3854
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 3855
 _wait_ms(150); //@line 3856
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 121; //@line 3859
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 3860
  HEAP32[$4 >> 2] = $2; //@line 3861
  sp = STACKTOP; //@line 3862
  return;
 }
 ___async_unwind = 0; //@line 3865
 HEAP32[$ReallocAsyncCtx11 >> 2] = 121; //@line 3866
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 3867
 HEAP32[$4 >> 2] = $2; //@line 3868
 sp = STACKTOP; //@line 3869
 return;
}
function _mbed_die__async_cb_59($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 3825
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3827
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 3829
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 3830
 _wait_ms(150); //@line 3831
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 122; //@line 3834
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 3835
  HEAP32[$4 >> 2] = $2; //@line 3836
  sp = STACKTOP; //@line 3837
  return;
 }
 ___async_unwind = 0; //@line 3840
 HEAP32[$ReallocAsyncCtx10 >> 2] = 122; //@line 3841
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 3842
 HEAP32[$4 >> 2] = $2; //@line 3843
 sp = STACKTOP; //@line 3844
 return;
}
function _mbed_die__async_cb_58($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 3800
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3802
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 3804
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 3805
 _wait_ms(150); //@line 3806
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 123; //@line 3809
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 3810
  HEAP32[$4 >> 2] = $2; //@line 3811
  sp = STACKTOP; //@line 3812
  return;
 }
 ___async_unwind = 0; //@line 3815
 HEAP32[$ReallocAsyncCtx9 >> 2] = 123; //@line 3816
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 3817
 HEAP32[$4 >> 2] = $2; //@line 3818
 sp = STACKTOP; //@line 3819
 return;
}
function _mbed_die__async_cb_57($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 3775
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3777
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 3779
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 3780
 _wait_ms(400); //@line 3781
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 124; //@line 3784
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 3785
  HEAP32[$4 >> 2] = $2; //@line 3786
  sp = STACKTOP; //@line 3787
  return;
 }
 ___async_unwind = 0; //@line 3790
 HEAP32[$ReallocAsyncCtx8 >> 2] = 124; //@line 3791
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 3792
 HEAP32[$4 >> 2] = $2; //@line 3793
 sp = STACKTOP; //@line 3794
 return;
}
function _mbed_die__async_cb_56($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 3750
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3752
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 3754
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 3755
 _wait_ms(400); //@line 3756
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 125; //@line 3759
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 3760
  HEAP32[$4 >> 2] = $2; //@line 3761
  sp = STACKTOP; //@line 3762
  return;
 }
 ___async_unwind = 0; //@line 3765
 HEAP32[$ReallocAsyncCtx7 >> 2] = 125; //@line 3766
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 3767
 HEAP32[$4 >> 2] = $2; //@line 3768
 sp = STACKTOP; //@line 3769
 return;
}
function _mbed_die__async_cb_55($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 3725
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3727
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 3729
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 3730
 _wait_ms(400); //@line 3731
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 126; //@line 3734
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 3735
  HEAP32[$4 >> 2] = $2; //@line 3736
  sp = STACKTOP; //@line 3737
  return;
 }
 ___async_unwind = 0; //@line 3740
 HEAP32[$ReallocAsyncCtx6 >> 2] = 126; //@line 3741
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 3742
 HEAP32[$4 >> 2] = $2; //@line 3743
 sp = STACKTOP; //@line 3744
 return;
}
function _mbed_die__async_cb_54($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 3700
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3702
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 3704
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 3705
 _wait_ms(400); //@line 3706
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 127; //@line 3709
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 3710
  HEAP32[$4 >> 2] = $2; //@line 3711
  sp = STACKTOP; //@line 3712
  return;
 }
 ___async_unwind = 0; //@line 3715
 HEAP32[$ReallocAsyncCtx5 >> 2] = 127; //@line 3716
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 3717
 HEAP32[$4 >> 2] = $2; //@line 3718
 sp = STACKTOP; //@line 3719
 return;
}
function _mbed_die__async_cb_53($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 3675
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3677
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 3679
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 3680
 _wait_ms(400); //@line 3681
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 128; //@line 3684
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 3685
  HEAP32[$4 >> 2] = $2; //@line 3686
  sp = STACKTOP; //@line 3687
  return;
 }
 ___async_unwind = 0; //@line 3690
 HEAP32[$ReallocAsyncCtx4 >> 2] = 128; //@line 3691
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 3692
 HEAP32[$4 >> 2] = $2; //@line 3693
 sp = STACKTOP; //@line 3694
 return;
}
function _mbed_die__async_cb_52($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 3650
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3652
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 3654
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 3655
 _wait_ms(400); //@line 3656
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 129; //@line 3659
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 3660
  HEAP32[$4 >> 2] = $2; //@line 3661
  sp = STACKTOP; //@line 3662
  return;
 }
 ___async_unwind = 0; //@line 3665
 HEAP32[$ReallocAsyncCtx3 >> 2] = 129; //@line 3666
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 3667
 HEAP32[$4 >> 2] = $2; //@line 3668
 sp = STACKTOP; //@line 3669
 return;
}
function _mbed_die__async_cb_51($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 3625
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3627
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 3629
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 3630
 _wait_ms(400); //@line 3631
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 130; //@line 3634
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 3635
  HEAP32[$4 >> 2] = $2; //@line 3636
  sp = STACKTOP; //@line 3637
  return;
 }
 ___async_unwind = 0; //@line 3640
 HEAP32[$ReallocAsyncCtx2 >> 2] = 130; //@line 3641
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 3642
 HEAP32[$4 >> 2] = $2; //@line 3643
 sp = STACKTOP; //@line 3644
 return;
}
function _mbed_die__async_cb_50($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3600
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3602
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 3604
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 3605
 _wait_ms(400); //@line 3606
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 131; //@line 3609
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 3610
  HEAP32[$4 >> 2] = $2; //@line 3611
  sp = STACKTOP; //@line 3612
  return;
 }
 ___async_unwind = 0; //@line 3615
 HEAP32[$ReallocAsyncCtx >> 2] = 131; //@line 3616
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 3617
 HEAP32[$4 >> 2] = $2; //@line 3618
 sp = STACKTOP; //@line 3619
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 276
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 278
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 280
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 282
 $8 = HEAP32[$2 + 20 >> 2] | 0; //@line 284
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(16) | 0; //@line 285
 _fflush($8) | 0; //@line 286
 if (!___async) {
  ___async_unwind = 0; //@line 289
 }
 HEAP32[$ReallocAsyncCtx4 >> 2] = 107; //@line 291
 HEAP32[$ReallocAsyncCtx4 + 4 >> 2] = $2; //@line 293
 HEAP32[$ReallocAsyncCtx4 + 8 >> 2] = $4; //@line 295
 HEAP32[$ReallocAsyncCtx4 + 12 >> 2] = $6; //@line 297
 sp = STACKTOP; //@line 298
 return;
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 7136
 newDynamicTop = oldDynamicTop + increment | 0; //@line 7137
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 7141
  ___setErrNo(12); //@line 7142
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 7146
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 7150
   ___setErrNo(12); //@line 7151
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 7155
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 10316
 } else {
  $$056 = $2; //@line 10318
  $15 = $1; //@line 10318
  $8 = $0; //@line 10318
  while (1) {
   $14 = $$056 + -1 | 0; //@line 10326
   HEAP8[$14 >> 0] = HEAPU8[6351 + ($8 & 15) >> 0] | 0 | $3; //@line 10327
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 10328
   $15 = tempRet0; //@line 10329
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 10334
    break;
   } else {
    $$056 = $14; //@line 10337
   }
  }
 }
 return $$05$lcssa | 0; //@line 10341
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 7724
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 7726
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 7732
  $11 = ___fwritex($0, $4, $3) | 0; //@line 7733
  if ($phitmp) {
   $13 = $11; //@line 7735
  } else {
   ___unlockfile($3); //@line 7737
   $13 = $11; //@line 7738
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 7742
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 7746
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 7749
 }
 return $15 | 0; //@line 7751
}
function __ZN15GraphicsDisplay4putpEi__async_cb($0) {
 $0 = $0 | 0;
 var $15 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14455
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14457
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 14459
 $8 = (HEAP16[$2 >> 1] | 0) + 1 << 16 >> 16; //@line 14461
 HEAP16[$2 >> 1] = $8; //@line 14462
 if ($8 << 16 >> 16 <= (HEAP16[$4 + 42 >> 1] | 0)) {
  return;
 }
 HEAP16[$2 >> 1] = HEAP16[$4 + 40 >> 1] | 0; //@line 14471
 $15 = (HEAP16[$6 >> 1] | 0) + 1 << 16 >> 16; //@line 14473
 HEAP16[$6 >> 1] = $15; //@line 14474
 if ($15 << 16 >> 16 <= (HEAP16[$4 + 46 >> 1] | 0)) {
  return;
 }
 HEAP16[$6 >> 1] = HEAP16[$4 + 44 >> 1] | 0; //@line 14483
 return;
}
function __ZSt9terminatev() {
 var $0 = 0, $16 = 0, $17 = 0, $2 = 0, $5 = 0, sp = 0;
 sp = STACKTOP; //@line 13242
 $0 = ___cxa_get_globals_fast() | 0; //@line 13243
 if ($0 | 0) {
  $2 = HEAP32[$0 >> 2] | 0; //@line 13246
  if ($2 | 0) {
   $5 = $2 + 48 | 0; //@line 13250
   if ((HEAP32[$5 >> 2] & -256 | 0) == 1126902528 ? (HEAP32[$5 + 4 >> 2] | 0) == 1129074247 : 0) {
    $16 = HEAP32[$2 + 12 >> 2] | 0; //@line 13262
    _emscripten_alloc_async_context(4, sp) | 0; //@line 13263
    __ZSt11__terminatePFvvE($16); //@line 13264
   }
  }
 }
 $17 = __ZSt13get_terminatev() | 0; //@line 13269
 _emscripten_alloc_async_context(4, sp) | 0; //@line 13270
 __ZSt11__terminatePFvvE($17); //@line 13271
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 7879
 $3 = HEAP8[$1 >> 0] | 0; //@line 7881
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 7885
 $7 = HEAP32[$0 >> 2] | 0; //@line 7886
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 7891
  HEAP32[$0 + 4 >> 2] = 0; //@line 7893
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 7895
  HEAP32[$0 + 28 >> 2] = $14; //@line 7897
  HEAP32[$0 + 20 >> 2] = $14; //@line 7899
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 7905
  $$0 = 0; //@line 7906
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 7909
  $$0 = -1; //@line 7910
 }
 return $$0 | 0; //@line 7912
}
function __ZN6C128327columnsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 576
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 124 >> 2] | 0; //@line 579
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 580
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 581
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 43; //@line 584
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 586
  sp = STACKTOP; //@line 587
  return 0; //@line 588
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 590
  return ($4 | 0) / (HEAPU8[(HEAP32[$0 + 48 >> 2] | 0) + 1 >> 0] | 0 | 0) | 0 | 0; //@line 597
 }
 return 0; //@line 599
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 10353
 } else {
  $$06 = $2; //@line 10355
  $11 = $1; //@line 10355
  $7 = $0; //@line 10355
  while (1) {
   $10 = $$06 + -1 | 0; //@line 10360
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 10361
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 10362
   $11 = tempRet0; //@line 10363
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 10368
    break;
   } else {
    $$06 = $10; //@line 10371
   }
  }
 }
 return $$0$lcssa | 0; //@line 10375
}
function __ZN6C128324rowsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 548
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 551
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 552
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 553
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 42; //@line 556
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 558
  sp = STACKTOP; //@line 559
  return 0; //@line 560
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 562
  return ($4 | 0) / (HEAPU8[(HEAP32[$0 + 48 >> 2] | 0) + 2 >> 0] | 0 | 0) | 0 | 0; //@line 569
 }
 return 0; //@line 571
}
function ___fmodeflags($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$0$ = 0, $$2 = 0, $$2$ = 0, $$4 = 0, $2 = 0, $3 = 0, $6 = 0, $9 = 0;
 $2 = (_strchr($0, 43) | 0) == 0; //@line 8223
 $3 = HEAP8[$0 >> 0] | 0; //@line 8224
 $$0 = $2 ? $3 << 24 >> 24 != 114 & 1 : 2; //@line 8227
 $6 = (_strchr($0, 120) | 0) == 0; //@line 8229
 $$0$ = $6 ? $$0 : $$0 | 128; //@line 8231
 $9 = (_strchr($0, 101) | 0) == 0; //@line 8233
 $$2 = $9 ? $$0$ : $$0$ | 524288; //@line 8235
 $$2$ = $3 << 24 >> 24 == 114 ? $$2 : $$2 | 64; //@line 8238
 $$4 = $3 << 24 >> 24 == 119 ? $$2$ | 512 : $$2$; //@line 8241
 return ($3 << 24 >> 24 == 97 ? $$4 | 1024 : $$4) | 0; //@line 8245
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 14127
 do {
  if (!$0) {
   $3 = 0; //@line 14131
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 14133
   $2 = ___dynamic_cast($0, 232, 288, 0) | 0; //@line 14134
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 205; //@line 14137
    sp = STACKTOP; //@line 14138
    return 0; //@line 14139
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 14141
    $3 = ($2 | 0) != 0 & 1; //@line 14144
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 14149
}
function __ZN4mbed8FileBaseD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 4838
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 4840
 if (HEAP32[$2 + 12 >> 2] | 0) {
  return;
 }
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 4848
 __ZN4mbed17remove_filehandleEPNS_10FileHandleE($2 + -4 | 0); //@line 4849
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 83; //@line 4852
  sp = STACKTOP; //@line 4853
  return;
 }
 ___async_unwind = 0; //@line 4856
 HEAP32[$ReallocAsyncCtx3 >> 2] = 83; //@line 4857
 sp = STACKTOP; //@line 4858
 return;
}
function _invoke_ticker__async_cb_92($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 6405
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 6411
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 6412
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 6413
 FUNCTION_TABLE_vi[$5 & 255]($6); //@line 6414
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 133; //@line 6417
  sp = STACKTOP; //@line 6418
  return;
 }
 ___async_unwind = 0; //@line 6421
 HEAP32[$ReallocAsyncCtx >> 2] = 133; //@line 6422
 sp = STACKTOP; //@line 6423
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 9997
 } else {
  $$04 = 0; //@line 9999
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 10002
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 10006
   $12 = $7 + 1 | 0; //@line 10007
   HEAP32[$0 >> 2] = $12; //@line 10008
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 10014
    break;
   } else {
    $$04 = $11; //@line 10017
   }
  }
 }
 return $$0$lcssa | 0; //@line 10021
}
function __ZN15GraphicsDisplay9characterEiii($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1028
 $6 = HEAP32[(HEAP32[$0 >> 2] | 0) + 148 >> 2] | 0; //@line 1031
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1036
 FUNCTION_TABLE_viiiiii[$6 & 7]($0, $1 << 3, $2 << 3, 8, 8, 3834 + ($3 + -31 << 3) | 0); //@line 1037
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 50; //@line 1040
  sp = STACKTOP; //@line 1041
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1044
  return;
 }
}
function __ZN4mbed10FileHandle5lseekEii($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $5 = 0, $6 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 69
 $5 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 72
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 73
 $6 = FUNCTION_TABLE_iiii[$5 & 15]($0, $1, $2) | 0; //@line 74
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 33; //@line 77
  sp = STACKTOP; //@line 78
  return 0; //@line 79
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 81
  return $6 | 0; //@line 82
 }
 return 0; //@line 84
}
function __ZN15GraphicsDisplay7columnsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1072
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 124 >> 2] | 0; //@line 1075
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1076
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 1077
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 52; //@line 1080
  sp = STACKTOP; //@line 1081
  return 0; //@line 1082
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1084
  return ($4 | 0) / 8 | 0 | 0; //@line 1086
 }
 return 0; //@line 1088
}
function __ZN15GraphicsDisplay4rowsEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1051
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 128 >> 2] | 0; //@line 1054
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1055
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 1056
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 51; //@line 1059
  sp = STACKTOP; //@line 1060
  return 0; //@line 1061
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1063
  return ($4 | 0) / 8 | 0 | 0; //@line 1065
 }
 return 0; //@line 1067
}
function __ZN4mbed10FileHandle4tellEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2307
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 2310
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2311
 $4 = FUNCTION_TABLE_iiii[$3 & 15]($0, 0, 1) | 0; //@line 2312
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 89; //@line 2315
  sp = STACKTOP; //@line 2316
  return 0; //@line 2317
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2319
  return $4 | 0; //@line 2320
 }
 return 0; //@line 2322
}
function _fclose__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4370
 $6 = HEAP8[$0 + 12 >> 0] & 1; //@line 4373
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 4375
 $10 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 4378
 $12 = HEAP32[$4 + 92 >> 2] | 0; //@line 4380
 if ($12 | 0) {
  _free($12); //@line 4383
 }
 if ($6) {
  if ($8 | 0) {
   ___unlockfile($4); //@line 4388
  }
 } else {
  _free($4); //@line 4391
 }
 HEAP32[___async_retval >> 2] = $10; //@line 4394
 return;
}
function __ZN4mbed10FileHandle4flenEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 109
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 40 >> 2] | 0; //@line 112
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 113
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 114
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 35; //@line 117
  sp = STACKTOP; //@line 118
  return 0; //@line 119
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 121
  return $4 | 0; //@line 122
 }
 return 0; //@line 124
}
function _mbed_die__async_cb_64($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 3950
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3952
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 3954
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 3955
 _wait_ms(150); //@line 3956
 if (!___async) {
  ___async_unwind = 0; //@line 3959
 }
 HEAP32[$ReallocAsyncCtx15 >> 2] = 117; //@line 3961
 HEAP32[$ReallocAsyncCtx15 + 4 >> 2] = $2; //@line 3963
 sp = STACKTOP; //@line 3964
 return;
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 3580
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 3582
 _emscripten_asm_const_iii(3, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 3584
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 3585
 _wait_ms(150); //@line 3586
 if (!___async) {
  ___async_unwind = 0; //@line 3589
 }
 HEAP32[$ReallocAsyncCtx16 >> 2] = 116; //@line 3591
 HEAP32[$ReallocAsyncCtx16 + 4 >> 2] = $2; //@line 3593
 sp = STACKTOP; //@line 3594
 return;
}
function __ZN4mbed10FileHandle5fsyncEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 89
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 24 >> 2] | 0; //@line 92
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 93
 $4 = FUNCTION_TABLE_ii[$3 & 31]($0) | 0; //@line 94
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 34; //@line 97
  sp = STACKTOP; //@line 98
  return 0; //@line 99
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 101
  return $4 | 0; //@line 102
 }
 return 0; //@line 104
}
function __ZN4mbed6StreamD2Ev__async_cb($0) {
 $0 = $0 | 0;
 var $3 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 4455
 $3 = (HEAP32[$0 + 4 >> 2] | 0) + 4 | 0; //@line 4458
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 4459
 __ZN4mbed8FileBaseD2Ev($3); //@line 4460
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 4463
  sp = STACKTOP; //@line 4464
  return;
 }
 ___async_unwind = 0; //@line 4467
 HEAP32[$ReallocAsyncCtx2 >> 2] = 95; //@line 4468
 sp = STACKTOP; //@line 4469
 return;
}
function ___fflush_unlocked__async_cb_93($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6505
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6507
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6509
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6511
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 6513
 HEAP32[$4 >> 2] = 0; //@line 6514
 HEAP32[$6 >> 2] = 0; //@line 6515
 HEAP32[$8 >> 2] = 0; //@line 6516
 HEAP32[$10 >> 2] = 0; //@line 6517
 HEAP32[___async_retval >> 2] = 0; //@line 6519
 return;
}
function __ZN6C128325_putcEi__async_cb($0) {
 $0 = $0 | 0;
 var $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6234
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6236
 if ((HEAP32[$0 + 8 >> 2] | 0) >>> 0 < ((HEAP32[___async_retval >> 2] | 0) - (HEAPU8[(HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) + 2 >> 0] | 0) | 0) >>> 0) {
  $16 = ___async_retval; //@line 6246
  HEAP32[$16 >> 2] = $6; //@line 6247
  return;
 }
 HEAP32[$8 >> 2] = 0; //@line 6250
 $16 = ___async_retval; //@line 6251
 HEAP32[$16 >> 2] = $6; //@line 6252
 return;
}
function __ZN6C128325_putcEi__async_cb_90($0) {
 $0 = $0 | 0;
 var $16 = 0, $2 = 0, $4 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 6260
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6262
 if (!(HEAP32[$2 + 4168 >> 2] | 0)) {
  $16 = ___async_retval; //@line 6267
  HEAP32[$16 >> 2] = $4; //@line 6268
  return;
 }
 _emscripten_asm_const_iiiii(0, HEAP32[$2 + 4172 >> 2] | 0, HEAP32[$2 + 4176 >> 2] | 0, HEAP32[$2 + 4180 >> 2] | 0, $2 + 68 | 0) | 0; //@line 6278
 $16 = ___async_retval; //@line 6279
 HEAP32[$16 >> 2] = $4; //@line 6280
 return;
}
function __ZThn4_N4mbed6StreamD1Ev__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 405
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 407
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 408
 __ZN4mbed8FileBaseD2Ev($2); //@line 409
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 103; //@line 412
  sp = STACKTOP; //@line 413
  return;
 }
 ___async_unwind = 0; //@line 416
 HEAP32[$ReallocAsyncCtx2 >> 2] = 103; //@line 417
 sp = STACKTOP; //@line 418
 return;
}
function _vsprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11820
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 11821
 $3 = _vsnprintf($0, 2147483647, $1, $2) | 0; //@line 11822
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 168; //@line 11825
  sp = STACKTOP; //@line 11826
  return 0; //@line 11827
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 11829
  return $3 | 0; //@line 11830
 }
 return 0; //@line 11832
}
function ___unlist_locked_file($0) {
 $0 = $0 | 0;
 var $$pre = 0, $$sink = 0, $10 = 0, $5 = 0;
 if (HEAP32[$0 + 68 >> 2] | 0) {
  $5 = HEAP32[$0 + 116 >> 2] | 0; //@line 7762
  $$pre = $0 + 112 | 0; //@line 7765
  if ($5 | 0) {
   HEAP32[$5 + 112 >> 2] = HEAP32[$$pre >> 2]; //@line 7769
  }
  $10 = HEAP32[$$pre >> 2] | 0; //@line 7771
  if (!$10) {
   $$sink = (___pthread_self_699() | 0) + 232 | 0; //@line 7776
  } else {
   $$sink = $10 + 116 | 0; //@line 7779
  }
  HEAP32[$$sink >> 2] = $5; //@line 7781
 }
 return;
}
function __ZThn4_N6C12832D0Ev($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 719
 $1 = $0 + -4 | 0; //@line 720
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 721
 __ZN4mbed6StreamD2Ev($1); //@line 722
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 45; //@line 725
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 727
  sp = STACKTOP; //@line 728
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 731
  __ZdlPv($1); //@line 732
  return;
 }
}
function __ZN4mbed6StreamC2EPKc__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0, $AsyncRetVal = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 14601
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 14605
 HEAP32[HEAP32[$0 + 4 >> 2] >> 2] = $AsyncRetVal; //@line 14606
 if (!$AsyncRetVal) {
  HEAP32[$4 >> 2] = HEAP32[(___errno_location() | 0) >> 2]; //@line 14611
  _error(4992, $4); //@line 14612
  return;
 } else {
  __ZN4mbed26mbed_set_unbuffered_streamEP8_IO_FILE($AsyncRetVal); //@line 14615
  return;
 }
}
function __ZN4mbed10FileHandle6rewindEv($0) {
 $0 = $0 | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 2327
 $3 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 2330
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 2331
 FUNCTION_TABLE_iiii[$3 & 15]($0, 0, 0) | 0; //@line 2332
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 90; //@line 2335
  sp = STACKTOP; //@line 2336
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 2339
  return;
 }
}
function __ZN15GraphicsDisplay6windowEiiii($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $5 = 0, $7 = 0;
 $5 = $1 & 65535; //@line 1156
 HEAP16[$0 + 36 >> 1] = $5; //@line 1158
 $7 = $2 & 65535; //@line 1159
 HEAP16[$0 + 38 >> 1] = $7; //@line 1161
 HEAP16[$0 + 40 >> 1] = $5; //@line 1163
 HEAP16[$0 + 42 >> 1] = $1 + 65535 + $3; //@line 1168
 HEAP16[$0 + 44 >> 1] = $7; //@line 1170
 HEAP16[$0 + 46 >> 1] = $2 + 65535 + $4; //@line 1175
 return;
}
function _emscripten_async_resume() {
 ___async = 0; //@line 6987
 ___async_unwind = 1; //@line 6988
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 6994
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 6998
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 7002
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 7004
 }
}
function __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6308
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 6310
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 6312
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 6314
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 48 >> 2] = 2006; //@line 6316
 _emscripten_asm_const_iiiii(0, HEAP32[$4 >> 2] | 0, HEAP32[$6 >> 2] | 0, HEAP32[$8 >> 2] | 0, $10 | 0) | 0; //@line 6320
 return;
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 7290
 STACKTOP = STACKTOP + 16 | 0; //@line 7291
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 7291
 $vararg_buffer = sp; //@line 7292
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 7296
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 7298
 STACKTOP = sp; //@line 7299
 return $5 | 0; //@line 7299
}
function _freopen__async_cb_29($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 2385
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 2387
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 2388
 _fclose($2) | 0; //@line 2389
 if (!___async) {
  ___async_unwind = 0; //@line 2392
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 172; //@line 2394
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $2; //@line 2396
 sp = STACKTOP; //@line 2397
 return;
}
function _error($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var sp = 0;
 sp = STACKTOP; //@line 3360
 STACKTOP = STACKTOP + 16 | 0; //@line 3361
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 3361
 if (!(HEAP8[13632] | 0)) {
  HEAP8[13632] = 1; //@line 3366
  HEAP32[sp >> 2] = $varargs; //@line 3367
  _emscripten_alloc_async_context(4, sp) | 0; //@line 3368
  _exit(1); //@line 3369
 } else {
  STACKTOP = sp; //@line 3372
  return;
 }
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 6929
 STACKTOP = STACKTOP + 16 | 0; //@line 6930
 $rem = __stackBase__ | 0; //@line 6931
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 6932
 STACKTOP = __stackBase__; //@line 6933
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 6934
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 6699
 if ((ret | 0) < 8) return ret | 0; //@line 6700
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 6701
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 6702
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 6703
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 6704
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 6705
}
function __Znaj($0) {
 $0 = $0 | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 12329
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 12330
 $1 = __Znwj($0) | 0; //@line 12331
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 177; //@line 12334
  sp = STACKTOP; //@line 12335
  return 0; //@line 12336
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 12338
  return $1 | 0; //@line 12339
 }
 return 0; //@line 12341
}
function __ZN6C12832D0Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 48
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 49
 __ZN4mbed6StreamD2Ev($0); //@line 50
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 32; //@line 53
  HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 55
  sp = STACKTOP; //@line 56
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 59
  __ZdlPv($0); //@line 60
  return;
 }
}
function ___cxa_get_globals_fast() {
 var $3 = 0, sp = 0;
 sp = STACKTOP; //@line 12463
 STACKTOP = STACKTOP + 16 | 0; //@line 12464
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 12464
 if (!(_pthread_once(13620, 3) | 0)) {
  $3 = _pthread_getspecific(HEAP32[3406] | 0) | 0; //@line 12470
  STACKTOP = sp; //@line 12471
  return $3 | 0; //@line 12471
 } else {
  _abort_message(8536, sp); //@line 12473
 }
 return 0; //@line 12476
}
function _exit($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3514
 do {
  if ($0 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3518
   _mbed_die(); //@line 3519
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 136; //@line 3522
    sp = STACKTOP; //@line 3523
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 3526
    break;
   }
  }
 } while (0);
 while (1) {}
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 12631
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
  HEAP8[($2 << 7) + $1 + ($0 + 68) >> 0] = ($3 | 0) != 0 & 1; //@line 650
  return;
 }
 $17 = ($2 << 7) + $1 + ($0 + 68) | 0; //@line 656
 if (($3 | 0) != 1) {
  return;
 }
 HEAP8[$17 >> 0] = HEAP8[$17 >> 0] ^ 1; //@line 662
 return;
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 11779
 $6 = HEAP32[$5 >> 2] | 0; //@line 11780
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 11781
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 11783
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 11785
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 11788
 return $2 | 0; //@line 11789
}
function _abort_message__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 14716
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14718
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 14719
 _fputc(10, $2) | 0; //@line 14720
 if (!___async) {
  ___async_unwind = 0; //@line 14723
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 181; //@line 14725
 sp = STACKTOP; //@line 14726
 return;
}
function __ZL25default_terminate_handlerv__async_cb_76($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $AsyncRetVal = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 5008
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5010
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5012
 HEAP32[$2 >> 2] = 8397; //@line 5013
 HEAP32[$2 + 4 >> 2] = $4; //@line 5015
 HEAP32[$2 + 8 >> 2] = $AsyncRetVal; //@line 5017
 _abort_message(8261, $2); //@line 5018
}
function __GLOBAL__sub_I_main_cpp() {
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3616
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3617
 __ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc(8860, 9, 7, 8, 6, 18, 5729); //@line 3618
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 140; //@line 3621
  sp = STACKTOP; //@line 3622
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3625
  return;
 }
}
function _setvbuf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $4 = 0;
 $4 = $0 + 75 | 0; //@line 12101
 HEAP8[$4 >> 0] = -1; //@line 12102
 switch ($2 | 0) {
 case 2:
  {
   HEAP32[$0 + 48 >> 2] = 0; //@line 12106
   break;
  }
 case 1:
  {
   HEAP8[$4 >> 0] = 10; //@line 12110
   break;
  }
 default:
  {}
 }
 HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 64; //@line 12118
 return 0; //@line 12119
}
function __ZN11TextDisplayC2EPKc__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0, $6 = 0, $AsyncRetVal = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 5191
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 5193
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 5197
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 32 >> 2] = $AsyncRetVal; //@line 5199
 HEAP32[$4 >> 2] = $6; //@line 5200
 _sprintf($AsyncRetVal, 4771, $4) | 0; //@line 5201
 return;
}
function __ZThn4_N15GraphicsDisplayD1Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1485
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1487
 __ZN4mbed6StreamD2Ev($0 + -4 | 0); //@line 1488
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 63; //@line 1491
  sp = STACKTOP; //@line 1492
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1495
  return;
 }
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 14524
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 14535
  $$0 = 1; //@line 14536
 } else {
  $$0 = 0; //@line 14538
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 14542
 return;
}
function __ZThn4_N11TextDisplayD1Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1917
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1919
 __ZN4mbed6StreamD2Ev($0 + -4 | 0); //@line 1920
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 78; //@line 1923
  sp = STACKTOP; //@line 1924
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1927
  return;
 }
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 13225
 STACKTOP = STACKTOP + 16 | 0; //@line 13226
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13226
 _free($0); //@line 13228
 if (!(_pthread_setspecific(HEAP32[3406] | 0, 0) | 0)) {
  STACKTOP = sp; //@line 13233
  return;
 } else {
  _abort_message(8635, sp); //@line 13235
 }
}
function _wait($0) {
 $0 = +$0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3582
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3586
 _emscripten_sleep((~~($0 * 1.0e6) | 0) / 1e3 | 0 | 0); //@line 3587
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 138; //@line 3590
  sp = STACKTOP; //@line 3591
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3594
  return;
 }
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 738
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 741
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 746
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 749
 return;
}
function __ZThn4_N6C12832D1Ev($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 702
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 704
 __ZN4mbed6StreamD2Ev($0 + -4 | 0); //@line 705
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 44; //@line 708
  sp = STACKTOP; //@line 709
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 712
  return;
 }
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 12707
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 3601
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 3602
 _emscripten_sleep($0 | 0); //@line 3603
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 139; //@line 3606
  sp = STACKTOP; //@line 3607
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 3610
  return;
 }
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var sp = 0;
 sp = STACKTOP; //@line 13210
 STACKTOP = STACKTOP + 16 | 0; //@line 13211
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 13211
 if (!(_pthread_key_create(13624, 190) | 0)) {
  STACKTOP = sp; //@line 13216
  return;
 } else {
  _abort_message(8585, sp); //@line 13218
 }
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 12771
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 12775
  }
 }
 return;
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 6963
 HEAP32[new_frame + 4 >> 2] = sp; //@line 6965
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 6967
 ___async_cur_frame = new_frame; //@line 6968
 return ___async_cur_frame + 8 | 0; //@line 6969
}
function ___ofl_add($0) {
 $0 = $0 | 0;
 var $1 = 0, $4 = 0;
 $1 = ___ofl_lock() | 0; //@line 8367
 HEAP32[$0 + 56 >> 2] = HEAP32[$1 >> 2]; //@line 8370
 $4 = HEAP32[$1 >> 2] | 0; //@line 8371
 if ($4 | 0) {
  HEAP32[$4 + 52 >> 2] = $0; //@line 8375
 }
 HEAP32[$1 >> 2] = $0; //@line 8377
 ___ofl_unlock(); //@line 8378
 return $0 | 0; //@line 8379
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 14675
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 14679
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 14682
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 6952
  return low << bits; //@line 6953
 }
 tempRet0 = low << bits - 32; //@line 6955
 return 0; //@line 6956
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 6941
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 6942
 }
 tempRet0 = 0; //@line 6944
 return high >>> bits - 32 | 0; //@line 6945
}
function __ZN11TextDisplay5_putcEi__async_cb_72($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4757
 if ((HEAP32[___async_retval >> 2] | 0) <= (HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP16[HEAP32[$0 + 12 >> 2] >> 1] = 0; //@line 4764
 }
 HEAP32[___async_retval >> 2] = $4; //@line 4767
 return;
}
function __ZN11TextDisplay5_putcEi__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 4633
 if ((HEAP32[___async_retval >> 2] | 0) <= (HEAP32[$0 + 4 >> 2] | 0)) {
  HEAP16[HEAP32[$0 + 12 >> 2] >> 1] = 0; //@line 4640
 }
 HEAP32[___async_retval >> 2] = $4; //@line 4643
 return;
}
function _fflush__async_cb_47($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 3488
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 3490
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 3493
 return;
}
function __ZN6C128323clsEv($0) {
 $0 = $0 | 0;
 var $1 = 0;
 $1 = $0 + 68 | 0; //@line 605
 _memset($1 | 0, 0, 4096) | 0; //@line 606
 _emscripten_asm_const_iiiii(0, HEAP32[$0 + 4172 >> 2] | 0, HEAP32[$0 + 4176 >> 2] | 0, HEAP32[$0 + 4180 >> 2] | 0, $1 | 0) | 0; //@line 613
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
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 1770
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 1773
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 1776
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 1925
 } else {
  $$0 = -1; //@line 1927
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 1930
 return;
}
function __ZN4mbed6fdopenEPNS_10FileHandleEPKc__async_cb($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 6290
 if (HEAP32[___async_retval >> 2] | 0) {
  _setbuf($4, 0); //@line 6295
 }
 HEAP32[___async_retval >> 2] = $4; //@line 6298
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 8009
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 8015
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 8019
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 7](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 7225
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 6975
 stackRestore(___async_cur_frame | 0); //@line 6976
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 6977
}
function _fputc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 706
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 707
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 709
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 11438
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 11438
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 11440
 return $1 | 0; //@line 11441
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 3380
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 3386
 _emscripten_asm_const_iii(4, $0 | 0, $1 | 0) | 0; //@line 3387
 return;
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 7456
  $$0 = -1; //@line 7457
 } else {
  $$0 = $0; //@line 7459
 }
 return $$0 | 0; //@line 7461
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 6692
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 6693
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 6694
}
function __ZN6C128326heightEv($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 switch (HEAP32[$0 + 56 >> 2] | 0) {
 case 2:
 case 0:
  {
   $$0 = 128; //@line 690
   break;
  }
 default:
  {
   $$0 = 32; //@line 694
  }
 }
 return $$0 | 0; //@line 697
}
function __ZN6C128325widthEv($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 switch (HEAP32[$0 + 56 >> 2] | 0) {
 case 2:
 case 0:
  {
   $$0 = 32; //@line 673
   break;
  }
 default:
  {
   $$0 = 128; //@line 677
  }
 }
 return $$0 | 0; //@line 680
}
function _freopen__async_cb_30($0) {
 $0 = $0 | 0;
 var $4 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 2407
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile($4); //@line 2410
 }
 HEAP32[___async_retval >> 2] = $4; //@line 2413
 return;
}
function __ZN6C128327columnsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / (HEAPU8[(HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 48 >> 2] | 0) + 1 >> 0] | 0 | 0) | 0; //@line 4449
 return;
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 6684
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 6686
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 7](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 7218
}
function __ZN6C128324rowsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / (HEAPU8[(HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 48 >> 2] | 0) + 2 >> 0] | 0 | 0) | 0; //@line 1910
 return;
}
function ___clang_call_terminate($0) {
 $0 = $0 | 0;
 var sp = 0;
 sp = STACKTOP; //@line 816
 ___cxa_begin_catch($0 | 0) | 0; //@line 817
 _emscripten_alloc_async_context(4, sp) | 0; //@line 818
 __ZSt9terminatev(); //@line 819
}
function __ZN11TextDisplay5claimEP8_IO_FILE__async_cb($0) {
 $0 = $0 | 0;
 _setvbuf(HEAP32[$0 + 4 >> 2] | 0, 0, 1, HEAP32[___async_retval >> 2] | 0) | 0; //@line 6530
 HEAP8[___async_retval >> 0] = 1; //@line 6533
 return;
}
function __ZN6C1283211copy_to_lcdEv($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iiiii(0, HEAP32[$0 + 4172 >> 2] | 0, HEAP32[$0 + 4176 >> 2] | 0, HEAP32[$0 + 4180 >> 2] | 0, $0 + 68 | 0) | 0; //@line 833
 return;
}
function __ZN6C128326_flushEv($0) {
 $0 = $0 | 0;
 _emscripten_asm_const_iiiii(0, HEAP32[$0 + 4172 >> 2] | 0, HEAP32[$0 + 4176 >> 2] | 0, HEAP32[$0 + 4180 >> 2] | 0, $0 + 68 | 0) | 0; //@line 248
 return;
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 7](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 7211
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 10498
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 10501
 }
 return $$0 | 0; //@line 10503
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 8210
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 8215
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 15](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 7176
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 6921
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 14761
 return;
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 7711
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 7715
}
function __ZN11TextDisplay6locateEii($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 HEAP16[$0 + 24 >> 1] = $1; //@line 1890
 HEAP16[$0 + 26 >> 1] = $2; //@line 1893
 return;
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 6982
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 6983
}
function __ZN4mbed6Stream5writeEPKvj__async_cb_9($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[$0 + 4 >> 2] | 0) - (HEAP32[$0 + 8 >> 2] | 0); //@line 270
 return;
}
function __ZN6C128326locateEii($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 HEAP32[$0 + 60 >> 2] = $1; //@line 623
 HEAP32[$0 + 64 >> 2] = $2; //@line 625
 return;
}
function __ZN4mbed6Stream4readEPvj__async_cb_16($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[$0 + 4 >> 2] | 0) - (HEAP32[$0 + 8 >> 2] | 0); //@line 674
 return;
}
function dynCall_viii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 FUNCTION_TABLE_viii[index & 3](a1 | 0, a2 | 0, a3 | 0); //@line 7204
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN15GraphicsDisplay7columnsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / 8 | 0; //@line 14744
 return;
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 13310
 __ZdlPv($0); //@line 13311
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 12993
 __ZdlPv($0); //@line 12994
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 8145
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 8147
}
function __ZN15GraphicsDisplay4rowsEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) / 8 | 0; //@line 5432
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 12521
 __ZdlPv($0); //@line 12522
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 14710
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
  ___fwritex($1, $2, $0) | 0; //@line 9983
 }
 return;
}
function dynCall_iii(index, a1, a2) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 return FUNCTION_TABLE_iii[index & 7](a1 | 0, a2 | 0) | 0; //@line 7169
}
function b97(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(7); //@line 7493
}
function b96(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 7490
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 12718
}
function __ZSt15get_new_handlerv() {
 var $0 = 0;
 $0 = HEAP32[3407] | 0; //@line 14083
 HEAP32[3407] = $0 + 0; //@line 14085
 return $0 | 0; //@line 14087
}
function __ZN4mbed10FileHandle5lseekEii__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 690
 return;
}
function __ZN4mbed10FileHandle5fsyncEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 1786
 return;
}
function __ZSt13get_terminatev() {
 var $0 = 0;
 $0 = HEAP32[428] | 0; //@line 13300
 HEAP32[428] = $0 + 0; //@line 13302
 return $0 | 0; //@line 13304
}
function __ZN4mbed10FileHandle4tellEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 6433
 return;
}
function __ZN4mbed10FileHandle4flenEv__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 2435
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
 FUNCTION_TABLE_vii[index & 7](a1 | 0, a2 | 0); //@line 7197
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Stream6printfEPKcz__async_cb_25($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 12 >> 2]; //@line 2018
 return;
}
function __ZN4mbed10FileHandle4sizeEv__async_cb_23($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 1892
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 7009
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_73($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN6C1283211set_auto_upEj($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + 4168 >> 2] = ($1 | 0) != 0 & 1; //@line 853
 return;
}
function __ZN4mbed6Stream4putcEi__async_cb_11($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[$0 + 4 >> 2]; //@line 338
 return;
}
function b94(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(7); //@line 7487
}
function b93(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(6); //@line 7484
}
function b92(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(5); //@line 7481
}
function b91(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 7478
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 10446
}
function _fflush__async_cb_48($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 3503
 return;
}
function _vsprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 384
 return;
}
function _sprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 5030
 return;
}
function _fputc__async_cb_17($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 719
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 31](a1 | 0) | 0; //@line 7162
}
function __Znaj__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 14692
 return;
}
function __ZN11TextDisplay10foregroundEt($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP16[$0 + 28 >> 1] = $1; //@line 1902
 return;
}
function __ZN11TextDisplay10backgroundEt($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP16[$0 + 30 >> 1] = $1; //@line 1911
 return;
}
function b24(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(15); //@line 7292
 return 0; //@line 7292
}
function b23(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(14); //@line 7289
 return 0; //@line 7289
}
function b22(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(13); //@line 7286
 return 0; //@line 7286
}
function b21(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(12); //@line 7283
 return 0; //@line 7283
}
function b20(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(11); //@line 7280
 return 0; //@line 7280
}
function b19(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 7277
 return 0; //@line 7277
}
function __ZSt11__terminatePFvvE__async_cb($0) {
 $0 = $0 | 0;
 _abort_message(8688, HEAP32[$0 + 4 >> 2] | 0); //@line 2444
}
function _setbuf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 _setvbuf($0, $1, $1 | 0 ? 0 : 2, 1024) | 0; //@line 12091
 return;
}
function __ZN4mbed8FileBaseD0Ev__async_cb_69($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 4608
 return;
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 255](a1 | 0); //@line 7190
}
function b89(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(7); //@line 7475
}
function b88(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 7472
}
function __ZN6C128327setmodeEi($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 + 52 >> 2] = $1; //@line 842
 return;
}
function __ZThn4_N6C12832D0Ev__async_cb($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 4617
 return;
}
function __ZN4mbed26mbed_set_unbuffered_streamEP8_IO_FILE($0) {
 $0 = $0 | 0;
 _setbuf($0, 0); //@line 3538
 return;
}
function __ZN4mbed6Stream4seekEii($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return 0; //@line 2652
}
function __ZN6C12832D0Ev__async_cb($0) {
 $0 = $0 | 0;
 __ZdlPv(HEAP32[$0 + 4 >> 2] | 0); //@line 393
 return;
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 11691
}
function _freopen__async_cb_28($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 2379
 return;
}
function b17(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_iii(7); //@line 7274
 return 0; //@line 7274
}
function b16(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_iii(6); //@line 7271
 return 0; //@line 7271
}
function b15(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_iii(0); //@line 7268
 return 0; //@line 7268
}
function __ZN4mbed10FileHandle5sigioENS_8CallbackIFvvEEE($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = 0; //@line 2542
 return;
}
function b86(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_viii(3); //@line 7469
}
function b85(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_viii(0); //@line 7466
}
function __ZNK4mbed10FileHandle4pollEs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return 17; //@line 138
}
function __ZN4mbed10FileHandle12set_blockingEb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return -1;
}
function __ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 3](); //@line 7183
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 return;
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 7588
}
function b13(p0) {
 p0 = p0 | 0;
 nullFunc_ii(31); //@line 7265
 return 0; //@line 7265
}
function b12(p0) {
 p0 = p0 | 0;
 nullFunc_ii(30); //@line 7262
 return 0; //@line 7262
}
function b11(p0) {
 p0 = p0 | 0;
 nullFunc_ii(29); //@line 7259
 return 0; //@line 7259
}
function b10(p0) {
 p0 = p0 | 0;
 nullFunc_ii(28); //@line 7256
 return 0; //@line 7256
}
function __ZThn4_N15GraphicsDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 1503
}
function b9(p0) {
 p0 = p0 | 0;
 nullFunc_ii(27); //@line 7253
 return 0; //@line 7253
}
function b8(p0) {
 p0 = p0 | 0;
 nullFunc_ii(26); //@line 7250
 return 0; //@line 7250
}
function b7(p0) {
 p0 = p0 | 0;
 nullFunc_ii(25); //@line 7247
 return 0; //@line 7247
}
function b6(p0) {
 p0 = p0 | 0;
 nullFunc_ii(24); //@line 7244
 return 0; //@line 7244
}
function b5(p0) {
 p0 = p0 | 0;
 nullFunc_ii(23); //@line 7241
 return 0; //@line 7241
}
function b4(p0) {
 p0 = p0 | 0;
 nullFunc_ii(22); //@line 7238
 return 0; //@line 7238
}
function b3(p0) {
 p0 = p0 | 0;
 nullFunc_ii(21); //@line 7235
 return 0; //@line 7235
}
function b2(p0) {
 p0 = p0 | 0;
 nullFunc_ii(20); //@line 7232
 return 0; //@line 7232
}
function b1(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 7229
 return 0; //@line 7229
}
function __ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZThn4_N11TextDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 1935
}
function __ZN4mbed10FileHandle6isattyEv($0) {
 $0 = $0 | 0;
 return 0; //@line 2302
}
function __ZN15GraphicsDisplay9characterEiii__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___ofl_lock() {
 ___lock(13608); //@line 8384
 return 13616; //@line 8385
}
function __ZThn4_N4mbed6StreamD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 2727
}
function __ZN4mbed11NonCopyableINS_10FileHandleEED2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed10FileHandleD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 2289
}
function __ZN15GraphicsDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 1019
}
function b83(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(7); //@line 7463
}
function b82(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(6); //@line 7460
}
function b81(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(5); //@line 7457
}
function b80(p0, p1) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 nullFunc_vii(0); //@line 7454
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
 return 0; //@line 2296
}
function _abort_message__async_cb_6($0) {
 $0 = $0 | 0;
 _abort(); //@line 14733
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
 ___cxa_pure_virtual(); //@line 7298
}
function __ZThn4_N15GraphicsDisplayD1Ev__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Stream6isattyEv($0) {
 $0 = $0 | 0;
 return 0; //@line 2670
}
function __ZN4mbed10FileHandle6rewindEv__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN11TextDisplayD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 1547
}
function __ZN4mbed6StreamD0Ev($0) {
 $0 = $0 | 0;
 _llvm_trap(); //@line 2441
}
function __ZN4mbed6Stream5closeEv($0) {
 $0 = $0 | 0;
 return 0; //@line 2658
}
function __ZN15GraphicsDisplay3clsEv__async_cb_3($0) {
 $0 = $0 | 0;
 return;
}
function _mbed_error_vfprintf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return;
}
function __ZThn4_N4mbed6StreamD1Ev__async_cb_13($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Stream4tellEv($0) {
 $0 = $0 | 0;
 return 0; //@line 2676
}
function __ZN4mbed6Stream4syncEv($0) {
 $0 = $0 | 0;
 return 0; //@line 2664
}
function __ZN4mbed6Stream4sizeEv($0) {
 $0 = $0 | 0;
 return 0; //@line 2688
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 11612
}
function __ZN15GraphicsDisplayC2EPKc__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 11618
}
function ___pthread_self_699() {
 return _pthread_self() | 0; //@line 7795
}
function __ZThn4_N11TextDisplayD1Ev__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed8FileBaseD2Ev__async_cb_75($0) {
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
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 12347
 return;
}
function __ZN4mbed6StreamD2Ev__async_cb_67($0) {
 $0 = $0 | 0;
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
 ___unlock(13608); //@line 8390
 return;
}
function __ZN11TextDisplay5_getcEv($0) {
 $0 = $0 | 0;
 return -1;
}
function b78(p0) {
 p0 = p0 | 0;
 nullFunc_vi(255); //@line 7451
}
function b77(p0) {
 p0 = p0 | 0;
 nullFunc_vi(254); //@line 7448
}
function b76(p0) {
 p0 = p0 | 0;
 nullFunc_vi(253); //@line 7445
}
function b75(p0) {
 p0 = p0 | 0;
 nullFunc_vi(252); //@line 7442
}
function b74(p0) {
 p0 = p0 | 0;
 nullFunc_vi(251); //@line 7439
}
function b73(p0) {
 p0 = p0 | 0;
 nullFunc_vi(250); //@line 7436
}
function b72(p0) {
 p0 = p0 | 0;
 nullFunc_vi(249); //@line 7433
}
function b71(p0) {
 p0 = p0 | 0;
 nullFunc_vi(248); //@line 7430
}
function b70(p0) {
 p0 = p0 | 0;
 nullFunc_vi(247); //@line 7427
}
function b69(p0) {
 p0 = p0 | 0;
 nullFunc_vi(246); //@line 7424
}
function b68(p0) {
 p0 = p0 | 0;
 nullFunc_vi(245); //@line 7421
}
function b67(p0) {
 p0 = p0 | 0;
 nullFunc_vi(244); //@line 7418
}
function b66(p0) {
 p0 = p0 | 0;
 nullFunc_vi(243); //@line 7415
}
function b65(p0) {
 p0 = p0 | 0;
 nullFunc_vi(242); //@line 7412
}
function b64(p0) {
 p0 = p0 | 0;
 nullFunc_vi(241); //@line 7409
}
function b63(p0) {
 p0 = p0 | 0;
 nullFunc_vi(240); //@line 7406
}
function b62(p0) {
 p0 = p0 | 0;
 nullFunc_vi(239); //@line 7403
}
function b61(p0) {
 p0 = p0 | 0;
 nullFunc_vi(238); //@line 7400
}
function b60(p0) {
 p0 = p0 | 0;
 nullFunc_vi(237); //@line 7397
}
function b59(p0) {
 p0 = p0 | 0;
 nullFunc_vi(236); //@line 7394
}
function b58(p0) {
 p0 = p0 | 0;
 nullFunc_vi(235); //@line 7391
}
function b57(p0) {
 p0 = p0 | 0;
 nullFunc_vi(234); //@line 7388
}
function b56(p0) {
 p0 = p0 | 0;
 nullFunc_vi(233); //@line 7385
}
function b55(p0) {
 p0 = p0 | 0;
 nullFunc_vi(232); //@line 7382
}
function b54(p0) {
 p0 = p0 | 0;
 nullFunc_vi(231); //@line 7379
}
function b53(p0) {
 p0 = p0 | 0;
 nullFunc_vi(230); //@line 7376
}
function b52(p0) {
 p0 = p0 | 0;
 nullFunc_vi(229); //@line 7373
}
function b51(p0) {
 p0 = p0 | 0;
 nullFunc_vi(228); //@line 7370
}
function b50(p0) {
 p0 = p0 | 0;
 nullFunc_vi(227); //@line 7367
}
function b49(p0) {
 p0 = p0 | 0;
 nullFunc_vi(226); //@line 7364
}
function b48(p0) {
 p0 = p0 | 0;
 nullFunc_vi(225); //@line 7361
}
function b47(p0) {
 p0 = p0 | 0;
 nullFunc_vi(224); //@line 7358
}
function b46(p0) {
 p0 = p0 | 0;
 nullFunc_vi(223); //@line 7355
}
function b45(p0) {
 p0 = p0 | 0;
 nullFunc_vi(222); //@line 7352
}
function b44(p0) {
 p0 = p0 | 0;
 nullFunc_vi(221); //@line 7349
}
function b43(p0) {
 p0 = p0 | 0;
 nullFunc_vi(220); //@line 7346
}
function b42(p0) {
 p0 = p0 | 0;
 nullFunc_vi(219); //@line 7343
}
function b41(p0) {
 p0 = p0 | 0;
 nullFunc_vi(218); //@line 7340
}
function b40(p0) {
 p0 = p0 | 0;
 nullFunc_vi(217); //@line 7337
}
function b39(p0) {
 p0 = p0 | 0;
 nullFunc_vi(216); //@line 7334
}
function b38(p0) {
 p0 = p0 | 0;
 nullFunc_vi(215); //@line 7331
}
function b37(p0) {
 p0 = p0 | 0;
 nullFunc_vi(214); //@line 7328
}
function b36(p0) {
 p0 = p0 | 0;
 nullFunc_vi(213); //@line 7325
}
function b35(p0) {
 p0 = p0 | 0;
 nullFunc_vi(212); //@line 7322
}
function b34(p0) {
 p0 = p0 | 0;
 nullFunc_vi(211); //@line 7319
}
function b33(p0) {
 p0 = p0 | 0;
 nullFunc_vi(210); //@line 7316
}
function b32(p0) {
 p0 = p0 | 0;
 nullFunc_vi(209); //@line 7313
}
function b31(p0) {
 p0 = p0 | 0;
 nullFunc_vi(208); //@line 7310
}
function b30(p0) {
 p0 = p0 | 0;
 nullFunc_vi(207); //@line 7307
}
function b29(p0) {
 p0 = p0 | 0;
 nullFunc_vi(206); //@line 7304
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 7472
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 7801
}
function __ZN4mbed6Stream6unlockEv($0) {
 $0 = $0 | 0;
 return;
}
function __ZN4mbed6Stream6rewindEv($0) {
 $0 = $0 | 0;
 return;
}
function b28(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 7301
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___clang_call_terminate__async_cb($0) {
 $0 = $0 | 0;
}
function __ZN4mbed6Stream4lockEv($0) {
 $0 = $0 | 0;
 return;
}
function _exit__async_cb($0) {
 $0 = $0 | 0;
 while (1) {}
}
function ___errno_location() {
 return 13604; //@line 7466
}
function __ZSt9terminatev__async_cb_31($0) {
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
function _wait__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _pthread_self() {
 return 1344; //@line 7593
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 26
}
function b26() {
 nullFunc_v(0); //@line 7295
}
function _error__async_cb($0) {
 $0 = $0 | 0;
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_ii = [b1,__ZN4mbed6Stream5closeEv,__ZN4mbed6Stream4syncEv,__ZN4mbed6Stream6isattyEv,__ZN4mbed6Stream4tellEv,__ZN4mbed6Stream4sizeEv,__ZN4mbed10FileHandle5fsyncEv,__ZN4mbed10FileHandle4flenEv,__ZN11TextDisplay5_getcEv,__ZN6C128324rowsEv,__ZN6C128327columnsEv,__ZN6C128325widthEv,__ZN6C128326heightEv,__ZN15GraphicsDisplay4rowsEv,__ZN15GraphicsDisplay7columnsEv,__ZN4mbed10FileHandle4syncEv,__ZN4mbed10FileHandle6isattyEv,__ZN4mbed10FileHandle4tellEv,__ZN4mbed10FileHandle4sizeEv,___stdio_close,b2,b3,b4,b5,b6,b7,b8,b9,b10
,b11,b12,b13];
var FUNCTION_TABLE_iii = [b15,__ZN4mbed10FileHandle12set_blockingEb,__ZNK4mbed10FileHandle4pollEs,__ZN6C128325_putcEi,__ZN11TextDisplay5claimEP8_IO_FILE,__ZN11TextDisplay5_putcEi,b16,b17];
var FUNCTION_TABLE_iiii = [b19,__ZN4mbed6Stream4readEPvj,__ZN4mbed6Stream5writeEPKvj,__ZN4mbed6Stream4seekEii,__ZN4mbed10FileHandle5lseekEii,___stdio_write,___stdio_seek,___stdout_write,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,___stdio_read,b20,b21,b22,b23,b24];
var FUNCTION_TABLE_v = [b26,___cxa_pure_virtual__wrapper,__ZL25default_terminate_handlerv,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev];
var FUNCTION_TABLE_vi = [b28,__ZN4mbed6StreamD2Ev,__ZN6C12832D0Ev,__ZN4mbed6Stream6rewindEv,__ZN6C128326_flushEv,__ZN4mbed6Stream4lockEv,__ZN4mbed6Stream6unlockEv,__ZN6C128323clsEv,__ZThn4_N6C12832D1Ev,__ZThn4_N6C12832D0Ev,__ZN15GraphicsDisplayD0Ev,__ZN15GraphicsDisplay3clsEv,__ZThn4_N15GraphicsDisplayD1Ev,__ZThn4_N15GraphicsDisplayD0Ev,__ZN11TextDisplayD0Ev,__ZN11TextDisplay3clsEv,__ZThn4_N11TextDisplayD1Ev,__ZThn4_N11TextDisplayD0Ev,__ZN4mbed8FileBaseD2Ev,__ZN4mbed8FileBaseD0Ev,__ZN4mbed11NonCopyableINS_10FileHandleEED2Ev,__ZN4mbed10FileHandleD0Ev,__ZN4mbed10FileHandle6rewindEv,__ZN4mbed6StreamD0Ev,__ZThn4_N4mbed6StreamD1Ev,__ZThn4_N4mbed6StreamD0Ev,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev
,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN6C12832D0Ev__async_cb,__ZN4mbed10FileHandle5lseekEii__async_cb,__ZN4mbed10FileHandle5fsyncEv__async_cb,__ZN4mbed10FileHandle4flenEv__async_cb,__ZN6C128325_putcEi__async_cb,__ZN6C128325_putcEi__async_cb_90,__ZN6C128329characterEiii__async_cb,__ZN6C128329characterEiii__async_cb_18,__ZN6C128329characterEiii__async_cb_19,__ZN6C128329characterEiii__async_cb_20,__ZN6C128324rowsEv__async_cb,__ZN6C128327columnsEv__async_cb,__ZThn4_N6C12832D1Ev__async_cb,__ZThn4_N6C12832D0Ev__async_cb,__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb_91,__ZN6C12832C2E7PinNameS0_S0_S0_S0_PKc__async_cb,__ZN6C128328print_bmE6Bitmapii__async_cb,__ZN6C128328print_bmE6Bitmapii__async_cb_65,__ZN15GraphicsDisplay9characterEiii__async_cb,__ZN15GraphicsDisplay4rowsEv__async_cb,__ZN15GraphicsDisplay7columnsEv__async_cb,__ZN15GraphicsDisplay3clsEv__async_cb,__ZN15GraphicsDisplay3clsEv__async_cb_2,__ZN15GraphicsDisplay3clsEv__async_cb_3,__ZN15GraphicsDisplay4putpEi__async_cb,__ZN15GraphicsDisplay4fillEiiiii__async_cb,__ZN15GraphicsDisplay4fillEiiiii__async_cb_32
,__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb,__ZN15GraphicsDisplay4blitEiiiiPKi__async_cb_95,__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb,__ZN15GraphicsDisplay7blitbitEiiiiPKc__async_cb_79,__ZThn4_N15GraphicsDisplayD1Ev__async_cb,__ZN15GraphicsDisplayC2EPKc__async_cb_21,__ZN15GraphicsDisplayC2EPKc__async_cb,__ZN11TextDisplay5_putcEi__async_cb,__ZN11TextDisplay5_putcEi__async_cb_70,__ZN11TextDisplay5_putcEi__async_cb_71,__ZN11TextDisplay5_putcEi__async_cb_72,__ZN11TextDisplay5claimEP8_IO_FILE__async_cb_94,__ZN11TextDisplay5claimEP8_IO_FILE__async_cb,__ZN11TextDisplay3clsEv__async_cb,__ZN11TextDisplay3clsEv__async_cb_80,__ZN11TextDisplay3clsEv__async_cb_81,__ZN11TextDisplay3clsEv__async_cb_84,__ZN11TextDisplay3clsEv__async_cb_82,__ZN11TextDisplay3clsEv__async_cb_83,__ZThn4_N11TextDisplayD1Ev__async_cb,__ZN11TextDisplayC2EPKc__async_cb_78,__ZN11TextDisplayC2EPKc__async_cb,__ZN4mbed8FileBaseD2Ev__async_cb_74,__ZN4mbed8FileBaseD2Ev__async_cb,__ZN4mbed8FileBaseD2Ev__async_cb_75,__ZN4mbed8FileBaseD0Ev__async_cb_68,__ZN4mbed8FileBaseD0Ev__async_cb,__ZN4mbed8FileBaseD0Ev__async_cb_69,__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb_14,__ZN4mbed8FileBaseC2EPKcNS_8PathTypeE__async_cb
,__ZN4mbed10FileHandle4tellEv__async_cb,__ZN4mbed10FileHandle6rewindEv__async_cb,__ZN4mbed10FileHandle4sizeEv__async_cb,__ZN4mbed10FileHandle4sizeEv__async_cb_22,__ZN4mbed10FileHandle4sizeEv__async_cb_23,__ZN4mbed6StreamD2Ev__async_cb,__ZN4mbed6StreamD2Ev__async_cb_67,__ZN4mbed6Stream4readEPvj__async_cb,__ZN4mbed6Stream4readEPvj__async_cb_15,__ZN4mbed6Stream4readEPvj__async_cb_16,__ZN4mbed6Stream5writeEPKvj__async_cb,__ZN4mbed6Stream5writeEPKvj__async_cb_8,__ZN4mbed6Stream5writeEPKvj__async_cb_9,__ZThn4_N4mbed6StreamD1Ev__async_cb,__ZThn4_N4mbed6StreamD1Ev__async_cb_13,__ZN4mbed6StreamC2EPKc__async_cb_5,__ZN4mbed6StreamC2EPKc__async_cb,__ZN4mbed6Stream4putcEi__async_cb,__ZN4mbed6Stream4putcEi__async_cb_12,__ZN4mbed6Stream4putcEi__async_cb_10,__ZN4mbed6Stream4putcEi__async_cb_11,__ZN4mbed6Stream6printfEPKcz__async_cb,__ZN4mbed6Stream6printfEPKcz__async_cb_27,__ZN4mbed6Stream6printfEPKcz__async_cb_24,__ZN4mbed6Stream6printfEPKcz__async_cb_25,__ZN4mbed6Stream6printfEPKcz__async_cb_26,_mbed_assert_internal__async_cb,_mbed_die__async_cb_64,_mbed_die__async_cb_63,_mbed_die__async_cb_62
,_mbed_die__async_cb_61,_mbed_die__async_cb_60,_mbed_die__async_cb_59,_mbed_die__async_cb_58,_mbed_die__async_cb_57,_mbed_die__async_cb_56,_mbed_die__async_cb_55,_mbed_die__async_cb_54,_mbed_die__async_cb_53,_mbed_die__async_cb_52,_mbed_die__async_cb_51,_mbed_die__async_cb_50,_mbed_die__async_cb,_invoke_ticker__async_cb_92,_invoke_ticker__async_cb,__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb_85,__ZN4mbed17remove_filehandleEPNS_10FileHandleE__async_cb,_exit__async_cb,__ZN4mbed6fdopenEPNS_10FileHandleEPKc__async_cb,_wait__async_cb,_wait_ms__async_cb,__GLOBAL__sub_I_main_cpp__async_cb,_main__async_cb_34,_main__async_cb_33,_main__async_cb_42,_main__async_cb_41,_main__async_cb_46,_main__async_cb_40,_main__async_cb_39,_main__async_cb_45
,_main__async_cb_38,_main__async_cb_37,_main__async_cb_44,_main__async_cb_36,_main__async_cb_35,_main__async_cb_43,_main__async_cb,___overflow__async_cb,_fclose__async_cb_66,_fclose__async_cb,_fflush__async_cb_48,_fflush__async_cb_47,_fflush__async_cb_49,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_93,_vfprintf__async_cb,_vsnprintf__async_cb,_sprintf__async_cb,_vsprintf__async_cb,_freopen__async_cb,_freopen__async_cb_30,_freopen__async_cb_29,_freopen__async_cb_28,_fputc__async_cb_17,_fputc__async_cb,_puts__async_cb,__Znwj__async_cb,__Znaj__async_cb,__ZL25default_terminate_handlerv__async_cb
,__ZL25default_terminate_handlerv__async_cb_76,_abort_message__async_cb,_abort_message__async_cb_6,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_4,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_7,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_73,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,__ZSt11__terminatePFvvE__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb_1,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_89,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_88,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_87,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_86,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb_77,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b29,b30,b31
,b32,b33,b34,b35,b36,b37,b38,b39,b40,b41,b42,b43,b44,b45,b46,b47,b48,b49,b50,b51,b52,b53,b54,b55,b56,b57,b58,b59,b60,b61
,b62,b63,b64,b65,b66,b67,b68,b69,b70,b71,b72,b73,b74,b75,b76,b77,b78];
var FUNCTION_TABLE_vii = [b80,__ZN4mbed10FileHandle5sigioENS_8CallbackIFvvEEE,__ZN11TextDisplay10foregroundEt,__ZN11TextDisplay10backgroundEt,__ZN15GraphicsDisplay4putpEi,b81,b82,b83];
var FUNCTION_TABLE_viii = [b85,__ZN6C128326locateEii,__ZN11TextDisplay6locateEii,b86];
var FUNCTION_TABLE_viiii = [b88,__ZN6C128329characterEiii,__ZN6C128325pixelEiii,__ZN15GraphicsDisplay9characterEiii,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b89];
var FUNCTION_TABLE_viiiii = [b91,__ZN15GraphicsDisplay6windowEiiii,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b92,b93,b94];
var FUNCTION_TABLE_viiiiii = [b96,__ZN15GraphicsDisplay4fillEiiiii,__ZN15GraphicsDisplay4blitEiiiiPKi,__ZN15GraphicsDisplay7blitbitEiiiiPKc,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b97];

  return { __GLOBAL__sub_I_main_cpp: __GLOBAL__sub_I_main_cpp, ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _fflush: _fflush, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _invoke_ticker: _invoke_ticker, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_ii: dynCall_ii, dynCall_iii: dynCall_iii, dynCall_iiii: dynCall_iiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_viii: dynCall_viii, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
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